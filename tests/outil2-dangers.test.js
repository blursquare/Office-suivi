'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

// Outil 2, mode « lecture du compromis » : détection des dangers, 100 % déterministe.
// Les textes reprennent la STRUCTURE de clauses réelles avec des noms et des dates inventés —
// aucune donnée client n'entre dans le dépôt (règle déjà posée dans CLAUDE.md).

const AUJOURDHUI = '2026-09-21';

function pagesFactices(texte) {
  return [{ numero: 1, debut: 0, fin: texte.length }];
}

// --- Travaux déjà réalisés ------------------------------------------------------------------

test('detecterTravauxRealises repère une extension déclarée et la classe en extérieur', () => {
  const app = chargerApplication();
  const texte = "Le VENDEUR déclare que des travaux d'agrandissement ont été réalisés en 2021 sur le bien vendu.";
  const t = app.detecterTravauxRealises(texte, pagesFactices(texte), AUJOURDHUI);
  assert.equal(t.length, 1);
  assert.equal(t[0].exterieur, true);
  assert.equal(t[0].soumisAutorisation, true);
  assert.equal(t[0].annee, 2021);
  assert.equal(t[0].sousDecennale, true);
  assert.equal(t[0].autorisationMentionnee, false);
});

test('detecterTravauxRealises reconnaît le gros œuvre', () => {
  const app = chargerApplication();
  const texte = "Le VENDEUR déclare avoir fait procéder à la réfection de la charpente et de la toiture en 2019.";
  const t = app.detecterTravauxRealises(texte, pagesFactices(texte), AUJOURDHUI);
  assert.equal(t.length, 1);
  assert.equal(t[0].grosOeuvre, true);
});

test('detecterTravauxRealises ignore la clause de style « aucun travaux »', () => {
  const app = chargerApplication();
  const texte = "Le VENDEUR déclare qu'aucun travaux n'a été réalisé sur le bien depuis son acquisition.";
  assert.equal(app.detecterTravauxRealises(texte, pagesFactices(texte), AUJOURDHUI).length, 0);
});

// Les cinq faux positifs ci-dessous viennent d'un vrai projet de vente en copropriété (30 pages) :
// aucun ne parle de travaux faits sur CE bien, tous sont du boilerplate présent dans presque tout
// acte de copropriété — donc cinq fausses alertes sur chaque dossier de ce type.

test('detecterTravauxRealises ignore la description de ce qu un document doit mentionner', () => {
  const app = chargerApplication();
  const texte = "Ce carnet d'entretien a pour objet de mentionner : si des travaux importants ont "
    + "ete realises, si des contrats d'assurance dommages souscrits par le syndicat des "
    + "coproprietaires sont en cours, l'echeancier du programme pluriannuel de travaux decides "
    + "par l'assemblee generale s'il en existe un.";
  assert.equal(app.detecterTravauxRealises(texte, pagesFactices(texte), AUJOURDHUI).length, 0);
});

test('detecterTravauxRealises ignore une information conditionnelle sur des travaux prescrits', () => {
  const app = chargerApplication();
  const texte = "Celui-ci comportait notamment un extrait du document graphique situant le BIEN au "
    + "regard du zonage reglementaire, ainsi qu'une information indiquant si des travaux ont ete "
    + "prescrits par ce reglement et s'ils ont ete realises au regard de chacun des plans de "
    + "prevention des risques.";
  assert.equal(app.detecterTravauxRealises(texte, pagesFactices(texte), AUJOURDHUI).length, 0);
});

test('detecterTravauxRealises ignore le texte de loi cite dans l acte', () => {
  const app = chargerApplication();
  const texte = "L'article L 731-4 du Code de la construction et de l'habitation dispose que : "
    + "toute mise en copropriete d'un immeuble construit depuis plus de dix ans est precedee du "
    + "diagnostic technique global, lequel comporte 1° la liste des travaux necessaires a la "
    + "sauvegarde de l'immeuble et a la refection de la toiture.";
  assert.equal(app.detecterTravauxRealises(texte, pagesFactices(texte), AUJOURDHUI).length, 0);
});

test('detecterTravauxRealises garde une declaration qui se contente de viser un article', () => {
  const app = chargerApplication();
  // Le garde-fou exige DEUX marqueurs (reference au texte ET verbe d'enonciation) : viser un
  // article ne doit pas suffire a ecarter une vraie declaration du vendeur.
  const texte = "Le vendeur declare avoir fait realiser en 2021 des travaux de ravalement de "
    + "facade soumis a declaration prealable au sens de l'article R 421-17 du Code de l'urbanisme.";
  const t = app.detecterTravauxRealises(texte, pagesFactices(texte), AUJOURDHUI);
  assert.equal(t.length, 1);
  assert.equal(t[0].exterieur, true);
  assert.equal(t[0].annee, 2021);
});

test('detecterTravauxRealises ne rend qu un constat pour une seule clause longue', () => {
  const app = chargerApplication();
  // Deux mots « travaux » eloignes de plus de 250 caracteres dans la meme phrase donnaient deux
  // fenetres de lecture differentes, donc deux constats pour un seul passage.
  const texte = "Le vendeur declare que des travaux de refection de la toiture ont ete realises en "
    + "2019 par une entreprise reguliere, " + "apres consultation de plusieurs devis detailles et "
    + "acceptation du plus avantageux au terme d'une comparaison serieuse des prestations "
    + "proposees par chacune des entreprises consultees, ces travaux ayant ete receptionnes sans "
    + "reserve.";
  assert.equal(app.detecterTravauxRealises(texte, pagesFactices(texte), AUJOURDHUI).length, 1);
});

