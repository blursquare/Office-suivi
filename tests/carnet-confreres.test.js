'use strict';

// Carnet des confrères (voir la section « CARNET DES CONFRÈRES » de script.js) : un notaire saisi
// sur une fiche est rapproché de son office par son nom de famille — jamais deviné quand deux
// offices restent possibles. Offices et notaires inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const CARNET = [
  { id: 'a', office: 'SELARL Paul DURAND', notaires: ['Paul DURAND', 'Claire MOREAU-LEBLANC'], ville: 'Orléans', codePostal: '45000', email: 'office.durand@notaires.fr', bureaux: [] },
  { id: 'b', office: 'SCP Anne DURAND et Luc PETIT', notaires: ['Anne DURAND', 'Luc PETIT'], ville: 'Vendôme', codePostal: '41100', email: '', bureaux: ['41160 Morée 3 rue du Pont'] },
  { id: 'c', office: 'Me Jean-Marc de VILLIERS', notaires: ['Jean-Marc de VILLIERS'], ville: 'Blois', codePostal: '41000', email: 'etude.devilliers@notaires.fr', bureaux: [] }
];

test('decomposerNomNotaire : nom de famille en capitales, prénom, ville entre parenthèses', () => {
  const app = chargerApplication();
  const n = app.decomposerNomNotaire('Maître Claire MOREAU-LEBLANC (ORLÉANS)');
  assert.equal(n.famille, 'moreau leblanc');
  assert.equal(n.prenom, 'claire');
  assert.equal(n.ville, 'orleans');
  assert.equal(app.decomposerNomNotaire('Me Jean-Marc de VILLIERS').prenom, 'jean marc');
  assert.equal(app.decomposerNomNotaire('Me Petit').famille, 'petit');
});

test('trouverOfficeConfrere : un seul office porte ce nom → retrouvé', () => {
  const app = chargerApplication();
  assert.equal(app.trouverOfficeConfrere('Maître Luc PETIT (VENDOME)', CARNET).office.id, 'b');
  assert.equal(app.trouverOfficeConfrere('Maître Claire MOREAU LEBLANC', CARNET).office.id, 'a');
  assert.equal(app.trouverOfficeConfrere('Maître Jean-Marc de VILLIERS (BLOIS)', CARNET).office.id, 'c');
});

test('trouverOfficeConfrere : deux DURAND → départagés par le prénom ou la ville, sinon rien', () => {
  const app = chargerApplication();
  assert.equal(app.trouverOfficeConfrere('Maître Paul DURAND', CARNET).office.id, 'a');
  assert.equal(app.trouverOfficeConfrere('Maître Anne DURAND (VENDOME)', CARNET).office.id, 'b');
  // Ville d'un bureau secondaire.
  assert.equal(app.trouverOfficeConfrere('Me DURAND (MOREE)', CARNET).office.id, 'b');
  assert.equal(app.trouverOfficeConfrere('Me DURAND', CARNET), null);
  assert.equal(app.trouverOfficeConfrere('Maître Sophie MARTIN', CARNET), null);
  assert.equal(app.trouverOfficeConfrere('', CARNET), null);
});

test('optionsNotairesCarnet et filtrerCarnet', () => {
  const app = chargerApplication();
  const options = app.optionsNotairesCarnet(CARNET);
  assert.ok(options.includes('Maître Luc PETIT (Vendôme)'));
  assert.equal(options.length, 5);
  assert.equal(app.filtrerCarnet(CARNET, 'vendome').map(o => o.id).join(), 'b');
  assert.equal(app.filtrerCarnet(CARNET, 'durand').map(o => o.id).join(), 'a,b');
  assert.equal(app.filtrerCarnet(CARNET, 'moree').map(o => o.id).join(), 'b');
  // Sans recherche : triés par ville.
  assert.equal(app.filtrerCarnet(CARNET, '').map(o => o.id).join(), 'c,a,b');
  // Notre office toujours en tête.
  const avecEtude = CARNET.concat([{ id: 'etude-gossart', etude: true, office: 'Office Notarial de la Salamandre — Me Sophie GOSSART', notaires: ['Sophie GOSSART'], ville: 'Blois', bureaux: [] }]);
  assert.equal(app.filtrerCarnet(avecEtude, '').map(o => o.id).join(), 'etude-gossart,c,a,b');
  assert.ok(app.optionsNotairesCarnet(avecEtude).includes('Maître Sophie GOSSART (Blois)'));
  assert.equal(app.estEtude({ nom: 'Maître Sophie GOSSART (Blois)' }), true);
});

