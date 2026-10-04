'use strict';
// Règles de code de CLAIRE (étude, 04/10) : `npm run lint` à la racine, aussi lancé par la construction du .exe.
// Objectif : attraper les erreurs réelles (variable inconnue, redéclaration, code inatteignable, promesse oubliée),
// pas le style. Les règles de style restent celles du fichier voisin.
const js = require('@eslint/js');
const globals = require('globals');
// Les fichiers de client/ partagent leur portée (scripts classiques) : les noms déclarés dans l'un sont des globaux pour
// les autres — relevés à chaque lint (scripts/globaux-client.js), jamais une liste écrite à la main.
const { globauxClient } = require('./scripts/globaux-client');

const GLOBAUX_CLIENT = {
  ...globals.browser,
  pdfjsLib: 'readonly', Tesseract: 'readonly', docxtemplater: 'readonly', PizZip: 'readonly', docx: 'readonly',
  QUESTIONNAIRE_SATISFACTION_PDF_BASE64: 'readonly', APPEL_DE_FONDS_MODELE_BASE64: 'readonly',
  ...globauxClient()
};

module.exports = [
  { ignores: ['node_modules/**', 'server/node_modules/**', 'server/build/**', 'scratchpad/**', 'appel-de-fonds-modele.js', 'questionnaire-satisfaction-pdf.js', 'docs/**', 'page-sondage/**', 'extension-firefox/**'] },
  js.configs.recommended,
  { files: ['eslint.config.js'], languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } } },
  {
    files: ['client/**/*.js', 'sw.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: GLOBAUX_CLIENT }
  },
  {
    files: ['server/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } }
  },
  {
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
      'no-misleading-character-class': 'off',
      'no-inner-declarations': 'off',
      'no-cond-assign': ['error', 'except-parens'],
      // Les globaux du poste sont ses propres déclarations : les redéclarer dans leur fichier d'origine est normal. Le
      // doublon entre deux fichiers est refusé par tests/structure-client.test.js.
      'no-redeclare': ['error', { builtinGlobals: false }],
      // Les textes français portent des espaces insécables (« » : ») dans les gabarits et les regex : voulus.
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipRegExps: true, skipComments: true }],
      // `let x = ''; try { x = … } catch { x = '' }` : lisible, pas une erreur.
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'off'
    }
  }
];
