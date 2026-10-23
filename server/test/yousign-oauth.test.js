'use strict';
// Yousign par identifiant et mot de passe (OAuth, étude 23/10) : découverte, enregistrement, PKCE, échange du code, renouvellement, adresses
// limitées à Yousign, jetons jamais renvoyés. Faux serveur d'autorisation en mémoire : aucune connexion réelle.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const crypto = require('node:crypto');

const O = require('../src/yousignOauth');

function fauxAuth(o = {}) {
  const appels = [];
  const rep = (corps, statut = 200) => ({ ok: statut < 300, status: statut, headers: { get: () => '' }, text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)) });
  const fetch = async (url, init = {}) => {
    appels.push({ url, init });
    if (/oauth-protected-resource/.test(url)) return rep({ authorization_servers: [o.serveur || 'https://auth.yousign.app'] });
    if (/oauth-authorization-server/.test(url)) return rep({ authorization_endpoint: 'https://auth.yousign.app/authorize', token_endpoint: 'https://auth.yousign.app/token', registration_endpoint: o.sansEnregistrement ? undefined : 'https://auth.yousign.app/register', scopes_supported: ['mcp'] });
    if (/\/register$/.test(url)) return rep({ client_id: 'client-claire' }, 201);
    if (/\/token$/.test(url)) {
      const p = new URLSearchParams(init.body);
      if (p.get('grant_type') === 'authorization_code') return o.refusEchange ? rep({ error: 'invalid_grant' }, 400) : rep({ access_token: 'acces-1', refresh_token: 'renouv-1', expires_in: 3600 });
      if (p.get('grant_type') === 'refresh_token') return o.refusRenouvellement ? rep({ error: 'invalid_grant' }, 400) : rep({ access_token: 'acces-2', refresh_token: 'renouv-2', expires_in: 3600 });
    }
    return rep('', 404);
  };
  return { fetch, appels };
}

function depot() {
  let v = {};
  return { lire: () => v, ecrire: (x) => { v = x; }, voir: () => v };
}

test('adresses : seulement Yousign en https, sans identifiants ni port', () => {
  assert.equal(O.adresseYousignOauthValide('https://auth.yousign.app/authorize'), true);
  assert.equal(O.adresseYousignOauthValide('https://app.yousign.com/oauth'), true);
  for (const m of ['http://auth.yousign.app/x', 'https://yousign.app.evil.fr/x', 'https://evil.fr/yousign.app', 'https://u:p@auth.yousign.app/x', 'https://auth.yousign.app:444/x', '']) assert.equal(O.adresseYousignOauthValide(m), false, m);
});

test('PKCE : le défi est le SHA-256 du vérificateur', () => {
  const { verifier, challenge } = O.pkce();
  assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'));
  assert.ok(verifier.length >= 43);
});

test('connexion complète : découverte, enregistrement, page de connexion, échange du code, jeton rendu', async () => {
  const f = fauxAuth();
  const d = depot();
  const c = O.creerOauthYousign({ ...d, fetch: f.fetch, maintenant: () => 1000000 });
  const url = new URL(await c.demarrer('https://api.yousign.app/mcp', 'http://127.0.0.1:3000'));
  assert.equal(url.origin + url.pathname, 'https://auth.yousign.app/authorize');
  assert.equal(url.searchParams.get('client_id'), 'client-claire');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:3000/api/yousign/oauth/retour');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const etat = url.searchParams.get('state');
  assert.equal(c.connectee(), false);
  await assert.rejects(() => c.terminer('code-x', 'autre-etat'), /expirée ou inconnue/);
  await c.terminer('code-x', etat);
  const echange = f.appels.find((a) => /\/token$/.test(a.url));
  const p = new URLSearchParams(echange.init.body);
  assert.equal(p.get('code'), 'code-x');
  assert.equal(crypto.createHash('sha256').update(p.get('code_verifier')).digest('base64url'), url.searchParams.get('code_challenge'));
  assert.equal(c.connectee(), true);
  assert.equal(await c.jeton(), 'acces-1');
  await assert.rejects(() => c.terminer('code-x', etat), /expirée ou inconnue/, 'un état ne sert qu’une fois');
});

