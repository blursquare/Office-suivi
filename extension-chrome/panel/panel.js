// Panneau latéral en trois étapes (étude 17/10 : « simplifie avec des étapes 1 2 3, pas trop de texte, aux couleurs de CLAIRE ») :
// 1 dossier, 2 démarche (CU / DIA), 3 lancer ; suivi replié champ par champ avec « Copier » sur chaque valeur.
const { resolveField, expandFields, preview, getByPath } = globalThis.ClaireFiche;
const $ = (s) => document.querySelector(s);

let scenarios = [];
let scenario = null;
let fiche = null;
let dossier = null; // { id, libelle, commune, reference }
let run = null;
let serveur = "";

const ACTIVE = ["running", "paused"];
const ICON = { pending: "○", filling: "…", done: "✓", missing: "⚠", notfound: "⚠", mismatch: "⚠", skipped: "–", absent: "·", manuel: "⧉" };
const DETAIL = {
  missing: "absente de la fiche CLAIRE",
  notfound: "champ introuvable dans le guichet",
  mismatch: "valeur différente dans le guichet",
  absent: "pas sur cette page du guichet",
  manuel: "emplacement pas encore relevé : Copier, puis coller dans le guichet"
};
const STATUS = {
  running: ["CLAIRE remplit le guichet…", ""],
  paused: ["En pause", "pause"],
  awaiting_human: ["Terminé : relisez, puis transmettez vous-même.", "ok"],
  error: ["Arrêt sur erreur", "err"],
  stopped: ["Arrêté", ""]
};

const send = (msg) => chrome.runtime.sendMessage(msg);
const msg = (sel, texte, ok) => { const el = $(sel); el.textContent = texte || ""; el.className = "msg" + (ok ? " ok" : ""); };

// ---------- Serveur CLAIRE ----------

async function api(chemin) {
  if (!serveur) throw new Error("Réglez d’abord l’adresse de CLAIRE.");
  const r = await fetch(serveur + chemin, { credentials: "omit" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && j.erreur) || `CLAIRE répond ${r.status}.`);
  return j;
}

function setLink(on, texte) {
  const el = $("#link");
  el.className = "link " + (on ? "on" : "off");
  el.textContent = texte || (on ? "Connecté" : "CLAIRE injoignable");
  // La connexion ne s'affiche que tant que CLAIRE ne répond pas.
  $("#connexion").hidden = !!on;
}

async function tester() {
  try {
    const r = await fetch(serveur + "/api/health");
    const j = r.ok ? await r.json() : null;
    setLink(!!(j && j.ok));
    return !!(j && j.ok);
  } catch (_) {
    setLink(false);
    return false;
  }
}

async function enregistrerServeur() {
  let url;
  try { url = new URL($("#serveur").value.trim()); } catch (_) { msg("#connexion-msg", "Adresse invalide (exemple : http://192.168.60.10:3000)."); return; }
  // Permission limitée à la machine de CLAIRE, demandée ici, au geste de l'utilisateur.
  const accorde = await chrome.permissions.request({ origins: [url.protocol + "//" + url.hostname + "/*"] });
  if (!accorde) { msg("#connexion-msg", "Autorisation refusée : l’extension ne pourra pas joindre CLAIRE."); return; }
  serveur = url.origin;
  await chrome.storage.local.set({ serveur });
  $("#serveur").value = serveur;
  const ok = await tester();
  msg("#connexion-msg", ok ? "Enregistré — CLAIRE répond." : "Enregistré, mais CLAIRE ne répond pas à cette adresse.", ok);
  if (ok) rechercher();
}

// ---------- Dossier et démarche ----------

