'use strict';

// Relecture d'actes par l'API Mistral (Outil 2) — demandé par l'étude le 27/09/2026 : « passe à
// Mistral pour l'analyse des actes au lieu de Claude », pour que l'analyse soit faite par un
// fournisseur européen, sur le point d'accès RÉGIONAL de l'Union européenne (api.eu.mistral.ai :
// l'inférence est exécutée dans des centres de données de l'UE/AELE, avec une majoration de 10 %).
//
// Le reste de la chaîne est INCHANGÉ et partagé avec Claude (relecture/claude.js) : même grille,
// même prompt, même schéma de sortie, même vérification littérale des citations. Seul l'appel
// réseau change. Pas de dépendance npm : un simple fetch, comme llm.js pour Ollama.
//
// Faits vérifiés sur docs.mistral.ai le 27/09/2026 (à revoir si Mistral change son offre) :
//   - mistral-medium-3-5 (Mistral Medium 3.5) : 256 000 jetons de contexte, 1,5 $ / 7,5 $ par
//     million de jetons, raisonnement réglable (reasoning_effort) ;
//   - mistral-large-2512 (Mistral Large 3) : 256 000 jetons, 0,5 $ / 1,5 $, pas de raisonnement ;
//   - sortie structurée : response_format { type: 'json_schema', json_schema: { name, schema, strict } } ;
//   - rétention zéro (ZDR) sur /v1/chat/completions, sur demande à Mistral pour une offre payante.

const MODELES_MISTRAL = ['mistral-medium-3-5', 'mistral-large-2512'];
const MODELE_MISTRAL_PAR_DEFAUT = 'mistral-medium-3-5';
const MODELES_AVEC_RAISONNEMENT = new Set(['mistral-medium-3-5']);

const BASES_MISTRAL = { eu: 'https://api.eu.mistral.ai', global: 'https://api.mistral.ai' };
const REGIONS_MISTRAL = Object.keys(BASES_MISTRAL);
// Inférence régionale facturée 1,1 fois le tarif public (entrée comme sortie).
const MAJORATION_REGION = { eu: 1.1, global: 1 };

const TARIFS_MISTRAL_USD_PAR_MILLION = {
  'mistral-medium-3-5': { entree: 1.5, sortie: 7.5 },
  'mistral-large-2512': { entree: 0.5, sortie: 1.5 }
};

// Contexte de 256 000 jetons, quatre fois moins que Claude : c'est la vraie limite d'un dossier
// avec ses annexes. On réserve la sortie (fiche complète + raisonnement) et une marge.
const CONTEXTE_MISTRAL_JETONS = 256000;
const MAX_JETONS_SORTIE_MISTRAL = 40000;
const LIMITE_JETONS_ENTREE_MISTRAL = CONTEXTE_MISTRAL_JETONS - MAX_JETONS_SORTIE_MISTRAL - 4000;

// Mistral n'offre pas de comptage de jetons gratuit par l'API : l'entrée est ESTIMÉE sur la
// longueur du texte. 3,2 caractères par jeton est volontairement pessimiste pour du français
// juridique truffé de jetons ⟦…⟧ : mieux vaut annoncer un dossier trop gros qu'échouer après envoi.
const CARACTERES_PAR_JETON = 3.2;
const SORTIE_ESTIMEE = { basse: 8000, haute: 25000 };

function estimerJetonsMistral(...textes) {
  const n = textes.reduce((s, t) => s + (typeof t === 'string' ? t.length : 0), 0);
  return Math.ceil(n / CARACTERES_PAR_JETON);
}

function tarif(modele, region) {
  const t = TARIFS_MISTRAL_USD_PAR_MILLION[modele];
  if (!t) return null;
  const m = MAJORATION_REGION[region] || 1;
  return { entree: t.entree * m, sortie: t.sortie * m };
}

function calculerCoutMistralUsd(usage, modele, region) {
  const t = tarif(modele, region);
  const u = usage || {};
  const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  if (!t) return null;
  const cout = (n(u.prompt_tokens) * t.entree + n(u.completion_tokens) * t.sortie) / 1e6;
  return Math.round(cout * 10000) / 10000;
}

function estimerCoutMistralUsd(jetonsEntree, modele, region) {
  const t = tarif(modele, region);
  if (!t || !Number.isFinite(jetonsEntree)) return null;
  const base = jetonsEntree * t.entree / 1e6;
  const arrondi = (v) => Math.round(v * 100) / 100;
  return {
    bas: arrondi(base + SORTIE_ESTIMEE.basse * t.sortie / 1e6),
    haut: arrondi(base + SORTIE_ESTIMEE.haute * t.sortie / 1e6)
  };
}

function baseMistral(region) {
  return BASES_MISTRAL[region] || BASES_MISTRAL.eu;
}

function construireCorpsMistral({ modele, system, contenu, schema, raisonnement }) {
  const corps = {
    model: modele,
    stream: true,
    max_tokens: MAX_JETONS_SORTIE_MISTRAL,
    // Relecture factuelle : peu de variation d'une analyse à l'autre sur le même acte.
    temperature: 0.2,
    response_format: { type: 'json_schema', json_schema: { name: 'fiche_relecture', schema, strict: true } },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: contenu }
    ]
  };
  if (raisonnement && MODELES_AVEC_RAISONNEMENT.has(modele)) corps.reasoning_effort = 'high';
  return corps;
}

