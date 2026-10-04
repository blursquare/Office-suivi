// CRUD + polling `since` sur le registre des dossiers — voir le plan (section "Routes API").
// Toutes ces routes sont montées derrière le middleware d'authentification (voir app.js).
'use strict';

const express = require('express');

function dossierValide(d) {
  return d && typeof d === 'object' && typeof d.id === 'string' && d.id.length > 0 && d.id.length <= 120 && !Array.isArray(d);
}

// Heure de démarrage du serveur, renvoyée à chaque sondage : une fenêtre qui la voit changer sait que
// le serveur a redémarré (mise à jour automatique) et vérifie si sa page est encore la bonne version.
const DEMARRAGE_SERVEUR = Date.now();

function creerRouteurDossiers(depot) {
  const routeur = express.Router();

  // GET /api/dossiers?since=<ms> — tout si `since` absent/0 (premier chargement), sinon
  // uniquement ce qui a changé depuis ce curseur (voir dossiersRepo.depuis). `serverTime` est
  // renvoyé pour que le client mémorise le PROCHAIN curseur à envoyer — jamais une horloge
  // cliente, pour ne dépendre d'aucune synchronisation d'horloge entre postes.
  routeur.get('/dossiers', (req, res) => {
    // `updated_at` est toujours > 0 (epoch ms) : depuis(0) renvoie donc naturellement TOUTES les
    // lignes (dossiers actifs + tombstones) pour un premier chargement, sans branche séparée —
    // un tombstone pour un id que le client ne connaît pas encore est un no-op inoffensif.
    const since = parseInt(req.query.since, 10) || 0;
    // `serverTime` recule d'une milliseconde : une écriture faite dans la même milliseconde que ce sondage, juste après
    // la lecture, est ainsi reprise au sondage suivant (rejouer un dossier déjà vu est sans effet) — audit 04/10.
    res.json({ dossiers: depot.depuis(since), serverTime: Date.now() - 1, demarrage: DEMARRAGE_SERVEUR });
  });

  routeur.post('/dossiers', (req, res) => {
    const d = req.body;
    if (!dossierValide(d)) {
      res.status(400).json({ erreur: 'Dossier invalide : un champ "id" (texte non vide) est requis.' });
      return;
    }
    if (depot.trouverParId(d.id)) {
      res.status(409).json({ erreur: `Un dossier avec l'id "${d.id}" existe déjà.` });
      return;
    }
    const updatedAt = depot.creer(d);
    res.status(201).json({ ...d, updatedAt });
  });

  routeur.put('/dossiers/:id', (req, res) => {
    const d = req.body;
    if (!dossierValide(d) || d.id !== req.params.id) {
      res.status(400).json({ erreur: 'Dossier invalide : le corps doit avoir le même "id" que l\'URL.' });
      return;
    }
    // `X-Claire-Base` : updatedAt du dossier tel que le poste l'a vu en dernier (audit 04/10). Le serveur fusionne
    // alors ce PUT avec ce qui a changé depuis plutôt que de l'écraser (voir dossiersRepo.remplacerDepuisBase).
    const r = depot.remplacerDepuisBase(req.params.id, d, req.get('x-claire-base'));
    if (r === null) {
      res.status(404).json({ erreur: 'Dossier introuvable (ou déjà supprimé).' });
      return;
    }
    if (r.baseInconnue) console.warn('[dossiers] PUT sans version de base connue : copie du poste appliquée telle quelle.');
    res.json({ ...r.dossier, updatedAt: r.updatedAt, fusionne: r.fusionne });
  });

  routeur.delete('/dossiers/:id', (req, res) => {
    if (!depot.supprimer(req.params.id)) {
      res.status(404).json({ erreur: 'Dossier introuvable (ou déjà supprimé).' });
      return;
    }
    res.status(204).end();
  });

  routeur.post('/dossiers/:id/undelete', (req, res) => {
    if (!depot.restaurer(req.params.id)) {
      res.status(404).json({ erreur: "Dossier introuvable, ou pas dans un état supprimé." });
      return;
    }
    res.json(depot.trouverParId(req.params.id));
  });

  return routeur;
}

module.exports = { creerRouteurDossiers, dossierValide };
