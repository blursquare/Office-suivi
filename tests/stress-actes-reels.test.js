// Régressions tirées du « stress test » du 22/09/2026 : tous les PDF réels envoyés par l'étude
// (avant-contrats, projets d'acte, offres de prêt, convocations, pièces d'un dossier NAS) ont été
// rejoués à travers les fonctions de l'outil. Chaque test reprend la STRUCTURE exacte d'un passage
// réel qui mettait l'outil en défaut — avec des noms, adresses et montants INVENTÉS : aucune donnée
// client n'entre dans le dépôt.
const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

// --- Parties ---------------------------------------------------------------------------------

test('nom composé écrit « DUPRÉ - LEBLANC » et étiquette « Ci - après » (espaces de pdf.js)', () => {
  const t = "ENTRE LES SOUSSIGNES : Madame Claire Anne DUPRÉ - LEBLANC, retraitée, demeurant 3 rue des Lilas 41000 BLOIS. " +
    "Née à TOURS le 2 mars 1960. Ci - après dénommée « LE PROMETTANT » D'UNE PART, ET Monsieur Hugo MARTEAU, ingénieur, " +
    "demeurant 8 rue Verte 45000 ORLEANS. Né à NANTES le 3 avril 1985. Ci - après dénommé « LE BENEFICIAIRE » D'AUTRE PART.";
  assert.strictEqual(app.detecterNomDossier(t), 'DUPRÉ-LEBLANC / MARTEAU');
});

test("le conjoint cité (« veuf en premières noces de Madame X ») n'est pas une partie", () => {
  const t = "LE VENDEUR : Monsieur Paul LEROUX, né à BLOIS le 1er mai 1950, veuf en premières noces de Madame Jeanne FAVIER, " +
    "demeurant 5 rue Haute 41000 BLOIS. Ci-après dénommé le VENDEUR. L'ACQUEREUR : Madame Léa BARON, née à TOURS le " +
    "4 juin 1990, demeurant 2 rue Basse 37000 TOURS. Ci-après dénommée l'ACQUEREUR.";
  const noms = app.detecterParties(t).map(p => p.nom).join(',');
  assert.ok(!/FAVIER/.test(noms), noms);
  assert.strictEqual(app.detecterNomDossier(t), 'LEROUX / BARON');
});

// --- Dépôt de garantie / indemnité d'immobilisation ------------------------------------------

test("indemnité d'immobilisation versée en partie : le montant retenu est celui VERSÉ", () => {
  const t = "INDEMNITE D'IMMOBILISATION Les parties conviennent de fixer le montant de l'indemnité d'immobilisation à la " +
    "somme forfaitaire de VINGT MILLE EUROS (20 000,00 EUR). Le BENEFICIAIRE versera, au moyen d'un virement, au plus " +
    "tard le 5 janvier 2026, la somme de DIX MILLE EUROS (10 000,00 EUR) en la comptabilité du notaire rédacteur des présentes. Le solde, soit DIX MILLE EUROS, sera versé en " +
    "cas de non réalisation.";
  const d = app.detecterDepotGarantieDetail(t);
  assert.strictEqual(d.montant, 10000);
  assert.strictEqual(d.total, 20000);
  assert.strictEqual(app.detecterDepotGarantie(t), 10000);
  assert.strictEqual(app.detecterSequestreDepot(t), 'notaire rédacteur des présentes');
});

test("le séquestre n'est pas pris dans la clause de levée d'option", () => {
  const t = "Pour être valable, la levée de l'option devra être accompagnée de la consignation par le BENEFICIAIRE entre " +
    "les mains du notaire chargé de dresser l'acte d'une somme suffisante pour assurer le paiement du prix.";
  assert.strictEqual(app.detecterSequestreDepot(t), null);
});

// --- Adresse, agence, financement ------------------------------------------------------------

test('adresse du bien lue dans la « DÉSIGNATION A <COMMUNE> (<département>) <CP> <voie> » des trames d’office', () => {
  const t = "IDENTIFICATION DU BIEN D ESIGNATION A BLOIS (LOIR - ET - CHER) 41000 12 Rue des Tilleuls , Une maison " +
    "d'habitation comprenant : une entrée, un salon.";
  const r = app.detecterAdresseBienStructuree(t);
  assert.ok(r && r.adresse, 'adresse attendue');
  assert.strictEqual(r.adresse.codePostal, '41000');
  assert.match(r.adresse.adresseComplete, /12 rue des Tilleuls/i);
});

