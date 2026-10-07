'use strict';

// Sondage de créneaux de signature (src/sondagesCreneaux.js, src/routes/sondages.js). Aucun appel
// réseau : le transport EWS est un faux qui répond selon l'opération demandée.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const {
  codeSondage, jetonReponse, jetonsDansObjet, appliquerReponses, optionRestanteSeule, sujetPlacementOption, syntheseSondage,
  corpsFindReponsesSondages, assainirSondage,
  choixDepuisTexteListe, reponsesListeALire, corpsLireTextesReponses, parseTextesReponses, parseFindReponses
} = require('../src/sondagesCreneaux');
const { corpsCreateRendezVous } = require('../src/exchange/ews');
const { evenementsAgendaOffice } = require('../src/agendaOffice');
const { reinitialiserDisjoncteurAgenda } = require('../src/agendaWatch');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { creerRepoParametres } = require('../src/parametresRepo');

function sondageExemple() {
  return assainirSondage({
    id: 's1', code: 'ABC234', dossierId: 'd1', dossierNom: 'DURAND', statut: 'ouvert',
    creeLe: '2026-10-01T08:00:00.000Z', expireLe: '2026-10-08',
    creneaux: [{ date: '2026-10-20', heure: '10:00' }, { date: '2026-10-21', heure: '15:00' }],
    participants: [
      { role: 'vendeur', nom: 'Paul DURAND', email: 'paul.durand@exemple.fr' },
      { role: 'acquereur', nom: 'Léa MARTIN', email: 'Lea.Martin@exemple.fr' }
    ],
    reponses: []
  });
}

test('code du sondage : 6 caractères sans O, 0, I ni 1', () => {
  const code = codeSondage(Buffer.from([0, 8, 14, 24, 31, 200]));
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(jetonReponse('ABC234', 2), '[CLAIRE-ABC234-2]');
});

test('jetons lus dans un objet de réponse, préfixes RE:/TR: compris', () => {
  assert.equal(JSON.stringify(jetonsDansObjet('RE: [CLAIRE-ABC234-2] Créneau 2 : mardi 20 octobre à 10 h 00')), JSON.stringify([{ code: 'ABC234', n: 2 }]));
  assert.equal(JSON.stringify(jetonsDansObjet('TR: [claire-abc234-0] Aucun créneau ne convient')), JSON.stringify([{ code: 'ABC234', n: 0 }]));
  assert.equal(jetonsDansObjet('Votre dossier DURAND').length, 0);
  // Un code avec O/0/I/1 n'est pas un code de CLAIRE.
  assert.equal(jetonsDansObjet('[CLAIRE-ABC0I1-2]').length, 0);
});

test('réponses : un email par créneau s’ajoute, « aucun » efface, l’expéditeur est rapproché du participant', () => {
  const s = sondageExemple();
  const emails = [
    { sujet: 'RE: [CLAIRE-ABC234-1] Créneau 1', deAdresse: 'paul.durand@exemple.fr', recuLe: '2026-10-01T09:00:00Z' },
    { sujet: '[CLAIRE-ABC234-2] Créneau 2', deAdresse: 'paul.durand@exemple.fr', recuLe: '2026-10-01T09:01:00Z' },
    { sujet: '[CLAIRE-ABC234-1] Créneau 1', deAdresse: 'lea.martin@exemple.fr', recuLe: '2026-10-01T10:00:00Z' },
    { sujet: '[CLAIRE-ABC234-0] Aucun créneau ne convient', deAdresse: 'lea.martin@exemple.fr', recuLe: '2026-10-01T11:00:00Z' },
    // Code d'un autre sondage, créneau inexistant : ignorés.
    { sujet: '[CLAIRE-ZZZ234-1] Créneau 1', deAdresse: 'lea.martin@exemple.fr', recuLe: '2026-10-01T12:00:00Z' },
    { sujet: '[CLAIRE-ABC234-4] Créneau 4', deAdresse: 'paul.durand@exemple.fr', recuLe: '2026-10-01T12:00:00Z' }
  ];
  const { nouvelles } = appliquerReponses([s], emails);
  assert.equal(nouvelles.length, 4);
  const paul = s.reponses.find((r) => r.email === 'paul.durand@exemple.fr');
  const lea = s.reponses.find((r) => r.email === 'lea.martin@exemple.fr');
  assert.equal(paul.choix.join(','), '1,2');
  assert.equal(paul.nom, 'Paul DURAND');
  assert.equal(lea.aucun, true);
  assert.equal(lea.choix.length, 0);
  // Relire la même boîte ne recompte rien.
  assert.equal(appliquerReponses([s], emails).nouvelles.length, 0);
  const synthese = syntheseSondage(s);
  assert.equal(synthese[0].accepte, 1);
  assert.equal(synthese[0].tous, false);
});

