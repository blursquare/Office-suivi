#!/usr/bin/env node
// Construit CLAIRE-serveur.exe (Windows x64) à partir du serveur Node, via la fonctionnalité
// officielle "Single Executable Applications" (SEA) de Node.js — voir CLAUDE.md, section "Mode
// serveur intranet", pour le contexte (pourquoi SEA plutôt que pkg/nexe : le serveur utilise
// déjà `node:sqlite`, un module intégré, que SEA supporte nativement puisqu'elle embarque le
// vrai binaire node — un bundler tiers gérerait moins bien un module intégré aussi récent).
//
// Exécuté par moi (ou une future session) dans cet environnement, PAS par l'étude : le fichier
// produit (server/build/CLAIRE-serveur.exe) est livré directement, jamais committé (voir
// .gitignore) ni construit par l'étude elle-même.
//
// Étapes officielles Node SEA : bundle → blob → copier node.exe → (Windows/macOS) retirer la
// signature → injecter le blob via postject → (optionnel) resigner. Ce script s'arrête avant la
// resignature (pas de certificat de signature disponible) — voir server/README.md pour
// l'avertissement SmartScreen que cela implique côté étude.
//
// Dépendance système de CE script (pas de l'exe produit) : `osslsigncode` (paquet Linux,
// `apt-get install osslsigncode`) pour retirer proprement la signature Authenticode du node.exe
// officiel avant injection — équivalent de `signtool remove /s` (Windows) depuis ce sandbox
// Linux. Sans lui, postject accepte quand même d'injecter (avertissement "signature corrompue"
// affiché, sans effet connu sur l'exécution), donc ce n'est pas strictement bloquant, seulement
// plus propre.
'use strict';

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
// Icône Windows de l'exe (voir étape « Icône Windows » plus bas) : rasterisation du SVG (resvg,
// binaire préconstruit, aucune dépendance système) puis écriture de la ressource icône du PE
// (resedit, pur JS). Les deux sont des dépendances de build (server/package.json), installées par
// `npm ci` sur le runner — pas besoin d'un paquet apt (rsvg/imagemagick) ni de wine.
import { Resvg } from '@resvg/resvg-js';
import { NtExecutable, NtExecutableResource, Data, Resource } from 'resedit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(SERVER_DIR, '..');
const BUILD_DIR = path.join(SERVER_DIR, 'build');

// Même version que celle utilisée pour développer/tester ce serveur (node:sqlite, node:sea) —
// évite tout écart de comportement entre le Node de développement et celui embarqué dans l'exe.
const NODE_VERSION = process.version.replace(/^v/, '');
const NODE_ZIP_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const NODE_ZIP_DIRNAME = `node-v${NODE_VERSION}-win-x64`;

const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'; // constante officielle Node SEA, ne pas changer

function etape(n, total, message) {
  console.log(`\n=== [${n}/${total}] ${message} ===`);
}

// Tailles d'icône Windows usuelles : 16/32/48 (explorateur, barre des tâches) et 256 (grandes
// vignettes du bureau — c'est celle qui manquait et faisait paraître l'icône « pixélisée » quand
// Windows agrandissait une petite image). 24/64/128 comblent les tailles intermédiaires.
// Tailles intermédiaires (20/30/36/40/60/72/80/96) : Windows les demande à 125 %/150 %
// d'affichage ; faute de les trouver, il agrandit la taille inférieure et l'icône paraît floue.
const TAILLES_ICONE = [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 128, 256];

// Épaisseur du trait selon la taille : le trait du logo (2,2 sur 48) ne fait plus qu'un demi-pixel
// ou moins en dessous de 32 px et se lit comme une tache grise. Même règle que les favicons PNG
// d'index.html (voir CLAUDE.md, « icône pixelisée »).
function traitIcone(px) {
  return px <= 16 ? 4.2 : px <= 24 ? 3.4 : px <= 32 ? 2.9 : px <= 48 ? 2.5 : 2.2;
}

