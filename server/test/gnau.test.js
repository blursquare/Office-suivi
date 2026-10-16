'use strict';
// Fiche d'un dossier pour le CU et la DIA sur les guichets uniques (gnau.js) — noms, adresses, parcelles et montants inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ficheGnau, dossiersGnau, adresseDecomposee, parcellesGnau } = require('../src/gnau');

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