test('réponse « en une seule fois » : les lignes cochées d’un X remplacent les choix', () => {
  assert.equal(JSON.stringify(jetonsDansObjet('RE: [CLAIRE-ABC234-L] Mes disponibilités')), JSON.stringify([{ code: 'ABC234', liste: true }]));
  const texte = 'Mettez un X…\r\n\r\n[X] 1 - Mardi 20 octobre\r\n[ ] 2 - Mercredi 21 octobre\r\n[ x ] 3 - inexistant\r\n> [X] 2 - cité\r\nCordialement';
  assert.equal(choixDepuisTexteListe(texte, [1, 2]).join(','), '1');
  assert.equal(choixDepuisTexteListe('[✓] 2 - Mercredi', [1, 2]).join(','), '2');
  const s = sondageExemple();
  // Choix précédent par bouton (créneau 2), puis réponse groupée qui coche le 1 seulement.
  appliquerReponses([s], [{ sujet: '[CLAIRE-ABC234-2]', deAdresse: 'paul.durand@exemple.fr', recuLe: '2026-10-01T09:00:00Z' }]);
  const emails = [{ itemId: 'M1', sujet: '[CLAIRE-ABC234-L] Mes disponibilités', deAdresse: 'paul.durand@exemple.fr', recuLe: '2026-10-01T10:00:00Z' }];
  assert.equal(reponsesListeALire([s], emails).length, 1);
  // Texte pas encore lu : rien ne change.
  assert.equal(appliquerReponses([s], emails).nouvelles.length, 0);
  emails[0].choixListe = [1];
  assert.equal(appliquerReponses([s], emails).nouvelles.length, 1);
  assert.equal(s.reponses[0].choix.join(','), '1');
  // Déjà comptée : plus rien à lire.
  assert.equal(reponsesListeALire([s], emails).length, 0);
});

test('lecture du texte : GetItem en texte brut ; identifiant et texte relus', () => {
  const c = corpsLireTextesReponses(['ID&1']);
  assert.match(c, /<t:BodyType>Text<\/t:BodyType>/);
  assert.match(c, /<t:ItemId Id="ID&amp;1"\/>/);
  const textes = parseTextesReponses('<m:Items><t:Message><t:ItemId Id="ID1" ChangeKey="k"/><t:Body BodyType="Text">[X] 1 - Mardi &amp; co</t:Body></t:Message></m:Items>');
  assert.equal(textes.get('ID1'), '[X] 1 - Mardi & co');
  const msgs = parseFindReponses('<t:Message><t:ItemId Id="ID9" ChangeKey="k"/><t:Subject>[CLAIRE-ABC234-L] Mes disponibilités</t:Subject><t:From><t:Mailbox><t:Name>Paul</t:Name><t:EmailAddress>Paul.Durand@exemple.fr</t:EmailAddress></t:Mailbox></t:From><t:DateTimeReceived>2026-10-01T10:00:00Z</t:DateTimeReceived></t:Message>');
  assert.equal(msgs[0].itemId, 'ID9');
  assert.equal(msgs[0].deAdresse, 'paul.durand@exemple.fr');
});

test('réponse venue de la page : « P13 » = créneaux 1 et 3, « P0 » = aucun, remplace les choix', () => {
  assert.equal(JSON.stringify(jetonsDansObjet('RE: [CLAIRE-ABC234-P12] VTE - DUR./MAR. — Choix : mar. 20/10 10 h 00')), JSON.stringify([{ code: 'ABC234', page: true, choix: [1, 2], siBesoin: [] }]));
  const s = sondageExemple();
  appliquerReponses([s], [{ sujet: '[CLAIRE-ABC234-P2] VTE - DUR.', deAdresse: 'paul.durand@exemple.fr', recuLe: '2026-10-01T09:00:00Z' }]);
  assert.equal(s.reponses[0].choix.join(','), '2');
  appliquerReponses([s], [{ sujet: '[CLAIRE-ABC234-P12]', deAdresse: 'paul.durand@exemple.fr', recuLe: '2026-10-01T10:00:00Z' }]);
  assert.equal(s.reponses[0].choix.join(','), '1,2');
  appliquerReponses([s], [{ sujet: '[CLAIRE-ABC234-P0] VTE - DUR. — Aucun créneau ne convient', deAdresse: 'paul.durand@exemple.fr', recuLe: '2026-10-01T11:00:00Z' }]);
  assert.equal(s.reponses[0].aucun, true);
  assert.equal(s.reponses[0].choix.length, 0);
});

