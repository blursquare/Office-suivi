// @ts-check
'use strict';

// Appels 3CX : fenêtre CLAIRE au premier plan SANS programme ni script sur le poste (étude 12/10 : « trouve un autre moyen pour
// ce relais » — Panda Endpoint Protection bloque le .vbs du 07/10 et CLAIRE-relais.exe ; choix de l'étude : un fichier .reg).
//
// Le .reg déclare, pour la session Windows (HKCU, sans droit d'administrateur), un lien `claire-devant:` ouvert par PowerShell
// (déjà dans Windows) avec un script ÉCRIT DANS LA CLÉ — aucun fichier posé sur le disque, rien à compiler (pas d'Add-Type de
// code : seulement les assemblages UI Automation de Windows). À la sonnerie, l'onglet de 3CX lance `claire-devant:<id>`
// (appels3cx.js, pageSonnerie) ; PowerShell :
//   1. prévient le serveur (`GET /appel/vu?id=`) : l'onglet, qui attend ce signal, se ferme ; sans signal (lien pas déclaré,
//      PowerShell bloqué), l'onglet ouvre CLAIRE sur l'appel au bout de quelques secondes — jamais un appel perdu ;
//   2. cherche la fenêtre CLAIRE par son titre EXACT (celui de l'application, sans « - Google Chrome »), la restaure si elle
//      est réduite et la passe au premier plan (deux fois, l'onglet de 3CX se fermant entre-temps) ;
//   3. aucune fenêtre CLAIRE : l'ouvre (Chrome, sinon Edge, profil CLAIRE) sur l'appel.
// Le lien reçu de Chrome n'est JAMAIS lu comme du code : la commande se termine par « # » (le lien, ajouté par PowerShell à la
// suite du texte de -Command, devient un commentaire) et le script relit l'argument brut ([Environment]::GetCommandLineArgs),
// réduit à un identifiant d'appel (lettres, chiffres, tirets). Fonctions pures, testées.

var PROTOCOLE_RELAIS_REG = 'claire-devant';
// Liens externes de CLAIRE ouverts dans un onglet du Chrome habituel (étude 22/10, `client/103-liens-chrome.js`).
var PROTOCOLE_LIENS_WEB = 'claire-web';

// Titre de la fenêtre CLAIRE (index.html, <title>), écrit en ASCII pour PowerShell (la clé ne porte que de l'ASCII).
var TITRE_FENETRE_PS = "'CLAIRE '+[char]0x2014+' Registre des '+[char]0xE9+'ch'+[char]0xE9+'ances notariales'";

/** @param {string} texte */
function litteralPsReg(texte) {
  return "'" + String(texte).replace(/'/g, "''") + "'";
}

// Pure : le script PowerShell, sur une ligne (instructions séparées par « ; »).
/** @param {{ url: string, profil: string }} o @returns {string} */
function scriptRelaisReg({ url, profil }) {
  const u = String(url || '').replace(/\/?$/, '/');
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    '$l=[string]([Environment]::GetCommandLineArgs()[-1])',
    `$id=($l -replace '^${PROTOCOLE_RELAIS_REG}:/*','') -replace '[^A-Za-z0-9_-]',''`,
    'if($id.Length -gt 64){$id=$id.Substring(0,64)}',
    `$u=${litteralPsReg(u)}`,
    "if($id){try{Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri ($u+'appel/vu?id='+$id)|Out-Null}catch{}}",
    `$t=${TITRE_FENETRE_PS}`,
    'Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes',
    '$A=[System.Windows.Automation.AutomationElement]',
    '$w=$A::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children,(New-Object System.Windows.Automation.PropertyCondition($A::NameProperty,$t)))',
    // L'onglet de 3CX se ferme au signal : on le laisse partir avant de montrer CLAIRE (sinon Chrome reprend la main).
    'Start-Sleep -Milliseconds 700',
    'if($w){'
      + 'try{$p=$w.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern);if($p.Current.WindowVisualState -eq 2){$p.SetWindowVisualState(0)}}catch{};'
      + '$s=New-Object -ComObject WScript.Shell;[void]$s.AppActivate($t);try{$w.SetFocus()}catch{};'
      + 'Start-Sleep -Milliseconds 600;[void]$s.AppActivate($t)'
      + '}else{'
      + "$a=if($id){$u+'#appel='+$id}else{$u};"
      + `$g=@(${litteralPsReg('--profile-directory=' + profil)},('--app='+$a));`
      + 'try{Start-Process chrome.exe -ArgumentList $g -ErrorAction Stop}catch{Start-Process msedge.exe -ArgumentList $g}'
      + '}'
  ].join(';');
}

