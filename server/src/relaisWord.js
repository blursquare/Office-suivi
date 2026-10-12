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
/** @param {{ url: string, poste: string, jeton: string }} o @returns {string[]} */
function lignesRelaisWordPs({ url, poste, jeton }) {
  return [
    '# Relais CLAIRE : paragraphe de Word ou se trouve le curseur -> Aide a la redaction (voir CLAIRE, Aide a la redaction).',
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$url = ${litteralPs(url)}`,
    `$poste = ${litteralPs(poste)}`,
    `$jeton = ${litteralPs(jeton)}`,
    "$mutex = New-Object System.Threading.Mutex($false, 'Local\\CLAIRE-relais-Word')",
    'if (-not $mutex.WaitOne(0)) { exit 0 }',
    "function Normaliser([string]$s) { return (($s -replace '[\\s\\x00-\\x1f]+', ' ').Trim()) }",
    'function Inserer($word, $c) {',
    '  try {',
    "    if ($word -eq $null -or $word.Documents.Count -eq 0) { return @{ id = $c.id; ok = $false; message = 'Word n est pas ouvert.' } }",
    '    $pr = $word.Selection.Paragraphs.Item(1).Range',
    "    if ((Normaliser $pr.Text) -ne (Normaliser ([string]$c.attendu))) { return @{ id = $c.id; ok = $false; message = 'Le curseur n est plus dans ce paragraphe.' } }",
    '    $doc = $pr.Document',
    '    $debut = $pr.Start',
    '    $fin = $pr.End',
    '    $n = 0',
    '    while ($true) {',
    '      $r = $doc.Range($debut, $fin)',
    '      $f = $r.Find',
    '      $f.ClearFormatting()',
    "      $f.Text = '---'",
    '      $f.Forward = $true',
    '      $f.Wrap = 0',
    '      $f.MatchWildcards = $false',
    "      if (-not $f.Execute()) { return @{ id = $c.id; ok = $false; message = 'Blanc introuvable dans le paragraphe.' } }",
    "      while ($r.End -lt $fin -and $doc.Range($r.End, $r.End + 1).Text -eq '-') { $r.End = $r.End + 1 }",
    '      if ($n -eq [int]$c.occurrence) { $r.Text = [string]$c.valeur; return @{ id = $c.id; ok = $true } }',
    '      $n++',
    '      $debut = $r.End',
    '    }',
    "  } catch { return @{ id = $c.id; ok = $false; message = 'Word a refuse l insertion.' } }",
    '}',
    '$dernier = $null',
    '$resultats = @()',
    '$envoi = [DateTime]::MinValue',
    'while ($true) {',
    '  $word = $null',
    "  $titre = ''",
    "  $para = ''",
    "  try { $word = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application') } catch { $word = $null }",
    '  if ($word -ne $null) {',
    '    try {',
    '      if ($word.Documents.Count -gt 0) {',
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
    '  $attente = if ($word -ne $null) { 1 } else { 5 }',
    '  if (-not $inchange -or $resultats.Count -gt 0 -or ($maintenant - $envoi).TotalSeconds -ge $attente) {',
    '    $corps = @{ poste = $poste; jeton = $jeton; word = ($word -ne $null); inchange = $inchange; resultats = @($resultats) }',
    '    if (-not $inchange) { $corps.titre = $titre; $corps.paragraphe = $para }',
    '    try {',
    '      $json = $corps | ConvertTo-Json -Depth 4 -Compress',
    "      $rep = Invoke-RestMethod -Uri ($url + 'api/relais-word/releve') -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 5",
    '      $dernier = $cle',
    '      $resultats = @()',
    '      $envoi = $maintenant',
    '      foreach ($c in @($rep.commandes)) { if ($c) { $resultats += (Inserer $word $c) } }',
    '    } catch { }',
    '  }',
    '  if ($word -ne $null) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }',
    '  Start-Sleep -Milliseconds 700',
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
/** @param {{ url: string, poste: string, jeton: string }} o @returns {string} */
function scriptInstallationRelaisWord({ url, poste, jeton }) {
  const lignes = [
    "' Installe sur ce poste le relais Word de CLAIRE (Aide a la redaction : le paragraphe ou se trouve le curseur de Word),",
    "' pour la session Windows en cours, sans droit d'administrateur. Pour le retirer : supprimer la valeur CLAIRE-Word de",
    "' HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run et les fichiers word-claire.* de %APPDATA%\\CLAIRE.",
    'Option Explicit',
    'Dim sh, fso, dossier, f, l',
    'Set sh = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'dossier = sh.ExpandEnvironmentStrings("%APPDATA%") & "\\CLAIRE"',
    'If Not fso.FolderExists(dossier) Then fso.CreateFolder dossier',
    // Le script PowerShell en Unicode : la valeur insérée et le texte de Word gardent leurs accents.
    'Set f = fso.CreateTextFile(dossier & "\\word-claire.ps1", True, True)'
  ];
  for (const l of lignesRelaisWordPs({ url, poste, jeton })) lignes.push('f.WriteLine ' + litteralVbs(l));
  lignes.push('f.Close', 'Set f = fso.CreateTextFile(dossier & "\\word-claire.vbs", True)');
  for (const l of LIGNES_LANCEUR_RELAIS_WORD) lignes.push('f.WriteLine ' + litteralVbs(l));
  lignes.push(
    'f.Close',
    'l = dossier & "\\word-claire.vbs"',
    'sh.RegWrite "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\CLAIRE-Word", "wscript.exe """ & l & """", "REG_SZ"',
    'sh.Run "wscript.exe """ & l & """", 0, False',
    'MsgBox "Le relais Word de CLAIRE est installe : l Aide a la redaction suit le paragraphe ou se trouve le curseur de Word." & vbCrLf & vbCrLf & "Il demarre seul a chaque ouverture de session.", 64, "CLAIRE"'
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
  if (!empreinte || !jeton || typeof jeton !== 'string') return false;
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
/** @typedef {{ vu: number, word: boolean, titre: string, paragraphe: string, n: number, commandes: CommandeWord[], resultats: { id: string, ok: boolean, message: string, t: number }[] }} PosteWord */

function creerEtatRelaisWord() {
  return { postes: /** @type {Map<string, PosteWord>} */ (new Map()) };
}

/** @param {ReturnType<typeof creerEtatRelaisWord>} etat @param {string} poste @returns {PosteWord} */
function postePourWord(etat, poste) {
  let p = etat.postes.get(poste);
  if (!p) { p = { vu: 0, word: false, titre: '', paragraphe: '', n: 0, commandes: [], resultats: [] }; etat.postes.set(poste, p); }
  return p;
}

// Pure (sur l'état) : un relevé du relais. Rend les commandes à exécuter (retirées de la file).
/** @param {ReturnType<typeof creerEtatRelaisWord>} etat @param {string} poste @param {any} corps @param {number} [maintenant] */
function appliquerReleveWord(etat, poste, corps, maintenant = Date.now()) {
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
  return commandes.map(c => ({ id: c.id, valeur: c.valeur, occurrence: c.occurrence, attendu: c.attendu }));
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
    n: p ? p.n : 0,
    resultats: p ? p.resultats.map(r => ({ id: r.id, ok: r.ok, message: r.message })) : []
  };
}

module.exports = {
  scriptInstallationRelaisWord, lignesRelaisWordPs, LIGNES_LANCEUR_RELAIS_WORD,
  empreinteJeton, nouveauJeton, jetonValide, texteWord,
  creerEtatRelaisWord, appliquerReleveWord, demanderInsertionWord, etatPosteWord, RELAIS_VU_MS
};
