'use strict';

// Rangement d'emails dans le dossier Outlook « Traiter à distance » (étude 19/10, voir src/rangementOutlook.js) :
// règles, dossier retrouvé par son nom, déplacement par MoveItem, rien de déplacé sans dossier ni hors des règles,
// refus retenus 6 h. Aucun accès réseau : faux transport EWS, adresses inventées.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirDb } = require('../src/db');
const { creerRepoParametres } = require('../src/parametresRepo');
const R = require('../src/rangementOutlook');
const { reinitialiserDisjoncteurAgenda } = require('../src/agendaWatch');

const env = (corps) => `<s:Envelope><s:Body>${corps}</s:Body></s:Envelope>`;
const dossiers = (liste) => env(`<m:FindFolderResponse><m:ResponseMessages><m:FindFolderResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:RootFolder><t:Folders>${liste.map(([id, nom]) => `<t:Folder><t:FolderId Id="${id}" ChangeKey="c"/><t:DisplayName>${nom}</t:DisplayName></t:Folder>`).join('')}</t:Folders></m:RootFolder></m:FindFolderResponseMessage></m:ResponseMessages></m:FindFolderResponse>`);
const msg = (id, objet, de) => `<t:Message><t:ItemId Id="${id}" ChangeKey="x"/><t:Subject>${objet}</t:Subject><t:From><t:Mailbox><t:Name>x</t:Name><t:EmailAddress>${de}</t:EmailAddress></t:Mailbox></t:From></t:Message>`;
const find = (msgs) => env(`<m:FindItemResponse><m:ResponseMessages><m:FindItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:RootFolder><t:Items>${msgs.join('')}</t:Items></m:RootFolder></m:FindItemResponseMessage></m:ResponseMessages></m:FindItemResponse>`);
const deplace = (classes) => env(`<m:MoveItemResponse><m:ResponseMessages>${classes.map((c) => `<m:MoveItemResponseMessage ResponseClass="${c}"><m:ResponseCode>${c === 'Success' ? 'NoError' : 'ErrorAccessDenied'}</m:ResponseCode></m:MoveItemResponseMessage>`).join('')}</m:ResponseMessages></m:MoveItemResponse>`);

function preparer() {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret' });
  return repo;
}

// Faux transport : répond selon la requête et garde les corps envoyés.
function transport(reponses) {
  const corps = [];
  const poster = (o, cb) => {
    corps.push(o.body);
    const cle = /FindFolder/.test(o.body) ? 'dossiers' : /MoveItem/.test(o.body) ? 'deplace' : 'find';
    cb(null, { statusCode: 200, body: reponses[cle] });
  };
  return { poster, corps };
}

beforeEach(() => { R.oublierDossierRangement(); reinitialiserDisjoncteurAgenda(); });

test('pur : les deux règles de l’étude, rien d’autre', () => {
  assert.equal(R.regleRangementPourEmail({ objet: 'Facture Dossier FIDJI n° 2026-123', de: 'spf.blois@dgfip.finances.gouv.fr' }).id, 'spf-facture-fidji');
  assert.equal(R.regleRangementPourEmail({ objet: 'TR: facture  dossier fidji', de: 'x@y.fr' }).id, 'spf-facture-fidji');
  assert.equal(R.regleRangementPourEmail({ objet: 'Message mis en quarantaine', de: 'Quarantaine@Notaires.fr' }).id, 'quarantaine-notaires');
  assert.equal(R.regleRangementPourEmail({ objet: 'Facture', de: 'spf.blois@dgfip.finances.gouv.fr' }), null);
  assert.equal(R.regleRangementPourEmail({ objet: 'Dossier FIDJI', de: 'x@y.fr' }), null);
  assert.equal(R.regleRangementPourEmail({ objet: 'Bonjour', de: 'quarantaine@notaires.fr.exemple.com' }), null);
  assert.equal(R.regleRangementPourEmail({ objet: 'RE: quarantaine@notaires.fr', de: 'client@exemple.fr' }), null);
});

test('pur : dossier « Traiter à distance » retrouvé sans tenir compte des accents ni de la casse ; absent ou double → rien', () => {
  assert.equal(R.dossierRangementParmi([{ id: 'a', nom: 'Boîte de réception' }, { id: 'b', nom: 'TRAITER A DISTANCE' }]), 'b');
  assert.equal(R.dossierRangementParmi([{ id: 'a', nom: 'Traiter' }]), '');
  assert.equal(R.dossierRangementParmi([{ id: 'a', nom: 'Traiter à distance' }, { id: 'b', nom: 'traiter à  distance' }]), 'double');
  assert.equal(R.parseFindFolders(dossiers([['F1', 'Traiter à distance']]))[0].id, 'F1');
});