test('page : « si nécessaire » (S) compté à part ; un créneau possible pour tous', () => {
  assert.equal(JSON.stringify(jetonsDansObjet('[CLAIRE-ABC234-P1S2] VTE - DUR.')), JSON.stringify([{ code: 'ABC234', page: true, choix: [1], siBesoin: [2] }]));
  assert.equal(JSON.stringify(jetonsDansObjet('[CLAIRE-ABC234-PS12]')), JSON.stringify([{ code: 'ABC234', page: true, choix: [], siBesoin: [1, 2] }]));
  const s = sondageExemple();
  appliquerReponses([s], [
    { sujet: '[CLAIRE-ABC234-P1S2]', deAdresse: 'paul.durand@exemple.fr', recuLe: '2026-10-01T09:00:00Z' },
    { sujet: '[CLAIRE-ABC234-P2]', deAdresse: 'lea.martin@exemple.fr', recuLe: '2026-10-01T09:05:00Z' }
  ]);
  const sy = syntheseSondage(s);
  assert.equal(sy[0].accepte, 1);
  assert.equal(sy[0].tous, false);
  assert.equal(sy[1].accepte, 1);
  assert.equal(sy[1].siBesoin, 1);
  assert.equal(sy[1].tous, true);
  assert.equal(sy[1].tousOui, false);
  // Un oui par bouton efface le « si nécessaire » du même créneau.
  appliquerReponses([s], [{ sujet: '[CLAIRE-ABC234-2]', deAdresse: 'paul.durand@exemple.fr', recuLe: '2026-10-01T10:00:00Z' }]);
  assert.equal(syntheseSondage(s)[1].tousOui, true);
});

test('un créneau accepté par tous est signalé', () => {
  const s = sondageExemple();
  appliquerReponses([s], [
    { sujet: '[CLAIRE-ABC234-2]', deAdresse: 'paul.durand@exemple.fr', recuLe: '2026-10-01T09:00:00Z' },
    { sujet: '[CLAIRE-ABC234-2]', deAdresse: 'lea.martin@exemple.fr', recuLe: '2026-10-01T09:05:00Z' }
  ]);
  assert.equal(syntheseSondage(s).find((c) => c.n === 2).tous, true);
});

test('un sondage clos ne reçoit plus de réponse', () => {
  const s = sondageExemple();
  s.statut = 'annule';
  assert.equal(appliquerReponses([s], [{ sujet: '[CLAIRE-ABC234-1]', deAdresse: 'paul.durand@exemple.fr', recuLe: '2026-10-01T09:00:00Z' }]).nouvelles.length, 0);
});

test('FindItem des réponses : objet « CLAIRE- », boîte de réception, jamais le corps ni l’aperçu', () => {
  const c = corpsFindReponsesSondages('2026-10-01T08:00:00.000Z');
  assert.match(c, /<t:Constant Value="CLAIRE-"\/>/);
  assert.match(c, /DistinguishedFolderId Id="inbox"/);
  assert.doesNotMatch(c, /item:Body|item:Preview/);
});

