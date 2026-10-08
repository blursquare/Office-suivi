// @ts-check
'use strict';

// Appels 3CX dans la FENÊTRE CLAIRE (étude 07/10 : « 3CX ouvre l'appel dans un onglet Chrome et pas dans mon app séparée »).
//
// 3CX ouvre son adresse (/appel, voir routes/appels.js) dans un onglet du navigateur où tourne son client web. La fenêtre
// CLAIRE « application » est un autre profil Chrome (« Claire », « ClaireServeur » sur le serveur) : une page ne peut ni la
// trouver ni la passer au premier plan, et une fenêtre cachée ou recouverte ne peut pas se montrer d'elle-même (window.focus
// sans geste est refusé ; les notifications du système exigent HTTPS, que les postes n'ont pas). D'où un petit relais Windows,
// installé une fois par poste et par session, sans droit d'administrateur (même principe que ouvertureAuto.js) :
//   - un protocole `claire-appel:` déclaré dans HKCU\Software\Classes ;
//   - %APPDATA%\CLAIRE\appel-claire.vbs (lancé par le protocole, sans console) qui lance appel-claire.ps1, caché :
//     il cherche la fenêtre CLAIRE (titre « CLAIRE — … » sans le nom du navigateur : une fenêtre « --app » ne le porte pas),
//     la restaure si elle est réduite et la passe au premier plan ; aucune fenêtre CLAIRE → il l'ouvre (navigateur du poste,
//     profil CLAIRE) sur l'appel (« #appel=<id> »). Il ne reçoit qu'un identifiant d'appel (lettres, chiffres, tirets).
// L'onglet de 3CX, lui, appelle `claire-appel:<id>` puis se ferme (appels3cx.js, pageSonnerie). La fenêtre CLAIRE ouvre la
// fiche d'elle-même (relève des appels). Textes affichés SANS accent (wscript lit un .vbs en ANSI). Fonctions pures, testées.

