  // ==== AUJOURD'HUI ====
  //
  // Demandé par l'étude (maquette « Ma matinée » validée le 27/09) : chaque collaborateur arrive le
  // matin sur ce qu'il a à faire AUJOURD'HUI, avec le geste déjà prêt — le brouillon d'email rédigé
  // avec les modèles de l'étude, l'envoi du projet à noter d'un clic — plutôt qu'une liste de
  // constats. Trois surfaces lisent la même liste :
  //  - la carte « Aujourd'hui » du tableau de bord, qui remplace « À traiter » ;
  //  - la fenêtre qui s'ouvre à la première connexion de la journée.
  // Rien n'est jamais envoyé seul : un clic ouvre un brouillon dans la messagerie (contrainte
  // fondamentale n°4). CLAIRE ne lit ni la boîte mail ni Teams (pas d'accès Microsoft Graph) : « une
  // réponse oubliée » se lit ici comme un geste attendu que le dossier n'a pas encore enregistré.
  //
  // Toute la sélection est PURE et testable (tests/aujourdhui.test.js) : la date du jour est
  // toujours passée en paramètre.

  var JOURS_ACTIONS_RENDEZ_VOUS = 7;   // projet (l’appel de fonds : JOURS_APPEL_FONDS_AVANT_RDV, commun/planning.js)
  var JOURS_CONFIRMATION_FONDS = 3;    // confirmer la réception des fonds (étude 05/10 : « confirmer les fonds 3 j avant »)
  var JOURS_RAPPEL_RIB = 3;            // email « RIB et pièce d'identité » avant la signature
  var JOURS_QUESTIONNAIRE = 30;        // questionnaire proposé dans le mois qui suit la signature
  var JOURS_A_VENIR = 30;              // horizon de « À venir »
  var JOURS_HORIZON_A_FAIRE = 15;      // « À faire » ne couvre que les 15 jours à venir (étude)
  var ORDRE_GRAVITE_JOUR = { critique: 0, vigilance: 1, normal: 2 };
  var LIBELLE_HISTORIQUE_RIB = 'Relance manuelle envoyée — RIB';

  function courtDateJour(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return '';
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // « aujourd'hui », « demain », « jeudi 1 octobre », ou « il y a 3 jours » : comme on le dirait.
  function quandJour(iso, aujourdhuiIso) {
    const j = ecartJours(aujourdhuiIso, iso);
    if (j === null) return '';
    if (j === 0) return "aujourd'hui";
    if (j === 1) return 'demain';
    if (j < 0) return `il y a ${-j} jour${-j > 1 ? 's' : ''}`;
    return courtDateJour(iso);
  }

  // Le délai affiché d'une action : son propre texte quand « J-3 » n'aurait pas de sens (un acte
  // déjà signé n'est pas « dépassé »).
  function delaiAction(a) { return a.delaiTexte || libelleDelaiJour(a.jours); }

  function libelleDelaiJour(j) {
    if (j === null || j === undefined) return '';
    if (j < 0) return `dépassé de ${-j} j`;
    if (j === 0) return "aujourd'hui";
    return `J-${j}`;
  }

  function historiqueContient(d, texte) {
    return ((d && d.historique) || []).some(e => e && typeof e.texte === 'string' && e.texte.indexOf(texte) === 0);
  }

  function ribDejaDemande(d) {
    return !!(d && (d.ribDemandeLe || historiqueContient(d, LIBELLE_HISTORIQUE_RIB)));
  }

  function phraseSignature(d, aujourdhuiIso) {
    const heure = d.rendezVousSignatureHeure ? ' à ' + d.rendezVousSignatureHeure.replace(':', ' h ') : '';
    return `Signature ${quandJour(d.rendezVousSignature, aujourdhuiIso)}${heure}`;
  }

  // Pure. Renvoie { actions, aVenir } :
  //  - actions : ce qui est à faire aujourd'hui, du plus grave au moins grave puis du plus proche au
  //    plus lointain, UNE entrée par geste (un dossier peut en porter deux : appel de fonds à
  //    préparer ET RIB à demander). Chaque action a une clé stable « idDossier:type », qui sert au
  //    report à demain ;
  //  - aVenir : ce qui ne demande rien aujourd'hui mais arrive (échéances dans les 30 jours, offre
  //    déjà relancée, dossiers à relier).
  // Règles de sélection reprises des signaux déjà en place (alertesImportantes, pointsEtatDossier,
  // relanceOffreDue) — ce qui n'a pas de geste prêt reste une action « Ouvrir la fiche ».
  var JOURS_ENTRE_RELANCES_VENTE = 5;

  // Pure : les fonds ne sont pas arrivés à 3 jours du rendez-vous (étude, 03/10 : « email de relance au client
  // si pas de réception des fonds 3 jours avant le rendez-vous ») — appel de fonds parti, réception pas
  // confirmée, aucune relance déjà faite pour cette date, jamais au confrère. « Pas arrivés » = aucun reçu
  // retenu à la dernière lecture, ou un reçu partiel ; un montant attendu inconnu ou un excédent ne disent rien.
  var JOURS_RELANCE_FONDS = 3;
  function relanceFondsDue(d, aujourdhuiIso) {
    if (!d || d.archive || !d.rendezVousSignature || estSuccession(d) || notaireParticipantRepresenteAcquereur(d)) return false;
    if (!echeanceValidee(d, 'appelFonds') || d.receptionFondsConfirmeeLe || d.relanceFondsPour === d.rendezVousSignature) return false;
    const j = ecartJours(aujourdhuiIso || isoAujourdhuiLocal(), d.rendezVousSignature);
    if (j === null || j < 0 || j > JOURS_RELANCE_FONDS) return false;
    if (d.fondsValidesLe) return false;
    if (!d.fondsRecus) return true;
    const etat = bilanFondsDossier(d).etat;
    return etat === 'aucun' || etat === 'partiel';
  }

  // Pure : le décompte du confrère est à demander 7 jours avant le rendez-vous (étude 06/10 : « si le confrère représente les
  // vendeurs et nous les acquéreurs ») — un autre office représente le vendeur, l'acquéreur est notre client, rendez-vous placé,
  // demande pas encore faite pour cette date (relanceDecompteConfrerePour). Un décompte déjà reçu se dit par « Déjà reçu ».
  var JOURS_RELANCE_DECOMPTE_CONFRERE = 7;
  function relanceDecompteConfrereDue(d, aujourdhuiIso) {
    if (!d || d.archive || !d.rendezVousSignature || estSuccession(d)) return false;
    if (!confrereRepresenteVendeur(d) || notaireParticipantRepresenteAcquereur(d)) return false;
    if (d.relanceDecompteConfrerePour === d.rendezVousSignature) return false;
    // Appel de fonds déjà coché (envoyé) : le décompte du confrère a servi, plus rien à demander (étude 06/10).
    if (echeanceValidee(d, 'appelFonds')) return false;
    const j = ecartJours(aujourdhuiIso || isoAujourdhuiLocal(), d.rendezVousSignature);
    return j !== null && j >= 0 && j <= JOURS_RELANCE_DECOMPTE_CONFRERE;
  }

  // Pure : la confirmation de réception des fonds a été envoyée pour le rendez-vous actuel — elle en rappelle
  // la date et le lieu, donc confirmation et rappel du rendez-vous sont faits (étude, 03/10). Un dossier dont
  // la confirmation est antérieure au suivi de la date (receptionFondsPourRdv absent) est compté pour son rendez-vous actuel.
  function rdvConfirmeParFonds(d) {
    if (!d || !d.rendezVousSignature || !d.receptionFondsConfirmeeLe) return false;
    return d.receptionFondsPourRdv === undefined || d.receptionFondsPourRdv === d.rendezVousSignature;
  }

  function actionsDuJour(dossiersActifs, aujourdhuiIso) {
    const actions = [];
    const aVenir = [];
    for (const d of dossiersActifs || []) {
      if (!d || d.archive) continue;
      const couverts = new Set();
      const typesAction = new Set();
      const ajouter = (a) => { typesAction.add(a.type); actions.push(Object.assign({ cle: `${d.id}:${a.type}`, dossier: d }, a)); };
      const dest = emailDestinataireRelance(d);

      // 1. Offre de prêt attendue : relance due (première à J-15, puis tous les 10 jours, y compris
      //    après la date butoir — même règle que la relance automatique, voir relanceOffreDue).
      if (!d.sansPret && d.pret && !echeanceValidee(d, 'pret')) {
        const j = ecartJours(aujourdhuiIso, d.pret);
        if (j !== null && j <= FENETRE_RELANCE_OFFRE_JOURS) {
          couverts.add('Relancer l’offre de prêt');
          if (relanceOffreDue(d.derniereRelanceAuto, aujourdhuiIso)) {
            const constat = d.offrePretStatut === 'manquante' ? 'Aucune offre trouvée sur le NAS.' : 'Offre pas encore reçue.';
            const relance = d.derniereRelanceAuto ? ` Dernière relance ${quandJour(d.derniereRelanceAuto, aujourdhuiIso)}.` : ' Aucune relance encore envoyée.';
            ajouter({
              type: 'pret', categorie: 'pret', categorieLabel: 'Obtention du prêt',
              titre: 'Relancer l’offre de prêt',
              contexte: `Butoir ${courtDateJour(d.pret)}${j < 0 ? ` (dépassé de ${-j} j)` : ''}. ${constat}${relance}${dest ? '' : " Email de l'acquéreur non renseigné."}`,
              jours: j, gravite: j <= 7 ? 'critique' : 'vigilance',
              geste: dest ? { type: 'email', motif: 'pret' } : { type: 'fiche' },
              bouton: dest ? 'Ouvrir la relance' : 'Ouvrir la fiche',
              // Offre reçue par un autre canal : l'échéance se coche d'ici, comme sur la fiche (décochable).
              second: { type: 'valider', champ: 'pret', libelle: 'Offre de prêt reçue', fait: 'Offre de prêt notée reçue' }
            });
          } else {
            const prochaine = addDays(d.derniereRelanceAuto, JOURS_ENTRE_RELANCES_OFFRE);
            aVenir.push({ dossier: d, titre: 'Offre de prêt relancée', detail: `Relancée ${quandJour(d.derniereRelanceAuto, aujourdhuiIso)} · prochaine relance ${quandJour(prochaine, aujourdhuiIso)}`, iso: prochaine });
          }
        }
      }

      // 2. Avant la signature : appel de fonds, projet, réception des fonds, RIB.
      const jRdv = d.rendezVousSignature ? ecartJours(aujourdhuiIso, d.rendezVousSignature) : null;
      if (jRdv !== null && jRdv >= 0) {
        const af = echeanceValidee(d, 'appelFonds');
        const pr = echeanceValidee(d, 'projetEnvoye');
        ['Envoyer l’appel de fonds et le projet', 'Envoyer l’appel de fonds', 'Envoyer le projet'].forEach(t => couverts.add(t));
        const signature = phraseSignature(d, aujourdhuiIso);
        // L'appel de fonds est dû 10 jours avant le rendez-vous (échéance de la fiche, rappel Teams du même jour) : la tâche
        // apparaît dès cette date, pas à J-7 seulement (étude 05/10).
        if (jRdv <= JOURS_APPEL_FONDS_AVANT_RDV && !af) {
          ajouter({
            type: 'appelFonds', categorie: 'appelFonds', categorieLabel: 'Envoi appel de fonds',
            titre: 'Envoyer l’appel de fonds',
            contexte: `${signature}. ${pr ? '' : 'Le projet d’acte reste aussi à envoyer.'}`.trim(),
            jours: jRdv, gravite: jRdv <= 2 ? 'critique' : 'vigilance',
            geste: { type: 'appelFonds' }, bouton: 'Préparer l’appel de fonds',
            second: { type: 'marquer', champ: 'appelFonds', libelle: 'Déjà envoyé' }
          });
        }
        if (jRdv <= JOURS_ACTIONS_RENDEZ_VOUS && af && !pr) {
          ajouter({
            type: 'projetEnvoye', categorie: 'projetEnvoye', categorieLabel: 'Envoi projet',
            titre: 'Envoyer le projet d’acte',
            contexte: `${signature}. Appel de fonds envoyé${d.appelFonds ? ' le ' + formatDateFr(d.appelFonds) : ''} ; le projet n’est pas encore noté comme envoyé.`,
            jours: jRdv, gravite: jRdv <= 2 ? 'critique' : 'vigilance',
            geste: dest ? { type: 'email', motif: 'projet' } : { type: 'marquer', champ: 'projetEnvoye' },
            bouton: dest ? 'Envoyer le projet d’acte' : 'Marquer envoyé',
            second: dest ? { type: 'marquer', champ: 'projetEnvoye', libelle: 'Déjà envoyé' } : { type: 'fiche', libelle: 'Ouvrir la fiche' }
          });
        }
        const relanceDue = !!dest && relanceFondsDue(d, aujourdhuiIso);
        if (relanceDue) {
          ajouter({
            type: 'relanceFonds', categorie: 'appelFonds', categorieLabel: 'Réception des fonds',
            titre: 'Relancer pour les fonds',
            contexte: `${signature}. ${d.fondsRecus ? 'Les reçus comptables ne montrent pas tous les fonds.' : 'Aucun reçu relevé en comptabilité.'} Appel de fonds envoyé${d.appelFonds ? ' le ' + formatDateFr(d.appelFonds) : ''}.`,
            jours: jRdv, gravite: jRdv <= 1 ? 'critique' : 'vigilance',
            geste: { type: 'email', motif: 'relanceFonds' }, bouton: 'Ouvrir la relance',
            second: { type: 'marquer', champ: 'relanceFonds', libelle: 'Déjà relancé' }
          });
        }
        if (relanceDecompteConfrereDue(d, aujourdhuiIso)) {
          const emailConfrere = emailConfrereVendeurDossier(d);
          ajouter({
            type: 'relanceDecompteConfrere', categorie: 'appelFonds', categorieLabel: 'Appel de fonds',
            titre: 'Demander son décompte au confrère',
            contexte: `${signature}. Le vendeur est représenté par ${d.notaireVendeur} : son décompte sert à établir le nôtre.${emailConfrere ? '' : ' Email du confrère non renseigné.'}`,
            jours: jRdv, gravite: jRdv <= 3 ? 'critique' : 'vigilance',
            geste: emailConfrere ? { type: 'email', motif: 'relanceDecompteConfrere' } : { type: 'fiche' },
            bouton: emailConfrere ? 'Ouvrir la demande' : 'Ouvrir la fiche',
            second: { type: 'marquer', champ: 'relanceDecompteConfrere', libelle: 'Déjà reçu' }
          });
        }
        if (!relanceDue && jRdv <= JOURS_CONFIRMATION_FONDS && af && !d.receptionFondsConfirmeeLe && dest) {
          // Ce que dit la dernière lecture des reçus (onglet Échanges › Fonds reçus), s'il y en a une.
          const bilan = d.fondsRecus || d.fondsValidesLe ? bilanFondsDossier(d) : null;
          const etatFonds = !bilan ? 'À envoyer une fois les fonds arrivés en comptabilité (vérifiez les reçus sur la fiche).'
            : bilan.manuel ? `Fonds validés à la main le ${formatDateFr(d.fondsValidesLe)} (arrivés sur le compte de l’étude).`
            : bilan.etat === 'complet' ? 'Tous les fonds sont reçus d’après les reçus comptables.'
            : bilan.etat === 'excedent' ? `Reçus comptables : ${formaterPrixCentimes(bilan.total)} pour ${formaterPrixCentimes(bilan.attendu)} attendus — écart à vérifier.`
            : bilan.etat === 'partiel' ? `Reçus comptables : ${formaterPrixCentimes(bilan.total)} sur ${formaterPrixCentimes(bilan.attendu)}, reste ${formaterPrixCentimes(bilan.reste)}.`
            : 'Aucun reçu complet trouvé à la dernière vérification.';
          ajouter({
            type: 'fonds', categorie: 'appelFonds', categorieLabel: 'Réception des fonds',
            titre: 'Confirmer la réception des fonds',
            contexte: `Appel de fonds envoyé${d.appelFonds ? ' le ' + formatDateFr(d.appelFonds) : ''}. ${signature}. ${etatFonds}`,
            jours: jRdv, gravite: jRdv <= 2 ? 'vigilance' : 'normal',
            geste: { type: 'email', motif: 'fonds' }, bouton: 'Ouvrir la confirmation'
          });
        }
        // Acquéreur accompagné par un confrère : c'est son notaire qui lui demande RIB et pièce
        // d'identité, jamais nous (demandé par l'étude le 29/09).
        if (jRdv <= JOURS_RAPPEL_RIB && dest && !ribDejaDemande(d) && !notaireParticipantRepresenteAcquereur(d)) {
          ajouter({
            type: 'rib', categorie: 'rendezVousSignature', categorieLabel: 'Rendez-vous de signature',
            titre: 'Demander le RIB et la pièce d’identité',
            contexte: `${signature}. L’email de rappel n’est pas encore parti.`,
            jours: jRdv, gravite: jRdv <= 1 ? 'critique' : 'vigilance',
            geste: { type: 'email', motif: 'rib' }, bouton: 'Ouvrir l’email'
          });
        }
      }

      // 3. Après la signature : le questionnaire de satisfaction (jamais au confrère), à l'acquéreur et au vendeur (étude 07/10 :
      //    « mettre dans les tâches aussi le questionnaire de satisfaction au vendeur ») ; le dossier n'est archivé qu'une fois
      //    les deux envoyés. Sans email du côté, la tâche demande de le renseigner (étude 07/10 : « s'il n'y a pas de mail,
      //    demander à remplir le mail ») — le côté reste attendu pour l'archivage.
      for (const q of [
        { type: 'questionnaire', partie: 'acquereur', fait: d.questionnaireEnvoyeLe, exclu: notaireParticipantRepresenteAcquereur(d),
          email: d.emailAcquereur, de: 'de l’acquéreur', a: 'à l’acquéreur' },
        { type: 'questionnaireVendeur', partie: 'vendeur', fait: d.questionnaireVendeurEnvoyeLe, exclu: confrereRepresenteVendeur(d),
          email: d.emailVendeur, de: 'du vendeur', a: 'au vendeur' }
      ]) {
        if (jRdv === null || jRdv >= 0 || jRdv < -JOURS_QUESTIONNAIRE || q.fait || q.exclu) continue;
        const signe = `Acte signé le ${formatDateFr(d.rendezVousSignature)}.`;
        const archivage = texteArchivageQuestionnaire(d, q.partie).replace(/^l/, 'L');
        ajouter(Object.assign({
          type: q.type, categorie: 'neutre', categorieLabel: 'Signature passée',
          jours: jRdv, delaiTexte: `signé ${quandJour(d.rendezVousSignature, aujourdhuiIso)}`, gravite: 'normal'
        }, q.email ? {
          titre: `Envoyer le questionnaire de satisfaction ${q.a}`,
          contexte: `${signe} ${archivage}.`,
          geste: q.partie === 'vendeur' ? { type: 'questionnaire', partie: 'vendeur' } : { type: 'questionnaire' },
          bouton: 'Préparer le questionnaire'
        } : {
          titre: `Renseigner l’email ${q.de} pour le questionnaire de satisfaction`,
          contexte: `${signe} Sans email, le questionnaire ne peut pas partir ; ${archivage.replace(/^L/, 'l')}.`,
          geste: { type: 'fiche' }, bouton: 'Ouvrir la fiche'
        }));
      }

      // 4. Le reste des points qui demandent une décision (vente préalable, date butoir, pièces…) :
      //    pas de geste tout prêt, la fiche s'ouvre.
      const points = alertesImportantes([d], aujourdhuiIso).concat(pointsEtatDossier(d));
      for (const p of points) {
        if (couverts.has(p.titre)) continue;
        couverts.add(p.titre);
        if (p.gravite === 'info') {
          aVenir.push({ dossier: d, titre: p.titre, detail: p.detail, iso: null });
          continue;
        }
        if (p.titre === 'Confirmer la vente préalable' && dest) {
          // Relancée il y a moins de JOURS_ENTRE_RELANCES_VENTE jours : on laisse le temps de répondre.
          if (d.relanceVentePrealableLe && ecartJours(d.relanceVentePrealableLe, aujourdhuiIso) < JOURS_ENTRE_RELANCES_VENTE) {
            aVenir.push({ dossier: d, titre: 'Vente préalable relancée', detail: `Relancée ${quandJour(d.relanceVentePrealableLe, aujourdhuiIso)}`, iso: null });
            continue;
          }
          ajouter({
            type: 'ventePrealable', categorie: 'ventebien', categorieLabel: 'Vente préalable',
            titre: 'Relancer la vente préalable', contexte: p.detail + (notaireParticipantRepresenteAcquereur(d) ? ' — email au confrère.' : ' — email au client.'),
            jours: p.jours, gravite: p.gravite,
            geste: { type: 'email', motif: 'ventePrealable' }, bouton: 'Ouvrir l’email',
            second: { type: 'valider', champ: 'ventebien', libelle: 'Vente préalable réalisée', fait: 'Vente préalable notée réalisée' }
          });
          continue;
        }
        const slug = normaliserPourRecherche(p.titre).replace(/[^a-z]+/g, '-');
        ajouter({
          type: 'point-' + slug, categorie: 'neutre', categorieLabel: /pr[ée]emption/i.test(p.titre) ? 'Droit de préemption' : 'À décider',
          titre: p.titre, contexte: p.detail + '.', jours: p.jours, gravite: p.gravite,
          geste: { type: 'fiche' }, bouton: 'Ouvrir la fiche'
        });
      }

      // 5. À venir : la prochaine échéance du dossier dans les 30 jours, si rien ne la couvre déjà.
      const prochaine = echeancesPlanning(d)
        .map(e => Object.assign({ j: ecartJours(aujourdhuiIso, e.iso) }, e))
        .filter(e => e.j !== null && e.j > 0 && e.j <= JOURS_A_VENIR && !typesAction.has(e.type))
        .sort((a, b) => a.j - b.j)[0];
      if (prochaine && !(prochaine.type === 'pret' && couverts.has('Relancer l’offre de prêt'))) {
        aVenir.push({ dossier: d, titre: prochaine.label, detail: courtDateJour(prochaine.iso), iso: prochaine.iso });
      }
    }
    // Demandé par l'étude : « À faire » ne couvre que les 15 jours à venir. On garde ce qui est en
    // retard (jours < 0 — c'est le plus urgent) et les points d'état sans date (jours null :
    // « Réclamer les pièces »…), on écarte seulement une action dont l'échéance est à plus de
    // 15 jours ; elle réapparaîtra le moment venu, et la prochaine échéance lointaine reste, elle,
    // dans « À venir ». Les fenêtres par règle ci-dessus sont déjà ≤ 15 jours : ce plafond en fait
    // une garantie explicite et uniforme plutôt qu'une somme de bornes éparses.
    const dansHorizonAFaire = (a) => a.jours === null || a.jours === undefined || a.jours <= JOURS_HORIZON_A_FAIRE;
    const actionsHorizon = actions.filter(dansHorizonAFaire);
    const rang = (a) => [ORDRE_GRAVITE_JOUR[a.gravite], a.jours === null || a.jours === undefined ? 999 : a.jours];
    actionsHorizon.sort((a, b) => { const x = rang(a), y = rang(b); return (x[0] - y[0]) || (x[1] - y[1]) || String(a.dossier.nom).localeCompare(String(b.dossier.nom)); });
    aVenir.sort((a, b) => (a.iso || '9999').localeCompare(b.iso || '9999'));
    return { actions: actionsHorizon, aVenir };
  }

  // Pure : le brouillon qu'ouvrira l'action (destinataire, objet, corps), pour l'afficher AVANT le
  // clic. Mêmes modèles que les boutons de la fiche — un seul texte par motif dans tout l'outil.
  function brouillonAction(action) {
    if (!action || !action.geste) return null;
    const d = action.dossier;
    if (action.geste.type === 'email') {
      const modele = MODELES_EMAIL_RELANCE[action.geste.motif];
      if (!modele) return null;
      const { sujet, corps } = modele.construire(d);
      const auConfrere = modele.confrere === true || notaireParticipantRepresenteAcquereur(d);
      return { a: modele.destinataire ? modele.destinataire(d) : emailDestinataireRelance(d), objet: sujet, corps: adapterCorpsEmail(corps, auConfrere) };
    }
    if (action.geste.type === 'questionnaire') {
      const { sujet, corps } = construireEmailQuestionnaireSatisfaction(d);
      return { a: (action.geste.partie === 'vendeur' ? d.emailVendeur : d.emailAcquereur) || '', objet: sujet, corps: adapterCorpsEmail(corps, false) };
    }
    return null;
  }

  // Pure : ce qui a changé depuis la visite précédente, par dossier — les pièces trouvées sur le
  // NAS, puis les lignes d'historique écrites par un collègue ou par CLAIRE elle-même (relevés de
  // l'agenda, parcours du NAS). Ce que le collaborateur a fait lui-même n'y figure pas : il le sait.
  function evenementsDepuisVisite(dossiersActifs, depuisIso, utilisateur) {
    if (!depuisIso) return [];
    const depuis = Date.parse(depuisIso);
    if (!Number.isFinite(depuis)) return [];
    const groupes = [];
    for (const d of dossiersActifs || []) {
      if (!d) continue;
      const lignes = [];
      const pieces = [];
      const dates = d.piecesTrouveesLe || {};
      for (const cle of Object.keys(dates)) {
        const t = Date.parse(dates[cle]);
        if (Number.isFinite(t) && t > depuis) pieces.push({ t, libelle: libelleNotificationPiece(d, cle) });
      }
      if (pieces.length) {
        lignes.push({
          t: Math.max.apply(null, pieces.map(p => p.t)), type: 'pieces',
          texte: `${pieces.length} pièce${pieces.length > 1 ? 's' : ''} trouvée${pieces.length > 1 ? 's' : ''} sur le NAS : ${pieces.map(p => p.libelle).join(', ')}`
        });
      }
      for (const e of d.historique || []) {
        if (!e || !e.texte) continue;
        const t = Date.parse(e.date);
        if (!Number.isFinite(t) || t <= depuis) continue;
        if (utilisateur && e.auteur === utilisateur) continue;
        lignes.push({ t, type: e.auteur ? 'collegue' : 'claire', auteur: e.auteur || '', texte: e.texte });
      }
      if (!lignes.length) continue;
      lignes.sort((a, b) => b.t - a.t);
      groupes.push({ dossier: d, dernier: lignes[0].t, lignes });
    }
    return groupes.sort((a, b) => b.dernier - a.dernier);
  }

  // ---- État de la journée (par collaborateur, sur ce poste) ----
  // « Plus tard » reporte une action au lendemain ; « Traité aujourd'hui » garde la trace de ce qui
  // vient d'être fait depuis ces écrans. Préférence de travail propre à la personne, gardée dans le
  // navigateur (comme le collaborateur du poste) : rien à partager, et une perte ne coûte rien —
  // l'action réapparaît simplement.
  var PREFIXE_ETAT_JOUR = 'claire-aujourdhui:';
  var PREFIXE_FENETRE_VUE = 'claire-aujourdhui-vue:';

  function lireEtatJour() {
    const vide = { reports: {}, traites: { date: '', liste: [] } };
    if (!utilisateurPoste) return vide;
    try {
      const brut = JSON.parse(localStorage.getItem(PREFIXE_ETAT_JOUR + utilisateurPoste) || 'null');
      if (!brut || typeof brut !== 'object') return vide;
      const aujourdhui = isoAujourdhuiLocal();
      const reports = {};
      for (const [cle, iso] of Object.entries(brut.reports || {})) if (typeof iso === 'string' && iso > aujourdhui) reports[cle] = iso;
      const traites = brut.traites && brut.traites.date === aujourdhui && Array.isArray(brut.traites.liste)
        ? brut.traites : { date: aujourdhui, liste: [] };
      return { reports, traites };
    } catch (e) { return vide; }
  }

  function ecrireEtatJour(etat) {
    if (!utilisateurPoste) return;
    try { localStorage.setItem(PREFIXE_ETAT_JOUR + utilisateurPoste, JSON.stringify(etat)); } catch (e) { /* pas bloquant */ }
  }

  function dossiersPerimetreJour() {
    return dossiersDuPerimetre(dossiers, utilisateurPoste, vueGlobaleDashboard()).filter(d => !d.archive);
  }

  // ---- Tâches faites ailleurs (demandé par l'étude le 29/09) ----
  // Une tâche du jour peut disparaître parce qu'elle a été faite HORS de ce poste : par CLAIRE
  // elle-même (appel de fonds trouvé sur le NAS, envoi relevé dans l'agenda), par un collègue, ou
  // par le collaborateur sur un autre poste. Elle ne s'effaçait alors sans laisser de trace ; elle
  // reste maintenant dans la liste, cochée, avec qui l'a faite. Source : l'historique du dossier
  // (daté, signé du collaborateur, sans auteur quand c'est CLAIRE), lu pour les seuls types de
  // tâche de « À faire », et seulement quand la tâche n'est plus due.
  var TACHES_JOUR_PAR_TYPE = {
    appelFonds: { titre: 'Envoyer l’appel de fonds', categorie: 'appelFonds',
      re: /^(Appel de fonds marqué réalisé|Envoi de l’appel de fonds noté automatiquement|Envoi appel de fonds relevé dans l’agenda|Envoi appel de fonds marquée réalisée)/,
      annule: /^(Envoi appel de fonds : validation annulée|Envoi de l’appel de fonds : noté par erreur, annulé|Envoyer l’appel de fonds : « déjà fait » annulé|Tâche du jour « Envoyer l’appel de fonds » : « fait » annulé)/ },
    projetEnvoye: { titre: 'Envoyer le projet d’acte', categorie: 'projetEnvoye',
      re: /^(Projet d’acte envoyé marqué réalisé|Envoi projet relevé dans l’agenda|Envoi projet marquée réalisée|Email envoyé — projet d’acte)/,
      annule: /^(Envoi projet : validation annulée|Envoi du projet : noté par erreur, annulé|Envoyer le projet d’acte : « déjà fait » annulé|Tâche du jour « Envoyer le projet d’acte » : « fait » annulé)/ },
    pret: { titre: 'Relancer l’offre de prêt', categorie: 'pret',
      re: /^(Relance manuelle envoyée — offre de prêt|Relance automatique ouverte)/ },
    fonds: { titre: 'Confirmer la réception des fonds', categorie: 'appelFonds',
      re: /^Email envoyé — confirmation de réception des fonds/ },
    rib: { titre: 'Demander le RIB et la pièce d’identité', categorie: 'rendezVousSignature',
      re: /^Relance manuelle envoyée — RIB/ },
    ventePrealable: { titre: 'Relancer la vente préalable', categorie: 'ventebien',
      re: /^(Relance envoyée — vente préalable|Vente préalable marquée réalisée)/,
      annule: /^(Vente préalable : validation annulée|Relancer la vente préalable : « déjà fait » annulé)/ },
    questionnaire: { titre: 'Envoyer le questionnaire de satisfaction à l’acquéreur', categorie: 'neutre',
      re: /^Questionnaire de satisfaction envoyé(?! au vendeur)/ },
    questionnaireVendeur: { titre: 'Envoyer le questionnaire de satisfaction au vendeur', categorie: 'neutre',
      re: /^Questionnaire de satisfaction envoyé au vendeur/ }
  };

  // Pure : « qui » a fait la tâche, dit sur la ligne cochée.
  function libelleFaitAilleurs(entree, utilisateur) {
    if (entree.auteur) return entree.auteur === utilisateur ? 'Faite depuis un autre poste' : `Faite par ${prenomCollaborateur(entree.auteur)}`;
    if (/noté automatiquement/.test(entree.texte)) return 'Faite par CLAIRE (courrier sur le NAS)';
    if (/relevé dans l’agenda/.test(entree.texte)) return 'Faite par CLAIRE (relevée dans l’agenda)';
    return 'Faite par CLAIRE';
  }

  // Pure et testable. `clesDues` : les tâches encore dues (elles ne sont pas faites) ;
  // `clesIci` : celles déjà cochées sur ce poste (elles ont déjà leur ligne).
  function tachesFaitesAilleurs(dossiersPerimetre, utilisateur, aujourdhuiIso, clesDues, clesIci) {
    const pad2 = (n) => String(n).padStart(2, '0');
    const parCle = new Map();
    const annulees = new Map();
    for (const d of dossiersPerimetre || []) {
      for (const e of (d && d.historique) || []) {
        if (!e || typeof e.texte !== 'string') continue;
        const dt = new Date(e.date);
        if (isNaN(dt) || `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}` !== aujourdhuiIso) continue;
        for (const [type, t] of Object.entries(TACHES_JOUR_PAR_TYPE)) {
          // Coché puis décoché (par erreur) : le « fait » plus ancien que l'annulation ne compte plus.
          if (t.annule && t.annule.test(e.texte)) { annulees.set(`${d.id}:${type}`, dt.getTime()); continue; }
          const noteeALaMain = e.texte.indexOf(t.titre + ' : noté fait') === 0 || e.texte.indexOf(`Tâche du jour « ${t.titre} »`) === 0;
          if (!t.re.test(e.texte) && !noteeALaMain) continue;
          const cle = `${d.id}:${type}`;
          if ((clesDues && clesDues.has(cle)) || (clesIci && clesIci.has(cle))) continue;
          const precedente = parCle.get(cle);
          if (precedente && precedente.t >= dt.getTime()) continue;
          parCle.set(cle, {
            cle, titre: t.titre, categorie: t.categorie, dossier: libelleDossierAffiche(d), dossierId: d.id, t: dt.getTime(),
            etat: libelleFaitAilleurs(e, utilisateur), heure: `${pad2(dt.getHours())} h ${pad2(dt.getMinutes())}`,
            ailleurs: true, courrier: /noté automatiquement/.test(e.texte) && type === 'appelFonds'
          });
        }
      }
    }
    // Une annulation (« validation annulée », « noté par erreur, annulé ») postérieure au « fait » le retire : la tâche est de nouveau à faire.
    return [...parCle.values()].filter(x => !(annulees.has(x.cle) && annulees.get(x.cle) >= x.t)).sort((a, b) => b.t - a.t);
  }

  // Les actions du jour telles que les écrans les montrent : sans celles reportées à demain.
  function etatAujourdhui() {
    const aujourdhui = isoAujourdhuiLocal();
    const calcul = actionsDuJour(dossiersPerimetreJour(), aujourdhui);
    const etat = lireEtatJour();
    const reportees = calcul.actions.filter(a => etat.reports[a.cle]);
    // Une action déjà traitée aujourd'hui (« Déjà fait », brouillon ouvert…) ne reste pas dans
    // « À faire » en plus de sa ligne cochée — c'était le doublon signalé par l'étude le 28/09.
    const traitees = new Set(etat.traites.liste.map(t => t.cle));
    const actions = calcul.actions.filter(a => !etat.reports[a.cle] && !traitees.has(a.cle));
    // Ce qui n'a pas été fait la veille revient aujourd'hui (la liste est recalculée chaque jour
    // depuis l'état des dossiers) et doit se REPÉRER comme tel (demandé par l'étude) : on retient,
    // par collaborateur et par poste, les actions restées à faire (ou reportées) dans la journée.
    const veille = majVeilleJour(lireVeilleJour(), aujourdhui, actions.concat(reportees).map(a => a.cle));
    ecrireVeilleJour(veille.stock);
    veilleJour = veille;
    const faitesAilleurs = tachesFaitesAilleurs(dossiersPerimetreJour(), utilisateurPoste, aujourdhui,
      new Set(calcul.actions.map(a => a.cle)), traitees);
    return { aujourdhui, actions, reportees, aVenir: calcul.aVenir, traites: etat.traites.liste.concat(faitesAilleurs) };
  }

  // Tâches du jour restées non faites la veille (voir etatAujourdhui). Pure et testable :
  // `stock` = { date, cles, hier, hierDate } tel que gardé dans le navigateur.
  //   - même jour : on ajoute les clés vues depuis (vue globale, nouveaux dossiers…) ;
  //   - nouveau jour : les clés de la dernière journée ouverte deviennent « non faites » —
  //     seules celles encore à faire aujourd'hui seront marquées (voir renderLigneActionJour).
  var PREFIXE_VEILLE_JOUR = 'claire-aujourdhui-veille:';
  let veilleJour = { hier: new Set(), hierDate: '' };

  function majVeilleJour(stock, aujourdhuiIso, clesEnCours) {
    const s = stock && typeof stock === 'object' ? stock : {};
    const cles = Array.isArray(s.cles) ? s.cles : [];
    let nouveau;
    if (s.date === aujourdhuiIso) {
      nouveau = { date: aujourdhuiIso, cles: Array.from(new Set(cles.concat(clesEnCours))), hier: Array.isArray(s.hier) ? s.hier : [], hierDate: s.hierDate || '' };
    } else if (s.date && s.date < aujourdhuiIso) {
      nouveau = { date: aujourdhuiIso, cles: clesEnCours.slice(), hier: cles, hierDate: s.date };
    } else {
      nouveau = { date: aujourdhuiIso, cles: clesEnCours.slice(), hier: [], hierDate: '' };
    }
    nouveau.cles = nouveau.cles.slice(0, 300);
    nouveau.hier = nouveau.hier.slice(0, 300);
    return { stock: nouveau, hier: new Set(nouveau.hier), hierDate: nouveau.hierDate };
  }

  // « Non faite hier », ou « Non faite depuis le 26 sept. » si la dernière journée ouverte est plus ancienne.
  function libelleNonFaite(hierDateIso, aujourdhuiIso) {
    if (!hierDateIso) return '';
    const j = ecartJours(hierDateIso, aujourdhuiIso);
    if (j === 1) return 'Non faite hier';
    return 'Non faite depuis le ' + new Date(hierDateIso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  function lireVeilleJour() {
    if (!utilisateurPoste) return null;
    try { return JSON.parse(localStorage.getItem(PREFIXE_VEILLE_JOUR + utilisateurPoste) || 'null'); } catch (e) { return null; }
  }
  function ecrireVeilleJour(stock) {
    if (!utilisateurPoste) return;
    try { localStorage.setItem(PREFIXE_VEILLE_JOUR + utilisateurPoste, JSON.stringify(stock)); } catch (e) { /* pas bloquant */ }
  }

  // Seule la ligne qu'on vient de cocher s'anime : la liste est reconstruite à chaque rendu
  // (sondage, réouverture de la page), et une animation posée sur toutes les lignes traitées
  // les faisait « clignoter » à chaque fois.
  var derniereCleTraiteeJour = null;
  var derniereCleTraiteeJourLe = 0;
  var DUREE_ANIMATION_TRAITE_MS = 700;
  function vientDEtreTraitee(cle) {
    return cle === derniereCleTraiteeJour && Date.now() - derniereCleTraiteeJourLe < DUREE_ANIMATION_TRAITE_MS;
  }

  function noterTraite(action, etatTexte, annulation) {
    derniereCleTraiteeJour = action.cle;
    derniereCleTraiteeJourLe = Date.now();
    const etat = lireEtatJour();
    etat.traites.date = isoAujourdhuiLocal();
    etat.traites.liste = etat.traites.liste.filter(t => t.cle !== action.cle);
    const dt = new Date();
    etat.traites.liste.unshift(Object.assign({
      cle: action.cle, titre: action.titre, dossier: libelleDossierAffiche(action.dossier), dossierId: action.dossier.id,
      categorie: action.categorie, etat: etatTexte,
      heure: `${String(dt.getHours()).padStart(2, '0')} h ${String(dt.getMinutes()).padStart(2, '0')}`
    }, annulation || {}));
    etat.traites.liste = etat.traites.liste.slice(0, 50);
    ecrireEtatJour(etat);
  }

  // Cherche d'abord dans le périmètre du poste (écrans « Aujourd'hui »), puis dans le dossier
  // lui-même : la fiche d'un dossier d'un collègue montre aussi ses actions (encadré « Prochaine
  // étape »), leurs boutons doivent y fonctionner.
  function trouverActionJour(cle) {
    const aujourdhui = isoAujourdhuiLocal();
    const trouve = (liste) => actionsDuJour(liste, aujourdhui).actions.find(a => a.cle === cle) || null;
    const a = trouve(dossiersPerimetreJour());
    if (a) return a;
    const id = String(cle).slice(0, String(cle).lastIndexOf(':'));
    const d = dossiers.find(x => x.id === id && !x.archive);
    return d ? trouve([d]) : null;
  }

  // Le geste d'une action, en UN clic : l'email s'ouvre déjà rédigé, l'envoi se note, et une simple
  // notification le confirme (avec « Annuler » quand c'est défaisable) — pas de fenêtre à fermer.
  function executerActionJour(cle, secondaire) {
    const a = trouverActionJour(cle);
    if (!a) return;
    const geste = secondaire ? a.second : a.geste;
    if (!geste) return;
    const id = a.dossier.id;
    if (geste.type === 'email') {
      noterTraite(a, 'Brouillon ouvert');
      envoyerRelanceCiblee(id, geste.motif, true);
    } else if (geste.type === 'questionnaire') {
      noterTraite(a, 'Questionnaire ouvert');
      envoyerQuestionnaireSatisfaction(id, true, geste.partie);
    } else if (geste.type === 'marquer' && geste.champ !== 'appelFonds' && geste.champ !== 'projetEnvoye') {
      // « Déjà relancé » / « Déjà reçu » : la trace du dossier est posée par « Déjà fait » (CHAMP_FAIT_MAIN_PAR_TYPE, date du
      // rendez-vous retenue) — ce chemin posait une date d'appel de fonds à tort et la tâche revenait le lendemain.
      marquerFaitJour(cle);
    } else if (geste.type === 'marquer') {
      const d = dossiers.find(x => x.id === id);
      const precedent = d ? (d[geste.champ] || '') : '';
      const texte = geste.champ === 'projetEnvoye' ? 'Projet noté envoyé' : 'Appel de fonds noté envoyé';
      noterTraite(a, texte, { champ: geste.champ, precedent });
      marquerEnvoiAujourdhui(id, geste.champ);
      afficherToast(`${texte} — ${libelleDossierAffiche(a.dossier)}.`, 'Annuler', () => annulerTraiteJour(cle));
    } else if (geste.type === 'valider') {
      // Cocher l'échéance elle-même (même geste que la case de la fiche) ; « Annuler » la décoche.
      noterTraite(a, geste.fait, { echeance: geste.champ });
      cocherEcheance(id, geste.champ);
      afficherToast(`${geste.fait} — ${libelleDossierAffiche(a.dossier)}.`, 'Annuler', () => annulerTraiteJour(cle));
    } else if (geste.type === 'appelFonds') {
      fermerFenetreAujourdhui();
      preparerAppelFondsDepuisDossier(id);
    } else {
      fermerFenetreAujourdhui();
      ouvrirDossierDepuisDashboard(id);
    }
  }

  // « Marquer envoyé » : même effet que saisir la date du jour dans la carte « Envoi au client ».
  function marquerEnvoiAujourdhui(id, champ) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const aujourdhui = isoAujourdhuiLocal();
    notifierDateAjoutee(d, LIBELLES_CATEGORIE[champ] || champ, aujourdhui, d[champ] || '');
    d[champ] = aujourdhui;
    if (champ === 'projetEnvoye') marquerProjetEnvoyeSelonDate(d, aujourdhui);
    else marquerAppelFondsSelonDate(d, aujourdhui);
    sauvegarder(d);
    render();
    // Même effet que la date saisie sur la fiche, agenda compris : ce chemin ne le notait pas.
    noterEnvoiDansAgenda(id, true);
  }

  function reporterActionJour(cle) {
    const a = trouverActionJour(cle);
    const etat = lireEtatJour();
    etat.reports[cle] = addDays(isoAujourdhuiLocal(), 1);
    ecrireEtatJour(etat);
    if (a) noterTraite(a, 'Reporté à demain');
    apercusJour.delete(cle);
    render();
    if (a) afficherToast(`Reporté à demain — ${a.titre.toLowerCase()}.`, 'Annuler', () => annulerTraiteJour(cle));
  }

  // « Déjà fait » : valider une action à la main, quand le geste a été fait hors de CLAIRE (email
  // envoyé depuis Outlook, relance passée par téléphone…). La coche seule : aucun champ du dossier
  // n'est touché (contrairement à « Marquer envoyé », qui pose une date), donc « manuel » sert juste
  // à proposer « Annuler » dans la liste des traités. Défaisable tant que le repère du jour tient.
  // Quand le geste laisse une trace sur le dossier (relance de l'offre, RIB demandé, fonds
  // confirmés, envoi fait…), « Déjà fait » la pose aussi : sans elle, l'action reviendrait dès le
  // lendemain alors qu'elle est faite. Les valeurs d'avant sont gardées pour « Annuler ».
  var CHAMP_FAIT_MAIN_PAR_TYPE = {
    pret: 'derniereRelanceAuto', rib: 'ribDemandeLe', fonds: 'receptionFondsConfirmeeLe',
    questionnaire: 'questionnaireEnvoyeLe', questionnaireVendeur: 'questionnaireVendeurEnvoyeLe', appelFonds: 'appelFonds', projetEnvoye: 'projetEnvoye',
    ventePrealable: 'relanceVentePrealableLe', relanceFonds: 'relanceFondsLe', relanceDecompteConfrere: 'relanceDecompteConfrereLe'
  };

  // Tâches qui SONT une échéance du dossier : la case ronde coche l'échéance (même geste que sur la fiche, décochable par « Annuler »),
  // au lieu de ne laisser qu'une trace dans le journal — la tâche revenait chaque jour tant que l'échéance restait ouverte.
  var ECHEANCE_FAIT_MAIN_PAR_TYPE = {
    'point-confirmer-la-vente-prealable': { champ: 'ventebien', fait: 'Vente préalable notée réalisée' }
  };

  // `silencieux` : appelé pour chaque tâche d'un groupe (marquerFaitGroupeJour) — ni rendu ni notification, le groupe s'en charge.
  function marquerFaitJour(cle, silencieux) {
    const a = trouverActionJour(cle);
    if (!a) return false;
    const echeance = ECHEANCE_FAIT_MAIN_PAR_TYPE[a.type];
    if (echeance) {
      noterTraite(a, echeance.fait, { echeance: echeance.champ });
      cocherEcheance(a.dossier.id, echeance.champ);
      apercusJour.delete(cle);
      if (!silencieux) afficherToast(`${echeance.fait} — ${libelleDossierAffiche(a.dossier)}.`, 'Annuler', () => annulerTraiteJour(cle));
      return true;
    }
    const champ = CHAMP_FAIT_MAIN_PAR_TYPE[a.type];
    const d = champ ? dossiers.find(x => x.id === a.dossier.id) : null;
    const annulation = { manuel: true };
    let envoiANoter = false;
    if (d) {
      const aujourdhui = isoAujourdhuiLocal();
      if (champ === 'appelFonds' || champ === 'projetEnvoye') {
        annulation.champ = champ;
        annulation.precedent = d[champ] || '';
        d[champ] = aujourdhui;
        if (champ === 'projetEnvoye') marquerProjetEnvoyeSelonDate(d, aujourdhui);
        else marquerAppelFondsSelonDate(d, aujourdhui);
        envoiANoter = true;
      } else {
        annulation.champsDossier = { [champ]: d[champ] || null };
        d[champ] = aujourdhui;
        // Une relance des fonds vaut pour UNE date de rendez-vous (relanceFondsDue lit relanceFondsPour).
        if (a.type === 'relanceFonds') {
          annulation.champsDossier.relanceFondsPour = d.relanceFondsPour || null;
          d.relanceFondsPour = d.rendezVousSignature || '';
        }
        if (a.type === 'relanceDecompteConfrere') {
          annulation.champsDossier.relanceDecompteConfrerePour = d.relanceDecompteConfrerePour || null;
          d.relanceDecompteConfrerePour = d.rendezVousSignature || '';
        }
      }
      ajouterHistorique(d, `${a.titre} : noté fait à la main`);
      sauvegarder(d);
    } else {
      // Aucun champ du dossier à poser, mais le geste doit se voir dans l'activité de l'étude
      // (tableau de bord, tous postes) : une ligne d'historique signée du collaborateur.
      const dj = dossiers.find(x => x.id === a.dossier.id);
      if (dj) {
        ajouterHistorique(dj, `Tâche du jour « ${a.titre} » : faite`);
        sauvegarder(dj);
        annulation.journalSeul = true;
      }
    }
    noterTraite(a, 'Déjà fait', annulation);
    notifierTacheFaite(dossiers.find(x => x.id === a.dossier.id), a.titre, 'notée faite à la main');
    apercusJour.delete(cle);
    if (!silencieux) {
      render();
      afficherToast(`Marqué fait — ${a.titre.toLowerCase()}.`, 'Annuler', () => annulerTraiteJour(cle));
    }
    if (envoiANoter) noterEnvoiDansAgenda(d.id, true);
    return true;
  }

  // ---- Tâches imbriquées par dossier (étude 05/10 : « système de tâches imbriqué par dossier — une ligne commune avec une
  // case qui valide les tâches, et un tiroir qui les déroule une par une ») ----
  // Pure : la liste d'« À faire » où les tâches d'un MÊME dossier (deux ou plus, en comptant celles déjà faites aujourd'hui —
  // `traites`, facultatif) sont réunies en un groupe, placé au rang de sa tâche la plus pressante (l'ordre d'actionsDuJour est
  // gardé). Un groupe garde au moins une tâche à faire : cocher une tâche du tiroir ne le défait pas, elle y reste barrée.
  // Rend { elements: [{ action }] ou [{ groupe: { dossier, actions, faites } }], traites: ceux qui ne sont dans aucun groupe }.
  function grouperActionsParDossier(actions, traites) {
    const parDossier = new Map();
    for (const a of actions || []) {
      const id = a && a.dossier && a.dossier.id;
      if (!id) continue;
      if (!parDossier.has(id)) parDossier.set(id, []);
      parDossier.get(id).push(a);
    }
    const faitesPar = new Map();
    for (const t of traites || []) {
      if (!t || !t.dossierId || !parDossier.has(t.dossierId)) continue;
      if (!faitesPar.has(t.dossierId)) faitesPar.set(t.dossierId, []);
      faitesPar.get(t.dossierId).push(t);
    }
    const groupes = new Set([...parDossier.keys()].filter(id => parDossier.get(id).length + (faitesPar.get(id) || []).length >= 2));
    const vus = new Set();
    const elements = [];
    for (const a of actions || []) {
      const id = a && a.dossier && a.dossier.id;
      if (!id || !groupes.has(id)) { elements.push({ action: a }); continue; }
      if (vus.has(id)) continue;
      vus.add(id);
      elements.push({ groupe: { dossier: a.dossier, actions: parDossier.get(id), faites: faitesPar.get(id) || [] } });
    }
    return { elements, traites: (traites || []).filter(t => !(t && groupes.has(t.dossierId))) };
  }

  // Tiroirs ouverts (par dossier), gardés d'un rendu à l'autre. Basculer ne reconstruit pas la liste : la classe change sur
  // place, le tiroir s'ouvre en glissant.
  var groupesOuvertsJour = new Set();
  function basculerGroupeJour(id) {
    const ouvrir = !groupesOuvertsJour.has(id);
    if (ouvrir) groupesOuvertsJour.add(id); else groupesOuvertsJour.delete(id);
    if (typeof document === 'undefined') return;
    document.querySelectorAll(`.ja-groupe[data-groupe="${CSS.escape(id)}"]`).forEach(li => {
      li.classList.toggle('ouvert', ouvrir);
      const b = li.querySelector('.ja-groupe-ouvrir');
      if (b) b.setAttribute('aria-expanded', String(ouvrir));
      const t = li.querySelector('.ja-texte');
      if (t) t.setAttribute('aria-expanded', String(ouvrir));
      // Dans une carte du tableau de bord, le tiroir ouvert ne doit pas être coupé : la carte défile.
      const corps = li.closest('.w-corps');
      if (corps && ouvrir) corps.classList.add('w-defile');
    });
  }

  // La case commune : toutes les tâches du dossier faites d'un geste, défaisables d'un seul « Annuler ».
  function marquerFaitGroupeJour(id) {
    const d = dossiers.find(x => x.id === id);
    const cles = etatAujourdhui().actions.filter(a => a.dossier.id === id).map(a => a.cle);
    const faites = cles.filter(cle => marquerFaitJour(cle, true));
    if (!faites.length) return;
    groupesOuvertsJour.delete(id);
    render();
    afficherToast(`${faites.length} tâche${faites.length > 1 ? 's' : ''} faite${faites.length > 1 ? 's' : ''} — ${d ? libelleDossierAffiche(d) : ''}.`, 'Annuler',
      () => faites.forEach(cle => annulerTraiteJour(cle)));
  }

  // Le groupe d'un dossier : sa case commune, son nom, ce qu'il reste (une puce par tâche, de la couleur de sa catégorie), le
  // délai le plus proche ; le tiroir déroule les tâches, chacune avec sa propre case et son geste.
  function renderGroupeActionsJour(groupe, global) {
    const { dossier: d, actions } = groupe;
    const id = escapeOnclickArg(d.id);
    const ouvert = groupesOuvertsJour.has(d.id);
    const faites = groupe.faites || [];
    const premiere = actions[0];
    const n = actions.length;
    const total = n + faites.length;
    const compte = faites.length ? `${faites.length}/${total} faites` : `${n} tâches`;
    // Le groupe comme une tâche : le dossier en surtitre (étude 06/10), puis « tâche · tâche » et le compte en badge.
    const taches = actions.map(a => a.titre).join(' · ');
    const puces = faites.map(t => `<span class="dot-label dl-success ja-groupe-puce-faite" title="${escapeAttr(`${t.titre} — fait`)}"><span class="dot"></span></span>`).join('')
      + actions.map(a => `<span class="dot-label dl-${a.categorie || 'neutre'}" title="${escapeAttr(a.titre)}"><span class="dot"></span></span>`).join('');
    return `
      <li class="ja ja-avec-case ja-groupe g-${premiere.gravite || 'normal'}${ouvert ? ' ouvert' : ''}" data-groupe="${escapeAttr(d.id)}">
        <span class="dot-label dl-${premiere.categorie || 'neutre'} ja-case-cadre"><button type="button" class="ja-case-ronde" role="checkbox" aria-checked="false" onclick="marquerFaitGroupeJour('${id}')" title="${n > 1 ? `Tout est fait — valider les ${n} tâches` : 'Valider la dernière tâche'}" aria-label="${escapeAttr(n > 1 ? `Valider les ${n} tâches de ${libelleDossierAffiche(d)}` : `Valider la dernière tâche de ${libelleDossierAffiche(d)}`)}">${icone('check')}</button></span>
        <button type="button" class="ja-texte" aria-expanded="${ouvert}" onclick="basculerGroupeJour('${id}')" title="Voir les tâches une par une">
          <span class="ja-surtitre">${lienDossierTache(d)}</span>
          <span class="ja-titre">${escapeHtml(taches)} <span class="ja-groupe-compte${faites.length ? ' entame' : ''}">${compte}</span></span>
        </button>
        <span class="ja-delai${premiere.gravite === 'critique' ? ' proche' : ''}">${d.responsable ? pastilleResponsableTache(d.responsable) : ''}${escapeHtml(delaiAction(premiere))}</span>
        <span class="ja-groupe-puces" aria-hidden="true">${puces}</span>
        <span class="ja-actions-sec"><wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn ja-ouvrir-fiche" data-ouvrir-dossier="${escapeAttr(d.id)}" title="Ouvrir la fiche du dossier" aria-label="Ouvrir la fiche de ${escapeAttr(libelleDossierAffiche(d))}">${icone('file-text')}</wa-button><wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn ja-groupe-ouvrir" aria-expanded="${ouvert}" onclick="basculerGroupeJour('${id}')" title="Dérouler les tâches" aria-label="Dérouler les tâches">${icone('chevron-down')}</wa-button></span>
        <div class="ja-groupe-tiroir"><div class="ja-groupe-tiroir-int">
          <ul class="ja-liste ja-taches ja-sous-liste">${actions.map(a => renderLigneActionJour(a, false, false, true)).join('')}${renderLignesTraitees(faites, true)}</ul>
        </div></div>
      </li>`;
  }

  // Les lignes d'« À faire » : une tâche seule telle quelle, plusieurs tâches d'un même dossier en groupe ; puis les tâches
  // faites aujourd'hui qui ne sont dans aucun groupe (celles d'un groupe sont barrées dans son tiroir) — sauf `sansTraites` :
  // l'appelant les place plus bas lui-même (carte du tableau de bord : après les rappels à venir).
  function renderActionsJour(actions, global, traites, sansTraites) {
    const { elements, traites: horsGroupes } = grouperActionsParDossier(actions, traites);
    return elements.map(e => e.groupe ? renderGroupeActionsJour(e.groupe, global) : renderLigneActionJour(e.action, global)).join('')
      + (sansTraites ? '' : renderLignesTraitees(horsGroupes));
  }

  // Défait un report, ou un « Marquer envoyé » (la date d'avant est remise). Un brouillon déjà
  // ouvert ne se défait pas : il est parti dans la messagerie.
  function annulerTraiteJour(cle) {
    const etat = lireEtatJour();
    const entree = etat.traites.liste.find(t => t.cle === cle);
    delete etat.reports[cle];
    etat.traites.liste = etat.traites.liste.filter(t => t.cle !== cle);
    ecrireEtatJour(etat);
    if (entree && entree.champsDossier) {
      const d = dossiers.find(x => x.id === entree.dossierId);
      if (d) {
        for (const [k, v] of Object.entries(entree.champsDossier)) {
          if (v) d[k] = v; else delete d[k];
        }
        ajouterHistorique(d, `${entree.titre} : « déjà fait » annulé`);
        sauvegarder(d);
      }
    }
    if (entree && entree.journalSeul) {
      const d = dossiers.find(x => x.id === entree.dossierId);
      if (d) {
        ajouterHistorique(d, `Tâche du jour « ${entree.titre} » : « fait » annulé`);
        sauvegarder(d);
      }
    }
    if (entree && entree.champ) {
      const d = dossiers.find(x => x.id === entree.dossierId);
      if (d) {
        d[entree.champ] = entree.precedent || '';
        if (entree.champ === 'projetEnvoye') marquerProjetEnvoyeSelonDate(d, d.projetEnvoye);
        else marquerAppelFondsSelonDate(d, d.appelFonds);
        ajouterHistorique(d, `${entree.champ === 'projetEnvoye' ? 'Envoi du projet' : 'Envoi de l’appel de fonds'} : noté par erreur, annulé`);
        sauvegarder(d);
        // La mention « envoyé » du lieu du rendez-vous Outlook suit (retirée, ou remise si l'envoi d'avant était fait).
        majMentionAgendaEnvoi(d.id, true);
      }
    }
    // Échéance cochée depuis une tâche (offre reçue, vente préalable réalisée) : la même case, décochée — le délai revient.
    if (entree && entree.echeance) {
      const d = dossiers.find(x => x.id === entree.dossierId);
      if (d && echeanceValidee(d, entree.echeance)) devaliderEcheance(d.id, entree.echeance);
    }
    render();
  }

  let apercusJour = new Set();
  function basculerApercuJour(cle) {
    if (apercusJour.has(cle)) apercusJour.delete(cle); else apercusJour.add(cle);
    render();
  }

  // ---- Rendu ----
  // Libellé du bouton d'une ligne : un verbe court, le même à chaque fois pour le même geste.
  function libelleCourtGeste(a) {
    const parType = { pret: 'Relancer', ventePrealable: 'Relancer', fonds: 'Confirmer', rib: 'Envoyer', questionnaire: 'Envoyer', questionnaireVendeur: 'Envoyer', appelFonds: 'Préparer' };
    if (a.type === 'projetEnvoye') return a.geste && a.geste.type === 'email' ? 'Envoyer' : 'Marquer envoyé';
    if (parType[a.type]) return parType[a.type];
    return 'Ouvrir';
  }

  function iconeGeste(a) {
    if (!a.geste) return icone('folder');
    if (a.geste.type === 'email' || a.geste.type === 'questionnaire') return icone('mail');
    if (a.geste.type === 'marquer') return icone('check');
    if (a.geste.type === 'appelFonds') return icone('file-text');
    return icone('folder');
  }

  // Pure : l'encouragement qui accompagne la progression. Court, jamais culpabilisant.
  function messageProgressionJour(reste, faits) {
    if (!reste && !faits) return 'Rien au programme aujourd’hui.';
    if (!reste) return 'Journée bouclée.';
    if (!faits) return reste === 1 ? 'Une seule chose aujourd’hui.' : `C’est parti : ${reste} choses aujourd’hui.`;
    if (reste === 1) return 'Plus qu’une !';
    return `Bien lancé — encore ${reste}.`;
  }

  // Anneau de progression : se remplit en vert à chaque action traitée, coche au centre à la fin.
  function renderAnneauJour(reste, faits) {
    const total = reste + faits;
    const r = 21, c = 2 * Math.PI * r;
    const part = total ? faits / total : 1;
    const fini = total > 0 && reste === 0;
    return `
      <span class="jour-anneau${fini ? ' fini' : ''}${fini && vientDEtreTraitee(derniereCleTraiteeJour) ? ' vient-de-finir' : ''}" role="img" aria-label="${faits} sur ${total} traitée${faits > 1 ? 's' : ''}">
        <svg viewBox="0 0 50 50" width="50" height="50" aria-hidden="true">
          <circle cx="25" cy="25" r="${r}" class="jour-anneau-fond"/>
          <circle cx="25" cy="25" r="${r}" class="jour-anneau-plein" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - part)).toFixed(1)}" transform="rotate(-90 25 25)"/>
        </svg>
        <span class="jour-anneau-texte">${fini ? icone('check') : `${faits}<small>/${total}</small>`}</span>
      </span>`;
  }

  function renderProgressionJour(reste, faits) {
    return `<div class="jour-progres">${renderAnneauJour(reste, faits)}
      <span class="jour-progres-texte"><b>${escapeHtml(messageProgressionJour(reste, faits))}</b>
      <span>${faits} sur ${reste + faits} traitée${faits > 1 ? 's' : ''}</span></span></div>`;
  }

  // ---- Ligne d'action : LE composant de CLAIRE pour tout geste (email, préparer, noter…) ----
  // Même forme que la liste « À faire » (demandé par l'étude le 28/09 : un même geste ne doit plus
  // prendre trois formes selon l'écran) : pastille de catégorie, titre et précision, délai, le
  // geste en un bouton à droite, des icônes secondaires à côté. Un clic sur le texte déplie le
  // détail quand il y en a un (clé `apercu`, même mémoire que « À faire »). Une ligne `faite` garde
  // son bouton (Renvoyer…), en contour, et une pastille verte.
  //   o = { categorie, categorieLabel, titre, titreHtml?, sous?, sousHtml?, delai?, delaiProche?, responsable? (initiales),
  //         gravite?, bouton?: { libelle, icone? (html), onclick, titre? }, secondaires?: html,
  //         faite?, apercu?, detail?: html, detailOuvert?, classe? }
  //   o.caseRonde = { onclick, libelle } : une case ronde à cocher à la place de la pastille (vue
  //   « Aujourd'hui », étude 01/10), cerclée de la couleur de la catégorie ; la cocher fait la tâche.
  // Initiales du responsable dans une petite pastille ronde, posée devant le délai d'une tâche (même pastille que le Suivi).
  function pastilleResponsableTache(nom) {
    const ini = initialesCollaborateur(nom);
    return ini ? `<span class="pastille-collab pastille-tache" title="${escapeAttr(nom)}" aria-label="${escapeAttr('Responsable : ' + nom)}">${escapeHtml(ini)}</span>` : '';
  }

  function renderLigneAction(o) {
    const ouverte = !!o.detailOuvert || !!(o.apercu && apercusJour.has(o.apercu));
    const sous = o.sousHtml != null ? o.sousHtml : (o.sous ? escapeHtml(o.sous) : '');
    const contenu = `${o.surtitreHtml ? `<span class="ja-surtitre">${o.surtitreHtml}</span>` : ''}<span class="ja-titre">${escapeHtml(o.titre)}${o.titreHtml || ''}</span>${sous ? `<span class="ja-sous">${sous}</span>` : ''}`;
    const texte = o.apercu
      ? `<button type="button" class="ja-texte" aria-expanded="${ouverte}" onclick="basculerApercuJour('${escapeOnclickArg(o.apercu)}')" title="Voir le détail">${contenu}</button>`
      : `<span class="ja-texte ja-texte-fixe">${contenu}</span>`;
    const b = o.bouton;
    const go = b
      ? `<wa-button ${o.faite ? 'appearance="outlined"' : 'variant="brand"'} class="${o.faite ? 'ja-go ja-go-contour' : 'primary ja-go'}" onclick="${b.onclick}" title="${escapeAttr(b.titre || b.libelle)}">${b.icone || ''}<span>${escapeHtml(b.libelle)}</span></wa-button>`
      : '<span class="ja-go ja-go-vide"></span>';
    const classes = ['ja', o.gravite ? 'g-' + o.gravite : '', o.faite ? 'ja-faite' : '', ouverte ? 'ouverte' : '', o.caseRonde ? 'ja-avec-case' : '', o.classe || ''].filter(Boolean).join(' ');
    const pastille = o.caseRonde
      ? `<span class="dot-label dl-${o.categorie || 'neutre'} ja-case-cadre"><button type="button" class="ja-case-ronde" role="checkbox" aria-checked="false" onclick="${o.caseRonde.onclick}" title="${escapeAttr(o.caseRonde.libelle)}" aria-label="${escapeAttr(o.caseRonde.libelle + ' : ' + o.titre)}">${icone('check')}</button></span>`
      : `<span class="dot-label dl-${o.faite ? 'success' : (o.categorie || 'neutre')}" title="${escapeAttr(o.categorieLabel || '')}"><span class="dot"></span></span>`;
    return `
      <li class="${classes}">
        ${pastille}
        ${texte}
        <span class="ja-delai${o.delaiProche ? ' proche' : ''}">${o.responsable ? pastilleResponsableTache(o.responsable) : ''}${escapeHtml(o.delai || '')}</span>
        ${go}
        <span class="ja-actions-sec">${o.secondaires || ''}</span>
        ${ouverte && o.detail ? `<div class="ja-detail">${o.detail}</div>` : ''}
      </li>`;
  }

  function renderBrouillonEmail(brouillon) {
    if (!brouillon) return '';
    return `<div class="jour-brouillon">
      <dl><dt>À</dt><dd>${escapeHtml(brouillon.a || '—')}</dd><dt>Objet</dt><dd>${escapeHtml(brouillon.objet)}</dd></dl>
      ${brouillon.corps.split(/\n\n+/).map(p => `<p>${marquesEnHtml(escapeHtml(p).replace(/\n/g, '<br>'))}</p>`).join('')}
    </div>`;
  }

  // Une action sur UNE ligne : le geste à droite (un clic), « Plus tard » à côté ; un clic sur le
  // texte déplie le contexte et le texte du brouillon. `dansFiche` : la même ligne dans la fiche du
  // dossier (encadré « Prochaine étape ») — sans le nom du dossier, et sans « Ouvrir la fiche ».
  // `sansDossier` : la tâche dans le tiroir de son dossier — titre seul, sans sous-titre (étude 05/10).
  function renderLigneActionJour(a, global, dansFiche, sansDossier) {
    const cle = escapeOnclickArg(a.cle);
    const ouverte = apercusJour.has(a.cle);
    const brouillon = ouverte ? brouillonAction(a) : null;
    // Dans le tiroir d'un groupe : le titre seul, sans sous-titre (étude 05/10). Le nom du dossier ouvre sa fiche (étude 05/10 :
    // « je clique souvent sur le nom du dossier dans la tâche pour atteindre le dossier ») — voir lienDossierTache.
    // Le nom du dossier en petit AU-DESSUS de la tâche (étude 06/10 : « met en surtitre de la tâche ou groupe de tâches le nom du
    // dossier en petit ») ; il ouvre la fiche, et une icône « fiche » parmi les icônes de droite fait de même.
    const avecDossier = !dansFiche && !sansDossier;
    const sansGeste = dansFiche && (!a.geste || a.geste.type === 'fiche');
    return renderLigneAction({
      categorie: a.categorie, categorieLabel: a.categorieLabel, gravite: a.gravite,
      titre: a.titre,
      surtitreHtml: avecDossier ? lienDossierTache(a.dossier) : '',
      titreHtml: (veilleJour.hier.has(a.cle) ? ` <span class="ja-non-faite">${escapeHtml(libelleNonFaite(veilleJour.hierDate, isoAujourdhuiLocal()))}</span>` : ''),
      sousHtml: '', delai: delaiAction(a), delaiProche: a.gravite === 'critique',
      // Initiales du responsable du dossier (étude 05/10 : « remets les initiales de la personne en charge ») — pas dans la fiche
      // ni dans le tiroir d'un groupe, où elles sont déjà sur la ligne du dossier.
      responsable: dansFiche || sansDossier ? '' : a.dossier.responsable,
      bouton: sansGeste ? null : { libelle: libelleCourtGeste(a), icone: iconeGeste(a), onclick: `executerActionJour('${cle}')`, titre: a.bouton },
      // Vue « Aujourd'hui » : la case ronde devant la tâche la valide à la main (étude, 01/10) ; la
      // fiche garde sa pastille et le ✓ « Déjà fait » parmi les icônes.
      caseRonde: dansFiche ? null : { onclick: `marquerFaitJour('${cle}')`, libelle: 'Fait — valider à la main' },
      secondaires: `${dansFiche ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn ja-fait-manuel" onclick="marquerFaitJour('${cle}')" title="Déjà fait — valider à la main" aria-label="Marquer comme déjà fait">${icone('check')}</wa-button>` : ''}
          ${avecDossier ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn ja-ouvrir-fiche" data-ouvrir-dossier="${escapeAttr(a.dossier.id)}" title="Ouvrir la fiche du dossier" aria-label="Ouvrir la fiche de ${escapeAttr(libelleDossierAffiche(a.dossier))}">${icone('file-text')}</wa-button>` : ''}
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn ja-plus-tard" onclick="reporterActionJour('${cle}')" title="Plus tard (demain)" aria-label="Reporter à demain">${icone('clock')}</wa-button>`,
      apercu: a.cle,
      detail: `<p>${escapeHtml(a.contexte)}</p>
            ${renderBrouillonEmail(brouillon)}
            <div class="ja-detail-liens">
              ${a.second && !(dansFiche && a.second.type === 'fiche') ? `<button type="button" class="lien-action" onclick="executerActionJour('${cle}', true)">${escapeHtml(a.second.libelle)}</button>` : ''}
              ${!dansFiche && a.geste && a.geste.type !== 'fiche' ? `<button type="button" class="lien-action" onclick="executerActionJourFiche('${cle}')">Ouvrir la fiche</button>` : ''}
            </div>`
    });
  }

  // Ce qui a été traité aujourd'hui, coché, dans la même liste : la journée se voit avancer.
  // `sansDossier` : la tâche faite dans le tiroir de son dossier — titre seul, sans sous-titre (étude 05/10).
  function renderLignesTraitees(traites, sansDossier) {
    return traites.map(t => `
      <li class="ja fait${t.etat === 'Reporté à demain' ? ' reporte' : ''}${vientDEtreTraitee(t.cle) ? ' vient-de-finir' : ''}">
        <span class="ja-coche" aria-hidden="true">${t.etat === 'Reporté à demain' ? icone('clock') : icone('check')}</span>
        <span class="ja-texte-fait">
          <span class="ja-titre">${escapeHtml(t.titre)}</span>
          ${sansDossier ? '' : `<span class="ja-sous">${t.dossierId ? lienDossierTache({ id: t.dossierId }, libelleDossierParNom(t.dossier, t.dossierId)) : escapeHtml(libelleDossierParNom(t.dossier, t.dossierId))} · ${escapeHtml(t.etat)} · ${escapeHtml(t.heure)}</span>`}
        </span>
        ${t.etat === 'Reporté à demain' || t.champ || t.manuel || t.echeance ? `<button type="button" class="lien-discret ja-annuler" onclick="annulerTraiteJour('${escapeOnclickArg(t.cle)}')">Annuler</button>` : ''}
        ${t.courrier ? `<button type="button" class="lien-discret ja-annuler" onclick="ouvrirCourrierAppelFonds('${escapeOnclickArg(t.dossierId)}')">Voir le courrier</button>` : ''}
      </li>`).join('');
  }

  // Les rappels notés à la main (« Mes rappels ») dans la liste « À faire » de la fenêtre du jour
  // (étude, 01/10 : « les rappels mis à la main se remettent le jour suivant tant que ce n'est pas
  // fait ») : un rappel non coché revient chaque jour à partir de son échéance — de sa création s'il
  // n'en a pas — et le dit (« Non fait hier »). Ceux cochés aujourd'hui restent, barrés. Pure.
  function dateRappelJour(r) {
    if (r && /^\d{4}-\d{2}-\d{2}$/.test(String(r.echeance || ''))) return r.echeance;
    const cree = r && r.creeLe ? new Date(r.creeLe) : null;
    if (!cree || isNaN(cree)) return '';
    return `${cree.getFullYear()}-${String(cree.getMonth() + 1).padStart(2, '0')}-${String(cree.getDate()).padStart(2, '0')}`;
  }
  function rappelsDuJour(rappels, aujourdhuiIso) {
    const l = Array.isArray(rappels) ? rappels : [];
    const aFaire = rappelsAffiches(l.filter(r => !r.fait && (dateRappelJour(r) || aujourdhuiIso) <= aujourdhuiIso), aujourdhuiIso);
    const faits = l.filter(r => r.fait && String(r.faitLe || '').slice(0, 10) === aujourdhuiIso);
    // À venir : échéance datée après aujourd'hui (étude, 05/10 : « mes rappels dans la même liste que les tâches du jour »).
    const aVenir = rappelsAffiches(l.filter(r => !r.fait && /^\d{4}-\d{2}-\d{2}$/.test(String(r.echeance || '')) && r.echeance > aujourdhuiIso), aujourdhuiIso);
    return { aFaire, faits, aVenir };
  }

  // `fixe` : sur la carte du tableau de bord, un rappel non coché n'est jamais masqué faute de place
  // (étude, 01/10 : « mes rappels en cours visibles tant qu'ils ne sont pas cochés »).
  // `partie` : 'aFaire' ou 'faits' pour n'en rendre qu'une (la carte met les cochés après les actions).
  function renderRappelsJour(aujourdhuiIso, fixe, partie) {
    const { aFaire, faits, aVenir } = rappelsDuJour(rappelsPerso, aujourdhuiIso);
    const dossierDe = r => r.dossierId ? dossiers.find(x => x.id === r.dossierId) : null;
    const lignes = (partie === 'avenir' ? aVenir : aFaire).map(r => {
      const d = dossierDe(r);
      const date = dateRappelJour(r);
      const retard = date && date < aujourdhuiIso ? libelleEcheanceRappel(date, aujourdhuiIso) : '';
      const quand = partie === 'avenir' ? libelleEcheanceRappel(r.echeance, aujourdhuiIso) : '';
      return renderLigneAction({
        categorie: 'neutre', categorieLabel: 'Rappel',
        titre: r.texte,
        titreHtml: retard ? `<span class="ja-non-faite">${escapeHtml(retard)}</span>` : '',
        sousHtml: [quand,d ? `<button type="button" class="lien-discret" onclick="executerFicheDossierJour('${escapeOnclickArg(d.id)}')">${escapeHtml(libelleDossierAffiche(d))}</button>` : '', r.agendaItemId ? 'Tâche de l’agenda' : 'Mon rappel'].filter(Boolean).join(' · '),
        caseRonde: { onclick: `basculerRappelPerso('${escapeOnclickArg(r.id)}')`, libelle: 'Fait' },
        bouton: rappelParleEmail(r.texte) ? { libelle: 'Email', icone: icone('mail'), onclick: `ouvrirEmailRappelPerso('${escapeOnclickArg(r.id)}')`, titre: "Préparer un email vierge avec la signature de l'office" } : null,
        classe: fixe ? 'ja-rappel w-fixe' : 'ja-rappel',
        // Sur la carte, le crayon ouvre la modification sous « Mes rappels » (même formulaire).
        secondaires: fixe && !r.agendaItemId ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="ouvrirEditionRappel('${escapeOnclickArg(r.id)}')" title="Modifier le rappel" aria-label="Modifier le rappel">${icone('pencil')}</wa-button>` : ''
      });
    }).join('');
    const coches = faits.map(r => {
      const d = dossierDe(r);
      const dt = new Date(r.faitLe);
      const heure = isNaN(dt) ? '' : `${String(dt.getHours()).padStart(2, '0')} h ${String(dt.getMinutes()).padStart(2, '0')}`;
      return `
      <li class="ja fait ja-rappel">
        <span class="ja-coche" aria-hidden="true">${icone('check')}</span>
        <span class="ja-texte-fait">
          <span class="ja-titre">${escapeHtml(r.texte)}</span>
          <span class="ja-sous">${[d ? libelleDossierAffiche(d) : '', r.agendaItemId ? (r.agendaSupprimeLe ? 'Retirée de l’agenda' : 'Tâche de l’agenda') : 'Mon rappel', heure].filter(Boolean).map(escapeHtml).join(' · ')}</span>
        </span>
        <button type="button" class="lien-discret ja-annuler" onclick="basculerRappelPerso('${escapeOnclickArg(r.id)}')">Annuler</button>
      </li>`;
    }).join('');
    return partie === 'aFaire' || partie === 'avenir' ? lignes : partie === 'faits' ? coches : lignes + coches;
  }

  function renderListeJour(actions, traites, global) {
    const rappels = utilisateurPoste ? renderRappelsJour(isoAujourdhuiLocal()) : '';
    if (!actions.length && !traites.length && !rappels) return '<p class="jour-vide jour-vide-ok">✓ Rien à faire aujourd’hui sur vos dossiers.</p>';
    return `<ul class="ja-liste ja-taches">${rappels}${renderActionsJour(actions, global, traites)}</ul>`;
  }

  function executerActionJourFiche(cle) {
    const a = trouverActionJour(cle);
    if (!a) return;
    fermerFenetreAujourdhui();
    ouvrirDossierDepuisDashboard(a.dossier.id);
  }

  function executerFicheDossierJour(id) {
    fermerFenetreAujourdhui();
    ouvrirDossierDepuisDashboard(id);
  }

  // Le nom du dossier dans une tâche : un lien vers sa fiche (étude 05/10 : « je clique souvent sur le nom du dossier dans la
  // tâche pour atteindre le dossier »). Il vit dans le texte de la ligne — un bouton qui déplie le détail ou le tiroir — : le
  // clic est donc pris à la capture (ci-dessous), avant que le bouton ne le reçoive ; le reste de la ligne garde son geste.
  function lienDossierTache(d, libelle) {
    return `<span class="ja-dossier-lien" data-ouvrir-dossier="${escapeAttr(d.id)}" title="Ouvrir la fiche du dossier">${escapeHtml(libelle || libelleDossierAffiche(d))}</span>`;
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', (e) => {
      const lien = e.target && e.target.closest && e.target.closest('[data-ouvrir-dossier]');
      if (!lien) return;
      e.preventDefault();
      e.stopPropagation();
      executerFicheDossierJour(lien.getAttribute('data-ouvrir-dossier'));
    }, true);
  }

  function renderNouveautesListe(groupes) {
    if (!groupes.length) return '<p class="jour-vide">Rien de nouveau sur vos dossiers.</p>';
    return `<ul class="jour-fil">${groupes.slice(0, 12).map(g => `
      <li class="jour-fil-groupe">
        <button type="button" class="jour-fil-dossier" onclick="executerFicheDossierJour('${g.dossier.id}')">${escapeHtml(libelleDossierAffiche(g.dossier))}</button>
        <ul>${g.lignes.slice(0, 4).map(l => `<li class="jour-fil-ligne ${l.type}">
          <span class="jour-fil-qui">${l.type === 'pieces' ? '<span class="jour-nouveau">Nouveau</span>' : escapeHtml(l.auteur ? prenomCollaborateur(l.auteur) : 'CLAIRE')}</span>
          <span>${escapeHtml(l.texte)}</span></li>`).join('')}
          ${g.lignes.length > 4 ? `<li class="jour-fil-ligne"><span class="jour-fil-qui"></span><span class="jour-meta">et ${g.lignes.length - 4} autre${g.lignes.length - 4 > 1 ? 's' : ''}</span></li>` : ''}
        </ul>
      </li>`).join('')}</ul>`;
  }

  // Célébration quand toutes les tâches DU JOUR (les actions, pas les rappels) sont faites — demandé
  // par l'étude. Jouée UNE SEULE FOIS par jour et par poste : render() se relance à chaque action,
  // rejouer l'animation à chaque fois serait pénible. Le repère est en localStorage (par poste), donc
  // elle ne rejoue pas non plus à un rechargement le même jour.
  var CLE_FETE_JOUR = 'claire-fete-jour:';
  function feteJourDejaCelebree(dateIso) {
    try { return localStorage.getItem(CLE_FETE_JOUR + (utilisateurPoste || 'poste')) === dateIso; }
    catch (e) { return false; }
  }
  function marquerFeteJourCelebree(dateIso) {
    try { localStorage.setItem(CLE_FETE_JOUR + (utilisateurPoste || 'poste'), dateIso); }
    catch (e) { /* pas bloquant */ }
  }
  function renderFeteJour(animer) {
    const confettis = Array.from({ length: 10 }, (_, i) => `<span class="jour-confetti jour-confetti-${i % 3}" style="--i:${i}"></span>`).join('');
    return `<div class="jour-fete${animer ? ' anime' : ''}" role="status">
      <div class="jour-confettis" aria-hidden="true">${confettis}</div>
      <span class="jour-fete-emoji" aria-hidden="true">🎉</span>
      <span class="jour-fete-texte">Journée bouclée, bravo !</span>
    </div>`;
  }

  // Carte « Aujourd'hui » du tableau de bord, selon la présentation du widget (presentationWidget) :
  //  - petit : le nombre de choses à faire, l'anneau de la journée et la première action ;
  //  - moyen : la liste « À faire » (même présentation que la fenêtre du matin, renderListeJour),
  //    puis « Mes rappels » pour remplir la tuile quand la journée est courte ;
  //  - grand : la même chose avec « À venir » (les 30 jours) en appoint et la saisie d'un rappel.
  // Les listes sont coupées à la hauteur de la tuile (ajusterWidgets), « Voir N de plus » ouvre la
  // page Aujourd'hui.
  function renderAlertesDashboard(perimetreActifs) {
    const bloc = document.getElementById('alertes-dashboard');
    if (!bloc) return;
    const global = vueGlobaleDashboard();
    const presentation = presentationWidget('aujourdhui');
    const { aujourdhui, actions, traites, aVenir } = etatAujourdhui();
    const fini = actions.length === 0 && traites.length > 0;
    const anneau = actions.length || traites.length ? renderAnneauJour(actions.length, traites.length) : '';
    // La page « Aujourd'hui » est retirée (étude, 30/09) : « voir plus » ouvre la fenêtre du jour.
    const versPage = "ouvrirFenetreAujourdhui()";
    let corps;
    if (presentation === 'petit') {
      const premiere = actions[0];
      const rappelsAFaire = rappelsPerso.filter(r => !r.fait).length;
      corps = `<div class="w-chiffre-bloc">
          <span class="w-chiffre">${actions.length}</span>
          <span class="w-chiffre-lib">${actions.length > 1 ? 'choses à faire' : actions.length ? 'chose à faire' : 'rien à faire'}</span>
        </div>
        ${premiere ? `<div class="w-bas" data-ajuster="2"><button type="button" class="w-prochaine g-${premiere.gravite}" onclick="${versPage}">
            <span class="w-prochaine-titre">${escapeHtml(premiere.titre)}</span>
            <span class="w-prochaine-sous">${escapeHtml(libelleDossierAffiche(premiere.dossier))}</span>
          </button></div>` : `<p class="w-message">${escapeHtml(messageProgressionJour(actions.length, traites.length))}</p>`}
        ${rappelsAFaire ? `<button type="button" class="w-pied lien-discret" onclick="${versPage}">${rappelsAFaire} rappel${rappelsAFaire > 1 ? 's' : ''} à faire</button>` : ''}`;
    } else {
      let feteHtml = '';
      if (fini) {
        const animer = !feteJourDejaCelebree(aujourdhui);
        if (animer) marquerFeteJourCelebree(aujourdhui);
        feteHtml = renderFeteJour(animer);
      }
      // Rappels non cochés (échus ou du jour) en tête de « À faire », jamais masqués (w-fixe).
      const rappelsJour = utilisateurPoste ? renderRappelsJour(aujourdhui, true, 'aFaire') : '';
      const rappelsCoches = utilisateurPoste ? renderRappelsJour(aujourdhui, true, 'faits') : '';
      // Mes rappels à venir (échéance datée plus tard) : dans la même liste, après les tâches du jour, avec leur date.
      const rappelsAVenir = utilisateurPoste ? renderRappelsJour(aujourdhui, true, 'avenir') : '';
      const liste = actions.length || traites.length || rappelsJour || rappelsCoches || rappelsAVenir
        ? `<ul class="ja-liste ja-taches" data-ajuster="1" data-min="1">${rappelsJour}${renderActionsJour(actions, global, traites, true)}${rappelsAVenir}${rappelsCoches}${renderLignesTraitees(grouperActionsParDossier(actions, traites).traites)}${plusWidget(versPage)}</ul>`
        : '<p class="jour-vide jour-vide-ok">✓ Rien à faire aujourd’hui sur vos dossiers.</p>';
      // Un rappel en cours de saisie (ajout ou modification) passe avant tout (étude, 01/10 : « quand je
      // clique sur Ajouter un rappel, il m'ouvre À venir ») : la carte pleine masquait toute la section
      // « Mes rappels », formulaire compris, et « À venir » prenait sa place. Le formulaire ouvert est
      // rempli en premier (data-ajuster 0, jamais masqué), « À venir » se retire le temps de la saisie.
      const saisieRappel = !!(ajoutRappelOuvert || rappelEnEdition);
      const aVenirHtml = presentation === 'grand' && aVenir.length && !saisieRappel ? `<div class="w-section">
          <h3 class="jour-carte-sous-titre">À venir</h3>
          <ul class="w-lignes" data-ajuster="3">${aVenir.map(v => `<li><button type="button" class="w-ligne" onclick="ouvrirDossierDepuisDashboard('${v.dossier.id}')">
            <span class="w-ligne-texte"><b>${escapeHtml(v.titre)}</b> · ${escapeHtml(libelleDossierAffiche(v.dossier))}</span>
            <span class="w-ligne-meta">${escapeHtml(v.detail || '')}</span></button></li>`).join('')}${plusWidget(versPage)}</ul>
        </div>` : '';
      corps = `${feteHtml}${liste}
        <div class="w-section dash-rappels-bloc">
          <div class="rappels-perso" data-ajuster="0" data-garder>${renderMesRappels(perimetreActifs, true)}</div>
        </div>
        ${aVenirHtml}`;
    }
    bloc.innerHTML = carteWidget({
      presentation,
      titre: 'Aujourd’hui',
      sous: presentation === 'petit' ? '' : escapeHtml(messageProgressionJour(actions.length, traites.length)),
      droite: `${presentation !== 'petit' ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide w-point-matin" onclick="ouvrirFenetreAujourdhui()" title="Rouvrir la fenêtre du point du matin">${icone('sun')}<span>Point du matin</span></wa-button>` : ''}${anneau}`,
      corps
    });
    renderFenetreAujourdhui();
    planifierAjustementWidgets();
  }

  // ---- Fenêtre du matin ----
  // S'ouvre à la première connexion de la journée de ce collaborateur sur ce poste, et se rouvre
  // depuis la carte « Aujourd'hui » du tableau de bord (icône soleil, « voir plus »).
  let fenetreAujourdhuiOuverte = false;

  function ouvrirFenetreAujourdhui() {
    fenetreAujourdhuiOuverte = true;
    renderFenetreAujourdhui();
    // wa-button : le focus attend son premier rendu (sinon la partie interne n'existe pas encore).
    const b = document.getElementById('jour-fenetre-fermer');
    if (b && b.updateComplete) b.updateComplete.then(() => b.focus({ preventScroll: true })).catch(() => {});
  }

  function fermerFenetreAujourdhui() {
    if (!fenetreAujourdhuiOuverte) return;
    fenetreAujourdhuiOuverte = false;
    renderFenetreAujourdhui();
  }

  function ouvrirFenetreAujourdhuiSiPremiereFois() {
    if (!utilisateurPoste) return;
    const cle = PREFIXE_FENETRE_VUE + utilisateurPoste;
    const aujourdhui = isoAujourdhuiLocal();
    let vue = '';
    try { vue = localStorage.getItem(cle) || ''; } catch (e) { vue = aujourdhui; }
    if (vue === aujourdhui) return;
    try { localStorage.setItem(cle, aujourdhui); } catch (e) { /* pas bloquant */ }
    ouvrirFenetreAujourdhui();
  }

  // ---- Emails du matin (voir server/src/emailsMatin.js) ----
  // Le serveur lit à 8 h 50 la boîte de réception du compte Exchange de l'office (celle de Bastien,
  // qui reçoit tout en double) et range les emails reçus depuis la veille 18 h par dossier.
  // Réservé à Bastien (demandé le 29/09 : « que pour moi, pas pour Julie et Jérémy ») : c'est sa
  // boîte ; il voit tous les dossiers, et les emails qu'aucun dossier ne reconnaît. Sur les autres
  // postes, rien n'est chargé ni affiché.
  var DESTINATAIRES_EMAILS_MATIN = ['Bastien ANGLUMENT'];
  function recoitEmailsMatin(nom) { return DESTINATAIRES_EMAILS_MATIN.indexOf(nom) !== -1; }
  var PREFIXE_EMAILS_VUS = 'claire-emails-matin-vus:';
  let resumeEmails = null;

  // Pure : ce que ce poste montre du résumé.
  function emailsMatinPourPoste(resume, idsPerimetre, administrateur) {
    if (!resume || !resume.date) return { groupes: [], autres: [], nb: 0 };
    const ids = new Set(idsPerimetre || []);
    const groupes = (resume.dossiers || []).filter(g => ids.has(g.dossierId));
    const autres = administrateur ? (resume.autres || []) : [];
    return { groupes, autres, nb: groupes.reduce((t, g) => t + g.emails.length, 0) + autres.length };
  }

  async function chargerResumeEmails() {
    if (!recoitEmailsMatin(utilisateurPoste)) { resumeEmails = null; return; }
    try {
      const reponse = await fetchAvecAuth('/api/emails-matin');
      if (!reponse.ok) return;
      resumeEmails = await reponse.json();
    } catch (e) { return; }
    const aujourdhui = isoAujourdhuiLocal();
    suivreResumeIa();
    if (fenetreAujourdhuiOuverte) renderFenetreAujourdhui();
    // Le résumé du jour vient d'arriver (8 h 50) : la fenêtre du matin s'ouvre une fois pour le
    // montrer, même si elle avait déjà été vue plus tôt dans la matinée.
    if (!utilisateurPoste || !resumeEmails || resumeEmails.date !== aujourdhui || resumeEmails.erreur) return;
    const vus = PREFIXE_EMAILS_VUS + utilisateurPoste;
    let deja = '';
    try { deja = localStorage.getItem(vus) || ''; } catch (e) { deja = aujourdhui; }
    if (deja === aujourdhui) return;
    const { nb } = emailsMatinPourPoste(resumeEmails, dossiers.map(d => d.id), true);
    if (!nb) return;
    try { localStorage.setItem(vus, aujourdhui); } catch (e) { /* pas bloquant */ }
    if (!fenetreAujourdhuiOuverte) ouvrirFenetreAujourdhui();
  }

  async function actualiserResumeEmails(bouton) {
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Lecture de la boîte…'; }
    try {
      const reponse = await fetchAvecAuth('/api/emails-matin/actualiser', { method: 'POST' });
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) afficherToast(corps.erreur || 'Lecture de la boîte impossible.', 'OK', null);
      else { resumeEmails = corps; suivreResumeIa(); }
    } catch (e) {
      afficherToast('Serveur injoignable.', 'OK', null);
    }
    if (fenetreAujourdhuiOuverte) renderFenetreAujourdhui();
  }

  // Résumé rédigé par le modèle local d'Ollama sur le serveur (voir emailsMatin.js) : en cours, en
  // erreur (le résumé sans IA reste dessous), ou le texte et ses points importants.
  // Tant que l'IA rédige, le résumé est relu toutes les 20 s (une à deux minutes sur le CPU du serveur).
  let minuteurResumeIa = null;
  function suivreResumeIa() {
    if (minuteurResumeIa || !resumeEmails || !resumeEmails.ia || !resumeEmails.ia.enCours) return;
    minuteurResumeIa = setTimeout(() => { minuteurResumeIa = null; chargerResumeEmails(); }, 20000);
  }

  function renderLigneEmailMatin(e) {
    return `<li class="jour-fil-ligne email-matin">
      <span class="jour-fil-qui">${escapeHtml(e.heure || '')}</span>
      <span class="email-matin-texte"><b>${escapeHtml(e.de)}</b> — ${escapeHtml(e.sujet)}${e.pj ? ` <span class="email-matin-pj" title="Pièce jointe">${icone('file-text')}</span>` : ''}
        ${(e.sujets || []).map(t => `<span class="email-matin-sujet">${escapeHtml(t)}</span>`).join('')}</span>
    </li>`;
  }

  function pluriel(n, mot, motPluriel) { return `${n} ${n > 1 ? (motPluriel || mot + 's') : mot}`; }

  // ---- Agenda du jour (étude, 30/09 : « insérer tous les rendez-vous de l'agenda du jour ») ----
  // Les rendez-vous du calendrier de l'office lus par le serveur à chaque tour (toutes les 2 min),
  // tels qu'ils figurent dans l'agenda : heure de début en gras et de fin dessous, un liseré de
  // couleur, une étiquette au-dessus du titre. Pures : la liste du jour (null si l'agenda lu n'est
  // pas celui d'aujourd'hui), la teinte et l'étiquette d'un événement.
  function evenementsAgendaDuJour(agenda, aujourdhuiIso) {
    if (!agenda || agenda.jour !== aujourdhuiIso || !Array.isArray(agenda.evenements)) return null;
    return agenda.evenements;
  }

  // Couleur d'un rendez-vous = celle qu'Outlook lui donne (étude, 30/09 : « reprends le code couleur
  // des rendez-vous ») : la couleur nommée dans sa catégorie (« Catégorie Verte », « Rouge »…), sinon
  // celle du type réglé pour les signatures (office vert, visio violet, confrère orange), sinon
  // absence (gris), signature sans catégorie (bleu des actes), autre (bleu du calendrier).
  var COULEURS_CATEGORIE_OUTLOOK = [
    { cle: 'rouge', re: /\b(rouge|red)\b/ },
    { cle: 'orange', re: /\borange\b/ },
    { cle: 'jaune', re: /\b(jaune|yellow)\b/ },
    { cle: 'vert', re: /\b(verte?|green)\b/ },
    { cle: 'bleu', re: /\b(bleue?|blue)\b/ },
    { cle: 'violet', re: /\b(violette?|pourpre|mauve|purple)\b/ },
    { cle: 'gris', re: /\b(grise?|gray|grey|noire?|black)\b/ },
    { cle: 'rose', re: /\b(rose|pink)\b/ },
    { cle: 'marron', re: /\b(marron|brune?|brown)\b/ }
  ];
  function couleurCategorieOutlook(nom) {
    const n = normaliserNomCategorie(nom);
    const c = COULEURS_CATEGORIE_OUTLOOK.find(x => x.re.test(n));
    return c ? c.cle : '';
  }

  // Type de signature (office / visio / confrère) d'après la catégorie réglée ; '' sinon.
  function typeEvenementAgenda(e, categoriesRdv) {
    const cats = ((e && e.categories) || []).map(normaliserNomCategorie);
    const noms = categoriesRdv || {};
    // « Annulé / à replacer » l'emporte sur le lieu : un rendez-vous vert passé en jaune est annulé.
    return ['annule'].concat(Object.keys(TYPES_RDV)).find(cle => noms[cle] && cats.indexOf(normaliserNomCategorie(noms[cle])) !== -1) || '';
  }

  // Pure : date butoir posée dans l'agenda (« Obtention du prêt — … », « Vente préalable — … », ou un
  // titre qui le dit) — en rose avec les absences (étude, 01/10 : les distinguer des rendez-vous).
  function estDateButoirAgenda(e) {
    const t = String((e && e.sujet) || '');
    return /^(obtention du pr[êe]t|vente pr[ée]alable)\s+[—–-]\s/i.test(t) || /date\s+butoir/i.test(t);
  }

  // Pure : les catégories à écrire quand on change celle d'un rendez-vous — celles qu'il portait,
  // sans aucune des catégories réglées (lieu, annulé), plus la nouvelle. Les autres (posées à la main
  // dans Outlook) restent.
  function categoriesApresChangement(categories, categoriesRdv, nouvelleCle) {
    const noms = categoriesRdv || {};
    const reglees = Object.keys(CATEGORIES_AGENDA).map(cle => normaliserNomCategorie(noms[cle])).filter(Boolean);
    const gardees = (categories || []).filter(c => reglees.indexOf(normaliserNomCategorie(c)) === -1);
    const nouvelle = nouvelleCle && noms[nouvelleCle] ? [noms[nouvelleCle]] : [];
    return nouvelle.concat(gardees).slice(0, 5);
  }

  function teinteEvenementAgenda(e, categoriesRdv) {
    if (!e) return 'autre';
    // Absences et dates butoir avant la couleur Outlook : ce ne sont pas des rendez-vous (rose).
    if (e.absence) return 'absence';
    if (estDateButoirAgenda(e)) return 'butoir';
    for (const c of e.categories || []) {
      const couleur = couleurCategorieOutlook(c);
      if (couleur) return couleur;
    }
    const type = typeEvenementAgenda(e, categoriesRdv);
    if (type) return type;
    if (e.absence) return 'absence';
    return e.signature ? 'signature' : 'autre';
  }

  // Ce qui est écrit au-dessus du titre : le type de signature, l'absence, sinon la catégorie.
  function natureEvenementAgenda(e, categoriesRdv) {
    return typeEvenementAgenda(e, categoriesRdv) || (e && e.absence ? 'absence' : teinteEvenementAgenda(e, categoriesRdv));
  }

  function etiquetteEvenementAgenda(e, teinte) {
    if (teinte === 'absence') return 'Absence';
    if (teinte === 'butoir' || estDateButoirAgenda(e)) return 'Date butoir';
    if (CATEGORIES_AGENDA[teinte]) return e.signature ? `Signature · ${CATEGORIES_AGENDA[teinte].court}` : CATEGORIES_AGENDA[teinte].libelle;
    if (e.signature) return 'Signature';
    if ((e.categories || []).length) return e.categories[0];
    return e.journeeEntiere ? 'Journée entière' : 'Rendez-vous';
  }

  // Passé, en cours ou à venir, à l'heure « HH:MM » donnée (journée entière : jamais passée).
  function momentEvenementAgenda(e, heureActuelle) {
    if (!e || e.journeeEntiere || !e.heure) return 'journee';
    const fin = e.heureFin || e.heure;
    if (fin <= heureActuelle && fin !== e.heure) return 'passe';
    if (e.heure <= heureActuelle && heureActuelle < fin) return 'en-cours';
    return e.heure < heureActuelle ? 'passe' : 'a-venir';
  }

  // La journée défile avec l'heure (étude 05/10 : « fais défiler la journée au fur et à mesure que le temps passe ») : chaque
  // minute, les rendez-vous du jour d'une liste qui défile (widget Agenda, data-defiler) changent d'état sur place — passé,
  // en cours, à venir, sans redessiner le tableau de bord — et la liste glisse jusqu'au rendez-vous en cours ou au prochain.
  // Jamais pendant que la souris est sur la liste, ni dans les 2 minutes qui suivent un défilement à la main.
  var DELAI_REPRISE_DEFILEMENT_MS = 2 * 60 * 1000;
  function suivreHeureAgendaJour(maintenant) {
    if (typeof document === 'undefined') return;
    const m = maintenant || new Date();
    const heure = String(m.getHours()).padStart(2, '0') + ':' + String(m.getMinutes()).padStart(2, '0');
    document.querySelectorAll('ol.ajd-liste[data-defiler]').forEach(liste => {
      liste.querySelectorAll('li.ajd-evt[data-heure]').forEach(li => {
        const moment = momentEvenementAgenda({ heure: li.dataset.heure, heureFin: li.dataset.heureFin }, heure);
        ['passe', 'en-cours', 'a-venir'].forEach(k => li.classList.toggle('ajd-' + k, k === moment));
        const etiquette = li.querySelector('.ajd-etiquette');
        const marque = etiquette && etiquette.querySelector('.ajd-maintenant');
        if (etiquette && moment === 'en-cours' && !marque) etiquette.insertAdjacentHTML('beforeend', ' <span class="ajd-maintenant">en cours</span>');
        if (marque && moment !== 'en-cours') marque.remove();
      });
      if (liste.matches(':hover') || Date.now() - Number(liste.dataset.defileMain || 0) < DELAI_REPRISE_DEFILEMENT_MS) return;
      if (!liste.dataset.ecouteDefilement) {
        liste.dataset.ecouteDefilement = '1';
        ['wheel', 'touchmove', 'keydown'].forEach(ev => liste.addEventListener(ev, () => { liste.dataset.defileMain = String(Date.now()); }, { passive: true }));
      }
      const cible = liste.querySelector('.ajd-en-cours, .ajd-a-venir');
      const premier = liste.firstElementChild;
      if (!premier || liste.scrollHeight <= liste.clientHeight) return;
      const haut = cible ? cible.offsetTop - premier.offsetTop : liste.scrollHeight;
      if (Math.abs(liste.scrollTop - haut) > 2) liste.scrollTo({ top: haut, behavior: 'smooth' });
    });
  }
  if (typeof window !== 'undefined' && typeof setInterval === 'function' && typeof document !== 'undefined' && document.querySelectorAll) {
    setInterval(() => { try { suivreHeureAgendaJour(); } catch (e) { /* écran sans widget Agenda */ } }, 60 * 1000);
  }

  function renderAgendaDuJour() {
    const liste = evenementsAgendaDuJour(agendaDuJourOffice, isoAujourdhuiLocal());
    if (!liste) return '<p class="jour-vide">L’agenda de l’office n’a pas encore été lu aujourd’hui.</p>';
    if (!liste.length) return '<p class="jour-vide">Aucun rendez-vous aujourd’hui.</p>';
    return `<ol class="ajd-liste">${lignesEvenementsAgendaJour(liste, true, false)}</ol>`;
  }

  // Les rendez-vous d'une journée en lignes « ajd » (heure, liseré de la couleur Outlook, étiquette,
  // titre) — fenêtre du matin et widget Agenda. `estAujourdhui` : passé / en cours selon l'heure ;
  // `versAgenda` : le titre ouvre le rendez-vous dans la page Agenda (le nom du dossier, sa fiche).
  function lignesEvenementsAgendaJour(liste, estAujourdhui, versAgenda) {
    const maintenant = new Date();
    const heureActuelle = estAujourdhui ? String(maintenant.getHours()).padStart(2, '0') + ':' + String(maintenant.getMinutes()).padStart(2, '0') : '';
    const categories = categoriesRdvReglees();
    return liste.map(e => {
      const teinte = teinteEvenementAgenda(e, categories);
      const moment = estAujourdhui ? momentEvenementAgenda(e, heureActuelle) : (e.journeeEntiere || !e.heure ? 'journee' : 'a-venir');
      const heures = e.journeeEntiere || !e.heure
        ? '<b>Journée</b>'
        : `<b>${escapeHtml(e.heure)}</b>${e.heureFin && e.heureFin !== e.heure ? `<span>${escapeHtml(e.heureFin)}</span>` : ''}${dureeRendezVous(e.heure, e.heureFin) ? `<span class="ajd-duree">${escapeHtml(dureeRendezVous(e.heure, e.heureFin))}</span>` : ''}`;
      const connu = e.dossierId && dossiers.some(d => d.id === e.dossierId);
      // Dossier reconnu : le titre ouvre sa fiche ; son nom n'est ajouté dessous que si le titre de
      // l'agenda ne le cite pas déjà (« VTE - DUPONT » n'est pas répété).
      const ouvrir = connu ? `executerFicheDossierJour('${escapeOnclickArg(e.dossierId)}')` : '';
      const ouvrirAgenda = versAgenda ? `ouvrirEvenementDepuisWidgetAgenda('${escapeOnclickArg(cleEvenementAgenda(e))}', '${e.date}')` : '';
      const dejaCite = connu && normaliserPourRecherche(e.sujet || '').indexOf(normaliserPourRecherche(e.dossierNom || '')) !== -1;
      const sous = [
        e.lieu ? `<span>${escapeHtml(e.lieu)}</span>` : '',
        connu && (!dejaCite || versAgenda) ? `<button type="button" class="ajd-dossier" onclick="${ouvrir}" title="Ouvrir la fiche du dossier">${versAgenda ? 'Fiche' : escapeHtml(libelleDossierParNom(e.dossierNom, e.dossierId))}</button>` : ''
      ].filter(Boolean).join('<span aria-hidden="true"> · </span>');
      const titre = escapeHtml(e.sujet || '(sans titre)');
      return `<li class="ajd-evt ajd-${teinte} ajd-${moment}${e.horsAgenda ? ' ajd-hors-agenda' : ''}"${estAujourdhui && e.heure && !e.journeeEntiere ? ` data-heure="${escapeAttr(e.heure)}" data-heure-fin="${escapeAttr(e.heureFin || '')}"` : ''}>
          <span class="ajd-heure">${heures}</span>
          <span class="ajd-barre" aria-hidden="true"></span>
          <span class="ajd-texte">
            <span class="ajd-etiquette">${escapeHtml(etiquetteEvenementAgenda(e, natureEvenementAgenda(e, categories)))}${moment === 'en-cours' ? ' <span class="ajd-maintenant">en cours</span>' : ''}</span>
            ${ouvrirAgenda ? `<button type="button" class="ajd-titre ajd-titre-lien" onclick="${ouvrirAgenda}" title="Voir le rendez-vous dans l’agenda">${titre}</button>`
              : connu ? `<button type="button" class="ajd-titre ajd-titre-lien" onclick="${ouvrir}" title="Ouvrir la fiche du dossier">${titre}</button>` : `<span class="ajd-titre">${titre}</span>`}
            ${sous ? `<span class="ajd-sous">${sous}</span>` : ''}
          </span>
        </li>`;
    }).join('');
  }

  // Colonne de droite de la fenêtre du matin en onglets (étude, 30/09 : « la pop-up prend trop de
  // place, revoir la disposition ») : Agenda du jour, Emails (Bastien), Nouveautés — un seul visible,
  // la fenêtre garde une hauteur raisonnable et chaque colonne défile seule.
  // Étude 02/10 : « revoir la partie de droite : ce qui s'est passé depuis hier 18 h — nouveaux documents
  // reçus et cochés, listés ; le nombre d'emails reçus ; la liste des demandes par email (IA locale), sans
  // les SPF, publicités, CRIDON, INFN, INAFON… ». Deux onglets : « Depuis hier 18 h » (d'abord) et
  // « Agenda du jour ».
  var ONGLETS_FENETRE_JOUR = ['depuis', 'agenda'];
  let ongletFenetreJour = 'depuis';

  // Pure : 18 h (heure du poste) le jour ouvré précédent — le vendredi pour un lundi, comme le serveur
  // (emailsMatin.debutFenetreEmails).
  function debutDepuisHier18h(maintenant) {
    const d = new Date(maintenant || Date.now());
    d.setHours(12, 0, 0, 0);
    do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
    d.setHours(18, 0, 0, 0);
    return d.toISOString();
  }
  function libelleDepuisHier18h(debutIso, maintenant) {
    const d = new Date(debutIso), n = new Date(maintenant || Date.now());
    const hier = new Date(n); hier.setDate(n.getDate() - 1);
    const jour = d.toDateString() === hier.toDateString() ? 'hier' : d.toLocaleDateString('fr-FR', { weekday: 'long' });
    return `Depuis ${jour} 18 h`;
  }

  // Pure : documents reçus et cochés depuis `debutIso` (pièce trouvée sur le NAS, rangée depuis un email
  // ou Claire Scan, reçue dans Authentic — d.piecesTrouveesLe), les plus récents d'abord.
  function documentsDepuis(dossiersPerimetre, debutIso) {
    return piecesDepuisVisite(dossiersPerimetre, debutIso)
      .filter(x => x.cle === CLE_NOTIF_OFFRE_PRET || (x.dossier.pieces || {})[x.cle] === 'recue')
      .map(x => ({ dossier: x.dossier, cle: x.cle, le: x.le, libelle: libelleNotificationPiece(x.dossier, x.cle) }))
      .sort((a, b) => String(b.le).localeCompare(String(a.le)));
  }

  // Pure : « 9 écartés : SPF 5, CRIDON 2, publicités 2 ».
  function libelleEmailsExclus(exclus) {
    if (!exclus || !exclus.total) return '';
    const noms = { 'Publicité': 'publicités', 'Écarté (Réglages)': 'écartés dans les Réglages' };
    const detail = Object.entries(exclus.parMotif || {}).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${noms[m] || m} ${n}`).join(', ');
    return `${exclus.total} écarté${exclus.total > 1 ? 's' : ''}${detail ? ' : ' + detail : ''}`;
  }

  function renderDepuisHier18h(perimetre) {
    const debut = debutDepuisHier18h();
    const docs = documentsDepuis(perimetre, debut);
    const lienDossier = (d) => `<button type="button" class="jour-fil-dossier" onclick="executerFicheDossierJour('${escapeOnclickArg(d.id)}')">${escapeHtml(libelleDossierAffiche(d))}</button>`;
    const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
    const blocDocs = `<section class="depuis-bloc">
        <h4 class="depuis-titre">Documents reçus <span class="jour-onglet-nb">${docs.length}</span></h4>
        ${docs.length ? `<ul class="depuis-liste">${docs.map(x => `<li>
            <span class="dot-label dl-success"><span class="dot"></span></span>
            <span class="depuis-texte"><b>${escapeHtml(x.libelle)}</b> · ${lienDossier(x.dossier)}</span>
            <span class="depuis-heure">${escapeHtml(heure(x.le))}</span></li>`).join('')}</ul>`
          : '<p class="jour-vide">Aucun document reçu.</p>'}
      </section>`;
    let blocEmails = '';
    if (recoitEmailsMatin(utilisateurPoste)) {
      const r = resumeEmails;
      const actualiser = '<button type="button" class="lien-action" onclick="actualiserResumeEmails(this)">Actualiser</button>';
      let corps;
      if (!r || r.date !== isoAujourdhuiLocal()) {
        const avant = new Date().getHours() * 60 + new Date().getMinutes() < 7 * 60 + 30;
        corps = `<p class="jour-vide">${avant ? 'Boîte de réception lue à partir de 7 h 30.' : 'Boîte de réception pas encore lue.'} ${avant ? '' : actualiser}</p>`;
      } else if (r.erreur) {
        corps = `<p class="jour-vide"><span class="dot-label dl-alerte">${escapeHtml(r.erreur)}</span> ${actualiser}</p>`;
      } else {
        const retenus = (r.total || 0) - ((r.exclus && r.exclus.total) || 0);
        const lu = r.genereLe ? heure(r.genereLe) : '';
        const ia = r.ia;
        const demandes = ia && ia.points && ia.points.length ? `<ul class="depuis-liste depuis-demandes">${ia.points.map(pt => {
            const connu = pt.dossierId && dossiers.some(d => d.id === pt.dossierId);
            return `<li>
              <span class="dot-label ${pt.priorite === 'haute' ? 'dl-urgent' : 'dl-neutre'}" title="${pt.priorite === 'haute' ? 'Urgent' : ''}"><span class="dot"></span></span>
              <span class="depuis-texte">${escapeHtml(pt.texte)}<span class="depuis-meta">${escapeHtml(pt.de || '')}${connu ? ` · ${lienDossier({ id: pt.dossierId, nom: pt.dossierNom, typeAffaire: (dossiers.find(d => d.id === pt.dossierId) || {}).typeAffaire })}` : ''}</span></span>
              <span class="depuis-heure">${escapeHtml(pt.heure || '')}</span></li>`;
          }).join('')}</ul>`
          : ia && ia.enCours ? `<p class="em-ia em-ia-attente">${icone('spinner')} Liste des demandes en cours de rédaction par l’IA locale…</p>`
          : ia && ia.erreur ? `<p class="jour-source">${escapeHtml(ia.erreur)}</p>`
          : retenus ? '<p class="jour-vide">Aucune demande relevée.</p>' : '';
        const { groupes, autres, nb } = emailsMatinPourPoste(r, dossiers.map(d => d.id), true);
        corps = `<p class="depuis-chiffres"><b>${r.total || 0} email${(r.total || 0) > 1 ? 's' : ''} reçu${(r.total || 0) > 1 ? 's' : ''}</b>${r.exclus && r.exclus.total ? ` · <span title="Ni lus par l’IA ni listés">${escapeHtml(libelleEmailsExclus(r.exclus))}</span>` : ''}${lu ? ` · lue à ${escapeHtml(lu)}` : ''} ${actualiser}</p>
          ${demandes ? `<div class="depuis-sous-titre">${icone('sparkle')} Demandes ${infoBulle(`Une ligne par demande, rédigée sur le serveur de l’office par l’IA locale${ia && ia.modele ? ' (' + ia.modele + ')' : ''} à partir de l’expéditeur, de l’objet et du début de chaque email — rien ne sort du bureau. Les emails des SPF, CRIDON, INFN, INAFON et les publicités sont écartés (Réglages › Agenda et Outlook pour en ajouter). À vérifier : l’IA peut se tromper.`)}</div>${demandes}` : ''}
          ${nb ? `<details class="echanges-autres em-detail"><summary>Voir les ${nb} emails</summary>
            <ul class="jour-fil">${groupes.map(g => `
              <li class="jour-fil-groupe">
                <button type="button" class="jour-fil-dossier" onclick="executerFicheDossierJour('${escapeOnclickArg(g.dossierId)}')">${escapeHtml(libelleDossierParNom(g.dossierNom, g.dossierId))}</button>
                <ul>${g.emails.map(renderLigneEmailMatin).join('')}</ul>
              </li>`).join('')}${autres.length ? `<li class="jour-fil-groupe"><span class="em-hors">Hors dossiers</span><ul>${autres.map(renderLigneEmailMatin).join('')}</ul></li>` : ''}</ul>
          </details>` : ''}`;
      }
      blocEmails = `<section class="depuis-bloc"><h4 class="depuis-titre">Emails</h4>${corps}</section>`;
    }
    // Le reste de ce qui s'est passé (gestes des collègues, rendez-vous, Authentic…), replié.
    const autresEvts = evenementsDepuisVisite(perimetre, debut, utilisateurPoste)
      .map(g => ({ ...g, lignes: g.lignes.filter(l => l.type !== 'pieces') })).filter(g => g.lignes.length);
    const blocAutres = autresEvts.length ? `<details class="echanges-autres depuis-autres"><summary>Autres nouveautés sur les dossiers (${autresEvts.length})</summary>${renderNouveautesListe(autresEvts)}</details>` : '';
    return `${blocDocs}${blocEmails}${blocAutres}`;
  }
  function choisirOngletFenetreJour(cle) {
    if (ONGLETS_FENETRE_JOUR.indexOf(cle) === -1) return;
    ongletFenetreJour = cle;
    renderFenetreAujourdhui();
  }

  function renderFenetreAujourdhui() {
    const overlay = document.getElementById('aujourdhui-overlay');
    if (!overlay) return;
    if (!fenetreAujourdhuiOuverte) { overlay.style.display = 'none'; return; }
    const perimetre = dossiersPerimetreJour();
    const global = vueGlobaleDashboard();
    const { actions, traites } = etatAujourdhui();
    const nbAgenda = (evenementsAgendaDuJour(agendaDuJourOffice, isoAujourdhuiLocal()) || []).length;
    const nbDocs = documentsDepuis(perimetre, debutDepuisHier18h()).length;
    const nbDemandes = recoitEmailsMatin(utilisateurPoste) && resumeEmails && resumeEmails.date === isoAujourdhuiLocal() && resumeEmails.ia && resumeEmails.ia.points
      ? resumeEmails.ia.points.length : 0;
    const onglets = [
      { cle: 'depuis', libelle: libelleDepuisHier18h(debutDepuisHier18h()), nb: nbDocs + nbDemandes },
      { cle: 'agenda', libelle: 'Agenda du jour', nb: nbAgenda }
    ];
    if (!onglets.some(o => o.cle === ongletFenetreJour)) ongletFenetreJour = 'depuis';
    const panneau = ongletFenetreJour === 'depuis' ? renderDepuisHier18h(perimetre) : renderAgendaDuJour();
    const maintenant = new Date();
    const contenu = document.getElementById('aujourdhui-fenetre-contenu');
    const defilement = contenu.querySelector('.jour-panneau');
    const hautPanneau = defilement ? defilement.scrollTop : 0;
    contenu.innerHTML = `
      <header class="jour-fenetre-tete">
        <div>
          <div class="dash-eyebrow">${escapeHtml(libelleDateDuJour())} · ${escapeHtml(maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h '))}</div>
          <h2 class="jour-fenetre-titre" id="jour-fenetre-titre">Bonjour ${escapeHtml(prenomCollaborateur(utilisateurPoste) || '')}</h2>
        </div>
        ${renderProgressionJour(actions.length, traites.length)}
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn jour-fenetre-x" id="jour-fenetre-fermer" onclick="fermerFenetreAujourdhui()" aria-label="Fermer">${icone('x')}</wa-button>
      </header>
      <div class="jour-fenetre-corps">
        <div class="jour-col-faire">
          <h3 class="jour-section-titre">À faire <span class="jour-onglet-nb">${actions.length + rappelsDuJour(rappelsPerso, isoAujourdhuiLocal()).aFaire.length}</span></h3>
          ${renderListeJour(actions, traites, global)}
        </div>
        <div class="jour-fenetre-rail">
          <div class="jour-onglets" role="tablist" aria-label="Le point du jour">
            ${onglets.map(o => `<button type="button" role="tab" class="jour-onglet${o.cle === ongletFenetreJour ? ' actif' : ''}" aria-selected="${o.cle === ongletFenetreJour}"
              onclick="choisirOngletFenetreJour('${o.cle}')">${escapeHtml(o.libelle)}${o.nb ? ` <span class="jour-onglet-nb">${o.nb}</span>` : ''}</button>`).join('')}
          </div>
          <div class="jour-panneau" role="tabpanel">${panneau}</div>
        </div>
      </div>
      <footer class="jour-fenetre-pied">
        <span>S’ouvre à votre première connexion de la journée.</span>
        <span class="jour-espace"></span>
        <wa-button variant="brand" class="primary" onclick="fermerFenetreAujourdhui()">C’est noté</wa-button>
      </footer>`;
    const nouveau = contenu.querySelector('.jour-panneau');
    if (nouveau && hautPanneau) nouveau.scrollTop = hautPanneau;
    overlay.style.display = 'flex';
  }
