// Service worker MV3 : source de vérité de l'exécution du remplissage.
// État d'une exécution ("run") conservé dans chrome.storage.session (survit à l'endormissement du worker).
// La fiche vient du serveur CLAIRE du bureau, lue par le panneau (panel.js, GET /api/gnau/fiche/:id) : plus de liaison WebSocket.

const ACTIVE = ["running", "paused"];
const linked = false;

try {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} catch (_) {}

// ---------- État ----------

async function getRun() {
  const { run } = await chrome.storage.session.get("run");
  return run || null;
}

async function setRun(run) {
  await chrome.storage.session.set({ run });
  chrome.runtime.sendMessage({ type: "state", run, linked }).catch(() => {});
}

// Sérialise les modifications pour éviter les courses entre messages.
let chain = Promise.resolve();
function mutate(fn) {
  const p = chain.then(async () => {
    const run = await getRun();
    if (!run) return null;
    const next = fn(run) || run;
    await setRun(next);
    return next;
  });
  chain = p.catch(() => {});
  return p;
}

function addLog(run, msg) {
  run.log = (run.log || []).concat({ t: Date.now(), msg }).slice(-200);
}

// ---------- Démarrage / contrôle ----------

function validateScenario(sc) {
  if (!sc || !Array.isArray(sc.pages) || sc.pages.length === 0) throw new Error("Scénario invalide : aucune page.");
  sc.pages.forEach((p, i) => {
    if (!p.waitFor) throw new Error(`Scénario invalide : étape ${i + 1} sans "waitFor".`);
  });
}

async function ensureContent(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "ping" });
  } catch (_) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["lib/fiche.js", "content/content.js"],
    });
  }
}

// Brouillon du guichet par dossier et démarche (adresse #/saisie/<n°> seulement, 30 jours) : relancée après une reconnexion, CLAIRE rouvre le
// MÊME brouillon au lieu d'en créer un second.
const DUREE_BROUILLON_MS = 30 * 24 * 3600 * 1000;
const cleBrouillon = (sc, fiche) => (sc && sc.id && fiche && fiche.dossier && fiche.dossier.id ? `${fiche.dossier.id}|${sc.id}` : "");
async function retenirBrouillon(r) {
  const cle = r && r.urlSaisie ? cleBrouillon(r.scenario, r.fiche) : "";
  if (!cle) return;
  const { brouillons = {} } = await chrome.storage.local.get(["brouillons"]);
  for (const [k, v] of Object.entries(brouillons)) if (!v || Date.now() - v.le > DUREE_BROUILLON_MS) delete brouillons[k];
  brouillons[cle] = { url: r.urlSaisie, le: Date.now() };
  await chrome.storage.local.set({ brouillons });
}
async function brouillonConnu(sc, fiche) {
  const cle = sc && sc.entree ? cleBrouillon(sc, fiche) : "";
  if (!cle) return "";
  const { brouillons = {} } = await chrome.storage.local.get(["brouillons"]);
  const b = brouillons[cle];
  return b && Date.now() - b.le <= DUREE_BROUILLON_MS ? String(b.url || "") : "";
}

async function startRun({ scenario, fiche, speed, continuer }) {
  const current = await getRun();
  if (current && ACTIVE.includes(current.status)) throw new Error("Une exécution est déjà en cours.");
  // « Remplir la page affichée » sur la page suivante du guichet : les champs déjà remplis sur une page précédente restent cochés.
  const garder = continuer && current && current.scenario && scenario && current.scenario.id === scenario.id
    && current.fiche && fiche && current.fiche.dossier && fiche.dossier && current.fiche.dossier.id === fiche.dossier.id
    ? Object.fromEntries(Object.entries(current.fields || {}).filter(([, v]) => v && v.state === "done"))
    : {};
  validateScenario(scenario);
  await detacher(); // une saisie précédente ne garde jamais le débogueur
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.id) throw new Error("Aucun onglet actif.");
  // Jamais dans la fenêtre de CLAIRE elle-même (seule autre machine autorisée) : le guichet doit être l'onglet affiché.
  const { serveur } = await chrome.storage.local.get(["serveur"]);
  if (serveur && tab.url && tab.url.startsWith(serveur)) throw new Error("Affichez d’abord la page du guichet unique, puis cliquez « Remplir la page affichée ».");

  const run = {
    id: crypto.randomUUID(),
    status: "running",
    scenario,
    fiche: fiche || {},
    speed: speed || "normal",
    tabId: tab.id,
    pageIndex: 0,
    fields: garder,
    log: [],
    ...(await (async () => { const u = await brouillonConnu(scenario, fiche); return u ? { urlSaisie: u, formulaireOuvert: true } : {}; })()),
    startedAt: Date.now(),
  };
  addLog(run, "Démarrage");
  await setRun(run);
  try {
    await ensureContent(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "resume" });
  } catch (e) {
    await mutate((r) => {
      r.status = "error";
      r.message = "Impossible d'agir sur cet onglet (site non autorisé par l'extension ?).";
    });
    throw new Error("Impossible d'agir sur cet onglet. Le site doit figurer dans les autorisations de l'extension.");
  }
}

