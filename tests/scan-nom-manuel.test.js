'use strict';

// Un nom de copie tapé à la main dans Claire Scan n'est jamais recalculé (étude 28/10).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('changerChoixScan : le nom tapé reste quand le type change ensuite', () => {
  assert.equal(typeof app.changerChoixScan, 'function');
  const scan = { nom: 'scan1.pdf', date: '2026-10-01T08:00:00Z' };
  app.etatScans.scans = [scan];
  const cle = app.cleScan(scan);
  app.lecturesScans[cle] = { lecture: { texte: '' }, choix: { type: '', dossierId: '', nomCible: 'Claire Scan', rubriques: [] } };
  app.renderScans = () => {};
  app.changerChoixScan(scan.nom, 'nomCible', 'Mon courrier à moi');
  assert.equal(app.lecturesScans[cle].choix.nomCible, 'Mon courrier à moi');
  const type = app.TYPES_SCAN[0].cle;
  app.changerChoixScan(scan.nom, 'type', type);
  assert.equal(app.lecturesScans[cle].choix.nomCible, 'Mon courrier à moi');
});
