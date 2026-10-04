  // ==== EXTRACTION STRUCTURÉE : fusion des lots IA ====
  //
  // Trois règles, les mêmes pour toute donnée, quel que soit le lot :
  //   - les regex n'ont RIEN trouvé → on prend la valeur du modèle, avec le statut que lui vaut la
  //     vérification de son extrait (`extraitTrouve`, calculé côté serveur : sa citation figure-t-elle
  //     littéralement dans le PDF ?) — CONFIRMED si oui, NEEDS_REVIEW sinon ;
  //   - les deux trouvent LA MÊME chose → CONFIRMED, origine 'regex+ia' : deux méthodes
  //     indépendantes qui convergent, c'est le meilleur signal disponible ;
  //   - les deux trouvent des choses DIFFÉRENTES → on garde la valeur des regex (déterministes,
  //     testées sur de vrais actes) mais le statut passe NEEDS_REVIEW et la valeur du modèle est
  //     conservée en candidat, visible dans le panneau. Jamais de choix silencieux entre les deux.
  //
  // Le modèle ne calcule jamais une date : il rapporte un délai et son point de départ, le calcul
  // est fait ici par calculerDateEcheance() — déterministe, testé (voir tests/dates-metier.test.js).
  function fusionnerExtractionIa(extraction, lot, resultat, texte, options) {
    if (!extraction || !resultat) return extraction;
    const o = options || {};
    const page = typeof o.page === 'function' ? o.page : () => null;

    // Source (extrait + page) d'un élément renvoyé par le serveur, et statut qu'elle lui vaut.
    const sourceIa = (element) => (element && element.extrait)
      ? { extrait: element.extrait, index: element.extraitIndex === undefined ? null : element.extraitIndex, page: element.extraitTrouve ? page(element.extraitIndex) : null }
      : null;

    // Le modèle local hallucine régulièrement des termes : sa lecture n'écrit JAMAIS d'elle-même
    // dans une donnée. Elle devient une PROPOSITION, affichée dans le panneau de révision avec un
    // bouton « Utiliser » — décision explicite de l'étude après avoir vu des valeurs inventées
    // s'installer dans le formulaire sous l'étiquette « Confirmé ».
    const proposer = (element, valeurIa) => ({
      valeur: valeurIa,
      source: sourceIa(element),
      extraitTrouve: !!(element && element.extraitTrouve)
    });

    const fusionnerChamp = (champ, valeurIa, element) => {
      const existant = champ || champExtraction(null, { statut: 'NOT_FOUND' });
      if (valeurIa === null || valeurIa === undefined || valeurIa === '') return existant;
      // Une donnée corrigée à la main a déjà été tranchée par l'étude : le modèle ne la rouvre pas.
      if (existant.origine === 'manuel') return existant;
      if (existant.valeur === null || existant.valeur === undefined || existant.valeur === '') {
        return Object.assign({}, existant, {
          propositionIa: proposer(element, valeurIa),
          raison: 'Les règles de détection n’ont rien trouvé ici ; le modèle local propose une valeur, à contrôler dans l’acte avant de l’adopter.'
        });
      }
      if (String(existant.valeur) === String(valeurIa)) {
        return Object.assign({}, existant, {
          origine: 'regex+ia', propositionIa: null,
          raison: 'Les règles de détection et le modèle local lisent la même valeur.'
        });
      }
      return Object.assign({}, existant, {
        statut: 'NEEDS_REVIEW',
        propositionIa: proposer(element, valeurIa),
        raison: 'Le modèle local lit une autre valeur à cet endroit : celle des règles de détection est conservée.',
        candidats: (existant.candidats || []).concat([{ valeur: valeurIa, origine: 'ia', source: sourceIa(element) }])
      });
    };

    if (lot === 'parties') {
      if (resultat.typeActe && resultat.typeActe.valeur) {
        // Un type d'acte non tranché par les regex est le cas où l'inversion vendeur/acquéreur
        // d'une promesse d'achat passerait inaperçue : c'est exactement là que le modèle, qui lit
        // le document en contexte, apporte le plus.
        const actuel = extraction.typeActe || champExtraction(null);
        if (actuel.origine === 'manuel') {
          // déjà tranché à la main
        } else if (!actuel.valeur || actuel.valeur === 'INCONNU') {
          extraction.typeActe = Object.assign({}, actuel, {
            propositionIa: proposer(resultat.typeActe, resultat.typeActe.valeur),
            raison: 'Le type d’acte n’a pas pu être établi par les règles ; le modèle local en propose un — c’est lui qui décide du sens vendeur/acquéreur, à contrôler.'
          });
        } else if (actuel.valeur === resultat.typeActe.valeur) {
          extraction.typeActe = Object.assign({}, actuel, { origine: 'regex+ia', propositionIa: null });
        } else {
          extraction.typeActe = Object.assign({}, actuel, {
            statut: 'NEEDS_REVIEW',
            propositionIa: proposer(resultat.typeActe, resultat.typeActe.valeur),
            raison: 'Le modèle local lit un autre type d’acte : vérifiez que vendeur et acquéreur ne sont pas intervertis.'
          });
        }
      }

      if ((extraction.parties || []).length === 0 && Array.isArray(resultat.parties) && resultat.parties.length > 0) {
        extraction.parties = resultat.parties.map(p => ({
          nom: p.nom, qualiteActe: p.qualiteActe || '', role: p.role,
          qualitePersonne: p.qualitePersonne || 'physique', representant: p.representant || null,
          // Signalé comme venant du modèle : le panneau le dit en clair, ces noms n'ont été lus
          // par aucune règle déterministe.
          origine: 'ia', source: sourceIa(p)
        }));
        // Le nom du dossier est dérivé des parties : le recomposer ici plutôt que de laisser le
        // modèle proposer sa propre mise en forme, qui varierait d'un acte à l'autre.
        const vendeurs = extraction.parties.filter(p => p.role === 'VENDEUR').map(p => p.nom);
        const acquereurs = extraction.parties.filter(p => p.role === 'ACQUEREUR').map(p => p.nom);
        if (vendeurs.length > 0 && acquereurs.length > 0) {
          extraction.champs.nom = fusionnerChamp(extraction.champs.nom, `${vendeurs.join(' & ')} / ${acquereurs.join(' & ')}`, resultat.parties[0]);
        }
      }

      // Notaires : seulement si les regex n'en ont identifié aucun. La règle métier (41/45/37) est
      // ensuite rejouée telle quelle sur cette liste — jamais réimplémentée ici, elle n'est
      // déclarée qu'à un seul endroit (REGLES_NOTAIRE_INSTRUMENTAIRE).
      const notairesActuels = (extraction.notaires && extraction.notaires.liste) || [];
      if (notairesActuels.length === 0 && Array.isArray(resultat.notaires) && resultat.notaires.length > 0) {
        const liste = resultat.notaires.map(n => ({
          nom: n.nom, office: n.office || null, adresse: null,
          codePostal: null, commune: n.office || null, departement: null,
          cote: n.cote || 'inconnu', roleExplicite: n.roleExplicite || null,
          source: sourceIa(n)
        }));
        const departement = extraction.bien && extraction.bien.adresse ? extraction.bien.adresse.departement : null;
        extraction.notaires = determinerNotaires(liste, departement, extraction.typeActe && extraction.typeActe.valeur, zoneNotairesPourActe(texte, extraction.typeActe && extraction.typeActe.valeur, o.nomFichier));
        // Notaires lus par le seul modèle : l'origine est tracée pour que le rôle de l'étude ne
        // soit JAMAIS pré-rempli automatiquement à partir d'eux (voir
        // appliquerExtractionAuFormulaire) — ce sélecteur masque la checklist des pièces quand il
        // vaut « participant », le basculer sur une lecture non vérifiée serait le pire cas.
        extraction.notaires.origine = 'ia';
      }
    }

    if (lot === 'bien') {
      const adresseActuelle = (extraction.bien && extraction.bien.adresse) || null;
      if (resultat.adresse && (!adresseActuelle || adresseActuelle.origine !== 'manuel')) {
        const a = resultat.adresse;
        const morceaux = [a.numero, a.typeVoie, a.nomVoie, a.lieuDit, a.codePostal, a.commune].filter(Boolean);
        const proposee = morceaux.join(' ');
        extraction.bien = extraction.bien || {};
        const actuelle = extraction.bien.adresse && extraction.bien.adresse.adresseComplete;
        // Proposée, pas appliquée : une adresse fausse fait dériver le département, donc la
        // déduction du notaire instrumentaire, donc le rôle de l'étude sur le dossier.
        if (!actuelle) {
          extraction.bien.propositionIa = proposer(a, proposee);
        } else if (normaliserPourRecherche(actuelle) !== normaliserPourRecherche(proposee)) {
          extraction.bien.propositionIa = proposer(a, proposee);
          extraction.bien.adresse.statut = 'NEEDS_REVIEW';
        } else {
          extraction.bien.propositionIa = null;
          extraction.bien.adresse.origine = 'regex+ia';
        }
      }
      if (resultat.cadastre && !(extraction.bien && extraction.bien.cadastre)) {
        extraction.bien = extraction.bien || {};
        extraction.bien.cadastre = { section: resultat.cadastre.section, numero: resultat.cadastre.numero || null };
      }
      if (resultat.prixVente) {
        extraction.champs.prixVente = fusionnerChamp(extraction.champs.prixVente, resultat.prixVente.valeur, resultat.prixVente);
      }
      if (resultat.typeVente) {
        extraction.champs.typeVente = fusionnerChamp(extraction.champs.typeVente, resultat.typeVente.valeur, resultat.typeVente);
      }
    }

    if (lot === 'dates') {
      const signature = (extraction.dates && extraction.dates.SIGNATURE_AVANT_CONTRAT && extraction.dates.SIGNATURE_AVANT_CONTRAT.valeur) || null;
      for (const entree of (resultat.dates || [])) {
        if (!TYPES_DATE.includes(entree.type)) continue;
        const actuel = extraction.dates[entree.type];
        let valeur = entree.dateExplicite || null;
        let methode = valeur ? 'EXPLICIT' : null;
        if (!valeur && entree.delai) {
          // Le point de départ est rapporté par le modèle dans les mots de l'acte : on le
          // reconnaît avec la même table que les regex, et on ne calcule QUE depuis la signature —
          // les autres ancres (notification, purge, réalisation d'une condition) n'ont pas de date
          // connue à l'import, la date resterait une invention.
          const cle = pointDepartDepuisAncre(entree.delai.pointDepart || '');
          if (pointDepartCalculable(cle) && signature) {
            valeur = calculerDateEcheance(signature, entree.delai);
            methode = 'CALCULATED';
          }
        }
        if (!valeur) continue;
        const fusionne = fusionnerChamp(actuel, valeur, entree);
        // Une date lue telle quelle dans l'acte ne devient jamais « calculée » par l'effet de la
        // fusion : la méthode d'origine prime, c'est elle qui dit à l'étude d'où vient le chiffre.
        fusionne.methode = (actuel && actuel.methode) ? actuel.methode : methode;
        extraction.dates[entree.type] = fusionne;
      }
    }

    extraction.iaLots[lot] = 'ok';
    extraction.alertes = controlerCoherence(extraction);
    return extraction;
  }

  // Lance les trois lots EN PARALLÈLE et fusionne chaque réponse dès son arrivée : le panneau se
  // remplit lot par lot plutôt que d'attendre le plus lent des trois. Chacun passe par le même
  // garde-fou de génération (l'utilisateur a pu importer un autre PDF ou enregistrer le dossier
  // entretemps) et par appliquerExtractionAuFormulaire, qui ne touche jamais un champ saisi à la
  // main. Silencieuse si Ollama n'est pas installé/lancé : le wizard reste utilisable exactement
  // comme sans cette passe, jamais une condition bloquante pour créer un dossier.
  var LOTS_EXTRACTION_IA = ['parties', 'bien', 'dates'];

  async function lancerExtractionIa(texte, monImport) {
    if (!extractionActuelle) return;
    afficherStatutEnrichissementIa(true);
    let lotsAboutis = 0;
    let engagementsAjoutes = 0;

    const traiterLot = async (lot) => {
      let reponse;
      try {
        reponse = await fetchAvecAuth('/api/extraction-ia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texte, lot })
        });
      } catch (e) {
        return; // session expirée (gérée par fetchAvecAuth) ou réseau — passe optionnelle
      }
      if (!reponse.ok) return; // Ollama indisponible : pas d'échec bruyant
      const corps = await reponse.json().catch(() => null);
      if (!corps || !corps.resultat) return;
      if (monImport !== generationImportActuel || !extractionActuelle) return;

      fusionnerExtractionIa(extractionActuelle, lot, corps.resultat, texte, { page: pageDepuisIndex, nomFichier: compromisNomFichierImporte });
      lotsAboutis++;

      if (lot === 'dates') {
        const nouvelles = [];
        for (const suggestion of (corps.resultat.engagementsVendeur || [])) {
          if (engagementDejaConnu(suggestion.extrait, analyseJuridiqueActuelle.engagements)) continue;
          const e = { phrase: suggestion.extrait, type: suggestion.type, page: null, source: 'ia' };
          analyseJuridiqueActuelle.engagements.push(e);
          nouvelles.push(e);
          engagementsAjoutes++;
        }
        if (nouvelles.length > 0) {
          // Complétés à partir des seules obligations ajoutées : un recalcul complet ferait revenir
          // un document que l'étude a retiré à la main pendant l'attente du modèle.
          completerDocumentsIdentifies(analyseJuridiqueActuelle.documents, nouvelles);
          afficherAnalyseJuridique();
        }
      }

      appliquerExtractionAuFormulaire(extractionActuelle);
      renderPanneauRevision(extractionActuelle);
    };

    await Promise.all(LOTS_EXTRACTION_IA.map(lot => traiterLot(lot).catch(() => {
      if (extractionActuelle) extractionActuelle.iaLots[lot] = 'indisponible';
    })));

    // Un import suivant a déjà remis son propre statut (masqué au départ, voir traiterFichierPdf) :
    // le masquer ici écraserait l'état du nouvel import.
    if (monImport !== generationImportActuel) return;
    afficherStatutEnrichissementIa(false);
    for (const lot of LOTS_EXTRACTION_IA) {
      if (extractionActuelle && extractionActuelle.iaLots[lot] === 'attente') extractionActuelle.iaLots[lot] = 'indisponible';
    }
    if (lotsAboutis === 0) return;

    const morceaux = [`${lotsAboutis} lecture${lotsAboutis > 1 ? 's' : ''} du modèle local`];
    if (engagementsAjoutes > 0) morceaux.push(`${engagementsAjoutes} engagement${engagementsAjoutes > 1 ? 's' : ''} du vendeur en plus`);
    afficherToast(`IA locale : ${morceaux.join(', ')} — voir « Ce que l’outil a compris », tout reste à vérifier.`, 'OK', null);
  }
