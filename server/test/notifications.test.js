'use strict';

// Route /api/notifications/pieces-recues (voir src/routes/notifications.js) : appelée par
// script.js (verifierDossierLocal/notifierNouvellesPiecesTrouvees) une fois par dossier à chaque
// parcours qui trouve de nouvelles pièces — jamais une fois par pièce (voir le commentaire dans
// la route sur le groupage). Réutilise exactement l'infrastructure des rappels d'échéance
// (envoiEmail, parametresRepo, copieEmail).
//
// La couche d'envoi est INJECTÉE dans creerApp (`envoyerEmailFn`) : aucun serveur SMTP ni HTTP
// n'est démarré ici. Un faux serveur laissé ouvert par un test qui échoue fait pendre toute la
// suite — déjà rencontré sur la version précédente de ce fichier.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { texteNotificationPieces, dedoublonnerPieces } = require('../src/routes/notifications');

function config() {
  return { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' };
}

// Capture ce que la route demande d'envoyer, sans ouvrir la moindre connexion.
const envois = [];
// Un message peut être une chaîne ou {texte, html} (voir envoiEmail.js) : on garde les deux.
const envoyerEmailFn = async (reglages, destinataire, message) => {
  const texte = typeof message === 'string' ? message : message.texte;
  const html = typeof message === 'string' ? null : message.html;
  envois.push({ destinataire, texte, html });
  return { ok: true, erreur: null };
};

test('texteNotificationPieces : singulier/pluriel et liste des pièces', () => {
  assert.match(texteNotificationPieces('DUPONT / MARTIN', ['Titre de propriété']), /Nouvelle pièce trouvée/);
  assert.match(texteNotificationPieces('DUPONT / MARTIN', ['Titre de propriété']), /DUPONT \/ MARTIN/);
  const texte = texteNotificationPieces('DUPONT / MARTIN', ['Titre de propriété', 'ERP']);
  assert.match(texte, /Nouvelles pièces trouvées/);
  assert.match(texte, /Titre de propriété, ERP/);
});

let db, serveurApp, baseUrl, jeton;

before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: config(), envoyerEmailFn });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  serveurApp.close();
  db.close();
});

// Chaque test part d'un registre des pièces notifiées vide : plusieurs tests envoient la même pièce
// sur le même dossier, que le dédoublonnage (testé plus bas) écarterait sinon.
beforeEach(() => {
  if (db) db.prepare("DELETE FROM parametres WHERE cle = 'pieces-notifiees'").run();
});

function appeler(chemin, options) {
  return fetch(`${baseUrl}${chemin}`, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(options && options.headers) }
  });
}

test('POST /api/notifications/pieces-recues sans authentification : 401', async () => {
  const reponse = await fetch(`${baseUrl}/api/notifications/pieces-recues`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
  });
  assert.equal(reponse.status, 401);
});

test('dossierNom manquant : 400', async () => {
  const reponse = await appeler('/api/notifications/pieces-recues', { method: 'POST', body: JSON.stringify({ pieces: ['ERP'] }) });
  assert.equal(reponse.status, 400);
});

test('pieces manquantes ou vides : 400', async () => {
  const reponse = await appeler('/api/notifications/pieces-recues', { method: 'POST', body: JSON.stringify({ dossierNom: 'DUPONT / MARTIN', pieces: [] }) });
  assert.equal(reponse.status, 400);
});

test('Envoi par email désactivé : ok mais rien n\'est envoyé (ignore: true)', async () => {
  await appeler('/api/reglages', { method: 'PUT', body: JSON.stringify({ emailActif: false, smtpHote: '', emailsResponsables: {} }) });
  const reponse = await appeler('/api/notifications/pieces-recues', { method: 'POST', body: JSON.stringify({ dossierNom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pieces: ['ERP'] }) });
  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), { ok: true, ignore: true });
});

