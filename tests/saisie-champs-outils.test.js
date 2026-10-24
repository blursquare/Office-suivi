'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');
const { montantSaisiFr } = require('../commun/montants.js');

const app = chargerApplication();

test('un montant tapé ou collé à la française est lu (étude 24/10)', () => {
  const cas = [['1.234,56', 1234.56], ['1 234,56 €', 1234.56], ['250.000,00', 250000], ['250.000', 250000], ['1234,5', 1234.5],
    ['1500.50', 1500.5], ['185000', 185000], ['12.345', 12345], ['1234.', 1234], ['0,5', 0.5], ['1.5', 1.5], ['−2', -2], ['-500', -500]];
  for (const [texte, attendu] of cas) assert.strictEqual(montantSaisiFr(texte), attendu, texte);
  assert.strictEqual(montantSaisiFr(''), null);
  assert.strictEqual(montantSaisiFr('  '), null);
  assert.ok(Number.isNaN(montantSaisiFr('abc')));
  assert.ok(Number.isNaN(montantSaisiFr('1.23.4')));
});

test('une saisie négative, illisible ou hors limite est refusée avec son message', () => {
  assert.strictEqual(app.erreurSaisieChamp(null, {}), '');
  assert.strictEqual(app.erreurSaisieChamp(1200, {}), '');
  assert.match(app.erreurSaisieChamp(NaN, {}), /Montant illisible/);
  assert.match(app.erreurSaisieChamp(-500, {}), /montant ne peut pas être négatif/);
  assert.match(app.erreurSaisieChamp(-2, { entier: true }), /nombre ne peut pas être négatif/);
  assert.match(app.erreurSaisieChamp(1.5, { entier: true }), /entier/);
  assert.match(app.erreurSaisieChamp(0, { positif: true }), /supérieur à zéro/);
  assert.match(app.erreurSaisieChamp(300000, { max: 199999, messageMax: 'Le mobilier doit être inférieur au prix.' }), /inférieur au prix/);
});

test('l\'arbitrage lit « 7.800,00 » et ne compte pas un nombre négatif de serments', () => {
  const r = app.calculerArbitrageInventaire({ droitsSans: '7.800,00', droitsAvec: '5.400', fraisOuverture: '300', prisee: '600', fraisCloture: '300',
    sermentNb: '-2', sermentUnit: '240', trajetActif: false, trajetNb: '', trajetUnit: '' });
  assert.strictEqual(r.brutes, 2400);
  assert.strictEqual(r.cout, 1200);
});

test('le calcul de l\'arbitrage écarte un champ refusé à l\'écran (« 1.5 » serment, droits négatifs)', () => {
  const champs = {};
  const el = (id, value) => { champs[id] = { id, value, nextElementSibling: null, insertAdjacentElement() {}, setAttribute() {}, removeAttribute() {} }; };
  el('inv-droits-sans', '-7800'); el('inv-droits-avec', '5400'); el('inv-serment-nb', '1.5'); el('inv-serment-unit', '240');
  const doc = app.document;
  const avant = doc.getElementById, avantCreer = doc.createElement;
  doc.getElementById = (id) => champs[id] || null;
  doc.createElement = () => ({ setAttribute() {}, classList: { contains: () => false } });
  try {
    const r = app.calculerArbitrageInventaire(app.saisieInventaireControlee());
    assert.strictEqual(r.complet, false);
    assert.strictEqual(r.lignes.some(l => l.cle === 'serment'), false);
  } finally { doc.getElementById = avant; doc.createElement = avantCreer; }
});

test('les quotités lisent un montant à la française et ignorent un montant négatif', () => {
  assert.strictEqual(app.montantQuotite('210.000,00'), 210000);
  assert.strictEqual(app.montantQuotite('-500'), 0);
  assert.strictEqual(app.montantQuotite('abc'), 0);
});
