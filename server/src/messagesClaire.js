// @ts-check
'use strict';
// Les MESSAGES DE CLAIRE à chaque collaborateur (étude 27/10 : « repenser toutes les notifications pour qu'elles soient intelligentes et pas
// trop massives — on en reçoit trop, parfois trop longues ; passer par le système de notification CLAIRE et plus par Teams »).
// Ce que le serveur envoyait sur Teams (rappels, pièces trouvées, mentions, rendez-vous déplacés, résumé des routines, signalements…) et ce
// que CLAIRE veut dire à quelqu'un (arrivée sur un dossier dans Authentic, travail terminé…) devient un message dans SA conversation avec
// CLAIRE (profil de CLAIRE dans les Discussions), avec la pastille et la notification Windows de CLAIRE. Les règles qui allègent, tenues ici :
// - court : la première phrase, 160 caractères au plus ; le reste se déplie (« détail ») ;
// - jamais deux fois : même clé, ou même texte court, dans les 12 h → ignoré ;
// - regroupé : un message de la même sorte (pièces, rappels, mentions…) encore non lu depuis moins de 2 h reçoit le nouveau en plus
//   (« Pièces trouvées (3) ») au lieu d'en créer un autre — une seule notification pour le groupe ;
// - au plus 200 messages par personne, 30 jours.
// Clé `claire-messages` : { [collaborateur]: Message[] }.

const crypto = require('node:crypto');

const CLE_MESSAGES_CLAIRE = 'claire-messages';
const MAX_PAR_PERSONNE = 200;
const JOURS_GARDES = 30;
const LONGUEUR_COURT = 160;
const FENETRE_DOUBLON_MS = 12 * 60 * 60 * 1000;
const FENETRE_GROUPE_MS = 2 * 60 * 60 * 1000;
const MAX_ELEMENTS_GROUPE = 20;

// La sorte d'un message (pour le regrouper), d'après ses mots quand l'appelant ne la dit pas. L'ordre compte : la plus précise d'abord.
const SORTES = [
  { cle: 'mention', titre: 'Mentions dans les discussions', re: /mentionn|vous a cit/i },
  { cle: 'travail', titre: 'Travaux de CLAIRE', re: /^travail (?:non )?termin/i },
  { cle: 'routines', titre: 'Préparé par CLAIRE', re: /CLAIRE a préparé|propositions? de CLAIRE|à décider/i },
  { cle: 'pieces', titre: 'Pièces trouvées', re: /pi[eè]ces? (?:trouv|reç|re[çc]ue)|nouvelle pi[eè]ce|offre de pr[eê]t (?:trouv|reç)|dossier complet|fonds (?:sont )?(?:tous )?re[çc]us/i },
  { cle: 'agenda', titre: 'Agenda', re: /rendez-vous|signature (?:plac|d[ée]plac)|à replacer/i },
  { cle: 'rappels', titre: 'Rappels d’échéances', re: /rappel|[ée]ch[ée]ance|J-\d+|date butoir|dans \d+ jours?/i },
  { cle: 'signalement', titre: 'Signalements', re: /signalement|probl[eè]me signal/i },
  { cle: 'facture', titre: 'Factures de succession', re: /facture/i }
];

/** Pure : la sorte d'un texte. @param {string} texte */
function sorteDuTexte(texte) {
  const s = SORTES.find((x) => x.re.test(String(texte || '')));
  return s ? s.cle : 'autre';
}
/** @param {string} cle */
function titreSorte(cle) { const s = SORTES.find((x) => x.cle === cle); return s ? s.titre : 'Messages de CLAIRE'; }

