// Lecture centralisée des variables d'environnement — un seul endroit à modifier si un nom de
// variable change, plutôt que des `process.env.X` semés dans tout le code serveur.
'use strict';

const path = require('node:path');

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

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  // Racine du dépôt (parent de server/) : c'est de là que sont servis index.html/style.css/script.js.
  racineRepo: path.resolve(__dirname, '..', '..'),
  cheminDb: process.env.CLAIRE_DB_PATH || path.join(__dirname, '..', 'data', 'claire.db'),
  motDePasse: requisPourProd('AUTH_PASSWORD', process.env.AUTH_PASSWORD || ''),
  jetonCalendrier: process.env.CALENDRIER_TOKEN || '',
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
  intervalleRappelsMs: 30 * 60 * 1000
};
