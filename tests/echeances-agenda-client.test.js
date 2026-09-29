'use strict';

// Dates butoir dans l'agenda : le CLIENT (script.js) crée l'événement au geste de l'étude, le SERVEUR
// (server/src/echeancesAgenda.js) pose ce qui manque à son tour de lecture et ADOPTE un événement
// au même titre plutôt que d'en créer un second. Les deux compositions doivent donc rester
// identiques — c'est ce que ce test verrouille, ainsi que la règle « date souhaitée dans l'agenda ».

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const serveur = require('../server/src/echeancesAgenda');

const app = chargerApplication();
const dossiers = [
  { id: 'a', nom: 'DUPONT / MARTIN', pret: '2026-11-20', ventebien: '2026-10-15' },
  { id: 'b', nom: 'CONSORTS LEROY', pret: '2026-11-20' },
  { id: 'c', nom: 'BERNARD / PETIT / DURAND', pret: '2026-11-20' }
];

test('titre et corps de l’événement : mêmes chaînes côté client et côté serveur', () => {
  for (const d of dossiers) {
    for (const type of ['pret', 'ventebien']) {
      assert.equal(app.sujetEcheanceAgenda(d, type), serveur.sujetEcheanceAgenda(d, type));
      assert.equal(app.CORPS_ECHEANCE_AGENDA[type], serveur.CORPS_ECHEANCE_AGENDA[type]);
    }
  }
  assert.equal(app.sujetEcheanceAgenda(dossiers[0], 'pret'), 'Obtention du prêt — MARTIN - Dossier DUPONT / MARTIN');
});

test('date souhaitée dans l’agenda : même verdict des deux côtés', () => {
  const cas = [
    { nom: 'A / B', pret: '2026-11-20' },
    { nom: 'A / B', pret: '2026-11-20', sansPret: true },
    { nom: 'A / B', pret: '2026-11-20', offrePretStatut: 'recue' },
    { nom: 'A / B', pret: '2026-11-20', echeancesValidees: { pret: true } },
    { nom: 'A / B', pret: '2026-11-20', archive: true },
    { nom: 'A / B', ventebien: '2026-10-15' },
    { nom: 'A / B', ventebien: '2026-10-15', echeancesValidees: { ventebien: true } },
    { nom: 'A / B', ventebien: '' },
    { nom: 'A / B', pret: 'pas une date' }
  ];
  for (const d of cas) {
    for (const type of ['pret', 'ventebien']) {
      assert.equal(app.echeanceAgendaSouhaitee(d, type), serveur.echeanceAgendaSouhaitee(d, type), JSON.stringify([d, type]));
    }
  }
});
