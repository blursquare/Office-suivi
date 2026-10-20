'use strict';

// Trajets d'un rendez-vous chez un confrère (étude 20/10) : titre, créneaux d'une demi-heure, adresse de l'office du confrère, et
// règle des 6 rendez-vous par jour qui ne les compte pas (sans les laisser chevaucher un créneau proposé).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const T = require('../commun/trajets');

test('titre et reconnaissance d’un trajet', () => {
  assert.equal(T.titreTrajet(42.4), 'Trajet - 42 km');
  assert.equal(T.titreTrajet(null), 'Trajet', 'jamais une distance devinée');
  assert.equal(T.estTitreTrajet('Trajet - 42 km'), true);
  assert.equal(T.estTitreTrajet('TRAJET'), true);
  assert.equal(T.estTitreTrajet('Trajets bureau'), false);
  assert.equal(T.estTitreTrajet('VTE - DURAND / MARTIN'), false);
});

test('créneaux : une demi-heure avant et une demi-heure après, jamais hors de la journée', () => {
  assert.deepEqual(T.creneauxTrajet('14:30', 60), { aller: { heure: '14:00', heureFin: '14:30' }, retour: { heure: '15:30', heureFin: '16:00' } });
  assert.deepEqual(T.creneauxTrajet('09:00', 90).retour, { heure: '10:30', heureFin: '11:00' });
  assert.equal(T.creneauxTrajet('00:10', 60), null);
  assert.equal(T.creneauxTrajet('23:00', 60), null);
  assert.equal(T.creneauxTrajet('14h', 60), null);
});

test('adresse de l’office du confrère, d’après l’annuaire', () => {
  const app = chargerApplication();
  app.carnetConfreres = [
    { id: 'a1', office: 'Office DURAND', notaires: ['Paul DURAND'], adresse: '50 rue de Genève', codePostal: '01800', ville: 'Meximieux', departement: '01' },
    { id: 'a2', office: 'Me Sophie GOSSART', notaires: ['Sophie GOSSART'], adresse: '3 rue du Bout des Haies', codePostal: '41000', ville: 'Blois', departement: '41', etude: true }
  ];
  const etude = 'Maître Sophie GOSSART (BLOIS)';
  const d = { notaireVendeur: etude, notaireAcquereur: 'Maître Paul DURAND (Meximieux)', coteInstrumentaire: 'vendeur' };
  assert.equal(app.adresseOfficeConfrereDossier(d), '50 rue de Genève, 01800 Meximieux');
  assert.equal(app.adresseOfficeConfrereDossier({ notaireVendeur: etude, notaireAcquereur: etude }), '', 'sans confrère, aucune adresse');
  assert.equal(app.adresseOfficeConfrereDossier({ notaireVendeur: etude, notaireAcquereur: 'Maître Inconnu PERSONNE' }), '');
  assert.equal(app.confrereLieuAgenda(d), 'Me DURAND en 2nd', 'le lieu du rendez-vous ne change pas');
});

test('règle des 6 rendez-vous : les trajets ne comptent pas, mais aucun créneau ne les chevauche', () => {
  const app = chargerApplication();
  const jour = '2026-11-03';
  const evt = (sujet, heure, heureFin) => ({ sujet, date: jour, dateFin: jour, heure, heureFin, categories: [] });
  const evenements = [
    evt('Trajet - 30 km', '09:00', '09:30'), evt('VTE - A', '09:30', '10:30'), evt('Trajet - 30 km', '10:30', '11:00'),
    evt('VTE - B', '11:00', '12:00'), evt('VTE - C', '14:00', '15:00'), evt('VTE - D', '15:00', '16:00'), evt('VTE - E', '16:00', '17:00')
  ];
  assert.equal(app.rendezVousHorairesJour(evenements, jour).length, 5, 'deux trajets hors du compte');
  assert.equal(app.occupationsHorairesJour(evenements, jour).length, 7);
  assert.equal(app.motifCreneauExceptionnel('17:00', 60, app.rendezVousHorairesJour(evenements, jour).length), '');
});

test('message après la création : ce que sont devenus les trajets', () => {
  const app = chargerApplication();
  assert.equal(app.texteTrajetsPoses(undefined), '');
  assert.equal(app.texteTrajetsPoses({ poses: 2, km: 42 }), ' Trajets avant et après posés (42 km).');
  assert.equal(app.texteTrajetsPoses({ poses: 2, km: null, raisonKm: 'adresse de l’office du confrère inconnue' }), ' Trajets avant et après posés, distance non lue : adresse de l’office du confrère inconnue.');
  assert.equal(app.texteTrajetsPoses({ poses: 0 }), ' Trajets non posés dans l’agenda.');
});
