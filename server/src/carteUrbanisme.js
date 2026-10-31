// @ts-check
'use strict';

// Carte du Contrôle de l'urbanisme (étude 31/10 : « reproduire Géofoncier dans CLAIRE : la carte interactive pour voir les parcelles et
// les numéros, calculer des surfaces, fonds IGN ou photo aérienne, plan du cadastre, DVF pour voir les ventes, le service des numéros
// (adresse.data.gouv.fr), alignement, PC, PLU — l'outil ultime, simple et épuré »). Tout passe par le SERVEUR, comme le reste de
// l'urbanisme, et seulement vers des services publics ouverts, sans IA ni compte :
//   - tuiles de la Géoplateforme de l'IGN (plan IGN, photographies aériennes, parcellaire du cadastre avec ses numéros) ;
//   - API Carto de l'IGN (parcelle sous un point, zones du PLU d'une emprise, servitude d'alignement EL7 de la parcelle) ;
//   - géocodage inverse de la Géoplateforme (Base adresse nationale : le numéro de voie le plus proche) ;
//   - DVF d'Etalab (ventes publiées d'une section cadastrale : date, prix, nature, surfaces — jamais un nom, DVF n'en a pas).
// NE PARTENT QUE : des coordonnées (un point cliqué, l'emprise affichée, un numéro de tuile), un code INSEE et une section. Jamais un nom,
// un dossier ni l'adresse d'un client. Les plans de bornage et les DMPC des géomètres-experts (Géofoncier) ne sont pas des données
// ouvertes : la carte donne un lien vers Géofoncier centré sur la parcelle, rien n'est repris de ce site.

const GEOPF = 'https://data.geopf.fr';
const APICARTO = 'https://apicarto.ign.fr/api';
const DVF = 'https://app.dvf.etalab.gouv.fr/api/mutations3';
const DELAI_MS = 15000;

