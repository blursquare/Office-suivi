'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { resoudreCheminNavigateurApp } = require('../src/navigateurApp');

test('resoudreCheminNavigateurApp : trouve Chrome dans ProgramFiles', () => {
  const env = { 'ProgramFiles': 'C:\\Program Files' };
  const cheminChrome = path.join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');
  const chemin = resoudreCheminNavigateurApp(env, (p) => p === cheminChrome);
  assert.equal(chemin, cheminChrome);
});

test('resoudreCheminNavigateurApp : Chrome absent, se rabat sur Edge', () => {
  const env = { 'ProgramFiles': 'C:\\Program Files' };
  const cheminEdge = path.join('C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  const chemin = resoudreCheminNavigateurApp(env, (p) => p === cheminEdge);
  assert.equal(chemin, cheminEdge);
});

test('resoudreCheminNavigateurApp : Chrome dans ProgramFiles (x86) si absent du 64 bits', () => {
  const env = { 'ProgramFiles': 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' };
  const cheminChrome86 = path.join('C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe');
  const chemin = resoudreCheminNavigateurApp(env, (p) => p === cheminChrome86);
  assert.equal(chemin, cheminChrome86);
});

test('resoudreCheminNavigateurApp : Chrome installé pour l\'utilisateur seul (LocalAppData)', () => {
  const env = { 'LocalAppData': 'C:\\Users\\etude\\AppData\\Local' };
  const cheminChromeUser = path.join('C:\\Users\\etude\\AppData\\Local', 'Google', 'Chrome', 'Application', 'chrome.exe');
  const chemin = resoudreCheminNavigateurApp(env, (p) => p === cheminChromeUser);
  assert.equal(chemin, cheminChromeUser);
});

test('resoudreCheminNavigateurApp : ni Chrome ni Edge trouvé nulle part -> null', () => {
  const env = { 'ProgramFiles': 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', 'LocalAppData': 'C:\\Users\\etude\\AppData\\Local' };
  const chemin = resoudreCheminNavigateurApp(env, () => false);
  assert.equal(chemin, null);
});

test('resoudreCheminNavigateurApp : préfère Chrome à Edge si les deux sont présents', () => {
  const env = { 'ProgramFiles': 'C:\\Program Files' };
  const chemin = resoudreCheminNavigateurApp(env, () => true);
  assert.match(chemin, /chrome\.exe$/);
});

const { idApplicationWeb, dossierProfilNavigateur, argumentFenetreApp } = require('../src/navigateurApp');

test('idApplicationWeb : 32 lettres a-p, stable pour un même identifiant de manifeste', () => {
  const id = idApplicationWeb('http://localhost:3000/');
  assert.match(id, /^[a-p]{32}$/);
  assert.equal(id, idApplicationWeb('http://localhost:3000/'));
  assert.notEqual(id, idApplicationWeb('http://localhost:3001/'));
});

test('argumentFenetreApp : application installée dans le profil → --app-id, sinon --app=<url>', () => {
  const env = { 'LocalAppData': 'C:\\Users\\etude\\AppData\\Local' };
  const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const url = 'http://localhost:3000/';
  const id = idApplicationWeb('http://localhost:3000/');
  const dossier = 'C:\\Users\\etude\\AppData\\Local\\Google\\Chrome\\User Data\\ClaireServeur\\Web Applications\\Manifest Resources\\' + id;
  assert.equal(argumentFenetreApp(url, chrome, env, (p) => p === dossier, 'ClaireServeur'), `--app-id=${id}`);
  assert.equal(argumentFenetreApp(url, chrome, env, () => false, 'ClaireServeur'), `--app="${url}"`);
  assert.equal(dossierProfilNavigateur('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', env, 'ClaireServeur'),
    'C:\\Users\\etude\\AppData\\Local\\Microsoft\\Edge\\User Data\\ClaireServeur');
});
