'use strict';

// Reconnaissance de l'offre de prêt et de ses garanties (voir la section « OFFRE DE PRÊT » dans
// script.js). Troisième méthode après le contenu intégral puis le seul nom de fichier, toutes deux
// abandonnées sur signalement de l'étude : ici le nombre de pages, puis le TITRE de la page de
// garde, puis une confirmation par le modèle IA local.
//
// Seuls les filtres déterministes sont testables ici : la confirmation IA passe par le serveur
// (voir server/test/offre-pret.test.js) et le parcours du dossier local dépend de l'API File
// System Access, absente du harnais.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('titrePagePdf remet le texte à plat et ne garde que le haut de la page', () => {
  // pdf.js rend le texte en fragments dont l'espacement ne reflète pas la mise en page : sans
  // remise à plat, « offre   de \n prêt » ne matcherait aucun motif écrit avec \s*.
  const app = chargerApplication();
  assert.equal(app.titrePagePdf('  OFFRE   de \n\n prêt  immobilier '), 'OFFRE de prêt immobilier');
  assert.equal(app.titrePagePdf(''), '');
  assert.equal(app.titrePagePdf(null), '');
  assert.equal(app.titrePagePdf('a'.repeat(5000)).length, app.LONGUEUR_TITRE_PDF);
});

test('le titre d’une vraie page de garde d’offre est reconnu', () => {
  const app = chargerApplication();
  const titres = [
    'BANQUE POPULAIRE — OFFRE DE PRÊT immobilier n° 123456 Emprunteur : M. DUPONT',
    'Offre préalable de crédit immobilier',
    'CONTRAT DE PRÊT immobilier aux particuliers',
    "Offre de crédit — conditions générales et particulières"
  ];
  titres.forEach(t => assert.ok(app.OFFRE_PRET_RE.test(app.titrePagePdf(t)), t));
});

test('la page de garde d’un compromis n’est pas prise pour une offre', () => {
  // C'est tout l'intérêt de ne regarder QUE le titre : un compromis PARLE de l'offre de prêt dans
  // sa condition suspensive, mais sa page de garde ne s'intitule pas ainsi.
  const app = chargerApplication();
  const titre = app.titrePagePdf("COMPROMIS DE VENTE\nEntre les soussignés\nDÉSIGNATION DU BIEN\nMaison sise à BLOIS (41000)");
  assert.ok(!app.OFFRE_PRET_RE.test(titre));
});

test('le seuil de pages écarte les courriers courts, sans exiger les 10 pages annoncées', () => {
  // L'étude annonce « au minimum 10 pages » ; le seuil retenu est volontairement plus bas — c'est
  // un filtre de sécurité contre les courriers et attestations d'une ou deux pages, pas un rejet
  // d'une offre un peu courte sur un prêt simple.
  const app = chargerApplication();
  assert.ok(app.MIN_PAGES_OFFRE_PRET >= 2, 'un seuil de 1 ne filtrerait rien');
  assert.ok(app.MIN_PAGES_OFFRE_PRET <= 10, 'un seuil à 10 pile rejetterait une offre de 9 pages');
});

test('detecterGarantiesPret reconnaît les trois garanties, seules ou cumulées', () => {
  // L'étude a explicitement dit « et/ou » : le résultat est une liste, jamais une valeur unique.
  const app = chargerApplication();
  assert.equal(
    app.detecterGarantiesPret("Le prêt est garanti par le cautionnement de la société Crédit Logement.").join(','),
    'caution');
  assert.equal(
    app.detecterGarantiesPret("Garantie : hypothèque légale spéciale de prêteur de deniers sur le bien financé.").join(','),
    'hypothequeLegale');
  assert.equal(
    app.detecterGarantiesPret("Le prêteur bénéficiera d'une hypothèque conventionnelle de premier rang.").join(','),
    'hypothequeConventionnelle');
  // Cumul réel et fréquent : une partie du prêt cautionnée, l'autre hypothéquée.
  assert.equal(
    app.detecterGarantiesPret("Garanties : caution solidaire pour le prêt principal et hypothèque conventionnelle pour le prêt relais.").join(','),
    'caution,hypothequeConventionnelle');
});

test('l’ancien nom « privilège de prêteur de deniers » désigne la même garantie', () => {
  // Réforme des sûretés de 2021 : le PPD est devenu l'hypothèque légale spéciale du même nom, mais
  // les deux formulations coexistent dans les offres réelles — une seule clé pour les deux.
  const app = chargerApplication();
  assert.equal(
    app.detecterGarantiesPret("Le prêt sera garanti par un privilège de prêteur de deniers.").join(','),
    'hypothequeLegale');
});

test('detecterGarantiesPret ne rend rien sur un texte sans garantie', () => {
  const app = chargerApplication();
  assert.equal(app.detecterGarantiesPret("Offre de prêt — taux fixe, durée 240 mois.").length, 0);
  assert.equal(app.detecterGarantiesPret('').length, 0);
  assert.equal(app.detecterGarantiesPret(null).length, 0);
});

test('libellesGarantiesPret traduit les clés et ignore l’inconnu', () => {
  const app = chargerApplication();
  assert.equal(
    app.libellesGarantiesPret(['caution', 'hypothequeLegale']).join(' · '),
    'Caution · Hypothèque légale de prêteur de deniers');
  assert.equal(app.libellesGarantiesPret(['cleObsolete']).length, 0);
  assert.equal(app.libellesGarantiesPret(undefined).length, 0);
});

test('statutOffreAffichage distingue « à confirmer » de « reçue » et d’« introuvable »', () => {
  // Choix explicite de l'étude : un document trouvé que le modèle local n'a pas pu confirmer n'est
  // ni reçu (personne ne l'a validé) ni introuvable (il est là, il suffit de l'ouvrir).
  const app = chargerApplication();
  assert.equal(app.statutOffreAffichage({ dossierLie: true, offrePretStatut: 'recue' }).texte, 'Reçue');
  assert.equal(app.statutOffreAffichage({ dossierLie: true, offrePretStatut: 'aconfirmer' }).texte, 'À confirmer');
  assert.equal(app.statutOffreAffichage({ dossierLie: true, offrePretStatut: 'manquante' }).texte, 'Introuvable');
  assert.equal(app.statutOffreAffichage({ dossierLie: true, offrePretStatut: 'inconnu' }).texte, 'À vérifier');
  assert.equal(app.statutOffreAffichage({ dossierLie: false }).texte, 'Non vérifiée');
  // « À confirmer » ne doit pas être vert : rien n'est confirmé.
  assert.notEqual(app.statutOffreAffichage({ dossierLie: true, offrePretStatut: 'aconfirmer' }).dl, 'dl-success');
});

test('un dossier dont l’offre reste « à confirmer » n’est pas considéré comme complet', () => {
  // Sans quoi il ne serait plus jamais rescanné (voir revérifierDossiersLiesAuDemarrage) et le
  // statut resterait figé même une fois le modèle local de nouveau disponible.
  const app = chargerApplication();
  const base = { typeVente: 'maison', roleNotaire: 'participant', dossierLie: true };
  assert.equal(app.dossierEntierementComplet({ ...base, offrePretStatut: 'recue' }), true);
  assert.equal(app.dossierEntierementComplet({ ...base, offrePretStatut: 'aconfirmer' }), false);
});
