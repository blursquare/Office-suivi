'use strict';

// Étude 18/10 : « Plus de filtres » du Suivi, filtres par domaine des vérifications de terrain.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('Suivi : le bouton « Plus de filtres » compte les filtres cachés qui agissent', () => {
  assert.equal(app.filtresCachesActifsSuivi({ offre: '', role: '', echeance: '', archives: false }), 0);
  assert.equal(app.filtresCachesActifsSuivi({ offre: 'recue', role: 'participant', echeance: 'pret', archives: true }), 4);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const ligne = html.slice(html.indexOf('suivi-barre-recherche'), html.indexOf('id="suivi-filtres-plus"'));
  assert.match(ligne, /id="filtre-responsable"/);
  assert.match(ligne, /id="filtre-affaire"/);
  assert.doesNotMatch(ligne, /id="filtre-offre"|id="filtre-role"|id="voir-archives"|id="filtre-type"/);
  // Étude 18/10 : les statuts (Urgent…) restent visibles, hors du panneau « Plus de filtres ».
  const panneau = html.slice(html.indexOf('id="suivi-filtres-plus"'), html.indexOf('id="suivi-statuts"'));
  assert.match(panneau, /id="filtre-type"/);
  assert.ok(html.indexOf('id="suivi-statuts"') > html.indexOf('id="suivi-filtres-plus"'));
});

test('Vérifications de terrain : chaque point a un domaine', () => {
  const d = (titre) => app.domaineVerificationTerrain({ titre, id: 'x' });
  assert.equal(d('Authentic : « Créer » proposé sur une page de vente'), 'authentic');
  assert.equal(d('Appel 3CX : l’onglet de 3CX se ferme'), '3cx');
  assert.equal(d('Email envoyé depuis CLAIRE par Exchange'), 'exchange');
  assert.equal(d('Noms de fichiers du NAS : dossier commun parcouru'), 'nas');
  assert.equal(d('Extension Chrome : DIA complétée'), 'extension');
  assert.equal(d('« Demander à CLAIRE » : une phrase comprise par Mistral'), 'ia');
  assert.equal(d('Un geste inconnu'), 'autres');
});

test('Vérifications de terrain : le NAS passe avant Exchange, « l’IA » est reconnue', () => {
  assert.equal(app.domaineVerificationTerrain({ titre: 'Pièce jointe d’un email rangée dans le dossier client du NAS', id: 'piece-jointe-nas' }), 'nas');
  assert.equal(app.domaineVerificationTerrain({ titre: 'Premier jet de réponse proposé par l’IA locale', id: 'x' }), 'ia');
});
