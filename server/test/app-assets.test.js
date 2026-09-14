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
  'script.js': 'console.log("claire");',
  'manifest.json': '{"name":"CLAIRE"}',
  'sw.js': '// service worker',
  'icone.svg': '<svg></svg>'
};

const seaFictif = {
  getAsset: (nom) => {
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

test('/script.js sert script.js en application/javascript', async () => {
  const reponse = await fetch(`${baseUrl}/script.js`);
  assert.match(reponse.headers.get('content-type'), /javascript/);
  assert.equal(await reponse.text(), CONTENU_PAR_FICHIER['script.js']);
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
