// @ts-check
'use strict';
// Yousign (étude 23/10 : « brancher le MCP de Yousign à CLAIRE, toutes les options, lecture et écriture ») — signature électronique,
// par le serveur MCP de Yousign (https://api.yousign.app/mcp, réponses JSON ou SSE, session `mcp-session-id`, jeton « Authorization: Bearer »).
// Même principe qu'OpenLegi : le SERVEUR de CLAIRE est le client MCP (le jeton ne quitte jamais le serveur, les résultats passent par
// le masquage de l'agent — jamais directement chez l'IA, ce que ferait le connecteur MCP de l'API Anthropic). Les outils sont lus par
// tools/list (gardés 1 h) et donnés à l'agent sous le nom « yousign__<outil> » ; l'appel passe par le poste, qui demande la carte
// « Autoriser / Refuser » pour TOUT outil qui écrit (créer, modifier, ajouter ou retirer un signataire, ENVOYER), puis par
// POST /api/yousign/appel. Jamais exposé : `send_feedback` (texte libre vers l'éditeur).

const crypto = require('node:crypto');
const { messagesSse, texteResultatOpenlegi, schemaPropreOpenlegi } = require('./openlegi');

const URL_YOUSIGN_DEFAUT = 'https://api.yousign.app/mcp';
const CLE_YOUSIGN = 'yousign';
const PREFIXE_YOUSIGN = 'yousign__';
const DUREE_OUTILS_MS = 3600 * 1000;
const DELAI_APPEL_MS = 45000;
const DELAI_LISTE_MS = 8000;
const VERSION_PROTOCOLE = '2025-06-18';
const DUREE_AUTORISATION_MS = 10 * 60 * 1000;
const MAX_REPONSE = 2000000;
const SERVEURS_YOUSIGN = new Set(['api.yousign.app', 'api-sandbox.yousign.app']);

/** Pure : l'adresse du serveur MCP est-elle un serveur de Yousign ? https seul, un nom en `.yousign.app`, ni identifiants ni port — le jeton
 * ne part jamais ailleurs (une adresse tapée par erreur ou piégée). @param {string} adresse */
function urlYousignValide(adresse) {
  try {
    const u = new URL(String(adresse || ''));
    return u.protocol === 'https:' && SERVEURS_YOUSIGN.has(u.hostname.toLowerCase()) && !u.username && !u.password && !u.port;
  } catch (e) { return false; }
}

/** Pure : 'lecture' (get, search, list), 'ecriture' (le reste) ou 'exclu' (jamais donné à l'agent). @param {string} nom */
function classeOutilYousign(nom) {
  const n = String(nom || '');
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(n)) return 'exclu';
  if (/^send[-_]feedback$/i.test(n)) return 'exclu';
  // Lecture : un préfixe get / search / list ET aucun mot d'action (un futur « get-and-send » reste une écriture, donc sous carte).
  return /^(get|search|list)[-_]/i.test(n) && !/(send|create|update|add|remove|delete|cancel|archive|approve|sign|remind|activate|revoke|reopen|finish)/i.test(n.replace(/^(get|search|list)[-_]/i, '').replace(/signature[-_]requests?|signers?/gi, '')) ? 'lecture' : 'ecriture';
}

/** Pure : le nom donné à l'agent, et l'inverse (nom de l'outil de Yousign ou null). @param {string} nom */
function nomAgentYousign(nom) { return PREFIXE_YOUSIGN + nom; }
/** @param {string} nomAgent */
function decouperNomYousign(nomAgent) {
  const m = /^yousign__([a-zA-Z0-9_-]{1,50})$/.exec(String(nomAgent || ''));
  return m ? m[1] : null;
}

/** Pure : un outil de Yousign au format des outils de l'agent (non strict), ou null. @param {any} outil @param {boolean} ecriture */
function outilAgentDepuisYousign(outil, ecriture) {
  if (!outil || classeOutilYousign(outil.name) === 'exclu') return null;
  if (classeOutilYousign(outil.name) === 'ecriture' && !ecriture) return null;
  const schema = schemaPropreOpenlegi(outil.inputSchema);
  if (!schema) return null;
  const note = classeOutilYousign(outil.name) === 'ecriture' ? ' (ÉCRIT dans Yousign : l’utilisateur doit autoriser chaque appel)' : '';
  return { name: nomAgentYousign(outil.name), description: `[Yousign — signature électronique]${note} ${String(outil.description || '').replace(/\s+/g, ' ').slice(0, 400)}`, input_schema: schema };
}

/** Pure : une écriture ramenée à une clé stable (nom + arguments, clés triées). @param {string} nomAgent @param {any} args */
function cleAppelYousign(nomAgent, args) {
  const trier = (v) => (Array.isArray(v) ? v.map(trier) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, trier(v[k])])) : v);
  return crypto.createHash('sha256').update(nomAgent + '\n' + JSON.stringify(trier(args && typeof args === 'object' ? args : {}))).digest('hex');
}

