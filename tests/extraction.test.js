'use strict';

// Objet d'extraction unifié et contrôle de cohérence (voir la section « EXTRACTION STRUCTURÉE :
// objet unifié et contrôle de cohérence » dans script.js). Tout ce que les regex savent lire est
// rassemblé dans un seul objet, chaque donnée portant son statut, sa provenance et sa source dans
// le PDF — c'est ce même objet que la passe IA viendra ensuite compléter.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const SIGNATURE = '2026-09-15';

// Acte complet et cohérent : trois adresses différentes y figurent (vendeur, acquéreur, notaires)
// en plus de celle du bien — c'est précisément le piège que la spec demande d'éviter.
const ACTE = `COMPROMIS DE VENTE

Entre les soussignés :
LE VENDEUR : Monsieur Jean DUPONT né le 12 mars 1960 à Blois, demeurant 3 rue des Lilas, 41000 BLOIS.
Ci-après dénommé le vendeur.
L'ACQUÉREUR : Monsieur Pierre MARTIN né le 5 juillet 1985 à Tours, demeurant 8 rue Neuve, 37000 TOURS.
Ci-après dénommé l'acquéreur.

Maître Sophie GOSSART, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire du vendeur.
Maître Paul DURAND, notaire à Orléans, 8 rue C, 45000 ORLÉANS, notaire de l'acquéreur.

DÉSIGNATION
Une maison d'habitation sise à 25 route de Tours, 41100 VENDÔME, cadastrée section AB numéro 125.

PRIX
Le prix est fixé à DEUX CENT MILLE EUROS (200 000 €).

CONDITIONS SUSPENSIVES
L'acquéreur devra obtenir son financement au plus tard le 15 novembre 2026.
La réitération par acte authentique interviendra au plus tard le 15 décembre 2026.
Le présent compromis est signé le 15 septembre 2026.`;

test('construireExtractionRegex rassemble type d’acte, parties, prix et dates', () => {
  const app = chargerApplication();
  const e = app.construireExtractionRegex(ACTE, SIGNATURE);
  assert.equal(e.typeActe.valeur, 'COMPROMIS_DE_VENTE');
  assert.equal(e.champs.nom.valeur, 'DUPONT / MARTIN');
  assert.equal(e.champs.prixVente.valeur, 200000);
  assert.equal(e.dates.BUTOIR_PRET.valeur, '2026-11-15');
  assert.equal(e.dates.REITERATION_ACTE.valeur, '2026-12-15');
  assert.equal(e.dates.SIGNATURE_AVANT_CONTRAT.valeur, SIGNATURE);
});

test('l’adresse retenue est celle du BIEN, pas celle d’une partie ni celle d’un notaire', () => {
  // Le vendeur demeure 41000 BLOIS, l'acquéreur 37000 TOURS, les notaires à BLOIS et ORLÉANS :
  // seule l'adresse de la section DÉSIGNATION décrit le bien vendu.
  const app = chargerApplication();
  const a = app.construireExtractionRegex(ACTE, SIGNATURE).bien.adresse;
  assert.equal(a.codePostal, '41100');
  assert.equal(a.commune, 'VENDÔME');
  assert.equal(a.numero, '25');
  assert.equal(a.typeVoie, 'route');
  assert.equal(a.departement, '41');
  assert.equal(a.statut, 'CONFIRMED');
});

test('les références cadastrales sont relevées', () => {
  const app = chargerApplication();
  const c = app.construireExtractionRegex(ACTE, SIGNATURE).bien.cadastre;
  assert.equal(c.section, 'AB');
  assert.equal(c.numero, '125');
});

test('le notaire instrumentaire est déterminé à partir du département du bien', () => {
  // Le bien est dans le 41 : c'est ce département, déduit de l'adresse du bien, qui déclenche la
  // règle métier — d'où l'importance de ne pas s'être trompé d'adresse.
  const app = chargerApplication();
  const n = app.construireExtractionRegex(ACTE, SIGNATURE).notaires;
  assert.equal(n.instrumentaire.nom, 'Sophie GOSSART');
  assert.equal(n.roleEtude, 'instrumentaire');
  assert.equal(n.statut, 'CONFIRMED');
});

