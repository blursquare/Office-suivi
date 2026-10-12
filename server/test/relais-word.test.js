'use strict';

// Relais Word de l'Aide à la rédaction (0.219.0) : installateur, jeton du poste, relevé du paragraphe, insertion.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const {
  executableRelaisAvecConfig, MARQUE_CONFIG_RELAIS, jetonValide, empreinteJeton, texteWord,
  creerEtatRelaisWord, appliquerReleveWord, demanderInsertionWord, etatPosteWord, noterAppelPourRelais, relaisPosteActif
} = require('../src/relaisWord');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

test('programme du relais : configuration du poste ajoutée à la fin (base64 entre deux marques), lisible par le .cs', () => {
  const exe = Buffer.from('MZ-programme');
  const v = executableRelaisAvecConfig(exe, { url: 'http://192.168.60.10:3000/', poste: 'julie', jeton: 'abc123', profil: 'Claire' });
  assert.ok(v.subarray(0, exe.length).equals(exe));
  const fin = v.subarray(exe.length).toString('ascii');
  const m = new RegExp(MARQUE_CONFIG_RELAIS + '([A-Za-z0-9+/=]+)#FIN#$').exec(fin);
  assert.ok(m);
  assert.deepEqual(JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')), { url: 'http://192.168.60.10:3000/', poste: 'julie', jeton: 'abc123', profil: 'Claire' });
});

test('programme du relais (C#) : pas de frappe simulée, blancs repérés sur le texte, ancien relais PowerShell retiré', () => {
  const cs = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'relais', 'CLAIRE-relais.cs'), 'utf8');
  assert.doesNotMatch(cs, /keybd_event|SendInput|SendKeys/);
  assert.match(cs, /AttachThreadInput/);
  assert.match(cs, /Regex\.Matches\(txt, "-\{3,\}"\)/);
  assert.match(cs, /Le curseur n est plus dans ce paragraphe/);
  assert.match(cs, /word-claire\.ps1/);
  assert.match(cs, /corps\["appels"\] = 1/);
  assert.match(cs, /e\.h != IntPtr\.Zero && e\.h != devant/);
  assert.match(cs, /if \(devant == h\) return;/);
});

test('jeton : empreinte seule gardée, comparaison exacte', () => {
  const e = empreinteJeton('secret');
  assert.ok(jetonValide(e, 'secret'));
  assert.ok(!jetonValide(e, 'autre'));
  assert.ok(!jetonValide('', 'secret'));
  assert.ok(!jetonValide(e, undefined));
  assert.ok(!jetonValide(Object, 'x'));
});

test('texteWord : fins de paragraphe et de cellule de Word, contrôles en espace', () => {
  assert.equal(texteWord('Le diagnostic --- \x07\r', 100), 'Le diagnostic ---');
  assert.equal(texteWord('a\x0bb\x01c', 100), 'a\nb c');
});

test('état : relevé, insertion demandée puis rendue au relais une fois, résultats, relais muet', () => {
  const etat = creerEtatRelaisWord();
  assert.equal(etatPosteWord(etat, 'julie', false).installe, false);
  assert.equal(appliquerReleveWord(etat, 'julie', { word: true, titre: 'GAZ', paragraphe: 'Etabli le ---\r' }, 1000).commandes.length, 0);
  let e = etatPosteWord(etat, 'julie', true, 2000);
  assert.ok(e.actif && e.word);
  assert.equal(e.paragraphe, 'Etabli le ---');
  assert.equal(e.n, etat.demarrage + ':1');
  appliquerReleveWord(etat, 'julie', { word: true, inchange: true }, 1500);
  assert.equal(etatPosteWord(etat, 'julie', true, 2000).n, etat.demarrage + ':1');
  assert.ok(demanderInsertionWord(etat, 'julie', { valeur: '', occurrence: 0, attendu: 'x' }, 2000).erreur);
  assert.ok(demanderInsertionWord(etat, 'julie', { valeur: 'v', occurrence: -1, attendu: 'x' }, 2000).erreur);
  const { id } = demanderInsertionWord(etat, 'julie', { valeur: '07 septembre 2026', occurrence: 0, attendu: 'Etabli le ---' }, 2000);
  assert.ok(id);
  const cmd = appliquerReleveWord(etat, 'julie', { word: true, inchange: true }, 2500).commandes;
  assert.equal(cmd.length, 1);
  assert.equal(cmd[0].valeur, '07 septembre 2026');
  assert.equal(appliquerReleveWord(etat, 'julie', { word: true, inchange: true, resultats: [{ id, ok: true }] }, 3000).commandes.length, 0);
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
  assert.equal(appliquerReleveWord(etat, 'paul', { word: true }, 130000).commandes.length, 0);
  // Serveur redémarré : un relais qui n'envoie que « inchangé » est prié de renvoyer son paragraphe.
  assert.equal(appliquerReleveWord(creerEtatRelaisWord(), 'julie', { word: true, inchange: true }).renvoyer, true);
  assert.equal(appliquerReleveWord(etat, 'julie', { word: true, inchange: true }).renvoyer, false);
});

