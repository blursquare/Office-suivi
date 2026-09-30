'use strict';
// Nom de dossier cité partout dans CLAIRE précédé de son type d'affaire (étude, 30/09 : « VTE pour
// vente et SUCC pour succession »). Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('une vente (type absent ou « vente ») est préfixée VTE', () => {
  assert.equal(app.libelleDossierAffiche({ nom: 'DURAND / MARTIN' }), 'VTE - DURAND / MARTIN');
  assert.equal(app.libelleDossierAffiche({ nom: 'DURAND / MARTIN', typeAffaire: 'vente' }), 'VTE - DURAND / MARTIN');
});

test('une succession est préfixée SUCC', () => {
  assert.equal(app.libelleDossierAffiche({ nom: 'LEROY', typeAffaire: 'succession' }), 'SUCC - LEROY');
});

test('un nom déjà préfixé n’est pas doublé', () => {
  assert.equal(app.libelleDossierAffiche({ nom: 'VTE - DURAND / MARTIN' }), 'VTE - DURAND / MARTIN');
  assert.equal(app.libelleDossierParNom('SUCC - LEROY'), 'SUCC - LEROY');
  assert.equal(app.libelleDossierParNom('DURAND / MARTIN'), 'VTE - DURAND / MARTIN');
});
