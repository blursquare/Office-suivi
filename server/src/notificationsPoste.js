// @ts-check
'use strict';
// Notifications « comme Teams » sur les postes (étude 25/10 : « comment avoir des notifications comme Teams où l'on peut répondre ? »,
// « ok vas-y » ; choix : le programme CLAIRE-relais.exe). La fenêtre CLAIRE du poste dit au serveur QUELS canaux et QUELLES
// propositions sont nouveaux (des identifiants, jamais un texte) ; le serveur écrit lui-même la carte que le relais affiche en bas à
// droite de l'écran — canal, auteur, heure, début du message, ou titre d'une proposition — en ne montrant que ce que le collaborateur
// peut lire (messages privés : ses membres ; propositions : les siennes, ou toutes pour l'administrateur). Depuis la carte : répondre
// (le message est posé par le serveur au nom du collaborateur du relais, comme s'il l'avait tapé, dans le fil du message s'il en a un),
// réagir par un emoji (👍 ❤️ 😂 🎉 🙏, jamais un emoji qui commande un geste), ouvrir CLAIRE, et pour une proposition « Refuser » (décidé
// ici) ou « Autoriser » (étude 25/10 : « remet les autorisations ou refus » — fait par la fenêtre CLAIRE devant, comme d'un clic ; au
// niveau 2, confirmé d'abord dans CLAIRE ; un email ne part jamais sans « Envoyer » au niveau 1). Une réaction d'un collègue à MON
// message donne aussi sa carte (« Julie a réagi 👍 à votre message »). Réglage « Montrer le texte des messages » éteint : cartes sans nom.

const C = require('./canaux/canaux');
const { accessible } = require('./canaux/extensions');
const { COLLABORATEURS_ABSENCE } = require('./agendaOffice');
const { clePoste } = require('./appels3cx');
const { libelleDossierAffiche } = require('../../commun/dossier');
const { lirePropositions, ecrirePropositions, decider, estReportee } = require('./routines/propositions');
const { synchroniserEtatCartes } = require('./canaux/etatCartes');
const { assainirPhotos } = require('./routes/photosCollaborateurs');

const COLLABORATEURS = COLLABORATEURS_ABSENCE.map((c) => c.nom);
const ADMINISTRATEURS = ['Bastien ANGLUMENT', 'Sophie GOSSART'];
const MAX_ELEMENTS = 3;
const LONGUEUR_APERCU = 240;
// Les emojis qu'une carte propose : de l'humeur, jamais un geste (📌 ✋ 🔁 🕐… commandent une action dans CLAIRE, commun/reactions.js).
const EMOJIS_CARTE = ['👍', '❤️', '😂', '🎉', '🙏'];

/** Le collaborateur d'un relais (« julie » → « Julie VASSELIN »), sinon ''. @param {string} poste */
function collaborateurDuPoste(poste) {
  return COLLABORATEURS.find((c) => clePoste(c) === poste) || '';
}

/**
 * Pure : texte d'une ligne, sans caractère de contrôle, borné. `html` : une réponse de CLAIRE en HTML — balises retirées, entités
 * décodées (audit 25/10 : le texte d'une personne garde ses « < » et « > »).
 * @param {unknown} v @param {number} max @param {boolean} [html]
 */
