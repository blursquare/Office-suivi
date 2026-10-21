  // ---- « Demander à CLAIRE » : plus de pouvoirs (étude 21/10) ----
  // « Je veux qu'il puisse aussi faire plus » — choix de l'étude : écrire dans l'agenda et les emails, gérer les scans et le NAS,
  // enchaîner sur plusieurs dossiers ; les autorisations RESTENT (carte « Autoriser / Refuser » avant toute modification, une seule
  // pour un lot). Chaque outil appelle la fonction que l'écran utilise déjà ; l'agent ne voit que des identifiants opaques (scan_id,
  // element_id, evenement_id) et des noms que le serveur masque comme tout résultat d'outil — jamais le nom d'un scan.

  var evenementsAgent = { parId: {}, parItem: {}, n: 0 };
  var scansAgent_ = { parNom: {}, parId: {}, n: 0 };
  var scansRangesParAgent = new Set();      // scans que l'agent range : ce rangement n'enseigne rien (il n'est pas une correction faite à la main)
  var elementsNasAgent = { parCle: {}, parId: {}, n: 0 };

  function reinitialiserPouvoirsAgent() {
    evenementsAgent = { parId: {}, parItem: {}, n: 0 };
    scansAgent_ = { parNom: {}, parId: {}, n: 0 };
    elementsNasAgent = { parCle: {}, parId: {}, n: 0 };
  }

  // L'identifiant donné à l'agent pour un rendez-vous de l'agenda ('' sans identifiant Outlook : il ne se modifie pas).
  function idEvenementAgent(e) {
    if (!e || !e.itemId) return '';
    let id = evenementsAgent.parItem[e.itemId];
    if (!id) { id = 'ev' + (++evenementsAgent.n); evenementsAgent.parItem[e.itemId] = id; }
    evenementsAgent.parId[id] = e;
    return id;
  }

  // Un scan se reconnaît par son nom ET sa date (le copieur peut réutiliser un nom).
  function idScanAgent(s) {
    const cle = s.nom + '|' + s.date;
    let id = scansAgent_.parNom[cle];
    if (!id) { id = 'sc' + (++scansAgent_.n); scansAgent_.parNom[cle] = id; scansAgent_.parId[id] = { nom: s.nom, date: s.date }; }
    return id;
  }

  function idElementNasAgent(dossierId, chemin, type) {
    const cle = dossierId + '|' + chemin;
    let id = elementsNasAgent.parCle[cle];
    if (!id) { id = (type === 'dossier' ? 'nd' : 'nf') + (++elementsNasAgent.n); elementsNasAgent.parCle[cle] = id; }
    elementsNasAgent.parId[id] = { dossierId, chemin, type };
    return id;
  }

  // Point de contrôle au bureau : un premier geste réussi demandé à Claude.
  function noterPouvoirAgent(detail) { noterVerificationPoste('agent-pouvoirs', { detail }); }

  const REFUS_AGENT = { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };

  // ---- Un lot d'actions, une seule autorisation ----

  // Pure : la carte d'un lot — une phrase puis une ligne par action.
  function descriptionLotAgent(descriptions) {
    const liste = (descriptions || []).filter(Boolean).map(x => String(x).replace(/\s*\n\s*/g, ' '));
    return `${liste.length} action${liste.length > 1 ? 's' : ''} à faire, d’un seul coup :\n${liste.join('\n')}`;
  }

  async function actionsEnLotAgent(entree) {
    const liste = Array.isArray(entree && entree.actions) ? entree.actions.slice(0, 30) : [];
    if (!liste.length) return { erreur: 'actions : au moins une action attendue' };
    const preparees = [];
    const ignorees = [];
    liste.forEach((e, i) => {
      const sansDossier = e.action === 'tache_faite' || e.action === 'tache_executer';
      // Une tâche « à exécuter » ouvre un email, un outil ou une fiche : une par une (action_dossier), jamais dans un lot.
      if (e.action === 'tache_executer') { ignorees.push({ numero: i + 1, erreur: 'tache_executer ne va pas dans un lot : fais-la seule avec action_dossier' }); return; }
      const d = e.dossier_id ? dossiers.find(x => x.id === e.dossier_id) : null;
      if (!sansDossier && !d) { ignorees.push({ numero: i + 1, erreur: 'dossier introuvable : cherche-le d’abord' }); return; }
      const prep = preparerActionDossierAgent(e, d);
      if (prep.erreur) ignorees.push({ numero: i + 1, erreur: prep.erreur });
      else preparees.push({ e, d, prep, numero: i + 1 });
    });
    if (!preparees.length) return { erreur: 'aucune action possible', ignorees };
    if (!(await demanderAutorisationAgent(descriptionLotAgent(preparees.map(x => x.prep.description))))) return REFUS_AGENT;
    const faites = [];
    const echecs = [];
    for (const x of preparees) {
      try { executerActionDossierAgent(x.e, x.d, x.prep); faites.push(x.numero); } catch (err) { echecs.push({ numero: x.numero, erreur: String(err && err.message || err).slice(0, 160) }); }
      await new Promise(r => setTimeout(r, 0));
    }
    if (faites.length) noterPouvoirAgent('lot d’actions');
    return { fait: faites.length, numeros_faits: faites, echecs, ignorees };
  }

  // ---- Claire Scan ----

  async function attendreLecturesScansAgent() {
    if (!etatScans.charge) await chargerScans(true);
    for (let i = 0; i < 15; i++) {
      const enCours = (etatScans.scans || []).some(s => s.stable && (!lecturesScans[cleScan(s)] || lecturesScans[cleScan(s)].statut === 'lecture'));
      if (!enCours) return;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  function resumeScanAgent(s) {
    const l = lecturesScans[cleScan(s)] || null;
    const base = { scan_id: idScanAgent(s), date: s.date };
    if (!s.stable) return { ...base, etat: 'copie en cours depuis le copieur' };
    if (!l || l.statut === 'lecture') return { ...base, etat: 'lecture en cours' };
    if (l.statut === 'erreur') return { ...base, etat: 'lecture impossible', erreur: l.erreur || '' };
    const p = l.proposition || {};
    const c = l.choix || {};
    const d = dossiers.find(x => x.id === c.dossierId);
    return { ...base, etat: 'lu',
      dossier_propose: d ? { id: d.id, libelle: libelleDossierAffiche(d), relie_au_nas: !!d.nasDossier } : null, dossier_sur: !!p.dossierSur,
      score_sur_6: p.score ? noteScoreScan(p.score) : '', pourquoi: explicationScoreScan(p),
      type_propose: c.type || '', rubrique: c.sousDossier ? 'sous-dossier « ' + c.sousDossier + ' »' : libelleRubriquesScan(c.rubriques),
      rangement_automatique_prevu: !!p.automatique, doublon: s.doublon ? { rangé_le: s.doublon.date, dossier: s.doublon.dossier ? libelleDossierParNom(s.doublon.dossier, '') : '' } : null,
      type_appris_d_un_rangement_a_la_main: !!p.viaMemoire };
  }

  async function scansAgent(e) {
    const action = e && e.action;
    if (action === 'chercher') {
      const q = String(e.texte || '').trim();
      if (!q) return { erreur: 'texte = les mots à chercher dans les scans rangés' };
      try {
        const r = await fetchAvecAuth('/api/scans/recherche?q=' + encodeURIComponent(q.slice(0, 200)));
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return { erreur: j.erreur || 'recherche impossible' };
        return { textes_indexes: j.indexes || 0, resultats: (j.resultats || []).slice(0, 10).map(x => ({ date: x.date, dossier: x.dossier ? libelleDossierParNom(x.dossier, x.dossierId) : '', rubrique: x.rubrique || '', extrait: x.extrait || '' })),
          note: 'seuls les scans rangés depuis le 20/10 sont cherchables' };
      } catch (err) { return { erreur: 'serveur injoignable' }; }
    }
    if (!etatScans.charge) await chargerScans(true);
    if (!etatScans.configure || !(etatScans.reglages && etatScans.reglages.actif)) return { erreur: etatScans.configure ? 'Claire Scan n’est pas activé (Réglages › Pièces et Claire Scan)' : (etatScans.raison || 'dossier du copieur introuvable') };
    if (action === 'lister') {
      await attendreLecturesScansAgent();
      return { scans_en_attente: (etatScans.scans || []).map(resumeScanAgent), laisses_dans_scan: (etatScans.ecartes || []).length,
        pieces_possibles: TYPES_SCAN.map(t => ({ cle: t.cle, libelle: t.label })) };
    }
    if (action === 'historique' || action === 'remettre') await chargerScans(true);   // le journal du serveur, à jour (un rangement vient peut-être de finir)
    if (action === 'historique') {
      return { rangements: (etatScans.journal || []).slice(0, 20).map(j => ({ entree_id: j.id || '', date: j.date, dossier: j.dossier ? libelleDossierParNom(j.dossier, j.dossierId) : '', rubrique: j.rubrique || '',
        piece: libelleTypeHistoriqueScan(j.type), automatique: !!j.auto, corrige_a_la_main: !!j.corrige, annule: !!j.annule, annulable: !!(j.id && j.original && !j.annule) })) };
    }
    if (action === 'remettre') {
      const j = (etatScans.journal || []).find(x => x.id === e.entree_id);
      if (!j) return { erreur: 'rangement introuvable : prends son entree_id dans historique' };
      if (j.annule || !j.original) return { erreur: j.annule ? 'ce rangement est déjà annulé' : 'ce rangement ne peut pas être annulé (l’original n’a pas quitté le dossier Scan)' };
      if (!(await demanderAutorisationAgent(`Remettre « ${j.nom} » dans le dossier Scan : la copie quitte le dossier du client${j.dossier ? ' (' + libelleDossierParNom(j.dossier, j.dossierId) + ')' : ''} et la pièce cochée sur la fiche est décochée.`))) return REFUS_AGENT;
      const r = await remettreRangementScan(j.id);
      afficherToast(r.message, 'OK', null);
      if (r.ok) noterPouvoirAgent('rangement défait');
      return r.ok ? { fait: true } : { erreur: r.message };
    }
    // ranger, laisser : sur un scan en attente (retrouvé par son nom ET sa date)
    const ref = scansAgent_.parId[e.scan_id];
    const scan = ref ? (etatScans.scans || []).find(s => s.nom === ref.nom && s.date === ref.date) : null;
    if (!scan) return { erreur: 'scan introuvable ou déjà traité : relance lister' };
    if (action === 'laisser') {
      if (!(await demanderAutorisationAgent(`Laisser le scan « ${scan.nom} » dans le dossier Scan (il ne sera plus proposé tant que vous ne le remettez pas).`))) return REFUS_AGENT;
      await ecarterScan(scan.nom);
      return (etatScans.ecartes || []).some(x => x.nom === scan.nom) ? { fait: true } : { erreur: 'le scan n’a pas pu être mis de côté' };
    }
    if (action !== 'ranger') return { erreur: 'action : lister, ranger, laisser, historique, remettre ou chercher' };
    const cle = cleScan(scan);
    const l = lecturesScans[cle];
    if (!scan.stable || !l || l.statut !== 'pret') return { erreur: 'scan pas encore lu (ou lecture impossible) : relance lister dans un instant' };
    if (scansEnRangement.has(scan.nom)) return { erreur: 'ce scan est déjà en cours de rangement' };
    // Tant que la carte attend : le rangement automatique de cette fenêtre ne touche pas à ce scan, et un refus remet le choix d'avant.
    const etaitEcarteDuAuto = echecsAutoScans.has(cle);
    echecsAutoScans.add(cle);
    const choixAvant = JSON.parse(JSON.stringify(l.choix));
    const restaurer = () => { l.choix = choixAvant; if (ongletActuel === 'scans') renderScans(true); };
    try {
      if (e.dossier_id && e.dossier_id !== l.choix.dossierId) {
        const cible = dossiers.find(x => x.id === e.dossier_id);
        if (!cible) return { erreur: 'dossier introuvable' };
        if (cible.archive) return { erreur: 'ce dossier est archivé : Claire Scan ne range pas dans un dossier archivé' };
        changerChoixScan(scan.nom, 'dossierId', e.dossier_id);
      }
      if (e.type && e.type !== l.choix.type) {
        if (!TYPES_SCAN.some(t => t.cle === e.type)) { restaurer(); return { erreur: 'type inconnu : prends une clé de pieces_possibles' }; }
        changerChoixScan(scan.nom, 'type', e.type);
      }
      const c = l.choix;
      const d = dossiers.find(x => x.id === c.dossierId);
      if (!d) { restaurer(); return { erreur: 'aucun dossier proposé : passe dossier_id' }; }
      if (d.archive) { restaurer(); return { erreur: 'ce dossier est archivé : Claire Scan ne range pas dans un dossier archivé' }; }
      if (!d.nasDossier) { restaurer(); return { erreur: 'ce dossier n’est pas relié à son dossier du NAS' }; }
      const rubrique = c.sousDossier ? c.sousDossier : libelleRubriquesScan(c.rubriques);
      const doublon = scan.doublon ? ' — attention : identique à un scan déjà rangé' : '';
      if (!(await demanderAutorisationAgent(`Ranger le scan « ${scan.nom} » dans ${libelleDossierAffiche(d)} › ${rubrique}, sous le nom « ${c.nomCible}.pdf »${doublon}.`))) { restaurer(); return REFUS_AGENT; }
      // Le scan a pu partir (autre fenêtre, rangement automatique) pendant que la carte attendait : rien n'est alors fait.
      if (!scanParNom(scan.nom)) return { erreur: 'le scan a déjà été traité pendant que la carte attendait : relance lister' };
      const avant = new Set((etatScans.journal || []).map(j => j.id));
      scansRangesParAgent.add(scan.nom);
      try { await rangerScanChoisi(scan.nom, false); } finally { scansRangesParAgent.delete(scan.nom); }
      // « Rangé » = une nouvelle ligne du journal pour CE scan et CE dossier (pas seulement un scan sorti de la liste).
      await chargerScans(true);
      const entree = (etatScans.journal || []).find(j => !avant.has(j.id) && j.nom === scan.nom && j.dossierId === d.id && !j.annule);
      if (!entree) return { erreur: 'le scan n’a pas été rangé dans ce dossier (voir le message affiché à l’utilisateur)' };
      noterPouvoirAgent('scan rangé');
      return { fait: true, dossier_id: d.id, rubrique, entree_id: entree.id || '' };
    } finally {
      if (!etaitEcarteDuAuto) echecsAutoScans.delete(cle);
    }
  }

  // ---- Le dossier du client sur le NAS ----

  async function nasDossierAgent(e) {
    const d = dossiers.find(x => x.id === e.dossier_id);
    if (!d) return { erreur: 'dossier introuvable' };
    if (!d.dossierLie || !d.nasDossier) return { erreur: 'ce dossier n’est pas relié à son dossier du NAS' };
    if (e.action === 'lister') {
      let sous = '';
      if (e.sous) {
        const el = elementsNasAgent.parId[e.sous];
        if (!el || el.type !== 'dossier' || el.dossierId !== d.id) return { erreur: 'sous : element_id d’un sous-dossier rendu par une liste précédente' };
        sous = el.chemin;
      }
      try {
        const r = await fetchAvecAuth(`/api/nas/explorer?dossierId=${encodeURIComponent(d.id)}&sous=${encodeURIComponent(sous)}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return { erreur: j.erreur || 'le NAS n’a pas répondu' };
        const chemin = (nom) => (sous ? sous + '/' : '') + nom;
        return {
          dossier_affiche: sous || 'racine du dossier du client',
          entrees: [].concat((j.dossiers || []).map(f => ({ element_id: idElementNasAgent(d.id, chemin(f.nom), 'dossier'), type: 'dossier', intitule: f.nom })),
            (j.fichiers || []).map(f => ({ element_id: idElementNasAgent(d.id, chemin(f.nom), 'fichier'), type: 'fichier', intitule: f.nom, taille: f.taille != null ? tailleLisible(f.taille) : '', modifie: f.modifieLe ? String(f.modifieLe).slice(0, 10) : '' }))),
          tous_les_sous_dossiers: (j.arbre || []).slice(0, 80).map(c => ({ element_id: idElementNasAgent(d.id, c, 'dossier'), chemin: c }))
        };
      } catch (err) { return { erreur: 'serveur injoignable' }; }
    }
    const el = elementsNasAgent.parId[e.element_id];
    if (!el || el.type !== 'fichier' || el.dossierId !== d.id) return { erreur: 'element_id d’un FICHIER rendu par lister attendu (relance lister si le dossier a changé)' };
    const nomFichier = el.chemin.split('/').pop();
    if (e.action === 'renommer') {
      const nouveau = String(e.nouveau_nom || '').trim();
      if (!nouveau || /\[à compléter\]/.test(nouveau) || /[\\/]/.test(nouveau)) return { erreur: 'nouveau_nom : un nom de fichier (sans / ni \\) ' };
      const { ext } = nomSansExtensionNas(nomFichier);
      if (!(await demanderAutorisationAgent(`Renommer « ${nomFichier} » en « ${nouveau}${ext} » dans le dossier du NAS de ${libelleDossierAffiche(d)}.`))) return REFUS_AGENT;
      const r = await gesteExplorateurNas('renommer', { chemin: el.chemin, nom: nouveau }, d.id);
      if (r.erreur) return { erreur: r.erreur };
      noterVerificationPoste('explorateur-nas', { detail: 'pièce renommée par Demander à CLAIRE' });
      noterPouvoirAgent('pièce renommée');
      elementsNasAgent.parId[e.element_id] = { ...el, chemin: r.chemin || el.chemin };
      if (explorateurNas.dossierId === d.id) apresGesteExplorateurNas();
      if (!r.inchange) afficherToast(`Renommé : « ${r.nom} ».`, 'Annuler', async () => {
        const retour = await gesteExplorateurNas('renommer', { chemin: r.chemin, nom: nomSansExtensionNas(nomFichier).base }, d.id);
        if (retour.erreur) afficherToast(retour.erreur, 'OK', null); else if (explorateurNas.dossierId === d.id) apresGesteExplorateurNas();
      });
      return { fait: true, nouveau_nom: r.nom };
    }
    if (e.action === 'deplacer') {
      let vers = '';
      if (e.vers && e.vers !== 'racine') {
        const dest = elementsNasAgent.parId[e.vers];
        if (!dest || dest.type !== 'dossier' || dest.dossierId !== d.id) return { erreur: 'vers : element_id d’un sous-dossier EXISTANT, ou "racine"' };
        vers = dest.chemin;
      } else if (!e.vers) return { erreur: 'vers : element_id d’un sous-dossier existant, ou "racine"' };
      if (destinationGlisseExplorateurNas(el.chemin, vers) === null) return { erreur: 'le fichier est déjà dans ce dossier' };
      if (!(await demanderAutorisationAgent(`Déplacer « ${nomFichier} » vers « ${vers ? vers.replace(/\//g, ' › ') : 'la racine du dossier du client'} » dans le dossier du NAS de ${libelleDossierAffiche(d)}.`))) return REFUS_AGENT;
      const erreur = await deplacerVersExplorateurNas(el.chemin, vers, d.id);
      if (erreur) return { erreur };
      delete elementsNasAgent.parId[e.element_id];
      noterPouvoirAgent('pièce déplacée');
      return { fait: true, note: 'relance lister pour retrouver le fichier (son element_id a changé)' };
    }
    return { erreur: 'action : lister, renommer ou deplacer' };
  }

  // ---- L'agenda de l'office : déplacer, renommer, supprimer un rendez-vous existant ----

  async function evenementAgendaAgent(e) {
    const ev = evenementsAgent.parId[e.evenement_id];
    if (!ev) return { erreur: 'rendez-vous introuvable : relis l’agenda (outil agenda) pour avoir son evenement_id' };
    if (!exchangeAgendaPret()) return { erreur: 'agenda de l’office non relié (Réglages › Agenda et Outlook)' };
    if (e.action === 'supprimer' ? !evenementSupprimableAgenda(ev) : !evenementModifiableAgenda(ev)) {
      return { erreur: ev.option ? 'c’est une option d’un sondage de dates : elle se place ou s’annule depuis le sondage (Dates proposées), pas ici' : 'ce rendez-vous ne peut pas être modifié depuis CLAIRE (hors agenda de l’office, archive ou signature pas encore dans Outlook)' };
    }
    const quand = `${dateAvecJourFr(ev.date)}${ev.heure && !ev.journeeEntiere ? ' à ' + ev.heure.replace(':', ' h ') : ''}`;
    const titre = ev.sujet ? `« ${ev.sujet} »` : 'sans titre';
    const d = dossierDeEvenement(ev);
    const suit = d && typeof signatureSuitAgenda === 'function' && signatureSuitAgenda(d, ev);
    if (e.action === 'supprimer') {
      if (!(await demanderAutorisationAgent(`Supprimer le rendez-vous ${titre} du ${quand} de l’agenda de l’office (éléments supprimés d’Outlook, récupérable).${suit ? ' La date reste sur la fiche du dossier.' : ''}`))) return REFUS_AGENT;
      const r = await retirerEvenementAgenda(ev);
      afficherToast(r.message, 'OK', null);
      if (r.ok) noterPouvoirAgent('rendez-vous supprimé');
      return r.ok ? { fait: true } : { erreur: r.message };
    }
    let nouveau;
    let phrase;
    if (e.action === 'deplacer') {
      if (!dateIsoAgentValide(e.date)) return { erreur: 'date : AAAA-MM-JJ, une vraie date du calendrier' };
      if (ev.journeeEntiere) {
        const dateFin = dateFinDecaleeAgenda({ ...ev, journeeEntiere: false, dateFin: ev.dateFin }, e.date) || e.date;
        nouveau = { date: e.date, dateFin, journeeEntiere: true };
        phrase = `Déplacer le rendez-vous ${titre} (journée entière) du ${quand} au ${dateAvecJourFr(e.date)}.`;
      } else {
        if (!/^\d{2}:\d{2}$/.test(String(e.heure || ''))) return { erreur: 'heure : HH:MM' };
        const duree = ev.heure && ev.heureFin ? minutesHeure(ev.heureFin) - minutesHeure(ev.heure) : 60;
        const fin = /^\d{2}:\d{2}$/.test(String(e.heure_fin || '')) ? e.heure_fin : (() => { const m = minutesHeure(e.heure) + (duree > 0 ? duree : 60); return m >= 24 * 60 ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; })();
        if (!fin || fin <= e.heure) return { erreur: 'heure_fin : l’heure de fin doit suivre l’heure de début (même jour)' };
        nouveau = { date: e.date, heure: e.heure, heureFin: fin };
        const motif = motifCreneauExceptionnel(e.heure, minutesHeure(fin) - minutesHeure(e.heure), rendezVousHorairesJour((agendaEvenements || []).filter(x => x.itemId !== ev.itemId), e.date).length);
        phrase = `Déplacer le rendez-vous ${titre} du ${quand} au ${dateAvecJourFr(e.date)} de ${e.heure.replace(':', ' h ')} à ${fin.replace(':', ' h ')}.${motif ? ` Créneau exceptionnel : ${motif}.` : ''}${suit ? ' La fiche du dossier suit.' : ''}`;
      }
    } else if (e.action === 'renommer') {
      const sujet = String(e.titre || '').trim();
      if (!sujet || sujet.length > 200 || /\[à compléter\]/.test(sujet)) return { erreur: 'titre : le nouveau titre (200 caractères au plus)' };
      nouveau = ev.journeeEntiere ? { sujet, date: ev.date, dateFin: ev.dateFin || ev.date, journeeEntiere: true } : { sujet, date: ev.date, heure: ev.heure, heureFin: ev.heureFin || '' };
      phrase = `Renommer le rendez-vous ${titre} du ${quand} en « ${sujet} ».`;
    } else return { erreur: 'action : deplacer, renommer ou supprimer' };
    if (!(await demanderAutorisationAgent(phrase))) return REFUS_AGENT;
    const ok = await modifierEvenementAgenda(ev, nouveau);
    try { chargerAgendaSemaine(); } catch (err) { /* la page se relira */ }
    if (ok) noterPouvoirAgent('rendez-vous modifié');
    return ok ? { fait: true } : { erreur: 'la modification a échoué (voir le message affiché à l’utilisateur)' };
  }
