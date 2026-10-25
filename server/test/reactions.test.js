// Réactions (emojis) sur les messages (étude 25/10) : bascule, un emoji propre, sens lu par le code, mémoire de CLAIRE (réactions sur SES
// réponses seulement), routes. Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const R = require('../../commun/reactions');
const C = require('../src/canaux/canaux');
const { noterReaction, lireReactions, oublierReaction, reactionsPourAgent } = require('../src/reactionsAgent');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

const fauxRepo = () => { const m = new Map(); return { lireJsonBrut: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), ecrireJsonBrut: (k, v) => { m.set(k, JSON.stringify(v)); } }; };

test('sens : 👍 compris, 👎 refus, ❓ pas clair, hors liste = autre', () => {
  assert.equal(R.sensReaction('👍'), 'compris');
  assert.equal(R.sensReaction('👎'), 'refus');
  assert.equal(R.sensReaction('❓'), 'pas-clair');
  assert.equal(R.sensReaction('❤️'), 'content');
  assert.equal(R.sensReaction('🦄'), 'autre');
});

test('emoji : un seul pictogramme (variantes, teintes, drapeaux), jamais du texte', () => {
  assert.equal(R.emojiValide('👍🏽'), '👍🏽');
  assert.equal(R.emojiValide('🇫🇷'), '🇫🇷');
  assert.equal(R.emojiValide('1️⃣'), '1️⃣');
  assert.equal(R.emojiValide('<img>'), '');
  assert.equal(R.emojiValide('ab'), '');
  assert.equal(R.emojiValide(''), '');
});

test('bascule : un clic pose, un second retire ; une réaction par personne et par emoji', () => {
  let l = R.basculerReaction([], '👍', 'Julie VASSELIN');
  l = R.basculerReaction(l, '👍', 'Jérémy SAUJOT');
  l = R.basculerReaction(l, '👍', 'Julie VASSELIN', true);
  assert.deepEqual(l, [{ emoji: '👍', par: ['Julie VASSELIN', 'Jérémy SAUJOT'] }]);
  l = R.basculerReaction(l, '👍', 'Julie VASSELIN');
  assert.deepEqual(l, [{ emoji: '👍', par: ['Jérémy SAUJOT'] }]);
  assert.deepEqual(R.basculerReaction(l, '👍', 'Jérémy SAUJOT'), []);
  assert.deepEqual(R.basculerReaction([], 'pas un emoji', 'Julie VASSELIN'), []);
});

test('canal : réagir à un message, relu avec ses réactions ; message inconnu ou emoji refusé', () => {
  const repo = fauxRepo();
  const m = C.ajouterMessage(repo, 'general', { auteur: 'CLAIRE', claire: true, texte: 'Voici la liste' }, 10);
  const r = C.reagirMessage(repo, 'general', m.id, 'Julie VASSELIN', '👍');
  assert.equal(r.pose, true);
  assert.equal(r.sens, 'compris');
  assert.deepEqual(C.lireMessages(repo, 'general')[0].reactions, [{ emoji: '👍', par: ['Julie VASSELIN'] }]);
  assert.equal(C.reagirMessage(repo, 'general', 'inconnu', 'Julie VASSELIN', '👍'), null);
  assert.equal(C.reagirMessage(repo, 'general', m.id, 'Julie VASSELIN', 'oui'), null);
  assert.equal(C.reagirMessage(repo, 'general', m.id, 'Julie VASSELIN', '👍').pose, false, 'second clic = retrait');
});

test('mémoire : une ligne par personne, message et emoji ; retrait ; 90 jours ; l’agent ne reçoit que sens, emoji et extrait', () => {
  const repo = fauxRepo();
  const t = 1_000_000;
  noterReaction(repo, { par: 'Julie VASSELIN', emoji: '👍', canal: 'd:p1', messageId: 'm1', extrait: 'La promesse est complète', dossierId: 'p1' }, t);
  noterReaction(repo, { par: 'Julie VASSELIN', emoji: '👍', canal: 'd:p1', messageId: 'm1', extrait: 'La promesse est complète', dossierId: 'p1' }, t + 5);
  noterReaction(repo, { par: 'Jérémy SAUJOT', emoji: '👎', canal: 'd:p1', messageId: 'm1', extrait: 'La promesse est complète', dossierId: 'p1' }, t + 10);
  let l = lireReactions(repo, t + 20);
  assert.equal(l.length, 2);
  assert.equal(l[0].sens, 'refus');
  const agent = reactionsPourAgent(l, 'p1');
  assert.deepEqual(Object.keys(agent[0]).sort(), ['collaborateur', 'date', 'dossier_id', 'emoji', 'sens', 'sur_ta_reponse']);
  assert.equal(reactionsPourAgent(l, 'autre').length, 0);
  noterReaction(repo, { par: 'Julie VASSELIN', emoji: '👍', canal: 'd:p1', messageId: 'm1', pose: false }, t + 30);
  l = lireReactions(repo, t + 40);
  assert.equal(l.length, 1);
  assert.equal(oublierReaction(repo, l[0].id, t + 45), true);
  assert.equal(lireReactions(repo, t + 50).length, 0);
  noterReaction(repo, { par: 'Julie VASSELIN', emoji: '👍', canal: 'x', messageId: 'm2' }, t);
  assert.equal(lireReactions(repo, t + 91 * 86400000).length, 0);
  assert.equal(noterReaction(repo, { par: 'Julie VASSELIN', emoji: 'zut', messageId: 'm' }), null);
});

