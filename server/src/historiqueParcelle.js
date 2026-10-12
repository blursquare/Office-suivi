// @ts-check
'use strict';

// Historique d'une parcelle (étude 08/10 : « oui » à l'affichage des photos aériennes dans le temps, « et recoupe aussi en
// cherchant sur Sitadel des traces de permis »), pour la section « Travaux et autorisations » du Contrôle de l'urbanisme.
// - Photos aériennes de l'IGN (Géoplateforme, WMS raster data.geopf.fr) : prises de vue anciennes (1950-1965 → 1980-1995),
//   mosaïques par période et millésimes annuels, demandées par le SERVEUR (le poste ne parle qu'au serveur) sur l'emprise de
//   la parcelle ; une année sans prise de vue sur la zone rend une image toute blanche → « pas de prise de vue ».
// - Sitadel (SDES, API DiDo, données publiques) : permis de construire et déclarations préalables créant des logements ou des
//   locaux, permis d'aménager, permis de démolir, depuis 2013, cherchés par commune + section + numéro de parcelle.
// NE PART QUE : le code INSEE de la commune, la section et le numéro de parcelle, ou l'emprise (coordonnées) de la parcelle —
// jamais un nom, une adresse ni un dossier. Les noms des demandeurs que Sitadel publie (personnes morales) ne sont pas demandés.

const { parcelleCadastre, normaliserParcelle } = require('./urbanisme');

const WMS = 'https://data.geopf.fr/wms-r';
const DIDO = 'https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1';
const JEU_SITADEL = '6513f0189d7d312c80ec5b5b';
const DELAI_MS = 20000;
const DUREE_CACHE_MS = 24 * 3600 * 1000;

// Les prises de vue proposées, de la plus ancienne à la plus récente. `format` : les anciennes sont en 4 bandes (PNG seul).
/** @type {Array<{ cle: string, libelle: string, couche: string, format: string, fin: number }>} */
const COUCHES_ORTHO = [
  { cle: '1950-1965', libelle: '1950-1965', couche: 'ORTHOIMAGERY.ORTHOPHOTOS.1950-1965', format: 'image/png', fin: 1965 },
  { cle: '1965-1980', libelle: '1965-1980', couche: 'ORTHOIMAGERY.ORTHOPHOTOS.1965-1980', format: 'image/png', fin: 1980 },
  { cle: '1980-1995', libelle: '1980-1995', couche: 'ORTHOIMAGERY.ORTHOPHOTOS.1980-1995', format: 'image/png', fin: 1995 },
  { cle: '2000-2005', libelle: '2000-2005', couche: 'ORTHOIMAGERY.ORTHOPHOTOS2000-2005', format: 'image/jpeg', fin: 2005 },
  { cle: '2006-2010', libelle: '2006-2010', couche: 'ORTHOIMAGERY.ORTHOPHOTOS2006-2010', format: 'image/jpeg', fin: 2010 },
  { cle: '2011-2015', libelle: '2011-2015', couche: 'ORTHOIMAGERY.ORTHOPHOTOS2011-2015', format: 'image/jpeg', fin: 2015 },
  { cle: '2016-2020', libelle: '2016-2020', couche: 'ORTHOIMAGERY.ORTHOPHOTOS2016-2020', format: 'image/jpeg', fin: 2020 },
  { cle: '2021-2023', libelle: '2021-2023', couche: 'ORTHOIMAGERY.ORTHOPHOTOS2021-2023', format: 'image/jpeg', fin: 2023 },
  ...Array.from({ length: 24 }, (_, i) => 2001 + i).map((a) => ({ cle: String(a), libelle: String(a), couche: `ORTHOIMAGERY.ORTHOPHOTOS${a}`, format: 'image/jpeg', fin: a })),
  { cle: 'actuelle', libelle: 'La plus récente', couche: 'ORTHOIMAGERY.ORTHOPHOTOS', format: 'image/jpeg', fin: 9999 }
];

/** @type {Map<string, { le: number, valeur: any }>} */
const cache = new Map();
/** @param {string} cle @param {() => Promise<any>} lire @param {number} [max] */
async function enCache(cle, lire, max = 300) {
  const c = cache.get(cle);
  if (c && Date.now() - c.le < DUREE_CACHE_MS) return c.valeur;
  const valeur = await lire();
  cache.set(cle, { le: Date.now(), valeur });
  if (cache.size > max) cache.delete(/** @type {string} */ (cache.keys().next().value));
  return valeur;
}

