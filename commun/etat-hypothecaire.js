// @ts-check
'use strict';
// Relecture d'un état hypothécaire (étude 27/10 : « la relecture d'un état hypothécaire dans les annexes [d'Authentic] pour vérifier s'il y
// a des inscriptions hypothécaires » ; « les inscriptions seront en rouge »). L'état-réponse ANF de l'ADSN (nouvelle version) range les
// formalités du FLUX (publiées depuis 2002, vrai texte) par nature : Registre des dépôts, Volumétrie / Copropriété / Lotissement,
// Publication, CHARGE (en rouge : inscriptions d'hypothèque, privilèges, saisies…), Formalités en attente et rejets ; les fiches d'avant
// (le STOCK) sont des scans de fiches manuscrites, jamais lus ici — seulement comptés, « à relire par le notaire ».
// Pure : le texte de chaque page (pdf.js, une ligne par page) → les inscriptions en cours, celles radiées ou périmées à part, les charges
// signalées par l'ADSN dans un complément, les formalités en attente. Rien n'est deviné : un champ non lu reste vide (« à vérifier »).
// Structure relevée sur un état réel (27/10, rubrique Publication ; aucune Charge dans cet état) : la lecture des champs d'une Charge suit
// la même mise en page et reste à vérifier sur le premier état qui en porte une (point terrain `etat-hypothecaire`).

