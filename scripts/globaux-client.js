'use strict';

// Noms déclarés au premier niveau de chaque fichier de client/ (fonctions, classes, var/let/const). Le poste est fait de
// <script> classiques qui partagent leur portée : une fonction de 05-… est visible dans 30-…. ESLint lit un fichier à la
// fois, il faut donc lui dire ces noms (globaux « writable » dans eslint.config.js) ; le test structure-client s'en sert
// pour refuser un nom déclaré dans deux fichiers (ce que no-redeclare ne voit plus à travers les fichiers).
const fs = require('node:fs');
const path = require('node:path');
const espree = require('espree');

const RACINE_CLIENT = path.join(__dirname, '..', 'client');

function nomsDeclaration(noeud) {
  if (noeud.type === 'FunctionDeclaration' || noeud.type === 'ClassDeclaration') return noeud.id ? [noeud.id.name] : [];
  if (noeud.type !== 'VariableDeclaration') return [];
  const noms = [];
  const motif = (cible) => {
    if (!cible) return;
    if (cible.type === 'Identifier') noms.push(cible.name);
    else if (cible.type === 'ObjectPattern') cible.properties.forEach((p) => motif(p.value || p.argument));
    else if (cible.type === 'ArrayPattern') cible.elements.forEach(motif);
    else if (cible.type === 'AssignmentPattern') motif(cible.left);
    else if (cible.type === 'RestElement') motif(cible.argument);
  };
  noeud.declarations.forEach((d) => motif(d.id));
  return noms;
}

// → Map nom → [fichiers qui le déclarent], dans l'ordre du manifeste.
function declarationsClient(racine = RACINE_CLIENT) {
  const manifeste = JSON.parse(fs.readFileSync(path.join(racine, 'manifest.json'), 'utf8'));
  const parNom = new Map();
  for (const fichier of manifeste) {
    const source = fs.readFileSync(path.join(racine, fichier), 'utf8');
    const ast = espree.parse(source, { ecmaVersion: 2023, sourceType: 'script' });
    for (const noeud of ast.body) {
      for (const nom of nomsDeclaration(noeud)) {
        if (!parNom.has(nom)) parNom.set(nom, []);
        parNom.get(nom).push(fichier);
      }
    }
  }
  return parNom;
}

function globauxClient(racine) {
  const globaux = {};
  for (const nom of declarationsClient(racine).keys()) globaux[nom] = 'writable';
  return globaux;
}

module.exports = { declarationsClient, globauxClient, nomsDeclaration };
