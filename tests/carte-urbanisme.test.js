'use strict';

// Carte du Contrôle de l'urbanisme (étude 31/10, client/156-carte-urbanisme.js) : mesures, contenance, ventes DVF, liens.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('mesure : surface d’un carré de 100 m de côté et périmètre', () => {
  // 100 m en latitude ≈ 0,000899° ; en longitude à 47,5° ≈ 0,001331°.
  const lat = 47.5; const dLat = 100 / 111194.9; const dLon = 100 / (111194.9 * Math.cos(lat * Math.PI / 180));
  const carre = [[lat, 1.3], [lat + dLat, 1.3], [lat + dLat, 1.3 + dLon], [lat, 1.3 + dLon]];
  const aire = app.aireGeodesiqueM2(carre);
  assert.ok(Math.abs(aire - 10000) < 60, `aire ${aire}`);
  assert.ok(Math.abs(app.longueurLigneM(carre, true) - 400) < 2);
  assert.ok(Math.abs(app.longueurLigneM(carre.slice(0, 2)) - 100) < 1);
  assert.equal(app.aireGeodesiqueM2(carre.slice(0, 2)), 0, 'deux points : pas de surface');
});

test('contenance cadastrale à la française', () => {
  assert.equal(app.contenanceCadastrale(20185), '2 ha 01 a 85 ca');
  assert.equal(app.contenanceCadastrale(1234), '12 a 34 ca');
  assert.equal(app.contenanceCadastrale(85), '85 ca');
  assert.equal(app.contenanceCadastrale(0), '—');
  assert.equal(app.contenanceCadastrale(10000), '1 ha 00 a 00 ca');
});

test('résultat d’une mesure : distance puis surface, consigne tant qu’il manque des points', () => {
  assert.match(app.resultatMesureCarte('distance', [[47.5, 1.3]]).detail, /double-clic/);
  assert.equal(app.resultatMesureCarte('surface', [[47.5, 1.3], [47.501, 1.3]]).valeur, '—');
  const r = app.resultatMesureCarte('surface', [[47.5, 1.3], [47.501, 1.3], [47.501, 1.301]]);
  assert.match(r.valeur, /m²$/);
  assert.match(r.detail, /périmètre/);
});

test('couleur d’une zone du PLU : U rouge, AU orange, A jaune, N vert', () => {
  assert.equal(app.couleurZonePlu('U'), 'cat-rouge');
  assert.equal(app.couleurZonePlu('AUc'), 'cat-orange');
  assert.equal(app.couleurZonePlu('A'), 'cat-jaune');
  assert.equal(app.couleurZonePlu('N'), 'cat-vert');
  assert.equal(app.couleurZonePlu(''), 'cat-gris');
});

test('lien Géofoncier centré sur le point (forme #zoom/lat/lon du site)', () => {
  assert.equal(app.lienGeofoncier(47.348421, 1.582102, 18), 'https://public.geofoncier.fr/#18/47.348421/1.582102');
  assert.equal(app.lienGeofoncier(47, 1, 99), 'https://public.geofoncier.fr/#20/47.000000/1.000000');
});

test('sections du dossier et ventes filtrées sans doublon, les plus récentes d’abord', () => {
  assert.equal(app.sectionsDesParcellesCarte('AB 12, AB 13, C 4').join(','), 'AB,C');
  const maison = { id: 'm1', date: '2024-05-02', locaux: [{ type: 'Maison', surface: 95, pieces: 4 }], surfaceTerrain: 820 };
  const terrain = { id: 't1', date: '2025-01-10', locaux: [], surfaceTerrain: 2820 };
  const toutes = app.ventesFiltreesCarte([[maison, terrain], [maison]], 'tout');
  assert.equal(toutes.map(v => v.id).join(','), 't1,m1');
  assert.equal(app.ventesFiltreesCarte([[maison, terrain]], 'bati').map(v => v.id).join(','), 'm1');
  assert.equal(app.ventesFiltreesCarte([[maison, terrain]], 'terrain').map(v => v.id).join(','), 't1');
  assert.equal(app.resumeVenteCarte(maison), 'Maison 95 m² 4 p. · terrain 8 a 20 ca');
  assert.equal(app.resumeVenteCarte(terrain), 'Terrain · terrain 28 a 20 ca');
});

test('adresse de la Base adresse nationale : celle de la parcelle, sinon le plus proche avec sa parcelle', () => {
  assert.match(app.texteAdresseBanCarte([{ libelle: '7 rue X', certifie: true }], null), /Adresse de cette parcelle, vérifiée par la commune/);
  const voisin = app.texteAdresseBanCarte([], { libelle: '40 rue des Sorbiers', distance: 165, banLue: true, certifie: true, parcelles: ['ER 80'] });
  assert.match(voisin, /à 165 m, rattaché à la parcelle ER 80 · vérifié par la commune — pas l’adresse de cette parcelle/);
  assert.match(app.texteAdresseBanCarte([], { libelle: 'x', distance: 5, banLue: true, certifie: false, parcelles: [] }), /rattaché à aucune parcelle/);
  assert.equal(app.texteAdresseBanCarte([], null), '');
});

test('clichés de l’IGN : lien « Remonter le temps » centré sur le bien, à l’année et à la mission', () => {
  assert.equal(app.lienRemonterLeTemps(1.580849, 47.348714, 2001, 'P02000042'), 'https://remonterletemps.ign.fr/telecharger/?lon=1.580849&lat=47.348714&z=15&layer=pva&year=2001&mission=P02000042');
  const c = app.centreParcellesCarte({ etiquettes: [{ dossier: true, x: 1, y: 47 }, { dossier: true, x: 2, y: 48 }, { dossier: false, x: 9, y: 9 }] });
  assert.equal(`${c.lon},${c.lat}`, '1.5,47.5');
  assert.equal(app.centreParcellesCarte(null), null);
});

test('vue de la rue et décennies des clichés', () => {
  assert.equal(app.lienStreetView(47.570033, 1.383485), 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=47.570033,1.383485');
  assert.deepEqual(JSON.parse(JSON.stringify(app.pointStreetViewCarte({ adressesParcelle: [{ position: { lat: 1, lon: 2 } }], adresse: { position: { lat: 3, lon: 4 } } }))), { lat: 1, lon: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(app.pointStreetViewCarte({ adressesParcelle: [], adresse: null, point: { lat: 5, lon: 6 } }))), { lat: 5, lon: 6 });
  const d = app.decenniesClichesCarte([{ annee: 2018 }, { annee: 2011 }, { annee: 1986 }, { annee: 1955 }, { annee: 1949 }, { annee: 1946 }]);
  assert.equal(d.map(x => `${x.decennie}:${x.annees.join('/')}`).join(' | '), 'Années 2010:2018/2011 | Années 80:1986 | Années 50:1955 | Années 40:1949/1946');
});
