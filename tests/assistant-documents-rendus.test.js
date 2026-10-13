'use strict';

// « Demander à CLAIRE » : lire les documents du dossier et produire un document Word (étude 13/10, client/65).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('pages à lire : 30 au plus, bornées au document', () => {
  const p = (t, d, f) => { const r = app.pagesLectureAgent(t, d, f); return `${r.debut}-${r.fin}`; };
  assert.equal(p(12, 1, 0), '1-12');
  assert.equal(p(80, 1, 0), '1-30');
  assert.equal(p(80, 31, 0), '31-60');
  assert.equal(p(80, 70, 200), '70-80');
  assert.equal(p(80, 10, 12), '10-12');
  assert.equal(p(80, 0, 5), '1-5');
  assert.equal(p(5, 9, 0), '5-5');
  assert.equal(p(0, 1, 0), '0--1');
});

test('contenu de l’IA → blocs du document : titres, puces, numéros, tableaux, paragraphes', () => {
  const blocs = app.blocsDocumentAgent('# Synthèse\n\nLe prix est de **245 000 €**\net le prêt attendu.\n## Conditions\n- Prêt : 20/11\n1. Vérifier l’ERP\n| Pièce | État |\n|---|---|\n| ERP | reçue |\n| DPE | attendue |\n\nFin.');
  assert.equal(blocs.map(b => b.type).join(','), 'titre1,para,titre2,puce,numero,tableau,para');
  assert.equal(blocs[1].texte, 'Le prix est de **245 000 €** et le prêt attendu.');
  assert.equal(blocs[5].lignes.length, 3, 'la ligne de séparation est retirée');
  assert.equal(blocs[5].lignes[2].join('|'), 'DPE|attendue');
  const m = app.morceauxGrasAgent('Le prix est de **245 000 €** net');
  assert.equal(m.map(x => (x.gras ? '*' : '') + x.texte).join('/'), 'Le prix est de /*245 000 €/ net');
});

test('nom du fichier produit : sûr pour Windows', () => {
  assert.equal(app.nomFichierRenduAgent('Synthèse : compromis / FOURNIER?'), 'Synthèse compromis FOURNIER');
  assert.equal(app.nomFichierRenduAgent('  ...  '), 'Document CLAIRE');
});
