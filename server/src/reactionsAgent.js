// @ts-check
'use strict';

// Mémoire des réactions (étude 25/10 : « Claire doit comprendre ces interactions et les garder en mémoire »). Une réaction posée sur un
// message DE CLAIRE (👍 compris, 👎 à corriger, ❓ pas clair…) est gardée en clair sur le serveur du bureau, 90 jours, 300 au plus, avec un
// extrait de la réponse concernée ; l'agent la retrouve par `chercher_conversations` (résultat masqué comme tout résultat d'outil) et la
// lit à son tour de parole suivant (préfixe construit par le poste). Le SENS d'un emoji est du code (`commun/reactions.js`).

const { sensReaction, emojiValide } = /** @type {any} */ (require('../../commun/reactions'));

const CLE_REACTIONS = 'assistant-reactions';
const DUREE_MS = 90 * 24 * 3600 * 1000;
const MAX_REACTIONS = 300;

/** @param {unknown} v @param {number} n */
const borne = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * @typedef {{ id: string, le: number, par: string, emoji: string, sens: string, canal: string, messageId: string, extrait: string, dossierId: string }} ReactionGardee
 */

/** @param {{ lireJsonBrut: Function }} repo @param {number} [maintenant] @returns {ReactionGardee[]} */
function lireReactions(repo, maintenant) {
  const t = maintenant || Date.now();
  const brut = repo.lireJsonBrut(CLE_REACTIONS, []);
  return (Array.isArray(brut) ? brut : []).filter((r) => r && typeof r.id === 'string' && Number(r.le) > t - DUREE_MS);
}

/**
 * Note (ou retire) la réaction de `par` sur un message de Claire. Une seule ligne par personne, message et emoji.
 * @param {{ lireJsonBrut: Function, ecrireJsonBrut: Function }} repo
 * @param {{ par?: string, emoji?: string, canal?: string, messageId?: string, extrait?: string, dossierId?: string, pose?: boolean }} info
 * @param {number} [maintenant]
 * @returns {ReactionGardee | null}
 */
function noterReaction(repo, info, maintenant) {
  const t = maintenant || Date.now();
  const emoji = emojiValide(info && info.emoji);
  const par = borne(info && info.par, 40);
  const messageId = borne(info && info.messageId, 80);
  if (!emoji || !par || !messageId) return null;
  const canal = borne(info.canal, 80);
  const id = `${canal}|${messageId}|${par}|${emoji}`.slice(0, 240);
  const liste = lireReactions(repo, t).filter((r) => r.id !== id);
  /** @type {ReactionGardee | null} */
  let gardee = null;
  if (info.pose !== false) {
    gardee = { id, le: t, par, emoji, sens: sensReaction(emoji), canal, messageId, extrait: borne(info.extrait, 220), dossierId: borne(info.dossierId, 80) };
    liste.unshift(gardee);
  }
  repo.ecrireJsonBrut(CLE_REACTIONS, liste.slice(0, MAX_REACTIONS));
  return gardee;
}

/** @param {{ lireJsonBrut: Function, ecrireJsonBrut: Function }} repo @param {string} id @param {number} [maintenant] */
function oublierReaction(repo, id, maintenant) {
  const avant = lireReactions(repo, maintenant);
  const apres = avant.filter((r) => r.id !== id);
  if (apres.length !== avant.length) repo.ecrireJsonBrut(CLE_REACTIONS, apres);
  return apres.length !== avant.length;
}

/**
 * Pur : une réaction est-elle visible de `moi` ? Un canal partagé (général, dossier, libre) l'est de tous ; une conversation personnelle de son
 * auteur seul ; un canal privé de ses membres (audit 25/10 : le résumé et « Ce que CLAIRE a appris » montraient le privé à toute l'étude).
 * @param {{ canal?: string, par?: string }} r @param {string} moi @param {(canal: string) => string[]} [membresDe]
 */
function reactionVisiblePar(r, moi, membresDe) {
  const canal = String((r && r.canal) || '');
  if (canal === 'general' || /^[dl]:/.test(canal)) return true;
  if (canal === 'perso') return !!moi && r.par === moi;
  if (canal.startsWith('p:')) return !!moi && (membresDe ? membresDe(canal) : []).includes(moi);
  return false;
}

/** Pur : les réactions qui répondent à une recherche (par dossier, sinon les plus récentes), 10 au plus, sous la forme que lit l'agent. @param {ReactionGardee[]} liste @param {string} [dossierId] */
function reactionsPourAgent(liste, dossierId) {
  const filtre = String(dossierId || '');
  return (liste || []).filter((r) => !filtre || r.dossierId === filtre).slice(0, 10)
    .map((r) => ({ date: new Date(r.le).toISOString().slice(0, 10), collaborateur: r.par, emoji: r.emoji, sens: r.sens, // Le « … » en tête : un nom au début de l'extrait n'est plus « en tête de phrase », donc masqué par la règle des majuscules.
    sur_ta_reponse: r.extrait ? `… ${r.extrait}` : '', dossier_id: r.dossierId }));
}

module.exports = { CLE_REACTIONS, lireReactions, noterReaction, oublierReaction, reactionsPourAgent, reactionVisiblePar };