test('option d’agenda : provisoire, sans rappel ; reconnue à la lecture et jamais prise pour la signature', () => {
  const c = corpsCreateRendezVous({ sujet: 'VTE - DURAND ? — option CLAIRE, créneau 1/2', dateStr: '2026-10-20', heureStr: '10:00', dureeMinutes: 60, provisoire: true });
  assert.match(c, /<t:LegacyFreeBusyStatus>Tentative<\/t:LegacyFreeBusyStatus>/);
  assert.match(c, /<t:ReminderIsSet>false<\/t:ReminderIsSet>/);
  const normal = corpsCreateRendezVous({ sujet: 'VTE - DURAND', dateStr: '2026-10-20', heureStr: '10:00', dureeMinutes: 60 });
  assert.match(normal, /<t:LegacyFreeBusyStatus>Busy<\/t:LegacyFreeBusyStatus>/);
  const [e] = evenementsAgendaOffice([{ sujet: 'VTE - DURAND ? — option CLAIRE, créneau 1/2', date: '2026-10-20', heure: '10:00', heureFin: '11:00' }], [{ id: 'd1', nom: 'DURAND' }]);
  assert.equal(e.option, true);
  assert.equal(e.signature, false);
  assert.equal(e.dossierId, 'd1');
});

// ---- Routes ----

let db, serveurApp, baseUrl, jeton;
const appelsEws = [];
let boite = [];
let refuserIdentifiants = false;

function fauxPoster(options, cb) {
  const body = String(options.body || '');
  appelsEws.push(body);
  if (refuserIdentifiants) return cb(null, { statusCode: 401, body: '' });
  if (/<m:CreateItem/.test(body)) {
    const n = appelsEws.filter((b) => /<m:CreateItem/.test(b)).length;
    return cb(null, { statusCode: 200, body: `<m:CreateItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><t:ItemId Id="OPT${n}" ChangeKey="CK${n}"/></m:CreateItemResponseMessage>` });
  }
  if (/<m:UpdateItem/.test(body)) return cb(null, { statusCode: 200, body: '<m:UpdateItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Items><t:CalendarItem><t:ItemId Id="MAJ" ChangeKey="CK-MAJ"/></t:CalendarItem></m:Items></m:UpdateItemResponseMessage>' });
  if (/<m:DeleteItem/.test(body)) return cb(null, { statusCode: 200, body: '<m:DeleteItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode></m:DeleteItemResponseMessage>' });
  if (/<m:GetItem/.test(body)) {
    const ids = [...body.matchAll(/<t:ItemId Id="([^"]+)"/g)].map((m) => m[1]);
    return cb(null, { statusCode: 200, body: `<m:GetItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Items>${ids.map((id) => `<t:Message><t:ItemId Id="${id}" ChangeKey="k"/><t:Body BodyType="Text">${(boite.find((m) => m.id === id) || {}).texte || ''}</t:Body></t:Message>`).join('')}</m:Items></m:GetItemResponseMessage>` });
  }
  if (/<m:FindItem/.test(body)) {
    const messages = boite.map((m) => `<t:Message><t:ItemId Id="${m.id || 'X'}" ChangeKey="k"/><t:Subject>${m.sujet}</t:Subject><t:From><t:Mailbox><t:Name>${m.nom}</t:Name><t:EmailAddress>${m.adresse}</t:EmailAddress></t:Mailbox></t:From><t:DateTimeReceived>${m.recuLe}</t:DateTimeReceived></t:Message>`).join('');
    return cb(null, { statusCode: 200, body: `<m:FindItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:RootFolder><t:Items>${messages}</t:Items></m:RootFolder></m:FindItemResponseMessage>` });
  }
  cb(null, { statusCode: 500, body: '' });
}

before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({
    db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' },
    sondages: { poster: fauxPoster, aleatoire: Buffer.from([0, 1, 2, 3, 4, 5]) }
  });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  serveurApp.close();
  db.close();
});

beforeEach(() => { refuserIdentifiants = false; reinitialiserDisjoncteurAgenda(); });

function appeler(chemin, options) {
  return fetch(`${baseUrl}${chemin}`, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(options && options.headers) }
  });
}

const corpsCreation = {
  dossierId: 'd1', dossierNom: 'DURAND', libelle: 'VTE - DURAND', poserOptions: true,
  creneaux: [{ date: '2026-10-20', heure: '10:00', dureeMinutes: 60 }, { date: '2026-10-21', heure: '15:00', dureeMinutes: 60 }],
  participants: [
    { role: 'vendeur', nom: 'Paul DURAND', email: 'paul.durand@exemple.fr' },
    { role: 'acquereur', nom: 'Léa MARTIN', email: 'lea.martin@exemple.fr' }
  ]
};

test('POST /api/sondages refuse sans connexion Exchange configurée', async () => {
  const r = await appeler('/api/sondages', { method: 'POST', body: JSON.stringify(corpsCreation) });
  assert.equal(r.status, 400);
  assert.match((await r.json()).message, /Exchange/);
});

