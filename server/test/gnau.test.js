'use strict';
// Fiche d'un dossier pour le CU et la DIA sur les guichets uniques (gnau.js) — noms, adresses, parcelles et montants inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { choisirPlanCadastral, ficheGnau, dossiersGnau, adresseDecomposee, parcellesGnau } = require('../src/gnau');

const dossier = () => ({
  id: 'v1', nom: 'MOREAU / LAMBERT', typeVente: 'maison', adresseBien: 'VINEUIL (41350), 12 rue des Vignes', prixVente: 209000, prixMobilier: 5000,
  referenceAuthentic: 'A 2026 00042',
  honoraires: { negociateur: 'agence', nom: 'AGENCE DU CHÂTEAU', montantTTC: 9000, charge: 'ACQUEREUR' },
  parties: [
    { role: 'VENDEUR', nom: 'Paul MOREAU', civilite: 'M' }, { role: 'VENDEUR', nom: 'Léa MOREAU', civilite: 'Mme' },
    { role: 'ACQUEREUR', nom: 'Claire LAMBERT', civilite: 'Mme' }, { role: 'ACQUEREUR', nom: 'SCI LES TILLEULS', qualitePersonne: 'morale' }
  ],
  bien: { cadastre: { parcelles: [{ section: 'AB', numero: '0123' }] } },
  authentic: {
    immeubles: [{ commune: 'VINEUIL', codePostal: '41350', adresse: '12 rue des Vignes 41350 VINEUIL', parcelles: [{ prefixe: '000', section: 'AB', numero: '123', surface: '512' }, { section: 'AB', numero: '124', surface: '1 a 05 ca', lieuDit: 'Les Grouets' }] }],
    fichesClients: {
      a: { nom: 'Paul MOREAU', nomFamille: 'MOREAU', prenom: 'Paul', civilite: 'M', dateNaissance: '1961-03-12', lieuNaissance: '41000 BLOIS', domicile: '4 bis allée des Saules 41350 VINEUIL', adresse: { codePostal: '41350', commune: 'VINEUIL' }, profession: 'Retraité' }
    }
  }
});

test('adresses : forme de CLAIRE et forme d’Authentic', () => {
  const a = adresseDecomposee('VINEUIL (41350), 12 rue des Vignes');
  assert.deepEqual([a.numero, a.voie, a.codePostal, a.commune], ['12', 'rue des Vignes', '41350', 'VINEUIL']);
  const b = adresseDecomposee('4 bis allée des Saules 41350 VINEUIL');
  assert.deepEqual([b.numero, b.voie, b.codePostal, b.commune], ['4 bis', 'allée des Saules', '41350', 'VINEUIL']);
  assert.equal(adresseDecomposee('Lieu-dit Les Grouets 41350 VINEUIL').lieuDit, 'Les Grouets');
});

test('parcelles : tous les immeubles d’Authentic puis la fiche, sans doublon, surfaces en m²', () => {
  const p = parcellesGnau(dossier());
  assert.equal(p.map((x) => `${x.section} ${x.numero} ${x.surface}`).join(' | '), 'AB 123 512 | AB 124 105');
  assert.equal(p[0].prefixe, '');
  assert.equal(p[1].adresse, 'Les Grouets');
  assert.equal(p[0].commune, 'VINEUIL');
});

