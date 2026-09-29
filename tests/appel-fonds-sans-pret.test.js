'use strict';
// Appel de fonds : dernière phrase du paragraphe du R.I.B. selon le financement (texte de l'étude,
// 29/09, mot pour mot pour l'achat sans prêt).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('phraseDeblocageAppelFonds : sans prêt, texte de l’étude ; avec prêt, déblocage du prêt et apport', () => {
  const app = chargerApplication();
  assert.equal(app.phraseDeblocageAppelFonds(true),
    'Je vous invite à vous rapprocher de votre établissement bancaire afin de faire le point sur le déblocage, correspondant à votre apport personnel.');
  assert.match(app.phraseDeblocageAppelFonds(false), /déblocage de votre prêt \(total ou partiel si vous financez des travaux\)/);
});
