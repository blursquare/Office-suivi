// @ts-check
'use strict';

// Relais CLAIRE d'un poste, version 2 (étude 26/10 : Panda Endpoint Protection bloque CLAIRE-relais.exe compilé en C# — « non,
// Fichorga ne répondra pas, trouve comment faire », puis « sous la forme exe mais une autre techno, regarde : CLAIRE n'est pas
// bloquée via son exe », « vas-y pour le relais »).
//
// Le relais n'est plus un programme à part : c'est CLAIRE-serveur.exe LUI-MÊME (Node, construit par l'outil officiel de Node —
// celui que l'antivirus laisse passer), téléchargé par le poste sous le nom « CLAIRE-relais.exe » ; sous ce nom (ou avec
// « --relais »), l'exécutable ne démarre pas le serveur mais ce relais (src/entree.js). Ce que Node ne sait pas faire seul sous
// Windows passe par PowerShell, déjà signé et présent sur chaque poste, comme le lien des appels 3CX (relaisAppelReg.js) :
//   - notifications : toasts de Windows (centre de notifications), au nom de « CLAIRE » (identifiant d'application déclaré dans
//     HKCU à l'installation) ; boutons « Répondre » (petite fenêtre de réponse, repondre.html), réactions d'humeur, « Autoriser » / « Refuser »
//     d'une proposition, clic = CLAIRE ouverte ; chaque bouton lance le lien `claire-relais:` que ce même programme reçoit ;
//   - fenêtre CLAIRE au premier plan (UI Automation + AppActivate, aucun code compilé) ;
//   - code d'installation demandé et messages par les boîtes de dialogue de Windows.
// Ce qui ne passe plus (sans code natif) : la pastille rouge chiffrée sur l'icône de la barre des tâches, et la mise au premier plan
// à la sonnerie 3CX — le relais ne la déclare plus (`appels` absent du relevé) : le serveur garde le chemin du fichier .reg
// (relaisAppelReg.js), comme avant le relais.
//
// Rien de ce qu'un antivirus prend pour un logiciel espion : ni presse-papiers lu (le code est collé par l'utilisateur), ni frappe
// observée, ni processus arrêté de force (l'ancien relais en marche est prié de s'arrêter par son signal nommé), ni marque
// « téléchargé d'Internet » effacée, aucun script écrit sur le disque, aucune commande PowerShell encodée.
// Fonctions pures exportées et testées sous Linux ; ce qui touche Windows est injectable.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
// Une connexion gardée ouverte pour le relevé de chaque seconde (audit 0.354.0, B5).
const AGENT_HTTP = new http.Agent({ keepAlive: true, maxSockets: 2 });
const AGENT_HTTPS = new https.Agent({ keepAlive: true, maxSockets: 2 });

var VERSION_RELAIS = '2.2';
var PREFIXE_CODE = 'CLAIRE-RELAIS:';
var PROTOCOLE = 'claire-relais';
var AUMID = 'CLAIRE.Relais';
var CLE_RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
var TITRE = 'CLAIRE';
// Réactions d'humeur proposées sur un message (les mêmes que la carte du relais 1.x, notificationsPoste.EMOJIS_CARTE) : deux, la
// place d'un toast étant de cinq boutons.
var REACTIONS_TOAST = ['👍', '❤️'];
var MAX_TOASTS_PAR_RELEVE = 3;
// Titre de la fenêtre CLAIRE (index.html, <title>), écrit en ASCII pour PowerShell.
var TITRE_FENETRE_PS = "'CLAIRE '+[char]0x2014+' Registre des '+[char]0xE9+'ch'+[char]0xE9+'ances notariales'";

// ---- Fonctions pures ----

/** Le JSON d'un code d'installation (« CLAIRE-RELAIS: » + base64), ou null. @param {unknown} code @returns {any} */
function configDuCode(code) {
  const c = String(code || '').trim();
  const i = c.indexOf(PREFIXE_CODE);
  if (i < 0) return null;
  const b64 = (/^[A-Za-z0-9+/=]+/.exec(c.slice(i + PREFIXE_CODE.length)) || [''])[0];
  try { return configValide(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))); } catch (_) { return null; }
}

