// Lecture centralisée de la configuration — un seul endroit à modifier si un nom de variable
// change, plutôt que des `process.env.X` semés dans tout le code serveur.
//
// Deux modes de résolution du mot de passe/port/base de données :
// - Mode développement (`npm start`, ou un `.env` présent) : variables d'environnement, comme
//   avant — comportement inchangé pour qui connaît déjà ce mode (voir server/README.md).
// - Mode exécutable autonome (`CLAIRE-serveur.exe`, voir server/scripts/build-windows-exe.mjs) :
//   pas de `.env` dans ce mode (les fichiers sont embarqués dans le blob SEA, voir app.js) — un
//   `config.json` à côté de l'exécutable en tient lieu, généré automatiquement avec un mot de
//   passe aléatoire au tout premier lancement si absent. Uniquement déclenché quand
//   `AUTH_PASSWORD` n'est pas déjà fourni par l'environnement, pour ne jamais court-circuiter le
//   mode développement/`.env` existant.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

function requisPourProd(nom, valeur) {
  // Le mot de passe partagé est la seule variable réellement bloquante : sans lui, n'importe qui
  // sur le réseau pourrait lire/modifier le registre. Les autres (SMTP, jeton calendrier) restent
  // optionnelles pour permettre de démarrer le serveur (M1) avant que l'étude ait fourni ses
  // identifiants SMTP (M4) — les fonctionnalités concernées se désactivent proprement si absentes,
  // voir mail/smtp.js et routes/calendrier.js.
  if (!valeur) {
    console.warn(`[config] ${nom} n'est pas défini dans .env — voir .env.example.`);
  }
  return valeur;
}

// true uniquement quand ce process est le binaire produit par build-windows-exe.mjs (jamais en
// `npm start`/tests, où `node:sea` existe mais `isSea()` renvoie false).
function estSea() {
  try {
    return require('node:sea').isSea();
  } catch (_) {
    return false; // Node trop ancien ou module absent — traité comme "pas SEA", jamais fatal ici.
  }
}

// Résout mot de passe + port + jeton calendrier pour le mode exécutable autonome. Extraite en
// fonction pure (dossier et implémentation fs injectables) pour rester testable sans construire un
// vrai .exe — voir server/test/config.test.js.
function resoudreConfigExecutable(dossierExe, fsImpl = fs) {
  const cheminConfig = path.join(dossierExe, 'config.json');
  if (fsImpl.existsSync(cheminConfig)) {
    const brut = JSON.parse(fsImpl.readFileSync(cheminConfig, 'utf8'));
    let calendrierToken = brut.calendrierToken || '';
    // config.json généré par une version antérieure à l'ajout du calendrier connecté (voir
    // CLAUDE.md) : complété ici avec un jeton généré à la volée plutôt que d'exiger de supprimer
    // le fichier (ce qui régénérerait aussi le mot de passe partagé, sans rapport) pour en
    // profiter — seul `calendrierToken` est ajouté, `authPassword`/`port` restent inchangés.
    if (!calendrierToken) {
      calendrierToken = crypto.randomBytes(8).toString('hex');
      fsImpl.writeFileSync(cheminConfig, JSON.stringify({ ...brut, calendrierToken }, null, 2));
    }
    return { motDePasse: brut.authPassword || '', port: brut.port || 3000, calendrierToken, genere: false };
  }
  // 8 caractères hexadécimaux pour le mot de passe : assez d'entropie pour un LAN de 3 personnes,
  // assez court pour être retapé sans erreur depuis mot-de-passe.txt. Le jeton calendrier n'a
  // jamais besoin d'être retapé (il vit dans une URL copiée-collée une seule fois dans Outlook) :
  // deux fois plus long, jamais montré nulle part en dehors de config.json/de cette URL.
  const motDePasse = crypto.randomBytes(4).toString('hex');
  const calendrierToken = crypto.randomBytes(8).toString('hex');
  fsImpl.mkdirSync(dossierExe, { recursive: true });
  fsImpl.writeFileSync(cheminConfig, JSON.stringify({ authPassword: motDePasse, port: 3000, calendrierToken }, null, 2));
  fsImpl.writeFileSync(
    path.join(dossierExe, 'mot-de-passe.txt'),
    `Mot de passe partagé CLAIRE : ${motDePasse}\r\n\r\n` +
      `À communiquer à tous les collaborateurs qui utilisent l'outil (même mot de passe pour tous).\r\n` +
      `Pour le changer : modifier "authPassword" dans config.json (à côté de cet exécutable), puis redémarrer.\r\n`
  );
  return { motDePasse, port: 3000, calendrierToken, genere: true };
}

