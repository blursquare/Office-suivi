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
const DD = require('../../commun/donnees-dossier');

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
  // « Marie DUPONT épouse MARTIN », « … veuve de … », « … née … » : la personne s'arrête avant le lien (relecture 16/10).
  const avantLien = texte(complet).split(/\s+(?:[ée]pouse|[ée]poux|veuve?|n[ée]e?|divorc[ée]e?)\b/i)[0];
  const mots = texte(avantLien).split(' ').filter(Boolean);
  const caps = mots.filter((m) => m.length >= 2 && m === m.toUpperCase() && /[A-ZÀ-Þ]/.test(m));
  if (!caps.length) return { nomFamille: texte(complet).toUpperCase(), prenom: '' };
  return { nomFamille: caps.join(' '), prenom: mots.filter((m) => !caps.includes(m)).join(' ') };
}

/**
 * Pure : le reste de la fiche client d'Authentic (capacité, coordonnées commentées, mariage, contrats, historique des relations — étude 16/10 :
 * « reprends tout le contenu de la fiche ») recopié tel quel, borné : chaînes de 400 caractères, listes de 12, trois niveaux.
 * @param {any} v @param {number} [niveau]
 * @returns {any}
 */
function complementSur(v, niveau = 0) {
  if (v == null || niveau > 3) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string' || typeof v === 'number') return String(v).slice(0, 400);
  if (Array.isArray(v)) return v.slice(0, 12).map((x) => complementSur(x, niveau + 1)).filter((x) => x != null);
  if (typeof v === 'object') {
    /** @type {Record<string, any>} */
    const r = {};
    for (const [k, x] of Object.entries(v).slice(0, 40)) { if (/^[A-Za-z]{1,40}$/.test(k)) r[k] = complementSur(x, niveau + 1); }
    return r;
  }
  return null;
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
 * @param {any[]} dossiers @param {any} [imp] fichier clients importé (importClientsBiens.js)
 */
function occurrencesPersonnes(dossiers, imp) {
  /** @type {any[]} */
  const occ = [];
  for (const d of dossiers || []) {
    if (!d || d.deleted || !d.id) continue;
    const parties = Array.isArray(d.parties) ? d.parties : [];
    const fiches = Object.values((d.authentic && d.authentic.fichesClients) || {}).filter(Boolean);
    const comparants = (d.authentic && Array.isArray(d.authentic.comparants)) ? d.authentic.comparants : [];
    const vues = new Set();
    const ids = new Set();
    // Identifiant d'occurrence unique dans le dossier : deux « Jean MARTIN » (le père défunt, le fils héritier) restent deux personnes.
    const idUnique = (/** @type {string} */ base, /** @type {string} */ distinctif) => {
      let id = base;
      if (ids.has(id)) id = `${base}~${norm(distinctif).replace(/ /g, '') || ids.size}`;
      while (ids.has(id)) id += '~';
      ids.add(id);
      return id;
    };
    const fichesNoms = [];
    const roleDe = (/** @type {string} */ nomFamille, /** @type {string} */ prenom, /** @type {any} */ fiche) => {
      const c = comparants.find((x) => memeNom(x, nomFamille, prenom));
      if (c && c.role) return c.role;
      const p = parties.find((x) => x && memeNom(x, nomFamille, prenom));
      if (p && p.role) return p.role;
      return fiche && fiche.deces && d.typeAffaire === 'succession' ? 'DEFUNT' : 'PARTIE';
    };
    for (const f of fiches) {
      // Fiche gardée seule (absente des comparants, 0.292.1) : jamais une partie du dossier.
      if (f.horsComparants) continue;
      // Fiche d'une société (0.293.0) : hors de la base des personnes, comme les parties « morale ».
      if (f.qualitePersonne === 'morale' || f.morale) continue;
      const nomFamille = texte(f.nomFamille) || decouperNom(f.nom).nomFamille;
      const prenom = texte(f.prenom) || decouperNom(f.nom).prenom;
      if (!nomFamille) continue;
      const cle = norm(nomFamille) + '|' + norm(prenom);
      vues.add(cle);
      fichesNoms.push({ nomFamille, prenom });
      occ.push({
        id: idUnique(`${d.id}:${cle}`, texte(f.dateNaissance) || texte(f.nom)), dossier: d, cle, source: 'Authentic', vuLe: texte(f.vuLe),
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
        deces: f.deces && typeof f.deces === 'object' ? { date: texte(f.deces.date), lieu: texte(f.deces.lieu) } : null,
        complement: f.complement && typeof f.complement === 'object' ? complementSur(f.complement) : null,
        autresPrenoms: texte(f.autresPrenoms), paysNaissance: texte(f.paysNaissance)
      });
    }
    // Coordonnées d'une partie sans fiche d'Authentic retenue (dossier d'avant le 15/10, étude 19/10 : « la fiche est remplie en dessous
    // mais pas celle de la carte ») : les siennes, sinon celles de son côté — un couple les partage, comme sur la fiche.
    const champCote = (/** @type {string} */ role, /** @type {string} */ nature) => texte(d[(nature === 'emails' ? 'email' : 'telephone') + (role === 'VENDEUR' ? 'Vendeur' : role === 'ACQUEREUR' ? 'Acquereur' : '')]);
    const coordonnees = (/** @type {any} */ p, /** @type {string} */ nature) => {
      const propres = (Array.isArray(p[nature]) ? p[nature] : []).map(texte).filter(Boolean);
      if (propres.length) return propres.slice(0, 3);
      const role = String(p.role || '').toUpperCase();
      if (role !== 'VENDEUR' && role !== 'ACQUEREUR') return [];
      const brut = champCote(role, nature);
      return (nature === 'emails' ? brut.split(/[\s,;]+/).filter((x) => /@/.test(x)) : brut.split('/').map((x) => x.trim()).filter((x) => x.replace(/\D/g, '').length >= 9)).slice(0, 3);
    };
    const anciennes = (d.authentic && Array.isArray(d.authentic.personnes)) ? d.authentic.personnes : [];
    for (const p of parties) {
      if (!p || !texte(p.nom) || p.qualitePersonne === 'morale') continue;
      const { nomFamille, prenom } = decouperNom(p.nom);
      const cle = norm(nomFamille) + '|' + norm(prenom);
      // Une partie déjà décrite par une fiche d'Authentic du dossier (même nom, même prénom, quelle que soit l'écriture) n'est pas reprise.
      if (!norm(nomFamille) || vues.has(cle) || fichesNoms.some((x) => memeNom(p, x.nomFamille, x.prenom) && (!prenom || norm(x.prenom).split(' ')[0] === norm(prenom).split(' ')[0]))) continue;
      vues.add(cle);
      occ.push({
        id: idUnique(`${d.id}:${cle}`, p.role || ''), dossier: d, cle, source: 'Fiche', vuLe: '', role: p.role && p.role !== 'PARTIE' ? p.role : roleDe(nomFamille, prenom, null),
        champs: { civilite: texte(p.civilite), nomFamille, prenom, nomUsage: texte(p.nomUsage).toUpperCase(), dateNaissance: texte(p.dateNaissance).slice(0, 10),
          lieuNaissance: texte(p.lieuNaissance), nationalite: '', profession: '', domicile: '', emails: coordonnees(p, 'emails'), telephones: coordonnees(p, 'telephones') },
        situation: ((sm) => sm && typeof sm === 'object' && texte(sm.situation) ? { situation: texte(sm.situation), conjoint: texte(sm.conjoint), regime: texte(sm.regime || sm.contrat), date: texte(sm.dateMariage || sm.date) } : null)(
          p.situationMatrimoniale || ((anciennes.find((a) => a && a.nom && memeNom(p, decouperNom(texte(a.nom)).nomFamille, decouperNom(texte(a.nom)).prenom)) || {}).situationMatrimoniale)),
        deces: null
      });
    }
  }
  // Fichier clients d'Authentic importé (étude 19/10) : une occurrence par personne, sans dossier, source « Import » — la dernière servie, et APRÈS celles des dossiers (une correction se
  // rattache à l'occurrence d'un dossier, jamais à celle du fichier qui change d'un import à l'autre).
  const idsImport = new Set();
  for (const p of (imp && Array.isArray(imp.personnes) ? imp.personnes : [])) {
    const nf = p.prenom ? { nomFamille: texte(p.nom), prenom: texte(p.prenom) } : decouperNom(texte(p.nom));
    if (!norm(nf.nomFamille)) continue;
    const cle = norm(nf.nomFamille) + '|' + norm(nf.prenom);
    // Identifiant stable d'un import à l'autre (relecture 19/10) : nom, prénom et date de naissance — jamais le rang dans le fichier.
    let id = `import:${cle}${texte(p.dateNaissance) ? '~' + texte(p.dateNaissance).replace(/\D/g, '') : ''}`;
    while (idsImport.has(id)) id += '~';
    idsImport.add(id);
    occ.push({ id, dossier: null, cle, source: 'Import', vuLe: '', role: 'PARTIE',
      champs: { civilite: texte(p.civilite), nomFamille: nf.nomFamille.toUpperCase(), prenom: nf.prenom, nomUsage: '', dateNaissance: texte(p.dateNaissance).slice(0, 10),
        lieuNaissance: texte(p.lieuNaissance), nationalite: '', profession: texte(p.profession), domicile: texte(p.domicile),
        emails: (p.emails || []).map(texte).filter(Boolean), telephones: (p.telephones || []).map(texte).filter(Boolean) },
      situation: texte(p.situation) || texte(p.conjoint) ? { situation: texte(p.situation), conjoint: texte(p.conjoint), regime: '', date: '' } : null,
      deces: p.deces && typeof p.deces === 'object' ? { date: texte(p.deces.date), lieu: texte(p.deces.lieu) } : null });
  }
  // Fichier global (étude 26/10) : les personnes qui ont figuré dans un dossier et n'y sont plus — retirées par CLAIRE, ou dossier supprimé.
  // Même traitement prudent que le fichier importé (source « Import ») : jamais proposées « peut-être », jointes seulement sur la date de
  // naissance ou la décision de l'étude — deux homonymes restent deux fiches.
  for (const p of (imp && Array.isArray(imp.fichierPersonnes) ? imp.fichierPersonnes : [])) {
    const nomFamille = texte(p.nom);
    if (!norm(nomFamille) || !texte(p.id)) continue;
    const prenom = texte(p.prenom);
    occ.push({ id: `fichier:${texte(p.id)}`, dossier: null, fichier: true, dossierRetire: texte(p.dossierLibelle), cle: norm(nomFamille) + '|' + norm(prenom), source: 'Import', vuLe: texte(p.vuLe), role: texte(p.role) || 'PARTIE',
      champs: { civilite: texte(p.civilite), nomFamille: nomFamille.toUpperCase(), prenom, nomUsage: texte(p.nomUsage).toUpperCase(), dateNaissance: texte(p.dateNaissance).slice(0, 10),
        lieuNaissance: texte(p.lieuNaissance), nationalite: texte(p.nationalite), profession: texte(p.profession), domicile: texte(p.domicile),
        emails: (p.emails || []).map(texte).filter(Boolean), telephones: (p.telephones || []).map(texte).filter(Boolean) },
      situation: texte(p.situation) || texte(p.conjoint) ? { situation: texte(p.situation), conjoint: texte(p.conjoint), regime: texte(p.regime), date: '' } : null,
      deces: p.deces && typeof p.deces === 'object' && (texte(p.deces.date) || texte(p.deces.lieu)) ? { date: texte(p.deces.date), lieu: texte(p.deces.lieu) } : null });
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


/**
 * Pure : la base des personnes. `reglages` = { liaisons: { 'occA#occB': 'meme' | 'distinct' }, corrections: [{ occ, champ, valeur, authentic }] }.
 * @param {any[]} dossiers @param {any} [reglages] @param {any} [imp]
 */
function construirePersonnes(dossiers, reglages, imp) {
  const r = Object.assign({}, reglages || {});
  const liaisons = (r.liaisons && typeof r.liaisons === 'object') ? r.liaisons : {};
  const occ = reattacherReglages(occurrencesPersonnes(dossiers, imp), r);
  const liaisons2 = r._liaisons || liaisons;
  const uf = unionFind(occ.map((o) => o.id));
  const parId0 = new Map(occ.map((o) => [o.id, o]));
  const decision = (/** @type {string} */ a, /** @type {string} */ b) => liaisons2[a + '#' + b] || liaisons2[b + '#' + a] || '';
  // Garde de la réunion (relecture 16/10) : deux groupes ne se réunissent jamais s'ils portent deux dates de naissance différentes, ou si
  // l'étude a dit « différentes » pour une paire de l'un et de l'autre — même par une troisième occurrence (pas de réunion de proche en
  // proche).
  /** @type {Map<string, Set<string>>} */
  const datesDe = new Map(occ.map((o) => [o.id, new Set(o.champs.dateNaissance ? [o.champs.dateNaissance] : [])]));
  /** @type {Map<string, Set<string>>} */
  const membres = new Map(occ.map((o) => [o.id, new Set([o.id])]));
  /** @type {Map<string, Set<string>>} */
  const distinctDe = new Map();
  for (const [k, v] of Object.entries(liaisons2)) {
    if (v !== 'distinct') continue;
    const [a, b] = k.split('#');
    if (!distinctDe.has(a)) distinctDe.set(a, new Set()); /** @type {Set<string>} */ (distinctDe.get(a)).add(b);
    if (!distinctDe.has(b)) distinctDe.set(b, new Set()); /** @type {Set<string>} */ (distinctDe.get(b)).add(a);
  }
  const peutUnir = (/** @type {string} */ a, /** @type {string} */ b) => {
    const ra = uf.trouver(a); const rb = uf.trouver(b);
    if (ra === rb) return false;
    const dates = new Set([.../** @type {Set<string>} */ (datesDe.get(ra)), .../** @type {Set<string>} */ (datesDe.get(rb))]);
    if (dates.size > 1) return false;
    const mb = /** @type {Set<string>} */ (membres.get(rb));
    for (const x of /** @type {Set<string>} */ (membres.get(ra))) { const dx = distinctDe.get(x); if (dx) for (const y of dx) if (mb.has(y)) return false; }
    return true;
  };
  const unir = (/** @type {string} */ a, /** @type {string} */ b) => {
    if (!peutUnir(a, b)) return;
    const ra = uf.trouver(a); const rb = uf.trouver(b);
    uf.unir(a, b);
    const r2 = uf.trouver(a); const autre = r2 === ra ? rb : ra;
    for (const x of /** @type {Set<string>} */ (datesDe.get(autre))) /** @type {Set<string>} */ (datesDe.get(r2)).add(x);
    for (const x of /** @type {Set<string>} */ (membres.get(autre))) /** @type {Set<string>} */ (membres.get(r2)).add(x);
  };
  const parCle = new Map();
  for (const o of occ) { if (!parCle.has(o.cle)) parCle.set(o.cle, []); parCle.get(o.cle).push(o); }
  /** @type {[string, string][]} */
  const aProposer = [];
  // Sûr : même nom, prénom ET date de naissance, ou confirmé par l'étude. Un email ou un téléphone commun ne suffit pas (le père et le
  // fils du même nom partagent la ligne de la maison) : la paire est proposée.
  for (const groupe of parCle.values()) {
    // Fichier importé : traité après les dossiers (plus bas) ; deux personnes du fichier sont deux clients, jamais réunies ni proposées.
    for (let i = 0; i < groupe.length; i++) {
      for (let j = i + 1; j < groupe.length; j++) {
        const a = groupe[i]; const b = groupe[j];
        const dA = a.champs.dateNaissance; const dB = b.champs.dateNaissance;
        if (dA && dB && dA !== dB) continue;
        if (a.source === 'Import' || b.source === 'Import') continue;
        const dec = decision(a.id, b.id);
        if (dec === 'distinct') continue;
        if (dec === 'meme' || (dA && dA === dB)) unir(a.id, b.id); else aProposer.push([a.id, b.id]);
      }
    }
  }
  // Personne du fichier importé, après les dossiers (relecture 19/10) : jointe à celles des dossiers du même nom et prénom quand elle est la seule
  // du fichier à porter ce nom ET que ces occurrences des dossiers ne font déjà qu'une fiche (jamais elle ne relie deux homonymes laissés à
  // part) ; ou sur une date de naissance égale, ou la décision de l'étude. Jamais proposée « peut-être » (un fichier de milliers de noms).
  for (const groupe of parCle.values()) {
    const importees = groupe.filter((o) => o.source === 'Import');
    const autres = groupe.filter((o) => o.source !== 'Import');
    if (!importees.length || !autres.length) continue;
    const uneFiche = new Set(autres.map((o) => uf.trouver(o.id))).size === 1;
    for (const i of importees) {
      for (const o of autres) {
        const dec = decision(i.id, o.id);
        if (dec === 'distinct') continue;
        const dI = i.champs.dateNaissance; const dO = o.champs.dateNaissance;
        if (dI && dO && dI !== dO) continue;
        if (dec === 'meme' || (dI && dI === dO) || (importees.length === 1 && uneFiche && !i.fichier)) unir(i.id, o.id);
      }
    }
  }
  // Une liaison confirmée entre deux noms différents (nom d'usage, faute de frappe) : réunie aussi, sous la même garde.
  for (const [k, v] of Object.entries(liaisons2)) {
    if (v !== 'meme') continue;
    const [a, b] = k.split('#');
    if (a && b && parId0.has(a) && parId0.has(b)) unir(a, b);
  }
  /** @type {Map<string, any[]>} */
  const groupes = new Map();
  for (const o of occ) { const g = uf.trouver(o.id); if (!groupes.has(g)) groupes.set(g, []); /** @type {any[]} */ (groupes.get(g)).push(o); }
  const corrections = Array.isArray(r._corrections) ? r._corrections : (Array.isArray(r.corrections) ? r.corrections : []);
  /** @type {Map<string, any[]>} */
  const correctionsParOcc = new Map();
  for (const c of corrections) { if (!c || !c.occ) continue; if (!correctionsParOcc.has(c.occ)) correctionsParOcc.set(c.occ, []); /** @type {any[]} */ (correctionsParOcc.get(c.occ)).push(c); }
  /** @type {any[]} */
  const personnes = [];
  /** @type {Map<string, string>} */
  const ficheDeOcc = new Map();
  for (const [racine, liste] of groupes) {
    const id = 'p' + idCourt(racine);
    // Authentic d'abord, la plus récente, puis la fiche du dossier.
    const rang = (/** @type {any} */ o) => (o.source === 'Authentic' ? 0 : o.source === 'Fiche' ? 1 : 2);
    const tries = liste.slice().sort((x, y) => (x.source === y.source ? String(y.vuLe).localeCompare(String(x.vuLe)) : rang(x) - rang(y)));
    /** @type {Record<string, any>} */
    const champs = {};
    for (const k of CHAMPS_PERSONNE) {
      if (k === 'emails' || k === 'telephones') champs[k] = [...new Set(tries.flatMap((o) => o.champs[k]))].slice(0, 6);
      else champs[k] = (tries.find((o) => o.champs[k]) || { champs: {} }).champs[k] || '';
    }
    const authentic = Object.assign({}, champs);
    /** @type {any[]} */
    const aRevoir = [];
    for (const c of liste.flatMap((o) => correctionsParOcc.get(o.id) || [])) {
      if (!c || !CHAMPS_PERSONNE.includes(c.champ)) continue;
      const actuel = JSON.stringify(authentic[c.champ]);
      // Seulement une valeur venue d'Authentic : la fiche du dossier (coordonnées du côté, 19/10) n'est pas « Authentic a changé ».
      if (liste.some((o) => o.source === 'Authentic' || o.source === 'Import') && c.authentic !== undefined && JSON.stringify(c.authentic) !== actuel && actuel !== JSON.stringify(c.valeur)) {
        // Authentic a changé depuis la correction : proposé, rien d'écrasé.
        aRevoir.push({ champ: c.champ, correction: c.valeur, authentic: authentic[c.champ], occ: c.occ });
      }
      champs[c.champ] = c.valeur;
    }
    const sit = (tries.find((o) => o.situation && o.situation.situation) || {}).situation || null;
    const deces = (tries.find((o) => o.deces && o.deces.date) || tries.find((o) => o.deces && o.deces.lieu) || {}).deces || null;
    // Le reste de la fiche : celui de la fiche d'Authentic la plus récente qui en porte un.
    const complement = (tries.find((o) => o.complement) || {}).complement || null;
    const autres = { autresPrenoms: (tries.find((o) => o.autresPrenoms) || {}).autresPrenoms || '', paysNaissance: (tries.find((o) => o.paysNaissance) || {}).paysNaissance || '' };
    const dossiersLies = liste.filter((o) => o.dossier).map((o) => ({ id: o.dossier.id, libelle: libelleDossier(o.dossier), role: o.role, roleLibelle: ROLES[o.role] || 'Partie',
      archive: !!o.dossier.archive, succession: o.dossier.typeAffaire === 'succession' }));
    const vus = new Set();
    personnes.push({
      id, champs, authentic, aRevoir, situation: sit, deces, complement, autresPrenoms: autres.autresPrenoms, paysNaissance: autres.paysNaissance, source: tries[0].source,
      nomComplet: [champs.prenom, champs.nomFamille].filter(Boolean).join(' '),
      dossiers: dossiersLies.filter((x) => (vus.has(x.id + x.role) ? false : (vus.add(x.id + x.role), true))),
      // Dossiers d'où elle a été retirée (fichier global) : elle reste dans la base, sans lien avec eux.
      anciensDossiers: [...new Set(liste.filter((o) => o.fichier && o.dossierRetire).map((o) => o.dossierRetire))].slice(0, 12),
      occurrences: liste.map((o) => o.id), conjoint: null, peutEtre: []
    });
    liste.forEach((o) => ficheDeOcc.set(o.id, id));
  }
  const parId = new Map(personnes.map((p) => [p.id, p]));
  // Homonymes à confirmer : un lien de chaque fiche vers l'autre, avec la paire d'occurrences à décider.
  for (const [a, b] of aProposer) {
    const pa = parId.get(ficheDeOcc.get(a)); const pb = parId.get(ficheDeOcc.get(b));
    if (!pa || !pb || pa === pb || !peutUnir(a, b)) continue;
    if (!pa.peutEtre.some((/** @type {any} */ x) => x.id === pb.id)) pa.peutEtre.push({ id: pb.id, nom: pb.nomComplet, dossiers: pb.dossiers.map((/** @type {any} */ x) => x.libelle), occA: a, occB: b });
    if (!pb.peutEtre.some((/** @type {any} */ x) => x.id === pa.id)) pb.peutEtre.push({ id: pa.id, nom: pa.nomComplet, dossiers: pa.dossiers.map((/** @type {any} */ x) => x.libelle), occA: b, occB: a });
  }
  // Conjoint (marié, pacsé, veuf, divorcé… comme dans Authentic) : le nom cité sur la fiche, retrouvé parmi les personnes d'un MÊME dossier
  // (prénom exigé) ; ailleurs, seulement si c'est réciproque (sa fiche nomme aussi celle-ci). Index par nom de famille : jamais tout comparé
  // à tout (relecture 16/10 : 30 s pour 5 000 personnes).
  for (const p of personnes) {
    p._nom = norm(p.champs.nomFamille); p._prenom = norm(p.champs.prenom).split(' ')[0] || '';
    p._dossiers = new Set(p.dossiers.map((/** @type {any} */ x) => x.id));
    p._conj = p.situation && p.situation.conjoint ? ' ' + norm(p.situation.conjoint) + ' ' : '';
  }
  /** @type {Map<string, any[]>} */
  const parNom = new Map();
  for (const p of personnes) { if (!p._nom) continue; if (!parNom.has(p._nom)) parNom.set(p._nom, []); /** @type {any[]} */ (parNom.get(p._nom)).push(p); }
  const nomme = (/** @type {any} */ x, /** @type {any} */ y) => !!x._conj && !!y._nom && !!y._prenom && x._conj.includes(' ' + y._nom + ' ') && x._conj.includes(' ' + y._prenom + ' ');
  for (const p of personnes) {
    if (!p._conj) continue;
    const mots = p._conj.trim().split(' ');
    /** @type {any[]} */
    const candidats = [];
    for (let k = 1; k <= Math.min(3, mots.length); k++) for (let i = 0; i + k <= mots.length; i++) for (const q of parNom.get(mots.slice(i, i + k).join(' ')) || []) if (q !== p && !candidats.includes(q)) candidats.push(q);
    const vrais = candidats.filter((q) => nomme(p, q));
    const memeDossier = vrais.filter((q) => [...q._dossiers].some((x) => p._dossiers.has(x)));
    const reciproques = vrais.filter((q) => nomme(q, p));
    const q = memeDossier.length === 1 ? memeDossier[0] : (!memeDossier.length && reciproques.length === 1 ? reciproques[0] : null);
    p.conjoint = { nom: p.situation.conjoint, situation: p.situation.situation, id: q ? q.id : null };
  }
  for (const p of personnes) { delete p._nom; delete p._prenom; delete p._dossiers; delete p._conj; }
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
  return { prefixe, section, numero, surface: m2, nature: texte(p.nature), lieuDit: texte(p.lieuDit), zone: texte(p.zone), spf: texte(p.spf), commune: texte(p.commune || commune).toUpperCase() };
}

/** Pure : les occurrences de biens — tous les biens de chaque dossier, lus comme partout ailleurs (commun/donnees-dossier.js : bien de la
 * fiche, immeubles d'Authentic, biens d'une succession ; avant le 17/10, une vente ne montrait que son bien principal). @param {any[]} dossiers @param {any} [imp] */
function occurrencesBiens(dossiers, imp) {
  /** @type {any[]} */
  const occ = [];
  // Fichier immeubles d'Authentic importé (étude 19/10) : un bien par ligne, sans dossier.
  (imp && Array.isArray(imp.biens) ? imp.biens : []).forEach((/** @type {any} */ b, /** @type {number} */ i) => {
    const adr = adresseDecomposee(texte(b.adresse), { codePostal: b.codePostal, commune: b.commune });
    const parcelles = (b.parcelles || []).map((/** @type {any} */ p) => parcelleNette(p, adr.commune)).filter(Boolean);
    if (!parcelles.length && !adr.voie && !adr.lieuDit && !texte(b.adresse)) return;
    occ.push({ id: `import:b${i}`, dossier: null, importe: true, adresse: texte(b.adresse), commune: adr.commune, codePostal: adr.codePostal, parcelles, lots: [], type: texte(b.type), description: '', details: [] });
  });
  // Fichier global (étude 26/10) : les biens qui ont figuré dans un dossier et n'y sont plus.
  (imp && Array.isArray(imp.fichierBiens) ? imp.fichierBiens : []).forEach((/** @type {any} */ b) => {
    if (!texte(b.id)) return;
    const adr = adresseDecomposee(texte(b.adresse), { codePostal: b.codePostal, commune: b.commune });
    const parcelles = (b.parcelles || []).map((/** @type {any} */ p) => parcelleNette(p, adr.commune)).filter(Boolean);
    if (!parcelles.length && !adr.voie && !adr.lieuDit && !texte(b.adresse)) return;
    occ.push({ id: `fichier:${texte(b.id)}`, dossier: null, importe: true, fichier: true, dossierRetire: texte(b.dossierLibelle), adresse: texte(b.adresse), commune: adr.commune, codePostal: adr.codePostal, parcelles,
      lots: Array.isArray(b.lots) ? b.lots : [], type: texte(b.type), description: texte(b.description), details: Array.isArray(b.details) ? b.details : [] });
  });
  for (const d of dossiers || []) {
    if (!d || d.deleted || !d.id) continue;
    DD.biensDossier(d).forEach((/** @type {any} */ b, /** @type {number} */ i) => {
      const adr = adresseDecomposee(texte(b.adresse), { codePostal: b.codePostal, commune: b.commune });
      const parcelles = (b.parcelles || []).map((/** @type {any} */ p) => parcelleNette(p, adr.commune)).filter(Boolean);
      if (!parcelles.length && !adr.voie && !adr.lieuDit && !texte(b.adresse)) return;
      // Le bien principal d'une vente garde son identifiant d'avant (`:bien`) : les liaisons et corrections de l'étude y restent attachées.
      const id = b.principal ? `${d.id}:bien` : `${d.id}:im${i}`;
      occ.push({ id, dossier: d, adresse: texte(b.adresse), commune: adr.commune, codePostal: adr.codePostal, parcelles,
        lots: Array.isArray(b.lots) ? b.lots : [], type: texte(b.type) || (b.principal ? texte(d.typeVente) : ''),
        description: texte(b.description), details: Array.isArray(b.details) ? b.details : [] });
    });
  }
  return occ;
}

/** Pure : la base des biens. @param {any[]} dossiers @param {any} [imp] */
function construireBiens(dossiers, imp) {
  const occ = occurrencesBiens(dossiers, imp);
  const uf = unionFind(occ.map((o) => o.id));
  // Commune écrite autrement d'un dossier à l'autre (« ST AIGNAN » / « SAINT-AIGNAN-SUR-CHER ») : une seule clé, pour que le bien d'une
  // vente et celui d'une succession soient la même fiche (étude 17/10 : « une fiche bien doit être unique dans CLAIRE comme dans Authentic »).
  // Le nom entier d'abord ; le nom sans son « -sur-… » ne réunit deux biens que s'ils ont le MÊME code postal (relecture du 17/10 :
  // Chaumont-sur-Loire 41150 et Chaumont-sur-Tharonne 41600 ne sont pas la même commune).
  const cleCommune = (/** @type {string} */ c) => DD.communeNette(c);
  const cleCourte = (/** @type {string} */ c) => DD.communeNette(c).replace(/ s .*$/, '');
  const cleParcelle = (/** @type {any} */ p) => [cleCommune(p.commune), p.prefixe, p.section, p.numero].join('|');
  const cleParcelleCourte = (/** @type {any} */ p, /** @type {string} */ cp) => [cleCourte(p.commune), cp, p.prefixe, p.section, p.numero].join('|');
  const parParcelleCourte = new Map();
  const occParId = new Map(occ.map((o) => [o.id, o]));
  // Copropriété : les lots d'un même immeuble partagent la parcelle — un bien = un lot (au moins un lot commun), jamais l'immeuble entier.
  const numerosLots = (/** @type {any} */ o) => (o.lots || []).map((/** @type {any} */ l) => texte(l && (l.numero || l.lot))).filter(Boolean);
  const parParcelle = new Map();
  const parAdresse = new Map();
  for (const o of occ) {
    const lots = numerosLots(o);
    // Sans commune, une parcelle « AB 12 » ne désigne rien de sûr : pas de réunion par la parcelle (relecture 16/10).
    for (const p of o.parcelles) {
      if (!norm(p.commune)) continue;
      // Deux communes du même nom dans deux départements (SAINT-CYR 41000 / 86130) : jamais réunies quand les deux codes postaux sont connus.
      for (const k of lots.length ? lots.map((l) => cleParcelle(p) + '|lot ' + l) : [cleParcelle(p)]) {
        const deja = parParcelle.get(k);
        if (!deja) { parParcelle.set(k, o.id); continue; }
        const autre = occParId.get(deja);
        // Deux lignes du fichier immeubles sur la même parcelle (appartements d'un immeuble) : deux biens, jamais réunis par la parcelle.
        if (o.importe && autre && autre.importe) continue;
        if (DD.memeCommune({ commune: p.commune, codePostal: o.codePostal }, { commune: p.commune, codePostal: autre && autre.codePostal }) !== false) uf.unir(deja, o.id);
      }
      const cp = texte(o.codePostal);
      if (/^\d{5}$/.test(cp)) for (const k of lots.length ? lots.map((l) => cleParcelleCourte(p, cp) + '|lot ' + l) : [cleParcelleCourte(p, cp)]) {
        if (!parParcelleCourte.has(k)) parParcelleCourte.set(k, o.id);
        else if (!(o.importe && (occParId.get(parParcelleCourte.get(k)) || {}).importe)) uf.unir(parParcelleCourte.get(k), o.id);
      }
    }
    if (!o.parcelles.some((/** @type {any} */ p) => norm(p.commune)) && o.adresse && norm(o.commune)) {
      const k = norm(o.adresse) + (lots.length ? '|lots ' + lots.sort().join(',') : '');
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
      const k = [cleCourte(p.commune), p.prefixe, p.section, p.numero].join('|');
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
      description: (liste.find((o) => o.description) || {}).description || '',
      // Tout ce que dit la fiche bien d'Authentic, réuni d'un dossier à l'autre par libellé (le premier renseigné l'emporte).
      details: Object.values(Object.fromEntries(liste.flatMap((o) => o.details).filter((/** @type {any} */ x) => x && texte(x.libelle) && texte(x.valeur)).reverse()
        .map((/** @type {any} */ x) => [texte(x.libelle), { libelle: texte(x.libelle).slice(0, 80), valeur: texte(x.valeur).slice(0, 200) }]))).slice(0, 30),
      lots: liste.flatMap((o) => o.lots || []).filter((/** @type {any} */ l, /** @type {number} */ i, /** @type {any[]} */ t) => t.findIndex((x) => texte(x && (x.numero || x.lot)) === texte(l && (l.numero || l.lot))) === i).slice(0, 40),
      dossiers: liste.filter((o) => o.dossier).map((o) => ({ id: o.dossier.id, libelle: libelleDossier(o.dossier), archive: !!o.dossier.archive, succession: o.dossier.typeAffaire === 'succession' }))
        .filter((x) => (vus.has(x.id) ? false : (vus.add(x.id), true))),
      anciensDossiers: [...new Set(liste.filter((o) => o.fichier && o.dossierRetire).map((o) => o.dossierRetire))].slice(0, 12),
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
 * Par 80 au plus pour chaque colonne, plus sur demande (« Afficher plus » du poste, 1 000 au plus : centaines de fiches).
 * @param {{ personnes: any[], biens: any[] }} base @param {string} q @param {{ personnes?: number, biens?: number }} [limites]
 */
function chercherClientsBiens(base, q, limites) {
  const borne = (/** @type {any} */ n) => Math.min(1000, Math.max(80, Math.floor(Number(n)) || 80));
  const lp = borne((limites || {}).personnes), lb = borne((limites || {}).biens);
  const mots = norm(q).split(' ').filter(Boolean);
  const ok = (/** @type {string} */ t) => !mots.length || mots.every((m) => (' ' + norm(t) + ' ').includes(' ' + m) );
  // Une personne par son nom (et son nom d'usage) seulement : chercher « PETIT » ne liste pas tous ceux d'un dossier « PETIT / ROUX ».
  const personnes = base.personnes.filter((p) => ok([p.nomComplet, p.champs.nomUsage].join(' ')));
  const biens = base.biens.filter((b) => ok([b.adresse, b.commune, ...b.parcelles.map((/** @type {any} */ p) => `${p.section} ${p.numero} ${p.section}${p.numero} ${p.lieuDit}`), ...b.dossiers.map((/** @type {any} */ x) => x.libelle)].join(' ')));
  return { personnes: personnes.slice(0, lp).map(resumePersonne), biens: biens.slice(0, lb).map(resumeBien), total: { personnes: personnes.length, biens: biens.length } };
}

/** Pure : les fiches d'un dossier (pour les liens de sa fiche). Chaque personne et chaque bien porte les AUTRES dossiers où il figure, avec
 * leur contexte (étude 17/10 : « un client peut se retrouver dans un autre dossier ; bien distinguer vente ou succession et avec quel autre
 * client il traite ») : vente ou succession, son rôle, et les autres parties de ce dossier. @param {{ personnes: any[], biens: any[] }} base
 * @param {string} dossierId */
function fichesDuDossier(base, dossierId) {
  /** @type {Map<string, any[]>} parties de chaque dossier : [{ id, nom, role }] */
  const parDossier = new Map();
  for (const p of base.personnes) for (const x of p.dossiers) {
    if (!parDossier.has(x.id)) parDossier.set(x.id, []);
    /** @type {any[]} */ (parDossier.get(x.id)).push({ id: p.id, nom: p.nomComplet, role: x.roleLibelle || 'Partie' });
  }
  const avec = (/** @type {string} */ id, /** @type {string} */ sauf) => (parDossier.get(id) || []).filter((q) => q.id !== sauf).slice(0, 8)
    .map((q) => ({ nom: q.nom, role: q.role }));
  const autre = (/** @type {any} */ x, /** @type {string} */ sauf) => ({ id: x.id, libelle: x.libelle, succession: !!x.succession, archive: !!x.archive,
    role: x.roleLibelle || '', avec: avec(x.id, sauf) });
  const parId = new Map(base.personnes.map((p) => [p.id, p]));
  return {
    personnes: base.personnes.filter((p) => p.dossiers.some((/** @type {any} */ x) => x.id === dossierId))
      .map((p) => {
        const autres = p.dossiers.filter((/** @type {any} */ x) => x.id !== dossierId).filter((/** @type {any} */ x, /** @type {number} */ i, /** @type {any[]} */ t) => t.findIndex((y) => y.id === x.id) === i);
        return { id: p.id, nom: p.nomComplet, role: (p.dossiers.find((/** @type {any} */ x) => x.id === dossierId) || {}).roleLibelle || 'Partie',
          decede: !!p.deces, autresDossiers: autres.length, autres: autres.slice(0, 12).map((/** @type {any} */ x) => autre(x, p.id)), peutEtre: p.peutEtre.length,
          // Même nom sans preuve (ni date de naissance, ni email, ni téléphone en commun) : ses dossiers sont montrés « peut-être », jamais réunis.
          peutEtreAutres: p.peutEtre.flatMap((/** @type {any} */ q) => ((parId.get(q.id) || {}).dossiers || []).filter((/** @type {any} */ x) => x.id !== dossierId)
            .map((/** @type {any} */ x) => autre(x, q.id))).filter((/** @type {any} */ x, /** @type {number} */ i, /** @type {any[]} */ t) => t.findIndex((y) => y.id === x.id) === i).slice(0, 8) };
      }),
    biens: base.biens.filter((b) => b.dossiers.some((/** @type {any} */ x) => x.id === dossierId))
      .map((b) => {
        const autres = b.dossiers.filter((/** @type {any} */ x) => x.id !== dossierId);
        return { id: b.id, libelle: b.adresse || b.parcelles.map((/** @type {any} */ p) => `${p.section} ${p.numero}`).join(', '), commune: b.commune || '',
          parcelles: b.parcelles.slice(0, 12).map((/** @type {any} */ p) => [p.prefixe, p.section, p.numero].filter(Boolean).join(' ')), lots: (b.lots || []).length,
          autresDossiers: autres.length, autres: autres.slice(0, 12).map((/** @type {any} */ x) => autre(x, '')) };
      })
  };
}

/**
 * Pure : les lignes du fichier global d'UN dossier — chaque personne et chaque bien tels que les dossiers les montrent, avec l'identifiant de leur
 * occurrence (stable : dossier + nom + prénom) et le dossier d'où ils viennent. @param {any} d @param {string} [maintenant]
 */
function lignesFichierDepuisDossier(d, maintenant) {
  if (!d || d.deleted || !d.id) return { personnes: [], biens: [] };
  const vuLe = maintenant || new Date().toISOString();
  const dossierLibelle = libelleDossier(d);
  const personnes = occurrencesPersonnes([d]).map((o) => ({
    id: o.id, dossierId: d.id, dossierLibelle, role: o.role, vuLe,
    nom: o.champs.nomFamille, prenom: o.champs.prenom, civilite: o.champs.civilite, nomUsage: o.champs.nomUsage, dateNaissance: o.champs.dateNaissance,
    lieuNaissance: o.champs.lieuNaissance, nationalite: o.champs.nationalite, profession: o.champs.profession, domicile: o.champs.domicile,
    emails: o.champs.emails.slice(0, 6), telephones: o.champs.telephones.slice(0, 6),
    situation: o.situation ? o.situation.situation : '', conjoint: o.situation ? o.situation.conjoint : '', regime: o.situation ? o.situation.regime : '',
    deces: o.deces || null
  }));
  const biens = occurrencesBiens([d]).map((o) => ({
    id: o.id, dossierId: d.id, dossierLibelle, vuLe, adresse: o.adresse, codePostal: o.codePostal, commune: o.commune, type: o.type, description: o.description,
    parcelles: o.parcelles.slice(0, 300).map((/** @type {any} */ p) => ({ prefixe: p.prefixe, section: p.section, numero: p.numero, commune: p.commune, nature: p.nature, lieuDit: p.lieuDit, zone: p.zone, spf: p.spf,
      surface: typeof p.surface === 'number' ? `${Math.floor(p.surface / 10000)} ha ${Math.floor((p.surface % 10000) / 100)} a ${p.surface % 100} ca` : '' })),
    lots: (Array.isArray(o.lots) ? o.lots : []).slice(0, 40), details: (Array.isArray(o.details) ? o.details : []).slice(0, 30)
  }));
  return { personnes, biens };
}

const MAX_FICHIER = 20000;

/**
 * Pure : le fichier global fondu avec de nouvelles lignes — une ligne par identifiant, la plus récente remplace l'ancienne ; JAMAIS de retrait
 * (retirer une personne ou un bien d'un dossier ne les enlève pas du fichier). Rend { fichier, change }.
 * @param {any} fichier @param {{ personnes: any[], biens: any[] }} lignes
 */
function fusionnerFichier(fichier, lignes) {
  const f = fichier && typeof fichier === 'object' ? fichier : {};
  let change = false;
  /** @param {any[]} avant @param {any[]} nouvelles */
  const fondre = (avant, nouvelles) => {
    const liste = Array.isArray(avant) ? avant.slice() : [];
    const index = new Map(liste.map((x, i) => [x && x.id, i]));
    for (const n of nouvelles || []) {
      if (!n || !texte(n.id)) continue;
      const i = index.get(n.id);
      if (i === undefined) { if (liste.length >= MAX_FICHIER) continue; index.set(n.id, liste.length); liste.push(n); change = true; continue; }
      const sansDate = (/** @type {any} */ x) => JSON.stringify(Object.assign({}, x, { vuLe: '' }));
      if (sansDate(liste[i]) !== sansDate(n)) { liste[i] = n; change = true; }
    }
    return liste;
  };
  const personnes = fondre(f.personnes, lignes.personnes);
  const biens = fondre(f.biens, lignes.biens);
  return { fichier: { personnes, biens }, change };
}

/** Pure : les lignes du fichier global qui ne sont plus dans AUCUN dossier — celles que la base montre en plus des dossiers.
 * @param {any} fichier @param {any[]} dossiers */
function lignesFichierRetirees(fichier, dossiers) {
  const f = fichier && typeof fichier === 'object' ? fichier : {};
  const idsP = new Set(occurrencesPersonnes(dossiers).map((o) => o.id));
  const idsB = new Set(occurrencesBiens(dossiers).map((o) => o.id));
  return {
    fichierPersonnes: (Array.isArray(f.personnes) ? f.personnes : []).filter((r) => r && !idsP.has(r.id)),
    fichierBiens: (Array.isArray(f.biens) ? f.biens : []).filter((r) => r && !idsB.has(r.id))
  };
}

/** Pure : la base entière. @param {any[]} dossiers @param {any} [reglages] @param {any} [imp] fichier importé @param {any} [fichier] fichier global */
function construireBase(dossiers, reglages, imp, fichier) {
  const etendu = fichier ? Object.assign({}, imp || {}, lignesFichierRetirees(fichier, dossiers)) : imp;
  return { personnes: construirePersonnes(dossiers, reglages, etendu), biens: construireBiens(dossiers, etendu) };
}

/** Pure : les réglages gardés, assainis (liaisons et corrections seulement, bornés). @param {any} brut */
function assainirReglagesClientsBiens(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  /** @type {Record<string, string>} */
  const liaisons = {};
  for (const [k, v] of Object.entries(b.liaisons || {}).slice(-5000)) {
    if (/^[^#]{1,200}#[^#]{1,200}$/.test(k) && (v === 'meme' || v === 'distinct')) liaisons[k] = v;
  }
  const corrections = (Array.isArray(b.corrections) ? b.corrections : []).filter((c) => c && typeof c.occ === 'string' && c.occ.length <= 200 && CHAMPS_PERSONNE.includes(c.champ))
    .slice(-2000).map((c) => ({ occ: c.occ, champ: c.champ, valeur: valeurCorrection(c.champ, c.valeur), authentic: c.authentic === undefined ? undefined : valeurCorrection(c.champ, c.authentic), le: texte(c.le).slice(0, 30) }));
  return { liaisons, corrections };
}

/** @param {string} champ @param {any} v */
function valeurCorrection(champ, v) {
  if (champ === 'emails' || champ === 'telephones') return (Array.isArray(v) ? v : String(v || '').split(/[;,]/)).map(texte).filter(Boolean).slice(0, 6).map((/** @type {string} */ x) => x.slice(0, 120));
  if (champ === 'dateNaissance') { const t = texte(v); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ''; }
  if (champ === 'civilite') { const t = texte(v); return t === 'M' || t === 'Mme' ? t : ''; }
  return texte(v).slice(0, 200);
}

/**
 * Pure : les réglages rattachés aux occurrences d'aujourd'hui. Une occurrence dont l'identifiant a changé (prénom ajouté par une fiche
 * d'Authentic : « v1:moreau| » → « v1:moreau|paul ») garde ses corrections et ses liaisons — reprises par la seule occurrence du même
 * dossier et du même nom de famille. Rend les occurrences ; les réglages rattachés sont posés sur `r._liaisons` / `r._corrections`.
 * @param {any[]} occ @param {any} r
 */
function reattacherReglages(occ, r) {
  const ids = new Set(occ.map((o) => o.id));
  /** @param {string} ancien */
  const nouvel = (ancien) => {
    if (ids.has(ancien)) return ancien;
    const m = /^([^:]+):([^|]*)\|/.exec(ancien);
    if (!m) return '';
    const memes = occ.filter((o) => o.dossier && o.dossier.id === m[1] && o.cle.split('|')[0] === m[2]);
    return memes.length === 1 ? memes[0].id : '';
  };
  /** @type {Record<string, string>} */
  const liaisons = {};
  for (const [k, v] of Object.entries((r && r.liaisons) || {})) {
    const [a, b] = k.split('#'); const na = nouvel(a); const nb = nouvel(b);
    if (na && nb && na !== nb) liaisons[na + '#' + nb] = /** @type {string} */ (v);
  }
  const corrections = ((r && r.corrections) || []).map((/** @type {any} */ c) => Object.assign({}, c, { occ: nouvel(c.occ) })).filter((/** @type {any} */ c) => c.occ);
  if (r) { r._liaisons = liaisons; r._corrections = corrections; }
  return occ;
}

/**
 * Pure : les paires d'occurrences à noter pour décider de deux FICHES entières (relecture 16/10 : « différentes » ne reposait que sur une
 * paire, la question revenait pour la suivante). 400 paires au plus.
 * @param {any[]} personnes @param {string} occA @param {string} occB
 */
function pairesEntreFiches(personnes, occA, occB) {
  const pa = personnes.find((p) => p.occurrences.includes(occA));
  const pb = personnes.find((p) => p.occurrences.includes(occB));
  if (!pa || !pb || pa === pb) return [[occA, occB]];
  /** @type {[string, string][]} */
  const r = [];
  for (const a of pa.occurrences) for (const b of pb.occurrences) if (r.length < 400) r.push([a, b]);
  return r;
}

module.exports = { lignesFichierDepuisDossier, fusionnerFichier, lignesFichierRetirees, pairesEntreFiches, reattacherReglages, CHAMPS_PERSONNE, decouperNom, occurrencesPersonnes, construirePersonnes, construireBiens, construireBase, chercherClientsBiens, fichesDuDossier,
  resumePersonne, resumeBien, assainirReglagesClientsBiens, valeurCorrection };
