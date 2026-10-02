'use strict';

// Résumé des emails du matin (voir emailsMatin.js) : lu par la fenêtre « Aujourd'hui ».
//   GET  /api/emails-matin              → le dernier résumé ({ date: null } s'il n'y en a jamais eu)
//   POST /api/emails-matin/actualiser   → UN nouvel essai tout de suite (bouton « Actualiser »)
//   GET/PUT /api/emails-matin/exclusions → expéditeurs ou mots écartés du résumé, en plus des SPF,
//                                          CRIDON, INFN, INAFON et publicités (Réglages)
const express = require('express');
const { genererResumeEmails, CLE_EXCLUSIONS_RESUME, lireTermesExclus } = require('../emailsMatin');

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

  router.get('/emails-matin/exclusions', (req, res) => {
    res.json({ termes: lireTermesExclus(parametresRepo) });
  });

  router.put('/emails-matin/exclusions', (req, res) => {
    const brut = req.body && Array.isArray(req.body.termes) ? req.body.termes : null;
    if (!brut) return res.status(400).json({ erreur: 'Liste attendue.' });
    const termes = [...new Set(brut.filter((x) => typeof x === 'string').map((x) => x.trim().slice(0, 80)).filter(Boolean))].slice(0, 100);
    parametresRepo.ecrireJsonBrut(CLE_EXCLUSIONS_RESUME, termes);
    res.json({ termes });
  });

  return router;
}

module.exports = { creerRouteurEmailsMatin };
