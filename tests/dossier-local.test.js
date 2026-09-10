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

test('les motifs de la checklist reconnaissent un intitulé plausible pour chaque pièce', () => {
  const app = chargerApplication();
  const exemples = {
    certificatUrbanisme: "Certificat d'urbanisme opérationnel",
    certificatAlignement: "Certificat d'alignement de voirie",
    certificatNumerotage: 'Certificat de numérotage délivré par la mairie',
    reponseAssainissement: "Rapport de contrôle de l'installation d'assainissement non collectif",
    renonciationPreemption: 'La commune renonce à exercer son droit de préemption urbain',
    diagnosticsTechniques: 'Dossier de Diagnostic Technique (DDT)',
    erp: 'État des risques et pollutions',
    avisTaxeFonciere: 'Avis de taxe foncière 2025',
    titrePropriete: 'Titre de propriété du 12 mars 2010',
    etatDate: 'État daté établi par le syndic',
    article20: 'Attestation article 20-II loi SRU',
    ribCopro: 'RIB du syndicat des copropriétaires'
  };
  for (const piece of app.checklistPieces('copropriete')) {
    assert.ok(piece.motif.test(exemples[piece.cle]), `motif "${piece.cle}" ne reconnaît pas "${exemples[piece.cle]}"`);
  }
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
