// @ts-check
'use strict';
// Assistant « Demander à CLAIRE » (étude 06/10) — compréhension d'une demande côté serveur.
//
// Trois voies, dans l'ordre : (1) la lecture par mots-clés de commun/assistant.js quand la phrase est sans ambiguïté
// (immédiate) ; (2) l'IA LOCALE (Ollama, jamais une API en ligne — choix de l'étude 06/10) quand plusieurs intentions se
// disputent la phrase ; (3) la même lecture par mots-clés, même peu sûre, quand Ollama ne répond pas. L'IA ne choisit
// qu'une intention de la liste fermée et recopie ce que la phrase dit ; le dossier désigné, la date, l'heure et les
// montants sont relus par le code (le résultat du code gagne quand il a trouvé quelque chose). Rien n'est exécuté ici :
// le poste reçoit { intention, parametres, dossier, candidats } et fait le geste avec ses propres fonctions.
//
// Ce qui part vers Ollama : la phrase, la date du jour, le libellé du dossier en consultation, les trois derniers échanges —
// jamais la liste des dossiers ni une donnée de fiche. Rien n'est journalisé (la phrase peut nommer un client).

const A = require('../../commun/assistant');
const { pseudonymiserDemande, retablirTexte } = require('./assistantMistral');

const LONGUEUR_MAX_REPONSE = 160;
// Au-delà, le repli par mots-clés répond : mieux vaut une réponse moyenne tout de suite qu'une attente de plusieurs minutes.
const DELAI_IA_MS = 45 * 1000;
const DUREE_CACHE_DISPONIBILITE_MS = 60 * 1000;
const PARAMETRES_TEXTE = ['dossier', 'date', 'heure', 'texte', 'modele', 'echeance', 'champ', 'partie', 'ecran', 'collaborateur', 'titre'];
const VALEURS_PERMISES = {
  modele: A.MODELES_EMAIL_ASSISTANT.map((m) => m.cle),
  echeance: A.ECHEANCES_ASSISTANT.map((e) => e.cle),
  champ: A.CHAMPS_DATE_ASSISTANT.map((c) => c.cle),
  partie: ['vendeur', 'acquereur', 'confrere', 'agence'],
  ecran: A.ECRANS_ASSISTANT.map((e) => e.cle)
};
const COLLABORATEURS = { bastien: 'Bastien ANGLUMENT', julie: 'Julie VASSELIN', jeremy: 'Jérémy SAUJOT' };

