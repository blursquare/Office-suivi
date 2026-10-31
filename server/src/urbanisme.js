// @ts-check
'use strict';

// Zonage d'une parcelle (étude 06/10 : « essayer de récupérer le zonage de la parcelle sur une plateforme open source »),
// pour l'outil « Droits de préemption ». Source : API Carto de l'IGN (apicarto.ign.fr), données publiques —
// cadastre (géométrie de la parcelle) puis Géoportail de l'Urbanisme (document d'urbanisme, zone, informations et
// prescriptions qui touchent la parcelle). NE PART QUE : le code postal, ou le code INSEE de la commune + la section + le
// numéro de parcelle (données cadastrales publiques) — jamais un nom, une adresse ni un dossier. Réponses gardées en
// mémoire 24 h (une parcelle ne change pas de zone d'un jour à l'autre), un seul essai par demande.

const BASE = 'https://apicarto.ign.fr/api';
const DUREE_CACHE_MS = 24 * 3600 * 1000;
const MAX_CACHE = 500;
const DELAI_MS = 15000;

/** @type {Map<string, { le: number, valeur: any }>} */
const cache = new Map();

/** @param {string} cle @param {() => Promise<any>} lire */
async function enCache(cle, lire) {
  const c = cache.get(cle);
  if (c && Date.now() - c.le < DUREE_CACHE_MS) return c.valeur;
  const valeur = await lire();
  cache.set(cle, { le: Date.now(), valeur });
  if (cache.size > MAX_CACHE) cache.delete(/** @type {string} */ (cache.keys().next().value));
  return valeur;
}

/** @param {string} url @param {any} injections */
async function lireJson(url, injections) {
  const f = (injections && injections.fetch) || fetch;
  const r = await f(url, { signal: AbortSignal.timeout(DELAI_MS), headers: { Accept: 'application/json' } });
  if (!r.ok) {
    const e = new Error(`API Carto : réponse ${r.status}`);
    /** @type {any} */ (e).statut = r.status;
    throw e;
  }
  return r.json();
}

/** Pure : section « AL », « 0A », numéro sur 4 chiffres (exigé par API Carto). @param {unknown} section @param {unknown} numero */
function normaliserParcelle(section, numero) {
  const s = String(section || '').trim().toUpperCase().replace(/\s+/g, '');
  const n = String(numero || '').replace(/\D/g, '');
  if (!/^[0-9A-Z]{1,2}$/.test(s) || !n || n.length > 4) return null;
  return { section: s.length === 1 ? '0' + s : s, numero: n.padStart(4, '0') };
}

/** Communes d'un code postal. @param {string} cp @param {any} [injections] */
async function communesDuCodePostal(cp, injections) {
  const code = String(cp || '').trim();
  if (!/^\d{5}$/.test(code)) return [];
  const liste = await enCache(`cp:${code}`, () => lireJson(`${BASE}/codes-postaux/communes/${code}`, injections));
  return (Array.isArray(liste) ? liste : []).map((c) => ({ insee: String(c.codeCommune || ''), nom: String(c.nomCommune || '') }))
    .filter((c) => /^\d[0-9AB]\d{3}$/.test(c.insee));
}

/** Pure : les propriétés utiles des objets du Géoportail de l'Urbanisme. @param {any} geo @param {(p: any) => any} choisir */
function proprietes(geo, choisir) {
  return (geo && Array.isArray(geo.features) ? geo.features : []).map((f) => choisir((f && f.properties) || {}));
}

// Servitudes d'utilité publique du patrimoine (étude 08/10 : « le bien est-il en zone monument historique ? — information importante
// si les acquéreurs veulent faire des travaux »). Types du Géoportail de l'urbanisme : AC1 monuments historiques (le bien est dans
// le périmètre des abords, 500 m ou périmètre délimité), AC2 sites inscrits et classés, AC4 sites patrimoniaux remarquables.
const SUP_PATRIMOINE = { ac1: 'Monument historique', ac2: 'Site inscrit ou classé', ac4: 'Site patrimonial remarquable' };

