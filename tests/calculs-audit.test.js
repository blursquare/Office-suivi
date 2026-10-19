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

test('copropriété au-delà de 1,35 M€ : la maison et son supplément habituel', () => {
  for (const prix of [1350000, 1425000, 1600000, 2000000, 2500000]) {
    const m = app.estimerFraisActe(prix, '41', 'house', false);
    const c = app.estimerFraisActe(prix, '41', 'condo', false);
    const ecart = c.total - m.total;
    assert.ok(ecart > 100 && ecart < 200, `${prix} : ${ecart}`);
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

test('copropriété : dernières lignes du Barème rapide A1 2025 (étude 12/10), prolongé au-delà de 2 M€', () => {
  // Département 41 hors primo-accédant = colonne DMTO 6,3185 % ; à 4,5 % (primo) = colonne 5,80665 %.
  const primo = app.estimerFraisActe(2000000, '41', 'condo', true);
  assert.equal(Math.round(primo.emoluments), 17450);
  assert.equal(Math.round(primo.tresor), 121630);
  assert.equal(Math.round(app.estimerFraisActe(1425000, '41', 'condo', true).tresor), 86740);
  const trois = app.estimerFraisActe(3000000, '41', 'condo', true);
  assert.equal(Math.round(trois.emoluments), 17450 + 4 * 2000);
});

test('provision : détail de la ligne Trésor, écart du barème dit (rapport du 18/10)', () => {
  const e = app.estimerFraisActe(300000, '41', 'house', false);
  const dt = app.detailTresorFraisActe(300000, e.tauxApplique, e.emoluments, e.tresor);
  assert.equal(dt.dmto, 18955.5);
  assert.equal(dt.csi, 300);
  assert.equal(dt.tva, 748);
  assert.equal(dt.somme, 20003.5);
  assert.equal(dt.ecart, 2.05);
  assert.equal(app.detailTresorFraisActe(5000, 0.045, 100, 0).csi, 15, 'CSI : 15 € au moins');
});

test('provision : taxe LCB-FT à 300 € et débours à 200 € dans le total (étude 19/10)', () => {
  const e = app.estimerFraisActe(300000, '41', 'house', false);
  assert.equal(Math.round((e.total - e.emoluments - e.tresor) * 100) / 100, 500);
});