// La configuration ajoutée à la fin du programme téléchargé.
function configDuProgramme(octets) {
  const m = /#CLAIRE-RELAIS#([A-Za-z0-9+/=]+)#FIN#$/.exec(octets.toString('latin1'));
  return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
}

let db; let serveurApp; let baseUrl; let session;
before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0 }, relaisWord: { lireExe: () => Buffer.from('MZ-programme') } });
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
  const cfg = configDuProgramme(Buffer.from(await inst.arrayBuffer()));
  const jeton = cfg.jeton;
  assert.equal(cfg.poste, 'julie');
  assert.match(inst.headers.get('content-disposition'), /CLAIRE-relais\.exe/);
  const releve = (corps) => fetch(`${baseUrl}/api/relais-word/releve`, { method: 'POST', headers: json, body: JSON.stringify(corps) });
  assert.equal((await releve({ poste: 'julie', jeton: 'faux', word: true })).status, 403);
  assert.equal((await releve({ poste: 'paul', jeton, word: true })).status, 403);
  assert.equal((await releve({ poste: 'constructor', jeton, word: true })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/relais-word/etat?poste=constructor`, { headers: auth }).then(x => x.json())).installe, false);
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

test('appels 3CX : sonnerie rendue au relais actif du poste, une fois, jamais vieille ; relais muet → rien', () => {
  const etat = creerEtatRelaisWord();
  assert.equal(noterAppelPourRelais(etat, 'julie', { id: 'ap-1', dossier: true }, 1000), false);
  // Relais 0.219.0 (sans la capacité « appels ») : jamais de sonnerie, l'onglet de 3CX garde son comportement d'avant.
  appliquerReleveWord(etat, 'julie', { word: false }, 1000);
  assert.equal(noterAppelPourRelais(etat, 'julie', { id: 'ap-0', dossier: true }, 1200), false);
  appliquerReleveWord(etat, 'julie', { word: false, appels: 1 }, 1000);
  assert.ok(relaisPosteActif(etat, 'julie', 1500));
  // Battement de plus de 3 s : la sonnerie n'est pas prise.
  assert.equal(noterAppelPourRelais(etat, 'julie', { id: 'ap-v', dossier: true }, 4500), false);
  assert.equal(noterAppelPourRelais(etat, 'julie', { id: 'ap-1', dossier: true }, 1500), true);
  const r = appliquerReleveWord(etat, 'julie', { word: false, inchange: true, appels: 1 }, 2200);
  assert.equal(r.appels.length, 1);
  assert.equal(r.appels[0].dossier, true);
  assert.equal(r.appels[0].ilYaMs, 700);
  assert.equal(appliquerReleveWord(etat, 'julie', { word: false, inchange: true, appels: 1 }, 2500).appels.length, 0);
  assert.equal(noterAppelPourRelais(etat, 'julie', { id: 'ap-2', dossier: false }, 3000), true);
  assert.equal(appliquerReleveWord(etat, 'julie', { word: false, inchange: true }, 12000).appels.length, 0);
  assert.ok(!relaisPosteActif(etat, 'julie', 40000));
});

test('route : sonnerie d’un poste au relais actif → l’onglet de 3CX se ferme aussitôt, le relais reçoit l’appel', async () => {
  const auth = { authorization: `Bearer ${session}` };
  const json = { 'Content-Type': 'application/json' };
  const jeton = configDuProgramme(Buffer.from(await fetch(`${baseUrl}/api/relais-word/installateur?poste=jeremy`, { headers: auth }).then(r => r.arrayBuffer()))).jeton;
  const releve = (corps) => fetch(`${baseUrl}/api/relais-word/releve`, { method: 'POST', headers: json, body: JSON.stringify(corps) }).then(r => r.json());
  await releve({ poste: 'jeremy', jeton, word: false, appels: 1 });
  const page = await fetch(`${baseUrl}/appel?numero=0600000001&nom=&poste=Jeremy`).then(r => r.text());
  assert.match(page, /window\.close\(\);/);
  assert.doesNotMatch(page, /claire-appel|#appel=/);
  const r = await releve({ poste: 'jeremy', jeton, word: false, inchange: true, appels: 1 });
  assert.equal(r.appels.length, 1);
  assert.equal(r.appels[0].dossier, false);
});
