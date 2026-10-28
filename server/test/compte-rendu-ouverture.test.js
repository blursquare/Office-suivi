'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyserCompteRendu, RE_NOM_COMPTE_RENDU } = require('../src/compteRenduOuverture');

test('compte rendu d’ouverture : banques, EHPAD, mutuelle, caisse de retraite', () => {
  const r = analyserCompteRendu('Le défunt vivait en EHPAD.\nBanque : Crédit Agricole, Banque Postale\nMutuelle : Harmonie\nRetraite complémentaire AGIRC-ARRCO\nCompte à la Caisse d’Épargne');
  assert.deepEqual(r.banques.slice().sort(), ['Caisse d’Épargne', 'Crédit Agricole', 'La Banque Postale'].sort());
  assert.equal(r.ehpad, true); assert.equal(r.mutuelle, true); assert.equal(r.retraite, true);
});

test('compte rendu d’ouverture : rien de repéré = rien d’ajouté, un « Banque : néant » n’est pas une banque', () => {
  const r = analyserCompteRendu('Banque : néant\nAucun autre élément.');
  assert.deepEqual(r, { banques: [], ehpad: false, mutuelle: false, retraite: false });
  assert.deepEqual(analyserCompteRendu('Banque : Banque Tarneaud').banques, ['Banque Tarneaud']);
});

test('compte rendu d’ouverture : le nom du fichier', () => {
  assert.ok(RE_NOM_COMPTE_RENDU.test('Compte rendu ouverture.doc'));
  assert.ok(RE_NOM_COMPTE_RENDU.test('CR ouverture succession.docx'));
  assert.ok(!RE_NOM_COMPTE_RENDU.test('Acte de décès.pdf'));
});
