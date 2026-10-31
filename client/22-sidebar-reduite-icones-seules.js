  // ==== Sidebar réduite en icônes seules (demandé par l'étude) ====
  //
  // Étude, 30/09 au soir : l'épingle est retirée (« elle ne sert à rien ») ; l'état de la barre AU
  // DÉMARRAGE (ouverte ou fermée) est un réglage du collaborateur (Réglages › Général, préférence
  // `sidebarDemarrage` en base, cache local lu avant toute connexion). Le chevron replie ou déplie
  // la barre pour la séance seulement, sans changer ce réglage. Le groupe Outils est fermé à chaque
  // démarrage (« ferme le tiroir outils de base »). Sans rapport avec le repli mobile (sous 900 px,
  // la barre y est un panneau ouvert par le burger).
  // Barre repliée (étude, 06/10, sur un exemple) : le tiroir des outils reste DÉPLIÉ sous l'icône Outils — ses outils en icônes
  // seules dans un bloc arrondi ; plus de volet flottant au survol. Étude, 06/10 : plus de page « Outils » — un clic sur « Outils »
  // déplie ou replie le tiroir (barre ouverte comme repliée).
  var CLE_SIDEBAR_DEMARRAGE = 'claire-sidebar-demarrage';
  var SIDEBAR_DEMARRAGE = ['ouverte', 'fermee'];

  function sidebarDemarrage() {
    try {
      const v = localStorage.getItem(CLE_SIDEBAR_DEMARRAGE);
      if (SIDEBAR_DEMARRAGE.indexOf(v) !== -1) return v;
      // Ancien repli retenu par poste (avant ce réglage) : repris comme choix de départ.
      return localStorage.getItem('claire-sidebar-repliee') === '1' ? 'fermee' : 'ouverte';
    } catch (e) { return 'ouverte'; }
  }

  let sidebarReplieeSeance = null;   // état de la séance (null : celui du réglage de démarrage)
  // Tiroir des outils REPLIÉ à chaque démarrage (étude 18/10 : « repli le tiroir outil de base » ; ouvert de base depuis le 04/10) ;
  // un clic sur « Outils » ne change que la séance, rien n'est retenu. (Le 26/10 il a été ouvert par erreur : « le tiroir » de l'étude
  // était l'accès rapide aux discussions, toujours ouvert.)
  let groupeOutilsOuvertSeance = false;

  function sidebarRepliee() {
    return sidebarReplieeSeance === null ? sidebarDemarrage() === 'fermee' : sidebarReplieeSeance;
  }
  function groupeOutilsOuvert() {
    return groupeOutilsOuvertSeance;
  }

  // Point d'entrée unique qui pose l'état réel de la sidebar (classes CSS + icônes) — appelé au
  // démarrage et après chaque bascule.
  function appliquerEtatSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const reduite = sidebarRepliee();
    sidebar.classList.toggle('repliee', reduite);
    const btnCollapse = document.getElementById('sidebar-collapse-btn');
    const iconCollapse = document.getElementById('icon-sidebar-collapse');
    if (iconCollapse) iconCollapse.innerHTML = icone(reduite ? 'chevron-right' : 'chevron-left');
    if (btnCollapse) btnCollapse.title = reduite ? 'Agrandir la sidebar' : 'Réduire la sidebar';
    if (btnCollapse) btnCollapse.setAttribute('aria-label', reduite ? 'Agrandir la sidebar' : 'Réduire la sidebar');
    const ouvert = groupeOutilsOuvert();
    const sousMenu = document.getElementById('sidebar-sousmenu-outils');
    if (sousMenu) sousMenu.classList.toggle('ferme', !ouvert);
    masquerInfobulleSidebar();
    const chevronGroupe = document.getElementById('icon-groupe-outils-chevron');
    if (chevronGroupe) chevronGroupe.innerHTML = icone(ouvert ? 'chevron-up' : 'chevron-down');
    const btnGroupe = document.getElementById('tab-outils');
    if (btnGroupe) {
      btnGroupe.setAttribute('aria-expanded', String(ouvert));
      btnGroupe.setAttribute('aria-label', ouvert ? 'Outils : refermer le tiroir' : 'Outils : ouvrir le tiroir');
    }
    const choix = document.getElementById('reglages-sidebar-demarrage');
    if (choix) choix.value = sidebarDemarrage();
  }

  function toggleSidebarRepliee() {
    sidebarReplieeSeance = !sidebarRepliee();
    appliquerEtatSidebar();
  }

  // Réglages › Général : état de la barre au démarrage, appliqué tout de suite.
  function choisirSidebarDemarrage(valeur, enregistrer) {
    if (SIDEBAR_DEMARRAGE.indexOf(valeur) === -1) return;
    try { localStorage.setItem(CLE_SIDEBAR_DEMARRAGE, valeur); } catch (e) { /* cache local seulement */ }
    sidebarReplieeSeance = null;
    appliquerEtatSidebar();
    if (enregistrer !== false) enregistrerPreferenceCollaborateur({ sidebarDemarrage: valeur });
  }

  function toggleGroupeSidebar(nom) {
    if (nom !== 'outils') return;
    groupeOutilsOuvertSeance = !groupeOutilsOuvertSeance;
    appliquerEtatSidebar();
  }
  // Pour qui veut montrer les outils (assistant, ancien lien vers la page « Outils »).
  function ouvrirTiroirOutils() {
    groupeOutilsOuvertSeance = true;
    appliquerEtatSidebar();
  }

  // ---- Barre repliée (étude, 30/09, sur un exemple) : le nom de chaque icône dans une bulle sombre au survol. ----
  function sidebarReduiteBureau() {
    const s = document.getElementById('sidebar');
    return !!(s && s.classList.contains('repliee') && window.innerWidth > 900);
  }

  // Le libellé d'un bouton de la barre : son aria-label, sinon son texte propre (sans les pastilles).
  function libelleBoutonSidebar(el) {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const label = el.querySelector('.sidebar-groupe-label');
    if (label) return label.textContent.trim();
    return Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  }

  function infobulleSidebar() {
    let bulle = document.getElementById('sidebar-infobulle');
    if (!bulle) {
      bulle = document.createElement('div');
      bulle.id = 'sidebar-infobulle';
      bulle.className = 'sidebar-infobulle';
      bulle.setAttribute('role', 'tooltip');
      document.body.appendChild(bulle);
    }
    return bulle;
  }

  function afficherInfobulleSidebar(el) {
    const texte = libelleBoutonSidebar(el);
    if (!texte) return;
    const bulle = infobulleSidebar();
    bulle.textContent = texte;
    const r = el.getBoundingClientRect();
    bulle.style.left = `${Math.round(r.right + 12)}px`;
    bulle.style.top = `${Math.round(r.top + r.height / 2)}px`;
    bulle.classList.add('visible');
  }

  function masquerInfobulleSidebar() {
    const bulle = document.getElementById('sidebar-infobulle');
    if (bulle) bulle.classList.remove('visible');
  }

  var SELECTEUR_BOUTONS_SIDEBAR = '.sidebar-link, .sidebar-scan-bannette, .sidebar-icon-btn, .sidebar-groupe-titre';

  // Branché une fois au démarrage (délégation sur la barre).
  function initSidebarRepliee() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || sidebar.dataset.repliInit) return;
    sidebar.dataset.repliInit = '1';
    const cible = (e) => {
      const el = e.target.closest && e.target.closest(SELECTEUR_BOUTONS_SIDEBAR);
      if (!el) return null;
      // Barre ouverte : seule la bannette (icône sans texte) a besoin de sa bulle.
      if (!sidebarReduiteBureau() && !el.classList.contains('sidebar-scan-bannette')) return null;
      return el;
    };
    sidebar.addEventListener('mouseover', (e) => { const el = cible(e); if (el) afficherInfobulleSidebar(el); });
    sidebar.addEventListener('focusin', (e) => { const el = cible(e); if (el) afficherInfobulleSidebar(el); });
    sidebar.addEventListener('mouseout', (e) => {
      const el = e.target.closest && e.target.closest(SELECTEUR_BOUTONS_SIDEBAR);
      if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) masquerInfobulleSidebar();
    });
    sidebar.addEventListener('focusout', masquerInfobulleSidebar);
    sidebar.addEventListener('scroll', masquerInfobulleSidebar, { passive: true });
    window.addEventListener('resize', masquerInfobulleSidebar);
  }

  // Écran affiché, joint au contexte d'un signalement de problème (voir contexteSignalement).
  var ongletActuel = 'dashboard';
  var LIBELLES_ONGLETS = {
    dashboard: 'Tableau de bord', nouveau: 'Nouveau dossier', suivi: 'Suivi des dossiers',
    calculateur: 'Simulateur de provision', prorata: 'Prorata & répartitions', 'appel-fonds': 'Appel de fonds',
    scans: 'Claire Scan', inventaire: 'Arbitrage forfait mobilier', quotites: "Quotités d'acquisition", preemption: 'Contrôle de l’urbanisme', confreres: 'Répertoire', 'clients-biens': 'Clients et biens',
    reglages: 'Réglages', assistant: 'Discussions', agenda: 'Agenda', constitution: 'Constitution de dossier', autorisations: 'Autor. déblocage/transf.', 'decompte-vendeur': 'Décompte vendeur'
  };

  // L'écran `nom` est-il celui qu'on voit ? Faux quand une fiche s'affiche en page par-dessus (onglets, 11/10) : les raccourcis
  // clavier d'un écran (Ctrl+V de l'agenda, Suppr, Ctrl+S de « Nouveau dossier ») ne doivent pas agir derrière la fiche.
  // Fiche à côté : l'écran est visible, mais un raccourci ne joue pas quand on vient d'agir dans la fiche (focusDansFicheCote).
  function ecranAffiche(nom) {
    return ongletActuel === nom && !document.body.classList.contains('fiche-en-page') && !focusDansFicheCote();
  }

  // Classes d'impression des écrans qui impriment une feuille (Ctrl+P) : jamais posées quand la fiche s'affiche par-dessus,
  // sinon Ctrl+P sortirait l'écran caché (ou une page blanche) au lieu de la fiche.
  function majClassesImpressionEcran() {
    const pageFiche = document.body.classList.contains('fiche-en-page');
    ['appel-fonds', 'inventaire'].forEach(n => document.body.classList.toggle('onglet-' + n + '-actif', ongletActuel === n && !pageFiche));
  }

  function definirOnglet(nom) {
    // Plus de page « Outils » (étude, 06/10) : un ancien lien déplie le tiroir et mène au tableau de bord.
    if (nom === 'outils') { ouvrirTiroirOutils(); nom = 'dashboard'; }
    // Page « Aujourd'hui » retirée (étude, 30/09) : un ancien lien mène au tableau de bord.
    if (nom === 'aujourdhui') nom = 'dashboard';
    // L'ancien outil « Relecture d'actes » (retiré le 18/10) : la relecture se demande à CLAIRE.
    if (nom === 'analyse-ia') nom = 'assistant';
    // « Noms de fichiers du NAS » est une rubrique des Réglages depuis le 03/10 (étude) : un ancien lien y mène.
    if (nom === 'noms-nas') { definirOnglet('reglages'); definirSousOngletReglages('noms-nas'); return; }
    // Écrans réservés à l'administrateur (client/23-suivi.js) : tout autre collaborateur revient au tableau de bord.
    if (ongletReserve(nom, utilisateurPoste)) nom = 'dashboard';
    // Une fiche affichée en page (client/60-onglets-travail.js) laisse la place à l'écran choisi ; son onglet reste.
    // Une fiche ancrée à côté (étape 3) reste : c'est tout l'intérêt de l'ouvrir à côté d'un outil.
    if (dossierOuvert && !ficheACoteActive()) fermerDossierDrawer();
    // Un outil monté dans le panneau de « Demander à CLAIRE » (client/99) retourne à sa place avant d'être affiché comme onglet.
    if (typeof demonterOutilAssistant === 'function') demonterOutilAssistant(nom);
    ongletActuel = nom;
    noterOngletEcran(nom);
    renderOngletsTravail();
    // Barre d'étapes d'un outil (client/44-presentation-outils.js) : à jour dès l'arrivée sur l'écran.
    if (typeof ETAPES_OUTILS !== 'undefined' && ETAPES_OUTILS[nom]) setTimeout(() => majSommaireOutil(nom), 0);
    // Sur mobile, choisir une section referme la sidebar repliable (voir toggleSidebarMobile).
    toggleSidebarMobile(false);
    document.getElementById('onglet-dashboard').style.display = nom === 'dashboard' ? '' : 'none';
    document.getElementById('onglet-nouveau').style.display = nom === 'nouveau' ? '' : 'none';
    document.getElementById('onglet-suivi').style.display = nom === 'suivi' ? '' : 'none';
    document.getElementById('onglet-agenda').style.display = nom === 'agenda' ? '' : 'none';
    document.getElementById('onglet-scans').style.display = nom === 'scans' ? '' : 'none';
    document.getElementById('onglet-calculateur').style.display = nom === 'calculateur' ? '' : 'none';
    document.getElementById('onglet-prorata').style.display = nom === 'prorata' ? '' : 'none';
    document.getElementById('onglet-appel-fonds').style.display = nom === 'appel-fonds' ? '' : 'none';
    document.getElementById('onglet-inventaire').style.display = nom === 'inventaire' ? '' : 'none';
    document.getElementById('onglet-constitution').style.display = nom === 'constitution' ? '' : 'none';
    document.getElementById('onglet-autorisations').style.display = nom === 'autorisations' ? '' : 'none';
    document.getElementById('onglet-decompte-vendeur').style.display = nom === 'decompte-vendeur' ? '' : 'none';
    document.getElementById('onglet-quotites').style.display = nom === 'quotites' ? '' : 'none';
    document.getElementById('onglet-preemption').style.display = nom === 'preemption' ? '' : 'none';
    document.getElementById('onglet-confreres').style.display = nom === 'confreres' ? '' : 'none';
    document.getElementById('onglet-clients-biens').style.display = nom === 'clients-biens' ? '' : 'none';
    document.getElementById('onglet-reglages').style.display = nom === 'reglages' ? '' : 'none';
    document.getElementById('onglet-assistant').style.display = nom === 'assistant' ? '' : 'none';
    document.getElementById('tab-assistant').classList.toggle('actif', nom === 'assistant');
    majAccesRapideCanaux();
    if (nom === 'assistant') initAssistant();
    document.getElementById('tab-dashboard').setAttribute('aria-selected', String(nom === 'dashboard'));
    document.getElementById('tab-suivi').setAttribute('aria-selected', String(nom === 'suivi'));
    document.getElementById('tab-agenda').setAttribute('aria-selected', String(nom === 'agenda'));
    document.getElementById('tab-scans').setAttribute('aria-selected', String(nom === 'scans'));
    document.getElementById('tab-calculateur').setAttribute('aria-selected', String(nom === 'calculateur'));
    document.getElementById('tab-prorata').setAttribute('aria-selected', String(nom === 'prorata'));
    document.getElementById('tab-appel-fonds').setAttribute('aria-selected', String(nom === 'appel-fonds'));
    document.getElementById('tab-inventaire').setAttribute('aria-selected', String(nom === 'inventaire'));
    document.getElementById('tab-constitution').setAttribute('aria-selected', String(nom === 'constitution'));
    document.getElementById('tab-autorisations').setAttribute('aria-selected', String(nom === 'autorisations'));
    document.getElementById('tab-decompte-vendeur').setAttribute('aria-selected', String(nom === 'decompte-vendeur'));
    document.getElementById('tab-quotites').setAttribute('aria-selected', String(nom === 'quotites'));
    document.getElementById('tab-preemption').setAttribute('aria-selected', String(nom === 'preemption'));
    document.getElementById('tab-confreres').setAttribute('aria-selected', String(nom === 'confreres'));
    document.getElementById('tab-clients-biens').setAttribute('aria-selected', String(nom === 'clients-biens'));
    document.getElementById('tab-reglages').setAttribute('aria-selected', String(nom === 'reglages'));
    document.getElementById('tab-dashboard').classList.toggle('actif', nom === 'dashboard');
    document.getElementById('tab-suivi').classList.toggle('actif', nom === 'suivi');
    document.getElementById('tab-agenda').classList.toggle('actif', nom === 'agenda');
    document.getElementById('tab-scans').classList.toggle('actif', nom === 'scans');
    document.getElementById('tab-calculateur').classList.toggle('actif', nom === 'calculateur');
    document.getElementById('tab-prorata').classList.toggle('actif', nom === 'prorata');
    document.getElementById('tab-appel-fonds').classList.toggle('actif', nom === 'appel-fonds');
    document.getElementById('tab-inventaire').classList.toggle('actif', nom === 'inventaire');
    document.getElementById('tab-constitution').classList.toggle('actif', nom === 'constitution');
    document.getElementById('tab-autorisations').classList.toggle('actif', nom === 'autorisations');
    document.getElementById('tab-decompte-vendeur').classList.toggle('actif', nom === 'decompte-vendeur');
    document.getElementById('tab-quotites').classList.toggle('actif', nom === 'quotites');
    document.getElementById('tab-preemption').classList.toggle('actif', nom === 'preemption');
    document.getElementById('tab-confreres').classList.toggle('actif', nom === 'confreres');
    document.getElementById('tab-clients-biens').classList.toggle('actif', nom === 'clients-biens');
    if (nom === 'clients-biens') initClientsBiens();
    // Ctrl+P depuis cet onglet doit sortir la FEUILLE, pas l'application autour (voir @media
    // print dans style.css) — un onglet n'ayant pas de classe sur <body>, on la pose ici.
    majClassesImpressionEcran();
    // Même raison pour l'arbitrage du forfait mobilier : Ctrl+P doit sortir la note de calcul,
    // pas les cartes de saisie autour (voir @media print dans style.css).
    // Relecture d'actes : Ctrl+P sort le compte rendu A4 (#relecture-cr-print), pas l'écran (étude 06/10).
    document.getElementById('tab-reglages').classList.toggle('actif', nom === 'reglages');
    if (nom === 'suivi') { appliquerFiltreSuiviCollaborateur(); initBarreSuiviCollee(); if (!plusFiltresSuiviRestaure) { plusFiltresSuiviRestaure = true; restaurerPlusFiltresSuivi(); } }
    // Relu à chaque retour sur le tableau de bord : un rappel ajouté depuis un autre poste.
    if (nom === 'dashboard' && typeof chargerRappelsPerso === 'function' && authToken) chargerRappelsPerso();
    if (nom === 'dashboard' && authToken) chargerAbsencesOffice();
    // Le widget Agenda relit l'agenda de l'office à chaque retour (un rendez-vous a pu être posé depuis).
    if (nom === 'dashboard') agendaWidget.t = 0;
    if (nom === 'suivi' || nom === 'dashboard') render();
    // Vérifiée à chaque ouverture (appel léger) plutôt qu'une fois pour toutes : Ollama a pu être
    // installé/démarré/arrêté sur le serveur depuis la dernière visite de cet onglet.
    // Réglages relus à chaque ouverture (un collègue a pu les modifier depuis un autre poste,
    // même principe que la disponibilité d'Ollama ci-dessus).
    if (nom === 'reglages') { renderReglagesScans(); chargerScans(); definirSousOngletReglages(sousOngletReglagesRetenu()); chargerReglages(); chargerReglagesClaude(); chargerReglagesAssistant(); chargerReglagesExchange(); chargerSignalements(); renderReglagesSignatureImages(true); }
    // Date du jour et bornes de période posées au premier affichage seulement (voir initProrata).
    if (nom === 'prorata') initProrata();
    if (nom === 'scans') initScans();
    // Agenda relu à chaque ouverture (tour de lecture du serveur toutes les 2 min), absences comprises.
    if (nom === 'agenda') { if (authToken) chargerAbsencesOffice(); initAgenda(); }
    if (nom !== 'agenda') renderModaleAgenda();
    // Date du jour, tableau vierge et chargement du modèle Word au premier affichage (voir
    // initAppelFonds) — puis seulement le chargement du modèle aux visites suivantes.
    if (nom === 'appel-fonds') initAppelFonds();
    // Formulaire des quotités construit au premier affichage seulement : le quitter puis y revenir
    // ne doit pas effacer une saisie en cours.
    if (nom === 'quotites') initQuotites();
    // Relu à chaque ouverture : un collègue a pu compléter le carnet depuis un autre poste.
    if (nom === 'confreres') { renderCarnetConfreres(); if (authToken) { chargerCarnetConfreres(); chargerRepertoire(); chargerAnnuaireDepartements(); } }
    // Premier passage : coûts habituels posés, droits vides — le verdict et le message d'invite
    // sont posés dans la foulée (voir initInventaire / reinitialiserInventaire).
    if (nom === 'inventaire') initInventaire();
    if (nom === 'preemption') initPreemption();
    if (nom === 'constitution') initConstitution();
    if (nom === 'autorisations') initAutorisationsSuccession();
    if (nom === 'decompte-vendeur') initDecompteVendeur();
    if (typeof reafficherOutilsMontesAssistant === 'function') reafficherOutilsMontesAssistant(nom);
  }
