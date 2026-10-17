// Utilitaires partagés (panneau + content script). Script classique, pas de module.
(function (g) {
  function getByPath(obj, path) {
    return String(path)
      .split(".")
      .reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);
  }

  const isTrue = (v) => v === true || /^(oui|true|1)$/i.test(String(v));
  const s = (v) => (v === undefined || v === null ? "" : String(v));

  // ---------- Nombres en lettres (prix GNAU : traits d'union + « euros ») ----------
  const U = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
  const T = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

  function sous100(n, final) {
    if (n < 20) return U[n];
    if (n < 70) {
      const t = Math.floor(n / 10), u = n % 10;
      return T[t] + (u === 0 ? "" : u === 1 ? "-et-un" : "-" + U[u]);
    }
    if (n < 80) return "soixante-" + (n === 71 ? "et-onze" : U[n - 60]);
    if (n === 80) return "quatre-vingt" + (final ? "s" : "");
    return "quatre-vingt-" + U[n - 80];
  }
  function sous1000(n, final) {
    const h = Math.floor(n / 100), r = n % 100;
    if (h === 0) return sous100(r, final);
    if (h === 1) return "cent" + (r ? "-" + sous100(r, final) : "");
    return U[h] + "-cent" + (r ? "-" + sous100(r, final) : final ? "s" : "");
  }
  function nombreEnLettres(n) {
    n = Math.round(Number(n));
    if (!Number.isFinite(n) || n < 0 || n >= 1e9) throw new Error("Montant hors limites : " + n);
    if (n === 0) return "zéro";
    const parts = [];
    const mil = Math.floor(n / 1e6), th = Math.floor((n % 1e6) / 1000), r = n % 1000;
    // « million » est un nom : quatre-vingts et deux-cents y gardent leur s (quatre-vingts-millions).
    if (mil) parts.push(mil === 1 ? "un-million" : sous1000(mil, true) + "-millions");
    if (th) parts.push(th === 1 ? "mille" : sous1000(th, false) + "-mille");
    if (r) parts.push(sous1000(r, true));
    return parts.join("-");
  }

  // ---------- Dates ----------
  function parseDate(v) {
    const t = s(v);
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (m) return { y: m[1], m: m[2], d: m[3] };
    m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
    if (m) return { y: m[3], m: m[2], d: m[1] };
    m = /^(\d{2})(\d{2})(\d{4})$/.exec(t);
    if (m) return { y: m[3], m: m[2], d: m[1] };
    return null;
  }

  const SEP_ITEM = "¡"; // sépare les éléments d'une liste (parcelles, lots)
  const SEP = "¢"; // sépare les champs d'un élément

  const TRANSFORMS = {
    none: (v) => s(v),
    upper: (v) => s(v).toUpperCase(),
    // La fiche stocke les dates au format ISO (AAAA-MM-JJ).
    date_fr: (v) => {
      const d = parseDate(v);
      return d ? `${d.d}/${d.m}/${d.y}` : s(v);
    },
    date_iso: (v) => {
      const d = parseDate(v);
      return d ? `${d.y}-${d.m}-${d.d}` : s(v);
    },
    // Format GNAU : JJMMAAAA, sans séparateurs.
    date_jjmmaaaa: (v) => {
      const d = parseDate(v);
      if (!d) throw new Error("Date illisible : " + s(v));
      return `${d.d}${d.m}${d.y}`;
    },
    euro: (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : s(v);
    },
    // Prix en chiffres : entier, sans séparateur.
    entier: (v) => {
      const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n)) throw new Error("Montant illisible : " + s(v));
      return String(Math.round(n));
    },
    // Prix en lettres : traits d'union + « euros ».
    prix_lettres: (v) => {
      const n = Math.round(Number(String(v).replace(/\s/g, "").replace(",", ".")));
      // Un nombre rond de millions : « un-million d'euros », « deux-millions d'euros ».
      return nombreEnLettres(n) + (n >= 1e6 && n % 1e6 === 0 ? " d'euros" : n > 1 ? " euros" : " euro");
    },
    // Surface : entier, ou décimale avec virgule. (Deux décimales si non entière, comme « 98,00 » observé : à confirmer.)
    surface: (v) => {
      const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n)) throw new Error("Surface illisible : " + s(v));
      return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
    },
    yesno: (v) => (isTrue(v) ? "oui" : "non"),
    // Adresse électronique en deux cases autour de « @ » (CERFA : « ____ @ ____ »).
    email_local: (v) => { const m = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(s(v).trim()); if (!m) throw new Error("Email illisible"); return m[1]; },
    email_domaine: (v) => { const m = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(s(v).trim()); if (!m) throw new Error("Email illisible"); return m[2]; },

    // ----- Listes encodées attendues par le GNAU (voir HANDOFF.md §11) -----
    // CUa : ¢section¢numéro¢surface¢ séparés par ¡
    parcelles_cua: (arr) =>
      arr.map((p) => `${SEP}${s(p.section)}${SEP}${s(p.numero)}${SEP}${TRANSFORMS.surface(p.surface)}${SEP}`).join(SEP_ITEM),
    // DIA : ¢section¢numéro¢préfixe¢adresse cadastrale¢COMMUNE¢surface¢ (ordre déduit de l'exemple observé, à confirmer)
    parcelles_dia: (arr) =>
      arr
        .map(
          (p) =>
            `${SEP}${s(p.section)}${SEP}${s(p.numero)}${SEP}${s(p.prefixe)}${SEP}${s(p.adresse).toUpperCase()}${SEP}${s(p.commune).toUpperCase()}${SEP}${TRANSFORMS.surface(p.surface)}${SEP}`
        )
        .join(SEP_ITEM),
    // Lots de copropriété : lot¢bâtiment¢étage¢quote-part¢nature¢surface séparés par ¡
    lots_copro: (arr) =>
      arr
        .map((l) => [s(l.lot), s(l.batiment), s(l.etage), s(l.quotePart), s(l.nature), l.surface === undefined || l.surface === "" ? "" : TRANSFORMS.surface(l.surface)].join(SEP))
        .join(SEP_ITEM),
    // Commission : montant acq.¢à charge acq.¢à charge vend.¢montant vend.¢total¢HT¢TTC¢
    commission: (c) => {
      const acq = Number(c.montantAcquereur || 0), ven = Number(c.montantVendeur || 0);
      const tot = c.total !== undefined ? Number(c.total) : acq + ven;
      const b = (x) => (isTrue(x) ? "true" : "false");
      return [Math.round(acq), b(c.chargeAcquereur), b(c.chargeVendeur), Math.round(ven), Math.round(tot), b(c.ht), b(c.ttc)].join(SEP) + SEP;
    },
  };

  // Retourne { missing: true } ou { missing: false, value }.
  function resolveField(field, fiche) {
    const raw = getByPath(fiche, field.source);
    if (raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0)) return { missing: true };
    if (field.type === "checkbox" || field.type === "case") return { missing: false, value: isTrue(raw) };
    const t = TRANSFORMS[field.transform || "none"] || TRANSFORMS.none;
    try {
      return { missing: false, value: t(raw) };
    } catch (e) {
      return { missing: false, invalid: true, value: "", error: String(e && e.message ? e.message : e) };
    }
  }

  // Développe les blocs répétés d'une page (codemandeurs, parcelles supplémentaires…) en champs concrets.
  // Dans un bloc { forEach: "vendeurs.codemandeurs", max: 4, fields: [...] }, les jetons
  // {list} (chemin de la liste), {i} (index 0) et {n} (numéro 1) sont remplacés dans les champs.
  function expandFields(page, fiche) {
    const out = [];
    for (const f of page.fields || []) {
      if (!f.forEach) {
        out.push(f);
        continue;
      }
      const list = getByPath(fiche, f.forEach);
      const n = Math.min(Array.isArray(list) ? list.length : 0, f.max || Infinity);
      for (let i = 0; i < n; i++) {
        for (const child of f.fields || []) {
          const txt = JSON.stringify(child).split("{list}").join(f.forEach).split("{i}").join(String(i)).split("{n}").join(String(i + 1)).split("{ligne}").join(Array.isArray(f.lignes) ? String(f.lignes[i] || "") : "");
          out.push(JSON.parse(txt));
        }
      }
    }
    return out;
  }

  // Texte lisible d'une valeur brute (pour le panneau, quand la valeur envoyée au site est encodée).
  function preview(raw) {
    if (Array.isArray(raw)) return raw.map(preview).join(" · ");
    if (raw && typeof raw === "object") return Object.values(raw).filter((x) => x !== "" && x !== undefined).join(" ");
    return s(raw);
  }

  g.ClaireFiche = { getByPath, resolveField, expandFields, preview, nombreEnLettres, TRANSFORMS };
})(globalThis);
