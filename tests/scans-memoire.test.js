'use strict';

// Mémoire de Claire Scan (commun/scans-memoire.js) : types corrigés par l'étude, identifiants, références d'Authentic.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../commun/scans-memoire.js');

test('empreinte : mots de quatre lettres, sans chiffre, sans les noms du dossier, sans doublon', () => {
  const mots = M.motsEmpreinteScan('CREDIT AGRICOLE — Contrat de maintenance n° 12345\nMonsieur Paul FOURNIER, contrat de maintenance', ['fournier', 'paul']);
  assert.deepEqual(mots, ['credit', 'agricole', 'contrat', 'maintenance', 'monsieur']);
  assert.deepEqual(M.motsEmpreinteScan('', []), []);
  assert.ok(M.motsEmpreinteScan('mot '.repeat(10) + Array.from({ length: 80 }, (_, i) => 'zzz' + String.fromCharCode(97 + (i % 26)).repeat(2 + Math.floor(i / 26))).join(' ')).length <= 40);
});

test('similarité et type mémorisé : au-dessus du seuil seulement, le plus confirmé départage', () => {
  const a = ['contrat', 'maintenance', 'chaudiere', 'entretien'];
  assert.equal(M.similariteMots(a, a), 1);
  assert.equal(M.similariteMots(a, ['facture']), 0);
  const entrees = [{ mots: a, type: 'entretienChaudiere', n: 2 }, { mots: ['facture', 'travaux'], type: 'facture', n: 5 }];
  assert.equal(M.typeDepuisMemoireScan(['contrat', 'maintenance', 'chaudiere'], entrees).type, 'entretienChaudiere');
  assert.equal(M.typeDepuisMemoireScan(['contrat'], entrees), null);
  assert.equal(M.typeDepuisMemoireScan(a, []), null);
});

test('fusion des types : confirmé (+1), remplacé par la dernière correction, ajouté, borné', () => {
  const m1 = ['contrat', 'maintenance', 'chaudiere', 'entretien'];
  let t = M.fusionnerTypeMemoire([], m1, 'entretienChaudiere', '2026-10-20T10:00:00Z');
  assert.equal(t.length, 1);
  t = M.fusionnerTypeMemoire(t, m1, 'entretienChaudiere', '2026-10-21T10:00:00Z');
  assert.equal(t[0].n, 2);
  t = M.fusionnerTypeMemoire(t, m1, 'ramonage', '2026-10-22T10:00:00Z');
  assert.equal(t.length, 1);
  assert.equal(t[0].type, 'ramonage');
  assert.equal(t[0].n, 1);
  t = M.fusionnerTypeMemoire(t, ['facture', 'travaux', 'toiture', 'artisan'], 'facture', '2026-10-23T10:00:00Z');
  assert.equal(t.length, 2);
  assert.equal(M.fusionnerTypeMemoire(t, ['un', 'deux'], 'facture', 'x').length, 2, 'trop peu de mots : rien appris');
  const beaucoup = Array.from({ length: 400 }, (_, i) => ({ mots: ['a' + i, 'b' + i, 'c' + i, 'd' + i], type: 't', n: 1, maj: String(1000 + i) }));
  assert.equal(M.fusionnerTypeMemoire(beaucoup, ['neuf', 'mots', 'tout', 'autre'], 'x', '9999').length, 300);
});

test('identifiants : numéros longs, IBAN, références ; ni téléphone, ni SIREN, ni SIRET, ni montant', () => {
  const texte = 'Contrat n° 20260123456 — IBAN FR76 3000 6000 0112 3456 7890 189 — Réf. PR-2026-0123 — Tél 02 54 95 28 97 ou 0254952897 — SIREN 732829320 — SIRET 73282932000074 — somme 250 000,00 €';
  const ids = M.identifiantsDepuisTexteScan(texte);
  assert.ok(ids.includes('20260123456'));
  assert.ok(ids.some((x) => x.startsWith('FR7630006000')));
  assert.ok(ids.includes('PR20260123'));
  assert.ok(!ids.includes('0254952897'));
  assert.ok(!ids.includes('732829320'));
  assert.ok(!ids.includes('73282932000074'));
  assert.ok(ids.length <= 12);
  assert.equal(M.luhnValide('732829320'), true);
  assert.deepEqual(M.identifiantsDepuisTexteScan(''), []);
});

test('références d’Authentic et points par dossier : référence +6, identifiant mémorisé +3, identifiant ambigu rien', () => {
  assert.deepEqual(M.referencesAuthenticDansTexte('Dossier A 2026 00247 et a 2026 00300 puis B 2026 00001'), ['A202600247']);
  const dossiers = [{ id: 'd1', referenceAuthentic: 'A 2026 00247' }, { id: 'd2', referenceAuthentic: 'A 2026 00300' }];
  const p = M.pointsMemoireParDossier('Votre dossier A 2026 00247 — contrat 20260123456 — prêt 99887766554', dossiers,
    [{ id: '20260123456', dossierId: 'd2' }, { id: '99887766554', dossierId: '' }]);
  assert.equal(p.d1.points, 6);
  assert.equal(p.d2.points, 3);
  assert.match(p.d1.raisons[0], /référence d’Authentic \+6/);
  assert.equal(Object.keys(p).length, 2);
});

test('fusion des identifiants : lié à un dossier, ambigu s’il en voit deux, borné', () => {
  let t = M.fusionnerIdentifiantsMemoire([], ['20260123456', 'court'], 'd1', '2026-10-20T10:00:00Z');
  assert.deepEqual(t.map((e) => [e.id, e.dossierId]), [['20260123456', 'd1']]);
  t = M.fusionnerIdentifiantsMemoire(t, ['20260123456'], 'd1', '2026-10-21T10:00:00Z');
  assert.equal(t[0].dossierId, 'd1');
  t = M.fusionnerIdentifiantsMemoire(t, ['20260123456'], 'd2', '2026-10-22T10:00:00Z');
  assert.equal(t[0].dossierId, '', 'vu dans deux dossiers : plus rien n’est attribué');
  t = M.fusionnerIdentifiantsMemoire(t, ['20260123456'], 'd2', '2026-10-23T10:00:00Z');
  assert.equal(t[0].dossierId, '', 'une fois ambigu, il le reste');
  const gros = Array.from({ length: 3100 }, (_, i) => ({ id: String(10000000 + i), dossierId: 'd', maj: String(i) }));
  assert.equal(M.fusionnerIdentifiantsMemoire(gros, ['88888888'], 'd', '9999').length, 3000);
});
