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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..');
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
  const seaConfig = {
    main: 'build/claire-server.cjs',
    output: 'build/sea-prep.blob',
    disableExperimentalSEAWarning: true,
    // Chemins relatifs à SERVER_DIR (cwd de la commande ci-dessous) — voir server/src/app.js
    // (creerMiddlewareAssetsSea) pour ce qui les sert à l'exécution.
    assets: {
      'index.html': '../index.html',
      'style.css': '../style.css',
      'script.js': '../script.js',
      'manifest.json': '../manifest.json',
      'sw.js': '../sw.js',
      'icone.svg': '../icone.svg'
    }
  };
  const seaConfigPath = path.join(SERVER_DIR, 'sea-config.json');
  fs.writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));
  execSync('node --experimental-sea-config sea-config.json', { cwd: SERVER_DIR, stdio: 'inherit' });
  fs.rmSync(seaConfigPath); // fichier de travail uniquement, pas utile une fois le blob produit

  etape(3, 6, `Téléchargement de Node ${NODE_VERSION} pour Windows x64`);
  const zipPath = path.join(BUILD_DIR, 'node-win.zip');
  await telecharger(NODE_ZIP_URL, zipPath);
  execSync(`unzip -o -q "${zipPath}" -d "${BUILD_DIR}"`, { stdio: 'inherit' });
  const exePath = path.join(BUILD_DIR, 'CLAIRE-serveur.exe');
  fs.copyFileSync(path.join(BUILD_DIR, NODE_ZIP_DIRNAME, 'node.exe'), exePath);

  etape(4, 6, 'Retrait de la signature Authenticode existante (si outil disponible)');
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

  etape(5, 6, 'Injection du blob dans le binaire (postject)');
  execSync(
    `npx --no-install postject "${exePath}" NODE_SEA_BLOB build/sea-prep.blob ` +
      `--sentinel-fuse ${SEA_FUSE} --overwrite`,
    { cwd: SERVER_DIR, stdio: 'inherit' }
  );

  etape(6, 6, 'Vérification du fichier produit');
  execSync(`file "${exePath}"`, { stdio: 'inherit' });
  const taille = fs.statSync(exePath).size;
  console.log(`\nOK : ${exePath} (${(taille / 1024 / 1024).toFixed(1)} Mo)`);
}

main().catch((err) => {
  console.error('\nÉchec de la construction :', err.message);
  process.exit(1);
});
