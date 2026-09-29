'use strict';

// Étape du dossier (voir etapeDossier dans script.js) : le statut unique affiché partout depuis la
// revue de l'interface du 29/09 — à la place de « Aucun document », « En retard », « À relier »…

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const AUJ = '2026-09-29';
const dossier = (extra) => Object.assign({ id: 'x', nom: 'DUPONT / MARTIN', typeVente: 'maison', roleNotaire: 'instrumentaire', pieces: {} }, extra);
const etape = (d) => app.etapeDossier(d, AUJ);

test('ordre des étapes : vente préalable, prêt, préemption, rendez-vous, envois, signature', () => {
  assert.equal(etape(dossier({ ventebien: '2026-11-01', pret: '2026-11-20' })).texte, 'Attente de la vente préalable');
  assert.equal(etape(dossier({ pret: '2026-11-20' })).texte, 'Attente de l’offre de prêt');
  assert.equal(etape(dossier({ sansPret: true })).texte, 'Attente de la préemption');
  const participant = { sansPret: true, roleNotaire: 'participant' };
  assert.equal(etape(dossier(participant)).texte, 'Rendez-vous à fixer');
  assert.equal(etape(dossier({ ...participant, rendezVousSignature: '2026-10-20' })).texte, 'Appel de fonds à envoyer');
  assert.equal(etape(dossier({ ...participant, rendezVousSignature: '2026-10-20', appelFonds: '2026-09-20' })).texte, 'Projet à envoyer');
  assert.equal(etape(dossier({ ...participant, rendezVousSignature: '2026-10-20', appelFonds: '2026-09-20', projetEnvoye: '2026-09-25' })).texte, 'Prêt à signer');
  assert.equal(etape(dossier({ ...participant, rendezVousSignature: '2026-09-20' })).texte, 'Signé');
  assert.equal(etape(dossier({ archive: true })).texte, 'Archivé');
});

test('une offre reçue passe à l’étape suivante', () => {
  const d = dossier({ pret: '2026-10-05', offrePretStatut: 'recue', roleNotaire: 'participant' });
  assert.equal(etape(d).texte, 'Rendez-vous à fixer');
});

test('pièces : manquantes seulement si le dossier est relié ; inconnues → « Signature à venir », jamais « Prêt à signer »', () => {
  const fin = { sansPret: true, rendezVousSignature: '2026-10-20', appelFonds: '2026-09-20', projetEnvoye: '2026-09-25', pieces: { renonciationPreemption: 'recue' } };
  assert.equal(etape(dossier(fin)).texte, 'Signature à venir');
  assert.equal(etape(dossier({ ...fin, dossierLie: true })).texte, 'Pièces manquantes');
  const sansRdv = { sansPret: true, dossierLie: true, pieces: { renonciationPreemption: 'recue' } };
  assert.equal(etape(dossier(sansRdv)).texte, 'Pièces manquantes');
});

test('couleur selon l’échéance de l’étape : ≤ 7 j rouge, ≤ 15 j ambre, sinon neutre ; signature en vert', () => {
  assert.equal(etape(dossier({ pret: '2026-10-04' })).dl, 'dl-urgent');
  assert.equal(etape(dossier({ pret: '2026-09-20' })).dl, 'dl-urgent', 'dépassée');
  assert.equal(etape(dossier({ pret: '2026-10-12' })).dl, 'dl-pret');
  assert.equal(etape(dossier({ pret: '2026-11-30' })).dl, 'dl-neutre');
  assert.equal(etape(dossier({ pret: '' })).dl, 'dl-neutre', 'sans date');
  assert.equal(etape(dossier({ sansPret: true, roleNotaire: 'participant', rendezVousSignature: '2026-10-01', appelFonds: '2026-09-20', projetEnvoye: '2026-09-25' })).dl, 'dl-success');
});
