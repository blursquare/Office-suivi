// Point d'entrée : ouvre la base, construit l'app, démarre le serveur HTTP. Les tâches de fond
// (relances email, M4 ; flux calendrier n'a pas besoin de tâche de fond, il se génère à la
// demande, M5) seront démarrées ici aux prochaines étapes — voir le plan.
'use strict';

const os = require('node:os');
const { exec } = require('node:child_process');

const config = require('./config');
const { ouvrirDb } = require('./db');
const { creerApp } = require('./app');

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
    console.log(`[CLAIRE] Ouvrir dans ce poste : ${url}`);
    for (const ip of adressesLan()) {
      console.log(`[CLAIRE] Depuis un autre poste du bureau : http://${ip}:${config.port}/`);
    }
    ouvrirNavigateur(url);
  });
}

demarrer();
