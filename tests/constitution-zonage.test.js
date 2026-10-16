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
