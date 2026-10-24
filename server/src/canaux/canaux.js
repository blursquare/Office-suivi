// @ts-check
'use strict';
// Canaux de CLAIRE (étude 24/10, 0.328.0) : « un slack » où CLAIRE écrit et où l'étude répond. Un canal par dossier (`d:<id>`), un canal
// de l'étude (`general`) et des canaux libres (`l:<nom>`). Les messages sont PARTAGÉS (même fil pour tous les collaborateurs), gardés
// sur le serveur du bureau, une clé `canal:<id>` par canal (300 derniers messages). Le texte d'un message est du texte ; `html` est le
// rendu d'une réponse de l'agent, nettoyé de nouveau par le poste à l'affichage. Aucun fichier joint n'est gardé : seul son nom l'est.
// Lus, préférences de notification (tous / mentions / muet), favoris, canaux libres et silences par dossier (« Jamais pour ce dossier »)
// sont des clés à part. Rien ici n'envoie quoi que ce soit : les notifications Teams sont dans `notifier.js`.

const CLE_INDEX = 'canaux-index';
const CLE_LIBRES = 'canaux-libres';
const CLE_LUS = 'canaux-lus';
const CLE_PREFS = 'canaux-prefs';
const CLE_SILENCES = 'canaux-silences';
const MAX_MESSAGES = 300;
const MAX_RECENTS = 120;
const MAX_TEXTE = 20000;
const MAX_LIBRES = 40;
const NOTIFICATIONS = ['tous', 'mentions', 'muet'];

const RE_CANAL = /^(general|d:[A-Za-z0-9._:-]{1,80}|l:[a-z0-9-]{1,40})$/;

/** @param {any} v @param {number} n */
const borne = (v, n) => (typeof v === 'string' ? v : '').trim().slice(0, n);
const cleMessages = (/** @type {string} */ id) => `canal:${id}`;
/** @param {any} id */
const canalValide = (id) => typeof id === 'string' && RE_CANAL.test(id);
/** @param {string} dossierId */
const canalDuDossier = (dossierId) => `d:${dossierId}`;

/** Sans accent ni casse. @param {string} s */
const plat = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** « Julie VASSELIN » → « Julie ». @param {string} nom */
function prenomDe(nom) {
  const mots = String(nom || '').trim().split(/\s+/).filter(Boolean);
  const prenom = mots.filter((m) => m !== m.toUpperCase() || !/[A-ZÀ-Ý]/.test(m));
  return (prenom.length ? prenom : mots).join(' ');
}

/**
 * Les collaborateurs cités par « @Prénom » dans un texte, et si CLAIRE l'est (« @CLAIRE »).
 * @param {string} texte @param {string[]} collaborateurs
 */
function mentionsDansTexte(texte, collaborateurs) {
  const t = plat(texte);
  const cites = collaborateurs.filter((c) => {
    const p = plat(prenomDe(c));
    return p && new RegExp(`(^|[^a-z0-9])@${p.replace(/[^a-z0-9]/g, '')}(?![a-z0-9])`).test(t);
  });
  return { collaborateurs: cites, claire: /(^|[^a-z0-9])@claire(?![a-z0-9])/.test(t) };
}

/** @param {any} m @returns {any} */
function assainirMessage(m) {
  if (!m || typeof m !== 'object') return null;
  const id = borne(m.id, 60);
  const quand = Number(m.quand);
  if (!id || !Number.isFinite(quand)) return null;
  const texte = typeof m.texte === 'string' ? m.texte.trim().slice(0, MAX_TEXTE) : '';
  const html = typeof m.html === 'string' && m.html.trim() ? m.html.slice(0, MAX_TEXTE) : '';
  const carte = borne(m.carte, 60);
  if (!texte && !html && !carte) return null;
  return {
    id, quand,
    auteur: borne(m.auteur, 80) || 'CLAIRE',
    claire: m.claire === true,
    via: borne(m.via, 80),
    pour: borne(m.pour, 80),
    texte, html, carte,
    pj: (Array.isArray(m.pj) ? m.pj : []).slice(0, 10).map((p) => ({ nom: borne(p && p.nom, 120), type: borne(p && p.type, 40) })).filter((p) => p.nom),
    mentions: (Array.isArray(m.mentions) ? m.mentions : []).slice(0, 10).map((x) => borne(x, 80)).filter(Boolean),
    modifieLe: Number(m.modifieLe) || 0,
    epingle: m.epingle === true
  };
}

/** @param {any} repo @param {string} id */
function lireMessages(repo, id) {
  const brut = repo.lireJsonBrut(cleMessages(id), null);
  return (Array.isArray(brut) ? brut : []).map(assainirMessage).filter(Boolean).slice(-MAX_MESSAGES);
}

/** @param {any} repo */
function lireIndex(repo) {
  const brut = repo.lireJsonBrut(CLE_INDEX, null);
  return brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
}

