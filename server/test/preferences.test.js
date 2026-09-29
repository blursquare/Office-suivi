'use strict';

// Thème (mode sombre + couleur) gardé par collaborateur sur le serveur, pour survivre à une
// relance de CLAIRE quel que soit le navigateur ou l'adresse utilisée.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { assainirPreferences } = require('../src/parametresRepo');

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

test('assainirPreferences : seules les valeurs connues sont gardées', () => {
  const p = assainirPreferences({ 'Julie VASSELIN': { theme: 'dark', accent: 'rose' }, '': { theme: 'dark' }, X: { theme: 'bleu' } });
  assert.equal(JSON.stringify(p), JSON.stringify({ 'Julie VASSELIN': { theme: 'dark' } }));
  assert.equal(JSON.stringify(assainirPreferences([1, 2])), '{}');
});

test('route : chaque collaborateur retrouve son thème, un changement partiel conserve le reste', async () => {
  let r = await appeler('/api/preferences', 'PUT', { collaborateur: 'Julie VASSELIN', preferences: { theme: 'dark', accent: 'vert' } });
  assert.equal(r.status, 200);
  await appeler('/api/preferences', 'PUT', { collaborateur: 'Jérémy SAUJOT', preferences: { accent: 'orange' } });
  // Un changement de couleur seul ne remet pas le mode sombre à zéro.
  await appeler('/api/preferences', 'PUT', { collaborateur: 'Julie VASSELIN', preferences: { accent: 'noir' } });
  r = await (await appeler('/api/preferences?collaborateur=' + encodeURIComponent('Julie VASSELIN'))).json();
  assert.equal(JSON.stringify(r.preferences), JSON.stringify({ theme: 'dark', accent: 'noir' }));
  r = await (await appeler('/api/preferences?collaborateur=' + encodeURIComponent('Jérémy SAUJOT'))).json();
  assert.equal(r.preferences.accent, 'orange');
  r = await (await appeler('/api/preferences')).json();
  assert.equal(JSON.stringify(r.preferences), '{}');
  r = await appeler('/api/preferences', 'PUT', { preferences: { theme: 'dark' } });
  assert.equal(r.status, 400);
});

test('widgets du tableau de bord : liste blanche des identifiants et des tailles, doublons écartés', async () => {
  const { assainirWidgetsPreference } = require('../src/parametresRepo');
  const w = assainirWidgetsPreference([
    { id: 'agenda', taille: 'petit' },
    { id: 'inconnu', taille: 'petit' },
    { id: 'aujourdhui', taille: 'geant', masque: true },
    { id: 'agenda', taille: 'grand' },
    'n’importe quoi'
  ]);
  assert.equal(JSON.stringify(w), JSON.stringify([
    { id: 'agenda', taille: 'petit', masque: false },
    { id: 'aujourdhui', taille: 'moyen', masque: true }
  ]));
  assert.equal(assainirWidgetsPreference('pas une liste'), null);
  // Enregistrés par collaborateur, sans toucher au thème.
  await appeler('/api/preferences', 'PUT', { collaborateur: 'Julie VASSELIN', preferences: { widgets: [{ id: 'avancement', taille: 'grand' }] } });
  const r = await (await appeler('/api/preferences?collaborateur=' + encodeURIComponent('Julie VASSELIN'))).json();
  assert.equal(r.preferences.theme, 'dark');
  assert.equal(JSON.stringify(r.preferences.widgets), JSON.stringify([{ id: 'avancement', taille: 'grand', masque: false }]));
});
