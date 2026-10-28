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

test('la citrouille est dessinée souriante à contour brun, avec un masque propre à chaque copie', () => {
  const a = app.icone('discussion-halloween');
  const b = app.icone('discussion-halloween');
  assert.match(a, /fill="#F58A1F"/);
  assert.match(a, /stroke="#8A4310"/);
  assert.match(a, /fill="#F9A66B"/);
  assert.ok(!/claire-discussions-cut/.test(a), 'le masque est renommé');
  const id = (s) => /mask id="(claire-discussions-\d+)"/.exec(s)[1];
  assert.notEqual(id(a), id(b));
  assert.ok(a.includes(`url(#${id(a)})`));
});

test('appliquerSaison pose data-saison pendant Halloween et le retire ensuite', () => {
  const attributs = {};
  const racine = { setAttribute: (k, v) => { attributs[k] = v; }, removeAttribute: (k) => { delete attributs[k]; } };
  const avant = app.document.documentElement;
  app.document.documentElement = racine;
  try {
    app.appliquerSaison(le(2026, 10, 27));
    assert.equal(attributs['data-saison'], 'halloween');
    app.appliquerSaison(le(2026, 11, 3));
    assert.equal(attributs['data-saison'], undefined, 'le 3 novembre le décor est retiré');
    app.appliquerSaison(le(2026, 10, 24));
    assert.equal(attributs['data-saison'], 'halloween');
  } finally { app.document.documentElement = avant; }
});
