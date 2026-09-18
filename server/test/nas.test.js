'use strict';

// Lecture du NAS par le serveur (src/nas.js + src/routes/nas.js) — voir ces fichiers pour le
// pourquoi de ce mécanisme, qui remplace l'API File System Access du navigateur.
//
// Deux familles de tests, et la première est la plus importante :
//   - le CONFINEMENT à la racine configurée. Ces routes transforment un paramètre d'URL en chemin
//     de fichier sur le poste serveur : un `..` qui passe donnerait accès à tout le disque à
//     n'importe qui sur le réseau du bureau.
//   - le rapprochement automatique par nom, choisi explicitement par l'étude comme moyen de relier
//     un dossier CLAIRE à son dossier NAS.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const {
  listerPdfRecursif, listerSousDossiers, rapprocherParNom,
  normaliserNomRapprochement, motsSignificatifs, resoudreCheminNas, MAX_FICHIERS
} = require('../src/nas');

// ---- Rapprochement par nom (fonctions pures) ----

test('normaliserNomRapprochement efface accents, casse et ponctuation', () => {
  assert.equal(normaliserNomRapprochement('DÉPONT / Martin-Leroy'), 'DEPONT MARTIN LEROY');
  assert.equal(normaliserNomRapprochement('2024-118_DUPONT'), '2024 118 DUPONT');
  assert.equal(normaliserNomRapprochement(null), '');
});

test('motsSignificatifs écarte les mots trop courants et les numéros de dossier', () => {
  // Sans ça, « VENTE » ou un préfixe numérique ferait matcher n'importe quel dossier du NAS.
  const mots = motsSignificatifs('2024-118 Vente DUPONT et MARTIN');
  assert.equal(mots.join(','), 'DUPONT,MARTIN');
});

test('rapprocherParNom retrouve le dossier NAS malgré le préfixe et la ponctuation', () => {
  const nas = ['2024-115 LEROY BERNARD', '2024-118 DUPONT MARTIN', 'Archives'];
  assert.equal(rapprocherParNom('DUPONT / MARTIN', nas), '2024-118 DUPONT MARTIN');
  assert.equal(rapprocherParNom('LEROY / BERNARD', nas), '2024-115 LEROY BERNARD');
});

test('rapprocherParNom ne tranche pas entre deux candidats à égalité', () => {
  // Deux dossiers d'une même famille : se tromper ferait chercher les pièces d'une vente dans
  // celles d'une autre. Mieux vaut ne rien proposer et laisser l'étude choisir.
  const nas = ['2024-118 DUPONT MARTIN', '2025-004 DUPONT MARTIN'];
  assert.equal(rapprocherParNom('DUPONT / MARTIN', nas), null);
});

test('rapprocherParNom refuse un seul mot en commun quand le nom en compte plusieurs', () => {
  // « DUPONT » seul est un indice trop faible : beaucoup de dossiers peuvent le porter.
  assert.equal(rapprocherParNom('DUPONT / MARTIN', ['2019-002 DUPONT SUCCESSION']), null);
  // En revanche un nom qui ne compte QU'UN mot significatif se contente de ce mot.
  assert.equal(rapprocherParNom('DUPONT', ['2019-002 DUPONT SUCCESSION']), '2019-002 DUPONT SUCCESSION');
});

test('rapprocherParNom ne rend rien sur une liste vide ou un nom sans mot exploitable', () => {
  assert.equal(rapprocherParNom('DUPONT / MARTIN', []), null);
  assert.equal(rapprocherParNom('', ['2024-118 DUPONT']), null);
  assert.equal(rapprocherParNom('de la', ['2024-118 DUPONT']), null);
});

// ---- Confinement des chemins ----

let racine, db, serveurApp, baseUrl, jeton;

