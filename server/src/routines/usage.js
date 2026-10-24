// @ts-check
'use strict';
// Dépense de l'IA en ligne des routines, par mois (clé `routines-usage`) : le plafond mensuel des Réglages arrête les routines qui utilisent
// l'IA une fois atteint. Phase 0 : aucune routine n'en consomme encore ; le compteur et le plafond sont déjà en place.

const CLE_USAGE_ROUTINES = 'routines-usage';

/** Le mois civil de Paris, « AAAA-MM ». @param {Date} d */
function moisParis(d) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);
}

/** @param {any} brut @param {Date} maintenant */
function assainirUsage(brut, maintenant) {
  const mois = moisParis(maintenant);
  const b = brut && typeof brut === 'object' ? brut : {};
  // Un nouveau mois repart de zéro.
  if (b.mois !== mois) return { mois, euros: 0, jetons: 0 };
  const euros = Number(b.euros);
  const jetons = Number(b.jetons);
  return { mois, euros: Number.isFinite(euros) && euros > 0 ? Math.round(euros * 10000) / 10000 : 0, jetons: Number.isFinite(jetons) && jetons > 0 ? Math.round(jetons) : 0 };
}

/** @param {any} repo @param {Date} [maintenant] */
function lireUsageRoutines(repo, maintenant) {
  return assainirUsage(repo.lireJsonBrut(CLE_USAGE_ROUTINES, null), maintenant || new Date());
}

/** @param {any} repo @param {{ euros?: number, jetons?: number }} depense @param {Date} [maintenant] */
function ajouterDepenseRoutines(repo, depense, maintenant) {
  const u = lireUsageRoutines(repo, maintenant);
  const nouveau = assainirUsage({ mois: u.mois, euros: u.euros + Math.max(0, Number(depense && depense.euros) || 0), jetons: u.jetons + Math.max(0, Number(depense && depense.jetons) || 0) }, maintenant || new Date());
  repo.ecrireJsonBrut(CLE_USAGE_ROUTINES, nouveau);
  return nouveau;
}

/** Le plafond mensuel est-il atteint ? (0 € = IA coupée.) @param {{ plafondEuros: number }} reglages @param {{ euros: number }} usage */
function plafondAtteint(reglages, usage) {
  return usage.euros >= reglages.plafondEuros;
}

module.exports = { CLE_USAGE_ROUTINES, moisParis, assainirUsage, lireUsageRoutines, ajouterDepenseRoutines, plafondAtteint };
