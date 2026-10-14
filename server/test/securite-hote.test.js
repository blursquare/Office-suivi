'use strict';

// Contrôle de l'adresse et de l'origine (audit 13/10, étude 14/10 : postes par IP et localhost).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { hoteAutorise, origineAutorisee, creerControleHote } = require('../src/securiteHote');

test('Host : adresses IP et localhost acceptés, un nom extérieur refusé sauf s’il est listé', () => {
  for (const h of ['192.168.60.10:3000', '192.168.60.10', 'localhost:3000', '127.0.0.1:3000', '[::1]:3000', '']) assert.equal(hoteAutorise(h), true, h);
  for (const h of ['attaquant.exemple:3000', 'claire.local', 'localhost.attaquant.exemple']) assert.equal(hoteAutorise(h), false, h);
  assert.equal(hoteAutorise('SRV-CLAIRE:3000', ['srv-claire']), true);
});

test('Origin d’une requête qui écrit : CLAIRE, l’extension, aucune origine — jamais une page extérieure', () => {
  assert.equal(origineAutorisee('', '192.168.60.10:3000'), true);
  assert.equal(origineAutorisee('http://192.168.60.10:3000', '192.168.60.10:3000'), true);
  assert.equal(origineAutorisee('http://localhost:3000', 'localhost:3000'), true);
  assert.equal(origineAutorisee('moz-extension://1234-abcd', '192.168.60.10:3000'), true);
  assert.equal(origineAutorisee('https://site-piege.exemple', '192.168.60.10:3000'), false);
  assert.equal(origineAutorisee('null', '192.168.60.10:3000'), false);
});

test('middleware : 421 sur un nom extérieur, 403 sur un POST venu d’ailleurs, sinon la requête passe', async () => {
  const app = express();
  app.use(creerControleHote({}));
  app.all('/x', (req, res) => res.send('ok'));
  const srv = app.listen(0);
  try {
    const base = `http://127.0.0.1:${srv.address().port}/x`;
    assert.equal((await fetch(base)).status, 200);
    const http = require('node:http');
    const statut = await new Promise((ok, ko) => http.get({ host: '127.0.0.1', port: srv.address().port, path: '/x', headers: { Host: 'piege.exemple' } }, (r) => { r.resume(); ok(r.statusCode); }).on('error', ko));
    assert.equal(statut, 421);
    assert.equal((await fetch(base, { method: 'POST', headers: { Origin: 'https://piege.exemple' } })).status, 403);
    assert.equal((await fetch(base, { method: 'POST' })).status, 200);
    assert.equal((await fetch(base, { method: 'POST', headers: { Origin: 'moz-extension://abc' } })).status, 200);
  } finally { srv.close(); }
});
