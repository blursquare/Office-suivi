// @ts-check
'use strict';
// Le compte rendu d'ouverture d'une succession (étude 28/10 : « relire le .doc sur le NAS du dossier, le compte rendu d'ouverture de
// Sophie : tu sauras le nom des banques et s'il y a un EHPAD, une mutuelle ou une caisse de retraite »). Un document Word (.doc ou .docx) du
// dossier client, retrouvé par son NOM, lu en lecture seule ; le texte reste sur le serveur, seuls les organismes repérés (noms de
// banques, trois oui/non) retournent au poste. Jamais un nom de personne ni un montant.

const fsp = require('node:fs/promises');
const path = require('node:path');

const RE_NOM_COMPTE_RENDU = /compte[\s._-]*rendu|(?:^|[\s._-])c\.?r\.?[\s._-]*(?:d['’ ]?)?ouverture/i;
const TAILLE_MAX = 2 * 1024 * 1024;

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
  [/banque postale|\bLBP\b/i, 'La Banque Postale'],
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

/** Pure : le motif est-il cité sans négation (« pas de mutuelle », « sans EHPAD », « aucune caisse »…) ? @param {RegExp} re @param {string} texte */
function cite(re, texte) {
  const g = new RegExp(re.source, re.flags.replace('g', '') + 'g');
  for (const m of texte.matchAll(g)) {
    const avant = texte.slice(Math.max(0, (m.index || 0) - 24), m.index || 0);
    if (!/(?:\bpas\s+(?:de|d['’]|d’une?|d’un)?\s*|\bsans\s+|\baucune?s?\s+|\bni\s+|\bnon\s+)(?:la\s+|le\s+|l['’]|une?\s+|de\s+)?$/i.test(avant)) return true;
  }
  return false;
}

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
      if (nom.length >= 3 && nom.length <= 40 && !/\b(?:mme|madame|monsieur|mlle|mr)\b/i.test(nom) && !/^(?:oui|non|n\.?c\.?|néant|inconnue?s?|à (?:voir|compléter|déterminer))$/i.test(nom)) {
        const connue = BANQUES.find(([re]) => re.test(nom));
        ajouter(connue ? connue[1] : nom.replace(/\b([a-zà-ÿ])/, (c) => c.toUpperCase()));
      }
    }
  }
  return {
    banques: banques.slice(0, 8),
    ehpad: cite(/\behpad\b|maison de retraite|\busld\b|r[ée]sidence (?:s[ée]niors?|autonomie|pour personnes? [âa]g[ée]es?)|foyer[- ]logement/i, t),
    mutuelle: cite(/\bmutuelle\b|compl[ée]mentaire sant[ée]/i, t),
    retraite: cite(/caisse de retraite|retraite compl[ée]mentaire|\bagirc\b|\barrco\b|\bcnracl\b|ircantec|pension de retraite|(?<![A-Za-z0-9_À-ɏ])retrait[ée]e?s?(?![A-Za-z0-9_À-ɏ])/i, t)
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
      if (!e.isFile() || !/\.docx?$/i.test(e.name) || !RE_NOM_COMPTE_RENDU.test(e.name)) continue;
      try { const st = await fsImpl.stat(chemin); if (st.size <= TAILLE_MAX) candidats.push({ chemin, modifie: st.mtimeMs }); } catch (e2) { /* illisible : ignoré */ }
    }
  };
  await parcourir(dossierAbsolu, 0);
  candidats.sort((a, b) => b.modifie - a.modifie);
  return candidats.length ? candidats[0].chemin : null;
}

/**
 * Pure : un fichier OLE (.doc) sain avant de le confier à la bibliothèque, qui boucle sans fin sur une table d'allocation à cycle et alloue
 * sans borne sur un en-tête forgé (audit 0.395.0, H1 et H2). Vérifie la signature, la taille des secteurs et que la table de secteurs
 * (FAT) ne contient aucun cycle. @param {Buffer} buf
 */
function oleSain(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 1024 || buf.length > TAILLE_MAX) return false;
  if (buf.toString('hex', 0, 8) !== 'd0cf11e0a1b11ae1') return false;
  const decalage = buf.readUInt16LE(30);
  if (decalage !== 9 && decalage !== 12) return false;
  const taille = 1 << decalage;
  const nbSecteurs = Math.floor((buf.length - 512) / taille);
  const nbFat = buf.readUInt32LE(44);
  if (nbFat < 1 || nbFat > nbSecteurs) return false;
  // Les secteurs de la FAT : 109 dans l'en-tête, puis la chaîne des secteurs DIFAT (bornée).
  /** @type {number[]} */
  const secteursFat = [];
  for (let i = 0; i < 109 && secteursFat.length < nbFat; i++) {
    const v = buf.readUInt32LE(76 + i * 4);
    if (v < nbSecteurs) secteursFat.push(v);
  }
  let difat = buf.readUInt32LE(68);
  const nbDifat = buf.readUInt32LE(72);
  if (nbDifat > nbSecteurs) return false;
  for (let k = 0; k < nbDifat && difat < nbSecteurs && secteursFat.length < nbFat; k++) {
    const base = 512 + difat * taille;
    if (base + taille > buf.length) return false;
    for (let i = 0; i < taille / 4 - 1 && secteursFat.length < nbFat; i++) {
      const v = buf.readUInt32LE(base + i * 4);
      if (v < nbSecteurs) secteursFat.push(v);
    }
    difat = buf.readUInt32LE(base + taille - 4);
  }
  const parSecteur = taille / 4;
  const fat = new Uint32Array(secteursFat.length * parSecteur);
  for (let n = 0; n < secteursFat.length; n++) {
    const base = 512 + secteursFat[n] * taille;
    if (base + taille > buf.length) return false;
    for (let i = 0; i < parSecteur; i++) fat[n * parSecteur + i] = buf.readUInt32LE(base + i * 4);
  }
  // Un graphe où chaque secteur a au plus un suivant : 0 = pas vu, 1 = en cours, 2 = fini ; un secteur « en cours » revu = cycle.
  const etat = new Uint8Array(fat.length);
  for (let depart = 0; depart < fat.length; depart++) {
    if (etat[depart]) continue;
    /** @type {number[]} */
    const chemin = [];
    let cur = depart;
    while (cur < fat.length && !etat[cur]) { etat[cur] = 1; chemin.push(cur); cur = fat[cur]; }
    if (cur < fat.length && etat[cur] === 1) return false;
    for (const c of chemin) etat[c] = 2;
  }
  return true;
}

/** Le texte d'un Word, ancien (.doc) ou récent (.docx). @param {string} chemin @param {any} [fsImpl] */
async function lireTexteWord(chemin, fsImpl = fsp) {
  const buf = await fsImpl.readFile(chemin);
  if (/\.docx$/i.test(chemin)) return require('./memoire').texteDocx(buf);
  if (!oleSain(buf)) throw new Error('document Word ancien illisible ou suspect');
  const WordExtractor = require('word-extractor');
  const doc = await new WordExtractor().extract(buf);
  return String(doc.getBody() || '');
}

module.exports = { oleSain, analyserCompteRendu, trouverCompteRendu, lireTexteWord, RE_NOM_COMPTE_RENDU };