/** @param {any} injections */
function fetchDe(injections) { return (injections && injections.fetch) || fetch; }

/** Pure : « AL 839, AL 840 » → [{ section, numero }] (20 au plus). @param {unknown} texte */
function parcellesDepuisListe(texte) {
  const out = [];
  const vus = new Set();
  const brut = String(texte || '');
  for (const m of brut.toUpperCase().matchAll(/\b([0-9]?[A-Z]{1,2})\s*0*(\d{1,4})\b/g)) {
    // Saisie brute de l'outil : « et », « n » écrits en minuscules ne sont pas des sections (en capitales, N, ET… en sont).
    const ecrit = brut.slice(m.index, m.index + m[1].length);
    if (ecrit !== m[1] && /^(ET|OU|NO|N|DE|DU|LA|LE|AU|EN)$/.test(m[1])) continue;
    const p = normaliserParcelle(m[1], m[2]);
    if (!p || vus.has(p.section + p.numero)) continue;
    vus.add(p.section + p.numero);
    out.push(p);
    if (out.length >= 20) break;
  }
  return out;
}

/** Pure : les anneaux extérieurs d'une géométrie GeoJSON (Polygon ou MultiPolygon), en [lon, lat]. @param {any} g */
function anneauxGeometrie(g) {
  if (!g || !Array.isArray(g.coordinates)) return [];
  if (g.type === 'Polygon') return [g.coordinates[0]].filter(Array.isArray);
  if (g.type === 'MultiPolygon') return g.coordinates.map((p) => p && p[0]).filter(Array.isArray);
  return [];
}

/** Pure : emprise carrée autour des contours, avec une marge (au moins 40 m de demi-côté) — [minLon, minLat, maxLon, maxLat].
 * @param {Array<Array<[number, number]>>} anneaux */
