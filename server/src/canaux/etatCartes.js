// @ts-check
'use strict';
// L'état d'une proposition de CLAIRE, dit par des réactions de CLAIRE sur sa carte (étude 25/10, comme un robot Slack) : ✅ acceptée,
// ❌ refusée, 💤 expirée, ⏳ sans réponse depuis plus d'un jour. Les collègues lisent l'état d'un coup d'œil dans le canal du dossier ;
// une seule réaction d'état à la fois. Rien n'est envoyé : c'est de l'affichage, recalculé depuis l'état des propositions.

const { lirePropositions } = require('../routines/propositions');
const { lireMessages, reagirMessage, canalDuDossier } = require('./canaux');

const CLE_ETAT_CARTES = 'canaux-cartes-etat';
const ETATS_EMOJIS = ['⏳', '✅', '❌', '💤'];
const ATTENTE_MS = 24 * 3600 * 1000;

/** Pur : l'emoji d'état d'une proposition ('' = aucun). @param {any} p @param {number} maintenant */
function emojiEtatCarte(p, maintenant) {
  if (!p) return '';
  if (p.etat === 'acceptee') return '✅';
  if (p.etat === 'refusee') return '❌';
  if (p.etat === 'expiree') return '💤';
  if ((p.etat === 'proposee' || p.etat === 'vue') && p.creeLe && maintenant - Date.parse(p.creeLe) >= ATTENTE_MS) return '⏳';
  return '';
}

/**
 * Pose, change ou retire la réaction d'état de chaque carte dont l'état a changé depuis la dernière fois. Rend le nombre de cartes touchées.
 * @param {any} repo @param {number} [maintenant]
 */
function synchroniserEtatCartes(repo, maintenant) {
  const t = maintenant || Date.now();
  const brut = repo.lireJsonBrut(CLE_ETAT_CARTES, null);
  /** @type {Record<string, string>} */
  const marques = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  let touchees = 0;
  let change = false;
  for (const p of lirePropositions(repo)) {
    const veut = emojiEtatCarte(p, t);
    const a = marques[p.id] || '';
    if (veut === a) continue;
    const canal = p.dossierId ? canalDuDossier(p.dossierId) : 'general';
    const message = lireMessages(repo, canal).find((m) => m.carte === p.id);
    if (message) {
      for (const e of ETATS_EMOJIS) if (e !== veut) reagirMessage(repo, canal, message.id, 'CLAIRE', e, false);
      if (veut) reagirMessage(repo, canal, message.id, 'CLAIRE', veut, true);
      touchees += 1;
    }
    if (veut) marques[p.id] = veut; else delete marques[p.id];
    change = true;
  }
  if (change) repo.ecrireJsonBrut(CLE_ETAT_CARTES, marques);
  return touchees;
}

module.exports = { emojiEtatCarte, synchroniserEtatCartes };
