'use strict';
// OpenLegi (étude 18/10) : client MCP (SSE, session), liste blanche, outils donnés à l'agent, masquage léger, jeton jamais renvoyé.
// Faux serveur MCP en mémoire : aucune connexion réelle.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const O = require('../src/openlegi');
const { tourAgent, viderConversationsAgent } = require('../src/assistantAgent');

const OUTILS = {
  legifrance: [
    { name: 'rechercher_code', description: 'Recherche dans un code.', inputSchema: { type: 'object', properties: { search: { type: 'string' }, code_name: { type: 'string' } }, required: ['search', 'code_name'] } },
    { name: 'telecharger_pdf', description: 'Télécharge.', inputSchema: { type: 'object', properties: {} } }
  ],
  bofip: [{ name: 'rechercher_bofip', description: 'Doctrine.', inputSchema: { type: 'object', properties: { search: { type: 'string' } } } }],
  rne: [
    { name: 'rne_search_companies', description: 'Sociétés.', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
    { name: 'rne_download_acte', description: 'Acte.', inputSchema: { type: 'object', properties: {} } }
  ]
};

/** Faux serveur MCP : session par initialize, réponses en SSE ; garde chaque requête. */
function fauxMcp(o = {}) {
  const requetes = [];
  let n = 0;
  const fetch = async (url, init) => {
    const corps = JSON.parse(init.body);
    const source = /mcp\.openlegi\.fr\/([a-z]+)\/mcp/.exec(url)[1];
    requetes.push({ source, corps, headers: init.headers });
    if (o.refus) return { ok: false, status: 401, headers: { get: () => '' }, text: async () => '' };
    const sse = (obj) => `event: message\ndata: ${JSON.stringify(obj)}\n\n`;
    if (corps.method === 'initialize') {
      n++;
      return { ok: true, status: 200, headers: { get: (h) => (h === 'mcp-session-id' ? 'sess-' + n : '') }, text: async () => sse({ jsonrpc: '2.0', id: corps.id, result: { protocolVersion: '2025-06-18' } }) };
    }
    if (!corps.id) return { ok: true, status: 202, headers: { get: () => '' }, text: async () => '' };
    assert.match(init.headers['mcp-session-id'] || '', /^sess-/);
    if (corps.method === 'tools/list') return { ok: true, status: 200, headers: { get: () => '' }, text: async () => sse({ jsonrpc: '2.0', id: corps.id, result: { tools: OUTILS[source] } }) };
    if (corps.method === 'tools/call') {
      const texte = o.texte || 'Article 1589 du Code civil : La promesse de vente vaut vente. Voir Cass. 3e civ., pourvoi n° 21-12.345, LEGIARTI000006436298. M. Fournier.';
      return { ok: true, status: 200, headers: { get: () => '' }, text: async () => sse({ jsonrpc: '2.0', id: corps.id, result: { content: [{ type: 'text', text: texte }] } }) };
    }
    return { ok: false, status: 400, headers: { get: () => '' }, text: async () => '' };
  };
  return { fetch, requetes };
}

beforeEach(() => viderConversationsAgent());

test('liste blanche : jamais un téléchargement ni un outil RNE hors recherche', () => {
  assert.equal(O.outilPermisOpenlegi('legifrance', 'rechercher_code'), true);
  assert.equal(O.outilPermisOpenlegi('legifrance', 'telecharger_pdf'), false);
  assert.equal(O.outilPermisOpenlegi('rne', 'rne_search_companies'), true);
  assert.equal(O.outilPermisOpenlegi('rne', 'rne_download_acte'), false);
  assert.equal(O.outilPermisOpenlegi('bofip', 'x; rm'), false);
  assert.deepEqual(O.decouperNomOpenlegi('legifrance__rechercher_code'), { source: 'legifrance', nom: 'rechercher_code' });
  assert.equal(O.decouperNomOpenlegi('autre__x'), null);
});

test('SSE : messages lus bloc par bloc ; résultat texte borné', () => {
  const m = O.messagesSse('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"a":1}}\n\nevent: progress\ndata: {"x":2}\n\n');
  assert.equal(m.length, 2);
  assert.equal(m[0].result.a, 1);
  assert.equal(O.messagesSse('{"id":3,"result":{}}')[0].id, 3);
  assert.match(O.texteResultatOpenlegi({ content: [{ type: 'text', text: 'x'.repeat(50000) }] }), /coupé/);
});

test('client : session ouverte, jeton en en-tête, outils permis seulement, appel', async () => {
  const f = fauxMcp();
  const c = O.creerClientOpenlegi({ jeton: () => 'jeton-secret', fetch: f.fetch });
  const outils = await c.outilsAgent();
  assert.deepEqual(outils.map((t) => t.name).sort(), ['bofip__rechercher_bofip', 'legifrance__rechercher_code', 'rne__rne_search_companies']);
  assert.match(outils.find((t) => t.name === 'legifrance__rechercher_code').description, /Légifrance — OpenLegi/);
  assert.equal(f.requetes[0].headers.Authorization, 'Bearer jeton-secret');
  assert.match(f.requetes[0].headers.Accept, /text\/event-stream/);
  const r = await c.appeler('legifrance__rechercher_code', { search: 'promesse', code_name: 'Code civil' });
  assert.match(r.texte, /Article 1589/);
  await assert.rejects(() => c.appeler('legifrance__telecharger_pdf', {}), /non permis/);
  // Sans jeton : aucun outil, aucune requête.
  const vide = O.creerClientOpenlegi({ jeton: () => '', fetch: f.fetch });
  assert.deepEqual(await vide.outilsAgent(), []);
});

/** Faux client Claude. */
function fauxClient(reponses) {
  const requetes = [];
  return { requetes, beta: { messages: { create: async (req) => { requetes.push(JSON.parse(JSON.stringify(req))); return reponses.shift(); } } } };
}

test('agent : outils OpenLegi ajoutés, recherche jamais rétablie, texte de droit lisible mais noms des fiches masqués', async () => {
  const f = fauxMcp();
  const c = O.creerClientOpenlegi({ jeton: () => 'j', fetch: f.fetch });
  const outilsExternes = await c.outilsAgent();
  const D = [{ id: 'd1', nom: 'FOURNIER / GAUTHIER', parties: [{ nom: 'FOURNIER', prenom: 'Paul' }] }];
  const client = fauxClient([
    { stop_reason: 'tool_use', usage: {}, content: [{ type: 'tool_use', id: 't1', name: 'legifrance__rechercher_code', input: { search: 'promesse [NOM1]', code_name: 'Code civil' } }] },
    { stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'L’article 1589 du Code civil dit que la promesse vaut vente.' }] }
  ]);
  const o = { cle: 'k', client, outilsExternes };
  let r = await tourAgent({ texte: 'Que dit le code civil sur la promesse de Fournier ?', dossiers: D, contexte: {} }, o);
  assert.ok(client.requetes[0].tools.some((t) => t.name === 'legifrance__rechercher_code'));
  assert.equal(r.appels[0].entree.search, 'promesse [NOM1]', 'un code n’est jamais rétabli vers Légifrance');
  const sortie = await c.appeler(r.appels[0].nom, r.appels[0].entree);
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: { source: 'legifrance', resultat: sortie.texte } }] }, o);
  assert.match(r.reponse, /1589/);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.match(envoye, /Code civil/, 'le texte de droit reste lisible');
  assert.match(envoye, /LEGIARTI000006436298/, 'les identifiants Légifrance restent');
  assert.doesNotMatch(envoye, /Fournier|FOURNIER/, 'rien de nominatif ne part');
});

