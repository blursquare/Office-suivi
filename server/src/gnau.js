// @ts-check
'use strict';
// Fiche d'un dossier pour les guichets uniques d'urbanisme (GNAU d'Operis : Agglopolys, Tours, Orléans… — étude 16/10 : « une
// extension Chrome pour remplir à l'aide de CLAIRE les CU et DIA sur les guichets uniques ; fais en sorte de connecter CLAIRE et
// ressortir les bonnes données »). Lue par l'extension « CLAIRE — Assistant de saisie » (extension-chrome/) par la route
// GET /api/gnau/fiche/:id du serveur du bureau.
//
// Comme la Constitution de dossier, Authentic est la base : parcelles de TOUS les immeubles d'Authentic (et celles de la fiche),
// identité et domicile de chaque partie d'après sa fiche client d'Authentic. Rien n'est deviné : une donnée absente reste vide et
// est citée dans `manques` (le panneau de l'extension la montre « absente de la fiche », le champ du guichet reste à remplir à la main).
// Les formats attendus par le guichet (JJMMAAAA, prix en lettres, listes ¢…¢) sont faits par l'extension (lib/fiche.js) : la fiche
// garde des valeurs simples (dates ISO, nombres, textes).

const C = Object.assign({}, require('../../commun/constitution'), require('../../commun/dossier'));
const DD = require('../../commun/donnees-dossier');
var NOTAIRE_SIGNATAIRE = 'Maître Sophie GOSSART';
var LIEU_SIGNATURE = 'BLOIS';
var NOTAIRE_NOM = 'GOSSART';
var NOTAIRE_PRENOM = 'Sophie';

/** @param {any} v */
const texte = (v) => (v === undefined || v === null ? '' : String(v)).replace(/\s+/g, ' ').trim();
/** @param {string} t */
const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** @param {string} t */
const motsDe = (t) => sansAccents(t).toLowerCase().split(/[^a-z0-9]+/).filter((m) => m.length >= 2);

/**
 * Pure : « BLOIS (41000), 3 rue des Lilas » (forme de CLAIRE) ou « 3 rue des Lilas 41000 BLOIS » (forme d'Authentic) →
 * { numero, voie, lieuDit, codePostal, commune, complete }.
 * @param {string} brut @param {{ codePostal?: string, commune?: string }} [connu]
 */
