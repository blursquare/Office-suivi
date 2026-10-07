// @ts-check
'use strict';
// « Demander à CLAIRE » par l'API Mistral (étude 07/10 : « ok, on essaie », après le chiffrage — quelques dizaines de centimes
// par mois avec Mistral Small). Seule la PHRASE part, noms masqués avant l'envoi : noms, prénoms, noms d'usage, mots de l'adresse,
// de l'agence et des notaires des fiches, mots en capitales, mot qui suit une civilité, emails, téléphones et références Authentic
// sont remplacés par [NOM1], [EMAIL1]… (`pseudonymiserDemande`) ; la table de correspondance reste sur le serveur et les valeurs que
// l'IA recopie sont rétablies avant d'être relues par le code (`retablirTexte`). Aucune donnée de fiche dans le prompt.
// Même interface que le client Ollama (`verifierDisponibilite`, `genererJson`) : comprendreDemande ne voit pas la différence.

const A = require('../../commun/assistant');

const MODELE_ASSISTANT_MISTRAL = 'mistral-small-latest';
// Tarif de Mistral Small (début octobre 2026), en dollars par million de jetons, majoration de l'inférence dans l'UE comprise.
const TARIF_ASSISTANT_MISTRAL = { entree: 0.15, sortie: 0.6 };
const MAJORATION_UE = 1.1;
const DELAI_MISTRAL_MS = 20 * 1000;
const CLE_USAGE = 'assistant-ia-usage';
const CLE_REGLAGES = 'assistant-ia';
const MOTEURS = ['mistral', 'locale'];
const BASES = { eu: 'https://api.eu.mistral.ai', global: 'https://api.mistral.ai' };

// Sigles du métier gardés tels quels (ils disent l'intention, pas une personne).
const SIGLES = new Set(['VTE', 'SUCC', 'RIB', 'SAFER', 'DPU', 'DIA', 'PDF', 'TVA', 'TTC', 'HT', 'AF', 'NAS', 'CLAIRE', 'IA', 'EUR',
  'OK', 'RDV', 'SCI', 'SARL', 'PLU', 'CU', 'DPE', 'RHF', 'AAE', 'ECV', 'APR', 'JV', 'BA', 'JS', 'PJ', 'CDC']);

/**
 * Réglages de l'assistant : moteur 'mistral' (par défaut, choix de l'étude 07/10) ou 'locale' ; `toutesDemandes` (étude 07/10,
 * « active Mistral de base pour voir ») : Mistral lit TOUTES les phrases, pas seulement celles que les mots-clés ne départagent
 * pas — vrai par défaut pendant l'essai, sans effet avec l'IA locale (trop lente sur le processeur du serveur). @param {any} brut
 */
function assainirReglagesAssistant(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  return { moteur: MOTEURS.includes(b.moteur) ? b.moteur : 'mistral', toutesDemandes: b.toutesDemandes !== false };
}

/**
 * Masque dans une phrase tout ce qui peut désigner une personne ou un dossier. `table` (Map jeton → texte d'origine) est complétée
 * et partagée entre la phrase, le libellé du dossier en consultation et les échanges précédents. Pure.
 * @param {string} texte @param {Set<string>} sensibles mots normalisés à masquer @param {Map<string, string>} table
 */