/**
 * @typedef {{ nature: string, page: number, redacteur: string, dateActe: string, dateDepot: string, reference: string, creancier: string,
 *   montant: string, dateExtremeEffet: string, etat: 'en_cours' | 'radiee' | 'perimee', radiation: '' | 'totale' | 'partielle' }} InscriptionEH
 * @typedef {{ nature: string, page: number, complement: string }} ChargeComplementEH
 * @typedef {{ anf: boolean, delivreLe: string, inscriptions: InscriptionEH[], chargesComplement: ChargeComplementEH[], enAttente: number,
 *   facesStock: number, pagesStock: number, flux: { du: string, au: string } }} EtatHypothecaire
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
    const m = new RegExp(libelle.source + '\\s*:\\s*(.+?)(?=\\s+(?:R[ée]dacteur|Commune|Date de l\'acte|Date de d[ée]p[ôo]t|R[ée]f[ée]rence d\'enliassement|Code sages|Disposition n°|Montant|Date extr[êe]me|Compl[ée]ment)\\b|$)', 'i').exec(t);
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
    const reference = delivreLe || net(aujourdhui);
    /** @type {Map<string, { nature: string, page: number, texte: string }>} */
    const charges = new Map();
    /** @type {ChargeComplementEH[]} */
    const complements = [];
    let enAttente = 0;
    let pagesStock = 0;
    textes.forEach((t, i) => {
      if (/Copie de fiche\s*Stock/i.test(t) && t.length < 200) { pagesStock++; return; }
      const rubrique = /Relev[ée] des formalit[ée]s\s*-\s*(Publication|Charge|Formalit[ée]s en attente[^]*?|Registre des d[ée]p[ôo]ts|Volum[ée]trie|Copropri[ée]t[ée]|Lotissement|Rejet)/i.exec(t);
      if (!rubrique) return;
      const nomRubrique = plat(rubrique[1]);
      // L'en-tête d'une formalité : « NATURE PAGE a À PAGE b » ; une suite de page répète l'en-tête avec le même a.
      const tete = /-\s*\S+\s+(.+?)\s+PAGE\s+(\d+)\s+[ÀA]\s+PAGE\s+\d+/i.exec(t);
      const nature = tete ? net(tete[1]).slice(0, 120) : '';
      const debut = tete ? Number(tete[2]) : i + 1;
      if (/^charge/.test(nomRubrique)) {
        const cle = nature + '|' + debut;
        const e = charges.get(cle) || { nature, page: debut, texte: '' };
        e.texte += ' ' + t;
        charges.set(cle, e);
      } else if (/attente|rejet/.test(nomRubrique)) {
        enAttente++;
      } else if (/publication/.test(nomRubrique) && /charge est identifi[ée]e dans le compl[ée]ment/i.test(t)) {
        // La disposition marquée par le pictogramme de l'ADSN, et le complément qui dit la charge.
        // La nature : la DERNIÈRE « Disposition n° … : » avant le pictogramme (jamais une disposition plus haut sur la page).
        const re = /Une charge est identifi[ée]e dans le compl[ée]ment/gi;
        let m;
        const comp = /Compl[ée]ment\s*:\s*(.+?)(?=\s+(?:Relev[ée] des formalit|Disposition n°|ANF_|\d+\s+sur\s+\d+)|$)/i.exec(t);
        while ((m = re.exec(t))) {
          const avant = t.slice(0, m.index);
          const d = avant.lastIndexOf('Disposition n°');
          const nat = d >= 0 ? net(avant.slice(d).replace(/^Disposition n°\s*\d+\s*\/\s*\S+\s*:\s*/i, '')) : '';
          complements.push({ nature: nat.slice(0, 80), page: i + 1, complement: comp ? net(comp[1]).slice(0, 300) : '' });
        }
        // Le complément est parfois sur la page suivante (suite de la même formalité).
        if (!comp && complements.length && textes[i + 1]) {
          const suite = /Compl[ée]ment\s*:\s*(.+?)(?=\s+(?:ANF_|\d+\s+sur\s+\d+)|$)/i.exec(textes[i + 1]);
          if (suite) complements[complements.length - 1].complement = net(suite[1]).slice(0, 300);
        }
      }
    });
    /** @type {InscriptionEH[]} */
    const inscriptions = [...charges.values()].map((c) => {
      const t = c.texte;
      const radiationTotale = /radiation\s+totale/i.test(t);
      const radiationPartielle = !radiationTotale && /radiation\s+partielle/i.test(t);
      const dateExtremeEffet = iso((/date extr[êe]me d'effet\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(t) || /p[ée]remption\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(t) || [])[1] || '');
      const montant = (/(?:montant|principal|capital|somme)[^0-9]{0,40}(\d[\d . ]*,\d{2})\s*(?:EUR|€)/i.exec(t) || [])[1] || '';
      const creancier = net((/Cr[ée]anciers?(?:\s*,\s*[A-Za-zéè ]+)?\s+(?:\d+\s+)?(.+?)\s+(?:Date de naissance|N°\s*SIREN|Siren|D[ée]biteurs?|Immeuble|Disposition|Montant)/i.exec(t) || [])[1] || '').slice(0, 120);
      /** @type {'en_cours' | 'radiee' | 'perimee'} */
      const etat = radiationTotale ? 'radiee' : dateExtremeEffet && reference && dateExtremeEffet < reference ? 'perimee' : 'en_cours';
      return {
        nature: c.nature, page: c.page, redacteur: champ(t, /R[ée]dacteur/), dateActe: iso(champ(t, /Date de l'acte/)), dateDepot: iso(champ(t, /Date de d[ée]p[ôo]t/)),
        reference: net((/R[ée]f[ée]rence d'enliassement\s*:\s*(\d{4}\s*[A-Z]\s*\d+)/i.exec(t) || [])[1] || ''),
        creancier, montant: montant ? net(montant).replace(/ /g, ' ') + ' €' : '', dateExtremeEffet, etat,
        radiation: radiationTotale ? 'totale' : radiationPartielle ? 'partielle' : ''
      };
    });
    const faces = Number((/(\d+)\s+faces? de copies? de fiches? d[ée]livr[ée]es?/i.exec(tout) || [])[1] || 0);
    return { anf: estEtatReponseANF(textes), delivreLe, inscriptions, chargesComplement: complements, enAttente, facesStock: faces || pagesStock, pagesStock,
      flux: { du: flux ? iso(flux[1]) : '', au: flux ? iso(flux[2]) : '' } };
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
