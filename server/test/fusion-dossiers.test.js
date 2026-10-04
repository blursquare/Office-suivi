'use strict';

// Fusion à trois voies d'un PUT de dossier (audit 04/10) : un poste qui enregistre à partir d'une version dépassée
// n'efface plus ce que le serveur (autre poste, agenda, emails) a changé entre-temps. Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fusionnerTroisVoies, fusionnerListes } = require('../src/fusionDossiers');
const { ouvrirDb } = require('../src/db');
const { creerDepot } = require('../src/dossiersRepo');
const { creerApp } = require('../src/app');

test('fusionnerTroisVoies : champs disjoints gardés des deux côtés, champ commun au poste', () => {
  const base = { id: 'd1', nom: 'MARTEL / FAURE', pret: '2026-11-01', appelFonds: '', historique: [{ texte: 'Créé' }] };
  const serveur = { ...base, appelFonds: '2026-10-04', echeancesValidees: { appelFonds: true }, historique: [{ texte: 'Créé' }, { texte: 'Appel de fonds relevé' }] };
  const client = { ...base, pret: '2026-11-15', historique: [{ texte: 'Créé' }, { texte: 'Date du prêt corrigée' }] };
  const { dossier, fusionne } = fusionnerTroisVoies(base, serveur, client);
  assert.equal(fusionne, true);
  assert.equal(dossier.pret, '2026-11-15', 'changement du poste gardé');
  assert.equal(dossier.appelFonds, '2026-10-04', 'changement du serveur gardé');
  assert.equal(dossier.echeancesValidees.appelFonds, true, 'champ ajouté par le serveur gardé');
  assert.equal(dossier.historique.map(h => h.texte).join(' | '), 'Créé | Appel de fonds relevé | Date du prêt corrigée');
  // Même champ changé des deux côtés : le poste a la main.
  const c2 = { ...base, pret: '2026-12-01' };
  const s2 = { ...base, pret: '2026-11-20' };
  assert.equal(fusionnerTroisVoies(base, s2, c2).dossier.pret, '2026-12-01');
  // Champ retiré par le poste, intact côté serveur : retiré.
  const c3 = { id: 'd1', nom: 'MARTEL / FAURE', appelFonds: '', historique: base.historique };
  assert.equal('pret' in fusionnerTroisVoies(base, base, c3).dossier, false);
});

test('fusionnerTroisVoies : objets imbriqués fusionnés (pièces cochées des deux côtés)', () => {
  const base = { id: 'd1', pieces: { dpe: { recu: false }, rib: { recu: false } } };
  const serveur = { id: 'd1', pieces: { dpe: { recu: true, le: '2026-10-04' }, rib: { recu: false } } };
  const client = { id: 'd1', pieces: { dpe: { recu: false }, rib: { recu: true } } };
  const { dossier } = fusionnerTroisVoies(base, serveur, client);
  assert.equal(dossier.pieces.dpe.recu, true);
  assert.equal(dossier.pieces.rib.recu, true);
});

test('fusionnerListes : ajouts des deux côtés gardés, retrait du poste respecté, pas de doublon', () => {
  const base = [{ a: 1 }, { a: 2 }];
  const serveur = [{ a: 1 }, { a: 2 }, { a: 3 }];
  const client = [{ a: 2 }, { a: 4 }];
  assert.equal(JSON.stringify(fusionnerListes(base, serveur, client)), '[{"a":2},{"a":3},{"a":4}]');
});