test('tour : seuls les emails des règles sont déplacés dans le dossier, compteurs par règle', async () => {
  const repo = preparer();
  const t = transport({
    dossiers: dossiers([['INBOX', 'Boîte de réception'], ['TAD', 'Traiter à distance']]),
    find: find([msg('m1', 'Facture Dossier FIDJI 2026-0042', 'spf@dgfip.finances.gouv.fr'), msg('m2', 'Offre de prêt', 'banque@exemple.fr'), msg('m3', 'Quarantaine', 'quarantaine@notaires.fr')]),
    deplace: deplace(['Success', 'Success'])
  });
  const r = await R.executerTourRangement(repo, { poster: t.poster }, true);
  assert.equal(r.ok, true);
  assert.equal(r.ranges, 2);
  const move = t.corps.find((c) => /MoveItem/.test(c));
  assert.match(move, /<t:FolderId Id="TAD"\/>/);
  assert.match(move, /Id="m1"/);
  assert.match(move, /Id="m3"/);
  assert.doesNotMatch(move, /Id="m2"/);
  assert.equal(t.corps.some((c) => /HardDelete|DeleteItem|item:Body/.test(c)), false);
  const etat = R.lireEtatRangement(repo);
  assert.equal(etat.ranges['spf-facture-fidji'], 1);
  assert.equal(etat.ranges['quarantaine-notaires'], 1);
  assert.equal(etat.statut, 'ok');
});

test('tour : sans dossier « Traiter à distance », rien n’est déplacé et l’état le dit', async () => {
  const repo = preparer();
  const t = transport({ dossiers: dossiers([['INBOX', 'Boîte de réception']]), find: find([msg('m1', 'Facture Dossier FIDJI', 'spf@dgfip.finances.gouv.fr')]), deplace: deplace(['Success']) });
  const r = await R.executerTourRangement(repo, { poster: t.poster }, true);
  assert.equal(r.ranges, 0);
  assert.equal(t.corps.some((c) => /MoveItem/.test(c)), false);
  assert.equal(R.lireEtatRangement(repo).statut, 'introuvable');
});

test('tour : déplacement refusé retenu 6 h, puis retenté ; rangement coupé = aucun appel', async () => {
  const repo = preparer();
  const reponses = { dossiers: dossiers([['TAD', 'Traiter à distance']]), find: find([msg('m1', 'Facture Dossier FIDJI', 'spf@dgfip.finances.gouv.fr')]), deplace: deplace(['Error']) };
  let t = transport(reponses);
  await R.executerTourRangement(repo, { poster: t.poster, maintenant: '2026-10-19T08:00:00Z' }, true);
  assert.equal(R.lireEtatRangement(repo).statut, 'erreur');
  t = transport(reponses);
  await R.executerTourRangement(repo, { poster: t.poster, maintenant: '2026-10-19T09:00:00Z' }, true);
  assert.equal(t.corps.some((c) => /MoveItem/.test(c)), false);
  t = transport({ ...reponses, deplace: deplace(['Success']) });
  const r = await R.executerTourRangement(repo, { poster: t.poster, maintenant: '2026-10-19T15:00:00Z' }, true);
  assert.equal(r.ranges, 1);
  const etat = R.lireEtatRangement(repo);
  etat.actif = false;
  R.ecrireEtatRangement(repo, etat);
  t = transport(reponses);
  await R.executerTourRangement(repo, { poster: t.poster }, true);
  assert.equal(t.corps.length, 0);
});

test('tour : identifiants refusés → disjoncteur de l’agenda, rien de déplacé', async () => {
  const repo = preparer();
  const corps = [];
  const r = await R.executerTourRangement(repo, { poster: (o, cb) => { corps.push(o.body); cb(null, { statusCode: 401, body: '' }); } }, true);
  assert.match(r.erreur, /refusés/);
  assert.equal(corps.some((c) => /MoveItem/.test(c)), false);
  const { lectureAgendaSuspendue } = require('../src/agendaWatch');
  assert.equal(lectureAgendaSuspendue(repo.lireReglagesExchange()), true);
});
