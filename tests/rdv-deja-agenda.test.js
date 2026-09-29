'use strict';

// « Créer le rendez-vous dans l'agenda Outlook » n'est plus proposé pour un rendez-vous déjà placé
// dans l'agenda de l'office : créé depuis CLAIRE, ou posé à la main et relevé par la lecture de
// l'agenda (demandé par l'étude le 29/09). Dossiers inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('rdvDejaDansAgenda : créé depuis CLAIRE ou relevé à la même date dans l’agenda', () => {
  const app = chargerApplication();
  const base = { id: 'd1', nom: 'DUPONT / MARTIN', rendezVousSignature: '2026-10-15' };
  assert.equal(app.rdvDejaDansAgenda(base), false);
  assert.equal(app.rdvDejaDansAgenda(Object.assign({}, base, { rdvAgendaCreeLe: '2026-09-29T08:00:00.000Z' })), true);
  // Posé à la main dans Outlook, relevé par agendaWatch à la même date.
  assert.equal(app.rdvDejaDansAgenda(Object.assign({}, base, { detectionsAgenda: { rendezVousSignature: '2026-10-15' } })), true);
  // Date corrigée à la main depuis : le rendez-vous de l'agenda n'est plus celui-ci.
  assert.equal(app.rdvDejaDansAgenda(Object.assign({}, base, { rendezVousSignature: '2026-10-20', detectionsAgenda: { rendezVousSignature: '2026-10-15' } })), false);
  // Disparu de l'agenda depuis : on peut de nouveau le créer.
  assert.equal(app.rdvDejaDansAgenda(Object.assign({}, base, { detectionsAgenda: { rendezVousSignature: '2026-10-15', rendezVousDisparu: '2026-10-15' } })), false);
  assert.equal(app.rdvDejaDansAgenda({ id: 'd2' }), false);
});
