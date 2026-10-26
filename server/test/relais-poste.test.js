'use strict';
// Relais 2.0 (étude 26/10) : CLAIRE-serveur.exe sous le nom CLAIRE-relais.exe. Fonctions pures, boucle et boutons des toasts avec un
// faux système (aucun PowerShell, aucun registre, aucune requête réelle).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('../src/relaisPoste');
const { codeInstallationRelais } = require('../src/relaisWord');

const JETON = 'a'.repeat(48);

test('mode relais : par le nom de l’exécutable ou --relais, jamais pour CLAIRE-serveur.exe', () => {
  assert.equal(R.estModeRelais('C:\\Users\\julie\\AppData\\Local\\Programs\\CLAIRE\\CLAIRE-relais.exe', []), true);
  assert.equal(R.estModeRelais('C:\\Users\\julie\\Downloads\\CLAIRE-relais (1).exe', []), true);
  assert.equal(R.estModeRelais('C:\\CLAIRE\\CLAIRE-serveur.exe', []), false);
  assert.equal(R.estModeRelais('/usr/bin/node', ['src/index.js', '--relais']), true);
  assert.deepEqual(R.modeDepuisArgs(['--fond']), { mode: 'fond' });
  assert.deepEqual(R.modeDepuisArgs(['--action', 'claire-relais:ouvrir']), { mode: 'action', lien: 'claire-relais:ouvrir' });
  assert.deepEqual(R.modeDepuisArgs([]), { mode: 'installer' });
});

test('code d’installation : celui que CLAIRE copie est lu ; tout le reste refusé', () => {
  const code = codeInstallationRelais({ url: 'http://192.168.60.10:3000/', poste: 'julie', jeton: JETON, profil: 'Claire' });
  assert.deepEqual(R.configDuCode('  ' + code + '\r\n'), { url: 'http://192.168.60.10:3000/', poste: 'julie', jeton: JETON, profil: 'Claire' });
  assert.equal(R.configDuCode('n’importe quoi'), null);
  const mauvais = (o) => R.configDuCode('CLAIRE-RELAIS:' + Buffer.from(JSON.stringify(o)).toString('base64'));
  assert.equal(mauvais({ url: 'javascript:alert(1)/', poste: 'julie', jeton: JETON }), null);
  assert.equal(mauvais({ url: 'http://x/', poste: 'Julie VASSELIN', jeton: JETON }), null);
  assert.equal(mauvais({ url: 'http://x/', poste: 'julie', jeton: 'court' }), null);
  assert.equal(mauvais({ url: 'http://x/', poste: 'julie', jeton: JETON, profil: '" --x' }).profil, 'Claire');
});

test('lien claire-relais : actions connues, identifiants seuls, emoji d’humeur seul', () => {
  const l = R.lienAction('reagir', { canal: 'd:abc123', mid: 'm_1', emoji: '👍' });
  assert.deepEqual(R.actionDuLien(l), { action: 'reagir', canal: 'd:abc123', mid: 'm_1', parent: '', id: '', emoji: '👍' });
  assert.equal(R.actionDuLien('claire-relais:effacer?id=x'), null);
  assert.equal(R.actionDuLien('claire-relais:reagir?canal=d%3Aabc&mid=m1&emoji=%F0%9F%93%8C'), null, '📌 commande un geste : jamais depuis un toast');
  assert.equal(R.actionDuLien('claire-relais:autoriser?id=..%2F..'), null);
  assert.equal(R.actionDuLien('claire-relais:ouvrir?canal=%22%3B%20calc').canal, '');
  assert.equal(R.actionDuLien('http://exemple.invalid/'), null);
});

