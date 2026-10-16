'use strict';
// Constitution de dossier : zonage et droits de préemption (étude 16/10). Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('zonage : DIA et SAFER déduits de l’analyse, zone de chaque parcelle', () => {
  const p = { le: '2026-10-16T10:00:00Z', droits: [
    { cle: 'dpu', titre: 'Droit de préemption urbain', statut: 'oui', motif: 'zone UA du PLUi' },
    { cle: 'safer', titre: 'SAFER', statut: 'non', motif: 'zone U' }],
    parcelles: [{ parcelle: 'AB 100', zone: 'UA', famille: 'U' }, { parcelle: 'AB 101', zone: '', famille: '' }] };
  const z = app.zonageConstitution(p);
  assert.equal(z.dia.texte, 'DIA à déposer');
  assert.equal(z.safer.texte, 'Pas de SAFER');
  assert.equal(z.zones.map(x => `${x.parcelle}:${x.zone}`).join('|'), 'AB 100:UA|AB 101:zone non lue');
});

test('zonage : droit absent ou à vérifier → « À vérifier », jamais « non » ; sans analyse → rien', () => {
  const z = app.zonageConstitution({ droits: [{ cle: 'safer', titre: 'SAFER', statut: 'oui', motif: 'zone A' }, { cle: 'foret-preference', titre: 'Droit de préférence', statut: 'oui' }] });
  assert.equal(z.dia.texte, 'À vérifier');
  assert.equal(z.safer.texte, 'SAFER à notifier');
  assert.equal(z.autres.join(','), 'Droit de préférence');
  assert.equal(app.zonageConstitution(null), null);
  assert.equal(app.zonageConstitution({ zone: 'UA' }), null);
});

const ligne = (libelle, f) => ({ cle: libelle, libelle, statut: 'ok', zone: f + 'a', typezone: f, lue: f, famille: f });
const cles = (groupes) => groupes.flatMap(g => g.questions.map(q => q.cle));

test('questions selon la zone : urbaine → DPU (commune, bien) ; agricole → SAFER, bois et forêts ; copropriété seulement en copropriété', () => {
  const urbaine = app.questionsUrbanismeConstitution({ droits: [], lignes: [ligne('AB 100', 'U')], reponses: { mutation: 'vente', bien: 'maison' } }, 'maison');
  assert.equal(urbaine.length, 1);
  assert.match(urbaine[0].titre, /Zone urbaine \(U\)/);
  assert.ok(cles(urbaine).includes('dpuInstitue') && cles(urbaine).includes('achevementMoins4ans'));
  assert.ok(!cles(urbaine).includes('massif4ha'), 'pas de question des bois en zone urbaine (sauf si l’analyse la demande)');
  assert.ok(!cles(urbaine).includes('reglementPlusDe10ans'));
  const agricole = app.questionsUrbanismeConstitution({ droits: [], lignes: [ligne('ZK 5', 'A')], reponses: { mutation: 'vente', bien: 'terrain_nu' } }, 'terre');
  assert.ok(cles(agricole).includes('seuilSafer') && cles(agricole).includes('bois'));
  assert.ok(!cles(agricole).includes('achevementMoins4ans'));
  assert.ok(!cles(agricole).includes('donationEntreParents'), 'nature de la mutation : pas pour une vente');
  const copro = app.questionsUrbanismeConstitution({ droits: [], lignes: [ligne('AB 100', 'U')], reponses: { mutation: 'vente', bien: 'lot_copropriete' } }, 'copropriete');
  assert.ok(cles(copro).includes('reglementPlusDe10ans'));
});

test('parcelles mixtes : un groupe par zone, chacun nomme ses parcelles ; une question n’est posée qu’une fois ; les dues en tête', () => {
  const g = app.questionsUrbanismeConstitution({ droits: [], lignes: [ligne('AB 100', 'U'), ligne('AB 101', 'A'), ligne('AB 102', 'A')], reponses: { mutation: 'vente', bien: 'maison' } }, 'maison');
  assert.equal(g.map(x => x.titre).join(' | '), 'Zone urbaine (U) | Zone agricole (A)');
  assert.equal(g[1].parcelles.join(','), 'AB 101,AB 102');
  const toutes = cles(g);
  assert.equal(toutes.length, new Set(toutes).size, 'chaque question une seule fois');
  g.forEach(x => { const due = x.questions.map(q => q.due); assert.equal(due.join(), due.slice().sort((a, b) => Number(b) - Number(a)).join()); });
  assert.equal(app.questionsUrbanismeConstitution(null, 'maison').length, 0);
});

test('une même parcelle à cheval sur deux zones : dans les deux groupes, « en partie » pour l’autre ; zone choisie par l’étude → un seul groupe', () => {
  const l = Object.assign(ligne('AB 100', 'U'), { autresFamilles: ['A'] });
  const g = app.questionsUrbanismeConstitution({ droits: [], lignes: [l], reponses: { mutation: 'vente', bien: 'maison' } }, 'maison');
  assert.equal(g.map(x => x.titre + ':' + x.parcelles.join(',')).join(' | '), 'Zone urbaine (U):AB 100 | Zone agricole (A):AB 100 (en partie)');
  assert.ok(cles(g).includes('seuilSafer') || g[1].questions.length > 0, 'questions de la zone agricole posées');
  const choisie = app.questionsUrbanismeConstitution({ droits: [], lignes: [Object.assign({}, l, { choisie: true })], reponses: { mutation: 'vente', bien: 'maison' } }, 'maison');
  assert.equal(choisie.length, 1);
  const z = app.zonageConstitution({ droits: [], lignes: [l] });
  assert.match(z.zones[0].zone, /en partie A/);
});
