'use strict';
// Saison d'Halloween (étude 28/10) : orange pour tous du 24/10 au 02/11 (dates de la citrouille), puis le choix de chacun revient.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('accent de la saison d’Halloween', () => {
  const app = chargerApplication();
  assert.equal(app.accentSaisonnier('2026-10-23'), '');
  assert.equal(app.accentSaisonnier('2026-10-24'), 'orange');
  assert.equal(app.accentSaisonnier('2026-10-31'), 'orange');
  assert.equal(app.accentSaisonnier('2026-11-02'), 'orange');
  assert.equal(app.accentSaisonnier('2026-11-03'), '');
});
