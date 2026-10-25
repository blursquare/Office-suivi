'use strict';

// Relais CLAIRE du poste (0.219.0 →) : programme identique pour tous, code d'installation (jeton), relevé du paragraphe, insertion, sonneries.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const {
  codeInstallationRelais, PREFIXE_CODE_RELAIS, jetonValide, empreinteJeton, texteWord,
  creerEtatRelaisWord, appliquerReleveWord, demanderInsertionWord, etatPosteWord, noterAppelPourRelais, relaisPosteActif, noterPastillePoste, PASTILLE_VUE_MS
} = require('../src/relaisWord');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

test('code d’installation : préfixe puis base64 du JSON de configuration (lu par le .cs)', () => {
  const code = codeInstallationRelais({ url: 'http://192.168.60.10:3000/', poste: 'julie', jeton: 'abc123', profil: 'Claire' });
  assert.ok(code.startsWith(PREFIXE_CODE_RELAIS));
  assert.deepEqual(JSON.parse(Buffer.from(code.slice(PREFIXE_CODE_RELAIS.length), 'base64').toString('utf8')),
    { url: 'http://192.168.60.10:3000/', poste: 'julie', jeton: 'abc123', profil: 'Claire' });
});

test('programme gardé dans le dépôt : compilé depuis le .cs actuel (sinon npm run relais), même fichier pour tous', () => {
  const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
  const dossier = path.join(__dirname, '..', 'relais');
  const source = crypto.createHash('sha256').update(fs.readFileSync(path.join(dossier, 'CLAIRE-relais.cs'))).digest('hex');
  assert.equal(fs.readFileSync(path.join(dossier, 'CLAIRE-relais.source.sha256'), 'utf8').trim(), source, 'CLAIRE-relais.cs modifié : relancer « npm run relais » (serveur) et redonner l’empreinte du .exe pour l’antivirus');
  assert.equal(fs.readFileSync(path.join(dossier, 'CLAIRE-relais.exe')).subarray(0, 2).toString('latin1'), 'MZ');
});

