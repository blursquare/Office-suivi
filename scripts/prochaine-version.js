// @ts-check
'use strict';

// Donne le numéro de version suivant (0.J.N) et l'heure de Paris, à recopier dans client/00-version.js (VERSION_APP et
// première entrée de HISTORIQUE_VERSIONS : `version` et `date`). Même jour que la dernière entrée : N + 1 ; nouveau jour :
// J + 1 et N = 1. Usage : node scripts/prochaine-version.js
const fs = require('node:fs');
const path = require('node:path');

function prochaineVersion(source, maintenantParis) {
  const m = /^\s+\{ version: '(\d+)\.(\d+)\.(\d+)', date: '(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}'/m.exec(source);
  if (!m) throw new Error('première entrée de HISTORIQUE_VERSIONS illisible');
  const jour = Number(m[2]); const n = Number(m[3]);
  const meme = m[4] === maintenantParis.slice(0, 10);
  return `${m[1]}.${meme ? jour : jour + 1}.${meme ? n + 1 : 1}`;
}

function heureParis(date = new Date()) {
  const p = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const v = (t) => (p.find((x) => x.type === t) || { value: '' }).value;
  return `${v('year')}-${v('month')}-${v('day')} ${v('hour')}:${v('minute')}`;
}

if (require.main === module) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'client', '00-version.js'), 'utf8');
  const maintenant = heureParis();
  console.log(`version: ${prochaineVersion(source, maintenant)}\ndate:    ${maintenant}`);
}

module.exports = { prochaineVersion, heureParis };
