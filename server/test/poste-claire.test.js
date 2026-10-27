'use strict';

// L'ordinateur virtuel de CLAIRE (src/posteClaire.js, routes/posteClaire.js) : ce que son poste n'a pas le droit de faire (réglages, envois,
// Exchange, Yousign, Teams…), son cookie secret, les demandes de validation à Bastien, le lancement paresseux de la fenêtre.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { creerPosteClaire, routeInterditePosteClaire, jetonDuCookie, NOM_COOKIE_POSTE_CLAIRE } = require('../src/posteClaire');

test('le poste de CLAIRE : réglages, envois, agenda, Yousign, Teams, mise à jour refusés ; dossiers et agent permis', () => {
  const non = (m, c) => assert.equal(routeInterditePosteClaire(m, c), true, `${m} ${c} doit être refusé`);
  const oui = (m, c) => assert.equal(routeInterditePosteClaire(m, c), false, `${m} ${c} doit être permis`);
  non('GET', '/api/reglages'); non('PUT', '/api/reglages'); non('POST', '/api/reglages/tester-email');
  non('POST', '/api/emails/envoyer'); non('POST', '/api/exchange/rendez-vous'); non('PUT', '/api/exchange/evenement/notes');
  non('POST', '/api/yousign/appel'); non('POST', '/api/signature-rib/agent'); non('POST', '/api/notifications/pieces');
  non('POST', '/api/mise-a-jour/installer'); non('POST', '/api/sauvegarde/restaurer'); non('POST', '/api/relais-word/repondre');
  non('PUT', '/api/carnet-claire'); non('POST', '/api/canaux/general/messages'); non('POST', '/api/poste-claire/travail');
  non('POST', '/api/propositions/p1/decision'); non('GET', '/api/comptes-collaborateurs');
  oui('GET', '/api/dossiers'); oui('PUT', '/api/dossiers/d1'); oui('POST', '/api/assistant/agent'); oui('GET', '/api/canaux');
  oui('POST', '/api/poste-claire/demande'); oui('GET', '/api/poste-claire/demande/val-1');
});

test('le cookie du poste est lu dans l’en-tête Cookie', () => {
  assert.equal(jetonDuCookie(`a=1; ${NOM_COOKIE_POSTE_CLAIRE}=abc123; b=2`), 'abc123');
  assert.equal(jetonDuCookie('a=1'), '');
  assert.equal(jetonDuCookie(undefined), '');
});

test('la fenêtre n’est lancée qu’au premier travail, un seul à la fois, et arrêtée ensuite', async () => {
  const appels = [];
  let arrets = 0;
  const cdp = { ecouter() {}, async envoyer(m, p) {
    appels.push(m);
    if (m === 'Target.createTarget') return { targetId: 't1' };
    if (m === 'Target.attachToTarget') return { sessionId: 's1' };
    if (m === 'Runtime.evaluate') return { result: { value: /^travaillerPosteClaire/.test(p.expression) ? 'compte rendu' : true } };
    return {};
  } };
  const poste = creerPosteClaire({ adresse: 'http://127.0.0.1:9', profil: os.tmpdir() + '/poste-claire-test', lancer: async () => ({ cdp, async arreter() { arrets++; } }) });
  assert.equal(poste.etat().ouvert, false);
  const r = await poste.travailler('prépare quelque chose');
  assert.equal(r, 'compte rendu');
  assert.equal(poste.etat().ouvert, true);
  assert.ok(appels.includes('Network.setCookie'), 'le cookie secret est posé');
  assert.ok(appels.includes('Page.navigate'));
  await poste.arreter();
  assert.equal(arrets, 1);
  assert.equal(poste.etat().ouvert, false);
});

test('le jeton du poste est secret : seul le bon jeton est reconnu', () => {
  const poste = creerPosteClaire({ adresse: 'http://127.0.0.1:9', profil: os.tmpdir() + '/pc2', lancer: async () => { throw new Error('non'); } });
  assert.equal(poste.estPosteClaire(poste.jeton()), true);
  assert.equal(poste.estPosteClaire('autre'), false);
  assert.equal(poste.estPosteClaire(''), false);
});

let db, serveurApp, baseUrl, jeton, gestion, posteInjecte;
before(async () => {
  db = ouvrirDb(':memory:');
  posteInjecte = creerPosteClaire({ adresse: 'http://127.0.0.1:9', profil: os.tmpdir() + '/pc3', lancer: async () => { throw new Error('pas de navigateur'); } });
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' }, posteClaire: posteInjecte });
  gestion = gestionnaireAuth;
  jeton = gestion.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});
after(() => { serveurApp.close(); db.close(); });

const appeler = (chemin, options, cookie) => fetch(`${baseUrl}${chemin}`, { ...options, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options && options.headers) } });

test('le poste de CLAIRE reçoit un 403 sur les réglages, un collaborateur non', async () => {
  const cookie = `${NOM_COOKIE_POSTE_CLAIRE}=${posteInjecte.jeton()}`;
  assert.equal((await appeler('/api/reglages', {}, cookie)).status, 403);
  assert.notEqual((await appeler('/api/reglages', {})).status, 403);
  assert.equal((await appeler('/api/emails/envoyer', { method: 'POST', body: '{}' }, cookie)).status, 403);
});

test('une demande de validation devient une proposition pour Bastien, décidée par lui seul', async () => {
  const cookie = `${NOM_COOKIE_POSTE_CLAIRE}=${posteInjecte.jeton()}`;
  // Un collaborateur ne peut pas poser de demande au nom de CLAIRE.
  assert.equal((await appeler('/api/poste-claire/demande', { method: 'POST', body: JSON.stringify({ description: 'x' }) })).status, 403);
  const r = await appeler('/api/poste-claire/demande', { method: 'POST', body: JSON.stringify({ description: 'Cocher la pièce « RIB »\ndossier DUPONT' }) }, cookie);
  assert.equal(r.status, 200);
  const { id } = await r.json();
  assert.match(id, /^val-/);
  assert.equal((await (await appeler(`/api/poste-claire/demande/${id}`, {}, cookie)).json()).etat, 'proposee');
  // Elle ne peut pas se valider elle-même.
  assert.equal((await appeler(`/api/propositions/${id}/decision`, { method: 'POST', body: JSON.stringify({ auteur: 'Bastien ANGLUMENT', decision: 'acceptee' }) }, cookie)).status, 403);
  // Bastien la voit dans sa boîte et l'autorise.
  const boite = await (await appeler('/api/propositions?utilisateur=' + encodeURIComponent('Bastien ANGLUMENT') + '&etat=a-traiter')).json();
  assert.ok(boite.propositions.some((p) => p.id === id && p.type === 'validation'));
  const d = await appeler(`/api/propositions/${id}/decision`, { method: 'POST', body: JSON.stringify({ auteur: 'Bastien ANGLUMENT', decision: 'acceptee' }) });
  assert.equal(d.status, 200);
  assert.equal((await (await appeler(`/api/poste-claire/demande/${id}`, {}, cookie)).json()).etat, 'acceptee');
});

test('lui confier un travail sans navigateur : une erreur claire, jamais un plantage', async () => {
  const r = await appeler('/api/poste-claire/travail', { method: 'POST', body: JSON.stringify({ consigne: 'fais quelque chose' }) });
  assert.ok(r.status === 500 || r.status === 503);
  assert.match((await r.json()).erreur, /navigateur/);
  assert.equal((await appeler('/api/poste-claire/travail', { method: 'POST', body: JSON.stringify({ consigne: '' }) })).status, 400);
});
