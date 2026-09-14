'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const {
  construirePrompt,
  normaliserConstats,
  tronquerDocument,
  LIMITE_CARACTERES_PAR_DOCUMENT
} = require('../src/routes/analyseIa');

// ---- Fonctions pures : testées directement, sans monter de serveur ni de faux Ollama ----

test('tronquerDocument : laisse un texte court intact', () => {
  const doc = tronquerDocument({ nom: 'Compromis.pdf', type: 'acte', texte: 'Un texte court.' });
  assert.equal(doc.tronque, false);
  assert.equal(doc.texte, 'Un texte court.');
});

test('tronquerDocument : coupe un texte trop long et le signale', () => {
  const texte = 'a'.repeat(LIMITE_CARACTERES_PAR_DOCUMENT + 500);
  const doc = tronquerDocument({ nom: 'Annexe.pdf', type: 'annexe', texte });
  assert.equal(doc.tronque, true);
  assert.equal(doc.texte.length, LIMITE_CARACTERES_PAR_DOCUMENT);
});

test('construirePrompt : mentionne chaque document par son nom et son rôle (acte/annexe)', () => {
  const prompt = construirePrompt([
    { nom: 'Compromis.pdf', type: 'acte', texte: 'Prix : cent mille euros.' },
    { nom: 'DPE.pdf', type: 'annexe', texte: 'Diagnostic établi le 1er janvier 2020.', tronque: true }
  ]);
  assert.match(prompt, /Compromis\.pdf/);
  assert.match(prompt, /l'acte principal/);
  assert.match(prompt, /DPE\.pdf/);
  assert.match(prompt, /une annexe/);
  assert.match(prompt, /DOCUMENT TRONQUÉ/);
  assert.match(prompt, /notaire/);
});

test('normaliserConstats : accepte un JSON valide et normalise les gravités inconnues en "info"', () => {
  const brut = JSON.stringify({
    constats: [
      { gravite: 'critique', titre: 'Prix incohérent', description: 'Le prix diffère.', documents: ['Compromis.pdf', 'Annexe.pdf'] },
      { gravite: 'douteux', titre: 'Gravité inconnue' } // gravité hors énumération
    ]
  });
  const resultat = normaliserConstats(brut);
  assert.equal(resultat.constats.length, 2);
  assert.equal(resultat.constats[0].gravite, 'critique');
  assert.deepEqual(resultat.constats[0].documents, ['Compromis.pdf', 'Annexe.pdf']);
  assert.equal(resultat.constats[1].gravite, 'info'); // repli sur "info", jamais un plantage
});

test('normaliserConstats : un constat sans titre est ignoré (pas exploitable côté interface)', () => {
  const resultat = normaliserConstats(JSON.stringify({ constats: [{ gravite: 'attention', description: 'sans titre' }] }));
  assert.equal(resultat.constats.length, 0);
});

test('normaliserConstats : un JSON invalide ne plante pas, renvoie une liste vide + le texte brut pour diagnostic', () => {
  const resultat = normaliserConstats('ceci n\'est pas du JSON');
  assert.deepEqual(resultat.constats, []);
  assert.match(resultat.erreurAnalyse, /JSON exploitable/);
  assert.equal(resultat.brut, "ceci n'est pas du JSON");
});

// ---- Route /api/analyse-ia : montée avec un faux serveur Ollama HTTP ----

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
  fauxOllama = await demarrerFauxOllama(JSON.stringify({ constats: [{ gravite: 'attention', titre: 'Écart de prix', description: 'Le prix diffère entre les documents.', documents: ['Compromis.pdf'] }] }));
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

test('GET /api/analyse-ia/disponibilite : disponible quand le faux Ollama répond et connaît le modèle', async () => {
  const reponse = await fetch(`${baseUrl}/api/analyse-ia/disponibilite`, {
    headers: { Authorization: `Bearer ${jeton}` }
  });
  const corps = await reponse.json();
  assert.equal(corps.disponible, true);
});

test('POST /api/analyse-ia sans authentification : 401', async () => {
  const reponse = await fetch(`${baseUrl}/api/analyse-ia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents: [] })
  });
  assert.equal(reponse.status, 401);
});

test('POST /api/analyse-ia sans document exploitable : 400', async () => {
  const reponse = await fetch(`${baseUrl}/api/analyse-ia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents: [{ nom: 'Vide.pdf', type: 'annexe', texte: '   ' }] })
  });
  assert.equal(reponse.status, 400);
});

test('POST /api/analyse-ia : renvoie les constats du (faux) modèle local', async () => {
  const reponse = await fetch(`${baseUrl}/api/analyse-ia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documents: [
        { nom: 'Compromis.pdf', type: 'acte', texte: 'Prix de vente : cent mille euros (100 000 €).' },
        { nom: 'DPE.pdf', type: 'annexe', texte: 'Diagnostic de performance énergétique.' }
      ]
    })
  });
  assert.equal(reponse.status, 200);
  const corps = await reponse.json();
  assert.equal(corps.constats.length, 1);
  assert.equal(corps.constats[0].titre, 'Écart de prix');
  assert.equal(corps.tronque, false);
});

test('POST /api/analyse-ia : Ollama indisponible renvoie 503 avec un message actionnable', async () => {
  const db2 = ouvrirDb(':memory:');
  // Port volontairement fermé (rien n'écoute) : simule Ollama non installé/non lancé.
  const { app: app2, gestionnaireAuth: auth2 } = creerApp({ db: db2, config: config('http://127.0.0.1:1') });
  const jeton2 = auth2.creerSession();
  const serveur2 = app2.listen(0);
  await new Promise((resolve) => serveur2.once('listening', resolve));
  const baseUrl2 = `http://127.0.0.1:${serveur2.address().port}`;

  const reponse = await fetch(`${baseUrl2}/api/analyse-ia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton2}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents: [{ nom: 'X.pdf', type: 'acte', texte: 'Un texte.' }] })
  });
  assert.equal(reponse.status, 503);
  const corps = await reponse.json();
  assert.match(corps.erreur, /server\/README\.md/);

  serveur2.close();
  db2.close();
});
