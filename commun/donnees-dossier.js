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

  /** Pure : les parcelles d'un cadastre de fiche (`d.bien.cadastre` : { parcelles } ou l'ancienne forme { section, numero }). @param {any} cad */
  function parcellesCadastre(cad) {
    if (!cad || typeof cad !== 'object') return [];
    if (Array.isArray(cad.parcelles) && cad.parcelles.length) return cad.parcelles.filter(Boolean);
    return cad.section ? [cad] : [];
  }

  const DETAILS_PARCELLE = ['prefixe', 'commune', 'lieuDit', 'nature', 'surface', 'adresseCadastre'];

  /** Pure : une parcelle complétée par une autre (ce qui lui manque seulement). @param {any} a @param {any} b */
  function completerParcelle(a, b) {
    const r = Object.assign({}, a);
    DETAILS_PARCELLE.forEach((k) => { if ((r[k] == null || r[k] === '') && b && b[k] != null && b[k] !== '') r[k] = b[k]; });
    return r;
  }

  /**
   * Pure : une fiche bien d'Authentic fondue dans la liste des immeubles retenus — même adresse ou une parcelle commune = le même
   * immeuble (complété : ce qui manque, parcelles ajoutées, détails des parcelles), sinon ajouté. Rend la nouvelle liste, ou null si rien
   * ne change. 12 immeubles et 40 parcelles par immeuble au plus.
   * @param {any[]} immeubles @param {{ adresse?: string, codePostal?: string, commune?: string, type?: string, description?: string, parcelles?: any[], lots?: any[], tantiemesTotal?: any }} fiche
   */
  function fusionnerImmeubleAuthentic(immeubles, fiche) {
    const liste = (Array.isArray(immeubles) ? immeubles : []).slice();
    const nouv = Object.assign({}, fiche, { parcelles: (fiche.parcelles || []).filter((p) => cleParcelleSansCommune(p)).slice(0, 40) });
    const cles = (/** @type {any} */ im) => new Set((im.parcelles || []).map(cleParcelleSansCommune).filter(Boolean));
    const clesNouv = cles(nouv);
    const i = liste.findIndex((im) => (texte(nouv.adresse) && net(im.adresse) === net(nouv.adresse)) || [...cles(im)].some((c) => clesNouv.has(c)));
    if (i < 0) {
      if (!texte(nouv.adresse) && !nouv.parcelles.length && !(nouv.lots || []).length) return null;
      liste.push(nouv);
      return liste.slice(0, 12);
    }
    const ancien = liste[i];
    const parcelles = (ancien.parcelles || []).map((/** @type {any} */ p) => completerParcelle(p, nouv.parcelles.find((q) => cleParcelleSansCommune(q) === cleParcelleSansCommune(p))));
    nouv.parcelles.forEach((q) => { if (!parcelles.some((/** @type {any} */ p) => cleParcelleSansCommune(p) === cleParcelleSansCommune(q))) parcelles.push(q); });
    const fusion = Object.assign({}, ancien, Object.fromEntries(Object.entries(nouv).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))), { parcelles: parcelles.slice(0, 40) });
    if (JSON.stringify(fusion) === JSON.stringify(ancien)) return null;
    liste[i] = fusion;
    return liste;
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
   * Pure : les biens du dossier, toutes sources réunies — immeubles d'Authentic, bien principal de la fiche (adresse, cadastre, lots),
   * biens d'une succession —, sans doublon (même adresse ou une parcelle commune = le même bien), le bien principal d'abord.
   * Chaque bien : { adresse, codePostal, commune, type, lots, principal, sources: ['authentic'|'fiche'|'succession'],
   * parcelles: [{ prefixe, section, numero, commune, lieuDit, nature, surface, origine }] } ; une parcelle n'appartient qu'à un bien.
   * @param {any} d
   */
  function biensDossier(d) {
    if (!d || typeof d !== 'object') return [];
    /** @type {any[]} */
    const biens = [];
    const vues = new Map(); // clé sans commune → bien qui porte la parcelle
    const ajouterBien = (/** @type {any} */ src, /** @type {string} */ source, /** @type {boolean} */ principal) => {
      const adresse = texte(src.adresse);
      const loc = communeDeLAdresse(adresse);
      const commune = texte(src.commune) || loc.commune;
      const codePostal = texte(src.codePostal) || loc.codePostal;
      const parcelles = (src.parcelles || []).filter((/** @type {any} */ p) => cleParcelleSansCommune(p));
      // Le même bien : une parcelle commune, sinon la même adresse.
      let cible = null;
      for (const p of parcelles) { const b = vues.get(cleParcelleSansCommune(p)); if (b) { cible = b; break; } }
      if (!cible && adresse) cible = biens.find((b) => b.adresse && net(b.adresse) === net(adresse)) || null;
      if (!cible) {
        if (!adresse && !parcelles.length && !(src.lots || []).length) return;
        cible = { adresse, codePostal, commune, type: texte(src.type), lots: [], principal, sources: [], parcelles: [] };
        biens.push(cible);
      }
      if (!cible.sources.includes(source)) cible.sources.push(source);
      if (principal) cible.principal = true;
      if (!cible.adresse && adresse) cible.adresse = adresse;
      if (!cible.commune && commune) cible.commune = commune;
      if (!cible.codePostal && codePostal) cible.codePostal = codePostal;
      if (!cible.type && texte(src.type)) cible.type = texte(src.type);
      if (!cible.lots.length && Array.isArray(src.lots) && src.lots.length) cible.lots = src.lots.slice();
      parcelles.forEach((/** @type {any} */ p) => {
        const cle = cleParcelleSansCommune(p);
        const deja = vues.get(cle);
        if (deja) {
          const i = deja.parcelles.findIndex((/** @type {any} */ x) => cleParcelleSansCommune(x) === cle);
          if (i >= 0) deja.parcelles[i] = completerParcelle(deja.parcelles[i], p);
          return;
        }
        vues.set(cle, cible);
        const propre = { section: texte(p.section).toUpperCase(), numero: texte(p.numero).replace(/^0+(?=\d)/, ''), origine: source };
        DETAILS_PARCELLE.forEach((k) => { if (p[k] != null && p[k] !== '') /** @type {any} */ (propre)[k] = String(p[k]); });
        cible.parcelles.push(propre);
      });
    };
    const succession = d.typeAffaire === 'succession';
    // Le bien principal d'une vente (la fiche : adresse, cadastre, lots), puis tous les immeubles d'Authentic, puis les biens d'une succession.
    if (!succession) {
      const a = (d.bien && d.bien.adresse) || {};
      ajouterBien({ adresse: d.adresseBien, codePostal: a.codePostal, commune: a.commune, type: d.typeVente,
        parcelles: parcellesCadastre(d.bien && d.bien.cadastre), lots: d.bien && d.bien.lots }, 'fiche', true);
    }
    ((d.authentic && Array.isArray(d.authentic.immeubles)) ? d.authentic.immeubles : []).forEach((/** @type {any} */ im) => { if (im) ajouterBien(im, 'authentic', false); });
    (Array.isArray(d.biens) ? d.biens : []).forEach((/** @type {any} */ b) => {
      if (!b || typeof b !== 'object') return;
      // Un bien d'une succession porte ses parcelles en texte (« AB 12, AB 13 ») : lues comme telles.
      const parcelles = Array.isArray(b.parcelles) ? b.parcelles
        : String(b.parcelles || '').split(/[,;]/).map((x) => /^\s*(?:(\d{3})\s+)?([A-Z]{1,2})\s*0*(\d{1,4})\s*$/i.exec(x)).filter(Boolean).map((m) => ({ prefixe: m && m[1] || '', section: m ? m[2] : '', numero: m ? m[3] : '' }));
      ajouterBien({ adresse: b.adresse, type: b.type, parcelles }, 'succession', false);
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
    const g = (/** @type {string} */ k) => texte(p[k]) || texte(f && f[k]);
    return {
      role: texte(p.role).toUpperCase(), nom: texte(p.nom), morale, civilite: texte(p.civilite) || texte(f && f.civilite),
      prenom: g('prenom'), nomFamille: texte(f && f.nomFamille), nomUsage: g('nomUsage'), dateNaissance: g('dateNaissance'),
      lieuNaissance: g('lieuNaissance'), paysNaissance: texte(f && f.paysNaissance), domicile: texte(f && f.domicile) || texte(p.domicile),
      nationalite: texte(f && f.nationalite), profession: texte(f && f.profession) || texte(p.profession),
      situationMatrimoniale: (f && f.situationMatrimoniale) || null, deces: (f && f.deces) || null,
      emails: uniques([...(p.emails || []), ...((f && f.emails) || [])]), telephones: uniques([...(p.telephones || []), ...((f && f.telephones) || [])]),
      fiche: f || null
    };
  }

  /** Pure : les parties du dossier (un rôle, ou toutes) enrichies de leur fiche client. @param {any} d @param {string} [role] */
  function personnesDossier(d, role) {
    const r = texte(role).toUpperCase();
    return (Array.isArray(d && d.parties) ? d.parties : []).filter((p) => p && texte(p.nom) && (!r || texte(p.role).toUpperCase() === r)).map((p) => personneDossier(d, p));
  }

  exporter({ net, cleParcelleDossier, cleParcelleSansCommune, parcellesCadastre, completerParcelle, fusionnerImmeubleAuthentic, communeDeLAdresse,
    biensDossier, parcellesDossier, ficheClientDe, personneDossier, personnesDossier });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
