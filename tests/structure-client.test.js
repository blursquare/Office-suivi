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

test('version : numéro MAJEUR.MINEUR.CORRECTIF dans 00-version.js, unique, croissant avec la date', () => {
  const src = fs.readFileSync(path.join(racine, 'client', '00-version.js'), 'utf8');
  const m = src.match(/const VERSION_APP = '(\d+\.\d+\.\d+)'/);
  assert.ok(m, 'VERSION_APP lisible (MAJEUR.MINEUR.CORRECTIF)');
  const entrees = [...src.matchAll(/^\s+\{ version: '(\d+)\.(\d+)\.(\d+)', date: '(\d{4}-\d{2}-\d{2} \d{2}:\d{2})', /gm)]
    .map(x => ({ v: x.slice(1, 4).map(Number), numero: x.slice(1, 4).join('.'), date: x[4] }));
  assert.equal((src.match(/\{ version: '/g) || []).length, entrees.length, 'chaque entrée a un numéro et une date');
  assert.equal(entrees[0].numero, m[1], 'HISTORIQUE_VERSIONS commence par la version courante');
  assert.equal(new Set(entrees.map(e => e.numero)).size, entrees.length, 'numéros uniques');
  const parDate = [...entrees].sort((x, y) => x.date.localeCompare(y.date));
  for (let i = 1; i < parDate.length; i++) {
    const [a, b] = [parDate[i - 1].v, parDate[i].v];
    const suivant = (b[0] === a[0] && b[1] === a[1] && b[2] === a[2] + 1) // correction
      || (b[0] === a[0] && b[1] === a[1] + 1 && b[2] === 0) // nouveauté
      || (b[0] === a[0] + 1 && b[1] === 0 && b[2] === 0); // fin de bêta, puis versions majeures
    assert.ok(suivant, `${parDate[i].numero} (${parDate[i].date}) doit suivre ${parDate[i - 1].numero} (CORRECTIF + 1, ou MINEUR + 1 et CORRECTIF 0)`);
  }
});

test('prochaine-version : correction → CORRECTIF + 1, nouveauté → MINEUR + 1 et CORRECTIF 0', () => {
  const { prochaineVersion } = require('../scripts/prochaine-version');
  const src = "  const HISTORIQUE_VERSIONS = [\n    { version: '0.144.9', date: '2026-10-04 15:39', resume: \"x\" },\n";
  assert.equal(prochaineVersion(src, 'correction'), '0.144.10');
  assert.equal(prochaineVersion(src, 'nouveaute'), '0.145.0');
  assert.throws(() => prochaineVersion(src, ''));
});

test('aucun nom de premier niveau déclaré dans deux fichiers du poste', () => {
  // Deux fichiers qui déclarent la même fonction : le second l'emporte en silence (scripts classiques), ESLint ne le voit
  // plus depuis le découpage. C'est ce test qui tient lieu de no-redeclare entre fichiers.
  const { declarationsClient } = require('../scripts/globaux-client');
  const doublons = [...declarationsClient()].filter(([, fichiers]) => fichiers.length > 1);
  assert.equal(doublons.map(([nom, fichiers]) => nom + ' : ' + fichiers.join(', ')).join('\n'), '');
});

test('le workflow de construction du .exe se déclenche sur client/ (et plus sur script.js)', () => {
  // 04/10 : le filtre de chemins listait encore script.js — un correctif ne touchant que client/ ne reconstruisait rien.
  const wf = fs.readFileSync(path.join(racine, '.github', 'workflows', 'build-exe.yml'), 'utf8');
  const chemins = [...wf.matchAll(/^\s+- '([^']+)'$/gm)].map(m => m[1]);
  for (const c of ['client/**', 'commun/**', 'vendor/**', 'index.html', 'style.css', 'server/**', 'tests/**', 'eslint.config.js', 'package.json', 'scripts/**']) {
    assert.ok(chemins.includes(c), `${c} absent du filtre de chemins du workflow`);
  }
  assert.ok(!chemins.includes('script.js'));
});

test('aucune déclaration de premier niveau du poste qui ne soit citée nulle part (code, HTML, tests)', () => {
  // Remplace no-unused-vars pour le premier niveau (voir eslint.config.js) : un nom déclaré et jamais cité ailleurs — ni
  // dans un autre fichier, ni dans index.html (onclick), ni dans les tests — est du code mort, à retirer.
  const { declarationsClient } = require('../scripts/globaux-client');
  const occurrences = new Map();
  const compter = (texte) => { for (const m of texte.matchAll(/[A-Za-z_$À-ɏ][A-Za-z0-9_$À-ɏ]*/g)) occurrences.set(m[0], (occurrences.get(m[0]) || 0) + 1); };
  for (const f of manifeste) compter(fs.readFileSync(path.join(racine, 'client', f), 'utf8'));
  compter(fs.readFileSync(path.join(racine, 'index.html'), 'utf8'));
  // Le code commun est aussi cité par le serveur ; ses propres fichiers citent leurs exports.
  for (const f of fs.readdirSync(path.join(racine, 'commun'))) if (f.endsWith('.js')) compter(fs.readFileSync(path.join(racine, 'commun', f), 'utf8'));
  for (const f of fs.readdirSync(path.join(racine, 'server', 'src'), { recursive: true })) if (String(f).endsWith('.js')) compter(fs.readFileSync(path.join(racine, 'server', 'src', String(f)), 'utf8'));
  for (const f of fs.readdirSync(__dirname)) if (f.endsWith('.js')) compter(fs.readFileSync(path.join(__dirname, f), 'utf8'));
  const morts = [...declarationsClient()].filter(([nom]) => (occurrences.get(nom) || 0) < 2).map(([nom, fichiers]) => nom + ' (' + fichiers[0] + ')');
  assert.equal(morts.join('\n'), '', 'déclaré mais jamais cité');
});

test('commun/ : manifeste, index.html (avant client/), assets du serveur et du .exe, exports chargés des deux côtés', () => {
  const communs = JSON.parse(fs.readFileSync(path.join(racine, 'commun', 'manifest.json'), 'utf8'));
  const presents = fs.readdirSync(path.join(racine, 'commun')).filter(f => f.endsWith('.js')).sort();
  assert.equal(presents.join('\n'), communs.slice().sort().join('\n'));
  const html = fs.readFileSync(path.join(racine, 'index.html'), 'utf8');
  const tags = [...html.matchAll(/<script src="(commun|client)\/([^"]+)"><\/script>/g)].map(m => m[1] + '/' + m[2]);
  assert.equal(tags.slice(0, communs.length).join('\n'), communs.map(f => 'commun/' + f).join('\n'), 'commun/ chargé en premier, dans l’ordre');
  const { ASSETS_STATIQUES } = require('../server/src/app');
  for (const f of communs) assert.equal(ASSETS_STATIQUES['/commun/' + f].fichier, 'commun/' + f);
  const build = fs.readFileSync(path.join(racine, 'server', 'scripts', 'build-windows-exe.mjs'), 'utf8');
  assert.match(build, /commun', 'manifest\.json'/);
  // Côté Node, chaque fichier exporte ; côté poste (vm), les mêmes noms sont des globaux.
  const { chargerApplication } = require('./helpers/load-app');
  const app = chargerApplication();
  for (const f of communs) for (const nom of Object.keys(require(path.join(racine, 'commun', f)))) assert.ok(nom in app, nom + ' absent du poste');
});

test('Web Awesome : paquet local chargé par index.html, servi et embarqué dans le .exe', () => {
  const index = fs.readFileSync(path.join(racine, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(racine, 'server', 'src', 'app.js'), 'utf8');
  const build = fs.readFileSync(path.join(racine, 'server', 'scripts', 'build-windows-exe.mjs'), 'utf8');
  for (const f of ['vendor/web-awesome/web-awesome.js', 'vendor/web-awesome/web-awesome-theme.css']) {
    assert.ok(fs.existsSync(path.join(racine, f)), f + ' présent');
    assert.ok(index.includes(`"${f}"`), f + ' chargé par index.html');
    assert.ok(app.includes(`'/${f}'`), f + ' dans ASSETS_STATIQUES');
    assert.ok(build.includes(`'${f}': '../${f}'`), f + ' dans les assets du .exe');
  }
  // Aucun composant chargé depuis Internet (contrainte n° 1) : pas de CDN Web Awesome dans la page.
  assert.ok(!/webawesome\.com|ka-f\.fontawesome/.test(index), 'pas de CDN Web Awesome');
});

test('Web Awesome : boutons d’action en <wa-button>, jamais en <button class="primary|secondary|btn-…">', () => {
  const fichiers = ['index.html', ...manifeste.map((f) => path.join('client', f))];
  const fautes = [];
  for (const f of fichiers) {
    const src = fs.readFileSync(path.join(racine, f), 'utf8');
    for (const m of src.matchAll(/<button\b[^>]*class="([^"]*)"/g)) {
      if (/(^|[\s'])(primary|secondary|btn-annuler|btn-confirmer)($|[\s'])/.test(m[1])) fautes.push(`${f} : ${m[0].slice(0, 90)}`);
    }
    const ouverts = (src.match(/<wa-button\b/g) || []).length, fermes = (src.match(/<\/wa-button>/g) || []).length;
    if (ouverts !== fermes) fautes.push(`${f} : ${ouverts} <wa-button> pour ${fermes} </wa-button>`);
  }
  assert.equal(fautes.length, 0, fautes.join('\n'));
});
