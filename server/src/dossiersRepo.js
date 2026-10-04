// Couche d'accès aux dossiers en base — séparée des routes Express pour rester testable sans
// monter un serveur HTTP, et réutilisable par le job de relances (jobs/rappels.js), la lecture de
// l'agenda (agendaWatch.js) et l'import (M3) sans dupliquer les requêtes SQL.
'use strict';

const VERSIONS_GARDEES = 10;
const VERSIONS_DUREE_MS = 3 * 24 * 3600 * 1000; // la base d'un poste n'est jamais plus vieille que sa fenêtre ouverte
// `updated_at` sert de version (polling `since`, base de fusion) : deux écritures dans la même milliseconde
// doivent rester distinctes — horodatage strictement croissant dans le processus (audit 04/10).
let dernierHorodatage = 0;
function maintenantMonotone() {
  const t = Math.max(Date.now(), dernierHorodatage + 1);
  dernierHorodatage = t;
  return t;
}
const { fusionnerTroisVoies } = require('./fusionDossiers');

function creerDepot(db) {
  const insererStmt = db.prepare(`
    INSERT INTO dossiers (id, data, responsable, archive, pret, acte, ventebien, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `);
  const remplacerStmt = db.prepare(`
    UPDATE dossiers SET data=?, responsable=?, archive=?, pret=?, acte=?, ventebien=?, updated_at=?
    WHERE id=? AND deleted_at IS NULL
  `);
  const supprimerStmt = db.prepare('UPDATE dossiers SET deleted_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL');
  const restaurerStmt = db.prepare('UPDATE dossiers SET deleted_at=NULL, updated_at=? WHERE id=? AND deleted_at IS NOT NULL');
  const parIdStmt = db.prepare('SELECT * FROM dossiers WHERE id=?');
  const depuisStmt = db.prepare('SELECT * FROM dossiers WHERE updated_at > ? ORDER BY updated_at ASC');
  const tousActifsStmt = db.prepare('SELECT * FROM dossiers WHERE deleted_at IS NULL ORDER BY updated_at ASC');
  const tousStmt = db.prepare('SELECT * FROM dossiers ORDER BY updated_at ASC');
  const versionInsererStmt = db.prepare('INSERT OR REPLACE INTO dossiers_versions (id, updated_at, data) VALUES (?, ?, ?)');
  const versionLireStmt = db.prepare('SELECT data FROM dossiers_versions WHERE id=? AND updated_at=?');
  const versionElaguerStmt = db.prepare(`DELETE FROM dossiers_versions WHERE id=? AND (updated_at < ? OR updated_at NOT IN
    (SELECT updated_at FROM dossiers_versions WHERE id=? ORDER BY updated_at DESC LIMIT ${VERSIONS_GARDEES}))`);

  // Colonnes promues hors du JSON `data` — uniquement ce dont le serveur a besoin pour filtrer/
  // trier sans reparser tout le JSON à chaque requête (voir le plan, section "Base de données").
  function colonnesPromues(d) {
    return {
      responsable: d.responsable || null,
      archive: d.archive ? 1 : 0,
      pret: d.pret || null,
      acte: d.acte || null,
      ventebien: d.ventebien || null
    };
  }

  // Une ligne supprimée (deleted_at renseigné) devient un tombstone minimal côté API : les
  // clients en polling doivent savoir qu'un id a disparu sans avoir besoin du JSON complet.
  function ligneVersReponse(ligne) {
    if (ligne.deleted_at) return { id: ligne.id, deleted: true, updatedAt: ligne.updated_at };
    const d = lireBlob(ligne);
    return d ? { ...d, updatedAt: ligne.updated_at } : null;
  }

  // JSON d'une ligne ; null (et une trace) si illisible — un dossier abîmé est écarté, les autres restent servis.
  const lignesIllisiblesSignalees = new Set();
  function lireBlob(ligne) {
    try {
      const d = JSON.parse(ligne.data);
      return d && typeof d === 'object' ? d : null;
    } catch (e) {
      if (!lignesIllisiblesSignalees.has(ligne.id)) {
        lignesIllisiblesSignalees.add(ligne.id);
        console.error(`[dossiers] Dossier ${String(ligne.id).slice(0, 40)} illisible en base (JSON) : écarté des lectures.`);
      }
      return null;
    }
  }

  // Le blob JSON ne porte jamais `updatedAt` : c'est la colonne `updated_at` qui fait foi, jointe
  // à la lecture (ligneVersReponse). Un dossier relu puis réécrit tel quel (agendaWatch, nasWatch…)
  // la recopierait sinon dans le blob, où elle serait fausse dès la modification suivante.
  function blobDossier(d) {
    const { updatedAt, ...reste } = d;
    return JSON.stringify(reste);
  }

  function creer(d) {
    const c = colonnesPromues(d);
    const maintenant = maintenantMonotone();
    const blob = blobDossier(d);
    insererStmt.run(d.id, blob, c.responsable, c.archive, c.pret, c.acte, c.ventebien, maintenant);
    memoriserVersion(d.id, maintenant, blob);
    return maintenant;
  }

  // Instantané de la version écrite (jamais bloquant : une base déjà en place sans la table n'arrête pas l'écriture).
  function memoriserVersion(id, updatedAt, blob) {
    try {
      versionInsererStmt.run(id, updatedAt, blob);
      versionElaguerStmt.run(id, updatedAt - VERSIONS_DUREE_MS, id);
    } catch (e) { /* la fusion se passera de cette version */ }
  }

  function version(id, updatedAt) {
    const ligne = versionLireStmt.get(id, updatedAt);
    if (!ligne) return null;
    try { return JSON.parse(ligne.data); } catch (e) { return null; }
  }

  // Remplacement « à partir de la version vue » (audit 04/10) : `baseUpdatedAt` = updatedAt que le poste a reçu en
  // dernier pour ce dossier. Si le serveur n'a pas changé depuis, remplacement simple. Sinon, fusion à trois voies
  // avec la version de base ; base introuvable (trop ancienne) → la copie du poste l'emporte, comme avant.
  // → { updatedAt, dossier, fusionne, baseInconnue } ou null (dossier supprimé/inconnu).
  function remplacerDepuisBase(id, d, baseUpdatedAt) {
    const courant = parIdStmt.get(id);
    if (!courant || courant.deleted_at) return null;
    const base = Number(baseUpdatedAt);
    if (!Number.isFinite(base) || base <= 0 || courant.updated_at === base) {
      const updatedAt = remplacer(id, d);
      return updatedAt === null ? null : { updatedAt, dossier: d, fusionne: false, baseInconnue: false };
    }
    const dossierBase = version(id, base);
    let serveur;
    try { serveur = JSON.parse(courant.data); } catch (e) { serveur = null; }
    if (!dossierBase || !serveur) {
      const updatedAt = remplacer(id, d);
      return updatedAt === null ? null : { updatedAt, dossier: d, fusionne: false, baseInconnue: true };
    }
    const { dossier, fusionne } = fusionnerTroisVoies(dossierBase, serveur, d);
    dossier.id = id;
    const updatedAt = remplacer(id, dossier);
    return updatedAt === null ? null : { updatedAt, dossier, fusionne, baseInconnue: false };
  }

  // Remplacement complet du JSON (pas de PATCH partiel) : le client construit déjà l'objet
  // dossier complet en mémoire avant d'appeler sauvegarder(), donc un PUT plein correspond
  // exactement à ce qu'il a sous la main — pas de logique de fusion à écrire côté serveur.
  function remplacer(id, d) {
    const c = colonnesPromues(d);
    const maintenant = maintenantMonotone();
    const blob = blobDossier(d);
    const resultat = remplacerStmt.run(blob, c.responsable, c.archive, c.pret, c.acte, c.ventebien, maintenant, id);
    if (resultat.changes > 0) memoriserVersion(id, maintenant, blob);
    return resultat.changes > 0 ? maintenant : null;
  }

  // Suppression douce : `deleted_at` marque le dossier comme retiré sans effacer sa ligne,
  // backant le toast "Annuler" déjà existant côté client (restaurer()) sans race avec les
  // autres postes qui pollent pendant ce court laps de temps.
  function supprimer(id) {
    const maintenant = maintenantMonotone();
    return supprimerStmt.run(maintenant, maintenant, id).changes > 0;
  }

  function restaurer(id) {
    const maintenant = maintenantMonotone();
    return restaurerStmt.run(maintenant, id).changes > 0;
  }

  function trouverParId(id) {
    const ligne = parIdStmt.get(id);
    return ligne ? ligneVersReponse(ligne) : null;
  }

  function depuis(since) {
    return depuisStmt.all(since).map(ligneVersReponse).filter(Boolean);
  }

  // Dossiers actifs (non supprimés) avec leur objet JSON complet déjà parsé — utilisé par les
  // tâches de fond (relances, flux calendrier) qui doivent lire `pieces`/`offrePretStatut`/etc.
  // depuis le blob JSON, pas seulement les colonnes promues.
  // `updatedAt` est joint au dossier : la pose des dates butoir dans l'agenda s'en sert pour ne pas
  // doubler un poste qui vient de modifier le dossier (voir echeancesAgenda.js).
  function tousActifs() {
    return tousActifsStmt.all().map((ligne) => { const d = lireBlob(ligne); return d ? { ...d, updatedAt: ligne.updated_at } : null; }).filter(Boolean);
  }

  // Y compris les lignes supprimées — uniquement pour un diagnostic/export complet, pas utilisé
  // par le polling normal (voir depuis()).
  function tous() {
    return tousStmt.all().map(ligneVersReponse).filter(Boolean);
  }

  return { creer, remplacer, remplacerDepuisBase, version, supprimer, restaurer, trouverParId, depuis, tousActifs, tous };
}

module.exports = { creerDepot };
