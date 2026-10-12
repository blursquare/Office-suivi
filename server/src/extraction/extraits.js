'use strict';

// Vérification des extraits cités par le modèle local, et découpage du texte en fenêtres ciblées.
//
// Pourquoi vérifier plutôt que faire confiance : un modèle 7-8B renvoie volontiers un champ
// `confidence` à 0.95 sur une valeur qu'il vient d'inventer — ce score n'est calibré sur rien. Le
// seul signal fiable dont on dispose est vérifiable mécaniquement : LA PHRASE QU'IL CITE
// EXISTE-T-ELLE LITTÉRALEMENT DANS LE PDF ? Si oui, il a bien lu quelque chose à cet endroit
// (statut CONFIRMED côté client) ; si non, la donnée est marquée à vérifier, quel que soit son
// aplomb. C'est le pendant serveur de localiserExtrait() dans script.js — volontairement dupliqué
// plutôt que partagé : les deux mondes (navigateur en file://, Node) n'ont aucun mécanisme de
// build commun dans ce projet (voir CLAUDE.md, contrainte n°1), et ces quelques lignes se
// dupliquent plus simplement qu'elles n'introduiraient un outillage.

// Normalise pour la comparaison (casse, espaces multiples, accents, apostrophes et tirets
// typographiques — le texte extrait d'un PDF est systématiquement bruité de ce côté) en gardant,
// pour chaque caractère produit, l'index correspondant dans la chaîne d'origine : sans cette table
// de correspondance, on saurait qu'un extrait existe sans pouvoir dire OÙ, donc sans pouvoir en
// déduire la page.
function normaliserAvecIndex(s) {
  let res = '';
  const idx = [];
  let dernierEspace = true;
  const source = String(s || '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (/\s/.test(c)) {
      if (!dernierEspace) { res += ' '; idx.push(i); dernierEspace = true; }
      continue;
    }
    let normalise = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/['’‘´`]/.test(normalise)) normalise = "'";
    if (/[-–—]/.test(normalise)) normalise = '-';
    if (normalise === 'œ') normalise = 'oe';
    if (normalise === 'æ') normalise = 'ae';
    for (const ch of normalise) { res += ch; idx.push(i); }
    if (normalise.length > 0) dernierEspace = false;
  }
  return { texte: res, index: idx };
}

// Forme compacte (sans espaces ni tirets) d'un texte normalisé, avec l'index d'origine de chaque caractère gardé : une césure
// en fin de ligne (« cé- sure »), une espace insécable ou une espace en trop ne font pas échouer une citation exacte.
function compacter(normalise) {
  let texte = '';
  const index = [];
  for (let i = 0; i < normalise.texte.length; i++) {
    const c = normalise.texte[i];
    // Espaces, tirets et guillemets (« » “ ” " ‹ ›) : le modèle les recopie à sa façon (relecture 12/10).
    if (c === ' ' || c === '-' || '«»“”„"‹›'.includes(c)) continue;
    texte += c;
    index.push(normalise.index[i]);
  }
  return { texte, index };
}

// Le dernier document normalisé est gardé : toutes les citations d'une analyse sont cherchées dans les mêmes textes
// (audit 12/10 : 90 citations sur un acte de 300 000 caractères figeaient le serveur plusieurs secondes).
// Quelques documents gardés (une analyse en compte plusieurs, et chaque citation peut être cherchée dans tous).
const sourcesCompactes = new Map();
function sourceCompacte(texte) {
  let c = sourcesCompactes.get(texte);
  if (!c) {
    c = compacter(normaliserAvecIndex(texte));
    if (sourcesCompactes.size >= 8) sourcesCompactes.delete(sourcesCompactes.keys().next().value);
    sourcesCompactes.set(texte, c);
  }
  return c;
}

