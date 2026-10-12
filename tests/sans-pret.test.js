'use strict';

// « Pas de prêt dans ce dossier » (étude 12/10 : condition de prêt posée par erreur à la création, ligne sans date = crayon seul).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('ligne du prêt : « Pas de prêt dans ce dossier » avec ou sans date, jamais une fois l’offre reçue ni en comptant', () => {
  const ligne = (iso, offreRecue, sansPret, opts) => app.renderLigneEcheance('pret', 'Obtention du prêt', iso, 'd1', null, null, null, offreRecue, '', sansPret, false, opts);
  assert.match(ligne('', false, false), /marquerSansPret\('d1'\)/);
  assert.match(ligne('2026-11-20', false, false), /marquerSansPret\('d1'\)/);
  assert.doesNotMatch(ligne('2026-11-20', true, false), /marquerSansPret/);
  assert.doesNotMatch(app.renderLigneEcheance('pret', 'Financement comptant', '', 'd1', null, null, null, false, '', true, false, { comptant: true }), /marquerSansPret/);
  assert.doesNotMatch(app.renderLigneEcheance('ventebien', 'Vente préalable', '', 'd1', null, null, null, false, '', false, false), /marquerSansPret/);
});
