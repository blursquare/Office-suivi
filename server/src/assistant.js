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

const LONGUEUR_MAX_REPONSE = 320;
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
  const intentions = A.INTENTIONS_ASSISTANT.filter((i) => i.cle !== 'inconnu')
    .map((i) => `- ${i.cle} : ${i.description}${i.dossier ? ' (porte sur un dossier)' : ''}`).join('\n');
  const echanges = (c.historique || []).slice(-3).filter((h) => h && h.texte)
    .map((h) => `- « ${String(h.texte).slice(0, 160)} » → ${h.intention || 'inconnu'}`).join('\n');
  return `Tu es l'assistant de CLAIRE, l'outil de suivi des dossiers de vente d'une étude notariale. Un collaborateur te parle en une phrase. Choisis UNE intention dans la liste ci-dessous et recopie dans "parametres" ce que la phrase dit. Tu ne décides rien et tu n'inventes rien : un paramètre que la phrase ne dit pas reste "" (ou null pour un montant).

Intentions possibles (clé : sens) :
${intentions}
- inconnu : la phrase ne correspond à rien de cette liste, ou reste trop vague.

Aujourd'hui : ${dateEnFrancais(c.aujourdhui || '')}.${c.dossierLibelle ? `\nDossier en consultation : ${c.dossierLibelle} — « ce dossier », « lui », « le client » le désignent.` : ''}${echanges ? `\nPhrases précédentes du collaborateur :\n${echanges}` : ''}

Phrase : « ${String(texte || '').replace(/\s+/g, ' ').trim()} »

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, au format exact :
{"intention": "<clé de la liste>", "parametres": {"dossier": "<nom du dossier ou de la personne tel qu'écrit dans la phrase, sinon \\"\\">", "date": "<AAAA-MM-JJ si la phrase donne un jour, sinon \\"\\">", "heure": "<HH:MM si la phrase donne une heure, sinon \\"\\">", "texte": "<le texte du rappel, de l'email ou de la recherche, sinon \\"\\">", "modele": "<pret|rib|provision|ventePrealable|fonds|relanceFonds|projet|confirmationRdv|questionnaire|anniversaire|copieActe|accuseReception ou \\"\\">", "echeance": "<appelFonds|projetEnvoye|pret|ventebien|rendezVousSignature ou \\"\\">", "champ": "<appelFonds|projetEnvoye|pret|ventebien|acte ou \\"\\">", "partie": "<vendeur|acquereur|confrere|agence ou \\"\\">", "ecran": "<dashboard|agenda|suivi|scans|outils|reglages|nouveau|confreres|analyse-ia ou \\"\\">", "montant": <nombre en euros ou null>, "collaborateur": "<Bastien|Julie|Jérémy ou \\"\\">", "titre": "<titre d'un rendez-vous, sinon \\"\\">"}}`;
}

/** Paramètres de l'IA ramenés à des chaînes propres, valeurs hors liste écartées. @param {any} brut */
function nettoyerParametresIa(brut) {
  const p = brut && typeof brut === 'object' ? brut : {};
  /** @type {Record<string, any>} */
  const propre = {};
  PARAMETRES_TEXTE.forEach((k) => {
    let v = typeof p[k] === 'string' ? p[k].trim() : '';
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
 * @param {{ verifierDisponibilite: () => Promise<{disponible: boolean, raison?: string}>, genererJson: Function } | null} ollama
 * @param {{ disponibilite?: () => Promise<{disponible: boolean, raison?: string}> }} [options]
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

  if (motsCles.surete !== 'haute' && ollama) {
    const disponibilite = options && options.disponibilite ? options.disponibilite : () => ollama.verifierDisponibilite();
    /** @type {{ disponible: boolean, raison?: string }} */
    let statut = { disponible: false, raison: '' };
    try { statut = await disponibilite(); } catch (err) { statut = { disponible: false, raison: err && err.message }; }
    if (statut.disponible) {
      try {
        const objet = await ollama.genererJson(promptAssistant(texte, contexte), A.validerReponseAssistant, { longueurMax: LONGUEUR_MAX_REPONSE });
        const ia = nettoyerParametresIa(objet.parametres);
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
        raisonIa = `IA locale : ${err && err.message ? err.message : 'réponse illisible'}`;
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
  if (definition && definition.dossier) {
    let r = parametres.dossierTexte ? A.reconnaitreDossier(parametres.dossierTexte, dossiers) : { dossier: '', candidats: [] };
    if (!r.dossier && !r.candidats.length) r = A.reconnaitreDossier(texte, dossiers);
    dossier = r.dossier;
    candidats = r.candidats;
    if (!dossier && !candidats.length && contexte.dossierId && dossiers.some((d) => d && d.id === contexte.dossierId)) {
      dossier = contexte.dossierId;
      parametres.dossierParContexte = true;
    }
  }
  return { intention, parametres, dossier, candidats, source, surete: motsCles.surete, raisonIa, texte };
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
