'use strict';
// Étude 07/10 : « bien faire attention quand vendeur et acquéreurs portent le même nom ; les parties doivent partout dans CLAIRE
// être identifiées par nom et prénom pour être reconnues ». Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const dossier = () => ({ id: 'h', nom: 'MARTIN / MARTIN', typeVente: 'maison', pieces: {}, historique: [],
  parties: [{ role: 'VENDEUR', nom: 'Paul MARTIN' }, { role: 'ACQUEREUR', nom: 'Léa MARTIN' }] });

test('fiche client d’Authentic : le prénom désigne le côté, jamais le nom seul', () => {
  assert.equal(app.roleClientAuthenticDansDossier(dossier(), { nom: 'MARTIN', prenom: 'Léa' }), 'ACQUEREUR');
  assert.equal(app.roleClientAuthenticDansDossier(dossier(), { nom: 'MARTIN', prenom: 'Paul' }), 'VENDEUR');
  // Un autre MARTIN (prénom inconnu de la fiche) : à rattacher, jamais deviné.
  assert.equal(app.roleClientAuthenticDansDossier(dossier(), { nom: 'MARTIN', prenom: 'Hugo' }), '');
  // Une seule partie MARTIN, mais le nom est des deux côtés du dossier : le prénom est exigé.
  const d = dossier(); d.parties = [{ role: 'VENDEUR', nom: 'Paul MARTIN' }];
  assert.equal(app.roleClientAuthenticDansDossier(d, { nom: 'MARTIN', prenom: 'Léa' }), '');
});

test('création depuis Authentic : même nom des deux côtés, le prénom de l’intitulé départage, sinon rien', () => {
  const pers = (id, prenom) => ({ id, nom: 'MARTIN', prenom, emails: [], telephones: [] });
  const avecPrenoms = app.partiesExportAuthentic({ intitule: 'VTE MARTIN Paul / MARTIN Léa', personnes: [pers('a', 'Paul'), pers('b', 'Léa')], parties: [], documents: [], immeubles: [] });
  assert.equal(avecPrenoms.map(p => p.nom + ':' + p.role).join(','), 'Paul MARTIN:VENDEUR,Léa MARTIN:ACQUEREUR');
  const sansPrenoms = app.partiesExportAuthentic({ intitule: 'VTE MARTIN / MARTIN', personnes: [pers('a', 'Paul'), pers('b', 'Léa')], parties: [], documents: [], immeubles: [] });
  assert.equal(sansPrenoms.length, 0, 'jamais le côté deviné par le nom seul');
});

test('fonds reçus : le nom partagé avec le vendeur est cherché avec le prénom de l’acquéreur', () => {
  const mots = app.motsPayeurDossier(dossier());
  assert.equal(mots.join(','), 'martin lea');
  assert.ok(app.ligneNommeLePayeur('MARTIN Léa VIR RECU', mots));
  assert.ok(!app.ligneNommeLePayeur('MARTIN Paul VIR RECU', mots), 'le vendeur du même nom n’est pas l’acquéreur');
  // Noms différents : le nom de famille seul — jamais le prénom seul (audit 13/10).
  assert.equal(app.motsPayeurDossier({ nom: 'DUPONT / MARTIN', parties: [{ role: 'VENDEUR', nom: 'Paul DUPONT' }, { role: 'ACQUEREUR', nom: 'Léa MARTIN' }] }).join(','), 'martin');
});

test('Claire Scan : une partie connue par son seul nom, porté des deux côtés, ne dit pas le côté de la pièce', () => {
  const mots = app.texteMotsScan('Carte nationale d’identité MARTIN Léa née le');
  const d = dossier();
  assert.equal(app.scoreDossierScan(d, mots).role, 'ACQUEREUR', 'nom + prénom : le côté est sûr');
  d.parties = [{ role: 'VENDEUR', nom: 'MARTIN' }, { role: 'ACQUEREUR', nom: 'MARTIN' }];
  assert.equal(app.scoreDossierScan(d, mots).role, null);
  d.parties = [{ role: 'VENDEUR', nom: 'MARTIN' }, { role: 'ACQUEREUR', nom: 'Léa MARTIN' }];
  assert.equal(app.scoreDossierScan(d, mots).role, 'ACQUEREUR', 'le vendeur sans prénom ne compte pas pour le côté');
});

// Étude 07/10 : « si un dossier est archivé, ne pas aller lui rechercher des pièces sur le commun ».
test('dossier archivé : aucune recherche de pièces sur le NAS, quel que soit le chemin', async () => {
  const vm = require('node:vm');
  const a = chargerApplication();
  vm.runInContext(`var __appelsNas = 0; fetchAvecAuth = async function () { __appelsNas++; return { ok: false, status: 500, json: async () => ({}) }; };
    dossiers.push({ id: 'arc', nom: 'ANCIEN / DOSSIER', archive: true, dossierLie: true, nasDossier: 'ANCIEN', pieces: {}, historique: [] });`, a);
  await vm.runInContext(`verifierDossierLocal('arc', true)`, a);
  assert.equal(vm.runInContext('__appelsNas', a), 0);
});

