// @ts-check
'use strict';

// Clichés aériens d'origine de l'IGN dans CLAIRE (étude 31/10 : « quand on clique sur une photo aérienne, voici le lien qui se télécharge :
// https://data.geopf.fr/telechargement/download/pva/P14000292/IGNF_PVA_1-0__2014-09-26__….tif — ouvrir la photo dans une fenêtre pour se
// déplacer dedans et pouvoir la télécharger »). Le service de téléchargement de la Géoplateforme rend des TIFF découpés en carrés de 512 px
// compressés en JPEG, avec leurs niveaux réduits, et accepte la lecture d'un morceau (Range) : le serveur lit l'en-tête du fichier, puis
// seulement les carrés regardés, qu'il rend en JPEG ordinaires (tables JPEG du fichier + données du carré) — jamais le fichier entier.
// Ne part que l'identifiant public du cliché ; rien d'un dossier.

const BASE = 'https://data.geopf.fr/telechargement/download/pva';
const DELAI_MS = 15000;
const RE_LOT = /^[0-9A-Z][0-9A-Z-]{2,20}$/;
const RE_CLICHE = /^IGNF_PVA_[0-9A-Za-z_.-]{10,140}$/;

/** Pure : l'adresse de téléchargement officielle d'un cliché, ou '' si l'identifiant n'est pas sûr. @param {unknown} lot @param {unknown} cliche */
function urlCliche(lot, cliche) {
  const l = String(lot || ''); const c = String(cliche || '');
  return RE_LOT.test(l) && RE_CLICHE.test(c) ? `${BASE}/${l}/${c}.tif` : '';
}

/** @param {any} injections */
function fetchDe(injections) { return (injections && injections.fetch) || fetch; }

/** Lit les octets [debut, fin] du fichier. @param {string} url @param {number} debut @param {number} fin @param {any} injections */
async function lirePlage(url, debut, fin, injections) {
  const r = await fetchDe(injections)(url, { signal: AbortSignal.timeout(DELAI_MS), headers: { Range: `bytes=${debut}-${fin}` } });
  if (r.status !== 206 && r.status !== 200) {
    const e = new Error(`réponse ${r.status}`);
    /** @type {any} */ (e).statut = r.status;
    throw e;
  }
  const b = Buffer.from(await r.arrayBuffer());
  // Un serveur qui ignorerait la plage rendrait tout le fichier : on n'en garde que la partie demandée.
  return r.status === 200 ? b.subarray(debut, fin + 1) : b;
}

const TAILLES_TYPE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };

/**
 * Pure : les niveaux (IFD) d'un en-tête TIFF (classique ou BigTIFF), avec pour chaque valeur hors de l'entrée son emplacement à lire.
 * @param {Buffer} tete
 * @returns {{ le: boolean, niveaux: Array<{ tags: Record<number, { type: number, compte: number, valeur?: number[], decalage?: number }> }> }}
 */
function lireIfds(tete) {
  const ordre = tete.toString('latin1', 0, 2);
  if (ordre !== 'II' && ordre !== 'MM') throw new Error('Fichier non TIFF.');
  const le = ordre === 'II';
  const u16 = (o) => (le ? tete.readUInt16LE(o) : tete.readUInt16BE(o));
  const u32 = (o) => (le ? tete.readUInt32LE(o) : tete.readUInt32BE(o));
  const u64 = (o) => Number(le ? tete.readBigUInt64LE(o) : tete.readBigUInt64BE(o));
  const version = u16(2);
  if (version !== 42 && version !== 43) throw new Error('TIFF de forme inattendue.');
  const grand = version === 43;
  const entree = grand ? 20 : 12; const tailleCompte = grand ? 8 : 2; const place = grand ? 8 : 4;
  const lireCompte = (o) => (grand ? u64(o) : u16(o));
  const lireDecal = (o) => (grand ? u64(o) : u32(o));
  const niveaux = [];
  let decal = grand ? u64(8) : u32(4);
  while (decal && decal + tailleCompte <= tete.length && niveaux.length < 12) {
    const n = lireCompte(decal);
    if (decal + tailleCompte + n * entree + place > tete.length) break;
    /** @type {Record<number, any>} */
    const tags = {};
    for (let i = 0; i < n; i++) {
      const e = decal + tailleCompte + i * entree;
      const tag = u16(e); const type = u16(e + 2); const compte = grand ? u64(e + 4) : u32(e + 4);
      const v = e + (grand ? 12 : 8);
      const taille = (TAILLES_TYPE[type] || 1) * compte;
      if (taille <= place) {
        const valeur = [];
        for (let k = 0; k < compte; k++) valeur.push(type === 3 ? u16(v + k * 2) : type === 4 ? u32(v + k * 4) : type === 16 ? u64(v) : tete[v + k]);
        tags[tag] = { type, compte, valeur };
      } else tags[tag] = { type, compte, decalage: lireDecal(v) };
    }
    niveaux.push({ tags });
    decal = lireDecal(decal + tailleCompte + n * entree);
  }
  return { le, niveaux };
}

/** @type {Map<string, any>} */
const entetes = new Map();
/** @type {Map<string, Buffer>} */
const carres = new Map();
let octetsCarres = 0;
const OCTETS_CARRES_MAX = 40 * 1024 * 1024;

