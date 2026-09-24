'use strict';

// Corrections apprises à l'import d'un avant-contrat (voir parametresRepo, CLE_CORRECTIONS_APPRISES).
// Pas de PUT global : chaque poste envoie la seule correction qu'il vient de faire ou de renforcer,
// le serveur la fusionne par identifiant — deux collaborateurs qui corrigent en même temps ne
// s'écrasent pas l'un l'autre.

const express = require('express');
const { assainirCorrectionApprise } = require('../parametresRepo');

function creerRouteurCorrectionsApprises(parametresRepo) {
  const routeur = express.Router();

  routeur.get('/corrections-apprises', (req, res) => {
    res.json({ corrections: parametresRepo.lireCorrectionsApprises() });
  });

  routeur.post('/corrections-apprises', (req, res) => {
    const correction = assainirCorrectionApprise(req.body && req.body.correction);
    if (!correction) return res.status(400).json({ erreur: 'Correction invalide.' });
    const toutes = parametresRepo.lireCorrectionsApprises().filter((c) => c.id !== correction.id);
    toutes.push(correction);
    res.json({ corrections: parametresRepo.ecrireCorrectionsApprises(toutes) });
  });

  return routeur;
}

module.exports = { creerRouteurCorrectionsApprises };
