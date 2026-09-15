'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { genererFluxIcs } = require('../src/routes/calendrier');

// ---- genererFluxIcs() : fonction pure, testée directement sans monter de serveur ----

test('genererFluxIcs : un dossier actif avec les trois échéances produit trois VEVENT', () => {
  const body = genererFluxIcs([
    { id: 'd1', nom: 'DUPONT / MARTIN', pret: '2026-11-11', acte: '2026-12-01', ventebien: '2026-10-05' }
  ]);
  assert.match(body, /BEGIN:VCALENDAR/);
  assert.match(body, /UID:d1-pret@claire-calendrier/);
  assert.match(body, /UID:d1-acte@claire-calendrier/);
  assert.match(body, /UID:d1-ventebien@claire-calendrier/);
  assert.match(body, /Obtention du prêt — MARTIN - Dossier DUPONT \/ MARTIN/);
  assert.equal((body.match(/BEGIN:VEVENT/g) || []).length, 3);
});

test('genererFluxIcs : ignore un dossier archivé', () => {
  const body = genererFluxIcs([{ id: 'd1', nom: 'X / Y', archive: true, pret: '2026-11-11' }]);
  assert.doesNotMatch(body, /BEGIN:VEVENT/);
});

test('genererFluxIcs : une échéance sans date ne produit pas de VEVENT', () => {
  const body = genererFluxIcs([{ id: 'd1', nom: 'X / Y', pret: '', acte: null, ventebien: undefined }]);
  assert.doesNotMatch(body, /BEGIN:VEVENT/);
});

test('genererFluxIcs : inclut les échéances personnalisées (d.autres)', () => {
  const body = genererFluxIcs([
    { id: 'd1', nom: 'X / Y', autres: [{ label: 'Levée hypothèque', date: '2026-09-30' }] }
  ]);
  assert.match(body, /UID:d1-autre-0@claire-calendrier/);
  assert.match(body, /SUMMARY:Levée hypothèque — Y - Dossier X \/ Y/);
});

test('genererFluxIcs : dossier sans "/" dans le nom retombe sur le nom complet', () => {
  const body = genererFluxIcs([{ id: 'd1', nom: 'UN SEUL NOM', pret: '2026-11-11' }]);
  assert.match(body, /Obtention du prêt — UN SEUL NOM - Dossier UN SEUL NOM/);
});

// ---- Route GET /calendrier.ics : jeton dédié, hors du mot de passe de session ----

const JETON_CALENDRIER = 'jeton-calendrier-test';

function config(jetonCalendrier) {
  return {
    motDePasse: 'mdp-test',
    racineRepo: os.tmpdir(),
    port: 0,
    jetonCalendrier
  };
}

let db, serveur, baseUrl;

before(async () => {
  db = ouvrirDb(':memory:');
  const { app, depot } = creerApp({ db, config: config(JETON_CALENDRIER) });
  depot.creer({ id: 'd-cal-1', nom: 'DUPONT / MARTIN', pret: '2026-11-11' });
  serveur = app.listen(0);
  await new Promise((resolve) => serveur.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveur.address().port}`;
});

after(() => {
  serveur.close();
  db.close();
});

test('GET /calendrier.ics sans jeton renvoie 403 (jamais le contenu du registre)', async () => {
  const reponse = await fetch(`${baseUrl}/calendrier.ics`);
  assert.equal(reponse.status, 403);
});

test('GET /calendrier.ics avec un mauvais jeton renvoie 403', async () => {
  const reponse = await fetch(`${baseUrl}/calendrier.ics?token=nimportequoi`);
  assert.equal(reponse.status, 403);
});

test('GET /calendrier.ics avec le bon jeton renvoie le flux ICS, sans authentification de session', async () => {
  // Volontairement AUCUN en-tête Authorization ici : c'est tout le point de cette route, un
  // client webcal ne peut pas en envoyer.
  const reponse = await fetch(`${baseUrl}/calendrier.ics?token=${JETON_CALENDRIER}`);
  assert.equal(reponse.status, 200);
  assert.match(reponse.headers.get('content-type') || '', /text\/calendar/);
  const corps = await reponse.text();
  assert.match(corps, /BEGIN:VCALENDAR/);
  assert.match(corps, /UID:d-cal-1-pret@claire-calendrier/);
});

test('GET /calendrier.ics renvoie 503 quand aucun jeton n\'est configuré sur le serveur', async () => {
  const db2 = ouvrirDb(':memory:');
  const { app: app2 } = creerApp({ db: db2, config: config('') });
  const serveur2 = app2.listen(0);
  await new Promise((resolve) => serveur2.once('listening', resolve));
  const baseUrl2 = `http://127.0.0.1:${serveur2.address().port}`;

  const reponse = await fetch(`${baseUrl2}/calendrier.ics?token=peu-importe`);
  assert.equal(reponse.status, 503);

  serveur2.close();
  db2.close();
});
