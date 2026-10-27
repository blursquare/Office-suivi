'use strict';

// Pages d'Authentic gardées par dossier (17/10) : la dernière version de chaque page, rattachée au dossier où le poste l'a rangée, relue
// sur la fiche. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { creerPagesAuthentic, clePageAuthentic, pageHorsVenteAuthentic, MAX_PAGES_PAR_DOSSIER, MAX_OCTETS_PAGE } = require('../src/pagesAuthentic');
const { creerRouteurAuthentic } = require('../src/routes/authentic');

// Base avec les dossiers v1, v2 (et ceux demandés) : une page n'est gardée que pour un dossier qui existe.
function baseDossiers(ids = ['v1', 'v2'], archives = []) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE dossiers (id TEXT PRIMARY KEY, data TEXT NOT NULL, responsable TEXT, archive INTEGER NOT NULL DEFAULT 0, pret TEXT, acte TEXT, ventebien TEXT, updated_at INTEGER NOT NULL, deleted_at INTEGER)');
  for (const id of ids) db.prepare('INSERT INTO dossiers (id, data, archive, updated_at) VALUES (?, ?, ?, ?)').run(id, '{}', archives.includes(id) ? 1 : 0, archives.includes(id) ? 0 : Date.now());
  return db;
}
const capture = (n) => ({ titre: 'x', champs: [{ libelle: 'form:ficheClientPhysique:nom', valeur: 'ESSAI' }, { libelle: 'form:ficheClientPhysique:prenom', valeur: 'Léa ' + n }], tableaux: [], texte: '' });

test('magasin : dernière version par clé, 40 pages au plus, résumé sans contenu, identifiant contrôlé', () => {
  const p = creerPagesAuthentic(baseDossiers());
  assert.equal(p.garder('v1', { capture: capture(1), nature: 'client', recueLe: '2026-10-17T08:00:00Z', cle: 'client:lea essai' }), true);
  p.garder('v1', { capture: capture(2), nature: 'client', recueLe: '2026-10-17T09:00:00Z', cle: 'client:lea essai' });
  assert.equal(p.resume('v1').length, 1, 'la page revue remplace la précédente');
  assert.equal(p.pages('v1')[0].capture.champs[1].valeur, 'Léa 2');
  assert.equal(p.resume('v1')[0].capture, undefined);
  for (let i = 0; i < MAX_PAGES_PAR_DOSSIER + 5; i++) p.garder('v2', { capture: capture(i), nature: 'bien', recueLe: `2026-10-17T10:${String(i).padStart(2, '0')}:00Z`, cle: 'bien:' + i });
  assert.equal(p.resume('v2').length, MAX_PAGES_PAR_DOSSIER);
  assert.equal(p.garder('../x', { capture: capture(1) }), false);
  assert.equal(clePageAuthentic('dossier', capture(1)), 'dossier');
  assert.match(clePageAuthentic('client', capture(1)), /^client:/);
});

test('route : une page rangée (applique) est gardée pour son dossier, une page sans dossier jamais', async () => {
  const pages = creerPagesAuthentic(baseDossiers());
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', creerRouteurAuthentic({ pages, origine: () => 'local' }));
  const serveur = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${serveur.address().port}/api`;
  const post = (u, b) => fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
  try {
    const r1 = await post('/authentic/releve', capture(1));
    const r2 = await post('/authentic/releve', capture(2));
    assert.ok(r1.id && r2.id);
    await post('/authentic/releves/resultats', { resultats: [{ id: r1.id, etat: 'applique', dossierId: 'v1', cle: 'client:lea essai' }, { id: r2.id, etat: 'sans-dossier', dossierId: '' }] });
    const res = await (await fetch(base + '/authentic/dossier/v1/pages')).json();
    assert.equal(res.pages.length, 1);
    assert.equal(res.pages[0].nature, 'client');
    const plein = await (await fetch(base + '/authentic/dossier/v1/pages?contenu=1')).json();
    assert.equal(plein.pages[0].capture.champs[0].valeur, 'ESSAI');
    assert.equal((await fetch(base + '/authentic/dossier/..%2Fx/pages')).status, 400);
  } finally { serveur.close(); }
});

// Relecture du 17/10 : promesse jamais gardée, dossier inconnu refusé, page trop lourde refusée, « Oublier » purge, volet du conjoint ignoré.
test('magasin : promesse (clé « ignorer »), dossier inconnu, page trop lourde refusés ; dossiers supprimés ou archivés depuis un an purgés', () => {
  const db = baseDossiers(['v1', 'v2', 'v3'], ['v3']);
  const p = creerPagesAuthentic(db);
  p.garder('v1', { capture: capture(1), nature: 'dossier', recueLe: '2026-10-17T08:00:00Z', cle: 'dossier' });
  assert.equal(p.garder('v1', { capture: capture(2), nature: 'dossier', recueLe: '2026-10-17T09:00:00Z', cle: 'ignorer' }), false);
  assert.equal(p.pages('v1')[0].capture.champs[1].valeur, 'Léa 1', 'la page de la vente reste');
  assert.equal(p.garder('inconnu0', { capture: capture(1), cle: 'dossier' }), false);
  assert.equal(p.garder('v2', { capture: { champs: [], texte: 'x'.repeat(MAX_OCTETS_PAGE) }, cle: 'dossier' }), false);
  p.garder('v2', { capture: capture(1), cle: 'dossier' });
  p.garder('v3', { capture: capture(1), cle: 'dossier' });
  db.prepare('UPDATE dossiers SET deleted_at = 1 WHERE id = ?').run('v2');
  const p2 = creerPagesAuthentic(db);
  assert.equal(p2.resume('v1').length, 1);
  assert.equal(p2.resume('v2').length, 0, 'dossier supprimé');
  assert.equal(p2.resume('v3').length, 0, 'archivé depuis plus d’un an');
  p2.oublier('v1');
  assert.equal(p2.resume('v1').length, 0);
});

test('clé de repli d’une fiche client : le volet du conjoint (lu avant) n’identifie pas la fiche', () => {
  const c = { champs: [
    { libelle: 'form:conjointComponent:nom', valeur: 'MARTEL' }, { libelle: 'form:conjointComponent:prenom', valeur: 'Paul' },
    { libelle: 'form:tabView:nom', valeur: 'MARTEL' }, { libelle: 'form:tabView:prenom', valeur: 'Léa' }] };
  assert.equal(clePageAuthentic('client', c), 'client:léa martel');
});

test('route DELETE : les pages d’un dossier sont oubliées', async () => {
  const pages = creerPagesAuthentic(baseDossiers());
  pages.garder('v1', { capture: capture(1), cle: 'dossier' });
  const app = express();
  app.use('/api', creerRouteurAuthentic({ pages, origine: () => 'local' }));
  const serveur = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try {
    const r = await fetch(`http://127.0.0.1:${serveur.address().port}/api/authentic/dossier/v1/pages`, { method: 'DELETE' });
    assert.equal(r.status, 200);
    assert.equal(pages.resume('v1').length, 0);
  } finally { serveur.close(); }
});

