'use strict';

// Relance ciblée à l'IA locale sur UN SEUL champ (voir script.js, section « EXTRACTION STRUCTURÉE :
// relance ciblée... » et server/src/extraction/cible.js). Même règle centrale que la fusion des
// trois lots automatiques (tests/fusion.test.js) : la réponse du modèle ne devient JAMAIS elle-même
// une valeur du formulaire, seulement une proposition affichée avec un bouton « Utiliser ».

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const SIGNATURE = '2026-09-15';
const ACTE_PAUVRE = 'Le présent compromis est signé le 15 septembre 2026. Les parties conviennent de ce qui suit.';

function extraction(app, texte) {
  return app.construireExtractionRegex(texte, SIGNATURE);
}

test('un champ texte vide reçoit une proposition, jamais une valeur écrite', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  assert.equal(e.champs.prixVente.valeur, null);

  app.fusionnerCibleIa(e, 'prixVente', { valeur: 185000, extrait: 'Les parties conviennent de ce qui suit', extraitTrouve: true, extraitIndex: 40 }, ACTE_PAUVRE);
  assert.equal(e.champs.prixVente.valeur, null, 'la valeur reste vide tant que personne n’a cliqué « Utiliser »');
  assert.equal(e.champs.prixVente.propositionIa.valeur, 185000);
  assert.equal(e.champs.prixVente.propositionIa.extraitTrouve, true);
});

test('un extrait cité par le modèle mais absent du texte est signalé, pas rejeté', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  app.fusionnerCibleIa(e, 'emailAcquereur', { valeur: 'jean.dupont@example.fr', extrait: 'une phrase inventée', extraitTrouve: false, extraitIndex: null }, ACTE_PAUVRE);
  assert.equal(e.champs.emailAcquereur.propositionIa.valeur, 'jean.dupont@example.fr');
  assert.equal(e.champs.emailAcquereur.propositionIa.extraitTrouve, false);
});

test('une donnée déjà corrigée à la main (origine manuel) n’est jamais rouverte', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  app.ecrireChampRevision(e, 'nom', 'DUPONT / MARTIN');
  assert.equal(e.champs.nom.origine, 'manuel');
  app.fusionnerCibleIa(e, 'nom', { valeur: 'MARTIN / DUPONT', extrait: 'x', extraitTrouve: true, extraitIndex: 0 }, ACTE_PAUVRE);
  assert.equal(e.champs.nom.valeur, 'DUPONT / MARTIN');
  assert.equal(e.champs.nom.propositionIa, null);
});

test('une date calendaire cible est proposée telle quelle', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  app.fusionnerCibleIa(e, 'acte', { dateExplicite: '2027-01-10', delai: null, extrait: 'réitérée le 10 janvier 2027', extraitTrouve: true, extraitIndex: 5 }, ACTE_PAUVRE);
  assert.equal(e.dates.REITERATION_ACTE.propositionIa.valeur, '2027-01-10');
});

test('une date cible exprimée en délai est calculée depuis la signature déjà connue', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  app.fusionnerCibleIa(e, 'pret', {
    dateExplicite: null,
    delai: { valeur: 60, unite: 'jours', pointDepart: 'la signature des présentes' },
    extrait: 'dans un délai de 60 jours à compter de la signature des présentes', extraitTrouve: true, extraitIndex: 5
  }, ACTE_PAUVRE);
  // 15 septembre 2026 + 60 jours = 14 novembre 2026
  assert.equal(e.dates.BUTOIR_PRET.propositionIa.valeur, '2026-11-14');
});

test('une date cible en délai SANS point de départ calculable ne propose rien', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  app.fusionnerCibleIa(e, 'pret', {
    dateExplicite: null,
    delai: { valeur: 30, unite: 'jours', pointDepart: 'la notification du refus' },
    extrait: 'dans un délai de 30 jours à compter de la notification du refus', extraitTrouve: true, extraitIndex: 5
  }, ACTE_PAUVRE);
  assert.ok(!e.dates.BUTOIR_PRET.propositionIa);
});

test('l’adresse du bien passe par extraction.bien.propositionIa comme les lots automatiques', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  app.fusionnerCibleIa(e, 'adresseBien', { valeur: '12 rue des Lilas 41000 BLOIS', extrait: 'sis 12 rue des Lilas', extraitTrouve: true, extraitIndex: 5 }, ACTE_PAUVRE);
  assert.equal(e.bien.propositionIa.valeur, '12 rue des Lilas 41000 BLOIS');
});

test('CLES_CIBLE_IA n’inclut pas roleNotaire : ce n’est pas une lecture directe du texte', () => {
  const app = chargerApplication();
  assert.equal(app.CLES_CIBLE_IA.has('roleNotaire'), false);
  assert.equal(app.CLES_CIBLE_IA.has('prixVente'), true);
});