// Pure : la commande de la clé (le lien de Chrome, « %1 », tombe dans le commentaire final).
/** @param {{ url: string, profil: string }} o @returns {string} */
function commandeRelaisReg(o) {
  return 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command "' + scriptRelaisReg(o) + ' #" "%1"';
}

/** @param {string} v */
function valeurReg(v) {
  return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// Pure : la valeur de la stratégie AutoLaunchProtocolsFromOrigins de Chrome et d'Edge — UNE chaîne JSON (liste de règles) posée
// directement sur la clé du navigateur (étude 19/10 : la sous-clé numérotée du 14/10 n'était pas lue, la question revenait à chaque appel).
/** @param {string} origine @param {string[]} [protocoles] @returns {string} */
function valeurPolitiqueLien(origine, protocoles) {
  const o = String(origine || '').replace(/\/+$/, '');
  return JSON.stringify((protocoles && protocoles.length ? protocoles : [PROTOCOLE_RELAIS_REG]).map((p) => ({ allowed_origins: [o], protocol: p })));
}

// Pure : le fichier .reg (texte ; envoyé en UTF-16 avec BOM, la forme que l'Éditeur du Registre attend). Il pose aussi, pour la session
// Windows (HKCU, sans droit d'administrateur), la stratégie qui laisse le navigateur ouvrir le lien depuis CLAIRE sans confirmation.
/** @param {{ url: string, profil: string }} o @returns {string} */
function fichierRegRelaisAppel(o) {
  const cle = 'HKEY_CURRENT_USER\\Software\\Classes\\' + PROTOCOLE_RELAIS_REG;
  const origine = String(o.url || '').replace(/\/+$/, '');
  const politique = (editeur) => ['[HKEY_CURRENT_USER\\Software\\Policies\\' + editeur + ']', '"AutoLaunchProtocolsFromOrigins"=' + valeurReg(valeurPolitiqueLien(origine)), ''];
  return [
    'Windows Registry Editor Version 5.00',
    '',
    '; CLAIRE : a chaque appel 3CX, la fenetre CLAIRE passe au premier plan (Reglages, Telephonie 3CX).',
    '; Aucun programme ni script sur le disque : un lien « ' + PROTOCOLE_RELAIS_REG + ': » ouvert par PowerShell (Windows).',
    '; Pour le retirer : supprimer la cle HKEY_CURRENT_USER\\Software\\Classes\\' + PROTOCOLE_RELAIS_REG + '.',
    '',
    '[' + cle + ']',
    '@="URL:CLAIRE - appel 3CX"',
    '"URL Protocol"=""',
    '',
    '[' + cle + '\\shell\\open\\command]',
    '@=' + valeurReg(commandeRelaisReg(o)),
    '',
    '; Le navigateur ouvre ce lien depuis ' + origine + ' sans demander a chaque appel (Chrome et Edge, a fermer puis rouvrir).',
    '; Attention : remplace une valeur AutoLaunchProtocolsFromOrigins deja posee pour cette session (autre application).',
    ...politique('Google\\Chrome'),
    ...politique('Microsoft\\Edge')
  ].join('\r\n');
}

/** @param {{ url: string, profil: string }} o @returns {Buffer} */
function octetsRegRelaisAppel(o) {
  return Buffer.from('﻿' + fichierRegRelaisAppel(o), 'utf16le');
}

// Pure : le fichier .reg (HKLM, droits d'administrateur : à passer par Fichorga) qui autorise le navigateur à ouvrir le lien
// `claire-devant:` depuis CLAIRE sans demander confirmation à chaque appel (stratégie AutoLaunchProtocolsFromOrigins de Chrome et
// d'Edge, limitée à l'adresse du serveur et à ce seul lien). Étude 14/10 : « le reg a fonctionné, il demande confirmation à chaque fois ».
/** @param {{ origine: string }} o @returns {string} */
function fichierRegAutorisationLien({ origine }) {
  const o = String(origine || '').replace(/\/+$/, '');
  const bloc = (editeur) => ['[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\' + editeur + ']', '"AutoLaunchProtocolsFromOrigins"=' + valeurReg(valeurPolitiqueLien(o, [PROTOCOLE_RELAIS_REG, PROTOCOLE_LIENS_WEB])), ''];
  return [
    'Windows Registry Editor Version 5.00',
    '',
    '; CLAIRE : le navigateur ouvre les liens « ' + PROTOCOLE_RELAIS_REG + ': » (appels 3CX) et « ' + PROTOCOLE_LIENS_WEB + ': » (liens dans Chrome) depuis ' + o + ' sans demander confirmation.',
    '; A importer avec un compte administrateur. Pour le retirer : supprimer la valeur AutoLaunchProtocolsFromOrigins de ces deux cles (puis redemarrer le navigateur).',
    '; Si la valeur existe deja avec d\'autres regles, y ajouter celle-ci au lieu d\'importer ce fichier.',
    '',
    ...bloc('Google\\Chrome'),
    ...bloc('Microsoft\\Edge')
  ].join('\r\n');
}

/** @param {{ origine: string }} o @returns {Buffer} */
function octetsRegAutorisationLien(o) {
  return Buffer.from('\uFEFF' + fichierRegAutorisationLien(o), 'utf16le');
}

// Pure : le script PowerShell du lien `claire-web:` — ouvre l'adresse reçue dans un ONGLET de Chrome (le profil habituel), sinon dans le
// navigateur par défaut. L'adresse (encodée par CLAIRE : encodeURIComponent) n'est JAMAIS lue comme du code : relue depuis l'argument brut,
// décodée, puis refusée si ce n'est pas une adresse http(s) sans espace, guillemet, accent grave, chevron ni caractère de commande.
/** @returns {string} */
function scriptLiensWeb() {
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    '$l=[string]([Environment]::GetCommandLineArgs()[-1])',
    `$r=$l -replace '^${PROTOCOLE_LIENS_WEB}:/*',''`,
    '$u=[uri]::UnescapeDataString($r)',
    "if($u -match '^https?://[A-Za-z0-9._~:/?#@!$&()*+,;=%\\[\\]-]{3,1800}$'){try{Start-Process chrome.exe -ArgumentList $u -ErrorAction Stop}catch{Start-Process $u}}"
  ].join(';');
}

