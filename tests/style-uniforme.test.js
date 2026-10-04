'use strict';
// Uniformité de l'interface (étude, 04/10) : toute taille de texte, tout arrondi, toute ombre et tout espacement de
// style.css suivent l'échelle commune (jetons --texte-*, --rayon-*, --shadow-* ; espacements de scripts/style-echelle.js),
// et aucune couleur n'est écrite en dur hors des blocs de jetons. Impression et zones « @papier » exceptées.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { declarationsCss, ecartEchelle, TEXTES, RAYONS } = require('../scripts/style-echelle');

const racine = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(racine, 'style.css'), 'utf8');

test('style.css : aucune valeur hors de l\'échelle commune', () => {
  const ecarts = declarationsCss(css).map((d) => [d, ecartEchelle(d)]).filter(([, m]) => m)
    .map(([d, m]) => `ligne ${d.ligne} (${d.selecteur.slice(0, 60)}) : ${m}`);
  assert.equal(ecarts.length, 0, '\n' + ecarts.slice(0, 30).join('\n'));
});

test('style.css : les jetons de l\'échelle sont déclarés, avec les valeurs de scripts/style-echelle.js', () => {
  for (const [nom, px] of Object.entries(TEXTES)) assert.match(css, new RegExp(`--texte-${nom}: ${px}px;`), `--texte-${nom}`);
  for (const [nom, px] of Object.entries(RAYONS)) assert.match(css, new RegExp(`--rayon-${nom}: ${px}px;`), `--rayon-${nom}`);
  assert.match(css, /--shadow-card:/); assert.match(css, /--shadow-float:/);
  // Un jeton cité doit exister : une faute de frappe (var(--texte-md)) rendrait la taille du parent sans prévenir.
  const declares = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const cites = [...css.matchAll(/var\((--(?:texte|rayon|shadow)-[a-z0-9-]+)/g)].map((m) => m[1]);
  const inconnus = [...new Set(cites.filter((c) => !declares.has(c)))];
  assert.equal(inconnus.length, 0, 'jetons cités mais jamais déclarés : ' + inconnus.join(', '));
});

test('lecteur de style : zones exemptées et écarts reconnus', () => {
  const exemple = [
    ':root { --x: #FFFFFF; }',
    '.a { font-size: 13px; border-radius: 8px; padding: 7px; color: #123456; box-shadow: 0 6px 24px rgba(0,0,0,.1); }',
    '.b { font-size: var(--texte-m); border-radius: var(--rayon-m) 0 0 50%; padding: 6px 12px; box-shadow: var(--shadow-card), 0 0 0 1px var(--line); }',
    '@media print { .c { font-size: 11pt; color: #000; } }',
    '/* @papier */ .d { font-size: 10.5px; color: #26201a; } /* @fin-papier */',
    '.e { --jeton-local: #14161A; font: italic 700 10.5px/1 serif; margin: -3px 0 72px; }'
  ].join('\n');
  const messages = declarationsCss(exemple).map((d) => `${d.selecteur}|${d.propriete}|${ecartEchelle(d) ? 'écart' : 'ok'}`);
  assert.deepEqual(messages.filter((m) => m.endsWith('écart')).map((m) => m.split('|').slice(0, 2).join(' ')),
    ['.a font-size', '.a border-radius', '.a padding', '.a color', '.a box-shadow', '.e font', '.e margin']);
});

test('écrans : pas de taille de texte ni d\'arrondi en px écrits dans le code (emails exceptés)', () => {
  const dossier = path.join(racine, 'client');
  const fautes = [];
  for (const f of fs.readdirSync(dossier).filter((x) => x.endsWith('.js') && x !== '28-preparation-emails.js')) {
    const src = fs.readFileSync(path.join(dossier, f), 'utf8');
    for (const m of src.matchAll(/style="[^"]*\b(font-size|border-radius)\s*:\s*[0-9.]+px/g)) fautes.push(`${f} : ${m[0].slice(0, 80)}`);
  }
  assert.equal(fautes.length, 0, fautes.join('\n'));
});