/** Valeurs d'un tag, lues dans l'en-tête ou à leur emplacement. @param {string} url @param {any} t @param {boolean} le @param {Buffer} tete @param {any} injections */
async function valeursTag(url, t, le, tete, injections) {
  if (!t) return null;
  if (t.valeur) return t.valeur;
  const taille = (TAILLES_TYPE[t.type] || 1) * t.compte;
  const b = t.decalage + taille <= tete.length ? tete.subarray(t.decalage, t.decalage + taille) : await lirePlage(url, t.decalage, t.decalage + taille - 1, injections);
  if (t.type === 7 || t.type === 1) return b;
  const out = [];
  for (let k = 0; k < t.compte; k++) {
    out.push(t.type === 3 ? (le ? b.readUInt16LE(k * 2) : b.readUInt16BE(k * 2))
      : t.type === 16 ? Number(le ? b.readBigUInt64LE(k * 8) : b.readBigUInt64BE(k * 8))
      : (le ? b.readUInt32LE(k * 4) : b.readUInt32BE(k * 4)));
  }
  return out;
}

/** L'en-tête d'un cliché : dimensions de chaque niveau, carrés, tables JPEG. Gardé (30 clichés). @param {string} lot @param {string} cliche @param {any} [injections] */
async function enteteCliche(lot, cliche, injections) {
  const url = urlCliche(lot, cliche);
  if (!url) return { erreur: 'Cliché inconnu.' };
  if (entetes.has(url)) return entetes.get(url);
  const tete = await lirePlage(url, 0, 131071, injections);
  const { le, niveaux } = lireIfds(tete);
  const lus = [];
  for (const n of niveaux) {
    const t = n.tags;
    const largeur = (await valeursTag(url, t[256], le, tete, injections) || [])[0];
    const hauteur = (await valeursTag(url, t[257], le, tete, injections) || [])[0];
    const carre = (await valeursTag(url, t[322], le, tete, injections) || [])[0];
    const compression = (await valeursTag(url, t[259], le, tete, injections) || [])[0];
    if (!largeur || !hauteur || carre !== 512 || compression !== 7 || !t[324] || !t[325]) continue;
    lus.push({ largeur, hauteur, carre,
      decalages: await valeursTag(url, t[324], le, tete, injections), tailles: await valeursTag(url, t[325], le, tete, injections),
      tables: t[347] ? Buffer.from(/** @type {any} */ (await valeursTag(url, t[347], le, tete, injections))) : null });
  }
  // Seuls les niveaux qui divisent chacun la taille par deux, sans trou (la visionneuse en déduit le niveau d'après le zoom).
  const suite = [];
  for (const n of lus) {
    const k = suite.length;
    if (k && (Math.abs(n.largeur - Math.ceil(lus[0].largeur / 2 ** k)) > 1 || Math.abs(n.hauteur - Math.ceil(lus[0].hauteur / 2 ** k)) > 1)) break;
    suite.push(n);
  }
  lus.length = 0; lus.push(...suite);
  if (!lus.length) return { erreur: 'Cliché dans une forme que CLAIRE ne sait pas encore afficher : téléchargez-le.' };
  const valeur = { url, largeur: lus[0].largeur, hauteur: lus[0].hauteur, carre: 512, niveaux: lus };
  entetes.set(url, valeur);
  while (entetes.size > 30) entetes.delete(/** @type {string} */ (entetes.keys().next().value));
  return valeur;
}

/** Pure : un JPEG ordinaire d'après les tables du fichier et les données d'un carré (JPEG « abrégé » du TIFF). @param {Buffer|null} tables @param {Buffer} donnees */
function jpegDuCarre(tables, donnees) {
  if (!tables || tables.length < 4) return donnees;
  // tables = SOI … EOI ; données = SOI … EOI : on garde les tables sans leur EOI, puis les données sans leur SOI.
  const sansFin = tables[tables.length - 2] === 0xFF && tables[tables.length - 1] === 0xD9 ? tables.subarray(0, -2) : tables;
  const sansDebut = donnees[0] === 0xFF && donnees[1] === 0xD8 ? donnees.subarray(2) : donnees;
  return Buffer.concat([sansFin, sansDebut]);
}

/** Un carré du cliché, en JPEG : niveau 0 = pleine résolution. @param {string} lot @param {string} cliche @param {number} niveau @param {number} x @param {number} y @param {any} [injections] */
async function carreCliche(lot, cliche, niveau, x, y, injections) {
  const e = await enteteCliche(lot, cliche, injections);
  if (e.erreur) return e;
  const n = e.niveaux[niveau];
  if (!n || !Number.isInteger(x) || !Number.isInteger(y)) return { erreur: 'Niveau inconnu.' };
  const parLigne = Math.ceil(n.largeur / n.carre);
  const lignes = Math.ceil(n.hauteur / n.carre);
  if (x < 0 || y < 0 || x >= parLigne || y >= lignes) return { erreur: 'Hors du cliché.' };
  const i = y * parLigne + x;
  const cle = `${e.url}|${niveau}|${i}`;
  const deja = carres.get(cle);
  if (deja) { carres.delete(cle); carres.set(cle, deja); return { jpeg: deja }; }
  const debut = n.decalages[i]; const taille = n.tailles[i];
  if (!taille) return { erreur: 'Carré vide.' };
  const jpeg = jpegDuCarre(n.tables, await lirePlage(e.url, debut, debut + taille - 1, injections));
  carres.set(cle, jpeg);
  octetsCarres += jpeg.length;
  while (octetsCarres > OCTETS_CARRES_MAX && carres.size) {
    const k = /** @type {string} */ (carres.keys().next().value);
    octetsCarres -= /** @type {Buffer} */ (carres.get(k)).length;
    carres.delete(k);
  }
  return { jpeg };
}

function viderCacheCliches() { entetes.clear(); carres.clear(); octetsCarres = 0; }

module.exports = { urlCliche, lireIfds, jpegDuCarre, enteteCliche, carreCliche, viderCacheCliches };
