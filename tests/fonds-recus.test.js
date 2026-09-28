'use strict';
// Rapprochement des reçus comptables du jour avec l'acquéreur d'un dossier (voir renderFondsRecus).
// Textes inventés : aucun reçu réel n'a encore été fourni, ces tests fixent le comportement attendu
// sur les deux mises en page les plus probables (tableau, un reçu par page).
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');
const app = chargerApplication();

test('patronymes de l’acquéreur : parties du dossier, sinon partie droite du nom', () => {
  assert.equal(app.motsPayeurDossier({ parties: [{ nom: 'DUPONT', role: 'VENDEUR' }, { nom: 'MARTIN & LÉGER', role: 'ACQUEREUR' }] }).join(','), 'martin,leger');
  assert.equal(app.motsPayeurDossier({ nom: 'DUPONT / Époux BÉNARD' }).join(','), 'benard');
});

test('montants à deux décimales, séparateurs de milliers compris', () => {
  assert.equal(app.montantsDansLigne('Reçu n°12 — 1 234,56 € — solde 227 642,28 EUR').join('|'), '1234.56|227642.28');
  assert.equal(app.montantsDansLigne('le 28/09/2026 réf 45').length, 0);
});

test('tableau : une ligne par reçu, le dernier montant de la ligne est retenu', () => {
  const pages = [[
    'RECUS DU 25/09/2026',
    'N° 1204  VTE DUPONT / MARTIN  virement MARTIN Paul  145 300,00 €',
    'N° 1205  VTE ROBERT / DURAND  virement DURAND  98 000,00 €',
    'N° 1206  MARTIN Paul  provision  100,00 €'
  ]];
  const r = app.recusDuPayeurDansPages(pages, ['martin']);
  assert.equal(r.map(x => x.montant).join('|'), '145300|100');
});

test('un reçu par page : le nom sur une ligne, la somme sur une autre ; page ambiguë ignorée', () => {
  const pages = [
    ['REÇU', 'Reçu de Monsieur Paul MARTIN', 'la somme de : 12 500,00 €', 'Dossier VTE DUPONT / MARTIN'],
    ['REÇU', 'Reçu de Madame DURAND', 'la somme de : 3 000,00 €'],
    ['REÇU', 'MARTIN Paul', 'Débit 50,00', 'Crédit 60,00']
  ];
  const r = app.recusDuPayeurDansPages(pages, ['martin']);
  assert.equal(r.map(x => `${x.page}:${x.montant}`).join('|'), '1:12500');
});

test('montant attendu lu dans un décompte, et état de l’indicateur', () => {
  const texte = ['Prix de vente 200 000,00 €', 'Frais d’acte 15 000,00 €', 'Dépôt de garantie versé 10 000,00 €'].join('\n');
  const solde = app.soldeAttenduDepuisDecompte(texte);
  assert.ok(solde > 0);
  assert.equal(app.bilanFondsRecus(205000, 205000).etat, 'complet');
  assert.equal(app.bilanFondsRecus(204999.5, 205000).etat, 'complet');
  const p = app.bilanFondsRecus(100000, 205000);
  assert.equal(p.etat, 'partiel');
  assert.equal(p.reste, 105000);
  assert.equal(app.bilanFondsRecus(0, 205000).etat, 'aucun');
  assert.equal(app.bilanFondsRecus(500, null).etat, 'inconnu');
});

test('import d’une sauvegarde : le montant saisi reste, le rapprochement repart de zéro', () => {
  const d = app.normaliserDossierImporte({ id: 'x', nom: 'A / B', fondsAttendusManuel: 1234.5, fondsRecus: { total: 10 } });
  assert.equal(d.fondsAttendusManuel, 1234.5);
  assert.equal(d.fondsRecus, null);
});