test('detecterTravauxRealises ignore un engagement de travaux FUTURS (thème 4, pas thème 1)', () => {
  const app = chargerApplication();
  const texte = "Le VENDEUR s'engage à faire réaliser les travaux de ravalement de façade avant la signature de l'acte authentique.";
  assert.equal(app.detecterTravauxRealises(texte, pagesFactices(texte), AUJOURDHUI).length, 0);
});

test('detecterTravauxRealises relève autorisation et décennale quand elles sont citées', () => {
  const app = chargerApplication();
  const texte = "Une véranda a été édifiée en 2023, ayant fait l'objet d'une déclaration préalable numéro DP 041 234 22 A0012, et l'entreprise a produit son attestation de garantie décennale.";
  const t = app.detecterTravauxRealises(texte, pagesFactices(texte), AUJOURDHUI);
  assert.equal(t.length, 1);
  assert.equal(t[0].autorisationMentionnee, true);
  assert.equal(t[0].decennaleMentionnee, true);
});

test('constatsTravauxRealises ne dit rien d un travail intérieur, et alerte sur l extérieur sans autorisation', () => {
  const app = chargerApplication();
  const interieur = { phrase: 'Des travaux de peinture ont été réalisés en 2024.', soumisAutorisation: false, grosOeuvre: false, exterieur: false, annee: 2024, sousDecennale: true };
  assert.equal(app.constatsTravauxRealises([interieur]).length, 0);

  const exterieur = { phrase: 'Une extension a été réalisée en 2021.', soumisAutorisation: true, grosOeuvre: false, exterieur: true, annee: 2021, sousDecennale: true, autorisationMentionnee: false, decennaleMentionnee: false, faitParLeVendeur: false, page: 4 };
  const constats = app.constatsTravauxRealises([exterieur]);
  assert.equal(constats.length, 2); // autorisation manquante + décennale non justifiée
  assert.equal(constats[0].gravite, 'CRITIQUE');
  assert.equal(constats[0].page, 4);
});

test('constatsTravauxRealises signale des travaux extérieurs SANS année comme à vérifier', () => {
  const app = chargerApplication();
  const sansDate = { phrase: 'Une terrasse a été construite par le vendeur.', soumisAutorisation: true, grosOeuvre: false, exterieur: true, annee: null, sousDecennale: null, autorisationMentionnee: true, decennaleMentionnee: false, faitParLeVendeur: true };
  const constats = app.constatsTravauxRealises([sansDate]);
  assert.equal(constats.length, 1);
  assert.equal(constats[0].gravite, 'A_VERIFIER');
});

// --- Validité des documents ------------------------------------------------------------------

test('calculerValiditeDocumentOutil2 : un DPE de 2024 est valable, un ERP de 2025 est périmé', () => {
  const app = chargerApplication();
  assert.equal(app.calculerValiditeDocumentOutil2('dpe', '2024-03-12', AUJOURDHUI).statut, 'VALIDE');
  assert.equal(app.calculerValiditeDocumentOutil2('erp', '2025-01-05', AUJOURDHUI).statut, 'EXPIRE');
});

test('calculerValiditeDocumentOutil2 : un entretien de chaudière de plus d un an est périmé', () => {
  const app = chargerApplication();
  assert.equal(app.calculerValiditeDocumentOutil2('entretienChaudiere', '2026-06-01', AUJOURDHUI).statut, 'VALIDE');
  const vieux = app.calculerValiditeDocumentOutil2('entretienChaudiere', '2025-05-01', AUJOURDHUI);
  assert.equal(vieux.statut, 'EXPIRE');
  assert.match(vieux.message, /PÉRIMÉ/);
});

test('calculerValiditeDocumentOutil2 : sans date, aucune expiration inventée', () => {
  const app = chargerApplication();
  const r = app.calculerValiditeDocumentOutil2('dpe', null, AUJOURDHUI);
  assert.equal(r.statut, 'DATE_MANQUANTE');
  assert.equal(r.dateExpiration, null);
});

test('calculerValiditeDocumentOutil2 : plomb et amiante restent explicitement non calculables', () => {
  const app = chargerApplication();
  for (const cle of ['plomb', 'amiante', 'mesurage']) {
    const r = app.calculerValiditeDocumentOutil2(cle, '2020-01-01', AUJOURDHUI);
    assert.equal(r.statut, 'NON_CALCULABLE', cle);
    assert.equal(r.dateExpiration, null, cle);
  }
});

// --- Dates ------------------------------------------------------------------------------------

test('premiereDateDansFragment lit les deux écritures, et rend la première du fragment', () => {
  const app = chargerApplication();
  assert.equal(app.premiereDateDansFragment('établi le 12/03/2024 par la société'), '2024-03-12');
  assert.equal(app.premiereDateDansFragment('en date du 5 janvier 2026'), '2026-01-05');
  assert.equal(app.premiereDateDansFragment('le 1er août 2025, révisé le 03/09/2025'), '2025-08-01');
  assert.equal(app.premiereDateDansFragment('aucune date ici'), null);
});

test('dateDuJustificatif préfère la date derrière un marqueur à la première date du document', () => {
  const app = chargerApplication();
  const texte = "Facture numéro 2023-114 imprimée le 02/01/2026.\nDate d'intervention : 15 juin 2026.";
  assert.equal(app.dateDuJustificatif(texte), '2026-06-15');
});

