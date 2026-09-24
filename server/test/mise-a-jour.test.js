'use strict';

// Mise à jour en un clic (miseAJour.js, routes/miseAJour.js) : lecture de la release GitHub,
// téléchargement contrôlé par empreinte, échange des exécutables, et la route qui enchaîne le tout.
// Aucun appel réseau : `fetch` et le module `sea` sont remplacés par des doublures.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const {
  numeroBuild, comparerVersions, lireBuildInstalle, messageErreurGithub, derniereVersionDisponible,
  telechargerExecutable, echangerExecutables, cheminsExecutable
} = require('../src/miseAJour');

const CONTENU = Buffer.from('MZ' + 'x'.repeat(4096));
const SHA = crypto.createHash('sha256').update(CONTENU).digest('hex');

function fauxSea(build) {
  return { isSea: () => true, getAsset: () => JSON.stringify({ build, commit: 'abc1234', date: '2026-09-24T18:00:00Z' }) };
}

function release(build, options = {}) {
  return {
    tag_name: `serveur-exe-${build}`,
    published_at: '2026-09-24T19:00:00Z',
    body: 'généré automatiquement depuis le commit 0afd617dd235bde389e4df122008944d763d0187.',
    assets: options.sansExe ? [] : [{
      id: 42, name: 'CLAIRE-serveur.exe', url: 'https://api.github.com/repos/x/y/releases/assets/42',
      size: options.taille || CONTENU.length, digest: `sha256:${options.sha || SHA}`
    }]
  };
}

function reponse(statut, corps) {
  return {
    ok: statut >= 200 && statut < 300,
    status: statut,
    json: async () => corps,
    body: Buffer.isBuffer(corps) ? (async function* () { yield corps.subarray(0, 100); yield corps.subarray(100); })() : null
  };
}

// Doublure de fetch : la release pour /releases/latest, les octets pour l'asset. Garde les en-têtes
// reçus pour vérifier le jeton.
function fauxFetch({ build = 11, statutRelease = 200, octets = CONTENU, opts } = {}) {
  const appels = [];
  const fn = async (url, init) => {
    appels.push({ url, headers: (init && init.headers) || {} });
    if (url.endsWith('/releases/latest')) return reponse(statutRelease, release(build, opts));
    return reponse(200, octets);
  };
  fn.appels = appels;
  return fn;
}

function dossierTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claire-maj-'));
}

test('numéro de build : lu dans le tag, rien d\'autre', () => {
  assert.equal(numeroBuild('serveur-exe-137'), 137);
  assert.equal(numeroBuild('serveur-exe-'), null);
  assert.equal(numeroBuild('v1.0'), null);
  assert.equal(numeroBuild(undefined), null);
});

test('comparaison : « inconnu » dès qu\'un des deux builds manque', () => {
  assert.equal(comparerVersions({ build: 10 }, { build: 11 }), 'disponible');
  assert.equal(comparerVersions({ build: 11 }, { build: 11 }), 'a-jour');
  assert.equal(comparerVersions({ build: 12 }, { build: 11 }), 'a-jour');
  assert.equal(comparerVersions(null, { build: 11 }), 'inconnu');
  assert.equal(comparerVersions({ build: null }, { build: 11 }), 'inconnu');
});

test('build installé : lu dans l\'exécutable, null hors exécutable ou sans information', () => {
  assert.equal(lireBuildInstalle(fauxSea(137)).build, 137);
  assert.equal(lireBuildInstalle({ isSea: () => false }), null);
  assert.equal(lireBuildInstalle(null), null);
  assert.equal(lireBuildInstalle({ isSea: () => true, getAsset: () => { throw new Error('absent'); } }), null);
  assert.equal(lireBuildInstalle(fauxSea(null)).build, null);
});

test('message d\'erreur : un 404 parle du jeton (dépôt privé)', () => {
  assert.match(messageErreurGithub(404, false), /privé.*jeton/);
  assert.match(messageErreurGithub(404, true), /Contents/);
  assert.match(messageErreurGithub(401, true), /expiré|révoqué/);
});

