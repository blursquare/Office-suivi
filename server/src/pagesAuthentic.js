// @ts-check
'use strict';
// Pages d'Authentic gardées par dossier (étude 16/10 : « la connexion entre Authentic et CLAIRE est bancale, il manque souvent des
// données » ; choix : « pages gardées par dossier sur le serveur et « Relire depuis Authentic » »). Avant, une page relevée ne vivait que
// 24 h dans la mémoire du serveur (et disparaissait à son redémarrage) : une donnée manquée — fenêtre fermée, dossier pas encore créé,
// règle de lecture corrigée depuis — ne se rattrapait qu'en retournant dans Authentic. Désormais, dès que le poste a rangé une page dans un
// dossier (`applique`, `sans-changement`, `rattache`), le serveur la garde dans la base du bureau, rattachée à ce dossier : la DERNIÈRE
// version de chaque page (la page du dossier, chaque fiche client, chaque fiche bien), 40 pages par dossier au plus. La fiche peut alors
// tout relire (« Relire depuis Authentic ») avec les règles du jour, et dire ce qui a été reçu et quand (« Reçu d'Authentic »).
// Rien ne quitte le bureau ; rien n'est journalisé (les pages nomment des clients).

const crypto = require('node:crypto');
const AT = require('../../commun/authentic-modele');

const MAX_PAGES_PAR_DOSSIER = 40;
// Une page gardée au plus (relecture du 17/10 : la base et sa sauvegarde quotidienne grossissaient sans limite).
const MAX_OCTETS_PAGE = 1500000;
// Pages d'un dossier archivé depuis plus d'un an : retirées au démarrage.
const DUREE_ARCHIVE_MS = 365 * 24 * 3600 * 1000;
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS authentic_pages (
    dossier_id TEXT NOT NULL,
    cle TEXT NOT NULL,
    nature TEXT NOT NULL,
    intitule TEXT NOT NULL DEFAULT '',
    recue_le TEXT NOT NULL,
    capture TEXT NOT NULL,
    PRIMARY KEY (dossier_id, cle)
  );