test('dateDuJustificatif retombe sur la première date quand aucun marqueur n est présent', () => {
  const app = chargerApplication();
  assert.equal(app.dateDuJustificatif('Rapport 04/02/2026 conduit de fumée'), '2026-02-04');
});

// --- Documents datés dans le compromis ---------------------------------------------------------

test('detecterDocumentsDatesOutil2 repère un DPE et un ERP avec leurs dates', () => {
  const app = chargerApplication();
  const texte = "Diagnostic de performance énergétique établi le 12 mars 2024 par la société DIAGNOSTIC SARL. "
    + "État des risques et pollutions en date du 5 janvier 2025.";
  const docs = app.detecterDocumentsDatesOutil2(texte, pagesFactices(texte), AUJOURDHUI);
  const dpe = docs.find(d => d.cle === 'dpe');
  const erp = docs.find(d => d.cle === 'erp');
  assert.equal(dpe.dateEtablissement, '2024-03-12');
  assert.equal(dpe.validite.statut, 'VALIDE');
  assert.equal(erp.dateEtablissement, '2025-01-05');
  assert.equal(erp.validite.statut, 'EXPIRE');
});

test('constatsDocumentsDates ne remonte que ce qui pose problème', () => {
  const app = chargerApplication();
  const docs = [
    { cle: 'dpe', label: 'DPE', famille: 'diagnostic', phrase: 'x', page: 2, validite: { statut: 'VALIDE', message: 'ok' } },
    { cle: 'erp', label: 'ERP', famille: 'diagnostic', phrase: 'y', page: 3, validite: { statut: 'EXPIRE', message: 'périmé' } }
  ];
  const constats = app.constatsDocumentsDates(docs);
  assert.equal(constats.length, 1);
  assert.equal(constats[0].gravite, 'CRITIQUE');
  assert.match(constats[0].titre, /ERP/);
});

// --- Justificatifs déposés ---------------------------------------------------------------------

test('rapprocherJustificatifs relie un fichier à son document par son nom', () => {
  const app = chargerApplication();
  const parCle = app.rapprocherJustificatifs([
    { nom: 'Entretien_chaudiere_2026.pdf', texte: "Certificat d'entretien. Date d'intervention : 10 mars 2026." },
    { nom: 'Sans rapport.pdf', texte: 'rien' }
  ]);
  assert.ok(parCle.entretienChaudiere);
  assert.equal(parCle.entretienChaudiere.date, '2026-03-10');
});

test('clePourEngagement relie une clause d entretien à la bonne entrée de la table', () => {
  const app = chargerApplication();
  assert.equal(app.clePourEngagement("Le vendeur s'engage à justifier du dernier ramonage du conduit."), 'ramonage');
  assert.equal(app.clePourEngagement("Le vendeur s'engage à produire l'entretien de la chaudière."), 'entretienChaudiere');
  assert.equal(app.clePourEngagement("Le vendeur s'engage à faire réparer la porte du garage."), null);
});

test('constatsEngagementsVendeur : justificatif périmé signalé, justificatif valable silencieux', () => {
  const app = chargerApplication();
  const engagement = { phrase: "Le vendeur s'engage à justifier de l'entretien de la chaudière.", type: 'entretien', page: 7 };

  const perime = app.constatsEngagementsVendeur([engagement], { entretienChaudiere: { document: 'Entretien.pdf', date: '2025-01-10' } }, AUJOURDHUI);
  assert.equal(perime.length, 1);
  assert.equal(perime[0].gravite, 'CRITIQUE');
  assert.match(perime[0].titre, /PÉRIMÉ/);

  const bon = app.constatsEngagementsVendeur([engagement], { entretienChaudiere: { document: 'Entretien.pdf', date: '2026-06-10' } }, AUJOURDHUI);
  assert.equal(bon.length, 0);
});

test('constatsEngagementsVendeur : sans justificatif déposé, le document reste à obtenir', () => {
  const app = chargerApplication();
  const engagement = { phrase: "Le vendeur s'engage à justifier du dernier ramonage.", type: 'entretien', page: 7 };
  const constats = app.constatsEngagementsVendeur([engagement], {}, AUJOURDHUI);
  assert.equal(constats.length, 1);
  assert.equal(constats[0].gravite, 'IMPORTANT');
  assert.equal(constats[0].categorie, 'ENTRETIENS');
});

// --- Analyse complète ---------------------------------------------------------------------------

test('analyserCompromisOutil2 produit un rapport trié, le plus grave en tête', () => {
  const app = chargerApplication();
  const texte = "Le VENDEUR déclare que des travaux d'agrandissement ont été réalisés en 2021. "
    + "État des risques et pollutions en date du 5 janvier 2025. "
    + "Le VENDEUR s'engage à justifier du dernier ramonage du conduit de fumée.";
  const rapport = app.analyserCompromisOutil2({ texte, pages: pagesFactices(texte), aujourdHui: AUJOURDHUI });
  assert.equal(rapport.mode, 'compromis');
  assert.ok(rapport.constats.length >= 3);
  assert.equal(rapport.constats[0].gravite, 'CRITIQUE');
  assert.ok(rapport.resume.CRITIQUE >= 1);
  // Le rapport reste trié du plus grave au moins grave.
  const ordre = { CRITIQUE: 0, IMPORTANT: 1, A_VERIFIER: 2, INFORMATION: 3 };
  for (let i = 1; i < rapport.constats.length; i++) {
    assert.ok(ordre[rapport.constats[i - 1].gravite] <= ordre[rapport.constats[i].gravite]);
  }
});

