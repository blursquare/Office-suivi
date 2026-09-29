// Icône nette de l'application CLAIRE déjà installée dans Chrome/Edge (demandé par l'étude le
// 29/09 : « le logo est toujours très pixelisé » — et l'application étant déjà installée, le
// navigateur ne propose plus de la réinstaller).
//
// À l'installation, Chrome fabrique ses propres fichiers d'icône à partir des icônes que la page
// donnait À CE MOMENT-LÀ (basse définition avant le 28/09), et ne les régénère plus :
//   <profil>\Web Applications\_crx_<id>\<nom>.ico       icône du raccourci (bureau, barre des tâches)
//   <profil>\Web Applications\Manifest Resources\<id>\Icons\<taille>.png   icônes de la fenêtre
// Le serveur, qui tourne sur ce poste avec le compte de l'étude, remplace ces fichiers par l'icône
// haute définition embarquée dans l'exécutable (même .ico que celui de CLAIRE-serveur.exe, construit
// depuis icone.svg), puis demande à Windows de rafraîchir son cache d'icônes. Seuls les dossiers
// de l'application CLAIRE sont touchés (identifiants calculés depuis l'adresse du serveur), jamais
// un autre fichier du navigateur. Tout est asynchrone et silencieux en cas d'échec.
'use strict';

const path = require('node:path');
const { idApplicationWeb } = require('./navigateurApp');

// Entrées PNG d'un .ico (format Vista+, celui que produit le script de construction). Pure.
function lireEntreesIco(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 6 || buf.readUInt16LE(2) !== 1) return [];
  const n = buf.readUInt16LE(4);
  const entrees = [];
  for (let i = 0; i < n; i++) {
    const e = 6 + 16 * i;
    if (e + 16 > buf.length) break;
    const taille = buf.readUInt8(e) || 256;
    const longueur = buf.readUInt32LE(e + 8);
    const offset = buf.readUInt32LE(e + 12);
    const png = buf.subarray(offset, offset + longueur);
    if (png.length === longueur && png.readUInt32BE(0) === 0x89504e47) entrees.push({ taille, png });
  }
  return entrees;
}

// Identifiants possibles de l'application CLAIRE sur ce poste : ouverte par localhost, 127.0.0.1
// ou une adresse du réseau, avec l'identifiant de manifeste d'avant (« /index.html », l'adresse de
// départ) ou « / ». Pure.
function idsApplicationClaire(port, adresses) {
  const hotes = ['localhost', '127.0.0.1'].concat(adresses || []);
  const ids = new Set();
  for (const h of hotes) {
    for (const chemin of ['/index.html', '/']) ids.add(idApplicationWeb(`http://${h}:${port}${chemin}`));
  }
  return Array.from(ids);
}

// Dossiers « User Data » de Chrome et d'Edge pour cet utilisateur Windows. Pure.
function dossiersDonneesNavigateurs(env) {
  const base = env['LocalAppData'] || env['LOCALAPPDATA'];
  if (!base) return [];
  return [
    path.win32.join(base, 'Google', 'Chrome', 'User Data'),
    path.win32.join(base, 'Microsoft', 'Edge', 'User Data')
  ];
}

// Remplace un fichier seulement si son contenu diffère (pas d'écriture à chaque démarrage).
async function remplacerSiDifferent(fsp, fichier, contenu) {
  try {
    const actuel = await fsp.readFile(fichier);
    if (Buffer.compare(actuel, contenu) === 0) return false;
  } catch (e) { return false; } // fichier absent ou illisible : on ne crée rien
  await fsp.writeFile(fichier, contenu);
  return true;
}

// Parcourt les profils des navigateurs et remplace les icônes de l'application CLAIRE installée.
// Renvoie la liste des fichiers remplacés. `fsp` = fs.promises (injectable pour les tests),
// `joindre` = path.win32.join par défaut.
async function rafraichirIconesApplication({ env, fsp, icoBuffer, port, adresses, joindre = path.win32.join }) {
  const entrees = lireEntreesIco(icoBuffer);
  if (!entrees.length) return [];
  const pngParTaille = new Map(entrees.map((e) => [e.taille, e.png]));
  const ids = idsApplicationClaire(port, adresses);
  const remplaces = [];
  const lister = async (dossier) => { try { return await fsp.readdir(dossier); } catch (e) { return []; } };
  for (const donnees of dossiersDonneesNavigateurs(env)) {
    for (const profil of await lister(donnees)) {
      const webApps = joindre(donnees, profil, 'Web Applications');
      for (const id of ids) {
        // Icône du raccourci : tous les .ico du dossier de l'application.
        const dossierRaccourci = joindre(webApps, `_crx_${id}`);
        for (const nom of await lister(dossierRaccourci)) {
          if (!/\.ico$/i.test(nom)) continue;
          const f = joindre(dossierRaccourci, nom);
          if (await remplacerSiDifferent(fsp, f, icoBuffer)) remplaces.push(f);
        }
        // Icônes de la fenêtre : chaque <taille>.png qui existe dans notre .ico.
        const dossierIcones = joindre(webApps, 'Manifest Resources', id, 'Icons');
        for (const nom of await lister(dossierIcones)) {
          const m = /^(\d+)\.png$/i.exec(nom);
          const png = m && pngParTaille.get(Number(m[1]));
          if (!png) continue;
          const f = joindre(dossierIcones, nom);
          if (await remplacerSiDifferent(fsp, f, png)) remplaces.push(f);
        }
      }
    }
  }
  return remplaces;
}

module.exports = { lireEntreesIco, idsApplicationClaire, dossiersDonneesNavigateurs, rafraichirIconesApplication };
