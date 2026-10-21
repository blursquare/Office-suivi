// @ts-check
'use strict';

// Lecture LIBRE du NAS par « Demander à CLAIRE » (étude 21/10, palier 2 : « qu'il puisse chercher et lire dans tout le NAS, comme
// Claude desktop sur un disque »). LECTURE SEULE, éteinte par défaut, réglée dans Réglages › IA et relecture d'actes :
//   - `actif` : interrupteur général ;
//   - `racines` : dossiers (chemins relatifs à la racine du NAS) où l'agent peut aller — vide = toute la racine ;
//   - `exclus` : mots qui écartent un dossier ou un fichier dont le NOM les porte (« compta », « RH »…), à tout niveau.
// Même confinement que le reste du NAS (`resoudreCheminNas` : liens symboliques résolus avant contrôle) ; jamais un dossier caché,
// un exécutable, ni une écriture. Le texte rendu à l'agent est masqué par le serveur comme tout résultat d'outil.

const fsp = require('node:fs/promises');
const path = require('node:path');
const { resoudreCheminNas } = require('./nas');
const { texteDocx } = require('./memoire');

const CLE_NAS_LIBRE = 'agent-nas-libre';
const MAX_RACINES = 40;
const MAX_EXCLUS = 60;
const MAX_ENTREES_PARCOURUES = 30000;
const DUREE_RECHERCHE_MS = 4000;
const MAX_RESULTATS = 40;
const MAX_CARACTERES_TEXTE = 40000;
const TAILLE_MAX_DOCX = 25 * 1024 * 1024;
const TAILLE_MAX_TEXTE = 3 * 1024 * 1024;
const RE_CACHE = /^(\.|~\$|thumbs\.db$|desktop\.ini$|__macosx$)/i;
const RE_EXECUTABLE = /\.(exe|bat|cmd|com|msi|ps1|psm1|vbs|vbe|js|jse|wsf|lnk|scr|hta|jar|reg|dll)$/i;
const EXTENSIONS_TEXTE = new Set(['.txt', '.csv', '.md', '.json', '.xml', '.html', '.htm', '.rtf']);

