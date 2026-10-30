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
// Première lecture du dernier message d'un canal privé, par collaborateur : { [collab]: { [canal]: { apres, le } } } — l'heure de l'œil « Vu »,
// figée (relecture 0.375.0 : la dernière lecture avançait toutes les 20 s et rechargeait le canal).
const CLE_VUS = 'canaux-vus';
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
  // Un fichier envoyé seul (pièce jointe sans texte) est un message (étude 30/10).
  if (!texte && !html && !carte && !(Array.isArray(m.pj) && m.pj.some((p) => p && typeof p.nom === 'string' && p.nom.trim()))) return null;
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
  const recents = (Array.isArray(ancien.recents) ? ancien.recents : []).concat([[m.quand, m.auteur, m.mentions.concat(m.pour ? [m.pour] : []).join('|'), m.claire ? 1 : 0, m.carte ? 1 : 0, m.via || '', m.pour || '']]).slice(-MAX_RECENTS);
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
  const t = maintenant || Date.now();
  const lus = lireTable(repo, CLE_LUS);
  lus[collab] = Object.assign({}, lus[collab], { [canal]: t });
  repo.ecrireJsonBrut(CLE_LUS, lus);
  if (!canal.startsWith('p:') && !canal.startsWith('d:')) return;
  // Canal privé ou de dossier : la PREMIÈRE lecture après le dernier message est retenue une fois (l'heure de l'œil « Vu »).
  const dernier = Number((lireIndex(repo)[canal] || {}).dernierLe) || 0;
  if (!dernier || t < dernier) return;
  const vus = lireTable(repo, CLE_VUS);
  const v = (vus[collab] || {})[canal];
  if (v && v.apres === dernier) return;
  vus[collab] = Object.assign({}, vus[collab], { [canal]: { apres: dernier, le: t } });
  repo.ecrireJsonBrut(CLE_VUS, vus);
}

/**
 * Quand chacun des AUTRES membres d'un canal privé ou de dossier l'a lu (étude 27/10 : « un petit œil comme sur Teams pour voir si notre
 * message a été lu », puis « aussi dans les canaux de dossier ») — seulement pour l'un de ses membres ; {} pour « général » et les canaux libres.
 * @param {any} repo @param {string} canal @param {string} lecteur @param {string[]} collaborateurs @returns {Record<string, number>}
 */