test('analyserCompromisOutil2 sur un acte sans danger ne produit aucun constat', () => {
  const app = chargerApplication();
  const texte = "Le VENDEUR déclare qu'aucun travaux n'a été réalisé sur le bien. "
    + "Le bien est vendu en l'état, l'ACQUÉREUR déclare en avoir pris connaissance.";
  const rapport = app.analyserCompromisOutil2({ texte, pages: pagesFactices(texte), aujourdHui: AUJOURDHUI });
  assert.equal(rapport.constats.length, 0);
  assert.equal(rapport.resume.CRITIQUE, 0);
});

// --- Mode « projet de vente » --------------------------------------------------------------------

const CLAUSE_CHAUDIERE = "Le VENDEUR s'engage à justifier de l'entretien de la chaudière avant la signature de l'acte authentique.";

test('verifierEngagementsTenus : justificatif déposé et à jour = obligation tenue', () => {
  const app = chargerApplication();
  const obligations = app.verifierEngagementsTenus({
    texteAvantContrat: CLAUSE_CHAUDIERE,
    texteProjet: '',
    documentsDeposes: [{ nom: 'Entretien chaudiere.pdf', texte: "Date d'intervention : 10 mars 2026." }],
    aujourdHui: AUJOURDHUI
  });
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0].statut, 'tenue');
  assert.equal(obligations[0].preuve.source, 'depot');
});

test('verifierEngagementsTenus : justificatif déposé mais vieux de plus d un an = PÉRIMÉ', () => {
  const app = chargerApplication();
  const obligations = app.verifierEngagementsTenus({
    texteAvantContrat: CLAUSE_CHAUDIERE,
    texteProjet: '',
    documentsDeposes: [{ nom: 'Entretien chaudiere.pdf', texte: "Date d'intervention : 10 mars 2025." }],
    aujourdHui: AUJOURDHUI
  });
  assert.equal(obligations[0].statut, 'perime');
  assert.match(obligations[0].validite.message, /PÉRIMÉ/);
});

test('verifierEngagementsTenus : le projet de vente peut lui-même valoir justification', () => {
  const app = chargerApplication();
  const obligations = app.verifierEngagementsTenus({
    texteAvantContrat: CLAUSE_CHAUDIERE,
    texteProjet: "Le vendeur justifie de l'entretien de la chaudière effectué le 12 mars 2026, dont copie demeure annexée.",
    pagesProjet: [{ numero: 9, debut: 0, fin: 200 }],
    documentsDeposes: [],
    aujourdHui: AUJOURDHUI
  });
  assert.equal(obligations[0].statut, 'tenue');
  assert.equal(obligations[0].preuve.source, 'projet');
  assert.equal(obligations[0].preuve.page, 9);
});

test('verifierEngagementsTenus : sans preuve, l obligation est NON JUSTIFIÉE', () => {
  const app = chargerApplication();
  const obligations = app.verifierEngagementsTenus({
    texteAvantContrat: CLAUSE_CHAUDIERE,
    texteProjet: "Le bien est vendu en l'état.",
    documentsDeposes: [],
    aujourdHui: AUJOURDHUI
  });
  assert.equal(obligations[0].statut, 'non_tenue');
});

test('verifierEngagementsTenus : une clause sans document type reste à vérifier à la main', () => {
  const app = chargerApplication();
  const obligations = app.verifierEngagementsTenus({
    texteAvantContrat: "Le VENDEUR s'engage à faire réparer le portail du garage avant la vente.",
    texteProjet: '', documentsDeposes: [], aujourdHui: AUJOURDHUI
  });
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0].statut, 'a_verifier');
  assert.equal(obligations[0].cle, null);
});

test('verifierEngagementsTenus classe les manquements en premier', () => {
  const app = chargerApplication();
  const obligations = app.verifierEngagementsTenus({
    texteAvantContrat: CLAUSE_CHAUDIERE + " Le VENDEUR s'engage à justifier du dernier ramonage du conduit.",
    texteProjet: "Le vendeur justifie de l'entretien de la chaudière effectué le 12 mars 2026.",
    documentsDeposes: [],
    aujourdHui: AUJOURDHUI
  });
  assert.equal(obligations.length, 2);
  assert.equal(obligations[0].statut, 'non_tenue'); // le ramonage, sans preuve
  assert.equal(obligations[1].statut, 'tenue');     // la chaudière, justifiée par le projet
});

test('constatsTravauxNonRepris signale une déclaration de travaux absente du projet', () => {
  const app = chargerApplication();
  const travaux = [{ phrase: 'Une extension a été réalisée en 2021.', soumisAutorisation: true, page: 5 }];
  assert.equal(app.constatsTravauxNonRepris(travaux, "Le bien est vendu en l'état.").length, 1);
  assert.equal(app.constatsTravauxNonRepris(travaux, "L'extension réalisée en 2021 est déclarée.").length, 0);
});

test('analyserProjetVenteOutil2 assemble obligations, comparaison et travaux, triés par gravité', () => {
  const app = chargerApplication();
  const rapport = app.analyserProjetVenteOutil2({
    texteAvantContrat: CLAUSE_CHAUDIERE + " Le VENDEUR déclare qu'une véranda a été édifiée en 2022.",
    pagesAvantContrat: [{ numero: 1, debut: 0, fin: 400 }],
    texteProjet: "Le bien est vendu en l'état.",
    documentsDeposes: [],
    aujourdHui: AUJOURDHUI
  });
  assert.equal(rapport.mode, 'acte');
  assert.ok(rapport.obligations.length >= 1);
  assert.ok(rapport.constats.length >= 2);
  const ordre = { CRITIQUE: 0, IMPORTANT: 1, A_VERIFIER: 2, INFORMATION: 3 };
  for (let i = 1; i < rapport.constats.length; i++) {
    assert.ok(ordre[rapport.constats[i - 1].gravite] <= ordre[rapport.constats[i].gravite]);
  }
});

