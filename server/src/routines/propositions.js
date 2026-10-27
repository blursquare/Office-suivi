// @ts-check
'use strict';
// Boîte de propositions de CLAIRE (clé `routines-propositions`) : ce que les routines ont préparé, par collaborateur. Une proposition est
// un brouillon d'email, un document, une tâche, des dates ou une alerte ; le collaborateur l'autorise, la refuse, dit qu'elle est DÉJÀ
// FAITE (étude 26/10 : fermée sans que CLAIRE exécute rien, ni acceptée ni refusée pour les statistiques), la REPORTE (elle réapparaît
// à la date choisie) ou la laisse expirer (30 jours). Une proposition ACCEPTÉE, REFUSÉE ou DÉJÀ FAITE n'est jamais refaite (même empreinte). Rien ici n'envoie ni n'écrit hors de CLAIRE.
// Fonctions pures sur la liste : l'appelant lit et réécrit la clé.

const CLE_PROPOSITIONS = 'routines-propositions';
// 2 000 (25/10, toutes les routines allumées) : une proposition sortie de la liste perdrait son empreinte et pourrait revenir.
const MAX_PROPOSITIONS = 2000;
const JOURS_EXPIRATION = 30;
const SEUIL_PROMOTION_PROPOSITIONS = 30;
const SEUIL_PROMOTION_TAUX = 0.9;
const TYPES = ['email', 'document', 'tache', 'dates', 'alerte', 'validation'];   // `validation` : une demande de CLAIRE depuis son poste virtuel (server/src/posteClaire.js)
const ETATS = ['proposee', 'vue', 'acceptee', 'refusee', 'faite', 'expiree'];

/** @param {any} v @param {number} max */
function texteBorne(v, max) {
  return String(v == null ? '' : v).replace(/\u0000/g, '').slice(0, max);
}

/** Les détails d'une proposition : des chaînes bornées, une profondeur, rien d'autre. @param {any} d */
function assainirDetails(d) {
  /** @type {Record<string, string>} */
  const propre = {};
  if (!d || typeof d !== 'object' || Array.isArray(d)) return propre;
  for (const cle of Object.keys(d).slice(0, 20)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(cle)) continue;
    const v = d[cle];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') propre[cle] = texteBorne(v, cle === 'corps' ? 8000 : 500);
  }
  return propre;
}

/** @param {any} p @returns {any | null} */
function assainirProposition(p) {
  if (!p || typeof p !== 'object') return null;
  const id = texteBorne(p.id, 60);
  const titre = texteBorne(p.titre, 140).trim();
  if (!id || !titre || !TYPES.includes(p.type)) return null;
  const date = (v) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? new Date(t).toISOString() : ''; };
  return {
    id,
    routine: texteBorne(p.routine, 60),
    responsable: texteBorne(p.responsable, 80),
    dossierId: texteBorne(p.dossierId, 80),
    type: p.type,
    titre,
    resume: texteBorne(p.resume, 400),
    details: assainirDetails(p.details),
    // Ce que fait « Autoriser » : ouvrir un outil, un brouillon, une fiche… (voir client/112-routines.js).
    action: texteBorne(p.action, 40),
    empreinte: texteBorne(p.empreinte, 160),
    exemple: p.exemple === true,
    etat: ETATS.includes(p.etat) ? p.etat : 'proposee',
    creeLe: date(p.creeLe),
    traiteLe: date(p.traiteLe),
    traitePar: texteBorne(p.traitePar, 80),
    resumeTeamsLe: date(p.resumeTeamsLe),
    // Reportée : cachée de « À traiter » (et de la pastille) jusqu'à cette date, puis de nouveau à décider.
    reporteJusqua: date(p.reporteJusqua)
  };
}

/** @param {any} brut */
function assainirPropositions(brut) {
  return (Array.isArray(brut) ? brut : []).map(assainirProposition).filter(Boolean).slice(-MAX_PROPOSITIONS);
}

/**
 * Ajoute une proposition sauf si la même (même empreinte) existe déjà, quel que soit son responsable (étude 26/10 : « fais que la proposition
 * suive le dossier » — avant, l'empreinte ET le responsable : un dossier qui changeait de responsable recevait la même proposition une
 * seconde fois, et deux personnes pouvaient autoriser la même relance) :
 * - déjà là pour le même responsable, ou déjà traitée (acceptée, refusée, expirée) : rien — une proposition n'est jamais refaite ;
 * - encore en attente chez un AUTRE responsable : elle passe au nouveau (`reattribuee`), même identifiant, rien de neuf n'est créé.
 * @param {any[]} liste @param {any} nouvelle @param {Date} [maintenant]
 */
