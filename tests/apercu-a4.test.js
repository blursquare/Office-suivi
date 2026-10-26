'use strict';
// Aperçu A4 du courrier d'appel de fonds (étude 26/10) : zoom qui fait tenir la feuille, nombre de pages entières.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('zoom de la feuille A4 : jamais agrandie, jamais sous 35 %, 1 si la largeur est inconnue', () => {
  assert.equal(app.zoomApercuA4(2000), 1);
  assert.equal(app.zoomApercuA4(793.7), 1);
  assert.ok(Math.abs(app.zoomApercuA4(396.85) - 0.5) < 0.001);
  assert.equal(app.zoomApercuA4(100), 0.35);
  assert.equal(app.zoomApercuA4(0), 1);
  assert.equal(app.zoomApercuA4(undefined), 1);
});

test('pages A4 couvertes par un contenu : une page au moins, entières, tolérance de 1 px', () => {
  assert.equal(app.pagesApercuA4(0), 1);
  assert.equal(app.pagesApercuA4(1000), 1);
  assert.equal(app.pagesApercuA4(1122.5), 1);
  assert.equal(app.pagesApercuA4(1123.4), 1, '1 px de tolérance');
  assert.equal(app.pagesApercuA4(1130), 2);
  assert.equal(app.pagesApercuA4(2245), 2);
  assert.equal(app.pagesApercuA4(2300), 3);
});
