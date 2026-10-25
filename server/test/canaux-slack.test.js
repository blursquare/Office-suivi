// Discussions « comme Slack » (étude 25/10) : messages privés, fils, recherche globale, enregistrés, statut. Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/canaux/canaux');
const X = require('../src/canaux/extensions');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

const fauxRepo = () => { const m = new Map(); return { lireJsonBrut: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), ecrireJsonBrut: (k, v) => { m.set(k, JSON.stringify(v)); } }; };
const COLLABS = ['Bastien ANGLUMENT', 'Julie VASSELIN', 'Jérémy SAUJOT'];

test('privés : identifiant rangé, membres, un canal avec chaque collègue et un de groupe', () => {
  assert.equal(C.idPrive(['Julie VASSELIN', 'Bastien ANGLUMENT']), 'p:bastien-julie');
  assert.equal(C.idPrive(['Julie VASSELIN']), '');
  assert.deepEqual(C.membresPrive('p:bastien-julie', COLLABS), ['Bastien ANGLUMENT', 'Julie VASSELIN']);
  assert.equal(C.membresPrive('p:bastien-inconnu', COLLABS), null);
  assert.deepEqual(C.privesPour('Julie VASSELIN', COLLABS).sort(), ['p:bastien-jeremy-julie', 'p:bastien-julie', 'p:jeremy-julie']);
  assert.equal(C.canalValide('p:a-b'), false);
});

test('privés : jamais listés ni cherchés pour un autre que leurs membres', () => {
  const repo = fauxRepo();
  C.ajouterMessage(repo, 'p:bastien-julie', { auteur: 'Julie VASSELIN', texte: 'Le cadeau de départ de Zorglub' }, 10);
  C.ajouterMessage(repo, 'general', { auteur: 'Julie VASSELIN', texte: 'Zorglub revient demain' }, 11);
  assert.ok(C.listerCanaux(repo, 'Bastien ANGLUMENT', COLLABS).canaux.some((c) => c.id === 'p:bastien-julie'));
  assert.ok(!C.listerCanaux(repo, 'Jérémy SAUJOT', COLLABS).canaux.some((c) => c.id === 'p:bastien-julie'), 'pas le canal d’un autre');
  assert.equal(X.rechercherMessages(repo, 'Bastien ANGLUMENT', COLLABS, { q: 'zorglub' }).length, 2);
  assert.equal(X.rechercherMessages(repo, 'Jérémy SAUJOT', COLLABS, { q: 'zorglub' }).length, 1, 'le message privé n’est pas trouvé par un tiers');
});

test('recherche : tous les mots, sans accent ni casse, filtre par prénom, extrait', () => {
  const repo = fauxRepo();
  C.ajouterMessage(repo, 'general', { auteur: 'Julie VASSELIN', texte: 'Le prêt est accordé pour le dossier Martin' }, 10);
  C.ajouterMessage(repo, 'general', { auteur: 'Jérémy SAUJOT', texte: 'Pret refusé chez Durand' }, 11);
  assert.equal(X.rechercherMessages(repo, 'Bastien ANGLUMENT', COLLABS, { q: 'PRÊT martin' }).length, 1);
  assert.equal(X.rechercherMessages(repo, 'Bastien ANGLUMENT', COLLABS, { q: 'pret' }).length, 2);
  const j = X.rechercherMessages(repo, 'Bastien ANGLUMENT', COLLABS, { q: 'pret', auteur: 'Jeremy' });
  assert.equal(j.length, 1);
  assert.match(j[0].extrait, /refusé/);
  assert.deepEqual(X.rechercherMessages(repo, 'Bastien ANGLUMENT', COLLABS, { q: '' }), []);
});

test('enregistrés et statut : un message enregistré se relit, se retire ; le statut expire', () => {
  const repo = fauxRepo();
  const m = C.ajouterMessage(repo, 'general', { auteur: 'Julie VASSELIN', texte: 'À garder' }, 10);
  X.enregistrerMessage(repo, 'Bastien ANGLUMENT', 'general', m.id, true, 20);
  assert.equal(X.messagesEnregistres(repo, 'Bastien ANGLUMENT', COLLABS)[0].texte, 'À garder');
  assert.equal(X.messagesEnregistres(repo, 'Julie VASSELIN', COLLABS).length, 0, 'enregistré pour soi seulement');
  X.enregistrerMessage(repo, 'Bastien ANGLUMENT', 'general', m.id, false);
  assert.equal(X.messagesEnregistres(repo, 'Bastien ANGLUMENT', COLLABS).length, 0);
  X.poserStatut(repo, 'Julie VASSELIN', { emoji: '⚖️', texte: 'Au tribunal', heures: 2 }, 1000);
  assert.equal(X.statutDe(repo, 'Julie VASSELIN', 1000 + 3600000).texte, 'Au tribunal');
  assert.equal(X.statutDe(repo, 'Julie VASSELIN', 1000 + 3 * 3600000).texte, '', 'expiré');
  assert.equal(X.enLigne(1000, 1000 + 60000), true);
  assert.equal(X.enLigne(1000, 1000 + 4 * 60000), false);
});