let minuterie = null;
async function rechercher() {
  const q = $("#recherche").value.trim();
  const box = $("#resultats");
  try {
    const { dossiers } = await api("/api/gnau/dossiers?q=" + encodeURIComponent(q));
    box.textContent = "";
    if (!dossiers.length) { box.textContent = "Aucune vente en cours ne correspond."; return; }
    for (const d of dossiers.slice(0, 8)) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = d.libelle;
      const s = document.createElement("small");
      s.textContent = [d.commune, d.reference].filter(Boolean).join(" · ");
      b.appendChild(s);
      b.addEventListener("click", () => choisirDossier(d));
      box.appendChild(b);
    }
  } catch (e) {
    box.textContent = "";
    msg("#setup-msg", e.message);
  }
}

async function choisirDossier(d) {
  dossier = d;
  $("#choisi").textContent = d.libelle + (d.commune ? " · " + d.commune : "");
  $("#resultats").textContent = "";
  await chargerFiche();
}

// Le guichet affiché choisit sa variante : celui d'Agglopolys a son propre scénario (codes du CERFA relevés, entrée par la commune de dépôt).
async function hoteOnglet() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab && tab.url ? new URL(tab.url).hostname : "";
  } catch (_) { return ""; }
}

async function chargerScenario() {
  const proc = $("#procedure").value;
  const hote = await hoteOnglet();
  const s = scenarios.find((x) => x.procedure === proc && (x.hotes || []).includes(hote))
    || scenarios.find((x) => x.procedure === proc && !x.hotes) || scenarios[0];
  scenario = s ? await (await fetch(`../scenarios/${s.file}`)).json() : null;
}

async function chargerFiche() {
  msg("#setup-msg", "");
  fiche = null;
  await chargerScenario();
  if (dossier) {
    try {
      fiche = (await api(`/api/gnau/fiche/${encodeURIComponent(dossier.id)}?procedure=${encodeURIComponent($("#procedure").value)}`)).fiche;
    } catch (e) { msg("#setup-msg", e.message); }
  }
  const m = $("#manques");
  const manques = (fiche && fiche.manques) || [];
  m.hidden = !manques.length;
  m.querySelector("summary").textContent = manques.length > 1 ? `${manques.length} informations manquent dans CLAIRE` : "1 information manque dans CLAIRE";
  const ul = m.querySelector("ul");
  ul.textContent = "";
  manques.forEach((t) => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
  render();
}

// ---------- Init ----------

async function init() {
  scenarios = await (await fetch("../scenarios/index.json")).json();
  const sel = $("#procedure");
  const COURT = { cua: "CU", dia: "DIA" };
  for (const s of scenarios.filter((x) => !x.hotes)) {
    sel.add(new Option(s.name, s.procedure));
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = COURT[s.procedure] || s.name;
    b.title = s.name;
    b.setAttribute("role", "radio");
    b.dataset.procedure = s.procedure;
    b.addEventListener("click", () => { if (sel.disabled) return; sel.value = s.procedure; chargerFiche(); });
    $("#procedures").appendChild(b);
  }

  const st0 = await chrome.storage.local.get(["serveur"]);
  serveur = st0.serveur || "";
  $("#serveur").value = serveur;
  if (serveur) { if (await tester()) rechercher(); } else setLink(false, "CLAIRE non réglé");

  $("#enregistrer").addEventListener("click", enregistrerServeur);
  // Un clic sur le témoin rouvre la connexion (changer l'adresse de CLAIRE).
  $("#link").addEventListener("click", () => { $("#connexion").hidden = !$("#connexion").hidden; });
  $("#recherche").addEventListener("input", () => { clearTimeout(minuterie); minuterie = setTimeout(rechercher, 250); });

  // CLAIRE pilote tout le guichet : ouverture de la démarche, chaque page, « page suivante » (« Remplir seulement la page affichée » retiré,
  // étude 17/10).
  $("#auto").addEventListener("click", async () => {
    msg("#setup-msg", "");
    // Fiche relue à chaque lancement : ce qui a été corrigé dans CLAIRE entre-temps est pris.
    await chargerFiche();
    if (!fiche) return;
    const r = await send({ type: "start", scenario: Object.assign({}, scenario, { auto: true }), fiche, speed: $("#speed").value });
    if (r && r.error) msg("#setup-msg", r.error);
  });
  $("#oublier-brouillons").addEventListener("click", async () => {
    const r = await send({ type: "oublierBrouillons" });
    msg("#setup-msg", r && r.error ? r.error : "Brouillons oubliés : CLAIRE commencera une nouvelle demande depuis l’accueil du guichet.", !(r && r.error));
  });
  $("#structure").addEventListener("click", async () => {
    const r = await send({ type: "structure" });
    if (!r || r.error) { msg("#setup-msg", (r && r.error) || "Page illisible."); return; }
    try { await navigator.clipboard.writeText(JSON.stringify(r.structure, null, 1)); } catch (_) { msg("#setup-msg", "Copie refusée par Chrome : cliquez dans le panneau puis recommencez."); return; }
    msg("#setup-msg", `Structure copiée (${r.structure.champs.length} champs, aucune valeur) : collez-la dans la conversation avec Claude.`, true);
  });
  $("#pause").addEventListener("click", () => send({ type: "control", action: "pause" }));
  $("#resume").addEventListener("click", () => send({ type: "control", action: "resume" }));
  $("#stop").addEventListener("click", () => send({ type: "control", action: "stop" }));
  $("#reset").addEventListener("click", async () => { await send({ type: "reset" }); run = null; render(); });

  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === "state") { run = m.run; render(); }
  });

  const st = await send({ type: "getState" });
  run = st && st.run;
  await chargerScenario();
  render();
  // Dossier dont le lien du guichet a été cliqué dans CLAIRE (étude 17/10) : choisi d'avance, jamais pendant une saisie en cours.
  await prendreDossierPropose();
  chrome.storage.onChanged.addListener((ch, zone) => { if (zone === "session" && ch.dossierPropose && ch.dossierPropose.newValue) prendreDossierPropose(); });
}

