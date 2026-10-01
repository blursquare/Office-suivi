'use strict';

// Rapport technique anonymisé déposé sur GitHub (src/rapportTechnique.js, src/journalTechnique.js,
// src/routes/rapportTechnique.js). Aucun appel réseau : `fetch` vers GitHub est une doublure.
// Noms, adresses, montants inventés — l'essentiel ici est qu'AUCUN ne sorte dans le rapport.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { creerJournalTechnique, installerCaptureConsole } = require('../src/journalTechnique');
const {
  motsSensibles, anonymiserTexte, creneauDu, construireRapport, envoyerIssue, messageErreurGithubRapport
} = require('../src/rapportTechnique');
const { evenementPoste } = require('../src/routes/rapportTechnique');

const DOSSIER = {
  id: 'd1', nom: 'DURAND / MARTIN', responsable: 'Julie VASSELIN',
  parties: [
    { role: 'VENDEUR', nom: 'DURAND', prenoms: 'Paul Émile', nomUsage: 'LEBRETON' },
    { role: 'ACQUEREUR', nom: 'MARTIN', prenoms: 'Chloé', email: 'chloe.martin@exemple.fr' }
  ],
  bien: { adresse: '12 rue des Glycines', commune: 'VINEUIL', codePostal: '41350' },
  nomAgence: 'Agence Horizon Immobilier', prixVente: 250000,
  historique: [{ date: '2026-09-30T08:00:00.000Z', texte: 'Dossier créé' }]
};
const INTERDITS = ['DURAND', 'MARTIN', 'Paul', 'Émile', 'LEBRETON', 'Chloé', 'Glycines', 'VINEUIL', 'Vineuil', '41350', 'Horizon', '250', 'chloe', 'Commun', 'Compromis signé', 'VASSELIN', 'Julie', 'LEBRUN'];

function aucunNom(texte) {
  for (const mot of INTERDITS) assert.ok(!texte.includes(mot), `« ${mot} » ne doit pas sortir : ${texte.slice(0, 400)}`);
}

test('anonymiserTexte : chemins, fichiers, emails, montants, téléphones, noms des dossiers masqués ; codes gardés', () => {
  const mots = motsSensibles([DOSSIER], ['Julie VASSELIN']);
  const brut = 'Lecture du NAS impossible : \\\\192.168.60.5\\Commun\\DURAND MARTIN\\Compromis signé.pdf (ENOENT) '
    + 'à script.js:12345:7 pour Paul Émile à Vineuil, prix 250.000,00 €, tel 02 54 12 34 56, chloe.martin@exemple.fr, '
    + 'responsable Julie VASSELIN, voir https://intranet.local/x?dossier=DURAND, Dossier LEBRUN introuvable (HTTP 404, EWS)';
  const net = anonymiserTexte(brut, mots);
  aucunNom(net);
  assert.match(net, /\[chemin\]/);
  assert.match(net, /ENOENT/);
  assert.match(net, /script\.js:12345:7/);
  assert.match(net, /\[email\]/);
  assert.match(net, /\[tel\]/);
  assert.match(net, /\[n\]/);
  assert.match(net, /HTTP 404, EWS/);
  assert.match(net, /Lecture du NAS impossible/);
});

test('anonymiserTexte : un nom en capitales inconnu de la base est masqué, un sigle technique gardé', () => {
  const net = anonymiserTexte('Scan rangé chez LEFEBVRE : PDF lu par OCR, ECONNREFUSED', new Set());
  assert.ok(!net.includes('LEFEBVRE'));
  assert.match(net, /PDF lu par OCR, ECONNREFUSED/);
});

test('creneauDu : 12 h et 17 h (Paris), jours ouvrés, un seul envoi par créneau, rattrapage', () => {
  assert.equal(creneauDu(new Date('2026-09-30T09:59:00Z'), null), null); // 11 h 59
  assert.equal(creneauDu(new Date('2026-09-30T10:00:00Z'), null), '2026-09-30 12h');
  assert.equal(creneauDu(new Date('2026-09-30T10:00:00Z'), '2026-09-30 12h'), null);
  assert.equal(creneauDu(new Date('2026-09-30T13:40:00Z'), '2026-09-30 12h'), null); // 15 h 40
  assert.equal(creneauDu(new Date('2026-09-30T15:30:00Z'), '2026-09-30 12h'), '2026-09-30 17h');
  assert.equal(creneauDu(new Date('2026-09-30T13:40:00Z'), '2026-09-29 17h'), '2026-09-30 12h'); // rattrapage
  assert.equal(creneauDu(new Date('2026-10-03T10:30:00Z'), null), null); // samedi
});