test('jeton renouvelé avant la fin, un seul renouvellement à la fois ; refus = déconnecté', async () => {
  const f = fauxAuth();
  const d = depot();
  let t = 1000000;
  const c = O.creerOauthYousign({ ...d, fetch: f.fetch, maintenant: () => t });
  const etat = new URL(await c.demarrer('https://api.yousign.app/mcp', 'http://localhost:3000')).searchParams.get('state');
  await c.terminer('c', etat);
  t += 3600 * 1000;
  const [a, b] = await Promise.all([c.jeton(), c.jeton()]);
  assert.equal(a, 'acces-2');
  assert.equal(b, 'acces-2');
  assert.equal(f.appels.filter((x) => /\/token$/.test(x.url) && /refresh_token/.test(String(x.init.body))).length, 1);
  const g = fauxAuth({ refusRenouvellement: true });
  const d2 = depot();
  let t2 = 1000000;
  const c2 = O.creerOauthYousign({ ...d2, fetch: g.fetch, maintenant: () => t2 });
  await c2.terminer('c', new URL(await c2.demarrer('https://api.yousign.app/mcp', 'http://localhost:3000')).searchParams.get('state'));
  t2 += 3600 * 1000;
  await assert.rejects(() => c2.jeton(), /reconnectez-vous/);
  assert.equal(c2.connectee(), false);
});

test('refus : serveur d’autorisation hors Yousign, pas d’enregistrement automatique, échange refusé', async () => {
  const c1 = O.creerOauthYousign({ ...depot(), fetch: fauxAuth({ serveur: 'https://auth.evil.fr' }).fetch });
  // Le serveur d'autorisation annoncé hors Yousign est ignoré : repli sur le serveur MCP lui-même.
  assert.match(await c1.demarrer('https://api.yousign.app/mcp', 'http://localhost:3000'), /^https:\/\/auth\.yousign\.app\/authorize/);
  await assert.rejects(() => O.creerOauthYousign({ ...depot(), fetch: fauxAuth({ sansEnregistrement: true }).fetch }).demarrer('https://api.yousign.app/mcp', 'http://localhost:3000'), /identifiant d’application/);
  const c3 = O.creerOauthYousign({ ...depot(), fetch: fauxAuth({ refusEchange: true }).fetch });
  const etat = new URL(await c3.demarrer('https://api.yousign.app/mcp', 'http://localhost:3000')).searchParams.get('state');
  await assert.rejects(() => c3.terminer('c', etat), /refusé la connexion/);
});

