// Content script : exécute le scénario sur la page (remplissage, curseur animé, clic sur « Suivant »).
// Les actions passent par le DOM ; le curseur affiché est une animation.
(() => {
  if (window.__claireLoaded) return;
  window.__claireLoaded = true;

  const { resolveField, expandFields, TRANSFORMS } = globalThis.ClaireFiche;

  // Boutons que CLAIRE ne cliquera JAMAIS, quel que soit le scénario. Liste volontairement en dur.
  const FORBIDDEN = /(valider|validation|envoyer|signer|signature|soumettre|confirmer|transmettre|payer|paiement|supprimer|finaliser|certifier|deposer|déposer|depot|dépôt)/i;

  // Champs que CLAIRE n'écrit JAMAIS (étude 16/10, guichet d'Agglopolys) : listes recalculées par le site depuis les cases du CERFA, prix en
  // lettres écrit par le site, cases de déclaration du déclarant. Identifiant ou nom exact.
  // Le code est cherché aussi au bout d'un nom Angular (« vm.saisie.GI1DA1 », « x_FI1C », « …[COMMISSION] »).
  const JAMAIS_ECRIRE = /(^|[._\-\[])(OPLSTPARCELLE|OPLSTCOPRO|COMMISSION|FI1C|GI1DA1|GI5AA1|GI6AA1)($|[_\]\-])/i;
  const interditEcrire = (el) => JAMAIS_ECRIRE.test(el.id || "") || JAMAIS_ECRIRE.test(el.getAttribute("name") || "");
  let saisieDirecte = false; // valeur posée d'un coup (setter natif, input, change, blur) : technique validée sur le guichet d'Agglopolys

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
    if (saisieDirecte || ["date", "number", "datetime-local", "month", "time"].includes(el.type)) {
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
    if (interditEcrire(el)) return { ok: false, detail: "champ calculé par le guichet : jamais écrit par CLAIRE" };
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
      // Le guichet applique lui-même la casse et ses masques (« 92 500 ») : même valeur aux espaces, points et majuscules près.
      const pareil = (x) => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s\u00a0\u202f]/g, "").toLowerCase();
      return el.value === String(value) || pareil(el.value) === pareil(value)
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
    // Guichet d'Agglopolys : <input id="<nomLong>"> — « D1N_nom » pour le code D1N (un code sans « _ » trouve aussi « CODE_… »).
    const prefixe = c.includes("_") ? [] : [`[id^="${c}_"]`];
    return [`[name="${c}"]`, `#${c}`, `[name$=".${c}"]`, `[name$="_${c}"]`, `[name$="[${c}]"]`, `[id$="_${c}"]`, `[id$="-${c}"]`, ...prefixe].join(", ");
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
  // Étapes d'ouverture et « Suivant » : de vrais boutons et liens seulement — jamais un libellé, une case ou une option du formulaire.
  const CLIQUABLES = 'a[href], button, [role=button], [role=link], [role=tab], [role=menuitem], input[type=button], input[type=submit]';
  // Libellé et rubrique relus une seule fois par page (vidé à chaque nouvelle page).
  let memo = new Map();
  const memoiser = (genre, el, calcul) => {
    let m = memo.get(el);
    if (!m) { m = {}; memo.set(el, m); }
    if (!(genre in m)) m[genre] = calcul(el);
    return m[genre];
  };
  // Un nœud qui appartient à la navigation (menu, fil d'Ariane, frise des étapes) ne fait pas la rubrique d'un champ.
  const HORS_RUBRIQUE = "nav, [role=navigation], header, footer, .breadcrumb, .stepper, .steps, .wizard-steps, .progress, [class*=stepper], [class*=etapes], [class*=breadcrumb]";

  function texteSansChampsNoeud(n) {
    const c = n.cloneNode(true);
    c.querySelectorAll("input, select, textarea, option").forEach((x) => x.remove());
    return c.textContent || "";
  }

  // Le libellé d'un champ : <label for>, label englobant, aria-label(ledby), placeholder, titre, sinon le texte juste avant lui.
  function libelleChamp(el) { return memoiser("l", el, libelleChampCalcul); }
  function libelleChampCalcul(el) {
    const parts = [];
    if (el.id) [...document.querySelectorAll("label[for]")].filter((l) => l.htmlFor === el.id).forEach((l) => parts.push(texteSansChampsNoeud(l)));
    const englobant = el.closest("label");
    if (englobant) parts.push(texteSansChampsNoeud(englobant));
    if (el.getAttribute("aria-labelledby")) el.getAttribute("aria-labelledby").split(/\s+/).forEach((id) => { const n = document.getElementById(id); if (n) parts.push(n.textContent); });
    parts.push(el.getAttribute("aria-label") || "", el.getAttribute("placeholder") || "", el.title || "");
    if (!parts.some((p) => norm(p))) {
      let prec = el.previousElementSibling;
      for (let i = 0; prec && i < 3 && !norm(prec.textContent); i++) prec = prec.previousElementSibling;
      // Le libellé d'un AUTRE champ (<label for> d'un autre, ou bloc qui contient déjà son champ) n'est pas celui-ci.
      const autre = prec && ((prec.tagName === "LABEL" && prec.htmlFor && prec.htmlFor !== el.id) || prec.matches(CHAMPS_SAISIE) || prec.querySelector(CHAMPS_SAISIE));
      if (prec && !autre) parts.push(texteSansChampsNoeud(prec));
      else if (prec) { /* rien : libellé inconnu plutôt qu'emprunté */ }
      else if (el.parentElement) {
        const cellule = el.closest("td, .col, [class*=col-], .form-group, .field, .champ");
        const avant = cellule && cellule.previousElementSibling;
        if (avant) parts.push(texteSansChampsNoeud(avant));
        else if (el.parentElement.previousElementSibling) parts.push(texteSansChampsNoeud(el.parentElement.previousElementSibling));
      }
    }
    return norm(parts.filter(Boolean).join(" ")).slice(0, 160);
  }

  // La rubrique d'un champ : la légende de son fieldset le plus proche, sinon le titre le plus proche avant lui dans le même formulaire
  // (hors menus et frise des étapes), accompagné du titre de niveau supérieur qui le contient (« Adresse » sous « Propriétaire »).
  // Jamais un titre d'une rubrique déjà refermée, ni l'empilement de tous les titres de la page.
  function rubriqueChamp(el) { return memoiser("r", el, rubriqueChampCalcul); }
  function rubriqueChampCalcul(el) {
    const fs = el.closest("fieldset");
    const lg = fs && [...fs.children].find((c) => c.tagName === "LEGEND");
    if (lg) {
      const parent = fs.parentElement && fs.parentElement.closest("fieldset");
      const lgp = parent && [...parent.children].find((c) => c.tagName === "LEGEND");
      return norm((lgp ? lgp.textContent + " " : "") + lg.textContent);
    }
    const cadre = el.closest("form, main, [role=main]") || document.body;
    const niveau = (t) => (/^H[1-6]$/.test(t.tagName) ? Number(t.tagName[1]) : t.getAttribute("aria-level") ? Number(t.getAttribute("aria-level")) : 7);
    const avant = [...cadre.querySelectorAll(TITRES)].filter((t) => t.tagName !== "LEGEND" && t.tagName !== "CAPTION" && !t.contains(el)
      && !t.closest(HORS_RUBRIQUE) && (t.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (!avant.length) {
      const cap = el.closest("table") && el.closest("table").querySelector("caption");
      return norm(cap ? cap.textContent : "");
    }
    const proche = avant[avant.length - 1];
    const nv = niveau(proche);
    let dessus = null;
    for (let i = avant.length - 2; i >= 0; i--) if (niveau(avant[i]) < nv) { dessus = avant[i]; break; }
    return norm((dessus ? dessus.textContent + " " : "") + proche.textContent);
  }

  function candidatsParCode(f) {
    if (!f.code) return [];
    const sel = selecteurCode(f.code);
    return sel ? [...document.querySelectorAll(CHAMPS_SAISIE)].filter(visible).filter((el) => el.matches(sel)) : [];
  }

  function candidatsChamp(f) {
    const tous = [...document.querySelectorAll(CHAMPS_SAISIE)].filter(visible);
    const parCode = candidatsParCode(f);
    if (parCode.length) return parCode;
    if (!f.libelles || !f.libelles.length) return [];
    const res = f.libelles.map((x) => new RegExp(x, "i"));
    const sec = f.rubrique ? new RegExp(f.rubrique, "i") : null;
    const horsSec = f.horsRubrique ? new RegExp(f.horsRubrique, "i") : null;
    return tous.filter((el) => {
      if (f.type === "choix" ? !(el.type === "radio" || el.type === "checkbox") : (el.type === "radio" || el.type === "checkbox")) return false;
      const l = libelleChamp(el);
      if (!l || !res.some((r) => r.test(l))) return false;
      if (f.horsLibelles && new RegExp(f.horsLibelles, "i").test(l)) return false;
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

  // L'état d'un champ est gardé aussi dans la copie locale de la saisie : un champ rempli sur une page n'est plus repris (ni dit « absent »)
  // sur les pages suivantes.
  function noter(run, key, state, detail) {
    run.fields = run.fields || {};
    run.fields[key] = { state, detail: detail || "" };
    return report(key, state, detail);
  }

  // Modèle du formulaire (Agglopolys), relu une fois par page : { code, page, tabindex, libelle }.
  let modelePage = undefined;
  async function modeleGuichet() {
    if (modelePage === undefined) {
      const r = await send({ type: "content.modele" });
      modelePage = r && Array.isArray(r.modele) ? r.modele : null;
    }
    return modelePage;
  }
  // Le code du n-ième champ d'une famille (« BI3S » : section de chaque ligne de parcelle) dans l'ordre du formulaire — page puis ordre de
  // tabulation (étude 16/10 : « autant de parcelles qu'il y en a dans la fiche », chacune à sa ligne). Sans modèle : le code prévu.
  async function codeDeFamille(f) {
    if (!f.famille) return f.code;
    const m = await modeleGuichet();
    if (!m) return null; // pas de modèle lisible : le code prévu et son rang parmi les champs de ce code
    // Code d'une ligne de la famille seulement : « BI3S » + code de ligne (« A1 », « B5 »), « T2S » ou « T2S2 » — jamais un autre champ qui
    // commence pareil (« T2Ttotal »…), qui décalerait les lignes.
    const motif = new RegExp("^" + f.famille + "(?:[A-Z]?\\d+)?$");
    const codes = m.filter((x) => motif.test(x.code) && !x.lecture && !JAMAIS_ECRIRE.test(x.code))
      .sort((a, b) => a.page - b.page || a.tabindex - b.tabindex || a.code.localeCompare(b.code, undefined, { numeric: true }));
    const x = codes[Number(f.rang) || 0];
    return x ? x.code : "";
  }

  // Pièce jointe : le plan cadastral du dossier du NAS, posé dans le champ de fichier du guichet dont la ligne parle du plan.
  async function joindrePlan(run, f, key, sp) {
    const res = (f.piece || []).map((m) => new RegExp(m, "i"));
    const autre = /plan de masse|financement|plan de coupe|facade|photo/;
    // La ligne propre à CE champ : le plus proche bloc qui ne contient aucun autre champ de fichier.
    const zone = (el) => {
      for (let n = el.parentElement, k = 0; n && k < 6; n = n.parentElement, k++) {
        if (n.querySelectorAll('input[type=file]').length > 1) return "";
        const t = norm((n.innerText || "").slice(0, 300));
        if (t) return t;
      }
      return "";
    };
    const vise = (x) => { const t = libelleChamp(x) || zone(x); return !!t && !autre.test(t) && res.some((r) => r.test(t)); };
    const trouves = [...document.querySelectorAll('input[type=file]')].filter(vise);
    if (!trouves.length) return false;
    if (trouves.length > 1) { if (((run.fields || {})[key] || {}).state !== "manuel") await noter(run, key, "manuel", "plusieurs champs de pièce parlent du plan : joignez-le vous-même"); return false; }
    const el = trouves[0];
    if (el.files && el.files.length) { await noter(run, key, "done", "pièce déjà jointe dans le guichet, laissée telle quelle"); return true; }
    await noter(run, key, "filling");
    const r = await send({ type: "content.plan" });
    if (!r || r.erreur || !r.b64) { await noter(run, key, "manuel", (r && r.erreur) || "plan introuvable : joignez-le vous-même"); return false; }
    const bin = atob(r.b64);
    const octets = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    const fichier = new File([octets], r.nom || "Plan cadastral.pdf", { type: "application/pdf" });
    const dt = new DataTransfer();
    dt.items.add(fichier);
    const cible = visible(el) ? el : (el.closest("label, .btn, button, div") || el);
    try { const pos = await moveTo(cible, sp); ripple(pos.x, pos.y); } catch (_) { /* champ caché : pas de curseur */ }
    el.files = dt.files;
    fire(el, "input");
    fire(el, "change");
    await wait(sp.pause);
    await noter(run, key, el.files && el.files.length ? "done" : "mismatch", el.files && el.files.length ? `Plan cadastral.pdf joint${r.source ? " (" + r.source + ")" : ""}` : "le guichet n’a pas pris le fichier");
    return true;
  }

  async function remplirAuto(run, f0, sp) {
    // Champ d'une famille (lignes de parcelles) : son code est relu dans le modèle du formulaire.
    const codeFamille = f0.famille ? await codeDeFamille(f0) : null;
    // Sans modèle : un code de ligne déjà précis (« BI3SA2 ») se prend seul ; un code de famille (« T2S ») garde son rang parmi ses champs.
    const f = f0.famille && codeFamille !== null ? Object.assign({}, f0, { code: codeFamille, rang: undefined })
      : f0.famille && f0.code !== f0.famille ? Object.assign({}, f0, { rang: undefined }) : f0;
    const key = cleChamp(0, f.label, f);
    const deja = run.fields && run.fields[key] && run.fields[key].state;
    // Plusieurs pages : un champ rempli sur une page précédente ne l'est jamais une seconde fois sur une autre (un bloc « second
    // propriétaire » ou un récapitulatif aux mêmes libellés ne reçoit pas la valeur une seconde fois).
    if (deja === "done" && !run.scenario.uneSeulePage) return false;
    if (f.type === "fichier") return joindrePlan(run, f, key, sp);
    if (f0.famille && codeFamille === "") {
      // Le formulaire n'a plus de ligne pour cette parcelle (CUa : 3, DIA : 14) : l'annexe du guichet se remplit à la main.
      if (deja !== "done" && deja !== "manuel") await noter(run, key, "manuel", "plus de ligne de parcelle dans le formulaire : annexe à saisir (Copier « Toutes les parcelles »)");
      return false;
    }
    const r = resolveField(f, run.fiche);
    if (r.missing) { if (deja !== "done") await noter(run, key, f.optional ? "skipped" : "missing"); return false; }
    if (r.invalid) { await noter(run, key, "mismatch", r.error); return false; }
    if (f.type === "case") {
      // Case du CERFA (étude 16/10) : un vrai clic quand la fiche dit oui ; jamais décochée, jamais devinée.
      if (r.value !== true) { if (deja !== "done") await noter(run, key, "skipped"); return false; }
      const sel = selecteurCode(f.code);
      const el = sel ? [...document.querySelectorAll(sel)].find((x) => (x.type === "checkbox" || x.type === "radio") && (visible(x) || (x.labels && [...x.labels].some(visible)))) : null;
      if (!el) { if (deja !== "done") await noter(run, key, "absent"); return false; }
      if (el.checked) { await noter(run, key, "done"); return true; }
      if (interditEcrire(el)) { await noter(run, key, "manuel", "case de déclaration : jamais cochée par CLAIRE"); return false; }
      // Bouton radio : un choix déjà fait dans le même groupe (par vous ou par le guichet) n'est jamais remplacé.
      if (el.type === "radio" && el.name && [...document.querySelectorAll('input[type=radio]')].some((x) => x.name === el.name && x.checked)) {
        await noter(run, key, "done", "choix déjà fait dans le guichet, laissé tel quel"); return true;
      }
      await noter(run, key, "filling");
      const cible = (el.labels && [...el.labels].find(visible)) || el;
      const pos = await moveTo(cible, sp); ripple(pos.x, pos.y); el.click(); await wait(sp.pause);
      await noter(run, key, el.checked ? "done" : "mismatch", el.checked ? "" : "case non cochée");
      return true;
    }
    if (f.type === "choix") {
      // Bouton radio / case dont le libellé dit la valeur (« Personne morale ») : un vrai clic.
      const motif = f.choix && f.choix[String(r.value)];
      if (!motif) return false;
      const re = new RegExp(motif, "i");
      const sec = f.rubrique ? new RegExp(f.rubrique, "i") : null;
      const horsSec = f.horsRubrique ? new RegExp(f.horsRubrique, "i") : null;
      const el = [...document.querySelectorAll('input[type=radio], input[type=checkbox]')].filter((x) => visible(x) || (x.labels && [...x.labels].some(visible)))
        .find((x) => re.test(libelleChamp(x)) && (!sec || sec.test(rubriqueChamp(x))) && !(horsSec && horsSec.test(rubriqueChamp(x))));
      if (!el) { if (deja !== "done") await noter(run, key, "absent"); return false; }
      if (interditEcrire(el)) { await noter(run, key, "manuel", "case de déclaration : jamais cochée par CLAIRE"); return false; }
      if (!el.checked && el.type === "radio" && el.name && [...document.querySelectorAll('input[type=radio]')].some((x) => x.name === el.name && x.checked)) {
        await noter(run, key, "done", "choix déjà fait dans le guichet, laissé tel quel"); return true;
      }
      if (!el.checked) { await noter(run, key, "filling"); const cible = (el.labels && [...el.labels].find(visible)) || el; const pos = await moveTo(cible, sp); ripple(pos.x, pos.y); el.click(); await wait(sp.pause); }
      await noter(run, key, el.checked ? "done" : "mismatch", el.checked ? "" : "case non cochée");
      return true;
    }
    // Emplacement pas encore connu (ni code ni libellé) : la valeur se copie depuis le panneau.
    if (!f.code && !(f.libelles && f.libelles.length)) { if (deja !== "manuel") await noter(run, key, "manuel", "à coller à la main (bouton Copier du panneau)"); return false; }
    const cands = candidatsChamp(f);
    let el = null;
    if (typeof f.rang === "number" || /^\d+$/.test(String(f.rang || ""))) el = cands[Number(f.rang)] || null;
    else if (f.code && cands.length && candidatsParCode(f).length) {
      // Par code : le champ de CE code (identifiant ou nom exact), sinon le seul champ qui commence par lui — jamais « le premier vide »
      // parmi plusieurs (un champ voisin du même préfixe recevrait la valeur).
      const exact = cands.find((x) => x.id === f.code || x.getAttribute("name") === f.code);
      el = exact || (cands.length === 1 ? cands[0] : null);
      if (!el) { await noter(run, key, "manuel", "plusieurs champs portent ce code : à saisir à la main"); return false; }
    }
    else el = cands.find((x) => !String(x.value || "").trim()) || cands.find((x) => String(x.value) === String(r.value)) || null;
    if (!el && f.rang !== undefined && f.rang !== null && f.rang !== "") {
      // Rang au-delà des lignes du formulaire (parcelle de trop) : jamais « fait » — l'annexe se remplit à la main.
      if (deja !== "manuel") await noter(run, key, cands.length ? "manuel" : "absent", cands.length ? "plus de ligne de parcelle dans le formulaire : annexe à saisir (Copier « Toutes les parcelles »)" : "");
      return false;
    }
    if (!el) {
      if (cands.length) { await noter(run, key, "done", "déjà rempli dans le guichet"); return true; }
      if (deja !== "done") await noter(run, key, "absent");
      return false;
    }
    const valeur = valeurPourChamp(el, r.value);
    if (String(el.value || "").trim() && String(el.value) !== valeur) { await noter(run, key, "done", "déjà rempli dans le guichet, laissé tel quel"); return true; }
    if (String(el.value) === valeur) { await noter(run, key, "done"); return true; }
    await noter(run, key, "filling");
    const res = await fillElement(el, f.type || "text", valeur, sp, false);
    await noter(run, key, res.ok ? "done" : "mismatch", res.detail);
    return true;
  }

  // Ce qui rend un bouton interdit : son texte, mais aussi son identifiant, son nom et l'adresse où il envoie le formulaire
  // (« Suivant » d'identifiant btnValider, nom « transmettre »…).
  const attributsBouton = (el) => [el.id, el.getAttribute("name"), el.getAttribute("formaction"), el.getAttribute("ng-click"), el.getAttribute("data-ng-click")].filter(Boolean).join(" ");
  const texteBouton = (el) => norm(el.innerText || el.value || el.getAttribute("aria-label") || el.title || "");

  // Un bouton ou un lien dont le texte répond à l'un des motifs, le plus court d'abord. `lienSeul` : seulement un lien de
  // navigation (<a href>) — pour une étape dont le texte contient un mot de la liste noire (« Déposer une demande » de l'accueil).
  function cliquableParTexte(motifs, options) {
    const o = options || {};
    const res = (motifs || []).map((m) => new RegExp(m, "i"));
    const els = [...document.querySelectorAll(CLIQUABLES)].filter(visible).filter((el) => !el.closest(HORS_RUBRIQUE) || o.navigation);
    const trouves = els.map((el) => ({ el, t: texteBouton(el) }))
      .filter((x) => x.t && x.t.length <= 140 && res.some((r) => r.test(x.t)))
      .filter((x) => !FORBIDDEN.test(norm(attributsBouton(x.el))))
      .filter((x) => {
        if (!FORBIDDEN.test(x.t)) return true;
        // Seule exception : une étape d'ouverture, sur un vrai lien de navigation, avant que le formulaire soit ouvert.
        return !!o.lienSeul && x.el.tagName === "A" && !!x.el.getAttribute("href") && !/^javascript:/i.test(x.el.getAttribute("href"));
      });
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

  async function cliquerPuisAttendre(el, sp, pi, attenteMax) {
    const avant = empreintePage();
    const pos = await moveTo(el, sp);
    mark(el, true);
    ripple(pos.x, pos.y);
    await wait(sp.pause);
    await send({ type: "content.advance", pageIndex: pi }); // gardé AVANT le clic : la page peut se recharger
    await gate();
    el.click();
    const fin = Date.now() + (attenteMax || 20000);
    let change = false;
    while (Date.now() < fin) {
      await wait(250);
      if (empreintePage() !== avant) { change = true; break; }
    }
    mark(el, false);
    await attendreStable(6000);
    memo = new Map();
    return change;
  }

  // ---------- Guichet d'Agglopolys : entrée dans la démarche (étude 16/10) ----------
  const FENETRES = ".modal, [role=dialog], .modal-dialog, .ngdialog, .popup";
  const fenetresVisibles = () => [...document.querySelectorAll(FENETRES)].filter(visible);
  // « Valider », « Déposer »… sont dans la liste noire ; seule exception ici, nommée : « Valider la commune de dépôt » DANS sa fenêtre.
  function boutonDansFenetre(fen, motifs) {
    const res = motifs.map((m) => new RegExp(m, "i"));
    return [...fen.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit], [ng-click]')].filter(visible)
      .find((b) => res.some((r) => r.test(texteBouton(b))) && !/transmet|sign|envoy|pay|supprim|soumet/.test(norm(texteBouton(b) + " " + attributsBouton(b)))) || null;
  }
  function memeCommune(a, b) {
    const n = (x) => norm(x).replace(/[-']/g, " ").replace(/\(.*?\)/g, " ").replace(/\bst\b/g, "saint").replace(/\bste\b/g, "sainte").replace(/\s+/g, " ").trim();
    return n(a) && n(a) === n(b);
  }

  // Une étape de l'entrée : rend « fait » quand elle a agi (la boucle relit la page), « rien » sinon. Lève une erreur si la session a expiré.
  // Mots qui interdisent un bouton d'entrée : toute la liste noire sauf « déposer / dépôt » (« Déposer une demande » de l'accueil) ; « certificat »
  // reste permis (« certifier » non).
  const INTERDIT_ENTREE = /(valid|envoy|sign|soumet|confirm|transmet|payer|paiement|supprim|finalis|certifi(?!cat))/;
  const boutonEntreeInterdit = (b) => INTERDIT_ENTREE.test(norm(texteBouton(b) + " " + attributsBouton(b)));

  async function entreeAgglopolys(run, sp, ouvert, pi) {
    const e = run.scenario.entree;
    const fens = fenetresVisibles();
    const txt = (el) => norm(el.innerText || el.textContent || "");
    if (e.sessionExpiree && (fens.some((f) => new RegExp(e.sessionExpiree, "i").test(txt(f))) || [...document.querySelectorAll("h1, h2, h3, h4, .modal-title")].filter(visible).some((t) => new RegExp(e.sessionExpiree, "i").test(txt(t))))) {
      throw new Error("Session du guichet expirée : reconnectez-vous vous-même (CLAIRE ne saisit jamais d’identifiant), puis relancez CLAIRE — le brouillon est repris.");
    }
    // « Voulez-vous vous déconnecter ? » : toujours NON ; « récupérer les données non sauvegardées ? » : NON à l'entrée seulement (une fois le
    // brouillon ouvert, la fenêtre est laissée à l'étude — elle pourrait reprendre une saisie faite à la main).
    const motifsNon = (e.fenetresNon || []).concat(ouvert ? [] : (e.fenetresNonEntree || []));
    for (const f of fens) {
      if (motifsNon.some((m) => new RegExp(m, "i").test(txt(f)))) {
        const non = boutonDansFenetre(f, ["^non$"]);
        if (non) { await cliquerPuisAttendre(non, sp, pi, 3000); return "fait"; }
      }
    }
    if (ouvert) {
      // Brouillon refermé par un rechargement : il est rouvert par son adresse.
      if (run.urlSaisie && !location.hash.startsWith(e.urlSaisie) && run.urlSaisie.startsWith(location.origin + "/") && !(run.urlSaisie === location.href)) {
        // Deux essais au plus par saisie (le brouillon a pu être transmis ou supprimé : le guichet renverrait à l'accueil sans fin).
        let essais = 0;
        try { essais = Number(sessionStorage.getItem("claire-brouillon-" + run.id) || 0); sessionStorage.setItem("claire-brouillon-" + run.id, String(essais + 1)); } catch (_) { essais = 0; }
        if (essais >= 2) {
          await send({ type: "content.oublierBrouillon" });
          await finish("awaiting_human", "Le brouillon connu de ce dossier ne s’ouvre plus (transmis ou supprimé ?) : ouvrez-le vous-même, ou commencez une nouvelle demande, puis relancez CLAIRE.");
          return "fin";
        }
        location.href = run.urlSaisie;
        await attendreStable(8000);
        return "fait";
      }
      return "rien";
    }
    if (location.hash.startsWith(e.urlSaisie)) return "rien";
    // Fenêtre « Sélectionner une commune de dépôt ».
    const select = document.querySelector(e.commune.selecteur);
    if (select && visible(select)) {
      const commune = getByPathLocal(run.fiche, e.commune.source);
      const opts = [...select.options].filter((o) => memeCommune(o.text, commune));
      if (!commune || opts.length !== 1) {
        await finish("awaiting_human", `Choisissez vous-même la commune de dépôt${commune ? ` (${commune})` : ""}, validez, puis relancez CLAIRE.`);
        return "fin";
      }
      const pos = await moveTo(select, sp); ripple(pos.x, pos.y);
      setNativeSelect(select, opts[0].value);
      await wait(sp.pause);
      const fen = select.closest(FENETRES) || document;
      const valider = boutonDansFenetre(fen, e.commune.valider);
      if (!valider) { await finish("awaiting_human", "Commune choisie : cliquez vous-même « Valider la commune de dépôt », puis relancez CLAIRE."); return "fin"; }
      await send({ type: "content.etape", label: "Commune de dépôt" });
      await cliquerPuisAttendre(valider, sp, pi);
      return "fait";
    }
    // Accueil : le bouton de la démarche, dans la zone « Formuler » seulement (jamais toute la page, jamais une liste « Mes demandes » : un
    // brouillon d'un autre dossier serait ouvert). L'accueil se dessine après « Traitements en cours » : CLAIRE l'attend (20 s au plus) au
    // lieu d'abandonner au premier regard (vidéo de l'étude, 17/10 : « il ne trouve pas la partie Formuler à chaque fois »).
    const res = e.bouton.map((m) => new RegExp(m, "i"));
    let b = null;
    for (const fin = Date.now() + 20000; !b && Date.now() < fin;) {
      b = boutonFormuler(res);
      if (!b) { await wait(500); if (location.hash.startsWith(e.urlSaisie) || fenetresVisibles().length) return "fait"; }
    }
    if (b) {
      await send({ type: "content.etape", label: run.scenario.name });
      await cliquerPuisAttendre(b, sp, pi);
      return "fait";
    }
    await finish("awaiting_human", "CLAIRE ne trouve pas la démarche dans la zone « Formuler » : ouvrez l’accueil du guichet ou le brouillon, puis relancez CLAIRE.");
    return "fin";
  }
  // Le bouton de la démarche (« CUa », « DIA ») dans la zone « Formuler ». Sur le guichet d'Agglopolys, « FORMULER » est un bandeau (pas un
  // titre) suivi de boutons ronds : la zone est le plus petit bloc qui contient ce bandeau ET un bouton de la démarche, sans contenir la zone
  // « Suivre » (« Mes demandes d'urbanisme », dont les cartes « CUA » ouvriraient le brouillon d'un autre dossier).
  const CLIQUABLES_ENTREE = 'button, a, [role=button], [ng-click], [data-ng-click], [onclick]';
  function boutonFormuler(res) {
    const okTexte = (t) => t && t.length <= 90 && res.some((r) => r.test(t));
    const dansZone = (z) => {
      const cands = [...z.querySelectorAll(CLIQUABLES_ENTREE)].filter(visible).filter((x) => okTexte(texteBouton(x)) && !boutonEntreeInterdit(x));
      if (cands.length) return cands.sort((a, b2) => texteBouton(a).length - texteBouton(b2).length)[0];
      // Bouton dessiné sans balise de bouton (cercle cliquable) : le plus petit élément dont le texte est exactement la démarche.
      const nus = [...z.querySelectorAll("div, span, p, li, img")].filter(visible)
        .filter((x) => x.children.length <= 2 && okTexte(norm(x.innerText || x.getAttribute("alt") || x.title || "")) && !boutonEntreeInterdit(x));
      return nus.find((x) => !nus.some((y) => y !== x && x.contains(y))) || null;
    };
    const bandeaux = [...document.querySelectorAll("body *")].filter((el) => el.children.length <= 4 && visible(el) && !el.closest("#claire-overlay")
      && /^formuler\b/.test(norm(el.textContent)) && norm(el.textContent).length <= 90);
    for (const bandeau of bandeaux.filter((x) => !bandeaux.some((y) => y !== x && x.contains(y)))) {
      for (let z = bandeau.parentElement, k = 0; z && z !== document.body && k < 8; z = z.parentElement, k++) {
        if (/\b(suivre|mes demandes)\b/.test(norm([...z.querySelectorAll("*")].filter((x) => x.children.length <= 4).map((x) => x.textContent).filter((t) => norm(t).length <= 60).join(" | ")))) break;
        const btn = dansZone(z);
        if (btn) return btn;
      }
    }
    return null;
  }

  // ---------- Assistants du guichet : adresse et références cadastrales (vidéo de l'étude, 17/10) ----------
  // Sur le guichet d'Agglopolys, l'adresse du terrain et les parcelles ne se tapent pas dans le CERFA : un clic sur le champ ouvre
  // l'« Assistant de saisie d'adresse » (recherche → proposition → « Je valide mon adresse ») ou l'« Assistant de saisie des références
  // cadastrales » (Préfixe, Section, Numéro, Superficie → « Ajouter la parcelle », une par une → « Valider »). CLAIRE les remplit comme
  // l'étude : jamais par-dessus une adresse ou des parcelles déjà là ; « Valider » et « Je valide mon adresse » cliqués DANS leur assistant
  // seulement (seules exceptions nommées à la liste noire, comme la commune de dépôt).
  async function fenetreTitree(titre, max) {
    const re = new RegExp(titre, "i");
    for (const fin = Date.now() + (max || 5000); Date.now() < fin;) {
      const f = fenetresVisibles().find((x) => re.test(norm(x.innerText || "").slice(0, 200)));
      if (f) return f.closest(".modal") || f;
      await wait(200);
    }
    return null;
  }
  const champsVisibles = (fen) => [...fen.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea')].filter(visible);
  function champParLibelle(fen, motif) {
    const re = new RegExp(motif, "i");
    return champsVisibles(fen).find((el) => re.test(libelleChamp(el) || el.getAttribute("placeholder") || "")) || null;
  }
  const valeurChampCode = (code) => { const sel = selecteurCode(code); const el = sel ? elementCible(sel, {}) : null; return el ? String(el.value || "").trim() : null; };
  async function fermerFenetre(fen, sp) {
    const fermer = boutonDansFenetre(fen, ["^fermer$", "^annuler$"]);
    if (fermer) await cliquerPuisAttendre(fermer, sp, 0, 3000);
  }
  async function ouvrirAssistant(as, sp) {
    const sel = (as.declencheur || []).map(selecteurCode).filter(Boolean).join(", ");
    const el = sel ? [...document.querySelectorAll(sel)].find(visible) : null;
    if (!el) return null;
    const pos = await moveTo(el, sp); ripple(pos.x, pos.y);
    el.focus(); el.click();
    return fenetreTitree(as.titre, 5000);
  }

  async function assistantAdresse(run, as, sp) {
    const t = getByPathLocal(run.fiche, as.source) || {};
    const voie = String(t.voie || "").trim();
    if (!voie && !t.lieuDit) return { etat: "skipped", detail: "pas d’adresse sur la fiche" };
    const deja = valeurChampCode(as.voieCode);
    if (deja === null) return null; // pas sur cette page
    if (deja) return { etat: "done", detail: "adresse déjà saisie dans le guichet, laissée telle quelle" };
    const fen = await ouvrirAssistant(as, sp);
    if (!fen) return { etat: "absent", detail: "l’assistant d’adresse ne s’est pas ouvert" };
    const recherche = champParLibelle(fen, "rechercher une adresse") || champsVisibles(fen)[0];
    if (!recherche) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "assistant d’adresse : champ de recherche introuvable" }; }
    const requete = [t.numero, voie, t.codePostal, t.commune].filter(Boolean).join(" ");
    const lent = saisieDirecte; saisieDirecte = false; // la liste du guichet ne se déroule qu'à la frappe
    try {
      const pos = await moveTo(recherche, sp); ripple(pos.x, pos.y);
      recherche.focus(); setNativeValue(recherche, ""); fire(recherche, "input");
      for (const ch of requete) { setNativeValue(recherche, recherche.value + ch); fire(recherche, "input", { inputType: "insertText", data: ch }); fire(recherche, "keyup"); await wait(Math.max(sp.type, 25)); }
    } finally { saisieDirecte = lent; }
    // La proposition qui porte le numéro, les mots de la voie et le code postal (ou la commune) de la fiche — jamais « la première ».
    const mots = norm(voie).split(" ").filter((m) => m.length > 2);
    const conforme = (txt) => { const x = norm(txt); return mots.every((m) => x.includes(m)) && (!t.numero || new RegExp("(^|\\D)" + String(t.numero).replace(/\D/g, "") + "(\\D|$)").test(x))
      && ((t.codePostal && x.includes(String(t.codePostal))) || (t.commune && x.includes(norm(t.commune)))); };
    let choix = null;
    for (const fin = Date.now() + 8000; !choix && Date.now() < fin;) {
      await wait(300);
      const props = [...document.querySelectorAll('[role=option], .dropdown-menu li, .uib-typeahead-match, ul.typeahead li, .ui-menu-item, .autocomplete li, ul li a')]
        .filter(visible).filter((x) => !x.closest("#claire-overlay") && (fen.contains(x) || x.closest(".dropdown-menu, [role=listbox]")) && conforme(x.innerText || ""));
      if (props.length === 1 || (props.length > 1 && props.every((x) => norm(x.innerText) === norm(props[0].innerText)))) choix = props[0];
      else if (props.length > 1) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "plusieurs adresses proposées par le guichet : choisissez-la vous-même" }; }
    }
    if (!choix) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: `aucune adresse proposée ne correspond à « ${requete} » : saisissez-la vous-même dans l’assistant` }; }
    const cible = choix.querySelector("a") || choix;
    let pos = await moveTo(cible, sp); ripple(pos.x, pos.y); cible.click();
    await wait(Math.max(sp.pause, 600));
    if (t.lieuDit) { const ld = champParLibelle(fen, "^lieu-?dit"); if (ld && !String(ld.value || "").trim()) await typeInto(ld, String(t.lieuDit), sp); }
    const valider = boutonDansFenetre(fen, ["^je valide mon adresse$"]);
    if (!valider) { return { etat: "manuel", detail: "adresse choisie : cliquez vous-même « Je valide mon adresse »" }; }
    pos = await moveTo(valider, sp); ripple(pos.x, pos.y);
    await send({ type: "content.etape", label: "Assistant d’adresse" });
    valider.click();
    for (const fin = Date.now() + 5000; visible(fen) && Date.now() < fin;) await wait(200);
    await attendreStable(3000); memo = new Map();
    const apres = valeurChampCode(as.voieCode);
    return apres ? { etat: "done", detail: "adresse saisie par l’assistant du guichet" } : { etat: "mismatch", detail: "l’assistant n’a pas rempli l’adresse : vérifiez-la" };
  }

  async function assistantParcelles(run, as, sp) {
    const parcelles = (getByPathLocal(run.fiche, as.source) || []).filter((p) => p && p.section && p.numero);
    if (!parcelles.length) return { etat: "skipped", detail: "pas de parcelle sur la fiche" };
    const deja = valeurChampCode(as.sectionCode);
    if (deja === null) return null;
    if (deja) return { etat: "done", detail: "parcelles déjà saisies dans le guichet, laissées telles quelles" };
    const fen = await ouvrirAssistant(as, sp);
    if (!fen) return { etat: "absent", detail: "l’assistant des références cadastrales ne s’est pas ouvert" };
    const champ = (m) => champParLibelle(fen, m);
    const lignes = () => [...fen.querySelectorAll("table tbody tr, table tr")].filter(visible).map((tr) => norm(tr.innerText)).filter((x) => /\d/.test(x));
    const surfaceDe = (p) => { try { return p.surface === undefined || p.surface === "" ? "" : TRANSFORMS.surface(p.surface); } catch (_) { return ""; } };
    let ajoutees = 0;
    const manquees = [];
    for (const p of parcelles) {
      await gate();
      const sec = String(p.section).toUpperCase().trim();
      const num = String(p.numero).replace(/^0+(?=\d)/, "").trim();
      // Déjà dans le tableau de l'assistant : jamais deux fois.
      if (lignes().some((l) => new RegExp("(^| )" + sec.toLowerCase() + " " + num + "( |$)").test(l))) continue;
      const surf = surfaceDe(p);
      if (!surf) { manquees.push(`${sec} ${num} (superficie inconnue)`); continue; }
      const cSec = champ("^section"), cNum = champ("^numero"), cSurf = champ("^superficie"), cPre = champ("^prefixe");
      if (!cSec || !cNum || !cSurf) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "assistant des parcelles : champs Section / Numéro / Superficie introuvables" }; }
      const avant = lignes().length;
      if (cPre && p.prefixe && !/^0*$/.test(String(p.prefixe))) await typeInto(cPre, String(p.prefixe), sp);
      await typeInto(cSec, sec, sp);
      await typeInto(cNum, num, sp);
      await typeInto(cSurf, surf, sp);
      const ajouter = boutonDansFenetre(fen, ["^ajouter la parcelle"]);
      if (!ajouter) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "bouton « Ajouter la parcelle » introuvable" }; }
      const pos = await moveTo(ajouter, sp); ripple(pos.x, pos.y); ajouter.click();
      let ok = false;
      for (const fin = Date.now() + 4000; !ok && Date.now() < fin;) { await wait(200); ok = lignes().length > avant; }
      if (!ok) { manquees.push(`${sec} ${num}`); continue; }
      ajoutees++;
    }
    if (!ajoutees && !lignes().length) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "aucune parcelle ajoutée : " + manquees.join(", ") }; }
    const valider = boutonDansFenetre(fen, ["^valider$"]);
    if (!valider) return { etat: "manuel", detail: "parcelles ajoutées : cliquez vous-même « Valider » dans l’assistant" };
    const pos = await moveTo(valider, sp); ripple(pos.x, pos.y);
    await send({ type: "content.etape", label: "Assistant des références cadastrales" });
    valider.click();
    for (const fin = Date.now() + 5000; visible(fen) && Date.now() < fin;) await wait(200);
    await attendreStable(3000); memo = new Map();
    const n = parcelles.length - manquees.length;
    return manquees.length
      ? { etat: "mismatch", detail: `${n} parcelle(s) saisie(s) par l’assistant ; à ajouter vous-même : ${manquees.join(", ")}` }
      : { etat: "done", detail: `${n} parcelle(s) saisie(s) par l’assistant du guichet${n > 3 ? " (au-delà de 3 : annexe du guichet)" : ""}` };
  }

  // Les assistants de la page affichée, une fois chacun par saisie. Rend les codes que l'assistant a remplis (ignorés ensuite par le
  // remplissage champ par champ).
  async function assistantsPage(run, sp) {
    const faits = run.assistants || (run.assistants = {});
    for (const as of run.scenario.assistants || []) {
      if (faits[as.type] && faits[as.type].etat !== "absent") continue;
      const r = as.type === "adresse" ? await assistantAdresse(run, as, sp) : as.type === "parcelles" ? await assistantParcelles(run, as, sp) : null;
      if (!r) continue;
      faits[as.type] = r;
      await send({ type: "content.assistant", assistant: as.type, etat: r.etat, detail: r.detail });
      await noter(run, `assistant:${as.type}`, r.etat, r.detail);
    }
  }
  // Un champ rempli par un assistant (adresse ou parcelles) n'est jamais écrit directement.
  function champDeAssistant(run, f) {
    for (const as of run.scenario.assistants || []) {
      const r = (run.assistants || {})[as.type];
      if (!r || r.etat === "absent" || r.etat === "skipped") continue;
      const code = String(f.famille || f.code || "");
      if ((as.codes || []).some((c) => code === c || code.startsWith(c))) return r;
      // « Toutes les parcelles » (format de l'annexe, à coller) : l'assistant place lui-même les parcelles au-delà des lignes du CERFA.
      if (as.type === "parcelles" && f.encoded && f.source === as.source && r.etat === "done") return r;
    }
    return null;
  }

  // Le bouton « page suivante » du guichet par son sélecteur (Agglopolys : [ng-click="vm.nextPage()"]) — visible, actif, et jamais un
  // bouton de la liste noire par son texte ou ses attributs (« Transmettre ma demande », ng-click transmettreSaisie).
  function boutonSuivantSelecteur(sel) {
    return [...document.querySelectorAll(sel)].filter(visible)
      .find((b) => !b.disabled && b.getAttribute("aria-disabled") !== "true" && !b.classList.contains("disabled")
        && !FORBIDDEN.test(texteBouton(b)) && !FORBIDDEN.test(norm(attributsBouton(b)))) || null;
  }
  const getByPathLocal = (o, chemin) => String(chemin || "").split(".").reduce((x, k) => (x == null ? x : x[k]), o);
  function setNativeSelect(el, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(el, value);
    fire(el, "input");
    fire(el, "change");
  }

  async function boucleAuto(run) {
    const sc = run.scenario;
    const sp = SPEEDS[run.speed] || SPEEDS.normal;
    let pi = run.pageIndex || 0;
    const faites = new Set(run.etapesFaites || []);
    const champs = sc.pages.flatMap((p) => expandFields(p, run.fiche));
    const maxPages = sc.pagesMax || 30;
    let formulaireOuvert = !!run.formulaireOuvert;
    saisieDirecte = !!sc.saisieDirecte;
    let toursEntree = 0;
    const finGuichet = sc.entree
      ? "Dernière page atteinte : relisez chaque page, joignez les pièces (étape manuelle), cliquez « Vérifier ma saisie », puis transmettez vous-même."
      : "CLAIRE a rempli ce qu’elle connaît. Relisez chaque page, cochez les cases, puis validez et transmettez vous-même.";
    while (pi < maxPages) {
      setBanner(`CLAIRE pilote le guichet — page ${pi + 1}`, "running");
      setBlocking(true);
      await attendreStable(8000);
      memo = new Map();
      modelePage = undefined;
      if (sc.refuserSiNoms) {
        const noms = [...document.querySelectorAll("input, select, textarea")].map((el) => (el.name || el.id || "").split(/[.\[\]_-]/).pop());
        const actuel = sc.attendreNoms ? new RegExp(sc.attendreNoms) : null;
        if (noms.some((n) => new RegExp(sc.refuserSiNoms).test(n)) && !(actuel && noms.some((n) => actuel.test(n)))) {
          throw new Error("Ancien formulaire CERFA affiché : CLAIRE ne le remplit pas. Recommencez la demande sur le formulaire actuel.");
        }
      }
      // (1) Le formulaire n'est pas encore ouvert (aucun champ du scénario sur la page) : étape suivante de l'ouverture.
      // Dès qu'une page porte un champ du scénario, le formulaire est ouvert pour de bon : plus aucune étape d'ouverture n'est
      // cliquée ensuite (un « Nouvelle demande » de l'en-tête abandonnerait le brouillon ; un « Déposer » final transmettrait).
      if (sc.entree && !sc.uneSeulePage) {
        const etat = await entreeAgglopolys(run, sp, formulaireOuvert, pi);
        if (etat === "fin") return;
        if (etat === "fait") {
          if (!formulaireOuvert && ++toursEntree > 10) { await finish("awaiting_human", "Entrée dans la démarche inachevée : ouvrez le brouillon vous-même, puis relancez CLAIRE."); return; }
          continue;
        }
      }
      const presents = champs.filter((f) => f.type !== "choix" && f.type !== "case" && candidatsChamp(f).length).length;
      const brouillon = sc.entree && location.hash.startsWith(sc.entree.urlSaisie);
      if ((presents >= 1 || brouillon) && !formulaireOuvert) {
        formulaireOuvert = true;
        run = { ...run, formulaireOuvert: true, urlSaisie: brouillon ? location.href : run.urlSaisie };
        await send({ type: "content.formulaire", url: brouillon ? location.href : "" });
      }
      if (sc.entree && !formulaireOuvert) continue;
      if (!formulaireOuvert && !sc.uneSeulePage) {
        // Les étapes dans leur ordre : la suivante seulement ; celle d'avant pas encore vue est passée si la suivante est déjà là
        // (accueil qui mène directement au choix de la démarche).
        const etapes = sc.etapes || [];
        let idx = etapes.findIndex((e) => !faites.has(e.label));
        let cible = null;
        for (let k = idx; k >= 0 && k < etapes.length && !cible; k++) {
          cible = cliquableParTexte(etapes[k].textes, { lienSeul: true, navigation: k === 0 });
          if (cible) idx = k;
          if (!cible && k > idx) break;
        }
        if (cible) {
          for (let k = 0; k <= idx; k++) faites.add(etapes[k].label);
          await send({ type: "content.etape", label: etapes[idx].label });
          const change = await cliquerPuisAttendre(cible, sp, pi + 1);
          if (!change) { await finish("awaiting_human", `« ${etapes[idx].label} » n'a rien ouvert : ouvrez la démarche vous-même puis relancez CLAIRE.`); return; }
          pi += 1;
          continue;
        }
        if (idx >= 0) { await finish("awaiting_human", `CLAIRE ne trouve pas « ${etapes[idx].label} » sur cette page : ouvrez la démarche vous-même puis relancez CLAIRE.`); return; }
      }
      // (2) Les assistants du guichet (adresse, parcelles), puis les champs de cette page.
      if (sc.assistants) await assistantsPage(run, sp);
      for (const f of champs) {
        const parAssistant = sc.assistants ? champDeAssistant(run, f) : null;
        if (parAssistant) { const key = cleChamp(0, f.label, f); if (((run.fields || {})[key] || {}).state !== "done") await noter(run, key, parAssistant.etat === "done" ? "done" : "manuel", parAssistant.etat === "done" ? "par l’assistant du guichet" : parAssistant.detail); continue; }
        await remplirAuto(run, f, sp);
      }
      // (3) Page suivante, ou fin. « Remplir la page affichée » s'arrête ici.
      if (sc.uneSeulePage) {
        await finish("awaiting_human", "Page remplie. Relisez ; passez à la page suivante du guichet puis cliquez de nouveau. Vous validez vous-même.");
        return;
      }
      const suivant = sc.suivantSelecteur ? boutonSuivantSelecteur(sc.suivantSelecteur) : cliquableParTexte(sc.suivant || ["^(suivant|etape suivante|page suivante|continuer)\\b"]);
      // Dernière page du brouillon : plus de bouton « page suivante » actif. « Vérifier ma saisie » et « Transmettre » peuvent être affichés
      // sur toutes les pages : ils ne disent rien. Relancée au milieu du brouillon, CLAIRE s'arrête aussi quand « page suivante » ne
      // change plus rien (ci-dessous).
      if (!suivant || (sc.entree && pi + 1 >= maxPages)) {
        await finish("awaiting_human", finGuichet);
        return;
      }
      const change = await cliquerPuisAttendre(suivant, sp, pi + 1);
      if (!change) {
        await finish("awaiting_human", sc.entree
          ? "La page suivante ne s’ouvre plus (dernière page, ou champ obligatoire signalé par le guichet). " + finGuichet
          : "Le guichet n’a pas changé de page après « Suivant » (champ obligatoire ou erreur affichée ?) : complétez puis relancez CLAIRE.");
        return;
      }
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
