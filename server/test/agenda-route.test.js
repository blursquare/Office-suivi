'use strict';

// Route /api/agenda (voir src/routes/agenda.js) : lecture/écriture de l'URL du calendrier publié,
// et déclenchement manuel d'un tour de lecture (« Tester maintenant »).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

function config() {
  return { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' };
}

let db, serveurApp, baseUrl, jeton, depot, reponsesFetch;

function fauxFetchAgenda() {
  return async () => {
    const r = reponsesFetch.shift();
    if (!r) throw new Error('Aucune réponse simulée disponible pour ce test.');
    return r;
  };
}

before(async () => {
  db = ouvrirDb(':memory:');
  reponsesFetch = [];
  const { app, gestionnaireAuth, depot: d } = creerApp({
    db, config: config(), agenda: { fetchFn: fauxFetchAgenda() }
  });
  depot = d;
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

test('GET /api/agenda sans authentification : 401', async () => {
  const reponse = await fetch(`${baseUrl}/api/agenda`);
  assert.equal(reponse.status, 401);
});

test('GET /api/agenda renvoie les valeurs par defaut au premier appel', async () => {
  const corps = await (await appeler('/api/agenda')).json();
  assert.deepEqual(corps, { reglages: { icsUrl: '' }, dernierTour: null });
});

test('PUT /api/agenda enregistre l\'URL, refuse ce qui n\'est pas http(s)', async () => {
  const ok = await (await appeler('/api/agenda', { method: 'PUT', body: JSON.stringify({ icsUrl: 'https://outlook.office.com/owa/calendar/xyz/reachcalendar.ics' }) })).json();
  assert.equal(ok.reglages.icsUrl, 'https://outlook.office.com/owa/calendar/xyz/reachcalendar.ics');

  const relu = await (await appeler('/api/agenda')).json();
  assert.equal(relu.reglages.icsUrl, 'https://outlook.office.com/owa/calendar/xyz/reachcalendar.ics');

  const mauvais = await (await appeler('/api/agenda', { method: 'PUT', body: JSON.stringify({ icsUrl: 'C:\\Users\\etude\\agenda.ics' }) })).json();
  assert.equal(mauvais.reglages.icsUrl, '', 'un chemin de fichier n\'est pas une URL de calendrier');
});

test('POST /api/agenda/tester sans URL enregistree : 400, rien tente', async () => {
  await appeler('/api/agenda', { method: 'PUT', body: JSON.stringify({ icsUrl: '' }) });
  const reponse = await appeler('/api/agenda/tester', { method: 'POST' });
  assert.equal(reponse.status, 400);
});

test('POST /api/agenda/tester : declenche un vrai tour, met a jour un dossier, persiste le compte rendu', async () => {
  await appeler('/api/agenda', { method: 'PUT', body: JSON.stringify({ icsUrl: 'https://example.test/agenda.ics' }) });
  const d = depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });
  void d;

  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:VTE - DUPONT / MARTIN',
    'LOCATION:BA Appel de fonds envoyé',
    'DTSTART:20991014',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  reponsesFetch.push({ ok: true, status: 200, text: async () => ics });

  const reponse = await appeler('/api/agenda/tester', { method: 'POST' });
  const corps = await reponse.json();
  assert.equal(reponse.status, 200);
  assert.equal(corps.ok, true);
  assert.equal(corps.misAJour.length, 1);
  assert.equal(depot.trouverParId('d1').appelFonds, require('../src/agendaWatch').dateDuJourParis());

  const relu = await (await appeler('/api/agenda')).json();
  assert.equal(relu.dernierTour.ok, true);
  assert.equal(relu.dernierTour.declenche, 'manuel');
});

test('POST /api/agenda/tester : une erreur reseau est rapportee proprement (jamais un plantage)', async () => {
  await appeler('/api/agenda', { method: 'PUT', body: JSON.stringify({ icsUrl: 'https://example.test/agenda.ics' }) });
  reponsesFetch.push({ ok: false, status: 500 });
  const reponse = await appeler('/api/agenda/tester', { method: 'POST' });
  const corps = await reponse.json();
  assert.equal(reponse.status, 200, 'la route repond normalement, l\'echec est porte dans le compte rendu');
  assert.equal(corps.ok, false);
  assert.match(corps.erreur, /500/);
});
