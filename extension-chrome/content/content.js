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
  // Le code est cherché aussi au bout d'un nom Angular (« vm.saisie.GI5AA1 », « x_FI1C », « …[COMMISSION] »).
  // GI1DA1 (« 1) A (ont) recherché un acquéreur disposé… ») n'y est plus : toujours cochée (étude 17/10).
  const JAMAIS_ECRIRE = /(^|[._\-\[])(OPLSTPARCELLE|OPLSTCOPRO|COMMISSION|FI1C|GI5AA1|GI6AA1)($|[_\]\-])/i;
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

  // Extension remplacée ou rechargée pendant que la page reste ouverte (essai de l'étude, 17/10 : chaque lettre de l'adresse tapée deux
  // fois — l'ancien script, orphelin, continuait de taper à côté du nouveau) : l'ancien s'arrête de lui-même au premier geste suivant.
  const orphelin = () => { try { return !chrome.runtime || !chrome.runtime.id; } catch (_) { return true; } };
  async function gate() {
    if (orphelin()) { control = "stopped"; try { teardown(); } catch (_) { /* déjà retiré */ } throw new Stop(); }
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

  // Aux couleurs de CLAIRE, thème noir (étude 17/10), clair ou sombre selon Chrome.
  const CSS = `
    :host{all:initial}
    .frame{position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 0 4px var(--c,#262626);transition:box-shadow .3s}
    .blocker{position:fixed;inset:0;pointer-events:auto;background:transparent;cursor:progress}
    .cursor{position:fixed;left:0;top:0;width:24px;height:24px;pointer-events:none;transform:translate(24px,90px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
    .banner{position:fixed;top:12px;left:50%;transform:translateX(-50%);pointer-events:auto;display:flex;gap:10px;align-items:center;
      background:#16233C;color:#fff;padding:8px 8px 8px 16px;border-radius:16px;font:13px/1.3 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:90vw}
    .banner .corps{display:flex;flex-direction:column;gap:5px;min-width:0}
    .banner .txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .banner .etape{font-size:11px;opacity:.8;white-space:nowrap}
    .banner .etape:empty,.banner .prog[hidden]{display:none}
    .banner .prog{display:block;height:4px;border-radius:999px;background:rgba(255,255,255,.2);overflow:hidden;min-width:180px}
    .banner .prog i{display:block;height:100%;width:0;background:#D4D4D4;transition:width .3s}
    .banner button{font:inherit;border:0;border-radius:10px;padding:6px 12px;cursor:pointer;background:#fff;color:#16233C}
    .banner button.stop{background:#B83A45;color:#fff}
    .ripple{position:fixed;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:3px solid var(--c,#262626);pointer-events:none;animation:rip .5s ease-out forwards}
    @keyframes rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.8);opacity:0}}
    @media (prefers-color-scheme: dark){
      .banner{background:#1B1E23;color:#EDEEF0;box-shadow:0 4px 16px rgba(0,0,0,.6),0 0 0 1px #2F343C}
      .banner button{background:#EDEEF0;color:#14161A}
    }
  `;

  const COLORS = { running: "#262626", paused: "#DB8556", attention: "#2F8F5B", error: "#B83A45" };

  function buildOverlay() {
    if (host) return;
    host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style>
      <div class="frame"></div>
      <div class="blocker" hidden></div>
      <svg class="cursor" viewBox="0 0 24 24"><path d="M3 2l7 19 2.8-7.7L21 10.5z" fill="#fff" stroke="#1b2a4a" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <div class="banner"><span class="corps"><span class="txt"></span><span class="etape"></span><span class="prog" hidden><i></i></span></span><span class="btns"></span></div>`;
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

  // Où en est le remplissage (étude 17/10 : « voir où en est le remplissage du document ») : étape n / total du scénario, sur le bandeau.
  function setProgression(etapes, courante) {
    if (!root || !Array.isArray(etapes) || !etapes.length) return;
    const i = etapes.indexOf(courante);
    root.querySelector(".etape").textContent = i >= 0 ? `Étape ${i + 1}/${etapes.length} · ${courante}` : "";
    const prog = root.querySelector(".prog");
    prog.hidden = i < 0;
    prog.querySelector("i").style.width = i >= 0 ? `${Math.round(((i + 1) / etapes.length) * 100)}%` : "0";
  }
  let runSuivi = null;
  async function suivi(label) {
    await send({ type: "content.etape", label });
    if (runSuivi) setProgression(runSuivi.scenario.etapesSuivi, label);
  }

  // ---------- Vrai clic, vraie frappe (étude 17/10 : « utilise la souris comme un humain ») ----------
  // Par le protocole de débogage de Chrome (background.js) : de vrais événements, au centre de l'élément visible ; le bandeau et le
  // voile de CLAIRE laissent passer le temps du geste. Repli sur le clic simulé si Chrome refuse (débogage non autorisé).
  let vraiEnCours = false;
  async function sansVoile(fn) {
    const voile = root && root.querySelector(".blocker");
    const bandeau = root && root.querySelector(".banner");
    vraiEnCours = true;
    if (voile) voile.hidden = true;
    if (bandeau) bandeau.style.pointerEvents = "none";
    try { return await fn(); } finally {
      vraiEnCours = false;
      if (voile) voile.hidden = !blocking; // l'état du moment (une pause a pu le changer pendant le geste)
      if (bandeau) bandeau.style.pointerEvents = "";
    }
  }
  async function cliquerVrai(el) {
    if (!el || !el.isConnected) return false;
    el.scrollIntoView({ block: "center", inline: "center" });
    await wait(150);
    const r = el.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, Math.max(4, r.width - 4)), y = r.top + r.height / 2;
    const ok = await sansVoile(async () => {
      const dessus = document.elementFromPoint(x, y);
      // Ce qui est sous le pointeur doit être l'élément visé (ou dedans, ou son libellé) : jamais un clic sur autre chose.
      if (!dessus || !(dessus === el || el.contains(dessus) || dessus.contains(el) || (el.labels && [...el.labels].some((l) => l.contains(dessus))))) return false;
      const res = await send({ type: "content.vraiClic", x, y });
      return !!(res && res.ok);
    });
    if (!ok) clicSimule(el, x, y);
    return true;
  }
  // Repli : la séquence d'un clic (appui, focus, relâchement, clic), pour les éléments qui réagissent à l'appui de la souris.
  function clicSimule(el, x, y) {
    const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0 };
    try { el.dispatchEvent(new PointerEvent("pointerdown", o)); } catch (_) { /* PointerEvent absent */ }
    el.dispatchEvent(new MouseEvent("mousedown", o));
    el.focus();
    try { el.dispatchEvent(new PointerEvent("pointerup", o)); } catch (_) { /* PointerEvent absent */ }
    el.dispatchEvent(new MouseEvent("mouseup", o));
    el.click();
  }
  async function taperVrai(el, texte, sp) {
    await cliquerVrai(el);
    await wait(150);
    if (document.activeElement !== el) el.focus();
    // Champ vidé avant la frappe (relecture du 17/10 : « BA » tapé derrière « BA » donnait « BABA ») ; la valeur doit être ÉGALE au texte.
    setNativeValue(el, ""); fire(el, "input", { inputType: "deleteContentBackward" });
    // Lettre par lettre, le champ relu après chacune (essai de l'étude, 17/10 : « pplaaccee SSaaiinntt » — le champ de recherche du guichet
    // réécrivait sa valeur pendant la frappe) : un caractère en trop est retiré aussitôt, la frappe reprend sur la bonne valeur.
    const delai = Math.max((sp && sp.type) || 0, 110);
    let res = null, attendu = "";
    for (const ch of String(texte)) {
      await gate();
      res = await sansVoile(() => send({ type: "content.vraiTexte", texte: ch, delai: 20 }));
      if (!(res && res.ok)) break;
      attendu += ch;
      await wait(delai);
      // Seulement un caractère EN TROP (la casse et les masques du guichet sont laissés tels quels).
      const nu = (x) => norm(x).replace(/[\s.,'\u00a0\u202f-]/g, "");
      if (nu(el.value).length > nu(attendu).length) { setNativeValue(el, attendu); fire(el, "input", { inputType: "insertText", data: ch }); }
    }
    const egal = (a) => String(a || "").replace(/\s+/g, " ").trim().toLowerCase() === String(texte).replace(/\s+/g, " ").trim().toLowerCase();
    if (res && res.ok && egal(el.value)) return true;
    await typeInto(el, texte, sp || SPEEDS.normal); // repli : frappe simulée
    return false;
  }
  const vraieTouche = (touche) => sansVoile(() => send({ type: "content.vraieTouche", touche }));

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
        if (!blocking || !e.isTrusted || vraiEnCours) return; // les vraies frappes de CLAIRE passent
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
    // Accents, apostrophes et espaces unifiés (« chefs d’entreprise » = « chefs d'entreprise »).
    const n = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
    const v = n(value);
    const opt = [...el.options].find((o) => n(o.value) === v || n(o.text) === v);
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
    // Le texte de la ligne de CE champ : en remontant tant que le bloc ne contient aucun autre champ de fichier (relevé de l'étude, 17/10 : le
    // champ ne s'appelle que « Ajouter », l'intitulé « CU1. Un plan de situation » est plus haut dans sa ligne).
    const zone = (el) => {
      let t = "";
      for (let n = el.parentElement, k = 0; n && k < 8; n = n.parentElement, k++) {
        if (n.querySelectorAll('input[type=file]').length > 1) break;
        t = norm((n.innerText || "").slice(0, 400));
        if (res.some((r) => r.test(t))) return t;
      }
      return t;
    };
    const vise = (x) => { const l = libelleChamp(x); const t = l && res.some((r) => r.test(l)) ? l : zone(x); return !!t && !autre.test(t) && res.some((r) => r.test(t)); };
    // Champ connu par son identifiant (relevé de l'étude, 17/10 : « file_input_BI3IA1 » de la DIA, caché tant que la case « plan
    // cadastral joint » n'est pas cochée ; « file_input_P2UU1 » du CU) ; sinon par l'intitulé de sa ligne.
    const parId = () => (f.inputId ? document.getElementById(f.inputId) : null);
    // La case qui annonce la pièce : trouvée comme les autres cases (identifiant, nom, « CODE_… »), visible elle ou son libellé.
    const trouverCase = () => {
      const sel = f.case ? selecteurCode(f.case) : "";
      return sel ? [...document.querySelectorAll(sel)].find((x) => x.type === "checkbox" && (visible(x) || (x.labels && [...x.labels].some(visible)))) || null : null;
    };
    // Pièce annoncée par une case (DIA : BI3IA1, page 2) : rien tant que cette case n'est pas affichée — toutes les pages sont dans le
    // DOM ; un plan sans case (joint à la fin, étude 17/10) va, lui, dans le champ désigné par son identifiant, même sur une page masquée.
    if (f.case && !trouverCase()) return false;
    let trouves = parId() ? [parId()] : [...document.querySelectorAll('input[type=file]')].filter(vise);
    if (!trouves.length && !trouverCase()) return false;
    if (trouves.length > 1) { if (((run.fields || {})[key] || {}).state !== "manuel") await noter(run, key, "manuel", "plusieurs champs de pièce parlent du plan : joignez-le vous-même"); return false; }
    if (trouves[0] && trouves[0].files && trouves[0].files.length) { await noter(run, key, "done", "pièce déjà jointe dans le guichet, laissée telle quelle"); return true; }
    await noter(run, key, "filling");
    const r = await send({ type: "content.plan" });
    if (!r || r.erreur || !r.b64) { await noter(run, key, "manuel", (r && r.erreur) || "plan introuvable : joignez-le vous-même"); return false; }
    // La case qui annonce la pièce (« plan cadastral joint : oui ») : cochée seulement quand le plan est là, puis le champ relu.
    const caseAvant = trouverCase();
    let caseCochee = false;
    const defaireCase = async () => { if (caseCochee && caseAvant.checked) { caseAvant.click(); await wait(sp.pause); } };
    if (caseAvant && !caseAvant.checked) {
      caseCochee = true;
      const c = (caseAvant.labels && [...caseAvant.labels].find(visible)) || caseAvant;
      try { const pos = await moveTo(c, sp); ripple(pos.x, pos.y); } catch (_) { /* case cachée */ }
      caseAvant.click();
      await wait(Math.max(sp.pause, 500));
      trouves = parId() ? [parId()] : [...document.querySelectorAll('input[type=file]')].filter(vise);
    }
    const el = trouves[0];
    if (!el) { await defaireCase(); await noter(run, key, "manuel", "champ de la pièce introuvable : joignez le plan vous-même"); return false; }
    const bin = atob(r.b64);
    const octets = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    const fichier = new File([octets], r.nom || "Plan cadastral.pdf", { type: "application/pdf" });
    const dt = new DataTransfer();
    dt.items.add(fichier);
    const cible = visible(el) ? el : (el.closest("label, .btn, button, div") || el);
    try { const pos = await moveTo(cible, sp); ripple(pos.x, pos.y); } catch (_) { /* champ caché : pas de curseur */ }
    const fenetresAvant = new Set(fenetresVisibles());
    el.files = dt.files;
    fire(el, "input");
    fire(el, "change");
    await wait(sp.pause);
    if (!(el.files && el.files.length)) { await defaireCase(); await noter(run, key, "mismatch", "le guichet n’a pas pris le fichier : joignez le plan vous-même"); return true; }
    // Le guichet envoie la pièce à son serveur : CLAIRE attend sa réponse (essai de l'étude, 17/10 : « 503 Service Unavailable » du
    // guichet, plan jamais joint alors que CLAIRE le disait fait). Une fenêtre d'erreur du guichet → à joindre soi-même, plus tard.
    const erreurGuichet = () => fenetresVisibles().filter((x) => !fenetresAvant.has(x)).find((x) => /\b50[0-4]\b|service unavailable|bad gateway|gateway time|erreur|echec|impossible/.test(norm(x.innerText || "").slice(0, 600)));
    let erreur = null;
    for (const fin = Date.now() + 8000; !erreur && Date.now() < fin;) { await wait(500); erreur = erreurGuichet(); }
    if (erreur) { await defaireCase(); run.planRefuse = true; await noter(run, key, "mismatch", "le guichet a refusé l’envoi du plan (erreur de son serveur) : fermez son message, puis joignez le plan vous-même plus tard"); return true; }
    await noter(run, key, "done", `Plan cadastral.pdf envoyé au guichet${r.source ? " (" + r.source + ")" : ""} — vérifiez qu’il apparaît dans les pièces`);
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
      // Case « plan cadastral joint » : cochée seulement quand le dossier a un plan (relecture du 17/10 : jamais « joint » sans pièce).
      if (f.siPlan) {
        if (run.planDispo === undefined) { const pl = await send({ type: "content.plan" }); run.planDispo = !!(pl && pl.b64 && !pl.erreur); }
        if (!run.planDispo) { if (deja !== "manuel") await noter(run, key, "manuel", "aucun plan cadastral trouvé dans le dossier du NAS : case laissée à cocher vous-même"); return false; }
      }
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
      const pos = await moveTo(cible, sp); ripple(pos.x, pos.y); await cliquerVrai(visible(el) ? el : cible); await wait(sp.pause);
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
      if (!el.checked) { await noter(run, key, "filling"); const cible = (el.labels && [...el.labels].find(visible)) || el; const pos = await moveTo(cible, sp); ripple(pos.x, pos.y); await cliquerVrai(visible(el) ? el : cible); await wait(sp.pause); }
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
    // Un champ en lecture seule est, sur ces guichets, réservé à un assistant ou calculé par le site : jamais écrit par-dessus.
    if (el.readOnly || el.getAttribute("aria-readonly") === "true") { await noter(run, key, "manuel", "case en lecture seule : à saisir par l’assistant du guichet"); return false; }
    // Un champ qui ouvre l'assistant d'adresse dès qu'il a le curseur (Agglopolys : onfocus « rempliAdresse(this) », relevé de l'étude,
    // 17/10) n'est jamais tapé : la frappe partirait dans la fenêtre ou serait perdue.
    if (/rempliAdresse/i.test(el.getAttribute("onfocus") || "") || /cadastral|rempliAdresse/i.test(el.getAttribute("ng-focus") || "")) {
      await noter(run, key, "manuel", "case reliée à l’assistant du guichet : jamais tapée directement"); return false;
    }
    await noter(run, key, "filling");
    if (run.scenario.codeSignature && f.code === run.scenario.codeSignature && !run.signatureVue) { run.signatureVue = true; await suivi("Signature"); }
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
    // Bouton retiré de la page pendant la pause (fenêtre refermée par le guichet) : jamais un clic dans le vide — Chrome annule alors l'envoi
    // (« Form submission canceled because the form is not connected », essai de l'étude, 17/10) ; la boucle relit la page.
    if (!el.isConnected || !visible(el)) { mark(el, false); return null; } // null = pas cliqué (≠ false : cliqué, page inchangée)
    await send({ type: "content.advance", pageIndex: pi }); // gardé AVANT le clic : la page peut se recharger
    await gate();
    await cliquerVrai(el);
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

  // Rouvrir un brouillon (relevé de l'étude, 17/10) : JAMAIS par son adresse chargée d'un coup ni par un rechargement — le GNAU perd le
  // contexte du CERFA (« reading 'ID_CERFA' ») et n'affiche que des gabarits {{TITLE}}. Toujours : accueil, attendre qu'il soit dessiné
  // (liste des demandes, zone « Formuler »), puis changer seulement le hash vers #/saisie/<id>.
  async function rouvrirParAccueil(run, e) {
    const accueil = location.origin + "/#/";
    if (location.hash !== "#/" && location.hash !== "") location.hash = "#/";
    const pret = () => !/\{\{/.test(document.body ? document.body.innerText || "" : "")
      && (!!boutonFormuler((e.bouton || []).map((m) => new RegExp(m, "i"))) || /mes demandes|consulter/i.test(norm(document.body.innerText || "")));
    for (const fin = Date.now() + 30000; !pret() && Date.now() < fin;) await wait(500);
    if (!pret()) throw new Error("L’accueil du guichet ne s’est pas affiché : ouvrez " + accueil + " vous-même, puis relancez CLAIRE — le brouillon est repris.");
    await wait(800);
    location.hash = new URL(run.urlSaisie).hash;
    await attendreStable(8000);
  }

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
        await rouvrirParAccueil(run, e);
        return "fait";
      }
      return "rien";
    }
    if (location.hash.startsWith(e.urlSaisie)) return "rien";
    // Fenêtre « Sélectionner une commune de dépôt ».
    // La liste des communes : par son sélecteur, sinon toute liste visible dont le bloc parle de la « commune de dépôt ».
    // Hors fenêtre « modal » (relecture du 17/10) : seulement une liste dont le bloc porte AUSSI le bouton « Valider la commune de
    // dépôt » — jamais un filtre « par commune de dépôt » de l'accueil.
    let fenCommune = null;
    // Deux fenêtres empilées (un second clic sur la démarche) : toujours la DERNIÈRE ouverte, celle qui est au-dessus.
    const select = [...document.querySelectorAll(e.commune.selecteur)].filter(visible).pop()
      || [...document.querySelectorAll("select")].filter(visible).find((x) => {
        for (let z = x.parentElement, k = 0; z && k < 6; z = z.parentElement, k++) {
          if (/commune de depot/.test(norm(z.innerText || "").slice(0, 300)) && boutonDansFenetre(z, e.commune.valider)) { fenCommune = z; return true; }
        }
        return false;
      });
    if (select && visible(select)) {
      // Fenêtres de commune en double (le guichet en ouvre parfois deux, essai de l'étude, 17/10) : celles du dessous sont refermées par
      // leur « Annuler » (aucune demande n'est créée tant que la commune n'est pas validée).
      const doubles = [...document.querySelectorAll('select[ng-model="vm.choixVilleInsee"]')].filter(visible).filter((x) => x !== select);
      for (const x of doubles) {
        const f = x.closest(FENETRES) || x.closest("form");
        if (!f || f.contains(select)) continue; // jamais la fenêtre en cours
        const annuler = f ? boutonDansFenetre(f, ["^annuler$"]) : null;
        if (annuler) { annuler.click(); await wait(400); }
      }
      const commune = getByPathLocal(run.fiche, e.commune.source);
      // La liste se remplit après coup (Angular, `ng-options`) : CLAIRE attend que la commune du dossier y soit (15 s au plus).
      let opts = [];
      for (const fin = Date.now() + 15000; Date.now() < fin; await wait(300)) {
        opts = [...select.options].filter((o) => memeCommune(o.text, commune));
        if (opts.length || (commune && select.options.length > 3)) break;
      }
      if (!commune || opts.length !== 1) {
        await finish("awaiting_human", `Choisissez vous-même la commune de dépôt${commune ? ` (${commune})` : ""}, validez, puis relancez CLAIRE.`);
        return "fin";
      }
      // Le choix se voit : bandeau, curseur sur la liste, la liste encadrée, pause d'une seconde avant « Valider la commune de dépôt ».
      setBanner(`CLAIRE choisit la commune de dépôt : ${opts[0].text.trim()}`, "running");
      const pos = await moveTo(select, sp); ripple(pos.x, pos.y);
      mark(select, true);
      select.focus();
      // Comme une personne (étude 17/10 : « clique, attends, laisse la vraie liste se dérouler ») : vrai clic sur la liste — la vraie liste
      // s'ouvre —, le nom de la commune tapé au clavier, Entrée. Le guichet reçoit un vrai choix (son `ng-change` joue).
      const nomCommune = opts[0].text.trim();
      mark(select, false);
      // Filet : aucun envoi du formulaire de la commune pendant ce geste (Entrée ne doit jamais valider la demande avant les contrôles).
      const bloquerEnvoi = (ev) => { if (ev.target && ev.target.contains && ev.target.contains(select)) { ev.preventDefault(); ev.stopImmediatePropagation(); } };
      window.addEventListener("submit", bloquerEnvoi, true);
      try {
        await cliquerVrai(select);
        await wait(Math.max(sp.pause, 900));
        await sansVoile(() => send({ type: "content.vraiTexte", texte: nomCommune, delai: 90 }));
        await wait(400);
        await vraieTouche("Enter");
        await wait(Math.max(sp.pause, 800));
      } finally { window.removeEventListener("submit", bloquerEnvoi, true); }
      const vraiOk = select.selectedIndex >= 0 && select.options[select.selectedIndex] === opts[0];
      // Repli (débogage refusé, liste native fermée sans choix) : la ville posée par le contrôleur du modèle d'Angular, comme un choix.
      let parModele = null;
      if (!vraiOk) {
        // Jamais Échap (relecture du 17/10 : il fermerait la fenêtre de la commune du guichet).
        parModele = await send({ type: "content.communeChoisirAngular", commune });
        if (parModele && parModele.ok) { await wait(300); run.communeParModele = true; }
        else if (parModele && parModele.raison && parModele.raison !== "sans-angular") {
          await finish("awaiting_human", `CLAIRE n’a pas pu choisir ${nomCommune} dans la liste du guichet (${parModele.raison}) : choisissez la commune vous-même, validez, puis relancez CLAIRE.`);
          return "fin";
        } else setNativeSelect(select, opts[0].value);
      }
      // Liste d'Angular (relevé de l'étude, 17/10 : `ng-options`, valeurs = rangs, pas le code INSEE) : la commune doit être prise par le
      // modèle — sinon l'option est reprise par son rang, puis un nouveau « change ».
      // L'option elle-même, jamais son rang (Angular retire son option « ? » dès qu'un choix est fait : les rangs reculent).
      const priseCommune = () => select.selectedIndex >= 0 && memeCommune(select.options[select.selectedIndex].text, commune) && !select.classList.contains("ng-invalid");
      if (!vraiOk && !priseCommune() && !(parModele && parModele.ok)) { opts[0].selected = true; fire(select, "input"); fire(select, "change"); }
      await wait(Math.max(sp.pause, 1000));
      // Ce qu'Angular a réellement retenu (essai de l'étude, 17/10 : Candé-sur-Beuvron au lieu de Blois) : relu dans la page, jamais validé
      // sur une autre commune que celle du dossier.
      const lue = await send({ type: "content.communeAngular" });
      if (lue && typeof lue.commune === "string" && lue.commune && !memeCommune(lue.commune, commune)) {
        mark(select, false);
        await finish("awaiting_human", `Le guichet a retenu ${lue.commune} au lieu de ${opts[0].text.trim()} : choisissez la commune vous-même, validez, puis relancez CLAIRE.`);
        return "fin";
      }
      if (!priseCommune()) {
        mark(select, false);
        await finish("awaiting_human", `Le guichet n’a pas pris la commune ${opts[0].text.trim()} : choisissez-la vous-même, validez, puis relancez CLAIRE.`);
        return "fin";
      }
      mark(select, false);
      const fen = select.closest(FENETRES) || select.closest('form[name="formSelectionCommune"]') || fenCommune;
      const valider = fen ? boutonDansFenetre(fen, e.commune.valider) : null;
      if (!valider) { await finish("awaiting_human", "Commune choisie : cliquez vous-même « Valider la commune de dépôt », puis relancez CLAIRE."); return "fin"; }
      const relue = await send({ type: "content.communeAngular" });
      if (relue && typeof relue.commune === "string" && relue.commune && !memeCommune(relue.commune, commune)) {
        await finish("awaiting_human", `Le guichet a retenu ${relue.commune} au lieu de ${opts[0].text.trim()} : choisissez la commune vous-même, validez, puis relancez CLAIRE.`);
        return "fin";
      }
      await suivi("Commune de dépôt");
      run.communeChoisie = opts[0].text.trim();
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
      if (!b) {
        await wait(500);
        // Sortie seulement pour une fenêtre utile (commune de dépôt, questions « non ») — jamais pour « Traitements en cours ».
        const sel = document.querySelector(e.commune.selecteur);
        const utile = (sel && visible(sel)) || fenetresVisibles().some((f) => motifsNon.some((m) => new RegExp(m, "i").test(txt(f))) || new RegExp(e.sessionExpiree || "^$", "i").test(txt(f)));
        if (location.hash.startsWith(e.urlSaisie) || utile) return "fait";
      }
    }
    if (b) {
      // Jamais deux clics sur la démarche (essai de l'étude, 17/10 : deux fenêtres « commune de dépôt » empilées, la commune choisie dans
      // celle du dessous) : la fenêtre s'ouvre après le chargement de la liste des communes, CLAIRE l'attend au lieu de recliquer.
      const fenetreOuverte = () => !!([...document.querySelectorAll(e.commune.selecteur)].find(visible) || location.hash.startsWith(e.urlSaisie)
        || fenetresVisibles().some((f) => motifsNon.some((m) => new RegExp(m, "i").test(txt(f)))));
      if (run.demarcheCliqueeLe && Date.now() - run.demarcheCliqueeLe < 120000) {
        for (const fin = Date.now() + 15000; Date.now() < fin && !fenetreOuverte();) await wait(300);
        if (fenetreOuverte()) return "fait";
        await finish("awaiting_human", "La démarche est cliquée mais la fenêtre « commune de dépôt » ne s’est pas ouverte : choisissez la commune vous-même, validez, puis relancez CLAIRE.");
        return "fin";
      }
      await send({ type: "content.etape", label: run.scenario.name });
      run.demarcheCliqueeLe = Date.now();
      const clic = await cliquerPuisAttendre(b, sp, pi);
      if (clic === null) run.demarcheCliqueeLe = 0; // bouton redessiné ou caché avant le clic : rien n'a été cliqué
      for (const fin = Date.now() + 15000; Date.now() < fin && !fenetreOuverte();) await wait(300);
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
    const apres = (a, b2) => !!(a.compareDocumentPosition(b2) & Node.DOCUMENT_POSITION_FOLLOWING);
    const courts = [...document.querySelectorAll("body *")].filter((el) => el.children.length <= 4 && (el.textContent || "").length <= 120
      && !el.closest("#claire-overlay") && /^\s*\S/.test(el.textContent || "") && visible(el));
    // Les frontières de « Formuler » par leur TEXTE (relecture du 17/10 : « Suivre » peut avoir une autre forme que « Formuler ») : aucun
    // bouton n'est pris au-delà d'un intitulé « Suivre », « Mes demandes », « Mes dossiers », « S'informer ».
    const frontieres = courts.filter((el) => /^(suivre|mes demandes|mes dossiers|s ?informer)\b/.test(norm(el.textContent).replace(/'/g, " ")));
    const formulers = courts.filter((el) => /^formuler\b/.test(norm(el.textContent)));
    for (const bandeau of formulers.filter((x) => !formulers.some((y) => y !== x && y.contains(x)))) {
      // Les autres bandeaux (« S'INFORMER », « SUIVRE ») : même balise et même classe — jamais un élément du bandeau lui-même.
      const signe = (el) => el.tagName + "." + (el.className || ("^" + (el.parentElement && el.parentElement.className)));
      const autres = [...document.querySelectorAll(bandeau.tagName)].filter((x) => x !== bandeau && !bandeau.contains(x) && !x.contains(bandeau) && signe(x) === signe(bandeau) && visible(x));
      const limites = autres.concat(frontieres.filter((x) => !bandeau.contains(x) && !x.contains(bandeau))).filter((x) => apres(bandeau, x));
      const suivant = limites.sort((a, b2) => (apres(a, b2) ? -1 : 1))[0] || null;
      // Le bouton : après le bandeau « Formuler » et avant la première limite qui le suit, dans l'ordre de la page.
      const entre = (x) => apres(bandeau, x) && (!suivant || apres(x, suivant));
      for (let z = bandeau.parentElement, k = 0; z && z !== document.body && k < 8; z = z.parentElement, k++) {
        const cands = [...z.querySelectorAll(CLIQUABLES_ENTREE)].filter(visible).filter((x) => entre(x) && okTexte(texteBouton(x)) && !boutonEntreeInterdit(x));
        if (cands.length) return cands.sort((a, b2) => texteBouton(a).length - texteBouton(b2).length)[0];
        const nus = [...z.querySelectorAll("div, span, p, li, img")].filter(visible)
          .filter((x) => entre(x) && x.children.length <= 2 && okTexte(norm(x.innerText || x.getAttribute("alt") || x.title || "")) && !boutonEntreeInterdit(x));
        const nu = nus.find((x) => !nus.some((y) => y !== x && x.contains(y)));
        if (nu) return nu;
        // Sans limite connue après « Formuler » (dernier bloc) : jamais au-delà du bloc qui contient le bandeau et un autre bandeau.
        if (!suivant && autres.concat(frontieres).some((x) => z.contains(x) && !bandeau.contains(x))) break;
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
  // La fenêtre d'un assistant : par son TITRE, quelle que soit la façon dont le guichet dessine ses fenêtres (relevé de l'étude, 17/10 :
  // le vrai guichet n'utilise pas la classe « modal ») — le bloc qui contient le titre, au moins un champ de saisie et un bouton « Fermer » (ou celui que l'assistant déclare : « Annuler » pour la commission).
  async function fenetreTitree(titre, max, exclure, fermerMotif) {
    const reFermer = new RegExp(fermerMotif || "^fermer$");
    const re = new RegExp("^" + titre, "i");
    // Un bloc qui contient le formulaire n'est jamais la fenêtre (relecture du 17/10 : une aide de la page qui citait le titre faisait
    // prendre toute la page, et cliquer son « Valider ») : ni le champ qui ouvre l'assistant, ni un bouton du guichet.
    const tropGrand = (z) => (exclure || []).some((x) => z.contains(x))
      || [...z.querySelectorAll("button, a, [role=button], input[type=button], input[type=submit]")].some((b) => /^(verifier ma saisie|transmettre|sauvegarder|page suivante|retour)/.test(texteBouton(b)));
    for (const fin = Date.now() + (max || 5000); Date.now() < fin;) {
      const f = fenetresVisibles().find((x) => re.test(norm(x.innerText || "").trim().slice(0, 200)) && !tropGrand(x));
      if (f) return f;
      // Les titres qui COMMENCENT par le titre, du dernier au premier (une fenêtre s'ajoute en fin de page) ; le plus petit bloc qui
      // contient un champ et un bouton « Fermer ».
      const titres = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6, .modal-title, [class*=title], [class*=titre], div, span, p")]
        .filter((t) => t.children.length <= 2 && (t.textContent || "").length <= 80 && re.test(norm(t.textContent).trim()) && visible(t) && !t.closest("#claire-overlay")).reverse();
      for (const t of titres) {
        for (let z = t.parentElement, k = 0; z && z !== document.body && k < 8; z = z.parentElement, k++) {
          if (tropGrand(z)) break;
          if (champsVisibles(z).length && [...z.querySelectorAll("button, a, [role=button], input[type=button]")].some((b) => visible(b) && reFermer.test(texteBouton(b)))) return z;
        }
      }
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
  // La fenêtre de l'assistant : par un champ qui lui est propre quand il est connu (« #saisieAdresseAuto »), sinon par son titre.
  async function fenetreAssistant(as, max) {
    const exclure = (as.declencheur || []).map(selecteurCode).filter(Boolean).flatMap((sel) => [...document.querySelectorAll(sel)]);
    for (const fin = Date.now() + (max || 4000); Date.now() < fin;) {
      const propre = as.champFenetre ? [...document.querySelectorAll(as.champFenetre)].find(visible) : null;
      if (propre) {
        for (let z = propre.parentElement, k = 0; z && z !== document.body && k < 10; z = z.parentElement, k++) {
          if (exclure.some((x) => z.contains(x)) || [...z.querySelectorAll("button, a, [role=button]")].some((b) => /^(verifier ma saisie|transmettre)/.test(texteBouton(b)))) break;
          if ([...z.querySelectorAll("button, a, [role=button], input[type=button]")].some((b) => visible(b) && /^fermer$/.test(texteBouton(b)))) return z;
        }
      }
      const f = await fenetreTitree(as.titre, 250, exclure, as.fermer);
      if (f) return f;
    }
    return null;
  }
  async function ouvrirAssistant(as, sp, run) {
    const deja = await fenetreAssistant(as, 300);
    // Plusieurs assistants du même genre (DIA : bien, propriétaire, acquéreur, office) : une fenêtre déjà ouverte est celle d'un AUTRE bloc
    // (relecture du 17/10 : l'adresse du propriétaire partait dans le bloc du bien) — jamais reprise.
    if (deja) return (run.scenario.assistants || []).filter((x) => x.type === as.type).length > 1 ? "occupee" : deja;
    // Chaque déclencheur à son tour (le champ de la voie, puis le numéro, la localité…), jusqu'à ce que la fenêtre s'ouvre.
    for (const code of as.declencheur || []) {
      const sel = selecteurCode(code);
      const el = sel ? [...document.querySelectorAll(sel)].find(visible) : null;
      if (!el) continue;
      el.scrollIntoView({ block: "center" });
      const pos = await moveTo(el, sp); ripple(pos.x, pos.y);
      await cliquerVrai(el);
      const fen = await fenetreAssistant(as, 3500);
      if (fen) return fen;
      // Une fenêtre lente à venir : jamais un second déclencheur par-dessus.
      const tard = await fenetreAssistant(as, 1500);
      if (tard) return tard;
    }
    return null;
  }

  async function assistantAdresse(run, as, sp) {
    const t = getByPathLocal(run.fiche, as.source) || {};
    const voie = String(t.voie || "").trim();
    if (!voie && !t.lieuDit) return { etat: "skipped", detail: "pas d’adresse sur la fiche" };
    const deja = valeurChampCode(as.voieCode);
    if (deja === null) return null; // pas sur cette page
    if (deja) return { etat: "done", deja: true, detail: "adresse déjà saisie dans le guichet, laissée telle quelle" };
    const fen = await ouvrirAssistant(as, sp, run);
    if (fen === "occupee") return { etat: "manuel", detail: "une fenêtre d’assistant est déjà ouverte (autre bloc ?) : terminez-la ou fermez-la, puis relancez CLAIRE" };
    if (!fen) return { etat: "absent", detail: "l’assistant d’adresse ne s’est pas ouvert" };
    await suivi(as.suivi || "Adresse");
    const recherche = [...fen.querySelectorAll("#saisieAdresseAuto")].find(visible) || champParLibelle(fen, "rechercher une adresse") || champsVisibles(fen)[0];
    if (!recherche) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "assistant d’adresse : champ de recherche introuvable" }; }
    const requete = [t.numero, voie || t.lieuDit, t.codePostal, t.commune].filter(Boolean).join(" ");
    const lent = saisieDirecte; saisieDirecte = false; // la liste du guichet ne se déroule qu'à la frappe
    try {
      const pos = await moveTo(recherche, sp); ripple(pos.x, pos.y);
      recherche.focus(); setNativeValue(recherche, ""); fire(recherche, "input");
      // Comme un vrai clavier (étude 17/10 : « l'assistant n'a pas l'impression que c'est tapé ») : champ cliqué, puis pour chaque lettre
      // keydown / keypress / input / keyup avec leur code, que lisent les listes de propositions jQuery et Angular.
      const touche = (type, ch) => {
        const code = /^[a-z0-9]$/i.test(ch) ? ch.toUpperCase().charCodeAt(0) : ch === " " ? 32 : 0;
        const ev = new KeyboardEvent(type, { key: ch, code: /\d/.test(ch) ? "Digit" + ch : "Key" + ch.toUpperCase(), bubbles: true, cancelable: true, composed: true });
        for (const [k, v] of [["keyCode", type === "keypress" ? ch.charCodeAt(0) : code], ["which", type === "keypress" ? ch.charCodeAt(0) : code], ["charCode", type === "keypress" ? ch.charCodeAt(0) : 0]]) {
          try { Object.defineProperty(ev, k, { get: () => v }); } catch (_) { /* propriété figée */ }
        }
        return recherche.dispatchEvent(ev);
      };
      // La frappe se fait DANS LA PAGE (relecture du 17/10 : les codes de touche posés par l'extension ne sont pas vus par les scripts du
      // guichet, qui tournent dans un autre monde) ; repli sur la frappe de l'extension si la page ne la prend pas.
      // Le champ visé par un jeton unique (l'identifiant « saisieAdresseAuto » peut exister dans plusieurs fenêtres d'adresse).
      const jeton = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      recherche.setAttribute("data-claire-frappe", jeton);
      // Vraie frappe d'abord (clavier de Chrome) ; sinon frappe dans la page ; sinon frappe simulée.
      let tape = null;
      if (await taperVrai(recherche, requete, sp)) tape = { ok: true };
      else { setNativeValue(recherche, ""); fire(recherche, "input"); tape = await send({ type: "content.taper", jeton, texte: requete, delai: Math.max(sp.type, 60) }); }
      recherche.removeAttribute("data-claire-frappe");
      if (!(tape && tape.ok)) {
        setNativeValue(recherche, ""); fire(recherche, "input");
        for (const ch of requete) {
          touche("keydown", ch); touche("keypress", ch);
          setNativeValue(recherche, recherche.value + ch); fire(recherche, "input", { inputType: "insertText", data: ch });
          touche("keyup", ch);
          await wait(Math.max(sp.type, 60));
        }
        fire(recherche, "change");
      }
    } finally { saisieDirecte = lent; }
    // La proposition qui porte le numéro, les mots de la voie et le code postal (ou la commune) de la fiche — jamais « la première ».
    // Proposition conforme (relecture du 17/10 : « Rue Jean Racine » n'est pas « Rue Racine », Saint-Claude-de-Diray n'est pas Vineuil) :
    // « numéro voie code-postal commune », chaque partie ÉGALE à celle de la fiche — la voie mot pour mot, la commune quand la fiche la connaît.
    // Abréviations de la fiche développées des deux côtés (« Av. » = « Avenue ») ; « 4B » = « 4 bis ».
    const ABREV = { av: "avenue", ave: "avenue", bd: "boulevard", bld: "boulevard", ch: "chemin", che: "chemin", rte: "route", pl: "place", imp: "impasse", all: "allee", sq: "square", fg: "faubourg", fbg: "faubourg", res: "residence", lot: "lotissement", qu: "quai", crs: "cours", pas: "passage", sen: "sentier", st: "saint", ste: "sainte" };
    const net = (x) => norm(x).replace(/[-'’,.]/g, " ").split(/\s+/).filter(Boolean).map((w) => ABREV[w] || w).join(" ");
    const numeroNet = (x) => String(x || "").replace(/\s+/g, "").replace(/^(\d+)b$/, "$1bis").replace(/^(\d+)t$/, "$1ter").replace(/^(\d+)q$/, "$1quater");
    const numeroFiche = numeroNet(net(t.numero));
    const voieFiche = net(voie || t.lieuDit);
    // Petits mots de liaison ignorés dans la voie (essai de l'étude, 17/10 : l'adresse de l'office « rue Bout des Haies » proposée par le
    // guichet en « Rue du Bout des Haies », jamais choisie) ; tout autre mot reste exigé (« Rue Jean Racine » n'est pas « Rue Racine »).
    const sansArticles = (x) => String(x || "").split(" ").filter((w) => w && !/^(de|du|des|la|le|les|l|d|a|au|aux|en)$/.test(w)).join(" ");
    const conforme = (txt) => {
      // Numéro facultatif (terrain sans numéro, lieu-dit) : quand la fiche n'en a pas, la proposition n'en a pas non plus.
      const m = /^(?:(\d+\s*(?:bis|ter|quater|[a-d])?)\s+)?(.+?)\s+(\d{5})\s+(.+)$/.exec(net(txt));
      if (!m) return false;
      if (numeroNet(m[1]) !== numeroFiche) return false;
      if (sansArticles(m[2]) !== sansArticles(voieFiche)) return false;
      if (t.codePostal && m[3] !== String(t.codePostal).trim()) return false;
      if (t.commune && m[4].replace(/\s*\(.*?\)\s*/g, " ").trim() !== net(t.commune)) return false;
      return !!(t.codePostal || t.commune);
    };
    // Forme plus libre d'une proposition (essai de l'étude, 17/10 : une seule adresse trouvée, jamais choisie) — code postal ou commune
    // seulement, texte autour (« 10 Rue du Commerce, Blois, 41000 France ») : « numéro voie » de la fiche mot pour mot, SUIVI directement
    // du code postal ou de la commune (« Rue Racine » n'est toujours ni « Rue Jean Racine » ni « Rue Racine Prolongée »).
    const echapper = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Commune exigée quand la fiche la connaît (relecture du 17/10 : Vineuil et Saint-Claude-de-Diray partagent le 41350), code postal
    // sinon ; la proposition commence par l'adresse (sans numéro sur la fiche, une proposition numérotée est refusée).
    const suite = t.commune ? net(t.commune) : (t.codePostal ? String(t.codePostal).trim() : "");
    const reSouple = suite ? new RegExp("^" + echapper(sansArticles((numeroFiche ? numeroFiche + " " : "") + voieFiche)) + " (\\d{5} )?" + echapper(sansArticles(suite)) + "( \\d{5})?( \\(\\d{5}\\))?( france)?$") : null;
    const conformeSouple = (txt) => !!reSouple && reSouple.test(sansArticles(net(txt).replace(/(\d+) (bis|ter|quater)\b/g, "$1$2")));
    let choix = null, liste = [];
    for (const fin = Date.now() + 8000; !choix && Date.now() < fin;) {
      await wait(300);
      // Les propositions affichées sous le champ, quelle que soit leur forme (liste, lignes, boutons) : les plus petits éléments visibles
      // dont le texte est une adresse conforme — dans l'assistant, ou dans une liste posée par-dessus la page.
      const candidats = [...document.querySelectorAll('[role=option], li, a, button, div, span, td, p')]
        .filter((x) => x !== recherche && x.children.length <= 4
          && (fen.contains(x) || x.closest('.dropdown-menu, [role=listbox], [class*=typeahead], [class*=autocomplete], [class*=suggest], [class*=propos]'))
          && !x.closest("#claire-overlay") && visible(x) && (x.innerText || "").length <= 160)
        ;
      // Toutes les propositions affichées (forme d'adresse avec code postal), pour connaître le rang de celle retenue.
      const toutes = candidats.filter((x) => /\b\d{5}\b/.test(x.innerText || ""));
      liste = toutes.filter((x) => !toutes.some((y) => y !== x && x.contains(y)));
      const strictes = candidats.filter((x) => conforme(x.innerText || ""));
      // La forme stricte d'abord ; la forme libre seulement quand aucune proposition ne la remplit.
      const retenus = strictes.length ? strictes : candidats.filter((x) => conformeSouple(x.innerText || ""));
      const props = retenus.filter((x) => !retenus.some((y) => y !== x && x.contains(y)));
      if (props.length === 1 || (props.length > 1 && props.every((x) => norm(x.innerText) === norm(props[0].innerText)))) choix = props[0];
      else if (props.length > 1) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "plusieurs adresses proposées par le guichet : choisissez-la vous-même" }; }
    }
    if (!choix) {
      await fermerFenetre(fen, sp);
      // Brouillon ouvert sans que CLAIRE ait choisi la commune (repris, ou commune choisie à la main) : l'assistant ne propose que les
      // adresses de la commune de dépôt du brouillon (essai de l'étude, 17/10 : brouillon de Candé-sur-Beuvron, dossier à Blois).
      const commune = run.communeChoisie ? "" : ` — vérifiez aussi que la commune de dépôt du brouillon est bien ${t.commune || "celle du dossier"} : l’assistant ne propose que les adresses de cette commune`;
      return { etat: "manuel", detail: `aucune adresse proposée ne correspond à « ${requete} » : saisissez-la vous-même dans l’assistant${commune}` };
    }
    const cible = choix.querySelector("a") || choix;
    let pos = await moveTo(cible, sp); ripple(pos.x, pos.y); mark(cible, true); await wait(Math.max(sp.pause, 500)); mark(cible, false); await cliquerVrai(cible);
    await wait(Math.max(sp.pause, 600));
    // La proposition encore affichée et « Je valide mon adresse » grisé : le clic n'a pas choisi l'adresse (liste qui choisit au clavier) —
    // la proposition prise comme un humain le ferait : flèche vers le bas dans le champ de recherche, puis Entrée.
    const valideGrise = () => { const b = boutonDansFenetre(fen, ["^je valide mon adresse$"]); return !b || b.disabled || b.getAttribute("aria-disabled") === "true" || b.hasAttribute("disabled"); };
    // Seulement quand la proposition retenue est la SEULE affichée (relecture du 17/10 : la flèche prend la première de la liste), et
    // jamais si Entrée pouvait envoyer un formulaire qui déborde de l'assistant (le CERFA : « Vérifier », « Transmettre »).
    const formulaireHors = recherche.form && !fen.contains(recherche.form);
    if (document.contains(choix) && visible(choix) && valideGrise() && visible(recherche) && liste.length <= 1 && !formulaireHors) {
      await cliquerVrai(recherche); await wait(200);
      await vraieTouche("ArrowDown"); await wait(400);
      await vraieTouche("Enter"); await wait(Math.max(sp.pause, 800));
    }
    if (t.lieuDit && voie) { const ld = [...fen.querySelectorAll("#complement")].find(visible) || champParLibelle(fen, "^lieu-?dit"); if (ld && !String(ld.value || "").trim()) await typeInto(ld, String(t.lieuDit), sp); }
    // Entrée a pu valider l'adresse d'elle-même (fenêtre déjà refermée) : rien de plus à cliquer.
    const valider = visible(fen) ? boutonDansFenetre(fen, ["^je valide mon adresse$"]) : null;
    if (!valider && visible(fen)) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "« Je valide mon adresse » introuvable : saisissez l’adresse vous-même dans l’assistant" }; }
    if (valider) { pos = await moveTo(valider, sp); ripple(pos.x, pos.y); await cliquerVrai(valider); }
    for (const fin = Date.now() + 5000; visible(fen) && Date.now() < fin;) await wait(200);
    await attendreStable(3000); memo = new Map();
    const apres = valeurChampCode(as.voieCode);
    // La voie posée doit être celle de la fiche (jamais une autre proposition prise par erreur).
    if (apres && voie && sansArticles(net(apres)) !== sansArticles(voieFiche)) return { etat: "manuel", detail: `adresse posée par le guichet (« ${apres} ») différente de la fiche : vérifiez-la` };
    return apres && !visible(fen) ? { etat: "done", detail: "adresse saisie par l’assistant du guichet" } : { etat: "manuel", detail: "l’assistant d’adresse ne s’est pas refermé sur le formulaire : terminez-le vous-même" };
  }

  async function assistantParcelles(run, as, sp) {
    const parcelles = (getByPathLocal(run.fiche, as.source) || []).filter((p) => p && p.section && p.numero);
    if (!parcelles.length) return { etat: "skipped", detail: "pas de parcelle sur la fiche" };
    const deja = valeurChampCode(as.sectionCode);
    if (deja === null) return null;
    if (deja) return { etat: "done", deja: true, detail: "parcelles déjà saisies dans le guichet, laissées telles quelles" };
    const fen = await ouvrirAssistant(as, sp, run);
    if (fen === "occupee") return { etat: "manuel", detail: "une fenêtre d’assistant est déjà ouverte (autre bloc ?) : terminez-la ou fermez-la, puis relancez CLAIRE" };
    if (!fen) return { etat: "absent", detail: "l’assistant des références cadastrales ne s’est pas ouvert" };
    await suivi("Parcelles");
    const champ = (m) => champParLibelle(fen, m);
    const lignes = () => [...fen.querySelectorAll("table tbody tr, table tr")].filter(visible).map((tr) => norm(tr.innerText)).filter((x) => /\d/.test(x));
    // Une ligne du tableau est-elle CETTE parcelle ? Zéros en tête tolérés (« BA 0021 », « 0A »), préfixe comparé quand il est connu
    // (communes nouvelles : BA 21 du préfixe 123 n'est pas BA 21 du préfixe 456).
    const sansZero = (x) => String(x || "").toLowerCase().replace(/^0+(?=[a-z0-9])/, "");
    const estLigne = (l, sec, num, pre) => {
      const m = l.split(/[\s|]+/).filter(Boolean);
      for (let i = 0; i + 1 < m.length; i++) {
        if (sansZero(m[i]) !== sansZero(sec) || sansZero(m[i + 1]) !== sansZero(num)) continue;
        // Le préfixe : le seul jeton de trois chiffres JUSTE avant la section (jamais une superficie plus loin dans la ligne).
        const avant = i > 0 && /^\d{3}$/.test(m[i - 1]) ? m[i - 1] : "";
        if (pre && avant && sansZero(avant) !== sansZero(pre)) continue;
        return true;
      }
      return false;
    };
    const surfaceDe = (p) => { try { return p.surface === undefined || p.surface === "" ? "" : TRANSFORMS.surface(p.surface); } catch (_) { return ""; } };
    let ajoutees = 0, presentes = 0;
    const manquees = [];
    for (const p of parcelles) {
      await gate();
      const sec = String(p.section).toUpperCase().trim();
      const num = String(p.numero).replace(/^0+(?=\d)/, "").trim();
      // Déjà dans le tableau de l'assistant : jamais deux fois.
      const pre = p.prefixe && !/^0*$/.test(String(p.prefixe)) ? String(p.prefixe).trim() : "";
      if (lignes().some((l) => estLigne(l, sec, num, pre))) { presentes++; continue; }
      const surf = surfaceDe(p);
      if (!surf) { manquees.push(`${sec} ${num} (superficie inconnue)`); continue; }
      const cSec = champ("^section"), cNum = champ("^numero"), cSurf = champ("^superficie"), cPre = champ("^prefixe");
      if (!cSec || !cNum || !cSurf) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "assistant des parcelles : champs Section / Numéro / Superficie introuvables" }; }
      const avant = lignes().length;
      if (cPre && pre) await taperVrai(cPre, pre, sp);
      await taperVrai(cSec, sec, sp);
      await taperVrai(cNum, num, sp);
      await taperVrai(cSurf, surf, sp);
      const ajouter = boutonDansFenetre(fen, ["^ajouter la parcelle"]);
      if (!ajouter) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "bouton « Ajouter la parcelle » introuvable" }; }
      const pos = await moveTo(ajouter, sp); ripple(pos.x, pos.y); await cliquerVrai(ajouter);
      let ok = false;
      for (const fin = Date.now() + 4000; !ok && Date.now() < fin;) { await wait(200); ok = lignes().length > avant; }
      if (!ok) { manquees.push(`${sec} ${num}`); continue; }
      ajoutees++;
    }
    if (!ajoutees && !lignes().length) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "aucune parcelle ajoutée : " + manquees.join(", ") }; }
    const valider = boutonDansFenetre(fen, ["^valider$"]);
    if (!valider) return { etat: "manuel", detail: "parcelles ajoutées : cliquez vous-même « Valider » dans l’assistant" };
    const pos = await moveTo(valider, sp); ripple(pos.x, pos.y);
    await cliquerVrai(valider);
    for (const fin = Date.now() + 5000; visible(fen) && Date.now() < fin;) await wait(200);
    await attendreStable(3000); memo = new Map();
    // L'assistant doit s'être refermé ET avoir posé les parcelles dans le CERFA (une confirmation ouverte par-dessus n'est jamais cliquée).
    if (visible(fen) || !valeurChampCode(as.sectionCode)) return { etat: "manuel", detail: "l’assistant des parcelles ne s’est pas refermé sur le formulaire : terminez-le vous-même" };
    const n = ajoutees + presentes;
    return manquees.length
      ? { etat: "mismatch", detail: `${n} parcelle(s) dans l’assistant ; à ajouter vous-même : ${manquees.join(", ")}` }
      : { etat: "done", detail: `${n} parcelle(s) saisie(s) par l’assistant du guichet${n > 3 ? " (au-delà de 3 : annexe du guichet)" : ""}` };
  }

  // « Assistant de saisie du montant de la commission » (DIA d'Agglopolys, capture de l'étude du 17/10) : deux champs « A la charge de
  // l'acquéreur » / « A la charge du vendeur », le total calculé par le guichet, TTC ou HT, puis « Valider le montant de la commission »
  // (exception nommée, cliquée DANS sa fenêtre seulement). Le montant est toujours le TTC de la fiche, posé du côté qui paie — jamais
  // deviné : sans « à la charge de qui » sur la fiche, rien n'est saisi.
  // « 1 500 », « 1.500,00 », « 1500.5 » → nombre ; NaN si illisible.
  const montantLu = (x) => {
    let v = String(x || "").replace(/[\s\u00a0\u202f€]/g, "");
    if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
    return v ? Number(v) : 0;
  };
  async function assistantCommission(run, as, sp) {
    const presents = (as.declencheur || []).map(selecteurCode).filter(Boolean).some((sel) => [...document.querySelectorAll(sel)].some(visible));
    if (!presents) return null; // pas sur cette page
    const c = getByPathLocal(run.fiche, as.source);
    if (!c || !(Number(c.total) > 0) || (!c.chargeAcquereur && !c.chargeVendeur)) return { etat: "skipped", detail: "pas de commission d’agence sur la fiche (ou à la charge de qui non précisé)" };
    const deja = as.montantCode ? valeurChampCode(as.montantCode) : "";
    if (deja && montantLu(deja) > 0) return { etat: "done", deja: true, detail: "commission déjà saisie dans le guichet, laissée telle quelle" };
    const fen = await ouvrirAssistant(as, sp, run);
    if (fen === "occupee") return { etat: "manuel", detail: "une fenêtre d’assistant est déjà ouverte : terminez-la ou fermez-la, puis relancez CLAIRE" };
    if (!fen) return { etat: "absent", detail: "l’assistant du montant de la commission ne s’est pas ouvert" };
    await suivi("Commission");
    const total = Math.round(Number(c.total) * 100) / 100;
    const montant = Number.isInteger(total) ? String(total) : total.toFixed(2);
    const cAcq = champParLibelle(fen, "charge de l.acquereur"), cVen = champParLibelle(fen, "charge du vendeur");
    const cible = c.chargeAcquereur ? cAcq : cVen, autre = c.chargeAcquereur ? cVen : cAcq;
    if (!cible) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "assistant de la commission : champ « A la charge de " + (c.chargeAcquereur ? "l’acquéreur" : "du vendeur") + " » introuvable" }; }
    // L'autre côté doit rester vide : jamais deux montants additionnés par le guichet.
    if (autre && montantLu(autre.value) > 0) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "assistant de la commission : un montant est déjà à la charge de l’autre partie — à vérifier vous-même" }; }
    await taperVrai(cible, montant, sp);
    // TTC : le bouton radio de la fenêtre dont le libellé (ou la valeur) est « TTC ».
    const radios = [...fen.querySelectorAll("input[type=radio]")];
    const ttc = radios.find((r) => /^ttc$/.test(norm(libelleChamp(r) || r.value || ((r.nextSibling && r.nextSibling.textContent) || "")).trim()));
    if (ttc && !ttc.checked) { const pos = await moveTo(ttc, sp); ripple(pos.x, pos.y); await cliquerVrai(ttc); await wait(200); }
    if (!ttc || !ttc.checked) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "assistant de la commission : case « TTC » introuvable — saisissez la commission vous-même" }; }
    if (montantLu(cible.value) !== total) { await fermerFenetre(fen, sp); return { etat: "manuel", detail: "assistant de la commission : le montant n’a pas été pris — saisissez-le vous-même" }; }
    const valider = boutonDansFenetre(fen, ["^valider le montant de la commission$"]);
    if (!valider) return { etat: "manuel", detail: "montant saisi : cliquez vous-même « Valider le montant de la commission »" };
    const pos = await moveTo(valider, sp); ripple(pos.x, pos.y);
    await cliquerVrai(valider);
    for (const fin = Date.now() + 5000; visible(fen) && Date.now() < fin;) await wait(200);
    await attendreStable(3000); memo = new Map();
    if (visible(fen)) return { etat: "manuel", detail: "l’assistant de la commission ne s’est pas refermé : terminez-le vous-même" };
    return { etat: "done", detail: `commission de ${montant} € TTC à la charge ${c.chargeAcquereur ? "de l’acquéreur" : "du vendeur"}, saisie par l’assistant du guichet` };
  }

  // Les assistants de la page affichée, une fois chacun par saisie. Rend les codes que l'assistant a remplis (ignorés ensuite par le
  // remplissage champ par champ).
  async function assistantsPage(run, sp) {
    const faits = run.assistants || (run.assistants = {});
    for (const as of run.scenario.assistants || []) {
      // Un assistant par bloc d'adresse (bien, propriétaire, acquéreur, office) : chacun suivi sous son nom.
      const nom = as.id || as.type;
      if (faits[nom] && faits[nom].etat !== "absent") continue;
      const r = as.type === "adresse" ? await assistantAdresse(run, as, sp) : as.type === "parcelles" ? await assistantParcelles(run, as, sp) : as.type === "commission" ? await assistantCommission(run, as, sp) : null;
      if (!r) continue;
      faits[nom] = r;
      await send({ type: "content.assistant", assistant: nom, etat: r.etat, detail: r.detail });
      await noter(run, `assistant:${nom}`, r.etat, r.detail);
    }
  }
  // Un champ rempli par un assistant (adresse ou parcelles) n'est JAMAIS écrit directement (étude 17/10 : « utiliser le système qui
  // permet de choisir l'adresse, ne pas copier-coller dans le champ, pareil pour les parcelles ») — même quand l'assistant ne s'est pas
  // ouvert : la case reste à saisir par l'assistant du guichet.
  function champDeAssistant(run, f) {
    for (const as of run.scenario.assistants || []) {
      const code = String(f.famille || f.code || "");
      const couvert = (as.codes || []).some((c) => code === c || code.startsWith(c))
        // « Toutes les parcelles » (format de l'annexe, à coller) : jamais à la place de l'assistant.
        || (as.type === "parcelles" && f.encoded && f.source === as.source);
      if (!couvert) continue;
      const r = (run.assistants || {})[as.id || as.type];
      if (r && r.etat === "skipped") return { etat: "skipped", detail: r.detail };
      if (r && r.etat !== "absent") return r;
      return { etat: "manuel", detail: (r && r.detail ? r.detail + " : " : "") + "à saisir par l’assistant du guichet (jamais tapé directement dans la case)" };
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

  // Fin du brouillon (étude 17/10 : « à la fin faire Vérifier ma saisie ») : CLAIRE clique « Vérifier ma saisie » — le contrôle du
  // guichet, qui ne transmet rien — et laisse la main. Le bouton est pris par son identifiant ET son texte exact ; « Transmettre ma
  // demande », à côté, n'est jamais cliqué.
  // { n, total } de la page affichée du CERFA : champ « Numéro de la page » (total lu dans « sur N » juste après), sinon « Page N / M ».
  function numeroPageGuichet() {
    const champ = [...document.querySelectorAll("input[type=text], input:not([type])")].find((el) => visible(el) && /numero de la page/.test(libelleChamp(el)) && /^\d{1,2}$/.test(String(el.value || "").trim()));
    if (champ) {
      const bloc = champ.parentElement ? norm(champ.parentElement.innerText || champ.parentElement.textContent || "") : "";
      const sur = /sur\s*(\d{1,2})/.exec(bloc);
      return { n: Number(champ.value), total: sur ? Number(sur[1]) : 0 };
    }
    const m = /\bpage\s+(\d{1,2})\s*\/\s*(\d{1,2})\b/i.exec(document.body ? document.body.innerText || "" : "");
    return m ? { n: Number(m[1]), total: Number(m[2]) } : null;
  }
  // Plan refusé par le serveur du guichet : ni « Vérifier ma saisie » ni « Sauvegarder » sous sa fenêtre d'erreur (relecture du 17/10).
  const PLAN_REFUSE = "Le guichet a refusé le plan (erreur de son serveur) : fermez son message, joignez le plan vous-même, puis cliquez « Vérifier ma saisie » et « Sauvegarder ».";
  async function piecesALaFin(run, champs, sp) {
    const pieces = champs.filter((f) => f.type === "fichier" && !f.case);
    if (pieces.length) await suivi("Plan cadastral");
    for (const f of pieces) await remplirAuto(run, f, sp);
  }
  async function verifierSaisie(sc, sp) {
    if (!sc.verifierSelecteur) return "";
    const okBouton = (x, re) => re.test(texteBouton(x)) && !/transmet|envoy|sign|depos|valid/.test(norm(attributsBouton(x))) && !x.disabled;
    const trouverVerifier = () => [...document.querySelectorAll(sc.verifierSelecteur)].filter(visible).find((x) => okBouton(x, /^verifier ma saisie$/));
    const trouverSauver = () => [...document.querySelectorAll("#id__btnEnregistrerSaisie")].filter(visible).find((x) => okBouton(x, /^sauvegarder$/));
    const cliquer = async (el, label) => {
      await suivi(label);
      const p = await moveTo(el, sp); mark(el, true); ripple(p.x, p.y);
      await wait(sp.pause); await gate();
      if (el.isConnected) await cliquerVrai(el);
      await attendreStable(5000); mark(el, false); memo = new Map();
    };
    // Ordre de l'étude (17/10) : « d'abord Vérifier ma saisie, ensuite Sauvegarder » — boutons pris par leur identifiant ET leur texte exact,
    // relevés de nouveau entre les deux (le guichet peut redessiner ses boutons).
    const verifier = trouverVerifier();
    if (!verifier) return "";
    await cliquer(verifier, "Vérifier ma saisie");
    const sauver = trouverSauver();
    if (sauver) await cliquer(sauver, "Sauvegarder");
    return sauver
      ? "CLAIRE a cliqué « Vérifier ma saisie » puis « Sauvegarder » : corrigez ce que le guichet signale, relisez chaque page et les pièces, puis transmettez vous-même."
      : "CLAIRE a cliqué « Vérifier ma saisie » ; « Sauvegarder » n’est pas affiché : sauvegardez vous-même, puis transmettez vous-même.";
  }

  async function boucleAuto(run) {
    const sc = run.scenario;
    runSuivi = { scenario: sc };
    buildOverlay();
    setProgression(sc.etapesSuivi, null); // étape de l'exécution précédente effacée
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
    cerfaVu = false; // nouvelle saisie : le CERFA est attendu de nouveau
    // La page de saisie affichée est-elle celle d'une AUTRE démarche ? Oui seulement quand le formulaire est dessiné et qu'aucun champ de
    // ce scénario n'y figure (relecture du 17/10 : une demande ouverte à la main par « Consulter » est reprise, jamais abandonnée).
    const autreDemarcheAffichee = async () => {
      await attendreStable(4000); memo = new Map();
      const notres = champs.some((f) => f.type !== "choix" && f.type !== "case" && f.type !== "fichier" && candidatsChamp(f).length);
      const dessine = !/\{\{/.test(document.body ? document.body.innerText || "" : "")
        && [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter((el) => visible(el) && !el.closest(FENETRES) && !el.closest("#claire-overlay")).length >= 3;
      // Première page d'une demande (CU : demandeur pré-rempli, aucun champ du scénario) : la demande en cours, jamais « une autre ».
      const page = numeroPageGuichet();
      return dessine && !notres && !(page && page.n === 1);
    };
    // Démarche lancée depuis la page d'une AUTRE demande (essai de l'étude, 17/10 : un CU lancé sur la page de la DIA qui venait d'être faite —
    // CLAIRE prenait la DIA pour le CU) : retour à l'accueil par le hash seul (jamais de rechargement), puis l'entrée habituelle ; brouillon
    // connu de CETTE démarche : rouvert par l'accueil.
    if (sc.entree && location.hash.startsWith(sc.entree.urlSaisie)) {
      const hashBrouillon = run.urlSaisie ? (() => { try { return new URL(run.urlSaisie).hash; } catch (_) { return ""; } })() : "";
      if (hashBrouillon && location.hash !== hashBrouillon) {
        setBanner("CLAIRE rouvre le brouillon de cette démarche…", "running");
        await rouvrirParAccueil(run, sc.entree);
      } else if (!hashBrouillon && !run.formulaireOuvert && !(run.pageIndex > 0) && await autreDemarcheAffichee()) {
        setBanner("CLAIRE revient à l’accueil du guichet…", "running");
        formulaireOuvert = false;
        run = { ...run, formulaireOuvert: false };
        location.hash = "#/";
        const pret = () => !location.hash.startsWith(sc.entree.urlSaisie) && !/\{\{/.test(document.body ? document.body.innerText || "" : "")
          && (!!boutonFormuler((sc.entree.bouton || []).map((m) => new RegExp(m, "i"))) || /mes demandes|consulter/i.test(norm(document.body.innerText || "")));
        for (const fin = Date.now() + 30000; !pret() && Date.now() < fin;) await wait(500);
        await attendreStable(4000);
        memo = new Map();
      }
    }
    while (pi < maxPages) {
      setBanner(`CLAIRE pilote le guichet — page ${pi + 1}`, "running");
      setBlocking(true);
      await attendreStable(8000);
      // Page du guichet pas encore dessinée par Angular (« {{TITLE}} », « {{data.libelle}} » à l'écran, essai de l'étude, 17/10) : CLAIRE
      // attend (30 s au plus) au lieu de tout sauter ; toujours brute, elle s'arrête.
      const brute = () => /\{\{\s*(title|data\.)/i.test(document.body ? document.body.innerText || "" : "");
      if (brute()) {
        for (const fin = Date.now() + 30000; brute() && Date.now() < fin;) await wait(500);
        if (brute()) {
          // Une fois : retour à l'accueil puis le brouillon rouvert par son hash (jamais F5).
          if (sc.entree && !run.urlSaisie && location.hash.startsWith(sc.entree.urlSaisie)) run = { ...run, urlSaisie: location.href };
          if (sc.entree && run.urlSaisie && !run.rouvertParAccueil) { run.rouvertParAccueil = true; cerfaVu = false; await rouvrirParAccueil(run, sc.entree); continue; }
          // Brouillon gardé d'une saisie précédente qui ne s'ouvre plus (essai de l'étude, 17/10 : brouillon supprimé dans le guichet, page
          // « {{TITLE}} » partout) : oublié, et une nouvelle demande part de l'accueil — une seule fois.
          if (sc.entree && run.brouillonRepris && !run.brouillonOublie) {
            await send({ type: "content.oublierBrouillon" });
            run = { ...run, brouillonOublie: true, brouillonRepris: false, urlSaisie: "", formulaireOuvert: false };
            formulaireOuvert = false;
            cerfaVu = false;
            setBanner("Brouillon introuvable : CLAIRE commence une nouvelle demande…", "running");
            location.hash = "#/";
            for (const fin = Date.now() + 30000; (brute() || location.hash.startsWith(sc.entree.urlSaisie)) && Date.now() < fin;) await wait(500);
            await attendreStable(4000);
            continue;
          }
          await finish("awaiting_human", "La page du guichet ne s’est pas affichée : revenez à l’accueil du guichet (sans recharger la page), ouvrez la demande par « Consulter », puis relancez CLAIRE.");
          return;
        }
        await attendreStable(4000);
      }
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
      // Le CERFA doit être chargé avant toute étape (étude 17/10 : « laisser un délai le temps que le CERFA se charge, sinon il passe
      // directement au plan ; les étapes dans l'ordre ») : au moins un champ du scénario affiché, sinon CLAIRE attend (60 s au plus) —
      // jamais « dernière page », plan ni « Vérifier » sur un formulaire pas encore là.
      // Une seule fois, à l'ouverture du formulaire (relecture du 17/10 : une page sans champ texte du scénario — pièces jointes — ne
      // doit pas arrêter CLAIRE).
      if (sc.entree && !cerfaVu) {
        // Chargé = un champ du scénario affiché, OU le bouton « Page suivante » du CERFA, OU plusieurs champs du formulaire hors fenêtre
        // (essai de l'étude, 17/10 : la première page du CU — le demandeur, pré-rempli — n'a aucun champ que CLAIRE remplit).
        const cerfaPret = () => champs.some((f) => f.type !== "choix" && f.type !== "case" && f.type !== "fichier" && candidatsChamp(f).some(visible))
          || (!!sc.suivantSelecteur && [...document.querySelectorAll(sc.suivantSelecteur)].some(visible))
          || [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter((el) => visible(el) && !el.closest(FENETRES) && !el.closest("#claire-overlay")).length >= 3;
        if (!cerfaPret()) {
          setBanner("CLAIRE attend que le formulaire du guichet se charge…", "running");
          for (const fin = Date.now() + 60000; !cerfaPret() && Date.now() < fin;) { await wait(500); memo = new Map(); }
          if (!cerfaPret()) { await finish("awaiting_human", "Le formulaire du guichet ne s’est pas chargé : attendez qu’il s’affiche, puis relancez CLAIRE — le brouillon est repris."); return; }
          await attendreStable(4000);
          memo = new Map();
        }
        cerfaVu = true;
        // Brouillon repris bien ouvert : il n'est plus jamais oublié pour une page brute plus tard dans la saisie (relecture du 17/10).
        if (run.brouillonRepris) { run = { ...run, brouillonRepris: false }; await send({ type: "content.brouillonCharge" }); }
      }
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
          if (change === null) { // bouton redessiné avant le clic : la page est relue, trois fois au plus
            if ((run.nonCliques = (run.nonCliques || 0) + 1) > 3) { await finish("awaiting_human", "Le bouton du guichet change sans cesse : continuez vous-même, puis relancez CLAIRE."); return; }
            continue;
          }
          run.nonCliques = 0;
          if (!change) { await finish("awaiting_human", `« ${etapes[idx].label} » n'a rien ouvert : ouvrez la démarche vous-même puis relancez CLAIRE.`); return; }
          pi += 1;
          continue;
        }
        if (idx >= 0) { await finish("awaiting_human", `CLAIRE ne trouve pas « ${etapes[idx].label} » sur cette page : ouvrez la démarche vous-même puis relancez CLAIRE.`); return; }
      }
      // (2) Les assistants du guichet (adresse, parcelles), puis les champs de cette page.
      if (sc.assistants) await assistantsPage(run, sp);
      for (const f of champs) {
        // Pièces jointes (hors plan annoncé par une case de la DIA) : à la fin, juste avant « Vérifier ma saisie » (étude 17/10).
        if (sc.entree && f.type === "fichier" && !f.case) continue;
        const parAssistant = sc.assistants ? champDeAssistant(run, f) : null;
        if (parAssistant) {
          const key = cleChamp(0, f.label, f);
          const etat = parAssistant.etat === "done" ? "done" : parAssistant.etat === "skipped" ? "skipped" : "manuel";
          if (((run.fields || {})[key] || {}).state !== "done") await noter(run, key, etat, parAssistant.etat === "done" && !parAssistant.deja ? "par l’assistant du guichet" : parAssistant.detail);
          continue;
        }
        await remplirAuto(run, f, sp);
      }
      // (2 bis) Page de la signature remplie (CU, étude 17/10 : « après la page 3 et la signature mise, ne pas lire les pages suivantes ») :
      // directement le plan, « Vérifier ma saisie » et « Sauvegarder ».
      if (sc.finApresCode && [...document.querySelectorAll(selecteurCode(sc.finApresCode) || "#__aucun")].some((x) => visible(x) && String(x.value || "").trim())) {
        await piecesALaFin(run, champs, sp);
        await finish("awaiting_human", run.planRefuse ? PLAN_REFUSE : (await verifierSaisie(sc, sp) || finGuichet));
        return;
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
      // « Page 10 / 10 » affiché par le guichet : dernière page, sans cliquer « page suivante » ni attendre 20 s qu'elle change (essai de
      // l'étude, 17/10 : « un long moment entre la page 10 et la mise en ligne du plan »).
      // Le numéro de la page affichée est dans le champ « Numéro de la page » de la barre du guichet (« 8 sur 10 », structure relevée par
      // l'étude le 17/10) ; à défaut, un texte « Page N / M ».
      const compteur = sc.entree ? numeroPageGuichet() : null;
      // DIA (étude 17/10 : « arrivé à la page 8, passer tout de suite au plan ») : `pageFin` du scénario.
      const derniere = !!compteur && compteur.n > 0
        && ((compteur.total > 0 && compteur.n >= compteur.total) || (sc.pageFin > 0 && compteur.n >= sc.pageFin));
      if (!suivant || derniere || (sc.entree && pi + 1 >= maxPages)) {
        await piecesALaFin(run, champs, sp);
        await finish("awaiting_human", run.planRefuse ? PLAN_REFUSE : (await verifierSaisie(sc, sp) || finGuichet));
        return;
      }
      const change = await cliquerPuisAttendre(suivant, sp, pi + 1);
      if (change === null) { // bouton redessiné avant le clic : la page est relue, trois fois au plus
        if ((run.nonCliques = (run.nonCliques || 0) + 1) > 3) { await finish("awaiting_human", "Le bouton du guichet change sans cesse : continuez vous-même, puis relancez CLAIRE."); return; }
        continue;
      }
      run.nonCliques = 0;
      if (!change) {
        if (sc.entree) await piecesALaFin(run, champs, sp);
        const verifie = sc.entree ? (run.planRefuse ? PLAN_REFUSE : await verifierSaisie(sc, sp)) : "";
        if (verifie) { await finish("awaiting_human", verifie); return; }
        await finish("awaiting_human", sc.entree
          ? "La page suivante ne s’ouvre plus (dernière page, ou champ obligatoire signalé par le guichet). " + finGuichet
          : "Le guichet n’a pas changé de page après « Suivant » (champ obligatoire ou erreur affichée ?) : complétez puis relancez CLAIRE.");
        return;
      }
      pi += 1;
    }
    await finish("awaiting_human", "Arrêt après " + maxPages + " pages : relisez et continuez vous-même.");
  }

  // Lien du guichet cliqué dans CLAIRE (étude 17/10 : « ouvrir Chrome avec l'add-on ouvert ») : Chrome n'ouvre le panneau d'une
  // extension que sur un clic — un bouton en bas à droite de la page le propose, une fois, pendant 2 minutes. Le dossier est déjà choisi.
  let propositionFaite = false;
  let cerfaVu = false; // CERFA chargé au moins une fois après l'ouverture du formulaire (boucleAuto)
  async function proposerOuverture() {
    if (propositionFaite || window.top !== window) return;
    propositionFaite = true;
    const r = await send({ type: "content.ouvertureClaire" }).catch(() => null);
    if (!r || !r.proposer) return;
    const h = document.createElement("div");
    const sr = h.attachShadow({ mode: "closed" });
    sr.innerHTML = `<style>
      .b { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; display: flex; align-items: center; gap: 8px; padding: 10px 12px 10px 14px; border-radius: 10px;
        border: 1px solid #2A2F37; background: #111418; color: #fff; font: 500 14px/1.2 system-ui, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.25); }
      button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }
      .ouvrir { font-weight: 600; } .x { opacity: .6; padding: 0 2px; } .x:hover { opacity: 1; }
    </style><div class="b"><button type="button" class="ouvrir">Ouvrir CLAIRE — CU a) et DIA</button><button type="button" class="x" aria-label="Fermer">×</button></div>`;
    sr.querySelector(".ouvrir").addEventListener("click", () => { chrome.runtime.sendMessage({ type: "content.ouvrirPanneau" }).catch(() => {}); h.remove(); });
    sr.querySelector(".x").addEventListener("click", () => h.remove());
    document.documentElement.appendChild(h);
    setTimeout(() => h.remove(), 120000);
  }

  async function start() {
    // Pris AVANT l'attente (relecture du 17/10, lettres tapées deux fois) : le démarrage au chargement de la page et le « resume » du
    // lancement pouvaient passer tous deux avant la réponse, et deux boucles remplissaient le guichet en même temps.
    if (loopActive) return;
    loopActive = true;
    const run = await send({ type: "content.hello" });
    if (!run) { loopActive = false; teardown(); proposerOuverture(); return; }
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
