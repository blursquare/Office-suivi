'use strict';

// « Mes rappels » du tableau de bord (voir src/routes/rappelsPerso.js) : chaque collaborateur ne
// lit que les siens, un rappel s'ajoute, se coche et se supprime seul.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { assainirRappelPerso } = require('../src/parametresRepo');

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

test('assainirRappelPerso : texte et auteur requis, dates vérifiées', () => {
  assert.equal(assainirRappelPerso({ id: 'a', texte: '', auteur: 'Julie VASSELIN' }), null);
  assert.equal(assainirRappelPerso({ id: 'a', texte: 'x', auteur: '' }), null);
  assert.equal(assainirRappelPerso({ id: 'a b', texte: 'x', auteur: 'J' }), null);
  const r = assainirRappelPerso({ id: 'a', texte: ' Appeler le syndic ', auteur: 'Julie VASSELIN', echeance: '30/09/2026', fait: false, faitLe: 'x' });
  assert.equal(r.texte, 'Appeler le syndic');
  assert.equal(r.echeance, '');
  assert.equal(r.faitLe, '');
});

test('route : ajout, lecture par collaborateur, coche, suppression', async () => {
  let r = await appeler('/api/rappels-perso', 'POST', { rappel: { id: 'r1', texte: 'Signer', auteur: 'Julie VASSELIN', echeance: '2026-09-30' } });
  assert.equal(r.status, 200);
  await appeler('/api/rappels-perso', 'POST', { rappel: { id: 'r2', texte: 'Autre', auteur: 'Jérémy SAUJOT' } });
  r = await (await appeler('/api/rappels-perso?auteur=' + encodeURIComponent('Julie VASSELIN'))).json();
  assert.equal(r.rappels.map((x) => x.id).join(','), 'r1');
  // Sans collaborateur : rien, jamais la liste de tout le bureau.
  r = await (await appeler('/api/rappels-perso')).json();
  assert.equal(r.rappels.length, 0);
  await appeler('/api/rappels-perso', 'POST', { rappel: { id: 'r1', texte: 'Signer', auteur: 'Julie VASSELIN', echeance: '2026-09-30', fait: true, faitLe: '2026-09-25T10:00:00.000Z' } });
  r = await (await appeler('/api/rappels-perso?auteur=' + encodeURIComponent('Julie VASSELIN'))).json();
  assert.equal(r.rappels[0].fait, true);
  assert.equal((await appeler('/api/rappels-perso/r1', 'DELETE')).status, 200);
  assert.equal((await appeler('/api/rappels-perso/r1', 'DELETE')).status, 404);
  assert.equal((await appeler('/api/rappels-perso', 'POST', { rappel: { id: 'r3' } })).status, 400);
});