test('journal technique : un message répété est compté, pas dupliqué ; purge au-delà de 14 jours', () => {
  const db = ouvrirDb(':memory:');
  let t = new Date('2026-09-30T08:00:00Z');
  const journal = creerJournalTechnique(db, () => t);
  journal.noter({ source: 'serveur', categorie: 'erreur-serveur', message: 'Boum' });
  t = new Date('2026-09-30T08:05:00Z');
  journal.noter({ source: 'serveur', categorie: 'erreur-serveur', message: 'Boum' });
  assert.equal(journal.noter({ source: 'inconnu', categorie: 'erreur-serveur', message: 'x' }), null);
  const lues = journal.lire('2026-09-30T00:00:00Z', '2026-09-30T09:00:00Z');
  assert.equal(lues.length, 1);
  assert.equal(lues[0].fois, 2);
  t = new Date('2026-10-20T08:00:00Z');
  journal.purger();
  assert.equal(journal.lire('2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z').length, 0);
  db.close();
});

test('capture de console.error / console.warn : journalisé, sans boucle', () => {
  const db = ouvrirDb(':memory:');
  const journal = creerJournalTechnique(db);
  const sorties = [];
  const faux = { error: (...a) => sorties.push(a.join(' ')), warn: (...a) => sorties.push(a.join(' ')) };
  const retirer = installerCaptureConsole(journal, faux);
  faux.error('[CLAIRE] Erreur', new Error('Disque plein'));
  faux.warn('[CLAIRE] Attention');
  retirer();
  const lues = journal.lire('', new Date(Date.now() + 1000).toISOString());
  assert.equal(sorties.length, 2);
  assert.deepEqual(lues.map((e) => e.categorie).sort(), ['avertissement-serveur', 'erreur-serveur']);
  assert.match(lues.find((e) => e.categorie === 'erreur-serveur').message, /Disque plein/);
  db.close();
});

test('evenementPoste : liste blanche stricte (jamais de valeur de dossier)', () => {
  const c = evenementPoste({ categorie: 'correction-extraction', champ: 'prixVente', origine: 'regex', valeur: '250000', avant: 'DURAND' });
  assert.equal(JSON.stringify(c).includes('250000'), false);
  assert.equal(JSON.stringify(c).includes('DURAND'), false);
  assert.equal(c.details.champ, 'prixVente');
  const s = evenementPoste({ categorie: 'scan-lu', dureeMs: 4200.4, ocr: true, reconnu: false, sur: false, type: 'etatDate', nom: 'DURAND.pdf' });
  assert.equal(s.details.dureeMs, 4200);
  assert.equal(JSON.stringify(s).includes('DURAND'), false);
  assert.equal(evenementPoste({ categorie: 'autre', message: 'x' }), null);
});

