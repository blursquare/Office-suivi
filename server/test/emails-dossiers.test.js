'use strict';

// Emails des dossiers (voir src/emailsDossiers.js) : boîte de réception relue (texte jamais gardé, résumé
// par l'IA locale), « Éléments envoyés » de chaque collaborateur (accès refusé signalé), emails préparés
// confirmés, pièce jointe rangée sur le NAS. Aucun accès réseau : faux transport EWS, noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { ouvrirDb } = require('../src/db');
const { creerRepoParametres } = require('../src/parametresRepo');
const E = require('../src/emailsDossiers');

const env = (corps) => `<s:Envelope><s:Body>${corps}</s:Body></s:Envelope>`;
const msgFind = (id, objet, date, deNom, deAdr, pj) => `<t:Message><t:ItemId Id="${id}" ChangeKey="x"/><t:Subject>${objet}</t:Subject>`
  + `<t:DateTimeReceived>${date}</t:DateTimeReceived><t:DateTimeSent>${date}</t:DateTimeSent><t:HasAttachments>${pj ? 'true' : 'false'}</t:HasAttachments>`
  + `<t:Preview>Bonjour</t:Preview><t:From><t:Mailbox><t:Name>${deNom}</t:Name><t:EmailAddress>${deAdr}</t:EmailAddress></t:Mailbox></t:From></t:Message>`;
const find = (msgs) => env(`<m:FindItemResponse><m:ResponseMessages><m:FindItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:RootFolder><t:Items>${msgs.join('')}</t:Items></m:RootFolder></m:FindItemResponseMessage></m:ResponseMessages></m:FindItemResponse>`);
const refuse = env('<m:FindItemResponse><m:ResponseMessages><m:FindItemResponseMessage ResponseClass="Error"><m:MessageText>Access is denied.</m:MessageText><m:ResponseCode>ErrorAccessDenied</m:ResponseCode></m:FindItemResponseMessage></m:ResponseMessages></m:FindItemResponse>');
const getItems = (items) => env(`<m:GetItemResponse><m:ResponseMessages>${items.map((i) => `<m:GetItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Items><t:Message><t:ItemId Id="${i.id}" ChangeKey="x"/>`
  + (i.corps ? `<t:Body BodyType="Text">${i.corps}</t:Body>` : '')
  + (i.pjs ? `<t:Attachments>${i.pjs.map((p) => `<t:FileAttachment><t:AttachmentId Id="${p.id}"/><t:Name>${p.nom}</t:Name><t:ContentType>application/pdf</t:ContentType><t:Size>${p.taille || 1000}</t:Size><t:IsInline>${p.inline ? 'true' : 'false'}</t:IsInline></t:FileAttachment>`).join('')}</t:Attachments>` : '')
  + `<t:ToRecipients>${(i.a || []).map((a) => `<t:Mailbox><t:Name>x</t:Name><t:EmailAddress>${a}</t:EmailAddress></t:Mailbox>`).join('')}</t:ToRecipients></t:Message></m:Items></m:GetItemResponseMessage>`).join('')}</m:ResponseMessages></m:GetItemResponse>`);

const DOSSIER = { id: 'd1', nom: 'MARTEL / FOURNIER', emailAcquereur: 'camille.fournier@exemple.fr; c.fournier@travail.fr', emailVendeur: 'alex.martel@exemple.fr', nasDossier: 'MARTEL' };