// Le dossier CLAIRE lié est une TROISIÈME source de preuve, après le justificatif déposé et le
// projet lui-même : la pièce rangée sur le NAS prouve que le document existe, jamais que sa date
// est encore valable — son fichier n'est pas lu ici. D'où un statut distinct de « tenue ».
test('preuveDansDossierLie : la pièce reçue sur le NAS est une preuve, sans date', () => {
  const app = chargerApplication();
  const dossier = { pieces: { ramonage: 'recue' }, fichiersTrouves: { ramonage: '4 - Diagnostics/Ramonage 2026.pdf' } };
  const preuve = app.preuveDansDossierLie('ramonage', dossier);
  assert.equal(preuve.source, 'dossier');
  assert.match(preuve.nom, /Ramonage/);
  assert.equal(preuve.date, null);
});

test('preuveDansDossierLie : une pièce manquante ou un dossier absent ne prouvent rien', () => {
  const app = chargerApplication();
  assert.equal(app.preuveDansDossierLie('ramonage', { pieces: { ramonage: 'manquante' } }), null);
  assert.equal(app.preuveDansDossierLie('ramonage', null), null);
  assert.equal(app.preuveDansDossierLie(null, { pieces: { ramonage: 'recue' } }), null);
});

test('verifierEngagementsTenus : le dossier lié évite de redéposer une pièce déjà rangée', () => {
  const app = chargerApplication();
  const obligations = app.verifierEngagementsTenus({
    texteAvantContrat: CLAUSE_CHAUDIERE,
    texteProjet: "Le bien est vendu en l'état.",
    documentsDeposes: [],
    dossierLie: { pieces: { entretienChaudiere: 'recue' }, fichiersTrouves: { entretienChaudiere: 'Entretien.pdf' } },
    aujourdHui: AUJOURDHUI
  });
  assert.equal(obligations[0].statut, 'tenue_non_datee');
  assert.equal(obligations[0].preuve.source, 'dossier');
});

test('verifierEngagementsTenus : un justificatif daté l’emporte sur la pièce du dossier lié', () => {
  const app = chargerApplication();
  const obligations = app.verifierEngagementsTenus({
    texteAvantContrat: CLAUSE_CHAUDIERE,
    texteProjet: '',
    documentsDeposes: [{ nom: 'Entretien chaudiere.pdf', texte: "Entretien de la chaudière établi le 12 mars 2026." }],
    dossierLie: { pieces: { entretienChaudiere: 'recue' } },
    aujourdHui: AUJOURDHUI
  });
  assert.equal(obligations[0].statut, 'tenue');
  assert.equal(obligations[0].preuve.source, 'depot');
});

test('LIBELLES_STATUT_OBLIGATION_OUTIL2 : chaque statut produit par verifierEngagementsTenus a un libellé', () => {
  const app = chargerApplication();
  for (const statut of ['perime', 'non_tenue', 'date_illisible', 'a_verifier', 'tenue_non_datee', 'tenue']) {
    assert.ok(app.LIBELLES_STATUT_OBLIGATION_OUTIL2[statut], statut);
    assert.ok(app.LIBELLES_STATUT_OBLIGATION_OUTIL2[statut].texte);
  }
  // Seule « tenue » ne mérite aucune vigilance : tout le reste compte dans le résumé par gravité.
  assert.equal(app.LIBELLES_STATUT_OBLIGATION_OUTIL2.tenue.gravite, 'INFORMATION');
  assert.equal(app.LIBELLES_STATUT_OBLIGATION_OUTIL2.tenue_non_datee.gravite, 'A_VERIFIER');
});

// --- Table de validité : tous les diagnostics du DDT ----------------------------------------
// Les durées viennent du régime légal (l'article notaires.fr donné en référence par l'étude est
// bloqué par le proxy de cet environnement — voir le commentaire de DOCUMENTS_VALIDITE_OUTIL2).
// Ces tests verrouillent ce que le code affirme, pour que toute correction de durée soit un
// changement visible et volontaire plutôt qu'une retouche silencieuse.

test('DOCUMENTS_VALIDITE_OUTIL2 couvre les diagnostics du dossier de diagnostic technique', () => {
  const app = chargerApplication();
  const attendus = ['dpe', 'auditEnergetique', 'erp', 'termites', 'electricite', 'gaz',
    'assainissement', 'amiante', 'plomb', 'mesurage', 'bruit', 'merule', 'dtg'];
  const cles = Object.keys(app.DOCUMENTS_VALIDITE_OUTIL2);
  for (const cle of attendus) assert.ok(cles.includes(cle), `diagnostic absent de la table : ${cle}`);
});

test('DOCUMENTS_VALIDITE_OUTIL2 : les durées fixes sont celles du régime légal', () => {
  const app = chargerApplication();
  const t = app.DOCUMENTS_VALIDITE_OUTIL2;
  assert.equal(t.dpe.dureeMois, 120);            // 10 ans
  assert.equal(t.auditEnergetique.dureeMois, 60); // 5 ans
  assert.equal(t.erp.dureeMois, 6);
  assert.equal(t.termites.dureeMois, 6);
  assert.equal(t.electricite.dureeMois, 36);
  assert.equal(t.gaz.dureeMois, 36);
  assert.equal(t.assainissement.dureeMois, 36);
});

