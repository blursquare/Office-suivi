// @ts-check
'use strict';

// « Demander à CLAIRE » — mémoire des conversations et recherche web (étude 18/10 : « mémoire : oui, résumés sur le serveur » ; « recherche web :
// sites officiels seulement »). Rien ne quitte le bureau pour la mémoire : chaque conversation est résumée ici (dernières questions, dernière
// réponse, en clair, comme les autres données de l'étude), gardée 90 jours ; l'agent la retrouve par l'outil `chercher_conversations`, dont le
// résultat est MASQUÉ comme tout résultat d'outil avant de partir chez l'IA. La recherche web est l'outil serveur de Claude, limité aux domaines
// officiels de la liste (Réglages › IA et relecture d'actes), la liste modifiable par l'étude.

const CLE_CONVERSATIONS = 'assistant-conversations';
const DUREE_CONVERSATIONS_MS = 90 * 24 * 3600 * 1000;
const MAX_CONVERSATIONS_GARDEES = 600;
const CLE_RECHERCHE_WEB = 'recherche-web';
/** Les sites officiels proposés au départ (droit, fiscalité, urbanisme, risques, notariat). */
const DOMAINES_OFFICIELS_DEFAUT = ['legifrance.gouv.fr', 'service-public.fr', 'bofip.impots.gouv.fr', 'impots.gouv.fr', 'economie.gouv.fr',
  'justice.gouv.fr', 'courdecassation.fr', 'conseil-etat.fr', 'conseil-constitutionnel.fr', 'ecologie.gouv.fr', 'cohesion-territoires.gouv.fr',
  'geoportail-urbanisme.gouv.fr', 'georisques.gouv.fr', 'cadastre.gouv.fr', 'data.gouv.fr', 'insee.fr', 'anil.org', 'notaires.fr', 'eur-lex.europa.eu'];
const MAX_DOMAINES = 40;

/** @param {unknown} v @param {number} n */
const texteBorne = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

/** Pure : un nom de domaine propre (« https://www.Legifrance.gouv.fr/ » → « legifrance.gouv.fr »), sinon ''. @param {unknown} d */
function domainePropre(d) {
  const s = String(d == null ? '' : d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  return /^(?=.{4,100}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(s) ? s : '';
}

/** Pure : les réglages de la recherche web, assainis. @param {any} brut @returns {{ actif: boolean, domaines: string[] }} */
function assainirRechercheWeb(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const domaines = Array.isArray(b.domaines) ? [...new Set(b.domaines.map(domainePropre).filter(Boolean))].slice(0, MAX_DOMAINES) : DOMAINES_OFFICIELS_DEFAUT.slice();
  return { actif: b.actif !== false, domaines };
}

/** @param {{ lireJsonBrut: Function }} repo */
function lireRechercheWeb(repo) { return assainirRechercheWeb(repo.lireJsonBrut(CLE_RECHERCHE_WEB, null)); }

/** @param {{ ecrireJsonBrut: Function }} repo @param {any} valeur */
function ecrireRechercheWeb(repo, valeur) {
  const propre = assainirRechercheWeb(valeur);
  repo.ecrireJsonBrut(CLE_RECHERCHE_WEB, propre);
  return propre;
}

/**
 * @typedef {{ id: string, le: number, maj: number, auteur: string, titre: string, questions: string[], reponse: string, dossierId: string, sensibles?: string[] }} ConversationGardee
 */

/** Pure : la liste gardée, sans ce qui a plus de 90 jours. @param {any} brut @param {number} maintenant @returns {ConversationGardee[]} */
function conversationsValides(brut, maintenant) {
  return (Array.isArray(brut) ? brut : []).filter((c) => c && typeof c.id === 'string' && Number(c.maj) > maintenant - DUREE_CONVERSATIONS_MS);
}

/** @param {{ lireJsonBrut: Function }} repo @param {number} [maintenant] */
function lireConversations(repo, maintenant) { return conversationsValides(repo.lireJsonBrut(CLE_CONVERSATIONS, []), maintenant || Date.now()); }

/**
 * Note (ou met à jour) une conversation à la fin d'une réponse de l'agent.
 * @param {{ lireJsonBrut: Function, ecrireJsonBrut: Function }} repo
 * @param {{ id: string, auteur?: string, question?: string, reponse?: string, dossierId?: string, sensibles?: string[] }} info
 * @param {number} [maintenant]
 */
function noterConversation(repo, info, maintenant) {
  const t = maintenant || Date.now();
  if (!info || typeof info.id !== 'string' || !info.id) return;
  const liste = lireConversations(repo, t);
  const i = liste.findIndex((c) => c.id === info.id);
  const question = texteBorne(info.question, 300);
  const avant = i >= 0 ? liste[i] : null;
  /** @type {ConversationGardee} */
  const c = {
    id: info.id.slice(0, 80), le: avant ? avant.le : t, maj: t,
    auteur: texteBorne(info.auteur, 40) || (avant ? avant.auteur : ''),
    titre: avant && avant.titre ? avant.titre : texteBorne(info.question, 140),
    questions: [...(avant ? avant.questions : []), ...(question && (!avant || avant.questions[avant.questions.length - 1] !== question) ? [question] : [])].slice(-5),
    reponse: texteBorne(info.reponse, 1500) || (avant ? avant.reponse : ''),
    dossierId: texteBorne(info.dossierId, 80) || (avant ? avant.dossierId : ''),
    // Les valeurs que l'agent a reçues masquées (noms, adresses…) : masquées de nouveau quand la conversation est relue par l'outil.
    sensibles: [...new Set([...(avant && avant.sensibles ? avant.sensibles : []), ...(Array.isArray(info.sensibles) ? info.sensibles : [])]
      .filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim().slice(0, 80)))].slice(-200)
  };
  if (i >= 0) liste.splice(i, 1);
  liste.unshift(c);
  repo.ecrireJsonBrut(CLE_CONVERSATIONS, liste.slice(0, MAX_CONVERSATIONS_GARDEES));
}

const MOTS_VIDES = new Set(['les', 'des', 'une', 'pour', 'avec', 'dans', 'sur', 'par', 'que', 'qui', 'quoi', 'est', 'sont', 'son', 'ses', 'mes', 'nos',
  'vos', 'leur', 'aux', 'cette', 'ces', 'ete', 'avait', 'avons', 'avez', 'fait', 'faire', 'comment', 'quand', 'quel', 'quelle', 'quels', 'quelles']);

/** @param {unknown} t */
const motsDe = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));