test('sondage complet : création avec options, réponses relues, placement qui retire les options', async () => {
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: true, email: 'bastien@office.fr', motDePasse: 'SECRET' }) });
  appelsEws.length = 0;
  const cree = await (await appeler('/api/sondages', { method: 'POST', body: JSON.stringify(corpsCreation) })).json();
  assert.equal(cree.ok, true);
  const s = cree.sondage;
  assert.equal(s.adresseReponse, 'bastien@office.fr');
  // Un code personnel distinct par destinataire.
  assert.match(s.participants[0].cle, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.notEqual(s.participants[0].cle, s.participants[1].cle);
  assert.equal(s.creneaux.filter((c) => c.option).length, 2);
  assert.equal(appelsEws.length, 2);
  assert.match(appelsEws[0], /VTE - DURAND \? — option CLAIRE, créneau 1\/2/);
  assert.match(appelsEws[0], /Tentative/);
  // Aucun mot de passe ni changeKey renvoyé.
  assert.doesNotMatch(JSON.stringify(cree), /SECRET|CK1/);

  // Un second sondage ouvert sur le même dossier est refusé.
  assert.equal((await appeler('/api/sondages', { method: 'POST', body: JSON.stringify(corpsCreation) })).status, 409);

  boite = [
    { sujet: `RE: [CLAIRE-${s.code}-2] Créneau 2`, nom: 'Paul', adresse: 'paul.durand@exemple.fr', recuLe: '2099-01-01T09:00:00Z' },
    { id: 'LISTE1', sujet: `[CLAIRE-${s.code}-L] Mes disponibilités`, nom: 'Léa', adresse: 'lea.martin@exemple.fr', recuLe: '2099-01-01T09:10:00Z', texte: '[ ] 1 - Mardi\n[X] 2 - Mercredi' }
  ];
  const relu = await (await appeler(`/api/sondages/${s.id}/relire`, { method: 'POST', body: '{}' })).json();
  assert.equal(relu.ok, true);
  assert.equal(relu.sondage.synthese.find((c) => c.n === 2).tous, true);

  appelsEws.length = 0;
  const place = await (await appeler(`/api/sondages/${s.id}/placer`, { method: 'POST', body: JSON.stringify({ n: 2 }) })).json();
  assert.equal(place.ok, true);
  assert.equal(place.sondage.statut, 'place');
  assert.equal(place.sondage.choisi, 2);
  assert.equal(appelsEws.filter((b) => /DeleteType="MoveToDeletedItems"/.test(b)).length, 2);
  assert.equal(appelsEws.some((b) => /HardDelete/.test(b)), false);

  const liste = await (await appeler('/api/sondages?dossierId=d1')).json();
  assert.equal(liste.sondages.length, 1);
  assert.equal(liste.sondages[0].statut, 'place');
});

test('annulation : options retirées ; identifiants refusés à la relecture → message, rien d’écrit', async () => {
  const cree = await (await appeler('/api/sondages', { method: 'POST', body: JSON.stringify({ ...corpsCreation, dossierId: 'd2', poserOptions: false }) })).json();
  assert.equal(cree.ok, true);
  assert.equal(cree.sondage.creneaux.every((c) => !c.option), true);
  refuserIdentifiants = true;
  const relu = await (await appeler(`/api/sondages/${cree.sondage.id}/relire`, { method: 'POST', body: '{}' })).json();
  assert.equal(relu.ok, false);
  assert.match(relu.message, /refusés/);
  refuserIdentifiants = false;
  const annule = await (await appeler(`/api/sondages/${cree.sondage.id}/annuler`, { method: 'POST', body: '{}' })).json();
  assert.equal(annule.sondage.statut, 'annule');
  assert.equal((await appeler(`/api/sondages/${cree.sondage.id}/annuler`, { method: 'POST', body: '{}' })).status, 409);
});

