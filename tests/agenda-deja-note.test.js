'use strict';

// « Noter dans l'agenda : Appel de fonds et projet envoyé » marqué fait quand la mention est déjà
// dans le lieu du rendez-vous relevé dans l'agenda (demandé par l'étude le 29/09). Dossiers inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const base = (extra) => Object.assign({
  id: 'd1', nom: 'DUPONT / MARTIN', rendezVousSignature: '2026-10-15',
  detectionsAgenda: { rendezVousSignature: '2026-10-15' },
  appelFonds: '2026-09-20', projetEnvoye: '2026-09-22', echeancesValidees: { appelFonds: true, projetEnvoye: true }
}, extra);

test('mentionDejaDansAgenda : la mention relevée dans le lieu du rendez-vous suffit', () => {
  const app = chargerApplication();
  assert.equal(app.mentionDejaDansAgenda(base({ rendezVousSignatureLieu: 'BA - Me DURAND en 2nd - Appel de fonds et projet envoyé' })), true);
  // Écrit à la main, casse et accents libres.
  assert.equal(app.mentionDejaDansAgenda(base({ rendezVousSignatureLieu: 'JV - appel de fonds + projet envoyes' })), true);
  // Le projet est parti mais le lieu ne parle que de l'appel de fonds : pas encore noté.
  assert.equal(app.mentionDejaDansAgenda(base({ rendezVousSignatureLieu: 'BA - Appel de fonds envoyé' })), false);
  // Seul l'appel de fonds est fait : sa mention suffit.
  assert.equal(app.mentionDejaDansAgenda(base({ projetEnvoye: null, echeancesValidees: { appelFonds: true }, rendezVousSignatureLieu: 'BA - Appel de fonds envoyé' })), true);
  // Lieu sans mention, ou rendez-vous de l'agenda à une autre date que la fiche.
  assert.equal(app.mentionDejaDansAgenda(base({ rendezVousSignatureLieu: 'BA' })), false);
  assert.equal(app.mentionDejaDansAgenda(base({ rendezVousSignatureLieu: 'BA - Appel de fonds et projet envoyé', rendezVousSignature: '2026-10-20' })), false);
  assert.equal(app.mentionDejaDansAgenda(base({ rendezVousSignatureLieu: '' })), false);
});

test('renderDossiersRecusLus : dit sous quel nom et dans quels dossiers les reçus ont été cherchés', () => {
  const app = chargerApplication();
  const html = app.renderDossiersRecusLus({ dossiersRecus: [{ dossier: 'X:\\VENTES', recus: 0 }, { dossier: '\\\\192.168.60.5\\Commun\\DOSSIER', recus: 2 }] }, ['groffal']);
  assert.match(html, /au nom de GROFFAL/);
  assert.match(html, /Commun\\DOSSIER \(2 fichiers\)/);
  assert.doesNotMatch(html, /VENTES/);
  assert.match(app.renderDossiersRecusLus({ dossiersRecus: [{ dossier: 'X:\\VENTES', recus: 0 }] }, ['groffal']), /aucun fichier de reçus dans : X:\\VENTES/);
  assert.equal(app.renderDossiersRecusLus({}, []), '');
});

test('envoiAgendaARattraper : un envoi validé sans note dans Outlook (décompte du NAS, case cochée) est à noter, une seule fois', () => {
  const app = chargerApplication();
  const jour = '2026-10-05';
  const sansNote = base({ detectionsAgenda: { rendezVousSignature: '2026-10-15' }, rendezVousSignatureLieu: 'BA - Me DURAND en 2nd', projetEnvoye: null, echeancesValidees: { appelFonds: true } });
  assert.equal(app.envoiAgendaARattraper(sansNote, jour), true);
  // Déjà dans le lieu relevé, déjà noté par CLAIRE, ou refusé (reste affiché sur la fiche) : rien.
  assert.equal(app.envoiAgendaARattraper(Object.assign({}, sansNote, { rendezVousSignatureLieu: 'BA - Appel de fonds envoyé' }), jour), false);
  assert.equal(app.envoiAgendaARattraper(Object.assign({}, sansNote, { agendaLieuNoteLe: '2026-10-05T10:00:00Z' }), jour), false);
  assert.equal(app.envoiAgendaARattraper(Object.assign({}, sansNote, { agendaLieuEchec: { le: '2026-10-05T10:00:00Z', message: 'Aucun rendez-vous' } }), jour), false);
  // Rendez-vous passé, sans rendez-vous, archivé, ou aucun envoi validé : rien.
  assert.equal(app.envoiAgendaARattraper(Object.assign({}, sansNote, { rendezVousSignature: '2026-10-01' }), jour), false);
  assert.equal(app.envoiAgendaARattraper(Object.assign({}, sansNote, { rendezVousSignature: '' }), jour), false);
  assert.equal(app.envoiAgendaARattraper(Object.assign({}, sansNote, { archive: true }), jour), false);
  assert.equal(app.envoiAgendaARattraper(Object.assign({}, sansNote, { echeancesValidees: {}, appelFonds: null }), jour), false);
});

test('validerEcheance : appel de fonds ou projet marqué fait à la main → noté dans le lieu du rendez-vous (auto) ; une autre échéance, non', () => {
  const vm = require('node:vm');
  const app = chargerApplication();
  vm.runInContext("dossiers.push({ id: 'dx', nom: 'DUPONT / MARTIN', rendezVousSignature: '2026-10-15', echeancesValidees: {}, historique: [] })", app);
  const appels = [];
  app.noterEnvoiDansAgenda = (id, auto) => { appels.push([id, auto]); };
  app.sauvegarder = () => {}; app.render = () => {}; app.synchroniserEcheanceAgenda = () => {}; app.notifierTacheFaite = () => {};
  app.validerEcheance('dx', 'appelFonds');
  app.validerEcheance('dx', 'projetEnvoye');
  app.validerEcheance('dx', 'pret');
  assert.deepEqual(appels, [['dx', true], ['dx', true]]);
});
