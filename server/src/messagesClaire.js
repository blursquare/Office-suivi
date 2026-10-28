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
  { cle: 'rappels', titre: 'Rappels d’échéances', re: /^\W*(?:CLAIRE\s*[—–-]\s*)?Rappel\b/i },
  { cle: 'routines', titre: 'Préparé par CLAIRE', re: /CLAIRE a préparé|j’ai préparé \d+ chose|propositions? de CLAIRE|à décider/i },
  { cle: 'pieces', titre: 'Pièces trouvées', re: /pi[eè]ces? (?:trouv|reç|re[çc]ue)|nouvelle pi[eè]ce|offre de pr[eê]t (?:trouv|reç)|dossier complet|fonds (?:sont )?(?:tous )?re[çc]us/i },
  { cle: 'agenda', titre: 'Agenda', re: /rendez-vous|signature (?:plac|d[ée]plac)|à replacer/i },
  { cle: 'rappels', titre: 'Rappels d’échéances', re: /rappel|[ée]ch[ée]ance|J-\d+|date butoir|dans \d+ jours?/i },
  { cle: 'signalement', titre: 'Signalements', re: /signalement|probl[eè]me (?:bloquant )?signal/i },
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
  // La première phrase : jamais coupée après une abréviation (« M. », « S.A.R.L. », « etc. ») — relecture 27/10.
  const m = /^(.{20,}?(?<!\b(?:M|Mme|Mlle|Me|Dr|St|Ste|etc|cf|[A-Z]))[.!?])(?:\s|$)/.exec(premiereLigne);
  let court = m ? m[1] : premiereLigne;
  if (court.length > LONGUEUR_COURT) court = court.slice(0, LONGUEUR_COURT - 1).replace(/\s+\S*$/, '') + '…';
  return { court, complet: propre.slice(0, 4000) };
}

