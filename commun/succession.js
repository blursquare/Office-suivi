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
// attestation immobilière et déclaration de succession au plus tard 6 mois. Délais de 1 et 2 mois comptés depuis le rendez-vous
// d'ouverture (choix de l'étude du 15/10) ; le délai de 6 mois pour régler la succession court depuis la DATE DU DÉCÈS (étude 16/10),
// depuis l'ouverture seulement tant que la date du décès n'est pas connue.
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
  // Acte de notoriété : date BUTOIR à 1 mois de l'ouverture, confirmée ensuite par le rendez-vous placé dans l'agenda (étude 15/10).
  var MOIS_NOTORIETE = 1;
  // Notoriété + déclaration de succession (sans immobilier) : les deux actes signés ENSEMBLE, entre 4 et 6 mois (étude 15/10).
  var MOIS_NOTORIETE_DS_DEBUT = 4;
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
    // « ACT Déclaration Succ NOM » et « ACT Attestation Succ NOM T@ » (intitulés d'Authentic, 22/10) : « Succ » abrège « succession ».
    if (/d[ée]claration\s+(?:de\s+)?succ/i.test(t) || /(?:^|[^A-Za-z])DS(?![A-Za-z])/.test(t)) return 'declaration';
    if (/attestation\s+(?:immobili|notari|de\s+propri|apr[èe]s\s+d[ée]c[èe]s|de\s+transmission|succ)/i.test(t) || /(?:^|[^A-Za-z])(?:API|PAI)(?![A-Za-z])/.test(t)) return 'attestation';
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

  /**
   * Pure : la date du décès (AAAA-MM-JJ) ou '' — saisie sur la fiche (`d.defunt.decesDate`), sinon la fiche client d'Authentic portant
   * une date de décès : la seule, ou celle du comparant « Défunt » quand plusieurs en portent une. Jamais devinée.
   * @param {any} d
   */
  function decesSuccession(d) {
    const iso = (/** @type {any} */ v) => { const t = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ''; };
    const saisie = iso(d && d.defunt && d.defunt.decesDate);
    if (saisie) return saisie;
    const a = (d && d.authentic) || {};
    const fiches = Object.values(a.fichesClients || {}).filter((/** @type {any} */ f) => f && f.deces && iso(f.deces.date));
    if (fiches.length === 1) return iso(/** @type {any} */ (fiches[0]).deces.date);
    const comp = (Array.isArray(a.comparants) ? a.comparants : []).find((/** @type {any} */ c) => c && c.role === 'DEFUNT');
    if (!comp || !fiches.length) return '';
    const mots = (/** @type {any} */ t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((m) => m.length >= 2);
    const mc = mots(comp.nom);
    const trouvees = fiches.filter((/** @type {any} */ f) => { const mf = mots(f.nom); return mc.length >= 2 && mc.every((m) => mf.includes(m)); });
    return trouvees.length === 1 ? iso(/** @type {any} */ (trouvees[0]).deces.date) : '';
  }

  /** Pure : la date du rendez-vous d'ouverture (AAAA-MM-JJ) ou ''. @param {any} d */
  function ouvertureSuccession(d) {
    const v = String(infoSuccession(d).ouvertureLe || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
  }

  // ---- Rendez-vous d'une succession (étude 16/10 : « pour une succession il peut y avoir plusieurs rendez-vous par dossier ») ----
  // Gardés en liste sur la fiche (`d.succession.rendezVous` : { id, etape, titre, date, heure, itemId, changeKey }) au lieu de la seule
  // date de signature d'une vente, qui s'écrasait. `etape` : ouvertureSuccession, notoriete, declarationSuccession, acte (un acte sans étape
  // dite), autre (rendez-vous avec les héritiers, inventaire…).
  var ETAPES_RDV_SUCCESSION = ['ouvertureSuccession', 'notoriete', 'controleDroits', 'declarationSuccession', 'acte', 'autre'];

  /**
   * Pure : les rendez-vous d'une succession, triés par date et heure. Une fiche d'avant (date de signature seule) en rend un, « acte ».
   * @param {any} d
   * @returns {{ id: string, etape: string, titre: string, date: string, heure: string, itemId: string, changeKey: string, ancien?: boolean, etapeAuto?: boolean, annule?: boolean }[]}
   */
  function rendezVousSuccession(d) {
    const brut = Array.isArray(infoSuccession(d).rendezVous) ? infoSuccession(d).rendezVous : null;
    /** @type {any[]} */
    let liste;
    if (brut) {
      liste = brut.filter((/** @type {any} */ r) => r && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || '')))
        .map((/** @type {any} */ r) => {
          const x = { id: String(r.id || ''), etape: ETAPES_RDV_SUCCESSION.includes(r.etape) ? r.etape : 'autre', titre: String(r.titre || ''),
            date: String(r.date).slice(0, 10), heure: /^\d{2}:\d{2}$/.test(String(r.heure || '')) ? r.heure : '', itemId: String(r.itemId || ''), changeKey: String(r.changeKey || '') };
          // `etapeAuto` : étape lue dans le titre de l'agenda (relue quand le titre change) ; `annule` : catégorie « Annulé / à replacer ».
          if (r.etapeAuto === true) Object.assign(x, { etapeAuto: true });
          if (r.annule === true) Object.assign(x, { annule: true });
          return x;
        })
        // Un même rendez-vous d'Outlook n'est jamais deux fois sur la fiche (relecture 16/10 : fusion à trois voies).
        .filter((/** @type {any} */ r, /** @type {number} */ i, /** @type {any[]} */ t) => !r.itemId || t.findIndex((y) => y.itemId === r.itemId) === i);
    } else {
      const date = String((d && d.rendezVousSignature) || '').slice(0, 10);
      liste = /^\d{4}-\d{2}-\d{2}$/.test(date) ? [{ id: 'signature', etape: 'acte', titre: '', date, heure: String((d && d.rendezVousSignatureHeure) || ''),
        itemId: String((d && d.rdvAgendaItem && d.rdvAgendaItem.itemId) || ''), changeKey: String((d && d.rdvAgendaItem && d.rdvAgendaItem.changeKey) || ''), ancien: true }] : [];
    }
    return liste.sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
  }

  /** Pure : le rendez-vous qui compte dans une liste — le prochain à venir, sinon le dernier passé ; null si aucun. @param {any[]} liste @param {string} auj */
  function rendezVousRetenu(liste, auj) {
    if (!liste.length) return null;
    return liste.find((r) => r.date >= auj) || liste[liste.length - 1];
  }

  /**
   * Pure : le titre d'un rendez-vous dit « tout le même jour » — la notoriété (NOTO) avec l'attestation immobilière (API / PAI) et / ou la
   * déclaration de succession (DS), dans n'importe quel ordre : « SUCC - prénom NOM (NOTO API DS PARTAGE) », « (NOTO API) », « (NOTO DS) »
   * (étude 22/10 : « ou API »). Sans « ? ».
   * @param {string} titre
   */
  function titreToutEnsembleSuccession(titre) {
    const t = String(titre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (/\?/.test(t)) return false;
    return /(?<![A-Z])NOTO(?:RITE|RIETE)?(?![A-Z])/.test(t) && (/(?<![A-Z])(?:API|PAI|AI)(?![A-Z])|ATTESTATION/.test(t) || /(?<![A-Z])DS(?![A-Z])|DECLARATION/.test(t));
  }

  /**
   * Pure : l'étape d'un rendez-vous d'après son titre dans l'agenda (« SUCC - DUPONT - Acte de notoriété »…) ; un titre provisoire
   * (« ? » dans le titre ou le lieu) n'est jamais un acte (étude 07/10).
   * @param {string} titre @param {string} [lieu]
   */
  function etapeRendezVousSuccessionDepuisTitre(titre, lieu) {
    const t = String(titre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    // Un « ? » dans le titre ou dans le lieu (comme pour une vente) : provisoire.
    const provisoire = /\?/.test((t + ' ' + String(lieu || '')).replace(/\b(?:https?):\/\/\S+/gi, ' '));
    let etape = 'autre';
    // « Ouverture du testament / du coffre » n'est pas le rendez-vous d'ouverture de la succession (relecture 16/10).
    if (/OUVERTURE(?!\s+(?:DU|D'UN|DE\s+L'|DES?)\s+(?:TESTAMENT|COFFRE|COMPTE|PLI))/.test(t)) etape = 'ouvertureSuccession';
    // « NOTO prénom NOM », « NOTORIETE - … », « INVENTAIRE + NOTO … », « INVENTAIRE et NOTORIETE … » (étude 21/10) : la notoriété.
    // NOTORIETE n'importe où dans le titre (comme avant) ; NOTO, NOTORITE et INVENTAIRE seulement en tête (« Contrôle des droits et inventaire »
    // n'est pas un rendez-vous de signature).
    else if (titreToutEnsembleSuccession(t)) etape = 'declarationSuccession';
    else if (/NOTORIETE/.test(t) || /^\s*(?:INVENTAIRE\s*(?:\+|&|ET)\s*)?NOTO(?:RITE)?(?![A-Z])/.test(t)) etape = 'notoriete';
    // « INVENTAIRE … » seul : le rendez-vous du contrôle des droits et de l'inventaire, à 2 mois de l'ouverture (étude 21/10).
    else if (/^\s*INVENTAIRE(?![A-Z])/.test(t)) etape = 'controleDroits';
    else if (/DECLARATION/.test(t)) etape = 'declarationSuccession';
    // « SUCC - prénom NOM (API DS) » : l'attestation immobilière et la déclaration (sans la notoriété).
    else if (/^\s*SUCC/.test(t) && /(?<![A-Z])(?:API|PAI|DS)(?![A-Z])/.test(t)) etape = 'declarationSuccession';
    else if (/ATTESTATION|SIGNATURE|(?<![A-Z])ACTE(?![A-Z])/.test(t)) etape = 'acte';
    // « SUCC - prénom NOM », « SUCCESSION prénom NOM » seuls (rien après le nom) : attestation immobilière + déclaration de succession
    // (étude 21/10 : « c'est pour API + DS »).
    else if (/^\s*SUCC(?:ESSION)?(?![A-Z])\s*[-–:]?\s*(?:(?!\s[-–:]\s)[A-Z' .-])+$/.test(t)) etape = 'declarationSuccession';
    return provisoire && etape !== 'ouvertureSuccession' && etape !== 'autre' ? 'autre' : etape;
  }

  /** Pure : le rendez-vous qui fait la date de signature de la fiche — le prochain d'acte, sinon le dernier ; null. @param {any[]} liste @param {string} auj */
  function signatureSuccessionDepuisRendezVous(liste, auj) {
    return rendezVousRetenu((liste || []).filter((r) => r && !r.annule && (r.etape === 'notoriete' || r.etape === 'declarationSuccession' || r.etape === 'acte')), auj);
  }

  /**
   * Pure : l'étape d'un rendez-vous de l'agenda — une journée entière (note, date butoir) ou un rendez-vous jaune « Annulé / à replacer »
   * n'est jamais un acte (relecture 16/10, comme pour une vente).
   * @param {any} e
   */
  function etapeEvenementSuccession(e) {
    if (!e) return 'autre';
    const etape = etapeRendezVousSuccessionDepuisTitre(e.sujet, e.lieu);
    return (e.journeeEntiere || e.annule) && etape !== 'ouvertureSuccession' ? 'autre' : etape;
  }

  /**
   * Pure : la liste des rendez-vous d'une succession tenue à jour d'après l'agenda de l'office (étude 16/10 : « que l'agenda fonctionne comme
   * pour les ventes ») — `evenements` = les rendez-vous de l'agenda rattachés à CE dossier (titre « SUCC - … » ou identifiant connu).
   *   - un rendez-vous connu (même identifiant Outlook) : date, heure et titre suivent ; son étape reste ;
   *   - un rendez-vous nouveau : ajouté, étape lue dans son titre ;
   *   - un rendez-vous de la liste dont l'identifiant n'est plus dans l'agenda alors que sa date est dans la période lue [debut, fin] :
   *     retiré (supprimé ou déplacé hors de la période dans Outlook) ; un rendez-vous sans identifiant (saisi à la main) n'est jamais touché.
   * @param {any} d @param {any[]} evenements @param {string} debut @param {string} fin @param {Map<string, string>} [avantLecture]
   * @returns {{ liste: any[], ajoutes: any[], retires: any[], deplaces: any[], adoptes: any[] }}
   */
  function rendezVousSuccessionDepuisAgenda(d, evenements, debut, fin, avantLecture) {
    const avant = rendezVousSuccession(d).map((r) => { const c = Object.assign({}, r); delete c.ancien; return c; });
    const evts = (evenements || []).filter((e) => e && e.itemId && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date || '')) && !e.option);
    // Rendez-vous retirés de la fiche par la croix (relecture 16/10) : jamais relevés de nouveau.
    const ecartes = new Set(Array.isArray(infoSuccession(d).rendezVousEcartes) ? infoSuccession(d).rendezVousEcartes : []);
    // État de la fiche AVANT la lecture d'Exchange (relecture 16/10) : ce qu'un poste a changé pendant la lecture n'est pas défait par une
    // lecture plus ancienne que lui. Map itemId → empreinte ; absent = pas de protection (tests, appel direct).
    const proteger = avantLecture instanceof Map;
    const touchePendantLecture = (/** @type {any} */ r) => proteger && avantLecture.get(r.itemId) !== empreinteRendezVousSuccession(r);
    const ajoutes = [], retires = [], deplaces = [], adoptes = [];
    const liste = [];
    for (const r of avant) {
      const e = r.itemId ? evts.find((x) => x.itemId === r.itemId) : null;
      if (r.itemId && touchePendantLecture(r)) { liste.push(r); continue; }
      if (e) {
        const heure = e.journeeEntiere ? '' : String(e.heure || '');
        const titre = String(e.sujet || r.titre || '').slice(0, 200);
        if (e.date !== r.date || heure !== r.heure) deplaces.push({ avant: r.date, apres: e.date, titre: e.sujet || r.titre });
        const maj = Object.assign({}, r, { date: e.date, heure, titre, changeKey: e.changeKey || r.changeKey || '' });
        // Étape lue dans l'agenda : relue à chaque tour (« ? » retiré, titre renommé) ; une étape choisie sur le poste reste.
        if (r.etapeAuto) maj.etape = etapeEvenementSuccession(e);
        if (e.annule) maj.annule = true; else delete maj.annule;
        liste.push(maj);
      } else if (r.itemId && debut && fin && r.date >= debut && r.date <= fin) {
        retires.push(r);
      } else {
        liste.push(r);
      }
    }
    for (const e of evts) {
      if (liste.some((r) => r.itemId === e.itemId) || ecartes.has(e.itemId)) continue;
      // Retiré de la fiche par un poste pendant la lecture : pas remis.
      if (proteger && avantLecture.has(e.itemId)) continue;
      const heure = e.journeeEntiere ? '' : String(e.heure || '');
      // Fiche d'avant (date de signature seule, sans identifiant) : le rendez-vous du même jour est le sien, il l'adopte.
      const sansId = liste.find((r) => !r.itemId && r.date === e.date && (!r.heure || !heure || r.heure === heure));
      if (sansId) {
        Object.assign(sansId, { itemId: String(e.itemId), changeKey: String(e.changeKey || ''), heure: sansId.heure || heure, titre: sansId.titre || String(e.sujet || '').slice(0, 200) });
        adoptes.push(sansId);
        continue;
      }
      const r = { id: 'ag-' + String(e.itemId).slice(-12).replace(/[^A-Za-z0-9]/g, ''), etape: etapeEvenementSuccession(e), etapeAuto: true, titre: String(e.sujet || '').slice(0, 200),
        date: e.date, heure, itemId: String(e.itemId), changeKey: String(e.changeKey || '') };
      if (e.annule) Object.assign(r, { annule: true });
      ajoutes.push(r);
      liste.push(r);
    }
    liste.sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
    return { liste, ajoutes, retires, deplaces, adoptes };
  }

  /** Pure : l'empreinte d'un rendez-vous de la fiche (date, heure, étape) — pour savoir si un poste l'a changé pendant une lecture. @param {any} r */
  function empreinteRendezVousSuccession(r) {
    return r ? [r.date, r.heure || '', r.etape, r.itemId].join('|') : '';
  }

  /** Pure : Map itemId → empreinte des rendez-vous d'une fiche (avant une lecture de l'agenda). @param {any} d */
  function instantaneRendezVousSuccession(d) {
    return new Map(rendezVousSuccession(d).filter((r) => r.itemId).map((r) => [r.itemId, empreinteRendezVousSuccession(r)]));
  }

  /** Pure : conjoint survivant ? — la case de la fiche, sinon déduit du défunt (« Époux / Épouse de » = marié au décès). @param {any} d */
  function conjointSurvivant(d) {
    const s = infoSuccession(d);
    if (s.conjointSurvivant === true || s.conjointSurvivant === false) return s.conjointSurvivant;
    const lien = String((d && d.defunt && d.defunt.conjointLien) || '');
    if (lien) return /^[ée]pou(?:x|se)\b/i.test(lien);
    // Comparants d'Authentic (étude 15/10) : un héritier « conjoint survivant », ou le défunt « époux/épouse de ».
    const comps = d && d.authentic && Array.isArray(d.authentic.comparants) ? d.authentic.comparants : [];
    if (comps.some((/** @type {any} */ c) => c && c.role === 'HERITIER' && /survivant/i.test(String(c.qualite || '')))) return true;
    // Une partie reprise du volet de la fiche du défunt (étude 21/10) : qualité « Conjoint survivant ».
    if ((d && Array.isArray(d.parties) ? d.parties : []).some((/** @type {any} */ p) => p && /survivant/i.test(String(p.qualite || '')))) return true;
    const defunt = comps.find((/** @type {any} */ c) => c && c.role === 'DEFUNT');
    if (defunt && /^[ée]pou(?:x|se)\b/i.test(String(defunt.lien || ''))) return true;
    // Un héritier « veuve / veuf de » (relecture 15/10), ou « époux / épouse de » le défunt (nom de famille du défunt dans le nom du conjoint).
    const motsDefunt = String((defunt && defunt.nom) || '').toLowerCase().split(/[^a-zà-ÿ]+/).filter((m) => m.length >= 3);
    return comps.some((/** @type {any} */ c) => {
      if (!c || c.role !== 'HERITIER') return false;
      const lien = String(c.lien || '');
      if (/^veu(?:ve|f)\b/i.test(lien)) return true;
      if (!/^[ée]pou(?:x|se)\b/i.test(lien) || !motsDefunt.length) return false;
      const conjoint = String(c.conjoint || '').toLowerCase();
      return motsDefunt.some((m) => conjoint.split(/[^a-zà-ÿ]+/).includes(m));
    });
  }

  /** @param {any} d @param {string} type */
  function cocheeSuccession(d, type) {
    const v = d && d.echeancesValidees && d.echeancesValidees[type];
    return v === true;
  }

  /**
   * Pure : le rendez-vous est passé — sa date est avant `auj`, ou c'est aujourd'hui et son HEURE est passée (étude 22/10 : « avec l'heure
   * aussi »). L'heure du jour n'est lue que quand `auj` est la date d'aujourd'hui à Paris ; une date du jour simulée compte comme passée.
   * @param {any} r @param {string} auj @param {Date} [maintenant] horloge injectable (tests)
   */
  function rendezVousPasse(r, auj, maintenant) {
    if (!r || !r.date) return false;
    if (r.date < auj) return true;
    if (r.date > auj) return false;
    const heure = /^\d{1,2}:\d{2}$/.test(String(r.heure || '')) ? String(r.heure).padStart(5, '0') : '';
    if (!heure) return true;
    let parisJour = '', parisHeure = '';
    try {
      const f = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const p = Object.fromEntries(f.formatToParts(maintenant || new Date()).map((x) => [x.type, x.value]));
      parisJour = `${p.year}-${p.month}-${p.day}`; parisHeure = `${p.hour}:${p.minute}`;
    } catch (e) { return true; }
    return auj !== parisJour || heure <= parisHeure;
  }

  /** Pure : un acte de base signé (coché sur la fiche, ou « Signé » dans Authentic) — { fait, iso }. @param {any} d @param {string} acte */
  function acteSigneSuccession(d, acte, aujourdhuiIso) {
    const type = acte === 'notoriete' ? 'notoriete' : 'declarationSuccession';
    // Un rendez-vous « NOTO API DS … » passé (étude 22/10) : tous les actes sont signés à sa date — la succession est close.
    const auj = String(aujourdhuiIso || new Date().toISOString()).slice(0, 10);
    const tout = rendezVousSuccession(d).filter((r) => r && !r.annule && r.etape !== 'autre' && titreToutEnsembleSuccession(r.titre) && rendezVousPasse(r, auj)).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    const a = acteAuthenticSuccession(d, acte);
    const signeAuthentic = !!(a && a.etat === 'signe');
    const s = infoSuccession(d);
    const dateSaisie = acte === 'notoriete' ? s.notorieteSigneeLe : s.declarationSigneeLe;
    const iso = String(dateSaisie || (a && a.signeLe) || '').slice(0, 10);
    if (tout && !(cocheeSuccession(d, type) || signeAuthentic)) return { fait: true, iso: tout.date };
    return { fait: cocheeSuccession(d, type) || signeAuthentic, iso };
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
    // 6 mois (et la fenêtre de 4 à 6 mois de la notoriété + déclaration) : depuis le décès (étude 16/10), sinon depuis l'ouverture.
    const deces = decesSuccession(d);
    const depuisDeces = (mois) => (deces ? (C.ajouterMois(deces, mois) || '') : plus(mois));
    const type = typeSuccessionDef(typeSuccession(d));
    /** @type {any[]} */
    const etapes = [];
    const ouvertureFaite = cocheeSuccession(d, 'ouvertureSuccession') || !!(ouverture && auj && ouverture <= auj);
    etapes.push({ type: 'ouvertureSuccession', label: 'Rendez-vous d’ouverture avec Sophie', iso: ouverture, fait: ouvertureFaite, attente: false, active: true });
    // Notoriété + déclaration de succession : un seul rendez-vous pour les deux actes, entre 4 et 6 mois (étude 15/10).
    const ensemble = type.cle === 'notoriete-ds';
    const notoSeule = acteSigneSuccession(d, 'notoriete', auj);
    // Notoriété + déclaration : deux étapes, deux rendez-vous possibles (étude 21/10 : « parfois ne sont pas signées le même jour »).
    const noto = { fait: notoSeule.fait, iso: notoSeule.iso };
    // Rendez-vous placés (agenda) : la date de l'acte à venir ; sans lui, la date butoir (`butoir`), à confirmer. Un rendez-vous « acte »
    // (sans étape dite) va à la notoriété tant qu'elle n'est pas signée, puis à la déclaration s'il vient après elle (relecture 15/10 : un
    // rendez-vous passé est celui de la notoriété elle-même).
    const rdvs = rendezVousSuccession(d).filter((r) => !r.annule);
    const apresNotoriete = (/** @type {any} */ r) => noto.fait && (noto.iso ? r.date > noto.iso : r.date > auj);
    // Un seul rendez-vous pour les deux actes (titre « SUCC - … ») sert aux deux étapes tant que la notoriété n'a pas le sien.
    const rdvNotoriete = noto.fait ? null : (rendezVousRetenu(rdvs.filter((r) => r.etape === 'notoriete' || r.etape === 'acte'), auj)
      || (ensemble ? rendezVousRetenu(rdvs.filter((r) => r.etape === 'declarationSuccession'), auj) : null)
      || rendezVousRetenu(rdvs.filter((r) => titreToutEnsembleSuccession(r.titre)), auj));
    // Notoriété + déclaration : un rendez-vous « acte » sans autre rendez-vous de déclaration sert aussi à la déclaration (relecture 21/10).
    const rdvDeclaration = rendezVousRetenu(rdvs.filter((r) => r.etape === 'declarationSuccession' || (r.etape === 'acte' && apresNotoriete(r))), auj) || (ensemble && !noto.fait ? rdvNotoriete : null);
    const rdv = rdvNotoriete ? rdvNotoriete.date : '';
    const butoirNoto = ensemble ? depuisDeces(MOIS_DECLARATION_SUCCESSION) : plus(MOIS_NOTORIETE);
    etapes.push({
      type: 'notoriete', label: 'Signature de l’acte de notoriété',
      iso: noto.fait ? noto.iso : (rdv || butoirNoto), fait: noto.fait, attente: false, active: true,
      butoir: !noto.fait && !rdv && !!butoirNoto, rdvPlace: !noto.fait && !!rdv, fenetreDebut: ensemble && !noto.fait && !rdv ? depuisDeces(MOIS_NOTORIETE_DS_DEBUT) : '', depuisDeces: ensemble && !!deces
    });
    // Un rendez-vous « INVENTAIRE … » placé donne sa date ; sans lui, 2 mois après l'ouverture.
    // L'inventaire est un acte signé chez le client (prise du mobilier avec un commissaire de justice) : un rendez-vous « INVENTAIRE + NOTO … »
    // (notoriété signée en même temps, étude 21/10) sert aux deux étapes ; en deux temps, chacune a son rendez-vous.
    const avecInventaire = (/** @type {any} */ r) => /(?<![A-Z])INVENTAIRE(?![A-Z])/.test(String(r.titre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase());
    const rdvControle = rendezVousRetenu(rdvs.filter((r) => r.etape === 'controleDroits'), auj)
      || rendezVousRetenu(rdvs.filter((r) => r.etape === 'notoriete' && avecInventaire(r)), auj);
    etapes.push({ type: 'controleDroits', label: 'Contrôle des droits et de l’inventaire', iso: rdvControle ? rdvControle.date : plus(MOIS_CONTROLE_DROITS), fait: cocheeSuccession(d, 'controleDroits'), attente: false, active: true, rdvPlace: !!rdvControle });
    const apresNoto = noto.fait ? (noto.iso || '') : '';
    if (conjointSurvivant(d)) {
      etapes.push({ type: 'transfertComptes', label: 'Transfert des comptes au profit du conjoint survivant', iso: apresNoto, fait: cocheeSuccession(d, 'transfertComptes'), attente: false, active: noto.fait });
    } else {
      const debloque = cocheeSuccession(d, 'deblocageFonds');
      etapes.push({ type: 'deblocageFonds', label: 'Déblocage des fonds auprès des banques', iso: apresNoto, fait: debloque, attente: false, active: noto.fait });
      etapes.push({ type: 'receptionFonds', label: 'Réception des fonds', iso: '', fait: cocheeSuccession(d, 'receptionFonds'), attente: true, active: noto.fait && debloque });
    }
    // Succession classique : attestation immobilière et déclaration de succession, après la notoriété, au plus tard à 6 mois.
    if (type.actes.includes('declaration')) {
      const ds = acteSigneSuccession(d, 'declaration', auj);
      const label = type.actes.includes('attestation') ? 'Signature de l’attestation immobilière et de la déclaration de succession' : 'Signature de la déclaration de succession';
      const placee = rdvDeclaration ? rdvDeclaration.date : '';
      const butoir = depuisDeces(MOIS_DECLARATION_SUCCESSION);
      etapes.push({ type: 'declarationSuccession', label, iso: ds.fait ? ds.iso : (placee || butoir), fait: ds.fait, attente: false, active: true, butoir: !ds.fait && !placee && !!butoir, rdvPlace: !ds.fait && !!placee, depuisDeces: !!deces });
    }
    // Avant le DERNIER rendez-vous (attestation immobilière / déclaration de succession, sinon notoriété) — étude 16/10 : « l'envoi du
    // décompte à faire valider » et, parfois, « un appel de fonds pour régler nos fonds si on n'a pas assez en comptabilité », « un peu
    // comme pour les ventes » : 10 jours avant le rendez-vous placé (JOURS_AVANT_DERNIER_RDV_SUCCESSION, même délai que l'appel de fonds
    // d'une vente). Faits d'eux-mêmes une fois ce dernier acte signé. L'appel de fonds se dit « pas nécessaire » d'un clic
    // (`d.succession.appelFondsInutile`) ; avec un conjoint survivant les comptes lui sont transférés, l'étude ne reçoit rien.
    const iDernier = etapes.map((e) => e.type).lastIndexOf(etapes.some((e) => e.type === 'declarationSuccession') ? 'declarationSuccession' : 'notoriete');
    const dernier = etapes[iDernier];
    // Pas de décompte ni d'appel de fonds pour une notoriété seule (étude 21/10 : « pas besoin pour le NOTORIETE, INVENTAIRE ») : seulement
    // quand l'acte du dernier rendez-vous est la déclaration de succession (seule ou signée avec la notoriété).
    if (dernier && dernier.type === 'declarationSuccession') {
      const avantRdv = dernier.rdvPlace && dernier.iso ? (C.addDays(dernier.iso, -JOURS_AVANT_DERNIER_RDV_SUCCESSION) || '') : '';
      const s = infoSuccession(d);
      const avant = [{ type: 'decompteSuccession', label: 'Envoi du décompte à faire valider', iso: dernier.fait ? '' : avantRdv,
        fait: dernier.fait || cocheeSuccession(d, 'decompteSuccession'), attente: false, active: true, avantRdv: true },
      // Le projet n'est envoyé que pour la déclaration de succession, comme le décompte (étude 21/10).
      { type: 'projetSuccession', label: 'Envoi du projet à faire valider', iso: dernier.fait ? '' : avantRdv,
        fait: dernier.fait || cocheeSuccession(d, 'projetSuccession'), attente: false, active: true, avantRdv: true }];
      // Appel de fonds = les clients versent les frais d'acte à l'office ; le décompte (autre étape) = le tableau qui leur dit ce qu'ils vont recevoir.
      // Étude 22/10 : avec un conjoint survivant on TRANSFÈRE les fonds et il y a très peu en comptabilité — l'appel de fonds est dû ; avec les seuls
      // héritiers, la banque débloque les comptes et l'étude se rémunère dessus s'il y a assez, sinon elle demande un complément (étape facultative).
      if (s.appelFondsInutile !== true) {
        avant.push({ type: 'appelFondsSuccession', label: 'Appel de fonds', iso: dernier.fait ? '' : avantRdv,
          fait: dernier.fait || cocheeSuccession(d, 'appelFondsSuccession'), attente: false, active: true, avantRdv: true, facultatif: !conjointSurvivant(d) });
      }
      etapes.splice(iDernier, 0, ...avant);
    }
    // Les actes ajoutés dans Authentic (« ACT Attestation SUCC … », délivrance de legs…) ne sont plus des étapes de la timeline (étude 21/10 :
    // « ne pas afficher cela ou autre dans la timeline, juste vérifier l'état rédigé ou non ») : leur état se lit dans le bloc « Dossier ».
    return etapes;
  }

  /** Pure : une étape de succession validée (coche ou Authentic) — pour echeanceValidee. @param {any} d @param {string} type */
  function etapeSuccessionValidee(d, type) {
    const e = etapesSuccession(d).find(x => x.type === type);
    if (e) return e.fait;
    return cocheeSuccession(d, type);
  }

  var TYPES_ETAPES_SUCCESSION = ['ouvertureSuccession', 'notoriete', 'controleDroits', 'transfertComptes', 'deblocageFonds', 'receptionFonds', 'decompteSuccession', 'projetSuccession', 'appelFondsSuccession', 'declarationSuccession'];
  var JOURS_AVANT_DERNIER_RDV_SUCCESSION = 10;

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
    // Notoriété + déclaration : pas d'attestation immobilière, donc aucune pièce d'immobilier (étude 21/10).
    const type = typeSuccessionDef(typeSuccession(d));
    const immobilier = type.cle === 'classique' || (type.cle !== 'notoriete-ds' && successionAvecImmobilier(d));
    return PIECES_SUCCESSION.filter(p => !retirees.has(p.cle) && (!p.immobilier || immobilier))
      .map(p => ({ cle: p.cle, label: p.label, motifNom: p.motifNom }));
  }

  const exportes = { rendezVousPasse, titreToutEnsembleSuccession, ETAPES_RDV_SUCCESSION, rendezVousSuccession, etapeEvenementSuccession, empreinteRendezVousSuccession, instantaneRendezVousSuccession, rendezVousRetenu, etapeRendezVousSuccessionDepuisTitre, signatureSuccessionDepuisRendezVous, rendezVousSuccessionDepuisAgenda, TYPES_SUCCESSION, ACTES_SUCCESSION, MOIS_NOTORIETE, MOIS_NOTORIETE_DS_DEBUT, MOIS_CONTROLE_DROITS, MOIS_DECLARATION_SUCCESSION, SEUIL_ACTIF_DECLARATION, PIECES_SUCCESSION, PIECES_NOTORIETE, TYPES_ETAPES_SUCCESSION, JOURS_AVANT_DERNIER_RDV_SUCCESSION, infoSuccession, decesSuccession, successionAvecImmobilier, typeSuccessionPropose, typeSuccession, typeSuccessionDef, acteBaseDepuisIntitule, acteAuthenticSuccession, actesSuccession, ouvertureSuccession, conjointSurvivant, acteSigneSuccession, etapesSuccession, etapeSuccessionValidee, attentesNotoriete, piecesSuccessionDossier };
  if (typeof module !== 'undefined' && module.exports) module.exports = exportes; else Object.assign(globalThis, exportes);
})(
  typeof module !== 'undefined' && module.exports ? Object.assign({}, require('./dates'), require('./dossier')) : /** @type {any} */ (globalThis)
);