function preparer() {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret' });
  repo.ecrireReglages({ ...repo.lireReglages(), emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@office.fr', 'Julie VASSELIN': 'julie@office.fr', 'Jérémy SAUJOT': 'jeremy@office.fr' } });
  return { db, repo, depot: { tousActifs: () => [DOSSIER] } };
}

test('pur : objet normalisé, email préparé retrouvé dans les envois (objet, destinataire, date)', () => {
  assert.equal(E.normaliserObjet('RE: TR :  Appel de fonds — VTE - MARTEL'), 'appel de fonds — vte - martel');
  const p = { objet: 'Appel de fonds — VTE - MARTEL', destinataires: ['alex.martel@exemple.fr'], prepareLe: '2026-10-02T09:00:00Z', envoyeLe: null };
  assert.equal(E.correspondAuPrepare(p, { objet: 'Appel de fonds — VTE - MARTEL', a: ['alex.martel@exemple.fr'], date: '2026-10-02T09:20:00Z' }), true);
  assert.equal(E.correspondAuPrepare(p, { objet: 'Appel de fonds — VTE - MARTEL', a: ['autre@x.fr'], date: '2026-10-02T09:20:00Z' }), false);
  assert.equal(E.correspondAuPrepare(p, { objet: 'Autre objet', a: ['alex.martel@exemple.fr'], date: '2026-10-02T09:20:00Z' }), false);
  assert.equal(E.correspondAuPrepare(p, { objet: 'Appel de fonds — VTE - MARTEL', a: ['alex.martel@exemple.fr'], date: '2026-09-30T09:20:00Z' }), false);
  assert.equal(E.texteSansCitation('Merci, voici le RIB.\n\nLe 1 oct. 2026, Office a écrit :\n> Bonjour'), 'Merci, voici le RIB.');
  const boites = E.boitesEnvoyes({ email: 'Bastien@office.fr' }, { emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@office.fr', 'Julie VASSELIN': 'julie@office.fr' } });
  assert.equal(boites.map((b) => `${b.collaborateur}:${b.propre}`).join(','), 'Bastien ANGLUMENT:true,Julie VASSELIN:false');
  // L'adresse de Sophie, gardée pour Teams (factures de succession), n'est jamais une boîte lue.
  const avecSophie = E.boitesEnvoyes({ email: 'bastien@office.fr' }, { emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@office.fr', 'Sophie GOSSART': 'sophie@office.fr' } });
  assert.equal(avecSophie.map((b) => b.collaborateur).join(','), 'Bastien ANGLUMENT');
});

test('tour : reçu rattaché (texte jamais gardé, pièces jointes listées), envoyés relus, accès refusé signalé, préparé confirmé', async () => {
  const { db, repo, depot } = preparer();
  try {
    const etat0 = E.lireEtat(repo);
    etat0.prepares.push(E.assainirPrepare({ id: 'p1', dossierId: 'd1', objet: 'Appel de fonds — VTE - MARTEL / FOURNIER', destinataires: ['camille.fournier@exemple.fr'], collaborateur: 'Julie VASSELIN', prepareLe: '2026-10-01T08:00:00Z' }));
    E.ecrireEtat(repo, etat0);
    const corpsLus = [];
    const poster = (o, cb) => {
      const b = o.body;
      corpsLus.push(b);
      if (/FindItem/.test(b) && /Id="inbox"/.test(b)) return cb(null, { statusCode: 200, body: find([
        msgFind('IN1', 'Offre de prêt', '2026-10-01T10:00:00Z', 'Camille FOURNIER', 'c.fournier@travail.fr', true),
        msgFind('IN2', 'Promotion', '2026-10-01T11:00:00Z', 'Pub', 'pub@shop.fr', false)]) });
      if (/GetItem/.test(b) && /IN1/.test(b)) return cb(null, { statusCode: 200, body: getItems([{ id: 'IN1', corps: 'Voici mon offre de prêt signée. CONFIDENTIEL 4242', pjs: [{ id: 'PJ1', nom: 'Offre de pret.pdf' }, { id: 'PJ2', nom: 'logo.png', inline: true }] }]) });
      if (/FindItem/.test(b) && /Id="sentitems"\/>/.test(b)) return cb(null, { statusCode: 200, body: find([]) });
      if (/FindItem/.test(b) && /julie@office.fr/.test(b)) return cb(null, { statusCode: 200, body: find([msgFind('S1', 'Appel de fonds — VTE - MARTEL / FOURNIER', '2026-10-01T09:00:00Z', 'Julie', 'julie@office.fr', false)]) });
      if (/GetItem/.test(b) && /S1/.test(b)) return cb(null, { statusCode: 200, body: getItems([{ id: 'S1', a: ['camille.fournier@exemple.fr'] }]) });
      if (/FindItem/.test(b) && /jeremy@office.fr/.test(b)) return cb(null, { statusCode: 200, body: refuse });
      cb(null, { statusCode: 500, body: '' });
    };
    const ollama = { modele: 'faux', verifierDisponibilite: async () => ({ disponible: true }), genererJson: async (prompt) => { assert.match(prompt, /offre de prêt signée/); return { resume: 'Le client envoie son offre de prêt signée.' }; } };
    const r = await E.executerTourEmailsDossiers(depot, repo, { poster, ollama, attendreIa: true, maintenant: '2026-10-02T08:00:00Z' }, true);
    assert.equal(r.ok, true);
    assert.equal(r.recus, 1);
    assert.equal(r.confirmes, 1);
    const etat = E.lireEtat(repo);
    const recu = etat.emails.find((e) => e.sens === 'recu');
    assert.equal(recu.dossierId, 'd1', 'adresse dans un champ à plusieurs adresses');
    assert.equal(recu.pj.map((p) => p.nom).join(','), 'Offre de pret.pdf', 'image intégrée écartée');
    assert.equal(recu.resume, 'Le client envoie son offre de prêt signée.');
    assert.deepEqual(recu.sujets.includes('Offre de prêt'), true);
    assert.doesNotMatch(JSON.stringify(etat), /CONFIDENTIEL|4242|secret/, 'texte de l’email et mot de passe jamais gardés');
    assert.equal(etat.prepares[0].envoyeLe, '2026-10-01T09:00:00.000Z');
    assert.equal(etat.prepares[0].boite, 'julie@office.fr');
    assert.equal(etat.etat.envoyes['jeremy@office.fr'].statut, 'refuse');
    assert.equal(etat.etat.envoyes['julie@office.fr'].statut, 'ok');
    assert.ok(corpsLus.every((b) => !/UpdateItem|DeleteItem|CreateItem|MoveItem|SendItem/.test(b)), 'lecture seule');
    // Second tour : rien n'est relu deux fois.
    const r2 = await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-02T08:10:00Z' }, true);
    assert.equal(r2.recus, 0);
    assert.equal(E.lireEtat(repo).emails.length, 2);
  } finally { db.close(); }
});

test('adresse du confrère saisie après coup : ses emails des 30 derniers jours sont retrouvés, une fois (étude, 03/10)', async () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret' });
  const dossier = { id: 'd2', nom: 'LEGRAND / ROUX', emailAcquereur: 'roux@exemple.fr' };
  const depot = { tousActifs: () => [dossier] };
  const corps = [];
  const poster = (o, cb) => {
    const b = o.body;
    corps.push(b);
    if (/FindItem/.test(b) && /Id="inbox"/.test(b)) {
      // Lecture normale (depuis le repère) : rien de neuf ; relecture sur 30 jours : l'email du confrère, reçu avant la saisie.
      if (/Descending/.test(b)) return cb(null, { statusCode: 200, body: find([
        msgFind('OLD1', 'Pièces du dossier', '2026-09-20T10:00:00Z', 'Me DUPRE', 'clerc.dupre@notaires.fr', true),
        msgFind('OLD2', 'Autre affaire', '2026-09-21T10:00:00Z', 'Inconnu', 'inconnu@exemple.fr', false)]) });
      return cb(null, { statusCode: 200, body: find([]) });
    }
    if (/GetItem/.test(b) && /OLD1/.test(b)) return cb(null, { statusCode: 200, body: getItems([{ id: 'OLD1', corps: 'Ci-joint le titre.', pjs: [{ id: 'PJ9', nom: 'Titre de propriete.pdf' }] }]) });
    if (/FindItem/.test(b)) return cb(null, { statusCode: 200, body: find([]) });
    cb(null, { statusCode: 500, body: '' });
  };
  try {
    // Premier tour : les adresses actuelles sont notées, sans relecture.
    await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-03T08:00:00Z' }, true);
    assert.ok(!corps.some((b) => /Descending/.test(b)));
    // L'étude saisit l'email du confrère sur la fiche.
    dossier.emailNotaireParticipant = 'Clerc.Dupre@notaires.fr';
    const r = await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-03T08:05:00Z' }, true);
    assert.equal(r.rattrapes, 1);
    const recu = E.lireEtat(repo).emails.find((e) => e.id && e.dossierId === 'd2');
    assert.equal(recu.objet, 'Pièces du dossier');
    assert.equal(recu.pj.map((p) => p.nom).join(), 'Titre de propriete.pdf');
    assert.equal(E.lireEtat(repo).emails.length, 1, 'l’email d’un inconnu n’est pas repris');
    // Tour suivant : l'adresse est déjà relue, plus de relecture sur 30 jours.
    const avant = corps.filter((b) => /Descending/.test(b)).length;
    await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-03T08:06:00Z' }, true);
    assert.equal(corps.filter((b) => /Descending/.test(b)).length, avant);
    assert.equal(E.adressesNouvellesFiches(['A@x.fr', 'b@x.fr'], new Set(['a@x.fr'])).join(), 'b@x.fr');
  } finally { db.close(); }
});

test('dossier créé après coup : l’email reçu la veille d’une adresse de sa fiche est retrouvé, une fois (étude, 03/10 ; adresse seule depuis le 07/10)', async () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret' });
  const ancien = { id: 'd2', nom: 'LEGRAND / ROUX', historique: [{ date: '2026-08-01T08:00:00Z', texte: 'Dossier créé' }] };
  const liste = [ancien];
  const depot = { tousActifs: () => liste };
  const corps = [];
  const poster = (o, cb) => {
    const b = o.body;
    corps.push(b);
    if (/FindItem/.test(b) && /Id="inbox"/.test(b)) {
      if (/Descending/.test(b)) return cb(null, { statusCode: 200, body: find([
        msgFind('V1', 'RE: VENTE MORIN / FAURE', '2026-10-02T15:00:00Z', 'Fanny', 'consoeur@notaires.fr', false),
        msgFind('V2', 'Autre affaire', '2026-10-02T16:00:00Z', 'Inconnu', 'inconnu@exemple.fr', false)]) });
      return cb(null, { statusCode: 200, body: find([]) });
    }
    if (/GetItem/.test(b) && /V1/.test(b)) return cb(null, { statusCode: 200, body: getItems([{ id: 'V1', corps: 'Voici les pièces.' }]) });
    if (/FindItem/.test(b)) return cb(null, { statusCode: 200, body: find([]) });
    cb(null, { statusCode: 500, body: '' });
  };
  try {
    // Premier tour : l'ancien dossier est noté sans relecture.
    await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-03T08:00:00Z' }, true);
    assert.ok(!corps.some((b) => /Descending/.test(b)));
    // Le dossier est créé le lendemain de l'email.
    liste.push({ id: 'd3', nom: 'MORIN / FAURE', emailNotaireParticipant: 'consoeur@notaires.fr', historique: [{ date: '2026-10-03T08:02:00Z', texte: 'Dossier créé' }] });
    const r = await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-03T08:05:00Z' }, true);
    assert.equal(r.rattrapes, 1);
    const emails = E.lireEtat(repo).emails;
    assert.equal(emails.map((e) => `${e.dossierId}:${e.objet}`).join(), 'd3:RE: VENTE MORIN / FAURE');
    const avant = corps.filter((b) => /Descending/.test(b)).length;
    await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-03T08:06:00Z' }, true);
    assert.equal(corps.filter((b) => /Descending/.test(b)).length, avant, 'relu une seule fois');
  } finally { db.close(); }
});

test('pur : dossiers à relire — première fois, seuls les dossiers créés depuis moins de 3 jours', () => {
  const actifs = [
    { id: 'a', historique: [{ date: '2026-09-01T08:00:00Z', texte: 'Dossier créé' }] },
    { id: 'b', historique: [{ date: '2026-10-02T08:00:00Z', texte: 'Dossier créé' }] },
    { id: 'c' }];
  const init = E.dossiersNouveauxEmails(actifs, null, '2026-10-03T08:00:00Z');
  assert.equal([...init.nouveaux].join(), 'b');
  assert.equal(init.vus.join(), 'a,c');
  assert.equal([...E.dossiersNouveauxEmails(actifs, ['a', 'b'], '2026-10-03T08:00:00Z').nouveaux].join(), 'c');
});

test('identifiants refusés : disjoncteur, rien n’est écrit d’autre', async () => {
  const { db, repo, depot } = preparer();
  const agendaWatch = require('../src/agendaWatch');
  try {
    const r = await E.executerTourEmailsDossiers(depot, repo, { poster: (o, cb) => cb(null, { statusCode: 401, body: '' }) }, true);
    assert.match(r.erreur, /Identifiants de messagerie refusés/);
    assert.equal(agendaWatch.lectureAgendaSuspendue(repo.lireReglagesExchange()), true);
  } finally { agendaWatch.reinitialiserDisjoncteurAgenda(); db.close(); }
});

test('route : pièce jointe rangée une seule fois dans le dossier client, jamais d’écrasement', async () => {
  const { creerApp } = require('../src/app');
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-nas-'));
  fs.mkdirSync(path.join(racine, 'MARTEL', '3 - AAE'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'MARTEL', '3 - AAE', 'Offre de prêt.pdf'), 'ancien');
  const db = ouvrirDb(':memory:');
  let appels = 0;
  const poster = (o, cb) => { appels++; cb(null, { statusCode: 200, body: env(`<m:GetAttachmentResponse><m:ResponseMessages><m:GetAttachmentResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Attachments><t:FileAttachment><t:Name>Offre de pret.pdf</t:Name><t:Content>${Buffer.from('%PDF-1.4 offre').toString('base64')}</t:Content></t:FileAttachment></m:Attachments></m:GetAttachmentResponseMessage></m:ResponseMessages></m:GetAttachmentResponse>`) }); };
  const { app } = creerApp({ db, config: { authActive: false, racineRepo: os.tmpdir(), nasRacine: racine, estSea: () => false }, emailsDossiers: { poster } });
  const serveur = app.listen(0);
  await new Promise((r) => serveur.once('listening', r));
  const base = `http://127.0.0.1:${serveur.address().port}`;
  try {
    const repo = creerRepoParametres(db);
    repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret' });
    const etat = E.lireEtat(repo);
    etat.emails.push({ id: 'e1', itemId: 'IN1', dossierId: 'd1', sens: 'recu', date: '2026-10-01T10:00:00Z', de: { nom: 'C', adresse: 'c@x.fr' }, objet: 'Offre', pj: [{ id: 'PJ1', nom: 'Offre de pret.pdf', taille: 10 }] });
    E.ecrireEtat(repo, etat);
    // Rangement automatique éteint par défaut (étude 03/10) : rien n'est proposé au rangement seul.
    const pj0 = await (await fetch(`${base}/api/emails-dossiers/pieces-jointes`)).json();
    assert.equal(pj0.piecesJointes.length, 0);
    assert.equal(pj0.rangementAuto, false);
    await fetch(`${base}/api/emails-dossiers/reglages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rangementAuto: true }) });
    assert.equal(E.lireEtat(repo).reglages.actif, true, 'l’interrupteur de lecture n’est pas touché');
    // Retiré des Réglages le 13/10 (tri de l'étude) : le rangement automatique reste éteint, même demandé.
    assert.equal(E.lireEtat(repo).reglages.rangementAuto, false);
    const pj = await (await fetch(`${base}/api/emails-dossiers/pieces-jointes`)).json();
    assert.equal(pj.piecesJointes.length, 0);
    const ranger = () => fetch(`${base}/api/emails-dossiers/pj/ranger`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailId: 'e1', pjId: 'PJ1', dossierNas: 'MARTEL', rubriques: ['aae'], nomCible: 'Offre de prêt', pieceCle: 'offrePret', auto: true }) }).then((r) => r.json());
    const r1 = await ranger();
    assert.equal(r1.ok, true);
    assert.equal(r1.chemin, path.join('MARTEL', '3 - AAE', 'Offre de prêt (2).pdf'));
    assert.equal(fs.readFileSync(path.join(racine, 'MARTEL', '3 - AAE', 'Offre de prêt.pdf'), 'utf8'), 'ancien', 'jamais d’écrasement');
    assert.equal(fs.readFileSync(path.join(racine, r1.chemin), 'utf8'), '%PDF-1.4 offre');
    const r2 = await ranger();
    assert.equal(r2.deja, true);
    assert.equal(appels, 1, 'une seule lecture dans Exchange');
    const apres = await (await fetch(`${base}/api/emails-dossiers/pieces-jointes`)).json();
    assert.equal(apres.piecesJointes.length, 0);
    const vue = await (await fetch(`${base}/api/emails-dossiers?dossierId=d1`)).json();
    assert.equal(vue.emails[0].pj[0].rangee.pieceCle, 'offrePret');
    assert.ok(!('itemId' in vue.emails[0]), 'identifiant Exchange jamais renvoyé');
    // Email préparé enregistré.
    const prep = await fetch(`${base}/api/emails-prepares`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dossierId: 'd1', objet: 'Appel de fonds', destinataires: ['a@x.fr'], collaborateur: 'Julie VASSELIN' }) });
    assert.equal(prep.status, 201);
  } finally { serveur.close(); db.close(); fs.rmSync(racine, { recursive: true, force: true }); }
});

test('email lu en entier : relu dans Exchange à la demande, jamais gardé ; un seul tour à la fois', async () => {
  const { db, repo, depot } = preparer();
  try {
    const etat = E.lireEtat(repo);
    etat.emails.push({ id: 'e1', itemId: 'IN9', dossierId: 'd1', sens: 'recu', date: '2026-10-02T08:00:00Z', objet: 'RIB', de: { nom: 'Alex MARTEL', adresse: 'alex.martel@exemple.fr' }, a: ['bastien@office.fr'], pj: [] });
    E.ecrireEtat(repo, E.assainirEmailsDossiers(etat));
    const poster = (o, cb) => /GetItem/.test(o.body) && /IN9/.test(o.body)
      ? cb(null, { statusCode: 200, body: getItems([{ id: 'IN9', corps: 'Bonjour,\n\nVoici mon RIB &amp; ma pièce d’identité.\n\nAlex', a: ['bastien@office.fr', 'julie@office.fr'] }]) })
      : cb(null, { statusCode: 200, body: find([]) });
    const r = await E.lireEmailComplet(repo, 'e1', { poster });
    assert.equal(r.texte, 'Bonjour,\n\nVoici mon RIB & ma pièce d’identité.\n\nAlex');
    assert.equal(r.a.join(','), 'bastien@office.fr,julie@office.fr');
    assert.doesNotMatch(JSON.stringify(E.lireEtat(repo)), /Voici mon RIB/);
    assert.equal((await E.lireEmailComplet(repo, 'inconnu', { poster })).statut, 404);
    // Deux appels simultanés = un seul tour.
    let finds = 0;
    const posterCompte = (o, cb) => { if (/FindItem/.test(o.body)) finds++; setTimeout(() => cb(null, { statusCode: 200, body: find([]) }), 5); };
    const [a, b] = await Promise.all([E.executerTourEmailsDossiers(depot, repo, { poster: posterCompte }), E.executerTourEmailsDossiers(depot, repo, { poster: posterCompte })]);
    assert.equal(a, b);
    const findsUnTour = finds;
    await E.executerTourEmailsDossiers(depot, repo, { poster: posterCompte });
    assert.equal(finds, findsUnTour * 2);
  } finally { db.close(); }
});

test('email préparé jamais envoyé : retiré de la liste en attente', async () => {
  const db = ouvrirDb(':memory:');
  const { creerApp } = require('../src/app');
  const { app } = creerApp({ db, config: { authActive: false, racineRepo: os.tmpdir(), estSea: () => false }, emailsDossiers: { poster: (o, cb) => cb(null, { statusCode: 200, body: '' }) } });
  const serveur = app.listen(0);
  await new Promise((r) => serveur.once('listening', r));
  const base = `http://127.0.0.1:${serveur.address().port}`;
  try {
    const json = { 'Content-Type': 'application/json' };
    const cree = await (await fetch(`${base}/api/emails-prepares`, { method: 'POST', headers: json, body: JSON.stringify({ dossierId: 'd1', objet: 'RE: VENTE X/Y', destinataires: ['a@x.fr'], collaborateur: 'Julie VASSELIN' }) })).json();
    const avant = await (await fetch(`${base}/api/emails-dossiers?dossierId=d1`)).json();
    assert.equal(avant.prepares.length, 1);
    const r = await fetch(`${base}/api/emails-prepares/${cree.prepare.id}`, { method: 'DELETE' });
    assert.equal(r.status, 200);
    const apres = await (await fetch(`${base}/api/emails-dossiers?dossierId=d1`)).json();
    assert.equal(apres.prepares.length, 0);
    assert.equal((await fetch(`${base}/api/emails-prepares/inconnu`, { method: 'DELETE' })).status, 404);
  } finally { serveur.close(); db.close(); }
});

test('tour : client d’un dossier archivé retrouvé sur sa fiche ; réponse « RE: » d’une adresse absente de la fiche écartée (étude 06/10, 07/10)', async () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret' });
  repo.ecrireReglages({ ...repo.lireReglages(), emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@office.fr' } });
  const archive = { id: 'd9', nom: 'GARNIER / LEBLANC', archive: true, parties: [{ nom: 'Jean GARNIER', role: 'VENDEUR', emails: ['jean.garnier@exemple.fr'] }] };
  const depot = { tousActifs: () => [DOSSIER, archive] };
  try {
    const etat0 = E.lireEtat(repo);
    etat0.etat.adressesVues = ['camille.fournier@exemple.fr', 'c.fournier@travail.fr', 'alex.martel@exemple.fr', 'jean.garnier@exemple.fr'];
    etat0.etat.dossiersVus = ['d1'];
    etat0.prepares.push(E.assainirPrepare({ id: 'p1', dossierId: 'd1', objet: 'Votre projet d’acte de vente', destinataires: ['alex.martel@exemple.fr'], collaborateur: 'Bastien ANGLUMENT', prepareLe: '2026-10-01T08:00:00Z' }));
    E.ecrireEtat(repo, etat0);
    const poster = (o, cb) => {
      const b = o.body;
      if (/FindItem/.test(b) && /Id="inbox"/.test(b)) return cb(null, { statusCode: 200, body: find([
        msgFind('IN5', 'Taxe foncière', '2026-10-05T10:00:00Z', 'Jean GARNIER', 'jean.garnier@exemple.fr', false),
        msgFind('IN6', 'RE: Votre projet d’acte de vente', '2026-10-05T11:00:00Z', 'Sœur', 'soeur.martel@ailleurs.fr', false)]) });
      if (/GetItem/.test(b)) return cb(null, { statusCode: 200, body: getItems([{ id: 'IN5', corps: 'Question' }, { id: 'IN6', corps: 'Bien reçu' }]) });
      if (/FindItem/.test(b)) return cb(null, { statusCode: 200, body: find([]) });
      cb(null, { statusCode: 500, body: '' });
    };
    const r = await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-06T08:00:00Z' }, true);
    assert.equal(r.recus, 1);
    const emails = E.lireEtat(repo).emails;
    assert.equal(emails.find((e) => e.itemId === 'IN5').dossierId, 'd9');
    assert.ok(!emails.some((e) => e.itemId === 'IN6'), 'adresse absente de la fiche : pas sur le dossier (étude 07/10)');
  } finally { db.close(); }
});

test('projet d\'acte envoyé : détecté dans les envoyés, échéance cochée une seule fois, jamais sur un objet interne ou une réponse', async () => {
  const P = require('../src/projetEnvoyeEmail');
  assert.equal(P.objetDitProjetActe('Projet d’acte de vente — VTE - MARTEL / FOURNIER'), true);
  assert.equal(P.objetDitProjetActe('VTE MARTEL : projet de vente pour relecture'), false);
  assert.equal(P.objetDitProjetActe('RE: Projet d’acte'), false);
  assert.equal(P.objetDitProjetActe('Compromis de vente'), false);
  const d = { id: 'd9', nom: 'MARTEL / FOURNIER', emailAcquereur: 'camille.fournier@exemple.fr', historique: [] };
  assert.equal(P.projetEnvoyeADetecter(d, { objet: 'Projet d’acte de vente', a: ['interne@office.fr'], date: '2026-10-05T10:00:00Z' }), false, 'destinataire hors dossier');
  assert.equal(P.projetEnvoyeADetecter({ ...d, typeAffaire: 'succession' }, { objet: 'Projet d’acte', a: ['camille.fournier@exemple.fr'], date: '2026-10-05T10:00:00Z' }), false);
  assert.equal(P.cocherProjetEnvoye(d, { objet: 'Projet d’acte de vente', a: ['Camille.Fournier@exemple.fr'], date: '2026-10-05T22:30:00Z' }), true);
  assert.equal(d.projetEnvoye, '2026-10-06', 'jour de Paris');
  assert.equal(d.echeancesValidees.projetEnvoye, true);
  assert.equal(P.cocherProjetEnvoye(d, { objet: 'Projet d’acte de vente', a: ['camille.fournier@exemple.fr'], date: '2026-10-07T10:00:00Z' }), false, 'déjà coché');
  // Décoché à la main : jamais recoché.
  d.projetEnvoye = ''; d.echeancesValidees.projetEnvoye = false;
  assert.equal(P.cocherProjetEnvoye(d, { objet: 'Projet d’acte de vente', a: ['camille.fournier@exemple.fr'], date: '2026-10-08T10:00:00Z' }), false);

  // Dans le tour : l'email envoyé coche le dossier du dépôt.
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret' });
  const dossier = { id: 'd5', nom: 'LEGRAND / ROUX', emailAcquereur: 'roux@exemple.fr', historique: [] };
  const remplaces = [];
  const depot = { tousActifs: () => [dossier], remplacer: (id, x) => remplaces.push([id, x]) };
  const poster = (o, cb) => {
    const b = o.body;
    if (/FindItem/.test(b) && /Id="sentitems"/.test(b)) return cb(null, { statusCode: 200, body: find([msgFind('S9', 'Projet d’acte de vente — VTE - LEGRAND / ROUX', '2026-10-05T09:00:00Z', 'Bastien', 'bastien@office.fr', true)]) });
    if (/GetItem/.test(b) && /S9/.test(b)) return cb(null, { statusCode: 200, body: getItems([{ id: 'S9', a: ['roux@exemple.fr'] }]) });
    if (/FindItem/.test(b)) return cb(null, { statusCode: 200, body: find([]) });
    cb(null, { statusCode: 500, body: '' });
  };
  try {
    const r = await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-06T08:00:00Z' }, true);
    assert.equal(r.projetsCoches, 1);
    assert.equal(dossier.projetEnvoye, '2026-10-05');
    assert.equal(dossier.echeancesValidees.projetEnvoye, true);
    assert.equal(remplaces.length, 1);
  } finally { db.close(); }
});

test('projet envoyé : coché sur la copie du dossier relue au moment d’écrire, jamais sur celle du début du tour (audit 13/10)', async () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret' });
  const debutTour = { id: 'd5', nom: 'LEGRAND / ROUX', emailAcquereur: 'roux@exemple.fr', historique: [] };
  // Un poste a posé la date de signature pendant les lectures Exchange.
  const actuel = { ...debutTour, rendezVousSignature: '2099-03-04', historique: [] };
  const remplaces = [];
  const depot = { tousActifs: () => [debutTour], trouverParId: () => actuel, remplacer: (id, x) => remplaces.push([id, x]) };
  const poster = (o, cb) => {
    const b = o.body;
    if (/FindItem/.test(b) && /Id="sentitems"/.test(b)) return cb(null, { statusCode: 200, body: find([msgFind('S9', 'Projet d’acte de vente — VTE - LEGRAND / ROUX', '2026-10-05T09:00:00Z', 'Bastien', 'bastien@office.fr', true)]) });
    if (/GetItem/.test(b) && /S9/.test(b)) return cb(null, { statusCode: 200, body: getItems([{ id: 'S9', a: ['roux@exemple.fr'] }]) });
    if (/FindItem/.test(b)) return cb(null, { statusCode: 200, body: find([]) });
    cb(null, { statusCode: 500, body: '' });
  };
  try {
    const r = await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-06T08:00:00Z' }, true);
    assert.equal(r.projetsCoches, 1);
    assert.equal(remplaces.length, 1);
    assert.equal(remplaces[0][1].rendezVousSignature, '2099-03-04');
    assert.equal(remplaces[0][1].projetEnvoye, '2026-10-05');
  } finally { db.close(); }
});

test('projet d\'acte de vente dans le TEXTE d\'un email envoyé avec pièce jointe : coché, texte jamais gardé ; annoncé ou cité : rien', async () => {
  const P = require('../src/projetEnvoyeEmail');
  assert.equal(P.corpsDitProjetActe('Bonjour,\nVeuillez trouver ci-joint le projet d’acte de vente.\nBien cordialement'), true);
  assert.equal(P.corpsDitProjetActe('Ci-joint le projet de l\'acte de vente pour relecture.'), true);
  assert.equal(P.corpsDitProjetActe('Je vous enverrai le projet d’acte de vente la semaine prochaine.'), false, 'annoncé, pas envoyé');
  assert.equal(P.corpsDitProjetActe('Ci-joint le diagnostic.'), false);
  const d = { id: 'd8', nom: 'NOEL / BRUN', emailAcquereur: 'brun@exemple.fr', historique: [] };
  const envoye = { objet: 'Votre dossier', a: ['brun@exemple.fr'], date: '2026-10-07T09:00:00Z', pj: true };
  assert.equal(P.corpsALirePourProjet(d, envoye), true);
  assert.equal(P.corpsALirePourProjet(d, { ...envoye, pj: false }), false, 'sans pièce jointe, le texte n’est pas lu');
  assert.equal(P.projetEnvoyeADetecter(d, { ...envoye, pj: false, corps: 'ci-joint le projet d’acte de vente' }), false);

  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret' });
  const dossier = { id: 'd6', nom: 'NOEL / BRUN', emailAcquereur: 'brun@exemple.fr', historique: [] };
  const remplaces = [];
  const depot = { tousActifs: () => [dossier], remplacer: (id) => remplaces.push(id) };
  const lus = [];
  const poster = (o, cb) => {
    const b = o.body;
    if (/FindItem/.test(b) && /Id="sentitems"/.test(b)) return cb(null, { statusCode: 200, body: find([
      msgFind('S7', 'Votre vente — VTE - NOEL / BRUN', '2026-10-07T09:00:00Z', 'Bastien', 'bastien@office.fr', true),
      msgFind('S8', 'RE: question', '2026-10-07T10:00:00Z', 'Bastien', 'bastien@office.fr', true)]) });
    if (/GetItem/.test(b)) {
      lus.push(/item:Body/.test(b));
      if (/item:Body/.test(b)) return cb(null, { statusCode: 200, body: getItems([
        { id: 'S7', a: ['brun@exemple.fr'], corps: 'Bonjour, veuillez trouver ci-joint le projet d’acte de vente. CONFIDENTIEL 9876' },
        { id: 'S8', a: ['brun@exemple.fr'], corps: 'Merci.\n\nLe 6 oct. 2026, Office a écrit :\n> le projet d’acte de vente suivra' }]) });
      return cb(null, { statusCode: 200, body: getItems([{ id: 'S7', a: ['brun@exemple.fr'] }, { id: 'S8', a: ['brun@exemple.fr'] }]) });
    }
    if (/FindItem/.test(b)) return cb(null, { statusCode: 200, body: find([]) });
    cb(null, { statusCode: 500, body: '' });
  };
  try {
    const r = await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-07T12:00:00Z' }, true);
    assert.equal(r.projetsCoches, 1);
    assert.equal(dossier.projetEnvoye, '2026-10-07');
    assert.match(dossier.historique.at(-1).texte, /il porte une pièce jointe et son texte dit « projet d’acte de vente »/);
    assert.deepEqual(lus, [false, true], 'texte lu en second temps seulement');
    assert.doesNotMatch(JSON.stringify(E.lireEtat(repo)), /CONFIDENTIEL|9876/, 'texte jamais gardé');
  } finally { db.close(); }
});

// Étude 07/10 : « mettre dans l'historique comment est détecté l'envoi du projet ».
test('historique : l’envoi du projet détecté dit quel email et pourquoi', () => {
  const { texteHistoriqueProjetEnvoye } = require('../src/projetEnvoyeEmail');
  const t = texteHistoriqueProjetEnvoye({ objet: 'Projet d’acte de vente FOURNIER', a: ['client@exemple.fr', 'interne@office.fr'], date: '2026-10-07T08:42:00Z', collaborateur: 'Julie VASSELIN' }, ['client@exemple.fr']);
  assert.equal(t, 'Envoi projet coché seul : email envoyé le 07/10/2026 à 10 h 42 par Julie VASSELIN à client@exemple.fr, objet « Projet d’acte de vente FOURNIER » — son objet parle d’un projet d’acte. À décocher si ce n’était pas le projet.');
  const c = texteHistoriqueProjetEnvoye({ objet: 'Votre dossier', a: ['client@exemple.fr'], date: '2026-10-07T08:42:00Z', pj: true, boite: 'jv@office.fr' }, ['client@exemple.fr']);
  assert.match(c, /par jv@office\.fr à client@exemple\.fr, objet « Votre dossier » — il porte une pièce jointe et son texte dit « projet d’acte de vente »/);
});

test('tour : les emails rattachés avant le 07/10 hors des adresses de la fiche sont retirés de leur dossier', async () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglagesExchange({ actif: true, url: 'https://ex/ews', email: 'bastien@office.fr', motDePasse: 'secret' });
  const depot = { tousActifs: () => [DOSSIER] };
  try {
    const etat0 = E.lireEtat(repo);
    etat0.etat.adressesVues = ['camille.fournier@exemple.fr', 'c.fournier@travail.fr', 'alex.martel@exemple.fr'];
    etat0.etat.dossiersVus = ['d1'];
    etat0.emails.push(
      { id: 'a1', itemId: 'X1', dossierId: 'd1', sens: 'recu', date: '2026-10-05T10:00:00Z', de: { adresse: 'office@office.fr' }, objet: 'PUV SUCC BOUZY' },
      { id: 'a2', itemId: 'X2', dossierId: 'd1', sens: 'recu', date: '2026-10-05T11:00:00Z', de: { adresse: 'alex.martel@exemple.fr' }, objet: 'Disponibilités' },
      { id: 'a3', itemId: 'X3', dossierId: 'd1', sens: 'envoye', date: '2026-10-05T12:00:00Z', de: { adresse: 'bastien@office.fr' }, a: ['geometre@ailleurs.fr'], objet: 'Alignement - VTE MARTEL / FOURNIER' });
    E.ecrireEtat(repo, etat0);
    const poster = (o, cb) => cb(null, { statusCode: 200, body: find([]) });
    const r = await E.executerTourEmailsDossiers(depot, repo, { poster, maintenant: '2026-10-07T08:00:00Z' }, true);
    assert.equal(r.retires, 2);
    assert.equal(E.lireEtat(repo).emails.map((e) => e.id).join(), 'a2');
  } finally { db.close(); }
});