test('routes : fil de discussion, canal privé fermé aux autres, recherche, enregistrés, statut', async () => {
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { authActive: false, estSea: () => false, racineRepo: process.cwd() + '/..' } });
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const B = 'http://127.0.0.1:' + srv.address().port;
  const json = { 'Content-Type': 'application/json' };
  const post = (u, corps, methode) => fetch(B + u, { method: methode || 'POST', headers: json, body: JSON.stringify(corps) });
  const q = (n) => encodeURIComponent(n);
  try {
    const racine = (await (await post('/api/canaux/general/messages', { auteur: 'Julie VASSELIN', texte: 'Qui a vu le dossier Martin ?' })).json()).message;
    const reponse = await post('/api/canaux/general/messages', { auteur: 'Bastien ANGLUMENT', texte: 'Moi, il est complet', parent: racine.id });
    assert.equal(reponse.status, 200);
    const rep = (await reponse.json()).message;
    assert.equal(rep.parent, racine.id);
    assert.equal((await post('/api/canaux/general/messages', { auteur: 'Bastien ANGLUMENT', texte: 'x', parent: rep.id })).status, 400, 'un fil n’a qu’un niveau');
    assert.equal((await post('/api/canaux/general/messages', { auteur: 'Bastien ANGLUMENT', texte: 'x', parent: 'inconnu' })).status, 400);
    // Privé
    const prive = 'p:bastien-julie';
    assert.equal((await post(`/api/canaux/${prive}/messages`, { auteur: 'Julie VASSELIN', texte: 'Secret de Zorglub' })).status, 200);
    assert.equal((await fetch(`${B}/api/canaux/${prive}/messages?utilisateur=${q('Jérémy SAUJOT')}`)).status, 404, 'fermé à un tiers');
    assert.equal((await post(`/api/canaux/${prive}/messages`, { auteur: 'Jérémy SAUJOT', texte: 'intrus' })).status, 404);
    assert.equal((await fetch(`${B}/api/canaux/${prive}/messages?utilisateur=${q('Bastien ANGLUMENT')}`)).status, 200);
    const liste = await (await fetch(`${B}/api/canaux?utilisateur=${q('Bastien ANGLUMENT')}`)).json();
    const c = liste.canaux.find(x => x.id === prive);
    assert.equal(c.prive, true);
    assert.equal(c.nonLus, 1, 'un message privé prévient son destinataire');
    assert.ok(liste.equipe.find(e => e.nom === 'Bastien ANGLUMENT').enLigne);
    // Recherche
    const r1 = await (await fetch(`${B}/api/canaux/recherche?utilisateur=${q('Jérémy SAUJOT')}&q=zorglub`)).json();
    assert.equal(r1.resultats.length, 0);
    const r2 = await (await fetch(`${B}/api/canaux/recherche?utilisateur=${q('Bastien ANGLUMENT')}&q=zorglub`)).json();
    assert.equal(r2.resultats[0].canal, prive);
    // Enregistrés
    assert.equal((await post('/api/canaux/enregistres', { auteur: 'Bastien ANGLUMENT', canal: 'general', mid: racine.id })).status, 200);
    assert.equal((await post('/api/canaux/enregistres', { auteur: 'Jérémy SAUJOT', canal: prive, mid: 'x' })).status, 400, 'pas dans le privé d’un autre');
    const e = await (await fetch(`${B}/api/canaux/enregistres?utilisateur=${q('Bastien ANGLUMENT')}`)).json();
    assert.equal(e.messages.length, 1);
    // Statut
    const s = await (await post('/api/canaux/statut', { auteur: 'Julie VASSELIN', emoji: '⚖️', texte: 'Au tribunal', heures: 3 }, 'PUT')).json();
    assert.equal(s.statut.texte, 'Au tribunal');
    const l2 = await (await fetch(`${B}/api/canaux?utilisateur=${q('Bastien ANGLUMENT')}`)).json();
    assert.equal(l2.equipe.find(x => x.nom === 'Julie VASSELIN').statut.emoji, '⚖️');
  } finally { srv.close(); }
});

test('absence du jour : lue dans les absences de l’agenda, jamais devinée', () => {
  const absences = [{ collaborateur: 'Julie VASSELIN', debut: '2026-10-26', fin: '2026-10-28' }, { collaborateur: 'Jérémy SAUJOT', debut: '2026-10-20', fin: '2026-10-20' }];
  assert.ok(X.absentLe(absences, 'Julie VASSELIN', '2026-10-27'));
  assert.equal(X.absentLe(absences, 'Julie VASSELIN', '2026-10-29'), null);
  assert.equal(X.absentLe(absences, 'Bastien ANGLUMENT', '2026-10-27'), null);
  assert.equal(X.absentLe(undefined, 'Julie VASSELIN', '2026-10-27'), null);
});

