'use strict';

// Résumé des emails du matin (voir emailsMatin.js) : lu par la fenêtre « Aujourd'hui ».
//   GET  /api/emails-matin              → le dernier résumé ({ date: null } s'il n'y en a jamais eu)
//   POST /api/emails-matin/actualiser   → UN nouvel essai tout de suite (bouton « Actualiser »)
const express = require('express');
const { genererResumeEmails } = require('../emailsMatin');

function creerRouteurEmailsMatin(parametresRepo, depot, injections = {}) {
  const router = express.Router();
  let enCours = false;

  router.get('/emails-matin', (req, res) => {
    res.json(parametresRepo.lireResumeEmails() || { date: null });
  });

  router.post('/emails-matin/actualiser', async (req, res) => {
    if (enCours) return res.status(409).json({ erreur: 'Lecture déjà en cours.' });
    enCours = true;
    try {
      res.json(await genererResumeEmails(depot, parametresRepo, new Date(), injections));
    } catch (e) {
      res.status(500).json({ erreur: 'Lecture de la boîte impossible.' });
    } finally {
      enCours = false;
    }
  });

  return router;
}

module.exports = { creerRouteurEmailsMatin };
