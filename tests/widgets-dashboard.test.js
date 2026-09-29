'use strict';

// Widgets du tableau de bord (voir dispositionWidgetsDepuis & co dans script.js) : la disposition
// enregistrée par collaborateur doit toujours redonner une grille complète et valide, même abîmée,
// ancienne (widget ajouté depuis) ou vide.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const ids = (dispo) => dispo.map(w => w.id).join(',');

test('sans préférence : tous les widgets, dans l’ordre et aux tailles par défaut', () => {
  const d = app.dispositionWidgetsDepuis(null);
  assert.equal(ids(d), 'aujourdhui,agenda,avancement,portefeuille,activite,pieces');
  assert.equal(d.map(w => w.taille).join(','), 'moyen,petit,moyen,petit,moyen,petit');
  assert.ok(d.every(w => w.masque === false));
});

test('préférence partielle ou abîmée : ordre gardé, taille ramenée à une taille permise, manquants ajoutés à la fin', () => {
  const d = app.dispositionWidgetsDepuis([
    { id: 'agenda', taille: 'grand' },          // l'agenda n'a pas de grande taille
    { id: 'inconnu', taille: 'petit' },
    { id: 'avancement', taille: 'grand', masque: true },
    { id: 'agenda', taille: 'petit' }             // doublon ignoré
  ]);
  assert.equal(ids(d), 'agenda,avancement,aujourdhui,portefeuille,activite,pieces');
  assert.equal(d[0].taille, 'petit');
  assert.equal(d[1].taille, 'grand');
  assert.equal(d[1].masque, true);
});

test('déplacer : à une position donnée, bornée', () => {
  const d = app.dispositionWidgetsDepuis(null);
  assert.equal(ids(app.deplacerWidgetDans(d, 'pieces', 0)), 'pieces,aujourdhui,agenda,avancement,portefeuille,activite');
  assert.equal(ids(app.deplacerWidgetDans(d, 'aujourdhui', 99)), 'agenda,avancement,portefeuille,activite,pieces,aujourdhui');
  assert.equal(ids(app.deplacerWidgetDans(d, 'inconnu', 0)), ids(d));
});

test('flèches : un pas parmi les widgets visibles, les masqués sont sautés', () => {
  let d = app.dispositionWidgetsDepuis(null);
  d = d.map(w => w.id === 'agenda' ? Object.assign({}, w, { masque: true }) : w);
  // avancement recule d'un cran « visible » : il passe devant aujourdhui (agenda masqué est sauté).
  assert.equal(ids(app.decalerWidgetDans(d, 'avancement', -1)), 'avancement,aujourdhui,agenda,portefeuille,activite,pieces');
  assert.equal(ids(app.decalerWidgetDans(d, 'aujourdhui', -1)), ids(d), 'déjà premier');
  assert.equal(ids(app.decalerWidgetDans(d, 'pieces', 1)), ids(d), 'déjà dernier');
});
