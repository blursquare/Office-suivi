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
 *   creeLe?: string, envoyeLe?: string, recuLe?: string, signeLe?: string, numeroRepertoire?: string, numeroChrono?: string,
 *   situation?: string, reponse?: string }} FormaliteAT
 * @typedef {{ pjId: string, nom: string, dossierGed: string }} PieceJointeAT
 * @typedef {{ de: string, le: string, statut: string, objet: string }} MailAT
 * @typedef {{ intitule: string, nature: NatureDossierAT, statut: string, statutLe: string, comparants: ComparantAT[], immeubles: ImmeubleAT[],
 *   formalitesPrealables: FormaliteAT[], actes: FormaliteAT[], formalitesPosterieures: FormaliteAT[], pieces: PieceJointeAT[], mails: MailAT[] }} SousDossierAT
 * @typedef {{ reference: string, libelle: string, sousDossier: SousDossierAT | null, luLe: string, pages: number }} InstantaneAT
 * @typedef {'actesASigner' | 'safer' | 'etatCivil' | 'cjn' | 'micen'} EcranSuiviAT
 * @typedef {{ reference: string, libelle: string, dates: string[], situation: string, enAttente: boolean }} LigneSuiviAT
 * @typedef {{ luLe: string, lignes: LigneSuiviAT[], tronque: boolean }} SuiviAT
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

  // Les libellés de l'aperçu d'une formalité (tiroir `previewFormalite`, cartographie du 27/10 : APR « Créée le / Envoyée le / Reçue le », ACT
  // « Date de création, situation, date de signature, N° de répertoire, référence », MIC « N° chrono », ECV « Réponse positive »).
  var CHAMPS_APERCU_AT = [
    ['creeLe', /^(cr[ée]{2}e? le|date de cr[ée]ation(?: de la copie)?)\s*:?\s*/i, 'date'],
    ['envoyeLe', /^envoy[ée]e? le\s*:?\s*/i, 'date'],
    ['recuLe', /^re[çc]u(?:e)? le\s*:?\s*/i, 'date'],
    ['signeLe', /^date de signature\s*:?\s*/i, 'date'],
    ['situation', /^situation\s*:?\s*/i, 'texte'],
    ['numeroRepertoire', /^n[°o]\s*de r[ée]pertoire\s*:?\s*/i, 'texte'],
    ['numeroChrono', /^n[°o]\s*chrono\s*:?\s*/i, 'texte']
  ];

  /**
   * Pure : l'aperçu d'une formalité lu dans le texte du tiroir — la valeur sur la même ligne que son libellé, sinon sur la suivante.
   * @param {string} texte @param {string} [titre] @returns {Record<string, string>}
   */
  function apercuFormaliteAT(texte, titre) {
    const lignes = String(texte || '').split('\n').map(net).filter(Boolean).slice(0, 200);
    /** @type {Record<string, string>} */
    const out = { titre: net(titre) || (lignes[0] || '').slice(0, 200) };
    for (let i = 0; i < lignes.length; i++) {
      for (const [cle, re, sorte] of CHAMPS_APERCU_AT) {
        if (out[/** @type {string} */ (cle)] || !(/** @type {RegExp} */ (re)).test(lignes[i])) continue;
        let v = lignes[i].replace(/** @type {RegExp} */ (re), '').trim();
        if (!v && lignes[i + 1]) v = lignes[i + 1];
        if (sorte === 'date') { const m = /(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/.exec(v); v = m ? isoDepuisFrAT(m[1]) : ''; }
        if (v) out[/** @type {string} */ (cle)] = v.slice(0, 80);
      }
      if (!out.reponse && /^r[ée]ponse (positive|n[ée]gative)/i.test(lignes[i])) out.reponse = lignes[i].slice(0, 40);
    }
    return out;
  }

  /** Pure : l'aperçu rangé sous sa formalité (même libellé, ou l'un contenu dans l'autre) ; rend vrai s'il a trouvé sa place.
   * @param {FormaliteAT[]} formalites @param {Record<string, string>} ap */
  function rangerApercuAT(formalites, ap) {
    const t = plat(String(ap.titre || '').replace(/^\s*(APR|ECV|T@|ACT|MIC|SPR|BRI|CJN)\s+/, ''));
    if (!t) return false;
    // Le même libellé, sinon le plus long qui contient l'autre — jamais un libellé vide (audit 0.378.0).
    const avec = formalites.filter((x) => plat(x.libelle));
    const f = avec.find((x) => plat(x.libelle) === t)
      || avec.filter((x) => plat(x.libelle).includes(t) || t.includes(plat(x.libelle))).sort((a, b) => plat(b.libelle).length - plat(a.libelle).length)[0];
    if (!f) return false;
    for (const k of ['creeLe', 'envoyeLe', 'recuLe', 'signeLe', 'numeroRepertoire', 'numeroChrono']) if (ap[k]) /** @type {any} */ (f)[k] = ap[k];
    if (ap.situation) f.situation = ap.situation;
    if (ap.reponse) f.reponse = ap.reponse;
    return true;
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
    // Les aperçus des formalités (étape 4) : pages « apercu » gardées et tiroir ouvert sur la page du dossier, rangés sous leur ligne.
    const tous = sd.formalitesPrealables.concat(sd.actes, sd.formalitesPosterieures);
    const apercus = liste.filter((p) => p.nature === 'apercu' && p.capture.apercu).map((p) => p.capture.apercu)
      .concat(dossier.capture.apercu ? [dossier.capture.apercu] : []);
    for (const a of apercus) rangerApercuAT(tous, apercuFormaliteAT(a.texte, a.titre));
    // Les pièces jointes (étape 5) : la dernière liste de la GED vue.
    const ged = liste.filter((p) => (p.nature === 'ged' || p.nature === 'dossier') && Array.isArray(p.capture.pieces) && p.capture.pieces.length).slice(-1)[0];
    if (ged) sd.pieces = ged.capture.pieces.slice(0, 300).map((/** @type {any} */ x) => ({ pjId: net(x.pjId).slice(0, 40), nom: net(x.nom).slice(0, 200), dossierGed: net(x.dossier).slice(0, 80) }));
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


  // Les écrans de suivi d'Authentic lus par CLAIRE (étape 7 : « actes à signer, SAFER/DIA, état civil, MICEN ») : menu, puis entrée du
  // menu (cartographie de l'étude du 27/10). Le tableau affiché est relevé ; « Exporter » n'est jamais cliqué (liste noire de la garde).
  // `entrees` : les libellés essayés dans l'ordre (captures du wiki, 28/10 : « Suivi SAFER / DIA-DPU » en version récente, « Suivi SAFER »
  // avant ; « Suivi État-Civil », « Suivi COMEDEC » en 2021). Le suivi CJN : jamais l'aperçu d'une réponse (la consulter la clôture).
  /** @type {Array<{ cle: EcranSuiviAT, menu: string, entrees: string[], titre: string }>} */
  var ECRANS_SUIVIS_AT = [
    { cle: 'actesASigner', menu: 'Office manager', entrees: ['Actes à signer'], titre: 'Actes à signer' },
    { cle: 'safer', menu: 'Suivis', entrees: ['Suivi SAFER / DIA-DPU', 'Suivi SAFER/DIA-DPU', 'Suivi SAFER'], titre: 'SAFER et DIA' },
    { cle: 'etatCivil', menu: 'Suivis', entrees: ['Suivi État-Civil', 'Suivi COMEDEC'], titre: 'État civil' },
    { cle: 'cjn', menu: 'Suivis', entrees: ['Suivi CJN'], titre: 'Casier judiciaire' },
    { cle: 'micen', menu: 'Suivis', entrees: ['Suivi MICEN'], titre: 'MICEN' }
  ];
  // La référence d'un dossier d'Authentic (« A 2026 00247 »), telle que la fiche la retient.
  var RE_REFERENCE_AT = /(?<![A-Za-z0-9])([A-Z])\s?(\d{4})\s?(\d{5})(?!\d)/;

  /** Pure : la référence d'Authentic écrite dans un texte, à la forme de la fiche (« A 2026 00247 ») ; '' sinon. @param {string} t */
  function referenceDansTexteAT(t) {
    const m = RE_REFERENCE_AT.exec(String(t || ''));
    return m ? `${m[1]} ${m[2]} ${m[3]}` : '';
  }

  /** Pure : une ligne d'un écran de suivi est-elle encore en attente ? Les mots d'une affaire finie (reçue, décidée, signée, prête) la sortent.
   * @param {EcranSuiviAT} ecran @param {string} situation */
  function ligneSuiviEnAttenteAT(ecran, situation) {
    const t = plat(situation);
    if (ecran === 'actesASigner') return true;
    // MICEN : « Dépôt OK », « Dépôt participant OK », « Acte authentique » sont finis (captures du wiki, 28/10).
    if (ecran === 'micen') return !/depot (participant )?ok|acte authentique|pret|depose|archiv|termin|conserv/.test(t);
    if (ecran === 'safer') return !/non[- ]?preemption|preemption exercee|renonc|decision|repon|retour|refus|clotur|annul|abandon|retrait/.test(t);
    // CJN : une réponse rendue (absence de condamnation, condamnation, clôturée, purgée, expirée) sort de l'attente ; un rejet y reste.
    if (ecran === 'cjn') return /rejet|bloqu/.test(t) || !/absence de condamnation|condamnation|clotur|purg|expir/.test(t);
    // Une réponse NÉGATIVE n'est pas une affaire finie : rien n'a été délivré, la demande est à reprendre (audit 0.382.0).
    return /negati/.test(t) || !/positi|repon|re[çc]u|delivr|termin|archiv/.test(t);
  }

  /** Pure : le tableau d'un écran de suivi relevé → ses lignes (référence du dossier, libellé, dates, situation). Les écrans de suivi rangent
   * leurs lignes en GROUPES par statut, un tableau par groupe (captures du wiki, 28/10 : « En préparation (3) », « Envoyé », « Réponse
   * positive »…) : chaque tableau qui a des lignes compte, et sans colonne d'état, la situation d'une ligne est le titre de son groupe (nombre
   * retiré). 300 lignes au plus. @param {EcranSuiviAT} ecran @param {any} capture @param {string} luLe @returns {SuiviAT} */
  function suiviDepuisCaptureAT(ecran, capture, luLe) {
    // Un tableau de mise en page (une seule colonne) n'est pas un groupe de résultats.
    const candidats = ((capture && capture.tableaux) || []).filter((/** @type {any} */ t) => Array.isArray(t && t.lignes) && t.lignes.length
      && ((t.entete || []).length >= 2 || t.lignes.some((/** @type {any} */ l) => Array.isArray(l) && l.filter((/** @type {any} */ x) => net(x)).length >= 2)));
    // Un GROUPE a un titre « Statut (N) » ; sans groupes, le plus grand tableau seul (un panneau de filtres en tableau ne compte pas).
    const RE_GROUPE = /\(\s*\d+\s*\)\s*$/;
    const groupes = candidats.filter((/** @type {any} */ t) => RE_GROUPE.test(net(t.titre)));
    const tableaux = groupes.length ? groupes : candidats.sort((/** @type {any} */ a, /** @type {any} */ b) => b.lignes.length - a.lignes.length).slice(0, 1);
    /** @type {LigneSuiviAT[]} */
    const lignes = [];
    let total = 0;
    tableaux.forEach((/** @type {any} */ t) => {
    total += t.lignes.length;
    // Les colonnes par leur en-tête (« Libellé », « Dossier/Acte »… ; « Situation », « État »…) ; sans en-tête reconnu, le premier texte
    // est le libellé et le dernier la situation.
    const entete = ((t && t.entete) || []).map(plat);
    const colLibelle = entete.findIndex((/** @type {string} */ e) => /libelle|intitule|objet|dossier ?\/ ?acte|^acte|demande|formalite/.test(e));
    // L'en-tête qui EST l'état (« Situation », « État ») ; « Type d'état civil » ne l'est pas (audit 0.382.0).
    const colSituation = entete.findIndex((/** @type {string} */ e) => /^(situation|etat|statut)( |$)/.test(e));
    // Le titre du groupe (« Réponse positive (12) ») : la situation des lignes d'un tableau sans colonne d'état.
    const groupe = RE_GROUPE.test(net(t.titre)) ? net(String(t.titre || '').replace(RE_GROUPE, '')) : '';
    ((t && t.lignes) || []).forEach((/** @type {any} */ l) => {
      if (lignes.length >= 300) return;
      const brutes = (Array.isArray(l) ? l : []).map(net);
      const cellules = brutes.filter(Boolean);
      // Ligne vide, ou ligne « Aucun enregistrement trouvé » d'un tableau vide (audit 0.382.0 : comptée « 1 en attente »).
      if (!cellules.length || (cellules.length === 1 && /aucun (enregistrement|resultat|element)|no records/.test(plat(cellules[0])))) return;
      const dates = [...new Set(cellules.flatMap((x) => (x.match(RE_DATE_FR_PARTOUT) || []).map(isoDepuisFrAT)).filter(Boolean))];
      const reference = referenceDansTexteAT(cellules.join(' '));
      // La référence retirée d'une cellule qui porte aussi le libellé (« A 2026 00500 VTE … »), jamais la cellule entière.
      const textes = cellules.map((x) => net(x.replace(RE_REFERENCE_AT, ' '))).filter((x) => x && !RE_DATE_FR.test(x) && !/^⟦icône⟧/.test(x) && !/^\d+$/.test(x));
      if (!textes.length && !reference) return;
      const libelle = (colLibelle >= 0 && net(String(brutes[colLibelle] || '').replace(RE_REFERENCE_AT, ' '))) || textes[0] || '';
      const situation = (colSituation >= 0 ? brutes[colSituation] : (groupe || textes.filter((x) => x !== libelle).slice(-1)[0])) || '';
      lignes.push({ reference, libelle: libelle.slice(0, 200), dates, situation: situation.slice(0, 80), enAttente: ligneSuiviEnAttenteAT(ecran, situation) });
    });
    });
    // Un tableau paginé (« (1 of 5) », « Page 1 sur 5 », « Résultats 1 à 10 sur 12 », « Demandes 1 à 15 sur 59 ») : seule la page affichée
    // est lue — dit, jamais tu (audit 0.382.0 ; formes réelles des captures du wiki, 28/10).
    const texte = String((capture && capture.texte) || '');
    const plage = [...texte.matchAll(/\b1\s+[àa]\s+(\d+)\s+sur\s+(\d+)/gi)].some((m) => Number(m[2]) > Number(m[1]));
    const pagine = plage || /\(\s*1\s+(of|sur|de)\s+([2-9]|\d{2,})\s*\)|page\s+1\s+(sur|of|de)\s+([2-9]|\d{2,})/i.test(texte);
    return { luLe: net(luLe), lignes, tronque: total > 300 || pagine };
  }

  /** Pure : les compteurs du tableau de bord d'après les suivis lus : par écran, les lignes en attente (toutes pour les actes à signer), et
   * celles qui sont des dossiers de CLAIRE. @param {Record<string, SuiviAT>} suivis @param {string[]} references (références des fiches) */
  function compteursSuivisAT(suivis, references) {
    const connues = new Set((references || []).map((r) => referenceDansTexteAT(r)).filter(Boolean));
    /** @type {Record<string, { titre: string, total: number, enAttente: number, dansClaire: number, luLe: string } | null>} */
    const out = {};
    ECRANS_SUIVIS_AT.forEach((e) => {
      const s = suivis && suivis[e.cle];
      if (!s || !Array.isArray(s.lignes)) { out[e.cle] = null; return; }
      const attente = s.lignes.filter((l) => l.enAttente);
      out[e.cle] = { titre: e.titre, total: s.lignes.length, enAttente: attente.length, dansClaire: attente.filter((l) => connues.has(l.reference)).length, luLe: s.luLe || '' };
    });
    return out;
  }

  /** Pure : les lignes des suivis qui portent la référence d'un dossier. @param {Record<string, SuiviAT>} suivis @param {string} reference */
  function suivisDuDossierAT(suivis, reference) {
    const ref = referenceDansTexteAT(reference);
    if (!ref) return [];
    return ECRANS_SUIVIS_AT.flatMap((e) => ((suivis && suivis[e.cle] && suivis[e.cle].lignes) || [])
      .filter((l) => l.reference === ref).map((l) => Object.assign({ ecran: e.cle, titre: e.titre }, l)));
  }

  // ---- Comptabilité d'un dossier (étude 28/10 : « l'onglet s'appelle Comptabilité, commence par la succession : infos comptables (MONTANT) ») ----
  // Structure reçue le 28/10 (succession et vente) : « Solde du compte : [montant] », « Solde de l'affaire : [montant] », « Taxe … - Montant
  // [montant] », tableau « Dernières opérations de l'affaire » (Date, N° écriture, Libellé, Débit, Crédit, Solde, nombres à point décimal).

  /** Pure : un montant écrit par Authentic (« 1 234,56 € », « 1234.56 », « -999.9 ») → nombre, null s'il n'y en a pas. @param {any} t */
  function montantAT(t) {
    const brut = String(t == null ? '' : t);
    // Une date n'est jamais un montant (« Solde : » suivi d'une date, audit 0.389.0).
    if (RE_DATE_FR.test(net(brut))) return null;
    const m = /[-\u2212]?\s?\d[\d\s\u00a0\u202f.,]*/.exec(brut);
    if (!m) return null;
    let x = m[0].replace(/[\s\u00a0\u202f]/g, '');
    const neg = /^[-\u2212]/.test(x);
    x = x.replace(/^[-\u2212]/, '');
    const dernier = Math.max(x.lastIndexOf(','), x.lastIndexOf('.'));
    // Le dernier séparateur suivi d'un ou deux chiffres est la virgule ; les autres séparent les milliers.
    if (dernier >= 0 && x.length - dernier - 1 <= 2) x = x.slice(0, dernier).replace(/[.,]/g, '') + '.' + x.slice(dernier + 1);
    else x = x.replace(/[.,]/g, '');
    const n = Number(x);
    return Number.isFinite(n) ? Math.round((neg ? -n : n) * 100) / 100 : null;
  }

  /**
   * Pure : les infos comptables d'une capture de l'onglet « Comptabilité » : soldes du compte et de l'affaire, taxes, dernières opérations
   * (100 au plus) et leurs totaux. @param {any} capture @param {string} luLe
   */
  function comptabiliteDepuisCaptureAT(capture, luLe) {
    const lignesTexte = String((capture && capture.texte) || '').split('\n').map(net).filter(Boolean);
    /** @param {RegExp} re */
    const apres = (re) => {
      const i = lignesTexte.findIndex((l) => re.test(plat(l)));
      if (i < 0) return null;
      const surLaLigne = montantAT(lignesTexte[i].replace(/^[^:]*:/, ''));
      return /:\s*\S/.test(lignesTexte[i]) && surLaLigne != null ? surLaLigne : montantAT(lignesTexte[i + 1]);
    };
    const taxes = lignesTexte.filter((l) => /^taxe\b.*montant/.test(plat(l))).map((l) => ({ libelle: net(l.replace(/-?\s*montant.*$/i, '')).slice(0, 80), montant: montantAT(l.replace(/^.*montant/i, '')) }))
      .filter((x) => x.montant != null).slice(0, 10);
    const tableaux = ((capture && capture.tableaux) || []).filter((/** @type {any} */ t) => Array.isArray(t && t.lignes));
    // Un tableau défilant de PrimeFaces : en-tête et corps sont deux tables (audit 0.389.0) — le corps qui a des lignes, l'en-tête de la
    // table qui le précède s'il n'en a pas.
    const estCandidat = (/** @type {any} */ x) => /operation/.test(plat(x.titre || '')) || ((x.entete || []).map(plat).some((/** @type {string} */ e) => /^debit$/.test(e)));
    const iEntete = tableaux.findIndex(estCandidat);
    const iCorps = iEntete < 0 ? -1 : tableaux.findIndex((/** @type {any} */ x, /** @type {number} */ i) => i >= iEntete && x.lignes.length > 0 && (i === iEntete || estCandidat(x) || !(x.entete || []).length));
    const t = iCorps >= 0 ? tableaux[iCorps] : null;
    const enteteBrut = t && (t.entete || []).length ? t.entete : (iEntete >= 0 ? tableaux[iEntete].entete || [] : []);
    const entete = enteteBrut.map(plat);
    const col = (/** @type {RegExp} */ re, /** @type {number} */ defaut) => { const i = entete.findIndex((/** @type {string} */ e) => re.test(e)); return i >= 0 ? i : defaut; };
    const c = { date: col(/^date/, 0), numero: col(/ecriture|^n/, 1), libelle: col(/libelle/, 2), debit: col(/^debit/, 3), credit: col(/^credit/, 4), solde: col(/^solde/, 5) };
    /** @type {Array<{ date: string, numero: string, libelle: string, debit: number | null, credit: number | null, solde: number | null }>} */
    const operations = [];
    ((t && t.lignes) || []).forEach((/** @type {any} */ l) => {
      if (operations.length >= 100 || !Array.isArray(l)) return;
      const cel = l.map(net);
      const date = isoDepuisFrAT(cel[c.date] || '');
      if (!date) return;
      operations.push({ date, numero: String(cel[c.numero] || '').slice(0, 20), libelle: String(cel[c.libelle] || '').slice(0, 160),
        debit: montantAT(cel[c.debit]), credit: montantAT(cel[c.credit]), solde: montantAT(cel[c.solde]) });
    });
    const somme = (/** @type {'debit' | 'credit'} */ k) => Math.round(operations.reduce((s, o) => s + (o[k] || 0), 0) * 100) / 100;
    // Les totaux ne portent que sur les opérations LISTÉES (les dernières), jamais tout le compte (audit 0.389.0).
    return {
      luLe: net(luLe), soldeCompte: apres(/^solde du compte/), soldeAffaire: apres(/^solde de l.affaire/), taxes, operations,
      nombreComptes: lignesTexte.filter((l) => /^solde du compte/.test(plat(l))).length,
      totalDebitListe: somme('debit'), totalCreditListe: somme('credit'), tronque: !!(t && t.lignes.length > 100)
    };
  }

  exporter({ montantAT, comptabiliteDepuisCaptureAT, BADGES_AT, STATUTS_SOUS_DOSSIER_AT, isoDepuisFrAT, apercuFormaliteAT, rangerApercuAT, lignesActivesAT, indexIntituleAT, badgeLigneAT, sectionLigneAT, lignesFormalitesAT, statutSousDossierAT, panneauGaucheAT,
    natureDossierAT, enTeteDossierAT, intituleSousDossierAT, instantaneDepuisPagesAT, versFicheAT,
    ECRANS_SUIVIS_AT, referenceDansTexteAT, ligneSuiviEnAttenteAT, suiviDepuisCaptureAT, compteursSuivisAT, suivisDuDossierAT });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
