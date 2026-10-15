// @ts-check
'use strict';

// Où déposer une déclaration d'intention d'aliéner (DIA) — étude 15/10 : « rechercher les guichets uniques (GNAU) des communes pour
// savoir où faire les demandes de DIA », d'abord pour le Loir-et-Cher, le Loiret, l'Indre-et-Loire, l'Indre et le Cher.
// Aucune liste nationale n'existe : chaque commune ou intercommunalité a son guichet (Cart@DS, GNAU d'agglomération, portail
// « DIA » réservé aux notaires…) ou reçoit la DIA par courriel ou courrier. La base `data/depot-dia.json` est construite par
// `scripts/assembler-depot-dia.js` à partir de recherches sur les pages officielles (chaque entrée garde sa `source` et sa date) ;
// une commune hérite de son intercommunalité, sauf exception. L'étude corrige ce qu'elle constate (clé `depot-dia`), ses
// corrections passent devant la base. La fiche de la mairie vient de l'annuaire du service public (données ouvertes) : ne part
// que le code INSEE de la commune. Rien n'est jamais déduit : sans page lue, « à vérifier ».

const BASE_ANNUAIRE = 'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records';
const DUREE_CACHE_MS = 24 * 3600 * 1000;
const DELAI_MS = 15000;
const CLE_CORRECTIONS = 'depot-dia';
const MODES = ['guichet', 'courriel', 'courrier', 'inconnu'];

/** @typedef {{ mode: string, plateforme: string, url: string, courriel: string, notairesSeulement: boolean, perimetre: string, note: string, source: string, verifieLe: string }} DepotDia */

let baseChargee = /** @type {any} */ (null);
/** La base livrée (chargée une fois ; `require` au chemin littéral pour que le .exe l'embarque). */
function baseDepotDia() {
  if (!baseChargee) baseChargee = require('./data/depot-dia.json');
  return baseChargee;
}

