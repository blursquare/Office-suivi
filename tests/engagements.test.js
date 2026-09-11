'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('extraireEngagementsVendeur détecte un engagement de type "document"', () => {
  const app = chargerApplication();
  const texte = "Le vendeur s'engage à remettre un certificat de conformité avant la signature de l'acte.";
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 1);
  assert.equal(engagements[0].type, 'document');
});

test('extraireEngagementsVendeur détecte un engagement de type "entretien"', () => {
  const app = chargerApplication();
  const texte = 'Le vendeur devra justifier du ramonage de la cheminée avant la vente.';
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 1);
  assert.equal(engagements[0].type, 'entretien');
});

test('extraireEngagementsVendeur détecte un engagement de type "travaux"', () => {
  const app = chargerApplication();
  const texte = 'Le vendeur s\'engage à faire exécuter les travaux de remise en état de la toiture.';
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 1);
  assert.equal(engagements[0].type, 'travaux');
});

test('extraireEngagementsVendeur fonctionne aussi pour un "promettant" (promesse unilatérale)', () => {
  const app = chargerApplication();
  const texte = 'Le promettant s\'engage à remettre le certificat de conformité au bénéficiaire.';
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 1);
});

test('extraireEngagementsVendeur écarte une clause hypothétique', () => {
  const app = chargerApplication();
  const texte = "Si les biens venaient à se révéler non conformes, le vendeur s'engage à fournir une attestation de mise en conformité.";
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 0);
});

test('extraireEngagementsVendeur écarte une énumération d\'équipements (immeubles par destination)', () => {
  const app = chargerApplication();
  const texte = "Le vendeur s'engage à laisser dans l'immeuble par destination les équipements ci-après désignés, sans que cette liste soit limitative : la chaudière, le certificat du portail.";
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 0);
});

test('extraireEngagementsVendeur écarte un thème hors périmètre (urbanisme, copropriété...)', () => {
  const app = chargerApplication();
  const texte = "Le vendeur s'engage à fournir le certificat d'urbanisme au notaire.";
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 0);
});

test('extraireEngagementsVendeur écarte la clause standard de demande de visite', () => {
  // Signalé par l'étude : cette clause d'organisation des visites du bien avant la vente
  // ressortait à tort comme un engagement/obligation à réclamer après coup.
  const app = chargerApplication();
  const texte = "Le vendeur s'engage à faciliter l'accès au bien en cas de demande de visite formulée par l'acquéreur ou ses mandataires.";
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 0);
});

test('detecterDocumentsAFournir reconnaît un type de document courant dans les clauses', () => {
  const app = chargerApplication();
  const engagements = app.extraireEngagementsVendeur("Le vendeur s'engage à remettre un justificatif de ramonage de la cheminée.");
  const documents = app.detecterDocumentsAFournir(engagements);
  assert.ok(documents.some(d => d.label === 'Justificatif de ramonage'));
  assert.ok(documents.every(d => d.cat === 'entretien' || typeof d.cat === 'string'));
});

test('extraireConditions restitue les rubriques de la section "Conditions suspensives"', () => {
  const app = chargerApplication();
  const texte = `
Conditions suspensives

CERTIFICAT D'URBANISME :
Le vendeur devra produire un certificat d'urbanisme datant de moins de trois mois avant la signature.

Conditions particulières
DIVERS : néant.
`;
  const conditions = app.extraireConditions(texte);
  assert.ok(conditions.some(c => c.type === 'suspensive' && /URBANISME/.test(c.titre)));
});
