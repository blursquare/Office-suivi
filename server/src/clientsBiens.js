// @ts-check
'use strict';
// Clients et biens (étude 16/10 : « crée dans CLAIRE des fiches clients et biens à partir des données d'Authentic … si un client se retrouve
// dans un autre dossier ou un bien dans un autre dossier, on pourra les retrouver facilement » ; choix de l'étude : page « Clients et
// biens », Authentic fait foi, homonymes proposés puis confirmés).
//
// Pur : la base est CALCULÉE à chaque demande depuis les dossiers (fiches client et fiches bien d'Authentic gardées sur chaque dossier,
// parties, cadastre, biens des successions) — rien n'est recopié, Authentic reste la source. Seuls les choix de l'étude sont gardés à part
// (clé `clients-biens` : `liaisons` « même personne / personnes distinctes », `corrections` faites à la main).
//
// Une PERSONNE = des occurrences (une par dossier où elle paraît) réunies quand c'est sûr : même nom ET prénom ET date de naissance, ou
// même nom et prénom avec un email ou un téléphone en commun, ou dans le même dossier, ou confirmé par l'étude. Même nom et prénom sans date
// de naissance des deux côtés : PROPOSÉ (« peutEtre »), jamais réuni seul ; deux dates différentes : jamais la même personne.
// Un BIEN = même commune et une parcelle en commun (préfixe, section, numéro), sinon même adresse quand il n'a pas de parcelle.

const crypto = require('crypto');
const { adresseDecomposee } = require('./gnau');
const C = require('../../commun/constitution');

