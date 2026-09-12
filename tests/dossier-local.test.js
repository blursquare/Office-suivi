'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

// Simule un FileSystemDirectoryHandle minimal : seule .entries() est utilisée par
// fichiersPdfRecursifs(), pas besoin de reproduire toute l'API File System Access.
function creerDossierFictif(nom, enfants) {
  return {
    kind: 'directory',
    name: nom,
    async *entries() {
      for (const enfant of enfants) yield [enfant.name, enfant];
    }
  };
}

function creerFichierFictif(nom) {
  return { kind: 'file', name: nom };
}

// Simule un document pdf.js minimal : seules .numPages et .getPage(n).getTextContent() sont
// utilisées par lireTextePdfVerification().
function creerPdfFictif(numPages, texteParPage) {
  return {
    numPages,
    async getPage(p) {
      return { async getTextContent() { return { items: [{ str: texteParPage(p) }] }; } };
    }
  };
}

async function collecter(generateur) {
  const noms = [];
  for await (const entree of generateur) noms.push(entree.name);
  return noms;
}

test('fichiersPdfRecursifs trouve un PDF à la racine et dans un sous-dossier', async () => {
  const app = chargerApplication();
  const arbre = creerDossierFictif('racine', [
    creerFichierFictif('notice.pdf'),
    creerFichierFictif('image.jpg'), // ignoré : pas un PDF
    creerDossierFictif('Offres', [creerFichierFictif('offre-de-pret.pdf')])
  ]);
  const noms = await collecter(app.fichiersPdfRecursifs(arbre, 0, { n: 0 }));
  assert.deepEqual(noms.sort(), ['notice.pdf', 'offre-de-pret.pdf']);
});

test("fichiersPdfRecursifs s'arrête au-delà de la profondeur maximale", async () => {
  const app = chargerApplication();
  // Empile des sous-dossiers bien au-delà de toute profondeur raisonnable, avec un PDF au fond.
  let feuille = creerDossierFictif('trop-profond', [creerFichierFictif('introuvable.pdf')]);
  for (let i = 0; i < 8; i++) {
    feuille = creerDossierFictif('niveau-' + i, [feuille]);
  }
  const racine = creerDossierFictif('racine', [creerFichierFictif('a-la-racine.pdf'), feuille]);
  const noms = await collecter(app.fichiersPdfRecursifs(racine, 0, { n: 0 }));
  assert.ok(noms.includes('a-la-racine.pdf'));
  assert.equal(noms.includes('introuvable.pdf'), false, 'un PDF trop profond ne doit pas être trouvé');
});

test('fichiersPdfRecursifs applique un plafond de sécurité sur le nombre de fichiers', async () => {
  const app = chargerApplication();
  const enfants = [];
  for (let i = 0; i < 305; i++) enfants.push(creerFichierFictif(`doc-${i}.pdf`));
  const racine = creerDossierFictif('racine', enfants);
  const noms = await collecter(app.fichiersPdfRecursifs(racine, 0, { n: 0 }));
  assert.equal(noms.length, 300);
});

test('OFFRE_PRET_RE reconnaît les formulations bancaires courantes', () => {
  const app = chargerApplication();
  assert.ok(app.OFFRE_PRET_RE.test('OFFRE DE PRÊT IMMOBILIER'));
  assert.ok(app.OFFRE_PRET_RE.test('Offre préalable de crédit'));
  // Formulation bancaire tout aussi courante que "offre de prêt", signalée par l'étude comme non
  // détectée avant l'ajout de cette alternative dans OFFRE_PRET_RE — voir CLAUDE.md.
  assert.ok(app.OFFRE_PRET_RE.test('Offre de crédit immobilier'));
  assert.ok(app.OFFRE_PRET_RE.test('Offre de financement'));
  assert.equal(app.OFFRE_PRET_RE.test("Attestation d'entretien de chaudière"), false);
});

