// @ts-check
'use strict';
// Canaux de CLAIRE (étude 24/10, 0.328.0) : « un slack » où CLAIRE écrit et où l'étude répond. Un canal par dossier (`d:<id>`), un canal
// de l'étude (`general`) et des canaux libres (`l:<nom>`). Les messages sont PARTAGÉS (même fil pour tous les collaborateurs), gardés
// sur le serveur du bureau, une clé `canal:<id>` par canal (300 derniers messages). Le texte d'un message est du texte ; `html` est le
// rendu d'une réponse de l'agent, nettoyé de nouveau par le poste à l'affichage. Un fichier joint est gardé à part, sur le serveur, 90 jours
// (`piecesJointes.js`, étude 25/10) : le message ne porte que son nom, sa sorte et son identifiant.
// Lus, préférences de notification (tous / mentions / muet), favoris, canaux libres et silences par dossier (« Jamais pour ce dossier »)
// sont des clés à part. Rien ici n'envoie quoi que ce soit : les notifications Teams sont dans `notifier.js`.

const { basculerReaction, emojiValide, sensReaction } = /** @type {any} */ (require('../../../commun/reactions'));

const CLE_INDEX = 'canaux-index';
const CLE_LIBRES = 'canaux-libres';
const CLE_LUS = 'canaux-lus';
const CLE_PREFS = 'canaux-prefs';
const CLE_SILENCES = 'canaux-silences';
const MAX_MESSAGES = 300;
const MAX_RECENTS = 120;
const MAX_TEXTE = 20000;
const MAX_LIBRES = 40;
const MAX_CANAUX_INDEX = 600;
const MAX_TEXTE_PERSONNE = 8000;
// Durée de conservation des messages d'un canal : 12 mois (choix raisonnable en attendant le registre des traitements de l'étude).
const JOURS_CONSERVATION_MESSAGES = 365;
const NOTIFICATIONS = ['tous', 'mentions', 'muet'];

// `p:julie-bastien` = messages privés (2 ou 3 prénoms rangés par ordre alphabétique, étude 25/10).
const RE_CANAL = /^(general|d:[A-Za-z0-9._:-]{1,120}|l:[a-z0-9-]{1,40}|p:[a-z]{2,20}(?:-[a-z]{2,20}){1,2})$/;

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
    // Une pièce jointe : son nom, sa sorte et, si le fichier est gardé sur le serveur (étude 25/10, 90 jours), son identifiant opaque.
    pj: (Array.isArray(m.pj) ? m.pj : []).slice(0, 10).map((p) => ({ nom: borne(p && p.nom, 120), type: borne(p && p.type, 40),
      ...(p && typeof p.fichierId === 'string' && /^[a-f0-9]{32}$/.test(p.fichierId) ? { fichierId: p.fichierId, taille: Math.max(0, Number(p.taille) || 0) } : {}),
      // Un fichier du NAS n'est pas copié : le message garde le lien (dossier + chemin dans le dossier du client), relu par l'explorateur confiné.
      ...(p && p.nas && typeof p.nas === 'object' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(String(p.nas.dossierId)) && typeof p.nas.chemin === 'string' && p.nas.chemin && p.nas.chemin.length <= 400 && !p.nas.chemin.split('/').includes('..')
        ? { nas: { dossierId: String(p.nas.dossierId), chemin: p.nas.chemin } } : {}) })).filter((p) => p.nom),
    mentions: (Array.isArray(m.mentions) ? m.mentions : []).slice(0, 10).map((x) => borne(x, 80)).filter(Boolean),
    modifieLe: Number(m.modifieLe) || 0,
    epingle: m.epingle === true,
    // Un fil clos (🔒, étude 25/10) : replié, plus de réponse attendue.
    clos: m.clos === true,
    // Un fil de discussion (étude 25/10) : la réponse porte l'identifiant du message de départ.
    parent: borne(m.parent, 60),
    // Réactions (étude 25/10) : un emoji et les prénoms de ceux qui l'ont posé.
    reactions: basculerReaction(m.reactions, '', '')
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
  const ids = Object.keys(index);
  if (ids.length > MAX_CANAUX_INDEX) ids.sort((a, b) => (Number(index[a].dernierLe) || 0) - (Number(index[b].dernierLe) || 0)).slice(0, ids.length - MAX_CANAUX_INDEX).forEach((i) => { delete index[i]; });
  repo.ecrireJsonBrut(CLE_INDEX, index);
  return m;
}

/**
 * Modifier (texte) ou supprimer un message : seulement son auteur ; épingler et clore un fil : ouverts à tous (comme Slack). Rend le message, ou null.
 * @param {any} repo @param {string} canal @param {string} id @param {string} par @param {{ texte?: string, supprimer?: boolean, epingle?: boolean, clos?: boolean, mentions?: string[] }} action @param {number} [maintenant]
 */