test('un acte cohérent ne déclenche aucune alerte', () => {
  const app = chargerApplication();
  assert.equal(app.construireExtractionRegex(ACTE, SIGNATURE).alertes.length, 0);
});

test('alerte quand l’échéance de prêt tombe après la signature de l’acte', () => {
  const app = chargerApplication();
  const e = app.construireExtractionRegex(
    "Le présent compromis est signé le 15 septembre 2026. " +
    "La réitération aura lieu au plus tard le 15 novembre 2026. " +
    "L'acquéreur devra obtenir son prêt au plus tard le 15 décembre 2026.", SIGNATURE);
  const codes = e.alertes.map(a => a.code);
  assert.ok(codes.includes('PRET_APRES_ACTE'));
  assert.equal(e.alertes.find(a => a.code === 'PRET_APRES_ACTE').gravite, 'critique');
});

test('alerte quand l’acte parle de promettant/bénéficiaire sans que son type soit établi', () => {
  // C'est exactement la situation où l'inversion vendeur/acquéreur passerait inaperçue.
  const app = chargerApplication();
  const e = app.construireExtractionRegex(
    "Monsieur Jean DUPONT, ci-après dénommé LE PROMETTANT. " +
    "Monsieur Pierre MARTIN, ci-après dénommé LE BÉNÉFICIAIRE. " +
    "Le bien est sis à 12 rue Victor Hugo, 41000 BLOIS.", SIGNATURE);
  assert.ok(e.alertes.some(a => a.code === 'TYPE_ACTE_VS_QUALITES'));
});

test('alerte quand la date écrite et le délai énoncé ne concordent pas', () => {
  const app = chargerApplication();
  const e = app.construireExtractionRegex(
    "Le présent compromis est signé le 15 septembre 2026. " +
    "L'acquéreur devra obtenir son prêt au plus tard le 15 décembre 2026, " +
    "soit un délai de 30 jours à compter de la signature.", SIGNATURE);
  assert.ok(e.alertes.some(a => a.code === 'DATE_EXPLICITE_VS_DELAI'));
  // La date ÉCRITE reste celle retenue.
  assert.equal(e.dates.BUTOIR_PRET.valeur, '2026-12-15');
});

test('alerte quand l’adresse du bien est incomplète', () => {
  const app = chargerApplication();
  const e = app.construireExtractionRegex("Le présent compromis est signé le 15 septembre 2026.", SIGNATURE);
  assert.ok(e.alertes.some(a => a.code === 'ADRESSE_INCOMPLETE'));
});

test('controlerCoherence signale une réitération à la date de la signature', () => {
  // Ce cas ne peut pas venir des regex (une date antérieure ou égale à la signature est déjà
  // écartée), mais il reste possible via la passe IA — le garde-fou est donc testé directement.
  const app = chargerApplication();
  const alertes = app.controlerCoherence({
    dates: {
      SIGNATURE_AVANT_CONTRAT: { valeur: SIGNATURE },
      REITERATION_ACTE: { valeur: SIGNATURE }
    },
    bien: { adresse: { statut: 'CONFIRMED' } },
    notaires: {},
    parties: []
  });
  assert.ok(alertes.some(a => a.code === 'SIGNATURE_EGALE_REITERATION'));
});

test('controlerCoherence signale un notaire instrumentaire non tranché', () => {
  const app = chargerApplication();
  const alertes = app.controlerCoherence({
    dates: {},
    bien: { adresse: { statut: 'CONFIRMED' } },
    notaires: { statut: 'NEEDS_REVIEW', raison: 'Règle non applicable.' },
    parties: []
  });
  assert.ok(alertes.some(a => a.code === 'NOTAIRE_INSTRUMENTAIRE_INCERTAIN'));
});
