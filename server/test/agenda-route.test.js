'use strict';

// Route /api/agenda (voir src/routes/agenda.js) : état de la lecture de l'agenda de l'office (par
// EWS, avec la connexion Exchange des Réglages) et déclenchement manuel d'un tour (« Tester
// maintenant »). Aucun identifiant ne doit ressortir de ces routes.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { creerRepoParametres } = require('../src/parametresRepo');
const { reinitialiserDisjoncteurAgenda } = require('../src/agendaWatch');

function config() {
  return { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' };
}

let db, serveurApp, baseUrl, jeton, depot, parametresRepo, reponsesEws;

// Faux transport EWS : rend la prochaine réponse simulée (ou une liste vide, pour les tranches suivantes).
function fauxPoster(options, rappel) {
  const r = reponsesEws.shift() || { statusCode: 200, body: findItem('') };
  setImmediate(() => rappel(null, r));
}

function findItem(items) {
  return '<m:FindItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode>'
    + '<m:RootFolder IncludesLastItemInRange="true"><t:Items>' + items + '</t:Items></m:RootFolder></m:FindItemResponseMessage>';
}

before(async () => {
  reinitialiserDisjoncteurAgenda();
  db = ouvrirDb(':memory:');
  reponsesEws = [];
  const { app, gestionnaireAuth, depot: d } = creerApp({ db, config: config(), agenda: { poster: fauxPoster } });
  depot = d;
  parametresRepo = creerRepoParametres(db);
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  reinitialiserDisjoncteurAgenda();
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

test('GET /api/agenda renvoie l’état par défaut au premier appel', async () => {
  const corps = await (await appeler('/api/agenda')).json();
  assert.deepEqual(corps, {
    source: { configuree: false, calendrier: '', suspendue: false }, dernierTour: null, absences: [], categories: [], agendaDuJour: null
  });
});

test('POST /api/agenda/tester sans connexion configurée : 400, rien tenté', async () => {
  const reponse = await appeler('/api/agenda/tester', { method: 'POST' });
  assert.equal(reponse.status, 400);
});

test('POST /api/agenda/tester : déclenche un vrai tour, met à jour un dossier, persiste le compte rendu', async () => {
  parametresRepo.ecrireReglagesExchange({
    actif: true, email: 'bastien@etude.test', motDePasse: 'mdp-secret', calendrierPartage: 'sophie@etude.test'
  });
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });
  reponsesEws.push({
    statusCode: 200,
    body: findItem('<t:CalendarItem><t:ItemId Id="a" ChangeKey="b"/><t:Subject>VTE - DUPONT / MARTIN</t:Subject>'
      + '<t:Start>2099-10-14T08:00:00Z</t:Start><t:End>2099-10-14T09:00:00Z</t:End><t:IsAllDayEvent>false</t:IsAllDayEvent>'
      + '<t:IsCancelled>false</t:IsCancelled><t:Location>BA Appel de fonds envoyé</t:Location></t:CalendarItem>')
  });

  const reponse = await appeler('/api/agenda/tester', { method: 'POST' });
  const corps = await reponse.json();
  assert.equal(reponse.status, 200);
  assert.equal(corps.ok, true, corps.erreur);
  assert.equal(corps.calendrier, 'sophie@etude.test');
  assert.equal(depot.trouverParId('d1').appelFonds, require('../src/agendaWatch').dateDuJourParis());

  const relu = await (await appeler('/api/agenda')).json();
  assert.equal(relu.dernierTour.ok, true);
  assert.equal(relu.dernierTour.declenche, 'manuel');
  assert.deepEqual(relu.source, { configuree: true, calendrier: 'sophie@etude.test', suspendue: false });
  assert.doesNotMatch(JSON.stringify(relu), /mdp-secret/);
});

test('POST /api/agenda/tester : identifiants refusés → rapporté proprement, lecture automatique suspendue', async () => {
  reponsesEws.push({ statusCode: 401, body: '' });
  const reponse = await appeler('/api/agenda/tester', { method: 'POST' });
  const corps = await reponse.json();
  assert.equal(reponse.status, 200, 'la route répond normalement, l’échec est porté dans le compte rendu');
  assert.equal(corps.ok, false);
  assert.equal(corps.identifiantsRefuses, true);
  assert.equal(corps.source.suspendue, true);
  assert.match(corps.erreur, /refusés/);
  assert.doesNotMatch(JSON.stringify(corps), /mdp-secret/);
});

test('PUT /api/agenda n’existe plus (plus d’adresse .ics à enregistrer)', async () => {
  const reponse = await appeler('/api/agenda', { method: 'PUT', body: JSON.stringify({ icsUrl: 'https://x.test/a.ics' }) });
  assert.equal(reponse.status, 404);
});

test('GET /api/agenda/evenements : période validée, événements qui la chevauchent', async () => {
  assert.equal((await appeler('/api/agenda/evenements?debut=2099-10-20&fin=2099-10-10')).status, 400);
  parametresRepo.ecrireAgendaOffice({ debut: '2099-10-05', lu: '2099-10-12T08:00:00Z', evenements: [
    { itemId: 'A', sujet: 'Avant', date: '2099-10-06', heure: '09:00', heureFin: '10:00' },
    { itemId: 'B', sujet: 'Semaine', date: '2099-10-13', heure: '09:00', heureFin: '10:00' },
    { itemId: 'C', sujet: 'Congés JV', date: '2099-10-10', dateFin: '2099-10-12', journeeEntiere: true, absence: true }
  ] });
  const corps = await (await appeler('/api/agenda/evenements?debut=2099-10-12&fin=2099-10-17')).json();
  assert.equal(corps.evenements.map((e) => e.itemId).join('|'), 'B|C');
  assert.equal(corps.debutLu, '2099-10-05');
  assert.equal(JSON.stringify(corps).includes('motDePasse'), false);
  parametresRepo.ajouterEvenementAgendaOffice({ itemId: 'N', sujet: 'Nouveau', date: '2099-10-14', heure: '11:00', creeDansClaire: true });
  parametresRepo.retirerEvenementAgendaOffice('B');
  const apres = await (await appeler('/api/agenda/evenements?debut=2099-10-12&fin=2099-10-17')).json();
  assert.equal(apres.evenements.map((e) => e.itemId).sort().join('|'), 'C|N');
});
