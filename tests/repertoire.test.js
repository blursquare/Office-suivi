'use strict';
// Répertoire (Outils › Répertoire, 30/09) : recherche commune, valeurs libellées, numéros appelables.
// Contacts inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const contacts = [
  { id: 'a', theme: 'banquesSuccessions', organisme: 'Banque Exemple', service: 'Service successions', adresse: 'TSA 1, 45000 ORLÉANS', telephones: ['02 00 00 00 01'], emails: ['successions@banque-exemple.fr'] },
  { id: 'b', theme: 'banquesPrets', organisme: 'Banque Exemple', service: 'Service prêt', emails: ['Mainlevée : mainlevee@banque-exemple.fr'] },
  { id: 'c', theme: 'justice', organisme: 'Tribunal judiciaire de Villeneuve', service: 'Répertoire civil', personnes: ['Jeanne DUPRÉ — Greffière'] }
];

test('filtrerRepertoire : tous les mots, sans accents, dans tous les champs ; tri par organisme puis service', () => {
  assert.equal(app.filtrerRepertoire(contacts, '').map(c => c.id).join(','), 'b,a,c');
  assert.equal(app.filtrerRepertoire(contacts, 'banque pret').map(c => c.id).join(','), 'b');
  assert.equal(app.filtrerRepertoire(contacts, 'orleans').map(c => c.id).join(','), 'a');
  assert.equal(app.filtrerRepertoire(contacts, 'dupre greffiere').map(c => c.id).join(','), 'c');
  assert.equal(app.filtrerRepertoire(contacts, 'mainlevee').map(c => c.id).join(','), 'b');
  assert.equal(app.filtrerRepertoire(contacts, 'inconnu').length, 0);
});

test('valeurLibelleeRepertoire et numeroAppelable', () => {
  const v = app.valeurLibelleeRepertoire('Mainlevée : 04 00 00 00 00');
  assert.equal(v.libelle + '|' + v.valeur, 'Mainlevée|04 00 00 00 00');
  assert.equal(app.valeurLibelleeRepertoire('02 00 00 00 01').libelle, '');
  assert.equal(app.numeroAppelable('02 00 00 00 01 — 06 00 00 00 02'), '0200000001');
  assert.equal(app.numeroAppelable('+33 1 00 00 00 00'), '+33100000000');
  assert.equal(app.numeroAppelable('3960'), '3960');
  assert.equal(app.numeroAppelable('pas de numéro'), '');
});
