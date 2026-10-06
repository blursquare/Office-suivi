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

/** Pure : synthèse lue pour une parcelle. @param {any} parcelle @param {{ document: any, zones: any, infos: any, prescriptions: any, commune: any }} gpu */
function syntheseZonage(parcelle, gpu) {
  const p = parcelle && parcelle.properties ? parcelle.properties : {};
  const docs = proprietes(gpu.document, (x) => ({ type: String(x.du_type || ''), titre: String(x.grid_title || ''), partition: String(x.partition || '') }));
  const zones = proprietes(gpu.zones, (x) => ({ libelle: String(x.libelle || ''), libelong: String(x.libelong || ''), typezone: String(x.typezone || '') }));
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
    zones,
    infos: [...new Set(infos)].slice(0, 30),
    prescriptions: [...new Set(prescriptions)].slice(0, 30)
  };
}

/** Zonage d'une parcelle : géométrie au cadastre, puis le Géoportail de l'Urbanisme sur cette géométrie.
 * @param {string} insee @param {string} section @param {string} numero @param {any} [injections] */
async function zonageParcelle(insee, section, numero, injections) {
  const code = String(insee || '').trim().toUpperCase();
  const p = normaliserParcelle(section, numero);
  if (!/^\d[0-9AB]\d{3}$/.test(code) || !p) return { erreur: 'Commune ou parcelle invalide.' };
  return enCache(`z:${code}:${p.section}:${p.numero}`, async () => {
    const cad = await lireJson(`${BASE}/cadastre/parcelle?code_insee=${code}&section=${p.section}&numero=${p.numero}`, injections);
    const feature = cad && Array.isArray(cad.features) ? cad.features[0] : null;
    if (!feature || !feature.geometry) return { erreur: `Parcelle ${p.section} ${Number(p.numero)} introuvable au cadastre de cette commune.` };
    const geom = encodeURIComponent(JSON.stringify(feature.geometry));
    const [document, zones, infos, prescriptions, commune] = await Promise.all([
      lireJson(`${BASE}/gpu/document?geom=${geom}`, injections),
      lireJson(`${BASE}/gpu/zone-urba?geom=${geom}`, injections),
      lireJson(`${BASE}/gpu/info-surf?geom=${geom}`, injections).catch(() => null),
      lireJson(`${BASE}/gpu/prescription-surf?geom=${geom}`, injections).catch(() => null),
      lireJson(`${BASE}/gpu/municipality?insee=${code}`, injections).catch(() => null)
    ]);
    return syntheseZonage(feature, { document, zones, infos, prescriptions, commune });
  });
}

function viderCacheUrbanisme() { cache.clear(); }

module.exports = { normaliserParcelle, communesDuCodePostal, syntheseZonage, zonageParcelle, viderCacheUrbanisme };
