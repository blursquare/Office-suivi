'use strict';

// Liste des noms de fichiers reconnus (EXEMPLES_NOMS_PIECES, affichée dans Réglages › Pièces et Claire
// Scan) : chaque exemple doit vraiment être reconnu, chaque contre-exemple jamais, et chaque pièce
// standard doit avoir sa ligne.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();
const toutesPieces = [...app.PIECES_URBANISME, ...app.PIECES_COPROPRIETE, ...app.PIECES_AUTRES, ...app.PIECES_TERRAIN_AUTRES, ...app.PIECES_ENGAGEMENTS_AUTO];
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
