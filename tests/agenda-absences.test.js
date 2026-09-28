'use strict';

// Absences des collaborateurs sur l'agenda du tableau de bord (voir la carte « Agenda » dans
// script.js). La détection elle-même est côté serveur (voir server/test/agenda-absences.test.js) ;
// ici on couvre les fonctions PURES du client qui décident ce que la carte affiche : qui est absent
// dans la semaine montrée, et si le responsable d'un rendez-vous est absent le jour affiché.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

// Julie absente du 12 au 16 octobre 2026 (inclus).
const ABS = [{ collaborateur: 'Julie VASSELIN', initiales: 'JV', debut: '2026-10-12', fin: '2026-10-16' }];
// Une semaine (lundi 12 → dimanche 18 octobre) sous la forme attendue par la carte.
function semaine(dateDebut) {
  const jours = [];
  const base = new Date(dateDebut + 'T00:00:00Z');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base); d.setUTCDate(base.getUTCDate() + i);
    jours.push({ iso: d.toISOString().slice(0, 10) });
  }
  return jours;
}

test('absenceCouvreJour : bornes incluses', () => {
  const app = chargerApplication();
  assert.equal(app.absenceCouvreJour(ABS[0], '2026-10-12'), true, 'premier jour inclus');
  assert.equal(app.absenceCouvreJour(ABS[0], '2026-10-16'), true, 'dernier jour inclus');
  assert.equal(app.absenceCouvreJour(ABS[0], '2026-10-11'), false, 'la veille : non');
  assert.equal(app.absenceCouvreJour(ABS[0], '2026-10-17'), false, 'le lendemain : non');
});

test('absenceCouvreJour : une absence d’un seul jour (fin absente) couvre ce jour', () => {
  const app = chargerApplication();
  assert.equal(app.absenceCouvreJour({ collaborateur: 'X', debut: '2026-10-12' }, '2026-10-12'), true);
  assert.equal(app.absenceCouvreJour({ collaborateur: 'X', debut: '2026-10-12' }, '2026-10-13'), false);
});

test('collaborateursAbsentsSemaine : nommé une fois même si absent plusieurs jours de la semaine', () => {
  const app = chargerApplication();
  // Tableaux issus du contexte vm : comparer des chaînes jointes, pas assert.deepEqual (voir load-app).
  const noms = app.collaborateursAbsentsSemaine(ABS, semaine('2026-10-12'));
  assert.equal(noms.join('|'), 'Julie VASSELIN');
});

test('collaborateursAbsentsSemaine : rien si l’absence ne recoupe pas la semaine affichée', () => {
  const app = chargerApplication();
  // Semaine du 5 au 11 octobre : l'absence commence le 12, hors semaine.
  assert.equal(app.collaborateursAbsentsSemaine(ABS, semaine('2026-10-05')).join('|'), '');
});

test('responsableAbsentLeJour : vrai le jour d’absence du bon responsable seulement', () => {
  const app = chargerApplication();
  assert.equal(app.responsableAbsentLeJour(ABS, 'Julie VASSELIN', '2026-10-14'), true);
  assert.equal(app.responsableAbsentLeJour(ABS, 'Julie VASSELIN', '2026-10-20'), false, 'hors période');
  assert.equal(app.responsableAbsentLeJour(ABS, 'Jérémy SAUJOT', '2026-10-14'), false, 'autre responsable');
  assert.equal(app.responsableAbsentLeJour(ABS, '', '2026-10-14'), false, 'responsable vide');
});
