// @ts-check
'use strict';
// Modèle des données d'Authen.TIC tel que CLAIRE le lit (plan validé par l'étude le 27/10, étape 2 — cartographie « Architecture Authen.TIC
// Silicium » : un dossier, ses sous-dossiers, leurs comparants, immeubles, formalités préalables, actes, formalités postérieures, pièces
// jointes et mails). Code COMMUN poste + serveur : des fonctions PURES qui passent d'une page relevée (le relevé de l'extension,
// extension-firefox/releve.js, ou du navigateur du serveur : { titre, onglets, champs, tableaux, texte }) à ce modèle — l'« instantané »
// d'un dossier. Rien n'est écrit dans Authentic ; rien n'est deviné : une valeur que la page ne montre pas reste vide.
// Les types (JSDoc, vérifiés par `npm run types`) tiennent lieu du « modèle TypeScript » du plan : CLAIRE est en JavaScript sans compilation.

/**
 * @typedef {'VTE' | 'SUCC' | 'DONATION' | 'AUTRE'} NatureDossierAT
 * @typedef {'APR' | 'ECV' | 'T@' | 'ACT' | 'MIC' | 'SPR' | 'BRI' | 'CJN'} BadgeAT
 * @typedef {{ nom: string, role: string }} ComparantAT
 * @typedef {{ adresse: string, etiquette: string }} ImmeubleAT
 * @typedef {{ badge: BadgeAT, libelle: string, groupe: string, statut: string, dates: string[],
 *   creeLe?: string, envoyeLe?: string, recuLe?: string, signeLe?: string, numeroRepertoire?: string, numeroChrono?: string }} FormaliteAT
 * @typedef {{ pjId: string, nom: string, dossierGed: string }} PieceJointeAT
 * @typedef {{ de: string, le: string, statut: string, objet: string }} MailAT
 * @typedef {{ intitule: string, nature: NatureDossierAT, statut: string, statutLe: string, comparants: ComparantAT[], immeubles: ImmeubleAT[],
 *   formalitesPrealables: FormaliteAT[], actes: FormaliteAT[], formalitesPosterieures: FormaliteAT[], pieces: PieceJointeAT[], mails: MailAT[] }} SousDossierAT
 * @typedef {{ reference: string, libelle: string, sousDossier: SousDossierAT | null, luLe: string, pages: number }} InstantaneAT
 */