let motDePasse = process.env.AUTH_PASSWORD || '';
let port = parseInt(process.env.PORT || '3000', 10);
let cheminDb = process.env.CLAIRE_DB_PATH || path.join(__dirname, '..', 'data', 'claire.db');
let jetonCalendrier = process.env.CALENDRIER_TOKEN || '';

if (!motDePasse && estSea()) {
  const dossierExe = path.dirname(process.execPath);
  const resolu = resoudreConfigExecutable(dossierExe);
  motDePasse = resolu.motDePasse;
  port = resolu.port;
  // Le jeton calendrier suit la même règle de précédence que le mot de passe : un `CALENDRIER_TOKEN`
  // déjà présent dans l'environnement (mode développement/.env) n'est jamais écrasé par celui de
  // config.json — cas qui ne se produit en pratique jamais en mode .exe (pas de .env dans ce mode),
  // gardé par cohérence avec le reste du fichier plutôt que par nécessité réelle.
  jetonCalendrier = jetonCalendrier || resolu.calendrierToken;
  cheminDb = path.join(dossierExe, 'data', 'claire.db');
  if (resolu.genere) {
    console.log(`[config] Premier lancement : mot de passe partagé généré automatiquement.`);
    console.log(`[config] Mot de passe : ${motDePasse}  (voir aussi mot-de-passe.txt à côté de cet exécutable)`);
  }
} else {
  motDePasse = requisPourProd('AUTH_PASSWORD', motDePasse);
}

const config = {
  port,
  // Racine du dépôt (parent de server/) : sert index.html/style.css/script.js en mode
  // développement (`express.static`, voir app.js) — sans objet en mode SEA, où ces fichiers sont
  // embarqués dans le blob et servis via `sea.getAsset()`.
  racineRepo: path.resolve(__dirname, '..', '..'),
  cheminDb,
  motDePasse,
  jetonCalendrier,
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || ''
  },
  // Intervalles des tâches de fond, en millisecondes — volontairement des constantes en dur
  // plutôt que configurables via .env pour la V1 : pas de besoin exprimé de les ajuster, une
  // valeur de plus à documenter/oublier pour rien.
  intervalleRappelsMs: 30 * 60 * 1000,
  // Analyse juridique par IA locale (voir routes/analyseIa.js, CLAUDE.md) : Ollama tourne EN
  // LOCAL sur ce même serveur (jamais un service cloud — confidentialité des actes notariés), sur
  // son port par défaut. Modèle par défaut choisi pour tourner raisonnablement sur un CPU de
  // bureau sans GPU dédié (8B paramètres, quantifié par défaut par Ollama) — voir server/README.md
  // pour l'installation et le choix éventuel d'un autre modèle. Les deux restent modifiables sans
  // toucher au code, comme le reste de la configuration de ce fichier.
  ollama: {
    url: process.env.OLLAMA_URL || 'http://localhost:11434',
    modele: process.env.OLLAMA_MODEL || 'llama3.1:8b'
  }
};

// resoudreConfigExecutable/estSea exposées pour les tests uniquement — le reste du code serveur
// continue de consommer `config.motDePasse`/`config.port`/... comme avant.
module.exports = Object.assign(config, { resoudreConfigExecutable, estSea });
