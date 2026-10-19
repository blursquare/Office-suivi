// @ts-check
// Les données d'un dossier venues d'Authentic, lues de la MÊME façon par tous les outils (étude 16/10 : « la connexion entre Authentic et
// CLAIRE est bancale ; parfois tout le contenu est dans un outil mais pas dans un autre »). Authentic range ce qu'il donne à plusieurs
// endroits de la fiche — les immeubles entiers (`d.authentic.immeubles`), le bien principal (`d.bien`, `d.adresseBien`), les biens d'une
// succession (`d.biens`), les fiches client entières (`d.authentic.fichesClients`) à côté des parties (`d.parties`) — et chaque outil
// lisait le sien : la Constitution voyait toutes les parcelles, le contrôle de l'urbanisme celles du bien principal seulement, Clients et
// biens aucune des autres d'une vente… Ce module les réunit : un outil qui a besoin des biens, des parcelles ou de la fiche d'une personne
// passe par lui. Pur : poste, serveur et tests ; rien n'y lit le réseau ni le DOM.
(function (exporter) {
  'use strict';

  /** Pure : un texte sans accent, en minuscules, la ponctuation réduite à un espace (« SAINT-AIGNAN » = « saint aignan »). @param {unknown} t */
  function net(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  /** @param {unknown} t */
  function texte(t) { return String(t == null ? '' : t).trim(); }

  /** Pure : la clé d'une parcelle (préfixe 000 ignoré, zéros de tête du numéro retirés), '' si section ou numéro manque. @param {any} p @param {string} [commune] */
  function cleParcelleDossier(p, commune) {
    const section = texte(p && p.section).toUpperCase();
    const numero = texte(p && p.numero).replace(/^0+(?=\d)/, '');
    if (!section || !numero) return '';
    const prefixe = /^0*$/.test(texte(p && p.prefixe)) ? '' : texte(p.prefixe);
    return [net(commune || (p && p.commune)).replace(/\bsaint(e?)\b/g, 'st$1'), prefixe, section, numero].join('|');
  }

  /** Pure : la clé d'une parcelle sans sa commune (pour reconnaître la même parcelle quand une source ne donne pas la commune). @param {any} p */
  function cleParcelleSansCommune(p) { const c = cleParcelleDossier(p, '-'); return c ? c.slice(c.indexOf('|') + 1) : ''; }

  /** Pure : un nom de commune réduit pour comparer (« SAINT-AIGNAN » = « st aignan »). @param {unknown} c */
  function communeNette(c) { return net(c).replace(/\bsaint(e?)\b/g, 'st$1').replace(/\bsur\b/g, 's'); }

  /**
   * Pure : deux lieux sont-ils la même commune ? true / false / null (inconnu : une des deux sans code postal ni commune). Deux codes
   * postaux différents = deux communes ; sinon le nom, « ST AIGNAN » = « SAINT-AIGNAN », et un nom suivi de « -sur-… »
   * (« SAINT-AIGNAN » / « SAINT-AIGNAN-SUR-CHER »).
   * @param {{ commune?: string, codePostal?: string }} a @param {{ commune?: string, codePostal?: string }} b
   */
  function memeCommune(a, b) {
    const cpa = texte(a && a.codePostal); const cpb = texte(b && b.codePostal);
    const na = communeNette(a && a.commune); const nb = communeNette(b && b.commune);
    if (cpa && cpb && cpa !== cpb) return false;
    // Un nom plus long n'est la même commune que par un « -sur-… » ajouté (« SAINT-AIGNAN » / « SAINT-AIGNAN-SUR-CHER »).
    if (na && nb) return na === nb || na.startsWith(nb + ' s ') || nb.startsWith(na + ' s ');
    if (cpa && cpb) return true;
    return null;
  }

  /** @param {unknown} v */
  function liste(v) { return Array.isArray(v) ? v : []; }

  /** Pure : les parcelles d'un cadastre de fiche (`d.bien.cadastre` : { parcelles } ou l'ancienne forme { section, numero }). @param {any} cad */
  function parcellesCadastre(cad) {
    if (!cad || typeof cad !== 'object') return [];
    if (Array.isArray(cad.parcelles) && cad.parcelles.length) return cad.parcelles.filter(Boolean);
    return cad.section ? [cad] : [];
  }

  const DETAILS_PARCELLE = ['prefixe', 'commune', 'lieuDit', 'nature', 'surface', 'adresseCadastre', 'zone', 'spf'];

  /** Pure : une parcelle complétée par une autre (ce qui lui manque seulement). @param {any} a @param {any} b */
  function completerParcelle(a, b) {
    const r = Object.assign({}, a);
    DETAILS_PARCELLE.forEach((k) => { if ((r[k] == null || r[k] === '') && b && b[k] != null && b[k] !== '') r[k] = b[k]; });
    return r;
  }

  /**
   * Pure : une fiche bien d'Authentic fondue dans la liste des immeubles retenus — le même immeuble = la même adresse, ou une parcelle
   * commune DANS LA MÊME COMMUNE (« AB 12 » existe presque partout : deux communes différentes ne sont jamais réunies) ; il est complété
   * (ce qui lui manque, parcelles ajoutées, détails des parcelles), sinon la fiche est ajoutée. `seulementCompleter` : l'adresse, la
   * commune et le code postal de l'immeuble retenu ne sont jamais remplacés (seuls les vides sont remplis). Rend la nouvelle liste, ou
   * null si rien ne change. 12 immeubles et 40 parcelles par immeuble au plus.
   * @param {any[]} immeubles @param {{ adresse?: string, codePostal?: string, commune?: string, type?: string, description?: string, parcelles?: any[], lots?: any[], tantiemesTotal?: any }} fiche
   * @param {{ seulementCompleter?: boolean }} [o]
   */
  function fusionnerImmeubleAuthentic(immeubles, fiche, o) {
    const liste_ = liste(immeubles).filter((im) => im && typeof im === 'object').slice();
    // Le lieu d'un immeuble : sa commune, sinon celle de son adresse, sinon celle portée par ses parcelles (terres, bois sans adresse).
    const lieu = (/** @type {any} */ im) => {
      const l = communeDeLAdresse(texte(im.adresse));
      const deParcelle = (liste(im.parcelles).find((/** @type {any} */ p) => p && texte(p.commune)) || {}).commune;
      return { commune: texte(im.commune) || l.commune || texte(deParcelle), codePostal: texte(im.codePostal) || l.codePostal };
    };
    const nouv = Object.assign({}, fiche, { parcelles: liste(fiche && fiche.parcelles).filter((p) => cleParcelleSansCommune(p)).slice(0, 40) });
    const lieuNouv = lieu(nouv);
    const cles = (/** @type {any} */ im) => new Set(liste(im.parcelles).map(cleParcelleSansCommune).filter(Boolean));
    const clesNouv = cles(nouv);
    const i = liste_.findIndex((im) => {
      const meme = memeCommune(lieu(im), lieuNouv);
      if (meme === false) return false;
      // Commune inconnue d'un côté : la parcelle commune suffit, sauf pour compléter un « autre bien » (il faut la même commune connue).
      // (un immeuble retenu sans aucun lieu n'a rien à contredire : sa parcelle commune suffit aussi pour le compléter).
      const lieuIm = lieu(im);
      const lieuSur = meme === true || (meme === null && (!(o && o.seulementCompleter) || (!lieuIm.commune && !lieuIm.codePostal)));
      return (texte(nouv.adresse) && net(im.adresse) === net(nouv.adresse)) || (lieuSur && [...cles(im)].some((c) => clesNouv.has(c)));
    });
    if (i < 0) {
      if (!texte(nouv.adresse) && !nouv.parcelles.length && !liste(nouv.lots).length) return null;
      liste_.push(nouv);
      return liste_.slice(0, 12);
    }
    const ancien = liste_[i];
    const parcelles = liste(ancien.parcelles).map((/** @type {any} */ p) => completerParcelle(p, nouv.parcelles.find((q) => cleParcelleSansCommune(q) === cleParcelleSansCommune(p))));
    nouv.parcelles.forEach((q) => { if (!parcelles.some((/** @type {any} */ p) => cleParcelleSansCommune(p) === cleParcelleSansCommune(q))) parcelles.push(q); });
    const proteges = (o && o.seulementCompleter) ? ['adresse', 'commune', 'codePostal'] : [];
    const apports = Object.fromEntries(Object.entries(nouv).filter(([k, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)
      && !(proteges.includes(k) && texte(ancien[k]))));
    const fusion = Object.assign({}, ancien, apports, { parcelles: parcelles.slice(0, 40) });
    if (JSON.stringify(fusion) === JSON.stringify(ancien)) return null;
    liste_[i] = fusion;
    return liste_;
  }

  /**
   * Pure : les immeubles d'Authentic sans les parcelles « égarées » — une parcelle portée par un immeuble d'une AUTRE commune dont la voie
   * est celle que la parcelle désigne (lieu-dit ou adresse cadastrale). Succession VIEL (19/10) : la maison de Cour-Cheverny avait reçu
   * « CJ 99 37 rue Dulong » du bien de Paris, et une parcelle commune réunissait les deux biens en un seul. Rend la même liste si rien n'est retiré.
   * @param {any[]} immeubles
   */
  function immeublesSansParcellesEgarees(immeubles) {
    const tous = liste(immeubles).filter((im) => im && typeof im === 'object');
    const lieu = (/** @type {any} */ im) => { const l = communeDeLAdresse(texte(im.adresse)); return { commune: texte(im.commune) || l.commune, codePostal: texte(im.codePostal) || l.codePostal }; };
    // La voie d'une adresse de CLAIRE (« PARIS (75017), 37 rue Dulong » → « 37 rue dulong »), ou d'une adresse postale avant le code postal.
    const voie = (/** @type {any} */ im) => { const t = texte(im.adresse); const v = t.includes(',') ? t.slice(t.indexOf(',') + 1) : t.replace(/\b\d{5}\b.*$/, ''); return net(v); };
    let change = false;
    const resultat = tous.map((im) => {
      const parcelles = liste(im.parcelles).filter((/** @type {any} */ p) => {
        const cle = p && cleParcelleSansCommune(p);
        const dit = net([p && p.lieuDit, p && p.adresseCadastre].filter(Boolean).join(' '));
        if (!cle || !dit) return true;
        const ailleurs = tous.some((autre) => autre !== im && memeCommune(lieu(autre), lieu(im)) === false
          && liste(autre.parcelles).some((/** @type {any} */ q) => cleParcelleSansCommune(q) === cle)
          && voie(autre).length >= 6 && dit.includes(voie(autre)));
        if (ailleurs) change = true;
        return !ailleurs;
      });
      return parcelles.length === liste(im.parcelles).length ? im : Object.assign({}, im, { parcelles });
    });
    return change ? resultat : immeubles;
  }

  /** Pure : { commune, codePostal } d'une adresse au format de CLAIRE (« COMMUNE (41000), 9 rue… ») ou postal (« 41000 COMMUNE »). @param {string} adresse */
  function communeDeLAdresse(adresse) {
    const t = texte(adresse);
    const m = /^\s*(.+?)\s*\((\d{5})\)/.exec(t);
    if (m) return { commune: m[1].trim(), codePostal: m[2] };
    const l = /\b(\d{5})\s+([A-Za-zÀ-ÿ][^,\d]*)/.exec(t);
    return l ? { commune: l[2].trim(), codePostal: l[1] } : { commune: '', codePostal: '' };
  }

  /**
   * Pure : les biens du dossier, toutes sources réunies — immeubles d'Authentic d'abord, bien principal de la fiche (adresse, cadastre, lots),
   * biens d'une succession —, sans doublon (même adresse ou une parcelle commune = le même bien), le bien principal d'abord.
   * Chaque bien : { adresse, codePostal, commune, type, lots, principal, sources: ['authentic'|'fiche'|'succession'],
   * parcelles: [{ prefixe, section, numero, commune, lieuDit, nature, surface, origine }] } ; une parcelle n'appartient qu'à un bien.
   * @param {any} d
   */
  function biensDossier(d) {
    if (!d || typeof d !== 'object') return [];
    /** @type {any[]} */
    const biens = [];
    // clé sans commune → [{ bien, commune, codePostal }] : la même parcelle n'est réunie que dans la même commune (ou commune inconnue).
    const vues = new Map();
    const trouver = (/** @type {string} */ cle, /** @type {any} */ lieu) => (vues.get(cle) || []).find((/** @type {any} */ v) => memeCommune(v, lieu) !== false) || null;
    const ajouterBien = (/** @type {any} */ src, /** @type {string} */ source, /** @type {boolean} */ principal) => {
      const adresse = texte(src.adresse);
      const loc = communeDeLAdresse(adresse);
      const commune = texte(src.commune) || loc.commune;
      const codePostal = texte(src.codePostal) || loc.codePostal;
      const parcelles = liste(src.parcelles).filter((/** @type {any} */ p) => p && typeof p === 'object' && cleParcelleSansCommune(p));
      const lieuDe = (/** @type {any} */ p) => ({ commune: texte(p.commune) || commune, codePostal: texte(p.commune) ? '' : codePostal });
      // Le même bien : une parcelle commune dans la même commune, sinon la même adresse.
      let cible = null;
      // Une parcelle commune ne réunit pas deux biens de communes différentes (« CJ 99 » à Paris et à Cour-Cheverny, 19/10) — sauf si la
      // parcelle porte sa propre commune (elle a déjà été comparée par `trouver`).
      for (const p of parcelles) { const v = trouver(cleParcelleSansCommune(p), lieuDe(p)); if (v && (texte(p.commune) || memeCommune({ commune: v.bien.commune, codePostal: v.bien.codePostal }, { commune, codePostal }) !== false)) { cible = v.bien; break; } }
      if (!cible && adresse) cible = biens.find((b) => b.adresse && net(b.adresse) === net(adresse)) || null;
      if (!cible) {
        if (!adresse && !parcelles.length && !liste(src.lots).length) return;
        cible = { adresse, codePostal, commune, type: texte(src.type), description: '', details: [], lots: [], principal, sources: [], parcelles: [] };
        biens.push(cible);
      }
      if (!cible.sources.includes(source)) cible.sources.push(source);
      if (principal) cible.principal = true;
      if (!cible.adresse && adresse) cible.adresse = adresse;
      if (!cible.commune && commune) cible.commune = commune;
      if (!cible.codePostal && codePostal) cible.codePostal = codePostal;
      if (!cible.type && texte(src.type)) cible.type = texte(src.type);
      // Tout ce que la fiche bien d'Authentic dit d'autre (désignation, lotissement, surfaces… — étude 17/10).
      if (!cible.description && texte(src.description)) cible.description = texte(src.description);
      if (!cible.details.length && liste(src.details).length) cible.details = liste(src.details).filter((/** @type {any} */ x) => x && texte(x.libelle) && texte(x.valeur)).slice(0, 30);
      // Les lots : ceux de la fiche (tenus à jour par chaque page « Lots » d'Authentic) l'emportent sur ceux d'un immeuble retenu.
      if (liste(src.lots).length && (!cible.lots.length || source === 'fiche')) cible.lots = src.lots.slice();
      parcelles.forEach((/** @type {any} */ p) => {
        const cle = cleParcelleSansCommune(p);
        // Le bien principal d'une vente garde TOUTES les parcelles de ses biens (étude 19/10) : une parcelle sans commune propre déjà portée
        // par un seul autre bien est la sienne, pas une parcelle de plus du bien principal.
        const seul = (vues.get(cle) || []).length === 1 ? /** @type {any} */ (vues.get(cle))[0] : null;
        const v = trouver(cle, lieuDe(p)) || (source === 'fiche' && !texte(p.commune) ? seul : null);
        if (v) {
          const i = v.bien.parcelles.findIndex((/** @type {any} */ x) => cleParcelleSansCommune(x) === cle && memeCommune({ commune: x.commune || v.bien.commune }, lieuDe(p)) !== false);
          if (i >= 0) v.bien.parcelles[i] = completerParcelle(v.bien.parcelles[i], p);
          return;
        }
        if (!vues.has(cle)) vues.set(cle, []);
        vues.get(cle).push(Object.assign({ bien: cible }, lieuDe(p)));
        const propre = { section: texte(p.section).toUpperCase(), numero: texte(p.numero).replace(/^0+(?=\d)/, ''), origine: source };
        DETAILS_PARCELLE.forEach((k) => { if (p[k] != null && p[k] !== '') /** @type {any} */ (propre)[k] = String(p[k]); });
        cible.parcelles.push(propre);
      });
    };
    const succession = d.typeAffaire === 'succession';
    // Authentic d'abord (son ordre des parcelles, ses adresses), puis le bien principal d'une vente (la fiche : adresse, cadastre, lots),
    // puis les biens d'une succession.
    liste(immeublesSansParcellesEgarees(liste(d.authentic && d.authentic.immeubles))).forEach((/** @type {any} */ im) => { if (im && typeof im === 'object') ajouterBien(im, 'authentic', false); });
    if (!succession) {
      const a = (d.bien && d.bien.adresse) || {};
      ajouterBien({ adresse: d.adresseBien, codePostal: a.codePostal, commune: a.commune, type: d.typeVente,
        parcelles: parcellesCadastre(d.bien && d.bien.cadastre), lots: d.bien && d.bien.lots }, 'fiche', true);
    }
    liste(d.biens).forEach((/** @type {any} */ b) => {
      if (!b || typeof b !== 'object') return;
      // Un bien d'une succession porte ses parcelles en texte (« AB 12, AB 13 ») : lues comme telles.
      const parcelles = Array.isArray(b.parcelles) ? b.parcelles
        : String(b.parcelles || '').split(/[,;]/).map((x) => /^\s*(?:(\d{3})\s+)?([A-Z]{1,2})\s*0*(\d{1,4})\s*$/i.exec(x)).filter(Boolean).map((m) => ({ prefixe: m && m[1] || '', section: m ? m[2] : '', numero: m ? m[3] : '' }));
      ajouterBien({ adresse: b.adresse, type: b.type, parcelles, description: b.description, details: b.details, lots: b.lots }, 'succession', false);
    });
    // La commune de chaque parcelle : la sienne, sinon celle de son bien.
    biens.forEach((b) => b.parcelles.forEach((/** @type {any} */ p) => { if (!p.commune && b.commune) p.commune = b.commune; }));
    return biens.sort((x, y) => (y.principal ? 1 : 0) - (x.principal ? 1 : 0));
  }

  /** Pure : toutes les parcelles du dossier, chacune avec son bien (adresse, code postal) — sans doublon. @param {any} d */
  function parcellesDossier(d) {
    return biensDossier(d).flatMap((b) => b.parcelles.map((/** @type {any} */ p) => Object.assign({}, p, { codePostal: b.codePostal, adresseBien: b.adresse, principal: !!b.principal })));
  }

  /** Pure : les mots d'un nom (sans accent, sans civilité). @param {unknown} nom */
  function motsNom(nom) {
    return net(nom).split(' ').filter((m) => m && !['m', 'mr', 'mme', 'mlle', 'monsieur', 'madame', 'mademoiselle', 'et', 'epoux', 'epouse', 'nee', 'ne'].includes(m));
  }

  /**
   * Pure : la fiche client d'Authentic d'une personne du dossier (son nom complet), ou null — le même nom (mots dans n'importe quel ordre),
   * sinon une seule fiche dont tous les mots (deux au moins) sont dans l'autre nom ; jamais deux fiches candidates.
   * @param {any} d @param {string} nom
   */
  function ficheClientDe(d, nom) {
    const fiches = Object.values((d && d.authentic && d.authentic.fichesClients) || {}).filter((f) => f && typeof f === 'object');
    const m = motsNom(nom);
    if (!m.length) return null;
    const cle = m.slice().sort().join(' ');
    const egal = fiches.filter((f) => motsNom(/** @type {any} */ (f).nom).slice().sort().join(' ') === cle);
    if (egal.length === 1) return egal[0];
    if (egal.length > 1) return null;
    const inclus = fiches.filter((f) => {
      const mf = motsNom(/** @type {any} */ (f).nom);
      const [a, b] = mf.length <= m.length ? [mf, m] : [m, mf];
      return a.length >= 2 && a.every((x) => b.includes(x));
    });
    return inclus.length === 1 ? inclus[0] : null;
  }

  /**
   * Pure : une partie du dossier enrichie de sa fiche client d'Authentic — ce que la fiche a et que la partie n'a pas (identité,
   * naissance, domicile, nationalité, profession, situation, décès), emails et téléphones réunis sans doublon. `fiche` = la fiche trouvée.
   * @param {any} d @param {any} partie
   */
  function personneDossier(d, partie) {
    const p = partie && typeof partie === 'object' ? partie : {};
    const morale = p.qualitePersonne === 'morale';
    const f = morale ? null : /** @type {any} */ (ficheClientDe(d, p.nom));
    const uniques = (/** @type {any[]} */ a) => [...new Map(a.map((x) => texte(x)).filter(Boolean).map((x) => [net(x), x])).values()];
    const enListe = (/** @type {any} */ v) => (Array.isArray(v) ? v : (typeof v === 'string' && v.trim() ? v.split(/[;,]/) : []));
    const g = (/** @type {string} */ k) => texte(p[k]) || texte(f && f[k]);
    return {
      role: texte(p.role).toUpperCase(), nom: texte(p.nom), morale, civilite: texte(p.civilite) || texte(f && f.civilite),
      prenom: g('prenom'), nomFamille: texte(f && f.nomFamille), nomUsage: g('nomUsage'), dateNaissance: g('dateNaissance'),
      lieuNaissance: g('lieuNaissance'), paysNaissance: texte(f && f.paysNaissance), domicile: texte(f && f.domicile) || texte(p.domicile),
      nationalite: texte(f && f.nationalite), profession: texte(f && f.profession) || texte(p.profession),
      situationMatrimoniale: (f && f.situationMatrimoniale) || null, deces: (f && f.deces) || null,
      emails: uniques([...enListe(p.emails), ...enListe(f && f.emails)]), telephones: uniques([...enListe(p.telephones), ...enListe(f && f.telephones)]),
      fiche: f || null
    };
  }

  /** Pure : les parties du dossier (un rôle, ou toutes) enrichies de leur fiche client. @param {any} d @param {string} [role] */
  function personnesDossier(d, role) {
    const r = texte(role).toUpperCase();
    return (Array.isArray(d && d.parties) ? d.parties : []).filter((p) => p && texte(p.nom) && (!r || texte(p.role).toUpperCase() === r)).map((p) => personneDossier(d, p));
  }

  exporter({ memeCommune, communeNette, cleParcelleDossier, cleParcelleSansCommune, parcellesCadastre, completerParcelle, fusionnerImmeubleAuthentic, immeublesSansParcellesEgarees, communeDeLAdresse,
    biensDossier, parcellesDossier, ficheClientDe, personneDossier, personnesDossier });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
