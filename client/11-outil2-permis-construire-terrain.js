  // ==== OUTIL 2 : PERMIS DE CONSTRUIRE D'UN TERRAIN À BÂTIR ===================================
  //
  // Demandé par l'étude pour la relecture d'un PROJET DE VENTE de terrain à bâtir : « vérifier si
  // l'acquéreur a reçu son permis, si les délais de retrait administratif et de recours des tiers
  // sont purgés, et si l'affichage du permis a été effectué ».
  //
  // DEUX DÉLAIS, DEUX POINTS DE DÉPART DIFFÉRENTS — c'est toute la difficulté, et la raison d'être
  // de ce contrôle. Les confondre est l'erreur classique :
  //   • RETRAIT ADMINISTRATIF : 3 mois à compter de la DATE DE LA DÉCISION (art. L.424-5 c. urb.).
  //     Passé ce délai, l'administration ne peut plus retirer le permis même illégal — sauf fraude,
  //     où le délai devient perpétuel. Au-delà, un retrait n'est possible que sur demande expresse
  //     du bénéficiaire.
  //   • RECOURS DES TIERS : 2 mois à compter du PREMIER JOUR d'une période CONTINUE de deux mois
  //     d'affichage sur le terrain (art. R.600-2 c. urb.). Il ne court PAS depuis l'arrêté.
  //
  // CONSÉQUENCE À NE JAMAIS PERDRE DE VUE : sans affichage régulier, le délai de recours ne
  // commence jamais à courir. « Pas de constat d'affichage » ne veut donc pas dire « on attend »,
  // mais « le compteur n'a pas démarré » — le recours reste ouvert. C'est pour ça que l'absence de
  // constat est signalée comme un vrai manque, et jamais comme une simple attente.
  //
  // Délais vérifiés sur les textes en vigueur au moment d'écrire ce code, pas de mémoire.
  var MOIS_RETRAIT_PERMIS = 3;
  var MOIS_RECOURS_TIERS_PERMIS = 2;

  // Loi n° 2025-1129 du 26 novembre 2025 de simplification du droit de l'urbanisme et du logement
  // (dite « loi Huwart »), applicable aux décisions d'urbanisme délivrées À PARTIR DU 28 NOVEMBRE
  // 2025 : le recours gracieux passe à UN mois et ne proroge PLUS le délai de recours contentieux.
  // Pour un permis ANTÉRIEUR, l'ancien régime reste applicable — un recours gracieux formé dans
  // les deux mois prorogeait le délai contentieux d'autant, donc deux mois comptés depuis
  // l'affichage ne suffisent pas à conclure que tout est purgé. D'où le rappel explicite dans le
  // constat : sur un permis ancien, seul le certificat de non-recours tranche.
  var DATE_LOI_SIMPLIFICATION_URBANISME = '2025-11-28';

  // Terrain à bâtir : le signal le plus sûr reste le type de vente choisi par l'étude sur le
  // dossier lié (voir estTerrainABatir), le texte n'étant qu'un repli — même principe que
  // estCopropriete.
  var RE_TERRAIN_A_BATIR = /terrain\s+[àa]\s+b[âa]tir|lot\s+[àa]\s+b[âa]tir|parcelle\s+[àa]\s+b[âa]tir|terrain\s+constructible/i;

  // Une vente de terrain à bâtir est très souvent conditionnée à l'obtention du permis par
  // l'acquéreur. Quand la clause est là et qu'aucun permis n'est déposé, le manque est bien plus
  // net que sur un terrain vendu sans projet déclaré : d'où deux gravités distinctes.
  var RE_CONDITION_PERMIS = /condition\s+suspensive[^.]{0,200}permis\s+de\s+construire|permis\s+de\s+construire[^.]{0,150}condition\s+suspensive|obtention\s+(?:d['’]\s*un\s+)?permis\s+de\s+construire/i;

  var RE_PERMIS_CONSTRUIRE = /permis\s+de\s+construire|arr[êe]t[ée]\s+de\s+permis|\bPC\s*\d{3}/i;
  var RE_CONSTAT_AFFICHAGE = /constat\s+d?['’]?\s*affichage|affichage\s+(?:r[ée]glementaire\s+)?(?:du\s+)?permis|proc[èe]s[\s-]*verbal\s+de\s+constat/i;
  var RE_CERTIFICAT_NON_RECOURS = /certificat\s+de\s+non[\s-]*recours|attestation\s+de\s+non[\s-]*recours|non[\s-]*recours\s+(?:et|ni)\s+non[\s-]*retrait|certificat\s+de\s+non[\s-]*contestation/i;

  // Numéro de permis, tel qu'il figure sur l'arrêté (« PC 041 123 25 A0012 ») : sert seulement à
  // nommer le permis dans le rapport, jamais à décider de quoi que ce soit.
  var RE_NUMERO_PERMIS = /\bPC[\s.-]*\d{3}[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*[A-Z]?\d{4,5}/i;

  function estTerrainABatir(entree) {
    const dossierLie = (entree && entree.dossierLie) || null;
    if (dossierLie && dossierLie.typeVente === 'terrain') return true;
    const textes = [(entree && entree.texteProjet) || '', (entree && entree.texteAvantContrat) || ''];
    return textes.some(t => RE_TERRAIN_A_BATIR.test(t));
  }

  // L'ORDRE COMPTE : un constat d'affichage et un certificat de non-recours CITENT tous les deux
  // le permis de construire (c'est même leur objet). Les tester après lui les classerait comme le
  // permis lui-même, et l'outil prendrait la date du constat pour celle de l'arrêté — soit trois
  // mois de retrait comptés depuis le mauvais jour.
  function typeDocumentPermis(doc) {
    const nom = normaliserNomPourMotif((doc && doc.nom) || '');
    if (RE_CERTIFICAT_NON_RECOURS.test(nom)) return 'certificat-non-recours';
    if (RE_CONSTAT_AFFICHAGE.test(nom)) return 'constat-affichage';
    if (RE_PERMIS_CONSTRUIRE.test(nom)) return 'permis';
    if (RE_DOC_AVANT_CONTRAT.test(nom)) return null;
    const entete = String((doc && doc.texte) || '').slice(0, TETE_DOCUMENT_SYNDIC);
    if (RE_DOC_AVANT_CONTRAT.test(entete)) return null;
    if (RE_CERTIFICAT_NON_RECOURS.test(entete)) return 'certificat-non-recours';
    if (RE_CONSTAT_AFFICHAGE.test(entete)) return 'constat-affichage';
    if (RE_PERMIS_CONSTRUIRE.test(entete)) return 'permis';
    return null;
  }

  // Le constat d'affichage RETENU est le PLUS ANCIEN : le délai de recours court du premier jour
  // de la période continue de deux mois, et l'étude fait couramment dresser trois constats (début,
  // milieu, fin). Prendre le dernier ferait repartir le compteur à la fin de l'affichage.
  // L'outil ne peut PAS vérifier la continuité de l'affichage entre deux constats : c'est dit dans
  // le constat produit, jamais supposé acquis.
  function analyserDocumentsPermis(documentsDeposes) {
    const resultat = { permis: null, constatAffichage: null, constatsAffichage: [], certificatNonRecours: null };
    for (const doc of documentsDeposes || []) {
      const type = typeDocumentPermis(doc);
      if (!type) continue;
      const texte = String((doc && doc.texte) || '');
      const date = dateDuJustificatif(texte);
      const entree = { document: (doc && doc.nom) || '', date };
      if (type === 'permis') {
        const num = RE_NUMERO_PERMIS.exec(texte);
        entree.numero = num ? num[0].replace(/\s+/g, ' ').trim() : null;
        if (!resultat.permis || (date && resultat.permis.date && date < resultat.permis.date)) resultat.permis = entree;
        else if (!resultat.permis.date && date) resultat.permis = entree;
      } else if (type === 'constat-affichage') {
        resultat.constatsAffichage.push(entree);
      } else {
        if (!resultat.certificatNonRecours) resultat.certificatNonRecours = entree;
      }
    }
    const dates = resultat.constatsAffichage.filter(c => c.date);
    if (dates.length) {
      resultat.constatAffichage = dates.reduce((a, b) => (b.date < a.date ? b : a));
    } else if (resultat.constatsAffichage.length) {
      resultat.constatAffichage = resultat.constatsAffichage[0];
    }
    return resultat;
  }

  // Pure et testable : à partir des deux seules dates qui comptent, dit où en est chaque délai.
  // Aucune date n'est jamais devinée — sans arrêté, le retrait est « inconnu » ; sans affichage, le
  // recours est « non-demarre » (et non « inconnu ») : la nuance est le cœur du contrôle.
  function calculerPurgePermis(entree) {
    const aujourdHui = (entree && entree.aujourdHui) || new Date().toISOString().slice(0, 10);
    const dateArrete = (entree && entree.dateArrete) || null;
    const dateAffichage = (entree && entree.dateAffichage) || null;
    const finRetrait = dateArrete ? ajouterMois(dateArrete, MOIS_RETRAIT_PERMIS) : null;
    const finRecours = dateAffichage ? ajouterMois(dateAffichage, MOIS_RECOURS_TIERS_PERMIS) : null;
    return {
      aujourdHui, dateArrete, dateAffichage, finRetrait, finRecours,
      retrait: !dateArrete ? 'inconnu' : (aujourdHui > finRetrait ? 'purge' : 'en-cours'),
      recours: !dateAffichage ? 'non-demarre' : (aujourdHui > finRecours ? 'purge' : 'en-cours'),
      // Permis antérieur à la loi du 26 novembre 2025 : un recours gracieux pouvait proroger le
      // délai contentieux, donc le calendrier seul ne suffit pas à conclure.
      ancienRegimeRecoursGracieux: dateArrete ? dateArrete < DATE_LOI_SIMPLIFICATION_URBANISME : false
    };
  }

  function constatsPermisConstruire(entree) {
    const analyse = (entree && entree.analyse) || { permis: null, constatAffichage: null, certificatNonRecours: null, constatsAffichage: [] };
    const purge = (entree && entree.purge) || null;
    const conditionPermis = !!(entree && entree.conditionPermis);
    const constats = [];

    // 1. L'acquéreur a-t-il son permis ?
    if (!analyse.permis) {
      constats.push({
        categorie: 'PERMIS',
        gravite: conditionPermis ? 'IMPORTANT' : 'A_VERIFIER',
        titre: "Permis de construire de l’acquéreur non fourni",
        description: conditionPermis
          ? "La vente est conditionnée à l’obtention du permis de construire par l’acquéreur, mais aucun arrêté n’a été déposé : la réalisation de la condition n’est pas justifiée."
          : "Aucun arrêté de permis de construire n’a été déposé. Sur un terrain à bâtir, vérifier si l’acquéreur en a obtenu un et si la vente en dépend.",
        destinataire: 'acquereur',
        question: "Pourriez-vous nous adresser une copie de l’arrêté de permis de construire délivré, ainsi que les constats d’affichage sur le terrain ?"
      });
      return constats;
    }

    const nomPermis = analyse.permis.numero ? `permis ${analyse.permis.numero}` : 'permis de construire';
    if (!analyse.permis.date) {
      constats.push({
        categorie: 'PERMIS', gravite: 'A_VERIFIER',
        titre: "Date de l’arrêté de permis de construire illisible",
        description: `Le délai de retrait administratif (${MOIS_RETRAIT_PERMIS} mois à compter de la décision, art. L.424-5 c. urb.) n’a pas pu être contrôlé : relever la date sur l’arrêté.`,
        document: analyse.permis.document
      });
    }

    // 2. L'affichage a-t-il été effectué ? Sans lui, le délai de recours ne court même pas.
    if (!analyse.constatAffichage) {
      constats.push({
        categorie: 'PERMIS', gravite: 'IMPORTANT',
        titre: "Affichage du permis sur le terrain non justifié",
        description: "Aucun constat d’affichage n’a été déposé. Tant que l’affichage régulier n’est pas prouvé, le délai de recours des tiers NE COURT PAS : il ne s’agit pas d’un délai en cours mais d’un compteur qui n’a pas démarré. Le constat d’un commissaire de justice est la preuve la plus solide ; l’usage est d’en faire dresser trois (début, milieu et fin de la période de deux mois).",
        destinataire: 'acquereur',
        question: "Pourriez-vous nous adresser les constats d’affichage du permis de construire sur le terrain, dressés par commissaire de justice ?"
      });
    } else if (!analyse.constatAffichage.date) {
      constats.push({
        categorie: 'PERMIS', gravite: 'A_VERIFIER',
        titre: "Constat d’affichage sans date lisible",
        description: `Le délai de recours des tiers (${MOIS_RECOURS_TIERS_PERMIS} mois à compter du premier jour d’affichage continu, art. R.600-2 c. urb.) n’a pas pu être contrôlé : relever la date du constat.`,
        document: analyse.constatAffichage.document
      });
    } else if (analyse.constatsAffichage.length === 1) {
      constats.push({
        categorie: 'PERMIS', gravite: 'A_VERIFIER',
        titre: "Un seul constat d’affichage déposé",
        description: `Constat du ${formatDateFr(analyse.constatAffichage.date)}. Le délai ne court qu’à condition que l’affichage ait été CONTINU pendant deux mois — ce qu’un constat unique ne démontre pas. Vérifier qu’un constat de fin de période existe.`,
        document: analyse.constatAffichage.document,
        destinataire: 'acquereur',
        question: "Disposez-vous d’un constat de fin de période d’affichage, attestant que l’affichage du permis est resté continu pendant deux mois ?"
      });
    }

    if (!purge) return constats;

    // 3. Les deux délais, chacun depuis SA date de départ.
    if (purge.retrait === 'en-cours') {
      constats.push({
        categorie: 'PERMIS', gravite: 'IMPORTANT',
        titre: `Délai de retrait administratif non purgé (jusqu’au ${formatDateFr(purge.finRetrait)})`,
        description: `L’arrêté est daté du ${formatDateFr(purge.dateArrete)}. L’administration peut encore retirer le ${nomPermis} s’il est illégal, pendant ${MOIS_RETRAIT_PERMIS} mois à compter de la décision (art. L.424-5 c. urb.).`,
        document: analyse.permis.document
      });
    } else if (purge.retrait === 'purge') {
      constats.push({
        categorie: 'PERMIS', gravite: 'INFORMATION',
        titre: `Délai de retrait administratif purgé depuis le ${formatDateFr(purge.finRetrait)}`,
        description: `Arrêté du ${formatDateFr(purge.dateArrete)} + ${MOIS_RETRAIT_PERMIS} mois (art. L.424-5 c. urb.). Le retrait reste possible sans condition de délai en cas de fraude.`,
        document: analyse.permis.document
      });
    }

    if (purge.recours === 'en-cours') {
      constats.push({
        categorie: 'PERMIS', gravite: 'IMPORTANT',
        titre: `Délai de recours des tiers non purgé (jusqu’au ${formatDateFr(purge.finRecours)})`,
        description: `Affichage constaté à partir du ${formatDateFr(purge.dateAffichage)} : le délai de ${MOIS_RECOURS_TIERS_PERMIS} mois court depuis le premier jour d’affichage continu (art. R.600-2 c. urb.), pas depuis l’arrêté.`,
        document: analyse.constatAffichage ? analyse.constatAffichage.document : null
      });
    } else if (purge.recours === 'purge') {
      const rappelAncienRegime = purge.ancienRegimeRecoursGracieux
        ? " Le permis étant antérieur au 28 novembre 2025, un recours gracieux formé dans les deux mois pouvait proroger d’autant le délai contentieux (régime antérieur à la loi n° 2025-1129 du 26 novembre 2025) : le calendrier seul ne suffit pas à conclure."
        : " Depuis la loi n° 2025-1129 du 26 novembre 2025, un recours gracieux ne proroge plus le délai contentieux.";
      constats.push({
        categorie: 'PERMIS', gravite: 'INFORMATION',
        titre: `Délai de recours des tiers purgé depuis le ${formatDateFr(purge.finRecours)}`,
        description: `Affichage à partir du ${formatDateFr(purge.dateAffichage)} + ${MOIS_RECOURS_TIERS_PERMIS} mois (art. R.600-2 c. urb.).${rappelAncienRegime}`,
        document: analyse.constatAffichage ? analyse.constatAffichage.document : null
      });
    }

    // 4. Le calendrier n'est qu'une indication : seul le certificat de non-recours prouve qu'aucun
    // recours n'a été enregistré, et l'attestation de la mairie qu'aucun retrait n'est intervenu.
    // Un calcul de dates ne peut pas savoir qu'un tiers a saisi le tribunal.
    if (!analyse.certificatNonRecours && purge.retrait === 'purge' && purge.recours === 'purge') {
      constats.push({
        categorie: 'PERMIS', gravite: 'A_VERIFIER',
        titre: "Purge calculée, mais non justifiée par un certificat",
        description: "Les deux délais sont écoulés d’après les dates relevées, mais aucun certificat n’a été déposé. Un calcul ne dit pas qu’aucun recours n’a été enregistré : demander le certificat de non-recours au greffe du tribunal administratif (art. R.600-7 c. urb.) et l’attestation de non-retrait à la mairie.",
        destinataire: 'tribunal',
        question: "Pourriez-vous nous délivrer un certificat attestant qu’aucun recours n’a été enregistré contre le permis de construire désigné ci-dessous, en application de l’article R.600-7 du code de l’urbanisme ?"
      });
    } else if (analyse.certificatNonRecours) {
      constats.push({
        categorie: 'PERMIS', gravite: 'INFORMATION',
        titre: "Certificat de non-recours déposé",
        description: `Document : ${analyse.certificatNonRecours.document}${analyse.certificatNonRecours.date ? ' (du ' + formatDateFr(analyse.certificatNonRecours.date) + ')' : ''}. Vérifier qu’il est postérieur à l’expiration des deux délais.`,
        document: analyse.certificatNonRecours.document
      });
    }

    return constats;
  }

  // Les questions prêtes à envoyer, regroupées par destinataire. Un constat sans question n'en
  // produit aucune : toutes n'appellent pas un courrier (un certificat encore valable, par
  // exemple, n'a rien à demander à personne). Deux constats qui poseraient la même question ne la
  // produisent qu'une fois — c'est le cas dès que deux documents portent la même rubrique.
  var DESTINATAIRES_QUESTIONS_OUTIL2 = [
    { cle: 'syndic', titre: 'Questions à poser au syndic' },
    { cle: 'confrere', titre: 'Questions à poser au confrère' },
    { cle: 'mairie', titre: 'Questions à poser à la mairie' },
    { cle: 'acquereur', titre: "Questions à poser à l'acquéreur" },
    { cle: 'tribunal', titre: 'Questions à poser au greffe du tribunal administratif' }
  ];

  function questionsOutil2(constats) {
    const parDestinataire = {};
    for (const c of constats || []) {
      if (!c || !c.question || !c.destinataire) continue;
      if (!parDestinataire[c.destinataire]) parDestinataire[c.destinataire] = [];
      if (parDestinataire[c.destinataire].indexOf(c.question) === -1) parDestinataire[c.destinataire].push(c.question);
    }
    return DESTINATAIRES_QUESTIONS_OUTIL2
      .filter(d => parDestinataire[d.cle] && parDestinataire[d.cle].length)
      .map(d => ({ cle: d.cle, titre: d.titre, questions: parDestinataire[d.cle] }));
  }