test('construireRapport : sections, titre, et aucun nom dans le corps ; journée calme', () => {
  const mots = motsSensibles([DOSSIER], ['Julie VASSELIN']);
  const depuis = '2026-09-30T05:00:00.000Z';
  const jusqua = '2026-09-30T10:00:00.000Z';
  const r = construireRapport({
    depuis, jusqua, mots, dossiers: [DOSSIER], buildInstalle: { build: 42, commit: 'abcdef1234' },
    evenements: [
      { categorie: 'erreur-serveur', message: 'Lecture impossible \\\\NAS\\Commun\\DURAND MARTIN\\Offre.pdf', fois: 3, derniere: '2026-09-30T09:00:00.000Z', details: null },
      { categorie: 'erreur-poste', message: "Cannot read properties of undefined (reading 'nom') DURAND", fois: 1, derniere: '2026-09-30T09:10:00.000Z', details: { source: 'script.js:1500', version: '2026-09-30 19:09', onglet: 'Suivi des dossiers' } },
      { categorie: 'correction-extraction', message: 'prixVente', fois: 2, derniere: '2026-09-30T09:20:00.000Z', details: { champ: 'prixVente', origine: 'regex' } },
      { categorie: 'scan-lu', message: 'Scan lu', fois: 1, derniere: '2026-09-30T09:30:00.000Z', details: { dureeMs: 5000, ocr: true, reconnu: false } }
    ],
    signalements: [{ created_at: '2026-09-30T09:40:00.000Z', gravite: 'genant', statut: 'nouveau', action: 'Ouverture du dossier DURAND / MARTIN', constat: 'Le prix de 250.000 € ne s’affiche pas pour Paul', contexte: JSON.stringify({ onglet: 'Suivi', version: 'v1', dossierNom: 'VTE - DURAND / MARTIN', erreurs: [{ message: 'x is undefined chez DURAND', source: 'script.js:10' }] }) }],
    journalScans: [{ date: '2026-09-30T09:00:00.000Z', nom: 'DURAND.pdf', dossier: 'VTE - DURAND / MARTIN', type: 'etatDate', rubrique: 'AAE', auto: true }],
    dernierTourAgenda: { at: '2026-09-30T09:45:00.000Z', ok: false, erreur: 'Refus pour DURAND', evenementsLus: 0, misAJour: [], sansCorrespondance: [], echeancesPosees: [] },
    dernierTourRappels: { at: '2026-09-30T09:30:00.000Z', declenche: 'automatique', rappelsDus: 2, rappelsEnvoyes: 1, erreurs: ['Envoi refusé pour VTE - DURAND / MARTIN'] },
    etatSauvegarde: { derniereReussie: '2026-09-30T02:00:00.000Z', derniereTentative: { at: '2026-09-30T02:00:00.000Z', ok: true } }
  });
  aucunNom(r.titre + r.corps);
  assert.match(r.titre, /^Rapport CLAIRE — 30\/09\/2026 12 h — \d+ point\(s\) à examiner$/);
  for (const s of ['## À examiner', '## Erreurs du serveur (3)', '## Erreurs dans les navigateurs', '## Signalements (1)', '## Corrections à la main', '## Agenda', '## Rappels', '## Claire Scan', '## Sauvegarde', '## Activité']) {
    assert.ok(r.corps.includes(s), s);
  }
  assert.match(r.corps, /prixVente \(proposé par regex\) : 2/);
  assert.match(r.corps, /script\.js:1500/);
  assert.match(r.corps, /build 42 \(commit abcdef1\)/);
  assert.equal(r.calme, false);

  const calme = construireRapport({ depuis, jusqua, mots, dossiers: [], evenements: [] });
  assert.equal(calme.calme, true);
  assert.match(calme.titre, /rien à signaler$/);
});

test('envoyerIssue : POST sur le dépôt avec l’étiquette, réessai sans étiquette sur 422, messages d’erreur', async () => {
  const appels = [];
  const fetchFn = async (url, opts) => {
    appels.push({ url, body: JSON.parse(opts.body), auth: opts.headers.Authorization });
    if (appels.length === 1) return { ok: false, status: 422 };
    return { ok: true, status: 201, json: async () => ({ number: 7, html_url: 'https://github.com/blursquare/Office-suivi/issues/7' }) };
  };
  const r = await envoyerIssue({ jeton: 'github_pat_ABCDEFGHIJKLMNOPQRSTUV', titre: 'T', corps: 'C', fetchFn });
  assert.equal(r.numero, 7);
  assert.equal(appels[0].url, 'https://api.github.com/repos/blursquare/Office-suivi/issues');
  assert.deepEqual(appels[0].body.labels, ['rapport-claire']);
  assert.equal(appels[1].body.labels, undefined);
  assert.equal(appels[0].auth, 'Bearer github_pat_ABCDEFGHIJKLMNOPQRSTUV');
  assert.match(messageErreurGithubRapport(403), /Issues : lecture et écriture/);
  await assert.rejects(envoyerIssue({ jeton: 'x', titre: 'T', corps: 'C', fetchFn: async () => ({ ok: false, status: 401 }) }), /Jeton GitHub refusé/);
});

