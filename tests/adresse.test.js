'use strict';

// Adresse du bien découpée en composants (voir parserAdresse dans script.js, section « EXTRACTION
// STRUCTURÉE : adresse »). L'enjeu, demandé explicitement par l'étude : l'ordre des éléments varie
// d'une trame de rédaction à l'autre, et le département qui en est déduit sert ensuite à
// déterminer le notaire instrumentaire — une erreur ici se propage.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('parserAdresse découpe une adresse classique numéro / voie / code postal / commune', () => {
  const app = chargerApplication();
  const a = app.parserAdresse('12 rue Victor Hugo, 41000 BLOIS');
  assert.equal(a.numero, '12');
  assert.equal(a.typeVoie, 'rue');
  assert.equal(a.nomVoie, 'Victor Hugo');
  assert.equal(a.codePostal, '41000');
  assert.equal(a.commune, 'BLOIS');
  assert.equal(a.departement, '41');
  assert.equal(a.statut, 'CONFIRMED');
});

test('parserAdresse reconnaît la même adresse avec le code postal placé en tête', () => {
  const app = chargerApplication();
  const a = app.parserAdresse('41000 BLOIS, 12 rue Victor Hugo');
  assert.equal(a.numero, '12');
  assert.equal(a.typeVoie, 'rue');
  assert.equal(a.nomVoie, 'Victor Hugo');
  assert.equal(a.commune, 'BLOIS');
  assert.equal(a.codePostal, '41000');
});

test('parserAdresse accepte la virgule après le numéro et le tiret avant le code postal', () => {
  const app = chargerApplication();
  const a = app.parserAdresse('12, rue Victor Hugo - 41000 Blois');
  assert.equal(a.numero, '12');
  assert.equal(a.nomVoie, 'Victor Hugo');
  assert.equal(a.commune, 'Blois');
});

test('parserAdresse garde un lieu-dit comme lieu-dit, sans le transformer en voie', () => {
  // Cas fréquent sur les biens ruraux du secteur de l'étude : forcer un lieu-dit dans nomVoie
  // produirait une adresse fausse (spec explicite).
  const app = chargerApplication();
  const a = app.parserAdresse('Lieu-dit La Grande Maison, 41100 VENDÔME');
  assert.equal(a.lieuDit, 'La Grande Maison');
  assert.equal(a.nomVoie, null);
  assert.equal(a.typeVoie, null);
  assert.equal(a.numero, null);
  assert.equal(a.commune, 'VENDÔME');
  assert.equal(a.statut, 'CONFIRMED');
});

test('parserAdresse reconnaît un lieu-dit placé après le code postal', () => {
  const app = chargerApplication();
  const a = app.parserAdresse('41200 Romorantin-Lanthenay, lieu-dit Les Grandes Vignes');
  assert.equal(a.lieuDit, 'Les Grandes Vignes');
  assert.equal(a.commune, 'Romorantin-Lanthenay');
  assert.equal(a.departement, '41');
});

test('parserAdresse accepte une adresse sans numéro', () => {
  const app = chargerApplication();
  const a = app.parserAdresse('Route de Tours, 41100 Vendôme');
  assert.equal(a.numero, null);
  assert.equal(a.typeVoie, 'route');
  assert.equal(a.nomVoie, 'de Tours');
  assert.equal(a.statut, 'CONFIRMED');
});

test('parserAdresse retrouve un numéro rejeté en fin de fragment (n°12)', () => {
  const app = chargerApplication();
  const a = app.parserAdresse('41100 VENDÔME – rue Victor Hugo n°12');
  assert.equal(a.numero, '12');
  assert.equal(a.typeVoie, 'rue');
  assert.equal(a.nomVoie, 'Victor Hugo');
  assert.equal(a.commune, 'VENDÔME');
});

test('parserAdresse ne tronque pas un numéro complexe (bis, ter, lettre, intervalle)', () => {
  const app = chargerApplication();
  assert.equal(app.parserAdresse('12 bis avenue de la Gare, 41000 Blois').numero, '12 bis');
  assert.equal(app.parserAdresse('12 ter rue des Écoles, 41000 Blois').numero, '12 ter');
  assert.equal(app.parserAdresse('12 A boulevard Daniel Dupuis, 41000 Blois').numero, '12 A');
  assert.equal(app.parserAdresse('12-14 rue des Écoles, 45000 Orléans').numero, '12-14');
  assert.equal(app.parserAdresse('12/14 rue des Écoles, 45000 Orléans').numero, '12/14');
});

test('parserAdresse reconnaît les abréviations de type de voie et les ramène à leur forme canonique', () => {
  const app = chargerApplication();
  assert.equal(app.parserAdresse('3 av. de la République, 41000 Blois').typeVoie, 'avenue');
  assert.equal(app.parserAdresse('5 bd Vauban, 41000 Blois').typeVoie, 'boulevard');
  assert.equal(app.parserAdresse('7 rte de Chambord, 41250 Bracieux').typeVoie, 'route');
  assert.equal(app.parserAdresse('9 imp. des Lilas, 41000 Blois').typeVoie, 'impasse');
  assert.equal(app.parserAdresse('2 chem. des Vignes, 41000 Blois').typeVoie, 'chemin');
});

test('parserAdresse conserve toujours l’adresse d’origine telle quelle', () => {
  const app = chargerApplication();
  const brut = '12, rue Victor Hugo - 41000 Blois';
  assert.equal(app.parserAdresse(brut).adresseComplete, brut);
});

test('parserAdresse signale une adresse inexploitable plutôt que d’inventer', () => {
  const app = chargerApplication();
  assert.equal(app.parserAdresse('').statut, 'NOT_FOUND');
  // Sans code postal, on ne peut ni situer la commune ni déduire le département.
  assert.equal(app.parserAdresse('rue Victor Hugo').statut, 'NEEDS_REVIEW');
});

test('departementDepuisCodePostal déduit le département, Corse et outre-mer compris', () => {
  const app = chargerApplication();
  assert.equal(app.departementDepuisCodePostal('41000'), '41');
  assert.equal(app.departementDepuisCodePostal('45000'), '45');
  assert.equal(app.departementDepuisCodePostal('37000'), '37');
  // Corse-du-Sud / Haute-Corse partagent le 20.
  assert.equal(app.departementDepuisCodePostal('20000'), '2A');
  assert.equal(app.departementDepuisCodePostal('20200'), '2B');
  // Outre-mer : département sur trois chiffres.
  assert.equal(app.departementDepuisCodePostal('97400'), '974');
  assert.equal(app.departementDepuisCodePostal('7500'), null);
  assert.equal(app.departementDepuisCodePostal('abcde'), null);
});

test('l’adresse n’est plus tronquée par la coupure de ligne du PDF', () => {
  // Cas réel : « situé à ORLEANS (LOIRET)  45000 11 Rue \nd'Escures. » — la capture s'arrêtait au
  // retour à la ligne et rendait « … 11 Rue », sans le nom de la voie.
  const app = chargerApplication();
  const texte = 'IDENTIFICATION DU BIEN\nDESIGNATION\nDans un ensemble immobilier situé à ORLEANS (LOIRET)  45000 11 Rue \nd’Escures.';
  assert.equal(app.detecterAdresseBien(texte), 'ORLEANS (LOIRET) 45000 11 Rue d’Escures');
});
