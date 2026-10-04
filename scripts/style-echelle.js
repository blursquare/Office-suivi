// @ts-check
'use strict';

// Échelle commune de l'interface (étude, 04/10 : « il faut une uniformité de l'interface »). Une seule source pour les
// tailles de texte, les arrondis, les ombres et les espacements : les jetons --texte-*, --rayon-*, --shadow-* en tête de
// style.css, et la liste des espacements permis ci-dessous. tests/style-uniforme.test.js refuse toute valeur hors échelle.
// Exemptés : les blocs de jetons eux-mêmes (:root, [data-theme="dark"]), l'impression (@media print) et les zones papier
// (courrier d'appel de fonds, feuille des quotités — identité papier de l'étude, hors thème), bornées dans style.css par
// les commentaires « @papier » et « @fin-papier ».

/** Espacements permis (padding, margin, gap) en px : pas de 2 jusqu'à 16, puis 20, 24, 28, 32, 40, 48, 56, 64 ; au-delà,
 * un multiple de 8. */
const ESPACEMENTS = [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64];

/** Tailles de texte : nom du jeton → px. */
const TEXTES = { micro: 8, xxs: 10, xs: 11, s: 12, m: 13, base: 14, l: 16, xl: 18, '2xl': 20, '3xl': 24, '4xl': 28, '5xl': 32, '6xl': 40 };

/** Arrondis : nom du jeton → px (pilule = 999). 50 % reste permis pour un cercle. */
const RAYONS = { xs: 4, s: 6, m: 10, carte: 16, pilule: 999 };

/** Graisses permises (Inter est chargée en 400, 500, 600 et 700 : toute autre valeur est arrondie par le navigateur).
 * 400 texte, 500 libellés et boutons, 600 titres et étiquettes, 700 titres de page, chiffres clés et badges. */
const GRAISSES = ['400', '500', '600', '700', 'normal', 'bold', 'inherit'];

/** Espacements de lettres permis : serré pour les grands titres, normal, large pour les capitales. */
const ESPACEMENTS_LETTRES = ['-0.02em', '0', 'normal', '0.06em', 'inherit'];

/** Tailles d'icônes : 14 px dans le texte et les boutons compacts, 16 px dans les boutons et barres d'outils, 20 px dans la
 * barre latérale (24 px et plus : illustrations, libres). */
const TAILLES_ICONES = [14, 16, 20];

/** Titres de carte ou de section (widgets, colonne du Suivi, agenda, réglages) : un seul style, 16 px en poids moyen (500). */
const TITRES_CARTE = ['.w-titre', '.sm-titre', '.jour-section-titre', '.reglages-section-titre'];

const PROPRIETES_ESPACEMENT = /^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap)$/;

/**
 * @typedef {{ propriete: string, valeur: string, debut: number, fin: number, ligne: number,
 *   selecteur: string, exempte: boolean, regle: number }} Declaration
 */

/**
 * Pure : toutes les déclarations de la feuille, avec leur position (pour réécrire la valeur) et si elles sont exemptées.
 * @param {string} css
 * @returns {Declaration[]}
 */
