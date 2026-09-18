'use strict';

// Type d'acte et qualités des parties (voir la section « EXTRACTION STRUCTURÉE : type d'acte et
// qualités des parties » dans script.js). Le point central : la même qualité ne désigne pas la même
// partie d'un acte à l'autre — dans une promesse d'ACHAT, le promettant est l'ACQUÉREUR. Jusqu'à
// cette refonte, « promettant » était traité comme un simple synonyme de « vendeur », ce qui
// intervertissait silencieusement les deux parties sur ce type d'acte.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const COMPROMIS = `COMPROMIS DE VENTE
Entre les soussignés :
LE VENDEUR : Monsieur Jean DUPONT né le 12 mars 1960 à Blois, demeurant 3 rue des Lilas à Blois.
Ci-après dénommé le vendeur.
L'ACQUÉREUR : Monsieur Pierre MARTIN né le 5 juillet 1985 à Tours, demeurant 8 rue Neuve à Tours.
Ci-après dénommé l'acquéreur.
Le présent compromis de vente porte sur le bien ci-après désigné.`;

const PROMESSE_VENTE = `PROMESSE UNILATÉRALE DE VENTE
Monsieur Jean DUPONT né le 12 mars 1960 à Blois, ci-après dénommé LE PROMETTANT.
Monsieur Pierre MARTIN né le 5 juillet 1985 à Tours, ci-après dénommé LE BÉNÉFICIAIRE.
La présente promesse de vente est consentie pour une durée de trois mois.`;

const PROMESSE_ACHAT = `PROMESSE UNILATÉRALE D'ACHAT
Monsieur Pierre MARTIN né le 5 juillet 1985 à Tours, ci-après dénommé LE PROMETTANT.
Monsieur Jean DUPONT né le 12 mars 1960 à Blois, ci-après dénommé LE BÉNÉFICIAIRE.
La présente promesse d'achat engage le promettant à acquérir le bien désigné.`;

test('detecterTypeActe reconnaît un compromis de vente', () => {
  const app = chargerApplication();
  const t = app.detecterTypeActe(COMPROMIS);
  assert.equal(t.valeur, 'COMPROMIS_DE_VENTE');
  assert.equal(t.statut, 'CONFIRMED');
  assert.ok(t.source && t.source.extrait.length > 0);
});

test('detecterTypeActe distingue une promesse de vente d’une promesse d’achat', () => {
  const app = chargerApplication();
  assert.equal(app.detecterTypeActe(PROMESSE_VENTE).valeur, 'PROMESSE_DE_VENTE');
  assert.equal(app.detecterTypeActe(PROMESSE_ACHAT).valeur, 'PROMESSE_D_ACHAT');
});

test('detecterTypeActe reste INCONNU plutôt que de deviner sur un texte sans mention', () => {
  const app = chargerApplication();
  const t = app.detecterTypeActe('Le bien est situé 12 rue Victor Hugo à Blois.');
  assert.equal(t.valeur, 'INCONNU');
  assert.equal(t.statut, 'NOT_FOUND');
});

test('roleDepuisQualite inverse promettant et bénéficiaire pour une promesse d’achat', () => {
  const app = chargerApplication();
  assert.equal(app.roleDepuisQualite('PROMESSE_DE_VENTE', 'promettant'), 'VENDEUR');
  assert.equal(app.roleDepuisQualite('PROMESSE_DE_VENTE', 'beneficiaire'), 'ACQUEREUR');
  assert.equal(app.roleDepuisQualite('PROMESSE_D_ACHAT', 'promettant'), 'ACQUEREUR');
  assert.equal(app.roleDepuisQualite('PROMESSE_D_ACHAT', 'beneficiaire'), 'VENDEUR');
  // Sans type d'acte établi, on conserve la convention historique de l'outil.
  assert.equal(app.roleDepuisQualite('INCONNU', 'promettant'), 'VENDEUR');
});

test('detecterParties attribue les rôles selon le type d’acte, promesse d’achat comprise', () => {
  const app = chargerApplication();
  const parties = app.detecterParties(PROMESSE_ACHAT, 'PROMESSE_D_ACHAT');
  const promettant = parties.find(p => p.qualiteActe === 'promettant');
  const beneficiaire = parties.find(p => p.qualiteActe === 'beneficiaire');
  assert.equal(promettant.nom, 'MARTIN');
  assert.equal(promettant.role, 'ACQUEREUR');
  assert.equal(beneficiaire.nom, 'DUPONT');
  assert.equal(beneficiaire.role, 'VENDEUR');
});

