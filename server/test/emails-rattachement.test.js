'use strict';

// Rattachement d'un email à un dossier (voir src/emailsMatin.js, contexteClassement / dossierDeEmail, et
// src/emailsDossiers.js, dossierDeEmailEnvoye) : toutes les adresses connues (fiche, parties d'Authentic),
// fils de conversation, dossiers archivés (étude 06/10). Noms et adresses inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { contexteClassement, dossierDeEmail, dossierDeEmailParAdresse, emailLieAuxAdressesDuDossier, adressesDuDossier } = require('../src/emailsMatin');
const { dossierDeEmailEnvoye } = require('../src/emailsDossiers');

const VENTE = { id: 'd1', nom: 'LAMBERT / ROCHE', emailAcquereur: 'paul.roche@exemple.fr', emailNotaireParticipant: 'office@notaires-exemple.fr' };
const AUTRE = { id: 'd2', nom: 'MOREAU / DUPRE', emailNotaireParticipant: 'office@notaires-exemple.fr' };
const SUCC = { id: 'd3', nom: 'Succession VALLET', typeAffaire: 'succession',
  parties: [{ nom: 'Inès VALLET', role: 'PARTIE', emails: ['ines.vallet@exemple.fr'] }, { nom: 'Marc VALLET', role: 'PARTIE', emails: [] }] };
const ARCHIVE = { id: 'd4', nom: 'GARNIER / LEBLANC', archive: true, emailVendeur: 'garnier.anne@exemple.fr; jean.garnier@exemple.fr',
  emailNotaireParticipant: 'office@notaires-exemple.fr' };
const ARCHIVE2 = { id: 'd5', nom: 'FAURE / CHEVALIER', archive: true, emailConfrereVendeur: 'etude@confrere-exemple.fr' };
const ARCHIVE3 = { id: 'd6', nom: 'BRUN / PETIT', archive: true, emailConfrereVendeur: 'etude@confrere-exemple.fr' };
const DOSSIERS = [VENTE, AUTRE, SUCC, ARCHIVE, ARCHIVE2, ARCHIVE3];

const recu = (deAdresse, sujet) => ({ deAdresse, sujet, apercu: '' });
const id = (d) => (d ? d.id : null);

test('adressesDuDossier : champs de la fiche (plusieurs par champ) et emails des parties relevés dans Authentic', () => {
  assert.equal(adressesDuDossier(ARCHIVE).join(), 'garnier.anne@exemple.fr,jean.garnier@exemple.fr,office@notaires-exemple.fr');
  assert.equal(adressesDuDossier(SUCC).join(), 'ines.vallet@exemple.fr');
  assert.equal(adressesDuDossier({ parties: [null, { email: 'Une.Partie@Exemple.fr' }] }).join(), 'une.partie@exemple.fr');
});

test('adresse d’une partie (héritier d’une succession) : l’email va au dossier', () => {
  const ctx = contexteClassement(DOSSIERS, []);
  assert.equal(id(dossierDeEmail(recu('ines.vallet@exemple.fr', 'Question'), ctx)), 'd3');
  assert.equal(id(dossierDeEmail(recu('paul.roche@exemple.fr', 'Mon RIB'), ctx)), 'd1');
});

test('confrère de plusieurs dossiers : l’objet départage, sinon aucun dossier deviné', () => {
  const ctx = contexteClassement(DOSSIERS, []);
  assert.equal(id(dossierDeEmail(recu('office@notaires-exemple.fr', 'Dossier MOREAU - état daté'), ctx)), 'd2');
  assert.equal(id(dossierDeEmail(recu('office@notaires-exemple.fr', 'VTE ROCHE : projet'), ctx)), 'd1');
  assert.equal(dossierDeEmail(recu('office@notaires-exemple.fr', 'Vos disponibilités'), ctx), null);
});

