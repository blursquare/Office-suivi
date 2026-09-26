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
  // Toutes lues dans le paragraphe « GARANTIES » de l'offre, jamais ailleurs dans le document.
  const app = chargerApplication();
  assert.equal(
    app.detecterGarantiesPret("GARANTIES\nLe prêt est garanti par le cautionnement de la société Crédit Logement.").join(','),
    'caution');
  // Mise en page tout aussi fréquente : le titre et son contenu sur la même ligne.
  assert.equal(
    app.detecterGarantiesPret("Garantie : hypothèque légale spéciale de prêteur de deniers sur le bien financé.").join(','),
    'hypothequeLegale');
  assert.equal(
    app.detecterGarantiesPret("GARANTIES\nLe prêteur bénéficiera d'une hypothèque conventionnelle de premier rang.").join(','),
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
    app.detecterGarantiesPret("GARANTIES\nLe prêt sera garanti par un privilège de prêteur de deniers.").join(','),
    'hypothequeLegale');
});

test('une phrase courante ne se fait pas passer pour un titre de paragraphe', () => {
  // Sans l'ancrage en début de ligne + deux-points, « les garanties sont… » au fil d'une clause
  // ouvrirait un faux paragraphe et ramènerait tout ce qui suit.
  const app = chargerApplication();
  assert.equal(app.detecterGarantiesPret(
    "CONDITIONS GENERALES\nToutes les garanties sont acquises au prêteur. Une hypothèque conventionnelle peut être requise.").length,
    0);
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

// Signalé par l'étude sur un dossier réel : « Caution · Hypothèque conventionnelle » affiché pour
// une offre qui ne porte qu'un cautionnement. Ce n'était pas l'affichage (qui se contente de
// traduire les clés) mais la détection, pour deux raisons cumulées — un test par raison.
test('detecterGarantiesPret : le paragraphe s\'arrête sur un titre de section numéroté ou en casse normale', () => {
  const app = chargerApplication();
  // Le motif précédent exigeait une MAJUSCULE comme tout premier caractère de la ligne : ni
  // « 8. ASSURANCES » ni « Article 8 - Assurance emprunteur » n'étaient reconnus comme titre, et
  // le paragraphe GARANTIES avalait la section suivante (où l'hypothèque est citée à un autre titre).
  const numerote = "7. GARANTIES\nLe prêt est garanti par le cautionnement de la société CREDIT LOGEMENT.\n\n"
    + "8. ASSURANCES\nUne hypothèque conventionnelle pourrait être requise.";
  assert.equal(app.detecterGarantiesPret(numerote).join(','), 'caution');

  const article = "7. GARANTIES\nLe prêt est garanti par le cautionnement de la société CREDIT LOGEMENT.\n\n"
    + "Article 8 - Assurance emprunteur\nLe prêteur pourra requérir une hypothèque conventionnelle sur le bien.";
  assert.equal(app.detecterGarantiesPret(article).join(','), 'caution');
});

test('detecterGarantiesPret écarte une garantie citée en simple alternative', () => {
  const app = chargerApplication();
  const alternative = "GARANTIES :\nCautionnement solidaire de la société CREDIT LOGEMENT.\n"
    + "À défaut d'accord de la caution, le prêt sera garanti par une hypothèque conventionnelle.";
  assert.equal(app.detecterGarantiesPret(alternative).join(','), 'caution');

  // …mais une hypothèque réellement exigée reste détectée, même si le paragraphe contient par
  // ailleurs une phrase conditionnelle : le garde-fou porte sur CHAQUE occurrence, pas sur le
  // paragraphe entier.
  const cumul = "GARANTIES :\nHypothèque conventionnelle de premier rang sur le bien financé.\n"
    + "En cas de refus, une hypothèque conventionnelle de second rang serait étudiée.";
  assert.equal(app.detecterGarantiesPret(cumul).join(','), 'hypothequeConventionnelle');
});

test('detecterGarantiesPret ne coupe pas le paragraphe sur une première garantie écrite en capitales', () => {
  const app = chargerApplication();
  // Une garantie énoncée en capitales juste sous le titre ressemble à un titre de section : la
  // couper viderait le paragraphe et ferait ressortir « Sans garanties » sur une offre cautionnée.
  const capitales = "GARANTIES\nCAUTIONNEMENT SOLIDAIRE\nConsenti par la société CREDIT LOGEMENT.";
  assert.equal(app.detecterGarantiesPret(capitales).join(','), 'caution');
});

test('detecterGarantiesPret écarte l\'hypothèque que l\'emprunteur s\'engage à consentir PLUS TARD', () => {
  const app = chargerApplication();
  // Cas réel signalé par l'étude sur une offre CAUTIONNÉE SEULE : le contrat de cautionnement de
  // la société de caution est reproduit À L'INTÉRIEUR du paragraphe GARANTIES, et il prévoit une
  // hypothèque que l'emprunteur devra consentir si le prêteur la réclame. Ce n'est pas une
  // garantie de ce prêt aujourd'hui — la fiche affichait pourtant « Caution · Hypothèque
  // conventionnelle ». Les marqueurs de ce cas SUIVENT le verbe, mais « s'engage à consentir »
  // le précède dans la même phrase : c'est lui qui sert d'ancre.
  const cegc = "GARANTIES\n"
    + "Caution société de cautionnement (convention) COMPAGNIE EUROPEENNE DE GARANTIES ET CAUTIONS.\n"
    + "La COMPAGNIE délivre une caution solidaire régie par les articles 2288 et suivants du code civil.\n"
    + "L'Emprunteur s'engage à consentir à ses frais une hypothèque conventionnelle sur le bien "
    + "financé ou tout autre bien de valeur équivalente à première demande de la COMPAGNIE et/ou "
    + "du Prêteur notamment dans les cas suivants :\n"
    + "- défaillance de l'Emprunteur dans le remboursement du prêt,\n"
    + "- informations erronées fournies par l'Emprunteur lors de la demande relative au prêt.\n"
    + "ASSURANCES\nLe prêt est assorti d'une assurance emprunteur.";
  assert.equal(app.detecterGarantiesPret(cegc).join(','), 'caution');

  // Contrôle : une hypothèque que le prêteur EXIGE reste détectée — le garde-fou ne doit pas
  // rendre la détection aveugle aux vraies hypothèques.
  const exigee = "GARANTIES\nLe prêt est garanti par une hypothèque conventionnelle de premier "
    + "rang sur le bien financé.\nASSURANCES\nSuite.";
  assert.equal(app.detecterGarantiesPret(exigee).join(','), 'hypothequeConventionnelle');
});

test('le paragraphe GARANTIES n\'est trouvé que sur un texte à VRAIES lignes (pdf.js en donne une par page)', () => {
  const app = chargerApplication();
  const lignes = "Assurance acceptée sans réserve.\nGARANTIES\nCautionnement solidaire de la "
    + "société CREDIT LOGEMENT.\nASSURANCES\nSuite.";
  assert.equal(app.detecterGarantiesPret(lignes).join(','), 'caution');

  // lireTextePdfVerification joint TOUS les items d'une page par une espace : « GARANTIES » se
  // retrouve au milieu d'une ligne longue de plusieurs milliers de caractères, et l'ancrage en
  // début de ligne de RE_TITRE_GARANTIES ne matche plus rien. C'est pour ça que la lecture des
  // garanties passe désormais par lireTextePdfEnLignes (voir verifierDossierLocal) : ce test
  // verrouille la raison du changement, pas seulement son effet.
  const aplati = lignes.replace(/\n/g, ' ');
  assert.equal(app.detecterGarantiesPret(aplati).length, 0);
});

// Structure d'une offre réelle Banque Populaire (noms, montants et organismes inventés) : le
// premier paragraphe « Garanties : » est celui de l'ASSURANCE emprunteur, le vrai est titré
// « GARANTIE(S) » plus loin, et les conditions générales ont encore leur propre « GARANTIES ».
test('l’offre à plusieurs paragraphes « Garanties » : le titre GARANTIE(S) du prêt fait foi', () => {
  const app = chargerApplication();
  const offre = "ASSURANCE(S) EMPRUNTEUR\n"
    + "- Délégation au profit de la Banque du bénéfice de l'assurance souscrite par MME JEANNE EXEMPLE.\n"
    + "Garanties : Se référer aux paragraphes concernés des dispositions de la notice d'information de l'assurance et du\n"
    + "bulletin d'adhésion .\n"
    + "Ces garanties sont obligatoires dans les proportions ci-dessous pour obtenir le financement :\n"
    + "Part d'assurance obligatoire : 100,00 %\n"
    + "GARANTIE(S)\n"
    + "- Cautionnement solidaire de Société Exemple Garantie (ci-après désignée la \"Caution\") à hauteur de 100 000,00 EUR.\n"
    + "Cette caution est recueillie pour sûreté du prêt ci-dessous :\n"
    + "- Prêt immobilier standard : 100 000,00 EUR sur 240 mois.\n"
    + "CLAUSE(S) PARTICULIERE(S)\n"
    + "Les fonds seront adressés chez le notaire.\n"
    + "CONDITIONS GENERALES\n"
    + "GARANTIES\n"
    + "En garantie du paiement de toutes sommes dues, l'Emprunteur confère à la Banque les garanties prévues aux conditions particulières.\n";
  assert.equal(app.detecterGarantiesPret(offre).join(','), 'caution');
});

test('seuls des paragraphes « Garanties » d’assurance ne disent pas « Sans garanties »', () => {
  const app = chargerApplication();
  const assurance = "Garanties : Se référer à la notice d'information de l'assurance.\n"
    + "Ces garanties sont obligatoires pour obtenir le financement.\n";
  assert.equal(app.detecterGarantiesPret(assurance).length, 0);
  // Un vrai paragraphe du prêt qui n'énonce rien de connu reste, lui, une réponse.
  const vide = "GARANTIES\nAucune garantie n'est exigée pour ce prêt.\nASSURANCES\nSuite.";
  assert.equal(app.detecterGarantiesPret(vide).join(','), 'sansGarantie');
});