test('programme du relais (C#) : rien de ce qu\'un antivirus prend pour un logiciel espion (1.3, étude 25/10)', () => {
  const cs = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'relais', 'CLAIRE-relais.cs'), 'utf8');
  const code = cs.replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /keybd_event|SendInput|SendKeys/);
  // Ni Word, ni presse-papiers lu, ni marque « téléchargé d'Internet » effacée, ni processus arrêté de force, ni fichier d'un
  // autre programme effacé (rapport de l'étude sur le blocage de Panda du 12/10).
  assert.doesNotMatch(code, /GetActiveObject|Word\.Application|dynamic /);
  assert.doesNotMatch(code, /Clipboard\.(GetText|ContainsText|GetData)/);
  assert.doesNotMatch(code, /Zone\.Identifier|DeleteFileW/);
  assert.doesNotMatch(code, /\.Kill\(|GetProcessesByName|TerminateProcess|winmgmts/);
  assert.doesNotMatch(code, /word-claire|CLAIRE-Word/);
  // Un relais déjà lancé s'arrête par un signal nommé.
  assert.match(code, /EventWaitHandle\(false, EventResetMode\.ManualReset, "Local\\\\CLAIRE-relais-arret"\)/);
  assert.match(code, /Programs", "CLAIRE"/);
  assert.match(code, /AttachThreadInput/);
  assert.match(code, /corps\["appels"\] = 1/);
  assert.match(code, /e\.h != IntPtr\.Zero && e\.h != devant/);
  assert.match(code, /if \(devant == h\) return;/);
  // Configuration par le code collé par l'utilisateur (jamais dans le fichier) ; vérifiée auprès du serveur avant l'installation.
  assert.match(code, /PREFIXE_CODE = "CLAIRE-RELAIS:"/);
  assert.match(code, /relais\.json/);
  assert.match(code, /try \{ Verifier\(\); \}/);
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

// La configuration portée par un code d'installation.
function configDuCode(code) {
  return JSON.parse(Buffer.from(String(code).replace(/^CLAIRE-RELAIS:/, ''), 'base64').toString('utf8'));
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

// Le code d'installation d'un poste (nouveau jeton).
async function codePour(poste) {
  const r = await fetch(`${baseUrl}/api/relais-word/code`, { method: 'POST', headers: { authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ poste }) });
  return (await r.json()).code;
}

test('routes : programme identique pour tous ; code = jeton du poste ; relevé hors session avec ce jeton seulement ; insertion', async () => {
  const auth = { authorization: `Bearer ${session}` };
  const json = { 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${baseUrl}/api/relais-word/programme`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/relais-word/code`, { method: 'POST', headers: json, body: '{"poste":"julie"}' })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/relais-word/etat?poste=julie`, { headers: auth }).then(r => r.json())).installe, false);
  const prog = await fetch(`${baseUrl}/api/relais-word/programme`, { headers: auth });
  assert.equal(prog.status, 200);
  assert.equal(Buffer.from(await prog.arrayBuffer()).toString(), 'MZ-programme');
  assert.match(prog.headers.get('content-disposition'), /CLAIRE-relais\.exe/);
  const cfg = configDuCode(await codePour('Julie'));
  const jeton = cfg.jeton;
  assert.equal(cfg.poste, 'julie');
  const releve = (corps) => fetch(`${baseUrl}/api/relais-word/releve`, { method: 'POST', headers: json, body: JSON.stringify(corps) });
  assert.equal((await releve({ poste: 'julie', jeton: 'faux', word: true })).status, 403);
  assert.equal((await releve({ poste: 'paul', jeton, word: true })).status, 403);
  assert.equal((await releve({ poste: 'constructor', jeton, word: true })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/relais-word/etat?poste=constructor`, { headers: auth }).then(x => x.json())).installe, false);
  const r = await releve({ poste: 'julie', jeton, word: true, titre: 'DPE', paragraphe: 'Numéro --- établi le ---\r' });
  assert.deepEqual(await r.json(), { commandes: [], pastille: 0 });
  // Pastille (0.349.0) : posée par la fenêtre CLAIRE, rendue au relais par la ROUTE du relevé (audit 25/10 : elle s'y perdait).
  const pastille = (corps) => fetch(`${baseUrl}/api/relais-word/pastille`, { method: 'POST', headers: Object.assign({}, json, auth), body: JSON.stringify(corps) }).then(x => x.json());
  assert.deepEqual(await pastille({ poste: 'paul', total: 3 }), { pastille: 0, relais: false }, 'sans relais installé : rien gardé');
  assert.deepEqual(await pastille({ poste: 'julie', total: 3, notifications: [{ cle: 'traiter', n: 2 }] }), { pastille: 3, actions: [] });
  assert.deepEqual(await releve({ poste: 'julie', jeton, word: true, inchange: true, pastille: 1 }).then(x => x.json()),
    { commandes: [], pastille: 3, notifications: [{ type: 'resume', titre: 'Propositions de CLAIRE', texte: '2 propositions à décider' }] });
  // Gestes depuis une carte : jeton exigé ; « Ouvrir » et « Autoriser » rendus à la fenêtre CLAIRE du poste à son envoi suivant.
  const geste = (route, corps) => fetch(`${baseUrl}/api/relais-word/${route}`, { method: 'POST', headers: json, body: JSON.stringify(corps) });
  assert.equal((await geste('ouvrir', { poste: 'julie', jeton: 'faux', canal: 'general' })).status, 403);
  assert.equal((await geste('ouvrir', { poste: 'julie', jeton, canal: 'general' })).status, 200);
  assert.equal((await geste('decider', { poste: 'julie', jeton, id: 'rt-x', decision: 'autoriser' })).status, 200);
  assert.equal((await geste('decider', { poste: 'julie', jeton, id: 'rt-x', decision: 'acceptee' })).status, 400, 'jamais « accepter » sans la fenêtre CLAIRE');
  assert.equal((await geste('decider', { poste: 'julie', jeton, id: 'inconnue', decision: 'refusee' })).status, 400);
  assert.deepEqual((await pastille({ poste: 'julie', total: 0 })).actions, [{ type: 'ouvrir', canal: 'general', id: '' }, { type: 'autoriser', canal: '', id: 'rt-x' }]);
  assert.deepEqual((await pastille({ poste: 'julie', total: 0 })).actions, [], 'une seule fois');
  assert.equal((await geste('repondre', { poste: 'julie', jeton, canal: 'general', texte: '' })).status, 400);
  assert.equal((await geste('repondre', { poste: 'julie', jeton, canal: 'p:bastien-jeremy', texte: 'Bonjour' })).status, 400, 'jamais dans le privé des autres');
  assert.equal((await geste('repondre', { poste: 'julie', jeton, canal: 'l:invente', texte: 'Bonjour' })).status, 400, 'jamais un canal libre inventé');
  assert.equal((await geste('repondre', { poste: 'julie', jeton, canal: 'd:inconnu', texte: 'Bonjour' })).status, 400, 'jamais le canal d’un dossier inexistant');
  assert.equal((await geste('repondre', { poste: 'julie', jeton, canal: 'general', texte: 'Je m’en occupe @Bastien' })).status, 200);
  const general = await fetch(`${baseUrl}/api/canaux/general/messages?utilisateur=${encodeURIComponent('Bastien ANGLUMENT')}`, { headers: auth }).then(x => x.json());
  const dernier = general.messages[general.messages.length - 1];
  assert.equal(dernier.auteur, 'Julie VASSELIN', 'posé au nom du collaborateur du relais');
  assert.deepEqual(dernier.mentions, ['Bastien ANGLUMENT']);
  // Réagir depuis la carte : emoji d'humeur seulement, sur le message d'une personne.
  const dernierJulie = general.messages[general.messages.length - 1];
  assert.equal((await geste('reagir', { poste: 'julie', jeton, canal: 'general', mid: dernierJulie.id, emoji: '📌' })).status, 400, 'jamais un emoji qui commande un geste');
  assert.equal((await geste('reagir', { poste: 'julie', jeton, canal: 'general', mid: dernierJulie.id, emoji: '❤️' })).status, 200);
  // Carte « comme Teams » : écrite par le serveur d'après l'identifiant du canal ; aperçu éteint = rubrique seule.
  await pastille({ poste: 'bastien', total: 1 });
  const cfgB = configDuCode(await codePour('Bastien'));
  await releve({ poste: 'bastien', jeton: cfgB.jeton, inchange: true });
  await pastille({ poste: 'bastien', total: 1, elements: { canaux: ['general', 'p:jeremy-julie'] }, notifications: [{ cle: 'messages', n: 1 }] });
  const cartes = (await releve({ poste: 'bastien', jeton: cfgB.jeton, inchange: true }).then(x => x.json())).notifications;
  assert.equal(cartes.length, 1, 'la carte remplace la bulle de sa rubrique ; le privé des autres jamais');
  assert.equal(cartes[0].type, 'message');
  assert.equal(cartes[0].titre, 'général');
  assert.equal(cartes[0].auteur, 'Julie');
  assert.equal(cartes[0].texte, 'Je m’en occupe @Bastien');
  // Répondre depuis la carte : dans le fil du message (son identifiant est porté par la carte).
  assert.equal((await geste('repondre', { poste: 'bastien', jeton: cfgB.jeton, canal: 'general', texte: 'Merci', parent: cartes[0].parent })).status, 200);
  const g2 = await fetch(`${baseUrl}/api/canaux/general/messages?utilisateur=${encodeURIComponent('Julie VASSELIN')}`, { headers: auth }).then(x => x.json());
  assert.equal(g2.messages[g2.messages.length - 1].parent, cartes[0].parent, 'réponse rangée dans le fil');
  await pastille({ poste: 'bastien', total: 1, apercu: false, elements: { canaux: ['general'] }, notifications: [{ cle: 'messages', n: 1 }] });
  assert.deepEqual((await releve({ poste: 'bastien', jeton: cfgB.jeton, inchange: true }).then(x => x.json())).notifications,
    [{ type: 'resume', titre: 'Discussions', texte: '1 nouveau message' }], 'texte des messages masqué : jamais un nom');
  const e = await fetch(`${baseUrl}/api/relais-word/etat?poste=julie`, { headers: auth }).then(x => x.json());
  assert.ok(e.installe && e.actif && e.word);
  assert.equal(e.paragraphe, 'Numéro --- établi le ---');
  // Le jeton n'est jamais renvoyé par l'état.
  assert.doesNotMatch(JSON.stringify(e), new RegExp(jeton));
  const ins = await fetch(`${baseUrl}/api/relais-word/inserer`, { method: 'POST', headers: { ...auth, ...json }, body: JSON.stringify({ poste: 'julie', valeur: '2641E0000000X', occurrence: 0, attendu: e.paragraphe }) });
  assert.equal(ins.status, 200);
  const cmd = await (await releve({ poste: 'julie', jeton, word: true, inchange: true })).json();
  assert.equal(cmd.commandes[0].valeur, '2641E0000000X');
  // Un nouveau code demandé : le relais en marche garde son jeton tant que le nouveau n'est pas présenté (relecture 0.221.2).
  const nouveau = configDuCode(await codePour('julie')).jeton;
  assert.equal((await releve({ poste: 'julie', jeton, word: true, inchange: true })).status, 200);
  // Contrôle de l'installation : le jeton seul, rien de ce qui attend le relais n'est pris.
  await fetch(`${baseUrl}/api/relais-word/inserer`, { method: 'POST', headers: { ...auth, ...json }, body: JSON.stringify({ poste: 'julie', valeur: 'X', occurrence: 0, attendu: 'p' }) });
  const verif = await releve({ poste: 'julie', jeton: nouveau, verifier: true });
  assert.deepEqual(await verif.json(), { ok: true });
  assert.equal((await (await releve({ poste: 'julie', jeton: nouveau, word: true, inchange: true })).json()).commandes.length, 1);
  // Le nouveau jeton présenté devient celui du poste : l'ancien est refusé.
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
  const json = { 'Content-Type': 'application/json' };
  const jeton = configDuCode(await codePour('jeremy')).jeton;
  const releve = (corps) => fetch(`${baseUrl}/api/relais-word/releve`, { method: 'POST', headers: json, body: JSON.stringify(corps) }).then(r => r.json());
  await releve({ poste: 'jeremy', jeton, word: false, appels: 1 });
  const page = await fetch(`${baseUrl}/appel?numero=0600000001&nom=&poste=Jeremy`).then(r => r.text());
  assert.match(page, /window\.close\(\);/);
  assert.doesNotMatch(page, /claire-appel|#appel=/);
  const r = await releve({ poste: 'jeremy', jeton, word: false, inchange: true, appels: 1 });
  assert.equal(r.appels.length, 1);
  assert.equal(r.appels[0].dossier, false);
});

