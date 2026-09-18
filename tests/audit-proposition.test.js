'use strict';

// Outil 2 (Audit des actes) — proposition du dossier Outil 1 correspondant au projet d'acte
// (script.js, proposerDossiersDepuisParties) : les patronymes des parties lues dans le projet
// désignent les dossiers déjà suivis qui les partagent. Une PROPOSITION, à confirmer d'un clic —
// jamais une liaison automatique (choix explicite de l'étude).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const parties = [
  { nom: 'DUPONT', role: 'VENDEUR' },
  { nom: 'MARTIN', role: 'ACQUEREUR' }
];

test('proposerDossiersDepuisParties : seul le dossier qui partage un patronyme est proposé', () => {
  const app = chargerApplication();
  const dossiers = [
    { id: 'a', nom: 'DUPONT / MARTIN' },
    { id: 'b', nom: 'DURAND / PETIT' }
  ];
  const proposes = app.proposerDossiersDepuisParties(parties, dossiers);
  assert.equal(proposes.map(d => d.id).join(','), 'a');
});

test('proposerDossiersDepuisParties : le dossier qui partage les deux noms passe avant celui qui n’en partage qu’un', () => {
  const app = chargerApplication();
  const dossiers = [
    { id: 'un', nom: 'MARTIN / LEROY' },
    { id: 'deux', nom: 'DUPONT / MARTIN' }
  ];
  assert.equal(app.proposerDossiersDepuisParties(parties, dossiers).map(d => d.id).join(','), 'deux,un');
});

test('proposerDossiersDepuisParties : un dossier archivé n’est jamais proposé', () => {
  const app = chargerApplication();
  const dossiers = [{ id: 'a', nom: 'DUPONT / MARTIN', archive: true }];
  assert.equal(app.proposerDossiersDepuisParties(parties, dossiers).length, 0);
});

test('proposerDossiersDepuisParties : civilités et qualités ne suffisent pas à rapprocher', () => {
  const app = chargerApplication();
  const dossiers = [{ id: 'a', nom: 'Madame VEUVE ROUSSEAU / Monsieur BLANC' }];
  const partiesCiviles = [{ nom: 'Madame épouse GARNIER' }, { nom: 'Monsieur SOCIETE' }];
  assert.equal(app.proposerDossiersDepuisParties(partiesCiviles, dossiers).length, 0);
});

test('proposerDossiersDepuisParties : les parties enregistrées sur le dossier comptent aussi, pas seulement son nom', () => {
  const app = chargerApplication();
  const dossiers = [{ id: 'num', nom: '2024-118', parties: [{ nom: 'DUPONT' }, { nom: 'MARTIN' }] }];
  assert.equal(app.proposerDossiersDepuisParties(parties, dossiers).map(d => d.id).join(','), 'num');
});

test('proposerDossiersDepuisParties : sans partie lue, aucune proposition', () => {
  const app = chargerApplication();
  assert.equal(app.proposerDossiersDepuisParties([], [{ id: 'a', nom: 'DUPONT / MARTIN' }]).length, 0);
  assert.equal(app.proposerDossiersDepuisParties(null, [{ id: 'a', nom: 'DUPONT / MARTIN' }]).length, 0);
});
