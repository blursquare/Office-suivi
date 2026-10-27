// @ts-check
'use strict';
// L'ORDINATEUR VIRTUEL DE CLAIRE (étude 26/10 : « fabrique-lui son ordinateur virtuel, mais retire l'accès aux réglages et aux boutons
// d'envoi ; elle doit agir comme un collaborateur qui doit me faire valider toute demande »).
//
// C'est une fenêtre CLAIRE ordinaire, ouverte par le serveur dans un Chrome/Edge sans écran (le même que celui du navigateur de CLAIRE), qui
// travaille comme un poste : mêmes écrans, mêmes outils, même agent. Trois garde-fous TENUS PAR LE CODE DU SERVEUR (la page ne peut pas les
// contourner) :
// - ce poste porte un cookie secret (`claire-poste`, tiré au hasard à chaque lancement, jamais envoyé ailleurs que sur ce serveur) : toute requête
//   qui le porte passe par `routeInterditePosteClaire` — réglages, envoi d'email, Exchange, Yousign, Teams, mise à jour, sauvegarde… refusés (403) ;
// - toute écriture qu'elle voudrait faire passe par une demande de validation à Bastien (proposition de type `validation`, client/128) ;
// - démarré à la demande, arrêté après 10 minutes sans travail : aucun processus permanent.

const crypto = require('node:crypto');
const path = require('node:path');
const { lancerNavigateur } = require('./navigateur/chrome');

const NOM_COOKIE_POSTE_CLAIRE = 'claire-poste';
const INACTIVITE_MS = 10 * 60 * 1000;
const DELAI_TRAVAIL_MS = 12 * 60 * 1000;
const DELAI_DEMARRAGE_MS = 90 * 1000;

// Écritures (et lectures de réglages) que le poste de CLAIRE n'a pas le droit de faire : chemin sans « /api ».
const INTERDITS_ECRITURE = [
  /^\/reglages(\/|$)/, /^\/emails\/envoyer$/, /^\/emails-dossiers\/reglages$/, /^\/exchange(\/|$)/, /^\/yousign(\/|$)/, /^\/signature-rib(\/|$)/,
  /^\/notifications(\/|$)/, /^\/mise-a-jour(\/|$)/, /^\/sauvegarde(\/|$)/, /^\/relais-word(\/|$)/, /^\/comptes-collaborateurs(\/|$)/,
  /^\/photos-collaborateurs(\/|$)/, /^\/carnet-claire(\/|$)/, /^\/assistant\/reglages$/, /^\/memoire\/reglages$/, /^\/nas-libre\/reglages$/,
  /^\/openlegi\/reglages$/, /^\/appels\/reglages$/, /^\/rangement-outlook\/reglages$/, /^\/rapport-technique\/envoyer$/, /^\/routines\/reglages$/,
  /^\/routines\/[^/]+\/lancer$/, /^\/propositions\/[^/]+\/decision$/, /^\/canaux(\/|$)/, /^\/poste-claire\/travail$/, /^\/sondages(\/|$)/, /^\/emails-prepares(\/|$)/
];
// Lectures refusées elles aussi : tout ce qui est « réglages », la liste des comptes et les secrets.
const INTERDITS_LECTURE = [/^\/reglages(\/|$)/, /^\/comptes-collaborateurs(\/|$)/, /^\/mise-a-jour(\/|$)/, /^\/sauvegarde(\/|$)/, /^\/yousign(\/|$)/, /^\/relais-word(\/|$)/];

