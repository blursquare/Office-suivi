// Recalage automatique d'un cliché aérien ancien de l'IGN (étude 31/10 : « essaie de te repérer avec les routes et bâtiments alentour
// pour trouver la parcelle » ; « détecter un bâtiment de référence et y appliquer une carte IGN »). Avant 2000, l'emprise publiée d'un
// cliché vient du plan de vol : le contour tombe souvent à côté (mesure du 31/10, docs/mesures/2026-10-31-cliches-ign.md).
//
// Référence : l'orthophoto historique de l'IGN de la même époque (1950-1965, 1965-1980, 1980-1995…), déjà recalée sur le terrain, lue par
// le serveur (/api/urbanisme/photo) sur 1,2 km autour du bien. Le cliché est rendu tourné, nord en haut, à la même échelle, sur une zone
// plus grande ; on cherche le décalage où les contours de l'image (routes, haies, bâtiments : le gradient de la luminance) se superposent
// le mieux (corrélation normalisée, du grossier au fin). Un accord trop faible ou ambigu est refusé : le contour reste où l'emprise le
// met, avec « Position approximative ». Tout se fait sur le poste ; ne partent que l'identifiant du cliché et l'emprise du bien.

// Seuils réglés sur la mesure du 31/10 (6 sites, 36 clichés anciens) : avec un accord grossier ≥ 0,42 et net (≥ 0,03 au-dessus du meilleur
// emplacement éloigné), les 17 recalages retenus étaient tous justes ; en dessous, la moitié tombait à côté.
var RECALAGE_CLICHE = { coteRef: 1200, coteZone: 2600, pixelsRef: 512, scoreMin: 0.12, grossierMin: 0.42, ecartMin: 0.03 };

// ===== Calculs purs (testés) =====

// Pure : les orthophotos de l'IGN à essayer comme référence, de la plus proche de l'année du cliché à la plus lointaine ([] : cliché récent,
// pas de recalage). Les couches 1965-1980 et 1980-1995 ne couvrent pas tout le territoire (Vendôme : vides) : on passe alors à la
// suivante ; routes, haies et bâtiments anciens restent en grande partie sur une photo plus récente.
var PERIODES_REFERENCE_CLICHE = [
  { couche: '1950-1965', milieu: 1958 }, { couche: '1965-1980', milieu: 1972 }, { couche: '1980-1995', milieu: 1988 },
  { couche: '2000-2005', milieu: 2002 }, { couche: '2006-2010', milieu: 2008 }
];
function couchesReferenceCliche(annee) {
  const a = Number(annee) || 0;
  if (!a || a >= ANNEE_CLICHE_PRECIS) return [];
  return PERIODES_REFERENCE_CLICHE.slice().sort((x, y) => Math.abs(x.milieu - a) - Math.abs(y.milieu - a) || x.milieu - y.milieu).map(p => p.couche);
}

// Pure : la norme du gradient (Sobel) d'une image en luminance — les bords de routes, de haies et de bâtiments, peu sensibles à la
// différence de teinte entre deux prises de vues.
function gradientImage(lum, w, h) {
  const g = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1];
      const gy = lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1];
      g[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return g;
}

// Pure : image réduite d'un facteur entier (moyenne des blocs) ; les pixels marqués « sans donnée » (NaN) ne comptent pas.
function reduireImageRecalage(img, w, h, f) {
  const W = Math.floor(w / f); const H = Math.floor(h / f);
  const out = new Float32Array(W * H);
  for (let Y = 0; Y < H; Y++) {
    for (let X = 0; X < W; X++) {
      let s = 0; let n = 0;
      for (let y = Y * f; y < Y * f + f; y++) for (let x = X * f; x < X * f + f; x++) { const v = img[y * w + x]; if (v === v) { s += v; n++; } }
      out[Y * W + X] = n ? s / n : NaN;
    }
  }
  return { img: out, w: W, h: H };
}

