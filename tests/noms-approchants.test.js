'use strict';

// Reconnaissance TOLÉRANTE des noms de fichiers (second essai après motifNom) : fautes de frappe,
// mots de référence autour du nom, sigles, casse. Demandé par l'étude. Les noms ci-dessous sont
// inventés ; ils reprennent les formes de nommage réellement rencontrées.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const toutes = {};
for (const p of app.checklistPieces('copropriete').concat(app.checklistPieces('maison'), app.PIECES_ENGAGEMENTS_AUTO)) toutes[p.cle] = p;

function pieces(nom) {
  const n = app.normaliserNomPourMotif(nom);
  return Object.keys(toutes).filter(k => app.correspondancePieceNom(toutes[k], n)).sort().join(',');
}

test('une faute de frappe dans un mot long ne fait plus manquer la pièce', () => {
  assert.equal(pieces('Certficat d urbanisme.pdf'), 'certificatUrbanisme');
  assert.equal(pieces('certificat d alignemnt.pdf'), 'certificatAlignement');
  assert.equal(pieces('Numerottage.pdf'), 'certificatNumerotage');
  assert.equal(pieces('preemtion mairie.pdf'), 'renonciationPreemption');
  assert.equal(pieces('Diagnostiques techniques.pdf'), 'diagnosticsTechniques');
  assert.equal(pieces('Etat des risque.pdf'), 'erp');
});

test('les sigles CU, « CU a » et DIA sont reconnus, même sans parenthèse et au milieu d\'autres mots', () => {
  assert.equal(pieces('CU a 2026.pdf'), 'certificatUrbanisme');
  assert.equal(pieces('cu.pdf'), 'certificatUrbanisme');
  assert.equal(pieces('Renonciation DIA commune de Blois.pdf'), 'renonciationPreemption');
  assert.equal(pieces('2024-118 DUPONT - DIA.pdf'), 'renonciationPreemption');
});

test('un sigle doit être un mot entier et sans faute : aucune tolérance sur les mots courts', () => {
  assert.equal(pieces('Diagramme.pdf'), '');     // « dia » dans un mot n'est pas la DIA
  assert.equal(pieces('Cuisine.pdf'), '');       // ni « cu » le certificat d'urbanisme
  assert.equal(pieces('Facture vitre.pdf'), ''); // « vitre » n'est pas « titre » : première lettre jamais tolérée
});

test('la correspondance tolérante garde le garde-fou du certificat d\'alignement', () => {
  // Les mots d'une forme doivent être voisins : un CU qui parle d'alignement plus loin reste un CU.
  assert.equal(pieces("Certificat d'urbanisme - réponse alignement voirie.pdf"), 'certificatUrbanisme');
  assert.equal(pieces('Alignemnt et numerotage.pdf'), 'certificatAlignement,certificatNumerotage');
});

test('un mot collé ou coupé est recollé', () => {
  assert.equal(pieces('EtatDate.pdf'), 'etatDate');
  assert.equal(pieces('Certificat_nume_rottage.pdf'), 'certificatNumerotage');
});

test('offre de prêt : faute de frappe tolérée, mais un décompte de remboursement n\'est pas une offre', () => {
  const offre = nom => app.nomDitOffrePret(app.normaliserNomPourMotif(nom));
  assert.equal(offre('Ofre de pret CA.pdf'), true);
  assert.equal(offre('Contrat de credit immobilier banque.pdf'), true);
  assert.equal(offre('DECOMPTE de remboursement ECO PRET.pdf'), false);
  assert.equal(offre('Simulation pret.pdf'), false);
});

test('une pièce personnalisée se retrouve aussi par un nom approchant de son libellé', () => {
  const perso = { cle: 'perso-1', label: 'Attestation loi Carrez', personnalisee: true };
  assert.equal(app.correspondancePieceNom(perso, app.normaliserNomPourMotif('attestation loi carrez.pdf')), 'exact');
  assert.equal(app.correspondancePieceNom(perso, app.normaliserNomPourMotif('2026 Attestaion Carrez loi.pdf')), 'approche');
  assert.equal(app.correspondancePieceNom(perso, app.normaliserNomPourMotif('Plan du lot.pdf')), null);
});

test('distanceEdition compte une inversion de deux lettres comme une seule faute', () => {
  assert.equal(app.distanceEdition('certificat', 'cretificat'), 1);
  assert.equal(app.distanceEdition('pret', 'pret'), 0);
  assert.equal(app.distanceEdition('urbanisme', 'urbnisme'), 1);
});
