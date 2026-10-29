'use strict';
// « Demander à CLAIRE » (étude 18/10) : mémoire des conversations (90 jours, sur le serveur) et recherche web limitée aux sites officiels.
// Noms et dossiers inventés.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/conversationsAgent');
const { tourAgent, requeteAgent, viderConversationsAgent } = require('../src/assistantAgent');

function fauxRepo() {
  const m = new Map();
  return { lireJsonBrut: (k, def) => (m.has(k) ? JSON.parse(m.get(k)) : def), ecrireJsonBrut: (k, v) => { m.set(k, JSON.stringify(v)); } };
}
const usage = { input_tokens: 10, output_tokens: 5 };
function fauxClient(reponses) {
  const requetes = [];
  return { requetes, beta: { messages: { create: async (req) => { requetes.push(JSON.parse(JSON.stringify(req))); return reponses.shift(); } } } };
}
beforeEach(() => viderConversationsAgent());

test('mémoire : une conversation notée, mise à jour, retrouvée par ses mots ou son dossier ; oubliée après 90 jours', () => {
  const repo = fauxRepo();
  const t = Date.UTC(2026, 9, 18);
  C.noterConversation(repo, { id: 'c1', auteur: 'Julie', question: 'Quel délai pour la purge du droit de préemption urbain ?', reponse: 'Deux mois à compter de la DIA.', dossierId: 'd1' }, t);
  C.noterConversation(repo, { id: 'c1', question: 'Et pour la SAFER ?', reponse: 'Deux mois aussi, un mois en réponse rapide.' }, t + 1000);
  C.noterConversation(repo, { id: 'c2', auteur: 'Bastien', question: 'Prorata de taxe foncière', reponse: 'Calculé.' }, t + 2000);
  const liste = C.lireConversations(repo, t + 3000);
  assert.equal(liste.length, 2);
  assert.equal(liste[1].questions.length, 2);
  assert.equal(liste[1].auteur, 'Julie', 'l’auteur du début est gardé');
  const r = C.rechercherConversations(liste, 'délai préemption');
  assert.equal(r.length, 1);
  assert.equal(r[0].collaborateur, 'Julie');
  assert.match(r[0].reponse, /réponse rapide/);
  assert.equal(C.rechercherConversations(liste, '', 'd1').length, 1, 'toutes celles d’un dossier');
  assert.equal(C.rechercherConversations(liste, 'zzz').length, 0);
  assert.equal(C.lireConversations(repo, t + C.DUREE_CONVERSATIONS_MS + 5000).length, 0, '90 jours');
});

test('recherche web : domaines assainis, liste par défaut, coupure', () => {
  assert.equal(C.domainePropre('https://www.Legifrance.gouv.fr/codes'), 'legifrance.gouv.fr');
  assert.equal(C.domainePropre('javascript:alert(1)'), '');
  assert.equal(C.domainePropre('pas un site'), '');
  assert.ok(C.assainirRechercheWeb(null).domaines.includes('legifrance.gouv.fr'));
  const w = C.assainirRechercheWeb({ actif: false, domaines: ['service-public.fr', 'service-public.fr', 'x', 'bofip.impots.gouv.fr'] });
  assert.equal(w.actif, false);
  assert.equal(w.domaines.join(','), 'service-public.fr,bofip.impots.gouv.fr');
});

test('agent : outil web_search limité aux domaines, filtrage dynamique sauf Haiku ; pause_turn relancée ; conversation notée en clair', async () => {
  const req = requeteAgent('claude-opus-5-5', [], { rechercheWeb: ['legifrance.gouv.fr'] });
  const web = req.tools.find((t) => t.name === 'web_search');
  assert.equal(web.type, 'web_search_20260209');
  assert.deepEqual(web.allowed_domains, ['legifrance.gouv.fr']);
  assert.ok(!requeteAgent('claude-opus-5-5', [], {}).tools.some((t) => t.name === 'web_search'), 'rien sans liste');
  const client = fauxClient([
    { stop_reason: 'pause_turn', usage, content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'délai DIA' } }] },
    { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Deux mois pour [NOM1].' }] }
  ]);
  const notees = [];
  const D = [{ id: 'd1', nom: 'FOURNIER', parties: [{ nom: 'FOURNIER', prenom: 'Paul' }] }];
  const r = await tourAgent({ texte: 'Délai de la DIA pour Fournier ?', dossiers: D, contexte: { prenom: 'Julie', dossierId: 'd1' } },
    { cle: 'k', client, rechercheWeb: ['legifrance.gouv.fr'], noterConversation: (x) => notees.push(x) });
  assert.equal(client.requetes.length, 2, 'relancée après la pause');
  assert.ok(client.requetes[0].tools.some((t) => t.name === 'web_search'));
  assert.doesNotMatch(JSON.stringify(client.requetes), /Fournier|FOURNIER/);
  assert.match(r.reponse, /Deux mois pour FOURNIER|Deux mois pour Fournier/);
  assert.equal(notees.length, 1);
  assert.equal(notees[0].auteur, 'Julie');
  assert.equal(notees[0].dossierId, 'd1');
  assert.match(notees[0].question, /Fournier/, 'gardée en clair sur le serveur de l’étude');
});