test('sondage sans dossier : titre obligatoire, plusieurs sondages possibles, options au nom du titre', async () => {
  const sansDossier = { ...corpsCreation, dossierId: '', dossierNom: '', libelle: '', poserOptions: true,
    participants: [{ role: 'autre', nom: 'Agence Exemple', email: 'agence@exemple.fr' }, { role: 'autre', nom: 'Me LEBRUN', email: 'office@confrere.test', confrere: true }] };
  assert.equal((await appeler('/api/sondages', { method: 'POST', body: JSON.stringify(sansDossier) })).status, 400, 'sans titre ni dossier');
  appelsEws.length = 0;
  const cree = await (await appeler('/api/sondages', { method: 'POST', body: JSON.stringify({ ...sansDossier, titre: 'Réunion ? avec l’agence' }) })).json();
  assert.equal(cree.ok, true);
  assert.equal(cree.sondage.dossierId, '');
  assert.equal(cree.sondage.titre, 'Réunion avec l’agence', 'le « ? » est réservé aux options');
  assert.match(appelsEws[0], /Réunion avec l’agence \? — option CLAIRE, créneau 1\/2/);
  assert.equal(cree.sondage.participants[1].confrere, true);
  const second = await (await appeler('/api/sondages', { method: 'POST', body: JSON.stringify({ ...sansDossier, poserOptions: false, titre: 'Point syndic' }) })).json();
  assert.equal(second.ok, true, 'plusieurs sondages sans dossier ouverts en même temps');
});

test('options seules (étude 07/10) : sans destinataire, options posées sans email, « Placer » retire les autres', async () => {
  const corps = { dossierId: 'd5', dossierNom: 'ROUX', libelle: 'VTE - ROUX', optionsSeules: true, participants: [],
    creneaux: [{ date: '2026-10-22', heure: '14:00', dureeMinutes: 60 }, { date: '2026-10-23', heure: '10:00', dureeMinutes: 60 }] };
  // Sans « optionsSeules », un sondage sans destinataire reste refusé.
  assert.equal((await appeler('/api/sondages', { method: 'POST', body: JSON.stringify({ ...corps, optionsSeules: false }) })).status, 400);
  appelsEws.length = 0;
  const cree = await (await appeler('/api/sondages', { method: 'POST', body: JSON.stringify(corps) })).json();
  assert.equal(cree.ok, true);
  assert.equal(cree.sondage.optionsSeules, true);
  assert.equal(cree.sondage.participants.length, 0);
  assert.equal(cree.sondage.creneaux.filter((c) => c.option).length, 2);
  assert.equal(appelsEws.length, 2, 'deux options, aucun autre appel');
  assert.match(appelsEws[0], /VTE - ROUX \? — option CLAIRE, créneau 1\/2/);
  assert.match(appelsEws[0], /sans email aux parties/);
  // Plus de retrait sans décision (étude 07/10) : aucune date limite, et un sondage d'avant à la date passée reste ouvert.
  assert.equal(cree.sondage.expireLe, '');
  assert.match(appelsEws[0], /gardée tant que rien n’est décidé/);
  const repo = creerRepoParametres(db);
  repo.ecrireSondagesCreneaux(repo.lireSondagesCreneaux().map((x) => x.id === cree.sondage.id ? { ...x, expireLe: '2026-01-05' } : x));
  appelsEws.length = 0;
  const relu = await (await appeler(`/api/sondages/${cree.sondage.id}/relire`, { method: 'POST', body: '{}' })).json();
  assert.equal(relu.sondage.statut, 'ouvert');
  assert.equal(appelsEws.some((b) => /DeleteItem/.test(b)), false, 'aucune option retirée d’elle-même');
  appelsEws.length = 0;
  const place = await (await appeler(`/api/sondages/${cree.sondage.id}/placer`, { method: 'POST', body: JSON.stringify({ n: 1 }) })).json();
  assert.equal(place.sondage.statut, 'place');
  assert.equal(appelsEws.filter((b) => /DeleteType="MoveToDeletedItems"/.test(b)).length, 2);
  // Aucune option posée (Exchange refuse) : rien n'est gardé.
  refuserIdentifiants = true;
  const refuse = await (await appeler('/api/sondages', { method: 'POST', body: JSON.stringify({ ...corps, dossierId: 'd6' }) })).json();
  assert.equal(refuse.ok, false);
  assert.match(refuse.message, /Options posées : 0\/2/);
  refuserIdentifiants = false;
  const liste = await (await appeler('/api/sondages?dossierId=d6')).json();
  assert.equal(liste.sondages.length, 0);
});