(function (exporter) {
  var BADGES_AT = ['APR', 'ECV', 'T@', 'ACT', 'MIC', 'SPR', 'BRI', 'CJN'];
  // Statuts d'un sous-dossier (badge à côté du titre ; relevés par l'étude le 05/10 : menu du badge).
  // (« En cours » n'en est pas un : c'est l'état d'une rédaction — relecture 0.376.1.)
  var STATUTS_SOUS_DOSSIER_AT = ['Nouveau', 'Demande de pièces', 'Réception des pièces', 'Préparation projet', 'Préparation définitive', 'Signé', 'En attente', 'Sans suite'];
  var RE_DATE_FR = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/;
  var RE_DATE_FR_PARTOUT = /(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/g;

  /** @param {any} v */
  function net(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  /** @param {string} t */
  function plat(t) { return net(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  /** Pure : « 03/10/2026 » → « 2026-10-03 » ('' sinon). @param {string} t */
  function isoDepuisFrAT(t) {
    const m = RE_DATE_FR.exec(net(t));
    if (!m || Number(m[1]) < 1 || Number(m[1]) > 31 || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  /** Pure : le badge d'une ligne — écrit en tête de son libellé (« ECV Acte de naissance… »), sinon déduit du tableau et du libellé.
   * @param {string} libelle @param {string} groupe @returns {BadgeAT} */
  function badgeLigneAT(libelle, groupe) {
    const tete = /^\s*(APR|ECV|T@|ACT|MIC|SPR|BRI|CJN)(?![A-Za-z0-9])/.exec(String(libelle || ''));
    if (tete) return /** @type {BadgeAT} */ (tete[1]);
    const t = plat(libelle + ' ' + groupe);
    // Le libellé d'abord : un casier rangé dans un tableau « Etat civil » reste un casier (audit 0.377.0).
    if (/casier|cjn/.test(plat(libelle))) return 'CJN';
    if (/etat[- ]civil|comedec/.test(t)) return 'ECV';
    if (/casier|cjn/.test(t)) return 'CJN';
    if (/micen|^copie (simple|authentique)/.test(plat(libelle)) || /micen/.test(plat(groupe))) return 'MIC';
    if (/bordereau|copie hypothecaire/.test(t)) return 'SPR';
    if (/\bbri\b|references immobilieres/.test(t)) return 'BRI';
    if (/requisition|tele@ctes|teleactes|t@/.test(t)) return 'T@';
    // Un acte : dans le tableau « Rédaction » / « Actes signés » ; le libellé seul ne décide que sans tableau nommé (relecture 0.376.1 :
    // « Déclaration préalable de travaux » d'un tableau d'urbanisme n'est pas un acte).
    if (/redaction|actes? signe/.test(plat(groupe)) || (!net(groupe) && /^(acte|notoriete|attestation de propriete|declaration de succession|vente|donation)\b/.test(plat(libelle)))) return 'ACT';
    return 'APR';
  }

  /** Pure : la section d'une ligne (formalités préalables, actes, formalités postérieures). @param {BadgeAT} badge @param {string} groupe */
  function sectionLigneAT(badge, groupe) {
    const g = plat(groupe);
    // Le tableau décide d'abord (relecture 0.376.1 : une attestation des formalités postérieures n'est pas un acte).
    if (/posterieure|bordereau|copie|micen|publication|attestation/.test(g)) return 'posterieures';
    if (/redaction|actes? signe/.test(g)) return 'actes';
    if (/prealable|etat civil|courrier|demande|banque|tele@ctes|anf|safer|urbanisme/.test(g)) return 'prealables';
    if (badge === 'ACT') return 'actes';
    if (badge === 'SPR' || badge === 'BRI' || badge === 'MIC') return 'posterieures';
    return 'prealables';
  }

  /** Pure : les lignes « intitulé · date · état » des tableaux d'une page (formalités et actes ; jamais le cadastre ni les lots).
   * @param {any} capture @returns {FormaliteAT[]} */
  function lignesFormalitesAT(capture) {
    /** @type {FormaliteAT[]} */
    const out = [];
    ((capture && capture.tableaux) || []).forEach((/** @type {any} */ t) => {
      const entete = (t && t.entete || []).map(plat);
      if (entete.includes('section') || entete.some((/** @type {string} */ e) => /tantiem|contenance/.test(e))) return;
      ((t && t.lignes) || []).forEach((/** @type {any} */ l) => {
        const cellules = (Array.isArray(l) ? l : []).map(net);
        const groupe = net(t && t.titre).slice(0, 80);
        // Les dates de la ligne, même écrites dans un texte (« Signé le 29/09/2026 », « Retour le … »), sans doublon.
        const dates = [...new Set(cellules.flatMap((x) => (x.match(RE_DATE_FR_PARTOUT) || []).map(isoDepuisFrAT)).filter(Boolean))];
        const textes = cellules.filter((x) => x && !RE_DATE_FR.test(x) && !/^⟦icône⟧/.test(x));
        // Une ligne de la Rédaction se lit sans date (« Non rédigé ») ; ailleurs, une date est exigée (lignes de mise en page écartées).
        const redaction = /redaction|actes? signe/.test(plat(groupe));
        if (!textes.length || (!dates.length && !(redaction && cellules.filter(Boolean).length >= 2)) || (!redaction && cellules.length < 3)) return;
        const libelle = textes[0].slice(0, 200);
        const badge = badgeLigneAT(libelle, groupe);
        const statut = textes.length > 1 ? textes[textes.length - 1].slice(0, 80) : '';
        /** @type {FormaliteAT} */
        const f = { badge, libelle: libelle.replace(/^\s*(APR|ECV|T@|ACT|MIC|SPR|BRI|CJN)\s+/, ''), groupe, statut, dates };
        const signe = /sign[ée]e? le\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i.exec(cellules.join(' '));
        if (signe) f.signeLe = isoDepuisFrAT(signe[1]);
        out.push(f);
      });
    });
    return out;
  }

  /** Pure : les lignes du texte de la page sans les titres des onglets inactifs (un autre dossier ouvert) ni « Importer avec 6e SENS ».
   * @param {string} texte @param {any[]} [onglets] */
  function lignesActivesAT(texte, onglets) {
    const inactifs = new Set((Array.isArray(onglets) ? onglets : []).filter((o) => o && !o.actif).map((o) => net(o.titre)).filter(Boolean));
    return String(texte || '').split('\n').map((l) => net(l).replace(/\s*Importer avec 6e SENS\s*$/i, '')).filter((l) => l && !inactifs.has(l));
  }

  /** Pure : l'indice de l'en-tête du sous-dossier affiché — une ligne « N - … » suivie (3 lignes au plus) d'un statut, de « Comparants »,
   * « Immeubles » ou « Importer » ; à défaut la première ligne « N - … » qui n'est pas une promesse ni un avenant. @param {string[]} lignes */
  function indexIntituleAT(lignes) {
    const candidats = lignes.map((l, i) => (/^\d{1,3}\s*-\s*\S/.test(l) ? i : -1)).filter((i) => i >= 0);
    const autre = (/** @type {number} */ i) => /^\d{1,3}\s*-\s*(promesse|avenant|compromis)/i.test(lignes[i]);
    const suivi = (/** @type {number} */ i) => lignes.slice(i + 1, i + 4).some((x) => STATUTS_SOUS_DOSSIER_AT.some((st) => plat(st) === plat(x)) || /^(Comparants|Immeubles|Importer)\b/i.test(x));
    // La vente suivie de son badge ou de son panneau d'abord, puis tout en-tête suivi, puis la première vente, puis le premier.
    for (const ok of [(/** @type {number} */ i) => !autre(i) && suivi(i), suivi, (/** @type {number} */ i) => !autre(i), () => true]) {
      const i = candidats.find(ok);
      if (i != null) return i;
    }
    return -1;
  }

  /** Pure : le statut du sous-dossier (badge à côté du titre) et sa date, lus dans le texte de la page. @param {string} texte @param {any[]} [onglets] */
  function statutSousDossierAT(texte, onglets) {
    const lignes = lignesActivesAT(texte, onglets);
    // Le badge suit l'en-tête du sous-dossier (« 2 - VTE … ») : seulement les 4 lignes qui le suivent (relecture 0.376.1 : un « Nouveau »
    // de menu ou un « Signé » d'un tableau plus bas n'est pas le statut).
    const tete = indexIntituleAT(lignes);
    if (tete < 0) return { statut: '', le: '' };
    for (let i = tete + 1; i < Math.min(lignes.length, tete + 5); i++) {
      const s = STATUTS_SOUS_DOSSIER_AT.find((x) => plat(x) === plat(lignes[i]));
      if (!s) continue;
      const le = isoDepuisFrAT(lignes[i + 1] || '');
      return { statut: s, le };
    }
    return { statut: '', le: '' };
  }

  // Les qualités d'un comparant selon la nature du dossier (cartographie : Vendeur/Acquéreur, Défunt/Héritier, Donateur/Donataire).
  var RE_QUALITE = /^(Vendeur|Acqu[ée]reur|Promettant|B[ée]n[ée]ficiaire|D[ée]funt|H[ée]ritier|L[ée]gataire|Conjoint survivant|Donateur|Donataire|Autre intervenant|Intervenant)s?$/i;

  /** Pure : comparants et immeubles du panneau de gauche de la page d'un sous-dossier. @param {string} texte */
  function panneauGaucheAT(texte) {
    const lignes = String(texte || '').split('\n').map(net).filter(Boolean);
    /** @type {ComparantAT[]} */ const comparants = [];
    /** @type {ImmeubleAT[]} */ const immeubles = [];
    let zone = '';
    for (const brute of lignes) {
      // Icônes collées au texte (« personM. MARTIN Paul », relecture 0.376.1) retirées.
      const l = brute.replace(/^(person|domain|euro_symbol|business|home|apartment)(?=[A-Z])/, '');
      if (/(?:^|\s)Comparants\s*\(\d+\)/i.test(l)) { zone = 'c'; continue; }
      if (/(?:^|\s)Immeubles\s*\(\d+\)/i.test(l)) { zone = 'i'; continue; }
      if (/^(Tiers|Parties prenantes|Formalit[ée]s|Actes)\b/i.test(l) || /^\d{1,3}\s*-\s*\S/.test(l)) { zone = ''; continue; }
      if (zone === 'c') {
        if (RE_QUALITE.test(l)) { if (comparants.length && !comparants[comparants.length - 1].role) comparants[comparants.length - 1].role = l; continue; }
        if (/^(person|domain|euro_symbol|business|qualit[ée]|nom|r[ôo]le)$/i.test(l) || l.length < 4) continue;
        // Qualité écrite en fin de ligne (« Mme DURAND Claire Acquéreur »).
        const fin = /\s(Vendeur|Acqu[ée]reur|Promettant|B[ée]n[ée]ficiaire|D[ée]funt|H[ée]ritier|L[ée]gataire|Donateur|Donataire)s?$/i.exec(l);
        const nom = fin ? l.slice(0, fin.index) : l;
        // Un nom : une civilité, ou au moins deux mots dont un en capitales (jamais un intitulé de colonne d'un seul mot).
        if ((/\b(M\.|Mme|Mlle|Monsieur|Madame)\s/.test(nom) || (/[A-Z]{2,}/.test(nom) && nom.split(' ').length >= 2)) && comparants.length < 30) comparants.push({ nom: nom.slice(0, 120), role: fin ? fin[1] : '' });
      } else if (zone === 'i') {
        if (/^Immeuble\b/i.test(l)) { if (immeubles.length && !immeubles[immeubles.length - 1].etiquette) immeubles[immeubles.length - 1].etiquette = l.slice(0, 60); continue; }
        if (/^\d{5}\s/.test(l) && immeubles.length < 30) immeubles.push({ adresse: l.slice(0, 160), etiquette: '' });
      }
    }
    return { comparants, immeubles };
  }

  /** Pure : la nature du dossier d'après son intitulé. @param {string} intitule @returns {NatureDossierAT} */
  function natureDossierAT(intitule) {
    const t = plat(intitule);
    if (/\b(vte|vente|promesse)\b/.test(t)) return 'VTE';
    if (/\b(succ|succession|notoriete)\b|veuve? de/.test(t)) return 'SUCC';
    if (/\bdonation\b/.test(t)) return 'DONATION';
    return 'AUTRE';
  }

  /** Pure : la référence (« A 2026 00286 ») et le libellé de l'en-tête du dossier affiché. @param {string} texte */
  function enTeteDossierAT(texte) {
    const l = String(texte || '').split('\n').map(net).find((x) => /^[A-Z]\s+(?:19|20)\d{2}\s+\d{4,6}\b/.test(x)) || '';
    const m = /^([A-Z]\s+(?:19|20)\d{2}\s+\d{4,6})\s*(.*)$/.exec(l);
    return m ? { reference: m[1].replace(/\s+/g, ' '), libelle: m[2].slice(0, 200) } : { reference: '', libelle: '' };
  }

  /** Pure : l'en-tête du sous-dossier affiché (« 2 - VTE MARTIN / DURAND »), jamais un onglet inactif ni une promesse listée.
   * @param {string} texte @param {any[]} [onglets] */
  function intituleSousDossierAT(texte, onglets) {
    const lignes = lignesActivesAT(texte, onglets);
    const i = indexIntituleAT(lignes);
    return i >= 0 ? lignes[i].slice(0, 200) : '';
  }

  /**
   * Pure : l'instantané d'un dossier d'après ses pages gardées (pagesAuthentic.js : [{ nature, capture, recueLe }], de la plus ancienne à
   * la plus récente). La DERNIÈRE page du dossier donne le sous-dossier ; les autres natures (pièces jointes, mails…) le complètent quand
   * leurs lecteurs existent (étapes suivantes du plan).
   * @param {Array<{ nature: string, capture: any, recueLe?: string }>} pages @returns {InstantaneAT | null}
   */
  function instantaneDepuisPagesAT(pages) {
    const liste = Array.isArray(pages) ? pages.filter((p) => p && p.capture) : [];
    const dossier = liste.filter((p) => p.nature === 'dossier').slice(-1)[0];
    if (!dossier) return null;
    const texte = String(dossier.capture.texte || '');
    const tete = enTeteDossierAT(texte);
    const onglets = dossier.capture.onglets;
    const intitule = intituleSousDossierAT(texte, onglets);
    const { statut, le } = statutSousDossierAT(texte, onglets);
    const { comparants, immeubles } = panneauGaucheAT(texte);
    const lignes = lignesFormalitesAT(dossier.capture);
    /** @type {SousDossierAT} */
    const sd = {
      intitule, nature: natureDossierAT(intitule || tete.libelle), statut, statutLe: le, comparants, immeubles,
      formalitesPrealables: lignes.filter((x) => sectionLigneAT(x.badge, x.groupe) === 'prealables'),
      actes: lignes.filter((x) => sectionLigneAT(x.badge, x.groupe) === 'actes'),
      formalitesPosterieures: lignes.filter((x) => sectionLigneAT(x.badge, x.groupe) === 'posterieures'),
      pieces: [], mails: []
    };
    const dates = liste.map((p) => String(p.recueLe || '')).filter(Boolean).sort();
    return { reference: tete.reference, libelle: tete.libelle, sousDossier: sd, luLe: dates[dates.length - 1] || '', pages: liste.length };
  }

  /**
   * Adaptateur vers ce que la fiche garde déjà (`d.authentic`) : l'état de l'acte de vente (« Non rédigé », « En cours », « Signé le … ») et
   * le statut du sous-dossier — sans rien écrire, pour qu'un écran lise le modèle sans changer la fiche.
   * @param {InstantaneAT | null} inst
   */
  function versFicheAT(inst) {
    const sd = inst && inst.sousDossier;
    if (!sd) return null;
    // L'acte principal, jamais une procuration, une promesse, un mandat ou un courrier (relecture 0.376.1, comme etatActeAuthentic du poste).
    const principaux = sd.actes.filter((a) => !/procuration|compromis|promesse|mandat|courrier|avant[- ]contrat/.test(plat(a.libelle)));
    const acte = principaux.find((a) => /vente|notoriete|attestation|declaration|donation/.test(plat(a.libelle))) || principaux[0] || null;
    return {
      reference: inst ? inst.reference : '',
      statutSousDossier: sd.statut ? { statut: sd.statut, le: sd.statutLe } : null,
      acte: acte ? { libelle: acte.libelle, etat: acte.statut, dates: acte.dates, signeLe: acte.signeLe || '' } : null,
      // En attente : ni reçue, ni revenue, ni décidée (une réponse négative ou une non-préemption est une décision rendue).
      enAttente: sd.formalitesPrealables.filter((f) => !/positi|negati|re[çc]u|retour le|termin|sign|non[- ]preemption|refus|decision (rendue|du)/i.test(plat(f.statut))).length
    };
  }

  exporter({ BADGES_AT, STATUTS_SOUS_DOSSIER_AT, isoDepuisFrAT, lignesActivesAT, indexIntituleAT, badgeLigneAT, sectionLigneAT, lignesFormalitesAT, statutSousDossierAT, panneauGaucheAT,
    natureDossierAT, enTeteDossierAT, intituleSousDossierAT, instantaneDepuisPagesAT, versFicheAT });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
