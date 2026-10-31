// @ts-check
'use strict';

// Carte du Contrôle de l'urbanisme (étude 31/10 : « reproduire Géofoncier dans CLAIRE : la carte interactive pour voir les parcelles et
// les numéros, calculer des surfaces, fonds IGN ou photo aérienne, plan du cadastre, DVF pour voir les ventes, le service des numéros
// (adresse.data.gouv.fr), alignement, PC, PLU — l'outil ultime, simple et épuré »). Tout passe par le SERVEUR, comme le reste de
// l'urbanisme, et seulement vers des services publics ouverts, sans IA ni compte :
//   - tuiles de la Géoplateforme de l'IGN (plan IGN, photographies aériennes, parcellaire du cadastre avec ses numéros) ;
//   - API Carto de l'IGN (parcelle sous un point, zones du PLU d'une emprise, servitude d'alignement EL7 de la parcelle) ;
//   - géocodage inverse de la Géoplateforme et fiche de l'adresse à la Base adresse nationale (plateforme.adresse.data.gouv.fr : adresse
//     vérifiée par la commune, parcelles auxquelles elle est rattachée) ;
//   - DVF d'Etalab (ventes publiées d'une section cadastrale : date, prix, nature, surfaces — jamais un nom, DVF n'en a pas).
// NE PARTENT QUE : des coordonnées (un point cliqué, l'emprise affichée, un numéro de tuile), un code INSEE et une section. Jamais un nom,
// un dossier ni l'adresse d'un client. Les plans de bornage et les DMPC des géomètres-experts (Géofoncier) ne sont pas des données
// ouvertes : la carte donne un lien vers Géofoncier centré sur la parcelle, rien n'est repris de ce site.

const GEOPF = 'https://data.geopf.fr';
const APICARTO = 'https://apicarto.ign.fr/api';
const DVF = 'https://app.dvf.etalab.gouv.fr/api/mutations3';
const BAN_LOOKUP = 'https://plateforme.adresse.data.gouv.fr/lookup';
const DELAI_MS = 15000;

// Couches de tuiles permises — rien d'autre ne passe par la route (liste blanche).
const COUCHES_TUILES = {
  plan: { layer: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', format: 'image/png', zMin: 3, zMax: 19 },
  photo: { layer: 'ORTHOIMAGERY.ORTHOPHOTOS', format: 'image/jpeg', zMin: 3, zMax: 20 },
  cadastre: { layer: 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS', format: 'image/png', zMin: 13, zMax: 20 }
};

// Une image transparente de 1 × 1 : rendue quand l'IGN ne répond pas (la carte reste propre, sans image cassée).
const PNG_VIDE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// Caches SÉPARÉS par sorte (audit 0.416.0 : un seul Map dont chaque plafond purgeait les autres sortes) ; une demande déjà en cours est
// réunie avec la suivante ; au plus 8 requêtes simultanées vers les services de l'IGN et d'Etalab.
/** @type {Record<string, Map<string, { le: number, valeur: any }>>} */
const caches = { p: new Map(), z: new Map(), dvf: new Map(), ban: new Map() };
/** @type {Map<string, Promise<any>>} */
const enCours = new Map();
/** @param {'p'|'z'|'dvf'|'ban'} sorte @param {string} cle @param {number} dureeMs @param {number} max @param {() => Promise<any>} lire @param {(v: any) => boolean} [garder] */
async function enCache(sorte, cle, dureeMs, max, lire, garder) {
  const cache = caches[sorte];
  const c = cache.get(cle);
  if (c && Date.now() - c.le < dureeMs) { cache.delete(cle); cache.set(cle, c); return c.valeur; }
  const k = sorte + ':' + cle;
  const deja = enCours.get(k);
  if (deja) return deja;
  const p = lire().then((valeur) => {
    if (!garder || garder(valeur)) {
      cache.set(cle, { le: Date.now(), valeur });
      while (cache.size > max) cache.delete(/** @type {string} */ (cache.keys().next().value));
    }
    return valeur;
  }).finally(() => enCours.delete(k));
  enCours.set(k, p);
  return p;
}

const SIMULTANES_MAX = 8;
let actifs = 0;
/** @type {Array<() => void>} */
const attente = [];
/** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
async function borne(fn) {
  if (actifs >= SIMULTANES_MAX) await new Promise((ok) => attente.push(/** @type {() => void} */ (ok)));
  actifs++;
  try { return await fn(); } finally { actifs--; const suivant = attente.shift(); if (suivant) suivant(); }
}

