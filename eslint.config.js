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
  { ignores: ['node_modules/**', 'server/node_modules/**', 'server/build/**', 'scratchpad/**', 'appel-de-fonds-modele.js', 'questionnaire-satisfaction-pdf.js', 'docs/**', 'page-sondage/**', 'extension-firefox/**', 'extension-chrome/**', 'vendor/**'] },
  js.configs.recommended,
  { files: ['eslint.config.js'], languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } } },
  {
    // commun/ : scripts classiques qui tournent dans le navigateur ET sous Node (module/require/globalThis).
    files: ['commun/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser, ...globals.node } }
  },
  {
    files: ['client/**/*.js', 'sw.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: GLOBAUX_CLIENT }
  },
  {
    files: ['server/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } }
  },
  {
    // Le test de fumée écrit du code exécuté dans la page (page.evaluate) : globaux du navigateur et du poste.
    files: ['tests/fumee/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...GLOBAUX_CLIENT } }
  },
  {
    files: ['**/*.mjs'], ignores: ['tests/fumee/**'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } }
  },
  {
    rules: {
      // ignoreRestSiblings : `const { secret, ...reste } = x` omet un champ à dessein.
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
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
      // `let x = ''; try { x = … } catch { x = '' }` : motif voulu (valeur sûre quoi qu'il arrive), la règle n'a relevé
      // que lui sur tout le code (04/10) : coupée.
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off'
    }
  },
  {
    // Une fonction de premier niveau du poste est presque toujours appelée depuis le HTML (onclick) ou un autre fichier :
    // ESLint ne peut pas le voir. Le code mort de premier niveau est refusé par tests/structure-client.test.js (nom jamais
    // cité dans le code, le HTML ni les tests) ; ici, seules les variables locales jamais lues. Ce bloc vient en dernier
    // pour l'emporter sur les règles générales.
    files: ['client/**/*.js'],
    rules: { 'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true }] }
  }
];
