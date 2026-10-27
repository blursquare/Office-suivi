// @ts-check
'use strict';
// Surlignage jaune fluo des parcelles sur le PDF officiel du cadastre (étude 14/10 : « les surligner en fluo jaune pour les repérer
// comme si c'était fait à la main sans dépasser »).
// - « sans dépasser » : chaque parcelle est un chemin de découpe (clip) — rien n'est peint hors de son contour ;
// - « à la main » : des passes de surligneur obliques, un peu irrégulières (angle, écart, épaisseur), qui se chevauchent, puis une
//   passe le long du bord intérieur. L'encre est opaque, sans aucune transparence (étude 27/10 : « quand je mets un
//   plan du cadastre dans mon AAE Authentic, il me fait un PDF avec un gros amas jaune par-dessus la parcelle » — la conversion de
//   l'acte électronique aplatit la transparence : l'encre translucide en mode « produit » posée PAR-DESSUS devenait un aplat qui
//   cachait traits, bâtiments et numéros). Dans la parcelle, le plan est REDESSINÉ par-dessus les passes, couleurs déjà teintées de jaune
//   (`copieTeinteePage`) : traits, numéros et bâtiments restent visibles, à l'écran, à l'impression et dans l'acte.
// Le placement vient de l'emprise imprimée (MAPBBOX) et de l'échelle : la carte de l'extrait A4 portrait du site est toujours
// centrée au même point de la page (relevé le 14/10 sur des extraits au 1/500 et au 1/1000, croix du quadrillage à 0,1 pt près).

const { PDFDocument, PDFName, PDFArray, PDFDict, PDFRef, PDFRawStream, decodePDFRawStream } = require('pdf-lib');

const PT_PAR_MM = 72 / 25.4;
// Centre de la carte dans la page A4 portrait (595 × 842 pt), en points depuis le HAUT de la page.
const CENTRE_CARTE_PT = { x: 296.7, depuisHaut: 524.3 };
// Sous le plan, opaques : les passes un peu plus claires que le trait du bord (le chevauchement d'un vrai surligneur, sans transparence).
const JAUNE_PASSES = '1 0.96 0.38';
const JAUNE_BORD = '1 0.91 0.02';
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

// ---- Teinte jaune sans transparence ----------------------------------------------------------------------------------------------

// Ce que donnait l'encre translucide en mode « produit » sur un gris v : v × (1 − α + α × jaune), α ≈ 0,55. Calculé ici couleur par
// couleur : le plan redessiné dans la parcelle a déjà ses couleurs « surlignées », sans rien de transparent à aplatir.
const TEINTE = [1, 0.9725, 0.4775];
const RE_GRIS_OP = new RegExp(`(${'[-+]?(?:\\d+\\.?\\d*|\\.\\d+)'})\\s+(g|G)(?![A-Za-z0-9*])`, 'g');

/** Pure : un flux de contenu (déjà en gris) dont chaque gris « v g » / « v G » devient sa teinte jaune « r v b rg » / « RG ». @param {string} texte */
function teinterContenu(texte) {
  const f = (x) => (Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000).toString();
  const teinte = (v, remplissage) => `${TEINTE.map((t) => f(v * t)).join(' ')} ${remplissage ? 'rg' : 'RG'}`;
  const N = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)';
  // Couleurs d'un espace choisi par « cs » que le gris a laissées en « v v v sc » (RVB) ou « 0 0 0 x sc » (CMJN) : en RVB teinté.
  return texte
    .replace(new RegExp(`(${N})\\s+(${N})\\s+(${N})\\s+(${N})\\s+(sc|SC|scn|SCN)(?![A-Za-z0-9*])`, 'g'), (_, c, m, y, k, op) =>
      teinte((1 - Math.min(1, Number(k))) * (0.299 * (1 - Math.min(1, Number(c))) + 0.587 * (1 - Math.min(1, Number(m))) + 0.114 * (1 - Math.min(1, Number(y)))), op === 'sc' || op === 'scn'))
    .replace(new RegExp(`(${N})\\s+(${N})\\s+(${N})\\s+(sc|SC|scn|SCN)(?![A-Za-z0-9*])`, 'g'), (_, r, g, b, op) =>
      teinte(0.299 * Number(r) + 0.587 * Number(g) + 0.114 * Number(b), op === 'sc' || op === 'scn'))
    .replace(RE_GRIS_OP, (_, v, op) => teinte(Number(v), op === 'g'));
}

