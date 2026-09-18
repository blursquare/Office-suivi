'use strict';

// Simulateur de prorata (voir la section « SIMULATEUR DE PRORATA » dans script.js) : répartir
// entre vendeur et acquéreur une somme déjà appelée pour une période que la vente coupe en deux.
//
// La convention est celle imposée par l'étude et ne doit pas changer sans nouvelle demande :
//   - jours RÉELS (365, 366 une année bissextile) — jamais de mois forfaitaire de 30 jours ;
//   - le JOUR DE L'ACTE est à la charge de l'ACQUÉREUR, donc compté dans sa part.
// Ces deux points sont testés explicitement : c'est une somme réclamée à un client, un décalage
// d'un jour se voit sur la facture.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('joursEntre compte les deux bornes', () => {
  const app = chargerApplication();
  assert.equal(app.joursEntre('2026-01-01', '2026-01-01'), 1);
  assert.equal(app.joursEntre('2026-01-01', '2026-01-31'), 31);
  assert.equal(app.joursEntre('2026-01-01', '2026-12-31'), 365);
});

test('joursEntre tient compte des années bissextiles', () => {
  const app = chargerApplication();
  assert.equal(app.joursEntre('2028-01-01', '2028-12-31'), 366);
  assert.equal(app.joursEntre('2028-02-01', '2028-02-29'), 29);
});

test('joursEntre ne se décale pas au passage à l’heure d’été', () => {
  // Le dernier dimanche de mars, une différence entre deux dates LOCALES ne fait pas un multiple
  // exact de 86 400 000 ms et le résultat perdait un jour — d'où le calcul en UTC.
  const app = chargerApplication();
  assert.equal(app.joursEntre('2026-03-28', '2026-03-30'), 3);
  assert.equal(app.joursEntre('2026-10-24', '2026-10-26'), 3);
});

test('le jour de l’acte est compté dans la part de l’acquéreur', () => {
  // Acte le 31 décembre sur l'année civile : il ne reste que CE jour à l'acquéreur, pas zéro.
  const app = chargerApplication();
  const r = app.calculerProrata(365, '2026-01-01', '2026-12-31', '2026-12-31');
  assert.equal(r.joursAcquereur, 1);
  assert.equal(r.joursVendeur, 364);
  assert.equal(r.partAcquereur, 1);
});

test('acte le premier jour de la période : tout est à la charge de l’acquéreur', () => {
  const app = chargerApplication();
  const r = app.calculerProrata(1200, '2026-01-01', '2026-12-31', '2026-01-01');
  assert.equal(r.joursAcquereur, 365);
  assert.equal(r.joursVendeur, 0);
  assert.equal(r.partVendeur, 0);
  assert.equal(r.partAcquereur, 1200);
});

test('taxe foncière : cas courant d’une vente en cours d’année', () => {
  // 1 200 € pour 2026, acte le 15 septembre : l'acquéreur doit du 15/09 au 31/12, soit 108 jours.
  const app = chargerApplication();
  const r = app.calculerProrata(1200, '2026-01-01', '2026-12-31', '2026-09-15');
  assert.equal(r.joursPeriode, 365);
  assert.equal(r.joursAcquereur, 108);
  assert.equal(r.joursVendeur, 257);
  assert.equal(r.partAcquereur, Math.round(1200 * 108 / 365 * 100) / 100);
});

test('les deux parts totalisent toujours exactement la somme appelée', () => {
  // La part du vendeur est le COMPLÉMENT, pas un second arrondi : deux arrondis indépendants
  // peuvent faire perdre ou gagner un centime, inacceptable sur une somme réclamée.
  const app = chargerApplication();
  for (const jour of ['2026-01-07', '2026-03-31', '2026-06-13', '2026-11-29']) {
    const r = app.calculerProrata(1000, '2026-01-01', '2026-12-31', jour);
    assert.equal(Math.round((r.partVendeur + r.partAcquereur) * 100) / 100, 1000, jour);
  }
});

