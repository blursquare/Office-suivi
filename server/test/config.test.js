'use strict';

// Teste uniquement resoudreConfigExecutable() (voir server/src/config.js) — la résolution utilisée
// en mode `CLAIRE-serveur.exe` (voir server/scripts/build-windows-exe.mjs). Le reste de config.js
// se contente de lire process.env, déjà couvert implicitement par server/test/dossiers.test.js
// (config() y construit son propre objet directement, sans passer par ce module).

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resoudreConfigExecutable } = require('../src/config');

function creerFsFictif(fichiers = {}) {
  const ecritures = {};
  return {
    existsSync: (chemin) => Object.prototype.hasOwnProperty.call(fichiers, chemin),
    readFileSync: (chemin) => fichiers[chemin],
    writeFileSync: (chemin, contenu) => { ecritures[chemin] = contenu; },
    mkdirSync: () => {},
    ecritures
  };
}

test('config.json absent : génère un mot de passe et écrit config.json + mot-de-passe.txt', () => {
  const fs = creerFsFictif();
  const resultat = resoudreConfigExecutable('/exe', fs);

  assert.equal(resultat.genere, true);
  assert.equal(resultat.port, 3000);
  assert.match(resultat.motDePasse, /^[0-9a-f]{8}$/);

  const configEcrite = JSON.parse(fs.ecritures['/exe/config.json']);
  assert.equal(configEcrite.authPassword, resultat.motDePasse);
  assert.equal(configEcrite.port, 3000);
  assert.match(fs.ecritures['/exe/mot-de-passe.txt'], new RegExp(resultat.motDePasse));
});

test('config.json déjà présent : reprend son mot de passe/port sans rien réécrire', () => {
  const fs = creerFsFictif({
    '/exe/config.json': JSON.stringify({ authPassword: 'abc123', port: 4000 })
  });
  const resultat = resoudreConfigExecutable('/exe', fs);

  assert.deepEqual(resultat, { motDePasse: 'abc123', port: 4000, genere: false });
  assert.deepEqual(fs.ecritures, {}); // aucune écriture quand la config existe déjà
});

test('config.json présent sans port : replie sur 3000 par défaut', () => {
  const fs = creerFsFictif({
    '/exe/config.json': JSON.stringify({ authPassword: 'abc123' })
  });
  const resultat = resoudreConfigExecutable('/exe', fs);

  assert.equal(resultat.port, 3000);
});
