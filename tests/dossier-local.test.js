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

test('les motifs de contenu de la checklist reconnaissent un intitulé plausible pour chaque pièce qui en a un', () => {
  // certificatUrbanisme/certificatAlignement/certificatNumerotage/renonciationPreemption/
  // titrePropriete n'ont plus de `motif` du tout (voir le test dédié plus bas) — exclues ici.
  const app = chargerApplication();
  const exemples = {
    reponseAssainissement: "Rapport de contrôle de l'installation d'assainissement non collectif",
    diagnosticsTechniques: 'Dossier de Diagnostic Technique (DDT)',
    erp: 'État des risques et pollutions',
    avisTaxeFonciere: 'Avis de taxe foncière 2025',
    etatDate: 'État daté établi par le syndic',
    article20: 'Attestation article 20-II loi SRU',
    ribCopro: 'RIB du syndicat des copropriétaires'
  };
  for (const piece of app.checklistPieces('copropriete')) {
    if (!(piece.cle in exemples)) continue;
    assert.ok(piece.motif.test(exemples[piece.cle]), `motif "${piece.cle}" ne reconnaît pas "${exemples[piece.cle]}"`);
  }
});

test('certificatUrbanisme/certificatAlignement/certificatNumerotage/renonciationPreemption/titrePropriete n\'ont plus de motif de contenu', () => {
  // Bug structurel signalé par l'étude avec plusieurs clauses réelles de compromis DIFFÉRENTS :
  // ces pièces sont des CONDITIONS juridiques quasi systématiquement décrites en boilerplate dans
  // le compromis lui-même (ex. « Les titres de propriété ne devront révéler aucune charge
  // réelle... », « Qu'il soit délivré un certificat d'urbanisme... qui ne révèle pas de
  // servitudes... », « En cas d'exercice d'un droit de préemption... son bénéficiaire sera
  // subrogé... »), que la pièce ait été réellement obtenue ou non — aucune regex de contenu ne
  // peut distinguer ça de façon fiable, et l'étude ne peut pas fournir une clause à exclure pour
  // chacune des centaines de formulations possibles d'agence en agence. Seul motifNom (le nom du
  // fichier) les détecte désormais — voir PIECES_URBANISME/PIECES_AUTRES dans script.js.
  const app = chargerApplication();
  const clesSansMotifDeContenu = [
    'certificatUrbanisme', 'certificatAlignement', 'certificatNumerotage',
    'renonciationPreemption', 'titrePropriete'
  ];
  for (const cle of clesSansMotifDeContenu) {
    const piece = app.checklistPieces('maison').find(p => p.cle === cle);
    assert.equal(piece.motif, undefined, `${cle} ne devrait plus avoir de motif de contenu`);
    assert.ok(piece.motifNom, `${cle} doit toujours être détectable par son nom de fichier`);
  }
});

test('motifNom reconnaît le nom de fichier conventionnel des pièces urbanisme/diagnostics', () => {
  // Signalé par l'étude : la détection par contenu seul (motif) ne fonctionne pas bien pour ces
  // pièces, dont l'intitulé de fichier est en pratique conventionnel dans les dossiers de
  // l'étude — voir verifierPiecesDossier(), qui teste maintenant motifNom sur le nom du fichier
  // avant même d'en lire le contenu.
  const app = chargerApplication();
  const exemplesNoms = {
    certificatUrbanisme: ['Certificat urbanisme.pdf', 'CU a) réponse mairie.pdf'],
    certificatAlignement: ["Certificat d'alignement.pdf", "Certificat d'alignement et numérotage.pdf"],
    certificatNumerotage: ['Certificat de numérotage.pdf', "Certificat d'alignement et numérotage.pdf"],
    diagnosticsTechniques: ['Diagnostics.pdf', 'DDT.pdf'],
    reponseAssainissement: ['Rapport assainissement.pdf', 'Courrier assainissement.pdf', 'SPANC.pdf', 'Asainissement.pdf'],
    erp: ['ERP.pdf', 'État des risques et pollution.pdf'],
    avisTaxeFonciere: ['TF 2024.pdf', 'Taxes foncières.pdf'],
    titrePropriete: ['Titre.pdf', 'Titre de propriété.pdf', 'Titre vendeur.pdf']
  };
  for (const [cle, noms] of Object.entries(exemplesNoms)) {
    const piece = app.checklistPieces('maison').find(p => p.cle === cle);
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
// avec un texte réel où un certificat d'urbanisme renvoyait vers ces deux documents sans être
// lui-même l'un d'eux (voir RE_SIMPLE_RENVOI_PIECE). Ces deux pièces n'ont plus de motif de
// contenu du tout (voir le test structurel plus haut) : ce cas précis ne peut plus se produire
// pour elles, par construction. Le comportement générique de motifPieceTrouve (écarter un renvoi,
// rester sensible à une vraie mention) reste néanmoins utile pour les pièces qui ont encore un
// motif de contenu (reponseAssainissement, erp, diagnosticsTechniques, avisTaxeFonciere) — reformulé
// ci-dessous sur l'une d'elles plutôt que supprimé.
test('motifPieceTrouve écarte un simple renvoi (pièce à demander ailleurs, pas produite)', () => {
  const app = chargerApplication();
  const texte = "Le rapport d'assainissement est à demander au SPANC de la communauté de communes, " +
    "Service Environnement - 12 rue de la Mairie 41000 BLOIS.";
  const assainissement = app.checklistPieces('maison').find(p => p.cle === 'reponseAssainissement');
  assert.equal(app.motifPieceTrouve(assainissement.motif, texte), false);
});

test('motifPieceTrouve reste sensible à une vraie mention (pas seulement un renvoi)', () => {
  const app = chargerApplication();
  const texte = "Rapport de contrôle de l'installation d'assainissement non collectif réalisé le " +
    "12 mars 2024, conforme, joint en annexe.";
  const assainissement = app.checklistPieces('maison').find(p => p.cle === 'reponseAssainissement');
  assert.equal(app.motifPieceTrouve(assainissement.motif, texte), true);
});

test('le motif "erp" ignore un établissement recevant du public sans lien avec l\'état des risques', () => {
  // Ambiguïté réelle : "ERP" désigne aussi un Établissement Recevant du Public, sans rapport avec
  // la pièce recherchée (état des risques et pollutions) — d'où l'appui sur l'intitulé complet.
  const app = chargerApplication();
  const piece = app.checklistPieces('maison').find(p => p.cle === 'erp');
  assert.equal(piece.motif.test('Le local est classé établissement recevant du public (ERP) de type M'), false);
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
