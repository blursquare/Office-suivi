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

// --- Comparaison avec la même semaine l'an dernier (étude, 01/10) ---
function itemEws(sujet, debutUtc, finUtc, journee) {
  return `<t:CalendarItem><t:ItemId Id="${sujet.replace(/\W/g, '')}${debutUtc}" ChangeKey="CK"/><t:Subject>${sujet}</t:Subject><t:Start>${debutUtc}</t:Start><t:End>${finUtc}</t:End><t:IsAllDayEvent>${journee ? 'true' : 'false'}</t:IsAllDayEvent><t:IsCancelled>false</t:IsCancelled></t:CalendarItem>`;
}

test('GET /api/agenda/comparaison : semaine de l’an dernier lue une fois puis gardée, écart et pourcentage', async () => {
  reinitialiserDisjoncteurAgenda();
  parametresRepo.ecrireReglagesExchange({ actif: true, email: 'bastien@etude.test', motDePasse: 'mdp-secret', calendrierPartage: 'sophie@etude.test' });
  // Cette semaine (lundi 2026-10-05) : 3 rendez-vous horaires, dont une signature ; une journée entière et une option ne comptent pas.
  parametresRepo.ecrireAgendaOffice({ debut: '2026-09-28', lu: new Date().toISOString(), evenements: [
    { itemId: 'A', sujet: 'VTE - DUPONT / MARTIN', date: '2026-10-05', heure: '10:00', heureFin: '11:00', signature: true },
    { itemId: 'B', sujet: 'Point équipe', date: '2026-10-06', heure: '09:30', heureFin: '10:00' },
    { itemId: 'C', sujet: 'Client', date: '2026-10-10', heure: '10:00', heureFin: '11:00' },
    { itemId: 'D', sujet: 'Congés JV', date: '2026-10-07', dateFin: '2026-10-07', journeeEntiere: true, absence: true },
    { itemId: 'E', sujet: 'VTE - X ? — option CLAIRE, créneau 1/2', date: '2026-10-08', heure: '14:00', option: true },
    { itemId: 'F', sujet: 'Dimanche', date: '2026-10-11', heure: '10:00' }
  ] });
  // L'an dernier (lundi 2025-10-06, 364 jours avant) : 2 rendez-vous horaires + une journée entière.
  reponsesEws.length = 0;
  reponsesEws.push({ statusCode: 200, body: findItem(
    itemEws('VTE - LEROY', '2025-10-06T08:00:00Z', '2025-10-06T09:00:00Z')
    + itemEws('Rendez-vous banque', '2025-10-08T12:00:00Z', '2025-10-08T13:00:00Z')
    + itemEws('Congés BA', '2025-10-08T22:00:00Z', '2025-10-09T22:00:00Z', true)) });
  const corps = await (await appeler('/api/agenda/comparaison?lundi=2026-10-05')).json();
  assert.equal(corps.lundiAnPasse, '2025-10-06');
  assert.equal(corps.actuel.rendezVous, 3);
  assert.equal(corps.actuel.signatures, 1);
  assert.equal(corps.anPasse.rendezVous, 2);
  assert.equal(corps.anPasse.signatures, 1);
  assert.equal(corps.ecart, 1);
  assert.equal(corps.pourcent, 50);
  // Second appel : gardé en base, aucune nouvelle lecture (la file de réponses resterait sinon consommée).
  reponsesEws.push({ statusCode: 500, body: '' });
  const encore = await (await appeler('/api/agenda/comparaison?lundi=2026-10-05')).json();
  assert.equal(encore.anPasse.rendezVous, 2);
  assert.equal(reponsesEws.length, 1, 'aucune lecture Exchange au second appel');
  reponsesEws.length = 0;
  assert.equal((await appeler('/api/agenda/comparaison?lundi=2026-10-06')).status, 400, 'pas un lundi');
});

test('GET /api/agenda/passe : un mois d’historique lu une fois dans Exchange, puis gardé ; le stock n’est pas relu', async () => {
  reinitialiserDisjoncteurAgenda();
  parametresRepo.ecrireReglagesExchange({ actif: true, email: 'bastien@etude.test', motDePasse: 'mdp-secret', calendrierPartage: 'sophie@etude.test' });
  parametresRepo.ecrireAgendaOffice({ debut: '2026-09-21', lu: new Date().toISOString(), evenements: [] });
  reponsesEws.length = 0;
  reponsesEws.push({ statusCode: 200, body: findItem(
    itemEws('VTE - LEROY', '2026-01-06T08:00:00Z', '2026-01-06T09:00:00Z')
    + itemEws('Rendez-vous banque', '2026-01-20T12:00:00Z', '2026-01-20T13:00:00Z')) });
  const corps = await (await appeler('/api/agenda/passe?debut=2026-01-05&fin=2026-01-31')).json();
  assert.equal(corps.limite, '2026-09-21');
  assert.equal(corps.evenements.map((e) => `${e.date} ${e.heure} ${e.sujet}`).join(' | '), '2026-01-06 09:00 VTE - LEROY | 2026-01-20 13:00 Rendez-vous banque');
  assert.equal(corps.evenements[0].signature, true);
  // Janvier lu bien après sa fin : gardé, plus jamais relu.
  reponsesEws.push({ statusCode: 500, body: '' });
  const encore = await (await appeler('/api/agenda/passe?debut=2026-01-01&fin=2026-01-10')).json();
  assert.equal(encore.evenements.length, 1);
  assert.equal(reponsesEws.length, 1, 'aucune nouvelle lecture Exchange');
  reponsesEws.length = 0;
  // Une période dans le stock : rien à lire.
  const dansStock = await (await appeler('/api/agenda/passe?debut=2026-09-28&fin=2026-10-03')).json();
  assert.equal(dansStock.evenements.length, 0);
  assert.equal((await appeler('/api/agenda/passe?debut=2026-01-01&fin=2026-06-30')).status, 400, 'six mois d’un coup : refusé');
});
