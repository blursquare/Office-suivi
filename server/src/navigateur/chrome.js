// @ts-check
'use strict';
// Le navigateur de CLAIRE (étude 14/10 : « Claire doit pouvoir naviguer sur le site, remplir les champs et apporter des réponses »,
// « devenir un vrai agent IA autonome qui travaille comme un clerc de notaire »).
//
// Le SERVEUR lance le Chrome (ou l'Edge) déjà installé sur sa machine, SANS FENÊTRE (--headless), avec un profil à lui
// (data/navigateur, à côté de la base : la session Géofoncier y reste ouverte d'une consultation à l'autre), et le pilote par le
// protocole DevTools de Chrome (CDP) sur des tuyaux — aucun port ouvert, aucune bibliothèque à embarquer dans le .exe.
// Les messages CDP sont des objets JSON séparés par un octet nul : écrits sur le descripteur 3, lus sur le descripteur 4.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DELAI_COMMANDE_MS = 45000;

/** Pure : les emplacements habituels de Chrome puis d'Edge sur la machine. @param {Record<string, string | undefined>} env @param {string} plateforme */
function cheminsNavigateur(env, plateforme) {
  if (plateforme === 'win32') {
    const pf = env.ProgramFiles || 'C:\\Program Files';
    const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = env.LOCALAPPDATA || '';
    return [
      `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
      ...(local ? [`${local}\\Google\\Chrome\\Application\\chrome.exe`] : []),
      `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`
    ];
  }
  if (plateforme === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/opt/pw-browsers/chromium'];
}

/** Le premier navigateur présent (chemin réglé d'abord). @param {{ chemin?: string, env?: any, plateforme?: string }} [o] */
async function trouverNavigateur(o = {}) {
  const env = o.env || process.env;
  const candidats = [o.chemin, env.CLAIRE_NAVIGATEUR, ...cheminsNavigateur(env, o.plateforme || process.platform)].filter(Boolean);
  for (const c of candidats) {
    try {
      const st = await fs.promises.stat(c);
      if (st.isFile()) return c;
      // Linux de développement : /opt/pw-browsers/chromium est un dossier qui contient le binaire.
      if (st.isDirectory()) {
        const dedans = path.join(c, 'chrome-linux', 'chrome');
        if (await fs.promises.access(dedans).then(() => true, () => false)) return dedans;
        const sous = (await fs.promises.readdir(c).catch(() => [])).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse();
        for (const s of sous) {
          const b = path.join(c, s, 'chrome-linux', 'chrome');
          if (await fs.promises.access(b).then(() => true, () => false)) return b;
        }
      }
    } catch (_) { /* absent */ }
  }
  return '';
}

/** Pure : les arguments de lancement. @param {string} profil @param {{ largeur: number, hauteur: number }} taille */
function argumentsLancement(profil, taille) {
  return [
    '--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-background-networking',
    '--disable-component-update', '--disable-default-apps', '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--mute-audio', '--hide-scrollbars', '--lang=fr-FR', `--window-size=${taille.largeur},${taille.hauteur}`,
    // Cartes en WebGL (Géofoncier) : dessinées par le processeur, sans carte graphique.
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    'about:blank'
  ];
}

/**
 * Une connexion CDP sur les tuyaux d'un Chrome lancé. Commandes par `envoyer(methode, params, session)`, événements par `sur(nom, fn)`.
 */
class ConnexionCdp {
  /** @param {import('node:stream').Writable} ecriture @param {import('node:stream').Readable} lecture */
  constructor(ecriture, lecture) {
    this.ecriture = ecriture;
    this.suivant = 1;
    /** @type {Map<number, { ok: (v: any) => void, ko: (e: any) => void, minuterie: NodeJS.Timeout, methode: string }>} */
    this.attentes = new Map();
    /** @type {Array<(m: any) => void>} */
    this.ecouteurs = [];
    this.ferme = false;
    let reste = Buffer.alloc(0);
    lecture.on('data', (morceau) => {
      reste = Buffer.concat([reste, morceau]);
      let i;
      while ((i = reste.indexOf(0)) >= 0) {
        const brut = reste.subarray(0, i).toString('utf8');
        reste = reste.subarray(i + 1);
        let m;
        try { m = JSON.parse(brut); } catch (_) { continue; }
        this.recevoir(m);
      }
    });
    lecture.on('close', () => this.fermer('navigateur arrêté'));
    lecture.on('error', () => this.fermer('navigateur arrêté'));
  }

  /** @param {any} m */
  recevoir(m) {
    if (m.id && this.attentes.has(m.id)) {
      const a = /** @type {any} */ (this.attentes.get(m.id));
      this.attentes.delete(m.id);
      clearTimeout(a.minuterie);
      if (m.error) a.ko(Object.assign(new Error(`${a.methode} : ${m.error.message || 'erreur'}`), { cdp: m.error }));
      else a.ok(m.result || {});
      return;
    }
    if (m.method) for (const f of this.ecouteurs.slice()) { try { f(m); } catch (_) { /* un écouteur ne casse pas les autres */ } }
  }

  /** @param {string} methode @param {any} [params] @param {string} [session] @param {number} [delai] @returns {Promise<any>} */
  envoyer(methode, params, session, delai) {
    if (this.ferme) return Promise.reject(new Error('navigateur arrêté'));
    const id = this.suivant++;
    const message = JSON.stringify({ id, method: methode, params: params || {}, ...(session ? { sessionId: session } : {}) });
    return new Promise((ok, ko) => {
      const minuterie = setTimeout(() => { this.attentes.delete(id); ko(new Error(`${methode} : délai dépassé`)); }, delai || DELAI_COMMANDE_MS);
      this.attentes.set(id, { ok, ko, minuterie, methode });
      this.ecriture.write(message + '\0');
    });
  }

  /** Écoute tous les événements (filtrer sur `m.method` et `m.sessionId`). Rend la fonction qui arrête l'écoute. @param {(m: any) => void} f */
  ecouter(f) {
    this.ecouteurs.push(f);
    return () => { this.ecouteurs = this.ecouteurs.filter((x) => x !== f); };
  }

  /** @param {string} raison */
  fermer(raison) {
    if (this.ferme) return;
    this.ferme = true;
    for (const a of this.attentes.values()) { clearTimeout(a.minuterie); a.ko(new Error(raison)); }
    this.attentes.clear();
  }
}

/**
 * Lance le navigateur. Rend { cdp, processus, chemin, arreter() }.
 * @param {{ chemin?: string, profil: string, largeur?: number, hauteur?: number, spawnFn?: typeof spawn }} o
 */
async function lancerNavigateur(o) {
  const chemin = await trouverNavigateur({ chemin: o.chemin });
  if (!chemin) throw Object.assign(new Error('Ni Chrome ni Edge trouvé sur le serveur.'), { introuvable: true });
  await fs.promises.mkdir(o.profil, { recursive: true });
  // Un Chrome précédent arrêté brutalement laisse un verrou sur le profil : le nouveau refuserait de démarrer.
  for (const verrou of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) await fs.promises.rm(path.join(o.profil, verrou), { force: true }).catch(() => {});
  const lancer = o.spawnFn || spawn;
  const processus = lancer(chemin, argumentsLancement(o.profil, { largeur: o.largeur || 1280, hauteur: o.hauteur || 800 }),
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], windowsHide: true });
  const ecriture = /** @type {any} */ (processus.stdio[3]);
  const lecture = /** @type {any} */ (processus.stdio[4]);
  const cdp = new ConnexionCdp(ecriture, lecture);
  processus.on('exit', () => cdp.fermer('navigateur arrêté'));
  processus.on('error', () => cdp.fermer('navigateur arrêté'));
  // Le navigateur répond dès qu'il est prêt.
  const version = await cdp.envoyer('Browser.getVersion', {}, undefined, 30000).catch((e) => { try { processus.kill(); } catch (_) { /* déjà arrêté */ } throw e; });
  return {
    cdp, processus, chemin, version: String(version.product || ''),
    async arreter() {
      try { await cdp.envoyer('Browser.close', {}, undefined, 5000); } catch (_) { /* déjà fermé */ }
      cdp.fermer('navigateur arrêté');
      try { processus.kill(); } catch (_) { /* déjà arrêté */ }
    }
  };
}

module.exports = { cheminsNavigateur, trouverNavigateur, argumentsLancement, lancerNavigateur, ConnexionCdp };
