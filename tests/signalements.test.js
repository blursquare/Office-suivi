'use strict';

// Signalements de problèmes (voir script.js, section « SIGNALEMENTS DE PROBLÈMES ») : les parties
// pures — tampon d'erreurs techniques, réduction de la capture, filtres de tri, phrase de contexte.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('ajouterErreurTampon : borné, sans doublon consécutif, erreurs vides ignorées', () => {
  const t = [];
  app.ajouterErreurTampon(t, { message: 'A', source: 'script.js:1', at: 't1' }, 3);
  app.ajouterErreurTampon(t, { message: 'A', source: 'script.js:1', at: 't2' }, 3);
  assert.equal(t.length, 1);
  assert.equal(t[0].fois, 2);
  assert.equal(t[0].at, 't2');
  app.ajouterErreurTampon(t, { message: '' }, 3);
  ['B', 'C', 'D'].forEach(m => app.ajouterErreurTampon(t, { message: m }, 3));
  assert.equal(t.map(e => e.message).join(','), 'B,C,D');
});

test('dimensionsCaptureReduite : proportions gardées, jamais agrandie', () => {
  const r = app.dimensionsCaptureReduite(3200, 1800, 1600);
  assert.equal(r.largeur, 1600);
  assert.equal(r.hauteur, 900);
  const p = app.dimensionsCaptureReduite(800, 600, 1600);
  assert.equal(p.largeur, 800);
  assert.equal(p.hauteur, 600);
});

test('filtrerSignalements : à trier, transmis, traités, tous', () => {
  const l = ['nouveau', 'transmis', 'corrige', 'doublon', 'ecarte', 'nouveau'].map((statut, i) => ({ id: String(i), statut }));
  assert.equal(app.filtrerSignalements(l, 'a-trier').length, 2);
  assert.equal(app.filtrerSignalements(l, 'transmis').length, 1);
  assert.equal(app.filtrerSignalements(l, 'traites').length, 3);
  assert.equal(app.filtrerSignalements(l, 'tous').length, 6);
  assert.equal(app.filtrerSignalements(null, 'tous').length, 0);
});

test('resumeContexteSignalement : dit ce qui est joint, erreurs au singulier/pluriel', () => {
  const r = app.resumeContexteSignalement({ version: '2026-09-24 20:00', onglet: 'Suivi des dossiers', dossierNom: 'DUPONT / MARTIN', erreurs: [{}, {}] });
  assert.match(r, /version 2026-09-24 20:00/);
  assert.match(r, /écran « Suivi des dossiers »/);
  assert.match(r, /dossier DUPONT \/ MARTIN/);
  assert.match(r, /2 erreurs techniques récentes/);
  assert.match(app.resumeContexteSignalement({ erreurs: [] }), /aucune erreur technique récente/);
  assert.match(app.resumeContexteSignalement({ erreurs: [{}] }), /1 erreur technique récente$/);
});
