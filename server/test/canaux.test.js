'use strict';
// Canaux de CLAIRE (0.328.0) : messages partagés, non-lus et mentions, préférences, canaux libres, silences, dépôt d'une proposition dans
// le canal du dossier, notification de mention, routes. Noms inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const C = require('../src/canaux/canaux');
const { deposerProposition } = require('../src/canaux/deposer');
const { creerNotifieur } = require('../src/canaux/notifier');
const { lirePropositions } = require('../src/routines/propositions');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

function fauxRepo(reglagesMail) {
  const m = new Map();
  return { lireJsonBrut: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), ecrireJsonBrut: (k, v) => { m.set(k, JSON.stringify(v)); }, lireReglages: () => reglagesMail || {} };
}
const COLLABS = ['Bastien ANGLUMENT', 'Julie VASSELIN', 'Jérémy SAUJOT'];
const MAIL = { emailActif: true, smtpHote: 'smtp.exemple.fr', emailPasserelle: 'passerelle@exemple.fr', emailsResponsables: { 'Julie VASSELIN': 'julie@exemple.fr' } };

test('canaux : identifiants valides, un canal par dossier', () => {
  assert.ok(C.canalValide('general') && C.canalValide('d:p1') && C.canalValide('l:compta'));
  assert.ok(!C.canalValide('d:') && !C.canalValide('../x') && !C.canalValide('d:a b') && !C.canalValide(5));
  assert.equal(C.canalDuDossier('p1'), 'd:p1');
});

test('mentions : « @Julie » (accents et casse ignorés) et « @CLAIRE », jamais dans un mot', () => {
  const m = C.mentionsDansTexte('@julie et @Jeremy, regardez ça. @CLAIRE aussi', COLLABS);
  assert.deepEqual(m.collaborateurs, ['Julie VASSELIN', 'Jérémy SAUJOT']);
  assert.equal(m.claire, true);
  assert.deepEqual(C.mentionsDansTexte('mail@julie.fr', COLLABS).collaborateurs, []);
});

test('messages : ajout, ordre, 300 au plus, index et extrait', () => {
  const repo = fauxRepo();
  for (let i = 0; i < 305; i++) C.ajouterMessage(repo, 'd:p1', { auteur: 'Julie VASSELIN', texte: `message ${i}` }, 1000 + i);
  const l = C.lireMessages(repo, 'd:p1');
  assert.equal(l.length, 300);
  assert.equal(l[299].texte, 'message 304');
  assert.equal(C.lireIndex(repo)['d:p1'].extrait, 'message 304');
  assert.equal(C.ajouterMessage(repo, '../x', { texte: 'a' }), null);
  assert.equal(C.ajouterMessage(repo, 'general', { texte: '   ' }), null);
});

test('modifier ou supprimer : seulement son propre message, jamais celui de CLAIRE ; épingler est ouvert', () => {
  const repo = fauxRepo();
  const m = C.ajouterMessage(repo, 'general', { auteur: 'Julie VASSELIN', texte: 'bonjour' }, 10);
  const c = C.ajouterMessage(repo, 'general', { auteur: 'CLAIRE', claire: true, texte: 'je propose' }, 11);
  assert.equal(C.changerMessage(repo, 'general', m.id, 'Bastien ANGLUMENT', { texte: 'x' }), null, 'pas celui d’un autre');
  assert.equal(C.changerMessage(repo, 'general', c.id, 'CLAIRE', { supprimer: true }), null, 'pas celui de CLAIRE');
  assert.equal(C.changerMessage(repo, 'general', m.id, 'Julie VASSELIN', { texte: 'bonjour à tous' }).texte, 'bonjour à tous');
  assert.equal(C.changerMessage(repo, 'general', c.id, 'Bastien ANGLUMENT', { epingle: true }).epingle, true);
  assert.ok(C.changerMessage(repo, 'general', m.id, 'Julie VASSELIN', { supprimer: true }));
  assert.equal(C.lireMessages(repo, 'general').length, 1);
});

