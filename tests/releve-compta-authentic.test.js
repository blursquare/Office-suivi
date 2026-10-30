'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

test('relevé de compte client lu dans la comptabilité d’Authentic (étude 30/10) : acomptes sur prix et sur frais, reversements', () => {
  const app = chargerApplication();
  const c = { operations: [
    { date: '2026-08-01', libelle: 'ACOMPTE SUR PRIX DUPONT', debit: 0, credit: 12000 },
    { date: '2026-08-05', libelle: 'PROVISION SUR FRAIS DUPONT', debit: 0, credit: 1234.5 },
    { date: '2026-09-01', libelle: 'VIREMENT A AGENCE EXEMPLE ACOMPTE', debit: 3000, credit: 0 },
    { date: '2026-09-02', libelle: 'sans montant', debit: 0, credit: 0 }
  ] };
  const a = app.analyseReleveDepuisComptabilite(c);
  assert.equal(a.ecritures.length, 3, 'une écriture sans montant est écartée');
  assert.equal(a.recu.prix, 12000);
  assert.equal(a.recu.frais, 1234.5);
  assert.equal(a.reverse.prix, 3000);
  assert.equal(a.ambigues, 0, 'les deux colonnes sont écrites : aucune colonne devinée');
  assert.equal(app.analyseReleveDepuisComptabilite(null).ecritures.length, 0);
});
