'use strict';

// Duplication serveur de checklistPieces() (voir src/piecesChecklist.js) — utilisée par le job de
// rappels Teams pour lister les pièces reçues/manquantes d'un dossier dans le message envoyé.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checklistPieces, piecesRecuesEtManquantes } = require('../src/piecesChecklist');

test('checklistPieces : une maison a la liste urbanisme + autres, sans les pièces de copropriété', () => {
  const cles = checklistPieces('maison').map((p) => p.cle);
  assert.ok(cles.includes('certificatUrbanisme'));
  assert.ok(cles.includes('titrePropriete'));
  assert.ok(!cles.includes('etatDate'), 'une maison n’a pas la checklist copropriété');
});

test('checklistPieces : une copropriété ajoute état daté / article 20-II / RIB copro', () => {
  const cles = checklistPieces('copropriete').map((p) => p.cle);
  assert.ok(cles.includes('etatDate'));
  assert.ok(cles.includes('article20'));
  assert.ok(cles.includes('ribCopro'));
});

test('checklistPieces : un terrain remplace les diagnostics par une étude de sol', () => {
  const cles = checklistPieces('terrain').map((p) => p.cle);
  assert.ok(!cles.includes('diagnosticsTechniques'));
  assert.ok(cles.includes('etudeSol'));
});

test('checklistPieces : une pièce retirée par l’étude disparaît, une pièce personnalisée s’ajoute', () => {
  const d = { piecesRetirees: ['erp'], piecesPersonnalisees: [{ cle: 'perso-1', label: 'Attestation loi Carrez' }] };
  const cles = checklistPieces('maison', d).map((p) => p.cle);
  assert.ok(!cles.includes('erp'));
  assert.ok(cles.includes('perso-1'));
});

test('checklistPieces : une pièce auto-détectée depuis un engagement du vendeur s’ajoute', () => {
  const d = { piecesEngagementsDetectees: ['ramonage'] };
  const cles = checklistPieces('maison', d).map((p) => p.cle);
  assert.ok(cles.includes('ramonage'));
});

test('piecesRecuesEtManquantes : sépare les pièces reçues des non reçues (manquante ou jamais vérifiée)', () => {
  const d = { typeVente: 'maison', pieces: { certificatUrbanisme: 'recue', erp: 'manquante' } };
  const { recues, manquantes } = piecesRecuesEtManquantes(d);
  assert.deepEqual(recues, ["Certificat d'urbanisme"]);
  assert.ok(manquantes.includes('ERP (état des risques et pollution)'));
  // avisTaxeFonciere n'a jamais été vérifié (absent de d.pieces) : compté comme manquant, pas
  // ignoré — du point de vue du responsable relancé, c'est aussi une pièce à réclamer/confirmer.
  assert.ok(manquantes.includes('Avis de taxe foncière'));
});

test('piecesRecuesEtManquantes : rien pour un dossier au rôle "participant" (checklist non suivie)', () => {
  const d = { typeVente: 'maison', roleNotaire: 'participant', pieces: {} };
  assert.deepEqual(piecesRecuesEtManquantes(d), { recues: [], manquantes: [] });
});

test('piecesRecuesEtManquantes : rien pour un dossier vide/inconnu, sans planter', () => {
  assert.deepEqual(piecesRecuesEtManquantes(null), { recues: [], manquantes: [] });
  assert.deepEqual(piecesRecuesEtManquantes({}).recues, []);
});
