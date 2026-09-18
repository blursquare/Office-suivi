'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

// Le parcours des fichiers d'un dossier client a QUITTÉ ce fichier : depuis que le serveur lit le
// NAS à la place du navigateur (voir server/src/nas.js, et CLAUDE.md pour le pourquoi), la
// récursion, le parcours en largeur et le plafond de sécurité vivent côté serveur et sont couverts
// par server/test/nas.test.js — y compris le cas réel qui avait motivé le parcours en largeur (une
// première rubrique dont le sous-dossier dépasse le plafond à lui seul). Les quatre tests qui
// vivaient ici simulaient une FileSystemDirectoryHandle dont plus aucune ligne de script.js ne
// dépend. Ce qui reste ici teste les MOTIFS de reconnaissance (motifNom, OFFRE_PRET_RE,
// checklistPieces), inchangés par ce déplacement.

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

test('OFFRE_PRET_RE reconnaît aussi un vrai NOM DE FICHIER (motifNom), plus seulement du texte', () => {
  const app = chargerApplication();
  // Bug corrigé : la reconnaissance de l'offre de prêt lisait jusqu'ici le CONTENU du PDF — trop
  // d'erreurs signalées par l'étude (polices embarquées mal encodées, faux positifs). OFFRE_PRET_RE
  // sert désormais exclusivement à tester le NOM DU FICHIER (normalisé via normaliserNomPourMotif,
  // comme les motifNom de la checklist de pièces) : \s* (plutôt que \s+) tolère un nom concaténé
  // sans séparateur en plus des variantes espacées/à underscores/tirets déjà normalisées en espaces.
  assert.ok(app.OFFRE_PRET_RE.test(app.normaliserNomPourMotif('Offre_de_pret_Credit_Agricole.pdf')));
  assert.ok(app.OFFRE_PRET_RE.test(app.normaliserNomPourMotif('OffreDePret.pdf')));
  assert.ok(app.OFFRE_PRET_RE.test(app.normaliserNomPourMotif('Accord-de-pret.pdf')));
  assert.equal(app.OFFRE_PRET_RE.test(app.normaliserNomPourMotif('Titre_de_propriete.pdf')), false);
});

