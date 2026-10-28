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

test('compte rendu d’ouverture : un .doc forgé (cycle de secteurs, secteurs géants, hors format) est refusé avant la bibliothèque', () => {
  const { oleSain } = require('../src/compteRenduOuverture');
  const entete = (/** @type {(b: Buffer) => void} */ f) => {
    const b = Buffer.alloc(512 + 512 * 8);
    Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(b, 0);
    b.writeUInt16LE(9, 30); b.writeUInt32LE(1, 44); b.writeUInt32LE(0, 76);
    b.fill(0xff, 80, 76 + 109 * 4);
    f(b); return b;
  };
  // FAT = secteur 0 : tout libre sauf une chaîne 1 → 2 → 1 (cycle).
  const sain = entete((b) => { b.fill(0xff, 512, 1024); b.writeUInt32LE(0xfffffffe, 512 + 1 * 4); });
  assert.equal(oleSain(sain), true);
  const cycle = entete((b) => { b.fill(0xff, 512, 1024); b.writeUInt32LE(2, 512 + 1 * 4); b.writeUInt32LE(1, 512 + 2 * 4); });
  assert.equal(oleSain(cycle), false);
  assert.equal(oleSain(entete((b) => b.writeUInt16LE(30, 30))), false, 'secteurs de 1 Go');
  assert.equal(oleSain(entete((b) => b.fill(0, 0, 8))), false, 'pas un fichier OLE');
});

test('compte rendu d’ouverture : « pas de mutuelle » n’en fait pas une ; « retraité » et les noms de personnes', () => {
  assert.deepEqual(analyserCompteRendu('Pas de mutuelle. Pas d’EHPAD. Sans caisse de retraite.'), { banques: [], ehpad: false, mutuelle: false, retraite: false });
  assert.equal(analyserCompteRendu('Défunt retraité.').retraite, true);
  assert.equal(analyserCompteRendu('Mutuelle : Harmonie').mutuelle, true);
  assert.deepEqual(analyserCompteRendu('Banque : Crédit Agricole et Mme DUPONT').banques, ['Crédit Agricole']);
  assert.deepEqual(analyserCompteRendu('Livret A au nom du défunt').banques, []);
});
