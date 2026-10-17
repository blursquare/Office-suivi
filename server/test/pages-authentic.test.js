'use strict';

// Pages d'Authentic gardées par dossier (17/10) : la dernière version de chaque page, rattachée au dossier où le poste l'a rangée, relue
// sur la fiche. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { creerPagesAuthentic, clePageAuthentic, MAX_PAGES_PAR_DOSSIER } = require('../src/pagesAuthentic');
const { creerRouteurAuthentic } = require('../src/routes/authentic');

const capture = (n) => ({ titre: 'x', champs: [{ libelle: 'form:ficheClientPhysique:nom', valeur: 'ESSAI' }, { libelle: 'form:ficheClientPhysique:prenom', valeur: 'Léa ' + n }], tableaux: [], texte: '' });

test('magasin : dernière version par clé, 40 pages au plus, résumé sans contenu, identifiant contrôlé', () => {
  const p = creerPagesAuthentic(new DatabaseSync(':memory:'));
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
  const pages = creerPagesAuthentic(new DatabaseSync(':memory:'));
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
