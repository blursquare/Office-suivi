'use strict';

// Carnet des confrères (voir src/carnetConfreres.js, src/routes/confreres.js) : partagé en base,
// parti du relevé de l'annuaire du 41, complété office par office.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { assainirOffice, assainirCarnet, carnetInitial, avecOfficeEtude, CARNET_INITIAL_41, ID_OFFICE_ETUDE } = require('../src/carnetConfreres');

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

test('carnet initial : notre office en tête, puis les 35 offices du 41, identifiants uniques', () => {
  const carnet = carnetInitial();
  assert.equal(CARNET_INITIAL_41.length, 35);
  assert.equal(carnet.length, 36);
  assert.equal(carnet[0].id, ID_OFFICE_ETUDE);
  assert.equal(carnet[0].etude, true);
  assert.equal(carnet[0].email, 'office.gossart@notaires.fr');
  assert.ok(carnet.every((o) => o.notaires.length && o.codePostal.startsWith('41') && o.source));
  assert.equal(carnet.filter((o) => /GOSSART/i.test(o.office + o.notaires.join(' '))).length, 1);
  assert.ok(carnet.slice(1).every((o) => o.etude === false));
  assert.equal(new Set(carnet.map((o) => o.id)).size, carnet.length);
});

test('avecOfficeEtude : remet notre office s’il manque, ne le double jamais', () => {
  const r = avecOfficeEtude([{ id: 'x', office: 'X', notaires: ['A B'] }]);
  assert.equal(r.ajoute, true);
  assert.equal(r.carnet.map((o) => o.id).join(), ID_OFFICE_ETUDE + ',x');
  assert.equal(avecOfficeEtude(r.carnet).ajoute, false);
  // Un office quelconque ne peut pas se déclarer « notre office ».
  assert.equal(assainirOffice({ id: 'y', office: 'Y', etude: true }).etude, false);
});

test('assainirOffice : liste blanche, email invalide vidé, office vide refusé', () => {
  const o = assainirOffice({ id: 'c-1', office: '  SCP  DURAND ', notaires: ['Paul DURAND', 'Paul DURAND', 3], email: 'pas un email', codePostal: '4500', pirate: 'x' });
  assert.equal(o.office, 'SCP DURAND');
  assert.equal(o.notaires.join('|'), 'Paul DURAND');
  assert.equal(o.email, '');
  assert.equal(o.codePostal, '');
  assert.equal('pirate' in o, false);
  assert.equal(assainirOffice({ id: 'c-2', office: '', notaires: [] }), null);
  assert.equal(assainirOffice({ id: '../x', office: 'X' }), null);
  assert.equal(assainirCarnet([{ id: 'a', office: 'A' }, { id: 'a', office: 'B' }]).map((x) => x.office).join(), 'B');
});

test('GET part du relevé du 41 ; POST ajoute puis corrige un office ; DELETE le retire', async () => {
  let r = await appeler('/api/confreres');
  assert.equal(r.status, 200);
  let j = await r.json();
  assert.equal(j.offices.length, 36);

  const nouveau = { id: 'saisie-1', office: 'SELARL Paul DURAND', notaires: ['Paul DURAND'], email: 'office.durand@notaires.fr', ville: 'Orléans', codePostal: '45000' };
  r = await appeler('/api/confreres', 'POST', { office: nouveau });
  j = await r.json();
  assert.equal(j.offices.length, 37);
  assert.ok(j.offices.find((o) => o.id === 'saisie-1').modifieLe);

  r = await appeler('/api/confreres', 'POST', { office: Object.assign({}, nouveau, { telephone: '02 38 00 00 00' }) });
  j = await r.json();
  assert.equal(j.offices.length, 37);
  assert.equal(j.offices.find((o) => o.id === 'saisie-1').telephone, '02 38 00 00 00');

  r = await appeler('/api/confreres', 'POST', { office: { id: 'x', office: '' } });
  assert.equal(r.status, 400);

  r = await appeler('/api/confreres/saisie-1', 'DELETE');
  j = await r.json();
  assert.equal(j.offices.length, 36);
  // Notre office ne se retire pas.
  r = await appeler('/api/confreres/' + ID_OFFICE_ETUDE, 'DELETE');
  assert.equal(r.status, 400);
  // Un carnet vidé à la main garde seulement notre office : le relevé n'est rechargé que si la
  // clé disparaît.
  for (const o of j.offices) await appeler('/api/confreres/' + o.id, 'DELETE');
  j = await (await appeler('/api/confreres')).json();
  assert.equal(j.offices.map((o) => o.id).join(), ID_OFFICE_ETUDE);
});
