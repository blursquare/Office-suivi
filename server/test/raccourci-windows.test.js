'use strict';
// Raccourci du menu Démarrer pour l'icône de la fenêtre CLAIRE (voir src/raccourciWindows.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const r = require('../src/raccourciWindows');

test('appUserModelIdFenetreApp : identifiant de la fenêtre --app de Chrome, profil ClaireServeur', () => {
  // Composants « Chrome », « localhost_/ », « UserData.ClaireServeur » (22 > 20 caractères :
  // raccourci au milieu comme ShellUtil::BuildAppUserModelId).
  assert.equal(r.appUserModelIdFenetreApp({ baseAppId: 'Chrome', url: 'http://localhost:3000/', dossierDonnees: 'User Data', profil: 'ClaireServeur' }),
    'Chrome.localhost_/.UserData.CireServeur');
  // Le port ne compte pas (hôte seul) ; profil par défaut : pas de composant profil.
  assert.equal(r.appUserModelIdFenetreApp({ baseAppId: 'Chrome', url: 'http://localhost:8080/', dossierDonnees: 'User Data', profil: 'Default' }),
    'Chrome.localhost_/');
  assert.equal(r.baseAppIdNavigateur('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'), 'MSEdge');
  assert.equal(r.baseAppIdNavigateur('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'), 'Chrome');
});

test('construireAppUserModelId : 64 caractères au plus, espaces remplacés', () => {
  const id = r.construireAppUserModelId(['Chrome', 'x'.repeat(40), 'a b']);
  assert.ok(id.length <= 64);
  assert.ok(!id.includes(' '));
});

test('scriptPowerShellRaccourci : valeurs entre apostrophes, apostrophe doublée', () => {
  const s = r.scriptPowerShellRaccourci({ chemin: "C:\\Users\\d'Étude\\CLAIRE.lnk", cible: 'chrome.exe', argumentsLigne: '--app="http://localhost:3000/"',
    icone: 'C:\\CLAIRE\\CLAIRE-serveur.exe', aumid: 'Chrome.localhost_/.UserData.CireServeur', description: 'CLAIRE' });
  assert.match(s, /\[ClaireRaccourci\]::Creer\('C:\\Users\\d''Étude\\CLAIRE\.lnk', 'chrome\.exe', '--app="http:\/\/localhost:3000\/"'/);
  assert.match(s, /9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3/); // PKEY_AppUserModel_ID
});
