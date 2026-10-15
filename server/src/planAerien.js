// @ts-check
'use strict';

// Plan aérien des parcelles (étude 15/10 : « mettre les numéros de parcelle sur le plan IGN pour comparer et créer le pourcentage »).
// Tout vient des services OUVERTS de l'IGN, sans navigateur, sans IA, sans jeton :
// - la photographie aérienne (Géoplateforme, WMS data.geopf.fr) sur un cadre A4 portrait ;
// - les parcelles du cadastre (API Carto) : celles du dossier surlignées en jaune fluo avec leur numéro, les voisines en filet blanc
//   avec leur numéro — de quoi comparer avec le plan de situation du site du cadastre ;
// - le zonage du Géoportail de l'urbanisme : la PART de chaque zone dans chaque parcelle, calculée ici par la géométrie (ce que la
//   version payante de Géofoncier donne), et les servitudes patrimoniales (monument historique…) déjà lues par l'outil.
// NE PART QUE : le code INSEE, la section et le numéro des parcelles, et l'emprise du cadre — jamais un nom, une adresse ni un dossier.

const { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, clipEvenOdd, endPath } = require('pdf-lib');
const { parcelleCadastre, zonesAvecGeometrie, parcellesDansPolygone, zonageParcelle, normaliserParcelle } = require('./urbanisme');

const WMS = 'https://data.geopf.fr/wms-r';
const DELAI_MS = 25000;
const RAYON_TERRE = 6378137;
const PAGE = { l: 595.28, h: 841.89 };
const CADRE = { x: 40, haut: 752, l: 515, h: 500 };          // le cadre de la photo (points, y du bord supérieur)
const PX_PAR_PT = 3;
const PART_PARCELLES = 0.62;                                  // les parcelles du dossier occupent au plus 62 % du cadre
const LARGEUR_MIN_M = 120;                                    // largeur sol minimale du cadre
const PORTEE_MAX_M = 1100;                                    // plus étendu, les parcelles vont sur un autre plan
const MAX_PARCELLES = 12;
const MAX_PLANS = 6;
const COULEURS_ZONES = [[0.85, 0.1, 0.55], [0.1, 0.45, 0.95], [1, 0.5, 0], [0.55, 0.2, 0.85], [0, 0.65, 0.55], [0.9, 0.15, 0.15]];
const JAUNE_FLUO = rgb(1, 0.95, 0.05);

// ---- Géométrie (pure) ---------------------------------------------------------------------------------------------------

/** [lon, lat] → mètres Web Mercator (EPSG:3857). @param {[number, number]} p */
function mercator(p) {
  return [RAYON_TERRE * p[0] * Math.PI / 180, RAYON_TERRE * Math.log(Math.tan(Math.PI / 4 + p[1] * Math.PI / 360))];
}

/** Mètres Web Mercator → [lon, lat]. @param {[number, number]} m */
function demercator(m) {
  return [m[0] / RAYON_TERRE * 180 / Math.PI, (2 * Math.atan(Math.exp(m[1] / RAYON_TERRE)) - Math.PI / 2) * 180 / Math.PI];
}

/** Les polygones d'une géométrie GeoJSON : chacun une liste d'anneaux [lon, lat]. @param {any} g @returns {Array<Array<Array<[number, number]>>>} */
function polygonesDe(g) {
  if (!g || !Array.isArray(g.coordinates)) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}