/** La configuration si elle est complète (adresse http(s) finie par « / », collaborateur, jeton), sinon null. @param {any} cfg */
function configValide(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;
  const url = typeof cfg.url === 'string' ? cfg.url : '';
  const poste = typeof cfg.poste === 'string' ? cfg.poste : '';
  const jeton = typeof cfg.jeton === 'string' ? cfg.jeton : '';
  const profil = typeof cfg.profil === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(cfg.profil) ? cfg.profil : 'Claire';
  if (!/^https?:\/\/[^\s"'<>]+\/$/.test(url) || !/^[a-z0-9-]{1,40}$/.test(poste) || !/^[A-Za-z0-9]{16,128}$/.test(jeton)) return null;
  return { url, poste, jeton, profil };
}

/** Pure : le mode demandé par la ligne de commande. @param {string[]} args @returns {{ mode: string, lien?: string }} */
function modeDepuisArgs(args) {
  const a = Array.isArray(args) ? args : [];
  const i = a.indexOf('--action');
  if (i >= 0) return { mode: 'action', lien: String(a[i + 1] || '') };
  if (a.includes('--retirer')) return { mode: 'retirer' };
  if (a.includes('--verifier')) return { mode: 'verifier' };
  if (a.includes('--fond')) return { mode: 'fond' };
  return { mode: 'installer' };
}

/** Pure : un texte pour du XML (attribut ou contenu). @param {unknown} v */
function xml(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Pure : un lien `claire-relais:` (action + paramètres). @param {string} action @param {Record<string, string>} [p] */
function lienAction(action, p) {
  const q = Object.entries(p || {}).filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(String(v).slice(0, 120))).join('&');
  return PROTOCOLE + ':' + action + (q ? '?' + q : '');
}

var ACTIONS = ['ouvrir', 'repondre', 'reagir', 'autoriser', 'refuser'];

/**
 * Pure : l'action d'un lien `claire-relais:` reçu de Windows, ou null. Jamais lu comme du code : action connue, paramètres
 * réduits à des identifiants (canal « d:… », « l:… », « p:… », « general » ; message, proposition) ou à un emoji permis.
 * @param {unknown} lien
 */
function actionDuLien(lien) {
  const m = /^claire-relais:\/*([a-z]+)(?:\?(.*))?$/.exec(String(lien || '').trim());
  if (!m || !ACTIONS.includes(m[1])) return null;
  /** @type {Record<string, string>} */
  const p = {};
  for (const morceau of String(m[2] || '').split('&')) {
    const [k, v] = morceau.split('=');
    if (!k || v === undefined) continue;
    try { p[k] = decodeURIComponent(v); } catch (_) { /* paramètre illisible : ignoré */ }
  }
  const canal = /^(general|@traiter|[dlp]:[A-Za-z0-9_.:-]{1,70})$/.test(p.canal || '') ? p.canal : '';
  const ident = (/** @type {string} */ v) => (/^[A-Za-z0-9_-]{1,80}$/.test(v || '') ? v : '');
  // `titre` : l'endroit du message (dossier, canal), affiché en TEXTE par la petite fenêtre de réponse ; 80 caractères au plus.
  const titre = String(p.titre || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80);
  const r = { action: m[1], canal, mid: ident(p.mid), parent: ident(p.parent), id: ident(p.id), emoji: REACTIONS_TOAST.includes(p.emoji) ? p.emoji : '', titre };
  if (r.action === 'reagir' && !(r.canal && r.mid && r.emoji)) return null;
  if ((r.action === 'autoriser' || r.action === 'refuser') && !r.id) return null;
  if (r.action === 'repondre' && !(r.canal && r.canal !== '@traiter' && r.mid)) return null;
  return r;
}

/**
 * Pure : le XML du toast d'une carte écrite par le serveur (notificationsPoste.js : message, réaction, proposition, résumé).
 * `photo` : chemin d'un fichier image déjà écrit (photo de l'auteur), sinon ''.
 * @param {any} n @param {string} [photo]
 */
function toastXml(n, photo) {
  const t = (/** @type {string} */ k) => (n && n[k] != null ? String(n[k]) : '');
  const type = t('type');
  const nom = type === 'message' ? t('auteur') : type === 'reaction' ? (t('auteur') + ' a réagi ' + t('emoji')).trim() : type === 'proposition' ? 'Proposition de CLAIRE' : t('titre') || 'CLAIRE';
  const ou = type === 'message' ? [t('contexte'), t('titre'), t('heure')].filter(Boolean).join(' · ') : type === 'proposition' || type === 'reaction' ? t('titre') : '';
  const texte = type === 'reaction' && t('texte') ? '« ' + t('texte') + ' »' : t('texte');
  const canal = t('canal');
  const ouvrir = lienAction('ouvrir', { canal });
  /** @type {string[]} */
  const actions = [];
  if (type === 'message') {
    // « Répondre » : la petite fenêtre de réponse (repondre.html) au-dessus des notifications ; sans identifiant de message, CLAIRE.
    const repondre = t('mid') && canal ? lienAction('repondre', { canal, mid: t('mid'), titre: ou }) : ouvrir;
    actions.push(`<action content="Répondre" activationType="protocol" arguments="${xml(repondre)}"/>`);
    if (t('mid')) for (const e of REACTIONS_TOAST) actions.push(`<action content="${xml(e)}" activationType="protocol" arguments="${xml(lienAction('reagir', { canal, mid: t('mid'), emoji: e }))}"/>`);
  } else if (type === 'proposition' && t('id')) {
    actions.push(`<action content="Autoriser" activationType="protocol" arguments="${xml(lienAction('autoriser', { id: t('id') }))}"/>`);
    actions.push(`<action content="Refuser" activationType="protocol" arguments="${xml(lienAction('refuser', { id: t('id') }))}"/>`);
  }
  const image = photo ? `<image placement="appLogoOverride" hint-crop="circle" src="${xml(photo)}"/>` : '';
  return `<toast launch="${xml(ouvrir)}" activationType="protocol"><visual><binding template="ToastGeneric">`
    + `<text>${xml(nom.slice(0, 80))}</text>${texte ? `<text>${xml(texte.slice(0, 240))}</text>` : ''}`
    + `${ou ? `<text placement="attribution">${xml(ou.slice(0, 80))}</text>` : ''}${image}</binding></visual>`
    + `${actions.length ? `<actions>${actions.join('')}</actions>` : ''}</toast>`;
}

/** Pure : une chaîne PowerShell entre apostrophes. @param {string} v */
function litteralPs(v) {
  return "'" + String(v).replace(/'/g, "''") + "'";
}

// Identifiant de PowerShell, que Windows connaît toujours : secours quand « CLAIRE.Relais » n'est pas permis (étude 26/10 : « je n'ai
// aucune notif » — Windows écarte EN SILENCE la notification d'une application qu'il ne reconnaît pas).
var AUMID_SECOURS = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';

/**
 * Pure : le script qui montre les toasts (XML passés par la variable CLAIRE_TOASTS, en base64 séparés d'une espace). Il demande
 * d'abord à Windows si « CLAIRE » a le droit de notifier (Setting : Enabled, DisabledForApplication, DisabledForUser,
 * DisabledByGroupPolicy, DisabledByManifest) ; sinon, l'identifiant de PowerShell. Écrit sur la sortie l'état lu (« Enabled »,
 * « DisabledForUser>secours »…), rendu au serveur au relevé suivant.
 */
function scriptToasts() {
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    '$null=[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]',
    '$null=[Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime]',
    `$n=[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(${litteralPs(AUMID)})`,
    "$r='Inconnu';try{$r=[string]$n.Setting}catch{}",
    // Secours seulement quand Windows ne RECONNAÎT pas « CLAIRE » (relecture 0.354.3) : une coupure voulue (par l'utilisateur pour
    // CLAIRE, pour tout le poste, ou par une stratégie de groupe) n'est jamais contournée — elle est dite dans les Réglages.
    `if($r -eq 'DisabledByManifest' -or $r -eq 'Inconnu'){$n=[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(${litteralPs(AUMID_SECOURS)});$r=$r+'>secours'}`,
    "$e=0;foreach($b in ($env:CLAIRE_TOASTS -split ' ')){if($b){try{$x=New-Object Windows.Data.Xml.Dom.XmlDocument;$x.LoadXml([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)));$n.Show((New-Object Windows.UI.Notifications.ToastNotification $x))}catch{$e++}}}",
    "if($e){$r=$r+'>echec'};[Console]::Out.Write($r)"
  ].join(';');
}

/** Pure : l'état des notifications rendu par le script (lettres et « > » seulement, 60 caractères au plus), sinon ''. @param {unknown} v */
function etatToasts(v) {
  const t = String(v || '').trim();
  return /^[A-Za-z>]{1,60}$/.test(t) ? t : '';
}

/** Pure : le script qui met la fenêtre CLAIRE au premier plan, sinon l'ouvre (adresse et profil par CLAIRE_URL, CLAIRE_PROFIL). */
function scriptMontrerClaire() {
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    `$t=${TITRE_FENETRE_PS}`,
    'Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes',
    '$A=[System.Windows.Automation.AutomationElement]',
    '$w=$A::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children,(New-Object System.Windows.Automation.PropertyCondition($A::NameProperty,$t)))',
    'if($w){'
      + 'try{$p=$w.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern);if($p.Current.WindowVisualState -eq 2){$p.SetWindowVisualState(0)}}catch{};'
      + '$s=New-Object -ComObject WScript.Shell;[void]$s.AppActivate($t);try{$w.SetFocus()}catch{}'
      + '}else{'
      + "$g=@(('--profile-directory='+$env:CLAIRE_PROFIL),('--app='+$env:CLAIRE_URL));"
      + 'try{Start-Process chrome.exe -ArgumentList $g -ErrorAction Stop}catch{Start-Process msedge.exe -ArgumentList $g}'
      + '}'
  ].join(';');
}

/**
 * Pure : le script qui ouvre la petite fenêtre de réponse (adresse par CLAIRE_URL, profil par CLAIRE_PROFIL), puis la place en 420 × 560 en bas à
 * droite de l'écran principal, au-dessus de la zone des notifications — même navigateur et même profil que la fenêtre CLAIRE
 * (son jeton et le collaborateur du poste y sont déjà).
 */
function scriptFenetreReponse() {
  // Sans --window-size ni --window-position (relecture 0.355.0 : Chrome déjà lancé les ignore, Chrome à lancer les appliquerait à
  // toutes ses fenêtres) : la fenêtre ouverte est retrouvée par son titre (repondre.html) puis placée par UI Automation.
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    'Add-Type -AssemblyName System.Windows.Forms,UIAutomationClient,UIAutomationTypes',
    '$a=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea',
    "$g=@(('--profile-directory='+$env:CLAIRE_PROFIL),('--app='+$env:CLAIRE_URL))",
    'try{Start-Process chrome.exe -ArgumentList $g -ErrorAction Stop}catch{Start-Process msedge.exe -ArgumentList $g}',
    "$t='R'+[char]0xE9+'pondre '+[char]0xB7+' CLAIRE'",
    '$A=[System.Windows.Automation.AutomationElement]',
    '$c=New-Object System.Windows.Automation.PropertyCondition($A::NameProperty,$t)',
    'for($i=0;$i -lt 30;$i++){Start-Sleep -Milliseconds 200;$w=$A::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children,$c);if($w){break}}',
    'if($w){try{$p=$w.GetCurrentPattern([System.Windows.Automation.TransformPattern]::Pattern);$p.Resize(420,560);$p.Move([Math]::Max(0,$a.Right-440),[Math]::Max(0,$a.Bottom-580))}catch{}}'
  ].join(';');
}