before(async () => {
  racine = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-nas-'));
  // Arborescence proche d'un vrai dossier client de l'étude (voir CLAUDE.md) : des rubriques
  // numérotées, dont une avec un sous-dossier.
  fs.mkdirSync(path.join(racine, '2024-118 DUPONT MARTIN', '0 - COMPTABILITE - PRET', 'PRET'), { recursive: true });
  fs.mkdirSync(path.join(racine, '2024-118 DUPONT MARTIN', '3 - Titre de propriete'), { recursive: true });
  fs.mkdirSync(path.join(racine, '2024-115 LEROY BERNARD'), { recursive: true });
  fs.writeFileSync(path.join(racine, '2024-118 DUPONT MARTIN', '0 - COMPTABILITE - PRET', 'PRET', 'Offre de pret.pdf'), '%PDF-1.4 offre');
  fs.writeFileSync(path.join(racine, '2024-118 DUPONT MARTIN', '3 - Titre de propriete', 'Titre.pdf'), '%PDF-1.4 titre');
  fs.writeFileSync(path.join(racine, '2024-118 DUPONT MARTIN', 'notes.txt'), 'pas un pdf');
  // Un fichier HORS de la racine, cible d'une éventuelle traversée.
  fs.writeFileSync(path.join(racine, '..', 'claire-nas-secret.pdf'), '%PDF-1.4 secret');

  db = ouvrirDb(':memory:');
  const config = {
    motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '',
    nasRacine: racine, ollama: { url: 'http://127.0.0.1:1', modele: 'llama3.1:8b' }
  };
  const { app, gestionnaireAuth } = creerApp({ db, config });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  serveurApp.close();
  db.close();
  fs.rmSync(racine, { recursive: true, force: true });
  fs.rmSync(path.join(racine, '..', 'claire-nas-secret.pdf'), { force: true });
});

test('resoudreCheminNas refuse tout ce qui sort de la racine', () => {
  // LE test de ce fichier : ces chemins viennent d'une requête HTTP, pas du code.
  assert.equal(resoudreCheminNas(racine, '../claire-nas-secret.pdf'), null);
  assert.equal(resoudreCheminNas(racine, '2024-118 DUPONT MARTIN/../../claire-nas-secret.pdf'), null);
  assert.equal(resoudreCheminNas(racine, '/etc/passwd'), null);
  assert.equal(resoudreCheminNas(racine, 'a\0b'), null);
  assert.equal(resoudreCheminNas('', 'quoi que ce soit'), null);
});

test('resoudreCheminNas accepte un chemin légitime, racine comprise', () => {
  const cible = resoudreCheminNas(racine, '2024-118 DUPONT MARTIN/3 - Titre de propriete/Titre.pdf');
  assert.ok(cible && cible.endsWith(path.join('3 - Titre de propriete', 'Titre.pdf')));
  assert.ok(resoudreCheminNas(racine, ''));
});

test('resoudreCheminNas suit les liens symboliques AVANT de vérifier', function (t) {
  // Un raccourci posé dans le NAS et pointant ailleurs suffirait sinon à contourner la
  // vérification, qui ne porterait que sur le chemin écrit.
  const lien = path.join(racine, 'raccourci.pdf');
  try {
    fs.symlinkSync(path.join(racine, '..', 'claire-nas-secret.pdf'), lien);
  } catch (_) {
    t.skip('liens symboliques indisponibles sur ce système de fichiers');
    return;
  }
  assert.equal(resoudreCheminNas(racine, 'raccourci.pdf'), null);
  fs.rmSync(lien, { force: true });
});

// ---- Parcours ----

test('listerSousDossiers ne rend que les dossiers clients, triés', () => {
  assert.equal(listerSousDossiers(racine).join(','), '2024-115 LEROY BERNARD,2024-118 DUPONT MARTIN');
});

test('listerPdfRecursif descend dans les sous-dossiers et ignore le reste', () => {
  const fichiers = listerPdfRecursif(path.join(racine, '2024-118 DUPONT MARTIN'));
  assert.equal(fichiers.map((f) => f.nom).sort().join(','), 'Offre de pret.pdf,Titre.pdf');
  assert.ok(fichiers.every((f) => !path.isAbsolute(f.chemin)), 'les chemins rendus doivent rester relatifs');
  assert.ok(!fichiers.some((f) => f.nom === 'notes.txt'));
});