/** Pure : le texte nettoyé (sans balises, espaces réduits), et sa version courte — la première phrase, 160 caractères au plus. @param {string} texte */
function versionCourte(texte) {
  const propre = String(texte || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const premiereLigne = propre.split('\n').map((l) => l.trim()).find(Boolean) || '';
  const m = /^(.{20,}?[.!?])(?:\s|$)/.exec(premiereLigne);
  let court = m ? m[1] : premiereLigne;
  if (court.length > LONGUEUR_COURT) court = court.slice(0, LONGUEUR_COURT - 1).replace(/\s+\S*$/, '') + '…';
  return { court, complet: propre.slice(0, 4000) };
}

/** @param {any} v @param {number} max */
const borne = (v, max) => String(v == null ? '' : v).replace(/\u0000/g, '').slice(0, max);

/** Pure : la boîte assainie (messages trop vieux retirés). @param {any} brut @param {number} [maintenantMs] */
function assainirBoites(brut, maintenantMs) {
  const t = maintenantMs == null ? Date.now() : maintenantMs;
  /** @type {Record<string, any[]>} */
  const out = {};
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return out;
  for (const [qui, liste] of Object.entries(brut)) {
    if (!Array.isArray(liste)) continue;
    out[borne(qui, 80)] = liste.filter((m) => m && m.id && Number(m.quand) > t - JOURS_GARDES * 86400000).slice(-MAX_PAR_PERSONNE).map((m) => ({
      id: borne(m.id, 40), quand: Number(m.quand) || 0, maj: Number(m.maj) || Number(m.quand) || 0, sorte: borne(m.sorte, 30), cle: borne(m.cle, 160),
      court: borne(m.court, 400), detail: borne(m.detail, 4000), dossierId: borne(m.dossierId, 80), lu: m.lu === true,
      elements: Array.isArray(m.elements) ? m.elements.slice(-MAX_ELEMENTS_GROUPE).map((e) => ({ court: borne(e && e.court, 400), quand: Number(e && e.quand) || 0, dossierId: borne(e && e.dossierId, 80) })) : []
    }));
  }
  return out;
}

/**
 * Pure : dépose un message dans la boîte d'une personne, avec les règles qui allègent (doublon, regroupement, court).
 * @param {any[]} liste @param {{ texte: string, cle?: string, sorte?: string, dossierId?: string }} m @param {number} maintenantMs
 * @returns {{ liste: any[], message: any, effet: 'nouveau' | 'groupe' | 'doublon' | 'vide' }}
 */
function deposerDansBoite(liste, m, maintenantMs) {
  const { court, complet } = versionCourte(m.texte);
  if (!court) return { liste, message: null, effet: 'vide' };
  const cle = borne(m.cle || '', 160);
  const sorte = borne(m.sorte || sorteDuTexte(complet), 30);
  const recents = liste.filter((x) => maintenantMs - Math.max(x.quand, x.maj || 0) < FENETRE_DOUBLON_MS);
  const deja = recents.find((x) => (cle && x.cle === cle) || x.court === court || (x.elements || []).some((e) => e.court === court));
  if (deja) return { liste, message: deja, effet: 'doublon' };
  // Regroupé : même sorte, encore non lu, récent — une seule notification pour le groupe.
  const groupe = SORTES.some((x) => x.cle === sorte) && sorte !== 'travail' ? liste.slice().reverse().find((x) => x.sorte === sorte && !x.lu && maintenantMs - (x.maj || x.quand) < FENETRE_GROUPE_MS) : null;
  if (groupe) {
    const elements = (groupe.elements && groupe.elements.length ? groupe.elements : [{ court: groupe.court, quand: groupe.quand, dossierId: groupe.dossierId }])
      .concat([{ court, quand: maintenantMs, dossierId: borne(m.dossierId || '', 80) }]).slice(-MAX_ELEMENTS_GROUPE);
    const maj = Object.assign({}, groupe, { elements, court: `${titreSorte(sorte)} (${elements.length})`, detail: elements.map((e) => '• ' + e.court).join('\n'), maj: maintenantMs, id: groupe.id });
    return { liste: liste.map((x) => (x.id === groupe.id ? maj : x)), message: maj, effet: 'groupe' };
  }
  const nouveau = { id: 'cm-' + crypto.randomBytes(8).toString('base64url'), quand: maintenantMs, maj: maintenantMs, sorte, cle, court,
    detail: complet !== court ? complet : '', dossierId: borne(m.dossierId || '', 80), lu: false, elements: [] };
  return { liste: liste.concat([nouveau]).slice(-MAX_PAR_PERSONNE), message: nouveau, effet: 'nouveau' };
}

/** @param {any} repo @param {string} qui @param {{ texte: string, cle?: string, sorte?: string, dossierId?: string }} m @param {Date} [maintenant] */
function deposerMessageClaire(repo, qui, m, maintenant) {
  const t = (maintenant || new Date()).getTime();
  const boites = assainirBoites(repo.lireJsonBrut(CLE_MESSAGES_CLAIRE, {}), t);
  const r = deposerDansBoite(boites[qui] || [], m, t);
  if (r.effet === 'nouveau' || r.effet === 'groupe') { boites[qui] = r.liste; repo.ecrireJsonBrut(CLE_MESSAGES_CLAIRE, boites); }
  return { effet: r.effet, message: r.message };
}

/** @param {any} repo @param {string} qui */
function messagesDe(repo, qui) { return (assainirBoites(repo.lireJsonBrut(CLE_MESSAGES_CLAIRE, {}))[qui] || []); }

/** Marque lus ses messages (tous, ou jusqu'à un instant). @param {any} repo @param {string} qui */
function marquerLus(repo, qui) {
  const boites = assainirBoites(repo.lireJsonBrut(CLE_MESSAGES_CLAIRE, {}));
  if (!boites[qui]) return 0;
  let n = 0;
  boites[qui] = boites[qui].map((x) => { if (!x.lu) n++; return Object.assign({}, x, { lu: true }); });
  repo.ecrireJsonBrut(CLE_MESSAGES_CLAIRE, boites);
  return n;
}

/**
 * L'aiguillage des envois « Teams » (passerelle SMTP → Power Automate) vers CLAIRE : le destinataire est retrouvé par son adresse dans
 * Réglages › Collaborateurs ; une copie à l'étude va aux administrateurs. Rend `null` pour laisser partir sur Teams (la personne l'a demandé
 * dans Réglages › Notifications, ou l'adresse n'est celle de personne).
 * @param {any} repo @param {string[]} administrateurs
 */
function creerAiguillageNotifications(repo, administrateurs) {
  return (/** @type {any} */ reglages, /** @type {string} */ destinataire, /** @type {any} */ message) => {
    const r = reglages || {};
    const norme = (/** @type {string} */ a) => String(a || '').replace(/.*<([^>]+)>.*/, '$1').trim().toLowerCase();
    const cible = norme(destinataire);
    if (!cible) return null;
    const emails = r.emailsResponsables || {};
    let qui = Object.keys(emails).filter((n) => norme(emails[n]) === cible);
    if (!qui.length && r.copieEmail && norme(r.copieEmail) === cible) qui = administrateurs.slice(0, 1);
    if (!qui.length) return null;
    let prefs = {};
    try { prefs = repo.lirePreferences ? repo.lirePreferences() : {}; } catch (e) { prefs = {}; }
    const texte = typeof message === 'string' ? message : (message && (message.texte || message.html)) || '';
    const verTeams = qui.some((n) => prefs[n] && prefs[n].notifications && prefs[n].notifications.teams === true);
    let depose = false;
    for (const n of qui) { const d = deposerMessageClaire(repo, n, { texte }); if (d.effet === 'nouveau' || d.effet === 'groupe') depose = true; }
    if (depose) { try { require('./verificationsTerrain').noterVerification(repo, 'messages-claire-recus', { detail: 'message déposé' }); } catch (e) { /* jamais bloquant */ } }
    return verTeams ? null : { ok: true, erreur: null, messageId: null, claire: true };
  };
}

module.exports = { CLE_MESSAGES_CLAIRE, LONGUEUR_COURT, sorteDuTexte, versionCourte, assainirBoites, deposerDansBoite, deposerMessageClaire, messagesDe, marquerLus, creerAiguillageNotifications };
