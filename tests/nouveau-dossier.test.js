'use strict';
// « Nouveau dossier » (étude, 02/10) : trois façons de commencer, sources affichées, notaires lus
// à placer d'un clic et rôle de l'étude déduit — noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const ACTE = (notaires) => `PROMESSE UNILATERALE DE VENTE

Entre les soussignés :
LE PROMETTANT : Monsieur Jean DUPONT né le 12 mars 1960 à Blois, demeurant 3 rue des Lilas, 41000 BLOIS.
LE BÉNÉFICIAIRE : Monsieur Pierre MARTIN né le 5 juillet 1985 à Tours, demeurant 8 rue Neuve, 37000 TOURS.

${notaires}

DÉSIGNATION
Une maison d'habitation sise à 25 route de Tours, 41100 VENDÔME, cadastrée section AB numéro 125.
L'acquéreur devra obtenir son financement au plus tard le 15 novembre 2026.
Fait à BLOIS le 15 septembre 2026.`;

test('deux notaires cités sans leur côté : champs vides, mais les deux restent proposés (avec leur rôle)', () => {
  const e = app.construireExtractionRegex(ACTE('Les parties ont désigné Maître Paul DURAND, notaire à ORLÉANS et Maître Sophie GOSSART, notaire à BLOIS.'), '2026-09-15');
  const c = app.cotesNotairesPourDossier(e.notaires);
  assert.equal(c.vendeur, '');
  assert.equal(c.acquereur, '');
  // « ORLÉANS et » : la conjonction ne fait pas partie de la ville.
  assert.equal(c.detectes.map(n => n.nom).join(' | '), 'Maître Paul DURAND (ORLÉANS) | Maître Sophie GOSSART (BLOIS)');
});

test('notairesNonPlacesDossier : la fiche montre les notaires lus tant qu’un côté est vide', () => {
  const detectes = [{ nom: 'Maître Sophie GOSSART (BLOIS)', role: 'instrumentaire' }, { nom: 'Maître Paul DURAND (ORLÉANS)', role: 'participant' }];
  assert.equal(app.notairesNonPlacesDossier({ notairesDetectes: detectes }).length, 2);
  // Placé (même écrit autrement : « Me », sans ville) : plus proposé.
  assert.equal(app.notairesNonPlacesDossier({ notaireVendeur: 'Me Sophie GOSSART', notairesDetectes: detectes }).map(n => n.nom).join(), 'Maître Paul DURAND (ORLÉANS)');
  assert.equal(app.notairesNonPlacesDossier({ notaireVendeur: 'X', notaireAcquereur: 'Y', notairesDetectes: detectes }).length, 0);
});

test('roleEtudeDeduitWizard : le rôle de l’étude découle du côté qui reçoit l’acte', () => {
  const nous = 'Maître Sophie GOSSART (Blois)', confrere = 'Maître Paul DURAND (Orléans)';
  assert.equal(app.roleEtudeDeduitWizard(nous, confrere, 'vendeur'), 'instrumentaire');
  assert.equal(app.roleEtudeDeduitWizard(nous, confrere, 'acquereur'), 'participant');
  assert.equal(app.roleEtudeDeduitWizard(confrere, nous, 'acquereur'), 'instrumentaire');
  assert.equal(app.roleEtudeDeduitWizard(nous, nous, 'vendeur'), 'instrumentaire');
  // Étude non reconnue, ou personne ne reçoit l'acte : rien n'est déduit.
  assert.equal(app.roleEtudeDeduitWizard(confrere, 'Maître Anne LEROY', 'vendeur'), null);
  assert.equal(app.roleEtudeDeduitWizard(nous, confrere, ''), null);
});

test('sourcesImportWizard : ce qui a nourri le dossier, et ce qui manque', () => {
  const deux = app.sourcesImportWizard({ compromis: 'Compromis.pdf', authentic: 'DUPONT / MARTIN', prixAuthentic: true });
  assert.equal(deux.filter(x => x.ok).length, 2);
  assert.match(deux[1].texte, /prix \(Capital\)/);
  const pdfSeul = app.sourcesImportWizard({ compromis: 'Compromis.pdf' });
  assert.equal(pdfSeul[1].geste, 'Compléter depuis Authentic');
  // Créé depuis Authentic, sans PDF (étude, 02/10) : plus d'ajout du compromis ensuite.
  const authSeul = app.sourcesImportWizard({ authentic: 'DUPONT / MARTIN' });
  assert.equal(authSeul[0].geste, undefined);
  assert.equal(app.sourcesImportWizard({})[0].geste, 'Ajouter le compromis');
  assert.equal(app.MODES_IMPORT.map(m => m.cle).join(), 'pdf,seul');
});

test('groupesAuthenticPourCompromis : le dossier Authentic du compromis lu vient en tête', () => {
  const groupes = [{ intitule: 'Vente LEROY / DURAND' }, { intitule: 'Vente DUPONT / MARTIN' }];
  assert.equal(app.groupesAuthenticPourCompromis(groupes, 'DUPONT / MARTIN').map(x => x.g.intitule).join(' | '), 'Vente DUPONT / MARTIN | Vente LEROY / DURAND');
  // Sans compromis lu : l'ordre reçu (le plus récent d'abord).
  assert.equal(app.groupesAuthenticPourCompromis(groupes, '').map(x => x.i).join(), '0,1');
});

test('etatStepperWizard : étapes faites et leur état, « Vérifier » faite seulement quand tout est validé', () => {
  const e = app.etatStepperWizard({ etape: 4, compromis: true, authentic: true, revision: { aValider: 3, validees: 6 } });
  assert.equal(e.map(x => x.fait ? 'x' : '-').join(''), 'x-x-');
  assert.equal(e[0].sous, 'Compromis + Authentic');
  assert.equal(e[1].sous, '3 à valider');
  const tout = app.etatStepperWizard({ etape: 2, authentic: true, revision: { aValider: 0, validees: 5 } });
  assert.equal(tout[1].fait, true);
  assert.equal(tout[1].sous, 'Tout est validé');
  assert.equal(tout[0].sous, 'Repris d’Authentic');
  assert.equal(app.etatStepperWizard({ etape: 1 })[0].fait, false);
});
