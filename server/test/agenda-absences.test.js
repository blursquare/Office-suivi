'use strict';

// Absences des collaborateurs lues dans l'agenda de l'office (voir src/agendaOffice.js,
// absencesDepuisIcs). Le plus important à couvrir : ne JAMAIS retenir une absence anonyme (« Congés »
// sans nom) ni un événement « toute la journée » qui n'est pas une absence (une réunion), et lire
// correctement le DTEND exclusif d'un événement all-day (RFC 5545).

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { absencesDepuisIcs, estEvenementJourneeEntiere, collaborateursDansTexte } = require('../src/agendaOffice');

function vevent(champs) {
  const lignes = ['BEGIN:VEVENT'];
  for (const [cle, val] of Object.entries(champs)) lignes.push(`${cle}:${val}`);
  lignes.push('END:VEVENT');
  return lignes.join('\r\n');
}
function calendrier(...events) {
  return 'BEGIN:VCALENDAR\r\n' + events.join('\r\n') + '\r\nEND:VCALENDAR';
}

test('absencesDepuisIcs détecte une absence nommée par initiales, prénom ou nom', () => {
  const ics = calendrier(
    vevent({ 'DTSTART;VALUE=DATE': '20261012', 'DTEND;VALUE=DATE': '20261013', SUMMARY: 'Congés JV' }),
    vevent({ 'DTSTART;VALUE=DATE': '20261012', 'DTEND;VALUE=DATE': '20261013', SUMMARY: 'Julie absente' }),
    vevent({ 'DTSTART;VALUE=DATE': '20261012', 'DTEND;VALUE=DATE': '20261013', SUMMARY: 'Absence VASSELIN' })
  );
  const abs = absencesDepuisIcs(ics, '2026-10-01');
  assert.equal(abs.length, 3);
  assert.ok(abs.every((a) => a.collaborateur === 'Julie VASSELIN'));
});

test('DTEND d’un événement toute la journée est exclusif : fin = veille du DTEND', () => {
  // Congés du 12 au 16 inclus → DTEND (exclusif) = 20261017.
  const ics = calendrier(vevent({ 'DTSTART;VALUE=DATE': '20261012', 'DTEND;VALUE=DATE': '20261017', SUMMARY: 'Congés JS' }));
  const abs = absencesDepuisIcs(ics, '2026-10-01');
  assert.equal(abs.length, 1);
  assert.equal(abs[0].debut, '2026-10-12');
  assert.equal(abs[0].fin, '2026-10-16');
  assert.equal(abs[0].collaborateur, 'Jérémy SAUJOT');
});

test('sans DTEND, l’absence dure un seul jour', () => {
  const ics = calendrier(vevent({ 'DTSTART;VALUE=DATE': '20261012', SUMMARY: 'RTT Bastien' }));
  const abs = absencesDepuisIcs(ics, '2026-10-01');
  assert.equal(abs.length, 1);
  assert.equal(abs[0].debut, '2026-10-12');
  assert.equal(abs[0].fin, '2026-10-12');
});

test('une absence anonyme (sans collaborateur nommé) n’est jamais retenue', () => {
  const ics = calendrier(vevent({ 'DTSTART;VALUE=DATE': '20261012', 'DTEND;VALUE=DATE': '20261013', SUMMARY: 'Congés' }));
  assert.equal(absencesDepuisIcs(ics, '2026-10-01').length, 0);
});

test('un événement toute la journée sans mot d’absence (réunion) n’est pas une absence', () => {
  const ics = calendrier(vevent({ 'DTSTART;VALUE=DATE': '20261012', 'DTEND;VALUE=DATE': '20261013', SUMMARY: 'Réunion équipe JV JS' }));
  assert.equal(absencesDepuisIcs(ics, '2026-10-01').length, 0);
});

test('un événement HORAIRE (pas toute la journée) portant un mot d’absence est ignoré', () => {
  const ics = calendrier(vevent({ DTSTART: '20261012T090000Z', DTEND: '20261012T100000Z', SUMMARY: 'Point absence Julie' }));
  assert.equal(absencesDepuisIcs(ics, '2026-10-01').length, 0);
});

test('une absence entièrement passée est écartée', () => {
  const ics = calendrier(vevent({ 'DTSTART;VALUE=DATE': '20260901', 'DTEND;VALUE=DATE': '20260905', SUMMARY: 'Congés JV' }));
  assert.equal(absencesDepuisIcs(ics, '2026-10-01').length, 0);
});

test('un événement annulé (STATUS:CANCELLED) est ignoré', () => {
  const ics = calendrier(vevent({ 'DTSTART;VALUE=DATE': '20261012', 'DTEND;VALUE=DATE': '20261013', SUMMARY: 'Congés JV', STATUS: 'CANCELLED' }));
  assert.equal(absencesDepuisIcs(ics, '2026-10-01').length, 0);
});

test('deux collaborateurs nommés dans le même événement donnent deux absences', () => {
  const ics = calendrier(vevent({ 'DTSTART;VALUE=DATE': '20261012', 'DTEND;VALUE=DATE': '20261013', SUMMARY: 'Absents JV et JS' }));
  const abs = absencesDepuisIcs(ics, '2026-10-01');
  assert.equal(abs.length, 2);
  assert.deepEqual(abs.map((a) => a.collaborateur).sort(), ['Julie VASSELIN', 'Jérémy SAUJOT'].sort());
});

test('le prénom accentué se reconnaît sans accent (JEREMY → Jérémy)', () => {
  const ics = calendrier(vevent({ 'DTSTART;VALUE=DATE': '20261012', 'DTEND;VALUE=DATE': '20261013', SUMMARY: 'Vacances Jeremy' }));
  const abs = absencesDepuisIcs(ics, '2026-10-01');
  assert.equal(abs.length, 1);
  assert.equal(abs[0].collaborateur, 'Jérémy SAUJOT');
});

test('estEvenementJourneeEntiere distingue une date seule d’un horodatage', () => {
  assert.equal(estEvenementJourneeEntiere({ dtstart: '20261012' }), true);
  assert.equal(estEvenementJourneeEntiere({ dtstart: '20261012T090000Z' }), false);
  assert.equal(estEvenementJourneeEntiere({ dtstart: '' }), false);
});

test('collaborateursDansTexte : un nom de famille sans mot d’absence est bien reconnu comme collaborateur', () => {
  // (le mot d'absence est vérifié à part par absencesDepuisIcs) — ici on ne teste QUE l'identification.
  assert.deepEqual(collaborateursDansTexte('note ANGLUMENT').map((c) => c.nom), ['Bastien ANGLUMENT']);
  assert.deepEqual(collaborateursDansTexte('rien de particulier'), []);
});
