'use strict';

// Le code du poste est découpé en fichiers (client/, 04/10) : cette structure tient par UNE liste, client/manifest.json.
// Ce test garantit que les quatre endroits qui en dépendent restent alignés (chargement par index.html, assets servis
// par le serveur, assets embarqués dans le .exe, chargeur des tests) et qu'aucun fichier ne regrossit sans limite.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..');
const manifeste = JSON.parse(fs.readFileSync(path.join(racine, 'client', 'manifest.json'), 'utf8'));
const LIGNES_MAX = 3000;

test('manifeste : fichiers présents, nommés et ordonnés, taille bornée', () => {
  assert.ok(manifeste.length > 10);
  assert.equal(manifeste[0], '00-version.js', 'la version reste dans le premier fichier (relu par surveillerVersionServeur)');
  const presents = fs.readdirSync(path.join(racine, 'client')).filter(f => f.endsWith('.js')).sort();
  assert.equal(presents.join('\n'), manifeste.slice().sort().join('\n'), 'tout fichier de client/ est dans le manifeste, et réciproquement');
  manifeste.forEach((f, i) => assert.match(f, new RegExp(`^${String(i).padStart(2, '0')}-[a-z0-9-]+\\.js$`), `${f} : préfixe d’ordre et nom en minuscules`));
  for (const f of manifeste) {
    const n = fs.readFileSync(path.join(racine, 'client', f), 'utf8').split('\n').length;
    assert.ok(n <= LIGNES_MAX, `${f} fait ${n} lignes (plus de ${LIGNES_MAX}) : à découper`);
  }
});

test('index.html charge exactement les fichiers du manifeste, dans l’ordre', () => {
  const html = fs.readFileSync(path.join(racine, 'index.html'), 'utf8');
  const tags = [...html.matchAll(/<script src="client\/([^"]+)"><\/script>/g)].map(m => m[1]);
  assert.equal(tags.join('\n'), manifeste.join('\n'));
  assert.doesNotMatch(html, /src="script\.js"/);
});

test('serveur et .exe : chaque fichier du manifeste est servi et embarqué', () => {
  const { ASSETS_STATIQUES } = require('../server/src/app');
  for (const f of manifeste) assert.equal(ASSETS_STATIQUES['/client/' + f].fichier, 'client/' + f);
  const build = fs.readFileSync(path.join(racine, 'server', 'scripts', 'build-windows-exe.mjs'), 'utf8');
  assert.match(build, /client', 'manifest\.json'/, 'les assets du .exe lisent le manifeste');
});

test('version : VERSION_APP dans 00-version.js, à l’heure de Paris', () => {
  const src = fs.readFileSync(path.join(racine, 'client', '00-version.js'), 'utf8');
  const m = src.match(/const VERSION_APP = '(\d{4}-\d{2}-\d{2} \d{2}:\d{2})'/);
  assert.ok(m, 'VERSION_APP lisible');
  assert.match(src, new RegExp(`version: '${m[1]}'`), 'HISTORIQUE_VERSIONS commence par la version courante');
});

test('aucun nom de premier niveau déclaré dans deux fichiers du poste', () => {
  // Deux fichiers qui déclarent la même fonction : le second l'emporte en silence (scripts classiques), ESLint ne le voit
  // plus depuis le découpage. C'est ce test qui tient lieu de no-redeclare entre fichiers.
  const { declarationsClient } = require('../scripts/globaux-client');
  const doublons = [...declarationsClient()].filter(([, fichiers]) => fichiers.length > 1);
  assert.equal(doublons.map(([nom, fichiers]) => nom + ' : ' + fichiers.join(', ')).join('\n'), '');
});