// Tuiles : cache borné en OCTETS (60 Mo), le plus ancien lu sort d'abord ; délai court et coupe-circuit — l'IGN lent ou injoignable
// ne doit pas occuper les connexions du poste vers CLAIRE (audit 0.416.0).
const OCTETS_TUILES_MAX = 60 * 1024 * 1024;
const DELAI_TUILE_MS = 5000;
/** @type {Map<string, { type: string, octets: Buffer }>} */
const tuiles = new Map();
let octetsTuiles = 0;
let echecsTuiles = 0;
let tuilesCoupeesJusqua = 0;

/** @param {any} injections */
function fetchDe(injections) { return (injections && injections.fetch) || fetch; }

/** @param {string} url @param {any} injections @param {number} [delaiMs] */
async function lireJson(url, injections, delaiMs) {
  const r = await borne(() => fetchDe(injections)(url, { signal: AbortSignal.timeout(delaiMs || DELAI_MS), headers: { Accept: 'application/json' } }));
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
  const cle = `${t.couche}:${t.z}:${t.x}:${t.y}`;
  const deja = tuiles.get(cle);
  if (deja) { tuiles.delete(cle); tuiles.set(cle, deja); return deja; }
  const vide = { type: 'image/png', octets: PNG_VIDE, vide: true };
  if (Date.now() < tuilesCoupeesJusqua) return vide;
  const url = `${GEOPF}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${c.layer}&STYLE=normal&FORMAT=${encodeURIComponent(c.format)}`
    + `&TILEMATRIXSET=PM&TILEMATRIX=${t.z}&TILEROW=${t.y}&TILECOL=${t.x}`;
  const k = 't:' + cle;
  if (enCours.has(k)) return enCours.get(k);
  const p = (async () => {
    try {
      const r = await borne(() => fetchDe(injections)(url, { signal: AbortSignal.timeout(DELAI_TUILE_MS) }));
      if (!r.ok) { echecTuile(r.status >= 500); return vide; }
      const octets = Buffer.from(await r.arrayBuffer());
      if (octets.length > 2 * 1024 * 1024) return vide;
      echecsTuiles = 0;
      const valeur = { type: c.format, octets };
      tuiles.set(cle, valeur);
      octetsTuiles += octets.length;
      while (octetsTuiles > OCTETS_TUILES_MAX && tuiles.size) {
        const plusAncienne = /** @type {string} */ (tuiles.keys().next().value);
        octetsTuiles -= /** @type {any} */ (tuiles.get(plusAncienne)).octets.length;
        tuiles.delete(plusAncienne);
      }
      return valeur;
    } catch (_) {
      echecTuile(true);
      return vide;
    }
  })().finally(() => enCours.delete(k));
  enCours.set(k, p);
  return p;
}

