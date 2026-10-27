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
  var STATUTS_SOUS_DOSSIER_AT = ['Nouveau', 'Demande de pièces', 'Réception des pièces', 'Préparation projet', 'Préparation définitive', 'Signé', 'En attente', 'Sans suite', 'En cours'];
  var RE_DATE_FR = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/;

  /** @param {any} v */
  function net(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  /** @param {string} t */
  function plat(t) { return net(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  /** Pure : « 03/10/2026 » → « 2026-10-03 » ('' sinon). @param {string} t */
  function isoDepuisFrAT(t) {
    const m = RE_DATE_FR.exec(net(t));
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  }

  /** Pure : le badge d'une ligne — écrit en tête de son libellé (« ECV Acte de naissance… »), sinon déduit du tableau et du libellé.
   * @param {string} libelle @param {string} groupe @returns {BadgeAT} */
  function badgeLigneAT(libelle, groupe) {
    const tete = /^\s*(APR|ECV|T@|ACT|MIC|SPR|BRI|CJN)(?![A-Za-z0-9])/.exec(String(libelle || ''));
    if (tete) return /** @type {BadgeAT} */ (tete[1]);
    const t = plat(libelle + ' ' + groupe);
    if (/etat[- ]civil|comedec/.test(t)) return 'ECV';
    if (/casier|cjn/.test(t)) return 'CJN';
    if (/micen|copie (simple|authentique)/.test(t)) return 'MIC';
    if (/bordereau|copie hypothecaire/.test(t)) return 'SPR';
    if (/\bbri\b|references immobilieres/.test(t)) return 'BRI';
    if (/requisition|tele@ctes|teleactes|t@/.test(t)) return 'T@';
    if (/redaction|actes? signe|^acte\b/.test(plat(groupe)) || /^(acte|notoriete|attestation|declaration|vente|donation)\b/.test(plat(libelle))) return 'ACT';
    return 'APR';
  }

  /** Pure : la section d'une ligne (formalités préalables, actes, formalités postérieures). @param {BadgeAT} badge @param {string} groupe */
  function sectionLigneAT(badge, groupe) {
    const g = plat(groupe);
    if (badge === 'ACT' || /redaction|actes? signe/.test(g)) return 'actes';
    if (badge === 'SPR' || badge === 'BRI' || badge === 'MIC' || /bordereau|copie|micen|publication|posterieure/.test(g)) return 'posterieures';
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
        const dates = cellules.filter((x) => RE_DATE_FR.test(x)).map(isoDepuisFrAT).filter(Boolean);
        const textes = cellules.filter((x) => x && !RE_DATE_FR.test(x) && !/^⟦icône⟧/.test(x));
        if (!dates.length || !textes.length || cellules.length < 3) return;
        const groupe = net(t && t.titre).slice(0, 80);
        const libelle = textes[0].slice(0, 200);
        const badge = badgeLigneAT(libelle, groupe);
        out.push({ badge, libelle: libelle.replace(/^\s*(APR|ECV|T@|ACT|MIC|SPR|BRI|CJN)\s+/, ''), groupe, statut: textes.length > 1 ? textes[textes.length - 1].slice(0, 80) : '', dates });
      });
    });
    return out;
  }

  /** Pure : le statut du sous-dossier (badge à côté du titre) et sa date, lus dans le texte de la page. @param {string} texte */
  function statutSousDossierAT(texte) {
    const lignes = String(texte || '').split('\n').map(net).filter(Boolean).slice(0, 80);
    for (let i = 0; i < lignes.length; i++) {
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
    for (const l of lignes) {
      if (/^Comparants\s*\(\d+\)/i.test(l)) { zone = 'c'; continue; }
      if (/^Immeubles\s*\(\d+\)/i.test(l)) { zone = 'i'; continue; }
      if (/^(Tiers|Parties prenantes|Formalit[ée]s|Actes)\b/i.test(l) || /^\d{1,3}\s*-\s*\S/.test(l)) { zone = ''; continue; }
      if (zone === 'c') {
        if (RE_QUALITE.test(l)) { if (comparants.length && !comparants[comparants.length - 1].role) comparants[comparants.length - 1].role = l; continue; }
        if (/^(person|domain|euro_symbol|business)$/i.test(l) || l.length < 4) continue;
        if (/\b(M\.|Mme|Mlle|Monsieur|Madame)\s|[A-Z]{2,}/.test(l) && comparants.length < 30) comparants.push({ nom: l.slice(0, 120), role: '' });
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

  /** Pure : l'en-tête du sous-dossier affiché (« 2 - VTE MARTIN / DURAND », jamais une promesse listée en dessous). @param {string} texte */
  function intituleSousDossierAT(texte) {
    const l = String(texte || '').split('\n').map(net).find((x) => /^\d{1,3}\s*-\s*\S/.test(x)) || '';
    return l.slice(0, 200);
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
    const intitule = intituleSousDossierAT(texte);
    const { statut, le } = statutSousDossierAT(texte);
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
    const acte = sd.actes.find((a) => /vente|notoriete|attestation|declaration|donation/i.test(plat(a.libelle))) || sd.actes[0] || null;
    return {
      reference: inst ? inst.reference : '',
      statutSousDossier: sd.statut ? { statut: sd.statut, le: sd.statutLe } : null,
      acte: acte ? { libelle: acte.libelle, etat: acte.statut, dates: acte.dates } : null,
      enAttente: sd.formalitesPrealables.filter((f) => !/positi|re[çc]u|retour le|termin|sign/i.test(f.statut)).length
    };
  }

  exporter({ BADGES_AT, STATUTS_SOUS_DOSSIER_AT, isoDepuisFrAT, badgeLigneAT, sectionLigneAT, lignesFormalitesAT, statutSousDossierAT, panneauGaucheAT,
    natureDossierAT, enTeteDossierAT, intituleSousDossierAT, instantaneDepuisPagesAT, versFicheAT });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
