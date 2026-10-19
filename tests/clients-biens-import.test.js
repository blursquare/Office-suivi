'use strict';
// Import du fichier clients et immeubles d'Authentic (étude 19/10) : colonnes devinées, enregistrements. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const personnes = [
  ['Recherche de Personnes Physiques - 41089', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', ''],
  ['M. Paul ESSAI', '06 00 00 00 01', '1234', 'Oui', '3 rue Exemple', 'p.essai@exemple.fr', '41000', '12', 'BLOIS', 'FRANCE'],
  ['Mme Léa TEST', '12/03/1970', '1235', 'Non', '5 chemin des Essais', '', '41250', '13', 'BRACIEUX', 'FRANCE'],
  ['M. Jean MODELE', '02 54 00 00 00', '1236', 'Oui', '7 place Modèle', 'j.modele@exemple.fr', '41000', '14', 'BLOIS', 'FRANCE']
];

test('import : genre, colonnes devinées et enregistrements des personnes', () => {
  assert.equal(app.genreImport(personnes), 'personnes');
  const donnees = app.lignesDonneesImport(personnes).filter(l => !/^recherche/i.test(l[0]));
  assert.equal(donnees.length, 3);
  const col = app.colonnesProposeesImport(donnees, 'personnes');
  assert.equal(col[0], 'nomComplet');
  assert.equal(col[1], 'auto', 'téléphone ou date selon la ligne');
  assert.equal(col[4], 'adresse');
  assert.equal(col[5], 'email');
  assert.equal(col[6], 'codePostal');
  assert.equal(col[8], 'ville');
  const r = app.enregistrementsImport(donnees, col, 'personnes');
  assert.equal(r[0].nom + '|' + r[0].prenom + '|' + r[0].civilite, 'ESSAI|Paul|M');
  assert.equal(r[0].telephones.join(), '06 00 00 00 01');
  assert.equal(r[1].dateNaissance, '1970-03-12');
  assert.equal(r[1].civilite, 'Mme');
  assert.equal(r[0].domicile, '3 rue Exemple 41000 BLOIS');
});

test('import : immeubles et parcelles', () => {
  const imm = [["Recherche d'immeubles - Office", '', '', ''], ['Maison', '3 rue Exemple 41000 BLOIS', 'AB 12, AB 13', 'BLOIS'], ['Terrain', '24 rue des Essais', '000 ZN 4', 'SAINT LUBIN EN VERGONNOIS']];
  assert.equal(app.genreImport(imm), 'biens');
  const donnees = app.lignesDonneesImport(imm).filter(l => !/^recherche/i.test(l[0]));
  const col = app.colonnesProposeesImport(donnees, 'biens');
  assert.equal(col.join(), 'type,adresse,cadastre,commune');
  const r = app.enregistrementsImport(donnees, col, 'biens');
  assert.equal(r[0].parcelles.map(p => p.section + p.numero).join(), 'AB12,AB13');
  assert.equal(r[0].codePostal, '41000');
  assert.equal(r[1].adresse, '24 rue des Essais SAINT LUBIN EN VERGONNOIS');
  assert.equal(r[1].parcelles[0].numero, '4');
});
