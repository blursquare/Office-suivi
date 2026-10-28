'use strict';
// Messages de CLAIRE (étude 27/10 : « passer par le système de notification CLAIRE et plus par Teams », « on en reçoit trop, parfois trop
// longues ») : court, regroupé, sans doublon ; l'aiguillage des envois Teams ; les routes ; la carte du relais.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const M = require('../src/messagesClaire');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

function repoMemoire(prefs) {
  const memoire = new Map();
  return { lireJsonBrut: (c, d) => (memoire.has(c) ? JSON.parse(memoire.get(c)) : d), ecrireJsonBrut: (c, v) => memoire.set(c, JSON.stringify(v)), lirePreferences: () => prefs || {} };
}

test('version courte : première phrase, 160 caractères au plus, sans balises ; sorte d’après les mots', () => {
  const long = 'Rappel : la date butoir du prêt du dossier VTE - X tombe dans 7 jours. Pensez à relancer la banque et le client, puis à vérifier les garanties.';
  assert.equal(M.versionCourte(long).court, 'Rappel : la date butoir du prêt du dossier VTE - X tombe dans 7 jours.');
  assert.ok(M.versionCourte('<b>Pièce</b> trouvée' + ' mot'.repeat(80)).court.length <= 160);
  assert.equal(M.versionCourte('<p>Bonjour</p>').court, 'Bonjour');
  assert.equal(M.sorteDuTexte('Nouvelle pièce trouvée : titre de propriété'), 'pieces');
  assert.equal(M.sorteDuTexte('Julie vous a cité dans le canal'), 'mention');
  assert.equal(M.sorteDuTexte('Le rendez-vous de signature a été déplacé'), 'agenda');
  assert.equal(M.sorteDuTexte('Bonjour'), 'autre');
});

test('jamais deux fois, et regroupé : une sorte encore non lue reçoit le suivant au lieu d’un nouveau message', () => {
  const t0 = Date.UTC(2026, 9, 27, 9);
  let r = M.deposerDansBoite([], { texte: 'Pièce trouvée : titre de propriété.', dossierId: 'd1' }, t0);
  assert.equal(r.effet, 'nouveau');
  let liste = r.liste;
  r = M.deposerDansBoite(liste, { texte: 'Pièce trouvée : titre de propriété.' }, t0 + 1000);
  assert.equal(r.effet, 'doublon', 'même texte dans les 12 h');
  r = M.deposerDansBoite(liste, { texte: 'Nouvelle pièce trouvée : état daté.', dossierId: 'd2' }, t0 + 60000);
  assert.equal(r.effet, 'groupe');
  liste = r.liste;
  assert.equal(liste.length, 1, 'un seul message pour le groupe');
  assert.equal(liste[0].court, 'Pièces trouvées (2)');
  assert.equal(liste[0].elements.length, 2);
  r = M.deposerDansBoite(liste, { texte: 'Pièce trouvée : état daté.' }, t0 + 120000);
  r = M.deposerDansBoite(r.liste, { texte: 'Nouvelle pièce trouvée : état daté.' }, t0 + 120000);
  assert.equal(r.effet, 'doublon', 'un élément déjà dans le groupe');
  // Lu : le suivant fait un nouveau message.
  const lus = liste.map((x) => Object.assign({}, x, { lu: true }));
  assert.equal(M.deposerDansBoite(lus, { texte: 'Pièce trouvée : diagnostic.' }, t0 + 180000).effet, 'nouveau');
  // Même clé : doublon même si le texte change.
  const k = M.deposerDansBoite([], { texte: 'A.', cle: 'authentic:d1:2026-10-27' }, t0);
  assert.equal(M.deposerDansBoite(k.liste, { texte: 'B différent.', cle: 'authentic:d1:2026-10-27' }, t0 + 5000).effet, 'doublon');
  assert.equal(M.deposerDansBoite([], { texte: '   ' }, t0).effet, 'vide');
});

test('boîtes : 30 jours, 200 au plus par personne', () => {
  const t = Date.UTC(2026, 9, 27);
  const vieux = { id: 'a', quand: t - 31 * 86400000, court: 'x' };
  const recent = { id: 'b', quand: t - 86400000, court: 'y' };
  assert.deepEqual(M.assainirBoites({ Julie: [vieux, recent] }, t).Julie.map((m) => m.id), ['b']);
  const beaucoup = Array.from({ length: 250 }, (_, i) => ({ id: 'm' + i, quand: t - i, court: 'z' }));
  assert.equal(M.assainirBoites({ Julie: beaucoup }, t).Julie.length, 200);
});