/** @param {string} texte */
function litteralVbs(texte) {
  return '"' + String(texte).replace(/"/g, '""') + '"';
}

// Chaîne PowerShell entre apostrophes.
/** @param {string} texte */
function litteralPs(texte) {
  return "'" + String(texte).replace(/'/g, "''") + "'";
}

// Le script PowerShell du relais, sans la ligne `$cible = …` (chemin du navigateur, trouvé par l'installateur sur le poste).
/** @param {{ url: string, profil: string }} o @returns {string[]} */
function lignesRelaisPs({ url, profil }) {
  return [
    '# Relais CLAIRE : appel 3CX -> fenetre CLAIRE au premier plan (voir CLAIRE, Reglages, Telephonie 3CX).',
    'param([string]$lien = \'\')',
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$id = ($lien -replace '^claire-appel:/*', '') -replace '[^A-Za-z0-9_-]', ''",
    'if ($id.Length -gt 64) { $id = $id.Substring(0, 64) }',
    `$url = ${litteralPs(url)}`,
    `$profil = ${litteralPs(profil)}`,
    "$code = @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    'using System.Text;',
    'public static class FenetreClaire {',
    '  delegate bool Rappel(IntPtr h, IntPtr p);',
    '  [DllImport("user32.dll")] static extern bool EnumWindows(Rappel r, IntPtr p);',
    '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
    '  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);',
    '  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);',
    '  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);',
    '  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);',
    '  [DllImport("user32.dll")] static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);',
    '  public static IntPtr Trouver() {',
    '    IntPtr trouve = IntPtr.Zero;',
    '    EnumWindows(delegate (IntPtr h, IntPtr p) {',
    '      if (!IsWindowVisible(h)) return true;',
    '      StringBuilder sb = new StringBuilder(512);',
    '      GetWindowText(h, sb, 512);',
    '      string t = sb.ToString();',
    // « CLAIRE — » (tiret cadratin) : jamais un dossier de l'Explorateur nommé CLAIRE ; sans le nom du navigateur : jamais un
    // onglet CLAIRE d'une fenêtre Chrome, Edge ou Firefox ordinaire.
    '      if (t.StartsWith("CLAIRE \\u2014") && t.IndexOf("Google Chrome") < 0 && t.IndexOf("Microsoft") < 0 && t.IndexOf("Firefox") < 0) { trouve = h; return false; }',
    '      return true;',
    '    }, IntPtr.Zero);',
    '    return trouve;',
    '  }',
    '  public static bool Montrer(IntPtr h) {',
    '    if (IsIconic(h)) ShowWindow(h, 9);',
    // Touche Alt pressée et relâchée : Windows laisse alors ce processus passer une fenêtre au premier plan (sinon il se
    // contente de faire clignoter son bouton dans la barre des tâches).
    '    keybd_event(0x12, 0, 0, UIntPtr.Zero);',
    '    keybd_event(0x12, 0, 2, UIntPtr.Zero);',
    '    return SetForegroundWindow(h);',
    '  }',
    '}',
    "'@",
    'Add-Type -TypeDefinition $code',
    // Étude 08/10 : « l'onglet se referme mais le navigateur passe au premier plan » — l'onglet de 3CX se ferme APRÈS le lancement
    // du relais et Chrome reprend la main. On attend que l'onglet soit fermé, puis on montre la fenêtre deux fois, à 0,6 s d'écart.
    'Start-Sleep -Milliseconds 900',
    '$h = [FenetreClaire]::Trouver()',
    'if ($h -ne [IntPtr]::Zero) { [void][FenetreClaire]::Montrer($h); Start-Sleep -Milliseconds 600; [void][FenetreClaire]::Montrer($h); exit 0 }',
    "$adresse = if ($id) { $url + '#appel=' + $id } else { $url }",
    'Start-Process -FilePath $cible -ArgumentList (\'--profile-directory="\' + $profil + \'" --app="\' + $adresse + \'"\')'
  ];
}

var LIGNES_LANCEUR_RELAIS_APPEL = [
  "' Relais CLAIRE : lance appel-claire.ps1 sans fenetre de console (voir CLAIRE, Reglages, Telephonie 3CX).",
  'Option Explicit',
  'Dim sh, ps1, lien',
  'If WScript.Arguments.Count = 0 Then WScript.Quit',
  'lien = Replace(WScript.Arguments(0), """", "")',
  'Set sh = CreateObject("WScript.Shell")',
  'ps1 = sh.ExpandEnvironmentStrings("%APPDATA%") & "\\CLAIRE\\appel-claire.ps1"',
  'sh.Run "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """ -lien """ & lien & """", 0, False'
];

// Pure : l'installateur .vbs du relais, pour la fenêtre CLAIRE ouverte sur `url` dans le profil `profil`.
/** @param {{ url: string, profil: string }} o @returns {string} */
function scriptInstallationRelaisAppel({ url, profil }) {
  const lignes = [
    "' Installe sur ce poste l'ouverture des appels 3CX dans la fenetre CLAIRE (au lieu d'un onglet du navigateur), pour la",
    "' session Windows en cours, sans droit d'administrateur. Pour la retirer : supprimer la cle",
    "' HKCU\\Software\\Classes\\claire-appel et les fichiers appel-claire.* de %APPDATA%\\CLAIRE.",
    'Option Explicit',
    'Dim sh, fso, env, dossier, cible, candidat, f, l',
    'Set sh = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'Set env = sh.Environment("PROCESS")',
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
    'Set f = fso.CreateTextFile(dossier & "\\appel-claire.ps1", True)'
  ];
  const ps = lignesRelaisPs({ url, profil });
  // `$cible` juste après `param(...)` (PowerShell exige param en tête).
  for (const l of ps.slice(0, 2)) lignes.push('f.WriteLine ' + litteralVbs(l));
  lignes.push('f.WriteLine "$cible = \'" & Replace(cible, "\'", "\'\'") & "\'"');
  for (const l of ps.slice(2)) lignes.push('f.WriteLine ' + litteralVbs(l));
  lignes.push('f.Close', 'Set f = fso.CreateTextFile(dossier & "\\appel-claire.vbs", True)');
  for (const l of LIGNES_LANCEUR_RELAIS_APPEL) lignes.push('f.WriteLine ' + litteralVbs(l));
  lignes.push(
    'f.Close',
    'l = dossier & "\\appel-claire.vbs"',
    'sh.RegWrite "HKCU\\Software\\Classes\\claire-appel\\", "URL:CLAIRE - appel 3CX", "REG_SZ"',
    'sh.RegWrite "HKCU\\Software\\Classes\\claire-appel\\URL Protocol", "", "REG_SZ"',
    'sh.RegWrite "HKCU\\Software\\Classes\\claire-appel\\shell\\open\\command\\", "wscript.exe """ & l & """ ""%1""", "REG_SZ"',
    'MsgBox "Les appels 3CX s\'ouvriront dans la fenetre CLAIRE de ce poste." & vbCrLf & vbCrLf & "Au premier appel, le navigateur de 3CX demande s\'il peut ouvrir le lien claire-appel : cocher Toujours autoriser, puis Ouvrir.", 64, "CLAIRE"'
  );
  return lignes.join('\r\n') + '\r\n';
}

module.exports = { scriptInstallationRelaisAppel, lignesRelaisPs, LIGNES_LANCEUR_RELAIS_APPEL };