/** Pure : l'adresse de la petite fenêtre de réponse. @param {string} url adresse de CLAIRE (finie par « / ») @param {{ canal: string, mid: string, titre?: string }} a */
function adresseReponse(url, a) {
  const q = new URLSearchParams({ canal: a.canal, mid: a.mid });
  if (a.titre) q.set('titre', a.titre);
  return url + 'repondre.html#' + q.toString();
}

/** Pure : le script qui demande le code d'installation (rend le texte saisi sur la sortie). */
function scriptDemanderCode() {
  return [
    'Add-Type -AssemblyName Microsoft.VisualBasic',
    '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
    '[Microsoft.VisualBasic.Interaction]::InputBox($env:CLAIRE_QUESTION,$env:CLAIRE_TITRE,"")'
  ].join(';');
}

/** Pure : le script d'un message (texte par CLAIRE_MESSAGE, icône 64 information, 48 avertissement, 16 erreur par CLAIRE_ICONE). */
function scriptMessage() {
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    '[void][System.Windows.Forms.MessageBox]::Show($env:CLAIRE_MESSAGE,$env:CLAIRE_TITRE,0,[int]$env:CLAIRE_ICONE)'
  ].join(';');
}

/** Pure : prie le relais 1.x (C#) en marche de s'arrêter, par son signal nommé (jamais un processus arrêté de force). */
function scriptArreterAncien() {
  return "try{[void][System.Threading.EventWaitHandle]::OpenExisting('Local\\CLAIRE-relais-arret').Set()}catch{}";
}

