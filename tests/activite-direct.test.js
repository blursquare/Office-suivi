'use strict';

// Suivi en direct (« Activité de l'étude ») en version visuelle : catégorie de chaque entrée,
// rythme des 7 derniers jours, qui a agi aujourd'hui, groupes Aujourd'hui / Hier / Plus tôt.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const MIDI = new Date(2026, 8, 28, 12, 0, 0).getTime(); // 28/09/2026 à midi, heure locale

test('categorieActivite : agenda, geste fait avant email, pièces, archivage, dates, fiche', () => {
  const cat = (texte, source) => app.categorieActivite({ texte, source: source || 'dossier' }).cle;
  assert.equal(cat('Rendez-vous de signature relevé dans l’agenda', 'agenda'), 'agenda');
  assert.equal(cat('Tâche du jour « Relancer l’offre de prêt » : faite'), 'fait');
  assert.equal(cat('Relance manuelle envoyée — Prêt manquant'), 'email');
  assert.equal(cat('Questionnaire de satisfaction envoyé'), 'email');
  assert.equal(cat('Pièce ajoutée à la checklist : « Attestation »'), 'piece');
  assert.equal(cat('Dossier archivé'), 'archive');
  assert.equal(cat('Date « Obtention du prêt » modifiée : 05/10/2026'), 'date');
  assert.equal(cat('Prix de vente modifié : 250 000 €'), 'modif');
});

test('rythmeActivite : 7 jours se terminant aujourd’hui, qui a agi aujourd’hui', () => {
  const h = (heuresAvant, auteur) => ({ date: new Date(MIDI - heuresAvant * 3600000).toISOString(), auteur: auteur || '' });
  const r = app.rythmeActivite([h(1, 'Julie VASSELIN'), h(2, 'Julie VASSELIN'), h(3), h(30, 'Jérémy SAUJOT'), h(24 * 10, 'Julie VASSELIN')], MIDI);
  assert.equal(r.jours.length, 7);
  assert.equal(r.jours[6].aujourdhui, true);
  assert.equal(r.aujourdhui, 3);
  assert.equal(r.jours[5].n, 1);
  assert.equal(r.jours.reduce((t, j) => t + j.n, 0), 4); // l'entrée d'il y a 10 jours est hors fenêtre
  assert.equal(r.equipe.map(q => `${q.nom}:${q.n}`).join(','), 'Julie VASSELIN:2,Agenda:1');
  assert.equal(r.max, 3);
});

test('groupeJourActivite : Aujourd’hui, Hier, Plus tôt', () => {
  assert.equal(app.groupeJourActivite(new Date(MIDI - 3600000).toISOString(), MIDI), "Aujourd'hui");
  assert.equal(app.groupeJourActivite(new Date(MIDI - 20 * 3600000).toISOString(), MIDI), 'Hier');
  assert.equal(app.groupeJourActivite(new Date(MIDI - 50 * 3600000).toISOString(), MIDI), 'Plus tôt');
  assert.equal(app.groupeJourActivite('pas une date', MIDI), 'Plus tôt');
});
