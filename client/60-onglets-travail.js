  // ---- Onglets de travail (étude 11/10 : « un système d'onglets pour naviguer dans les dossiers et les outils », maquette
  // docs/maquettes-espace/) : chaque fiche ouverte et chaque outil ouvert devient un onglet en haut de la page ; on passe de
  // l'un à l'autre, on ferme d'un ×, on réordonne en glissant. La barre latérale garde le tableau de bord, le Suivi,
  // l'Agenda, « Demander à CLAIRE » et les Réglages (jamais des onglets). La fiche s'affiche en PAGE (plus de tiroir sur un
  // fond grisé) : `body.fiche-en-page` masque l'écran courant, qu'on retrouve en fermant la fiche. Onglets gardés par poste
  // dans le navigateur (simple commodité : perdus, rien ne casse). ----

  // Écrans qui deviennent un onglet quand on les ouvre : les outils du tiroir.
  // Tout écran sauf le tableau de bord peut être un onglet (étude 12/10 : « laisser la possibilité de tout mettre en onglet :
  // demander à CLAIRE, Claire Scan, réglages… ») : Suivi, Agenda, Nouveau dossier, Claire Scan, Demander à CLAIRE, Réglages et
  // les outils.
  var OUTILS_ONGLETS_TRAVAIL = ['suivi', 'agenda', 'nouveau', 'scans', 'assistant', 'reglages',
    'appel-fonds', 'constitution', 'inventaire', 'preemption', 'prorata', 'quotites', 'confreres', 'calculateur', 'analyse-ia'];
  var MAX_ONGLETS_TRAVAIL = 12;
  var CLE_ONGLETS_TRAVAIL = 'claire-onglets-travail';
  let ongletsTravail = [];        // [{ type: 'dossier', id } | { type: 'outil', nom }], dans l'ordre affiché
  let ongletTravailGlisse = -1;

  function cleOngletTravail(o) { return o.type === 'dossier' ? 'd:' + o.id : 'o:' + o.nom; }

  // Pure : la liste après ouverture de `o` — ajouté à la fin s'il n'y est pas ; au-delà du maximum, le plus ancien qui n'est
  // ni `o` ni l'onglet actif est retiré.
  function ajouterOngletTravailListe(liste, o, cleActive) {
    const cle = cleOngletTravail(o);
    if ((liste || []).some(x => cleOngletTravail(x) === cle)) return liste.slice();
    const res = (liste || []).concat([o]);
    while (res.length > MAX_ONGLETS_TRAVAIL) {
      const k = res.findIndex(x => cleOngletTravail(x) !== cle && cleOngletTravail(x) !== cleActive);
      if (k < 0) break;
      res.splice(k, 1);
    }
    return res;
  }

  // Pure : l'onglet à activer quand on ferme celui d'index k (le suivant, sinon le précédent, sinon aucun).
  function voisinOngletTravail(liste, k) {
    if (!liste || liste.length <= 1) return null;
    return liste[k + 1] || liste[k - 1] || null;
  }

  // Pure : la liste nettoyée au chargement — formes valides, dossiers qui existent encore, outils connus, sans doublon.
  function ongletsTravailValides(liste, idsDossiers) {
    const vus = new Set();
    return (Array.isArray(liste) ? liste : []).filter(o => {
      if (!o || (o.type !== 'dossier' && o.type !== 'outil')) return false;
      if (o.type === 'dossier' && !(idsDossiers || []).includes(o.id)) return false;
      if (o.type === 'outil' && !OUTILS_ONGLETS_TRAVAIL.includes(o.nom)) return false;
      const cle = cleOngletTravail(o);
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    }).map(o => o.type === 'dossier' ? { type: 'dossier', id: o.id } : { type: 'outil', nom: o.nom }).slice(0, MAX_ONGLETS_TRAVAIL);
  }

  // Pure : la liste avec l'élément d'index `de` déplacé à l'index `vers`.
  function deplacerOngletTravailListe(liste, de, vers) {
    const res = (liste || []).slice();
    if (de < 0 || de >= res.length || vers < 0 || vers >= res.length || de === vers) return res;
    const [el] = res.splice(de, 1);
    res.splice(vers, 0, el);
    return res;
  }

  function cleOngletTravailActif() {
    if (dossierOuvert && !ficheACoteActive()) return 'd:' + dossierOuvert;
    return OUTILS_ONGLETS_TRAVAIL.includes(ongletActuel) ? 'o:' + ongletActuel : '';
  }

  function enregistrerOngletsTravail() {
    try { ecrireLocal(CLE_ONGLETS_TRAVAIL, JSON.stringify(ongletsTravail)); } catch (e) { /* stockage indisponible : onglets non gardés */ }
  }

  let ongletsTravailRestaures = false;
  function restaurerOngletsTravail() {
    if (ongletsTravailRestaures || !Array.isArray(dossiers) || !dossiers.length) return;
    ongletsTravailRestaures = true;
    let lus = [];
    try { lus = JSON.parse(localStorage.getItem(CLE_ONGLETS_TRAVAIL) || '[]'); } catch (e) { lus = []; }
    const restes = ongletsTravailValides(lus, dossiers.map(d => d.id));
    // Un onglet ouvert avant le chargement des dossiers est gardé à sa place.
    ongletsTravail.forEach(o => { if (!restes.some(x => cleOngletTravail(x) === cleOngletTravail(o))) restes.push(o); });
    ongletsTravail = restes.slice(0, MAX_ONGLETS_TRAVAIL);
  }

  function noterOngletTravail(o) {
    restaurerOngletsTravail();
    ongletsTravail = ajouterOngletTravailListe(ongletsTravail, o, cleOngletTravail(o));
    enregistrerOngletsTravail();
  }

  // Appelée par ouvrirDossierDrawer et definirOnglet.
  function noterOngletDossier(id) { if (id) noterOngletTravail({ type: 'dossier', id }); }
  function noterOngletEcran(nom) { if (OUTILS_ONGLETS_TRAVAIL.includes(nom)) noterOngletTravail({ type: 'outil', nom }); }

  function activerOngletTravail(k) {
    const o = ongletsTravail[k];
    if (!o) return;
    // L'onglet déjà affiché : rien (rouvrir la fiche la remettrait sur « Tableau » et fermerait un formulaire en cours).
    if (cleOngletTravail(o) === cleOngletTravailActif()) return;
    // L'onglet de la fiche ancrée à côté : elle repasse en pleine page.
    if (o.type === 'dossier' && o.id === dossierOuvert && ficheACoteActive()) { pleinEcranFiche(); return; }
    if (o.type === 'dossier') { ouvrirDossierDrawer(o.id); return; }
    definirOnglet(o.nom);   // ferme la fiche affichée en page (voir definirOnglet)
  }

  function fermerOngletTravail(k, event) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    const o = ongletsTravail[k];
    if (!o) return;
    const actif = cleOngletTravail(o) === cleOngletTravailActif();
    const voisin = actif ? voisinOngletTravail(ongletsTravail, k) : null;
    ongletsTravail.splice(k, 1);
    enregistrerOngletsTravail();
    // Fermer l'onglet de la fiche ancrée à côté ferme la fiche.
    if (!actif && o.type === 'dossier' && o.id === dossierOuvert) { fermerDossierDrawer(); return; }
    // Fiche à côté et outil affiché fermé : la fiche reste dans son volet, l'écran passe à l'outil voisin ou au tableau de bord.
    if (actif && o.type === 'outil' && ficheACoteActive()) {
      const outil = voisin && voisin.type === 'outil' ? voisin : ongletsTravail.find(x => x.type === 'outil');
      definirOnglet(outil ? outil.nom : 'dashboard');
      return;
    }
    if (actif) {
      // L'outil fermé ne doit pas rester l'écran caché sous la fiche voisine : le tableau de bord le remplace.
      if (voisin && voisin.type === 'dossier') { if (o.type === 'outil') definirOnglet('dashboard'); ouvrirDossierDrawer(voisin.id); return; }
      if (voisin) { definirOnglet(voisin.nom); return; }
      if (o.type === 'dossier') fermerDossierDrawer();
      else definirOnglet('dashboard');
      return;
    }
    renderOngletsTravail();
  }

  function libelleOngletTravail(o) {
    if (o.type === 'outil') return LIBELLES_ONGLETS[o.nom] || o.nom;
    const d = dossiers.find(x => x.id === o.id);
    return d ? libelleDossierAffiche(d) : 'Dossier';
  }

  // Couleur du point d'un onglet de dossier : celle de son statut (mêmes classes que le badge du Suivi).
  function classeEtatOngletTravail(d) {
    try { return 'ot-etat-' + etatDossier(d, isoAujourdhuiLocal()).cle; } catch (e) { return ''; }
  }

  var ICONES_ONGLETS_OUTILS = { suivi: 'list', agenda: 'calendar', nouveau: 'file-text', scans: 'bannette', assistant: 'sparkle', reglages: 'settings', 'appel-fonds': 'mail', constitution: 'folder', inventaire: 'scale', preemption: 'shield', prorata: 'part-disque', quotites: 'users', confreres: 'book', calculateur: 'banknote', 'analyse-ia': 'eye' };

  function renderOngletsTravail() {
    const barre = document.getElementById('onglets-travail');
    if (!barre) return;
    initOngletsTravail();
    initSeparateurFicheCote();
    restaurerOngletsTravail();
    const avant = ongletsTravail.length;
    // Un dossier supprimé perd son onglet ; un outil réservé à l'administrateur n'apparaît pas pour un autre collaborateur.
    ongletsTravail = ongletsTravail.filter(o => o.type === 'dossier' ? dossiers.some(d => d.id === o.id) : !ongletReserve(o.nom, utilisateurPoste));
    if (ongletsTravail.length !== avant) enregistrerOngletsTravail();
    document.body.classList.toggle('avec-onglets-travail', ongletsTravail.length > 0);
    if (!ongletsTravail.length) { barre.innerHTML = ''; barre.style.display = 'none'; return; }
    barre.style.display = '';
    const cleActive = cleOngletTravailActif();
    barre.innerHTML = ongletsTravail.map((o, k) => {
      const actif = cleOngletTravail(o) === cleActive;
      const d = o.type === 'dossier' ? dossiers.find(x => x.id === o.id) : null;
      const aCote = !!d && d.id === dossierOuvert && ficheACoteActive();
      const repere = d
        ? `<span class="ot-point ${classeEtatOngletTravail(d)}" aria-hidden="true"></span>`
        : `<span class="ot-icone" aria-hidden="true">${typeof ICONES !== 'undefined' && ICONES[ICONES_ONGLETS_OUTILS[o.nom]] ? icone(ICONES_ONGLETS_OUTILS[o.nom]) : ''}</span>`;
      const libelle = libelleOngletTravail(o);
      return `<div class="ot-onglet${actif ? ' actif' : ''}${aCote ? ' a-cote' : ''}" role="tab" aria-selected="${actif}" tabindex="0" draggable="true" data-index="${k}" title="${escapeAttr(libelle)}"
          onclick="activerOngletTravail(${k})" onauxclick="if (event.button === 1) fermerOngletTravail(${k}, event)"
          onkeydown="if (event.target !== this) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activerOngletTravail(${k}); } else if (event.key === 'Delete') fermerOngletTravail(${k}, event)">
          ${repere}<span class="ot-libelle">${escapeHtml(libelle)}</span>${aCote ? `<span class="ot-cote" title="Ouverte à côté" aria-label="ouverte à côté">${icone('volet-droit')}</span>` : ''}
          <button type="button" class="ot-fermer" aria-label="Fermer l’onglet ${escapeAttr(libelle)}" title="Fermer" onclick="fermerOngletTravail(${k}, event)">${icone('x')}</button>
        </div>`;
    }).join('');
  }

  // Réordonner en glissant (souris) : l'onglet lâché prend la place de celui qu'on survole.
  function initOngletsTravail() {
    const barre = document.getElementById('onglets-travail');
    if (!barre || barre.dataset.init) return;
    barre.dataset.init = '1';
    barre.addEventListener('dragstart', (e) => {
      const el = e.target.closest && e.target.closest('.ot-onglet');
      if (!el) return;
      ongletTravailGlisse = Number(el.dataset.index);
      el.classList.add('glisse');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(ongletTravailGlisse)); } catch (err) { /* navigateur sans dataTransfer */ }
    });
    barre.addEventListener('dragover', (e) => { if (ongletTravailGlisse >= 0) e.preventDefault(); });
    barre.addEventListener('drop', (e) => {
      const el = e.target.closest && e.target.closest('.ot-onglet');
      if (ongletTravailGlisse < 0 || !el) return;
      e.preventDefault();
      ongletsTravail = deplacerOngletTravailListe(ongletsTravail, ongletTravailGlisse, Number(el.dataset.index));
      ongletTravailGlisse = -1;
      enregistrerOngletsTravail();
      renderOngletsTravail();
    });
    barre.addEventListener('dragend', () => { ongletTravailGlisse = -1; barre.querySelectorAll('.glisse').forEach(x => x.classList.remove('glisse')); });
  }

  // ---- Fiche à côté (étude 11/10, étape 3 de la maquette) : la fiche s'ancre à droite de l'écran courant — un outil, le Suivi,
  // l'agenda — sans fond grisé ; la séparation se tire pour régler les largeurs ; « Plein écran » la rend à la pleine page.
  // Seulement sur un écran assez large ; en dessous, la fiche reste en page. ----
  var LARGEUR_MIN_FICHE_COTE = 1100;     // largeur de fenêtre en dessous de laquelle la fiche ne s'ancre pas
  var CLE_LARGEUR_FICHE_COTE = 'claire-fiche-cote-largeur';
  let ficheACote = false;

  function ficheACoteActive() {
    return ficheACote && ficheACotePossible();
  }

  // Assez de place pour un volet de 480 px ET 480 px d'écran à côté (marges comprises), barre latérale dépliée ou non.
  function ficheACotePossible() {
    if (typeof window === 'undefined' || window.innerWidth < LARGEUR_MIN_FICHE_COTE) return false;
    return largeurDisponibleFicheCote() >= 1024;
  }

  // Dernier appui dans la fiche à côté : les raccourcis de l'écran de gauche (Ctrl+V de l'agenda, Suppr, Ctrl+S) ne jouent pas.
  let appuiDansFicheCote = false;
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('pointerdown', (e) => { appuiDansFicheCote = !!(e.target && e.target.closest && e.target.closest('#dossier-drawer-overlay')); }, true);
  }
  function focusDansFicheCote() {
    if (!ficheACoteActive()) return false;
    const a = document.activeElement;
    return appuiDansFicheCote || !!(a && a.closest && a.closest('#dossier-drawer-overlay'));
  }

  // Pure : largeur du volet bornée — au moins 480 px, et l'écran d'à côté garde au moins 480 px.
  function largeurFicheCoteBornee(largeur, largeurDisponible) {
    const max = Math.max(480, (largeurDisponible || 0) - 480);
    const l = Number(largeur);
    if (!Number.isFinite(l) || l <= 0) return Math.round(Math.min(max, Math.max(480, (largeurDisponible || 0) * 0.46)));
    return Math.round(Math.min(max, Math.max(480, l)));
  }

  function largeurDisponibleFicheCote() {
    const main = document.querySelector('.app-main');
    const gauche = main ? main.getBoundingClientRect().left : 0;
    return window.innerWidth - gauche;
  }

  function appliquerLargeurFicheCote(largeur) {
    const l = largeurFicheCoteBornee(largeur, largeurDisponibleFicheCote());
    document.documentElement.style.setProperty('--largeur-fiche-cote', l + 'px');
    return l;
  }

  function boutonsModeFiche() {
    if (!ficheACotePossible()) return '';
    if (ficheACoteActive()) {
      return `<wa-button appearance="plain" type="button" class="bouton-icone fiche-btn" onclick="pleinEcranFiche()" aria-label="Plein écran" title="Plein écran">${icone('plein-ecran')}</wa-button>`;
    }
    return `<wa-button appearance="plain" type="button" class="bouton-icone fiche-btn fiche-btn-cote" onclick="ouvrirFicheACote()" aria-label="Ouvrir à côté" title="Ouvrir à côté : garder la fiche à droite d'un outil ou du Suivi">${icone('volet-droit')}</wa-button>`;
  }

  function ouvrirFicheACote() {
    if (!dossierOuvert) return;
    let lue = 0;
    try { lue = Number(localStorage.getItem(CLE_LARGEUR_FICHE_COTE)) || 0; } catch (e) { lue = 0; }
    appliquerLargeurFicheCote(lue);
    ficheACote = true;
    render();
  }

  function pleinEcranFiche() {
    ficheACote = false;
    render();
  }

  // À la fermeture de la fiche, le mode « à côté » s'arrête : la prochaine fiche s'ouvre en page.
  function finFicheACote() { ficheACote = false; }

  function initSeparateurFicheCote() {
    const sep = document.getElementById('fiche-separateur');
    if (!sep || sep.dataset.init) return;
    sep.dataset.init = '1';
    let depart = null;
    const fin = () => {
      if (!depart) return;
      depart = null;
      document.body.classList.remove('fiche-cote-redimension');
      const l = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--largeur-fiche-cote')) || 0;
      if (l) ecrireLocal(CLE_LARGEUR_FICHE_COTE, String(Math.round(l)));
    };
    sep.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      depart = true;
      document.body.classList.add('fiche-cote-redimension');
      try { sep.setPointerCapture(e.pointerId); } catch (err) { /* sans capture */ }
    });
    sep.addEventListener('pointermove', (e) => { if (depart) appliquerLargeurFicheCote(window.innerWidth - e.clientX); });
    sep.addEventListener('pointerup', fin);
    sep.addEventListener('pointercancel', fin);
    // Au clavier : flèches gauche / droite, 32 px par appui.
    sep.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const l = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--largeur-fiche-cote')) || 0;
      const n = appliquerLargeurFicheCote(l + (e.key === 'ArrowLeft' ? 32 : -32));
      ecrireLocal(CLE_LARGEUR_FICHE_COTE, String(n));
    });
    // Fenêtre redimensionnée : la largeur est rebornée ; trop étroite, la fiche repasse en page (et revient à côté ensuite).
    let large = ficheACotePossible();
    window.addEventListener('resize', () => {
      const maintenant = ficheACotePossible();
      const change = maintenant !== large;
      large = maintenant;
      if (!ficheACote) { if (change && dossierOuvert) render(); return; }   // le bouton « Ouvrir à côté » apparaît ou disparaît
      const l = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--largeur-fiche-cote')) || 0;
      appliquerLargeurFicheCote(l);
      if (change && dossierOuvert) render();
    });
  }
