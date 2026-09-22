'use strict';

// Permis de construire d'un terrain à bâtir (Outil 2, mode « projet de vente »).
//
// Le point central testé ici est la DISTINCTION DES DEUX POINTS DE DÉPART : le retrait
// administratif court depuis l'arrêté, le recours des tiers depuis le premier jour d'affichage.
// Les confondre est l'erreur que ce contrôle existe précisément pour éviter.

const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

const ARRETE = "ARRÊTÉ portant permis de construire\nPC 041 123 25 A0012\nLe maire, en date du 12 mars 2026, accorde le permis de construire.";
const CONSTAT = "PROCÈS-VERBAL DE CONSTAT D'AFFICHAGE\nL'an deux mille vingt-six, le 20 mars 2026, nous, commissaire de justice, avons constaté l'affichage du permis de construire PC 041 123 25 A0012 sur le terrain.";
const CERTIFICAT = "CERTIFICAT DE NON-RECOURS\nLe greffe atteste, le 30 juin 2026, qu'aucun recours n'a été enregistré contre le permis de construire.";

// ---- Les deux délais et leurs points de départ ---------------------------------------------

test('calculerPurgePermis compte le retrait depuis l’arrêté et le recours depuis l’affichage', () => {
  const p = app.calculerPurgePermis({ dateArrete: '2026-03-12', dateAffichage: '2026-03-20', aujourdHui: '2026-04-01' });
  assert.strictEqual(p.finRetrait, '2026-06-12');
  assert.strictEqual(p.finRecours, '2026-05-20');
  assert.strictEqual(p.retrait, 'en-cours');
  assert.strictEqual(p.recours, 'en-cours');
});

test('calculerPurgePermis : les deux délais purgés une fois les échéances passées', () => {
  const p = app.calculerPurgePermis({ dateArrete: '2026-03-12', dateAffichage: '2026-03-20', aujourdHui: '2026-07-01' });
  assert.strictEqual(p.retrait, 'purge');
  assert.strictEqual(p.recours, 'purge');
});

test('calculerPurgePermis : le recours peut courir alors que le retrait est déjà purgé', () => {
  // Affichage tardif : l'arrêté a plus de trois mois, mais le délai de recours vient de démarrer.
  const p = app.calculerPurgePermis({ dateArrete: '2026-01-10', dateAffichage: '2026-06-01', aujourdHui: '2026-06-15' });
  assert.strictEqual(p.retrait, 'purge');
  assert.strictEqual(p.recours, 'en-cours');
});

test('calculerPurgePermis : sans affichage, le recours est « non-demarre », jamais « purge »', () => {
  // Le compteur n'a pas démarré : même dix ans après l'arrêté, le recours reste ouvert.
  const p = app.calculerPurgePermis({ dateArrete: '2016-01-10', dateAffichage: null, aujourdHui: '2026-09-22' });
  assert.strictEqual(p.retrait, 'purge');
  assert.strictEqual(p.recours, 'non-demarre');
  assert.strictEqual(p.finRecours, null);
});

test('calculerPurgePermis : sans arrêté, le retrait est « inconnu » et aucune date n’est inventée', () => {
  const p = app.calculerPurgePermis({ dateArrete: null, dateAffichage: '2026-03-20', aujourdHui: '2026-09-22' });
  assert.strictEqual(p.retrait, 'inconnu');
  assert.strictEqual(p.finRetrait, null);
});

test('calculerPurgePermis signale un permis relevant de l’ancien régime du recours gracieux', () => {
  // Loi n° 2025-1129 du 26 novembre 2025, applicable aux décisions délivrées à partir du 28/11/2025.
  const avant = app.calculerPurgePermis({ dateArrete: '2025-10-01', dateAffichage: '2025-10-10', aujourdHui: '2026-09-22' });
  const apres = app.calculerPurgePermis({ dateArrete: '2025-12-01', dateAffichage: '2025-12-10', aujourdHui: '2026-09-22' });
  assert.strictEqual(avant.ancienRegimeRecoursGracieux, true);
  assert.strictEqual(apres.ancienRegimeRecoursGracieux, false);
});

