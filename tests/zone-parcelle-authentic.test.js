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
