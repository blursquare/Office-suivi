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
  // Noms différents : inchangé.
  assert.equal(app.motsPayeurDossier({ nom: 'DUPONT / MARTIN', parties: [{ role: 'VENDEUR', nom: 'Paul DUPONT' }, { role: 'ACQUEREUR', nom: 'Léa MARTIN' }] }).join(','), 'lea,martin');
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
