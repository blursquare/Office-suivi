// @ts-check
'use strict';

// Relais CLAIRE d'un poste (étude 12/10) : l'Aide à la rédaction suit le curseur de Word (« que CLAIRE sache où je suis sans avoir
// à faire de copier-coller ») et, depuis 0.220.1, chaque sonnerie 3CX met au premier plan la fenêtre CLAIRE (appelant d'un dossier)
// ou la fenêtre d'avant la sonnerie.
//
// Le relais est un petit programme Windows, server/relais/CLAIRE-relais.cs, compilé une fois (npm run relais) — depuis
// 0.221.1 (étude : « l'antivirus bloque le relais Word », à l'ouverture du .vbs qui écrivait un script PowerShell). Le serveur
// sert tel quel (même fichier pour tous les postes) ; la configuration du poste passe par un code copié par CLAIRE
// (codeInstallationRelais) ; lancé, il s'installe seul (voir le .cs). Il envoie au serveur le paragraphe de Word
// où se trouve le curseur (POST /api/relais-word/releve, avec le jeton) ; le serveur le garde EN MÉMOIRE seulement (jamais en
// base, jamais journalisé) pour la fenêtre CLAIRE du poste ; la réponse porte les insertions demandées depuis CLAIRE et les
// sonneries 3CX.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

var PREFIXE_CODE_RELAIS = 'CLAIRE-RELAIS:';

// Pure : le code d'installation du relais pour ce poste — copié par CLAIRE, lu par le programme (JsonDuCode dans le .cs).
// Depuis le 12/10 au soir (Panda Endpoint Protection mettait le programme en quarantaine) le programme est le MÊME pour tous les
// postes : une exclusion par empreinte vaut pour tous ; la configuration ne fait plus partie du fichier.
/** @param {{ url: string, poste: string, jeton: string, profil?: string }} cfg @returns {string} */
function codeInstallationRelais({ url, poste, jeton, profil }) {
  return PREFIXE_CODE_RELAIS + Buffer.from(JSON.stringify({ url, poste, jeton, profil: profil || 'Claire' }), 'utf8').toString('base64');
}

