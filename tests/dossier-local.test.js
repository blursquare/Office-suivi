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
  for (let i = 0; i < 3005; i++) enfants.push(creerFichierFictif(`doc-${i}.pdf`));
  const racine = creerDossierFictif('racine', enfants);
  const noms = await collecter(app.fichiersPdfRecursifs(racine, 0, { n: 0 }));
  assert.equal(noms.length, 3000);
});

test('fichiersPdfRecursifs parcourt en largeur : les rubriques suivantes sont explorées même si un sous-dossier de la première déborde du plafond', async () => {
  const app = chargerApplication();
  // Reproduit l'arborescence réelle de l'étude : plusieurs rubriques numérotées à la racine, la
  // première ("0 - COMPTABILITE - PRET", avec son propre sous-dossier "PRET" contenant à lui seul
  // plus de PDF que le plafond de sécurité — relevés bancaires, historique de prêt...). L'ancien
  // parcours en PROFONDEUR descendait entièrement dans "PRET" avant même de regarder les rubriques
  // suivantes ("1 - Vendeur", "3 - Titre de propriété"...) : leurs pièces n'étaient alors jamais
  // atteintes, quel que soit leur nom de fichier — bug réel signalé par l'étude, voir CLAUDE.md.
  // Le nouveau parcours en LARGEUR doit avoir déjà trouvé les fichiers des rubriques suivantes
  // avant de s'enfoncer dans "PRET".
  const beaucoupDeReleves = [];
  for (let i = 0; i < 3005; i++) beaucoupDeReleves.push(creerFichierFictif(`releve-${i}.pdf`));
  const sousDossierPret = creerDossierFictif('PRET', beaucoupDeReleves);
  const rubrique0 = creerDossierFictif('0 - COMPTABILITE - PRET', [sousDossierPret]);
  const rubrique1 = creerDossierFictif('1 - Vendeur', [creerFichierFictif('carte-identite.pdf')]);
  const rubrique3 = creerDossierFictif('3 - Titre de propriété', [creerFichierFictif('Titre.pdf')]);
  const racine = creerDossierFictif('racine', [rubrique0, rubrique1, rubrique3]);
  const noms = await collecter(app.fichiersPdfRecursifs(racine, 0, { n: 0 }));
  assert.ok(noms.includes('carte-identite.pdf'));
  assert.ok(noms.includes('Titre.pdf'));
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

test('checklistPieces("terrain") reprend la liste "maison" en remplaçant les diagnostics par une étude de sol', () => {
  const app = chargerApplication();
  const clesMaison = app.checklistPieces('maison').map(p => p.cle);
  const clesTerrain = app.checklistPieces('terrain').map(p => p.cle);
  assert.equal(clesTerrain.length, clesMaison.length, 'même nombre de pièces que pour une maison');
  assert.ok(!clesTerrain.includes('diagnosticsTechniques'), 'pas de diagnostics techniques pour un terrain nu');
  assert.ok(clesTerrain.includes('etudeSol'), 'une étude de sol à la place');
  // Toutes les autres pièces (urbanisme, ERP, taxe foncière, titre...) restent identiques.
  const communes = clesMaison.filter(c => c !== 'diagnosticsTechniques');
  communes.forEach(c => assert.ok(clesTerrain.includes(c), `${c} devrait rester présent pour un terrain`));
});

test('checklistPieces(typeVente, d) masque les pièces retirées et ajoute les pièces personnalisées du dossier', () => {
  const app = chargerApplication();
  const d = {
    typeVente: 'maison',
    piecesRetirees: ['renonciationPreemption'],
    piecesPersonnalisees: [{ cle: 'perso-1', label: 'Attestation loi Carrez' }]
  };
  const checklist = app.checklistPieces('maison', d);
  const cles = checklist.map(p => p.cle);
  assert.ok(!cles.includes('renonciationPreemption'), 'la pièce retirée ne doit plus apparaître');
  assert.ok(cles.includes('perso-1'), 'la pièce personnalisée doit apparaître');
  const perso = checklist.find(p => p.cle === 'perso-1');
  assert.equal(perso.label, 'Attestation loi Carrez');
  assert.equal(perso.personnalisee, true);
  // Sans dossier fourni, la checklist standard reste intacte (utilisée avant l'enregistrement du
  // dossier, voir majApercuPieces).
  assert.ok(app.checklistPieces('maison').map(p => p.cle).includes('renonciationPreemption'));
});

test('checklistPieces(typeVente, d) ajoute une pièce auto-détectée depuis un engagement du compromis', () => {
  // Voir PIECES_ENGAGEMENTS_AUTO/ajouterDossier() : quand le compromis mentionne un entretien de
  // chaudière/PAC/ramonage, `d.piecesEngagementsDetectees` porte la clé correspondante et la pièce
  // doit apparaître dans la checklist, avec un vrai motifNom (contrairement à une pièce
  // personnalisée) puisqu'elle sera recherchée automatiquement dans le dossier local.
  const app = chargerApplication();
  const d = { typeVente: 'maison', piecesEngagementsDetectees: ['ramonage', 'entretienPac'] };
  const checklist = app.checklistPieces('maison', d);
  const ramonage = checklist.find(p => p.cle === 'ramonage');
  const pac = checklist.find(p => p.cle === 'entretienPac');
  assert.ok(ramonage, 'la pièce ramonage doit apparaître');
  assert.ok(pac, 'la pièce entretien PAC doit apparaître');
  // `instanceof RegExp` échouerait ici : le motif vient d'un autre contexte vm (autre réalisation
  // de RegExp), comme documenté pour les tableaux ailleurs dans ces tests — on vérifie plutôt sa
  // capacité à tester une chaîne, seule chose qui compte pour verifierDossierLocal().
  assert.equal(typeof ramonage.motifNom.test, 'function', 'contrairement à une pièce personnalisée, un vrai motifNom doit être présent');
  assert.equal(ramonage.autoEngagement, true);
  assert.equal(ramonage.personnalisee, undefined, 'ne doit pas être traitée comme une pièce personnalisée');
  // Une pièce auto-détectée non demandée pour ce dossier (chaudière ici) ne doit pas apparaître.
  assert.ok(!checklist.some(p => p.cle === 'entretienChaudiere'));
  // Retirable comme n'importe quelle pièce standard, via piecesRetirees.
  const checklistSansRamonage = app.checklistPieces('maison', { ...d, piecesRetirees: ['ramonage'] });
  assert.ok(!checklistSansRamonage.some(p => p.cle === 'ramonage'));
});

test('PIECES_ENGAGEMENTS_AUTO (ramonage/chaudière/PAC) reconnaît des noms de fichiers réels', () => {
  const app = chargerApplication();
  const checklist = app.checklistPieces('maison', { typeVente: 'maison', piecesEngagementsDetectees: ['ramonage', 'entretienChaudiere', 'entretienPac'] });
  const ramonage = checklist.find(p => p.cle === 'ramonage');
  const chaudiere = checklist.find(p => p.cle === 'entretienChaudiere');
  const pac = checklist.find(p => p.cle === 'entretienPac');
  assert.ok(ramonage.motifNom.test(app.normaliserNomPourMotif('Attestation de ramonage.pdf')));
  assert.ok(ramonage.motifNom.test(app.normaliserNomPourMotif('Facture de ramonage 2024.pdf')));
  assert.ok(chaudiere.motifNom.test(app.normaliserNomPourMotif('Entretien chaudiere.pdf')));
  assert.ok(chaudiere.motifNom.test(app.normaliserNomPourMotif('Contrat_entretien_chaudiere.pdf')));
  assert.ok(pac.motifNom.test(app.normaliserNomPourMotif('Entretien PAC.pdf')));
  assert.ok(pac.motifNom.test(app.normaliserNomPourMotif('Entretien pompe a chaleur.pdf')));
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
    avisTaxeFonciere: ['TF 2024.pdf', 'Taxes foncières.pdf', 'Avis de taxes foncières.pdf'],
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

test('motifNom reconnaît alignement + numérotage réunis dans un seul document, même sans le mot "certificat"', () => {
  // Signalé par l'étude : les deux pièces sont parfois réunies dans UN SEUL fichier, nommé
  // "Alignement et numérotage" (ou une variante proche) sans que le mot "certificat" apparaisse
  // devant "alignement" — contrairement au cas déjà couvert plus haut ("Certificat d'alignement et
  // numérotage.pdf"), où "certificat d'alignement" est une sous-chaîne littérale du nom. La seconde
  // alternative de certificatAlignement.motifNom (voir script.js) n'accepte "alignement" sans
  // "certificat" devant que s'il est à proximité du mot "numérotage" — le test de non-régression
  // juste au-dessus (un certificat d'urbanisme mentionnant "alignement" en passant, sans aucun
  // "numérotage" dans le nom) reste donc correctement écarté.
  const app = chargerApplication();
  const alignement = app.checklistPieces('maison').find(p => p.cle === 'certificatAlignement');
  const numerotage = app.checklistPieces('maison').find(p => p.cle === 'certificatNumerotage');
  for (const nom of ['Alignement et numérotage.pdf', 'Numérotage et alignement.pdf']) {
    assert.ok(alignement.motifNom.test(nom), `certificatAlignement devrait reconnaître "${nom}"`);
    assert.ok(numerotage.motifNom.test(nom), `certificatNumerotage devrait reconnaître "${nom}"`);
  }
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

test('normaliserNomPourMotif recompose les accents en NFD (dossier zippé/synchronisé depuis un Mac)', () => {
  // Bug réel, trouvé en ouvrant un vrai dossier envoyé par l'étude (zip contenant un dossier
  // __MACOSX + .DS_Store, donc constitué sur un Mac) : macOS écrit couramment les noms de fichiers
  // en Unicode NFD (accents décomposés — "è" stocké comme "e" + U+0300 ACCENT GRAVE COMBINANT
  // séparé) plutôt qu'en NFC (un seul caractère composé, la forme que \s?/[èe] de motifNom
  // attendent). Les deux formes s'affichent de façon rigoureusement identique dans un explorateur
  // de fichiers, un éditeur de texte ou un console.log — invisible à l'œil, indiscernable d'un
  // motif mal écrit. C'est ce qui a fait échouer trois revérifications successives du motif
  // "avisTaxeFonciere" sur un nom de fichier ("Avis de Taxes foncières.pdf") en apparence
  // parfaitement correct. Reproduit ici en construisant explicitement la forme NFD du nom réel.
  const app = chargerApplication();
  const nomNfd = 'Avis de Taxes foncières.pdf'; // "è" décomposé : "e" + U+0300
  assert.notEqual(nomNfd, nomNfd.normalize('NFC'), 'le nom construit doit être réellement en NFD pour que ce test ait un sens');
  const avisTaxeFonciere = app.checklistPieces('maison').find(p => p.cle === 'avisTaxeFonciere');
  assert.ok(avisTaxeFonciere.motifNom.test(app.normaliserNomPourMotif(nomNfd)));
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
