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

// CLAIRE pilote le guichet et change de page elle-même : sur un guichet autorisé hors de la liste du manifeste, le script de saisie
// est remis à chaque chargement de l'onglet suivi (sinon la saisie resterait « en cours » sans personne pour la mener).
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete") return;
  const r = await getRun();
  if (!r || r.tabId !== tabId || !ACTIVE.includes(r.status)) return;
  try { await ensureContent(tabId); } catch (_) { /* adresse non autorisée : la saisie reste en pause côté panneau */ }
});
