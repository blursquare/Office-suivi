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
  assert.equal(d.map(w => w.taille + w.hauteur).join(','), 'moyen2,moyen1,petit1,petit1,moyen2,moyen2');
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
  assert.equal(d[0].taille + d[0].hauteur, 'moyen1');
  // Préférence d'avant la hauteur réglable : « grand » (2 × 2) devient moyen sur 2 rangées.
  assert.equal(d[1].taille + d[1].hauteur, 'moyen2');
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
  const d = app.dispositionWidgetsDepuis([{ id: 'pieces', taille: 'grand', hauteur: 3, masque: true }]);
  const n = app.dispositionDansOrdre(d, ['activite', 'inconnu', 'aujourdhui', 'pieces']);
  assert.equal(ids(n), 'activite,aujourdhui,pieces,agenda,portefeuille,avancement');
  const p = n.find(w => w.id === 'pieces');
  assert.equal(p.taille + p.hauteur + ':' + p.masque, 'grand3:true');
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

test('hauteur réglable : 1, 2 ou 3 rangées, largeur indépendante ; valeur inconnue ramenée au défaut', () => {
  const d = app.dispositionWidgetsDepuis([
    { id: 'agenda', taille: 'grand', hauteur: 3 },
    { id: 'pieces', taille: 'petit', hauteur: 9 }
  ]);
  assert.equal(d[0].taille + d[0].hauteur, 'grand3');
  assert.equal(d[1].taille + d[1].hauteur, 'petit1');
});

test('contenu selon la place : une case = petit, une rangée = moyen, deux rangées ou plus = grand', () => {
  assert.equal(['petit1', 'moyen1', 'grand1', 'petit2', 'moyen3', 'grand2'].map(k => app.varianteWidget(k.slice(0, -1), Number(k.slice(-1)))).join(','),
    'petit,moyen,moyen,grand,grand,grand');
});

test('agenda : prochaines échéances des dossiers, hors signature et hors dates passées', () => {
  const l = app.prochainesEcheancesAgenda([
    { id: 'a', nom: 'A', pret: '2026-10-10', acte: '2026-12-01' },
    { id: 'b', nom: 'B', sansPret: true, ventebien: '2026-10-05', pret: '2026-09-01' },
    { id: 'c', nom: 'C', pret: '2026-09-20' }
  ], '2026-09-29', 10);
  assert.equal(l.map(e => e.dossier.id + ':' + e.type).join(','), 'b:ventebien,a:pret');
});

test('activité : les relevés de CLAIRE (sans auteur, hors agenda) servent d’appoint', () => {
  const l = app.activiteAutomatique([{ id: 'x', nom: 'X', historique: [
    { date: '2026-09-29T08:00:00Z', texte: 'Pièce trouvée sur le NAS : Diagnostics' },
    { date: '2026-09-29T09:00:00Z', texte: 'Rendez-vous relevé dans l’agenda' },
    { date: '2026-09-29T10:00:00Z', auteur: 'Julie VASSELIN', texte: 'Email préparé' }
  ] }]);
  assert.equal(l.map(e => e.source + ':' + e.texte).join('|'), 'claire:Pièce trouvée sur le NAS : Diagnostics');
});
