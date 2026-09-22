'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

// Jeu de référence : sans prisée 7 800 € de droits, avec prisée 5 400 €, soit 2 400 € d'économie
// brute ; un inventaire à 300 + 600 + 300 = 1 200 €, plus un serment à 240 €.
function saisieType(extra) {
  return Object.assign({
    droitsSans: '7800',
    droitsAvec: '5400',
    fraisOuverture: '300',
    prisee: '600',
    fraisCloture: '300',
    sermentNb: '1',
    sermentUnit: '240',
    trajetActif: false,
    trajetNb: '',
    trajetUnit: ''
  }, extra || {});
}

test('calculerArbitrageInventaire additionne le coût et en déduit l\'économie nette', () => {
  const r = app.calculerArbitrageInventaire(saisieType());
  assert.strictEqual(r.complet, true);
  assert.strictEqual(r.brutes, 2400);
  assert.strictEqual(r.cout, 1440);
  assert.strictEqual(r.net, 960);
});

// Les deux simulations de droits sont indispensables : sans elles il n'y a rien à comparer, et un
// verdict rendu sur un écran vierge afficherait « Non recommandé » à quelqu'un qui n'a rien saisi.
test('un champ de droits laissé vide rend le calcul incomplet, jamais un verdict', () => {
  for (const manquant of ['droitsSans', 'droitsAvec']) {
    const r = app.calculerArbitrageInventaire(saisieType({ [manquant]: '' }));
    assert.strictEqual(r.complet, false, manquant);
    assert.strictEqual(r.net, 0, manquant);
    assert.strictEqual(app.verdictArbitrageInventaire(r).cle, 'indetermine', manquant);
  }
  assert.strictEqual(app.verdictArbitrageInventaire(undefined).cle, 'indetermine');
});

// Un poste de coût vide vaut zéro (rien à compter), ce qui n'a rien à voir avec un champ de droits
// vide (pas encore renseigné) : seuls ces derniers bloquent le verdict.
test('les postes de coût laissés vides valent zéro sans bloquer le calcul', () => {
  const r = app.calculerArbitrageInventaire({ droitsSans: '5000', droitsAvec: '4000' });
  assert.strictEqual(r.complet, true);
  assert.strictEqual(r.cout, 0);
  assert.strictEqual(r.net, 1000);
});

test('les trajets ne comptent que si la case est cochée', () => {
  const sans = app.calculerArbitrageInventaire(saisieType({ trajetNb: '2', trajetUnit: '50' }));
  assert.strictEqual(sans.cout, 1440);
  const avec = app.calculerArbitrageInventaire(
    saisieType({ trajetActif: true, trajetNb: '2', trajetUnit: '50' })
  );
  assert.strictEqual(avec.cout, 1540);
  assert.strictEqual(avec.net, 860);
});

// Aucun poste n'apparaît au décompte tant qu'il n'est pas chiffré : tous les dossiers n'ont ni
// comparant absent ni déplacement, et « − 0 € » n'apprend rien à personne.
test('le décompte n\'affiche que les postes chiffrés', () => {
  const nu = app.calculerArbitrageInventaire(saisieType({ sermentNb: '0' }));
  assert.strictEqual(nu.lignes.map(l => l.cle).join(','), 'ouverture,prisee,cloture');

  const partiel = app.calculerArbitrageInventaire(saisieType({ fraisOuverture: '', fraisCloture: '0' }));
  assert.strictEqual(partiel.lignes.map(l => l.cle).join(','), 'prisee,serment');
  const complet = app.calculerArbitrageInventaire(
    saisieType({ trajetActif: true, trajetNb: '1', trajetUnit: '80' })
  );
  assert.strictEqual(complet.lignes.map(l => l.cle).join(','), 'ouverture,prisee,cloture,serment,trajet');
});

// Un coût négatif gonflerait silencieusement l'économie affichée : il est ramené à zéro.
test('un montant de coût négatif est ramené à zéro', () => {
  const r = app.calculerArbitrageInventaire(saisieType({ prisee: '-600' }));
  assert.strictEqual(r.cout, 840);
});

// Cas réel : le mobilier vaut PLUS que le forfait de 5 %, la prisée coûte donc des droits en plus.
test('des droits plus élevés avec prisée donnent une économie brute négative', () => {
  const r = app.calculerArbitrageInventaire(saisieType({ droitsSans: '5400', droitsAvec: '7800' }));
  assert.strictEqual(r.brutes, -2400);
  assert.strictEqual(app.verdictArbitrageInventaire(r).cle, 'defavorable');
});

test('le verdict bascule sur le signe de l\'économie nette, zéro compris', () => {
  const gagnant = app.calculerArbitrageInventaire(saisieType());
  assert.strictEqual(app.verdictArbitrageInventaire(gagnant).cle, 'favorable');

  // Économie brute de 1 440 € exactement absorbée par le coût : rien n'est gagné, donc rien à
  // recommander — la bascule est bien à « strictement positif », pas à « positif ou nul ».
  const nul = app.calculerArbitrageInventaire(saisieType({ droitsSans: '6840' }));
  assert.strictEqual(nul.net, 0);
  assert.strictEqual(app.verdictArbitrageInventaire(nul).cle, 'defavorable');

  const perdant = app.calculerArbitrageInventaire(saisieType({ droitsSans: '6000' }));
  assert.ok(perdant.net < 0);
  assert.strictEqual(app.verdictArbitrageInventaire(perdant).cle, 'defavorable');
});

// Les trois verdicts prennent leur couleur dans les jetons déjà réservés (aucune couleur inventée
// pour cet écran), et chacun porte un message : une pastille sans phrase ne dirait pas pourquoi.
test('chaque verdict porte un libellé, un jeton de couleur existant et un message', () => {
  const attendus = { indetermine: 'dl-neutre', defavorable: 'dl-urgent', favorable: 'dl-success' };
  for (const [cle, dl] of Object.entries(attendus)) {
    const v = app.VERDICTS_INVENTAIRE[cle];
    assert.ok(v, cle);
    assert.strictEqual(v.dl, dl, cle);
    assert.ok(v.libelle && v.libelle.length > 2, cle);
    assert.ok(v.message && v.message.length > 20, cle);
  }
});

test('une virgule décimale est acceptée comme un point', () => {
  const r = app.calculerArbitrageInventaire({ droitsSans: '1000', droitsAvec: '0', prisee: '12,50' });
  assert.strictEqual(r.cout, 12.5);
  assert.strictEqual(r.net, 987.5);
});
