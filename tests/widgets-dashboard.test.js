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
  assert.equal(ids(d), 'aujourdhui,agenda,portefeuille,pieces,avancement,activite');
  assert.equal(d.map(w => w.taille).join(','), 'grand,moyen,petit,petit,grand,grand');
  assert.ok(d.every(w => w.masque === false));
});

test('préférence partielle ou abîmée : ordre gardé, taille ramenée à une taille permise, manquants ajoutés à la fin', () => {
  const d = app.dispositionWidgetsDepuis([
    { id: 'agenda', taille: 'enorme' },         // taille inconnue
    { id: 'inconnu', taille: 'petit' },
    { id: 'avancement', taille: 'grand', masque: true },
    { id: 'agenda', taille: 'petit' }             // doublon ignoré
  ]);
  assert.equal(ids(d), 'agenda,avancement,aujourdhui,portefeuille,pieces,activite');
  assert.equal(d[0].taille, 'moyen');
  assert.equal(d[1].taille, 'grand');
  assert.equal(d[1].masque, true);
});

test('déplacer : à une position donnée, bornée', () => {
  const d = app.dispositionWidgetsDepuis(null);
  assert.equal(ids(app.deplacerWidgetDans(d, 'pieces', 0)), 'pieces,aujourdhui,agenda,portefeuille,avancement,activite');
  assert.equal(ids(app.deplacerWidgetDans(d, 'aujourdhui', 99)), 'agenda,portefeuille,pieces,avancement,activite,aujourdhui');
  assert.equal(ids(app.deplacerWidgetDans(d, 'inconnu', 0)), ids(d));
});

test('flèches : un pas parmi les widgets visibles, les masqués sont sautés', () => {
  let d = app.dispositionWidgetsDepuis(null);
  d = d.map(w => w.id === 'agenda' ? Object.assign({}, w, { masque: true }) : w);
  // portefeuille avance d'un cran « visible » : il passe devant aujourdhui (agenda masqué est sauté).
  assert.equal(ids(app.decalerWidgetDans(d, 'portefeuille', -1)), 'portefeuille,aujourdhui,agenda,pieces,avancement,activite');
  assert.equal(ids(app.decalerWidgetDans(d, 'aujourdhui', -1)), ids(d), 'déjà premier');
  assert.equal(ids(app.decalerWidgetDans(d, 'activite', 1)), ids(d), 'déjà dernier');
});

test('glisser-déposer : la disposition suit l’ordre du DOM, tailles et masquage gardés', () => {
  const d = app.dispositionWidgetsDepuis([{ id: 'pieces', taille: 'grand', masque: true }]);
  const n = app.dispositionDansOrdre(d, ['activite', 'inconnu', 'aujourdhui', 'pieces']);
  assert.equal(ids(n), 'activite,aujourdhui,pieces,agenda,portefeuille,avancement');
  const p = n.find(w => w.id === 'pieces');
  assert.equal(p.taille + ':' + p.masque, 'grand:true');
});

test('toutes les cartes existent en petit, moyen et grand', () => {
  assert.ok(app.WIDGETS_DASHBOARD.every(w => w.tailles.join(',') === 'petit,moyen,grand'));
});

test('pièces encore attendues : regroupées par pièce, dossiers reliés seulement, les plus attendues d’abord', () => {
  const base = { typeVente: 'maison', roleNotaire: 'instrumentaire', dossierLie: true };
  const l = app.piecesEncoreAttendues([
    Object.assign({ id: 'a', nom: 'A' }, base, { pieces: {} }),
    Object.assign({ id: 'b', nom: 'B' }, base, { pieces: {} }),
    Object.assign({ id: 'c', nom: 'C' }, base, { dossierLie: false }),
    Object.assign({ id: 'd', nom: 'D' }, base, { roleNotaire: 'participant' })
  ]);
  assert.ok(l.length > 0);
  assert.ok(l.every(p => p.dossiers.length === 2));
});

test('prochaines signatures : à partir d’aujourd’hui, par date puis heure, hors le jour détaillé', () => {
  const l = app.prochainesSignatures([
    { id: '1', rendezVousSignature: '2026-10-02', rendezVousSignatureHeure: '14:00' },
    { id: '2', rendezVousSignature: '2026-10-02', rendezVousSignatureHeure: '09:30' },
    { id: '3', rendezVousSignature: '2026-09-20' },
    { id: '4', rendezVousSignature: '2026-09-29' },
    { id: '5', rendezVousSignature: '2026-10-01', archive: true }
  ], '2026-09-29', '2026-09-29', 10);
  assert.equal(l.map(d => d.id).join(','), '2,1');
});
