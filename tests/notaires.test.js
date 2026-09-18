'use strict';

// Détection des notaires et détermination de l'instrumentaire (voir la section « EXTRACTION
// STRUCTURÉE : notaires » dans script.js). Entièrement nouveau : le rôle de l'étude sur un dossier
// était jusqu'ici saisi à la main, sans aucune aide du document.
// Ordre de priorité imposé par la spec : mention explicite > règle métier géographique > rien.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const EN_TETE = 'COMPROMIS DE VENTE. Le bien est sis à 12 rue Victor Hugo, 41000 BLOIS.\n';

function acte(lignes) {
  return EN_TETE + lignes.join('\n');
}

test('detecterNotaires relève le nom, l’étude et le département déduit du code postal', () => {
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Sophie GOSSART, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire du vendeur."
  ]), 'COMPROMIS_DE_VENTE');
  assert.equal(notaires.length, 1);
  assert.equal(notaires[0].nom, 'Sophie GOSSART');
  assert.equal(notaires[0].office, 'Blois');
  assert.equal(notaires[0].codePostal, '41000');
  assert.equal(notaires[0].departement, '41');
  assert.equal(notaires[0].cote, 'vendeur');
});

test('le rattachement à une partie ne déborde pas sur le notaire voisin', () => {
  // Chaque notaire n'est rattaché qu'au « notaire du… » de SA phrase : sans cette borne, le
  // rattachement écrit en fin de ligne précédente était attribué au notaire suivant.
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Sophie GOSSART, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire du vendeur.",
    "Maître Paul DURAND, notaire à Orléans, 8 rue C, 45000 ORLÉANS, notaire de l'acquéreur."
  ]), 'COMPROMIS_DE_VENTE');
  assert.equal(notaires.find(n => n.nom === 'Sophie GOSSART').cote, 'vendeur');
  assert.equal(notaires.find(n => n.nom === 'Paul DURAND').cote, 'acquereur');
});

test('règle 41/45/37 : bien dans le 41 et notaire du vendeur dans le 45 → il reçoit l’acte', () => {
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Paul DURAND, notaire à Orléans, 8 rue C, 45000 ORLÉANS, notaire du vendeur.",
    "Maître Sophie GOSSART, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire de l'acquéreur."
  ]), 'COMPROMIS_DE_VENTE');
  const r = app.determinerNotaires(notaires, '41');
  assert.equal(r.instrumentaire.nom, 'Paul DURAND');
  assert.equal(r.statut, 'CONFIRMED');
  assert.ok(r.raison.includes('41'));
  // L'étude est alors le notaire participant.
  assert.equal(r.roleEtude, 'participant');
});

test('règle 41/45/37 : notaire du vendeur hors des trois départements → rien n’est tranché', () => {
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Paul DURAND, notaire à Paris, 8 rue C, 75008 PARIS, notaire du vendeur.",
    "Maître Sophie GOSSART, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire de l'acquéreur."
  ]), 'COMPROMIS_DE_VENTE');
  const r = app.determinerNotaires(notaires, '41');
  assert.equal(r.instrumentaire, null);
  assert.equal(r.statut, 'NEEDS_REVIEW');
  assert.equal(r.roleEtude, null);
});

test('une mention explicite l’emporte sur la règle géographique', () => {
  // « qui recevra l'acte » sur le notaire de l'acquéreur : la règle 41/45/37 aurait désigné celui
  // du vendeur, mais le document est explicite et prime (niveau 1 de la spec).
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Sophie GOSSART, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire du vendeur.",
    "Maître Paul DURAND, notaire à Orléans, 8 rue C, 45000 ORLÉANS, notaire de l'acquéreur, qui recevra l'acte."
  ]), 'COMPROMIS_DE_VENTE');
  const r = app.determinerNotaires(notaires, '41');
  assert.equal(r.instrumentaire.nom, 'Paul DURAND');
  assert.equal(r.participant.nom, 'Sophie GOSSART');
  assert.equal(r.roleEtude, 'participant');
});

test('deux notaires désignés pour recevoir l’acte → NEEDS_REVIEW, sans choix arbitraire', () => {
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Sophie GOSSART, notaire à Blois, 41000 BLOIS, qui recevra l'acte.",
    "Maître Paul DURAND, notaire à Orléans, 45000 ORLÉANS, qui recevra l'acte."
  ]), 'COMPROMIS_DE_VENTE');
  const r = app.determinerNotaires(notaires, '41');
  assert.equal(r.instrumentaire, null);
  assert.equal(r.statut, 'NEEDS_REVIEW');
  assert.ok(r.raison.toLowerCase().includes('plusieurs'));
});

