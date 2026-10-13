'use strict';

// Teste creerMiddlewareAssetsSea() (voir server/src/app.js) — le mode de service des fichiers
// statiques utilisé en exécutable autonome (`CLAIRE-serveur.exe`), où `sea.getAsset()` remplace
// `express.static()`. Un faux module `sea` (pas de vrai blob SEA dans les tests) suffit à vérifier
// le mapping chemin → fichier/type MIME.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { creerMiddlewareAssetsSea } = require('../src/app');

const CONTENU_PAR_FICHIER = {
  'index.html': '<!doctype html><title>CLAIRE</title>',
  'style.css': 'body { margin: 0; }',
  'client/00-version.js': 'console.log("claire");',
  'manifest.json': '{"name":"CLAIRE"}',
  'sw.js': '// service worker',
  'icone.svg': '<svg></svg>'
};
// Police : octets hors UTF-8 valide, qu'une lecture en 'utf8' abîmerait.
const POLICE = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0xff, 0xfe, 0x00, 0x80]);

const seaFictif = {
  getAsset: (nom, encodage) => {
    if (nom === 'vendor/polices/geist-latin-wght-normal.woff2') return encodage ? Buffer.from(POLICE).toString(encodage) : POLICE.buffer.slice(0);
    if (!(nom in CONTENU_PAR_FICHIER)) throw new Error(`asset inconnu : ${nom}`);
    return CONTENU_PAR_FICHIER[nom];
  }
};

let serveur;
let baseUrl;

before(async () => {
  const app = express();
  app.use(creerMiddlewareAssetsSea(seaFictif));
  app.use((req, res) => res.status(404).send('non trouvé par le middleware')); // confirme le fallthrough
  serveur = app.listen(0);
  await new Promise((resolve) => serveur.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveur.address().port}`;
});

after(() => new Promise((resolve) => serveur.close(resolve)));

test('/ sert index.html en text/html', async () => {
  const reponse = await fetch(`${baseUrl}/`);
  assert.equal(reponse.status, 200);
  assert.match(reponse.headers.get('content-type'), /text\/html/);
  assert.equal(await reponse.text(), CONTENU_PAR_FICHIER['index.html']);
});

test('/client/00-version.js sert client/00-version.js en application/javascript', async () => {
  const reponse = await fetch(`${baseUrl}/client/00-version.js`);
  assert.match(reponse.headers.get('content-type'), /javascript/);
  assert.equal(await reponse.text(), CONTENU_PAR_FICHIER['client/00-version.js']);
});

test('/script.js : les anciennes fenêtres y relisent la version courante (compatibilité), jamais le programme', async () => {
  const os = require('node:os'); const fs = require('node:fs'); const path = require('node:path');
  const { creerApp } = require('../src/app');
  const { ouvrirDb } = require('../src/db');
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-compat-'));
  fs.mkdirSync(path.join(racine, 'client'));
  fs.writeFileSync(path.join(racine, 'client', '00-version.js'), "  const VERSION_APP = '0.144.35';\n  const HISTORIQUE_VERSIONS = [];");
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { authActive: false, racineRepo: racine, estSea: () => false } });
  const srv = app.listen(0);
  try {
    await new Promise((r) => srv.once('listening', r));
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/script.js`);
    assert.equal(r.status, 200);
    const texte = await r.text();
    assert.match(texte, /const VERSION_APP = '0\.144\.35';/);
    assert.doesNotMatch(texte, /HISTORIQUE_VERSIONS/);
  } finally { srv.close(); db.close(); fs.rmSync(racine, { recursive: true, force: true }); }
});

test('police embarquée servie octet pour octet en font/woff2', async () => {
  const reponse = await fetch(`${baseUrl}/vendor/polices/geist-latin-wght-normal.woff2`);
  assert.match(reponse.headers.get('content-type'), /font\/woff2/);
  assert.deepEqual([...new Uint8Array(await reponse.arrayBuffer())], [...POLICE]);
});

test('/manifest.json sert le bon contenu', async () => {
  const reponse = await fetch(`${baseUrl}/manifest.json`);
  assert.equal(await reponse.text(), CONTENU_PAR_FICHIER['manifest.json']);
});

test('/icone.svg sert le SVG en image/svg+xml', async () => {
  const reponse = await fetch(`${baseUrl}/icone.svg`);
  assert.match(reponse.headers.get('content-type'), /image\/svg\+xml/);
});

test('un chemin non mappé (ex. une route API) passe au middleware suivant', async () => {
  const reponse = await fetch(`${baseUrl}/api/dossiers`);
  assert.equal(reponse.status, 404);
  assert.equal(await reponse.text(), 'non trouvé par le middleware');
});

test('hors .exe : seuls les fichiers de la liste sont servis, jamais la base ni les sources (audit 13/10)', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { creerMiddlewareAssetsDisque } = require('../src/app');
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-assets-'));
  fs.writeFileSync(path.join(racine, 'style.css'), 'body{}');
  fs.mkdirSync(path.join(racine, 'server', 'data'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'server', 'data', 'claire.db'), 'SQLite format 3');
  fs.writeFileSync(path.join(racine, 'package.json'), '{}');
  const app = express();
  app.use(creerMiddlewareAssetsDisque(racine));
  app.use((req, res) => res.status(404).send('non'));
  const srv = app.listen(0);
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const css = await fetch(base + '/style.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
    for (const chemin of ['/server/data/claire.db', '/package.json', '/server/src/app.js', '/../package.json']) {
      assert.equal((await fetch(base + chemin)).status, 404, chemin);
    }
  } finally { srv.close(); fs.rmSync(racine, { recursive: true, force: true }); }
});