function declarationsCss(css) {
  /** @type {Declaration[]} */
  const sortie = [];
  /** @type {string[]} */
  const pile = [];
  /** @type {number[]} */
  const pileRegles = [];
  let compteurRegles = 0;
  let papier = false;
  let tampon = '';
  let debutTampon = 0;
  let i = 0;
  const n = css.length;
  const ligneDe = (pos) => css.slice(0, pos).split('\n').length;
  const exempte = () => papier || pile.some((p) => /^@media\s+print/.test(p))
    || /^(:root(\[[^\]]+\])*(:not\([^)]*\))?|\[data-theme="dark"\]|:root\[data-theme="dark"\])$/.test(pile[pile.length - 1] || '');
  const fermerDeclaration = (finPos) => {
    const brut = tampon;
    const deuxPoints = brut.indexOf(':');
    if (deuxPoints > 0 && pile.length && !pile[pile.length - 1].startsWith('@')) {
      const propriete = brut.slice(0, deuxPoints).trim().toLowerCase();
      const reste = brut.slice(deuxPoints + 1);
      const avant = reste.length - reste.trimStart().length;
      const valeur = reste.trim();
      if (/^-{0,2}[a-z][a-z0-9-]*$/.test(propriete) && valeur) {
        const debut = debutTampon + deuxPoints + 1 + avant;
        sortie.push({ propriete, valeur, debut, fin: debut + valeur.length, ligne: ligneDe(debut), selecteur: pile[pile.length - 1], exempte: exempte(), regle: pileRegles[pileRegles.length - 1] });
      }
    }
    tampon = ''; debutTampon = finPos + 1;
  };
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const fin = css.indexOf('*/', i + 2);
      const commentaire = css.slice(i, fin < 0 ? n : fin + 2);
      if (/^\/\*\s*@papier\b/.test(commentaire)) papier = true;
      if (/^\/\*\s*@fin-papier\b/.test(commentaire)) papier = false;
      // Le commentaire est remplacé par des espaces dans le tampon : les positions restent justes.
      tampon += ' '.repeat(commentaire.length);
      i += commentaire.length;
      continue;
    }
    if (c === '"' || c === "'") {
      const fin = css.indexOf(c, i + 1);
      const chaine = css.slice(i, fin < 0 ? n : fin + 1);
      tampon += chaine; i += chaine.length;
      continue;
    }
    if (c === '{') { pile.push(tampon.trim().replace(/\s+/g, ' ')); pileRegles.push(++compteurRegles); tampon = ''; debutTampon = i + 1; i++; continue; }
    if (c === '}') { if (tampon.trim()) fermerDeclaration(i); pile.pop(); pileRegles.pop(); tampon = ''; debutTampon = i + 1; i++; continue; }
    if (c === ';') { fermerDeclaration(i); i++; continue; }
    tampon += c; i++;
  }
  return sortie;
}

