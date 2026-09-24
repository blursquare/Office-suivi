// Fabrique de l'app Express — séparée de index.js pour rester testable sans ouvrir de port réel
// (les tests montent l'app avec une DB en mémoire et l'interrogent directement, voir
// server/test/dossiers.test.js).
'use strict';

const express = require('express');

const { creerGestionnaireAuth } = require('./auth');
const { creerDepot } = require('./dossiersRepo');
const { creerRepoParametres } = require('./parametresRepo');
const { creerRouteurAuditRetours } = require('./routes/auditRetours');
const { creerRouteurAuth } = require('./routes/auth');
const { creerRouteurDossiers } = require('./routes/dossiers');
const { creerRouteurCalendrier } = require('./routes/calendrier');
const { creerRouteurExtractionIa } = require('./routes/extractionIa');
const { creerRouteurOffrePret } = require('./routes/offrePret');
const { creerRouteurNas, creerRouteurLienPiece } = require('./routes/nas');
const { creerRouteurReglages } = require('./routes/reglages');
const { creerRouteurSauvegarde } = require('./routes/sauvegarde');
const { creerRouteurNotifications } = require('./routes/notifications');
const { creerRouteurExclusionsPieces } = require('./routes/exclusionsPieces');
const { creerRouteurCorrectionsApprises } = require('./routes/correctionsApprises');
const { creerRouteurRelectureClaude } = require('./routes/relectureClaude');
const { creerRouteurRelectures } = require('./routes/relectures');
const { creerRouteurSignalements } = require('./routes/signalements');
const { creerRouteurMiseAJour } = require('./routes/miseAJour');
const { creerRouteurAgenda } = require('./routes/agenda');

// Fichier statique → nom d'asset embarqué (voir server/scripts/build-windows-exe.mjs, section
// `assets` de sea-config.json) + type MIME à renvoyer. Tous des fichiers texte (HTML/CSS/JS/JSON/
// SVG) : un seul appel `sea.getAsset(nom, 'utf8')` suffit pour chacun, pas de distinction
// texte/binaire à gérer ici.
const ASSETS_STATIQUES = {
  '/': { fichier: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { fichier: 'index.html', type: 'text/html; charset=utf-8' },
  '/style.css': { fichier: 'style.css', type: 'text/css; charset=utf-8' },
  '/script.js': { fichier: 'script.js', type: 'application/javascript; charset=utf-8' },
  // PDF du questionnaire de satisfaction, encodé en base64 dans un fichier à part (voir
  // construireEmailQuestionnaireSatisfaction). À NE PAS OUBLIER ici ni dans la liste des assets
  // embarqués du .exe : sans ça le <script src> d'index.html fait un 404 et le téléchargement du
  // questionnaire échoue silencieusement.
  '/questionnaire-satisfaction-pdf.js': { fichier: 'questionnaire-satisfaction-pdf.js', type: 'application/javascript; charset=utf-8' },
  // Modèle Word + images de l'en-tête de l'étude pour le générateur d'appel de fonds, encodés en
  // base64 dans un fichier à part chargé à la demande (voir chargerModeleAppelFonds). Même piège
  // que la ligne ci-dessus : à déclarer ici ET dans les assets embarqués du .exe.
  '/appel-de-fonds-modele.js': { fichier: 'appel-de-fonds-modele.js', type: 'application/javascript; charset=utf-8' },
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

// `envoyerEmailFn` : injection de la couche d'envoi (voir envoiEmail.js), utilisée uniquement par
// les tests — sans elle, vérifier les routes qui notifient demanderait un vrai serveur SMTP.
function creerApp({ db, config, envoyerEmailFn, creerClientClaude, miseAJour, agenda }) {
  const app = express();
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  const gestionnaireAuth = creerGestionnaireAuth(config.motDePasse);

  // Un dossier avec historique/analyse juridique reste petit, 5 Mo est déjà large — sauf la
  // relecture d'actes par Claude, qui reçoit le texte complet d'un projet et de ses annexes
  // (jusqu'à ~2,5 millions de caractères, voir relecture/claude.js) : plafond propre, plus haut.
  const jsonStandard = express.json({ limit: '5mb' });
  const jsonRelecture = express.json({ limit: '60mb' });
  // Un bilan de relecture enregistré (analyse + contrôles CLAIRE) dépasse rarement 1 Mo, mais un acte
  // de copropriété avec beaucoup d'annexes peut produire un rapport plus lourd : plafond intermédiaire.
  const jsonBilan = express.json({ limit: '20mb' });
  app.use((req, res, next) => (req.path.startsWith('/api/relecture-claude/') ? jsonRelecture
    : req.path.startsWith('/api/relectures') ? jsonBilan : jsonStandard)(req, res, next));

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
  // Lien signé vers une pièce du NAS (notification Teams) : hors authentification par session, la
  // signature du lien en tient lieu — voir liensPieces.js.
  app.use(creerRouteurLienPiece(config, parametresRepo));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurDossiers(depot));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurExtractionIa(config));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurOffrePret(config));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurNas(config));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurReglages(parametresRepo, envoyerEmailFn, { depot, db }));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurSauvegarde(parametresRepo, db, config));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurNotifications(parametresRepo, envoyerEmailFn));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurAuditRetours(parametresRepo));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurExclusionsPieces(parametresRepo));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurCorrectionsApprises(parametresRepo));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurRelectureClaude(parametresRepo, db, { creerClient: creerClientClaude }));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurRelectures(db));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurSignalements(db, parametresRepo, envoyerEmailFn));
  // Mise à jour en un clic : `miseAJour.redemarrer` est fourni par index.js (seul endroit qui tient
  // le serveur HTTP et la base) ; les tests y injectent aussi un faux `sea` et un faux `fetch`.
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurMiseAJour(parametresRepo, db, config, miseAJour || {}));
  // Agenda de l'office (voir agendaOffice.js/agendaWatch.js) : `agenda.fetchFn` est réservé aux
  // tests, jamais utilisé en production (repli sur le `fetch` global de Node).
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurAgenda(parametresRepo, { depot, ...(agenda || {}) }));

  // Gestionnaire d'erreurs générique en dernier recours : évite qu'une exception inattendue
  // (JSON malformé, etc.) ne fasse planter le processus entier plutôt que de répondre 500.
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error('[app] Erreur non gérée :', err);
    res.status(400).json({ erreur: 'Requête invalide.' });
  });

  return { app, depot, parametresRepo, gestionnaireAuth };
}

// creerMiddlewareAssetsSea/ASSETS_STATIQUES exposées pour les tests uniquement (voir
// server/test/app-assets.test.js) — creerApp() reste le seul point d'entrée réel.
module.exports = { creerApp, creerMiddlewareAssetsSea, ASSETS_STATIQUES };