// Comme une collègue (étude 27/10 : « des phrases courtes et rapides à comprendre pour toutes les notifications que Claire envoie dans sa
// conversation, comme si c'était une collègue ») : les textes faits pour Teams (« 📌 CLAIRE — Rappel : « X » du dossier D arrive à échéance
// dans 7 jours (le 2026-11-03). ») sont redits en une phrase courte (« « X » pour D dans 7 jours, le 3/11. »). Le reste du message (listes de
// pièces, liens) reste dans le détail. Un texte d'une autre forme perd seulement l'en-tête « CLAIRE — », inutile dans sa propre conversation.
/** @param {string} iso */
function jourCourt(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${Number(m[3])}/${m[2]}` : String(iso || '');
}
const REECRITURES_COLLEGUE = [
  // Rappels d'échéance (jobs/rappels.js)
  [/^Rappel : « (.+?) » du dossier (.+?) est à faire aujourd'hui \(le [\d-]+\)\.?/, (m) => `« ${m[1]} » pour ${m[2]}, c’est aujourd’hui.`],
  [/^Rappel : « (.+?) » du dossier (.+?) arrive à échéance dans (\d+) jours? \(le ([\d-]+)\)\.?/, (m) => `« ${m[1]} » pour ${m[2]} dans ${m[3]} jour${m[3] === '1' ? '' : 's'}, le ${jourCourt(m[4])}.`],
  // Fonds (jobs/rappels.js)
  [/^Tous les fonds sont reçus pour le dossier (.+) \(([^)]*)\)\.(?: Rendez-vous de signature le ([^\n]+?)\.)?\n?(?:Vous pouvez confirmer[^\n]*)?/, (m) => `Tous les fonds de ${m[1]} sont arrivés (${m[2]}) : vous pouvez le confirmer au client.${m[3] ? `\n\nSignature le ${m[3]}.` : ''}`],
  [/^Fonds pas encore reçus en entier pour le dossier (.+?) :(?: Rendez-vous de signature le ([^\n]+?)\.)?\s*\n\s*À ce jour, ([^\n]+?)\.?$/m, (m) => `Les fonds de ${m[1]} ne sont pas encore tous là : ${m[3]}.${m[2] ? `\n\nSignature le ${m[2]}.` : ''}`],
  // Pièces, dossier complet, facture (routes/notifications.js)
  [/^Nouvelles? pièces? trouvées? sur le dossier (.+?) : ([^\n]+?)\.?(?=\n|$)/, (m) => `Reçu pour ${m[1]} : ${m[2]}.`],
  [/^Dossier (.+?) complet : offre de prêt et pièces reçues\./, (m) => `${m[1]} est complet : vous pouvez lancer la rédaction.`],
  [/^Succession (.+?) : toutes les pièces sont reçues\./, (m) => `Succession ${m[1]} : toutes les pièces sont là.`],
  [/^Facture à régler · (.+?) : ([^\n]+?)\.?(?=\n|$)/, (m) => `Facture à régler pour ${m[1]} : ${m[2]}.`],
  // Dates et rendez-vous (routes/notifications.js)
  [/^(.+?) a envoyé (.+?) du dossier (.+?) \(le [^)]*\)\. La tâche est faite\./, (m) => `${m[1]} a envoyé ${m[2]} de ${m[3]}.`],
  [/^(.+?) a modifié une date du dossier (.+?) : (.+?) passe du .+? au (.+?)\.$/m, (m) => `${m[1]} a déplacé « ${m[3]} » de ${m[2]} au ${m[4]}.`],
  [/^(.+?) a ajouté une date au dossier (.+?) : (.+) le (.+?)\.$/m, (m) => `${m[1]} a posé « ${m[3]} » de ${m[2]} le ${m[4]}.`],
  [/^(.+?) a marqué « annulé \/ à replacer » le rendez-vous de signature du dossier (.+?) \(prévu le (.+?)\) : il est à replacer\./, (m) => `${m[1]} a annulé la signature de ${m[2]} (prévue le ${m[3]}) : à replacer.`],
  [/^Le rendez-vous de signature du dossier (.+?) \(prévu le (.+?)\) est marqué « annulé \/ à replacer »[^\n]*/, (m) => `La signature de ${m[1]} (prévue le ${m[2]}) est à replacer.`],
  [/^Rendez-vous de signature du dossier (.+?) déplacé dans l’agenda de l’office : du .+? au (.+?)\.$/m, (m) => `Signature de ${m[1]} déplacée au ${m[2]}.`],
  [/^Rendez-vous de signature du dossier (.+?) placé dans l’agenda de l’office : le (.+?)\.$/m, (m) => `Signature de ${m[1]} placée le ${m[2]}.`],
  [/^(.+?) a fait une tâche de votre dossier (.+?) : (.+?)\.$/m, (m) => `${m[1]} a fait « ${m[3].replace(/[.!?]+(?=\s|\(|$)/g, '')} » sur ${m[2]}.`],
  [/^(.+?) vous demande : (.+?)(?: \(dossier (.+?)\))?(, pour le [^.]+)?\. La tâche est dans votre liste[^\n]*/, (m) => `${m[1]} vous demande : ${m[2]}${m[3] ? ` (${m[3]})` : ''}${m[4] || ''}.`],
  // Signalement (routes/signalements.js), résumé des routines (routines/planificateur.js), travaux (travauxClaire.js)
  [/^Problème BLOQUANT signalé(?: par (.+?))?\./, (m) => (m[1] ? `${m[1]} signale un problème bloquant.` : 'Un problème bloquant est signalé.')],
  [/^Bonjour [^,]+, j’ai préparé (\d+) choses? pour vous :/, (m) => `J’ai préparé ${m[1]} chose${m[1] === '1' ? '' : 's'} pour vous, à décider :`],
  [/^Travail terminé : (.+?)\.$/m, (m) => `C’est fait : ${m[1]}.`],
  [/^Travail non terminé : (.+?)\.$/m, (m) => `Je n’ai pas pu finir : ${m[1]}.`]
];

/** Pure : le texte d'une notification redit comme une collègue (première phrase courte), le reste gardé dessous. @param {string} texte */
function phraseCollegue(texte) {
  const brut = String(texte || '').replace(/^\s*(?:<[^>]*>\s*)*/, '');
  // L'en-tête des messages Teams (« 📌 CLAIRE — ») : inutile quand c'est Claire qui parle.
  const sansEnTete = brut.replace(/^[^A-Za-zÀ-ÿ«<\d]*CLAIRE\s*[—–-]\s*/, '');
  for (const [re, fn] of REECRITURES_COLLEGUE) {
    const m = /** @type {RegExp} */ (re).exec(sansEnTete);
    if (m && m.index === 0) {
      const reste = sansEnTete.slice(m[0].length).replace(/^\s+/, '');
      return /** @type {(m: RegExpExecArray) => string} */ (fn)(m) + (reste ? '\n\n' + reste : '');
    }
  }
  return sansEnTete;
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
  const { court, complet } = versionCourte(phraseCollegue(m.texte));
  if (!court) return { liste, message: null, effet: 'vide' };
  const cle = borne(m.cle || '', 160);
  // La sorte se lit sur le texte d'origine (ses mots : « Rappel », « pièce trouvée »…), avant qu'il soit redit.
  const sorte = borne(m.sorte || sorteDuTexte(versionCourte(m.texte).complet), 30);
  const recents = liste.filter((x) => maintenantMs - Math.max(x.quand, x.maj || 0) < FENETRE_DOUBLON_MS);
  // Avec une clé, seule la clé dit le doublon (relecture 27/10 : deux comptes rendus de la même consigne avaient le même texte court).
  const deja = recents.find((x) => (cle ? x.cle === cle : (!x.cle && (x.court === court || (x.elements || []).some((e) => e.court === court)))));
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
  return (/** @type {any} */ reglages, /** @type {string} */ destinataire, /** @type {any} */ message, /** @type {any} */ options) => {
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
    if (options && options.dejaDansCanal) return verTeams ? null : { ok: true, erreur: null, messageId: null, claire: true };
    // Pièces trouvées (étude 28/10) : déjà dans le dossier, avec sa pastille — jamais un message de CLAIRE (Teams seulement pour qui l'a demandé).
    if (options && options.sansConversationClaire) return verTeams ? null : { ok: true, erreur: null, messageId: null, claire: true };
    // Une notification liée à un dossier va dans la conversation DE CE DOSSIER (étude 28/10), une seule fois pour toute l'étude.
    const dossierId = options && typeof options.dossierId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(options.dossierId) ? options.dossierId : '';
    if (dossierId && qui.length) {
      const { ajouterMessage, canalDuDossier, lireMessages, canalValide } = require('./canaux/canaux');
      const canal = canalDuDossier(dossierId);
      if (canalValide(canal)) {
        const { court, complet } = versionCourte(phraseCollegue(texte));
        if (court) {
          const t = Date.now();
          const texteCanal = complet !== court ? complet : court;
          const deja = lireMessages(repo, canal).some((m) => m.claire && m.texte === texteCanal && t - (Number(m.quand) || 0) < FENETRE_DOUBLON_MS);
          if (!deja) ajouterMessage(repo, canal, { auteur: 'CLAIRE', claire: true, pour: qui[0], texte: texteCanal }, t);
        }
        return verTeams ? null : { ok: true, erreur: null, messageId: null, claire: true };
      }
    }
    let depose = false;
    for (const n of qui) { const d = deposerMessageClaire(repo, n, { texte }); if (d.effet === 'nouveau' || d.effet === 'groupe') depose = true; }
    if (depose) { try { require('./verificationsTerrain').noterVerification(repo, 'messages-claire-recus', { detail: 'message déposé' }); } catch (e) { /* jamais bloquant */ } }
    return verTeams ? null : { ok: true, erreur: null, messageId: null, claire: true };
  };
}

module.exports = { CLE_MESSAGES_CLAIRE, LONGUEUR_COURT, sorteDuTexte, versionCourte, phraseCollegue, assainirBoites, deposerDansBoite, deposerMessageClaire, messagesDe, marquerLus, creerAiguillageNotifications };
