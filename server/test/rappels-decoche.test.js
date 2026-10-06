'use strict';

// Rappels après un « coché par erreur puis décoché » (étude 05/10) : le délai jusqu'à la date butoir doit revenir, sinon plus aucun
// rappel ne part. Même planning que le poste (commun/planning.js). Dossiers inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculerRappelsDus } = require('../src/jobs/rappels');
const { composerLieuAgenda } = require('../src/agendaOffice');
const { echeanceValidee } = require('../../commun/planning');

const dossier = (extra) => Object.assign({
  id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', typeVente: 'maison', roleNotaire: 'instrumentaire',
  pret: '2026-11-20', rendezVousSignature: '2026-12-10', pieces: {}, echeancesValidees: {}, historique: []
}, extra);

const types = (liste) => liste.map((r) => `${r.type}:${r.seuil}`).sort().join(',');

test('prêt : coché, plus de rappel ; décoché (date gardée), le rappel J-15 repart', () => {
  const jour = '2026-11-05'; // J-15 avant le 20/11
  assert.equal(types(calculerRappelsDus([dossier()], jour, new Set())), 'pret:15');
  assert.equal(types(calculerRappelsDus([dossier({ echeancesValidees: { pret: true } })], jour, new Set())), '');
  // Décoché : la clé disparaît, la date est intacte → même rappel qu'au départ.
  const decoche = dossier({ echeancesValidees: {} });
  assert.equal(decoche.pret, '2026-11-20');
  assert.equal(types(calculerRappelsDus([decoche], jour, new Set())), 'pret:15');
});

test('appel de fonds : décoché, la date d’envoi est partie — le rappel revient, 10 jours avant le rendez-vous', () => {
  const base = { echeancesValidees: { pret: true } };
  // Rendez-vous le 10/12 : appel de fonds 10 jours avant (30/11, étude 05/10), rappel Teams ce jour-là.
  const jour = '2026-11-30';
  const avantCoche = dossier(base);
  assert.equal(types(calculerRappelsDus([avantCoche], jour, new Set())), 'appelFonds:0');
  const coche = dossier({ echeancesValidees: { pret: true, appelFonds: true }, appelFonds: '2026-11-03' });
  // Coché : plus de rappel « appel de fonds » — c'est l'envoi du projet qui prend le relais, ancré sur le rendez-vous (J-7 = 03/12 ; pas de rappel à J-15, étude 06/10).
  assert.equal(types(calculerRappelsDus([coche], jour, new Set())), '', 'J-10 du projet : rien encore');
  assert.equal(types(calculerRappelsDus([coche], '2026-11-25', new Set())), '', 'pas de rappel du projet 15 jours avant');
  assert.equal(types(calculerRappelsDus([coche], '2026-12-03', new Set())), 'projetEnvoye:7');
  // Décoché par le poste : flag retiré ET date effacée → comme avant la coche.
  const decoche = dossier({ echeancesValidees: { pret: true }, appelFonds: '' });
  assert.equal(types(calculerRappelsDus([decoche], jour, new Set())), 'appelFonds:0');
});

test('une date d’envoi sans case cochée vaut envoi fait : pas d’échéance passée qui fausserait les rappels', () => {
  const d = dossier({ echeancesValidees: { pret: true }, appelFonds: '2026-11-03' });
  assert.equal(echeanceValidee(d, 'appelFonds'), true);
  assert.equal(types(calculerRappelsDus([d], '2026-12-03', new Set())), 'projetEnvoye:7', 'seule l’étape suivante reste à rappeler');
});

test('composerLieuAgenda : mention d’envoi retirée à la décoche, initiales et confrère gardés', () => {
  assert.equal(composerLieuAgenda('BA - Me DURAND en 2nd - Appel de fonds et projet envoyé', { appelFonds: false, projet: false }), 'BA - Me DURAND en 2nd');
  assert.equal(composerLieuAgenda('BA - Appel de fonds et projet envoyé', { appelFonds: true, projet: false }), 'BA - Appel de fonds envoyé');
  assert.equal(composerLieuAgenda('BA - Appel de fonds envoyé', { appelFonds: false, projet: false }), 'BA');
});
