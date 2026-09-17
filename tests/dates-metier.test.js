'use strict';

// Calcul des échéances exprimées en délai (voir ajouterMois / calculerDateEcheance dans script.js,
// section « EXTRACTION STRUCTURÉE : socle de calcul »). Ce calcul est fait par l'application, JAMAIS
// par le modèle IA local : l'arithmétique calendaire d'un llama 8B n'est pas fiable, et une date
// d'échéance fausse se voit rarement à l'œil sur une fiche.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('ajouterMois compte de quantième à quantième', () => {
  const app = chargerApplication();
  assert.equal(app.ajouterMois('2026-09-15', 3), '2026-12-15');
  assert.equal(app.ajouterMois('2026-12-15', 1), '2027-01-15');
});

test('ajouterMois borne au dernier jour du mois quand le quantième n’existe pas', () => {
  // « Trois mois à compter du 31 janvier » ne donne pas le 3 mai : le délai expire le dernier jour
  // du mois d'arrivée (règle de computation usuelle, art. 641 CPC).
  const app = chargerApplication();
  assert.equal(app.ajouterMois('2026-01-31', 1), '2026-02-28');
  assert.equal(app.ajouterMois('2026-01-31', 3), '2026-04-30');
  assert.equal(app.ajouterMois('2026-10-31', 4), '2027-02-28');
});

test('ajouterMois tient compte des années bissextiles', () => {
  const app = chargerApplication();
  assert.equal(app.ajouterMois('2024-01-31', 1), '2024-02-29');
});

test('ajouterMois refuse une entrée qui n’est pas une date ISO', () => {
  const app = chargerApplication();
  assert.equal(app.ajouterMois('pas-une-date', 2), null);
  assert.equal(app.ajouterMois(null, 1), null);
  assert.equal(app.ajouterMois('2026-09-15', NaN), null);
});

test('calculerDateEcheance calcule un délai en jours', () => {
  // Cas de la spec : « un délai de 60 jours à compter de la signature », signature au 15/09/2026.
  const app = chargerApplication();
  assert.equal(app.calculerDateEcheance('2026-09-15', { valeur: 60, unite: 'jours' }), '2026-11-14');
});

test('calculerDateEcheance calcule un délai en mois', () => {
  const app = chargerApplication();
  assert.equal(app.calculerDateEcheance('2026-09-15', { valeur: 3, unite: 'mois' }), '2026-12-15');
});

test('calculerDateEcheance ne calcule rien sans date de départ connue', () => {
  // Point de départ inconnu (« à compter de la réalisation de la condition suspensive ») : la date
  // doit remonter en NEEDS_REVIEW plutôt que d'être devinée depuis la signature.
  const app = chargerApplication();
  assert.equal(app.calculerDateEcheance(null, { valeur: 60, unite: 'jours' }), null);
  assert.equal(app.calculerDateEcheance('', { valeur: 3, unite: 'mois' }), null);
});

test('calculerDateEcheance refuse une unité inconnue ou un délai non exploitable', () => {
  const app = chargerApplication();
  assert.equal(app.calculerDateEcheance('2026-09-15', { valeur: 2, unite: 'semaines' }), null);
  assert.equal(app.calculerDateEcheance('2026-09-15', { valeur: 0, unite: 'jours' }), null);
  assert.equal(app.calculerDateEcheance('2026-09-15', null), null);
});