// Durées confirmées par l'étude (l'entretien de PAC valait 2 ans avant sa relecture) : les
// verrouiller ici évite qu'une retouche ultérieure ne les ramène silencieusement à une supposition.
test('DOCUMENTS_VALIDITE_OUTIL2 : entretiens à la charge du vendeur, durées confirmées par l\'étude', () => {
  const app = chargerApplication();
  const t = app.DOCUMENTS_VALIDITE_OUTIL2;
  assert.equal(t.entretienChaudiere.dureeMois, 12);
  assert.equal(t.ramonage.dureeMois, 12);
  assert.equal(t.entretienPac.dureeMois, 12);
  assert.equal(t.entretienPac.duree, '1 an');
  // La note qui accompagnait cette entrée annonçait « tous les 2 ans » : elle a été retirée avec
  // la correction, une note qui contredit la durée affichée vaut moins que pas de note du tout.
  assert.equal(t.entretienPac.note, undefined);
});

test('DOCUMENTS_VALIDITE_OUTIL2 : chaque entrée annonce sa durée en clair, pour relecture', () => {
  const app = chargerApplication();
  for (const cle of Object.keys(app.DOCUMENTS_VALIDITE_OUTIL2)) {
    assert.ok(app.DOCUMENTS_VALIDITE_OUTIL2[cle].duree, `durée non annoncée pour ${cle}`);
  }
});

test('un document sans durée légale ne produit AUCUN constat, même sans date', () => {
  const app = chargerApplication();
  for (const cle of ['bruit', 'merule', 'dtg']) {
    const sansDate = app.calculerValiditeDocumentOutil2(cle, null, AUJOURDHUI);
    assert.equal(sansDate.statut, 'SANS_DUREE', cle);
    const avecDate = app.calculerValiditeDocumentOutil2(cle, '2019-01-01', AUJOURDHUI);
    assert.equal(avecDate.statut, 'SANS_DUREE', cle);
  }
  const constats = app.constatsDocumentsDates([
    { cle: 'bruit', label: 'ENSA', famille: 'diagnostic', phrase: 'x', page: 1,
      validite: app.calculerValiditeDocumentOutil2('bruit', null, AUJOURDHUI) }
  ]);
  assert.equal(constats.length, 0);
});

test('un repérage d’amiante antérieur au 1er janvier 2013 est à refaire, quel que soit son résultat', () => {
  const app = chargerApplication();
  const vieux = app.calculerValiditeDocumentOutil2('amiante', '2011-06-15', AUJOURDHUI);
  assert.equal(vieux.statut, 'EXPIRE');
  assert.match(vieux.message, /2013/);
  // Après cette date, la durée dépend du résultat : jamais devinée ici.
  const recent = app.calculerValiditeDocumentOutil2('amiante', '2019-06-15', AUJOURDHUI);
  assert.equal(recent.statut, 'NON_CALCULABLE');
});

test('un audit énergétique de plus de 5 ans est périmé', () => {
  const app = chargerApplication();
  assert.equal(app.calculerValiditeDocumentOutil2('auditEnergetique', '2020-01-10', AUJOURDHUI).statut, 'EXPIRE');
  assert.equal(app.calculerValiditeDocumentOutil2('auditEnergetique', '2024-01-10', AUJOURDHUI).statut, 'VALIDE');
});

// --- Vue côte à côte : la clause du projet de vente ------------------------------------------

test('preuveDansProjet rapporte la clause du projet, pas seulement sa date', () => {
  const app = chargerApplication();
  const projet = "Le vendeur justifie de l'entretien de la chaudière effectué le 12 mars 2026 par la société Untel.";
  const p = app.preuveDansProjet('entretienChaudiere', projet, pagesFactices(projet), AUJOURDHUI);
  assert.equal(p.date, '2026-03-12');
  assert.match(p.clause, /entretien de la chaudi/i);
  assert.equal(p.page, 1);
});

test('verifierEngagementsTenus garde la clause du projet même quand un justificatif est déposé', () => {
  const app = chargerApplication();
  const avant = "Le VENDEUR s'engage à justifier de l'entretien annuel de la chaudière avant la signature.";
  const projet = "Le vendeur justifie de l'entretien de la chaudière effectué le 12 mars 2026.";
  const obligations = app.verifierEngagementsTenus({
    texteAvantContrat: avant,
    texteProjet: projet,
    pagesProjet: pagesFactices(projet),
    documentsDeposes: [{ nom: 'Entretien chaudiere.pdf', texte: 'Intervention effectuée le 5 juin 2026.' }],
    aujourdHui: AUJOURDHUI
  });
  assert.equal(obligations.length, 1);
  const o = obligations[0];
  assert.equal(o.statut, 'tenue');
  assert.equal(o.preuve.source, 'depot');           // c'est bien le justificatif qui l'établit…
  assert.match(o.clauseProjet, /entretien de la chaudi/i); // … et la clause du projet reste lisible
  assert.equal(o.pageProjet, 1);
});

test('verifierEngagementsTenus : clauseProjet vide quand le projet ne reprend pas l’engagement', () => {
  const app = chargerApplication();
  const avant = "Le VENDEUR s'engage à fournir le ramonage du conduit de fumée avant la vente.";
  const obligations = app.verifierEngagementsTenus({
    texteAvantContrat: avant,
    texteProjet: "Le présent acte constate la vente du bien désigné ci-dessus.",
    pagesProjet: pagesFactices('x'),
    documentsDeposes: [],
    aujourdHui: AUJOURDHUI
  });
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0].clauseProjet, null);
  assert.equal(obligations[0].statut, 'non_tenue');
});

