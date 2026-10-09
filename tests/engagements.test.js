'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('extraireEngagementsVendeur détecte un engagement de type "document"', () => {
  const app = chargerApplication();
  const texte = "Le vendeur s'engage à remettre un certificat de conformité avant la signature de l'acte.";
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 1);
  assert.equal(engagements[0].type, 'document');
});

test('extraireEngagementsVendeur détecte un engagement de type "entretien"', () => {
  const app = chargerApplication();
  const texte = 'Le vendeur devra justifier du ramonage de la cheminée avant la vente.';
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 1);
  assert.equal(engagements[0].type, 'entretien');
});

test('extraireEngagementsVendeur détecte un engagement de type "travaux"', () => {
  const app = chargerApplication();
  const texte = 'Le vendeur s\'engage à faire exécuter les travaux de remise en état de la toiture.';
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 1);
  assert.equal(engagements[0].type, 'travaux');
});

test('extraireEngagementsVendeur fonctionne aussi pour un "promettant" (promesse unilatérale)', () => {
  const app = chargerApplication();
  const texte = 'Le promettant s\'engage à remettre le certificat de conformité au bénéficiaire.';
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 1);
});

test('extraireEngagementsVendeur écarte une clause hypothétique', () => {
  const app = chargerApplication();
  const texte = "Si les biens venaient à se révéler non conformes, le vendeur s'engage à fournir une attestation de mise en conformité.";
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 0);
});

test('extraireEngagementsVendeur écarte une énumération d\'équipements (immeubles par destination)', () => {
  const app = chargerApplication();
  const texte = "Le vendeur s'engage à laisser dans l'immeuble par destination les équipements ci-après désignés, sans que cette liste soit limitative : la chaudière, le certificat du portail.";
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 0);
});

test('extraireEngagementsVendeur écarte un thème hors périmètre (urbanisme, copropriété...)', () => {
  const app = chargerApplication();
  const texte = "Le vendeur s'engage à fournir le certificat d'urbanisme au notaire.";
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 0);
});

test('extraireEngagementsVendeur écarte la clause standard de demande de visite', () => {
  // Signalé par l'étude : cette clause d'organisation des visites du bien avant la vente
  // ressortait à tort comme un engagement/obligation à réclamer après coup.
  const app = chargerApplication();
  const texte = "Le vendeur s'engage à faciliter l'accès au bien en cas de demande de visite formulée par l'acquéreur ou ses mandataires.";
  const engagements = app.extraireEngagementsVendeur(texte);
  assert.equal(engagements.length, 0);
});

test('detecterDocumentsAFournir reconnaît un type de document courant dans les clauses', () => {
  const app = chargerApplication();
  const engagements = app.extraireEngagementsVendeur("Le vendeur s'engage à remettre un justificatif de ramonage de la cheminée.");
  const documents = app.detecterDocumentsAFournir(engagements);
  assert.ok(documents.some(d => d.label === 'Justificatif de ramonage'));
  assert.ok(documents.every(d => d.cat === 'entretien' || typeof d.cat === 'string'));
});

test('detecterDocumentsAFournir porte une cleChecklist sur TOUS les documents connus', () => {
  // Cette clé relie la détection à une pièce ajoutée automatiquement à la checklist du dossier
  // (voir PIECES_ENGAGEMENTS_AUTO/checklistPieces dans script.js). Limitée au départ aux trois
  // entretiens (ramonage, chaudière, PAC), elle a été étendue à tous les documents connus sur
  // demande explicite de l'étude : un document à réclamer au vendeur mérite le même suivi, quelle
  // que soit sa nature — un document détecté sans clé disparaîtrait silencieusement de la
  // checklist, ce qui est exactement le bug signalé.
  const app = chargerApplication();
  const texte = "Le vendeur s'engage à remettre un justificatif de ramonage de la cheminée, " +
    "un justificatif d'entretien annuel de la chaudière, un justificatif d'entretien de la pompe " +
    "à chaleur, et des factures des travaux réalisés.";
  const engagements = app.extraireEngagementsVendeur(texte);
  const documents = app.detecterDocumentsAFournir(engagements);
  const parLabel = Object.fromEntries(documents.map(d => [d.label, d.cleChecklist]));
  assert.equal(parLabel['Justificatif de ramonage'], 'ramonage');
  assert.equal(parLabel["Justificatif d'entretien de la chaudière"], 'entretienChaudiere');
  assert.equal(parLabel["Justificatif d'entretien de la pompe à chaleur"], 'entretienPac');
  assert.equal(parLabel['Factures des travaux réalisés'], 'facturesTravaux');
  assert.ok(documents.every(d => typeof d.cleChecklist === 'string' && d.cleChecklist));
});