// Le programme du relais (compilé une fois, gardé dans server/relais/) : embarqué dans CLAIRE-serveur.exe, sinon lu à côté.
// null s'il manque.
/** @returns {Buffer | null} */
function lireExecutableRelais() {
  try {
    const sea = require('node:sea');
    if (sea.isSea()) return Buffer.from(sea.getAsset('CLAIRE-relais.exe'));
  } catch (_) { /* pas dans l'exécutable : fichier du dépôt */ }
  try { return fs.readFileSync(path.join(__dirname, '..', 'relais', 'CLAIRE-relais.exe')); } catch (_) { return null; }
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
var APPEL_RELAIS_VU_MS = 3000;

/** @typedef {{ id: string, valeur: string, occurrence: number, attendu: string, t: number }} CommandeWord */
/** @typedef {{ titre: string, texte: string, t: number }} NotificationPoste */
/** @typedef {{ vu: number, word: boolean, appels3cx?: boolean, titre: string, paragraphe: string, n: number, commandes: CommandeWord[], resultats: { id: string, ok: boolean, message: string, t: number }[], appels: { id: string, dossier: boolean, t: number }[], pastille?: number, pastilleLe?: number, pastilleRelais?: boolean, actionsFenetre?: { type: string, canal: string, id: string, t: number }[], notifications?: NotificationPoste[] }} PosteWord */

// Pastille et notifications Windows (étude 25/10 : « il faudrait des notifications pastille sur l'app ») : la fenêtre CLAIRE du poste
// calcule son compteur d'après les réglages du collaborateur et l'envoie ici ; le relais du poste le lit à chaque relevé et le pose sur
// l'icône de la fenêtre CLAIRE dans la barre des tâches. Une fenêtre CLAIRE qui ne dit plus rien depuis 2 minutes (fermée) : pastille
// éteinte. Notifications : 5 au plus en attente, oubliées après 2 minutes (le relais les montre dans la seconde qui suit).
var PASTILLE_VUE_MS = 120000;
var NOTIFICATIONS_MAX = 5;
var NOTIFICATION_EXPIRE_MS = 120000;
var POSTES_MAX = 100;
/** @type {Record<string, [string, (n: number) => string]>} Rubrique → titre et texte de la bulle (rubrique et nombre, jamais un nom). */
var TEXTES_NOTIFICATIONS = {
  messages: ['Discussions', n => `${n} nouveau${n > 1 ? 'x' : ''} message${n > 1 ? 's' : ''}`],
  mentions: ['Discussions', n => (n > 1 ? `On vous a cité ${n} fois` : 'On vous a cité')],
  traiter: ['Propositions de CLAIRE', n => `${n} proposition${n > 1 ? 's' : ''} à décider`],
  suivi: ['Suivi des dossiers', n => `${n} nouveauté${n > 1 ? 's' : ''} dans vos dossiers`],
  scans: ['Claire Scan', n => `${n} scan${n > 1 ? 's' : ''} à ranger`],
  taches: ['Aujourd’hui', n => `${n} nouvelle${n > 1 ? 's' : ''} tâche${n > 1 ? 's' : ''}`],
  dates: ['Dates proposées', n => `${n} nouvelle${n > 1 ? 's' : ''} réponse${n > 1 ? 's' : ''}`]
};

function creerEtatRelaisWord() {
  return { postes: /** @type {Map<string, PosteWord>} */ (new Map()), demarrage: crypto.randomBytes(3).toString('hex') };
}

/** @param {ReturnType<typeof creerEtatRelaisWord>} etat @param {string} poste @returns {PosteWord} */
function postePourWord(etat, poste) {
  let p = etat.postes.get(poste);
  if (!p) { p = { vu: 0, word: false, titre: '', paragraphe: '', n: 0, commandes: [], resultats: [], appels: [], pastille: 0, pastilleLe: 0, notifications: [] }; etat.postes.set(poste, p); }
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
  p.appels3cx = corps.appels === 1;
  p.pastilleRelais = corps.pastille === 1;
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
  const pastille = maintenant - (p.pastilleLe || 0) < PASTILLE_VUE_MS ? (p.pastille || 0) : 0;
  const notifications = (p.notifications || []).filter(n => maintenant - n.t < NOTIFICATION_EXPIRE_MS).map(n => {
    const { t, ...reste } = n; void t;
    return Object.assign({ type: 'resume' }, reste);
  });
  p.notifications = [];
  return { commandes: commandes.map(c => ({ id: c.id, valeur: c.valeur, occurrence: c.occurrence, attendu: c.attendu })), appels, renvoyer: neuf && !!corps.inchange, pastille, notifications };
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
  const p = poste ? etat.postes.get(poste) : null;
  // Seulement un relais qui sait recevoir les sonneries et qui a battu il y a moins de 3 s (il bat chaque seconde) : sinon
  // l'onglet de 3CX garde son comportement d'avant (jamais un appel perdu).
  if (!p || !p.appels3cx || maintenant - p.vu > APPEL_RELAIS_VU_MS) return false;
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

// Pure (sur l'état) : le compteur et les nouveautés envoyés par la fenêtre CLAIRE du poste. Texte écrit par le serveur, jamais du HTML.
/** @param {ReturnType<typeof creerEtatRelaisWord>} etat @param {string} poste @param {any} corps @param {number} [maintenant]
 * @param {any[]} [riches] cartes écrites par le serveur (notificationsPoste.js) : elles remplacent la bulle de leur rubrique */
function noterPastillePoste(etat, poste, corps, maintenant = Date.now(), riches) {
  if (!etat.postes.has(poste) && etat.postes.size >= POSTES_MAX) return { pastille: 0 };
  const p = postePourWord(etat, poste);
  const n = Number(corps && corps.total);
  p.pastille = Number.isInteger(n) && n > 0 ? Math.min(n, 999) : 0;
  p.pastilleLe = maintenant;
  // Le texte est écrit ICI, d'après une rubrique de la liste fermée et un nombre (audit 25/10 : jamais un texte libre venu du réseau
  // dans une bulle Windows).
  const nouvelles = (Array.isArray(corps && corps.notifications) ? corps.notifications : []).slice(0, NOTIFICATIONS_MAX)
    .filter(x => x && Object.prototype.hasOwnProperty.call(TEXTES_NOTIFICATIONS, x.cle) && Number.isInteger(x.n) && x.n > 0 && x.n < 1000)
    .map(x => ({ titre: TEXTES_NOTIFICATIONS[x.cle][0], texte: TEXTES_NOTIFICATIONS[x.cle][1](x.n), t: maintenant }));
  const cartes = (riches || []).slice(0, NOTIFICATIONS_MAX).map(x => Object.assign({}, x, { t: maintenant }));
  const couvertes = new Set();
  for (const x of cartes) { if (x.type === 'message') { couvertes.add('Discussions'); } if (x.type === 'proposition') couvertes.add('Propositions de CLAIRE'); }
  p.notifications = (p.notifications || []).filter(x => maintenant - x.t < NOTIFICATION_EXPIRE_MS)
    .concat(cartes, nouvelles.filter(x => !couvertes.has(x.titre))).slice(-NOTIFICATIONS_MAX);
  // « Ouvrir » / « Autoriser » demandés depuis une carte : faits par la fenêtre CLAIRE de ce poste, dans les 20 s (plus tard, plus de sens).
  const actions = (p.actionsFenetre || []).filter(a => maintenant - a.t < 20000).map(a => ({ type: a.type, canal: a.canal, id: a.id }));
  p.actionsFenetre = [];
  return { pastille: p.pastille, actions };
}

// Une carte écrite par le serveur hors du tour de la fenêtre (réaction d'un collègue à mon message), pour le relais de ce poste — seulement
// un relais qui sait l'afficher (1.1 et plus) et qui a battu récemment.
/** @param {ReturnType<typeof creerEtatRelaisWord>} etat @param {string} poste @param {any} carte @param {number} [maintenant] */
function noterCartePoste(etat, poste, carte, maintenant = Date.now()) {
  const p = poste ? etat.postes.get(poste) : null;
  if (!p || !p.pastilleRelais || maintenant - p.vu > RELAIS_VU_MS) return false;
  p.notifications = (p.notifications || []).filter(x => maintenant - x.t < NOTIFICATION_EXPIRE_MS).concat([Object.assign({}, carte, { t: maintenant })]).slice(-NOTIFICATIONS_MAX);
  return true;
}

// Un geste demandé depuis une carte du relais, pour la fenêtre CLAIRE du poste (rendu à son prochain envoi de pastille).
/** @param {ReturnType<typeof creerEtatRelaisWord>} etat @param {string} poste @param {{ type: string, canal?: string, id?: string }} action @param {number} [maintenant] */
function demanderActionFenetre(etat, poste, action, maintenant = Date.now()) {
  const p = postePourWord(etat, poste);
  p.actionsFenetre = (p.actionsFenetre || []).concat([{ type: action.type, canal: action.canal || '', id: action.id || '', t: maintenant }]).slice(-5);
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
    resultats: p ? p.resultats.map(r => ({ id: r.id, ok: r.ok, message: r.message })) : [],
    // Le relais en marche sait-il poser la pastille (version de 0.349.0) ?
    pastille: actif && !!p && p.pastilleRelais === true
  };
}

module.exports = {
  codeInstallationRelais, lireExecutableRelais, PREFIXE_CODE_RELAIS,
  empreinteJeton, nouveauJeton, jetonValide, texteWord,
  creerEtatRelaisWord, appliquerReleveWord, demanderInsertionWord, etatPosteWord, relaisPosteActif, noterAppelPourRelais, noterPastillePoste, demanderActionFenetre, noterCartePoste, RELAIS_VU_MS, PASTILLE_VUE_MS
};
