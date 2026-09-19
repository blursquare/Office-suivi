'use strict';

// Scripts assistants créés à côté de CLAIRE-serveur.exe (server/src/scriptsAssistants.js) : le
// lanceur sans fenêtre, l'arrêt, et les deux scripts de démarrage automatique avec la session
// Windows demandés par l'étude. Un faux `fs` en mémoire remplace le disque, comme pour
// resoudreConfigExecutable() : aucun exécutable réel n'est nécessaire.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const S = require('../src/scriptsAssistants');

function fauxFs(existants = {}) {
  const fichiers = { ...existants };
  return {
    fichiers,
    existsSync: (p) => Object.prototype.hasOwnProperty.call(fichiers, p),
    writeFileSync: (p, contenu) => { fichiers[p] = contenu; }
  };
}

const DOSSIER = 'C:\\CLAIRE-serveur';

test('crée les quatre scripts absents et retourne leurs noms', () => {
  const fs = fauxFs();
  const crees = S.assurerScriptsAssistants(DOSSIER, fs);
  assert.equal(crees.join(','), [S.NOM_LANCEUR, S.NOM_ARRET, S.NOM_DEMARRAGE_AUTO, S.NOM_DEMARRAGE_AUTO_RETRAIT].join(','));
  assert.equal(Object.keys(fs.fichiers).length, 4);
});

test('ne réécrit jamais un script déjà présent, même modifié par l\'étude', () => {
  const cheminLanceur = path.join(DOSSIER, S.NOM_LANCEUR);
  const fs = fauxFs({ [cheminLanceur]: "' version modifiee a la main" });
  const crees = S.assurerScriptsAssistants(DOSSIER, fs);
  assert.equal(fs.fichiers[cheminLanceur], "' version modifiee a la main");
  assert.equal(crees.includes(S.NOM_LANCEUR), false);
  assert.equal(crees.length, 3, 'les trois autres sont créés');
});

test('le script de démarrage automatique pose un raccourci vers le lanceur dans le dossier Démarrage', () => {
  const contenu = S.SCRIPTS.find(s => s.nom === S.NOM_DEMARRAGE_AUTO).contenu;
  assert.match(contenu, /SpecialFolders\("Startup"\)/, 'dossier Démarrage de la session (shell:startup)');
  assert.match(contenu, new RegExp(S.NOM_LANCEUR.replace(/[.]/g, '\\.')), 'vise le lanceur sans fenêtre');
  assert.match(contenu, /wscript\.exe/, 'cible wscript.exe, pas l\'association de fichiers du poste');
  assert.match(contenu, /CreateShortcut/);
  assert.match(contenu, new RegExp(S.NOM_RACCOURCI_DEMARRAGE.replace(/[.]/g, '\\.')));
  assert.match(contenu, /If Not oFso\.FileExists\(lanceur\)/, 'refuse de poser un raccourci vers un lanceur absent');
});

test('le script de retrait supprime exactement le même raccourci', () => {
  const contenu = S.SCRIPTS.find(s => s.nom === S.NOM_DEMARRAGE_AUTO_RETRAIT).contenu;
  assert.match(contenu, /SpecialFolders\("Startup"\)/);
  assert.match(contenu, new RegExp(S.NOM_RACCOURCI_DEMARRAGE.replace(/[.]/g, '\\.')));
  assert.match(contenu, /DeleteFile raccourci/);
  assert.doesNotMatch(contenu, /taskkill|CLAIRE-serveur\.exe/, 'ne touche pas au serveur en cours');
});

test('les textes affichés par les deux nouveaux scripts sont sans accent (wscript lit un .vbs en ANSI)', () => {
  for (const nom of [S.NOM_DEMARRAGE_AUTO, S.NOM_DEMARRAGE_AUTO_RETRAIT]) {
    const contenu = S.SCRIPTS.find(s => s.nom === nom).contenu;
    const lignesAffichees = contenu.split('\r\n').filter(l => /MsgBox|Description/.test(l));
    assert.ok(lignesAffichees.length >= 2, nom + ' : au moins un message');
    for (const l of lignesAffichees) assert.doesNotMatch(l, /[^\x00-\x7F]/, nom + ' : ' + l);
  }
});

test('tous les scripts sont en fins de ligne Windows (CRLF)', () => {
  for (const s of S.SCRIPTS) {
    assert.doesNotMatch(s.contenu, /[^\r]\n/, s.nom);
    assert.ok(s.contenu.endsWith('\r\n'), s.nom);
  }
});
