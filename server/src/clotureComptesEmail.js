// @ts-check
'use strict';
// Clôture / transfert des comptes d'une succession envoyé à la banque (étude 16/10 : « tu pourras valider l'envoi de la clôture ou
// transfert des comptes à la banque en croisant dans Authentic la création du courrier de clôture et l'e-mail d'envoi à la banque en
// lisant les emails envoyés »).
//
// Deux signaux, jamais un seul :
//   1. un courrier de clôture ou de transfert des comptes relevé dans Authentic (`d.authentic.courriersBanque`, client/74
//      `courriersBanqueSuccessionAuthentic` : intitulé, date de création) ;
//   2. un email ENVOYÉ par l'étude (« Éléments envoyés », objet + destinataires + date seulement, jamais le texte) :
//      - le jour de la création du courrier ou dans les 30 jours qui suivent ;
//      - à une adresse qui n'est ni celle d'un héritier de la fiche, ni une adresse de l'étude (la banque n'est pas sur la fiche) ;
//      - dont l'objet (ou le nom d'une pièce jointe) nomme la succession — un mot du nom du dossier ou du défunt.
// Un email qui désignerait plusieurs successions ne coche rien. L'étape cochée est « Transfert des comptes » avec un conjoint
// survivant, sinon « Déblocage des fonds auprès des banques » ; une seule détection par dossier (`d.detectionsEmails.clotureComptes`) :
// décochée ensuite à la main, elle n'est jamais recochée.
// Les emails envoyés qui ne se rattachent à aucun dossier sont gardés 45 jours (objet, destinataires, date) pour le cas où le
// courrier d'Authentic n'est relevé qu'après l'envoi.

const { estSuccession } = require('../../commun/dossier');
const { conjointSurvivant, etapeSuccessionValidee } = require('../../commun/succession');
const { adressesDuDossier, normaliser } = require('./emailsMatin');

const JOURS_APRES_COURRIER = 30;
const JOURS_GARDE_ENVOIS = 45;
const MAX_ENVOIS_GARDES = 400;
// Mots du nom d'une succession qui ne la désignent pas.
const MOTS_VIDES = new Set(['SUCC', 'SUCCESSION', 'VEUVE', 'VEUF', 'EPOUSE', 'EPOUX', 'NEE', 'NE', 'DIVORCE', 'DIVORCEE', 'DES', 'DE', 'DU', 'LA', 'LE', 'LES', 'ET',
  'MONSIEUR', 'MADAME', 'MME', 'MLLE', 'CONSORTS', 'CONSORT', 'FEU', 'DEFUNT', 'DEFUNTE', 'DOSSIER', 'COMPTE', 'COMPTES']);

