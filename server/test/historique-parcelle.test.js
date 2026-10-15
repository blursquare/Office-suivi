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

test('vueParcelles : numéros des parcelles du dossier et des voisines (photos à comparer pour les constructions)', async () => {
  const f = (idu, numero, dx) => ({ properties: { idu, section: 'AL', numero }, geometry: { type: 'Polygon', coordinates: [[[1 + dx, 47], [1.0004 + dx, 47], [1.0004 + dx, 47.0003], [1 + dx, 47.0003], [1 + dx, 47]]] } });
  const fetch = async (url) => {
    if (!url.includes('/cadastre/parcelle')) return json({}, 404);
    return url.includes('geom=') ? json({ features: [f('41018000AL0839', '0839', 0), f('41018000AL0840', '0840', 0.0004)] }) : json({ features: [f('41018000AL0839', '0839', 0)] });
  };
  const v = await H.vueParcelles('41018', 'AL 839', { fetch });
  const dossier = v.etiquettes.filter(e => e.dossier);
  assert.equal(dossier.length, 1);
  assert.equal(dossier[0].texte, 'AL 839');
  assert.ok(dossier[0].x > 1 && dossier[0].x < 1.0004 && dossier[0].y > 47 && dossier[0].y < 47.0003);
  assert.equal(v.voisines.length, 1, 'la parcelle du dossier n’est pas comptée parmi les voisines');
  assert.ok(v.etiquettes.every(e => e.texte));
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

test('Sitadel : la raison d’un échec est dite en un mot, sans rien de personnel (rapport technique)', () => {
  assert.equal(H.raisonEchecSitadel(Object.assign(new Error('x'), { name: 'TimeoutError' })), 'Sitadel : délai dépassé');
  assert.equal(H.raisonEchecSitadel(Object.assign(new Error('x'), { statut: 503 })), 'Sitadel : réponse 503');
  assert.equal(H.raisonEchecSitadel(Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } })), 'Sitadel : réseau (ENOTFOUND)');
  assert.equal(H.raisonEchecSitadel(new Error('adresse secrète 12 rue X')), 'Sitadel injoignable');
});

test('Sitadel : trois requêtes à la fois au plus, reprise sur « trop de demandes » (429), échec dit après deux reprises (rapport 15/10)', async () => {
  const datasets = { datafiles: [
    { rid: 'lgt', title: "Liste des autorisations d'urbanisme créant des logements", millesimes: [{ millesime: '2026-09', columns: [{ name: 'NUM_DAU' }, { name: 'SEC_CADASTRE1' }, { name: 'NUM_CADASTRE1' }] }] },
    { rid: 'pa', title: "Liste des permis d'aménager", millesimes: [{ millesime: '2026-09', columns: [{ name: 'NUM_PA' }, { name: 'SEC_CADASTRE1' }, { name: 'NUM_CADASTRE1' }] }] },
    { rid: 'pd', title: 'Liste des permis de démolir', millesimes: [{ millesime: '2026-09', columns: [{ name: 'NUM_PD' }, { name: 'SEC_CADASTRE1' }, { name: 'NUM_CADASTRE1' }] }] },
    { rid: 'loc', title: 'Liste des locaux non résidentiels', millesimes: [{ millesime: '2026-09', columns: [{ name: 'NUM_DAU' }, { name: 'SEC_CADASTRE1' }, { name: 'NUM_CADASTRE1' }] }] }
  ] };
  H.viderCacheHistorique();
  let enCours = 0; let maxEnCours = 0; const vus = new Map(); const pauses = [];
  const reponse = (status, corps, entetes = {}) => ({ ok: status < 400, status, headers: { get: (k) => entetes[k] || null }, json: async () => corps });
  const fetch = async (url) => {
    if (url.includes('/datasets/')) return reponse(200, datasets);
    enCours++; maxEnCours = Math.max(maxEnCours, enCours);
    await new Promise((ok) => setImmediate(ok));
    enCours--;
    const n = (vus.get(url) || 0) + 1; vus.set(url, n);
    return n === 1 ? reponse(429, {}, { 'retry-after': '2' }) : reponse(200, { data: [] });
  };
  const s = await H.autorisationsSitadel('41018', 'AL 839', { fetch, attendre: async (ms) => { pauses.push(ms); } });
  assert.ok(!s.erreur && Array.isArray(s.autorisations));
  assert.ok(maxEnCours <= 3, 'jamais plus de trois requêtes à la fois : ' + maxEnCours);
  assert.ok(pauses.length >= 12 && pauses.every((ms) => ms === 2000), 'Retry-After suivi : ' + pauses.slice(0, 3));
  // Toujours 429 : l'échec garde son statut après deux reprises.
  H.viderCacheHistorique();
  let appels = 0;
  const toujours = async (url) => { if (url.includes('/datasets/')) return reponse(200, datasets); appels++; return reponse(429, {}); };
  await assert.rejects(() => H.autorisationsSitadel('41018', 'AL 839', { fetch: toujours, attendre: async () => {} }), (e) => e.statut === 429);
  assert.ok(appels <= 3 * 3 + 3, 'reprises bornées : ' + appels);
});
