// @ts-check
// Mémoire du wiki d'Authentic pour Claude qui pilote (étude 29/10 : « donne à l'agent qui utilise Authentic seul la mémoire du wiki et des captures pour qu'il
// puisse faire autre chose aussi à la demande »). Le résumé du wiki public de Fichorga (lu le 27/10, paraphrasé : aucune donnée de client) est découpé en
// passages (data/wiki-authentic.json) ; `chercherWiki` rend les plus proches d'une question, sans IA ni jeton. Le chemin du fichier est littéral : il est embarqué dans le .exe.
const PASSAGES = require('../data/wiki-authentic.json');
const CAPTURES = require('../data/wiki-authentic-captures.json');
const HOTE_WIKI = 'https://wiki-authentic.fichorga.fr';
const TAILLE_IMAGE_MAX = 800000;
/** Pure : le type d'une image lu dans ses PREMIERS OCTETS (jamais l'extension : une page HTML servie sous « .png » ferait refuser tout l'historique par l'API). @param {Buffer} o */
function typeImageDepuisOctets(o) {
  if (!o || o.length < 12) return '';
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return 'image/png';
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'image/jpeg';
  if (o.slice(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (o.slice(0, 4).toString('latin1') === 'RIFF' && o.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return '';
}

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

/**
 * Pure : les captures d'écran du wiki (index `wiki-authentic-captures.json`, relevé du wiki public le 29/10 : 170 pages, 3 591 captures rangées par section) qui
 * illustrent le mieux une question — `n` sections au plus, chacune { page, section, images: [chemin] } ; titre de section pesant triple, titre de page double.
 * @param {string} question @param {number} [n] @param {any[]} [base]
 */
function chercherCaptures(question, n, base) {
  const mots = motsDe(question);
  if (!mots.length) return [];
  const liste = Array.isArray(base) ? base : CAPTURES;
  /** @type {{ page: string, section: string, images: string[], score: number }[]} */
  const trouves = [];
  for (const p of liste) {
    const titrePage = motsDe(p.t).join(' ');
    for (const s of p.s || []) {
      if (!s.i || !s.i.length) continue;
      const titre = motsDe(s.h).join(' ');
      const corps = motsDe(s.x).join(' ');
      let score = 0;
      for (const m of mots) { if (titre.includes(m)) score += 3; if (titrePage.includes(m)) score += 2; if (corps.includes(m)) score += 1; }
      if (score > 0) trouves.push({ page: p.t, section: s.h.replace(/^¶\s*/, ''), images: s.i, score });
    }
  }
  return trouves.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(3, n || 1)));
}

/**
 * Une capture du wiki, lue EN DIRECT sur le wiki public (https, ce site seul, chemin d'image, 1,5 Mo au plus, 8 s) → bloc image pour Claude, ou null.
 * `lire(url)` est injectable (tests) : rend { octets: Buffer, statut: number }.
 * @param {string} chemin @param {(url: string) => Promise<{ octets: Buffer, statut: number }>} [lire]
 */
async function chargerCapture(chemin, lire) {
  const m = /\.(png|jpe?g|gif|webp)$/i.exec(String(chemin || ''));
  if (!m || !String(chemin).startsWith('/') || String(chemin).startsWith('//') || String(chemin).includes('..')) return null;
  const url = HOTE_WIKI + chemin;
  try {
    const r = lire ? await lire(url) : await lireUrlWiki(url);
    if (!r || r.statut !== 200 || !r.octets || !r.octets.length || r.octets.length > TAILLE_IMAGE_MAX) return null;
    const type = typeImageDepuisOctets(r.octets);
    if (!type) return null;
    return { type: 'image', source: { type: 'base64', media_type: type, data: r.octets.toString('base64') } };
  } catch (e) { return null; }
}

/** @param {string} url */
async function lireUrlWiki(url) {
  const ctl = new AbortController();
  const minuterie = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'error' });
    if (Number(r.headers.get('content-length')) > TAILLE_IMAGE_MAX) return { statut: 413, octets: Buffer.alloc(0) };
    return { statut: r.status, octets: Buffer.from(await r.arrayBuffer()) };
  } finally { clearTimeout(minuterie); }
}

module.exports = { chercherWiki, chercherCaptures, chargerCapture, typeImageDepuisOctets, motsDe, nombrePassages: PASSAGES.length, nombreCaptures: CAPTURES.reduce((t, p) => t + (p.s || []).reduce((u, s) => u + (s.i || []).length, 0), 0) };