/** Pure : les servitudes patrimoniales qui touchent la parcelle, sans doublon. @param {any} sup assiette-sup-s du Géoportail */
function patrimoineDepuisSup(sup) {
  const vus = new Set();
  /** @type {Array<{ type: string, libelle: string, nom: string, nature: string, rayon: number|null }>} */
  const liste = [];
  proprietes(sup, (x) => x).forEach((x) => {
    const type = String(x.suptype || '').toLowerCase();
    if (!SUP_PATRIMOINE[type]) return;
    const nom = String(x.nomsuplitt || '').trim();
    const nature = String(x.typeass || '').trim();
    const cle = `${type}|${nom}|${nature}`;
    if (vus.has(cle)) return;
    vus.add(cle);
    liste.push({ type, libelle: SUP_PATRIMOINE[type], nom, nature, rayon: Number(x.paramcalc) > 0 ? Number(x.paramcalc) : null });
  });
  return liste.slice(0, 20);
}

/** Pure : synthèse lue pour une parcelle. @param {any} parcelle @param {{ document: any, zones: any, infos: any, prescriptions: any, commune: any, sup?: any }} gpu */
// Une zone voisine que la parcelle ne fait que toucher (étude 19/10 : « une alerte pour une parcelle en zone A, mais en vérifiant je ne
// trouve pas » — le contour du PLU et celui du cadastre ne tombent jamais tout à fait l'un sur l'autre) : moins de 5 % de la parcelle et
// moins de 20 m². Elle n'est plus une zone de la parcelle, seulement dite « en bordure » ; les zones restantes sont rangées par part.
const PART_BORDURE = 0.05;
const SURFACE_BORDURE_M2 = 20;
/** Pure : { zones, bordures } d'après la part de chaque zone dans la parcelle ; sans contour lisible, les zones telles quelles.
 * @param {any} parcelle @param {any} geoZones @param {any[]} zones */
function zonesSansBordure(parcelle, geoZones, zones) {
  const features = geoZones && Array.isArray(geoZones.features) ? geoZones.features : [];
  if (!parcelle || !parcelle.geometry || zones.length < 2 || features.length !== zones.length || !features.every((f) => f && f.geometry)) return { zones, bordures: [] };
  let rep;
  try {
    rep = require('./planAerien').repartitionZonage(parcelle.geometry, features.map((f, i) => Object.assign({}, zones[i], { geometry: f.geometry })));
  } catch (_) { return { zones, bordures: [] }; }
  if (!rep || !(rep.surface > 0)) return { zones, bordures: [] };
  const partDe = (/** @type {any} */ z) => rep.zones.find((x) => x.libelle === z.libelle && x.typezone === z.typezone && x.libelong === z.libelong);
  const avec = zones.map((z) => { const r = partDe(z); return Object.assign({}, z, { part: r ? Math.round(r.part * 1000) / 1000 : 0, surface: r ? Math.round(r.surface) : 0 }); });
  const bord = (/** @type {any} */ z) => z.part < PART_BORDURE && z.surface < SURFACE_BORDURE_M2;
  const gardees = avec.filter((z) => !bord(z)).sort((a, b) => b.part - a.part);
  // Jamais aucune zone : la plus grande reste.
  if (!gardees.length) return { zones: avec.sort((a, b) => b.part - a.part).slice(0, 1), bordures: [] };
  return { zones: gardees, bordures: avec.filter(bord).map((z) => ({ libelle: z.libelle, typezone: z.typezone, part: z.part, surface: z.surface })) };
}

/** Pure : le droit de préemption urbain lu dans les « informations » du document d'urbanisme (étude 31/10 : « retrouver en fonction des
 * mairies s'il y a un droit de préemption renforcé »). Les communes qui versent leurs périmètres au Géoportail y portent une information
 * « Droit de préemption urbain » ; « renforcé » se lit dans son libellé. Rien de publié ne veut pas dire « pas de DPU » (`lu` seulement).
 * @param {any} infos @returns {{ lu: boolean, perimetre: boolean, renforce: boolean, libelles: string[] }} */
function dpuDepuisInfos(infos) {
  const lu = !!(infos && Array.isArray(infos.features));
  const liste = proprietes(infos, (x) => [String(x.libelle || ''), String(x.libelong || '')].join(' — ').replace(/^ — | — $/g, '').trim()).filter(Boolean);
  const dpu = liste.filter((t) => /pr[ée]emption/i.test(t) && !/commerc|artisan|fonds de commerce|espaces?\s+naturels?|\bENS\b|SAFER|agricole|for[êe]t/i.test(t));
  return { lu, perimetre: dpu.length > 0, renforce: dpu.some((t) => /renforc/i.test(t)), libelles: [...new Set(dpu)].slice(0, 5) };
}

