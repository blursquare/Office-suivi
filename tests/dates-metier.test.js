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

// --- Objets date métier (construireDatesMetier) ---

const SIGNATURE = '2026-09-15';

function datesMetier(app, texte, dateCompromis = SIGNATURE) {
  return app.construireDatesMetier(
    app.detecterDatesDepuisTexte(texte, dateCompromis),
    app.detecterDelais(texte),
    dateCompromis
  );
}

test('une date écrite noir sur blanc est marquée EXPLICIT et confirmée', () => {
  const app = chargerApplication();
  const d = datesMetier(app, "L'acquéreur devra obtenir son financement au plus tard le 15 novembre 2026.");
  assert.equal(d.BUTOIR_PRET.valeur, '2026-11-15');
  assert.equal(d.BUTOIR_PRET.statut, 'CONFIRMED');
  assert.equal(d.BUTOIR_PRET.methode, 'EXPLICIT');
  assert.ok(d.BUTOIR_PRET.source.extrait.length > 0);
});

test('un délai en jours est calculé et tracé comme tel', () => {
  const app = chargerApplication();
  const d = datesMetier(app, "L'acquéreur dispose d'un délai de 60 jours à compter de la signature pour obtenir son prêt.");
  assert.equal(d.BUTOIR_PRET.valeur, '2026-11-14');
  assert.equal(d.BUTOIR_PRET.methode, 'CALCULATED');
  assert.equal(d.BUTOIR_PRET.calcul.delai.valeur, 60);
  assert.equal(d.BUTOIR_PRET.calcul.delai.unite, 'jours');
  assert.equal(d.BUTOIR_PRET.calcul.pointDepart, 'signature');
  assert.equal(d.BUTOIR_PRET.calcul.baseDate, SIGNATURE);
});

test('un délai en MOIS est désormais reconnu (il passait entièrement inaperçu)', () => {
  const app = chargerApplication();
  const d = datesMetier(app, "La réitération par acte authentique interviendra dans un délai de 3 mois à compter de la signature.");
  assert.equal(d.REITERATION_ACTE.valeur, '2026-12-15');
  assert.equal(d.REITERATION_ACTE.methode, 'CALCULATED');
  assert.equal(d.REITERATION_ACTE.calcul.delai.unite, 'mois');
});

test('un délai dont le point de départ n’est pas la signature ne produit AUCUNE date', () => {
  // « à compter de la notification du refus » : la date de cet événement ne figure pas dans l'acte.
  // La spec interdit de compter quand même depuis la signature — on signale la clause à l'étude.
  const app = chargerApplication();
  const d = datesMetier(app, "L'acquéreur devra obtenir son prêt dans un délai de 30 jours à compter de la notification du refus.");
  assert.equal(d.BUTOIR_PRET.valeur, null);
  assert.equal(d.BUTOIR_PRET.statut, 'NEEDS_REVIEW');
  assert.equal(d.BUTOIR_PRET.calcul.pointDepart, 'notification');
  assert.equal(d.BUTOIR_PRET.calcul.baseDate, null);
  assert.ok(d.BUTOIR_PRET.source.extrait.includes('notification'));
});

test('sans date de signature connue, un délai reste à calculer plus tard', () => {
  const app = chargerApplication();
  const d = datesMetier(app, "L'acquéreur dispose d'un délai de 60 jours à compter de la signature pour obtenir son prêt.", '');
  assert.equal(d.BUTOIR_PRET.valeur, null);
  assert.equal(d.BUTOIR_PRET.statut, 'NEEDS_REVIEW');
  assert.equal(d.SIGNATURE_AVANT_CONTRAT.statut, 'NOT_FOUND');
});

test('deux clauses contradictoires conservent les deux sources plutôt que d’en choisir une en silence', () => {
  const app = chargerApplication();
  const d = datesMetier(app,
    "La réitération de l'acte authentique aura lieu au plus tard le 15 décembre 2026. " +
    "La signature de l'acte authentique est prévue le 20 décembre 2026.");
  assert.equal(d.REITERATION_ACTE.statut, 'NEEDS_REVIEW');
  assert.equal(d.REITERATION_ACTE.candidats.length, 2);
  assert.ok(d.REITERATION_ACTE.candidats.every(c => c.source && c.source.extrait));
});

test('une date explicite n’est jamais remplacée par une date calculée', () => {
  // L'acte donne la date ET le délai : c'est la date écrite qui fait foi.
  const app = chargerApplication();
  const d = datesMetier(app,
    "L'acquéreur devra obtenir son prêt au plus tard le 15 novembre 2026, " +
    "soit un délai de 60 jours à compter de la signature.");
  assert.equal(d.BUTOIR_PRET.valeur, '2026-11-15');
  assert.equal(d.BUTOIR_PRET.methode, 'EXPLICIT');
});

test('detecterDelais relève le délai, son unité et son point de départ sans rien calculer', () => {
  const app = chargerApplication();
  const delais = app.detecterDelais("La réitération interviendra dans les deux mois de la réalisation de la condition suspensive.");
  assert.equal(delais.length, 1);
  assert.equal(delais[0].delai.valeur, 2);
  assert.equal(delais[0].delai.unite, 'mois');
  assert.equal(delais[0].pointDepart, 'realisation_condition');
});

test('un délai écrit en toutes lettres est reconnu comme un délai chiffré', () => {
  // « dans un délai de trois mois à compter de la signature » : très courant dans les actes, et
  // totalement invisible tant que seuls les chiffres étaient reconnus.
  const app = chargerApplication();
  const d = datesMetier(app, "La réitération interviendra dans un délai de trois mois à compter de la signature.");
  assert.equal(d.REITERATION_ACTE.valeur, '2026-12-15');
  assert.equal(d.REITERATION_ACTE.calcul.delai.valeur, 3);
});

test('le délai de notification du refus au notaire reste écarté (non-régression 60 j / 70 j)', () => {
  const app = chargerApplication();
  const d = datesMetier(app,
    "La présente est soumise à la condition suspensive d'obtention d'un prêt au plus tard dans les 60 jours. " +
    "L'acquéreur devra notifier au notaire le refus au plus tard dans les 70 jours.");
  assert.equal(d.BUTOIR_PRET.valeur, '2026-11-14');
  assert.equal(d.BUTOIR_PRET.statut, 'CONFIRMED');
});

test('la date de signature de l’avant-contrat est elle-même un objet date confirmé', () => {
  const app = chargerApplication();
  const d = datesMetier(app, "Le présent compromis est signé le 15 septembre 2026.");
  assert.equal(d.SIGNATURE_AVANT_CONTRAT.valeur, SIGNATURE);
  assert.equal(d.SIGNATURE_AVANT_CONTRAT.statut, 'CONFIRMED');
  assert.equal(d.SIGNATURE_AVANT_CONTRAT.methode, 'EXPLICIT');
});