// Couches de tuiles permises — rien d'autre ne passe par la route (liste blanche).
const COUCHES_TUILES = {
  plan: { layer: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', format: 'image/png', zMin: 3, zMax: 19 },
  photo: { layer: 'ORTHOIMAGERY.ORTHOPHOTOS', format: 'image/jpeg', zMin: 3, zMax: 20 },
  cadastre: { layer: 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS', format: 'image/png', zMin: 13, zMax: 20 }
};

// Une image transparente de 1 × 1 : rendue quand l'IGN ne répond pas (la carte reste propre, sans image cassée).
const PNG_VIDE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/** @type {Map<string, { le: number, valeur: any }>} */
const cache = new Map();
/** @param {string} cle @param {number} dureeMs @param {number} max @param {() => Promise<any>} lire */
async function enCache(cle, dureeMs, max, lire) {
  const c = cache.get(cle);
  if (c && Date.now() - c.le < dureeMs) { cache.delete(cle); cache.set(cle, c); return c.valeur; }
  const valeur = await lire();
  cache.set(cle, { le: Date.now(), valeur });
  while (cache.size > max) cache.delete(/** @type {string} */ (cache.keys().next().value));
  return valeur;
}

/** @param {any} injections */
function fetchDe(injections) { return (injections && injections.fetch) || fetch; }

/** @param {string} url @param {any} injections */
async function lireJson(url, injections) {
  const r = await fetchDe(injections)(url, { signal: AbortSignal.timeout(DELAI_MS), headers: { Accept: 'application/json' } });
  if (!r.ok) {
    const e = new Error(`réponse ${r.status}`);
    /** @type {any} */ (e).statut = r.status;
    throw e;
  }
  return r.json();
}

/** Pure : une tuile demandée est-elle permise ? { couche, z, x, y } ou null. @param {unknown} couche @param {unknown} z @param {unknown} x @param {unknown} y */
function tuileValide(couche, z, x, y) {
  const c = COUCHES_TUILES[String(couche)];
  const zz = Number(z); const xx = Number(x); const yy = Number(y);
  if (!c || !Number.isInteger(zz) || !Number.isInteger(xx) || !Number.isInteger(yy)) return null;
  if (zz < c.zMin || zz > c.zMax) return null;
  const n = 2 ** zz;
  if (xx < 0 || yy < 0 || xx >= n || yy >= n) return null;
  return { couche: String(couche), z: zz, x: xx, y: yy };
}

/** Une tuile de l'IGN : { type, octets } ; image transparente si l'IGN ne répond pas (jamais gardée dans ce cas).
 * @param {string} couche @param {number} z @param {number} x @param {number} y @param {any} [injections] */
async function tuileIgn(couche, z, x, y, injections) {
  const t = tuileValide(couche, z, x, y);
  if (!t) return null;
  const c = COUCHES_TUILES[t.couche];
  const cle = `t:${t.couche}:${t.z}:${t.x}:${t.y}`;
  const deja = cache.get(cle);
  if (deja) return deja.valeur;
  const url = `${GEOPF}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${c.layer}&STYLE=normal&FORMAT=${encodeURIComponent(c.format)}`
    + `&TILEMATRIXSET=PM&TILEMATRIX=${t.z}&TILEROW=${t.y}&TILECOL=${t.x}`;
  try {
    const r = await fetchDe(injections)(url, { signal: AbortSignal.timeout(DELAI_MS) });
    if (!r.ok) return { type: 'image/png', octets: PNG_VIDE, vide: true };
    const valeur = { type: c.format, octets: Buffer.from(await r.arrayBuffer()) };
    cache.set(cle, { le: Date.now(), valeur });
    while (cache.size > 3000) cache.delete(/** @type {string} */ (cache.keys().next().value));
    return valeur;
  } catch (_) {
    return { type: 'image/png', octets: PNG_VIDE, vide: true };
  }
}

/** Pure : un point en France (métropole et outre-mer larges) ? @param {unknown} lon @param {unknown} lat */
function pointValide(lon, lat) {
  const x = Number(lon); const y = Number(lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < -63 || x > 56 || y < -22 || y > 52) return null;
  return { lon: Math.round(x * 1e6) / 1e6, lat: Math.round(y * 1e6) / 1e6 };
}

/** Pure : une emprise « ouest,sud,est,nord » acceptable (2 km de côté au plus : les zones du PLU sont lourdes). @param {unknown} texte */
function empriseValide(texte) {
  const v = String(texte || '').split(',').map(Number);
  if (v.length !== 4 || v.some((n) => !Number.isFinite(n))) return null;
  const [o, s, e, n] = v;
  if (!pointValide(o, s) || !pointValide(e, n) || e <= o || n <= s) return null;
  if (e - o > 0.03 || n - s > 0.02) return null;
  return [o, s, e, n].map((x) => Math.round(x * 1e5) / 1e5);
}

/** Pure : l'adresse BAN la plus proche, d'une réponse du géocodage inverse. @param {any} geo */
function adresseDepuisReverse(geo) {
  const f = geo && Array.isArray(geo.features) ? geo.features[0] : null;
  const p = f && f.properties;
  if (!p || !p.label) return null;
  return { libelle: String(p.label), numero: String(p.housenumber || ''), voie: String(p.street || p.name || ''), distance: Number.isFinite(Number(p.distance)) ? Math.round(Number(p.distance)) : null };
}

/** Pure : servitudes d'alignement (EL7) d'une réponse assiette-sup du Géoportail. @param {...any} reponses */
function alignementDepuisSup(...reponses) {
  const vus = new Set();
  const liste = [];
  for (const r of reponses) {
    for (const f of (r && Array.isArray(r.features) ? r.features : [])) {
      const x = (f && f.properties) || {};
      if (String(x.suptype || '').toLowerCase() !== 'el7') continue;
      const nom = String(x.nomsuplitt || x.nomass || 'Plan d’alignement').trim();
      if (vus.has(nom)) continue;
      vus.add(nom);
      liste.push({ nom, acte: String(x.nomreg || x.datereg || '').trim() });
    }
  }
  return liste.slice(0, 5);
}

/** Ce qu'il y a sous un point cliqué : la parcelle (identifiant, section, numéro, contenance, contour), sa zone du PLU, le numéro de voie
 * le plus proche (BAN) et l'alignement. Chaque source manquante est dite « non lue », jamais devinée. @param {unknown} lon @param {unknown} lat @param {any} [injections] */
async function pointCarte(lon, lat, injections) {
  const p = pointValide(lon, lat);
  if (!p) return { erreur: 'Point hors de France.' };
  const geom = encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [p.lon, p.lat] }));
  return enCache(`p:${p.lon}:${p.lat}`, 3600 * 1000, 400, async () => {
    const [cad, zone, adresse] = await Promise.allSettled([
      lireJson(`${APICARTO}/cadastre/parcelle?geom=${geom}`, injections),
      lireJson(`${APICARTO}/gpu/zone-urba?geom=${geom}`, injections),
      lireJson(`${GEOPF}/geocodage/reverse?lon=${p.lon}&lat=${p.lat}&limit=1&index=address`, injections)
    ]);
    const f = cad.status === 'fulfilled' && cad.value && Array.isArray(cad.value.features) ? cad.value.features[0] : null;
    const pp = (f && f.properties) || null;
    const parcelle = pp ? {
      idu: String(pp.idu || ''), insee: String(pp.code_insee || ''), commune: String(pp.nom_com || ''),
      section: String(pp.section || '').replace(/^0(?=[A-Z])/, ''), numero: String(Number(pp.numero) || pp.numero || ''),
      contenance: Number(pp.contenance) || null, geometry: f.geometry || null
    } : null;
    const z = zone.status === 'fulfilled' && zone.value && Array.isArray(zone.value.features) ? zone.value.features[0] : null;
    let alignement = null;
    if (parcelle && parcelle.geometry) {
      const g = encodeURIComponent(JSON.stringify(parcelle.geometry));
      const sup = await Promise.allSettled([lireJson(`${APICARTO}/gpu/assiette-sup-l?geom=${g}`, injections), lireJson(`${APICARTO}/gpu/assiette-sup-s?geom=${g}`, injections)]);
      alignement = sup.every((s) => s.status === 'rejected') ? null : alignementDepuisSup(...sup.map((s) => s.status === 'fulfilled' ? s.value : null));
    }
    return {
      point: p,
      parcelle,
      cadastreLu: cad.status === 'fulfilled',
      zone: z && z.properties ? { libelle: String(z.properties.libelle || ''), libelong: String(z.properties.libelong || ''), typezone: String(z.properties.typezone || '') } : null,
      zoneLue: zone.status === 'fulfilled',
      adresse: adresse.status === 'fulfilled' ? adresseDepuisReverse(adresse.value) : null,
      adresseLue: adresse.status === 'fulfilled',
      alignement
    };
  });
}

