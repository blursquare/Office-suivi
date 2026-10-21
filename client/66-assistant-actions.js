  // ---- « Demander à CLAIRE » : toutes les actions, avec une autorisation avant exécution (étude 13/10) ----
  // « Autorise Demander à CLAIRE à faire toutes les actions que l'on peut faire à la main ou qui sont automatiques dans CLAIRE. Avec
  // une autorisation avant exécution. » Choix de l'étude : TOUT geste qui modifie passe par une carte « Autoriser / Refuser » ; les
  // lectures restent libres. « Peut-on connecter Demander à CLAIRE à Teams pour lui demander de demander à un collaborateur de faire
  // quelque chose ? » Choix : un message Teams au collaborateur ET une tâche dans sa liste « Aujourd'hui » ; quand il la coche, celui
  // qui l'a demandée est prévenu sur Teams.
  //
  // Chaque action appelle la fonction que l'écran utilise déjà (validerPieceManuellement, basculerEngagementFait, supprimerDateEcheance,
  // marquerSansPret, validerFondsArrives, marquerFaitJour, executerActionJour, verifierDossierLocal, archiverDossier…) : une seule
  // règle métier. Leur propre fenêtre de confirmation est accordée d'office (`avecConfirmationAccordee`) : l'autorisation de la carte
  // en tient lieu — on ne demande pas deux fois.

  // Gestes de faire_geste qui modifient tout de suite : carte d'autorisation. Les autres ouvrent un outil ou une fenêtre (email : rien
  // ne part sans « Envoyer ») ou ont déjà leur propre confirmation (placer la signature, nouveau rendez-vous, sondage, options).
  var GESTES_AVEC_AUTORISATION_AGENT = ['rappel_ajouter', 'echeance_cocher', 'echeance_decocher', 'date_fiche', 'archiver', 'responsable'];

  // Gestes qui ouvrent une fenêtre, un formulaire ou une confirmation : rien n'est fait avant la validation de l'utilisateur.
  var GESTES_EN_ATTENTE_AGENT = ['email', 'sondage_dates', 'options_rendez_vous', 'rendez_vous_creer', 'rendez_vous_placer', 'appel_fonds', 'quotites', 'preemption'];

  var COLLABORATEURS_AGENT = { Bastien: 'Bastien ANGLUMENT', Julie: 'Julie VASSELIN', 'Jérémy': 'Jérémy SAUJOT' };

  var LIBELLES_CHAMPS_FICHE_AGENT = {
    email_vendeur: 'Email du vendeur', email_acquereur: 'Email de l’acquéreur', telephone_vendeur: 'Téléphone du vendeur',
    telephone_acquereur: 'Téléphone de l’acquéreur', adresse_bien: 'Adresse du bien', prix_vente: 'Prix de vente', agence: 'Agence',
    notaire_vendeur: 'Notaire du vendeur', notaire_acquereur: 'Notaire de l’acquéreur', date_avant_contrat: 'Date de l’avant-contrat'
  };
  var CHAMPS_FICHE_AGENT = {
    email_vendeur: 'emailVendeur', email_acquereur: 'emailAcquereur', telephone_vendeur: 'telephoneVendeur', telephone_acquereur: 'telephoneAcquereur',
    adresse_bien: 'adresseBien', prix_vente: 'prixVente', agence: 'nomAgence', notaire_vendeur: 'notaireVendeur', notaire_acquereur: 'notaireAcquereur',
    date_avant_contrat: 'dateAvantContrat'
  };
  var ECRITURES_CHAMPS_FICHE_AGENT = {
    email_vendeur: (id, v) => changerEmailVendeur(id, v), email_acquereur: (id, v) => changerEmailAcquereur(id, v),
    telephone_vendeur: (id, v) => changerTelephoneDossier(id, 'vendeur', v), telephone_acquereur: (id, v) => changerTelephoneDossier(id, 'acquereur', v),
    adresse_bien: (id, v) => changerAdresseBien(id, v), prix_vente: (id, v) => changerPrixVente(id, String(v)),
    date_avant_contrat: (id, v) => changerDateAvantContrat(id, v),
    notaire_vendeur: (id, v) => affecterNotaire(id, 'vendeur', v), notaire_acquereur: (id, v) => affecterNotaire(id, 'acquereur', v)
  };
  var LIBELLES_DATES_AGENT = { pret: 'obtention du prêt', ventebien: 'vente préalable', acte: 'date butoir', appelFonds: 'envoi de l’appel de fonds',
    projetEnvoye: 'envoi du projet', rendezVousSignature: 'rendez-vous de signature' };

  // ---- La carte d'autorisation ----

  var autorisationAgentEnAttente = null;     // { resoudre } pendant qu'une carte attend un clic

  function demanderAutorisationAgent(description) {
    if (autorisationAgentEnAttente) autorisationAgentEnAttente.resoudre(false);
    return new Promise(resoudre => {
      let fini = false;
      const message = { role: 'claire', html: '', boutons: [], quand: Date.now() };
      const conclure = (ok) => {
        if (fini) return;
        fini = true;
        autorisationAgentEnAttente = null;
        message.boutons = [];
        message.html = htmlAutorisationAgent(description, ok ? 'autorise' : 'refuse');
        assistantEtapeAgent = ok ? 'Je m’en occupe…' : 'Je réfléchis…';
        renderAssistant();
        resoudre(ok);
      };
      message.html = htmlAutorisationAgent(description, '');
      message.boutons = [{ libelle: 'Autoriser', principal: true, action: () => conclure(true) }, { libelle: 'Refuser', action: () => conclure(false) }];
      autorisationAgentEnAttente = { resoudre: conclure };
      assistantMessages.push(message);
      assistantEtapeAgent = 'En attente de votre autorisation…';
      renderAssistant();
    });
  }

  // Pure : la carte, avant (état '') et après le clic.
  function htmlAutorisationAgent(description, etat) {
    const tete = etat === 'autorise' ? '<span class="asst-autorisation-etat ok">Autorisé</span>'
      : etat === 'refuse' ? '<span class="asst-autorisation-etat non">Refusé</span>' : '<span class="asst-autorisation-etat">À autoriser</span>';
    // Plusieurs lignes (un lot d'actions) : la première en phrase, les autres en liste.
    const lignes = String(description || '').split('\n').filter(Boolean);
    const corps = lignes.length > 1 ? `<p>${escapeHtml(lignes[0])}</p><ul class="asst-liste">${lignes.slice(1).map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : `<p>${escapeHtml(description)}</p>`;
    return `<div class="asst-autorisation">${tete}${corps}</div>`;
  }

  // Une nouvelle conversation ou une page quittée : la carte en attente vaut refus (la boucle de l'agent reprend la main).
  function refuserAutorisationEnAttente() {
    if (autorisationAgentEnAttente) autorisationAgentEnAttente.resoudre(false);
  }

  // Exécute `fn` en accordant d'office la confirmation qu'elle demanderait (l'autorisation vient d'être donnée).
  function avecConfirmationAccordee(fn) {
    const avant = window.demanderConfirmation;
    window.demanderConfirmation = (message, siOui) => { if (typeof siOui === 'function') siOui(); };
    try { return fn(); } finally { window.demanderConfirmation = avant; }
  }

  // Pure : la phrase de la carte pour un geste de faire_geste.
  function descriptionGesteAgent(entree, d) {
    const p = (entree && entree.parametres) || {};
    const dossier = d ? ` — ${libelleDossierAffiche(d)}` : '';
    const date = p.date ? ` (${formatDateFr(p.date)})` : '';
    const echeance = (ECHEANCES_ASSISTANT.find(e => e.cle === p.echeance) || {}).libelle || p.echeance || 'une échéance';
    const champ = (CHAMPS_DATE_ASSISTANT.find(c => c.cle === p.champ) || {}).libelle || p.champ || 'une date';
    switch (entree && entree.geste) {
      case 'rappel_ajouter': return `Ajouter le rappel « ${p.texte || ''} »${date}${dossier}.`;
      case 'echeance_cocher': return `Cocher « ${echeance} »${dossier}.`;
      case 'echeance_decocher': return `Décocher « ${echeance} »${dossier}.`;
      case 'date_fiche': return `Écrire la date « ${champ} »${p.date ? ' : ' + formatDateFr(p.date) : ''}${dossier}.`;
      case 'archiver': return `Archiver le dossier${dossier}.`;
      case 'responsable': return `Confier le dossier${dossier} à ${COLLABORATEURS_AGENT[p.collaborateur] || p.collaborateur}.`;
      case 'rendez_vous_placer': return `Noter la signature${dossier} le ${p.date ? formatDateFr(p.date) : '?'} sur la fiche (agenda Outlook non relié).`;
      case 'quotites': return `Ouvrir les Quotités${dossier} : le calcul en cours sur un autre dossier sera remplacé.`;
      case 'appel_fonds': return `Ouvrir l’Appel de fonds${dossier} : le décompte en cours sur un autre dossier sera remplacé.`;
      default: return `Faire « ${entree && entree.geste} »${dossier}.`;
    }
  }

  // ---- Les actions sur un dossier ----

  // Pure : la pièce de la checklist désignée par un libellé (contenu dans l'autre, sans accents ni casse), sinon null.
  function pieceChecklistParLibelle(d, libelle) {
    const cible = normaliserPourRecherche(String(libelle || '')).trim();
    if (!cible) return null;
    let liste = [];
    try { liste = checklistPieces(d.typeVente, d); } catch (e) { return null; }
    // Libellé exact, sinon une partie d'au moins 6 lettres contenue dans UNE seule pièce (audit 13/10 : « de » désignait la première).
    const exacte = liste.find(p => normaliserPourRecherche(p.label) === cible);
    if (exacte || cible.length < 6) return exacte || null;
    const partielles = liste.filter(p => normaliserPourRecherche(p.label).includes(cible));
    return partielles.length === 1 ? partielles[0] : null;
  }

  // Pure : ce que fera une action — { description, erreur }.
  function preparerActionDossierAgent(e, d) {
    const nom = d ? libelleDossierAffiche(d) : '';
    const dossier = nom ? ` — ${nom}` : '';
    switch (e.action) {
      case 'piece_recue': {
        const p = d && pieceChecklistParLibelle(d, e.piece);
        return p ? { description: `Marquer reçue la pièce « ${p.label} »${dossier}.`, piece: p } : { erreur: 'pièce introuvable dans la checklist du dossier : reprends son libellé exact (lire_dossier, pieces_attendues)' };
      }
      case 'engagement_fait': {
        const n = parseInt(e.numero, 10);
        const eng = d && d.analyseJuridique && (d.analyseJuridique.engagements || [])[n - 1];
        if (!eng) return { erreur: 'engagement introuvable : numero = sa position dans engagements_du_vendeur, à partir de 1' };
        // Le geste de l'écran BASCULE : un engagement déjà réalisé (à la main ou par ses pièces reçues) n'est jamais repris (relecture 13/10).
        if (etatEngagementAnalyse(d, eng).fait) return { erreur: 'cet engagement est déjà réalisé' };
        return { description: `Marquer réalisé l’engagement « ${libelleCourtEngagement(eng)} »${dossier}.`, engagement: eng };
      }
      case 'echeance_ajouter':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') || !String(e.libelle || '').trim()) return { erreur: 'libelle et date (AAAA-MM-JJ) attendus' };
        return { description: `Ajouter l’échéance « ${e.libelle} » au ${formatDateFr(e.date)}${dossier}.` };
      case 'echeance_supprimer': {
        const i = (d.autres || []).findIndex(a => normaliserPourRecherche(a.label || '') === normaliserPourRecherche(e.libelle || ''));
        return i >= 0 ? { description: `Supprimer l’échéance « ${d.autres[i].label} »${dossier}.`, libelle: d.autres[i].label } : { erreur: 'échéance ajoutée introuvable : reprends son libellé exact' };
      }
      case 'date_effacer':
        if (!LIBELLES_DATES_AGENT[e.champ]) return { erreur: 'champ : pret, ventebien, acte, appelFonds, projetEnvoye ou rendezVousSignature' };
        if (!d[e.champ]) return { erreur: 'cette date est déjà vide' };
        return { description: `Effacer la date « ${LIBELLES_DATES_AGENT[e.champ]} » (${formatDateFr(d[e.champ])})${e.champ === 'pret' ? ' : le dossier passe sans prêt' : ''}${e.champ === 'rendezVousSignature' ? ' : le rendez-vous est aussi retiré de l’agenda de l’office' : ''}${dossier}.` };
      case 'sans_pret':
        return d.sansPret ? { erreur: 'le dossier est déjà sans prêt' } : { description: `Retirer la condition d’obtention du prêt (l’offre ne sera plus attendue ni relancée)${dossier}.` };
      case 'champ_fiche': {
        const cle = CHAMPS_FICHE_AGENT[e.champ];
        if (!cle) return { erreur: 'champ de fiche inconnu' };
        const v = valeurChampFicheAgent(e.champ, e.valeur);
        if (v.erreur) return v;
        const avant = d[cle] ? (e.champ === 'prix_vente' ? formaterPrix(d[cle]) : String(d[cle])) : 'vide';
        return { description: `Modifier « ${LIBELLES_CHAMPS_FICHE_AGENT[e.champ]} » : ${avant} → ${v.affiche || 'vide'}${dossier}.`, cle, valeur: v.valeur, avant, affiche: v.affiche || 'vide' };
      }
      case 'note_historique':
        if (/\[à compléter\]/.test(String(e.valeur || ''))) return { erreur: 'note avec un nom inconnu : reformule-la' };
        return String(e.valeur || '').trim() ? { description: `Noter dans l’historique : « ${String(e.valeur).trim().slice(0, 300)} »${dossier}.` } : { erreur: 'valeur = le texte de la note' };
      case 'fonds_valides':
        return d.fondsValidesLe ? { erreur: 'fonds déjà validés' } : { description: `Noter les fonds reçus (arrivés sur le compte de l’étude, sans reçu comptable)${dossier}.` };
      case 'tache_faite':
      case 'tache_executer': {
        const a = trouverActionJour(e.tache_id);
        if (!a) return { erreur: 'tâche introuvable : prends son tache_id dans taches_du_jour' };
        return { description: descriptionTacheAgent(e.action, a) };
      }
      case 'nas_reverifier':
        return d.nasDossier ? { description: `Revérifier le dossier du NAS (pièces, offre de prêt)${dossier}.` } : { erreur: 'dossier non relié au NAS' };
      case 'desarchiver':
        return d.archive ? { description: `Désarchiver le dossier${dossier}.` } : { erreur: 'le dossier n’est pas archivé' };
      default: return { erreur: 'action inconnue' };
    }
  }

  // Pure : la carte d'une tâche du jour — l'effet RÉEL (relecture 13/10 : « Faire la tâche Envoyer le projet » notait seulement le projet
  // envoyé, sans rien envoyer).
  function descriptionTacheAgent(action, a) {
    const dossier = a.dossier ? ` — ${libelleDossierAffiche(a.dossier)}` : '';
    const champ = CHAMP_FAIT_MAIN_PAR_TYPE[a.type];
    const envoi = champ === 'appelFonds' || champ === 'projetEnvoye';
    if (action === 'tache_faite') return `Marquer faite la tâche « ${a.titre} »${envoi ? ' : la date d’envoi du jour est notée, rien n’est envoyé' : ''}${dossier}.`;
    const g = a.geste || {};
    if (g.type === 'marquer') return `Noter « ${a.titre} » comme fait aujourd’hui (rien n’est envoyé)${dossier}.`;
    if (g.type === 'email') return `Ouvrir l’email de la tâche « ${a.titre} » (rien ne part sans votre clic sur « Envoyer »)${dossier}.`;
    if (g.type === 'fiche') return `Ouvrir la fiche pour la tâche « ${a.titre} »${dossier}.`;
    if (g.type === 'valider') return `Cocher l’échéance de la tâche « ${a.titre} »${dossier}.`;
    return `Faire la tâche « ${a.titre} »${dossier}.`;
  }

  // Pure : la valeur d'un champ de fiche, contrôlée comme une saisie — { valeur, affiche } ou { erreur }.
  function valeurChampFicheAgent(champ, brute) {
    const v = String(brute == null ? '' : brute).trim();
    // Un code que l'IA a inventé n'est jamais écrit, quel que soit le champ (audit 13/10 : une adresse passait).
    if (/\[à compléter\]/.test(v)) return { erreur: 'valeur inconnue : demande-la à l’utilisateur' };
    if (champ === 'prix_vente') {
      const n = eurosDepuisSaisie(v);
      return n ? { valeur: n, affiche: formaterPrix(n) } : { erreur: 'prix illisible' };
    }
    if (champ === 'date_avant_contrat') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? { valeur: v, affiche: formatDateFr(v) } : { erreur: 'date au format AAAA-MM-JJ' };
    if (champ === 'adresse_bien') return v ? { valeur: normaliserAdresse(v), affiche: normaliserAdresse(v) } : { erreur: 'adresse vide' };
    // Audit 13/10 (Haut) : notaireDuRepertoire rend un BOOLÉEN, et « vrai » sans annuaire — le nom complété est vérifié contre
    // l'annuaire chargé, et c'est le NOM qui est écrit (par affecterNotaire, qui recalcule le côté qui reçoit l'acte).
    if (champ === 'notaire_vendeur' || champ === 'notaire_acquereur') {
      if (!v) return { erreur: 'nom du notaire vide' };
      if (!Array.isArray(carnetConfreres) || !carnetConfreres.length) return { erreur: 'annuaire des notaires pas encore chargé : réessaie dans un instant' };
      const complet = completerNomNotaire(v, carnetConfreres);
      return complet && notaireDuRepertoire(complet, carnetConfreres) ? { valeur: complet, affiche: complet } : { erreur: 'ce nom ne désigne pas un seul notaire du répertoire' };
    }
    if (/^telephone/.test(champ) && v && v.replace(/\D/g, '').length < 9) return { erreur: 'numéro de téléphone incomplet' };
    if (/^email/.test(champ) && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+(\s*[;,]\s*[^\s@]+@[^\s@]+\.[^\s@]+)*$/.test(v)) return { erreur: 'adresse email invalide' };
    return { valeur: v, affiche: v };
  }

  function executerActionDossierAgent(e, d, prep) {
    switch (e.action) {
      case 'piece_recue': avecConfirmationAccordee(() => validerPieceManuellement(d.id, prep.piece.cle, prep.piece.label)); return;
      case 'engagement_fait': {
        // Retrouvé au moment du clic (un autre poste a pu changer la liste pendant que la carte attendait).
        const i = (d.analyseJuridique && d.analyseJuridique.engagements || []).indexOf(prep.engagement);
        if (i < 0 || etatEngagementAnalyse(d, prep.engagement).fait) throw new Error('l’engagement a changé entre-temps');
        avecConfirmationAccordee(() => basculerEngagementFait(d.id, i));
        return;
      }
      case 'echeance_ajouter':
        d.autres = d.autres || [];
        d.autres.push({ label: String(e.libelle).trim().slice(0, 120), date: e.date, page: null });
        ajouterHistorique(d, `Échéance « ${String(e.libelle).trim()} » ajoutée (${formatDateFr(e.date)})`);
        sauvegarder(d);
        notifierDateAjoutee(d, String(e.libelle).trim(), e.date, '');
        render();
        return;
      case 'echeance_supprimer': {
        const i = (d.autres || []).findIndex(a => a.label === prep.libelle);
        if (i < 0) throw new Error('l’échéance n’est plus sur la fiche');
        avecConfirmationAccordee(() => supprimerEcheanceAutre(d.id, i));
        return;
      }
      case 'date_effacer': avecConfirmationAccordee(() => supprimerDateEcheance(d.id, e.champ)); return;
      case 'sans_pret': avecConfirmationAccordee(() => marquerSansPret(d.id)); return;
      case 'champ_fiche': {
        // Par la fonction de l'écran (audit 13/10 : une seule règle par champ — historique, côté du notaire, normalisation).
        const ecrire = ECRITURES_CHAMPS_FICHE_AGENT[e.champ];
        if (ecrire) { ecrire(d.id, prep.valeur); return; }
        d[prep.cle] = prep.valeur;   // agence : pas de fonction d'écran
        ajouterHistorique(d, `« ${LIBELLES_CHAMPS_FICHE_AGENT[e.champ]} » modifié : ${prep.avant} → ${prep.affiche}`);
        sauvegarder(d);
        render();
        return;
      }
      case 'note_historique': ajouterHistorique(d, String(e.valeur).trim().slice(0, 300)); sauvegarder(d); render(); return;
      case 'fonds_valides': validerFondsArrives(d.id); return;
      case 'tache_faite': avecConfirmationAccordee(() => marquerFaitJour(e.tache_id)); return;
      case 'tache_executer': avecConfirmationAccordee(() => executerActionJour(e.tache_id)); return;
      case 'nas_reverifier': verifierDossierLocal(d.id, true); return;
      case 'desarchiver': archiverDossier(d.id, false); return;
      default:
    }
  }

  async function actionDossierAgent(entree) {
    const e = entree || {};
    const sansDossier = e.action === 'tache_faite' || e.action === 'tache_executer';
    const d = e.dossier_id ? dossiers.find(x => x.id === e.dossier_id) : null;
    if (!sansDossier && !d) return { erreur: 'dossier introuvable : cherche-le d’abord (chercher_dossiers) et passe son id' };
    const prep = preparerActionDossierAgent(e, d);
    if (prep.erreur) return { erreur: prep.erreur };
    if (!(await demanderAutorisationAgent(prep.description))) return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
    try { executerActionDossierAgent(e, d, prep); } catch (err) { return { erreur: 'échec : ' + String(err && err.message || err).slice(0, 160) }; }
    return { fait: true, action: prep.description };
  }

  // ---- Demander à un collaborateur (Teams + tâche dans sa liste « Aujourd'hui ») ----

  // Pure : la tâche posée dans la liste du collaborateur.
  function rappelDemandeCollaborateur(e, demandeur, aujourdhui, maintenant) {
    return {
      id: 'dem-' + Number(maintenant).toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      auteur: COLLABORATEURS_AGENT[e.collaborateur] || '',
      texte: `${String(e.texte || '').trim().slice(0, 170)}${demandeur ? ` (demandé par ${prenomCollaborateur(demandeur)})` : ''}`.slice(0, 200),
      echeance: /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? e.date : aujourdhui,
      dossierId: e.dossier_id || '', fait: false, faitLe: '', creeLe: new Date(maintenant).toISOString(), demandePar: demandeur || ''
    };
  }

  async function demanderCollaborateurAgent(entree) {
    const e = entree || {};
    const collaborateur = COLLABORATEURS_AGENT[e.collaborateur];
    if (!collaborateur) return { erreur: 'collaborateur : Bastien, Julie ou Jérémy' };
    if (!String(e.texte || '').trim()) return { erreur: 'texte = ce qu’il faut faire' };
    if (/\[à compléter\]/.test(String(e.texte))) return { erreur: 'la demande cite un nom inconnu : reformule-la' };
    const d = e.dossier_id ? dossiers.find(x => x.id === e.dossier_id) : null;
    if (e.dossier_id && !d) return { erreur: 'dossier introuvable' };
    const soiMeme = collaborateur === utilisateurPoste;
    const quand = /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? ` pour le ${formatDateFr(e.date)}` : '';
    const description = `Demander à ${prenomCollaborateur(collaborateur)} : « ${String(e.texte).trim()} »${d ? ` — ${libelleDossierAffiche(d)}` : ''}${quand}. ${soiMeme ? 'Tâche dans votre liste « Aujourd’hui ».' : 'Message Teams et tâche dans sa liste « Aujourd’hui ».'}`;
    if (!(await demanderAutorisationAgent(description))) return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
    const rappel = rappelDemandeCollaborateur(e, soiMeme ? '' : utilisateurPoste, isoAujourdhuiLocal(), Date.now());
    let tache = false;
    try {
      const r = await fetchAvecAuth('/api/rappels-perso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rappel }) });
      tache = r.ok;
    } catch (err) { tache = false; }
    if (soiMeme) { if (tache) { rappelsPerso.push(rappel); renderAlertesDashboard(dossiersPerimetreDashboard()); } return tache ? { fait: true, tache: 'ajoutée' } : { erreur: 'tâche non enregistrée' }; }
    let teams = 'non envoyé';
    try {
      const r = await fetchAvecAuth('/api/notifications/demande-collaborateur', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collaborateur, auteur: utilisateurPoste || '', texte: String(e.texte).trim(), dossierNom: d ? libelleDossierAffiche(d) : '', date: e.date || '' }) });
      const corps = await r.json().catch(() => ({}));
      teams = corps.ignore ? 'envoi Teams non réglé (Réglages › Rappels)' : corps.envoyeResponsable ? 'envoyé' : 'échec : ' + ((corps.erreurs || [])[0] || 'inconnu');
    } catch (err) { teams = 'serveur injoignable'; }
    noterVerificationPoste('agent-demande-collaborateur', teams === 'envoyé' && tache ? { detail: 'Teams et tâche' } : { ok: false, message: tache ? 'Teams non envoyé' : 'tâche non enregistrée' });
    afficherToast(`${prenomCollaborateur(collaborateur)} : ${tache ? 'tâche ajoutée' : 'tâche NON enregistrée'}, Teams ${teams}.`, 'OK', null);
    return { fait: tache, tache: tache ? 'ajoutée à sa liste « Aujourd’hui »' : 'non enregistrée', teams };
  }

  // La tâche demandée par un autre est cochée : il est prévenu sur Teams (une fois).
  function prevenirDemandeurTacheFaite(r) {
    if (!r || !r.fait || !r.demandePar || r.demandePar === utilisateurPoste || r.demandeurPrevenu) return;
    const d = r.dossierId ? dossiers.find(x => x.id === r.dossierId) : null;
    // Le repère n'est posé qu'une fois le message parti (audit 13/10 : un échec le rendait muet pour toujours).
    fetchAvecAuth('/api/notifications/demande-faite', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demandeur: r.demandePar, auteur: utilisateurPoste || '', texte: String(r.texte || '').replace(/\s*\(demandé par [^)]*\)$/, ''), dossierNom: d ? libelleDossierAffiche(d) : '' }) })
      .then(rep => { if (rep.ok && r.fait) { r.demandeurPrevenu = true; enregistrerRappelPerso(r); } })
      .catch(e => console.warn('Demande faite : Teams non prévenu', e && e.message));
  }
