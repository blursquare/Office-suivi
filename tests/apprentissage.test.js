'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('normaliserTexteApprentissage neutralise dates et nombres', () => {
  const app = chargerApplication();
  const a = app.normaliserTexteApprentissage("Le vendeur s'engage à justifier du ramonage avant le 12/06/2025.");
  const b = app.normaliserTexteApprentissage("Le vendeur s'engage à justifier du ramonage avant le 3 mars 2026.");
  assert.equal(a, b);
});

test('similariteJaccard vaut 1 pour deux ensembles identiques et 0 pour deux ensembles disjoints', () => {
  const app = chargerApplication();
  const a = new Set(['ramonage', 'cheminee', 'justifier']);
  assert.equal(app.similariteJaccard(a, new Set(a)), 1);
  assert.equal(app.similariteJaccard(a, new Set(['urbanisme', 'permis'])), 0);
});

test("mémorise une correction puis la retrouve sur une clause très proche (nom/date différents)", () => {
  const app = chargerApplication();
  const original = "Le vendeur s'engage à justifier du ramonage de la cheminée avant le 12 juin 2025.";
  app.memoriserCorrection(original, 'autre', 'Ramonage à justifier');

  const nouvelleOccurrence = "Le vendeur s'engage à justifier du ramonage de la cheminée avant le 3 mars 2026.";
  const trouvee = app.trouverCorrectionApprise(nouvelleOccurrence);
  assert.ok(trouvee, 'une correction proche aurait dû être retrouvée');
  assert.equal(trouvee.classification, 'autre');
  assert.equal(trouvee.libelle, 'Ramonage à justifier');
});

test("ne retrouve rien pour une clause sans rapport", () => {
  const app = chargerApplication();
  app.memoriserCorrection("Le vendeur s'engage à justifier du ramonage de la cheminée avant le 12 juin 2025.", 'autre', null);
  const sansRapport = app.trouverCorrectionApprise("Condition suspensive d'obtention d'un prêt immobilier au plus tard le 30 septembre 2025.");
  assert.equal(sansRapport, null);
});

test('memoriserCorrection renforce une correction existante plutôt que d\'en créer une seconde', () => {
  const app = chargerApplication();
  const texte1 = "Le vendeur s'engage à justifier du ramonage de la cheminée avant le 12 juin 2025.";
  const texte2 = "Le vendeur s'engage à justifier du ramonage de la cheminée avant le 3 mars 2026.";
  app.memoriserCorrection(texte1, 'autre', null);
  app.memoriserCorrection(texte2, 'autre', null);
  const trouvee = app.trouverCorrectionApprise(texte1);
  assert.equal(trouvee.nbConfirmations, 2);
});

test('detecterDatesDepuisTexte applique une correction apprise à une échéance non classée', () => {
  const app = chargerApplication();
  // Un texte que suggererEcheance ne classe dans aucune catégorie (pas de mot-clé prêt/acte/vente).
  const clause = "Le vendeur devra justifier du ramonage de la cheminée au plus tard avant le 12 juin 2025.";
  assert.equal(app.suggererEcheance(clause), null, "le test suppose que suggererEcheance ne classe pas cette clause seule");

  app.memoriserCorrection(clause, 'autre', 'Ramonage à justifier');

  const nouveauTexte = "Le vendeur devra justifier du ramonage de la cheminée au plus tard avant le 3 mars 2026.";
  const dates = app.detecterDatesDepuisTexte(nouveauTexte, '');
  assert.equal(dates.length, 1);
  assert.equal(dates[0].suggestion, 'autre');
  assert.equal(dates[0].apprise, true);
  assert.equal(dates[0].libelleAppris, 'Ramonage à justifier');
});
