// @ts-check
'use strict';
// Une séance de navigation : les onglets du navigateur de CLAIRE et les gestes qu'on y fait (aller à une adresse, lire la page,
// cliquer à une position, capturer l'écran) — voir chrome.js pour le lancement.
//
// Garde-fous TENUS PAR LE CODE (l'IA ne peut pas les contourner) :
// - liste blanche : une page (ou un cadre) hors des sites autorisés n'est pas chargée (Fetch, étape « requête », type Document) ;
//   les ressources d'une page autorisée (tuiles de carte, polices, scripts) passent ;
// - aucun téléchargement sur le disque : un PDF (ou une image) reçu comme document est gardé en mémoire et rendu à l'appelant ;
// - seuls les scripts écrits ici sont exécutés dans la page (aucune IA ne conduit ce navigateur : parcours écrits à l'avance) ;
// - aucune adresse d'achat (panier, commande, paiement, abonnement) n'est chargée (`adresseAchat`).

const { lancerNavigateur } = require('./chrome');

const LARGEUR = 1280;
const HAUTEUR = 800;
const MAX_ELEMENTS = 160;
const MAX_TEXTE_PAGE = 9000;
const MAX_DOCUMENTS = 20;
const MAX_OCTETS_DOCUMENT = 25 * 1024 * 1024;
const DELAI_NAVIGATION_MS = 45000;
const TYPES_DOCUMENTS = /^(application\/pdf|application\/x-pdf|image\/(png|jpe?g|gif|tiff))/i;

/** Pure : l'hôte d'une adresse est-il dans la liste (le domaine lui-même ou un sous-domaine) ? https seulement (http pour la seule
 * boucle locale, celle des essais) ; ni data:, ni blob:, ni identifiants dans l'adresse (audit 0.229.0).
 * @param {string} adresse @param {string[]} domaines */
function adresseAutorisee(adresse, domaines) {
  if (String(adresse || '') === 'about:blank') return true;
  let u;
  try { u = new URL(String(adresse)); } catch (_) { return false; }
  const hote = u.hostname.toLowerCase().replace(/\.$/, '');
  const boucleLocale = hote === '127.0.0.1' || hote === 'localhost';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && boucleLocale)) return false;
  if (u.username || u.password) return false;
  return domaines.some((d) => hote === d || hote.endsWith('.' + d));
}

// Mots entiers d'un achat (« carte » n'est pas « cart ») ; lettres accentuées comprises.
const RE_ACHAT = /(?<![a-zà-ÿ])(payer|paiement|acheter|achat|commander|commande|commandes|panier|souscri\w*|abonn\w*|carte bancaire|r[ée]gler|tarifs?|devis|factures?|checkout|purchase|buy|cart)(?![a-zà-ÿ])/i;

/** Pure : une adresse qui mène à un achat (panier, commande, paiement, abonnement) — le navigateur ne la charge pas. @param {string} adresse */
function adresseAchat(adresse) {
  let chemin = '';
  // « afficherPanier.do » → « afficher Panier do » : les mots collés d'une adresse sont séparés avant la recherche.
  try { const u = new URL(String(adresse)); chemin = decodeURIComponent(u.pathname + ' ' + u.search).replace(/([a-zà-ÿ])([A-Z])/g, '$1 $2').replace(/[/_.?=&-]+/g, ' '); } catch (_) { return false; }
  return RE_ACHAT.test(chemin);
}

/** Pure : nom de fichier d'une réponse (Content-Disposition, sinon fin de l'adresse). @param {Array<{ name: string, value: string }>} entetes @param {string} adresse */
function nomFichierReponse(entetes, adresse) {
  const cd = (entetes || []).find((h) => /^content-disposition$/i.test(h.name));
  const m = cd && /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd.value);
  let nom = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  if (!nom) { try { nom = decodeURIComponent(new URL(adresse).pathname.split('/').pop() || ''); } catch (_) { nom = ''; } }
  return nom.replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').trim().slice(0, 120) || 'document';
}

