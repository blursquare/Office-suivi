'use strict';

// Prévenir le responsable quand un autre collaborateur ajoute ou change une date du dossier.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

test('doitNotifierDateAjoutee : seulement un autre collaborateur, une date réellement nouvelle', () => {
  const d = { responsable: 'Julie VASSELIN' };
  assert.equal(app.doitNotifierDateAjoutee(d, 'Bastien ANGLUMENT', '2026-10-14', ''), true);
  assert.equal(app.doitNotifierDateAjoutee(d, 'Bastien ANGLUMENT', '2026-10-14', '2026-10-01'), true);
  assert.equal(app.doitNotifierDateAjoutee(d, 'Julie VASSELIN', '2026-10-14', ''), false, 'le responsable lui-même');
  assert.equal(app.doitNotifierDateAjoutee(d, '', '2026-10-14', ''), false, 'auteur inconnu');
  assert.equal(app.doitNotifierDateAjoutee(d, 'Bastien ANGLUMENT', '', '2026-10-01'), false, 'date vidée');
  assert.equal(app.doitNotifierDateAjoutee(d, 'Bastien ANGLUMENT', '2026-10-14', '2026-10-14'), false, 'inchangée');
  assert.equal(app.doitNotifierDateAjoutee({}, 'Bastien ANGLUMENT', '2026-10-14', ''), false, 'sans responsable');
  assert.equal(app.doitNotifierDateAjoutee({ responsable: 'Julie VASSELIN', archive: true }, 'Bastien ANGLUMENT', '2026-10-14', ''), false, 'archivé');
});

test('doitNotifierDateAjoutee : un rendez-vous avancé le même jour compte (page Agenda)', () => {
  const d = { responsable: 'Julie VASSELIN' };
  assert.equal(app.doitNotifierDateAjoutee(d, 'Bastien ANGLUMENT', '2026-10-14', '2026-10-14'), false);
  assert.equal(app.doitNotifierDateAjoutee(d, 'Bastien ANGLUMENT', '2026-10-14', '2026-10-14', { heure: '14:00', ancienneHeure: '10:00' }), true);
  assert.equal(app.doitNotifierDateAjoutee(d, 'Bastien ANGLUMENT', '2026-10-14', '2026-10-14', { heure: '10:00', ancienneHeure: '10:00' }), false);
  assert.equal(app.doitNotifierDateAjoutee(d, 'Julie VASSELIN', '2026-10-15', '2026-10-14', { heure: '10:00' }), false, 'jamais pour soi-même');
});
