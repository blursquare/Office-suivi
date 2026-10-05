'use strict';

// Comptes Exchange des collaborateurs (voir src/comptesCollaborateurs.js) : stockage sans jamais renvoyer le mot de passe,
// disjoncteur sur refus, lecture des « Éléments envoyés » et envoi avec le compte du collaborateur. Aucun accès réseau :
// faux transport EWS, noms et mots de passe inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { ouvrirDb } = require('../src/db');
const { creerRepoParametres } = require('../src/parametresRepo');
const { creerApp } = require('../src/app');
const C = require('../src/comptesCollaborateurs');
const E = require('../src/emailsDossiers');
const X = require('../src/envoiEmailsExchange');

const env = (corps) => `<s:Envelope><s:Body>${corps}</s:Body></s:Envelope>`;
const msgFind = (id, objet, date, deNom, deAdr) => `<t:Message><t:ItemId Id="${id}" ChangeKey="x"/><t:Subject>${objet}</t:Subject>`
  + `<t:DateTimeReceived>${date}</t:DateTimeReceived><t:DateTimeSent>${date}</t:DateTimeSent><t:HasAttachments>false</t:HasAttachments>`
  + `<t:Preview>Bonjour</t:Preview><t:From><t:Mailbox><t:Name>${deNom}</t:Name><t:EmailAddress>${deAdr}</t:EmailAddress></t:Mailbox></t:From></t:Message>`;
const find = (msgs) => env(`<m:FindItemResponse><m:ResponseMessages><m:FindItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:RootFolder><t:Items>${msgs.join('')}</t:Items></m:RootFolder></m:FindItemResponseMessage></m:ResponseMessages></m:FindItemResponse>`);
const getItems = (items) => env(`<m:GetItemResponse><m:ResponseMessages>${items.map((i) => `<m:GetItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Items><t:Message><t:ItemId Id="${i.id}" ChangeKey="x"/>`
  + `<t:ToRecipients>${(i.a || []).map((a) => `<t:Mailbox><t:Name>x</t:Name><t:EmailAddress>${a}</t:EmailAddress></t:Mailbox>`).join('')}</t:ToRecipients></t:Message></m:Items></m:GetItemResponseMessage>`).join('')}</m:ResponseMessages></m:GetItemResponse>`);
const okCreate = (id, ck) => env(`<m:CreateItemResponse><m:ResponseMessages><m:CreateItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Items><t:Message><t:ItemId Id="${id}" ChangeKey="${ck}"/></t:Message></m:Items></m:CreateItemResponseMessage></m:ResponseMessages></m:CreateItemResponse>`);
const okSend = env('<m:SendItemResponse><m:ResponseMessages><m:SendItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode></m:SendItemResponseMessage></m:ResponseMessages></m:SendItemResponse>');
const okCalendrier = env('<m:GetFolderResponse><m:ResponseMessages><m:GetFolderResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode></m:GetFolderResponseMessage></m:ResponseMessages></m:GetFolderResponse>');

const MDP = 'Zx9-mot-de-passe-inventé';

