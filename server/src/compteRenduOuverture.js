// @ts-check
'use strict';
// Le compte rendu d'ouverture d'une succession (étude 28/10 : « relire le .doc sur le NAS du dossier, le compte rendu d'ouverture de
// Sophie : tu sauras le nom des banques et s'il y a un EHPAD, une mutuelle ou une caisse de retraite »). Un document Word (.doc ou .docx) du
// dossier client, retrouvé par son NOM, lu en lecture seule ; le texte reste sur le serveur, seuls les organismes repérés (noms de
// banques, trois oui/non) retournent au poste. Jamais un nom de personne ni un montant.

const fsp = require('node:fs/promises');
const path = require('node:path');

const RE_NOM_COMPTE_RENDU = /compte[\s._-]*rendu|(?:^|[\s._-])c\.?r\.?[\s._-]*(?:d['’ ]?)?ouverture|ouverture/i;
const TAILLE_MAX = 8 * 1024 * 1024;

// Les établissements les plus courants : le nom écrit tel quel dans le compte rendu → le nom du courrier.
/** @type {Array<[RegExp, string]>} */
const BANQUES = [
  [/cr[ée]dit agricole|\bCA\s+(?:val de france|centre|touraine)/i, 'Crédit Agricole'],
  [/caisse d['’ ]?[ée]pargne/i, 'Caisse d’Épargne'],
  [/banque populaire/i, 'Banque Populaire'],
  [/cr[ée]dit mutuel/i, 'Crédit Mutuel'],
  [/\bCIC\b/, 'CIC'],
  [/\bLCL\b|cr[ée]dit lyonnais/i, 'LCL'],
  [/\bBNP\b/i, 'BNP Paribas'],
  [/soci[ée]t[ée] g[ée]n[ée]rale/i, 'Société Générale'],
  [/banque postale|\bLBP\b|livret a\b|ccp\b/i, 'La Banque Postale'],
  [/cr[ée]dit du nord/i, 'Crédit du Nord'],
  [/\bHSBC\b/i, 'HSBC'],
  [/boursorama|boursobank/i, 'Boursorama'],
  [/\bING\b/, 'ING'],
  [/hello bank/i, 'Hello bank'],
  [/fortuneo/i, 'Fortuneo'],
  [/cr[ée]dit coop[ée]ratif/i, 'Crédit Coopératif'],
  [/axa banque/i, 'AXA Banque'],
  [/cetelem/i, 'Cetelem']
];

/**
 * Pure : ce que dit le texte d'un compte rendu d'ouverture.
 * @param {string} texte
 * @returns {{ banques: string[], ehpad: boolean, mutuelle: boolean, retraite: boolean }}
 */
function analyserCompteRendu(texte) {
  const t = String(texte || '');
  /** @type {string[]} */
  const banques = [];
  const ajouter = (/** @type {string} */ nom) => { if (nom && !banques.some((b) => b.toLowerCase() === nom.toLowerCase())) banques.push(nom); };
  for (const [re, nom] of BANQUES) if (re.test(t)) ajouter(nom);
  // « Banque : Crédit X », « Banques : A, B » : ce que le compte rendu nomme lui-même, un établissement hors de la liste compris.
  for (const m of t.matchAll(/\bbanques?\s*[:\-–]\s*([^\n]{2,120})/gi)) {
    for (const morceau of m[1].split(/[,;/]|\bet\b/i)) {
      const nom = morceau.replace(/\([^)]*\)/g, '').replace(/[^A-Za-zÀ-ÿ’' -]/g, ' ').replace(/\s+/g, ' ').trim();
      if (nom.length >= 3 && nom.length <= 40 && !/^(?:oui|non|n\.?c\.?|néant|inconnue?s?|à (?:voir|compléter|déterminer))$/i.test(nom)) {
        const connue = BANQUES.find(([re]) => re.test(nom));
        ajouter(connue ? connue[1] : nom.replace(/\b([a-zà-ÿ])/, (c) => c.toUpperCase()));
      }
    }
  }
  return {
    banques: banques.slice(0, 8),
    ehpad: /\behpad\b|maison de retraite|\busld\b|r[ée]sidence (?:s[ée]niors?|autonomie|pour personnes? [âa]g[ée]es?)|foyer[- ]logement/i.test(t),
    mutuelle: /\bmutuelle\b|compl[ée]mentaire sant[ée]/i.test(t),
    retraite: /caisse de retraite|retraite compl[ée]mentaire|\bagirc\b|\barrco\b|\bcnracl\b|ircantec|pension de retraite|\bretrait[ée]e?s?\b/i.test(t)
  };
}

/**
 * Le compte rendu d'ouverture du dossier client : un Word dont le nom le dit, à la racine ou dans un sous-dossier, le plus récent.
 * @param {string} dossierAbsolu @param {any} [fsImpl]
 * @returns {Promise<string | null>} le chemin absolu, ou null
 */
async function trouverCompteRendu(dossierAbsolu, fsImpl = fsp) {
  /** @type {Array<{ chemin: string, modifie: number }>} */
  const candidats = [];
  /** @param {string} dossier @param {number} profondeur */
  const parcourir = async (dossier, profondeur) => {
    let entrees = [];
    try { entrees = await fsImpl.readdir(dossier, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entrees) {
      if (e.name.startsWith('.') || e.name.startsWith('~$')) continue;
      const chemin = path.join(dossier, e.name);
      if (e.isDirectory()) { if (profondeur < 1) await parcourir(chemin, profondeur + 1); continue; }
      if (!/\.docx?$/i.test(e.name) || !RE_NOM_COMPTE_RENDU.test(e.name)) continue;
      try { const st = await fsImpl.stat(chemin); if (st.size <= TAILLE_MAX) candidats.push({ chemin, modifie: st.mtimeMs }); } catch (e2) { /* illisible : ignoré */ }
    }
  };
  await parcourir(dossierAbsolu, 0);
  candidats.sort((a, b) => b.modifie - a.modifie);
  return candidats.length ? candidats[0].chemin : null;
}

/** Le texte d'un Word, ancien (.doc) ou récent (.docx). @param {string} chemin @param {any} [fsImpl] */
async function lireTexteWord(chemin, fsImpl = fsp) {
  const buf = await fsImpl.readFile(chemin);
  if (/\.docx$/i.test(chemin)) return require('./memoire').texteDocx(buf);
  const WordExtractor = require('word-extractor');
  const doc = await new WordExtractor().extract(buf);
  return String(doc.getBody() || '');
}

module.exports = { analyserCompteRendu, trouverCompteRendu, lireTexteWord, RE_NOM_COMPTE_RENDU };
