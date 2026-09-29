'use strict';

// Ouverture automatique des documents téléchargés depuis CLAIRE (demandé par l'étude le 29/09 :
// « ouvrir automatiquement les documents une fois téléchargés »). Un navigateur n'ouvre jamais seul
// un fichier qu'il vient de télécharger ; le réglage « Toujours ouvrir ce type de fichier » de
// Chrome/Edge reste à faire à la main, type par type, et la stratégie de groupe équivalente
// (AutoOpenFileTypes) n'agit que sur un poste joint à un domaine. D'où un petit relais Windows,
// installé une fois par poste et par session, sans droits d'administrateur :
//   - un protocole `claire-ouvrir:` déclaré dans HKCU\Software\Classes ;
//   - un script `%APPDATA%\CLAIRE\ouvrir-telechargement.vbs` qu'il lance.
// Après un téléchargement, CLAIRE appelle `claire-ouvrir:<extension>` (eml, docx, doc, ics) ; le
// relais ouvre avec son application habituelle (Outlook, Word…) le fichier de CETTE extension le
// plus récent du dossier Téléchargements, modifié dans les deux dernières minutes — rien d'autre :
// ni chemin reçu du navigateur, ni autre dossier, ni autre type de fichier. Le navigateur demande
// une fois l'autorisation d'ouvrir le lien (« Toujours autoriser »), puis plus rien.
//
// Textes affichés SANS accent : wscript lit un .vbs en ANSI (même contrainte que
// scriptsAssistants.js). Fonction pure, testée.

const EXTENSIONS_OUVERTURE_AUTO = ['eml', 'docx', 'doc', 'ics'];

const LIGNES_RELAIS = [
  "' Relais CLAIRE : ouvre le dernier fichier telecharge du type demande (voir CLAIRE, Reglages).",
  'Option Explicit',
  'Dim arg, ext, sh, fso, dl, fichier, meilleur, dateMeilleure, essai',
  'If WScript.Arguments.Count = 0 Then WScript.Quit',
  'arg = LCase(WScript.Arguments(0))',
  'ext = Mid(arg, InStr(arg, ":") + 1)',
  'ext = Replace(Replace(Replace(ext, "/", ""), "\\", ""), ".", "")',
  `If InStr("|${EXTENSIONS_OUVERTURE_AUTO.join('|')}|", "|" & ext & "|") = 0 Or Len(ext) = 0 Then WScript.Quit`,
  'Set sh = CreateObject("WScript.Shell")',
  'Set fso = CreateObject("Scripting.FileSystemObject")',
  'dl = ""',
  'On Error Resume Next',
  'dl = CreateObject("Shell.Application").Namespace("shell:Downloads").Self.Path',
  'On Error GoTo 0',
  'If dl = "" Or Not fso.FolderExists(dl) Then dl = sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\\Downloads"',
  'If Not fso.FolderExists(dl) Then WScript.Quit',
  'For essai = 1 To 20',
  '  meilleur = ""',
  '  For Each fichier In fso.GetFolder(dl).Files',
  '    If LCase(fso.GetExtensionName(fichier.Name)) = ext Then',
  '      If DateDiff("s", fichier.DateLastModified, Now) <= 120 Then',
  '        If meilleur = "" Then',
  '          meilleur = fichier.Path',
  '          dateMeilleure = fichier.DateLastModified',
  '        ElseIf fichier.DateLastModified > dateMeilleure Then',
  '          meilleur = fichier.Path',
  '          dateMeilleure = fichier.DateLastModified',
  '        End If',
  '      End If',
  '    End If',
  '  Next',
  '  If meilleur <> "" Then',
  '    sh.Run """" & meilleur & """", 1, False',
  '    WScript.Quit',
  '  End If',
  '  WScript.Sleep 500',
  'Next'
];

// Chaîne VBScript : guillemets doublés.
function litteralVbs(texte) {
  return '"' + String(texte).replace(/"/g, '""') + '"';
}

function scriptInstallationOuvertureAuto() {
  const lignes = [
    "' Installe l'ouverture automatique des documents telecharges depuis CLAIRE, pour la session",
    "' Windows en cours (aucun droit d'administrateur). Pour la retirer : supprimer la cle",
    "' HKCU\\Software\\Classes\\claire-ouvrir et le dossier %APPDATA%\\CLAIRE.",
    'Option Explicit',
    'Dim sh, fso, dossier, relais, f',
    'Set sh = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'dossier = sh.ExpandEnvironmentStrings("%APPDATA%") & "\\CLAIRE"',
    'If Not fso.FolderExists(dossier) Then fso.CreateFolder dossier',
    'relais = dossier & "\\ouvrir-telechargement.vbs"',
    'Set f = fso.CreateTextFile(relais, True)'
  ];
  for (const l of LIGNES_RELAIS) lignes.push('f.WriteLine ' + litteralVbs(l));
  lignes.push(
    'f.Close',
    'sh.RegWrite "HKCU\\Software\\Classes\\claire-ouvrir\\", "URL:CLAIRE - ouvrir un document telecharge", "REG_SZ"',
    'sh.RegWrite "HKCU\\Software\\Classes\\claire-ouvrir\\URL Protocol", "", "REG_SZ"',
    'sh.RegWrite "HKCU\\Software\\Classes\\claire-ouvrir\\shell\\open\\command\\", "wscript.exe """ & relais & """ ""%1""", "REG_SZ"',
    `MsgBox "Ouverture automatique installee sur ce poste." & vbCrLf & vbCrLf & "Au premier document, le navigateur demande s'il peut ouvrir le lien claire-ouvrir : cocher Toujours autoriser, puis Ouvrir.", 64, "CLAIRE"`
  );
  return lignes.join('\r\n') + '\r\n';
}

module.exports = { scriptInstallationOuvertureAuto, EXTENSIONS_OUVERTURE_AUTO, LIGNES_RELAIS };
