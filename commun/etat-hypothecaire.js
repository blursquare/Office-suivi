// @ts-check
'use strict';
// Relecture d'un état hypothécaire (étude 27/10 : « la relecture d'un état hypothécaire dans les annexes [d'Authentic] pour vérifier s'il y
// a des inscriptions hypothécaires » ; « les inscriptions seront en rouge »). L'état-réponse ANF de l'ADSN (nouvelle version) range les
// formalités du FLUX (publiées depuis 2002, vrai texte) par nature : Registre des dépôts, Volumétrie / Copropriété / Lotissement,
// Publication, CHARGE (en rouge : inscriptions d'hypothèque, privilèges, saisies…), Formalités en attente et rejets ; les fiches d'avant
// (le STOCK) sont des scans de fiches manuscrites, jamais lus ici — seulement comptés, « à relire par le notaire ».
// Pure : le texte de chaque page (pdf.js, une ligne par page) → les inscriptions en cours, celles radiées ou périmées à part, les charges
// signalées par l'ADSN dans un complément, les formalités en attente. Rien n'est deviné : un champ non lu reste vide (« à vérifier »).
// Structure relevée sur deux états réels (27/10 : rubrique Publication seule ; 28/10 : treize formalités dont dix Charges — privilège de
// prêteur de deniers et hypothèque conventionnelle d'un même prêt, privilèges du vendeur périmés, hypothèque conventionnelle) : tableau
// « Créancier | Numéro d'identité », « Montant principal », « Date d'extrême exigibilité » (fin du prêt) et « Date d'extrême effet »
// (celle de l'inscription). Aucune radiation vue encore : sa lecture reste à vérifier (point terrain `etat-hypothecaire`).

/**
 * @typedef {{ nature: string, page: number, redacteur: string, dateActe: string, dateDepot: string, reference: string, creancier: string,
 *   montant: string, dateExtremeEffet: string, etat: 'en_cours' | 'radiee' | 'perimee', radiation: '' | 'totale' | 'partielle' }} InscriptionEH
 * @typedef {{ nature: string, page: number, complement: string }} ChargeComplementEH
 * @typedef {{ anf: boolean, delivreLe: string, inscriptions: InscriptionEH[], chargesComplement: ChargeComplementEH[], enAttente: number,
 *   facesStock: number, pagesStock: number, flux: { du: string, au: string },
 *   lecture: { complete: boolean, annoncees: number | null, reconnues: number, pagesNonComprises: number } }} EtatHypothecaire
 */

