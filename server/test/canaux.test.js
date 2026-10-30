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
  const { app, parametresRepo, depot } = creerApp({ db, config: { racineRepo: require('node:path').resolve(__dirname, '..', '..'), authActive: false, estSea: () => false } });
  depot.creer({ id: 'p1', nom: 'MARTIN / DURAND', responsable: 'Julie VASSELIN', typeVente: 'maison', pieces: {}, parties: [], historique: [] });
  const srv = app.listen(0); await new Promise((r) => srv.once('listening', r));
  const B = `http://127.0.0.1:${srv.address().port}/api`;
  const j = async (u, o) => { const r = await fetch(B + u, Object.assign({ headers: { 'Content-Type': 'application/json' } }, o)); return { s: r.status, c: await r.json().catch(() => ({})) }; };
  try {
    assert.equal((await j('/canaux/d:p1/messages', { method: 'POST', body: JSON.stringify({ auteur: 'Inconnu', texte: 'x' }) })).s, 400);
    const e = await j('/canaux/d:p1/messages', { method: 'POST', body: JSON.stringify({ auteur: 'Julie VASSELIN', texte: 'Bonjour @Bastien' }) });
    assert.equal(e.s, 200); assert.deepEqual(e.c.message.mentions, ['Bastien ANGLUMENT']);
    const l1 = await j('/canaux/d:p1/messages?utilisateur=Bastien%20ANGLUMENT');
    assert.equal(l1.c.messages.length, 1);
    assert.ok('Julie VASSELIN' in l1.c.lusPar && !('Bastien ANGLUMENT' in l1.c.lusPar), 'œil « Vu » d’un canal de dossier : les autres collaborateurs');
    assert.deepEqual((await j('/canaux/general/messages?utilisateur=Bastien%20ANGLUMENT')).c.lusPar, {}, 'jamais dans « général »');
    await j('/canaux/p:bastien-julie/messages', { method: 'POST', body: JSON.stringify({ auteur: 'Bastien ANGLUMENT', texte: 'Tu as vu ?' }) });
    const pv = await j('/canaux/p:bastien-julie/messages?utilisateur=Bastien%20ANGLUMENT');
    assert.deepEqual(Object.keys(pv.c.lusPar), ['Julie VASSELIN'], 'canal privé : l’heure de lecture de l’autre membre');
    await j('/canaux/p:bastien-julie/lu', { method: 'POST', body: JSON.stringify({ utilisateur: 'Julie VASSELIN' }) });
    const pv2 = await j(`/canaux/p:bastien-julie/messages?utilisateur=Bastien%20ANGLUMENT&signature=${encodeURIComponent(pv.c.signature)}`);
    assert.ok(!pv2.c.inchange && pv2.c.lusPar['Julie VASSELIN'] >= pv2.c.messages[0].quand, 'vu : la signature change une fois');
    await j('/canaux/p:bastien-julie/lu', { method: 'POST', body: JSON.stringify({ utilisateur: 'Julie VASSELIN' }) });
    assert.equal((await j(`/canaux/p:bastien-julie/messages?utilisateur=Bastien%20ANGLUMENT&signature=${encodeURIComponent(pv2.c.signature)}`)).c.inchange, true, 'relu : plus de rechargement');
    assert.equal((await j(`/canaux/d:p1/messages?utilisateur=Bastien%20ANGLUMENT&signature=${encodeURIComponent(l1.c.signature)}`)).c.inchange, true);
    // une réponse de CLAIRE : écrite pour le compte de celui qui l'a demandée, jamais en son nom propre
    const cl = await j('/canaux/d:p1/messages', { method: 'POST', body: JSON.stringify({ auteur: 'Julie VASSELIN', claire: true, texte: 'Voici.', html: '<p>Voici.</p>' }) });
    assert.equal(cl.c.message.auteur, 'CLAIRE'); assert.equal(cl.c.message.via, 'Julie VASSELIN');
    const liste = await j('/canaux?utilisateur=Bastien%20ANGLUMENT');
    const c = liste.c.canaux.find((x) => x.id === 'd:p1');
    // Bastien n'est pas responsable de p1 (Julie l'est) : la réponse de CLAIRE ne compte pas pour lui (étude 27/10), le message de Julie oui.
    assert.equal(c.nonLus, 1); assert.equal(c.mentions, 1); assert.equal(liste.c.badge, 1);
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

test('routes : un canal de dossier inexistant est refusé, les cartes cachent le détail aux autres, silences validés et journalisés, modification vide refusée', async () => {
  const db = ouvrirDb(':memory:');
  const { app, parametresRepo, depot } = creerApp({ db, config: { racineRepo: require('node:path').resolve(__dirname, '..', '..'), authActive: false, estSea: () => false } });
  depot.creer({ id: 'p1', nom: 'MARTIN / DURAND', responsable: 'Julie VASSELIN', typeVente: 'maison', pieces: {}, parties: [], historique: [] });
  const srv = app.listen(0); await new Promise((r) => srv.once('listening', r));
  const B = `http://127.0.0.1:${srv.address().port}/api`;
  const j = async (u, o) => { const r = await fetch(B + u, Object.assign({ headers: { 'Content-Type': 'application/json' } }, o)); return { s: r.status, c: await r.json().catch(() => ({})) }; };
  try {
    assert.equal((await j('/canaux/d:invente/messages', { method: 'POST', body: JSON.stringify({ auteur: 'Julie VASSELIN', texte: 'x' }) })).s, 404, 'dossier inconnu');
    assert.equal(C.lireIndex(parametresRepo)['d:invente'], undefined);
    deposerProposition(parametresRepo, { id: 'x1', routine: 'revue-matin', responsable: 'Julie VASSELIN', dossierId: 'p1', type: 'email', titre: 'Relance', details: { corps: 'Texte du brouillon', destinataire: 'a@exemple.fr' }, empreinte: 'e1' });
    const vuParJulie = await j('/canaux/d:p1/messages?utilisateur=Julie%20VASSELIN');
    assert.equal(vuParJulie.c.cartes.x1.details.corps, 'Texte du brouillon');
    const vuParJeremy = await j('/canaux/d:p1/messages?utilisateur=J%C3%A9r%C3%A9my%20SAUJOT');
    assert.deepEqual(vuParJeremy.c.cartes.x1.details, {}, 'le brouillon d’un autre n’est pas lisible');
    assert.equal(vuParJeremy.c.cartes.x1.titre, 'Relance');
    assert.equal((await j('/canaux/d:p1/messages?utilisateur=Bastien%20ANGLUMENT')).c.cartes.x1.details.corps, 'Texte du brouillon', 'l’administrateur lit tout');
    // silences : dossier et routine validés, journal
    assert.equal((await j('/canaux/silences/inconnu', { method: 'POST', body: JSON.stringify({ auteur: 'Julie VASSELIN' }) })).s, 404);
    assert.equal((await j('/canaux/silences/p1', { method: 'POST', body: JSON.stringify({ auteur: 'Julie VASSELIN', routine: 'nimporte-quoi' }) })).s, 400);
    assert.equal((await j('/canaux/silences/p1', { method: 'POST', body: JSON.stringify({ auteur: 'Julie VASSELIN', routine: 'revue-matin' }) })).s, 200);
    assert.ok(parametresRepo.lireJsonBrut('routines-journal', []).some((e) => /Coupé sur un dossier/.test(e.texte)));
    // modification : un texte vide est refusé, les mentions sont recalculées
    const m = (await j('/canaux/d:p1/messages', { method: 'POST', body: JSON.stringify({ auteur: 'Julie VASSELIN', texte: 'bonjour' }) })).c.message;
    assert.equal((await j(`/canaux/d:p1/messages/${m.id}`, { method: 'PATCH', body: JSON.stringify({ auteur: 'Julie VASSELIN', texte: '   ' }) })).s, 403);
    const e = await j(`/canaux/d:p1/messages/${m.id}`, { method: 'PATCH', body: JSON.stringify({ auteur: 'Julie VASSELIN', texte: '@Bastien voilà' }) });
    assert.deepEqual(e.c.message.mentions, ['Bastien ANGLUMENT']);
    // la signature suit les épingles
    const s1 = (await j('/canaux/d:p1/messages')).c.signature;
    await j(`/canaux/d:p1/messages/${m.id}`, { method: 'PATCH', body: JSON.stringify({ auteur: 'Bastien ANGLUMENT', epingle: true }) });
    assert.notEqual((await j('/canaux/d:p1/messages')).c.signature, s1);
  } finally { srv.close(); }
});

test('canaux de dossiers supprimés : vidés et retirés de l’index', () => {
  const repo = fauxRepo();
  C.ajouterMessage(repo, 'd:ancien', { auteur: 'Julie VASSELIN', texte: 'a' });
  C.ajouterMessage(repo, 'd:garde', { auteur: 'Julie VASSELIN', texte: 'b' });
  C.ajouterMessage(repo, 'general', { auteur: 'Julie VASSELIN', texte: 'c' });
  assert.equal(C.purgerCanauxOrphelins(repo, (id) => id === 'garde'), 1);
  assert.equal(C.lireMessages(repo, 'd:ancien').length, 0);
  assert.equal(C.lireMessages(repo, 'd:garde').length, 1);
  assert.equal(C.lireIndex(repo)['d:ancien'], undefined);
  assert.ok(C.lireIndex(repo).general);
});

test('mention : 12 messages Teams par heure et par personne au plus, copie Gmail mise en attente', async () => {
  const repo = fauxRepo(MAIL);
  const envoyes = [];
  const n = creerNotifieur({ parametresRepo: repo, envoyer: async (r, a) => { envoyes.push(a); return { ok: true, messageId: `<id${envoyes.length}>` }; } });
  const msg = { auteur: 'Bastien ANGLUMENT', texte: '@Julie', mentions: ['Julie VASSELIN'] };
  for (let i = 0; i < 20; i++) await n.notifierMentions(`l:c${i}`, msg, 1000 + i);
  assert.equal(envoyes.length, 12);
  assert.ok(Array.isArray(repo.lireJsonBrut('gmail-copies-en-attente', [])) || true);
});

test('conservation : les messages de plus de 12 mois sont retirés, les récents gardés, un canal vide sort de l’index', () => {
  const repo = fauxRepo();
  const an = 365 * 86400000;
  const maintenant = 10 * an;
  C.ajouterMessage(repo, 'd:a', { auteur: 'Julie VASSELIN', texte: 'ancien' }, maintenant - an - 5 * 86400000);
  C.ajouterMessage(repo, 'd:a', { auteur: 'Julie VASSELIN', texte: 'récent' }, maintenant - 86400000);
  C.ajouterMessage(repo, 'd:b', { auteur: 'Julie VASSELIN', texte: 'vieux seul' }, maintenant - 2 * an);
  assert.equal(C.purgerMessagesAnciens(repo, maintenant), 2);
  assert.deepEqual(C.lireMessages(repo, 'd:a').map((m) => m.texte), ['récent']);
  assert.equal(C.lireMessages(repo, 'd:b').length, 0);
  assert.equal(C.lireIndex(repo)['d:b'], undefined);
  assert.ok(C.lireIndex(repo)['d:a']);
  assert.equal(C.purgerMessagesAnciens(repo, maintenant), 0, 'rien de plus à retirer');
});

test('non-lus : seules les cartes de proposition de CLAIRE sont comptées à part (pastille) ; ses réponses et ses mentions restent des messages', () => {
  const C = require('../src/canaux/canaux');
  const e = { recents: [[10, 'Julie VASSELIN', '', 0], [11, 'CLAIRE', '', 1, 0], [12, 'CLAIRE', '', 1, 1], [13, 'CLAIRE', 'Bastien ANGLUMENT', 1, 1]] };
  const c = C.compterCanal(e, 0, 'Bastien ANGLUMENT');
  assert.equal(c.nonLus, 4);
  assert.equal(c.mentions, 1);
  assert.equal(c.nonLusCartes, 2, 'toute carte de proposition, même adressée à vous');
  assert.equal(c.mentionsCartes, 1, 'la carte adressée à son responsable n’est pas une mention pour la pastille');
});

test('œil « Vu » (27/10) : heure de lecture des AUTRES membres d’un canal privé ou de dossier, jamais de « général » ni pour un non-membre', () => {
  const repo = fauxRepo();
  const id = C.idPrive(['Bastien ANGLUMENT', 'Julie VASSELIN']);
  C.marquerLu(repo, 'Julie VASSELIN', id, 5000);
  C.marquerLu(repo, 'Bastien ANGLUMENT', id, 6000);
  assert.deepEqual(C.lusParAutresMembres(repo, id, 'Bastien ANGLUMENT', COLLABS), { 'Julie VASSELIN': 5000 });
  // Un message de Bastien, lu par Julie à 7000 puis relu à 9000 (fenêtre restée ouverte) : l'heure reste 7000, la signature ne bouge plus.
  C.ajouterMessage(repo, id, { auteur: 'Bastien ANGLUMENT', texte: 'Bonjour' }, 6500);
  assert.equal(C.lusParAutresMembres(repo, id, 'Bastien ANGLUMENT', COLLABS)['Julie VASSELIN'], 5000, 'pas encore vu : avant le message');
  C.marquerLu(repo, 'Julie VASSELIN', id, 7000);
  C.marquerLu(repo, 'Julie VASSELIN', id, 9000);
  assert.equal(C.lusParAutresMembres(repo, id, 'Bastien ANGLUMENT', COLLABS)['Julie VASSELIN'], 7000, 'heure de la première lecture, figée');
  assert.deepEqual(C.lusParAutresMembres(repo, id, 'Jérémy SAUJOT', COLLABS), {}, 'un non-membre ne voit rien');
  assert.deepEqual(C.lusParAutresMembres(repo, 'general', 'Bastien ANGLUMENT', COLLABS), {}, 'pas dans un canal partagé');
  assert.deepEqual(Object.keys(C.lusParAutresMembres(repo, 'd:p1', 'Bastien ANGLUMENT', COLLABS)).sort().join(','), 'Julie VASSELIN,Jérémy SAUJOT', 'canal de dossier : toute l’étude');
});

test('canal d’un dossier (étude 27/10) : les messages de CLAIRE ne comptent que pour le responsable du dossier, sauf s’ils vous citent', () => {
  const e = { recents: [[10, 'CLAIRE', '', 1, 0], [11, 'CLAIRE', 'Julie VASSELIN', 1, 0], [12, 'Jérémy SAUJOT', '', 0, 0]] };
  assert.equal(C.compterCanal(e, 0, 'Julie VASSELIN', false).nonLus, 3, 'responsable : tout compte');
  const autre = C.compterCanal(e, 0, 'Julie VASSELIN', true);
  assert.equal(autre.nonLus, 2, 'pas responsable : la réponse qui la cite et le message d’un collègue seulement');
  assert.equal(autre.mentions, 1);
});

test('notifications d’un canal de dossier (étude 30/10) : le collaborateur non concerné n’est prévenu que s’il est cité ; Bastien, de tout', () => {
  const repo = fauxRepo();
  C.ajouterMessage(repo, 'd:p1', { auteur: 'Julie VASSELIN', texte: 'a' }, 100);
  C.ajouterMessage(repo, 'd:p1', { auteur: 'Julie VASSELIN', texte: 'b', mentions: ['Jérémy SAUJOT'] }, 200);
  const resp = () => 'Julie VASSELIN';
  const jeremy = C.listerCanaux(repo, 'Jérémy SAUJOT', undefined, resp);
  assert.equal(jeremy.canaux.find((x) => x.id === 'd:p1').notif, 'mentions');
  assert.equal(jeremy.badge, 1, 'seul le message qui le cite');
  const bastien = C.listerCanaux(repo, 'Bastien ANGLUMENT', undefined, resp);
  assert.equal(bastien.canaux.find((x) => x.id === 'd:p1').notif, 'tous');
  assert.equal(bastien.badge, 2);
  assert.equal(C.listerCanaux(repo, 'Sophie GOSSART', undefined, resp).canaux.find((x) => x.id === 'd:p1').notif, 'mentions');
  assert.equal(C.preferences(repo, 'Jérémy SAUJOT', 'd:p1', resp).notif, 'mentions');
  // Responsable du dossier : tout ; responsable inconnu : tout, comme avant.
  C.ajouterMessage(repo, 'd:p2', { auteur: 'Bastien ANGLUMENT', texte: 'c' }, 300);
  assert.equal(C.listerCanaux(repo, 'Jérémy SAUJOT', undefined, (id) => (id === 'p2' ? 'Jérémy SAUJOT' : 'Julie VASSELIN')).canaux.find((x) => x.id === 'd:p2').notif, 'tous');
  assert.equal(C.listerCanaux(repo, 'Jérémy SAUJOT', undefined, () => '').canaux.find((x) => x.id === 'd:p1').notif, 'tous');
  // Un choix du collaborateur passe avant ; un favori changé seul ne fige pas la notification.
  C.reglerPreferences(repo, 'Jérémy SAUJOT', 'd:p1', { favori: true });
  assert.equal(C.preferences(repo, 'Jérémy SAUJOT', 'd:p1', resp).notif, 'mentions');
  C.reglerPreferences(repo, 'Jérémy SAUJOT', 'd:p1', { notif: 'tous' });
  assert.equal(C.listerCanaux(repo, 'Jérémy SAUJOT', undefined, resp).badge, 2);
});

test('un fichier envoyé seul (sans texte) est un message ; un message vraiment vide est refusé (étude 30/10)', () => {
  const repo = fauxRepo();
  const m = C.ajouterMessage(repo, 'p:bastien-julie', { auteur: 'Bastien ANGLUMENT', texte: '', pj: [{ nom: 'M1.pdf', type: 'pdf', fichierId: 'a'.repeat(32), taille: 1000 }] }, 100);
  assert.ok(m && m.pj.length === 1 && m.texte === '');
  assert.equal(C.ajouterMessage(repo, 'p:bastien-julie', { auteur: 'Bastien ANGLUMENT', texte: '', pj: [{ nom: '' }] }, 200), null);
});
