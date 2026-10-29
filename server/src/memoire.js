// @ts-check
'use strict';

// Mémoire de CLAIRE (étude 15/10 : « comment créer un cerveau à CLAIRE ? », « c'est comme un RAG ? », puis les quatre dossiers à analyser :
// DECENNALES ENTREPRISES, FAUSSES MINUTES, MODELES - OUTILS, RAPPEL DE PROCEDURES — « tout est à la racine du NAS »).
// Le serveur PARCOURT ces dossiers en lecture seule (jamais une écriture, jamais un chemin reçu du réseau), en tire le texte, le découpe
// en passages et l'indexe en plein texte (SQLite FTS5, mots sans accent ni majuscule) :
// - Word (.docx) et texte (.txt, .md) : lus ici ;
// - PDF : lus par le POSTE (pdf.js, OCR pour un scan — comme tout PDF dans CLAIRE) qui rend le texte page par page (`enregistrerTexte`).
// Les passages restent en base sur le serveur du bureau. Ils ne partent vers l'IA qu'à la demande de l'agent « Demander à CLAIRE »
// (outil `chercher_dans_la_memoire`), masqués comme tout résultat d'outil, sans jamais un nom de fichier.

const path = require('node:path');
const fsp = require('node:fs/promises');
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const { parentsCandidats } = require('./scans');

const inflateRaw = promisify(zlib.inflateRaw);

/** Les quatre dossiers analysés : clé stable, libellé, reconnaissance du nom (sans accent, majuscule ni ponctuation). */
const RUBRIQUES_MEMOIRE = [
  { cle: 'decennales', libelle: 'Décennales des entreprises', nom: 'DECENNALES ENTREPRISES', re: /^decennales? entreprises?$/ },
  { cle: 'fausses-minutes', libelle: 'Fausses minutes', nom: 'FAUSSES MINUTES', re: /^fausses? minutes?$/ },
  { cle: 'modeles-outils', libelle: 'Modèles et outils', nom: 'MODELES - OUTILS', re: /^modeles? outils?$/ },
  { cle: 'rappel-procedures', libelle: 'Rappel de procédures', nom: 'RAPPEL DE PROCEDURES', re: /^rappels? de procedures?$/ },
  // Pas un dossier du NAS (étude 16/10 : « ok pour le 1 ») : les règles durables de CLAIRE (CLAUDE.md) et l'historique des décisions
  // (docs/historique.md), embarqués dans le serveur. Aucune donnée client (règle du dépôt).
  { cle: 'regles-etude', libelle: 'Règles et décisions de l’étude', nom: 'RÈGLES ET DÉCISIONS DE L’ÉTUDE', re: null, interne: true }
];

/** Les textes de la rubrique « Règles et décisions de l'étude » : chemin en base, nom affiché, asset du .exe, fichier du dépôt. */
const SOURCES_REGLES = [
  { chemin: 'regles.md', nom: 'Règles durables de CLAIRE', asset: 'memoire/CLAUDE.md', repo: 'CLAUDE.md' },
  { chemin: 'historique.md', nom: 'Historique des décisions', asset: 'memoire/historique.md', repo: 'docs/historique.md' }
];

const EXTENSIONS_LUES = ['pdf', 'docx', 'txt', 'md'];
const PROFONDEUR_MAX = 6;
const MAX_FICHIERS_PAR_RUBRIQUE = 20000;
const TAILLE_MAX_OCTETS = 60 * 1024 * 1024;           // au-delà, le fichier n'est pas lu (statut « trop_gros »)
const TAILLE_MAX_DOCX_DECOMPRESSE = 40 * 1024 * 1024; // contre un fichier piégé
const PASSAGE_CIBLE = 700;
const PASSAGE_MAX = 1000;
const EXTRAIT_MAX = 700;
const MAX_PASSAGES_PAR_DOCUMENT = 4000;
// L'historique des décisions grandit à chaque demande (≈ 2 800 passages le 16/10) : la limite d'un document du NAS couperait les plus récentes.
const MAX_PASSAGES_REGLES = 40000;

// ---- Reconnaissance des dossiers (pure) -----------------------------------------------------------------------------------

