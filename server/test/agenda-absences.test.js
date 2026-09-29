'use strict';

// Absences des collaborateurs lues dans l'agenda de l'office (voir src/agendaOffice.js,
// absencesDepuisEvenements). Le plus important à couvrir : ne JAMAIS retenir une absence anonyme
// (« Congés » sans nom) ni un événement « toute la journée » qui n'est pas une absence (une réunion),
// et lire correctement la fin exclusive d'un événement « toute la journée » rendue par Exchange.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  absencesDepuisEvenements, estEvenementJourneeEntiere, collaborateursDansTexte, evenementDepuisEws
} = require('../src/agendaOffice');

// Minuit de Paris (heure d'été en octobre et septembre) exprimé en UTC, comme Exchange le rend.
function minuitParis(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCHours(d.getUTCHours() - 2);
  return d.toISOString().replace('.000Z', 'Z');
}
// Événement « toute la journée » du premier jour au lendemain du dernier (fin exclusive).
function journee(sujet, debut, finExclusive, extra) {
  return evenementDepuisEws({ subject: sujet, start: minuitParis(debut), end: minuitParis(finExclusive), allDay: true, ...(extra || {}) });
}
function lire(...evenements) {
  return absencesDepuisEvenements(evenements, '2026-10-01');
}

test('absencesDepuisEvenements détecte une absence nommée par initiales, prénom ou nom', () => {
  const abs = lire(
    journee('Congés JV', '2026-10-12', '2026-10-13'),
    journee('Julie absente', '2026-10-12', '2026-10-13'),
    journee('Absence VASSELIN', '2026-10-12', '2026-10-13')
  );
  assert.equal(abs.length, 3);
  assert.ok(abs.every((a) => a.collaborateur === 'Julie VASSELIN'));
});

test('la fin d’un événement toute la journée est exclusive : dernier jour = veille de la fin', () => {
  // Congés du 12 au 16 inclus → fin rendue par Exchange = minuit du 17.
  const abs = lire(journee('Congés JS', '2026-10-12', '2026-10-17'));
  assert.equal(abs.length, 1);
  assert.equal(abs[0].debut, '2026-10-12');
  assert.equal(abs[0].fin, '2026-10-16');
  assert.equal(abs[0].collaborateur, 'Jérémy SAUJOT');
});

test('sans fin lisible, l’absence dure un seul jour', () => {
  const abs = lire(evenementDepuisEws({ subject: 'RTT Bastien', start: minuitParis('2026-10-12'), end: '', allDay: true }));
  assert.equal(abs.length, 1);
  assert.equal(abs[0].debut, '2026-10-12');
  assert.equal(abs[0].fin, '2026-10-12');
});

test('une absence anonyme (sans collaborateur nommé) n’est jamais retenue', () => {
  assert.equal(lire(journee('Congés', '2026-10-12', '2026-10-13')).length, 0);
});

test('un événement toute la journée sans mot d’absence (réunion) n’est pas une absence', () => {
  assert.equal(lire(journee('Réunion équipe JV JS', '2026-10-12', '2026-10-13')).length, 0);
});

test('un événement HORAIRE (pas toute la journée) portant un mot d’absence est ignoré', () => {
  const horaire = evenementDepuisEws({ subject: 'Point absence Julie', start: '2026-10-12T09:00:00Z', end: '2026-10-12T10:00:00Z' });
  assert.equal(lire(horaire).length, 0);
});

test('une absence entièrement passée est écartée', () => {
  assert.equal(lire(journee('Congés JV', '2026-09-01', '2026-09-05')).length, 0);
});

test('un événement annulé est ignoré', () => {
  assert.equal(lire(journee('Congés JV', '2026-10-12', '2026-10-13', { cancelled: true })).length, 0);
});

test('deux collaborateurs nommés dans le même événement donnent deux absences', () => {
  const abs = lire(journee('Absents JV et JS', '2026-10-12', '2026-10-13'));
  assert.equal(abs.length, 2);
  assert.deepEqual(abs.map((a) => a.collaborateur).sort(), ['Julie VASSELIN', 'Jérémy SAUJOT'].sort());
});

test('le prénom accentué se reconnaît sans accent (JEREMY → Jérémy)', () => {
  const abs = lire(journee('Vacances Jeremy', '2026-10-12', '2026-10-13'));
  assert.equal(abs.length, 1);
  assert.equal(abs[0].collaborateur, 'Jérémy SAUJOT');
});

test('estEvenementJourneeEntiere suit l’indicateur « toute la journée » d’Exchange', () => {
  assert.equal(estEvenementJourneeEntiere(journee('x', '2026-10-12', '2026-10-13')), true);
  assert.equal(estEvenementJourneeEntiere(evenementDepuisEws({ subject: 'x', start: '2026-10-12T09:00:00Z' })), false);
  assert.equal(estEvenementJourneeEntiere(null), false);
});

test('collaborateursDansTexte : un nom de famille sans mot d’absence est bien reconnu comme collaborateur', () => {
  // (le mot d'absence est vérifié à part par absencesDepuisEvenements) — ici on ne teste QUE l'identification.
  assert.deepEqual(collaborateursDansTexte('note ANGLUMENT').map((c) => c.nom), ['Bastien ANGLUMENT']);
  assert.deepEqual(collaborateursDansTexte('rien de particulier'), []);
});