test('routes /openlegi : jeton jamais renvoyé, gardé si absent, effacé sur chaîne vide ; appel coupé sans jeton', async () => {
  const { creerApp } = require('../src/app');
  const { ouvrirDb } = require('../src/db');
  const f = fauxMcp();
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, authActive: false }, assistant: { fetchOpenlegi: f.fetch } });
  const serveur = app.listen(0);
  await new Promise((res) => serveur.once('listening', res));
  try {
    const base = `http://127.0.0.1:${serveur.address().port}/api`;
    const json = async (m, chemin, corps) => (await fetch(base + chemin, { method: m, headers: { 'content-type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined })).json();
    assert.match((await json('POST', '/openlegi/appel', { outil: 'legifrance__rechercher_code', arguments: {} })).erreur, /coupées/);
    let r = await json('PUT', '/openlegi/reglages', { jeton: 'jeton-tres-secret', actif: true });
    assert.equal(r.jetonEnregistre, true);
    assert.doesNotMatch(JSON.stringify(r), /tres-secret/);
    r = await json('PUT', '/openlegi/reglages', { actif: true });
    assert.equal(r.jetonEnregistre, true, 'gardé si le formulaire ne le réémet pas');
    const t = await json('POST', '/openlegi/tester');
    assert.equal(t.ok, true);
    assert.doesNotMatch(JSON.stringify(t), /tres-secret/);
    const a = await json('POST', '/openlegi/appel', { outil: 'legifrance__rechercher_code', arguments: { search: 'vente', code_name: 'Code civil' } });
    assert.match(a.texte, /Article 1589/);
    assert.match((await json('POST', '/openlegi/appel', { outil: 'rne__rne_download_acte', arguments: {} })).erreur, /non permis/);
    r = await json('PUT', '/openlegi/reglages', { jeton: '' });
    assert.equal(r.jetonEnregistre, false);
  } finally {
    serveur.close();
  }
});

test('relecture 0.281.0 : registre des entreprises — seul un nom de société est rétabli, jamais une personne', () => {
  const { motsSocietesDossiers, retablirSocietes } = require('../src/assistantAgent');
  const societes = motsSocietesDossiers([{ parties: [{ nom: 'SCI DUPONT' }, { nom: 'DUPONT', prenom: 'Paul' }, { nom: '3F', societe: true }, { nom: 'SCI DU MOULIN' }] }]);
  const table = new Map([['[NOM1]', 'SCI DUPONT'], ['[NOM2]', 'DUPONT'], ['[NOM3]', '3F'], ['[EMAIL1]', 'a@b.fr'], ['[NOM4]', 'MOULIN'], ['[NUM1]', '123 456 789']]);
  assert.equal(retablirSocietes({ query: '[NOM1]' }, table, societes).query, 'SCI DUPONT');
  assert.equal(retablirSocietes({ query: '[NOM2]' }, table, societes).query, '', 'le nom de la personne ne part jamais');
  assert.equal(retablirSocietes({ query: '[NOM4]' }, table, societes).query, '', 'un tiers qui porte un mot d’une société non plus');
  assert.equal(retablirSocietes({ query: '[NOM2] gérant [EMAIL1]' }, table, societes).query, 'gérant');
  assert.equal(retablirSocietes({ query: '[NOM3]' }, table, societes).query, '3F');
  assert.equal(retablirSocietes({ siren: '[NUM1]' }, table, societes).siren, '');
  assert.equal(retablirSocietes({ siren: '[NUM1]' }, table, societes, new Set(['[NUM1]'])).siren, '123 456 789', 'SIREN rendu par le registre');
  const { argumentsDroitSansMontants } = require('../src/assistantAgent');
  assert.equal(argumentsDroitSansMontants({ search: 'droits de mutation sur 250 000 € [NOM1]' }).search, 'droits de mutation sur [NOM1]');
});

test('relecture 0.281.0 : schéma $ref résolu, schéma inutilisable écarté, vraie liste blanche', () => {
  const s = O.schemaPropreOpenlegi({ type: 'object', properties: { f: { $ref: '#/$defs/Filtre' } }, required: ['f', 'absent'], $defs: { Filtre: { type: 'string', enum: ['A'] } } });
  assert.deepEqual(s.properties.f, { type: 'string', enum: ['A'] });
  assert.deepEqual(s.required, ['f']);
  assert.equal(O.schemaPropreOpenlegi({ properties: { 'mauvais nom': { type: 'string' } } }), null);
  assert.equal(O.schemaPropreOpenlegi({ properties: [] }), null);
  assert.equal(O.outilPermisOpenlegi('legifrance', 'send_email'), false);
  assert.equal(O.outilPermisOpenlegi('bofip', 'export_bofip'), false);
  assert.equal(O.outilPermisOpenlegi('legifrance', 'dernier_journal_officiel'), true);
});

test('relecture 0.281.0 : une requête refusée à cause des outils externes est refaite sans eux', async () => {
  let refus = 0;
  const err = Object.assign(new Error('bad'), { status: 400 });
  const reponses = [err, { stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'Oui.' }] }];
  const requetes = [];
  const client = { beta: { messages: { create: async (req) => { requetes.push(req); const r = reponses.shift(); if (r instanceof Error) throw r; return r; } } } };
  const outilsExternes = [{ name: 'legifrance__rechercher_code', description: 'x', input_schema: { type: 'object', properties: {} } }];
  const r = await tourAgent({ texte: 'Bonjour', contexte: {} }, { cle: 'k', client, outilsExternes, surRefusOutilsExternes: () => { refus++; } });
  assert.equal(r.reponse, 'Oui.');
  assert.equal(refus, 1);
  assert.ok(requetes[0].tools.some((t) => t.name === 'legifrance__rechercher_code'));
  assert.ok(!requetes[1].tools.some((t) => t.name === 'legifrance__rechercher_code'));
});
