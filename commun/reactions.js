// @ts-check
// Réactions (emojis) sur les messages de « Demander à CLAIRE » (étude 25/10 : « un pouce vers le haut confirme que l'on a compris ; Claire
// doit comprendre ces interactions et les garder en mémoire »). Pur : poste, serveur et tests. Le SENS d'un emoji est du code (liste fermée),
// jamais deviné par l'IA ; un emoji hors liste garde le sens « autre ».
(function (exporter) {
  'use strict';

  /** Les emojis proposés d'un clic, comme dans Slack. */
  const EMOJIS_RAPIDES = ['👍', '👎', '✅', '❓', '👀', '🙏', '🎉', '❤️'];
  /** Une palette plus large, pour « Ajouter une réaction ». */
  const EMOJIS_PALETTE = ['👍', '👎', '✅', '❌', '❓', '🤔', '👀', '🙏', '👌', '🎉', '❤️', '😀', '😂', '😅', '😮', '😢', '😡', '🔥', '💡', '⚠️', '📌', '⏳', '👏', '💪', '🙌', '🤝', '✨', '🚀', '😴', '🤷'];

  const SENS = [
    { sens: 'compris', emojis: ['👍', '👌', '✅', '✔️', '☑️', '🙏', '💯'], phrase: 'compris / d\'accord' },
    { sens: 'refus', emojis: ['👎', '❌', '🚫', '⛔'], phrase: 'pas d\'accord / à corriger' },
    { sens: 'pas-clair', emojis: ['❓', '❔', '🤔', '🤷', '😕'], phrase: 'pas clair / à expliquer' },
    { sens: 'vu', emojis: ['👀', '⏳', '📌'], phrase: 'vu / pris en compte, à traiter' },
    { sens: 'content', emojis: ['❤️', '🎉', '👏', '🙌', '😀', '😄', '🔥', '✨', '🚀', '💪', '🤝'], phrase: 'content / bravo' }
  ];

  /** Pur : le sens d'un emoji — 'compris', 'refus', 'pas-clair', 'vu', 'content', sinon 'autre'. @param {unknown} emoji */
  function sensReaction(emoji) {
    const e = String(emoji == null ? '' : emoji).replace(/️/g, '');
    const trouve = SENS.find((s) => s.emojis.some((x) => x.replace(/️/g, '') === e));
    return trouve ? trouve.sens : 'autre';
  }

  /** Pur : « compris / d'accord » pour un sens, la phrase que lit Claire. @param {string} sens */
  function phraseSensReaction(sens) {
    const t = SENS.find((s) => s.sens === sens);
    return t ? t.phrase : 'réaction libre';
  }

  /** Pur : un emoji acceptable (un seul pictogramme, sa variante, un drapeau ou une touche — 16 caractères au plus), sinon ''. @param {unknown} emoji */
  function emojiValide(emoji) {
    const e = String(emoji == null ? '' : emoji).trim();
    if (!e || e.length > 16) return '';
    return /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]️?⃣)(?:[️‍\u{1F3FB}-\u{1F3FF}]|\p{Extended_Pictographic})*$/u.test(e) ? e : '';
  }

  /**
   * Pur : la liste des réactions d'un message après le geste de `par` (clic = ajout, second clic = retrait). Une réaction par personne et par emoji.
   * @param {any} reactions @param {string} emoji @param {string} par @param {boolean} [actif] forcer l'ajout ou le retrait
   * @returns {{ emoji: string, par: string[] }[]}
   */
  function basculerReaction(reactions, emoji, par, actif) {
    const e = emojiValide(emoji);
    const liste = (Array.isArray(reactions) ? reactions : []).map((r) => ({ emoji: String(r && r.emoji || ''), par: (Array.isArray(r && r.par) ? r.par : []).map(String) })).filter((r) => r.emoji && r.par.length);
    if (!e || !par) return liste;
    const i = liste.findIndex((r) => r.emoji === e);
    const present = i >= 0 && liste[i].par.includes(par);
    const veutAjouter = actif === undefined ? !present : actif === true;
    if (veutAjouter && !present) {
      if (i >= 0) liste[i].par.push(par); else if (liste.length < 20) liste.push({ emoji: e, par: [par] });
    } else if (!veutAjouter && present) {
      liste[i].par = liste[i].par.filter((p) => p !== par);
      if (!liste[i].par.length) liste.splice(i, 1);
    }
    return liste.map((r) => ({ emoji: r.emoji, par: r.par.slice(0, 50) }));
  }

  exporter({ EMOJIS_RAPIDES, EMOJIS_PALETTE, sensReaction, phraseSensReaction, emojiValide, basculerReaction });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