/** Pure : le message d'écart d'une déclaration à l'échelle, ou '' si elle est conforme. @param {Declaration} d */
function ecartEchelle(d) {
  // Une propriété personnalisée (--x) définit un jeton : c'est l'échelle elle-même.
  if (d.exempte || d.propriete.startsWith('--')) return '';
  const v = d.valeur.replace(/\s*!important$/, '');
  if (/#[0-9a-f]{3,8}\b/i.test(v)) return `couleur écrite en dur (${v}) : passer par un jeton`;
  if (d.propriete === 'font-size') {
    if (/^var\(--texte-[a-z0-9]+\)$/.test(v) || /^(inherit|0|1em|[0-9.]+em|[0-9.]+%)$/.test(v)) return '';
    return `taille de texte hors échelle (${v}) : var(--texte-…)`;
  }
  if (d.propriete === 'font' && /\b[0-9.]+px\b/.test(v)) return `taille de texte hors échelle dans « font: ${v} » : var(--texte-…)`;
  if (/^border(-(top|bottom)-(left|right))?-radius$/.test(d.propriete)) {
    const parties = v.split(/\s+/);
    if (parties.every((p) => /^(0|50%|inherit|var\(--rayon-[a-z]+\))$/.test(p))) return '';
    return `arrondi hors échelle (${v}) : var(--rayon-…), 0 ou 50 %`;
  }
  if (d.propriete === 'box-shadow') {
    const couches = v.split(/,(?![^(]*\))/).map((x) => x.trim());
    const ok = couches.every((x) => /^(none|var\(--shadow-[a-z]+\))$/.test(x) || /^inset\b/.test(x) || /\binset$/.test(x) || /^0 0 0 /.test(x));
    return ok ? '' : `ombre hors échelle (${v}) : var(--shadow-card) ou var(--shadow-float)`;
  }
  if (/^(width|height)$/.test(d.propriete) && /(svg|\.icone)(\b|$)/.test(d.selecteur.split(',').pop() || '')) {
    const px = /^(\d+)px$/.exec(v);
    if (px && Number(px[1]) < 24 && !TAILLES_ICONES.includes(Number(px[1]))) return `icône hors échelle (${v}) : 14, 16 ou 20 px`;
  }
  if (d.propriete === 'font-weight' && !GRAISSES.includes(v)) return `graisse hors échelle (${v}) : ${GRAISSES.slice(0, 4).join(', ')}`;
  if (d.propriete === 'letter-spacing' && !ESPACEMENTS_LETTRES.includes(v)) return `espacement de lettres hors échelle (${v}) : -0.02em, 0 ou 0.06em`;
  if (PROPRIETES_ESPACEMENT.test(d.propriete)) {
    const hors = (v.match(/-?[0-9.]+px/g) || []).map((x) => Math.abs(parseFloat(x))).filter((x) => !espacementPermis(x));
    return hors.length ? `espacement hors échelle (${v}) : ${ESPACEMENTS.join(', ')} px` : '';
  }
  return '';
}

/**
 * Pure : les écarts de rôle typographique, règle par règle. Une étiquette en capitales (text-transform: uppercase) a un seul
 * style — 11 px (var(--texte-xs)), demi-gras, 0.06em — sauf un badge (règle qui pose son propre fond) : gras, 0.06em, taille
 * libre dans micro/xxs/xs. Un titre de carte (TITRES_CARTE) est en var(--texte-l), 500. Un grand texte (var(--texte-xl) et
 * au-delà : titres de page, chiffres clés) est en 500, jamais en gras — la taille fait la hiérarchie (étude 04/10).
 * @param {Declaration[]} declarations
 * @returns {string[]}
 */
function ecartsTypographie(declarations) {
  /** @type {Map<number, Declaration[]>} */
  const parRegle = new Map();
  for (const d of declarations) {
    if (d.exempte) continue;
    if (!parRegle.has(d.regle)) parRegle.set(d.regle, []);
    /** @type {Declaration[]} */ (parRegle.get(d.regle)).push(d);
  }
  /** @type {string[]} */
  const ecarts = [];
  for (const ds of parRegle.values()) {
    /** @type {Record<string, string>} */
    const m = {};
    for (const d of ds) m[d.propriete] = d.valeur.replace(/\s*!important$/, '');
    const sel = ds[0].selecteur;
    const ou = `ligne ${ds[0].ligne} (${sel.slice(0, 60)})`;
    if (/uppercase/.test(m['text-transform'] || '') && !/first-letter/.test(sel)) {
      const badge = Object.entries(m).some(([k, v]) => /^background(-color)?$/.test(k) && !/^(none|transparent)$/.test(v));
      const tailles = badge ? ['var(--texte-micro)', 'var(--texte-xxs)', 'var(--texte-xs)'] : ['var(--texte-xs)'];
      if (m['font-size'] && !tailles.includes(m['font-size'])) ecarts.push(`${ou} : capitales en ${m['font-size']}, attendu ${tailles.join(' ou ')}`);
      if (m['font-weight'] !== (badge ? '700' : '600')) ecarts.push(`${ou} : capitales en graisse ${m['font-weight'] || 'non posée'}, attendu ${badge ? '700 (badge)' : '600'}`);
      if (m['letter-spacing'] !== '0.06em') ecarts.push(`${ou} : capitales sans letter-spacing: 0.06em`);
    }
    if (TITRES_CARTE.includes(sel) && (m['font-size'] !== 'var(--texte-l)' || m['font-weight'] !== '500')) {
      ecarts.push(`${ou} : titre de carte attendu en var(--texte-l), 500`);
    }
    if (/^var\(--texte-([2-6])?xl\)$/.test(m['font-size'] || '') && m['font-weight'] && !['500', 'inherit'].includes(m['font-weight'])) {
      ecarts.push(`${ou} : grand texte (${m['font-size']}) en graisse ${m['font-weight']}, attendu 500`);
    }
  }
  return ecarts;
}

/** Pure. @param {number} px */
function espacementPermis(px) {
  return ESPACEMENTS.includes(px) || (px > 64 && px % 8 === 0);
}

module.exports = { ESPACEMENTS, TEXTES, RAYONS, GRAISSES, TAILLES_ICONES, ESPACEMENTS_LETTRES, TITRES_CARTE, declarationsCss, ecartEchelle, ecartsTypographie, espacementPermis };
