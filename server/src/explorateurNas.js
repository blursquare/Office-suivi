'use strict';

// Explorateur du dossier client sur le NAS (étude 20/10 : « un pop-up avec l'explorateur, renommer des pièces et les déplacer d'un
// sous-dossier à un autre »). Tout est CONFINÉ au dossier client relié à la fiche (`d.nasDossier`, lu par le serveur, jamais un
// chemin fourni par le poste) : liens symboliques résolus avant contrôle (`resoudreCheminNas`). Écritures permises : renommer un
// FICHIER (même dossier, même extension) et le déplacer vers un autre sous-dossier EXISTANT du même dossier client. Jamais de
// suppression, jamais d'écrasement (« Nom (2).pdf »), jamais un dossier déplacé ou renommé.

const fsp = require('node:fs/promises');
const path = require('node:path');
const { resoudreCheminNas } = require('./nas');
const { cheminLibre } = require('./scans');

const PROFONDEUR_ARBRE = 5;
const MAX_DOSSIERS_ARBRE = 400;
// Ce que CLAIRE ne sert ni ne touche : fichiers cachés ou de bureau, et tout ce qui s'exécute.
const RE_FICHIER_IGNORE = /^(\.|~\$|thumbs\.db$|desktop\.ini$)/i;
const RE_EXECUTABLE = /\.(exe|bat|cmd|com|msi|ps1|psm1|vbs|vbe|js|jse|wsf|lnk|scr|hta|jar|reg|dll)$/i;
const TYPES_MIME = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8'
};
// Servis dans l'onglet ; le reste est téléchargé.
const AFFICHABLES = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp']);

function erreur(statut, message) { return { erreur: message, statut }; }

// Dossier client absolu (réel), ou null.
async function dossierClientAbsolu(nasRacine, nasDossier) {
  if (!nasRacine || !nasDossier) return null;
  const abs = await resoudreCheminNas(nasRacine, String(nasDossier));
  if (!abs) return null;
  // Comparé à la racine RÉELLE (un lecteur mappé ou un lien symbolique donne un autre chemin que `path.resolve`) : le dossier d'un
  // client n'est jamais la racine du NAS (relecture 20/10 : une fiche reliée à « . »).
  let racineReelle = path.resolve(nasRacine);
  try { racineReelle = await fsp.realpath(racineReelle); } catch (_) { /* racine illisible : la comparaison lexicale reste */ }
  if (abs === racineReelle || abs === path.resolve(nasRacine) || path.relative(racineReelle, abs) === '') return null;
  try { const st = await fsp.stat(abs); return st.isDirectory() ? abs : null; } catch (_) { return null; }
}

// Chemin relatif au dossier client → chemin absolu confiné, ou null.
async function dansDossier(base, relatif) {
  const rel = String(relatif || '').replace(/\\/g, '/');
  // Ni « .. » ni dossier caché (« .git », « .Trash »…) dans le chemin.
  if (rel.split('/').some((seg) => seg === '..' || (seg.startsWith('.') && seg !== '.'))) return null;
  return resoudreCheminNas(base, rel);
}

function relatifDe(base, absolu) { return path.relative(base, absolu).split(path.sep).join('/'); }

// Un niveau du dossier : sous-dossiers et fichiers (nom, taille, date), cachés écartés. Pure côté fichiers : `fsImpl` injectable.
async function listerNiveau(base, relatif, fsImpl = fsp) {
  const abs = await dansDossier(base, relatif);
  if (!abs) return erreur(400, 'Chemin hors du dossier du client.');
  let entrees;
  try { entrees = await fsImpl.readdir(abs, { withFileTypes: true }); } catch (_) { return erreur(404, 'Dossier introuvable sur le NAS.'); }
  const dossiers = [];
  const fichiers = [];
  for (const e of entrees) {
    if (RE_FICHIER_IGNORE.test(e.name) || e.name === '__MACOSX') continue;
    if (e.isDirectory()) dossiers.push({ nom: e.name });
    else if (e.isFile()) {
      let st = null;
      try { st = await fsImpl.stat(path.join(abs, e.name)); } catch (_) { /* fichier verrouillé : listé sans détail */ }
      fichiers.push({ nom: e.name, taille: st ? st.size : null, modifieLe: st ? st.mtime.toISOString() : null });
    }
  }
  dossiers.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }));
  fichiers.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }));
  return { chemin: relatifDe(base, abs), dossiers, fichiers };
}

