'use strict';

// Yousign côté poste (étude 23/10, client/106-yousign.js) : la carte « Autoriser » dit ce que fait l'outil qui écrit.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

test('carte « Autoriser » : envoyer et retirer sont dits en toutes lettres, créer est un brouillon', () => {
  const app = chargerApplication();
  const envoi = app.descriptionActionYousign('yousign__send-signature-request', { id: 'abc' });
  assert.match(envoi, /ENVOYER/);
  assert.match(envoi, /email de Yousign/);
  assert.match(envoi, /id : abc/);
  assert.match(app.descriptionActionYousign('yousign__remove-signature-request-signer', { id: 'x' }), /RETIRER.*irréversible/);
  assert.match(app.descriptionActionYousign('yousign__create-signature-request', { name: 'Vente DUPONT' }), /brouillon/);
  assert.match(app.descriptionActionYousign('yousign__create-signature-request-from-template', {}), /modèle/);
  assert.match(app.descriptionActionYousign('yousign__outil-nouveau', {}), /Écrire dans Yousign/);
});

test('étape affichée : lecture ou préparation, rien pour un autre outil', () => {
  const app = chargerApplication();
  assert.equal(app.libelleOutilYousign('yousign__search-signature-requests'), 'Je consulte Yousign…');
  assert.match(app.libelleOutilYousign('yousign__send-signature-request'), /Je prépare/);
  assert.equal(app.libelleOutilYousign('legifrance__x'), '');
});
