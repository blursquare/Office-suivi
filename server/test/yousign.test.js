'use strict';
// Yousign (étude 23/10) : client MCP (SSE ou JSON, session), classement lecture / écriture, adresse contrôlée, clé jamais renvoyée,
// écriture coupée, résultats masqués avant l'IA. Faux serveur MCP en mémoire : aucune connexion réelle.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const Y = require('../src/yousign');
const { tourAgent, viderConversationsAgent } = require('../src/assistantAgent');

const OUTILS = [
  { name: 'search-signature-requests', description: 'Cherche des demandes.', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
  { name: 'get-signature-request', description: 'Une demande.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'create-signature-request', description: 'Crée un brouillon.', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'send-signature-request', description: 'Envoie.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'remove-signature-request-signer', description: 'Retire.', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
  { name: 'send_feedback', description: 'Avis libre à l’éditeur.', inputSchema: { type: 'object', properties: { texte: { type: 'string' } } } }
];
const TEXTE = '{"name":"Vente FOURNIER","status":"ongoing","signers":[{"name":"Paul FOURNIER","email":"paul.fournier@exemple.fr"}]}';

function fauxMcp(o = {}) {
  const requetes = [];
  let n = 0;
  const fetch = async (url, init) => {
    const corps = JSON.parse(init.body);
    requetes.push({ url, corps, headers: init.headers });
    if (o.refus) return { ok: false, status: 401, headers: { get: () => '' }, text: async () => '' };
    const json = (obj) => (o.sse ? `event: message\ndata: ${JSON.stringify(obj)}\n\n` : JSON.stringify(obj));
    if (corps.method === 'initialize') { n++; return { ok: true, status: 200, headers: { get: (h) => (h === 'mcp-session-id' ? 'sess-' + n : '') }, text: async () => json({ jsonrpc: '2.0', id: corps.id, result: {} }) }; }
    if (!corps.id) return { ok: true, status: 202, headers: { get: () => '' }, text: async () => '' };
    if (corps.method === 'tools/list') return { ok: true, status: 200, headers: { get: () => '' }, text: async () => json({ jsonrpc: '2.0', id: corps.id, result: { tools: OUTILS } }) };
    if (corps.method === 'tools/call') return { ok: true, status: 200, headers: { get: () => '' }, text: async () => json({ jsonrpc: '2.0', id: corps.id, result: { content: [{ type: 'text', text: TEXTE }] } }) };
    return { ok: false, status: 400, headers: { get: () => '' }, text: async () => '' };
  };
  return { fetch, requetes };
}

const reglages = (extra) => () => Object.assign({ cle: 'cle-secrete', url: Y.URL_YOUSIGN_DEFAUT, ecriture: true }, extra);

beforeEach(() => viderConversationsAgent());

test('adresse : https et un nom en .yousign.app seulement — la clé ne part jamais ailleurs', () => {
  assert.equal(Y.urlYousignValide('https://api.yousign.app/mcp'), true);
  assert.equal(Y.urlYousignValide('https://api-sandbox.yousign.app/mcp'), true);
  for (const mauvaise of ['https://autre.yousign.app/mcp', 'http://api.yousign.app/mcp', 'https://yousign.app.evil.fr/mcp', 'https://evil.fr/yousign.app', 'https://u:p@api.yousign.app/mcp', 'https://api.yousign.app:8443/mcp', 'n’importe quoi', '']) {
    assert.equal(Y.urlYousignValide(mauvaise), false, mauvaise);
  }
});

test('classement : lecture (get, search, list), écriture (le reste), send_feedback jamais donné', () => {
  assert.equal(Y.classeOutilYousign('search-signature-requests'), 'lecture');
  assert.equal(Y.classeOutilYousign('get-signature-request-signer'), 'lecture');
  assert.equal(Y.classeOutilYousign('send-signature-request'), 'ecriture');
  assert.equal(Y.classeOutilYousign('remove-signature-request-signer'), 'ecriture');
  assert.equal(Y.classeOutilYousign('send_feedback'), 'exclu');
  assert.equal(Y.classeOutilYousign('x; rm -rf'), 'exclu');
  assert.equal(Y.decouperNomYousign('yousign__create-signature-request'), 'create-signature-request');
  assert.equal(Y.decouperNomYousign('legifrance__x'), null);
});

test('client : session, clé en en-tête, lecture et écriture, send_feedback écarté ; JSON simple comme SSE', async () => {
  for (const sse of [true, false]) {
    const f = fauxMcp({ sse });
    const c = Y.creerClientYousign({ reglages: reglages(), fetch: f.fetch });
    const outils = (await c.outilsAgent()).map((t) => t.name);
    assert.ok(outils.includes('yousign__search-signature-requests') && outils.includes('yousign__send-signature-request'));
    assert.ok(!outils.some((n) => /feedback/.test(n)));
    assert.equal(f.requetes[0].headers.Authorization, 'Bearer cle-secrete');
    const ecriture = (await c.outilsAgent()).find((t) => t.name === 'yousign__send-signature-request');
    assert.match(ecriture.description, /ÉCRIT dans Yousign/);
    const r = await c.appeler('yousign__get-signature-request', { id: 'abc' });
    assert.equal(r.ecriture, false);
    assert.match(r.texte, /Vente FOURNIER/);
    c.attendre([{ nom: 'yousign__send-signature-request', entree: { id: 'abc' } }]);
    const e = await c.appeler('yousign__send-signature-request', { id: 'abc' });
    assert.equal(e.ecriture, true);
    await assert.rejects(() => c.appeler('yousign__send_feedback', {}), /non permis/);
    c.attendre([{ nom: 'yousign__inconnu-du-serveur', entree: {} }]);
    await assert.rejects(() => c.appeler('yousign__inconnu-du-serveur', {}), /inconnu du serveur/);
  }
});

test('écriture sans demande de l’agent : refusée, une fois consommée aussi, et avec d’autres arguments aussi (audit 0.321.0, H1)', async () => {
  const f = fauxMcp();
  const c = Y.creerClientYousign({ reglages: reglages(), fetch: f.fetch });
  await assert.rejects(() => c.appeler('yousign__send-signature-request', { id: 'abc' }), /pas été demandée par l’agent/);
  c.attendre([{ nom: 'yousign__send-signature-request', entree: { id: 'abc', b: { y: 1, x: 2 } } }]);
  await assert.rejects(() => c.appeler('yousign__send-signature-request', { id: 'autre' }), /pas été demandée/, 'autres arguments');
  c.attendre([{ nom: 'yousign__send-signature-request', entree: { id: 'abc', b: { y: 1, x: 2 } } }]);
  assert.equal((await c.appeler('yousign__send-signature-request', { b: { x: 2, y: 1 }, id: 'abc' })).ecriture, true, 'ordre des clés indifférent');
  await assert.rejects(() => c.appeler('yousign__send-signature-request', { id: 'abc', b: { y: 1, x: 2 } }), /pas été demandée/, 'une seule fois');
  // Une lecture n'a besoin de rien ; un appel qui ne figure pas dans attendre() ne devient pas une écriture permise par un nom proche.
  assert.equal((await c.appeler('yousign__get-signature-request', { id: 'abc' })).ecriture, false);
  assert.equal(f.requetes.filter((r) => r.corps.method === 'tools/call').length, 2, 'seuls l’écriture demandée et la lecture sont partis');
});

test('classement : un futur « get-and-send » reste une écriture', () => {
  assert.equal(Y.classeOutilYousign('get-and-send-signature-request'), 'ecriture');
  assert.equal(Y.classeOutilYousign('list-templates'), 'lecture');
  assert.equal(Y.classeOutilYousign('search-workspaces'), 'lecture');
});

test('écriture coupée : seuls les outils de lecture sont donnés et un appel qui écrit est refusé', async () => {
  const f = fauxMcp();
  const c = Y.creerClientYousign({ reglages: reglages({ ecriture: false }), fetch: f.fetch });
  const noms = (await c.outilsAgent()).map((t) => t.name);
  assert.deepEqual(noms.sort(), ['yousign__get-signature-request', 'yousign__search-signature-requests']);
  await assert.rejects(() => c.appeler('yousign__send-signature-request', { id: 'abc' }), /coupée/);
  assert.equal(f.requetes.filter((r) => r.corps.method === 'tools/call').length, 0, 'rien n’est parti chez Yousign');
});

test('sans clé ou clé refusée : aucun outil, aucune requête sans clé ; adresse piégée refusée avant tout envoi', async () => {
  const f = fauxMcp();
  assert.deepEqual(await Y.creerClientYousign({ reglages: reglages({ cle: '' }), fetch: f.fetch }).outilsAgent(), []);
  assert.equal(f.requetes.length, 0);
  assert.deepEqual(await Y.creerClientYousign({ reglages: reglages({ url: 'https://evil.fr/mcp' }), fetch: f.fetch }).outilsAgent(), []);
  assert.equal(f.requetes.length, 0, 'la clé n’est jamais envoyée à une autre adresse');
  assert.deepEqual(await Y.creerClientYousign({ reglages: reglages(), fetch: fauxMcp({ refus: true }).fetch }).outilsAgent(), []);
});

test('routes /yousign : clé jamais renvoyée, gardée si absente, effacée sur chaîne vide ; adresse refusée ; écriture coupée', async () => {
  const { creerApp } = require('../src/app');
  const { ouvrirDb } = require('../src/db');
  const f = fauxMcp();
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, authActive: false }, assistant: { fetchYousign: f.fetch } });
  const serveur = app.listen(0);
  await new Promise((res) => serveur.once('listening', res));
  try {
    const base = `http://127.0.0.1:${serveur.address().port}/api`;
    const requete = async (m, chemin, corps) => { const r = await fetch(base + chemin, { method: m, headers: { 'content-type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined }); return { statut: r.status, json: await r.json() }; };
    assert.match((await requete('POST', '/yousign/appel', { outil: 'yousign__get-signature-request', arguments: {} })).json.erreur, /coupé/);
    let r = (await requete('PUT', '/yousign/reglages', { cle: 'cle-tres-secrete', actif: true })).json;
    assert.equal(r.cleEnregistree, true);
    assert.doesNotMatch(JSON.stringify(r), /tres-secrete/);
    r = (await requete('PUT', '/yousign/reglages', { actif: true })).json;
    assert.equal(r.cleEnregistree, true, 'gardée si le formulaire ne la réémet pas');
    assert.equal((await requete('PUT', '/yousign/reglages', { url: 'https://evil.fr/mcp' })).statut, 400);
    const t = (await requete('POST', '/yousign/tester')).json;
    assert.equal(t.ok, true);
    assert.equal(t.ecriture, 3);
    assert.doesNotMatch(JSON.stringify(t), /tres-secrete/);
    const lu = (await requete('POST', '/yousign/appel', { outil: 'yousign__get-signature-request', arguments: { id: 'abc' } })).json;
    assert.match(lu.texte, /Vente FOURNIER/);
    assert.match((await requete('POST', '/yousign/appel', { outil: 'yousign__send-signature-request', arguments: { id: 'abc' } })).json.erreur, /pas été demandée par l’agent/, 'un curl direct n’envoie rien');
    await requete('PUT', '/yousign/reglages', { ecriture: false });
    assert.match((await requete('POST', '/yousign/appel', { outil: 'yousign__send-signature-request', arguments: { id: 'abc' } })).json.erreur, /coupée/);
    assert.match((await requete('POST', '/yousign/appel', { outil: 'yousign__send_feedback', arguments: {} })).json.erreur, /non permis|inconnu/i);
    r = (await requete('PUT', '/yousign/reglages', { cle: '' })).json;
    assert.equal(r.cleEnregistree, false);
  } finally {
    serveur.close();
  }
});

test('agent : un résultat de Yousign est masqué avant l’IA, les codes sont rétablis dans les arguments et un code inventé est retiré', async () => {
  const outils = (await Y.creerClientYousign({ reglages: reglages(), fetch: fauxMcp().fetch }).outilsAgent());
  const envoyes = [];
  const reponses = [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'yousign__get-signature-request', input: { id: 'abc' } }], usage: {} },
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't2', name: 'yousign__create-signature-request', input: { name: 'Vente [NOM1]', note: '[NOM9]' } }], usage: {} },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Fait.' }], usage: {} }
  ];
  const client = { beta: { messages: { create: async (req) => { envoyes.push(JSON.stringify(req.messages)); return reponses.shift(); } } } };
  const dossiers = [{ id: 'd1', nom: 'FOURNIER / MARTIN', parties: [{ role: 'VENDEUR', nom: 'FOURNIER', prenom: 'Paul' }] }];
  const demandees = [];
  const o = { cle: 'k', client, outilsExternes: outils, surAppelsEcriture: (a) => demandees.push(...a) };
  let s = await tourAgent({ texte: 'où en est la signature ?', dossiers }, o);
  assert.equal(s.appels[0].nom, 'yousign__get-signature-request');
  s = await tourAgent({ conversation: s.conversation, resultats: [{ id: 't1', contenu: { texte: TEXTE } }] }, o);
  const vu = envoyes[1];
  assert.doesNotMatch(vu, /FOURNIER|Fournier|paul\.fournier@exemple/, 'rien de nominatif ne part');
  assert.equal(s.appels[0].nom, 'yousign__create-signature-request');
  assert.match(s.appels[0].entree.name, /FOURNIER/, 'le code est rétabli pour Yousign');
  assert.doesNotMatch(JSON.stringify(s.appels[0].entree), /\[NOM9\]/, 'un code inventé ne part pas');
  const ecritures = demandees.filter((a) => a.nom === 'yousign__create-signature-request');
  assert.equal(ecritures.length, 1, 'l’écriture demandée est annoncée au client Yousign avec les arguments rétablis');
  assert.match(ecritures[0].entree.name, /FOURNIER/);
});

