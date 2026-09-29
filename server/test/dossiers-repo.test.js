'use strict';

// Couche d'accès aux dossiers (src/dossiersRepo.js) : le blob JSON et la colonne `updated_at`
// restent deux choses distinctes. Base en mémoire, aucun serveur HTTP.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirDb } = require('../src/db');
const { creerDepot } = require('../src/dossiersRepo');

test('updatedAt vient de la colonne, jamais du blob — même quand un dossier relu est réécrit tel quel', () => {
  const db = ouvrirDb(':memory:');
  try {
    const depot = creerDepot(db);
    depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', updatedAt: 1 });
    const lu = depot.trouverParId('d1');
    assert.ok(lu.updatedAt > 1, 'la valeur du blob est ignorée');
    // Relu puis réécrit tel quel (ce que font les tours du NAS et de l'agenda).
    lu.pret = '2026-11-20';
    const t = depot.remplacer('d1', lu);
    const blob = JSON.parse(db.prepare('SELECT data FROM dossiers WHERE id = ?').get('d1').data);
    assert.equal('updatedAt' in blob, false);
    assert.equal(depot.trouverParId('d1').updatedAt, t);
    assert.equal(depot.tousActifs()[0].updatedAt, t);
  } finally { db.close(); }
});