/**
 * Pure : les commandes reg.exe de l'installation (démarrage, lien `claire-relais:`, nom et icône des notifications). L'exécutable
 * est lancé directement ; application console, il se relance aussitôt détaché, sans fenêtre (lancerRelais) — jamais par
 * un hôte de console caché, procédé que des antivirus surveillent (audit 0.354.0).
 * @param {string} exe @param {string} icone
 */
function commandesRegistre(exe, icone) {
  const lance = (/** @type {string} */ args) => `"${exe}" ${args}`;
  const classe = 'HKCU\\Software\\Classes\\' + PROTOCOLE;
  return [
    ['add', CLE_RUN, '/v', 'CLAIRE-relais', '/t', 'REG_SZ', '/d', lance('--fond'), '/f'],
    ['add', classe, '/ve', '/t', 'REG_SZ', '/d', 'URL:CLAIRE relais', '/f'],
    ['add', classe, '/v', 'URL Protocol', '/t', 'REG_SZ', '/d', '', '/f'],
    ['add', classe + '\\shell\\open\\command', '/ve', '/t', 'REG_SZ', '/d', lance('--action "%1"'), '/f'],
    ['add', 'HKCU\\Software\\Classes\\AppUserModelId\\' + AUMID, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', TITRE, '/f'],
    ...(icone ? [['add', 'HKCU\\Software\\Classes\\AppUserModelId\\' + AUMID, '/v', 'IconUri', '/t', 'REG_SZ', '/d', icone, '/f']] : [])
  ];
}

function commandesRetrait() {
  return [
    ['delete', CLE_RUN, '/v', 'CLAIRE-relais', '/f'],
    ['delete', 'HKCU\\Software\\Classes\\' + PROTOCOLE, '/f'],
    ['delete', 'HKCU\\Software\\Classes\\AppUserModelId\\' + AUMID, '/f']
  ];
}

/** Pure : le nom du tuyau nommé qui fait du relais une instance unique par session Windows. @param {string} [utilisateur] */
function nomTuyau(utilisateur) {
  return '\\\\.\\pipe\\CLAIRE-relais-' + String(utilisateur || 'poste').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

// ---- Windows (injectable) ----

/**
 * Les dépendances qui touchent le système : remplacées par les tests.
 * @param {any} [o]
 */
function systeme(o) {
  const env = (o && o.env) || process.env;
  const local = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return Object.assign({
    env,
    dossierClaire: path.join(local, 'CLAIRE'),
    dossierProgramme: path.join(local, 'Programs', 'CLAIRE'),
    exe: process.execPath,
    /**
     * `fenetre` : une boîte de dialogue (code d'installation, message). Sans elle, « windowsHide » cache AUSSI la première fenêtre
     * ouverte par PowerShell — la boîte « Collez le code » restait invisible derrière une console vide (étude 26/10, relais 2.0).
     * PowerShell partage alors la console du relais : aucune fenêtre en plus.
     * @param {string} script @param {Record<string, string>} [vars] @param {{ fenetre?: boolean }} [o] @returns {Promise<string>}
     */
    powershell(script, vars, o) {
      return new Promise((resolve) => {
        let sortie = '';
        const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: !(o && o.fenetre), env: Object.assign({}, env, vars || {}) });
        p.stdout.on('data', (d) => { sortie += d; });
        p.on('error', () => resolve(''));
        p.on('close', () => resolve(sortie));
      });
    },
    /** @param {string[]} args @returns {Promise<boolean>} */
    reg(args) {
      return new Promise((resolve) => {
        const p = spawn('reg.exe', args, { windowsHide: true, stdio: 'ignore' });
        p.on('error', () => resolve(false));
        p.on('close', (c) => resolve(c === 0));
      });
    },
    /** @param {string} exe @param {string[]} args */
    lancerDetache(exe, args) {
      const p = spawn(exe, args, { detached: true, windowsHide: true, stdio: 'ignore', cwd: path.dirname(exe) });
      p.on('error', () => {});
      p.unref();
    },
    poster,
    obtenir
  }, o || {});
}

