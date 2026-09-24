'use strict';

// Encart « Mise à jour de CLAIRE » des Réglages : ce qu'il dit, et quand il propose d'installer.

const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();
const etat = { modeExe: true, installe: { build: 137 }, jetonEnregistre: true };

test('avant toute vérification : la version installée, rien à installer', () => {
  const m = app.messageMiseAJour(etat, null);
  assert.match(m.titre, /build 137/);
  assert.equal(m.installable, false);
});

test('hors exécutable : rien à mettre à jour', () => {
  const m = app.messageMiseAJour({ modeExe: false, installe: null }, { etat: 'disponible', disponible: { build: 140 } });
  assert.equal(m.installable, false);
  assert.match(m.titre, /développement/);
});

test('version plus récente : proposée, avec les deux numéros', () => {
  const m = app.messageMiseAJour(etat, { etat: 'disponible', disponible: { build: 140, publieLe: '2026-09-25T08:00:00Z' } });
  assert.equal(m.installable, true);
  assert.equal(m.niveau, 'alerte');
  assert.match(m.titre, /build 140/);
  assert.match(m.detail, /build 137/);
});

test('à jour, erreur, ou version installée inconnue', () => {
  assert.equal(app.messageMiseAJour(etat, { etat: 'a-jour', disponible: { build: 137 } }).installable, false);
  const e = app.messageMiseAJour(etat, { erreur: 'Dépôt introuvable : il est privé.' });
  assert.equal(e.installable, false);
  assert.match(e.detail, /privé/);
  const i = app.messageMiseAJour({ modeExe: true, installe: null }, { etat: 'inconnu', disponible: { build: 140 } });
  assert.equal(i.installable, true);
  assert.match(i.detail, /version inconnue/);
});
