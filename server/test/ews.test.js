'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  interpreterReponseEws, testerConnexionExchange, corpsGetFolderCalendrier,
  corpsCreateRendezVous, interpreterReponseCreation, creerRendezVousExchange, instantUtcDepuisParis,
  corpsCreateBrouillon, creerBrouillonExchange
} = require('../src/exchange/ews');

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

// --- Création de rendez-vous ---

test('instantUtcDepuisParis : heure d\'été (14:30 Paris CEST = 12:30 UTC)', () => {
  // Juillet : Paris est à UTC+2.
  const d = instantUtcDepuisParis('2026-07-14', '14:30');
  assert.equal(d.toISOString(), '2026-07-14T12:30:00.000Z');
});

test('instantUtcDepuisParis : heure d\'hiver (14:30 Paris CET = 13:30 UTC)', () => {
  // Décembre : Paris est à UTC+1.
  const d = instantUtcDepuisParis('2026-12-14', '14:30');
  assert.equal(d.toISOString(), '2026-12-14T13:30:00.000Z');
});

test('corpsCreateRendezVous : CreateItem sur le calendrier, sans invitation, fuseau Paris', () => {
  const c = corpsCreateRendezVous({ sujet: 'VTE - DUPONT', dateStr: '2026-07-14', heureStr: '14:30', dureeMinutes: 60, lieu: 'Étude', corps: 'Rendez-vous de signature' });
  assert.match(c, /CreateItem SendMeetingInvitations="SendToNone"/);
  assert.match(c, /DistinguishedFolderId Id="calendar"/);
  assert.match(c, /<t:CalendarItem>/);
  assert.match(c, /<t:Subject>VTE - DUPONT<\/t:Subject>/);
  assert.match(c, /<t:Start>2026-07-14T12:30:00Z<\/t:Start>/);
  assert.match(c, /<t:End>2026-07-14T13:30:00Z<\/t:End>/);
  assert.match(c, /Romance Standard Time/);
});

test('corpsCreateRendezVous : XML échappé dans l\'objet (pas d\'injection)', () => {
  const c = corpsCreateRendezVous({ sujet: 'VTE - A & B <x>', dateStr: '2026-07-14', heureStr: '09:00', dureeMinutes: 30 });
  assert.match(c, /VTE - A &amp; B &lt;x&gt;/);
  assert.doesNotMatch(c, /<x>/);
});

test('interpreterReponseCreation : succès + ItemId récupéré', () => {
  const corps = '<m:CreateItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode>'
    + '<m:Items><t:CalendarItem><t:ItemId Id="AAA123" ChangeKey="CK"/></t:CalendarItem></m:Items></m:CreateItemResponseMessage>';
  const r = interpreterReponseCreation(200, corps);
  assert.equal(r.ok, true);
  assert.equal(r.itemId, 'AAA123');
});

test('interpreterReponseCreation : 401 → auth', () => {
  const r = interpreterReponseCreation(401, '');
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'auth');
});

test('interpreterReponseCreation : erreur applicative → code EWS', () => {
  const corps = '<m:CreateItemResponseMessage ResponseClass="Error"><m:ResponseCode>ErrorImpersonateUserDenied</m:ResponseCode></m:CreateItemResponseMessage>';
  const r = interpreterReponseCreation(200, corps);
  assert.equal(r.ok, false);
  assert.match(r.message, /ErrorImpersonateUserDenied/);
});

test('creerRendezVousExchange : mot de passe jamais dans le résultat', async () => {
  const poster = (opts, cb) => cb(null, { statusCode: 200, body: '<m:ResponseCode>NoError</m:ResponseCode><t:ItemId Id="X"/>' });
  const r = await creerRendezVousExchange({
    url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'SECRET123',
    rendezVous: { sujet: 'VTE - X', dateStr: '2026-07-14', heureStr: '14:30', dureeMinutes: 60 }
  }, { poster });
  assert.equal(r.ok, true);
  assert.doesNotMatch(JSON.stringify(r), /SECRET123/);
});

// --- Brouillon avec pièce jointe ---

test('corpsCreateBrouillon : SaveOnly dans Brouillons, destinataire, pièce jointe, ordre schéma', () => {
  const c = corpsCreateBrouillon({
    destinataire: 'client@exemple.fr', sujet: 'Questionnaire', corps: 'Bonjour',
    pieces: [{ nom: 'questionnaire.pdf', type: 'application/pdf', contenuBase64: 'QUJD' }]
  });
  assert.match(c, /CreateItem MessageDisposition="SaveOnly"/);
  assert.match(c, /DistinguishedFolderId Id="drafts"/);
  assert.match(c, /<t:EmailAddress>client@exemple\.fr<\/t:EmailAddress>/);
  assert.match(c, /<t:FileAttachment>.*questionnaire\.pdf.*QUJD.*<\/t:FileAttachment>/s);
  // Attachments (élément de ItemType) doit précéder ToRecipients (élément de MessageType).
  assert.ok(c.indexOf('<t:Attachments>') < c.indexOf('<t:ToRecipients>'));
});

test('corpsCreateBrouillon : sans pièce, pas de bloc Attachments', () => {
  const c = corpsCreateBrouillon({ destinataire: 'a@b.fr', sujet: 'x', corps: 'y', pieces: [] });
  assert.doesNotMatch(c, /<t:Attachments>/);
});

test('corpsCreateBrouillon : objet et nom de pièce échappés', () => {
  const c = corpsCreateBrouillon({ destinataire: 'a@b.fr', sujet: 'A & B', corps: '', pieces: [{ nom: '<x>.pdf', contenuBase64: 'AA' }] });
  assert.match(c, /A &amp; B/);
  assert.match(c, /&lt;x&gt;\.pdf/);
});

test('interpreterReponseCreation : message de brouillon quand demandé', () => {
  const r = interpreterReponseCreation(200, '<m:ResponseCode>NoError</m:ResponseCode>', 'Brouillon créé.', 'La création du brouillon a échoué');
  assert.equal(r.ok, true);
  assert.match(r.message, /Brouillon/);
});

test('creerBrouillonExchange : mot de passe jamais dans le résultat', async () => {
  const poster = (opts, cb) => cb(null, { statusCode: 200, body: '<m:ResponseCode>NoError</m:ResponseCode>' });
  const r = await creerBrouillonExchange({
    url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'SECRET123',
    brouillon: { destinataire: 'c@d.fr', sujet: 'x', corps: 'y', pieces: [] }
  }, { poster });
  assert.equal(r.ok, true);
  assert.doesNotMatch(JSON.stringify(r), /SECRET123/);
});