/** Date du jour en français (« mardi 6 octobre 2026 ») pour le prompt. @param {string} iso */
function dateEnFrancais(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  return `${A.JOURS_ASSISTANT[d.getUTCDay()]} ${d.getUTCDate()} ${A.MOIS_ASSISTANT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Le prompt : liste fermée des intentions (clé + description), paramètres à recopier, contexte.
 * @param {string} texte
 * @param {{ aujourdhui?: string, dossierLibelle?: string, historique?: Array<{texte?: string, intention?: string}> }} contexte
 */
function promptAssistant(texte, contexte) {
  const c = contexte || {};
  // Court exprès : sur un CPU de bureau le prompt est lu à quelques dizaines de jetons par seconde (4 900 caractères = plus
  // d'une minute avant le premier mot). Libellé seul par intention ; la description complète sert à la page d'aide.
  const intentions = A.INTENTIONS_ASSISTANT.filter((i) => i.cle !== 'inconnu')
    .map((i) => `${i.cle} = ${i.libelle}`).join('\n');
  const echanges = (c.historique || []).slice(-2).filter((h) => h && h.texte)
    .map((h) => `« ${String(h.texte).slice(0, 120)} » → ${h.intention || 'inconnu'}`).join('\n');
  // Les exemples de la base les plus proches de la phrase, donnés comme modèles (étude 06/10 : le modèle doit comprendre ce qui
  // ressemble à la base d'exemples) — 4 lignes courtes, pas plus.
  const proches = A.exemplesProches(texte, 4).filter((x) => x.score >= 0.25)
    .map((x) => `« ${x.exemple} » → ${x.cle}`).join('\n');
  return `Assistant d'une étude notariale. Choisis UNE intention pour la phrase et recopie ce qu'elle dit (rien d'inventé : "" si absent).
Intentions :
${intentions}
inconnu = hors liste ou trop vague
${proches ? `Exemples proches :\n${proches}\n` : ''}${c.dossierLibelle ? `Dossier en consultation : ${c.dossierLibelle} (« ce dossier », « lui »).\n` : ''}${echanges ? `Avant :\n${echanges}\n` : ''}Aujourd'hui : ${dateEnFrancais(c.aujourdhui || '')}.
Phrase : « ${String(texte || '').replace(/\s+/g, ' ').trim()} »
JSON seul : {"intention":"<clé>","parametres":{"dossier":"<nom cité>","date":"<AAAA-MM-JJ>","heure":"<HH:MM>","texte":"","modele":"<pret|rib|provision|ventePrealable|fonds|relanceFonds|projet|confirmationRdv|questionnaire|copieActe|accuseReception>","echeance":"<appelFonds|projetEnvoye|pret|ventebien|rendezVousSignature>","champ":"<appelFonds|projetEnvoye|pret|ventebien|acte>","partie":"<vendeur|acquereur|confrere|agence>","ecran":"<dashboard|agenda|suivi|scans|outils|reglages|nouveau|confreres|analyse-ia>","montant":null,"collaborateur":"<Bastien|Julie|Jérémy>","titre":""}}`;
}

/** Paramètres de l'IA ramenés à des chaînes propres, valeurs hors liste écartées. @param {any} brut */
function nettoyerParametresIa(brut) {
  const p = brut && typeof brut === 'object' ? brut : {};
  /** @type {Record<string, any>} */
  const propre = {};
  PARAMETRES_TEXTE.forEach((k) => {
    let v = typeof p[k] === 'string' ? p[k].trim() : '';
    // Le gabarit recopié tel quel (« <nom cité> », « <pret|rib|…> ») n'est pas une valeur.
    if (/^<[^>]*>$/.test(v)) v = '';
    if (VALEURS_PERMISES[k] && v && !VALEURS_PERMISES[k].includes(v)) v = '';
    if (k === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) v = '';
    if (k === 'heure' && v && !/^\d{2}:\d{2}$/.test(v)) v = '';
    if (k === 'collaborateur' && v) v = COLLABORATEURS[A.normaliserDemande(v).split(/\s/)[0]] || '';
    propre[k] = v.slice(0, 300);
  });
  propre.montant = typeof p.montant === 'number' && Number.isFinite(p.montant) && p.montant > 0 ? p.montant : null;
  return propre;
}

/**
 * Comprend une demande : voie rapide par mots-clés, sinon l'IA locale, sinon le repli par mots-clés.
 * @param {{ texte: string, contexte?: { aujourdhui?: string, dossierId?: string, dossierLibelle?: string, historique?: any[] },
 *   dossiers?: Array<{id:string, nom:string, parties?: any[], archive?: boolean}> }} entree
 * @param {{ verifierDisponibilite: () => Promise<{disponible: boolean, raison?: string}>, genererJson: Function, moteur?: string } | null} ollama
 * @param {{ disponibilite?: () => Promise<{disponible: boolean, raison?: string}>, pseudonymiser?: boolean, toujours?: boolean }} [options]
 *   `toujours` : l'IA lit aussi les phrases que les mots-clés ont comprises sûrement (essai de Mistral, étude 07/10) ; son
 *   intention l'emporte, les paramètres lus par le code restent, et `motsCles` dit ce que les mots-clés avaient compris.
 */
async function comprendreDemande(entree, ollama, options) {
  const texte = String((entree && entree.texte) || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const contexte = (entree && entree.contexte) || {};
  const dossiers = Array.isArray(entree && entree.dossiers) ? entree.dossiers.slice(0, 1500) : [];
  const motsCles = A.interpreterParMotsCles(texte, { aujourdhui: contexte.aujourdhui || '' });
  let intention = motsCles.intention;
  /** @type {Record<string, any>} */
  let parametres = { ...motsCles.parametres };
  let source = 'motscles';
  let raisonIa = '';
  const moteur = (ollama && ollama.moteur) || 'locale';

  // Un nom de dossier seul (« Martin », « dossier Martin ») : l'état du dossier, sans demander à l'IA (lecture seule).
  let nomSeul = false;
  if (motsCles.intention === 'inconnu' && texte.split(' ').length <= 4) {
    const seul = A.reconnaitreDossier(texte, dossiers);
    if (seul.dossier || seul.candidats.length) { intention = 'etat_dossier'; source = 'motscles'; motsCles.surete = 'haute'; nomSeul = true; }
  }
  const intentionMotsCles = intention;

  if ((motsCles.surete !== 'haute' || (options && options.toujours && !nomSeul)) && ollama) {
    const disponibilite = options && options.disponibilite ? options.disponibilite : () => ollama.verifierDisponibilite();
    /** @type {{ disponible: boolean, raison?: string }} */
    let statut = { disponible: false, raison: '' };
    try { statut = await disponibilite(); } catch (err) { statut = { disponible: false, raison: err && err.message }; }
    if (statut.disponible) {
      try {
        // IA en ligne (Claude, Mistral) : la phrase part noms masqués, les valeurs recopiées sont rétablies au retour.
        const ps = options && options.pseudonymiser ? pseudonymiserDemande(texte, contexte, dossiers) : null;
        const prompt = ps ? promptAssistant(ps.texte, ps.contexte) : promptAssistant(texte, contexte);
        const objet = await ollama.genererJson(prompt, A.validerReponseAssistant, { longueurMax: LONGUEUR_MAX_REPONSE, delaiMs: DELAI_IA_MS, sansRelance: true });
        const ia = nettoyerParametresIa(objet.parametres);
        if (ps) ['dossier', 'texte', 'titre'].forEach((k) => { if (ia[k]) ia[k] = retablirTexte(ia[k], ps.table); });
        intention = objet.intention;
        source = 'ia';
        // Le code gagne quand il a lu quelque chose ; l'IA complète ce qu'il n'a pas lu.
        Object.keys(ia).forEach((k) => {
          const vide = parametres[k] === '' || parametres[k] === null || parametres[k] === undefined;
          if (vide && ia[k] !== '' && ia[k] !== null) parametres[k] = ia[k];
        });
        parametres.dossierTexte = ia.dossier || '';
        if (ia.titre) parametres.titre = ia.titre;
      } catch (err) {
        raisonIa = `${moteur === 'mistral' ? 'IA Mistral' : moteur === 'claude' ? 'IA Claude' : 'IA locale'} : ${err && err.message ? err.message : 'réponse illisible'}`;
      }
    } else {
      raisonIa = statut.raison || 'IA locale indisponible';
    }
  }
  if (!A.intentionAssistant(intention)) intention = 'inconnu';

  // Le dossier désigné : d'abord ce que l'IA a recopié, sinon toute la phrase ; sinon celui en consultation.
  const definition = A.intentionAssistant(intention);
  let dossier = '';
  /** @type {Array<{id: string, nom: string}>} */
  let candidats = [];
  if (definition && (definition.dossier || definition.dossierFacultatif)) {
    let r = parametres.dossierTexte ? A.reconnaitreDossier(parametres.dossierTexte, dossiers) : { dossier: '', candidats: [] };
    if (!r.dossier && !r.candidats.length) r = A.reconnaitreDossier(texte, dossiers);
    dossier = r.dossier;
    candidats = r.candidats;
    // Dossier facultatif (derniers documents) : celui en consultation seulement si la phrase le désigne (« ce dossier »).
    if ((definition.dossier || /\b(ce|du|le) (dossier|client)( en cours)?\b|\bcette fiche\b/i.test(texte)) && !dossier && !candidats.length && contexte.dossierId && dossiers.some((d) => d && d.id === contexte.dossierId)) {
      dossier = contexte.dossierId;
      parametres.dossierParContexte = true;
    }
  }
  return { intention, parametres, dossier, candidats, source, moteur: source === 'ia' ? moteur : '', surete: motsCles.surete, raisonIa, texte,
    ...(source === 'ia' && intentionMotsCles !== intention && intentionMotsCles !== 'inconnu' ? { motsCles: intentionMotsCles } : {}) };
}

/** Disponibilité d'Ollama gardée une minute : la page vérifie à chaque demande, pas la peine d'interroger Ollama à chaque fois. */
function creerCacheDisponibilite(ollama) {
  let memo = { quand: 0, statut: null };
  return async () => {
    const maintenant = Date.now();
    if (memo.statut && maintenant - memo.quand < DUREE_CACHE_DISPONIBILITE_MS) return memo.statut;
    const statut = await ollama.verifierDisponibilite();
    memo = { quand: maintenant, statut };
    return statut;
  };
}

module.exports = { promptAssistant, comprendreDemande, nettoyerParametresIa, creerCacheDisponibilite, dateEnFrancais };
