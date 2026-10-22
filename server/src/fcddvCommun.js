'use strict';

// Réponses du FCDDV (fichier central des dispositions de dernières volontés) rangées à la racine du COMMUN (étude 22/10 : « pour les FCDDV,
// s'il n'est pas dans le dossier, regarder à la racine du commun dans le dossier FCDDV et son sous-dossier INTERROGATION »). Lecture seule :
// la liste des PDF du dossier « FCDDV » (à plat) et de son sous-dossier « INTERROGATION », puis le fichier choisi, confiné à ce dossier.
// Jamais un chemin reçu d'une requête pour TROUVER le dossier : `config.nasFcddv` (config.json), sinon le partage `\\serveur\FCDDV` du NAS
// des dossiers clients, sinon le premier dossier ainsi nommé dans la racine des dossiers clients ou ses parents (comme « Fausses minutes »).

const path = require('node:path');
const fsp = require('node:fs/promises');
const { parentsCandidats } = require('./scans');
const { resoudreFichierFaussesMinutes } = require('./faussesMinutes');

const RE_NOM_DOSSIER_FCDDV = /^fcddv$/i;
const PROFONDEUR_INTERROGATION = 2;
const MAX_FICHIERS = 5000;
const DUREE_CACHE_MS = 60 * 1000;

/** Pure : un nom sans accents ni casse, pour reconnaître « INTERROGATION » / « Interrogations ». @param {string} nom */
function nomSimple(nom) { return String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); }

/** Pure : les partages candidats d'après la racine des dossiers clients. @param {string} racine */
function partagesFcddvCandidats(racine) {
  const m = /^\\\\([^\\/]+)[\\/]/.exec(String(racine || '').replace(/\//g, '\\'));
  if (!m) return [];
  return ['FCDDV', 'Fcddv'].map((nom) => `\\\\${m[1]}\\${nom}`);
}

async function estDossier(chemin, fsImpl) {
  try { return (await fsImpl.stat(chemin)).isDirectory(); } catch (_) { /* essai suivant */ }
  if (/^\\\\[^\\]+\\[^\\]+$/.test(String(chemin))) {
    try { return (await fsImpl.stat(chemin + '\\')).isDirectory(); } catch (_) { return false; }
  }
  return false;
}

/** @param {any} config @param {any} [fsImpl] */
async function trouverDossierFcddv(config, fsImpl = fsp) {
  if (config && config.nasFcddv) return (await estDossier(config.nasFcddv, fsImpl)) ? path.resolve(config.nasFcddv) : null;
  for (const partage of partagesFcddvCandidats(config && config.nasRacine)) {
    if (await estDossier(partage, fsImpl)) return partage;
  }
  for (const dossier of parentsCandidats(config && config.nasRacine)) {
    let entrees;
    try { entrees = await fsImpl.readdir(dossier, { withFileTypes: true }); } catch (_) { continue; }
    const trouve = entrees.find((e) => e.isDirectory() && RE_NOM_DOSSIER_FCDDV.test(e.name.trim()));
    if (trouve) return path.join(dossier, trouve.name);
  }
  return null;
}

/** Les PDF du dossier FCDDV (à plat) et de son sous-dossier INTERROGATION : chemin relatif, nom, taille, date. @param {string} racine @param {any} [fsImpl] */
async function listerFcddv(racine, fsImpl = fsp) {
  /** @type {Array<{ chemin: string, nom: string, taille: number, modifie: string, interrogation: boolean }>} */
  const fichiers = [];
  let tronque = false;
  const file = [{ chemin: racine, profondeur: 0, interrogation: false }];
  while (file.length && !tronque) {
    const courant = /** @type {any} */ (file.shift());
    let entrees;
    try { entrees = await fsImpl.readdir(courant.chemin, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entrees) {
      const absolu = path.join(courant.chemin, e.name);
      if (e.isDirectory()) {
        // Seul le sous-dossier « INTERROGATION » de la racine est parcouru (et ses sous-dossiers) : pas tout le FCDDV.
        if (courant.interrogation && courant.profondeur < PROFONDEUR_INTERROGATION && !/^[.#@$]/.test(e.name)) file.push({ chemin: absolu, profondeur: courant.profondeur + 1, interrogation: true });
        else if (!courant.interrogation && courant.profondeur === 0 && /^interrogations?$/.test(nomSimple(e.name))) file.push({ chemin: absolu, profondeur: 1, interrogation: true });
      } else if (/\.pdf$/i.test(e.name)) {
        if (fichiers.length >= MAX_FICHIERS) { tronque = true; break; }
        let st = null;
        try { st = await fsImpl.stat(absolu); } catch (_) { continue; }
        fichiers.push({ chemin: path.relative(racine, absolu).split(path.sep).join('/'), nom: e.name, taille: st.size, modifie: new Date(st.mtimeMs).toISOString(), interrogation: courant.interrogation });
      }
    }
  }
  return Object.assign(fichiers, { tronque });
}

// Liste gardée une minute : plusieurs fiches de succession ouvertes de suite ne reparcourent pas le dossier.
/** @type {any} */
let cache = null;
/** @param {any} config @param {any} [fsImpl] @param {number} [maintenant] */
async function fcddvCommun(config, fsImpl = fsp, maintenant = Date.now()) {
  // Liste et emplacement du dossier gardés une minute (audit 22/10 : la recherche du dossier sur le réseau ne se refait pas à chaque requête).
  if (cache && maintenant - cache.le < DUREE_CACHE_MS) return { trouve: true, nom: path.basename(cache.dossier), fichiers: cache.fichiers, tronque: !!cache.fichiers.tronque };
  const dossier = await trouverDossierFcddv(config, fsImpl);
  if (!dossier) return { trouve: false, fichiers: [] };
  const fichiers = await listerFcddv(dossier, fsImpl);
  cache = { dossier, le: maintenant, fichiers };
  return { trouve: true, nom: path.basename(dossier), fichiers, tronque: !!fichiers.tronque };
}

/** Pure : le chemin demandé est-il à la racine du dossier FCDDV ou dans son sous-dossier INTERROGATION ? (/fichier ne sert pas le reste.) @param {string} chemin */
function cheminFcddvPermis(chemin) {
  const segments = String(chemin || '').replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.some((x) => x === '..' || x === '.')) return false;
  return segments.length === 1 || (segments.length > 1 && /^interrogations?$/.test(nomSimple(segments[0])));
}
function oublierCacheFcddv() { cache = null; }

module.exports = {
  RE_NOM_DOSSIER_FCDDV, partagesFcddvCandidats, trouverDossierFcddv, listerFcddv, fcddvCommun, oublierCacheFcddv, cheminFcddvPermis,
  // Même confinement que les fausses minutes (chemin relatif au dossier, liens résolus, PDF seulement).
  resoudreFichierFcddv: resoudreFichierFaussesMinutes
};
