'use strict';

// Recherche de la barre latérale (étude 20/10) : dossiers par nom, partie, adresse, référence ; outils par libellé. Dossiers inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const liste = [
  { id: 'a', nom: 'MARTEL / FOURNIER', responsable: 'Julie VASSELIN', parties: [{ role: 'VENDEUR', nom: 'MARTEL', prenom: 'Alexandre' }, { role: 'ACQUEREUR', nom: 'FOURNIER', prenom: 'Camille' }], adresseBien: 'BLOIS (41000), 12 rue des Lices', referenceAuthentic: 'A 2026 00247' },
  { id: 'b', nom: 'DURAND', typeAffaire: 'succession', defunt: { nom: 'DURAND', prenom: 'Henri' }, biens: [{ adresse: 'VENDÔME (41100), 3 rue du Moulin' }], parties: [] },
  { id: 'c', nom: 'MARTEL / PETIT', archive: true, parties: [] },
  { id: 'd', nom: 'ABIME', parties: 'x', bien: 'texte', biens: 5, defunt: 'y' },
  { id: 'e', nom: 'SUPPRIME', deleted: true }
];
const ids = (q) => app.dossiersRechercheSidebar(q, liste).map(d => d.id).join(',');

test('dossiersRechercheSidebar : nom, partie, prénom, adresse, référence, défunt', () => {
  assert.equal(ids('martel'), 'a,c', 'l’archivé passe après');
  assert.equal(ids('camille fournier'), 'a');
  assert.equal(ids('lices'), 'a');
  assert.equal(ids('A 2026 00247'), 'a');
  assert.equal(ids('henri'), 'b');
  assert.equal(ids('moulin vendome'), 'b');
  assert.equal(ids('succ'), 'b');
});

test('dossiersRechercheSidebar : tous les mots comptent, accents ignorés, rien sans recherche, jamais un dossier abîmé ou supprimé', () => {
  assert.equal(ids('martel lices'), 'a');
  assert.equal(ids('martel inconnu'), '');
  assert.equal(ids('   '), '');
  assert.equal(ids('VENDÔME'), 'b');
  assert.equal(ids('supprime'), '');
  assert.equal(ids('abime'), 'd');
  assert.equal(app.dossiersRechercheSidebar('x', null).length, 0);
});

test('outilsRechercheSidebar : les libellés de la barre, tous les mots', () => {
  const outils = [{ id: 'tab-suivi', libelle: 'Suivi des dossiers' }, { id: 'tab-appel-fonds', libelle: 'Appel de fonds' }, { id: 'tab-quotites', libelle: 'Quotités' }, { id: 'tab-scans', libelle: 'Claire Scan' }];
  const l = (q) => app.outilsRechercheSidebar(q, outils).map(o => o.id).join(',');
  assert.equal(l('fonds'), 'tab-appel-fonds');
  assert.equal(l('quotites'), 'tab-quotites');
  assert.equal(l('suivi dossiers'), 'tab-suivi');
  assert.equal(l('scan'), 'tab-scans');
  assert.equal(l('xyz'), '');
  assert.equal(l(''), '');
});
