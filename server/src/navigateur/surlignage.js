// @ts-check
'use strict';
// Surlignage jaune fluo des parcelles sur le PDF officiel du cadastre (étude 14/10 : « les surligner en fluo jaune pour les repérer
// comme si c'était fait à la main sans dépasser »).
// - « sans dépasser » : chaque parcelle est un chemin de découpe (clip) — rien n'est peint hors de son contour ;
// - « à la main » : des passes de surligneur obliques, un peu irrégulières (angle, écart, épaisseur), qui se chevauchent, puis une
//   passe le long du bord intérieur ; encre translucide en mode « produit » (multiply) : traits et numéros restent lisibles dessous.
// Le placement vient de l'emprise imprimée (MAPBBOX) et de l'échelle : la carte de l'extrait A4 portrait du site est toujours
// centrée au même point de la page (relevé le 14/10 sur des extraits au 1/500 et au 1/1000, croix du quadrillage à 0,1 pt près).

const { PDFDocument, rgb, BlendMode, LineCapStyle, pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath } = require('pdf-lib');

const PT_PAR_MM = 72 / 25.4;
// Centre de la carte dans la page A4 portrait (595 × 842 pt), en points depuis le HAUT de la page.
const CENTRE_CARTE_PT = { x: 296.7, depuisHaut: 524.3 };
const JAUNE_FLUO = rgb(1, 0.95, 0.05);
const LARGEUR_SURLIGNEUR_PT = 13;      // ≈ 4,6 mm : la pointe biseautée d'un surligneur
const ANGLE_DEGRES = -17;

/** Pure : un générateur pseudo-aléatoire reproductible (même parcelle → même tracé). @param {string} graine */
function aleatoire(graine) {
  let h = 2166136261;
  for (const c of String(graine)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pure : un point du terrain (mètres, système du site) → point de la page PDF (points, origine en bas à gauche).
 * @param {[number, number]} p @param {number[]} emprisePlan [minX, minY, maxX, maxY] @param {number} echelle @param {number} hauteurPage
 */
function pointPage(p, emprisePlan, echelle, hauteurPage) {
  const k = PT_PAR_MM * 1000 / echelle;
  const cx = (emprisePlan[0] + emprisePlan[2]) / 2;
  const cy = (emprisePlan[1] + emprisePlan[3]) / 2;
  return [CENTRE_CARTE_PT.x + (p[0] - cx) * k, (hauteurPage - CENTRE_CARTE_PT.depuisHaut) + (p[1] - cy) * k];
}

/**
 * Pure : les passes de surligneur qui couvrent un contour (en points de page) — segments [x1, y1, x2, y2, épaisseur], obliques,
 * légèrement irréguliers. Ils débordent du contour : la découpe les arrête au bord.
 * @param {Array<[number, number]>} contour @param {string} graine
 */
function passesSurligneur(contour, graine) {
  const r = aleatoire(graine);
  const a = ANGLE_DEGRES * Math.PI / 180;
  const ux = Math.cos(a); const uy = Math.sin(a);        // sens du trait
  const vx = -uy; const vy = ux;                           // perpendiculaire : on avance de passe en passe
  const us = contour.map((q) => q[0] * ux + q[1] * uy);
  const vs = contour.map((q) => q[0] * vx + q[1] * vy);
  const uMin = Math.min(...us) - 6; const uMax = Math.max(...us) + 6;
  const vMin = Math.min(...vs); const vMax = Math.max(...vs);
  const passes = [];
  const pas = LARGEUR_SURLIGNEUR_PT * 0.6;
  for (let v = vMin - LARGEUR_SURLIGNEUR_PT * 0.3; v <= vMax + LARGEUR_SURLIGNEUR_PT * 0.3; v += pas * (0.9 + r() * 0.2)) {
    const derive = (r() - 0.5) * 0.06;                     // le poignet ne trace jamais tout à fait droit
    const v1 = v + (r() - 0.5) * 1.6; const v2 = v + (uMax - uMin) * derive + (r() - 0.5) * 1.6;
    const ep = LARGEUR_SURLIGNEUR_PT * (0.92 + r() * 0.14);
    passes.push([uMin * ux + v1 * vx, uMin * uy + v1 * vy, uMax * ux + v2 * vx, uMax * uy + v2 * vy, ep]);
  }
  return passes;
}

/**
 * Le PDF du site avec les parcelles surlignées. Rend les octets du nouveau PDF.
 * @param {Uint8Array | Buffer} pdf @param {{ emprisePlan: number[] | null, centre: [number, number], echelle: number,
 *   parcelles: Array<{ section: string, numero: string, anneaux: Array<Array<[number, number]>> }> }} plan
 */
async function surlignerParcelles(pdf, plan) {
  const doc = await PDFDocument.load(pdf);
  const page = doc.getPage(0);
  const { width, height } = page.getSize();
  if (Math.abs(width - 595) > 3 || Math.abs(height - 842) > 3) throw new Error('Format inattendu : l’extrait du site n’est pas en A4 portrait.');
  // Sans l'emprise envoyée par le site, le centre du clic (la zone d'impression s'y centre) et la taille du cadre suffisent.
  const emprise = plan.emprisePlan || [plan.centre[0] - 1, plan.centre[1] - 1, plan.centre[0] + 1, plan.centre[1] + 1];
  for (const p of plan.parcelles) {
    for (const [i, anneau] of p.anneaux.entries()) {
      const contour = /** @type {Array<[number, number]>} */ (anneau.map((q) => pointPage(q, emprise, plan.echelle, height)));
      if (contour.length < 3) continue;
      // Découpe : la parcelle seule.
      page.pushOperators(pushGraphicsState(), moveTo(contour[0][0], contour[0][1]),
        ...contour.slice(1).map((q) => lineTo(q[0], q[1])), closePath(), clip(), endPath());
      for (const [x1, y1, x2, y2, ep] of passesSurligneur(contour, `${p.section}${p.numero}-${i}`)) {
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: ep, color: JAUNE_FLUO, opacity: 0.42,
          blendMode: BlendMode.Multiply, lineCap: LineCapStyle.Round });
      }
      // Le long du bord intérieur, comme on repasse les angles : la moitié intérieure du trait seulement (découpe).
      for (let j = 0; j < contour.length; j++) {
        const a = contour[j]; const b = contour[(j + 1) % contour.length];
        page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: 7, color: JAUNE_FLUO, opacity: 0.38,
          blendMode: BlendMode.Multiply, lineCap: LineCapStyle.Round });
      }
      page.pushOperators(popGraphicsState());
    }
  }
  doc.setProducer('CLAIRE (surlignage) — extrait du plan cadastral cadastre.gouv.fr');
  return Buffer.from(await doc.save());
}

module.exports = { surlignerParcelles, pointPage, passesSurligneur, aleatoire, CENTRE_CARTE_PT };
