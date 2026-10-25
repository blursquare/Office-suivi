// @ts-check
'use strict';
// Notifications « comme Teams » sur les postes (étude 25/10 : « comment avoir des notifications comme Teams où l'on peut répondre ? »,
// « ok vas-y » ; choix : le programme CLAIRE-relais.exe). La fenêtre CLAIRE du poste dit au serveur QUELS canaux et QUELLES
// propositions sont nouveaux (des identifiants, jamais un texte) ; le serveur écrit lui-même la carte que le relais affiche en bas à
// droite de l'écran — canal, auteur, heure, début du message, ou titre d'une proposition — en ne montrant que ce que le collaborateur
// peut lire (messages privés : ses membres ; propositions : les siennes, ou toutes pour l'administrateur). Depuis la carte : répondre
// (le message est posé par le serveur au nom du collaborateur du relais, comme s'il l'avait tapé, dans le fil du message s'il en a un)
// ou ouvrir CLAIRE. Jamais « Autoriser / Refuser » dans la carte (étude 25/10 : « non »). Réglage « Montrer le texte des messages »
// éteint : cartes sans nom, rubrique et nombre seulement.

const C = require('./canaux/canaux');
const { accessible } = require('./canaux/extensions');
const { COLLABORATEURS_ABSENCE } = require('./agendaOffice');
const { clePoste } = require('./appels3cx');
const { libelleDossierAffiche } = require('../../commun/dossier');
const { lirePropositions } = require('./routines/propositions');
const { assainirPhotos } = require('./routes/photosCollaborateurs');

const COLLABORATEURS = COLLABORATEURS_ABSENCE.map((c) => c.nom);
const ADMINISTRATEURS = ['Bastien ANGLUMENT'];
const MAX_ELEMENTS = 3;
const LONGUEUR_APERCU = 240;

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
 * @returns {{ type: string, titre: string, texte: string, contexte: string, auteur: string, heure: string, canal?: string, parent?: string, id?: string, photo?: string }[]}
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
    sortie.push({ type: 'message', canal, parent: m.parent || m.id, titre: nomCanal(o.repo, o.depot, canal), auteur, heure: heureDe(m.quand), contexte: m.parent ? 'Dans un fil' : '',
      photo: m.claire ? '' : photoDe(m.auteur),
      texte: (m.texte ? ligne(m.texte, LONGUEUR_APERCU) : ligne(m.html, LONGUEUR_APERCU, true)) || (m.pj && m.pj.length ? 'Fichier joint' : '') });
  }
  if (ids(o.propositions).length) {
    const toutes = lirePropositions(o.repo);
    for (const id of ids(o.propositions)) {
      const p = toutes.find((x) => x.id === id);
      // Seulement une proposition qui attend encore une décision (« vue » = une alerte lue, déjà traitée).
      if (!p || p.etat !== 'proposee') continue;
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

module.exports = { COLLABORATEURS, collaborateurDuPoste, ligne, nomCanal, notificationsRiches, repondreDepuisRelais };