test('detecterNomDossier garde le format VENDEUR / ACQUÉREUR sur les trois types d’acte', () => {
  // Le vendeur est DUPONT et l'acquéreur MARTIN dans les trois textes, quelle que soit la qualité
  // sous laquelle chacun est présenté : le nom du dossier doit être identique.
  const app = chargerApplication();
  assert.equal(app.detecterNomDossier(COMPROMIS), 'DUPONT / MARTIN');
  assert.equal(app.detecterNomDossier(PROMESSE_VENTE), 'DUPONT / MARTIN');
  assert.equal(app.detecterNomDossier(PROMESSE_ACHAT), 'DUPONT / MARTIN');
});

test('detecterNomDossier n’est plus trompé par l’apostrophe de « L’ACQUÉREUR »', () => {
  // Régression signalée par l'étude (« les noms de dossier ne vont pas » sur certains compromis) :
  // l'apostrophe d'élision passait pour un guillemet ouvrant, le nom était donc cherché EN ARRIÈRE
  // et c'est celui du vendeur, présenté juste au-dessus, qui remontait des deux côtés.
  const app = chargerApplication();
  const nom = app.detecterNomDossier(COMPROMIS);
  assert.notEqual(nom, 'DUPONT / DUPONT');
  assert.equal(nom, 'DUPONT / MARTIN');
});

test('detecterParties conserve plusieurs vendeurs', () => {
  const app = chargerApplication();
  const texte = `COMPROMIS DE VENTE
LE VENDEUR : Monsieur Jean DUPONT né le 12 mars 1960 à Blois et Madame Claire LEROY née le 3 avril 1962 à Tours.
Ci-après dénommés les vendeurs.
L'ACQUÉREUR : Monsieur Pierre MARTIN né le 5 juillet 1985 à Tours.
Ci-après dénommé l'acquéreur.`;
  const vendeurs = app.detecterParties(texte, 'COMPROMIS_DE_VENTE').filter(p => p.role === 'VENDEUR');
  // Comparaison sur une chaîne : les tableaux viennent du contexte vm du harnais de test, leur
  // prototype n'est pas celui du realm de Node et deepEqual les refuse (voir load-app.js).
  assert.equal(vendeurs.map(p => p.nom).join(' & '), 'DUPONT & LEROY');
  assert.equal(app.detecterNomDossier(texte), 'DUPONT & LEROY / MARTIN');
});

test('detecterParties reconnaît une personne morale et son représentant', () => {
  const app = chargerApplication();
  const texte = `COMPROMIS DE VENTE
LE VENDEUR : la SCI LES TILLEULS, au capital de 1000 euros, représentée par Monsieur Jean DUPONT, en qualité de gérant.
Ci-après dénommée le vendeur.
L'ACQUÉREUR : Monsieur Pierre MARTIN né le 5 juillet 1985 à Tours.
Ci-après dénommé l'acquéreur.`;
  const vendeur = app.detecterParties(texte, 'COMPROMIS_DE_VENTE').find(p => p.role === 'VENDEUR');
  assert.equal(vendeur.qualitePersonne, 'morale');
  assert.equal(vendeur.nom, 'SCI LES TILLEULS');
  assert.equal(vendeur.representant, 'Jean DUPONT');
});

test('detecterEmailAcquereur suit le rôle et non le mot « bénéficiaire »', () => {
  // Sur une promesse d'achat, le bénéficiaire est le VENDEUR : s'ancrer sur ce mot remplirait le
  // champ « email de l'acquéreur » avec l'adresse du vendeur, et adresserait les relances de prêt
  // à la mauvaise partie.
  const app = chargerApplication();
  const texte = `PROMESSE UNILATÉRALE D'ACHAT
Monsieur Pierre MARTIN, joignable à pierre.martin@exemple.fr, ci-après dénommé LE PROMETTANT.
Monsieur Jean DUPONT, joignable à jean.dupont@exemple.fr, ci-après dénommé LE BÉNÉFICIAIRE.
La présente promesse d'achat engage le promettant.`;
  assert.equal(app.detecterEmailAcquereur(texte, 'PROMESSE_D_ACHAT'), 'pierre.martin@exemple.fr');
});

