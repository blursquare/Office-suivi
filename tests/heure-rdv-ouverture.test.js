'use strict';

// Heure du rendez-vous sur la ligne « Signature » et dans l'email de réception des fonds (texte de
// l'étude du 29/09) ; ouverture automatique des téléchargements. Dossiers inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('heureEmail : forme du modèle de l’étude', () => {
  const app = chargerApplication();
  assert.equal(app.heureEmail('11:00'), '11h');
  assert.equal(app.heureEmail('09:30'), '9h30');
  assert.equal(app.heureEmail(''), '');
  assert.equal(app.heureEmail('midi'), '');
});

test('email de réception des fonds : texte de l’étude, jour, date et heure en gras souligné', () => {
  const app = chargerApplication();
  const d = { id: 'd1', nom: 'DUPONT / MARTIN', rendezVousSignature: '2026-10-05', rendezVousSignatureHeure: '11:00' };
  const corps = app.construireEmailReceptionFonds(d).corps;
  assert.equal(app.texteSansMarques(corps),
    'Bonjour,\n\nNous vous confirmons que les fonds destinés à votre acquisition ont bien été reçus en notre comptabilité.'
    + '\n\nNous vous rappelons que le rendez-vous de signature de l\'acte authentique est fixé au lundi 5 octobre 2026 à 11h, en notre office.'
    + '\n\nJe vous remercie de vous munir de vos pièces d’identité et de votre RIB pour le rendez-vous.'
    + '\n\nNous restons à votre disposition pour toute question.');
  // Email HTML : date et heure en gras souligné ; texte simple sans aucune marque.
  const html = app.htmlEmail(app.adapterCorpsEmail(corps, false), {});
  assert.match(html, /fixé au <b><u>lundi 5 octobre 2026 à 11h<\/u><\/b>, en notre office\./);
  assert.doesNotMatch(app.texteSansMarques(corps), /[\uE000\uE001]/);
  // Heure inconnue : le jour et la date seuls.
  assert.match(app.texteSansMarques(app.construireEmailReceptionFonds(Object.assign({}, d, { rendezVousSignatureHeure: '' })).corps), /fixé au lundi 5 octobre 2026, en notre office\./);
});

test('ligne « Signature » : l’heure à côté de la date', () => {
  const app = chargerApplication();
  const d = { id: 'd1', nom: 'A / B', sansPret: true, rendezVousSignature: '2026-10-05', rendezVousSignatureHeure: '11:00', autres: [], pieces: {}, historique: [] };
  assert.match(app.echeancesOrdonneesFiche(d, {}, ''), /<span class="ech-heure"> · 11 h 00<\/span>/);
});

test('ouverture automatique : seuls les emails, courriers Word et rappels d’agenda', () => {
  const app = chargerApplication();
  assert.equal(app.extensionOuvertureAuto('Appel de fonds.DOCX'), 'docx');
  assert.equal(app.extensionOuvertureAuto('Relance.eml'), 'eml');
  assert.equal(app.extensionOuvertureAuto('registre.json'), '');
  assert.equal(app.extensionOuvertureAuto('Installer.vbs'), '');
});