// Construit un .ico multi-résolutions (entrées PNG, format Vista+) à partir de icone.svg, rasterisé
// net à chaque taille par resvg. Aucun agrandissement d'une image basse résolution — chaque taille
// est rendue depuis le vectoriel.
function construireIcoDepuisSvg(svgPath) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const images = TAILLES_ICONE.map((px) => {
    const svgTaille = svg.replace(/stroke-width="2\.2"/g, `stroke-width="${traitIcone(px)}"`);
    const rendu = new Resvg(svgTaille, { fitTo: { mode: 'width', value: px }, background: 'rgba(0,0,0,0)' });
    return { px, buf: Buffer.from(rendu.render().asPng()) };
  });
  const n = images.length;
  const entete = Buffer.alloc(6 + 16 * n);
  entete.writeUInt16LE(0, 0);      // réservé
  entete.writeUInt16LE(1, 2);      // type 1 = icône
  entete.writeUInt16LE(n, 4);      // nombre d'images
  let offset = 6 + 16 * n;
  const corps = [];
  images.forEach((img, i) => {
    const e = 6 + 16 * i;
    entete.writeUInt8(img.px >= 256 ? 0 : img.px, e + 0); // largeur (0 = 256)
    entete.writeUInt8(img.px >= 256 ? 0 : img.px, e + 1); // hauteur (0 = 256)
    entete.writeUInt8(0, e + 2);   // palette
    entete.writeUInt8(0, e + 3);   // réservé
    entete.writeUInt16LE(1, e + 4);  // plans
    entete.writeUInt16LE(32, e + 6); // bits par pixel
    entete.writeUInt32LE(img.buf.length, e + 8);  // taille de l'image
    entete.writeUInt32LE(offset, e + 12);         // offset de l'image
    offset += img.buf.length;
    corps.push(img.buf);
  });
  return Buffer.concat([entete, ...corps]);
}

// Pose l'icône Windows sur l'exe DÉJÀ produit par postject (ordre vérifié : resedit APRÈS postject —
// dans l'autre sens, postject signale « Relocation corrupted » car resedit décale la section de
// ressources ; ici resedit réécrit proprement les ressources en préservant la ressource
// NODE_SEA_BLOB, confirmé par un contrôle après coup). Non bloquant : si quoi que ce soit échoue,
// l'exe fonctionnel (sans icône) est conservé plutôt que de casser le build.
function poserIconeWindows(exePath, icoBuffer) {
  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = NtExecutableResource.from(exe);
  const iconFile = Data.IconFile.from(icoBuffer);
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, 1, 1033, iconFile.icons.map((i) => i.data)
  );
  res.outputResource(exe);
  const sortie = Buffer.from(exe.generate());
  // Garde-fou : l'icône ne doit jamais faire disparaître le blob SEA (sinon l'exe ne démarrerait
  // plus). On relit le binaire produit et on vérifie que NODE_SEA_BLOB est toujours là AVANT de
  // remplacer le fichier.
  const verif = NtExecutableResource.from(NtExecutable.from(sortie, { ignoreCert: true }));
  const blobPresent = verif.entries.some((e) => e.type === 10 && String(e.id) === 'NODE_SEA_BLOB');
  const iconePresente = verif.entries.some((e) => e.type === 14); // RT_GROUP_ICON
  if (!blobPresent || !iconePresente) {
    throw new Error(`contrôle post-icône échoué (blob SEA: ${blobPresent}, icône: ${iconePresente})`);
  }
  fs.writeFileSync(exePath, sortie);
}