test('routes : réaction sur un message de CLAIRE gardée en mémoire, sur un message de collègue non ; signature changée ; conversation personnelle', async () => {
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { authActive: false, estSea: () => false, racineRepo: process.cwd() + '/..' } });
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const B = 'http://127.0.0.1:' + srv.address().port;
  const json = { 'Content-Type': 'application/json' };
  try {
    const post = async (u, corps) => (await fetch(B + u, { method: 'POST', headers: json, body: JSON.stringify(corps) }));
    const claire = (await (await post('/api/canaux/general/messages', { auteur: 'Julie VASSELIN', claire: true, texte: 'Voici le projet', html: '<p>Voici le projet</p>' })).json()).message;
    const collegue = (await (await post('/api/canaux/general/messages', { auteur: 'Jérémy SAUJOT', texte: 'Bonjour' })).json()).message;
    const avant = (await (await fetch(B + '/api/canaux/general/messages?utilisateur=' + encodeURIComponent('Julie VASSELIN'))).json());
    assert.equal((await post(`/api/canaux/general/messages/${claire.id}/reaction`, { auteur: 'Julie VASSELIN', emoji: '👍' })).status, 200);
    assert.equal((await post(`/api/canaux/general/messages/${collegue.id}/reaction`, { auteur: 'Julie VASSELIN', emoji: '🎉' })).status, 200);
    assert.equal((await post(`/api/canaux/general/messages/${claire.id}/reaction`, { auteur: 'Quelqu’un', emoji: '👍' })).status, 400);
    assert.equal((await post(`/api/canaux/general/messages/${claire.id}/reaction`, { auteur: 'Julie VASSELIN', emoji: 'texte' })).status, 400);
    const apres = await (await fetch(B + '/api/canaux/general/messages?utilisateur=' + encodeURIComponent('Julie VASSELIN') + '&signature=' + encodeURIComponent(avant.signature))).json();
    assert.notEqual(apres.inchange, true, 'la signature change quand une réaction est posée');
    assert.equal(apres.messages.find(m => m.id === claire.id).reactions[0].emoji, '👍');
    const memoire = (await (await fetch(B + '/api/assistant/reactions')).json()).reactions;
    assert.equal(memoire.length, 1, 'seule la réaction sur la réponse de CLAIRE est gardée');
    assert.equal(memoire[0].sens, 'compris');
    assert.equal(memoire[0].canal, 'general');
    // Conversation personnelle
    assert.equal((await post('/api/assistant/reactions', { auteur: 'Bastien ANGLUMENT', emoji: '❓', messageId: 'r1', extrait: 'Le prêt est attendu', pose: true })).status, 200);
    assert.equal((await post('/api/assistant/reactions', { auteur: 'Bastien ANGLUMENT', emoji: 'non', messageId: 'r1' })).status, 400);
    const rech = await (await fetch(B + '/api/assistant/conversations/recherche?q=pret')).json();
    assert.equal(rech.reactions.some(r => r.sens === 'pas-clair'), true);
    const id = (await (await fetch(B + '/api/assistant/reactions')).json()).reactions[0].id;
    assert.equal((await (await fetch(B + '/api/assistant/reactions?id=' + encodeURIComponent(id), { method: 'DELETE' })).json()).ok, true);
  } finally { srv.close(); }
});

test('pièce jointe du NAS : le message garde un lien confiné (dossier + chemin), jamais « .. » ni un identifiant douteux', () => {
  const repo = fauxRepo();
  const m = C.ajouterMessage(repo, 'general', { auteur: 'Julie VASSELIN', texte: 'voir', pj: [
    { nom: 'a.pdf', type: 'pdf', nas: { dossierId: 'p1', chemin: 'Vendeur/a.pdf' } },
    { nom: 'b.pdf', type: 'pdf', nas: { dossierId: 'p1', chemin: '../secret.pdf' } },
    { nom: 'c.pdf', type: 'pdf', nas: { dossierId: '../x', chemin: 'c.pdf' } }] }, 10);
  assert.deepEqual(m.pj[0].nas, { dossierId: 'p1', chemin: 'Vendeur/a.pdf' });
  assert.equal(m.pj[1].nas, undefined);
  assert.equal(m.pj[2].nas, undefined);
});
