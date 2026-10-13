  // ==== OUTIL 2 v3 : RELECTURE PAR CLAUDE — GRILLE, PIÈCES, PSEUDONYMISATION (fonctions pures) ====
  //
  // Le « cœur » porté du prototype « Notariat IA » fourni par l'étude (24/09/2026) : une GRILLE DE
  // VÉRIFICATION explicite injectée dans le prompt (plutôt qu'une recherche d'« anomalies » laissée
  // à l'appréciation du modèle), un texte PSEUDONYMISÉ avant tout envoi, une sortie STRUCTURÉE, puis
  // la ré-identification locale. Adaptations à CLAIRE :
  //   • la grille couvre aussi le projet d'acte de vente (concordance avec l'avant-contrat,
  //     engagements du vendeur tenus, situation hypothécaire…) — chaque point dit dans quel mode il
  //     s'applique ;
  //   • la pseudonymisation se fait DANS LE NAVIGATEUR, page par page, avec une table commune à tous
  //     les documents (un même nom = un même jeton partout, ce qui laisse Claude repérer une
  //     incohérence entre deux actes sans connaître la valeur) ; la table ne quitte jamais ce poste ;
  //   • les noms des parties et des notaires lus par nos propres règles (detecterParties,
  //     detecterNotaires) sont masqués EN PLUS des motifs du prototype, qui ne voyaient un nom que
  //     précédé d'une civilité (« les époux DUPONT » lui échappait).
  //
  // Cadre retenu (guide IEJ/CSN « Introduction à l'intelligence artificielle », déc. 2025) : secret
  // professionnel → pseudonymisation locale avant tout envoi ; le notaire garde la main → chaque
  // point est une proposition vérifiable, citée page à l'appui ; archivage des requêtes → le
  // serveur conserve la requête pseudonymisée (voir server/src/routes/relectureClaude.js).

  // Grille de relecture. Reprise point par point du prototype (diagnostics, copropriété ALUR,
  // délais et clauses, urbanisme et servitudes, volet financier), complétée de ce que CLAIRE
  // contrôlait déjà et de ce qu'exige un projet d'acte de vente. `modes` : 'compromis' (projet
  // d'avant-contrat) et/ou 'acte' (projet d'acte de vente). À tenir à jour ici SEULEMENT : le
  // serveur reçoit la grille filtrée, le tableau de bord la relit pour ses libellés.
  var SECTIONS_GRILLE_OUTIL2 = [
    { cle: 'parties', titre: 'Parties et capacité' },
    { cle: 'bien', titre: 'Bien et désignation' },
    { cle: 'avant_contrat', titre: "Concordance avec l'avant-contrat" },
    { cle: 'diagnostics', titre: 'Diagnostics techniques (DDT)' },
    { cle: 'copropriete', titre: 'Copropriété — loi ALUR' },
    { cle: 'delais', titre: 'Délais et clauses' },
    { cle: 'urbanisme', titre: 'Urbanisme et servitudes' },
    { cle: 'financier', titre: 'Volet financier' }
  ];

  var GRILLE_RELECTURE_OUTIL2 = [
    // Parties et capacité
    { id: 'identite_parties', section: 'parties', intitule: "Identification complète de chaque partie (état civil, domicile), identique d'un document à l'autre", declencheur: 'Toujours', modes: ['compromis', 'acte'] },
    { id: 'capacite_regime', section: 'parties', intitule: 'Capacité et pouvoirs : régime matrimonial ou PACS, consentement du conjoint sur le logement familial, représentation, protection', declencheur: 'Toujours', base_legale: 'C. civ. art. 215', modes: ['compromis', 'acte'] },
    { id: 'notaire_redacteur', section: 'parties', intitule: "Notaire rédacteur de l'acte et, le cas échéant, notaire en participation ou en concours", declencheur: 'Toujours', modes: ['compromis', 'acte'],
      consigne: "Nomme le notaire rédacteur (celui qui reçoit l'acte) et le notaire qui intervient en participation ou en concours pour l'autre partie, avec la citation qui les désigne." },
    { id: 'quotites', section: 'parties', intitule: "Quotités d'acquisition en cas de pluralité d'acquéreurs ; déclaration d'emploi ou de remploi", declencheur: "Plusieurs acquéreurs, ou acquéreur marié achetant seul", modes: ['compromis', 'acte'],
      consigne: {
        compromis: "Sur un avant-contrat c'est sans incidence immédiate : si des quotités sont exprimées, indique-les telles quelles (statut « present ») ; sinon, rappelle seulement qu'elles devront être précisées dans l'acte authentique (statut « a_verifier », jamais « absent »).",
        acte: "Indique les quotités exprimées pour chaque acquéreur et leur concordance avec l'avant-contrat ; signale une déclaration d'emploi ou de remploi attendue et absente."
      } },
    // Bien et désignation
    { id: 'designation_bien', section: 'bien', intitule: 'Désignation du bien et références cadastrales, cohérentes entre le corps de l\'acte et les annexes', declencheur: 'Toujours', modes: ['compromis', 'acte'],
      consigne: "Compare la superficie privative (Carrez) du corps de l'acte à celle de l'attestation de mesurage et du titre : donne les deux valeurs et l'écart en pourcentage. Un écart de plus de 5 % est un point important (action en diminution du prix) ; en deçà, simple mention." },
    { id: 'origine_propriete', section: 'bien', intitule: 'Origine de propriété du bien mentionnée', declencheur: 'Toujours', modes: ['compromis', 'acte'] },
    { id: 'occupation', section: 'bien', intitule: "Situation d'occupation (libre ou loué), bail et congé le cas échéant", declencheur: 'Toujours', modes: ['compromis', 'acte'] },
    { id: 'situation_hypothecaire', section: 'bien', intitule: 'Situation hypothécaire : inscriptions révélées et mainlevées à obtenir', declencheur: "Projet d'acte de vente", modes: ['acte'] },
    // Concordance avec l'avant-contrat (projet d'acte de vente)
    { id: 'concordance_parties_prix', section: 'avant_contrat', intitule: "Parties, prix et modalités de paiement identiques à l'avant-contrat, ou écart expliqué", declencheur: 'Avant-contrat fourni', modes: ['acte'] },
    { id: 'concordance_bien', section: 'avant_contrat', intitule: "Désignation, lots et cadastre identiques à l'avant-contrat", declencheur: 'Avant-contrat fourni', modes: ['acte'] },
    { id: 'conditions_levees', section: 'avant_contrat', intitule: "Conditions suspensives de l'avant-contrat réalisées ou levées, et constatées dans l'acte", declencheur: 'Avant-contrat fourni', modes: ['acte'] },
    { id: 'engagements_vendeur', section: 'avant_contrat', intitule: "Engagements du vendeur pris dans l'avant-contrat (travaux, documents, entretiens) tenus et justifiés", declencheur: "L'avant-contrat comporte des engagements du vendeur", modes: ['acte'] },
    // Diagnostics techniques (prototype)
    { id: 'dpe', types: ['maison', 'copropriete'], section: 'diagnostics', intitule: 'Diagnostic de performance énergétique (DPE)', declencheur: 'Tous les biens', base_legale: 'Validité 10 ans', modes: ['compromis', 'acte'],
      consigne: "S'il y a plusieurs DPE au dossier, dis-le et cite chacun avec sa date ; indique celui que vise l'acte et retiens le plus récent comme référence." },
    { id: 'amiante', types: ['maison', 'copropriete'], section: 'diagnostics', intitule: 'Diagnostic amiante', declencheur: 'Permis de construire délivré avant le 01/07/1997', modes: ['compromis', 'acte'],
      consigne: "Si l'acte déclare le bien non soumis au repérage amiante, vérifie-le contre la date du permis de construire quand elle figure dans les documents (antérieur au 1er juillet 1997 : repérage exigé) et signale toute contradiction ; sinon, la déclaration répond au point." },
    { id: 'plomb', types: ['maison', 'copropriete'], section: 'diagnostics', intitule: "Constat de risque d'exposition au plomb (CREP)", declencheur: 'Construction antérieure au 01/01/1949', modes: ['compromis', 'acte'],
      consigne: "Si l'acte déclare le bien non soumis au CREP, vérifie-le contre la date de construction quand elle figure dans les documents (antérieure au 1er janvier 1949 : CREP exigé) et signale toute contradiction ; sinon, la déclaration répond au point." },
    { id: 'electricite', types: ['maison', 'copropriete'], section: 'diagnostics', intitule: 'Diagnostic électricité', declencheur: 'Installation intérieure de plus de 15 ans', base_legale: 'Validité 3 ans', modes: ['compromis', 'acte'],
      consigne: "Des anomalies relevées sur un bien vendu en l'état sont à surveiller (« a_verifier »), jamais un point critique, sauf si l'acte met leur levée à la charge du vendeur." },
    { id: 'gaz', types: ['maison', 'copropriete'], section: 'diagnostics', intitule: 'Diagnostic gaz', declencheur: 'Installation intérieure de plus de 15 ans', base_legale: 'Validité 3 ans', modes: ['compromis', 'acte'],
      consigne: "Des anomalies relevées sur un bien vendu en l'état sont à surveiller (« a_verifier »), jamais un point critique, sauf si l'acte met leur levée à la charge du vendeur." },
    { id: 'termites', types: ['maison', 'copropriete'], section: 'diagnostics', intitule: 'État relatif à la présence de termites', declencheur: 'Zone à risque définie par arrêté préfectoral', base_legale: 'Validité 6 mois', modes: ['compromis', 'acte'],
      consigne: "Lis d'abord les clauses : si l'acte déclare le bien hors d'une zone contaminée ou susceptible de l'être, aucun état termites n'est exigé — statut « non_applicable », en citant la clause. Jamais d'anomalie « diagnostic termites manquant » en plus de ce point." },
    { id: 'erp', section: 'diagnostics', intitule: 'État des risques et pollutions (ERP)', declencheur: 'Tous les biens', base_legale: 'Validité 6 mois', modes: ['compromis', 'acte'] },
    { id: 'assainissement', types: ['maison', 'copropriete'], section: 'diagnostics', intitule: 'Diagnostic assainissement non collectif', declencheur: "Bien non raccordé au tout-à-l'égout", base_legale: 'Validité 3 ans', modes: ['compromis', 'acte'] },
    { id: 'carrez', types: ['copropriete'], section: 'diagnostics', intitule: 'Mesurage loi Carrez', declencheur: 'Lot de copropriété de plus de 8 m²', modes: ['compromis', 'acte'] },
    { id: 'merule', types: ['maison', 'copropriete'], section: 'diagnostics', intitule: 'Information mérule', declencheur: 'Zone concernée par un arrêté préfectoral', modes: ['compromis', 'acte'] },
    { id: 'ddt_recapitulatif', section: 'diagnostics', intitule: 'Récapitulatif des diagnostics : chacun avec sa date, valable, périmé ou manquant', declencheur: 'Toujours', modes: ['compromis', 'acte'],
      consigne: "Liste chaque diagnostic du dossier sous la forme « nom — date — valable / périmé / date non trouvée », puis ceux qui manquent alors que leur déclencheur s'applique. Juge la validité à la date prévue pour la signature de l'acte authentique." },
    { id: 'bruit', section: 'diagnostics', intitule: "Information bruit (plan d'exposition au bruit)", declencheur: "Bien situé en zone de bruit d'aérodrome", modes: ['compromis', 'acte'] },
    // Copropriété — loi ALUR (prototype) + plusieurs copropriétés + travaux votés
    { id: 'copro_multiples', section: 'copropriete', intitule: 'Chaque copropriété identifiée séparément (syndic, règlement, lots) quand l\'acte porte sur des lots de plusieurs copropriétés', declencheur: 'Bien en copropriété', modes: ['compromis', 'acte'], copro: true },
    { id: 'alur_reglement', section: 'copropriete', intitule: 'Règlement de copropriété et état descriptif de division (et modificatifs publiés)', declencheur: 'Bien en copropriété', modes: ['compromis', 'acte'], copro: true },
    { id: 'alur_pv_ag', section: 'copropriete', intitule: 'Procès-verbaux des 3 dernières assemblées générales ; date de la dernière et de la prochaine assemblée', declencheur: 'Bien en copropriété', modes: ['compromis', 'acte'], copro: true,
      consigne: "Donne la date de la dernière assemblée générale et celle de la prochaine si elle est connue. Relève chaque résolution qui concerne le lot vendu ou l'acquéreur (travaux, usage des lots, location, modification du règlement, procédure) avec son numéro et sa page." },
    { id: 'alur_travaux_votes', section: 'copropriete', intitule: 'Travaux votés en assemblée générale et répartition vendeur / acquéreur des appels de fonds', declencheur: 'Bien en copropriété', base_legale: 'Loi 10/07/1965 art. 6-2 (décret)', modes: ['compromis', 'acte'], copro: true },
    { id: 'alur_carnet_entretien', section: 'copropriete', intitule: "Carnet d'entretien de l'immeuble", declencheur: 'Bien en copropriété', modes: ['compromis', 'acte'], copro: true },
    { id: 'alur_fiche_synthetique', section: 'copropriete', intitule: 'Fiche synthétique de copropriété', declencheur: 'Bien en copropriété', modes: ['compromis', 'acte'], copro: true },
    { id: 'alur_charges', section: 'copropriete', intitule: 'Pré-état daté ou état daté : charges courantes et hors budget, sommes dues par le vendeur, sommes à la charge de l\'acquéreur', declencheur: 'Bien en copropriété', modes: ['compromis', 'acte'], copro: true,
      consigne: "Analyse le pré-état daté (ou l'état daté) rubrique par rubrique et donne les montants : budget prévisionnel et charges annuelles du lot, sommes restant dues par le vendeur, provisions et travaux déjà appelés, avances, emprunt du syndicat. Un pré-état daté n'est pas l'état daté : rappelle qu'il faudra le demander pour l'acte." },
    { id: 'alur_impayes', section: 'copropriete', intitule: 'Santé financière de la copropriété : impayés de charges du syndicat, dettes fournisseurs, procédures en cours', declencheur: 'Bien en copropriété', modes: ['compromis', 'acte'], copro: true,
      consigne: "Donne les chiffres (impayés globaux, dettes fournisseurs, rapportés au budget si possible) et conclus en une phrase sur la santé financière du syndicat ; signale toute procédure en cours." },
    { id: 'alur_travaux_copro', section: 'copropriete', intitule: 'Travaux de la copropriété réalisés ou à réaliser (votés, envisagés, devis, plan pluriannuel)', declencheur: 'Bien en copropriété', modes: ['compromis', 'acte'], copro: true,
      consigne: "Liste les travaux de la copropriété déjà réalisés, votés, envisagés ou devisés, avec leur montant et la quote-part du lot quand elle figure ; précise qui les supportera entre vendeur et acquéreur." },
    { id: 'alur_fonds_travaux', section: 'copropriete', intitule: "Fonds de travaux : montant, part du lot, et remboursement ou non par l'acquéreur au vendeur", declencheur: 'Bien en copropriété', modes: ['compromis', 'acte'], copro: true,
      consigne: "Le fonds de travaux reste attaché au lot : dis si l'acte prévoit que l'acquéreur rembourse au vendeur sa quote-part (et le montant), ou qu'il n'y a pas de remboursement ; si l'acte ne le dit pas, statut « a_verifier »." },
    { id: 'alur_dtg', section: 'copropriete', intitule: 'Diagnostic technique global (DTG) / plan pluriannuel de travaux', declencheur: 'Immeuble de plus de 10 ans, si réalisé ou voté', modes: ['compromis', 'acte'], copro: true },
    // Délais et clauses (prototype, adaptés au mode)
    { id: 'retractation', section: 'delais', intitule: 'Délai légal de rétractation de 10 jours (acquéreur non professionnel) et point de départ identifiable', declencheur: 'Acquéreur non professionnel', base_legale: 'CCH art. L271-1', modes: ['compromis'] },
    { id: 'condition_pret', section: 'delais', intitule: "Condition suspensive d'obtention de prêt : montant, taux plafond, durée, délai de réalisation", declencheur: 'Financement par crédit immobilier', base_legale: 'C. conso. art. L313-41', modes: ['compromis'] },
    { id: 'pret_obtenu', section: 'delais', intitule: 'Prêt obtenu : offre acceptée, prêteur, montant et garanties (hypothèque, privilège, caution) cohérents avec l\'acte', declencheur: 'Financement par crédit immobilier', modes: ['acte'] },
    { id: 'clause_penale_dedit', section: 'delais', intitule: 'Clause pénale ou clause de dédit clairement identifiée, avec montant', declencheur: 'Tous les avant-contrats', modes: ['compromis'] },
    { id: 'purge_preemption', section: 'delais', intitule: 'Purge du droit de préemption (urbain, SAFER, locataire ou autre)', declencheur: 'Selon nature et localisation du bien', modes: ['compromis', 'acte'] },
    { id: 'date_acte_authentique', section: 'delais', intitule: "Date limite de signature de l'acte authentique cohérente avec les autres délais", declencheur: 'Tous les avant-contrats', modes: ['compromis'],
      consigne: "Seules comptent les dates de l'avant-contrat : ne tiens aucun compte de celles du mandat de vente ni de l'offre d'achat de l'agence. Une date encore « à définir » ou en blanc : statut « a_verifier », jamais « absent » — et pas d'anomalie en plus sur le même sujet." },
    // Urbanisme et servitudes (prototype)
    { id: 'situation_urbanisme', section: 'urbanisme', intitule: "Situation au regard des règles d'urbanisme (certificat d'urbanisme, zonage, alignement, protection du patrimoine)", declencheur: 'Toujours', modes: ['compromis', 'acte'],
      consigne: "Relève le zonage et toute servitude d'utilité publique citée : abords d'un monument historique (AC1), avis de l'architecte des Bâtiments de France, site patrimonial remarquable. Ne suppose jamais leur absence — aucune base extérieure n'est consultée." },
    // Terrain à bâtir : ce qui remplace les diagnostics du bâti
    { id: 'terrain_constructibilite', types: ['terrain'], section: 'urbanisme', intitule: 'Constructibilité : zonage, certificat d\'urbanisme opérationnel, lotissement (autorisation, règlement, cahier des charges)', declencheur: 'Terrain à bâtir', modes: ['compromis', 'acte'] },
    { id: 'terrain_bornage', types: ['terrain'], section: 'bien', intitule: 'Bornage et superficie du terrain', declencheur: 'Terrain à bâtir', base_legale: 'C. urb. L115-4 (lotissement)', modes: ['compromis', 'acte'],
      consigne: "Dis si un bornage a été réalisé (géomètre, date) et si la superficie est garantie ; en lotissement, le bornage est obligatoire." },
    { id: 'terrain_viabilisation', types: ['terrain'], section: 'bien', intitule: 'Viabilisation : raccordements (eau, électricité, assainissement, voirie) et leur prise en charge', declencheur: 'Terrain à bâtir', modes: ['compromis', 'acte'] },
    { id: 'terrain_etude_sol', types: ['terrain'], section: 'diagnostics', intitule: "Étude géotechnique préalable (retrait-gonflement des argiles)", declencheur: "Zone d'exposition moyenne ou forte", base_legale: 'CCH L112-21', modes: ['compromis', 'acte'] },
    { id: 'terrain_permis', types: ['terrain'], section: 'delais', intitule: "Condition suspensive d'obtention du permis de construire : délai, purge du recours des tiers et du retrait", declencheur: 'Terrain à bâtir', modes: ['compromis'] },
    { id: 'terrain_permis_purge', types: ['terrain'], section: 'urbanisme', intitule: "Permis de construire de l'acquéreur obtenu et purgé (affichage, recours des tiers, retrait)", declencheur: 'Vente conditionnée à un permis', modes: ['acte'] },
    { id: 'servitudes', section: 'urbanisme', intitule: 'Servitudes apparentes ou occultes mentionnées', declencheur: 'Toujours', modes: ['compromis', 'acte'] },
    { id: 'usage_location_touristique', section: 'urbanisme', intitule: "Usage du bien : location meublée de tourisme, changement d'usage, règlement municipal ou clause du règlement de copropriété", declencheur: 'Commune ou copropriété réglementant la location meublée de tourisme', modes: ['compromis', 'acte'],
      consigne: "Signale toute règle citée dans les documents sur la location meublée de courte durée ou le changement d'usage (délibération municipale, autorisation, compensation, interdiction ou limite du règlement de copropriété) et ce qu'elle impose à l'acquéreur. N'invente aucune règle locale qui ne figure pas dans les documents." },
    { id: 'conformite_travaux', types: ['maison', 'copropriete'], section: 'urbanisme', intitule: 'Travaux réalisés par le vendeur : autorisation, achèvement et conformité (DAACT), garantie décennale', declencheur: 'Si le vendeur a réalisé des travaux', modes: ['compromis', 'acte'],
      consigne: "Ne vise que les travaux réalisés par le VENDEUR (ceux de la copropriété relèvent du point « Travaux de la copropriété »). Qualifie chacun : touche-t-il l'extérieur du bâtiment, crée-t-il de la surface, porte-t-il sur le gros œuvre ? Si oui, une déclaration préalable ou un permis était exigible : dis s'il est justifié." },
    // Volet financier (prototype)
    { id: 'prix_modalites', section: 'financier', intitule: 'Prix de vente (chiffres et lettres concordants), ventilation mobilier, modalités de paiement', declencheur: 'Toujours', modes: ['compromis', 'acte'] },
    { id: 'sequestre', section: 'financier', intitule: 'Dépôt de garantie : montant, séquestre et sort (imputation sur le prix dans l\'acte)', declencheur: 'Si un dépôt est prévu', modes: ['compromis', 'acte'] },
    { id: 'honoraires', section: 'financier', intitule: 'Honoraires de négociation : montant et charge (vendeur ou acquéreur)', declencheur: 'Vente par intermédiaire', modes: ['compromis', 'acte'],
      consigne: "Dis si les honoraires sont compris dans le prix et à la charge de qui. Un écart de prix entre l'avant-contrat et l'offre d'achat ou le mandat s'explique souvent par les honoraires : vérifie-le ici avant d'en faire une anomalie." },
    { id: 'taxe_fonciere', section: 'financier', intitule: 'Répartition de la taxe foncière au prorata temporis', declencheur: 'Toujours', modes: ['compromis', 'acte'] },
    { id: 'dommage_ouvrage', types: ['maison', 'copropriete'], section: 'financier', intitule: 'Assurance dommages-ouvrage', declencheur: 'Construction ou travaux de moins de 10 ans', modes: ['compromis', 'acte'] },
    { id: 'plus_value', section: 'financier', intitule: 'Plus-value immobilière : exonération invoquée et justifiée, ou calcul prévu', declencheur: "Projet d'acte de vente", modes: ['acte'] }
  ];

  // Un point s'applique-t-il à ce type de bien ? Sans type connu, tous les points restent posés
  // (le modèle les marque « sans objet »). Un point copropriété n'a de sens qu'en copropriété, un
  // diagnostic du bâti pas sur un terrain nu : les poser quand même, c'est la moitié du bruit.
  function pointPourTypeBien(point, typeBien) {
    if (!typeBien) return true;
    const types = point.types || (point.copro ? ['copropriete'] : null);
    return !types || types.indexOf(typeBien) >= 0;
  }

  function grillePourModeOutil2(mode, typeBien) {
    const m = mode === 'acte' ? 'acte' : 'compromis';
    const sections = new Map(SECTIONS_GRILLE_OUTIL2.map(s => [s.cle, s.titre]));
    return GRILLE_RELECTURE_OUTIL2
      .filter(p => p.modes.indexOf(m) >= 0 && pointPourTypeBien(p, typeBien))
      .map(p => ({ id: p.id, section: sections.get(p.section) || p.section, intitule: p.intitule, declencheur: p.declencheur, base_legale: p.base_legale || '', consigne: consignePointGrille(p, m) }));
  }

  // Une consigne de point est soit une phrase commune aux deux modes, soit {compromis, acte} : sur un
  // avant-contrat et sur un projet de vente, la même question n'appelle pas la même vérification.
  function consignePointGrille(point, mode) {
    const c = point && point.consigne;
    if (!c) return '';
    if (typeof c === 'string') return c;
    return c[mode === 'acte' ? 'acte' : 'compromis'] || '';
  }

  // Nature d'une pièce déposée, déduite de son NOM puis du HAUT de sa première page — jamais de tout
  // le texte : un avant-contrat cite tous les diagnostics, il ne doit pas passer pour un DPE. Sert
  // à classer les annexes dans l'écran, et à dire à Claude ce qu'il a sous les yeux.
  var NATURES_PIECE_OUTIL2 = [
    { cle: 'avant_contrat', libelle: 'Avant-contrat', re: /compromis|promesse\s+(?:unilat[ée]rale\s+)?de\s+vente|avant[-\s]contrat|\bPUV\b|\bPSV\b/i },
    { cle: 'acte', libelle: 'Projet d\'acte', re: /projet\s+d.acte|acte\s+de\s+vente|\bvente\b.*\bprojet\b/i },
    { cle: 'diagnostics', libelle: 'Diagnostics', re: /diagnostic|\bDDT\b|\bDPE\b|amiante|plomb|\bCREP\b|termite|[ée]lectricit[ée]|\bgaz\b|\bERP\b|[ée]tat\s+des\s+risques|carrez|m[ée]rule|assainissement|\bSPANC\b/i },
    { cle: 'copropriete', libelle: 'Copropriété', re: /[ée]tat\s+dat[ée]|pr[ée][-\s][ée]tat|proc[èe]s[-\s]verbal|\bPV\b|assembl[ée]e\s+g[ée]n[ée]rale|\bAG\b|r[èe]glement\s+de\s+copro|carnet\s+d.entretien|fiche\s+synth[ée]tique|\bDTG\b|plan\s+pluriannuel|syndic/i },
    { cle: 'urbanisme', libelle: 'Urbanisme', re: /certificat\s+d.urbanisme|\bCU\b|alignement|num[ée]rotage|pr[ée]emption|\bDPU\b|\bDIA\b|permis|d[ée]claration\s+pr[ée]alable|\bDAACT\b|conformit[ée]|affichage/i },
    { cle: 'titre', libelle: 'Titre de propriété', re: /titre\s+de\s+propri[ée]t[ée]|\btitre\b|attestation\s+de\s+propri[ée]t[ée]|acte\s+d.acquisition/i },
    { cle: 'travaux', libelle: 'Travaux et assurances', re: /facture|devis|d[ée]cennale|dommages?[-\s]ouvrage|attestation\s+d.assurance|entretien\s+(?:de\s+)?(?:la\s+)?chaudi[èe]re|ramonage|pompe\s+[àa]\s+chaleur/i },
    { cle: 'pret', libelle: 'Financement', re: /offre\s+de\s+(?:pr[êe]t|cr[ée]dit)|contrat\s+de\s+(?:pr[êe]t|cr[ée]dit)|accord\s+de\s+pr[êe]t|attestation\s+de\s+financement/i },
    { cle: 'fiscal', libelle: 'Fiscalité', re: /taxe\s+fonci[èe]re|\bTF\b|plus[-\s]value/i }
  ];

  function classerNaturePieceOutil2(nomFichier, texte) {
    const nom = normaliserNomPourMotif(String(nomFichier || '').replace(/\.pdf$/i, ''));
    for (const n of NATURES_PIECE_OUTIL2) if (n.re.test(nom)) return n.cle;
    const haut = String(texte || '').slice(0, 600);
    for (const n of NATURES_PIECE_OUTIL2) if (n.re.test(haut)) return n.cle;
    return 'autre';
  }

  function libelleNaturePieceOutil2(cle) {
    const n = NATURES_PIECE_OUTIL2.find(x => x.cle === cle);
    return n ? n.libelle : 'Autre pièce';
  }

  // Première page d'annexes JOINTES au PDF principal (le projet et ses pièces souvent scannés en un
  // seul fichier) : même détecteur que l'import d'Outil 1 (estDebutPageAnnexe), jamais la page 1.
  // Ces pages sont envoyées à Claude marquées « annexe jointe », et affichées comme telles.
  function debutAnnexesDocumentOutil2(texte, pages) {
    const liste = Array.isArray(pages) ? pages : [];
    for (const p of liste) {
      if (p.numero <= 1) continue;
      if (estDebutPageAnnexe(String(texte || '').slice(p.debut, p.fin))) return p.numero;
    }
    return null;
  }

  // Plusieurs copropriétés dans un même acte (demande explicite de l'étude) : repérées par des
  // syndicats, règlements ou immatriculations DISTINCTS. Un seul syndicat cité dix fois reste une
  // seule copropriété. Signal pour l'écran (bandeau) — c'est Claude qui les détaille ensuite.
  function detecterCoproprietesMultiplesOutil2(texte) {
    const source = String(texte || '');
    const immat = new Set((source.match(/\b[A-Z]{2}\d[-\s]?\d{3}[-\s]?\d{3}\b/g) || []).filter(x => /immatricul/i.test(source)));
    const syndicats = new Set();
    const re = /syndicat\s+des\s+copropri[ée]taires\s+(?:de\s+l.immeuble\s+|du\s+|de\s+la\s+r[ée]sidence\s+)?([^,.;\n()]{4,60})/gi;
    let m;
    while ((m = re.exec(source)) !== null) syndicats.add(normaliserPourRecherche(m[1]).replace(/\s+/g, ' ').trim().slice(0, 40));
    const nb = Math.max(immat.size, syndicats.size);
    return { multiples: nb > 1, nombre: nb };
  }

  // ---- Pseudonymisation locale ----------------------------------------------------------------
  // Règles du prototype, dans le même ordre (du plus spécifique au plus large), avec trois
  // corrections : une adresse « code postal + commune » ne capture plus un MONTANT (« 20000 EUROS »),
  // « Maître » rejoint les civilités, et une date de naissance écrite en lettres est reconnue.
  var REGLES_ANONYMISATION_OUTIL2 = [
    { categorie: 'EMAIL', re: /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+/g },
    { categorie: 'IBAN', re: /\bFR\d{2}(?:\s?[A-Z0-9]{4}){5}\s?[A-Z0-9]{3}\b/gi },
    { categorie: 'IDENTIFIANT_ENTREPRISE', re: /\b(?:SIREN|SIRET|RCS\s+[A-Z][\wÀ-ÿ-]+)\s*:?\s*(?:n[°o]\s*)?\d{3}\s?\d{3}\s?\d{3}(?:\s?\d{5})?\b/gi },
    { categorie: 'TELEPHONE', re: /(?:\+33\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g },
    { categorie: 'NIR', re: /\b[12]\s?\d{2}\s?(?:0[1-9]|1[0-2])\s?(?:\d{2}|2[AB])\s?\d{3}\s?\d{3}(?:\s?\d{2})?\b/g },
    // Sans le drapeau « i » : il rendait insensible à la casse le motif de la commune, qui avalait
    // alors toute la suite de la phrase (« à BLOIS demeurant à… »). Même piège pour l'adresse.
    { categorie: 'NAISSANCE', re: /[Nn][ée]e?s?\s+le\s+(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}(?:er)?\s+[a-zéûA-ZÉÛ]+\s+\d{4})(?:\s+[àa]\s+[A-ZÀ-Ý][\wÀ-ÿ'’]*(?:[\s-][A-ZÀ-Ý][\wÀ-ÿ'’]*)*)?/g },
    // « Né à BLOIS (41000) le 3 mars 1970 » : la commune avant la date (audit 12/10).
    { categorie: 'NAISSANCE', re: /[Nn][ée]e?s?\s+[àa]\s+[A-ZÀ-Ý][\wÀ-ÿ'’]*(?:[\s-][A-ZÀ-Ý][\wÀ-ÿ'’]*)*(?:\s*\(\s*\d{2,5}\s*\))?\s*,?\s+le\s+(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}(?:er)?\s+[a-zéûA-ZÉÛ]+\s+\d{4})/g },
    { categorie: 'ADRESSE', re: /\b\d{1,4}(?:\s?(?:bis|ter|quater|BIS|TER))?,?\s+(?:[Rr]ue|RUE|[Aa]venue|AVENUE|[Bb]oulevard|BOULEVARD|[Ii]mpasse|IMPASSE|[Cc]hemin|CHEMIN|[Aa]ll[ée]e|ALL[ÉE]E|[Pp]lace|PLACE|[Rr]oute|ROUTE|[Qq]uai|QUAI|[Ll]ieu-dit|LIEU-DIT|[Ll]otissement|[Ss]quare|[Cc]ours|[Ff]aubourg|[Rr][ée]sidence)\s+[^\n,;.⟦]{2,60}?(?=\s*(?:,|;|\.|\n|⟦|\d{5}\b|$)|\s+(?:[àa]|et|demeurant|domicili[ée]e?s?|cadastr[ée]e?s?|ci-apr[èe]s|lieu-dit)\s)(?:,?\s*\d{5}\s+[A-ZÀ-Ý][\wÀ-ÿ'’]*(?:[\s-][A-ZÀ-Ý][\wÀ-ÿ'’]*)*)?/g },
    { categorie: 'ADRESSE', re: /\b\d{5}\s+(?!EUR|Euros?\b|EUROS\b|€|Francs?\b)[A-ZÀ-Ý][\wÀ-ÿ'’]*(?:[\s-][A-ZÀ-Ý][\wÀ-ÿ'’]*)*/g },
    // Numéros en liste (« numéros 12, 13 et 14 ») et référence après « cadastré(e) » (« cadastrée AB 123 ») — audit 12/10.
    { categorie: 'CADASTRE', re: /section\s+[A-Z]{1,2}\s*,?\s*(?:num[ée]ros?|n[°o]s?)\s*\d+(?:\s*(?:,|et|&)\s*\d+)*/gi },
    { categorie: 'CADASTRE', re: /cadastr[ée]e?s?\s+(?:sous\s+les?\s+r[ée]f[ée]rences?\s+)?(?:section\s+)?[A-Z]{1,2}\s*(?:n[°o]s?\s*)?\d{1,4}(?:\s*(?:,|et|&)\s*(?:[A-Z]{1,2}\s*)?\d{1,4})*/g },
    // Le nom du lieu-dit seul : entre guillemets, ou quatre mots à majuscule au plus (jamais l'en-tête d'un tableau cadastral).
    { categorie: 'ADRESSE', re: /(?:[Ll]ieu[- ]dit|LIEU[- ]DIT)\s*:?\s*(?:«\s*[^»\n⟦]{1,40}»|"[^"\n⟦]{1,40}"|(?!(?:Contenance|CONTENANCE|Nature|NATURE|Section|SECTION|Surface|SURFACE)(?![A-Za-zÀ-ÿ]))[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]*(?:\s+(?:de|du|des|la|le|les|d['’])?\s*[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]*){0,3}(?![A-Za-zÀ-ÿ]))/g },
    { categorie: 'PERSONNE_MORALE', re: /\b(?:SCI|SARL|SASU?|EURL|SNC|SCP|SCM|GFA|EARL|GAEC|SCCV)\s+(?:[A-Z0-9À-Ý][\wÀ-ÿ0-9'’-]*|de|du|des|la|le|les|et|d['’])(?:\s+(?:[A-Z0-9À-Ý][\wÀ-ÿ0-9'’-]*|de|du|des|la|le|les|et|d['’])){0,5}/g },
    // Civilités et désignations d'un compromis d'agence (audit 13/10 : « Mr », « M » sans point, « MM. », « Messieurs », « les
    // époux X », « consorts X », « veuve X » partaient en clair).
    { categorie: 'PERSONNE', re: /(?<![A-Za-zÀ-ÿ0-9])(?:Monsieur|Madame|Mademoiselle|Messieurs|Mesdames|MONSIEUR|MADAME|MADEMOISELLE|MESSIEURS|MESDAMES|M\.|MM\.?|Mr|MR|M(?=\s+[A-ZÀ-Ý]{2})|Mme|Mlle|Me|Ma[îi]tre|MA[ÎI]TRE|[ée]poux|[ÉE]POUX|consorts|CONSORTS|veuve|VEUVE|veuf|VEUF)\s+(?!de\s|d['’])[A-ZÀ-Ý][\wÀ-ÿ'’-]+(?:\s+[A-ZÀ-Ý][\wÀ-ÿ'’-]*){0,5}/g },
    // « Prénom NOM » sans civilité (gérant, signataire, agent) : un mot à majuscule initiale suivi d'un nom en capitales — jamais
    // un article, un mot du métier ni un rôle de l'acte.
    { categorie: 'PERSONNE', re: /(?<![A-Za-zÀ-ÿ0-9⟧])(?!(?:Le|La|Les|Du|De|Des|Au|Aux|Un|Une|Ce|Cet|Cette|Ces|En|Par|Pour|Sur|Dans|Entre|Avec|Sans|Article|Articles|Section|Lot|Lots|Zone|Commune|Ville|Etat|État|Acte|Loi|Code|Office|Etude|Étude|Maître|Monsieur|Madame|Société|Banque|Caisse|Crédit|Mairie|Préfecture|Direction|Service|Taxe|Taxes|Impôt|Impôts|Droit|Droits|Frais|Prêt|Offre|Condition|Clause|Délai|Date|Prix|Montant|Surface|Superficie|Diagnostic|Diagnostics|Dossier|Plan|Permis|Certificat|Règlement|Assemblée|Syndicat|Assurance|Garantie|Agence|Cabinet|Notaire|Mandat|Contrat|Compte|Taux|Indice|Annexe|Annexes|Page|Pièce|Pièces|Voir|Total|Solde|Fonds|Charges|Travaux|Bâtiment|Immeuble|Parcelle|Cadastre|Lieu|Réf|Référence|Numéro|Objet|Rubrique|Chapitre|Titre|Paragraphe|Alinéa|Annexé|Signé|Fait|Selon|Suivant|Conformément)\s)[A-ZÀ-Ý][a-zà-ÿ]+(?:-[A-ZÀ-Ý][a-zà-ÿ]+)?\s+(?!(?:VENDEURS?|ACQUEREURS?|ACQUÉREURS?|PROMETTANTS?|BENEFICIAIRES?|BÉNÉFICIAIRES?|PRIX|NOTAIRES?|BIEN|BIENS|SAFER|EUROS?|PARTIES|CONDITIONS?|ARTICLE|CHAPITRE|TITRE|DESIGNATION|DÉSIGNATION|ORIGINE|PROPRIETE|PROPRIÉTÉ|CHARGES?|SYNDIC|COPROPRIETE|COPROPRIÉTÉ)(?![A-Za-zÀ-ÿ]))[A-ZÀ-Ý]{2}[A-ZÀ-Ý'’-]+(?![A-Za-zÀ-ÿ])/g },
    // Le prénom resté à côté d'un nom déjà masqué (« Mr ⟦PERSONNE_1⟧ Jean », « Jean ⟦PERSONNE_1⟧ ») — audit 13/10.
    { categorie: 'PERSONNE', re: /(?<=⟦PERSONNE_\d+⟧\s{1,3})[A-ZÀ-Ý][a-zà-ÿ'’]+(?:-[A-ZÀ-Ý][a-zà-ÿ'’]+)?(?![A-Za-zÀ-ÿ])/g },
    { categorie: 'PERSONNE', re: /(?<![A-Za-zÀ-ÿ])(?!(?:Monsieur|Madame|Mademoiselle|Messieurs|Mesdames|Maître|Mme|Mlle|Mr|Me|Les|Le|La|Des|Aux|Et|Ou|Par|Pour|Entre|Avec|De|Du|Époux|Epoux|Consorts|Veuve|Veuf)\s)[A-ZÀ-Ý][a-zà-ÿ'’]+(?:-[A-ZÀ-Ý][a-zà-ÿ'’]+)?(?=\s{1,3}⟦PERSONNE_\d+⟧)/g }
  ];

  function echapperRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Motif d'un terme connu (nom lu par nos règles, ou ajouté à la main) : insensible à la casse et
  // aux accents n'étant pas possible en regex simple, on tolère seulement la casse — un nom propre
  // est écrit de la même façon d'un bout à l'autre d'un acte. Mot entier, bornes Unicode.
  function motifTermeAnonymisation(terme) {
    return new RegExp(`(?<![A-Za-zÀ-ÿ0-9])${echapperRegex(terme.trim()).replace(/\s+/g, '\\s+')}(?![A-Za-zÀ-ÿ0-9])`, 'gi');
  }

  // Termes dérivés des parties et notaires lus par nos propres règles. Un patronyme de moins de
  // trois lettres ou un mot courant n'est jamais retenu seul : le masquer partout abîmerait le texte.
  var MOTS_A_NE_PAS_MASQUER_OUTIL2 = new Set(['VENDEUR', 'VENDEURS', 'ACQUEREUR', 'ACQUEREURS', 'PROMETTANT', 'BENEFICIAIRE', 'MONSIEUR', 'MADAME', 'LES', 'DES', 'EPOUX', 'CONSORTS', 'SOCIETE', 'NOTAIRE', 'MAITRE']);

  function termesConnusAnonymisation(parties, notaires) {
    const termes = [];
    const ajouter = (valeur, categorie, source) => {
      for (const brut of String(valeur || '').split(/\s*(?:&|\/|,|\bet\b)\s*/)) {
        const t = brut.replace(/^(?:Monsieur|Madame|Mademoiselle|M\.|Mme|Mlle|Me|Ma[îi]tre)\s+/i, '').trim().replace(/\s+/g, ' ');
        if (t.length < 3) continue;
        if (MOTS_A_NE_PAS_MASQUER_OUTIL2.has(normaliserPourRecherche(t).toUpperCase())) continue;
        if (!termes.some(x => normaliserPourRecherche(x.terme) === normaliserPourRecherche(t))) termes.push({ terme: t, categorie, source });
      }
    };
    for (const p of (parties || [])) {
      ajouter(p && p.nom, p && p.qualitePersonne === 'morale' ? 'PERSONNE_MORALE' : 'PERSONNE', 'partie');
      // Prénom et nom d'usage (audit 13/10 : le prénom restait en clair à côté du nom masqué).
      if (p && p.qualitePersonne !== 'morale') { ajouter(p.prenom, 'PERSONNE', 'partie'); ajouter(p.nomUsage, 'PERSONNE', 'partie'); }
    }
    for (const n of (notaires || [])) ajouter(n && n.nom, 'PERSONNE', 'notaire');
    return termes;
  }

  // Pseudonymise une liste de documents PAGE PAR PAGE (les frontières de page doivent survivre :
  // c'est elles qui permettent ensuite de citer et d'ouvrir une page précise), avec UNE table pour
  // tous. `options.termes` : termes connus ou ajoutés à la main ; `options.exclus` : valeurs que
  // l'étude a choisi de laisser en clair (un nom de commune, par exemple). Retourne les documents
  // pseudonymisés et la table jeton → valeur, qui ne quitte jamais ce poste.
  function anonymiserDocumentsOutil2(documents, options) {
    const o = options || {};
    const exclus = new Set((o.exclus || []).map(v => normaliserPourRecherche(String(v).trim().replace(/\s+/g, ' '))));
    const regles = (o.termes || []).map(t => ({ categorie: t.categorie || 'PERSONNE', re: motifTermeAnonymisation(t.terme), source: t.source || 'manuel' }))
      .concat(REGLES_ANONYMISATION_OUTIL2.map(r => ({ categorie: r.categorie, re: r.re, source: 'regle' })));
    const parValeur = new Map(); // `${categorie}::${valeur normalisée}` → jeton
    const table = new Map();     // jeton → { jeton, valeur, categorie, occurrences, source }
    const compteurs = {};

    function remplacer(texte) {
      let t = texte;
      for (const r of regles) {
        t = t.replace(new RegExp(r.re.source, r.re.flags), (match) => {
          if (/⟦/.test(match)) return match;
          // Espaces normalisés : pdf.js double souvent une espace (« DE SOUSA  MARTINS ») et la même
          // personne recevait alors deux jetons, ce qui masquait justement la concordance à vérifier.
          const valeur = match.trim().replace(/\s+/g, ' ');
          if (exclus.has(normaliserPourRecherche(valeur))) return match;
          const cle = `${r.categorie}::${normaliserPourRecherche(valeur)}`;
          let jeton = parValeur.get(cle);
          if (!jeton) {
            compteurs[r.categorie] = (compteurs[r.categorie] || 0) + 1;
            jeton = `⟦${r.categorie}_${compteurs[r.categorie]}⟧`;
            parValeur.set(cle, jeton);
            table.set(jeton, { jeton, valeur, categorie: r.categorie, occurrences: 0, source: r.source });
          }
          table.get(jeton).occurrences++;
          return jeton;
        });
      }
      return t;
    }

    const sortie = (documents || []).map(d => {
      const texte = String(d.texte || '');
      const pages = Array.isArray(d.pages) && d.pages.length ? d.pages : [{ numero: 1, debut: 0, fin: texte.length }];
      let nouveau = '';
      const nouvellesPages = [];
      pages.forEach((p, i) => {
        const fin = i + 1 < pages.length ? pages[i + 1].debut : texte.length;
        const morceau = remplacer(texte.slice(p.debut, Math.max(fin, p.fin)));
        nouvellesPages.push({ numero: p.numero, debut: nouveau.length, fin: nouveau.length + morceau.length });
        nouveau += morceau;
      });
      return { ...d, texte: nouveau, pages: nouvellesPages };
    });
    return { documents: sortie, table: Array.from(table.values()) };
  }

  var JETON_ANONYMISATION_RE = /⟦[A-Z_]+_\d+⟧/g;

  // Pure : une consigne de l'étude, jetons gardés, tout nom propre restant masqué — mot en capitales hors sigles du métier,
  // mot à majuscule initiale hors tête de phrase (audit 12/10 : une consigne « pour tous les dossiers » écrite sur un autre
  // dossier citait ses clients, absents de la table de ce document).
  var SIGLES_CONSIGNES_OUTIL2 = new Set(['DPE', 'ERP', 'SRU', 'ALUR', 'DPU', 'DIA', 'SAFER', 'ABF', 'PLU', 'PLUI', 'CU', 'TVA', 'TTC', 'HT',
    'SCI', 'SARL', 'SAS', 'EURL', 'PACS', 'CREP', 'AAE', 'VTE', 'SPANC', 'ASL', 'AFUL', 'EUR', 'ICPE', 'PPRN', 'PPRT', 'IRIS', 'TEOM',
    'RHF', 'CNIL', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'RDC', 'OK']);
  // Mots du métier à majuscule gardés dans une consigne, et le mot qui suit « loi », « zone », « article », « code »…
  var MOTS_JURIDIQUES_CONSIGNE_OUTIL2 = new Set(['code', 'loi', 'zone', 'article', 'plan', 'decret', 'arrete', 'superficie', 'carrez', 'alur', 'hoguet',
    'pinel', 'boutin', 'elan', 'climat', 'civil', 'construction', 'urbanisme', 'environnement', 'sante', 'publique', 'commerce', 'general', 'impots',
    'cgi', 'notaire', 'notaires', 'vendeur', 'vendeurs', 'acquereur', 'acquereurs', 'promettant', 'beneficiaire', 'safer', 'mairie', 'commune',
    'syndic', 'copropriete', 'etat', 'date', 'prix', 'condition', 'conditions', 'suspensive', 'suspensives', 'diagnostic', 'diagnostics', 'amiante',
    'plomb', 'termites', 'gaz', 'electricite', 'assainissement', 'garantie', 'decennale', 'dommages', 'ouvrage', 'taxe', 'fonciere', 'office', 'notarial']);
  var MOTS_AVANT_REFERENCE_CONSIGNE_OUTIL2 = /(?:loi|zone|zones|code|plan|d[ée]cret|arr[êe]t[ée])\s*$/i;
  function masquerNomsConsigneOutil2(texte) {
    const lettre = '[A-Za-zÀ-ÖØ-öø-ÿ]';
    return String(texte || '').split(/(⟦[A-Z_]+_\d+⟧)/).map((morceau, i) => {
      if (i % 2) return morceau;
      return morceau.replace(new RegExp(`(^|[.!?:«»"(\\n]\\s*|[^A-Za-zÀ-ÖØ-öø-ÿ0-9'’-])(${lettre}[A-Za-zÀ-ÖØ-öø-ÿ'’-]*)`, 'g'), (m, avant, mot) => {
        const tete = /^$|[.!?:«»"(\n]\s*$/.test(avant);
        const capitales = mot.length >= 2 && mot === mot.toUpperCase() && /[A-ZÀ-Ý]{2}/.test(mot);
        if (mot.length < 2) return m; // « L.271-4 »
        if (MOTS_JURIDIQUES_CONSIGNE_OUTIL2.has(normaliserPourRecherche(mot))) return m;
        if (MOTS_AVANT_REFERENCE_CONSIGNE_OUTIL2.test(morceau.slice(0, morceau.indexOf(m) + avant.length))) return m;
        if (capitales) return SIGLES_CONSIGNES_OUTIL2.has(mot.replace(/['’-]/g, '')) ? m : avant + '[nom]';
        if (!tete && /^[A-ZÀ-Ý]/.test(mot)) return avant + '[nom]';
        return m;
      });
    }).join('');
  }

  // Ré-identification, en profondeur, de ce que Claude renvoie (commentaires, extraits cités).
  function desanonymiserOutil2(valeur, table) {
    const parJeton = new Map((table || []).map(e => [e.jeton, e.valeur]));
    const rec = (v) => {
      if (typeof v === 'string') return v.replace(JETON_ANONYMISATION_RE, j => parJeton.has(j) ? parJeton.get(j) : j);
      if (Array.isArray(v)) return v.map(rec);
      if (v && typeof v === 'object') {
        const r = {};
        for (const [k, x] of Object.entries(v)) r[k] = rec(x);
        return r;
      }
      return v;
    };
    return rec(valeur);
  }

  // Un texte libre écrit sur CE poste (commentaire de l'étude renvoyé à Claude comme consigne) peut
  // citer un nom en clair : on le remplace par le jeton déjà attribué à cette valeur, et tout ce que
  // les règles reconnaissent encore passe en « [donnée masquée] ». Jamais de nouveau jeton : il ne
  // correspondrait à rien dans les documents envoyés.
  function pseudonymiserTexteLibreOutil2(texte, table) {
    let t = String(texte || '');
    const entrees = (table || []).filter(e => e && e.valeur && e.valeur.length >= 3).slice().sort((a, b) => b.valeur.length - a.valeur.length);
    for (const e of entrees) t = t.replace(motifTermeAnonymisation(e.valeur), e.jeton);
    for (const r of REGLES_ANONYMISATION_OUTIL2) {
      t = t.replace(new RegExp(r.re.source, r.re.flags), m => (/⟦/.test(m) ? m : '[donnée masquée]'));
    }
    return t;
  }

  // ---- Tableau de bord --------------------------------------------------------------------------
  // Trois niveaux seulement, ceux demandés par l'étude : validé, à surveiller, critique (plus « sans
  // objet », qui ne compte pas). Correspondance avec le statut d'un point de grille :
  //   present → validé ; a_verifier → à surveiller ; absent → critique ; non_applicable → sans objet.
  // Une anomalie hors grille : élevée → critique, moyenne ou faible → à surveiller.
  var NIVEAUX_RELECTURE_OUTIL2 = {
    critique: { texte: 'Critique', dl: 'dl-urgent', icone: 'alert-triangle', rang: 0 },
    surveiller: { texte: 'À surveiller', dl: 'dl-pret', icone: 'info', rang: 1 },
    valide: { texte: 'Validé', dl: 'dl-success', icone: 'check', rang: 2 },
    na: { texte: 'Sans objet', dl: 'dl-neutre', icone: 'x', rang: 3 }
  };

  // Un point « présent » sans aucune citation retrouvée mot pour mot n'est pas prouvé : à surveiller, jamais validé (audit
  // 12/10). `citations` absent (appel d'avant) : le statut seul.
  function niveauPointGrilleOutil2(statut, citations) {
    if (statut === 'present' && Array.isArray(citations) && !citations.some(c => c && c.verifie)) return 'surveiller';
    return { present: 'valide', a_verifier: 'surveiller', absent: 'critique', non_applicable: 'na' }[statut] || 'surveiller';
  }

  // Regroupe la réponse de Claude par section de la grille, avec le niveau de chaque ligne et le
  // pire niveau de la section. `grille` est celle envoyée (même ordre).
  function sectionsTableauDeBordOutil2(analyse, mode, typeBien) {
    const a = analyse || {};
    const parId = new Map((a.points || []).map(p => [p.id, p]));
    const sections = [];
    for (const s of SECTIONS_GRILLE_OUTIL2) {
      const points = GRILLE_RELECTURE_OUTIL2.filter(g => g.section === s.cle && g.modes.indexOf(mode === 'acte' ? 'acte' : 'compromis') >= 0 && pointPourTypeBien(g, typeBien));
      if (!points.length) continue;
      const lignes = points.map(g => {
        const r = parId.get(g.id) || { statut: 'a_verifier', commentaire: 'Point non traité.', citations: [] };
        return { id: g.id, intitule: g.intitule, base_legale: g.base_legale || '', statut: r.statut, niveau: niveauPointGrilleOutil2(r.statut, r.citations || []), commentaire: r.commentaire || '', citations: r.citations || [], omis: !!r.omis };
      });
      const actives = lignes.filter(l => l.niveau !== 'na');
      const pire = actives.length ? actives.reduce((m, l) => NIVEAUX_RELECTURE_OUTIL2[l.niveau].rang < NIVEAUX_RELECTURE_OUTIL2[m].rang ? l.niveau : m, 'valide') : 'na';
      sections.push({ cle: s.cle, titre: s.titre, niveau: pire, lignes });
    }
    return sections;
  }

  // Santé globale : critique dès qu'un point est critique, à surveiller dès qu'un point l'est,
  // validé sinon. `extras` : les niveaux venus d'ailleurs (anomalies, contrôles CLAIRE).
  function santeRelectureOutil2(sections, extras) {
    const compte = { critique: 0, surveiller: 0, valide: 0, na: 0 };
    for (const s of (sections || [])) for (const l of s.lignes) compte[l.niveau] = (compte[l.niveau] || 0) + 1;
    for (const n of (extras || [])) if (compte[n] !== undefined) compte[n]++;
    const niveau = compte.critique ? 'critique' : (compte.surveiller ? 'surveiller' : 'valide');
    return { niveau, compte };
  }

  function formaterCoutUsd(v) {
    if (!Number.isFinite(v)) return '—';
    const decimales = v < 0.1 ? 3 : 2;
    return v.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }) + ' $';
  }

  function formaterDureeMs(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  }

  // ==== OUTIL 2 : PIÈCES ATTENDUES ET COMMENTAIRES (fonctions pures) ==========================
  //
  // La synthèse rédigée « à communiquer au client » et l'ancienne grille par rubrique ont été
  // retirées le 24/09/2026 (« pas d'e-mail rédigé à la fin, je n'aime pas finalement ») : le rendu
  // passe désormais par le tableau de bord de la relecture (voir « OUTIL 2 v3 » plus bas). Restent
  // ici les pièces attendues par type de bien et les commentaires de l'étude sur un constat.

  // --- Commentaires de l'étude sur les constats ------------------------------------------------
  // Un commentaire est rattaché à un constat par la même empreinte que la mémoire d'audit (titre +
  // clause citée, voir empreinteConstat), mais il vit sur le SERVEUR (partagé entre les postes,
  // exportable) et porte une PORTÉE : « ce dossier seulement » ou « tous les dossiers ». Un avis
  // pour ce dossier l'emporte sur un avis général, à similarité égale.
  var VERDICTS_RETOUR_OUTIL2 = {
    juste: { texte: 'Juste', dl: 'dl-success', icone: 'check' },
    faux_positif: { texte: 'Faux positif', dl: 'dl-neutre', icone: 'x' },
    mal_formule: { texte: 'Mal formulé', dl: 'dl-pret', icone: 'pencil' },
    gravite: { texte: 'Gravité à revoir', dl: 'dl-pret', icone: 'alert-triangle' },
    manque: { texte: "Oubli de l'audit", dl: 'dl-urgent', icone: 'info' }
  };
  var SEUIL_SIMILARITE_RETOUR_OUTIL2 = 0.5;

  function empreinteTexteConstat(constat) {
    return [...empreinteConstat(constat)].join(' ');
  }

  function retourPourConstat(constat, retours, dossierCle) {
    const tokens = empreinteConstat(constat);
    if (tokens.size < 3) return null;
    let meilleur = null;
    let meilleurScore = -1;
    for (const r of retours || []) {
      if (!r || !r.constat || r.verdict === 'manque' || !r.empreinte) continue;
      const memeDossier = !!dossierCle && r.dossierCle === dossierCle;
      if (r.portee === 'dossier' && !memeDossier) continue;
      if (r.constat.categorie && constat.categorie && r.constat.categorie !== constat.categorie) continue;
      const score = similariteJaccard(tokens, new Set(String(r.empreinte).split(' ')));
      if (score < SEUIL_SIMILARITE_RETOUR_OUTIL2) continue;
      // Avis propre au dossier d'abord, puis le plus ressemblant, puis le plus récent.
      const rang = score + (r.portee === 'dossier' ? 1 : 0);
      if (rang > meilleurScore || (rang === meilleurScore && meilleur && String(r.date) > String(meilleur.date))) {
        meilleur = r; meilleurScore = rang;
      }
    }
    return meilleur;
  }

  // Applique les commentaires aux constats d'un rapport : rattache l'avis, et corrige la gravité
  // quand l'étude a demandé une autre gravité (l'origine est gardée, pour pouvoir la rejouer).
  function appliquerRetoursAuxConstats(constats, retours, dossierCle) {
    for (const c of constats || []) {
      if (!c || typeof c !== 'object') continue;
      if (c.graviteOrigine) { c.gravite = c.graviteOrigine; delete c.graviteOrigine; }
      const r = retourPourConstat(c, retours, dossierCle);
      c.retour = r ? { id: r.id, verdict: r.verdict, portee: r.portee, commentaire: r.commentaire,
        graviteSouhaitee: r.graviteSouhaitee || null, date: r.date } : null;
      if (r && r.verdict === 'gravite' && r.graviteSouhaitee && r.graviteSouhaitee !== c.gravite) {
        c.graviteOrigine = c.gravite;
        c.gravite = r.graviteSouhaitee;
      }
    }
    return constats;
  }

  // Un constat que l'étude a écarté (mémoire d'audit) ou jugé faux positif ne compte plus : ni
  // dans le résumé, ni dans la grille, ni dans la synthèse. Il reste lisible, replié, dans le
  // rapport détaillé.
  function constatExcluOutil2(c) {
    return !!(c && ((c.memoire && c.memoire.decision === 'ecarte') || (c.retour && c.retour.verdict === 'faux_positif')));
  }

  function resumeConstatsOutil2(constats) {
    const resume = { CRITIQUE: 0, IMPORTANT: 0, A_VERIFIER: 0, INFORMATION: 0 };
    for (const c of constats || []) {
      if (!c || constatExcluOutil2(c)) continue;
      if (resume[c.gravite] != null) resume[c.gravite]++;
    }
    return resume;
  }

  // La fiche d'un dossier créé avant le correctif des blocs de parties (21/09) peut porter
  // l'acquéreur rangé côté vendeur. La relecture lit désormais l'avant-contrat lui-même (voir
  // referenceAudit) : quand ce qu'elle y lit diffère de la fiche, elle le dit et propose de
  // mettre la fiche à jour — d'un clic, confirmé, jamais toute seule.
  function signaturePartiesOutil2(parties) {
    return (parties || [])
      .map(p => `${normaliserPourRecherche(String(p.nom || '').trim())}|${String(p.role || '').toUpperCase()}`)
      .filter(x => !x.startsWith('|'))
      .sort()
      .join(';');
  }

  function partiesDivergentes(partiesDossier, partiesTexte) {
    if (!(partiesTexte || []).length) return false;
    return signaturePartiesOutil2(partiesDossier) !== signaturePartiesOutil2(partiesTexte);
  }

  // Rubrique « AAE » du NAS : les pièces réunies entre l'avant-contrat et la vente (urbanisme,
  // entretien, état daté…), futures annexes de l'acte — exactement ce que la relecture du projet
  // de vente doit lire. Un SEGMENT DE DOSSIER du chemin, jamais le nom du fichier (« Copie AAE
  // PROMESSE… » est l'avant-contrat, pas une annexe).
  function estDansRubriqueAAE(chemin) {
    const segments = String(chemin || '').split(/[\\/]+/).filter(Boolean);
    segments.pop();
    return segments.some(seg => /(?:^|[^A-Za-z0-9])AAE(?:[^A-Za-z0-9]|$)/i.test(seg));
  }

  // Clé d'un audit pour les commentaires « ce dossier seulement » : le dossier CLAIRE lié quand il
  // y en a un, sinon le nom du document relu (deux relectures du même projet se retrouvent).
  function cleDossierAudit(dossierLie, nomPrincipal) {
    if (dossierLie && dossierLie.id) return 'dossier:' + dossierLie.id;
    const nom = normaliserPourRecherche(String(nomPrincipal || '')).replace(/\.pdf$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
    return nom ? 'document:' + nom : '';
  }

  // ==== OUTIL 2 : LECTURE D'UN PROJET DE VENTE (comparaison avec l'avant-contrat) ==============
  //
  // Périmètre arrêté avec l'étude : « comparer SEULEMENT l'avant-contrat avec le projet de vente et
  // voir si les engagements ont été tenus et réalisés », avec la possibilité de déposer les
  // justificatifs et de contrôler leurs dates. Deux sources de vérité, rien d'autre.
  //
  // L'obligation est tenue si — et seulement si — l'une de ces deux preuves existe :
  //   • un justificatif déposé, dont la date est encore valable à la date de l'analyse ;
  //   • le PROJET lui-même qui vise le document avec sa date (« … justifie de l'entretien annuel
  //     de la chaudière effectué le 12 mars 2026 »), date elle aussi contrôlée.
  // Un justificatif déposé mais PÉRIMÉ n'est pas une obligation tenue : c'est le cas que l'étude a
  // explicitement nommé (« entretien de chaudière fourni, mais a-t-il bien moins d'un an ? »).

  // Renvoie AUSSI la clause telle qu'elle est rédigée dans le projet, pas seulement sa date : c'est
  // elle qui s'affiche en regard de la clause de l'avant-contrat dans la vue côte à côte
  // (renderObligationAudit). Sans ce texte, la colonne de droite ne dirait que « visé p.12 », ce
  // qui n'est pas relisable — or comparer les deux rédactions EST le travail demandé.
  function preuveDansProjet(cle, texteProjet, pagesProjet, aujourdHui) {
    const entree = DOCUMENTS_VALIDITE_OUTIL2[cle];
    if (!entree || !texteProjet) return null;
    const m = String(texteProjet).match(new RegExp(entree.motif.source, 'i'));
    if (!m || m.index == null) return null;
    const date = premiereDateDansFragment(fragmentApres(texteProjet, m.index, 300));
    return {
      source: 'projet',
      page: pageDepuisIndexPages(pagesProjet, m.index),
      clause: phraseAutour(texteProjet, m.index, 120, 300).phrase,
      date,
      validite: calculerValiditeDocumentOutil2(cle, date, aujourdHui)
    };
  }

  function verifierEngagementsTenus(entree) {
    const texteAvantContrat = (entree && entree.texteAvantContrat) || '';
    const texteProjet = (entree && entree.texteProjet) || '';
    const pagesProjet = (entree && entree.pagesProjet) || [];
    const aujourdHui = (entree && entree.aujourdHui) || new Date().toISOString().slice(0, 10);
    const justificatifs = rapprocherJustificatifs((entree && entree.documentsDeposes) || []);
    const engagements = typeof extraireEngagementsVendeur === 'function' ? extraireEngagementsVendeur(texteAvantContrat) : [];

    const obligations = [];
    for (const e of engagements) {
      const cle = clePourEngagement(e.phrase);
      const label = cle ? DOCUMENTS_VALIDITE_OUTIL2[cle].label : null;
      const base = { cle, label, type: e.type, clause: e.phrase, page: e.page };

      // Calculée d'emblée : elle sert de PREUVE quand rien n'a été déposé, mais surtout de colonne
      // « ce qu'en dit le projet de vente » dans tous les cas — y compris lorsque l'obligation est
      // déjà établie par un justificatif déposé.
      const dansProjet = cle ? preuveDansProjet(cle, texteProjet, pagesProjet, aujourdHui) : null;
      base.clauseProjet = dansProjet ? dansProjet.clause : null;
      base.pageProjet = dansProjet ? dansProjet.page : null;

      const depose = cle ? justificatifs[cle] : null;
      if (depose && depose.document) {
        const v = calculerValiditeDocumentOutil2(cle, depose.date, aujourdHui);
        obligations.push({
          ...base,
          statut: v.statut === 'EXPIRE' ? 'perime' : (v.statut === 'DATE_MANQUANTE' ? 'date_illisible' : 'tenue'),
          preuve: { source: 'depot', nom: depose.document, date: depose.date },
          validite: v
        });
        continue;
      }

      if (dansProjet && dansProjet.date) {
        obligations.push({
          ...base,
          statut: dansProjet.validite.statut === 'EXPIRE' ? 'perime' : 'tenue',
          preuve: { source: 'projet', page: dansProjet.page, date: dansProjet.date },
          validite: dansProjet.validite
        });
        continue;
      }

      // Troisième source, en dernier recours : la pièce est peut-être déjà rangée sur le NAS et
      // reconnue par le parcours habituel d'Outil 1. Elle vient APRÈS les deux autres, qui portent
      // une date contrôlable — celle-ci prouve seulement l'existence du document.
      const dansDossier = preuveDansDossierLie(cle, entree && entree.dossierLie);
      if (dansDossier) {
        obligations.push({ ...base, statut: 'tenue_non_datee', preuve: dansDossier, validite: null });
        continue;
      }

      obligations.push({
        ...base,
        // Une clause sans document type (« le vendeur fera réparer la toiture ») ne peut pas être
        // cochée automatiquement : l'outil ne prétend pas savoir, il la remet sous les yeux.
        statut: cle ? 'non_tenue' : 'a_verifier',
        preuve: null,
        validite: null
      });
    }

    const rang = { perime: 0, non_tenue: 1, date_illisible: 2, a_verifier: 3, tenue_non_datee: 4, tenue: 5 };
    obligations.sort((a, b) => rang[a.statut] - rang[b.statut]);
    return obligations;
  }

  var LIBELLES_STATUT_OBLIGATION_OUTIL2 = {
    perime: { texte: 'Justificatif périmé', dl: 'dl-urgent', gravite: 'CRITIQUE' },
    non_tenue: { texte: 'Non justifiée', dl: 'dl-urgent', gravite: 'CRITIQUE' },
    date_illisible: { texte: 'Date illisible', dl: 'dl-pret', gravite: 'A_VERIFIER' },
    a_verifier: { texte: 'À vérifier à la main', dl: 'dl-pret', gravite: 'A_VERIFIER' },
    tenue_non_datee: { texte: 'Au dossier, date non contrôlée', dl: 'dl-pret', gravite: 'A_VERIFIER' },
    tenue: { texte: 'Tenue', dl: 'dl-success', gravite: 'INFORMATION' }
  };

  function constatsObligationsOutil2(obligations) {
    const constats = [];
    for (const o of obligations || []) {
      if (o.statut === 'tenue') continue;
      const etat = LIBELLES_STATUT_OBLIGATION_OUTIL2[o.statut] || LIBELLES_STATUT_OBLIGATION_OUTIL2.a_verifier;
      let description;
      if (o.statut === 'perime') description = `${o.preuve && o.preuve.nom ? o.preuve.nom + ' — ' : ''}${o.validite ? o.validite.message : ''}`;
      else if (o.statut === 'non_tenue') description = "Aucun justificatif déposé, et le projet de vente n'en vise aucun avec sa date.";
      else if (o.statut === 'date_illisible') description = "Justificatif déposé, mais aucune date n'a pu y être lue : la vérifier à l'œil.";
      else if (o.statut === 'tenue_non_datee') description = `La pièce est déjà rangée dans le dossier client${o.preuve && o.preuve.nom ? ' (' + o.preuve.nom + ')' : ''}, mais son fichier n'a pas été lu ici : sa date reste à vérifier.`;
      else description = "Engagement sans document type : à contrôler à la main dans le projet.";
      constats.push({
        categorie: 'OBLIGATIONS',
        gravite: etat.gravite,
        titre: o.label ? `${o.label} : ${etat.texte.toLowerCase()}` : "Engagement du vendeur à contrôler",
        description,
        phrase: o.clause,
        page: o.page
      });
    }
    return constats;
  }

  // Un travail déclaré dans l'avant-contrat et qui disparaît du projet de vente est un vrai
  // signal : la déclaration doit être reprise dans l'acte, c'est elle qui engage le vendeur.
  function constatsTravauxNonRepris(travauxAvantContrat, texteProjet) {
    const constats = [];
    const projet = String(texteProjet || '');
    for (const t of travauxAvantContrat || []) {
      if (!t.soumisAutorisation) continue;
      const mots = (t.phrase.match(RE_TRAVAUX_MOT) || []).map(x => x.toLowerCase());
      const repris = mots.some(mot => projet.toLowerCase().includes(mot));
      if (repris) continue;
      constats.push({
        categorie: 'TRAVAUX_REALISES',
        gravite: 'IMPORTANT',
        titre: 'Travaux déclarés dans l’avant-contrat, absents du projet de vente',
        description: "La déclaration de travaux du vendeur doit être reprise dans l'acte : c'est elle qui l'engage.",
        phrase: t.phrase, page: t.page
      });
    }
    return constats;
  }

  // Point d'entrée du mode « projet de vente ». Comme le mode compromis : entièrement synchrone.
