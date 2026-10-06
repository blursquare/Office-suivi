'use strict';
// Surlignage de ce qui a été trouvé dans un PDF (étude 06/10 : « pas d'encadrement, juste un surlignage »).
// Items pdf.js inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const items = [
  { str: 'Le prix de vente est fixé à la somme de' },
  { str: 'DEUX CENT CINQUANTE MILLE EUROS (250 000,00 €) payable' },
  { str: 'comptant le jour de la signature.' }
];
const morceaux = (p) => p.map(x => items[x.item].str.slice(x.debut, x.fin)).join(' | ');

test('seuls les caractères trouvés sont surlignés, sur une ou plusieurs lignes', () => {
  assert.equal(morceaux(app.plagesSurlignagePdf(items, ['250 000'])), '250 000');
  assert.equal(morceaux(app.plagesSurlignagePdf(items, ['euros (250 000,00 €) payable comptant'])), 'EUROS (250 000,00 €) payable | comptant');
  // Accents, casse, espaces ignorés ; la première cible retrouvée l'emporte.
  assert.equal(morceaux(app.plagesSurlignagePdf(items, ['introuvable', 'FIXE  A LA SOMME'])), 'fixé à la somme');
  assert.equal(app.plagesSurlignagePdf(items, ['rien de tel']).length, 0);
});

test('un long passage coupé autrement dans la page est ancré sur son début', () => {
  const p = app.plagesSurlignagePdf(items, ['…Le prix de vente est fixé à la somme de DEUX CENT CINQUANTE MILLE EUROS…']);
  assert.equal(morceaux(p).startsWith('Le prix de vente est fixé à la somme de | DEUX CENT CINQUANTE MILLE EUROS'), true);
});

test('formes d’une date et cibles d’une donnée du panneau Vérifier', () => {
  assert.equal(app.formesDateSurlignage('2026-11-05').join(' ; '), '5 novembre 2026 ; 5 novembre 2026 ; 05/11/2026');
  assert.equal(app.formesDateSurlignage('2027-03-01')[0], '1er mars 2027');
  assert.equal(app.formesDateSurlignage('pas une date').length, 0);
  const prix = app.ciblesSurlignageRevision('prixVente', { valeur: 250000, source: { page: 2, trouve: '250 000', extrait: '…somme de 250 000 €…' } });
  assert.equal(prix.join(' ; '), '250 000 ; 250 000 ; 250.000 ; 250000 ; …somme de 250 000 €…');
  const date = app.ciblesSurlignageRevision('pret', { valeur: '2026-11-05', source: { page: 3, extrait: 'au plus tard le 5 novembre 2026' } });
  assert.equal(date[0], '5 novembre 2026');
});

test('une citation qui diffère par la ponctuation est retrouvée quand même', () => {
  assert.equal(morceaux(app.plagesSurlignagePdf(items, ['250 000,00 € payable comptant'])), '250 000,00 €) payable | comptant');
});
