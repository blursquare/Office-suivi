'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

const MOT_DE_PASSE = 'test-mot-de-passe';

function config() {
  return {
    motDePasse: MOT_DE_PASSE,
    racineRepo: os.tmpdir(), // le contenu statique n'est pas ce qu'on teste ici
    port: 0
  };
}

// Une base SQLite en mémoire par suite de test (pas de fichier sur disque, pas de nettoyage à
// faire), migrée via le même chemin que la vraie base (ouvrirDb applique le schéma).
let db;
let serveur;
let baseUrl;
let jeton;

before(async () => {
  db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: config() });
  serveur = app.listen(0);
  await new Promise((resolve) => serveur.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveur.address().port}`;

  const reponse = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ motDePasse: MOT_DE_PASSE })
  });
  assert.equal(reponse.status, 200);
  ({ jeton } = await reponse.json());
  assert.ok(jeton && jeton.length > 0);
});

after(() => {
  serveur.close();
  db.close();
});

function avecAuth(options = {}) {
  return {
    ...options,
    headers: { ...(options.headers || {}), authorization: `Bearer ${jeton}` }
  };
}

async function appelApi(chemin, options) {
  const reponse = await fetch(`${baseUrl}${chemin}`, avecAuth(options));
  const corps = reponse.status === 204 ? null : await reponse.json();
  return { statut: reponse.status, corps };
}

test('POST /api/login refuse un mauvais mot de passe', async () => {
  const reponse = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ motDePasse: 'faux' })
  });
  assert.equal(reponse.status, 401);
});

test('GET /api/dossiers refuse une requête sans jeton', async () => {
  const reponse = await fetch(`${baseUrl}/api/dossiers`);
  assert.equal(reponse.status, 401);
});

test('GET /api/dossiers refuse un jeton invalide', async () => {
  const reponse = await fetch(`${baseUrl}/api/dossiers`, { headers: { authorization: 'Bearer nimportequoi' } });
  assert.equal(reponse.status, 401);
});

test('cycle complet : créer, lire via since, modifier, supprimer, restaurer', async () => {
  const dossier = { id: 'd-test-1', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' };

  // Création
  const creation = await appelApi('/api/dossiers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(dossier)
  });
  assert.equal(creation.statut, 201);
  assert.equal(creation.corps.nom, 'DUPONT / MARTIN');
  assert.ok(typeof creation.corps.updatedAt === 'number');

  // Une création en double du même id est refusée
  const doublon = await appelApi('/api/dossiers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(dossier)
  });
  assert.equal(doublon.statut, 409);

  // Premier chargement (since=0) : le dossier créé doit apparaître
  const premierChargement = await appelApi('/api/dossiers?since=0');
  assert.equal(premierChargement.statut, 200);
  const trouve = premierChargement.corps.dossiers.find((d) => d.id === 'd-test-1');
  assert.ok(trouve, 'le dossier créé doit être renvoyé par le premier chargement');
  assert.equal(trouve.nom, 'DUPONT / MARTIN');
  const curseurApresCreation = premierChargement.corps.serverTime;

  // Rien de nouveau depuis ce curseur
  const rienDeNeuf = await appelApi(`/api/dossiers?since=${curseurApresCreation}`);
  assert.deepEqual(rienDeNeuf.corps.dossiers, []);

  // Modification (PUT)
  const modifie = { ...dossier, nom: 'DUPONT / MARTIN (modifié)' };
  const miseAJour = await appelApi('/api/dossiers/d-test-1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(modifie)
  });
  assert.equal(miseAJour.statut, 200);
  assert.equal(miseAJour.corps.nom, 'DUPONT / MARTIN (modifié)');

  // La modification apparaît bien dans un polling depuis le curseur d'avant
  const apresModif = await appelApi(`/api/dossiers?since=${curseurApresCreation}`);
  const modifDetectee = apresModif.corps.dossiers.find((d) => d.id === 'd-test-1');
  assert.equal(modifDetectee.nom, 'DUPONT / MARTIN (modifié)');
  const curseurApresModif = apresModif.corps.serverTime;

  // Suppression douce
  const suppression = await appelApi('/api/dossiers/d-test-1', { method: 'DELETE' });
  assert.equal(suppression.statut, 204);

  // Le polling voit un tombstone, pas le dossier complet
  const apresSuppression = await appelApi(`/api/dossiers?since=${curseurApresModif}`);
  const tombstone = apresSuppression.corps.dossiers.find((d) => d.id === 'd-test-1');
  assert.deepEqual(tombstone, { id: 'd-test-1', deleted: true, updatedAt: tombstone.updatedAt });

  // Restauration ("Annuler")
  const restauration = await appelApi('/api/dossiers/d-test-1/undelete', { method: 'POST' });
  assert.equal(restauration.statut, 200);
  assert.equal(restauration.corps.nom, 'DUPONT / MARTIN (modifié)');
});

test('PUT sur un id inexistant renvoie 404', async () => {
  const reponse = await appelApi('/api/dossiers/inexistant', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'inexistant', nom: 'x' })
  });
  assert.equal(reponse.statut, 404);
});

test('DELETE sur un id déjà supprimé renvoie 404 (pas de double suppression silencieuse)', async () => {
  await appelApi('/api/dossiers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'd-test-2', nom: 'À supprimer deux fois' })
  });
  const premiere = await appelApi('/api/dossiers/d-test-2', { method: 'DELETE' });
  assert.equal(premiere.statut, 204);
  const seconde = await appelApi('/api/dossiers/d-test-2', { method: 'DELETE' });
  assert.equal(seconde.statut, 404);
});

test('POST /api/dossiers rejette un corps sans id', async () => {
  const reponse = await appelApi('/api/dossiers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nom: 'sans id' })
  });
  assert.equal(reponse.statut, 400);
});