// ---- Fonds blancs retirés -------------------------------------------------------------------------------------------------------

/**
 * Pure : un flux de contenu PDF dont les FONDS blancs ne peignent plus rien (« f » → « n », « B » → « S », « b » → « s ») : les
 * remplissages blancs posés AVANT toute autre peinture du flux (le fond plein du plan de cadastre.gouv.fr, qui cacherait les passes
 * dans la copie teintée). Ceux qui viennent après (bandes blanches qui masquent ce qui déborde du cadre, halos des numéros) restent
 * (relecture 0.373.3). Les traits, les autres couleurs, le texte et les chaînes ne sont pas touchés ; q/Q gardent la couleur courante.
 * Rend null si le flux porte une image en ligne (BI … EI).
 * @param {string} texte @returns {string | null}
 */
function sansFondsBlancs(texte) {
  if (/(?:^|\s)BI(?:\s|$)/.test(texte)) return null;
  const RE = /\((?:\\[\s\S]|[^\\)])*\)|<<|>>|<[0-9A-Fa-f\s]*>|\[|\]|\/[^\s/[\]()<>{}]+|[^\s/[\]()<>{}]+/g;
  let blanc = false;
  const pile = [];
  let nombres = [];
  let sortie = '';
  let dernier = 0;
  let change = false;
  let peint = false;   // une peinture non blanche a déjà eu lieu : les blancs suivants sont des masques, on les garde
  for (let m; (m = RE.exec(texte));) {
    const t = m[0];
    if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(t)) { nombres.push(Number(t)); continue; }
    let remplace = null;
    if (t === 'g') blanc = nombres.length >= 1 && nombres[nombres.length - 1] >= 0.999;
    else if (t === 'rg') blanc = nombres.length >= 3 && nombres.slice(-3).every((x) => x >= 0.999);
    else if (t === 'k') blanc = nombres.length >= 4 && nombres.slice(-4).every((x) => x <= 0.001);
    else if (t === 'sc' || t === 'scn') blanc = (nombres.length === 1 || nombres.length === 3) && nombres.every((x) => x >= 0.999);
    else if (t === 'cs') blanc = false;
    else if (t === 'q') pile.push(blanc);
    else if (t === 'Q') blanc = pile.length ? !!pile.pop() : false;
    else if (blanc && !peint && (t === 'f' || t === 'F' || t === 'f*')) remplace = 'n';
    else if (blanc && !peint && (t === 'B' || t === 'B*')) remplace = 'S';
    else if (blanc && !peint && (t === 'b' || t === 'b*')) remplace = 's';
    else if (['f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'S', 's', 'Tj', 'TJ', "'", '"', 'Do', 'sh'].includes(t)) peint = true;
    nombres = [];
    if (remplace) { sortie += texte.slice(dernier, m.index) + remplace; dernier = m.index + t.length; change = true; }
  }
  return change ? sortie + texte.slice(dernier) : texte;
}

// ---- Plan en niveaux de gris ----------------------------------------------------------------------------------------------------

const NOMBRE = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)';
const RE_RVB = new RegExp(`(${NOMBRE})\\s+(${NOMBRE})\\s+(${NOMBRE})\\s+(rg|RG|sc|SC|scn|SCN)(?![A-Za-z0-9*])`, 'g');
const RE_CMJN = new RegExp(`(${NOMBRE})\\s+(${NOMBRE})\\s+(${NOMBRE})\\s+(${NOMBRE})\\s+(k|K|sc|SC|scn|SCN)(?![A-Za-z0-9*])`, 'g');
const fmt = (x) => (Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000).toString();
/** @param {string} op */
const opGris = (op) => (op === 'rg' || op === 'k' ? 'g' : op === 'RG' || op === 'K' ? 'G' : op);

