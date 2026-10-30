'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/gif');

function fauxRepo() { const m = {}; return { lireJsonBrut: (k, d) => (k in m ? m[k] : d), ecrireJsonBrut: (k, v) => { m[k] = v; return v; } }; }

test('GIF (étude 30/10) : seules les images de media*.tenor.com en https ; seul le mot tapé part', () => {
  assert.ok(G.urlImagePermise('https://media.tenor.com/abc/tenor.gif'));
  assert.ok(G.urlImagePermise('https://media1.tenor.com/m/x/y.gif'));
  for (const u of ['http://media.tenor.com/a.gif', 'https://evil.com/media.tenor.com/a.gif', 'https://media.tenor.com.evil.com/a.gif', 'https://media.tenor.com/a.gif?x=1', 'javascript:alert(1)', 42]) assert.ok(!G.urlImagePermise(u), String(u));
  const u = new URL(G.urlRecherche('  bravo  équipe ', 'CLE'));
  assert.equal(u.hostname, 'tenor.googleapis.com');
  assert.equal(u.searchParams.get('q'), 'bravo équipe');
  assert.equal(u.searchParams.get('contentfilter'), 'high');
  assert.match(G.urlRecherche('', 'CLE'), /\/v2\/featured\?/);
  const r = G.resultatsTenor({ results: [{ id: '1', media_formats: { tinygif: { url: 'https://media.tenor.com/a/t.gif' }, gif: { url: 'https://media.tenor.com/a/g.gif' } } },
    { id: '2', media_formats: { tinygif: { url: 'https://ailleurs.com/t.gif' } } }] });
  assert.equal(r.length, 1, 'une image hors Tenor est écartée');
});

test('GIF : sans clé rien ne part ; image refusée si ce n’est pas un GIF de Tenor', async () => {
  const repo = fauxRepo();
  let appels = 0;
  const fauxFetch = async (url) => { appels++; if (String(url).includes('googleapis')) return { ok: true, json: async () => ({ results: [] }) };
    return { ok: true, arrayBuffer: async () => (String(url).includes('pas-gif') ? Buffer.from('<html>coucou</html>') : Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(10)])) }; };
  const gif = G.creerGif(repo, fauxFetch);
  assert.deepEqual(await gif.rechercher('chat'), { disponible: false, resultats: [] });
  assert.equal(appels, 0, 'sans clé : aucun appel');
  repo.ecrireJsonBrut(G.CLE, { cle: 'CLE' });
  assert.equal((await gif.rechercher('chat')).disponible, true);
  assert.equal((await gif.image('https://media.tenor.com/a/g.gif')).subarray(0, 4).toString('latin1'), 'GIF8');
  await assert.rejects(gif.image('https://media.tenor.com/pas-gif/g.gif'), /pas un GIF/);
  await assert.rejects(gif.image('https://autre.com/g.gif'), /refusée/);
});

test('GIF : routes — la clé n’est jamais renvoyée, réglage réservé à l’administrateur', async () => {
  const os = require('node:os');
  const { creerApp } = require('../src/app');
  const { ouvrirDb } = require('../src/db');
  const db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' } });
  const jeton = gestionnaireAuth.creerSession();
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  const appel = (chemin, methode, corps) => fetch(base + chemin, { method: methode || 'GET', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
  try {
    assert.equal((await appel('/api/gif/reglages', 'PUT', { auteur: 'Julie VASSELIN', cle: 'x' })).status, 403);
    assert.equal((await appel('/api/gif/reglages', 'PUT', { auteur: 'Bastien ANGLUMENT', cle: 'secret-tenor' })).status, 200);
    const lu = await (await appel('/api/gif/reglages')).text();
    assert.ok(!lu.includes('secret-tenor') && lu.includes('"cleEnregistree":true'));
    assert.equal((await appel('/api/gif/image?url=' + encodeURIComponent('https://autre.com/a.gif'))).status, 502);
  } finally { s.close(); db.close(); }
});
