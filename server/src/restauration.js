// @ts-check
'use strict';

// Restauration d'une sauvegarde et base abîmée au démarrage (étude 06/10 : test de restauration → « database disk image
// is malformed » au démarrage).
//
// Cause : la base tourne en journal WAL (audit 04/10) ; à côté de `claire.db` vivent `claire.db-wal` (les dernières écritures,
// pas encore reversées dans la base) et `claire.db-shm`. Une sauvegarde copiée à la place de `claire.db` en laissant ces deux
// fichiers fait REJOUER le journal de l'ancienne base par-dessus la sauvegarde : le fichier devient illisible. La procédure
// affichée dans les Réglages ne le disait pas.
//
// Désormais :
//   1. Restaurer = déposer la sauvegarde sous le nom `claire-restauration.db` dans le dossier de la base (fait par le bouton
//      « Restaurer » des Réglages, ou à la main si le serveur ne démarre plus) puis (re)démarrer. Au démarrage, AVANT
//      d'ouvrir la base, `appliquerRestaurationEnAttente` vérifie la sauvegarde (integrity_check), range l'ancienne base AVEC
//      son journal sous `claire-avant-restauration-<date>.db` (+ `-wal`, `-shm` : la paire reste cohérente, rien n'est
//      perdu), puis met la sauvegarde à sa place. Une sauvegarde illisible est écartée, la base actuelle reste.
//   2. `ouvrirDbVerifiee` contrôle la base EN LECTURE SEULE avant de l'ouvrir (quick_check) — une connexion normale reverserait
//      un journal étranger dans la base en se fermant ; abîmée alors qu'un journal est présent → la base et son journal sont
//      COPIÉS à part (`claire-abimee-<date>.db` + `-wal`), le journal est retiré, la base est contrôlée puis ouverte seule.
//      Toujours abîmée → erreur claire qui dit comment restaurer.
// Tout est synchrone : ce code ne tourne qu'au démarrage, avant que le serveur réponde à quoi que ce soit.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const NOM_RESTAURATION = 'claire-restauration.db';
const SUFFIXES_JOURNAL = ['-wal', '-shm'];

