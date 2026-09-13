// Fabrique de l'app Express — séparée de index.js pour rester testable sans ouvrir de port réel
// (les tests montent l'app avec une DB en mémoire et l'interrogent directement, voir
// server/test/dossiers.test.js).
'use strict';

const express = require('express');

const { creerGestionnaireAuth } = require('./auth');
const { creerDepot } = require('./dossiersRepo');
const { creerRouteurAuth } = require('./routes/auth');
const { creerRouteurDossiers } = require('./routes/dossiers');

function creerApp({ db, config }) {
  const app = express();
  const depot = creerDepot(db);
  const gestionnaireAuth = creerGestionnaireAuth(config.motDePasse);

  app.use(express.json({ limit: '5mb' })); // un dossier avec historique/analyse juridique reste petit, 5 Mo est déjà large

  // Sert index.html/style.css/script.js/manifest.json/icone.svg depuis la racine du dépôt : un
  // seul port, aucune modification des <link>/<script src> existants (voir le plan).
  app.use(express.static(config.racineRepo));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api', creerRouteurAuth(gestionnaireAuth));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurDossiers(depot));

  // Gestionnaire d'erreurs générique en dernier recours : évite qu'une exception inattendue
  // (JSON malformé, etc.) ne fasse planter le processus entier plutôt que de répondre 500.
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error('[app] Erreur non gérée :', err);
    res.status(400).json({ erreur: 'Requête invalide.' });
  });

  return { app, depot, gestionnaireAuth };
}

module.exports = { creerApp };
