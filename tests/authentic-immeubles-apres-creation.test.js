'use strict';
// Fiche bien d'Authentic lue APRÈS la création d'une vente (17/10) : elle rejoint les immeubles du dossier, que la Constitution, la fiche,
// l'urbanisme et l'extension GNAU lisent tous (commun/donnees-dossier.js). Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const dossier = () => ({
  id: 'v1', nom: 'EXEMPLE / ESSAI', typeVente: 'maison', adresseBien: 'BLOIS (41000), 3 rue Imaginaire',
  bien: { adresse: { codePostal: '41000', commune: 'BLOIS' }, cadastre: { parcelles: [{ section: 'AB', numero: '12' }] } },
  authentic: { immeubles: [
    { adresse: 'BLOIS (41000), 3 rue Imaginaire', codePostal: '41000', commune: 'BLOIS', parcelles: [{ section: 'AB', numero: '12' }] },
    { adresse: 'VINEUIL (41350), Les Prés', codePostal: '41350', commune: 'VINEUIL', parcelles: [{ section: 'ZC', numero: '45' }] }
  ] }
});
const noter = () => {};

test('fiche bien du bien principal : parcelle ajoutée sur la fiche ET dans les immeubles, vue par tous les outils', () => {
  const d = dossier();
  const r = app.appliquerBienAuthentic(d, { adresse: { texte: '3 rue Imaginaire 41000 BLOIS', codePostal: '41000' }, parcelles: [{ section: 'AB', numero: '12', surface: '512' }, { section: 'AB', numero: '13', surface: '88' }] }, noter, { modifie: false });
  assert.equal(r.modifie, true);
  assert.equal(d.bien.cadastre.parcelles.map((p) => p.numero).join(','), '12,13');
  assert.equal(d.authentic.immeubles[0].parcelles.map((p) => p.numero).join(','), '12,13');
  assert.equal(app.parcellesAfficheesFiche(d).lignes.length, 3, 'la fiche montre aussi la parcelle de Vineuil');
  assert.equal(app.groupesParcellesConstitution(d).length, 2);
});

test('fiche bien d’un autre bien DÉJÀ retenu (autre commune) : complété dans les immeubles, la fiche ne change pas', () => {
  const d = dossier();
  const r = app.appliquerBienAuthentic(d, { adresse: { texte: 'Les Prés 41350 VINEUIL', codePostal: '41350' }, parcelles: [{ section: 'ZC', numero: '45', surface: '5000', nature: 'T' }, { section: 'ZC', numero: '46' }] }, noter, { modifie: false });
  assert.equal(r.modifie, true);
  assert.equal(r.raison, undefined);
  assert.equal(d.bien.cadastre.parcelles.length, 1, 'le bien principal de la fiche est intact');
  assert.equal(d.authentic.immeubles[1].parcelles.map((p) => p.numero).join(','), '45,46');
  assert.equal(d.authentic.immeubles[1].parcelles[0].surface, '5000');
});

test('fiche bien inconnue qui contredit le dossier : toujours écartée (page d’un autre dossier)', () => {
  const d = dossier();
  const r = app.appliquerBienAuthentic(d, { adresse: { texte: '9 route Fictive 41300 SALBRIS', codePostal: '41300' }, parcelles: [{ section: 'B', numero: '9' }] }, noter, { modifie: false });
  assert.ok(r.raison);
  assert.equal(d.authentic.immeubles.length, 2);
});