test('dernière version : build, commit, empreinte ; le jeton part dans l\'en-tête', async () => {
  const f = fauxFetch({ build: 140 });
  const v = await derniereVersionDisponible({ jeton: 'github_pat_ABCDEFGHIJKLMNOPQRSTUV', fetchFn: f });
  assert.equal(v.build, 140);
  assert.equal(v.commit, '0afd617dd235bde389e4df122008944d763d0187');
  assert.equal(v.asset.sha256, SHA);
  assert.equal(f.appels[0].headers.Authorization, 'Bearer github_pat_ABCDEFGHIJKLMNOPQRSTUV');
  // Sans jeton, aucun en-tête d'authentification.
  const g = fauxFetch();
  await derniereVersionDisponible({ fetchFn: g });
  assert.equal(g.appels[0].headers.Authorization, undefined);
  await assert.rejects(derniereVersionDisponible({ fetchFn: fauxFetch({ statutRelease: 404 }) }), /privé/);
  await assert.rejects(derniereVersionDisponible({ fetchFn: fauxFetch({ opts: { sansExe: true } }) }), /ne contient pas/);
});

test('téléchargement : empreinte contrôlée, rien ne reste en cas de refus', async () => {
  const dossier = dossierTemp();
  const dest = path.join(dossier, 'CLAIRE-serveur.nouveau.exe');
  const asset = (await derniereVersionDisponible({ fetchFn: fauxFetch() })).asset;
  const ok = await telechargerExecutable({ asset, destination: dest, fetchFn: fauxFetch(), tailleMin: 100 });
  assert.equal(ok.sha256, SHA);
  assert.deepEqual(fs.readFileSync(dest), CONTENU);

  fs.rmSync(dest);
  const faux = Buffer.from('MZ' + 'y'.repeat(4096));
  await assert.rejects(telechargerExecutable({ asset, destination: dest, fetchFn: fauxFetch({ octets: faux }), tailleMin: 100 }), /empreinte/);
  assert.equal(fs.readdirSync(dossier).length, 0);

  await assert.rejects(telechargerExecutable({ asset, destination: dest, fetchFn: fauxFetch() }), /trop petit/);
  await assert.rejects(telechargerExecutable({ asset: { ...asset, sha256: '' }, destination: dest, fetchFn: fauxFetch(), tailleMin: 100 }), /empreinte/);
  assert.equal(fs.readdirSync(dossier).length, 0);
});

test('échange : actuel → ancien, nouveau → actuel ; défait si la seconde étape échoue', async () => {
  const dossier = dossierTemp();
  const c = cheminsExecutable(dossier);
  fs.writeFileSync(c.actuel, 'v1');
  fs.writeFileSync(c.ancien, 'v0');
  fs.writeFileSync(c.nouveau, 'v2');
  await echangerExecutables(c);
  assert.equal(fs.readFileSync(c.actuel, 'utf8'), 'v2');
  assert.equal(fs.readFileSync(c.ancien, 'utf8'), 'v1');
  assert.equal(fs.existsSync(c.nouveau), false);

  // Nouveau absent : le second renommage échoue, l'actuel doit être remis en place.
  await assert.rejects(echangerExecutables(c), /conservée/);
  assert.equal(fs.readFileSync(c.actuel, 'utf8'), 'v2');
});

let db, serveurApp, baseUrl, jeton, dossierExe, redemarrages, sauvegardeOk, fetchCourant;

before(async () => {
  db = ouvrirDb(':memory:');
  dossierExe = dossierTemp();
  redemarrages = 0;
  sauvegardeOk = true;
  fetchCourant = fauxFetch({ build: 11 });
  const { app, gestionnaireAuth } = creerApp({
    db,
    config: { motDePasse: 'mdp', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '', cheminDb: path.join(dossierExe, 'claire.db') },
    miseAJour: {
      sea: fauxSea(10),
      fetchFn: (...a) => fetchCourant(...a),
      dossierExe,
      tailleMin: 100,
      sauvegarder: async () => (sauvegardeOk ? { ok: true } : { ok: false, erreur: 'disque plein' }),
      redemarrer: () => { redemarrages++; }
    }
  });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  serveurApp.close();
  db.close();
});