test('charges de copropriété au trimestre', () => {
  const app = chargerApplication();
  const r = app.calculerProrata(450, '2026-07-01', '2026-09-30', '2026-08-15');
  assert.equal(r.joursPeriode, 92);
  assert.equal(r.joursAcquereur, 47); // 15/08 → 30/09 inclus
  assert.equal(r.joursVendeur, 45);
});

test('loyer mensuel', () => {
  const app = chargerApplication();
  const r = app.calculerProrata(800, '2026-09-01', '2026-09-30', '2026-09-15');
  assert.equal(r.joursPeriode, 30);
  assert.equal(r.joursAcquereur, 16);
  assert.equal(r.partAcquereur, Math.round(800 * 16 / 30 * 100) / 100);
});

test('un acte hors de la période ne donne aucun résultat', () => {
  // Rien à répartir : la somme est entièrement à l'un ou à l'autre. Le signaler vaut mieux que de
  // rendre 0 % ou 100 % comme si le calcul avait un sens.
  const app = chargerApplication();
  assert.equal(app.calculerProrata(1200, '2026-01-01', '2026-12-31', '2025-12-31'), null);
  assert.equal(app.calculerProrata(1200, '2026-01-01', '2026-12-31', '2027-01-01'), null);
});

test('un montant absent, nul ou négatif ne donne aucun résultat', () => {
  const app = chargerApplication();
  assert.equal(app.calculerProrata(0, '2026-01-01', '2026-12-31', '2026-06-01'), null);
  assert.equal(app.calculerProrata(-500, '2026-01-01', '2026-12-31', '2026-06-01'), null);
  assert.equal(app.calculerProrata(NaN, '2026-01-01', '2026-12-31', '2026-06-01'), null);
  assert.equal(app.calculerProrata(1200, '', '2026-12-31', '2026-06-01'), null);
});

test('une période à l’envers ne donne aucun résultat', () => {
  const app = chargerApplication();
  assert.equal(app.calculerProrata(1200, '2026-12-31', '2026-01-01', '2026-06-01'), null);
});

test('bornesPeriodeProrata cale l’année, le trimestre et le mois autour de la date', () => {
  const app = chargerApplication();
  assert.deepEqual(
    [app.bornesPeriodeProrata('2026-09-15', 'annee').debut, app.bornesPeriodeProrata('2026-09-15', 'annee').fin],
    ['2026-01-01', '2026-12-31']);
  assert.deepEqual(
    [app.bornesPeriodeProrata('2026-09-15', 'trimestre').debut, app.bornesPeriodeProrata('2026-09-15', 'trimestre').fin],
    ['2026-07-01', '2026-09-30']);
  assert.deepEqual(
    [app.bornesPeriodeProrata('2026-09-15', 'mois').debut, app.bornesPeriodeProrata('2026-09-15', 'mois').fin],
    ['2026-09-01', '2026-09-30']);
});

test('bornesPeriodeProrata tombe juste sur février, bissextile ou non', () => {
  // Le dernier jour est calculé en reculant d'un jour depuis le 1er du mois suivant : la seule
  // façon sûre de ne pas se tromper sur un 28/29 février.
  const app = chargerApplication();
  assert.equal(app.bornesPeriodeProrata('2026-02-10', 'mois').fin, '2026-02-28');
  assert.equal(app.bornesPeriodeProrata('2028-02-10', 'mois').fin, '2028-02-29');
  assert.equal(app.bornesPeriodeProrata('2028-02-10', 'trimestre').fin, '2028-03-31');
});

test('bornesPeriodeProrata ne plante pas sur une date absente', () => {
  const app = chargerApplication();
  assert.equal(app.bornesPeriodeProrata('', 'mois'), null);
  assert.equal(app.bornesPeriodeProrata('pas une date', 'mois'), null);
});