test('listerPdfRecursif parcourt en LARGEUR, pas en profondeur', () => {
  // Reproduit le bug déjà payé côté client : une première rubrique dont le SOUS-dossier est
  // volumineux ne doit pas épuiser le plafond avant que les rubriques suivantes soient vues.
  const gros = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-nas-gros-'));
  fs.mkdirSync(path.join(gros, '0 - COMPTABILITE', 'PRET'), { recursive: true });
  fs.mkdirSync(path.join(gros, '3 - Titre'), { recursive: true });
  for (let i = 0; i < MAX_FICHIERS + 50; i++) {
    fs.writeFileSync(path.join(gros, '0 - COMPTABILITE', 'PRET', `releve-${i}.pdf`), 'x');
  }
  fs.writeFileSync(path.join(gros, '3 - Titre', 'Titre.pdf'), 'x');
  const noms = listerPdfRecursif(gros).map((f) => f.nom);
  assert.ok(noms.includes('Titre.pdf'), 'la rubrique suivante doit être atteinte malgré le plafond');
  assert.ok(noms.length <= MAX_FICHIERS);
  fs.rmSync(gros, { recursive: true, force: true });
});

// ---- Les routes ----

function appeler(chemin) {
  return fetch(`${baseUrl}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
}

test('les routes NAS exigent une authentification', async () => {
  assert.equal((await fetch(`${baseUrl}/api/nas/dossiers`)).status, 401);
});

test('GET /api/nas/dossiers liste les dossiers et propose un rapprochement', async () => {
  const corps = await (await appeler('/api/nas/dossiers?nom=' + encodeURIComponent('DUPONT / MARTIN'))).json();
  assert.equal(corps.dossiers.length, 2);
  assert.equal(corps.propose, '2024-118 DUPONT MARTIN');
});

test('GET /api/nas/fichiers rend les PDF d’un dossier client', async () => {
  const corps = await (await appeler('/api/nas/fichiers?dossier=' + encodeURIComponent('2024-118 DUPONT MARTIN'))).json();
  assert.equal(corps.fichiers.length, 2);
  assert.equal(corps.base, '2024-118 DUPONT MARTIN');
});

test('GET /api/nas/fichiers refuse une traversée de répertoire', async () => {
  assert.equal((await appeler('/api/nas/fichiers?dossier=' + encodeURIComponent('../'))).status, 400);
});

test('GET /api/nas/fichier sert le PDF avec le bon type MIME', async () => {
  const chemin = '2024-118 DUPONT MARTIN/3 - Titre de propriete/Titre.pdf';
  const reponse = await appeler('/api/nas/fichier?chemin=' + encodeURIComponent(chemin));
  assert.equal(reponse.status, 200);
  assert.match(reponse.headers.get('content-type'), /application\/pdf/);
  assert.match(await reponse.text(), /titre/);
});

test('GET /api/nas/fichier refuse une traversée, et tout ce qui n’est pas un PDF', async () => {
  assert.equal((await appeler('/api/nas/fichier?chemin=' + encodeURIComponent('../claire-nas-secret.pdf'))).status, 400);
  assert.equal((await appeler('/api/nas/fichier?chemin=' + encodeURIComponent('2024-118 DUPONT MARTIN/notes.txt'))).status, 400);
  assert.equal((await appeler('/api/nas/fichier?chemin=' + encodeURIComponent('2024-118 DUPONT MARTIN/absent.pdf'))).status, 404);
});

test('sans racine configurée, l’état le dit plutôt que de rendre une liste vide', async () => {
  const db2 = ouvrirDb(':memory:');
  const { app: app2, gestionnaireAuth: auth2 } = creerApp({
    db: db2,
    config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '', nasRacine: '', ollama: { url: 'http://127.0.0.1:1', modele: 'x' } }
  });
  const jeton2 = auth2.creerSession();
  const serveur2 = app2.listen(0);
  await new Promise((resolve) => serveur2.once('listening', resolve));
  const base2 = `http://127.0.0.1:${serveur2.address().port}`;

  const etat = await (await fetch(`${base2}/api/nas/etat`, { headers: { Authorization: `Bearer ${jeton2}` } })).json();
  assert.equal(etat.configure, false);
  assert.match(etat.raison, /nasRacine/);
  assert.equal((await fetch(`${base2}/api/nas/dossiers`, { headers: { Authorization: `Bearer ${jeton2}` } })).status, 503);

  serveur2.close();
  db2.close();
});
