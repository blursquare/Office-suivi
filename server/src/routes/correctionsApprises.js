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

  // « Ce que CLAIRE a appris » (étude, 02/10) : retirer une correction retenue à tort.
  routeur.delete('/corrections-apprises/:id', (req, res) => {
    const toutes = parametresRepo.lireCorrectionsApprises();
    const restantes = toutes.filter((c) => c.id !== req.params.id);
    if (restantes.length === toutes.length) return res.status(404).json({ erreur: 'Correction introuvable.' });
    res.json({ corrections: parametresRepo.ecrireCorrectionsApprises(restantes) });
  });

  // Journal des corrections faites à la main après la lecture d'un compromis, commun à tous les postes.
  routeur.get('/corrections-extraction', (req, res) => {
    res.json({ journal: parametresRepo.lireJournalCorrections() });
  });

  routeur.post('/corrections-extraction', (req, res) => {
    const entrees = req.body && Array.isArray(req.body.entrees) ? req.body.entrees.slice(0, 100) : null;
    if (!entrees) return res.status(400).json({ erreur: 'Entrées attendues.' });
    const journal = parametresRepo.ecrireJournalCorrections(parametresRepo.lireJournalCorrections().concat(entrees));
    res.json({ nombre: journal.length });
  });

  routeur.delete('/corrections-extraction', (req, res) => {
    parametresRepo.ecrireJournalCorrections([]);
    res.json({ ok: true });
  });

  return routeur;
}

module.exports = { creerRouteurCorrectionsApprises };