async function control(action) {
  const map = { pause: "paused", resume: "running", stop: "stopped" };
  const status = map[action];
  if (!status) throw new Error("Action inconnue.");
  const run = await mutate((r) => {
    if (!ACTIVE.includes(r.status)) return r;
    r.status = status;
    addLog(r, `Contrôle : ${action}`);
    return r;
  });
  if (run && run.tabId) {
    chrome.tabs.sendMessage(run.tabId, { type: "control", status }).catch(() => {});
  }
}

// ---------- Messages ----------

// ---------- Vrais clics et vraies frappes (étude 17/10 : « utilise la souris comme un humain : clique, attends, laisse la vraie liste se
// dérouler ») : par le protocole de débogage de Chrome, sur l'onglet du guichet seulement. Les événements sont de vrais événements du
// navigateur (la liste native s'ouvre, les propositions d'adresse réagissent au clavier). Chrome affiche son bandeau « a commencé à
// déboguer » tant que CLAIRE est attachée ; détachée à la fin de la saisie, à l'arrêt, ou si l'onglet se ferme.
const attaches = new Set();
async function attacher(tabId) {
  if (attaches.has(tabId)) return;
  try { await chrome.debugger.attach({ tabId }, "1.3"); } catch (e) {
    // Service worker redémarré pendant la saisie : l'onglet est déjà attaché par CLAIRE.
    if (!/already attached/i.test(String(e && e.message || e))) throw e;
  }
  attaches.add(tabId);
}
async function detacher(tabId) {
  if (tabId === undefined) {
    // Tous les onglets que CLAIRE débogue, y compris ceux d'avant un redémarrage du service worker.
    const cibles = await chrome.debugger.getTargets().catch(() => []);
    const ids = new Set([...attaches, ...cibles.filter((c) => c.attached && c.tabId !== undefined && c.extensionId === undefined).map((c) => c.tabId)]);
    for (const t of ids) await detacher(t);
    return;
  }
  attaches.delete(tabId);
  try { await chrome.debugger.detach({ tabId }); } catch (_) { /* pas attaché par CLAIRE, ou déjà détaché */ }
}
// Les vrais gestes ne valent que pour l'onglet de la saisie EN COURS (jamais après l'arrêt, jamais un autre onglet).
async function gesteAutorise(sender) {
  const r = await getRun();
  return !!(sender.tab && r && ACTIVE.includes(r.status) && r.tabId === sender.tab.id);
}
chrome.debugger.onDetach.addListener((source) => { if (source && source.tabId !== undefined) attaches.delete(source.tabId); });
chrome.tabs.onRemoved.addListener((tabId) => { attaches.delete(tabId); });
const cdp = (tabId, methode, params) => chrome.debugger.sendCommand({ tabId }, methode, params || {});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const TOUCHES = { Enter: [13, "Enter", "\r"], Escape: [27, "Escape", ""], Tab: [9, "Tab", ""], ArrowDown: [40, "ArrowDown", ""], Backspace: [8, "Backspace", ""] };