test('non-lus : ceux des autres seulement, mentions à part, lu = remis à zéro, muet = hors badge', () => {
  const repo = fauxRepo();
  C.ajouterMessage(repo, 'd:p1', { auteur: 'Bastien ANGLUMENT', texte: 'a', mentions: ['Julie VASSELIN'] }, 100);
  C.ajouterMessage(repo, 'd:p1', { auteur: 'Bastien ANGLUMENT', texte: 'b' }, 200);
  C.ajouterMessage(repo, 'd:p1', { auteur: 'Julie VASSELIN', texte: 'moi' }, 300);
  let l = C.listerCanaux(repo, 'Julie VASSELIN');
  const c = l.canaux.find((x) => x.id === 'd:p1');
  assert.equal(c.nonLus, 2); assert.equal(c.mentions, 1); assert.equal(l.badge, 2);
  C.reglerPreferences(repo, 'Julie VASSELIN', 'd:p1', { notif: 'mentions' });
  assert.equal(C.listerCanaux(repo, 'Julie VASSELIN').badge, 1);
  C.reglerPreferences(repo, 'Julie VASSELIN', 'd:p1', { notif: 'muet', favori: true });
  l = C.listerCanaux(repo, 'Julie VASSELIN');
  assert.equal(l.badge, 0); assert.equal(l.canaux.find((x) => x.id === 'd:p1').favori, true);
  C.reglerPreferences(repo, 'Julie VASSELIN', 'd:p1', { notif: 'tous' });
  C.marquerLu(repo, 'Julie VASSELIN', 'd:p1', 1000);
  assert.equal(C.listerCanaux(repo, 'Julie VASSELIN').badge, 0);
  assert.equal(C.reglerPreferences(repo, 'Julie VASSELIN', 'd:p1', { notif: 'nimporte' }).notif, 'tous', 'préférence inconnue refusée');
});

test('canaux libres : nom → identifiant, doublon et limite refusés', () => {
  const repo = fauxRepo();
  assert.deepEqual(C.creerCanalLibre(repo, 'Compta & fonds', 'Julie VASSELIN'), { ok: true, id: 'l:compta-fonds', nom: 'Compta & fonds' });
  assert.equal(C.creerCanalLibre(repo, 'compta fonds', 'Julie VASSELIN').ok, false);
  assert.equal(C.creerCanalLibre(repo, '   ', 'Julie VASSELIN').ok, false);
  assert.ok(C.listerCanaux(repo, 'Julie VASSELIN').canaux.some((c) => c.id === 'l:compta-fonds' && c.libre));
});

test('proposition déposée : message de CLAIRE avec sa carte dans le canal du dossier, « général » sans dossier, jamais refaite', () => {
  const repo = fauxRepo();
  const p = { id: 'x1', routine: 'revue-matin', responsable: 'Julie VASSELIN', dossierId: 'p1', type: 'email', titre: 'Relance du prêt', resume: 'Brouillon prêt.', empreinte: 'e1' };
  assert.equal(deposerProposition(repo, p).ok, true);
  assert.equal(deposerProposition(repo, p).ok, false, 'même empreinte : jamais refaite');
  const m = C.lireMessages(repo, 'd:p1')[0];
  assert.equal(m.carte, 'x1'); assert.equal(m.claire, true); assert.equal(m.pour, 'Julie VASSELIN');
  assert.equal(C.listerCanaux(repo, 'Julie VASSELIN').canaux.find((c) => c.id === 'd:p1').mentions, 1, 'la carte compte pour son destinataire');
  deposerProposition(repo, { id: 'x2', routine: 'revue-matin', responsable: 'Julie VASSELIN', type: 'tache', titre: 'Sans dossier', empreinte: 'e2' });
  assert.equal(C.lireMessages(repo, 'general').length, 1);
  assert.equal(lirePropositions(repo).length, 2);
});

test('« Jamais pour ce dossier » : rien n’est déposé, pour une routine ou pour toutes', () => {
  const repo = fauxRepo();
  C.silencer(repo, 'p1', 'revue-matin', 'Julie VASSELIN');
  const base = { responsable: 'Julie VASSELIN', dossierId: 'p1', type: 'tache', titre: 'T' };
  assert.equal(deposerProposition(repo, Object.assign({ id: 'a', routine: 'revue-matin', empreinte: '1' }, base)).silence, true);
  assert.equal(deposerProposition(repo, Object.assign({ id: 'b', routine: 'appel-fonds', empreinte: '2' }, base)).ok, true);
  C.silencer(repo, 'p1', '', 'Julie VASSELIN');
  assert.equal(deposerProposition(repo, Object.assign({ id: 'c', routine: 'appel-fonds', empreinte: '3' }, base)).silence, true);
  C.leverSilence(repo, 'p1', '');
  C.leverSilence(repo, 'p1', 'revue-matin');
  assert.equal(deposerProposition(repo, Object.assign({ id: 'd', routine: 'revue-matin', empreinte: '4' }, base)).ok, true);
});

