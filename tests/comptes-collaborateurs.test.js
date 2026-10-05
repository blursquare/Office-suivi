'use strict';

// Réglages › Collaborateurs › Comptes Exchange : état affiché d'un compte (jamais le mot de passe) et rendu des lignes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

test('état d’un compte : aucun, mot de passe manquant, refusé (avec la date), enregistré', () => {
  assert.match(app.etatCompteCollaborateur(null).texte, /Aucun compte enregistré/);
  assert.match(app.etatCompteCollaborateur({ identifiant: 'julie.v', motDePasseEnregistre: false, refuseLe: null }).texte, /Mot de passe manquant/);
  const refuse = app.etatCompteCollaborateur({ identifiant: 'julie.v', motDePasseEnregistre: true, refuseLe: '2026-10-05T09:00:00.000Z' });
  assert.match(refuse.texte, /refusés par Exchange le 5 octobre 2026/);
  assert.equal(refuse.classe, 'reglages-email-echec');
  const ok = app.etatCompteCollaborateur({ identifiant: '', motDePasseEnregistre: true, refuseLe: null });
  assert.match(ok.texte, /Compte enregistré/);
  assert.equal(ok.classe, 'reglages-email-ok');
});
