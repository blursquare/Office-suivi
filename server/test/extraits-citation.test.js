'use strict';

// Relecture indépendante du 12/10 : une citation n'est « vérifiée » que si elle se retrouve EN ENTIER.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { localiserExtrait } = require('../src/extraction/extraits');

const acte = 'Le vendeur déclare ne pas avoir réalisé de travaux depuis son acquisition. Il s’engage à fournir l’attestation de con-  formité.';

test('citation exacte : retrouvée', () => {
  assert.equal(localiserExtrait(acte, 'Le vendeur déclare ne pas avoir réalisé de travaux'), 0);
});

test('négation retirée ou fin inventée : introuvable', () => {
  assert.equal(localiserExtrait(acte, 'Le vendeur déclare avoir réalisé de travaux'), -1);
  assert.equal(localiserExtrait(acte, 'Le vendeur déclare ne pas avoir réalisé de travaux depuis 2010'), -1);
});

test('coupure marquée « … » et césure en fin de ligne : retrouvée', () => {
  assert.equal(localiserExtrait(acte, 'Le vendeur déclare … il s’engage à fournir'), 0);
  assert.ok(localiserExtrait(acte, 'l’attestation de conformité') > 0);
});

test('morceaux dans le désordre : introuvable ; trop court : introuvable', () => {
  assert.equal(localiserExtrait(acte, 'Il s’engage à fournir … Le vendeur déclare'), -1);
  assert.equal(localiserExtrait(acte, 'le 15'), -1);
});

test('guillemets, « œ » et marqueur de page recopiés : retrouvée (relecture 12/10)', () => {
  const t = 'Le bien est situé en zone « à risque » selon le plan. Le vendeur a fait réaliser le cœur des travaux. Fin de page. Suite de la clause sur la page suivante.';
  assert.ok(localiserExtrait(t, 'situé en zone "à risque" selon le plan') > 0);
  assert.ok(localiserExtrait(t, 'situé en zone à risque selon le plan') > 0);
  assert.ok(localiserExtrait(t, 'réaliser le coeur des travaux') > 0);
  assert.ok(localiserExtrait(t, 'Fin de page. [[page 4]] Suite de la clause') > 0);
});
