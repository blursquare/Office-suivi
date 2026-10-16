// Content script : exécute le scénario sur la page (remplissage, curseur animé, clic sur « Suivant »).
// Les actions passent par le DOM ; le curseur affiché est une animation.
(() => {
  if (window.__claireLoaded) return;
  window.__claireLoaded = true;

  const { resolveField, expandFields } = globalThis.ClaireFiche;

  // Boutons que CLAIRE ne cliquera JAMAIS, quel que soit le scénario. Liste volontairement en dur.
  const FORBIDDEN = /(valider|validation|envoyer|signer|signature|soumettre|confirmer|transmettre|payer|paiement|supprimer|finaliser|certifier)/i;

  const SPEEDS = {
    slow: { type: 90, move: 900, pause: 500 },
    normal: { type: 35, move: 450, pause: 250 },
    fast: { type: 8, move: 150, pause: 80 },
  };

  class Stop extends Error {}

  let control = "running"; // running | paused | stopped
  let loopActive = false;
  let blocking = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const send = (msg) => {
    try {
      return chrome.runtime.sendMessage(msg).catch(() => null);
    } catch (_) {
      return Promise.resolve(null);
    }
  };

  async function gate() {
    while (control === "paused") await sleep(150);
    if (control === "stopped") throw new Stop();
  }
  async function wait(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await gate();
      await sleep(Math.max(0, Math.min(50, end - Date.now())));
    }
    await gate();
  }

  // ---------- Overlay (Shadow DOM, isolé du CSS du portail) ----------

  let host = null;
  let root = null;
  let cursorEl = null;

  const CSS = `
    :host{all:initial}
    .frame{position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 0 4px var(--c,#2f6fed);transition:box-shadow .3s}
    .blocker{position:fixed;inset:0;pointer-events:auto;background:transparent;cursor:progress}
    .cursor{position:fixed;left:0;top:0;width:24px;height:24px;pointer-events:none;transform:translate(24px,90px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
    .banner{position:fixed;top:12px;left:50%;transform:translateX(-50%);pointer-events:auto;display:flex;gap:10px;align-items:center;
      background:#1b2a4a;color:#fff;padding:8px 8px 8px 16px;border-radius:999px;font:14px/1.2 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:90vw}
    .banner .txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .banner button{font:inherit;border:0;border-radius:999px;padding:6px 12px;cursor:pointer;background:#fff;color:#1b2a4a}
    .banner button.stop{background:#d64545;color:#fff}
    .ripple{position:fixed;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:3px solid var(--c,#2f6fed);pointer-events:none;animation:rip .5s ease-out forwards}
    @keyframes rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.8);opacity:0}}
  `;

  const COLORS = { running: "#2f6fed", paused: "#e0922f", attention: "#2f9e5b", error: "#d64545" };

  function buildOverlay() {
    if (host) return;
    host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style>
      <div class="frame"></div>
      <div class="blocker" hidden></div>
      <svg class="cursor" viewBox="0 0 24 24"><path d="M3 2l7 19 2.8-7.7L21 10.5z" fill="#fff" stroke="#1b2a4a" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <div class="banner"><span class="txt"></span><span class="btns"></span></div>`;
    cursorEl = root.querySelector(".cursor");
    root.addEventListener("click", (e) => {
      const a = e.target && e.target.dataset && e.target.dataset.a;
      if (!a) return;
      if (a === "close") return teardown();
      send({ type: "control", action: a });
    });
    document.documentElement.appendChild(host);
  }

  function setBanner(text, mode) {
    buildOverlay();
    root.querySelector(".frame").style.setProperty("--c", COLORS[mode] || COLORS.running);
    root.querySelector(".txt").textContent = text;
    const btns = root.querySelector(".btns");
    btns.innerHTML =
      mode === "running"
        ? `<button data-a="pause">Reprendre la main</button><button class="stop" data-a="stop">Stop</button>`
        : mode === "paused"
        ? `<button data-a="resume">Reprendre CLAIRE</button><button class="stop" data-a="stop">Stop</button>`
        : `<button data-a="close">Fermer</button>`;
  }

  function setBlocking(b) {
    blocking = b;
    if (root) root.querySelector(".blocker").hidden = !b;
  }

  function teardown() {
    if (host) host.remove();
    host = root = cursorEl = null;
    blocking = false;
  }

  // Pendant que CLAIRE pilote, les frappes réelles de l'utilisateur sont bloquées (Échap = pause).
  ["keydown", "keypress", "keyup"].forEach((t) =>
    window.addEventListener(
      t,
      (e) => {
        if (!blocking || !e.isTrusted) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (t === "keydown" && e.key === "Escape") send({ type: "control", action: "pause" });
      },
      true
    )
  );

  async function moveTo(el, sp) {
    el.scrollIntoView({ block: "center", inline: "nearest" });
    await wait(60);
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + Math.min(r.width * 0.5, 60));
    const y = Math.round(r.top + r.height / 2);
    cursorEl.style.transition = `transform ${sp.move}ms cubic-bezier(.22,.61,.36,1)`;
    cursorEl.style.transform = `translate(${x}px,${y}px)`;
    await wait(sp.move + 40);
    return { x, y };
  }

  function ripple(x, y) {
    const d = document.createElement("div");
    d.className = "ripple";
    d.style.left = x + "px";
    d.style.top = y + "px";
    root.appendChild(d);
    setTimeout(() => d.remove(), 600);
  }

  function mark(el, on) {
    if (on) {
      el.__claireOutline = el.style.outline;
      el.style.outline = "3px solid #2f6fed";
      el.style.outlineOffset = "2px";
    } else {
      el.style.outline = el.__claireOutline || "";
    }
  }

  // ---------- Utilitaires DOM ----------

  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  async function waitForSelector(sel, timeout = 8000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      await gate();
      const el = document.querySelector(sel);
      if (el) return el;
      await sleep(100);
    }
    return null;
  }

  function setNativeValue(el, v) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  }

  function fire(el, type, init) {
    el.dispatchEvent(new (type === "input" ? InputEvent : Event)(type, { bubbles: true, ...init }));
  }

  async function typeInto(el, text, sp) {
    el.focus();
    setNativeValue(el, "");
    fire(el, "input", { inputType: "deleteContentBackward" });
    // Les champs date/nombre n'acceptent pas la frappe partielle : valeur posée d'un coup.
    if (["date", "number", "datetime-local", "month", "time"].includes(el.type)) {
      setNativeValue(el, text);
      fire(el, "input", { inputType: "insertText", data: text });
    } else {
      for (const ch of text) {
        setNativeValue(el, el.value + ch);
        fire(el, "input", { inputType: "insertText", data: ch });
        await wait(sp.type);
      }
    }
    fire(el, "change");
    el.blur();
  }

  function setSelect(el, value) {
    const v = String(value).trim().toLowerCase();
    const opt = [...el.options].find((o) => o.value.toLowerCase() === v || o.text.trim().toLowerCase() === v);
    if (!opt) return false;
    el.value = opt.value;
    fire(el, "input");
    fire(el, "change");
    return true;
  }

  async function fillElement(el, type0, value, sp, direct) {
    // Une liste trouvée par un code prévu « texte » se remplit comme une liste (le setter d'un input y lève une erreur).
    const type = el instanceof HTMLSelectElement ? "select" : type0;
    // Champ caché (valeur encodée calculée par CLAIRE) : posé d'un coup, sans curseur ni frappe.
    if (direct && !["checkbox", "radio", "select"].includes(type)) {
      setNativeValue(el, String(value));
      fire(el, "input", { inputType: "insertText", data: String(value) });
      fire(el, "change");
      return el.value === String(value) ? { ok: true } : { ok: false, detail: `le portail affiche « ${el.value} »` };
    }
    const pos = await moveTo(el, sp);
    mark(el, true);
    try {
      if (type === "checkbox" || type === "radio") {
        const want = type === "radio" ? true : !!value;
        if (el.checked !== want) {
          ripple(pos.x, pos.y);
          el.click();
          await wait(sp.pause);
        }
        return el.checked === want ? { ok: true } : { ok: false, detail: "case non modifiable" };
      }
      if (type === "select") {
        ripple(pos.x, pos.y);
        await wait(sp.pause);
        if (!setSelect(el, value)) return { ok: false, detail: `option « ${value} » introuvable` };
        const o = el.options[el.selectedIndex];
        return { ok: true, detail: o ? o.text.trim() : "" };
      }
      ripple(pos.x, pos.y);
      await typeInto(el, String(value), sp);
      await wait(sp.pause);
      return el.value === String(value)
        ? { ok: true }
        : { ok: false, detail: `le portail affiche « ${el.value} »` };
    } finally {
      mark(el, false);
    }
  }

  // ---------- Exécution du scénario ----------

  const report = (key, state, detail) => send({ type: "content.field", key, state, detail: detail || "" });

  // Un code de champ du CERFA relevé sur le guichet (« AI1NP1 ») → les formes sous lesquelles il peut porter ce code dans la page.
  function selecteurCode(code) {
    const c = String(code || "");
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(c)) return "";
    return [`[name="${c}"]`, `#${c}`, `[name$=".${c}"]`, `[name$="_${c}"]`, `[name$="[${c}]"]`, `[id$="_${c}"]`, `[id$="-${c}"]`].join(", ");
  }

  // Clé d'un champ : son libellé (stable quand la fiche relue gagne ou perd un codemandeur — relecture 16/10), l'index en secours.
  const cleChamp = (pi, fi, f) => `${pi}:${f.label || f.source || fi}`;

  // Le premier élément VISIBLE qui répond au sélecteur ; un champ caché (type=hidden ou masqué) seulement si le scénario le dit
  // (`direct`) — un guichet qui place un champ caché du même nom avant le champ visible ne le reçoit jamais (relecture 16/10).
  function elementCible(sel, f) {
    const tous = [...document.querySelectorAll(sel)];
    return tous.find((el) => el.type !== "hidden" && visible(el)) || (f.direct ? tous[0] || null : null);
  }

  async function fillOne(run, pi, fi, f, sp) {
    const key = cleChamp(pi, fi, f);
    const pageAffichee = !!(run.scenario && run.scenario.pageAffichee);
    const dejaFait = !!(run.fields && run.fields[key] && run.fields[key].state === "done");
    // Reprise après rechargement (scénario à plusieurs pages) ; en « page affichée », un champ présent sur la page est toujours
    // rempli de nouveau (même valeur : sans risque) — un brouillon rouvert ou une seconde demande ne restent pas vides.
    if (dejaFait && !pageAffichee) return;
    await gate();
    const r = resolveField(f, run.fiche);
    if (r.missing) return void (await report(key, f.optional ? "skipped" : "missing"));
    if (r.invalid) return void (await report(key, "mismatch", r.error)); // valeur de la fiche inexploitable : on ne saisit rien
    await report(key, "filling");
    const sel = f.selectorByValue ? f.selectorByValue[String(r.value)] : (f.selector || selecteurCode(f.code));
    // Champ dont l'emplacement sur le guichet n'est pas encore relevé : la valeur se copie depuis le panneau.
    if (!sel) return void (await report(key, "manuel", "à coller à la main (bouton Copier du panneau)"));
    // « Page affichée » : seuls les champs présents sur CETTE page sont remplis, sans attendre les autres.
    if (!pageAffichee) await waitForSelector(sel, 5000);
    const el = elementCible(sel, f);
    // Absent de cette page : un champ rempli sur une page précédente reste coché.
    if (!el) return void (await report(key, pageAffichee ? (dejaFait ? "done" : "absent") : "notfound", sel));
    const direct = !!f.direct;
    const res = await fillElement(el, f.type || "text", r.value, sp, direct);
    await report(key, res.ok ? "done" : "mismatch", res.detail);
  }

  async function finish(status, message) {
    await send({ type: "content.finish", status, message });
    setBlocking(false);
    setBanner(message, status === "error" ? "error" : "attention");
  }

  function buttonText(el) {
    return [el.innerText, el.value, el.getAttribute("aria-label"), el.title, el.id, el.name].filter(Boolean).join(" ");
  }

  async function loop(run) {
    const sc = run.scenario;
    const sp = SPEEDS[run.speed] || SPEEDS.normal;
    let pi = run.pageIndex || 0;

    while (pi < sc.pages.length) {
      const page = sc.pages[pi];
      const total = sc.pages.length;
      setBanner(`CLAIRE pilote cette page — étape ${pi + 1}/${total}`, "running");
      setBlocking(true);

      if (page.urlPattern && !new RegExp(page.urlPattern).test(location.href)) {
        throw new Error(`Adresse inattendue à l'étape ${pi + 1}.`);
      }
      if (!(await waitForSelector(page.waitFor, 20000))) {
        throw new Error(`Page de l'étape ${pi + 1} introuvable (${page.waitFor}).`);
      }

      // Ancien CERFA (codes « DI… », HANDOFF §10) : ses brouillons sont « non transmissibles » — arrêt avant toute saisie.
      if (sc.refuserSiNoms) {
        const noms = [...document.querySelectorAll("input, select, textarea")].map((el) => (el.name || el.id || "").split(/[.\[\]_-]/).pop());
        const ancien = new RegExp(sc.refuserSiNoms);
        const actuel = sc.attendreNoms ? new RegExp(sc.attendreNoms) : null;
        if (noms.some((n) => ancien.test(n)) && !(actuel && noms.some((n) => actuel.test(n)))) {
          throw new Error("Ancien formulaire CERFA affiché : CLAIRE ne le remplit pas. Recommencez la demande sur le formulaire actuel.");
        }
      }
      const fields = expandFields(page, run.fiche);
      for (let fi = 0; fi < fields.length; fi++) await fillOne(run, pi, fi, fields[fi], sp);

      if (page.errorSelector) {
        const err = document.querySelector(page.errorSelector);
        if (err && visible(err)) throw new Error("Le portail signale une erreur : " + err.innerText.trim().slice(0, 200));
      }

      const last = pi === total - 1;
      if (last || page.stopForHuman || !page.next) {
        await finish("awaiting_human", sc.pageAffichee
          ? "Page remplie. Relisez ; sur la page suivante du guichet, cliquez de nouveau « Remplir la page affichée ». Vous validez vous-même."
          : "Remplissage terminé. Relisez, puis validez vous-même dans le portail.");
        return;
      }

      // --- Passage à la page suivante ---
      const nextEl = await waitForSelector(page.next.selector, 5000);
      if (!nextEl) throw new Error(`Bouton « suivant » introuvable (${page.next.selector}).`);
      const label = buttonText(nextEl);
      if (FORBIDDEN.test(label)) throw new Error(`Bouton refusé par sécurité : « ${label.trim().slice(0, 60)} ».`);
      if (page.next.expectText && !new RegExp(page.next.expectText, "i").test(nextEl.innerText || nextEl.value || "")) {
        throw new Error(`Le bouton ne porte pas le texte attendu (${page.next.expectText}).`);
      }

      const startHref = location.href;
      const pos = await moveTo(nextEl, sp);
      mark(nextEl, true);
      ripple(pos.x, pos.y);
      await wait(sp.pause);
      await send({ type: "content.advance", pageIndex: pi + 1 }); // persisté AVANT le clic (la page peut se recharger)
      await gate();
      nextEl.click();

      // Page rechargée : ce script disparaît et la nouvelle page reprend. Application monopage : on attend ici.
      const nextPage = sc.pages[pi + 1];
      const end = Date.now() + 20000;
      let ok = false;
      while (Date.now() < end) {
        await gate();
        const left = !document.querySelector(page.waitFor) || location.href !== startHref;
        if (left && document.querySelector(nextPage.waitFor)) {
          ok = true;
          break;
        }
        const err = page.errorSelector && document.querySelector(page.errorSelector);
        if (err && visible(err)) throw new Error("Le portail signale une erreur : " + err.innerText.trim().slice(0, 200));
        await sleep(150);
      }
      if (!ok) throw new Error(`La page suivante (étape ${pi + 2}) ne s'est pas affichée.`);
      mark(nextEl, false);
      pi += 1;
      run = { ...run, pageIndex: pi };
    }
  }

  // ---------- CLAIRE pilote le guichet (étude 16/10 : « que l'add-on prenne la main sur le site, choisisse CU a ou DIA et remplisse
  // seul les champs ») ----------
  // Sur chaque page affichée : (1) tant que le formulaire n'est pas ouvert, les étapes du scénario (« Nouvelle demande », « Certificat
  // d'urbanisme », « information »…) sont cliquées par leur TEXTE ; (2) chaque champ est cherché par son code CERFA, sinon par son
  // libellé dans sa rubrique (« Nom » sous « Propriétaire »), et rempli s'il est vide — jamais par-dessus une valeur déjà là ;
  // (3) le bouton « Suivant » est cliqué ; arrêt quand il n'y en a plus, ou devant un bouton de la liste noire (valider, envoyer,
  // signer…). L'ancien CERFA est refusé. Rien n'est jamais validé ni transmis.

  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[*:]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const CHAMPS_SAISIE = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=file]):not([type=password]):not([type=image]), select, textarea';
  const TITRES = "h1, h2, h3, h4, h5, h6, legend, caption, [role=heading], .titre, .title, .panel-title, .card-title, .card-header, .section-title";
  const CLIQUABLES = 'a, button, [role=button], [role=link], [role=tab], [role=menuitem], [role=option], [role=radio], label, input[type=button], input[type=submit]';

  function texteSansChampsNoeud(n) {
    const c = n.cloneNode(true);
    c.querySelectorAll("input, select, textarea, option").forEach((x) => x.remove());
    return c.textContent || "";
  }

  // Le libellé d'un champ : <label for>, label englobant, aria-label(ledby), placeholder, titre, sinon le texte juste avant lui.
  function libelleChamp(el) {
    const parts = [];
    if (el.id) [...document.querySelectorAll("label[for]")].filter((l) => l.htmlFor === el.id).forEach((l) => parts.push(texteSansChampsNoeud(l)));
    const englobant = el.closest("label");
    if (englobant) parts.push(texteSansChampsNoeud(englobant));
    if (el.getAttribute("aria-labelledby")) el.getAttribute("aria-labelledby").split(/\s+/).forEach((id) => { const n = document.getElementById(id); if (n) parts.push(n.textContent); });
    parts.push(el.getAttribute("aria-label") || "", el.getAttribute("placeholder") || "", el.title || "");
    if (!parts.some((p) => norm(p))) {
      let prec = el.previousElementSibling;
      for (let i = 0; prec && i < 3 && !norm(prec.textContent); i++) prec = prec.previousElementSibling;
      if (prec) parts.push(texteSansChampsNoeud(prec));
      else if (el.parentElement) {
        const cellule = el.closest("td, .col, [class*=col-], .form-group, .field, .champ");
        const avant = cellule && cellule.previousElementSibling;
        if (avant) parts.push(texteSansChampsNoeud(avant));
        else if (el.parentElement.previousElementSibling) parts.push(texteSansChampsNoeud(el.parentElement.previousElementSibling));
      }
    }
    return norm(parts.filter(Boolean).join(" ")).slice(0, 160);
  }

  // La rubrique d'un champ : légende du fieldset, puis le dernier titre placé avant lui dans la page.
  function rubriqueChamp(el) {
    const parts = [];
    const fs = el.closest("fieldset");
    const lg = fs && fs.querySelector("legend");
    if (lg) parts.push(lg.textContent);
    // Le dernier titre de CHAQUE niveau avant le champ : « Identité du propriétaire » puis « Adresse » (une sous-rubrique ne cache pas
    // la rubrique qui la contient).
    const parNiveau = new Map();
    for (const t of document.querySelectorAll(TITRES)) {
      if (t.contains(el)) continue;
      if (!(t.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
      const niveau = /^H[1-6]$/.test(t.tagName) ? t.tagName : (t.tagName === "LEGEND" ? "LEGEND" : "AUTRE");
      parNiveau.set(niveau, t);
      // Un titre de niveau supérieur efface les sous-titres d'avant lui.
      if (/^H[1-6]$/.test(niveau)) for (const k of [...parNiveau.keys()]) if (/^H[1-6]$/.test(k) && k > niveau) parNiveau.delete(k);
    }
    [...parNiveau.values()].forEach((t) => parts.push(t.textContent));
    return norm(parts.join(" "));
  }

  function candidatsChamp(f) {
    const tous = [...document.querySelectorAll(CHAMPS_SAISIE)].filter(visible);
    const parCode = f.code ? (() => { const sel = selecteurCode(f.code); return sel ? tous.filter((el) => el.matches(sel)) : []; })() : [];
    if (parCode.length) return parCode;
    if (!f.libelles || !f.libelles.length) return [];
    const res = f.libelles.map((x) => new RegExp(x, "i"));
    const sec = f.rubrique ? new RegExp(f.rubrique, "i") : null;
    const horsSec = f.horsRubrique ? new RegExp(f.horsRubrique, "i") : null;
    return tous.filter((el) => {
      if (f.type === "choix" ? !(el.type === "radio" || el.type === "checkbox") : (el.type === "radio" || el.type === "checkbox")) return false;
      const l = libelleChamp(el);
      if (!l || !res.some((r) => r.test(l))) return false;
      const r = rubriqueChamp(el);
      return (!sec || sec.test(r)) && !(horsSec && horsSec.test(r));
    });
  }

  // Une valeur au format d'un <input type=date> quand le guichet en a un.
  function valeurPourChamp(el, v) {
    const s = String(v);
    if (el.type === "date") {
      let m = /^(\d{2})(\d{2})(\d{4})$/.exec(s) || /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    }
    return s;
  }

  async function remplirAuto(run, f, sp) {
    const key = cleChamp(0, f.label, f);
    const deja = run.fields && run.fields[key] && run.fields[key].state;
    const r = resolveField(f, run.fiche);
    if (r.missing) { if (deja !== "done") await report(key, f.optional ? "skipped" : "missing"); return false; }
    if (r.invalid) { await report(key, "mismatch", r.error); return false; }
    if (f.type === "choix") {
      // Bouton radio / case dont le libellé dit la valeur (« Personne morale ») : un vrai clic.
      const motif = f.choix && f.choix[String(r.value)];
      if (!motif) return false;
      const re = new RegExp(motif, "i");
      const sec = f.rubrique ? new RegExp(f.rubrique, "i") : null;
      const el = [...document.querySelectorAll('input[type=radio], input[type=checkbox]')].filter((x) => visible(x) || (x.labels && [...x.labels].some(visible)))
        .find((x) => re.test(libelleChamp(x)) && (!sec || sec.test(rubriqueChamp(x))));
      if (!el) { if (deja !== "done") await report(key, "absent"); return false; }
      if (!el.checked) { await report(key, "filling"); const cible = (el.labels && [...el.labels].find(visible)) || el; const pos = await moveTo(cible, sp); ripple(pos.x, pos.y); el.click(); await wait(sp.pause); }
      await report(key, el.checked ? "done" : "mismatch", el.checked ? "" : "case non cochée");
      return true;
    }
    // Emplacement pas encore connu (ni code ni libellé) : la valeur se copie depuis le panneau.
    if (!f.code && !(f.libelles && f.libelles.length)) { await report(key, "manuel", "à coller à la main (bouton Copier du panneau)"); return false; }
    const cands = candidatsChamp(f);
    let el = null;
    if (typeof f.rang === "number" || /^\d+$/.test(String(f.rang || ""))) el = cands[Number(f.rang)] || null;
    else el = cands.find((x) => !String(x.value || "").trim()) || cands.find((x) => String(x.value) === String(r.value)) || null;
    if (!el) {
      if (cands.length) { await report(key, "done", "déjà rempli dans le guichet"); return true; }
      if (deja !== "done") await report(key, "absent");
      return false;
    }
    const valeur = valeurPourChamp(el, r.value);
    if (String(el.value || "").trim() && String(el.value) !== valeur) { await report(key, "done", "déjà rempli dans le guichet, laissé tel quel"); return true; }
    if (String(el.value) === valeur) { await report(key, "done"); return true; }
    await report(key, "filling");
    const res = await fillElement(el, f.type || "text", valeur, sp, false);
    await report(key, res.ok ? "done" : "mismatch", res.detail);
    return true;
  }

  function cliquableParTexte(motifs) {
    const res = (motifs || []).map((m) => new RegExp(m, "i"));
    const els = [...document.querySelectorAll(CLIQUABLES)].filter(visible);
    const trouves = els.map((el) => ({ el, t: norm(el.innerText || el.value || el.getAttribute("aria-label") || el.title || "") }))
      .filter((x) => x.t && x.t.length <= 140 && res.some((r) => r.test(x.t)) && !FORBIDDEN.test(x.t));
    trouves.sort((a, b) => a.t.length - b.t.length);
    return trouves.length ? trouves[0].el : null;
  }

  const empreintePage = () => location.href + "|" + [...document.querySelectorAll(CHAMPS_SAISIE)].filter(visible).map((e) => e.name || e.id || e.type).join(",")
    + "|" + [...document.querySelectorAll(TITRES)].filter(visible).slice(0, 4).map((t) => norm(t.textContent)).join("/");

  async function attendreStable(max) {
    const fin = Date.now() + (max || 8000);
    let avant = empreintePage();
    let stable = 0;
    while (Date.now() < fin && stable < 3) {
      await wait(300);
      const e = empreintePage();
      stable = e === avant ? stable + 1 : 0;
      avant = e;
    }
  }

  async function cliquerPuisAttendre(el, sp, pi) {
    const avant = empreintePage();
    const pos = await moveTo(el, sp);
    mark(el, true);
    ripple(pos.x, pos.y);
    await wait(sp.pause);
    await send({ type: "content.advance", pageIndex: pi }); // gardé AVANT le clic : la page peut se recharger
    await gate();
    el.click();
    const fin = Date.now() + 20000;
    while (Date.now() < fin) {
      await wait(250);
      if (empreintePage() !== avant) break;
    }
    mark(el, false);
    await attendreStable(6000);
  }

  async function boucleAuto(run) {
    const sc = run.scenario;
    const sp = SPEEDS[run.speed] || SPEEDS.normal;
    let pi = run.pageIndex || 0;
    const faites = new Set(run.etapesFaites || []);
    const champs = sc.pages.flatMap((p) => expandFields(p, run.fiche));
    const maxPages = sc.pagesMax || 30;
    while (pi < maxPages) {
      setBanner(`CLAIRE pilote le guichet — page ${pi + 1}`, "running");
      setBlocking(true);
      await attendreStable(8000);
      if (sc.refuserSiNoms) {
        const noms = [...document.querySelectorAll("input, select, textarea")].map((el) => (el.name || el.id || "").split(/[.\[\]_-]/).pop());
        const actuel = sc.attendreNoms ? new RegExp(sc.attendreNoms) : null;
        if (noms.some((n) => new RegExp(sc.refuserSiNoms).test(n)) && !(actuel && noms.some((n) => actuel.test(n)))) {
          throw new Error("Ancien formulaire CERFA affiché : CLAIRE ne le remplit pas. Recommencez la demande sur le formulaire actuel.");
        }
      }
      // (1) Le formulaire n'est pas encore ouvert (aucun champ du scénario sur la page) : étape suivante de l'ouverture.
      const presents = champs.filter((f) => f.type !== "choix" && candidatsChamp(f).length).length;
      if (presents < 2 && !sc.uneSeulePage) {
        const etape = (sc.etapes || []).find((e) => !faites.has(e.label) && cliquableParTexte(e.textes));
        if (etape) {
          faites.add(etape.label);
          await send({ type: "content.etape", label: etape.label });
          await cliquerPuisAttendre(cliquableParTexte(etape.textes), sp, pi + 1);
          pi += 1;
          continue;
        }
      }
      // (2) Les champs de cette page.
      for (const f of champs) await remplirAuto(run, f, sp);
      // (3) Page suivante, ou fin. « Remplir la page affichée » s'arrête ici.
      if (sc.uneSeulePage) {
        await finish("awaiting_human", "Page remplie. Relisez ; passez à la page suivante du guichet puis cliquez de nouveau. Vous validez vous-même.");
        return;
      }
      const suivant = cliquableParTexte(sc.suivant || ["^(suivant|etape suivante|page suivante|continuer)\\b"]);
      if (!suivant) {
        await finish("awaiting_human", "CLAIRE a rempli ce qu’elle connaît. Relisez chaque page, cochez les cases, puis validez et transmettez vous-même.");
        return;
      }
      await cliquerPuisAttendre(suivant, sp, pi + 1);
      pi += 1;
    }
    await finish("awaiting_human", "Arrêt après " + maxPages + " pages : relisez et continuez vous-même.");
  }

  async function start() {
    if (loopActive) return;
    const run = await send({ type: "content.hello" });
    if (!run) return teardown();
    loopActive = true;
    control = run.status === "paused" ? "paused" : "running";
    try {
      if (control === "paused") {
        setBanner("CLAIRE en pause", "paused");
        setBlocking(false);
      }
      await (run.scenario && run.scenario.auto ? boucleAuto(run) : loop(run));
    } catch (e) {
      if (e instanceof Stop) teardown();
      else await finish("error", e && e.message ? e.message : "Erreur inconnue");
    } finally {
      loopActive = false;
    }
  }

  function applyControl(status) {
    control = status;
    if (!loopActive) {
      if (status === "running") start();
      else if (status === "stopped") teardown();
      return;
    }
    if (status === "paused") {
      setBanner("CLAIRE en pause", "paused");
      setBlocking(false);
    } else if (status === "running") {
      setBanner("CLAIRE reprend…", "running");
      setBlocking(true);
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.type === "ping") respond({ ok: true });
    else if (msg.type === "resume") {
      start();
      respond({ ok: true });
    } else if (msg.type === "control") {
      applyControl(msg.status);
      respond({ ok: true });
    }
  });

  start(); // reprise automatique après un changement de page
})();
