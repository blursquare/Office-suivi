'use strict';

// Images de la signature des emails (carte de l'office, bannière Visio), déposées dans Réglages.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { assainirImage } = require('../src/routes/signatureImages');

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

const appeler = (chemin, methode, corps) => fetch(`${baseUrl}${chemin}`, {
  method: methode || 'GET',
  headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
  body: corps ? JSON.stringify(corps) : undefined
});
const PNG = { type: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUg==', largeur: 624, hauteur: 208 };

test('assainirImage : PNG/JPEG seulement, base64 propre, dimensions plausibles', () => {
  assert.ok(assainirImage(PNG));
  assert.equal(assainirImage(Object.assign({}, PNG, { type: 'image/svg+xml' })), null);
  assert.equal(assainirImage(Object.assign({}, PNG, { base64: '<script>' })), null);
  assert.equal(assainirImage(Object.assign({}, PNG, { largeur: 0 })), null);
});

test('déposer, relire, remplacer et retirer la carte et la bannière', async () => {
  assert.deepEqual(await (await appeler('/api/signature-images')).json(), {});
  let r = await appeler('/api/signature-images/carte', 'PUT', PNG);
  assert.equal(r.status, 200);
  r = await appeler('/api/signature-images/visio', 'PUT', Object.assign({}, PNG, { type: 'image/jpeg', largeur: 620, hauteur: 70 }));
  const j = await r.json();
  assert.equal(j.carte.largeur, 624);
  assert.equal(j.visio.type, 'image/jpeg');
  assert.equal((await appeler('/api/signature-images/autre', 'PUT', PNG)).status, 404);
  assert.equal((await appeler('/api/signature-images/carte', 'PUT', { type: 'text/plain', base64: 'eA==', largeur: 1, hauteur: 1 })).status, 400);
  const apres = await (await appeler('/api/signature-images/carte', 'DELETE')).json();
  assert.equal(Object.keys(apres).join(), 'visio');
});
