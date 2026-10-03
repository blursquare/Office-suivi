'use strict';
// Fenêtre d'email de CLAIRE (étude, 03/10 : répondre depuis CLAIRE, rappels envoyés sans téléchargement).
// Fonctions pures seulement ; noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('initiales, objet de réponse, formule d’usage', () => {
  assert.equal(app.initialesPersonne('Camille FOURNIER'), 'CF');
  assert.equal(app.initialesPersonne('Maître Paul DUPUIS'), 'MD');
  assert.equal(app.initialesPersonne('alex.martel@exemple.fr'), 'AF');
  assert.equal(app.initialesPersonne(''), '?');
  assert.equal(app.sujetReponse('Mon RIB'), 'RE: Mon RIB');
  assert.equal(app.sujetReponse('RE: Mon RIB'), 'RE: Mon RIB');
  assert.match(app.formuleReponseVide(true), /^Mon Cher Maître,[\s\S]*Votre bien dévoué\.$/);
  assert.match(app.formuleReponseVide(false), /^Madame, Monsieur,[\s\S]*Bien cordialement,$/);
});

test('texte modifiable : marques retirées, boutons nommés puis remis à l’envoi', () => {
  const corps = 'Bonjour,\n\nLe rendez-vous du lundi 5 octobre.\n\n{{BOUTONS}}\n\nBien cordialement,';
  const t = app.texteEditableEmail(corps);
  assert.match(t, /du lundi 5 octobre\./);
  assert.match(t, /\[Boutons de réponse\]/);
  assert.match(app.corpsDepuisTexteEditable(t, [{ libelle: 'Oui', href: 'mailto:x@y.fr' }]), /\{\{BOUTONS\}\}/);
  assert.doesNotMatch(app.corpsDepuisTexteEditable(t, null), /\{\{BOUTONS\}\}/);
});

test('poids des pièces jointes (base64 → octets) et libellé de l’historique', () => {
  assert.equal(app.poidsPiecesEmail([{ contenuBase64: 'QUJD' }, { contenuBase64: 'QUJDRA==' }]), 3 + 6);
  assert.equal(app.libelleEmailFait({ mode: 'envoye' }), 'Email envoyé');
  assert.equal(app.libelleEmailFait({ mode: 'eml' }), 'Email préparé');
});

test('« À répondre » : dernier email reçu de l’expéditeur, sans réponse depuis, 14 jours', () => {
  const n = '2026-10-03T12:00:00Z';
  const recu = { id: 'e1', sens: 'recu', date: '2026-10-02T09:00:00Z', de: { adresse: 'camille@exemple.fr' }, a: [] };
  assert.equal(app.emailARepondre(recu, [recu], [], n), true);
  const envoye = { id: 'e2', sens: 'envoye', date: '2026-10-02T10:00:00Z', de: { adresse: 'office@x.fr' }, a: ['camille@exemple.fr'] };
  assert.equal(app.emailARepondre(recu, [recu, envoye], [], n), false);
  const suivant = { id: 'e3', sens: 'recu', date: '2026-10-02T11:00:00Z', de: { adresse: 'CAMILLE@exemple.fr' }, a: [] };
  assert.equal(app.emailARepondre(recu, [recu, suivant], [], n), false);
  assert.equal(app.emailARepondre(recu, [recu], [{ geste: 'reponse:e1', prepareLe: '2026-10-02T09:30:00Z', destinataires: [] }], n), false);
  assert.equal(app.emailARepondre(recu, [recu], [{ geste: 'relance', envoyeLe: '2026-10-02T09:30:00Z', destinataires: ['camille@exemple.fr'] }], n), false);
  assert.equal(app.emailARepondre({ ...recu, date: '2026-09-10T09:00:00Z' }, [], [], n), false);
  assert.equal(app.emailARepondre(envoye, [envoye], [], n), false);
});