test('masquage des résultats Yousign : prénom en minuscule, nom de demande, lien de signature, uuid gardé (audit 0.321.0, M2)', async () => {
  const outils = (await Y.creerClientYousign({ reglages: reglages(), fetch: fauxMcp().fetch }).outilsAgent());
  const envoyes = [];
  const reponses = [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'yousign__get-signature-request', input: { id: 'abc' } }], usage: {} },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Vu.' }], usage: {} }
  ];
  const client = { beta: { messages: { create: async (req) => { envoyes.push(JSON.stringify(req.messages)); return reponses.shift(); } } } };
  const o = { cle: 'k', client, outilsExternes: outils };
  let s = await tourAgent({ texte: 'où en est la signature ?', dossiers: [] }, o);
  const resultat = { id: '3f2a1b4c-0123-4567-89ab-123456789012', signature_request_id: '123456789-aaaa-bbbb-cccc-dddddddddddd', name: 'acte de vente durand', status: 'ongoing',
    signers: [{ info: { first_name: 'jean', last_name: 'durand', phone_number: '+33612345678' }, signature_link: 'https://app.yousign.app/s/SECRETJETON' }] };
  await tourAgent({ conversation: s.conversation, resultats: [{ id: 't1', contenu: resultat }] }, o);
  const vu = envoyes[1];
  assert.doesNotMatch(vu, /jean|durand|SECRETJETON|612345678/i, 'rien de nominatif ni de lien de signature ne part');
  assert.match(vu, /3f2a1b4c-0123-4567-89ab-123456789012/, 'l’identifiant de la demande reste lisible');
  assert.match(vu, /123456789-aaaa-bbbb/, 'un uuid à neuf chiffres reste intact');
});