test('checklistPieces("maison") ne contient pas les pièces propres à la copropriété', () => {
  const app = chargerApplication();
  // Le tableau vient d'un autre contexte vm (autre réalisation d'Array) : on le convertit avant de
  // le comparer, comme pour reminderDays ailleurs dans les tests.
  const cles = [...app.checklistPieces('maison').map(p => p.cle)];
  assert.deepEqual(cles, [
    'certificatUrbanisme', 'certificatAlignement', 'certificatNumerotage',
    'reponseAssainissement', 'renonciationPreemption',
    'diagnosticsTechniques', 'erp', 'avisTaxeFonciere', 'titrePropriete'
  ]);
});

test('checklistPieces("copropriete") ajoute état daté, article 20-II et RIB de la copropriété', () => {
  const app = chargerApplication();
  const cles = app.checklistPieces('copropriete').map(p => p.cle);
  assert.ok(cles.includes('etatDate'));
  assert.ok(cles.includes('article20'));
  assert.ok(cles.includes('ribCopro'));
  // Les pièces urbanisme/autres restent identiques entre les deux types.
  assert.equal(cles.length, app.checklistPieces('maison').length + 3);
});

test('aucune pièce de la checklist n\'a plus de motif de contenu — seul motifNom les détecte', () => {
  // Décision explicite de l'étude, après une série de faux positifs par contenu qui n'étaient pas
  // tous réductibles à une clause précise à exclure (ex. les clauses de condition suspensive sur
  // le certificat d'urbanisme/la préemption/les titres de propriété, systématiquement présentes
  // dans le compromis lui-même que la pièce existe ou non — voir CLAUDE.md). Plutôt que d'attendre
  // un signalement pièce par pièce pour ERP/diagnostics/taxe foncière/assainissement/pièces de
  // copropriété (même risque en germe), l'étude a demandé de généraliser tout de suite : plus
  // aucun `motif` (contenu) nulle part dans PIECES_URBANISME/PIECES_AUTRES/PIECES_COPROPRIETE,
  // uniquement `motifNom` (nom du fichier). Bénéfice secondaire : verifierDossierLocal() peut alors
  // éviter d'ouvrir un PDF juste pour vérifier une pièce, ce qui accélère un parcours de dossier
  // volumineux (voir l'entrée CLAUDE.md correspondante).
  const app = chargerApplication();
  for (const piece of app.checklistPieces('copropriete')) {
    assert.equal(piece.motif, undefined, `${piece.cle} ne devrait plus avoir de motif de contenu`);
    assert.ok(piece.motifNom, `${piece.cle} doit être détectable par son nom de fichier`);
  }
});

test('motifNom reconnaît le nom de fichier conventionnel de chaque pièce de la checklist', () => {
  // Signalé par l'étude : la détection par contenu seul ne fonctionnait pas bien pour ces pièces,
  // dont l'intitulé de fichier est en pratique conventionnel dans les dossiers de l'étude — voir
  // verifierDossierLocal(), qui ne teste plus que motifNom sur le nom du fichier.
  const app = chargerApplication();
  const exemplesNoms = {
    certificatUrbanisme: ['Certificat urbanisme.pdf', 'CU a) réponse mairie.pdf'],
    certificatAlignement: ["Certificat d'alignement.pdf", "Certificat d'alignement et numérotage.pdf"],
    certificatNumerotage: ['Certificat de numérotage.pdf', "Certificat d'alignement et numérotage.pdf"],
    diagnosticsTechniques: ['Diagnostics.pdf', 'DDT.pdf'],
    reponseAssainissement: ['Rapport assainissement.pdf', 'Courrier assainissement.pdf', 'SPANC.pdf', 'Asainissement.pdf'],
    renonciationPreemption: ['Renonciation préemption.pdf', 'Réponse préemption mairie.pdf'],
    erp: ['ERP.pdf', 'État des risques et pollution.pdf'],
    avisTaxeFonciere: ['TF 2024.pdf', 'Taxes foncières.pdf'],
    titrePropriete: ['Titre.pdf', 'Titre de propriété.pdf', 'Titre vendeur.pdf'],
    etatDate: ['État daté.pdf', 'Etat date syndic.pdf'],
    article20: ['Article 20-II.pdf', 'Article 20 II loi SRU.pdf'],
    ribCopro: ['RIB copropriété.pdf', 'RIB syndic.pdf']
  };
  for (const [cle, noms] of Object.entries(exemplesNoms)) {
    const piece = app.checklistPieces('copropriete').find(p => p.cle === cle);
    for (const nom of noms) {
      assert.ok(piece.motifNom.test(nom), `motifNom "${cle}" ne reconnaît pas le nom de fichier "${nom}"`);
    }
  }
});