/** Extrait d'une ligne de liste : texte brut, 100 caractères. @param {any} m */
function extraitDe(m) {
  const t = (m.texte || String(m.html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return t.length > 100 ? `${t.slice(0, 99).trimEnd()}…` : t;
}

/**
 * Ajoute un message à un canal et met l'index à jour. Rend le message gardé.
 * @param {any} repo @param {string} canal @param {any} brut @param {number} [maintenant]
 */
function ajouterMessage(repo, canal, brut, maintenant) {
  if (!canalValide(canal)) return null;
  const quand = maintenant || Date.now();
  const id = `m${quand.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const m = assainirMessage(Object.assign({}, brut, { id, quand }));
  if (!m) return null;
  const messages = lireMessages(repo, canal);
  messages.push(m);
  repo.ecrireJsonBrut(cleMessages(canal), messages.slice(-MAX_MESSAGES));
  const index = lireIndex(repo);
  const ancien = index[canal] || {};
  const recents = (Array.isArray(ancien.recents) ? ancien.recents : []).concat([[m.quand, m.auteur, m.mentions.concat(m.pour ? [m.pour] : []).join('|'), m.claire ? 1 : 0]]).slice(-MAX_RECENTS);
  index[canal] = { dernierLe: m.quand, dernierAuteur: m.auteur, extrait: extraitDe(m), recents };
  repo.ecrireJsonBrut(CLE_INDEX, index);
  return m;
}

/**
 * Modifier (texte) ou supprimer un message : seulement son auteur. Rend le message, ou null.
 * @param {any} repo @param {string} canal @param {string} id @param {string} par @param {{ texte?: string, supprimer?: boolean, epingle?: boolean }} action @param {number} [maintenant]
 */
function changerMessage(repo, canal, id, par, action, maintenant) {
  if (!canalValide(canal)) return null;
  const messages = lireMessages(repo, canal);
  const i = messages.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const m = messages[i];
  if (action.epingle !== undefined) {
    messages[i] = Object.assign({}, m, { epingle: action.epingle === true });
  } else {
    if (m.auteur !== par || m.claire) return null;
    if (action.supprimer) messages.splice(i, 1);
    else messages[i] = Object.assign({}, m, { texte: String(action.texte || '').slice(0, MAX_TEXTE), html: '', modifieLe: maintenant || Date.now() });
  }
  repo.ecrireJsonBrut(cleMessages(canal), messages);
  return action.supprimer ? m : messages[i];
}

// ---- Lus, préférences, favoris ----

/** @param {any} repo @param {string} cle */
function lireTable(repo, cle) {
  const brut = repo.lireJsonBrut(cle, null);
  return brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
}

/** @param {any} repo @param {string} collab @param {string} canal @param {number} [maintenant] */
function marquerLu(repo, collab, canal, maintenant) {
  if (!canalValide(canal) || !collab) return;
  const lus = lireTable(repo, CLE_LUS);
  lus[collab] = Object.assign({}, lus[collab], { [canal]: maintenant || Date.now() });
  repo.ecrireJsonBrut(CLE_LUS, lus);
}

/** Tout marquer comme lu. @param {any} repo @param {string} collab @param {number} [maintenant] */
function toutMarquerLu(repo, collab, maintenant) {
  if (!collab) return;
  const index = lireIndex(repo);
  const lus = lireTable(repo, CLE_LUS);
  const t = maintenant || Date.now();
  lus[collab] = Object.assign({}, lus[collab], Object.fromEntries(Object.keys(index).map((c) => [c, t])));
  repo.ecrireJsonBrut(CLE_LUS, lus);
}

/** @param {any} repo @param {string} collab @param {string} canal @returns {{ notif: string, favori: boolean }} */
function preferences(repo, collab, canal) {
  const p = (lireTable(repo, CLE_PREFS)[collab] || {})[canal] || {};
  return { notif: NOTIFICATIONS.includes(p.notif) ? p.notif : 'tous', favori: p.favori === true };
}

/** @param {any} repo @param {string} collab @param {string} canal @param {{ notif?: string, favori?: boolean }} changement */
function reglerPreferences(repo, collab, canal, changement) {
  if (!canalValide(canal) || !collab) return null;
  const table = lireTable(repo, CLE_PREFS);
  const avant = preferences(repo, collab, canal);
  const apres = {
    notif: changement.notif !== undefined && NOTIFICATIONS.includes(changement.notif) ? changement.notif : avant.notif,
    favori: changement.favori !== undefined ? changement.favori === true : avant.favori
  };
  table[collab] = Object.assign({}, table[collab], { [canal]: apres });
  repo.ecrireJsonBrut(CLE_PREFS, table);
  return apres;
}

// ---- Canaux libres ----

/** @param {any} repo @returns {{ id: string, nom: string, creePar: string, creeLe: number }[]} */
function lireLibres(repo) {
  const brut = repo.lireJsonBrut(CLE_LIBRES, null);
  return (Array.isArray(brut) ? brut : []).filter((c) => c && canalValide(c.id) && String(c.id).startsWith('l:')).map((c) => ({ id: String(c.id), nom: borne(c.nom, 60), creePar: borne(c.creePar, 80), creeLe: Number(c.creeLe) || 0 })).slice(0, MAX_LIBRES);
}

/** @param {string} nom */
function idLibreDepuisNom(nom) {
  return `l:${plat(nom).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)}`;
}

/** @param {any} repo @param {string} nom @param {string} par @param {number} [maintenant] */
function creerCanalLibre(repo, nom, par, maintenant) {
  const propre = borne(nom, 60);
  const id = idLibreDepuisNom(propre);
  if (!propre || id === 'l:' || !canalValide(id)) return { ok: false, erreur: 'Donnez un nom au canal (lettres et chiffres).' };
  const libres = lireLibres(repo);
  if (libres.some((c) => c.id === id)) return { ok: false, erreur: 'Ce canal existe déjà.', id };
  if (libres.length >= MAX_LIBRES) return { ok: false, erreur: `${MAX_LIBRES} canaux au plus.` };
  libres.push({ id, nom: propre, creePar: par, creeLe: maintenant || Date.now() });
  repo.ecrireJsonBrut(CLE_LIBRES, libres);
  return { ok: true, id, nom: propre };
}

// ---- Silences « Jamais pour ce dossier » ----

/** @param {any} repo @returns {{ dossierId: string, routine: string, par: string, le: number }[]} */
function lireSilences(repo) {
  const brut = repo.lireJsonBrut(CLE_SILENCES, null);
  return (Array.isArray(brut) ? brut : []).filter((s) => s && s.dossierId).map((s) => ({ dossierId: borne(s.dossierId, 80), routine: borne(s.routine, 60), par: borne(s.par, 80), le: Number(s.le) || 0 })).slice(-500);
}

/** @param {any} repo @param {string} dossierId @param {string} routine @param {string} par */
function silencer(repo, dossierId, routine, par) {
  const liste = lireSilences(repo);
  if (!liste.some((s) => s.dossierId === dossierId && s.routine === routine)) liste.push({ dossierId, routine, par, le: Date.now() });
  repo.ecrireJsonBrut(CLE_SILENCES, liste);
}

/** Une routine vide = tout CLAIRE sur ce dossier. @param {any} repo @param {string} dossierId @param {string} routine */
function estSilence(repo, dossierId, routine) {
  return lireSilences(repo).some((s) => s.dossierId === dossierId && (s.routine === routine || s.routine === ''));
}

/** @param {any} repo @param {string} dossierId @param {string} routine */
function leverSilence(repo, dossierId, routine) {
  repo.ecrireJsonBrut(CLE_SILENCES, lireSilences(repo).filter((s) => !(s.dossierId === dossierId && s.routine === routine)));
}

// ---- Liste des canaux d'un collaborateur, avec non-lus ----

/**
 * Pur : non-lus et mentions d'un canal pour un collaborateur, d'après les `recents` de l'index.
 * @param {any} entree @param {number} luLe @param {string} collab
 */
function compterCanal(entree, luLe, collab) {
  const recents = Array.isArray(entree && entree.recents) ? entree.recents : [];
  let nonLus = 0;
  let mentions = 0;
  for (const r of recents) {
    if (!Array.isArray(r) || Number(r[0]) <= luLe || r[1] === collab) continue;
    nonLus += 1;
    if (String(r[2] || '').split('|').includes(collab)) mentions += 1;
  }
  return { nonLus, mentions };
}

/**
 * Les canaux qui ont une activité, les canaux libres et « général », avec non-lus, mentions et préférences ; plus le total du badge
 * (muet = rien, mentions = ses mentions seules).
 * @param {any} repo @param {string} collab
 */
function listerCanaux(repo, collab) {
  const index = lireIndex(repo);
  const lus = lireTable(repo, CLE_LUS)[collab] || {};
  const prefs = lireTable(repo, CLE_PREFS)[collab] || {};
  const libres = lireLibres(repo);
  const ids = new Set(['general', ...libres.map((c) => c.id), ...Object.keys(index)]);
  let badge = 0;
  const canaux = [...ids].filter(canalValide).map((id) => {
    const e = index[id] || {};
    const c = compterCanal(e, Number(lus[id]) || 0, collab);
    const p = prefs[id] || {};
    const notif = NOTIFICATIONS.includes(p.notif) ? p.notif : 'tous';
    badge += notif === 'muet' ? 0 : notif === 'mentions' ? c.mentions : c.nonLus;
    const libre = libres.find((l) => l.id === id);
    return { id, nom: libre ? libre.nom : '', libre: !!libre, dernierLe: Number(e.dernierLe) || 0, dernierAuteur: e.dernierAuteur || '', extrait: e.extrait || '',
      nonLus: c.nonLus, mentions: c.mentions, luLe: Number(lus[id]) || 0, notif, favori: p.favori === true };
  });
  return { canaux, badge };
}

module.exports = {
  CLE_INDEX, NOTIFICATIONS, MAX_MESSAGES, RE_CANAL, canalValide, canalDuDossier, prenomDe, plat, mentionsDansTexte, assainirMessage, lireMessages, lireIndex,
  ajouterMessage, changerMessage, marquerLu, toutMarquerLu, preferences, reglerPreferences, lireLibres, creerCanalLibre, idLibreDepuisNom,
  lireSilences, silencer, estSilence, leverSilence, compterCanal, listerCanaux
};
