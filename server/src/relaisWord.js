// @ts-check
'use strict';

// Relais Word de l'« Aide à la rédaction » (étude 12/10 : « une fenêtre qui détecterait dans notre document Word à quelle
// clause nous sommes et nous propose la bonne donnée à remplir »).
//
// Authentic ouvre la trame de l'acte (.docx) dans Word, sur le poste. Une page web ne voit pas Word : un petit relais Windows,
// installé une fois par poste et par session, sans droit d'administrateur (même principe que relaisAppel3cx.js) :
//   - %APPDATA%\CLAIRE\word-claire.ps1, lancé caché à l'ouverture de session (clé Run de HKCU) et tout de suite par
//     l'installateur ; une seule copie à la fois (mutex) ;
//   - toutes les secondes, il lit par COM le paragraphe où se trouve le curseur de Word et l'intitulé le plus proche au-dessus
//     (paragraphe court, sans « --- »), et l'envoie au serveur quand il change (POST /api/relais-word/releve, avec le jeton du
//     poste) ; le serveur le garde EN MÉMOIRE seulement (jamais en base, jamais journalisé) pour la fenêtre CLAIRE du poste ;
//   - la réponse porte les insertions demandées depuis CLAIRE (« Insérer dans Word ») : le relais vérifie que le curseur est
//     toujours dans le même paragraphe, cherche le n-ième « --- » (trois tirets ou plus) de ce paragraphe et le remplace par la
//     valeur — Ctrl+Z dans Word l'annule. Rien d'autre n'est jamais écrit dans Word.
// Textes affichés SANS accent (wscript lit un .vbs en ANSI). Fonctions pures, testées.

const crypto = require('node:crypto');

