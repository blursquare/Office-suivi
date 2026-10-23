// @ts-check
'use strict';
// Connexion à Yousign par identifiant et mot de passe (étude 23/10 : « il faut utiliser identifiant et mot de passe pour le MCP, pas de clé
// d'API ») = OAuth 2.1 « code d'autorisation + PKCE » des serveurs MCP : le serveur de CLAIRE découvre les adresses d'autorisation
// (métadonnées du serveur MCP, puis du serveur d'autorisation), s'enregistre seul (enregistrement dynamique de client), envoie l'utilisateur sur la
// page de connexion de Yousign, reçoit un code à son adresse de retour et l'échange contre un jeton d'accès + un jeton de renouvellement.
// CLAIRE ne voit JAMAIS le mot de passe : seuls des jetons, gardés sur le serveur (clé `yousign-oauth`), jamais renvoyés par une route.
// Toute adresse découverte doit être en https chez Yousign (`yousign.app` / `yousign.com`) : jamais un jeton ni un code vers un autre site.

const crypto = require('node:crypto');

const CLE_YOUSIGN_OAUTH = 'yousign-oauth';
const DUREE_ETAT_MS = 10 * 60 * 1000;
const DELAI_MS = 15000;
const MARGE_JETON_MS = 60 * 1000;

/** Pure : une adresse de la découverte est-elle chez Yousign, en https, sans identifiants ni port ? @param {any} adresse */
function adresseYousignOauthValide(adresse) {
  try {
    const u = new URL(String(adresse || ''));
    return u.protocol === 'https:' && /(^|\.)yousign\.(app|com)$/i.test(u.hostname) && !u.username && !u.password && !u.port;
  } catch (e) { return false; }
}

/** Pure : les adresses de retour que CLAIRE présente : le serveur lui-même, jamais un hôte fourni par la requête sans contrôle. @param {string} origine */
function adresseRetour(origine) {
  return String(origine || '').replace(/\/+$/, '') + '/api/yousign/oauth/retour';
}

/**
 * Pure : l'adresse d'où CLAIRE annonce son retour à Yousign. Un serveur OAuth n'accepte qu'une adresse en https ou en localhost : l'adresse IP
 * du serveur du bureau (http) est donc remplacée par `http://localhost:<port>` (étude 23/10 : « Yousign a refusé l'enregistrement (400) ») ;
 * le navigateur d'un autre poste n'y trouvera rien, mais l'adresse affichée porte le code, que l'on colle dans CLAIRE (`terminer`).
 * @param {string} protocole @param {string} hote ex. « 192.168.60.5:3000 »
 * @returns {{ origine: string, local: boolean }}
 */
function origineRetour(protocole, hote) {
  const h = String(hote || '');
  const nom = h.replace(/:\d+$/, '');
  const port = (h.match(/:(\d+)$/) || [])[1] || '';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(nom);
  if (local || protocole === 'https') return { origine: `${protocole}://${h}`, local };
  return { origine: `http://localhost${port ? ':' + port : ''}`, local: false };
}

/** Pure : { verifier, challenge } PKCE (S256). */
function pkce() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

/**
 * @param {{ lire: () => any, ecrire: (v: any) => void, fetch?: Function, maintenant?: () => number }} o
 */