/** Points d'une géométrie (tous anneaux). @param {any} g */
function pointsDe(g) {
  return polygonesDe(g).flat(2).filter((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
}

/** Intervalles [x1, x2] de la ligne horizontale y qui sont dans le polygone (règle pair-impair : trous compris). Pure.
 * @param {Array<Array<[number, number]>>} anneaux en mètres @param {number} y */
function intervallesLigne(anneaux, y) {
  /** @type {number[]} */
  const xs = [];
  for (const a of anneaux) {
    for (let i = 0, n = a.length; i < n; i++) {
      const p = a[i]; const q = a[(i + 1) % n];
      if ((p[1] <= y) !== (q[1] <= y)) xs.push(p[0] + (y - p[1]) * (q[0] - p[0]) / (q[1] - p[1]));
    }
  }
  xs.sort((a, b) => a - b);
  /** @type {Array<[number, number]>} */
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

/** Pure : réunit des intervalles (plusieurs polygones d'un même multi-polygone). @param {Array<[number, number]>} l */
function reunir(l) {
  const t = l.slice().sort((a, b) => a[0] - b[0]);
  /** @type {Array<[number, number]>} */
  const out = [];
  for (const iv of t) {
    const dernier = out[out.length - 1];
    if (dernier && iv[0] <= dernier[1]) dernier[1] = Math.max(dernier[1], iv[1]); else out.push([iv[0], iv[1]]);
  }
  return out;
}

/** Pure : longueur commune de deux listes d'intervalles disjoints et triés. @param {Array<[number, number]>} a @param {Array<[number, number]>} b */
function longueurCommune(a, b) {
  let i = 0; let j = 0; let somme = 0;
  while (i < a.length && j < b.length) {
    const d = Math.max(a[i][0], b[j][0]); const f = Math.min(a[i][1], b[j][1]);
    if (f > d) somme += f - d;
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return somme;
}

/** Pure : un polygone GeoJSON → anneaux en mètres autour d'une origine. @param {any} g @param {[number, number]} ref [lon, lat] */
function enMetres(g, ref) {
  const kx = 111320 * Math.cos(ref[1] * Math.PI / 180); const ky = 110574;
  return polygonesDe(g).map((poly) => poly.map((a) => a.map((p) => /** @type {[number, number]} */ ([(p[0] - ref[0]) * kx, (p[1] - ref[1]) * ky]))));
}

/**
 * Pure : la part de chaque zone dans la parcelle, par balayage de lignes horizontales (une ligne tous les ~25 cm, jamais moins de
 * 200 ni plus de 1 500 lignes) — la géométrie exacte, sans bibliothèque. Les parts se comptent sur la parcelle : la somme des zones
 * et du « hors zone » fait 100 %.
 * @param {any} geometrieParcelle GeoJSON en degrés @param {Array<{ libelle: string, libelong?: string, typezone?: string, geometry: any }>} zones
 */
function repartitionZonage(geometrieParcelle, zones) {
  const pts = pointsDe(geometrieParcelle);
  if (!pts.length) return { surface: 0, zones: [], horsZone: 1 };
  const ref = /** @type {[number, number]} */ ([(Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2, (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2]);
  const parcelle = enMetres(geometrieParcelle, ref);
  const ys = parcelle.flat(2).map((p) => p[1]);
  const yMin = Math.min(...ys); const yMax = Math.max(...ys);
  const lignes = Math.min(1500, Math.max(200, Math.round((yMax - yMin) / 0.25)));
  const dy = (yMax - yMin) / lignes;
  const lesZones = zones.map((z) => ({ z, poly: enMetres(z.geometry, ref) }));
  let surface = 0;
  const parts = lesZones.map(() => 0);
  for (let k = 0; k < lignes; k++) {
    const y = yMin + (k + 0.5) * dy;
    const dansParcelle = reunir(parcelle.flatMap((anneaux) => intervallesLigne(anneaux, y)));
    const longueur = dansParcelle.reduce((s, iv) => s + iv[1] - iv[0], 0);
    if (!longueur) continue;
    surface += longueur * dy;
    lesZones.forEach((lz, i) => {
      const dansZone = reunir(lz.poly.flatMap((anneaux) => intervallesLigne(anneaux, y)));
      parts[i] += longueurCommune(dansParcelle, dansZone) * dy;
    });
  }
  if (!(surface > 0)) return { surface: 0, zones: [], horsZone: 1 };
  const out = lesZones.map((lz, i) => ({ libelle: lz.z.libelle, libelong: lz.z.libelong || '', typezone: lz.z.typezone || '', part: Math.min(1, parts[i] / surface), surface: parts[i] }))
    .filter((x) => x.part >= 0.0005).sort((a, b) => b.part - a.part);
  const dedans = out.reduce((s, x) => s + x.part, 0);
  return { surface, zones: out, horsZone: Math.max(0, 1 - dedans) };
}

/** Pure : l'emprise sol (mètres) d'une liste de parcelles — étendue est-ouest et nord-sud. @param {any[]} parcelles */
function etendueSolM(parcelles) {
  const pts = parcelles.flatMap((f) => pointsDe(f.geometry));
  if (!pts.length) return { x: 0, y: 0 };
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return { x: (Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))) * 111320 * Math.cos(lat * Math.PI / 180),
    y: (Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]))) * 110574 };
}

/** Pure : répartit les parcelles en plans — des proches sur un même plan, des éloignées sur des plans à part (étude 14/10, même
 * esprit que le plan de situation). Rend des listes de parcelles ; `null` si plus de MAX_PLANS plans seraient nécessaires.
 * @param {any[]} parcelles */
function groupesPlansAeriens(parcelles) {
  /** @type {any[][]} */
  const groupes = [];
  for (const p of parcelles) {
    const g = groupes.find((l) => { const e = etendueSolM([...l, p]); return e.x <= PORTEE_MAX_M && e.y <= PORTEE_MAX_M; });
    if (g) g.push(p); else groupes.push([p]);
  }
  return groupes.length > MAX_PLANS ? null : groupes;
}

/** Pure : un point à l'intérieur d'un anneau, le plus loin possible des bords (placer un numéro). @param {Array<[number, number]>} anneau */
function centreInterieur(anneau) {
  const xs = anneau.map((p) => p[0]); const ys = anneau.map((p) => p[1]);
  const dedans = (x, y) => { let c = false; for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) { const a = anneau[i]; const b = anneau[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const distance = (x, y) => { let m = Infinity; for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) { const a = anneau[i]; const b = anneau[j]; const dx = b[0] - a[0]; const dy = b[1] - a[1]; const l2 = dx * dx + dy * dy; const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0; m = Math.min(m, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)); } return m; };
  let meilleur = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; let dMax = -1;
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let tour = 0; tour < 3; tour++) {
    const N = 16;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const x = x0 + (x1 - x0) * i / N; const y = y0 + (y1 - y0) * j / N;
      if (!dedans(x, y)) continue;
      const d = distance(x, y);
      if (d > dMax) { dMax = d; meilleur = [x, y]; }
    }
    const lx = (x1 - x0) / 4; const ly = (y1 - y0) / 4;
    [x0, x1, y0, y1] = [meilleur[0] - lx, meilleur[0] + lx, meilleur[1] - ly, meilleur[1] + ly];
  }
  return /** @type {[number, number]} */ (meilleur);
}