(function (exporter) {
  var MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  /** @param {any} v */
  function net(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  /** @param {string} t */
  function plat(t) { return net(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  /** « 21/05/2025 » → « 2025-05-21 » ('' sinon). @param {string} t */
  function iso(t) {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(t || ''));
    return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  }
  /** « 29 décembre 2025 » → « 2025-12-29 ». @param {string} t */
  function isoLettres(t) {
    const m = /(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/i.exec(String(t || ''));
    const mois = m ? MOIS.indexOf(plat(m[2])) : -1;
    return m && mois >= 0 ? `${m[3]}-${String(mois + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  }
  /** La valeur d'un champ « Libellé : valeur » jusqu'au champ suivant. @param {string} t @param {RegExp} libelle */
  function champ(t, libelle) {
    const m = new RegExp(libelle.source + '\\s*:\\s*(.+?)(?=\\s+(?:R[ée]dacteur|Commune|Date de l[\'’ʼ]acte|Date de d[ée]p[ôo]t|R[ée]f[ée]rence d[\'’ʼ]enliassement|Code sages|Disposition n°|Montant|Date extr[êe]me|Compl[ée]ment)\\b|$)', 'i').exec(t);
    return m ? net(m[1]).slice(0, 160) : '';
  }

  /** Pure : un état-réponse ANF ? @param {string[]} pages */
  function estEtatReponseANF(pages) {
    const debut = plat((pages || []).slice(0, 3).join(' '));
    return /etat-reponse/.test(debut) && /(acces des notaires au fichier immobilier|dossier anf)/.test(debut);
  }

  /** Pure : la lecture de l'état. @param {string[]} pages le texte de chaque page @param {string} [aujourdhui] AAAA-MM-JJ @returns {EtatHypothecaire} */
  function analyserEtatHypothecaire(pages, aujourdhui) {
    const textes = (pages || []).map(net);
    const tout = textes.join(' ');
    const delivreLe = isoLettres((/d[ée]livr[ée] le\s+(\d{1,2}\s+[A-Za-zéû]+\s+\d{4})/i.exec(tout) || [])[1] || '');
    const flux = /Relev[ée] des formalit[ée]s\s*\(Flux\)\s*Du\s*(\d{2}\/\d{2}\/\d{4}).*?Au\s*(\d{2}\/\d{2}\/\d{4})/i.exec(tout);
    const AP = "['’ʼ]";
    // Une formalité : « NATURE PAGE a À PAGE b » ; une page de suite répète l'en-tête avec le même a. Rubrique : « Relevé des formalités –
    // Charge » (trait d'union, demi-cadratin ou cadratin ; espaces parasites de pdf.js tolérés).
    const RE_RUBRIQUE = /Relev\s*[ée]\s*des\s*formalit\s*[ée]\s*s\s*[-–—]\s*(Publication|Charge|Formalit[ée]s en attente|Registre des d[ée]p[ôo]ts|Volum[ée]trie|Copropri[ée]t[ée]|Lotissement|Rejets?)/gi;
    const RE_TETE = /(?:Publication|Charge|attente|d[ée]p[ôo]ts|Volum[ée]trie|Copropri[ée]t[ée]|Lotissement|Rejets?|^|\s)\s*([A-ZÉÈÀÂÊÎÔÛÇ'’][A-ZÉÈÀÂÊÎÔÛÇ0-9'’ ,/-]{2,100}?)\s+PAGE\s+(\d+)\s+[ÀA]\s+PAGE\s+(\d+)/g;
    /** @type {Map<string, { rubrique: string, nature: string, page: number, texte: string }>} */
    const formalites = new Map();
    /** @type {ChargeComplementEH[]} */
    const complements = [];
    let pagesStock = 0;
    let pagesNonComprises = 0;
    /** @type {{ rubrique: string, nature: string, page: number, texte: string } | null} */
    let derniere = null;
    textes.forEach((t, i) => {
      if (/Copie de fiche\s*Stock/i.test(t) && t.length < 200) { pagesStock++; derniere = null; return; }
      const rubriques = [...t.matchAll(RE_RUBRIQUE)];
      if (!rubriques.length) {
        // Pages du flux sans rubrique : la suite d'une formalité (sans en-tête répété), sinon une page non comprise — dite, jamais tue.
        if (derniere && t.length > 40) derniere.texte += ' ' + t;
        else if (i > 1 && t.length > 200 && !/Personnes issues de la demande|Immeuble issu de la demande|NOUVELLE VERSION/i.test(t)) pagesNonComprises++;
        return;
      }
      const rubrique = plat(rubriques[0][1]);
      const tetes = [...t.matchAll(RE_TETE)].filter((m) => !/^(RELEVE|ETAT|NOUVELLE)/.test(plat(m[1]).toUpperCase()));
      if (!tetes.length) { if (derniere) derniere.texte += ' ' + t; else pagesNonComprises++; return; }
      if (derniere && tetes[0].index > 0) derniere.texte += ' ' + t.slice(0, tetes[0].index);
      tetes.forEach((m, k) => {
        const seg = t.slice(m.index, k + 1 < tetes.length ? tetes[k + 1].index : t.length);
        const nature = net(m[1]).slice(0, 120);
        const cle = rubrique.slice(0, 12) + '|' + nature + '|' + m[2];
        const e = formalites.get(cle) || { rubrique, nature, page: Number(m[2]), texte: '' };
        e.texte += ' ' + seg;
        formalites.set(cle, e);
        derniere = e;
      });
    });
    // Les charges signalées par l'ADSN dans un complément (rubrique Publication) : la DERNIÈRE « Disposition n° … : » avant chaque
    // pictogramme, et le complément qui le SUIT.
    for (const f of formalites.values()) {
      if (!/publication/.test(f.rubrique)) continue;
      const re = /Une charge est identifi[ée]e dans le compl[ée]ment/gi;
      let m;
      while ((m = re.exec(f.texte))) {
        const avant = f.texte.slice(0, m.index);
        const d = avant.lastIndexOf('Disposition n°');
        const nat = d >= 0 ? net(avant.slice(d).replace(/^Disposition n°\s*\d+\s*\/\s*\S+\s*:\s*/i, '')) : '';
        const apres = f.texte.slice(m.index);
        const fin = apres.search(/Disposition n°/);
        const comp = /Compl[ée]ment\s*:\s*(.+?)(?=\s+(?:Relev\s*[ée] des formalit|Disposition n°|ANF_\d|\d+\s+sur\s+\d+)|$)/i.exec(fin > 0 ? apres.slice(0, fin) : apres);
        const c = { nature: nat.slice(0, 80), page: f.page, complement: comp ? net(comp[1]).slice(0, 300) : '' };
        // Une même charge répétée sur les dispositions d'une formalité (servitude sur plusieurs parcelles) : une fois.
        if (!c.complement || !complements.some((x) => x.page === c.page && x.nature === c.nature && x.complement === c.complement)) complements.push(c);
      }
    }
    const enAttente = [...formalites.values()].filter((f) => /attente|rejet/.test(f.rubrique)).length;
    /** @type {InscriptionEH[]} */
    const inscriptions = [...formalites.values()].filter((f) => /^charge/.test(f.rubrique)).map((c) => {
      const t = c.texte;
      const reference = net((new RegExp('R[ée]f[ée]rence d' + AP + 'enliassement\\s*:\\s*(\\d{4}\\s*[A-Z]\\s*\\d+)', 'i').exec(t) || [])[1] || '').replace(/\s+/g, ' ');
      // Radiation totale : seulement quand la formalité ne cite aucune AUTRE référence d'enliassement que la sienne (une mention qui radie
      // une autre inscription ne radie pas celle-ci) ; dans le doute, en cours (audit 0.384.0).
      const refs = new Set([...t.matchAll(/\b(\d{4})\s*([A-Z])\s*(\d+)\b/g)].map((x) => `${x[1]} ${x[2]} ${x[3]}`));
      if (reference) refs.delete(reference);
      const mentionTotale = /radiation\s+totale/i.test(t);
      const radiationTotale = mentionTotale && refs.size === 0;
      const radiationPartielle = !mentionTotale && /radiation\s+partielle/i.test(t);
      // La date extrême d'effet : la PLUS TARDIVE citée (une date prorogée ou renouvelée passe devant la date initiale).
      // « Date d'extrême effet » (forme de l'état-réponse ANF, relevée le 28/10), « date extrême d'effet », « péremption » — jamais la « date
      // d'extrême exigibilité » (fin du prêt, pas de l'inscription).
      const dates = [...t.matchAll(new RegExp('(?:date d' + AP + 'extr[êe]me effet|date extr[êe]me d' + AP + 'effet|p[ée]remption)\\s*:?\\s*(?:au\\s*)?(\\d{1,2}\\/\\d{1,2}\\/\\d{4})', 'gi'))].map((x) => iso(x[1])).filter(Boolean).sort();
      const dateExtremeEffet = dates.length ? dates[dates.length - 1] : '';
      // « Montant principal » de chaque disposition quand l'état l'écrit (jamais les accessoires ni le capital social du créancier) ;
      // sinon le motif large, hors « capital de » et « accessoires » (relecture 0.384.0). Pas de dédoublonnage : deux dispositions du même
      // montant font deux montants.
      const RE_MONTANT = '(\\d[\\d .\\u00a0\\u202f]*,\\d{2})\\s*(?:EUR|€)';
      const principaux = [...t.matchAll(new RegExp('montant principal\\s*:?\\s*' + RE_MONTANT, 'gi'))].map((x) => x[1]);
      const larges = principaux.length ? [] : [...t.matchAll(new RegExp('(?:montant|principal|somme)([^0-9]{0,40})' + RE_MONTANT, 'gi'))]
        .filter((x) => !/accessoire|capital de/i.test(x[1]) && !/accessoire/i.test(t.slice((x.index || 0) - 20, x.index || 0))).map((x) => x[2]);
      const montants = (principaux.length ? principaux : larges).map((x) => net(x).replace(/[\u00a0\u202f]/g, ' ') + ' €');
      const montant = montants.slice(0, 4).join(' + ');
      // Le premier créancier : après « Créancier » (et l'en-tête « Numéro d'identité »), un index « - » ou un chiffre éventuel, jusqu'au SIREN,
      // au « - » de la colonne vide ou à la rubrique suivante ; un nom qui porte encore un en-tête ou un SIREN est écarté (« à vérifier »).
      const brutCreancier = net((new RegExp('Cr[ée]anciers?(?:\\s+Num[ée]ro d' + AP + 'identit[ée])?\\s+(?:-\\s+|\\d{1,2}\\s+)?(.+?)(?=\\s+-\\s|\\s+-$|\\s+\\d{3}\\s?\\d{3}\\s?\\d{3}\\b|\\s+au\\s+capital\\b|\\s+(?:Num[ée]ro d' + AP + 'identit|Constituant|Contre|Date de naissance|N°\\s*SIREN|Siren|D[ée]biteurs?|Propri[ée]taire|Immeuble|Disposition|Montant|RCS)\\b)', 'i').exec(t) || [])[1] || '');
      const creancier = /num[ée]ro d.identit|\d{3}\s?\d{3}\s?\d{3}/i.test(brutCreancier) ? '' : brutCreancier.slice(0, 60);
      /** @type {'en_cours' | 'radiee' | 'perimee'} */
      const etat = radiationTotale ? 'radiee' : dateExtremeEffet && reference && dateExtremeEffet < (delivreLe || net(aujourdhui)) ? 'perimee' : 'en_cours';
      return {
        nature: c.nature, page: c.page, redacteur: champ(t, /R[ée]dacteur/), dateActe: iso(champ(t, new RegExp('Date de l' + AP + 'acte'))), dateDepot: iso(champ(t, /Date de d[ée]p[ôo]t/)),
        reference, creancier, montant, dateExtremeEffet, etat,
        radiation: radiationTotale ? 'totale' : (radiationPartielle || mentionTotale) ? 'partielle' : ''
      };
    });
    const faces = Number((/(\d+)\s+faces? de copies? de fiches? d[ée]livr[ée]es?/i.exec(tout) || [])[1] || 0);
    // Contrôle de complétude : le nombre de formalités annoncé par l'état, comparé à celles reconnues (toutes rubriques). Un écart, une page
    // non comprise : la lecture est INCOMPLÈTE — jamais « aucune inscription » (audit 0.384.0).
    const annoncees = Number((/(\d+)\s+formalit[ée]s?\s+d[ée]livr[ée]es?\s+incluant/i.exec(tout) || [])[1] || NaN);
    const reconnues = formalites.size;
    const complete = pagesNonComprises === 0 && (Number.isNaN(annoncees) || annoncees === reconnues);
    return { anf: estEtatReponseANF(textes), delivreLe, inscriptions, chargesComplement: complements, enAttente, facesStock: faces || pagesStock, pagesStock,
      flux: { du: flux ? iso(flux[1]) : '', au: flux ? iso(flux[2]) : '' },
      lecture: { complete, annoncees: Number.isNaN(annoncees) ? null : annoncees, reconnues, pagesNonComprises } };
  }

  /** Pure : le nom d'une pièce jointe qui est un état hypothécaire (état-réponse ANF, hors formalité, renseignements sommaires). @param {string} nom */
  function nomDitEtatHypothecaire(nom) {
    const n = plat(nom).replace(/[_-]+/g, ' ');
    return /etat\s*(re\s*)?ponse|etat hypothecaire|hors formalite|\bhf\b.*\banf\b|renseignements sommaires|\behf\b|\brhf\b/.test(n);
  }

  /** Pure : les inscriptions en cours (ni radiées totalement, ni périmées). @param {EtatHypothecaire | null | undefined} e */
  function inscriptionsEnCours(e) {
    return ((e && e.inscriptions) || []).filter((x) => x.etat === 'en_cours');
  }

  exporter({ estEtatReponseANF, analyserEtatHypothecaire, nomDitEtatHypothecaire, inscriptionsEnCours });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
