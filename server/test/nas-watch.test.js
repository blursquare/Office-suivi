'use strict';

// Surveillance périodique du NAS (voir src/nasWatch.js) : signale l'apparition d'un nouveau PDF
// dans le dossier NAS relié à un dossier, sans attendre un clic sur « Revérifier ». Deux familles
// de tests : les fonctions pures de comparaison d'inventaires, puis un tour complet contre une
// vraie arborescence de fichiers temporaire (comme server/test/nas.test.js).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ouvrirDb } = require('../src/db');
const { creerDepot } = require('../src/dossiersRepo');
const { detecterNouveauxFichiers, memeInventaire, executerTourSurveillanceNas } = require('../src/nasWatch');

// ---- Fonctions pures ----

test('detecterNouveauxFichiers : rien de "nouveau" au tout premier passage', () => {
  // Sans inventaire précédent, tout signaler comme nouveau ferait remonter une notification pour
  // chaque dossier dès sa toute première liaison — ce n'est pas ce qu'on cherche à signaler.
  assert.deepEqual(detecterNouveauxFichiers(undefined, ['a.pdf', 'b.pdf']), []);
  assert.deepEqual(detecterNouveauxFichiers(null, ['a.pdf']), []);
});

test('detecterNouveauxFichiers : un fichier apparu est signalé, les autres non', () => {
  const nouveaux = detecterNouveauxFichiers(['a.pdf', 'b.pdf'], ['a.pdf', 'b.pdf', 'c.pdf']);
  assert.deepEqual(nouveaux, ['c.pdf']);
});

test('detecterNouveauxFichiers : un retrait seul ne produit aucune nouveauté', () => {
  assert.deepEqual(detecterNouveauxFichiers(['a.pdf', 'b.pdf'], ['a.pdf']), []);
});

test('memeInventaire : insensible à l’ordre, sensible à un vrai changement', () => {
  assert.equal(memeInventaire(['a.pdf', 'b.pdf'], ['b.pdf', 'a.pdf']), true);
  assert.equal(memeInventaire(['a.pdf'], ['a.pdf', 'b.pdf']), false);
  assert.equal(memeInventaire(undefined, ['a.pdf']), false);
});

// ---- Un tour complet contre une vraie arborescence ----

let racine, db, depot;

before(() => {
  racine = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-nas-watch-'));
  fs.mkdirSync(path.join(racine, '2024-118 DUPONT MARTIN'), { recursive: true });
  fs.writeFileSync(path.join(racine, '2024-118 DUPONT MARTIN', 'Titre.pdf'), '%PDF-1.4 titre');
  fs.mkdirSync(path.join(racine, '2024-200 LEROY BERNARD'), { recursive: true });

  db = ouvrirDb(':memory:');
  depot = creerDepot(db);
});

after(() => {
  db.close();
});

function dossierMinimal(id, nasDossier, extra) {
  return { id, nom: id, archive: false, nasDossier, ...extra };
}

test('sans racine NAS configurée : aucun dossier vérifié', () => {
  depot.creer(dossierMinimal('d1', '2024-118 DUPONT MARTIN'));
  const r = executerTourSurveillanceNas(depot, '');
  assert.equal(r.dossiersVerifies, 0);
  assert.equal(r.dossiersNotifies, 0);
});

test('dossier archivé ou non relié : jamais vérifié', () => {
  depot.creer(dossierMinimal('d2', null));
  depot.creer(dossierMinimal('d3', '2024-118 DUPONT MARTIN', { archive: true }));
  const r = executerTourSurveillanceNas(depot, racine);
  assert.equal(depot.trouverParId('d2').nasInventaire, undefined);
  assert.equal(depot.trouverParId('d3').nasInventaire, undefined);
});

test('premier passage sur un dossier relié : inventaire posé, aucune notification', () => {
  const r = executerTourSurveillanceNas(depot, racine);
  assert.ok(r.dossiersVerifies >= 1);
  const d1 = depot.trouverParId('d1');
  assert.deepEqual(d1.nasInventaire, ['Titre.pdf']);
  assert.equal(d1.nasNouveaute, undefined);
});

test('un nouveau fichier déposé ensuite déclenche une notification au tour suivant', () => {
  fs.writeFileSync(path.join(racine, '2024-118 DUPONT MARTIN', 'Offre de pret.pdf'), '%PDF-1.4 offre');
  const r = executerTourSurveillanceNas(depot, racine);
  assert.equal(r.dossiersNotifies, 1);
  const d1 = depot.trouverParId('d1');
  assert.equal(d1.nasInventaire.length, 2);
  assert.ok(d1.nasNouveaute);
  assert.deepEqual(d1.nasNouveaute.fichiers, ['Offre de pret.pdf']);
  assert.ok(Number.isFinite(d1.nasNouveaute.at));
});

test('un tour sans changement ne réécrit pas le dossier (nasNouveaute reste tel quel)', () => {
  const avant = depot.trouverParId('d1');
  const r = executerTourSurveillanceNas(depot, racine);
  assert.equal(r.dossiersNotifies, 0);
  const apres = depot.trouverParId('d1');
  // Toujours la même notification (pas effacée, pas dupliquée) : seul un vrai changement
  // d'inventaire justifie de réécrire le dossier.
  assert.equal(apres.nasNouveaute.at, avant.nasNouveaute.at);
});

test('un fichier renommé (retiré + ajouté) redéclenche bien une notification', () => {
  fs.renameSync(
    path.join(racine, '2024-118 DUPONT MARTIN', 'Offre de pret.pdf'),
    path.join(racine, '2024-118 DUPONT MARTIN', 'Offre de pret signee.pdf')
  );
  const r = executerTourSurveillanceNas(depot, racine);
  assert.equal(r.dossiersNotifies, 1);
  const d1 = depot.trouverParId('d1');
  assert.deepEqual(d1.nasNouveaute.fichiers, ['Offre de pret signee.pdf']);
});
