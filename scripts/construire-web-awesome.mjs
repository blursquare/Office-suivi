// Construit vendor/web-awesome/ (étude, 04/10 : composants Web Awesome pour l'uniformité de l'interface) : un seul fichier
// JavaScript regroupant les composants utilisés par CLAIRE, et la feuille de jetons du thème par défaut. Rien n'est chargé
// depuis Internet : les deux fichiers sont servis par le serveur et embarqués dans le .exe (ASSETS_STATIQUES et assets de
// build-windows-exe.mjs). Les couleurs, arrondis et polices viennent de CLAIRE : couche « Web Awesome » de style.css.
//
// À relancer seulement pour changer de version ou ajouter un composant (le résultat est versionné dans le dépôt) :
//   npm i --no-save @awesome.me/webawesome@3.14.0 esbuild && node scripts/construire-web-awesome.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const VERSION = '3.14.0';
/** Composants embarqués : un nom de dossier de dist/components par composant. Ajouter ici, puis relancer. */
export const COMPOSANTS = ['button', 'switch', 'button-group'];

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(racine, 'package.json'));
const paquet = path.dirname(require.resolve('@awesome.me/webawesome/package.json'));
const version = JSON.parse(fs.readFileSync(path.join(paquet, 'package.json'), 'utf8')).version;
if (version !== VERSION) throw new Error(`Web Awesome ${version} installé, ${VERSION} attendu`);

const sortie = path.join(racine, 'vendor', 'web-awesome');
fs.mkdirSync(sortie, { recursive: true });
// La bibliothèque d'icônes par défaut (Font Awesome) se télécharge depuis Internet : elle est remplacée par une
// bibliothèque vide (contrainte n° 1 de CLAUDE.md). Les icônes internes des composants (bibliothèque « system », SVG
// embarqués) restent ; les icônes de CLAIRE sont celles du jeu ICONES, jamais <wa-icon name="…">.
const entree = [
  "import { registerIconLibrary } from '@awesome.me/webawesome/dist/components/icon/library.js';",
  "registerIconLibrary('default', { resolver: () => '' });",
  ...COMPOSANTS.map((c) => `import '@awesome.me/webawesome/dist/components/${c}/${c}.js';`)
].join('\n');
await build({
  stdin: { contents: entree, resolveDir: racine, loader: 'js' },
  bundle: true, format: 'esm', minify: true, target: 'chrome110', legalComments: 'eof',
  outfile: path.join(sortie, 'web-awesome.js'),
  banner: { js: `/* Web Awesome ${VERSION} (MIT) — composants : ${COMPOSANTS.join(', ')}. Construit par scripts/construire-web-awesome.mjs, ne pas modifier à la main. */` }
});
// Les @import relatifs de la feuille de thème sont résolus ici (un seul fichier servi, aucun 404 dans le .exe).
const aplatir = (fichier) => fs.readFileSync(fichier, 'utf8').replace(/@import url\('([^']+)'\);?/g,
  (_, rel) => aplatir(path.join(path.dirname(fichier), rel)));
const theme = aplatir(path.join(paquet, 'dist', 'styles', 'themes', 'default.css'));
fs.writeFileSync(path.join(sortie, 'web-awesome-theme.css'), `/* Web Awesome ${VERSION} (MIT) — thème par défaut, jetons --wa-*. Surchargés par la couche « Web Awesome » de style.css. Ne pas modifier à la main. */\n${theme}`);
fs.copyFileSync(path.join(paquet, 'LICENSE.md'), path.join(sortie, 'LICENSE.md'));
for (const f of fs.readdirSync(sortie)) console.log(f, Math.round(fs.statSync(path.join(sortie, f)).size / 1024) + ' Ko');