/** Zones du PLU dans l'emprise affichée (contour, libellé, type). @param {unknown} emprise @param {any} [injections] */
async function zonesCarte(emprise, injections) {
  const e = empriseValide(emprise);
  if (!e) return { erreur: 'Emprise trop grande : rapprochez-vous pour voir les zones.' };
  const [o, s, est, n] = e;
  const geom = encodeURIComponent(JSON.stringify({ type: 'Polygon', coordinates: [[[o, s], [est, s], [est, n], [o, n], [o, s]]] }));
  return enCache(`z:${e.join(',')}`, 600 * 1000, 60, async () => {
    const r = await lireJson(`${APICARTO}/gpu/zone-urba?geom=${geom}`, injections);
    const zones = (r && Array.isArray(r.features) ? r.features : []).filter((f) => f && f.geometry).slice(0, 300).map((f) => ({
      type: 'Feature', geometry: f.geometry,
      properties: { libelle: String(f.properties && f.properties.libelle || ''), libelong: String(f.properties && f.properties.libelong || '').slice(0, 160), typezone: String(f.properties && f.properties.typezone || '') }
    }));
    return { type: 'FeatureCollection', features: zones };
  });
}

/** Pure : section DVF « 0000E », « 000AB » d'après la section du cadastre et le préfixe. @param {unknown} section @param {unknown} [prefixe] */
function sectionDvf(section, prefixe) {
  const s = String(section || '').trim().toUpperCase().replace(/\s+/g, '');
  const pre = String(prefixe || '000').replace(/\D/g, '').padStart(3, '0').slice(-3);
  if (!/^[0-9A-Z]{1,2}$/.test(s)) return null;
  return pre + (s.length === 1 ? '0' + s : s);
}

