'use strict';

// Étude 29/10 : « dans les conversations les acronymes sont souvent bloqués par l'anonymisation : DIA, EHF, COMEDEC, PAC (pompe à chaleur), HF, CRIDON… ».
// Les sigles du métier ne sont jamais codés [NOM…] ; un vrai nom, lui, l'est toujours.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { masquer, masquerValeurDocument } = require('../src/assistantMistral');

const SIGLES = ['DIA', 'EHF', 'COMEDEC', 'PAC', 'HF', 'CRIDON', 'DOD', 'FCDDV', 'NOTO', 'PUV', 'CJN', 'DS', 'API', 'SCEC', 'ANF', 'RHF', 'DPE', 'SAFER'];

test('les sigles du métier ne sont jamais masqués dans une phrase', () => {
  for (const s of SIGLES) {
    const t = `Peux-tu vérifier la ${s} du dossier ?`;
    assert.equal(masquer(t, new Set(['durand']), new Map()), t, s);
  }
  const phrase = 'Il y a une PAC et un HF dans l’EHF du CRIDON, la DIA est en cours et le COMEDEC demandé.';
  assert.equal(masquer(phrase, new Set(['durand']), new Map()), phrase);
});

test('un vrai nom reste masqué à côté des sigles', () => {
  const sortie = masquer('M. DURAND Paul a reçu la DIA et l’EHF.', new Set(['durand', 'paul']), new Map());
  assert.doesNotMatch(sortie, /DURAND|Paul/);
  assert.match(sortie, /la DIA et l’EHF/);
  const inconnu = masquer('Le dossier de M. VASSEUR concerne la PAC.', new Set(['durand']), new Map());
  assert.doesNotMatch(inconnu, /VASSEUR/, 'un nom en capitales absent des fiches est codé');
  assert.match(inconnu, /la PAC/);
});

test('dans le texte d’un document aussi', () => {
  const t = 'Le vendeur a déposé la DIA ; l’EHF et le HF sont au dossier, PAC installée en 2019.';
  assert.equal(masquerValeurDocument(t, new Set(['durand']), new Map()), t);
});
