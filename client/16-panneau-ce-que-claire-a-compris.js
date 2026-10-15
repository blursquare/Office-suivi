  // ==== PANNEAU « CE QUE L'OUTIL A COMPRIS » ====
  //
  // L'outil ne prétend plus « confirmer » quoi que ce soit : il dit D'OÙ VIENT chaque donnée, et
  // c'est l'étude qui coche « vérifié ». L'ancien libellé « Confirmé » était accordé du seul fait
  // qu'une regex avait renvoyé une valeur (voir champExtraction) — il promettait un contrôle qui
  // n'avait jamais eu lieu, et les propositions du modèle local, qui hallucine régulièrement des
  // termes, tombaient dans le même mot. Le vert est désormais réservé à ce qu'un humain a relu.

  var ORIGINES_REVISION = {
    manuel: { texte: 'Saisie à la main', dl: 'dl-success' },
    verifie: { texte: 'Vérifié', dl: 'dl-success' },
    absent: { texte: 'Non trouvée', dl: 'dl-neutre' },
    appris: { texte: 'Appris d’une correction précédente', dl: 'dl-neutre', icone: 'sparkle' },
    calcule: { texte: 'Calculée depuis un délai', dl: 'dl-pret' },
    arbitre: { texte: 'Plusieurs valeurs possibles', dl: 'dl-alerte' },
    concordant: { texte: 'Lue dans l’acte, même lecture par l’IA', dl: 'dl-neutre' },
    authentic: { texte: 'Reprise d’Authentic', dl: 'dl-neutre' },
    deduit: { texte: 'Déduit des notaires', dl: 'dl-neutre' },
    defaut: { texte: 'Par défaut', dl: 'dl-neutre' },
    lu: { texte: 'Lue dans l’acte', dl: 'dl-neutre' }
  };

  // Pure et testable : ne dépend que de l'objet champ. L'ordre des cas EST la règle métier — le
  // vert ne s'obtient que par une relecture humaine, jamais par la seule présence d'une valeur.
  function origineRevision(champ) {
    if (!champ) return ORIGINES_REVISION.absent;
    if (champ.origine === 'manuel') return ORIGINES_REVISION.manuel;
    if (champ.verifie) return ORIGINES_REVISION.verifie;
    const vide = champ.valeur === null || champ.valeur === undefined || champ.valeur === '';
    if (vide) return ORIGINES_REVISION.absent;
    if (champ.statut === 'NEEDS_REVIEW') return ORIGINES_REVISION.arbitre;
    if (champ.apprise) return ORIGINES_REVISION.appris;
    if (champ.methode === 'CALCULATED') return ORIGINES_REVISION.calcule;
    if (champ.origine === 'regex+ia') return ORIGINES_REVISION.concordant;
    if (champ.origine === 'authentic') return ORIGINES_REVISION.authentic;
    if (champ.origine === 'deduit') return ORIGINES_REVISION.deduit;
    if (champ.origine === 'defaut') return ORIGINES_REVISION.defaut;
    return ORIGINES_REVISION.lu;
  }

  // Les données affichées dans le panneau, dans l'ordre de lecture, avec le champ du formulaire
  // qu'elles pilotent. Corriger une ligne écrit dans les deux : une seule source de vérité, pas de
  // double saisie — et surtout plus besoin de quitter l'écran où l'erreur se voit pour la corriger.
  var CHAMPS_REVISION = [
    { cle: 'typeActe', libelle: 'Type d’acte', type: 'select', champId: null },
    { cle: 'nom', libelle: 'Nom du dossier', type: 'texte', champId: 'f-nom' },
    // Données du dossier (étude, 02/10 au soir : « pourquoi les données de dossier ne sont pas dans les données
    // pré-remplies ? ») : lues dans le formulaire, leur source suivie par originesDossierWizard.
    { cle: 'typeVente', libelle: 'Type de vente', type: 'select', champId: 'f-type-vente', formulaire: true },
    { cle: 'responsable', libelle: 'Responsable', type: 'select', champId: 'f-responsable', formulaire: true },
    { cle: 'signature', libelle: 'Signature de l’avant-contrat', type: 'date', champId: null },
    { cle: 'pret', libelle: 'Obtention du prêt', type: 'date', champId: 'f-pret' },
    { cle: 'acte', libelle: 'Réitération de l’acte', type: 'date', champId: 'f-acte' },
    { cle: 'ventebien', libelle: 'Vente préalable', type: 'date', champId: 'f-ventebien' },
    { cle: 'adresseBien', libelle: 'Adresse du bien', type: 'texte', champId: 'f-adresse-bien' },
    { cle: 'prixVente', libelle: 'Prix de vente', type: 'nombre', champId: 'f-prix-vente' },
    { cle: 'prixMobilier', libelle: 'Dont mobilier', type: 'nombre', champId: 'f-prix-mobilier' },
    { cle: 'emailAcquereur', libelle: 'Email de l’acquéreur', type: 'texte', champId: 'f-email-acquereur' },
    { cle: 'emailVendeur', libelle: 'Email du vendeur', type: 'texte', champId: 'f-email-vendeur' },
    { cle: 'nomAgence', libelle: 'Agence immobilière', type: 'texte', champId: 'f-nom-agence' },
    { cle: 'honorairesAgence', libelle: 'Honoraires d’agence TTC', type: 'nombre', champId: 'f-honoraires-agence' },
    { cle: 'depotGarantie', libelle: 'Dépôt de garantie / acompte', type: 'nombre', champId: 'f-depot-garantie' },
    { cle: 'sequestreDepot', libelle: 'Dépôt versé à', type: 'texte', champId: 'f-sequestre-depot' },
    { cle: 'notaireVendeur', libelle: 'Notaire du vendeur', type: 'texte', champId: 'f-notaire-vendeur', formulaire: true, liste: 'f-notaires-liste' },
    { cle: 'notaireAcquereur', libelle: 'Notaire de l’acquéreur', type: 'texte', champId: 'f-notaire-acquereur', formulaire: true, liste: 'f-notaires-liste' },
    { cle: 'coteInstrumentaire', libelle: 'Notaire qui reçoit l’acte', type: 'select', champId: 'f-cote-instrumentaire', formulaire: true },
    { cle: 'roleNotaire', libelle: 'Rôle de l’étude', type: 'select', champId: 'f-role-notaire', formulaire: true }
  ];

  // D'où vient la valeur d'un champ « dossier » du formulaire : 'acte', 'authentic', 'deduit' (des
  // notaires), 'defaut' (valeur de départ), 'manuel'. Vidé à chaque nouveau dossier.
  var originesDossierWizard = {};
  function noterOrigineDossierWizard(champId, origine) {
    if (originesDossierWizard[champId] === 'manuel' && origine !== 'manuel') return false;
    originesDossierWizard[champId] = origine;
    return true;
  }
  // Une valeur posée par CLAIRE ne remplace jamais un choix fait à la main.
  function choixManuelDossierWizard(champId) { return originesDossierWizard[champId] === 'manuel'; }

  // Pure : la ligne du panneau d'un champ « dossier » d'après sa valeur, sa source et sa relecture.
  function champFormulaireRevision(valeur, origine, verifie, source) {
    const v = valeur === undefined || valeur === null || valeur === '' ? null : String(valeur);
    return {
      valeur: v, statut: v ? 'CONFIRMED' : 'NOT_FOUND', methode: null,
      origine: origine === 'acte' ? 'regex' : (origine || 'defaut'),
      source: source || null, candidats: [], raison: '', verifie: !!verifie, propositionIa: null
    };
  }

  var OPTIONS_REVISION = {
    typeActe: [
      { valeur: 'COMPROMIS_DE_VENTE', libelle: 'Compromis de vente' },
      { valeur: 'PROMESSE_DE_VENTE', libelle: 'Promesse de vente' },
      { valeur: 'PROMESSE_D_ACHAT', libelle: 'Promesse d’achat' },
      { valeur: 'INCONNU', libelle: 'Non déterminé' }
    ],
    roleNotaire: [
      { valeur: 'instrumentaire', libelle: 'Notaire instrumentaire' },
      { valeur: 'participant', libelle: 'Notaire participant' }
    ]
  };

  // Corrections et relectures survivent à un recalcul : corriger la date de signature reconstruit
  // tout l'objet d'extraction (voir recalculerExtractionRegex), et sans ces deux tables le travail
  // de relecture déjà fait serait effacé à chaque fois.
  let correctionsRevision = {};
  let verificationsRevision = {};

  function champRevision(extraction, cle) {
    if (!extraction) return null;
    const defForm = CHAMPS_REVISION.find(c => c.cle === cle && c.formulaire);
    const elForm = defForm && typeof document !== 'undefined' ? document.getElementById(defForm.champId) : null;
    if (elForm && typeof elForm.value === 'string' && (cle !== 'roleNotaire' || elForm.value)) {
      const n = extraction.notaires || {};
      const page = cle === 'notaireVendeur' && n.vendeur ? n.vendeur.source
        : cle === 'notaireAcquereur' && n.acquereur ? n.acquereur.source
        : (cle === 'coteInstrumentaire' || cle === 'roleNotaire') && n.instrumentaire ? n.instrumentaire.source : null;
      const origine = originesDossierWizard[defForm.champId];
      return champFormulaireRevision(elForm.value.trim(), origine, verificationsRevision[cle], origine === 'acte' ? page : null);
    }
    const dates = extraction.dates || {};
    const champs = extraction.champs || {};
    if (cle === 'typeActe') return extraction.typeActe || null;
    if (cle === 'nom') return champs.nom || null;
    if (cle === 'prixVente') return champs.prixVente || null;
    if (cle === 'prixMobilier') return champs.prixMobilier || null;
    if (cle === 'emailAcquereur') return champs.emailAcquereur || null;
    if (cle === 'emailVendeur') return champs.emailVendeur || null;
    if (cle === 'nomAgence') return champs.nomAgence || null;
    if (cle === 'honorairesAgence') return champs.honorairesAgence || null;
    if (cle === 'depotGarantie') return champs.depotGarantie || null;
    if (cle === 'sequestreDepot') return champs.sequestreDepot || null;
    if (cle === 'signature') return dates.SIGNATURE_AVANT_CONTRAT || null;
    if (cle === 'pret') return dates.BUTOIR_PRET || null;
    if (cle === 'acte') return dates.REITERATION_ACTE || null;
    if (cle === 'ventebien') return dates.BUTOIR_VENTE_PREALABLE || null;
    if (cle === 'adresseBien') {
      const bien = extraction.bien || {};
      const a = bien.adresse || null;
      if (!a) return null;
      // Vue normalisée : l'adresse porte sa valeur sous « adresseComplete », tout le panneau lit
      // « valeur ». Les écritures passent par ecrireChampRevision, jamais par cette copie.
      return {
        valeur: a.adresseComplete || null, statut: a.statut || 'NOT_FOUND', methode: null,
        origine: a.origine || 'regex', source: bien.source || a.source || null,
        candidats: [], raison: a.departement ? `Département ${a.departement}, déduit du code postal.` : '',
        verifie: !!a.verifie, propositionIa: bien.propositionIa || null
      };
    }
    if (cle === 'roleNotaire') {
      const n = extraction.notaires || {};
      return {
        valeur: n.roleEtude || null, statut: n.statut || 'NOT_FOUND', methode: null,
        origine: n.origine || 'regex', source: n.instrumentaire ? n.instrumentaire.source : null,
        candidats: [], raison: n.raison || '', verifie: !!n.verifie, propositionIa: null
      };
    }
    return null;
  }

  function ecrireChampRevision(extraction, cle, valeur) {
    if (!extraction) return;
    const v = (valeur === '' || valeur === undefined) ? null : valeur;
    const marquer = (objet) => {
      if (!objet) return;
      objet.valeur = v;
      objet.statut = v ? 'CONFIRMED' : 'NOT_FOUND';
      objet.origine = 'manuel';
      objet.raison = 'Corrigée à la main.';
      objet.candidats = [];
      objet.propositionIa = null;
      objet.verifie = true;
      objet.apprise = false;
    };
    extraction.champs = extraction.champs || {};
    extraction.dates = extraction.dates || {};
    const defForm = CHAMPS_REVISION.find(c => c.cle === cle && c.formulaire);
    if (defForm) originesDossierWizard[defForm.champId] = 'manuel';
    if (cle === 'typeActe') { extraction.typeActe = extraction.typeActe || champExtraction(null); marquer(extraction.typeActe); }
    else if (cle === 'nom') { extraction.champs.nom = extraction.champs.nom || champExtraction(null); marquer(extraction.champs.nom); }
    else if (cle === 'prixVente') { extraction.champs.prixVente = extraction.champs.prixVente || champExtraction(null); marquer(extraction.champs.prixVente); }
    else if (cle === 'prixMobilier') { extraction.champs.prixMobilier = extraction.champs.prixMobilier || champExtraction(null); marquer(extraction.champs.prixMobilier); }
    else if (cle === 'emailAcquereur') { extraction.champs.emailAcquereur = extraction.champs.emailAcquereur || champExtraction(null); marquer(extraction.champs.emailAcquereur); }
    else if (cle === 'emailVendeur') { extraction.champs.emailVendeur = extraction.champs.emailVendeur || champExtraction(null); marquer(extraction.champs.emailVendeur); }
    else if (cle === 'nomAgence') { extraction.champs.nomAgence = extraction.champs.nomAgence || champExtraction(null); marquer(extraction.champs.nomAgence); }
    else if (cle === 'honorairesAgence') { extraction.champs.honorairesAgence = extraction.champs.honorairesAgence || champExtraction(null); marquer(extraction.champs.honorairesAgence); }
    else if (cle === 'depotGarantie') { extraction.champs.depotGarantie = extraction.champs.depotGarantie || champExtraction(null); marquer(extraction.champs.depotGarantie); }
    else if (cle === 'sequestreDepot') { extraction.champs.sequestreDepot = extraction.champs.sequestreDepot || champExtraction(null); marquer(extraction.champs.sequestreDepot); }
    else if (cle === 'signature') { extraction.dates.SIGNATURE_AVANT_CONTRAT = extraction.dates.SIGNATURE_AVANT_CONTRAT || champExtraction(null); marquer(extraction.dates.SIGNATURE_AVANT_CONTRAT); }
    else if (cle === 'pret') { extraction.dates.BUTOIR_PRET = extraction.dates.BUTOIR_PRET || champExtraction(null); marquer(extraction.dates.BUTOIR_PRET); }
    else if (cle === 'acte') { extraction.dates.REITERATION_ACTE = extraction.dates.REITERATION_ACTE || champExtraction(null); marquer(extraction.dates.REITERATION_ACTE); }
    else if (cle === 'ventebien') { extraction.dates.BUTOIR_VENTE_PREALABLE = extraction.dates.BUTOIR_VENTE_PREALABLE || champExtraction(null); marquer(extraction.dates.BUTOIR_VENTE_PREALABLE); }
    else if (cle === 'adresseBien') {
      extraction.bien = extraction.bien || {};
      extraction.bien.adresse = extraction.bien.adresse || {};
      const a = extraction.bien.adresse;
      a.adresseComplete = v; a.statut = v ? 'CONFIRMED' : 'NOT_FOUND'; a.origine = 'manuel'; a.verifie = true;
      extraction.bien.propositionIa = null;
    } else if (cle === 'roleNotaire') {
      extraction.notaires = extraction.notaires || {};
      extraction.notaires.roleEtude = v;
      extraction.notaires.statut = v ? 'CONFIRMED' : 'NOT_FOUND';
      extraction.notaires.origine = 'manuel';
      extraction.notaires.verifie = true;
      extraction.notaires.raison = 'Choisi à la main.';
    }
  }

  // Rejoue sur un objet d'extraction fraîchement reconstruit les corrections et les relectures déjà
  // faites. Sans ça, corriger la date de signature (qui relance tout le calcul) effacerait le
  // travail de vérification en cours.
  function appliquerCorrectionsRevision(extraction) {
    if (!extraction) return extraction;
    for (const cle of Object.keys(correctionsRevision)) ecrireChampRevision(extraction, cle, correctionsRevision[cle]);
    for (const cle of Object.keys(verificationsRevision)) {
      if (!verificationsRevision[cle]) continue;
      const objet = champRevision(extraction, cle);
      if (!objet) continue;
      if (cle === 'adresseBien' && extraction.bien && extraction.bien.adresse) extraction.bien.adresse.verifie = true;
      else if (cle === 'roleNotaire' && extraction.notaires) extraction.notaires.verifie = true;
      else objet.verifie = true;
    }
    extraction.alertes = controlerCoherence(extraction);
    return extraction;
  }

  // Une date dont l'année n'est pas encore entièrement saisie. Un <input type="date"> émet
  // `change` dès que ses trois cases forment une date valide : en tapant l'année, « 2 » donne
  // l'an 0002, la valeur est donc considérée comme complète et le panneau se redessinait au
  // premier chiffre, faisant perdre le focus (signalé deux fois par l'étude). On ignore ces
  // valeurs intermédiaires : l'année réelle a toujours quatre chiffres et est la dernière case
  // saisie, la validation tombe donc naturellement à la fin de la frappe.
  function dateIncompleteEnCoursDeSaisie(valeur) {
    const m = /^(\d{4})-\d{2}-\d{2}$/.exec(String(valeur || ''));
    return !!m && parseInt(m[1], 10) < 1900;
  }

  function modifierDonneeRevision(cle, valeur) {
    if (!extractionActuelle) return;
    if (dateIncompleteEnCoursDeSaisie(valeur)) return;
    const propre = typeof valeur === 'string' ? valeur.trim() : valeur;
    correctionsRevision[cle] = propre;
    verificationsRevision[cle] = true; // corriger une donnée, c'est l'avoir relue
    ecrireChampRevision(extractionActuelle, cle, propre);
    synchroniserChampFormulaire(cle, propre);
    memoriserCorrectionRevision(cle, propre);
    // La date de signature est l'ancre de tous les délais : la corriger relance tout le calcul
    // (et donc le rendu du panneau), inutile de le refaire ici.
    if (cle === 'signature' && propre) { corrigerDateCompromis(propre); return; }
    extractionActuelle.alertes = controlerCoherence(extractionActuelle);
    renderPanneauRevision(extractionActuelle);
  }

  function synchroniserChampFormulaire(cle, valeur) {
    const definition = CHAMPS_REVISION.find(c => c.cle === cle);
    if (!definition || !definition.champId) return;
    const champ = document.getElementById(definition.champId);
    if (!champ) return;
    // Dates butoir : plus d'interrupteurs à la création (étude, 02/10 au soir) — une date saisie active
    // l'échéance ; une vente préalable vidée la retire.
    if (['pret', 'acte', 'ventebien'].includes(cle)) {
      if (valeur) definirEcheanceActive(cle, true);
      else if (cle === 'ventebien') definirEcheanceActive(cle, false);
    }
    champ.value = valeur === null || valeur === undefined ? '' : String(valeur);
    // Champ du dossier : une saisie, que CLAIRE ne doit plus remplacer.
    if (definition.formulaire) delete valeursAppliquees[definition.champId];
    else valeursAppliquees[definition.champId] = champ.value;
    if (definition.formulaire) majApercuPieces();
  }

  // Une correction faite dans le panneau alimente la mémoire des corrections, au même titre qu'un
  // clic sur un chip : c'est exactement le même geste (l'outil s'est trompé, l'étude tranche), et
  // c'est ce qui fait ressortir le badge « Appris » au prochain compromis de même trame.
  // Ce qui doit être appris, c'est la clause qui porte la date RETENUE par l'étude — pas celle que
  // l'outil avait choisie à tort. La version précédente mémorisait `objet.source.extrait`, c'est-à-
  // dire l'extrait de la date qu'on était justement en train de corriger : elle renforçait l'erreur
  // au lieu de l'apprendre, et le prochain acte de même trame retombait sur la même mauvaise date.
  function memoriserCorrectionRevision(cle, valeur) {
    if (!valeur) return;
    const champDate = { pret: 'pret', acte: 'acte', ventebien: 'ventebien' }[cle];
    if (!champDate) return;
    apprendreDateSaisie(champDate, valeur);
  }

  // Une date choisie à la main pour un type d'échéance (panneau « Ce que l'outil a compris », ou
  // champ « Dates butoir » de l'étape Vérifier) : si elle figure parmi les dates repérées dans
  // l'acte, sa clause est apprise pour ce type. Mémorisée quand l'outil l'avait classée autrement,
  // ou quand elle était l'une de plusieurs candidates du même type (l'outil avait alors choisi une
  // autre clause). Une date tapée qui ne figure pas dans l'acte n'a pas de clause : rien à apprendre.
  function apprendreDateSaisie(type, iso) {
    if (!iso || dateIncompleteEnCoursDeSaisie(iso)) return false;
    if (!Array.isArray(detectedDates)) return false;
    const item = detectedDates.find(d => d.iso === iso);
    if (!item || !item.contexte) return false;
    const concurrentes = detectedDates.filter(d => d !== item && d.suggestion === type).length;
    if (item.suggestion === type && !concurrentes) return false; // l'outil avait déjà bien vu
    memoriserCorrection(item.contexte, type, null);
    item.suggestion = type;
    item.apprise = true;
    item.active = true;
    if (typeof renderChips === 'function') renderChips();
    return true;
  }

  // « Sans prêt » sur la ligne « Obtention du prêt » (remplace l'interrupteur des échéances, retiré).
  function basculerSansPretRevision(sansPret) {
    definirEcheanceActive('pret', !sansPret);
    if (!sansPret && extractionActuelle) {
      const champ = champRevision(extractionActuelle, 'pret');
      if (champ && champ.valeur) document.getElementById('f-pret').value = champ.valeur;
    }
    if (sansPret) verificationsRevision.pret = true; // cocher « Sans prêt », c'est l'avoir relu
    if (extractionActuelle) renderPanneauRevision(extractionActuelle);
  }

  function basculerVerificationRevision(cle, coche, sansRendu) {
    if (!extractionActuelle) return;
    verificationsRevision[cle] = !!coche;
    if (cle === 'adresseBien' && extractionActuelle.bien && extractionActuelle.bien.adresse) {
      extractionActuelle.bien.adresse.verifie = !!coche;
    } else if (cle === 'roleNotaire' && extractionActuelle.notaires) {
      extractionActuelle.notaires.verifie = !!coche;
    } else {
      const objet = champRevision(extractionActuelle, cle);
      if (objet) objet.verifie = !!coche;
    }
    if (!sansRendu) renderPanneauRevision(extractionActuelle);
  }

  // Adopte la valeur proposée par le modèle local. Explicite et réversible : rien de ce que le
  // modèle propose n'atteint un champ sans ce clic.
  function accepterPropositionIa(cle) {
    const objet = champRevision(extractionActuelle, cle);
    if (!objet || !objet.propositionIa) return;
    modifierDonneeRevision(cle, objet.propositionIa.valeur);
  }

  function boutonPageRevision(source, cle) {
    if (!source || !source.page) return '';
    // Cliquable seulement tant que le PDF est chargé en mémoire (import en cours) — même principe
    // que pour les engagements du vendeur. Le clic surligne ce qui a été trouvé (voirDonneeRevisionDansPdf, 06/10).
    return pdfActuel
      ? `<button type="button" class="voir-pdf-btn" onclick="voirDonneeRevisionDansPdf('${escapeOnclickArg(cle)}')" title="Voir à la page ${source.page} du document">${icone('eye')} p.${source.page}</button>`
      : `<span class="chip-page">p.${source.page}</span>`;
  }

  function champSaisieRevision(definition, champ) {
    const brut = champ && champ.valeur !== null && champ.valeur !== undefined ? String(champ.valeur) : '';
    const cle = definition.cle;
    if (definition.type === 'select' && definition.formulaire) {
      const el = typeof document !== 'undefined' ? document.getElementById(definition.champId) : null;
      const opts = el && el.options ? [...el.options].map(o => ({ valeur: o.value, libelle: o.text })) : [];
      return `<select class="revision-saisie" onchange="modifierDonneeRevision('${cle}', this.value)">${opts.map(o =>
        `<option value="${escapeAttr(o.valeur)}"${o.valeur === brut ? ' selected' : ''}>${escapeHtml(o.libelle)}</option>`).join('')}</select>`;
    }
    if (definition.type === 'select') {
      const options = (OPTIONS_REVISION[cle] || []).map(o =>
        `<option value="${escapeAttr(o.valeur)}"${o.valeur === brut ? ' selected' : ''}>${escapeHtml(o.libelle)}</option>`
      ).join('');
      return `<select class="revision-saisie" onchange="modifierDonneeRevision('${cle}', this.value)">
        <option value=""${brut ? '' : ' selected'}>—</option>${options}</select>`;
    }
    const type = definition.type === 'date' ? 'date' : (definition.type === 'nombre' ? 'number' : 'text');
    // onchange (et non oninput) : le panneau se redessine à chaque modification, une saisie
    // caractère par caractère perdrait le focus au premier appui sur une touche.
    return `<input type="${type}" class="revision-saisie" value="${escapeAttr(brut)}"${definition.liste ? ` list="${definition.liste}"` : ''}
      placeholder="Non renseigné" onchange="modifierDonneeRevision('${cle}', this.value)">`;
  }

  function renderLigneRevision(definition, champ) {
    const cle = definition.cle;
    let autresOptions = '';
    const page = boutonPageRevision(champ && champ.source, cle);
    const verifie = !!(champ && champ.verifie);
    const methode = champ && champ.methode === 'CALCULATED' && champ.calcul
      ? `<div class="revision-raison">${champ.valeur ? 'Calculée' : 'Délai trouvé'} : ${escapeHtml(String(champ.calcul.delai ? champ.calcul.delai.valeur + ' ' + champ.calcul.delai.unite : ''))} ${escapeHtml(libellePointDepart(champ.calcul.pointDepart))}.</div>` : '';
    const raison = champ && champ.raison ? `<div class="revision-raison">${escapeHtml(champ.raison)}</div>` : '';
    const autres = champ && (champ.candidats || []).length > 1
      ? `<div class="revision-raison">Aussi trouvé : ${champ.candidats.map(c => escapeHtml(String(c.valeur))).join(', ')}</div>`
      : '';
    const extrait = champ && champ.source && champ.source.extrait
      ? `<div class="revision-extrait">« ${escapeHtml(String(champ.source.extrait).slice(0, 240))} »</div>` : '';
    // Proposition du modèle local : affichée, jamais appliquée d'elle-même.
    const proposition = champ && champ.propositionIa
      ? `<div class="revision-proposition">
          <span class="dot-label dl-alerte"><span class="dot"></span>Proposé par l’IA</span>
          <span class="revision-proposition-valeur">${escapeHtml(String(LIBELLES_TYPE_ACTE[champ.propositionIa.valeur] || champ.propositionIa.valeur))}</span>
          <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="accepterPropositionIa('${cle}')">Utiliser</wa-button>
          ${champ.propositionIa.extraitTrouve ? '' : '<span class="revision-raison">Le modèle cite une phrase qui ne figure pas dans le document : à traiter avec prudence.</span>'}
        </div>` : '';
    // Relance ciblée à l'IA locale (redemanderChampIa) DÉSACTIVÉE pour la création d'un nouveau
    // dossier, comme l'enrichissement IA de l'import (voir traiterFichierPdf) : à la demande de
    // l'étude, le modèle local ne participe plus à la relecture d'un nouveau dossier. Le bouton
    // "Redemander à l'IA" n'est plus rendu ; redemanderChampIa/CLES_CIBLE_IA restent en place, sans
    // appelant, pour un éventuel retour arrière. La correction d'un champ reste manuelle.
    const vide = !champ || champ.valeur === null || champ.valeur === undefined || champ.valeur === '';
    if (cle === 'pret') {
      const sansPret = !!(champ && champ.sansPret);
      const option = `<label class="revision-option"><input type="checkbox" ${sansPret ? 'checked' : ''} onchange="basculerSansPretRevision(this.checked)"> Sans prêt</label>`;
      if (sansPret) {
        const ok = !!champ.verifie;
        return `<div class="revision-ligne${ok ? ' revision-verifiee' : ''}">
          <button type="button" class="revision-check${ok ? ' coche' : ''}" role="checkbox" aria-checked="${ok}" aria-label="${ok ? 'Retirer la validation de' : 'Valider'} ${escapeAttr(definition.libelle)}" onclick="basculerVerificationRevision('pret', ${!ok})">${ok ? icone('check') : ''}</button>
          <div class="revision-corps">
            <div class="revision-tete"><span class="revision-libelle">${escapeHtml(definition.libelle)}</span><span class="revision-source">Achat sans prêt</span></div>
            ${option}
          </div>
        </div>`;
      }
      autresOptions = option;
    }
    // Source d'origine, même une fois validée (« Lu dans l'acte », « Repris d'Authentic »…).
    const source = origineRevision(champ ? Object.assign({}, champ, { verifie: false }) : champ);
    const libelleAria = `${verifie ? 'Retirer la validation de' : 'Valider'} ${definition.libelle}`;
    const coche = vide
      ? '<span class="revision-check vide" aria-hidden="true"></span>'
      : `<button type="button" class="revision-check${verifie ? ' coche' : ''}" role="checkbox" aria-checked="${verifie}" aria-label="${escapeAttr(libelleAria)}" title="${verifie ? 'Validée — cliquer pour revenir à « à valider »' : 'Valider : donnée relue dans le document'}" onclick="basculerVerificationRevision('${cle}', ${!verifie})">${verifie ? icone('check') : ''}</button>`;
    // L'extrait du document, utile pour relire, se déplie à la demande (la page du PDF reste à un clic).
    // Étude, 02/10 : « trop de texte dans les champs » — ni raison, ni calcul, ni extrait sous la
    // valeur ; la source tient dans l'étiquette, la page du PDF reste à un clic.
    void methode; void raison; void extrait;
    return `<div class="revision-ligne${verifie ? ' revision-verifiee' : ''}${vide ? ' revision-vide' : ''}">
      ${coche}
      <div class="revision-corps">
        <div class="revision-tete">
          <span class="revision-libelle">${escapeHtml(definition.libelle)}</span>
          ${vide ? '' : `<span class="revision-source">${escapeHtml(source.texte)}</span>`}
          ${page}
        </div>
        ${champSaisieRevision(definition, champ)}
        ${autresOptions}${autres}${proposition}
      </div>
    </div>`;
  }

  // Étude, 03/10 : un champ dont le compromis ne dit rien reste affiché (groupe « À compléter », plus replié) —
  // s'il sert une fois, il sert à chaque fois.
  // Compteurs du dernier rendu (sous-titre de l'étape « Vérifier »).
  var etatRevision = { aValider: 0, validees: 0, vides: 0 };

  // Pure : les lignes du panneau réparties — à valider (pré-remplies, pas encore relues), validées,
  // à compléter (rien de trouvé).
  // Toujours montrées, même vides (étude, 02/10 au soir : la vente préalable dans les données pré-remplies).
  var CLES_REVISION_TOUJOURS_VISIBLES = ['ventebien'];
  function groupesRevision(extraction, sansPret) {
    const g = { aValider: [], validees: [], aCompleter: [], visibles: [] };
    CHAMPS_REVISION.forEach(definition => {
      if (definition.cle === 'pret' && sansPret) {
        const verifie = !!(typeof verificationsRevision !== 'undefined' && verificationsRevision.pret);
        (verifie ? g.validees : g.aValider).push({ definition, champ: { valeur: null, verifie, sansPret: true } });
        return;
      }
      const champ = champRevision(extraction, definition.cle);
      const rempli = !!champ && champ.valeur !== null && champ.valeur !== undefined && champ.valeur !== '';
      if (!rempli && CLES_REVISION_TOUJOURS_VISIBLES.includes(definition.cle)) { g.visibles.push({ definition, champ }); return; }
      (!rempli ? g.aCompleter : champ.verifie ? g.validees : g.aValider).push({ definition, champ });
    });
    return g;
  }

  // « Tout valider » : chaque donnée pré-remplie est marquée relue, en un geste.
  function validerToutRevision() {
    if (!extractionActuelle) return;
    groupesRevision(extractionActuelle).aValider.forEach(x => basculerVerificationRevision(x.definition.cle, true, true));
    renderPanneauRevision(extractionActuelle);
  }

  function renderPanneauRevision(extraction) {
    const panneau = document.getElementById('panneau-revision');
    const rappel = document.getElementById('alertes-finalisation');
    if (!panneau) return;
    if (!extraction) {
      panneau.style.display = 'none';
      panneau.innerHTML = '';
      const carte = document.getElementById('panel');
      if (carte) carte.classList.remove('avec-revision');
      if (rappel) { rappel.style.display = 'none'; rappel.innerHTML = ''; }
      return;
    }

    const groupes = groupesRevision(extraction, typeof echeanceActive !== 'undefined' && echeanceActive.pret === false);
    const renseignees = groupes.aValider.length + groupes.validees.length;
    const verifiees = groupes.validees.length;
    etatRevision = { aValider: groupes.aValider.length, validees: verifiees, vides: groupes.aCompleter.length };
    const lignesDe = (liste) => liste.map(x => renderLigneRevision(x.definition, x.champ)).join('');

    // Parties : une ligne par côté (étude, 02/10 : moins de texte).
    const cotes = [['VENDEUR', 'Vendeur'], ['ACQUEREUR', 'Acquéreur']].map(([role, libelle]) => {
      const noms = (extraction.parties || []).filter(p => p.role === role).map(p => escapeHtml(p.nom) + (p.qualitePersonne === 'morale' ? ' <span class="revision-pastille">société</span>' : ''));
      return noms.length ? `<div class="revision-partie"><span class="revision-partie-role">${libelle}</span><span>${noms.join(', ')}</span></div>` : '';
    }).join('');
    const parties = cotes;


    const alertes = (extraction.alertes || []).map(a =>
      `<div class="revision-alerte ${a.gravite === 'critique' ? 'critique' : ''}">${icone('alert-triangle')}<span>${escapeHtml(a.message)}</span></div>`
    ).join('');

    const pourcent = renseignees ? Math.round(100 * verifiees / renseignees) : 0;
    // Une ligne toujours visible (vente préalable vide) suit « À valider », sinon « Validées », sans être comptée.
    const enPlus = groupes.visibles;
    const groupe = (titre, aide, liste, classe, supplement) => (liste.length || (supplement && supplement.length))
      ? `<div class="revision-groupe ${classe}"><div class="revision-groupe-titre">${escapeHtml(titre)} <span class="revision-groupe-nombre">${liste.length}</span>${aide ? ' ' + infoBulle(aide) : ''}</div><div class="revision-liste">${lignesDe(liste)}${supplement ? lignesDe(supplement) : ''}</div></div>`
      : '';
    panneau.innerHTML = `
      <div class="revision-entete">
        <div class="section-eyebrow">Données pré-remplies ${infoBulle("L’outil indique seulement d’où vient chaque donnée : il ne garantit rien. Relisez, corrigez directement dans le champ — la valeur part aussi dans le formulaire — puis cochez la case une fois la donnée contrôlée.")}</div>
        <div class="revision-progression">
          <span class="revision-compteur">${verifiees} / ${renseignees} validée${verifiees > 1 ? 's' : ''}</span>
          <span class="revision-barre" aria-hidden="true"><span style="width:${pourcent}%"></span></span>
          ${groupes.aValider.length ? '<button type="button" class="lien-action" onclick="validerToutRevision()">Tout valider</button>' : ''}
        </div>
      </div>
      ${alertes}
      ${parties ? `<div class="revision-parties">${parties}</div>` : ''}
      ${groupe('À valider', 'Pré-remplies depuis le compromis ou Authentic, pas encore relues.', groupes.aValider, 'a-valider', groupes.aValider.length || !groupes.validees.length ? enPlus : null)}
      ${groupe('Validées', '', groupes.validees, 'validees', groupes.aValider.length || !groupes.validees.length ? null : enPlus)}
      ${groupe('À compléter', 'Rien trouvé dans le document : les champs restent là, à remplir à la main si besoin.', groupes.aCompleter, 'a-completer')}
    `;
    panneau.style.display = 'block';
    const carte = document.getElementById('panel');
    if (carte) carte.classList.add('avec-revision');
    majStepperWizard();

    // Les alertes sont rappelées à l'étape "Finaliser", au moment d'enregistrer.
    if (rappel) {
      rappel.innerHTML = alertes;
      rappel.style.display = alertes ? 'block' : 'none';
    }
  }

  // Point d'entrée UNIQUE du recalcul : appelé après un import, après une correction de la date de
  // signature, et après un repli OCR/métadonnées — les trois endroits qui refont
  // detecterDatesDepuisTexte. En oublier un laisserait le panneau désynchronisé du formulaire.
  function recalculerExtractionRegex() {
    if (!dernierTexteTraite && !exportAuthenticActuel) { renderPanneauRevision(null); return; }
    extractionActuelle = construireExtractionRegex(dernierTexteTraite || '', dateCompromisDetectee, detectedDates, compromisNomFichierImporte);
    // Export Authentic : les données structurées complètent (et priment sur) la lecture du texte.
    if (exportAuthenticActuel) completerExtractionDepuisAuthentic(extractionActuelle, exportAuthenticActuel);
    appliquerCorrectionsRevision(extractionActuelle);
    appliquerExtractionAuFormulaire(extractionActuelle);
    renderPanneauRevision(extractionActuelle);
  }

  function creerChip(item) {
    const btnClass = (type) => 'mini-btn' + (type ? ' suggested ' + type : '');
    const chip = document.createElement('div');
    const couleur = item.suggestion ? ' chip-' + item.suggestion : '';
    chip.className = 'chip' + couleur + (item.active ? '' : ' inactive');
    const boutonVoir = (pdfActuel && item.page)
      ? `<button type="button" class="voir-pdf-btn" onclick="voirDateDansPdf(${item.page}, '${item.label.replace(/'/g, "\\'")}')">${icone('eye')} p.${item.page}</button>`
      : '';
    const badgeApprise = item.apprise
      ? `<span class="dot-label dl-neutre" title="Classé d'après une correction déjà faite sur une clause très proche — à vérifier comme toute suggestion automatique">${icone('sparkle')}Appris</span>`
      : '';
    // Date calculée (fin de mois arrondie, délai relatif) plutôt que lue telle quelle dans le
    // texte — voir ajouter() dans detecterDatesDepuisTexte. Visible dès l'étape "Vérifier", avant
    // même l'enregistrement (où le même statut réapparaît via LIBELLES_CONFIANCE.estime, même
    // libellé "Estimée" — un seul vocabulaire pour la même réalité, import et dossier enregistré).
    const badgeApprox = item.approx
      ? `<span class="dot-label dl-pret" title="Date calculée à partir d'une formulation approximative (fin de mois, délai relatif...) — à vérifier précisément"><span class="dot"></span>Estimée</span>`
      : '';
    chip.innerHTML = `
      <div class="chip-top">
        <wa-switch size="s" class="switch" ${item.active ? 'checked' : ''} onchange="toggleChipActive('${item.iso}', this.checked)"></wa-switch>
        <span class="date-text">${escapeHtml(item.label)}</span>
        ${badgeApprise}
        ${badgeApprox}
        ${boutonVoir}
      </div>
      <span class="ctx">${escapeHtml(item.contexte)}</span>
      <span class="assign-btns">
        <button type="button" class="${btnClass(item.suggestion === 'pret' ? 'pret' : null)}" onclick="assignerDate('${item.iso}','pret')">Prêt</button>
        <button type="button" class="${btnClass(item.suggestion === 'acte' ? 'acte' : null)}" onclick="assignerDate('${item.iso}','acte')">Acte</button>
        <button type="button" class="${btnClass(item.suggestion === 'ventebien' ? 'ventebien' : null)}" onclick="assignerDate('${item.iso}','ventebien')">Vente</button>
        <button type="button" class="${btnClass(item.suggestion === 'autre' ? 'autre' : null)}" onclick="ajouterAutre('${item.iso}')">Autre</button>
      </span>`;
    return chip;
  }

  function renderChips() {
    const box = document.getElementById('chips');
    box.innerHTML = '';
    if (detectedDates.length === 0) {
      box.innerHTML = '<span style="font-size:var(--texte-m);color:var(--muted);">Aucune date reconnue pour l\u2019instant.</span>';
      return;
    }

    const identifiees = detectedDates.filter(d => d.suggestion);
    const nonIdentifiees = detectedDates.filter(d => !d.suggestion);

    if (identifiees.length > 0) {
      const titre = document.createElement('div');
      titre.className = 'chips-groupe-titre';
      titre.textContent = `Classées — Prêt / Acte / Vente / Autre (${identifiees.length})`;
      box.appendChild(titre);
      const groupe = document.createElement('div');
      groupe.className = 'chips-groupe';
      identifiees.forEach(item => groupe.appendChild(creerChip(item)));
      box.appendChild(groupe);
    }

    if (nonIdentifiees.length > 0) {
      const titre = document.createElement('div');
      titre.className = 'chips-groupe-titre';
      titre.textContent = `Non identifiées, désactivées par défaut (${nonIdentifiees.length})`;
      box.appendChild(titre);
      const groupe = document.createElement('div');
      groupe.className = 'chips-groupe';
      nonIdentifiees.forEach(item => groupe.appendChild(creerChip(item)));
      box.appendChild(groupe);
    }
  }

  function toggleChipActive(iso, actif) {
    const item = detectedDates.find(d => d.iso === iso);
    if (item) item.active = actif;
    renderChips();
  }

  function assignerDate(iso, type) {
    document.getElementById('f-' + type).value = iso;
    definirEcheanceActive(type, true);
    // Si l'outil s'était trompé (ou n'avait rien deviné), le clic vaut correction : le chip
    // change de catégorie et de couleur en conséquence, au lieu de garder l'ancienne suggestion.
    const item = detectedDates.find(d => d.iso === iso);
    if (item) {
      // Mémorisé seulement si le clic change réellement quelque chose : inutile de retenir un
      // clic qui ne fait que confirmer ce que l'outil avait déjà bien deviné.
      if (item.suggestion !== type) memoriserCorrection(item.contexte, type, null);
      item.suggestion = type;
      item.active = true;
      // Un clic explicite sur un chip lève l'ambiguïté : l'utilisateur vient de trancher lui-même.
      // Le caractère approximatif de la date, lui, reste (voir ajouter() dans detecterDatesDepuisTexte) :
      // choisir la catégorie ne rend pas une date calculée plus précise.
      if (type === 'pret' || type === 'acte' || type === 'ventebien') {
        pageParType[type] = item.page;
        ambiguiteParType[type] = false;
        approxParType[type] = !!item.approx;
      }
      renderChips();
    }
  }

  // Dernier recours si le texte et l'OCR échouent tous les deux : la date d'enregistrement du
  // fichier PDF (souvent mise à jour au moment de la signature électronique) donne une estimation
  // raisonnable — comme le ferait quelqu'un consultant les propriétés du fichier faute de mieux.
  async function dateDepuisMetadonnees(pdf) {
    try {
      const meta = await pdf.getMetadata();
      const brut = (meta.info && (meta.info.ModDate || meta.info.CreationDate)) || '';
      const m = brut.match(/D:(\d{4})(\d{2})(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    } catch (e) {
      console.error('Erreur lecture métadonnées PDF', e);
    }
    return null;
  }

  // Lit une page du PDF comme une image et tente d'y reconnaître du texte (OCR), pour les
  // signatures manuscrites ou intégrées en image que l'extraction de texte ne peut pas voir.
  // Le worker (voir creerWorkerOcr) est créé une seule fois par import de PDF et réutilisé pour
  // toutes les pages à analyser, plutôt que d'être recréé à chaque page — le recréer à chaque
  // appel rechargeait inutilement le modèle de langue à chaque page (API Tesseract.js v1).
  async function ocrPage(pdf, numeroPage, worker) {
    const DELAI_MAX_OCR = 30000; // 30 s : au-delà, on abandonne plutôt que de bloquer l'interface
    try {
      const page = await pdf.getPage(numeroPage);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      // intent 'print' : pdf.js cadence sinon le dessin sur requestAnimationFrame, qui ne tourne
      // plus dans une fenêtre réduite ou cachée — la lecture d'un scan restait alors bloquée tant
      // que personne ne revenait sur CLAIRE (rangement automatique « seulement en ouvrant Scans à
      // ranger », étude, 30/09). Borné dans le temps par sécurité.
      const rendu = page.render({ canvasContext: ctx, viewport, intent: 'print' });
      const fini = await Promise.race([
        rendu.promise.then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), DELAI_MAX_OCR))
      ]);
      if (!fini) { try { rendu.cancel(); } catch (e) { /* déjà terminé */ } return ''; }
      if (!worker) return '';

      // La reconnaissance d'image peut ne jamais rendre la main (bibliothèque indisponible ou
      // bloquée) : sans garde-fou, l'attente est infinie et l'indicateur de progression tourne
      // sans fin. On borne donc l'opération dans le temps.
      const resultat = await Promise.race([
        worker.recognize(canvas),
        new Promise(resolve => setTimeout(() => resolve(null), DELAI_MAX_OCR))
      ]);
      // L'OCR lit parfois « € » comme « ¬ » (compromis scanné BOURNOUVEAU, 15/10) : le prix n'était plus reconnu.
      return (resultat && resultat.data && resultat.data.text) ? resultat.data.text.replace(/¬/g, '€') : '';
    } catch (e) {
      console.error('Erreur OCR', e);
      return '';
    }
  }

  // Crée le worker Tesseract une seule fois par import de PDF (voir traiterFichierPdf) : le modèle
  // de langue française n'est ainsi téléchargé/initialisé qu'une fois, même si plusieurs pages
  // doivent être passées à l'OCR pour retrouver la date de signature. Le tout premier chargement
  // du modèle peut être lent (téléchargement) : on lui laisse plus de temps qu'à une page unique.
  const DELAI_MAX_INIT_OCR = 45000;
  async function creerWorkerOcr() {
    if (!window.Tesseract) return null;
    try {
      return await Promise.race([
        Tesseract.createWorker('fra'),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error('délai d’initialisation OCR dépassé')), DELAI_MAX_INIT_OCR))
      ]);
    } catch (e) {
      console.error('Initialisation OCR impossible', e);
      return null;
    }
  }

  // Un simple renvoi « Annexe n°1 » au fil d'une clause (ex. LD Notaires : « Un extrait de plan
  // cadastral est annexé. Annexe n°1 », en milieu de page, au milieu du corps de l'acte) ne marque
  // PAS le début des pages d'annexes elles-mêmes : beaucoup de trames listent ainsi, dans le corps
  // même de l'acte, les pièces qui accompagnent la vente — sans que ces pièces soient jointes au
  // même PDF (cas réel signalé : le corps allait jusqu'à la signature page 52, mais l'extraction
  // s'arrêtait dès la page 6 à cause d'un renvoi de ce type page 7 — la numérotation des annexes
  // remet même à 1 plusieurs fois dans le document, une par thème). Une page qui commence
  // réellement une pièce jointe (scan de plan, diagnostic…) porte cette mention en tout début de
  // page et contient très peu d'autre texte extractible — à l'inverse d'une clause de plusieurs
  // milliers de caractères qui la cite juste en passant.
  //
  // Décision explicite de l'étude : les dates butoir (prêt/acte/vente) ne doivent JAMAIS être
  // puisées dans les annexes, uniquement dans l'avant-contrat lui-même (compromis/promesse) — le
  // motif ci-dessus (limité à "annexe n°1", chiffre obligatoire) ratait deux cas réels fréquents :
  // une page "ANNEXES" sans numéro qui introduit la liste des pièces jointes, et une pièce jointe
  // qui n'a même pas de renvoi "annexe" et ne se reconnaît qu'à son propre titre de document
  // (diagnostic, plan cadastral...). Les deux gardent le même garde-fou position/longueur.
  const RE_DEBUT_ANNEXE = /\bannexes?\b(?:\s*n[°ºo]?\s*\d+)?|\bpi[èe]ces?\s+annexe(?:s|[ée]s)?\b/i;
  const RE_TITRE_PIECE_JOINTE = /^\s*(?:dossier\s+de\s+diagnostic\s+technique|diagnostic\s+de\s+performance\s+[ée]nerg[ée]tique|[ée]tat\s+des\s+risques(?:\s+et\s+pollutions)?|constat\s+de\s+risque\s+d.exposition\s+au\s+plomb|[ée]tat\s+relatif\s+[àa]\s+la\s+pr[ée]sence\s+de\s+termites|certificat\s+d.urbanisme|r[èe]glement\s+de\s+copropri[ée]t[ée]|extrait\s+(?:du\s+)?plan\s+cadastral|proc[èe]s-verbal\s+d.assembl[ée]e\s+g[ée]n[ée]rale|[ée]tat\s+dat[ée])/i;
  // Retire le numéro de page isolé que presque toutes les trames posent en tête (« 5 », « - 12 - ») :
  // sans ça il décale tout le reste et fausse la mesure de position ci-dessous.
  function texteSansNumeroDePage(texteBrut) {
    return String(texteBrut || '').replace(/^[\s ]*[-–—]?[\s ]*\d{1,3}[\s ]*[-–—]?[\s ]*/, '');
  }

  // Le marqueur doit OUVRIR la page, pas y être cité. L'ancienne tolérance de 120 caractères était
  // trop large : sur une vraie promesse reçue par notaire, la page 5 commence par un titre court
  // suivi d'une phrase (« Plans des lots / Une copie des plans … est annexée. ANNEXE ») — le mot
  // ANNEXE, simple renvoi de fin de clause propre à cette trame, tombait dans les 120 premiers
  // caractères et coupait tout le document dès la page 4. Conséquence en cascade : ni le prix
  // (page 9) ni la condition de prêt (page 12) n'étaient plus lisibles.
  var MAX_DEBUT_PAGE_ANNEXE = 12;

  // Une page qui parle encore LA LANGUE DE L'ACTE (« aux présentes », « le VENDEUR », « le
  // PROMETTANT », « le présent acte ») est encore l'acte, jamais la première page d'une pièce
  // jointe : un document annexé — un DPE, un état des risques — ne s'adresse pas aux parties dans
  // les termes du compromis. Sans cette règle, un simple TITRE DE CLAUSE en haut de page
  // (« Diagnostic de performance énergétique », « État des risques de pollution des sols ») coupait
  // l'acte en plein milieu : trois actes du corpus perdaient ainsi leur bloc de signature, donc la
  // date qui sert d'ancre à toutes les échéances exprimées en délai — et avec elle les trois dates
  // butoir du dossier. Le titre d'une VRAIE pièce jointe, lui, reste reconnu (voir les tests).
  var RE_LANGAGE_DE_L_ACTE = /aux\s+pr[ée]sentes|les\s+pr[ée]sentes|pr[ée]sent\s+(?:acte|compromis|avant-contrat)|pr[ée]sente\s+(?:promesse|vente|convention)|\ble\s+VENDEUR\b|\bl['’]ACQU[ÉE]REUR\b|\ble\s+PROMETTANT\b|\ble\s+B[ÉE]N[ÉE]FICIAIRE\b/i;

  function estDebutPageAnnexe(texteBrut) {
    const texte = texteSansNumeroDePage(texteBrut);
    const m = texte.match(RE_DEBUT_ANNEXE) || texte.match(RE_TITRE_PIECE_JOINTE);
    if (!m) return false;
    if (RE_LANGAGE_DE_L_ACTE.test(texte)) return false;
    return m.index < MAX_DEBUT_PAGE_ANNEXE || texte.trim().length < 300;
  }

  // Bug corrigé, signalé deux fois par l'étude : ces deux motifs (annexe/titre de pièce jointe) ne
  // couvrent pas toutes les trames réelles — sans "Page X sur Y" (voir dernierePageNumerotee dans
  // extraireTextesUtiles) NI titre d'annexe reconnu, aucune coupure ne se déclenchait et le PDF
  // entier (annexes comprises, parfois des centaines de pages) était utilisé pour la détection de
  // dates. La signature de l'acte est un repère bien plus universel qu'un titre de document : quel
  // que soit le modèle, un compromis/promesse se termine TOUJOURS par un bloc de signatures avant
  // toute pièce jointe — jamais l'inverse. Repris et élargi à partir du motif déjà utilisé par
  // ailleurs (voir plus bas, repli OCR de la date de signature) pour rester cohérent.
  const RE_SIGNATURE_ACTE = /sign[ée]\s+[ée]lectroniquement|date\s+et\s+signatures?|dont\s+acte|en\s+foi\s+de\s+quoi|lu\s+et\s+approuv[ée]|bon\s+pour\s+accord|fait\s+et\s+sign[ée]|signature\s+des\s+parties|paraph[ée]\s+et\s+sign[ée]/i;
  function detecteSignatureActe(texteBrut) {
    return RE_SIGNATURE_ACTE.test(texteBrut);
  }

  // Combine les trois repères de fin d'acte trouvés en parcourant le PDF (voir
  // extraireTextesUtiles) — chacun peut manquer selon le modèle de document, mais dès qu'un seul
  // est trouvé, il vaut mieux couper trop tôt (au pire, revérifier une date à la main) que trop
  // tard (une date d'annexe glissée dans les échéances butoir, décision explicite de l'étude). Le
  // plus tôt des repères disponibles l'emporte donc systématiquement.
  function calculerDernierePageUtile(pageAnnexe, pageSignature, dernierePageNumerotee, totalPages) {
    const TAMPON_SIGNATURE = 2; // pages de certificat/signature complémentaires après le repère
    const TAMPON_NUMEROTEE = 3; // même tampon que l'ancien comportement, inchangé
    const candidats = [];
    if (pageAnnexe != null) candidats.push(Math.max(1, pageAnnexe - 1));
    if (pageSignature != null) candidats.push(Math.min(pageSignature + TAMPON_SIGNATURE, totalPages));
    if (dernierePageNumerotee != null) candidats.push(Math.min(dernierePageNumerotee + TAMPON_NUMEROTEE, totalPages));
    return candidats.length ? Math.min(...candidats) : totalPages;
  }

  // Isole le compromis lui-même (+ sa page de signatures) et s'arrête dès la première vraie page
  // d'annexe (voir estDebutPageAnnexe ci-dessus) : un dossier signé électroniquement peut compter
  // plusieurs centaines de pages de diagnostics et autres pièces jointes qui ne nous intéressent
  // ni pour la détection, ni pour l'aperçu.
  // En dessous de ce seuil, une page ne porte pas de texte extractible : c'est une IMAGE. Un
  // compromis scanné n'en porte aucun sur toutes ses pages ; un compromis électronique peut n'en
  // avoir qu'une ou deux (une page signée à la main, insérée en image).
  var MIN_CARACTERES_PAGE_TEXTE = 40;
  // Plafond de pages passées à l'OCR pour un même import. Quelques secondes par page : sans
  // plafond, un dossier scanné de plusieurs centaines de pages bloquerait l'import très longtemps.
  // La coupure au bloc de signature (voir detecteSignatureActe) intervient presque toujours avant.
  var MAX_PAGES_OCR_IMPORT = 60;

  // `options.surPage(numero, total, mode)` permet à l'appelant d'afficher où en est la lecture —
  // indispensable pour un compromis scanné, où l'OCR prend quelques secondes PAR PAGE et où un
  // import sans le moindre signe de vie passerait pour un blocage.
  async function extraireTextesUtiles(pdf, options) {
    const surPage = (options && options.surPage) || function () {};
    const textesParPage = [];
    let dernierePageNumerotee = null;
    let pageAnnexe = null;
    let pageSignature = null;
    let workerOcr = null;
    let ocrIndisponible = false;
    let pagesOcr = 0;
    let ocrPlafonne = false;
    const PLAFOND_SECURITE = 60;
    const TAMPON_SIGNATURE = 2; // doit rester cohérent avec calculerDernierePageUtile
    const totalAffiche = Math.min(pdf.numPages, PLAFOND_SECURITE * 2); // la boucle va jusqu'à 2 × le plafond (« page 120 sur 60 », 15/10)

    try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let texteBrut = content.items.map(it => it.str).join(' ');

      // Page sans texte extractible : on la lit en OCR. La boucle s'arrête d'elle-même au bloc de
      // signature des parties (voir plus bas), donc un compromis scanné est passé à l'OCR « jusqu'à
      // la signature », sans jamais entamer les annexes qui suivent — c'est exactement ce que
      // l'étude demande, et l'OCR ne servait jusqu'ici qu'à retrouver la date de signature sur
      // trois pages, ce qui laissait un compromis scanné entièrement illisible.
      if (texteBrut.trim().length < MIN_CARACTERES_PAGE_TEXTE && !ocrIndisponible) {
        if (pagesOcr >= MAX_PAGES_OCR_IMPORT) {
          ocrPlafonne = true;
        } else {
          if (!workerOcr) {
            surPage(i, totalAffiche, 'init');
            workerOcr = await creerWorkerOcr();
            if (!workerOcr) ocrIndisponible = true;
          }
          if (workerOcr) {
            surPage(i, totalAffiche, 'ocr');
            const texteOcr = await ocrPage(pdf, i, workerOcr);
            if (texteOcr && texteOcr.trim()) {
              texteBrut = texteOcr;
              pagesOcr++;
            }
          }
        }
      } else {
        surPage(i, totalAffiche, 'texte');
      }

      textesParPage.push(texteBrut);

      if (!dernierePageNumerotee) {
        const mPage = texteBrut.match(/page\s+(\d+)\s+sur\s+(\d+)/i);
        if (mPage && mPage[1] === mPage[2]) dernierePageNumerotee = i;
      }

      // Dès qu'une vraie page d'annexe commence, inutile de lire plus loin (diagnostics, plans…
      // potentiellement des centaines de pages) : c'est déjà le repère le plus tôt possible.
      if (estDebutPageAnnexe(texteBrut)) {
        pageAnnexe = i;
        break;
      }

      if (pageSignature === null && detecteSignatureActe(texteBrut)) pageSignature = i;

      // Une fois la signature de l'acte repérée, quelques pages de plus (certificat, dernière
      // signature électronique...) peuvent encore lui appartenir — au-delà, plus la peine de
      // continuer à lire un PDF qui peut compter des centaines de pages d'annexes après coup.
      if (pageSignature !== null && i >= pageSignature + TAMPON_SIGNATURE) break;

      if (i >= PLAFOND_SECURITE * 2) break; // filet de sécurité pour un document sans repère trouvé
    }
    } finally {
      // Le worker est créé une seule fois pour tout le document et libéré ici, quoi qu'il arrive :
      // le modèle de langue française n'est donc chargé qu'une fois, même sur soixante pages.
      if (workerOcr) await workerOcr.terminate();
    }

    const dernierePageUtile = calculerDernierePageUtile(pageAnnexe, pageSignature, dernierePageNumerotee, textesParPage.length);
    return { textesParPage, dernierePageUtile, pagesOcr, ocrPlafonne, ocrIndisponible };
  }

  // ---- visualiseur PDF (aperçu du compromis à côté du formulaire, en défilement continu) ----

  // Calcule, pour chaque page, l'index de fin (exclusif) de son texte dans le texte concaténé —
  // permet ensuite de retrouver sur quelle page se trouve une date détectée.
  function calculerFrontieresPages(textesParPage, dernierePageUtile) {
    const frontieres = [];
    let cumul = 0;
    for (let i = 0; i < dernierePageUtile; i++) {
      cumul += textesParPage[i].length + 1; // +1 pour le séparateur '\n'
      frontieres.push(cumul);
    }
    return frontieres;
  }

  function pageDepuisIndex(index) {
    if (!frontieresPagesActuelles) return null;
    for (let i = 0; i < frontieresPagesActuelles.length; i++) {
      if (index < frontieresPagesActuelles[i]) return i + 1;
    }
    return frontieresPagesActuelles.length || null;
  }

  // Affiche toutes les pages utiles du compromis les unes sous les autres (défilement continu).
  async function chargerToutesLesPagesPdf() {
    if (!pdfActuel) return;
    const conteneur = document.getElementById('pdf-pages-container');
    conteneur.innerHTML = '';
    masquerBoutonAjoutEngagement();
    masquerFormAjoutEngagementManuel();
    reinitialiserRecherchePdf();
    const largeurDispo = (conteneur.clientWidth || 360) - 20;

    for (let numero = 1; numero <= pdfDernierePageUtile; numero++) {
      const page = await pdfActuel.getPage(numero);
      const viewportBase = page.getViewport({ scale: 1 });
      const echelle = largeurDispo / viewportBase.width;
      const viewport = page.getViewport({ scale: echelle });

      const bloc = document.createElement('div');
      bloc.className = 'pdf-page-bloc';
      bloc.id = 'pdf-page-bloc-' + numero;

      const canvas = document.createElement('canvas');
      canvas.id = 'pdf-page-' + numero;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const legende = document.createElement('div');
      legende.className = 'pdf-page-numero';
      legende.textContent = `Page ${numero} / ${pdfDernierePageUtile}`;

      bloc.appendChild(canvas);
      bloc.appendChild(legende);
      conteneur.appendChild(bloc);

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const content = await page.getTextContent();
      construireCoucheTexte(content, viewport, bloc, canvas);
    }
  }

  // Couche de texte invisible mais sélectionnable posée par-dessus le canvas d'une page rendue —
  // permet à l'utilisateur de sélectionner une clause à la souris (comme dans un vrai lecteur PDF)
  // pour l'ajouter manuellement comme engagement du vendeur quand la détection automatique n'a rien
  // trouvé pour elle (voir gererSelectionPdf()/ajouterEngagementManuel() ci-dessous). Repose sur la
  // même transformation de position que voirDateDansPdf()/voirEngagementDansPdf() (déjà utilisée
  // pour positionner un surlignage ponctuel), appliquée ici à CHAQUE item de la page plutôt qu'à un
  // seul passage recherché après coup — une version simplifiée du TextLayerBuilder de pdf.js,
  // réécrite ici plutôt que d'en charger le module dédié (non inclus dans le seul pdf.min.js déjà
  // chargé). L'alignement horizontal (largeur réelle du glyphe vs largeur du <span>) n'a pas besoin
  // d'être pixel-parfait : seule la SÉLECTION doit correspondre au bon texte, le texte lui-même
  // reste transparent (voir .pdf-text-layer dans style.css) et n'est jamais affiché tel quel.
  function construireCoucheTexte(content, viewport, bloc, canvas) {
    const couche = document.createElement('div');
    couche.className = 'pdf-text-layer';
    couche.style.width = canvas.width + 'px';
    couche.style.height = canvas.height + 'px';
    bloc.appendChild(couche);

    content.items.forEach(item => {
      if (!item.str) return;
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const angleRad = Math.atan2(tx[1], tx[0]);
      const hauteur = Math.hypot(tx[2], tx[3]) || 1;
      const largeurCible = (item.width || 0) * (viewport.scale || 1);

      const span = document.createElement('span');
      span.textContent = item.str;
      span.style.left = tx[4] + 'px';
      span.style.top = (tx[5] - hauteur) + 'px';
      span.style.fontSize = hauteur + 'px';
      couche.appendChild(span);

      // Ajuste après coup la largeur rendue (police de repli du navigateur, pas celle du PDF) sur
      // la largeur réelle du glyphe dans le document — sans quoi la fin d'une sélection dériverait
      // de plus en plus loin de ce qui est visuellement affiché au fil d'une ligne.
      const largeurRendue = span.getBoundingClientRect().width;
      const transforme = angleRad ? `rotate(${angleRad}rad)` : '';
      if (largeurCible > 0 && largeurRendue > 0) {
        span.style.transform = `${transforme} scaleX(${largeurCible / largeurRendue})`.trim();
      } else if (transforme) {
        span.style.transform = transforme;
      }
    });
  }

  // Sélection de texte dans l'aperçu du compromis (voir construireCoucheTexte() ci-dessus) : dès
  // qu'une sélection non vide se trouve dans #pdf-pages-container, une petite barre flottante
  // propose de l'ajouter comme engagement du vendeur, catégorisé comme n'importe quel engagement
  // détecté automatiquement (entretien/travaux/document) — utile quand une clause réelle échappe
  // aux motifs de detecterEngagementsVendeur/EXCLUSION_ENGAGEMENT_RE, plutôt que de la ressaisir à
  // la main ailleurs sans aucune trace dans l'analyse juridique.
  let selectionEngagementEnCours = null;

  function gererSelectionPdf() {
    const toolbar = document.getElementById('pdf-selection-toolbar');
    if (!toolbar) return;
    const selection = window.getSelection();
    const texte = selection && !selection.isCollapsed ? selection.toString().trim() : '';
    const conteneur = document.getElementById('pdf-pages-container');
    const ancre = selection && selection.anchorNode;
    const ancreDansPdf = ancre && conteneur && conteneur.contains(ancre);

    if (!texte || !ancreDansPdf) {
      toolbar.style.display = 'none';
      selectionEngagementEnCours = null;
      return;
    }

    const noeudElement = ancre.nodeType === 1 ? ancre : ancre.parentElement;
    const blocPage = noeudElement ? noeudElement.closest('.pdf-page-bloc') : null;
    const page = blocPage ? parseInt(blocPage.id.replace('pdf-page-bloc-', ''), 10) || null : null;

    selectionEngagementEnCours = { phrase: texte.replace(/\s+/g, ' ').trim(), page };

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    toolbar.style.display = 'flex';
    toolbar.style.left = (rect.left + rect.width / 2) + 'px';
    toolbar.style.top = (rect.top - 8) + 'px';
  }

  function ajouterEngagementManuel(type) {
    if (!selectionEngagementEnCours) return;
    analyseJuridiqueActuelle.engagements.push({
      phrase: selectionEngagementEnCours.phrase,
      type,
      page: selectionEngagementEnCours.page,
      manuel: true
    });
    // Une clause sélectionnée à la main est, par définition, une clause que la détection
    // automatique (extraireEngagementsVendeur) a manquée ou n'a pas su catégoriser — on la mémorise
    // pour qu'une clause très proche soit reconnue directement au prochain import (voir
    // trouverCorrectionApprise/memoriserCorrection, catégorie 'engagement' : même mécanisme que
    // l'apprentissage déjà en place pour les dates, un espace de classification séparé).
    memoriserCorrection(selectionEngagementEnCours.phrase, type, null, 'engagement');
    completerDocumentsIdentifies(analyseJuridiqueActuelle.documents, [{ phrase: selectionEngagementEnCours.phrase, type }]);
    afficherAnalyseJuridique();
    masquerBoutonAjoutEngagement();
    afficherToast('Engagement ajouté à l’analyse juridique.', 'OK', null);
  }

  // Pendant du bouton flottant ci-dessus, mais sans dépendre d'une sélection de texte dans le PDF :
  // demandé par l'étude pour saisir un engagement qui n'apparaît pas littéralement dans l'acte
  // (accord oral rapporté, engagement verbal du vendeur...) ou simplement quand aucun PDF n'est
  // chargé pour l'instant. Toujours accessible depuis l'étape "Analyse juridique" du wizard, jamais
  // masqué par l'état vide (voir index.html) — un dossier sans aucune détection automatique doit
  // pouvoir malgré tout recevoir un engagement saisi à la main.
  function afficherFormAjoutEngagementManuel() {
    const btn = document.getElementById('ajout-engagement-manuel-btn');
    const form = document.getElementById('ajout-engagement-manuel-form');
    if (btn) btn.style.display = 'none';
    if (form) form.style.display = 'flex';
    const texte = document.getElementById('nouvel-engagement-texte');
    if (texte) texte.focus();
  }

  function masquerFormAjoutEngagementManuel() {
    const btn = document.getElementById('ajout-engagement-manuel-btn');
    const form = document.getElementById('ajout-engagement-manuel-form');
    if (btn) btn.style.display = '';
    if (form) form.style.display = 'none';
    const texte = document.getElementById('nouvel-engagement-texte');
    if (texte) texte.value = '';
  }

  function ajouterEngagementDepuisFormulaire() {
    const texteEl = document.getElementById('nouvel-engagement-texte');
    const typeEl = document.getElementById('nouvel-engagement-type');
    const texte = texteEl ? texteEl.value.trim() : '';
    if (!texte) { if (texteEl) texteEl.focus(); return; }
    const type = typeEl ? typeEl.value : 'document';
    analyseJuridiqueActuelle.engagements.push({
      phrase: texte,
      type,
      page: null,
      manuel: true
    });
    // Même principe que ajouterEngagementManuel() ci-dessus (voir son commentaire) : une clause
    // saisie ici échappe forcément à la détection automatique (elle n'a pas de PDF anchré à
    // relire), la mémoriser reste sans risque pour tout futur import dont une clause proche
    // passerait, elle, par le motif d'ancrage d'extraireEngagementsVendeur().
    memoriserCorrection(texte, type, null, 'engagement');
    completerDocumentsIdentifies(analyseJuridiqueActuelle.documents, [{ phrase: texte, type }]);
    masquerFormAjoutEngagementManuel();
    afficherAnalyseJuridique();
    afficherToast('Engagement ajouté à l’analyse juridique.', 'OK', null);
  }

  function masquerBoutonAjoutEngagement() {
    const toolbar = document.getElementById('pdf-selection-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    selectionEngagementEnCours = null;
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
  }

  // Nom conservé malgré la généralisation (voir renderEngagement) : retire désormais N'IMPORTE
  // QUEL engagement pendant l'import, pas seulement ceux ajoutés à la main — sans confirmation
  // (état pré-enregistrement, reversible en réimportant le PDF).
  function supprimerEngagementManuel(index) {
    if (!analyseJuridiqueActuelle.engagements[index]) return;
    analyseJuridiqueActuelle.engagements.splice(index, 1);
    afficherAnalyseJuridique();
  }

  // Pendant l'import (voir renderDocBadge) : retire un document identifié de l'analyse en cours,
  // sans confirmation, même logique que supprimerEngagementManuel() ci-dessus.
  function supprimerDocumentManuel(index) {
    if (!analyseJuridiqueActuelle.documents[index]) return;
    analyseJuridiqueActuelle.documents.splice(index, 1);
    afficherAnalyseJuridique();
  }

  // Fait défiler l'aperçu jusqu'à la page indiquée et surligne la date (« 5 novembre 2026 ») dans le document original
  // — le texte entier, à défaut son dernier mot (l'année).
  function voirDateDansPdf(numeroPage, texteDate) {
    const mots = String(texteDate || '').trim().split(/\s+/).filter(Boolean);
    return surlignerApercuImport(numeroPage, [texteDate, mots[mots.length - 1]]);
  }

  // Encode/décode un texte libre (guillemets, apostrophes, accents...) pour le faire transiter
  // sans risque à travers un attribut onclick="...('...')" — un essai précédent interpolait la
  // phrase directement en échappant ses apostrophes à la main (voir CLAUDE.md, "renderEngagement()
  // cherchait à surligner..." ) : tronquer APRÈS avoir échappé pouvait couper un \' en deux et
  // produire un attribut malformé. Le texte transite ici en base64, jamais interpolé tel quel :
  // aucun caractère de la phrase ne peut casser l'attribut ou l'appel JS, quel qu'il soit.
  function codifierPourAttribut(texte) {
    return btoa(unescape(encodeURIComponent(texte)));
  }
  function decoderAttribut(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  // Surligne un ENGAGEMENT (obligation ou document à fournir par le vendeur) dans l'aperçu PDF,
  // sur le même principe que voirDateDansPdf() mais adapté à une phrase complète plutôt qu'un seul
  // mot ancré (l'année d'une date) : la phrase peut être répartie sur plusieurs "items" pdf.js (un
  // par ligne/segment de mise en page), il faut donc retrouver TOUS les items concernés, pas un
  // seul. Demandé par l'étude après une première tentative abandonnée (voir CLAUDE.md) qui
  // cherchait le "dernier mot" de la phrase, une ancre bien trop peu fiable sur du texte libre.
  function voirEngagementDansPdf(numeroPage, phraseB64) {
    return surlignerApercuImport(numeroPage, [decoderAttribut(phraseB64)]);
  }

  // Recherche de texte dans l'aperçu du compromis, sur le modèle d'un vrai lecteur PDF (Ctrl+F).
  // Réutilise directement la couche de texte déjà posée par construireCoucheTexte() pour la
  // sélection manuelle — plutôt que de rappeler pdf.js (getTextContent()) à chaque frappe, ce qui
  // ré-parserait tout le document à chaque caractère tapé : les <span> sont déjà en place, déjà
  // positionnés pixel pour pixel sur le rendu, il suffit de les parcourir et de leur ajouter une
  // classe de surlignage. Insensible aux accents/majuscules (normaliserPourRecherche(), déjà
  // utilisée pour la recherche de dossiers) — "pret" retrouve aussi bien "prêt" que "PRÊT".
  let resultatsRecherchePdf = [];
  let indexResultatRecherchePdf = -1;

  function rechercherDansPdf(valeur) {
    document.querySelectorAll('.pdf-search-marque').forEach(el => {
      el.classList.remove('pdf-search-marque', 'pdf-search-marque-active');
    });
    resultatsRecherchePdf = [];
    indexResultatRecherchePdf = -1;
    const compteurEl = document.getElementById('pdf-recherche-compteur');
    const requeteNorm = normaliserPourRecherche(String(valeur || '').trim());
    if (!requeteNorm) {
      if (compteurEl) compteurEl.textContent = '';
      return;
    }

    document.querySelectorAll('#pdf-pages-container .pdf-page-bloc').forEach(bloc => {
      const couche = bloc.querySelector('.pdf-text-layer');
      if (!couche) return;
      const spans = Array.from(couche.children);
      // Texte normalisé concaténé de la page, un espace entre chaque item (comme
      // voirEngagementDansPdf()) — mémorise pour chaque caractère l'index du <span> d'origine,
      // -1 pour les espaces insérés entre deux items.
      let texte = '';
      const origines = [];
      spans.forEach((span, i) => {
        const norm = normaliserPourRecherche(span.textContent || '');
        for (const ch of norm) { texte += ch; origines.push(i); }
        texte += ' '; origines.push(-1);
      });

      let pos = texte.indexOf(requeteNorm);
      while (pos !== -1) {
        const spansConcernes = new Set();
        for (let i = pos; i < pos + requeteNorm.length && i < origines.length; i++) {
          if (origines[i] >= 0) spansConcernes.add(origines[i]);
        }
        if (spansConcernes.size > 0) {
          resultatsRecherchePdf.push({ spans: Array.from(spansConcernes).map(i => spans[i]) });
        }
        pos = texte.indexOf(requeteNorm, pos + 1);
      }
    });

    resultatsRecherchePdf.forEach(r => r.spans.forEach(s => s.classList.add('pdf-search-marque')));

    if (compteurEl) {
      compteurEl.textContent = resultatsRecherchePdf.length
        ? `1 / ${resultatsRecherchePdf.length}`
        : 'Aucun résultat';
    }
    if (resultatsRecherchePdf.length) allerResultatPdf(0);
  }

  function allerResultatPdf(index) {
    if (!resultatsRecherchePdf.length) return;
    if (index < 0) index = resultatsRecherchePdf.length - 1;
    if (index >= resultatsRecherchePdf.length) index = 0;
    document.querySelectorAll('.pdf-search-marque-active').forEach(el => {
      el.classList.remove('pdf-search-marque-active');
    });
    indexResultatRecherchePdf = index;
    const resultat = resultatsRecherchePdf[index];
    resultat.spans.forEach(s => s.classList.add('pdf-search-marque-active'));
    resultat.spans[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    const compteurEl = document.getElementById('pdf-recherche-compteur');
    if (compteurEl) compteurEl.textContent = `${index + 1} / ${resultatsRecherchePdf.length}`;
  }

  function allerResultatPdfSuivant(direction) {
    if (!resultatsRecherchePdf.length) return;
    allerResultatPdf(indexResultatRecherchePdf + direction);
  }

  // Remet la recherche PDF à zéro (nouveau document chargé, ou formulaire réinitialisé) : sans ça,
  // le champ garderait le texte/les résultats d'une recherche menée sur le PDF PRÉCÉDENT, alors que
  // les <span> qu'elle référence viennent d'être détruits par chargerToutesLesPagesPdf().
  function reinitialiserRecherchePdf() {
    resultatsRecherchePdf = [];
    indexResultatRecherchePdf = -1;
    const input = document.getElementById('pdf-recherche-input');
    if (input) input.value = '';
    const compteurEl = document.getElementById('pdf-recherche-compteur');
    if (compteurEl) compteurEl.textContent = '';
  }

  async function gererUploadPdf(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!modeImport) modeImport = 'pdf';
    // Mode « Dossier Authentic » (ou export déjà lu) : le compromis complète, Authentic est gardé.
    if (!(exportAuthenticActuel && modeImport !== 'pdf')) exportAuthenticActuel = null;
    majPiecesAuthentic();
    complementFichierNas = '';
    await traiterFichierPdf(file);
    renderChoixImport();
  }

  function gererSurvolDepot(event) {
    event.preventDefault();
    document.getElementById('pdf-dropzone').classList.add('survol');
  }

  function gererQuitteDepot(event) {
    event.preventDefault();
    document.getElementById('pdf-dropzone').classList.remove('survol');
  }

  async function gererDepotPdf(event) {
    event.preventDefault();
    document.getElementById('pdf-dropzone').classList.remove('survol');
    const fichiers = event.dataTransfer && event.dataTransfer.files;
    if (!fichiers || fichiers.length === 0) return;
    const file = fichiers[0];
    const status = document.getElementById('pdf-status');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      status.className = 'pdf-status err';
      status.textContent = /\.zip$/i.test(file.name) ? `« ${file.name} » : l’export ZIP d’Authentic n’est plus lu — choisissez « Dossier Authentic » (pages ouvertes dans Authentic).` : `« ${file.name} » n'est pas un PDF.`;
      return;
    }
    if (!modeImport) modeImport = 'pdf';
    if (!(exportAuthenticActuel && modeImport !== 'pdf')) exportAuthenticActuel = null;
    majPiecesAuthentic();
    // Synchronise le champ de fichier natif, pour rester cohérent si le formulaire est réinitialisé.
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      document.getElementById('f-pdf').files = dt.files;
    } catch (e) { /* DataTransfer non disponible sur certains navigateurs : sans conséquence */ }
    await traiterFichierPdf(file);
    renderChoixImport();
  }