function telecharger(url, dest) {
  return new Promise((resolve, reject) => {
    const fichier = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        // nodejs.org redirige parfois (302) vers un miroir CDN — un seul niveau de redirection
        // suffit ici, pas besoin d'une boucle générique pour ce script à usage unique.
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fichier.close();
          telecharger(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} en téléchargeant ${url}`));
          return;
        }
        res.pipe(fichier);
        fichier.on('finish', () => fichier.close(resolve));
      })
      .on('error', reject);
  });
}

async function main() {
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  etape(1, 6, 'Regroupement du serveur en un seul fichier (esbuild)');
  execSync(
    'npx --no-install esbuild src/index.js --bundle --platform=node --format=cjs ' +
      '--external:node:sqlite --external:node:sea --outfile=build/claire-server.cjs',
    { cwd: SERVER_DIR, stdio: 'inherit' }
  );

  etape(2, 6, 'Génération du blob SEA (avec les fichiers statiques embarqués)');
  // Identité du build, embarquée dans l'exécutable : c'est ainsi que la mise à jour en un clic
  // (src/miseAJour.js) sait quel build tourne sur le poste et s'il en existe un plus récent. Le
  // workflow GitHub fournit CLAIRE_BUILD (numéro du run, le même que le tag serveur-exe-N de la
  // release) et CLAIRE_COMMIT ; une construction locale n'a pas de numéro (build: null).
  const numero = Number.parseInt(process.env.CLAIRE_BUILD || '', 10);
  fs.writeFileSync(path.join(BUILD_DIR, 'build-info.json'), JSON.stringify({
    build: Number.isInteger(numero) && numero > 0 ? numero : null,
    commit: process.env.CLAIRE_COMMIT || '',
    date: new Date().toISOString()
  }));
  // Icône Windows construite ici (avant le blob) : posée sur l'exe à l'étape 6 ET embarquée, pour que
  // l'installateur d'un poste la télécharge (GET /api/poste/icone.ico, voir src/installationPoste.js).
  let ico = null;
  try {
    ico = construireIcoDepuisSvg(path.join(ROOT_DIR, 'icone.svg'));
    fs.writeFileSync(path.join(BUILD_DIR, 'icone.ico'), ico);
  } catch (err) {
    console.warn(`Icône Windows non construite (${err.message.split('\n')[0]}).`);
  }
  const seaConfig = {
    main: 'build/claire-server.cjs',
    output: 'build/sea-prep.blob',
    disableExperimentalSEAWarning: true,
    // Chemins relatifs à SERVER_DIR (cwd de la commande ci-dessous) — voir server/src/app.js
    // (creerMiddlewareAssetsSea) pour ce qui les sert à l'exécution.
    assets: {
      'index.html': '../index.html',
      'style.css': '../style.css',
      ...Object.fromEntries(JSON.parse(fs.readFileSync(path.join(SERVER_DIR, '..', 'client', 'manifest.json'), 'utf8')).map((f) => [`client/${f}`, `../client/${f}`])),
      'questionnaire-satisfaction-pdf.js': '../questionnaire-satisfaction-pdf.js',
      'appel-de-fonds-modele.js': '../appel-de-fonds-modele.js',
      'manifest.json': '../manifest.json',
      'sw.js': '../sw.js',
      'icone.svg': '../icone.svg',
      'build-info.json': 'build/build-info.json',
      ...(ico ? { 'icone.ico': 'build/icone.ico' } : {})
    }
  };
  const seaConfigPath = path.join(SERVER_DIR, 'sea-config.json');
  fs.writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));
  execSync('node --experimental-sea-config sea-config.json', { cwd: SERVER_DIR, stdio: 'inherit' });
  fs.rmSync(seaConfigPath); // fichier de travail uniquement, pas utile une fois le blob produit

  etape(3, 7, `Téléchargement de Node ${NODE_VERSION} pour Windows x64`);
  const zipPath = path.join(BUILD_DIR, 'node-win.zip');
  await telecharger(NODE_ZIP_URL, zipPath);
  execSync(`unzip -o -q "${zipPath}" -d "${BUILD_DIR}"`, { stdio: 'inherit' });
  const exePath = path.join(BUILD_DIR, 'CLAIRE-serveur.exe');
  fs.copyFileSync(path.join(BUILD_DIR, NODE_ZIP_DIRNAME, 'node.exe'), exePath);

  etape(4, 7, 'Retrait de la signature Authenticode existante (si outil disponible)');
  // Procédure officielle Node SEA sur Windows : `signtool remove /s` avant l'injection — outil
  // Windows absent de ce sandbox Linux. `osslsigncode` fait le même travail sur un exécutable PE
  // depuis Linux ; s'il est absent ou échoue, on tente l'injection directe sur le binaire signé
  // (voir CLAUDE.md — risque documenté : le résultat n'est de toute façon pas signé par l'étude,
  // Windows affichera un avertissement SmartScreen dans les deux cas).
  try {
    execSync(`osslsigncode remove-signature -in "${exePath}" -out "${exePath}.tmp"`, { stdio: 'pipe' });
    fs.renameSync(`${exePath}.tmp`, exePath);
    console.log('Signature retirée avec osslsigncode.');
  } catch (err) {
    console.warn(`osslsigncode indisponible ou a échoué (${err.message.split('\n')[0]}) — injection directe tentée.`);
  }

  etape(5, 7, 'Injection du blob dans le binaire (postject)');
  execSync(
    `npx --no-install postject "${exePath}" NODE_SEA_BLOB build/sea-prep.blob ` +
      `--sentinel-fuse ${SEA_FUSE} --overwrite`,
    { cwd: SERVER_DIR, stdio: 'inherit' }
  );

  etape(6, 7, 'Icône Windows de l’exe (resedit, APRÈS postject)');
  // Non bloquant : une icône ratée ne doit jamais empêcher de livrer un exe fonctionnel. Le
  // garde-fou dans poserIconeWindows() vérifie en plus que le blob SEA survit avant de remplacer
  // le fichier.
  try {
    if (!ico) throw new Error('icône non construite');
    poserIconeWindows(exePath, ico);
    console.log(`Icône posée (${TAILLES_ICONE.join('/')} px), blob SEA préservé.`);
  } catch (err) {
    console.warn(`Icône Windows non posée (${err.message.split('\n')[0]}) — exe livré avec l'icône Node par défaut.`);
  }

  etape(7, 7, 'Vérification du fichier produit');
  execSync(`file "${exePath}"`, { stdio: 'inherit' });
  const taille = fs.statSync(exePath).size;
  console.log(`\nOK : ${exePath} (${(taille / 1024 / 1024).toFixed(1)} Mo)`);
}

main().catch((err) => {
  console.error('\nÉchec de la construction :', err.message);
  process.exit(1);
});
