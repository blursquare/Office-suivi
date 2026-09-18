'use strict';

// Confirmation par le modèle IA local qu'un PDF est bien une offre/un contrat de prêt — dernier
// des trois filtres de reconnaissance de ce document (voir src/routes/offrePret.js et la section
// « OFFRE DE PRÊT » de script.js).
//
// Le comportement qui compte le plus ici est le 503 : le client doit pouvoir distinguer « le
// modèle dit que ce n'est pas une offre » (statut "introuvable", on continue de chercher) de « le
// modèle n'a pas pu répondre » (statut "à confirmer", le document est retenu mais non validé).
// Confondre les deux ferait disparaître un document pourtant trouvé, ou en ferait valider un que
// personne n'a vérifié.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { demarrerFauxOllama } = require('./helpers/faux-ollama');
const { construirePrompt, validerReponse, LIMITE_CARACTERES_TITRE } = require('../src/routes/offrePret');

// ---- Fonctions pures ----

test('le prompt contient le titre examiné et interdit au modèle de broder', () => {
  const prompt = construirePrompt('OFFRE DE PRÊT immobilier n° 123456');
  assert.match(prompt, /OFFRE DE PRÊT immobilier n° 123456/);
  assert.match(prompt, /N'invente rien/);
  // Les pièges à écarter sont nommés explicitement : c'est ce qui distingue le document de prêt
  // lui-même d'un acte qui en parle.
  assert.match(prompt, /condition suspensive/);
  assert.match(prompt, /Dans le doute, réponds « non »/);
});

test('validerReponse exige un vrai booléen, pas une chaîne « oui »', () => {
  // Une chaîne passerait le JSON.parse et serait lue comme vraie partout : c'est exactement le
  // genre de réponse qu'un 8B produit, et il faut la faire relancer plutôt que la laisser passer.
  assert.equal(validerReponse({ estOffrePret: true, raison: 'titre explicite' }), null);
  assert.equal(validerReponse({ estOffrePret: false }), null);
  assert.ok(validerReponse({ estOffrePret: 'oui' }));
  assert.ok(validerReponse({}));
  assert.ok(validerReponse(null));
});

// ---- La route ----

function config(ollamaUrl) {
  return {
    motDePasse: 'mdp-test',
    racineRepo: os.tmpdir(),
    port: 0,
    jetonCalendrier: '',
    ollama: { url: ollamaUrl, modele: 'llama3.1:8b' }
  };
}

const TITRE = 'BANQUE POPULAIRE — OFFRE DE PRÊT immobilier n° 123456 — Emprunteur : M. DUPONT';
const REPONSE_OUI = JSON.stringify({ estOffrePret: true, raison: 'La page de garde est intitulée « offre de prêt ».' });

let db, serveurApp, baseUrl, jeton, fauxOllama;

before(async () => {
  fauxOllama = await demarrerFauxOllama(REPONSE_OUI);
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: config(fauxOllama.url) });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  serveurApp.close();
  fauxOllama.serveur.close();
  db.close();
});

function appeler(corps) {
  return fetch(`${baseUrl}/api/offre-pret/confirmer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps)
  });
}

test('POST /api/offre-pret/confirmer sans authentification : 401', async () => {
  const reponse = await fetch(`${baseUrl}/api/offre-pret/confirmer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titre: TITRE })
  });
  assert.equal(reponse.status, 401);
});

test('sans titre : 400', async () => {
  assert.equal((await appeler({ titre: '   ' })).status, 400);
  assert.equal((await appeler({})).status, 400);
});

test('le modèle confirme : estOffrePret true et la raison sont renvoyées', async () => {
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses(REPONSE_OUI);
  const reponse = await appeler({ titre: TITRE });
  assert.equal(reponse.status, 200);
  const corps = await reponse.json();
  assert.equal(corps.estOffrePret, true);
  assert.match(corps.raison, /offre de prêt/);
  assert.equal(fauxOllama.appels, 1); // réponse valide du premier coup : pas de relance
});

test('le modèle écarte le document : 200 avec estOffrePret false', async () => {
  // Réponse négative légitime, à ne surtout pas confondre avec une indisponibilité : le client
  // continue alors de chercher l'offre dans les fichiers suivants.
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses(JSON.stringify({ estOffrePret: false, raison: "C'est un compromis de vente." }));
  const corps = await (await appeler({ titre: 'COMPROMIS DE VENTE' })).json();
  assert.equal(corps.estOffrePret, false);
  assert.match(corps.raison, /compromis/);
});

test('une réponse hors schéma déclenche UNE relance, qui aboutit', async () => {
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses([JSON.stringify({ estOffrePret: 'oui' }), REPONSE_OUI]);
  const reponse = await appeler({ titre: TITRE });
  assert.equal(reponse.status, 200);
  assert.equal((await reponse.json()).estOffrePret, true);
  assert.equal(fauxOllama.appels, 2);
});

test('deux réponses hors schéma de suite : 502, sans troisième tentative', async () => {
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses('pas du tout du JSON');
  const reponse = await appeler({ titre: TITRE });
  assert.equal(reponse.status, 502);
  assert.equal(fauxOllama.appels, 2);
  fauxOllama.definirReponses(REPONSE_OUI);
});

test('un titre démesuré est tronqué avant d’atteindre le modèle', async () => {
  // Garde-fou serveur : le client tronque déjà, mais rien ne doit permettre d'envoyer un acte
  // entier par cette route, qui n'est censée examiner qu'une page de garde.
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses(REPONSE_OUI);
  await appeler({ titre: 'OFFRE DE PRÊT ' + 'x'.repeat(50000) });
  assert.ok(fauxOllama.prompts[0].length < LIMITE_CARACTERES_TITRE + 3000);
});

test('Ollama indisponible : 503, jamais un « non »', async () => {
  // LE point de ce fichier : 503 (le client retient le document en « à confirmer ») et non 200
  // avec estOffrePret false, qui ferait disparaître un document pourtant trouvé.
  const db2 = ouvrirDb(':memory:');
  const { app: app2, gestionnaireAuth: auth2 } = creerApp({ db: db2, config: config('http://127.0.0.1:1') });
  const jeton2 = auth2.creerSession();
  const serveur2 = app2.listen(0);
  await new Promise((resolve) => serveur2.once('listening', resolve));

  const reponse = await fetch(`http://127.0.0.1:${serveur2.address().port}/api/offre-pret/confirmer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton2}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ titre: TITRE })
  });
  assert.equal(reponse.status, 503);

  serveur2.close();
  db2.close();
});