test('chaque cleChecklist désigne une pièce réellement affichable', () => {
  // Une clé sans pièce correspondante dans PIECES_ENGAGEMENTS_AUTO (ou déjà dans la checklist
  // standard) serait détectée puis perdue en silence. Vérifié par la sortie de checklistPieces()
  // plutôt qu'en lisant les tableaux eux-mêmes, invisibles depuis le harnais (const de premier
  // niveau pour DOCUMENTS_VENDEUR_CONNUS) — et c'est de toute façon le comportement qui compte.
  const app = chargerApplication();
  const texte = "Le vendeur s'engage à remettre un justificatif de ramonage de la cheminée, " +
    "un justificatif d'entretien de la climatisation, une attestation de conformité consuel, " +
    "un audit énergétique, un état parasitaire, et des factures des travaux réalisés.";
  const documents = app.detecterDocumentsAFournir(app.extraireEngagementsVendeur(texte));
  assert.ok(documents.length >= 4);
  const pieces = app.checklistPieces('maison', { analyseJuridique: { documents } });
  const cles = new Set(pieces.map(p => p.cle));
  documents.forEach(doc => {
    assert.ok(cles.has(doc.cleChecklist), `pièce absente de la checklist pour ${doc.label}`);
  });
});

test('l’origine trentenaire n’est pas une obligation du vendeur à réclamer', () => {
  // Clause de style présente dans quasiment tous les avant-contrats : établir l'origine
  // trentenaire du bien est le travail du notaire sur le titre, pas une pièce à demander au
  // vendeur — l'étude a demandé qu'elle ne ressorte plus dans les obligations.
  const app = chargerApplication();
  const e = app.extraireEngagementsVendeur(
    "Le vendeur doit justifier de l'origine trentenaire de propriété du bien vendu.");
  assert.equal(e.length, 0);
});

test('le verbe « réparer » vaut engagement de travaux, comme le nom « réparation »', () => {
  const app = chargerApplication();
  // « faire réparer » est une tournure au moins aussi fréquente que « réparation » dans ces
  // clauses ; OBJET_TRAVAUX_RE ne connaissait que le nom, la clause était donc abandonnée.
  const e = app.extraireEngagementsVendeur("Le VENDEUR s'engage à faire réparer le portail du garage avant la vente.");
  assert.equal(e.length, 1);
  assert.equal(e[0].type, 'travaux');
});

test('l’origine de propriété « remontant à un titre translatif d’au moins trente ans » est écartée', () => {
  // Même clause de style que ci-dessus, dans sa rédaction la PLUS courante : elle n'emploie jamais
  // l'adjectif « trentenaire », mais « trente ans » en toutes lettres — le motif d'exclusion
  // existant passait donc à côté, et l'étude la voyait ressortir dans Outil 2.
  const app = chargerApplication();
  const e = app.extraireEngagementsVendeur(
    "Le PROMETTANT devra justifier d’une origine de propriété régulière remontant à un titre "
    + "translatif d'au moins trente ans.");
  assert.equal(e.length, 0);
});

test('l’exclusion de l’origine de propriété reste étroite', () => {
  // Le motif ajouté vise la seule formule « origine de propriété » : une clause qui parle par
  // ailleurs de propriété doit continuer à ressortir comme engagement documentaire.
  const app = chargerApplication();
  const e = app.extraireEngagementsVendeur(
    "Le VENDEUR devra fournir l'attestation notariée de propriété du bien avant la signature.");
  assert.equal(e.length, 1);
  assert.equal(e[0].type, 'document');
});

// Chaque obligation de fournir un document ou de justifier d'un entretien doit apparaître dans
// « Documents et pièces identifiés » — signalé par l'étude, reproduit sur deux actes réels
// (structures reprises, noms inventés).
test('« entretien de chaudière » sans article est reconnu comme document à fournir', () => {
  const app = chargerApplication();
  const e = app.extraireEngagementsVendeur(
    "Etant donné que l'entretien de chaudière aura plus d'un an le jour de l'acte, le vendeur " +
    "s'engage au plus tard pour l'acte authentique à communiquer un nouvel entretien de chaudière.");
  assert.equal(e.length, 1);
  const labels = app.detecterDocumentsAFournir(e).map(d => d.label).join('|');
  assert.equal(labels, "Justificatif d'entretien de la chaudière");
});