test('toast : XML échappé, boutons d’un message et d’une proposition, lien de la carte = ouvrir CLAIRE sur le canal', () => {
  const x = R.toastXml({ type: 'message', auteur: 'Julie', titre: 'VTE - <MARTIN>', heure: '10:12', texte: 'a & b "c"', canal: 'd:abc', mid: 'm1' }, 'C:\\photos\\p.jpg');
  assert.match(x, /^<toast launch="claire-relais:ouvrir\?canal=d%3Aabc" activationType="protocol">/);
  assert.match(x, /VTE - &lt;MARTIN&gt; · 10:12/);
  assert.match(x, /a &amp; b &quot;c&quot;/);
  assert.match(x, /content="Répondre"/);
  assert.match(x, /claire-relais:reagir\?canal=d%3Aabc&amp;mid=m1&amp;emoji=%F0%9F%91%8D/);
  assert.match(x, /appLogoOverride" hint-crop="circle" src="C:\\photos\\p.jpg"/);
  const p = R.toastXml({ type: 'proposition', titre: 'Relance de l’offre de prêt', id: 'prop_1', canal: 'd:abc' });
  assert.match(p, /Proposition de CLAIRE/);
  assert.match(p, /content="Autoriser" activationType="protocol" arguments="claire-relais:autoriser\?id=prop_1"/);
  assert.match(p, /content="Refuser"/);
  assert.doesNotMatch(R.toastXml({ type: 'resume', titre: 'Discussions', texte: '2 messages' }), /<actions>/);
});

test('rien de ce qu’un antivirus prend pour un logiciel espion ; aucune commande encodée, aucun script sur le disque', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'relaisPoste.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /EncodedCommand|-enc\b|Clipboard|GetClipboard|Zone\.Identifier|Stop-Process|taskkill|\.kill\(|keybd_event|SendKeys|Add-Type -TypeDefinition|Add-Type @/i);
  assert.doesNotMatch(code, /\.ps1|\.vbs|\.bat|\.cmd/);
  assert.doesNotMatch(code, /\.(ps1|vbs|js)['"]/);
  assert.doesNotMatch(code, /ExecutionPolicy|Bypass|WindowStyle|conhost/i);
  // L'ancien relais (C#) est prié de s'arrêter par son signal nommé.
  assert.match(R.scriptArreterAncien(), /Local\\CLAIRE-relais-arret/);
});

test('registre : démarrage et lien par l’exécutable lui-même (jamais conhost --headless), nom des notifications « CLAIRE »', () => {
  const c = R.commandesRegistre('C:\\Users\\j\\AppData\\Local\\Programs\\CLAIRE\\CLAIRE-relais.exe', 'C:\\x\\claire.ico').map((a) => a.join(' '));
  assert.ok(c.some((l) => /CurrentVersion\\Run \/v CLAIRE-relais .* \/d "C:\\Users\\j\\AppData\\Local\\Programs\\CLAIRE\\CLAIRE-relais\.exe" --fond/.test(l)));
  assert.ok(c.some((l) => /claire-relais\\shell\\open\\command \/ve .* --action "%1"/.test(l)));
  assert.ok(c.some((l) => /AppUserModelId\\CLAIRE\.Relais \/v DisplayName .* \/d CLAIRE/.test(l)));
  assert.ok(R.commandesRetrait().every((a) => a[0] === 'delete' && a.join(' ').includes('HKCU')));
});

function fauxSysteme(reponses) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'relais-'));
  fs.writeFileSync(path.join(dossier, 'relais.json'), JSON.stringify({ url: 'http://serveur.invalid/', poste: 'julie', jeton: JETON, profil: 'Claire' }));
  const journal = { postes: [], ps: [] };
  const s = {
    env: { USERNAME: 'test' }, dossierClaire: dossier, dossierProgramme: dossier,
    poster: async (url, corps) => { journal.postes.push({ url, corps }); return reponses.shift() || { statut: 200, json: {} }; },
    powershell: async (script, vars) => { journal.ps.push({ script, vars }); return ''; },
    reg: async () => true, lancerDetache: () => {}, obtenir: async () => ({ statut: 404, corps: Buffer.alloc(0) })
  };
  return { s, journal };
}

test('boucle : relevé avec le jeton, sans « appels » (3CX reste au .reg) ; cartes montrées en toasts', async () => {
  const carte = { type: 'message', auteur: 'Julie', titre: 'Général', texte: 'Bonjour', canal: 'general', mid: 'm1' };
  const { s, journal } = fauxSysteme([{ statut: 200, json: { pastille: 1, notifications: [carte] } }, { statut: 200, json: { pastille: 0 } }]);
  await R.boucle(s, { tours: 2, pause: 0 });
  assert.equal(journal.postes[0].url, 'http://serveur.invalid/api/relais-word/releve');
  assert.equal(journal.postes[0].corps.jeton, JETON);
  assert.equal(journal.postes[0].corps.appels, undefined);
  assert.equal(journal.ps.length, 1);
  const xmlToast = Buffer.from(journal.ps[0].vars.CLAIRE_TOASTS, 'base64').toString('utf8');
  assert.match(xmlToast, /Bonjour/);
  assert.match(journal.ps[0].script, /CreateToastNotifier\('CLAIRE\.Relais'\)/);
});

