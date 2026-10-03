'use strict';
// Copie de l'acte / attestation de vente aux clients, dossiers en participation (étude, 03/10). Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const DOSSIER = {
  id: 'p1', nom: 'MARTEL / FOURNIER', roleNotaire: 'participant', rendezVousSignature: '2026-09-28',
  notaireVendeur: 'Maître Sophie GOSSART (Blois)', notaireAcquereur: 'Maître Paul DUPUIS (Tours)',
  emailVendeur: 'martel@exemple.fr', emailAcquereur: 'fournier@exemple.fr',
  parties: [{ nom: 'Paul MARTEL', role: 'VENDEUR' }, { nom: 'Luc FOURNIER', role: 'ACQUEREUR' }]
};

test('notre client : le côté qu’aucun autre office ne représente', () => {
  const c = app.clientsParticipation(DOSSIER);
  assert.equal(c.map(x => `${x.role}:${x.email}`).join(), 'VENDEUR:martel@exemple.fr');
  const inverse = Object.assign({}, DOSSIER, { notaireVendeur: 'Maître Paul DUPUIS (Tours)', notaireAcquereur: 'Maître Sophie GOSSART (Blois)' });
  assert.equal(app.clientsParticipation(inverse).map(x => x.role).join(), 'ACQUEREUR');
});

test('fausses minutes du dossier : les deux noms d’abord, jamais un acte plus ancien des mêmes clients', () => {
  const fichiers = [
    { chemin: '2026/VTE MARTEL FOURNIER.pdf', nom: 'VTE MARTEL FOURNIER.pdf', taille: 3e6, modifie: '2026-09-29T10:00:00Z' },
    { chemin: '2026/Attestation de vente MARTEL.pdf', nom: 'Attestation de vente MARTEL.pdf', taille: 2e5, modifie: '2026-09-29T11:00:00Z' },
    { chemin: '2021/VTE MARTEL DURAND.pdf', nom: 'VTE MARTEL DURAND.pdf', taille: 3e6, modifie: '2021-03-01T10:00:00Z' },
    { chemin: '2026/VTE BERNARD PETIT.pdf', nom: 'VTE BERNARD PETIT.pdf', taille: 3e6, modifie: '2026-09-29T10:00:00Z' }
  ];
  const r = app.faussesMinutesPourDossier(fichiers, DOSSIER);
  assert.equal(r.map(f => `${f.nom}:${f.score}:${f.type}`).join(' | '), 'VTE MARTEL FOURNIER.pdf:2:copie | Attestation de vente MARTEL.pdf:1:attestation');
});

test('email : pièce jointe ou lien WeTransfer, copie et/ou attestation, sans nom du dossier dans le corps', () => {
  const joint = app.construireEmailCopieActe(DOSSIER, ['copie', 'attestation'], false);
  assert.match(joint.sujet, /^Copie de l’acte et attestation de vente — /);
  assert.match(joint.corps, /Veuillez trouver ci-joint la copie de l’acte et l’attestation de vente de la vente signée le 28 septembre 2026\./);
  assert.doesNotMatch(joint.corps, /MARTEL/);
  const lien = app.construireEmailCopieActe(DOSSIER, ['attestation'], true);
  assert.match(lien.sujet, /^Attestation de vente — /);
  assert.match(lien.corps, /trop volumineux/);
  assert.match(lien.corps, /\[lien WeTransfer à coller ici\]/);
});

test('Échanges : la ligne seulement dans un dossier en participation, utile une fois l’acte signé', () => {
  assert.ok(app.echangesSelonStade(DOSSIER, '2026-10-03').utiles.includes('copieActe'));
  assert.ok(app.echangesSelonStade(Object.assign({}, DOSSIER, { rendezVousSignature: '2026-10-20' }), '2026-10-03').autres.includes('copieActe'));
  const instrumentaire = Object.assign({}, DOSSIER, { roleNotaire: 'instrumentaire' });
  const e = app.echangesSelonStade(instrumentaire, '2026-10-03');
  assert.ok(!e.utiles.concat(e.autres).includes('copieActe'));
});

test('tailleLisible et limite de 21 Mo', () => {
  assert.equal(app.tailleLisible(3.4 * 1024 * 1024), '3,4 Mo');
  assert.equal(app.tailleLisible(850 * 1024), '850 Ko');
  assert.equal(app.LIMITE_PIECES_JOINTES_OCTETS, 21 * 1024 * 1024);
});