test('état d’une carte : ⏳ après un jour sans réponse, ✅ ❌ 💤 selon la décision, une seule réaction d’état de CLAIRE', () => {
  const { deposerProposition } = require('../src/canaux/deposer');
  const { lirePropositions, ecrirePropositions } = require('../src/routines/propositions');
  const { emojiEtatCarte, synchroniserEtatCartes } = require('../src/canaux/etatCartes');
  const repo = fauxRepo();
  const t0 = Date.parse('2026-10-26T08:00:00Z');
  const r = deposerProposition(repo, { id: 'prop1', routine: 'essai', responsable: 'Julie VASSELIN', dossierId: '', type: 'alerte', titre: 'À regarder', resume: 'x', empreinte: 'e1' }, new Date(t0));
  assert.ok(r.ok);
  const id = r.proposition.id;
  assert.equal(emojiEtatCarte(r.proposition, t0 + 3600000), '');
  assert.equal(emojiEtatCarte(r.proposition, t0 + 25 * 3600000), '⏳');
  assert.equal(synchroniserEtatCartes(repo, t0 + 25 * 3600000), 1);
  assert.equal(synchroniserEtatCartes(repo, t0 + 26 * 3600000), 0, 'rien de nouveau : rien de touché');
  const carte = () => C.lireMessages(repo, 'general').find((m) => m.carte === id);
  assert.deepEqual(carte().reactions, [{ emoji: '⏳', par: ['CLAIRE'] }]);
  const liste = lirePropositions(repo);
  ecrirePropositions(repo, liste.map((p) => (p.id === id ? Object.assign({}, p, { etat: 'acceptee' }) : p)));
  assert.equal(synchroniserEtatCartes(repo, t0 + 27 * 3600000), 1);
  assert.deepEqual(carte().reactions, [{ emoji: '✅', par: ['CLAIRE'] }], '⏳ retiré, ✅ posé');
});

test('routes : CLAIRE réagit au nom de CLAIRE sans que la réaction entre dans sa mémoire ; l’équipe dit qui est absent', async () => {
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { authActive: false, estSea: () => false, racineRepo: process.cwd() + '/..' } });
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const B = 'http://127.0.0.1:' + srv.address().port;
  const json = { 'Content-Type': 'application/json' };
  const post = (u, corps) => fetch(B + u, { method: 'POST', headers: json, body: JSON.stringify(corps) });
  try {
    const m = (await (await post('/api/canaux/general/messages', { auteur: 'Julie VASSELIN', texte: '@Claire peux-tu regarder ?' })).json()).message;
    assert.equal((await post(`/api/canaux/general/messages/${m.id}/reaction`, { auteur: 'Julie VASSELIN', claire: true, emoji: '👀' })).status, 200);
    const lus = await (await fetch(`${B}/api/canaux/general/messages?utilisateur=${encodeURIComponent('Julie VASSELIN')}`)).json();
    assert.deepEqual(lus.messages.find((x) => x.id === m.id).reactions, [{ emoji: '👀', par: ['CLAIRE'] }]);
    const claire = (await (await post('/api/canaux/general/messages', { auteur: 'Julie VASSELIN', claire: true, texte: 'Fait', html: '<p>Fait</p>' })).json()).message;
    await post(`/api/canaux/general/messages/${claire.id}/reaction`, { auteur: 'Julie VASSELIN', claire: true, emoji: '✅' });
    assert.equal((await (await fetch(B + '/api/assistant/reactions')).json()).reactions.length, 0, 'les réactions de CLAIRE ne sont pas gardées comme des retours humains');
    const liste = await (await fetch(`${B}/api/canaux?utilisateur=${encodeURIComponent('Bastien ANGLUMENT')}`)).json();
    assert.equal(typeof liste.equipe[0].absent, 'boolean');
  } finally { srv.close(); }
});

test('🎉 : un dossier nouvellement signé est fêté une fois, les déjà signés au départ jamais', () => {
  const { celebrerSignatures, venteSignee } = require('../src/canaux/celebrations');
  const repo = fauxRepo();
  const ancien = { id: 'dA', echeancesValidees: {}, authentic: { acte: { etat: 'signe' } } };
  const neuf = { id: 'dB', echeancesValidees: {}, authentic: {} };
  C.ajouterMessage(repo, C.canalDuDossier('dA'), { auteur: 'CLAIRE', texte: 'ancien' }, 1);
  C.ajouterMessage(repo, C.canalDuDossier('dB'), { auteur: 'CLAIRE', texte: 'dernier mot' }, 2);
  assert.equal(celebrerSignatures(repo, [ancien, neuf]), 0, 'premier tour : repères seulement');
  neuf.authentic = { acte: { etat: 'signe' } };
  assert.equal(celebrerSignatures(repo, [ancien, neuf]), 1);
  assert.equal(celebrerSignatures(repo, [ancien, neuf]), 0, 'une seule fois');
  const m = C.lireMessages(repo, C.canalDuDossier('dB'))[0];
  assert.deepEqual(m.reactions, [{ emoji: '🎉', par: ['CLAIRE'] }]);
  assert.equal(C.lireMessages(repo, C.canalDuDossier('dA'))[0].reactions.length, 0);
  assert.equal(venteSignee({ typeAffaire: 'succession', authentic: { acte: { etat: 'signe' } } }), false);
});