test('motifNom ne confond pas un certificat d\'urbanisme mentionnant "alignement" en passant avec le certificat d\'alignement lui-même', () => {
  // Demandé explicitement par l'étude : un document ne doit pas être marqué reçu pour une pièce
  // simplement parce qu'il partage un mot avec elle, si ce n'est pas réellement cette pièce.
  const app = chargerApplication();
  const alignement = app.checklistPieces('maison').find(p => p.cle === 'certificatAlignement');
  assert.equal(alignement.motifNom.test("Certificat d'urbanisme - réponse alignement voirie.pdf"), false);
});

test('normaliserNomPourMotif remplace underscores/tirets par des espaces pour un vrai nom de fichier de l\'étude', () => {
  const app = chargerApplication();
  assert.equal(
    app.normaliserNomPourMotif('Certificat_alignement_et_nume_rotage_DI_132.pdf'),
    'Certificat alignement et nume rotage DI 132.pdf'
  );
  assert.equal(app.normaliserNomPourMotif('Titre-de-propriete.pdf'), 'Titre de propriete.pdf');
});

test('motifNom reconnaît un vrai nom de fichier de l\'étude avec underscores et un mot coupé par l\'accent', () => {
  // Bug réel signalé par l'étude : "Certificat_alignement_et_nume_rotage_DI_132.pdf" n'était
  // détecté ni comme certificat d'alignement ni comme certificat de numérotage. Deux causes
  // cumulées : les underscores remplacent les espaces (motifNom écrit avec \s+), et "numérotage"
  // est coupé en deux par un underscore au niveau de l'accent ("nume_rotage") — voir CLAUDE.md.
  const app = chargerApplication();
  const nomNormalise = app.normaliserNomPourMotif('Certificat_alignement_et_nume_rotage_DI_132.pdf');
  const alignement = app.checklistPieces('maison').find(p => p.cle === 'certificatAlignement');
  const numerotage = app.checklistPieces('maison').find(p => p.cle === 'certificatNumerotage');
  assert.ok(alignement.motifNom.test(nomNormalise), 'certificatAlignement devrait reconnaître ce nom de fichier une fois normalisé');
  assert.ok(numerotage.motifNom.test(nomNormalise), 'certificatNumerotage devrait reconnaître ce nom de fichier une fois normalisé');
});

test('motifNom (taxe foncière, titre de propriété) tolère aussi un mot coupé au niveau de l\'accent', () => {
  // Même mécanisme que "numérotage" ci-dessus : un nom de fichier de l'étude peut couper le mot
  // juste après la lettre accentuée transcrite ("foncière" → "foncie_re", "propriété" →
  // "proprie_te") plutôt que de garder le mot accolé.
  const app = chargerApplication();
  const avisTaxeFonciere = app.checklistPieces('maison').find(p => p.cle === 'avisTaxeFonciere');
  const titrePropriete = app.checklistPieces('maison').find(p => p.cle === 'titrePropriete');
  assert.ok(avisTaxeFonciere.motifNom.test(app.normaliserNomPourMotif('Taxes_foncie_re_2024.pdf')));
  assert.ok(titrePropriete.motifNom.test(app.normaliserNomPourMotif('Titre_de_proprie_te.pdf')));
});

