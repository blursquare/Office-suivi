'use strict';
// Aperçu de l'immeuble sur la page du sous-dossier d'Authentic (structure reçue le 16/10) : lots et parcelles avec surface. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const page = () => ({
  titre: 'Authentic', onglets: [],
  champs: [{ groupe: '', libelle: 'Cave', valeur: '1' }, { groupe: '', libelle: 'Appartement', valeur: '1' }],
  tableaux: [
    { titre: 'Rédaction (2)', entete: ['', '', '', '', ''], lignes: [['Acte VTE MARTEL / FOURNIER', '', '01/10/2026', '', 'Signé le 01/10/2026']] },
    { titre: 'Lots de l’immeuble (2)', entete: ['Numéro', 'Type', "Ordre d'apparition dans la rédaction"], lignes: [['12', 'Cave', '2'], ['4', 'Appartement', '1']] },
    { titre: 'Références cadastrales', entete: ['Commune', 'Volume(s)', 'Préfixe', 'Section', 'Numéro', 'Adresse', 'Nature', 'ha', 'a', 'ca'],
      lignes: [['BLOIS', '', '', 'AB', '0123', '12 RUE DES LILAS', '', '0', '07', '95'], ['BLOIS', '', '', 'AB', '124', '12 RUE DES LILAS', '', '1', '00', '06']] }
  ],
  texte: '12 - Vente MARTEL/FOURNIER\nComparants'
});

test('aperçu : lots, type copropriété, parcelles et surfaces', () => {
  const b = app.apercuImmeubleAuthentic(page());
  assert.equal(b.type, 'copropriete');
  assert.equal(b.lots.map(l => `${l.numero}:${l.type}`).join(','), '12:Cave,4:Appartement');
  assert.equal(b.parcelles.map(p => `${p.section} ${p.numero} ${p.surface} ${p.commune}`).join(' | '), 'AB 123 07 a 95 ca BLOIS | AB 124 1 ha 00 a 06 ca BLOIS');
  assert.equal(app.centiaresDepuisContenance(b.parcelles[1].surface), 10006);
});

test('aperçu appliqué à un dossier : lots ajoutés, copropriété, surfaces complétées', () => {
  const d = { id: 'd1', nom: 'MARTEL / FOURNIER', typeVente: 'maison', adresseBien: 'BLOIS (41000), 12 rue des Lilas', parties: [], historique: [],
    bien: { cadastre: { section: 'AB', numero: '123', parcelles: [{ section: 'AB', numero: '123' }] } } };
  app.appliquerReleveSurDossier(d, page(), '2026-10-16T10:00:00Z', [d]);
  assert.equal(d.typeVente, 'copropriete');
  assert.equal(d.bien.lots.map(l => l.numero).join(','), '12,4');
  assert.equal(d.bien.cadastre.parcelles.map(p => `${p.numero}:${p.surface}`).join(','), '123:07 a 95 ca,124:1 ha 00 a 06 ca');
});

test('sans tableau de l’immeuble : rien', () => {
  assert.equal(app.apercuImmeubleAuthentic({ tableaux: [{ entete: ['', ''], lignes: [['x', 'y']] }] }), null);
});

test('création : l’aperçu complète la fiche bien relevée', () => {
  const r = app.avecApercuImmeubleAuthentic([{ id: 'b', adresse: { texte: '12 rue des Lilas 41000 BLOIS' }, type: null, parcelles: [{ section: 'AB', numero: '123' }], lots: [] }], app.apercuImmeubleAuthentic(page()));
  assert.equal(r.length, 1);
  assert.equal(r[0].type, 'copropriete');
  assert.equal(r[0].parcelles.map(p => p.numero + ':' + (p.surface || '')).join(','), '123:07 a 95 ca,124:1 ha 00 a 06 ca');
  assert.equal(r[0].lots.length, 2);
});
