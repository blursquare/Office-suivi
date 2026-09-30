'use strict';

// Classeur des scans du copieur (demandé par l'étude le 30/09) : tous les scans arrivent dans UN
// dossier « Scan » à la racine du NAS ; CLAIRE les reconnaît (dossier client + type de pièce) et
// les range dans la bonne rubrique du dossier client.
//
// Partage des rôles, choisi pour que le poste n'ait RIEN à installer (pas de Python, de Tesseract
// ni de Ghostscript à côté du .exe) :
//   - le NAVIGATEUR lit le scan (pdf.js, et l'OCR tesseract.js déjà utilisé pour les compromis
//     scannés) et décide dossier + type de pièce (fonctions pures de script.js, testées) ;
//   - le SERVEUR (ce module) trouve le dossier Scan, liste les scans, sert leurs octets et fait le
//     seul geste qui écrit : copier le scan dans le dossier client, puis déplacer l'original dans
//     un sous-dossier d'archive du dossier Scan. Il ne supprime jamais rien.
//
// Garde-fous (mêmes principes que nas.js) : un nom de scan venant d'une requête est un simple nom
// de fichier (jamais un chemin), PDF seulement, posé directement dans le dossier Scan ; la
// destination passe par resoudreCheminNas (confinée à la racine des dossiers clients) ; la copie
// n'écrase jamais un fichier existant ; l'original n'est déplacé qu'après une copie complète.

const path = require('node:path');
const fsp = require('node:fs/promises');
const fsc = require('node:fs');
const { resoudreCheminNas, listerSousDossiers } = require('./nas');

// Le dossier du copieur s'appelle « Scan » (réponse de l'étude, 30/09) ; « Scans » est toléré.
const RE_NOM_DOSSIER_SCANS = /^scans?$/i;
// Sous-dossier du dossier Scan où l'original part une fois rangé : jamais relu comme un scan à
// traiter (seuls les fichiers posés DIRECTEMENT dans Scan le sont).
const NOM_ARCHIVE_SCANS = 'CLAIRE - scans rangés';
const NIVEAUX_PARENTS_MAX = 8;
// Un scan dont la date de modification a moins de 15 s peut être encore en cours d'écriture par
// le copieur : il n'est proposé qu'au passage suivant.
const DELAI_STABILITE_MS = 15000;
const MAX_SCANS = 200;
const MAX_JOURNAL = 300;

// Pure : les dossiers où chercher « Scan », du plus proche au plus lointain — la racine des
// dossiers clients puis chacun de ses parents, jusqu'à la racine du partage (même logique que les
// reçus comptables, voir dossiersRecusCandidats). `p` = module path (path.win32 dans les tests).
function parentsCandidats(racine, p = path) {
  if (!racine) return [];
  const niveaux = [p.resolve(racine)];
  for (let i = 0; i < NIVEAUX_PARENTS_MAX; i++) {
    const dernier = niveaux[niveaux.length - 1];
    const parent = p.dirname(dernier);
    if (!parent || parent === dernier) break;
    niveaux.push(parent);
  }
  return niveaux;
}