function changerMessage(repo, canal, id, par, action, maintenant) {
  if (!canalValide(canal)) return null;
  const messages = lireMessages(repo, canal);
  const i = messages.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const m = messages[i];
  if (action.clos !== undefined) {
    if (m.parent) return null;
    messages[i] = Object.assign({}, m, { clos: action.clos === true });
  } else if (action.epingle !== undefined) {
    messages[i] = Object.assign({}, m, { epingle: action.epingle === true });
  } else {
    if (m.auteur !== par || m.claire) return null;
    if (action.supprimer) messages.splice(i, 1);
    else {
      const texte = String(action.texte || '').trim().slice(0, MAX_TEXTE_PERSONNE);
      if (!texte) return null;
      messages[i] = Object.assign({}, m, { texte, html: '', mentions: (action.mentions || []).slice(0, 10), modifieLe: maintenant || Date.now() });
    }
  }
  repo.ecrireJsonBrut(cleMessages(canal), messages);
  return action.supprimer ? m : messages[i];
}

/**
 * Pose ou retire la réaction d'une personne sur un message (n'importe qui peut réagir à n'importe quel message). Rend le message et le sens
 * de l'emoji, ou null si le canal, le message ou l'emoji est inconnu.
 * @param {any} repo @param {string} canal @param {string} id @param {string} par @param {string} emoji @param {boolean} [actif]
 */
function reagirMessage(repo, canal, id, par, emoji, actif) {
  if (!canalValide(canal) || !emojiValide(emoji) || !par) return null;
  const messages = lireMessages(repo, canal);
  const i = messages.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const reactions = basculerReaction(messages[i].reactions, emoji, par, actif);
  messages[i] = Object.assign({}, messages[i], { reactions });
  repo.ecrireJsonBrut(cleMessages(canal), messages);
  const pose = reactions.some((r) => r.emoji === emojiValide(emoji) && r.par.includes(par));
  return { message: messages[i], pose, sens: sensReaction(emoji) };
}

// ---- Messages privés (étude 25/10) ----

/** « Julie VASSELIN » → « julie ». @param {string} nom */
const slugPrenom = (nom) => plat(prenomDe(nom)).replace(/[^a-z]/g, '');

/** L'identifiant du canal privé de ces collaborateurs (2 ou 3, ordre indifférent), ou ''. @param {string[]} noms */
function idPrive(noms) {
  const slugs = [...new Set((noms || []).map(slugPrenom).filter(Boolean))].sort();
  return slugs.length >= 2 && slugs.length <= 3 ? `p:${slugs.join('-')}` : '';
}

/** Les collaborateurs d'un canal privé, ou null si l'identifiant n'en est pas un ou cite un inconnu. @param {string} id @param {string[]} collaborateurs */
function membresPrive(id, collaborateurs) {
  if (!canalValide(id) || !id.startsWith('p:')) return null;
  const slugs = id.slice(2).split('-');
  const membres = slugs.map((s) => (collaborateurs || []).find((c) => slugPrenom(c) === s) || '');
  return membres.every(Boolean) && new Set(membres).size === membres.length ? membres : null;
}

/** Les canaux privés d'un collaborateur : un avec chaque collègue, et un de groupe quand l'équipe tient à trois. @param {string} collab @param {string[]} collaborateurs */
function privesPour(collab, collaborateurs) {
  if (!collab || !(collaborateurs || []).includes(collab)) return [];
  const autres = collaborateurs.filter((c) => c !== collab);
  const ids = autres.map((a) => idPrive([collab, a]));
  if (collaborateurs.length === 3) ids.push(idPrive(collaborateurs));
  return ids.filter(Boolean);
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
  let nonLusClaire = 0;   // messages de CLAIRE (réponses, propositions des routines) : la pastille les compte par « À traiter »
  for (const r of recents) {
    if (!Array.isArray(r) || Number(r[0]) <= luLe || r[1] === collab) continue;
    nonLus += 1;
    if (r[3] === 1) nonLusClaire += 1;
    if (String(r[2] || '').split('|').includes(collab)) mentions += 1;
  }
  return { nonLus, mentions, nonLusClaire };
}

/**
 * Les canaux qui ont une activité, les canaux libres et « général », avec non-lus, mentions et préférences ; plus le total du badge
 * (muet = rien, mentions = ses mentions seules).
 * @param {any} repo @param {string} collab
 */