test("agence : « négociées par l'agence \"X\" » (pluriel et guillemets), pas le négociateur", () => {
  const t = "Les parties reconnaissent : - Que les présentes ont été négociées par l'agence   \"IMMO DU VAL\" ,   par " +
    "l'intermédiaire de Monsieur Jean BIDULE, en vertu du mandat qui lui a été donné.";
  assert.strictEqual(app.detecterNomAgence(t), 'IMMO DU VAL');
});

test('achat sans prêt : « ne recourir à aucun prêt » et « absence de condition suspensive d’obtention de prêt »', () => {
  assert.ok(app.detecterFinancementComptant("Le BENEFICIAIRE déclare ne recourir à aucun prêt pour cette acquisition."));
  assert.ok(app.detecterFinancementComptant("Il est rappelé l'absence de condition suspensive d'obtention de prêt."));
});

// --- Dates -----------------------------------------------------------------------------------

test('« au plus tard dans les 2 mois et demi » ajoute bien les quinze jours', () => {
  const t = "CONDITION SUSPENSIVE D'OBTENTION DE PRET. Le BENEFICIAIRE devra obtenir son prêt au plus tard dans les " +
    "2 mois et demi de la signature des présentes.";
  const isos = app.detecterDatesDepuisTexte(t, '2026-01-10').map(d => d.iso);
  assert.ok(isos.includes('2026-03-25'), isos.join(','));
});

test('une date écrite l’emporte sur la date calculée depuis le délai de la même clause', () => {
  const r = app.meilleureCandidateEcheance([
    { iso: '2026-03-01', suggestion: 'pret', approx: true, contexte: 'au plus tard dans les 2 mois' },
    { iso: '2026-03-05', suggestion: 'pret', contexte: 'soit le 5 mars 2026' }
  ], 'pret');
  assert.strictEqual(r.candidat.iso, '2026-03-05');
});

// --- Engagements du vendeur ------------------------------------------------------------------

test('engagement écrit avec une apostrophe typographique (« s’engage »)', () => {
  const e = app.extraireEngagementsVendeur("Le VENDEUR s’engage à remettre à l’ACQUEREUR au plus tard le jour de la signature l’attestation d’entretien de la chaudière.");
  assert.strictEqual(e.length, 1);
  assert.strictEqual(e[0].type, 'entretien');
});

// --- Offre de prêt ---------------------------------------------------------------------------

test('montant emprunté : prêts additionnés, prêt relais exclu', () => {
  const t = "PRET AMORTISSABLE : Référence 1001A Montant total du crédit : 180 000,00 EUR Durée 240 mois. " +
    "PRET A TAUX ZERO : Référence 1001B Montant total du crédit : 40 000,00 EUR Durée 240 mois. " +
    "PRET RELAIS AVEC DIFFERE TOTAL : Référence 1001C Montant total du crédit : 150 000,00 EUR Durée 24 mois.";
  assert.strictEqual(app.detecterMontantPret(t), 220000);
});

// --- Appel de fonds : décompte d'un confrère -------------------------------------------------

test('décompte : fin de libellé renvoyée à la ligne suivante, et « € € » en fin de ligne', () => {
  const r = app.parserDecompteConfrere([
    'Prix d\'acquisition 300.000,00 €',
    'Montant des frais et droits de l\'acte de 24.000,00 €',
    'vente',
    'Montant des frais et droits de l\'acte de 2.500,00 €',
    'prêt',
    'Soit au total 326.500,00 € €'
  ].join('\n'));
  const libelles = r.lignes.debit.map(l => l.libelle + '=' + l.montant);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(libelles)), [
    'Prix d’acquisition=300000',
    'Montant des frais et droits de l’acte de vente=24000',
    'Montant des frais et droits de l\'acte de prêt=2500'
  ]);
  assert.strictEqual(r.meta.soldeDeclare, 326500);
  assert.ok(!app.estLigneFraisActeVente(r.lignes.debit[2].libelle), 'les frais d’acte de prêt ne relèvent pas du barème de la vente');
});

// --- Outil 2 : certificat d'urbanisme ----------------------------------------------------------