test('OFFRE_PRET_RE reconnaît aussi "contrat de crédit"/"contrat de prêt", et leurs dérivés', () => {
  const app = chargerApplication();
  // Ajouté sur demande de l'étude : certains établissements nomment le document remis à
  // l'emprunteur "contrat" plutôt que "offre" (notamment une fois signé/accepté).
  assert.ok(app.OFFRE_PRET_RE.test(app.normaliserNomPourMotif('Contrat de credit.pdf')));
  assert.ok(app.OFFRE_PRET_RE.test(app.normaliserNomPourMotif('Contrat_de_pret_immobilier.pdf')));
  assert.ok(app.OFFRE_PRET_RE.test(app.normaliserNomPourMotif('ContratDeCredit.pdf')));
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

test('checklistPieces recalcule les pièces depuis les documents du dossier — rétroactivement', () => {
  // Demandé explicitement par l'étude : un dossier créé AVANT que `cleChecklist` ne couvre tous les
  // documents (ou avant l'existence même de `d.piecesEngagementsDetectees`) doit malgré tout voir
  // ses documents identifiés apparaître dans la checklist, sans qu'on ait à le recréer. Seul
  // `d.analyseJuridique.documents` est conservé sur le dossier : c'est donc de lui qu'on repart.
  const app = chargerApplication();
  // Dossier « ancien » : aucune clé stockée, et des documents sans cleChecklist — la clé doit être
  // retrouvée par le seul libellé.
  const ancien = {
    typeVente: 'maison',
    analyseJuridique: { documents: [{ label: 'Audit énergétique', cat: 'justificatif' }] }
  };
  const checklist = app.checklistPieces('maison', ancien);
  const audit = checklist.find(p => p.cle === 'auditEnergetique');
  assert.ok(audit, "la pièce doit apparaître sans qu'aucune clé ne soit stockée sur le dossier");
  assert.equal(audit.autoEngagement, true);
  assert.equal(typeof audit.motifNom.test, 'function');
  // Format historique encore plus ancien : un document stocké comme simple chaîne.
  const tresAncien = { typeVente: 'maison', analyseJuridique: { documents: ['Audit énergétique'] } };
  assert.ok(app.checklistPieces('maison', tresAncien).some(p => p.cle === 'auditEnergetique'));
  // Retirable comme n'importe quelle autre pièce, y compris ainsi recalculée.
  assert.ok(!app.checklistPieces('maison', { ...ancien, piecesRetirees: ['auditEnergetique'] })
    .some(p => p.cle === 'auditEnergetique'));
});

test('une pièce déjà présente dans la checklist standard n’apparaît pas en double', () => {
  // "Contrôle d'assainissement" (document du compromis) et "Courrier réponse assainissement"
  // (pièce standard) désignent le même document : la clé est volontairement partagée, et c'est la
  // pièce standard — au libellé et au motif plus précis — qui doit l'emporter.
  const app = chargerApplication();
  const d = {
    typeVente: 'maison',
    analyseJuridique: { documents: [{ label: "Contrôle d'assainissement", cleChecklist: 'reponseAssainissement' }] }
  };
  const checklist = app.checklistPieces('maison', d);
  assert.equal(checklist.filter(p => p.cle === 'reponseAssainissement').length, 1);
  assert.equal(checklist.find(p => p.cle === 'reponseAssainissement').autoEngagement, undefined);
});

test('clesChecklistDepuisDocuments ignore ce qu’elle ne reconnaît pas, sans doublon', () => {
  const app = chargerApplication();
  const cles = app.clesChecklistDepuisDocuments([
    { label: 'Audit énergétique' },
    { label: 'Audit énergétique', cleChecklist: 'auditEnergetique' }, // doublon
    { label: 'Un document inventé' },
    null,
    'Justificatif de ramonage'
  ]);
  assert.equal(cles.join(','), 'auditEnergetique,ramonage');
  assert.equal(app.clesChecklistDepuisDocuments(undefined).length, 0);
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
    renonciationPreemption: ['Renonciation préemption.pdf', 'Réponse préemption mairie.pdf', 'Renonciation au DPU.pdf'],
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

// ---- garanties du prêt : lues dans le seul paragraphe « GARANTIES » de l'offre ----

test('les garanties sont lues dans le paragraphe GARANTIES, pas dans tout le document', () => {
  // Le reste d'une offre parle abondamment d'hypothèque et de caution à d'autres titres (clauses
  // générales, frais, information précontractuelle) : les y chercher remontait des garanties qui
  // ne sont pas celles de CE prêt.
  const app = chargerApplication();
  const offre = `OFFRE DE PRET IMMOBILIER
MONTANT DU PRET
Cent mille euros (100 000 EUR).

GARANTIES
Le present pret est consenti sans garantie reelle ni personnelle.

ASSURANCES
Une hypotheque conventionnelle pourrait etre exigee en cas de defaut de paiement.`;
  assert.equal(app.detecterGarantiesPret(offre).join(','), 'sansGarantie');
});

test('les quatre réponses possibles de l’étude sont produites', () => {
  const app = chargerApplication();
  const avec = (corps, suite) => `OFFRE DE PRET\nGARANTIES\n${corps}\n\nREMBOURSEMENT ANTICIPE\n${suite || ''}`;
  const cles = (t) => app.detecterGarantiesPret(t).join(',');
  assert.equal(cles(avec('Le pret est consenti sans garantie.')), 'sansGarantie');
  assert.equal(cles(avec('Cautionnement solidaire de la societe CREDIT LOGEMENT.')), 'caution');
  assert.equal(cles(avec('Hypotheque legale speciale de preteur de deniers sur le bien finance.')), 'hypothequeLegale');
  assert.equal(
    cles(avec('- Hypotheque legale speciale de preteur de deniers\n- Hypotheque conventionnelle pour le surplus')),
    'hypothequeLegale,hypothequeConventionnelle');
});

test('un titre numéroté reste reconnu, et sans paragraphe on n’affirme rien', () => {
  const app = chargerApplication();
  const numerote = `CONTRAT DE PRET
Article 7 - GARANTIES
Hypotheque legale speciale de preteur de deniers.

CONDITIONS GENERALES
Une caution pourra etre sollicitee ulterieurement.`;
  assert.equal(app.detecterGarantiesPret(numerote).join(','), 'hypothequeLegale',
    'la caution citée dans les conditions générales ne doit pas remonter');
  // Aucun paragraphe « GARANTIES » : ne pas savoir n'est pas « sans garantie ».
  assert.equal(app.detecterGarantiesPret('OFFRE DE PRET\nMONTANT\nLe preteur de deniers beneficie d’un privilege legal.').length, 0);
  assert.equal(app.detecterGarantiesPret('').length, 0);
});