test('Envoi actif, responsable sans adresse configurée : ok mais erreur listée, aucun envoi', async () => {
  envois.length = 0;
  await appeler('/api/reglages', { method: 'PUT', body: JSON.stringify({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: {} }) });
  const reponse = await appeler('/api/notifications/pieces-recues', { method: 'POST', body: JSON.stringify({ dossierNom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', pieces: ['ERP'] }) });
  const corps = await reponse.json();
  assert.equal(corps.envoyeResponsable, false);
  assert.match(corps.erreurs[0], /Julie VASSELIN/);
  assert.equal(envois.length, 0);
});

test('Envoi actif, responsable connu : un seul message envoyé, groupant toutes les pièces', async () => {
  envois.length = 0;
  await appeler('/api/reglages', { method: 'PUT', body: JSON.stringify({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' } }) });
  const reponse = await appeler('/api/notifications/pieces-recues', { method: 'POST', body: JSON.stringify({ dossierNom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pieces: ['ERP', 'Titre de propriété'] }) });
  const corps = await reponse.json();
  assert.equal(corps.envoyeResponsable, true);
  assert.equal(envois.length, 1);
  assert.equal(envois[0].destinataire, 'bastien@etude.fr');
  assert.match(envois[0].texte, /ERP, Titre de propriété/);
});

test('copieEmail : reçoit un double, jamais si elle coïncide avec le destinataire principal', async () => {
  envois.length = 0;
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', copieEmail: 'gossart@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' } })
  });
  await appeler('/api/notifications/pieces-recues', { method: 'POST', body: JSON.stringify({ dossierNom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pieces: ['ERP'] }) });
  assert.equal(envois.length, 2);
  assert.deepEqual(envois.map((e) => e.destinataire).sort(), ['bastien@etude.fr', 'gossart@etude.fr']);

  // Copie == responsable lui-même (ex. l'étude est elle-même la responsable du dossier) : un seul envoi.
  envois.length = 0;
  db.prepare("DELETE FROM parametres WHERE cle = 'pieces-notifiees'").run();
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', copieEmail: 'bastien@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' } })
  });
  await appeler('/api/notifications/pieces-recues', { method: 'POST', body: JSON.stringify({ dossierNom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pieces: ['ERP'] }) });
  assert.equal(envois.length, 1);

  // Même boîte écrite avec une autre casse : toujours un seul envoi (doublon signalé par l'étude).
  envois.length = 0;
  db.prepare("DELETE FROM parametres WHERE cle = 'pieces-notifiees'").run();
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', copieEmail: 'bastien.anglument@gossart.notaires.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'Bastien.ANGLUMENT@gossart.notaires.fr' } })
  });
  await appeler('/api/notifications/pieces-recues', { method: 'POST', body: JSON.stringify({ dossierNom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pieces: ['ERP'] }) });
  assert.equal(envois.length, 1);
});

test('texteDateAjoutee : ajout et modification, date en toutes lettres', () => {
  const { texteDateAjoutee } = require('../src/routes/notifications');
  assert.equal(texteDateAjoutee('DUPONT / MARTIN', 'Julie VASSELIN', 'Rendez-vous de signature', '2026-10-14', ''),
    '📅 CLAIRE — Julie VASSELIN a ajouté une date au dossier DUPONT / MARTIN : Rendez-vous de signature le 14 octobre 2026.');
  assert.match(texteDateAjoutee('DUPONT / MARTIN', 'Julie VASSELIN', 'Obtention du prêt', '2026-11-02', '2026-10-01'),
    /a modifié une date du dossier DUPONT \/ MARTIN : Obtention du prêt passe du 1 octobre 2026 au 2 novembre 2026\./);
});

test('texteDateAjoutee : une date d’envoi saisie se dit « a envoyé l’appel de fonds / le projet »', () => {
  const { texteDateAjoutee } = require('../src/routes/notifications');
  assert.match(texteDateAjoutee('VTE - DUPONT / MARTIN', 'Jérémy SAUJOT', 'Envoi appel de fonds', '2026-10-05', ''),
    /Jérémy SAUJOT a envoyé l’appel de fonds du dossier VTE - DUPONT \/ MARTIN \(le 5 octobre 2026\)\. La tâche est faite\./);
  assert.match(texteDateAjoutee('VTE - X', 'Julie VASSELIN', 'Envoi projet', '2026-10-06', ''), /a envoyé le projet d’acte/);
  // Une correction de date reste dite comme telle.
  assert.match(texteDateAjoutee('VTE - X', 'Julie VASSELIN', 'Envoi projet', '2026-10-06', '2026-10-05'), /a modifié une date/);
});

