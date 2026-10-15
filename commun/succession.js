// @ts-check
'use strict';
// Successions (étude 15/10 : « la même présentation que les fiches de vente, sauf que le déroulé n'est pas le même au niveau des
// échéances ; les actes ne sont pas les mêmes ») — types, actes, étapes et pièces d'une succession. Code COMMUN au poste et au
// serveur (planning, rappels, checklist), écrit une fois.
//
// Types (étude 15/10) : acte de notoriété seul ; notoriété + déclaration de succession (pas d'immobilier, actif de plus de
// 50 000 €) ; succession classique : notoriété + déclaration de succession + attestation immobilière. D'autres actes s'ajoutent
// parfois (délivrance de legs, convention de quasi-usufruit…) : ils sont relevés dans le dossier Authentic.
// Déroulé (étude 15/10) : rendez-vous d'ouverture avec Sophie → acte de notoriété dans le mois (actes de naissance reçus, FCDDV
// interrogé, donation entre époux et testament vérifiés) → à 2 mois, contrôle des droits et de l'inventaire → après la notoriété,
// déblocage des fonds auprès des banques puis réception (avec un conjoint survivant : transfert des comptes à son profit) →
// attestation immobilière et déclaration de succession au plus tard 6 mois. Délais de 1, 2 et 6 mois comptés depuis le rendez-vous
// d'ouverture (choix de l'étude du 15/10).
/** @param {typeof import('./dates') & typeof import('./dossier')} C */
(function (C) {
  /** @typedef {{ cle: string, libelle: string, actes: string[] }} TypeSuccession */
  /** @type {TypeSuccession[]} */
  var TYPES_SUCCESSION = [
    { cle: 'notoriete', libelle: 'Acte de notoriété seul', actes: ['notoriete'] },
    { cle: 'notoriete-ds', libelle: 'Notoriété et déclaration de succession', actes: ['notoriete', 'declaration'] },
    { cle: 'classique', libelle: 'Notoriété, déclaration de succession et attestation immobilière', actes: ['notoriete', 'declaration', 'attestation'] }
  ];
  var ACTES_SUCCESSION = { notoriete: 'Acte de notoriété', declaration: 'Déclaration de succession', attestation: 'Attestation immobilière' };
  var MOIS_NOTORIETE = 1;
  var MOIS_CONTROLE_DROITS = 2;
  var MOIS_DECLARATION_SUCCESSION = 6;
  // Au-delà de cet actif, sans immobilier, une déclaration de succession est due (étude 15/10).
  var SEUIL_ACTIF_DECLARATION = 50000;

  // Pièces d'une succession (étude 15/10 : « acte de décès, livret de famille, estimation des biens immobiliers, estimation des
  // véhicules, carte grise ; actes de naissance et de mariage, EHF, titre de propriété, FCDDV »), reconnues par le NOM du fichier
  // sur le NAS comme celles d'une vente. `immobilier` : seulement quand la succession comprend un bien immobilier.
  /** @type {Array<{ cle: string, label: string, motifNom: RegExp, immobilier?: boolean }>} */
  var PIECES_SUCCESSION = [
    { cle: 'acteDeces', label: 'Acte de décès', motifNom: /d[ée]\s?c[èe]s/i },
    { cle: 'livretFamille', label: 'Livret de famille', motifNom: /livret\s*(?:de\s*)?famille/i },
    { cle: 'actesNaissance', label: 'Actes de naissance', motifNom: /naissance/i },
    { cle: 'acteMariage', label: 'Acte de mariage', motifNom: /(?:acte|extrait|copie)s?\s*(?:int[ée]grale\s*)?(?:de\s*|d.)?mariage/i },
    { cle: 'fcddv', label: 'Interrogation du FCDDV (fichier central des dernières volontés)', motifNom: /fcddv|derni[èe]res?\s*volont|fichier\s*central/i },
    { cle: 'titrePropriete', label: 'Titre de propriété', motifNom: /titre\s*(?:de\s*)?propri/i, immobilier: true },
    { cle: 'ehf', label: 'État hypothécaire hors formalité (EHF)', motifNom: /(?:^|[^a-z])ehf(?![a-z])|hors\s*formalit|[ée]tat\s*hypoth/i, immobilier: true },
    { cle: 'estimationImmobilier', label: 'Estimation des biens immobiliers', motifNom: /^(?!.*(?:v[ée]hicule|voiture|automobile|argus|moto)).*(?:estimation|avis\s*de\s*valeur|[ée]valuation)/i, immobilier: true },
    { cle: 'estimationVehicules', label: 'Estimation des véhicules', motifNom: /(?:estimation|argus|cote|[ée]valuation).{0,40}(?:v[ée]hicule|voiture|automobile|moto)|(?:v[ée]hicule|voiture|automobile|moto).{0,40}(?:estimation|argus|cote|[ée]valuation)/i },
    { cle: 'carteGrise', label: 'Carte grise des véhicules', motifNom: /carte\s*grise|certificat\s*d.?\s*immatriculation/i }
  ];
  // Pièces sans lesquelles l'acte de notoriété ne se rédige pas (étude 15/10 : « reçu tous les actes de naissance et vérifier s'il
  // n'y a pas des donations entre époux, des testaments » — le FCDDV).
  var PIECES_NOTORIETE = ['acteDeces', 'actesNaissance', 'fcddv'];

  /** @param {any} d */
  function infoSuccession(d) { return (d && d.succession && typeof d.succession === 'object') ? d.succession : {}; }

  /** Pure : la succession comprend-elle un bien immobilier (biens relevés dans Authentic, immeubles, cadastre de la fiche) ? @param {any} d */
  function successionAvecImmobilier(d) {
    if (!d) return false;
    const s = infoSuccession(d);
    if (s.immobilier === true || s.immobilier === false) return s.immobilier;
    if (Array.isArray(d.biens) && d.biens.some(b => b && (b.adresse || b.parcelles))) return true;
    if (d.authentic && Array.isArray(d.authentic.immeubles) && d.authentic.immeubles.length) return true;
    const cad = d.bien && d.bien.cadastre;
    return !!(cad && ((Array.isArray(cad.parcelles) && cad.parcelles.length) || cad.section));
  }

  /** Pure : le type que CLAIRE propose — immobilier : classique ; sinon, actif de plus de 50 000 € : notoriété + déclaration ; sinon notoriété seule. @param {any} d */
  function typeSuccessionPropose(d) {
    if (successionAvecImmobilier(d)) return 'classique';
    return infoSuccession(d).actifSuperieurSeuil ? 'notoriete-ds' : 'notoriete';
  }

  /** Pure : le type retenu — celui choisi sur la fiche, sinon celui proposé. @param {any} d @returns {string} */
  function typeSuccession(d) {
    const choisi = infoSuccession(d).type;
    return TYPES_SUCCESSION.some(t => t.cle === choisi) ? choisi : typeSuccessionPropose(d);
  }

  /** @param {string} cle */
  function typeSuccessionDef(cle) { return TYPES_SUCCESSION.find(t => t.cle === cle) || TYPES_SUCCESSION[2]; }

  /** Pure : quel acte de base un intitulé d'Authentic désigne — 'notoriete', 'declaration', 'attestation' ou ''. @param {string} intitule */
  function acteBaseDepuisIntitule(intitule) {
    const t = String(intitule || '');
    if (/notori[ée]t[ée]/i.test(t)) return 'notoriete';
    if (/d[ée]claration\s+de\s+succession/i.test(t) || /(?:^|[^A-Za-z])DS(?![A-Za-z])/.test(t)) return 'declaration';
    if (/attestation\s+(?:immobili|notari|de\s+propri|apr[èe]s\s+d[ée]c[èe]s|de\s+transmission)/i.test(t)) return 'attestation';
    return '';
  }

  /** Pure : l'acte d'Authentic qui correspond à un acte de base ({ intitule, etat, signeLe }) ou null. @param {any} d @param {string} cle */
  function acteAuthenticSuccession(d, cle) {
    const actes = (d && d.authentic && Array.isArray(d.authentic.actesSuccession)) ? d.authentic.actesSuccession : [];
    return actes.find(a => a && acteBaseDepuisIntitule(a.intitule) === cle) || null;
  }

  /**
   * Pure : les actes de la succession — ceux du type (base), puis ceux qu'Authentic ajoute (délivrance de legs, quasi-usufruit…).
   * [{ cle, libelle, base, etat: 'a_rediger'|'redaction'|'signe'|'', signeLe }]
   * @param {any} d
   */
  function actesSuccession(d) {
    const type = typeSuccessionDef(typeSuccession(d));
    const base = type.actes.map(cle => {
      const a = acteAuthenticSuccession(d, cle);
      return { cle, libelle: ACTES_SUCCESSION[cle], base: true, etat: a ? a.etat || '' : '', signeLe: a ? a.signeLe || '' : '' };
    });
    const actes = (d && d.authentic && Array.isArray(d.authentic.actesSuccession)) ? d.authentic.actesSuccession : [];
    const autres = actes.filter(a => a && a.intitule && !acteBaseDepuisIntitule(a.intitule))
      .map((a, i) => ({ cle: 'authentic-' + i, libelle: String(a.intitule), base: false, etat: a.etat || '', signeLe: a.signeLe || '' }));
    return base.concat(autres);
  }

  /** Pure : la date du rendez-vous d'ouverture (AAAA-MM-JJ) ou ''. @param {any} d */
  function ouvertureSuccession(d) {
    const v = String(infoSuccession(d).ouvertureLe || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
  }

  /** Pure : conjoint survivant ? — la case de la fiche, sinon déduit du défunt (« Époux / Épouse de » = marié au décès). @param {any} d */
  function conjointSurvivant(d) {
    const s = infoSuccession(d);
    if (s.conjointSurvivant === true || s.conjointSurvivant === false) return s.conjointSurvivant;
    const lien = String((d && d.defunt && d.defunt.conjointLien) || '');
    return /^[ée]pou(?:x|se)\b/i.test(lien);
  }

  /** @param {any} d @param {string} type */
  function cocheeSuccession(d, type) {
    const v = d && d.echeancesValidees && d.echeancesValidees[type];
    return v === true;
  }

  /** Pure : un acte de base signé (coché sur la fiche, ou « Signé » dans Authentic) — { fait, iso }. @param {any} d @param {string} acte */
  function acteSigneSuccession(d, acte) {
    const type = acte === 'notoriete' ? 'notoriete' : 'declarationSuccession';
    const a = acteAuthenticSuccession(d, acte);
    const signeAuthentic = !!(a && a.etat === 'signe');
    const s = infoSuccession(d);
    const dateSaisie = acte === 'notoriete' ? s.notorieteSigneeLe : s.declarationSigneeLe;
    return { fait: cocheeSuccession(d, type) || signeAuthentic, iso: String(dateSaisie || (a && a.signeLe) || '').slice(0, 10) };
  }

  /**
   * Pure : les étapes d'une succession, dans l'ordre du déroulé — chacune { type, label, iso, fait, attente, active }.
   *   `iso` : la date de l'échéance (ou de sa réalisation une fois faite) ; '' quand rien ne la date encore.
   *   `attente` : faite par un tiers (la banque) ; `active` : l'étape peut se faire maintenant (les précédentes nécessaires sont faites).
   * @param {any} d @param {string} [aujourdhuiIso]
   */
  function etapesSuccession(d, aujourdhuiIso) {
    if (!d || !C.estSuccession(d)) return [];
    const ouverture = ouvertureSuccession(d);
    // Sans date du jour fournie (echeanceValidee), celle de l'horloge : un rendez-vous d'ouverture passé est fait.
    const auj = String(aujourdhuiIso || new Date().toISOString()).slice(0, 10);
    const plus = (mois) => (ouverture ? (C.ajouterMois(ouverture, mois) || '') : '');
    const type = typeSuccessionDef(typeSuccession(d));
    /** @type {any[]} */
    const etapes = [];
    const ouvertureFaite = cocheeSuccession(d, 'ouvertureSuccession') || !!(ouverture && auj && ouverture <= auj);
    etapes.push({ type: 'ouvertureSuccession', label: 'Rendez-vous d’ouverture avec Sophie', iso: ouverture, fait: ouvertureFaite, attente: false, active: true });
    const noto = acteSigneSuccession(d, 'notoriete');
    // Rendez-vous de signature placé (agenda) : la date de l'acte à venir.
    const rdv = String(d.rendezVousSignature || '').slice(0, 10);
    etapes.push({ type: 'notoriete', label: 'Signature de l’acte de notoriété', iso: noto.fait ? noto.iso : (rdv || plus(MOIS_NOTORIETE)), fait: noto.fait, attente: false, active: true });
    etapes.push({ type: 'controleDroits', label: 'Contrôle des droits et de l’inventaire', iso: plus(MOIS_CONTROLE_DROITS), fait: cocheeSuccession(d, 'controleDroits'), attente: false, active: true });
    const apresNoto = noto.fait ? (noto.iso || '') : '';
    if (conjointSurvivant(d)) {
      etapes.push({ type: 'transfertComptes', label: 'Transfert des comptes au profit du conjoint survivant', iso: apresNoto, fait: cocheeSuccession(d, 'transfertComptes'), attente: false, active: noto.fait });
    } else {
      const debloque = cocheeSuccession(d, 'deblocageFonds');
      etapes.push({ type: 'deblocageFonds', label: 'Déblocage des fonds auprès des banques', iso: apresNoto, fait: debloque, attente: false, active: noto.fait });
      etapes.push({ type: 'receptionFonds', label: 'Réception des fonds', iso: '', fait: cocheeSuccession(d, 'receptionFonds'), attente: true, active: noto.fait && debloque });
    }
    if (type.actes.includes('declaration')) {
      const ds = acteSigneSuccession(d, 'declaration');
      const label = type.actes.includes('attestation') ? 'Signature de l’attestation immobilière et de la déclaration de succession' : 'Signature de la déclaration de succession';
      const placee = rdv && noto.fait && (!noto.iso || rdv > noto.iso) ? rdv : '';
      etapes.push({ type: 'declarationSuccession', label, iso: ds.fait ? ds.iso : (placee || plus(MOIS_DECLARATION_SUCCESSION)), fait: ds.fait, attente: false, active: true });
    }
    // Actes ajoutés dans Authentic (délivrance de legs, quasi-usufruit…) : suivis par leur état, sans date propre.
    actesSuccession(d).filter(a => !a.base).forEach(a => {
      etapes.push({ type: 'acte:' + a.cle, label: a.libelle, iso: a.signeLe || '', fait: a.etat === 'signe', attente: false, active: true, authentic: true });
    });
    return etapes;
  }

  /** Pure : une étape de succession validée (coche ou Authentic) — pour echeanceValidee. @param {any} d @param {string} type */
  function etapeSuccessionValidee(d, type) {
    const e = etapesSuccession(d).find(x => x.type === type);
    if (e) return e.fait;
    return cocheeSuccession(d, type);
  }

  var TYPES_ETAPES_SUCCESSION = ['ouvertureSuccession', 'notoriete', 'controleDroits', 'transfertComptes', 'deblocageFonds', 'receptionFonds', 'declarationSuccession'];

  /**
   * Pure : ce qui retient l'acte de notoriété — pièces non reçues (acte de décès, actes de naissance, FCDDV) et questions non
   * tranchées (donation entre époux, testament). [libellé…]
   * @param {any} d
   */
  function attentesNotoriete(d) {
    const s = infoSuccession(d);
    const pieces = (d && d.pieces) || {};
    const retirees = new Set((d && d.piecesRetirees) || []);
    const manque = PIECES_SUCCESSION.filter(p => PIECES_NOTORIETE.includes(p.cle) && !retirees.has(p.cle) && pieces[p.cle] !== 'recue').map(p => p.label);
    if (!['oui', 'non'].includes(s.donationEpoux)) manque.push('Donation entre époux à vérifier');
    if (!['oui', 'non'].includes(s.testament)) manque.push('Testament à vérifier');
    return manque;
  }

  /** Pure : la checklist standard d'une succession (moins les pièces retirées ; l'immobilier seulement s'il y en a). @param {any} d */
  function piecesSuccessionDossier(d) {
    const retirees = new Set((d && d.piecesRetirees) || []);
    const immobilier = typeSuccessionDef(typeSuccession(d)).actes.includes('attestation') || successionAvecImmobilier(d);
    return PIECES_SUCCESSION.filter(p => !retirees.has(p.cle) && (!p.immobilier || immobilier))
      .map(p => ({ cle: p.cle, label: p.label, motifNom: p.motifNom }));
  }

  const exportes = { TYPES_SUCCESSION, ACTES_SUCCESSION, MOIS_NOTORIETE, MOIS_CONTROLE_DROITS, MOIS_DECLARATION_SUCCESSION, SEUIL_ACTIF_DECLARATION, PIECES_SUCCESSION, PIECES_NOTORIETE, TYPES_ETAPES_SUCCESSION, infoSuccession, successionAvecImmobilier, typeSuccessionPropose, typeSuccession, typeSuccessionDef, acteBaseDepuisIntitule, acteAuthenticSuccession, actesSuccession, ouvertureSuccession, conjointSurvivant, acteSigneSuccession, etapesSuccession, etapeSuccessionValidee, attentesNotoriete, piecesSuccessionDossier };
  if (typeof module !== 'undefined' && module.exports) module.exports = exportes; else Object.assign(globalThis, exportes);
})(
  typeof module !== 'undefined' && module.exports ? Object.assign({}, require('./dates'), require('./dossier')) : /** @type {any} */ (globalThis)
);
