'use strict';

// Préférences d'affichage par collaborateur (voir parametresRepo, CLE_PREFERENCES) : lues par
// `?collaborateur=`, et chaque poste n'envoie que ce qui change pour SON collaborateur — deux
// collègues qui changent de thème en même temps ne s'écrasent pas l'un l'autre.

const express = require('express');
const { assainirPreference } = require('../parametresRepo');

function nomCollaborateur(valeur) {
  return typeof valeur === 'string' ? valeur.trim().slice(0, 80) : '';
}

function creerRouteurPreferences(parametresRepo) {
  const routeur = express.Router();

  routeur.get('/preferences', (req, res) => {
    const nom = nomCollaborateur(req.query.collaborateur);
    if (!nom) return res.json({ preferences: {} });
    res.json({ preferences: parametresRepo.lirePreferences()[nom] || {} });
  });

  routeur.put('/preferences', (req, res) => {
    const nom = nomCollaborateur(req.body && req.body.collaborateur);
    if (!nom) return res.status(400).json({ erreur: 'Collaborateur manquant.' });
    const toutes = parametresRepo.lirePreferences();
    const fusion = assainirPreference(Object.assign({}, toutes[nom], req.body.preferences));
    toutes[nom] = fusion;
    parametresRepo.ecrirePreferences(toutes);
    res.json({ preferences: fusion });
  });

  return routeur;
}

module.exports = { creerRouteurPreferences };
