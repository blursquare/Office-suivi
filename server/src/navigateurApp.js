// Résolution du chemin de Chrome/Edge pour l'ouverture en fenêtre applicative au démarrage — voir
// son usage dans index.js (ouvrirNavigateur()). Extraite dans son propre module (fonction pure,
// variables d'environnement et `fs.existsSync` injectables) pour rester testable sans dépendre du
// point d'entrée réel du serveur (index.js s'exécute immédiatement à l'import, y compris en mode
// exécutable autonome SEA — l'importer depuis un test démarrerait un vrai serveur).
'use strict';

const path = require('node:path');

// Chemins Windows usuels de Chrome/Edge (Chromium), dans l'ordre de préférence — Chrome d'abord
// (navigateur de référence de l'outil, voir CLAUDE.md contraintes n°3/7), Edge en repli pour un
// poste qui n'aurait que lui.
function resoudreCheminNavigateurApp(env, existsSyncImpl) {
  const candidats = [];
  if (env['ProgramFiles']) {
    candidats.push(path.join(env['ProgramFiles'], 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  if (env['ProgramFiles(x86)']) {
    candidats.push(path.join(env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  if (env['LocalAppData']) {
    candidats.push(path.join(env['LocalAppData'], 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  if (env['ProgramFiles']) {
    candidats.push(path.join(env['ProgramFiles'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  }
  if (env['ProgramFiles(x86)']) {
    candidats.push(path.join(env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  }
  return candidats.find((p) => existsSyncImpl(p)) || null;
}

module.exports = { resoudreCheminNavigateurApp };
