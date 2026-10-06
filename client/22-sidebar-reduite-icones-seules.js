  // ==== Sidebar réduite en icônes seules (demandé par l'étude) ====
  //
  // Étude, 30/09 au soir : l'épingle est retirée (« elle ne sert à rien ») ; l'état de la barre AU
  // DÉMARRAGE (ouverte ou fermée) est un réglage du collaborateur (Réglages › Général, préférence
  // `sidebarDemarrage` en base, cache local lu avant toute connexion). Le chevron replie ou déplie
  // la barre pour la séance seulement, sans changer ce réglage. Le groupe Outils est fermé à chaque
  // démarrage (« ferme le tiroir outils de base »). Sans rapport avec le repli mobile (sous 900 px,
  // la barre y est un panneau ouvert par le burger).
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
  // Tiroir des outils ouvert à chaque démarrage (étude, 04/10 : « remets le tiroir des outils ouvert de base ») ; le + / −
  // ne change que la séance, rien n'est retenu.
  let groupeOutilsOuvertSeance = true;

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
    if (sousMenu) sousMenu.classList.toggle('ferme', !ouvert && !reduite);
    if (!reduite) fermerVoletOutils(0);
    masquerInfobulleSidebar();
    const chevronGroupe = document.getElementById('icon-groupe-outils-chevron');
    if (chevronGroupe) chevronGroupe.innerHTML = icone(ouvert ? 'minus' : 'plus');
    const btnGroupe = document.getElementById('sidebar-groupe-outils');
    if (btnGroupe) {
      btnGroupe.setAttribute('aria-expanded', String(ouvert));
      const lib = ouvert ? 'Refermer les outils dans la barre' : 'Afficher les outils dans la barre';
      btnGroupe.title = lib;
      btnGroupe.setAttribute('aria-label', lib);
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
    // Barre repliée : le groupe s'ouvre en volet flottant à droite de son icône.
    // Le clic l'ouvre toujours (le survol vient souvent de l'ouvrir) ; il se ferme en sortant du
    // volet, par un clic ailleurs ou par Échap.
    if (sidebarReduiteBureau()) { ouvrirVoletOutils(); return; }
    groupeOutilsOuvertSeance = !groupeOutilsOuvertSeance;
    appliquerEtatSidebar();
  }

  // ---- Barre repliée (étude, 30/09, sur un exemple) : le nom de chaque icône dans une bulle sombre
  // au survol, et le groupe Outils en volet flottant (arborescence, outil ouvert surligné). ----
  function sidebarReduiteBureau() {
    const s = document.getElementById('sidebar');
    return !!(s && s.classList.contains('repliee') && window.innerWidth > 900);
  }

  let voletOutilsMinuteur = null;
  function ouvrirVoletOutils() {
    // Ancré sur le lien « Outils » (le + est masqué quand la barre est repliée).
    const titre = document.getElementById('tab-outils');
    const menu = document.getElementById('sidebar-sousmenu-outils');
    const sidebar = document.getElementById('sidebar');
    if (!titre || !menu || !sidebarReduiteBureau()) return;
    clearTimeout(voletOutilsMinuteur);
    sidebar.classList.add('volet-ouvert');
    menu.classList.add('volet-ouvert');
    titre.classList.add('volet-ouvert');
    // Étude, 30/09 : le volet se place SOUS l'icône Outils (bord gauche aligné sur elle), l'icône
    // restant marquée ouverte avec son nom dans la bulle à côté ; au-dessus seulement s'il manque
    // la place en bas de l'écran.
    const r = titre.getBoundingClientRect();
    const h = menu.offsetHeight;
    const dessous = r.bottom + 8;
    const top = dessous + h + 12 <= window.innerHeight ? dessous : Math.max(12, r.top - 8 - h);
    menu.style.left = `${Math.round(r.left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    afficherInfobulleSidebar(titre);
  }

  function fermerVoletOutils(delai) {
    clearTimeout(voletOutilsMinuteur);
    const fermer = () => {
      const menu = document.getElementById('sidebar-sousmenu-outils');
      const sidebar = document.getElementById('sidebar');
      if (menu) { menu.classList.remove('volet-ouvert'); menu.style.left = ''; menu.style.top = ''; }
      if (sidebar) sidebar.classList.remove('volet-ouvert');
      const titre = document.getElementById('tab-outils');
      if (titre) titre.classList.remove('volet-ouvert');
      masquerInfobulleSidebar();
    };
    if (delai) voletOutilsMinuteur = setTimeout(fermer, delai); else fermer();
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

  // Branché une fois au démarrage (délégation sur la barre).
  function initSidebarRepliee() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || sidebar.dataset.repliInit) return;
    sidebar.dataset.repliInit = '1';
    const cible = (e) => {
      const el = e.target.closest && e.target.closest('.sidebar-link, .sidebar-scan-bannette, .sidebar-icon-btn, .sidebar-groupe-titre');
      if (!el || el.closest('.sidebar-sousmenu.volet-ouvert')) return null;
      // Barre ouverte : seule la bannette (icône sans texte) a besoin de sa bulle.
      if (!sidebarReduiteBureau() && !el.classList.contains('sidebar-scan-bannette')) return null;
      return el;
    };
    const survol = (e) => {
      const el = cible(e);
      if (!el) return;
      if (el.id === 'tab-outils') { ouvrirVoletOutils(); return; }
      afficherInfobulleSidebar(el);
    };
    sidebar.addEventListener('mouseover', survol);
    sidebar.addEventListener('focusin', (e) => { const el = cible(e); if (el && el.id !== 'tab-outils') afficherInfobulleSidebar(el); });
    sidebar.addEventListener('mouseout', (e) => {
      const el = e.target.closest && e.target.closest('.sidebar-link, .sidebar-scan-bannette, .sidebar-icon-btn, .sidebar-groupe-titre');
      // Le nom de l'icône Outils reste affiché tant que son volet est ouvert.
      const voletOuvert = el && el.id === 'tab-outils' && el.classList.contains('volet-ouvert');
      if (el && !voletOuvert && !(e.relatedTarget && el.contains(e.relatedTarget))) masquerInfobulleSidebar();
      const titre = document.getElementById('tab-outils');
      const menu = document.getElementById('sidebar-sousmenu-outils');
      const vers = e.relatedTarget;
      if (menu && menu.classList.contains('volet-ouvert') && !(vers && (menu.contains(vers) || (titre && titre.contains(vers))))) {
        if ((titre && titre.contains(e.target)) || menu.contains(e.target)) fermerVoletOutils(250);
      }
    });
    sidebar.addEventListener('focusout', (e) => { if (!(e.target.classList && e.target.classList.contains('volet-ouvert'))) masquerInfobulleSidebar(); });
    sidebar.addEventListener('scroll', () => { masquerInfobulleSidebar(); fermerVoletOutils(0); }, { passive: true });
    const menu = document.getElementById('sidebar-sousmenu-outils');
    if (menu) {
      menu.addEventListener('mouseenter', () => clearTimeout(voletOutilsMinuteur));
      // Un outil choisi : le volet se referme.
      menu.addEventListener('click', (e) => { if (menu.classList.contains('volet-ouvert') && e.target.closest('.sidebar-link')) fermerVoletOutils(0); });
    }
    document.addEventListener('click', (e) => {
      const m = document.getElementById('sidebar-sousmenu-outils');
      if (m && m.classList.contains('volet-ouvert') && !e.target.closest('#sidebar-sousmenu-outils, #tab-outils')) fermerVoletOutils(0);
    });
    document.addEventListener('keydown', (e) => {
      const m = document.getElementById('sidebar-sousmenu-outils');
      if (e.key === 'Escape' && m && m.classList.contains('volet-ouvert')) fermerVoletOutils(0);
    });
    window.addEventListener('resize', () => { masquerInfobulleSidebar(); fermerVoletOutils(0); });
  }

  // ---- Page Outils (étude, 01/10) : chaque outil en grosse icône, avec ce qu'il fait. ----
  var OUTILS_PAGE = [
    { onglet: 'appel-fonds', titre: 'Appel de fonds', icone: 'mail', description: 'Le courrier de convocation et le décompte des sommes à virer.' },
    { onglet: 'calculateur', titre: 'Simulateur de provision', icone: 'banknote', description: 'Une estimation des frais d’acte à demander.' },
    { onglet: 'prorata', titre: 'Prorata & répartitions', icone: 'part-disque', description: 'Taxe foncière, charges de copropriété, loyers au jour de l’acte.' },
    { onglet: 'quotites', titre: 'Quotités d’acquisition', icone: 'users', description: 'La part de chaque acquéreur et l’annexe des quotités.' },
    { onglet: 'preemption', titre: 'Droits de préemption', icone: 'shield', description: 'DPU, SAFER, bois et forêts selon le zonage de la parcelle et le bien vendu.' },
    { onglet: 'inventaire', titre: 'Arbitrage forfait mobilier', icone: 'scale', description: 'Forfait de 5 % ou prisée d’un commissaire de justice.' },
    { onglet: 'confreres', titre: 'Répertoire', icone: 'book', description: 'Les offices du département et les interlocuteurs de l’étude.' },
    { onglet: 'analyse-ia', titre: 'Relecture d’actes', icone: 'eye', description: 'Un avant-contrat ou un projet relu contre ses pièces (alpha).' }
  ];

  function renderPageOutils() {
    const grille = document.getElementById('outils-grille');
    if (!grille) return;
    grille.innerHTML = OUTILS_PAGE.map(o => `
      <button type="button" class="outil-tuile" onclick="definirOnglet('${o.onglet}')">
        <span class="outil-tuile-icone" aria-hidden="true">${icone(o.icone)}</span>
        <span class="outil-tuile-titre">${escapeHtml(o.titre)}</span>
        <span class="outil-tuile-texte">${escapeHtml(o.description)}</span>
      </button>`).join('');
  }

  // Écran affiché, joint au contexte d'un signalement de problème (voir contexteSignalement).
  var ongletActuel = 'dashboard';
  var LIBELLES_ONGLETS = {
    dashboard: 'Tableau de bord', nouveau: 'Nouveau dossier', suivi: 'Suivi des dossiers',
    calculateur: 'Simulateur de provision', prorata: 'Prorata & répartitions', 'appel-fonds': 'Appel de fonds',
    scans: 'Claire Scan', inventaire: 'Arbitrage forfait mobilier', quotites: "Quotités d'acquisition", preemption: 'Droits de préemption', confreres: 'Répertoire', 'analyse-ia': "Relecture d'actes",
    reglages: 'Réglages', outils: 'Outils', assistant: 'Demander à CLAIRE'
  };

  function definirOnglet(nom) {
    // Page « Aujourd'hui » retirée (étude, 30/09) : un ancien lien mène au tableau de bord.
    if (nom === 'aujourdhui') nom = 'dashboard';
    // « Noms de fichiers du NAS » est une rubrique des Réglages depuis le 03/10 (étude) : un ancien lien y mène.
    if (nom === 'noms-nas') { definirOnglet('reglages'); definirSousOngletReglages('noms-nas'); return; }
    ongletActuel = nom;
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
    document.getElementById('onglet-quotites').style.display = nom === 'quotites' ? '' : 'none';
    document.getElementById('onglet-preemption').style.display = nom === 'preemption' ? '' : 'none';
    document.getElementById('onglet-confreres').style.display = nom === 'confreres' ? '' : 'none';
    document.getElementById('onglet-analyse-ia').style.display = nom === 'analyse-ia' ? '' : 'none';
    document.getElementById('onglet-reglages').style.display = nom === 'reglages' ? '' : 'none';
    document.getElementById('onglet-outils').style.display = nom === 'outils' ? '' : 'none';
    document.getElementById('onglet-assistant').style.display = nom === 'assistant' ? '' : 'none';
    document.getElementById('tab-assistant').setAttribute('aria-selected', String(nom === 'assistant'));
    document.getElementById('tab-assistant').classList.toggle('actif', nom === 'assistant');
    if (nom === 'assistant') initAssistant();
    document.getElementById('tab-outils').setAttribute('aria-selected', String(nom === 'outils'));
    document.getElementById('tab-outils').classList.toggle('actif', nom === 'outils');
    if (nom === 'outils') renderPageOutils();
    document.getElementById('tab-dashboard').setAttribute('aria-selected', String(nom === 'dashboard'));
    document.getElementById('tab-suivi').setAttribute('aria-selected', String(nom === 'suivi'));
    document.getElementById('tab-agenda').setAttribute('aria-selected', String(nom === 'agenda'));
    document.getElementById('tab-scans').setAttribute('aria-selected', String(nom === 'scans'));
    document.getElementById('tab-calculateur').setAttribute('aria-selected', String(nom === 'calculateur'));
    document.getElementById('tab-prorata').setAttribute('aria-selected', String(nom === 'prorata'));
    document.getElementById('tab-appel-fonds').setAttribute('aria-selected', String(nom === 'appel-fonds'));
    document.getElementById('tab-inventaire').setAttribute('aria-selected', String(nom === 'inventaire'));
    document.getElementById('tab-quotites').setAttribute('aria-selected', String(nom === 'quotites'));
    document.getElementById('tab-preemption').setAttribute('aria-selected', String(nom === 'preemption'));
    document.getElementById('tab-confreres').setAttribute('aria-selected', String(nom === 'confreres'));
    document.getElementById('tab-analyse-ia').setAttribute('aria-selected', String(nom === 'analyse-ia'));
    document.getElementById('tab-reglages').setAttribute('aria-selected', String(nom === 'reglages'));
    document.getElementById('tab-dashboard').classList.toggle('actif', nom === 'dashboard');
    document.getElementById('tab-suivi').classList.toggle('actif', nom === 'suivi');
    document.getElementById('tab-agenda').classList.toggle('actif', nom === 'agenda');
    document.getElementById('tab-scans').classList.toggle('actif', nom === 'scans');
    document.getElementById('tab-calculateur').classList.toggle('actif', nom === 'calculateur');
    document.getElementById('tab-prorata').classList.toggle('actif', nom === 'prorata');
    document.getElementById('tab-appel-fonds').classList.toggle('actif', nom === 'appel-fonds');
    document.getElementById('tab-inventaire').classList.toggle('actif', nom === 'inventaire');
    document.getElementById('tab-quotites').classList.toggle('actif', nom === 'quotites');
    document.getElementById('tab-preemption').classList.toggle('actif', nom === 'preemption');
    document.getElementById('tab-confreres').classList.toggle('actif', nom === 'confreres');
    // Ctrl+P depuis cet onglet doit sortir la FEUILLE, pas l'application autour (voir @media
    // print dans style.css) — un onglet n'ayant pas de classe sur <body>, on la pose ici.
    document.body.classList.toggle('onglet-appel-fonds-actif', nom === 'appel-fonds');
    // Même raison pour l'arbitrage du forfait mobilier : Ctrl+P doit sortir la note de calcul,
    // pas les cartes de saisie autour (voir @media print dans style.css).
    document.body.classList.toggle('onglet-inventaire-actif', nom === 'inventaire');
    // Relecture d'actes : Ctrl+P sort le compte rendu A4 (#relecture-cr-print), pas l'écran (étude 06/10).
    document.body.classList.toggle('onglet-analyse-ia-actif', nom === 'analyse-ia');
    document.getElementById('tab-analyse-ia').classList.toggle('actif', nom === 'analyse-ia');
    document.getElementById('tab-reglages').classList.toggle('actif', nom === 'reglages');
    if (nom === 'suivi') appliquerFiltreSuiviCollaborateur();
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
    if (nom === 'reglages') { renderReglagesScans(); chargerScans(); definirSousOngletReglages(sousOngletReglagesRetenu()); chargerReglages(); chargerReglagesClaude(); chargerReglagesExchange(); chargerSignalements(); renderReglagesSignatureImages(true); }
    if (nom === 'analyse-ia') initRelecture();
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
  }