// Pure : corrélation normalisée du modèle (mw × mh) posé en (ox, oy) dans la zone (zw × zh) ; les pixels sans donnée sont ignorés.
function correlationRecalage(modele, mw, mh, zone, zw, ox, oy) {
  let n = 0; let sa = 0; let sb = 0; let saa = 0; let sbb = 0; let sab = 0;
  for (let y = 0; y < mh; y++) {
    const lz = (oy + y) * zw + ox; const lm = y * mw;
    for (let x = 0; x < mw; x++) {
      const a = modele[lm + x]; const b = zone[lz + x];
      if (a !== a || b !== b) continue;
      n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
    }
  }
  if (n < mw * mh * 0.6) return -1;
  const va = saa - sa * sa / n; const vb = sbb - sb * sb / n;
  return va > 0 && vb > 0 ? (sab - sa * sb / n) / Math.sqrt(va * vb) : -1;
}

// Pure : le meilleur emplacement du modèle dans la zone, cherché sur une grille complète ou autour d'un point ; rend aussi le meilleur
// score trouvé loin du premier (à plus de `rayonAutre` pixels) pour juger si l'accord est net.
function meilleurEmplacementRecalage(modele, mw, mh, zone, zw, zh, autour, rayon, rayonAutre) {
  const xmin = autour ? Math.max(0, autour.x - rayon) : 0; const xmax = autour ? Math.min(zw - mw, autour.x + rayon) : zw - mw;
  const ymin = autour ? Math.max(0, autour.y - rayon) : 0; const ymax = autour ? Math.min(zh - mh, autour.y + rayon) : zh - mh;
  const scores = [];
  let best = { x: 0, y: 0, score: -2 };
  for (let y = ymin; y <= ymax; y++) {
    for (let x = xmin; x <= xmax; x++) {
      const s = correlationRecalage(modele, mw, mh, zone, zw, x, y);
      scores.push({ x, y, s });
      if (s > best.score) best = { x, y, score: s };
    }
  }
  let autre = -2;
  const r2 = (rayonAutre || 0) * (rayonAutre || 0);
  for (const p of scores) if ((p.x - best.x) ** 2 + (p.y - best.y) ** 2 > r2 && p.s > autre) autre = p.s;
  return Object.assign(best, { autre });
}

// Pure : le décalage au sol (mètres vers l'est et vers le nord) du bien sur le cliché par rapport à l'emprise, d'après les gradients de la
// référence (carrée, `cote` m, centrée sur le bien) et de la zone (carrée, plus grande, centrée là où l'emprise met le bien), à la même
// échelle (`mParPx`). Du grossier (facteur 8) au fin (facteur 1). Rend null si l'accord est trop faible ou ambigu.
function decalageRecalage(gRef, rw, gZone, zw, mParPx, reglages) {
  const r = Object.assign({}, RECALAGE_CLICHE, reglages || {});
  const etages = [8, 2, 1];
  let autour = null; let score = 0; let autre = -2; let grossier = -2;
  for (const f of etages) {
    const m = reduireImageRecalage(gRef, rw, rw, f); const z = reduireImageRecalage(gZone, zw, zw, f);
    const precedent = autour ? { x: Math.round(autour.x), y: Math.round(autour.y) } : null;
    const b = meilleurEmplacementRecalage(m.img, m.w, m.h, z.img, z.w, z.h, precedent, precedent ? 6 : 0, f === 8 ? 3 : 0);
    if (f === 8) { autre = b.autre; grossier = b.score; }
    score = b.score;
    const suivant = etages[etages.indexOf(f) + 1];
    autour = suivant ? { x: b.x * f / suivant, y: b.y * f / suivant } : { x: b.x, y: b.y };
  }
  // Position du modèle dans la zone quand l'emprise est juste : centré.
  const centre = (zw - rw) / 2;
  const est = (autour.x - centre) * mParPx; const nord = -(autour.y - centre) * mParPx;
  // Net : au niveau grossier, le meilleur emplacement dépasse nettement le meilleur emplacement éloigné (sinon deux endroits se valent).
  const net = grossier - Math.max(autre, 0) >= r.ecartMin;
  return score >= r.scoreMin && grossier >= r.grossierMin && net ? { est, nord, score, autre, grossier } : { refuse: true, est, nord, score, autre, grossier };
}