/** @returns {string} */
function commandeLiensWeb() {
  return 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command "' + scriptLiensWeb() + ' #" "%1"';
}

// Pure : le fichier .reg du poste (HKCU, sans droit d'administrateur) qui déclare le lien `claire-web:` et la stratégie qui laisse le
// navigateur l'ouvrir sans confirmation depuis CLAIRE (efficace sur un poste géré ; sinon le fichier administrateur d'« autorisation »).
/** @param {{ url: string }} o @returns {string} */
function fichierRegLiensWeb(o) {
  const cle = 'HKEY_CURRENT_USER\\Software\\Classes\\' + PROTOCOLE_LIENS_WEB;
  const origine = String(o.url || '').replace(/\/+$/, '');
  const politique = (editeur) => ['[HKEY_CURRENT_USER\\Software\\Policies\\' + editeur + ']', '"AutoLaunchProtocolsFromOrigins"=' + valeurReg(valeurPolitiqueLien(origine, [PROTOCOLE_LIENS_WEB])), ''];
  return [
    'Windows Registry Editor Version 5.00',
    '',
    '; CLAIRE : les liens externes s\'ouvrent dans un onglet de Chrome (Reglages, Ce poste). Aucun programme sur le disque.',
    '; Pour le retirer : supprimer la cle HKEY_CURRENT_USER\\Software\\Classes\\' + PROTOCOLE_LIENS_WEB + '.',
    '',
    '[' + cle + ']',
    '@="URL:CLAIRE - lien dans Chrome"',
    '"URL Protocol"=""',
    '',
    '[' + cle + '\\shell\\open\\command]',
    '@=' + valeurReg(commandeLiensWeb()),
    '',
    ...politique('Google\\Chrome'),
    ...politique('Microsoft\\Edge')
  ].join('\r\n');
}

/** @param {{ url: string }} o @returns {Buffer} */
function octetsRegLiensWeb(o) {
  return Buffer.from('\uFEFF' + fichierRegLiensWeb(o), 'utf16le');
}

module.exports = { PROTOCOLE_LIENS_WEB, scriptLiensWeb, commandeLiensWeb, fichierRegLiensWeb, octetsRegLiensWeb, valeurPolitiqueLien, fichierRegAutorisationLien, octetsRegAutorisationLien, PROTOCOLE_RELAIS_REG, scriptRelaisReg, commandeRelaisReg, fichierRegRelaisAppel, octetsRegRelaisAppel };
