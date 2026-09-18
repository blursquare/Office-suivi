'use strict';

// Fusion des réponses du modèle IA local dans l'objet d'extraction (voir la section « EXTRACTION
// STRUCTURÉE : fusion des lots IA » dans script.js). RÈGLE CENTRALE, posée par l'étude après avoir
// vu des valeurs inventées par le modèle s'installer dans le formulaire sous l'étiquette
// « Confirmé » : une lecture du modèle n'écrit JAMAIS d'elle-même dans une donnée. Elle devient une
// PROPOSITION (champ.propositionIa), affichée dans le panneau de révision avec un bouton
// « Utiliser ». Les regex n'ont rien trouvé → proposition ; les deux convergent → origine
// « regex+ia » et rien de plus ; les deux divergent → la valeur des regex est conservée, le statut
// passe « à vérifier », celle du modèle reste en proposition ET en candidat.

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

test('une valeur trouvée par le seul modèle est PROPOSÉE, jamais écrite', () => {
  const app = chargerApplication();
  const texte = ACTE_PAUVRE + ' Le prix est fixé à deux cent mille euros.';
  const e = extraction(app, texte);
  assert.equal(e.champs.prixVente.valeur, null); // les regex ne lisent pas un prix en lettres seul

  app.fusionnerExtractionIa(e, 'bien', {
    prixVente: { valeur: 200000, extrait: 'Le prix est fixé à deux cent mille euros', extraitTrouve: true, extraitIndex: 96 }
  }, texte);
  assert.equal(e.champs.prixVente.valeur, null, 'le champ reste vide tant que personne n’a adopté la proposition');
  assert.equal(e.champs.prixVente.propositionIa.valeur, 200000);
  assert.equal(e.champs.prixVente.propositionIa.extraitTrouve, true);
});

test('une proposition dont l’extrait cité est introuvable est signalée comme telle', () => {
  // Le score de confiance d'un modèle 8B n'est calibré sur rien ; sa citation, elle, se vérifie
  // mécaniquement — c'est ce drapeau que le panneau affiche pour prévenir d'une invention.
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  app.fusionnerExtractionIa(e, 'bien', {
    prixVente: { valeur: 999000, extrait: 'une phrase que le modèle a inventée', extraitTrouve: false, extraitIndex: null }
  }, ACTE_PAUVRE);
  assert.equal(e.champs.prixVente.valeur, null);
  assert.equal(e.champs.prixVente.propositionIa.valeur, 999000);
  assert.equal(e.champs.prixVente.propositionIa.extraitTrouve, false);
});

test('une donnée déjà corrigée à la main n’est pas rouverte par le modèle', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_COMPLET);
  app.ecrireChampRevision(e, 'prixVente', 123000);
  app.fusionnerExtractionIa(e, 'bien', {
    prixVente: { valeur: 999000, extrait: 'DÉSIGNATION', extraitTrouve: true, extraitIndex: 200 }
  }, ACTE_COMPLET);
  assert.equal(e.champs.prixVente.valeur, 123000);
  assert.equal(e.champs.prixVente.propositionIa, null);
});

