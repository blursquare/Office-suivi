'use strict';
// Parcelles lues d'Authentic entre deux passages : aucune ne se perd — deux « AB 12 » de communes différentes sont deux parcelles, et les
// plafonds (300 parcelles par bien, 40 biens) sont larges. Noms et lieux inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const refs = (parcelles) => parcelles.map(p => `${p.section} ${p.numero}${p.commune ? ' ' + p.commune : ''}`).join(', ');

test('même parcelle, deux communes : la fiche garde les deux, passage après passage', () => {
  const d = { id: 'v1', typeVente: 'terre', adresseBien: '', bien: { cadastre: { parcelles: [{ section: 'AB', numero: '12', commune: 'BLOIS' }] } }, authentic: {} };
  const bien = { adresse: null, parcelles: [{ section: 'AB', numero: '12', commune: 'BLOIS' }, { section: 'AB', numero: '12', commune: 'VINEUIL' }] };
  for (let passage = 0; passage < 3; passage++) app.appliquerBienAuthentic(d, bien, () => {}, {}, { sansRetenir: true });
  assert.equal(refs(d.bien.cadastre.parcelles), 'AB 12 BLOIS, AB 12 VINEUIL');
});

test('fusion des immeubles : deux « AB 12 » de communes différentes dans un même immeuble restent deux', () => {
  const avant = [{ adresse: 'BLOIS (41000), 1 rue Imaginaire', commune: 'BLOIS', parcelles: [{ section: 'AB', numero: '12', commune: 'BLOIS' }] }];
  const apres = app.fusionnerImmeubleAuthentic(avant, { adresse: 'BLOIS (41000), 1 rue Imaginaire', commune: 'BLOIS', parcelles: [{ section: 'AB', numero: '12', commune: 'BLOIS' }, { section: 'AB', numero: '12', commune: 'VINEUIL' }] });
  assert.equal(refs(apres[0].parcelles), 'AB 12 BLOIS, AB 12 VINEUIL');
  // Commune inconnue d'un côté : la même parcelle, pas un doublon.
  const sans = app.fusionnerImmeubleAuthentic(apres, { adresse: 'BLOIS (41000), 1 rue Imaginaire', commune: 'BLOIS', parcelles: [{ section: 'AB', numero: '12' }] });
  assert.equal(sans, null, 'rien de nouveau');
});

test('dossier de terres : 60 parcelles sur un bien, rien n’est coupé', () => {
  const parcelles = Array.from({ length: 60 }, (_, i) => ({ section: 'ZA', numero: String(i + 1), commune: 'COUR-CHEVERNY' }));
  const liste = app.fusionnerImmeubleAuthentic([], { adresse: '', commune: 'COUR-CHEVERNY', parcelles });
  assert.equal(liste[0].parcelles.length, 60);
  const d = { id: 'v2', typeVente: 'terre', bien: {}, authentic: {} };
  app.appliquerBienAuthentic(d, { adresse: null, parcelles }, () => {}, {}, { sansRetenir: true });
  assert.equal(d.bien.cadastre.parcelles.length, 60);
  assert.equal(app.parcellesExportAuthentic({ immeubles: [{ id: 'a', parcelles }] }).length, 60);
});

test('export Authentic : deux « AB 12 » de communes différentes ne sont pas fondues', () => {
  const p = app.parcellesExportAuthentic({ immeubles: [{ id: 'a', parcelles: [{ section: 'AB', numero: '12', commune: 'BLOIS' }, { section: 'AB', numero: '12', commune: 'VINEUIL' }, { section: 'AB', numero: '12', commune: 'BLOIS' }] }] });
  assert.equal(p.length, 2);
});