function ligne(v, max, html) {
  let t = String(v == null ? '' : v);
  if (html) {
    t = t.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#0?39;|&rsquo;/g, '’').replace(/&amp;/g, '&');
  }
  t = t.replace(/[\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Le nom d'un canal tel que l'écran le dit. @param {any} repo @param {any} depot @param {string} id */
function nomCanal(repo, depot, id) {
  if (id === 'general') return 'général';
  if (id.startsWith('p:')) return 'Message privé';
  if (id.startsWith('l:')) { const l = C.lireLibres(repo).find((x) => x.id === id); return '#' + (l ? l.nom : id.slice(2)); }
  if (id.startsWith('d:')) {
    let d = null;
    try { d = depot && depot.trouverParId ? depot.trouverParId(id.slice(2)) : null; } catch (e) { d = null; }
    return d ? libelleDossierAffiche(d) : 'Dossier';
  }
  return id;
}

const heureDe = (/** @type {number} */ quand) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(quand));
const prenom = (/** @type {string} */ nom) => String(nom || '').split(/\s+/)[0];

/**
 * Les cartes du relais pour ces canaux et ces propositions nouveaux. Un canal illisible pour ce collaborateur, un message de lui-même,
 * une proposition qui n'est pas la sienne : rien.
 * @param {{ repo: any, depot?: any, collab: string, canaux?: unknown, propositions?: unknown }} o
 * @returns {{ type: string, titre: string, texte: string, contexte: string, auteur: string, heure: string, canal?: string, mid?: string, parent?: string, id?: string, photo?: string }[]}
 */
function notificationsRiches(o) {
  const sortie = [];
  const ids = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX_ELEMENTS) : []);
  // La photo de profil de l'auteur (Réglages › Collaborateurs, JPEG de 160 px), comme l'avatar de Teams ; sans photo, ses initiales.
  let photos = null;
  const photoDe = (/** @type {string} */ nom) => {
    if (!photos) { try { photos = assainirPhotos(o.repo.lireJsonBrut('photos-collaborateurs', {})); } catch (e) { photos = {}; } }
    const p = /** @type {any} */ (photos)[nom];
    return p && p.base64 ? p.base64 : '';
  };
  for (const canal of ids(o.canaux)) {
    if (!C.canalValide(canal) || !accessible(canal, o.collab, COLLABORATEURS)) continue;
    // Le dernier message d'un autre — jamais une carte de proposition (comptée par « À traiter », audit 25/10).
    const m = C.lireMessages(o.repo, canal).filter((x) => x.auteur !== o.collab && !x.carte).pop();
    if (!m) continue;
    const auteur = m.claire ? 'CLAIRE' : prenom(m.auteur);
    sortie.push({ type: 'message', canal, mid: m.claire ? '' : m.id, parent: m.parent || m.id, titre: nomCanal(o.repo, o.depot, canal), auteur, heure: heureDe(m.quand), contexte: m.parent ? 'Dans un fil' : '',
      photo: m.claire ? '' : photoDe(m.auteur),
      texte: (m.texte ? ligne(m.texte, LONGUEUR_APERCU) : ligne(m.html, LONGUEUR_APERCU, true)) || (m.pj && m.pj.length ? 'Fichier joint' : '') });
  }
  if (ids(o.propositions).length) {
    const toutes = lirePropositions(o.repo);
    for (const id of ids(o.propositions)) {
      const p = toutes.find((x) => x.id === id);
      // Seulement une proposition qui attend encore une décision (« vue » = une alerte lue, déjà traitée).
      if (!p || p.etat !== 'proposee' || estReportee(p)) continue;
      if (p.responsable && p.responsable !== o.collab && !ADMINISTRATEURS.includes(o.collab)) continue;
      sortie.push({ type: 'proposition', id, canal: '@traiter', titre: p.dossierId ? nomCanal(o.repo, o.depot, 'd:' + p.dossierId) : 'Proposition de CLAIRE', auteur: 'CLAIRE', heure: '',
        contexte: 'Proposition de CLAIRE', texte: ligne(p.titre, 160) });
    }
  }
  return sortie;
}

/**
 * Une réponse tapée dans la carte du relais : posée au nom du collaborateur du relais, mentions comprises (Teams), DANS LE FIL du
 * message (`parent` : le message d'une réponse de fil, ou le message lui-même — comme « Répondre » de Teams). Une réponse qui cite
 * @CLAIRE est posée, mais CLAIRE n'y répond pas d'ici (son agent tourne sur le poste) : dit dans les Réglages.
 * @param {{ repo: any, depot?: any, collab: string, canal: unknown, texte: unknown, parent?: unknown, notifieur?: any }} o
 * @returns {{ ok: boolean, erreur?: string, message?: any }}
 */
