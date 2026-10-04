// @ts-check
'use strict';

// Donne le numéro de version suivant (MAJEUR.MINEUR.CORRECTIF) et l'heure de Paris, à recopier dans client/00-version.js
// (VERSION_APP et première entrée de HISTORIQUE_VERSIONS : `version` et `date`). Nouveauté visible par l'étude : MINEUR + 1,
// CORRECTIF = 0 ; correction : CORRECTIF + 1. Le MAJEUR passe à 1 le jour où l'étude déclare la bêta terminée (à la main).
// Usage : node scripts/prochaine-version.js nouveaute|correction
const fs = require('node:fs');
const path = require('node:path');

function prochaineVersion(source, type) {
  const m = /^\s+\{ version: '(\d+)\.(\d+)\.(\d+)', date: '\d{4}-\d{2}-\d{2} \d{2}:\d{2}'/m.exec(source);
  if (!m) throw new Error('première entrée de HISTORIQUE_VERSIONS illisible');
  if (type === 'nouveaute') return `${m[1]}.${Number(m[2]) + 1}.0`;
  if (type === 'correction') return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
  throw new Error('type attendu : nouveaute ou correction');
}

function heureParis(date = new Date()) {
  const p = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const v = (t) => (p.find((x) => x.type === t) || { value: '' }).value;
  return `${v('year')}-${v('month')}-${v('day')} ${v('hour')}:${v('minute')}`;
}

if (require.main === module) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'client', '00-version.js'), 'utf8');
  const type = process.argv[2];
  if (type !== 'nouveaute' && type !== 'correction') {
    console.error('Usage : node scripts/prochaine-version.js nouveaute|correction\n'
      + '  nouveaute  = geste, écran, information ou règle métier que l’étude n’avait pas\n'
      + '  correction = correction, ajustement, présentation, libellé, lecture améliorée, code interne');
    process.exit(1);
  }
  console.log(`version: ${prochaineVersion(source, type)}\ndate:    ${heureParis()}`);
}

module.exports = { prochaineVersion, heureParis };
