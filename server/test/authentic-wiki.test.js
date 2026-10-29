// Mémoire du wiki d'Authentic pour Claude qui pilote (server/src/authentic/wiki.js, étude 29/10) : recherche sans IA, aucun nom de client dans les données.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/authentic/wiki');
const P = require('../src/authenticPilote');

test('le wiki répond sur Comedec papier et sur l’état hypothécaire', () => {
  assert.ok(W.nombrePassages > 100);
  const comedec = W.chercherWiki('commune non éligible Comedec demande papier création rapide', 3).map((x) => x.titre).join(' | ');
  assert.match(comedec, /Comedec/);
  assert.match(W.chercherWiki('réquisition état hypothécaire', 2).map((x) => x.titre).join(' | '), /Réquisitions|hypoth/i);
  assert.deepEqual(W.chercherWiki('', 3), []);
  assert.deepEqual(W.chercherWiki('zzzzqqq', 3), []);
});

test('le pilote a l’outil consulter_wiki et son aide-mémoire (APR, ECV, Fermer)', () => {
  assert.ok(P.OUTILS.some((o) => o.name === 'consulter_wiki'));
  assert.match(P.SYSTEME, /consulter_wiki/);
  assert.match(P.SYSTEME, /APR/);
});

test('une question sur Comedec rend un passage lisible (texte du wiki, aucun geste)', () => {
  const r = W.chercherWiki('Comedec création rapide', 1);
  assert.equal(r.length, 1);
  assert.ok(r[0].texte.length > 100);
});