test('NAS : un dossier du commun déjà relié à un autre dossier en cours n’est jamais relié seul une seconde fois', () => {
  const a = { id: 'a', nom: 'ROY / LAMBERT', nasDossier: 'ROY' };
  const b = { id: 'b', nom: 'GARNIER / ROY' };
  const archive = { id: 'c', nom: 'ROY', nasDossier: 'ROY ancien', archive: true };
  const liste = [a, b, archive];
  assert.equal(app.dossierNasPrisParUnAutre(b, 'ROY', liste), true);
  assert.equal(app.dossierNasPrisParUnAutre(a, 'ROY', liste), false, 'son propre lien');
  assert.equal(app.dossierNasPrisParUnAutre(b, 'ROY ancien', liste), false, 'un dossier archivé ne retient pas son dossier du commun');
  assert.equal(app.dossierNasPrisParUnAutre(b, 'GARNIER ROY', liste), false);
});

test('Authentic : une fiche ne se complète jamais seule d’un dossier relevé qui n’est pas le seul à porter ses noms', () => {
  const g1 = { intitule: '1 - VTE ROY / LAMBERT', reference: 'A 2026 00001' };
  const g2 = { intitule: '1 - VTE GARNIER / ROY', reference: 'A 2026 00002' };
  const seulRoy = { id: 'x', nom: 'ROY' };
  assert.equal(app.indexGroupeAuthenticPourDossier(seulRoy, [g1, g2]), -1, 'deux dossiers ROY relevés : aucun');
  assert.equal(app.groupeAuthenticPourComplementAuto(seulRoy, [g1, g2], [seulRoy]), null);
  assert.equal(app.indexGroupeAuthenticPourDossier({ id: 'y', nom: 'ROY / LAMBERT' }, [g1, g2]), 0);
  // La référence d'Authentic reste la voie sûre.
  assert.equal(app.groupeAuthenticPourComplementAuto({ id: 'z', nom: 'ROY', referenceAuthentic: 'A 2026 00002' }, [g1, g2], []), g2);
});

test('fonds reçus : un nom de famille porté par un autre dossier en cours est cherché avec le prénom', () => {
  const a = { id: 'a', nom: 'LAMBERT / ROY', parties: [{ role: 'VENDEUR', nom: 'Anne LAMBERT' }, { role: 'ACQUEREUR', nom: 'Paul ROY' }] };
  const b = { id: 'b', nom: 'GARNIER / ROY', parties: [{ role: 'VENDEUR', nom: 'Luc GARNIER' }, { role: 'ACQUEREUR', nom: 'Sylvie ROY' }] };
  assert.equal(app.motsPayeurDossier(a, [a, b]).join(','), 'roy paul');
  assert.equal(app.motsPayeurDossier(b, [a, b]).join(','), 'roy sylvie');
  // Seul dossier ROY : le nom suffit (le prénom n'est jamais cherché seul, audit 13/10).
  assert.equal(app.motsPayeurDossier(a, [a]).join(','), 'roy');
  // Un prénom porté ailleurs n'empêche rien.
  const c = { id: 'c', nom: 'DURAND / LEROY', parties: [{ role: 'VENDEUR', nom: 'Paul DURAND' }] };
  assert.equal(app.motsPayeurDossier(a, [a, c]).join(','), 'roy');
});

test('partie du mauvais côté retirée : vendeur « nom seul » qui est le nom de l\'acquéreur (étude 19/10)', () => {
  const d = { id: 'm', nom: 'EXEMPLE - ESSAI', historique: [], parties: [{ role: 'VENDEUR', nom: 'EXEMPLE' }, { role: 'VENDEUR', nom: 'ESSAI' }, { role: 'ACQUEREUR', nom: 'Paul ESSAI', civilite: 'M' }] };
  assert.equal(app.retirerPartieDuMauvaisCote(d), true);
  assert.equal(d.parties.map(p => p.role + ':' + p.nom).join('|'), 'VENDEUR:EXEMPLE|ACQUEREUR:Paul ESSAI');
  assert.equal(app.retirerPartieDuMauvaisCote(d), false);
  // Homonymes réels : le nom du dossier cite le nom des deux côtés, ou le vendeur a son prénom → jamais retiré.
  const h = dossier();
  assert.equal(app.retirerPartieDuMauvaisCote(h), false);
  const p = { id: 'p', nom: 'EXEMPLE - ESSAI', historique: [], parties: [{ role: 'VENDEUR', nom: 'Marc ESSAI' }, { role: 'ACQUEREUR', nom: 'Paul ESSAI' }] };
  assert.equal(app.retirerPartieDuMauvaisCote(p), false);
});
