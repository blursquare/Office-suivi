// @ts-check
'use strict';
// OpenLegi (étude 18/10 : « on va connecter openlegi à CLAIRE » ; sources choisies : Légifrance, BOFiP, RNE ; agent seulement) —
// sources juridiques officielles (API PISTE de Légifrance, BOFiP, registre national des entreprises) servies par un serveur MCP
// (https://mcp.openlegi.fr/<source>/mcp, réponses en SSE, session `mcp-session-id`, jeton « Authorization: Bearer »). Le SERVEUR de
// CLAIRE est le client MCP : le jeton ne quitte jamais le serveur, les outils d'OpenLegi sont lus par tools/list (gardés 6 h) et
// donnés à l'agent sous le nom « <source>__<outil> » ; l'appel passe par le poste (comme tout outil) puis par
// POST /api/openlegi/appel. Liste blanche : recherches et lectures seulement (jamais un téléchargement ni un effacement de fichier).
// Hébergement d'OpenLegi : France (Clever Cloud) ; journaux de requêtes (métadonnées) 12 mois d'après sa politique de confidentialité.

const BASE_OPENLEGI = 'https://mcp.openlegi.fr';
const SOURCES_OPENLEGI = ['legifrance', 'bofip', 'rne'];
const LIBELLES_SOURCES_OPENLEGI = { legifrance: 'Légifrance', bofip: 'BOFiP', rne: 'Registre national des entreprises' };
const CLE_OPENLEGI = 'openlegi';
const DUREE_OUTILS_MS = 6 * 3600 * 1000;
const DELAI_APPEL_MS = 45000;
const DELAI_LISTE_MS = 8000;   // ouverture et liste des outils : une question n'attend jamais 45 s par source
const MAX_TEXTE_RESULTAT = 40000;
const VERSION_PROTOCOLE = '2025-06-18';

// RNE : la recherche d'une société, ses données et ses annonces BODACC ; jamais les téléchargements d'actes, de bilans ni la gestion
// de fichiers temporaires côté OpenLegi.
const OUTILS_RNE_PERMIS = new Set(['rne_search_companies', 'rne_get_company_data', 'rne_get_bodacc']);

/** Pure : un outil d'OpenLegi peut-il être donné à l'agent ? Vraie liste blanche (relecture 0.281.0) : recherches, lectures et listes
 * seulement, par leur préfixe ; un outil nouveau d'un autre genre n'est jamais donné sans relecture. @param {string} source @param {string} nom */
function outilPermisOpenlegi(source, nom) {
  const n = String(nom || '');
  if (!/^[a-z0-9_]{1,50}$/i.test(n)) return false;
  if (source === 'rne') return OUTILS_RNE_PERMIS.has(n);
  return /^(rechercher|recherche|search|get|lire|lister|list|dernier|consulter)_/i.test(n)
    && !/(download|telecharg|delete|supprim|cleanup|temp|upload|write|send|envoy|share|partag|export|save)/i.test(n);
}

/** Pure : un schéma d'entrée sûr pour Claude et Mistral — `$ref` vers `$defs` résolus (3 niveaux), noms de propriétés contrôlés ;
 * null si le schéma n'est pas utilisable (l'outil est alors écarté). @param {any} schema */
function schemaPropreOpenlegi(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return { type: 'object', properties: {} };
  const defs = (schema.$defs && typeof schema.$defs === 'object') ? schema.$defs : (schema.definitions && typeof schema.definitions === 'object' ? schema.definitions : {});
  const resoudre = (v, profondeur) => {
    if (Array.isArray(v)) return v.map((x) => resoudre(x, profondeur));
    if (!v || typeof v !== 'object') return v;
    if (typeof v.$ref === 'string') {
      const m = /^#\/(?:\$defs|definitions)\/([A-Za-z0-9_.-]+)$/.exec(v.$ref);
      if (!m || !defs[m[1]] || profondeur > 3) return { type: 'string' };
      return resoudre(defs[m[1]], profondeur + 1);
    }
    /** @type {Record<string, any>} */
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === '$defs' || k === 'definitions' || k === '$schema') continue;
      if (k === 'description') { o[k] = String(x || '').replace(/\s+/g, ' ').slice(0, 200); continue; }
      if (k === 'properties' && x && typeof x === 'object' && !Array.isArray(x)) {
        // Clés imbriquées contrôlées comme au premier niveau : une clé exotique ferait refuser la requête par l'IA.
        if (Object.keys(x).some((cle) => !/^[a-zA-Z0-9_.-]{1,64}$/.test(cle))) throw new Error('schéma');
      }
      o[k] = resoudre(x, profondeur);
    }
    return o;
  };
  const props = schema.properties;
  if (props !== undefined && (!props || typeof props !== 'object' || Array.isArray(props))) return null;
  const proprietes = {};
  try {
    for (const [k, v] of Object.entries(props || {})) {
      if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(k) || !v || typeof v !== 'object') return null;
      proprietes[k] = resoudre(v, 0);
    }
  } catch (e) { return null; }
  const requis = Array.isArray(schema.required) ? schema.required.filter((r) => typeof r === 'string' && r in proprietes) : [];
  return { type: 'object', properties: proprietes, ...(requis.length ? { required: requis } : {}) };
}

