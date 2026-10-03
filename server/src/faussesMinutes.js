'use strict';

// Dossier « Fausses minutes » du commun (étude, 03/10 : « un bouton d'envoi de la copie de l'acte et/ou des
// attestations de vente, à lire sur le commun / fausses minutes ») : un dossier à part, commun à tous les
// dossiers, un PDF par acte. Lecture seule : la liste des PDF (nom, taille, date) et le fichier choisi,
// confiné à ce dossier. Jamais un chemin reçu d'une requête pour TROUVER le dossier : `config.nasFaussesMinutes`
// (config.json, réservé à l'administrateur du poste), sinon le partage `\\serveur\Fausses minutes` du NAS des
// dossiers clients, sinon le premier dossier ainsi nommé dans la racine des dossiers clients ou ses parents
// (même méthode que le dossier « Scan », voir scans.js).

const path = require('node:path');
const fsp = require('node:fs/promises');
const { parentsCandidats } = require('./scans');

const RE_NOM_DOSSIER_FAUSSES_MINUTES = /^fausses?[\s_-]*minutes?$/i;
const PROFONDEUR_MAX = 3;
const MAX_FICHIERS = 20000;
const DUREE_CACHE_MS = 60 * 1000;

// Pure : les partages candidats d'après la racine des dossiers clients (« \\serveur\Commun\… »).
function partagesFaussesMinutesCandidats(racine) {
  const m = /^\\\\([^\\/]+)[\\/]/.exec(String(racine || '').replace(/\//g, '\\'));
  if (!m) return [];
  return ['Fausses minutes', 'FAUSSES MINUTES', 'Fausses Minutes', 'Fausse minute'].map((nom) => `\\\\${m[1]}\\${nom}`);
}

async function estDossier(chemin, fsImpl) {
  try { return (await fsImpl.stat(chemin)).isDirectory(); } catch (_) { /* essai suivant */ }
  if (/^\\\\[^\\]+\\[^\\]+$/.test(String(chemin))) {
    try { return (await fsImpl.stat(chemin + '\\')).isDirectory(); } catch (_) { return false; }
  }
  return false;
}

async function trouverDossierFaussesMinutes(config, fsImpl = fsp) {
  if (config && config.nasFaussesMinutes) {
    return (await estDossier(config.nasFaussesMinutes, fsImpl)) ? path.resolve(config.nasFaussesMinutes) : null;
  }
  for (const partage of partagesFaussesMinutesCandidats(config && config.nasRacine)) {
    if (await estDossier(partage, fsImpl)) return partage;
  }
  for (const dossier of parentsCandidats(config && config.nasRacine)) {
    let entrees;
    try { entrees = await fsImpl.readdir(dossier, { withFileTypes: true }); } catch (_) { continue; }
    const trouve = entrees.find((e) => e.isDirectory() && RE_NOM_DOSSIER_FAUSSES_MINUTES.test(e.name.trim()));
    if (trouve) return path.join(dossier, trouve.name);
  }
  return null;
}

// Les PDF du dossier (sous-dossiers par année compris, 3 niveaux) : chemin relatif, nom, taille, date.
async function listerFaussesMinutes(racine, fsImpl = fsp) {
  const fichiers = [];
  const file = [{ chemin: racine, profondeur: 0 }];
  while (file.length && fichiers.length < MAX_FICHIERS) {
    const courant = file.shift();
    let entrees;
    try { entrees = await fsImpl.readdir(courant.chemin, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entrees) {
      const absolu = path.join(courant.chemin, e.name);
      if (e.isDirectory()) {
        if (courant.profondeur < PROFONDEUR_MAX && !/^[.#@$]/.test(e.name)) file.push({ chemin: absolu, profondeur: courant.profondeur + 1 });
      } else if (/\.pdf$/i.test(e.name) && fichiers.length < MAX_FICHIERS) {
        let st = null;
        try { st = await fsImpl.stat(absolu); } catch (_) { continue; }
        fichiers.push({ chemin: path.relative(racine, absolu).split(path.sep).join('/'), nom: e.name, taille: st.size, modifie: new Date(st.mtimeMs).toISOString() });
      }
    }
  }
  return fichiers;
}

// Le fichier demandé, confiné au dossier des fausses minutes (liens symboliques résolus), PDF seulement.
async function resoudreFichierFaussesMinutes(racine, cheminRelatif, fsImpl = fsp) {
  const relatif = String(cheminRelatif || '');
  if (!racine || !relatif || relatif.includes('\0') || !/\.pdf$/i.test(relatif)) return null;
  const base = path.resolve(racine);
  const cible = path.resolve(base, relatif);
  if (cible !== base && !cible.startsWith(base + path.sep)) return null;
  try {
    const reel = await fsImpl.realpath(cible);
    const baseReelle = await fsImpl.realpath(base);
    if (!reel.startsWith(baseReelle + path.sep)) return null;
    return reel;
  } catch (_) {
    return null;
  }
}

// Liste gardée une minute : plusieurs ouvertures de la fenêtre d'envoi ne reparcourent pas le dossier.
let cache = null;
async function faussesMinutes(config, fsImpl = fsp, maintenant = Date.now()) {
  const dossier = await trouverDossierFaussesMinutes(config, fsImpl);
  if (!dossier) return { trouve: false, fichiers: [] };
  if (cache && cache.dossier === dossier && maintenant - cache.le < DUREE_CACHE_MS) return { trouve: true, nom: path.basename(dossier), fichiers: cache.fichiers };
  const fichiers = await listerFaussesMinutes(dossier, fsImpl);
  cache = { dossier, le: maintenant, fichiers };
  return { trouve: true, nom: path.basename(dossier), fichiers };
}
function oublierCacheFaussesMinutes() { cache = null; }

module.exports = {
  RE_NOM_DOSSIER_FAUSSES_MINUTES, partagesFaussesMinutesCandidats, trouverDossierFaussesMinutes,
  listerFaussesMinutes, resoudreFichierFaussesMinutes, faussesMinutes, oublierCacheFaussesMinutes
};
