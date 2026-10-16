// @ts-check
'use strict';
// Clôture / transfert des comptes d'une succession envoyé à la banque (étude 16/10 : « tu pourras valider l'envoi de la clôture ou
// transfert des comptes à la banque en croisant dans Authentic la création du courrier de clôture et l'e-mail d'envoi à la banque en
// lisant les emails envoyés »).
//
// Deux signaux, jamais un seul :
//   1. un courrier de clôture ou de transfert des COMPTES relevé dans Authentic (`d.authentic.courriersBanque`, client/74
//      `courriersBanqueSuccessionAuthentic` : intitulé, date de création, « Mail le … ») ;
//   2. un email ENVOYÉ par l'étude (« Éléments envoyés », objet + destinataires + date seulement, jamais le texte) :
//      - de la veille de la création du courrier à 30 jours après ;
//      - à au moins une adresse qui n'est ni celle d'un héritier de la fiche ni une adresse de l'étude (la banque n'est pas sur la
//        fiche ; un héritier ou un collègue en copie ne gêne pas) ;
//      - dont l'objet nomme le défunt par son NOM DE FAMILLE (jamais un prénom) ;
//      - et dont l'objet parle des comptes (compte, clôture, transfert, déblocage, banque, avoirs, solde), ou qui part le jour où
//        Authentic note le courrier envoyé par mail (« Mail le … », à un jour près).
// Seulement quand l'étape peut se faire (acte de notoriété signé). Un nom de famille porté par deux successions en cours ne désigne
// aucune des deux. L'étape cochée est « Transfert des comptes » avec un conjoint survivant, sinon « Déblocage des fonds auprès des
// banques » ; une seule détection par dossier (`d.detectionsEmails.clotureComptes`) : décochée ensuite à la main, jamais recochée.
// Les emails envoyés dont l'objet nomme une succession en cours sont gardés 45 jours (objet, destinataires, date) pour le cas où le
// courrier d'Authentic n'est relevé qu'après l'envoi ; aucun autre email n'est gardé.

const { estSuccession } = require('../../commun/dossier');
const { conjointSurvivant, etapeSuccessionValidee, etapesSuccession } = require('../../commun/succession');
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

const RE_OBJET_COMPTES = /COMPTE|CLOTUR|TRANSFERT|DEBLOCAGE|BANQU|AVOIRS|SOLDE/;

/** Les mots d'un nom en capitales (≥ 3 lettres, hors mots vides) : les noms de famille. @param {string} brut */
function nomsEnCapitales(brut) {
  return String(brut || '').split(/[^A-Za-zÀ-ÿ'’-]+/).filter((m) => m.length >= 3 && m === m.toUpperCase() && /[A-ZÀ-Þ]/.test(m))
    .map((m) => normaliser(m).replace(/[^A-Z]/g, '')).filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));
}

/**
 * Les NOMS DE FAMILLE qui désignent la succession (relecture 16/10 : jamais un prénom — « Mme Marie DUPONT veuve de M. Jean DUPONT »
 * donne DUPONT) : défunt de la fiche ou des comparants d'Authentic, puis mots en capitales du nom du dossier.
 * @param {any} d
 */
function motsSuccession(d) {
  const comps = d && d.authentic && Array.isArray(d.authentic.comparants) ? d.authentic.comparants : [];
  const defunt = comps.find((/** @type {any} */ c) => c && c.role === 'DEFUNT');
  return [...new Set([d && d.defunt && d.defunt.nom, defunt && defunt.nom, d && d.nom].flatMap((x) => nomsEnCapitales(x)))];
}

/** L'objet cite-t-il ce mot (mot entier) ? @param {string} texte @param {string} m */
const citeMot = (texte, m) => new RegExp(`(^|[^A-Z])${m}([^A-Z]|$)`).test(texte);

/** L'objet nomme-t-il cette succession ? Pure. @param {any} d @param {string} objet */
function objetNommeSuccession(d, objet) {
  const t = normaliser(objet);
  return motsSuccession(d).some((m) => citeMot(t, m));
}

/** Les courriers de clôture / transfert relevés dans Authentic, datés. @param {any} d */
function courriersClotureDossier(d) {
  const l = d && d.authentic && Array.isArray(d.authentic.courriersBanque) ? d.authentic.courriersBanque : [];
  return l.filter((/** @type {any} */ c) => c && /^\d{4}-\d{2}-\d{2}$/.test(String(c.date || '')));
}

/** La succession attend-elle encore cette détection (étape active, pas cochée, courrier relevé) ? Pure. @param {any} d */
function successionACocher(d) {
  if (!d || d.archive || d.deleted || !estSuccession(d)) return false;
  if (d.detectionsEmails && d.detectionsEmails.clotureComptes) return false;
  const etape = etapesSuccession(d).find((e) => e.type === etapeClotureComptes(d));
  if (!etape || !etape.active || etapeSuccessionValidee(d, etape.type)) return false;
  return courriersClotureDossier(d).length > 0;
}

