'use strict';

// Photos aériennes et Sitadel (src/historiqueParcelle.js) : faux IGN / faux DiDo, aucune connexion réelle.
// Structures relevées sur les API réelles le 08/10 ; parcelles et numéros inventés.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const H = require('../src/historiqueParcelle');
const U = require('../src/urbanisme');

const json = (corps, statut = 200) => ({ ok: statut < 400, status: statut, headers: { get: () => 'application/json' }, json: async () => corps });
const image = (n, type = 'image/jpeg') => ({ ok: true, status: 200, headers: { get: () => type }, arrayBuffer: async () => new Uint8Array(n).buffer });
const carre = [[1.317, 47.594], [1.318, 47.594], [1.318, 47.595], [1.317, 47.595], [1.317, 47.594]];

beforeEach(() => { H.viderCacheHistorique(); U.viderCacheUrbanisme(); });

test('parcellesDepuisListe : sections et numéros normalisés, sans doublon', () => {
  const p = H.parcellesDepuisListe('AL 839, al 0839 ; B 12');
  assert.deepEqual(p, [{ section: 'AL', numero: '0839' }, { section: '0B', numero: '0012' }]);
});

test('empriseContours : carré centré, au moins 40 m de demi-côté ; empriseValide refuse ce qui sort de France', () => {
  const e = H.empriseContours([carre]);
  assert.ok(e[0] < 1.317 && e[2] > 1.318 && e[1] < 47.594 && e[3] > 47.595);
  assert.ok(H.empriseValide(e.join(',')));
  assert.equal(H.empriseValide('20,47,20.01,47.01'), null);
  assert.equal(H.empriseValide('1,47,2,48'), null, 'trop grande');
});

test('vueParcelles : contours du cadastre, emprise et prises de vue proposées', async () => {
  const fetch = async (url) => url.includes('/cadastre/parcelle') ? json({ features: [{ properties: {}, geometry: { type: 'Polygon', coordinates: [carre] } }] }) : json({}, 404);
  const v = await H.vueParcelles('41018', 'AL 839', { fetch });
  assert.equal(v.contours.length, 1);
  assert.equal(v.emprise.length, 4);
  assert.ok(v.couches.some(c => c.cle === '1950-1965') && v.couches.some(c => c.cle === 'actuelle'));
});

test('photoAerienne : image reçue ; année sans prise de vue (image blanche) → vide ; couche inconnue refusée', async () => {
  const urls = [];
  const fetch = async (url) => { urls.push(url); return url.includes('ORTHOPHOTOS2001') ? image(3127) : url.includes('1950') ? image(280000, 'image/png') : image(40000); };
  const e = H.empriseContours([carre]).join(',');
  const p = await H.photoAerienne('2014', e, { fetch });
  assert.equal(p.type, 'image/jpeg');
  assert.match(urls[0], /BBOX=47\.\d+,1\.\d+,47\.\d+,1\.\d+/, 'WMS 1.3.0 EPSG:4326 : latitude d’abord');
  assert.equal((await H.photoAerienne('2001', e, { fetch })).vide, true);
  const ancienne = await H.photoAerienne('1950-1965', e, { fetch });
  assert.equal(ancienne.type, 'image/png');
  assert.match(urls[urls.length - 1], /FORMAT=image%2Fpng/);
  assert.ok((await H.photoAerienne('inconnue', e, { fetch })).erreur);
});

test('autorisationsSitadel : lignes des parcelles cherchées seules, sans demandeur, dédoublonnées', async () => {
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    if (url.includes('/datasets/')) return json({ datafiles: [
      { rid: 'lgt', title: "Liste des autorisations d'urbanisme créant des logements", millesimes: [{ millesime: '2026-09', columns: [{ name: 'NUM_DAU' }, { name: 'TYPE_DAU' }, { name: 'ETAT_DAU' }, { name: 'DATE_REELLE_AUTORISATION' }, { name: 'DATE_REELLE_DAACT' }, { name: 'SEC_CADASTRE1' }, { name: 'NUM_CADASTRE1' }, { name: 'I_EXTENSION' }, { name: 'NATURE_PROJET_DECLAREE' }, { name: 'DENOM_DEM' }] }] },
      { rid: 'pd', title: 'Liste des permis de démolir', millesimes: [{ millesime: '2026-09', columns: [{ name: 'NUM_PD' }, { name: 'ETAT_PD' }, { name: 'SEC_CADASTRE1' }, { name: 'NUM_CADASTRE1' }] }] }
    ] });
    if (url.includes('/datafiles/lgt/') && url.includes('SEC_CADASTRE1=')) return json({ data: [
      { NUM_DAU: '0410182100999', TYPE_DAU: 'DP', ETAT_DAU: 6, DATE_REELLE_AUTORISATION: '2021-05-03', DATE_REELLE_DAACT: '2022-01-10', SEC_CADASTRE1: 'AL', NUM_CADASTRE1: '839', I_EXTENSION: true, NATURE_PROJET_DECLAREE: 2, DENOM_DEM: 'SCI EXEMPLE' },
      { NUM_DAU: '0410182100998', TYPE_DAU: 'PC', ETAT_DAU: 2, SEC_CADASTRE1: 'AL', NUM_CADASTRE1: '83' }
    ] });
    return json({ data: [] });
  };
  const s = await H.autorisationsSitadel('41018', 'AL 839', { fetch });
  assert.equal(s.autorisations.length, 1, 'AL 83 n’est pas AL 839');
  const a = s.autorisations[0];
  assert.equal(a.type, 'DP'); assert.equal(a.etat, 'Achevé'); assert.equal(a.acheveLe, '2022-01-10');
  assert.deepEqual(a.travaux, ['extension']); assert.equal(a.nature, 'Travaux sur une construction existante');
  assert.ok(!JSON.stringify(s).includes('SCI EXEMPLE'), 'le demandeur ne sort jamais');
  assert.ok(urls.every(u => !u.includes('DENOM_DEM')), 'colonne du demandeur jamais demandée');
  assert.ok(urls.some(u => u.includes('COMM=eq:41018') && u.includes('NUM_CADASTRE1=in:839%2C0839')));
});
