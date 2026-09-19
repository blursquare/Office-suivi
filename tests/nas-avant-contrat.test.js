'use strict';

// Choix de l'avant-contrat parmi les PDF d'un dossier NAS relié (choisirAvantContratNas, section
// « dossier NAS » de script.js), utilisé par le bouton « Ouvrir le compromis » et par Outil 2 pour
// retrouver le compromis de référence. Le point qui compte, précisé par l'étude le 19/09/2026 :
// l'avant-contrat SIGNÉ est rangé à la RACINE du dossier client ou dans la rubrique « SRU » —
// jamais dans « AAE », qui contient les pièces réunies entre le compromis et la vente. C'est
// l'emplacement qui départage l'avant-contrat du dossier de celui de la VENTE PRÉALABLE de
// l'acquéreur, rangé dans sa rubrique mais portant les mêmes mots « compromis »/« promesse ».
//
// Le chemin de chaque fichier vient de path.relative() côté serveur : antislashs sur un poste
// Windows, barres obliques ailleurs — les deux doivent être compris.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const PROMESSE_RACINE = { nom: 'Copie AAE PROMESSE DE VENTE DUPONT MARTIN.pdf', chemin: 'Copie AAE PROMESSE DE VENTE DUPONT MARTIN.pdf' };
const COMPROMIS_SRU = { nom: 'Compromis DUPONT MARTIN signe.pdf', chemin: '8 - SRU/Compromis DUPONT MARTIN signe.pdf' };
const COMPROMIS_VENTE_PREALABLE = { nom: 'Compromis vente prealable.pdf', chemin: '2 - Acquéreur/Compromis vente prealable.pdf' };
const PIECE_AAE = { nom: 'Certificat urbanisme.pdf', chemin: '9 - AAE/Certificat urbanisme.pdf' };
const TITRE = { nom: 'Titre.pdf', chemin: '3 - Titre de propriété/Titre.pdf' };
const OFFRE = { nom: 'Offre de pret.pdf', chemin: '0 - COMPTABILITE - PRET/PRET/Offre de pret.pdf' };

test('estEmplacementAvantContrat : la racine et la rubrique SRU, rien d\'autre', () => {
  const app = chargerApplication();
  assert.equal(app.estEmplacementAvantContrat('Promesse.pdf'), true, 'racine');
  assert.equal(app.estEmplacementAvantContrat('8 - SRU/Promesse.pdf'), true, 'SRU, barres obliques');
  assert.equal(app.estEmplacementAvantContrat('9 - SRU\\Promesse.pdf'), true, 'SRU, antislashs Windows');
  assert.equal(app.estEmplacementAvantContrat('9 - AAE/Promesse.pdf'), false, 'AAE : les pièces, pas l\'acte');
  assert.equal(app.estEmplacementAvantContrat('2 - Acquéreur/Compromis.pdf'), false);
  assert.equal(app.estEmplacementAvantContrat('1 - SRUX/Promesse.pdf'), false, 'SRU doit être un mot entier');
  assert.equal(app.estEmplacementAvantContrat(''), false);
});

test('le nom exact du PDF importé à la création l\'emporte sur tout', () => {
  const app = chargerApplication();
  const fichiers = [PROMESSE_RACINE, COMPROMIS_VENTE_PREALABLE, TITRE];
  const choix = app.choisirAvantContratNas(fichiers, 'Compromis vente prealable.pdf');
  assert.equal(choix.methode, 'nom-exact');
  assert.equal(choix.fichier.chemin, COMPROMIS_VENTE_PREALABLE.chemin);
});

test('nom exact : underscores et accents tolérés, et le doublon à la racine ou sous SRU est préféré', () => {
  const app = chargerApplication();
  // Le même PDF scanné deux fois : une copie dans « Scans », l'autre sous SRU. Le nom importé
  // s'écrit avec des underscores et sans accent, comme un outil de nommage le produit.
  const ailleurs = { nom: 'Promesse_DUPONT.pdf', chemin: 'Scans/Promesse_DUPONT.pdf' };
  const sousSRU = { nom: 'Promesse DUPONT.pdf', chemin: '8 - SRU\\Promesse DUPONT.pdf' };
  const choix = app.choisirAvantContratNas([ailleurs, sousSRU], 'Promesse_DUPONT.pdf');
  assert.equal(choix.methode, 'nom-exact');
  assert.equal(choix.fichier.chemin, sousSRU.chemin);
});

