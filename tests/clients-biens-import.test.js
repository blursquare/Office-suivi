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

test('import : export « Recherche de Personnes Physiques » lu par sa ligne d\'en-tête (structure reçue le 19/10)', () => {
  const lignes = [
    ['Recherche de Personnes Physiques - 41089', '', '', '', '', '', '', '', '', ''], [],
    ['3 résultats'], [],
    ['Nom', 'Naissance', 'Décès', 'Situation', 'Conjoint/Partenaire', 'Email', 'Téléphone', 'CP', 'Ville', 'Client'],
    ['M. ESSAI Paul', '12/3/1950', '0', 'Marié', 'Mme TEST Léa', 'p.essai@exemple.fr', '0600000001 / 02.54.00.00.00', '41000', 'BLOIS', 'Oui'],
    ['Mme TEST Léa', '0', 'Inconnue', 'Veuf', '', '', 'M:0600000002 Mme 0600000003', '41250', 'BRACIEUX', 'Oui'],
    ['Mlle MODELE Anne', '1/10/1990', '4/5/2020', 'Célibataire', '', '', '', '', '', 'Oui']
  ];
  const r = app.lectureExportImport(lignes);
  assert.equal(r.genre, 'personnes');
  assert.equal(r.donnees.length, 3);
  assert.equal(r.colonnes.join(), 'nomComplet,dateNaissance,deces,situation,conjoint,email,telephone,codePostal,ville,ignorer');
  const e = app.enregistrementsImport(r.donnees, r.colonnes, 'personnes');
  assert.equal([e[0].civilite, e[0].nom, e[0].prenom, e[0].dateNaissance].join('|'), 'M|ESSAI|Paul|1950-03-12');
  assert.equal(e[0].telephones.join(' ; '), '06 00 00 00 01 ; 02 54 00 00 00');
  assert.equal(e[0].situation + '|' + e[0].conjoint, 'Marié|Mme TEST Léa');
  assert.equal(e[0].domicile, '41000 BLOIS');
  assert.equal(e[0].deces, null, '« 0 » : pas de décès');
  assert.equal(e[1].dateNaissance, '');
  assert.equal(e[1].deces.lieu, 'date inconnue');
  assert.equal(e[1].telephones.length, 2);
  assert.equal(e[2].civilite, 'Mme');
  assert.equal(e[2].deces.date, '2020-05-04');
});

test('import : numéros bornés, fichier immeubles à en-tête partiel (relecture 19/10)', () => {
  assert.equal(app.numerosImport('0033 6 12 34 56 78').join(), '06 12 34 56 78');
  assert.equal(app.numerosImport('+33 (0)6 12 34 56 78').join(), '06 12 34 56 78');
  assert.equal(app.numerosImport('061234567890').length, 0, 'onze chiffres : rien');
  const lignes = [['Adresse', 'CP', 'Ville', 'Section'], ['3 rue Exemple', '41000', 'BLOIS', 'AB 12'], ['5 chemin Essai', '41250', 'BRACIEUX', 'ZN 4']];
  const r = app.lectureExportImport(lignes);
  assert.equal(r.genre, 'biens');
  assert.equal(r.colonnes.join(), 'adresse,codePostal,commune,cadastre');
  const e = app.enregistrementsImport(r.donnees, r.colonnes, 'biens');
  assert.equal(e[0].commune, 'BLOIS');
  assert.equal(e[1].parcelles[0].section + e[1].parcelles[0].numero, 'ZN4');
});