/** POST JSON vers le serveur du bureau (jamais par un proxy) : { statut, json }. @param {string} adresse @param {any} corps */
function poster(adresse, corps) {
  return requete(adresse, 'POST', Buffer.from(JSON.stringify(corps), 'utf8')).then((r) => {
    let json = null;
    try { json = JSON.parse(r.corps.toString('utf8')); } catch (_) { json = null; }
    return { statut: r.statut, json };
  });
}

/** GET d'un fichier (l'icône) : { statut, corps }. @param {string} adresse */
function obtenir(adresse) { return requete(adresse, 'GET', null); }

/** @param {string} adresse @param {string} methode @param {Buffer | null} corps @returns {Promise<{ statut: number, corps: Buffer }>} */
function requete(adresse, methode, corps) {
  return new Promise((resolve, reject) => {
    const u = new URL(adresse);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, { method: methode, agent: u.protocol === 'https:' ? AGENT_HTTPS : AGENT_HTTP, timeout: 5000, headers: corps ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': corps.length } : {} }, (res) => {
      const morceaux = [];
      res.on('data', (d) => morceaux.push(d));
      res.on('end', () => resolve({ statut: res.statusCode || 0, corps: Buffer.concat(morceaux) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('délai dépassé')));
    req.on('error', reject);
    if (corps) req.write(corps);
    req.end();
  });
}

// ---- Relais ----

/** @param {ReturnType<typeof systeme>} s */
function lireConfig(s) {
  try { return configValide(JSON.parse(fs.readFileSync(path.join(s.dossierClaire, 'relais.json'), 'utf8'))); } catch (_) { return null; }
}

/** @param {ReturnType<typeof systeme>} s @param {string} message @param {number} [icone] */
function dire(s, message, icone) {
  return s.powershell(scriptMessage(), { CLAIRE_MESSAGE: message, CLAIRE_TITRE: TITRE, CLAIRE_ICONE: String(icone || 64) }, { fenetre: true });
}

/** La fenêtre CLAIRE devant (ouverte si elle est fermée). @param {ReturnType<typeof systeme>} s @param {any} cfg @param {string} [ancre] */
function montrerClaire(s, cfg, ancre) {
  return s.powershell(scriptMontrerClaire(), { CLAIRE_URL: cfg.url + (ancre || ''), CLAIRE_PROFIL: cfg.profil });
}

/** Prie un relais en marche de s'arrêter (tuyau nommé du relais 2, signal du relais 1.x). @param {ReturnType<typeof systeme>} s */
async function arreterRelaisEnMarche(s) {
  await new Promise((resolve) => {
    const c = net.connect(nomTuyau(s.env.USERNAME), () => { c.end('arret\n'); });
    c.on('close', resolve);
    c.on('error', resolve);
    setTimeout(resolve, 3000);
  });
  await s.powershell(scriptArreterAncien());
  // Le relais arrêté rend son fichier : petite attente avant de le remplacer.
  await new Promise((r) => setTimeout(r, 1500));
}

/** @param {ReturnType<typeof systeme>} s */
async function installer(s) {
  const saisi = (await s.powershell(scriptDemanderCode(), {
    CLAIRE_QUESTION: "Collez ici (Ctrl+V) le code d'installation que CLAIRE vient de copier (Réglages › Notifications, bouton d'installation du relais) :",
    CLAIRE_TITRE: TITRE
  }, { fenetre: true })).trim();
  if (!saisi) return 1;
  const cfg = configDuCode(saisi);
  if (!cfg) { await dire(s, "Ce code n'est pas un code d'installation de CLAIRE. Recommencez depuis CLAIRE : le bouton d'installation du relais copie le code.", 48); return 1; }
  let r;
  try { r = await s.poster(cfg.url + 'api/relais-word/releve', { poste: cfg.poste, jeton: cfg.jeton, verifier: true }); }
  catch (_) { await dire(s, `Le serveur CLAIRE (${cfg.url}) ne répond pas : installation abandonnée.`, 48); return 1; }
  if (r.statut === 403) { await dire(s, 'CLAIRE ne reconnaît pas ce code (un code plus récent a été demandé depuis). Recommencez depuis CLAIRE.', 48); return 1; }
  if (r.statut !== 200) { await dire(s, `Le serveur CLAIRE n'a pas accepté le code (adresse ${cfg.url}) : installation abandonnée.`, 48); return 1; }
  try {
    fs.mkdirSync(s.dossierClaire, { recursive: true });
    fs.mkdirSync(s.dossierProgramme, { recursive: true });
    const cible = path.join(s.dossierProgramme, 'CLAIRE-relais.exe');
    await arreterRelaisEnMarche(s);
    if (path.resolve(s.exe).toLowerCase() !== path.resolve(cible).toLowerCase()) {
      for (let essai = 0; ; essai++) {
        try { fs.copyFileSync(s.exe, cible); break; }
        catch (e) { if (essai >= 10) throw e; await new Promise((res) => setTimeout(res, 1000)); }
      }
    }
    // L'icône des notifications, servie par CLAIRE (hors session).
    let icone = '';
    try {
      const ico = await s.obtenir(cfg.url + 'api/poste/icone.ico');
      if (ico.statut === 200 && ico.corps.length) { icone = path.join(s.dossierClaire, 'claire.ico'); fs.writeFileSync(icone, ico.corps); }
    } catch (_) { /* sans icône : celle de Windows */ }
    fs.writeFileSync(path.join(s.dossierClaire, 'relais.json'), JSON.stringify(cfg));
    for (const args of commandesRegistre(cible, icone)) await s.reg(args);
    s.lancerDetache(cible, ['--fond']);
    await dire(s, 'Le relais CLAIRE de ce poste est installé : les notifications de CLAIRE (répondre, réagir, autoriser) arrivent dans le centre de notifications de Windows.\n\n'
      + "Il démarre seul à chaque ouverture de session. Pour le retirer : CLAIRE-relais.exe --retirer.");
    return 0;
  } catch (e) {
    await dire(s, 'Installation impossible : ' + String(e && /** @type {any} */ (e).code || 'erreur') + '.', 16);
    return 1;
  }
}

/** @param {ReturnType<typeof systeme>} s */
async function retirer(s) {
  await arreterRelaisEnMarche(s);
  for (const args of commandesRetrait()) await s.reg(args);
  for (const f of [path.join(s.dossierProgramme, 'CLAIRE-relais.exe'), path.join(s.dossierClaire, 'relais.json'), path.join(s.dossierClaire, 'claire.ico')]) {
    try { fs.unlinkSync(f); } catch (_) { /* déjà absent, ou programme en cours */ }
  }
  await dire(s, 'Le relais CLAIRE de ce poste est retiré.');
  return 0;
}

/** Un bouton d'un toast (lien `claire-relais:`) : fait par ce processus, lancé par Windows. @param {ReturnType<typeof systeme>} s @param {string} lien */
async function agir(s, lien) {
  const cfg = lireConfig(s);
  const a = actionDuLien(lien);
  if (!cfg || !a) return 1;
  const corps = { poste: cfg.poste, jeton: cfg.jeton, relais: VERSION_RELAIS };
  // Répondre : la petite fenêtre de réponse, sans mettre la fenêtre CLAIRE devant (étude 26/10 : répondre « devant », comme Teams).
  if (a.action === 'repondre') { await s.powershell(scriptFenetreReponse(), { CLAIRE_URL: adresseReponse(cfg.url, a), CLAIRE_PROFIL: cfg.profil }); return 0; }
  try {
    if (a.action === 'reagir') { await s.poster(cfg.url + 'api/relais-word/reagir', Object.assign(corps, { canal: a.canal, mid: a.mid, emoji: a.emoji })); return 0; }
    // Autoriser et refuser se font dans la fenêtre CLAIRE (un refus y est confirmé : audit 0.354.0, M4), jamais par le relais seul.
    if (a.action === 'autoriser' || a.action === 'refuser') await s.poster(cfg.url + 'api/relais-word/decider', Object.assign(corps, { decision: a.action === 'refuser' ? 'refuser-fenetre' : 'autoriser', id: a.id }));
    else await s.poster(cfg.url + 'api/relais-word/ouvrir', Object.assign(corps, { canal: a.canal }));
  } catch (_) { /* serveur injoignable : CLAIRE est montrée quand même */ }
  // « Ouvrir » et « Autoriser » : la fenêtre CLAIRE devant fait le geste (comme d'un clic), jamais le relais.
  await montrerClaire(s, cfg);
  return 0;
}

/** Photo de l'auteur (data:image/jpeg;base64) gardée en fichier pour le toast ; '' sinon. @param {ReturnType<typeof systeme>} s @param {unknown} photo */
function fichierPhoto(s, photo) {
  // Le serveur rend le base64 BRUT de la photo (photosCollaborateurs.js : JPEG) ; une adresse data: est aussi acceptée.
  const brut = String(photo || '');
  const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]{100,400000})$/.exec(brut)
    || (/^\/9j\/[A-Za-z0-9+/=]{96,400000}$/.test(brut) ? [brut, 'jpeg', brut] : /^iVBORw0KGgo[A-Za-z0-9+/=]{89,400000}$/.test(brut) ? [brut, 'png', brut] : null);
  if (!m) return '';
  try {
    const octets = Buffer.from(m[2], 'base64');
    const nom = crypto.createHash('sha256').update(octets).digest('hex').slice(0, 16) + (m[1] === 'png' ? '.png' : '.jpg');
    const dossier = path.join(s.dossierClaire, 'photos');
    fs.mkdirSync(dossier, { recursive: true });
    const f = path.join(dossier, nom);
    if (!fs.existsSync(f)) fs.writeFileSync(f, octets);
    return f;
  } catch (_) { return ''; }
}

