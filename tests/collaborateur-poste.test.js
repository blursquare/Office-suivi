'use strict';

// Collaborateur du poste : le tableau de bord s'adapte à la personne qui l'ouvre (voir
// « Collaborateur du poste » dans script.js et CLAUDE.md). Fonctions pures uniquement.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('prenomCollaborateur : garde le prénom, retire le nom en capitales', () => {
  assert.equal(app.prenomCollaborateur('Julie VASSELIN'), 'Julie');
  assert.equal(app.prenomCollaborateur('Jérémy SAUJOT'), 'Jérémy');
  assert.equal(app.prenomCollaborateur('Bastien ANGLUMENT'), 'Bastien');
  assert.equal(app.prenomCollaborateur(''), '');
});

test('vueGlobalePour : globale pour l’administrateur ou un poste inconnu, sauf choix explicite', () => {
  assert.equal(app.vueGlobalePour('', null), true);
  assert.equal(app.vueGlobalePour('Bastien ANGLUMENT', null), true);
  assert.equal(app.vueGlobalePour('Julie VASSELIN', null), false);
  assert.equal(app.vueGlobalePour('Julie VASSELIN', true), true);
  assert.equal(app.vueGlobalePour('Bastien ANGLUMENT', false), false);
});

test('dossiersDuPerimetre : ses dossiers, ou tous en vue globale', () => {
  const l = [{ id: 'a', responsable: 'Julie VASSELIN' }, { id: 'b', responsable: 'Jérémy SAUJOT' }, { id: 'c' }];
  assert.equal(app.dossiersDuPerimetre(l, 'Julie VASSELIN', false).map(d => d.id).join(','), 'a');
  assert.equal(app.dossiersDuPerimetre(l, 'Julie VASSELIN', true).length, 3);
  assert.equal(app.dossiersDuPerimetre(l, '', false).length, 3);
});

test('rendezVousProchains : 15 jours, aujourd’hui compris, avec l’état des deux envois', () => {
  const l = [
    { id: 'a', nom: 'A', rendezVousSignature: '2026-10-01', appelFonds: '2026-09-20', echeancesValidees: { appelFonds: true } },
    { id: 'b', nom: 'B', rendezVousSignature: '2026-09-25', echeancesValidees: { appelFonds: true, projetEnvoye: true } },
    { id: 'c', nom: 'C', rendezVousSignature: '2026-10-20' },
    { id: 'd', nom: 'D', rendezVousSignature: '2026-09-20' },
    { id: 'e', nom: 'E' }
  ];
  const r = app.rendezVousProchains(l, '2026-09-25');
  assert.equal(r.map(x => x.dossier.id).join(','), 'b,a');
  assert.equal(r[0].jours, 0);
  assert.equal(r[0].appelFondsEnvoye && r[0].projetEnvoye, true);
  assert.equal(r[1].appelFondsEnvoye, true);
  assert.equal(r[1].projetEnvoye, false);
});

test('piecesDepuisVisite : seulement ce qui est arrivé après la visite précédente', () => {
  const l = [{ id: 'a', piecesTrouveesLe: { erp: '2026-09-24T10:00:00.000Z', titrePropriete: '2026-09-20T10:00:00.000Z' } }];
  assert.equal(app.piecesDepuisVisite(l, '2026-09-22T00:00:00.000Z').map(p => p.cle).join(','), 'erp');
  assert.equal(app.piecesDepuisVisite(l, null).length, 0);
});

test('resumeAccueilCollaborateur : ne cite que ce qui est non nul', () => {
  assert.equal(app.resumeAccueilCollaborateur({}), 'Rien d’urgent pour le moment.');
  assert.equal(
    app.resumeAccueilCollaborateur({ rendezVous: 2, echeances7: 0, piecesDepuisVisite: 1 }),
    '2 rendez-vous de signature dans les 15 jours et 1 pièce arrivée depuis votre dernière visite.'
  );
  assert.equal(
    app.resumeAccueilCollaborateur({ rendezVous: 1, echeances7: 3, piecesDepuisVisite: 2 }),
    '1 rendez-vous de signature dans les 15 jours, 3 échéances dans la semaine et 2 pièces arrivées depuis votre dernière visite.'
  );
});