/** Pure : un nom sans accents ni casse, séparateurs réduits. @param {unknown} s */
function simplifier(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\\/_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Pure : un chemin relatif propre (« a/b »), ou null s'il sort de la racine ou passe par un dossier caché. @param {unknown} brut */
function cheminRelatifPropre(brut) {
  const rel = String(brut == null ? '' : brut).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const segments = rel.split('/').map((x) => x.trim()).filter((x) => x !== '' && x !== '.');
  if (segments.some((s) => s === '..' || RE_CACHE.test(s))) return null;
  return segments.join('/');
}

/** Pure : les réglages assainis. @param {any} brut @returns {{ actif: boolean, racines: string[], exclus: string[] }} */
function assainirNasLibre(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const racines = [...new Set((Array.isArray(b.racines) ? b.racines : []).map(cheminRelatifPropre).filter((r) => typeof r === 'string' && r !== ''))].slice(0, MAX_RACINES);
  const exclus = [...new Set((Array.isArray(b.exclus) ? b.exclus : []).map((x) => simplifier(x).slice(0, 60)).filter((x) => x.length >= 2))].slice(0, MAX_EXCLUS);
  return { actif: b.actif === true, racines, exclus };
}

/** @param {{ lireJsonBrut: Function }} repo */
function lireNasLibre(repo) { return assainirNasLibre(repo.lireJsonBrut(CLE_NAS_LIBRE, null)); }

/** @param {{ ecrireJsonBrut: Function }} repo @param {any} valeur */
function ecrireNasLibre(repo, valeur) {
  const propre = assainirNasLibre(valeur);
  repo.ecrireJsonBrut(CLE_NAS_LIBRE, propre);
  return propre;
}

/** Pure : un chemin en segments simplifiés. @param {string} rel */
function segmentsSimples(rel) { return rel.split('/').filter(Boolean).map(simplifier); }

/** @param {string[]} chemin @param {string[]} prefixe */
function commencePar(chemin, prefixe) { return prefixe.length <= chemin.length && prefixe.every((x, i) => chemin[i] === x); }

/** Pure : un segment du chemin porte-t-il un mot écarté ? @param {string[]} segments @param {string[]} exclus */
function exclu(segments, exclus) { return segments.some((seg) => exclus.some((x) => seg.includes(x))); }

/** Pure : le chemin (déjà propre) est-il permis par les réglages ? '' = la racine, permise seulement sans `racines`.
 * @param {string} rel @param {{ racines: string[], exclus: string[] }} r */
function cheminPermis(rel, r) {
  if (rel === '') return r.racines.length === 0;
  const seg = segmentsSimples(rel);
  if (exclu(seg, r.exclus)) return false;
  if (!r.racines.length) return true;
  return r.racines.some((racine) => commencePar(seg, segmentsSimples(racine)));
}

/** Pure : un dossier est-il sur le chemin d'une racine permise (pour descendre jusqu'à elle) ? @param {string} rel @param {{ racines: string[], exclus: string[] }} r */
function surLeCheminDUneRacine(rel, r) {
  if (!r.racines.length) return true;
  const seg = segmentsSimples(rel);
  return r.racines.some((racine) => commencePar(segmentsSimples(racine), seg));
}

/** @param {string} nom */
function extensionDe(nom) { return path.extname(nom).toLowerCase(); }

/** Un niveau du NAS : sous-dossiers et fichiers permis. @param {string} nasRacine @param {string} rel @param {{ racines: string[], exclus: string[] }} r */
async function listerNasLibre(nasRacine, rel, r) {
  const propre = cheminRelatifPropre(rel);
  if (propre === null) return { erreur: 'Chemin refusé.', statut: 400 };
  const abs = await resoudreCheminNas(nasRacine, propre);
  if (!abs) return { erreur: 'Dossier introuvable sur le NAS.', statut: 404 };
  if (!cheminPermis(propre, r) && !surLeCheminDUneRacine(propre, r)) return { erreur: 'Ce dossier n’est pas ouvert à CLAIRE (Réglages › IA).', statut: 403 };
  let entrees;
  try { entrees = await fsp.readdir(abs, { withFileTypes: true }); } catch (_) { return { erreur: 'Dossier illisible.', statut: 404 }; }
  const dossiers = [];
  const fichiers = [];
  for (const e of entrees) {
    if (RE_CACHE.test(e.name)) continue;
    const enfant = propre ? propre + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (cheminPermis(enfant, r) || (surLeCheminDUneRacine(enfant, r) && !exclu(segmentsSimples(enfant), r.exclus))) dossiers.push({ nom: e.name, chemin: enfant });
    } else if (e.isFile() && cheminPermis(enfant, r) && !RE_EXECUTABLE.test(e.name)) {
      let st = null;
      try { st = await fsp.stat(path.join(abs, e.name)); } catch (_) { /* verrouillé : sans détail */ }
      fichiers.push({ nom: e.name, chemin: enfant, taille: st ? st.size : null, modifieLe: st ? st.mtime.toISOString() : null });
    }
  }
  const tri = (a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true });
  dossiers.sort(tri); fichiers.sort(tri);
  return { chemin: propre, dossiers: dossiers.slice(0, 300), fichiers: fichiers.slice(0, 300), coupe: dossiers.length > 300 || fichiers.length > 300 };
}

/** Recherche par NOM (chemin compris) dans la zone permise : tous les mots doivent y figurer. @param {string} nasRacine @param {string} texte @param {string} depuis
 * @param {{ racines: string[], exclus: string[] }} r @param {{ maintenant?: () => number }} [options] */