function ajouterProposition(liste, nouvelle, maintenant) {
  const p = assainirProposition(Object.assign({ etat: 'proposee', creeLe: (maintenant || new Date()).toISOString() }, nouvelle));
  if (!p) return { liste, ajoutee: null, reattribuee: null };
  const i = p.empreinte ? liste.findIndex((x) => x.empreinte === p.empreinte) : -1;
  if (i < 0) return { liste: [...liste, p].slice(-MAX_PROPOSITIONS), ajoutee: p, reattribuee: null };
  const deja = liste[i];
  if (deja.responsable === p.responsable || !(deja.etat === 'proposee' || deja.etat === 'vue')) return { liste, ajoutee: null, reattribuee: null };
  const suivie = Object.assign({}, deja, { responsable: p.responsable });
  const nouvelleListe = liste.slice();
  nouvelleListe[i] = suivie;
  return { liste: nouvelleListe, ajoutee: null, reattribuee: Object.assign({ avant: deja.responsable }, suivie) };
}

/**
 * Pure : l'instant (ISO) d'un report — « demain », « dans 3 jours », « lundi » (le prochain) ou « maintenant » (reprendre) — à 8 h, heure de
 * Paris. @param {string} quand @param {Date} [maintenant] @returns {string} '' = reprendre maintenant, null = demande inconnue
 */
function dateDeReport(quand, maintenant) {
  const t = maintenant || new Date();
  const ymd = (/** @type {Date} */ d) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const aujourdhui = ymd(t);
  const [y, m, j] = aujourdhui.split('-').map(Number);
  const jourSemaine = new Date(Date.UTC(y, m - 1, j)).getUTCDay();   // 0 dimanche … 6 samedi
  /** @type {Record<string, number>} */
  const jours = { demain: 1, '3-jours': 3, lundi: ((8 - jourSemaine) % 7) || 7 };
  if (quand === 'reprendre') return '';
  if (!Object.prototype.hasOwnProperty.call(jours, quand)) return /** @type {any} */ (null);
  const cible = new Date(Date.UTC(y, m - 1, j + jours[quand])).toISOString().slice(0, 10);
  // 8 h à Paris : 06:00 UTC l'été, 07:00 l'hiver — on prend celui qui donne bien 8 h.
  for (const h of [6, 7]) {
    const essai = new Date(`${cible}T0${h}:00:00Z`);
    if (Number(essai.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })) === 8) return essai.toISOString();
  }
  return new Date(`${cible}T07:00:00Z`).toISOString();
}

/** Pure : la proposition est-elle reportée à une date pas encore atteinte ? @param {any} p @param {Date} [maintenant] */
function estReportee(p, maintenant) {
  return !!(p && p.reporteJusqua && Date.parse(p.reporteJusqua) > (maintenant || new Date()).getTime());
}

/**
 * Décide d'une proposition : « vue » (alerte lue), « acceptee », « refusee », « faite » (déjà faite : fermée sans rien exécuter) ou « reporter »
 * (`options.quand` : demain, 3-jours, lundi, reprendre). Une décision finale ne change plus ; un report ne ferme rien.
 * @param {any[]} liste @param {string} id @param {'vue' | 'acceptee' | 'refusee' | 'faite' | 'reporter'} decision @param {string} par @param {Date} [maintenant] @param {{ quand?: string }} [options]
 */
function decider(liste, id, decision, par, maintenant, options) {
  const i = liste.findIndex((x) => x.id === id);
  if (i < 0 || !['vue', 'acceptee', 'refusee', 'faite', 'reporter'].includes(decision)) return { liste, proposition: null };
  const avant = liste[i];
  // Une proposition déjà traitée ne change plus (un double clic ne la défait pas) ; « vue » ne rétrograde jamais une décision.
  if (avant.etat === 'acceptee' || avant.etat === 'refusee' || avant.etat === 'faite' || avant.etat === 'expiree') return { liste, proposition: avant };
  if (decision === 'vue' && avant.etat === 'vue') return { liste, proposition: avant };
  const nouvelle = liste.slice();
  if (decision === 'reporter') {
    const jusqua = dateDeReport(String((options && options.quand) || ''), maintenant);
    if (jusqua === null) return { liste, proposition: null };
    const p = Object.assign({}, avant, { reporteJusqua: jusqua });
    nouvelle[i] = p;
    return { liste: nouvelle, proposition: p };
  }
  const p = Object.assign({}, avant, { etat: decision, reporteJusqua: '' }, decision === 'vue' ? {} : { traiteLe: (maintenant || new Date()).toISOString(), traitePar: texteBorne(par, 80) });
  nouvelle[i] = p;
  return { liste: nouvelle, proposition: p };
}

