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

test('relecture : jamais en succession, autre commune refusée, type déjà repris gardé, surface nulle ignorée, adresse cadastrale gardée', () => {
  const succ = { id: 's', nom: 'Succession X', typeAffaire: 'succession', parties: [], historique: [], authentic: { immeubles: [] } };
  app.appliquerReleveSurDossier(succ, page(), '2026-10-16T10:00:00Z', [succ]);
  assert.equal((succ.authentic.immeubles || []).length, 0);
  const ailleurs = { id: 't', nom: 'MARTEL / FOURNIER', typeVente: 'maison', adresseBien: 'TOURS (37000), 3 rue Basse', parties: [], historique: [] };
  app.appliquerReleveSurDossier(ailleurs, page(), '2026-10-16T10:00:00Z', [ailleurs]);
  assert.ok(!(ailleurs.bien && ailleurs.bien.cadastre));
  const d = { id: 'm', nom: 'MARTEL / FOURNIER', typeVente: 'maison', adresseBien: 'BLOIS (41000), 12 rue des Lilas', parties: [], historique: [],
    authentic: { valeurs: { typeVente: 'maison' } } };
  app.appliquerReleveSurDossier(d, page(), '2026-10-16T10:00:00Z', [d]);
  assert.equal(d.typeVente, 'maison');
  assert.equal(d.bien.lots.length, 2);
  assert.equal(d.bien.cadastre.parcelles[0].adresseCadastre, '12 RUE DES LILAS');
  const zero = page(); zero.tableaux[2].lignes[0] = ['BLOIS', '', '', 'AB', '7', '', '', '0', '00', '00'];
  assert.equal(app.apercuImmeubleAuthentic(zero).parcelles[0].surface, undefined);
  const unHa = page(); unHa.tableaux[2].lignes[0] = ['BLOIS', '', '', 'AB', '8', '', '', '1', '', ''];
  assert.equal(app.apercuImmeubleAuthentic(unHa).parcelles[0].surface, '1 ha 0 a 0 ca');
});
