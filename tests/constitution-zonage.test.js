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

test('questions du Contrôle de l’urbanisme : commune, bien, rural ; copropriété seulement en copropriété ; les dues en tête', () => {
  const p = { droits: [{ cle: 'dpu', titre: 'Droit de préemption urbain', statut: 'verifier' }],
    lignes: [{ cle: 'AB 1', libelle: 'AB 1', statut: 'ok', zone: 'A', typezone: 'A', lue: true, famille: 'A' }], reponses: { bien: 'terrain_nu', mutation: 'vente' } };
  const maison = app.questionsUrbanismeConstitution(p, 'maison');
  assert.equal(maison.map(g => g.titre).join(','), 'La commune,Le bien,Rural, bois et forêts');
  const cles = maison.flatMap(g => g.questions.map(q => q.cle));
  assert.ok(!cles.includes('reglementPlusDe10ans'), 'question de copropriété absente pour une maison');
  assert.ok(cles.includes('bois') && cles.includes('seuilSafer') && cles.includes('dpuInstitue'));
  assert.ok(!cles.includes('donationEntreParents'), 'nature de la mutation : pas pour une vente');
  const copro = app.questionsUrbanismeConstitution(p, 'copropriete').flatMap(g => g.questions.map(q => q.cle));
  assert.ok(copro.includes('reglementPlusDe10ans'));
  maison.forEach(g => { const due = g.questions.map(q => q.due); assert.equal(due.join(), due.slice().sort((a, b) => Number(b) - Number(a)).join()); });
  assert.equal(app.questionsUrbanismeConstitution(null, 'maison').length, 0);
});