// Tous les sous-dossiers (chemins relatifs), pour choisir où déplacer.
async function arborescence(base, fsImpl = fsp) {
  const sortie = [];
  const file = [{ abs: base, profondeur: 0 }];
  while (file.length && sortie.length < MAX_DOSSIERS_ARBRE) {
    const c = file.shift();
    let entrees;
    try { entrees = await fsImpl.readdir(c.abs, { withFileTypes: true }); } catch (_) { continue; }
    entrees.filter((e) => e.isDirectory() && !RE_FICHIER_IGNORE.test(e.name) && e.name !== '__MACOSX')
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }))
      .forEach((e) => {
        const abs = path.join(c.abs, e.name);
        sortie.push(relatifDe(base, abs));
        if (c.profondeur + 1 < PROFONDEUR_ARBRE) file.push({ abs, profondeur: c.profondeur + 1 });
      });
  }
  return sortie;
}

// Pure : le nouveau nom d'un fichier — le nom tapé SANS extension, l'extension d'origine est gardée. Rend '' si rien d'utilisable.
// L'extension d'un nom : un point suivi de 1 à 8 lettres ou chiffres en fin de nom (la même règle que la fenêtre du poste).
function extensionDe(nom) { const m = /\.[A-Za-z0-9]{1,8}$/.exec(String(nom || '')); return m ? m[0] : ''; }
const RE_NOM_RESERVE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

function nomFichierRenomme(saisie, nomActuel) {
  const ext = extensionDe(nomActuel);
  let base = String(saisie || '').normalize('NFC').replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) base = base.slice(0, base.length - ext.length);
  base = base.replace(/^[\s.]+|[\s.]+$/g, '').slice(0, 150).trim();
  if (!base) return '';
  if (RE_NOM_RESERVE.test(base + ext)) base = 'Document ' + base;
  return base + ext;
}

async function existe(chemin, fsImpl = fsp) { try { await fsImpl.access(chemin); return true; } catch (_) { return false; } }

// Un fichier (jamais un dossier) ni caché ni exécutable, dans le dossier client.
async function fichierManipulable(base, relatif, fsImpl = fsp) {
  const abs = await dansDossier(base, relatif);
  if (!abs || abs === base) return erreur(400, 'Chemin hors du dossier du client.');
  const nom = path.basename(abs);
  if (RE_FICHIER_IGNORE.test(nom) || RE_EXECUTABLE.test(nom)) return erreur(400, 'Ce fichier n’est pas touché par CLAIRE.');
  let st;
  try { st = await fsImpl.stat(abs); } catch (_) { return erreur(404, 'Fichier introuvable (déjà déplacé ?).'); }
  if (!st.isFile()) return erreur(400, 'Seuls les fichiers se renomment ou se déplacent.');
  return { abs, nom };
}

// Renomme / déplace SANS jamais écraser, même si un autre geste (ou le classeur des scans) pose le même nom entre-temps : un lien
// physique ne se crée pas sur un nom pris (EEXIST), puis l'ancien nom est retiré. Un partage qui ne sait pas faire de lien physique
// retombe sur « le nom est-il libre ? » puis `rename` (course possible, mais sans autre voie sur ce partage) ; un autre volume
// (EXDEV) passe par une copie sans écrasement. Rend true, ou lève une erreur de code EEXIST.
async function deplacerSansEcraser(de, vers, fsImpl = fsp) {
  try {
    await fsImpl.link(de, vers);
  } catch (e) {
    if (e && e.code === 'EEXIST') throw e;
    if (e && e.code === 'EXDEV') {
      await fsImpl.copyFile(de, vers, require('node:fs').constants.COPYFILE_EXCL);
      await fsImpl.unlink(de);
      return true;
    }
    // Pas de lien physique ici (SMB, FAT…) : test puis renommage.
    if (await existe(vers, fsImpl)) { const err = new Error('exists'); err.code = 'EEXIST'; throw err; }
    await fsImpl.rename(de, vers);
    return true;
  }
  await fsImpl.unlink(de);
  return true;
}

