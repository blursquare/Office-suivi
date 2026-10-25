// @ts-check
// Réactions (emojis) sur les messages de « Demander à CLAIRE » (étude 25/10 : « un pouce vers le haut confirme que l'on a compris ; Claire
// doit comprendre ces interactions et les garder en mémoire »). Pur : poste, serveur et tests. Le SENS d'un emoji est du code (liste fermée),
// jamais deviné par l'IA ; un emoji hors liste garde le sens « autre ».
(function (exporter) {
  'use strict';

  /** Les emojis proposés d'un clic, comme dans Slack. */
  const EMOJIS_RAPIDES = ['👍', '👎', '✅', '❓', '👀', '🙏', '🎉', '❤️'];
  /** Une palette plus large, pour « Ajouter une réaction ». */
  const EMOJIS_PALETTE = ['👍', '👎', '✅', '❌', '❓', '🤔', '👀', '🙏', '👌', '🎉', '❤️', '😀', '😂', '😅', '😮', '😢', '😡', '🔥', '💡', '⚠️', '📌', '✋', '🔁', '🕐', '🕒', '👥', '📝', '🔒', '🗳️', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '⏳', '👏', '💪', '🙌', '🤝', '✨', '🚀', '😴', '🤷'];

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

  /** Pur : le geste que commande un emoji posé par un collègue — 'epingler' 📌, 'prendre' ✋, 'relancer' 🔁, 'rappeler3'/'rappeler7' 🕐/🕒, 'prevenir' 👥, 'consigne' 📝, 'clore' 🔒, 'decompte' 🗳️ —, sinon ''. @param {unknown} emoji */
  function actionReaction(emoji) {
    const e = String(emoji == null ? '' : emoji).replace(/️/g, '');
    if (e === '📌') return 'epingler';
    if (e === '✋' || e === '🙋') return 'prendre';
    if (e === '🔁' || e === '🔄') return 'relancer';
    if (e === '🕐') return 'rappeler3';
    if (e === '🕒') return 'rappeler7';
    if (e === '👥') return 'prevenir';
    if (e === '📝') return 'consigne';
    if (e === '🔒') return 'clore';
    if (e === '🗳') return 'decompte';
    return '';
  }

  const CLAVIERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

  /**
   * Pur : les options d'un sondage (« sondage : … » puis une option par ligne, « 1. », « - » ou « • » acceptés) et le décompte de leurs
   * réactions 1️⃣ 2️⃣… (CLAIRE ne vote pas). Rend null si le message n'est pas un sondage de deux options au moins.
   * @param {string} texte @param {any} reactions @returns {{ question: string, options: { emoji: string, texte: string, votes: string[] }[] } | null}
   */
  function decompteSondage(texte, reactions) {
    const lignes = String(texte || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lignes.length || !/^sondage\s*:/i.test(lignes[0])) return null;
    const options = lignes.slice(1, 1 + CLAVIERS.length).map((l) => l.replace(/^(?:\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
    if (options.length < 2) return null;
    const liste = Array.isArray(reactions) ? reactions : [];
    return {
      question: lignes[0].replace(/^sondage\s*:\s*/i, '').trim(),
      options: options.map((o, i) => {
        const r = liste.find((x) => x && String(x.emoji).replace(/️/g, '') === CLAVIERS[i].replace(/️/g, ''));
        return { emoji: CLAVIERS[i], texte: o, votes: (r && Array.isArray(r.par) ? r.par : []).filter((p) => p !== 'CLAIRE') };
      })
    };
  }

  exporter({ decompteSondage, CLAVIERS, actionReaction, EMOJIS_RAPIDES, EMOJIS_PALETTE, sensReaction, phraseSensReaction, emojiValide, basculerReaction });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
