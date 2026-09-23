'use strict';

// Contrôle d'une adresse avant le message de test de l'écran Réglages (controlerAdresseEnvoi).
// L'erreur qui l'a motivé : un domaine mal orthographié (« notaire.fr » pour « notaires.fr »)
// passait tous les contrôles de forme et ne se révélait qu'au bout de la chaîne, dans l'erreur du
// flux Power Automate.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();
const PASSERELLE = 'Bastien.ANGLUMENT@gossart.notaires.fr';

test('une adresse correcte sur le domaine de la passerelle passe sans remarque', () => {
  const r = app.controlerAdresseEnvoi('julie.vasselin@gossart.notaires.fr', PASSERELLE);
  assert.equal(r.erreur, undefined);
  assert.equal(r.avertissement, undefined);
});

test('un domaine différent de celui de la passerelle est signalé, sans bloquer', () => {
  const r = app.controlerAdresseEnvoi('julie.vasselin@gossart.notaire.fr', PASSERELLE);
  assert.equal(r.erreur, undefined);
  assert.match(r.avertissement, /gossart\.notaire\.fr/);
  assert.match(r.avertissement, /gossart\.notaires\.fr/);
});

test('la casse du domaine ne compte pas', () => {
  const r = app.controlerAdresseEnvoi('julie@GOSSART.Notaires.fr', PASSERELLE);
  assert.equal(r.avertissement, undefined);
});

test('les adresses impossibles sont refusées', () => {
  for (const mauvaise of ['', '   ', 'julie', 'julie@@etude.fr', 'jul ie@etude.fr', 'julie@etude', 'julie@etude..fr', 'julie@etude.fr.', '@etude.fr']) {
    assert.ok(app.controlerAdresseEnvoi(mauvaise, PASSERELLE).erreur, mauvaise);
  }
});

test('sans passerelle de référence, seul le format est contrôlé', () => {
  const r = app.controlerAdresseEnvoi('julie@autre-domaine.fr', '');
  assert.equal(r.erreur, undefined);
  assert.equal(r.avertissement, undefined);
});