/**
 * Le relais en marche : un relevé par seconde (POST /api/relais-word/releve), les cartes rendues par le serveur montrées en toasts.
 * Une seule instance par session Windows (tuyau nommé) ; « arret » reçu sur le tuyau = fin.
 * @param {ReturnType<typeof systeme>} s @param {{ tours?: number, pause?: number }} [o]
 */
async function boucle(s, o = {}) {
  const cfg = lireConfig(s);
  if (!cfg) return 1;
  let fin = false;
  // La pause en cours (relevé suivant, ou 30 s après un refus) : « arret » la réveille, pour que l'installation d'une nouvelle
  // version trouve le programme libéré en une seconde (relecture 0.354.0 : la copie échouait sur un fichier encore en marche).
  /** @type {() => void} */
  let reveiller = () => {};
  const pause = (/** @type {number} */ ms) => fin ? Promise.resolve() : new Promise((res) => { const t = setTimeout(res, ms); reveiller = () => { clearTimeout(t); res(undefined); }; });
  const serveur = o.tours ? null : await new Promise((resolve) => {
    const t = net.createServer((c) => { c.on('data', (d) => { if (String(d).startsWith('arret')) { fin = true; reveiller(); c.end(); } }); c.on('error', () => {}); });
    t.on('error', () => resolve(null));
    t.listen(nomTuyau(s.env.USERNAME), () => resolve(t));
  });
  if (!o.tours && !serveur) return 0;   // un relais tourne déjà dans cette session
  let refus = 0;
  let tour = 0;
  // Ce que Windows a dit des dernières notifications (scriptToasts), rendu au serveur à chaque relevé : Réglages › Notifications le montre.
  let etatWindows = '';
  try {
    while (!fin && (!o.tours || tour < o.tours)) {
      tour++;
      try {
        const r = await s.poster(cfg.url + 'api/relais-word/releve', { poste: cfg.poste, jeton: cfg.jeton, word: false, inchange: true, pastille: 1, relais: VERSION_RELAIS, ...(etatWindows ? { toasts: etatWindows } : {}) });
        if (r.statut === 403) {
          // Jeton refusé (relais réinstallé ailleurs ou retiré) : on ralentit, puis on s'arrête.
          if (++refus >= 10) return 0;
          await pause(o.pause === undefined ? 30000 : o.pause);
          continue;
        }
        refus = 0;
        const cartes = (r.json && Array.isArray(r.json.notifications) ? r.json.notifications : []).filter((n) => n && n.titre).slice(0, MAX_TOASTS_PAR_RELEVE);
        if (cartes.length) {
          const toasts = cartes.map((n) => Buffer.from(toastXml(n, fichierPhoto(s, n.photo)), 'utf8').toString('base64')).join(' ');
          etatWindows = etatToasts(await s.powershell(scriptToasts(), { CLAIRE_TOASTS: toasts })) || 'Muet';
        }
      } catch (_) { /* serveur injoignable : relevé suivant */ }
      await pause(o.pause === undefined ? 1000 : o.pause);
    }
  } finally {
    if (serveur) serveur.close();
  }
  return 0;
}