/** Pure : un nom sans accent, en minuscules, la ponctuation réduite à un espace. @param {string} nom */
function normaliserNom(nom) {
  return String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Pure : la rubrique que désigne le nom d'un dossier, ou null. @param {string} nom */
function rubriqueDuNom(nom) {
  const n = normaliserNom(nom);
  return RUBRIQUES_MEMOIRE.find((r) => r.re && r.re.test(n)) || null;
}

/** Pure : l'extension (sans point, en minuscules) d'un nom de fichier si elle est lue, sinon ''. @param {string} nom */
function extensionLue(nom) {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(String(nom || ''));
  const e = m ? m[1].toLowerCase() : '';
  return EXTENSIONS_LUES.includes(e) ? e : '';
}

/** Les dossiers de la mémoire : dans la racine des dossiers clients ou ses parents (même méthode que « Fausses minutes » et « Scan »),
 * `config.memoireDossiers` { cle: chemin } en secours (config.json, réservé à l'administrateur du poste). Jamais un chemin du réseau.
 * @param {any} config @param {any} [fsImpl] */
async function trouverDossiersMemoire(config, fsImpl = fsp) {
  /** @type {Array<{ cle: string, libelle: string, nom: string, chemin: string }>} */
  const trouves = [];
  const forces = (config && config.memoireDossiers && typeof config.memoireDossiers === 'object') ? config.memoireDossiers : {};
  for (const r of RUBRIQUES_MEMOIRE) {
    if (r.interne) continue;
    const chemin = typeof forces[r.cle] === 'string' ? forces[r.cle] : '';
    if (!chemin) continue;
    try { if ((await fsImpl.stat(chemin)).isDirectory()) trouves.push({ cle: r.cle, libelle: r.libelle, nom: r.nom, chemin: path.resolve(chemin) }); } catch (_) { /* absent */ }
  }
  for (const dossier of parentsCandidats(config && config.nasRacine)) {
    let entrees;
    try { entrees = await fsImpl.readdir(dossier, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entrees) {
      if (!e.isDirectory()) continue;
      const r = rubriqueDuNom(e.name);
      if (r && !trouves.some((t) => t.cle === r.cle)) trouves.push({ cle: r.cle, libelle: r.libelle, nom: r.nom, chemin: path.join(dossier, e.name) });
    }
  }
  return trouves;
}

// ---- Texte des Word et des fichiers texte -------------------------------------------------------------------------------------

/** Pure : les entrées d'une archive ZIP (répertoire central). @param {Buffer} buf @returns {Map<string, { methode: number, compresse: number, taille: number, decalage: number }>} */
function entreesZip(buf) {
  /** @type {Map<string, { methode: number, compresse: number, taille: number, decalage: number }>} */
  const entrees = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('archive illisible');
  const nombre = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < nombre && p + 46 <= buf.length; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const methode = buf.readUInt16LE(p + 10);
    const compresse = buf.readUInt32LE(p + 20);
    const taille = buf.readUInt32LE(p + 24);
    const lNom = buf.readUInt16LE(p + 28); const lExtra = buf.readUInt16LE(p + 30); const lComm = buf.readUInt16LE(p + 32);
    const decalage = buf.readUInt32LE(p + 42);
    entrees.set(buf.subarray(p + 46, p + 46 + lNom).toString('utf8'), { methode, compresse, taille, decalage });
    p += 46 + lNom + lExtra + lComm;
  }
  return entrees;
}

/** Le contenu d'une entrée de l'archive (déflate ou stocké ; 40 Mo au plus décompressé). @param {Buffer} buf @param {{ methode: number, compresse: number, taille: number, decalage: number }} e */
async function contenuZip(buf, e) {
  if (e.taille > TAILLE_MAX_DOCX_DECOMPRESSE) throw new Error('entrée trop grosse');
  const d = e.decalage;
  if (d + 30 > buf.length || buf.readUInt32LE(d) !== 0x04034b50) throw new Error('archive illisible');
  const debut = d + 30 + buf.readUInt16LE(d + 26) + buf.readUInt16LE(d + 28);
  const brut = buf.subarray(debut, debut + e.compresse);
  if (e.methode === 0) return brut;
  if (e.methode === 8) return inflateRaw(brut, { maxOutputLength: TAILLE_MAX_DOCX_DECOMPRESSE });
  throw new Error('compression non gérée');
}

/** Pure : décode les entités XML courantes. @param {string} s */
function sansEntitesXml(s) {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** Pure : le XML sans les blocs `ouvre … ferme`, par recherche linéaire (une regex paresseuse y est quadratique : un document forgé figeait
 * le serveur — audit 21/10, M2). `<w:del` ne doit pas être le début de `<w:delText` : le caractère suivant est contrôlé. @param {string} xml @param {string} ouvre @param {string} ferme */
function retirerBlocsXml(xml, ouvre, ferme) {
  let sortie = '';
  let i = 0;
  while (i < xml.length) {
    let d = xml.indexOf(ouvre, i);
    while (d >= 0 && /[A-Za-z0-9]/.test(xml[d + ouvre.length] || '')) d = xml.indexOf(ouvre, d + 1);
    if (d < 0) { sortie += xml.slice(i); break; }
    sortie += xml.slice(i, d);
    const f = xml.indexOf(ferme, d);
    if (f < 0) break;
    i = f + ferme.length;
  }
  return sortie;
}

/** Pure : les paragraphes `<w:p …>…</w:p>` d'un XML, par recherche linéaire — des objets `{ 0: texte }` comme les résultats de matchAll. @param {string} xml */
function paragraphesXml(xml) {
  /** @type {string[][]} */
  const sortie = [];
  let i = 0;
  while (i < xml.length) {
    let d = xml.indexOf('<w:p', i);
    while (d >= 0 && /[A-Za-z0-9]/.test(xml[d + 4] || '')) d = xml.indexOf('<w:p', d + 1);
    if (d < 0) break;
    const f = xml.indexOf('</w:p>', d);
    if (f < 0) break;
    sortie.push([xml.slice(d, f + 6)]);
    i = f + 6;
  }
  return sortie;
}

/** Pure : le texte d'un `word/document.xml` — un paragraphe par ligne (tabulations et retours conservés). Texte seulement : ni mise en
 * forme, ni commentaires, ni modifications suivies supprimées. @param {string} xml */
function texteDocumentXml(xml) {
  const sansSupprime = retirerBlocsXml(xml, '<w:del', '</w:del>');
  const lignes = [];
  for (const m of paragraphesXml(sansSupprime)) {
    const morceaux = [];
    for (const t of m[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)) {
      morceaux.push(t[1] !== undefined ? sansEntitesXml(t[1]) : (t[0].startsWith('<w:tab') ? '\t' : '\n'));
    }
    const ligne = morceaux.join('').replace(/[ \t]+/g, ' ').trim();
    if (ligne) lignes.push(ligne);
  }
  return lignes.join('\n');
}

/** Le texte d'un fichier Word (.docx). @param {Buffer} buf */
async function texteDocx(buf) {
  const entrees = entreesZip(buf);
  const doc = entrees.get('word/document.xml');
  if (!doc) throw new Error('pas un document Word');
  return texteDocumentXml((await contenuZip(buf, doc)).toString('utf8'));
}

// ---- Passages (purs) ---------------------------------------------------------------------------------------------------------

/** Pure : un texte coupé en passages de 700 à 1 000 caractères, aux fins de paragraphes ou de phrases. @param {string} texte @returns {string[]} */
function decouperTexte(texte) {
  const paragraphes = String(texte || '').replace(/\r/g, '').split(/\n+/).map((p) => p.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  /** @type {string[]} */
  const passages = [];
  let courant = '';
  const pousser = () => { if (courant.trim()) passages.push(courant.trim()); courant = ''; };
  for (const p of paragraphes) {
    if (p.length > PASSAGE_MAX) {
      pousser();
      let reste = p;
      while (reste.length > PASSAGE_MAX) {
        let coupe = reste.lastIndexOf('. ', PASSAGE_MAX);
        if (coupe < PASSAGE_CIBLE / 2) coupe = reste.lastIndexOf(' ', PASSAGE_MAX);
        if (coupe < PASSAGE_CIBLE / 2) coupe = PASSAGE_MAX;
        passages.push(reste.slice(0, coupe + 1).trim());
        reste = reste.slice(coupe + 1).trim();
      }
      courant = reste;
      continue;
    }
    if (courant && courant.length + 1 + p.length > PASSAGE_MAX) pousser();
    courant = courant ? `${courant}\n${p}` : p;
    if (courant.length >= PASSAGE_CIBLE) pousser();
  }
  pousser();
  return passages;
}

/** Pure : les passages d'un document lu page par page ({ n, texte }), numérotés par page (0 = sans notion de page). @param {Array<{ n: number, texte: string }>} pages @param {number} [max] */
function passagesDesPages(pages, max = MAX_PASSAGES_PAR_DOCUMENT) {
  /** @type {Array<{ page: number, texte: string }>} */
  const out = [];
  for (const p of pages) {
    for (const t of decouperTexte(p.texte)) { if (out.length < max) out.push({ page: Math.max(0, Number(p.n) || 0), texte: t }); }
  }
  return out;
}

// ---- Règles et décisions de l'étude (CLAUDE.md, historique) ------------------------------------------------------------------

/** Pure : un texte Markdown coupé en sections à chaque titre (« # », « ## », « ### », « #### ») — { n (1, 2…), titre, texte }.
 * Le passage garde le numéro de sa section : la recherche rend le titre de la section, pas une page. @param {string} texte */
function sectionsMarkdown(texte) {
  /** @type {Array<{ n: number, titre: string, texte: string }>} */
  const sections = [];
  let courante = { n: 1, titre: '', lignes: /** @type {string[]} */ ([]) };
  const pousser = () => { const t = courante.lignes.join('\n').trim(); if (t) sections.push({ n: sections.length + 1, titre: courante.titre, texte: t }); };
  for (const ligne of String(texte || '').replace(/\r/g, '').split('\n')) {
    const m = /^#{1,4}\s+(.+?)\s*#*\s*$/.exec(ligne);
    if (m) { pousser(); courante = { n: sections.length + 1, titre: m[1].replace(/[*`_]/g, '').trim().slice(0, 160), lignes: [] }; continue; }
    courante.lignes.push(ligne);
  }
  pousser();
  return sections;
}

/** Pure : une empreinte numérique stable d'un texte (FNV-1a 32 bits) — sert de « date de modification » d'une source embarquée. @param {string} texte */
function empreinteTexte(texte) {
  let h = 0x811c9dc5;
  const t = String(texte || '');
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/** Le texte d'une source des règles : asset du .exe, sinon le fichier du dépôt ; '' s'il est absent. @param {{ asset: string, repo: string }} source @param {{ racineRepo?: string }} [config] */
async function texteSourceRegles(source, config) {
  try {
    const sea = require('node:sea');
    if (sea.isSea()) return sea.getAsset(source.asset, 'utf8');
  } catch (_) { /* hors exécutable */ }
  // Hors exécutable : le dépôt de la configuration (`config.racineRepo`, toujours posé par config.js) ; sans lui, rien.
  if (!config || !config.racineRepo) return '';
  try { return await fsp.readFile(path.join(String(config.racineRepo), source.repo), 'utf8'); } catch (_) { return ''; }
}

/** Indexe les règles et l'historique (relus seulement s'ils ont changé). @param {{ memoire: any, config?: any, lireSource?: (s: any) => Promise<string> }} o */
async function indexerRegles(o) {
  const lire = o.lireSource || ((src) => texteSourceRegles(src, o.config));
  let lus = 0;
  let toutesLues = true;
  for (const src of SOURCES_REGLES) {
    const texte = String(await lire(src) || '');
    if (!texte.trim()) { toutesLues = false; continue; }
    const empreinte = empreinteTexte(texte);
    const sections = sectionsMarkdown(texte);
    titresRegles.set(src.chemin, { empreinte, titres: sections.map((x) => x.titre) });
    const r = o.memoire.voirFichier('regles-etude', src.chemin, src.nom, 'md', Buffer.byteLength(texte), empreinte);
    const doc = o.memoire.documentPar('regles-etude', src.chemin);
    if (!doc || (r === 'inchange' && doc.statut === 'lu')) continue;
    o.memoire.enregistrerTexte(doc.id, sections.map((x) => ({ n: x.n, texte: x.titre ? `${x.titre}\n${x.texte}` : x.texte })), { maxPassages: MAX_PASSAGES_REGLES });
    lus++;
  }
  // Une source retirée ou renommée ne reste pas cherchable (seulement quand toutes les sources ont été lues).
  if (toutesLues) o.memoire.retirerAbsents('regles-etude', SOURCES_REGLES.map((x) => x.chemin));
  return lus;
}

/** Les titres des sections de chaque source des règles, avec l'empreinte du texte d'où ils viennent (mémoire du serveur). */
const titresRegles = new Map();
/**
 * Le titre de la section `n` d'un document des règles — seulement s'il vient du MÊME texte que celui indexé en base (empreinte gardée
 * dans `modifie_ms`) : juste après une mise à jour, avant la réindexation, un titre d'un autre texte nommerait la mauvaise section.
 * @param {{ chemin: string, modifie_ms: number }} doc @param {number} n @param {any} [config]
 */
async function titreSectionRegles(doc, n, config) {
  if (!doc) return '';
  let entree = titresRegles.get(doc.chemin);
  if (!entree || entree.empreinte !== Number(doc.modifie_ms)) {
    const src = SOURCES_REGLES.find((x) => x.chemin === doc.chemin);
    const texte = src ? await texteSourceRegles(src, config) : '';
    if (texte) { entree = { empreinte: empreinteTexte(texte), titres: sectionsMarkdown(texte).map((x) => x.titre) }; titresRegles.set(doc.chemin, entree); }
  }
  return entree && entree.empreinte === Number(doc.modifie_ms) ? entree.titres[n - 1] || '' : '';
}

// ---- Recherche (pure pour la requête) -------------------------------------------------------------------------------------------

const MOTS_VIDES = new Set(('les des une aux dans sur pour par avec sans sous comme cette cet ces son sa ses leur leurs est sont etre avoir fait faire ' +
  'que qui quoi dont ont aussi plus moins tres tout tous toute toutes mais donc car puis ainsi entre vers chez notre nos votre vos quel quelle quels quelles ' +
  'peut peux doit faut dois quand comment pourquoi lorsque alors ceci cela celui celle ceux celles dire donne trouve cherche cherchez').split(' '));

/** Pure : les mots utiles d'une question, sans accent, au singulier approché (sert de préfixe), 8 au plus. @param {string} question @returns {string[]} */
function motsDeRecherche(question) {
  const vus = new Set();
  /** @type {string[]} */
  const mots = [];
  for (const brut of normaliserNom(question).split(' ')) {
    if (brut.length < 3 || MOTS_VIDES.has(brut)) continue;
    let m = brut.replace(/(?:s|x)$/, '');
    if (m.length < 3) m = brut;
    if (vus.has(m)) continue;
    vus.add(m);
    mots.push(m);
    if (mots.length >= 8) break;
  }
  return mots;
}

/** Pure : la requête FTS5 — tous les mots (ET) ou n'importe lequel (OU), chacun en préfixe ; '' s'il n'y a rien à chercher. @param {string[]} mots @param {'et' | 'ou'} mode */
function requeteFts(mots, mode) {
  if (!mots.length) return '';
  return mots.map((m) => `"${m.replace(/"/g, '')}"*`).join(mode === 'et' ? ' AND ' : ' OR ');
}

/** Pure : l'extrait d'un passage autour du premier mot cherché, 700 caractères au plus. @param {string} texte @param {string[]} mots */
function extraitAutour(texte, mots) {
  const t = String(texte || '');
  if (t.length <= EXTRAIT_MAX) return t;
  const sans = normaliserNom(t);
  // normaliserNom change la longueur (ponctuation) : la position se cherche dans le texte d'origine, sans accent.
  const plat = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let pos = -1;
  for (const m of mots) { const i = plat.indexOf(m); if (i >= 0 && (pos < 0 || i < pos)) pos = i; }
  void sans;
  const debut = Math.max(0, (pos < 0 ? 0 : pos) - 150);
  return `${debut > 0 ? '… ' : ''}${t.slice(debut, debut + EXTRAIT_MAX).trim()}${debut + EXTRAIT_MAX < t.length ? ' …' : ''}`;
}

// ---- La base ---------------------------------------------------------------------------------------------------------------

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS memoire_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rubrique TEXT NOT NULL,
    chemin TEXT NOT NULL,
    nom TEXT NOT NULL,
    ext TEXT NOT NULL,
    taille INTEGER NOT NULL,
    modifie_ms INTEGER NOT NULL,
    statut TEXT NOT NULL DEFAULT 'a_lire',
    pages INTEGER NOT NULL DEFAULT 0,
    ocr INTEGER NOT NULL DEFAULT 0,
    erreur TEXT NOT NULL DEFAULT '',
    lu_le INTEGER NOT NULL DEFAULT 0,
    UNIQUE (rubrique, chemin)
  );
  CREATE INDEX IF NOT EXISTS idx_memoire_documents_statut ON memoire_documents(statut, ext);
  CREATE TABLE IF NOT EXISTS memoire_passages (id INTEGER PRIMARY KEY AUTOINCREMENT, doc INTEGER NOT NULL, page INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_memoire_passages_doc ON memoire_passages(doc);
  CREATE TABLE IF NOT EXISTS memoire_resumes (doc INTEGER PRIMARY KEY, type TEXT NOT NULL DEFAULT '', emetteur TEXT NOT NULL DEFAULT '', date_doc TEXT NOT NULL DEFAULT '', resume TEXT NOT NULL DEFAULT '', essais INTEGER NOT NULL DEFAULT 0, genere_le INTEGER NOT NULL DEFAULT 0);
  CREATE VIRTUAL TABLE IF NOT EXISTS memoire_fts USING fts5(texte, tokenize = 'unicode61 remove_diacritics 2');
`;

/** La mémoire sur la base du serveur. @param {any} db base node:sqlite */
function creerMemoire(db) {
  db.exec(SCHEMA);
  const trouverStmt = db.prepare('SELECT * FROM memoire_documents WHERE rubrique = ? AND chemin = ?');
  const ajouterStmt = db.prepare('INSERT INTO memoire_documents (rubrique, chemin, nom, ext, taille, modifie_ms, statut) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const changerStmt = db.prepare("UPDATE memoire_documents SET nom = ?, taille = ?, modifie_ms = ?, statut = ?, erreur = '' WHERE id = ?");
  // Un passage = une ligne de memoire_passages (indexée par document) et la ligne de même rowid de memoire_fts : retirer un document
  // ne balaie jamais l'index plein texte (audit 15/10 : un DELETE sur une colonne non indexée lisait toute la table).
  const idsPassagesStmt = db.prepare('SELECT id FROM memoire_passages WHERE doc = ?');
  const retirerFtsLigneStmt = db.prepare('DELETE FROM memoire_fts WHERE rowid = ?');
  const retirerPassagesStmt = db.prepare('DELETE FROM memoire_passages WHERE doc = ?');
  const insererPassageStmt = db.prepare('INSERT INTO memoire_passages (doc, page) VALUES (?, ?)');
  const insererFtsStmt = db.prepare('INSERT INTO memoire_fts (rowid, texte) VALUES (?, ?)');
  function retirerPassages(doc) {
    for (const l of idsPassagesStmt.all(Number(doc))) retirerFtsLigneStmt.run(l.id);
    retirerPassagesStmt.run(Number(doc));
  }
  const lireStmt = db.prepare('SELECT * FROM memoire_documents WHERE id = ?');
  // Rubriques mises « en option » et éteintes (15/10 : scan des fausses minutes) : ni lues, ni cherchées, mais gardées en base.
  /** @type {string[]} */
  let exclues = [];
  const sansExclues = (colonne) => (exclues.length ? ` AND ${colonne} NOT IN (${exclues.map(() => '?').join(',')})` : '');
  const supprimerStmt = db.prepare('DELETE FROM memoire_documents WHERE id = ?');

  function transaction(fn) {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (_) { /* déjà annulée */ } throw e; }
  }

  return {
    /** Inscrit un fichier vu au parcours ; « à lire » s'il est nouveau ou changé. Rend 'nouveau' | 'change' | 'inchange'. */
    voirFichier(rubrique, chemin, nom, ext, taille, modifieMs) {
      const ex = trouverStmt.get(rubrique, chemin);
      const statutInitial = taille > TAILLE_MAX_OCTETS ? 'trop_gros' : 'a_lire';
      if (!ex) { ajouterStmt.run(rubrique, chemin, nom, ext, taille, modifieMs, statutInitial); return 'nouveau'; }
      if (ex.taille === taille && ex.modifie_ms === modifieMs) return 'inchange';
      transaction(() => { retirerPassages(ex.id); db.prepare('DELETE FROM memoire_resumes WHERE doc = ?').run(ex.id); changerStmt.run(nom, taille, modifieMs, statutInitial, ex.id); });
      return 'change';
    },
    /** Retire de la mémoire les fichiers d'une rubrique qui n'étaient plus au dernier parcours. */
    retirerAbsents(rubrique, cheminsVus) {
      const vus = new Set(cheminsVus);
      let n = 0;
      for (const d of db.prepare('SELECT id, chemin FROM memoire_documents WHERE rubrique = ?').all(rubrique)) {
        if (vus.has(d.chemin)) continue;
        transaction(() => { retirerPassages(d.id); db.prepare('DELETE FROM memoire_resumes WHERE doc = ?').run(d.id); supprimerStmt.run(d.id); });
        n++;
      }
      return n;
    },
    /** Range le texte lu d'un document (page par page) : remplace ses passages, le marque lu (ou « vide » sans texte). */
    enregistrerTexte(id, pages, { ocr = false, maxPassages = MAX_PASSAGES_PAR_DOCUMENT } = {}) {
      const d = lireStmt.get(id);
      if (!d) return { erreur: 'document inconnu' };
      const passages = passagesDesPages(pages, maxPassages);
      transaction(() => {
        retirerPassages(id);
        for (const p of passages) insererFtsStmt.run(Number(insererPassageStmt.run(id, p.page).lastInsertRowid), p.texte);
        db.prepare('UPDATE memoire_documents SET statut = ?, pages = ?, ocr = ?, erreur = ?, lu_le = ? WHERE id = ?')
          .run(passages.length ? 'lu' : 'vide', pages.length, ocr ? 1 : 0, '', Date.now(), id);
      });
      return { ok: true, passages: passages.length };
    },
    marquerErreur(id, message, statut = 'erreur') {
      db.prepare('UPDATE memoire_documents SET statut = ?, erreur = ?, lu_le = ? WHERE id = ?').run(statut, String(message || '').slice(0, 160), Date.now(), id);
    },
    document(id) { return lireStmt.get(id) || null; },
    documentPar(rubrique, chemin) { return trouverStmt.get(rubrique, chemin) || null; },
    /** Les documents à lire (statut « a_lire »), du type demandé ('pdf' pour le poste, 'serveur' pour Word et texte). */
    definirExclues(liste) { exclues = (Array.isArray(liste) ? liste : []).filter((x) => typeof x === 'string'); },
    aLire(type, limite, { dossiers = false } = {}) {
      const filtre = type === 'pdf' ? "ext = 'pdf'" : "ext != 'pdf'";
      // Les dossiers en cours (rubriques « d:<id> », index du NAS, 0.402.0) ne se mêlent jamais aux quatre rubriques de la mémoire.
      const rub = dossiers ? " AND rubrique LIKE 'd:%'" : " AND rubrique NOT LIKE 'd:%'";
      return db.prepare(`SELECT * FROM memoire_documents WHERE statut = 'a_lire' AND ${filtre}${rub}${dossiers ? '' : sansExclues('rubrique')} ORDER BY id LIMIT ?`).all(...(dossiers ? [] : exclues), Math.max(1, Math.min(50, Number(limite) || 10)));
    },
    /** Réserve des PDF pour une fenêtre (statut « en_cours ») : deux fenêtres ne lisent pas le même ; une réservation de plus de 10 min est rendue. */
    reserverPourPoste(docs) {
      db.prepare("UPDATE memoire_documents SET statut = 'a_lire' WHERE statut = 'en_cours' AND lu_le < ?").run(Date.now() - 10 * 60 * 1000);
      for (const d of docs) db.prepare("UPDATE memoire_documents SET statut = 'en_cours', lu_le = ? WHERE id = ? AND statut = 'a_lire'").run(Date.now(), d.id);
    },
    /** Retire de la mémoire tous les documents d'une rubrique (dossier clos ou non relié). */
    retirerRubrique(rubrique) {
      let n = 0;
      for (const d of db.prepare('SELECT id FROM memoire_documents WHERE rubrique = ?').all(rubrique)) {
        transaction(() => { retirerPassages(d.id); db.prepare('DELETE FROM memoire_resumes WHERE doc = ?').run(d.id); supprimerStmt.run(d.id); });
        n++;
      }
      return n;
    },
    /** Les rubriques « d:<id> » présentes. */
    rubriquesDossiers() { return db.prepare("SELECT DISTINCT rubrique FROM memoire_documents WHERE rubrique LIKE 'd:%'").all().map((r) => r.rubrique); },
    /** Le texte lu d'un document (passages dans l'ordre), `max` caractères au plus. */
    texteDocument(id, max = 6000) {
      const lignes = db.prepare('SELECT f.texte AS texte FROM memoire_passages p JOIN memoire_fts f ON f.rowid = p.id WHERE p.doc = ? ORDER BY p.page, p.id').all(Number(id));
      return lignes.map((l) => l.texte).join('\n').slice(0, max);
    },
    /** Documents lus d'un dossier en cours qui attendent leur résumé (deux essais au plus). */
    aResumer(limite) {
      return db.prepare(`SELECT d.* FROM memoire_documents d LEFT JOIN memoire_resumes r ON r.doc = d.id
        WHERE d.rubrique LIKE 'd:%' AND d.statut = 'lu' AND (r.doc IS NULL OR (r.resume = '' AND r.essais < 2)) ORDER BY d.id LIMIT ?`).all(Math.max(1, Math.min(20, Number(limite) || 5)));
    },
    enregistrerResume(id, { type = '', emetteur = '', date = '', resume = '' } = {}, echec = false) {
      const ex = db.prepare('SELECT essais FROM memoire_resumes WHERE doc = ?').get(Number(id));
      db.prepare('INSERT INTO memoire_resumes (doc, type, emetteur, date_doc, resume, essais, genere_le) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(doc) DO UPDATE SET type = excluded.type, emetteur = excluded.emetteur, date_doc = excluded.date_doc, resume = excluded.resume, essais = excluded.essais, genere_le = excluded.genere_le')
        .run(Number(id), String(type).slice(0, 80), String(emetteur).slice(0, 120), String(date).slice(0, 10), String(resume).slice(0, 600), echec ? ((ex && ex.essais) || 0) + 1 : 0, Date.now());
    },
    resume(id) { return db.prepare('SELECT * FROM memoire_resumes WHERE doc = ?').get(Number(id)) || null; },
    /** Les documents d'une rubrique avec leur résumé (inventaire d'un dossier). */
    documentsRubrique(rubrique, limite = 60) {
      return db.prepare(`SELECT d.id, d.chemin, d.ext, d.statut, d.pages, r.type, r.emetteur, r.date_doc, r.resume FROM memoire_documents d LEFT JOIN memoire_resumes r ON r.doc = d.id
        WHERE d.rubrique = ? ORDER BY d.chemin LIMIT ?`).all(rubrique, Math.max(1, Math.min(200, Number(limite) || 60)));
    },
    /** Au début de chaque parcours : les Word et textes en erreur sont retentés (NAS indisponible un instant, fichier verrouillé). */
    retenterErreursServeur() {
      return db.prepare("UPDATE memoire_documents SET statut = 'a_lire', erreur = '' WHERE statut = 'erreur' AND ext != 'pdf'").run().changes;
    },
    /** Remet à lire les documents en erreur ou vides (après une correction de l'outil de lecture). */
    reessayer() {
      return db.prepare("UPDATE memoire_documents SET statut = 'a_lire', erreur = '' WHERE statut IN ('erreur', 'vide')").run().changes;
    },
    /** Comptes par rubrique et par statut. */
    etat() {
      const lignes = db.prepare('SELECT rubrique, statut, ext, COUNT(*) AS n, COALESCE(SUM(ocr), 0) AS ocr FROM memoire_documents GROUP BY rubrique, statut, ext').all();
      const passages = db.prepare('SELECT COUNT(*) AS n FROM memoire_passages').get().n;
      return { lignes, passages };
    },
    /** Cherche des passages : tous les mots d'abord, puis n'importe lequel ; chaque passage nomme sa rubrique et sa page, jamais son fichier. */
    chercher(question, { rubrique = '', limite = 8 } = {}) {
      const mots = motsDeRecherche(question);
      if (!mots.length) return { mots, passages: [] };
      const max = Math.max(1, Math.min(15, Number(limite) || 8));
      const filtreRubrique = (rubrique ? ' AND d.rubrique = ?' : " AND d.rubrique NOT LIKE 'd:%'") + (/^d:/.test(rubrique) ? '' : sansExclues('d.rubrique'));
      const sql = `SELECT f.rowid AS rowid, f.texte AS texte, p.page AS page, p.doc AS doc, d.rubrique AS rubrique
        FROM memoire_fts f JOIN memoire_passages p ON p.id = f.rowid JOIN memoire_documents d ON d.id = p.doc
        WHERE memoire_fts MATCH ?${filtreRubrique} ORDER BY rank LIMIT ?`;
      const vus = new Set();
      /** @type {Array<{ doc: number, rubrique: string, page: number, extrait: string }>} */
      const passages = [];
      const modes = mots.length > 1 ? ['et', 'ou'] : ['ou'];
      for (const mode of modes) {
        /** @type {Array<string | number>} */
        const params = [requeteFts(mots, /** @type {'et' | 'ou'} */ (mode))];
        if (rubrique) params.push(rubrique);
        if (!/^d:/.test(rubrique)) params.push(...exclues);
        params.push(max * 3);
        let lignes = [];
        try { lignes = db.prepare(sql).all(...params); } catch (_) { lignes = []; }
        for (const l of lignes) {
          if (vus.has(l.rowid) || passages.length >= max) continue;
          vus.add(l.rowid);
          passages.push({ doc: Number(l.doc), rubrique: l.rubrique, page: Number(l.page) || 0, extrait: extraitAutour(l.texte, mots) });
        }
        if (passages.length >= max) break;
      }
      return { mots, passages };
    }
  };
}

// ---- Parcours du NAS et lecture des Word / textes ----------------------------------------------------------------------------

/** Les fichiers lus d'un dossier (sous-dossiers compris, 6 niveaux) : { chemin relatif, nom, ext, taille, modifieMs }. @param {string} racine @param {any} [fsImpl] */
async function listerFichiersMemoire(racine, fsImpl = fsp) {
  /** @type {Array<{ chemin: string, nom: string, ext: string, taille: number, modifieMs: number }>} */
  const fichiers = [];
  // Faux dès qu'un dossier n'a pas répondu ou que le plafond est atteint : le listage est alors incomplet (jamais de retrait d'après lui).
  let complet = true;
  const file = [{ chemin: racine, profondeur: 0 }];
  while (file.length && fichiers.length < MAX_FICHIERS_PAR_RUBRIQUE) {
    const courant = /** @type {{ chemin: string, profondeur: number }} */ (file.shift());
    let entrees;
    try { entrees = await fsImpl.readdir(courant.chemin, { withFileTypes: true }); } catch (_) { complet = false; continue; }
    for (const e of entrees) {
      const absolu = path.join(courant.chemin, e.name);
      if (e.isDirectory()) { if (courant.profondeur < PROFONDEUR_MAX && !/^[.#@$~]/.test(e.name)) file.push({ chemin: absolu, profondeur: courant.profondeur + 1 }); continue; }
      const ext = extensionLue(e.name);
      // Fichiers temporaires de Word (« ~$… ») et fichiers cachés : jamais lus.
      if (!ext || /^[.~]/.test(e.name) || fichiers.length >= MAX_FICHIERS_PAR_RUBRIQUE) continue;
      let st = null;
      try { st = await fsImpl.stat(absolu); } catch (_) { complet = false; continue; }
      fichiers.push({ chemin: path.relative(racine, absolu).split(path.sep).join('/'), nom: e.name, ext, taille: st.size, modifieMs: Math.round(st.mtimeMs) });
    }
  }
  if (file.length) complet = false;
  return { fichiers, complet };
}

/** Le fichier d'un document de la mémoire, confiné à son dossier (liens symboliques résolus). null si hors du dossier. @param {string} racine @param {string} relatif @param {any} [fsImpl] */
async function cheminDocumentMemoire(racine, relatif, fsImpl = fsp) {
  if (!racine || !relatif || String(relatif).includes('\0')) return null;
  const base = path.resolve(racine);
  const cible = path.resolve(base, relatif);
  if (cible !== base && !cible.startsWith(base + path.sep)) return null;
  try {
    const reel = await fsImpl.realpath(cible);
    const baseReelle = await fsImpl.realpath(base);
    return reel === baseReelle || reel.startsWith(baseReelle + path.sep) ? reel : null;
  } catch (_) { return null; }
}

/**
 * Un tour : parcourt les dossiers, inscrit les fichiers, retire les absents, lit les Word et textes. Les PDF restent « à lire » pour le poste.
 * @param {{ config: any, memoire: ReturnType<typeof creerMemoire>, fsImpl?: any, etat: any, ignorer?: string[] }} o
 */
async function parcourirMemoire(o) {
  const fsImpl = o.fsImpl || fsp;
  const etat = o.etat;
  Object.assign(etat, { enCours: true, debut: Date.now(), fin: 0, dossiers: [], vus: 0, nouveaux: 0, changes: 0, retires: 0, luServeur: 0, erreurs: 0, erreur: '' });
  try {
    // Règles et décisions de l'étude : embarquées dans le serveur, indexées même sans NAS.
    try { etat.regles = await indexerRegles({ memoire: o.memoire, config: o.config }); } catch (e) { console.error('[memoire] règles :', e && e.message ? e.message : e); }
    const dossiers = await trouverDossiersMemoire(o.config, fsImpl);
    etat.dossiers = dossiers.map((d) => ({ cle: d.cle, libelle: d.libelle }));
    for (const d of dossiers) {
      if ((o.ignorer || []).includes(d.cle)) continue; // rubrique en option, éteinte
      const { fichiers, complet } = await listerFichiersMemoire(d.chemin, fsImpl);
      for (const f of fichiers) {
        const r = o.memoire.voirFichier(d.cle, f.chemin, f.nom, f.ext, f.taille, f.modifieMs);
        etat.vus++;
        if (r === 'nouveau') etat.nouveaux++; else if (r === 'change') etat.changes++;
      }
      // Seulement si tout le dossier a répondu : un NAS qui ne répond pas, même en partie, ne vide pas la mémoire.
      if (complet && (fichiers.length || (await fsImpl.readdir(d.chemin).catch(() => null)))) etat.retires += o.memoire.retirerAbsents(d.cle, fichiers.map((f) => f.chemin));
    }
    // Word et texte : lus ici, un à un.
    const racines = Object.fromEntries(dossiers.map((d) => [d.cle, d.chemin]));
    o.memoire.retenterErreursServeur();
    const tentes = new Set();
    for (let doc = o.memoire.aLire('serveur', 50).find((x) => !tentes.has(x.id)); doc; doc = o.memoire.aLire('serveur', 50).find((x) => !tentes.has(x.id))) {
      tentes.add(doc.id);
      const racine = racines[doc.rubrique];
      // Dossier ou fichier introuvable à ce tour (NAS indisponible) : le document reste « à lire », retenté au prochain parcours.
      const cible = racine ? await cheminDocumentMemoire(racine, doc.chemin, fsImpl) : null;
      if (!cible) continue;
      try {
        const buf = await fsImpl.readFile(cible);
        const texte = doc.ext === 'docx' ? await texteDocx(buf) : buf.toString('utf8');
        o.memoire.enregistrerTexte(doc.id, [{ n: 0, texte }]);
        etat.luServeur++;
      } catch (e) {
        o.memoire.marquerErreur(doc.id, e && e.message ? e.message : 'illisible');
        etat.erreurs++;
      }
    }
  } catch (e) {
    etat.erreur = e && e.message ? String(e.message).slice(0, 160) : 'erreur';
    console.error('[memoire]', etat.erreur);
  } finally {
    etat.enCours = false;
    etat.fin = Date.now();
  }
  return etat;
}

/** Pure : retire d'un extrait ce que le masquage des fiches ne reconnaît pas — naissances, adresses postales, codes postaux (audit 15/10 :
 * FAUSSES MINUTES contient des actes de clients). @param {string} texte */
function expurgerExtrait(texte) {
  return String(texte || '')
    .replace(/\b(n[ée]e?)\s+(?:à\s+[^,;()]{1,40}?\s+)?le\s+(?:\d{1,2}(?:er)?\s+\p{L}+\s+\d{4}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})/giu, '$1 [date de naissance]')
    .replace(/\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|av\.|boulevard|bd|chemin|impasse|place|all[ée]e|route|quai|cours|square|lieu[- ]?dit|résidence|residence)\s+[^,;.()]{1,60}/giu, '[adresse]')
    .replace(/\b\d{5}\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{2,}(?:[ -][A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+)*/g, '[code postal et commune]');
}

module.exports = {
  SOURCES_REGLES, sectionsMarkdown, empreinteTexte, indexerRegles, titreSectionRegles, texteSourceRegles,
  expurgerExtrait, RUBRIQUES_MEMOIRE, normaliserNom, rubriqueDuNom, extensionLue, trouverDossiersMemoire, entreesZip, contenuZip, texteDocumentXml, texteDocx,
  decouperTexte, passagesDesPages, motsDeRecherche, requeteFts, extraitAutour, creerMemoire, listerFichiersMemoire, cheminDocumentMemoire, parcourirMemoire
};