/** Date du jour en heure de Paris (AAAA-MM-JJ). @param {string} iso */
function jourParis(iso) {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

/** @param {string} iso @param {number} n */
function plusJours(iso, n) {
  const t = Date.parse(iso + 'T12:00:00Z');
  return Number.isNaN(t) ? '' : new Date(t + n * 86400000).toISOString().slice(0, 10);
}

/** L'étape à cocher pour cette succession. @param {any} d */
function etapeClotureComptes(d) {
  return conjointSurvivant(d) ? 'transfertComptes' : 'deblocageFonds';
}

/** Les mots (≥ 3 lettres, capitales sans accent) qui désignent la succession : nom du dossier et nom du défunt. @param {any} d */
function motsSuccession(d) {
  const brut = [d && d.nom, d && d.defunt && d.defunt.nom].filter(Boolean).join(' ');
  return [...new Set(normaliser(brut).split(/[^A-Z]+/).filter((m) => m.length >= 3 && !MOTS_VIDES.has(m)))];
}

/** Les courriers de clôture / transfert relevés dans Authentic, datés. @param {any} d */
function courriersClotureDossier(d) {
  const l = d && d.authentic && Array.isArray(d.authentic.courriersBanque) ? d.authentic.courriersBanque : [];
  return l.filter((/** @type {any} */ c) => c && /^\d{4}-\d{2}-\d{2}$/.test(String(c.date || '')));
}

/** La succession attend-elle encore cette détection ? Pure. @param {any} d */
function successionACocher(d) {
  if (!d || d.archive || d.deleted || !estSuccession(d)) return false;
  if (d.detectionsEmails && d.detectionsEmails.clotureComptes) return false;
  if (etapeSuccessionValidee(d, etapeClotureComptes(d))) return false;
  return courriersClotureDossier(d).length > 0;
}

/**
 * Le courrier d'Authentic que cet email envoyé transmet à la banque, ou null. Pure.
 * @param {any} d
 * @param {{ objet: string, a?: string[], date: string, pjNoms?: string[] }} envoye
 * @param {(a: string) => boolean} [adresseEtude]
 */
function courrierEnvoyeParEmail(d, envoye, adresseEtude) {
  if (!successionACocher(d) || !envoye) return null;
  const a = (envoye.a || []).map((x) => String(x).toLowerCase()).filter((x) => /@/.test(x));
  if (!a.length) return null;
  const heritiers = new Set(adressesDuDossier(d));
  // Tous les destinataires hors de la fiche et hors de l'étude : un email aux héritiers n'est pas l'envoi à la banque.
  if (a.some((x) => heritiers.has(x) || (adresseEtude && adresseEtude(x)))) return null;
  const mots = motsSuccession(d);
  const texte = normaliser([envoye.objet, ...(envoye.pjNoms || [])].join(' '));
  if (!mots.some((m) => new RegExp(`(^|[^A-Z])${m}([^A-Z]|$)`).test(texte))) return null;
  const jour = jourParis(envoye.date);
  if (!jour) return null;
  return courriersClotureDossier(d).find((c) => jour >= c.date && jour <= plusJours(c.date, JOURS_APRES_COURRIER)) || null;
}

/**
 * La seule succession (parmi `dossiers`) dont cet email transmet le courrier de clôture / transfert, ou null (aucune, ou plusieurs). Pure.
 * @param {any[]} dossiers @param {any} envoye @param {(a: string) => boolean} [adresseEtude]
 * @returns {{ d: any, courrier: any } | null}
 */
function successionDeEnvoiBanque(dossiers, envoye, adresseEtude) {
  const trouves = [];
  for (const d of dossiers || []) {
    const courrier = courrierEnvoyeParEmail(d, envoye, adresseEtude);
    if (courrier) trouves.push({ d, courrier });
  }
  return trouves.length === 1 ? trouves[0] : null;
}

/**
 * Coche l'étape (comme un clic sur la fiche) et le dit dans l'historique. Rend vrai si coché.
 * @param {any} d @param {any} courrier @param {{ objet: string, date: string }} envoye
 */
function cocherClotureComptes(d, courrier, envoye) {
  if (!successionACocher(d)) return false;
  const etape = etapeClotureComptes(d);
  const jour = jourParis(envoye.date);
  d.echeancesValidees = Object.assign({}, d.echeancesValidees, { [etape]: true });
  d.succession = Object.assign({}, d.succession, { clotureComptesEnvoyeeLe: jour });
  d.detectionsEmails = Object.assign({}, d.detectionsEmails, { clotureComptes: jour });
  d.historique = Array.isArray(d.historique) ? d.historique : [];
  const quoi = etape === 'transfertComptes' ? 'Transfert des comptes au profit du conjoint survivant' : 'Déblocage des fonds auprès des banques';
  d.historique.push({ date: new Date().toISOString(),
    texte: `${quoi} marqué fait par CLAIRE : courrier « ${String(courrier.intitule || '').slice(0, 120)} » créé dans Authentic${courrier.date ? ' le ' + courrier.date.split('-').reverse().join('/') : ''}, envoyé par email à la banque le ${jour.split('-').reverse().join('/')} (« ${String(envoye.objet || '').slice(0, 120)} »)` });
  return true;
}

/**
 * Les envois gardés pour un recoupement plus tard : ceux de moins de 45 jours, 400 au plus, sans doublon. Pure.
 * @param {any[]} gardes @param {any[]} nouveaux @param {Date} maintenant
 */
function envoisAGarder(gardes, nouveaux, maintenant) {
  const limite = maintenant.getTime() - JOURS_GARDE_ENVOIS * 86400000;
  const vus = new Set();
  const r = [];
  for (const e of [...(gardes || []), ...(nouveaux || [])]) {
    if (!e || !e.id || vus.has(e.id) || !(Date.parse(e.date) >= limite)) continue;
    vus.add(e.id);
    r.push({ id: String(e.id).slice(0, 64), date: new Date(e.date).toISOString(), objet: String(e.objet || '').slice(0, 300),
      a: (Array.isArray(e.a) ? e.a : []).map((x) => String(x).toLowerCase().slice(0, 200)).filter((x) => /@/.test(x)).slice(0, 20),
      pjNoms: (Array.isArray(e.pjNoms) ? e.pjNoms : []).map((x) => String(x).slice(0, 200)).slice(0, 10) });
  }
  return r.sort((x, y) => x.date.localeCompare(y.date)).slice(-MAX_ENVOIS_GARDES);
}

module.exports = {
  JOURS_APRES_COURRIER, JOURS_GARDE_ENVOIS, etapeClotureComptes, motsSuccession, courriersClotureDossier, successionACocher,
  courrierEnvoyeParEmail, successionDeEnvoiBanque, cocherClotureComptes, envoisAGarder
};
