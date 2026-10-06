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
  assert.ok(appels[0].includes('code_insee=41018&section=AL&numero=0839'));
  assert.ok(appels.every((u) => !/nom|adresse/i.test(u.replace(/name|nom_com/g, ''))), 'rien d’autre que la commune et la parcelle');
  const n = appels.length;
  await U.zonageParcelle('41018', 'AL', '0839', injections);
  assert.equal(appels.length, n, 'cache');
  const absente = await U.zonageParcelle('41018', 'AL', '999', injections);
  assert.match(absente.erreur, /introuvable/);
  assert.match((await U.zonageParcelle('BLOIS', 'AL', '1', injections)).erreur, /invalide/);
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
