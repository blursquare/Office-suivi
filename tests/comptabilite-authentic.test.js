'use strict';
// Comptabilité d'un dossier lue dans Authentic (étude 28/10, structure reçue pour une succession et une vente). Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const AT = require('../commun/authentic-modele');

test('montants d’Authentic : virgule ou point décimal, milliers, signe', () => {
  assert.equal(AT.montantAT('1 234,56 €'), 1234.56);
  assert.equal(AT.montantAT('1234.56'), 1234.56);
  assert.equal(AT.montantAT('-999.9'), -999.9);
  assert.equal(AT.montantAT('12.345,00'), 12345);
  assert.equal(AT.montantAT('Solde'), null);
  assert.equal(AT.montantAT('−12,50'), -12.5);
  assert.equal(AT.montantAT('28/10/2026'), null);
});

test('infos comptables : soldes, taxe, dernières opérations et totaux', () => {
  const capture = {
    texte: ['Comptabilité', 'Compte principal', 'Solde du compte :', '12 500,00 €', 'Solde de l\'affaire :', '-350,40 €', 'Taxe TVA9 - Montant 70,08 €', 'Dernières opérations de l\'affaire'].join('\n'),
    tableaux: [{ titre: 'Dernières opérations de l\'affaire', entete: ['Date', 'N° écriture', 'Libellé', 'Débit', 'Crédit', 'Solde'],
      lignes: [['02/10/2026', '1201', 'VIR BANQUE EXEMPLE', '0.0', '12500.00', '12500.00'], ['05/10/2026', '1250', 'Frais divers', '350.40', '0.0', '12149.60'], ['', '', 'Aucun', '', '', '']] }]
  };
  const c = AT.comptabiliteDepuisCaptureAT(capture, '2026-10-28T10:00:00Z');
  assert.equal(c.soldeCompte, 12500);
  assert.equal(c.soldeAffaire, -350.4);
  assert.equal(c.taxes[0].montant, 70.08);
  assert.equal(c.operations.length, 2);
  assert.equal(c.operations[0].date, '2026-10-02');
  assert.equal(c.totalCreditListe, 12500);
  assert.equal(c.totalDebitListe, 350.4);
  assert.equal(c.nombreComptes, 1);
  assert.equal(AT.comptabiliteDepuisCaptureAT(null, '').operations.length, 0);
});

test('garde : l’onglet « Comptabilité » est un geste de navigation ; « Générer en PDF », « Ajouter un compte » ne le sont pas', () => {
  const { controlerClic } = require('../server/src/authentic/garde');
  assert.doesNotThrow(() => controlerClic({ geste: 'navigation', vise: 'Comptabilité', bouton: 'Comptabilité', texte: 'Comptabilité' }));
  assert.throws(() => controlerClic({ geste: 'navigation', vise: 'Générer en PDF', bouton: 'Générer en PDF', texte: 'Générer en PDF' }));
  assert.throws(() => controlerClic({ geste: 'navigation', vise: 'Ajouter un compte', bouton: 'Ajouter un compte', texte: 'Ajouter un compte' }));
});

test('tableau défilant : en-tête et corps en deux tables', () => {
  const c = AT.comptabiliteDepuisCaptureAT({ texte: '', tableaux: [
    { titre: 'Dernières opérations de l\'affaire', entete: ['Date', 'N° écriture', 'Libellé', 'Débit', 'Crédit', 'Solde'], lignes: [] },
    { titre: 'Compte', entete: [], lignes: [['03/10/2026', '9', 'Frais', '10.00', '0.0', '-10.00']] }] }, '');
  assert.equal(c.operations.length, 1);
  assert.equal(c.operations[0].debit, 10);
  assert.equal(c.operations[0].solde, -10);
});
