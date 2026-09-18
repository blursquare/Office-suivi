'use strict';

// Exploitation du journal des corrections d'extraction (voir script.js, statistiquesCorrectionsExtraction
// et renderQualiteExtraction) — demandé pour que l'étude puisse voir quels champs l'extraction
// automatique rate le plus souvent, plutôt que de laisser ce journal grossir sans être jamais
// consulté (voir diffCorrectionsExtraction/journaliserCorrectionsExtraction).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

function entree(champ, valeurExtraite, valeurCorrigee, date) {
  return { champ, valeurExtraite, valeurCorrigee, origine: 'regex', statutExtrait: 'NOT_FOUND', typeActe: 'COMPROMIS_DE_VENTE', extrait: null, date };
}

test('un journal vide ne produit aucune statistique', () => {
  // Un tableau venant du contexte vm n'est pas un Array du realm des tests : comparer les
  // longueurs plutôt qu'avec assert.deepEqual([], ...) (piège déjà documenté dans CLAUDE.md).
  const app = chargerApplication();
  assert.equal(app.statistiquesCorrectionsExtraction([]).length, 0);
  assert.equal(app.statistiquesCorrectionsExtraction(null).length, 0);
});

test('les champs sont triés du plus corrigé au moins corrigé', () => {
  const app = chargerApplication();
  const journal = [
    entree('adresseBien', null, '12 rue des Lilas', '2026-09-01'),
    entree('prixVente', null, 250000, '2026-09-02'),
    entree('adresseBien', null, '8 rue Neuve', '2026-09-03'),
    entree('adresseBien', null, '5 rue du Parc', '2026-09-04')
  ];
  const stats = app.statistiquesCorrectionsExtraction(journal);
  assert.equal(stats.length, 2);
  assert.equal(stats[0].champ, 'adresseBien');
  assert.equal(stats[0].nombre, 3);
  assert.equal(stats[1].champ, 'prixVente');
  assert.equal(stats[1].nombre, 1);
});

test('l’exemple retenu est la dernière entrée rencontrée, pas la première', () => {
  const app = chargerApplication();
  const journal = [
    entree('nom', 'AAA / BBB', 'CCC / DDD', '2026-09-01'),
    entree('nom', 'EEE / FFF', 'GGG / HHH', '2026-09-05')
  ];
  const stats = app.statistiquesCorrectionsExtraction(journal);
  assert.equal(stats[0].dernier.valeurCorrigee, 'GGG / HHH');
});

test('une entrée sans champ exploitable est ignorée plutôt que de faire planter l’agrégation', () => {
  const app = chargerApplication();
  const stats = app.statistiquesCorrectionsExtraction([null, {}, entree('pret', null, '2026-11-15')]);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].champ, 'pret');
});
