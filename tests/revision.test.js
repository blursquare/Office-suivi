'use strict';

// Panneau « Ce que l'outil a compris » (voir la section PANNEAU DE RÉVISION dans script.js).
//
// Ces tests fixent la règle que l'étude a posée après avoir constaté que des valeurs fausses —
// dont des termes inventés par le modèle local — s'affichaient sous l'étiquette « Confirmé » :
// l'outil ne confirme JAMAIS rien de lui-même, il dit seulement d'où vient la donnée, et le vert
// est réservé à ce qu'un humain a relu ou saisi.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const ACTE = `COMPROMIS DE VENTE
LE VENDEUR : Monsieur Jean DUPONT, demeurant 3 rue des Lilas, 41000 BLOIS.
Ci-après dénommé le vendeur.
L'ACQUÉREUR : Monsieur Pierre MARTIN, demeurant 8 rue Neuve, 37000 TOURS.
Ci-après dénommé l'acquéreur.
DÉSIGNATION
Une maison d'habitation sise à 25 route de Tours, 41100 VENDÔME.
La vente est consentie moyennant le prix de DEUX CENT MILLE EUROS (200 000 €).
L'acquéreur devra obtenir son financement au plus tard le 15 novembre 2026.
Le présent compromis est signé le 15 septembre 2026.`;

// ---- vocabulaire d'origine ----

test('aucune origine ne donne le vert du seul fait qu’une valeur existe', () => {
  const app = chargerApplication();
  // C'était exactement le défaut signalé : champExtraction() posait CONFIRMED dès qu'une regex
  // renvoyait quelque chose, sans qu'aucun contrôle n'ait eu lieu.
  const lu = app.origineRevision({ valeur: 'DUPONT / MARTIN', statut: 'CONFIRMED', origine: 'regex' });
  assert.equal(lu.texte, 'Lue dans l’acte');
  assert.notEqual(lu.dl, 'dl-success');
});

test('le vert est réservé à une relecture humaine ou à une saisie manuelle', () => {
  const app = chargerApplication();
  assert.equal(app.origineRevision({ valeur: 'x', statut: 'CONFIRMED', origine: 'regex', verifie: true }).dl, 'dl-success');
  assert.equal(app.origineRevision({ valeur: 'x', statut: 'CONFIRMED', origine: 'manuel' }).dl, 'dl-success');
});

test('une correction manuelle prime sur tout le reste, même « à vérifier »', () => {
  const app = chargerApplication();
  const o = app.origineRevision({ valeur: 'x', statut: 'NEEDS_REVIEW', origine: 'manuel' });
  assert.equal(o.texte, 'Saisie à la main');
});

test('les autres origines sont distinctes et jamais vertes', () => {
  const app = chargerApplication();
  const t = (champ) => app.origineRevision(champ).texte;
  assert.equal(t(null), 'Non trouvée');
  assert.equal(t({ valeur: null, statut: 'NOT_FOUND', origine: 'regex' }), 'Non trouvée');
  assert.equal(t({ valeur: '2026-11-14', statut: 'CONFIRMED', origine: 'regex', methode: 'CALCULATED' }), 'Calculée depuis un délai');
  assert.equal(t({ valeur: 'x', statut: 'NEEDS_REVIEW', origine: 'regex' }), 'Plusieurs valeurs possibles');
  assert.equal(t({ valeur: 'x', statut: 'CONFIRMED', origine: 'regex+ia' }), 'Lue dans l’acte, même lecture par l’IA');
  const toutes = ['Non trouvée', 'Calculée depuis un délai', 'Plusieurs valeurs possibles', 'Lue dans l’acte, même lecture par l’IA'];
  assert.equal(toutes.filter(x => app.origineRevision({ valeur: 'x', statut: 'CONFIRMED', origine: 'regex' }).texte === x).length, 0);
});

test('« Appris » reste une origine à part entière', () => {
  // L'étude tient à cette notion : elle dit que la classification vient d'une correction qu'elle a
  // faite elle-même sur une clause très proche, pas d'une lecture du texte.
  const app = chargerApplication();
  const o = app.origineRevision({ valeur: '2026-11-15', statut: 'CONFIRMED', origine: 'regex', apprise: true });
  assert.equal(o.texte, 'Appris d’une correction précédente');
  assert.equal(o.icone, 'sparkle');
});

// ---- toutes les données sont accessibles et modifiables ----

test('chaque donnée du panneau est lisible et pilote un champ du formulaire ou rien', () => {
  const app = chargerApplication();
  const e = app.construireExtractionRegex(ACTE, '2026-09-15');
  const cles = app.CHAMPS_REVISION.map(c => c.cle).join(',');
  assert.equal(cles, 'typeActe,nom,signature,pret,acte,ventebien,adresseBien,prixVente,emailAcquereur,roleNotaire');
  for (const definition of app.CHAMPS_REVISION) {
    // champRevision doit savoir résoudre CHAQUE clé déclarée : une entrée de la table sans
    // résolution afficherait une ligne morte, impossible à corriger.
    assert.doesNotThrow(() => app.champRevision(e, definition.cle), definition.cle);
  }
});

test('corriger une donnée la marque « saisie à la main » et vérifiée', () => {
  const app = chargerApplication();
  const e = app.construireExtractionRegex(ACTE, '2026-09-15');
  app.ecrireChampRevision(e, 'nom', 'DUPONT / MARTIN');
  const champ = app.champRevision(e, 'nom');
  assert.equal(champ.valeur, 'DUPONT / MARTIN');
  assert.equal(champ.origine, 'manuel');
  assert.equal(champ.verifie, true);
  assert.equal(app.origineRevision(champ).dl, 'dl-success');
});

test('une donnée « à vérifier » reste corrigeable : le statut n’est pas un verrou', () => {
  // Demande explicite de l'étude : pouvoir modifier après coup « même si c'est à vérifier ou
  // confirmé ». Rien dans ecrireChampRevision ne doit dépendre du statut d'origine.
  const app = chargerApplication();
  const e = app.construireExtractionRegex(ACTE, '2026-09-15');
  e.dates.BUTOIR_PRET.statut = 'NEEDS_REVIEW';
  app.ecrireChampRevision(e, 'pret', '2026-12-31');
  assert.equal(e.dates.BUTOIR_PRET.valeur, '2026-12-31');
  assert.equal(e.dates.BUTOIR_PRET.statut, 'CONFIRMED');
  assert.equal(e.dates.BUTOIR_PRET.candidats.length, 0);
});

test('vider une donnée la ramène à « non trouvée » sans casser l’objet', () => {
  const app = chargerApplication();
  const e = app.construireExtractionRegex(ACTE, '2026-09-15');
  app.ecrireChampRevision(e, 'prixVente', '');
  assert.equal(e.champs.prixVente.valeur, null);
  assert.equal(e.champs.prixVente.statut, 'NOT_FOUND');
});

test('l’adresse et le rôle de l’étude, qui n’ont pas la forme d’un champ, s’écrivent aussi', () => {
  const app = chargerApplication();
  const e = app.construireExtractionRegex(ACTE, '2026-09-15');
  app.ecrireChampRevision(e, 'adresseBien', '25 route de Tours 41100 VENDÔME');
  assert.equal(e.bien.adresse.adresseComplete, '25 route de Tours 41100 VENDÔME');
  assert.equal(app.champRevision(e, 'adresseBien').valeur, '25 route de Tours 41100 VENDÔME');
  app.ecrireChampRevision(e, 'roleNotaire', 'participant');
  assert.equal(e.notaires.roleEtude, 'participant');
  assert.equal(app.champRevision(e, 'roleNotaire').origine, 'manuel');
});

// ---- références de page ----

test('chaque donnée extraite sait où elle a été lue dans le document', () => {
  // Défaut signalé : « il ne met pas les références pour aller directement à la page ».
  // construireExtractionRegex appelait champExtraction() sans source pour ces trois données, donc
  // le panneau n'affichait jamais de bouton « p.X » en face d'elles.
  const app = chargerApplication();
  const e = app.construireExtractionRegex(ACTE, '2026-09-15');
  assert.ok(e.champs.nom.source, 'le nom du dossier doit être situé dans le texte');
  assert.ok(e.champs.nom.source.extrait.includes('DUPONT'));
  assert.ok(e.champs.prixVente.source, 'le prix doit être situé dans le texte');
  assert.ok(e.bien.source, 'l’adresse du bien doit être située dans le texte');
});

test('une valeur composée est cherchée sous la forme où elle figure réellement dans l’acte', () => {
  const app = chargerApplication();
  // Un nom de dossier est une composition « VENDEURS / ACQUÉREURS » : chercher la chaîne entière
  // ne donnerait jamais rien, c'est le premier patronyme qui figure dans le texte.
  assert.equal(app.aiguillesPourValeur('nom', 'DUPONT & LEROY / MARTIN').join('|'), 'DUPONT|MARTIN');
  // Un prix s'écrit avec des séparateurs de milliers dans l'acte, pas en chiffres collés.
  assert.ok(app.aiguillesPourValeur('prixVente', 200000).includes('200 000'));
});

test('une valeur absente du texte ne produit aucune fausse référence', () => {
  const app = chargerApplication();
  assert.equal(app.sourcePourValeur(ACTE, 'nom', 'INTROUVABLE / NULLEPART'), null);
  assert.equal(app.localiserValeur(ACTE, 'ab'), -1, 'une aiguille trop courte ne doit rien ancrer');
});