test('le verbe « ramoner » vaut justificatif de ramonage', () => {
  const app = chargerApplication();
  const e = app.extraireEngagementsVendeur('Le vendeur s’engage à faire ramoner les conduits avant la vente.');
  assert.equal(e.length, 1);
  assert.equal(app.detecterDocumentsAFournir(e).map(d => d.label).join('|'), 'Justificatif de ramonage');
});

test('une énumération de pièces donne un document par élément, connu ou non', () => {
  const app = chargerApplication();
  const docs = app.detecterDocumentsAFournir([{ type: 'document', phrase:
    "Le PROMETTANT s’engage à remettre à l’ ACQUEREUR au plus tard lors de la signature de l’acte " +
    "authentique de vente, les documents ci - après énumérés : - la facture finale du constructeur ; " +
    "- les plans des réseaux ainsi que, le cas échéant, les plans du chauffage au sol ." }]);
  assert.equal(docs.map(d => d.label).join('|'), 'Factures des travaux réalisés|Plans des réseaux');
  assert.equal(docs[1].cleChecklist, null);
});

test('un document hors catalogue apparaît sous un libellé tiré de la clause', () => {
  const app = chargerApplication();
  const docs = app.detecterDocumentsAFournir([{ type: 'document', phrase:
    'Le PROMETTANT s’engage à fournir au BENEFICIAIRE l’attestation d’acquittement de la prime ' +
    'définitive au plus tard le jour de la signature de l’acte authentique de vente.' }]);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].label, 'Attestation d’acquittement de la prime définitive');
  assert.equal(docs[0].generique, true);
});

test('une obligation de travaux sans modèle connu ne produit pas de document générique', () => {
  const app = chargerApplication();
  const docs = app.detecterDocumentsAFournir([{ type: 'travaux', phrase:
    'Le PROMETTANT s’engage à rembourser au BENEFICIAIRE tous appels de fonds concernant des travaux.' }]);
  assert.equal(docs.length, 0);
});

test('compléter les documents ajoute ceux des nouvelles obligations sans ressusciter un document retiré', () => {
  const app = chargerApplication();
  // L'étude a retiré « ramonage » de la liste ; elle ajoute ensuite une obligation d'entretien de
  // chaudière : seule celle-ci doit apparaître.
  const docs = [{ label: 'Vidange de fosse septique', cat: 'entretien', cleChecklist: 'vidangeFosse' }];
  app.completerDocumentsIdentifies(docs, [{ type: 'entretien', phrase: 'Le vendeur justifiera de l’entretien de la chaudière.' }]);
  app.completerDocumentsIdentifies(docs, [{ type: 'entretien', phrase: 'Le vendeur justifiera de l’entretien de la chaudière.' }]);
  assert.equal(docs.map(d => d.label).join('|'), "Vidange de fosse septique|Justificatif d'entretien de la chaudière");
});

test('engagements qui commencent pareil : tous gardés ; arrêté du permis et attestation décennale à fournir = documents à obtenir', () => {
  const app = chargerApplication();
  // Structure d'une promesse réelle (09/10), texte inventé.
  const t = 'Le PROMETTANT s’engage a faire ses meilleurs efforts afin de fournir la facture définitive de la pose de la chaudière.\n'
    + 'Seul le récépissé de dépôt dudit permis de construire est transmis au BENEFICIAIRE.\n'
    + 'Le   PROMETTANT   s’engage   a   faire   ses   meilleurs   efforts   afin   de   fournir\nl’arrêté d’autorisation du permis de construire.\n'
    + 'Le PROMETTANT s’engage à fournir au BENEFICIAIRE, au plus tard le jour prévu pour la réalisation des présentes, l’attestation d’assurance décennale pour l’année des travaux.\n'
    + 'Le VENDEUR déclare que le bien a fait l’objet d’un permis de construire délivré le 3 mai 1990.';
  const eng = app.extraireEngagementsVendeur(t);
  assert.equal(eng.length, 3);
  assert.equal(app.detecterDocumentsAFournir(eng).map(d => d.label).join(' ; '),
    'Facture définitive de la pose de la chaudière ; Autorisation d’urbanisme (arrêté du permis ou non-opposition) ; Justificatif de garantie décennale');
  // Une clause d'urbanisme sans document à fournir reste écartée (pas de bruit).
  assert.equal(app.extraireEngagementsVendeur('Le VENDEUR s’engage à respecter les règles d’urbanisme et le permis de construire.').length, 0);
});
