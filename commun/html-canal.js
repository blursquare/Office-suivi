// @ts-check
// Le HTML d'un message de CLAIRE partagé par un canal (étude 25/10, audit 25/10) : écrit par l'agent sur UN poste, relu par tous les autres.
// Il n'est jamais fait confiance : seules des balises de mise en forme passent, avec leurs attributs sûrs (classe de CLAIRE, titre, lien
// http/https/mailto), tout le reste est écrit en texte, les balises ouvertes sont refermées. Pur : appliqué par le SERVEUR au dépôt du
// message (POST /api/canaux/:id/messages) ET par le poste au rendu (défense en profondeur).
(function (exporter) {
  'use strict';

  const BALISES_CANAL = ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'blockquote', 'span', 'div', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'small', 'hr', 'sup', 'sub', 'del', 'mark'];
  const BALISES_VIDES_CANAL = ['br', 'hr'];
  /** Seules les classes de l'assistant et des canaux : un message forgé n'emprunte pas une classe qui recouvre l'écran (audit 25/10). */
  const RE_CLASSE_CANAL = /^(asst|cx|dot|bouton)(-[\w-]+)?$/;

  /** @param {unknown} s */
  function echapperTexte(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  /** @param {unknown} s */
  function echapperAttribut(s) {
    return echapperTexte(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Pur : le HTML assaini d'un message de canal. @param {unknown} html */
  function htmlSurCanal(html) {
    const morceaux = String(html || '').split(/(<[^<>]*>?)/);
    /** @type {string[]} */
    const ouvertes = [];
    let sortie = '';
    for (const m of morceaux) {
      if (!m) continue;
      if (m[0] !== '<') { sortie += m.replace(/</g, '&lt;'); continue; }
      const t = m.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*)?)\/?>$/);
      if (!t || !BALISES_CANAL.includes(t[2].toLowerCase())) { sortie += echapperTexte(m); continue; }
      const nom = t[2].toLowerCase();
      if (t[1]) {
        const k = ouvertes.lastIndexOf(nom);
        if (k >= 0) { sortie += ouvertes.splice(k).reverse().map((n) => `</${n}>`).join(''); }
        continue;
      }
      let attrs = '';
      const re = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a;
      while ((a = re.exec(t[3]))) {
        const cle = a[1].toLowerCase();
        const val = a[2] !== undefined ? a[2] : a[3];
        if (cle === 'class') {
          const classes = val.trim().split(/\s+/).filter((c) => RE_CLASSE_CANAL.test(c)).slice(0, 8);
          if (classes.length) attrs += ` class="${classes.join(' ')}"`;
        } else if (cle === 'title') attrs += ` title="${echapperAttribut(val.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'))}"`;
        else if (nom === 'a' && cle === 'href' && /^(https?:\/\/|mailto:)[^\s"'<>]*$/i.test(val.replace(/&amp;/g, '&'))) attrs += ` href="${echapperAttribut(val.replace(/&amp;/g, '&'))}" target="_blank" rel="noopener noreferrer"`;
        else if ((cle === 'colspan' || cle === 'rowspan') && /^\d{1,2}$/.test(val)) attrs += ` ${cle}="${val}"`;
      }
      sortie += `<${nom}${attrs}>`;
      if (!BALISES_VIDES_CANAL.includes(nom)) ouvertes.push(nom);
    }
    return sortie + ouvertes.reverse().map((n) => `</${n}>`).join('');
  }

  exporter({ BALISES_CANAL, BALISES_VIDES_CANAL, htmlSurCanal });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
