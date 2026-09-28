'use strict';

// Rendez-vous de signature et agenda Outlook : lieu écrit à la création (initiales + mention
// d'envoi), et proposition de l'horaire juste après la saisie de la date.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('mentionEnvoisAgenda suit les envois faits', () => {
  assert.equal(app.mentionEnvoisAgenda({}), '');
  assert.equal(app.mentionEnvoisAgenda({ appelFonds: '2026-09-20', echeancesValidees: { appelFonds: true } }), 'Appel de fonds envoyé');
  assert.equal(app.mentionEnvoisAgenda({ projetEnvoye: '2026-09-21', echeancesValidees: { projetEnvoye: true } }), 'Projet envoyé');
  assert.equal(app.mentionEnvoisAgenda({ echeancesValidees: { appelFonds: true, projetEnvoye: true } }), 'Appel de fonds et projet envoyé');
});

test('initiales du responsable et lieu du rendez-vous', () => {
  assert.equal(app.initialesResponsable({ responsable: 'Julie VASSELIN' }), 'JV');
  assert.equal(app.initialesResponsable({ responsable: 'Jérémy SAUJOT' }), 'JS');
  assert.equal(app.initialesResponsable({}), '');
  assert.equal(app.lieuRdvAgenda({ responsable: 'Julie VASSELIN' }), 'JV');
  assert.equal(app.lieuRdvAgenda({ responsable: 'Julie VASSELIN', echeancesValidees: { projetEnvoye: true } }), 'JV - Projet envoyé');
  assert.equal(app.lieuRdvAgenda({ echeancesValidees: { appelFonds: true } }), 'Appel de fonds envoyé');
});

test("l'horaire n'est pas proposé sans connexion à l'agenda ni sans date", () => {
  assert.equal(app.proposerHoraireRdv(null), false);
  assert.equal(app.proposerHoraireRdv({ rendezVousSignature: '' }), false);
  // Connexion Exchange non configurée dans le banc d'essai.
  assert.equal(app.proposerHoraireRdv({ rendezVousSignature: '2026-10-14' }), false);
});

test('typeRendezVous : choix fait dans CLAIRE, sinon catégorie Outlook relevée (casse et accents ignorés)', () => {

  const noms = { office: 'Catégorie Verte', visio: 'Catégorie Violette', confrere: 'Catégorie Orange' };
  assert.equal(app.typeRendezVous({ rendezVousType: 'visio' }, noms), 'visio');
  assert.equal(app.typeRendezVous({ rendezVousSignatureCategories: ['categorie orange'] }, noms), 'confrere');
  assert.equal(app.typeRendezVous({ rendezVousSignatureCategories: ['Autre'] }, noms), '');
  assert.equal(app.typeRendezVous({}, noms), '');
  assert.equal(app.typeRendezVous({ rendezVousType: 'inconnu', rendezVousSignatureCategories: ['Catégorie Verte'] }, noms), 'office');
});

test('import : couleur, identifiant de l\'événement et date retirée conservés', () => {

  const d = app.normaliserDossierImporte({
    id: 'x', nom: 'A / B', rendezVousType: 'confrere',
    rdvAgendaItem: { itemId: 'AAA', changeKey: 'K', date: '2026-10-14' },
    rendezVousSignatureCategories: ['Catégorie Orange', 3],
    detectionsAgenda: { rendezVousRetire: '2026-10-14' }
  });
  assert.equal(d.rendezVousType, 'confrere');
  assert.equal(d.rdvAgendaItem.itemId, 'AAA');
  assert.equal(d.rendezVousSignatureCategories.join('|'), 'Catégorie Orange');
  assert.equal(d.detectionsAgenda.rendezVousRetire, '2026-10-14');
  assert.equal(app.normaliserDossierImporte({ id: 'y', nom: 'C', rendezVousType: 'plage' }).rendezVousType, '');
});
