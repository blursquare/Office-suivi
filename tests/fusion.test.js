'use strict';

// Fusion des réponses du modèle IA local dans l'objet d'extraction (voir la section « EXTRACTION
// STRUCTURÉE : fusion des lots IA » dans script.js). Trois règles à vérifier, les mêmes pour toute
// donnée : les regex n'ont rien trouvé → on prend la valeur du modèle avec le statut que lui vaut
// la vérification de son extrait ; les deux convergent → CONFIRMED ; les deux divergent → la
// valeur des regex est conservée, le statut passe « à vérifier » et celle du modèle reste en
// candidat. Jamais de choix silencieux entre les deux.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const SIGNATURE = '2026-09-15';

// Acte volontairement pauvre : les regex n'y trouvent presque rien, c'est le terrain où l'apport
// du modèle se mesure.
const ACTE_PAUVRE = 'Le présent compromis est signé le 15 septembre 2026. Les parties conviennent de ce qui suit.';

const ACTE_COMPLET = `COMPROMIS DE VENTE
LE VENDEUR : Monsieur Jean DUPONT, demeurant 3 rue des Lilas, 41000 BLOIS.
Ci-après dénommé le vendeur.
L'ACQUÉREUR : Monsieur Pierre MARTIN, demeurant 8 rue Neuve, 37000 TOURS.
Ci-après dénommé l'acquéreur.
DÉSIGNATION
Une maison d'habitation sise à 25 route de Tours, 41100 VENDÔME.
L'acquéreur devra obtenir son financement au plus tard le 15 novembre 2026.
Le présent compromis est signé le 15 septembre 2026.`;

function extraction(app, texte) {
  return app.construireExtractionRegex(texte, SIGNATURE);
}

test('une valeur trouvée par le seul modèle est reprise, CONFIRMED si son extrait existe', () => {
  const app = chargerApplication();
  const texte = ACTE_PAUVRE + ' Le prix est fixé à deux cent mille euros.';
  const e = extraction(app, texte);
  assert.equal(e.champs.prixVente.valeur, null); // les regex ne lisent pas un prix en lettres seul

  app.fusionnerExtractionIa(e, 'bien', {
    prixVente: { valeur: 200000, extrait: 'Le prix est fixé à deux cent mille euros', extraitTrouve: true, extraitIndex: 96 }
  }, texte);
  assert.equal(e.champs.prixVente.valeur, 200000);
  assert.equal(e.champs.prixVente.statut, 'CONFIRMED');
  assert.equal(e.champs.prixVente.origine, 'ia');
});

test('une valeur dont l’extrait cité est introuvable dans le PDF reste à vérifier', () => {
  // C'est tout le principe : le score de confiance d'un modèle 8B n'est calibré sur rien, sa
  // citation, elle, se vérifie mécaniquement.
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  app.fusionnerExtractionIa(e, 'bien', {
    prixVente: { valeur: 999000, extrait: 'une phrase que le modèle a inventée', extraitTrouve: false, extraitIndex: null }
  }, ACTE_PAUVRE);
  assert.equal(e.champs.prixVente.valeur, 999000);
  assert.equal(e.champs.prixVente.statut, 'NEEDS_REVIEW');
});

test('regex et modèle d’accord : la donnée passe CONFIRMED, origine regex+ia', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_COMPLET);
  assert.equal(e.dates.BUTOIR_PRET.valeur, '2026-11-15');
  app.fusionnerExtractionIa(e, 'dates', {
    dates: [{ type: 'BUTOIR_PRET', dateExplicite: '2026-11-15', delai: null, extrait: 'au plus tard le 15 novembre 2026', extraitTrouve: true, extraitIndex: 300 }]
  }, ACTE_COMPLET);
  assert.equal(e.dates.BUTOIR_PRET.valeur, '2026-11-15');
  assert.equal(e.dates.BUTOIR_PRET.statut, 'CONFIRMED');
  assert.equal(e.dates.BUTOIR_PRET.origine, 'regex+ia');
});