// --- Assemblées générales de copropriété ------------------------------------------------------
// Point de vigilance demandé par l'étude. Les textes reprennent la structure des clauses réelles
// (« Assemblées générales », procès-verbal) avec des dates et des montants inventés.

const COPRO = "Le bien vendu constitue le lot numéro 12 d'un immeuble soumis au régime de la copropriété.";

test('detecterAssembleesGenerales lit la date de chaque AG, la plus récente en tête', () => {
  const app = chargerApplication();
  const texte = COPRO + " Les assemblées générales se sont tenues le 12 mars 2024, le 18 avril 2025 et le 3 juin 2023.";
  // Une seule mention plurielle : le détecteur s'ancre sur le couple mention + date.
  const t2 = "Assemblée générale ordinaire du 18 avril 2025. Assemblée générale du 12 mars 2024. Assemblée générale extraordinaire du 3 juin 2023.";
  const ags = app.detecterAssembleesGenerales(t2, pagesFactices(t2), null);
  assert.equal(ags.length, 3);
  assert.equal(ags.map(a => a.date).join(','), '2025-04-18,2024-03-12,2023-06-03');
  assert.ok(texte.length > 0);
});

test('detecterAssembleesGenerales repère les travaux votés, et pas une résolution rejetée', () => {
  const app = chargerApplication();
  const vote = "Assemblée générale ordinaire du 18 avril 2025. Résolution n°4 : des travaux de ravalement de la façade ont été votés pour un montant de 120 000 euros.";
  const rejet = "Assemblée générale ordinaire du 18 avril 2025. Résolution n°4 : les travaux de ravalement ont été rejetés par l'assemblée.";
  assert.equal(app.detecterAssembleesGenerales(vote, pagesFactices(vote), null)[0].travauxVotes, true);
  assert.equal(app.detecterAssembleesGenerales(rejet, pagesFactices(rejet), null)[0].travauxVotes, false);
});

test('detecterAssembleesGenerales : la clause de style « aucun travaux voté » ne déclenche rien', () => {
  const app = chargerApplication();
  // Sans ce garde-fou, la phrase qui RASSURE produirait l'alerte qu'elle vient d'écarter — même
  // piège que « le bien n'est pas soumis au statut de la copropriété » côté Outil 1.
  const texte = "Assemblée générale du 18 avril 2025 : aucun travaux n'a été voté lors des trois dernières assemblées générales.";
  assert.equal(app.detecterAssembleesGenerales(texte, pagesFactices(texte), null)[0].travauxVotes, false);
});

test('detecterAssembleesGenerales ignore une date qui ne se rattache pas à la réunion', () => {
  const app = chargerApplication();
  const texte = "L'assemblée générale statuera sur ces travaux avant le 30 juin 2026.";
  assert.equal(app.detecterAssembleesGenerales(texte, pagesFactices(texte), null).length, 0);
});

test('fusionnerAssembleesGenerales : le PV qui établit un vote l’emporte sur la clause qui date seule', () => {
  const app = chargerApplication();
  const clause = "Assemblée générale du 18 avril 2025 dont le procès-verbal est annexé.";
  const pv = "Procès-verbal d'assemblée générale du 18 avril 2025. Résolution n°4 : travaux de toiture votés.";
  const ags = app.fusionnerAssembleesGenerales([
    app.detecterAssembleesGenerales(clause, pagesFactices(clause), null),
    app.detecterAssembleesGenerales(pv, null, 'PV AG 2025.pdf')
  ]);
  assert.equal(ags.length, 1, 'une seule AG, pas un doublon');
  assert.equal(ags[0].travauxVotes, true);
  assert.equal(ags[0].document, 'PV AG 2025.pdf');
});

test('agEntreAvantContratEtVente borne la fenêtre des deux côtés', () => {
  const app = chargerApplication();
  const ags = [{ date: '2026-05-10' }, { date: '2026-02-01' }, { date: '2025-11-03' }];
  const dans = app.agEntreAvantContratEtVente(ags, '2026-01-15', '2026-04-30');
  assert.equal(dans.map(a => a.date).join(','), '2026-02-01');
  // Une AG tenue le jour même de l'avant-contrat est antérieure à l'engagement : hors fenêtre.
  assert.equal(app.agEntreAvantContratEtVente([{ date: '2026-01-15' }], '2026-01-15', null).length, 0);
  // Sans date de vente connue, la fenêtre reste ouverte — comportement prudent assumé.
  assert.equal(app.agEntreAvantContratEtVente(ags, '2026-01-15', null).length, 2);
  // Sans date d'avant-contrat, le volet 1 ne s'applique pas du tout.
  assert.equal(app.agEntreAvantContratEtVente(ags, null, null).length, 0);
});

test('constatsAssembleesGenerales : une AG avec travaux après l’avant-contrat est CRITIQUE', () => {
  const app = chargerApplication();
  const constats = app.constatsAssembleesGenerales({
    ags: [{ date: '2026-02-01', travauxVotes: true, phrase: 'x', page: 3 }],
    estCopropriete: true, dateAvantContrat: '2026-01-15', dateVente: '2026-04-30'
  });
  assert.equal(constats.length, 1);
  assert.equal(constats[0].gravite, 'CRITIQUE');
  assert.equal(constats[0].categorie, 'COPROPRIETE');
  assert.match(constats[0].description, /6-2/);
});

