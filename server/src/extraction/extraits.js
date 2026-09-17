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
    for (const ch of normalise) { res += ch; idx.push(i); }
    if (normalise.length > 0) dernierEspace = false;
  }
  return { texte: res, index: idx };
}

// Position de l'extrait dans le texte d'origine, ou -1. Le préfixe testé est réduit par paliers :
// un extrait peut différer de la mise en page réelle (césure en fin de ligne, espace insécable)
// sans pour autant être inventé — exiger l'égalité parfaite produirait un flot de faux
// « à vérifier » qui ferait perdre toute valeur au signal.
function localiserExtrait(texte, extrait) {
  if (!texte || !extrait) return -1;
  const source = normaliserAvecIndex(texte);
  const cible = normaliserAvecIndex(extrait).texte.trim();
  if (cible.length < 12) return -1; // « le 15 » se retrouverait n'importe où : ce n'est pas une preuve
  let longueur = Math.min(80, cible.length);
  const longueurMin = Math.max(12, Math.min(20, cible.length));
  let pos = -1;
  while (pos === -1 && longueur >= longueurMin) {
    pos = source.texte.indexOf(cible.slice(0, longueur));
    if (pos === -1) longueur -= 10;
  }
  return pos === -1 ? -1 : source.index[pos];
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