test('pastille du poste : le compteur de la fenêtre CLAIRE va au relais, éteint quand la fenêtre se tait ; notifications rendues une fois, texte seul', () => {
  const etat = creerEtatRelaisWord();
  noterPastillePoste(etat, 'julie', { total: 4, notifications: [{ cle: 'messages', n: 2 }, { cle: 'inconnue', n: 1 }, { titre: 'Rappelez le 06 11 22 33 44', texte: 'libre' }, { cle: 'traiter', n: 1.5 }, { cle: 'mentions', n: 1 }] }, 1000);
  const r = appliquerReleveWord(etat, 'julie', { word: false, inchange: true, pastille: 1 }, 1500);
  assert.equal(r.pastille, 4);
  assert.equal(r.notifications.map((n) => n.titre + ' : ' + n.texte).join(' | '), 'Discussions : 2 nouveaux messages | Discussions : On vous a cité',
    'texte écrit par le serveur, jamais un texte libre ni une rubrique inconnue');
  assert.equal(appliquerReleveWord(etat, 'julie', { inchange: true }, 2500).notifications.length, 0, 'une seule fois');
  assert.equal(appliquerReleveWord(etat, 'julie', { inchange: true }, 1000 + PASTILLE_VUE_MS + 1).pastille, 0, 'fenêtre fermée : pastille éteinte');
  noterPastillePoste(etat, 'julie', { total: -3 }, 5000);
  assert.equal(appliquerReleveWord(etat, 'julie', { inchange: true }, 5100).pastille, 0);
  noterPastillePoste(etat, 'julie', { total: 5000 }, 6000);
  assert.equal(appliquerReleveWord(etat, 'julie', { inchange: true, pastille: 1 }, 6100).pastille, 999);
  assert.equal(etatPosteWord(etat, 'julie', true, 6200).pastille, true, 'relais qui sait poser la pastille');
  const plein = creerEtatRelaisWord();
  for (let i = 0; i < 150; i++) noterPastillePoste(plein, 'p' + i, { total: 1 }, 1000);
  assert.equal(plein.postes.size, 100, 'jamais plus de 100 postes en mémoire');
});