test('l’étude est reconnue sous ses deux graphies (GOSSART et GOSSARD)', () => {
  const app = chargerApplication();
  for (const graphie of ['GOSSART', 'GOSSARD']) {
    const notaires = app.detecterNotaires(acte([
      `Maître Sophie ${graphie}, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire du vendeur.`
    ]), 'COMPROMIS_DE_VENTE');
    assert.equal(app.determinerNotaires(notaires, '41').roleEtude, 'instrumentaire', graphie);
  }
});

test('un acte où l’étude n’apparaît pas ne pré-remplit aucun rôle', () => {
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Paul DURAND, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire du vendeur."
  ]), 'COMPROMIS_DE_VENTE');
  const r = app.determinerNotaires(notaires, '41');
  assert.equal(r.instrumentaire.nom, 'Paul DURAND');
  assert.equal(r.roleEtude, null);
});

test('sans notaire identifié, aucun rôle n’est inventé', () => {
  const app = chargerApplication();
  const r = app.determinerNotaires([], '41');
  assert.equal(r.statut, 'NOT_FOUND');
  assert.equal(r.instrumentaire, null);
  assert.equal(r.roleEtude, null);
});

test('la règle métier est déclarée à un seul endroit, modifiable sans toucher au code', () => {
  const app = chargerApplication();
  const regles = app.REGLES_NOTAIRE_INSTRUMENTAIRE;
  assert.equal(regles.length, 1);
  assert.equal(regles[0].departementBien, '41');
  assert.equal(regles[0].departementsNotaireVendeur.join(','), '41,45,37');
});

test('sur une promesse, l’ordre en tête de première page désigne instrumentaire puis participant', () => {
  // Convention de rédaction indiquée par l'étude. Dernier recours seulement : ni mention explicite
  // ni règle géographique applicable ici (aucune adresse de notaire, donc aucun département).
  const app = chargerApplication();
  const texte = `PROMESSE DE VENTE
Reçue par Maître Sophie GOSSART, notaire à BLOIS,
avec Maître Paul DURAND, notaire à ORLEANS.

Entre les soussignés, il a été convenu ce qui suit.`;
  const notaires = app.detecterNotaires(texte, 'PROMESSE_DE_VENTE');
  assert.equal(notaires.length, 2);
  assert.equal(notaires.every(n => n.enTete), true);
  const r = app.determinerNotaires(notaires, null, 'PROMESSE_DE_VENTE');
  assert.equal(r.instrumentaire.nom, 'Sophie GOSSART');
  assert.equal(r.participant.nom, 'Paul DURAND');
  assert.equal(r.statut, 'CONFIRMED');
  assert.match(r.raison, /tête de la première page/);
});

test('l’ordre en tête ne s’applique pas à un notaire cité loin dans le corps de l’acte', () => {
  const app = chargerApplication();
  // Texte volontairement neutre pour le second notaire : on teste ici la BORNE de l'en-tête, pas
  // la reconnaissance d'une mention explicite (qui, elle, primerait — voir le test suivant).
  const texte = 'PROMESSE DE VENTE\nMaître Sophie GOSSART, notaire à BLOIS.\n'
    + 'x '.repeat(app.ZONE_ENTETE_ACTE)
    + '\nLe bien jouxte celui de Maître Paul DURAND, notaire à ORLEANS.';
  const notaires = app.detecterNotaires(texte, 'PROMESSE_DE_VENTE');
  assert.equal(notaires.filter(n => n.enTete).length, 1, 'un seul notaire est dans l’en-tête');
  const r = app.determinerNotaires(notaires, null, 'PROMESSE_DE_VENTE');
  // Un seul notaire en tête : l'ordre ne dit rien, on ne tranche pas plutôt que de deviner.
  assert.equal(r.statut, 'NEEDS_REVIEW');
});

test('une mention explicite garde la priorité sur l’ordre en tête', () => {
  const app = chargerApplication();
  const texte = `PROMESSE DE VENTE
Maître Paul DURAND, notaire à ORLEANS, et Maître Sophie GOSSART, notaire à BLOIS.
L'acte authentique sera reçu par Maître Sophie GOSSART, notaire à BLOIS.`;
  const r = app.determinerNotaires(app.detecterNotaires(texte, 'PROMESSE_DE_VENTE'), null, 'PROMESSE_DE_VENTE');
  assert.equal(r.instrumentaire.nom, 'Sophie GOSSART');
  assert.match(r.raison, /explicitement/);
});