// Pure : le dossier du copieur peut être un PARTAGE à part du même NAS, à côté du partage des
// dossiers clients : chez l'étude, `\\192.168.60.5\Scan` alors que les dossiers sont sous
// `\\192.168.60.5\Commun` (réponse du 30/09). Remonter les dossiers parents ne l'atteint jamais —
// on ne liste pas les partages d'un serveur —, d'où ces candidats `\\serveur\Scan` construits à
// partir du chemin UNC de la racine. Rien pour un chemin local.
function partagesScansCandidats(racine) {
  const m = /^\\\\([^\\/]+)[\\/]/.exec(String(racine || '').replace(/\//g, '\\'));
  if (!m) return [];
  return ['Scan', 'Scans', 'SCAN'].map((nom) => `\\\\${m[1]}\\${nom}`);
}

async function estDossier(chemin, fsImpl) {
  try { return (await fsImpl.stat(chemin)).isDirectory(); } catch (_) { /* essai suivant */ }
  // Racine d'un partage réseau (« \\serveur\Scan ») : sous Windows, stat peut la refuser sans la
  // barre finale et l'accepter avec.
  if (/^\\\\[^\\]+\\[^\\]+$/.test(String(chemin))) {
    try { return (await fsImpl.stat(chemin + '\\')).isDirectory(); } catch (_) { return false; }
  }
  return false;
}

// Dernier dossier du copieur trouvé : essayé d'abord, pour ne pas reparcourir les candidats à
// chaque relecture (toutes les 2 minutes par fenêtre CLAIRE ouverte).
let dernierDossierScans = null;

// Le dossier Scan : `config.nasScans` s'il est renseigné (config.json, réservé à l'administrateur
// du poste), sinon le partage `\\serveur\Scan` du même NAS, sinon le premier dossier nommé « Scan »
// dans la racine des dossiers clients ou l'un de ses parents. Jamais un chemin reçu d'une requête.
async function trouverDossierScans(config, fsImpl = fsp) {
  const cle = JSON.stringify([config && config.nasScans, config && config.nasRacine]);
  if (dernierDossierScans && dernierDossierScans.cle === cle && await estDossier(dernierDossierScans.chemin, fsImpl)) return dernierDossierScans.chemin;
  const trouve = await chercherDossierScans(config, fsImpl);
  dernierDossierScans = trouve ? { cle, chemin: trouve } : null;
  return trouve;
}

async function chercherDossierScans(config, fsImpl) {
  if (config && config.nasScans) {
    return (await estDossier(config.nasScans, fsImpl)) ? path.resolve(config.nasScans) : null;
  }
  for (const partage of partagesScansCandidats(config && config.nasRacine)) {
    if (await estDossier(partage, fsImpl)) return partage;
  }
  for (const dossier of parentsCandidats(config && config.nasRacine)) {
    let entrees;
    try { entrees = await fsImpl.readdir(dossier, { withFileTypes: true }); } catch (_) { continue; }
    const trouve = entrees.find((e) => e.isDirectory() && RE_NOM_DOSSIER_SCANS.test(e.name));
    if (trouve) return path.join(dossier, trouve.name);
  }
  return null;
}

// Pure : l'instant à partir duquel un scan est « nouveau ». `depuis` est l'heure exacte de
// l'activation (ISO complet) — seuls les scans arrivés APRÈS sont traités, jamais ceux déjà dans
// le dossier du copieur ce jour-là — ou une date AAAA-MM-JJ choisie dans les réglages (minuit).
function depuisMsScans(depuis) {
  const v = String(depuis || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return Date.parse(v + 'T00:00:00');
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : NaN;
}

// Pure : un nom de scan acceptable venant d'une requête — un simple nom de PDF, sans séparateur,
// sans « .. », ni fichier caché/temporaire.
function nomScanValide(nom) {
  const n = String(nom || '');
  if (!n || n.length > 255 || n.includes('\0')) return false;
  if (/[\\/]/.test(n) || n === '.' || n === '..' || n.includes('..')) return false;
  if (/^[.~$]/.test(n)) return false;
  return /\.pdf$/i.test(n);
}

async function listerScans(dossierScans, depuisMs, maintenantMs = Date.now(), fsImpl = fsp) {
  let entrees;
  try { entrees = await fsImpl.readdir(dossierScans, { withFileTypes: true }); } catch (_) { return []; }
  const scans = [];
  for (const e of entrees) {
    if (!e.isFile() || !nomScanValide(e.name)) continue;
    let st;
    try { st = await fsImpl.stat(path.join(dossierScans, e.name)); } catch (_) { continue; }
    if (!(st.size > 0)) continue;
    if (Number.isFinite(depuisMs) && st.mtimeMs < depuisMs) continue;
    scans.push({ nom: e.name, taille: st.size, date: new Date(st.mtimeMs).toISOString(), stable: maintenantMs - st.mtimeMs >= DELAI_STABILITE_MS });
  }
  return scans.sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_SCANS);
}

// ---- Rubriques du dossier client -------------------------------------------------------------
// Arborescence réelle de l'étude (modèle « DOSSIER TYPE », voir docs/historique.md) : « 1 -
// Vendeur », « 3 - Titre de propriété », « 8 - COPRO et ETAT DATE/ETAT DATE », « 9 - AAE »…,
// numérotée différemment selon MAISON, COPRO ou TERRAIN. Une rubrique est donc retrouvée par son
// NOM, jamais par son numéro. Chaque clé est un chemin de motifs (sous-dossier dans sous-dossier).
const RUBRIQUES_SCANS = {
  vendeur: [/^VENDEURS?$/],
  acquereur: [/^ACQUEREURS?$/],
  titre: [/TITRE/],
  diagnostics: [/DIAGNOSTIC/],
  environnement: [/ENVIRONNEMENT/],
  hypotheque: [/HYPOTHECAIRE|FORMALITES?/],
  travaux: [/TRAVAUX/],
  construction: [/CONSTRUCTION/],
  sru: [/^SRU$/],
  aae: [/^AAE$/],
  copro: [/COPRO/],
  etatDate: [/COPRO/, /^ETAT DATE$/],
  preEtatDate: [/COPRO/, /^PRE ETAT DATE$/],
  comptabilite: [/COMPTABILITE/],
  pret: [/COMPTABILITE/, /^PRET$/]
};

// Pure : « 8 - COPRO et ETAT DATE » → « COPRO ET ETAT DATE » (accents, numéro de rubrique et
// ponctuation retirés).
function nomRubriqueNormalise(nom) {
  return String(nom || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/^\s*\d+\s*[-–.)]?\s*/, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Chemin relatif (depuis le dossier client) de la première rubrique trouvée parmi `cles`, dans
// l'ordre ; un niveau introuvable arrête la descente au niveau atteint (« 8 - COPRO » sans
// sous-dossier « ETAT DATE » : le scan va dans « 8 - COPRO »). '' = racine du dossier client.
async function resoudreRubrique(dossierClientAbsolu, cles, lister = listerSousDossiers) {
  for (const cle of Array.isArray(cles) ? cles : []) {
    const motifs = RUBRIQUES_SCANS[cle];
    if (!motifs) continue;
    const segments = [];
    let courant = dossierClientAbsolu;
    for (const motif of motifs) {
      const sous = await lister(courant);
      const trouve = sous.find((nom) => motif.test(nomRubriqueNormalise(nom)));
      if (!trouve) break;
      segments.push(trouve);
      courant = path.join(courant, trouve);
    }
    if (segments.length) return segments.join(path.sep);
  }
  return '';
}

// Pure : un nom de fichier sûr sous Windows, à partir de celui proposé par le navigateur.
function nomFichierSur(nom, repli = 'Scan') {
  let n = String(nom || '').normalize('NFC')
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  n = n.replace(/\.pdf$/i, '').trim();
  if (!n) n = repli;
  if (n.length > 120) n = n.slice(0, 120).trim();
  return n + '.pdf';
}

async function existe(chemin, fsImpl = fsp) {
  try { await fsImpl.access(chemin); return true; } catch (_) { return false; }
}

// « Nom.pdf », sinon « Nom (2).pdf », « Nom (3).pdf »… : jamais d'écrasement.
async function cheminLibre(dossier, nomFichier, fsImpl = fsp) {
  const ext = path.extname(nomFichier);
  const base = nomFichier.slice(0, nomFichier.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    const candidat = path.join(dossier, i === 1 ? nomFichier : `${base} (${i})${ext}`);
    if (!(await existe(candidat, fsImpl))) return candidat;
  }
  throw new Error('Trop de fichiers du même nom dans la rubrique.');
}

// Copie du scan dans le dossier client, puis déplacement de l'original dans l'archive du dossier
// Scan. Renvoie les chemins utiles au journal. Toute erreur avant la fin de la copie laisse
// l'original en place (et retire une copie partielle).
async function rangerScan({ dossierScans, nasRacine, nom, dossierNas, rubriques, nomCible, maintenant = new Date() }, fsImpl = fsp) {
  if (!nomScanValide(nom)) return { erreur: 'Nom de scan invalide.', statut: 400 };
  const source = path.join(dossierScans, nom);
  if (!(await existe(source, fsImpl))) return { erreur: 'Ce scan n’est plus dans le dossier Scan (déjà rangé ?).', statut: 404 };
  if (!dossierNas || !String(dossierNas).trim()) return { erreur: 'Dossier client manquant.', statut: 400 };
  const dossierClient = await resoudreCheminNas(nasRacine, dossierNas, fsImpl);
  if (!dossierClient || dossierClient === path.resolve(nasRacine)) return { erreur: 'Dossier client hors du NAS configuré.', statut: 400 };
  let st;
  try { st = await fsImpl.stat(dossierClient); } catch (_) { st = null; }
  if (!st || !st.isDirectory()) return { erreur: 'Dossier client introuvable sur le NAS.', statut: 404 };

  const rubrique = await resoudreRubrique(dossierClient, rubriques, (d) => listerSousDossiers(d, fsImpl));
  const dossierCible = path.join(dossierClient, rubrique);
  const cible = await cheminLibre(dossierCible, nomFichierSur(nomCible), fsImpl);
  try {
    await fsImpl.copyFile(source, cible, fsc.constants.COPYFILE_EXCL);
    const [a, b] = await Promise.all([fsImpl.stat(source), fsImpl.stat(cible)]);
    if (a.size !== b.size) throw new Error('Copie incomplète.');
  } catch (e) {
    try { await fsImpl.unlink(cible); } catch (_) { /* rien à retirer */ }
    return { erreur: 'La copie dans le dossier client a échoué : ' + (e && e.code ? e.code : 'erreur d’écriture'), statut: 500 };
  }
  // L'original part dans l'archive du dossier Scan (sous-dossier par mois). Un échec ici n'annule
  // pas le rangement : la copie est faite, l'original reste simplement dans Scan et sera signalé
  // comme déjà rangé grâce au journal.
  const mois = maintenant.toISOString().slice(0, 7);
  const archive = path.join(dossierScans, NOM_ARCHIVE_SCANS, mois);
  let original = null;
  try {
    await fsImpl.mkdir(archive, { recursive: true });
    original = await cheminLibre(archive, nom, fsImpl);
    await fsImpl.rename(source, original);
  } catch (_) {
    try {
      await fsImpl.copyFile(source, original, fsc.constants.COPYFILE_EXCL);
      await fsImpl.unlink(source);
    } catch (__) {
      original = null;
    }
  }
  return {
    chemin: path.relative(path.resolve(nasRacine), cible),
    rubrique,
    original: original ? path.relative(dossierScans, original) : null
  };
}

// Pure : journal borné, le plus récent en tête.
function ajouterAuJournal(journal, entree) {
  return [entree, ...(Array.isArray(journal) ? journal : [])].slice(0, MAX_JOURNAL);
}

module.exports = {
  trouverDossierScans, parentsCandidats, partagesScansCandidats, depuisMsScans, nomScanValide, listerScans, nomRubriqueNormalise,
  resoudreRubrique, nomFichierSur, cheminLibre, rangerScan, ajouterAuJournal,
  RUBRIQUES_SCANS, NOM_ARCHIVE_SCANS, DELAI_STABILITE_MS, MAX_JOURNAL
};