test('emailDestinataireRelance : l’email de l’office du carnet à défaut d’adresse saisie', () => {
  const app = chargerApplication();
  app.carnetConfreres = CARNET;
  const d = { notaireVendeur: 'Maître Sophie GOSSART (BLOIS)', notaireAcquereur: 'Maître Paul DURAND (ORLEANS)', emailAcquereur: 'client@exemple.fr' };
  assert.equal(app.emailDestinataireRelance(d), 'office.durand@notaires.fr');
  d.emailNotaireParticipant = 'clerc.durand@notaires.fr';
  assert.equal(app.emailDestinataireRelance(d), 'clerc.durand@notaires.fr');
  const parts = app.dossiersParOfficeConfrere([d, { notaireVendeur: 'Maître Luc PETIT', archive: true }], CARNET);
  assert.equal(Object.keys(parts).join(), 'a');
});

test('completerNomNotaire : un notaire nommé par son seul prénom est complété par le carnet (prénom + ville)', () => {
  const app = chargerApplication();
  const carnet = [
    { id: 'etude', office: 'Office de la Rivière', notaires: ['Hélène MARCHAND'], ville: 'Blois', bureaux: [] },
    { id: 'a', office: 'SELARL DES COTEAUX', notaires: ['Alicia BRUNET', 'Ophélie LANGLOIS-VERDIER'], ville: 'Herbault', bureaux: [] },
    { id: 'b', office: 'SCP DU VAL', notaires: ['Hélène ROUSSEL'], ville: 'Vendôme', bureaux: ['Blois'] },
    { id: 'c', office: 'Office du Parc', notaires: ['Marc PETIT'], ville: 'Tours', bureaux: [] }
  ];
  assert.equal(app.completerNomNotaire('Maître OPHELIE (HERBAULT)', carnet), 'Maître Ophélie LANGLOIS-VERDIER (HERBAULT)');
  // Deux Hélène exercent à Blois (dont un bureau secondaire) : rien n'est deviné.
  assert.equal(app.completerNomNotaire('Maître HÉLÈNE (BLOIS)', carnet), 'Maître HÉLÈNE (BLOIS)');
  // Sans ville, ou nom déjà complet : inchangé.
  assert.equal(app.completerNomNotaire('Maître MARC', carnet), 'Maître MARC');
  assert.equal(app.completerNomNotaire('Maître Marc PETIT (TOURS)', carnet), 'Maître Marc PETIT (TOURS)');
  assert.equal(app.completerNomNotaire('', carnet), '');
  // L'office est alors retrouvé, ce qui retire « Ajouter au carnet » de la fiche.
  const t = app.trouverOfficeConfrere('Maître OPHELIE (HERBAULT)', carnet);
  assert.equal(t && t.office.id, 'a');
});

test('nettoyerLibelleNotaire : retire l’intitulé du champ suivant d’un compromis en formulaire', () => {
  const app = chargerApplication();
  assert.equal(app.nettoyerLibelleNotaire("Maître Jules VERNAY Adresse (CELLETTES Notaire de l'ACQUEREUR)"), 'Maître Jules VERNAY (CELLETTES)');
  assert.equal(app.nettoyerLibelleNotaire('Maître Hélène MARCHAND (Blois)'), 'Maître Hélène MARCHAND (Blois)');
  assert.equal(app.nettoyerLibelleNotaire('Maître Hélène MARCHAND'), 'Maître Hélène MARCHAND');
});
