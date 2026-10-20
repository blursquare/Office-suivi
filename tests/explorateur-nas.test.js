'use strict';

// Explorateur du NAS côté poste (client/93-explorateur-nas.js) : les fonctions pures du chemin affiché et du nom retouché.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('filExplorateurNas : la racine du dossier du client puis chaque sous-dossier', () => {
  const app = chargerApplication();
  const fil = Array.from(app.filExplorateurNas('9 - AAE/Anciens', 'Dossier du client')).map(m => m.libelle + '=' + m.chemin);
  assert.deepEqual(fil, ['Dossier du client=', '9 - AAE=9 - AAE', 'Anciens=9 - AAE/Anciens']);
  assert.equal(app.filExplorateurNas('', 'X').length, 1);
});

test('nomSansExtensionNas : on retouche le nom, l’extension reste', () => {
  const app = chargerApplication();
  assert.deepEqual({ ...app.nomSansExtensionNas('Carte identité.pdf') }, { base: 'Carte identité', ext: '.pdf' });
  assert.deepEqual({ ...app.nomSansExtensionNas('sans extension') }, { base: 'sans extension', ext: '' });
  assert.deepEqual({ ...app.nomSansExtensionNas('.cache') }, { base: '.cache', ext: '' });
});