test('fil : une réponse « RE: » à un échange d’un seul dossier y va, même d’une adresse inconnue', () => {
  const historique = { emails: [
    { dossierId: 'd1', sens: 'envoye', objet: 'Votre projet d’acte de vente', a: ['paul.roche@exemple.fr'] },
    { dossierId: 'd2', sens: 'recu', objet: 'Diagnostics du bien', a: [] },
    { dossierId: 'd1', sens: 'recu', objet: 'Diagnostics du bien', a: [] }
  ], prepares: [{ dossierId: 'd3', objet: 'Déclaration de succession — pièces' }] };
  const ctx = contexteClassement(DOSSIERS, [], historique);
  assert.equal(id(dossierDeEmail(recu('marie.roche@ailleurs.fr', 'RE: Votre projet d’acte de vente'), ctx)), 'd1');
  assert.equal(id(dossierDeEmail(recu('frere@ailleurs.fr', 'TR : RE: Declaration de succession - pieces'.replace(' - ', ' — ')), ctx)), 'd3');
  // Pas une réponse, ou objet commun à deux dossiers : pas de fil.
  assert.equal(dossierDeEmail(recu('marie.roche@ailleurs.fr', 'Votre projet d’acte de vente'), ctx), null);
  assert.equal(dossierDeEmail(recu('diag@ailleurs.fr', 'RE: Diagnostics du bien'), ctx), null);
  // Objet trop court : jamais un fil.
  const court = contexteClassement(DOSSIERS, [], { emails: [{ dossierId: 'd1', sens: 'envoye', objet: 'Documents', a: [] }] });
  assert.equal(dossierDeEmail(recu('x@ailleurs.fr', 'RE: Documents'), court), null);
});

test('adresse à qui l’étude a écrit pour un seul dossier : ses emails y vont ; plusieurs dossiers ou adresse de l’étude : non', () => {
  const historique = { internes: ['julie@office.fr'], emails: [
    { dossierId: 'd1', sens: 'envoye', objet: 'Pièces', a: ['agence@immo-exemple.fr', 'julie@office.fr'] },
    { dossierId: 'd1', sens: 'envoye', objet: 'Relance', a: ['banque@exemple.fr'] },
    { dossierId: 'd2', sens: 'envoye', objet: 'Relance', a: ['banque@exemple.fr'] }
  ] };
  const ctx = contexteClassement(DOSSIERS, [], historique);
  assert.equal(id(dossierDeEmail(recu('agence@immo-exemple.fr', 'Compromis signé'), ctx)), 'd1');
  assert.equal(dossierDeEmail(recu('banque@exemple.fr', 'Offre éditée'), ctx), null);
  assert.equal(dossierDeEmail(recu('julie@office.fr', 'Point'), ctx), null);
});

test('dossiers archivés : client ou confrère qui écrit après la signature ; un dossier en cours passe toujours devant', () => {
  const ctx = contexteClassement(DOSSIERS, []);
  assert.equal(id(dossierDeEmail(recu('jean.garnier@exemple.fr', 'Taxe foncière'), ctx)), 'd4');
  // Confrère de deux dossiers archivés : l'objet départage.
  assert.equal(id(dossierDeEmail(recu('etude@confrere-exemple.fr', 'Attestation de vente FAURE'), ctx)), 'd5');
  assert.equal(id(dossierDeEmail(recu('etude@confrere-exemple.fr', 'VTE - BRUN / PETIT : copie'), ctx)), 'd6');
  assert.equal(dossierDeEmail(recu('etude@confrere-exemple.fr', 'Bonjour'), ctx), null);
  // Confrère d'un dossier en cours et d'un archivé : sans nom dans l'objet, rien n'est deviné ; nommé archivé, l'archivé.
  assert.equal(id(dossierDeEmail(recu('office@notaires-exemple.fr', 'Copie authentique GARNIER'), ctx)), 'd4');
  // Le même client revenu sur un dossier en cours : le dossier en cours.
  const revenu = contexteClassement(DOSSIERS.concat([{ id: 'd7', nom: 'GARNIER / MARTIN', emailVendeur: 'jean.garnier@exemple.fr' }]), []);
  assert.equal(id(dossierDeEmail(recu('jean.garnier@exemple.fr', 'Taxe foncière'), revenu)), 'd7');
});

