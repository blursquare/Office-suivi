'use strict';

// Explorateur du NAS côté poste (client/93-explorateur-nas.js) : les fonctions pures du chemin affiché et du nom retouché.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('destinationGlisseExplorateurNas : déposer dans son propre dossier ne déplace rien', () => {
  const app = chargerApplication();
  assert.equal(app.destinationGlisseExplorateurNas('Carte.pdf', ''), null);
  assert.equal(app.destinationGlisseExplorateurNas('Carte.pdf', '2 - Acquereur'), '2 - Acquereur');
  assert.equal(app.destinationGlisseExplorateurNas('1 - Vendeur/Carte.pdf', '1 - Vendeur'), null);
  assert.equal(app.destinationGlisseExplorateurNas('1 - Vendeur/Carte.pdf', ''), '');
  assert.equal(app.destinationGlisseExplorateurNas('9 - AAE/Anciens/x.pdf', '9 - AAE'), '9 - AAE');
});

test('arbre : un dossier déplié montre son contenu en retrait, un fichier est glissable', () => {
  const app = chargerApplication();
  app.explorateurNas = app.etatVideExplorateurNas('d1');
  app.explorateurNas.niveaux[''] = { dossiers: [{ nom: '1 - Vendeur' }, { nom: '2 - Acquereur' }], fichiers: [{ nom: 'Plan.pdf', taille: 10 }] };
  app.explorateurNas.niveaux['1 - Vendeur'] = { dossiers: [], fichiers: [{ nom: 'CNI <b>.pdf', taille: 5 }] };
  let html = app.lignesNiveauExplorateurNas('');
  assert.ok(!html.includes('CNI'));
  assert.match(html, /data-dossier="1 - Vendeur"[^>]*aria-expanded="false"/);
  assert.match(html, /draggable="true" data-fichier="Plan.pdf"/);
  app.explorateurNas.ouverts.add('1 - Vendeur');
  html = app.lignesNiveauExplorateurNas('');
  assert.match(html, /--niv:1[^>]*draggable="true" data-fichier="1 - Vendeur\/CNI &lt;b&gt;\.pdf"|data-fichier="1 - Vendeur\/CNI &lt;b&gt;.pdf"/);
  assert.ok(!html.includes('<b>'));
});

test('nomSansExtensionNas : on retouche le nom, l’extension reste', () => {
  const app = chargerApplication();
  assert.deepEqual({ ...app.nomSansExtensionNas('Carte identité.pdf') }, { base: 'Carte identité', ext: '.pdf' });
  assert.deepEqual({ ...app.nomSansExtensionNas('sans extension') }, { base: 'sans extension', ext: '' });
  assert.deepEqual({ ...app.nomSansExtensionNas('.cache') }, { base: '.cache', ext: '' });
});
