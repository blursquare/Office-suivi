// POST /api/login — seule route non protégée par le middleware d'auth (elle en est la porte
// d'entrée). Voir server/src/auth.js pour la logique de session.
'use strict';

const express = require('express');

function creerRouteurAuth(gestionnaireAuth) {
  const routeur = express.Router();

  routeur.post('/login', (req, res) => {
    const { motDePasse } = req.body || {};
    if (!gestionnaireAuth.motDePasseValide(motDePasse)) {
      res.status(401).json({ erreur: 'Mot de passe incorrect.' });
      return;
    }
    const jeton = gestionnaireAuth.creerSession();
    res.json({ jeton });
  });

  return routeur;
}

module.exports = { creerRouteurAuth };