/** Le relais (src/entree.js l'appelle sous le nom CLAIRE-relais.exe ou avec --relais). @param {string[]} args @param {any} [o] */
async function lancerRelais(args, o) {
  const s = systeme(o);
  const m = modeDepuisArgs(args);
  // Lancé par Windows (démarrage de session, bouton d'une notification) dans une fenêtre console : relancé aussitôt DÉTACHÉ (sans
  // console ni fenêtre), cette fenêtre-ci se ferme dans l'instant.
  if ((m.mode === 'fond' || m.mode === 'action') && !(args || []).includes('--detache') && (o && 'console' in o ? o.console : process.stdout.isTTY)) {
    s.lancerDetache(s.exe, [...args, '--detache']);
    return 0;
  }
  if (m.mode === 'action') return agir(s, m.lien || '');
  if (m.mode === 'retirer') return retirer(s);
  if (m.mode === 'fond') return boucle(s);
  if (m.mode === 'verifier') {
    const cfg = lireConfig(s);
    if (!cfg) { console.log('configuration illisible'); return 2; }
    try { const r = await s.poster(cfg.url + 'api/relais-word/releve', { poste: cfg.poste, jeton: cfg.jeton, verifier: true }); console.log(r.statut === 200 ? 'ok ' + cfg.url + ' ' + cfg.poste : 'refusé ' + r.statut); return r.statut === 200 ? 0 : 3; }
    catch (e) { console.log('serveur : ' + (e && /** @type {any} */ (e).message)); return 3; }
  }
  return installer(s);
}

/** Pure : l'exécutable lancé est-il le relais ? (nom CLAIRE-relais*.exe, ou --relais) @param {string} exe @param {string[]} args */
function estModeRelais(exe, args) {
  return /^claire-relais/i.test(path.win32.basename(String(exe || ''))) || (Array.isArray(args) && args.includes('--relais'));
}

module.exports = {
  VERSION_RELAIS, PROTOCOLE, AUMID, AUMID_SECOURS, REACTIONS_TOAST, etatToasts, configDuCode, configValide, modeDepuisArgs, lienAction, actionDuLien, toastXml, scriptFenetreReponse, adresseReponse,
  scriptToasts, scriptMontrerClaire, scriptDemanderCode, scriptMessage, scriptArreterAncien, commandesRegistre, commandesRetrait, nomTuyau,
  estModeRelais, lancerRelais, boucle, agir, installer
};