/** Pure : le nom donné à l'agent. @param {string} source @param {string} nom */
function nomAgentOpenlegi(source, nom) { return `${source}__${nom}`; }

/** Pure : { source, nom } d'après le nom donné à l'agent, ou null. @param {string} nomAgent */
function decouperNomOpenlegi(nomAgent) {
  const m = /^([a-z]+)__([a-z0-9_]+)$/i.exec(String(nomAgent || ''));
  return m && SOURCES_OPENLEGI.includes(m[1]) ? { source: m[1], nom: m[2] } : null;
}

/** Pure : les messages JSON-RPC d'une réponse SSE (lignes « data: »), ou le JSON d'une réponse simple. @param {string} texte */
function messagesSse(texte) {
  const t = String(texte || '').trim();
  if (t.startsWith('{') || t.startsWith('[')) { try { const j = JSON.parse(t); return Array.isArray(j) ? j : [j]; } catch (e) { return []; } }
  const sortie = [];
  for (const bloc of t.split(/\r?\n\r?\n/)) {
    const data = bloc.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
    if (!data) continue;
    try { sortie.push(JSON.parse(data)); } catch (e) { /* bloc illisible ignoré */ }
  }
  return sortie;
}

/** Pure : le texte d'un résultat tools/call (contenus « text » joints), borné. @param {any} resultat */
function texteResultatOpenlegi(resultat) {
  const contenus = resultat && Array.isArray(resultat.content) ? resultat.content : [];
  let t = contenus.filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n\n');
  if (!t && resultat && resultat.structuredContent) t = JSON.stringify(resultat.structuredContent);
  return t.length > MAX_TEXTE_RESULTAT ? t.slice(0, MAX_TEXTE_RESULTAT) + '\n… (coupé : affiner la recherche)' : t;
}

/** Pure : le schéma d'un outil d'OpenLegi au format des outils de l'agent (Claude). @param {string} source @param {any} outil */
function outilAgentDepuisOpenlegi(source, outil) {
  const schema = schemaPropreOpenlegi(outil && outil.inputSchema);
  if (!schema) return null;
  return {
    name: nomAgentOpenlegi(source, outil.name),
    description: `[${LIBELLES_SOURCES_OPENLEGI[source]} — OpenLegi] ${String(outil.description || '').replace(/\s+/g, ' ').slice(0, 400)}`,
    input_schema: schema
  };
}

/**
 * Le client MCP d'OpenLegi (une session par source, rouverte sur une session expirée).
 * @param {{ jeton: () => string, fetch?: Function, maintenant?: () => number }} o
 */
