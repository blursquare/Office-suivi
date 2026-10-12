'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { ouvrirDb } = require('../src/db');
const { creerApp } = require('../src/app');
const { creerRepoParametres } = require('../src/parametresRepo');
const {
  nomFichierSauvegarde, sauvegardesARetirer, destinationSauvegarde, validerDossierSauvegarde,
  executerSauvegarde, sauvegardeDuJourFaite, etatApresTentative, joursDepuisDerniereSauvegarde,
  NB_SAUVEGARDES_CONSERVEES
} = require('../src/sauvegarde');

function dossierTemp(prefixe) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefixe));
}

function baseAvecDossiers(cheminDb, n) {
  const db = ouvrirDb(cheminDb);
  const inserer = db.prepare('INSERT INTO dossiers (id, data, updated_at) VALUES (?, ?, ?)');
  for (let i = 0; i < n; i++) inserer.run(`d${i}`, JSON.stringify({ id: `d${i}`, nom: `DOSSIER ${i}` }), Date.now());
  return db;
}

test('nom de fichier : la date du jour, dans un format qui trie dans l\'ordre chronologique', () => {
  assert.equal(nomFichierSauvegarde(new Date(2026, 8, 4, 23, 30)), 'claire-2026-09-04.db');
});

test('rotation : garde les plus récentes, ne touche jamais un fichier qui n\'est pas une sauvegarde', () => {
  const noms = ['claire-2026-09-01.db', 'claire-2026-09-03.db', 'claire-2026-09-02.db', 'notes.txt', 'claire-2026-09-03.db.partiel'];
  assert.equal(sauvegardesARetirer(noms, 2).join(','), 'claire-2026-09-01.db');
  assert.equal(sauvegardesARetirer(noms, 5).length, 0);
  assert.equal(NB_SAUVEGARDES_CONSERVEES, 14);
});

test('destination : le dossier choisi, sinon un dossier local à côté de la base, signalé comme tel', () => {
  assert.deepEqual(destinationSauvegarde('\\\\NAS\\Sauvegardes', '/x/data/claire.db'), { dossier: '\\\\NAS\\Sauvegardes', locale: false });
  const local = destinationSauvegarde('', '/x/data/claire.db');
  assert.equal(local.locale, true);
  assert.equal(local.dossier, path.join('/x/data', 'sauvegardes'));
});

test('dossier saisi : vide accepté, chemin Windows / UNC accepté, chemin relatif refusé', () => {
  assert.equal(validerDossierSauvegarde('').ok, true);
  assert.equal(validerDossierSauvegarde('  ').dossier, '');
  assert.equal(validerDossierSauvegarde('\\\\NAS\\Sauvegardes\\CLAIRE').ok, true);
  assert.equal(validerDossierSauvegarde('D:\\Sauvegardes').ok, true);
  assert.equal(validerDossierSauvegarde('/mnt/nas/sauvegardes').ok, true);
  const relatif = validerDossierSauvegarde('sauvegardes');
  assert.equal(relatif.ok, false);
  assert.match(relatif.erreur, /chemin complet/);
});

test('sauvegarde réelle : copie relisible, contenu complet, fichier temporaire nettoyé', async () => {
  const racine = dossierTemp('claire-sauv-');
  const cheminDb = path.join(racine, 'data', 'claire.db');
  const db = baseAvecDossiers(cheminDb, 3);
  const destination = path.join(racine, 'nas', 'CLAIRE');
  const r = await executerSauvegarde(db, cheminDb, { dossierChoisi: destination, maintenant: new Date(2026, 8, 24, 12) });
  assert.equal(r.ok, true, r.erreur);
  assert.equal(r.nbDossiers, 3);
  assert.equal(r.locale, false);
  const copie = path.join(destination, 'claire-2026-09-24.db');
  assert.ok(fs.existsSync(copie));
  const relue = new DatabaseSync(copie);
  assert.equal(relue.prepare('SELECT COUNT(*) AS n FROM dossiers').get().n, 3);
  relue.close();
  // Rien ne traîne : ni fichier temporaire à côté de la base, ni copie partielle.
  assert.deepEqual(fs.readdirSync(path.join(racine, 'data')).filter((n) => n.includes('sauvegarde')), []);
  assert.deepEqual(fs.readdirSync(destination), ['claire-2026-09-24.db']);
  db.close();
  fs.rmSync(racine, { recursive: true, force: true });
});