test('email envoyé : destinataire d’un dossier (partie, archivé), confrère départagé par l’objet — jamais l’objet seul (étude 07/10)', () => {
  const ctx = contexteClassement(DOSSIERS, [], { emails: [{ dossierId: 'd2', sens: 'recu', objet: 'Question sur le financement', a: [] }] });
  assert.equal(id(dossierDeEmailEnvoye({ objet: 'Rendez-vous', a: ['ines.vallet@exemple.fr'] }, ctx)), 'd3');
  assert.equal(id(dossierDeEmailEnvoye({ objet: 'Votre taxe foncière', a: ['garnier.anne@exemple.fr'] }, ctx)), 'd4');
  // Réponse à un fil du dossier, mais à une adresse absente de la fiche : rien (« ne mettre que les emails liés aux adresses des clients »).
  assert.equal(dossierDeEmailEnvoye({ objet: 'RE: Question sur le financement', a: ['inconnu@ailleurs.fr'] }, ctx), null);
  assert.equal(dossierDeEmailEnvoye({ objet: 'Demande d’alignement - VTE LAMBERT / ROCHE', a: ['geometre@ailleurs.fr'] }, ctx), null);
  assert.equal(id(dossierDeEmailEnvoye({ objet: 'Projet ROCHE', a: ['office@notaires-exemple.fr'] }, ctx)), 'd1');
});

test('emails des dossiers (étude 07/10) : rattachés par l’adresse de la fiche seulement ; les adresses de l’étude ne désignent aucun dossier', () => {
  // L'adresse de l'office (domaine de l'étude) saisie sur une fiche par erreur : écartée, comme celles des collaborateurs.
  const avecOffice = DOSSIERS.concat([{ id: 'd8', nom: 'SIMOND / PINTO', emailAcquereur: 'criste.pinto@exemple.fr', emailConfrereVendeur: 'Office@etude-exemple.notaires.fr' }]);
  const ctx = contexteClassement(avecOffice, [], {
    internes: ['bastien@etude-exemple.notaires.fr', 'collaborateur@gmail.com'],
    emails: [{ dossierId: 'd8', sens: 'envoye', objet: 'Vente SIMOND / PINTO - pièces', a: ['office@etude-exemple.notaires.fr'] }]
  });
  assert.equal(id(dossierDeEmailParAdresse(recu('criste.pinto@exemple.fr', 'Bonjour'), ctx)), 'd8');
  assert.equal(dossierDeEmailParAdresse(recu('office@etude-exemple.notaires.fr', 'PUV SUCC BOUZY'), ctx), null);
  // Objet, « VTE - NOM », fil d'une conversation : plus jamais suffisants.
  assert.equal(dossierDeEmailParAdresse(recu('banque@exemple.fr', 'VTE - SIMOND / PINTO : offre'), ctx), null);
  assert.equal(dossierDeEmailParAdresse(recu('soeur@ailleurs.fr', 'RE: Vente SIMOND / PINTO - pièces'), ctx), null);
  // Le confrère de plusieurs dossiers : l'objet départage, comme avant ; un domaine public n'écarte personne.
  assert.equal(id(dossierDeEmailParAdresse(recu('office@notaires-exemple.fr', 'Dossier MOREAU - état daté'), ctx)), 'd2');
  assert.ok(!ctx.adresseEtude('client@gmail.com'));
  // Déjà rattachés : gardés s'ils viennent d'une adresse de la fiche (ou d'un email préparé depuis la fiche), retirés sinon.
  assert.equal(emailLieAuxAdressesDuDossier({ dossierId: 'd8', sens: 'recu', de: { adresse: 'office@etude-exemple.notaires.fr' } }, ctx), false);
  assert.equal(emailLieAuxAdressesDuDossier({ dossierId: 'd8', sens: 'recu', de: { adresse: 'criste.pinto@exemple.fr' } }, ctx), true);
  assert.equal(emailLieAuxAdressesDuDossier({ dossierId: 'd8', sens: 'envoye', a: ['geometre@ailleurs.fr'] }, ctx), false);
  assert.equal(emailLieAuxAdressesDuDossier({ dossierId: 'd8', sens: 'envoye', a: ['geometre@ailleurs.fr'], prepareId: 'p1' }, ctx), true);
  assert.equal(emailLieAuxAdressesDuDossier({ dossierId: 'd8', sens: 'envoye', a: ['geometre@ailleurs.fr', 'Criste.Pinto@exemple.fr'] }, ctx), true);
});