function empriseContours(anneaux) {
  const pts = anneaux.flat().filter((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
  if (!pts.length) return null;
  const lons = pts.map((p) => p[0]); const lats = pts.map((p) => p[1]);
  const cLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const mLat = 111320; const mLon = 111320 * Math.cos(cLat * Math.PI / 180);
  const demiMetres = Math.max(40, 0.65 * Math.max((Math.max(...lons) - Math.min(...lons)) * mLon, (Math.max(...lats) - Math.min(...lats)) * mLat));
  const r = (x) => Math.round(x * 1e6) / 1e6;
  return [r(cLon - demiMetres / mLon), r(cLat - demiMetres / mLat), r(cLon + demiMetres / mLon), r(cLat + demiMetres / mLat)];
}

/** Pure : une emprise acceptable (France métropolitaine, 2 km au plus). @param {unknown} texte */
function empriseValide(texte) {
  const v = String(texte || '').split(',').map(Number);
  if (v.length !== 4 || v.some((x) => !isFinite(x))) return null;
  const [a, b, c, d] = v;
  if (a < -6 || c > 10 || b < 41 || d > 52 || c <= a || d <= b || c - a > 0.03 || d - b > 0.02) return null;
  return v;
}

/** Contours et emprise des parcelles d'une commune. @param {string} insee @param {string} parcelles @param {any} [injections] */
async function vueParcelles(insee, parcelles, injections) {
  const liste = parcellesDepuisListe(parcelles);
  if (!liste.length) return { erreur: 'Aucune parcelle.' };
  const features = await Promise.all(liste.map((p) => parcelleCadastre(insee, p.section, p.numero, injections).catch(() => null)));
  const contours = features.filter(Boolean).flatMap((f) => anneauxGeometrie(f.geometry));
  const emprise = empriseContours(contours);
  if (!emprise) return { erreur: 'Parcelle introuvable au cadastre de cette commune.' };
  return {
    emprise,
    contours: contours.map((a) => a.map((p) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6])),
    couches: COUCHES_ORTHO.map((c) => ({ cle: c.cle, libelle: c.libelle, fin: c.fin }))
  };
}

/** Pure : une image toute blanche (aucune prise de vue cette année-là sur la zone) — JPEG uni d'à peine quelques Ko.
 * @param {Uint8Array} octets @param {string} format */
function imageVide(octets, format) {
  return format === 'image/jpeg' ? octets.length < 6000 : octets.length < 2500;
}

/** Une photo aérienne de l'emprise : { type, octets } ou { vide: true }. @param {string} cle @param {string} emprise @param {any} [injections] */
async function photoAerienne(cle, emprise, injections) {
  const couche = COUCHES_ORTHO.find((c) => c.cle === cle);
  const e = empriseValide(emprise);
  if (!couche || !e) return { erreur: 'Prise de vue ou emprise invalide.' };
  return enCache(`o:${cle}:${e.join(',')}`, async () => {
    // WMS 1.3.0 en EPSG:4326 : l'ordre des axes est latitude, longitude.
    const url = `${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${couche.couche}&STYLES=&CRS=EPSG:4326`
      + `&BBOX=${e[1]},${e[0]},${e[3]},${e[2]}&WIDTH=512&HEIGHT=512&FORMAT=${encodeURIComponent(couche.format)}`;
    const r = await fetchDe(injections)(url, { signal: AbortSignal.timeout(DELAI_MS) });
    const type = String(r.headers.get('content-type') || '');
    if (!r.ok || !type.startsWith('image/')) {
      const err = new Error(`Géoplateforme : réponse ${r.status}`);
      /** @type {any} */ (err).statut = r.status;
      throw err;
    }
    const octets = new Uint8Array(await r.arrayBuffer());
    return imageVide(octets, couche.format) ? { vide: true } : { type, octets };
  }, 200);
}

// ---- Sitadel ------------------------------------------------------------------------------------------------------------

const ETATS_SITADEL = { 2: 'Autorisé', 4: 'Annulé', 5: 'Chantier commencé', 6: 'Achevé' };
const COLONNES_SITADEL = ['NUM_DAU', 'NUM_PA', 'NUM_PD', 'TYPE_DAU', 'ETAT_DAU', 'ETAT_PA', 'ETAT_PD', 'DATE_REELLE_AUTORISATION', 'DATE_REELLE_DOC',
  'DATE_REELLE_DAACT', 'SEC_CADASTRE1', 'NUM_CADASTRE1', 'SEC_CADASTRE2', 'NUM_CADASTRE2', 'SEC_CADASTRE3', 'NUM_CADASTRE3',
  'NATURE_PROJET_DECLAREE', 'I_EXTENSION', 'I_SURELEVATION', 'I_NIVSUPP', 'I_PISCINE', 'I_GARAGE', 'I_VERANDA', 'I_ABRI_JARDIN', 'I_AUTRE_ANNEXE',
  'NB_LGT_TOT_CREES', 'SURF_HAB_CREEE', 'SURF_HAB_DEMOLIE', 'SURF_LOC_CREEE'];

/** Les fichiers du jeu Sitadel et leur dernier millésime, gardés 24 h. @param {any} injections */
async function fichiersSitadel(injections) {
  return enCache('sitadel:fichiers', async () => {
    const r = await fetchDe(injections)(`${DIDO}/datasets/${JEU_SITADEL}`, { signal: AbortSignal.timeout(DELAI_MS), headers: { Accept: 'application/json' } });
    if (!r.ok) throw Object.assign(new Error(`Sitadel : réponse ${r.status}`), { statut: r.status });
    const d = await r.json();
    return (Array.isArray(d && d.datafiles) ? d.datafiles : []).map((f) => {
      const m = Array.isArray(f.millesimes) ? f.millesimes[f.millesimes.length - 1] : null;
      const noms = new Set(((m && m.columns) || []).map((c) => c && c.name));
      const titre = String(f.title || '');
      const sorte = /démolir/i.test(titre) ? 'PD' : /aménager/i.test(titre) ? 'PA' : /non résidentiels/i.test(titre) ? 'locaux' : 'logements';
      return { rid: String(f.rid || ''), millesime: m ? String(m.millesime || '') : '', sorte, colonnes: COLONNES_SITADEL.filter((c) => noms.has(c)) };
    }).filter((f) => f.rid && f.millesime);
  });
}

/** Pure : une ligne de Sitadel → ce que CLAIRE garde (jamais le demandeur). @param {any} l @param {string} sorte */
function autorisationSitadel(l, sorte) {
  const type = sorte === 'PA' ? 'PA' : sorte === 'PD' ? 'PD' : String(l.TYPE_DAU || '');
  const etat = Number(l.ETAT_DAU ?? l.ETAT_PA ?? l.ETAT_PD);
  const parcelles = [1, 2, 3].map((i) => l['SEC_CADASTRE' + i] && l['NUM_CADASTRE' + i] ? `${String(l['SEC_CADASTRE' + i]).replace(/^0/, '')} ${Number(l['NUM_CADASTRE' + i])}` : '').filter(Boolean);
  const travaux = [['I_EXTENSION', 'extension'], ['I_SURELEVATION', 'surélévation'], ['I_NIVSUPP', 'niveau supplémentaire'], ['I_PISCINE', 'piscine'],
    ['I_GARAGE', 'garage'], ['I_VERANDA', 'véranda'], ['I_ABRI_JARDIN', 'abri de jardin'], ['I_AUTRE_ANNEXE', 'autre annexe']]
    .filter(([c]) => l[c] === true).map(([, lib]) => lib);
  const nature = Number(l.NATURE_PROJET_DECLAREE) === 1 ? 'Nouvelle construction' : Number(l.NATURE_PROJET_DECLAREE) === 2 ? 'Travaux sur une construction existante' : '';
  return {
    type, numero: String(l.NUM_DAU || l.NUM_PA || l.NUM_PD || ''), sorte,
    etat: ETATS_SITADEL[etat] || '', autoriseLe: String(l.DATE_REELLE_AUTORISATION || ''), chantierLe: String(l.DATE_REELLE_DOC || ''),
    acheveLe: String(l.DATE_REELLE_DAACT || ''), parcelles, nature, travaux,
    logements: Number(l.NB_LGT_TOT_CREES) || 0, surfaceCreee: Number(l.SURF_HAB_CREEE || l.SURF_LOC_CREEE) || 0, surfaceDemolie: Number(l.SURF_HAB_DEMOLIE) || 0
  };
}

/** Pure : la ligne touche-t-elle une des parcelles cherchées ? @param {any} l @param {Array<{ section: string, numero: string }>} liste */
function ligneSurParcelles(l, liste) {
  const cles = new Set(liste.map((p) => `${p.section.replace(/^0/, '')}:${Number(p.numero)}`));
  return [1, 2, 3].some((i) => l['SEC_CADASTRE' + i] && cles.has(`${String(l['SEC_CADASTRE' + i]).toUpperCase().replace(/^0/, '')}:${Number(l['NUM_CADASTRE' + i])}`));
}

/** Les autorisations de Sitadel sur des parcelles d'une commune. @param {string} insee @param {string} parcelles @param {any} [injections] */
async function autorisationsSitadel(insee, parcelles, injections) {
  const code = String(insee || '').trim().toUpperCase();
  const liste = parcellesDepuisListe(parcelles);
  if (!/^\d[0-9AB]\d{3}$/.test(code) || !liste.length) return { erreur: 'Commune ou parcelle invalide.' };
  return enCache(`s:${code}:${liste.map((p) => p.section + p.numero).join(',')}`, async () => {
    const fichiers = await fichiersSitadel(injections);
    const sections = [...new Set(liste.flatMap((p) => [p.section, p.section.replace(/^0/, '')]))].join(',');
    const numeros = [...new Set(liste.flatMap((p) => [String(Number(p.numero)), p.numero]))].join(',');
    const requetes = fichiers.flatMap((f) => [1, 2, 3].map((i) => ({ f, i })));
    const lignes = await Promise.all(requetes.map(async ({ f, i }) => {
      const url = `${DIDO}/datafiles/${f.rid}/rows?millesime=${encodeURIComponent(f.millesime)}&pageSize=100&COMM=eq:${code}`
        + `&SEC_CADASTRE${i}=in:${encodeURIComponent(sections)}&NUM_CADASTRE${i}=in:${encodeURIComponent(numeros)}&columns=${f.colonnes.join(',')}`;
      const r = await fetchDe(injections)(url, { signal: AbortSignal.timeout(DELAI_MS), headers: { Accept: 'application/json' } });
      if (!r.ok) throw Object.assign(new Error(`Sitadel : réponse ${r.status}`), { statut: r.status });
      const d = await r.json();
      return (Array.isArray(d && d.data) ? d.data : []).filter((l) => ligneSurParcelles(l, liste)).map((l) => autorisationSitadel(l, f.sorte));
    }));
    const vus = new Set();
    const autorisations = lignes.flat().filter((a) => {
      const cle = a.type + a.numero;
      if (!a.numero || vus.has(cle)) return false;
      vus.add(cle);
      return true;
    }).sort((a, b) => String(b.autoriseLe).localeCompare(String(a.autoriseLe)));
    return { autorisations: autorisations.slice(0, 50), depuis: 2013 };
  });
}

function viderCacheHistorique() { cache.clear(); }

module.exports = {
  COUCHES_ORTHO, parcellesDepuisListe, anneauxGeometrie, empriseContours, empriseValide, vueParcelles, imageVide, photoAerienne,
  autorisationSitadel, ligneSurParcelles, autorisationsSitadel, viderCacheHistorique
};
