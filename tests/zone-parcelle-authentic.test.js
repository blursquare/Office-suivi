'use strict';

// 22/10 : la colonne « Zone » d'Authentic rendait, pour une liste déroulante sans choix, le texte de toutes ses options collées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

test('zone d\'une parcelle d\'Authentic : une vraie zone passe, les options collées sont écartées', () => {
  const app = chargerApplication();
  assert.equal(app.zoneParcelleAuthentic('U'), 'U');
  assert.equal(app.zoneParcelleAuthentic('Agricole (PLU)'), 'Agricole (PLU)');
  assert.equal(app.zoneParcelleAuthentic('Agricole (PLU)Bois et forêt dans une commune sans document d’urbanisme'), '');
  assert.equal(app.zoneParcelleAuthentic('x'.repeat(80)), '');
  assert.equal(app.zoneParcelleAuthentic(''), '');
  assert.equal(app.libelleParcelleCb({ section: 'CH', numero: '562', zone: 'Agricole (PLU)Bois et forêt dans une commune' }), 'CH 562');
});

test('fiche bien d\'Authentic : les parcelles du tableau « Ancien cadastre » ne sont pas reprises (22/10)', () => {
  const app = chargerApplication();
  const capture = { champs: [], tableaux: [
    { titre: 'Parcelle', entete: ['Section', 'Numéro'], lignes: [['CH', '562']] },
    { titre: 'Ancien cadastre', entete: ['Section', 'Numéro'], lignes: [['AB', '12']] }
  ] };
  const bien = app.bienDepuisFicheAuthentic(capture);
  const texte = JSON.stringify(bien);
  assert.ok(texte.includes('562'), texte);
  assert.ok(!texte.includes('"12"'), texte);
});

test('fiche bien : les parcelles SANS surface (ancien cadastre) sont écartées dès qu’une parcelle a la sienne (26/10)', () => {
  const app = chargerApplication();
  const capture = { champs: [], tableaux: [{ titre: 'Parcelle Assise volumétrique', entete: ['Commune', 'Préfixe', 'Section', 'Numéro', 'Adresse ou lieu-dit', 'Nature', 'Zone urbanisme', 'SPF', 'surface'],
    lignes: [['BLOIS', '', 'CH', '562', '67 RUE DES ROSIERS', '', '', 'BLOIS 1', '5'], ['BLOIS', '', 'CH', '454', '', '', '', '', ''], ['BLOIS', '', 'CH', '563', '67 RUE DES ROSIERS', '', '', 'BLOIS 1', '12']] }] };
  const bien = app.bienDepuisFicheAuthentic(capture);
  assert.equal(bien.parcelles.map((p) => p.section + p.numero).join(','), 'CH562,CH563');
  // Aucune surface du tout : rien n'est écarté.
  assert.equal(app.parcellesSansAncienCadastre([{ section: 'AB', numero: '1' }, { section: 'AB', numero: '2' }]).length, 2);
});

test('retirerParcellesAncienCadastre : nettoie les immeubles retenus et la fiche (26/10)', () => {
  const app = chargerApplication();
  const d = { id: 'x', historique: [], bien: { cadastre: { parcelles: [{ section: 'CH', numero: '562' }, { section: 'CH', numero: '454' }, { section: 'AB', numero: '9' }] } },
    authentic: { immeubles: [{ adresse: 'BLOIS', parcelles: [{ section: 'CH', numero: '562', surface: '5' }, { section: 'CH', numero: '454' }] }] } };
  assert.equal(app.retirerParcellesAncienCadastre(d), true);
  assert.equal(d.authentic.immeubles[0].parcelles.map((p) => p.numero).join(','), '562');
  assert.equal(d.bien.cadastre.parcelles.map((p) => p.numero).join(','), '562,9', 'la parcelle saisie ailleurs reste');
  assert.equal(app.retirerParcellesAncienCadastre(d), false);
});
