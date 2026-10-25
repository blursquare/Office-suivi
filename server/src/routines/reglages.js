// @ts-check
'use strict';
// Réglages des routines de CLAIRE (clé `routines-reglages`) : interrupteur général, heure, résumé Teams, plafond mensuel de l'IA en ligne
// (étude 24/10 : 50 € par mois), et pour chaque routine son interrupteur, son niveau d'autonomie et le niveau de chacun de ses gestes.
// Au premier passage de la révision 2 (25/10), tout est ALLUMÉ au niveau 1 (choix de l'étude) ; un niveau ne dépasse jamais le maximum du geste.

const { CATALOGUE } = require('./catalogue');

const CLE_REGLAGES_ROUTINES = 'routines-reglages';
const PLAFOND_DEFAUT_EUROS = 50;
const PLAFOND_MAX_EUROS = 10000;
const HEURE_DEFAUT = '09:30';
// 2 (25/10) : toutes les routines construites, allumées au niveau 1 au premier passage (étude : « toutes allumées, niveau 1 »).
const REVISION_REGLAGES_ROUTINES = 2;

/** @param {any} v @param {number} defaut @param {number} max @returns {1 | 2 | 3} */
function niveauBorne(v, defaut, max) {
  const n = Math.round(Number(v));
  const borne = Math.max(1, Math.min(3, max));
  return /** @type {1 | 2 | 3} */ (Number.isFinite(n) && n >= 1 ? Math.min(n, borne) : Math.min(defaut, borne));
}

/** Niveau maximal accepté par au moins un geste de la routine. @param {import('./catalogue').Routine} r */
function niveauMaxRoutine(r) {
  return r.gestes.reduce((m, g) => Math.max(m, g.niveauMax), 1);
}

/** @param {any} brut */
function assainirReglagesRoutines(brut) {
  const b = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  const anciens = b.revision !== REVISION_REGLAGES_ROUTINES;
  const heure = typeof b.heure === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.heure) ? b.heure : HEURE_DEFAUT;
  const plafond = Number(b.plafondEuros);
  /** @type {Record<string, { actif: boolean, niveau: number, gestes: Record<string, number> }>} */
  const routines = {};
  const saisies = b.routines && typeof b.routines === 'object' && !Array.isArray(b.routines) ? b.routines : {};
  for (const r of CATALOGUE) {
    const s = saisies[r.id] && typeof saisies[r.id] === 'object' ? saisies[r.id] : {};
    const niveau = niveauBorne(s.niveau, 1, niveauMaxRoutine(r));
    /** @type {Record<string, number>} */
    const gestes = {};
    const sg = s.gestes && typeof s.gestes === 'object' && !Array.isArray(s.gestes) ? s.gestes : {};
    for (const g of r.gestes) gestes[g.cle] = niveauBorne(sg[g.cle], niveau, g.niveauMax);
    // Une routine non disponible ne peut pas être allumée : elle garde ses niveaux, jamais son interrupteur. Réglages d'avant la
    // révision 2 (étude 25/10 : « toutes allumées, niveau 1 ») : chaque routine allumée une fois, au niveau enregistré.
    const allumee = anciens ? r.id !== 'essai' : s.actif === true;
    routines[r.id] = { actif: !!r.disponible && allumee, niveau, gestes };
  }
  return {
    revision: REVISION_REGLAGES_ROUTINES,
    actif: anciens ? true : b.actif === true,
    heure,
    teams: b.teams !== false,
    plafondEuros: Number.isFinite(plafond) && plafond >= 0 ? Math.min(PLAFOND_MAX_EUROS, Math.round(plafond * 100) / 100) : PLAFOND_DEFAUT_EUROS,
    routines
  };
}

/** Le niveau en vigueur d'un geste d'une routine (1 si inconnu). @param {any} reglages @param {string} routineId @param {string} gesteCle */
function niveauEffectif(reglages, routineId, gesteCle) {
  const r = CATALOGUE.find((x) => x.id === routineId);
  const g = r && r.gestes.find((x) => x.cle === gesteCle);
  if (!r || !g) return 1;
  const s = reglages && reglages.routines && reglages.routines[routineId];
  return niveauBorne(s && s.gestes ? s.gestes[gesteCle] : undefined, s ? s.niveau : 1, g.niveauMax);
}

/** @param {any} repo */
function lireReglagesRoutines(repo) {
  return assainirReglagesRoutines(repo.lireJsonBrut(CLE_REGLAGES_ROUTINES, null));
}

/** @param {any} repo @param {any} brut */
function ecrireReglagesRoutines(repo, brut) {
  // Un réglage écrit est un choix de l'étude : il porte la révision en vigueur (jamais rallumé d'office ensuite).
  const propre = assainirReglagesRoutines(Object.assign({}, brut, { revision: REVISION_REGLAGES_ROUTINES }));
  repo.ecrireJsonBrut(CLE_REGLAGES_ROUTINES, propre);
  return propre;
}

module.exports = { CLE_REGLAGES_ROUTINES, REVISION_REGLAGES_ROUTINES, PLAFOND_DEFAUT_EUROS, HEURE_DEFAUT, assainirReglagesRoutines, niveauEffectif, lireReglagesRoutines, ecrireReglagesRoutines };
