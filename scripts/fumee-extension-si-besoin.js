#!/usr/bin/env node
// @ts-check
'use strict';
// Le faux guichet de l'extension Chrome (tests/fumee/extension-gnau.mjs, ≈ 10 min) ne tourne que si l'extension ou ce dont elle
// dépend a changé (étude 18/10 : « ne retest pas le guichet à chaque fois si on ne travaille pas sur l'extension Chrome »).
// Changements regardés : par rapport à origin/main (modifications non commitées et fichiers nouveaux compris) ; sur GitHub, la
// construction de main compare au commit d'avant l'envoi (`before` de l'événement). Changements illisibles → le test tourne.
// `--forcer` ou CLAIRE_FUMEE_EXTENSION=1 : toujours.

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const MOTIF_EXTENSION = /^(extension-chrome\/|tests\/fumee\/(extension-gnau|gnau-agglopolys)|server\/src\/(gnau|carnetConfreres|routes\/gnau)\.js|commun\/(constitution|dossier|donnees-dossier)\.js|package(-lock)?\.json)/;

/** Pure : un des chemins concerne-t-il l'extension ? @param {string[]} chemins */
function extensionConcernee(chemins) { return chemins.some((c) => MOTIF_EXTENSION.test(String(c).trim())); }

function git(args) { return execFileSync('git', ['-c', 'core.quotepath=off', ...args], { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }

/** Les chemins changés, ou null s'ils ne peuvent pas être lus. */
function cheminsChanges() {
  try {
    let base = 'origin/main';
    const evenement = process.env.GITHUB_EVENT_PATH;
    if (process.env.GITHUB_REF === 'refs/heads/main' && evenement && fs.existsSync(evenement)) {
      const avant = JSON.parse(fs.readFileSync(evenement, 'utf8')).before;
      if (!avant || /^0+$/.test(avant)) return null;
      base = avant;
    }
    git(['rev-parse', '--verify', base + '^{commit}']);
    const suivis = git(['diff', '--name-only', '--no-renames', base]).split('\n');
    const nouveaux = git(['ls-files', '--others', '--exclude-standard']).split('\n');
    return [...suivis, ...nouveaux].filter(Boolean);
  } catch (e) { return null; }
}

if (require.main === module) {
  const forcer = process.argv.includes('--forcer') || process.env.CLAIRE_FUMEE_EXTENSION === '1';
  const chemins = forcer ? null : cheminsChanges();
  if (!forcer && chemins && !extensionConcernee(chemins)) {
    console.log('Extension GNAU : rien de changé côté extension, faux guichet sauté (--forcer pour le jouer).');
    process.exit(0);
  }
  const r = spawnSync(process.execPath, [path.join(RACINE, 'tests', 'fumee', 'extension-gnau.mjs')], { stdio: 'inherit', cwd: RACINE });
  process.exit(r.status === null ? 1 : r.status);
}

module.exports = { extensionConcernee, MOTIF_EXTENSION };
