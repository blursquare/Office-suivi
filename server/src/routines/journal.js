// @ts-check
'use strict';
// Journal « Ce que CLAIRE a fait seule » (clé `routines-journal`, 300 lignes) : chaque tour d'une routine dit ce qu'il a lu, préparé ou
// écarté. Jamais un nom de client ni une valeur de champ : un libellé neutre (« 3 propositions déposées pour Julie »), un nombre, un dossier
// désigné par son identifiant.

const CLE_JOURNAL_ROUTINES = 'routines-journal';
const MAX_JOURNAL_ROUTINES = 300;
const RESULTATS = ['ok', 'rien', 'erreur'];

/** @param {any} e @returns {any | null} */
function assainirEntreeJournal(e) {
  if (!e || typeof e !== 'object') return null;
  const t = typeof e.at === 'string' ? Date.parse(e.at) : NaN;
  const texte = String(e.texte == null ? '' : e.texte).replace(/\u0000/g, '').slice(0, 240).trim();
  if (!Number.isFinite(t) || !texte) return null;
  return {
    at: new Date(t).toISOString(),
    routine: String(e.routine || '').slice(0, 60),
    texte,
    resultat: RESULTATS.includes(e.resultat) ? e.resultat : 'ok',
    niveau: [1, 2, 3].includes(Number(e.niveau)) ? Number(e.niveau) : 1,
    dossierId: String(e.dossierId || '').slice(0, 80),
    auteur: 'CLAIRE'
  };
}

/** @param {any} brut */
function assainirJournalRoutines(brut) {
  return (Array.isArray(brut) ? brut : []).map(assainirEntreeJournal).filter(Boolean).slice(-MAX_JOURNAL_ROUTINES);
}

/** @param {any[]} liste @param {any} entree @param {Date} [maintenant] */
function ajouterAuJournal(liste, entree, maintenant) {
  const e = assainirEntreeJournal(Object.assign({ at: (maintenant || new Date()).toISOString() }, entree));
  return e ? [...liste, e].slice(-MAX_JOURNAL_ROUTINES) : liste;
}

/** @param {any} repo */
function lireJournalRoutines(repo) {
  return assainirJournalRoutines(repo.lireJsonBrut(CLE_JOURNAL_ROUTINES, null));
}

/** @param {any} repo @param {any} entree @param {Date} [maintenant] */
function noterJournalRoutines(repo, entree, maintenant) {
  repo.ecrireJsonBrut(CLE_JOURNAL_ROUTINES, ajouterAuJournal(lireJournalRoutines(repo), entree, maintenant));
}

module.exports = { CLE_JOURNAL_ROUTINES, MAX_JOURNAL_ROUTINES, assainirEntreeJournal, assainirJournalRoutines, ajouterAuJournal, lireJournalRoutines, noterJournalRoutines };