async function prendreDossierPropose() {
  const { dossierPropose } = await chrome.storage.session.get(["dossierPropose"]);
  // Jamais par-dessus un dossier déjà choisi dans le panneau (relecture du 17/10) : la proposition attend le prochain panneau ouvert.
  if (!dossierPropose || !dossierPropose.id || dossier || (run && ACTIVE.includes(run.status))) return;
  await chrome.storage.session.remove("dossierPropose");
  if (serveur) await choisirDossier(dossierPropose);
}

// ---------- Rendu ----------

function render() {
  const active = run && ACTIVE.includes(run.status);
  const memeDossier = run && fiche && run.fiche && run.fiche.dossier && run.fiche.dossier.id === fiche.dossier.id && run.scenario.id === (scenario && scenario.id);
  const sc = scenario;
  const data = fiche;

  $("#auto").disabled = !(scenario && dossier && serveur) || !!active;
  $("#procedure").disabled = !!active;
  for (const b of document.querySelectorAll("#procedures button")) {
    const actif = b.dataset.procedure === $("#procedure").value;
    b.classList.toggle("actif", actif);
    b.setAttribute("aria-checked", String(actif));
    b.disabled = !!active;
  }
  $("#etape-dossier").classList.toggle("fait", !!dossier);
  $("#etape-demarche").classList.toggle("fait", !!(dossier && fiche));

  $("#run").hidden = !run;
  if (run) {
    const [txt, cls] = STATUS[run.status] || ["", ""];
    const el = $("#status");
    el.className = "status " + cls;
    el.textContent = run.status === "error" && run.message ? `Arrêt : ${run.message}` : run.status === "awaiting_human" && run.message ? run.message : txt;
    // Où en est le remplissage : les étapes du scénario, faites / en cours / à venir (étude 17/10).
    const liste = $("#etapes");
    liste.textContent = "";
    const etapes = (run.scenario && run.scenario.etapesSuivi) || [];
    const vues = run.etapesFaites || [];
    const derniere = [...vues].reverse().find((e) => etapes.includes(e));
    const iCourante = derniere ? etapes.indexOf(derniere) : -1;
    const fini = run.status === "awaiting_human" && vues.includes("Sauvegarder");
    etapes.forEach((e, i) => {
      const li = document.createElement("li");
      li.textContent = e;
      // « fait » seulement pour une étape réellement vue ; une étape passée sans avoir eu lieu (assistant non ouvert, champ vide) reste
      // neutre, barrée d'un tiret — jamais en vert.
      li.className = i === iCourante ? (active ? "courante" : "fait") : vues.includes(e) ? "fait" : i < iCourante || fini ? "passee" : "";
      liste.appendChild(li);
    });
    $("#pause").hidden = run.status !== "running";
    $("#resume").hidden = run.status !== "paused";
    $("#stop").hidden = !active;
    $("#reset").hidden = !!active;
  }

  const box = $("#list");
  box.textContent = "";
  $("#detail").hidden = !(sc && data);
  if (!sc || !data) { $("#compte").textContent = ""; return; }

  let doneCount = 0;
  let total = 0;
  sc.pages.forEach((page, pi) => {
    const card = document.createElement("div");
    card.className = "page";
    const h = document.createElement("h2");
    h.textContent = data.dossier ? `${data.dossier.libelle} — ${sc.name}` : sc.name;
    card.appendChild(h);

    expandFields(page, data).forEach((f, fi) => {
      const r = resolveField(f, data);
      const st = memeDossier && run.fields[`${pi}:${f.label || f.source || fi}`];
      let state = st ? st.state : r.missing ? (f.optional ? "skipped" : "missing") : r.invalid ? "mismatch" : "pending";
      if (r.missing && f.optional && !st) state = "skipped";
      total += 1;
      if (state === "done") doneCount += 1;

      const row = document.createElement("div");
      row.className = "row s-" + state;
      const ico = document.createElement("div");
      ico.className = "ico";
      ico.textContent = ICON[state] || "○";
      const body = document.createElement("div");
      const l = document.createElement("div");
      l.className = "l";
      l.textContent = f.label || f.source;
      const v = document.createElement("div");
      v.className = "v";
      const shown = f.encoded ? preview(getByPath(data, f.source)) : r.value; // valeur lisible, pas le code envoyé au site
      v.textContent = r.missing ? "—" : r.invalid ? "valeur inexploitable" : typeof shown === "boolean" ? (shown ? "Oui" : "Non") : shown;
      body.append(l, v);
      const detail = (st && st.detail && state !== "absent" ? st.detail : "") || (r.invalid && r.error) || DETAIL[state];
      if (detail && ["missing", "notfound", "mismatch", "manuel", "absent"].includes(state)) {
        const d = document.createElement("div");
        d.className = "d";
        d.textContent = detail;
        body.appendChild(d);
      }
      row.append(ico, body);
      // La valeur telle que le guichet l'attend (dates JJMMAAAA, prix en lettres, listes encodées) : à coller à la main si besoin.
      if (!r.missing && !r.invalid && typeof r.value !== "boolean") {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "copier";
        b.textContent = "Copier";
        b.title = "Copier la valeur au format du guichet";
        b.addEventListener("click", async () => { await navigator.clipboard.writeText(String(r.value)); b.textContent = "Copié"; setTimeout(() => (b.textContent = "Copier"), 1200); });
        row.appendChild(b);
      }
      card.appendChild(row);
    });
    box.appendChild(card);
  });

  $("#bar-fill").style.width = total ? `${Math.round((doneCount / total) * 100)}%` : "0";
  // Le nombre de cases remplies seulement (étude 17/10 : « retirer l'affichage de ce qui reste à faire ») ; le détail reste dans
  // « Détail des champs ».
  $("#compte").textContent = run ? `${doneCount} rempli${doneCount > 1 ? "s" : ""}` : "";
}

init();