/**
 * Pure : un flux de contenu PDF avec toutes ses couleurs RVB et CMJN (rg, RG, k, K, sc, scn…) remplacées par leur gris (luminance
 * 0,299 R + 0,587 V + 0,114 B). Rend null si le flux porte une image en ligne (BI … EI) : ses octets ne se réécrivent pas à l'aveugle.
 * @param {string} texte @returns {string | null}
 */
function griserContenu(texte) {
  if (/(?:^|\s)BI(?:\s|$)/.test(texte)) return null;
  // CMJN d'abord (quatre nombres), puis RVB (trois) : « c m y k k » ne doit jamais être lu comme « m y k k ».
  const sans4 = texte.replace(RE_CMJN, (_, c, m, y, k, op) => {
    const [C, M, Y, K] = [c, m, y, k].map(Number);
    const g = (1 - Math.min(1, K)) * (0.299 * (1 - Math.min(1, C)) + 0.587 * (1 - Math.min(1, M)) + 0.114 * (1 - Math.min(1, Y)));
    return op === 'k' || op === 'K' ? `${fmt(g)} ${opGris(op)}` : `0 0 0 ${fmt(1 - g)} ${op}`;
  });
  return sans4.replace(RE_RVB, (_, r, g, b, op) => {
    const v = fmt(0.299 * Number(r) + 0.587 * Number(g) + 0.114 * Number(b));
    return op === 'rg' || op === 'RG' ? `${v} ${opGris(op)}` : `${v} ${v} ${v} ${op}`;
  });
}

/**
 * Le plan de la page en niveaux de gris : contenu de la page et formulaires (XObject Form) qu'elle appelle. Les images ne sont pas
 * touchées (l'extrait du site est vectoriel). Rend le nombre de flux réécrits (0 : plan laissé en couleur).
 * @param {any} doc @param {any} page @returns {Promise<number>}
 */
async function griserPage(doc, page) {
  const ctx = doc.context;
  let reecrits = 0;
  const vus = new Set();
  /** @param {any} flux @returns {string | null} */
  const lire = (flux) => { try { return Buffer.from(decodePDFRawStream(flux).decode()).toString('latin1'); } catch (_) { return null; } };
  // Contenu de la page : un ou plusieurs flux, réunis en un seul.
  const contenus = page.node.Contents();
  const flux = contenus instanceof PDFArray ? contenus.asArray().map((r) => ctx.lookup(r)) : (contenus ? [contenus] : []);
  const textes = flux.map((f) => (f instanceof PDFRawStream ? lire(f) : null));
  if (textes.length && textes.every((t) => t !== null)) {
    const gris = griserContenu(textes.join('\n'));
    if (gris !== null) { page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(Buffer.from(gris, 'latin1')))); reecrits++; }
  }
  /** @param {any} ressources */
  const formulaires = (ressources) => {
    const xo = ressources && ressources.lookupMaybe ? ressources.lookupMaybe(PDFName.of('XObject'), PDFDict) : null;
    if (!xo) return;
    for (const [, ref] of xo.entries()) {
      if (!(ref instanceof PDFRef) || vus.has(ref.tag)) continue;
      vus.add(ref.tag);
      const f = ctx.lookup(ref);
      if (!(f instanceof PDFRawStream) || String(f.dict.get(PDFName.of('Subtype'))) !== '/Form') continue;
      const t = lire(f);
      if (t === null) continue;
      const gris = griserContenu(t);
      if (gris !== null) {
        const entrees = {};
        for (const [k, v] of f.dict.entries()) { const n = String(k); if (!['/Length', '/Filter', '/DecodeParms'].includes(n)) entrees[n.slice(1)] = v; }
        ctx.assign(ref, ctx.flateStream(Buffer.from(gris, 'latin1'), entrees));
        reecrits++;
      }
      formulaires(f.dict.lookupMaybe(PDFName.of('Resources'), PDFDict));
    }
  };
  formulaires(page.node.Resources());
  return reecrits;
}