// Historique : ces deux tests ciblaient à l'origine certificatNumerotage/certificatAlignement
// (puis reponseAssainissement) via `piece.motif`. Plus aucune pièce de la checklist n'a de motif
// de contenu désormais (voir le test structurel plus haut) : verifierDossierLocal() n'appelle donc
// plus motifPieceTrouve() en pratique. La fonction elle-même reste en place (utile si une pièce
// retrouve un jour un motif de contenu) et continue d'être exercée ici directement, sur un motif
// ad hoc plutôt que celui d'une pièce réelle, pour ne pas perdre la couverture de son comportement
// générique (écarter un simple renvoi, rester sensible à une vraie mention).
test('motifPieceTrouve écarte un simple renvoi (pièce à demander ailleurs, pas produite)', () => {
  const app = chargerApplication();
  const motif = /assainissement/i;
  const texte = "Le rapport d'assainissement est à demander au SPANC de la communauté de communes, " +
    "Service Environnement - 12 rue de la Mairie 41000 BLOIS.";
  assert.equal(app.motifPieceTrouve(motif, texte), false);
});

test('motifPieceTrouve reste sensible à une vraie mention (pas seulement un renvoi)', () => {
  const app = chargerApplication();
  const motif = /assainissement/i;
  const texte = "Rapport de contrôle de l'installation d'assainissement non collectif réalisé le " +
    "12 mars 2024, conforme, joint en annexe.";
  assert.equal(app.motifPieceTrouve(motif, texte), true);
});

test('normaliserDossierImporte valide typeVente et repart sur "maison" par défaut', () => {
  const app = chargerApplication();
  const copro = app.normaliserDossierImporte({ nom: 'Test', typeVente: 'copropriete' }, 'test.json');
  assert.equal(copro.typeVente, 'copropriete');
  const sansType = app.normaliserDossierImporte({ nom: 'Test' }, 'test.json');
  assert.equal(sansType.typeVente, 'maison');
  const typeInvalide = app.normaliserDossierImporte({ nom: 'Test', typeVente: "n'importe quoi" }, 'test.json');
  assert.equal(typeInvalide.typeVente, 'maison');
});

test('normaliserDossierImporte valide roleNotaire et repart sur "instrumentaire" par défaut', () => {
  const app = chargerApplication();
  const participant = app.normaliserDossierImporte({ nom: 'Test', roleNotaire: 'participant' }, 'test.json');
  assert.equal(participant.roleNotaire, 'participant');
  const sansRole = app.normaliserDossierImporte({ nom: 'Test' }, 'test.json');
  assert.equal(sansRole.roleNotaire, 'instrumentaire');
  const roleInvalide = app.normaliserDossierImporte({ nom: 'Test', roleNotaire: 'autre chose' }, 'test.json');
  assert.equal(roleInvalide.roleNotaire, 'instrumentaire');
});

test('lireTextePdfVerification concatène le texte de toutes les pages d\'un PDF', async () => {
  const app = chargerApplication();
  const pdf = creerPdfFictif(3, p => `page${p}`);
  const texte = await app.lireTextePdfVerification(pdf);
  assert.ok(texte.includes('page1'));
  assert.ok(texte.includes('page2'));
  assert.ok(texte.includes('page3'));
});

test('lireTextePdfVerification lit bien au-delà de l\'ancien plafond de 15 pages (régression : pièces d\'urbanisme non détectées dans un PDF plus long, voir CLAUDE.md), jusqu\'à un plafond de sécurité de 60', async () => {
  const app = chargerApplication();
  const pdf = creerPdfFictif(70, p => `page${p}`);
  const texte = await app.lireTextePdfVerification(pdf);
  assert.ok(texte.includes('page60'), 'les 60 premières pages doivent être lues');
  assert.equal(texte.includes('page61'), false, 'un plafond de sécurité doit rester appliqué');
});

test('lireTextePdfVerification ne plante pas sur un PDF sans texte extractible quand l\'OCR est indisponible', async () => {
  const app = chargerApplication();
  const pdf = creerPdfFictif(2, () => '');
  const texte = await app.lireTextePdfVerification(pdf);
  assert.equal(texte.trim(), '');
});
