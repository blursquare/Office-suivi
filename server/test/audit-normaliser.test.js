'use strict';

// Outil 2 (Audit des actes) — normalisation par passe (server/src/audit/normaliser.js). Whitelist
// stricte sur la forme (énumérations, types), permissive sur le contenu (une passe qui ne trouve
// rien n'est pas une erreur) — même discipline que server/src/extraction/normaliser.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normaliserPasseIdentification, normaliserPasseDiagnostics, normaliserPasseTravaux,
  normaliserPasseUrbanisme, normaliserPasseCopropriete,
  validerPasseIdentification, validerPasseDiagnostics, validerPasseTravaux,
  validerPasseUrbanisme, validerPasseCopropriete
} = require('../src/audit/normaliser');

test('normaliserPasseIdentification garde la catégorie si valide, l’efface sinon', () => {
  const r = normaliserPasseIdentification({
    constats: [
      { categorie: 'PARTIES', gravite: 'CRITIQUE', titre: 'A', sources: [] },
      { categorie: 'FANTAISIE', gravite: 'INFORMATION', titre: 'B', sources: [] }
    ]
  });
  assert.equal(r.constats[0].categorie, 'PARTIES');
  assert.equal(r.constats[1].categorie, null);
});

test('normaliserPasseIdentification rejette un constat sans titre', () => {
  const r = normaliserPasseIdentification({ constats: [{ categorie: 'PARTIES', gravite: 'CRITIQUE', sources: [] }] });
  assert.equal(r.constats.length, 0);
});

test('normaliserPasseIdentification remplace une gravité hors énumération par A_VERIFIER', () => {
  const r = normaliserPasseIdentification({ constats: [{ categorie: 'PRIX', gravite: 'GRAVE', titre: 'X', sources: [] }] });
  assert.equal(r.constats[0].gravite, 'A_VERIFIER');
});

test('normaliserPasseDiagnostics écarte une entrée sans extrait, replie une nature inconnue sur AUTRE', () => {
  const r = normaliserPasseDiagnostics({
    diagnostics: [
      { nature: 'DPE', document: 'a.pdf', dateEtablissement: '2020-01-01', extrait: '' },
      { nature: 'INCONNU_X', document: 'b.pdf', dateEtablissement: '2020-01-01', extrait: 'un extrait valable' }
    ]
  });
  assert.equal(r.diagnostics.length, 1);
  assert.equal(r.diagnostics[0].nature, 'AUTRE');
});

test('normaliserPasseDiagnostics rejette une date non ISO', () => {
  const r = normaliserPasseDiagnostics({ diagnostics: [{ nature: 'DPE', dateEtablissement: '01/01/2020', extrait: 'un extrait' }] });
  assert.equal(r.diagnostics[0].dateEtablissement, null);
});

test('normaliserPasseTravaux et normaliserPasseCopropriete n’ajoutent pas de champ categorie', () => {
  const t = normaliserPasseTravaux({ travaux: [{ gravite: 'IMPORTANT', titre: 'X', sources: [] }] });
  assert.equal(t.travaux[0].categorie, undefined);
  const c = normaliserPasseCopropriete({ copropriete: [{ gravite: 'INFORMATION', titre: 'Y', sources: [] }] });
  assert.equal(c.copropriete[0].categorie, undefined);
});

test('normaliserPasseUrbanisme accepte les 5 catégories attendues', () => {
  for (const cat of ['URBANISME', 'AUTORISATION', 'GARANTIE', 'PREEMPTION', 'SERVITUDE']) {
    const r = normaliserPasseUrbanisme({ constats: [{ categorie: cat, gravite: 'INFORMATION', titre: 'X', sources: [] }] });
    assert.equal(r.constats[0].categorie, cat);
  }
});

test('les validateurs exigent un objet JSON et une liste au bon endroit', () => {
  assert.equal(validerPasseIdentification(null), 'la réponse doit être un objet JSON');
  assert.equal(validerPasseIdentification({ constats: 'pas une liste' }), '"constats" doit être une liste');
  assert.equal(validerPasseIdentification({ constats: [] }), null);
  assert.equal(validerPasseDiagnostics({ diagnostics: [] }), null);
  assert.equal(validerPasseTravaux({ travaux: 'x' }), '"travaux" doit être une liste');
  assert.equal(validerPasseUrbanisme({ constats: [] }), null);
  assert.equal(validerPasseCopropriete({ copropriete: [] }), null);
});