function preparer() {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret-relie' });
  repo.ecrireReglages({ ...repo.lireReglages(), emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@office.fr', 'Julie VASSELIN': 'julie@office.fr' } });
  return { db, repo };
}

test('pur : assainissement, mot de passe gardé / remplacé / effacé, jamais dans la version publique', () => {
  const { db, repo } = preparer();
  try {
    assert.deepEqual(C.assainirComptes({ 'Inconnu X': { identifiant: 'a', motDePasse: 'b' }, 'Julie VASSELIN': { identifiant: '', motDePasse: '' } }), {});
    assert.equal(C.ecrireCompte(repo, 'Inconnu X', { identifiant: 'a' }).erreur, 'Collaborateur inconnu.');
    const r1 = C.ecrireCompte(repo, 'Julie VASSELIN', { identifiant: 'julie.v', motDePasse: MDP });
    assert.deepEqual(r1.compte, { identifiant: 'julie.v', motDePasseEnregistre: true, refuseLe: null });
    assert.ok(!JSON.stringify(r1).includes(MDP), 'le mot de passe ne sort jamais');
    // Mot de passe absent : conservé ; identifiant seul modifié.
    C.ecrireCompte(repo, 'Julie VASSELIN', { identifiant: 'julie.vasselin' });
    assert.equal(C.accesCollaborateur(repo, 'Julie VASSELIN', 'julie@office.fr').motDePasse, MDP);
    assert.equal(C.accesCollaborateur(repo, 'Julie VASSELIN', 'julie@office.fr').email, 'julie.vasselin');
    // Identifiant vide : l'adresse des Réglages sert.
    C.ecrireCompte(repo, 'Julie VASSELIN', { identifiant: '' });
    assert.equal(C.accesCollaborateur(repo, 'Julie VASSELIN', 'julie@office.fr').email, 'julie@office.fr');
    // Refus : retenu jusqu'à réécriture.
    C.marquerRefus(repo, 'Julie VASSELIN', Date.parse('2026-10-05T09:00:00Z'));
    assert.equal(C.accesCollaborateur(repo, 'Julie VASSELIN', 'julie@office.fr'), null);
    assert.equal(C.comptesPublics(C.lireComptes(repo))['Julie VASSELIN'].refuseLe, '2026-10-05T09:00:00.000Z');
    C.ecrireCompte(repo, 'Julie VASSELIN', { identifiant: '', motDePasse: 'nouveau' });
    assert.equal(C.lireComptes(repo)['Julie VASSELIN'].refuseLe, undefined, 'réécrire lève le disjoncteur');
    // Mot de passe vide explicite : effacé, plus d'accès.
    C.ecrireCompte(repo, 'Julie VASSELIN', { identifiant: '', motDePasse: '' });
    assert.equal(C.accesCollaborateur(repo, 'Julie VASSELIN', 'julie@office.fr'), null);
    assert.deepEqual(C.comptesPublics(C.lireComptes(repo)), {});
  } finally { db.close(); }
});

test('routes : jamais le mot de passe, tester lève ou pose le disjoncteur, un seul essai', async () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret-relie' });
  repo.ecrireReglages({ ...repo.lireReglages(), emailsResponsables: { 'Julie VASSELIN': 'julie@office.fr' } });
  const essais = [];
  let statut = 401;
  const poster = (o, cb) => { essais.push({ utilisateur: o.username, motDePasse: o.password }); cb(null, { statusCode: statut, body: statut === 200 ? okCalendrier : '' }); };
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' }, exchange: { poster } });
  const jeton = gestionnaireAuth.creerSession();
  const serveur = app.listen(0);
  await new Promise((resolve) => serveur.once('listening', resolve));
  const base = `http://127.0.0.1:${serveur.address().port}`;
  const appeler = (chemin, options) => fetch(base + chemin, { ...options, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' } });
  try {
    // La route lit le même dépôt de paramètres que le test (même base).
    const put = await appeler('/api/comptes-collaborateurs/Julie%20VASSELIN', { method: 'PUT', body: JSON.stringify({ identifiant: 'julie.v', motDePasse: MDP }) });
    const corpsPut = await put.text();
    assert.equal(put.status, 200);
    assert.ok(!corpsPut.includes(MDP));
    assert.equal(JSON.parse(corpsPut).motDePasseEnregistre, true);
    const liste = await (await appeler('/api/comptes-collaborateurs')).text();
    assert.ok(!liste.includes(MDP), 'la liste ne contient jamais le mot de passe');
    assert.equal((await appeler('/api/comptes-collaborateurs/Inconnu', { method: 'PUT', body: '{}' })).status, 404);
    // Refus d'Exchange : un seul essai, compte retenu.
    const t1 = await (await appeler('/api/comptes-collaborateurs/Julie%20VASSELIN/tester', { method: 'POST' })).json();
    assert.equal(t1.ok, false);
    assert.equal(essais.length, 1);
    assert.deepEqual(essais[0], { utilisateur: 'julie.v', motDePasse: MDP });
    const apres = await (await appeler('/api/comptes-collaborateurs')).json();
    assert.ok(apres['Julie VASSELIN'].refuseLe, 'refus retenu');
    // Succès : disjoncteur levé.
    statut = 200;
    const t2 = await (await appeler('/api/comptes-collaborateurs/Julie%20VASSELIN/tester', { method: 'POST' })).json();
    assert.equal(t2.ok, true);
    assert.equal((await (await appeler('/api/comptes-collaborateurs')).json())['Julie VASSELIN'].refuseLe, null);
    // Retrait.
    const del = await (await appeler('/api/comptes-collaborateurs/Julie%20VASSELIN', { method: 'DELETE' })).json();
    assert.equal(del.motDePasseEnregistre, false);
  } finally { serveur.close(); db.close(); }
});

test('lecture : les envoyés du collaborateur sont lus avec SON identifiant (sans accès délégué), refus = compte retenu sans casser le tour', async () => {
  const { db, repo } = preparer();
  const depot = { tousActifs: () => [{ id: 'd1', nom: 'MARTEL / FOURNIER', emailAcquereur: 'camille.fournier@exemple.fr', nasDossier: 'MARTEL' }] };
  try {
    C.ecrireCompte(repo, 'Julie VASSELIN', { identifiant: 'julie.v', motDePasse: MDP });
    const appels = [];
    let refuserJulie = false;
    const poster = (o, cb) => {
      appels.push({ u: o.username, b: o.body });
      if (o.username === 'julie.v' && refuserJulie) return cb(null, { statusCode: 401, body: '' });
      if (/FindItem/.test(o.body) && /Id="inbox"/.test(o.body)) return cb(null, { statusCode: 200, body: find([]) });
      if (/FindItem/.test(o.body) && /Id="sentitems"/.test(o.body)) {
        if (o.username === 'julie.v') return cb(null, { statusCode: 200, body: find([msgFind('S1', 'Questionnaire — MARTEL / FOURNIER', '2026-10-04T09:00:00Z', 'Julie', 'julie@office.fr')]) });
        return cb(null, { statusCode: 200, body: find([]) });
      }
      if (/GetItem/.test(o.body)) return cb(null, { statusCode: 200, body: getItems([{ id: 'S1', a: ['camille.fournier@exemple.fr'] }]) });
      cb(null, { statusCode: 500, body: '' });
    };
    const r = await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-05T08:00:00Z' }, true);
    assert.equal(r.ok, true);
    assert.equal(r.envoyes, 1);
    const envoyes = appels.filter((a) => /Id="sentitems"/.test(a.b));
    const celleDeJulie = envoyes.find((a) => a.u === 'julie.v');
    assert.ok(celleDeJulie, 'lu avec l’identifiant du collaborateur');
    assert.ok(!/EmailAddress>julie@office.fr/.test(celleDeJulie.b), 'sa propre boîte : aucun accès délégué demandé');
    assert.equal(E.lireEtat(repo).etat.envoyes['julie@office.fr'].statut, 'ok');
    // Refus d'Exchange : un seul essai, compte retenu, le tour continue sans erreur globale.
    refuserJulie = true;
    appels.length = 0;
    const r2 = await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-05T08:10:00Z' }, true);
    assert.equal(r2.erreur, null);
    assert.equal(appels.filter((a) => a.u === 'julie.v').length, 1, 'un seul essai');
    assert.equal(E.lireEtat(repo).etat.envoyes['julie@office.fr'].statut, 'refuse');
    assert.ok(C.lireComptes(repo)['Julie VASSELIN'].refuseLe);
    // Tour suivant : plus aucun essai avec ce compte (retour au compte relié / accès délégué).
    appels.length = 0;
    await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-05T08:20:00Z' }, true);
    assert.equal(appels.filter((a) => a.u === 'julie.v').length, 0);
  } finally { db.close(); }
});

test('envoi : l’email part de la boîte du collaborateur avec son identifiant, sans « From » ; refus d’identifiants → repli sur le compte relié', async () => {
  const { db, repo } = preparer();
  try {
    C.ecrireCompte(repo, 'Julie VASSELIN', { identifiant: 'julie.v', motDePasse: MDP });
    const appels = [];
    let refuserJulie = false;
    const poster = (o, cb) => {
      appels.push({ u: o.username, mdp: o.password, b: o.body });
      if (o.username === 'julie.v' && refuserJulie) return cb(null, { statusCode: 401, body: '' });
      const op = (o.body.match(/<m:(CreateItem|SendItem)\b/) || [])[1];
      cb(null, { statusCode: 200, body: op === 'SendItem' ? okSend : okCreate('BR1', 'CK1') });
    };
    const demande = { collaborateur: 'Julie VASSELIN', a: 'camille.fournier@exemple.fr', sujet: 'Relance', html: '<p>Bonjour</p>' };
    const r = await X.envoyerEmailExchange(repo, demande, { poster, maintenant: '2026-10-05T10:00:00Z' });
    assert.equal(r.ok, true);
    assert.equal(r.compteDedie, true);
    assert.equal(r.de, 'julie@office.fr');
    assert.equal(r.repli, false);
    assert.ok(appels.every((a) => a.u === 'julie.v' && a.mdp === MDP));
    assert.ok(!/<t:From>/.test(appels[0].b), 'aucun « Envoyer en tant que » : la boîte de connexion est la bonne');
    // Refus d'identifiants : un seul essai avec le compte, retenu ; l'email part du compte relié (repli).
    refuserJulie = true;
    appels.length = 0;
    const r2 = await X.envoyerEmailExchange(repo, demande, { poster, maintenant: '2026-10-05T10:05:00Z' });
    assert.equal(r2.ok, true);
    assert.equal(r2.repli, true);
    assert.equal(r2.compteDedie, false);
    assert.equal(appels.filter((a) => a.u === 'julie.v').length, 1, 'un seul essai avec le compte refusé');
    assert.ok(appels.some((a) => a.u === 'bastien@office.fr'));
    assert.ok(C.lireComptes(repo)['Julie VASSELIN'].refuseLe, 'compte retenu');
    // Ensuite : plus aucun essai avec ce compte.
    appels.length = 0;
    await X.envoyerEmailExchange(repo, demande, { poster, maintenant: '2026-10-05T10:10:00Z' });
    assert.equal(appels.filter((a) => a.u === 'julie.v').length, 0);
  } finally { db.close(); }
});

test('envoi : sans compte enregistré, rien ne change (compte relié + « Envoyer en tant que »)', async () => {
  const { db, repo } = preparer();
  try {
    const appels = [];
    const poster = (o, cb) => {
      appels.push({ u: o.username, b: o.body });
      const op = (o.body.match(/<m:(CreateItem|SendItem)\b/) || [])[1];
      cb(null, { statusCode: 200, body: op === 'SendItem' ? okSend : okCreate('BR1', 'CK1') });
    };
    const r = await X.envoyerEmailExchange(repo, { collaborateur: 'Julie VASSELIN', a: 'camille.fournier@exemple.fr', sujet: 'Relance', html: '<p>Bonjour</p>' }, { poster, maintenant: '2026-10-05T10:00:00Z' });
    assert.equal(r.ok, true);
    assert.equal(r.compteDedie, false);
    assert.ok(appels.every((a) => a.u === 'bastien@office.fr'));
    assert.match(appels[0].b, /<t:From><t:Mailbox><t:EmailAddress>julie@office.fr/);
  } finally { db.close(); }
});

test('rien ne sort : le mot de passe d’un collaborateur n’apparaît ni dans la version publique ni dans les réglages renvoyés', () => {
  const { db, repo } = preparer();
  try {
    C.ecrireCompte(repo, 'Julie VASSELIN', { identifiant: 'julie.v', motDePasse: MDP });
    assert.ok(!JSON.stringify(C.comptesPublics(C.lireComptes(repo))).includes(MDP));
    const reglages = JSON.stringify(repo.lireReglages());
    assert.ok(!reglages.includes(MDP), 'jamais mêlé aux réglages renvoyés par /api/reglages');
  } finally { db.close(); }
});
