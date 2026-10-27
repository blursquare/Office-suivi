'use strict';

// Avatar de CLAIRE en citrouille pour Halloween (étude 27/10 : « l'avatar de Claire en mode Halloween avec une citrouille à la place de l'étoile »).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const le = (annee, mois, jour) => new Date(annee, mois - 1, jour, 12);

test('Halloween : du 24 octobre au 2 novembre, pas avant ni après', () => {
  assert.equal(app.halloweenActif(le(2026, 10, 23)), false);
  assert.equal(app.halloweenActif(le(2026, 10, 24)), true);
  assert.equal(app.halloweenActif(le(2026, 10, 31)), true);
  assert.equal(app.halloweenActif(le(2026, 11, 1)), true);
  assert.equal(app.halloweenActif(le(2026, 11, 2)), true);
  assert.equal(app.halloweenActif(le(2026, 11, 3)), false);
  assert.equal(app.halloweenActif(le(2026, 9, 30)), false);
  assert.equal(app.halloweenActif(le(2027, 10, 31)), true);
});

test('seule l’icône « discussion » (l’avatar de CLAIRE) change de forme, et seulement pendant Halloween', () => {
  assert.equal(app.nomIconeDeSaison('discussion', le(2026, 10, 27)), 'discussion-halloween');
  assert.equal(app.nomIconeDeSaison('discussion', le(2026, 6, 1)), 'discussion');
  assert.equal(app.nomIconeDeSaison('etoile', le(2026, 10, 27)), 'etoile');
  assert.equal(app.nomIconeDeSaison('cloche', le(2026, 10, 31)), 'cloche');
});

test('la citrouille est dessinée aux couleurs des jetons, avec un masque propre à chaque copie', () => {
  const a = app.icone('discussion-halloween');
  const b = app.icone('discussion-halloween');
  assert.match(a, /fill:var\(--cat-orange\)/);
  assert.match(a, /fill:var\(--cat-olive\)/);
  assert.match(a, /fill:var\(--noir-fixe\)/);
  assert.ok(!/claire-discussions-cut/.test(a), 'le masque est renommé');
  const id = (s) => /mask id="(claire-discussions-\d+)"/.exec(s)[1];
  assert.notEqual(id(a), id(b));
  assert.ok(a.includes(`url(#${id(a)})`));
});