/** Dix échecs de suite (réseau, délai, erreur du service) : plus aucune tuile demandée pendant une minute. @param {boolean} compte */
function echecTuile(compte) {
  if (!compte) return;
  if (++echecsTuiles >= 10) { tuilesCoupeesJusqua = Date.now() + 60000; echecsTuiles = 0; }
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

/** Pure : les adresses BAN d'une réponse du géocodage inverse, la plus proche d'abord. @param {any} geo */
function adressesDepuisReverse(geo) {
  return (geo && Array.isArray(geo.features) ? geo.features : []).map((f) => f && f.properties).filter((p) => p && p.label).map((p) => ({
    id: /^[0-9A-Za-z_]{5,40}$/.test(String(p.id || '')) ? String(p.id) : '',
    libelle: String(p.label), numero: String(p.housenumber || ''), voie: String(p.street || p.name || ''),
    distance: Number.isFinite(Number(p.distance)) ? Math.round(Number(p.distance)) : null
  }));
}
/** Pure : l'adresse BAN la plus proche (compatibilité). @param {any} geo */
function adresseDepuisReverse(geo) { return adressesDepuisReverse(geo)[0] || null; }

/** Pure : « ER 80 » d'après un identifiant cadastral de 14 caractères. @param {string} idu */
function parcelleLisible(idu) {
  const m = /^\d[0-9AB]\d{3}\d{3}([0-9A-Z]{2})(\d{4})$/.exec(String(idu || ''));
  return m ? `${m[1].replace(/^0(?=[A-Z])/, '')} ${Number(m[2])}` : String(idu || '');
}

/** Fiche BAN d'une adresse (étude 31/10, adresse.data.gouv.fr) : adresse vérifiée par la commune (`certifie`) et parcelles auxquelles la
 * commune l'a rattachée. Rien de nominatif : un identifiant d'adresse publique. @param {string} id @param {any} [injections] */
async function ficheBan(id, injections) {
  if (!/^[0-9A-Za-z_]{5,40}$/.test(String(id || ''))) return null;
  return enCache('ban', id, 24 * 3600 * 1000, 500, async () => {
    const d = await lireJson(`${BAN_LOOKUP}/${encodeURIComponent(id)}`, injections, 5000);
    return { certifie: d && d.certifie === true, parcelles: (d && Array.isArray(d.parcelles) ? d.parcelles : []).map(String).filter((x) => /^[0-9A-Z]{14}$/.test(x)).slice(0, 20) };
  });
}

/** L'adresse officielle d'une parcelle : parmi les numéros les plus proches, ceux que la commune a rattachés à CETTE parcelle ; sinon le plus
 * proche, avec la parcelle à laquelle il est rattaché (étude 31/10 : le numéro le plus proche peut être celui du voisin).
 * @param {any[]} proches @param {string} idu @param {any} [injections] */
async function adresseOfficielleParcelle(proches, idu, injections) {
  const liste = (proches || []).slice(0, 5);
  const fiches = await Promise.all(liste.map((a) => ficheBan(a.id, injections).catch(() => null)));
  const avec = liste.map((a, i) => {
    const f = fiches[i];
    const { id: _id, ...reste } = a;
    return Object.assign(reste, f ? { certifie: f.certifie, parcelles: f.parcelles.map(parcelleLisible), rattachee: !!idu && f.parcelles.includes(idu), banLue: true } : { banLue: false });
  });
  return { deLaParcelle: avec.filter((a) => a.rattachee), plusProche: avec[0] || null };
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

/** Ce qu'il y a sous un point cliqué : la parcelle (identifiant, section, numéro, contenance, contour), ses zones du PLU avec la part de
 * chacune (étude 31/10 : « comme le Géoportail, les pourcentages en zone A ou U »), le numéro de voie le plus proche (BAN) et l'alignement.
 * Chaque source manquante est dite « non lue », jamais devinée. @param {unknown} lon @param {unknown} lat @param {any} [injections] */
async function pointCarte(lon, lat, injections) {
  const p = pointValide(lon, lat);
  if (!p) return { erreur: 'Point hors de France.' };
  const geom = encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [p.lon, p.lat] }));
  return enCache('p', `${p.lon}:${p.lat}`, 3600 * 1000, 400, async () => {
    const [cad, adresse] = await Promise.allSettled([
      lireJson(`${APICARTO}/cadastre/parcelle?geom=${geom}`, injections),
      lireJson(`${GEOPF}/geocodage/reverse?lon=${p.lon}&lat=${p.lat}&limit=5&index=address`, injections)
    ]);
    const f = cad.status === 'fulfilled' && cad.value && Array.isArray(cad.value.features) ? cad.value.features[0] : null;
    const pp = (f && f.properties) || null;
    const parcelle = pp ? {
      idu: String(pp.idu || ''), insee: String(pp.code_insee || ''), commune: String(pp.nom_com || ''),
      section: String(pp.section || '').replace(/^0(?=[A-Z])/, ''), numero: String(Number(pp.numero) || pp.numero || ''),
      contenance: Number(pp.contenance) || null, geometry: f.geometry || null
    } : null;
    // Zones : celles qui touchent la parcelle (une seule lecture, qui donne aussi la part de chacune) ; sans parcelle, la zone sous le point.
    // Servitudes et zones lues ensemble (audit 0.416.0 : l'une après l'autre, la latence s'additionnait).
    const g = parcelle && parcelle.geometry ? encodeURIComponent(JSON.stringify(parcelle.geometry)) : '';
    const [zonesLues, supL, supS] = await Promise.allSettled([
      parcelle && parcelle.geometry ? require('./urbanisme').zonesAvecGeometrie(parcelle.geometry, injections) : lireJson(`${APICARTO}/gpu/zone-urba?geom=${geom}`, injections),
      g ? lireJson(`${APICARTO}/gpu/assiette-sup-l?geom=${g}`, injections) : Promise.reject(new Error('sans parcelle')),
      g ? lireJson(`${APICARTO}/gpu/assiette-sup-s?geom=${g}`, injections) : Promise.reject(new Error('sans parcelle'))
    ]);
    let zones = null;
    let zone = null;
    if (zonesLues.status === 'fulfilled') {
      if (parcelle && parcelle.geometry) {
        const touchees = /** @type {any[]} */ (zonesLues.value);
        zones = [];
        if (touchees.length) {
          try {
            const rep = require('./planAerien').repartitionZonage(parcelle.geometry, touchees);
            zones = rep.surface > 0 ? rep.zones.filter((z) => z.part >= 0.01).map((z) => ({ libelle: z.libelle, libelong: z.libelong, typezone: z.typezone, part: Math.round(z.part * 1000) / 1000 })) : [];
          } catch (_) { zones = touchees.map((z) => ({ libelle: z.libelle, libelong: z.libelong, typezone: z.typezone, part: null })); }
          if (!zones.length) zones = touchees.slice(0, 1).map((z) => ({ libelle: z.libelle, libelong: z.libelong, typezone: z.typezone, part: null }));
        }
        zone = zones[0] ? { libelle: zones[0].libelle, libelong: zones[0].libelong, typezone: zones[0].typezone } : null;
      } else {
        const z = zonesLues.value && Array.isArray(zonesLues.value.features) ? zonesLues.value.features[0] : null;
        zone = z && z.properties ? { libelle: String(z.properties.libelle || ''), libelong: String(z.properties.libelong || ''), typezone: String(z.properties.typezone || '') } : null;
      }
    }
    let adresses = { deLaParcelle: /** @type {any[]} */ ([]), plusProche: /** @type {any} */ (null) };
    if (adresse.status === 'fulfilled') {
      try { adresses = await adresseOfficielleParcelle(adressesDepuisReverse(adresse.value), parcelle ? parcelle.idu : '', injections); } catch (_) { /* fiches BAN non lues */ }
    }
    const alignement = !g || (supL.status === 'rejected' && supS.status === 'rejected') ? null
      : alignementDepuisSup(supL.status === 'fulfilled' ? supL.value : null, supS.status === 'fulfilled' ? supS.value : null);
    return {
      point: p,
      parcelle,
      cadastreLu: cad.status === 'fulfilled',
      zone,
      zones,
      zoneLue: zonesLues.status === 'fulfilled',
      adresse: adresses.plusProche,
      adressesParcelle: adresses.deLaParcelle,
      adresseLue: adresse.status === 'fulfilled',
      alignement
    };
  // Pas gardé si tout a échoué, ni si les fiches de la Base adresse nationale n'ont pas répondu (relu au clic suivant).
  }, (v) => (v.cadastreLu || v.zoneLue || v.adresseLue) && !(v.adresse && v.adresse.banLue === false));
}