`;

/** @param {any} v @param {number} max */
const chaine = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Pure : ce qui identifie une page DANS un dossier — la page du dossier une seule fois, une fiche client par personne (nom et prénom de la
 * fiche), une fiche bien par bien (adresse, sinon première parcelle). Une page revue remplace sa version précédente.
 * @param {string} nature 'dossier' | 'client' | 'bien' | … @param {any} capture
 */
function clePageAuthentic(nature, capture) {
  const champs = Array.isArray(capture && capture.champs) ? capture.champs : [];
  const val = (/** @type {RegExp} */ re) => chaine((champs.find((c) => c && re.test(String(c.libelle || ''))) || {}).valeur, 120).toLowerCase();
  if (nature === 'client') {
    // Le volet du conjoint (champs « conjointComponent », lus AVANT ceux de la personne) n'identifie pas la fiche.
    const propres = champs.filter((c) => c && !/conjoint/i.test(String(c.libelle || '') + ' ' + String(c.id || c.nom || '')));
    const val = (/** @type {RegExp} */ re) => chaine((propres.find((c) => re.test(String(c.libelle || ''))) || {}).valeur, 120).toLowerCase();
    const nom = val(/(?:^|[:\s])nom(?:\s|$|naissance|Famille)/i) || val(/nom/i);
    const prenom = val(/pr[ée]nom/i);
    const ident = [prenom, nom].filter(Boolean).join(' ');
    if (ident) return 'client:' + ident;
  }
  if (nature === 'bien') {
    const adresse = chaine(capture && capture.adresse, 200).toLowerCase() || val(/adresse|voie/i);
    if (adresse) return 'bien:' + adresse;
  }
  if (nature === 'dossier') return 'dossier';
  // À défaut : l'empreinte des champs (deux pages identiques ne comptent qu'une fois).
  return nature + ':' + crypto.createHash('sha1').update(JSON.stringify([champs.slice(0, 20)])).digest('hex').slice(0, 16);
}

/**
 * Pure : la page est-elle celle d'une promesse ou d'un avenant (le sous-dossier dont l'en-tête précède « Importer avec 6e SENS ») ? Jamais
 * gardée : elle remplacerait la page de la VENTE, même si le poste n'a pas su le dire (relecture du 17/10).
 * @param {any} capture
 */
function pageHorsVenteAuthentic(capture) {
  // Même lecture que le poste (sousDossierAuthentic) : titres des onglets inactifs retirés, en-tête « N - … » suivi de Importer, Comparants
  // ou Immeubles, retours à la ligne compris (relecture du 17/10).
  const c = capture || {};
  const net = (/** @type {any} */ x) => String(x || '').replace(/\s+/g, ' ').trim();
  const inactifs = new Set((Array.isArray(c.onglets) ? c.onglets : []).filter((/** @type {any} */ o) => o && !o.actif).map((/** @type {any} */ o) => net(o.titre)).filter(Boolean));
  const t = String(c.texte || '').slice(0, 20000).split('\n').filter((l) => !inactifs.has(net(l))).join('\n');
  const m = /(?:^|[^\w])(\d{1,6})\s*-\s*([A-Za-zÀ-ÿ][^\n]{0,150}?\S)(?=\s*(?:Importer|Comparants|Immeubles)(?![A-Za-zÀ-ÿ]))/i.exec(t);
  return !!m && /^(?:promesse|compromis|avenant|avant[\s-]*contrat|pv|puv)(?![a-zà-ÿ])/i.test(m[2].trim());
}

/** Le magasin des pages, sur la base du serveur. @param {any} db base node:sqlite @param {{ maintenant?: () => number }} [options] */
function creerPagesAuthentic(db, options = {}) {
  db.exec(SCHEMA);
  const maintenant = options.maintenant || Date.now;
  // Dossier supprimé, inconnu ou archivé depuis plus d'un an : ses pages ne servent plus.
  // Un dossier supprimé garde ses pages 30 jours (il peut être restauré).
  db.prepare(`DELETE FROM authentic_pages WHERE dossier_id NOT IN (SELECT id FROM dossiers)
    OR dossier_id IN (SELECT id FROM dossiers WHERE deleted_at IS NOT NULL AND deleted_at < ?)
    OR dossier_id IN (SELECT id FROM dossiers WHERE archive = 1 AND updated_at < ?)`).run(maintenant() - 30 * 24 * 3600 * 1000, maintenant() - DUREE_ARCHIVE_MS);
  const existe = db.prepare('SELECT 1 AS ok FROM dossiers WHERE id = ? AND deleted_at IS NULL');
  const ecrire = db.prepare(`INSERT INTO authentic_pages (dossier_id, cle, nature, intitule, recue_le, capture) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(dossier_id, cle) DO UPDATE SET nature = excluded.nature, intitule = excluded.intitule, recue_le = excluded.recue_le, capture = excluded.capture`);
  const lister = db.prepare('SELECT cle, nature, intitule, recue_le FROM authentic_pages WHERE dossier_id = ? ORDER BY recue_le DESC');
  const lire = db.prepare('SELECT cle, nature, intitule, recue_le, capture FROM authentic_pages WHERE dossier_id = ? ORDER BY recue_le ASC');
  const compter = db.prepare('SELECT cle FROM authentic_pages WHERE dossier_id = ? ORDER BY recue_le DESC');
  const retirer = db.prepare('DELETE FROM authentic_pages WHERE dossier_id = ? AND cle = ?');
  const retirerDossier = db.prepare('DELETE FROM authentic_pages WHERE dossier_id = ?');
  // La page du dossier (clé « dossier ») des dossiers en cours seulement (audit 0.377.0).
  const pagesDossierTous = db.prepare("SELECT dossier_id, recue_le, capture FROM authentic_pages WHERE cle = 'dossier' AND dossier_id IN (SELECT id FROM dossiers WHERE archive = 0 AND deleted_at IS NULL)");
  return {
    /** Garde la page pour ce dossier (la plus récente de chaque clé ; les plus anciennes au-delà de 40 sont retirées). */
    garder(dossierId, releve) {
      const id = chaine(dossierId, 80);
      const capture = releve && releve.capture;
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !capture || typeof capture !== 'object') return false;
      const clePoste = chaine(releve.cle, 200);
      if (clePoste === 'ignorer' || pageHorsVenteAuthentic(capture) || !existe.get(id)) return false; // promesse, avenant… ; dossier inconnu
      const json = JSON.stringify(capture);
      if (json.length > MAX_OCTETS_PAGE) return false;
      const nature = chaine(releve.nature, 20) || 'dossier';
      // La clé donnée par le poste (qui lit la page : « client:léa exemple »), sinon celle tirée ici des champs.
      const cle = /^(dossier|client:|bien:)/.test(clePoste) ? clePoste : clePageAuthentic(nature, capture);
      // La vue « Pièces jointes » (GED, étape 5) remplace les tableaux de formalités : elle ne prend jamais la place de la page du dossier
      // (audit 0.381.0 : le panneau du sous-dossier se vidait), seule sa liste est gardée, sous « ged ».
      const vueGed = cle === 'dossier' && Array.isArray(capture.pieces) && capture.pieces.length > 0 && !AT.lignesFormalitesAT(capture).length;
      if (!vueGed) ecrire.run(id, cle, nature, chaine(releve.intitule, 200), chaine(releve.recueLe, 40) || new Date(maintenant()).toISOString(), json);
      // La liste des pièces jointes (GED, étape 5) : gardée à part, la dernière vue.
      if (Array.isArray(capture.pieces) && capture.pieces.length) {
        ecrire.run(id, 'ged', 'ged', '', chaine(releve.recueLe, 40) || new Date(maintenant()).toISOString(), JSON.stringify({ pieces: capture.pieces.slice(0, 300), ...(capture.groupesFermes ? { groupesFermes: capture.groupesFermes } : {}) }));
      }
      // L'aperçu d'une formalité ouvert sur la page (étape 4 du plan Authen.TIC) : gardé à part, une ligne par formalité, pour survivre aux
      // pages suivantes du dossier relevées sans tiroir ouvert.
      const ap = capture.apercu;
      if (ap && typeof ap === 'object' && String(ap.texte || '').trim()) {
        const cleAp = 'apercu:' + crypto.createHash('sha1').update(chaine(ap.titre, 200) || String(ap.texte).slice(0, 200)).digest('hex').slice(0, 16);
        ecrire.run(id, cleAp, 'apercu', chaine(ap.titre, 200), chaine(releve.recueLe, 40) || new Date(maintenant()).toISOString(), JSON.stringify({ apercu: { titre: chaine(ap.titre, 200), texte: String(ap.texte).slice(0, 8000) } }));
      }
      const cles = compter.all(id).map((/** @type {any} */ l) => l.cle);
      for (const c of cles.slice(MAX_PAGES_PAR_DOSSIER)) retirer.run(id, c);
      return true;
    },
    /** Ce qui a été reçu pour ce dossier (sans le contenu des pages) : [{ cle, nature, intitule, recueLe }], la plus récente d'abord. */
    resume(dossierId) {
      return lister.all(chaine(dossierId, 80)).map((/** @type {any} */ l) => ({ cle: l.cle, nature: l.nature, intitule: l.intitule, recueLe: l.recue_le }));
    },
    /** Les pages entières, de la plus ancienne à la plus récente (l'ordre où elles se relisent). */
    pages(dossierId) {
      return lire.all(chaine(dossierId, 80)).map((/** @type {any} */ l) => {
        let capture = null;
        try { capture = JSON.parse(l.capture); } catch (_) { capture = null; }
        return capture ? { cle: l.cle, nature: l.nature, intitule: l.intitule, recueLe: l.recue_le, capture } : null;
      }).filter(Boolean);
    },
    oublier(dossierId) { retirerDossier.run(chaine(dossierId, 80)); },
    /** La page du dossier de chaque dossier (une par dossier) : [{ dossierId, recueLe, capture }] — pour les statuts du Suivi. */
    pagesDossierDeTous() {
      return pagesDossierTous.all().map((/** @type {any} */ l) => {
        let capture = null;
        try { capture = JSON.parse(l.capture); } catch (_) { capture = null; }
        return capture ? { dossierId: l.dossier_id, recueLe: l.recue_le, capture } : null;
      }).filter(Boolean);
    }
  };
}

module.exports = { creerPagesAuthentic, clePageAuthentic, pageHorsVenteAuthentic, MAX_PAGES_PAR_DOSSIER, MAX_OCTETS_PAGE };