// ---- Routes ----
let db, serveurApp, baseUrl, jeton, issues, statutGithub;

before(async () => {
  db = ouvrirDb(':memory:');
  issues = [];
  statutGithub = 201;
  const fetchFn = async (url, opts) => {
    issues.push({ url, body: JSON.parse(opts.body) });
    if (statutGithub !== 201) return { ok: false, status: statutGithub };
    return { ok: true, status: 201, json: async () => ({ number: issues.length, html_url: `https://github.com/blursquare/Office-suivi/issues/${issues.length}` }) };
  };
  const { app, gestionnaireAuth, depot } = creerApp({ db, config: { motDePasse: 'mdp', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' }, rapportTechnique: { fetchFn } });
  depot.creer(DOSSIER);
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
  return fetch(baseUrl + chemin, { ...options, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
}

test('routes : événements des postes, aperçu anonymisé, envoi sans jeton puis avec jeton', async () => {
  let r = await appel('/api/journal-technique', { method: 'POST', body: JSON.stringify({ evenements: [
    { categorie: 'erreur-poste', message: 'TypeError chez DURAND / MARTIN', source: 'script.js:99', version: 'v', onglet: 'Suivi des dossiers' },
    { categorie: 'correction-extraction', champ: 'nom', origine: 'regex', valeur: 'DURAND' },
    { categorie: 'inconnue', message: 'x' }
  ] }) });
  assert.equal((await r.json()).notes, 2);

  r = await appel('/api/rapport-technique');
  let etat = await r.json();
  assert.equal(etat.actif, true);
  assert.equal(etat.jetonEnregistre, false);

  r = await appel('/api/rapport-technique/apercu');
  const apercu = await r.json();
  aucunNom(apercu.titre + apercu.corps);
  assert.match(apercu.corps, /script\.js:99/);

  r = await appel('/api/rapport-technique/envoyer', { method: 'POST' });
  etat = await r.json();
  assert.equal(r.status, 502);
  assert.match(etat.erreur, /Aucun jeton GitHub/);
  assert.equal(issues.length, 0);

  await appel('/api/mise-a-jour/jeton', { method: 'PUT', body: JSON.stringify({ jetonGithub: 'github_pat_ABCDEFGHIJKLMNOPQRSTUV' }) });
  statutGithub = 403;
  r = await appel('/api/rapport-technique/envoyer', { method: 'POST' });
  assert.match((await r.json()).erreur, /Issues : lecture et écriture/);

  statutGithub = 201;
  const avant = issues.length;
  r = await appel('/api/rapport-technique/envoyer', { method: 'POST' });
  etat = await r.json();
  assert.equal(r.status, 200);
  assert.ok(etat.dernierEnvoi && etat.dernierEnvoi.url.startsWith('https://github.com/'));
  const envoye = issues[issues.length - 1].body;
  assert.equal(issues.length, avant + 1);
  aucunNom(envoye.title + envoye.body);
  // La période suivante commence à la fin de celle-ci : rien n'est envoyé deux fois.
  r = await appel('/api/rapport-technique/apercu');
  assert.match((await r.json()).titre, /rien à signaler/);

  r = await appel('/api/rapport-technique', { method: 'PUT', body: JSON.stringify({ actif: false }) });
  assert.equal((await r.json()).actif, false);
});

test('messageErreurGithubRapport : 403 et 404 distingués, phrase de GitHub reprise', async () => {
  assert.match(messageErreurGithubRapport(404, 'Not Found'), /ne voit pas le dépôt blursquare\/Office-suivi.*\[GitHub 404 : « Not Found »\]/);
  assert.match(messageErreurGithubRapport(403, 'Resource not accessible by personal access token'), /Issues : lecture et écriture.*« Resource not accessible by personal access token »/);
  const fetchFn = async () => ({ ok: false, status: 403, json: async () => ({ message: 'Resource not accessible by personal access token' }) });
  await assert.rejects(envoyerIssue({ jeton: 'x', titre: 't', corps: 'c', fetchFn }), /Resource not accessible by personal access token/);
});
