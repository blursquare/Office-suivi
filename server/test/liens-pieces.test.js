'use strict';

// Liens signés vers une pièce du NAS, insérés dans la notification Teams (voir src/liensPieces.js,
// la route GET /piece de src/routes/nas.js et POST /api/notifications/pieces-recues). Le point
// central : un clic dans Teams ne porte aucune authentification, c'est la signature du lien qui en
// tient lieu — et elle ne doit ouvrir que CE fichier, pendant une durée limitée, sans jamais sortir
// de la racine du NAS.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const {
  parametresLien, urlLienPiece, lienValide, baseDepuisRequete, DUREE_VALIDITE_LIEN_JOURS
} = require('../src/liensPieces');
const { texteNotificationPieces, texteDossierComplet } = require('../src/routes/notifications');

const SECRET = 'a'.repeat(64);
const JOUR = 24 * 60 * 60 * 1000;

test('lienValide : accepte le lien signé, refuse un chemin ou une signature modifiés', () => {
  const p = parametresLien(SECRET, 'DUPONT/Titre.pdf', Date.UTC(2026, 8, 24));
  assert.equal(lienValide(SECRET, p, Date.UTC(2026, 8, 25)), true);
  assert.equal(lienValide(SECRET, { ...p, c: 'DUPONT/Autre.pdf' }, Date.UTC(2026, 8, 25)), false);
  assert.equal(lienValide(SECRET, { ...p, s: p.s.slice(0, -2) + 'xx' }, Date.UTC(2026, 8, 25)), false);
  assert.equal(lienValide('b'.repeat(64), p, Date.UTC(2026, 8, 25)), false);
  assert.equal(lienValide(SECRET, { c: 'x' }, Date.UTC(2026, 8, 25)), false);
});

test(`lienValide : expire après ${DUREE_VALIDITE_LIEN_JOURS} jours`, () => {
  const depart = Date.UTC(2026, 8, 24);
  const p = parametresLien(SECRET, 'DUPONT/Titre.pdf', depart);
  assert.equal(lienValide(SECRET, p, depart + (DUREE_VALIDITE_LIEN_JOURS - 1) * JOUR), true);
  assert.equal(lienValide(SECRET, p, depart + (DUREE_VALIDITE_LIEN_JOURS + 1) * JOUR), false);
});

test('baseDepuisRequete : garde l\'adresse du poste, remplace localhost par l\'adresse du réseau local', () => {
  const req = (host) => ({ protocol: 'http', get: () => host });
  assert.equal(baseDepuisRequete(req('192.168.1.20:3000'), () => ['192.168.1.10']), 'http://192.168.1.20:3000');
  assert.equal(baseDepuisRequete(req('localhost:3000'), () => ['192.168.1.10']), 'http://192.168.1.10:3000');
  assert.equal(baseDepuisRequete(req('127.0.0.1:3000'), () => ['192.168.1.10']), 'http://192.168.1.10:3000');
  // Aucune adresse du réseau local connue : on garde ce qu'on a plutôt que de ne rien mettre.
  assert.equal(baseDepuisRequete(req('localhost:3000'), () => []), 'http://localhost:3000');
});

test('texteNotificationPieces : une ligne par lien, rien de plus sans lien', () => {
  const sans = texteNotificationPieces('DUPONT / MARTIN', ['ERP']);
  assert.equal(sans.includes('\n'), false);
  const avec = texteNotificationPieces('DUPONT / MARTIN', ['ERP', 'Titre'], [{ label: 'ERP', url: 'http://x/piece?c=1' }]);
  assert.match(avec, /\n• ERP : http:\/\/x\/piece\?c=1$/);
});

test('texteDossierComplet : nomme le dossier et dit qu\'il est prêt à être rédigé', () => {
  const t = texteDossierComplet('DUPONT / MARTIN');
  assert.match(t, /DUPONT \/ MARTIN/);
  assert.match(t, /prêt à être rédigé/);
});

let db, serveurApp, baseUrl, jeton, racine;
const envois = [];
const envoyerEmailFn = async (reglages, destinataire, texte) => {
  envois.push({ destinataire, texte });
  return { ok: true, erreur: null };
};

before(async () => {
  racine = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-liens-'));
  fs.mkdirSync(path.join(racine, 'DUPONT MARTIN', '9 - AAE'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'DUPONT MARTIN', '9 - AAE', 'Titre.pdf'), '%PDF-1.4 test');
  fs.writeFileSync(path.join(os.tmpdir(), 'hors-nas.pdf'), '%PDF-1.4 secret');
  db = ouvrirDb(':memory:');
  const config = { motDePasse: 'mdp', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '', nasRacine: racine };
  const { app, gestionnaireAuth } = creerApp({ db, config, envoyerEmailFn });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  serveurApp.close();
  db.close();
  fs.rmSync(racine, { recursive: true, force: true });
});

function appeler(chemin, options) {
  return fetch(`${baseUrl}${chemin}`, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(options && options.headers) }
  });
}

test('notification avec chemin → le message porte un lien qui ouvre le PDF SANS authentification', async () => {
  await appeler('/api/reglages', { method: 'PUT', body: JSON.stringify({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' } }) });
  envois.length = 0;
  const reponse = await appeler('/api/notifications/pieces-recues', {
    method: 'POST',
    body: JSON.stringify({
      dossierNom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT',
      pieces: [{ label: 'Titre de propriété', chemin: 'DUPONT MARTIN/9 - AAE/Titre.pdf' }, 'ERP']
    })
  });
  assert.equal(reponse.status, 200);
  assert.equal(envois.length, 1);
  const url = envois[0].texte.match(/• Titre de propriété : (\S+)/)[1];
  assert.match(url, /\/piece\?c=/);
  // Aucune ligne de lien pour une pièce sans chemin.
  assert.equal(/• ERP/.test(envois[0].texte), false);

  // Rejoué sur le serveur de test (l'hôte du lien peut être une adresse du réseau local).
  const chemin = new URL(url).pathname + new URL(url).search;
  const ouvert = await fetch(baseUrl + chemin);
  assert.equal(ouvert.status, 200);
  assert.equal(ouvert.headers.get('content-type'), 'application/pdf');
  assert.equal(await ouvert.text(), '%PDF-1.4 test');
});

test('GET /piece : signature fausse → 403, sans lire le NAS', async () => {
  const p = parametresLien(SECRET, 'DUPONT MARTIN/9 - AAE/Titre.pdf'); // secret différent de celui du serveur
  const reponse = await fetch(`${baseUrl}/piece?${new URLSearchParams(p)}`);
  assert.equal(reponse.status, 403);
});

test('GET /piece : même bien signé, un chemin hors du NAS reste refusé', async () => {
  const secret = require('../src/parametresRepo').creerRepoParametres(db).lireSecretLiens();
  const url = urlLienPiece(baseUrl, secret, '../hors-nas.pdf');
  const reponse = await fetch(url);
  assert.equal(reponse.status, 404);
  assert.equal((await reponse.text()).includes('secret'), false);
});

test('POST /api/notifications/dossier-complet : un message au responsable', async () => {
  envois.length = 0;
  const reponse = await appeler('/api/notifications/dossier-complet', {
    method: 'POST', body: JSON.stringify({ dossierNom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT' })
  });
  assert.equal(reponse.status, 200);
  assert.equal(envois.length, 1);
  assert.equal(envois[0].destinataire, 'bastien@etude.fr');
  assert.match(envois[0].texte, /complet/);
  const sansNom = await appeler('/api/notifications/dossier-complet', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(sansNom.status, 400);
});
