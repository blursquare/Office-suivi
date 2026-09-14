// Point d'entrée : ouvre la base, construit l'app, démarre le serveur HTTP. Les tâches de fond
// (relances email, M4 ; flux calendrier n'a pas besoin de tâche de fond, il se génère à la
// demande, M5) seront démarrées ici aux prochaines étapes — voir le plan.
'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');

const config = require('./config');
const { ouvrirDb } = require('./db');
const { creerApp } = require('./app');

// Journal de secours à côté de la base (même dossier `data/`, déjà résolu correctement en mode
// développement comme en mode exécutable autonome — voir config.js) : signalé par l'étude, le
// serveur s'arrête parfois après quelques minutes sans qu'aucun message ne reste visible — la
// fenêtre de console d'un .exe à double-clic se ferme instantanément à la fin du processus, trop
// vite pour lire une éventuelle pile d'erreur. Sans journal persistant, chaque occurrence repart
// de zéro pour le diagnostic. Ce journal ne remplace pas une vraie investigation une fois une
// trace obtenue — juste de quoi ne plus perdre l'information la prochaine fois que ça arrive.
const cheminJournalCrash = path.join(path.dirname(config.cheminDb), 'crash.log');

function journaliserErreurFatale(origine, erreur) {
  const ligne = `[${new Date().toISOString()}] ${origine} : ${erreur && erreur.stack ? erreur.stack : erreur}\n`;
  console.error(ligne);
  try {
    fs.mkdirSync(path.dirname(cheminJournalCrash), { recursive: true });
    fs.appendFileSync(cheminJournalCrash, ligne);
  } catch (e) { /* même l'écriture du journal a échoué — la console garde au moins la trace */ }
}

// Continuer plutôt qu'arrêter le processus : ce serveur n'a quasiment aucun état mutable en
// mémoire en dehors de la connexion SQLite (déjà rouverte) et des sessions d'authentification
// (auth.js) — perdre ces dernières force juste une reconnexion, sans conséquence grave. Pour un
// outil de 3 personnes où chaque minute d'indisponibilité se voit immédiatement, rester debout et
// journaliser l'incident vaut mieux qu'un arrêt silencieux dont plus personne ne voit la trace.
// Si une vraie cause récurrente apparaît dans crash.log, la corriger directement plutôt que de
// compter indéfiniment sur ce filet.
process.on('uncaughtException', (err) => journaliserErreurFatale('Exception non interceptée', err));
process.on('unhandledRejection', (raison) => journaliserErreurFatale('Promesse rejetée non gérée', raison));

// Adresses IPv4 locales candidates (hors loopback) : à donner aux autres postes du bureau pour
// qu'ils rejoignent ce même registre (`http://<ip>:<port>/`) — évite à l'étude de devoir chercher
// elle-même l'IP du poste dans les paramètres réseau Windows.
function adressesLan() {
  const interfaces = os.networkInterfaces();
  const adresses = [];
  for (const nom of Object.keys(interfaces)) {
    for (const iface of interfaces[nom] || []) {
      if (iface.family === 'IPv4' && !iface.internal) adresses.push(iface.address);
    }
  }
  return adresses;
}

// Ouvre le navigateur par défaut sur l'URL locale au démarrage — même mécanisme (`start ""`) déjà
// confirmé fonctionnel dans Ouvrir-en-fenetre.bat (voir CLAUDE.md, contrainte n°7). Seulement sur
// Windows : sans objet en développement sous Linux/macOS, où `npm start` est lancé par quelqu'un
// qui sait déjà où cliquer.
function ouvrirNavigateur(url) {
  if (process.platform !== 'win32') return;
  exec(`start "" "${url}"`, (err) => {
    if (err) console.warn('[CLAIRE] Impossible d\'ouvrir le navigateur automatiquement :', err.message);
  });
}

function demarrer() {
  const db = ouvrirDb(config.cheminDb);
  const { app } = creerApp({ db, config });

  app.listen(config.port, () => {
    const url = `http://localhost:${config.port}/`;
    console.log(`[CLAIRE] Serveur intranet démarré sur le port ${config.port}.`);
    console.log(`[CLAIRE] Base : ${config.cheminDb}`);
    console.log(`[CLAIRE] Journal d'erreurs (en cas d'arrêt inattendu) : ${cheminJournalCrash}`);
    console.log(`[CLAIRE] Ouvrir dans ce poste : ${url}`);
    for (const ip of adressesLan()) {
      console.log(`[CLAIRE] Depuis un autre poste du bureau : http://${ip}:${config.port}/`);
    }
    ouvrirNavigateur(url);
  });
}

demarrer();