/**
 * Une copie de tout le contenu de la page, en formulaire (Form XObject), avec ses formulaires imbriqués copiés eux aussi : fonds blancs
 * retirés et gris teintés de jaune. Rend sa référence, ou null si un flux ne se relit pas (le surlignage reste alors les seules passes).
 * @param {any} doc @param {any} page
 */
async function copieTeinteePage(doc, page) {
  const ctx = doc.context;
  /** @param {any} flux @returns {string | null} */
  const lire = (flux) => { try { return Buffer.from(decodePDFRawStream(flux).decode()).toString('latin1'); } catch (_) { return null; } };
  const transformer = (t) => { const b = sansFondsBlancs(t); return b === null ? null : teinterContenu(b); };
  const copies = new Map();
  /** Les ressources avec chaque formulaire remplacé par sa copie teintée. @param {any} res @returns {any} */
  const ressources = (res) => {
    if (!res) return res;
    const xo = res.lookupMaybe ? res.lookupMaybe(PDFName.of('XObject'), PDFDict) : null;
    if (!xo) return res;
    const nouveau = ctx.obj({});
    for (const [k, ref] of xo.entries()) nouveau.set(k, ref instanceof PDFRef ? (formulaire(ref) || ref) : ref);
    const r2 = ctx.obj({});
    for (const [k, v] of res.entries()) r2.set(k, v);
    r2.set(PDFName.of('XObject'), nouveau);
    return r2;
  };
  /** @param {any} ref */
  function formulaire(ref) {
    if (copies.has(ref.tag)) return copies.get(ref.tag);
    copies.set(ref.tag, null);
    const f = ctx.lookup(ref);
    if (!(f instanceof PDFRawStream) || String(f.dict.get(PDFName.of('Subtype'))) !== '/Form') return null;
    const t = lire(f);
    const t2 = t === null ? null : transformer(t);
    if (t2 === null) return null;
    const entrees = {};
    for (const [k, v] of f.dict.entries()) { const n = String(k); if (!['/Length', '/Filter', '/DecodeParms', '/Resources'].includes(n)) entrees[n.slice(1)] = v; }
    const res = f.dict.lookupMaybe(PDFName.of('Resources'), PDFDict);
    if (res) entrees.Resources = ressources(res);
    const copie = ctx.register(ctx.flateStream(Buffer.from(t2, 'latin1'), entrees));
    copies.set(ref.tag, copie);
    return copie;
  }
  const contenus = page.node.Contents();
  const flux = contenus instanceof PDFArray ? contenus.asArray().map((r) => ctx.lookup(r)) : (contenus ? [contenus] : []);
  const textes = flux.map((x) => (x instanceof PDFRawStream ? lire(x) : null));
  if (!textes.length || textes.some((t) => t === null)) return null;
  const contenu = transformer(textes.join('\n'));
  if (contenu === null) return null;
  const { width, height } = page.getSize();
  return ctx.register(ctx.flateStream(Buffer.from(contenu, 'latin1'), {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, width, height], Resources: ressources(page.node.Resources())
  }));
}

/**
 * Le PDF du site avec les parcelles surlignées. Rend les octets du nouveau PDF.
 * @param {Uint8Array | Buffer} pdf @param {{ emprisePlan: number[] | null, centre: [number, number], echelle: number,
 *   parcelles: Array<{ section: string, numero: string, anneaux: Array<Array<[number, number]>>, trous?: Array<Array<[number, number]>> }> }} plan
 */