test('POST /api/notifications/tache-faite : prévient le responsable d’une tâche faite par un collègue', async () => {
  envois.length = 0;
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', copieEmail: '', emailsResponsables: { 'Julie VASSELIN': 'julie@etude.fr', 'Jérémy SAUJOT': 'jeremy@etude.fr' } })
  });
  let reponse = await appeler('/api/notifications/tache-faite', { method: 'POST', body: JSON.stringify({ dossierNom: 'VTE - DUPONT / MARTIN', responsable: 'Julie VASSELIN', auteur: 'Jérémy SAUJOT', tache: 'Envoyer l’appel de fonds', detail: 'notée faite à la main' }) });
  assert.equal((await reponse.json()).envoyeResponsable, true);
  assert.deepEqual(envois.map((e) => e.destinataire), ['julie@etude.fr']);
  assert.equal(envois[0].texte, '✅ CLAIRE — Jérémy SAUJOT a fait une tâche de votre dossier VTE - DUPONT / MARTIN : Envoyer l’appel de fonds (notée faite à la main).');
  envois.length = 0;
  reponse = await appeler('/api/notifications/tache-faite', { method: 'POST', body: JSON.stringify({ dossierNom: 'VTE - X', responsable: 'Julie VASSELIN', auteur: 'Julie VASSELIN', tache: 'Envoyer le projet d’acte' }) });
  assert.deepEqual(await reponse.json(), { ok: true, ignore: true });
  assert.equal(envois.length, 0);
  reponse = await appeler('/api/notifications/tache-faite', { method: 'POST', body: JSON.stringify({ dossierNom: 'VTE - X', responsable: 'Julie VASSELIN', auteur: 'Jérémy SAUJOT' }) });
  assert.equal(reponse.status, 400);
});

