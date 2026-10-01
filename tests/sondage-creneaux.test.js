'use strict';
// Sondage de créneaux de signature (« comme un Doodle », étude 30/09) et email du vendeur. Noms,
// adresses et offices inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const DOSSIER = {
  id: 'd1', nom: 'DURAND / MARTIN',
  parties: [{ role: 'VENDEUR', nom: 'Paul DURAND' }, { role: 'ACQUEREUR', nom: 'Léa MARTIN' }],
  emailVendeur: 'paul.durand@exemple.fr', emailAcquereur: 'lea.martin@exemple.fr'
};

const SONDAGE = {
  id: 's1', code: 'ABC234', adresseReponse: 'office@exemple.fr', expireLe: '2026-10-08',
  creneaux: [{ n: 1, date: '2026-10-20', heure: '10:00' }, { n: 2, date: '2026-10-21', heure: '15:30' }],
  participants: [
    { role: 'vendeur', nom: 'Paul DURAND', email: 'paul.durand@exemple.fr', confrere: false },
    { role: 'acquereur', nom: 'Léa MARTIN', email: 'lea.martin@exemple.fr', confrere: false },
    { role: 'confrere-acquereur', nom: 'Maître Anne LEBRUN', email: 'office.lebrun@notaires.fr', confrere: true }
  ],
  reponses: [{ email: 'paul.durand@exemple.fr', choix: [2], aucun: false }]
};

test('detecterEmailVendeur : l’email au voisinage du vendeur, jamais celui de l’acquéreur', () => {
  const texte = 'LE VENDEUR : Monsieur Paul DURAND, demeurant à Blois, joignable à paul.durand@exemple.fr. '
    + 'L’ACQUEREUR : Madame Léa MARTIN, joignable à lea.martin@exemple.fr.';
  assert.equal(app.detecterEmailVendeur(texte), 'paul.durand@exemple.fr');
  assert.equal(app.detecterEmailAcquereur(texte), 'lea.martin@exemple.fr');
  // Vendeur sans email : la fenêtre qui déborde sur l'acquéreur ne reprend pas son adresse.
  const sansVendeur = 'LE VENDEUR : Monsieur Paul DURAND. L’ACQUEREUR : Madame Léa MARTIN, lea.martin@exemple.fr.';
  assert.equal(app.detecterEmailVendeur(sansVendeur), null);
});

test('participantsSondage : vendeur et acquéreur du dossier, avec leurs emails', () => {
  const p = app.participantsSondage(DOSSIER, []);
  assert.equal(p.map(x => `${x.role}:${x.nom}:${x.email}`).join('|'),
    'vendeur:Paul DURAND:paul.durand@exemple.fr|acquereur:Léa MARTIN:lea.martin@exemple.fr');
});

test('participantsSondage : un acquéreur représenté par un confrère est remplacé par ce confrère', () => {
  const d = Object.assign({}, DOSSIER, { notaireAcquereur: 'Maître Anne LEBRUN (Tours)', emailNotaireParticipant: 'office.lebrun@notaires.fr' });
  const p = app.participantsSondage(d, []);
  assert.equal(p[1].role, 'confrere-acquereur');
  assert.equal(p[1].email, 'office.lebrun@notaires.fr');
  assert.equal(p[1].confrere, true);
  assert.equal(p.some(x => x.email === 'lea.martin@exemple.fr'), false);
});

test('objet de la réponse : le jeton en tête, puis le créneau en clair', () => {
  assert.equal(app.sujetReponseSondage('ABC234', SONDAGE.creneaux[1]), '[CLAIRE-ABC234-2] Créneau 2 : mercredi 21 octobre à 15 h 30');
  assert.equal(app.sujetReponseSondage('ABC234', null), '[CLAIRE-ABC234-0] Aucun créneau ne convient');
  const lien = app.lienReponseSondage('office@exemple.fr', '[CLAIRE-ABC234-2] Créneau 2');
  assert.match(lien, /^mailto:office@exemple\.fr\?subject=%5BCLAIRE-ABC234-2%5D%20Cr%C3%A9neau%202&body=/);
});