test('cartes « comme Teams » : une proposition seulement pour son responsable (ou l’administrateur) et tant qu’elle attend', () => {
  const N = require('../src/notificationsPoste');
  const P = require('../src/routines/propositions');
  const memoire = new Map();
  const repo = { lireJsonBrut: (c, d) => (memoire.has(c) ? JSON.parse(memoire.get(c)) : d), ecrireJsonBrut: (c, v) => memoire.set(c, JSON.stringify(v)) };
  P.ecrirePropositions(repo, [
    { id: 'a', routine: 'revue-matin', responsable: 'Julie VASSELIN', dossierId: '', type: 'tache', action: 'tache', empreinte: 'e1', titre: 'Relancer la banque', etat: 'proposee' },
    { id: 'b', routine: 'revue-matin', responsable: 'Jérémy SAUJOT', dossierId: '', type: 'tache', action: 'tache', empreinte: 'e2', titre: 'Autre', etat: 'proposee' },
    { id: 'c', routine: 'revue-matin', responsable: 'Julie VASSELIN', dossierId: '', type: 'tache', action: 'tache', empreinte: 'e3', titre: 'Déjà refusée', etat: 'refusee' }
  ]);
  const pour = (collab) => N.notificationsRiches({ repo, collab, propositions: ['a', 'b', 'c'] }).map((x) => x.id).join(',');
  assert.equal(pour('Julie VASSELIN'), 'a');
  assert.equal(pour('Bastien ANGLUMENT'), 'a,b', 'l’administrateur voit toutes celles qui attendent');
  assert.equal(N.collaborateurDuPoste('jeremy'), 'Jérémy SAUJOT');
  assert.equal(N.ligne('<b>x</b>\nsuite ' + 'y'.repeat(300), 20, true).length, 20);
  assert.equal(N.ligne('prix < 200 000 € et > 150 000', 80), 'prix < 200 000 € et > 150 000', 'le texte d’une personne garde ses chevrons');
  assert.equal(N.ligne('<p>SCI A&amp;B</p>', 80, true), 'SCI A&B');
});

