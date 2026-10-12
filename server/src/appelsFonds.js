// @ts-check
'use strict';

// Historique des courriers d'appel de fonds (étude 06/10 : « faire un historique des appels de fonds créés pour les
// retrouver »). Chaque courrier téléchargé ou envoyé par email depuis l'outil Appel de fonds est gardé ici, sous la clé
// `appels-fonds` de la table `parametres` : le courrier tel qu'il est sorti (`donnees`, de quoi refaire le même .docx)
// et l'état de l'outil (`etat`, pour le rouvrir et le reprendre). Pur : assainir, fusionner, résumer.

const CLE_APPELS_FONDS = 'appels-fonds';
const MAX_APPELS_FONDS = 1000;
const MAX_OCTETS_ETAT = 200000;
const GESTES_APPEL_FONDS = ['telecharge', 'prepare', 'envoye', 'modifie'];
const CHAMPS_TEXTE_COURRIER = ['ref', 'addrLines', 'ville', 'dateLettre', 'salut1', 'designation', 'adresseBien', 'rdvPhrase',
  'totalDebit', 'totalCredit', 'solde', 'salut2', 'phraseDeblocage', 'notaire', 'mention'];

/** @param {unknown} v @param {number} max @returns {string} */
function texte(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/** @param {unknown} v @returns {string} */
function dateIso(v) {
  const s = texte(v, 40);
  return s && !Number.isNaN(Date.parse(s)) ? s : '';
}

/** @param {unknown} lignes */
function lignesCourrier(lignes) {
  if (!Array.isArray(lignes)) return [];
  return lignes.slice(0, 80).filter((l) => l && typeof l === 'object').map((l) => {
    const ligne = { label: texte(l.label, 600), amount: texte(l.amount, 40) };
    if (typeof l.formula === 'string' && l.formula) ligne.formula = l.formula.slice(0, 200);
    return ligne;
  });
}

/** Le courrier tel qu'il est sorti : les champs du modèle Word, rien d'autre. @param {any} d */
function assainirDonneesCourrier(d) {
  if (!d || typeof d !== 'object') return null;
  /** @type {Record<string, any>} */
  const out = {};
  CHAMPS_TEXTE_COURRIER.forEach((cle) => { out[cle] = texte(d[cle], 3000); });
  out.debitRows = lignesCourrier(d.debitRows);
  out.creditRows = lignesCourrier(d.creditRows);
  return out;
}

/** @param {unknown} gestes */
function assainirGestes(gestes) {
  if (!Array.isArray(gestes)) return [];
  return gestes.slice(-50).filter((g) => g && GESTES_APPEL_FONDS.includes(g.type) && dateIso(g.le))
    .map((g) => ({ type: g.type, le: dateIso(g.le), par: texte(g.par, 80) }));
}

/** @param {any} a */
function assainirAppelFonds(a) {
  if (!a || typeof a !== 'object') return null;
  const id = texte(a.id, 60);
  if (!/^[A-Za-z0-9_-]{4,60}$/.test(id)) return null;
  const donnees = assainirDonneesCourrier(a.donnees);
  if (!donnees) return null;
  const creeLe = dateIso(a.creeLe) || new Date().toISOString();
  // L'état de l'outil n'est relu que par le poste (qui le contrôle en le rouvrant) : gardé tel quel s'il reste raisonnable.
  let etat = null;
  if (a.etat && typeof a.etat === 'object') {
    try { if (JSON.stringify(a.etat).length <= MAX_OCTETS_ETAT) etat = a.etat; } catch { etat = null; }
  }
  return {
    id,
    creeLe,
    modifieLe: dateIso(a.modifieLe) || creeLe,
    par: texte(a.par, 80),
    dossierId: texte(a.dossierId, 80),
    dossier: texte(a.dossier, 200),
    destinataires: texte(a.destinataires, 400),
    dateRdv: /^\d{4}-\d{2}-\d{2}$/.test(texte(a.dateRdv, 10)) ? texte(a.dateRdv, 10) : '',
    nomFichier: texte(a.nomFichier, 200),
    mode: a.mode === 'confrere' ? 'confrere' : 'office',
    gestes: assainirGestes(a.gestes),
    donnees,
    etat
  };
}

/** Liste gardée : entrées valides, une par identifiant, les plus récentes d'abord, plafonnée. @param {unknown} liste */
function assainirAppelsFonds(liste) {
  if (!Array.isArray(liste)) return [];
  const parId = new Map();
  liste.forEach((brut) => { const a = assainirAppelFonds(brut); if (a) parId.set(a.id, a); });
  return [...parId.values()].sort((x, y) => String(y.modifieLe).localeCompare(String(x.modifieLe))).slice(0, MAX_APPELS_FONDS);
}

/**
 * Un poste renvoie le même courrier après l'avoir retouché : on garde la date de création et l'auteur d'origine, et
 * les gestes des deux côtés (un téléchargement noté par un autre poste entre-temps n'est pas perdu).
 * @param {any} existant @param {any} nouveau
 */
function fusionnerAppelFonds(existant, nouveau) {
  if (!existant) return nouveau;
  const vus = new Set();
  const gestes = [...existant.gestes, ...nouveau.gestes].filter((g) => {
    const cle = `${g.type}|${g.le}`;
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  }).sort((x, y) => String(x.le).localeCompare(String(y.le))).slice(-50);
  return { ...nouveau, creeLe: existant.creeLe, par: existant.par || nouveau.par, gestes };
}

/** Ce que montre une liste : tout sauf le courrier et l'état de l'outil (lus à la demande). @param {any} a */
function resumeAppelFonds(a) {
  const { donnees, etat, ...reste } = a;
  return { ...reste, solde: donnees ? donnees.solde : '', ref: donnees ? donnees.ref : '', rouvrable: !!etat };
}

module.exports = {
  CLE_APPELS_FONDS, MAX_APPELS_FONDS, GESTES_APPEL_FONDS,
  assainirAppelFonds, assainirAppelsFonds, fusionnerAppelFonds, resumeAppelFonds
};