// Script de lecture de la page : numérote les éléments utiles visibles (data-claire-ref) et rend le texte de la page.
const SCRIPT_INSTANTANE = `(() => {
  const max = ${MAX_ELEMENTS}; let n = 0; const out = [];
  document.querySelectorAll('[data-claire-ref]').forEach((e) => e.removeAttribute('data-claire-ref'));
  const sel = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],[role=switch],[role=combobox],[onclick],[contenteditable=true],summary';
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return null;
    return r;
  };
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim();
  for (const e of document.querySelectorAll(sel)) {
    if (n >= max) break;
    const r = visible(e); if (!r) continue;
    n++; e.setAttribute('data-claire-ref', String(n));
    const type = (e.getAttribute('type') || '').toLowerCase();
    const etiquette = e.labels && e.labels[0] ? e.labels[0].innerText : '';
    const lib = net(e.getAttribute('aria-label') || etiquette || e.getAttribute('placeholder') || e.getAttribute('title')
      || (e.tagName === 'INPUT' || e.tagName === 'SELECT' || e.tagName === 'TEXTAREA' ? '' : e.innerText) || e.getAttribute('alt')
      || (e.querySelector && e.querySelector('img[alt]') ? e.querySelector('img[alt]').getAttribute('alt') : '') || e.getAttribute('name') || '').slice(0, 90);
    const o = { ref: n, balise: e.tagName.toLowerCase(), type, libelle: lib, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    if (e.tagName === 'INPUT' && type === 'password') o.valeur = e.value ? '••••' : '';
    else if (e.tagName === 'INPUT' && (type === 'checkbox' || type === 'radio')) o.coche = !!e.checked;
    else if (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') o.valeur = String(e.value || '').slice(0, 90);
    if (e.tagName === 'SELECT') { o.valeur = e.selectedOptions[0] ? net(e.selectedOptions[0].text) : ''; o.options = [...e.options].slice(0, 50).map((x) => net(x.text)); }
    if (e.tagName === 'A') { const h = e.getAttribute('href') || ''; if (!/^javascript:/i.test(h)) o.lien = h.slice(0, 160); }
    out.push(o);
  }
  const texte = net(document.body ? document.body.innerText.replace(/\\n+/g, ' ¶ ') : '').replace(/( ¶ )+/g, '\\n').slice(0, ${MAX_TEXTE_PAGE});
  return { titre: document.title, url: location.href, texte, elements: out, defile: { haut: Math.round(scrollY), total: Math.round(document.documentElement.scrollHeight), vue: innerHeight } };
})()`;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Le pointeur dessiné sur une capture : flèche blanche cernée de noir, rond rouge si clic récent ; sans effet sur la page (aucun événement, retiré après la capture). @param {number} x @param {number} y @param {boolean} clic */
function scriptPointeur(x, y, clic) {
  return `(() => { const a = document.getElementById('claire-pointeur'); if (a) a.remove(); const d = document.createElement('div'); d.id = 'claire-pointeur';
    d.style.cssText = 'position:fixed;left:${Number(x) | 0}px;top:${Number(y) | 0}px;width:0;height:0;z-index:2147483647;pointer-events:none;';
    d.innerHTML = '${clic ? '<div style="position:absolute;left:-16px;top:-16px;width:32px;height:32px;border-radius:50%;background:rgba(220,38,38,.35);border:2px solid rgb(220,38,38)"></div>' : ''}<svg width="22" height="30" viewBox="0 0 22 30" style="position:absolute;left:0;top:0"><path d="M1 1 L1 22 L6.5 17 L10.5 26 L14 24.5 L10 16 L17 16 Z" fill="white" stroke="black" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    (document.body || document.documentElement).appendChild(d); })()`;
}
const SCRIPT_RETIRER_POINTEUR = `(() => { const a = document.getElementById('claire-pointeur'); if (a) a.remove(); })()`;

