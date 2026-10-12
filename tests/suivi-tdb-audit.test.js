'use strict';

// Relecture indépendante du 12/10 : Suivi des dossiers et tableau de bord.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('donnée abîmée : éléments nuls retirés des listes, liste au lieu d’objet ramenée', () => {
  const d = app.assainirStructureDossier({ id: 'x', nom: 'A / B', autres: [null, { label: 'Diag', date: '2026-11-01' }], piecesPersonnalisees: {}, parties: [null] });
  assert.equal(d.autres.length, 1);
  assert.equal(Array.isArray(d.piecesPersonnalisees), true);
  assert.equal(d.parties.length, 0);
});

test('acte signé : plus de date butoir dépassée (plus « Urgent »)', () => {
  const d = { id: 'x', nom: 'A / B', pret: '2020-01-01', echeancesValidees: { rendezVousSignature: true }, rendezVousSignature: '2020-02-01', historique: [] };
  assert.equal(app.datesButoirDepassees(d, '2026-10-12').length, 0);
  const pasSigne = { id: 'y', nom: 'A / B', pret: '2020-01-01', historique: [] };
  assert.equal(app.datesButoirDepassees(pasSigne, '2026-10-12').length, 1);
  assert.equal(app.datesButoirDepassees({ id: 'z', nom: 'A', pret: 'n’importe quoi', historique: [] }, '2026-10-12').length, 0);
});
