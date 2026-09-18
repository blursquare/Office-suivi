// Fabrique de l'app Express — séparée de index.js pour rester testable sans ouvrir de port réel
// (les tests montent l'app avec une DB en mémoire et l'interrogent directement, voir
// server/test/dossiers.test.js).
'use strict';

const express = require('express');

const { creerGestionnaireAuth } = require('./auth');
const { creerDepot } = require('./dossiersRepo');
const { creerRouteurAuth } = require('./routes/auth');
const { creerRouteurDossiers } = require('./routes/dossiers');
const { creerRouteurCalendrier } = require('./routes/calendrier');
const { creerRouteurAnalyseIa } = require('./routes/analyseIa');
const { creerRouteurExtractionIa } = require('./routes/extractionIa');
const { creerRouteurOffrePret } = require('./routes/offrePret');
const { creerRouteurNas } = require('./routes/nas');

// Fichier statique → nom d'asset embarqué (voir server/scripts/build-windows-exe.mjs, section
// `assets` de sea-config.json) + type MIME à renvoyer. Tous des fichiers texte (HTML/CSS/JS/JSON/
// SVG) : un seul appel `sea.getAsset(nom, 'utf8')` suffit pour chacun, pas de distinction
// texte/binaire à gérer ici.
const ASSETS_STATIQUES = {
  '/': { fichier: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { fichier: 'index.html', type: 'text/html; charset=utf-8' },
  '/style.css': { fichier: 'style.css', type: 'text/css; charset=utf-8' },
  '/script.js': { fichier: 'script.js', type: 'application/javascript; charset=utf-8' },
  '/manifest.json': { fichier: 'manifest.json', type: 'application/manifest+json; charset=utf-8' },
  '/sw.js': { fichier: 'sw.js', type: 'application/javascript; charset=utf-8' },
  '/icone.svg': { fichier: 'icone.svg', type: 'image/svg+xml; charset=utf-8' }
};

// Sert les fichiers ci-dessus depuis les assets embarqués dans le blob SEA (mode exécutable
// autonome, voir server/README.md) plutôt que depuis le disque — `sea.getAsset()` remplace
// `express.static()` dans ce seul cas. Extraite en fonction pure (le module `sea` est injecté)
// pour rester testable sans construire un vrai .exe — voir server/test/app-assets.test.js.
function creerMiddlewareAssetsSea(sea) {
  return (req, res, next) => {
    const entree = ASSETS_STATIQUES[req.path];
    if (!entree) return next();
    try {
      res.type(entree.type).send(sea.getAsset(entree.fichier, 'utf8'));
    } catch (err) {
      next(err);
    }
  };
}

function estSea() {
  try {
    return require('node:sea').isSea();
  } catch (_) {
    return false;
  }
}

function creerApp({ db, config }) {
  const app = express();
  const depot = creerDepot(db);
  const gestionnaireAuth = creerGestionnaireAuth(config.motDePasse);

  app.use(express.json({ limit: '5mb' })); // un dossier avec historique/analyse juridique reste petit, 5 Mo est déjà large

  // Sert index.html/style.css/script.js/manifest.json/sw.js/icone.svg : depuis la racine du dépôt
  // en mode développement (`npm start`), depuis les assets embarqués du blob SEA en mode
  // exécutable autonome (`CLAIRE-serveur.exe`, qui n'a pas ces fichiers sur disque à côté de lui).
  // Un seul port dans les deux cas, aucune modification des <link>/<script src> existants.
  if (estSea()) {
    app.use(creerMiddlewareAssetsSea(require('node:sea')));
  } else {
    app.use(express.static(config.racineRepo));
  }

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api', creerRouteurAuth(gestionnaireAuth));
  // Hors du middlewareAuth par jeton de session, volontairement : un abonnement webcal
  // (Outlook...) ne sait pas se connecter via l'écran de mot de passe, il ne suit qu'une URL — la
  // route elle-même vérifie son propre jeton dédié (config.jetonCalendrier), voir
  // routes/calendrier.js. Montée à la racine (pas sous /api) pour rester une URL courte à coller
  // dans un client calendrier, cohérent avec .env.example (`GET /calendrier.ics?token=...`).
  app.use(creerRouteurCalendrier(depot, config));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurDossiers(depot));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurAnalyseIa(config));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurExtractionIa(config));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurOffrePret(config));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurNas(config));

  // Gestionnaire d'erreurs générique en dernier recours : évite qu'une exception inattendue
  // (JSON malformé, etc.) ne fasse planter le processus entier plutôt que de répondre 500.
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error('[app] Erreur non gérée :', err);
    res.status(400).json({ erreur: 'Requête invalide.' });
  });

  return { app, depot, gestionnaireAuth };
}

// creerMiddlewareAssetsSea/ASSETS_STATIQUES exposées pour les tests uniquement (voir
// server/test/app-assets.test.js) — creerApp() reste le seul point d'entrée réel.
module.exports = { creerApp, creerMiddlewareAssetsSea, ASSETS_STATIQUES };
