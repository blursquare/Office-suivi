'use strict';
// Saison d'Halloween (étude 28/10) : orange pour tous du 25/10 au 01/11, puis le choix de chacun revient.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('accent de la saison d’Halloween', () => {
  const app = chargerApplication();
  assert.equal(app.accentSaisonnier('2026-10-24'), '');
  assert.equal(app.accentSaisonnier('2026-10-25'), 'orange');
  assert.equal(app.accentSaisonnier('2026-10-31'), 'orange');
  assert.equal(app.accentSaisonnier('2026-11-01'), 'orange');
  assert.equal(app.accentSaisonnier('2026-11-02'), '');
});