/** @param {string} texte */
function litteralVbs(texte) {
  return '"' + String(texte).replace(/"/g, '""') + '"';
}

/** @param {string} texte */
function litteralPs(texte) {
  return "'" + String(texte).replace(/'/g, "''") + "'";
}

// Le script PowerShell du relais.
/** @param {{ url: string, poste: string, jeton: string, profil?: string }} o @returns {string[]} */
function lignesRelaisWordPs({ url, poste, jeton, profil }) {
  return [
    '# Relais CLAIRE : paragraphe de Word ou se trouve le curseur -> Aide a la redaction (voir CLAIRE, Aide a la redaction).',
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$url = ${litteralPs(url)}`,
    `$poste = ${litteralPs(poste)}`,
    `$jeton = ${litteralPs(jeton)}`,
    `$profil = ${litteralPs(profil || 'Claire')}`,
    "if (-not $cible) { $cible = '' }",
    "$mutex = New-Object System.Threading.Mutex($false, 'Local\\CLAIRE-relais-Word')",
    // Mutex d'un relais arrêté par l'installateur : « abandonné », il est à nous.
    '$libre = $false',
    'try { $libre = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $libre = $true }',
    'if (-not $libre) { exit 0 }',
    // Fenêtres Windows : la fenêtre CLAIRE (titre « CLAIRE — … » sans nom de navigateur, comme relaisAppel3cx.js), la fenêtre au
    // premier plan, et le passage au premier plan (touche Alt : Windows laisse alors ce processus le faire).
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
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);',
    '  public static IntPtr Trouver() {',
    '    IntPtr trouve = IntPtr.Zero;',
    '    EnumWindows(delegate (IntPtr h, IntPtr p) {',
    '      if (!IsWindowVisible(h)) return true;',
    '      StringBuilder sb = new StringBuilder(512);',
    '      GetWindowText(h, sb, 512);',
    '      string t = sb.ToString();',
    '      if (t.StartsWith("CLAIRE \\u2014") && t.IndexOf("Google Chrome") < 0 && t.IndexOf("Microsoft") < 0 && t.IndexOf("Firefox") < 0) { trouve = h; return false; }',
    '      return true;',
    '    }, IntPtr.Zero);',
    '    return trouve;',
    '  }',
    '  public static bool Montrer(IntPtr h) {',
    '    if (IsIconic(h)) ShowWindow(h, 9);',
    '    keybd_event(0x12, 0, 0, UIntPtr.Zero);',
    '    keybd_event(0x12, 0, 2, UIntPtr.Zero);',
    '    return SetForegroundWindow(h);',
    '  }',
    '}',
    "'@",
    'Add-Type -TypeDefinition $code',
    '$historique = New-Object System.Collections.ArrayList',
    // Appel 3CX (étude 12/10 : « Chrome s'ouvre au premier plan à chaque appel, c'est pénible ; CLAIRE ne s'affiche pas au
    // premier plan lorsqu'un dossier est trouvé ») : l'onglet de 3CX se ferme seul ; appelant d'un dossier → fenêtre CLAIRE au
    // premier plan (ouverte sur l'appel si elle était fermée) ; sinon la fenêtre d'avant la sonnerie reprend le premier plan.
    'function Appel($a) {',
    '  $ilYa = [double]$a.ilYaMs',
    '  $quand = (Get-Date).AddMilliseconds(-$ilYa - 300)',
    '  if ($ilYa -lt 1200) { Start-Sleep -Milliseconds ([int](1200 - $ilYa)) }',
    '  if ($a.dossier) {',
    '    $h = [FenetreClaire]::Trouver()',
    '    if ($h -ne [IntPtr]::Zero) { [void][FenetreClaire]::Montrer($h); Start-Sleep -Milliseconds 600; [void][FenetreClaire]::Montrer($h); return }',
    "    $id = ([string]$a.id) -replace '[^A-Za-z0-9_-]', ''",
    "    if ($cible) { Start-Process -FilePath $cible -ArgumentList ('--profile-directory=\"' + $profil + '\" --app=\"' + $url + '#appel=' + $id + '\"') }",
    '    return',
    '  }',
    '  $avant = [IntPtr]::Zero',
    '  foreach ($e in $historique) { if ($e.t -lt $quand) { $avant = $e.h } }',
    '  if ($avant -ne [IntPtr]::Zero -and [FenetreClaire]::IsWindow($avant)) { [void][FenetreClaire]::Montrer($avant) }',
    '}',
    "function Normaliser([string]$s) { return (($s -replace '[\\s\\x00-\\x1f]+', ' ').Trim()) }",
    'function Inserer($word, $c) {',
    '  try {',
    "    if ($word -eq $null -or $word.Documents.Count -eq 0) { return @{ id = $c.id; ok = $false; message = 'Word n est pas ouvert.' } }",
    '    $pr = $word.Selection.Paragraphs.Item(1).Range',
    "    if ((Normaliser $pr.Text) -ne (Normaliser ([string]$c.attendu))) { return @{ id = $c.id; ok = $false; message = 'Le curseur n est plus dans ce paragraphe.' } }",
    '    $txt = [string]$pr.Text',
    "    if ($txt.Length -gt 4000) { return @{ id = $c.id; ok = $false; message = 'Paragraphe trop long : copiez la valeur.' } }",
    // Les « --- » repérés sur le TEXTE du paragraphe (même compte que le poste : /-{3,}/), jamais par la recherche de Word (elle
    // garde les options de la dernière recherche de l'utilisateur : mot entier, ponctuation ignorée…) ; la plage visée est
    // contrôlée avant d'écrire (un champ ou un texte masqué décale les positions : rien n'est écrit).
    "    $ms = [regex]::Matches($txt, '-{3,}')",
    '    $k = [int]$c.occurrence',
    "    if ($k -lt 0 -or $k -ge $ms.Count) { return @{ id = $c.id; ok = $false; message = 'Blanc introuvable dans le paragraphe.' } }",
    '    $m = $ms[$k]',
    '    $r = $pr.Document.Range($pr.Start + $m.Index, $pr.Start + $m.Index + $m.Length)',
    "    if ([string]$r.Text -ne $m.Value) { return @{ id = $c.id; ok = $false; message = 'Blanc introuvable a sa place (champ ou texte masque dans le paragraphe) : copiez la valeur.' } }",
    '    $r.Text = [string]$c.valeur',
    '    return @{ id = $c.id; ok = $true }',
    "  } catch { return @{ id = $c.id; ok = $false; message = 'Word a refuse l insertion.' } }",
    '}',
    '$dernier = $null',
    '$refus = 0',
    '$resultats = @()',
    '$envoi = [DateTime]::MinValue',
    'while ($true) {',
    '  $word = $null',
    '  $avecDoc = $false',
    "  $titre = ''",
    "  $para = ''",
    // La fenêtre au premier plan, retenue 20 s : celle d'avant la sonnerie d'un appel.
    '  [void]$historique.Add(@{ t = (Get-Date); h = [FenetreClaire]::GetForegroundWindow() })',
    '  while ($historique.Count -gt 40) { $historique.RemoveAt(0) }',
    "  try { $word = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application') } catch { $word = $null }",
    '  if ($word -ne $null) {',
    '    try {',
    '      if ($word.Documents.Count -gt 0) {',
    '        $avecDoc = $true',
    '        $p = $word.Selection.Paragraphs.Item(1)',
    '        $para = [string]$p.Range.Text',
    '        for ($i = 0; $i -lt 15; $i++) {',
    '          $p = $p.Previous()',
    '          if ($p -eq $null) { break }',
    '          $t = Normaliser $p.Range.Text',
    "          if ($t.Length -gt 0 -and $t.Length -le 90 -and $t.IndexOf('---') -lt 0) { $titre = $t; break }",
    '        }',
    '      }',
    '    } catch { }',
    '  }',
    '  if ($para.Length -gt 4000) { $para = $para.Substring(0, 4000) }',
    "  $cle = $titre + '|' + $para",
    '  $inchange = ($cle -eq $dernier)',
    '  $maintenant = Get-Date',
    // Battement chaque seconde, Word ouvert ou non : les sonneries 3CX arrivent dans sa réponse.
    '  $attente = 1',
    '  if (-not $inchange -or $resultats.Count -gt 0 -or ($maintenant - $envoi).TotalSeconds -ge $attente) {',
    '    $corps = @{ poste = $poste; jeton = $jeton; word = $avecDoc; inchange = $inchange; resultats = @($resultats) }',
    '    if (-not $inchange) { $corps.titre = $titre; $corps.paragraphe = $para }',
    '    try {',
    '      $json = $corps | ConvertTo-Json -Depth 4 -Compress',
    "      $rep = Invoke-RestMethod -Uri ($url + 'api/relais-word/releve') -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 5",
    '      $dernier = $cle',
    '      $refus = 0',
    '      $resultats = @()',
    '      $envoi = $maintenant',
    '      foreach ($c in @($rep.commandes)) { if ($c) { $resultats += (Inserer $word $c) } }',
    // Serveur redémarré (état en mémoire perdu) : le paragraphe est renvoyé au tour suivant.
    '      if ($rep.renvoyer) { $dernier = $null }',
    '      foreach ($a in @($rep.appels)) { if ($a) { Appel $a } }',
    '    } catch {',
    // Jeton refusé (relais réinstallé ailleurs ou retiré) : on ralentit, puis on s'arrête — jamais une boucle de refus.
    '      $code = 0',
    '      try { $code = [int]$_.Exception.Response.StatusCode } catch { }',
    '      if ($code -eq 403) { $refus++; if ($refus -ge 10) { exit 0 }; Start-Sleep -Seconds 30 }',
    '    }',
    '  }',
    // Les objets COM du tour (sélection, paragraphes, plages) libérés aussi : jamais un Word fantôme après sa fermeture.
    '  if ($word -ne $null) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word); $word = $null; [GC]::Collect(); [GC]::WaitForPendingFinalizers() }',
    '  Start-Sleep -Milliseconds 500',
    '}'
  ];
}

var LIGNES_LANCEUR_RELAIS_WORD = [
  "' Relais CLAIRE : lance word-claire.ps1 sans fenetre de console (voir CLAIRE, Aide a la redaction).",
  'Option Explicit',
  'Dim sh, ps1',
  'Set sh = CreateObject("WScript.Shell")',
  'ps1 = sh.ExpandEnvironmentStrings("%APPDATA%") & "\\CLAIRE\\word-claire.ps1"',
  'sh.Run "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False'
];

// Pure : l'installateur .vbs du relais Word pour le collaborateur `poste`, qui parle au serveur `url` avec `jeton`.
/** @param {{ url: string, poste: string, jeton: string, profil?: string }} o @returns {string} */
function scriptInstallationRelaisWord({ url, poste, jeton, profil }) {
  const lignes = [
    "' Installe sur ce poste le relais Word de CLAIRE (Aide a la redaction : le paragraphe ou se trouve le curseur de Word),",
    "' pour la session Windows en cours, sans droit d'administrateur. Pour le retirer : supprimer la valeur CLAIRE-Word de",
    "' HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run et les fichiers word-claire.* de %APPDATA%\\CLAIRE.",
    'Option Explicit',
    'Dim sh, fso, env, dossier, f, l, cible, candidat',
    'Set sh = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'Set env = sh.Environment("PROCESS")',
    // Le navigateur qui ouvre la fenêtre CLAIRE sur un appel quand elle est fermée (vide : rien n'est ouvert).
    'cible = ""',
    'For Each candidat In Array(env("ProgramFiles") & "\\Google\\Chrome\\Application\\chrome.exe", env("ProgramFiles(x86)") & "\\Google\\Chrome\\Application\\chrome.exe", env("LOCALAPPDATA") & "\\Google\\Chrome\\Application\\chrome.exe", env("ProgramFiles") & "\\Microsoft\\Edge\\Application\\msedge.exe", env("ProgramFiles(x86)") & "\\Microsoft\\Edge\\Application\\msedge.exe")',
    '  If cible = "" And fso.FileExists(candidat) Then cible = candidat',
    'Next',
    'dossier = sh.ExpandEnvironmentStrings("%APPDATA%") & "\\CLAIRE"',
    'If Not fso.FolderExists(dossier) Then fso.CreateFolder dossier',
    // Le script PowerShell en Unicode : la valeur insérée et le texte de Word gardent leurs accents.
    'Set f = fso.CreateTextFile(dossier & "\\word-claire.ps1", True, True)'
  ];
  lignes.push('f.WriteLine "$cible = \'" & Replace(cible, "\'", "\'\'") & "\'"');
  for (const l of lignesRelaisWordPs({ url, poste, jeton, profil })) lignes.push('f.WriteLine ' + litteralVbs(l));
  lignes.push('f.Close', 'Set f = fso.CreateTextFile(dossier & "\\word-claire.vbs", True)');
  for (const l of LIGNES_LANCEUR_RELAIS_WORD) lignes.push('f.WriteLine ' + litteralVbs(l));
  lignes.push(
    'f.Close',
    'l = dossier & "\\word-claire.vbs"',
    'sh.RegWrite "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\CLAIRE-Word", "wscript.exe """ & l & """", "REG_SZ"',
    // Un relais déjà lancé (ancien jeton) est arrêté : sinon il garde le mutex et le nouveau sort aussitôt.
    'Dim p',
    'For Each p In GetObject("winmgmts:").ExecQuery("select * from Win32_Process where Name=\'powershell.exe\' and CommandLine like \'%word-claire.ps1%\'")',
    '  p.Terminate',
    'Next',
    'WScript.Sleep 500',
    'sh.Run "wscript.exe """ & l & """", 0, False',
    'MsgBox "Le relais CLAIRE de ce poste est installe :" & vbCrLf & "- l Aide a la redaction suit le paragraphe ou se trouve le curseur de Word ;" & vbCrLf & "- a chaque appel 3CX, la fenetre CLAIRE passe au premier plan si l appelant a un dossier, sinon la fenetre d avant revient." & vbCrLf & vbCrLf & "Il demarre seul a chaque ouverture de session.", 64, "CLAIRE"'
  );
  return lignes.join('\r\n') + '\r\n';
}

/** @param {string} jeton */
function empreinteJeton(jeton) {
  return crypto.createHash('sha256').update(String(jeton || '')).digest('hex');
}

function nouveauJeton() {
  return crypto.randomBytes(24).toString('hex');
}

// Pure : le jeton présenté correspond-il à l'empreinte retenue pour ce poste ?
/** @param {string} empreinte @param {string} jeton */
function jetonValide(empreinte, jeton) {
  if (typeof empreinte !== 'string' || !/^[0-9a-f]{64}$/.test(empreinte) || !jeton || typeof jeton !== 'string') return false;
  const a = Buffer.from(empreinte, 'hex');
  const b = Buffer.from(empreinteJeton(jeton), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Pure : le paragraphe de Word nettoyé pour l'écran (fin de paragraphe, fin de cellule et saut de ligne de Word ; tout autre
// caractère de contrôle devient une espace — le relais compare les paragraphes espaces réduites, voir Normaliser).
/** @param {unknown} texte @param {number} max */
function texteWord(texte, max) {
  return String(texte == null ? '' : texte).replace(/\x07/g, ' ').replace(/[\r\x0b]/g, '\n').replace(/[\x00-\x08\x0e-\x1f]/g, ' ').slice(0, max).trim();
}

var COMMANDES_MAX = 5;
var COMMANDE_EXPIRE_MS = 20000;
var RELAIS_VU_MS = 12000;

/** @typedef {{ id: string, valeur: string, occurrence: number, attendu: string, t: number }} CommandeWord */
/** @typedef {{ vu: number, word: boolean, titre: string, paragraphe: string, n: number, commandes: CommandeWord[], resultats: { id: string, ok: boolean, message: string, t: number }[], appels: { id: string, dossier: boolean, t: number }[] }} PosteWord */

function creerEtatRelaisWord() {
  return { postes: /** @type {Map<string, PosteWord>} */ (new Map()), demarrage: crypto.randomBytes(3).toString('hex') };
}

/** @param {ReturnType<typeof creerEtatRelaisWord>} etat @param {string} poste @returns {PosteWord} */
function postePourWord(etat, poste) {
  let p = etat.postes.get(poste);
  if (!p) { p = { vu: 0, word: false, titre: '', paragraphe: '', n: 0, commandes: [], resultats: [], appels: [] }; etat.postes.set(poste, p); }
  return p;
}

// Pure (sur l'état) : un relevé du relais. Rend les commandes à exécuter (retirées de la file) et `renvoyer` quand le serveur
// ne connaît pas encore ce poste (redémarré) alors que le relais n'envoie que « inchangé ».
/** @param {ReturnType<typeof creerEtatRelaisWord>} etat @param {string} poste @param {any} corps @param {number} [maintenant] */
function appliquerReleveWord(etat, poste, corps, maintenant = Date.now()) {
  const neuf = !etat.postes.has(poste);
  const p = postePourWord(etat, poste);
  p.vu = maintenant;
  p.word = !!corps.word;
  if (!corps.inchange) {
    const titre = texteWord(corps.titre, 200);
    const paragraphe = texteWord(corps.paragraphe, 4000);
    if (titre !== p.titre || paragraphe !== p.paragraphe) { p.titre = titre; p.paragraphe = paragraphe; p.n++; }
  }
  const resultats = Array.isArray(corps.resultats) ? corps.resultats : (corps.resultats && typeof corps.resultats === 'object' ? [corps.resultats] : []);
  for (const r of resultats.slice(0, COMMANDES_MAX)) {
    if (!r || typeof r.id !== 'string') continue;
    p.resultats.push({ id: r.id.slice(0, 40), ok: r.ok === true, message: String(r.message || '').slice(0, 120), t: maintenant });
  }
  p.resultats = p.resultats.filter(r => maintenant - r.t < 60000).slice(-10);
  const commandes = p.commandes.filter(c => maintenant - c.t < COMMANDE_EXPIRE_MS);
  p.commandes = [];
  // Sonneries de moins de 8 s (plus vieilles : l'onglet de 3CX est déjà loin, rien à rendre).
  const appels = (p.appels || []).filter(a => maintenant - a.t < 8000).map(a => ({ id: a.id, dossier: a.dossier, ilYaMs: Math.max(0, maintenant - a.t) }));
  p.appels = [];
  return { commandes: commandes.map(c => ({ id: c.id, valeur: c.valeur, occurrence: c.occurrence, attendu: c.attendu })), appels, renvoyer: neuf && !!corps.inchange };
}

// Le relais du poste tourne-t-il (vu il y a moins de RELAIS_VU_MS) ?
/** @param {ReturnType<typeof creerEtatRelaisWord>} etat @param {string} poste @param {number} [maintenant] */
function relaisPosteActif(etat, poste, maintenant = Date.now()) {
  const p = poste ? etat.postes.get(poste) : null;
  return !!p && maintenant - p.vu < RELAIS_VU_MS;
}

// Une sonnerie 3CX pour ce poste : rendue au relais à son prochain relevé (une seconde au plus). `dossier` : l'appelant a un
// dossier (la fenêtre CLAIRE passe au premier plan) ; sinon la fenêtre d'avant la sonnerie revient.
/** @param {ReturnType<typeof creerEtatRelaisWord>} etat @param {string} poste @param {{ id: string, dossier: boolean }} appel @param {number} [maintenant] */
function noterAppelPourRelais(etat, poste, appel, maintenant = Date.now()) {
  if (!relaisPosteActif(etat, poste, maintenant)) return false;
  const p = postePourWord(etat, poste);
  p.appels = (p.appels || []).concat([{ id: String(appel.id || '').slice(0, 64), dossier: !!appel.dossier, t: maintenant }]).slice(-5);
  return true;
}

// Pure (sur l'état) : une insertion demandée depuis la fenêtre CLAIRE du poste. Rend l'identifiant, ou une erreur.
/** @param {ReturnType<typeof creerEtatRelaisWord>} etat @param {string} poste @param {any} corps @param {number} [maintenant] */
function demanderInsertionWord(etat, poste, corps, maintenant = Date.now()) {
  const p = etat.postes.get(poste);
  if (!p || maintenant - p.vu > RELAIS_VU_MS) return { erreur: 'Le relais Word de ce poste ne répond pas.' };
  const valeur = String((corps && corps.valeur) || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 1000);
  const occurrence = Number(corps && corps.occurrence);
  const attendu = String((corps && corps.attendu) || '').slice(0, 4000);
  if (!valeur || !Number.isInteger(occurrence) || occurrence < 0 || occurrence > 200 || !attendu) return { erreur: 'Insertion incomplète.' };
  p.commandes = p.commandes.filter(c => maintenant - c.t < COMMANDE_EXPIRE_MS).slice(-(COMMANDES_MAX - 1));
  const id = crypto.randomBytes(6).toString('hex');
  p.commandes.push({ id, valeur, occurrence, attendu, t: maintenant });
  return { id };
}

// Pure (sur l'état) : ce que voit la fenêtre CLAIRE du poste.
/** @param {ReturnType<typeof creerEtatRelaisWord>} etat @param {string} poste @param {boolean} installe @param {number} [maintenant] */
function etatPosteWord(etat, poste, installe, maintenant = Date.now()) {
  const p = etat.postes.get(poste);
  const actif = !!p && maintenant - p.vu < RELAIS_VU_MS;
  return {
    installe: installe || actif,
    actif,
    word: actif && !!p && p.word,
    titre: actif && p ? p.titre : '',
    paragraphe: actif && p ? p.paragraphe : '',
    n: etat.demarrage + ':' + (p ? p.n : 0),
    resultats: p ? p.resultats.map(r => ({ id: r.id, ok: r.ok, message: r.message })) : []
  };
}

module.exports = {
  scriptInstallationRelaisWord, lignesRelaisWordPs, LIGNES_LANCEUR_RELAIS_WORD,
  empreinteJeton, nouveauJeton, jetonValide, texteWord,
  creerEtatRelaisWord, appliquerReleveWord, demanderInsertionWord, etatPosteWord, relaisPosteActif, noterAppelPourRelais, RELAIS_VU_MS
};
