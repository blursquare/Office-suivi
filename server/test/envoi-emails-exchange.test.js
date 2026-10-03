'use strict';

// Envoi d'un email depuis CLAIRE (voir src/envoiEmailsExchange.js) : brouillon puis envoi par EWS, réponse dans
// le fil, boîte du collaborateur (« Envoyer en tant que ») avec repli sur le compte relié, proposition de réponse
// par l'IA locale. Aucun accès réseau : faux transport EWS, faux Ollama, noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { ouvrirDb } = require('../src/db');
const { creerRepoParametres } = require('../src/parametresRepo');
const X = require('../src/envoiEmailsExchange');
const E = require('../src/emailsDossiers');
const agendaWatch = require('../src/agendaWatch');

const env = (corps) => `<s:Envelope><s:Body>${corps}</s:Body></s:Envelope>`;
const okCreate = (id, ck) => env(`<m:CreateItemResponse><m:ResponseMessages><m:CreateItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Items><t:Message><t:ItemId Id="${id}" ChangeKey="${ck}"/></t:Message></m:Items></m:CreateItemResponseMessage></m:ResponseMessages></m:CreateItemResponse>`);
const okAttach = (ck) => env(`<m:CreateAttachmentResponse><m:ResponseMessages><m:CreateAttachmentResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Attachments><t:FileAttachment><t:AttachmentId Id="AT1" RootItemId="BR1" RootItemChangeKey="${ck}"/></t:FileAttachment></m:Attachments></m:CreateAttachmentResponseMessage></m:ResponseMessages></m:CreateAttachmentResponse>`);
const okSend = env('<m:SendItemResponse><m:ResponseMessages><m:SendItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode></m:SendItemResponseMessage></m:ResponseMessages></m:SendItemResponse>');
const erreur = (op, code) => env(`<m:${op}Response><m:ResponseMessages><m:${op}ResponseMessage ResponseClass="Error"><m:MessageText>x</m:MessageText><m:ResponseCode>${code}</m:ResponseCode></m:${op}ResponseMessage></m:ResponseMessages></m:${op}Response>`);
const okDelete = env('<m:DeleteItemResponse><m:ResponseMessages><m:DeleteItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode></m:DeleteItemResponseMessage></m:ResponseMessages></m:DeleteItemResponse>');

