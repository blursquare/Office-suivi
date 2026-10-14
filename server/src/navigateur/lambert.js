// @ts-check
'use strict';
// Projections Lambert du cadastre (étude 14/10 : plan de situation du site cadastre.gouv.fr, surligné en jaune fluo).
// Le site travaille en « RGF93 CC » (coniques conformes 9 zones, EPSG 3942 à 3950 : CC48 pour le Loir-et-Cher), les contours des
// parcelles (API Carto de l'IGN) arrivent en degrés (RGF93 ≈ WGS84 au mètre près) : la conversion se fait ici, sans bibliothèque.
const A = 6378137;                 // GRS80
const E = Math.sqrt(0.00669438002290);
const RAD = Math.PI / 180;

/** Paramètres d'une zone CC (42 à 50). @param {number} zone */
function parametresCC(zone) {
  const z = Math.round(Number(zone));
  if (!(z >= 42 && z <= 50)) return null;
  const m = (phi) => Math.cos(phi) / Math.sqrt(1 - E * E * Math.sin(phi) ** 2);
  const t = (phi) => Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi)), E / 2);
  const phi1 = (z - 0.75) * RAD; const phi2 = (z + 0.75) * RAD; const phi0 = z * RAD;
  const n = (Math.log(m(phi1)) - Math.log(m(phi2))) / (Math.log(t(phi1)) - Math.log(t(phi2)));
  const F = m(phi1) / (n * Math.pow(t(phi1), n));
  return { n, F, rho0: A * F * Math.pow(t(phi0), n), lon0: 3 * RAD, x0: 1700000, y0: (z - 41) * 1000000 + 200000, t };
}

/** Zone CC d'un code EPSG (« 3948 », « EPSG:3948 ») ou d'un libellé du site (« RGF93CC48 ») ; 0 sinon. Pure. @param {unknown} srs */
function zoneCCDepuisSrs(srs) {
  const s = String(srs || '');
  const m = /(?:^|\D)39(4[2-9]|50)(?:\D|$)/.exec(s) || /CC(4[2-9]|50)/i.exec(s);
  return m ? Number(m[1]) : 0;
}

/** [lon, lat] en degrés → [x, y] en mètres dans la zone CC donnée ; null hors zone. Pure. @param {[number, number]} p @param {number} zone */
function versCC(p, zone) {
  const c = parametresCC(zone);
  if (!c || !Array.isArray(p) || !isFinite(p[0]) || !isFinite(p[1])) return null;
  const phi = p[1] * RAD; const lambda = p[0] * RAD;
  const rho = A * c.F * Math.pow(c.t(phi), c.n);
  const theta = c.n * (lambda - c.lon0);
  return [c.x0 + rho * Math.sin(theta), c.y0 + c.rho0 - rho * Math.cos(theta)];
}

/** Emprise [minX, minY, maxX, maxY] d'anneaux de points. Pure. @param {Array<Array<[number, number]>>} anneaux */
function emprisePoints(anneaux) {
  const pts = (anneaux || []).flat().filter((q) => Array.isArray(q) && isFinite(q[0]) && isFinite(q[1]));
  if (!pts.length) return null;
  const xs = pts.map((q) => q[0]); const ys = pts.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

module.exports = { parametresCC, zoneCCDepuisSrs, versCC, emprisePoints };