function creerOauthYousign(o) {
  const fetchFn = o.fetch || fetch;
  const maintenant = o.maintenant || Date.now;
  /** Connexions en cours (état → { verifier, retour, jusqua }) — en mémoire seulement. @type {Map<string, any>} */
  const etats = new Map();
  /** @type {Promise<any> | null} */
  let renouvellement = null;
  /** Change à chaque connexion ou déconnexion : un renouvellement parti avant n'écrit plus rien. */
  let generation = 0;

  async function json(url, init) {
    if (!adresseYousignOauthValide(url)) throw new Error('adresse de connexion refusée (hors Yousign)');
    const ctrl = new AbortController();
    const m = setTimeout(() => ctrl.abort(), DELAI_MS);
    try {
      const r = await fetchFn(url, { ...init, signal: ctrl.signal, redirect: 'error' });
      const texte = await r.text();
      let corps = null;
      try { corps = JSON.parse(texte); } catch (e) { corps = null; }
      return { statut: r.status, ok: r.ok, corps, entetes: r.headers };
    } finally { clearTimeout(m); }
  }

  /** Les adresses d'autorisation, d'échange de jeton et d'enregistrement, découvertes depuis l'adresse du serveur MCP. @param {string} urlMcp */
  async function decouvrir(urlMcp) {
    const u = new URL(urlMcp);
    // 1. Le serveur MCP dit où est son serveur d'autorisation (RFC 9728) ; à défaut, il l'est lui-même.
    let serveur = u.origin;
    const essais = [`${u.origin}/.well-known/oauth-protected-resource${u.pathname === '/' ? '' : u.pathname}`, `${u.origin}/.well-known/oauth-protected-resource`];
    for (const e of essais) {
      try {
        const r = await json(e, { method: 'GET', headers: { Accept: 'application/json' } });
        const as = r.ok && r.corps && Array.isArray(r.corps.authorization_servers) ? r.corps.authorization_servers[0] : '';
        if (as && adresseYousignOauthValide(as)) { serveur = String(as).replace(/\/+$/, ''); break; }
      } catch (err) { /* essai suivant */ }
    }
    // 2. Les métadonnées de ce serveur d'autorisation (RFC 8414, sinon OpenID).
    const s = new URL(serveur);
    const chemins = [`${s.origin}/.well-known/oauth-authorization-server${s.pathname === '/' ? '' : s.pathname}`, `${s.origin}/.well-known/oauth-authorization-server`, `${serveur}/.well-known/openid-configuration`];
    for (const c of chemins) {
      try {
        const r = await json(c, { method: 'GET', headers: { Accept: 'application/json' } });
        const m = r.ok ? r.corps : null;
        if (m && adresseYousignOauthValide(m.authorization_endpoint) && adresseYousignOauthValide(m.token_endpoint)
          && (!m.registration_endpoint || adresseYousignOauthValide(m.registration_endpoint))) {
          return { authorization: m.authorization_endpoint, jeton: m.token_endpoint, enregistrement: m.registration_endpoint || '', scopes: Array.isArray(m.scopes_supported) ? m.scopes_supported : [] };
        }
      } catch (err) { /* suivant */ }
    }
    throw new Error('Yousign n’a pas publié ses adresses de connexion (serveur d’autorisation introuvable)');
  }

  /** CLAIRE s'enregistre chez Yousign pour cette adresse de retour (une fois, puis gardé). @param {any} meta @param {string} retour */
  async function clientPour(meta, retour) {
    const garde = o.lire() || {};
    if (garde.clientId && garde.retour === retour && garde.jeton === meta.jeton) return garde.clientId;
    if (!meta.enregistrement) throw new Error('Yousign n’accepte pas l’enregistrement automatique de CLAIRE : un identifiant d’application est nécessaire');
    const r = await json(meta.enregistrement, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_name: 'CLAIRE (étude notariale)', redirect_uris: [retour], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }) });
    if (!r.ok || !r.corps || typeof r.corps.client_id !== 'string') {
      // La raison donnée par Yousign (« invalid_redirect_uri »…) : un code et une phrase d'erreur, jamais un secret.
      const c = (r.corps && typeof r.corps === 'object') ? r.corps : {};
      const raison = [c.error, c.error_description || c.message].filter((x) => typeof x === 'string' && x).join(' : ').replace(/[^\p{L}\p{N} _.,:'’()-]/gu, '').slice(0, 160);
      throw new Error(`Yousign a refusé l’enregistrement de CLAIRE (${r.statut}${raison ? ' — ' + raison : ''}) pour l’adresse de retour ${retour}`);
    }
    o.ecrire({ ...garde, clientId: r.corps.client_id, retour, jeton: meta.jeton, authorization: meta.authorization });
    return r.corps.client_id;
  }

  /** Début de la connexion : l'adresse de la page de connexion de Yousign. @param {string} urlMcp @param {string} origine l'adresse de CLAIRE vue par le navigateur */
  async function demarrer(urlMcp, origine) {
    const retour = adresseRetour(origine);
    const meta = await decouvrir(urlMcp);
    const clientId = await clientPour(meta, retour);
    const { verifier, challenge } = pkce();
    const etat = crypto.randomBytes(24).toString('base64url');
    const t = maintenant();
    for (const [k, v] of etats) if (v.jusqua < t) etats.delete(k);
    etats.set(etat, { verifier, retour, jusqua: t + DUREE_ETAT_MS });
    const a = new URL(meta.authorization);
    a.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: retour, state: etat, code_challenge: challenge, code_challenge_method: 'S256',
      ...(meta.scopes.length ? { scope: meta.scopes.join(' ') } : {}), resource: urlMcp }).toString();
    return a.toString();
  }

  /** Retour de Yousign avec le code : échangé contre les jetons. @param {string} code @param {string} etat */
  async function terminer(code, etat) {
    const attente = etats.get(etat);
    etats.delete(etat);
    generation++;
    if (!attente || attente.jusqua < maintenant()) throw new Error('connexion expirée ou inconnue : recommencez depuis les Réglages');
    const garde = o.lire() || {};
    if (!garde.clientId || !garde.jeton) throw new Error('connexion incomplète : recommencez depuis les Réglages');
    const r = await json(garde.jeton, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: attente.retour, client_id: garde.clientId, code_verifier: attente.verifier }).toString() });
    if (!r.ok || !r.corps || typeof r.corps.access_token !== 'string') throw new Error(`Yousign a refusé la connexion (${r.statut})`);
    o.ecrire({ ...garde, access: r.corps.access_token, refresh: typeof r.corps.refresh_token === 'string' ? r.corps.refresh_token : '',
      expire: maintenant() + (Number(r.corps.expires_in) > 0 ? Number(r.corps.expires_in) * 1000 : 3600 * 1000), connecteLe: new Date(maintenant()).toISOString() });
  }

  /** Le jeton d'accès à envoyer, renouvelé s'il est près de finir ; '' si CLAIRE n'est pas connectée. */
  async function jeton() {
    const g = o.lire() || {};
    if (!g.access) return '';
    if (g.expire && g.expire - MARGE_JETON_MS > maintenant()) return g.access;
    if (!g.refresh || !g.clientId || !g.jeton) { throw Object.assign(new Error('connexion Yousign expirée : reconnectez-vous dans les Réglages'), { code: 'sans-cle' }); }
    // Un seul renouvellement à la fois (le jeton de renouvellement ne sert souvent qu'une fois).
    if (!renouvellement) {
      const gen = generation;
      renouvellement = (async () => {
        const r = await json(g.jeton, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: g.refresh, client_id: g.clientId }).toString() });
        if (gen !== generation) throw Object.assign(new Error('connexion Yousign modifiée : réessayez'), { code: 'sans-cle' });
        if (!r.ok || !r.corps || typeof r.corps.access_token !== 'string') {
          // Seul un refus du jeton (400/401) l'efface ; une panne passagère (429, 5xx) le garde.
          if (r.statut === 400 || r.statut === 401) o.ecrire({ ...g, access: '', refresh: '', expire: 0 });
          throw Object.assign(new Error('connexion Yousign expirée : reconnectez-vous dans les Réglages'), { code: 'sans-cle' });
        }
        const n = { ...(o.lire() || g), access: r.corps.access_token, refresh: typeof r.corps.refresh_token === 'string' && r.corps.refresh_token ? r.corps.refresh_token : g.refresh,
          expire: maintenant() + (Number(r.corps.expires_in) > 0 ? Number(r.corps.expires_in) * 1000 : 3600 * 1000) };
        o.ecrire(n);
        return n.access;
      })().finally(() => { renouvellement = null; });
    }
    return renouvellement;
  }

  /** CLAIRE est-elle connectée (un jeton, valide ou renouvelable) ? */
  function connectee() { const g = o.lire() || {}; return !!(g.access && (g.refresh || (g.expire && g.expire > maintenant()))); }

  function deconnecter() { generation++; const g = o.lire() || {}; o.ecrire({ clientId: g.clientId || '', retour: g.retour || '', jeton: g.jeton || '', authorization: g.authorization || '' }); etats.clear(); }

  return { demarrer, terminer, jeton, connectee, deconnecter };
}

module.exports = { CLE_YOUSIGN_OAUTH, adresseYousignOauthValide, adresseRetour, origineRetour, pkce, creerOauthYousign };
