const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

// Mobilier compris dans le prix de vente : structures reprises des actes réels du stress test
// (promesse et vente MOKADEM, promesse FERNANDES), noms et montants inventés.

const app = chargerApplication();

test('ventilation « s’appliquant aux MEUBLES à concurrence de »', () => {
  const t = 'PRIX La vente, en cas de réalisation, aura lieu moyennant le prix DEUX CENT MILLE EUROS (200 000,00 EUR), s\'appliquant : - Aux MEUBLES à concurrence de TROIS MILLE EUROS (3 000,00 EUR), - Au BIEN à concurrence de CENT QUATRE-VINGT-DIX-SEPT MILLE EUROS (197 000,00 EUR).';
  assert.strictEqual(app.detecterPrixVente(t), 200000);
  assert.strictEqual(app.detecterPrixMobilier(t), 3000);
});

test('« ce prix comprenant celui du mobilier dont le montant est évalué à »', () => {
  const t = 'La vente aura lieu moyennant le prix principal de CENT VINGT MILLE EUROS ( 120.000,00 €) , Ce prix comprenant celui du mobilier dont le montant est évalué à CINQ MILLE DEUX CENTS EUROS ( 5200 €), ci-après désigné.';
  assert.strictEqual(app.detecterPrixMobilier(t), 5200);
});

test('assiette des droits minorée de l’évaluation des meubles', () => {
  const t = 'L\'assiette des droits est de DEUX CENT MILLE EUROS (200 000,00 EUR). Minorée de l\'évaluation des meubles s\'élevant à TROIS MILLE EUROS (3 000,00 EUR).';
  assert.strictEqual(app.detecterPrixMobilier(t), 3000);
});

test('écritures courtes d’agence', () => {
  assert.strictEqual(app.detecterPrixMobilier('Prix : 180 000 €, dont 4 500 € de mobilier.'), 4500);
  assert.strictEqual(app.detecterPrixMobilier('Le prix du mobilier est fixé à 2 000 €.'), 2000);
});

test('aucun mobilier vendu ou meubles non valorisés : rien', () => {
  assert.strictEqual(app.detecterPrixMobilier('Les parties déclarent qu’aucun meuble meublant ou objet mobilier n’est vendu avec les biens, à l’exception des éléments de cuisine, non valorisés. Prix : CENT MILLE EUROS (100 000 €).'), null);
  assert.strictEqual(app.detecterPrixMobilier('Moyennant le prix de CENT MILLE EUROS (100 000 €).'), null);
});

test('le mobilier de l’acquisition antérieure (plus-value) est écarté', () => {
  const t = 'PLUS-VALUES L’immeuble a été acquis par eux moyennant le prix de QUATRE-VINGT MILLE EUROS (80 000 €), ce prix comprenant celui du mobilier évalué à MILLE EUROS (1 000 €), suivant acte du 2 août 2020.';
  assert.strictEqual(app.detecterPrixMobilier(t), null);
});

test('la ventilation ne crée pas de prix contradictoire', () => {
  const t = 'moyennant le prix DEUX CENT MILLE EUROS (200 000,00 EUR), s\'appliquant : - Aux MEUBLES à concurrence de TROIS MILLE EUROS (3 000,00 EUR), - Au BIEN à concurrence de CENT QUATRE-VINGT-DIX-SEPT MILLE EUROS (197 000,00 EUR).';
  const ex = app.construireExtractionRegex(t, null, null, 'acte.pdf');
  assert.strictEqual(ex.champs.prixVente.valeur, 200000);
  assert.strictEqual(ex.champs.prixMobilier.valeur, 3000);
  assert.ok(!ex.alertes.some(a => a.code === 'PRIX_CONTRADICTOIRE'));
  assert.ok(!ex.alertes.some(a => a.code === 'MOBILIER_SUPERIEUR_PRIX'));
});

test('assietteImmobiliere retire le mobilier seulement s’il est cohérent', () => {
  assert.strictEqual(app.assietteImmobiliere(200000, 3000), 197000);
  assert.strictEqual(app.assietteImmobiliere(200000, 0), 200000);
  assert.strictEqual(app.assietteImmobiliere(200000, null), 200000);
  assert.strictEqual(app.assietteImmobiliere(200000, 250000), 200000);
  assert.strictEqual(app.assietteImmobiliere(null, 3000), null);
});

test('relecture : mobilier de l’avant-contrat non repris, différent, ou ajouté', () => {
  const ref = { champs: { prixMobilier: { valeur: 3000 } } };
  const sans = { champs: {} };
  const autre = { champs: { prixMobilier: { valeur: 4000 } } };
  const titres = (a, b) => app.comparerCompromisEtProjet(a, b).map(c => c.titre).join('|');
  assert.match(titres(ref, sans), /Mobilier non repris/);
  assert.match(titres(ref, autre), /Mobilier différent/);
  assert.match(titres({ champs: { prixMobilier: { valeur: null } } }, autre), /Mobilier ajouté/);
  // Référence muette (dossier créé avant la détection) : aucune conclusion.
  assert.doesNotMatch(titres(sans, autre), /Mobilier/);
  assert.doesNotMatch(titres(ref, { champs: { prixMobilier: { valeur: 3000 } } }), /Mobilier/);
});

test('le mobilier est conservé à l’import d’une sauvegarde', () => {
  const d = app.normaliserDossierImporte({ id: 'x', nom: 'A / B', prixVente: 200000, prixMobilier: 3000 });
  assert.strictEqual(d.prixMobilier, 3000);
  assert.strictEqual(app.normaliserDossierImporte({ id: 'y', nom: 'A / B', prixMobilier: 'abc' }).prixMobilier, null);
});

test('mobilier et prix gardés en texte : comparés en nombres, plus d’alerte pour 6 000 € dans 210 077 € (étude 23/10)', () => {
  const code = (ex) => app.controlerCoherence(ex).some(a => a.code === 'MOBILIER_SUPERIEUR_PRIX');
  const ex = (prix, mobilier) => ({ champs: { prixVente: { valeur: prix }, prixMobilier: { valeur: mobilier } }, parties: [], notaires: {}, bien: null });
  assert.equal(code(ex('210.077,00', '6.000,00')), false);
  assert.equal(code(ex(210077, 6000)), false);
  assert.equal(code(ex('100.000,00', '120.000,00')), true, 'un mobilier supérieur au prix reste signalé');
  assert.equal(code(ex(100000, 120000)), true);
});
