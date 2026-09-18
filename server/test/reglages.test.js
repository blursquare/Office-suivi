'use strict';

// Route /api/reglages (voir src/routes/reglages.js) : lecture/écriture des réglages Teams et
// envoi d'un message de test à UN collaborateur, toujours à partir de ce qui est déjà enregistré
// en base — jamais d'un formulaire pas encore validé (voir le commentaire dans la route).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const http = require('node:http');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { MESSAGE_TEST } = require('../src/routes/reglages');

function config() {
  return { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' };
}

function demarrerFauxWebhook(statut) {
  return new Promise((resolve) => {
    const requetes = [];
    const serveur = http.createServer((req, res) => {
      let corps = '';
      req.on('data', (c) => { corps += c; });
      req.on('end', () => {
        requetes.push(JSON.parse(corps || '{}'));
        res.statusCode = statut || 200;
        res.end('{}');
      });
    });
    serveur.listen(0, () => resolve({ serveur, requetes, url: `http://127.0.0.1:${serveur.address().port}/flux` }));
  });
}

let db, serveurApp, baseUrl, jeton;

before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: config() });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  serveurApp.close();
  db.close();
});

function appeler(chemin, options) {
  return fetch(`${baseUrl}${chemin}`, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(options && options.headers) }
  });
}

test('GET /api/reglages sans authentification : 401', async () => {
  const reponse = await fetch(`${baseUrl}/api/reglages`);
  assert.equal(reponse.status, 401);
});

test('GET /api/reglages renvoie les valeurs par défaut au premier appel', async () => {
  const corps = await (await appeler('/api/reglages')).json();
  assert.deepEqual(corps, { teamsActif: false, teamsWebhookUrl: '', teamsCopieEmail: '', emailsResponsables: {} });
});

test('PUT /api/reglages enregistre, GET relit la même chose ensuite (y compris la copie)', async () => {
  const envoye = { teamsActif: true, teamsWebhookUrl: 'https://exemple.test/flux', teamsCopieEmail: 'gossart@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' } };
  const corpsEcrit = await (await appeler('/api/reglages', { method: 'PUT', body: JSON.stringify(envoye) })).json();
  assert.deepEqual(corpsEcrit, envoye);

  const corpsRelu = await (await appeler('/api/reglages')).json();
  assert.deepEqual(corpsRelu, envoye);
});

test('POST /api/reglages/tester-teams sans webhook enregistré : 400 explicite', async () => {
  await appeler('/api/reglages', { method: 'PUT', body: JSON.stringify({ teamsActif: false, teamsWebhookUrl: '', emailsResponsables: {} }) });
  const reponse = await appeler('/api/reglages/tester-teams', { method: 'POST', body: JSON.stringify({ responsable: 'Bastien ANGLUMENT' }) });
  assert.equal(reponse.status, 400);
  assert.match((await reponse.json()).erreur, /flux Power Automate/);
});

test('POST /api/reglages/tester-teams : sans email pour ce responsable, 400', async () => {
  await appeler('/api/reglages', { method: 'PUT', body: JSON.stringify({ teamsActif: true, teamsWebhookUrl: 'https://exemple.test/flux', emailsResponsables: {} }) });
  const reponse = await appeler('/api/reglages/tester-teams', { method: 'POST', body: JSON.stringify({ responsable: 'Julie VASSELIN' }) });
  assert.equal(reponse.status, 400);
  assert.match((await reponse.json()).erreur, /Julie VASSELIN/);
});

test('POST /api/reglages/tester-teams : envoie bien le MESSAGE_TEST à l\'adresse enregistrée en base (pas celle du corps de la requête)', async () => {
  const faux = await demarrerFauxWebhook(200);
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ teamsActif: true, teamsWebhookUrl: faux.url, emailsResponsables: { 'Jérémy SAUJOT': 'jeremy@etude.fr' } })
  });
  const reponse = await appeler('/api/reglages/tester-teams', { method: 'POST', body: JSON.stringify({ responsable: 'Jérémy SAUJOT' }) });
  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), { ok: true });
  assert.equal(faux.requetes.length, 1);
  assert.deepEqual(faux.requetes[0], { destinataire: 'jeremy@etude.fr', message: MESSAGE_TEST });
  faux.serveur.close();
});

test('POST /api/reglages/tester-teams : le flux répond une erreur → 502', async () => {
  const faux = await demarrerFauxWebhook(500);
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ teamsActif: true, teamsWebhookUrl: faux.url, emailsResponsables: { 'Jérémy SAUJOT': 'jeremy@etude.fr' } })
  });
  const reponse = await appeler('/api/reglages/tester-teams', { method: 'POST', body: JSON.stringify({ responsable: 'Jérémy SAUJOT' }) });
  assert.equal(reponse.status, 502);
  faux.serveur.close();
});