test('même jour relancé : la sauvegarde du matin est gardée, la seconde prend l’heure ; 14 jours conservés', async () => {
  const racine = dossierTemp('claire-sauv-');
  const cheminDb = path.join(racine, 'claire.db');
  const db = baseAvecDossiers(cheminDb, 1);
  const destination = path.join(racine, 'sauv');
  fs.mkdirSync(destination);
  for (let j = 1; j <= 15; j++) fs.writeFileSync(path.join(destination, `claire-2026-08-${String(j).padStart(2, '0')}.db`), 'ancien');
  fs.writeFileSync(path.join(destination, 'lisez-moi.txt'), 'à garder');
  const r1 = await executerSauvegarde(db, cheminDb, { dossierChoisi: destination, maintenant: new Date(2026, 8, 24, 9) });
  const r2 = await executerSauvegarde(db, cheminDb, { dossierChoisi: destination, maintenant: new Date(2026, 8, 24, 18) });
  assert.equal(r1.ok && r2.ok, true);
  const restants = fs.readdirSync(destination).sort();
  // 14 jours : le 24/09 (deux fichiers) et les 13 derniers jours d'août.
  assert.equal(restants.filter((n) => n.endsWith('.db')).length, 15);
  assert.ok(restants.includes('claire-2026-09-24.db'));
  assert.ok(restants.includes('claire-2026-09-24-180000.db'));
  assert.equal(r2.fichier, 'claire-2026-09-24-180000.db');
  assert.equal(restants.includes('claire-2026-08-02.db'), false);
  assert.ok(restants.includes('lisez-moi.txt'));
  assert.equal(restants.includes('claire-2026-08-01.db'), false);
  db.close();
  fs.rmSync(racine, { recursive: true, force: true });
});

test('destination impossible : échec rapporté, jamais une exception', async () => {
  const racine = dossierTemp('claire-sauv-');
  const cheminDb = path.join(racine, 'claire.db');
  const db = baseAvecDossiers(cheminDb, 1);
  const fichier = path.join(racine, 'pas-un-dossier');
  fs.writeFileSync(fichier, 'x');
  const r = await executerSauvegarde(db, cheminDb, { dossierChoisi: path.join(fichier, 'sous') });
  assert.equal(r.ok, false);
  assert.ok(r.erreur);
  assert.deepEqual(fs.readdirSync(racine).filter((n) => n.includes('.tmp')), []);
  db.close();
  fs.rmSync(racine, { recursive: true, force: true });
});

test('état : une réussite par jour, un échec ne remplace pas la dernière réussite', () => {
  const reussie = { at: new Date(2026, 8, 20, 10).toISOString(), ok: true };
  let etat = etatApresTentative(null, reussie);
  assert.equal(sauvegardeDuJourFaite(etat, new Date(2026, 8, 20, 18)), true);
  assert.equal(sauvegardeDuJourFaite(etat, new Date(2026, 8, 21, 8)), false);
  etat = etatApresTentative(etat, { at: new Date(2026, 8, 21, 10).toISOString(), ok: false, erreur: 'NAS injoignable' });
  assert.equal(etat.derniereReussie, reussie.at);
  assert.equal(etat.derniereTentative.ok, false);
  assert.equal(joursDepuisDerniereSauvegarde(etat, new Date(2026, 8, 24, 9)), 4);
  assert.equal(joursDepuisDerniereSauvegarde({}, new Date()), null);
});

let db, serveurApp, baseUrl, jeton, racineRoute;

before(async () => {
  racineRoute = dossierTemp('claire-sauv-route-');
  const cheminDb = path.join(racineRoute, 'claire.db');
  db = baseAvecDossiers(cheminDb, 2);
  const config = { motDePasse: 'mdp', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '', cheminDb };
  const { app, gestionnaireAuth } = creerApp({ db, config });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  serveurApp.close();
  db.close();
  fs.rmSync(racineRoute, { recursive: true, force: true });
});

function appeler(chemin, options) {
  return fetch(`${baseUrl}${chemin}`, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(options && options.headers) }
  });
}

test('routes : état initial, dossier refusé puis enregistré, sauvegarde lancée à la main', async () => {
  const sansJeton = await fetch(`${baseUrl}/api/sauvegarde`);
  assert.equal(sansJeton.status, 401);

  const initial = await (await appeler('/api/sauvegarde')).json();
  assert.equal(initial.actif, true);
  assert.equal(initial.destination.locale, true);
  assert.equal(initial.derniereReussie, null);

  const refuse = await appeler('/api/sauvegarde', { method: 'PUT', body: JSON.stringify({ dossier: 'relatif' }) });
  assert.equal(refuse.status, 400);

  const destination = path.join(racineRoute, 'nas');
  const regle = await (await appeler('/api/sauvegarde', { method: 'PUT', body: JSON.stringify({ dossier: destination }) })).json();
  assert.equal(regle.dossier, destination);
  assert.equal(regle.destination.locale, false);

  const lance = await appeler('/api/sauvegarde/lancer', { method: 'POST' });
  assert.equal(lance.status, 200);
  const etat = await lance.json();
  assert.equal(etat.derniereTentative.ok, true, etat.derniereTentative.erreur);
  assert.equal(etat.derniereTentative.nbDossiers, 2);
  assert.equal(etat.joursDepuisDerniere, 0);
  assert.equal(fs.readdirSync(destination).length, 1);
  assert.equal(creerRepoParametres(db).lireEtatSauvegarde().derniereTentative.ok, true);
});
