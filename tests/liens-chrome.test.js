'use strict';

// Liens externes ouverts dans Chrome (étude 22/10, client/103-liens-chrome.js) : la part pure.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

test('lien externe : seulement une adresse http(s) d’un AUTRE site', () => {
  const app = chargerApplication();
  const o = 'http://192.168.1.10:3000';
  assert.equal(app.lienExternePourChrome('https://www.legifrance.gouv.fr/x?a=1#b', o), 'https://www.legifrance.gouv.fr/x?a=1#b');
  assert.equal(app.lienExternePourChrome('http://192.168.1.10:3000/api/nas/fichier?chemin=a', o), '', 'même adresse : reste dans CLAIRE');
  assert.equal(app.lienExternePourChrome('/api/nas/fichier', o), '', 'lien relatif');
  assert.equal(app.lienExternePourChrome('mailto:a@exemple.fr', o), '');
  assert.equal(app.lienExternePourChrome('tel:0102030405', o), '');
  assert.equal(app.lienExternePourChrome('javascript:alert(1)', o), '');
  assert.equal(app.lienExternePourChrome('claire-devant:abc', o), '');
  assert.equal(app.lienExternePourChrome('', o), '');
});
