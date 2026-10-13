'use strict';

// Relecture indépendante de « Nouveau dossier » (13/10) : ce qui est corrigé et vérifiable sans navigateur. Le remplacement d'un
// compromis par un autre (emails et adresse du premier qui restaient) est rejoué dans un vrai Chromium par tests/fumee.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('doublon à la création : noms comparés sans espaces ni ponctuation', () => {
  const liste = [{ id: 'a', nom: 'DURAND/MARTIN' }, { id: 'b', nom: 'DUPONT - LEROY' }, { id: 'c', nom: 'PETIT / ROUX', archive: true }];
  assert.equal((app.dossierDejaPresentPourCreation('DURAND / MARTIN', '', liste) || {}).id, 'a');
  assert.equal((app.dossierDejaPresentPourCreation('Dupont / Leroy', '', liste) || {}).id, 'b');
  assert.equal(app.dossierDejaPresentPourCreation('PETIT / ROUX', '', liste), null, 'un dossier archivé n’est pas un doublon');
  assert.equal(app.dossierDejaPresentPourCreation('DURAND / MARTINEZ', '', liste), null);
  assert.equal(app.dossierDejaPresentPourCreation('', '', liste), null);
});
