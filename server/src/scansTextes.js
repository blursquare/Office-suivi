'use strict';

// Texte des scans RANGÉS, cherchable (étude 20/10 : « un RAG des fichiers déjà scannés, renommés et rangés ») — SQLite FTS5, mots sans
// accent ni majuscule, sans IA ni jeton ; le texte reste en base sur le serveur du bureau (comme la mémoire de CLAIRE) et n'est jamais
// renvoyé en entier : une recherche rend le nom de la copie, le dossier, la rubrique, la date et un court extrait.

const MAX_CARACTERES_SCAN = 60000;
const MAX_DOCUMENTS = 5000;
const EXTRAIT_MAX = 240;

/** Pure : les mots d'une recherche — sans accent ni majuscule, deux lettres ou plus, huit au plus. @param {string} requete */
function motsRecherche(requete) {
  const mots = [];
  for (const m of String(requete || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (m.length >= 2 && !mots.includes(m)) mots.push(m);
    if (mots.length >= 8) break;
  }
  return mots;
}

/** Pure : la requête FTS5 — tous les mots, chacun en préfixe ; '' s'il n'y a rien à chercher. @param {string[]} mots */
function requeteFts(mots) { return mots.length ? mots.map((m) => `"${m.replace(/"/g, '')}"*`).join(' AND ') : ''; }

/** Pure : l'extrait d'un texte autour du premier mot cherché. @param {string} texte @param {string[]} mots */
function extraitAutour(texte, mots) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim();
  if (t.length <= EXTRAIT_MAX) return t;
  const plat = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let pos = -1;
  for (const m of mots) { const i = plat.indexOf(m); if (i >= 0 && (pos < 0 || i < pos)) pos = i; }
  const debut = Math.max(0, (pos < 0 ? 0 : pos) - 80);
  return `${debut > 0 ? '… ' : ''}${t.slice(debut, debut + EXTRAIT_MAX).trim()}${debut + EXTRAIT_MAX < t.length ? ' …' : ''}`;
}

/** Les textes des scans rangés sur la base du serveur. @param {any} db base node:sqlite */
function creerScansTextes(db) {
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS scans_fts USING fts5(texte, id UNINDEXED, nom UNINDEXED, dossier_id UNINDEXED, dossier UNINDEXED, rubrique UNINDEXED, date UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');`);
  const ajouter = db.prepare('INSERT INTO scans_fts (texte, id, nom, dossier_id, dossier, rubrique, date) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const retirer = db.prepare('DELETE FROM scans_fts WHERE id = ?');
  const compter = db.prepare('SELECT COUNT(*) AS n FROM scans_fts');
  const plusAnciens = db.prepare('SELECT id FROM scans_fts ORDER BY date ASC LIMIT ?');
  const chercherStmt = db.prepare('SELECT id, nom, dossier_id, dossier, rubrique, date, texte FROM scans_fts WHERE scans_fts MATCH ? ORDER BY date DESC LIMIT ?');
  const toutVider = db.prepare('DELETE FROM scans_fts');
  return {
    /** @param {{ id: string, nom: string, dossierId?: string, dossier?: string, rubrique?: string, date: string, texte?: string }} e */
    indexer(e) {
      if (!e || !e.id || !e.nom) return false;
      retirer.run(e.id);
      const texte = [e.nom, e.dossier || '', String(e.texte || '').slice(0, MAX_CARACTERES_SCAN)].join('\n');
      ajouter.run(texte, e.id, String(e.nom).slice(0, 255), String(e.dossierId || '').slice(0, 80), String(e.dossier || '').slice(0, 200), String(e.rubrique || '').slice(0, 200), String(e.date || '').slice(0, 40));
      const n = Number(/** @type {any} */ (compter.get()).n) || 0;
      if (n > MAX_DOCUMENTS) /** @type {any[]} */ (plusAnciens.all(n - MAX_DOCUMENTS)).forEach((r) => retirer.run(r.id));
      return true;
    },
    /** @param {string} id */
    retirer(id) { retirer.run(String(id)); },
    nombre() { return Number(/** @type {any} */ (compter.get()).n) || 0; },
    /** @param {string} requete @param {number} [limite] */
    chercher(requete, limite) {
      const mots = motsRecherche(requete);
      const q = requeteFts(mots);
      if (!q) return [];
      return /** @type {any[]} */ (chercherStmt.all(q, Math.min(50, Math.max(1, limite || 20)))).map((r) => ({
        id: r.id, nom: r.nom, dossierId: r.dossier_id, dossier: r.dossier, rubrique: r.rubrique, date: r.date, extrait: extraitAutour(String(r.texte || '').split('\n').slice(2).join(' '), mots)
      }));
    },
    vider() { toutVider.run(); }
  };
}

module.exports = { creerScansTextes, motsRecherche, requeteFts, extraitAutour, MAX_CARACTERES_SCAN };