test('fiche DIA : vendeur principal et codemandeur, naissance et domicile d’Authentic, prix, commission, ce qui manque', () => {
  const f = ficheGnau(dossier(), 'dia', '2026-10-16');
  assert.equal(f.procedure, 'dia');
  assert.equal(f.dossier.libelle, 'VTE - MOREAU / LAMBERT');
  assert.equal(f.superficie, 617);
  assert.deepEqual([f.vendeur.nom, f.vendeur.prenom, f.vendeur.civilite, f.vendeur.dateNaissance, f.vendeur.lieuNaissance, f.vendeur.departementNaissance], ['MOREAU', 'Paul', 'M', '1961-03-12', 'BLOIS', '41']);
  assert.deepEqual([f.vendeur.adresse.numero, f.vendeur.adresse.voie, f.vendeur.adresse.codePostal, f.vendeur.adresse.commune], ['4 bis', 'allée des Saules', '41350', 'VINEUIL']);
  assert.equal(f.vendeur.profession, 'Retraité');
  assert.equal(f.vendeurs.codemandeurs.length, 1);
  assert.equal(f.vendeurs.codemandeurs[0].nom, 'MOREAU');
  assert.equal(f.acquereurs.autres[0].raisonSociale, 'SCI LES TILLEULS');
  assert.equal(f.prix, 209000);
  assert.equal(f.prixHorsMobilier, 204000);
  assert.deepEqual([f.commission.montantAcquereur, f.commission.chargeAcquereur, f.commission.chargeVendeur, f.commission.total], [9000, true, false, 9000]);
  assert.deepEqual(f.signature, { lieu: 'BLOIS', date: '2026-10-16', signataire: 'Maître Sophie GOSSART' });
  // Léa MOREAU n'a pas de fiche client lue : dit, jamais deviné.
  assert.ok(f.manques.some((m) => /Léa MOREAU/.test(m)), f.manques.join(' | '));
  assert.equal(f.vendeurs.codemandeurs[0].dateNaissance, '');
});

test('commission : jamais devinée à la charge de qui ; CU sans les manques de la DIA', () => {
  const d = dossier();
  d.honoraires.charge = null;
  const f = ficheGnau(d, 'dia', '2026-10-16');
  assert.equal(f.commission, null);
  assert.ok(f.manques.some((m) => /Commission/.test(m)));
  assert.ok(!ficheGnau(d, 'cua', '2026-10-16').manques.some((m) => /Commission|Prix|Léa/.test(m)));
});

test('liste des dossiers : ventes en cours seulement, recherche sur le nom, les parties et la commune', () => {
  const liste = [dossier(), { id: 's', nom: 'DURAND', typeAffaire: 'succession' }, Object.assign(dossier(), { id: 'a', archive: true })];
  assert.deepEqual(dossiersGnau(liste, '').map((x) => x.id), ['v1']);
  assert.deepEqual(dossiersGnau(liste, 'vine lamb').map((x) => x.id), ['v1']);
  assert.deepEqual(dossiersGnau(liste, 'dupont').map((x) => x.id), []);
});

test('relecture 16/10 : pays et département de naissance jamais devinés, nom sans capitales non découpé', () => {
  const d = dossier();
  d.authentic.fichesClients.a.lieuNaissance = '20000 AJACCIO';
  let f = ficheGnau(d, 'dia', '2026-10-16');
  assert.equal(f.vendeur.departementNaissance, '');
  assert.equal(f.vendeur.paysNaissance, '', 'pas de pays sur la fiche : vide, jamais « FRANCE »');
  d.authentic.fichesClients.a.paysNaissance = 'Maroc';
  d.authentic.fichesClients.a.lieuNaissance = 'CASABLANCA';
  f = ficheGnau(d, 'dia', '2026-10-16');
  assert.equal(f.vendeur.paysNaissance, 'MAROC');
  d.parties[2] = { role: 'ACQUEREUR', nom: 'Claire Lambert' };
  f = ficheGnau(d, 'dia', '2026-10-16');
  assert.deepEqual([f.acquereur.nom, f.acquereur.prenom], ['', '']);
  assert.ok(f.manques.some((m) => /Nom de famille d’une partie/.test(m)));
});

