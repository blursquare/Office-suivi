'use strict';

// Vérification d'un extrait cité (voir normaliserAvecIndex / localiserExtrait dans script.js,
// section « EXTRACTION STRUCTURÉE : localisation d'un extrait »). C'est le garde-fou central de la
// refonte : une donnée proposée par le modèle IA local n'est acceptée (CONFIRMED) que si la clause
// qu'il cite existe littéralement dans le texte du PDF — un score de « confidence » renvoyé par le
// modèle lui-même ne prouve rien.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const TEXTE = "Article 5 — CONDITION SUSPENSIVE DE PRÊT.\n" +
  "L'ACQUÉREUR devra obtenir son financement au plus tard le 15 novembre 2026, " +
  "faute de quoi les présentes seront caduques.";

test('localiserExtrait retrouve une citation exacte et renvoie sa position', () => {
  const app = chargerApplication();
  const index = app.localiserExtrait(TEXTE, 'devra obtenir son financement au plus tard le 15 novembre 2026');
  assert.ok(index > 0);
  assert.ok(TEXTE.slice(index).startsWith('devra obtenir'));
});

test('localiserExtrait tolère accents, casse et apostrophes typographiques', () => {
  // Le texte extrait d'un PDF est systématiquement bruité de ce côté : sans cette tolérance, une
  // citation pourtant exacte passerait à tort en NEEDS_REVIEW.
  const app = chargerApplication();
  assert.ok(app.localiserExtrait(TEXTE, "L'ACQUEREUR devra obtenir son financement") >= 0);
  assert.ok(app.localiserExtrait("L’acquéreur devra justifier du dépôt de sa demande",
    "L'acquereur devra justifier du depot") >= 0);
});

test('localiserExtrait tolère un espacement différent de la mise en page réelle', () => {
  const app = chargerApplication();
  assert.ok(app.localiserExtrait(TEXTE, 'devra   obtenir son  financement au plus tard  le 15 novembre 2026') >= 0);
});

test('localiserExtrait rejette une citation absente du texte', () => {
  // Cas d'une phrase reformulée ou inventée par le modèle : elle ne doit jamais être confirmée.
  const app = chargerApplication();
  assert.equal(app.localiserExtrait(TEXTE, "le vendeur s'engage à repeindre la façade avant la vente"), -1);
});

test('localiserExtrait refuse une citation trop courte pour constituer une preuve', () => {
  const app = chargerApplication();
  assert.equal(app.localiserExtrait(TEXTE, 'le 15'), -1);
  assert.equal(app.localiserExtrait(TEXTE, ''), -1);
});

test('normaliserAvecIndex garde une correspondance exacte vers le texte d’origine', () => {
  const app = chargerApplication();
  const source = "  L’ACQUÉREUR   devra\npayer";
  const { texte, index } = app.normaliserAvecIndex(source);
  assert.equal(texte, "l'acquereur devra payer");
  assert.equal(texte.length, index.length);
  // Chaque caractère normalisé pointe vers un caractère réel du texte d'origine.
  assert.ok(index.every(i => i >= 0 && i < source.length));
  assert.equal(source[index[0]], 'L');
});