/**
 * Le courrier d'Authentic que cet email envoyé transmet à la banque, ou null. Pure.
 * @param {any} d
 * @param {{ objet: string, a?: string[], date: string }} envoye
 * @param {(a: string) => boolean} [adresseEtude]
 */
function courrierEnvoyeParEmail(d, envoye, adresseEtude) {
  if (!successionACocher(d) || !envoye) return null;
  const heritiers = new Set(adressesDuDossier(d));
  const externes = (envoye.a || []).map((x) => String(x).toLowerCase())
    .filter((x) => /@/.test(x) && !heritiers.has(x) && !(adresseEtude && adresseEtude(x)));
  if (!externes.length || !objetNommeSuccession(d, envoye.objet)) return null;
  const jour = jourParis(envoye.date);
  if (!jour) return null;
  const sujet = RE_OBJET_COMPTES.test(normaliser(envoye.objet));
  return courriersClotureDossier(d).find((c) => {
    if (jour < plusJours(c.date, -1) || jour > plusJours(c.date, JOURS_APRES_COURRIER)) return false;
    const memeJourQueMail = !!c.mailLe && jour >= plusJours(c.mailLe, -1) && jour <= plusJours(c.mailLe, 1);
    return sujet || memeJourQueMail;
  }) || null;
}

/**
 * La seule succession dont cet email transmet le courrier de clôture / transfert, ou null. Une autre succession en cours que l'objet
 * nomme aussi (même nom de famille, courrier relevé ou non) rend le cas indécidable : rien. Pure.
 * @param {any[]} successions toutes les successions en cours @param {any} envoye @param {(a: string) => boolean} [adresseEtude]
 * @returns {{ d: any, courrier: any } | null}
 */
function successionDeEnvoiBanque(successions, envoye, adresseEtude) {
  const nommees = (successions || []).filter((d) => d && !d.archive && estSuccession(d) && objetNommeSuccession(d, envoye && envoye.objet));
  if (nommees.length !== 1) return null;
  const courrier = courrierEnvoyeParEmail(nommees[0], envoye, adresseEtude);
  return courrier ? { d: nommees[0], courrier } : null;
}

/** Faut-il garder cet envoi pour un recoupement plus tard ? Seulement s'il nomme une succession en cours. Pure. @param {any} envoye @param {any[]} successions */
function envoiAGarderPourCloture(envoye, successions) {
  return !!envoye && (successions || []).some((d) => d && !d.archive && estSuccession(d) && objetNommeSuccession(d, envoye.objet));
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
  d.detectionsEmails = Object.assign({}, d.detectionsEmails, { clotureComptes: jour });
  d.historique = Array.isArray(d.historique) ? d.historique : [];
  const quoi = etape === 'transfertComptes' ? 'Transfert des comptes au profit du conjoint survivant' : 'Déblocage des fonds auprès des banques';
  d.historique.push({ date: new Date().toISOString(),
    texte: `${quoi} marqué fait par CLAIRE : courrier « ${String(courrier.intitule || '').slice(0, 120)} » créé dans Authentic${courrier.date ? ' le ' + courrier.date.split('-').reverse().join('/') : ''}, envoyé par email à la banque le ${jour.split('-').reverse().join('/')} (« ${String(envoye.objet || '').slice(0, 120)} »)` });
  return true;
}

/**
 * Les envois gardés pour un recoupement plus tard : ceux de moins de 45 jours (`maintenant` null : sans tri par date), 400 au plus,
 * sans doublon. Pure.
 * @param {any[]} gardes @param {any[]} nouveaux @param {Date | null} maintenant
 */
function envoisAGarder(gardes, nouveaux, maintenant) {
  const limite = maintenant ? maintenant.getTime() - JOURS_GARDE_ENVOIS * 86400000 : -Infinity;
  const vus = new Set();
  const r = [];
  for (const e of [...(gardes || []), ...(nouveaux || [])]) {
    if (!e || !e.id || vus.has(e.id) || !(Date.parse(e.date) >= limite)) continue;
    vus.add(e.id);
    r.push({ id: String(e.id).slice(0, 64), date: new Date(e.date).toISOString(), objet: String(e.objet || '').slice(0, 300),
      a: (Array.isArray(e.a) ? e.a : []).map((x) => String(x).toLowerCase().slice(0, 200)).filter((x) => /@/.test(x)).slice(0, 20) });
  }
  return r.sort((x, y) => x.date.localeCompare(y.date)).slice(-MAX_ENVOIS_GARDES);
}

module.exports = {
  JOURS_APRES_COURRIER, JOURS_GARDE_ENVOIS, etapeClotureComptes, motsSuccession, objetNommeSuccession, courriersClotureDossier, successionACocher,
  courrierEnvoyeParEmail, successionDeEnvoiBanque, envoiAGarderPourCloture, cocherClotureComptes, envoisAGarder
};
