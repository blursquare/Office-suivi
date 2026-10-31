'use strict';

// Zonage d'une parcelle (voir src/urbanisme.js, src/routes/urbanisme.js) : faux API Carto, aucune connexion réelle.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const U = require('../src/urbanisme');

const reponse = (corps, statut = 200) => ({ ok: statut < 400, status: statut, json: async () => corps });
const fc = (props) => ({ type: 'FeatureCollection', features: props.map((p) => ({ type: 'Feature', properties: p, geometry: { type: 'Point', coordinates: [1.3, 47.5] } })) });

function fauxApiCarto(appels) {
  return async (url) => {
    appels.push(url);
    if (url.includes('/codes-postaux/communes/41000')) return reponse([{ codePostal: '41000', codeCommune: '41018', nomCommune: 'Blois' }]);
    if (url.includes('/cadastre/parcelle')) {
      return url.includes('numero=0999') ? reponse(fc([])) : reponse(fc([{ idu: '41018000AL0839', section: 'AL', numero: '0839', contenance: 1624, nom_com: 'Blois' }]));
    }
    if (url.includes('/gpu/document')) return reponse(fc([{ du_type: 'PLUi', grid_title: 'PLUI DE BLOIS AGGLOPOLYS', partition: 'DU_200030385' }]));
    if (url.includes('/gpu/zone-urba')) return reponse(fc([{ libelle: 'Ui2', libelong: 'Secteur "Parcs en immeubles"', typezone: 'U' }]));
    if (url.includes('/gpu/info-surf')) return reponse(fc([{ libelle: 'Périmètre d’un bien inscrit au patrimoine mondial - UNESCO' }, { libelle: 'Périmètre d’un bien inscrit au patrimoine mondial - UNESCO' }]));
    if (url.includes('/gpu/prescription-surf')) return reponse({}, 500);
    if (url.includes('/gpu/municipality')) return reponse(fc([{ name: 'BLOIS', is_rnu: false }]));
    // Servitudes (propriétés relevées sur l'API réelle le 08/10, noms de monuments génériques).
    if (url.includes('/gpu/assiette-sup-s')) return reponse(fc([
      { suptype: 'ac1', typeass: 'Périmètre des abords', nomsuplitt: 'Maison', paramcalc: 500 },
      { suptype: 'ac1', typeass: 'Périmètre des abords', nomsuplitt: 'Maison', paramcalc: 500 },
      { suptype: 'ac1', typeass: 'Périmètre des abords', nomsuplitt: 'Statue de Diane', paramcalc: 500 },
      { suptype: 'ac4', typeass: 'Périmètre du SPR', nomsuplitt: 'Site patrimonial remarquable de Blois' },
      { suptype: 'pm1', typeass: 'Zone rouge', nomsuplitt: 'Plan de prévention' }
    ]));
    return reponse({}, 404);
  };
}

beforeEach(() => U.viderCacheUrbanisme());

test('normaliserParcelle : section sur 2 caractères, numéro sur 4 chiffres', () => {
  assert.deepEqual(U.normaliserParcelle('al', '839'), { section: 'AL', numero: '0839' });
  assert.deepEqual(U.normaliserParcelle('B', '12'), { section: '0B', numero: '0012' });
  assert.equal(U.normaliserParcelle('', '12'), null);
  assert.equal(U.normaliserParcelle('AL', '12345'), null);
});