// Les deux chemins désignent-ils le même fichier (seule la casse change, sur un partage insensible à la casse) ?
async function memeFichierSurDisque(a, b, fsImpl = fsp) {
  try {
    const [x, y] = await Promise.all([fsImpl.stat(a), fsImpl.stat(b)]);
    return x.ino !== 0 && x.ino === y.ino && x.dev === y.dev;
  } catch (_) { return false; }
}

// Renomme un fichier dans son dossier. Jamais d'écrasement : un nom déjà pris est refusé.
async function renommerFichier(base, relatif, saisie, fsImpl = fsp) {
  const f = await fichierManipulable(base, relatif, fsImpl);
  if (f.erreur) return f;
  const nouveau = nomFichierRenomme(saisie, f.nom);
  if (!nouveau) return erreur(400, 'Donnez un nom au fichier.');
  if (RE_EXECUTABLE.test(nouveau)) return erreur(400, 'Nom refusé.');
  if (nouveau === f.nom) return { ok: true, chemin: relatifDe(base, f.abs), nom: f.nom, inchange: true };
  const cible = path.join(path.dirname(f.abs), nouveau);
  try {
    if (cible.toLowerCase() === f.abs.toLowerCase() && await memeFichierSurDisque(f.abs, cible, fsImpl)) {
      // Seule la casse change (« rib.pdf » → « RIB.pdf ») et c'est bien le même fichier : un renommage direct, rien n'est écrasé.
      await fsImpl.rename(f.abs, cible);
    } else {
      await deplacerSansEcraser(f.abs, cible, fsImpl);
    }
  } catch (e) {
    if (e && e.code === 'EEXIST') return erreur(409, 'Un fichier porte déjà ce nom dans ce dossier.');
    throw e;
  }
  return { ok: true, chemin: relatifDe(base, cible), nom: nouveau, ancienChemin: relatifDe(base, f.abs) };
}

// Déplace un fichier vers un sous-dossier EXISTANT du même dossier client ('' = la racine du dossier client). Un nom déjà pris à
// l'arrivée devient « Nom (2).ext ».
async function deplacerFichier(base, relatif, versRelatif, fsImpl = fsp) {
  const f = await fichierManipulable(base, relatif, fsImpl);
  if (f.erreur) return f;
  const dest = versRelatif ? await dansDossier(base, versRelatif) : base;
  if (!dest) return erreur(400, 'Destination hors du dossier du client.');
  let st;
  try { st = await fsImpl.stat(dest); } catch (_) { return erreur(404, 'Dossier de destination introuvable (jamais créé ici).'); }
  if (!st.isDirectory()) return erreur(400, 'La destination n’est pas un dossier.');
  if (dest === path.dirname(f.abs)) return erreur(400, 'Le fichier est déjà dans ce dossier.');
  // Un nom pris entre le choix du nom libre et le déplacement : on en cherche un autre, quelques fois.
  for (let essai = 0; essai < 5; essai++) {
    const cible = await cheminLibre(dest, f.nom, fsImpl);
    try {
      await deplacerSansEcraser(f.abs, cible, fsImpl);
      return { ok: true, chemin: relatifDe(base, cible), nom: path.basename(cible), ancienChemin: relatifDe(base, f.abs) };
    } catch (e) {
      if (!e || e.code !== 'EEXIST') throw e;
    }
  }
  return erreur(409, 'Le dossier de destination change trop vite : réessayez.');
}

// Le fichier à servir : type, nom, affichable dans l'onglet ou à télécharger. Les exécutables ne sont jamais servis.
async function fichierAServir(base, relatif, fsImpl = fsp) {
  const f = await fichierManipulable(base, relatif, fsImpl);
  if (f.erreur) return f;
  const ext = path.extname(f.nom).toLowerCase();
  return { abs: f.abs, nom: f.nom, type: TYPES_MIME[ext] || 'application/octet-stream', affichable: AFFICHABLES.has(ext) };
}

module.exports = { deplacerSansEcraser, extensionDe, dossierClientAbsolu, dansDossier, listerNiveau, arborescence, nomFichierRenomme, renommerFichier, deplacerFichier, fichierAServir, fichierManipulable, RE_EXECUTABLE };