test('aiguillage : l’envoi « Teams » d’un collaborateur devient un message de CLAIRE, sauf s’il a demandé Teams en plus ; adresse inconnue = Teams', () => {
  const repo = repoMemoire({ 'Jérémy SAUJOT': { notifications: { teams: true } } });
  const aiguiller = M.creerAiguillageNotifications(repo, ['Bastien ANGLUMENT']);
  const reglages = { emailsResponsables: { 'Julie VASSELIN': 'julie@exemple.fr', 'Jérémy SAUJOT': 'jeremy@exemple.fr' }, copieEmail: 'etude@exemple.fr' };
  const r = aiguiller(reglages, 'Julie <julie@exemple.fr>', { texte: 'Rappel : échéance du prêt dans 7 jours.' });
  assert.equal(r.ok, true); assert.equal(r.claire, true);
  assert.equal(M.messagesDe(repo, 'Julie VASSELIN').length, 1);
  assert.equal(aiguiller(reglages, 'jeremy@exemple.fr', 'Pièce trouvée.'), null, 'Teams demandé en plus : part aussi sur Teams');
  assert.equal(M.messagesDe(repo, 'Jérémy SAUJOT').length, 1, '… et le message de CLAIRE est là quand même');
  assert.equal(aiguiller(reglages, 'inconnu@exemple.fr', 'x'), null);
  aiguiller(reglages, 'etude@exemple.fr', 'Signalement reçu.');
  assert.equal(M.messagesDe(repo, 'Bastien ANGLUMENT').length, 1, 'la copie à l’étude va à l’administrateur');
  assert.equal(M.marquerLus(repo, 'Julie VASSELIN'), 1);
  assert.equal(M.messagesDe(repo, 'Julie VASSELIN')[0].lu, true);
});

test('envoiEmail : l’aiguillage passe avant le SMTP et suffit à « envoi configuré »', async () => {
  const E = require('../src/envoiEmail');
  assert.equal(E.envoiConfigure({ emailActif: true }), false);
  E.definirAiguillageNotifications(() => ({ ok: true, claire: true }));
  try {
    assert.equal(E.envoiConfigure({ emailActif: true }), true);
    assert.equal(E.envoiConfigure({ emailActif: false }), false, 'rappels éteints : toujours rien');
    assert.equal((await E.envoyerEmail({}, 'a@b.fr', 'x')).claire, true);
  } finally { E.definirAiguillageNotifications(null); }
});

test('carte du relais pour un message de CLAIRE : le sien seulement, non lu, version courte', () => {
  const N = require('../src/notificationsPoste');
  const repo = repoMemoire();
  const r = M.deposerMessageClaire(repo, 'Julie VASSELIN', { texte: 'Pièce trouvée : titre de propriété.' });
  const id = r.message.id;
  const cartes = (collab) => N.notificationsRiches({ repo, collab, claire: [id] });
  assert.equal(cartes('Julie VASSELIN').length, 1);
  assert.equal(cartes('Julie VASSELIN')[0].type, 'claire');
  assert.equal(cartes('Julie VASSELIN')[0].texte, 'Pièce trouvée : titre de propriété.');
  assert.equal(cartes('Jérémy SAUJOT').length, 0, 'jamais le message d’un autre');
  M.marquerLus(repo, 'Julie VASSELIN');
  assert.equal(cartes('Julie VASSELIN').length, 0, 'déjà lu : pas de carte');
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

test('routes : déposer pour soi, lire, marquer lus ; collaborateur inconnu refusé', async () => {
  const h = { authorization: `Bearer ${session}`, 'Content-Type': 'application/json' };
  let r = await fetch(`${baseUrl}/api/claire-messages`, { method: 'POST', headers: h, body: JSON.stringify({ utilisateur: 'Julie VASSELIN', texte: 'Vous ouvrez VTE - TEST dans Authentic : 2 pièces attendues.', cle: 'authentic:d1:2026-10-27', dossierId: 'd1' }) });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).effet, 'nouveau');
  r = await fetch(`${baseUrl}/api/claire-messages`, { method: 'POST', headers: h, body: JSON.stringify({ utilisateur: 'Julie VASSELIN', texte: 'Encore.', cle: 'authentic:d1:2026-10-27' }) });
  assert.equal((await r.json()).effet, 'doublon');
  r = await fetch(`${baseUrl}/api/claire-messages?utilisateur=${encodeURIComponent('Julie VASSELIN')}`, { headers: h });
  const j = await r.json();
  assert.equal(j.messages.length, 1); assert.equal(j.nonLus, 1); assert.equal(j.messages[0].dossierId, 'd1');
  r = await fetch(`${baseUrl}/api/claire-messages/lus`, { method: 'POST', headers: h, body: JSON.stringify({ utilisateur: 'Julie VASSELIN' }) });
  assert.equal((await r.json()).lus, 1);
  r = await fetch(`${baseUrl}/api/claire-messages?utilisateur=${encodeURIComponent('Jérémy SAUJOT')}`, { headers: h });
  assert.equal((await r.json()).messages.length, 0);
  r = await fetch(`${baseUrl}/api/claire-messages?utilisateur=Inconnu`, { headers: h });
  assert.equal(r.status, 400);
  r = await fetch(`${baseUrl}/api/claire-messages`, { method: 'POST', headers: h, body: JSON.stringify({ utilisateur: 'Julie VASSELIN', texte: '  ' }) });
  assert.equal(r.status, 400);
});