// Style « étiquette finale » avec une ADRESSE avant l'étiquette — la rédaction la plus répandue
// dans les compromis réels, et le bug le plus visible qu'ait connu l'outil : le nom était cherché
// comme « le dernier mot en capitales avant l'étiquette », or une présentation de partie se
// termine par son adresse, dont la commune est en capitales. Tous les dossiers créés depuis un
// acte de ce style ressortaient donc nommés d'après des COMMUNES (« BLOIS / TOURS » au lieu de
// « DUPONT / MARTIN »). Signalé par l'étude (« contrôle le nouveau système d'ajout de dossier,
// rien ne va »), reproduit en rejouant traiterTexte() dans un vrai navigateur.
const ETIQUETTE_FINALE_AVEC_ADRESSE = `COMPROMIS DE VENTE

ENTRE LES SOUSSIGNES :

Monsieur Jean DUPONT, né le 3 mars 1970 à BLOIS, demeurant à 5 rue des Lilas 41000 BLOIS,
ci-après dénommé LE VENDEUR, d'une part,

ET :

Madame Claire MARTIN, née le 12 juin 1985 à TOURS, demeurant à 8 avenue Victor Hugo 37000 TOURS,
ci-après dénommée L'ACQUEREUR, d'autre part.`;

test('detecterNomDossier : le patronyme l\'emporte sur la commune de l\'adresse qui le suit', () => {
  const app = chargerApplication();
  assert.equal(app.detecterNomDossier(ETIQUETTE_FINALE_AVEC_ADRESSE), 'DUPONT / MARTIN');
});

test('detecterParties : chaque partie garde son patronyme, pas sa ville', () => {
  const app = chargerApplication();
  const parties = app.detecterParties(ETIQUETTE_FINALE_AVEC_ADRESSE, 'COMPROMIS_DE_VENTE');
  assert.equal(parties.map((p) => p.nom + ':' + p.role).join(' | '),
    'DUPONT:VENDEUR | MARTIN:ACQUEREUR');
});

// Un couple vendeur : les deux civilités de la fenêtre doivent être relevées, comme le fait déjà
// le style « en-tête » — sans quoi seul l'un des deux noms serait retenu.
test('detecterParties : deux civilités avant l\'étiquette donnent les deux noms', () => {
  const app = chargerApplication();
  const texte = `COMPROMIS DE VENTE
Monsieur Paul LEROY, né le 1 janvier 1960 à Blois, et Madame Anne BERTRAND, née le 2 février 1962 à Tours,
demeurant ensemble 7 rue Haute 41000 BLOIS, ci-après dénommés LES VENDEURS.
Monsieur Marc PETIT, né le 3 mars 1980 à Tours, demeurant 9 rue Basse 37000 TOURS,
ci-après dénommé L'ACQUEREUR.`;
  const noms = app.detecterParties(texte, 'COMPROMIS_DE_VENTE').map((p) => p.nom).join(',');
  assert.equal(noms, 'LEROY,BERTRAND,PETIT');
});

