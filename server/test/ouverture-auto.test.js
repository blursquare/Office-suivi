'use strict';

// Ouverture automatique des documents téléchargés (voir src/ouvertureAuto.js) : le script installé
// sur un poste doit rester strictement borné (extensions permises, dossier Téléchargements, fichier
// récent) et lisible par wscript (ASCII).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { scriptInstallationOuvertureAuto, EXTENSIONS_OUVERTURE_AUTO } = require('../src/ouvertureAuto');

let db, serveurApp, baseUrl, jeton;
before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'm', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' } });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((r) => serveurApp.once('listening', r));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});
after(() => { serveurApp.close(); db.close(); });

test('script d’installation : protocole claire-ouvrir en HKCU, relais borné, ASCII seulement', () => {
  const s = scriptInstallationOuvertureAuto();
  assert.match(s, /^[\x00-\x7F]*$/);
  assert.match(s, /HKCU\\Software\\Classes\\claire-ouvrir\\shell\\open\\command\\/);
  assert.match(s, /URL Protocol/);
  assert.doesNotMatch(s, /HKLM/);
  // Relais : seules ces extensions, seul le dossier Téléchargements, fichier de moins de 2 minutes.
  assert.equal(EXTENSIONS_OUVERTURE_AUTO.join(), 'eml,docx,doc,ics');
  assert.match(s, /\|eml\|docx\|doc\|ics\|/);
  assert.match(s, /shell:Downloads/);
  assert.match(s, /DateDiff\(""s"", fichier\.DateLastModified, Now\) <= 120/);
  assert.ok(s.includes('\r\n'));
});

test('route : l’installateur se télécharge en .vbs', async () => {
  const r = await fetch(`${baseUrl}/api/poste/installer-ouverture-automatique`, { headers: { Authorization: `Bearer ${jeton}` } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /Installer-ouverture-automatique-CLAIRE\.vbs/);
  assert.match(await r.text(), /claire-ouvrir/);
});
