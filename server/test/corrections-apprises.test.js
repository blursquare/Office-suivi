'use strict';

// Corrections apprises à l'import (voir src/routes/correctionsApprises.js). Gardées dans le
// navigateur de chaque poste, elles n'étaient jamais « apprises » pour un dossier créé depuis un
// autre poste : elles vivent désormais en base.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { assainirCorrectionsApprises, MAX_CORRECTIONS_APPRISES } = require('../src/parametresRepo');

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

const appeler = (chemin, corps) => fetch(`${baseUrl}${chemin}`, {
  method: corps ? 'POST' : 'GET',
  headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
  body: corps ? JSON.stringify(corps) : undefined
});

const correction = (id, extra) => Object.assign({
  id, tokens: ['condition', 'suspensive', 'obtention', 'offre'], contexteExemple: 'La condition suspensive…',
  categorie: 'date', classification: 'pret', libelle: null, nbConfirmations: 1, dateMaj: '2026-09-24T10:00:00.000Z'
}, extra || {});

test('assainirCorrectionsApprises : entrées invalides écartées, catégorie inconnue ramenée à date', () => {
  const p = assainirCorrectionsApprises([
    correction('a'),
    correction('b', { categorie: 'n-importe' }),
    correction('c', { tokens: ['un', 'deux'] }),      // trop peu de mots pour comparer
    correction('mauvais id !'),
    { id: 'd', tokens: ['a', 'b', 'c'] },              // pas de classification
    null
  ]);
  assert.equal(p.map((c) => c.id).join(','), 'a,b');
  assert.equal(p[1].categorie, 'date');
  assert.equal(assainirCorrectionsApprises('x').length, 0);
});

test('plafond : les plus confirmées sont gardées', () => {
  const liste = [];
  for (let i = 0; i < MAX_CORRECTIONS_APPRISES + 5; i++) liste.push(correction(`c${i}`, { nbConfirmations: i === 0 ? 9 : 1 }));
  const p = assainirCorrectionsApprises(liste);
  assert.equal(p.length, MAX_CORRECTIONS_APPRISES);
  assert.ok(p.some((c) => c.id === 'c0'));
});

test('ajout puis renforcement d\'une correction, partagée entre postes', async () => {
  let r = await (await appeler('/api/corrections-apprises', { correction: correction('x1') })).json();
  assert.equal(r.corrections.length, 1);
  // Même identifiant : remplacée, pas dupliquée.
  r = await (await appeler('/api/corrections-apprises', { correction: correction('x1', { nbConfirmations: 2 }) })).json();
  assert.equal(r.corrections.length, 1);
  assert.equal(r.corrections[0].nbConfirmations, 2);
  r = await (await appeler('/api/corrections-apprises')).json();
  assert.equal(r.corrections[0].id, 'x1');
});

test('correction invalide refusée', async () => {
  const reponse = await appeler('/api/corrections-apprises', { correction: { id: 'z' } });
  assert.equal(reponse.status, 400);
});
