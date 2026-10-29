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

test('captures du wiki : la section Comedec est trouvée et l’image est lue en direct sur ce site seul', async () => {
  assert.ok(W.nombreCaptures > 1000);
  const c = W.chercherCaptures('Comedec création rapide envoi immédiat', 1);
  assert.equal(c.length, 1);
  assert.match(c[0].images[0], /^\/.+\.(png|jpe?g)$/i);
  const lu = [];
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('DATA')]);
  const bloc = await W.chargerCapture(c[0].images[0], async (url) => { lu.push(url); return { statut: 200, octets: png }; });
  assert.equal(bloc.type, 'image');
  assert.equal(bloc.source.data, png.toString('base64'));
  assert.equal(bloc.source.media_type, 'image/png');
  assert.equal(await W.chargerCapture('/a/b.png', async () => ({ statut: 200, octets: Buffer.from('<html>pas une image</html>') })), null, 'le contenu décide, pas l’extension');
  assert.match(lu[0], /^https:\/\/wiki-authentic\.fichorga\.fr\//);
  // Refus : autre hôte, remontée de dossier, mauvaise extension, trop gros, erreur réseau.
  assert.equal(await W.chargerCapture('//autre.exemple/x.png', async () => ({ statut: 200, octets: Buffer.from('x') })), null);
  assert.equal(await W.chargerCapture('/a/../b.png', async () => ({ statut: 200, octets: Buffer.from('x') })), null);
  assert.equal(await W.chargerCapture('/a/b.svg', async () => ({ statut: 200, octets: Buffer.from('x') })), null);
  assert.equal(await W.chargerCapture('/a/b.png', async () => ({ statut: 200, octets: Buffer.alloc(900000, 1) })), null);
  assert.equal(await W.chargerCapture('/a/b.png', async () => { throw new Error('réseau'); }), null);
  assert.equal(await W.chargerCapture('/a/b.png', async () => ({ statut: 404, octets: Buffer.from('x') })), null);
});