test('serveur : une promesse n’est jamais gardée, même avec la clé « dossier » d’une fenêtre ancienne', () => {
  const promesse = { champs: [], texte: 'A 2026 00017 VTE MARTEL / FOURNIER\n1 - Promesse VTE MARTEL/FOURNIER Importer avec 6e SENS\nComparants (2)' };
  const vente = { champs: [], texte: 'A 2026 00017 VTE MARTEL / FOURNIER\n2 - VTE MARTEL / FOURNIER Importer avec 6e SENS\nComparants (2)\n1 - Promesse VTE MARTEL/FOURNIER' };
  assert.equal(pageHorsVenteAuthentic(promesse), true);
  assert.equal(pageHorsVenteAuthentic(vente), false);
  const p = creerPagesAuthentic(baseDossiers());
  assert.equal(p.garder('v1', { capture: vente, cle: 'dossier' }), true);
  assert.equal(p.garder('v1', { capture: promesse, cle: 'dossier' }), false);
});

test('serveur : promesse lue comme le poste (en-tête sur sa ligne, onglets inactifs retirés)', () => {
  assert.equal(pageHorsVenteAuthentic({ texte: '1 - Promesse VTE A/B\nImporter avec 6e SENS\nComparants' }), true);
  const vente = { texte: '1 - Promesse VTE MARTEL/FOURNIER Importer avec 6e SENS\n2 - VTE MARTEL / FOURNIER\nImporter avec 6e SENS\nComparants (2)',
    onglets: [{ titre: '1 - Promesse VTE MARTEL/FOURNIER Importer avec 6e SENS', actif: false }, { titre: '2 - VTE MARTEL / FOURNIER', actif: true }] };
  assert.equal(pageHorsVenteAuthentic(vente), false);
});

// Plan Authen.TIC du 27/10, étape 2 : l'instantané d'un dossier calculé depuis ses pages gardées (commun/authentic-modele.js).
test('instantané : sous-dossier, statut, comparants et formalités lus dans la page gardée du dossier', async () => {
  const pages = creerPagesAuthentic(baseDossiers());
  pages.garder('v1', { nature: 'dossier', cle: 'dossier', recueLe: '2026-10-27T09:00:00Z', capture: {
    titre: 'x', champs: [], texte: 'A 2026 00500 VTE ESSAI / EXEMPLE\n2 - VTE ESSAI / EXEMPLE\nSigné\n29/09/2026\nComparants (1)\nM. ESSAI Paul\nVendeur',
    tableaux: [{ titre: 'Rédaction', entete: [], lignes: [['ACT Vente ESSAI', '', 'Signé le 29/09/2026', '29/09/2026', 'Signé le 29/09/2026']] }] } });
  const app = express();
  app.use('/api', creerRouteurAuthentic({ pages, origine: () => 'local' }));
  const serveur = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${serveur.address().port}/api`;
  try {
    const r = await (await fetch(base + '/authentic/dossier/v1/instantane')).json();
    assert.equal(r.instantane.reference, 'A 2026 00500');
    assert.equal(r.instantane.sousDossier.statut, 'Signé');
    assert.equal(r.instantane.sousDossier.comparants[0].role, 'Vendeur');
    assert.equal(r.fiche.acte.badge, undefined);
    assert.equal(r.fiche.statutSousDossier.le, '2026-09-29');
    const vide = await (await fetch(base + '/authentic/dossier/v2/instantane')).json();
    assert.equal(vide.instantane, null, 'aucune page gardée : rien');
    assert.equal((await fetch(base + '/authentic/dossier/..%2Fx/instantane')).status, 400);
  } finally { serveur.close(); }
});
