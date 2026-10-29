// @ts-check
'use strict';

// La STRUCTURE de la page où une tâche du navigateur de CLAIRE s'est arrêtée (étude 29/10 : « Claude en secours quand le parcours échoue ») : les éléments
// utiles pour réparer un parcours — balise, id, classes, rôle, position, taille, recouvert ou non — SANS aucune valeur : un texte n'est repris que s'il
// fait partie d'un vocabulaire fermé de libellés d'écran (boutons, rubriques) ; tout autre texte, titre ou libellé d'accessibilité est remplacé par sa
// longueur. Jamais la valeur d'un champ. Ce texte se copie depuis l'aperçu et se colle dans la conversation avec le développeur.

/** Les mots d'écran d'Authentic qui peuvent être cités tels quels (aucun nom de client, d'adresse ni de dossier). */
const VOCABULAIRE = [
  'naissance', 'mariage', 'deces', 'valider', 'annuler', 'fermer', 'enregistrer', 'rechercher', 'recherche', 'dossiers', 'dossier', 'accueil', 'alertes',
  'envoi immediat', 'creation rapide', 'type de demande', 'intervenants', 'selection globale', 'pieces jointes', 'comptabilite', 'formalites', 'comedec',
  'cjn', 'non classe', 'immeubles', 'comparants', 'importer', 'actes', 'courrier', 'demande', 'redaction', 'etat civil', 'etat civil dematerialise (comedec)',
  'n° de dossier', 'ajouter', 'modifier', 'supprimer', 'ouvrir', 'telecharger', 'partager', 'deplacer', 'replier', 'deplier', 'signer', 'oui', 'non',
  'vendeur', 'acquereur', 'tiers', 'se connecter', 'identifiant', 'mot de passe', 'precedent', 'suivant', 'creer', 'nouveau', 'infos comptables'
];

/** Pure : le texte d'un élément, gardé s'il est du vocabulaire fermé, sinon réduit à sa longueur. @param {string} t */
function texteSur(t) {
  const brut = String(t || '').replace(/\s+/g, ' ').trim();
  if (!brut) return '';
  const plat = brut.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return VOCABULAIRE.includes(plat) ? brut.slice(0, 60) : `«${brut.length} car.»`;
}

/** Le script exécuté dans la page : les éléments visibles utiles (500 au plus), sans valeur de champ. */
const SCRIPT_STRUCTURE_PAGE = `(() => {
  const sel = 'button, a, input, select, textarea, label, th, [role], [onclick], .ui-selectcheckboxmenu, .ui-selectcheckboxmenu-panel, .ui-selectcheckboxmenu-panel li, .ui-chkbox, .ui-toggleswitch, .ui-dialog, .ui-tree, .ui-treenode, table, tr';
  const out = [];
  for (const e of document.querySelectorAll(sel)) {
    if (out.length >= 500) break;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight * 3) continue;
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const d = y >= 0 && y < innerHeight ? document.elementFromPoint(x, y) : null;
    const direct = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
    out.push({ tag: e.tagName.toLowerCase(), id: String(e.id || '').slice(0, 60), cls: String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className || '').split(/\\s+/).filter(Boolean).slice(0, 4).join('.'),
      role: e.getAttribute('role') || '', type: e.getAttribute('type') || '', texte: direct, aria: e.getAttribute('aria-label') || '', titre: e.getAttribute('title') || '',
      coche: e.matches('input[type=checkbox]') ? !!e.checked : (e.getAttribute('aria-checked') || ''), x, y, l: Math.round(r.width), h: Math.round(r.height),
      couvert: d ? !(e.contains(d) || d.contains(e)) : null });
  }
  return { url: location.pathname, titre: document.title, vue: innerWidth + 'x' + innerHeight, defilement: Math.round(scrollY), elements: out };
})()`;

/** Pure : le texte de la structure relevée (une ligne par élément). @param {any} r */
function texteStructure(r) {
  if (!r || typeof r !== 'object' || !Array.isArray(r.elements)) return '';
  const lignes = [`Structure de la page (sans valeurs) — ${String(r.url || '').replace(/[0-9]{4,}/g, '#')} · fenêtre ${r.vue || '?'} · défilement ${r.defilement || 0}`];
  lignes.push(`Titre : ${texteSur(r.titre) || '(vide)'}`);
  for (const e of r.elements) {
    const parts = [`${e.tag}${e.id ? '#' + e.id : ''}${e.cls ? '.' + e.cls : ''}`];
    if (e.role) parts.push(`role=${e.role}`);
    if (e.type) parts.push(`type=${e.type}`);
    if (e.coche !== '' && e.coche !== undefined) parts.push(`coché=${e.coche}`);
    const t = texteSur(e.texte); if (t) parts.push(`texte=${t}`);
    const a = texteSur(e.aria); if (a) parts.push(`aria=${a}`);
    const ti = texteSur(e.titre); if (ti) parts.push(`titre=${ti}`);
    parts.push(`@${e.x},${e.y} ${e.l}x${e.h}`);
    if (e.couvert) parts.push('RECOUVERT');
    lignes.push(parts.join(' '));
  }
  return lignes.join('\n');
}

module.exports = { VOCABULAIRE, texteSur, SCRIPT_STRUCTURE_PAGE, texteStructure };
