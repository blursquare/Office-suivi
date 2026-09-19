// Scripts assistants créés à côté de CLAIRE-serveur.exe au premier démarrage en mode exécutable
// autonome (jamais en `npm start`, où la console est le terminal de qui a lancé la commande).
//
// Signalé par l'étude : fermer la fenêtre de console (en pensant qu'elle ne sert à rien) arrête le
// serveur pour tout le monde — confondu un temps avec un plantage. Plutôt que d'exiger de ne
// jamais la fermer, on fournit de quoi ne plus jamais avoir besoin de la voir :
// - `Lancer-CLAIRE-en-arriere-plan.vbs` relance CLAIRE-serveur.exe sans aucune fenêtre visible
//   (`WScript.Shell.Run(..., 0, False)`) — à utiliser au quotidien à la place d'un double-clic
//   direct sur l'exe.
// - `Arreter-CLAIRE.bat` arrête proprement ce processus caché (via son PID, écrit dans
//   `server.pid` à chaque démarrage par index.js) : sans fenêtre visible, il n'existe sinon plus
//   aucun moyen d'arrêter le serveur autrement que par le Gestionnaire des tâches.
// - `Demarrer-CLAIRE-avec-Windows.vbs` / `Ne-plus-demarrer-CLAIRE-avec-Windows.vbs` (demandé par
//   l'étude : « lorsque le PC se lance, ouvrir automatiquement le serveur et le logiciel avec le
//   fichier vbs ») posent/retirent un raccourci vers le lanceur ci-dessus dans le dossier
//   « Démarrage » de la session Windows de l'utilisateur (`shell:startup`). À l'ouverture de
//   session, le serveur repart caché et ouvre lui-même la fenêtre du logiciel (index.js,
//   `ouvrirNavigateur`) — les deux gestes que l'étude faisait à la main chaque matin. C'est un
//   démarrage AVEC LA SESSION (après la saisie du mot de passe Windows), pas un service système :
//   pour un serveur qui tourne avant toute ouverture de session ou qui se relance seul après un
//   plantage, voir les scripts NSSM (server/scripts/, README « Service Windows ») — les deux ne
//   doivent pas être installés en même temps, le second lancement échouerait sur le port occupé.
//
// Aucun script n'est jamais écrasé s'il existe déjà, pour ne pas effacer une modification faite
// par l'étude. Les textes affichés par les nouveaux scripts (`MsgBox`) sont écrits SANS accent :
// wscript lit un .vbs en ANSI, un « é » encodé en UTF-8 s'y afficherait en deux caractères
// parasites (les commentaires, jamais affichés, n'ont pas cette contrainte).
//
// Fonction pure (dossier + `fs` injectables), testable sans exécutable réel — même principe que
// `resoudreConfigExecutable()` dans config.js.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const NOM_LANCEUR = 'Lancer-CLAIRE-en-arriere-plan.vbs';
const NOM_ARRET = 'Arreter-CLAIRE.bat';
const NOM_DEMARRAGE_AUTO = 'Demarrer-CLAIRE-avec-Windows.vbs';
const NOM_DEMARRAGE_AUTO_RETRAIT = 'Ne-plus-demarrer-CLAIRE-avec-Windows.vbs';
// Nom du raccourci posé dans le dossier Démarrage : le même pour l'installation et le retrait.
const NOM_RACCOURCI_DEMARRAGE = 'CLAIRE-serveur.lnk';

const CRLF = '\r\n';

const CONTENU_LANCEUR = [
  "' Lance le serveur CLAIRE sans afficher de fenêtre — à utiliser au quotidien plutôt que",
  "' de double-cliquer directement sur CLAIRE-serveur.exe (dont la fenêtre, si fermée par",
  "' erreur, arrête le serveur pour tout le monde). Pour arrêter le serveur ensuite, utiliser",
  "' Arreter-CLAIRE.bat, pas le Gestionnaire des tâches.",
  'Set oFso = CreateObject("Scripting.FileSystemObject")',
  'Set oShell = CreateObject("WScript.Shell")',
  'oShell.CurrentDirectory = oFso.GetParentFolderName(WScript.ScriptFullName)',
  'oShell.Run """CLAIRE-serveur.exe""", 0, False'
].join(CRLF) + CRLF;

const CONTENU_ARRET = [
  '@echo off',
  'chcp 65001 >nul',
  'if not exist server.pid (',
  "  echo Aucun serveur CLAIRE ne semble en cours d'execution ^(fichier server.pid absent^).",
  '  pause',
  '  exit /b',
  ')',
  'set /p PID=<server.pid',
  'taskkill /PID %PID% /F >nul 2>&1',
  'del server.pid >nul 2>&1',
  'echo Serveur CLAIRE arrete.',
  'pause'
].join(CRLF) + CRLF;

