'use strict';

// CLAIRE en application sur un POSTE de collaborateur (étude 02/10 : « que les collaborateurs puissent
// utiliser CLAIRE comme une app séparée de Chrome, comme sur mon poste »).
//
// Une PWA ne s'installe pas ici : Chrome et Edge n'acceptent d'installer un site qu'en HTTPS (ou sur
// « localhost »), et les postes ouvrent CLAIRE par l'adresse du serveur en HTTP sur le réseau du
// bureau. Il faudrait un certificat reconnu par chaque poste, pour un gain nul (les données vivent sur
// le serveur, pas de hors-ligne utile). On reprend donc ce que le poste serveur fait déjà
// (index.js, ouvrirNavigateur) : une fenêtre Chrome/Edge « --app » dans un profil dédié, sans onglet
// ni barre d'adresse, lancée par un raccourci du menu Démarrer et du bureau qui porte l'identifiant de
// cette fenêtre (icône nette dans la barre des tâches, voir raccourciWindows.js). Rien à mettre à
// jour sur le poste : la page vient du serveur, un nouveau CLAIRE-serveur.exe sert à tous.
//
// Installateur = un .vbs téléchargé depuis Réglages › Général (même principe que ouvertureAuto.js),
// sans droit d'administrateur : il trouve Chrome (sinon Edge), télécharge l'icône de CLAIRE depuis le
// serveur, écrit puis lance un petit script PowerShell local qui pose les deux raccourcis, et ouvre
// CLAIRE. Textes affichés SANS accent (wscript lit un .vbs en ANSI). Fonctions pures, testées.

const { scriptPowerShellRaccourcisPoste } = require('./raccourciWindows');

const PROFIL_POSTE = 'Claire';

// Pure : l'adresse de CLAIRE vue par le poste (celle par laquelle il a téléchargé l'installateur),
// ou null si l'en-tête Host n'a pas une forme d'adresse (jamais recopié tel quel dans un script).
function adresseClairePoste(protocole, hote) {
  const p = protocole === 'https' ? 'https' : 'http';
  const h = String(hote || '').trim();
  if (!/^(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9.-]+)(:\d{1,5})?$/.test(h)) return null;
  return `${p}://${h}/`;
}

// Chaîne VBScript : guillemets doublés.
function litteralVbs(texte) {
  return '"' + String(texte).replace(/"/g, '""') + '"';
}

function scriptInstallationAppPoste(url) {
  const ps = scriptPowerShellRaccourcisPoste({ url, profil: PROFIL_POSTE, description: 'CLAIRE - Registre des echeances' });
  const lignes = [
    "' Installe CLAIRE en application sur ce poste : raccourcis du menu Demarrer et du bureau qui",
    "' ouvrent CLAIRE dans sa propre fenetre (sans onglet ni barre d'adresse). Aucun droit",
    "' d'administrateur. Pour la retirer : supprimer les deux raccourcis CLAIRE et %APPDATA%\\CLAIRE.",
    'Option Explicit',
    'Dim sh, fso, env, dossier, cible, candidat, icone, http, flux, ps1, f, code, url, lnk, chemin',
    'Set sh = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'Set env = sh.Environment("PROCESS")',
    `url = ${litteralVbs(url)}`,
    'cible = ""',
    'For Each candidat In Array(env("ProgramFiles") & "\\Google\\Chrome\\Application\\chrome.exe", env("ProgramFiles(x86)") & "\\Google\\Chrome\\Application\\chrome.exe", env("LOCALAPPDATA") & "\\Google\\Chrome\\Application\\chrome.exe", env("ProgramFiles") & "\\Microsoft\\Edge\\Application\\msedge.exe", env("ProgramFiles(x86)") & "\\Microsoft\\Edge\\Application\\msedge.exe")',
    '  If cible = "" And fso.FileExists(candidat) Then cible = candidat',
    'Next',
    'If cible = "" Then',
    '  MsgBox "Ni Google Chrome ni Microsoft Edge n\'a ete trouve sur ce poste.", 48, "CLAIRE"',
    '  WScript.Quit',
    'End If',
    'dossier = sh.ExpandEnvironmentStrings("%APPDATA%") & "\\CLAIRE"',
    'If Not fso.FolderExists(dossier) Then fso.CreateFolder dossier',
    // Icône nette de CLAIRE servie par le serveur ; à défaut, celle du navigateur.
    'icone = dossier & "\\CLAIRE.ico"',
    'On Error Resume Next',
    'Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")',
    'http.Open "GET", url & "api/poste/icone.ico", False',
    'http.Send',
    'If Err.Number = 0 And http.Status = 200 Then',
    '  Set flux = CreateObject("ADODB.Stream")',
    '  flux.Type = 1',
    '  flux.Open',
    '  flux.Write http.ResponseBody',
    '  flux.SaveToFile icone, 2',
    '  flux.Close',
    'End If',
    'Err.Clear',
    'On Error GoTo 0',
    'If Not fso.FileExists(icone) Then icone = cible',
    'ps1 = dossier & "\\raccourcis-claire.ps1"',
    'Set f = fso.CreateTextFile(ps1, True)'
  ];
  for (const l of ps.split('\n')) lignes.push('f.WriteLine ' + litteralVbs(l));
  lignes.push(
    'f.Close',
    'code = sh.Run("powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & ps1 & """ -cible """ & cible & """ -icone """ & icone & """", 0, True)',
    'If code <> 0 Then',
    // Repli sans identifiant de fenêtre : CLAIRE s'ouvre en application, l'icône de la barre des
    // tâches peut seulement être moins nette.
    '  For Each chemin In Array(sh.SpecialFolders("Programs") & "\\CLAIRE.lnk", sh.SpecialFolders("Desktop") & "\\CLAIRE.lnk")',
    '    Set lnk = sh.CreateShortcut(chemin)',
    '    lnk.TargetPath = cible',
    `    lnk.Arguments = ${litteralVbs(`--profile-directory="${PROFIL_POSTE}" --app="${url}"`)}`,
    '    lnk.IconLocation = icone & ",0"',
    '    lnk.Description = "CLAIRE"',
    '    lnk.Save',
    '  Next',
    'End If',
    `sh.Run """" & cible & """ " & ${litteralVbs(`--profile-directory="${PROFIL_POSTE}" --app="${url}"`)}, 1, False`,
    'MsgBox "CLAIRE est installee sur ce poste : raccourci sur le bureau et dans le menu Demarrer." & vbCrLf & vbCrLf & "Pour la garder dans la barre des taches : clic droit sur son icone, puis Epingler a la barre des taches.", 64, "CLAIRE"'
  );
  return lignes.join('\r\n') + '\r\n';
}

module.exports = { scriptInstallationAppPoste, adresseClairePoste, PROFIL_POSTE };