/**
 * Pure : les conversations passées qui répondent à une recherche (mots dans le titre, les questions ou la réponse), les plus pertinentes puis
 * les plus récentes, 8 au plus.
 * @param {ConversationGardee[]} liste @param {string} recherche @param {string} [dossierId]
 */
function rechercherConversations(liste, recherche, dossierId) {
  const mots = [...new Set(motsDe(recherche))];
  const filtre = String(dossierId || '');
  if (!mots.length && !filtre) return [];
  return (liste || []).map((c) => {
    const botte = new Set(motsDe([c.titre, ...(c.questions || []), c.reponse].join(' ')));
    const score = mots.filter((m) => botte.has(m) || [...botte].some((b) => b.startsWith(m))).length + (filtre && c.dossierId === filtre ? 2 : 0);
    return { c, score };
  }).filter((x) => x.score > 0 && (!mots.length || x.score >= Math.min(2, mots.length)))
    .sort((a, b) => b.score - a.score || b.c.maj - a.c.maj).slice(0, 8)
    .map(({ c }) => ({ date: new Date(c.maj).toISOString().slice(0, 10), collaborateur: c.auteur, sujet: c.titre, questions: c.questions, reponse: c.reponse, dossier_id: c.dossierId }));
}

/**
 * Pure : la mémoire que CLAIRE relit au début d'une conversation dans SON espace (étude 27/10 : « dans son espace de discussion privée
 * elle doit pouvoir voir la mémoire de ses conversations dans les autres demandes ») — les autres conversations de cette personne
 * (6 au plus, les plus récentes) et ses derniers messages à elle (8 au plus). En clair : l'appelant la masque comme une question.
 * `masquer` : appliqué à chaque texte repris (questions, réponses, messages), jamais aux intitulés de la mémoire.
 * @param {{ conversations: ConversationGardee[], messages: any[], prenom: string, convId: string, masquer?: (t: string) => string }} o
 */
function memoirePourVueClaire(o) {
  const date = (/** @type {number} */ t) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
  const m = typeof o.masquer === 'function' ? o.masquer : (/** @type {string} */ t) => t;
  const court = (/** @type {unknown} */ t, /** @type {number} */ n) => { const s = String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); return m(s.length > n ? s.slice(0, n - 1) + '…' : s); };
  const convs = (o.conversations || []).filter((c) => c.auteur === o.prenom && c.id !== o.convId).slice(0, 6);
  const msgs = (o.messages || []).slice().sort((a, b) => (b.maj || b.quand) - (a.maj || a.quand)).slice(0, 8).reverse();
  if (!convs.length && !msgs.length) return '';
  const lignes = ['Ta mémoire (ce que tu as déjà échangé avec ' + o.prenom + ' ailleurs — à reprendre si c’est utile, sans le réciter ; chercher_conversations pour aller plus loin) :'];
  if (convs.length) {
    lignes.push('Ses autres conversations avec toi :');
    for (const c of convs) lignes.push(`- ${date(c.maj)}${c.dossierId ? ` [dossier ${c.dossierId}]` : ''} : « ${court((c.questions || []).slice(-1)[0] || c.titre, 160)} » → ${court(c.reponse, 280)}`);
  }
  if (msgs.length) {
    lignes.push('Ce que tu lui as écrit récemment (notifications, comptes rendus) :');
    for (const x of msgs) lignes.push(`- ${date(x.maj || x.quand)}${x.dossierId ? ` [dossier ${x.dossierId}]` : ''} : ${court(x.detail || x.court, 280)}`);
  }
  return lignes.join('\n');
}

/** Toutes les valeurs masquées des conversations gardées (pour masquer leur relecture), 3 000 au plus. @param {{ lireJsonBrut: Function }} repo */
function sensiblesConversations(repo) {
  return [...new Set(lireConversations(repo).flatMap((c) => c.sensibles || []))].slice(0, 3000);
}

module.exports = { memoirePourVueClaire, sensiblesConversations, CLE_CONVERSATIONS, CLE_RECHERCHE_WEB, DOMAINES_OFFICIELS_DEFAUT, DUREE_CONVERSATIONS_MS, domainePropre, assainirRechercheWeb, lireRechercheWeb,
  ecrireRechercheWeb, conversationsValides, lireConversations, noterConversation, rechercherConversations };