test('dernière option restée seule (étude 07/10) : trouvée seulement sur un agenda relu après la pose, complet, qui couvre les options', () => {
  const s = assainirSondage({ id: 's9', code: 'ABCDEF', dossierId: 'd9', dossierNom: 'ROUX', statut: 'ouvert', optionsSeules: true,
    creeLe: '2026-10-07T10:00:00.000Z', libelle: 'VTE - ROUX', participants: [],
    creneaux: [{ date: '2026-10-22', heure: '14:00', option: { itemId: 'A', changeKey: 'a' } }, { date: '2026-10-23', heure: '10:00', option: { itemId: 'B', changeKey: 'b' } }] });
  const evt = (id, date, heure) => ({ itemId: id, changeKey: 'k', sujet: 'VTE - ROUX ? — option CLAIRE, créneau 2/2', date, heure, heureFin: '11:00', option: true });
  const agenda = (evenements, lu) => ({ debut: '2026-09-28', lu: lu || '2026-10-07T10:05:00.000Z', evenements });
  assert.equal(optionRestanteSeule(s, agenda([evt('A', '2026-10-22', '14:00'), evt('B', '2026-10-23', '10:00')])), null, 'les deux encore là');
  assert.equal(optionRestanteSeule(s, agenda([])), null, 'toutes effacées : rien à placer');
  const trouve = optionRestanteSeule(s, agenda([evt('B', '2026-10-23', '10:00')]));
  assert.equal(trouve && trouve.n, 2);
  // Agenda relu avant la pose des options, ou qui ne couvre pas la date d'une option : jamais cru.
  assert.equal(optionRestanteSeule(s, agenda([evt('B', '2026-10-23', '10:00')], '2026-10-07T09:00:00.000Z')), null);
  assert.equal(optionRestanteSeule(s, { ...agenda([evt('B', '2026-10-23', '10:00')]), debut: '2026-04-01' }), null);
  // Une seule option posée, un sondage clos ou un essai déjà manqué : rien.
  assert.equal(optionRestanteSeule({ ...s, creneaux: [s.creneaux[1]] }, agenda([evt('B', '2026-10-23', '10:00')])), null);
  assert.equal(optionRestanteSeule({ ...s, statut: 'place' }, agenda([evt('B', '2026-10-23', '10:00')])), null);
  assert.equal(optionRestanteSeule({ ...s, placementSeulEchoue: '2026-10-07T11:00:00.000Z' }, agenda([evt('B', '2026-10-23', '10:00')])), null);
  // Titre : libellé gardé, sinon celui de l'option sans « ? — option CLAIRE ».
  assert.equal(sujetPlacementOption(s, evt('B')), 'VTE - ROUX');
  assert.equal(sujetPlacementOption({ ...s, libelle: '' }, { sujet: 'SUCC - PETIT ? — option CLAIRE, créneau 1/3' }), 'SUCC - PETIT');
});

test('dernière option restée seule : devient le rendez-vous (titre sans « ? », occupé, rappel), sondage clos, rien de retiré', async () => {
  const corps = { dossierId: 'd7', dossierNom: 'ROUX', libelle: 'VTE - ROUX', optionsSeules: true, participants: [],
    creneaux: [{ date: '2026-10-22', heure: '14:00', dureeMinutes: 60 }, { date: '2026-10-23', heure: '10:00', dureeMinutes: 60 }] };
  const cree = await (await appeler('/api/sondages', { method: 'POST', body: JSON.stringify(corps) })).json();
  assert.equal(cree.ok, true);
  assert.equal(cree.sondage.libelle, 'VTE - ROUX');
  const [o1, o2] = cree.sondage.creneaux.map((c) => c.option);
  // L'option 1 effacée à la main dans Outlook ; la relecture de l'agenda ne voit plus que la 2.
  const repo = creerRepoParametres(db);
  repo.ecrireAgendaOffice({ debut: '2026-09-28', lu: new Date(Date.now() + 1000).toISOString(), evenements: [
    { itemId: o2.itemId, changeKey: o2.changeKey, sujet: 'VTE - ROUX ? — option CLAIRE, créneau 2/2', date: '2026-10-23', heure: '10:00', heureFin: '11:00', option: true }
  ] });
  appelsEws.length = 0;
  const relu = await (await appeler(`/api/sondages/${cree.sondage.id}/relire`, { method: 'POST', body: '{}' })).json();
  assert.equal(relu.sondage.statut, 'place');
  assert.equal(relu.sondage.choisi, 2);
  assert.equal(relu.sondage.placeSeul, true);
  const maj = appelsEws.find((b) => /<m:UpdateItem/.test(b));
  assert.ok(maj, 'la dernière option est modifiée');
  assert.match(maj, new RegExp('Id="' + o2.itemId + '"'));
  assert.match(maj, /<t:Subject>VTE - ROUX<\/t:Subject>/);
  assert.match(maj, /<t:LegacyFreeBusyStatus>Busy<\/t:LegacyFreeBusyStatus>/);
  assert.match(maj, /<t:ReminderIsSet>true<\/t:ReminderIsSet>/);
  assert.equal(appelsEws.some((b) => /<m:DeleteItem/.test(b)), false, 'rien de retiré : l’option est devenue le rendez-vous');
  const stocke = repo.lireAgendaOffice().evenements.find((e) => e.itemId === o2.itemId);
  assert.equal(stocke.sujet, 'VTE - ROUX');
  assert.equal(stocke.option, false);
  assert.ok(!o1 || !repo.lireAgendaOffice().evenements.some((e) => e.itemId === o1.itemId));
});