class SessionNavigation {
  /** @param {any} lancement rendu par lancerNavigateur @param {{ domaines: string[], refuserAdresse?: (adresse: string) => boolean }} o */
  constructor(lancement, o) {
    this.lancement = lancement;
    this.cdp = lancement.cdp;
    this.domaines = o.domaines;
    this.refuserAdresse = o.refuserAdresse || (() => false);
    /** @type {Array<{ cible: string, session: string, ouvreur: string }>} */
    this.onglets = [];
    /** @type {Array<{ id: string, nom: string, type: string, octets: Buffer, adresse: string, le: number }>} */
    this.documents = [];
    /** @type {string[]} */
    this.bloques = [];
    this.compteurDocuments = 0;
    /** @type {Array<{ methode: string, corps: string, adresse: string }>} */
    this.envois = [];
    this.arreterEcoute = this.cdp.ecouter((m) => { this.surEvenement(m).catch(() => {}); });
  }

  /** Lance un navigateur et ouvre un premier onglet.
   * @param {{ profil: string, chemin?: string, domaines: string[], lancer?: Function, refuserAdresse?: (adresse: string) => boolean }} o */
  static async ouvrir(o) {
    const lancement = await (o.lancer || lancerNavigateur)({ profil: o.profil, chemin: o.chemin, largeur: LARGEUR, hauteur: HAUTEUR });
    const s = new SessionNavigation(lancement, { domaines: o.domaines, refuserAdresse: o.refuserAdresse });
    try {
      await s.cdp.envoyer('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
      await s.cdp.envoyer('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
      // L'onglet que Chrome ouvre au démarrage sert d'onglet de travail (un second, vide, resterait derrière : fermer une fenêtre
      // ouverte par le site ramènerait sur lui).
      for (let i = 0; i < 40 && !s.onglets.length; i++) await attendre(50);
      if (!s.onglets.length) await s.nouvelOnglet();
      return s;
    } catch (e) {
      // Jamais un Chrome laissé ouvert : il garderait le profil et bloquerait toutes les consultations suivantes (relecture 0.229.0).
      await s.fermer().catch(() => {});
      throw e;
    }
  }

  /** @param {any} m */
  async surEvenement(m) {
    if (m.method === 'Target.attachedToTarget') {
      const info = m.params.targetInfo || {};
      const session = m.params.sessionId;
      if (info.type !== 'page') {
        // Un cadre d'un autre site (hors processus) passe sous le même filtre que la page ; sans filtre, il est fermé.
        if (info.type === 'iframe' && !(await this.filtrer(session))) { await this.cdp.envoyer('Target.detachFromTarget', { sessionId: session }).catch(() => {}); return; }
        await this.cdp.envoyer('Runtime.runIfWaitingForDebugger', {}, session).catch(() => {});
        return;
      }
      // Le filtre de la liste blanche d'abord : un onglet qui ne peut pas être filtré est fermé (audit 0.229.0, jamais ouvert « sans filtre »).
      if (!(await this.filtrer(session))) { await this.cdp.envoyer('Target.closeTarget', { targetId: info.targetId }).catch(() => {}); return; }
      await this.preparerOnglet(session);
      if (!this.onglets.some((o) => o.cible === info.targetId)) this.onglets.push({ cible: info.targetId, session, ouvreur: info.openerId || '' });
      await this.cdp.envoyer('Runtime.runIfWaitingForDebugger', {}, session).catch(() => {});
      return;
    }
    if (m.method === 'Target.detachedFromTarget') {
      this.onglets = this.onglets.filter((o) => o.session !== m.params.sessionId);
      return;
    }
    if (m.method === 'Fetch.requestPaused') await this.surRequete(m.sessionId, m.params);
    // Une boîte de dialogue de la page bloque toute navigation tant qu'elle est ouverte : « Quitter la page ? » et une alerte se ferment
    // (on quitte, rien n'est envoyé), une confirmation ou une saisie est TOUJOURS refusée (jamais un « OK » à une suppression).
    if (m.method === 'Page.javascriptDialogOpening') {
      const accepter = ['beforeunload', 'alert'].includes(String(m.params && m.params.type));
      await this.cdp.envoyer('Page.handleJavaScriptDialog', { accept: accepter }, m.sessionId).catch(() => {});
    }
  }

  /** Le filtre de la liste blanche sur un onglet ou un cadre. Rend faux s'il n'a pas pu être posé. @param {string} session */
  async filtrer(session) {
    try {
      // Documents (pages, cadres) à la requête et à la réponse ; les PDF demandés par un script seulement (pas les tuiles des cartes).
      await this.cdp.envoyer('Fetch.enable', { patterns: [
        { urlPattern: '*', resourceType: 'Document', requestStage: 'Request' },
        { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' },
        { urlPattern: '*.pdf*', resourceType: 'XHR', requestStage: 'Response' },
        { urlPattern: '*.pdf*', resourceType: 'Fetch', requestStage: 'Response' }
      ] }, session);
      await this.cdp.envoyer('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, session).catch(() => {});
      return true;
    } catch (_) { return false; }
  }

  /** @param {string} session */
  async preparerOnglet(session) {
    await Promise.all([
      this.cdp.envoyer('Page.enable', {}, session),
      this.cdp.envoyer('Emulation.setDeviceMetricsOverride', { width: LARGEUR, height: HAUTEUR, deviceScaleFactor: 1, mobile: false }, session),
      this.cdp.envoyer('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Paris' }, session)
    ].map((p) => p.catch(() => {})));
  }

  /** @param {string} session @param {any} p */
  async surRequete(session, p) {
    const adresse = String((p.request && p.request.url) || '');
    try {
      if (p.responseStatusCode === undefined && p.responseErrorReason === undefined) {
        // Étape « requête » d'un document : hors liste, refusé.
        if (!adresseAutorisee(adresse, this.domaines) || this.refuserAdresse(adresse)) {
          this.bloques.push(adresse.slice(0, 200));
          await this.cdp.envoyer('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }, session);
          return;
        }
        // Seule l'emprise imprimée envoyée par le site du cadastre est gardée (jamais le corps d'une connexion).
        const corps = p.request && p.request.method === 'POST' ? String(p.request.postData || '') : '';
        if (/(^|&)MAPBBOX=/.test(corps)) this.envois.push({ methode: 'POST', corps: corps.slice(0, 20000), adresse: adresse.slice(0, 300) });
        if (this.envois.length > 10) this.envois.shift();
        await this.cdp.envoyer('Fetch.continueRequest', { requestId: p.requestId }, session);
        return;
      }
      const entetes = p.responseHeaders || [];
      const type = String((entetes.find((h) => /^content-type$/i.test(h.name)) || {}).value || '');
      const enPieceJointe = entetes.some((h) => /^content-disposition$/i.test(h.name) && /attachment/i.test(h.value));
      const ok = Number(p.responseStatusCode) >= 200 && Number(p.responseStatusCode) < 300;
      const longueur = Number((entetes.find((h) => /^content-length$/i.test(h.name)) || {}).value || 0);
      if (ok && longueur <= MAX_OCTETS_DOCUMENT && (TYPES_DOCUMENTS.test(type) || (enPieceJointe && /octet-stream/i.test(type))) && (p.resourceType === 'Document' || /pdf/i.test(type))) {
        const corps = await this.cdp.envoyer('Fetch.getResponseBody', { requestId: p.requestId }, session).catch(() => null);
        if (corps) {
          const octets = Buffer.from(corps.body || '', corps.base64Encoded ? 'base64' : 'utf8');
          if (octets.length && octets.length <= MAX_OCTETS_DOCUMENT) this.garderDocument(nomFichierReponse(entetes, adresse), type.split(';')[0].trim() || 'application/octet-stream', octets, adresse);
        }
      }
      await this.cdp.envoyer('Fetch.continueRequest', { requestId: p.requestId }, session);
    } catch (_) {
      await this.cdp.envoyer('Fetch.continueRequest', { requestId: p.requestId }, session).catch(() => {});
    }
  }

  /** @param {string} nom @param {string} type @param {Buffer} octets @param {string} adresse */
  garderDocument(nom, type, octets, adresse) {
    // Un PDF servi deux fois (aperçu du lecteur de Chrome) n'est gardé qu'une fois.
    if (this.documents.some((d) => d.octets.length === octets.length && d.octets.equals(octets))) return;
    this.compteurDocuments++;
    this.documents.push({ id: `d${this.compteurDocuments}`, nom, type, octets, adresse: adresse.slice(0, 300), le: Date.now() });
    if (this.documents.length > MAX_DOCUMENTS) this.documents.shift();
  }

  async nouvelOnglet() {
    const { targetId } = await this.cdp.envoyer('Target.createTarget', { url: 'about:blank' });
    for (let i = 0; i < 40 && !this.onglets.some((o) => o.cible === targetId); i++) await attendre(50);
    const o = this.onglets.find((x) => x.cible === targetId);
    if (!o) throw new Error('onglet non ouvert');
    return o;
  }

  /** L'onglet de travail : le plus récent (une fenêtre ouverte par le site — aperçu PDF — passe devant). */
  ongletActif() {
    const o = this.onglets[this.onglets.length - 1];
    if (!o) throw new Error('aucun onglet ouvert');
    return o;
  }

  /** Ferme l'onglet actif s'il en reste un autre (retour à la fenêtre précédente). */
  async fermerOngletActif() {
    if (this.onglets.length < 2) return false;
    const o = this.ongletActif();
    await this.cdp.envoyer('Target.closeTarget', { targetId: o.cible }).catch(() => {});
    this.onglets = this.onglets.filter((x) => x !== o);
    return true;
  }

  /** Évalue un script ÉCRIT ICI (jamais un texte de l'IA) dans l'onglet actif. @param {string} expression @param {string} [session] */
  async evaluer(expression, session) {
    const s = session || this.ongletActif().session;
    const r = await this.cdp.envoyer('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, s);
    if (r.exceptionDetails) throw new Error(String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || 'erreur de script').slice(0, 200));
    return r.result ? r.result.value : undefined;
  }

  /** Attend que la page soit chargée et calme (navigations comprises). @param {number} [maxMs] */
  async attendreStable(maxMs = 15000) {
    const fin = Date.now() + maxMs;
    await attendre(400);
    while (Date.now() < fin) {
      try {
        const etat = await this.evaluer('document.readyState');
        if (etat === 'complete') break;
      } catch (_) { /* page en cours de remplacement */ }
      await attendre(250);
    }
    await attendre(700);
    await this.verifierAdresseAffichee();
  }

  /** Seconde barrière : la page AFFICHÉE (après redirections) doit être sur un site autorisé, sinon elle est remplacée par une
   * page vide et le geste échoue. */
  async verifierAdresseAffichee() {
    const o = this.onglets[this.onglets.length - 1];
    if (!o) return;
    const adresse = await this.evaluer('location.href', o.session).catch(() => '');
    if (!adresse || adresseAutorisee(adresse, this.domaines)) return;
    this.bloques.push(String(adresse).slice(0, 200));
    await this.cdp.envoyer('Page.navigate', { url: 'about:blank' }, o.session).catch(() => {});
    throw Object.assign(new Error('page hors des sites autorisés : fermée'), { refus: true });
  }

  /** @param {string} adresse */
  async aller(adresse) {
    if (!adresseAutorisee(adresse, this.domaines)) throw Object.assign(new Error('adresse hors des sites autorisés'), { refus: true });
    const o = this.ongletActif();
    // Un site lent (étude 28/10 : « Page.navigate : délai dépassé » sur Authentic) : la navigation continue après le délai de la
    // commande — on attend qu'elle aboutisse, puis un second essai, avant de dire que le site ne répond pas.
    for (let essai = 1; essai <= 2; essai++) {
      let r;
      // Repère posé dans la page actuelle : tant qu'il est là, la nouvelle page n'est pas arrivée (relecture 0.386.2 : un second
      // chargement du même site prenait l'ancienne page pour la nouvelle).
      await this.cdp.envoyer('Runtime.evaluate', { expression: 'window.__claireAvant = 1' }, o.session, 5000).catch(() => {});
      try {
        r = await this.cdp.envoyer('Page.navigate', { url: adresse }, o.session, DELAI_NAVIGATION_MS);
      } catch (e) {
        if (!/délai dépassé/.test(String(e && e.message))) throw e;
        if (await this.pageArrivee(adresse, DELAI_NAVIGATION_MS)) { await this.attendreStable(); return; }
        if (essai === 2) throw new Error('le site ne répond pas (page non chargée après plusieurs minutes) : réessayer plus tard ; si cela dure, vérifier l’accès à Internet du serveur');
        continue;
      }
      if (r.errorText && !/ERR_ABORTED/.test(r.errorText)) {
        if (essai === 2 || !/TIMED_OUT|CONNECTION|NETWORK|NAME_NOT_RESOLVED|INTERNET/.test(r.errorText)) throw new Error(`page non chargée (${r.errorText})`);
        await attendre(3000);
        continue;
      }
      await this.attendreStable();
      return;
    }
  }

  /** La page demandée a-t-elle fini par arriver (même site, document chargé) ? @param {string} adresse @param {number} maxMs */
  async pageArrivee(adresse, maxMs) {
    const hote = (() => { try { return new URL(adresse).host; } catch (_) { return ''; } })();
    const fin = Date.now() + maxMs;
    while (Date.now() < fin) {
      const etat = await this.evaluer('[location.host, document.readyState, !!window.__claireAvant]').catch(() => null);
      if (etat && hote && etat[0] === hote && etat[1] !== 'loading' && !etat[2]) return true;
      await attendre(1000);
    }
    return false;
  }

  /** La page lue : titre, adresse, texte, éléments numérotés. */
  async instantane() {
    let dernier;
    for (let i = 0; i < 3; i++) {
      try { return await this.evaluer(SCRIPT_INSTANTANE); } catch (e) { dernier = e; await attendre(500); }
    }
    throw dernier;
  }

  /** @param {number} x @param {number} y */
  async cliquerPosition(x, y) {
    const s = this.ongletActif().session;
    const px = Math.max(0, Math.min(LARGEUR - 1, Math.round(Number(x) || 0)));
    const py = Math.max(0, Math.min(HAUTEUR - 1, Math.round(Number(y) || 0)));
    this.souris = { x: px, y: py, clicLe: Date.now() };
    await this.cdp.envoyer('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py }, s);
    await this.cdp.envoyer('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1 }, s);
    await this.cdp.envoyer('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1 }, s);
    const avant = this.onglets.length;
    await this.attendreStable(12000);
    return { nouvelOnglet: this.onglets.length > avant };
  }

  /** Capture de l'écran de l'onglet actif (JPEG, base64), pour suivre CLAIRE en direct sur le poste. Le pointeur de CLAIRE (dernière position de la souris,
   * rond de clic pendant 1,5 s) y est dessiné le temps de la capture seulement (étude 29/10 : « avec la souris qui bouge ») ; jamais laissé dans la page. */
  async capture() {
    const session = this.ongletActif().session;
    const m = this.souris;
    let pose = false;
    if (m) {
      const clic = Date.now() - m.clicLe < 1500;
      try {
        await this.evaluer(scriptPointeur(m.x, m.y, clic));
        pose = true;
      } catch (_) { /* page en navigation : sans pointeur cette fois */ }
    }
    try {
      const r = await this.cdp.envoyer('Page.captureScreenshot', { format: 'jpeg', quality: 72 }, session);
      return String(r.data || '');
    } finally {
      if (pose) await this.evaluer(SCRIPT_RETIRER_POINTEUR).catch(() => {});
    }
  }

  async fermer() {
    this.arreterEcoute();
    await this.lancement.arreter();
  }
}

module.exports = { SessionNavigation, adresseAutorisee, adresseAchat, nomFichierReponse };
