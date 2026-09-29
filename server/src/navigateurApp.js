// Résolution du chemin de Chrome/Edge pour l'ouverture en fenêtre applicative au démarrage — voir
// son usage dans index.js (ouvrirNavigateur()). Extraite dans son propre module (fonction pure,
// variables d'environnement et `fs.existsSync` injectables) pour rester testable sans dépendre du
// point d'entrée réel du serveur (index.js s'exécute immédiatement à l'import, y compris en mode
// exécutable autonome SEA — l'importer depuis un test démarrerait un vrai serveur).
'use strict';

const path = require('node:path');
const crypto = require('node:crypto');

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

// ---- Icône nette dans la barre des tâches (29/09) ------------------------------------------------
// Une fenêtre `--app=<url>` NON installée prend pour icône de barre des tâches le favicon de la page
// en 16 px, agrandi par Windows : pixelisé quels que soient les favicons fournis (constaté après
// l'ajout de favicons 16 à 256 px le 28/09). Seule une application INSTALLÉE (Chrome › Installer
// CLAIRE) utilise ses grandes icônes. Une fois CLAIRE installée dans le profil dédié, le serveur
// l'ouvre donc par son identifiant (`--app-id`) plutôt que par son adresse.

// Identifiant d'application web de Chrome/Edge : SHA-256 de l'identifiant du manifeste (ici
// « http://localhost:<port>/index.html », `"id"` de manifest.json), 16 premiers octets en
// hexadécimal, chaque chiffre 0-f transcrit en lettre a-p (crx_file::id_util::GenerateId). Pure.
function idApplicationWeb(idManifeste) {
  const hex = crypto.createHash('sha256').update(String(idManifeste)).digest('hex').slice(0, 32);
  return hex.replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
}

// Dossier du profil navigateur dédié (voir PROFIL_NAVIGATEUR) : Chrome ou Edge selon l'exécutable.
function dossierProfilNavigateur(cheminNavigateur, env, profil) {
  const base = env['LocalAppData'] || env['LOCALAPPDATA'];
  if (!base || !cheminNavigateur) return null;
  const edge = /msedge\.exe$/i.test(cheminNavigateur);
  return path.win32.join(base, ...(edge ? ['Microsoft', 'Edge'] : ['Google', 'Chrome']), 'User Data', profil);
}

// Argument d'ouverture de la fenêtre : `--app-id=<id>` si CLAIRE est installée dans le profil
// (Chrome y range ses icônes : « Web Applications\Manifest Resources\<id> »), sinon `--app=<url>`.
function argumentFenetreApp(url, cheminNavigateur, env, existsSyncImpl, profil) {
  try {
    const origine = new URL(url).origin;
    const dossier = dossierProfilNavigateur(cheminNavigateur, env, profil);
    // « /index.html » : identifiant d'une installation faite avant l'ajout de "id" au manifeste
    // (l'adresse de départ en tenait lieu) — gardé tel quel pour ne pas changer d'application.
    for (const chemin of ['/index.html', '/']) {
      const id = idApplicationWeb(origine + chemin);
      if (dossier && existsSyncImpl(path.win32.join(dossier, 'Web Applications', 'Manifest Resources', id))) {
        return `--app-id=${id}`;
      }
    }
  } catch (e) { /* adresse illisible : ouverture par l'adresse */ }
  return `--app="${url}"`;
}

module.exports = { resoudreCheminNavigateurApp, idApplicationWeb, dossierProfilNavigateur, argumentFenetreApp };
