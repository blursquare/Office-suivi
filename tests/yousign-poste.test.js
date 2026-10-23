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

test('carte « Autoriser » (audit 0.321.0, H2) : arguments imbriqués, email entier, demande relue', () => {
  const app = chargerApplication();
  const d = app.descriptionActionYousign('yousign__add-signature-request-signer', { signature_request_id: 'abc', info: { first_name: 'Paul', last_name: 'DURAND', email: 'paul.durand@exemple-longue-adresse.fr' } }, '« Vente DURAND » (draft)');
  assert.match(d, /info\.email : paul\.durand@exemple-longue-adresse\.fr/);
  assert.match(d, /info\.first_name : Paul/);
  assert.match(d, /Demande : « Vente DURAND » \(draft\)/);
  assert.match(app.descriptionActionYousign('yousign__SEND-signature-request', {}), /ENVOYER/, 'casse indifférente');
  const resume = app.resumeDemandeYousign(JSON.stringify({ name: 'Vente DURAND', status: 'ongoing', signers: [{ info: { first_name: 'Paul', last_name: 'DURAND', email: 'paul@x.fr' } }, { info: { email: 'claire@y.fr' } }] }));
  assert.match(resume, /« Vente DURAND » \(ongoing\)/);
  assert.match(resume, /Paul DURAND <paul@x\.fr>/);
  assert.match(resume, /<claire@y\.fr>/);
  assert.match(app.resumeDemandeYousign('texte libre avec marie@z.fr dedans'), /<?marie@z\.fr/);
  assert.equal(app.resumeDemandeYousign(''), '');
});