async function surlignerParcelles(pdf, plan) {
  const doc = await PDFDocument.load(pdf);
  const page = doc.getPage(0);
  const { width, height } = page.getSize();
  if (Math.abs(width - 595) > 3 || Math.abs(height - 842) > 3) throw new Error('Format inattendu : l’extrait du site n’est pas en A4 portrait.');
  // Sans l'emprise envoyée par le site, le centre du clic (la zone d'impression s'y centre) et la taille du cadre suffisent.
  // Fond du plan en niveaux de gris (étude 15/10 : « pour mieux voir les parcelles surlignées, passe le plan en noir et nuances de gris ») :
  // les couleurs du plan sont réécrites en gris AVANT la pose du jaune fluo, qui reste la seule couleur de la page.
  await griserPage(doc, page);
  const emprise = plan.emprisePlan || [plan.centre[0] - 1, plan.centre[1] - 1, plan.centre[0] + 1, plan.centre[1] + 1];
  const n = (v) => (Math.round(v * 100) / 100).toString();
  let encre = '';
  for (const p of plan.parcelles) {
    const versPage = (anneau) => /** @type {Array<[number, number]>} */ (anneau.map((q) => pointPage(q, emprise, plan.echelle, height)));
    const contours = p.anneaux.map(versPage).filter((c) => c.length >= 3);
    // Trous (une parcelle qui en entoure une autre, relecture 0.229.0) : jamais surlignés.
    const trous = (p.trous || []).map(versPage).filter((c) => c.length >= 3);
    if (!contours.length) continue;
    // Découpe : la parcelle seule, contours et trous en pair-impair.
    const chemin = [...contours, ...trous].map((c) => `${n(c[0][0])} ${n(c[0][1])} m ` + c.slice(1).map((q) => `${n(q[0])} ${n(q[1])} l`).join(' ') + ' h').join(' ');
    encre += `q ${chemin} W* n 1 J 1 j\n`;
    for (const [i, contour] of contours.entries()) {
      for (const [x1, y1, x2, y2, ep] of passesSurligneur(contour, `${p.section}${p.numero}-${i}`)) {
        encre += `${JAUNE_PASSES} RG ${n(ep)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S\n`;
      }
    }
    // Le long des bords intérieurs, comme on repasse les angles : la moitié intérieure du trait seulement (découpe).
    for (const contour of [...contours, ...trous]) {
      encre += `${JAUNE_BORD} RG 7 w ` + contour.map((q, j) => `${n(q[0])} ${n(q[1])} ${j ? 'l' : 'm'}`).join(' ') + ' h S\n';
    }
    encre += 'Q\n';
  }
  // Le plan redessiné DANS la parcelle, par-dessus les passes : fonds blancs retirés (les passes se voient dessous), couleurs déjà teintées
  // (bâtiments compris) ; traits et numéros restent noirs. Tout est opaque : rien à aplatir pour l'acte électronique.
  if (encre) {
    const copie = await copieTeinteePage(doc, page);
    // Sans copie (flux illisible, image en ligne) : jamais d'aplat opaque sans le plan dessus — le trait du bord seul (relecture 0.373.3).
    if (copie) encre = encre.replace(/Q\n/g, `/ClaireTeinte Do Q\n`);
    else encre = encre.split('\n').filter((l) => !l.startsWith(JAUNE_PASSES)).join('\n');
    const ctx = doc.context;
    const flux = ctx.register(ctx.flateStream(Buffer.from(encre, 'latin1')));
    const contenus = page.node.Contents();
    const avant = contenus instanceof PDFArray ? contenus.asArray() : [page.node.get(PDFName.of('Contents'))];
    // Le contenu du site entre « q » et « Q » : un « cm » ou une découpe laissés en place ne déplacent pas la parcelle.
    const ouvre = ctx.register(ctx.flateStream(Buffer.from('q\n', 'latin1')));
    const ferme = ctx.register(ctx.flateStream(Buffer.from('\nQ\n', 'latin1')));
    page.node.set(PDFName.of('Contents'), ctx.obj([ouvre, ...avant, ferme, flux]));
    if (copie) {
      const res = page.node.Resources();
      let xo = res.lookupMaybe(PDFName.of('XObject'), PDFDict);
      if (!xo) { xo = ctx.obj({}); res.set(PDFName.of('XObject'), xo); }
      xo.set(PDFName.of('ClaireTeinte'), copie);
    }
  }
  doc.setProducer('CLAIRE (surlignage) — extrait du plan cadastral cadastre.gouv.fr');
  return Buffer.from(await doc.save());
}

module.exports = { griserContenu, sansFondsBlancs, teinterContenu, surlignerParcelles, pointPage, passesSurligneur, aleatoire, CENTRE_CARTE_PT };
