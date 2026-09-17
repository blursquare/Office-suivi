'use strict';

// Type d'acte et qualités des parties (voir la section « EXTRACTION STRUCTURÉE : type d'acte et
// qualités des parties » dans script.js). Le point central : la même qualité ne désigne pas la même
// partie d'un acte à l'autre — dans une promesse d'ACHAT, le promettant est l'ACQUÉREUR. Jusqu'à
// cette refonte, « promettant » était traité comme un simple synonyme de « vendeur », ce qui
// intervertissait silencieusement les deux parties sur ce type d'acte.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const COMPROMIS = `COMPROMIS DE VENTE
Entre les soussignés :
LE VENDEUR : Monsieur Jean DUPONT né le 12 mars 1960 à Blois, demeurant 3 rue des Lilas à Blois.
Ci-après dénommé le vendeur.
L'ACQUÉREUR : Monsieur Pierre MARTIN né le 5 juillet 1985 à Tours, demeurant 8 rue Neuve à Tours.
Ci-après dénommé l'acquéreur.
Le présent compromis de vente porte sur le bien ci-après désigné.`;

const PROMESSE_VENTE = `PROMESSE UNILATÉRALE DE VENTE
Monsieur Jean DUPONT né le 12 mars 1960 à Blois, ci-après dénommé LE PROMETTANT.
Monsieur Pierre MARTIN né le 5 juillet 1985 à Tours, ci-après dénommé LE BÉNÉFICIAIRE.
La présente promesse de vente est consentie pour une durée de trois mois.`;

const PROMESSE_ACHAT = `PROMESSE UNILATÉRALE D'ACHAT
Monsieur Pierre MARTIN né le 5 juillet 1985 à Tours, ci-après dénommé LE PROMETTANT.
Monsieur Jean DUPONT né le 12 mars 1960 à Blois, ci-après dénommé LE BÉNÉFICIAIRE.
La présente promesse d'achat engage le promettant à acquérir le bien désigné.`;

test('detecterTypeActe reconnaît un compromis de vente', () => {
  const app = chargerApplication();
  const t = app.detecterTypeActe(COMPROMIS);
  assert.equal(t.valeur, 'COMPROMIS_DE_VENTE');
  assert.equal(t.statut, 'CONFIRMED');
  assert.ok(t.source && t.source.extrait.length > 0);
});

test('detecterTypeActe distingue une promesse de vente d’une promesse d’achat', () => {
  const app = chargerApplication();
  assert.equal(app.detecterTypeActe(PROMESSE_VENTE).valeur, 'PROMESSE_DE_VENTE');
  assert.equal(app.detecterTypeActe(PROMESSE_ACHAT).valeur, 'PROMESSE_D_ACHAT');
});

test('detecterTypeActe reste INCONNU plutôt que de deviner sur un texte sans mention', () => {
  const app = chargerApplication();
  const t = app.detecterTypeActe('Le bien est situé 12 rue Victor Hugo à Blois.');
  assert.equal(t.valeur, 'INCONNU');
  assert.equal(t.statut, 'NOT_FOUND');
});

test('roleDepuisQualite inverse promettant et bénéficiaire pour une promesse d’achat', () => {
  const app = chargerApplication();
  assert.equal(app.roleDepuisQualite('PROMESSE_DE_VENTE', 'promettant'), 'VENDEUR');
  assert.equal(app.roleDepuisQualite('PROMESSE_DE_VENTE', 'beneficiaire'), 'ACQUEREUR');
  assert.equal(app.roleDepuisQualite('PROMESSE_D_ACHAT', 'promettant'), 'ACQUEREUR');
  assert.equal(app.roleDepuisQualite('PROMESSE_D_ACHAT', 'beneficiaire'), 'VENDEUR');
  // Sans type d'acte établi, on conserve la convention historique de l'outil.
  assert.equal(app.roleDepuisQualite('INCONNU', 'promettant'), 'VENDEUR');
});

test('detecterParties attribue les rôles selon le type d’acte, promesse d’achat comprise', () => {
  const app = chargerApplication();
  const parties = app.detecterParties(PROMESSE_ACHAT, 'PROMESSE_D_ACHAT');
  const promettant = parties.find(p => p.qualiteActe === 'promettant');
  const beneficiaire = parties.find(p => p.qualiteActe === 'beneficiaire');
  assert.equal(promettant.nom, 'MARTIN');
  assert.equal(promettant.role, 'ACQUEREUR');
  assert.equal(beneficiaire.nom, 'DUPONT');
  assert.equal(beneficiaire.role, 'VENDEUR');
});

