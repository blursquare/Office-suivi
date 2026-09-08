'use strict';

// Charge script.js dans un bac à sable minimal (sans navigateur réel), pour tester les fonctions
// pures d'extraction (dates, engagements, conditions...) telles que documentées dans CLAUDE.md
// ("petits scripts Node.js ad hoc qui chargent script.js, simulent un document/window minimal").
//
// script.js n'est pas un module : c'est un script classique chargé par <script src="script.js">
// dans index.html (contrainte "aucun serveur" — voir CLAUDE.md, les ES modules ne fonctionnent
// pas en file://). Ses `function` déclarées au niveau racine deviennent donc des propriétés du
// contexte global une fois exécuté dans un vm.Context, exactement comme elles deviennent des
// propriétés de `window` dans un vrai navigateur.
//
// Le fichier exécute aussi, à son chargement, quelques appels DOM/async (thème, chargement du
// registre, minuteries de revérification) : le faux `document`/`window` ci-dessous doit donc
// rester silencieusement inoffensif face à n'importe quel accès DOM plausible, plutôt que de
// chercher à ne stubber que ce qui est strictement nécessaire aujourd'hui.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function creerElementFictif() {
  const el = {
    style: {},
    dataset: {},
    children: [],
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) { return child; },
    removeChild(child) { return child; },
    setAttribute() {},
    getAttribute() { return null; },
    querySelector() { return creerElementFictif(); },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {},
    click() {},
    remove() {}
  };
  el.value = '';
  el.checked = false;
  el.disabled = false;
  el.innerHTML = '';
  // escapeHtml() dans script.js échappe le HTML en écrivant dans .textContent puis en relisant
  // .innerHTML (comportement natif du navigateur) : on reproduit ce mécanisme, sans quoi
  // escapeHtml() renverrait toujours une chaîne vide face à ce faux document.
  let texte = '';
  Object.defineProperty(el, 'textContent', {
    get() { return texte; },
    set(valeur) {
      texte = String(valeur);
      el.innerHTML = texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  });
  return el;
}

function creerLocalStorageFictif() {
  const magasin = new Map();
  return {
    getItem: (cle) => (magasin.has(cle) ? magasin.get(cle) : null),
    setItem: (cle, valeur) => { magasin.set(cle, String(valeur)); },
    removeItem: (cle) => { magasin.delete(cle); },
    clear: () => magasin.clear()
  };
}

// Charge script.js dans un nouveau contexte vm et renvoie ce contexte (les fonctions de
// script.js y sont accessibles comme sandbox.nomDeFonction, comme window.nomDeFonction en vrai
// navigateur). Un contexte neuf par appel : les tests ne doivent pas partager d'état mutable
// (ex. `dossiers`) d'un test à l'autre.
function chargerApplication() {
  const document = {
    documentElement: creerElementFictif(),
    body: creerElementFictif(),
    getElementById: () => creerElementFictif(),
    createElement: () => creerElementFictif(),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => creerElementFictif(),
    querySelectorAll: () => []
  };

  const sandbox = {
    document,
    localStorage: creerLocalStorageFictif(),
    navigator: {},
    crypto: globalThis.crypto,
    console,
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: (fn) => { void fn; return 0; },
    clearTimeout: () => {},
    URL: globalThis.URL,
    Blob: class { constructor(parts, opts) { this.parts = parts; this.opts = opts; } },
    Promise,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: undefined
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const contexte = vm.createContext(sandbox);

  // Une erreur asynchrone dans la séquence d'amorçage (thème, registre partagé...) ne doit pas
  // faire planter le test process : ces chemins sont hors du périmètre testé ici (fonctions pures
  // d'extraction), le harnais DOM ci-dessus n'a pas vocation à les reproduire fidèlement.
  const onRejectionIgnoree = () => {};
  process.on('unhandledRejection', onRejectionIgnoree);
  setTimeout(() => process.removeListener('unhandledRejection', onRejectionIgnoree), 0);

  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'script.js'), 'utf8');
  vm.runInContext(source, contexte, { filename: 'script.js' });

  return contexte;
}

module.exports = { chargerApplication };