// Position de l'extrait dans le texte d'origine, ou -1. La citation ENTIÈRE doit s'y trouver (audit 12/10 : seuls ses 20
// premiers caractères étaient vérifiés — une négation retirée ou une fin inventée passaient pour vérifiées) ; seuls les
// espaces et les tirets sont ignorés. Une coupure marquée par le modèle (« … », « [...] ») sépare des morceaux qui doivent
// tous se retrouver, dans l'ordre.
function localiserExtrait(texte, extrait) {
  if (!texte || !extrait) return -1;
  // Un marqueur de page recopié (« [[page 4]] », relecture/claude.js) coupe aussi la citation.
  const morceaux = String(extrait).split(/\s*(?:\[\s*(?:\.\.\.|…)\s*\]|\(\s*(?:\.\.\.|…)\s*\)|\.\.\.|…|\[\[\s*page\s*\d+\s*\]\])\s*/i)
    .map(m => compacter(normaliserAvecIndex(m)).texte)
    .filter(Boolean);
  const total = morceaux.reduce((n, m) => n + m.length, 0);
  if (total < 10) return -1; // « le 15 » se retrouverait n'importe où : ce n'est pas une preuve
  const source = sourceCompacte(texte);
  let depart = 0;
  let premier = -1;
  for (const m of morceaux) {
    const pos = source.texte.indexOf(m, depart);
    if (pos === -1) return -1;
    if (premier === -1) premier = pos;
    depart = pos + m.length;
  }
  return source.index[premier];
}

// Découpe le texte en fenêtres autour des occurrences d'un motif, fusionnées quand elles se
// chevauchent. Envoyer un acte de 50 pages entier à un modèle 7-8B sur CPU coûte des minutes et
// noie l'information utile ; les clauses qui nous intéressent (prêt, réitération, désignation)
// tiennent dans quelques milliers de caractères autour de mots-clés précis.
function construireFenetres(texte, motif, rayon, maxCaracteres) {
  const source = String(texte || '');
  if (!source) return '';
  const r = rayon || 800;
  const plafond = maxCaracteres || 12000;
  const regex = new RegExp(motif.source, motif.flags.includes('g') ? motif.flags : motif.flags + 'g');

  const zones = [];
  let m;
  while ((m = regex.exec(source)) !== null) {
    const debut = Math.max(0, m.index - r);
    const fin = Math.min(source.length, m.index + m[0].length + r);
    const derniere = zones[zones.length - 1];
    if (derniere && debut <= derniere.fin) derniere.fin = Math.max(derniere.fin, fin);
    else zones.push({ debut, fin });
    if (m[0].length === 0) regex.lastIndex++; // motif pouvant matcher le vide : pas de boucle infinie
  }
  if (zones.length === 0) return '';

  const morceaux = [];
  let total = 0;
  for (const zone of zones) {
    const morceau = source.slice(zone.debut, zone.fin);
    if (total + morceau.length > plafond) {
      const reste = plafond - total;
      if (reste > 200) morceaux.push(morceau.slice(0, reste));
      break;
    }
    morceaux.push(morceau);
    total += morceau.length;
  }
  // Le séparateur dit au modèle que des passages ont été omis : sans lui, deux clauses éloignées
  // se liraient comme une seule phrase, avec le risque qu'il rattache l'une au contexte de l'autre.
  return morceaux.join('\n[...]\n');
}

// Annote chaque élément portant un champ `extrait` : trouvé littéralement dans le texte, et à quel
// index. C'est ce drapeau que le client traduit ensuite en CONFIRMED / NEEDS_REVIEW (et en numéro
// de page, via pageDepuisIndex — le serveur, lui, ne connaît pas le découpage en pages du PDF).
function verifierExtraits(valeur, texte) {
  if (Array.isArray(valeur)) return valeur.map((v) => verifierExtraits(v, texte));
  if (!valeur || typeof valeur !== 'object') return valeur;
  const copie = {};
  for (const cle of Object.keys(valeur)) copie[cle] = verifierExtraits(valeur[cle], texte);
  if (typeof valeur.extrait === 'string' && valeur.extrait.trim()) {
    const index = localiserExtrait(texte, valeur.extrait);
    copie.extraitTrouve = index !== -1;
    copie.extraitIndex = index === -1 ? null : index;
  }
  return copie;
}

module.exports = { normaliserAvecIndex, localiserExtrait, construireFenetres, verifierExtraits };
