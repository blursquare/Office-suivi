// Couche d'accès aux dossiers en base — séparée des routes Express pour rester testable sans
// monter un serveur HTTP, et réutilisable par le job de relances (jobs/rappels.js), le flux
// calendrier (routes/calendrier.js) et l'import (M3) sans dupliquer les requêtes SQL.
'use strict';

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
    return { ...JSON.parse(ligne.data), updatedAt: ligne.updated_at };
  }

  function creer(d) {
    const c = colonnesPromues(d);
    const maintenant = Date.now();
    insererStmt.run(d.id, JSON.stringify(d), c.responsable, c.archive, c.pret, c.acte, c.ventebien, maintenant);
    return maintenant;
  }

  // Remplacement complet du JSON (pas de PATCH partiel) : le client construit déjà l'objet
  // dossier complet en mémoire avant d'appeler sauvegarder(), donc un PUT plein correspond
  // exactement à ce qu'il a sous la main — pas de logique de fusion à écrire côté serveur.
  function remplacer(id, d) {
    const c = colonnesPromues(d);
    const maintenant = Date.now();
    const resultat = remplacerStmt.run(JSON.stringify(d), c.responsable, c.archive, c.pret, c.acte, c.ventebien, maintenant, id);
    return resultat.changes > 0 ? maintenant : null;
  }

  // Suppression douce : `deleted_at` marque le dossier comme retiré sans effacer sa ligne,
  // backant le toast "Annuler" déjà existant côté client (restaurer()) sans race avec les
  // autres postes qui pollent pendant ce court laps de temps.
  function supprimer(id) {
    const maintenant = Date.now();
    return supprimerStmt.run(maintenant, maintenant, id).changes > 0;
  }

  function restaurer(id) {
    const maintenant = Date.now();
    return restaurerStmt.run(maintenant, id).changes > 0;
  }

  function trouverParId(id) {
    const ligne = parIdStmt.get(id);
    return ligne ? ligneVersReponse(ligne) : null;
  }

  function depuis(since) {
    return depuisStmt.all(since).map(ligneVersReponse);
  }

  // Dossiers actifs (non supprimés) avec leur objet JSON complet déjà parsé — utilisé par les
  // tâches de fond (relances, flux calendrier) qui doivent lire `pieces`/`offrePretStatut`/etc.
  // depuis le blob JSON, pas seulement les colonnes promues.
  function tousActifs() {
    return tousActifsStmt.all().map((ligne) => JSON.parse(ligne.data));
  }

  // Y compris les lignes supprimées — uniquement pour un diagnostic/export complet, pas utilisé
  // par le polling normal (voir depuis()).
  function tous() {
    return tousStmt.all().map(ligneVersReponse);
  }

  return { creer, remplacer, supprimer, restaurer, trouverParId, depuis, tousActifs, tous };
}

module.exports = { creerDepot };