test('boucle : jeton refusé dix fois de suite → arrêt', async () => {
  const { s, journal } = fauxSysteme(Array.from({ length: 12 }, () => ({ statut: 403, json: null })));
  await R.boucle(s, { tours: 50, pause: 0 });
  assert.equal(journal.postes.length, 10);
});

test('boutons : réagir par le serveur seul ; refuser, autoriser et ouvrir passent par CLAIRE, montrée devant', async () => {
  const { s, journal } = fauxSysteme([]);
  await R.agir(s, R.lienAction('reagir', { canal: 'general', mid: 'm1', emoji: '❤️' }));
  assert.equal(journal.postes[0].url, 'http://serveur.invalid/api/relais-word/reagir');
  assert.equal(journal.postes[0].corps.emoji, '❤️');
  assert.equal(journal.ps.length, 0);
  await R.agir(s, R.lienAction('refuser', { id: 'prop_1' }));
  assert.deepEqual([journal.postes[1].corps.decision, journal.postes[1].corps.id], ['refuser-fenetre', 'prop_1'], 'un refus se confirme dans CLAIRE');
  await R.agir(s, R.lienAction('autoriser', { id: 'prop_1' }));
  assert.equal(journal.postes[2].corps.decision, 'autoriser');
  assert.equal(journal.ps.length, 2);
  assert.equal(journal.ps[1].vars.CLAIRE_URL, 'http://serveur.invalid/');
  assert.equal(await R.agir(s, 'claire-relais:inconnu'), 1);
});

test('photo de la carte : base64 brut du serveur (JPEG) écrit en fichier pour le toast ; lien vers « À traiter » accepté', async () => {
  const { s } = fauxSysteme([{ statut: 200, json: { notifications: [{ type: 'message', auteur: 'Julie', titre: 'Général', texte: 'x', canal: 'general', photo: '/9j/' + 'A'.repeat(200) }] } }]);
  const journal = [];
  s.powershell = async (script, vars) => { journal.push(vars); return ''; };
  await R.boucle(s, { tours: 1, pause: 0 });
  const xmlToast = Buffer.from(journal[0].CLAIRE_TOASTS, 'base64').toString('utf8');
  assert.match(xmlToast, /appLogoOverride[^>]*photos[\\/][0-9a-f]{16}\.jpg/);
  assert.equal(R.actionDuLien('claire-relais:ouvrir?canal=%40traiter').canal, '@traiter');
});

test('lancé dans une console (Windows) : relancé détaché, sans fenêtre ; une fois détaché, il tourne', async () => {
  const { s } = fauxSysteme([]);
  const lances = [];
  s.lancerDetache = (exe, args) => lances.push(args);
  s.exe = 'C:\\x\\CLAIRE-relais.exe';
  assert.equal(await R.lancerRelais(['--action', 'claire-relais:ouvrir'], Object.assign(s, { console: true })), 0);
  assert.deepEqual(lances, [['--action', 'claire-relais:ouvrir', '--detache']]);
});

test('installation : la boîte du code et les messages sont des fenêtres VISIBLES (sinon console vide sans fin) ; les toasts, sans fenêtre', async () => {
  const { s } = fauxSysteme([{ statut: 403, json: null }]);
  const appels = [];
  s.powershell = async (script, vars, o) => { appels.push({ script, o }); return /InputBox/.test(script) ? 'CLAIRE-RELAIS:' + Buffer.from(JSON.stringify({ url: 'http://serveur.invalid/', poste: 'julie', jeton: JETON })).toString('base64') : ''; };
  assert.equal(await R.installer(s), 1);   // code refusé (403) : message dit
  assert.ok(/InputBox/.test(appels[0].script) && appels[0].o && appels[0].o.fenetre === true);
  assert.ok(/MessageBox/.test(appels[1].script) && appels[1].o && appels[1].o.fenetre === true);
  const { s: s2, journal } = fauxSysteme([{ statut: 200, json: { notifications: [{ type: 'resume', titre: 'Discussions', texte: '1 message' }] } }]);
  const options = [];
  s2.powershell = async (script, vars, o) => { options.push(o); return ''; };
  await R.boucle(s2, { tours: 1, pause: 0 });
  assert.equal(options.length, 1);
  assert.ok(!(options[0] && options[0].fenetre));
  void journal;
});