function creerClientOpenlegi(o) {
  const fetchFn = o.fetch || fetch;
  const maintenant = o.maintenant || Date.now;
  /** @type {Record<string, { session: string, ouverte: number }>} (session '' = serveur sans session, déjà ouvert) */
  const sessions = {};
  /** @type {Record<string, { le: number, outils: any[] }>} */
  const outils = {};
  /** Source en panne : pas de nouvel essai pendant 10 min (un jeton refusé ne ralentit pas chaque question). @type {Record<string, number>} */
  const echecs = {};
  let suspenduJusqua = 0;
  let id = 0;

  async function poster(source, corps, session, delai) {
    const jeton = o.jeton();
    if (!jeton) { const e = new Error('jeton OpenLegi non enregistré'); /** @type {any} */ (e).code = 'sans-jeton'; throw e; }
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), delai || DELAI_APPEL_MS);
    try {
      const r = await fetchFn(`${BASE_OPENLEGI}/${source}/mcp`, {
        method: 'POST', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
          ...(session ? { 'mcp-session-id': session } : {}), 'MCP-Protocol-Version': VERSION_PROTOCOLE },
        body: JSON.stringify(corps)
      });
      const texte = await r.text();
      return { statut: r.status, ok: r.ok, session: (r.headers && r.headers.get && r.headers.get('mcp-session-id')) || '', messages: messagesSse(texte) };
    } finally { clearTimeout(minuteur); }
  }

  function erreurStatut(statut) {
    const e = new Error(statut === 401 || statut === 403 ? 'jeton OpenLegi refusé' : statut === 429 ? 'limite de débit OpenLegi atteinte'
      : statut >= 500 ? 'service OpenLegi momentanément indisponible' : `OpenLegi a répondu ${statut}`);
    /** @type {any} */ (e).statut = statut;
    return e;
  }

  async function ouvrir(source) {
    const r = await poster(source, { jsonrpc: '2.0', id: ++id, method: 'initialize',
      params: { protocolVersion: VERSION_PROTOCOLE, capabilities: {}, clientInfo: { name: 'CLAIRE', version: '1' } } }, '', DELAI_LISTE_MS);
    if (!r.ok) throw erreurStatut(r.statut);
    const session = r.session;
    await poster(source, { jsonrpc: '2.0', method: 'notifications/initialized' }, session, DELAI_LISTE_MS).catch(() => null);
    sessions[source] = { session, ouverte: maintenant() };
    return session;
  }

  async function requete(source, method, params, delai) {
    if (!SOURCES_OPENLEGI.includes(source)) throw new Error('source inconnue');
    for (let essai = 0; essai < 2; essai++) {
      const neuve = !sessions[source];
      const session = neuve ? await ouvrir(source) : sessions[source].session;
      const n = ++id;
      const r = await poster(source, { jsonrpc: '2.0', id: n, method, params }, session, delai);
      // Session oubliée par le serveur (redémarrage, délai) : rouverte une fois — jamais pour une session ouverte à l'instant (un 400
      // y dit des arguments refusés).
      if (essai === 0 && !neuve && (r.statut === 404 || r.statut === 400)) { delete sessions[source]; continue; }
      if (!r.ok) throw erreurStatut(r.statut);
      const m = r.messages.find((x) => x && x.id === n) || r.messages.find((x) => x && (x.result || x.error));
      if (!m) throw new Error('réponse OpenLegi illisible');
      if (m.error) throw new Error(String(m.error.message || 'erreur OpenLegi').slice(0, 200));
      return m.result;
    }
    throw new Error('session OpenLegi impossible à ouvrir');
  }

  /** Les outils permis d'une source (gardés 6 h). @param {string} source */
  async function outilsSource(source) {
    const g = outils[source];
    if (g && maintenant() - g.le < DUREE_OUTILS_MS) return g.outils;
    if (echecs[source] && maintenant() - echecs[source] < 10 * 60 * 1000) throw new Error('source OpenLegi indisponible (nouvel essai dans quelques minutes)');
    const tous = [];
    try {
      let curseur;
      for (let page = 0; page < 5; page++) {
        const r = await requete(source, 'tools/list', curseur ? { cursor: curseur } : {}, DELAI_LISTE_MS);
        if (r && Array.isArray(r.tools)) tous.push(...r.tools);
        curseur = r && typeof r.nextCursor === 'string' && r.nextCursor ? r.nextCursor : '';
        if (!curseur) break;
      }
    } catch (e) { if (/** @type {any} */ (e).code !== 'sans-jeton') echecs[source] = maintenant(); throw e; }
    delete echecs[source];
    const vus = new Set();
    const liste = tous.filter((t) => t && outilPermisOpenlegi(source, t.name) && !vus.has(t.name) && vus.add(t.name)
      && outilAgentDepuisOpenlegi(source, t));
    outils[source] = { le: maintenant(), outils: liste };
    return liste;
  }

  /** Tous les outils permis, au format de l'agent ; une source en panne est sautée. */
  async function outilsAgent() {
    if (suspenduJusqua > maintenant()) return [];
    // Les trois sources en même temps (relecture 0.281.0 : l'une après l'autre, une panne faisait attendre la question).
    // Borné à 8 s en tout : une source lente sert la question suivante (sa liste arrive dans le cache), jamais celle-ci.
    const parSource = SOURCES_OPENLEGI.map((s) => outilsSource(s).then((liste) => liste.map((t) => outilAgentDepuisOpenlegi(s, t)).filter(Boolean)).catch(() => []));
    const limite = new Promise((ok) => { const m = setTimeout(() => ok(null), DELAI_LISTE_MS); if (m && m.unref) m.unref(); });
    const r = await Promise.all(parSource.map((p) => Promise.race([p, limite])));
    return r.flatMap((x) => x || []);
  }

  /** Outils refusés par l'IA (schéma) : plus proposés pendant une heure. */
  function suspendre() { suspenduJusqua = maintenant() + 3600 * 1000; }

  /** Un appel d'outil (nom donné à l'agent). @param {string} nomAgent @param {any} args */
  async function appeler(nomAgent, args) {
    const n = decouperNomOpenlegi(nomAgent);
    if (!n) throw new Error('outil OpenLegi inconnu');
    const permis = await outilsSource(n.source);
    if (!permis.some((t) => t.name === n.nom)) throw new Error('outil OpenLegi non permis');
    const r = await requete(n.source, 'tools/call', { name: n.nom, arguments: args && typeof args === 'object' ? args : {} });
    return { source: n.source, texte: texteResultatOpenlegi(r), erreur: !!(r && r.isError) };
  }

  function oublier() { for (const t of [sessions, outils, echecs]) for (const k of Object.keys(t)) delete t[k]; suspenduJusqua = 0; }

  return { outilsAgent, outilsSource, appeler, oublier, suspendre };
}

module.exports = { BASE_OPENLEGI, SOURCES_OPENLEGI, LIBELLES_SOURCES_OPENLEGI, CLE_OPENLEGI, outilPermisOpenlegi, schemaPropreOpenlegi, nomAgentOpenlegi,
  decouperNomOpenlegi, messagesSse, texteResultatOpenlegi, outilAgentDepuisOpenlegi, creerClientOpenlegi };
