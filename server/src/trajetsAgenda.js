// @ts-check
'use strict';
// Trajets d'un rendez-vous chez un confrère (étude 20/10) : une demi-heure avant et une demi-heure après, « Trajet - N km », N = la
// distance PAR LA ROUTE entre notre office et l'office du confrère.
// Distance : services ouverts de l'IGN (Géoplateforme) — géocodage des deux adresses puis itinéraire en voiture. Ne partent que les
// deux adresses d'offices notariaux (publiques, annuaire), jamais une donnée de client. Aucune IA. Distance non lue → « Trajet ».
// Liens rendez-vous ↔ trajets gardés sur le serveur (clé `trajets-agenda`) : déplacé ou retiré depuis CLAIRE, le rendez-vous emmène
// ses trajets.

const annuaire = require('./annuaireNotaires');

const CLE_TRAJETS_AGENDA = 'trajets-agenda';
const MAX_LIENS_TRAJETS = 300;
const GEOCODAGE = 'https://data.geopf.fr/geocodage/search';
const ITINERAIRE = 'https://data.geopf.fr/navigation/itineraire';
const DELAI_MS = 8000;
// Repli si l'annuaire ne porte pas l'office (relevé immonot du 02/10).
const ADRESSE_OFFICE_DEFAUT = '3 rue du Bout des Haies, 41000 Blois';

/** L'adresse de notre office, lue dans l'annuaire. */
function adresseOffice() {
  try {
    const o = annuaire.officesDepartement('41').find((x) => (x.notaires || []).some((n) => /gossart/i.test(String(n))));
    if (o && o.adresse && o.codePostal && o.ville) return `${o.adresse}, ${o.codePostal} ${o.ville}`;
  } catch (e) { /* annuaire illisible : repli */ }
  return ADRESSE_OFFICE_DEFAUT;
}

/** Pure : une adresse reçue du poste, nettoyée (texte court, sans caractère de contrôle). @param {unknown} v */
function adresseValide(v) {
  const t = String(v || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  return /\d{5}/.test(t) ? t : '';
}

/** @type {Map<string, { km: number, le: number }>} */
const cacheDistances = new Map();
const DUREE_CACHE_MS = 30 * 24 * 3600 * 1000;

/** Coordonnées [lon, lat] d'une adresse (géocodage IGN), ou null. @param {string} adresse @param {any} f */
async function geocoder(adresse, f) {
  const url = `${GEOCODAGE}?q=${encodeURIComponent(adresse)}&limit=1&index=address`;
  const r = await f(url, { signal: AbortSignal.timeout(DELAI_MS), headers: { Accept: 'application/json' } });
  if (!r || !r.ok) return null;
  const j = await r.json();
  const ft = j && Array.isArray(j.features) ? j.features[0] : null;
  const c = ft && ft.geometry && Array.isArray(ft.geometry.coordinates) ? ft.geometry.coordinates : null;
  // Une adresse trop mal reconnue (score bas) ne donne pas de distance : mieux vaut « Trajet » qu'un faux kilométrage.
  const score = ft && ft.properties ? Number(ft.properties.score) : 0;
  if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || !(score >= 0.5)) return null;
  return [c[0], c[1]];
}

/**
 * Distance par la route, en km arrondis, entre deux adresses — { ok, km } ou { ok: false, message }. Un seul essai, mis en cache.
 * @param {string} depart @param {string} arrivee @param {{ fetch?: any }} [injections]
 */
async function distanceRouteKm(depart, arrivee, injections = {}) {
  const cle = `${depart.toLowerCase()}|${arrivee.toLowerCase()}`;
  const garde = cacheDistances.get(cle);
  if (garde && Date.now() - garde.le < DUREE_CACHE_MS) return { ok: true, km: garde.km };
  const f = injections.fetch || fetch;
  try {
    const a = await geocoder(depart, f);
    const b = await geocoder(arrivee, f);
    if (!a || !b) return { ok: false, message: 'adresse non reconnue par le géocodage de l’IGN' };
    const url = `${ITINERAIRE}?resource=bdtopo-osrm&profile=car&optimization=fastest&start=${a[0]},${a[1]}&end=${b[0]},${b[1]}`
      + '&distanceUnit=kilometer&getSteps=false&getBbox=false&geometryFormat=geojson';
    const r = await f(url, { signal: AbortSignal.timeout(DELAI_MS), headers: { Accept: 'application/json' } });
    if (!r || !r.ok) return { ok: false, message: `itinéraire de l’IGN indisponible (${r ? r.status : 'sans réponse'})` };
    const j = await r.json();
    const km = Number(j && j.distance);
    if (!Number.isFinite(km) || km < 0 || km > 2000) return { ok: false, message: 'distance illisible dans la réponse de l’IGN' };
    const arrondi = Math.max(1, Math.round(km));
    cacheDistances.set(cle, { km: arrondi, le: Date.now() });
    return { ok: true, km: arrondi };
  } catch (e) {
    return { ok: false, message: 'service de l’IGN injoignable' };
  }
}

/** Pure : liens gardés, assainis (identifiants Exchange en texte, 300 au plus). @param {any} brut */
function assainirLiensTrajets(brut) {
  /** @type {Record<string, { trajets: Array<{ itemId: string, changeKey: string, sens: string }>, km: number|null, le: string }>} */
  const out = {};
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return out;
  const entrees = Object.entries(brut)
    .filter(([k, v]) => typeof k === 'string' && k && k.length < 400 && v && Array.isArray(v.trajets))
    .sort((x, y) => String(y[1].le || '').localeCompare(String(x[1].le || '')))
    .slice(0, MAX_LIENS_TRAJETS);
  for (const [k, v] of entrees) {
    const trajets = v.trajets
      .filter((t) => t && typeof t.itemId === 'string' && t.itemId && t.itemId.length < 400)
      .slice(0, 2)
      .map((t) => ({ itemId: t.itemId, changeKey: typeof t.changeKey === 'string' ? t.changeKey.slice(0, 400) : '', sens: t.sens === 'retour' ? 'retour' : 'aller' }));
    if (trajets.length) out[k] = { trajets, km: Number.isFinite(Number(v.km)) && Number(v.km) > 0 ? Number(v.km) : null, le: String(v.le || '').slice(0, 40) };
  }
  return out;
}

/** @param {any} repo */
function lireLiensTrajets(repo) {
  return assainirLiensTrajets(typeof repo.lireJsonBrut === 'function' ? repo.lireJsonBrut(CLE_TRAJETS_AGENDA, {}) : {});
}
/** @param {any} repo @param {any} liens */
function ecrireLiensTrajets(repo, liens) {
  if (typeof repo.ecrireJsonBrut === 'function') repo.ecrireJsonBrut(CLE_TRAJETS_AGENDA, assainirLiensTrajets(liens));
}

/** Pure : début et fin (instants EWS « …Z ») des deux trajets autour d'un rendez-vous. @param {string} debut @param {string} fin */
function horairesTrajetsAutour(debut, fin) {
  const a = Date.parse(debut);
  const b = Date.parse(fin);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const iso = (/** @type {number} */ n) => new Date(n).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const demi = 30 * 60000;
  return { aller: { debut: iso(a - demi), fin: iso(a) }, retour: { debut: iso(b), fin: iso(b + demi) } };
}

module.exports = {
  CLE_TRAJETS_AGENDA, ADRESSE_OFFICE_DEFAUT, adresseOffice, adresseValide, distanceRouteKm, assainirLiensTrajets,
  lireLiensTrajets, ecrireLiensTrajets, horairesTrajetsAutour
};