test('mention : Teams une fois par heure et par canal, pas à soi-même, pas pour un canal muet', async () => {
  const repo = fauxRepo(MAIL);
  const envoyes = [];
  const n = creerNotifieur({ parametresRepo: repo, envoyer: async (r, a, t) => { envoyes.push([a, t]); return { ok: true }; } });
  const msg = { auteur: 'Bastien ANGLUMENT', texte: '@Julie peux-tu regarder ?', mentions: ['Julie VASSELIN', 'Bastien ANGLUMENT'] };
  assert.deepEqual(await n.notifierMentions('general', msg, 1000), ['Julie VASSELIN']);
  assert.equal(envoyes.length, 1);
  assert.match(envoyes[0][1], /Bastien vous a mentionné dans # général/);
  assert.deepEqual(await n.notifierMentions('general', msg, 1000 + 60000), [], 'une fois par heure');
  assert.deepEqual(await n.notifierMentions('general', msg, 1000 + 61 * 60000), ['Julie VASSELIN']);
  C.reglerPreferences(repo, 'Julie VASSELIN', 'l:compta', { notif: 'muet' });
  assert.deepEqual(await n.notifierMentions('l:compta', msg, 1000 + 200 * 60000), [], 'canal muet');
});

test('routes : écrire, lire (signature), notification, droits, lus, préférences', async () => {
  const db = ouvrirDb(':memory:');
  const { app, parametresRepo } = creerApp({ db, config: { racineRepo: require('node:path').resolve(__dirname, '..', '..'), authActive: false, estSea: () => false } });
  const srv = app.listen(0); await new Promise((r) => srv.once('listening', r));
  const B = `http://127.0.0.1:${srv.address().port}/api`;
  const j = async (u, o) => { const r = await fetch(B + u, Object.assign({ headers: { 'Content-Type': 'application/json' } }, o)); return { s: r.status, c: await r.json().catch(() => ({})) }; };
  try {
    assert.equal((await j('/canaux/d:p1/messages', { method: 'POST', body: JSON.stringify({ auteur: 'Inconnu', texte: 'x' }) })).s, 400);
    const e = await j('/canaux/d:p1/messages', { method: 'POST', body: JSON.stringify({ auteur: 'Julie VASSELIN', texte: 'Bonjour @Bastien' }) });
    assert.equal(e.s, 200); assert.deepEqual(e.c.message.mentions, ['Bastien ANGLUMENT']);
    const l1 = await j('/canaux/d:p1/messages?utilisateur=Bastien%20ANGLUMENT');
    assert.equal(l1.c.messages.length, 1);
    assert.equal((await j(`/canaux/d:p1/messages?signature=${encodeURIComponent(l1.c.signature)}`)).c.inchange, true);
    // une réponse de CLAIRE : écrite pour le compte de celui qui l'a demandée, jamais en son nom propre
    const cl = await j('/canaux/d:p1/messages', { method: 'POST', body: JSON.stringify({ auteur: 'Julie VASSELIN', claire: true, texte: 'Voici.', html: '<p>Voici.</p>' }) });
    assert.equal(cl.c.message.auteur, 'CLAIRE'); assert.equal(cl.c.message.via, 'Julie VASSELIN');
    const liste = await j('/canaux?utilisateur=Bastien%20ANGLUMENT');
    const c = liste.c.canaux.find((x) => x.id === 'd:p1');
    assert.equal(c.nonLus, 2); assert.equal(c.mentions, 1); assert.equal(liste.c.badge, 2);
    assert.equal((await j('/canaux/d:p1/lu', { method: 'POST', body: JSON.stringify({ utilisateur: 'Bastien ANGLUMENT' }) })).s, 200);
    assert.equal((await j('/canaux?utilisateur=Bastien%20ANGLUMENT')).c.badge, 0);
    assert.equal((await j('/canaux/d:p1/preferences', { method: 'PUT', body: JSON.stringify({ utilisateur: 'Bastien ANGLUMENT', notif: 'muet', favori: true }) })).c.preferences.favori, true);
    // droits : le message d'un autre ne se supprime pas
    assert.equal((await j(`/canaux/d:p1/messages/${e.c.message.id}?auteur=Bastien%20ANGLUMENT`, { method: 'DELETE' })).s, 403);
    assert.equal((await j(`/canaux/d:p1/messages/${e.c.message.id}?auteur=Julie%20VASSELIN`, { method: 'DELETE' })).s, 200);
    // canal libre inconnu, identifiant piégé
    assert.equal((await j('/canaux/l:nexiste-pas/messages')).s, 404);
    assert.equal((await j('/canaux/..%2Fx/messages')).s, 404);
    assert.equal((await j('/canaux', { method: 'POST', body: JSON.stringify({ auteur: 'Julie VASSELIN', nom: 'Compta' }) })).c.id, 'l:compta');
    assert.equal(parametresRepo.lireJsonBrut('canaux-libres', []).length, 1);
  } finally { srv.close(); }
});
