'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { construirePrompt, normaliserExtraction, LIMITE_CARACTERES_TEXTE } = require('../src/routes/extractionIa');

// ---- Fonctions pures ----

test('construirePrompt : mentionne les champs attendus et le texte fourni', () => {
  const prompt = construirePrompt('Prix : cent mille euros (100 000 €).');
  assert.match(prompt, /nomDossier/);
  assert.match(prompt, /adresseBien/);
  assert.match(prompt, /engagementsVendeur/);
  assert.match(prompt, /cent mille euros/);
  assert.match(prompt, /clerc de notaire/);
});

test('normaliserExtraction : accepte un JSON complet et valide chaque champ', () => {
  const brut = JSON.stringify({
    nomDossier: 'DUPONT / MARTIN',
    adresseBien: '12 rue de la Paix, 75002 Paris',
    prixVente: 250000.7,
    datePret: '2026-11-30',
    dateActe: '2027-01-15',
    dateVentePrealable: null,
    engagementsVendeur: [
      { type: 'entretien', description: 'Justifier de l\'entretien annuel de la chaudière' },
      { type: 'inconnu', description: 'Type hors énumération, doit retomber sur "document"' }
    ]
  });
  const resultat = normaliserExtraction(brut);
  assert.equal(resultat.nomDossier, 'DUPONT / MARTIN');
  assert.equal(resultat.adresseBien, '12 rue de la Paix, 75002 Paris');
  assert.equal(resultat.prixVente, 250001); // arrondi
  assert.equal(resultat.datePret, '2026-11-30');
  assert.equal(resultat.dateActe, '2027-01-15');
  assert.equal(resultat.dateVentePrealable, null);
  assert.equal(resultat.engagementsVendeur.length, 2);
  assert.equal(resultat.engagementsVendeur[1].type, 'document'); // repli, jamais un plantage
});

test('normaliserExtraction : rejette une date mal formée (pas au format AAAA-MM-JJ)', () => {
  const resultat = normaliserExtraction(JSON.stringify({ datePret: '30/11/2026' }));
  assert.equal(resultat.datePret, null);
});

test('normaliserExtraction : rejette un prix négatif ou non numérique', () => {
  assert.equal(normaliserExtraction(JSON.stringify({ prixVente: -100 })).prixVente, null);
  assert.equal(normaliserExtraction(JSON.stringify({ prixVente: 'cent mille' })).prixVente, null);
});

test('normaliserExtraction : un engagement sans description est ignoré', () => {
  const resultat = normaliserExtraction(JSON.stringify({ engagementsVendeur: [{ type: 'travaux' }] }));
  assert.deepEqual(resultat.engagementsVendeur, []);
});

test('normaliserExtraction : un JSON invalide ne plante pas, tous les champs à null/vide', () => {
  const resultat = normaliserExtraction('pas du JSON');
  assert.equal(resultat.nomDossier, null);
  assert.deepEqual(resultat.engagementsVendeur, []);
  assert.match(resultat.erreurExtraction, /JSON exploitable/);
});

// ---- Route /api/extraction-ia : montée avec un faux serveur Ollama HTTP ----

function config(ollamaUrl) {
  return {
    motDePasse: 'mdp-test',
    racineRepo: os.tmpdir(),
    port: 0,
    jetonCalendrier: '',
    ollama: { url: ollamaUrl, modele: 'llama3.1:8b' }
  };
}

async function demarrerFauxOllama(reponseGenerate) {
  const serveur = http.createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ models: [{ name: 'llama3.1:8b' }] }));
      return;
    }
    if (req.url === '/api/generate') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ response: reponseGenerate }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((resolve) => serveur.listen(0, resolve));
  return { serveur, url: `http://127.0.0.1:${serveur.address().port}` };
}

let db, serveurApp, baseUrl, jeton, fauxOllama;

before(async () => {
  fauxOllama = await demarrerFauxOllama(JSON.stringify({
    nomDossier: 'DUPONT / MARTIN',
    adresseBien: '12 rue de la Paix, 75002 Paris',
    prixVente: 250000,
    datePret: '2026-11-30',
    dateActe: null,
    dateVentePrealable: null,
    engagementsVendeur: []
  }));
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

test('POST /api/extraction-ia sans authentification : 401', async () => {
  const reponse = await fetch(`${baseUrl}/api/extraction-ia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texte: 'Un compromis.' })
  });
  assert.equal(reponse.status, 401);
});

test('POST /api/extraction-ia sans texte : 400', async () => {
  const reponse = await fetch(`${baseUrl}/api/extraction-ia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ texte: '   ' })
  });
  assert.equal(reponse.status, 400);
});

test('POST /api/extraction-ia : renvoie les champs extraits par le (faux) modèle local', async () => {
  const reponse = await fetch(`${baseUrl}/api/extraction-ia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ texte: 'Vente entre M. DUPONT et M. MARTIN, prix cent mille euros...' })
  });
  assert.equal(reponse.status, 200);
  const corps = await reponse.json();
  assert.equal(corps.nomDossier, 'DUPONT / MARTIN');
  assert.equal(corps.prixVente, 250000);
  assert.equal(corps.datePret, '2026-11-30');
});

test('POST /api/extraction-ia : Ollama indisponible renvoie 503', async () => {
  const db2 = ouvrirDb(':memory:');
  const { app: app2, gestionnaireAuth: auth2 } = creerApp({ db: db2, config: config('http://127.0.0.1:1') });
  const jeton2 = auth2.creerSession();
  const serveur2 = app2.listen(0);
  await new Promise((resolve) => serveur2.once('listening', resolve));
  const baseUrl2 = `http://127.0.0.1:${serveur2.address().port}`;

  const reponse = await fetch(`${baseUrl2}/api/extraction-ia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton2}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ texte: 'Un texte.' })
  });
  assert.equal(reponse.status, 503);

  serveur2.close();
  db2.close();
});