function adresseDecomposee(brut, connu) {
  let t = texte(brut);
  let codePostal = texte(connu && connu.codePostal);
  let commune = texte(connu && connu.commune).toUpperCase();
  const claire = /^(.+?)\s*\((\d{5})\)\s*,\s*(.*)$/.exec(t);
  if (claire) { commune = commune || claire[1].trim().toUpperCase(); codePostal = codePostal || claire[2]; t = claire[3]; }
  else {
    const fin = /,?\s*(\d{5})\s+([A-Za-zÀ-ÿ' -]+?)(?:\s+cedex(?:\s*\d+)?)?\s*$/i.exec(t);
    if (fin) { codePostal = codePostal || fin[1]; commune = commune || fin[2].trim().toUpperCase(); t = t.slice(0, fin.index); }
  }
  t = t.replace(/[,\s]+$/, '').trim();
  const num = /^(\d+\s*(?:bis|ter|quater|[A-D])?)\b[\s,]*(.*)$/i.exec(t);
  const voie = num ? num[2].trim() : t;
  const lieuDit = /^(lieu[- ]dit|lieudit|ld)\b/i.test(voie) ? voie.replace(/^(lieu[- ]dit|lieudit|ld)\s*:?\s*/i, '') : '';
  return {
    numero: num ? num[1].replace(/\s+/g, ' ').trim() : '', voie: lieuDit ? '' : voie, lieuDit, codePostal, commune,
    complete: [t, [codePostal, commune].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  };
}

/** Pure : m² d'une contenance (« 5 a 12 ca », « 512 »), ou null. @param {any} s */
function surfaceM2(s) {
  const n = C.centiaresDepuisContenance(texte(s));
  return n === null ? null : n;
}

/**
 * Pure : les parcelles du dossier, sans doublon — tous les immeubles d'Authentic, puis celles de la fiche. Chacune
 * { prefixe, section, numero, surface (m² ou null), lieuDit, adresse, commune, codePostal }.
 * @param {any} d
 */
function parcellesGnau(d) {
  const bien = adresseDecomposee(texte(d && d.adresseBien));
  const vues = new Set();
  /** @type {any[]} */
  const r = [];
  /** @param {any} p @param {any} im */
  const ajouter = (p, im) => {
    const section = texte(p && p.section).toUpperCase();
    const numero = texte(p && p.numero).replace(/^0+(?=\d)/, '');
    if (!section || !numero) return;
    const prefixe = /^0*$/.test(texte(p.prefixe)) ? '' : texte(p.prefixe);
    const commune = texte(p.commune || (im && im.commune) || bien.commune).toUpperCase();
    const cle = [sansAccents(commune).toLowerCase(), prefixe, section, numero].join('|');
    if (vues.has(cle)) return;
    vues.add(cle);
    const adrIm = im && im.adresse ? adresseDecomposee(typeof im.adresse === 'string' ? im.adresse : texte(im.adresse.texte), { codePostal: im.codePostal }) : null;
    const adresse = texte(p.lieuDit) || (adrIm ? [adrIm.numero, adrIm.voie || adrIm.lieuDit].filter(Boolean).join(' ') : [bien.numero, bien.voie || bien.lieuDit].filter(Boolean).join(' '));
    r.push({ prefixe, section, numero, surface: surfaceM2(p.surface), lieuDit: texte(p.lieuDit), adresse, commune,
      codePostal: (adrIm && adrIm.codePostal) || texte(im && im.codePostal) || bien.codePostal });
  };
  // Toutes les parcelles du dossier, lues comme partout ailleurs (commun/donnees-dossier.js) ; le bien principal garde l'adresse de la fiche.
  DD.parcellesDossier(d).forEach((/** @type {any} */ p) => ajouter(p, p.principal ? null : { adresse: p.adresseBien, codePostal: p.codePostal, commune: p.commune }));
  return r;
}

/** Pure : la fiche client d'Authentic de cette personne (nom complet), ou null. @param {any} d @param {string} nom */
function ficheClient(d, nom) { return DD.ficheClientDe(d, nom); }

/** @param {any} c */
function civiliteCourte(c) {
  const x = sansAccents(texte(c)).toLowerCase().replace(/\.$/, '');
  if (/^(m|mr|monsieur)$/.test(x)) return 'M';
  if (/^(mme|madame|mlle|mademoiselle)$/.test(x)) return 'Mme';
  return '';
}

/**
 * Pure : une partie du dossier telle que le guichet la demande — { morale, civilite ('M' | 'Mme' | ''), nom, prenom, nomUsage,
 * raisonSociale, dateNaissance (ISO), lieuNaissance, paysNaissance, adresse: { numero, voie, lieuDit, codePostal, commune,
 * complete }, profession, source ('Authentic' quand la fiche client a été lue) }.
 * @param {any} d @param {any} p
 */
function personneGnau(d, p) {
  const nomComplet = texte(p && p.nom);
  if (p && p.qualitePersonne === 'morale') {
    return { morale: true, civilite: '', nom: '', prenom: '', nomUsage: '', raisonSociale: nomComplet, dateNaissance: '', lieuNaissance: '', paysNaissance: '',
      adresse: adresseDecomposee(''), profession: '', source: '' };
  }
  const f = ficheClient(d, nomComplet);
  const capitales = nomComplet.split(/\s+/).filter((m) => m.length >= 2 && m === m.toUpperCase() && /[A-ZÀ-Þ]/.test(m));
  // Nom de famille : la fiche client, sinon les mots en capitales ; un nom sans capitales (« Jean Dupont ») ne se découpe pas —
  // nom et prénom restent vides, cités dans `manques` (relecture 16/10 : jamais deviné).
  const nom = texte(f && f.nomFamille) || capitales.join(' ');
  const prenom = texte(f && f.prenom) || texte(p && p.prenom) || (capitales.length ? nomComplet.split(/\s+/).filter((m) => !capitales.includes(m)).join(' ') : '');
  const lieu = texte((f && f.lieuNaissance) || (p && p.lieuNaissance));
  return {
    morale: false, civilite: civiliteCourte((p && p.civilite) || (f && f.civilite)), nom: nom.toUpperCase(), prenom,
    nomUsage: texte((f && f.nomUsage) || (p && p.nomUsage)).toUpperCase(), raisonSociale: '',
    dateNaissance: texte((f && f.dateNaissance) || (p && p.dateNaissance)).slice(0, 10),
    // « 41000 BLOIS » (Authentic) → « BLOIS » : le guichet demande la commune, le département à part.
    lieuNaissance: lieu.replace(/^\s*\d{5}\s+/, '').toUpperCase(), departementNaissance: departementDuCodePostal(lieu),
    // Le pays tel que la fiche client le donne, jamais déduit (relecture 16/10 : une naissance à l'étranger sortait « FRANCE »).
    paysNaissance: texte(f && f.paysNaissance).toUpperCase(),
    adresse: adresseDecomposee(texte(f && f.domicile), f && f.adresse ? f.adresse : undefined),
    profession: texte(f && f.profession), source: f ? 'Authentic' : ''
  };
}

/**
 * Pure : le département d'un code postal en tête (« 41000 BLOIS » → « 41 »), '' quand il ne se lit pas sûrement : Corse (20…, 2A/2B selon
 * la commune) et outre-mer (97…, trois chiffres) ne sont pas devinés.
 * @param {string} lieu
 */
function departementDuCodePostal(lieu) {
  const m = /^\s*(\d{2})\d{3}(?!\d)/.exec(String(lieu || ''));
  if (!m || m[1] === '20' || m[1] === '00' || Number(m[1]) > 95) return '';
  return m[1];
}

/** Pure : les parties d'un côté. @param {any} d @param {string} role */
function partiesDuCote(d, role) {
  return (Array.isArray(d && d.parties) ? d.parties : []).filter((/** @type {any} */ p) => p && texte(p.nom) && String(p.role || '').toUpperCase() === role)
    .map((/** @type {any} */ p) => personneGnau(d, p));
}

/** Pure : les lots de copropriété — { lot, batiment, etage, quotePart (« 128/1000 »), nature, surface }. @param {any} d */
function lotsGnau(d) {
  const b = (d && d.bien) || {};
  const total = Number(b.tantiemesTotal) > 0 ? Number(b.tantiemesTotal) : null;
  return (Array.isArray(b.lots) ? b.lots : []).filter((/** @type {any} */ l) => l && texte(l.numero)).map((/** @type {any} */ l) => ({
    lot: texte(l.numero), batiment: texte(l.batiment), etage: texte(l.etage),
    quotePart: Number(l.tantiemes) > 0 ? (total ? `${l.tantiemes}/${total}` : String(l.tantiemes)) : '',
    nature: texte(l.designation || l.type), surface: Number(l.surfaceCarrez) > 0 ? Number(l.surfaceCarrez) : (Number(l.surface) > 0 ? Number(l.surface) : '')
  }));
}

/** Pure : la commission de l'agence (honoraires de négociation TTC), ou null. @param {any} d */
function commissionGnau(d) {
  const h = d && d.honoraires;
  const m = h && !h.direct ? Number(h.montantTTC) : 0;
  if (!(m > 0)) return null;
  const acq = h.charge === 'ACQUEREUR';
  const ven = h.charge === 'VENDEUR';
  if (!acq && !ven) return null; // à la charge de qui : jamais deviné
  return { montantAcquereur: acq ? m : 0, chargeAcquereur: acq, chargeVendeur: ven, montantVendeur: ven ? m : 0, total: m, ht: false, ttc: true, agence: texte(h.nom) };
}

/**
 * Pure : la fiche d'un dossier pour le CU (procédure 'cua') ou la DIA ('dia'). `aujourdhuiIso` : date de la signature de la demande.
 * @param {any} d @param {string} procedure @param {string} aujourdhuiIso
 */
function ficheGnau(d, procedure, aujourdhuiIso) {
  const proc = procedure === 'dia' ? 'dia' : 'cua';
  const parcelles = parcellesGnau(d);
  const bien = adresseDecomposee(texte(d && d.adresseBien));
  const vendeurs = partiesDuCote(d, 'VENDEUR');
  const acquereurs = partiesDuCote(d, 'ACQUEREUR');
  const surfaces = parcelles.map((p) => p.surface);
  const superficie = surfaces.length && surfaces.every((x) => typeof x === 'number') ? surfaces.reduce((s, x) => s + /** @type {number} */ (x), 0) : null;
  const prix = Number(d && d.prixVente) > 0 ? Number(d.prixVente) : null;
  const mobilier = Number(d && d.prixMobilier) > 0 ? Number(d.prixMobilier) : null;
  const lots = lotsGnau(d);
  const fiche = {
    procedure: proc,
    dossier: { id: texte(d && d.id), libelle: C.libelleDossierAffiche ? C.libelleDossierAffiche(d) : texte(d && d.nom), reference: texte(d && d.referenceAuthentic) },
    terrain: Object.assign({}, bien, { commune: bien.commune || (parcelles[0] && parcelles[0].commune) || '', codePostal: bien.codePostal || (parcelles[0] && parcelles[0].codePostal) || '' }),
    superficie,
    parcelles,
    // Le premier vendeur est le demandeur de la DIA ; les suivants, ses codemandeurs (indivision, couple).
    vendeur: vendeurs[0] || null,
    vendeurs: { tous: vendeurs, codemandeurs: vendeurs.slice(1) },
    acquereur: acquereurs[0] || null,
    acquereurs: { tous: acquereurs, autres: acquereurs.slice(1) },
    prix, mobilier, prixHorsMobilier: prix !== null ? prix - (mobilier || 0) : null,
    commission: commissionGnau(d),
    copropriete: lots.length > 0 || d && d.typeVente === 'copropriete',
    lots,
    signature: { lieu: LIEU_SIGNATURE, date: String(aujourdhuiIso || '').slice(0, 10), signataire: NOTAIRE_SIGNATAIRE },
    // Le demandeur du CU et le mandataire de la DIA : le notaire de l'office (le guichet garde ce qu'il a déjà pré-rempli).
    notaire: { nom: NOTAIRE_NOM, prenom: NOTAIRE_PRENOM, qualite: 'Notaire' },
    // Nature du bien pour les cases du CERFA de la DIA : non bâti (terrain, terre) ou bâti sur terrain propre (maison, copropriété) ;
    // null quand le type de vente n'est pas connu (jamais deviné).
    nonBati: d && (d.typeVente === 'terrain' || d.typeVente === 'terre') ? true : null,
    batiTerrainPropre: d && (d.typeVente === 'maison' || d.typeVente === 'copropriete') ? true : null,
    /** @type {string[]} */
    manques: []
  };
  const manque = (/** @type {boolean} */ cond, /** @type {string} */ t) => { if (cond) fiche.manques.push(t); };
  manque(!parcelles.length, 'Parcelles cadastrales : ouvrez la fiche du bien dans Authentic');
  manque(!!parcelles.length && superficie === null, 'Surface d’une parcelle au moins');
  manque(!fiche.terrain.commune, 'Commune du terrain');
  if (proc === 'dia') {
    manque(!vendeurs.length, 'Vendeur');
    vendeurs.filter((v) => !v.morale && !v.source).forEach((v) => manque(true, `Fiche client d’Authentic de ${[v.prenom, v.nom].filter(Boolean).join(' ') || 'un vendeur'} (naissance, domicile, profession)`));
    if ([...vendeurs, ...acquereurs].some((v) => !v.morale && !v.nom)) manque(true, 'Nom de famille d’une partie (écrivez-le en capitales sur la fiche, ou ouvrez sa fiche client dans Authentic)');
    manque(prix === null, 'Prix de vente');
    manque(!acquereurs.length, 'Acquéreur');
    manque(!!(d && d.honoraires && !d.honoraires.direct && Number(d.honoraires.montantTTC) > 0) && !fiche.commission, 'Commission : à la charge de qui ?');
  }
  return fiche;
}

/** Pure : le résumé d'un dossier pour la liste de l'extension. @param {any} d */
function resumeDossierGnau(d) {
  const bien = adresseDecomposee(texte(d && d.adresseBien));
  return { id: texte(d && d.id), libelle: C.libelleDossierAffiche ? C.libelleDossierAffiche(d) : texte(d && d.nom), commune: bien.commune, reference: texte(d && d.referenceAuthentic) };
}

/**
 * Pure : les ventes en cours dont le nom, les parties, la commune ou la référence contiennent tous les mots cherchés (20 au plus,
 * les plus récentes d'abord). Jamais une succession (ni CU ni DIA).
 * @param {any[]} dossiers @param {string} q
 */
function dossiersGnau(dossiers, q) {
  const mots = motsDe(q);
  return (dossiers || []).filter((d) => d && !d.archive && !d.deleted && d.typeAffaire !== 'succession')
    .filter((d) => {
      if (!mots.length) return true;
      const tout = motsDe([d.nom, d.adresseBien, d.referenceAuthentic, ...(Array.isArray(d.parties) ? d.parties.map((/** @type {any} */ p) => p && p.nom) : [])].join(' '));
      return mots.every((m) => tout.some((x) => x.startsWith(m)));
    })
    .sort((a, b) => String(b.updatedAt || b.updated_at || '').localeCompare(String(a.updatedAt || a.updated_at || '')))
    .slice(0, 20).map(resumeDossierGnau);
}

/**
 * Pure : les plans cadastraux d'une liste de PDF du NAS ({ nom, chemin, modifieLe? }), le meilleur d'abord — le plan de situation tiré
 * par CLAIRE de cadastre.gouv.fr (« Plan de situation … »), puis un plan / extrait cadastral, le plus récent d'abord. Jamais un courrier
 * qui cite le cadastre (« Demande de … »), ni une matrice cadastrale (relevé de propriété).
 * @param {{ nom: string, chemin: string, modifieLe?: string }[]} fichiers
 */
function choisirPlanCadastral(fichiers) {
  const n = (/** @type {string} */ t) => sansAccents(t).toLowerCase().replace(/[_-]+/g, ' ');
  const rang = (/** @type {any} */ f) => {
    const nom = n(f.nom);
    if (/^(demande|courrier|lettre|mail|re |tr )|matrice|releve de propriete|masse|financement|prevention|\berp\b|diagnostic/.test(nom)) return 0;
    if (/^plan de situation/.test(nom)) return 3;
    if (/plan.{0,15}cadastr|extrait.{0,15}cadastr|cadastr.{0,15}plan/.test(nom)) return 2;
    if (/plan de situation|^cadastre\b/.test(nom)) return 1;
    return 0;
  };
  return (fichiers || []).filter((f) => f && rang(f) > 0)
    .sort((a, b) => rang(b) - rang(a) || String(b.modifieLe || '').localeCompare(String(a.modifieLe || '')));
}

module.exports = { choisirPlanCadastral, NOTAIRE_SIGNATAIRE, adresseDecomposee, parcellesGnau, personneGnau, lotsGnau, commissionGnau, ficheGnau, dossiersGnau };
