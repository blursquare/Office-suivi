'use strict';

// Résumé des emails du matin (voir src/emailsMatin.js). Aucun accès réseau : le transport EWS est
// remplacé par un faux `poster`. Emails, noms et adresses inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  debutFenetreEmails, corpsFindEmails, parseFindEmails, classerEmails, genererResumeEmails, resumeDu
} = require('../src/emailsMatin');
const { ouvrirDb } = require('../src/db');
const { creerRepoParametres } = require('../src/parametresRepo');

test('fenêtre : depuis 18 h (Paris) le jour ouvré précédent, le vendredi pour un lundi', () => {
  assert.equal(debutFenetreEmails('2026-10-06'), '2026-10-05T16:00:00.000Z'); // mardi → lundi 18 h (UTC+2)
  assert.equal(debutFenetreEmails('2026-10-05'), '2026-10-02T16:00:00.000Z'); // lundi → vendredi 18 h
  assert.equal(debutFenetreEmails('2026-11-03'), '2026-11-02T17:00:00.000Z'); // heure d'hiver (UTC+1)
});

test('requête EWS : boîte de réception, depuis la date donnée, lecture seule', () => {
  const corps = corpsFindEmails('2026-10-05T16:00:00.000Z');
  assert.match(corps, /<m:FindItem Traversal="Shallow">/);
  assert.match(corps, /DistinguishedFolderId Id="inbox"/);
  assert.match(corps, /Constant Value="2026-10-05T16:00:00.000Z"/);
  assert.doesNotMatch(corps, /UpdateItem|DeleteItem|CreateItem|MoveItem/);
});

const REPONSE = `<s:Envelope><s:Body><m:FindItemResponse><m:ResponseMessages><m:FindItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:RootFolder><t:Items>
<t:Message><t:ItemId Id="A" ChangeKey="1"/><t:Subject>Offre de prêt DUPONT &amp; fils</t:Subject><t:DateTimeReceived>2026-10-05T17:30:00Z</t:DateTimeReceived><t:HasAttachments>true</t:HasAttachments><t:Preview>Veuillez trouver l'offre</t:Preview><t:From><t:Mailbox><t:Name>Banque Exemple</t:Name><t:EmailAddress>credit@banque-exemple.fr</t:EmailAddress></t:Mailbox></t:From></t:Message>
<t:Message><t:ItemId Id="B" ChangeKey="2"/><t:Subject>Question</t:Subject><t:DateTimeReceived>2026-10-06T06:10:00Z</t:DateTimeReceived><t:HasAttachments>false</t:HasAttachments><t:Preview>Bonjour, pour la signature</t:Preview><t:From><t:Mailbox><t:Name>Paul MARTIN</t:Name><t:EmailAddress>Paul.Martin@exemple.fr</t:EmailAddress></t:Mailbox></t:From></t:Message>
<t:Message><t:ItemId Id="C" ChangeKey="3"/><t:Subject>Newsletter</t:Subject><t:DateTimeReceived>2026-10-06T06:30:00Z</t:DateTimeReceived><t:HasAttachments>false</t:HasAttachments><t:Preview>Les nouveautés</t:Preview><t:From><t:Mailbox><t:Name>Lettre</t:Name><t:EmailAddress>info@lettre.fr</t:EmailAddress></t:Mailbox></t:From></t:Message>
<t:Message><t:ItemId Id="D" ChangeKey="4"/><t:Subject>julie@etude.fr</t:Subject><t:DateTimeReceived>2026-10-06T06:40:00Z</t:DateTimeReceived><t:HasAttachments>false</t:HasAttachments><t:Preview>Rappel CLAIRE</t:Preview><t:From><t:Mailbox><t:Name>CLAIRE</t:Name><t:EmailAddress>claire.office@gmail.com</t:EmailAddress></t:Mailbox></t:From></t:Message>
</t:Items></m:RootFolder></m:FindItemResponseMessage></m:ResponseMessages></m:FindItemResponse></s:Body></s:Envelope>`;

