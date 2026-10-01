'use strict';
// Modifier et glisser-déposer un rendez-vous de la page Agenda (étude, 01/10). Titres et dossiers inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('evenementModifiableAgenda : seulement un rendez-vous lu dans Outlook, ni fantôme ni option de sondage', () => {
  assert.equal(app.evenementModifiableAgenda({ itemId: 'ID1', sujet: 'Point équipe' }), true);
  assert.equal(app.evenementModifiableAgenda({ sujet: 'Sans identifiant' }), false);
  assert.equal(app.evenementModifiableAgenda({ itemId: 'ID1', horsAgenda: true }), false);
  assert.equal(app.evenementModifiableAgenda({ itemId: 'ID1', fantome: true }), false);
  assert.equal(app.evenementModifiableAgenda({ itemId: 'ID1', option: true }), false);
  assert.equal(app.evenementModifiableAgenda(null), false);
});

test('horaireGlisseAgenda : décalage au quart d’heure, même durée, jamais hors de la journée', () => {
  const h = (a, b, d) => { const r = app.horaireGlisseAgenda(a, b, d); return r ? `${r.heure}-${r.heureFin}` : 'null'; };
  assert.equal(h('10:00', '11:30', 62), '11:00-12:30');
  assert.equal(h('10:00', '11:30', 6), '10:00-11:30', 'moins de 7 min 30 : pas de décalage');
  assert.equal(h('10:10', '10:40', 30), '10:40-11:10', 'les minutes d’origine sont gardées');
  assert.equal(h('14:00', '', -95), '12:30-13:30', 'sans heure de fin : 1 h');
  assert.equal(h('23:00', '23:45', 120), '23:15-23:59');
  assert.equal(h('00:30', '01:00', -120), '00:00-00:30');
  assert.equal(h('', '10:00', 30), 'null');
});

test('signatureSuitAgenda : la fiche suit seulement le rendez-vous de signature à sa date', () => {
  const d = { id: 'd1', rendezVousSignature: '2026-10-20' };
  assert.equal(app.signatureSuitAgenda(d, { signature: true, date: '2026-10-20' }), true);
  assert.equal(app.signatureSuitAgenda(d, { signature: false, date: '2026-10-20' }), false, 'un autre rendez-vous du dossier');
  assert.equal(app.signatureSuitAgenda(d, { signature: true, date: '2026-10-21' }), false, 'pas celui de la fiche');
  assert.equal(app.signatureSuitAgenda(Object.assign({}, d, { archive: true }), { signature: true, date: '2026-10-20' }), false);
  assert.equal(app.signatureSuitAgenda(null, { signature: true, date: '2026-10-20' }), false);
});

test('heureDepuisMinutesAgenda : « HH:MM »', () => {
  assert.equal(app.heureDepuisMinutesAgenda(9 * 60 + 5), '09:05');
  assert.equal(app.heureDepuisMinutesAgenda(0), '00:00');
});

test('catégorie « Annulé / à replacer » : l’emporte sur le lieu, et le changement garde les catégories posées à la main', () => {
  const reglees = { office: 'Catégorie Verte', visio: 'Catégorie Violette', confrere: 'Catégorie Orange', annule: 'Catégorie Jaune' };
  assert.equal(app.typeEvenementAgenda({ categories: ['Catégorie Verte', 'catégorie jaune'] }, reglees), 'annule');
  assert.equal(app.typeEvenementAgenda({ categories: ['Catégorie Violette'] }, reglees), 'visio');
  assert.equal(app.categoriesApresChangement(['Catégorie Verte', 'Important'], reglees, 'annule').join('|'), 'Catégorie Jaune|Important');
  assert.equal(app.categoriesApresChangement(['Catégorie Jaune'], reglees, 'visio').join('|'), 'Catégorie Violette');
  assert.equal(app.categoriesApresChangement(['Catégorie Verte', 'Important'], reglees, '').join('|'), 'Important', 'sans catégorie');
});

test('estDateButoirAgenda : les dates butoir posées par CLAIRE et les titres qui le disent', () => {
  assert.equal(app.estDateButoirAgenda({ sujet: 'Obtention du prêt — MARTIN - Dossier DURAND / MARTIN' }), true);
  assert.equal(app.estDateButoirAgenda({ sujet: 'Vente préalable — MARTIN - Dossier DURAND / MARTIN' }), true);
  assert.equal(app.estDateButoirAgenda({ sujet: 'Date butoir LEROY' }), true);
  assert.equal(app.estDateButoirAgenda({ sujet: 'VTE - DURAND / MARTIN' }), false);
  assert.equal(app.estDateButoirAgenda({ sujet: 'Point sur l’obtention du prêt des clients' }), false);
});

test('horaireRedimensionneAgenda : bord du bas = fin, bord du haut = début, au quart d’heure, 15 min au moins', () => {
  const r = (a, b, bord, d) => { const x = app.horaireRedimensionneAgenda(a, b, bord, d); return x ? `${x.heure}-${x.heureFin}` : 'null'; };
  assert.equal(r('10:00', '11:00', 'bas', 32), '10:00-11:30');
  assert.equal(r('10:00', '11:00', 'bas', -50), '10:00-10:15', 'raccourci : jamais moins de 15 min');
  assert.equal(r('10:00', '11:00', 'haut', -60), '09:00-11:00', 'agrandi par le haut');
  assert.equal(r('10:00', '11:00', 'haut', 120), '10:45-11:00', 'le début ne dépasse pas la fin');
  assert.equal(r('23:00', '23:30', 'bas', 120), '23:00-23:59');
  assert.equal(r('10:00', '', 'bas', 30), '10:00-11:30', 'sans fin connue : 1 h');
  assert.equal(r('10:00', '11:00', 'milieu', 30), 'null');
  assert.equal(r('', '11:00', 'bas', 30), 'null');
});