test('detecterNomDossier garde le format VENDEUR / ACQUÉREUR sur les trois types d’acte', () => {
  // Le vendeur est DUPONT et l'acquéreur MARTIN dans les trois textes, quelle que soit la qualité
  // sous laquelle chacun est présenté : le nom du dossier doit être identique.
  const app = chargerApplication();
  assert.equal(app.detecterNomDossier(COMPROMIS), 'DUPONT / MARTIN');
  assert.equal(app.detecterNomDossier(PROMESSE_VENTE), 'DUPONT / MARTIN');
  assert.equal(app.detecterNomDossier(PROMESSE_ACHAT), 'DUPONT / MARTIN');
});

test('detecterNomDossier n’est plus trompé par l’apostrophe de « L’ACQUÉREUR »', () => {
  // Régression signalée par l'étude (« les noms de dossier ne vont pas » sur certains compromis) :
  // l'apostrophe d'élision passait pour un guillemet ouvrant, le nom était donc cherché EN ARRIÈRE
  // et c'est celui du vendeur, présenté juste au-dessus, qui remontait des deux côtés.
  const app = chargerApplication();
  const nom = app.detecterNomDossier(COMPROMIS);
  assert.notEqual(nom, 'DUPONT / DUPONT');
  assert.equal(nom, 'DUPONT / MARTIN');
});

test('detecterParties conserve plusieurs vendeurs', () => {
  const app = chargerApplication();
  const texte = `COMPROMIS DE VENTE
LE VENDEUR : Monsieur Jean DUPONT né le 12 mars 1960 à Blois et Madame Claire LEROY née le 3 avril 1962 à Tours.
Ci-après dénommés les vendeurs.
L'ACQUÉREUR : Monsieur Pierre MARTIN né le 5 juillet 1985 à Tours.
Ci-après dénommé l'acquéreur.`;
  const vendeurs = app.detecterParties(texte, 'COMPROMIS_DE_VENTE').filter(p => p.role === 'VENDEUR');
  // Comparaison sur une chaîne : les tableaux viennent du contexte vm du harnais de test, leur
  // prototype n'est pas celui du realm de Node et deepEqual les refuse (voir load-app.js).
  assert.equal(vendeurs.map(p => p.nom).join(' & '), 'DUPONT & LEROY');
  assert.equal(app.detecterNomDossier(texte), 'DUPONT & LEROY / MARTIN');
});

test('detecterParties reconnaît une personne morale et son représentant', () => {
  const app = chargerApplication();
  const texte = `COMPROMIS DE VENTE
LE VENDEUR : la SCI LES TILLEULS, au capital de 1000 euros, représentée par Monsieur Jean DUPONT, en qualité de gérant.
Ci-après dénommée le vendeur.
L'ACQUÉREUR : Monsieur Pierre MARTIN né le 5 juillet 1985 à Tours.
Ci-après dénommé l'acquéreur.`;
  const vendeur = app.detecterParties(texte, 'COMPROMIS_DE_VENTE').find(p => p.role === 'VENDEUR');
  assert.equal(vendeur.qualitePersonne, 'morale');
  assert.equal(vendeur.nom, 'SCI LES TILLEULS');
  assert.equal(vendeur.representant, 'Jean DUPONT');
});

test('detecterEmailAcquereur suit le rôle et non le mot « bénéficiaire »', () => {
  // Sur une promesse d'achat, le bénéficiaire est le VENDEUR : s'ancrer sur ce mot remplirait le
  // champ « email de l'acquéreur » avec l'adresse du vendeur, et adresserait les relances de prêt
  // à la mauvaise partie.
  const app = chargerApplication();
  const texte = `PROMESSE UNILATÉRALE D'ACHAT
Monsieur Pierre MARTIN, joignable à pierre.martin@exemple.fr, ci-après dénommé LE PROMETTANT.
Monsieur Jean DUPONT, joignable à jean.dupont@exemple.fr, ci-après dénommé LE BÉNÉFICIAIRE.
La présente promesse d'achat engage le promettant.`;
  assert.equal(app.detecterEmailAcquereur(texte, 'PROMESSE_D_ACHAT'), 'pierre.martin@exemple.fr');
});