test('lecture de la réponse : expéditeur, objet dés-échappé, heure, pièce jointe, aperçu', () => {
  const emails = parseFindEmails(REPONSE);
  assert.equal(emails.length, 4);
  assert.equal(emails[0].sujet, 'Offre de prêt DUPONT & fils');
  assert.equal(emails[0].deNom, 'Banque Exemple');
  assert.equal(emails[1].deAdresse, 'paul.martin@exemple.fr');
  assert.equal(emails[0].pj, true);
});

test('classement : par adresse du client, par nom du dossier dans l’objet, le reste à part ; jamais les copies de CLAIRE', () => {
  const dossiers = [
    { id: 'd1', nom: 'DUPONT / LEROY', responsable: 'Julie VASSELIN' },
    { id: 'd2', nom: 'BERNARD / MARTIN', responsable: 'Jérémy SAUJOT', emailAcquereur: 'paul.martin@exemple.fr' },
    { id: 'd3', nom: 'ARCHIVE / X', archive: true }
  ];
  const r = classerEmails(parseFindEmails(REPONSE), dossiers, ['claire.office@gmail.com']);
  const d1 = r.dossiers.find(g => g.dossierId === 'd1');
  const d2 = r.dossiers.find(g => g.dossierId === 'd2');
  assert.equal(d1.emails[0].sujet, 'Offre de prêt DUPONT & fils');
  assert.deepEqual(d1.emails[0].sujets, ['Offre de prêt']);
  assert.equal(d1.emails[0].heure, '19 h 30');
  assert.equal(d2.emails[0].de, 'Paul MARTIN');
  assert.ok(d2.emails[0].sujets.includes('Rendez-vous'));
  assert.equal(r.autres.map(e => e.sujet).join(','), 'Newsletter');
  // Le corps de l'email n'est jamais gardé.
  assert.ok(!JSON.stringify(r).includes('Veuillez trouver'));
});

test('résumé : une fois par jour ouvré, à partir de 8 h 50 (Paris)', () => {
  assert.equal(resumeDu(new Date('2026-10-06T06:49:00Z'), null), false); // 8 h 49
  assert.equal(resumeDu(new Date('2026-10-06T06:50:00Z'), null), true);  // 8 h 50
  assert.equal(resumeDu(new Date('2026-10-06T08:00:00Z'), { date: '2026-10-06' }), false);
  assert.equal(resumeDu(new Date('2026-10-10T08:00:00Z'), null), false); // samedi
});

test('génération : un essai, résultat enregistré ; identifiants refusés → erreur gardée pour la journée', async () => {
  const db = ouvrirDb(':memory:');
  try {
    const repo = creerRepoParametres(db);
    repo.ecrireReglagesExchange({ actif: true, email: 'bastien@office.fr', motDePasse: 'secret' });
    const depot = { tousActifs: () => [{ id: 'd2', nom: 'BERNARD / MARTIN', emailAcquereur: 'paul.martin@exemple.fr' }] };
    let appels = 0;
    const ok = await genererResumeEmails(depot, repo, new Date('2026-10-06T06:50:00Z'),
      { poster: (o, cb) => { appels++; cb(null, { statusCode: 200, body: REPONSE }); } });
    assert.equal(appels, 1);
    assert.equal(ok.date, '2026-10-06');
    assert.equal(ok.total, 4);
    assert.equal(repo.lireResumeEmails().dossiers[0].dossierId, 'd2');
    const refus = await genererResumeEmails(depot, repo, new Date('2026-10-07T06:50:00Z'),
      { poster: (o, cb) => cb(null, { statusCode: 401, body: '' }) });
    assert.match(refus.erreur, /Identifiants de messagerie refusés/);
    assert.doesNotMatch(JSON.stringify(repo.lireResumeEmails()), /secret/);
  } finally { db.close(); }
});
