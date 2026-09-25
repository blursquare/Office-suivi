'use strict';

// Accès sans mot de passe (demandé par l'étude, 25/09) : authActive === false laisse passer toute
// requête et fait délivrer un jeton par /api/login quel que soit le mot de passe ; l'ancien mode
// reste disponible (authActive absent ou true) et continue de refuser.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { creerGestionnaireAuth } = require('../src/auth');

async function avecServeur(config, fn) {
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '', ...config } });
  const serveur = app.listen(0);
  await new Promise((r) => serveur.once('listening', r));
  const base = `http://127.0.0.1:${serveur.address().port}`;
  try { await fn(base); } finally { serveur.close(); db.close(); }
}

test('sans mot de passe : l’API répond sans jeton, et /api/login délivre un jeton à tout le monde', async () => {
  await avecServeur({ motDePasse: '', authActive: false }, async (base) => {
    assert.equal((await fetch(`${base}/api/dossiers?since=0`)).status, 200);
    const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 200);
    assert.ok((await r.json()).jeton);
  });
});

test('authentification active : sans jeton, 401 ; mauvais mot de passe refusé', async () => {
  await avecServeur({ motDePasse: 'secret' }, async (base) => {
    assert.equal((await fetch(`${base}/api/dossiers?since=0`)).status, 401);
    const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ motDePasse: 'faux' }) });
    assert.equal(r.status, 401);
  });
});

test('un mot de passe accentué est comparé sans lever d’exception', () => {
  const auth = creerGestionnaireAuth('étude41');
  assert.equal(auth.motDePasseValide('étude41'), true);
  assert.equal(auth.motDePasseValide('etude41'), false);
  assert.equal(auth.motDePasseValide('ééééé'), false);
});
