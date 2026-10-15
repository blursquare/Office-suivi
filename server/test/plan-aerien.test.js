'use strict';

// Plan aérien IGN (étude 15/10) : parts de zone par balayage de lignes, regroupement en plans, route avec de faux services de l'IGN.
// Aucune connexion réelle : les services sont injectés. Géométries inventées.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { couperAuRectangle, repartitionZonage, groupesPlansAeriens, centreInterieur, mercator, demercator, intervallesLigne, longueurBarre, planAerien } = require('../src/planAerien');
const { creerRouteurPlanAerien } = require('../src/routes/planAerien');
const { viderCacheUrbanisme } = require('../src/urbanisme');

// Un rectangle en degrés autour de (1,47), côté e-o de `l` mètres et nord-sud de `h` mètres.
const LON = 1; const LAT = 47;
const f = LAT * Math.PI / 180;
const kx = 111412.84 * Math.cos(f) - 93.5 * Math.cos(3 * f); const ky = 111132.92 - 559.82 * Math.cos(2 * f) + 1.175 * Math.cos(4 * f);
const rect = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[LON + x0 / kx, LAT + y0 / ky], [LON + x1 / kx, LAT + y0 / ky], [LON + x1 / kx, LAT + y1 / ky], [LON + x0 / kx, LAT + y1 / ky], [LON + x0 / kx, LAT + y0 / ky]]] });

test('parts de zone : une parcelle coupée en deux zones 30/70 donne 30 % et 70 %, sans « hors zone »', () => {
  const parcelle = rect(0, 0, 40, 25);                                   // 1 000 m²
  const r = repartitionZonage(parcelle, [{ libelle: 'UA', geometry: rect(-50, -50, 12, 80) }, { libelle: 'N', geometry: rect(12, -50, 90, 80) }]);
  assert.ok(Math.abs(r.surface - 1000) < 3, String(r.surface));
  assert.equal(r.zones[0].libelle, 'N');
  assert.ok(Math.abs(r.zones[0].part - 0.7) < 0.005, String(r.zones[0].part));
  assert.ok(Math.abs(r.zones[1].part - 0.3) < 0.005, String(r.zones[1].part));
  assert.ok(r.horsZone < 0.005);
});

test('parts de zone : la partie hors de toute zone est dite, un trou dans la parcelle ne compte pas', () => {
  const parcelle = { type: 'Polygon', coordinates: [rect(0, 0, 40, 40).coordinates[0], rect(10, 10, 20, 20).coordinates[0]] };   // 1 600 − 100 m²
  const r = repartitionZonage(parcelle, [{ libelle: 'UB', geometry: rect(-10, -10, 20, 50) }]);
  assert.ok(Math.abs(r.surface - 1500) < 4, String(r.surface));
  // Zone sur x ∈ [0, 20] : 20 × 40 = 800 − le trou (100) = 700 sur 1 500.
  assert.ok(Math.abs(r.zones[0].part - 700 / 1500) < 0.006, String(r.zones[0].part));
  assert.ok(Math.abs(r.horsZone - 800 / 1500) < 0.006);
  // Aucune zone : tout est hors zone.
  assert.equal(repartitionZonage(parcelle, []).horsZone, 1);
  // Multi-polygone : deux morceaux comptés ensemble.
  const deux = { type: 'MultiPolygon', coordinates: [rect(0, 0, 10, 10).coordinates, rect(30, 0, 40, 10).coordinates] };
  const rd = repartitionZonage(deux, [{ libelle: 'A', geometry: rect(-5, -5, 20, 20) }]);
  assert.ok(Math.abs(rd.zones[0].part - 0.5) < 0.01, String(rd.zones[0].part));
});

test('plans : des parcelles proches sur un plan, des éloignées sur des plans à part, trop dispersées refusées', () => {
  const f = (x0) => ({ geometry: rect(x0, 0, x0 + 20, 20) });
  assert.equal(groupesPlansAeriens([f(0), f(60), f(120)]).length, 1);
  assert.equal(groupesPlansAeriens([f(0), f(60), f(3000)]).length, 2);
  assert.equal(groupesPlansAeriens([f(0), f(2000), f(4000), f(6000), f(8000), f(10000), f(12000)]), null);
});