test('carte d’une réaction : pour l’auteur du message seulement, jamais sa propre réaction ni sur un message de CLAIRE ; réglages respectés', () => {
  const N = require('../src/notificationsPoste');
  const memoire = new Map();
  const repo = { lireJsonBrut: (c, d) => (memoire.has(c) ? JSON.parse(memoire.get(c)) : d), ecrireJsonBrut: (c, v) => memoire.set(c, JSON.stringify(v)) };
  const m = { id: 'm1', auteur: 'Julie VASSELIN', texte: 'Je m’en occupe', quand: 1 };
  const c = N.carteReaction({ repo, canal: 'general', message: m, emoji: '👍', par: 'Jérémy SAUJOT' });
  assert.equal(c.poste, 'julie');
  assert.equal(c.carte.type, 'reaction');
  assert.equal(c.carte.contexte, 'Jérémy a réagi 👍 à votre message');
  assert.equal(N.carteReaction({ repo, canal: 'general', message: m, emoji: '👍', par: 'Julie VASSELIN' }), null, 'sa propre réaction');
  assert.equal(N.carteReaction({ repo, canal: 'general', message: Object.assign({}, m, { claire: true, auteur: 'CLAIRE' }), emoji: '👍', par: 'Jérémy SAUJOT' }), null);
  assert.equal(N.carteReaction({ repo, canal: 'p:bastien-jeremy', message: m, emoji: '👍', par: 'Jérémy SAUJOT' }), null, 'privé dont l’auteur n’est pas membre');
  const prefs = (n) => ({ 'Julie VASSELIN': { notifications: n } });
  assert.equal(N.carteReaction({ repo, canal: 'general', message: m, emoji: '👍', par: 'Jérémy SAUJOT', preferences: prefs({ sources: { reactions: false } }) }), null);
  assert.equal(N.carteReaction({ repo, canal: 'general', message: m, emoji: '👍', par: 'Jérémy SAUJOT', preferences: prefs({ windows: false }) }), null);
  assert.deepEqual(N.carteReaction({ repo, canal: 'general', message: m, emoji: '👍', par: 'Jérémy SAUJOT', preferences: prefs({ apercu: false }) }).carte,
    { type: 'resume', titre: 'Discussions', texte: 'Une réaction à votre message' }, 'aperçu éteint : ni nom ni extrait');
});

test('gestes des cartes : rendus seulement à une fenêtre de la machine du relais', () => {
  const R = require('../src/relaisWord');
  const etat = creerEtatRelaisWord();
  R.demanderActionFenetre(etat, 'bastien', { type: 'autoriser', id: 'rt-1' }, 1000, '192.168.60.12');
  assert.deepEqual(R.noterPastillePoste(etat, 'bastien', { total: 0 }, 2000, [], '192.168.60.5').actions, [], 'autre poste du même collaborateur : rien');
  assert.deepEqual(R.noterPastillePoste(etat, 'bastien', { total: 0 }, 3000, [], '192.168.60.12').actions.map((a) => a.id), ['rt-1']);
  assert.deepEqual(R.noterPastillePoste(etat, 'bastien', { total: 0 }, 4000, [], '192.168.60.12').actions, [], 'une seule fois');
  assert.equal(R.adresseRequete({ socket: { remoteAddress: '::ffff:192.168.60.12' } }), '192.168.60.12');
  assert.equal(R.adresseRequete({ socket: { remoteAddress: '::1' } }), 'local');
  assert.equal(R.adresseRequete({ socket: { remoteAddress: '127.0.0.1' } }), 'local', 'le poste serveur, par localhost ou par son adresse');
});
