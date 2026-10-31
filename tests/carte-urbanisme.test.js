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

test('adresse : seulement celle que la commune a rattachée à la parcelle, jamais la plus proche (étude 31/10)', () => {
  assert.equal(app.texteAdresseBanCarte([{ libelle: '7 rue X', certifie: true }], true), 'Adresse de cette parcelle, vérifiée par la commune');
  assert.match(app.texteAdresseBanCarte([{ libelle: '7 rue X', certifie: false }], true), /pas encore certifiée/);
  assert.match(app.texteAdresseBanCarte([], true), /Aucune adresse rattachée à cette parcelle/);
  assert.match(app.texteAdresseBanCarte([], false), /non lue/);
  assert.equal(app.lienCertificatAdressage('41295_0140_00007'), 'https://adresse.data.gouv.fr/carte-base-adresse-nationale?id=41295_0140_00007');
  assert.equal(app.lienCertificatAdressage('x"><script>'), '');
  const html = app.adresseParcelleCarteHtml({ adressesParcelle: [{ libelle: '7 rue des Prés 41350 Vineuil', certifie: true, banId: '41295_0140_00007' }], adresseLue: true });
  assert.match(html, /certifiee/);
  assert.match(html, /Certificat d’adressage/);
});

test('calques : un à la fois, sauf « Superposer »', () => {
  const j = (o) => Object.keys(o).filter(k => o[k]).join(',');
  const depart = { cadastre: true, plu: false, ventes: false };
  assert.equal(j(app.couchesApresClicCarte(depart, 'plu', false)), 'plu');
  assert.equal(j(app.couchesApresClicCarte({ cadastre: false, plu: true, ventes: false }, 'plu', false)), '');
  assert.equal(j(app.couchesApresClicCarte(depart, 'ventes', true)), 'cadastre,ventes');
  assert.equal(j(app.couchesSansSuperpositionCarte({ cadastre: true, plu: true, ventes: true })), 'cadastre');
  assert.equal(j(app.couchesSansSuperpositionCarte({ cadastre: false, plu: true, ventes: true })), 'plu');
});

test('cliché de l’IGN : pixel d’un point au sol et inverse, contour décalé', () => {
  // Cliché « tête en bas » (nord en bas de l'image), 1 000 × 500 px.
  const coins = [[1.01, 47.00], [1.00, 47.00], [1.00, 47.01], [1.01, 47.01]];
  const p = app.pixelDuPointCliche(coins, 1.0075, 47.0025, 1000, 500);
  assert.ok(Math.abs(p.x - 250) < 0.01 && Math.abs(p.y - 125) < 0.01 && p.dedans);
  const q = app.pointDuPixelCliche(coins, p.x, p.y, 1000, 500);
  assert.ok(Math.abs(q.lon - 1.0075) < 1e-9 && Math.abs(q.lat - 47.0025) < 1e-9);
  assert.equal(app.pixelDuPointCliche(coins, 1.02, 47.005, 1000, 500).dedans, false);
  assert.equal(app.pixelDuPointCliche(null, 1, 47, 10, 10), null);
  const anneaux = app.contoursSurCliche([[[1.0075, 47.0025], [1.005, 47.0025], [1.005, 47.005]]], coins, 1000, 500, { dx: 10, dy: -5 });
  assert.equal(anneaux[0].map(x => x.map(v => Math.round(v)).join(':')).join(' '), '120:260 120:510 245:510');
  assert.equal(app.clichesParAnneeIgn([{ annee: 2011, cliches: [{ id: 'a', coins: null }, { id: 'b', coins }] }, { annee: 1947, cliches: [] }]).map(c => c.id).join(), 'b');
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
  // Jamais le numéro le plus proche (étude 31/10) : sans adresse de la parcelle, le point cliqué.
  assert.deepEqual(JSON.parse(JSON.stringify(app.pointStreetViewCarte({ adressesParcelle: [], adresse: { position: { lat: 3, lon: 4 } }, point: { lat: 5, lon: 6 } }))), { lat: 5, lon: 6 });
  const d = app.decenniesClichesCarte([{ annee: 2018 }, { annee: 2011 }, { annee: 1986 }, { annee: 1955 }, { annee: 1949 }, { annee: 1946 }]);
  assert.equal(d.map(x => `${x.decennie}:${x.annees.join('/')}`).join(' | '), 'Années 2010:2018/2011 | Années 80:1986 | Années 50:1955 | Années 40:1949/1946');
});

test('cliché de l’IGN tourné nord en haut, comme le cadastre (étude 31/10)', () => {
  // Cliché « tête en bas » : le haut de l'image est au sud. Tourné, son coin haut gauche (au sud-est) passe en bas à droite.
  const coins = [[1.01, 47.00], [1.00, 47.00], [1.00, 47.01], [1.01, 47.01]];
  // 0,01° de longitude ≈ 0,682 × 0,01° de latitude à 47° : 1 000 px de large, 1 466 de haut, pixels carrés au sol.
  const m = app.matriceCliche(coins, 1000, 1466);
  const r = (v) => v.map(x => Math.round(x * 1000) / 1000).join(',');
  assert.equal(r(m.versEcran(1, 0)), '-1,0', 'vers la droite de l’image = vers l’ouest');
  assert.equal(r(m.versEcran(0, 1)), '0,-1', 'vers le bas de l’image = vers le nord');
  assert.equal(r(m.versCliche(...m.versEcran(120, 340))), '120,340');
  const b = app.bornesEcranCliche(m, 1000, 1466);
  assert.equal(`${Math.round(b.ouest)},${Math.round(b.est)},${Math.round(b.nord)},${Math.round(b.sud)}`, '-1000,0,-1466,0');
  assert.equal(app.matriceCliche(null, 10, 10), null);
});

test('cliché ancien : cadre noir du film écarté, retenu seulement s’il a la forme de l’emprise (mesure du 31/10)', () => {
  // Image de 100 × 110 : photo claire de 90 × 90 (5 px de cadre noir à gauche, à droite et en haut ; bande sombre de 15 px en bas).
  const w = 100; const h = 110; const lum = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) lum[y * w + x] = x >= 5 && x < 95 && y >= 5 && y < 95 ? 180 : 10;
  const cadre = app.cadreDuCliche(lum, w, h);
  assert.equal(cadre.map(v => Math.round(v * 100) / 100).join(','), '0.05,0.05,0.95,0.86');
  // Emprise carrée au sol : retenu ; emprise deux fois plus large que haute : refusé, image entière.
  const carre = [[1.0000, 47.0090], [1.0133, 47.0090], [1.0133, 47.0000], [1.0000, 47.0000]];
  assert.equal(app.cadreRetenuCliche(cadre, carre, w, h).join(','), cadre.join(','));
  const large = [[1.0000, 47.0045], [1.0266, 47.0045], [1.0266, 47.0000], [1.0000, 47.0000]];
  assert.equal(app.cadreRetenuCliche(cadre, large, w, h).join(','), '0,0,1,1');
  // Le centre de l'emprise tombe au centre de la photo, pas au centre de l'image numérisée.
  const p = app.pixelDuPointCliche(carre, 1.00665, 47.0045, w, h, cadre);
  assert.ok(Math.abs(p.x - 50) < 0.5 && Math.abs(p.y - 50) < 0.5, JSON.stringify(p));
  const q = app.pointDuPixelCliche(carre, p.x, p.y, w, h, cadre);
  assert.ok(Math.abs(q.lon - 1.00665) < 1e-9 && Math.abs(q.lat - 47.0045) < 1e-9);
  assert.equal(app.cadreDuCliche(null, 0, 0).join(','), '0,0,1,1');
});