test('routes /yousign/oauth : démarrer rend l’adresse de Yousign, le retour enregistre le jeton, jamais renvoyé ; le client MCP s’en sert', async () => {
  const { creerApp } = require('../src/app');
  const { ouvrirDb } = require('../src/db');
  const auth = fauxAuth();
  const requetesMcp = [];
  const fetchMcp = async (url, init) => {
    requetesMcp.push({ url, headers: init.headers, corps: JSON.parse(init.body) });
    const c = JSON.parse(init.body);
    const sse = (obj) => JSON.stringify(obj);
    if (c.method === 'initialize') return { ok: true, status: 200, headers: { get: (h) => (h === 'mcp-session-id' ? 's1' : '') }, text: async () => sse({ jsonrpc: '2.0', id: c.id, result: {} }) };
    if (!c.id) return { ok: true, status: 202, headers: { get: () => '' }, text: async () => '' };
    return { ok: true, status: 200, headers: { get: () => '' }, text: async () => sse({ jsonrpc: '2.0', id: c.id, result: { tools: [{ name: 'search-signature-requests', description: 'x', inputSchema: { type: 'object', properties: {} } }] } }) };
  };
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, authActive: false }, assistant: { fetchYousign: fetchMcp, fetchOauth: auth.fetch } });
  const serveur = app.listen(0);
  await new Promise((res) => serveur.once('listening', res));
  try {
    const base = `http://127.0.0.1:${serveur.address().port}`;
    const j = async (m, chemin, corps) => (await fetch(base + chemin, { method: m, headers: { 'content-type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined })).json();
    assert.equal((await j('POST', '/api/yousign/tester')).ok, false);
    const d = await j('POST', '/api/yousign/oauth/demarrer');
    assert.equal(d.ok, true);
    const etat = new URL(d.url).searchParams.get('state');
    const retour = await (await fetch(`${base}/api/yousign/oauth/retour?code=abc&state=${encodeURIComponent(etat)}`)).text();
    assert.match(retour, /connectée à Yousign/);
    const r = await j('GET', '/api/yousign/reglages');
    assert.equal(r.connecte, true);
    assert.doesNotMatch(JSON.stringify(r), /acces-1|renouv-1/);
    const t = await j('POST', '/api/yousign/tester');
    assert.equal(t.ok, true);
    assert.equal(requetesMcp[0].headers.Authorization, 'Bearer acces-1', 'le jeton de la connexion sert de clé');
    const mauvais = await (await fetch(`${base}/api/yousign/oauth/retour?code=abc&state=inconnu`)).text();
    assert.match(mauvais, /Connexion impossible/);
    assert.equal((await j('POST', '/api/yousign/oauth/deconnecter')).connecte, false);
  } finally { serveur.close(); }
});

test('renouvellement : une panne passagère (503) garde les jetons, une déconnexion pendant le renouvellement n’est pas annulée', async () => {
  const d = depot();
  let t = 1000000;
  let statut = 503;
  let liberer;
  const porte = new Promise((r) => { liberer = r; });
  const f = fauxAuth();
  const fetch = async (url, init) => {
    if (/\/token$/.test(url) && new URLSearchParams(init.body).get('grant_type') === 'refresh_token') {
      await porte;
      return { ok: statut < 300, status: statut, headers: { get: () => '' }, text: async () => JSON.stringify(statut < 300 ? { access_token: 'neuf', refresh_token: 'r', expires_in: 3600 } : {}) };
    }
    return f.fetch(url, init);
  };
  const c = O.creerOauthYousign({ ...d, fetch, maintenant: () => t });
  const etat = new URL(await c.demarrer('https://api.yousign.app/mcp', 'http://127.0.0.1:3000')).searchParams.get('state');
  await c.terminer('c', etat);
  t += 4000 * 1000;
  liberer();
  await assert.rejects(() => c.jeton(), /expirée/);
  assert.equal(d.voir().refresh, 'renouv-1', 'un 503 ne retire pas le jeton de renouvellement');
  statut = 200;
  const enVol = c.jeton();
  c.deconnecter();
  await assert.rejects(() => enVol, /modifiée/);
  assert.equal(c.connectee(), false, 'déconnecté pendant le renouvellement : reste déconnecté');
});

test('adresse de retour : localhost ou https seulement, l’IP du serveur devient localhost ; le refus d’enregistrement dit sa raison', async () => {
  assert.deepEqual(O.origineRetour('http', '192.168.60.5:3000'), { origine: 'http://localhost:3000', local: false });
  assert.deepEqual(O.origineRetour('http', 'localhost:3000'), { origine: 'http://localhost:3000', local: true });
  assert.deepEqual(O.origineRetour('https', 'claire.exemple.fr'), { origine: 'https://claire.exemple.fr', local: false });
  const f = fauxAuth();
  const refus = async (url, init) => (/\/register$/.test(url)
    ? { ok: false, status: 400, headers: { get: () => '' }, text: async () => JSON.stringify({ error: 'invalid_redirect_uri', error_description: 'redirect uri must be https' }) }
    : f.fetch(url, init));
  const c = O.creerOauthYousign({ ...depot(), fetch: refus });
  await assert.rejects(() => c.demarrer('https://api.yousign.app/mcp', 'http://localhost:3000'), /400 — invalid_redirect_uri : redirect uri must be https/);
});