function appel(chemin, options = {}) {
  return fetch(baseUrl + chemin, { ...options, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' } });
}

test('route : authentification requise', async () => {
  assert.equal((await fetch(baseUrl + '/api/mise-a-jour')).status, 401);
});

test('route : le jeton est contrôlé, enregistré, et ne ressort jamais', async () => {
  assert.equal((await appel('/api/mise-a-jour/jeton', { method: 'PUT', body: JSON.stringify({ jetonGithub: 'pas un jeton' }) })).status, 400);
  const r = await (await appel('/api/mise-a-jour/jeton', { method: 'PUT', body: JSON.stringify({ jetonGithub: ' github_pat_ABCDEFGHIJKLMNOPQRSTUV ' }) })).json();
  assert.equal(r.jetonEnregistre, true);
  const etat = await (await appel('/api/mise-a-jour')).json();
  assert.equal(JSON.stringify(etat).includes('github_pat_'), false);
  assert.equal(etat.installe.build, 10);
  assert.equal(etat.modeExe, true);
});

test('route : vérifier compare au build installé et utilise le jeton enregistré', async () => {
  fetchCourant = fauxFetch({ build: 11 });
  const v = await (await appel('/api/mise-a-jour/verifier', { method: 'POST' })).json();
  assert.equal(v.etat, 'disponible');
  assert.equal(v.disponible.build, 11);
  assert.equal(fetchCourant.appels[0].headers.Authorization, 'Bearer github_pat_ABCDEFGHIJKLMNOPQRSTUV');
});

test('route : une sauvegarde impossible annule tout, sans toucher aux fichiers', async () => {
  const c = cheminsExecutable(dossierExe);
  fs.writeFileSync(c.actuel, 'v10');
  sauvegardeOk = false;
  const r = await appel('/api/mise-a-jour/installer', { method: 'POST' });
  assert.equal(r.status, 502);
  assert.match((await r.json()).erreur, /disque plein/);
  assert.equal(fs.readFileSync(c.actuel, 'utf8'), 'v10');
  assert.equal(redemarrages, 0);
  sauvegardeOk = true;
});

test('route : rien à installer quand le build disponible n\'est pas plus récent', async () => {
  fetchCourant = fauxFetch({ build: 10 });
  const r = await appel('/api/mise-a-jour/installer', { method: 'POST' });
  assert.equal(r.status, 409);
  assert.match((await r.json()).erreur, /déjà à jour/);
});

// En dernier : une fois l'installation lancée, la route reste verrouillée — le processus est
// censé s'arrêter et relancer la nouvelle version.
test('route : installation complète, puis redémarrage', async () => {
  const c = cheminsExecutable(dossierExe);
  fetchCourant = fauxFetch({ build: 11 });
  const r = await (await appel('/api/mise-a-jour/installer', { method: 'POST' })).json();
  assert.equal(r.ok, true);
  assert.equal(r.build, 11);
  assert.deepEqual(fs.readFileSync(c.actuel), CONTENU);
  assert.equal(fs.readFileSync(c.ancien, 'utf8'), 'v10');
  await new Promise((ok) => setTimeout(ok, 500));
  assert.equal(redemarrages, 1);
});

test('route : refusée hors exécutable', async () => {
  const db2 = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db: db2, config: { motDePasse: 'mdp', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' }, miseAJour: { sea: null, redemarrer: () => {} } });
  const s = app.listen(0);
  await new Promise((ok) => s.once('listening', ok));
  const r = await fetch(`http://127.0.0.1:${s.address().port}/api/mise-a-jour/installer`, { method: 'POST', headers: { Authorization: `Bearer ${gestionnaireAuth.creerSession()}` } });
  assert.equal(r.status, 409);
  s.close();
  db2.close();
});
