  // ==== OUTIL 2 : LECTURE DE L'ACTE LUI-MÊME (section 1 du rapport) ============================
  //
  // Objectif principal redonné par l'étude : « lire le contenu de l'acte de vente, PUIS comparer
  // avec l'avant-contrat, PUIS avec les annexes ». Trois sources, trois sections — et celle-ci ne
  // dépend d'AUCUN autre document : c'est la plus fiable du rapport, d'où sa place en tête.
  //
  // Deux choses distinctes y figurent (arbitrage explicite de l'étude) :
  //  • une FICHE D'IDENTITÉ toujours affichée, même quand tout va bien — sans elle, un rapport
  //    vide ne dit pas si l'outil a lu l'acte ou s'il l'a seulement traversé ;
  //  • les ALERTES lues dans le seul projet : ce que l'acte déclare et qui appelle une action.

  // Une clause de NON-litige est une clause de style de presque tout acte (« il n'existe à ce jour
  // aucune action ou litige en cours… ») : la retenir produirait une alerte sur chaque dossier.
  // Même piège que RE_AUCUN_TRAVAUX et que la négation de copropriété, déjà payés ici.
  var RE_AUCUN_LITIGE = /\b(?:aucun[e]?\s+(?:action|litige|proc[ée]dure|instance|contentieux)|n['’]existe\s+(?:[àa]\s+ce\s+jour\s+)?aucun|pas\s+de\s+(?:litige|proc[ée]dure|contentieux))/i;
  // Un RAPPEL de la loi (« cette contestation doit impérativement prendre la forme d'une action en
  // justice, assignation … devant le tribunal ») n'est pas une procédure en cours : il ne déclare
  // rien sur ce bien. Présent dans deux actes réels du corpus (droit de contestation en copropriété).
  var RE_PROCEDURE_NORMATIVE = /\b(?:doit|doivent|devra|devront|peut|peuvent|pourra|pourront)\b[^.]{0,80}(?:action\s+en\s+justice|assignation|proc[ée]dure|tribunal)/i;

  // Un acte notarial emploie « procédure » à tout propos (procédure de préemption, d'appel de
  // fonds, procédure de purge…) : seuls des marqueurs de VRAI contentieux sont retenus.
  var RE_PROCEDURE_EN_COURS = /\b(?:proc[ée]dure\s+en\s+cours|instance\s+en\s+cours|litige\s+en\s+cours|proc[ée]dure\s+judiciaire|proc[ée]dure\s+d['’]assignation|assignation\s+(?:du|de\s+la|des|devant)|contentieux\s+en\s+cours|expertise\s+judiciaire|devant\s+le\s+tribunal)/i;

  // Ce qui fait passer le constat de IMPORTANT à CRITIQUE : l'acquéreur reprend la procédure à son
  // compte. C'est exactement la clause de l'acte réel envoyé par l'étude (subrogation).
  var RE_CHARGE_ACQUEREUR_PROCEDURE = /\b(?:fai(?:re|t)\s+son\s+affaire\s+personnelle|subrog|se\s+substitue|reprend\s+[àa]\s+son\s+compte)/i;
  var PORTEE_CLAUSE_PROCEDURE = 1200;

  // Un document que l'acte déclare lui-même NON établi. Deux tournures notariales, le nom du
  // document venant avant ou après : « Le diagnostic technique global n'a pas été établi. » /
  // « il n'a pas été établi d'audit énergétique ».
  var RE_DOCUMENT_NON_ETABLI = /\bn['’]a\s+pas\s+[ée]t[ée]\s+(?:[ée]tabli|fourni|remis|r[ée]alis[ée]|dress[ée])|\bn['’]ont\s+pas\s+[ée]t[ée]\s+(?:[ée]tablis|fournis|remis)|\bne\s+sera\s+pas\s+(?:[ée]tabli|fourni|remis)/i;

  // … sauf quand l'acte DIT DANS LA MÊME CLAUSE pourquoi il en est dispensé (« il n'entre pas dans
  // le champ d'application… par suite il n'a pas été établi d'audit énergétique »). L'acte a déjà
  // répondu : le signaler reviendrait à poser une question sur chaque acte qui prend la peine de
  // se justifier — la clause de style, encore, comme pour les travaux et la copropriété.
  // « conformément aux dispositions de l'article… » et « ne relevant pas de… » : l'acte de vente
  // MOKADEM écarte l'audit énergétique ainsi (« étant un bâtiment… ne relevant pas du statut de la
  // copropriété… il n'a pas été établi d'audit énergétique, conformément aux dispositions de
  // l'article L 126-28-1 ») — l'absence est justifiée par le texte lui-même.
  var RE_DISPENSE_DOCUMENT = /n['’]entre\s+pas\s+dans\s+le\s+champ\s+d['’]application|non\s+soumis|n['’]est\s+pas\s+soumis|dispens[ée]|sans\s+objet|non\s+applicable|n['’]est\s+pas\s+tenu|ne\s+relevant\s+pas|conform[ée]ment\s+aux\s+dispositions/i;

  // Les contrôles de cohérence qui décrivent une CONTRADICTION DANS L'ACTE, et non une limite de
  // notre lecture. ADRESSE_INCOMPLETE et NOTAIRE_INSTRUMENTAIRE_INCERTAIN en sont volontairement
  // absents : la fiche d'identité affiche déjà ces deux lignes comme « non trouvé », en faire en
  // plus un constat dirait deux fois la même chose — la duplication que l'étude a fait retirer.
  var CODES_COHERENCE_ACTE = ['SIGNATURE_EGALE_REITERATION', 'PRET_APRES_ACTE', 'PRET_EGALE_VENTE_PREALABLE',
    'DATE_EXPLICITE_VS_DELAI', 'NOTAIRES_IDENTIQUES', 'TYPE_ACTE_VS_QUALITES', 'PRIX_CONTRADICTOIRE', 'CONTENANCE_TOTALE_INCOHERENTE', 'SIREN_INVALIDE', 'MOBILIER_SUPERIEUR_PRIX'];

  // Constats lus dans le SEUL acte principal — aucun autre document n'est nécessaire pour les
  // établir. La date du jour n'entre pas ici : rien de ce qui suit n'en dépend.
  function constatsLectureActe(texte, pages) {
    const src = String(texte || '');
    const constats = [];
    const spans = [];

    // Une plage est retenue AVANT les garde-fous, comme dans detecterTravauxRealises : une clause
    // est jugée UNE fois, quel que soit le verdict. Sans ça, une clause écartée ne laisse aucune
    // trace et un second mot déclencheur la fait rejuger sur une fenêtre décalée, qui repasse les
    // garde-fous — le bug déjà payé sur les travaux.
    const nouveau = (index, avant, apres) => {
      const p = phraseAutour(src, index, avant, apres);
      if (p.phrase.length < 25) return null;
      if (spans.some(s => p.debut < s.fin && p.fin > s.debut)) return null;
      spans.push({ debut: p.debut, fin: p.fin });
      return p;
    };

    // 1) Procédure / litige en cours déclaré dans l'acte.
    const reProc = new RegExp(RE_PROCEDURE_EN_COURS.source, 'gi');
    let m;
    while ((m = reProc.exec(src)) !== null) {
      const p = nouveau(m.index, 250, 500);
      if (!p) continue;
      if (RE_AUCUN_LITIGE.test(p.phrase)) { noterDiagnosticOutil2('procedures', 'ecartee', 'Clause de non-litige (« aucune action ou litige… »)', p.phrase, m.index); continue; }
      if (RE_PROCEDURE_NORMATIVE.test(p.phrase)) { noterDiagnosticOutil2('procedures', 'ecartee', 'Rappel de la loi, aucune procédure déclarée sur ce bien', p.phrase, m.index); continue; }
      noterDiagnosticOutil2('procedures', 'retenue', 'Retenue : procédure déclarée dans l’acte', p.phrase, m.index);
      // La phrase citée s'arrête au premier point ; or « l'ACQUEREUR s'oblige à faire son affaire
      // personnelle de cette procédure » arrive deux phrases plus loin dans l'acte réel envoyé par
      // l'étude. On CITE court et on JUGE sur la clause entière — sans cette distinction, le cas
      // le plus grave des deux ressortait au niveau le plus faible.
      const repris = RE_CHARGE_ACQUEREUR_PROCEDURE.test(src.slice(p.debut, p.debut + PORTEE_CLAUSE_PROCEDURE));
      constats.push({
        categorie: 'ACTE',
        gravite: repris ? 'CRITIQUE' : 'IMPORTANT',
        titre: repris ? 'Procédure en cours, reprise par l’acquéreur' : 'Procédure en cours déclarée dans l’acte',
        description: repris
          ? "L'acquéreur s'oblige à faire son affaire personnelle de cette procédure : vérifier qu'il en mesure la portée et que le vendeur le subroge bien dans ses droits."
          : "L'acte déclare une procédure ou un litige en cours : vérifier son objet, son état d'avancement et qui en supporte l'issue.",
        phrase: p.phrase, page: pageDepuisIndexPages(pages, p.debut)
      });
    }

    // 2) Document que l'acte déclare lui-même non établi.
    const reDoc = new RegExp(RE_DOCUMENT_NON_ETABLI.source, 'gi');
    while ((m = reDoc.exec(src)) !== null) {
      const p = nouveau(m.index, 250, 300);
      if (!p) continue;
      if (RE_DISPENSE_DOCUMENT.test(p.phrase)) { noterDiagnosticOutil2('documentsNonEtablis', 'ecartee', 'Dispense justifiée dans la même clause', p.phrase, m.index); continue; }
      noterDiagnosticOutil2('documentsNonEtablis', 'retenue', 'Retenue : document non établi sans dispense écrite', p.phrase, m.index);
      constats.push({
        categorie: 'ACTE',
        gravite: 'A_VERIFIER',
        titre: 'Document déclaré non établi par l’acte',
        description: "L'acte indique lui-même qu'un document n'a pas été établi ou fourni : vérifier s'il en est réellement dispensé, ou s'il reste à réclamer avant la signature.",
        phrase: p.phrase, page: pageDepuisIndexPages(pages, p.debut)
      });
    }

    return constats;
  }

  // Les contrôles de cohérence de l'extraction (prêt après l'acte, réitération = signature…) sont
  // EXACTEMENT une lecture de l'acte seul : leur place est dans cette section plutôt que dans un
  // panneau à part. Réutilisés tels quels, jamais recalculés.
  function constatsCoherenceActe(extraction) {
    const alertes = (extraction && extraction.alertes) || [];
    return alertes
      .filter(a => a && CODES_COHERENCE_ACTE.indexOf(a.code) !== -1)
      .map(a => ({
        categorie: 'ACTE',
        gravite: a.gravite === 'critique' ? 'CRITIQUE' : 'A_VERIFIER',
        titre: 'Incohérence dans les données de l’acte',
        description: a.message,
        phrase: '', page: null
      }));
  }

  // Fiche d'identité : ce que l'outil a compris de l'acte, TOUJOURS affiché — y compris les lignes
  // qu'il n'a pas trouvées, qui sont une information en soi. Fonction pure et testable : elle ne
  // fait que mettre en forme l'objet d'extraction déjà calculé par construireExtractionRegex, sans
  // jamais relire le texte ni compléter une valeur absente.
  function ficheActeOutil2(extraction, mode, extras) {
    if (!extraction) return [];
    const lignes = [];
    const champ = (cle) => (extraction.champs && extraction.champs[cle]) || null;
    const ajouter = (libelle, valeur, source) => {
      lignes.push({ libelle, valeur: valeur || null, page: (source && source.page) || null });
    };

    // Le type d'acte ne figure QU'EN mode « compromis ». En mode « projet de vente », c'est le
    // sélecteur de l'écran qui l'a dit, et detecterTypeActe ne connaît de toute façon que les
    // avant-contrats (TYPES_ACTE) : afficher « non trouvé » sur un acte de vente donnerait
    // l'impression d'un échec de lecture là où il n'y a rien à lire.
    if (mode !== 'acte') {
      const type = extraction.typeActe || {};
      ajouter('Type d’acte', type.valeur && type.valeur !== 'INCONNU' ? (LIBELLES_TYPE_ACTE[type.valeur] || type.valeur) : null, type.source);
    }

    // detecterParties renvoie le rôle en CAPITALES (« VENDEUR »), le vocabulaire interne de
    // l'extraction — comparer en minuscules vidait les deux lignes les plus attendues de la fiche.
    const parties = Array.isArray(extraction.parties) ? extraction.parties : [];
    const nomsPar = (role) => parties
      .filter(p => String(p.role || '').toUpperCase() === role)
      .map(p => p.nom + (p.societe && p.societe.siren ? ` (${libelleIdentiteSociete(p.societe)})` : '')).join(' & ');
    ajouter('Vendeur(s)', nomsPar('VENDEUR') || null, null);
    ajouter('Acquéreur(s)', nomsPar('ACQUEREUR') || null, null);

    // Statut des acquéreurs : toujours affiché, y compris « non trouvé » — c'est justement quand
    // il manque qu'il faut le voir, et le constat qui l'accompagne dit pourquoi.
    const statut = (extras && extras.statutAcquereurs) || null;
    const ligneStatut = statut ? libelleStatutAcquereurs(statut) : null;
    lignes.push({ libelle: 'Statut des acquéreurs', valeur: ligneStatut, page: (statut && statut.page) || null });

    const bien = extraction.bien || {};
    ajouter('Bien', (bien.adresse && bien.adresse.adresseComplete) || null, bien.source);
    const cad = bien.cadastre;
    ajouter('Cadastre', cad ? libelleCadastre(cad) : null, null);

    const prix = champ('prixVente');
    ajouter('Prix', prix && prix.valeur ? formaterPrix(prix.valeur) : null, prix && prix.source);
    // Affiché seulement quand l'acte ventile du mobilier : « non trouvé » sur chaque acte qui n'en
    // vend pas serait du bruit, l'absence de mobilier étant le cas courant.
    const mobilier = champ('prixMobilier');
    if (mobilier && mobilier.valeur) ajouter('Dont mobilier', formaterPrix(mobilier.valeur), mobilier.source);

    const not = extraction.notaires || {};
    ajouter('Notaire du vendeur', libelleNotaire(not.vendeur) || null, null);
    ajouter('Notaire de l’acquéreur', libelleNotaire(not.acquereur) || null, null);

    // Dépôt de garantie et dates butoir appartiennent à l'AVANT-CONTRAT : un acte de vente n'en
    // porte pas, et quatre lignes « non trouvé » y seraient du bruit, pas une information.
    if (mode !== 'acte') {
      const depot = champ('depotGarantie');
      ajouter('Dépôt de garantie', depot && depot.valeur ? formaterPrix(depot.valeur) : null, depot && depot.source);
      const sequestre = champ('sequestreDepot');
      ajouter('Séquestré chez', (sequestre && sequestre.valeur) || null, sequestre && sequestre.source);

      const dates = extraction.dates || {};
      const dateLigne = (cle, libelle) => {
        const d = dates[cle];
        ajouter(libelle, d && d.valeur ? formatDateFr(d.valeur) : null, d && d.source);
      };
      dateLigne('SIGNATURE_AVANT_CONTRAT', 'Signature de l’avant-contrat');
      dateLigne('BUTOIR_PRET', 'Obtention du prêt');
      dateLigne('BUTOIR_VENTE_PREALABLE', 'Vente préalable');
      dateLigne('REITERATION_ACTE', 'Date butoir de réitération');
    }

    return lignes;
  }

  function analyserProjetVenteOutil2(entree) {
    return avecJournalDiagnosticOutil2(analyserProjetVenteOutil2Interne, entree);
  }

  function analyserProjetVenteOutil2Interne(entree) {
    const aujourdHui = (entree && entree.aujourdHui) || new Date().toISOString().slice(0, 10);
    const texteAvantContrat = (entree && entree.texteAvantContrat) || '';
    const texteProjet = (entree && entree.texteProjet) || '';
    const pagesAvantContrat = (entree && entree.pagesAvantContrat) || [];
    const nomAvantContrat = (entree && entree.nomAvantContrat) || 'Avant-contrat';
    const nomProjet = (entree && entree.nomProjet) || 'Projet de vente';

    documentJournalDiagnosticOutil2(nomAvantContrat, pagesAvantContrat);
    const obligations = verifierEngagementsTenus({ ...entree, aujourdHui });
    const comparaison = (entree && entree.reference && entree.projet)
      ? comparerCompromisEtProjet(entree.reference, entree.projet) : [];
    const travaux = detecterTravauxRealises(texteAvantContrat, pagesAvantContrat, aujourdHui);
    const agsAvantContrat = detecterAssembleesGenerales(texteAvantContrat, pagesAvantContrat, null);
    documentJournalDiagnosticOutil2(nomProjet, (entree && entree.pagesProjet) || []);
    const lectureActe = constatsLectureActe(texteProjet, (entree && entree.pagesProjet) || []);
    const statutAcquereurs = detecterStatutAcquereurs(texteProjet, (entree && entree.pagesProjet) || []);
    const statutVendeur = detecterStatutVendeur(texteProjet, (entree && entree.pagesProjet) || []);
    const agsProjet = detecterAssembleesGenerales(texteProjet, (entree && entree.pagesProjet) || [], null);
    const nbAcquereurs = (((entree && entree.projet) || {}).parties || [])
      .filter(pp => String(pp.role || '').toUpperCase() === 'ACQUEREUR').length;
    const nbVendeurs = (((entree && entree.projet) || {}).parties || [])
      .filter(pp => String(pp.role || '').toUpperCase() === 'VENDEUR').length;

    // Copropriété : les deux volets s'appliquent ici, puisque l'avant-contrat EST signé et que la
    // date de vente est connue (ou, à défaut, bornée par le jour de la relecture). Les trois
    // sources sont lues : la clause « Assemblées générales » de l'avant-contrat les date, le
    // projet les reprend, et c'est le PV déposé qui dit ce qui y a été voté.
    const pagesProjet = (entree && entree.pagesProjet) || [];
    const dossierLie = (entree && entree.dossierLie) || null;
    const typeBien = typeBienPourAudit(entree);
    const estCopropriete = typeBien.type === 'copropriete';
    const deposes = (entree && entree.documentsDeposes) || [];
    const carnets = estCopropriete
      ? parDocumentJournal(deposes, doc => analyserCarnetEntretien(doc, aujourdHui)).filter(Boolean)
      : [];
    const travauxCarnet = carnets.reduce((acc, c) => acc.concat(c.travaux || []), []);
    const ags = fusionnerAssembleesGenerales([
      agsAvantContrat,
      agsProjet,
      ...parDocumentJournal(deposes, doc => detecterAssembleesGenerales(doc.texte, doc.pages || null, doc.nom))
    ]);
    const dateAvantContrat = typeof detecterDateCompromis === 'function' ? detecterDateCompromis(texteAvantContrat) : null;
    // La vente n'étant pas encore signée, sa date est celle du rendez-vous déjà pris, à défaut la
    // date butoir de l'acte. Sans dossier lié, la fenêtre reste ouverte : toute AG postérieure à
    // l'avant-contrat est alors signalée, ce qui est le comportement prudent.
    const dateVente = dossierLie ? (dossierLie.rendezVousSignature || dossierLie.acte || null) : null;

    // Mêmes analyses qu'en mode « compromis », sur les mêmes documents déposés : c'est justement
    // au moment de relire le projet de vente que l'état daté arrive, et un certificat d'urbanisme
    // périmé entre l'avant-contrat et la vente est exactement le genre de point à rattraper là.
    const etatsDates = parDocumentJournal(deposes, analyserEtatDate).filter(Boolean);
    const certificatsUrbanisme = parDocumentJournal(deposes, analyserCertificatUrbanisme).filter(Boolean);

    // Terrain à bâtir : le permis de l'acquéreur, son affichage et la purge des deux délais.
    // Branché ICI SEULEMENT, pas en mode « compromis » : à la signature de l'avant-contrat le
    // permis n'est justement pas encore demandé, et un constat « permis non fourni » sur chaque
    // compromis de terrain serait exactement le bruit que l'étude a demandé d'éviter en réduisant
    // le périmètre d'Outil 2. Le contrôle a sa place au moment de relire le projet de vente.
    const estTerrain = typeBien.type === 'terrain';
    const permis = estTerrain ? analyserDocumentsPermis((entree && entree.documentsDeposes) || []) : null;
    const purgePermis = permis ? calculerPurgePermis({
      aujourdHui,
      dateArrete: permis.permis ? permis.permis.date : null,
      dateAffichage: permis.constatAffichage ? permis.constatAffichage.date : null
    }) : null;
    const conditionPermis = RE_CONDITION_PERMIS.test(texteAvantContrat) || RE_CONDITION_PERMIS.test(texteProjet);

    const constats = []
      .concat(lectureActe)
      .concat(constatsCoherenceActe(entree && entree.projet))
      .concat(comparaison)
      .concat(constatsStatutAcquereurs(statutAcquereurs, nbAcquereurs))
      .concat(constatsConjointVendeur(statutVendeur, nbVendeurs, texteProjet))
      .concat(constatsObligationsOutil2(obligations))
      .concat(constatsTravauxNonRepris(travaux, texteProjet))
      .concat(constatsTravauxRealises(travauxCarnet, 'CARNET_ENTRETIEN'))
      .concat(constatsAssembleesGenerales({ ags, estCopropriete, dateAvantContrat, dateVente }))
      .concat(constatsEtatDate(etatsDates, aujourdHui, estCopropriete))
      .concat(constatsCertificatUrbanisme(certificatsUrbanisme, aujourdHui))
      .concat(estTerrain ? constatsPermisConstruire({ analyse: permis, purge: purgePermis, conditionPermis }) : []);

    constats.sort((a, b) => (ORDRE_GRAVITE_OUTIL2[a.gravite] ?? 9) - (ORDRE_GRAVITE_OUTIL2[b.gravite] ?? 9));

    const resume = { CRITIQUE: 0, IMPORTANT: 0, A_VERIFIER: 0, INFORMATION: 0 };
    for (const c of constats) { if (resume[c.gravite] != null) resume[c.gravite]++; }

    return { mode: 'acte', constats, resume,
      fiche: ficheActeOutil2(entree && entree.projet, 'acte', { statutAcquereurs }),
      obligations, comparaison, travaux, travauxCarnet, carnets, statutAcquereurs,
      // Distinguer « comparé, rien trouvé » de « pas comparé du tout » : sans ce drapeau, le
      // rapport affirmerait l'absence d'écart sur un audit où aucune référence n'a été fournie.
      comparaisonFaite: !!(entree && entree.reference && entree.projet),
      typeBien: typeBien.type, typeBienOrigine: typeBien.origine,
      ags, estCopropriete,
      etatsDates, certificatsUrbanisme, estTerrain, permis, purgePermis,
      questions: questionsOutil2(constats), dateAvantContrat, dateVente, aujourdHui,
      justificatifsReconnus: Object.keys(rapprocherJustificatifs((entree && entree.documentsDeposes) || [])) };
  }

  // Corrections apportées À LA MAIN entre ce que l'extraction proposait et ce qui est réellement
  // enregistré. Journalisées pour pouvoir, plus tard, mesurer où l'extraction se trompe le plus
  // souvent — JAMAIS pour réentraîner quoi que ce soit automatiquement (décision explicite de la
  // spec) : le modèle local reste figé, seules les regex sont corrigées à la main après analyse.
  function diffCorrectionsExtraction(extraction, valeursFinales) {
    if (!extraction || !valeursFinales) return [];
    const finales = valeursFinales;
    const typeActe = extraction.typeActe ? extraction.typeActe.valeur : 'INCONNU';
    const adresse = (extraction.bien && extraction.bien.adresse) || null;
    const dates = extraction.dates || {};
    const champs = extraction.champs || {};
    const proposees = {
      nom: (champs.nom && champs.nom.valeur) || null,
      prixVente: (champs.prixVente && champs.prixVente.valeur) || null,
      prixMobilier: (champs.prixMobilier && champs.prixMobilier.valeur) || null,
      emailAcquereur: (champs.emailAcquereur && champs.emailAcquereur.valeur) || null,
      emailVendeur: (champs.emailVendeur && champs.emailVendeur.valeur) || null,
      nomAgence: (champs.nomAgence && champs.nomAgence.valeur) || null,
      honorairesAgence: (champs.honorairesAgence && champs.honorairesAgence.valeur) || null,
      depotGarantie: (champs.depotGarantie && champs.depotGarantie.valeur) || null,
      sequestreDepot: (champs.sequestreDepot && champs.sequestreDepot.valeur) || null,
      adresseBien: adresse ? (adresse.adresseComplete || null) : null,
      roleNotaire: (extraction.notaires && extraction.notaires.roleEtude) || null
    };
    // Notaires lus dans l'acte (étude, 02/10 : données du dossier dans le panneau) ; un nom complété par
    // le carnet n'est pas une correction.
    const cotesLus = cotesNotairesPourDossier(extraction.notaires);
    const completer = (n) => (n ? (typeof completerNomNotaire === 'function' ? completerNomNotaire(n, typeof carnetConfreres !== 'undefined' ? carnetConfreres : []) : n) : null);
    if ('notaireVendeur' in finales) proposees.notaireVendeur = completer(cotesLus.vendeur);
    if ('notaireAcquereur' in finales) proposees.notaireAcquereur = completer(cotesLus.acquereur);
    for (const typeDate of Object.keys(CHAMP_PAR_TYPE_DATE)) {
      proposees[CHAMP_PAR_TYPE_DATE[typeDate]] = (dates[typeDate] && dates[typeDate].valeur) || null;
    }

    const entrees = [];
    for (const champ of Object.keys(proposees)) {
      const extraite = proposees[champ];
      const finale = finales[champ] === undefined || finales[champ] === '' ? null : finales[champ];
      // Rien à apprendre d'un champ que l'extraction n'a pas trouvé ET que personne n'a rempli.
      if (extraite === null && finale === null) continue;
      if (String(extraite) === String(finale)) continue;
      const objetChamp = champs[champ] || dates[Object.keys(CHAMP_PAR_TYPE_DATE).find(t => CHAMP_PAR_TYPE_DATE[t] === champ)] || null;
      entrees.push({
        champ,
        valeurExtraite: extraite,
        valeurCorrigee: finale,
        origine: (objetChamp && objetChamp.origine) || 'regex',
        statutExtrait: (objetChamp && objetChamp.statut) || 'NOT_FOUND',
        typeActe,
        extrait: (objetChamp && objetChamp.source && objetChamp.source.extrait) ? String(objetChamp.source.extrait).slice(0, 200) : null,
        date: new Date().toISOString()
      });
    }
    return entrees;
  }

  // Libellés lisibles pour le panneau « Qualité de l'extraction » (voir renderQualiteExtraction),
  // mêmes clés que celles produites par diffCorrectionsExtraction() ci-dessus.
  var LIBELLES_CHAMPS_CORRECTION = {
    nom: 'Nom du dossier', adresseBien: 'Adresse du bien', prixVente: 'Prix de vente', prixMobilier: 'Mobilier compris dans le prix',
    emailAcquereur: 'Email de l’acquéreur', emailVendeur: 'Email du vendeur', roleNotaire: 'Rôle de l’étude',
    pret: 'Obtention du prêt', acte: 'Réitération de l’acte', ventebien: 'Vente préalable',
    nomAgence: 'Agence immobilière', honorairesAgence: 'Honoraires d’agence TTC', depotGarantie: 'Dépôt de garantie', sequestreDepot: 'Dépôt versé à',
    notaireVendeur: 'Notaire du vendeur', notaireAcquereur: 'Notaire de l’acquéreur'
  };

  // Agrège le journal des corrections par champ, du plus corrigé au moins corrigé — c'est ce qui
  // manquait pour EXPLOITER journalCorrectionsExtraction (voir sa déclaration plus bas) : jusqu'ici
  // il grossissait silencieusement depuis le premier dossier créé, sans que l'étude ait aucun moyen
  // de savoir quels champs l'extraction rate le plus souvent, sinon en resignalant chaque cas au
  // fil de l'eau. Fonction PURE et testable : ne fait qu'agréger un tableau, aucun effet de bord.
  function statistiquesCorrectionsExtraction(journal) {
    const liste = Array.isArray(journal) ? journal : [];
    const parChamp = {};
    for (const entree of liste) {
      if (!entree || typeof entree.champ !== 'string') continue;
      const groupe = parChamp[entree.champ] || (parChamp[entree.champ] = { champ: entree.champ, nombre: 0, dernier: null });
      groupe.nombre++;
      // Le journal est alimenté dans l'ordre chronologique (push en fin de tableau, voir
      // journaliserCorrectionsExtraction) : la dernière entrée rencontrée pour ce champ est donc la
      // plus récente, pas besoin de comparer des dates pour le savoir.
      groupe.dernier = entree;
    }
    return Object.values(parChamp).sort((a, b) => b.nombre - a.nombre);
  }

  // Assainissement à l'import d'une sauvegarde JSON : on conserve ces objets s'ils ont la bonne
  // forme, sinon on repart de rien plutôt que de propager une structure inattendue dans le rendu.
  // Une identité de société importée d'une sauvegarde : seuls les champs connus, typés.
  function societePersistable(soc) {
    if (!soc || typeof soc !== 'object' || Array.isArray(soc)) return null;
    const texte = (v) => (typeof v === 'string' && v.trim()) ? v.trim().slice(0, 200) : null;
    const siren = typeof soc.siren === 'string' && /^\d{9}$/.test(soc.siren) ? soc.siren : null;
    const r = { siren, sirenValide: siren ? sirenValide(siren) : null, rcs: texte(soc.rcs), siege: texte(soc.siege),
      capital: Number.isFinite(soc.capital) ? soc.capital : null };
    return (r.siren || r.rcs || r.siege || r.capital != null) ? r : null;
  }

  function normaliserExtractionImportee(d) {
    const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
    const source = objet(d) || {};
    const typeActe = objet(source.typeActe);
    const notaires = objet(source.notaires);
    const bien = objet(source.bien);
    const extraction = objet(source.extraction);
    const adresse = bien ? objet(bien.adresse) : null;
    return {
      typeActe: typeActe && TYPES_ACTE.indexOf(typeActe.valeur) !== -1
        ? { valeur: typeActe.valeur, statut: typeof typeActe.statut === 'string' ? typeActe.statut : 'NOT_FOUND' }
        : null,
      parties: Array.isArray(source.parties)
        ? source.parties.filter(p => p && typeof p === 'object' && typeof p.nom === 'string' && (p.role === 'VENDEUR' || p.role === 'ACQUEREUR' || p.role === 'PARTIE'))
            .map(p => ({
              nom: p.nom,
              qualiteActe: typeof p.qualiteActe === 'string' ? p.qualiteActe : '',
              role: p.role,
              qualitePersonne: p.qualitePersonne === 'morale' ? 'morale' : 'physique',
              representant: typeof p.representant === 'string' ? p.representant : null,
              societe: societePersistable(p.societe),
              ...(typeof p.nomUsage === 'string' && p.nomUsage ? { nomUsage: p.nomUsage.slice(0, 80) } : {}),
              ...(situationMatrimonialePersistable(p.situationMatrimoniale) ? { situationMatrimoniale: situationMatrimonialePersistable(p.situationMatrimoniale) } : {})
            }))
        : [],
      notaires: notaires
        ? {
          vendeur: notairePersistable(objet(notaires.vendeur)),
          acquereur: notairePersistable(objet(notaires.acquereur)),
          instrumentaire: notairePersistable(objet(notaires.instrumentaire)),
          participant: notairePersistable(objet(notaires.participant)),
          statut: typeof notaires.statut === 'string' ? notaires.statut : 'NOT_FOUND',
          raison: typeof notaires.raison === 'string' ? notaires.raison : '',
          roleEtude: (notaires.roleEtude === 'instrumentaire' || notaires.roleEtude === 'participant') ? notaires.roleEtude : null
        }
        : null,
      bien: bien
        ? { adresse: adresse || null, cadastre: objet(bien.cadastre) }
        : null,
      extraction: extraction
        ? {
          version: Number.isInteger(extraction.version) ? extraction.version : 1,
          dateImport: typeof extraction.dateImport === 'string' ? extraction.dateImport : null,
          champs: objet(extraction.champs) || {},
          alertes: Array.isArray(extraction.alertes)
            ? extraction.alertes.filter(a => a && typeof a === 'object' && typeof a.message === 'string')
                .map(a => ({ code: String(a.code || ''), gravite: String(a.gravite || 'info'), message: a.message }))
            : []
        }
        : null
    };
  }

  // ==== EXTRACTION STRUCTURÉE : localisation d'un extrait dans le texte ====
  //
  // Pierre angulaire de la vérification des réponses du modèle IA local : plutôt que de faire
  // confiance à un score de "confidence" qu'un llama 8B produit sans calibration, on vérifie que
  // l'extrait qu'il cite existe LITTÉRALEMENT dans le texte du PDF. Trouvé → on en déduit la page
  // (pageDepuisIndex) et la donnée passe CONFIRMED ; introuvable → NEEDS_REVIEW, quel que soit
  // l'aplomb du modèle. Extraite ici (elle vivait imbriquée dans voirEngagementDansPdf) pour être
  // partagée, testable, et renforcée : accents et apostrophes typographiques sont désormais
  // neutralisés, le texte d'un PDF étant systématiquement bruité de ce côté.
  function normaliserAvecIndex(s) {
    let res = '';
    const idx = [];
    let dernierEspace = true;
    const source = String(s || '');
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (/\s/.test(c)) {
        if (!dernierEspace) { res += ' '; idx.push(i); dernierEspace = true; }
        continue;
      }
      let normalise = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (/['’‘´`]/.test(normalise)) normalise = "'";
      if (/[-–—]/.test(normalise)) normalise = '-';
      // Un caractère peut donner 0 (marque combinante isolée) ou plusieurs caractères : on pousse
      // un index par caractère PRODUIT, sinon la table de correspondance se décale.
      for (const ch of normalise) { res += ch; idx.push(i); }
      if (normalise.length > 0) dernierEspace = false;
    }
    return { texte: res, index: idx };
  }

  // Retrouve la position d'un extrait cité dans le texte d'origine, ou -1. Le préfixe testé est
  // réduit par paliers : un extrait peut différer légèrement de la mise en page réelle (césure,
  // espace insécable), sans pour autant être inventé.
  function localiserExtrait(texte, extrait) {
    if (!texte || !extrait) return -1;
    const source = normaliserAvecIndex(texte);
    const cible = normaliserAvecIndex(extrait).texte.trim();
    // Trop court pour constituer une preuve : « le 15 » se retrouverait partout.
    if (cible.length < 12) return -1;
    let longueur = Math.min(80, cible.length);
    const longueurMin = Math.max(12, Math.min(20, cible.length));
    let pos = -1;
    while (pos === -1 && longueur >= longueurMin) {
      pos = source.texte.indexOf(cible.slice(0, longueur));
      if (pos === -1) longueur -= 10;
    }
    return pos === -1 ? -1 : source.index[pos];
  }