/** Pure : une adresse web https (ou http) bien formée, sinon ''. @param {unknown} v */
function urlSure(v) {
  const t = String(v || '').trim();
  if (!t || t.length > 400) return '';
  try { const u = new URL(t); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch (_) { return ''; }
}

/** Pure : un courriel simple, sinon ''. @param {unknown} v */
function courrielSur(v) {
  const t = String(v || '').trim().toLowerCase();
  return /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/.test(t) && t.length <= 120 ? t : '';
}

/** Pure : une entrée de dépôt assainie (champs connus seulement, tailles bornées). @param {any} e @returns {DepotDia} */
function assainirDepot(e) {
  const x = e && typeof e === 'object' ? e : {};
  const texte = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
  return {
    mode: MODES.includes(x.mode) ? x.mode : 'inconnu',
    plateforme: texte(x.plateforme, 60),
    url: urlSure(x.url),
    courriel: courrielSur(x.courriel),
    notairesSeulement: x.notairesSeulement === true,
    perimetre: texte(x.perimetre, 160),
    note: texte(x.note, 240),
    source: urlSure(x.source),
    verifieLe: /^\d{4}-\d{2}-\d{2}$/.test(String(x.verifieLe || '')) ? String(x.verifieLe) : ''
  };
}

/** Pure : le dépôt d'une commune — correction de l'étude, sinon exception de la commune, sinon son intercommunalité, sinon « à vérifier ».
 * @param {any} base @param {any} corrections { [insee]: entrée } @param {string} insee */
function depotPourCommune(base, corrections, insee) {
  const code = String(insee || '').toUpperCase();
  const c = base && base.communes && base.communes[code];
  if (!c) return { insee: code, connue: false, commune: '', epci: null, origine: 'aucun', depot: assainirDepot({}) };
  const epci = c.epci && base.epci && base.epci[c.epci] ? { code: c.epci, nom: String(base.epci[c.epci].nom || '') } : null;
  const corr = corrections && corrections[code];
  if (corr) return { insee: code, connue: true, commune: c.nom, epci, origine: 'etude', depot: assainirDepot(corr), modifieLe: String(corr.modifieLe || '') };
  if (c.depot) return { insee: code, connue: true, commune: c.nom, epci, origine: 'commune', depot: assainirDepot(c.depot) };
  if (epci && base.epci[epci.code].partiel) {
    // Le guichet de l'intercommunalité ne couvre que certaines communes : rien n'est affirmé pour celle-ci (le lien reste utile).
    const e = base.epci[epci.code];
    return { insee: code, connue: true, commune: c.nom, epci, origine: 'epci-partiel', depot: assainirDepot(Object.assign({}, e, { mode: 'inconnu', note: `${e.notePartiel || 'Guichet de l’intercommunalité pour certaines communes seulement.'} À vérifier pour cette commune.` })) };
  }
  if (epci) return { insee: code, connue: true, commune: c.nom, epci, origine: 'epci', depot: assainirDepot(base.epci[epci.code]) };
  return { insee: code, connue: true, commune: c.nom, epci, origine: 'aucun', depot: assainirDepot({}) };
}

/** Pure : la fiche de la mairie lue dans un enregistrement de l'annuaire du service public. @param {any} r */
function ficheMairieDepuisAnnuaire(r) {
  const liste = (v) => { try { const a = JSON.parse(String(v || '[]')); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
  const adr = liste(r && r.adresse);
  const a = adr.find((x) => x && x.type_adresse === 'Adresse') || adr[0] || {};
  const postale = adr.find((x) => x && /postale/i.test(String(x.type_adresse || ''))) || null;
  const ligne = (x) => x ? [x.numero_voie, x.service_distribution, `${x.code_postal || ''} ${x.nom_commune || ''}`.trim()].map((s) => String(s || '').trim()).filter(Boolean).join(', ') : '';
  const tel = liste(r && r.telephone)[0];
  const site = liste(r && r.site_internet)[0];
  return {
    nom: String((r && r.nom) || '').slice(0, 120),
    adresse: ligne(a),
    adressePostale: postale ? ligne(postale) : '',
    courriel: courrielSur(r && r.adresse_courriel),
    telephone: tel ? String(tel.valeur || '').slice(0, 30) : '',
    site: site ? urlSure(site.valeur) : ''
  };
}

/** @type {Map<string, { le: number, valeur: any, echec?: any }>} */
const cacheMairies = new Map();

/** La fiche de la mairie (annuaire du service public) ; null si introuvable. Ne part que le code INSEE.
 * @param {string} insee @param {any} [injections] */
async function ficheMairie(insee, injections) {
  const code = String(insee || '').toUpperCase();
  if (!/^\d[0-9AB]\d{3}$/.test(code)) return null;
  const c = cacheMairies.get(code);
  if (c && !c.echec && Date.now() - c.le < DUREE_CACHE_MS) return c.valeur;
  const f = (injections && injections.fetch) || fetch;
  const url = `${BASE_ANNUAIRE}?where=${encodeURIComponent(`code_insee_commune="${code}" and nom like "Mairie"`)}&limit=5&select=nom,site_internet,adresse_courriel,telephone,adresse`;
  if (c && c.echec && Date.now() - c.le < 5 * 60 * 1000) throw c.echec;
  let r;
  try { r = await f(url, { signal: AbortSignal.timeout(DELAI_MS), headers: { Accept: 'application/json' } }); }
  catch (e) { cacheMairies.set(code, { le: Date.now(), valeur: null, echec: e }); throw e; }
  if (!r.ok) { const e = new Error(`annuaire : réponse ${r.status}`); /** @type {any} */ (e).statut = r.status; throw e; }
  const j = await r.json();
  const liste = (j && Array.isArray(j.results) ? j.results : []);
  // « Mairie - Nom » ; une mairie annexe ou déléguée ne passe pas devant la mairie principale.
  const principale = liste.find((x) => /^mairie\s*-/i.test(String(x.nom || '')) && !/annexe|d[ée]l[ée]gu[ée]e/i.test(String(x.nom || ''))) || liste[0];
  const valeur = principale ? ficheMairieDepuisAnnuaire(principale) : null;
  cacheMairies.set(code, { le: Date.now(), valeur });
  if (cacheMairies.size > 400) cacheMairies.delete(/** @type {string} */ (cacheMairies.keys().next().value));
  return valeur;
}

/** Les corrections de l'étude. @param {any} parametresRepo */
function lireCorrections(parametresRepo) {
  const brut = parametresRepo.lireJsonBrut(CLE_CORRECTIONS, {});
  return brut && typeof brut === 'object' && brut.corrections && typeof brut.corrections === 'object' ? brut.corrections : {};
}

/** Enregistre ou retire (`entree` null) la correction d'une commune ; 400 communes au plus. @param {any} parametresRepo @param {string} insee @param {any} entree @param {string} par */
function ecrireCorrection(parametresRepo, insee, entree, par) {
  const corrections = Object.assign({}, lireCorrections(parametresRepo));
  if (!entree) delete corrections[insee];
  else {
    if (!corrections[insee] && Object.keys(corrections).length >= 400) throw Object.assign(new Error('Trop de corrections.'), { statut: 400 });
    corrections[insee] = Object.assign(assainirDepot(entree), { modifieLe: new Date().toISOString(), par: String(par || '').slice(0, 60) });
  }
  parametresRepo.ecrireJsonBrut(CLE_CORRECTIONS, { corrections });
  return corrections;
}

function viderCacheDepotDia() { cacheMairies.clear(); baseChargee = null; }

module.exports = { baseDepotDia, assainirDepot, depotPourCommune, ficheMairieDepuisAnnuaire, ficheMairie, lireCorrections, ecrireCorrection, urlSure, courrielSur, viderCacheDepotDia, MODES };