/** Pure : les mutations DVF regroupées par vente (une vente = plusieurs lignes : une par parcelle et par local), les plus récentes d'abord.
 * @param {any} reponse */
function ventesDepuisDvf(reponse) {
  const lignes = reponse && Array.isArray(reponse.mutations) ? reponse.mutations : [];
  const nombre = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
  const texte = (v) => { const t = String(v == null ? '' : v); return t === 'None' || t === 'nan' ? '' : t; };
  /** @type {Map<string, any>} */
  const ventes = new Map();
  for (const l of lignes) {
    const id = texte(l.id_mutation);
    if (!id) continue;
    let v = ventes.get(id);
    if (!v) {
      v = { id, date: texte(l.date_mutation), nature: texte(l.nature_mutation), prix: nombre(l.valeur_fonciere),
        adresse: [texte(l.adresse_numero) && texte(l.adresse_numero).replace(/\.0$/, ''), texte(l.adresse_suffixe), texte(l.adresse_nom_voie)].filter(Boolean).join(' '),
        parcelles: [], locaux: [], surfaceBati: 0, surfaceTerrain: 0, lon: nombre(l.longitude), lat: nombre(l.latitude) };
      ventes.set(id, v);
    }
    const idp = texte(l.id_parcelle);
    if (idp && !v.parcelles.includes(idp)) { v.parcelles.push(idp); v.surfaceTerrain += nombre(l.surface_terrain) || 0; }
    const type = texte(l.type_local);
    // DVF répète chaque local sur chaque parcelle de la vente : un local n'est compté qu'une fois (type, surface, pièces).
    const local = { type, surface: nombre(l.surface_reelle_bati), pieces: nombre(l.nombre_pieces_principales) };
    if (type && type !== 'Dépendance' && !v.locaux.some((x) => x.type === local.type && x.surface === local.surface && x.pieces === local.pieces)) {
      v.locaux.push(local);
      v.surfaceBati += local.surface || 0;
    } else if (type === 'Dépendance' && !v.locaux.some((x) => x.type === 'Dépendance')) v.locaux.push({ type, surface: null, pieces: null });
    if (!v.lon && nombre(l.longitude)) { v.lon = nombre(l.longitude); v.lat = nombre(l.latitude); }
  }
  return [...ventes.values()].map((v) => ({
    ...v, surfaceBati: v.surfaceBati || null, surfaceTerrain: v.surfaceTerrain || null,
    prixM2: v.prix && v.surfaceBati ? Math.round(v.prix / v.surfaceBati) : null
  })).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 300);
}

/** Ventes DVF d'une section cadastrale (Etalab). @param {unknown} insee @param {unknown} section @param {unknown} [prefixe] @param {any} [injections] */
async function ventesSection(insee, section, prefixe, injections) {
  const code = String(insee || '').trim().toUpperCase();
  const sec = sectionDvf(section, prefixe);
  if (!/^\d[0-9AB]\d{3}$/.test(code) || !sec) return { erreur: 'Commune ou section inconnue.' };
  return enCache(`dvf:${code}:${sec}`, 24 * 3600 * 1000, 80, async () => ({ insee: code, section: sec, ventes: ventesDepuisDvf(await lireJson(`${DVF}/${code}/${sec}`, injections)) }));
}

function viderCacheCarte() { cache.clear(); }

module.exports = { COUCHES_TUILES, tuileValide, tuileIgn, pointValide, empriseValide, adresseDepuisReverse, alignementDepuisSup, pointCarte, zonesCarte, sectionDvf, ventesDepuisDvf, ventesSection, viderCacheCarte };
