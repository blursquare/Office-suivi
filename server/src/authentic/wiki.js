// @ts-check
// Mémoire du wiki d'Authentic pour Claude qui pilote (étude 29/10 : « donne à l'agent qui utilise Authentic seul la mémoire du wiki et des captures pour qu'il
// puisse faire autre chose aussi à la demande »). Le résumé du wiki public de Fichorga (lu le 27/10, paraphrasé : aucune donnée de client) est découpé en
// passages (data/wiki-authentic.json) ; `chercherWiki` rend les plus proches d'une question, sans IA ni jeton. Le chemin du fichier est littéral : il est embarqué dans le .exe.
const PASSAGES = require('../data/wiki-authentic.json');

/** Pure : mots d'une question, sans accent, 3 lettres au moins, sans mots vides. @param {string} t */
function motsDe(t) {
  const vides = new Set(['les', 'des', 'une', 'dans', 'pour', 'par', 'sur', 'avec', 'que', 'qui', 'est', 'sont', 'comment', 'faire', 'peut', 'plus', 'pas', 'aux', 'ces', 'ses', 'son', 'leur', 'the', 'and']);
  return Array.from(new Set(String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !vides.has(m))));
}

/** Pure : les passages les plus proches de la question (titre pesant triple), { titre, texte }, `n` au plus. @param {string} question @param {number} [n] @param {{ f: string, t: string, x: string }[]} [base] */
function chercherWiki(question, n, base) {
  const mots = motsDe(question);
  if (!mots.length) return [];
  const liste = Array.isArray(base) ? base : PASSAGES;
  return liste.map((p) => {
    const titre = motsDe(p.t).join(' ');
    const corps = String(p.x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    let score = 0;
    for (const m of mots) { if (titre.includes(m)) score += 3; if (corps.includes(m)) score += 1 + Math.min(2, (corps.split(m).length - 1) / 3); }
    return { p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(4, n || 3))).map((x) => ({ titre: x.p.t, texte: x.p.x }));
}

module.exports = { chercherWiki, motsDe, nombrePassages: PASSAGES.length };