test('constatsAssembleesGenerales : une AG sans travaux identifiés après l’avant-contrat reste IMPORTANT', () => {
  const app = chargerApplication();
  const constats = app.constatsAssembleesGenerales({
    ags: [{ date: '2026-02-01', travauxVotes: false, phrase: 'x', page: 3 }],
    estCopropriete: true, dateAvantContrat: '2026-01-15', dateVente: null
  });
  assert.equal(constats.length, 1);
  assert.equal(constats[0].gravite, 'IMPORTANT');
  assert.match(constats[0].description, /proc[èe]s-verbal/i);
});

test('constatsAssembleesGenerales : travaux des trois dernières AG, sans redire celles de la fenêtre', () => {
  const app = chargerApplication();
  const ags = [
    { date: '2026-02-01', travauxVotes: true, phrase: 'a', page: 1 },  // dans la fenêtre
    { date: '2025-04-18', travauxVotes: true, phrase: 'b', page: 2 },
    { date: '2024-03-12', travauxVotes: false, phrase: 'c', page: 3 },
    { date: '2023-06-03', travauxVotes: true, phrase: 'd', page: 4 }   // 4e : hors des trois dernières
  ];
  const constats = app.constatsAssembleesGenerales({
    ags, estCopropriete: true, dateAvantContrat: '2026-01-15', dateVente: '2026-04-30'
  });
  assert.equal(constats.length, 2, 'la fenêtre + une seule des trois dernières, sans doublon');
  assert.equal(constats[0].gravite, 'CRITIQUE');
  assert.equal(constats[1].gravite, 'A_VERIFIER');
  assert.match(constats[1].titre, /18 avril 2025/);
});

test('constatsAssembleesGenerales : rien du tout hors copropriété', () => {
  const app = chargerApplication();
  const ags = [{ date: '2026-02-01', travauxVotes: true, phrase: 'x', page: 1 }];
  assert.equal(app.constatsAssembleesGenerales({ ags, estCopropriete: false, dateAvantContrat: '2026-01-15' }).length, 0);
  assert.equal(app.constatsAssembleesGenerales({ ags: [], estCopropriete: false }).length, 0);
});

test('constatsAssembleesGenerales : copropriété sans aucune AG datée = point à vérifier', () => {
  const app = chargerApplication();
  const constats = app.constatsAssembleesGenerales({ ags: [], estCopropriete: true, dateAvantContrat: '2026-01-15' });
  assert.equal(constats.length, 1);
  assert.equal(constats[0].gravite, 'A_VERIFIER');
  assert.match(constats[0].description, /trois derni[èe]res/);
});

test('analyserCompromisOutil2 : les AG ne remontent que sur une copropriété', () => {
  const app = chargerApplication();
  const clause = " Assemblée générale ordinaire du 18 avril 2025 : travaux de ravalement votés.";
  const copro = app.analyserCompromisOutil2({ texte: COPRO + clause, pages: pagesFactices(COPRO + clause), aujourdHui: AUJOURDHUI });
  assert.equal(copro.estCopropriete, true);
  assert.ok(copro.constats.some(c => c.categorie === 'COPROPRIETE'), 'un constat AG attendu');

  const maison = app.analyserCompromisOutil2({ texte: "Une maison individuelle." + clause, pages: pagesFactices(clause), aujourdHui: AUJOURDHUI });
  assert.equal(maison.estCopropriete, false);
  assert.equal(maison.constats.filter(c => c.categorie === 'COPROPRIETE').length, 0);
});

test('analyserProjetVenteOutil2 : AG tenue entre l’avant-contrat et la vente, travaux votés', () => {
  const app = chargerApplication();
  const avant = COPRO + " Fait à BLOIS le 15 janvier 2026.";
  const projet = COPRO + " Le présent acte constate la vente du lot numéro 12.";
  const res = app.analyserProjetVenteOutil2({
    texteAvantContrat: avant, pagesAvantContrat: pagesFactices(avant),
    texteProjet: projet, pagesProjet: pagesFactices(projet),
    documentsDeposes: [{ nom: 'PV AG.pdf', texte: "Procès-verbal d'assemblée générale du 1er février 2026. Résolution n°3 : travaux de réfection de la toiture votés." }],
    dossierLie: { typeVente: 'copropriete', rendezVousSignature: '2026-04-30' },
    aujourdHui: AUJOURDHUI
  });
  assert.equal(res.dateAvantContrat, '2026-01-15');
  assert.equal(res.dateVente, '2026-04-30');
  const ag = res.constats.filter(c => c.categorie === 'COPROPRIETE');
  assert.equal(ag.length, 1);
  assert.equal(ag[0].gravite, 'CRITIQUE');
  assert.match(ag[0].titre, /1er f[ée]vrier 2026|1 f[ée]vrier 2026/);
});

test('detecterAssembleesGenerales : la fenêtre d’une AG ne déborde pas sur la suivante', () => {
  const app = chargerApplication();
  // Défaut vu au rendu : la clause de style de l'AG SUIVANTE annulait le vote de la précédente.
  const texte = "Assemblée générale ordinaire du 14 mai 2025 : résolution n°7, des travaux de ravalement ont été votés. "
    + "Assemblée générale ordinaire du 22 juin 2024 : aucun travaux n'a été voté.";
  const ags = app.detecterAssembleesGenerales(texte, pagesFactices(texte), null);
  assert.equal(ags.length, 2);
  assert.equal(ags[0].date, '2025-05-14');
  assert.equal(ags[0].travauxVotes, true, 'le vote de 2025 ne doit pas être annulé par la phrase de 2024');
  assert.equal(ags[1].travauxVotes, false);
});
