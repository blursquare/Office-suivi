'use strict';

// Outil 2 (Audit des actes) — durées de validité des diagnostics (server/src/audit/diagnostics.js).
// Règle absolue du cahier des charges (§4/§14) : ne jamais inventer une durée de validité — chaque
// cas non calculable doit le dire explicitement plutôt que de deviner.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DUREES_VALIDITE_DIAGNOSTIC, calculerValiditeDiagnostic } = require('../src/audit/diagnostics');

test('DPE valide dans les 10 ans, expiré au-delà', () => {
  const valide = calculerValiditeDiagnostic('DPE', '2020-01-15', '2026-01-01');
  assert.equal(valide.statut, 'VALIDE');
  assert.equal(valide.dateExpiration, '2030-01-15');
  const expire = calculerValiditeDiagnostic('DPE', '2015-01-15', '2026-01-01');
  assert.equal(expire.statut, 'EXPIRE');
  assert.equal(expire.valide, false);
});

test('ERP valide 6 mois, termites valide 6 mois', () => {
  assert.equal(calculerValiditeDiagnostic('ERP', '2026-06-01', '2026-09-01').statut, 'VALIDE');
  assert.equal(calculerValiditeDiagnostic('ERP', '2026-01-01', '2026-09-01').statut, 'EXPIRE');
  assert.equal(calculerValiditeDiagnostic('TERMITES', '2026-06-01', '2026-09-01').statut, 'VALIDE');
});

test('électricité et gaz valides 3 ans', () => {
  assert.equal(calculerValiditeDiagnostic('ELECTRICITE', '2024-01-01', '2026-06-01').statut, 'VALIDE');
  assert.equal(calculerValiditeDiagnostic('GAZ', '2022-01-01', '2026-06-01').statut, 'EXPIRE');
});

test('type de diagnostic inconnu : jamais de durée inventée', () => {
  const r = calculerValiditeDiagnostic('DIAGNOSTIC_INEXISTANT', '2020-01-01', '2026-01-01');
  assert.equal(r.statut, 'NATURE_INCONNUE');
  assert.equal(r.dateExpiration, null);
  assert.equal(r.valide, null);
});

test('plomb, amiante, assainissement, mesurage : jamais de durée calculée automatiquement', () => {
  for (const nature of ['PLOMB', 'AMIANTE', 'ASSAINISSEMENT', 'MESURAGE']) {
    const r = calculerValiditeDiagnostic(nature, '2020-01-01', '2026-01-01');
    assert.equal(r.statut, 'NON_CALCULABLE', nature);
    assert.equal(r.dateExpiration, null, nature);
    assert.ok(r.message && r.message.length > 0, nature);
  }
});

test('date d’établissement manquante : jamais de calcul silencieux', () => {
  const r = calculerValiditeDiagnostic('DPE', null, '2026-01-01');
  assert.equal(r.statut, 'DATE_MANQUANTE');
  assert.equal(r.dateExpiration, null);
});

test('date d’établissement illisible : jamais de calcul silencieux', () => {
  const r = calculerValiditeDiagnostic('DPE', 'pas une date', '2026-01-01');
  assert.equal(r.statut, 'DATE_INVALIDE');
});

test('sans dateReference fournie, se rabat sur aujourd’hui', () => {
  const r = calculerValiditeDiagnostic('DPE', '2000-01-01', undefined);
  assert.equal(r.statut, 'EXPIRE');
});

test('DUREES_VALIDITE_DIAGNOSTIC couvre les 9 natures attendues', () => {
  assert.deepEqual(
    Object.keys(DUREES_VALIDITE_DIAGNOSTIC).sort(),
    ['AMIANTE', 'ASSAINISSEMENT', 'DPE', 'ELECTRICITE', 'ERP', 'GAZ', 'MESURAGE', 'PLOMB', 'TERMITES']
  );
});

test('validité calée sur le 29 février d’une année bissextile ne plante pas', () => {
  const r = calculerValiditeDiagnostic('ELECTRICITE', '2024-02-29', '2027-01-01');
  assert.equal(r.statut, 'VALIDE');
  assert.equal(r.dateExpiration, '2027-02-28');
});