test('désaccord : la valeur des regex est gardée, celle du modèle passe en candidat', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_COMPLET);
  app.fusionnerExtractionIa(e, 'dates', {
    dates: [{ type: 'BUTOIR_PRET', dateExplicite: '2026-12-01', delai: null, extrait: 'autre clause', extraitTrouve: false }]
  }, ACTE_COMPLET);
  assert.equal(e.dates.BUTOIR_PRET.valeur, '2026-11-15'); // la détection déterministe l'emporte
  assert.equal(e.dates.BUTOIR_PRET.statut, 'NEEDS_REVIEW');
  assert.equal(e.dates.BUTOIR_PRET.candidats.map(c => c.valeur).join(','), '2026-12-01');
});

test('un délai rapporté par le modèle est calculé ICI, jamais par lui', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  assert.equal(e.dates.BUTOIR_PRET.valeur, null);
  app.fusionnerExtractionIa(e, 'dates', {
    dates: [{ type: 'BUTOIR_PRET', dateExplicite: null, delai: { valeur: 60, unite: 'jours', pointDepart: 'la signature des présentes' }, extrait: 'dans les 60 jours', extraitTrouve: true, extraitIndex: 10 }]
  }, ACTE_PAUVRE);
  assert.equal(e.dates.BUTOIR_PRET.valeur, '2026-11-14'); // 15/09/2026 + 60 jours
  assert.equal(e.dates.BUTOIR_PRET.methode, 'CALCULATED');
});

test('un délai dont le point de départ n’est pas la signature n’est pas calculé', () => {
  // Sans date connue pour l'ancre (notification, purge d'un droit de préemption…), toute date
  // produite serait une invention : la spec l'interdit explicitement.
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  app.fusionnerExtractionIa(e, 'dates', {
    dates: [{ type: 'BUTOIR_PRET', dateExplicite: null, delai: { valeur: 30, unite: 'jours', pointDepart: 'la notification du refus' }, extrait: 'dans les 30 jours', extraitTrouve: true }]
  }, ACTE_PAUVRE);
  assert.equal(e.dates.BUTOIR_PRET.valeur, null);
});

test('une date lue dans l’acte ne devient jamais « calculée » par l’effet de la fusion', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_COMPLET);
  assert.equal(e.dates.BUTOIR_PRET.methode, 'EXPLICIT');
  app.fusionnerExtractionIa(e, 'dates', {
    dates: [{ type: 'BUTOIR_PRET', dateExplicite: null, delai: { valeur: 61, unite: 'jours', pointDepart: 'la signature' }, extrait: 'dans les 61 jours', extraitTrouve: true }]
  }, ACTE_COMPLET);
  assert.equal(e.dates.BUTOIR_PRET.methode, 'EXPLICIT');
});

test('le type d’acte non tranché par les regex est repris du modèle', () => {
  // Cas le plus important de tout le lot « parties » : c'est lui qui décide si le promettant est
  // vendeur ou acquéreur. Acte dont l'intitulé ne nomme jamais son propre type — le cas où les
  // regex, qui comptent des occurrences de mots, ne peuvent rien dire.
  const app = chargerApplication();
  const sansType = "Entre les soussignés, il a été convenu ce qui suit. Fait à Blois le 15 septembre 2026.";
  const e = extraction(app, sansType);
  assert.equal(e.typeActe.valeur, 'INCONNU');
  app.fusionnerExtractionIa(e, 'parties', {
    typeActe: { valeur: 'PROMESSE_D_ACHAT', extrait: 'il a été convenu ce qui suit', extraitTrouve: true, extraitIndex: 22 }
  }, sansType);
  assert.equal(e.typeActe.valeur, 'PROMESSE_D_ACHAT');
  assert.equal(e.typeActe.statut, 'CONFIRMED');
});

test('un type d’acte contredit par le modèle est signalé, pas remplacé', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_COMPLET);
  assert.equal(e.typeActe.valeur, 'COMPROMIS_DE_VENTE');
  app.fusionnerExtractionIa(e, 'parties', {
    typeActe: { valeur: 'PROMESSE_D_ACHAT', extrait: 'COMPROMIS DE VENTE', extraitTrouve: true, extraitIndex: 0 }
  }, ACTE_COMPLET);
  assert.equal(e.typeActe.valeur, 'COMPROMIS_DE_VENTE');
  assert.equal(e.typeActe.statut, 'NEEDS_REVIEW');
  assert.match(e.typeActe.raison, /intervertis/);
});

