'use strict';

// Carte du Contrôle de l'urbanisme (src/carteUrbanisme.js, routes/urbanisme.js) : faux services de l'IGN et de DVF, aucune connexion réelle.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/carteUrbanisme');
const U = require('../src/urbanisme');

const reponse = (corps, statut = 200) => ({ ok: statut < 400, status: statut, json: async () => corps, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
const fc = (feats) => ({ type: 'FeatureCollection', features: feats });
const carre = { type: 'Polygon', coordinates: [[[1.58, 47.34], [1.581, 47.34], [1.581, 47.341], [1.58, 47.34]]] };

beforeEach(() => { C.viderCacheCarte(); U.viderCacheUrbanisme(); });

test('tuiles : liste blanche des couches, zoom et numéros bornés', () => {
  assert.ok(C.tuileValide('plan', 17, 66110, 46560));
  assert.equal(C.tuileValide('autre', 17, 1, 1), null, 'couche inconnue');
  assert.equal(C.tuileValide('cadastre', 10, 1, 1), null, 'cadastre trop loin');
  assert.equal(C.tuileValide('plan', 3, 8, 0), null, 'hors de la grille');
  assert.equal(C.tuileValide('plan', '17; rm', 1, 1), null);
});

test('tuile : l’IGN qui ne répond pas rend une image transparente, jamais gardée', async () => {
  const appels = [];
  const t = await C.tuileIgn('photo', 17, 66110, 46560, { fetch: async (url) => { appels.push(url); throw new Error('réseau'); } });
  assert.equal(t.vide, true);
  assert.equal(t.type, 'image/png');
  const t2 = await C.tuileIgn('photo', 17, 66110, 46560, { fetch: async (url) => { appels.push(url); return reponse({}); } });
  assert.ok(!t2.vide);
  assert.match(appels[0], /data\.geopf\.fr\/wmts\?.*LAYER=ORTHOIMAGERY\.ORTHOPHOTOS.*TILEMATRIX=17&TILEROW=46560&TILECOL=66110/);
  assert.equal(await C.tuileIgn('photo', 99, 1, 1, { fetch: async () => reponse({}) }), null);
});

test('point cliqué : parcelle, zone, adresse BAN et alignement ; seuls des coordonnées partent', async () => {
  const appels = [];
  const fetch = async (url) => {
    appels.push(url);
    if (url.includes('/cadastre/parcelle')) return reponse(fc([{ type: 'Feature', geometry: carre, properties: { idu: '410990000E1020', code_insee: '41099', nom_com: 'Gy-en-Sologne', section: '0E', numero: '1020', contenance: 20185 } }]));
    // Deux zones qui se partagent la parcelle : moitié ouest UB, moitié est A.
    if (url.includes('/gpu/zone-urba')) return reponse(fc([
      { geometry: { type: 'Polygon', coordinates: [[[1.579, 47.339], [1.5805, 47.339], [1.5805, 47.342], [1.579, 47.342], [1.579, 47.339]]] }, properties: { libelle: 'UB', libelong: 'Zone urbaine', typezone: 'U' } },
      { geometry: { type: 'Polygon', coordinates: [[[1.5805, 47.339], [1.582, 47.339], [1.582, 47.342], [1.5805, 47.342], [1.5805, 47.339]]] }, properties: { libelle: 'A', libelong: 'Zone agricole', typezone: 'A' } }
    ]));
    if (url.includes('/geocodage/reverse')) return reponse(fc([
      { properties: { id: '41099_0027_00009', label: '9 Rue des Lilas 41230 Gy-en-Sologne', housenumber: '9', street: 'Rue des Lilas', distance: 20.2 } },
      { properties: { id: '41099_0027_00007', label: '7 Rue des Lilas 41230 Gy-en-Sologne', housenumber: '7', street: 'Rue des Lilas', distance: 60.4 } }]));
    if (url.includes('/lookup/41099_0027_00009')) return reponse({ certifie: true, parcelles: ['410990000E1021'] });
    if (url.includes('/lookup/41099_0027_00007')) return reponse({ certifie: true, parcelles: ['410990000E1020'] });
    if (url.includes('assiette-sup-l')) return reponse(fc([{ properties: { suptype: 'el7', nomsuplitt: 'Plan d’alignement RD 12' } }]));
    if (url.includes('assiette-sup-s')) return reponse(fc([{ properties: { suptype: 'ac1', nomsuplitt: 'Église' } }]));
    return reponse({}, 404);
  };
  const p = await C.pointCarte(1.582102, 47.348421, { fetch });
  assert.equal(p.parcelle.section, 'E');
  assert.equal(p.parcelle.numero, '1020');
  assert.equal(p.parcelle.contenance, 20185);
  assert.equal(p.zones.length, 2, 'la parcelle est à cheval sur deux zones');
  assert.ok(Math.abs(p.zones[0].part + p.zones[1].part - 1) < 0.02);
  assert.ok(p.zones.every(z => z.part > 0.2 && z.part < 0.8), JSON.stringify(p.zones));
  assert.ok(['UB', 'A'].includes(p.zone.libelle));
  assert.equal(p.adresse.distance, 20, 'le plus proche…');
  assert.equal(p.adresse.parcelles[0], 'E 1021', '… est rattaché à la voisine');
  assert.equal(p.adressesParcelle.length, 1);
  assert.equal(p.adressesParcelle[0].libelle, '7 Rue des Lilas 41230 Gy-en-Sologne', 'l’adresse officielle de E 1020');
  assert.equal(p.adressesParcelle[0].certifie, true);
  assert.equal(p.alignement.length, 1);
  assert.equal(p.alignement[0].nom, 'Plan d’alignement RD 12');
  for (const u of appels) assert.match(u, /^https:\/\/(apicarto\.ign\.fr|data\.geopf\.fr|plateforme\.adresse\.data\.gouv\.fr)\//);
  assert.deepEqual(await C.pointCarte('x', 47), { erreur: 'Point hors de France.' });
});

test('point cliqué : une source muette est dite non lue, jamais devinée, et n’est pas gardée', async () => {
  let appels = 0;
  const fetch = async () => { appels++; throw new Error('réseau'); };
  const p = await C.pointCarte(1.5, 47.3, { fetch });
  assert.equal(p.parcelle, null);
  assert.equal(p.cadastreLu, false);
  assert.equal(p.zoneLue, false);
  assert.equal(p.adresseLue, false);
  assert.equal(p.alignement, null);
  const avant = appels;
  await C.pointCarte(1.5, 47.3, { fetch });
  assert.ok(appels > avant, 'un échec complet est relu au clic suivant');
});

test('zones du PLU : emprise bornée (2 km au plus)', async () => {
  assert.ok((await C.zonesCarte('1,47,2,48', { fetch: async () => reponse(fc([])) })).erreur);
  const z = await C.zonesCarte('1.33,47.58,1.34,47.59', { fetch: async () => reponse(fc([{ geometry: carre, properties: { libelle: 'Ui1', typezone: 'U', libelong: 'Ville haute' } }, { properties: {} }])) });
  assert.equal(z.features.length, 1);
  assert.equal(z.features[0].properties.libelle, 'Ui1');
});

test('DVF : une vente par mutation, locaux comptés une fois, prix au m², plus récentes d’abord', () => {
  const ligne = (o) => Object.assign({ id_mutation: 'M1', date_mutation: '2024-03-01', nature_mutation: 'Vente', valeur_fonciere: '200000.0', adresse_numero: '16.0', adresse_suffixe: 'None', adresse_nom_voie: 'RUE DES LILAS',
    id_parcelle: '410990000E0001', type_local: 'Maison', surface_reelle_bati: '80.0', nombre_pieces_principales: '4.0', surface_terrain: '1000.0', longitude: '1.5', latitude: '47.3' }, o);
  const v = C.ventesDepuisDvf({ mutations: [
    ligne({}), ligne({ id_parcelle: '410990000E0002', surface_terrain: '500.0' }), ligne({ type_local: 'Dépendance', surface_reelle_bati: 'nan' }),
    ligne({ id_mutation: 'M2', date_mutation: '2025-01-05', valeur_fonciere: '15000.0', type_local: 'None', surface_reelle_bati: 'nan', id_parcelle: '410990000E0009', adresse_numero: 'nan' })
  ] });
  assert.equal(v.length, 2);
  assert.equal(v[0].id, 'M2');
  const m1 = v[1];
  assert.equal(m1.locaux.filter(x => x.type === 'Maison').length, 1, 'la maison répétée sur deux parcelles est comptée une fois');
  assert.equal(m1.surfaceBati, 80);
  assert.equal(m1.surfaceTerrain, 1500);
  assert.equal(m1.prixM2, 2500);
  assert.equal(m1.adresse, '16 RUE DES LILAS');
  assert.equal(v[0].adresse, 'RUE DES LILAS');
});

test('DVF : section au format d’Etalab, commune vérifiée', async () => {
  assert.equal(C.sectionDvf('E'), '0000E');
  assert.equal(C.sectionDvf('AB'), '000AB');
  assert.equal(C.sectionDvf('A;B'), null);
  const appels = [];
  const r = await C.ventesSection('41099', 'E', '', { fetch: async (u) => { appels.push(u); return reponse({ mutations: [] }); } });
  assert.deepEqual(r.ventes, []);
  assert.equal(appels[0], 'https://app.dvf.etalab.gouv.fr/api/mutations3/41099/0000E');
  assert.ok((await C.ventesSection('../x', 'E')).erreur);
});

test('caches séparés : une lecture de zones ne vide pas les ventes ; demandes simultanées réunies', async () => {
  let appels = 0;
  const fetch = async (u) => { appels++; return reponse(u.includes('mutations3') ? { mutations: [] } : fc([])); };
  await C.ventesSection('41099', 'E', '', { fetch });
  for (let i = 0; i < 70; i++) await C.zonesCarte(`1.${300 + i},47.58,1.${300 + i}5,47.585`, { fetch });
  const n = appels;
  await C.ventesSection('41099', 'E', '', { fetch });
  assert.equal(appels, n, 'les ventes sont restées en cache');
  const [a, b] = await Promise.all([C.ventesSection('41099', 'AB', '', { fetch }), C.ventesSection('41099', 'AB', '', { fetch })]);
  assert.equal(appels, n + 1, 'une seule requête pour deux demandes identiques');
  assert.equal(a, b);
});

test('tuiles : coupe-circuit après dix échecs de suite', async () => {
  let appels = 0;
  const fetch = async () => { appels++; throw new Error('réseau'); };
  for (let i = 0; i < 10; i++) await C.tuileIgn('plan', 15, i, 1, { fetch });
  assert.equal(appels, 10);
  const t = await C.tuileIgn('plan', 15, 50, 1, { fetch });
  assert.equal(t.vide, true);
  assert.equal(appels, 10, 'plus aucune demande pendant la coupure');
});
