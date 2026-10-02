'use strict';

// CLAIRE en application sur un poste (voir src/installationPoste.js) : l'installateur pose les raccourcis
// « --app » vers l'adresse par laquelle le poste joint le serveur, en ASCII (wscript), et n'accepte
// jamais un en-tête Host qui n'a pas la forme d'une adresse.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { scriptInstallationAppPoste, adresseClairePoste } = require('../src/installationPoste');
const { scriptPowerShellRaccourcisPoste, appUserModelIdFenetreApp } = require('../src/raccourciWindows');

let db, serveurApp, baseUrl, jeton;
before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'm', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '', authActive: true } });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((r) => serveurApp.once('listening', r));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});
after(() => { serveurApp.close(); db.close(); });

test('adresseClairePoste : adresse du serveur vue par le poste, rien d’autre', () => {
  assert.equal(adresseClairePoste('http', '192.168.60.10:3000'), 'http://192.168.60.10:3000/');
  assert.equal(adresseClairePoste('https', 'serveur-claire'), 'https://serveur-claire/');
  assert.equal(adresseClairePoste('ftp', 'serveur:3000'), 'http://serveur:3000/');
  assert.equal(adresseClairePoste('http', 'a" & Shell'), null);
  assert.equal(adresseClairePoste('http', "x'; calc"), null);
  assert.equal(adresseClairePoste('http', ''), null);
});

test('installateur : Chrome puis Edge, fenêtre --app dans le profil « Claire », ASCII seulement', () => {
  const s = scriptInstallationAppPoste('http://192.168.60.10:3000/');
  assert.match(s, /^[\x00-\x7F]*$/);
  assert.match(s, /chrome\.exe/);
  assert.match(s, /msedge\.exe/);
  assert.match(s, /--profile-directory=""Claire"" --app=""http:\/\/192\.168\.60\.10:3000\/""/);
  assert.match(s, /api\/poste\/icone\.ico/);
  assert.match(s, /-ExecutionPolicy Bypass -File/);
  assert.ok(s.endsWith('\r\n'));
});

test('raccourcis du poste : identifiant de fenêtre de Chrome ou d’Edge, menu Démarrer et bureau', () => {
  const url = 'http://192.168.60.10:3000/';
  const ps = scriptPowerShellRaccourcisPoste({ url, profil: 'Claire', description: 'CLAIRE' });
  assert.match(ps, /^param\(\[string\]\$cible, \[string\]\$icone\)/);
  assert.ok(ps.includes(appUserModelIdFenetreApp({ baseAppId: 'Chrome', url, dossierDonnees: 'User Data', profil: 'Claire' })));
  assert.ok(ps.includes(appUserModelIdFenetreApp({ baseAppId: 'MSEdge', url, dossierDonnees: 'User Data', profil: 'Claire' })));
  assert.match(ps, /Start Menu\\Programs\\CLAIRE\.lnk/);
  assert.match(ps, /GetFolderPath\('Desktop'\)/);
});

test('routes : installateur avec session, icône lue sans session (absente hors exécutable)', async () => {
  const sans = await fetch(`${baseUrl}/api/poste/installer-application`);
  assert.equal(sans.status, 401);
  const r = await fetch(`${baseUrl}/api/poste/installer-application`, { headers: { Authorization: `Bearer ${jeton}` } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /Installer-CLAIRE-sur-ce-poste\.vbs/);
  assert.match(await r.text(), new RegExp(`--app=""http://127\\.0\\.0\\.1:${serveurApp.address().port}/""`));
  const ico = await fetch(`${baseUrl}/api/poste/icone.ico`);
  assert.equal(ico.status, 404);
});