// ===== Sur le poste =====

function luminanceToile(ctx, w, h, sansDonnee) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = sansDonnee && d[i * 4 + 3] < 250 ? NaN : (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
  return lum;
}

// Gradient avec les pixels « sans donnée » propagés (un bord d'image ou une zone vide ne doit pas faire un contour).
function gradientAvecTrous(lum, w, h) {
  const plein = Float32Array.from(lum, v => (v === v ? v : 0));
  const g = gradientImage(plein, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (y < 1 || x < 1 || y >= h - 1 || x >= w - 1) { g[i] = NaN; continue; }
    for (let k = -1; k <= 1 && g[i] === g[i]; k++) for (let j = -1; j <= 1; j++) if (lum[i + k * w + j] !== lum[i + k * w + j]) { g[i] = NaN; break; }
  }
  return g;
}

// Le décalage d'un cliché (mètres vers l'est et le nord) : référence IGN de l'époque contre le cliché rendu au même endroit et à la même
// échelle. `c` : le cliché (lot, id, coins, annee) ; `info` : ses niveaux ; `cadre` : la photo dans l'image ; `centre` : le bien (lon, lat).
async function recalerClicheIgn(c, info, cadre, centre) {
  const couches = couchesReferenceCliche(c.annee);
  if (!couches.length || !c.coins || !centre) return null;
  const r = RECALAGE_CLICHE;
  const kLon = 111320 * Math.cos(centre.lat * Math.PI / 180); const kLat = 110574;
  const demi = r.coteRef / 2;
  const emprise = [centre.lon - demi / kLon, centre.lat - demi / kLat, centre.lon + demi / kLon, centre.lat + demi / kLat].map(v => v.toFixed(6)).join(',');
  const mParPx = r.coteRef / r.pixelsRef;
  const rw = r.pixelsRef;
  // La première orthophoto qui couvre vraiment le bien (au moins 80 % de pixels avec une image, pas un blanc uni).
  let gRef = null; let couche = '';
  for (const essai of couches) {
    const ref = await imageClicheIgn(`/api/urbanisme/photo?couche=${encodeURIComponent(essai)}&emprise=${encodeURIComponent(emprise)}`);
    if (!ref) continue;
    const tRef = document.createElement('canvas'); tRef.width = rw; tRef.height = rw;
    const cRef = tRef.getContext('2d', { willReadFrequently: true });
    cRef.drawImage(ref, 0, 0, rw, rw);
    const lum = luminanceToile(cRef, rw, rw, true);
    let pleins = 0; for (let i = 0; i < lum.length; i++) if (lum[i] === lum[i] && lum[i] < 250) pleins++;
    if (pleins < lum.length * 0.8) continue;
    gRef = gradientAvecTrous(lum, rw, rw); couche = essai;
    break;
  }
  if (!gRef) return null;
  // La zone : le cliché rendu nord en haut, à la même échelle, sur `coteZone` m autour de l'endroit où l'emprise met le bien.
  const zw = Math.round(r.coteZone / mParPx);
  const W = info.largeur; const H = info.hauteur;
  const px = (est, nord) => pixelDuPointCliche(c.coins, centre.lon + est / kLon, centre.lat + nord / kLat, W, H, cadre);
  const p0 = px(0, 0); const pe = px(500, 0); const pn = px(0, 500);
  if (!p0 || !pe || !pn) return null;
  // Affine cliché (pleine définition) → écran de la zone, d'après trois points : centre, 500 m à l'est, 500 m au nord.
  const s = 500 / mParPx;
  const ax = [(pe.x - p0.x) / s, (pe.y - p0.y) / s]; const ay = [-(pn.x - p0.x) / s, -(pn.y - p0.y) / s];   // pixel cliché par pixel écran
  const det = ax[0] * ay[1] - ax[1] * ay[0];
  if (!det) return null;
  // Inverse : écran = A⁻¹ (cliché − p0) + centre de la zone.
  const ia = ay[1] / det; const ib = -ax[1] / det; const ic = -ay[0] / det; const id = ax[0] / det;
  const res0 = Math.hypot(ax[0], ax[1]) ? mParPx / Math.hypot(ax[0], ax[1]) : 1;   // mètres par pixel du cliché
  let k = 0;
  while (k < info.niveaux.length - 1 && res0 * Math.pow(2, k + 1) <= mParPx) k++;
  const f = Math.pow(2, k);
  const nv = info.niveaux[k];
  const tZone = document.createElement('canvas'); tZone.width = zw; tZone.height = zw;
  const cZone = tZone.getContext('2d', { willReadFrequently: true });
  // Carrés nécessaires : ceux qui couvrent les coins de la zone, ramenés au niveau k.
  const coinsZone = [[0, 0], [zw, 0], [0, zw], [zw, zw]].map(([X, Y]) => [p0.x + ax[0] * (X - zw / 2) + ay[0] * (Y - zw / 2), p0.y + ax[1] * (X - zw / 2) + ay[1] * (Y - zw / 2)]);
  const xs = coinsZone.map(q => q[0] / f / 512); const ys = coinsZone.map(q => q[1] / f / 512);
  const i0 = Math.max(0, Math.floor(Math.min(...xs))); const i1 = Math.min(Math.ceil(nv.largeur / 512) - 1, Math.floor(Math.max(...xs)));
  const j0 = Math.max(0, Math.floor(Math.min(...ys))); const j1 = Math.min(Math.ceil(nv.hauteur / 512) - 1, Math.floor(Math.max(...ys)));
  if (i1 < i0 || j1 < j0 || (i1 - i0 + 1) * (j1 - j0 + 1) > 36) return null;
  const base = `/api/urbanisme/cliche/${encodeURIComponent(c.lot)}/${encodeURIComponent(c.id)}`;
  const liste = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) liste.push(imageClicheIgn(`${base}/${k}/${i}/${j}`).then(img => ({ img, i, j })));
  const carres = await Promise.all(liste);
  // écran = A⁻¹ · (f · pixelNiveau − p0) + zw/2
  cZone.setTransform(ia * f, ib * f, ic * f, id * f, -(ia * p0.x + ic * p0.y) + zw / 2, -(ib * p0.x + id * p0.y) + zw / 2);
  carres.forEach(({ img, i, j }) => { if (img) cZone.drawImage(img, i * 512, j * 512, img.width + 1, img.height + 1); });
  cZone.setTransform(1, 0, 0, 1, 0, 0);
  // Hors du cliché ou dans le cadre noir : sans donnée.
  const lumZone = luminanceToile(cZone, zw, zw, true);
  const ax0 = cadre[0] * W; const ay0 = cadre[1] * H; const ax1 = cadre[2] * W; const ay1 = cadre[3] * H;
  for (let Y = 0; Y < zw; Y++) for (let X = 0; X < zw; X++) {
    const qx = p0.x + ax[0] * (X - zw / 2) + ay[0] * (Y - zw / 2); const qy = p0.y + ax[1] * (X - zw / 2) + ay[1] * (Y - zw / 2);
    if (qx < ax0 || qy < ay0 || qx > ax1 || qy > ay1) lumZone[Y * zw + X] = NaN;
  }
  const gZone = gradientAvecTrous(lumZone, zw, zw);
  const d = decalageRecalage(gRef, rw, gZone, zw, mParPx);
  return Object.assign(d, { couche, mParPx });
}
