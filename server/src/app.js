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
const { creerRouteurOffrePret } = require('./routes/offrePret');
const { creerRouteurNas, creerRouteurLienPiece } = require('./routes/nas');
const { creerRouteurScans } = require('./routes/scans');
const { creerRouteurReglages } = require('./routes/reglages');
const { creerRouteurSauvegarde } = require('./routes/sauvegarde');
const { creerRouteurNotifications } = require('./routes/notifications');
const { creerRouteurExclusionsPieces } = require('./routes/exclusionsPieces');
const { creerRouteurCorrectionsApprises } = require('./routes/correctionsApprises');
const { creerRouteurConfreres } = require('./routes/confreres');
const { creerRouteurPoste, creerRouteurIconePoste } = require('./routes/poste');
const { creerRouteurVerificationsTerrain } = require('./routes/verificationsTerrain');
const { creerRouteurNomsFichiersNas } = require('./routes/nomsFichiersNas');
const { creerRouteurSignatureImages } = require('./routes/signatureImages');
const { creerRouteurRappelsPerso } = require('./routes/rappelsPerso');
const { creerRouteurModelesEmails } = require('./routes/modelesEmails');
const { creerRouteurPreferences } = require('./routes/preferences');
const { creerRouteurRelectureClaude } = require('./routes/relectureClaude');
const { creerRouteurRelectures } = require('./routes/relectures');
const { creerRouteurSignalements } = require('./routes/signalements');
const { creerRouteurMiseAJour } = require('./routes/miseAJour');
const { creerRouteurAgenda } = require('./routes/agenda');
const { creerRouteurExchange } = require('./routes/exchange');
const { creerRouteurSondages } = require('./routes/sondages');
const { creerRouteurEmailsMatin } = require('./routes/emailsMatin');
const { creerRouteurEmailsDossiers } = require('./routes/emailsDossiers');
const { creerRouteurRapportTechnique } = require('./routes/rapportTechnique');
const { creerRouteurSonnerie, creerRouteurAppels, creerEtatAppels } = require('./routes/appels');
const { creerRouteurAuthentic } = require('./routes/authentic');
const { creerJournalTechnique } = require('./journalTechnique');
const { COLLABORATEURS_ABSENCE } = require('./agendaOffice');
const { lireBuildInstalle } = require('./miseAJour');