/** Pure : cette requête du poste de CLAIRE est-elle refusée ? `chemin` commence par « /api » ou non. @param {string} methode @param {string} chemin */
function routeInterditePosteClaire(methode, chemin) {
  const c = String(chemin || '').split('?')[0].replace(/^\/api(?=\/)/, '');
  const m = String(methode || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return INTERDITS_LECTURE.some((re) => re.test(c));
  // Elle peut demander une validation, lire ses propositions, et appeler l'agent : le reste des écritures n'est refusé que dans la liste.
  return INTERDITS_ECRITURE.some((re) => re.test(c));
}

/** Pure : la valeur du cookie `claire-poste` d'un en-tête Cookie. @param {string} cookie */
function jetonDuCookie(cookie) {
  for (const morceau of String(cookie || '').split(';')) {
    const i = morceau.indexOf('=');
    if (i > 0 && morceau.slice(0, i).trim() === NOM_COOKIE_POSTE_CLAIRE) return morceau.slice(i + 1).trim();
  }
  return '';
}

/**
 * @param {{ adresse: string, profil: string, chemin?: string, lancer?: typeof lancerNavigateur, maintenant?: () => number, journal?: (m: string) => void }} o
 */
function creerPosteClaire(o) {
  const lancer = o.lancer || lancerNavigateur;
  const maintenant = o.maintenant || Date.now;
  const journal = o.journal || (() => {});
  const jeton = crypto.randomBytes(24).toString('base64url');
  /** @type {any} */ let lancement = null;
  /** @type {string} */ let session = '';
  /** @type {Promise<void> | null} */ let demarrage = null;
  /** @type {any} */ let minuterie = null;
  let dernierTravail = 0;
  let enTravail = false;
  let derniereErreur = '';

  /** @param {string} jetonRecu */
  function estPosteClaire(jetonRecu) {
    const a = Buffer.from(String(jetonRecu || ''));
    const b = Buffer.from(jeton);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async function arreter() {
    clearTimeout(minuterie);
    const l = lancement;
    lancement = null; session = ''; demarrage = null;
    if (l) await l.arreter().catch(() => {});
  }

  function armerInactivite() {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => { if (!enTravail && maintenant() - dernierTravail >= INACTIVITE_MS) arreter(); else armerInactivite(); }, INACTIVITE_MS);
    if (minuterie && minuterie.unref) minuterie.unref();
  }

  async function demarrerReel() {
    lancement = await lancer({ profil: o.profil, chemin: o.chemin, largeur: 1280, hauteur: 800 });
    const cdp = lancement.cdp;
    cdp.ecouter((m) => { if (m.method === 'Inspector.targetCrashed') journal('page du poste de CLAIRE plantée'); });
    const { targetId } = await cdp.envoyer('Target.createTarget', { url: 'about:blank' });
    const att = await cdp.envoyer('Target.attachToTarget', { targetId, flatten: true });
    session = att.sessionId;
    await cdp.envoyer('Page.enable', {}, session);
    await cdp.envoyer('Network.enable', {}, session);
    await cdp.envoyer('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Paris' }, session).catch(() => {});
    await cdp.envoyer('Network.setCookie', { name: NOM_COOKIE_POSTE_CLAIRE, value: jeton, url: o.adresse, httpOnly: true, sameSite: 'Strict' }, session);
    await cdp.envoyer('Page.navigate', { url: `${o.adresse}/?poste-claire=1` }, session);
    const fin = maintenant() + DELAI_DEMARRAGE_MS;
    for (;;) {
      const r = await cdp.envoyer('Runtime.evaluate', { expression: "typeof travaillerPosteClaire === 'function' && document.readyState === 'complete'", returnByValue: true }, session).catch(() => null);
      if (r && r.result && r.result.value === true) break;
      if (maintenant() > fin) throw new Error('la fenêtre de CLAIRE ne s’est pas ouverte à temps');
      await new Promise((ok) => setTimeout(ok, 500));
    }
    journal('poste de CLAIRE ouvert');
  }

  async function assurerOuvert() {
    if (lancement && session) return;
    if (!demarrage) demarrage = demarrerReel().catch(async (e) => { derniereErreur = String(e && e.message || e).slice(0, 200); await arreter(); throw e; });
    await demarrage;
  }

  /** Lui confie un travail : la consigne est passée à l'agent de la fenêtre ; rend le compte rendu. @param {string} consigne */
  async function travailler(consigne) {
    if (enTravail) throw Object.assign(new Error('CLAIRE est déjà au travail.'), { occupe: true });
    enTravail = true;
    try {
      await assurerOuvert();
      dernierTravail = maintenant();
      const cdp = lancement.cdp;
      const r = await cdp.envoyer('Runtime.evaluate', {
        expression: `travaillerPosteClaire(${JSON.stringify(String(consigne || '').slice(0, 4000))})`, awaitPromise: true, returnByValue: true
      }, session, DELAI_TRAVAIL_MS);
      if (r.exceptionDetails) throw new Error(String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || 'erreur').slice(0, 200));
      derniereErreur = '';
      return r.result ? r.result.value : null;
    } catch (e) {
      derniereErreur = String(e && e.message || e).slice(0, 200);
      throw e;
    } finally {
      enTravail = false;
      dernierTravail = maintenant();
      armerInactivite();
    }
  }

  return { estPosteClaire, travailler, arreter, etat: () => ({ ouvert: !!lancement, enTravail, derniereErreur }), jeton: () => jeton, chemin: path.basename(o.profil) };
}

module.exports = { creerPosteClaire, routeInterditePosteClaire, jetonDuCookie, NOM_COOKIE_POSTE_CLAIRE };
