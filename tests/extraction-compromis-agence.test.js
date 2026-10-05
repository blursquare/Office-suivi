'use strict';

// Compromis rédigés sur la trame d'une agence immobilière (05/10, deux compromis réels rejoués — noms, adresses, montants
// et emails inventés ici) : adresse du bien sous « Adresse des biens : », emails des parties hors de la phrase qui nomme le
// rôle, nom de l'agence suivi de « exploitée par », honoraires sans séparateur de milliers, acompte au séquestre alors qu'un
// BAIL en cours cite son propre dépôt de garantie plus haut. Promesses sans prêt : deux tournures relevées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

const COMPROMIS_AGENCE = [
  "COMPROMIS DE VENTE - BIEN HORS COPROPRIETE Agence du Château 5 rue des Remparts 41000 BLOIS 02.54.00.00.00",
  "Compromis vente DURAND - MARTIN Mandat n° 1234",
  "COMPROMIS DE VENTE Le vendeur Madame Odile, Marie DURAND née le 7 octobre 1960 à TOURS (37) , de nationalité française , retraitée , demeurant 3 rue des Lilas - 41000 BLOIS. Téléphone : 06.00.00.00.01 Adresse électronique : odile.d41@exemple.fr Ayant sa résidence fiscale en France, au sens de la règlementation fiscale.",
  "Ci-après dénommé(e)s \"le VENDEUR\", d'une part,",
  "L'acquéreur Monsieur Paul, Jean MARTIN né le 6 juillet 1990 à BLOIS (41) , de nationalité française , technicien , et Madame Léa, Anne PETIT née le 12 juin 1991 à ORLEANS (45) , de nationalité française , infirmière , demeurant ensemble 12 avenue Foch - 41000 BLOIS , Téléphones : 06.00.00.00.02 / 06.00.00.00.03 Adresses électroniques : paul.martin@exemple.fr / lea.petit@exemple.fr Ayant leur résidence fiscale en France.",
  "Ci-après dénommé(e)s \"l'ACQUEREUR\", d'autre part,",
  "En présence de l'Agence du Château, située 5 rue des Remparts 41000 BLOIS , téléphone 02.54.00.00.00 , adresse mail contact@agence-chateau.fr , exploitée par la société CHATEAU IMMO SARL,",
  "Ci-après dénommée \"l'AGENCE\" ou \"le MANDATAIRE\",",
  "Biens objet de la vente Adresse des biens : 8 B Rue des Tilleuls - 41000 BLOIS . Description Une maison à usage d'habitation située à BLOIS (41000), 8 B rue des Tilleuls.",
  "Situation locative Location n° 1 : Nature des locaux loués : Garage Montant du loyer et charges : 60 € Montant du dépôt de garantie : 120 €",
  "Prix - Acompte La présente vente est consentie et acceptée moyennant le prix de cent soixante mille euros ( 160 000 €) .",
  "La somme de trois mille euros ( 3000 € ) , sera déposée à titre d'acompte entre les mains de Maître Claire NOTAIRE , choisi pour séquestre par les PARTIES.",
  "Honoraires de l'AGENCE Les PARTIES reconnaissent que les présentes ont été négociées par l'AGENCE l'Agence du Château exploitée par la société CHATEAU IMMO qu'elles déclarent bénéficiaire du montant de la rémunération convenue, soit la somme de huit mille TTC ( 8000 € TTC ). Ces honoraires seront dus par l'ACQUEREUR.",
  "Nom du titulaire Adresse mail Madame Odile DURAND odile.d41@exemple.fr Monsieur Paul MARTIN paul.martin@exemple.fr"
].join('  ');

test('trame d’agence : adresse du bien sous « Adresse des biens », jamais celle de l’agence en tête', () => {
  const a = app.detecterAdresseBienStructuree(COMPROMIS_AGENCE).adresse;
  assert.equal(a.codePostal, '41000');
  assert.match(a.adresseComplete, /8 B rue des Tilleuls/i);
  assert.doesNotMatch(a.adresseComplete, /Remparts/);
});

test('trame d’agence : emails des parties rattachés par leur nom, jamais celui de l’agence', () => {
  const ex = app.construireExtractionRegex(COMPROMIS_AGENCE, null, null, 'compromis.pdf');
  assert.equal(ex.champs.emailAcquereur.valeur, 'paul.martin@exemple.fr; lea.petit@exemple.fr');
  assert.equal(ex.champs.emailVendeur.valeur, 'odile.d41@exemple.fr');
  const parties = [{ role: 'VENDEUR', nom: 'DURAND' }, { role: 'ACQUEREUR', nom: 'MARTIN' }];
  assert.equal(app.emailsPartieParNom('Les adresses des parties sont les suivantes : Madame Jeanne MARTIN : jm1990@exemple.fr', parties, 'ACQUEREUR'), 'jm1990@exemple.fr');
  assert.equal(app.emailsPartieParNom('Agence exploitée par la société X, adresse mail contact@agence.fr', parties, 'ACQUEREUR'), null);
  assert.equal(app.emailsPartieParNom('Monsieur MARTIN, notaire à BLOIS, office@notaires.fr', parties, 'ACQUEREUR'), null);
});

test('trame d’agence : nom de l’agence, honoraires « 8000 € TTC », acompte au séquestre malgré le dépôt du bail', () => {
  assert.equal(app.detecterNomAgence(COMPROMIS_AGENCE), 'Agence du Château');
  assert.equal(app.detecterHonorairesAgenceTTC(COMPROMIS_AGENCE).valeur, 8000);
  const depot = app.detecterDepotGarantieDetail(COMPROMIS_AGENCE);
  assert.equal(depot.montant, 3000, 'le dépôt de garantie du bail (120 €) n’est jamais celui de la vente');
  assert.equal(app.detecterSequestreDepot(COMPROMIS_AGENCE), 'Maître Claire NOTAIRE');
});

test('sans prêt : « n’entend pas contracter d’emprunt », « déclare ne pas vouloir recourir à un prêt »', () => {
  assert.equal(app.detecterFinancementComptant("Absence de prêt Le BENEFICIAIRE déclare qu'il n'entend pas contracter d'emprunt pour le financement de l'acquisition."), true);
  assert.equal(app.detecterFinancementComptant('Le BENEFICIAIRE déclare ne pas vouloir recourir à un prêt régi par les dispositions du Code de la consommation.'), true);
  assert.equal(app.detecterFinancementComptant("L'acquéreur entend recourir à un prêt de 150 000 €."), false);
});
