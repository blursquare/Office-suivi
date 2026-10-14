// @ts-check
'use strict';
// Une séance de navigation : les onglets du navigateur de CLAIRE et les gestes qu'on y fait (aller à une adresse, lire la page,
// cliquer, écrire, choisir, appuyer sur une touche, faire défiler, capturer l'écran) — voir chrome.js pour le lancement.
//
// Garde-fous TENUS PAR LE CODE (l'IA ne peut pas les contourner) :
// - liste blanche : une page (ou un cadre) hors des sites autorisés n'est pas chargée (Fetch, étape « requête », type Document) ;
//   les ressources d'une page autorisée (tuiles de carte, polices, scripts) passent ;
// - aucun téléchargement sur le disque : un PDF (ou une image) reçu comme document est gardé en mémoire et rendu à l'appelant ;
// - aucun code de l'IA n'est exécuté dans la page : seuls les scripts écrits ici le sont ;
// - un mot de passe est tapé par `saisirSecret`, jamais rendu par `instantane` (un champ mot de passe y vaut « •••• »).

const { lancerNavigateur } = require('./chrome');

const LARGEUR = 1280;
const HAUTEUR = 800;
const MAX_ELEMENTS = 160;
const MAX_TEXTE_PAGE = 9000;
const MAX_DOCUMENTS = 20;
const TYPES_DOCUMENTS = /^(application\/pdf|application\/x-pdf|image\/(png|jpe?g|gif|tiff))/i;

/** Pure : l'hôte d'une adresse est-il dans la liste (le domaine lui-même ou un sous-domaine) ? Seul https (et http d'un hôte listé).
 * @param {string} adresse @param {string[]} domaines */