async function handle(msg, sender) {
  switch (msg.type) {
    // Depuis le panneau
    case "getState":
      return { run: await getRun(), linked };
    case "start":
      await startRun(msg);
      return { ok: true };
    case "control":
      if (msg.action === "stop") await detacher();
      await control(msg.action);
      return { ok: true };
    case "structure":
      return { structure: await releverStructure() };
    case "reset": {
      const r = await getRun();
      if (r && ACTIVE.includes(r.status)) throw new Error("Arrêtez d'abord l'exécution en cours.");
      await chrome.storage.session.remove("run");
      chrome.runtime.sendMessage({ type: "state", run: null, linked }).catch(() => {});
      return { ok: true };
    }
    // Depuis le content script
    case "content.hello": {
      const r = await getRun();
      if (r && sender.tab && r.tabId === sender.tab.id && ACTIVE.includes(r.status)) return r;
      return null;
    }
    case "content.field":
      await mutate((r) => {
        r.fields[msg.key] = { state: msg.state, detail: msg.detail || "" };
      });
      return { ok: true };
    case "content.assistant":
      // Assistant du guichet (adresse, parcelles) fait pour cette saisie : retenu, pour ne pas le rejouer après un rechargement.
      await mutate((r) => {
        r.assistants = r.assistants || {};
        r.assistants[String(msg.assistant || "")] = { etat: String(msg.etat || ""), detail: String(msg.detail || "").slice(0, 300) };
        addLog(r, `Assistant ${msg.assistant} : ${msg.detail || msg.etat}`);
      });
      return { ok: true };
    case "content.etape":
      await mutate((r) => {
        r.etapesFaites = (r.etapesFaites || []).concat(String(msg.label || "")).slice(-20);
        addLog(r, `Étape : ${msg.label}`);
      });
      return { ok: true };
    case "content.communeChoisirAngular": {
      // Commune de dépôt choisie DANS LE MODÈLE d'Angular (étude 17/10 : la liste affichait Blois, Angular retenait Candé-sur-Beuvron, la
      // ville suivante — la liste interne du guichet ne suit pas les lignes affichées). La ville est cherchée par son NOM dans `vm.listeVille`
      // (une seule, jamais devinée) et son code INSEE posé dans `vm.choixVilleInsee` ; rien d'autre n'est écrit.
      if (!sender.tab) return { ok: false };
      try {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: sender.tab.id }, world: "MAIN", args: [String(msg.commune || "")],
          func: (commune) => {
            const n = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\(.*?\)/g, " ")
              .replace(/[-'’]/g, " ").replace(/\bste\b/g, "sainte").replace(/\bst\b/g, "saint").replace(/\s+/g, " ").trim();
            const ng = window.angular;
            const sels = [...document.querySelectorAll('select[ng-model="vm.choixVilleInsee"]')].filter((x) => x.offsetWidth || x.offsetHeight);
            const sel = sels[sels.length - 1];
            if (!ng) return { ok: false, raison: "sans-angular" };
            if (!sel || !n(commune)) return { ok: false, raison: "liste introuvable" };
            const sc = ng.element(sel).scope();
            const vm = sc && sc.vm;
            if (!vm || !Array.isArray(vm.listeVille)) return { ok: false, raison: "liste des villes illisible" };
            const villes = vm.listeVille.filter((v) => v && n(v.communeNom) === n(commune));
            if (villes.length !== 1) return { ok: false, raison: villes.length ? "plusieurs villes de ce nom" : "ville absente de la liste" };
            // Comme un vrai choix dans la liste (essai de l'étude, 17/10 : le modèle posé seul laissait le brouillon à moitié dessiné — le
            // `ng-change` du guichet n'était pas joué) : la valeur passe par le contrôleur du modèle, qui joue `ng-change`, puis la liste
            // est redessinée.
            const ctrl = ng.element(sel).controller("ngModel");
            sc.$apply(() => {
              if (ctrl && ctrl.$setViewValue) ctrl.$setViewValue(villes[0].inseeCode);
              vm.choixVilleInsee = villes[0].inseeCode;
              if (ctrl && ctrl.$render) ctrl.$render();
            });
            return { ok: true, nom: String(villes[0].communeNom || "") };
          }
        });
        return res && res.result ? res.result : { ok: false };
      } catch (_) {
        return { ok: false };
      }
    }
    case "content.taper": {
      // Frappe d'une recherche d'adresse dans le monde de la page : pour chaque lettre keydown / keypress / input / keyup avec leurs codes,
      // comme un clavier (les écouteurs jQuery / Angular du guichet lisent keyCode et which). Seul le champ désigné par son identifiant.
      if (!sender.tab) return { ok: false };
      try {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: sender.tab.id }, world: "MAIN", args: [String(msg.jeton || ""), String(msg.texte || "").slice(0, 200), Number(msg.delai) || 60],
          func: async (jeton, texte, delai) => {
            const els = /^[a-z0-9]{6,24}$/.test(jeton) ? [...document.querySelectorAll(`input[data-claire-frappe="${jeton}"]`)] : [];
            const el = els.length === 1 ? els[0] : null;
            if (!el || !(el.offsetWidth || el.offsetHeight)) return { ok: false };
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
            const ev = (type, ch) => {
              const code = /^[a-z0-9]$/i.test(ch) ? ch.toUpperCase().charCodeAt(0) : ch === " " ? 32 : 0;
              const e = new KeyboardEvent(type, { key: ch, bubbles: true, cancelable: true, composed: true });
              const kc = type === "keypress" ? ch.charCodeAt(0) : code;
              for (const [k, v] of [["keyCode", kc], ["which", kc], ["charCode", type === "keypress" ? ch.charCodeAt(0) : 0]]) {
                try { Object.defineProperty(e, k, { get: () => v }); } catch (_) { /* figé */ }
              }
              el.dispatchEvent(e);
            };
            el.focus();
            setter.call(el, "");
            el.dispatchEvent(new Event("input", { bubbles: true }));
            for (const ch of texte) {
              ev("keydown", ch); ev("keypress", ch);
              setter.call(el, el.value + ch);
              el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ch }));
              ev("keyup", ch);
              await new Promise((r) => setTimeout(r, delai));
            }
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return { ok: true };
          }
        });
        return res && res.result ? res.result : { ok: false };
      } catch (_) {
        return { ok: false };
      }
    }
    case "content.communeAngular": {
      // Commune de dépôt réellement retenue par Angular (lecture seule, monde de la page) : le nom de la ville dont le code INSEE est dans
      // `vm.choixVilleInsee` de la fenêtre la plus haute. null quand Angular n'est pas lisible.
      if (!sender.tab) return { commune: null };
      try {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: sender.tab.id }, world: "MAIN",
          func: () => {
            const ng = window.angular;
            const sels = [...document.querySelectorAll('select[ng-model="vm.choixVilleInsee"]')].filter((x) => x.offsetWidth || x.offsetHeight);
            const sel = sels[sels.length - 1];
            if (!ng || !sel) return null;
            const vm = (ng.element(sel).scope() || {}).vm;
            if (!vm || !Array.isArray(vm.listeVille)) return null;
            const v = vm.listeVille.find((x) => x && x.inseeCode === vm.choixVilleInsee);
            return v ? String(v.communeNom || "") : "";
          }
        });
        return { commune: res && typeof res.result === "string" ? res.result : null };
      } catch (_) {
        return { commune: null };
      }
    }
    case "content.modele": {
      // Modèle du formulaire du guichet d'Agglopolys (Angular : scope().data.formulaire.modele) — codes, page, ordre, libellé, type ;
      // jamais une valeur saisie. Lu dans le monde de la page (le script de l'extension ne voit pas `angular`).
      if (!sender.tab) return { modele: null };
      try {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: sender.tab.id }, world: "MAIN",
          func: () => {
            const ng = window.angular;
            if (!ng) return null;
            for (const el of document.querySelectorAll("input[id], select[id], textarea[id]")) {
              let sc = null;
              try { sc = ng.element(el).scope(); } catch (_) { sc = null; }
              for (let k = 0; sc && k < 8; k++, sc = sc.$parent) {
                const m = sc.data && sc.data.formulaire && sc.data.formulaire.modele;
                if (m && typeof m === "object") {
                  return Object.keys(m).slice(0, 3000).map((code) => {
                    const v = m[code] || {};
                    return { code, page: Number(v.page) || 0, tabindex: Number(v.tabindex) || 0, type: String(v.type || "").slice(0, 20),
                      libelle: String(v.libelle || "").slice(0, 120), lecture: !!v.estlectureseule };
                  });
                }
              }
            }
            return null;
          }
        });
        return { modele: res && Array.isArray(res.result) ? res.result : null };
      } catch (_) {
        return { modele: null };
      }
    }
    case "content.plan": {
      // Plan cadastral du dossier du NAS, lu par le serveur CLAIRE (jamais un chemin venu de la page) ; rendu en base64 au script de la page.
      const r = await getRun();
      const id = r && r.fiche && r.fiche.dossier && r.fiche.dossier.id;
      const { serveur } = await chrome.storage.local.get(["serveur"]);
      if (!id || !serveur) return { erreur: "Dossier ou adresse de CLAIRE inconnus." };
      try {
        const rep = await fetch(`${serveur}/api/gnau/plan/${encodeURIComponent(id)}`, { credentials: "omit" });
        if (!rep.ok) { const j = await rep.json().catch(() => null); return { erreur: (j && j.erreur) || `CLAIRE répond ${rep.status}.` }; }
        const octets = new Uint8Array(await rep.arrayBuffer());
        if (octets.length > 15 * 1024 * 1024) return { erreur: "Plan trop lourd." };
        let bin = "";
        for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
        return { nom: decodeURIComponent(rep.headers.get("X-Claire-Nom") || "Plan%20cadastral.pdf"), source: decodeURIComponent(rep.headers.get("X-Claire-Source") || ""), b64: btoa(bin) };
      } catch (_) {
        return { erreur: "CLAIRE injoignable." };
      }
    }
    case "content.oublierBrouillon": {
      // Brouillon introuvable : oublié, la prochaine saisie de ce dossier ouvre une nouvelle demande.
      const r = await getRun();
      const cle = r ? cleBrouillon(r.scenario, r.fiche) : "";
      if (cle) {
        const { brouillons = {} } = await chrome.storage.local.get(["brouillons"]);
        delete brouillons[cle];
        await chrome.storage.local.set({ brouillons });
      }
      return { ok: true };
    }
    case "content.formulaire":
      await mutate((r) => {
        r.formulaireOuvert = true;
        // Adresse du brouillon (#/saisie/<id>) : reprise après un rechargement qui le referme. Même onglet, même site seulement.
        const u = String(msg.url || "");
        if (u && sender.tab && sender.tab.url && new URL(u).origin === new URL(sender.tab.url).origin && /#\/saisie\/[\w-]+([?&].*)?$/.test(u)) r.urlSaisie = u;
      });
      await retenirBrouillon(await getRun());
      return { ok: true };
    case "content.advance":
      await mutate((r) => {
        r.pageIndex = msg.pageIndex;
        addLog(r, `Étape ${msg.pageIndex + 1}`);
      });
      return { ok: true };
    case "content.vraiClic": {
      if (!(await gesteAutorise(sender))) return { ok: false };
      const x = Number(msg.x), y = Number(msg.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false };
      try {
        // Zoom du navigateur différent de 100 % : les coordonnées ne correspondraient plus sûrement — jamais un vrai clic à côté ; le script
        // de la page se replie alors sur son clic simulé.
        const zoom = await chrome.tabs.getZoom(sender.tab.id).catch(() => 0);
        if (Math.abs(zoom - 1) > 0.001) return { ok: false, raison: "zoom" };
        await attacher(sender.tab.id);
        await cdp(sender.tab.id, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
        await pause(80);
        await cdp(sender.tab.id, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
        await pause(70);
        await cdp(sender.tab.id, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
        return { ok: true };
      } catch (e) { return { ok: false, erreur: String(e && e.message || e) }; }
    }
    case "content.vraiTexte": {
      if (!(await gesteAutorise(sender))) return { ok: false };
      const texte = String(msg.texte || "").slice(0, 300), delai = Math.min(400, Math.max(20, Number(msg.delai) || 60));
      try {
        await attacher(sender.tab.id);
        for (const ch of texte) {
          await cdp(sender.tab.id, "Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch, unmodifiedText: ch });
          await cdp(sender.tab.id, "Input.dispatchKeyEvent", { type: "keyUp", key: ch });
          await pause(delai);
        }
        return { ok: true };
      } catch (e) { return { ok: false, erreur: String(e && e.message || e) }; }
    }
    case "content.vraieTouche": {
      if (!(await gesteAutorise(sender))) return { ok: false };
      const t = TOUCHES[msg.touche];
      if (!t) return { ok: false };
      try {
        await attacher(sender.tab.id);
        await cdp(sender.tab.id, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: t[1], code: t[1], windowsVirtualKeyCode: t[0], nativeVirtualKeyCode: t[0] });
        if (t[2]) await cdp(sender.tab.id, "Input.dispatchKeyEvent", { type: "char", key: t[1], text: t[2], unmodifiedText: t[2] });
        await cdp(sender.tab.id, "Input.dispatchKeyEvent", { type: "keyUp", key: t[1], code: t[1], windowsVirtualKeyCode: t[0], nativeVirtualKeyCode: t[0] });
        return { ok: true };
      } catch (e) { return { ok: false, erreur: String(e && e.message || e) }; }
    }
    case "content.finish":
      if (sender.tab) await detacher(sender.tab.id);
      await mutate((r) => {
        if (!ACTIVE.includes(r.status)) return r; // déjà arrêté par l'utilisateur
        r.status = msg.status;
        r.message = msg.message || "";
        r.finishedAt = Date.now();
        addLog(r, `Fin : ${msg.status}${msg.message ? " — " + msg.message : ""}`);
      });
      return { ok: true };
    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender)
    .then(sendResponse)
    .catch((e) => sendResponse({ error: String(e && e.message ? e.message : e) }));
  return true;
});

// ---------- Structure de la page (sans données) ----------
// Pour relever les vrais champs d'un guichet : nom, identifiant, type, libellé et options de chaque champ du formulaire affiché,
// JAMAIS sa valeur (ni texte saisi, ni case cochée). À copier puis envoyer pour écrire les scénarios.
async function releverStructure() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.id) throw new Error("Aucun onglet actif.");
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: false },
    func: () => {
      const net = (t) => String(t || "").replace(/\s+/g, " ").trim().slice(0, 140);
      // Texte d'un libellé SANS les champs qu'il contient (relecture 16/10 : un <textarea> rouvert dans un brouillon y mettait sa valeur).
      const texteSansChamps = (n) => { const c = n.cloneNode(true); c.querySelectorAll("input, select, textarea, option").forEach((x) => x.remove()); return net(c.textContent); };
      const libelle = (el) => {
        if (el.id) { const l = [...document.querySelectorAll("label[for]")].find((x) => x.htmlFor === el.id); if (l) return texteSansChamps(l); }
        const parent = el.closest("label"); if (parent) return texteSansChamps(parent);
        return net(el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.title);
      };
      const champs = [...document.querySelectorAll("input, select, textarea")].filter((el) => el.type !== "password").map((el) => ({
        balise: el.tagName.toLowerCase(), type: el.type || "", name: el.name || "", id: el.id || "", libelle: libelle(el),
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length), requis: !!el.required,
        options: el.tagName === "SELECT" ? [...el.options].slice(0, 40).map((o) => net(o.text)) : undefined,
        valeurRadio: el.type === "radio" || el.type === "checkbox" ? net(el.value) : undefined
      }));
      const boutons = [...document.querySelectorAll("button, input[type=submit], input[type=button], a.btn, a.button")]
        .map((b) => ({ texte: net(b.innerText || b.value || b.getAttribute("aria-label")), id: b.id || "", name: b.name || "" })).filter((b) => b.texte).slice(0, 60);
      // Ni titre de page ni intitulés de rubrique : le guichet peut y afficher le nom du demandeur ou du dossier (relecture 16/10).
      return { url: location.origin + location.pathname, champs, boutons, cadres: document.querySelectorAll("iframe").length };
    }
  });
  return res && res.result;
}

// CLAIRE pilote le guichet et change de page elle-même : sur un guichet autorisé hors de la liste du manifeste, le script de saisie
// est remis à chaque chargement de l'onglet suivi (sinon la saisie resterait « en cours » sans personne pour la mener).
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete") return;
  const r = await getRun();
  if (!r || r.tabId !== tabId || !ACTIVE.includes(r.status)) return;
  try { await ensureContent(tabId); } catch (_) { /* adresse non autorisée : la saisie reste en pause côté panneau */ }
});
