'use strict';

// Relecture indépendante du 12/10 : calculs (prorata, provision au-delà de 2 M€, copropriété alignée
// sur la maison au-delà de 1,35 M€, quotités, forfait mobilier).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('prorata : des bornes saisies à la main qui contiennent la date sont gardées', () => {
  assert.equal(app.bornesProrataApresChangement('2026-11-15', 'annee', '2026-07-01', '2027-06-30', true), null);
  // Date hors des bornes : la période choisie revient.
  assert.equal(JSON.stringify(app.bornesProrataApresChangement('2027-08-01', 'annee', '2026-07-01', '2027-06-30', true)),
    JSON.stringify({ debut: '2027-01-01', fin: '2027-12-31' }));
  // Bornes automatiques : recalculées.
  assert.equal(JSON.stringify(app.bornesProrataApresChangement('2026-11-15', 'trimestre', '2026-01-01', '2026-12-31', false)),
    JSON.stringify({ debut: '2026-10-01', fin: '2026-12-31' }));
});

test('provision : au-delà de 2 M€ le barème se prolonge', () => {
  const deux = app.estimerFraisActe(2000000, '41', 'house', false);
  const trois = app.estimerFraisActe(3000000, '41', 'house', false);
  assert.ok(trois.total > deux.total * 1.4, `${trois.total} vs ${deux.total}`);
  // Émoluments : pente du dernier tronçon (17 320 − 15 320) / 250 000.
  assert.equal(Math.round(trois.emoluments), 17320 + 8000);
});

test('copropriété au-delà de 1,35 M€ : mêmes montants que la maison', () => {
  for (const prix of [1425000, 1600000, 2000000, 2500000]) {
    const m = app.estimerFraisActe(prix, '41', 'house', false);
    const c = app.estimerFraisActe(prix, '41', 'condo', false);
    assert.equal(Math.round(c.total), Math.round(m.total), String(prix));
  }
});

test('quotités : « SCI DU MOULIN » n’est pas « SCI SCI DU MOULIN »', () => {
  assert.equal(app.nomAcquereurQuotite({ civilite: 'SCI', nom: 'SCI DU MOULIN' }), 'SCI DU MOULIN');
  assert.equal(app.nomAcquereurQuotite({ civilite: 'SCI', nom: 'DU MOULIN' }), 'SCI DU MOULIN');
  assert.equal(app.nomAcquereurQuotite({ civilite: 'Madame', nom: 'Léa MARTIN' }), 'Mme Léa MARTIN');
});

test('forfait mobilier / inventaire : des droits négatifs sont ramenés à zéro', () => {
  const r = app.calculerArbitrageInventaire({ droitsSans: '-5000', droitsAvec: '1000' });
  assert.equal(r.droitsSans, 0);
  assert.ok(r.brutes <= 0);
});