// Fichier statique → nom d'asset embarqué (voir server/scripts/build-windows-exe.mjs, section
// `assets` de sea-config.json) + type MIME à renvoyer. Tous des fichiers texte (HTML/CSS/JS/JSON/
// SVG) : un seul appel `sea.getAsset(nom, 'utf8')` suffit pour chacun, pas de distinction
// texte/binaire à gérer ici.
const ASSETS_STATIQUES = {
  '/': { fichier: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { fichier: 'index.html', type: 'text/html; charset=utf-8' },
  '/style.css': { fichier: 'style.css', type: 'text/css; charset=utf-8' },
  // Fichiers du poste (client/manifest.json, dans l'ordre de chargement d'index.html — voir CLAUDE.md « Structure ») :
  // la même liste nourrit les assets embarqués du .exe (build-windows-exe.mjs) et le chargeur des tests.
  ...Object.fromEntries(require('../../commun/manifest.json').map((f) => [`/commun/${f}`, { fichier: `commun/${f}`, type: 'application/javascript; charset=utf-8' }])),
  ...Object.fromEntries(require('../../client/manifest.json').map((f) => [`/client/${f}`, { fichier: `client/${f}`, type: 'application/javascript; charset=utf-8' }])),
  // PDF du questionnaire de satisfaction, encodé en base64 dans un fichier à part (voir
  // construireEmailQuestionnaireSatisfaction). À NE PAS OUBLIER ici ni dans la liste des assets
  // embarqués du .exe : sans ça le <script src> d'index.html fait un 404 et le téléchargement du
  // questionnaire échoue silencieusement.
  '/questionnaire-satisfaction-pdf.js': { fichier: 'questionnaire-satisfaction-pdf.js', type: 'application/javascript; charset=utf-8' },
  // Modèle Word + images de l'en-tête de l'étude pour le générateur d'appel de fonds, encodés en
  // base64 dans un fichier à part chargé à la demande (voir chargerModeleAppelFonds). Même piège
  // que la ligne ci-dessus : à déclarer ici ET dans les assets embarqués du .exe.
  '/appel-de-fonds-modele.js': { fichier: 'appel-de-fonds-modele.js', type: 'application/javascript; charset=utf-8' },
  // Composants Web Awesome (étude 04/10), paquet local : à déclarer ici ET dans les assets du .exe, comme le reste.
  '/vendor/web-awesome/web-awesome.js': { fichier: 'vendor/web-awesome/web-awesome.js', type: 'application/javascript; charset=utf-8' },
  '/vendor/web-awesome/web-awesome-theme.css': { fichier: 'vendor/web-awesome/web-awesome-theme.css', type: 'text/css; charset=utf-8' },
  // Police de l'interface (Geist, OFL — étude 04/10), embarquée : aucun appel extérieur. Binaire : lue sans encodage.
  '/vendor/polices/geist-latin-wght-normal.woff2': { fichier: 'vendor/polices/geist-latin-wght-normal.woff2', type: 'font/woff2', binaire: true },
  '/vendor/polices/geist-latin-ext-wght-normal.woff2': { fichier: 'vendor/polices/geist-latin-ext-wght-normal.woff2', type: 'font/woff2', binaire: true },
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
      res.type(entree.type).send(entree.binaire ? Buffer.from(sea.getAsset(entree.fichier)) : sea.getAsset(entree.fichier, 'utf8'));
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
function seaOuNull() {
  try { return require('node:sea'); } catch (_) { return null; }
}

function creerApp({ db, config, envoyerEmailFn, creerClientClaude, appelerMistral, testerMistral, miseAJour, agenda, emailsMatin, rapportTechnique, sondages, exchange, emailsDossiers }) {
  const app = express();
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  // Journal technique (erreurs, événements des postes) : alimente le rapport technique GitHub.
  const journalTechnique = creerJournalTechnique(db);
  // authActive === false : accès sans mot de passe (défaut en production, voir config.js). Absent
  // (tests qui construisent leur propre config) : l'authentification reste active.
  const gestionnaireAuth = creerGestionnaireAuth(config.motDePasse, { desactivee: config.authActive === false });

  // Un dossier avec historique/analyse juridique reste petit, 5 Mo est déjà large — sauf la
  // relecture d'actes par Claude, qui reçoit le texte complet d'un projet et de ses annexes
  // (jusqu'à ~2,5 millions de caractères, voir relecture/claude.js) : plafond propre, plus haut.
  const jsonStandard = express.json({ limit: '5mb' });
  const jsonRelecture = express.json({ limit: '60mb' });
  // Un bilan de relecture enregistré (analyse + contrôles CLAIRE) dépasse rarement 1 Mo, mais un acte
  // de copropriété avec beaucoup d'annexes peut produire un rapport plus lourd : plafond intermédiaire.
  const jsonBilan = express.json({ limit: '20mb' });
  // Un email envoyé depuis CLAIRE porte ses pièces jointes (21 Mo au plus, en base64) et la signature.
  const jsonEmail = express.json({ limit: '40mb' });
  app.use((req, res, next) => (req.path.startsWith('/api/relecture-claude/') ? jsonRelecture
    : req.path.startsWith('/api/relectures') ? jsonBilan
      : req.path === '/api/emails/envoyer' ? jsonEmail : jsonStandard)(req, res, next));

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
  // Lien signé vers une pièce du NAS (notification Teams) : hors authentification par session, la
  // signature du lien en tient lieu — voir liensPieces.js.
  app.use(creerRouteurLienPiece(config, parametresRepo));
  // Sonnerie 3CX (« Intégration CRM » du client web) : hors session, elle ne fait que noter l'appel
  // et ne renvoie aucune donnée — voir routes/appels.js.
  const etatAppels = creerEtatAppels();
  app.use(creerRouteurSonnerie(parametresRepo, depot, etatAppels));
  // Icône de CLAIRE pour l'installateur d'un poste (installationPoste.js), lue sans session.
  app.use('/api', creerRouteurIconePoste({ parametresRepo }));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurAppels(parametresRepo, etatAppels));
  // Pages d'Authentic envoyées par l'extension Firefox (extension-firefox/), gardées en mémoire 30 min.
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurAuthentic());
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurDossiers(depot));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurOffrePret(config));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurNas(config));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurNomsFichiersNas(config, parametresRepo));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurScans(config, parametresRepo));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurReglages(parametresRepo, envoyerEmailFn, { depot, db }));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurSauvegarde(parametresRepo, db, config));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurNotifications(parametresRepo, envoyerEmailFn));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurEmailsMatin(parametresRepo, depot, { config, ...(emailsMatin || {}) }));
  // Emails des dossiers (voir emailsDossiers.js) : reçus et envoyés rattachés aux dossiers, pièces jointes.
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurEmailsDossiers(parametresRepo, depot, { config, injections: emailsDossiers || {} }));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurAuditRetours(parametresRepo));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurExclusionsPieces(parametresRepo));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurCorrectionsApprises(parametresRepo));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurConfreres(parametresRepo));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurPoste());
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurVerificationsTerrain(parametresRepo));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurSignatureImages(db));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurRappelsPerso(parametresRepo));
  // Modèles d'emails de l'étude (Réglages › Modèles d'emails, fenêtre d'email) : voir modelesEmails.js.
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurModelesEmails(parametresRepo));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurPreferences(parametresRepo));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurRelectureClaude(parametresRepo, db, { creerClient: creerClientClaude, appelerMistral, testerMistral }));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurRelectures(db));
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurSignalements(db, parametresRepo, envoyerEmailFn));
  // Mise à jour en un clic : `miseAJour.redemarrer` est fourni par index.js (seul endroit qui tient
  // le serveur HTTP et la base) ; les tests y injectent aussi un faux `sea` et un faux `fetch`.
  const routeurMiseAJour = creerRouteurMiseAJour(parametresRepo, db, config, miseAJour || {});
  app.use('/api', gestionnaireAuth.middlewareAuth, routeurMiseAJour);
  // Agenda de l'office (voir agendaOffice.js/agendaWatch.js) : `agenda.poster` (faux transport EWS)
  // est réservé aux tests, jamais utilisé en production.
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurAgenda(parametresRepo, { depot, ...(agenda || {}) }));
  // Connexion à l'agenda Outlook de l'office (EWS/NTLM, voir exchange/ews.js) : enregistre les
  // identifiants de messagerie (mot de passe jamais renvoyé au navigateur), teste la connexion et
  // crée les rendez-vous de signature dans l'agenda. À valider sur un poste du bureau (l'Exchange
  // n'est joignable que depuis le réseau de l'étude).
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurExchange(parametresRepo, exchange || {}));
  // Sondage de créneaux de signature (voir sondagesCreneaux.js). `sondages.poster` : faux transport
  // EWS, tests seulement.
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurSondages(parametresRepo, sondages || {}));
  // Rapport technique anonymisé déposé sur GitHub à 12 h et 17 h (voir rapportTechnique.js) ; le
  // minuteur est démarré par index.js seulement. `rapportTechnique.fetchFn` : tests uniquement.
  app.use('/api', gestionnaireAuth.middlewareAuth, creerRouteurRapportTechnique({
    journal: journalTechnique, parametresRepo, depot, db,
    buildInstalle: () => lireBuildInstalle(seaOuNull()),
    collaborateurs: COLLABORATEURS_ABSENCE.map((c) => c.nom),
    fetchFn: (rapportTechnique && rapportTechnique.fetchFn) || fetch
  }));

  // Gestionnaire d'erreurs générique en dernier recours : évite qu'une exception inattendue
  // (JSON malformé, etc.) ne fasse planter le processus entier plutôt que de répondre 500.
  // Jamais `err` entier dans le journal : une erreur du lecteur JSON porte le corps reçu (`err.body`), qui peut
  // contenir le texte d'un email ou d'un dossier ; seuls le type, le statut et le message sont notés (audit 04/10).
  app.use((err, req, res, next) => {
    const statut = err && Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    // Le message d'une erreur de lecture JSON (V8) cite un extrait du corps reçu : il n'est jamais journalisé.
    const message = err && /parse/i.test(String(err.type || '')) ? '' : (err && err.message) || '';
    console.error(`[app] Erreur non gérée (${req.method} ${req.path}) : ${(err && (err.type || err.code)) || 'erreur'}${message ? ' — ' + message : ''}`.slice(0, 300));
    if (res.headersSent) return;
    res.status(statut).json({ erreur: statut === 413 ? 'Requête trop volumineuse.' : statut === 400 ? 'Requête invalide.' : 'Erreur interne du serveur.' });
  });

  return { app, depot, parametresRepo, gestionnaireAuth, journalTechnique, routeurMiseAJour };
}

// creerMiddlewareAssetsSea/ASSETS_STATIQUES exposées pour les tests uniquement (voir
// server/test/app-assets.test.js) — creerApp() reste le seul point d'entrée réel.
module.exports = { creerApp, creerMiddlewareAssetsSea, ASSETS_STATIQUES };