function repondreDepuisRelais(o) {
  const canal = typeof o.canal === 'string' ? o.canal : '';
  const texte = typeof o.texte === 'string' ? o.texte.trim() : '';
  if (!o.collab) return { ok: false, erreur: 'Collaborateur inconnu.' };
  if (!C.canalValide(canal) || !accessible(canal, o.collab, COLLABORATEURS)) return { ok: false, erreur: 'Canal inconnu.' };
  // Mêmes contrôles d'existence que la route des canaux (audit 25/10) : jamais un canal libre ou un dossier inventé.
  if (canal.startsWith('l:') && !C.lireLibres(o.repo).some((c) => c.id === canal)) return { ok: false, erreur: 'Canal inconnu.' };
  if (canal.startsWith('d:')) {
    let existe = false;
    try { existe = !!(o.depot && o.depot.trouverParId && o.depot.trouverParId(canal.slice(2))); } catch (e) { existe = false; }
    if (!existe) return { ok: false, erreur: 'Canal inconnu.' };
  }
  if (!texte) return { ok: false, erreur: 'Message vide.' };
  if (texte.length > C.MAX_TEXTE_PERSONNE) return { ok: false, erreur: 'Message trop long.' };
  let mentions = C.mentionsDansTexte(texte, COLLABORATEURS).collaborateurs;
  if (canal.startsWith('p:')) mentions = [...new Set(mentions.concat((C.membresPrive(canal, COLLABORATEURS) || []).filter((c) => c !== o.collab)))];
  // Le message de départ du fil doit exister dans ce canal et ne pas être lui-même une réponse (un seul niveau, comme la route des canaux).
  let parent = '';
  if (typeof o.parent === 'string' && o.parent) {
    const racine = C.lireMessages(o.repo, canal).find((x) => x.id === o.parent);
    if (racine && !racine.parent) parent = racine.id;
  }
  const m = C.ajouterMessage(o.repo, canal, { auteur: o.collab, claire: false, via: '', texte, html: '', pj: [], mentions, parent });
  if (!m) return { ok: false, erreur: 'Message refusé.' };
  C.marquerLu(o.repo, o.collab, canal, m.quand);
  if (o.notifieur && o.notifieur.notifierMentions && mentions.length) o.notifieur.notifierMentions(canal, m).catch(() => {});
  return { ok: true, message: m };
}

/**
 * « Refuser » une proposition depuis la carte : même règle que la route des propositions (sa boîte, ou l'administrateur). Une
 * proposition déjà décidée n'est pas « refusée » une seconde fois (`dejaTraitee`).
 * @param {{ repo: any, collab: string, id: unknown }} o
 */
function refuserDepuisRelais(o) {
  const id = typeof o.id === 'string' ? o.id : '';
  const liste = lirePropositions(o.repo);
  const cible = liste.find((x) => x.id === id);
  if (!cible) return { ok: false, erreur: 'Proposition introuvable.' };
  if (cible.responsable && cible.responsable !== o.collab && !ADMINISTRATEURS.includes(o.collab)) return { ok: false, erreur: 'Cette proposition n’est pas dans votre boîte.' };
  if (cible.etat !== 'proposee') return { ok: false, erreur: 'Déjà décidée.' };
  const r = decider(liste, id, 'refusee', o.collab);
  if (r.liste !== liste) { ecrirePropositions(o.repo, r.liste); try { synchroniserEtatCartes(o.repo); } catch (e) { /* jamais bloquant */ } }
  return { ok: true };
}

/**
 * « Plus tard » depuis la carte d'une proposition : reportée à demain 8 h (étude 26/10) ; même règle d'accès que « Refuser », rien n'est
 * fermé ni exécuté : elle revient seule dans « À traiter ».
 * @param {{ repo: any, collab: string, id: unknown }} o
 */