test('sans nom mémorisé, « compromis/promesse » à la racine ou sous SRU bat le même mot ailleurs', () => {
  const app = chargerApplication();
  // La vente préalable arrive AVANT dans la liste et dit « compromis » (priorité sur « promesse »
  // à emplacement égal) : seul l'emplacement peut faire gagner la promesse de la racine.
  const choix = app.choisirAvantContratNas([COMPROMIS_VENTE_PREALABLE, PROMESSE_RACINE, TITRE], null);
  assert.equal(choix.methode, 'emplacement-nom');
  assert.equal(choix.fichier.chemin, PROMESSE_RACINE.chemin);
  const choixSRU = app.choisirAvantContratNas([COMPROMIS_VENTE_PREALABLE, COMPROMIS_SRU], null);
  assert.equal(choixSRU.methode, 'emplacement-nom');
  assert.equal(choixSRU.fichier.chemin, COMPROMIS_SRU.chemin);
});

test('un « compromis » rangé sous AAE ne l\'emporte jamais sur un autre à la racine', () => {
  const app = chargerApplication();
  const sousAAE = { nom: 'Compromis DUPONT.pdf', chemin: '9 - AAE/Compromis DUPONT.pdf' };
  const choix = app.choisirAvantContratNas([sousAAE, COMPROMIS_SRU], null);
  assert.equal(choix.fichier.chemin, COMPROMIS_SRU.chemin);
});

test('ni racine ni SRU : « compromis » passe avant « promesse », puis le premier rencontré', () => {
  const app = chargerApplication();
  const promesse = { nom: 'Promesse signee.pdf', chemin: '1 - Vendeur/Promesse signee.pdf' };
  const choix = app.choisirAvantContratNas([promesse, COMPROMIS_VENTE_PREALABLE], null);
  assert.equal(choix.methode, 'nom');
  assert.equal(choix.fichier.chemin, COMPROMIS_VENTE_PREALABLE.chemin);
  const seulePromesse = app.choisirAvantContratNas([TITRE, promesse], null);
  assert.equal(seulePromesse.methode, 'nom');
  assert.equal(seulePromesse.fichier.chemin, promesse.chemin);
});

test('un seul PDF dans la rubrique SRU : c\'est lui, quel que soit son nom', () => {
  const app = chargerApplication();
  const acte = { nom: 'Acte 2024-118.pdf', chemin: '8 - SRU/Acte 2024-118.pdf' };
  const choix = app.choisirAvantContratNas([TITRE, OFFRE, PIECE_AAE, acte], null);
  assert.equal(choix.methode, 'sru-seul');
  assert.equal(choix.fichier.chemin, acte.chemin);
});

test('plusieurs PDF sous SRU sans nom parlant, ou seulement des PDF à la racine : aucune proposition', () => {
  const app = chargerApplication();
  const a = { nom: 'Notification 1.pdf', chemin: '8 - SRU/Notification 1.pdf' };
  const b = { nom: 'Notification 2.pdf', chemin: '8 - SRU/Notification 2.pdf' };
  assert.equal(app.choisirAvantContratNas([a, b, TITRE], null).fichier, null, 'deux PDF sous SRU');
  const racine = { nom: 'Courrier.pdf', chemin: 'Courrier.pdf' };
  assert.equal(app.choisirAvantContratNas([racine, TITRE], null).fichier, null, 'la racine seule ne suffit pas');
});

test('rien ne correspond : fichier null, méthode null, liste vide ou absente tolérée', () => {
  const app = chargerApplication();
  assert.equal(app.choisirAvantContratNas([TITRE, OFFRE, PIECE_AAE], 'Compromis.pdf').fichier, null);
  assert.equal(app.choisirAvantContratNas([], null).fichier, null);
  assert.equal(app.choisirAvantContratNas(undefined, null).methode, null);
});

test('le nom attendu introuvable retombe sur l\'emplacement et le signale par la méthode', () => {
  const app = chargerApplication();
  const choix = app.choisirAvantContratNas([COMPROMIS_VENTE_PREALABLE, PROMESSE_RACINE], 'Compromis DUPONT.pdf');
  assert.equal(choix.methode, 'emplacement-nom', 'tout ce qui n\'est pas nom-exact est un repli');
  assert.equal(choix.fichier.chemin, PROMESSE_RACINE.chemin);
});