test('guichet d’Agglopolys : notaire de l’office (demandeur du CU, mandataire de la DIA) et nature du bien pour les cases du CERFA, jamais devinée', () => {
  const f = ficheGnau(dossier(), 'dia', '2026-10-16');
  assert.deepEqual(f.notaire, { nom: 'GOSSART', prenom: 'Sophie', qualite: 'Notaire' });
  assert.equal(f.batiTerrainPropre, true);
  assert.equal(f.nonBati, null);
  const t = ficheGnau(Object.assign(dossier(), { typeVente: 'terre' }), 'dia', '2026-10-16');
  assert.deepEqual([t.nonBati, t.batiTerrainPropre], [true, null]);
  const inconnu = ficheGnau(Object.assign(dossier(), { typeVente: '' }), 'dia', '2026-10-16');
  assert.deepEqual([inconnu.nonBati, inconnu.batiTerrainPropre], [null, null]);
});

test('plan cadastral du NAS : plan de situation de CLAIRE d’abord, puis plan ou extrait cadastral ; jamais un courrier ni une matrice', () => {
  const choix = choisirPlanCadastral([
    { nom: 'Demande de plan cadastral.pdf', chemin: 'a' }, { nom: 'Plan cadastral.pdf', chemin: 'b', modifieLe: '2026-01-01' },
    { nom: 'Plan de situation VINEUIL EV 10.pdf', chemin: 'c' }, { nom: 'matrice cadastrale.pdf', chemin: 'd' },
    { nom: 'Extrait_cadastral 2026.pdf', chemin: 'e', modifieLe: '2026-05-01' }, { nom: 'compromis.pdf', chemin: 'f' }]);
  assert.deepEqual(choix.map((f) => f.chemin), ['c', 'e', 'b']);
});

test('surfaces des parcelles : toutes les formes de la fiche bien d’Authentic (étude 16/10 : surfaces absentes au guichet)', () => {
  const d = dossier();
  d.authentic = {};
  d.bien = { cadastre: { parcelles: [
    { section: 'EV', numero: '10', surface: '00ha 06a 06ca' }, { section: 'EV', numero: '11', surface: '1 206' },
    { section: 'EV', numero: '12', surface: '606 m²' }, { section: 'EV', numero: '13', surface: '598,00' }] } };
  assert.deepEqual(ficheGnau(d, 'dia', '2026-10-16').parcelles.map((p) => p.surface), [606, 1206, 606, 598]);
});

test('route du plan cadastral : PDF du dossier relié au NAS, nom neutre, jamais un chemin venu de l’extension', async () => {
  const os = require('os'); const fs = require('fs'); const path = require('path');
  const { ouvrirDb } = require('../src/db');
  const { creerApp } = require('../src/app');
  const nas = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-gnau-'));
  fs.mkdirSync(path.join(nas, 'VTE MOREAU', 'Urbanisme'), { recursive: true });
  fs.writeFileSync(path.join(nas, 'VTE MOREAU', 'Urbanisme', 'Plan de situation VINEUIL EV 10.pdf'), '%PDF-1.4 plan');
  fs.writeFileSync(path.join(nas, 'VTE MOREAU', 'Demande de plan cadastral.pdf'), '%PDF-1.4 courrier');
  const db = ouvrirDb(':memory:');
  const { app, depot } = creerApp({ db, config: { racineRepo: os.tmpdir(), port: 0, authActive: false, nasRacine: nas } });
  depot.creer(Object.assign(dossier(), { nasDossier: 'VTE MOREAU' }));
  depot.creer(Object.assign(dossier(), { id: 'v2', nom: 'AUTRE' }));
  const serveur = app.listen(0);
  await new Promise((r) => serveur.once('listening', r));
  try {
    const base = `http://127.0.0.1:${serveur.address().port}`;
    const r = await fetch(`${base}/api/gnau/plan/v1`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    assert.equal(decodeURIComponent(r.headers.get('x-claire-nom')), 'Plan cadastral.pdf');
    assert.equal(await r.text(), '%PDF-1.4 plan');
    assert.equal((await fetch(`${base}/api/gnau/plan/v2`)).status, 404); // non relié au NAS
    assert.equal((await fetch(`${base}/api/gnau/plan/..%2F..`)).status, 400);
  } finally {
    serveur.close(); db.close(); fs.rmSync(nas, { recursive: true, force: true });
  }
});
