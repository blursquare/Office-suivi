// @ts-check
'use strict';
// Notification d'une mention (« @Julie ») : un message Teams par la passerelle des rappels, comme les autres rappels internes, au plus un par
// canal et par personne et par heure, jamais pour un canal muet, jamais pour soi-même. Les messages de CLAIRE ne passent pas par ici (leur
// résumé groupé part à l'heure du passage, voir routines/planificateur.js). Un échec est noté, jamais retenté.

const { prenomDe, preferences } = require('./canaux');
const { libelleDossierAffiche } = require('../../../commun/dossier');
const { envoiConfigure } = require('../envoiEmail');
const { noterVerification } = require('../verificationsTerrain');

const CLE_NOTIFS = 'canaux-notifs';
const INTERVALLE_MENTION_MS = 60 * 60 * 1000;
const MAX_MENTIONS_PAR_HEURE = 12;

/**
 * @param {{ parametresRepo: any, depot?: any, envoyer?: (reglages: any, adresse: string, texte: string) => Promise<{ ok: boolean, erreur?: string | null }> }} deps
 */
function creerNotifieur(deps) {
  const { parametresRepo, depot } = deps;
  const envoyer = deps.envoyer || ((r, a, t) => require('../envoiEmail').envoyerEmail(r, a, t));

  /** @param {string} canal */
  const libelleCanal = (canal) => {
    if (canal === 'general') return '# général';
    if (canal.startsWith('d:')) {
      try { const d = depot && depot.trouverParId ? depot.trouverParId(canal.slice(2)) : null; return d ? libelleDossierAffiche(d) : 'un dossier'; } catch (e) { return 'un dossier'; }
    }
    return `# ${canal.slice(2)}`;
  };

  /**
   * @param {string} canal @param {{ auteur: string, texte?: string, mentions?: string[] }} message @param {number} [maintenant]
   * @returns {Promise<string[]>} les collaborateurs prévenus
   */
  async function notifierMentions(canal, message, maintenant) {
    const prevenus = [];
    const t = maintenant || Date.now();
    const cibles = (message.mentions || []).filter((c) => c && c !== message.auteur);
    if (!cibles.length) return prevenus;
    const reglages = parametresRepo.lireReglages();
    if (!envoiConfigure(reglages)) return prevenus;
    for (const cible of cibles) {
      if (preferences(parametresRepo, cible, canal).notif === 'muet') continue;
      // La table est relue et réécrite sans attente entre les deux : deux messages simultanés ne se croisent pas ; au plus 12 messages Teams
      // par heure et par personne, tous canaux confondus ; les entrées de plus d'un jour sont oubliées.
      const table = parametresRepo.lireJsonBrut(CLE_NOTIFS, null) || {};
      for (const k of Object.keys(table)) if (k !== '' && t - Number(table[k]) > 24 * 3600000 && !k.endsWith('|*')) delete table[k];
      const cle = `${cible}|${canal}`;
      if (table[cle] !== undefined && t - Number(table[cle]) < INTERVALLE_MENTION_MS) continue;
      const total = table[`${cible}|*`] && t - Number(table[`${cible}|*`].debut) < INTERVALLE_MENTION_MS ? table[`${cible}|*`] : { debut: t, n: 0 };
      if (total.n >= MAX_MENTIONS_PAR_HEURE) continue;
      const adresse = (reglages.emailsResponsables || {})[cible];
      if (!adresse) continue;
      table[cle] = t;
      table[`${cible}|*`] = { debut: total.debut, n: total.n + 1 };
      parametresRepo.ecrireJsonBrut(CLE_NOTIFS, table);
      const extrait = String(message.texte || '').replace(/\s+/g, ' ').trim().slice(0, 100);
      /** @type {any} */
      let r;
      try { r = await envoyer(reglages, adresse, `💬 CLAIRE — ${prenomDe(message.auteur)} vous a mentionné dans ${libelleCanal(canal)} : « ${extrait} »\nOuvrez CLAIRE (✦ Demander à CLAIRE) pour répondre.`); } catch (e) { r = { ok: false }; }
      if (r && r.ok && r.messageId) {
        try { require('../nettoyageGmail').mettreCopiesEnAttente(parametresRepo, reglages, [r.messageId]); } catch (e) { /* la copie restera dans les envoyés */ }
      }
      noterVerification(parametresRepo, 'canaux-mention-teams', r && r.ok ? { detail: 'mention notifiée sur Teams' } : { ok: false, message: 'mention non notifiée' });
      if (r && r.ok) prevenus.push(cible);
    }
    return prevenus;
  }

  return { notifierMentions };
}

module.exports = { creerNotifieur, INTERVALLE_MENTION_MS };