test('des parties trouvées par le seul modèle recomposent le nom du dossier', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  assert.equal(e.parties.length, 0);
  app.fusionnerExtractionIa(e, 'parties', {
    parties: [
      { nom: 'DUPONT', qualiteActe: 'promettant', role: 'ACQUEREUR', qualitePersonne: 'physique', extrait: 'Les parties conviennent de ce qui suit', extraitTrouve: true, extraitIndex: 50 },
      { nom: 'MARTIN', qualiteActe: 'beneficiaire', role: 'VENDEUR', qualitePersonne: 'physique', extrait: 'Les parties conviennent', extraitTrouve: true, extraitIndex: 50 }
    ]
  }, ACTE_PAUVRE);
  // L'ordre du nom suit les RÔLES, pas l'ordre d'apparition : vendeur d'abord.
  assert.equal(e.champs.nom.valeur, 'MARTIN / DUPONT');
});

test('des notaires trouvés par le seul modèle déclenchent la règle métier 41/45/37', () => {
  // La règle n'est pas réimplémentée dans la fusion : determinerNotaires() est rejouée telle
  // quelle sur la liste issue du modèle.
  const app = chargerApplication();
  const texte = ACTE_PAUVRE + " Le bien est sis à 12 rue Victor Hugo, 41000 BLOIS.";
  const e = extraction(app, texte);
  assert.equal(e.notaires.instrumentaire, null);
  app.fusionnerExtractionIa(e, 'parties', {
    notaires: [
      { nom: 'Sophie GOSSART', office: 'Blois', cote: 'vendeur', roleExplicite: null, extrait: 'Les parties conviennent', extraitTrouve: true },
      { nom: 'Paul DURAND', office: 'Orléans', cote: 'acquereur', roleExplicite: 'instrumentaire', extrait: 'Les parties conviennent', extraitTrouve: true }
    ]
  }, texte);
  assert.equal(e.notaires.instrumentaire.nom, 'Paul DURAND'); // mention explicite, niveau 1
  assert.equal(e.notaires.roleEtude, 'participant');
});

test('l’adresse du bien déjà confirmée par les regex n’est pas remplacée', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_COMPLET);
  assert.equal(e.bien.adresse.commune, 'VENDÔME');
  app.fusionnerExtractionIa(e, 'bien', {
    adresse: { numero: '3', typeVoie: 'rue', nomVoie: 'des Lilas', codePostal: '41000', commune: 'BLOIS', extrait: 'demeurant 3 rue des Lilas', extraitTrouve: true }
  }, ACTE_COMPLET);
  assert.equal(e.bien.adresse.commune, 'VENDÔME'); // le modèle avait pris l'adresse du vendeur
});

test('une adresse du modèle sans code postal reste à vérifier, même citée correctement', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  app.fusionnerExtractionIa(e, 'bien', {
    adresse: { numero: '25', typeVoie: 'route', nomVoie: 'de Tours', commune: 'VENDÔME', extrait: 'Les parties conviennent de ce qui suit', extraitTrouve: true, extraitIndex: 50 }
  }, ACTE_PAUVRE);
  assert.equal(e.bien.adresse.statut, 'NEEDS_REVIEW');
  assert.equal(e.bien.adresse.departement, null);
});

test('la fusion recontrôle la cohérence de l’ensemble', () => {
  // Une valeur apportée par le modèle peut créer une incohérence qui n'existait pas après la
  // passe regex : les alertes doivent être recalculées, pas figées.
  const app = chargerApplication();
  const texte = ACTE_COMPLET;
  const e = extraction(app, texte);
  assert.equal(e.alertes.some(a => a.code === 'PRET_APRES_ACTE'), false);
  app.fusionnerExtractionIa(e, 'dates', {
    dates: [{ type: 'REITERATION_ACTE', dateExplicite: '2026-10-01', delai: null, extrait: 'DÉSIGNATION', extraitTrouve: true, extraitIndex: 200 }]
  }, texte);
  assert.equal(e.dates.REITERATION_ACTE.valeur, '2026-10-01');
  assert.ok(e.alertes.some(a => a.code === 'PRET_APRES_ACTE'));
});

test('le lot fusionné est marqué comme abouti', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  assert.equal(e.iaLots.bien, 'attente');
  app.fusionnerExtractionIa(e, 'bien', {}, ACTE_PAUVRE);
  assert.equal(e.iaLots.bien, 'ok');
  assert.equal(e.iaLots.dates, 'attente');
});