test('boutons de l’email : un par créneau, « en une seule fois », puis « aucun » en secondaire', () => {
  const b = app.boutonsSondage(SONDAGE);
  assert.equal(b.length, 4);
  assert.equal(b[0].libelle, 'Mardi 20 octobre à 10 h 00');
  assert.match(b[1].href, /CLAIRE-ABC234-2/);
  assert.equal(b[2].libelle, 'Répondre en une seule fois');
  assert.equal(b[2].secondaire, true);
  assert.match(b[2].href, /subject=%5BCLAIRE-ABC234-L%5D/);
  assert.match(decodeURIComponent(b[2].href.split('&body=')[1]), /\[ \] 1 - Mardi 20 octobre à 10 h 00\n\[ \] 2 - Mercredi 21 octobre à 15 h 30$/);
  assert.equal(b[3].libelle, 'Aucun créneau ne convient');
  assert.equal(b[3].secondaire, true);
  // Un seul créneau : pas de réponse groupée.
  assert.equal(app.boutonsSondage(Object.assign({}, SONDAGE, { creneaux: [SONDAGE.creneaux[0]] })).length, 2);
});

test('emails : les clients ensemble, chaque confrère à part ; relance aux seuls sans réponse', () => {
  const g = app.groupesEmailSondage(SONDAGE.participants);
  assert.equal(g.length, 2);
  assert.equal(g[0].participants.map(p => p.email).join(','), 'paul.durand@exemple.fr,lea.martin@exemple.fr');
  assert.equal(g[1].confrere, true);
  const sans = app.sansReponseSondage(SONDAGE).map(p => p.email);
  assert.equal(sans.join(','), 'lea.martin@exemple.fr,office.lebrun@notaires.fr');
  assert.equal(app.groupesEmailSondage(SONDAGE.participants, ['office.lebrun@notaires.fr']).length, 1);
});

test('texte de l’email : emplacement des boutons, date limite ; confrère sans « Bonjour »', () => {
  const client = app.corpsEmailSondage(DOSSIER, SONDAGE, false, false);
  assert.match(client, /^Bonjour,/);
  assert.match(client, /\{\{BOUTONS\}\}/);
  assert.match(client, /avant le jeudi 8 octobre/);
  const confrere = app.corpsEmailSondage(DOSSIER, SONDAGE, true, false);
  assert.doesNotMatch(confrere, /Bonjour/);
  assert.match(confrere, /VTE - DURAND \/ MARTIN/);
  // La formule d'usage est posée par adapterCorpsEmail.
  const final = app.adapterCorpsEmail(confrere, true);
  assert.match(final, /^Mon Cher Maître,/);
  assert.match(final, /Votre bien dévoué\.$/);
  assert.match(app.corpsEmailSondage(DOSSIER, SONDAGE, false, true), /pas encore reçu votre choix/);
});

test('HTML de l’email : les boutons remplacent {{BOUTONS}} ; le texte garde les liens', () => {
  const boutons = app.boutonsSondage(SONDAGE);
  const html = app.htmlEmail('Bonjour,\n\n{{BOUTONS}}\n\nMerci.', {}, null, boutons);
  assert.doesNotMatch(html, /\{\{BOUTONS\}\}/);
  assert.match(html, /href="mailto:office@exemple\.fr\?subject=%5BCLAIRE-ABC234-1%5D/);
  assert.match(html, />Mardi 20 octobre à 10 h 00</);
  assert.match(html, /<table cellspacing="0"/);
  const texte = app.texteAvecBoutons('A\n\n{{BOUTONS}}\n\nB', boutons);
  assert.match(texte, /Aucun créneau ne convient : mailto:/);
  // Sans boutons, un email ordinaire ne change pas.
  assert.doesNotMatch(app.htmlEmail('Bonjour,\n\nMerci.', {}, null), /<table cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8pt/);
});

test('titre d’une option dans l’agenda : le dossier et le rang du créneau', () => {
  const o = app.libelleOptionSondage('VTE - DURAND / MARTIN ? — option CLAIRE, créneau 2/4');
  assert.equal(o.titre, 'VTE - DURAND / MARTIN');
  assert.equal(o.rang, '2/4');
  assert.equal(app.libelleOptionSondage('Réunion').titre, 'Réunion');
});
