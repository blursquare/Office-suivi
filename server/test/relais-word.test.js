'use strict';

// Relais Word de l'Aide à la rédaction (0.219.0) : installateur, jeton du poste, relevé du paragraphe, insertion.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const {
  scriptInstallationRelaisWord, jetonValide, empreinteJeton, texteWord,
  creerEtatRelaisWord, appliquerReleveWord, demanderInsertionWord, etatPosteWord
} = require('../src/relaisWord');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

test('installateur : script ASCII, clé Run de HKCU, relais lancé, COM de Word, une seule copie', () => {
  const v = scriptInstallationRelaisWord({ url: 'http://192.168.60.10:3000/', poste: 'julie', jeton: 'abc123' });
  assert.doesNotMatch(v, /[^\x00-\x7f]/);
  assert.match(v, /HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\CLAIRE-Word/);
  assert.match(v, /word-claire\.ps1/);
  assert.match(v, /GetActiveObject\('Word\.Application'\)/);
  assert.match(v, /CLAIRE-relais-Word/);
  assert.match(v, /api\/relais-word\/releve/);
  assert.match(v, /''http:\/\/192\.168\.60\.10:3000\/''|'http:\/\/192\.168\.60\.10:3000\/'/);
  assert.match(v, /abc123/);
  // Le paragraphe est revérifié avant d'écrire ; seul le « --- » trouvé est remplacé.
  assert.match(v, /Le curseur n est plus dans ce paragraphe/);
  assert.match(v, /\$r\.Text = \[string\]\$c\.valeur/);
});

test('jeton : empreinte seule gardée, comparaison exacte', () => {
  const e = empreinteJeton('secret');
  assert.ok(jetonValide(e, 'secret'));
  assert.ok(!jetonValide(e, 'autre'));
  assert.ok(!jetonValide('', 'secret'));
  assert.ok(!jetonValide(e, undefined));
});

test('texteWord : fins de paragraphe et de cellule de Word, contrôles en espace', () => {
  assert.equal(texteWord('Le diagnostic --- \x07\r', 100), 'Le diagnostic ---');
  assert.equal(texteWord('a\x0bb\x01c', 100), 'a\nb c');
});

test('état : relevé, insertion demandée puis rendue au relais une fois, résultats, relais muet', () => {
  const etat = creerEtatRelaisWord();
  assert.equal(etatPosteWord(etat, 'julie', false).installe, false);
  assert.deepEqual(appliquerReleveWord(etat, 'julie', { word: true, titre: 'GAZ', paragraphe: 'Etabli le ---\r' }, 1000), []);
  let e = etatPosteWord(etat, 'julie', true, 2000);
  assert.ok(e.actif && e.word);
  assert.equal(e.paragraphe, 'Etabli le ---');
  assert.equal(e.n, 1);
  appliquerReleveWord(etat, 'julie', { word: true, inchange: true }, 1500);
  assert.equal(etatPosteWord(etat, 'julie', true, 2000).n, 1);
  assert.ok(demanderInsertionWord(etat, 'julie', { valeur: '', occurrence: 0, attendu: 'x' }, 2000).erreur);
  assert.ok(demanderInsertionWord(etat, 'julie', { valeur: 'v', occurrence: -1, attendu: 'x' }, 2000).erreur);
  const { id } = demanderInsertionWord(etat, 'julie', { valeur: '07 septembre 2026', occurrence: 0, attendu: 'Etabli le ---' }, 2000);
  assert.ok(id);
  const cmd = appliquerReleveWord(etat, 'julie', { word: true, inchange: true }, 2500);
  assert.equal(cmd.length, 1);
  assert.equal(cmd[0].valeur, '07 septembre 2026');
  assert.equal(appliquerReleveWord(etat, 'julie', { word: true, inchange: true, resultats: [{ id, ok: true }] }, 3000).length, 0);
  assert.equal(etatPosteWord(etat, 'julie', true, 3000).resultats[0].ok, true);
  // Un résultat seul (PowerShell 5.1 aplatit un tableau d'un élément) est lu aussi.
  appliquerReleveWord(etat, 'julie', { word: true, inchange: true, resultats: { id: 'z', ok: false, message: 'refus' } }, 3100);
  assert.equal(etatPosteWord(etat, 'julie', true, 3100).resultats.length, 2);
  // Relais muet : plus actif, plus d'insertion acceptée, le paragraphe n'est plus montré.
  e = etatPosteWord(etat, 'julie', true, 60000);
  assert.ok(!e.actif && e.installe && !e.paragraphe);
  assert.ok(demanderInsertionWord(etat, 'julie', { valeur: 'v', occurrence: 0, attendu: 'x' }, 60000).erreur);
  // Une insertion trop ancienne n'est jamais rendue.
  appliquerReleveWord(etat, 'paul', { word: true }, 100000);
  demanderInsertionWord(etat, 'paul', { valeur: 'v', occurrence: 0, attendu: 'x' }, 100000);
  assert.equal(appliquerReleveWord(etat, 'paul', { word: true }, 130000).length, 0);
});

let db; let serveurApp; let baseUrl; let session;
before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0 } });
  session = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});
after(() => { serveurApp.close(); db.close(); });

test('routes : installateur = jeton du poste ; relevé hors session avec ce jeton seulement ; insertion jusqu’au relais', async () => {
  const auth = { authorization: `Bearer ${session}` };
  const json = { 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${baseUrl}/api/relais-word/installateur?poste=Julie`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/relais-word/etat?poste=julie`, { headers: auth }).then(r => r.json())).installe, false);
  const inst = await fetch(`${baseUrl}/api/relais-word/installateur?poste=Julie`, { headers: auth });
  assert.equal(inst.status, 200);
  const vbs = await inst.text();
  const jeton = /\$jeton = '([0-9a-f]+)'/.exec(vbs)[1];
  assert.match(vbs, /\$poste = 'julie'/);
  const releve = (corps) => fetch(`${baseUrl}/api/relais-word/releve`, { method: 'POST', headers: json, body: JSON.stringify(corps) });
  assert.equal((await releve({ poste: 'julie', jeton: 'faux', word: true })).status, 403);
  assert.equal((await releve({ poste: 'paul', jeton, word: true })).status, 403);
  const r = await releve({ poste: 'julie', jeton, word: true, titre: 'DPE', paragraphe: 'Numéro --- établi le ---\r' });
  assert.deepEqual(await r.json(), { commandes: [] });
  const e = await fetch(`${baseUrl}/api/relais-word/etat?poste=julie`, { headers: auth }).then(x => x.json());
  assert.ok(e.installe && e.actif && e.word);
  assert.equal(e.paragraphe, 'Numéro --- établi le ---');
  // Le jeton n'est jamais renvoyé par l'état.
  assert.doesNotMatch(JSON.stringify(e), new RegExp(jeton));
  const ins = await fetch(`${baseUrl}/api/relais-word/inserer`, { method: 'POST', headers: { ...auth, ...json }, body: JSON.stringify({ poste: 'julie', valeur: '2641E0000000X', occurrence: 0, attendu: e.paragraphe }) });
  assert.equal(ins.status, 200);
  const cmd = await (await releve({ poste: 'julie', jeton, word: true, inchange: true })).json();
  assert.equal(cmd.commandes[0].valeur, '2641E0000000X');
  // Un nouvel installateur remplace le jeton : l'ancien relais est refusé.
  await fetch(`${baseUrl}/api/relais-word/installateur?poste=julie`, { headers: auth });
  assert.equal((await releve({ poste: 'julie', jeton, word: true })).status, 403);
});