/** Les propositions non traitées depuis plus de 30 jours passent à « expirée ». @param {any[]} liste @param {Date} [maintenant] */
function expirer(liste, maintenant) {
  const limite = (maintenant || new Date()).getTime() - JOURS_EXPIRATION * 86400000;
  let change = false;
  const nouvelle = liste.map((p) => {
    if ((p.etat === 'proposee' || p.etat === 'vue') && p.creeLe && Date.parse(p.creeLe) < limite) { change = true; return Object.assign({}, p, { etat: 'expiree' }); }
    return p;
  });
  return change ? nouvelle : liste;
}

/**
 * Les propositions d'un collaborateur (ou de tous), les plus récentes d'abord. `etats` : liste d'états ; `dossierId` : un dossier.
 * @param {any[]} liste @param {{ responsable?: string, tous?: boolean, etats?: string[], dossierId?: string, reportees?: boolean, maintenant?: Date }} filtre
 */
function listerPropositions(liste, filtre) {
  const f = filtre || {};
  return liste
    .filter((p) => (f.tous || !f.responsable || p.responsable === f.responsable)
      && (!f.etats || f.etats.includes(p.etat))
      // `reportees` : vrai = seulement les reportées, faux = sans les reportées (la boîte « À traiter »), absent = toutes.
      && (f.reportees === undefined || estReportee(p, f.maintenant) === f.reportees)
      && (!f.dossierId || p.dossierId === f.dossierId))
    .sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)));
}

/** Le nombre à traiter (proposées ou vues, pas encore décidées) d'un collaborateur. @param {any[]} liste @param {string} responsable @param {boolean} [tous] @param {Date} [maintenant] */
function compterATraiter(liste, responsable, tous, maintenant) {
  return listerPropositions(liste, { responsable, tous, etats: ['proposee', 'vue'], reportees: false, maintenant }).length;
}

/**
 * Les statistiques d'une routine : propositions décidées, acceptées, refusées, taux d'acceptation, et si l'étude a assez de recul pour qu'on
 * lui propose de passer la routine au niveau supérieur (90 % d'acceptation sur 30 propositions décidées). Les exemples ne comptent pas.
 * @param {any[]} liste @param {string} routineId
 */
function statsRoutine(liste, routineId) {
  // Une alerte se lit, elle ne se refuse pas : elle ne compte jamais dans le taux d'acceptation.
  const siennes = liste.filter((p) => p.routine === routineId && !p.exemple && p.type !== 'alerte');
  const acceptees = siennes.filter((p) => p.etat === 'acceptee').length;
  const refusees = siennes.filter((p) => p.etat === 'refusee').length;
  const decidees = acceptees + refusees;
  const taux = decidees ? acceptees / decidees : null;
  return {
    total: siennes.length, aTraiter: siennes.filter((p) => p.etat === 'proposee' || p.etat === 'vue').length, acceptees, refusees, decidees, taux,
    promotionPossible: decidees >= SEUIL_PROMOTION_PROPOSITIONS && taux !== null && taux >= SEUIL_PROMOTION_TAUX
  };
}

/** @param {any} repo */
function lirePropositions(repo) {
  return assainirPropositions(repo.lireJsonBrut(CLE_PROPOSITIONS, null));
}

/** @param {any} repo @param {any[]} liste */
function ecrirePropositions(repo, liste) {
  const propre = assainirPropositions(liste);
  repo.ecrireJsonBrut(CLE_PROPOSITIONS, propre);
  return propre;
}

module.exports = {
  CLE_PROPOSITIONS, MAX_PROPOSITIONS, JOURS_EXPIRATION, SEUIL_PROMOTION_PROPOSITIONS, SEUIL_PROMOTION_TAUX, TYPES, ETATS,
  assainirProposition, assainirPropositions, ajouterProposition, decider, dateDeReport, estReportee, expirer, listerPropositions, compterATraiter, statsRoutine,
  lirePropositions, ecrirePropositions
};