/** @param {any} v */
const texte = (v) => (v === undefined || v === null ? '' : String(v)).replace(/\s+/g, ' ').trim();
/** @param {string} t */
const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** @param {string} t */
const norm = (t) => sansAccents(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** @param {string} t */
const idCourt = (t) => crypto.createHash('sha1').update(t).digest('hex').slice(0, 12);

const ROLES = { VENDEUR: 'Vendeur', ACQUEREUR: 'Acquéreur', DEFUNT: 'Défunt', HERITIER: 'Héritier', PARTIE: 'Partie' };
/** Champs qu'une correction à la main peut changer. */
const CHAMPS_PERSONNE = ['civilite', 'nomFamille', 'prenom', 'nomUsage', 'dateNaissance', 'lieuNaissance', 'nationalite', 'profession', 'domicile', 'emails', 'telephones'];

/** Pure : « Paul MOREAU » → { nomFamille: 'MOREAU', prenom: 'Paul' } (mots en capitales = nom), sinon tout en nom. @param {string} complet */
function decouperNom(complet) {
  const mots = texte(complet).split(' ').filter(Boolean);
  const caps = mots.filter((m) => m.length >= 2 && m === m.toUpperCase() && /[A-ZÀ-Þ]/.test(m));
  if (!caps.length) return { nomFamille: texte(complet).toUpperCase(), prenom: '' };
  return { nomFamille: caps.join(' '), prenom: mots.filter((m) => !caps.includes(m)).join(' ') };
}

/** @param {any} d */
const libelleDossier = (d) => (d && d.typeAffaire === 'succession' ? 'SUCC - ' : 'VTE - ') + texte(d && d.nom);

/** @param {any} p @param {string} nomFamille @param {string} prenom */
function memeNom(p, nomFamille, prenom) {
  const n = ' ' + norm(p && p.nom) + ' ';
  const f = norm(nomFamille);
  const pr = norm(prenom).split(' ')[0] || '';
  return !!f && n.includes(' ' + f + ' ') && (!pr || n.includes(' ' + pr + ' '));
}

/**
 * Pure : les occurrences de personnes de tous les dossiers.
 * @param {any[]} dossiers
 */
function occurrencesPersonnes(dossiers) {
  /** @type {any[]} */
  const occ = [];
  for (const d of dossiers || []) {
    if (!d || d.deleted || !d.id) continue;
    const parties = Array.isArray(d.parties) ? d.parties : [];
    const fiches = Object.values((d.authentic && d.authentic.fichesClients) || {}).filter(Boolean);
    const comparants = (d.authentic && Array.isArray(d.authentic.comparants)) ? d.authentic.comparants : [];
    const vues = new Set();
    const roleDe = (/** @type {string} */ nomFamille, /** @type {string} */ prenom, /** @type {any} */ fiche) => {
      const c = comparants.find((x) => memeNom(x, nomFamille, prenom));
      if (c && c.role) return c.role;
      const p = parties.find((x) => x && memeNom(x, nomFamille, prenom));
      if (p && p.role) return p.role;
      return fiche && fiche.deces && d.typeAffaire === 'succession' ? 'DEFUNT' : 'PARTIE';
    };
    for (const f of fiches) {
      const nomFamille = texte(f.nomFamille) || decouperNom(f.nom).nomFamille;
      const prenom = texte(f.prenom) || decouperNom(f.nom).prenom;
      if (!nomFamille) continue;
      const cle = norm(nomFamille) + '|' + norm(prenom);
      vues.add(cle);
      occ.push({
        id: `${d.id}:${cle}`, dossier: d, cle, source: 'Authentic', vuLe: texte(f.vuLe),
        role: roleDe(nomFamille, prenom, f),
        champs: {
          civilite: texte(f.civilite), nomFamille: nomFamille.toUpperCase(), prenom, nomUsage: texte(f.nomUsage).toUpperCase(),
          dateNaissance: texte(f.dateNaissance).slice(0, 10), lieuNaissance: texte(f.lieuNaissance), nationalite: texte(f.nationalite),
          profession: texte(f.profession), domicile: texte(f.domicile),
          emails: (Array.isArray(f.emails) ? f.emails : []).map(texte).filter(Boolean),
          telephones: (Array.isArray(f.telephones) ? f.telephones : []).map(texte).filter(Boolean)
        },
        situation: f.situationMatrimoniale && typeof f.situationMatrimoniale === 'object' ? {
          situation: texte(f.situationMatrimoniale.situation), conjoint: texte(f.situationMatrimoniale.conjoint),
          regime: texte(f.situationMatrimoniale.regime || f.situationMatrimoniale.contrat), date: texte(f.situationMatrimoniale.dateMariage || f.situationMatrimoniale.date)
        } : null,
        deces: f.deces && typeof f.deces === 'object' ? { date: texte(f.deces.date), lieu: texte(f.deces.lieu) } : null
      });
    }
    for (const p of parties) {
      if (!p || !texte(p.nom) || p.qualitePersonne === 'morale') continue;
      const { nomFamille, prenom } = decouperNom(p.nom);
      const cle = norm(nomFamille) + '|' + norm(prenom);
      if (!norm(nomFamille) || vues.has(cle)) continue;
      vues.add(cle);
      occ.push({
        id: `${d.id}:${cle}`, dossier: d, cle, source: 'Fiche', vuLe: '', role: p.role && p.role !== 'PARTIE' ? p.role : roleDe(nomFamille, prenom, null),
        champs: { civilite: texte(p.civilite), nomFamille, prenom, nomUsage: texte(p.nomUsage).toUpperCase(), dateNaissance: texte(p.dateNaissance).slice(0, 10),
          lieuNaissance: '', nationalite: '', profession: '', domicile: '', emails: [], telephones: [] },
        situation: null, deces: null
      });
    }
  }
  return occ;
}

/** Union-find minimal. @param {string[]} ids */
function unionFind(ids) {
  /** @type {Map<string, string>} */
  const pere = new Map(ids.map((i) => [i, i]));
  const trouver = (/** @type {string} */ x) => { let r = x; while (pere.get(r) !== r) r = /** @type {string} */ (pere.get(r)); pere.set(x, r); return r; };
  const unir = (/** @type {string} */ a, /** @type {string} */ b) => { const ra = trouver(a); const rb = trouver(b); if (ra !== rb) pere.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  return { trouver, unir };
}

/** @param {string[]} a @param {string[]} b */
const communs = (a, b) => a.some((x) => b.map((y) => norm(y)).includes(norm(x)));
/** @param {any} occ */
const telephones9 = (occ) => occ.champs.telephones.map((/** @type {string} */ t) => t.replace(/\D/g, '').slice(-9)).filter((/** @type {string} */ t) => t.length === 9);

/**
 * Pure : la base des personnes. `reglages` = { liaisons: { 'occA#occB': 'meme' | 'distinct' }, corrections: [{ occ, champ, valeur, authentic }] }.
 * @param {any[]} dossiers @param {any} [reglages]
 */
function construirePersonnes(dossiers, reglages) {
  const r = reglages || {};
  const liaisons = (r.liaisons && typeof r.liaisons === 'object') ? r.liaisons : {};
  const occ = occurrencesPersonnes(dossiers);
  const uf = unionFind(occ.map((o) => o.id));
  const decision = (/** @type {string} */ a, /** @type {string} */ b) => liaisons[a + '#' + b] || liaisons[b + '#' + a] || '';
  const parCle = new Map();
  for (const o of occ) { if (!parCle.has(o.cle)) parCle.set(o.cle, []); parCle.get(o.cle).push(o); }
  /** @type {[string, string][]} */
  const aProposer = [];
  for (const groupe of parCle.values()) {
    for (let i = 0; i < groupe.length; i++) {
      for (let j = i + 1; j < groupe.length; j++) {
        const a = groupe[i]; const b = groupe[j];
        const dA = a.champs.dateNaissance; const dB = b.champs.dateNaissance;
        if (dA && dB && dA !== dB) continue; // deux naissances différentes : jamais la même personne
        const dec = decision(a.id, b.id);
        if (dec === 'distinct') continue;
        const sur = dec === 'meme' || a.dossier.id === b.dossier.id || (dA && dA === dB)
          || communs(a.champs.emails, b.champs.emails) || communs(telephones9(a), telephones9(b));
        if (sur) uf.unir(a.id, b.id); else aProposer.push([a.id, b.id]);
      }
    }
  }
  // Une liaison confirmée entre deux noms différents (nom d'usage, faute de frappe) : réunie aussi.
  for (const [k, v] of Object.entries(liaisons)) {
    if (v !== 'meme') continue;
    const [a, b] = k.split('#');
    if (a && b && occ.some((o) => o.id === a) && occ.some((o) => o.id === b)) uf.unir(a, b);
  }
  /** @type {Map<string, any[]>} */
  const groupes = new Map();
  for (const o of occ) { const g = uf.trouver(o.id); if (!groupes.has(g)) groupes.set(g, []); /** @type {any[]} */ (groupes.get(g)).push(o); }
  const corrections = Array.isArray(r.corrections) ? r.corrections : [];
  /** @type {any[]} */
  const personnes = [];
  /** @type {Map<string, string>} */
  const ficheDeOcc = new Map();
  for (const [racine, liste] of groupes) {
    const id = 'p' + idCourt(racine);
    // Authentic d'abord, la plus récente, puis la fiche du dossier.
    const tries = liste.slice().sort((x, y) => (x.source === y.source ? String(y.vuLe).localeCompare(String(x.vuLe)) : x.source === 'Authentic' ? -1 : 1));
    /** @type {Record<string, any>} */
    const champs = {};
    for (const k of CHAMPS_PERSONNE) {
      if (k === 'emails' || k === 'telephones') champs[k] = [...new Set(tries.flatMap((o) => o.champs[k]))].slice(0, 6);
      else champs[k] = (tries.find((o) => o.champs[k]) || { champs: {} }).champs[k] || '';
    }
    const authentic = Object.assign({}, champs);
    /** @type {any[]} */
    const aRevoir = [];
    for (const c of corrections) {
      if (!c || !CHAMPS_PERSONNE.includes(c.champ) || !liste.some((o) => o.id === c.occ)) continue;
      const actuel = JSON.stringify(authentic[c.champ]);
      if (c.authentic !== undefined && JSON.stringify(c.authentic) !== actuel && actuel !== JSON.stringify(c.valeur)) {
        // Authentic a changé depuis la correction : proposé, rien d'écrasé.
        aRevoir.push({ champ: c.champ, correction: c.valeur, authentic: authentic[c.champ], occ: c.occ });
      }
      champs[c.champ] = c.valeur;
    }
    const sit = (tries.find((o) => o.situation && o.situation.situation) || {}).situation || null;
    const deces = (tries.find((o) => o.deces && o.deces.date) || {}).deces || null;
    const dossiersLies = liste.map((o) => ({ id: o.dossier.id, libelle: libelleDossier(o.dossier), role: o.role, roleLibelle: ROLES[o.role] || 'Partie',
      archive: !!o.dossier.archive, succession: o.dossier.typeAffaire === 'succession' }));
    const vus = new Set();
    personnes.push({
      id, champs, authentic, aRevoir, situation: sit, deces, source: tries[0].source,
      nomComplet: [champs.prenom, champs.nomFamille].filter(Boolean).join(' '),
      dossiers: dossiersLies.filter((x) => (vus.has(x.id + x.role) ? false : (vus.add(x.id + x.role), true))),
      occurrences: liste.map((o) => o.id), conjoint: null, peutEtre: []
    });
    liste.forEach((o) => ficheDeOcc.set(o.id, id));
  }
  const parId = new Map(personnes.map((p) => [p.id, p]));
  // Homonymes à confirmer : un lien de chaque fiche vers l'autre, avec la paire d'occurrences à décider.
  for (const [a, b] of aProposer) {
    const pa = parId.get(ficheDeOcc.get(a)); const pb = parId.get(ficheDeOcc.get(b));
    if (!pa || !pb || pa === pb) continue;
    if (!pa.peutEtre.some((/** @type {any} */ x) => x.id === pb.id)) pa.peutEtre.push({ id: pb.id, nom: pb.nomComplet, dossiers: pb.dossiers.map((/** @type {any} */ x) => x.libelle), occA: a, occB: b });
    if (!pb.peutEtre.some((/** @type {any} */ x) => x.id === pa.id)) pb.peutEtre.push({ id: pa.id, nom: pa.nomComplet, dossiers: pa.dossiers.map((/** @type {any} */ x) => x.libelle), occA: b, occB: a });
  }
  // Conjoint (marié, pacsé, veuf, divorcé… comme dans Authentic) : le nom cité sur la fiche, retrouvé parmi les personnes qui partagent un
  // dossier, sinon une seule personne de ce nom dans toute la base.
  for (const p of personnes) {
    const nomConjoint = p.situation && p.situation.conjoint;
    if (!nomConjoint) continue;
    const mots = ' ' + norm(nomConjoint) + ' ';
    const correspond = (/** @type {any} */ q) => q !== p && !!norm(q.champs.nomFamille) && mots.includes(' ' + norm(q.champs.nomFamille) + ' ')
      && (!q.champs.prenom || mots.includes(' ' + norm(q.champs.prenom).split(' ')[0] + ' '));
    const memeDossier = personnes.filter((q) => correspond(q) && q.dossiers.some((/** @type {any} */ x) => p.dossiers.some((/** @type {any} */ y) => y.id === x.id)));
    const partout = personnes.filter(correspond);
    const q = memeDossier.length === 1 ? memeDossier[0] : partout.length === 1 ? partout[0] : null;
    p.conjoint = { nom: nomConjoint, situation: p.situation.situation, id: q ? q.id : null };
  }
  personnes.sort((x, y) => x.champs.nomFamille.localeCompare(y.champs.nomFamille, 'fr') || x.champs.prenom.localeCompare(y.champs.prenom, 'fr'));
  return personnes;
}

/** @param {any} p @param {string} commune */
function parcelleNette(p, commune) {
  const section = texte(p && p.section).toUpperCase();
  const numero = texte(p && p.numero).replace(/^0+(?=\d)/, '');
  if (!section || !numero) return null;
  const prefixe = /^0*$/.test(texte(p.prefixe)) ? '' : texte(p.prefixe);
  const m2 = p.surface !== undefined && p.surface !== null && p.surface !== '' ? C.centiaresDepuisContenance(texte(p.surface)) : null;
  return { prefixe, section, numero, surface: m2, nature: texte(p.nature), lieuDit: texte(p.lieuDit), commune: texte(p.commune || commune).toUpperCase() };
}

/** Pure : les occurrences de biens (ventes : adresse + cadastre + lots ; successions : immeubles d'Authentic). @param {any[]} dossiers */
function occurrencesBiens(dossiers) {
  /** @type {any[]} */
  const occ = [];
  for (const d of dossiers || []) {
    if (!d || d.deleted || !d.id) continue;
    if (d.typeAffaire === 'succession') {
      const ims = (d.authentic && Array.isArray(d.authentic.immeubles)) ? d.authentic.immeubles : [];
      ims.forEach((/** @type {any} */ im, /** @type {number} */ i) => {
        const adr = adresseDecomposee(texte(im && im.adresse), { codePostal: im && im.codePostal, commune: im && im.commune });
        const parcelles = ((im && im.parcelles) || []).map((/** @type {any} */ p) => parcelleNette(p, adr.commune)).filter(Boolean);
        if (!parcelles.length && !adr.voie && !adr.lieuDit) return;
        occ.push({ id: `${d.id}:im${i}`, dossier: d, adresse: texte(im.adresse), commune: adr.commune, codePostal: adr.codePostal, parcelles,
          lots: Array.isArray(im.lots) ? im.lots : [], type: texte(im.type) });
      });
      continue;
    }
    const adr = adresseDecomposee(texte(d.adresseBien));
    const cad = d.bien && d.bien.cadastre;
    const brutes = cad ? (Array.isArray(cad.parcelles) && cad.parcelles.length ? cad.parcelles : (cad.section ? [cad] : [])) : [];
    const parcelles = brutes.map((/** @type {any} */ p) => parcelleNette(p, adr.commune)).filter(Boolean);
    if (!parcelles.length && !texte(d.adresseBien)) continue;
    occ.push({ id: `${d.id}:bien`, dossier: d, adresse: texte(d.adresseBien), commune: adr.commune, codePostal: adr.codePostal, parcelles,
      lots: d.bien && Array.isArray(d.bien.lots) ? d.bien.lots : [], type: texte(d.typeVente) });
  }
  return occ;
}

/** Pure : la base des biens. @param {any[]} dossiers */
function construireBiens(dossiers) {
  const occ = occurrencesBiens(dossiers);
  const uf = unionFind(occ.map((o) => o.id));
  const cleParcelle = (/** @type {any} */ p) => [norm(p.commune), p.prefixe, p.section, p.numero].join('|');
  const parParcelle = new Map();
  const parAdresse = new Map();
  for (const o of occ) {
    for (const p of o.parcelles) { const k = cleParcelle(p); if (parParcelle.has(k)) uf.unir(parParcelle.get(k), o.id); else parParcelle.set(k, o.id); }
    if (!o.parcelles.length && o.adresse) {
      const k = norm(o.adresse);
      if (parAdresse.has(k)) uf.unir(parAdresse.get(k), o.id); else parAdresse.set(k, o.id);
    }
  }
  /** @type {Map<string, any[]>} */
  const groupes = new Map();
  for (const o of occ) { const g = uf.trouver(o.id); if (!groupes.has(g)) groupes.set(g, []); /** @type {any[]} */ (groupes.get(g)).push(o); }
  /** @type {any[]} */
  const biens = [];
  for (const [racine, liste] of groupes) {
    /** @type {Map<string, any>} */
    const parcelles = new Map();
    for (const o of liste) for (const p of o.parcelles) {
      const k = cleParcelle(p);
      const avant = parcelles.get(k);
      parcelles.set(k, avant ? Object.assign({}, p, Object.fromEntries(Object.entries(avant).filter(([, v]) => v !== '' && v !== null))) : p);
    }
    const ps = [...parcelles.values()];
    const total = ps.length && ps.every((p) => typeof p.surface === 'number') ? ps.reduce((s, p) => s + p.surface, 0) : null;
    const principal = liste.find((o) => o.adresse) || liste[0];
    const vus = new Set();
    biens.push({
      id: 'b' + idCourt(racine), adresse: principal.adresse, commune: principal.commune, codePostal: principal.codePostal,
      type: (liste.find((o) => o.type) || {}).type || '', parcelles: ps, surfaceTotale: total,
      lots: liste.flatMap((o) => o.lots || []).slice(0, 40),
      dossiers: liste.map((o) => ({ id: o.dossier.id, libelle: libelleDossier(o.dossier), archive: !!o.dossier.archive, succession: o.dossier.typeAffaire === 'succession' }))
        .filter((x) => (vus.has(x.id) ? false : (vus.add(x.id), true))),
      occurrences: liste.map((o) => o.id)
    });
  }
  biens.sort((x, y) => x.commune.localeCompare(y.commune, 'fr') || x.adresse.localeCompare(y.adresse, 'fr'));
  return biens;
}

/** Pure : un résumé pour la liste. @param {any} p */
const resumePersonne = (p) => ({ id: p.id, nom: p.nomComplet, civilite: p.champs.civilite, naissance: p.champs.dateNaissance, commune: (adresseDecomposee(p.champs.domicile).commune || ''),
  dossiers: p.dossiers.length, peutEtre: p.peutEtre.length, aRevoir: p.aRevoir.length, decede: !!p.deces });
/** @param {any} b */
const resumeBien = (b) => ({ id: b.id, adresse: b.adresse, commune: b.commune, parcelles: b.parcelles.map((/** @type {any} */ p) => [p.prefixe, p.section, p.numero].filter(Boolean).join(' ')).slice(0, 6),
  dossiers: b.dossiers.length });

/**
 * Pure : la recherche — tous les mots dans le nom, la commune, l'adresse, la parcelle (« AB 12 ») ou les dossiers liés.
 * @param {{ personnes: any[], biens: any[] }} base @param {string} q
 */
function chercherClientsBiens(base, q) {
  const mots = norm(q).split(' ').filter(Boolean);
  const ok = (/** @type {string} */ t) => !mots.length || mots.every((m) => (' ' + norm(t) + ' ').includes(' ' + m) );
  // Une personne par son nom (et son nom d'usage) seulement : chercher « PETIT » ne liste pas tous ceux d'un dossier « PETIT / ROUX ».
  const personnes = base.personnes.filter((p) => ok([p.nomComplet, p.champs.nomUsage].join(' ')));
  const biens = base.biens.filter((b) => ok([b.adresse, b.commune, ...b.parcelles.map((/** @type {any} */ p) => `${p.section} ${p.numero} ${p.section}${p.numero} ${p.lieuDit}`), ...b.dossiers.map((/** @type {any} */ x) => x.libelle)].join(' ')));
  return { personnes: personnes.slice(0, 80).map(resumePersonne), biens: biens.slice(0, 80).map(resumeBien), total: { personnes: personnes.length, biens: biens.length } };
}

/** Pure : les fiches d'un dossier (pour les liens de sa fiche). @param {{ personnes: any[], biens: any[] }} base @param {string} dossierId */
function fichesDuDossier(base, dossierId) {
  return {
    personnes: base.personnes.filter((p) => p.dossiers.some((/** @type {any} */ x) => x.id === dossierId))
      .map((p) => ({ id: p.id, nom: p.nomComplet, role: (p.dossiers.find((/** @type {any} */ x) => x.id === dossierId) || {}).roleLibelle || 'Partie',
        autresDossiers: p.dossiers.filter((/** @type {any} */ x) => x.id !== dossierId).length, peutEtre: p.peutEtre.length })),
    biens: base.biens.filter((b) => b.dossiers.some((/** @type {any} */ x) => x.id === dossierId))
      .map((b) => ({ id: b.id, libelle: b.adresse || b.parcelles.map((/** @type {any} */ p) => `${p.section} ${p.numero}`).join(', '), autresDossiers: b.dossiers.filter((/** @type {any} */ x) => x.id !== dossierId).length }))
  };
}

/** Pure : la base entière. @param {any[]} dossiers @param {any} [reglages] */
function construireBase(dossiers, reglages) {
  return { personnes: construirePersonnes(dossiers, reglages), biens: construireBiens(dossiers) };
}

/** Pure : les réglages gardés, assainis (liaisons et corrections seulement, bornés). @param {any} brut */
function assainirReglagesClientsBiens(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  /** @type {Record<string, string>} */
  const liaisons = {};
  for (const [k, v] of Object.entries(b.liaisons || {}).slice(0, 5000)) {
    if (/^[^#]{1,200}#[^#]{1,200}$/.test(k) && (v === 'meme' || v === 'distinct')) liaisons[k] = v;
  }
  const corrections = (Array.isArray(b.corrections) ? b.corrections : []).filter((c) => c && typeof c.occ === 'string' && c.occ.length <= 200 && CHAMPS_PERSONNE.includes(c.champ))
    .slice(-2000).map((c) => ({ occ: c.occ, champ: c.champ, valeur: valeurCorrection(c.champ, c.valeur), authentic: c.authentic === undefined ? undefined : valeurCorrection(c.champ, c.authentic), le: texte(c.le).slice(0, 30) }));
  return { liaisons, corrections };
}

/** @param {string} champ @param {any} v */
function valeurCorrection(champ, v) {
  if (champ === 'emails' || champ === 'telephones') return (Array.isArray(v) ? v : String(v || '').split(/[;,]/)).map(texte).filter(Boolean).slice(0, 6).map((/** @type {string} */ x) => x.slice(0, 120));
  return texte(v).slice(0, 200);
}

module.exports = { CHAMPS_PERSONNE, decouperNom, occurrencesPersonnes, construirePersonnes, construireBiens, construireBase, chercherClientsBiens, fichesDuDossier,
  resumePersonne, resumeBien, assainirReglagesClientsBiens, valeurCorrection };