// Seul le TEXTE de la réponse est gardé : la trace de raisonnement (chunks « thinking ») n'a rien
// à faire dans la fiche. Un delta est soit une chaîne, soit une liste de chunks typés.
function texteDepuisDelta(contenu) {
  if (typeof contenu === 'string') return contenu;
  if (!Array.isArray(contenu)) return '';
  return contenu.map(c => (c && c.type === 'text' && typeof c.text === 'string' ? c.text : '')).join('');
}

// Lit un flux SSE de chat/completions : lignes « data: {…} », terminé par « data: [DONE] ».
// La consommation (usage) arrive dans le dernier chunk.
async function lireFluxMistral(corpsReponse) {
  const decodeur = new TextDecoder();
  let tampon = '';
  let texte = '';
  let usage = null;
  let modele = null;
  let finishReason = null;
  const traiterLigne = (ligne) => {
    const l = ligne.trim();
    if (!l.startsWith('data:')) return;
    const donnees = l.slice(5).trim();
    if (!donnees || donnees === '[DONE]') return;
    let evt;
    try { evt = JSON.parse(donnees); } catch (_) { return; }
    if (evt.model) modele = evt.model;
    if (evt.usage) usage = evt.usage;
    const choix = Array.isArray(evt.choices) ? evt.choices[0] : null;
    if (choix) {
      if (choix.delta) texte += texteDepuisDelta(choix.delta.content);
      if (choix.finish_reason) finishReason = choix.finish_reason;
    }
  };
  for await (const morceau of corpsReponse) {
    tampon += decodeur.decode(morceau, { stream: true });
    let i;
    while ((i = tampon.indexOf('\n')) >= 0) {
      traiterLigne(tampon.slice(0, i));
      tampon = tampon.slice(i + 1);
    }
  }
  tampon += decodeur.decode();
  if (tampon) traiterLigne(tampon);
  return { texte, usage: usage || {}, modele, finishReason };
}

function erreurHttp(statut, message) {
  const e = new Error(message || `HTTP ${statut}`);
  e.status = statut;
  return e;
}

// Un appel complet. En flux : les en-têtes arrivent tout de suite, ce qui évite le délai d'attente
// d'en-têtes de fetch (5 minutes) sur une longue analyse. Si le point d'accès refuse le paramètre
// de raisonnement avec le format structuré (400/422), on relance UNE fois sans : une requête
// refusée n'est pas facturée.
async function appelerMistral({ cle, modele, region, system, contenu, schema, fetchFn, delaiMs }) {
  const f = fetchFn || fetch;
  const url = `${baseMistral(region)}/v1/chat/completions`;
  const essayer = async (raisonnement) => {
    const r = await f(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(construireCorpsMistral({ modele, system, contenu, schema, raisonnement })),
      signal: AbortSignal.timeout(delaiMs || 15 * 60 * 1000)
    });
    if (!r.ok) {
      // Seuls le type et le code d'erreur de Mistral sont gardés : un corps d'erreur peut reprendre un morceau de la requête
      // (texte pseudonymisé de l'acte), qui finirait au journal (relecture 12/10).
      let detail = '';
      try {
        const j = JSON.parse(await r.text());
        detail = [j && j.type, j && j.code].filter(x => typeof x === 'string' || typeof x === 'number').map(String).join(' ').slice(0, 80);
      } catch (_) { /* rien */ }
      throw erreurHttp(r.status, detail ? `HTTP ${r.status} (${detail})` : '');
    }
    return lireFluxMistral(r.body);
  };
  try {
    return await essayer(true);
  } catch (err) {
    if (MODELES_AVEC_RAISONNEMENT.has(modele) && (err.status === 400 || err.status === 422)) return essayer(false);
    throw err;
  }
}

// Vérifie la clé et l'accès au modèle sans rien facturer (lecture de la fiche du modèle).
async function testerMistral({ cle, modele, region, fetchFn }) {
  const f = fetchFn || fetch;
  const r = await f(`${baseMistral(region)}/v1/models/${encodeURIComponent(modele)}`, {
    headers: { Authorization: `Bearer ${cle}` },
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) throw erreurHttp(r.status);
  const m = await r.json().catch(() => ({}));
  return { id: m.id || modele, libelle: m.name || m.id || modele };
}

function messageErreurMistral(err) {
  const statut = err && err.status;
  if (statut === 401) return 'Clé API refusée par Mistral : vérifiez-la dans les Réglages.';
  if (statut === 403) return "Cette clé API Mistral n'a pas accès au modèle choisi.";
  if (statut === 404) return "Modèle introuvable sur ce point d'accès Mistral (il n'est peut-être pas disponible dans la région choisie).";
  if (statut === 429) return 'Limite de débit atteinte chez Mistral : réessayez dans une minute.';
  if (statut === 400 || statut === 422) return 'Requête refusée par Mistral (document trop volumineux ou format inattendu).';
  if (statut >= 500) return 'Service de Mistral momentanément indisponible : réessayez.';
  if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) return "L'analyse a dépassé 15 minutes sans se terminer : retirez des annexes et relancez.";
  return "Impossible de joindre l'API de Mistral depuis le serveur (connexion internet du poste serveur ?).";
}

module.exports = {
  MODELES_MISTRAL, MODELE_MISTRAL_PAR_DEFAUT, REGIONS_MISTRAL, TARIFS_MISTRAL_USD_PAR_MILLION,
  LIMITE_JETONS_ENTREE_MISTRAL, MAX_JETONS_SORTIE_MISTRAL,
  estimerJetonsMistral, calculerCoutMistralUsd, estimerCoutMistralUsd,
  construireCorpsMistral, texteDepuisDelta, lireFluxMistral, appelerMistral, testerMistral,
  messageErreurMistral, baseMistral
};