// Acte AUTHENTIQUE (promesse reçue par notaire) : sa première page est la comparution des notaires,
// qui se désignent EUX-MÊMES par la partie qu'ils assistent. Sur une vraie promesse de l'étude, le
// nom du dossier ressortait « GOSSART / RECU » — le nom du notaire, et le verbe de « A RECU le
// présent acte » — au lieu des parties. Reproduit ici avec des noms inventés, structure identique.
const ACTE_AUTHENTIQUE = `10740101
BA/KC/

Maître Barbara DUVAL , Notaire à CHATEAUDUN (Eure-et-Loir – 28200), 68, Rue de la
République, soussignée, identifié sous le numéro CRPCEN 28038,

Notaire assistant le PROMETTANT,

Avec le concours à distance, en son office notarial, de Maître Sophie GOSSART, notaire à
BLOIS (41000), identifié sous le numéro CRPCEN 41089, assistant le BENEFICIAIRE,

A RECU le présent acte contenant PROMESSE DE VENTE à la requête de :

PROMETTANT
Monsieur Jean-Loup André Roger  LEMERCIER, enseignant, et Madame Yvette Marie Annie
FONTANEL, retraitée, demeurant ensemble à CHATEAUDUN (28200) 6 rue de Chaulnes.
Monsieur est né à BUZANCAIS (36500) le 12 mai 1966,
Madame est née à VALREAS (84600) le 19 septembre 1961.
Mariés à la mairie de RICHERENCHES (84600) le 31 juillet 1999 sous le régime de la
participation aux acquêts.

BENEFICIAIRE
Monsieur Sébastien ROUVIERE, directeur, demeurant à MARIGNY-LES-USAGES (45760) 255 rue
de Villevert.
Né à VILLENEUVE-SAINT-GEORGES (94190) le 30 juin 1976.
Divorcé de Madame Ana DA SILVA MARTINHO suivant jugement rendu par le tribunal judiciaire
de BLOIS (41000) le 3 juillet 2007, et non remarié.

Madame Julie Monique Corinne  BERTAUD, entrepreneur, demeurant à MARIGNY-LES-USAGES
(45760) 255 rue de Villevert.
Née à ORLEANS (45000) le 6 avril 1979.

QUOTITES VENDUES
Monsieur Jean-Loup LEMERCIER et Madame Yvette FONTANEL vendent la pleine propriété.`;

test('la comparution des notaires ne fournit jamais le nom d’une partie', () => {
  const app = chargerApplication();
  const noms = app.detecterParties(ACTE_AUTHENTIQUE, 'PROMESSE_DE_VENTE').map(p => p.nom);
  assert.equal(noms.includes('GOSSART'), false);
  assert.equal(noms.includes('DUVAL'), false);
  assert.equal(noms.includes('RECU'), false);
});

test('le patronyme est lu même quand « né(e) » ne le suit pas (état civil en deux temps)', () => {
  const app = chargerApplication();
  assert.equal(app.detecterNomDossier(ACTE_AUTHENTIQUE), 'LEMERCIER & FONTANEL / ROUVIERE & BERTAUD');
});

test('ni une commune ni un ex-conjoint ne passent pour une partie', () => {
  const app = chargerApplication();
  const noms = app.detecterParties(ACTE_AUTHENTIQUE, 'PROMESSE_DE_VENTE').map(p => p.nom).join(',');
  // Lieux de naissance, de mariage et de domicile — tous en majuscules dans cette trame.
  for (const lieu of ['BUZANCAIS', 'VALREAS', 'RICHERENCHES', 'CHATEAUDUN', 'MARIGNY-LES-USAGES', 'ORLEANS']) {
    assert.equal(noms.includes(lieu), false, lieu);
  }
  assert.equal(noms.includes('DA SILVA MARTINHO'), false);
});

test('le bloc d’une partie ne déborde pas sur la clause qui renomme l’autre', () => {
  // « QUOTITES VENDUES : Monsieur LEMERCIER et Madame FONTANEL vendent… » tombe dans les 1200
  // caractères du bloc du bénéficiaire : ces deux noms ne doivent pas lui être attribués.
  const app = chargerApplication();
  const acquereurs = app.detecterParties(ACTE_AUTHENTIQUE, 'PROMESSE_DE_VENTE')
    .filter(p => p.role === 'ACQUEREUR').map(p => p.nom).join(',');
  assert.equal(acquereurs, 'ROUVIERE,BERTAUD');
});

// ---------------------------------------------------------------------------------------------
// Trois défauts de nommage trouvés par le banc d'essai sur les actes réels de l'étude. Structure
// des trames reproduite à l'identique, noms INVENTÉS — aucune donnée client dans le dépôt.
// ---------------------------------------------------------------------------------------------

test('un patronyme à particule est un nom valide (DE SOUSA, LE GOFF, DU PONT)', () => {
  // Les particules figuraient dans la liste stricte des mots exclus : tout patronyme composé était
  // rejeté. Un acte du corpus n'avait ainsi qu'UNE seule partie, son bénéficiaire étant introuvable.
  const app = chargerApplication();
  assert.equal(app.estNomValide('DE SOUSA MARTINS'), true);
  assert.equal(app.estNomValide('LE GOFF'), true);
  assert.equal(app.estNomValide('DE LA TOUR'), true);
  // Une particule seule, en revanche, n'est pas un nom — et « ET » reste exclu, un patronyme n'en
  // contient jamais alors qu'une capture « DUPONT ET MARTIN » est un risque réel.
  assert.equal(app.estNomValide('DE'), false);
  assert.equal(app.estNomValide('LES'), false);
  assert.equal(app.estNomValide('DUPONT ET MARTIN'), false);
});