function adresseAutorisee(adresse, domaines) {
  if (/^(about:blank|data:)/i.test(String(adresse || ''))) return true;
  let u;
  try { u = new URL(String(adresse)); } catch (_) { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  const hote = u.hostname.toLowerCase().replace(/\.$/, '');
  return domaines.some((d) => hote === d || hote.endsWith('.' + d));
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

const TOUCHES = {
  Entree: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Echap: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Bas: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  Haut: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  PageSuivante: { key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 },
  Retour: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }
};

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

class SessionNavigation {
  /** @param {any} lancement rendu par lancerNavigateur @param {{ domaines: string[] }} o */
  constructor(lancement, o) {
    this.lancement = lancement;
    this.cdp = lancement.cdp;
    this.domaines = o.domaines;
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

  /** Lance un navigateur et ouvre un premier onglet. @param {{ profil: string, chemin?: string, domaines: string[], lancer?: Function }} o */
  static async ouvrir(o) {
    const lancement = await (o.lancer || lancerNavigateur)({ profil: o.profil, chemin: o.chemin, largeur: LARGEUR, hauteur: HAUTEUR });
    const s = new SessionNavigation(lancement, { domaines: o.domaines });
    await s.cdp.envoyer('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    await s.cdp.envoyer('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    // L'onglet que Chrome ouvre au démarrage sert d'onglet de travail (un second, vide, resterait derrière : fermer une fenêtre
    // ouverte par le site ramènerait sur lui).
    for (let i = 0; i < 40 && !s.onglets.length; i++) await attendre(50);
    if (!s.onglets.length) await s.nouvelOnglet();
    return s;
  }

  /** @param {any} m */
  async surEvenement(m) {
    if (m.method === 'Target.attachedToTarget') {
      const info = m.params.targetInfo || {};
      const session = m.params.sessionId;
      if (info.type !== 'page') { await this.cdp.envoyer('Runtime.runIfWaitingForDebugger', {}, session).catch(() => {}); return; }
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
  }

  /** @param {string} session */
  async preparerOnglet(session) {
    await Promise.all([
      this.cdp.envoyer('Page.enable', {}, session),
      this.cdp.envoyer('Emulation.setDeviceMetricsOverride', { width: LARGEUR, height: HAUTEUR, deviceScaleFactor: 1, mobile: false }, session),
      this.cdp.envoyer('Fetch.enable', { patterns: [
        { urlPattern: '*', resourceType: 'Document', requestStage: 'Request' },
        { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' },
        { urlPattern: '*', resourceType: 'XHR', requestStage: 'Response' },
        { urlPattern: '*', resourceType: 'Fetch', requestStage: 'Response' }
      ] }, session),
      this.cdp.envoyer('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Paris' }, session).catch(() => {})
    ]).catch(() => {});
  }

  /** @param {string} session @param {any} p */
  async surRequete(session, p) {
    const adresse = String((p.request && p.request.url) || '');
    try {
      if (p.responseStatusCode === undefined && p.responseErrorReason === undefined) {
        // Étape « requête » d'un document : hors liste, refusé.
        if (!adresseAutorisee(adresse, this.domaines)) {
          this.bloques.push(adresse.slice(0, 200));
          await this.cdp.envoyer('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }, session);
          return;
        }
        if (p.request && p.request.method === 'POST') this.envois.push({ methode: 'POST', corps: String(p.request.postData || '').slice(0, 20000), adresse: adresse.slice(0, 300) });
        if (this.envois.length > 30) this.envois.shift();
        await this.cdp.envoyer('Fetch.continueRequest', { requestId: p.requestId }, session);
        return;
      }
      const entetes = p.responseHeaders || [];
      const type = String((entetes.find((h) => /^content-type$/i.test(h.name)) || {}).value || '');
      const enPieceJointe = entetes.some((h) => /^content-disposition$/i.test(h.name) && /attachment/i.test(h.value));
      const ok = Number(p.responseStatusCode) >= 200 && Number(p.responseStatusCode) < 300;
      if (ok && (TYPES_DOCUMENTS.test(type) || (enPieceJointe && /octet-stream/i.test(type))) && (p.resourceType === 'Document' || TYPES_DOCUMENTS.test(type) && /pdf/i.test(type))) {
        const corps = await this.cdp.envoyer('Fetch.getResponseBody', { requestId: p.requestId }, session).catch(() => null);
        if (corps) {
          const octets = Buffer.from(corps.body || '', corps.base64Encoded ? 'base64' : 'utf8');
          if (octets.length) this.garderDocument(nomFichierReponse(entetes, adresse), type.split(';')[0].trim() || 'application/octet-stream', octets, adresse);
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
    const r = await this.cdp.envoyer('Page.navigate', { url: adresse }, o.session);
    if (r.errorText && !/ERR_ABORTED/.test(r.errorText)) throw new Error(`page non chargée (${r.errorText})`);
    await this.attendreStable();
  }

  async revenir() {
    await this.evaluer('history.back()').catch(() => {});
    await this.attendreStable();
  }

  /** La page lue : titre, adresse, texte, éléments numérotés. */
  async instantane() {
    let dernier;
    for (let i = 0; i < 3; i++) {
      try { return await this.evaluer(SCRIPT_INSTANTANE); } catch (e) { dernier = e; await attendre(500); }
    }
    throw dernier;
  }

  /** Centre d'un élément numéroté (amené dans la vue). @param {number} ref */
  async elementRef(ref) {
    const n = Math.max(0, Math.floor(Number(ref) || 0));
    const r = await this.evaluer(`(() => { const e = document.querySelector('[data-claire-ref="${n}"]'); if (!e) return null;
      e.scrollIntoView({ block: 'center', inline: 'center' }); const r = e.getBoundingClientRect();
      const t = (e.getAttribute('type') || '').toLowerCase();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), balise: e.tagName.toLowerCase(), type: t,
        libelle: String(e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || e.value || e.getAttribute('alt') || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
        lien: e.tagName === 'A' ? String(e.href || '') : '' }; })()`);
    if (!r) throw Object.assign(new Error(`élément ${n} introuvable (relire la page)`), { refus: true });
    return r;
  }

  /** @param {number} x @param {number} y */
  async cliquerPosition(x, y) {
    const s = this.ongletActif().session;
    const px = Math.max(0, Math.min(LARGEUR - 1, Math.round(Number(x) || 0)));
    const py = Math.max(0, Math.min(HAUTEUR - 1, Math.round(Number(y) || 0)));
    await this.cdp.envoyer('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py }, s);
    await this.cdp.envoyer('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1 }, s);
    await this.cdp.envoyer('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1 }, s);
    const avant = this.onglets.length;
    await this.attendreStable(12000);
    return { nouvelOnglet: this.onglets.length > avant };
  }

  /** @param {number} ref */
  async cliquer(ref) {
    const e = await this.elementRef(ref);
    return this.cliquerPosition(e.x, e.y);
  }

  /** Écrit un texte dans un champ (le contenu précédent est remplacé). @param {number} ref @param {string} texte */
  async saisir(ref, texte) {
    const n = Math.max(0, Math.floor(Number(ref) || 0));
    const ok = await this.evaluer(`(() => { const e = document.querySelector('[data-claire-ref="${n}"]'); if (!e) return false;
      e.scrollIntoView({ block: 'center' }); e.focus();
      if (typeof e.select === 'function') e.select(); else if (e.isContentEditable) document.execCommand('selectAll');
      return true; })()`);
    if (!ok) throw Object.assign(new Error(`champ ${n} introuvable (relire la page)`), { refus: true });
    const s = this.ongletActif().session;
    const t = String(texte || '');
    if (t) await this.cdp.envoyer('Input.insertText', { text: t }, s);
    else await this.touche('Retour');
    await attendre(400);
  }

  /** Écrit un secret (mot de passe, identifiant) : la valeur n'est jamais rendue ni journalisée. @param {number} ref @param {string} secret */
  async saisirSecret(ref, secret) {
    await this.saisir(ref, secret);
  }

  /** Choisit une option d'une liste (par son texte, ou sa valeur). @param {number} ref @param {string} option */
  async choisir(ref, option) {
    const n = Math.max(0, Math.floor(Number(ref) || 0));
    const voulu = JSON.stringify(String(option || ''));
    const r = await this.evaluer(`(() => { const e = document.querySelector('[data-claire-ref="${n}"]'); if (!e || e.tagName !== 'SELECT') return 'pas une liste';
      const norm = (t) => String(t || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const v = norm(${voulu});
      const opts = [...e.options];
      const o = opts.find((x) => norm(x.text) === v) || opts.find((x) => norm(x.value) === v) || opts.find((x) => norm(x.text).includes(v));
      if (!o) return 'option introuvable';
      e.value = o.value; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
      return ''; })()`);
    if (r) throw Object.assign(new Error(r), { refus: true });
    await this.attendreStable(8000);
  }

  /** @param {string} nom une clé de TOUCHES */
  async touche(nom) {
    const t = /** @type {any} */ (TOUCHES)[nom];
    if (!t) throw Object.assign(new Error('touche inconnue'), { refus: true });
    const s = this.ongletActif().session;
    await this.cdp.envoyer('Input.dispatchKeyEvent', { type: t.text ? 'keyDown' : 'rawKeyDown', ...t }, s);
    await this.cdp.envoyer('Input.dispatchKeyEvent', { type: 'keyUp', key: t.key, code: t.code, windowsVirtualKeyCode: t.windowsVirtualKeyCode }, s);
    await this.attendreStable(8000);
  }

  /** Fait défiler la page (ou zoome une carte sous le pointeur). @param {'bas'|'haut'} sens @param {number} [x] @param {number} [y] */
  async defiler(sens, x, y) {
    const s = this.ongletActif().session;
    const px = Number.isFinite(Number(x)) ? Number(x) : LARGEUR / 2;
    const py = Number.isFinite(Number(y)) ? Number(y) : HAUTEUR / 2;
    await this.cdp.envoyer('Input.dispatchMouseEvent', { type: 'mouseWheel', x: px, y: py, deltaX: 0, deltaY: sens === 'haut' ? -600 : 600 }, s);
    await attendre(900);
  }

  /** Capture de l'écran de l'onglet actif (JPEG, base64). */
  async capture() {
    const r = await this.cdp.envoyer('Page.captureScreenshot', { format: 'jpeg', quality: 72 }, this.ongletActif().session);
    return String(r.data || '');
  }

  /** Capture PNG nette (pour un document gardé). */
  async capturePng() {
    const r = await this.cdp.envoyer('Page.captureScreenshot', { format: 'png' }, this.ongletActif().session);
    return Buffer.from(String(r.data || ''), 'base64');
  }

  /** Un PDF A4 portrait fabriqué à partir d'un HTML écrit par CLAIRE (onglet à part, refermé ensuite). @param {string} html */
  async pdfDepuisHtml(html) {
    const o = await this.nouvelOnglet();
    try {
      const { frameTree } = await this.cdp.envoyer('Page.getFrameTree', {}, o.session);
      await this.cdp.envoyer('Page.setDocumentContent', { frameId: frameTree.frame.id, html }, o.session);
      await attendre(600);
      const r = await this.cdp.envoyer('Page.printToPDF', { paperWidth: 8.27, paperHeight: 11.69, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
        printBackground: true, preferCSSPageSize: true }, o.session, 60000);
      return Buffer.from(String(r.data || ''), 'base64');
    } finally {
      await this.cdp.envoyer('Target.closeTarget', { targetId: o.cible }).catch(() => {});
      this.onglets = this.onglets.filter((x) => x !== o);
    }
  }

  async fermer() {
    this.arreterEcoute();
    await this.lancement.arreter();
  }
}

module.exports = { SessionNavigation, adresseAutorisee, nomFichierReponse, TOUCHES, LARGEUR, HAUTEUR };
