'use strict';

// Emails des dossiers, côté poste (étude, 02/10) : pièce jointe reconnue par son nom, rubriques du NAS,
// état d'un email préparé. Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

test('pieceDePieceJointe : nom de fichier → pièce de la checklist, offre de prêt à part, exclusions respectées', () => {
  const checklist = app.checklistPieces('maison');
  const etatDate = app.pieceDePieceJointe('Etat date - copro MARTEL.pdf', app.checklistPieces('copropriete'));
  assert.equal(etatDate && etatDate.cle, 'etatDate');
  const offre = app.pieceDePieceJointe('Offre de prêt Crédit Exemple.pdf', checklist);
  assert.equal(offre.offre, true);
  assert.equal(app.pieceDePieceJointe('photo.jpg', checklist), null);
  const cu = app.pieceDePieceJointe('Certificat d’urbanisme.pdf', checklist);
  assert.equal(cu && cu.cle, 'certificatUrbanisme');
  assert.equal(app.pieceDePieceJointe('Certificat d’urbanisme.pdf', checklist, (cle) => cle === 'certificatUrbanisme'), null);
});

test('rubriquesPourPiece : mêmes rubriques que Claire Scan, racine à défaut', () => {
  assert.equal(app.rubriquesPourPiece('etatDate').join(','), 'etatDate,copro');
  assert.equal(app.rubriquesPourPiece('inconnue').length, 0);
});

test('etatEmailPrepare : envoyé, en attente, ou envois du collaborateur non lus', () => {
  assert.match(app.etatEmailPrepare({ envoyeLe: '2026-10-01T09:00:00Z', collaborateur: 'Julie VASSELIN' }, {}).texte, /^Envoyé le /);
  assert.equal(app.etatEmailPrepare({ collaborateur: 'Julie VASSELIN' }, { 'julie@office.fr': { collaborateur: 'Julie VASSELIN', statut: 'ok' } }).texte, 'Pas encore retrouvé dans les envois');
  assert.equal(app.etatEmailPrepare({ collaborateur: 'Jérémy SAUJOT' }, { 'jeremy@office.fr': { collaborateur: 'Jérémy SAUJOT', statut: 'refuse' } }).texte, 'Envois de Jérémy non lus');
});
