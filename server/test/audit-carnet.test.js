'use strict';

// Relecture indépendante du 12/10 : fusion du carnet des confrères et de l'annuaire.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fusionnerCarnetEtAnnuaire } = require('../src/carnetConfreres');

test('corriger un office ne fait plus disparaître un autre office au même email ou téléphone', () => {
  const annuaire = [
    { id: 'a1', nom: 'Office A', email: 'accueil@notaires.fr', telephone: '02 54 00 00 00' },
    { id: 'a2', nom: 'Office B', email: 'accueil@notaires.fr', telephone: '02 54 00 00 00' },
    { id: 'a3', nom: 'Office C', email: 'c@notaires.fr', telephone: '02 54 11 11 11' }
  ];
  const carnet = [{ id: 'a1', nom: 'Office A corrigé', email: 'accueil@notaires.fr', telephone: '02 54 00 00 00', modifieLe: '2026-10-01' }];
  const r = fusionnerCarnetEtAnnuaire(carnet, annuaire);
  assert.equal(r.map(o => o.id).sort().join(','), 'a1,a2,a3');
  assert.equal(r.find(o => o.id === 'a1').nom, 'Office A corrigé');
  // Un office SAISI au même email qu'un seul office de l'annuaire le remplace ; partagé par deux, il s'ajoute.
  const saisi = [{ id: 's1', nom: 'Saisi', email: 'c@notaires.fr', annuaire: false }];
  const r2 = fusionnerCarnetEtAnnuaire(saisi, annuaire);
  assert.equal(r2.filter(o => o.id === 'a3').length, 0);
  assert.ok(r2.some(o => o.id === 's1'));
  const saisi2 = [{ id: 's2', nom: 'Saisi 2', email: 'accueil@notaires.fr', annuaire: false }];
  assert.equal(fusionnerCarnetEtAnnuaire(saisi2, annuaire).length, 4);
});
