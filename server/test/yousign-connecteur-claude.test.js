'use strict';

// Yousign par le connecteur MCP de l'API Claude (étude 23/10, lecture seule) : seuls les outils de lecture sont ouverts, le jeton part dans le champ prévu,
// la conversation passe « en clair » dès qu'un résultat arrive, et une erreur du connecteur ne coupe jamais la conversation.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { tourAgent, requeteAgent, viderConversationsAgent } = require('../src/assistantAgent');
const { creerClientYousign } = require('../src/yousign');

beforeEach(() => viderConversationsAgent());

const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const connecteur = { url: 'https://api-sandbox.yousign.app/mcp', nom: 'yousign', outilsLecture: ['get-signature-request', 'search-signature-requests'], jeton: async () => 'cle-secrete-123' };

test('la requête ferme tout sauf les outils de lecture nommés et pose le jeton et la bêta', () => {
  const r = requeteAgent('claude-opus-5-5', [], { connecteurMcp: { url: connecteur.url, nom: 'yousign', outilsLecture: connecteur.outilsLecture, jeton: 'cle-secrete-123' } });
  assert.deepEqual(r.mcp_servers, [{ type: 'url', url: connecteur.url, name: 'yousign', authorization_token: 'cle-secrete-123' }]);
  const jeu = r.tools.find((t) => t.type === 'mcp_toolset');
  assert.equal(jeu.default_config.enabled, false);
  assert.deepEqual(Object.keys(jeu.configs), ['get-signature-request', 'search-signature-requests']);
  assert.ok(r.betas.includes('mcp-client-2025-11-20'));
  assert.equal(requeteAgent('claude-opus-5-5', [], {}).mcp_servers, undefined, 'rien sans connecteur');
  assert.equal(requeteAgent('claude-opus-5-5', [], { connecteurMcp: { url: connecteur.url, nom: 'yousign', outilsLecture: [], jeton: 'x' } }).mcp_servers, undefined, 'aucun outil de lecture : pas de connecteur');
});

test('une conversation avec le connecteur : requête complète, résultat reçu = conversation en clair ; erreur du connecteur = reprise sans lui', async () => {
  const requetes = [];
  const reponses = [
    { stop_reason: 'end_turn', usage, content: [{ type: 'mcp_tool_use', id: 'm1', name: 'get-signature-request', server_name: 'yousign', input: {} }, { type: 'mcp_tool_result', tool_use_id: 'm1', is_error: false, content: [{ type: 'text', text: 'ok' }] }, { type: 'text', text: 'La demande est en attente.' }] },
    new Error('400 MCP server connection failed'),
    { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Je n’ai plus accès à Yousign.' }] }
  ];
  const client = { beta: { messages: { create: async (req) => { requetes.push(JSON.parse(JSON.stringify(req))); const r = reponses.shift(); if (r instanceof Error) throw r; return r; } } } };
  const o = { cle: 'k', client, modele: 'claude-opus-5-5', chargerConnecteurMcp: async () => connecteur };
  let r = await tourAgent({ texte: 'Où en est la signature ?', dossiers: [], contexte: { aujourdhui: '2026-10-23' } }, o);
  assert.equal(r.reponse, 'La demande est en attente.');
  assert.ok(requetes[0].mcp_servers && requetes[0].mcp_servers[0].authorization_token === 'cle-secrete-123');
  r = await tourAgent({ conversation: r.conversation, texte: 'Et la suivante ?', dossiers: [], contexte: {} }, o);
  assert.equal(requetes.length, 3);
  assert.ok(requetes[1].mcp_servers, 'deuxième question avec le connecteur');
  assert.equal(requetes[2].mcp_servers, undefined, 'repris sans le connecteur après son erreur');
  assert.match(r.reponse, /Je n’ai plus accès/);
});

test('connecteurClaude : seuls les outils classés « lecture » ; jamais une écriture ni send-feedback', async () => {
  const outils = [{ name: 'get-signature-request', inputSchema: { type: 'object' } }, { name: 'search-signature-requests', inputSchema: { type: 'object' } }, { name: 'send-signature-request', inputSchema: { type: 'object' } }, { name: 'send-feedback', inputSchema: { type: 'object' } }, { name: 'create-signature-request', inputSchema: { type: 'object' } }];
  const fetch = async (url, init) => {
    const corps = JSON.parse(init.body);
    const rep = (r) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ jsonrpc: '2.0', id: corps.id, result: r }), text: async () => JSON.stringify({ jsonrpc: '2.0', id: corps.id, result: r }) });
    if (corps.method === 'initialize') return rep({ protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'y', version: '1' } });
    if (corps.method === 'tools/list') return rep({ tools: outils });
    return rep({});
  };
  const y = creerClientYousign({ reglages: () => ({ cle: 'cle-secrete-123', url: 'https://api-sandbox.yousign.app/mcp', ecriture: true }), fetch });
  const c = await y.connecteurClaude();
  assert.deepEqual(c.outilsLecture, ['get-signature-request', 'search-signature-requests']);
  assert.equal(c.url, 'https://api-sandbox.yousign.app/mcp');
  assert.equal(await c.jeton(), 'cle-secrete-123');
});
