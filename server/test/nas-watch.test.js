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

test('detecterNouveauxFichiers : rien de "nouveau" au tout premier passage', async () => {
  // Sans inventaire précédent, tout signaler comme nouveau ferait remonter une notification pour
  // chaque dossier dès sa toute première liaison — ce n'est pas ce qu'on cherche à signaler.
  assert.deepEqual(detecterNouveauxFichiers(undefined, ['a.pdf', 'b.pdf']), []);
  assert.deepEqual(detecterNouveauxFichiers(null, ['a.pdf']), []);
});

test('detecterNouveauxFichiers : un fichier apparu est signalé, les autres non', async () => {
  const nouveaux = detecterNouveauxFichiers(['a.pdf', 'b.pdf'], ['a.pdf', 'b.pdf', 'c.pdf']);
  assert.deepEqual(nouveaux, ['c.pdf']);
});

test('detecterNouveauxFichiers : un retrait seul ne produit aucune nouveauté', async () => {
  assert.deepEqual(detecterNouveauxFichiers(['a.pdf', 'b.pdf'], ['a.pdf']), []);
});

test('memeInventaire : insensible à l’ordre, sensible à un vrai changement', async () => {
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

test('sans racine NAS configurée : aucun dossier vérifié', async () => {
  depot.creer(dossierMinimal('d1', '2024-118 DUPONT MARTIN'));
  const r = await executerTourSurveillanceNas(depot, '');
  assert.equal(r.dossiersVerifies, 0);
  assert.equal(r.dossiersNotifies, 0);
});

test('dossier archivé ou non relié : jamais vérifié', async () => {
  depot.creer(dossierMinimal('d2', null));
  depot.creer(dossierMinimal('d3', '2024-118 DUPONT MARTIN', { archive: true }));
  await executerTourSurveillanceNas(depot, racine);
  assert.equal(depot.trouverParId('d2').nasInventaire, undefined);
  assert.equal(depot.trouverParId('d3').nasInventaire, undefined);
});

test('premier passage sur un dossier relié : inventaire posé, aucune notification', async () => {
  const r = await executerTourSurveillanceNas(depot, racine);
  assert.ok(r.dossiersVerifies >= 1);
  const d1 = depot.trouverParId('d1');
  assert.deepEqual(d1.nasInventaire, ['Titre.pdf']);
  assert.equal(d1.nasNouveaute, undefined);
});

test('un nouveau fichier déposé ensuite déclenche une notification au tour suivant', async () => {
  fs.writeFileSync(path.join(racine, '2024-118 DUPONT MARTIN', 'Offre de pret.pdf'), '%PDF-1.4 offre');
  const r = await executerTourSurveillanceNas(depot, racine);
  assert.equal(r.dossiersNotifies, 1);
  const d1 = depot.trouverParId('d1');
  assert.equal(d1.nasInventaire.length, 2);
  assert.ok(d1.nasNouveaute);
  assert.deepEqual(d1.nasNouveaute.fichiers, ['Offre de pret.pdf']);
  assert.ok(Number.isFinite(d1.nasNouveaute.at));
});

test('un tour sans changement ne réécrit pas le dossier (nasNouveaute reste tel quel)', async () => {
  const avant = depot.trouverParId('d1');
  const r = await executerTourSurveillanceNas(depot, racine);
  assert.equal(r.dossiersNotifies, 0);
  const apres = depot.trouverParId('d1');
  // Toujours la même notification (pas effacée, pas dupliquée) : seul un vrai changement
  // d'inventaire justifie de réécrire le dossier.
  assert.equal(apres.nasNouveaute.at, avant.nasNouveaute.at);
});

test('un fichier renommé (retiré + ajouté) redéclenche bien une notification', async () => {
  fs.renameSync(
    path.join(racine, '2024-118 DUPONT MARTIN', 'Offre de pret.pdf'),
    path.join(racine, '2024-118 DUPONT MARTIN', 'Offre de pret signee.pdf')
  );
  const r = await executerTourSurveillanceNas(depot, racine);
  assert.equal(r.dossiersNotifies, 1);
  const d1 = depot.trouverParId('d1');
  assert.deepEqual(d1.nasNouveaute.fichiers, ['Offre de pret signee.pdf']);
});

// --- Appel de fonds noté automatiquement depuis le NAS (29/09) --------------------------------
const { fichierAppelFondsRacine, appelFondsANoter, noterAppelFondsDetecte } = require('../src/nasWatch');

test('appel de fonds : noms de l’étude reconnus à la racine, jamais un décompte de prêt ni un sous-dossier', () => {
  assert.equal(fichierAppelFondsRacine(['Convocation au rendez-vous contenant l’appel de fonds.pdf']), 'Convocation au rendez-vous contenant l’appel de fonds.pdf');
  assert.equal(fichierAppelFondsRacine(['Compromis.pdf', 'Décompte acquéreur.pdf']), 'Décompte acquéreur.pdf');
  assert.equal(fichierAppelFondsRacine(['DECOMPTE_acquereur.pdf']), 'DECOMPTE_acquereur.pdf');
  assert.equal(fichierAppelFondsRacine(['AAE/Décompte acquéreur.pdf']), null);
  assert.equal(fichierAppelFondsRacine(['AAE\\Décompte acquéreur.pdf']), null);
  assert.equal(fichierAppelFondsRacine(['DECOMPTE de remboursement ECO PRET.pdf', 'Tableau amortissement.pdf']), null);
  // Étude 06/10 : le décompte du confrère n'est jamais le courrier de l'étude ; celui de CLAIRE passe avant les autres noms.
  assert.equal(fichierAppelFondsRacine(['Décompte Me FOURNIER.pdf', 'Décompte confrère.pdf']), null);
  assert.equal(fichierAppelFondsRacine(['Décompte Me FOURNIER.pdf', 'Décompte acquéreur.pdf']), 'Décompte acquéreur.pdf');
  assert.equal(fichierAppelFondsRacine(['Décompte acquéreur.pdf', 'Convocation au rendez-vous contenant l’appel de fonds - DUPONT.pdf']), 'Convocation au rendez-vous contenant l’appel de fonds - DUPONT.pdf');
});

test('appel de fonds : noté à la date de détection, validé, une seule fois, jamais par-dessus une date connue', () => {
  const d = { id: 'd1', nom: 'X / Y', rendezVousSignature: '2026-10-20', historique: [] };
  const chemins = ['Décompte acquéreur.pdf'];
  const maj = noterAppelFondsDetecte(d, chemins, '2026-10-05');
  assert.equal(maj.appelFonds, '2026-10-05');
  assert.equal(maj.echeancesValidees.appelFonds, true);
  assert.equal(maj.detectionsNas.appelFonds, '2026-10-05');
  assert.equal(maj.detectionsNas.appelFondsFichier, 'Décompte acquéreur.pdf');
  assert.match(maj.historique[0].texte, /noté automatiquement : « Décompte acquéreur\.pdf »/);
  assert.equal(d.appelFonds, undefined, 'le dossier d’origine n’est pas modifié');
  // Déjà noté (date saisie, validation manuelle, ou détection passée même si la date a été effacée).
  assert.equal(appelFondsANoter(Object.assign({}, d, { appelFonds: '2026-10-01' }), chemins, '2026-10-05'), null);
  assert.equal(appelFondsANoter(Object.assign({}, d, { echeancesValidees: { appelFonds: true } }), chemins, '2026-10-05'), null);
  assert.equal(appelFondsANoter(Object.assign({}, d, { detectionsNas: { appelFonds: '2026-10-02' } }), chemins, '2026-10-05'), null);
  // Rendez-vous passé, ou dossier archivé : la date du jour serait fausse.
  assert.equal(appelFondsANoter(Object.assign({}, d, { rendezVousSignature: '2026-10-01' }), chemins, '2026-10-05'), null);
  assert.equal(appelFondsANoter(Object.assign({}, d, { archive: true }), chemins, '2026-10-05'), null);
});

test('tour de surveillance : l’appel de fonds trouvé est enregistré sur le dossier', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-af-'));
  try {
    fs.mkdirSync(path.join(racine, 'DUPONT'));
    fs.writeFileSync(path.join(racine, 'DUPONT', 'Convocation au rendez-vous contenant l’appel de fonds.pdf'), '%PDF-1.4');
    let d = { id: 'd1', nom: 'DUPONT / MARTIN', nasDossier: 'DUPONT', rendezVousSignature: '2099-01-10', historique: [] };
    const depot = { tousActifs: () => [d], remplacer: (id, nouveau) => { d = nouveau; } };
    const r = await executerTourSurveillanceNas(depot, racine, '2026-10-05');
    assert.equal(r.appelsFondsNotes, 1);
    assert.equal(d.appelFonds, '2026-10-05');
    const r2 = await executerTourSurveillanceNas(depot, racine, '2026-10-06');
    assert.equal(r2.appelsFondsNotes, 0);
    assert.equal(d.appelFonds, '2026-10-05');
  } finally { fs.rmSync(racine, { recursive: true, force: true }); }
});

test('courrier d’appel de fonds rattaché au dossier : gardé tant qu’il existe, remplacé s’il disparaît', () => {
  const { courrierAppelFondsARattacher } = require('../src/nasWatch');
  const d = { id: 'd1', appelFonds: '2026-10-01' };
  assert.equal(courrierAppelFondsARattacher(d, ['Décompte acquéreur.pdf']), 'Décompte acquéreur.pdf');
  const rattache = Object.assign({}, d, { appelFondsCourrier: 'Décompte acquéreur.pdf' });
  assert.equal(courrierAppelFondsARattacher(rattache, ['Décompte acquéreur.pdf', 'Convocation RDV.pdf']), null);
  assert.equal(courrierAppelFondsARattacher(rattache, ['Convocation RDV.pdf']), 'Convocation RDV.pdf');
  assert.equal(courrierAppelFondsARattacher(rattache, ['AAE/Convocation RDV.pdf']), null);
  assert.equal(courrierAppelFondsARattacher(Object.assign({}, d, { archive: true }), ['Décompte acquéreur.pdf']), null);
  // Décompte du confrère rattaché par erreur : remplacé par le nôtre, ou détaché ('' : rien à la place).
  const confrere = Object.assign({}, d, { appelFondsCourrier: 'Décompte Me FOURNIER.pdf' });
  assert.equal(courrierAppelFondsARattacher(confrere, ['Décompte Me FOURNIER.pdf', 'Décompte acquéreur.pdf']), 'Décompte acquéreur.pdf');
  assert.equal(courrierAppelFondsARattacher(confrere, ['Décompte Me FOURNIER.pdf']), '');
});