// Le raccourci vise wscript.exe avec le chemin du lanceur en argument, plutôt que le .vbs
// lui-même : un .lnk vers un script dépend de l'association de fichiers du poste, alors que
// wscript.exe (dans System32, `GetSpecialFolder(1)`) existe sur tout Windows. Le lanceur pose
// lui-même son dossier courant (voir CONTENU_LANCEUR), le raccourci n'a rien d'autre à savoir.
const CONTENU_DEMARRAGE_AUTO = [
  "' Fait demarrer CLAIRE automatiquement a l'ouverture de votre session Windows : pose un",
  "' raccourci vers Lancer-CLAIRE-en-arriere-plan.vbs dans le dossier Demarrage de Windows.",
  "' Le serveur repart alors sans fenetre et ouvre lui-meme le logiciel dans le navigateur.",
  "' Pour annuler : Ne-plus-demarrer-CLAIRE-avec-Windows.vbs.",
  'Set oFso = CreateObject("Scripting.FileSystemObject")',
  'Set oShell = CreateObject("WScript.Shell")',
  'dossier = oFso.GetParentFolderName(WScript.ScriptFullName)',
  `lanceur = oFso.BuildPath(dossier, "${NOM_LANCEUR}")`,
  'If Not oFso.FileExists(lanceur) Then',
  '  MsgBox "Fichier introuvable : " & lanceur & vbCrLf & vbCrLf & "Lancez d\'abord CLAIRE-serveur.exe une fois : ce fichier est cree a cote de lui au premier demarrage.", vbExclamation, "CLAIRE"',
  '  WScript.Quit 1',
  'End If',
  `raccourci = oFso.BuildPath(oShell.SpecialFolders("Startup"), "${NOM_RACCOURCI_DEMARRAGE}")`,
  'Set oLnk = oShell.CreateShortcut(raccourci)',
  'oLnk.TargetPath = oFso.BuildPath(oFso.GetSpecialFolder(1), "wscript.exe")',
  'oLnk.Arguments = """" & lanceur & """"',
  'oLnk.WorkingDirectory = dossier',
  'oLnk.Description = "Lance le serveur CLAIRE a l\'ouverture de la session Windows"',
  'oLnk.Save',
  'MsgBox "CLAIRE demarrera desormais automatiquement a l\'ouverture de votre session Windows (serveur sans fenetre + logiciel dans le navigateur)." & vbCrLf & vbCrLf & "Raccourci cree : " & raccourci & vbCrLf & vbCrLf & "Pour annuler : Ne-plus-demarrer-CLAIRE-avec-Windows.vbs", vbInformation, "CLAIRE"'
].join(CRLF) + CRLF;

const CONTENU_DEMARRAGE_AUTO_RETRAIT = [
  "' Annule le demarrage automatique de CLAIRE a l'ouverture de session (retire le raccourci",
  "' pose par Demarrer-CLAIRE-avec-Windows.vbs). N'arrete pas un serveur deja lance :",
  "' pour cela, Arreter-CLAIRE.bat.",
  'Set oFso = CreateObject("Scripting.FileSystemObject")',
  'Set oShell = CreateObject("WScript.Shell")',
  `raccourci = oFso.BuildPath(oShell.SpecialFolders("Startup"), "${NOM_RACCOURCI_DEMARRAGE}")`,
  'If oFso.FileExists(raccourci) Then',
  '  oFso.DeleteFile raccourci',
  '  MsgBox "CLAIRE ne demarrera plus automatiquement a l\'ouverture de votre session Windows.", vbInformation, "CLAIRE"',
  'Else',
  '  MsgBox "Aucun demarrage automatique n\'etait configure pour cette session Windows.", vbInformation, "CLAIRE"',
  'End If'
].join(CRLF) + CRLF;

const SCRIPTS = [
  { nom: NOM_LANCEUR, contenu: CONTENU_LANCEUR },
  { nom: NOM_ARRET, contenu: CONTENU_ARRET },
  { nom: NOM_DEMARRAGE_AUTO, contenu: CONTENU_DEMARRAGE_AUTO },
  { nom: NOM_DEMARRAGE_AUTO_RETRAIT, contenu: CONTENU_DEMARRAGE_AUTO_RETRAIT }
];

// Crée chaque script absent du dossier, sans jamais toucher à un fichier déjà présent.
// Retourne les noms des fichiers effectivement créés (pour le journal de démarrage et les tests).
function assurerScriptsAssistants(dossierExe, fsImpl = fs) {
  const crees = [];
  for (const script of SCRIPTS) {
    const chemin = path.join(dossierExe, script.nom);
    if (fsImpl.existsSync(chemin)) continue;
    fsImpl.writeFileSync(chemin, script.contenu);
    crees.push(script.nom);
  }
  return crees;
}

module.exports = {
  assurerScriptsAssistants,
  SCRIPTS,
  NOM_LANCEUR,
  NOM_ARRET,
  NOM_DEMARRAGE_AUTO,
  NOM_DEMARRAGE_AUTO_RETRAIT,
  NOM_RACCOURCI_DEMARRAGE
};