/** Zones du PLU dans l'emprise affichée (contour, libellé, type). @param {unknown} emprise @param {any} [injections] */
async function zonesCarte(emprise, injections) {
  const e = empriseValide(emprise);
  if (!e) return { erreur: 'Emprise trop grande : rapprochez-vous pour voir les zones.' };
  const [o, s, est, n] = e;
  const geom = encodeURIComponent(JSON.stringify({ type: 'Polygon', coordinates: [[[o, s], [est, s], [est, n], [o, n], [o, s]]] }));
  return enCache('z', e.join(','), 3600 * 1000, 200, async () => {
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
  return enCache('dvf', `${code}:${sec}`, 24 * 3600 * 1000, 80, async () => ({ insee: code, section: sec, ventes: ventesDepuisDvf(await lireJson(`${DVF}/${code}/${sec}`, injections)) }));
}

function viderCacheCarte() { Object.values(caches).forEach((c) => c.clear()); tuiles.clear(); octetsTuiles = 0; echecsTuiles = 0; tuilesCoupeesJusqua = 0; enCours.clear(); }

module.exports = { COUCHES_TUILES, tuileValide, tuileIgn, pointValide, empriseValide, adresseDepuisReverse, adressesDepuisReverse, parcelleLisible, adresseOfficielleParcelle, alignementDepuisSup, pointCarte, zonesCarte, sectionDvf, ventesDepuisDvf, ventesSection, viderCacheCarte };
