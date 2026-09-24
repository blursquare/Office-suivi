'use strict';

// Noms de fichiers écartés à la main pour une pièce de la checklist — voir parametresRepo
// (CLE_EXCLUSIONS_PIECES) pour le pourquoi du passage en base. Deux opérations suffisent :
// ajouter un nom (bouton « Réinitialiser » d'une pièce mal reconnue) et en retirer un (« Ne plus
// écarter », depuis le diagnostic du dossier ou les Réglages). Pas de PUT global : deux postes qui
// ajoutent chacun une exclusion au même moment ne doivent pas s'écraser l'un l'autre.

const express = require('express');

function lireCorps(req) {
  const corps = req.body || {};
  const cle = typeof corps.cle === 'string' ? corps.cle.trim() : '';
  const nom = typeof corps.nom === 'string' ? corps.nom.trim() : '';
  return /^[A-Za-z0-9_-]{1,80}$/.test(cle) && nom ? { cle, nom } : null;
}

function creerRouteurExclusionsPieces(parametresRepo) {
  const routeur = express.Router();

  routeur.get('/exclusions-pieces', (req, res) => {
    res.json({ exclusions: parametresRepo.lireExclusionsPieces() });
  });

  routeur.post('/exclusions-pieces', (req, res) => {
    const e = lireCorps(req);
    if (!e) return res.status(400).json({ erreur: 'Pièce ou nom de fichier manquant.' });
    const toutes = parametresRepo.lireExclusionsPieces();
    toutes[e.cle] = Array.from(new Set([...(toutes[e.cle] || []), e.nom]));
    res.json({ exclusions: parametresRepo.ecrireExclusionsPieces(toutes) });
  });

  routeur.post('/exclusions-pieces/retirer', (req, res) => {
    const e = lireCorps(req);
    if (!e) return res.status(400).json({ erreur: 'Pièce ou nom de fichier manquant.' });
    const toutes = parametresRepo.lireExclusionsPieces();
    toutes[e.cle] = (toutes[e.cle] || []).filter((n) => n !== e.nom);
    res.json({ exclusions: parametresRepo.ecrireExclusionsPieces(toutes) });
  });

  return routeur;
}

module.exports = { creerRouteurExclusionsPieces };