test('POST /api/notifications/date-ajoutee : prévient le responsable, sans copie à l\'auteur', async () => {
  envois.length = 0;
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', copieEmail: 'bastien@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr', 'Julie VASSELIN': 'julie@etude.fr' } })
  });
  // Bastien (qui reçoit aussi la copie) ajoute une date sur un dossier de Julie : Julie seule.
  let reponse = await appeler('/api/notifications/date-ajoutee', { method: 'POST', body: JSON.stringify({ dossierNom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', auteur: 'Bastien ANGLUMENT', libelle: 'Rendez-vous de signature', date: '2026-10-14' }) });
  assert.equal((await reponse.json()).envoyeResponsable, true);
  assert.deepEqual(envois.map((e) => e.destinataire), ['julie@etude.fr']);
  assert.match(envois[0].texte, /Bastien ANGLUMENT a ajouté une date/);

  // Jérémy ajoute une date sur un dossier de Julie : Julie, et la copie à l'étude.
  envois.length = 0;
  await appeler('/api/notifications/date-ajoutee', { method: 'POST', body: JSON.stringify({ dossierNom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', auteur: 'Jérémy SAUJOT', libelle: 'Appel de fonds', date: '2026-10-01' }) });
  assert.deepEqual(envois.map((e) => e.destinataire).sort(), ['bastien@etude.fr', 'julie@etude.fr']);

  // Le responsable lui-même : rien.
  envois.length = 0;
  reponse = await appeler('/api/notifications/date-ajoutee', { method: 'POST', body: JSON.stringify({ dossierNom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', auteur: 'Julie VASSELIN', libelle: 'Appel de fonds', date: '2026-10-01' }) });
  assert.deepEqual(await reponse.json(), { ok: true, ignore: true });
  assert.equal(envois.length, 0);

  // Date invalide : 400.
  reponse = await appeler('/api/notifications/date-ajoutee', { method: 'POST', body: JSON.stringify({ dossierNom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', date: '14/10/2026' }) });
  assert.equal(reponse.status, 400);
});

test('dédoublonnage (pur) : même dossier, même pièce, même fichier → une seule fois ; autre fichier → renvoyée', () => {
  const t0 = Date.parse('2026-09-30T13:19:00Z');
  const alignement = { label: "Certificat d'alignement", chemin: 'GALLET BORDIN/AAE/Alignement.pdf' };
  const r1 = dedoublonnerPieces({}, 'd1', [alignement], t0);
  assert.equal(r1.aEnvoyer.length, 1);
  // 11 minutes plus tard, relue par une autre fenêtre : rien ne repart.
  const r2 = dedoublonnerPieces(r1.registre, 'd1', [alignement], t0 + 11 * 60000);
  assert.equal(r2.aEnvoyer.length, 0);
  // Même pièce, autre fichier (pièce renouvelée) : renvoyée.
  const r3 = dedoublonnerPieces(r2.registre, 'd1', [{ label: "Certificat d'alignement", chemin: 'GALLET BORDIN/AAE/Alignement 2027.pdf' }], t0 + 60000);
  assert.equal(r3.aEnvoyer.length, 1);
  // Autre dossier : renvoyée.
  assert.equal(dedoublonnerPieces(r3.registre, 'd2', [alignement], t0).aEnvoyer.length, 1);
  // Après 30 jours, l'entrée est purgée.
  const r4 = dedoublonnerPieces(r1.registre, 'd1', [alignement], t0 + 31 * 86400000);
  assert.equal(r4.aEnvoyer.length, 1);
  // Doublon dans un même appel : une seule fois.
  assert.equal(dedoublonnerPieces({}, 'd1', [alignement, alignement], t0).aEnvoyer.length, 1);
});

test('POST pieces-recues deux fois pour la même pièce (deux fenêtres) : un seul message', async () => {
  await appeler('/api/reglages', { method: 'PUT', body: JSON.stringify({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' } }) });
  envois.length = 0;
  const corps = JSON.stringify({ dossierId: 'dos-1', dossierNom: 'VTE - DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pieces: [{ label: "Certificat d'alignement", chemin: 'DUPONT/AAE/Alignement.pdf' }] });
  const r1 = await (await appeler('/api/notifications/pieces-recues', { method: 'POST', body: corps })).json();
  const nbApresPremier = envois.length;
  const r2 = await (await appeler('/api/notifications/pieces-recues', { method: 'POST', body: corps })).json();
  assert.ok(nbApresPremier >= 1, JSON.stringify(r1));
  assert.equal(envois.length, nbApresPremier);
  assert.equal(r2.dejaNotifiees, true);
});

test('« Demander à CLAIRE » (13/10) : demande à un collaborateur sur Teams, puis « c’est fait » à celui qui l’a demandée', async () => {
  envois.length = 0;
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', copieEmail: '', emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr', 'Julie VASSELIN': 'julie@etude.fr' } })
  });
  let reponse = await appeler('/api/notifications/demande-collaborateur', { method: 'POST', body: JSON.stringify({ collaborateur: 'Julie VASSELIN', auteur: 'Bastien ANGLUMENT', texte: 'Appeler la banque pour l’offre', dossierNom: 'VTE - DUPONT / MARTIN', date: '2026-10-15' }) });
  assert.equal((await reponse.json()).envoyeResponsable, true);
  assert.deepEqual(envois.map((e) => e.destinataire), ['julie@etude.fr']);
  assert.equal(envois[0].texte, '📌 CLAIRE — Bastien ANGLUMENT vous demande : Appeler la banque pour l’offre (dossier VTE - DUPONT / MARTIN), pour le 15 octobre 2026. La tâche est dans votre liste « Aujourd’hui » de CLAIRE.');
  envois.length = 0;
  reponse = await appeler('/api/notifications/demande-faite', { method: 'POST', body: JSON.stringify({ demandeur: 'Bastien ANGLUMENT', auteur: 'Julie VASSELIN', texte: 'Appeler la banque pour l’offre', dossierNom: 'VTE - DUPONT / MARTIN' }) });
  assert.equal((await reponse.json()).envoyeResponsable, true);
  assert.deepEqual(envois.map((e) => e.destinataire), ['bastien@etude.fr']);
  assert.match(envois[0].texte, /Julie VASSELIN a fait ce que vous lui aviez demandé : Appeler la banque/);
  assert.equal((await appeler('/api/notifications/demande-collaborateur', { method: 'POST', body: JSON.stringify({ collaborateur: 'Julie VASSELIN' }) })).status, 400);
});

test('dossier complet : une succession n’a pas d’offre de prêt (étude 16/10)', () => {
  const { texteDossierComplet } = require('../src/routes/notifications');
  assert.match(texteDossierComplet('SUCC - PRADEL', true), /Succession SUCC - PRADEL : toutes les pièces sont reçues/);
  assert.doesNotMatch(texteDossierComplet('SUCC - PRADEL', true), /prêt/);
  assert.match(texteDossierComplet('VTE - MOREAU'), /offre de prêt et pièces reçues/);
});