test('dépôt : remplacerDepuisBase — même base = remplacement, base dépassée = fusion, base inconnue = copie du poste', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const t0 = depot.creer({ id: 'd1', nom: 'MARTEL / FAURE', pret: '2026-11-01' });
  // Le serveur (agenda) change le dossier.
  const t1 = depot.remplacer('d1', { id: 'd1', nom: 'MARTEL / FAURE', pret: '2026-11-01', appelFonds: '2026-10-04' });
  assert.ok(t1 >= t0);
  assert.ok(depot.version('d1', t0), 'la version de base est gardée');
  // Un poste parti de t0 corrige la date du prêt.
  const r = depot.remplacerDepuisBase('d1', { id: 'd1', nom: 'MARTEL / FAURE', pret: '2026-11-15' }, t0);
  assert.equal(r.fusionne, true);
  assert.equal(r.dossier.pret, '2026-11-15');
  assert.equal(r.dossier.appelFonds, '2026-10-04');
  assert.equal(depot.trouverParId('d1').appelFonds, '2026-10-04');
  // Même base : remplacement simple.
  const r2 = depot.remplacerDepuisBase('d1', { id: 'd1', nom: 'MARTEL / FAURE', pret: '2026-11-15', appelFonds: '' }, r.updatedAt);
  assert.equal(r2.fusionne, false);
  assert.equal(depot.trouverParId('d1').appelFonds, '');
  // Base inconnue (jamais vue) : la copie du poste s'applique, signalé.
  const r3 = depot.remplacerDepuisBase('d1', { id: 'd1', nom: 'X' }, 12345);
  assert.equal(r3.baseInconnue, true);
  assert.equal(depot.trouverParId('d1').nom, 'X');
  // Sans en-tête : comportement d'avant.
  assert.equal(depot.remplacerDepuisBase('d1', { id: 'd1', nom: 'Y' }, undefined).fusionne, false);
  assert.equal(depot.remplacerDepuisBase('absent', { id: 'absent' }, 1), null);
  db.close();
});

test('route PUT /api/dossiers/:id : X-Claire-Base fusionne, réponse = dossier fusionné', async () => {
  const db = ouvrirDb(':memory:');
  const { app, depot } = creerApp({ db, config: { racineRepo: process.cwd(), authActive: false, estSea: () => false } });
  const serveur = app.listen(0);
  await new Promise(r => serveur.once('listening', r));
  const B = 'http://127.0.0.1:' + serveur.address().port;
  try {
    const t0 = depot.creer({ id: 'd1', nom: 'MARTEL / FAURE', pret: '2026-11-01' });
    depot.remplacer('d1', { id: 'd1', nom: 'MARTEL / FAURE', pret: '2026-11-01', appelFonds: '2026-10-04' });
    const rep = await fetch(B + '/api/dossiers/d1', {
      method: 'PUT', headers: { 'content-type': 'application/json', 'x-claire-base': String(t0) },
      body: JSON.stringify({ id: 'd1', nom: 'MARTEL / FAURE', pret: '2026-11-15' })
    });
    assert.equal(rep.status, 200);
    const corps = await rep.json();
    assert.equal(corps.fusionne, true);
    assert.equal(corps.appelFonds, '2026-10-04');
    assert.equal(corps.pret, '2026-11-15');
    assert.ok(corps.updatedAt > t0);
    // Corps JSON invalide : 400 propre, jamais le corps dans la réponse.
    const ko = await fetch(B + '/api/dossiers/d1', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{invalide' });
    assert.equal(ko.status, 400);
    assert.equal((await ko.json()).erreur, 'Requête invalide.');
  } finally {
    serveur.close();
    db.close();
  }
});

test('dépôt : une ligne au JSON illisible est écartée, les autres dossiers restent servis', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'ok', nom: 'MARTEL / FAURE' });
  db.prepare("INSERT INTO dossiers (id, data, archive, updated_at) VALUES ('casse', '{pas du json', 0, 5)").run();
  const erreurs = [];
  const orig = console.error; console.error = (m) => erreurs.push(String(m));
  try {
    assert.equal(depot.depuis(0).map(d => d.id).join(','), 'casse,ok'.split(',').filter(x => x !== 'casse').join(','));
    assert.equal(depot.tousActifs().length, 1);
    assert.equal(depot.trouverParId('casse'), null);
  } finally { console.error = orig; }
  assert.equal(erreurs.length, 1, 'signalé une seule fois');
  db.close();
});