test('créneau invalide ou adresse invalide : 400', async () => {
  const r1 = await appeler('/api/sondages', { method: 'POST', body: JSON.stringify({ ...corpsCreation, dossierId: 'd3', creneaux: [{ date: '20/10/2026', heure: '10:00' }] }) });
  assert.equal(r1.status, 400);
  const r2 = await appeler('/api/sondages', { method: 'POST', body: JSON.stringify({ ...corpsCreation, dossierId: 'd3', participants: [{ role: 'vendeur', email: 'pas-une-adresse' }] }) });
  assert.equal(r2.status, 400);
});

test('code personnel : la réponse relayée (expéditeur = Gmail de l’étude) est rattachée au bon destinataire', () => {
  const s = sondageExemple();
  s.participants[0].cle = 'AB2C';
  s.participants[1].cle = 'XY3Z';
  const { nouvelles } = appliquerReponses([s], [
    { sujet: '[CLAIRE-ABC234-P1S2-XY3Z] VTE - DUR. — Oui : …', deAdresse: 'relais.etude@gmail.com', recuLe: '2026-10-01T09:00:00Z' },
    // Code inconnu : écarté (pas de réponse fantôme au nom de l'expéditeur).
    { sujet: '[CLAIRE-ABC234-P2-ZZZZ] VTE - DUR.', deAdresse: 'relais.etude@gmail.com', recuLe: '2026-10-01T09:05:00Z' }
  ]);
  assert.equal(nouvelles.length, 1);
  assert.equal(s.reponses.length, 1);
  assert.equal(s.reponses[0].email, 'lea.martin@exemple.fr');
  assert.equal(s.reponses[0].choix.join(','), '1');
  assert.equal(s.reponses[0].siBesoin.join(','), '2');
});

test('relais Google : objet contrôlé, destinataire fixe, plafond horaire, rien d’autre', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const code = fs.readFileSync(require('node:path').join(__dirname, '../../page-sondage/relais-google-apps-script.gs'), 'utf8');
  const envoyes = [];
  const cache = new Map();
  const ctx = {
    MailApp: { sendEmail: (o) => envoyes.push(o) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const poster = (corps) => ctx.doPost({ postData: { contents: JSON.stringify(corps) } });
  assert.equal(poster({ sujet: '[CLAIRE-ABC234-P13S2-XY3Z] VTE - MOR./FAU. — Oui : mer. 14/10', corps: 'Bonjour', a: 'pirate@exemple.fr' }).ok, true);
  assert.equal(envoyes.length, 1);
  assert.equal(envoyes[0].to, ctx.DESTINATAIRE);
  assert.equal(poster({ sujet: 'Bonjour', corps: 'spam' }).ok, false);
  assert.equal(poster({ sujet: '[CLAIRE-ABC234-P1] sans code personnel', corps: '' }).ok, false);
  assert.equal(poster({ sujet: '[CLAIRE-ABC234-P1-XY3Z] a\nBcc: x@y.fr', corps: '' }).ok, false);
  cache.set('envois', '200');
  assert.equal(poster({ sujet: '[CLAIRE-ABC234-P1-XY3Z] x', corps: '' }).ok, false);
  assert.equal(envoyes.length, 1);
});