test('géométrie : Mercator aller-retour, balayage, centre intérieur d’un U, barre d’échelle', () => {
  const p = demercator(mercator([1.3183, 47.5942]));
  assert.ok(Math.abs(p[0] - 1.3183) < 1e-9 && Math.abs(p[1] - 47.5942) < 1e-9);
  assert.deepEqual(intervallesLigne([[[0, 0], [10, 0], [10, 10], [0, 10]]], 5), [[0, 10]]);
  assert.deepEqual(intervallesLigne([[[0, 0], [10, 0], [10, 10], [0, 10]], [[3, 3], [6, 3], [6, 6], [3, 6]]], 5), [[0, 3], [6, 10]]);
  // Un U : le centre du rectangle englobant est dans le vide, le centre intérieur est dans le fond du U.
  const u = [[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30]];
  const c = centreInterieur(u);
  assert.ok(c[1] < 10 || c[0] < 10 || c[0] > 20, String(c));
  assert.equal(longueurBarre(60), 50);
  assert.equal(longueurBarre(8), 10);
});

// ---- La route, avec de faux services de l'IGN ------------------------------------------------------------------------------

// Un PNG 1×1 valide.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function fauxIgn() {
  const appels = [];
  const parcelle = (section, numero, x0, x1) => ({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [rect(x0, 0, x1, 25).coordinates] }, properties: { idu: `41018000${section}${numero}`, section, numero, contenance: (x1 - x0) * 25, nom_com: 'Blois', code_insee: '41018' } });
  const parcelles = { '0694': parcelle('AL', '0694', 0, 40), '0887': parcelle('AL', '0887', 40, 70), '0001': parcelle('AL', '0001', 70, 90) };
  const fetch = async (url) => {
    appels.push(String(url));
    const u = new URL(url);
    const json = (o) => ({ ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), json: async () => o });
    if (u.hostname === 'data.geopf.fr') return { ok: true, status: 200, headers: { get: () => 'image/png' }, arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length) };
    if (u.pathname.endsWith('/cadastre/parcelle')) {
      if (u.searchParams.get('geom')) return json({ features: Object.values(parcelles) });
      const f = parcelles[u.searchParams.get('numero')];
      return json({ features: f && u.searchParams.get('section') === 'AL' ? [f] : [] });
    }
    if (u.pathname.endsWith('/gpu/zone-urba')) return json({ features: [{ properties: { libelle: 'UA', libelong: 'Centre', typezone: 'U' }, geometry: rect(-50, -50, 28, 80) }, { properties: { libelle: 'N', libelong: 'Naturelle', typezone: 'N' }, geometry: rect(28, -50, 200, 80) }] });
    if (u.pathname.endsWith('/gpu/document')) return json({ features: [{ properties: { du_type: 'PLU', grid_title: 'PLU', partition: 'DU_123456789' } }] });
    if (u.pathname.endsWith('/gpu/assiette-sup-s')) return json({ features: [{ properties: { suptype: 'ac1', nomsuplitt: 'Église', typeass: 'Abords', paramcalc: 500 } }] });
    return json({ features: [] });
  };
  return { fetch, appels };
}

test('plan aérien : PDF A4, parts de zone par parcelle et servitude patrimoniale, données de l’IGN seulement', async () => {
  viderCacheUrbanisme();
  const ign = fauxIgn();
  const r = await planAerien({ insee: '41018', parcelles: [{ section: 'AL', numero: '694' }, { section: 'AL', numero: '887' }], injections: ign });
  assert.ok(!r.erreur, r.erreur);
  assert.equal(String(Buffer.from(r.pdf).subarray(0, 5)), '%PDF-');
  assert.equal(r.plans.length, 1);
  const [p694, p887] = r.plans[0].parcelles;
  assert.equal(p694.section + p694.numero, 'AL694');
  // AL 694 : x ∈ [0, 40], UA jusqu'à 28 → 70 % UA, 30 % N.
  assert.equal(p694.zones[0].libelle, 'UA');
  assert.ok(Math.abs(p694.zones[0].pourcentage - 70) < 0.6, String(p694.zones[0].pourcentage));
  // AL 887 : x ∈ [40, 70], tout en zone N.
  assert.equal(p887.zones[0].libelle, 'N');
  assert.ok(p887.zones[0].pourcentage > 99.4);
  assert.equal(p694.patrimoine.servitudes[0].libelle, 'Monument historique');
  // Rien de nominatif ne part : seulement code INSEE, section, numéro, emprise.
  for (const u of ign.appels) assert.ok(!/nom=|adresse|dossier/i.test(u), u);
  assert.ok(ign.appels.some((u) => u.includes('data.geopf.fr') && u.includes('EPSG:3857')));
});

