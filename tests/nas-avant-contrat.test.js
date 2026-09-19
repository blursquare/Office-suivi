'use strict';

// Choix de l'avant-contrat parmi les PDF d'un dossier NAS relié (choisirAvantContratNas, section
// « dossier NAS » de script.js), utilisé par le bouton « Ouvrir le compromis » et par Outil 2 pour
// retrouver le compromis de référence. Le point qui compte : la rubrique « AAE » (Acte Authentique
// Électronique, sens confirmé par l'étude le 19/09/2026) est l'endroit où l'étude range l'acte reçu
// par notaire — c'est elle qui départage l'avant-contrat du dossier de celui de la VENTE PRÉALABLE
// de l'acquéreur, rangé ailleurs mais portant les mêmes mots « compromis »/« promesse ».
//
// Le chemin de chaque fichier vient de path.relative() côté serveur : antislashs sur un poste
// Windows, barres obliques ailleurs — les deux doivent être compris.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const AAE_PROMESSE = { nom: 'Copie AAE PROMESSE DE VENTE DUPONT MARTIN.pdf', chemin: '9 - AAE/Copie AAE PROMESSE DE VENTE DUPONT MARTIN.pdf' };
const COMPROMIS_VENTE_PREALABLE = { nom: 'Compromis vente prealable.pdf', chemin: '2 - Acquéreur/Compromis vente prealable.pdf' };
const TITRE = { nom: 'Titre.pdf', chemin: '3 - Titre de propriété/Titre.pdf' };
const OFFRE = { nom: 'Offre de pret.pdf', chemin: '0 - COMPTABILITE - PRET/PRET/Offre de pret.pdf' };

test('estDansRubriqueAAE ne regarde que les dossiers du chemin, jamais le nom du fichier', () => {
  const app = chargerApplication();
  assert.equal(app.estDansRubriqueAAE('9 - AAE/Copie promesse.pdf'), true);
  assert.equal(app.estDansRubriqueAAE('10 - AAE\\ETAT DATE\\acte.pdf'), true, 'antislashs Windows');
  assert.equal(app.estDansRubriqueAAE('Copie AAE promesse.pdf'), false, 'le nom seul ne fait pas une rubrique');
  assert.equal(app.estDansRubriqueAAE('2 - Acquéreur/Compromis.pdf'), false);
  assert.equal(app.estDansRubriqueAAE('8 - BAAE/x.pdf'), false, 'AAE doit être un mot entier');
  assert.equal(app.estDansRubriqueAAE(''), false);
});

test('le nom exact du PDF importé à la création l\'emporte sur tout', () => {
  const app = chargerApplication();
  const fichiers = [COMPROMIS_VENTE_PREALABLE, AAE_PROMESSE, TITRE];
  const choix = app.choisirAvantContratNas(fichiers, 'Compromis vente prealable.pdf');
  assert.equal(choix.methode, 'nom-exact');
  assert.equal(choix.fichier.chemin, COMPROMIS_VENTE_PREALABLE.chemin);
});

test('nom exact : underscores et accents tolérés, et le doublon sous AAE est préféré', () => {
  const app = chargerApplication();
  // Le même PDF scanné deux fois : une copie dans « Scans », l'autre rangée sous AAE. Le nom
  // importé s'écrit avec des underscores et sans accent, comme un outil de nommage le produit.
  const horsAAE = { nom: 'Promesse_DUPONT.pdf', chemin: 'Scans/Promesse_DUPONT.pdf' };
  const sousAAE = { nom: 'Promesse DUPONT.pdf', chemin: '9 - AAE\\Promesse DUPONT.pdf' };
  const choix = app.choisirAvantContratNas([horsAAE, sousAAE], 'Promesse_DUPONT.pdf');
  assert.equal(choix.methode, 'nom-exact');
  assert.equal(choix.fichier.chemin, sousAAE.chemin);
});

test('sans nom mémorisé, « compromis/promesse » sous AAE bat le même mot ailleurs', () => {
  const app = chargerApplication();
  // La vente préalable arrive AVANT dans la liste et dit « compromis » (priorité sur « promesse »
  // à rubrique égale) : seule la rubrique AAE peut faire gagner la promesse.
  const choix = app.choisirAvantContratNas([COMPROMIS_VENTE_PREALABLE, AAE_PROMESSE, TITRE], null);
  assert.equal(choix.methode, 'aae-nom');
  assert.equal(choix.fichier.chemin, AAE_PROMESSE.chemin);
});

test('un fichier nommé « AAE » hors rubrique compte comme AAE', () => {
  const app = chargerApplication();
  const aaeNom = { nom: 'Copie AAE compromis.pdf', chemin: 'Scans/Copie AAE compromis.pdf' };
  const choix = app.choisirAvantContratNas([COMPROMIS_VENTE_PREALABLE, aaeNom], null);
  assert.equal(choix.methode, 'aae-nom');
  assert.equal(choix.fichier.chemin, aaeNom.chemin);
});

test('sans rubrique AAE, « compromis » passe avant « promesse », puis le premier rencontré', () => {
  const app = chargerApplication();
  const promesse = { nom: 'Promesse signee.pdf', chemin: '1 - Vendeur/Promesse signee.pdf' };
  const choix = app.choisirAvantContratNas([promesse, COMPROMIS_VENTE_PREALABLE], null);
  assert.equal(choix.methode, 'nom');
  assert.equal(choix.fichier.chemin, COMPROMIS_VENTE_PREALABLE.chemin);
  const seulePromesse = app.choisirAvantContratNas([TITRE, promesse], null);
  assert.equal(seulePromesse.methode, 'nom');
  assert.equal(seulePromesse.fichier.chemin, promesse.chemin);
});

test('un seul PDF dans la rubrique AAE : c\'est lui, quel que soit son nom', () => {
  const app = chargerApplication();
  const acte = { nom: 'Acte 2024-118.pdf', chemin: '9 - AAE/Acte 2024-118.pdf' };
  const choix = app.choisirAvantContratNas([TITRE, OFFRE, acte], null);
  assert.equal(choix.methode, 'aae-seul');
  assert.equal(choix.fichier.chemin, acte.chemin);
});

test('plusieurs PDF sous AAE sans nom parlant : aucune proposition plutôt qu\'un choix arbitraire', () => {
  const app = chargerApplication();
  const a = { nom: 'Acte 1.pdf', chemin: '9 - AAE/Acte 1.pdf' };
  const b = { nom: 'Acte 2.pdf', chemin: '9 - AAE/Acte 2.pdf' };
  const choix = app.choisirAvantContratNas([a, b, TITRE], null);
  assert.equal(choix.fichier, null);
  assert.equal(choix.methode, null);
});

test('rien ne correspond : fichier null, méthode null, liste vide ou absente tolérée', () => {
  const app = chargerApplication();
  assert.equal(app.choisirAvantContratNas([TITRE, OFFRE], 'Compromis.pdf').fichier, null);
  assert.equal(app.choisirAvantContratNas([], null).fichier, null);
  assert.equal(app.choisirAvantContratNas(undefined, null).methode, null);
});

test('le nom attendu introuvable retombe sur la rubrique AAE et le signale par la méthode', () => {
  const app = chargerApplication();
  const choix = app.choisirAvantContratNas([COMPROMIS_VENTE_PREALABLE, AAE_PROMESSE], 'Compromis DUPONT.pdf');
  assert.equal(choix.methode, 'aae-nom', 'tout ce qui n\'est pas nom-exact est un repli');
  assert.equal(choix.fichier.chemin, AAE_PROMESSE.chemin);
});