async function chercherNasLibre(nasRacine, texte, depuis, r, options = {}) {
  const mots = simplifier(texte).split(' ').filter((m) => m.length >= 2).slice(0, 8);
  if (!mots.length) return { erreur: 'texte : au moins un mot de deux lettres.', statut: 400 };
  const maintenant = options.maintenant || Date.now;
  const debut = maintenant();
  const depart = cheminRelatifPropre(depuis);
  if (depart === null) return { erreur: 'Chemin refusé.', statut: 400 };
  /** @type {{ chemin: string, type: string, taille: number | null, modifieLe: string | null }[]} */
  const trouves = [];
  const file = [depart];
  let vus = 0;
  let incomplet = false;
  while (file.length) {
    if (vus >= MAX_ENTREES_PARCOURUES || maintenant() - debut > DUREE_RECHERCHE_MS) { incomplet = true; break; }
    const rel = /** @type {string} */ (file.shift());
    const abs = await resoudreCheminNas(nasRacine, rel);
    if (!abs) continue;
    let entrees;
    try { entrees = await fsp.readdir(abs, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entrees) {
      if (RE_CACHE.test(e.name)) continue;
      vus++;
      const enfant = rel ? rel + '/' + e.name : e.name;
      if (exclu(segmentsSimples(enfant), r.exclus)) continue;
      const simple = simplifier(enfant);
      if (e.isDirectory()) {
        if (cheminPermis(enfant, r) || surLeCheminDUneRacine(enfant, r)) file.push(enfant);
        if (cheminPermis(enfant, r) && mots.every((m) => simple.includes(m))) trouves.push({ chemin: enfant, type: 'dossier', taille: null, modifieLe: null });
      } else if (e.isFile() && cheminPermis(enfant, r) && !RE_EXECUTABLE.test(e.name) && mots.every((m) => simple.includes(m))) {
        let st = null;
        try { st = await fsp.stat(path.join(abs, e.name)); } catch (_) { /* sans détail */ }
        trouves.push({ chemin: enfant, type: 'fichier', taille: st ? st.size : null, modifieLe: st ? st.mtime.toISOString() : null });
      }
      if (trouves.length >= MAX_RESULTATS) { incomplet = true; file.length = 0; break; }
    }
  }
  return { resultats: trouves, incomplet, parcourus: vus };
}

/** Le texte d'un fichier Word ou texte (les PDF sont lus par le poste). @param {string} nasRacine @param {string} rel @param {number} debut
 * @param {{ racines: string[], exclus: string[] }} r */
async function lireTexteNasLibre(nasRacine, rel, debut, r) {
  const propre = cheminRelatifPropre(rel);
  if (propre === null || propre === '') return { erreur: 'Chemin refusé.', statut: 400 };
  if (!cheminPermis(propre, r)) return { erreur: 'Ce fichier n’est pas ouvert à CLAIRE (Réglages › IA).', statut: 403 };
  const nom = propre.split('/').pop() || '';
  if (RE_EXECUTABLE.test(nom)) return { erreur: 'Fichier exécutable : jamais lu.', statut: 400 };
  const ext = extensionDe(nom);
  if (ext !== '.docx' && !EXTENSIONS_TEXTE.has(ext)) return { erreur: 'Seuls les fichiers Word (.docx), texte et CSV se lisent ici ; un PDF se lit avec lire_document.', statut: 415 };
  const abs = await resoudreCheminNas(nasRacine, propre);
  if (!abs) return { erreur: 'Fichier introuvable sur le NAS.', statut: 404 };
  let st;
  try { st = await fsp.stat(abs); } catch (_) { return { erreur: 'Fichier introuvable sur le NAS.', statut: 404 }; }
  if (!st.isFile()) return { erreur: 'Ce n’est pas un fichier.', statut: 400 };
  if (st.size > (ext === '.docx' ? TAILLE_MAX_DOCX : TAILLE_MAX_TEXTE)) return { erreur: 'Fichier trop gros pour être lu ici.', statut: 413 };
  let texte;
  try {
    const buf = await fsp.readFile(abs);
    texte = ext === '.docx' ? await texteDocx(buf) : buf.toString('utf8');
  } catch (_) { return { erreur: 'Fichier illisible.', statut: 422 }; }
  if (ext === '.html' || ext === '.htm') texte = texte.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ');
  const depart = Math.max(0, Math.min(texte.length, parseInt(String(debut), 10) || 0));
  const morceau = texte.slice(depart, depart + MAX_CARACTERES_TEXTE);
  const fin = depart + morceau.length;
  return { texte: morceau, caracteres_total: texte.length, debut: depart, ...(fin < texte.length ? { suite: fin } : {}) };
}

module.exports = { CLE_NAS_LIBRE, simplifier, cheminRelatifPropre, assainirNasLibre, lireNasLibre, ecrireNasLibre, cheminPermis, surLeCheminDUneRacine,
  listerNasLibre, chercherNasLibre, lireTexteNasLibre, MAX_CARACTERES_TEXTE };