function listerCanaux(repo, collab, collaborateurs) {
  const index = lireIndex(repo);
  const lus = lireTable(repo, CLE_LUS)[collab] || {};
  const prefs = lireTable(repo, CLE_PREFS)[collab] || {};
  const libres = lireLibres(repo);
  const prives = privesPour(collab, collaborateurs || []);
  // Un canal privé n'est listé que pour ses membres, même s'il a de l'activité.
  const ids = new Set(['general', ...libres.map((c) => c.id), ...Object.keys(index).filter((i) => !i.startsWith('p:')), ...prives]);
  let badge = 0;
  const canaux = [...ids].filter(canalValide).map((id) => {
    const e = index[id] || {};
    const c = compterCanal(e, Number(lus[id]) || 0, collab);
    const p = prefs[id] || {};
    const notif = NOTIFICATIONS.includes(p.notif) ? p.notif : 'tous';
    badge += notif === 'muet' ? 0 : notif === 'mentions' ? c.mentions : c.nonLus;
    const libre = libres.find((l) => l.id === id);
    return { id, nom: libre ? libre.nom : '', libre: !!libre, prive: id.startsWith('p:'), membres: id.startsWith('p:') ? (membresPrive(id, collaborateurs || []) || []) : undefined, dernierLe: Number(e.dernierLe) || 0, dernierAuteur: e.dernierAuteur || '', extrait: e.extrait || '',
      nonLus: c.nonLus, mentions: c.mentions, nonLusClaire: c.nonLusClaire, luLe: Number(lus[id]) || 0, notif, favori: p.favori === true };
  });
  return { canaux, badge };
}

/**
 * Retire les canaux de dossier dont le dossier n'existe plus (messages vidés, entrée d'index retirée). Rend le nombre de canaux retirés.
 * @param {any} repo @param {(dossierId: string) => boolean} existe
 */
function purgerCanauxOrphelins(repo, existe) {
  const index = lireIndex(repo);
  let n = 0;
  for (const id of Object.keys(index)) {
    if (!id.startsWith('d:') || existe(id.slice(2))) continue;
    repo.ecrireJsonBrut(cleMessages(id), []);
    delete index[id];
    n += 1;
  }
  if (n) repo.ecrireJsonBrut(CLE_INDEX, index);
  return n;
}

/**
 * Retire les messages de plus de `JOURS_CONSERVATION_MESSAGES` jours (les épinglés ne sont pas épargnés : ils contiennent aussi des données de clients).
 * Rend le nombre de messages retirés.
 * @param {any} repo @param {number} [maintenant]
 */
function purgerMessagesAnciens(repo, maintenant) {
  const limite = (maintenant || Date.now()) - JOURS_CONSERVATION_MESSAGES * 86400000;
  const index = lireIndex(repo);
  let retires = 0;
  for (const id of Object.keys(index)) {
    if (!canalValide(id)) continue;
    const e = index[id];
    if (!Number.isFinite(Number(e && e.dernierLe)) || Number(e.dernierLe) >= limite) {
      // Le dernier message est récent : on ne relit le canal que s'il a de vieux messages (les événements récents le disent).
      const plusAncien = Array.isArray(e && e.recents) && e.recents.length ? Math.min(...e.recents.map((r) => Number(r[0]))) : Infinity;
      // 120 événements récents pleins : le canal peut porter des messages plus vieux qu'eux (audit 25/10) — on relit.
      if (!(plusAncien < limite) && !(Array.isArray(e && e.recents) && e.recents.length >= MAX_RECENTS)) continue;
    }
    const messages = lireMessages(repo, id);
    const gardes = messages.filter((m) => m.quand >= limite);
    if (gardes.length === messages.length) continue;
    retires += messages.length - gardes.length;
    repo.ecrireJsonBrut(cleMessages(id), gardes);
    if (!gardes.length) delete index[id];
    else index[id] = Object.assign({}, e, { recents: (Array.isArray(e.recents) ? e.recents : []).filter((r) => Number(r[0]) >= limite) });
  }
  if (retires) repo.ecrireJsonBrut(CLE_INDEX, index);
  return retires;
}

module.exports = {
  JOURS_CONSERVATION_MESSAGES, purgerMessagesAnciens, MAX_TEXTE_PERSONNE, MAX_CANAUX_INDEX, purgerCanauxOrphelins,
  CLE_INDEX, NOTIFICATIONS, MAX_MESSAGES, RE_CANAL, canalValide, canalDuDossier, prenomDe, plat, mentionsDansTexte, assainirMessage, reagirMessage, slugPrenom, idPrive, membresPrive, privesPour, lireMessages, lireIndex,
  ajouterMessage, changerMessage, marquerLu, toutMarquerLu, preferences, reglerPreferences, lireLibres, creerCanalLibre, idLibreDepuisNom,
  lireSilences, silencer, estSilence, leverSilence, compterCanal, listerCanaux
};