test('relecture 27/10 : avec une clé, seule la clé fait le doublon ; une mention déjà dans son canal ne fait pas de second message', () => {
  const t0 = Date.UTC(2026, 9, 27, 9);
  const a = M.deposerDansBoite([], { texte: 'Travail terminé : vérifie les pièces.', cle: 'poste-claire-fini:1', sorte: 'travail' }, t0);
  const b = M.deposerDansBoite(a.liste, { texte: 'Travail terminé : vérifie les pièces.', cle: 'poste-claire-fini:2', sorte: 'travail' }, t0 + 60000);
  assert.equal(b.effet, 'nouveau', 'deux comptes rendus de la même consigne');
  assert.equal(b.liste.length, 2, 'les travaux ne sont jamais regroupés');
  const repo = repoMemoire({});
  const aiguiller = M.creerAiguillageNotifications(repo, ['Bastien ANGLUMENT']);
  const r = aiguiller({ emailsResponsables: { 'Julie VASSELIN': 'julie@exemple.fr' } }, 'julie@exemple.fr', 'Bastien vous a mentionné dans # général.', { dejaDansCanal: true });
  assert.equal(r.claire, true);
  assert.equal(M.messagesDe(repo, 'Julie VASSELIN').length, 0);
});

test('comme une collègue : chaque notification redite en une phrase courte (étude 27/10)', () => {
  const M = require('../src/messagesClaire');
  const R = require('../src/routes/notifications');
  const court = (t) => M.versionCourte(M.phraseCollegue(t)).court;
  assert.equal(court('📌 CLAIRE — Rappel : « Obtention du prêt » du dossier VTE - ESSAI arrive à échéance dans 7 jours (le 2026-11-03).\n\nPièces reçues (1) : a'), '« Obtention du prêt » pour VTE - ESSAI dans 7 jours, le 3/11.');
  assert.equal(court(R.texteDossierComplet('VTE - ESSAI')), 'VTE - ESSAI est complet : vous pouvez lancer la rédaction.');
  assert.equal(court(R.texteNotificationPieces('VTE - ESSAI', ['État daté'], [])), 'Reçu pour VTE - ESSAI : État daté.');
  assert.equal(court(R.texteRendezVousAgenda({ dossierNom: 'VTE - ESSAI', action: 'place', date: '2026-11-10', heure: '10:30' })), 'Signature de VTE - ESSAI placée le 10 novembre 2026 à 10 h 30.');
  assert.equal(court(R.texteDemandeCollaborateur('Bastien', 'rappeler la banque', 'VTE - ESSAI', '')), 'Bastien vous demande : rappeler la banque (VTE - ESSAI).');
  assert.equal(court('✨ CLAIRE — Une forme inconnue.'), 'Une forme inconnue.', 'texte inconnu : seulement l’en-tête « CLAIRE — » retiré');
  // La sorte se lit toujours sur le texte d'origine : les rappels se regroupent encore.
  const r = M.deposerDansBoite([], { texte: '📌 CLAIRE — Rappel : « Prêt » du dossier VTE - ESSAI arrive à échéance dans 7 jours (le 2026-11-03).' }, Date.now());
  assert.equal(r.message.sorte, 'rappels');
  assert.ok(/\n|Pièces/.test(M.phraseCollegue('📌 CLAIRE — Rappel : « Prêt » du dossier X arrive à échéance dans 7 jours (le 2026-11-03).\n\nPièces reçues (1) : a')), 'le détail reste dessous');
});

test('aiguillage (28/10) : une notification de dossier va dans la conversation du dossier, une seule fois ; les pièces trouvées n’ont aucun message de CLAIRE', () => {
  const C = require('../src/canaux/canaux');
  const repo = repoMemoire();
  const aiguiller = M.creerAiguillageNotifications(repo, ['Bastien ANGLUMENT']);
  const reglages = { emailsResponsables: { 'Julie VASSELIN': 'julie@exemple.fr' }, copieEmail: 'etude@exemple.fr' };
  const texte = 'Rappel : « Prêt » du dossier VTE - X arrive à échéance dans 7 jours (le 2026-11-03).';
  assert.equal(aiguiller(reglages, 'julie@exemple.fr', texte, { dossierId: 'dos1' }).claire, true);
  aiguiller(reglages, 'etude@exemple.fr', texte, { dossierId: 'dos1' });
  const messages = C.lireMessages(repo, C.canalDuDossier('dos1'));
  assert.equal(messages.length, 1, 'la copie à l’étude ne double pas le message du dossier');
  assert.equal(messages[0].claire, true); assert.equal(messages[0].pour, 'Julie VASSELIN');
  assert.equal(M.messagesDe(repo, 'Julie VASSELIN').length, 0, 'rien dans la conversation personnelle');
  const r = aiguiller(reglages, 'julie@exemple.fr', 'Nouvelle pièce trouvée sur le dossier VTE - X : titre.', { sansConversationClaire: true });
  assert.equal(r.claire, true);
  assert.equal(M.messagesDe(repo, 'Julie VASSELIN').length, 0);
  assert.equal(C.lireMessages(repo, C.canalDuDossier('dos1')).length, 1, 'les pièces ne sont pas annoncées dans le dossier non plus');
});