test('Mistral : pas de recherche web, la mémoire fonctionne', async () => {
  const corps = [];
  const fetchMistral = async (url, o) => { corps.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ usage: {}, choices: [{ message: { role: 'assistant', content: 'Oui.' }, finish_reason: 'stop' }] }) }; };
  const notees = [];
  await tourAgent({ texte: 'Bonjour', contexte: {} }, { cle: 'k', fournisseur: 'mistral', fetchMistral, rechercheWeb: ['legifrance.gouv.fr'], noterConversation: (x) => notees.push(x) });
  assert.ok(!JSON.stringify(corps).includes('web_search'));
  assert.ok(JSON.stringify(corps).includes('chercher_conversations'));
  assert.equal(notees.length, 1);
});

test('routes : sites de la recherche web lus et enregistrés ; recherche dans les conversations', async () => {
  const os = require('node:os');
  const { creerApp } = require('../src/app');
  const { ouvrirDb } = require('../src/db');
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { motDePasse: 'x', racineRepo: os.tmpdir(), port: 0, authActive: false } });
  const serveur = app.listen(0);
  await new Promise((r) => serveur.once('listening', r));
  try {
    const base = `http://127.0.0.1:${serveur.address().port}/api`;
    let w = await (await fetch(base + '/assistant/recherche-web')).json();
    assert.equal(w.actif, true);
    assert.ok(w.domaines.includes('service-public.fr'));
    const rep = await fetch(base + '/assistant/recherche-web', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actif: false, domaines: ['impots.gouv.fr', 'n’importe quoi'] }) });
    w = await rep.json();
    assert.equal(w.actif, false);
    assert.deepEqual(w.domaines, ['impots.gouv.fr']);
    assert.equal((await fetch(base + '/assistant/recherche-web', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domaines: 'x' }) })).status, 400);
    const r = await (await fetch(base + '/assistant/conversations/recherche?q=' + encodeURIComponent('taxe foncière'))).json();
    assert.deepEqual(r.resultats, []);
  } finally { serveur.close(); }
});

test('relecture 0.285.0 : chercher_conversations masque les noms des conversations passées, même absents des fiches', async () => {
  const repo = fauxRepo();
  C.noterConversation(repo, { id: 'old', question: 'Le dossier Zorglub-Martin a-t-il signé ?', reponse: 'Oui, Zorglub-Martin a signé le 3 octobre.', sensibles: ['ZORGLUB-MARTIN'] });
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 't1', name: 'chercher_conversations', input: { recherche: 'signé', dossier_id: '' } }] },
    { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Oui.' }] }
  ]);
  const o = { cle: 'k', client, sensiblesConversations: () => C.sensiblesConversations(repo) };
  let r = await tourAgent({ texte: 'On avait parlé d’une signature ?', contexte: {} }, o);
  const resultats = C.rechercherConversations(C.lireConversations(repo), 'signé');
  assert.equal(resultats.length, 1);
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: { conversations: resultats } }] }, o);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, /Zorglub|zorglub/, 'rien de nominatif ne part : ' + envoye.slice(-400));
  assert.equal(r.reponse, 'Oui.');
});

test('réactions (25/10) : un nom au début de l’extrait d’une réponse réagie ne part pas chez l’IA', async () => {
  const R = require('../src/reactionsAgent');
  const repo = fauxRepo();
  R.noterReaction(repo, { par: 'Julie VASSELIN', emoji: '👎', canal: 'perso', messageId: 'r1', extrait: 'Zorglub-Martin a signé le 3 octobre, la vente est faite.' });
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 't1', name: 'chercher_conversations', input: { recherche: 'signé', dossier_id: '' } }] },
    { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Noté.' }] }
  ]);
  const o = { cle: 'k', client };
  const r = await tourAgent({ texte: 'On avait parlé d’une signature ?', contexte: {} }, o);
  await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: { reactions: R.reactionsPourAgent(R.lireReactions(repo)) } }] }, o);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, /Zorglub|zorglub/, 'rien de nominatif ne part : ' + envoye.slice(-400));
  assert.match(envoye, /refus/);
});

test('relecture 0.285.0 : recherche web refusée → second essai sans elle ; encore en pause après 4 appels → « coupée » ; sources citées', async () => {
  const refus = Object.assign(new Error('400'), { status: 400 });
  let n = 0;
  const requetes = [];
  const client = { beta: { messages: { create: async (req) => { requetes.push(req); n++; if (n === 1) throw refus; return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Sans le web.' }] }; } } } };
  const r = await tourAgent({ texte: 'Question', contexte: {} }, { cle: 'k', client, rechercheWeb: ['legifrance.gouv.fr'] });
  assert.equal(r.reponse, 'Sans le web.');
  assert.ok(requetes[0].tools.some((t) => t.name === 'web_search'));
  assert.ok(!requetes[1].tools.some((t) => t.name === 'web_search'));
  const pauses = fauxClient(Array.from({ length: 4 }, () => ({ stop_reason: 'pause_turn', usage, content: [{ type: 'text', text: 'Je cherche', citations: [{ type: 'web_search_result_location', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006430987' }] }] })));
  const r2 = await tourAgent({ texte: 'Autre', contexte: {} }, { cle: 'k', client: pauses, rechercheWeb: ['legifrance.gouv.fr'] });
  assert.equal(pauses.requetes.length, 4);
  assert.match(r2.reponse, /Réponse coupée/);
  assert.match(r2.reponse, /Sources : https:\/\/www\.legifrance\.gouv\.fr/);
});
