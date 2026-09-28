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

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { texteNotificationPieces } = require('../src/routes/notifications');

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
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', copieEmail: 'bastien@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' } })
  });
  await appeler('/api/notifications/pieces-recues', { method: 'POST', body: JSON.stringify({ dossierNom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pieces: ['ERP'] }) });
  assert.equal(envois.length, 1);

  // Même boîte écrite avec une autre casse : toujours un seul envoi (doublon signalé par l'étude).
  envois.length = 0;
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