/** Horodatage de fichier, heure locale : 2026-10-06-10h12. @param {Date} d */
function horodatageFichier(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}h${p(d.getMinutes())}`;
}

/** @param {string} cheminDb */
function cheminRestauration(cheminDb) { return path.join(path.dirname(cheminDb), NOM_RESTAURATION); }

/** Un nom libre à côté de la base : « base.db », sinon « base (2).db »… @param {string} dossier @param {string} base */
function nomLibre(dossier, base) {
  const ext = path.extname(base);
  const racine = base.slice(0, base.length - ext.length);
  for (let i = 1; i < 100; i++) {
    const nom = i === 1 ? base : `${racine} (${i})${ext}`;
    if (!fs.existsSync(path.join(dossier, nom)) && !SUFFIXES_JOURNAL.some((s) => fs.existsSync(path.join(dossier, nom + s)))) return path.join(dossier, nom);
  }
  return path.join(dossier, `${racine}-${Date.now()}${ext}`);
}

/** Contrôle d'un fichier de base : 'ok' ou le message de SQLite. @param {string} chemin @param {boolean} [complet] */
function controlerBase(chemin, complet) {
  let db = null;
  try {
    db = new DatabaseSync(chemin);
    const r = db.prepare(complet ? 'PRAGMA integrity_check' : 'PRAGMA quick_check(1)').get();
    const valeur = r ? String(Object.values(r)[0]) : 'contrôle impossible';
    if (valeur !== 'ok') return valeur;
    db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get();
    return 'ok';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  } finally {
    try { if (db) db.close(); } catch (_) { /* déjà fermée */ }
  }
}

/** Déplace la base et son journal (s'il existe) sous `cible` (+ -wal, -shm). @param {string} cheminDb @param {string} cible */
function deplacerAvecJournal(cheminDb, cible) {
  if (fs.existsSync(cheminDb)) fs.renameSync(cheminDb, cible);
  for (const s of SUFFIXES_JOURNAL) if (fs.existsSync(cheminDb + s)) fs.renameSync(cheminDb + s, cible + s);
}

/**
 * Au démarrage, avant d'ouvrir la base : applique une sauvegarde déposée sous `claire-restauration.db`.
 * @param {string} cheminDb @param {Date} [maintenant]
 * @returns {{ fait: boolean, refusee?: boolean, ancienne?: string, ecartee?: string, raison?: string }}
 */
function appliquerRestaurationEnAttente(cheminDb, maintenant) {
  if (!cheminDb || cheminDb === ':memory:') return { fait: false };
  const depot = cheminRestauration(cheminDb);
  if (!fs.existsSync(depot)) return { fait: false };
  const dossier = path.dirname(cheminDb);
  const stamp = horodatageFichier(maintenant || new Date());
  // Un journal laissé à côté de la sauvegarde déposée (copiée depuis une base ouverte ?) n'est jamais rejoué.
  for (const s of SUFFIXES_JOURNAL) if (fs.existsSync(depot + s)) fs.renameSync(depot + s, nomLibre(dossier, `claire-restauration-journal-${stamp}.db`) + s);
  const controle = controlerBase(depot, true);
  if (controle !== 'ok') {
    const ecartee = nomLibre(dossier, `claire-restauration-refusee-${stamp}.db`);
    fs.renameSync(depot, ecartee);
    return { fait: false, refusee: true, ecartee: path.basename(ecartee), raison: controle };
  }
  const ancienne = nomLibre(dossier, `claire-avant-restauration-${stamp}.db`);
  deplacerAvecJournal(cheminDb, ancienne);
  fs.renameSync(depot, cheminDb);
  return { fait: true, ancienne: path.basename(ancienne) };
}

/** Contrôle EN LECTURE SEULE (base + journal tels quels) : 'ok' ou le message de SQLite. Une connexion normale reverserait le
 * journal dans la base en se fermant (vérifié le 06/10 : un journal étranger abîme alors la base pour de bon). @param {string} chemin */
function controlerEnLecture(chemin) {
  let db = null;
  try {
    db = new DatabaseSync(chemin, { readOnly: true });
    const r = db.prepare('PRAGMA quick_check(1)').get();
    const valeur = r ? String(Object.values(r)[0]) : 'contrôle impossible';
    if (valeur !== 'ok') return valeur;
    db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get();
    return 'ok';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  } finally {
    try { if (db) db.close(); } catch (_) { /* déjà fermée */ }
  }
}

/**
 * Ouvre la base après l'avoir contrôlée en lecture seule ; abîmée avec un journal présent → base + journal copiés à part,
 * journal retiré, base contrôlée et ouverte seule. Une base neuve (fichier absent) est créée normalement.
 * @param {string} cheminDb @param {(chemin: string) => any} ouvrir @param {Date} [maintenant]
 * @returns {{ db: any, reparee: null | { copie: string, controle: string } }}
 */
function ouvrirDbVerifiee(cheminDb, ouvrir, maintenant) {
  if (!fs.existsSync(cheminDb)) return { db: ouvrir(cheminDb), reparee: null };
  const dossier = path.dirname(cheminDb);
  const avecJournal = () => SUFFIXES_JOURNAL.some((s) => fs.existsSync(cheminDb + s));
  const premier = controlerEnLecture(cheminDb);
  if (premier === 'ok') return { db: ouvrir(cheminDb), reparee: null };
  if (avecJournal()) {
    const copie = nomLibre(dossier, `claire-abimee-${horodatageFichier(maintenant || new Date())}.db`);
    fs.copyFileSync(cheminDb, copie);
    for (const s of SUFFIXES_JOURNAL) if (fs.existsSync(cheminDb + s)) fs.renameSync(cheminDb + s, copie + s);
    if (controlerEnLecture(cheminDb) === 'ok') {
      // La lecture seule a pu recréer un -shm vide : sans journal, il ne sert à rien.
      fs.rmSync(cheminDb + '-shm', { force: true });
      return { db: ouvrir(cheminDb), reparee: { copie: path.basename(copie), controle: premier } };
    }
  }
  throw new Error(`La base ${cheminDb} est illisible (${premier.split('\n').slice(0, 2).join(' ')}). Pour la remplacer par une `
    + `sauvegarde : copier la sauvegarde voulue (claire-AAAA-MM-JJ.db) dans le dossier ${dossier} sous le nom ${NOM_RESTAURATION}, `
    + 'puis relancer CLAIRE : elle est vérifiée et mise en place au démarrage, l’ancienne base est gardée à côté.');
}

module.exports = {
  NOM_RESTAURATION, horodatageFichier, cheminRestauration, controlerBase, appliquerRestaurationEnAttente, ouvrirDbVerifiee
};
