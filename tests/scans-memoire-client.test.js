'use strict';
// Claire Scan, côté poste : la mémoire entre dans la proposition, l'apprentissage et le rendu (client/95-scan-memoire.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const D = (id, nom, extra) => Object.assign({ id, nom, archive: false, nasDossier: 'X/' + nom, parties: [], referenceAuthentic: '' }, extra || {});

test('mémoire : une référence d’Authentic lue dans le scan désigne le dossier', () => {
  const app = chargerApplication();
  const dossiers = [D('a', 'VTE MARTIN', { referenceAuthentic: 'A 2026 00247' }), D('b', 'VTE LEROY')];
  const sans = app.identifierDossierScan('Dossier A 2026 00247 courrier', dossiers);
  assert.equal(sans.dossier, null);
  const avec = app.identifierDossierScan('Dossier A 2026 00247 courrier', dossiers, { types: [], identifiants: [] });
  assert.equal(avec.dossier.id, 'a');
  assert.ok(avec.raisons.some(r => /Authentic/.test(r)));
});

test('mémoire : un type appris est proposé quand les règles ne reconnaissent rien', () => {
  const app = chargerApplication();
  const texte = 'ATTESTATION ENTRETIEN CHAUDIERE annuelle contrat maintenance';
  const mots = app.motsEmpreinteScan(texte, []);
  const memoire = { types: [{ mots, type: 'entretienChaudiere', n: 1 }], identifiants: [] };
  const r = app.typeScanAvecMemoire(null, mots, memoire);
  assert.equal(r.viaMemoire, true);
  assert.equal(r.type.cle, 'entretienChaudiere');
  assert.equal(app.typeScanAvecMemoire(null, mots, { types: [], identifiants: [] }).viaMemoire, false);
});

test('doublon : un scan identique à un scan rangé n’est jamais rangé seul', () => {
  const app = chargerApplication();
  const d = D('a', 'VTE MARTIN', { parties: [{ nom: 'Paul MARTIN', role: 'VENDEUR' }, { nom: 'Sophie DURAND', role: 'ACQUEREUR' }] });
  const lecture = { texte: 'CARTE NATIONALE D’IDENTITÉ Nom : MARTIN Prénom(s) : Paul Monsieur Paul MARTIN Sophie DURAND' };
  const normal = app.propositionScan(lecture, [d], '2026-10-01', null, {});
  const double = app.propositionScan(lecture, [d], '2026-10-01', null, { doublon: { date: '2026-09-30', dossier: 'VTE MARTIN' } });
  assert.equal(double.automatique, false);
  assert.equal(normal.automatique, !!(normal.type && normal.dossierSur));
  assert.ok(double.doublon);
});

test('apprentissage et correction à la main', () => {
  const app = chargerApplication();
  const d = D('a', 'VTE MARTIN', { parties: [{ nom: 'Paul MARTIN', role: 'VENDEUR' }] });
  const ap = app.apprentissageScan({ page1: 'Contrat entretien chaudière Monsieur Paul MARTIN', texte: 'Contrat entretien chaudière Monsieur Paul MARTIN' }, d, { type: 'entretienChaudiere' });
  assert.equal(ap.type, 'entretienChaudiere');
  assert.ok(ap.mots.includes('contrat') && !ap.mots.includes('martin'));
  assert.equal(app.rangementCorrigeScan({ type: 'a', dossierId: 'x' }, { type: 'b', dossierId: 'x' }), true);
  assert.equal(app.rangementCorrigeScan({ type: 'a', dossierId: 'x' }, { type: 'a', dossierId: 'x' }), false);
  assert.equal(app.apprentissageScan(null, d, {}), null);
});

test('rendu : confiance, étiquettes, statistiques et recherche sont échappés', () => {
  const app = chargerApplication();
  const c = app.htmlConfianceScan({ score: 5, dossierId: 'a', dossierSur: true, raisons: ['x'], second: 0 });
  assert.match(c, /scan-confiance sur/);
  assert.equal((c.match(/class="plein"/g) || []).length, 5);
  const e = app.htmlEtiquettesScan({ viaMemoire: true }, { doublon: { date: '2026-09-30', dossier: '<b>X</b>' } });
  assert.match(e, /Type appris/);
  assert.match(e, /Déjà rangé/);
  assert.ok(!/<b>X/.test(e));
  assert.equal(app.htmlStatsScans(null), '');
  assert.match(app.htmlStatsScans({ jours: 30, ranges: 10, automatiques: 5, corriges: 2, typesCorriges: [{ type: 'facture', n: 2 }] }), /50 % rangés seuls/);
});
