// @ts-check
'use strict';
// « Demander à CLAIRE » : l'échange libre (étude 11/10 : « des réponses plus humaines, comme avec un collaborateur avec qui
// j'échange tous les jours » ; choix : le code écrit les réponses chiffrées, l'IA écrit seulement les échanges SANS donnée de
// dossier). Même règle que la compréhension d'une phrase (assistantMistral.js) : seule la phrase part, noms masqués par le
// serveur avant l'envoi (`pseudonymiserDemande`), valeurs rétablies au retour ; AUCUNE donnée de fiche dans le prompt — l'IA
// ignore tout des dossiers et doit le dire plutôt que d'inventer. Sans IA en ligne (clé absente, IA locale trop lente), le
// poste répond lui-même (client/59-assistant-ton.js).

const A = require('../../commun/assistant');
const { pseudonymiserDemande, retablirTexte, masquerMontants } = require('./assistantMistral');

const LONGUEUR_MAX_CONVERSATION = 700;
const MAX_CARACTERES_REPONSE = 1500;
const PRENOMS_COLLABORATEURS = ['Bastien', 'Julie', 'Jérémy'];

// Sortie structurée (Claude) : une seule chaîne.
const SCHEMA_CONVERSATION = {
  type: 'object',
  additionalProperties: false,
  required: ['reponse'],
  properties: { reponse: { type: 'string' } }
};

/**
 * Le prompt de l'échange libre. Pure.
 * @param {string} texte phrase déjà masquée
 * @param {{ aujourdhui?: string, prenom?: string, historique?: Array<{ role?: string, texte?: string }> }} contexte historique déjà masqué
 */
function promptConversation(texte, contexte) {
  const c = contexte || {};
  const prenom = PRENOMS_COLLABORATEURS.includes(c.prenom || '') ? c.prenom : '';
  const sait = A.INTENTIONS_ASSISTANT.filter((i) => !['inconnu', 'aide', 'salutation', 'conversation'].includes(i.cle)).map((i) => i.libelle.toLowerCase()).join(', ');
  const avant = (c.historique || []).slice(-4).filter((h) => h && h.texte)
    .map((h) => `${h.role === 'claire' ? 'CLAIRE' : (prenom || 'Collaborateur')} : ${String(h.texte).replace(/\s+/g, ' ').slice(0, 300)}`).join('\n');
  return `Tu es CLAIRE, l'assistante de l'étude notariale de Maître Sophie GOSSART à Blois. Tu échanges chaque jour avec ${prenom || 'un collaborateur de l\'étude'}, comme une collègue attentionnée : vouvoiement, ton chaleureux et naturel, phrases courtes, pas de formules pompeuses ni de longues listes, jamais « Sauf erreur de ma part ». Réponds en 2 à 5 phrases.
Règles :
- Tu ne connais ICI aucune donnée de dossier (noms, montants, dates, pièces, fonds) : n'en invente jamais. Si la question en demande une, dis que tu peux la chercher et invite à citer le dossier (« Où en est MARTIN ? »).
- Les codes comme [NOM1] ou [MONTANT1] remplacent des noms et des montants : recopie-les tels quels si tu en as besoin ; ne demande jamais d'informations personnelles.
- Sur un point de droit, donne des repères généraux prudents et rappelle que Maître GOSSART (ou le notaire en charge) a le dernier mot.
- Hors sujet, réponds brièvement avec bienveillance puis propose ton aide sur les dossiers.
- Ce que tu sais faire dans CLAIRE : ${sait}.
${avant ? `Échanges précédents :\n${avant}\n` : ''}Aujourd'hui : ${c.aujourdhui || ''}.
${prenom || 'Le collaborateur'} dit : « ${String(texte || '').replace(/\s+/g, ' ').trim()} »
JSON seul : {"reponse":"<ta réponse>"}`;
}

/** Contrôle de la réponse de l'IA : une chaîne non vide, de longueur raisonnable. @param {any} objet */
function validerConversation(objet) {
  if (!objet || typeof objet !== 'object') return 'la réponse n’est pas un objet';
  if (typeof objet.reponse !== 'string' || !objet.reponse.trim()) return '"reponse" doit être un texte non vide';
  if (objet.reponse.length > MAX_CARACTERES_REPONSE * 2) return 'réponse trop longue';
  return null;
}

/**
 * Rétablit les noms masqués, efface les codes que l'IA aurait inventés, borne la longueur. Pure.
 * @param {string} texte @param {Map<string, string>} [table]
 */
function nettoyerReponseConversation(texte, table) {
  const rendu = table ? retablirTexte(texte, table) : String(texte || '');
  const net = A.sansSaufErreur(rendu.replace(/\[(?:NOM|EMAIL|TEL|REF|NUM|MONTANT)\d+\]/g, '…')).replace(/\s+\n/g, '\n').trim();
  if (net.length <= MAX_CARACTERES_REPONSE) return net;
  // Trop long : coupé à la fin de la dernière phrase entière plutôt qu'au milieu d'un mot.
  const coupe = net.slice(0, MAX_CARACTERES_REPONSE);
  const fin = Math.max(coupe.lastIndexOf('. '), coupe.lastIndexOf('! '), coupe.lastIndexOf('? '), coupe.lastIndexOf('.\n'));
  return fin > MAX_CARACTERES_REPONSE * 0.5 ? coupe.slice(0, fin + 1) : coupe.replace(/\s+\S*$/, '') + '…';
}

/**
 * Fait répondre l'IA en ligne. `client` : un client à l'interface Ollama (`genererJson`). Rend { reponse } ou lève une erreur.
 * @param {{ texte: string, contexte?: any, dossiers?: any[] }} entree
 * @param {{ genererJson: Function }} client
 */
async function converser(entree, client) {
  const texte = String((entree && entree.texte) || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const brut = (entree && entree.contexte) || {};
  const contexte = {
    aujourdhui: typeof brut.aujourdhui === 'string' ? brut.aujourdhui : '',
    prenom: PRENOMS_COLLABORATEURS.includes(brut.prenom) ? brut.prenom : '',
    dossierLibelle: '',
    historique: (Array.isArray(brut.historique) ? brut.historique : []).slice(-4)
      .filter((h) => h && typeof h.texte === 'string').map((h) => ({ role: h.role === 'claire' ? 'claire' : 'moi', texte: h.texte.slice(0, 400) }))
  };
  const ps = pseudonymiserDemande(texte, contexte, (entree && entree.dossiers) || []);
  // Les montants aussi, dans la phrase et dans les échanges précédents (même table : rétablis au retour).
  const texteMasque = masquerMontants(ps.texte, ps.table);
  const historique = ps.contexte.historique.map((h) => ({ ...h, texte: masquerMontants(h.texte, ps.table) }));
  const objet = await client.genererJson(promptConversation(texteMasque, { ...contexte, historique }), validerConversation,
    { longueurMax: LONGUEUR_MAX_CONVERSATION, delaiMs: 30 * 1000, sansRelance: true, schema: SCHEMA_CONVERSATION });
  return { reponse: nettoyerReponseConversation(objet.reponse, ps.table) };
}

module.exports = { SCHEMA_CONVERSATION, promptConversation, validerConversation, nettoyerReponseConversation, converser, PRENOMS_COLLABORATEURS };
