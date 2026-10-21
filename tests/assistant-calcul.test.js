'use strict';

// Calcul libre de « Demander à CLAIRE » (21/10, palier 3) : les parties pures (CSV, tableau borné, page du bac à sable).
// Le bac à sable lui-même (réseau coupé, boucle arrêtée) se joue dans un vrai Chromium : `npm run fumee`.

const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('cellule CSV : virgule décimale, guillemets, formule neutralisée', () => {
  assert.equal(app.celluleCsvCalcul(12.5), '12,5');
  assert.equal(app.celluleCsvCalcul(null), '');
  assert.equal(app.celluleCsvCalcul(true), 'oui');
  assert.equal(app.celluleCsvCalcul('a;b'), '"a;b"');
  assert.equal(app.celluleCsvCalcul('x"y'), '"x""y"');
  assert.equal(app.celluleCsvCalcul('=1+1'), "'=1+1");
  assert.equal(app.celluleCsvCalcul('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(app.celluleCsvCalcul(-3), '-3');
});

test('tableau : validé et borné ; CSV avec BOM, séparateur « ; », une ligne par ligne', () => {
  assert.equal(app.tableauCalculValide(null), null);
  assert.equal(app.tableauCalculValide({ colonnes: [], lignes: [] }), null);
  assert.equal(app.tableauCalculValide({ colonnes: ['a'], lignes: 'x' }), null);
  const t = app.tableauCalculValide({ titre: 'Offres', colonnes: ['Dossier', 'Montant'], lignes: [['VTE - X', 180000], ['VTE - Y']] });
  const csv = app.csvDepuisTableauCalcul(t);
  assert.equal(csv, '﻿Dossier;Montant\r\nVTE - X;180000\r\nVTE - Y;\r\n');
  const grand = app.tableauCalculValide({ colonnes: ['a'], lignes: new Array(25000).fill([1]) });
  assert.equal(grand.lignes.length, 20000);
  assert.equal(grand.coupe, true);
});

test('page du bac à sable : CSP qui coupe tout, iframe sans origine, un Worker blob', () => {
  const page = app.pageBacASableCalcul();
  assert.match(page, /default-src 'none'/);
  assert.match(page, /worker-src blob:/);
  assert.doesNotMatch(page, /connect-src|img-src|frame-src/, 'rien d’autre que le défaut « none »');
  assert.match(page, /ev\.source !== parent/, 'seul le parent peut lancer un calcul');
  assert.match(app.SOURCE_WORKER_CALCUL, /AsyncFunction/);
});