// ---- Reconnaissance des trois documents ------------------------------------------------------

test('typeDocumentPermis ne prend pas un constat d’affichage pour le permis lui-même', () => {
  // Le constat CITE le permis : testé dans le mauvais ordre, sa date deviendrait celle de l'arrêté.
  assert.strictEqual(app.typeDocumentPermis({ nom: "Constat d'affichage.pdf", texte: CONSTAT }), 'constat-affichage');
  assert.strictEqual(app.typeDocumentPermis({ nom: 'Arrete PC.pdf', texte: ARRETE }), 'permis');
  assert.strictEqual(app.typeDocumentPermis({ nom: 'Certificat de non-recours.pdf', texte: CERTIFICAT }), 'certificat-non-recours');
});

test('typeDocumentPermis écarte l’avant-contrat, qui cite toujours le permis', () => {
  assert.strictEqual(app.typeDocumentPermis({ nom: 'Compromis de vente.pdf', texte: 'La vente est soumise à la condition suspensive d’obtention d’un permis de construire.' }), null);
});

test('analyserDocumentsPermis retient le PLUS ANCIEN constat d’affichage', () => {
  // L'étude fait dresser trois constats (début, milieu, fin) : le délai court du premier.
  const r = app.analyserDocumentsPermis([
    { nom: 'Arrete PC.pdf', texte: ARRETE },
    { nom: 'Constat affichage fin.pdf', texte: "CONSTAT D'AFFICHAGE du 25 mai 2026 : le panneau est toujours en place." },
    { nom: 'Constat affichage debut.pdf', texte: CONSTAT }
  ]);
  assert.strictEqual(r.permis.date, '2026-03-12');
  assert.strictEqual(r.constatAffichage.date, '2026-03-20');
  assert.strictEqual(r.constatsAffichage.length, 2);
  assert.ok(/PC\s*041/i.test(r.permis.numero || ''), 'numéro de permis relevé : ' + r.permis.numero);
});

// ---- Constats produits -----------------------------------------------------------------------

function titres(constats) { return constats.map(c => c.titre).join(' | '); }

test('sans constat d’affichage, le manque est signalé comme un compteur non démarré', () => {
  const analyse = app.analyserDocumentsPermis([{ nom: 'Arrete PC.pdf', texte: ARRETE }]);
  const purge = app.calculerPurgePermis({ dateArrete: analyse.permis.date, dateAffichage: null, aujourdHui: '2026-09-22' });
  const constats = app.constatsPermisConstruire({ analyse, purge, conditionPermis: true });
  const affichage = constats.find(c => /Affichage du permis/.test(c.titre));
  assert.ok(affichage, titres(constats));
  assert.strictEqual(affichage.gravite, 'IMPORTANT');
  assert.ok(/NE COURT PAS/.test(affichage.description));
  // Aucun constat ne doit affirmer que le recours est purgé.
  assert.ok(!/recours des tiers purg/i.test(titres(constats)), titres(constats));
});

test('permis absent : gravité plus forte quand la vente y est conditionnée', () => {
  const vide = app.analyserDocumentsPermis([]);
  const avecCondition = app.constatsPermisConstruire({ analyse: vide, purge: null, conditionPermis: true });
  const sansCondition = app.constatsPermisConstruire({ analyse: vide, purge: null, conditionPermis: false });
  assert.strictEqual(avecCondition[0].gravite, 'IMPORTANT');
  assert.strictEqual(sansCondition[0].gravite, 'A_VERIFIER');
  assert.strictEqual(avecCondition[0].destinataire, 'acquereur');
});

