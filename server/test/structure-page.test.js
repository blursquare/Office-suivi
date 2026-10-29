'use strict';

// Structure d'une page du navigateur de CLAIRE (étude 29/10 : « Claude en secours ») : aucune valeur, aucun nom ne sort ; seuls les libellés d'écran
// du vocabulaire fermé sont cités.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { texteSur, texteStructure, SCRIPT_STRUCTURE_PAGE } = require('../src/navigateur/structurePage');

test('un libellé d’écran est cité, tout autre texte est réduit à sa longueur', () => {
  assert.equal(texteSur('Naissance'), 'Naissance');
  assert.equal(texteSur('Décès'), 'Décès');
  assert.match(texteSur('Mme DURAND Claire épouse de M. LEROY Marc'), /^«\d+ car\.»$/);
  assert.equal(texteSur(''), '');
});

test('la structure ne contient ni nom, ni adresse, ni valeur de champ', () => {
  const t = texteStructure({ url: '/dossier/4821234/page', titre: 'Dossier DURAND / LEROY', vue: '1280x800', defilement: 120, elements: [
    { tag: 'div', id: 't:ligne', cls: 'ui-selectcheckboxmenu', role: '', type: '', texte: 'Mme DURAND Claire', aria: 'Adresse 12 rue des Tanneurs', titre: 'M. LEROY Marc', coche: '', x: 10, y: 20, l: 100, h: 20, couvert: false },
    { tag: 'li', id: '', cls: '', role: 'option', type: '', texte: 'Mariage', aria: '', titre: '', coche: 'true', x: 5, y: 50, l: 80, h: 18, couvert: true }
  ] });
  assert.doesNotMatch(t, /DURAND|LEROY|Claire|Tanneurs|4821234/);
  assert.match(t, /texte=Mariage/);
  assert.match(t, /RECOUVERT/);
  assert.match(t, /coché=true/);
  assert.equal(texteStructure(null), '');
});

test('le script de relevé est une expression valide qui ne lit aucune valeur de champ', () => {
  assert.doesNotThrow(() => new Function('return ' + SCRIPT_STRUCTURE_PAGE));
  assert.doesNotMatch(SCRIPT_STRUCTURE_PAGE, /\.value\b|innerText|textContent\s*\)?\s*;?\s*\}/);
});
