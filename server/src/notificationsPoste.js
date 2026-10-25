// @ts-check
'use strict';
// Notifications « comme Teams » sur les postes (étude 25/10 : « comment avoir des notifications comme Teams où l'on peut répondre ? »,
// « ok vas-y » ; choix : le programme CLAIRE-relais.exe). La fenêtre CLAIRE du poste dit au serveur QUELS canaux et QUELLES
// propositions sont nouveaux (des identifiants, jamais un texte) ; le serveur écrit lui-même la carte que le relais affiche en bas à
// droite de l'écran — canal, auteur, heure, début du message, ou titre d'une proposition — en ne montrant que ce que le collaborateur
// peut lire (messages privés : ses membres ; propositions : les siennes, ou toutes pour l'administrateur). Depuis la carte : répondre
// (le message est posé par le serveur au nom du collaborateur du relais, comme s'il l'avait tapé), refuser une proposition (décidé ici),
// ou ouvrir CLAIRE et autoriser (fait par la fenêtre CLAIRE, qui exécute le geste comme d'un clic — un email ne part jamais sans
// « Envoyer »). Réglage « Montrer le texte des messages » éteint : cartes sans nom, rubrique et nombre seulement.

const C = require('./canaux/canaux');
const { accessible } = require('./canaux/extensions');
const { COLLABORATEURS_ABSENCE } = require('./agendaOffice');
const { clePoste } = require('./appels3cx');
const { libelleDossierAffiche } = require('../../commun/dossier');
const { lirePropositions, ecrirePropositions, decider } = require('./routines/propositions');
const { synchroniserEtatCartes } = require('./canaux/etatCartes');

const COLLABORATEURS = COLLABORATEURS_ABSENCE.map((c) => c.nom);
const ADMINISTRATEURS = ['Bastien ANGLUMENT'];
const MAX_ELEMENTS = 3;
const LONGUEUR_APERCU = 240;

/** Le collaborateur d'un relais (« julie » → « Julie VASSELIN »), sinon ''. @param {string} poste */
function collaborateurDuPoste(poste) {
  return COLLABORATEURS.find((c) => clePoste(c) === poste) || '';
}

/** Pure : texte d'une ligne, sans balise ni caractère de contrôle, borné. @param {unknown} v @param {number} max */
function ligne(v, max) {
  const t = String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/[\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim();
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
 * @returns {{ type: string, titre: string, texte: string, contexte: string, auteur: string, heure: string, canal?: string, id?: string, alerte?: boolean }[]}
 */
function notificationsRiches(o) {
  const sortie = [];
  const ids = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX_ELEMENTS) : []);
  for (const canal of ids(o.canaux)) {
    if (!C.canalValide(canal) || !accessible(canal, o.collab, COLLABORATEURS)) continue;
    const m = C.lireMessages(o.repo, canal).filter((x) => x.auteur !== o.collab).pop();
    if (!m) continue;
    const auteur = m.claire ? 'CLAIRE' : prenom(m.auteur);
    sortie.push({ type: 'message', canal, titre: nomCanal(o.repo, o.depot, canal), auteur, heure: heureDe(m.quand), contexte: m.parent ? 'Dans un fil' : '',
      texte: ligne(m.texte || m.html, LONGUEUR_APERCU) || (m.pj && m.pj.length ? 'Fichier joint' : '') });
  }
  if (ids(o.propositions).length) {
    const toutes = lirePropositions(o.repo);
    for (const id of ids(o.propositions)) {
      const p = toutes.find((x) => x.id === id);
      // Seulement une proposition qui attend encore une décision (« vue » = une alerte lue, déjà traitée).
      if (!p || p.etat !== 'proposee') continue;
      if (p.responsable && p.responsable !== o.collab && !ADMINISTRATEURS.includes(o.collab)) continue;
      sortie.push({ type: 'proposition', id, titre: p.dossierId ? nomCanal(o.repo, o.depot, 'd:' + p.dossierId) : 'Proposition de CLAIRE', auteur: 'CLAIRE', heure: '',
        contexte: 'Proposition de CLAIRE', texte: ligne(p.titre, 160), alerte: p.type === 'alerte' });
    }
  }
  return sortie;
}

/**
 * Une réponse tapée dans la carte du relais : posée dans le canal au nom du collaborateur du relais, mentions comprises (Teams).
 * @param {{ repo: any, collab: string, canal: unknown, texte: unknown, notifieur?: any }} o
 * @returns {{ ok: boolean, erreur?: string, message?: any }}
 */
function repondreDepuisRelais(o) {
  const canal = typeof o.canal === 'string' ? o.canal : '';
  const texte = typeof o.texte === 'string' ? o.texte.trim() : '';
  if (!o.collab) return { ok: false, erreur: 'Collaborateur inconnu.' };
  if (!C.canalValide(canal) || !accessible(canal, o.collab, COLLABORATEURS)) return { ok: false, erreur: 'Canal inconnu.' };
  if (!texte) return { ok: false, erreur: 'Message vide.' };
  if (texte.length > C.MAX_TEXTE_PERSONNE) return { ok: false, erreur: 'Message trop long.' };
  let mentions = C.mentionsDansTexte(texte, COLLABORATEURS).collaborateurs;
  if (canal.startsWith('p:')) mentions = [...new Set(mentions.concat((C.membresPrive(canal, COLLABORATEURS) || []).filter((c) => c !== o.collab)))];
  const m = C.ajouterMessage(o.repo, canal, { auteur: o.collab, claire: false, via: '', texte, html: '', pj: [], mentions, parent: '' });
  if (!m) return { ok: false, erreur: 'Message refusé.' };
  C.marquerLu(o.repo, o.collab, canal, m.quand);
  if (o.notifieur && o.notifieur.notifierMentions && mentions.length) o.notifieur.notifierMentions(canal, m).catch(() => {});
  return { ok: true, message: m };
}

/**
 * « Refuser » une proposition depuis la carte du relais : même règle que la route des propositions (sa boîte, ou l'administrateur).
 * @param {{ repo: any, collab: string, id: unknown }} o
 */
function refuserDepuisRelais(o) {
  const id = typeof o.id === 'string' ? o.id : '';
  const liste = lirePropositions(o.repo);
  const cible = liste.find((x) => x.id === id);
  if (!cible) return { ok: false, erreur: 'Proposition introuvable.' };
  if (cible.responsable && cible.responsable !== o.collab && !ADMINISTRATEURS.includes(o.collab)) return { ok: false, erreur: 'Cette proposition n’est pas dans votre boîte.' };
  const r = decider(liste, id, 'refusee', o.collab);
  if (r.liste !== liste) { ecrirePropositions(o.repo, r.liste); try { synchroniserEtatCartes(o.repo); } catch (e) { /* jamais bloquant */ } }
  return { ok: true };
}

module.exports = { COLLABORATEURS, collaborateurDuPoste, ligne, nomCanal, notificationsRiches, repondreDepuisRelais, refuserDepuisRelais };
