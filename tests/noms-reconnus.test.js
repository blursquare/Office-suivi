'use strict';

// Liste des noms de fichiers reconnus (EXEMPLES_NOMS_PIECES, affichée dans Réglages › Pièces et Claire
// Scan) : chaque exemple doit vraiment être reconnu, chaque contre-exemple jamais, et chaque pièce
// standard doit avoir sa ligne.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();
const toutesPieces = [...app.PIECES_URBANISME, app.PIECE_NON_PERIL, ...app.PIECES_COPROPRIETE, ...app.PIECES_AUTRES, ...app.PIECES_TERRAIN_AUTRES, ...app.PIECES_ENGAGEMENTS_AUTO];
const piece = (cle) => toutesPieces.find(p => p.cle === cle);
const reconnu = (cle, nom) => {
  const nn = app.normaliserNomPourMotif(nom + '.pdf');
  return cle === 'offrePret' ? app.nomDitOffrePret(nn) : !!app.correspondancePieceNom(piece(cle), nn);
};

test('chaque nom de la liste est reconnu pour sa pièce, et sous un nom complété (client, date)', () => {
  const rates = [];
  for (const e of app.EXEMPLES_NOMS_PIECES) {
    for (const nom of e.noms) {
      if (!reconnu(e.cle, nom)) rates.push(`${e.cle} : ${nom}`);
      if (!reconnu(e.cle, `${nom} - MARTEL 2026-09-12`)) rates.push(`${e.cle} : ${nom} (complété)`);
    }
  }
  assert.equal(rates.join(' | '), '');
});

test('les contre-exemples ne sont jamais reconnus', () => {
  const faux = [];
  for (const e of app.EXEMPLES_NOMS_PIECES) for (const nom of e.pas || []) if (reconnu(e.cle, nom)) faux.push(`${e.cle} : ${nom}`);
  assert.equal(faux.join(' | '), '');
});

test('chaque pièce standard a sa ligne dans la liste', () => {
  const avecExemples = new Set(app.EXEMPLES_NOMS_PIECES.map(e => e.cle));
  const manquantes = [...new Set(toutesPieces.map(p => p.cle))].filter(c => !avecExemples.has(c));
  assert.equal(manquantes.join(','), '');
});

test('pièce jointe : « Titre de séjour » n’est pas un titre de propriété, une forme approchante suffit', () => {
  const checklist = app.checklistPieces('maison');
  assert.equal(app.pieceDePieceJointe('Titre de séjour.pdf', checklist), null);
  const cu = app.pieceDePieceJointe('CU.pdf', checklist);
  assert.equal(cu && cu.cle, 'certificatUrbanisme');
  assert.equal(app.pieceDePieceJointe('Contrat de crédit immobilier.pdf', checklist).offre, true);
});

test('une demande partie n’est jamais la réponse de la mairie (étude 30/10) ; « Courrier réponse … » reste la réponse', () => {
  const app = chargerApplication();
  const pieces = app.checklistPieces('maison', {});
  const cles = (n) => pieces.filter(p => app.correspondancePieceNom(p, app.normaliserNomPourMotif(n))).map(p => p.cle).join(',');
  assert.equal(cles("Demande de certificat d'alignement.pdf"), '');
  assert.equal(cles("Courrier demande alignement et numérotage MARTIN.pdf"), '');
  assert.equal(cles("Relance certificat d'urbanisme.pdf"), '');
  assert.equal(cles("Envoi demande non péril.pdf"), '');
  assert.equal(cles("Certificat d'alignement.pdf"), 'certificatAlignement');
  assert.equal(cles('Courrier réponse assainissement.pdf'), 'reponseAssainissement');
  assert.equal(cles("Courrier mairie certificat d'urbanisme reçu.pdf"), 'certificatUrbanisme');
  // « Interrogation » dans le nom : le courrier de l'étude, jamais la pièce — sauf l'interrogation du FCDDV (succession).
  assert.equal(cles("Interrogation mairie certificat d'urbanisme.pdf"), '');
  assert.equal(cles('Taxe foncière interrogation SIE.pdf'), '');
  const succ = app.checklistPieces('maison', { typeAffaire: 'succession' }).concat(app.PIECES_SUCCESSION || []);
  const fcddv = succ.find(p => p.cle === 'fcddv');
  if (fcddv) assert.equal(app.correspondancePieceNom(fcddv, app.normaliserNomPourMotif('Interrogation FCDDV DURAND.pdf')), 'exact');
  // Une demande relevée dans Authentic reste rattachée à sa pièce, même avec plusieurs mots du geste en tête.
  assert.equal(Object.keys(app.demandesUrbanismeAuthentic([{ titre: 'Courrier de demande de numérotage', etat: 'Envoyé' }])).join(), 'certificatNumerotage');
  assert.equal(Object.keys(app.demandesUrbanismeAuthentic([{ titre: "Demande de certificat d'urbanisme", etat: 'Envoyé' }])).join(), 'certificatUrbanisme');
});