function lusParAutresMembres(repo, canal, lecteur, collaborateurs) {
  // Canal de dossier (étude 27/10 : « mets aussi l'œil dans les canaux de dossier ») : toute l'étude en est membre.
  const membres = canalValide(canal) && canal.startsWith('d:') ? (collaborateurs || []).slice() : membresPrive(canal, collaborateurs);
  if (!membres || !membres.includes(lecteur)) return {};
  const lus = lireTable(repo, CLE_LUS);
  const vus = lireTable(repo, CLE_VUS);
  const dernier = Number((lireIndex(repo)[canal] || {}).dernierLe) || 0;
  // Dernier message lu : l'heure de sa PREMIÈRE lecture (figée) ; sinon la dernière lecture, qui reste avant lui. Stable tant que rien ne
  // change : la signature du canal ne bouge qu'au moment où le message est vu.
  return Object.fromEntries(membres.filter((m) => m !== lecteur).map((m) => {
    const lu = Number((lus[m] || {})[canal]) || 0;
    const v = (vus[m] || {})[canal];
    return [m, dernier && lu >= dernier ? (v && v.apres === dernier ? Number(v.le) || lu : dernier) : lu];
  }));
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

/**
 * `responsableDe` (facultatif) : pour la valeur par défaut d'un canal de dossier (`notifParDefautDossier`), comme dans la liste des canaux.
 * @param {any} repo @param {string} collab @param {string} canal @param {(dossierId: string) => string} [responsableDe] @returns {{ notif: string, favori: boolean }}
 */
function preferences(repo, collab, canal, responsableDe) {
  const p = (lireTable(repo, CLE_PREFS)[collab] || {})[canal] || {};
  if (NOTIFICATIONS.includes(p.notif)) return { notif: p.notif, favori: p.favori === true };
  const mode = modeAlertesDossier(collab);
  const resp = String(canal).startsWith('d:') && mode === 'responsable' && responsableDe ? String(responsableDe(String(canal).slice(2)) || '') : '';
  return { notif: notifParDefautDossier(canal, mode, collab, resp), favori: p.favori === true };
}

/** @param {any} repo @param {string} collab @param {string} canal @param {{ notif?: string, favori?: boolean }} changement */
function reglerPreferences(repo, collab, canal, changement) {
  if (!canalValide(canal) || !collab) return null;
  const table = lireTable(repo, CLE_PREFS);
  const avant = (table[collab] || {})[canal] || {};
  // Un favori changé seul ne fige pas la notification : sans choix du collaborateur, elle reste la valeur par défaut (notifParDefautDossier).
  const notif = changement.notif !== undefined && NOTIFICATIONS.includes(changement.notif) ? changement.notif : (NOTIFICATIONS.includes(avant.notif) ? avant.notif : '');
  const apres = Object.assign(notif ? { notif } : {}, { favori: changement.favori !== undefined ? changement.favori === true : avant.favori === true });
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

// Qui reçoit les alertes de CLAIRE dans les conversations de dossier (étude 29/10) : Bastien, celles de tous les dossiers ; Julie et Jérémy,
// celles de leurs dossiers ; Sophie, aucune (elle ne reçoit que les factures de succession et ses messages). Dans tous les cas, la réponse de
// CLAIRE à SA demande (`via`) et un message qui le cite lui arrivent.
const VOIT_TOUTES_LES_ALERTES = ['Bastien ANGLUMENT'];
const SANS_ALERTES_DE_DOSSIER = ['Sophie GOSSART'];
/** Pure : 'toutes' | 'aucune' | 'responsable'. @param {string} collab */
function modeAlertesDossier(collab) { return VOIT_TOUTES_LES_ALERTES.includes(collab) ? 'toutes' : SANS_ALERTES_DE_DOSSIER.includes(collab) ? 'aucune' : 'responsable'; }

/**
 * Pur : la notification d'un canal tant que le collaborateur n'a rien réglé (étude 30/10 : « il ne faut pas de notification pour les conversations
 * de dossier pour le collaborateur qui n'est pas concerné ; seul Bastien a toutes les notifications ») : le canal d'un dossier dont il n'est pas
 * le responsable ne le prévient que s'il est cité (« mentions ») ; Bastien, tout ; Sophie, ses mentions seulement ; responsable inconnu : tout,
 * comme avant. Un réglage fait par le collaborateur (Tous / Mentions / Muet) passe toujours avant.
 * @param {string} canal @param {string} mode @param {string} collab @param {string} resp
 */
function notifParDefautDossier(canal, mode, collab, resp) {
  if (!String(canal).startsWith('d:') || mode === 'toutes' || !collab) return 'tous';
  if (mode === 'aucune') return 'mentions';
  return resp && resp !== collab ? 'mentions' : 'tous';
}

/**
 * Pure : un message de CLAIRE (carte de proposition comprise : elle porte son responsable en `pour`) dans le canal d'un DOSSIER est-il caché à ce collaborateur ?
 * `x.via` : celui qui l'a demandé ; `x.pour` : le responsable alerté ; `x.mention` : il cite le collaborateur. `resp` : le responsable du dossier ('' inconnu).
 * @param {string} mode @param {string} collab @param {string} resp @param {{ via?: string, pour?: string, mention?: boolean }} x
 */
function claireMasquee(mode, collab, resp, x) {
  if (x.via === collab || x.mention) return false;
  if (x.pour) return mode === 'toutes' ? false : mode === 'aucune' ? true : (x.pour !== collab && resp !== collab);
  if (x.via) return true;
  return mode === 'toutes' ? false : mode === 'aucune' ? true : (!!resp && resp !== collab);
}

/** Pur : les champs d'un élément de `recents` (les anciens n'ont ni `via` ni `pour` : le premier cité d'un message de CLAIRE est son `pour`). @param {any[]} r @param {string} collab */
function champsRecent(r, collab) {
  const cites = String(r[2] || '').split('|').filter(Boolean);
  const pour = r[6] !== undefined ? String(r[6] || '') : (r[3] === 1 && cites.length ? cites[0] : '');
  return { via: String(r[5] || ''), pour, mention: cites.includes(collab) && pour !== collab };
}

/**
 * Pur : non-lus et mentions d'un canal pour un collaborateur, d'après les `recents` de l'index. `sansClaire` : les messages de CLAIRE ne
 * comptent pas (booléen : sauf s'ils le citent ; fonction `(champs) => boolean` : `claireMasquee` pour un canal de dossier).
 * @param {any} entree @param {number} luLe @param {string} collab @param {boolean | ((x: { via: string, pour: string, mention: boolean }) => boolean)} [sansClaire]
 */
function compterCanal(entree, luLe, collab, sansClaire) {
  const recents = Array.isArray(entree && entree.recents) ? entree.recents : [];
  let nonLus = 0;
  let mentions = 0;
  let nonLusCartes = 0;   // propositions des routines (message de CLAIRE avec sa carte) : la pastille les compte par « À traiter »
  let mentionsCartes = 0;   // dont celles qui « citent » leur responsable (`pour`) — pas une mention pour la pastille
  for (const r of recents) {
    if (!Array.isArray(r) || Number(r[0]) <= luLe || r[1] === collab) continue;
    const cite = String(r[2] || '').split('|').includes(collab);
    if (sansClaire && r[3] === 1) {
      if (typeof sansClaire === 'function') { if (sansClaire(champsRecent(r, collab))) continue; }
      else if (!cite) continue;
    }
    nonLus += 1;
    if (cite) mentions += 1;
    // Une réponse de CLAIRE, la veille ou un message qui vous cite restent des messages ; seule la carte d'une proposition est à part
    // (relecture 25/10 : la carte est adressée à son responsable par `pour`, qui la range parmi ses mentions).
    if (r[3] === 1 && r[4] === 1) { nonLusCartes += 1; if (cite) mentionsCartes += 1; }
  }
  return { nonLus, mentions, nonLusCartes, mentionsCartes };
}

/**
 * Les canaux qui ont une activité, les canaux libres et « général », avec non-lus, mentions et préférences ; plus le total du badge
 * (muet = rien, mentions = ses mentions seules).
 * `responsableDe(dossierId)` : le responsable d'un dossier ('' inconnu) — les messages de CLAIRE d'un canal de dossier ne comptent que pour lui.
 * @param {any} repo @param {string} collab @param {string[]} [collaborateurs] @param {(dossierId: string) => string} [responsableDe]
 */
function listerCanaux(repo, collab, collaborateurs, responsableDe) {
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
    // Le responsable n'est lu que s'il y a un message de CLAIRE non lu (audit 0.383.1 : un blob par canal à chaque relevé sinon) ; un dossier
    // sans responsable connu : les messages de CLAIRE comptent pour tous, comme avant.
    const luLe = Number(lus[id]) || 0;
    const mode = modeAlertesDossier(collab);
    // Le responsable, pour chaque canal de dossier (la notification par défaut en dépend, même canal lu) : la route le garde 30 s en mémoire.
    const resp = id.startsWith('d:') && mode === 'responsable' && responsableDe ? String(responsableDe(id.slice(2)) || '') : '';
    const c = compterCanal(e, luLe, collab, id.startsWith('d:') ? (x) => claireMasquee(mode, collab, resp, x) : false);
    const p = prefs[id] || {};
    const notif = NOTIFICATIONS.includes(p.notif) ? p.notif : notifParDefautDossier(id, mode, collab, resp);
    // Comme la pastille du poste : les cartes de proposition comptent par « À traiter », pas comme messages (audit 0.383.1 : une carte
    // déjà décidée depuis « À traiter » laissait l'étincelle allumée).
    badge += notif === 'muet' ? 0 : notif === 'mentions' ? Math.max(0, c.mentions - c.mentionsCartes) : Math.max(0, c.nonLus - c.nonLusCartes);
    const libre = libres.find((l) => l.id === id);
    return { id, nom: libre ? libre.nom : '', libre: !!libre, prive: id.startsWith('p:'), membres: id.startsWith('p:') ? (membresPrive(id, collaborateurs || []) || []) : undefined, dernierLe: Number(e.dernierLe) || 0, dernierAuteur: e.dernierAuteur || '', extrait: e.extrait || '',
      nonLus: c.nonLus, mentions: c.mentions, nonLusCartes: c.nonLusCartes, mentionsCartes: c.mentionsCartes, luLe: Number(lus[id]) || 0, notif, favori: p.favori === true };
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
  ajouterMessage, changerMessage, marquerLu, lusParAutresMembres, toutMarquerLu, preferences, reglerPreferences, lireLibres, creerCanalLibre, idLibreDepuisNom,
  modeAlertesDossier, notifParDefautDossier, claireMasquee, lireSilences, silencer, estSilence, leverSilence, compterCanal, listerCanaux
};