const CU = [
  "CERTIFICAT D'URBANISME D'INFORMATION délivré par le Maire au nom de la commune Demande déposée le 12/06 /2026",
  "Le maire, Vu la demande d’un certificat d’urbanisme indiquant les dispositions d’urbanisme et la liste des taxes et participations d’urbanisme applicables au terrain ;",
  "Vu le Plan Local d’Urbanisme approuvé par délibération du conseil communautaire le 29 novembre 2022 ;",
  "Vu le Plan de Prévention des Risques Inondation approuvé le 29 octobre 2021 CERTIFIE",
  "ARTICLE 2 : SERVITUDES D’UTILITE PUBLIQUE AC1 Ancienne abbaye P r o j e t s s o u m i s à a v i s d e France ( A B F )",
  "ARTICLE 4 : Le terrain est soumis au droit de préemption urbain délégué à la commune par délibération en date du 29 novembre 2022.",
  "Service des Géomètres, Le certificat d’alignement est à demander à la même adresse.",
  "DROIT DES TIERS : La présente décision est notifiée sans préjudice du droit des tiers (servitudes de vue ; règles figurant au cahier des charges du lotissement...) , que le certificat d'urbanisme ne vérifie pas."
].join('\n');

test("certificat d'urbanisme : la date d'un visa (PLU) n'est jamais prise pour la délivrance", () => {
  const a = app.analyserCertificatUrbanisme({ nom: "Certificat d'urbanisme.pdf", texte: CU });
  assert.strictEqual(a.date, null);
  assert.strictEqual(a.dateDemande, '2026-06-12');
  const c = app.constatsCertificatUrbanisme([a], '2026-09-22');
  assert.ok(!c.some(x => x.gravite === 'CRITIQUE'), c.map(x => x.titre).join(' | '));
  assert.ok(c.some(x => /valable au moins jusqu’au 12 décembre 2027/.test(x.titre)));
});

test("certificat d'urbanisme : renvois et clauses de style écartés, ABF en lettres espacées reconnu", () => {
  const a = app.analyserCertificatUrbanisme({ nom: "Certificat d'urbanisme.pdf", texte: CU });
  const cles = a.points.map(p => p.cle).join(',');
  assert.ok(!/alignement/.test(cles), cles);
  assert.ok(!/operationAmenagement/.test(cles), cles);
  assert.ok(/patrimoine/.test(cles), cles);
  assert.ok(/preemption/.test(cles), cles);
});

test("certificat d'urbanisme : une vraie date de délivrance reste lue", () => {
  const t = CU + "\nFait à BLOIS, le 3 juillet 2026. Le Maire.";
  const a = app.analyserCertificatUrbanisme({ nom: "Certificat d'urbanisme.pdf", texte: t });
  assert.strictEqual(a.date, '2026-07-03');
});

// --- Outil 2 : bruit retiré ------------------------------------------------------------------
// L'étude : « il signale trop de choses sans intérêt ». Sur les avant-contrats réels, l'essentiel
// du bruit venait de mentions qui NOMMENT un diagnostic sans en être un : le tableau des durées de
// validité, les phrases normatives (« doit être annexé »), les voies de droit ouvertes à une partie.

test('Outil 2 : le tableau des durées de validité ne produit aucun diagnostic « sans date »', () => {
  const t = "DIAGNOSTICS TECHNIQUES Durée de validité : Diagnostic de performance énergétique 10 ans ; Constat de " +
    "risque d'exposition au plomb illimitée ; Etat des risques et pollutions 6 mois ; Etat de l'installation électrique 3 ans.";
  assert.strictEqual(app.detecterDocumentsDatesOutil2(t, null, '2026-09-22').length, 0);
});

test('Outil 2 : une phrase normative (« doit être annexé ») ne vaut pas mention du diagnostic', () => {
  const t = "Le diagnostic de performance énergétique doit être annexé à la promesse. L'état des risques et pollutions " +
    "doit être établi moins de six mois avant la signature.";
  assert.strictEqual(app.detecterDocumentsDatesOutil2(t, null, '2026-09-22').length, 0);
});

test("Outil 2 : une voie de droit ouverte (« pourra engager une action en justice ») n'est pas une procédure en cours", () => {
  const t = "A défaut, le BENEFICIAIRE pourra engager une action en justice devant le tribunal compétent pour obtenir l'exécution forcée.";
  assert.strictEqual(app.constatsLectureActe(t, []).length, 0);
});

test('Outil 2 : régime « séparation de biens » d’un PACS lu dans la clause de l’acquéreur', () => {
  const t = "LE BENEFICIAIRE : Monsieur Luc ARNAUD, né à BLOIS le 1er mai 1990, et Madame Inès BLONDEL, née à TOURS le " +
    "2 juin 1991, liés par un pacte civil de solidarité conclu le 3 mars 2020, sous le régime de la séparation de biens, " +
    "demeurant 3 rue des Écoles 41000 BLOIS.";
  const s = app.detecterStatutAcquereurs(t, []);
  assert.strictEqual(s.statut, 'pacse');
  assert.strictEqual(s.regime, 'séparation de biens');
});
