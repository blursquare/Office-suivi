// @ts-check
'use strict';
// Canaux de CLAIRE — ce qui s'ajoute à Slack (étude 25/10) : recherche dans tous les canaux, messages enregistrés, statut et présence.
// Comme le reste des canaux : le collaborateur est déclaré par le poste, seuls les membres d'un canal privé le lisent.

const { lireMessages, lireIndex, lireLibres, canalValide, membresPrive, plat, slugPrenom } = require('./canaux');

const CLE_ENREGISTRES = 'canaux-enregistres';
const CLE_STATUTS = 'canaux-statuts';
const MAX_ENREGISTRES = 200;
const MAX_RESULTATS = 40;
const PRESENCE_MS = 3 * 60 * 1000;

/** @param {unknown} v @param {number} n */
const borne = (v, n) => (typeof v === 'string' ? v : '').trim().slice(0, n);

/** @param {any} m */
function texteDuMessage(m) {
  return String(m.texte || String(m.html || '').replace(/<br\s*\/?>|<\/p>|<\/li>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Un collaborateur peut-il lire ce canal ? Un canal privé seulement s'il en est membre. @param {string} id @param {string} collab @param {string[]} collaborateurs */
function accessible(id, collab, collaborateurs) {
  if (!id.startsWith('p:')) return true;
  const m = membresPrive(id, collaborateurs);
  return !!m && m.includes(collab);
}

/** Les canaux où chercher : « général », les canaux libres, tout canal qui a des messages — hors canaux privés des autres. @param {any} repo @param {string} collab @param {string[]} collaborateurs */
function canauxLisibles(repo, collab, collaborateurs) {
  const ids = new Set(['general', ...lireLibres(repo).map((c) => c.id), ...Object.keys(lireIndex(repo))]);
  return [...ids].filter((i) => canalValide(i) && accessible(i, collab, collaborateurs));
}

/**
 * Cherche dans tous les canaux lisibles : chaque mot de la requête doit figurer dans le message (sans accent ni casse) ; `auteur` = un prénom.
 * Les plus récents d'abord, 40 au plus.
 * @param {any} repo @param {string} collab @param {string[]} collaborateurs @param {{ q?: string, auteur?: string }} filtre
 */
function rechercherMessages(repo, collab, collaborateurs, filtre) {
  const mots = plat(filtre.q || '').split(/\s+/).filter((m) => m.length >= 2);
  const slugAuteur = plat(filtre.auteur || '').replace(/[^a-z]/g, '');
  if (!mots.length && !slugAuteur) return [];
  /** @type {any[]} */
  const trouves = [];
  for (const canal of canauxLisibles(repo, collab, collaborateurs)) {
    for (const m of lireMessages(repo, canal)) {
      if (slugAuteur && !(m.claire ? 'claire' === slugAuteur : slugPrenom(m.auteur) === slugAuteur)) continue;
      const texte = texteDuMessage(m);
      const plate = plat(texte);
      if (!mots.every((w) => plate.includes(w))) continue;
      const i = mots.length ? Math.max(0, plate.indexOf(mots[0]) - 40) : 0;
      trouves.push({ canal, mid: m.id, parent: m.parent || '', auteur: m.auteur, claire: m.claire, quand: m.quand, extrait: (i > 0 ? '…' : '') + texte.slice(i, i + 160) + (texte.length > i + 160 ? '…' : '') });
    }
  }
  return trouves.sort((a, b) => b.quand - a.quand).slice(0, MAX_RESULTATS);
}

// ---- Messages enregistrés (« Enregistrés » de Slack) ----

/** @param {any} repo @param {string} collab @returns {{ canal: string, mid: string, le: number }[]} */
function lireEnregistres(repo, collab) {
  const t = repo.lireJsonBrut(CLE_ENREGISTRES, null);
  const liste = t && typeof t === 'object' && !Array.isArray(t) ? t[collab] : null;
  return (Array.isArray(liste) ? liste : []).filter((e) => e && canalValide(e.canal) && typeof e.mid === 'string').map((e) => ({ canal: e.canal, mid: borne(e.mid, 60), le: Number(e.le) || 0 }));
}

/** Enregistre (ou retire) un message pour un collaborateur, 200 au plus. @param {any} repo @param {string} collab @param {string} canal @param {string} mid @param {boolean} actif @param {number} [maintenant] */
function enregistrerMessage(repo, collab, canal, mid, actif, maintenant) {
  if (!collab || !canalValide(canal) || !mid) return null;
  const t = repo.lireJsonBrut(CLE_ENREGISTRES, null);
  const table = t && typeof t === 'object' && !Array.isArray(t) ? t : {};
  const reste = lireEnregistres(repo, collab).filter((e) => !(e.canal === canal && e.mid === mid));
  if (actif) reste.unshift({ canal, mid: borne(mid, 60), le: maintenant || Date.now() });
  table[collab] = reste.slice(0, MAX_ENREGISTRES);
  repo.ecrireJsonBrut(CLE_ENREGISTRES, table);
  return table[collab];
}

/** Les messages enregistrés, avec leur texte (ceux qui n'existent plus sont ignorés). @param {any} repo @param {string} collab @param {string[]} collaborateurs */
function messagesEnregistres(repo, collab, collaborateurs) {
  /** @type {Map<string, any[]>} */
  const cache = new Map();
  const sortie = [];
  for (const e of lireEnregistres(repo, collab)) {
    if (!accessible(e.canal, collab, collaborateurs)) continue;
    if (!cache.has(e.canal)) cache.set(e.canal, lireMessages(repo, e.canal));
    const m = (cache.get(e.canal) || []).find((x) => x.id === e.mid);
    if (m) sortie.push({ canal: e.canal, mid: m.id, auteur: m.auteur, claire: m.claire, quand: m.quand, texte: texteDuMessage(m).slice(0, 600), le: e.le, parent: m.parent || '' });
  }
  return sortie;
}

// ---- Statut et présence ----

/** @param {any} repo @returns {Record<string, { emoji: string, texte: string, jusqu: number }>} */
function lireStatuts(repo) {
  const t = repo.lireJsonBrut(CLE_STATUTS, null);
  return t && typeof t === 'object' && !Array.isArray(t) ? t : {};
}

/** Le statut d'un collaborateur, vide s'il a expiré. @param {any} repo @param {string} collab @param {number} [maintenant] */
function statutDe(repo, collab, maintenant) {
  const s = lireStatuts(repo)[collab];
  if (!s || (!s.emoji && !s.texte)) return { emoji: '', texte: '', jusqu: 0 };
  if (Number(s.jusqu) && Number(s.jusqu) < (maintenant || Date.now())) return { emoji: '', texte: '', jusqu: 0 };
  return { emoji: borne(s.emoji, 16), texte: borne(s.texte, 80), jusqu: Number(s.jusqu) || 0 };
}

/**
 * Pose le statut de `collab` (« En rendez-vous jusqu'à 15 h ») ; `heures` > 0 = expire au bout de ce temps, 0 = jusqu'à nouvel ordre ; vide = effacé.
 * @param {any} repo @param {string} collab @param {{ emoji?: string, texte?: string, heures?: number }} s @param {number} [maintenant]
 */
function poserStatut(repo, collab, s, maintenant) {
  if (!collab) return null;
  const t = maintenant || Date.now();
  const table = lireStatuts(repo);
  const emoji = borne(s.emoji, 16);
  const texte = borne(s.texte, 80);
  const heures = Math.max(0, Math.min(24 * 30, Number(s.heures) || 0));
  if (!emoji && !texte) delete table[collab];
  else table[collab] = { emoji, texte, jusqu: heures ? t + heures * 3600000 : 0 };
  repo.ecrireJsonBrut(CLE_STATUTS, table);
  return statutDe(repo, collab, t);
}

/**
 * Pur : l'absence du jour d'un collaborateur d'après les absences lues dans l'agenda de l'office (journées entières « absent », « congés »…),
 * ou null. `jour` : AAAA-MM-JJ (heure de Paris).
 * @param {any[]} absences @param {string} nom @param {string} jour
 */
function absentLe(absences, nom, jour) {
  const a = (Array.isArray(absences) ? absences : []).find((x) => x && x.collaborateur === nom && String(x.debut) <= jour && jour <= String(x.fin || x.debut));
  return a ? { debut: String(a.debut), fin: String(a.fin || a.debut) } : null;
}

/** Pur : en ligne = vu il y a moins de 3 minutes. @param {number} vuLe @param {number} [maintenant] */
const enLigne = (vuLe, maintenant) => Number(vuLe) > 0 && (maintenant || Date.now()) - Number(vuLe) < PRESENCE_MS;

module.exports = { rechercherMessages, canauxLisibles, accessible, lireEnregistres, enregistrerMessage, messagesEnregistres, lireStatuts, statutDe, poserStatut, enLigne, absentLe, texteDuMessage, PRESENCE_MS };