function reporterDepuisRelais(o) {
  const id = typeof o.id === 'string' ? o.id : '';
  const liste = lirePropositions(o.repo);
  const cible = liste.find((x) => x.id === id);
  if (!cible) return { ok: false, erreur: 'Proposition introuvable.' };
  if (cible.responsable && cible.responsable !== o.collab && !ADMINISTRATEURS.includes(o.collab)) return { ok: false, erreur: 'Cette proposition n’est pas dans votre boîte.' };
  if (cible.etat !== 'proposee') return { ok: false, erreur: 'Déjà décidée.' };
  const r = decider(liste, id, 'reporter', o.collab, undefined, { quand: 'demain' });
  if (r.liste !== liste) { ecrirePropositions(o.repo, r.liste); try { synchroniserEtatCartes(o.repo); } catch (e) { /* jamais bloquant */ } }
  return { ok: true };
}

/**
 * Une réaction posée depuis une carte : seulement un emoji d'humeur, sur le message d'une PERSONNE d'un canal que le collaborateur lit.
 * @param {{ repo: any, collab: string, canal: unknown, mid: unknown, emoji: unknown }} o
 */
function reagirDepuisRelais(o) {
  const canal = typeof o.canal === 'string' ? o.canal : '';
  const emoji = typeof o.emoji === 'string' ? o.emoji : '';
  if (!EMOJIS_CARTE.includes(emoji)) return { ok: false, erreur: 'Emoji non permis.' };
  if (!C.canalValide(canal) || !accessible(canal, o.collab, COLLABORATEURS)) return { ok: false, erreur: 'Canal inconnu.' };
  const m = C.lireMessages(o.repo, canal).find((x) => x.id === o.mid);
  if (!m || m.claire) return { ok: false, erreur: 'Message inconnu.' };
  // Déjà posée par ce collaborateur : rien de neuf à annoncer (relecture 25/10 : un double clic donnait deux cartes à l'auteur).
  const deja = (m.reactions || []).some((x) => x.emoji === emoji && Array.isArray(x.par) && x.par.includes(o.collab));
  const r = C.reagirMessage(o.repo, canal, m.id, o.collab, emoji, true);
  return r ? { ok: true, message: r.message, nouvelle: !deja } : { ok: false, erreur: 'Réaction refusée.' };
}

/**
 * La carte d'une réaction à MON message (« Julie a réagi 👍 à votre message ») — pour l'auteur du message, s'il a allumé les
 * notifications Windows et la rubrique « Réactions » ; sans « Montrer le texte des messages », ni nom ni extrait. Rend null sinon.
 * @param {{ repo: any, depot?: any, canal: string, message: any, emoji: string, par: string, preferences?: any }} o
 */
function carteReaction(o) {
  const auteur = o.message && o.message.auteur;
  if (!auteur || o.message.claire || auteur === o.par || !COLLABORATEURS.includes(auteur) || o.par === 'CLAIRE') return null;
  if (!accessible(o.canal, auteur, COLLABORATEURS)) return null;
  const n = (o.preferences && o.preferences[auteur] && o.preferences[auteur].notifications) || {};
  if (n.windows === false || (n.sources && n.sources.reactions === false)) return null;
  if (n.apercu === false) return { poste: clePoste(auteur), carte: { type: 'resume', titre: 'Discussions', texte: 'Une réaction à votre message' } };
  let photo = '';
  try { const p = assainirPhotos(o.repo.lireJsonBrut('photos-collaborateurs', {}))[o.par]; photo = p && p.base64 ? p.base64 : ''; } catch (e) { photo = ''; }
  return { poste: clePoste(auteur), carte: { type: 'reaction', canal: o.canal, titre: nomCanal(o.repo, o.depot, o.canal), auteur: prenom(o.par), emoji: o.emoji, photo, heure: '',
    contexte: `${prenom(o.par)} a réagi ${o.emoji} à votre message`, texte: ligne(o.message.texte || o.message.html, 160, !o.message.texte) } };
}

module.exports = { COLLABORATEURS, EMOJIS_CARTE, collaborateurDuPoste, ligne, nomCanal, notificationsRiches, repondreDepuisRelais, refuserDepuisRelais, reporterDepuisRelais, reagirDepuisRelais, carteReaction };