test('zonageParcelle : document, zone, informations ; une source en panne n’empêche pas le reste ; mis en cache', async () => {
  const appels = [];
  const injections = { fetch: fauxApiCarto(appels) };
  const z = await U.zonageParcelle('41018', 'al', '839', injections);
  assert.equal(z.document.type, 'PLUi');
  assert.equal(z.epciSiren, '200030385');
  assert.equal(z.zones[0].typezone, 'U');
  assert.equal(z.zones[0].libelle, 'Ui2');
  assert.equal(z.infos.length, 1, 'doublons retirés');
  assert.equal(z.prescriptions.length, 0);
  assert.equal(z.parcelle.contenance, 1624);
  // Patrimoine : monuments (abords) et site patrimonial remarquable, sans doublon ; une servitude d'un autre type est écartée.
  assert.equal(z.patrimoine.lu, true);
  assert.equal(z.patrimoine.servitudes.map((x) => `${x.type}:${x.nom}`).join(' | '), 'ac1:Maison | ac1:Statue de Diane | ac4:Site patrimonial remarquable de Blois');
  assert.equal(z.patrimoine.servitudes[0].rayon, 500);
  assert.equal(z.patrimoine.servitudes[0].libelle, 'Monument historique');
  assert.ok(appels[0].includes('code_insee=41018&section=AL&numero=0839'));
  assert.ok(appels.every((u) => !/nom|adresse/i.test(u.replace(/name|nom_com/g, ''))), 'rien d’autre que la commune et la parcelle');
  const n = appels.length;
  await U.zonageParcelle('41018', 'AL', '0839', injections);
  assert.equal(appels.length, n, 'cache');
  const absente = await U.zonageParcelle('41018', 'AL', '999', injections);
  assert.match(absente.erreur, /introuvable/);
  assert.match((await U.zonageParcelle('BLOIS', 'AL', '1', injections)).erreur, /invalide/);
});

test('parcelle introuvable : les sections de la commune sont proposées (rapport du 18/10)', async () => {
  const appels = [];
  const faux = fauxApiCarto(appels);
  const injections = { fetch: async (url) => url.includes('/cadastre/division')
    ? reponse(fc([{ section: 'AB' }, { section: 'BA' }, { section: 'AB' }, { section: 'B' }]))
    : url.includes('/cadastre/parcelle') ? reponse(fc([])) : faux(url) };
  const z = await U.zonageParcelle('41034', 'ZD', '12', injections);
  assert.match(z.erreur, /Pas de section ZD dans cette commune ; sections existantes : B, AB, BA \(3\)/);
  assert.equal(z.sections.join(','), 'B,AB,BA');
  const tous = [];
  const espion = { fetch: async (url) => { tous.push(url); return injections.fetch(url); } };
  U.viderCacheUrbanisme();
  await U.zonageParcelle('41034', 'ZD', '12', espion);
  assert.ok(tous.some((u) => u.includes('/cadastre/division?code_insee=41034')));
  assert.ok(tous.every((u) => !/nom|adresse/i.test(u)), 'seul le code INSEE part');
  U.viderCacheUrbanisme();
  assert.match((await U.zonageParcelle('41034', 'AB', '999', injections)).erreur, /La section AB existe : vérifiez le numéro/);
  assert.equal(U.parcelleIntrouvable({ section: 'ZD', numero: '0012' }, []).erreur, 'Parcelle ZD 12 introuvable au cadastre de cette commune.');
});

test('routes : communes d’un code postal, parcelle ; API injoignable → 502 avec un message', async () => {
  const { creerApp } = require('../src/app');
  const { ouvrirDb } = require('../src/db');
  const db = ouvrirDb(':memory:');
  let panne = false;
  const appels = [];
  const faux = fauxApiCarto(appels);
  const { app } = creerApp({ db, config: { authActive: false, racineRepo: os.tmpdir(), estSea: () => false }, urbanisme: { fetch: (u, o) => panne ? Promise.reject(new TypeError('fetch failed')) : faux(u, o) } });
  const serveur = app.listen(0);
  try {
    await new Promise((r) => serveur.once('listening', r));
    const base = `http://127.0.0.1:${serveur.address().port}/api/urbanisme`;
    assert.equal((await (await fetch(`${base}/communes?cp=41000`)).json()).communes[0].insee, '41018');
    const z = await (await fetch(`${base}/parcelle?insee=41018&section=AL&numero=839`)).json();
    assert.equal(z.zones[0].typezone, 'U');
    assert.equal((await fetch(`${base}/parcelle?insee=41018&section=AL&numero=999`)).status, 404);
    U.viderCacheUrbanisme();
    panne = true;
    const r = await fetch(`${base}/parcelle?insee=41018&section=AL&numero=839`);
    assert.equal(r.status, 502);
    assert.match((await r.json()).erreur, /injoignable.*à la main/);
  } finally { serveur.close(); db.close(); }
});