function syntheseZonage(parcelle, gpu) {
  const p = parcelle && parcelle.properties ? parcelle.properties : {};
  const docs = proprietes(gpu.document, (x) => ({ type: String(x.du_type || ''), titre: String(x.grid_title || ''), partition: String(x.partition || '') }));
  const toutes = proprietes(gpu.zones, (x) => ({ libelle: String(x.libelle || ''), libelong: String(x.libelong || ''), typezone: String(x.typezone || '') }));
  const { zones, bordures } = zonesSansBordure(parcelle, gpu.zones, toutes);
  const infos = proprietes(gpu.infos, (x) => String(x.libelle || '')).filter(Boolean);
  const prescriptions = proprietes(gpu.prescriptions, (x) => String(x.libelle || '')).filter(Boolean);
  const commune = proprietes(gpu.commune, (x) => ({ nom: String(x.name || ''), rnu: x.is_rnu === true }))[0] || null;
  const partition = (docs[0] && docs[0].partition) || '';
  const siren = (/^DU_(\d{9})$/.exec(partition) || [])[1] || '';
  return {
    parcelle: { idu: String(p.idu || ''), section: String(p.section || ''), numero: String(p.numero || ''), contenance: Number(p.contenance) || null, commune: String(p.nom_com || '') },
    document: docs[0] || null,
    epciSiren: siren,
    rnu: !!(commune && commune.rnu),
    // `lu` : la couche des servitudes a répondu ; sans réponse, « aucune servitude » ne veut rien dire.
    patrimoine: { lu: !!(gpu.sup && Array.isArray(gpu.sup.features)), servitudes: patrimoineDepuisSup(gpu.sup) },
    dpu: dpuDepuisInfos(gpu.infos),
    zones,
    bordures,
    infos: [...new Set(infos)].slice(0, 30),
    prescriptions: [...new Set(prescriptions)].slice(0, 30)
  };
}

/** Les sections cadastrales d'une commune (feuilles du cadastre, API Carto), triées ; [] si l'API ne répond pas.
 * @param {string} insee @param {any} [injections] @returns {Promise<string[]>} */
async function sectionsDeLaCommune(insee, injections) {
  try {
    return await enCache(`s:${insee}`, async () => {
      const r = await lireJson(`${BASE}/cadastre/division?code_insee=${insee}&_limit=1000`, injections);
      const sections = (r && Array.isArray(r.features) ? r.features : []).map((f) => String((f && f.properties && f.properties.section) || '').trim().toUpperCase())
        .filter((x) => /^[0-9A-Z]{1,2}$/.test(x)).map((x) => x.length === 1 ? '0' + x : x);
      return [...new Set(sections)].sort();
    });
  } catch (e) {
    return [];
  }
}

/** Pure : le message d'une parcelle introuvable (rapport du 18/10 : « Chailles n'a pas de section ZD, seulement AB à BA ») — la section qui
 * n'existe pas est dite avec celles de la commune. @param {{ section: string, numero: string }} p @param {string[]} sections */
function parcelleIntrouvable(p, sections) {
  const lisible = (x) => x.replace(/^0/, '');
  const base = `Parcelle ${lisible(p.section)} ${Number(p.numero)} introuvable au cadastre de cette commune.`;
  if (!sections.length) return { erreur: base };
  if (sections.indexOf(p.section) !== -1) return { erreur: `${base} La section ${lisible(p.section)} existe : vérifiez le numéro.`, sections: sections.map(lisible) };
  const liste = sections.length > 24 ? sections.slice(0, 24).map(lisible).join(', ') + '…' : sections.map(lisible).join(', ');
  return { erreur: `${base} Pas de section ${lisible(p.section)} dans cette commune ; sections existantes : ${liste} (${sections.length}).`, sections: sections.map(lisible) };
}

/** Zonage d'une parcelle : géométrie au cadastre, puis le Géoportail de l'Urbanisme sur cette géométrie.
 * @param {string} insee @param {string} section @param {string} numero @param {any} [injections] */
