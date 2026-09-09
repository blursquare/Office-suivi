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
