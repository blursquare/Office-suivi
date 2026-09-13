// Point d'entrée : ouvre la base, construit l'app, démarre le serveur HTTP. Les tâches de fond
// (relances email, M4 ; flux calendrier n'a pas besoin de tâche de fond, il se génère à la
// demande, M5) seront démarrées ici aux prochaines étapes — voir le plan.
'use strict';

const config = require('./config');
const { ouvrirDb } = require('./db');
const { creerApp } = require('./app');

function demarrer() {
  const db = ouvrirDb(config.cheminDb);
  const { app } = creerApp({ db, config });

  app.listen(config.port, () => {
    console.log(`[CLAIRE] Serveur intranet démarré sur le port ${config.port}.`);
    console.log(`[CLAIRE] Base : ${config.cheminDb}`);
  });
}

demarrer();
