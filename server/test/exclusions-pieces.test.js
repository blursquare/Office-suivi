'use strict';

// Noms de fichiers écartés à la main pour une pièce (voir src/routes/exclusionsPieces.js). Passés
// du navigateur de chaque poste à la base, pour que tout le bureau voie — et puisse défaire — la
// même liste : c'est ce qui bloquait en silence « Courriel alignement et numérotage.pdf ».

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { assainirExclusionsPieces } = require('../src/parametresRepo');

let db, serveurApp, baseUrl, jeton;

before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'm', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' } });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((r) => serveurApp.once('listening', r));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => { serveurApp.close(); db.close(); });

const appeler = (chemin, corps) => fetch(`${baseUrl}${chemin}`, {
  method: corps ? 'POST' : 'GET',
  headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
  body: corps ? JSON.stringify(corps) : undefined
});

test('assainirExclusionsPieces : clés invalides, doublons et valeurs non textuelles écartés', () => {
  const p = assainirExclusionsPieces({ certificatAlignement: ['a', 'a', 3, ' '], 'mauvaise clé': ['x'], vide: [] });
  assert.equal(JSON.stringify(p), JSON.stringify({ certificatAlignement: ['a'] }));
  assert.equal(JSON.stringify(assainirExclusionsPieces(null)), '{}');
});

test('ajout, lecture partagée, puis retrait d\'une exclusion', async () => {
  const nom = 'Courriel alignement et numérotage.pdf';
  let r = await (await appeler('/api/exclusions-pieces', { cle: 'certificatAlignement', nom })).json();
  assert.equal(r.exclusions.certificatAlignement[0], nom);
  // Deux ajouts du même nom : une seule entrée.
  await appeler('/api/exclusions-pieces', { cle: 'certificatAlignement', nom });
  r = await (await appeler('/api/exclusions-pieces')).json();
  assert.equal(r.exclusions.certificatAlignement.length, 1);
  r = await (await appeler('/api/exclusions-pieces/retirer', { cle: 'certificatAlignement', nom })).json();
  assert.equal(r.exclusions.certificatAlignement, undefined);
});

test('corps incomplet : 400 ; sans authentification : 401', async () => {
  assert.equal((await appeler('/api/exclusions-pieces', { cle: 'x' })).status, 400);
  const sans = await fetch(`${baseUrl}/api/exclusions-pieces`);
  assert.equal(sans.status, 401);
});