async function zonageParcelle(insee, section, numero, injections) {
  const code = String(insee || '').trim().toUpperCase();
  const p = normaliserParcelle(section, numero);
  if (!/^\d[0-9AB]\d{3}$/.test(code) || !p) return { erreur: 'Commune ou parcelle invalide.' };
  const cle = `z:${code}:${p.section}:${p.numero}`;
  const resultat = await enCache(cle, async () => {
    const cad = await lireJson(`${BASE}/cadastre/parcelle?code_insee=${code}&section=${p.section}&numero=${p.numero}`, injections);
    const feature = cad && Array.isArray(cad.features) ? cad.features[0] : null;
    if (!feature || !feature.geometry) return parcelleIntrouvable(p, await sectionsDeLaCommune(code, injections));
    const geom = encodeURIComponent(JSON.stringify(feature.geometry));
    const [document, zones, infos, prescriptions, commune, sup] = await Promise.all([
      lireJson(`${BASE}/gpu/document?geom=${geom}`, injections),
      lireJson(`${BASE}/gpu/zone-urba?geom=${geom}`, injections),
      lireJson(`${BASE}/gpu/info-surf?geom=${geom}`, injections).catch(() => null),
      lireJson(`${BASE}/gpu/prescription-surf?geom=${geom}`, injections).catch(() => null),
      lireJson(`${BASE}/gpu/municipality?insee=${code}`, injections).catch(() => null),
      lireJson(`${BASE}/gpu/assiette-sup-s?geom=${geom}`, injections).catch(() => null)
    ]);
    return syntheseZonage(feature, { document, zones, infos, prescriptions, commune, sup });
  });
  // Introuvable sans la liste des sections (API muette) : pas gardé 24 h, la demande suivante relira les sections.
  if (resultat && resultat.erreur && !resultat.sections) cache.delete(cle);
  return resultat;
}

/** Géométrie d'une parcelle au cadastre (API Carto), gardée 24 h — pour les photos aériennes et Sitadel.
 * @param {string} insee @param {string} section @param {string} numero @param {any} [injections] */
async function parcelleCadastre(insee, section, numero, injections) {
  const code = String(insee || '').trim().toUpperCase();
  const p = normaliserParcelle(section, numero);
  if (!/^\d[0-9AB]\d{3}$/.test(code) || !p) return null;
  return enCache(`c:${code}:${p.section}:${p.numero}`, async () => {
    const cad = await lireJson(`${BASE}/cadastre/parcelle?code_insee=${code}&section=${p.section}&numero=${p.numero}`, injections);
    const feature = cad && Array.isArray(cad.features) ? cad.features[0] : null;
    return feature && feature.geometry ? feature : null;
  });
}

/** @type {Map<string, { le: number, valeur: any }>} */
const cacheZones = new Map();
const DUREE_CACHE_ZONES_MS = 10 * 60 * 1000;

/** Zones du document d'urbanisme (Géoportail de l'urbanisme) qui touchent une géométrie, AVEC leur contour — pour mesurer la part de
 * chaque zone dans une parcelle (plan aérien, étude 15/10). @param {any} geometrie GeoJSON en degrés @param {any} [injections] */
async function zonesAvecGeometrie(geometrie, injections) {
  const geom = encodeURIComponent(JSON.stringify(geometrie));
  // Cache à part (les contours de zone sont lourds) : clé = empreinte de la géométrie, peu d'entrées, quelques minutes.
  const cle = require('node:crypto').createHash('sha1').update(geom).digest('hex');
  const c = cacheZones.get(cle);
  if (c && Date.now() - c.le < DUREE_CACHE_ZONES_MS) return c.valeur;
  const r = await lireJson(`${BASE}/gpu/zone-urba?geom=${geom}`, injections);
  const valeur = (r && Array.isArray(r.features) ? r.features : []).filter((f) => f && f.geometry).map((f) => ({
    libelle: String((f.properties && f.properties.libelle) || ''), libelong: String((f.properties && f.properties.libelong) || ''),
    typezone: String((f.properties && f.properties.typezone) || ''), geometry: f.geometry
  }));
  cacheZones.set(cle, { le: Date.now(), valeur });
  if (cacheZones.size > 30) cacheZones.delete(/** @type {string} */ (cacheZones.keys().next().value));
  return valeur;
}

/** Les parcelles du cadastre dans un polygone (le cadre d'un plan), 600 au plus. @param {any} polygone GeoJSON @param {any} [injections] */
async function parcellesDansPolygone(polygone, injections) {
  const geom = encodeURIComponent(JSON.stringify(polygone));
  const r = await lireJson(`${BASE}/cadastre/parcelle?geom=${geom}&_limit=600`, injections);
  return (r && Array.isArray(r.features) ? r.features : []).filter((f) => f && f.geometry);
}

function viderCacheUrbanisme() { cache.clear(); cacheZones.clear(); }

module.exports = { dpuDepuisInfos, zonesSansBordure, parcelleIntrouvable, sectionsDeLaCommune, zonesAvecGeometrie, parcellesDansPolygone, normaliserParcelle, parcelleCadastre, communesDuCodePostal, syntheseZonage, patrimoineDepuisSup, zonageParcelle, viderCacheUrbanisme };