test('patrimoine : couche des servitudes en panne → « pas lu », jamais « aucune servitude »', async () => {
  const f = fauxApiCarto([]);
  const panne = async (url) => (url.includes('/gpu/assiette-sup-s') ? reponse({}, 500) : f(url));
  const z = await U.zonageParcelle('41018', 'AL', '839', { fetch: panne });
  assert.equal(z.patrimoine.lu, false);
  assert.equal(z.patrimoine.servitudes.length, 0);
  assert.equal(z.document.type, 'PLUi', 'le reste du zonage est lu');
  U.viderCacheUrbanisme();
  const vide = await U.zonageParcelle('41018', 'AL', '839', { fetch: async (url) => (url.includes('/gpu/assiette-sup-s') ? reponse(fc([])) : f(url)) });
  assert.equal(vide.patrimoine.lu, true);
  assert.equal(vide.patrimoine.servitudes.length, 0);
});

test('zone voisine seulement touchée au bord : écartée, dite en bordure (étude 19/10, parcelle « en partie A » à tort)', () => {
  const { zonesSansBordure } = require('../src/urbanisme');
  const m = 1 / 111320; // un mètre en degrés (latitude), à peu près ; la longitude suit la même échelle ici
  const carre = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[1.3 + x0 * m, 47.6 + y0 * m], [1.3 + x1 * m, 47.6 + y0 * m], [1.3 + x1 * m, 47.6 + y1 * m], [1.3 + x0 * m, 47.6 + y1 * m], [1.3 + x0 * m, 47.6 + y0 * m]]] });
  const parcelle = { geometry: carre(0, 0, 12, 12) };
  const zones = [{ libelle: 'A', typezone: 'A', libelong: '' }, { libelle: 'Uv2', typezone: 'U', libelong: '' }];
  // Bande de 0,3 m en zone A le long d'un bord (≈ 3,6 m², 2,5 %) : bordure.
  const r = zonesSansBordure(parcelle, { features: [{ geometry: carre(11.7, -5, 30, 30) }, { geometry: carre(-5, -5, 11.7, 30) }] }, zones);
  assert.deepEqual(r.zones.map(z => z.libelle), ['Uv2']);
  assert.deepEqual(r.bordures.map(z => z.libelle), ['A']);
  // La moitié en zone A : gardée, rangée par part.
  const r2 = zonesSansBordure(parcelle, { features: [{ geometry: carre(6, -5, 30, 30) }, { geometry: carre(-5, -5, 6, 30) }] }, zones);
  assert.equal(r2.zones.length, 2);
  assert.equal(r2.bordures.length, 0);
  // Sans contour : rien n'est retiré.
  assert.equal(zonesSansBordure(parcelle, { features: [{}, {}] }, zones).zones.length, 2);
});

test('31/10 : DPU renforcé lu dans les informations du document d’urbanisme (rien de publié ≠ pas de DPU)', () => {
  const { dpuDepuisInfos } = require('../src/urbanisme');
  const f = (libelle, libelong) => ({ properties: { libelle, libelong } });
  const r = dpuDepuisInfos({ features: [f('DPU renforcé', 'Périmètre du droit de préemption urbain renforcé'), f('Périmètre de droit de préemption commercial', '')] });
  assert.equal(r.lu, true); assert.equal(r.perimetre, true); assert.equal(r.renforce, true);
  assert.equal(r.libelles.length, 1, 'le droit de préemption commercial n’est pas le DPU');
  const simple = dpuDepuisInfos({ features: [f('Droit de préemption urbain', '')] });
  assert.equal(simple.perimetre, true); assert.equal(simple.renforce, false);
  assert.deepEqual(dpuDepuisInfos(null), { lu: false, perimetre: false, renforce: false, libelles: [] });
  assert.equal(dpuDepuisInfos({ features: [] }).lu, true);
});