function masquer(texte, sensibles, table) {
  const parOrigine = new Map([...table].map(([jeton, origine]) => [origine.toLowerCase(), jeton]));
  const compteur = (prefixe) => [...table.keys()].filter((k) => k.startsWith('[' + prefixe)).length + 1;
  const jeton = (prefixe, origine) => {
    const deja = parOrigine.get(origine.toLowerCase());
    if (deja) return deja;
    const j = `[${prefixe}${compteur(prefixe)}]`;
    table.set(j, origine);
    parOrigine.set(origine.toLowerCase(), j);
    return j;
  };
  let t = String(texte || '');
  t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => jeton('EMAIL', m));
  t = t.replace(/(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g, (m) => jeton('TEL', m));
  t = t.replace(/\b[A-Z]\s?\d{4}\s?\d{4,6}\b/g, (m) => jeton('REF', m));
  t = t.replace(/\d{6,}/g, (m) => jeton('NUM', m));
  // Le mot qui suit une civilité est toujours un nom.
  t = t.replace(/\b(Monsieur|Madame|Mademoiselle|Messieurs|Mesdames|Maître|Me|Mme|Mlle|Mr|M\.)(\s+)([A-Za-zÀ-ÿ'-]{2,})/g,
    (m, civ, esp, nom) => /^\[/.test(nom) ? m : civ + esp + jeton('NOM', nom));
  t = t.replace(/\[(?:NOM|EMAIL|TEL|REF|NUM)\d+\]|[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*/g, (mot) => {
    if (mot.startsWith('[')) return mot;
    const n = A.normaliserDemande(mot).replace(/^[^a-z]+|[^a-z]+$/g, '');
    const capitales = mot.length >= 3 && mot === mot.toUpperCase() && /[A-Z]/.test(mot) && !SIGLES.has(mot);
    if (capitales || (n.length >= 3 && sensibles.has(n))) return jeton('NOM', mot);
    return mot;
  });
  return t;
}

/**
 * Pseudonymise la demande avant l'envoi à Mistral. `dossiers` : la liste reçue du poste (noms, parties, autres, contacts).
 * @param {string} texte
 * @param {{ dossierLibelle?: string, historique?: Array<{ texte?: string, intention?: string }> }} contexte
 * @param {Array<any>} dossiers
 */
function pseudonymiserDemande(texte, contexte, dossiers) {
  const sensibles = new Set();
  const ajouter = (s) => A.normaliserDemande(String(s || '')).split(/[^a-z0-9-]+/).forEach((m) => {
    m.split('-').concat(m).forEach((x) => { if (x.length >= 3 && !/^\d+$/.test(x)) sensibles.add(x); });
  });
  for (const d of dossiers || []) {
    if (!d) continue;
    ajouter(String(d.nom || '').replace(/\b(VTE|SUCC|VENTE|SUCCESSION)\b/gi, ' '));
    for (const p of Array.isArray(d.parties) ? d.parties : []) { ajouter(p && p.nom); ajouter(p && p.prenom); ajouter(p && p.nomUsage); }
    for (const a of Array.isArray(d.autres) ? d.autres : []) ajouter(String(a || '').replace(/\b(rue|avenue|chemin|route|allee|allée|impasse|boulevard|place|quai|lieu-dit|des|du|de|la|le|les|et|maitre|maître|agence|immobilier|immobiliere|immobilière|notaires?|office)\b/gi, ' '));
  }
  // Mots du métier jamais masqués, même s'ils figurent dans une fiche (une rue « du Prêt », une agence « Projet Immo »).
  // Seuls les mots écrits en minuscules dans les exemples comptent : MARTIN, Lices, Blois y sont des noms.
  A.INTENTIONS_ASSISTANT.forEach((i) => (i.exemples || []).forEach((ex) => (String(ex).match(/[A-Za-zÀ-ÿ'’-]+/g) || [])
    .filter((m) => m === m.toLowerCase()).forEach((m) => A.normaliserDemande(m).split(/[^a-z]+/)
      .filter((x) => x.length >= 3).forEach((x) => sensibles.delete(x)))));
  ['pret', 'fonds', 'appel', 'projet', 'signature', 'rendez', 'vous', 'agenda', 'dossier', 'vendeur', 'acquereur', 'notaire',
    'demain', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'offre', 'piece', 'pieces', 'envoye', 'email', 'mail'].forEach((m) => sensibles.delete(m));
  const table = new Map();
  const c = contexte || {};
  return {
    texte: masquer(texte, sensibles, table),
    contexte: {
      ...c,
      dossierLibelle: c.dossierLibelle ? masquer(c.dossierLibelle, sensibles, table) : '',
      historique: (c.historique || []).map((h) => ({ ...h, texte: masquer((h && h.texte) || '', sensibles, table) }))
    },
    table
  };
}

/** Rétablit les valeurs masquées dans un texte rendu par l'IA. Pure. @param {string} texte @param {Map<string, string>} table */
function retablirTexte(texte, table) {
  return String(texte || '').replace(/\[(?:NOM|EMAIL|TEL|REF|NUM)\d+\]/g, (j) => table.get(j) || j);
}

/** Coût en dollars d'un nombre de jetons. Pure. @param {number} entree @param {number} sortie */
function coutAssistantUsd(entree, sortie) {
  return Math.round(((entree || 0) * TARIF_ASSISTANT_MISTRAL.entree + (sortie || 0) * TARIF_ASSISTANT_MISTRAL.sortie) * MAJORATION_UE / 1e6 * 10000) / 10000;
}

/** Usage du mois en cours (demandes, jetons, coût estimé). @param {any} parametresRepo @param {Date} [maintenant] */
function lireUsageAssistant(parametresRepo, maintenant) {
  const mois = (maintenant || new Date()).toISOString().slice(0, 7);
  const u = parametresRepo.lireJsonBrut(CLE_USAGE, {}) || {};
  const courant = u.mois === mois ? u : { mois, demandes: 0, entree: 0, sortie: 0, erreurs: 0 };
  return { ...courant, coutUsd: coutAssistantUsd(courant.entree, courant.sortie), precedent: u.mois !== mois && u.mois ? u : (u.precedent || null) };
}

/** @param {any} parametresRepo @param {{ entree?: number, sortie?: number, erreur?: boolean }} ajout @param {Date} [maintenant] */
function noterUsageAssistant(parametresRepo, ajout, maintenant) {
  const mois = (maintenant || new Date()).toISOString().slice(0, 7);
  const u = parametresRepo.lireJsonBrut(CLE_USAGE, {}) || {};
  const precedent = u.mois && u.mois !== mois ? { mois: u.mois, demandes: u.demandes || 0, entree: u.entree || 0, sortie: u.sortie || 0 } : (u.precedent || null);
  const base = u.mois === mois ? u : { mois, demandes: 0, entree: 0, sortie: 0, erreurs: 0 };
  parametresRepo.ecrireJsonBrut(CLE_USAGE, {
    mois, precedent,
    demandes: (base.demandes || 0) + (ajout.erreur ? 0 : 1),
    erreurs: (base.erreurs || 0) + (ajout.erreur ? 1 : 0),
    entree: (base.entree || 0) + (ajout.entree || 0),
    sortie: (base.sortie || 0) + (ajout.sortie || 0)
  });
}

/**
 * Client Mistral à l'interface du client Ollama. `cle` vide → indisponible. Un seul essai, 20 s au plus, JSON obligatoire.
 * @param {{ cle: string, region?: string, fetchFn?: Function, parametresRepo?: any }} o
 */
function creerClientMistralAssistant({ cle, region, fetchFn, parametresRepo }) {
  const f = /** @type {any} */ (fetchFn || fetch);
  const base = BASES[region === 'global' ? 'global' : 'eu'];
  return {
    modele: MODELE_ASSISTANT_MISTRAL,
    moteur: 'mistral',
    async verifierDisponibilite() {
      return cle ? { disponible: true, raison: '' } : { disponible: false, raison: 'Aucune clé Mistral : à saisir dans Réglages › IA et relecture d’actes.' };
    },
    /** @param {string} prompt @param {(o: any) => string|null} valider @param {{ longueurMax?: number }} [limites] */
    async genererJson(prompt, valider, limites) {
      let r;
      try {
        r = await f(`${base}/v1/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            model: MODELE_ASSISTANT_MISTRAL, temperature: 0.1, max_tokens: (limites && limites.longueurMax) || 200,
            response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }]
          }),
          signal: AbortSignal.timeout(DELAI_MISTRAL_MS)
        });
      } catch (err) {
        if (parametresRepo) noterUsageAssistant(parametresRepo, { erreur: true });
        throw new Error(err && (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'Mistral n’a pas répondu en 20 s' : 'Mistral injoignable depuis le serveur');
      }
      if (!r.ok) {
        if (parametresRepo) noterUsageAssistant(parametresRepo, { erreur: true });
        throw new Error(r.status === 401 ? 'clé Mistral refusée' : r.status === 429 ? 'limite de débit Mistral atteinte' : `Mistral a répondu ${r.status}`);
      }
      const corps = await r.json().catch(() => ({}));
      const usage = corps && corps.usage ? corps.usage : {};
      if (parametresRepo) noterUsageAssistant(parametresRepo, { entree: usage.prompt_tokens || 0, sortie: usage.completion_tokens || 0 });
      const contenu = corps && corps.choices && corps.choices[0] && corps.choices[0].message ? corps.choices[0].message.content : '';
      let objet;
      try { objet = JSON.parse(typeof contenu === 'string' ? contenu : ''); } catch (_) { throw new Error('réponse de Mistral illisible'); }
      const probleme = valider ? valider(objet) : null;
      if (probleme) throw new Error(`réponse de Mistral hors format (${probleme})`);
      return objet;
    }
  };
}

module.exports = {
  MODELE_ASSISTANT_MISTRAL, CLE_REGLAGES, MOTEURS, assainirReglagesAssistant, pseudonymiserDemande, retablirTexte,
  coutAssistantUsd, lireUsageAssistant, noterUsageAssistant, creerClientMistralAssistant
};
