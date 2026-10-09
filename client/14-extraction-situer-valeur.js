  // ==== EXTRACTION STRUCTURÉE : situer une valeur dans le document ====

  // Retrouve où une valeur DÉJÀ extraite apparaît dans le texte, pour pouvoir en donner la page.
  // Distinct de localiserExtrait(), qui vérifie une CITATION du modèle et exige pour ça au moins
  // 12 caractères (« le 15 » se retrouverait partout) : ici la valeur vient de nos propres règles,
  // on cherche seulement à la situer — un patronyme ou un montant font souvent moins de 12
  // caractères, et les écarter reviendrait à n'afficher aucune page, ce qui était le défaut signalé.
  function localiserValeur(texte, aiguille) {
    const brut = String(aiguille === null || aiguille === undefined ? '' : aiguille).trim();
    if (!texte || brut.length < 3) return -1;
    const source = normaliserAvecIndex(texte);
    const cible = normaliserAvecIndex(brut).texte.trim();
    if (cible.length < 3) return -1;
    const pos = source.texte.indexOf(cible);
    return pos === -1 ? -1 : source.index[pos];
  }

  // Phrase entourant un index, pour montrer la valeur DANS son contexte plutôt que seule.
  function extraitAutour(texte, index, longueur) {
    const source = String(texte || '');
    const debut = Math.max(0, index - 90);
    const fin = Math.min(source.length, index + Math.max(Number(longueur) || 0, 20) + 90);
    let extrait = source.slice(debut, fin).replace(/\s+/g, ' ').trim();
    if (debut > 0) extrait = '…' + extrait;
    if (fin < source.length) extrait += '…';
    return extrait;
  }

  // Formes sous lesquelles une valeur peut réellement figurer dans l'acte. Un nom de dossier
  // « DUPONT / MARTIN » n'y apparaît jamais tel quel (c'est une composition), un prix « 250000 »
  // s'y écrit « 250 000 » : chercher la valeur telle qu'on l'affiche ne donnerait jamais rien.
  function aiguillesPourValeur(cle, valeur) {
    if (valeur === null || valeur === undefined || valeur === '') return [];
    const brut = String(valeur);
    if (cle === 'nom') {
      return brut.split('/').map(p => p.split('&')[0].trim()).filter(p => p.length >= 3);
    }
    if (cle === 'prixVente' || cle === 'depotGarantie' || cle === 'prixMobilier' || cle === 'honorairesAgence') {
      const n = Number(brut);
      if (!Number.isFinite(n)) return [brut];
      return [
        String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
        String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
        String(n)
      ];
    }
    if (cle === 'adresseBien') {
      // L'adresse complète est reconstituée à partir de composants : la voie seule, sans le code
      // postal ni la commune qui la suivent, se retrouve plus fidèlement dans le texte d'origine.
      return [brut, brut.replace(/\(?\d{5}\)?.*$/, '').trim()].filter(x => x.length >= 3);
    }
    return [brut];
  }

  // Source (page + extrait) d'une valeur extraite par nos règles. `depuis` (facultatif) : la valeur est cherchée à partir de cet
  // index — la clause où elle a été lue (étude 08/10 : honoraires de 10 000 € TTC situés page 3 sur le « capital de 10 000 euros »
  // de l'agence, alors que la clause « Honoraires de l'AGENCE » était page 16). Pas trouvée après : tout le texte, comme avant.
  function sourcePourValeur(texte, cle, valeur, depuis) {
    const debut = Number(depuis) > 0 ? Number(depuis) : 0;
    for (const aiguille of aiguillesPourValeur(cle, valeur)) {
      let index = debut ? localiserValeur(String(texte || '').slice(debut), aiguille) : -1;
      index = index >= 0 ? index + debut : localiserValeur(texte, aiguille);
      if (index >= 0) {
        return { index, page: pageDepuisIndex(index), extrait: extraitAutour(texte, index, String(aiguille).length), trouve: String(aiguille) };
      }
    }
    return null;
  }

  // ---- analyse juridique : documents que le vendeur s'engage à fournir ----

  // Chaque entrée porte sa catégorie : un notaire distingue l'entretien courant à justifier
  // (ramonage, chaudière) des travaux à faire exécuter, et des justificatifs administratifs.
  // `cleChecklist` relie cette détection à une pièce de PIECES_ENGAGEMENTS_AUTO (voir plus bas,
  // section "suivi des pièces du dossier") : un document REPÉRÉ DANS LE COMPROMIS est ajouté
  // automatiquement à la checklist du dossier, pour être ensuite recherché dans le dossier local
  // relié comme n'importe quelle autre pièce. Limité au départ à trois entrées (chaudière, PAC,
  // ramonage), étendu ensuite à TOUTES sur demande explicite de l'étude — un document qu'elle doit
  // réclamer au vendeur mérite le même suivi, quelle que soit sa nature.
  // Deux entrées pointent volontairement vers une clé DÉJÀ présente dans la checklist standard
  // (assainissement, diagnostics) : checklistPieces() dédoublonne, la pièce standard l'emporte et
  // rien n'apparaît deux fois.
  const DOCUMENTS_VENDEUR_CONNUS = [
    // Entretien courant à justifier
    { motif: /ramon(?:age|er|[ée]e?s?)\b|entretien.{0,30}(?:chemin[ée]e|po[êe]le|insert)|conduits?\s+de\s+fum[ée]e/i, label: 'Justificatif de ramonage', cat: 'entretien', cleChecklist: 'ramonage' },
    { motif: /entretien.{0,30}chaudi[èe]re|chaudi[èe]re.{0,40}entretenue/i, label: "Justificatif d'entretien de la chaudière", cat: 'entretien', cleChecklist: 'entretienChaudiere' },
    { motif: /entretien.{0,40}(?:pompe\s+[àa]\s+chaleur|\bpac\b)/i, label: "Justificatif d'entretien de la pompe à chaleur", cat: 'entretien', cleChecklist: 'entretienPac' },
    { motif: /entretien.{0,30}(?:climatisation|clim\b)/i, label: "Justificatif d'entretien de la climatisation", cat: 'entretien', cleChecklist: 'entretienClim' },
    { motif: /vidange\s+(?:de\s+la\s+)?fosse|(?:entretien|vidange).{0,30}fosse\s+septique/i, label: 'Vidange de fosse septique', cat: 'entretien', cleChecklist: 'vidangeFosse' },
    { motif: /entretien.{0,30}adoucisseur/i, label: "Entretien de l'adoucisseur d'eau", cat: 'entretien', cleChecklist: 'entretienAdoucisseur' },
    { motif: /d[ée]broussaill|[ée]lagage/i, label: 'Débroussaillage / élagage', cat: 'entretien', cleChecklist: 'debroussaillage' },

    // Travaux à réaliser
    { motif: /remettre\s+en\s+[ée]tat|remise\s+en\s+[ée]tat|r[ée]paration/i, label: 'Travaux de remise en état', cat: 'travaux', cleChecklist: 'travauxRemiseEtat' },
    { motif: /r[ée]gularisation.{0,60}travaux|travaux.{0,60}r[ée]gularis|mise\s+en\s+conformit[ée]/i, label: 'Régularisation / mise en conformité', cat: 'travaux', cleChecklist: 'miseEnConformite' },
    { motif: /cuve\s+[àa]\s+(?:fioul|mazout|gaz)|citerne|d[ée]gazage|enl[èe]vement.{0,40}citerne/i, label: 'Enlèvement / neutralisation de cuve ou citerne', cat: 'travaux', cleChecklist: 'cuveCiterne' },
    { motif: /d[ée]barras|encombrants/i, label: 'Débarras des encombrants', cat: 'travaux', cleChecklist: 'debarras' },

    // Justificatifs et attestations
    { motif: /arr[êe]t[ée]\s+(?:d['’]\s*autorisation|de\s+(?:permis|non[-\s]?opposition))|(?:fournir|remettre|produire|transmettre)\s+(?:le\s+|la\s+|l['’]\s*)?(?:permis\s+de\s+construire|d[ée]claration\s+pr[ée]alable|autorisation\s+d['’]\s*urbanisme)/i, label: 'Autorisation d’urbanisme (arrêté du permis ou non-opposition)', cat: 'justificatif', cleChecklist: null },
    { motif: /certificat\s+de\s+conformit[ée]|attestation\s+de\s+conformit[ée]|consuel/i, label: 'Attestation de conformité', cat: 'justificatif', cleChecklist: 'attestationConformite' },
    { motif: /garantie\s+d[ée]cennale|(?:assurance|attestation)\s+(?:d['’]\s*)?(?:assurance\s+)?d[ée]cennale/i, label: 'Justificatif de garantie décennale', cat: 'justificatif', cleChecklist: 'garantieDecennale' },
    { motif: /dommage[- ]ouvrage/i, label: 'Assurance dommage-ouvrage', cat: 'justificatif', cleChecklist: 'dommageOuvrage' },
    { motif: /factures?\s+(?:finales?\s+)?(?:des\s+|de\s+l['’]?\s*|de\s+|du\s+)?(?:travaux|constructeur|entreprises?|artisans?)|justificatifs?\s+(?:des\s+)?travaux/i, label: 'Factures des travaux réalisés', cat: 'justificatif', cleChecklist: 'facturesTravaux' },
    { motif: /assainissement\s+non\s+collectif|contr[ôo]le\s+d.assainissement|spanc\b/i, label: "Contrôle d'assainissement", cat: 'justificatif', cleChecklist: 'reponseAssainissement' },
    { motif: /[ée]tat\s+parasitaire|m[ée]rule/i, label: 'État parasitaire / mérule', cat: 'justificatif', cleChecklist: 'etatParasitaire' },
    { motif: /audit\s+[ée]nerg[ée]tique/i, label: 'Audit énergétique', cat: 'justificatif', cleChecklist: 'auditEnergetique' },
    { motif: /s[ée]curit[ée]\s+(?:de\s+la\s+)?piscine|alarme\s+piscine|barri[èe]re\s+de\s+protection/i, label: 'Conformité sécurité piscine', cat: 'justificatif', cleChecklist: 'securitePiscine' },
    { motif: /r[ée]sili(?:er|ation).{0,40}contrat/i, label: 'Justificatif de résiliation de contrat', cat: 'justificatif', cleChecklist: 'resiliationContrat' }
  ];

  // Les documents ne sont cherchés QUE dans les clauses d'engagement du vendeur et les conditions
  // suspensives : chercher dans tout le compromis remontait des faux positifs (un adoucisseur cité
  // dans la liste des immeubles par destination n'est pas une pièce à réclamer).
  // Chaque obligation du vendeur de fournir un document ou de justifier d'un entretien doit
  // apparaître dans « Documents et pièces identifiés » (signalé par l'étude : « il détecte une
  // obligation mais ne la met pas dans les documents à fournir »). Deux étages :
  //  1. le catalogue ci-dessus, qui donne un libellé stable et une clé de checklist (donc une
  //     recherche automatique sur le NAS) ;
  //  2. à défaut, un document GÉNÉRIQUE nommé d'après la clause elle-même (« Attestation
  //     d'acquittement de la prime définitive »), sans clé de checklist — il ne sera pas cherché
  //     sur le NAS, mais il ne disparaît plus en silence. Seulement pour une obligation de type
  //     document ou entretien : des travaux ne sont pas une pièce à réclamer.
  // Une clause qui énumère plusieurs pièces (« les documents ci-après énumérés : - la facture… ;
  // - les plans… ») est traitée élément par élément, sans quoi le premier document reconnu
  // masquait tous les autres.
  var TYPES_OBLIGATION_DOCUMENT = ['document', 'entretien', 'justificatif'];
  var RE_VERBE_REMISE_DOCUMENT = /\b(?:fournir|remettre|communiquer|produire|transmettre|d[ée]livrer|adresser|justifier\s+(?:d['’]\s*|de\s+la\s+|de\s+l['’]\s*|du\s+|des\s+|de\s+)|faire\s+(?:proc[ée]der|r[ée]aliser|effectuer)\s+(?:[àa]\s+la\s+|[àa]\s+l['’]\s*|au\s+|aux\s+|[àa]\s+))\s*/i;
  var RE_DESTINATAIRE_DOCUMENT = /^(?:[àa]\s+l['’]?\s*|au\s+|aux\s+|[àa]\s+)(?:acqu[ée]reurs?|b[ée]n[ée]ficiaires?|notaires?|[ée]tude|office)\b[^,]*?(?:,\s*|\s+(?=l[ea]s?\s|l['’]|une?\s|des\s))/i;
  var RE_FIN_OBJET_DOCUMENT = /\s+(?:au\s+plus\s+tard|avant\s|dès\s|lors\s|ainsi\s+que\b|pour\s+le\s+jour|dans\s+(?:un|les|le)\s|et\s+ce\s|et\s+[àa]\s+en\s|le\s+jour\s|[àa]\s+(?:premi[èe]re\s+)?demande|au\s+jour\s)|[.;,:]/i;

  function libelleDocumentGenerique(fragment) {
    let t = String(fragment || '').replace(/\s+/g, ' ').replace(/\s+([’'])\s*/g, '$1').trim();
    t = t.replace(RE_DESTINATAIRE_DOCUMENT, '');
    const coupe = t.search(RE_FIN_OBJET_DOCUMENT);
    if (coupe > 0) t = t.slice(0, coupe);
    t = t.replace(/^(?:[-–•]\s*)?(?:(?:les?|la|une?|des|ses|son|sa)\s+|l['’]\s*)/i, '').trim();
    if (t.length < 6) return null;
    if (/^(?:documents?|pi[èe]ces?)\s+ci\s*-?\s*apr[èe]s/i.test(t)) return null;
    if (t.length > 90) t = t.slice(0, 88).replace(/\s+\S*$/, '') + '…';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Éléments d'une énumération (« … énumérés : - a ; - b ») ; une clause sans énumération rend
  // un seul élément : elle-même.
  function elementsEnumeresClause(phrase) {
    const p = String(phrase || '');
    const deuxPoints = p.indexOf(':');
    if (deuxPoints < 0) return [{ texte: p, enumere: false }];
    const suite = p.slice(deuxPoints + 1);
    const morceaux = suite.split(/\s*;\s*|\s+[-–•]\s+|^\s*[-–•]\s*/).map(x => x.trim()).filter(x => x.length >= 6);
    if (morceaux.length < 2 && !/^\s*[-–•]/.test(suite)) return [{ texte: p, enumere: false }];
    return morceaux.map(texte => ({ texte, enumere: true }));
  }

  function documentsDepuisClause(clause) {
    const phrase = typeof clause === 'string' ? clause : (clause && clause.phrase) || '';
    const type = typeof clause === 'string' ? null : (clause && clause.type) || null;
    const resultats = [];
    elementsEnumeresClause(phrase).forEach(({ texte, enumere }) => {
      const connus = DOCUMENTS_VENDEUR_CONNUS.filter(doc => doc.motif.test(texte));
      connus.forEach(doc => resultats.push({ label: doc.label, cat: doc.cat, cleChecklist: doc.cleChecklist || null }));
      if (connus.length || !TYPES_OBLIGATION_DOCUMENT.includes(type)) return;
      let fragment = texte;
      if (!enumere) {
        const m = RE_VERBE_REMISE_DOCUMENT.exec(texte);
        if (!m) return;
        fragment = texte.slice(m.index + m[0].length);
      }
      const label = libelleDocumentGenerique(fragment);
      if (label) resultats.push({ label, cat: type === 'entretien' ? 'entretien' : 'justificatif', cleChecklist: null, generique: true });
    });
    return resultats;
  }

  function cleDocumentIdentifie(doc) {
    return normaliserPourRecherche(typeof doc === 'string' ? doc : (doc && doc.label) || '');
  }

  function detecterDocumentsAFournir(clauses) {
    const trouves = [];
    const vus = new Set();
    (clauses || []).forEach(clause => {
      documentsDepuisClause(clause).forEach(doc => {
        const cle = cleDocumentIdentifie(doc);
        if (!cle || vus.has(cle)) return;
        vus.add(cle);
        trouves.push(doc);
      });
    });
    return trouves;
  }

  // Ajoute à une liste de documents ceux que de NOUVELLES obligations font apparaître, sans rien
  // retirer ni recalculer du reste : un document que l'étude a retiré à la main ne doit pas
  // revenir parce qu'elle vient d'ajouter une autre obligation. Utilisée partout où une obligation
  // est ajoutée ou corrigée après la lecture du compromis (sélection dans le PDF, saisie libre,
  // correction, ajout sur une fiche enregistrée, suggestion du modèle local).
  function completerDocumentsIdentifies(documents, nouvellesClauses) {
    const liste = Array.isArray(documents) ? documents : [];
    const vus = new Set(liste.map(cleDocumentIdentifie));
    detecterDocumentsAFournir(nouvellesClauses).forEach(doc => {
      const cle = cleDocumentIdentifie(doc);
      if (vus.has(cle)) return;
      vus.add(cle);
      liste.push(doc);
    });
    return liste;
  }


  // Extrait les phrases où le VENDEUR s'engage à remettre/produire/fournir un document,
  // pour donner accès aux clauses exactes du compromis (et pas seulement à l'étiquette générique).
  // Un engagement n'est retenu que s'il porte sur une PIÈCE à fournir ou des TRAVAUX à réaliser :
  // les clauses générales (maintenir le bien en l'état, s'interdire de consentir un bail…) sont
  // des obligations de comportement, sans document ni chantier à suivre — elles sont écartées.
  const RE_REMISE_AUTORISATION_URBANISME = /(?:fournir|remettre|produire|transmettre|communiquer|justifier\s+de)\s+(?:au\s+[A-ZÀ-Þ]+\s*,?\s*)?(?:le\s+|la\s+|les\s+|l['’]\s*)?(?:arr[êe]t[ée]|permis\s+de\s+construire|d[ée]claration\s+(?:pr[ée]alable|attestant)|autorisations?\s+d['’]\s*urbanisme|non[-\s]?opposition|r[ée]c[ée]piss[ée]|certificat\s+de\s+conformit[ée])[^.;]*/i;
  const OBJET_DOCUMENT_RE = /certificat|attestation|justificatif|justifer|justifier|diagnostic|facture|devis|[ée]tat\s+parasitaire|police\s+d.assurance|contr[ôo]le|audit|document|arr[êe]t[ée]\s+(?:d['’]\s*autorisation|de\s+(?:permis|non[-\s]?opposition))|permis\s+de\s+construire|d[ée]claration\s+pr[ée]alable|autorisation\s+d['’]\s*urbanisme|r[ée]c[ée]piss[ée]/i;
  const OBJET_ENTRETIEN_RE = /entretien|ramon(?:age|er)|vidange|d[ée]broussaill|[ée]lagage|curage|nettoyage/i;
  const OBJET_TRAVAUX_RE = /travaux|\br[ée]par|remettre\s+en\s+[ée]tat|remise\s+en\s+[ée]tat|mise\s+en\s+conformit[ée]|r[ée]gularis|d[ée]barras|d[ée]gazage|d[ée]molition|raccordement|remplacement|d[ée]pollution|enl[èe]vement|lib[ée]rer\s+les\s+lieux|r[ée]silier/i;

  // Une énumération d'équipements vendus avec le bien (immeubles par destination) contient beaucoup
  // de mots-clés d'équipement sans être un engagement : on l'écarte explicitement.
  const LISTE_EQUIPEMENTS_RE = /immeuble\s+par\s+destination|laisser\s+dans\s+l.immeuble|sans\s+que\s+cette\s+liste\s+soit\s+limitative|biens\s+ci-apr[èe]s\s+d[ée]sign[ée]s/i;

  // Thèmes explicitement exclus de l'analyse : ils relèvent du suivi notarial classique et non
  // des pièces ou travaux à réclamer au vendeur dans le cadre de ce suivi.
  // "demande de visite" ajoutée sur retour de l'étude : une clause standard sur l'organisation de
  // visites du bien avant la vente (accès du bien à l'acquéreur/aux diagnostiqueurs...) ne
  // constitue pas un engagement à réclamer après coup, contrairement à une clause de travaux/
  // documents/entretien — elle ne doit jamais ressortir dans les obligations du vendeur.
  // "trentenaire" ajoutée de même : « le vendeur doit justifier de l'origine trentenaire » est une
  // clause de style présente dans quasiment tous les avant-contrats, et l'établissement de cette
  // origine relève du travail du notaire sur le titre — pas d'une pièce à réclamer au vendeur.
  // Clauses de style qui portent l'ancrage « le vendeur/promettant devra… » sans être pour autant
  // une pièce à réclamer. L'origine de propriété en fait partie (« devra justifier d'une origine de
  // propriété régulière remontant à un titre translatif d'au moins trente ans ») : l'établissement de
  // cette origine est le travail du notaire sur le titre, pas un justificatif à demander au vendeur.
  // « trentenaire » seul ne suffisait pas — la rédaction la plus courante écrit « trente ans » en toutes
  // lettres et n'emploie jamais l'adjectif.
  // « nouvelles législations / dispositions légales » : clause de style (« Si … de nouvelles
  // législations protectrices venaient à entrer en application, le PROMETTANT s’engage à fournir… »),
  // présente dans trois actes du corpus réel — une hypothèse, pas une pièce à réclamer.
  const EXCLUSION_ENGAGEMENT_RE = /urbanisme|permis\s+de\s+construire|d[ée]claration\s+pr[ée]alable|droit\s+de\s+pr[ée]emption|\bdia\b|bornage|servitude|cadastr|copropri[ée]t[ée]|syndic|assembl[ée]e\s+g[ée]n[ée]rale|[ée]tat\s+dat[ée]|fonds\s+de\s+travaux|charges\s+de\s+copropri[ée]t[ée]|taxe\s+fonci[èe]re|imp[ôo]t\s+foncier|quitus\s+fiscal|hypoth[ée]|mainlev[ée]e|certificat\s+de\s+radiation|privil[èe]ge\s+de\s+pr[êe]teur|demande\s+de\s+visite|trentenaire|origine\s+de\s+propri[ée]t[ée]|titre\s+translatif|nouvelles?\s+(?:l[ée]gislations?|dispositions?\s+l[ée]gales)/i;

  // Clauses purement hypothétiques : « SI le bien VENAIT À se trouver en zone contaminée, le
  // vendeur s'engage à fournir un état parasitaire ». Rien n'est dû tant que l'hypothèse ne se
  // réalise pas — ce n'est pas une pièce à réclamer à l'ouverture du dossier, contrairement au
  // renouvellement d'un diagnostic ou d'un entretien, qui lui est ferme et daté.
  const CLAUSE_HYPOTHETIQUE_RE = /\bsi\s+(?:les?|la|des|le\s+bien|l[ea]s?\s+biens?)[^.]{0,120}?\b(?:venai(?:en)?t|se\s+r[ée]v[ée]lai(?:en)?t|[ée]tai(?:en)?t|devai(?:en)?t|s['’]av[ée]rai(?:en)?t)(?=\s)|\bdans\s+(?:le\s+cas|l.hypoth[èe]se)\s+o[ùu](?=\s)|\bau\s+cas\s+o[ùu](?=\s)|\bs'il\s+(?:venait|s'av[ée]rait|appara[îi]ssait)(?=\s)|\bviendrai(?:en)?t\s+[àa]\s+se\s+trouver|\bsi\s+d(?:es|e\s+telles?)\b[^.]{0,80}\bse\s+r[ée]v[ée]lai(?:en)?t(?=\s|,)|\b(?:appara[îi]traient|surviendrai(?:en)?t|se\s+r[ée]v[ée]lerai(?:en)?t)(?=\s|,)/i;

  // Occupation, jouissance et libération des lieux : elles relèvent des modalités de remise du
  // bien le jour de l'acte, pas des pièces ou travaux à obtenir en amont.
  const OCCUPATION_JOUISSANCE_RE = /occupation\s+du\s+bien|entr[ée]e\s+en\s+jouissance|jouissance\s+(?:du\s+bien|des\s+biens|r[ée]elle)|lib[ée]rer\s+les\s+lieux|lib[ée]ration\s+des\s+lieux|libres?\s+de\s+toute\s+occupation|[ée]tat\s+des\s+lieux|remise\s+des\s+cl[ée]s/i;

  // Un compromis structure ses clauses en sections ("Conditions suspensives", "Conditions
  // particulières") découpées en rubriques titrées (CITERNE DE GAZ :, COUVERTURE :…). Les lire
  // ainsi est bien plus fiable qu'une recherche de mots-clés au fil du texte, et garantit qu'aucune
  // rubrique n'est oubliée.
  // Une ligne de sommaire : courte, presque entièrement en majuscules, sans phrase.
  function estLigneDeTitre(ligne) {
    const l = String(ligne || '').trim();
    if (!l || l.length > 60) return false;
    const lettres = l.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (lettres.length < 3) return false;
    const majuscules = l.replace(/[^A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/g, '');
    return majuscules.length / lettres.length > 0.8;
  }

  var MIN_TITRES_POUR_SOMMAIRE = 3;

  // Le premier « DÉSIGNATION » d'un acte n'est presque jamais le titre de la section recherchée :
  // beaucoup de trames ouvrent par un SOMMAIRE qui enchaîne les titres, et le mot apparaît aussi
  // au fil d'une phrase (« … dont la désignation suit »). Retenir la première occurrence faisait
  // lire une table des matières à la place du bien — c'est ce qui privait la moitié du corpus
  // d'adresse. Un vrai titre de section ouvre sa ligne et n'est pas suivi d'autres titres.
  function estDebutDeSection(texte, index, titre) {
    // Un titre de section est écrit EN CAPITALES dans toutes les trames rencontrées. C'est le
    // test décisif : « être en début de ligne » ne suffit pas, un PDF coupant ses lignes où sa
    // mise en page le veut, une phrase courante peut parfaitement commencer une ligne par
    // « désignation suit… » — et c'est exactement ce qui faisait lire à l'outil une clause de
    // style à la place de la désignation du bien.
    const mot = String(titre || '');
    if (mot !== mot.toUpperCase()) return false;
    const debutLigne = texte.lastIndexOf('\n', index) + 1;
    if (texte.slice(debutLigne, index).trim() !== '') return false;
    const lignes = texte.slice(index).split('\n').slice(1).filter(l => l.trim()).slice(0, 5);
    return lignes.filter(estLigneDeTitre).length < MIN_TITRES_POUR_SOMMAIRE;
  }

  function extraireSection(texte, titreRe, titreSuivantRe) {
    const source = String(texte || '');
    const re = new RegExp(titreRe.source, titreRe.flags.replace('g', '') + 'g');
    let debut = -1;
    let m;
    while ((m = re.exec(source)) !== null) {
      if (estDebutDeSection(source, m.index, m[0])) { debut = m.index; break; }
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    if (debut === -1) return '';
    const reste = source.slice(debut);
    const fin = titreSuivantRe ? reste.slice(20).search(titreSuivantRe) : -1;
    return fin === -1 ? reste.slice(0, 12000) : reste.slice(0, fin + 20);
  }

  // Le texte lu par pdf.js n'a qu'un retour à la ligne par page : une clause récupérée en remontant
  // jusqu'au point précédent traîne donc tout ce qui la sépare de la phrase d'avant — le renvoi
  // d'annexe qui clôt la clause précédente, le numéro de page, le titre de section. Sur l'acte
  // MOKADEM : « Annexe n°9bis 28 Le PROMETTANT s'engage… », « CONDITIONS PARTICULIERES Le
  // PROMETTANT s'engage… ». Ce sont des débris de mise en page, pas le texte de l'engagement.
  function nettoyerDebutClause(brut) {
    let t = String(brut || '').replace(/\s+/g, ' ').trim();
    let avant;
    do {
      avant = t;
      t = t.replace(/^annexes?\s+n[°ºo]\s*[\w-]+\s*/i, '')
        .replace(/^\d{1,3}\s+(?=\S)/, '')
        .replace(/^(?:[A-ZÀ-Ü'’-]{2,}\s+)+(?=[A-ZÀ-Ü][a-zà-ÿ])/, '');
    } while (t !== avant);
    return t;
  }

  var LIBELLES_TYPE_ENGAGEMENT_DIAGNOSTIC = { entretien: 'entretien à justifier', travaux: 'travaux à faire', document: 'document à produire', autre: 'autre obligation' };

  function extraireEngagementsVendeur(texte) {
    const engagements = [];
    const vus = new Set();
    // Uniquement les vrais engagements du vendeur (ce qu'il reste à faire ou à produire), et non
    // les diagnostics déjà fournis et annexés à l'acte, qui ne demandent plus aucune action.
    // Selon la nature de l'acte, le vendeur peut être désigné VENDEUR (compromis synallagmatique)
    // ou PROMETTANT (promesse unilatérale de vente, souvent réitérée par acte authentique) : les
    // deux rôles portent la même obligation de délivrance et sont traités de façon identique.
    // Apostrophe DROITE ou TYPOGRAPHIQUE : les actes d'office écrivent « s’engage » (’), et seule
    // la forme droite était reconnue — sur les promesses réelles du corpus, la quasi-totalité des
    // obligations du vendeur passait ainsi inaperçue. Le subjonctif d'une condition particulière
    // (« Que le PROMETTANT remette en état, dès avant l'acte authentique, le coffret électrique »)
    // est une obligation au même titre.
    const re = /\ble\s+(?:vendeur|promettant)\s+(?:s['’]\s*engage(?:\s+à)?|s['’]\s*oblige(?:\s+à)?|devra|remettra|produira|fournira|communiquera|justifiera|fera\s+son\s+affaire)\b|\bque\s+le\s+(?:vendeur|promettant)\s+(?:remette|fasse|produise|fournisse|justifie|r[ée]alise|proc[èe]de)\b/gi;
    let m;
    while ((m = re.exec(texte)) !== null) {
      let fin = m.index;
      let n = 0;
      while (fin < texte.length && n < 450) {
        if (texte[fin] === '.') { fin++; break; }
        fin++; n++;
      }
      let debut = m.index;
      n = 0;
      // Fenêtre arrière large : le conditionnel qui neutralise l'engagement se trouve souvent en
      // tête de phrase (« Si les biens venaient à se trouver…, le VENDEUR s'engage à… »), bien
      // avant la mention du vendeur. Trop court, on retiendrait à tort une clause hypothétique.
      while (debut > 0 && n < 300) {
        if (texte[debut - 1] === '.') break;
        debut--; n++;
      }
      const phrase = nettoyerDebutClause(texte.slice(debut, fin));
      if (phrase.length <= 25) continue;
      const ecarter = (raison) => { noterDiagnosticOutil2('engagements', 'ecartee', raison, phrase, m.index); };
      // Une autorisation d'urbanisme que le vendeur s'engage à FOURNIR est un document à obtenir (promesse réelle du 09/10 :
      // « s’engage à faire ses meilleurs efforts afin de fournir l’arrêté d’autorisation du permis de construire ») ; seul ce
      // passage est soustrait au filtre des clauses de style, qui garde le reste de la phrase.
      if (EXCLUSION_ENGAGEMENT_RE.test(phrase.replace(RE_REMISE_AUTORISATION_URBANISME, ' document '))) { ecarter('Clause de style (garantie, visite, origine de propriété…)'); continue; }
      if (LISTE_EQUIPEMENTS_RE.test(phrase)) { ecarter('Énumération d’équipements vendus avec le bien'); continue; }
      if (CLAUSE_HYPOTHETIQUE_RE.test(phrase)) { ecarter('Engagement conditionnel (« si… »)'); continue; }
      if (OCCUPATION_JOUISSANCE_RE.test(phrase)) { ecarter('Occupation ou jouissance du bien'); continue; }

      const estEntretien = OBJET_ENTRETIEN_RE.test(phrase);
      const estTravaux = OBJET_TRAVAUX_RE.test(phrase);
      const estDocument = OBJET_DOCUMENT_RE.test(phrase);
      let type = null;
      if (!estEntretien && !estTravaux && !estDocument) {
        // La phrase correspond bien à l'ancrage strict ("le vendeur/promettant s'engage...") mais
        // aucun des trois motifs d'objet ne la catégorise — jusqu'ici, systématiquement abandonnée
        // (continue), même quand un(e) collaborateur(rice) avait déjà catégorisé à la main une
        // clause très proche lors d'un import précédent (voir ajouterEngagementManuel()/
        // ajouterEngagementDepuisFormulaire() ci-dessus). Reste borné à ce périmètre déjà anchré :
        // ne s'applique jamais à une phrase qui n'aurait pas d'abord passé ce motif strict, donc ne
        // risque pas d'élargir la détection à des sentences arbitraires du document.
        const apprise = trouverCorrectionApprise(phrase, 'engagement');
        if (!apprise) { ecarter('Objet non reconnu : ni entretien, ni travaux, ni document à produire'); continue; }
        type = apprise.classification;
      } else {
        // L'entretien prime : « justifier du dernier ramonage » est un entretien à prouver, pas des
        // travaux à faire exécuter — la distinction compte pour savoir quoi réclamer au vendeur.
        type = 'document';
        if (estEntretien) type = 'entretien';
        else if (estTravaux) type = 'travaux';
      }

      // Clé = la phrase entière : deux engagements qui commencent pareil (« s’engage à faire ses meilleurs efforts afin de
      // fournir … ») ne sont pas le même (promesse réelle du 09/10 : l’arrêté du permis disparaissait derrière la facture).
      const cle = phrase.replace(/\s+/g, ' ').trim();
      if (!vus.has(cle)) {
        vus.add(cle);
        noterDiagnosticOutil2('engagements', 'retenue', 'Retenue : ' + (LIBELLES_TYPE_ENGAGEMENT_DIAGNOSTIC[type] || type), phrase, m.index);
        engagements.push({ phrase, type, page: pageDepuisIndex(m.index) });
      }
    }
    return engagements;
  }

  // Accepte le nouveau format {label, cat} comme l'ancien (simple chaîne), pour que les dossiers
  // enregistrés avant cette évolution continuent de s'afficher.
  // `dossierId` absent (pendant l'import, voir afficherAnalyseJuridique) → la croix retire l'entrée
  // de analyseJuridiqueActuelle.documents (supprimerDocumentManuel) ; `dossierId` fourni (fiche
  // d'un dossier déjà enregistré, voir renderCarteDossier) → elle retire l'entrée de
  // d.analyseJuridique.documents avec confirmation + historique (supprimerDocumentDossier).
  // Demandé par l'étude : jusqu'ici aucun document identifié n'était retirable, dans aucun des
  // deux contextes.
  function renderDocBadge(doc, index, dossierId) {
    const label = (typeof doc === 'string') ? doc : doc.label;
    const cat = (typeof doc === 'string') ? '' : (doc.cat || '');
    const appelSuppr = dossierId
      ? `supprimerDocumentDossier('${dossierId}', ${index})`
      : `supprimerDocumentManuel(${index})`;
    const boutonSuppr = `<wa-button appearance="plain" size="s" type="button" class="bouton-icone analyse-doc-suppr" onclick="${appelSuppr}" title="Retirer ce document de la liste" aria-label="Retirer ce document">${icone('x')}</wa-button>`;
    return `<span class="analyse-doc-badge${cat ? ' cat-' + cat : ''}">${escapeHtml(label)}${boutonSuppr}</span>`;
  }

  // Accepte aussi bien le nouveau format {phrase, type} que l'ancien (simple chaîne), pour que
  // les dossiers enregistrés avant cette évolution continuent de s'afficher correctement.
  // Bouton de suppression désormais affiché pour TOUT engagement, plus seulement ceux ajoutés à la
  // main — demandé par l'étude (jusqu'ici, un engagement détecté automatiquement ne pouvait être
  // corrigé qu'en resserrant la regex, jamais retiré au cas par cas ; revu ici explicitement à sa
  // demande). `dossierId` absent (import, voir afficherAnalyseJuridique) → retire de
  // analyseJuridiqueActuelle.engagements (supprimerEngagementManuel, sans confirmation : pré-
  // enregistrement, reversible en réimportant) ; `dossierId` fourni (fiche enregistrée, voir
  // renderCarteDossier) → retire de d.analyseJuridique.engagements avec confirmation + historique
  // (supprimerEngagementDossier).
  function renderEngagement(e, index, dossierId) {
    const phrase = (typeof e === 'string') ? e : e.phrase;
    const type = (typeof e === 'string') ? null : e.type;
    const page = (typeof e === 'string') ? null : e.page;
    const manuel = typeof e === 'object' && e.manuel === true;
    const suggereParIa = typeof e === 'object' && e.source === 'ia';
    const libelles = { entretien: 'Entretien', travaux: 'Travaux', document: 'Document', autre: 'Autres' };

    // Édition d'un engagement ajouté via l'option de surlignage (ou tout autre engagement) :
    // demandé par l'étude pour corriger une clause sans devoir la supprimer puis la ressaisir en
    // entier. `dossierId` distingue le même contexte import/fiche que la suppression ci-dessous.
    const enEdition = engagementEnEdition
      && engagementEnEdition.dossierId === (dossierId || null)
      && engagementEnEdition.index === index;
    if (enEdition) {
      const appelValider = dossierId ? `validerEditionEngagement('${dossierId}', ${index})` : `validerEditionEngagement(null, ${index})`;
      const appelAnnuler = dossierId ? `annulerEditionEngagement('${dossierId}')` : `annulerEditionEngagement(null)`;
      const typeActuel = type || 'document';
      return `<div class="analyse-engagement-ligne analyse-engagement-edition">
        <select id="engagement-edition-type">
          ${Object.entries(libelles).map(([val, label]) => `<option value="${val}"${typeActuel === val ? ' selected' : ''}>${label}</option>`).join('')}
        </select>
        <textarea id="engagement-edition-texte" rows="2">${escapeHtml(phrase)}</textarea>
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-valider" onclick="${appelValider}" title="Valider" aria-label="Valider la modification">✓</wa-button>
        <button type="button" class="icon-btn" onclick="${appelAnnuler}">Annuler</button>
      </div>`;
    }

    const etiquette = type
      ? `<span class="engagement-type ${libelles[type] ? type : 'document'}">${libelles[type] || 'Document'}</span>`
      : '';
    // Le clic pour sauter à la page ET surligner la phrase (voir voirEngagementDansPdf, même
    // esprit que voirDateDansPdf pour les dates — demandé par l'étude) n'est possible que si le
    // PDF d'origine est encore chargé en mémoire — jamais le cas sur un dossier déjà enregistré
    // rouvert plus tard (le PDF lui-même n'est pas conservé). Le numéro de page reste malgré tout
    // indiqué dans ce cas, à titre indicatif : c'est justement le cas d'usage le plus courant
    // (relire une clause quelques jours après l'import du compromis).
    const boutonVoir = !page ? '' : pdfActuel
      ? `<button type="button" class="voir-pdf-btn" onclick="voirEngagementDansPdf(${page}, '${codifierPourAttribut(phrase)}')">${icone('eye')} p.${page}</button>`
      : `<span class="chip-page" title="Détecté page ${page} du compromis">p.${page}</span>`;
    // Sélectionnée à la main dans l'aperçu PDF (voir gererSelectionPdf) plutôt que trouvée par
    // extraireEngagementsVendeur() : uniquement indicatif désormais (voir plus haut, la croix de
    // suppression s'affiche pour tous les engagements, pas seulement ceux-ci).
    // Même emplacement/style que le marqueur "Ajouté manuellement" (texte simple, pas d'icône) —
    // seul le texte change selon la provenance ; jamais les deux en même temps (source mutuellement
    // exclusive : soit sélectionné à la main dans le PDF, soit suggéré par l'IA, soit détecté par
    // regex sans marqueur du tout).
    const marqueurManuel = manuel
      ? '<span class="engagement-manuel">Ajouté manuellement</span>'
      : (suggereParIa ? '<span class="engagement-manuel" title="Extrait par le modèle IA local — à vérifier comme toute suggestion automatique">Suggéré par l\'IA</span>' : '');
    const appelSuppr = dossierId
      ? `supprimerEngagementDossier('${dossierId}', ${index})`
      : `supprimerEngagementManuel(${index})`;
    const boutonSupprimer = `<button type="button" class="engagement-suppr" onclick="${appelSuppr}" title="Retirer cet engagement" aria-label="Retirer cet engagement">${icone('x')}</button>`;
    const appelEditer = dossierId ? `activerEditionEngagement('${dossierId}', ${index})` : `activerEditionEngagement(null, ${index})`;
    const boutonEditer = `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-crayon" onclick="${appelEditer}" title="Modifier cet engagement" aria-label="Modifier cet engagement">${icone('pencil')}</wa-button>`;
    // Fiche enregistrée : une case « réalisé » (étude, 02/10), comptée dans le statut du dossier.
    const d = dossierId ? dossiers.find(x => x.id === dossierId) : null;
    if (d) {
      const et = etatEngagementAnalyse(d, e);
      const intitule = `Engagement du vendeur : ${libelleCourtEngagement(e)}`;
      const caseHtml = et.auto
        ? `<span class="piece-case analyse-case" role="checkbox" aria-checked="true" aria-disabled="true" aria-label="${escapeAttr(intitule)}" title="${escapeAttr(et.motif)}">${icone('check')}</span>`
        : `<button type="button" class="piece-case analyse-case" role="checkbox" aria-checked="${et.fait}" aria-label="${escapeAttr(intitule)}" title="${escapeAttr(et.fait ? `${et.motif} — cliquer pour le remettre à faire` : 'Cocher une fois réalisé (justificatif reçu, travaux faits)')}" onclick="basculerEngagementFait('${dossierId}', ${index})">${et.fait ? icone('check') : ''}</button>`;
      const tag = et.auto ? '<span class="piece-tag">pièce reçue</span>' : '';
      return `<div class="analyse-engagement-ligne avec-case${et.fait ? ' fait' : ''}">${caseHtml}${etiquette}<span class="analyse-engagement-texte">${escapeHtml(phrase)}</span>${tag}${marqueurManuel}${boutonVoir}${boutonEditer}${boutonSupprimer}</div>`;
    }
    // Clause en entier (étude, 02/10 au soir : « mets les engagements en entier »), page à un clic.
    return `<div class="analyse-engagement-ligne"><span class="analyse-engagement-texte">${escapeHtml(phrase)}</span>${etiquette}${boutonVoir}${boutonEditer}${boutonSupprimer}</div>`;
  }

  // Document relevé dans l'avant-contrat, sur une fiche enregistrée : une ligne cochable. S'il est
  // aussi une pièce de la checklist, la case est celle de la pièce (même état que l'onglet Pièces).
  function renderDocumentAnalyse(d, doc, index) {
    const label = typeof doc === 'string' ? doc : doc.label;
    const cle = cleChecklistDocumentAnalyse(d, doc);
    const recu = documentAnalyseRecu(d, doc);
    const trouveeNas = cle && recu && !(d.piecesValideesManuellement || []).includes(cle);
    const titre = trouveeNas ? 'Reçue — trouvée dans le dossier du NAS — cliquer pour la décocher (réinitialiser)'
      : recu ? `Reçu${doc && doc.recuLe ? ` (coché le ${formatDateFr(String(doc.recuLe).slice(0, 10))})` : ' (validé à la main)'} — cliquer pour le remettre à recevoir`
        : 'Cocher une fois reçu';
    const caseHtml = `<button type="button" class="piece-case analyse-case" role="checkbox" aria-checked="${recu}" aria-label="${escapeAttr(label)}" title="${escapeAttr(titre)}" onclick="basculerDocumentAnalyseRecu('${d.id}', ${index})">${recu ? icone('check') : ''}</button>`;
    return `<div class="analyse-doc-ligne${recu ? ' recu' : ''}">${caseHtml}<span class="analyse-doc-nom">${escapeHtml(label)}</span>${cle ? '<span class="piece-tag" title="Même pièce que dans la checklist">checklist</span>' : ''}<wa-button appearance="plain" size="s" type="button" class="bouton-icone analyse-doc-suppr" onclick="supprimerDocumentDossier('${d.id}', ${index})" title="Retirer ce document de la liste" aria-label="Retirer ce document">${icone('x')}</wa-button></div>`;
  }

  function basculerEngagementFait(dossierId, index) {
    const d = dossiers.find(x => x.id === dossierId);
    const liste = d && d.analyseJuridique && d.analyseJuridique.engagements;
    if (!liste || liste[index] === undefined) return;
    if (typeof liste[index] === 'string') liste[index] = { phrase: liste[index], type: null, page: null };
    const e = liste[index];
    if (etatEngagementAnalyse(d, e).auto) return;
    e.fait = !e.fait;
    d.pieces = d.pieces || {};
    if (e.fait) {
      e.faitLe = new Date().toISOString();
      // Les pièces de la checklist que cet engagement fait réclamer (« Travaux de remise en état »…)
      // suivent : validées à la main, sans quoi le dossier les attendrait encore. Retenues sur
      // l'engagement pour être rendues si on le décoche.
      const cles = Array.from(new Set(documentsDepuisClause(e).map(doc => cleChecklistDocumentAnalyse(d, doc)).filter(Boolean)))
        .filter(cle => d.pieces[cle] !== 'recue');
      cles.forEach(cle => {
        d.pieces[cle] = 'recue';
        d.piecesValideesManuellement = Array.from(new Set([...(d.piecesValideesManuellement || []), cle]));
      });
      if (cles.length) e.piecesValidees = cles; else delete e.piecesValidees;
    } else {
      delete e.faitLe;
      (e.piecesValidees || []).forEach(cle => {
        if (!(d.piecesValideesManuellement || []).includes(cle)) return;
        d.piecesValideesManuellement = d.piecesValideesManuellement.filter(c => c !== cle);
        d.pieces[cle] = 'manquante';
      });
      delete e.piecesValidees;
    }
    ajouterHistorique(d, `${e.fait ? 'Engagement du vendeur réalisé' : 'Engagement du vendeur remis à faire'} : « ${libelleCourtEngagement(e)} »`);
    signalerSiDossierDevenuComplet(d);
    sauvegarder(d);
    render();
  }

  function basculerDocumentAnalyseRecu(dossierId, index) {
    const d = dossiers.find(x => x.id === dossierId);
    const liste = d && d.analyseJuridique && d.analyseJuridique.documents;
    if (!liste || liste[index] === undefined) return;
    const cle = cleChecklistDocumentAnalyse(d, liste[index]);
    if (cle) {
      // Pièce de la checklist : mêmes gestes que dans l'onglet Pièces (avec leur confirmation).
      const piece = checklistPieces(d.typeVente, d).find(p => p.cle === cle);
      const recue = (d.pieces || {})[cle] === 'recue';
      if (!recue) validerPieceManuellement(d.id, cle, piece.label);
      else if ((d.piecesValideesManuellement || []).includes(cle)) retirerValidationManuellePiece(d.id, cle, piece.label);
      else if (piece.personnalisee) basculerStatutPiecePersonnalisee(d.id, cle);
      else reinitialiserStatutPieceStandard(d.id, cle, piece.label);
      return;
    }
    if (typeof liste[index] === 'string') liste[index] = { label: liste[index], cat: '' };
    const doc = liste[index];
    doc.recu = !doc.recu;
    if (doc.recu) doc.recuLe = new Date().toISOString(); else delete doc.recuLe;
    ajouterHistorique(d, `${doc.recu ? 'Document reçu' : 'Document remis à recevoir'} (analyse de l’avant-contrat) : « ${doc.label} »`);
    signalerSiDossierDevenuComplet(d);
    sauvegarder(d);
    render();
  }

  function activerEditionEngagement(dossierId, index) {
    engagementEnEdition = { dossierId: dossierId || null, index };
    if (dossierId) render(); else afficherAnalyseJuridique();
  }

  function annulerEditionEngagement(dossierId) {
    engagementEnEdition = null;
    if (dossierId) render(); else afficherAnalyseJuridique();
  }

  // Valide l'édition d'un engagement (voir activerEditionEngagement ci-dessus) : agit sur
  // analyseJuridiqueActuelle pendant l'import (dossierId absent) ou sur d.analyseJuridique pour un
  // dossier déjà enregistré, même distinction que supprimerEngagementManuel/supprimerEngagementDossier.
  // Alimente aussi l'apprentissage (memoriserCorrection, catégorie 'engagement') : une correction
  // d'engagement est un signal aussi utile qu'un ajout pour reconnaître une clause proche au
  // prochain import (voir CLAUDE.md, "Apprentissage sur les clauses ajoutées manuellement").
  function validerEditionEngagement(dossierId, index) {
    const texteEl = document.getElementById('engagement-edition-texte');
    const typeEl = document.getElementById('engagement-edition-type');
    const phrase = texteEl ? texteEl.value.trim() : '';
    const type = typeEl ? typeEl.value : 'document';
    if (!phrase) { if (texteEl) texteEl.focus(); return; }

    if (dossierId) {
      const d = dossiers.find(x => x.id === dossierId);
      const cible = d && d.analyseJuridique && d.analyseJuridique.engagements[index];
      if (!cible) { engagementEnEdition = null; render(); return; }
      cible.phrase = phrase;
      cible.type = type;
      ajouterHistorique(d, `Engagement du vendeur modifié : « ${phrase.slice(0, 80)}${phrase.length > 80 ? '…' : ''} »`);
      memoriserCorrection(phrase, type, null, 'engagement');
      d.analyseJuridique.documents = completerDocumentsIdentifies(d.analyseJuridique.documents, [{ phrase, type }]);
      engagementEnEdition = null;
      sauvegarder(d);
      render();
    } else {
      const cible = analyseJuridiqueActuelle.engagements[index];
      if (!cible) { engagementEnEdition = null; afficherAnalyseJuridique(); return; }
      cible.phrase = phrase;
      cible.type = type;
      memoriserCorrection(phrase, type, null, 'engagement');
      completerDocumentsIdentifies(analyseJuridiqueActuelle.documents, [{ phrase, type }]);
      engagementEnEdition = null;
      afficherAnalyseJuridique();
    }
  }

  // L'analyse juridique est sa propre étape du wizard (étape 3, voir definirEtapeWizard) — plus un
  // onglet superposé à l'aperçu PDF : aucune étape n'étant verrouillée, elle reste accessible même
  // sans rien à montrer (message d'état vide ci-dessous), pas besoin de la cacher.
  function afficherAnalyseJuridique() {
    const listeDocs = document.getElementById('analyse-documents-liste');
    const note = document.getElementById('analyse-note');
    const vide = document.getElementById('analyse-vide-etat');
    const { documents, engagements } = analyseJuridiqueActuelle;

    const analyseJuridiqueDisponible = documents.length > 0 || engagements.length > 0;
    if (vide) vide.style.display = analyseJuridiqueDisponible ? 'none' : 'block';
    if (!analyseJuridiqueDisponible) {
      document.getElementById('analyse-section-engagements').style.display = 'none';
      const sectionDocuments = document.getElementById('analyse-section-documents');
      if (sectionDocuments) sectionDocuments.style.display = 'none';
      note.style.display = 'none';
      return;
    }
    const sectionDocumentsVisible = document.getElementById('analyse-section-documents');
    if (sectionDocumentsVisible) sectionDocumentsVisible.style.display = 'block';

    // Les engagements sont affichés directement : ce sont les actions à suivre, elles ne doivent
    // pas être cachées derrière un clic.
    const sectionEngagements = document.getElementById('analyse-section-engagements');
    sectionEngagements.style.display = engagements.length > 0 ? 'block' : 'none';
    document.getElementById('analyse-nb-engagements').textContent = engagements.length || '';
    document.getElementById('analyse-engagements-liste').innerHTML = engagements
      .map((e, i) => renderEngagement(e, i))
      .join('');

    document.getElementById('analyse-nb-documents').textContent = documents.length || '';
    listeDocs.innerHTML = documents.length > 0
      ? documents.map((doc, i) => renderDocBadge(doc, i)).join('')
      : '<span class="analyse-vide">Aucun document type reconnu automatiquement.</span>';

    // La reconnaissance des documents s'appuie sur une liste de types courants : si le compromis
    // contient plus de clauses d'engagement que de documents identifiés, c'est le signe qu'une
    // pièce sort de cette liste. On le signale plutôt que de laisser croire à une liste exhaustive.
    if (engagements.length > documents.length) {
      note.style.display = 'block';
      // Le liseré ambre de .analyse-note (voir style.css) porte déjà l'avertissement : un préfixe
      // "⚠️" en plus ne faisait que répéter ce que la couleur dit déjà.
      note.textContent = documents.length === 0
        ? 'Aucun document type reconnu dans ces engagements.'
        : `Liste peut-être incomplète : ${engagements.length} engagements pour ${documents.length} document${documents.length > 1 ? 's' : ''}.`;
    } else {
      note.style.display = 'none';
    }
  }

  // Extrait la phrase contenant la date (bornée par un maximum de caractères) plutôt qu'une simple
  // fenêtre de N caractères, pour éviter qu'un mot-clé d'une phrase voisine ne s'y mélange.
  // Un point qui NE termine PAS la phrase : abréviation (« article L. 313-41 », « art. », « Me. »)
  // ou séparateur de milliers (« 20.700,00 € »). Pris pour une fin de phrase, il coupait le contexte
  // d'une vraie échéance de prêt (« L'obtention du ou des prêts devra, … article L. 313-41 du Code
  // de la consommation, intervenir au plus tard le 5 Août 2023 ») juste avant le mot « prêts » :
  // la date restait sans catégorie et une autre, sans rapport, prenait sa place.
  function pointNonTerminal(texte, i) {
    const avant = texte.slice(Math.max(0, i - 5), i);
    if (/\d$/.test(avant) && /^\d/.test(texte.slice(i + 1, i + 2))) return true;
    return /(?:^|[\s(])(?:[A-Z]|art|Art|al|cf|Me|MM|Mme|Mlle|St|Ste)$/.test(avant);
  }

  function extraireContexte(texte, index, longueur) {
    const MAX_AVANT = 260, MAX_APRES = 220;
    let debut = index;
    let n = 0;
    while (debut > 0 && n < MAX_AVANT) {
      const ch = texte[debut - 1];
      if (ch === '.' && !pointNonTerminal(texte, debut - 1)) break;
      debut--; n++;
    }
    let fin = index + longueur;
    n = 0;
    while (fin < texte.length && n < MAX_APRES) {
      const ch = texte[fin];
      if (ch === '.' && !pointNonTerminal(texte, fin)) { fin++; break; }
      fin++; n++;
    }
    return texte.slice(debut, fin).replace(/\s+/g, ' ').trim();
  }

  // « dans les 2 mois ET DEMI » : le demi-mois (quinze jours) était ignoré, et la date calculée
  // tombait quinze jours trop tôt — constaté sur un vrai compromis, dont l'acte donnait lui-même la
  // date exacte juste après (« soit le 5 mars 2026 »), qui correspond bien à 2 mois + 15 jours.
  function echeanceDepuisDelai(texte, finMotif, base, delai) {
    const iso = calculerDateEcheance(base, delai);
    if (!iso || delai.unite !== 'mois') return iso;
    return /^\s+et\s+demi\b/i.test(texte.slice(finMotif, finMotif + 20)) ? addDays(iso, 15) : iso;
  }

  function detecterDatesDepuisTexte(texte, dateCompromis) {
    const resultats = [];
    const seen = new Set();

    // Un acte cite volontiers un texte de loi mot pour mot, entre guillemets. Le délai qui s'y
    // trouve appartient au texte cité, jamais aux engagements de CE contrat : sur une promesse
    // réelle, « au plus tard un mois après la signature de l'acte authentique de vente », citation
    // de l'article 1331-11-1, devenait la date de signature de l'acte du dossier. Le test
    // « le contexte cite-t-il un article de loi ? » serait bien trop large — la vraie condition
    // suspensive de prêt cite elle aussi ses articles du Code de la consommation ; c'est bien le
    // GUILLEMET OUVRANT non refermé qui distingue une citation d'une stipulation.
    function estDansCitation(source, index) {
      const avant = source.slice(Math.max(0, index - PORTEE_CITATION), index);
      return avant.lastIndexOf('«') > avant.lastIndexOf('»');
    }

    function ajouter(iso, label, index, longueur, approx, calcul) {
      // Un délai dont le point de départ est inconnu ne produit aucune date : calculerDateEcheance
      // renvoie null plutôt que de compter depuis la signature par défaut.
      if (!iso) return;
      if (seen.has(iso)) return;
      // Écarte toute date antérieure ou égale à la signature du compromis (diagnostics, actes précédents…).
      if (dateCompromis && iso <= dateCompromis) return;
      const contexte = extraireContexte(texte, index, longueur);
      if (EXCLUSION_RE.test(contexte.toLowerCase())) return;
      if (estDansCitation(texte, index)) return;
      // Voir A_COMPTER_RE ci-dessus : une date immédiatement introduite par "à compter du/de" est
      // une prise d'effet, pas une échéance — sauf si la clause parle de la réitération de l'acte
      // de vente lui-même, seul cas où cette date-là EST la bonne échéance. \br[ée]it[ée]r couvre
      // aussi bien le verbe ("sera réitéré") que le nom ("réitération"), pas seulement ce dernier.
      if (A_COMPTER_RE.test(texte.slice(Math.max(0, index - 30), index)) && !/\br[ée]it[ée]r/i.test(contexte)) return;
      let suggestion = suggererEcheance(contexte);
      // Un délai ancré sur la signature dont la PHRASE ne nomme pas le prêt restait sans catégorie :
      // la date était correctement calculée (60 jours après la signature) puis jamais reportée dans
      // « Obtention du prêt », le champ restait vide. C'est le cas dès que la clause s'intitule
      // « CONDITION SUSPENSIVE D'OBTENTION DE PRÊT » mais que la phrase du délai, elle, dit
      // seulement « … devra obtenir son offre au plus tard dans les 60 jours » — rédaction
      // courante. Signalé par l'étude (« il ne calcule plus les dates d'obtention de prêt quand il
      // y a des jours ») ; vérifié au passage que la version d'avant la refonte de l'extraction se
      // comportait déjà ainsi — ce n'est pas une régression, mais une limite jamais levée.
      // On élargit donc à la CLAUSE (600 caractères en amont, l'échelle d'un paragraphe d'acte)
      // uniquement pour ces dates-là : `calcul` n'est renseigné que pour une date issue d'un délai.
      // Sans risque de rattraper la clause de notification du refus au notaire : celle-ci est déjà
      // écartée en amont par le garde-fou « notifier/notification » de reAuPlusTardDelai et
      // reAuPlusTardApres, avant même d'arriver ici. La date reste marquée « ≈ estimée », donc
      // signalée comme à vérifier, exactement comme les autres dates déduites d'un délai.
      // Jamais pour un délai de VERSEMENT (indemnité, dépôt de garantie) : sur une vraie promesse,
      // « verser … au plus tard dans les dix jours à compter des présentes » suit immédiatement le
      // tableau de financement (« Fonds empruntés… »), et la date de versement de l'indemnité
      // ressortait classée « prêt ».
      if (!suggestion && calcul && !RE_DELAI_DE_VERSEMENT.test(contexte)) {
        const clause = texte.slice(Math.max(0, index - 600), index + longueur);
        if (VOCABULAIRE_PRET_CLAUSE_RE.test(clause)) suggestion = 'pret';
      }
      // Une correction déjà faite par un(e) collaborateur(rice) sur une clause très proche
      // l'emporte sur la suggestion par mots-clés (voir la section "apprentissage" plus bas).
      const apprise = trouverCorrectionApprise(contexte);
      if (apprise) suggestion = apprise.classification;
      seen.add(iso);
      resultats.push({
        iso, label, contexte, suggestion, active: !!suggestion, page: pageDepuisIndex(index),
        apprise: !!apprise, libelleAppris: apprise ? apprise.libelle : null,
        approx: !!approx,
        // Champ additif (aucun appelant existant ne le lit) : trace de quoi la date a été déduite
        // quand elle vient d'un délai, pour que l'objet date métier puisse afficher « calculée à
        // partir de la signature + 60 jours » plutôt qu'une date qui semble lue dans le texte.
        calcul: calcul || null,
        index
      });
    }

    const reNum = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g;
    let m;
    while ((m = reNum.exec(texte)) !== null) {
      const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        ajouter(toISO(y, mo - 1, d), m[0], m.index, m[0].length);
      }
    }

    const moisNoms = Object.keys(MOIS).join('|');
    // (?:er)? : voir le commentaire équivalent dans extraireDateDeFragment — "le 1er janvier"
    // sans ce groupe n'est jamais détecté.
    const reTexte = new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${moisNoms})\\s+(\\d{4})\\b`, 'gi');
    while ((m = reTexte.exec(texte)) !== null) {
      const d = parseInt(m[1], 10);
      const moKey = m[2].toLowerCase();
      const y = parseInt(m[3], 10);
      if (MOIS.hasOwnProperty(moKey)) {
        ajouter(toISO(y, MOIS[moKey], d), m[0], m.index, m[0].length);
      }
    }

    // Date arrondie à la fin d'un mois ("avant fin septembre 2026", "d'ici fin septembre 2026") :
    // résolue au dernier jour civil de ce mois, marquée "approx" (badge "≈ estimée" côté chip/
    // confiance) plutôt que traitée comme une date lue telle quelle. L'année doit être écrite
    // explicitement dans le texte : sans elle, il faudrait deviner entre l'année du compromis et la
    // suivante selon le mois — exactement le genre de supposition qui a déjà produit une mauvaise
    // date silencieuse (voir l'historique des bugs corrigés dans CLAUDE.md). Pas trouvée → pas
    // ajoutée, l'utilisateur la saisit à la main comme pour tout ce que l'outil ne reconnaît pas.
    const reFinMois = new RegExp(`\\bfin\\s+(${moisNoms})\\s+(\\d{4})\\b`, 'gi');
    while ((m = reFinMois.exec(texte)) !== null) {
      const moKey = m[1].toLowerCase();
      const y = parseInt(m[2], 10);
      if (MOIS.hasOwnProperty(moKey)) {
        const dernierJour = new Date(y, MOIS[moKey] + 1, 0).getDate();
        ajouter(toISO(y, MOIS[moKey], dernierJour), m[0], m.index, m[0].length, true);
      }
    }

    // Délai relatif à la signature ("délai de 30 jours à compter de la signature", "J+30") :
    // seulement calculable si la date de signature du compromis a été trouvée (dateCompromis) — sans
    // ancre fiable, on ne devine pas à partir de quoi compter, on laisse l'utilisateur l'ajouter lui-même.
    if (dateCompromis) {
      // « jours » ou « mois » : un délai de réitération est très souvent exprimé en mois
      // (« dans les trois mois de la signature ») — jusqu'ici seuls les jours étaient reconnus,
      // et ces clauses passaient entièrement inaperçues. Le calcul passe par
      // calculerDateEcheance (voir le socle de calcul), de quantième à quantième pour les mois.
      const reDelai = new RegExp('d[ée]lai\\s+de\\s+' + MOTIF_NOMBRE + '\\s*(jours?|mois)\\s+(?:[àa]\\s+compter|[àa]\\s+partir)\\s+de\\s+(?:la\\s+signature|ce\\s+jour|l[\'’]acte|la\\s+pr[ée]sente|le\\s+pr[ée]sent\\s+(?:compromis|acte)|la\\s+promesse)', 'gi');
      while ((m = reDelai.exec(texte)) !== null) {
        const delai = { valeur: valeurNombre(m[1]), unite: uniteDelai(m[2]) };
        ajouter(echeanceDepuisDelai(texte, m.index + m[0].length, dateCompromis, delai), m[0], m.index, m[0].length, true,
          { delai, pointDepart: 'signature', baseDate: dateCompromis });
      }
      const reJPlus = /\bJ\s*\+\s*(\d{1,3})\b/g;
      while ((m = reJPlus.exec(texte)) !== null) {
        const delai = { valeur: parseInt(m[1], 10), unite: 'jours' };
        ajouter(echeanceDepuisDelai(texte, m.index + m[0].length, dateCompromis, delai), m[0], m.index, m[0].length, true,
          { delai, pointDepart: 'signature', baseDate: dateCompromis });
      }
      // "au plus tard dans les 60 jours" (ou "dans un délai de 60 jours") : formulation réelle
      // d'une condition suspensive d'obtention de prêt (voir CLAUDE.md — texte anonymisé fourni
      // par l'étude), sans date calendaire NI ancre explicite ("à compter de..." absent ici,
      // contrairement à reDelai ci-dessus). Compté à partir de la signature de la promesse elle-
      // même (« la présente convention… ») faute d'autre point de départ indiqué dans la clause —
      // même convention implicite que les ancres "la présente"/"ce jour" déjà acceptées par
      // reDelai.
      //
      // Bug corrigé : la même promesse porte presque toujours un second délai, avec la même
      // tournure, pour la notification du refus/de l'octroi au notaire (ex. "au plus tard dans les
      // 70 jours, les offres à lui faites ou le refus opposé aux demandes de prêt") — ce n'est PAS
      // la condition elle-même, seulement une formalité de communication qui la suit. Signalé par
      // l'étude : garder les deux (même en signalant une ambiguïté) polluait le champ avec un choix
      // à trancher alors que le bon candidat est déterministe ici — le délai de notification est
      // systématiquement associé à "notifier"/"notification" dans les ~200 caractères qui précèdent
      // (voir la clause réelle ci-dessus), on l'écarte donc totalement plutôt que de le détecter
      // pour ensuite le désambiguïser.
      const reAuPlusTardDelai = new RegExp('au\\s+plus\\s+tard\\s+dans\\s+(?:les?|un\\s+d[ée]lai\\s+de)\\s+' + MOTIF_NOMBRE + '\\s*(jours?|mois)', 'gi');
      while ((m = reAuPlusTardDelai.exec(texte)) !== null) {
        const avant = texte.slice(Math.max(0, m.index - 200), m.index);
        if (/notifier|notification/i.test(avant)) continue;
        const delai = { valeur: valeurNombre(m[1]), unite: uniteDelai(m[2]) };
        ajouter(echeanceDepuisDelai(texte, m.index + m[0].length, dateCompromis, delai), m[0], m.index, m[0].length, true,
          { delai, pointDepart: 'signature', baseDate: dateCompromis });
      }
      // "au plus tard 60 jours après la signature des présentes" : autre formulation réelle de la
      // même condition suspensive de prêt exprimée en délai (fournie par l'étude), avec cette
      // fois un point de départ explicite ("après <ancre>") plutôt qu'implicite comme
      // reAuPlusTardDelai ci-dessus. Mêmes ancres que reDelai, même garde-fou contre la clause
      // de notification (le refus/l'octroi communiqué au notaire porte souvent un second délai,
      // distinct de la condition elle-même — voir reAuPlusTardDelai).
      const reAuPlusTardApres = new RegExp('au\\s+plus\\s+tard\\s+' + MOTIF_NOMBRE + '\\s*(jours?|mois)\\s+apr[èe]s\\s+(?:la\\s+signature|ce\\s+jour|l[\'’]acte|la\\s+pr[ée]sente|le\\s+pr[ée]sent\\s+(?:compromis|acte)|la\\s+promesse)', 'gi');
      while ((m = reAuPlusTardApres.exec(texte)) !== null) {
        const avant = texte.slice(Math.max(0, m.index - 200), m.index);
        if (/notifier|notification/i.test(avant)) continue;
        const delai = { valeur: valeurNombre(m[1]), unite: uniteDelai(m[2]) };
        ajouter(echeanceDepuisDelai(texte, m.index + m[0].length, dateCompromis, delai), m[0], m.index, m[0].length, true,
          { delai, pointDepart: 'signature', baseDate: dateCompromis });
      }
    }

    resultats.sort((a, b) => a.iso.localeCompare(b.iso));
    return resultats;
  }

  function majAffichageCompromis() {
    // Bandeau « Date de signature détectée » retiré de l'étape Vérifier à la demande de l'étude :
    // la date de signature figure déjà dans le panneau « Ce que l'outil a compris » (ligne
    // « signature », éditable — voir CHAMPS_REVISION et modifierDonneeRevision, qui appelle
    // corrigerDateCompromis, y compris quand la date n'a pas été trouvée). Le bloc #compromis-info
    // reste dans le DOM (encore référencé par toggleCompromisEdit/corrigerDateCompromis) mais n'est
    // plus jamais affiché : une seule surface pour cette date.
    const info = document.getElementById('compromis-info');
    if (info) info.style.display = 'none';
  }

  function toggleCompromisEdit() {
    const input = document.getElementById('f-date-compromis');
    input.style.display = input.style.display === 'none' ? 'inline-block' : 'none';
    if (input.style.display === 'inline-block') input.value = dateCompromisDetectee || '';
  }

  function corrigerDateCompromis(valeur) {
    if (!valeur) return; // un champ vidé en cours de frappe ne doit rien réinitialiser
    if (dateIncompleteEnCoursDeSaisie(valeur)) return; // année encore en cours de frappe (an 0002…)
    dateCompromisDetectee = valeur;
    dateCompromisEstimee = false;
    // Met à jour uniquement le texte d'information, sans jamais recacher le champ : il se
    // recache via majAffichageCompromis() au prochain import de PDF, pas pendant une saisie
    // manuelle — sinon le champ disparaissait sous les doigts dès que la date devenait valide,
    // avant même que le collaborateur ait fini de la corriger.
    const info = document.getElementById('compromis-info');
    const texte = document.getElementById('compromis-info-text');
    info.classList.remove('warn');
    texte.textContent = `Date de signature détectée : ${formatDateFr(dateCompromisDetectee)}`;
    if (dernierTexteTraite) {
      detectedDates = detecterDatesDepuisTexte(dernierTexteTraite, dateCompromisDetectee);
      renderChips();
      // La date de signature est l'ancre de tous les délais : la corriger recalcule les échéances
      // calculées ET le panneau de révision, sinon celui-ci resterait sur l'ancienne ancre.
      recalculerExtractionRegex();
    }
  }

  function toggleEcheance(type, actif) {
    echeanceActive[type] = actif;
    const bloc = document.getElementById('bloc-' + type);
    const input = document.getElementById('f-' + type);
    bloc.classList.toggle('inactive', !actif);
    input.disabled = !actif;
    if (!actif) input.value = '';
    if (type === 'pret') majVisibiliteRappels();
  }

  // Demandé par l'étude : sans condition d'obtention de prêt (achat comptant), la section rappels
  // ne concerne plus ce dossier — retirée de l'étape Finaliser plutôt que laissée visible mais
  // sans effet. `getSelectedReminderDays()` n'est de toute façon plus lue dans ce cas (voir
  // ajouterDossier), ce masquage évite seulement de laisser des cases à cocher trompeuses.
  function majVisibiliteRappels() {
    // Rappels plus affichés à la création (étude, 02/10) : les valeurs par défaut (15 et 7 jours) s'appliquent.
    const fieldset = document.getElementById('rappel-fieldset');
    if (fieldset) fieldset.style.display = 'none';
  }

  function definirEcheanceActive(type, actif) {
    const checkbox = document.getElementById('toggle-' + type);
    if (checkbox) checkbox.checked = actif;
    toggleEcheance(type, actif);
  }

  // Point d'entrée unique : le texte extrait du PDF passe par toutes les détections automatiques.
  function traiterTexte(texte) {
    dernierTexteTraite = texte;

    // Repart d'une base propre à chaque import : évite qu'un chiffre resté d'un essai précédent
    // ne fausse une saisie manuelle ultérieure (ex. « je tape une date et seul le 2 reste »).
    document.getElementById('f-pret').value = '';
    document.getElementById('f-acte').value = '';
    document.getElementById('f-ventebien').value = '';
    document.getElementById('f-date-compromis').value = '';

    dateCompromisEstimee = false;
    dateCompromisDetectee = detecterDateCompromis(texte) || '';
    majAffichageCompromis();

    detectedDates = detecterDatesDepuisTexte(texte, dateCompromisDetectee);
    renderChips();

    // Remplit directement les champs Prêt / Acte / Vente quand l'outil a une classification
    // fiable, au lieu de laisser la date en attente dans l'encart : sinon, l'échéance est bien
    // repérée mais reste invisible tant qu'on n'a pas cliqué sur son bouton de catégorie.
    ['pret', 'acte', 'ventebien'].forEach(type => {
      const { candidat, ambigu } = meilleureCandidateEcheance(detectedDates, type);
      if (candidat) {
        document.getElementById('f-' + type).value = candidat.iso;
        definirEcheanceActive(type, true);
        pageParType[type] = candidat.page;
        ambiguiteParType[type] = ambigu;
        approxParType[type] = !!candidat.approx;
      }
    });

    const cashNote = document.getElementById('cash-note');
    if (detecterFinancementComptant(texte)) {
      definirEcheanceActive('pret', false);
      cashNote.style.display = 'block';
      cashNote.textContent = "Achat sans prêt détecté : l'échéance « Obtention du prêt » a été désactivée.";
    } else {
      cashNote.style.display = 'none';
    }

    // Ces quatre champs (nom, email, adresse, prix) passent par appliquerValeurChamp() et NON par
    // une écriture directe : cette fonction note dans `valeursAppliquees` ce que NOUS avons posé.
    // Sans cette trace, la couche d'extraction structurée qui tourne juste après
    // (recalculerExtractionRegex → appliquerExtractionAuFormulaire) prenait la valeur trouvée ici
    // pour une saisie de l'utilisateur et refusait d'y toucher : le panneau « Ce que l'outil a
    // compris » (étape 2) affichait l'adresse structurée, propre, pendant que l'étape 4 gardait le
    // fragment brut du vieux détecteur — exactement le décalage signalé par l'étude.
    appliquerValeurChamp('f-nom', detecterNomDossier(texte));

    // Uniquement utile s'il y a une condition d'obtention de prêt à relancer (voir le champ
    // lui-même, "pour relance prêt") — inutile de préremplir sans ça.
    if (echeanceActive.pret) appliquerValeurChamp('f-email-acquereur', detecterEmailAcquereur(texte));

    // Ne bascule que dans un sens (maison → copropriété) : l'absence de ces marqueurs ne prouve
    // pas l'inverse (une vente de maison individuelle ne les mentionne simplement jamais), donc on
    // ne force jamais "maison" par défaut ici, on ne fait que corriger vers "copropriété" quand
    // c'en est manifestement une.
    if (detecterTypeVenteCopropriete(texte) && !choixManuelDossierWizard('f-type-vente')) {
      document.getElementById('f-type-vente').value = 'copropriete';
      noterOrigineDossierWizard('f-type-vente', 'acte');
    }
    majApercuPieces();

    // Même remarque que pour le nom/l'email ci-dessus : c'est ici le fragment BRUT du vieux
    // détecteur, que la passe structurée doit pouvoir remplacer par l'adresse reconstruite.
    appliquerValeurChamp('f-adresse-bien', normaliserAdresse(detecterAdresseBien(texte)));
    const prixDetecte = detecterPrixVente(texte);
    if (prixDetecte) appliquerValeurChamp('f-prix-vente', String(prixDetecte));

    // Les documents sont déduits des seules clauses d'engagement du vendeur, et non de l'ensemble
    // du compromis : c'est ainsi qu'un notaire lit l'acte, et cela évite les faux positifs.
    const engagements = extraireEngagementsVendeur(texte);
    analyseJuridiqueActuelle = {
      documents: detecterDocumentsAFournir(engagements),
      engagements
    };
    afficherAnalyseJuridique();

    // Couche d'extraction structurée : construite à partir de ce que les regex viennent de trouver,
    // elle complète les champs restés vides (rôle de l'étude notamment) et alimente le panneau de
    // révision. N'écrase jamais une saisie de l'utilisateur (voir appliquerValeurChamp).
    recalculerExtractionRegex();

    return detectedDates.length;
  }
