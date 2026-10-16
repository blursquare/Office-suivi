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

async function startRun({ scenario, fiche, speed, continuer }) {
  const current = await getRun();
  if (current && ACTIVE.includes(current.status)) throw new Error("Une exécution est déjà en cours.");
  // « Remplir la page affichée » sur la page suivante du guichet : les champs déjà remplis sur une page précédente restent cochés.
  const garder = continuer && current && current.scenario && scenario && current.scenario.id === scenario.id
    && current.fiche && fiche && current.fiche.dossier && fiche.dossier && current.fiche.dossier.id === fiche.dossier.id
    ? Object.fromEntries(Object.entries(current.fields || {}).filter(([, v]) => v && v.state === "done"))
    : {};
  validateScenario(scenario);
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

async function handle(msg, sender) {
  switch (msg.type) {
    // Depuis le panneau
    case "getState":
      return { run: await getRun(), linked };
    case "start":
      await startRun(msg);
      return { ok: true };
    case "control":
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
    case "content.etape":
      await mutate((r) => {
        r.etapesFaites = (r.etapesFaites || []).concat(String(msg.label || "")).slice(-20);
        addLog(r, `Étape : ${msg.label}`);
      });
      return { ok: true };
    case "content.advance":
      await mutate((r) => {
        r.pageIndex = msg.pageIndex;
        addLog(r, `Étape ${msg.pageIndex + 1}`);
      });
      return { ok: true };
    case "content.finish":
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