test('purge calculée sans certificat : l’outil ne conclut pas à sa place', () => {
  const analyse = app.analyserDocumentsPermis([
    { nom: 'Arrete PC.pdf', texte: ARRETE },
    { nom: 'Constat affichage.pdf', texte: CONSTAT },
    { nom: 'Constat affichage fin.pdf', texte: "CONSTAT D'AFFICHAGE du 25 mai 2026 : le panneau est toujours en place." }
  ]);
  const purge = app.calculerPurgePermis({ dateArrete: analyse.permis.date, dateAffichage: analyse.constatAffichage.date, aujourdHui: '2026-09-22' });
  const constats = app.constatsPermisConstruire({ analyse, purge, conditionPermis: true });
  const reserve = constats.find(c => /non justifi[ée]e par un certificat/i.test(c.titre));
  assert.ok(reserve, titres(constats));
  assert.strictEqual(reserve.destinataire, 'tribunal');
  assert.ok(/R\.600-7/.test(reserve.description));
});

test('un seul constat d’affichage : la continuité de deux mois n’est pas démontrée', () => {
  const analyse = app.analyserDocumentsPermis([
    { nom: 'Arrete PC.pdf', texte: ARRETE },
    { nom: 'Constat affichage.pdf', texte: CONSTAT }
  ]);
  const purge = app.calculerPurgePermis({ dateArrete: analyse.permis.date, dateAffichage: analyse.constatAffichage.date, aujourdHui: '2026-09-22' });
  const constats = app.constatsPermisConstruire({ analyse, purge, conditionPermis: true });
  assert.ok(/Un seul constat d’affichage/.test(titres(constats)), titres(constats));
});

// ---- Périmètre : terrain à bâtir seulement ----------------------------------------------------

test('estTerrainABatir : le type du dossier lié fait foi, le texte n’est qu’un repli', () => {
  assert.strictEqual(app.estTerrainABatir({ dossierLie: { typeVente: 'terrain' }, texteProjet: '', texteAvantContrat: '' }), true);
  assert.strictEqual(app.estTerrainABatir({ dossierLie: { typeVente: 'maison' }, texteProjet: "vente d'un terrain à bâtir sis à BLOIS", texteAvantContrat: '' }), true);
  assert.strictEqual(app.estTerrainABatir({ dossierLie: { typeVente: 'maison' }, texteProjet: "vente d'une maison d'habitation", texteAvantContrat: '' }), false);
});

test('analyserProjetVenteOutil2 : aucun constat de permis hors terrain à bâtir', () => {
  const r = app.analyserProjetVenteOutil2({
    texteAvantContrat: "Vente d'une maison d'habitation sise à BLOIS.",
    texteProjet: "Vente d'une maison d'habitation sise à BLOIS.",
    documentsDeposes: [], aujourdHui: '2026-09-22'
  });
  assert.strictEqual(r.estTerrain, false);
  assert.strictEqual(r.constats.filter(c => c.categorie === 'PERMIS').length, 0);
});

test('analyserProjetVenteOutil2 : sur un terrain à bâtir, la section permis est produite', () => {
  const r = app.analyserProjetVenteOutil2({
    texteAvantContrat: "Vente d'un terrain à bâtir sis à BLOIS. La vente est soumise à la condition suspensive d'obtention d'un permis de construire par l'acquéreur.",
    texteProjet: "Vente d'un terrain à bâtir sis à BLOIS.",
    documentsDeposes: [
      { nom: 'Arrete PC.pdf', texte: ARRETE },
      { nom: 'Constat affichage.pdf', texte: CONSTAT }
    ],
    aujourdHui: '2026-09-22'
  });
  assert.strictEqual(r.estTerrain, true);
  assert.strictEqual(r.purgePermis.retrait, 'purge');
  assert.strictEqual(r.purgePermis.recours, 'purge');
  const permis = r.constats.filter(c => c.categorie === 'PERMIS');
  assert.ok(permis.length >= 3, titres(permis));
});

test('les questions du permis sont groupées sous leurs destinataires', () => {
  const r = app.analyserProjetVenteOutil2({
    texteAvantContrat: "Vente d'un terrain à bâtir. Condition suspensive d'obtention d'un permis de construire.",
    texteProjet: "Vente d'un terrain à bâtir.",
    documentsDeposes: [], aujourdHui: '2026-09-22'
  });
  const cles = r.questions.map(q => q.cle).join(',');
  assert.ok(cles.indexOf('acquereur') !== -1, cles);
});
