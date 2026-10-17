'use strict';
// Honoraires d'agence TTC (étude, 03/10) : le montant TTC lu dans le compromis, dans un champ du formulaire ;
// les champs introuvables restent affichés. Textes inventés, structure des actes réels.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const CLAUSE_NEGOCIATION = `REMUNERATION DU MANDATAIRE A LA CHARGE DU PROMETTANT Les parties reconnaissent : - Que les présentes ont été négociées par l'agence "IMMO DU CENTRE", par l'intermédiaire de Madame X. - Qu'en conformité de ce mandat, il lui est accordé la somme, TVA incluse, de 15.000,00 €, à titre de rémunération.`;

test('honoraires d’agence TTC : lus dans la clause de négociation (TVA incluse)', () => {
  const h = app.detecterHonorairesAgenceTTC(CLAUSE_NEGOCIATION);
  assert.equal(h.valeur, 15000);
});

test('honoraires d’agence TTC : intitulé « honoraires d’agence » avec TTC explicite', () => {
  assert.equal(app.detecterHonorairesAgenceTTC('Frais : honoraires d’agence : 8 500,00 euros TTC à la charge de l’acquéreur. Autre clause.').valeur, 8500);
  assert.equal(app.detecterHonorairesAgenceTTC('La commission d’agence s’élève à 12.000 € toutes taxes comprises.').valeur, 12000);
});

test('honoraires d’agence TTC : jamais un montant HT, sans mention, « néant », ni les honoraires du notaire', () => {
  assert.equal(app.detecterHonorairesAgenceTTC('Honoraires de négociation : 9.000 € HT.'), null);
  assert.equal(app.detecterHonorairesAgenceTTC('Les honoraires d’agence sont de 9.000 €.'), null, 'ni TTC ni HT : on ne dit pas TTC');
  assert.equal(app.detecterHonorairesAgenceTTC('Frais d’agence : néant. Les parties ont négocié directement.'), null);
  assert.equal(app.detecterHonorairesAgenceTTC('HONORAIRES DE PROMESSE DE VENTE : 240,00 EUR TTC.'), null);
  assert.equal(app.detecterHonorairesAgenceTTC(''), null);
});

test('extraction : le champ honorairesAgence porte le montant et sa source', () => {
  const e = app.construireExtractionRegex(CLAUSE_NEGOCIATION, null, [], '');
  assert.equal(e.champs.honorairesAgence.valeur, 15000);
  assert.equal(app.champRevision(e, 'honorairesAgence').valeur, 15000);
  const vide = app.construireExtractionRegex('Texte sans honoraires.', null, [], '');
  assert.equal(vide.champs.honorairesAgence.valeur, null);
});

test('le champ du formulaire fait foi pour le montant des honoraires du dossier', () => {
  const lu = { negociateur: 'agence', nom: 'IMMO DU CENTRE', montantTTC: 15000, charge: 'ACQUEREUR' };
  assert.equal(app.honorairesAvecMontantFormulaire(lu, 15000, 'X').charge, 'ACQUEREUR', 'la charge lue est gardée');
  assert.equal(app.honorairesAvecMontantFormulaire(lu, 14000, 'X').montantTTC, 14000, 'montant corrigé');
  assert.equal(app.honorairesAvecMontantFormulaire(lu, '', 'X').montantTTC, null, 'champ vidé : le montant lu s’efface');
  const cree = app.honorairesAvecMontantFormulaire(null, 9000, 'CENTURY 21');
  assert.equal(`${cree.negociateur}|${cree.nom}|${cree.montantTTC}|${cree.charge}`, 'agence|CENTURY 21|9000|null');
  assert.equal(app.honorairesAvecMontantFormulaire(null, '', 'X'), null);
  // « Commission d'agence à la charge de » du formulaire (étude 17/10) : le choix remplace la charge lue ; vide, plus personne.
  assert.equal(app.honorairesAvecMontantFormulaire(lu, 15000, 'X', 'VENDEUR').charge, 'VENDEUR');
  assert.equal(app.honorairesAvecMontantFormulaire(lu, 15000, 'X', '').charge, null);
  assert.equal(app.honorairesAvecMontantFormulaire(null, 9000, 'X', 'ACQUEREUR').charge, 'ACQUEREUR');
  assert.equal(app.honorairesAvecMontantFormulaire(null, 9000, 'X', 'n’importe quoi').charge, null);
  assert.equal(app.honorairesAvecMontantFormulaire({ direct: true }, '', 'X').direct, true, 'négociation directe gardée');
  assert.equal(app.honorairesAvecMontantFormulaire({ direct: true }, 7000, 'X').montantTTC, 7000, 'un montant saisi remplace « directe »');
});

test('mode complément : honoraires d’agence comparés et posés sur la fiche sans toucher à la charge lue', () => {
  const fiche = { honoraires: { negociateur: 'agence', nom: 'IMMO', montantTTC: 10000, charge: 'VENDEUR' } };
  const c = app.comparaisonComplement(app.valeursFicheComplement(fiche), Object.assign(app.valeursFicheComplement(fiche), { honorairesAgence: 12000 }));
  assert.equal(c.find(x => x.cle === 'honorairesAgence').etat, 'different');
  const d = JSON.parse(JSON.stringify(fiche));
  const { resolu } = app.resolutionComplement(c, { honorairesAgence: 'compromis' });
  app.appliquerComplementSurDossier(d, resolu, {});
  assert.equal(d.honoraires.montantTTC, 12000);
  assert.equal(d.honoraires.charge, 'VENDEUR');
  // Fiche sans honoraires : le montant lu s'ajoute, avec la clause lue (charge) quand l'instantané la porte.
  const d2 = {};
  const c2 = app.comparaisonComplement(app.valeursFicheComplement(d2), Object.assign(app.valeursFicheComplement(d2), { honorairesAgence: 9000 }));
  assert.equal(c2.find(x => x.cle === 'honorairesAgence').etat, 'lu-seul');
  app.appliquerComplementSurDossier(d2, app.resolutionComplement(c2, {}).resolu, { instantane: { honoraires: { negociateur: 'agence', nom: 'IMMO', montantTTC: 9000, charge: 'ACQUEREUR' } } });
  assert.equal(d2.honoraires.montantTTC, 9000);
  assert.equal(d2.honoraires.charge, 'ACQUEREUR');
});

test('panneau de révision : un champ introuvable reste affiché (« À compléter »), plus replié', () => {
  const e = app.construireExtractionRegex('Texte sans rien de lisible.', null, [], '');
  const g = app.groupesRevision(e, false);
  const cles = g.aCompleter.map(x => x.definition.cle);
  assert.ok(cles.includes('honorairesAgence') && cles.includes('depotGarantie') && cles.includes('prixMobilier'), cles.join(','));
});
