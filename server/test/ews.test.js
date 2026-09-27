'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { interpreterReponseEws, testerConnexionExchange, corpsGetFolderCalendrier } = require('../src/exchange/ews');

test('succès EWS : ResponseClass Success + nom d\'agenda', () => {
  const corps = '<m:GetFolderResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode>'
    + '<m:Folders><t:CalendarFolder><t:DisplayName>Calendrier</t:DisplayName></t:CalendarFolder></m:Folders></m:GetFolderResponseMessage>';
  const r = interpreterReponseEws(200, corps);
  assert.equal(r.ok, true);
  assert.match(r.message, /Calendrier/);
});

test('401 : identifiants refusés, mention de la protection de connexion', () => {
  const r = interpreterReponseEws(401, '');
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'auth');
  assert.match(r.message, /refus/i);
});

test('200 mais erreur applicative : code EWS remonté', () => {
  const corps = '<m:GetFolderResponseMessage ResponseClass="Error"><m:ResponseCode>ErrorAccessDenied</m:ResponseCode></m:GetFolderResponseMessage>';
  const r = interpreterReponseEws(200, corps);
  assert.equal(r.ok, false);
  assert.match(r.message, /ErrorAccessDenied/);
});

test('500 sans corps EWS : erreur serveur', () => {
  const r = interpreterReponseEws(500, '<html>Bad Gateway</html>');
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'serveur');
});

test('le corps de la requête est du GetFolder en lecture seule sur le calendrier', () => {
  const c = corpsGetFolderCalendrier();
  assert.match(c, /GetFolder/);
  assert.match(c, /DistinguishedFolderId Id="calendar"/);
  assert.doesNotMatch(c, /CreateItem|CreateFolder|UpdateItem|DeleteItem/);
});

test('testerConnexionExchange : le mot de passe ne fuit jamais dans le résultat', async () => {
  const poster = (opts, cb) => cb(null, { statusCode: 401, body: '' });
  const r = await testerConnexionExchange({ url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'SECRET123' }, { poster });
  assert.equal(r.ok, false);
  assert.doesNotMatch(JSON.stringify(r), /SECRET123/);
});

test('testerConnexionExchange : erreur réseau → raison reseau, sans identifiants', async () => {
  const poster = (opts, cb) => cb(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
  const r = await testerConnexionExchange({ url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'SECRET123' }, { poster });
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'reseau');
  assert.doesNotMatch(JSON.stringify(r), /SECRET123|a@b\.fr/);
});

test('testerConnexionExchange : succès transmis', async () => {
  const poster = (opts, cb) => cb(null, { statusCode: 200, body: '<m:ResponseCode>NoError</m:ResponseCode>' });
  const r = await testerConnexionExchange({ url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'x' }, { poster });
  assert.equal(r.ok, true);
});