test('un mot structurel ou un nombre écrit en lettres n’est jamais un nom de partie', () => {
  // « ENSEMBLE D'UNE PART » suit l'étiquette de rôle dans certaines trames ; et la date en toutes
  // lettres de l'en-tête d'un acte authentique se glisse entre deux paragraphes à la coupure de
  // page, en plein milieu de la présentation d'une partie.
  const app = chargerApplication();
  assert.equal(app.estNomValide('ENSEMBLE'), false);
  assert.equal(app.estNomValide('AN DEUX MILLE VINGT-TROIS'), false);
  assert.equal(app.estNomValide('DUPONT'), true);
});

test('l’étiquette de rôle est reconnue dans les deux ordres de mots', () => {
  // « Dénommés ci-après le PROMETTANT » est aussi courant que « ci-après dénommés le PROMETTANT ».
  const app = chargerApplication();
  const texte = [
    'A reçu le présent acte authentique contenant Promesse unilatérale de vente à la requête de :',
    'Monsieur Chris, Martin LEMERCIER, cadre, et Madame Laëtitia, Laure VANTOUR, gestionnaire,',
    'ayant conclu ensemble un pacte civil de solidarité et demeurant ensemble à BLOIS (41000),',
    '510 rue Pitouille.',
    'Nés savoir :',
    '- Monsieur à BLOIS (41000), le 6 mai 1979.',
    '- Madame à BLOIS (41000), le 30 septembre 1980.',
    'AGISSANT SOLIDAIREMENT',
    'Dénommés ci-après le PROMETTANT',
    "ENSEMBLE D'UNE PART",
    '1°) Monsieur Julien, Raymond ROUVIERE, ingénieur, célibataire majeur,',
    'demeurant à VALENCISSE (41190), 3 Clos d’Andillon.',
    'Né à BLOIS (41000), le 2 février 1984.',
    '2°) Monsieur Héléna, Yolande BERTAUD, responsable, célibataire majeur,',
    'demeurant à VALENCISSE (41190), 3 Clos d’Andillon.',
    'Né à SAINT CALAIS (72120), le 13 octobre 1985.',
    'AGISSANT SOLIDAIREMENT',
    'Dénommés ci-après le BENEFICIAIRE',
    "ENSEMBLE D'AUTRE PART"
  ].join('\n');
  assert.equal(app.detecterNomDossier(texte), 'LEMERCIER & VANTOUR / ROUVIERE & BERTAUD');
});

test('la comparution des notaires ne fournit jamais le nom d’une partie', () => {
  // Le notaire en concours NOMME les parties qu'il assiste : sans borner la fenêtre de recherche
  // au début annoncé de la présentation (« à la requête de : »), ces noms-là remontaient pour la
  // mauvaise partie.
  const app = chargerApplication();
  const texte = [
    "L'AN DEUX MILLE VINGT-TROIS",
    'LE VINGT-TROIS JUIN',
    "Maître Aurélien EXEMPLE, notaire associé aux MONTILS (Loir et Cher), soussigné,",
    'Avec la participation de Maître Sophie GOSSART, notaire à BLOIS (41000), assistant :',
    '- Monsieur Héléna BERTAUD,',
    '- Monsieur Julien ROUVIERE.',
    'A reçu le présent acte authentique contenant Promesse unilatérale de vente à la requête de :',
    'Monsieur Chris LEMERCIER, cadre, demeurant à LANDES LE GAULOIS (41190), 510 rue Pitouille.',
    'Né à BLOIS (41000), le 6 mai 1979.',
    'Dénommé ci-après le PROMETTANT'
  ].join('\n');
  const parties = app.detecterParties(texte, 'PROMESSE_DE_VENTE');
  const vendeurs = parties.filter(p => p.role === 'VENDEUR').map(p => p.nom);
  assert.equal(vendeurs.join(' & '), 'LEMERCIER');
});