/**
 * Le client MCP de Yousign (une session, rouverte sur une session expirée).
 * @param {{ reglages: () => { cle: string, url: string, ecriture: boolean }, jeton?: () => Promise<string>, fetch?: Function, maintenant?: () => number }} o  `jeton` : le jeton à envoyer (connexion par identifiant et mot de passe, OAuth) ; à défaut, la clé des Réglages.
 */
function creerClientYousign(o) {
  const fetchFn = o.fetch || fetch;
  const maintenant = o.maintenant || Date.now;
  /** @type {{ session: string } | null} */
  let session = null;
  /** @type {{ le: number, outils: any[] } | null} */
  let outils = null;
  let echecLe = 0;
  let suspenduJusqua = 0;
  let id = 0;
  /** Écritures DEMANDÉES par l'agent (la clé d'un appel émis par le serveur), consommées une fois : sans elles, `appeler` refuse d'écrire —
   * un curl direct sur /api/yousign/appel n'envoie rien (audit 0.321.0, H1). @type {Map<string, number>} */
  const attendues = new Map();

  async function poster(corps, sess, delai) {
    const r = o.reglages();
    const jeton = o.jeton ? await o.jeton() : '';
    const cle = jeton || r.cle;
    if (!cle) { const e = new Error('Yousign non connecté'); /** @type {any} */ (e).code = 'sans-cle'; throw e; }
    if (!urlYousignValide(r.url)) throw new Error('adresse Yousign refusée (un serveur en .yousign.app seulement)');
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), delai || DELAI_APPEL_MS);
    try {
      const rep = await fetchFn(r.url, {
        method: 'POST', signal: ctrl.signal, redirect: 'error',
        headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
          ...(sess ? { 'mcp-session-id': sess } : {}), 'MCP-Protocol-Version': VERSION_PROTOCOLE },
        body: JSON.stringify(corps)
      });
      const texte = await rep.text();
      if (texte.length > MAX_REPONSE) throw new Error('réponse Yousign trop volumineuse');
      return { statut: rep.status, ok: rep.ok, session: (rep.headers && rep.headers.get && rep.headers.get('mcp-session-id')) || '', messages: messagesSse(texte) };
    } finally { clearTimeout(minuteur); }
  }

  function erreurStatut(statut) {
    const e = new Error(statut === 401 || statut === 403 ? 'connexion ou clé Yousign refusée' : statut === 429 ? 'limite de débit Yousign atteinte'
      : statut >= 500 ? 'service Yousign momentanément indisponible' : `Yousign a répondu ${statut}`);
    /** @type {any} */ (e).statut = statut;
    return e;
  }

  async function ouvrir() {
    const r = await poster({ jsonrpc: '2.0', id: ++id, method: 'initialize',
      params: { protocolVersion: VERSION_PROTOCOLE, capabilities: {}, clientInfo: { name: 'CLAIRE', version: '1' } } }, '', DELAI_LISTE_MS);
    if (!r.ok) throw erreurStatut(r.statut);
    await poster({ jsonrpc: '2.0', method: 'notifications/initialized' }, r.session, DELAI_LISTE_MS).catch(() => null);
    session = { session: r.session };
    return r.session;
  }

  async function requete(method, params, delai) {
    for (let essai = 0; essai < 2; essai++) {
      const neuve = !session;
      const sess = neuve ? await ouvrir() : /** @type {any} */ (session).session;
      const n = ++id;
      const r = await poster({ jsonrpc: '2.0', id: n, method, params }, sess, delai);
      // Session oubliée par le serveur : rouverte une fois — jamais pour une session ouverte à l'instant (un 400 y dit des arguments refusés).
      // (Un appel d'outil n'est rejoué que sur 404 : un 400 y dit des arguments refusés, jamais une écriture à refaire.)
      if (essai === 0 && !neuve && (r.statut === 404 || (r.statut === 400 && method !== 'tools/call'))) { session = null; continue; }
      const m = r.messages.find((x) => x && x.id === n) || r.messages.find((x) => x && (x.result || x.error));
      // Un refus de Yousign garde son message (arguments refusés…) quand il est rendu.
      if (!r.ok) { if (m && m.error && m.error.message && r.statut < 500 && r.statut !== 401 && r.statut !== 403) throw new Error(String(m.error.message).slice(0, 200)); throw erreurStatut(r.statut); }
      if (!m) throw new Error('réponse Yousign illisible');
      if (m.error) throw new Error(String(m.error.message || 'erreur Yousign').slice(0, 200));
      return m.result;
    }
    throw new Error('session Yousign impossible à ouvrir');
  }

  /** Tous les outils connus du serveur, sans ceux exclus (gardés 1 h). */
  async function outilsServeur() {
    if (outils && maintenant() - outils.le < DUREE_OUTILS_MS) return outils.outils;
    if (echecLe && maintenant() - echecLe < 5 * 60 * 1000) throw new Error('Yousign indisponible (nouvel essai dans quelques minutes)');
    const tous = [];
    try {
      let curseur;
      for (let page = 0; page < 5; page++) {
        const r = await requete('tools/list', curseur ? { cursor: curseur } : {}, DELAI_LISTE_MS);
        if (r && Array.isArray(r.tools)) tous.push(...r.tools);
        curseur = r && typeof r.nextCursor === 'string' && r.nextCursor ? r.nextCursor : '';
        if (!curseur) break;
      }
    } catch (e) { if (/** @type {any} */ (e).code !== 'sans-cle') echecLe = maintenant(); throw e; }
    echecLe = 0;
    const vus = new Set();
    const liste = tous.filter((t) => t && classeOutilYousign(t.name) !== 'exclu' && !vus.has(t.name) && vus.add(t.name) && schemaPropreOpenlegi(t.inputSchema));
    outils = { le: maintenant(), outils: liste };
    return liste;
  }

  /** Les outils donnés à l'agent : lecture seule si l'écriture est coupée dans les Réglages ; vide si Yousign ne répond pas. */
  async function outilsAgent() {
    const r = o.reglages();
    if (suspenduJusqua > maintenant()) return [];
    try {
      const liste = await Promise.race([outilsServeur(), new Promise((ok) => { const m = setTimeout(() => ok([]), DELAI_LISTE_MS); if (m && m.unref) m.unref(); })]);
      return /** @type {any[]} */ (liste).map((t) => outilAgentDepuisYousign(t, r.ecriture)).filter(Boolean);
    } catch (e) { return []; }
  }

  /** Un appel d'outil (nom donné à l'agent). Rend { texte, erreur, ecriture }. @param {string} nomAgent @param {any} args */
  async function appeler(nomAgent, args) {
    const nom = decouperNomYousign(nomAgent);
    if (!nom) throw new Error('outil Yousign inconnu');
    const classe = classeOutilYousign(nom);
    if (classe === 'exclu') throw new Error('outil Yousign non permis');
    if (classe === 'ecriture') {
      if (!o.reglages().ecriture) throw new Error('écriture dans Yousign coupée dans les Réglages');
      // Une écriture n'est faite que si l'agent l'a demandée (appel émis par le serveur, avec ces arguments) — et le poste, lui, a affiché la carte.
      const cle = cleAppelYousign(nomAgent, args);
      const jusqua = attendues.get(cle);
      attendues.delete(cle);
      if (!jusqua || jusqua < maintenant()) throw new Error('écriture refusée : elle n’a pas été demandée par l’agent');
    }
    const connus = await outilsServeur();
    if (!connus.some((t) => t.name === nom)) throw new Error('outil Yousign inconnu du serveur');
    try {
      const r = await requete('tools/call', { name: nom, arguments: args && typeof args === 'object' ? args : {} });
      return { texte: texteResultatOpenlegi(r), erreur: !!(r && r.isError), ecriture: classe === 'ecriture' };
    } catch (e) {
      // Coupé par le délai : l'écriture a pu aboutir chez Yousign — l'IA doit relire la demande avant de recommencer.
      if (classe === 'ecriture' && e && /** @type {any} */ (e).name === 'AbortError') throw new Error('Yousign n’a pas répondu à temps : résultat incertain, relire la demande avant de recommencer');
      throw e;
    }
  }

  /** L'agent vient de demander ces appels : ceux qui écrivent sont attendus (10 min, une fois chacun). @param {Array<{ nom: string, entree: any }>} appels */
  function attendre(appels) {
    const t = maintenant();
    for (const [k, v] of attendues) if (v < t) attendues.delete(k);
    for (const a of appels || []) {
      const n = decouperNomYousign(a && a.nom);
      if (n && classeOutilYousign(n) === 'ecriture') attendues.set(cleAppelYousign(a.nom, a.entree), t + DUREE_AUTORISATION_MS);
    }
  }

  /** Yousign mis de côté une heure (schéma refusé par l'IA). */
  function suspendre() { suspenduJusqua = maintenant() + 3600 * 1000; }

  function oublier() { session = null; outils = null; echecLe = 0; suspenduJusqua = 0; }

  return { outilsAgent, outilsServeur, appeler, attendre, suspendre, oublier };
}

module.exports = { cleAppelYousign, URL_YOUSIGN_DEFAUT, CLE_YOUSIGN, PREFIXE_YOUSIGN, urlYousignValide, classeOutilYousign, nomAgentYousign, decouperNomYousign,
  outilAgentDepuisYousign, creerClientYousign };