test('regex et modèle d’accord : origine regex+ia, aucune proposition à trancher', () => {
  const app = chargerApplication();
  const e = extraction(app, ACTE_COMPLET);
  assert.equal(e.dates.BUTOIR_PRET.valeur, '2026-11-15');
  app.fusionnerExtractionIa(e, 'dates', {
    dates: [{ type: 'BUTOIR_PRET', dateExplicite: '2026-11-15', delai: null, extrait: 'au plus tard le 15 novembre 2026', extraitTrouve: true, extraitIndex: 300 }]
  }, ACTE_COMPLET);
  assert.equal(e.dates.BUTOIR_PRET.valeur, '2026-11-15');
  assert.equal(e.dates.BUTOIR_PRET.origine, 'regex+ia');
  assert.equal(e.dates.BUTOIR_PRET.propositionIa, null);
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
  // Le calcul reste déterministe côté outil ; seul son résultat est PROPOSÉ, comme toute lecture
  // du modèle — la date ne s'écrit pas d'elle-même dans l'échéance.
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  assert.equal(e.dates.BUTOIR_PRET.valeur, null);
  app.fusionnerExtractionIa(e, 'dates', {
    dates: [{ type: 'BUTOIR_PRET', dateExplicite: null, delai: { valeur: 60, unite: 'jours', pointDepart: 'la signature des présentes' }, extrait: 'dans les 60 jours', extraitTrouve: true, extraitIndex: 10 }]
  }, ACTE_PAUVRE);
  assert.equal(e.dates.BUTOIR_PRET.propositionIa.valeur, '2026-11-14'); // 15/09/2026 + 60 jours
  assert.equal(e.dates.BUTOIR_PRET.valeur, null);
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
  assert.equal(e.dates.BUTOIR_PRET.propositionIa, undefined, 'rien à proposer non plus : la date serait une invention');
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
  // Proposé, pas appliqué : c'est le type d'acte qui décide du sens vendeur/acquéreur, se tromper
  // ici inverse les deux parties sur toute la fiche.
  assert.equal(e.typeActe.valeur, 'INCONNU');
  assert.equal(e.typeActe.propositionIa.valeur, 'PROMESSE_D_ACHAT');
});

test('une proposition adoptée par l’étude devient la valeur, marquée « manuel »', () => {
  const app = chargerApplication();
  const sansType = "Entre les soussignés, il a été convenu ce qui suit. Fait à Blois le 15 septembre 2026.";
  const e = extraction(app, sansType);
  app.fusionnerExtractionIa(e, 'parties', {
    typeActe: { valeur: 'PROMESSE_D_ACHAT', extrait: 'il a été convenu ce qui suit', extraitTrouve: true, extraitIndex: 22 }
  }, sansType);
  app.ecrireChampRevision(e, 'typeActe', e.typeActe.propositionIa.valeur);
  assert.equal(e.typeActe.valeur, 'PROMESSE_D_ACHAT');
  assert.equal(e.typeActe.origine, 'manuel');
  assert.equal(e.typeActe.verifie, true);
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
  assert.equal(e.typeActe.propositionIa.valeur, 'PROMESSE_D_ACHAT');
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
  // L'ordre du nom suit les RÔLES, pas l'ordre d'apparition : vendeur d'abord. Proposé seulement —
  // et les parties elles-mêmes sont marquées comme venant du modèle, pour que le panneau le dise.
  assert.equal(e.champs.nom.valeur, null);
  assert.equal(e.champs.nom.propositionIa.valeur, 'MARTIN / DUPONT');
  assert.equal(e.parties.every(p => p.origine === 'ia'), true);
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
  // Origine tracée : ce rôle ne doit JAMAIS pré-remplir le sélecteur du formulaire, qui masque la
  // checklist des pièces quand il vaut « participant » (voir appliquerExtractionAuFormulaire).
  assert.equal(e.notaires.origine, 'ia');
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

test('une adresse lue par le seul modèle est proposée, pas posée', () => {
  // Une adresse fausse fait dériver le département, donc la déduction du notaire instrumentaire,
  // donc le rôle de l'étude sur le dossier : c'est la donnée qu'il est le plus coûteux de croire.
  const app = chargerApplication();
  const e = extraction(app, ACTE_PAUVRE);
  app.fusionnerExtractionIa(e, 'bien', {
    adresse: { numero: '25', typeVoie: 'route', nomVoie: 'de Tours', commune: 'VENDÔME', extrait: 'Les parties conviennent de ce qui suit', extraitTrouve: true, extraitIndex: 50 }
  }, ACTE_PAUVRE);
  assert.ok(!e.bien.adresse.adresseComplete, 'aucune adresse posée par la seule lecture du modèle');
  assert.equal(e.bien.propositionIa.valeur, '25 route de Tours VENDÔME');
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
  // La proposition du modèle ne crée aucune incohérence tant qu'elle n'est pas adoptée…
  assert.equal(e.alertes.some(a => a.code === 'PRET_APRES_ACTE'), false);
  // …mais l'adopter recontrôle bien l'ensemble, les alertes ne sont pas figées.
  app.ecrireChampRevision(e, 'acte', e.dates.REITERATION_ACTE.propositionIa.valeur);
  e.alertes = app.controlerCoherence(e);
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