function preparer() {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret' });
  repo.ecrireReglages({ ...repo.lireReglages(), emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@office.fr', 'Julie VASSELIN': 'julie@office.fr' } });
  E.ecrireEtat(repo, { emails: [{ id: 'e1', itemId: 'IN9', dossierId: 'd1', sens: 'recu', date: '2026-10-03T08:00:00Z', de: { nom: 'Camille FOURNIER', adresse: 'camille.fournier@exemple.fr' }, a: ['bastien@office.fr'], objet: 'Mon RIB', pj: [{ id: 'P1', nom: 'RIB.pdf', taille: 1000 }] }] });
  return { db, repo };
}

// Faux Exchange qui répond selon l'opération demandée et garde chaque corps envoyé.
function fauxExchange(reponses) {
  const corps = [];
  const poster = (o, cb) => {
    corps.push(o.body);
    const op = (o.body.match(/<m:(CreateItem|CreateAttachment|SendItem|DeleteItem|GetItem)\b/) || [])[1];
    const r = reponses[op];
    const suite = Array.isArray(r) ? r.shift() : r;
    cb(null, { statusCode: 200, body: typeof suite === 'function' ? suite(o.body) : suite });
  };
  return { poster, corps };
}

test('pur : adresses lues dans un champ libre, corps EWS dans l’ordre du schéma', () => {
  assert.equal(X.adressesDepuisTexte('Camille <Camille.F@exemple.fr>; b@y.fr, b@y.fr, pas-une-adresse').join(), 'camille.f@exemple.fr,b@y.fr');
  const n = X.corpsBrouillonNouveau({ a: ['a@x.fr'], cc: ['c@x.fr'], sujet: 'Relance — VTE', html: '<p>Bonjour & merci</p>', de: 'julie@office.fr',
    pieces: [{ nom: 'logo.png', type: 'image/png', contentId: 'logo1', contenuBase64: 'AAAA' }, { nom: 'Questionnaire.pdf', type: 'application/pdf', contenuBase64: 'QkJC' }] });
  assert.match(n, /MessageDisposition="SaveOnly"/);
  assert.match(n, /<t:Body BodyType="HTML">&lt;p&gt;Bonjour &amp; merci&lt;\/p&gt;<\/t:Body>/);
  assert.match(n, /<t:ContentId>logo1<\/t:ContentId><t:IsInline>true<\/t:IsInline>/);
  assert.match(n, /<t:Name>Questionnaire.pdf<\/t:Name><t:ContentType>application\/pdf<\/t:ContentType><t:IsInline>false<\/t:IsInline>/);
  assert.ok(n.indexOf('<t:Attachments>') < n.indexOf('<t:ToRecipients>') && n.indexOf('<t:CcRecipients>') < n.indexOf('<t:From>'));
  const r = X.corpsBrouillonReponse({ itemId: 'IN9', a: ['camille@x.fr'], html: '<p>Merci</p>', tous: false });
  assert.match(r, /<t:ReplyToItem><t:ToRecipients>.*<t:ReferenceItemId Id="IN9"\/><t:NewBodyContent BodyType="HTML">/);
  assert.match(X.corpsBrouillonReponse({ itemId: 'IN9', html: '', tous: true }), /<t:ReplyAllToItem>/);
  assert.match(X.corpsEnvoiBrouillon({ itemId: 'BR1', changeKey: 'CK2' }), /<m:SendItem SaveItemToFolder="true">.*ChangeKey="CK2".*Id="sentitems"/);
  assert.equal(X.changeKeyApresPieces(okAttach('CK9')), 'CK9');
  assert.equal(X.idBrouillon(okCreate('BR1', 'CK1')).changeKey, 'CK1');
});

test('nouvel email : brouillon dans la boîte de Julie puis envoi, droit « Envoyer en tant que » retenu', async () => {
  const { repo } = preparer();
  const f = fauxExchange({ CreateItem: okCreate('BR1', 'CK1'), SendItem: okSend });
  const r = await X.envoyerEmailExchange(repo, { collaborateur: 'Julie VASSELIN', a: 'camille.fournier@exemple.fr', sujet: 'Relance', html: '<p>Bonjour</p>',
    pieces: [{ nom: 'Questionnaire.pdf', type: 'application/pdf', contenuBase64: 'QkJC' }] }, { poster: f.poster, maintenant: '2026-10-03T10:00:00Z' });
  assert.equal(r.ok, true);
  assert.equal(r.de, 'julie@office.fr');
  assert.equal(r.repli, false);
  assert.equal(f.corps.length, 2);
  assert.match(f.corps[0], /<t:From><t:Mailbox><t:EmailAddress>julie@office.fr/);
  assert.match(f.corps[1], /<t:ItemId Id="BR1" ChangeKey="CK1"\/>/);
  assert.ok(X.lireEtatEnvoi(repo).enTantQueReussi['julie@office.fr']);
});

test('« Envoyer en tant que » refusé : brouillon retiré, email parti du compte relié, refus retenu 7 jours', async () => {
  const { repo } = preparer();
  const f = fauxExchange({ CreateItem: [okCreate('BR1', 'CK1'), okCreate('BR2', 'CK2')], SendItem: [erreur('SendItem', 'ErrorSendAsDenied'), okSend], DeleteItem: okDelete });
  const r = await X.envoyerEmailExchange(repo, { collaborateur: 'Julie VASSELIN', a: 'a@x.fr', sujet: 'Relance', html: '<p>x</p>' }, { poster: f.poster, maintenant: '2026-10-03T10:00:00Z' });
  assert.equal(r.ok, true);
  assert.equal(r.repli, true);
  assert.equal(r.de, 'bastien@office.fr');
  assert.match(f.corps[2], /DeleteType="MoveToDeletedItems".*Id="BR1"/);
  assert.doesNotMatch(f.corps[3], /<t:From>/);
  // Envoi suivant dans la semaine : directement depuis le compte relié, sans nouvel essai.
  const g = fauxExchange({ CreateItem: okCreate('BR3', 'CK3'), SendItem: okSend });
  const r2 = await X.envoyerEmailExchange(repo, { collaborateur: 'Julie VASSELIN', a: 'a@x.fr', sujet: 'Relance', html: '<p>x</p>' }, { poster: g.poster, maintenant: '2026-10-05T10:00:00Z' });
  assert.equal(r2.repli, true);
  assert.doesNotMatch(g.corps[0], /<t:From>/);
  // Après 7 jours, l'essai revient.
  const h = fauxExchange({ CreateItem: okCreate('BR4', 'CK4'), SendItem: okSend });
  await X.envoyerEmailExchange(repo, { collaborateur: 'Julie VASSELIN', a: 'a@x.fr', sujet: 'Relance', html: '<p>x</p>' }, { poster: h.poster, maintenant: '2026-10-11T10:00:00Z' });
  assert.match(h.corps[0], /<t:From>/);
});

test('envoi interrompu : l’email reste dans les Brouillons, jamais renvoyé ; identifiants refusés = disjoncteur', async () => {
  const { repo } = preparer();
  const f = fauxExchange({ CreateItem: okCreate('BR1', 'CK1'), SendItem: erreur('SendItem', 'ErrorMessageSizeExceeded') });
  const r = await X.envoyerEmailExchange(repo, { collaborateur: 'Bastien ANGLUMENT', a: 'a@x.fr', sujet: 'Relance', html: '<p>x</p>' }, { poster: f.poster });
  assert.equal(r.ok, false);
  assert.equal(r.brouillonLaisse, true);
  assert.match(r.message, /trop lourd/);
  assert.equal(f.corps.length, 2);
  const refus = await X.envoyerEmailExchange(repo, { collaborateur: 'Bastien ANGLUMENT', a: 'a@x.fr', sujet: 'Relance', html: '<p>x</p>' }, { poster: (o, cb) => cb(null, { statusCode: 401, body: '' }) });
  assert.equal(refus.ok, false);
  assert.equal(agendaWatch.lectureAgendaSuspendue(repo.lireReglagesExchange()), true);
  const bloque = await X.envoyerEmailExchange(repo, { collaborateur: 'Bastien ANGLUMENT', a: 'a@x.fr', sujet: 'Relance', html: '<p>x</p>' }, { poster: () => { throw new Error('ne doit pas être appelé'); } });
  assert.match(bloque.message, /refusés/);
  agendaWatch.signalerIdentifiantsRefuses({});
});

test('route : réponse dans le fil avec pièce jointe, notée envoyée ; proposition de l’IA locale', async () => {
  const { creerApp } = require('../src/app');
  const db = ouvrirDb(':memory:');
  const f = fauxExchange({
    CreateItem: okCreate('BR1', 'CK1'), CreateAttachment: okAttach('CK2'), SendItem: okSend,
    GetItem: env('<m:GetItemResponse><m:ResponseMessages><m:GetItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Items><t:Message><t:ItemId Id="IN9" ChangeKey="x"/><t:Body BodyType="Text">Bonjour, voici mon RIB. Camille</t:Body><t:ToRecipients/></t:Message></m:Items></m:GetItemResponseMessage></m:ResponseMessages></m:GetItemResponse>')
  });
  const prompts = [];
  const ollama = { verifierDisponibilite: async () => ({ disponible: true }), genererJson: async (p) => { prompts.push(p); return { reponse: 'Madame, Monsieur,\nNous accusons réception de votre RIB.\nBien cordialement,' }; } };
  const { app, parametresRepo: repo } = creerApp({ db, config: { authActive: false, racineRepo: os.tmpdir(), estSea: () => false }, emailsDossiers: { poster: f.poster, ollama } });
  repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret' });
  repo.ecrireReglages({ ...repo.lireReglages(), emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@office.fr' } });
  E.ecrireEtat(repo, { emails: [{ id: 'e1', itemId: 'IN9', dossierId: 'd1', sens: 'recu', date: '2026-10-03T08:00:00Z', de: { nom: 'Camille FOURNIER', adresse: 'camille.fournier@exemple.fr' }, a: [], objet: 'Mon RIB', pj: [{ id: 'P1', nom: 'RIB.pdf', taille: 1000 }] }] });
  const serveur = app.listen(0);
  try {
    await new Promise((r) => serveur.once('listening', r));
    const base = `http://127.0.0.1:${serveur.address().port}`;
    const prop = await (await fetch(`${base}/api/emails-dossiers/proposition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailId: 'e1', dossier: 'VTE - MARTEL / FOURNIER', confrere: false }) })).json();
    assert.match(prop.reponse, /accusons réception/);
    assert.match(prompts[0], /voici mon RIB/);
    assert.match(prompts[0], /RIB\.pdf/);
    assert.match(prompts[0], /N’invente aucune date/);
    const r = await fetch(`${base}/api/emails/envoyer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      dossierId: 'd1', geste: 'reponse:e1', collaborateur: 'Bastien ANGLUMENT', a: 'camille.fournier@exemple.fr', sujet: 'RE: Mon RIB', html: '<p>Merci</p>',
      images: [{ nom: 'logo.png', type: 'image/png', contentId: 'logo1', contenuBase64: 'AAAA' }], reponseA: { emailId: 'e1' }
    }) });
    const corps = await r.json();
    assert.equal(corps.ok, true);
    assert.match(f.corps.find((c) => /CreateItem/.test(c)), /<t:ReplyToItem>.*ReferenceItemId Id="IN9"/);
    assert.match(f.corps.find((c) => /CreateAttachment/.test(c)), /ParentItemId Id="BR1" ChangeKey="CK1".*<t:ContentId>logo1/);
    assert.match(f.corps.find((c) => /SendItem/.test(c)), /ChangeKey="CK2"/);
    const vue = await (await fetch(`${base}/api/emails-dossiers?dossierId=d1`)).json();
    assert.equal(vue.prepares[0].geste, 'reponse:e1');
    assert.ok(vue.prepares[0].envoyeLe);
    const inconnu = await fetch(`${base}/api/emails/envoyer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dossierId: 'd1', a: 'a@x.fr', sujet: 'x', reponseA: { emailId: 'zz' } }) });
    assert.equal(inconnu.status, 404);
  } finally { serveur.close(); }
});
