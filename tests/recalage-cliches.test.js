'use strict';

// Recalage automatique d'un cliché ancien sur l'orthophoto historique de l'IGN (client/158-recalage-cliches.js, étude 31/10).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('couche de référence : la plus proche de l’année, puis les autres ; rien pour un cliché récent', () => {
  assert.equal(app.couchesReferenceCliche(1957).join(','), '1950-1965,1965-1980,1980-1995,2000-2005,2006-2010');
  assert.equal(app.couchesReferenceCliche(1978)[0], '1965-1980');
  assert.equal(app.couchesReferenceCliche(1997)[0], '2000-2005');
  assert.equal(app.couchesReferenceCliche(2008).length, 0);
  assert.equal(app.couchesReferenceCliche(undefined).length, 0);
});

// Un « paysage » : routes et bâtiments sur fond uni (déterministe).
function paysage(w, h) {
  const lum = new Float32Array(w * h).fill(90);
  let graine = 7; const hasard = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
  for (let k = 0; k < 40; k++) {
    const x0 = Math.floor(hasard() * w); const y0 = Math.floor(hasard() * h); const lx = 6 + Math.floor(hasard() * 40); const ly = 6 + Math.floor(hasard() * 40);
    const v = hasard() < 0.5 ? 200 : 30;
    for (let y = y0; y < Math.min(h, y0 + ly); y++) for (let x = x0; x < Math.min(w, x0 + lx); x++) lum[y * w + x] = v;
  }
  for (let x = 0; x < w; x++) for (let y = 140; y < 146; y++) lum[y * w + x] = 230;   // une route est-ouest
  for (let y = 0; y < h; y++) for (let x = 300; x < 305; x++) lum[y * w + x] = 230;   // une route nord-sud
  return lum;
}

test('recalage : retrouve le décalage d’un paysage, en mètres vers l’est et le nord', () => {
  const zw = 480; const rw = 192; const mParPx = 2;
  const zone = paysage(zw, zw);
  // La référence est la vraie position du bien : sur le cliché, il est 40 px à l'est et 24 px au sud de là où l'emprise le met.
  const dx = 40; const dy = 24; const ox = (zw - rw) / 2 + dx; const oy = (zw - rw) / 2 + dy;
  const ref = new Float32Array(rw * rw);
  for (let y = 0; y < rw; y++) for (let x = 0; x < rw; x++) ref[y * rw + x] = zone[(oy + y) * zw + ox + x];
  const d = app.decalageRecalage(app.gradientImage(ref, rw, rw), rw, app.gradientImage(zone, zw, zw), zw, mParPx, { scoreMin: 0.1, grossierMin: 0.1, ecartMin: 0 });
  assert.ok(!d.refuse, JSON.stringify(d));
  assert.equal(Math.round(d.est), dx * mParPx);
  assert.equal(Math.round(d.nord), -dy * mParPx);
  assert.ok(d.score > 0.9);
});

test('recalage : un accord faible ou ambigu est refusé', () => {
  const zw = 240; const rw = 96;
  const plat = new Float32Array(zw * zw).fill(100);
  const ref = new Float32Array(rw * rw).fill(100);
  const d = app.decalageRecalage(app.gradientImage(ref, rw, rw), rw, app.gradientImage(plat, zw, zw), zw, 2);
  assert.equal(d.refuse, true);
});

test('pixels sans donnée ignorés ; réduction et corrélation', () => {
  const r = app.reduireImageRecalage(Float32Array.from([1, 3, NaN, 5]), 2, 2, 2);
  assert.equal(r.w, 1); assert.equal(r.img[0], 3);
  assert.equal(app.correlationRecalage(Float32Array.from([1, 2, 3, 4]), 2, 2, Float32Array.from([1, 2, 3, 4]), 2, 0, 0).toFixed(3), '1.000');
  assert.equal(app.correlationRecalage(Float32Array.from([1, 2, 3, 4]), 2, 2, Float32Array.from([NaN, NaN, NaN, 4]), 2, 0, 0), -1);
});

test('point recalé : le contour suit le décalage trouvé, rien sans recalage sûr', () => {
  const [lon, lat] = app.pointRecaleCliche(1.5, 47.5, { est: 111.32 * Math.cos(47.5 * Math.PI / 180), nord: 110.574 });
  assert.ok(Math.abs(lon - 1.501) < 1e-9 && Math.abs(lat - 47.501) < 1e-9);
  assert.equal(app.pointRecaleCliche(1.5, 47.5, { refuse: true }).join(','), '1.5,47.5');
  assert.equal(app.pointRecaleCliche(1.5, 47.5, null).join(','), '1.5,47.5');
});
