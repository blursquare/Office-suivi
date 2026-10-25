// @ts-check
'use strict';
// Pièces jointes de « Demander à CLAIRE » et des canaux (étude 25/10 : « je veux pouvoir revenir dessus plus tard », « idem dans le canal
// partagé » ; choix : sur le serveur du bureau, 90 jours — la règle « un fichier joint n'est jamais gardé » du 24/10 est levée pour ces
// fichiers). Un PDF ou une image, 25 Mo au plus, dans un dossier de données du serveur (jamais dans la base, jamais sur le NAS) sous un
// identifiant tiré au hasard (128 bits) : le nom d'origine n'est qu'une étiquette gardée dans la clé `pieces-jointes`, jamais un nom de
// fichier sur le disque. La sorte est reconnue par le CONTENU (signature du fichier), jamais par le type que le poste déclare. Lecture
// seule, supprimés après 90 jours ou avec leur message.

const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const CLE = 'pieces-jointes';
const MAX_OCTETS = 25 * 1024 * 1024;
const JOURS_CONSERVATION = 90;
const MAX_FICHIERS = 2000;
const RE_ID = /^[a-f0-9]{32}$/;

/** @typedef {{ nom: string, mime: string, sorte: 'pdf' | 'image', taille: number, le: number, par: string }} PieceJointe */

/**
 * Pur : la sorte d'un fichier d'après ses premiers octets, ou null (ni PDF, ni image PNG/JPEG/GIF/WebP/BMP).
 * @param {Buffer} tampon @returns {{ mime: string, sorte: 'pdf' | 'image' } | null}
 */
function detecterSorte(tampon) {
  if (!Buffer.isBuffer(tampon) || tampon.length < 12) return null;
  const debut = tampon.subarray(0, 16);
  if (debut.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', sorte: 'pdf' };
  if (debut[0] === 0x89 && debut.subarray(1, 4).toString('latin1') === 'PNG') return { mime: 'image/png', sorte: 'image' };
  if (debut[0] === 0xff && debut[1] === 0xd8 && debut[2] === 0xff) return { mime: 'image/jpeg', sorte: 'image' };
  if (debut.subarray(0, 4).toString('latin1') === 'GIF8') return { mime: 'image/gif', sorte: 'image' };
  if (debut.subarray(0, 4).toString('latin1') === 'RIFF' && debut.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', sorte: 'image' };
  if (debut[0] === 0x42 && debut[1] === 0x4d) return { mime: 'image/bmp', sorte: 'image' };
  return null;
}

/** @param {any} id */
const idValide = (id) => typeof id === 'string' && RE_ID.test(id);

/** @param {any} brut @returns {Record<string, PieceJointe>} */
function assainirTable(brut) {
  /** @type {Record<string, PieceJointe>} */
  const out = {};
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return out;
  for (const [id, p] of Object.entries(brut)) {
    if (!idValide(id) || !p || typeof p !== 'object') continue;
    const sorte = p.sorte === 'pdf' ? 'pdf' : p.sorte === 'image' ? 'image' : '';
    const mime = typeof p.mime === 'string' ? p.mime : '';
    if (!sorte || !/^(application\/pdf|image\/(png|jpeg|gif|webp|bmp))$/.test(mime)) continue;
    out[id] = { nom: String(p.nom || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) || (sorte === 'pdf' ? 'Document' : 'Image'), mime, sorte,
      taille: Math.max(0, Number(p.taille) || 0), le: Number(p.le) || 0, par: String(p.par || '').slice(0, 80) };
  }
  return out;
}

/**
 * @param {{ dossier: string, parametresRepo: any }} deps
 */
function creerStockPiecesJointes(deps) {
  const { dossier, parametresRepo } = deps;
  /** @returns {Record<string, PieceJointe>} */
  const lireTable = () => assainirTable(parametresRepo.lireJsonBrut(CLE, {}));
  const ecrireTable = (/** @type {Record<string, PieceJointe>} */ t) => parametresRepo.ecrireJsonBrut(CLE, t);
  const chemin = (/** @type {string} */ id) => path.join(dossier, id);

  return {
    /** @param {Buffer} tampon @param {string} nom @param {string} par @param {number} [maintenant] */
    async enregistrer(tampon, nom, par, maintenant) {
      if (!Buffer.isBuffer(tampon) || !tampon.length) return { ok: false, erreur: 'Fichier vide.' };
      if (tampon.length > MAX_OCTETS) return { ok: false, erreur: 'Fichier de plus de 25 Mo.' };
      const sorte = detecterSorte(tampon);
      if (!sorte) return { ok: false, erreur: 'Seuls les PDF et les images (PNG, JPEG, GIF, WebP, BMP) sont gardés.' };
      const table = lireTable();
      if (Object.keys(table).length >= MAX_FICHIERS) return { ok: false, erreur: 'Trop de pièces jointes gardées : attendez qu’elles expirent.' };
      const id = crypto.randomBytes(16).toString('hex');
      await fsp.mkdir(dossier, { recursive: true });
      await fsp.writeFile(chemin(id), tampon, { flag: 'wx' });
      const meta = assainirTable({ [id]: { nom, mime: sorte.mime, sorte: sorte.sorte, taille: tampon.length, le: maintenant || Date.now(), par } })[id];
      table[id] = meta;
      ecrireTable(table);
      return { ok: true, id, meta };
    },
    /** @param {string} id @returns {PieceJointe | null} */
    meta(id) { return idValide(id) ? (lireTable()[id] || null) : null; },
    /** @param {string} id @returns {string} chemin du fichier, ou '' */
    cheminFichier(id) { return idValide(id) && lireTable()[id] ? chemin(id) : ''; },
    /** @param {string} id */
    async supprimer(id) {
      if (!idValide(id)) return false;
      const table = lireTable();
      if (!table[id]) return false;
      delete table[id];
      ecrireTable(table);
      try { await fsp.rm(chemin(id), { force: true }); } catch (e) { /* déjà absent */ }
      return true;
    },
    /** Retire les fichiers de plus de 90 jours, et les orphelins du dossier. Rend le nombre retiré. @param {number} [maintenant] */
    async purger(maintenant) {
      const limite = (maintenant || Date.now()) - JOURS_CONSERVATION * 86400000;
      const table = lireTable();
      let n = 0;
      for (const id of Object.keys(table)) {
        if (table[id].le && table[id].le < limite) { delete table[id]; try { await fsp.rm(chemin(id), { force: true }); } catch (e) { /* déjà absent */ } n += 1; }
      }
      if (n) ecrireTable(table);
      let fichiers = [];
      try { fichiers = await fsp.readdir(dossier); } catch (e) { fichiers = []; }
      for (const f of fichiers) {
        if (idValide(f) && !table[f]) { try { await fsp.rm(chemin(f), { force: true }); n += 1; } catch (e) { /* ignoré */ } }
      }
      return n;
    }
  };
}

module.exports = { CLE, MAX_OCTETS, JOURS_CONSERVATION, MAX_FICHIERS, RE_ID, detecterSorte, idValide, assainirTable, creerStockPiecesJointes };