test('plan aérien : parcelle introuvable, commune invalide, trop de parcelles', async () => {
  viderCacheUrbanisme();
  const ign = fauxIgn();
  assert.match((await planAerien({ insee: '41018', parcelles: [{ section: 'AL', numero: '999' }], injections: ign })).erreur, /introuvable/);
  assert.equal((await planAerien({ insee: 'x', parcelles: [{ section: 'AL', numero: '1' }], injections: ign })).statut, 400);
  const treize = Array.from({ length: 13 }, (_, i) => ({ section: 'AL', numero: String(i + 1) }));
  assert.match((await planAerien({ insee: '41018', parcelles: treize, injections: ign })).erreur, /12 parcelles/);
});

test('route : tirer, relire le PDF, ranger dans le dossier du NAS seulement pour son dossier', async () => {
  viderCacheUrbanisme();
  const depot = { trouverParId: (id) => (id === 'd1' ? { id: 'd1', nasDossier: 'DOSSIER' } : null) };
  const app = express(); app.use(express.json());
  const parametresRepo = { lireJsonBrut: () => ({}), ecrireJsonBrut: () => {}, lireJson: () => ({}), ecrireJson: () => {} };
  app.use('/api', creerRouteurPlanAerien({ nasRacine: '' }, parametresRepo, depot, fauxIgn()));
  const serveur = app.listen(0);
  try {
    const B = `http://127.0.0.1:${serveur.address().port}/api`;
    const poster = (u, b) => fetch(B + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    const r = await poster('/urbanisme/plan-aerien', { insee: '41018', parcelles: 'AL 694, AL 887', dossierId: 'd1' });
    const j = await r.json();
    assert.equal(r.status, 200, JSON.stringify(j));
    assert.ok(j.id && j.plans[0].parcelles.length === 2);
    const pdf = await fetch(`${B}/urbanisme/plan-aerien/${j.id}`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(pdf.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await fetch(`${B}/urbanisme/plan-aerien/inconnu`)).status, 404);
    // Sans NAS configuré : 503.
    assert.equal((await poster(`/urbanisme/plan-aerien/${j.id}/ranger`, { dossierId: 'd1' })).status, 503);
    assert.equal((await poster('/urbanisme/plan-aerien', { insee: '', parcelles: 'AL 694' })).status, 400);
  } finally { serveur.close(); }
});

test('zones : une zone découpée en deux entités n’est qu’une ligne ; un grand polygone de zone ne fige pas le serveur ; anneau coupé au cadre', () => {
  const parcelle = rect(0, 0, 40, 25);
  const r = repartitionZonage(parcelle, [{ libelle: 'UA', typezone: 'U', geometry: rect(-5, -5, 10, 40) }, { libelle: 'UA', typezone: 'U', geometry: rect(10, -5, 20, 40) }]);
  assert.equal(r.zones.length, 1);
  assert.ok(Math.abs(r.zones[0].part - 0.5) < 0.006, String(r.zones[0].part));
  // Une zone de 150 000 sommets : le balayage reste rapide.
  const N = 150000; const grand = [];
  for (let i = 0; i < N; i++) { const a = 2 * Math.PI * i / N; const rayon = 2000 + 50 * Math.sin(40 * a); grand.push([LON + rayon * Math.cos(a) / kx, LAT + rayon * Math.sin(a) / ky]); }
  grand.push(grand[0]);
  const t = Date.now();
  const g = repartitionZonage(parcelle, [{ libelle: 'N', geometry: { type: 'Polygon', coordinates: [grand] } }]);
  assert.ok(Date.now() - t < 1500, `${Date.now() - t} ms`);
  assert.ok(g.zones[0].part > 0.99);
  assert.ok(centreInterieur(grand.map((p) => [p[0], p[1]])).length === 2, 'un grand anneau ne fait pas déborder la pile');
  const coupe = couperAuRectangle([[-10, -10], [30, -10], [30, 30], [-10, 30]], [0, 0, 20, 20]);
  assert.deepEqual(coupe.map((p) => p.join(',')).sort(), ['0,0', '0,20', '20,0', '20,20']);
});