/** Pure : longueur « ronde » de la barre d'échelle (mètres) pour une largeur sol visée. @param {number} metres */
function longueurBarre(metres) {
  for (const v of [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (v >= metres * 0.7) return v;
  return 1000;
}

// ---- Image et PDF -------------------------------------------------------------------------------------------------------

/** @param {any} injections */
const fetchDe = (injections) => (injections && injections.fetch) || fetch;

/** La photographie aérienne du cadre (Web Mercator). @param {number[]} bbox [minX, minY, maxX, maxY] en mètres @param {any} injections */
async function photoCadre(bbox, injections) {
  const w = Math.round(CADRE.l * PX_PAR_PT); const h = Math.round(CADRE.h * PX_PAR_PT);
  const url = `${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=&CRS=EPSG:3857`
    + `&BBOX=${bbox.map((x) => x.toFixed(2)).join(',')}&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/jpeg`;
  const r = await fetchDe(injections)(url, { signal: AbortSignal.timeout(DELAI_MS) });
  const type = String(r.headers.get('content-type') || '');
  if (!r.ok || !type.startsWith('image/')) { const e = new Error(`Géoplateforme : réponse ${r.status}`); /** @type {any} */ (e).statut = r.status; throw e; }
  return { octets: new Uint8Array(await r.arrayBuffer()), png: /png/i.test(type) };
}

/** Texte sans caractère que la police standard ne sait pas écrire. @param {string} t */
const sur = (t) => String(t || '').replace(/[^ -~ -ÿ–—‘’“”…€]/g, '').replace(/\s+/g, ' ');

const libelleParcelle = (p) => `${p.properties.section} ${Number(p.properties.numero) || p.properties.numero}`;

/** Les parcelles, leur zonage, leurs servitudes : tout ce que dit le plan (hors image). */
async function lireDonnees(insee, listeParcelles, injections) {
  const features = [];
  for (const p of listeParcelles) {
    const f = await parcelleCadastre(insee, p.section, p.numero, injections);
    if (!f) return { erreur: `Parcelle ${p.section} ${Number(p.numero)} introuvable au cadastre de cette commune.`, statut: 404 };
    features.push(f);
  }
  const zonages = [];
  for (const f of features) {
    let zones = [];
    let lu = true;
    try { zones = await zonesAvecGeometrie(f.geometry, injections); } catch (_) { lu = false; }
    let patrimoine = null; let document = null; let rnu = false;
    try {
      const z = await zonageParcelle(insee, f.properties.section, f.properties.numero, injections);
      if (!z.erreur) { patrimoine = z.patrimoine; document = z.document; rnu = !!z.rnu; }
    } catch (_) { /* servitudes non lues : dit sur le plan */ }
    zonages.push({ lu, zones, repartition: lu ? repartitionZonage(f.geometry, zones) : null, patrimoine, document, rnu });
  }
  return { features, zonages };
}

/** Vue publique d'un plan (sans octets). */
function vuePlan(parcelleF, zonage, contenanceM2) {
  const r = zonage.repartition;
  return {
    section: parcelleF.properties.section, numero: String(Number(parcelleF.properties.numero) || parcelleF.properties.numero), contenance: contenanceM2 || null,
    surfaceCalculee: r ? Math.round(r.surface) : null, zonageLu: zonage.lu, rnu: zonage.rnu,
    document: zonage.document ? { type: zonage.document.type, titre: zonage.document.titre } : null,
    zones: r ? r.zones.map((z) => ({ libelle: z.libelle, libelong: z.libelong, typezone: z.typezone, pourcentage: Math.round(z.part * 1000) / 10 })) : [],
    horsZone: r ? Math.round(r.horsZone * 1000) / 10 : null,
    patrimoine: zonage.patrimoine ? { lu: !!zonage.patrimoine.lu, servitudes: (zonage.patrimoine.servitudes || []).map((s) => ({ libelle: s.libelle, nom: s.nom })) } : { lu: false, servitudes: [] }
  };
}

/**
 * Compose le PDF (une page A4 portrait par groupe de parcelles) et les parts de zonage.
 * @param {{ insee: string, parcelles: Array<{ section: string, numero: string }>, injections?: any }} o
 */
async function planAerien(o) {
  const inj = o.injections || {};
  const insee = String(o.insee || '').toUpperCase();
  if (!/^\d[0-9AB]\d{3}$/.test(insee)) return { erreur: 'Code INSEE de la commune manquant ou invalide.', statut: 400 };
  const liste = (o.parcelles || []).map((p) => normaliserParcelle(p.section, p.numero)).filter(Boolean);
  if (!liste.length) return { erreur: 'Aucune parcelle (section et numéro).', statut: 400 };
  if (liste.length > MAX_PARCELLES) return { erreur: `${MAX_PARCELLES} parcelles au plus par demande.`, statut: 400 };
  const donnees = await lireDonnees(insee, /** @type {any[]} */ (liste), inj);
  if (donnees.erreur) return donnees;
  const { features, zonages } = donnees;
  const commune = String((features[0].properties && features[0].properties.nom_com) || '');
  const parIndice = features.map((f, i) => ({ f, z: zonages[i] }));
  const groupes = groupesPlansAeriens(parIndice.map((x) => x.f));
  if (!groupes) return { erreur: `Parcelles trop dispersées : plus de ${MAX_PLANS} plans seraient nécessaires. Les demander en plusieurs fois.`, statut: 400 };

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Plan aérien — ${commune}`); pdf.setCreator('CLAIRE'); pdf.setProducer('CLAIRE');
  const police = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const plans = [];

  for (const [n, groupe] of groupes.entries()) {
    const page = pdf.addPage([PAGE.l, PAGE.h]);
    const items = groupe.map((f) => parIndice.find((x) => x.f === f));
    const pts = groupe.flatMap((f) => pointsDe(f.geometry).map((p) => mercator(/** @type {[number, number]} */ (p))));
    const latMoy = pts.map((p) => demercator(/** @type {[number, number]} */ (p))[1]).reduce((s, v) => s + v, 0) / pts.length;
    const cosLat = Math.cos(latMoy * Math.PI / 180);
    const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2; const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const rapport = CADRE.h / CADRE.l;
    const largeurM = Math.max(LARGEUR_MIN_M / cosLat, (Math.max(...xs) - Math.min(...xs)) / PART_PARCELLES, (Math.max(...ys) - Math.min(...ys)) / PART_PARCELLES / rapport);
    const hauteurM = largeurM * rapport;
    const bbox = [cx - largeurM / 2, cy - hauteurM / 2, cx + largeurM / 2, cy + hauteurM / 2];
    const mParPt = largeurM / CADRE.l;                 // mètres Mercator par point de page
    const solParPt = mParPt * cosLat;                  // mètres sur le terrain par point de page
    const versPage = (/** @type {[number, number]} */ p) => { const m = mercator(p); return /** @type {[number, number]} */ ([CADRE.x + (m[0] - bbox[0]) / mParPt, CADRE.haut - CADRE.h + (m[1] - bbox[1]) / mParPt]); };

    const photo = await photoCadre(bbox, inj);
    const image = photo.png ? await pdf.embedPng(photo.octets) : await pdf.embedJpg(photo.octets);
    page.drawImage(image, { x: CADRE.x, y: CADRE.haut - CADRE.h, width: CADRE.l, height: CADRE.h });

    // Les voisines du cadastre (si le cadre n'en contient pas des centaines).
    const coins = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]].map((m) => demercator(/** @type {[number, number]} */ (m)));
    let voisines = [];
    try {
      const v = await parcellesDansPolygone({ type: 'Polygon', coordinates: [[...coins, coins[0]]] }, inj);
      voisines = v.length >= 600 ? [] : v;
    } catch (_) { /* voisines non lues : le plan se fait sans */ }
    const dossier = new Set(groupe.map((f) => f.properties.idu));

    // Tout ce qui se dessine est coupé au cadre.
    page.pushOperators(pushGraphicsState(), moveTo(CADRE.x, CADRE.haut - CADRE.h), lineTo(CADRE.x + CADRE.l, CADRE.haut - CADRE.h), lineTo(CADRE.x + CADRE.l, CADRE.haut), lineTo(CADRE.x, CADRE.haut), closePath(), clip(), endPath());
    const tracerAnneau = (anneau, epaisseur, couleur, opacite, tirets) => {
      const a = anneau.map((p) => versPage(p));
      for (let i = 0; i < a.length - 1; i++) page.drawLine({ start: { x: a[i][0], y: a[i][1] }, end: { x: a[i + 1][0], y: a[i + 1][1] }, thickness: epaisseur, color: couleur, opacity: opacite, ...(tirets ? { dashArray: tirets } : {}) });
    };
    const texteHalo = (texte, x, y, taille, f, couleur, halo) => {
      const t = sur(texte); const l = f.widthOfTextAtSize(t, taille);
      for (const [dx, dy] of [[-0.8, 0], [0.8, 0], [0, -0.8], [0, 0.8], [-0.6, -0.6], [0.6, 0.6], [-0.6, 0.6], [0.6, -0.6]]) page.drawText(t, { x: x - l / 2 + dx, y: y - taille * 0.35 + dy, size: taille, font: f, color: halo });
      page.drawText(t, { x: x - l / 2, y: y - taille * 0.35, size: taille, font: f, color: couleur });
    };
    // Voisines : filet blanc, numéro quand la parcelle est assez grande à l'écran.
    const etiquettes = [];
    for (const v of voisines) {
      if (dossier.has(v.properties.idu)) continue;
      for (const poly of polygonesDe(v.geometry)) {
        tracerAnneau(poly[0], 0.6, rgb(1, 1, 1), 0.85);
        const a = poly[0].map((p) => versPage(p));
        const l = Math.max(...a.map((p) => p[0])) - Math.min(...a.map((p) => p[0])); const h = Math.max(...a.map((p) => p[1])) - Math.min(...a.map((p) => p[1]));
        if (l >= 17 && h >= 9) { const c = centreInterieur(a); etiquettes.push({ c, texte: l >= 40 ? `${v.properties.section} ${Number(v.properties.numero)}` : String(Number(v.properties.numero)) }); }
      }
    }
    // Contours des zones du document d'urbanisme (pointillés colorés), légende plus bas.
    /** @type {Map<string, any>} */
    const couleursZones = new Map();
    for (const it of items) {
      for (const z of (it ? it.z.zones : [])) {
        if (!couleursZones.has(z.libelle)) couleursZones.set(z.libelle, COULEURS_ZONES[couleursZones.size % COULEURS_ZONES.length]);
      }
    }
    const dejaDessinees = new Set();
    for (const it of items) {
      for (const z of (it ? it.z.zones : [])) {
        const cle = z.libelle + '|' + JSON.stringify(z.geometry).length;
        if (dejaDessinees.has(cle)) continue;
        dejaDessinees.add(cle);
        const c = couleursZones.get(z.libelle);
        for (const poly of polygonesDe(z.geometry)) for (const anneau of poly) {
          tracerAnneau(anneau, 2.6, rgb(1, 1, 1), 0.7);
          tracerAnneau(anneau, 1.4, rgb(c[0], c[1], c[2]), 1, [5, 3]);
        }
      }
    }
    for (const e of etiquettes) texteHalo(e.texte, e.c[0], e.c[1], 6.5, police, rgb(1, 1, 1), rgb(0, 0, 0));
    // Parcelles du dossier : surligneur jaune fluo, dans leurs limites (trous compris), puis contour et numéro.
    for (const f of groupe) {
      for (const poly of polygonesDe(f.geometry)) {
        const rings = poly.map((a) => a.map((p) => versPage(p)));
        const ops = [pushGraphicsState()];
        rings.forEach((a) => { ops.push(moveTo(a[0][0], a[0][1])); a.slice(1).forEach((p) => ops.push(lineTo(p[0], p[1]))); ops.push(closePath()); });
        ops.push(clipEvenOdd(), endPath());
        page.pushOperators(...ops);
        const px = rings[0].map((p) => p[0]); const py = rings[0].map((p) => p[1]);
        page.drawRectangle({ x: Math.min(...px) - 2, y: Math.min(...py) - 2, width: Math.max(...px) - Math.min(...px) + 4, height: Math.max(...py) - Math.min(...py) + 4, color: JAUNE_FLUO, opacity: 0.42 });
        page.pushOperators(popGraphicsState());
        for (const anneau of poly) { tracerAnneau(anneau, 3.6, rgb(0, 0, 0), 0.6); tracerAnneau(anneau, 1.8, JAUNE_FLUO, 1); }
      }
    }
    for (const f of groupe) {
      const plusGrand = polygonesDe(f.geometry).map((p) => p[0].map((q) => versPage(q))).sort((a, b) => (Math.max(...b.map((p) => p[0])) - Math.min(...b.map((p) => p[0]))) - (Math.max(...a.map((p) => p[0])) - Math.min(...a.map((p) => p[0]))))[0];
      if (plusGrand) { const c = centreInterieur(plusGrand); texteHalo(libelleParcelle(f), c[0], c[1], 10.5, gras, rgb(0, 0, 0), rgb(1, 1, 1)); }
    }
    // Étiquette de chaque zone, là où elle se voit dans le cadre.
    for (const [lib, c] of couleursZones) {
      const it = items.find((x) => x && x.z.zones.some((z) => z.libelle === lib));
      const z = it && it.z.zones.find((x) => x.libelle === lib);
      if (!z) continue;
      const anneaux = polygonesDe(z.geometry).map((p) => p[0].map((q) => versPage(q))).filter((a) => a.some((p) => p[0] > CADRE.x && p[0] < CADRE.x + CADRE.l && p[1] > CADRE.haut - CADRE.h && p[1] < CADRE.haut));
      if (!anneaux.length) continue;
      const plusGrand = anneaux.sort((a, b) => b.length - a.length)[0];
      const c2 = centreInterieur(plusGrand);
      if (c2[0] > CADRE.x + 14 && c2[0] < CADRE.x + CADRE.l - 14 && c2[1] > CADRE.haut - CADRE.h + 10 && c2[1] < CADRE.haut - 10) texteHalo(lib, c2[0], c2[1], 11, gras, rgb(c[0], c[1], c[2]), rgb(1, 1, 1));
    }
    page.pushOperators(popGraphicsState());

    // Cadre, nord, échelle.
    page.drawRectangle({ x: CADRE.x, y: CADRE.haut - CADRE.h, width: CADRE.l, height: CADRE.h, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 0.8 });
    const barre = longueurBarre(solParPt * 110); const barrePt = barre / solParPt;
    page.drawRectangle({ x: CADRE.x + 8, y: CADRE.haut - CADRE.h + 8, width: barrePt + 100, height: 26, color: rgb(1, 1, 1), opacity: 0.85 });
    page.drawRectangle({ x: CADRE.x + 14, y: CADRE.haut - CADRE.h + 22, width: barrePt, height: 3, color: rgb(0, 0, 0) });
    page.drawText(`${barre >= 1000 ? barre / 1000 + ' km' : barre + ' m'}`, { x: CADRE.x + 14, y: CADRE.haut - CADRE.h + 12, size: 8, font: police, color: rgb(0, 0, 0) });
    const echelle = Math.round(solParPt * 2834.6 / 50) * 50;
    page.drawText(`env. 1/${echelle} (A4)`, { x: CADRE.x + 14 + barrePt + 6, y: CADRE.haut - CADRE.h + 22, size: 7.5, font: police, color: rgb(0, 0, 0) });
    const nx = CADRE.x + CADRE.l - 22; const ny = CADRE.haut - 40;
    page.drawRectangle({ x: nx - 12, y: ny - 8, width: 24, height: 38, color: rgb(1, 1, 1), opacity: 0.85 });
    page.drawLine({ start: { x: nx, y: ny - 2 }, end: { x: nx, y: ny + 20 }, thickness: 1.6, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: nx, y: ny + 22 }, end: { x: nx - 4, y: ny + 14 }, thickness: 1.6, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: nx, y: ny + 22 }, end: { x: nx + 4, y: ny + 14 }, thickness: 1.6, color: rgb(0, 0, 0) });
    page.drawText('N', { x: nx - 3, y: ny - 12, size: 8, font: gras, color: rgb(0, 0, 0) });

    // En-tête.
    const noms = groupe.map(libelleParcelle).join(', ');
    page.drawText(sur(`Plan aérien — ${commune}${groupes.length > 1 ? `  (plan ${n + 1}/${groupes.length})` : ''}`), { x: 40, y: 800, size: 16, font: gras, color: rgb(0.43, 0.14, 0.2) });
    page.drawText(sur(`Parcelles ${noms}`), { x: 40, y: 782, size: 10.5, font: police, color: rgb(0.1, 0.1, 0.1), maxWidth: 515, lineHeight: 12 });

    // Tableau du zonage de ces parcelles.
    let y = CADRE.haut - CADRE.h - 20;
    page.drawText('Zonage du document d’urbanisme — part de chaque zone dans la parcelle', { x: 40, y, size: 9.5, font: gras, color: rgb(0.1, 0.1, 0.1) });
    y -= 6;
    const colonnes = [40, 105, 235, 480];
    ['Parcelle', 'Contenance', 'Zone', 'Part'].forEach((t, i) => page.drawText(t, { x: colonnes[i], y: y - 10, size: 8, font: gras, color: rgb(0.35, 0.35, 0.35) }));
    y -= 14;
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    let tronque = false;
    for (const it of items) {
      if (!it) continue;
      const v = vuePlan(it.f, it.z, it.f.properties.contenance);
      /** @type {Array<{ zone: string, part: string, libelle?: string }>} */
      const lignes = [];
      if (!v.zonageLu) lignes.push({ zone: 'Zonage non lu (Géoportail de l’urbanisme injoignable)', part: '' });
      else if (!v.zones.length) lignes.push({ zone: v.rnu ? 'Règlement national d’urbanisme (pas de document d’urbanisme)' : 'Aucune zone publiée sur cette parcelle', part: '' });
      else {
        v.zones.forEach((z) => lignes.push({ zone: `${z.libelle}${z.libelong ? ' — ' + z.libelong : ''}`.slice(0, 54), part: `${String(z.pourcentage).replace('.', ',')} %`, libelle: z.libelle }));
        if (v.horsZone && v.horsZone >= 0.5) lignes.push({ zone: 'Hors zone du document', part: `${String(v.horsZone).replace('.', ',')} %` });
      }
      lignes.forEach((l, i) => {
        if (y < 104) { tronque = true; return; }
        y -= 12;
        if (i === 0) {
          page.drawText(sur(libelleParcelle(it.f)), { x: colonnes[0], y, size: 8.5, font: gras, color: rgb(0, 0, 0) });
          const mesure = v.surfaceCalculee && v.contenance && Math.abs(v.surfaceCalculee - v.contenance) / v.contenance > 0.08 ? ` (mesurée ${v.surfaceCalculee})` : '';
          page.drawText(sur(it.f.properties.contenance ? `${it.f.properties.contenance} m²${mesure}` : v.surfaceCalculee ? `${v.surfaceCalculee} m² mesurés` : ''), { x: colonnes[1], y, size: 8, font: police, color: rgb(0, 0, 0) });
        }
        const c = l.libelle && couleursZones.get(l.libelle);
        if (c) page.drawRectangle({ x: colonnes[2] - 9, y: y - 1, width: 6, height: 7, color: rgb(c[0], c[1], c[2]) });
        page.drawText(sur(l.zone), { x: colonnes[2], y, size: 8.5, font: police, color: rgb(0, 0, 0) });
        page.drawText(sur(l.part), { x: colonnes[3], y, size: 8.5, font: gras, color: rgb(0, 0, 0) });
      });
    }
    // Servitudes patrimoniales de ces parcelles.
    const servitudes = new Set(); let patrimoineLu = true;
    for (const it of items) {
      if (!it || !it.z.patrimoine || !it.z.patrimoine.lu) { patrimoineLu = false; continue; }
      it.z.patrimoine.servitudes.forEach((s) => servitudes.add(`${s.libelle}${s.nom ? ' — ' + s.nom : ''}`));
    }
    y = Math.max(y - 16, 92);
    const phrase = servitudes.size ? `Protection du patrimoine : ${[...servitudes].slice(0, 3).join(' ; ')} (accord de l’architecte des bâtiments de France pour les travaux visibles).`
      : patrimoineLu ? 'Protection du patrimoine : aucune servitude publiée sur ces parcelles (une commune qui n’a pas versé ses servitudes n’y figure pas).'
        : 'Protection du patrimoine : couche non lue — à vérifier sur le Géoportail de l’urbanisme.';
    page.drawText(sur(phrase), { x: 40, y, size: 8, font: police, color: rgb(0.1, 0.1, 0.1), maxWidth: 515, lineHeight: 10 });
    if (tronque) page.drawText('Suite du tableau dans CLAIRE (trop de lignes pour la page).', { x: 40, y: y - 24, size: 7.5, font: police, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(sur(`Photographie aérienne © IGN (Géoplateforme) · parcellaire © IGN/DGFiP (API Carto) · zonage : Géoportail de l’urbanisme. Les parts sont calculées sur les contours publiés : indicatives, à vérifier sur le document d’urbanisme. Édité par CLAIRE le ${new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}.`),
      { x: 40, y: 56, size: 6.8, font: police, color: rgb(0.35, 0.35, 0.35), maxWidth: 515, lineHeight: 8.5 });

    plans.push({ echelle, parcelles: items.map((it) => it && vuePlan(it.f, it.z, it.f.properties.contenance)).filter(Boolean), zones: [...couleursZones.keys()] });
  }
  const octets = await pdf.save();
  return { commune, plans, pdf: octets, nom: sur(`Plan aérien ${commune} ${features.map(libelleParcelle).join(' ')}`).replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 110) };
}

module.exports = { planAerien, repartitionZonage, groupesPlansAeriens, centreInterieur, mercator, demercator, intervallesLigne, longueurBarre, MAX_PARCELLES };
