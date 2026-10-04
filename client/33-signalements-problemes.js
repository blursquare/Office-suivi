  // ==== SIGNALEMENTS DE PROBLÈMES ====
  //
  // Demandé par l'étude après la présentation de CLAIRE aux équipes : « comment organiser la
  // remontée des bugs qu'ils peuvent me donner ? », puis « tout passe par moi ». D'où :
  //   - un bouton « Signaler un problème » en bas de la barre latérale, sur tous les écrans, qui
  //     joint tout seul ce qu'un collaborateur ne saurait pas dire (version, écran, dossier ouvert,
  //     navigateur, dernières erreurs techniques) — il n'a qu'à décrire ce qu'il faisait et ce qu'il
  //     a vu ;
  //   - le tri (statut, doublon, version du correctif) et l'export se font dans les Réglages, par
  //     l'étude, qui transmet le fichier exporté à Claude Code.
  // Un signalement « bloquant » la prévient tout de suite sur Teams (voir routes/signalements.js).

  var GRAVITES_SIGNALEMENT = {
    bloquant: { texte: 'Bloquant', dl: 'dl-urgent', aide: "Je ne peux pas continuer mon travail." },
    genant: { texte: 'Gênant', dl: 'dl-pret', aide: "Ça marche, mais mal ou pas comme prévu." },
    idee: { texte: "Idée d'amélioration", dl: 'dl-neutre', aide: "Ce serait mieux si…" }
  };
  var STATUTS_SIGNALEMENT = {
    nouveau: 'À trier', transmis: 'Transmis', corrige: 'Corrigé', doublon: 'Doublon', ecarte: 'Écarté'
  };
  var CLE_AUTEUR_SIGNALEMENT = 'signalement-auteur';
  // Une capture plein écran sur un grand moniteur pèse plusieurs Mo en PNG : elle est ramenée à
  // cette largeur, en JPEG, avant l'envoi — assez pour lire un message d'erreur, sans alourdir la
  // base ni l'export.
  var LARGEUR_MAX_CAPTURE = 1600;

  let signalementEnCours = { gravite: '', capture: '' };
  let signalementsCharges = [];
  let filtreSignalements = 'a-trier';

  // Pure : dimensions d'une capture réduite, proportions conservées, jamais agrandie.
  function dimensionsCaptureReduite(largeur, hauteur, max) {
    const l = Math.max(1, Math.round(Number(largeur) || 1));
    const h = Math.max(1, Math.round(Number(hauteur) || 1));
    const m = max || LARGEUR_MAX_CAPTURE;
    if (l <= m) return { largeur: l, hauteur: h };
    return { largeur: m, hauteur: Math.max(1, Math.round(h * m / l)) };
  }

  // Pure : filtre de la liste des Réglages. « À trier » = ni transmis ni traités ; « Traités »
  // regroupe ce qui n'appelle plus rien (corrigé, doublon, écarté).
  function filtrerSignalements(liste, filtre) {
    const l = Array.isArray(liste) ? liste : [];
    if (filtre === 'a-trier') return l.filter(s => s.statut === 'nouveau');
    if (filtre === 'transmis') return l.filter(s => s.statut === 'transmis');
    if (filtre === 'traites') return l.filter(s => s.statut === 'corrige' || s.statut === 'doublon' || s.statut === 'ecarte');
    return l.slice();
  }

  // Pure : la phrase qui dit, dans le formulaire, ce qui sera joint sans rien demander.
  function resumeContexteSignalement(ctx) {
    const c = ctx || {};
    const morceaux = [];
    if (c.version) morceaux.push(`version ${c.version}`);
    if (c.onglet) morceaux.push(`écran « ${c.onglet} »`);
    if (c.dossierNom) morceaux.push(`dossier ${c.dossierNom}`);
    const n = Array.isArray(c.erreurs) ? c.erreurs.length : 0;
    morceaux.push(n ? `${n} erreur${n > 1 ? 's' : ''} technique${n > 1 ? 's' : ''} récente${n > 1 ? 's' : ''}` : 'aucune erreur technique récente');
    return morceaux.join(' · ');
  }

  function contexteSignalement() {
    const d = typeof dossierOuvert !== 'undefined' && dossierOuvert ? dossiers.find(x => x.id === dossierOuvert) : null;
    const theme = document.documentElement.getAttribute('data-theme') || '';
    return {
      version: VERSION_APP,
      onglet: LIBELLES_ONGLETS[ongletActuel] || ongletActuel,
      dossierId: d ? d.id : '',
      dossierNom: d ? libelleDossierAffiche(d) : '',
      navigateur: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      ecran: typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '',
      theme,
      erreurs: erreursRecentes.slice()
    };
  }

  function ouvrirSignalement() {
    toggleSidebarMobile(false);
    signalementEnCours = { gravite: '', capture: '', contexte: contexteSignalement() };
    const auteur = document.getElementById('signalement-auteur');
    if (auteur) {
      let memo = '';
      try { memo = localStorage.getItem(CLE_AUTEUR_SIGNALEMENT) || ''; } catch (e) { memo = ''; }
      // Le collaborateur du poste l'emporte : c'est lui qui est devant l'écran.
      if (utilisateurPoste) memo = utilisateurPoste;
      auteur.innerHTML = '<option value="">— Choisir —</option>'
        + RESPONSABLES.map(n => `<option value="${escapeAttr(n)}"${n === memo ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('')
        + `<option value="Autre"${memo === 'Autre' ? ' selected' : ''}>Autre collaborateur</option>`;
    }
    document.getElementById('signalement-action').value = '';
    document.getElementById('signalement-constat').value = '';
    document.getElementById('signalement-erreur').textContent = '';
    document.getElementById('signalement-contexte').textContent = resumeContexteSignalement(signalementEnCours.contexte);
    const envoyer = document.getElementById('signalement-envoyer');
    envoyer.disabled = false;
    envoyer.textContent = 'Envoyer le signalement';
    majGraviteSignalement();
    majCaptureSignalement();
    document.getElementById('signalement-overlay').style.display = 'flex';
    setTimeout(() => { const b = document.querySelector('.signalement-gravite button'); if (b) b.focus(); }, 0);
  }

  function fermerSignalement() {
    document.getElementById('signalement-overlay').style.display = 'none';
  }

  function choisirGraviteSignalement(g) {
    signalementEnCours.gravite = GRAVITES_SIGNALEMENT[g] ? g : '';
    majGraviteSignalement();
  }

  function majGraviteSignalement() {
    document.querySelectorAll('.signalement-gravite button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.gravite === signalementEnCours.gravite));
    });
  }

  function majCaptureSignalement() {
    const zone = document.getElementById('signalement-capture');
    if (!zone) return;
    if (signalementEnCours.capture) {
      zone.innerHTML = `<img src="${signalementEnCours.capture}" alt="Capture d'écran jointe">
        <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="retirerCaptureSignalement()">Retirer la capture</wa-button>`;
    } else {
      zone.innerHTML = `<label class="action-rapide signalement-capture-btn" for="signalement-fichier">Joindre une capture d'écran</label>
        <span class="hint">ou collez-la ici (Ctrl + V). Pour capturer une zone : Windows + Maj + S.</span>`;
    }
  }

  function retirerCaptureSignalement() {
    signalementEnCours.capture = '';
    const f = document.getElementById('signalement-fichier');
    if (f) f.value = '';
    majCaptureSignalement();
  }

  // Réduit l'image (largeur ≤ LARGEUR_MAX_CAPTURE, JPEG) avant de la garder en data-URI.
  function joindreCaptureSignalement(fichier) {
    if (!fichier || !/^image\//.test(fichier.type)) {
      document.getElementById('signalement-erreur').textContent = 'Seule une image peut être jointe.';
      return;
    }
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      const dim = dimensionsCaptureReduite(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = dim.largeur;
      canvas.height = dim.hauteur;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, dim.largeur, dim.hauteur);
      ctx.drawImage(img, 0, 0, dim.largeur, dim.hauteur);
      URL.revokeObjectURL(url);
      signalementEnCours.capture = canvas.toDataURL('image/jpeg', 0.82);
      document.getElementById('signalement-erreur').textContent = '';
      majCaptureSignalement();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      document.getElementById('signalement-erreur').textContent = "Cette image n'a pas pu être lue.";
    };
    img.src = url;
  }

  function collerCaptureSignalement(e) {
    const items = e.clipboardData && e.clipboardData.items ? Array.from(e.clipboardData.items) : [];
    const image = items.find(it => it.kind === 'file' && /^image\//.test(it.type));
    if (!image) return; // un collage de texte dans un champ reste un collage de texte
    e.preventDefault();
    joindreCaptureSignalement(image.getAsFile());
  }

  async function envoyerSignalement() {
    const erreur = document.getElementById('signalement-erreur');
    const action = document.getElementById('signalement-action').value.trim();
    const constat = document.getElementById('signalement-constat').value.trim();
    const auteur = document.getElementById('signalement-auteur').value;
    if (!signalementEnCours.gravite) { erreur.textContent = 'Choisissez la gravité du problème.'; return; }
    if (!action && !constat) { erreur.textContent = 'Décrivez ce que vous faisiez ou ce qui s’est passé.'; return; }
    try { localStorage.setItem(CLE_AUTEUR_SIGNALEMENT, auteur); } catch (e) { /* sans conséquence */ }
    const bouton = document.getElementById('signalement-envoyer');
    bouton.disabled = true;
    bouton.textContent = 'Envoi…';
    try {
      const r = await fetchAvecAuth('/api/signalements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gravite: signalementEnCours.gravite, auteur, action, constat,
          // Contexte relu à l'envoi (une erreur a pu survenir depuis l'ouverture du formulaire).
          contexte: { ...signalementEnCours.contexte, erreurs: erreursRecentes.slice() },
          capture: signalementEnCours.capture || ''
        })
      });
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corps.erreur || `Erreur ${r.status}`);
      fermerSignalement();
      afficherToast(corps.notifie
        ? 'Signalement envoyé. L’étude est prévenue sur Teams.'
        : 'Signalement envoyé à l’étude. Merci.', 'OK', null);
      majBadgeSignalements();
    } catch (e) {
      erreur.textContent = `Envoi impossible : ${e.message}. Réessayez dans un instant.`;
      bouton.disabled = false;
      bouton.textContent = 'Envoyer le signalement';
    }
  }

  // ---- tri par l'étude (Réglages) ----

  function dateHeureSignalement(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function extraitSignalement(s, n) {
    const t = (s.constat || s.action || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }

  async function chargerSignalements() {
    const zone = document.getElementById('reglages-signalements');
    try {
      const r = await fetchAvecAuth('/api/signalements');
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      signalementsCharges = (await r.json()).signalements || [];
      renderSignalements();
      majBadgeSignalementsDepuis(signalementsCharges);
    } catch (e) {
      if (zone) zone.innerHTML = `<p class="hint">Signalements indisponibles : ${escapeHtml(e.message)}</p>`;
    }
  }

  async function majBadgeSignalements() {
    try {
      const r = await fetchAvecAuth('/api/signalements');
      if (!r.ok) return;
      majBadgeSignalementsDepuis((await r.json()).signalements || []);
    } catch (e) { /* le badge attendra le prochain passage */ }
  }

  // ---- Pastilles d'information « i » (demandé par l'étude le 29/09 : « limiter les paragraphes
  // qui expliquent ce qui se passe, ça charge trop l'interface ») ----
  // Une explication qui n'est pas un état (un résultat, une erreur, un compte) ne s'écrit plus en
  // paragraphe sous un titre : elle va dans une pastille « i » à côté de lui, lue au survol, au
  // focus clavier ou au toucher. Une seule bulle flottante pour toute la page, placée en position
  // fixe et gardée dans l'écran — une bulle en CSS pur serait coupée par les conteneurs qui
  // masquent leur débordement (tiroir, tableaux, cartes).
  //   HTML statique : <span class="info-i" tabindex="0" data-info="…"></span>
  //   Gabarit JS    : ${infoBulle('…')}
  function infoBulle(texte) {
    if (!texte) return '';
    return `<span class="info-i" tabindex="0" role="button" aria-label="${escapeAttr(texte)}" data-info="${escapeAttr(texte)}"></span>`;
  }
  function definirInfoBulle(el, texte) {
    if (!el) return;
    el.setAttribute('data-info', texte || '');
    el.setAttribute('aria-label', texte || '');
  }
  let infoBulleCible = null;
  function afficherInfoBulle(cible) {
    let bulle = document.getElementById('info-bulle');
    if (!bulle) {
      bulle = document.createElement('div');
      bulle.id = 'info-bulle';
      bulle.className = 'info-bulle';
      bulle.setAttribute('role', 'tooltip');
      document.body.appendChild(bulle);
    }
    bulle.textContent = cible.getAttribute('data-info') || '';
    bulle.style.display = 'block';
    const r = cible.getBoundingClientRect();
    const larg = bulle.offsetWidth, haut = bulle.offsetHeight;
    const marge = 8;
    let gauche = Math.min(Math.max(marge, r.left + r.width / 2 - larg / 2), window.innerWidth - larg - marge);
    let hautPos = r.bottom + 6;
    if (hautPos + haut > window.innerHeight - marge) hautPos = Math.max(marge, r.top - haut - 6);
    bulle.style.left = gauche + 'px';
    bulle.style.top = hautPos + 'px';
    infoBulleCible = cible;
  }
  function masquerInfoBulle() {
    const bulle = document.getElementById('info-bulle');
    if (bulle) bulle.style.display = 'none';
    infoBulleCible = null;
  }
  function initialiserInfoBulles() {
    if (typeof document === 'undefined' || !document.addEventListener || !document.querySelectorAll) return;
    document.querySelectorAll('.info-i[data-info]:not([aria-label])').forEach(el => el.setAttribute('aria-label', el.getAttribute('data-info')));
    const cible = (e) => e.target && e.target.closest ? e.target.closest('.info-i') : null;
    document.addEventListener('mouseover', (e) => { const c = cible(e); if (c) afficherInfoBulle(c); });
    document.addEventListener('mouseout', (e) => { const c = cible(e); if (c && c === infoBulleCible) masquerInfoBulle(); });
    document.addEventListener('focusin', (e) => { const c = cible(e); if (c) afficherInfoBulle(c); });
    document.addEventListener('focusout', (e) => { const c = cible(e); if (c) masquerInfoBulle(); });
    // Toucher (téléphone) : bascule. En phase de capture, et sans suite : la pastille est souvent
    // dans un <label> ou une ligne cliquable, qui ne doit pas réagir à la lecture d'une aide.
    document.addEventListener('click', (e) => {
      const c = cible(e);
      if (!c) { if (infoBulleCible) masquerInfoBulle(); return; }
      e.preventDefault(); e.stopPropagation();
      if (infoBulleCible === c) masquerInfoBulle(); else afficherInfoBulle(c);
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && infoBulleCible) masquerInfoBulle(); });
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('scroll', () => { if (infoBulleCible) masquerInfoBulle(); }, true);
  }
  initialiserInfoBulles();

  // Sous-onglets des Réglages (demandé par l'étude : « on doit trop scroller »). Le dernier ouvert
  // est retenu sur ce poste — confort seulement, repli sur « Général » si le stockage manque.
  // Rubriques de la colonne de gauche, dans l'ordre (réorganisées le 29/09, à la manière des
  // réglages de Claude).
  // Ordre de la colonne de gauche (revu le 01/10 : une rubrique par sujet).
  var SOUS_ONGLETS_REGLAGES = ['general', 'collaborateurs', 'signature', 'modeles', 'rappels', 'agenda', 'telephonie', 'authentic', 'pieces', 'noms-nas', 'relecture', 'apprentissage', 'signalements', 'systeme'];
  const CLE_SOUS_ONGLET_REGLAGES = 'reglages-sous-onglet';

  function sousOngletReglagesRetenu() {
    try {
      const v = localStorage.getItem(CLE_SOUS_ONGLET_REGLAGES);
      return SOUS_ONGLETS_REGLAGES.includes(v) ? v : 'general';
    } catch (e) { return 'general'; }
  }

  function definirSousOngletReglages(nom) {
    const cle = SOUS_ONGLETS_REGLAGES.includes(nom) ? nom : 'general';
    for (const k of SOUS_ONGLETS_REGLAGES) {
      const panneau = document.getElementById('reglages-panneau-' + k);
      const bouton = document.getElementById('reglages-onglet-' + k);
      if (panneau) panneau.hidden = k !== cle;
      if (bouton) {
        bouton.classList.toggle('actif', k === cle);
        bouton.setAttribute('aria-selected', String(k === cle));
      }
    }
    try { localStorage.setItem(CLE_SOUS_ONGLET_REGLAGES, cle); } catch (e) { /* confort seulement */ }
    if (cle === 'authentic') renderReglagesAuthentic();
    if (cle === 'agenda') renderReglagesEmailsDossiers();
    if (cle === 'apprentissage') ouvrirPageApprentissage();
    if (cle === 'pieces') renderNomsReconnus();
    if (cle === 'noms-nas') initNomsNas();
    if (cle === 'modeles') ouvrirReglagesModelesEmails();
  }

  // Compteur rouge sur « Réglages » : signalements encore à trier. Sur tous les postes — il n'y a
  // pas de compte par collaborateur —, mais ça n'appelle une action que de la part de l'étude.
  function majBadgeSignalementsDepuis(liste) {
    const n = filtrerSignalements(liste, 'a-trier').length;
    const badge = document.getElementById('badge-signalements-reglages');
    if (!badge) return;
    badge.textContent = String(n);
    badge.style.display = n ? '' : 'none';
    badge.title = `${n} signalement${n > 1 ? 's' : ''} à trier`;
    // Même compteur sur le sous-onglet qui les porte, pour savoir où cliquer une fois dans les Réglages.
    const sousOnglet = document.getElementById('reglages-onglet-compteur-signalements');
    if (sousOnglet) {
      sousOnglet.textContent = String(n);
      sousOnglet.hidden = !n;
    }
  }

  function definirFiltreSignalements(f) {
    filtreSignalements = f;
    renderSignalements();
  }

  function renderSignalements() {
    const zone = document.getElementById('reglages-signalements');
    if (!zone) return;
    const compte = (f) => filtrerSignalements(signalementsCharges, f).length;
    const filtres = [['a-trier', 'À trier'], ['transmis', 'Transmis'], ['traites', 'Traités'], ['tous', 'Tous']];
    const bascule = `<wa-button-group class="vue-bascule signalements-filtres" label="Filtrer les signalements">${filtres.map(([f, l]) =>
      `<wa-button appearance="outlined" size="s" type="button" aria-pressed="${f === filtreSignalements}" class="vue-bascule-btn${f === filtreSignalements ? ' actif' : ''}" onclick="definirFiltreSignalements('${f}')">${l} <span class="signalements-compte">${compte(f)}</span></wa-button>`).join('')}</wa-button-group>`;
    const liste = filtrerSignalements(signalementsCharges, filtreSignalements);
    const vide = {
      'a-trier': 'Rien à trier. Les signalements des collaborateurs arrivent ici.',
      transmis: 'Aucun signalement transmis en attente de correction.',
      traites: 'Aucun signalement traité pour le moment.',
      tous: 'Aucun signalement pour le moment.'
    }[filtreSignalements];
    zone.innerHTML = bascule + (liste.length
      ? `<div class="signalements-liste">${liste.map(renderSignalement).join('')}</div>`
      : `<p class="hint">${vide}</p>`);
  }

  function renderSignalement(s) {
    const g = GRAVITES_SIGNALEMENT[s.gravite] || GRAVITES_SIGNALEMENT.genant;
    const ctx = s.contexte || {};
    const lieu = [ctx.onglet && `Écran « ${escapeHtml(ctx.onglet)} »`, ctx.dossierNom && `dossier ${escapeHtml(ctx.dossierNom)}`,
      ctx.version && `version ${escapeHtml(ctx.version)}`].filter(Boolean).join(' · ');
    const erreurs = Array.isArray(ctx.erreurs) ? ctx.erreurs : [];
    const autres = signalementsCharges.filter(x => x.id !== s.id && x.statut !== 'doublon');
    const idArg = escapeOnclickArg(s.id);
    return `<article class="signalement signalement-${escapeAttr(s.gravite)}" id="sig-${escapeAttr(s.id)}">
      <div class="signalement-tete">
        <span class="dot-label ${g.dl}"><span class="dot"></span>${g.texte}</span>
        <span class="hint signalement-quand">${dateHeureSignalement(s.createdAt)}${s.auteur ? ` · ${escapeHtml(s.auteur)}` : ''}${s.notifie ? ' · prévenu sur Teams' : ''}</span>
        <select class="signalement-statut" aria-label="Statut du signalement" onchange="modifierSignalement('${idArg}', { statut: this.value })">
          ${Object.entries(STATUTS_SIGNALEMENT).map(([k, l]) => `<option value="${k}"${k === s.statut ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      ${s.action ? `<p class="signalement-texte"><span class="section-eyebrow">Ce qu'il faisait</span>${escapeHtml(s.action)}</p>` : ''}
      ${s.constat ? `<p class="signalement-texte"><span class="section-eyebrow">Ce qui s'est passé</span>${escapeHtml(s.constat)}</p>` : ''}
      ${lieu ? `<p class="hint signalement-lieu">${lieu}</p>` : ''}
      <details class="signalement-details">
        <summary>Détails techniques${erreurs.length ? ` (${erreurs.length} erreur${erreurs.length > 1 ? 's' : ''})` : ''}</summary>
        ${erreurs.length ? `<ul>${erreurs.map(e => `<li><code>${escapeHtml(e.message)}</code>${e.source ? ` <span class="hint">${escapeHtml(e.source)}</span>` : ''}${e.fois > 1 ? ` <span class="hint">×${e.fois}</span>` : ''}</li>`).join('')}</ul>` : '<p class="hint">Aucune erreur technique enregistrée.</p>'}
        <p class="hint">${escapeHtml(ctx.navigateur || '')}${ctx.ecran ? ` · fenêtre ${escapeHtml(ctx.ecran)}` : ''}</p>
      </details>
      <div class="signalement-capture-zone" id="sig-capture-${escapeAttr(s.id)}"></div>
      <div class="signalement-actions">
        ${s.aCapture ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="voirCaptureSignalement('${idArg}')">Voir la capture</wa-button>` : ''}
        ${s.statut === 'corrige' ? `<label class="signalement-champ">Corrigé en version
          <input type="text" class="signalement-input" value="${escapeAttr(s.versionCorrige)}" placeholder="${escapeAttr(VERSION_APP)}" onchange="modifierSignalement('${idArg}', { versionCorrige: this.value })"></label>` : ''}
        ${autres.length ? `<label class="signalement-champ">Doublon de
          <select class="signalement-input" onchange="modifierSignalement('${idArg}', this.value ? { doublonDe: this.value } : { statut: 'nouveau', doublonDe: '' })">
            <option value="">—</option>
            ${autres.map(x => `<option value="${escapeAttr(x.id)}"${x.id === s.doublonDe ? ' selected' : ''}>${escapeHtml(dateHeureSignalement(x.createdAt))} — ${escapeHtml(extraitSignalement(x, 40))}</option>`).join('')}
          </select></label>` : ''}
        <label class="signalement-champ signalement-note">Note
          <input type="text" class="signalement-input" value="${escapeAttr(s.note)}" placeholder="Pour vous seulement" onchange="modifierSignalement('${idArg}', { note: this.value })"></label>
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn signalement-suppr" title="Supprimer ce signalement" aria-label="Supprimer ce signalement" onclick="supprimerSignalement('${idArg}')">${icone('x')}</wa-button>
      </div>
    </article>`;
  }

  async function modifierSignalement(id, changements) {
    try {
      const r = await fetchAvecAuth(`/api/signalements/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changements)
      });
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corps.erreur || `Erreur ${r.status}`);
      await chargerSignalements();
    } catch (e) {
      afficherToast(`Modification impossible : ${e.message}`, 'OK', null);
      chargerSignalements();
    }
  }

  async function voirCaptureSignalement(id) {
    const zone = document.getElementById(`sig-capture-${id}`);
    if (!zone) return;
    if (zone.innerHTML) { zone.innerHTML = ''; return; }
    try {
      const r = await fetchAvecAuth(`/api/signalements/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      const s = (await r.json()).signalement;
      if (s && s.capture) zone.innerHTML = `<a href="${s.capture}" target="_blank" rel="noopener"><img src="${s.capture}" alt="Capture jointe au signalement"></a>`;
    } catch (e) {
      afficherToast(`Capture indisponible : ${e.message}`, 'OK', null);
    }
  }

  function supprimerSignalement(id) {
    demanderConfirmation('Supprimer ce signalement ? Il disparaît définitivement, capture comprise.', async () => {
      try {
        const r = await fetchAvecAuth(`/api/signalements/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!r.ok) throw new Error(`Erreur ${r.status}`);
        await chargerSignalements();
      } catch (e) {
        afficherToast(`Suppression impossible : ${e.message}`, 'OK', null);
      }
    });
  }

  // Le fichier à transmettre à Claude Code : les signalements encore à trier, captures comprises.
  // Une fois téléchargé, l'écran propose de les marquer « transmis », pour que le prochain export
  // ne reprenne que les nouveaux.
  async function exporterSignalements() {
    try {
      const r = await fetchAvecAuth('/api/signalements/export?statut=nouveau');
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      const corps = await r.json();
      const liste = corps.signalements || [];
      if (!liste.length) { afficherToast('Aucun signalement à trier : rien à exporter.', 'OK', null); return; }
      const blob = new Blob([JSON.stringify({ application: 'CLAIRE', version: VERSION_APP, ...corps }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signalements-claire-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const n = liste.length;
      demanderConfirmation(`Marquer ${n > 1 ? `les ${n} signalements exportés` : 'le signalement exporté'} comme transmis ?`, async () => {
        for (const s of liste) {
          try {
            await fetchAvecAuth(`/api/signalements/${encodeURIComponent(s.id)}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut: 'transmis' })
            });
          } catch (e) { /* le suivant est tenté quand même */ }
        }
        await chargerSignalements();
      });
    } catch (e) {
      afficherToast(`Export impossible : ${e.message}`, 'OK', null);
    }
  }

  // ---- apprentissage des constats d'Outil 2 (Audit des actes) ----
  // Demandé par l'étude : « un outil d'apprentissage pour l'Outil 2 ». Ce qu'il apprend, choisi
  // avec elle : les constats qu'elle ÉCARTE (faux positifs du modèle, ou remarques sans intérêt
  // pour sa pratique) et ceux qu'elle CONFIRME comme pertinents. Au prochain audit, un constat à
  // formulation proche est affiché REPLIÉ « déjà écarté précédemment » — jamais supprimé en
  // silence : le modèle local se trompe, l'étude aussi peut s'être trompée une fois, et un constat
  // qui revient sur un autre acte n'est pas forcément le même problème — ou remonté en tête comme
  // « confirmé lors d'un audit précédent ».
  // Même mécanique de similarité que les corrections apprises d'Outil 1 (Jaccard sur les mots de
  // 3 lettres et plus, dates/nombres neutralisés), sur une empreinte titre + extrait cité : l'extrait
  // est du texte littéral de l'acte, stable d'un audit à l'autre sur une même trame, là où le titre
  // et la description sont reformulés par le modèle à chaque appel. Seuil plus bas que pour les
  // corrections de dates (0.5 contre 0.6) : l'effet d'une reconnaissance n'est qu'un repli ou un
  // badge, jamais une décision prise à la place de l'étude — on peut se permettre d'être un peu
  // plus large. Stocké à part (clé propre), jamais mélangé aux corrections de dates/engagements.
  const CLE_MEMOIRE_AUDIT = 'audit-constats-memoire';
  const SEUIL_SIMILARITE_AUDIT = 0.5;
  const MAX_CONSTATS_MEMORISES = 500;
  let memoireAuditConstats = [];

  async function sauvegarderMemoireAudit() {
    const contenu = JSON.stringify(memoireAuditConstats);
    try {
      if (window.storage) { await window.storage.set(CLE_MEMOIRE_AUDIT, contenu, false); return; }
    } catch (e) { console.warn('window.storage indisponible pour la mémoire d’audit, repli sur localStorage.', e); }
    try { localStorage.setItem(CLE_MEMOIRE_AUDIT, contenu); } catch (e) { console.warn('Sauvegarde de la mémoire d’audit impossible.', e); }
  }

  async function chargerMemoireAudit() {
    let brut = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(CLE_MEMOIRE_AUDIT, false);
        if (res && res.value) brut = JSON.parse(res.value);
      }
    } catch (e) { /* on tente le repli ci-dessous */ }
    if (brut === null) {
      try {
        const local = localStorage.getItem(CLE_MEMOIRE_AUDIT);
        if (local) brut = JSON.parse(local);
      } catch (e) { /* rien d'exploitable non plus ici */ }
    }
    memoireAuditConstats = Array.isArray(brut)
      ? brut.filter(c => c && typeof c === 'object' && Array.isArray(c.tokens) && (c.decision === 'ecarte' || c.decision === 'confirme'))
      : [];
  }

  // Empreinte d'un constat : ses mots discriminants (titre + premier extrait cité, ou description
  // à défaut d'extrait). Le titre seul serait trop court ; la description seule est réécrite par
  // le modèle à chaque audit.
  function empreinteConstat(constat) {
    if (!constat) return new Set();
    const sources = Array.isArray(constat.sources) ? constat.sources : [];
    // `phrase` = la clause recopiée du document par les règles déterministes (voir
    // analyserCompromisOutil2) ; `sources[].extrait` = la citation d'un constat venu du modèle.
    // Les deux sont du texte littéral de l'acte, donc stables d'un audit à l'autre sur une même
    // trame — bien plus que le titre, reformulé à chaque fois du côté du modèle.
    const extrait = constat.phrase || sources.map(s => s && s.extrait).find(Boolean) || '';
    const texte = [constat.titre || constat.label || '', extrait || constat.description || constat.message || ''].join(' ');
    return tokeniserApprentissage(normaliserTexteApprentissage(texte));
  }

  // Décision mémorisée la plus proche d'un constat, ou null. `memoire` est passée explicitement
  // (fonction pure, testable) — l'état de la page l'appelle avec memoireAuditConstats.
  function decisionPourConstat(constat, memoire) {
    const liste = Array.isArray(memoire) ? memoire : [];
    if (liste.length === 0) return null;
    const tokens = empreinteConstat(constat);
    if (tokens.size < 3) return null;
    let meilleure = null;
    let meilleurScore = SEUIL_SIMILARITE_AUDIT;
    for (const m of liste) {
      const score = similariteJaccard(tokens, new Set(m.tokens));
      if (score >= meilleurScore) { meilleure = m; meilleurScore = score; }
    }
    return meilleure;
  }

  // Enregistre (ou remplace) la décision de l'étude sur un constat, dans la mémoire passée en
  // paramètre, qu'elle renvoie mise à jour. La DERNIÈRE décision l'emporte sur un constat déjà
  // connu : écarter puis confirmer, c'est changer d'avis, pas cumuler deux avis contraires.
  function memoriserDecisionDans(memoire, constat, decision) {
    const liste = Array.isArray(memoire) ? memoire.slice() : [];
    if (decision !== 'ecarte' && decision !== 'confirme') return liste;
    const tokens = [...empreinteConstat(constat)];
    if (tokens.length < 3) return liste;
    const existante = decisionPourConstat(constat, liste);
    if (existante) {
      existante.decision = decision;
      existante.nb = (existante.nb || 1) + 1;
      existante.dateMaj = new Date().toISOString();
      return liste;
    }
    liste.push({
      id: (crypto.randomUUID ? crypto.randomUUID() : 'a-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
      tokens,
      titreExemple: String(constat.titre || constat.label || '').slice(0, 160),
      decision,
      nb: 1,
      dateMaj: new Date().toISOString()
    });
    if (liste.length > MAX_CONSTATS_MEMORISES) {
      liste.sort((a, b) => (b.nb || 1) - (a.nb || 1) || String(b.dateMaj).localeCompare(String(a.dateMaj)));
      liste.length = MAX_CONSTATS_MEMORISES;
    }
    return liste;
  }

  function memoriserDecisionConstat(constat, decision) {
    memoireAuditConstats = memoriserDecisionDans(memoireAuditConstats, constat, decision);
    sauvegarderMemoireAudit();
  }

  function oublierDecisionConstat(idMemoire) {
    memoireAuditConstats = memoireAuditConstats.filter(m => m.id !== idMemoire);
    sauvegarderMemoireAudit();
  }

  // --- Rubriques du rapport d'Outil 2 masquées par l'étude ------------------------------------
  // Réponse directe à un retour de l'étude : le défaut d'Outil 2 n'est pas ce qu'il rate, c'est
  // qu'il « signale trop de choses sans intérêt ». Sans acte réel sous la main, deviner lesquelles
  // reviendrait à resserrer des motifs au jugé — ce qui a déjà provoqué des régressions ici. C'est
  // donc l'étude qui tranche, rubrique par rubrique, une fois pour toutes.
  //
  // Distinct de memoireAuditConstats (« Écarter » UN constat, reconnu ensuite par similarité de
  // clause) : ici c'est une RUBRIQUE entière qui disparaît, quel que soit son contenu. C'est le
  // bon geste quand un sujet n'intéresse jamais l'étude — écarter un à un les constats d'un sujet
  // qui revient sur chaque acte ne finirait jamais.
  //
  // Jamais silencieux : les rubriques masquées sont listées en pied de rapport AVEC le nombre de
  // constats qu'elles retiennent sur l'acte en cours. Masquer ne doit pas pouvoir avaler un
  // constat critique sans que rien ne le dise.
  const CLE_RUBRIQUES_MASQUEES = 'audit-rubriques-masquees';
  let rubriquesMasqueesAudit = [];

  async function sauvegarderRubriquesMasquees() {
    const contenu = JSON.stringify(rubriquesMasqueesAudit);
    try {
      if (window.storage) { await window.storage.set(CLE_RUBRIQUES_MASQUEES, contenu, false); return; }
    } catch (e) { console.warn('window.storage indisponible pour les rubriques masquées, repli sur localStorage.', e); }
    try { localStorage.setItem(CLE_RUBRIQUES_MASQUEES, contenu); } catch (e) { console.warn('Sauvegarde des rubriques masquées impossible.', e); }
  }

  async function chargerRubriquesMasquees() {
    let brut = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(CLE_RUBRIQUES_MASQUEES, false);
        if (res && res.value) brut = JSON.parse(res.value);
      }
    } catch (e) { /* on tente le repli ci-dessous */ }
    if (brut === null) {
      try {
        const local = localStorage.getItem(CLE_RUBRIQUES_MASQUEES);
        if (local) brut = JSON.parse(local);
      } catch (e) { /* rien d'exploitable non plus ici */ }
    }
    rubriquesMasqueesAudit = Array.isArray(brut) ? brut.filter(c => typeof c === 'string') : [];
  }

  function rubriqueMasqueeAudit(cle) {
    return rubriquesMasqueesAudit.indexOf(String(cle)) !== -1;
  }

  // Fonction pure (la liste est passée et rendue), testable : l'état de la page l'appelle avec
  // rubriquesMasqueesAudit. Une clé inconnue de SOUS_SECTIONS_RAPPORT_OUTIL2 n'est jamais ajoutée
  // — sans ce garde-fou, une rubrique renommée laisserait une entrée morte que plus aucun bouton
  // ne pourrait retirer.
  function basculerRubriqueDans(liste, cle) {
    const clesConnues = SOUS_SECTIONS_RAPPORT_OUTIL2.map(s => s.cle);
    const k = String(cle);
    const actuelle = Array.isArray(liste) ? liste.filter(x => clesConnues.indexOf(x) !== -1) : [];
    if (clesConnues.indexOf(k) === -1) return actuelle;
    return actuelle.indexOf(k) !== -1 ? actuelle.filter(x => x !== k) : actuelle.concat([k]);
  }

  function basculerRubriqueAudit(cle) {
    const masquee = rubriqueMasqueeAudit(cle);
    rubriquesMasqueesAudit = basculerRubriqueDans(rubriquesMasqueesAudit, cle);
    sauvegarderRubriquesMasquees();
    if (dernierRapportAudit) renderRapportAuditActe(dernierRapportAudit);
    const titre = (SOUS_SECTIONS_RAPPORT_OUTIL2.find(s => s.cle === String(cle)) || {}).titre || 'Rubrique';
    afficherToast(masquee
      ? `« ${titre} » est de nouveau affichée.`
      : `« ${titre} » ne sera plus affichée. Réafficher en bas du rapport.`, 'OK', null);
  }

  // ---- export / import (sauvegarde JSON complète du registre) ----

  function exporterDonnees() {
    if (dossiers.length === 0) {
      afficherToast('Aucun dossier à exporter pour le moment.', 'OK', null);
      return;
    }
    const contenu = JSON.stringify(dossiers, null, 2);
    const blob = new Blob([contenu], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const aujourdhui = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `registre-echeances-${aujourdhui}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Normalise un dossier venu d'un fichier externe : garantit la présence et le type de chaque
  // champ attendu, pour qu'un JSON incomplet ou bricolé à la main ne casse pas l'affichage.
  function situationMatrimonialePersistable(sm) {
    if (!sm || typeof sm !== 'object') return null;
    const r = {};
    ['situation', 'date', 'conjoint', 'contrat', 'regime', 'dateMariage'].forEach(k => { if (typeof sm[k] === 'string' && sm[k]) r[k] = sm[k].slice(0, 120); });
    return Object.keys(r).length ? r : null;
  }

  function authenticPersistable(a) {
    if (!a || typeof a !== 'object') return null;
    const texte = (v) => typeof v === 'string' ? v.slice(0, 160) : '';
    const sous = (o, cles) => o && typeof o === 'object' ? Object.fromEntries(cles.filter(k => typeof o[k] === 'string' && o[k]).map(k => [k, texte(o[k])])) : null;
    const carte = (o, cles) => o && typeof o === 'object' && !Array.isArray(o)
      ? Object.fromEntries(Object.entries(o).slice(0, 40).filter(([k, v]) => /^[\w-]{1,80}$/.test(k) && v && typeof v === 'object').map(([k, v]) => [k, sous(v, cles)])) : null;
    const r = {
      acte: sous(a.acte, ['etat', 'libelle', 'date']), rhf: sous(a.rhf, ['envoyeeLe', 'retourLe']),
      safer: sous(a.safer, ['creeeLe', 'envoyeeLe', 'notifieeLe', 'priseEnCompteLe', 'priseEnCompte', 'delaiManuel', 'decision', 'decisionLe', 'tacite', 'pieceCocheeTacite', 'titre']),
      etatsCivils: carte(a.etatsCivils, ['label', 'etat', 'date']), demandes: carte(a.demandes, ['date', 'titre']),
      prix: Number.isFinite(a.prix) && a.prix > 0 ? a.prix : null, collaborateur: texte(a.collaborateur), notaire: texte(a.notaire),
      avantContratLe: /^\d{4}-\d{2}-\d{2}$/.test(a.avantContratLe || '') ? a.avantContratLe : '',
      personnes: Array.isArray(a.personnes) ? a.personnes.filter(p => p && typeof p.nom === 'string').slice(0, 12)
        .map(p => ({ nom: texte(p.nom), role: p.role === 'ACQUEREUR' ? 'ACQUEREUR' : 'VENDEUR', situationMatrimoniale: situationMatrimonialePersistable(p.situationMatrimoniale) })) : [],
      saferPieceAjoutee: a.saferPieceAjoutee === true, releveLe: texte(a.releveLe),
      clientsAPlacer: Array.isArray(a.clientsAPlacer) ? a.clientsAPlacer.filter(c => c && typeof c.nom === 'string').slice(0, 6).map(c => ({
        nom: texte(c.nom), prenom: texte(c.prenom), nomFamille: texte(c.nomFamille), nomUsage: texte(c.nomUsage),
        telephones: Array.isArray(c.telephones) ? c.telephones.filter(t => typeof t === 'string').slice(0, 3).map(texte) : [],
        emails: Array.isArray(c.emails) ? c.emails.filter(t => typeof t === 'string').slice(0, 3).map(texte) : [],
        situationMatrimoniale: situationMatrimonialePersistable(c.situationMatrimoniale)
      })) : [],
      clientsEcartes: Array.isArray(a.clientsEcartes) ? a.clientsEcartes.filter(n => typeof n === 'string').slice(-20).map(texte) : []
    };
    Object.keys(r).forEach(k => { const v = r[k]; if (v == null || v === '' || v === false || (typeof v === 'object' && !Object.keys(v).length)) delete r[k]; });
    return Object.keys(r).length ? r : null;
  }

  function normaliserDossierImporte(d, nomFichier) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const nom = typeof d.nom === 'string' ? d.nom.trim() : '';
    if (!nom) return null;
    const dateValide = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : '';
    const normalise = {
      id: (crypto.randomUUID ? crypto.randomUUID() : 'd-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
      nom,
      responsable: typeof d.responsable === 'string' ? d.responsable : '',
      emailAcquereur: typeof d.emailAcquereur === 'string' ? d.emailAcquereur : '',
      emailVendeur: typeof d.emailVendeur === 'string' ? d.emailVendeur : '',
      telephoneAcquereur: typeof d.telephoneAcquereur === 'string' ? d.telephoneAcquereur : '',
      telephoneVendeur: typeof d.telephoneVendeur === 'string' ? d.telephoneVendeur : '',
      referenceAuthentic: referenceAuthenticValide(d.referenceAuthentic) ? d.referenceAuthentic : null,
      intituleAuthentic: referenceAuthenticValide(d.referenceAuthentic) && typeof d.intituleAuthentic === 'string' ? d.intituleAuthentic.slice(0, 150) : null,
      dateAvantContrat: typeof d.dateAvantContrat === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.dateAvantContrat) ? d.dateAvantContrat : null,
      dateAvantContratLueLe: typeof d.dateAvantContratLueLe === 'string' ? d.dateAvantContratLueLe : null,
      personnesConnuesEcartees: Array.isArray(d.personnesConnuesEcartees) ? d.personnesConnuesEcartees.filter(x => typeof x === 'string').slice(-40) : [],
      // Contrairement aux statuts dérivés d'un scan du NAS (offrePretStatut, pieces...), l'envoi du
      // questionnaire est un fait réel déjà accompli par l'utilisateur : conservé tel quel.
      questionnaireEnvoyeLe: typeof d.questionnaireEnvoyeLe === 'string' ? d.questionnaireEnvoyeLe : null,
      questionnaireVendeurEnvoyeLe: typeof d.questionnaireVendeurEnvoyeLe === 'string' ? d.questionnaireVendeurEnvoyeLe : null,
      receptionFondsConfirmeeLe: typeof d.receptionFondsConfirmeeLe === 'string' ? d.receptionFondsConfirmeeLe : null,
      // Rendez-vous créé dans l'agenda Outlook (voir creerRdvDansAgenda) : un fait accompli par
      // l'utilisateur, conservé à l'import comme le questionnaire ou la confirmation des fonds.
      rdvAgendaCreeLe: typeof d.rdvAgendaCreeLe === 'string' ? d.rdvAgendaCreeLe : null,
      // Identifiant Exchange de l'événement créé par CLAIRE et sa couleur (office/visio/confrère) :
      // valables pour tout l'office, conservés pour pouvoir le retirer ou le déplacer ensuite.
      rdvAgendaItem: (d.rdvAgendaItem && typeof d.rdvAgendaItem.itemId === 'string' && d.rdvAgendaItem.itemId)
        ? { itemId: d.rdvAgendaItem.itemId, changeKey: typeof d.rdvAgendaItem.changeKey === 'string' ? d.rdvAgendaItem.changeKey : '', date: typeof d.rdvAgendaItem.date === 'string' ? d.rdvAgendaItem.date : '' }
        : null,
      rendezVousType: TYPES_RDV[d.rendezVousType] ? d.rendezVousType : '',
      // Mention d'envoi notée dans le lieu du rendez-vous de l'agenda Outlook (voir
      // noterEnvoiDansAgenda) : un fait accompli par l'utilisateur, conservé à l'import.
      agendaLieuNoteLe: typeof d.agendaLieuNoteLe === 'string' ? d.agendaLieuNoteLe : null,
      // Dates butoir posées dans le calendrier PARTAGÉ (voir synchroniserEcheanceAgenda) : un
      // identifiant Exchange valable pour tout l'office, conservé — sans lui, CLAIRE ne pourrait
      // plus déplacer ni retirer l'événement, et le reposerait en double.
      agendaEcheances: agendaEcheancesImportees(d.agendaEcheances),
      ribDemandeLe: typeof d.ribDemandeLe === 'string' ? d.ribDemandeLe : null,
      provisionDemandeeLe: typeof d.provisionDemandeeLe === 'string' ? d.provisionDemandeeLe : null,
      relanceVentePrealableLe: typeof d.relanceVentePrealableLe === 'string' ? d.relanceVentePrealableLe : null,
      // Montant attendu saisi à la main : conservé. Le rapprochement des reçus (fondsRecus) dérive du NAS
      // de CE serveur : il repart de zéro, comme les pièces.
      fondsAttendusManuel: Number(d.fondsAttendusManuel) > 0 ? Number(d.fondsAttendusManuel) : null,
      nomsRecus: typeof d.nomsRecus === 'string' ? d.nomsRecus.slice(0, 120) : '',
      fondsRecus: null,
      adresseBien: typeof d.adresseBien === 'string' ? d.adresseBien : '',
      nomAgence: typeof d.nomAgence === 'string' ? d.nomAgence : '',
      honoraires: honorairesPersistables(d.honoraires),
      fondsTravaux: fondsTravauxPersistable(d.fondsTravaux),
      prixVente: Number.isFinite(d.prixVente) && d.prixVente > 0 ? d.prixVente : null,
      prixMobilier: Number.isFinite(d.prixMobilier) && d.prixMobilier > 0 ? d.prixMobilier : null,
      // Comme adresseBien/prixVente : une lecture de l'acte (ou une saisie de l'étude), identique
      // sur n'importe quel poste — conservée telle quelle, contrairement aux statuts dérivés d'un
      // scan du NAS juste en dessous.
      depotGarantie: Number.isFinite(d.depotGarantie) && d.depotGarantie > 0 ? d.depotGarantie : null,
      sequestreDepot: typeof d.sequestreDepot === 'string' ? d.sequestreDepot : '',
      // Comme offrePretStatut : dérivé d'un PDF local, jamais importé tel quel d'une autre machine
      // sans revérification (voir le commentaire déjà existant sur offrePretStatut ci-dessous).
      montantPret: null,
      pret: dateValide(d.pret),
      // Comme pret/acte/ventebien : une lecture/saisie conservée telle quelle à l'import, jamais un
      // statut dérivé d'un scan à revérifier — l'appel de fonds et le rendez-vous de signature sont
      // ajoutés après coup par l'étude, pas extraits automatiquement du compromis.
      appelFonds: dateValide(d.appelFonds),
      // Comme appelFonds/acte/ventebien juste au-dessus : conservé tel quel à l'import, une saisie
      // de l'étude ou une détection depuis l'agenda de l'office (voir agendaWatch.js) — jamais un
      // statut dérivé d'un scan du NAS à revérifier sur ce poste.
      projetEnvoye: dateValide(d.projetEnvoye),
      acte: dateValide(d.acte),
      rendezVousSignature: dateValide(d.rendezVousSignature),
      // Heure et lieu relevés dans l'agenda de l'office : un fait du rendez-vous, conservés.
      rendezVousSignatureHeure: /^\d{2}:\d{2}$/.test(d.rendezVousSignatureHeure || '') ? d.rendezVousSignatureHeure : '',
      rendezVousSignatureHeureFin: /^\d{2}:\d{2}$/.test(d.rendezVousSignatureHeureFin || '') ? d.rendezVousSignatureHeureFin : '',
      rendezVousSignatureLieu: typeof d.rendezVousSignatureLieu === 'string' ? d.rendezVousSignatureLieu.slice(0, 160) : '',
      rendezVousSignatureCategories: Array.isArray(d.rendezVousSignatureCategories)
        ? d.rendezVousSignatureCategories.filter((c) => typeof c === 'string').slice(0, 5) : [],
      rendezVousARemplacer: d.rendezVousARemplacer && /^\d{4}-\d{2}-\d{2}$/.test(d.rendezVousARemplacer.date || '')
        ? { date: d.rendezVousARemplacer.date, heure: /^\d{2}:\d{2}$/.test(d.rendezVousARemplacer.heure || '') ? d.rendezVousARemplacer.heure : '', le: typeof d.rendezVousARemplacer.le === 'string' ? d.rendezVousARemplacer.le.slice(0, 10) : '' }
        : null,
      ventebien: dateValide(d.ventebien),
      autres: Array.isArray(d.autres)
        ? d.autres.filter(a => a && typeof a === 'object' && dateValide(a.date))
            .map(a => ({ label: typeof a.label === 'string' && a.label.trim() ? a.label : 'Autre échéance', date: a.date, page: Number.isInteger(a.page) ? a.page : null }))
        : [],
      pretPage: Number.isInteger(d.pretPage) ? d.pretPage : null,
      actePage: Number.isInteger(d.actePage) ? d.actePage : null,
      ventebienPage: Number.isInteger(d.ventebienPage) ? d.ventebienPage : null,
      sansPret: d.sansPret === true,
      // Conservé à l'import (contrairement aux statuts dérivés des PDF du NAS, remis à zéro) :
      // « la vente préalable est faite » est une décision prise par l'étude, pas une lecture de
      // fichier — la réimporter à zéro lui redemanderait de refaire ce travail.
      echeancesValidees: (d.echeancesValidees && typeof d.echeancesValidees === 'object' && !Array.isArray(d.echeancesValidees))
        ? Object.fromEntries(Object.entries(d.echeancesValidees).filter(([, v]) => v === true))
        : {},
      // Envois déjà relevés dans l'agenda de l'office (voir agendaWatch.js) : conservés, sans quoi
      // un dossier réimporté verrait l'agenda réécrire ces dates à la date du nouvel import.
      detectionsAgenda: (d.detectionsAgenda && typeof d.detectionsAgenda === 'object' && !Array.isArray(d.detectionsAgenda))
        ? Object.fromEntries(Object.entries(d.detectionsAgenda)
          .filter(([k, v]) => (k === 'appelFonds' || k === 'projetEnvoye' || k === 'rendezVousSignature' || k === 'rendezVousDisparu' || k === 'rendezVousRetire') && typeof v === 'string'))
        : {},
      typeVente: (d.typeVente === 'copropriete' || d.typeVente === 'terrain') ? d.typeVente : 'maison',
      roleNotaire: d.roleNotaire === 'participant' ? 'participant' : 'instrumentaire',
      // Notaires des deux parties : une lecture de l'acte lui-même (ou une saisie de l'étude), la
      // même sur n'importe quel poste — conservés tels quels à l'import, comme adresseBien, et
      // contrairement aux statuts dérivés d'un scan du NAS.
      notaireVendeur: typeof d.notaireVendeur === 'string' ? d.notaireVendeur : '',
      notaireAcquereur: typeof d.notaireAcquereur === 'string' ? d.notaireAcquereur : '',
      // Même logique que notaireVendeur/notaireAcquereur ci-dessus : une saisie de l'étude, pas un
      // statut dérivé d'un scan, donc conservée telle quelle à l'import.
      emailNotaireParticipant: typeof d.emailNotaireParticipant === 'string' ? d.emailNotaireParticipant : '',
      emailConfrereVendeur: typeof d.emailConfrereVendeur === 'string' ? d.emailConfrereVendeur : '',
      coteInstrumentaire: (d.coteInstrumentaire === 'vendeur' || d.coteInstrumentaire === 'acquereur') ? d.coteInstrumentaire : null,
      notairesDetectes: Array.isArray(d.notairesDetectes)
        ? d.notairesDetectes.filter(n => n && typeof n === 'object' && typeof n.nom === 'string' && n.nom)
            .map(n => ({ nom: n.nom, role: (n.role === 'instrumentaire' || n.role === 'participant') ? n.role : null }))
        : [],
      // Choix de l'étude sur QUELLES pièces suivre pour ce dossier précis (pas dérivé d'un scan de
      // PDF local, contrairement à `pieces` juste en dessous, qui repart bien à {}) : conservés tels
      // quels à l'import, comme `autres` ci-dessus.
      piecesRetirees: Array.isArray(d.piecesRetirees) ? d.piecesRetirees.filter(c => typeof c === 'string') : [],
      // Relevé dans Authentic (acte, RHF, SAFER, prix, collaborateur, notaire, situations
      // matrimoniales) : des faits du dossier, les mêmes sur n'importe quel poste.
      authentic: authenticPersistable(d.authentic),
      typeAffaire: d.typeAffaire === 'succession' ? 'succession' : undefined,
      biens: Array.isArray(d.biens) ? d.biens.filter(b => b && typeof b === 'object').slice(0, 20).map(b => ({
        adresse: typeof b.adresse === 'string' ? b.adresse.slice(0, 200) : '', type: typeof b.type === 'string' ? b.type.slice(0, 20) : '',
        parcelles: typeof b.parcelles === 'string' ? b.parcelles.slice(0, 200) : '', description: typeof b.description === 'string' ? b.description.slice(0, 300) : ''
      })) : undefined,
      piecesAuthentic: Array.isArray(d.piecesAuthentic) ? d.piecesAuthentic.filter(c => typeof c === 'string') : [],
      // Pièces validées À LA MAIN (voir validerPieceManuellement) : une pièce que l'étude détient
      // ailleurs que sur le NAS — typiquement dans Authentic (Fichorga), une réponse SAFER par
      // exemple. C'est une décision prise par un humain, pas un statut dérivé d'un scan : elle est
      // donc conservée à l'import, contrairement à `pieces`/`fichiersTrouves` juste en dessous.
      piecesValideesManuellement: Array.isArray(d.piecesValideesManuellement)
        ? d.piecesValideesManuellement.filter(c => typeof c === 'string') : [],
      piecesPersonnalisees: Array.isArray(d.piecesPersonnalisees)
        ? d.piecesPersonnalisees.filter(p => p && typeof p === 'object' && typeof p.cle === 'string' && typeof p.label === 'string')
            .map(p => ({ cle: p.cle, label: p.label }))
        : [],
      // Comme piecesRetirees/piecesPersonnalisees ci-dessus : un choix figé pour ce dossier, pas
      // dérivé d'un scan de PDF local, conservé tel quel à l'import. Filtré sur les clés CONNUES de
      // PIECES_ENGAGEMENTS_AUTO plutôt que sur un simple typeof string, au cas où une future
      // version retirerait une clé existante — une clé obsolète resterait sinon indéfiniment dans
      // le dossier importé sans jamais correspondre à une pièce réelle affichée.
      piecesEngagementsDetectees: Array.isArray(d.piecesEngagementsDetectees)
        ? d.piecesEngagementsDetectees.filter(c => PIECES_ENGAGEMENTS_AUTO.some(p => p.cle === c))
        : [],
      archive: d.archive === true,
      reminderDays: Array.isArray(d.reminderDays) && d.reminderDays.every(Number.isInteger) ? d.reminderDays : [15, 7],
      confiance: (d.confiance && typeof d.confiance === 'object') ? d.confiance : {},
      // Nom du PDF d'avant-contrat réellement importé à la création : une simple chaîne, la même
      // sur n'importe quel poste (c'est le nom du fichier déposé par l'étude, pas un statut dérivé
      // d'un scan local) — conservée telle quelle à l'import.
      compromisNomFichier: typeof d.compromisNomFichier === 'string' && d.compromisNomFichier ? d.compromisNomFichier : null,
      analyseJuridique: {
        // Bug corrigé : ce filtre ne gardait que les chaînes, alors que detecterDocumentsAFournir()
        // produit des objets {label, cat, cleChecklist} depuis longtemps — importer une sauvegarde
        // vidait donc silencieusement la liste des documents identifiés. Les deux formes sont
        // acceptées, comme partout ailleurs dans le fichier (voir renderDocBadge).
        documents: Array.isArray(d.analyseJuridique && d.analyseJuridique.documents)
          ? d.analyseJuridique.documents.filter(x => typeof x === 'string' || (x && typeof x === 'object' && typeof x.label === 'string'))
          : [],
        engagements: Array.isArray(d.analyseJuridique && d.analyseJuridique.engagements) ? d.analyseJuridique.engagements : []
      },
      // Trace de ce que l'extraction avait compris de l'acte : conservée à l'import (c'est une
      // lecture du document lui-même, la même sur n'importe quel poste — contrairement à
      // offrePretStatut/pieces, dérivés d'un dossier LOCAL propre à la machine), mais assainie :
      // une sauvegarde produite par une version différente peut porter une structure inattendue.
      ...normaliserExtractionImportee(d),
      historique: Array.isArray(d.historique) ? d.historique.filter(h => h && h.date && h.texte) : [],
      // Le lien vers le dossier NAS, lui, reste valable : c'est un chemin sur le serveur de
      // l'étude, pas une autorisation propre à un navigateur comme l'était l'ancien handle. Les
      // STATUTS qui en dérivent repartent en revanche de zéro, comme avant : la sauvegarde peut
      // venir d'une autre installation, dont le NAS n'a pas la même arborescence.
      nasDossier: typeof d.nasDossier === 'string' && d.nasDossier ? d.nasDossier : null,
      dossierLie: typeof d.nasDossier === 'string' && !!d.nasDossier,
      fichiersTrouves: {},
      offrePretStatut: 'inconnu',
      // Comme offrePretStatut/montantPret : lues dans un PDF local propre à une machine, jamais
      // importées telles quelles — à retrouver par une vérification sur ce poste.
      garantiesPret: [],
      pieces: {},
      // Comme pieces/fichiersTrouves ci-dessus : une notification "nouvelle pièce trouvée" n'a de
      // sens que sur le poste qui vient de faire le scan qui l'a déclenchée, jamais importée telle
      // quelle d'une autre installation.
      piecesNotifications: [],
      // Même raison : la date de découverte d'une pièce et l'avis « dossier complet » dérivent
      // d'un parcours du NAS de CE serveur — ils repartent de zéro avec les pièces.
      piecesTrouveesLe: {},
      completNotifieLe: null,
      // nasInventaire/nasNouveaute (surveillance périodique du NAS, voir server/src/nasWatch.js)
      // sont volontairement ABSENTS d'ici, comme fichiersTrouves/pieces ci-dessus : un simple
      // listing de noms propre à l'arborescence de CE serveur, sans intérêt — et potentiellement
      // trompeur — une fois importé sur une autre installation.
      derniereRelanceAuto: null
    };
    ajouterHistorique(normalise, `Importé depuis « ${nomFichier} »`);
    return normalise;
  }

  function importerDonnees(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let brut;
      try {
        brut = JSON.parse(reader.result);
        if (!Array.isArray(brut)) throw new Error('format invalide');
      } catch (e) {
        afficherToast(`Le fichier « ${file.name} » n'est pas une sauvegarde valide.`, 'OK', null);
        event.target.value = '';
        return;
      }

      const importes = brut.map(d => normaliserDossierImporte(d, file.name)).filter(Boolean);
      const ignores = brut.length - importes.length;

      if (importes.length === 0) {
        afficherToast(`Aucun dossier exploitable dans « ${file.name} ».`, 'OK', null);
        event.target.value = '';
        return;
      }

      const messageIgnores = ignores > 0 ? ` (${ignores} entrée${ignores > 1 ? 's' : ''} illisible${ignores > 1 ? 's' : ''} ignorée${ignores > 1 ? 's' : ''})` : '';
      demanderConfirmation(`Importer ${importes.length} dossier${importes.length > 1 ? 's' : ''} depuis « ${file.name} »${messageIgnores} ? Ils seront ajoutés à votre registre actuel.`, async () => {
        // Import en masse : chaque dossier est créé individuellement (POST) sur le serveur — pas
        // de route "bulk" en V1 (voir M3 pour l'import serveur dédié à la migration initiale,
        // distinct de ce bouton "Importer (JSON)" manuel). Un id déjà présent côté serveur (import
        // d'une sauvegarde déjà partiellement importée) est simplement compté comme refusé, sans
        // bloquer les autres.
        let reussis = 0;
        for (const d of importes) {
          const ok = await sauvegarderNouveauDossier(d);
          if (ok) { if (!dossiers.some(x => x.id === d.id)) dossiers.push(d); reussis++; }
        }
        render();
        const echoues = importes.length - reussis;
        const messageEchoues = echoues > 0 ? ` (${echoues} refusé${echoues > 1 ? 's' : ''} par le serveur, id déjà présent ?)` : '';
        afficherToast(`${reussis} dossier${reussis > 1 ? 's' : ''} importé${reussis > 1 ? 's' : ''}${messageEchoues}.`, 'OK', null);
      });
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  // ---- fiche A4 imprimable (analyse du dossier + procédure d'appel de fonds de l'étude) ----

  // Reprise à l'identique de la procédure interne « APPELS ET RECEPTION DES FONDS ».
  // Chaque étape porte une amorce en gras/majuscules (l'action à retenir en un coup d'œil) suivie
  // du détail en texte normal — reprend la mise en forme demandée par l'étude sur la fiche imprimée.
  const PROCEDURE_FONDS = [
    { lead: "Envoi de l'appel des fonds", suite: " à l'acquéreur au plus tard 10 jours avant le rendez-vous de signature. Envoi au client par mail avec en copie le banquier et le courtier, et envoi par courrier." },
    { lead: 'Envoyer une confirmation de rendez-vous au vendeur', suite: " par mail (ou par téléphone s'il n'a pas d'adresse mail) : lui demander de se munir de son RIB et lui envoyer son décompte vendeur." },
    { lead: 'Réceptionner tous les justificatifs de la provenance des fonds', suite: " (offre de prêt, attestation de provenance selon modèle de l'Étude ou ordre de virement transmis par la banque) et les classer dans le dossier sur le commun." },
    { lead: "Enregistrer l'appel de fonds dans le dossier commun", suite: " pour qu'à la réception, la comptabilité puisse les rattacher au bon compte et vérifier la provenance." },
    { lead: "Vérifier auprès de l'agence immobilière le déblocage du séquestre.", suite: '' },
    { lead: 'Vérifier la réception de toutes les factures à régler', suite: ' par la comptabilité (agence, syndic/copropriété) et obtenir tous les RIB.' },
    { lead: "Envoyer le projet d'acte", suite: ' au plus tard 7 jours avant le rendez-vous au vendeur, à l\u2019acquéreur et à l\u2019agence.' },
    { lead: "Surveiller l'arrivée des fonds", suite: ' et, 48 h avant le rendez-vous, prévenir les clients s\u2019il en manque.' },
    { lead: 'Confirmer aux clients la bonne réception de leurs fonds', suite: ' et leur rappeler de se munir de leurs RIB et CNI pour le rendez-vous (acquéreurs et vendeurs).' }
  ];

  // État de chaque étape de PROCEDURE_FONDS d'après ce que CLAIRE sait déjà du dossier (demandé
  // par l'étude le 29/09 : « remplir et cocher automatiquement les cases » de la fiche imprimée).
  // Une étape n'est cochée que sur un fait enregistré (date d'envoi, reçus complets, confirmation
  // envoyée, appel de fonds trouvé sur le commun) ; sinon seule une information utile est écrite,
  // la case reste à cocher à la main. Même ordre que PROCEDURE_FONDS. Pure.
  function etatProcedureFonds(d, formatMontant) {
    const euros = formatMontant || formaterPrixCentimes;
    const etat = PROCEDURE_FONDS.map(() => ({ fait: false, date: '', note: '' }));
    const iso = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) ? v.slice(0, 10) : '';
    // 1 — Envoi de l'appel de fonds : une date saisie vaut envoi fait.
    if (d.appelFonds || echeanceValidee(d, 'appelFonds')) etat[0] = { fait: true, date: iso(d.appelFonds), note: '' };
    // 2 — Confirmation au vendeur : rien d'enregistré ; le rendez-vous à rappeler.
    if (d.rendezVousSignature) {
      etat[1].note = 'Rendez-vous : ' + dateAvecJourFr(d.rendezVousSignature)
        + (d.rendezVousSignatureHeure ? ' à ' + heureEmail(d.rendezVousSignatureHeure) : '');
    }
    // 3 — Justificatifs de provenance : l'offre de prêt en est un, jamais le seul.
    if (d.sansPret) etat[2].note = 'Achat comptant : attestation de provenance des fonds à obtenir.';
    else if (d.offrePretStatut === 'recue') etat[2].note = 'Offre de prêt reçue. Attestation ou ordre de virement à vérifier.';
    else etat[2].note = 'Offre de prêt non reçue.';
    // 4 — Appel de fonds enregistré dans le dossier commun : trouvé sur le NAS.
    const f = d.fondsRecus || {};
    if (f.attenduChemin) {
      etat[3] = { fait: true, date: '', note: 'Trouvé sur le commun : ' + String(f.attenduChemin).split(/[\\/]/).pop() };
    }
    // 5 — Séquestre.
    if (d.depotGarantie) etat[4].note = 'Séquestre : ' + euros(d.depotGarantie) + (d.sequestreDepot ? ' — ' + d.sequestreDepot : '');
    // 7 — Projet d'acte envoyé.
    if (d.projetEnvoye || echeanceValidee(d, 'projetEnvoye')) etat[6] = { fait: true, date: iso(d.projetEnvoye), note: '' };
    // 8 — Arrivée des fonds : cochée quand les reçus couvrent le montant attendu.
    if (f.verifieLe) {
      const b = bilanFondsRecus(f.total, f.attendu);
      const derniere = (f.recus || []).map(r => iso(r.date)).filter(Boolean).sort().pop() || '';
      if (b.etat === 'complet') etat[7] = { fait: true, date: derniere, note: 'Fonds complets : ' + euros(b.total) + ' reçus.' };
      else if (b.etat === 'excedent') etat[7].note = 'Reçu ' + euros(b.total) + ' pour ' + euros(b.attendu) + ' attendus — écart à vérifier.';
      else if (b.attendu) etat[7].note = 'Reçu ' + euros(b.total) + ' sur ' + euros(b.attendu) + ' — reste ' + euros(b.reste) + '.';
      else if (b.total > 0) etat[7].note = 'Reçu ' + euros(b.total) + ' (montant attendu inconnu).';
    }
    // 9 — Confirmation de réception des fonds envoyée au client.
    if (d.receptionFondsConfirmeeLe) etat[8] = { fait: true, date: iso(d.receptionFondsConfirmeeLe), note: '' };
    return etat;
  }

  function imprimerFiche(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const analyse = d.analyseJuridique || { documents: [], engagements: [] };
    const docs = (analyse.documents || []).map(x => typeof x === 'string' ? x : x.label);
    const engs = (analyse.engagements || []).map(x => typeof x === 'string' ? x : x.phrase);

    // Mise en page à base de <table>, avec les couleurs en style *inline* sur chaque cellule :
    // Word (et le filtre HTML de LibreOffice) ignore CSS Grid/Flexbox et, plus surprenant,
    // n'applique pas toujours les couleurs de fond définies via une classe sur une cellule de
    // tableau — seul le style inline est honoré de façon fiable à l'ouverture d'un fichier .doc.
    // acte/vente : mêmes valeurs que --acte/--ventebien (style.css), échangées sur demande de
    // l'étude (acte en vert/teal, vente préalable en bleu) — voir le commentaire dans style.css.
    // appelFonds/rendezVous : pas de couleur de catégorie dédiée (échéances manuelles, hors de
    // l'extraction) — appelFonds reprend la teinte neutre "autre" (--muted), rendezVous reprend
    // celle de "acte" (--acte), dont il est la précision (le rendez-vous EST la signature, juste
    // daté précisément) — aucune couleur inventée pour l'occasion.
    const TEINTES = {
      pret:  { fond: '#FBEFD9', barre: '#B07A12' },
      acte:  { fond: '#E2E7F0', barre: '#1E3A63' },
      vente: { fond: '#E3EEF7', barre: '#2472B0' },
      autre: { fond: '#EEEEEE', barre: '#8A93A9' },
      appelFonds: { fond: '#EEE9F7', barre: '#7C5CBF' },
      // projetEnvoye : même teinte neutre que "autre" (--muted en écran), pas de couleur de
      // catégorie dédiée — comme appelFonds/rendezVous, une échéance manuelle hors extraction.
      projetEnvoye: { fond: '#F7E6EF', barre: '#B83E78' },
      rendezVous: { fond: '#E4F2EA', barre: '#2F8F5B' }
    };

    const cases = [
      d.pret ? { cls: 'pret', label: 'Obtention du prêt', date: d.pret } : null,
      d.appelFonds ? { cls: 'appelFonds', label: 'Envoi appel de fonds', date: d.appelFonds } : null,
      d.projetEnvoye ? { cls: 'projetEnvoye', label: 'Envoi projet', date: d.projetEnvoye } : null,
      d.acte ? { cls: 'acte', label: "Signature de l'acte", date: d.acte } : null,
      d.rendezVousSignature ? { cls: 'rendezVous', label: 'Rendez-vous de signature', date: d.rendezVousSignature } : null,
      d.ventebien ? { cls: 'vente', label: 'Vente préalable', date: d.ventebien } : null,
      ...(d.autres || []).map(a => ({ cls: 'autre', label: a.label, date: a.date }))
    ].filter(Boolean);

    function ligneParPaquets(items, parLigne, rendu) {
      let html = '';
      for (let i = 0; i < items.length; i += parLigne) {
        const paquet = items.slice(i, i + parLigne);
        html += '<tr>' + paquet.map((it, j) => rendu(it, i + j)).join('') +
          (paquet.length < parLigne ? `<td style="border:none;background:none;" colspan="${parLigne - paquet.length}"></td>` : '') +
          '</tr>';
      }
      return html;
    }

    const echeancesHtml = cases.length
      ? `<table class="ech-table">${ligneParPaquets(cases, 4, c => {
          const t = TEINTES[c.cls];
          return `<td class="eb" style="background:${t.fond};border-left:1mm solid ${t.barre};">
            <div class="eb-l">${escapeHtml(c.label)}</div><div class="eb-d">${formatDateFr(c.date)}</div></td>`;
        })}</table>`
      : '<p class="vide">Aucune échéance enregistrée.</p>';

    const etapes = etatProcedureFonds(d);
    const procHtml = `<table class="proc-table">${ligneParPaquets(PROCEDURE_FONDS, 2, (e, idx) => {
      const et = etapes[idx] || {};
      const fait = et.fait
        ? `<div class="pc-fait pc-fait-ok">☑ Fait${et.date ? ` le <b>${formatDateFr(et.date)}</b>` : ''}</div>`
        : '<div class="pc-fait">☐ Fait le <u>&nbsp;</u></div>';
      return `<td class="pc">
        <div class="pc-h"><span class="pc-num">${idx + 1}</span></div>
        <div class="pc-txt"><b>${escapeHtml(e.lead.toUpperCase())}</b>${escapeHtml(e.suite)}</div>
        ${et.note ? `<div class="pc-note">${escapeHtml(et.note)}</div>` : ''}
        ${fait}
      </td>`;
    })}</table>`;

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Fiche dossier — ${escapeHtml(libelleDossierAffiche(d))}</title>
<style>
  @page { size: A4 portrait; margin: 8mm 11mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8.4pt; line-height: 1.22; color: #1a1a1a; margin: 0; }

  .head-table { width: 100%; border-collapse: collapse; border-bottom: 1.5pt solid #16233C; margin-bottom: 2.2mm; }
  .head-table td { padding: 0 0 1.5mm; border: none; vertical-align: bottom; }
  .head-table h1 { font-size: 14.5pt; margin: 0; color: #16233C; }
  .head-table .meta { font-size: 8pt; color: #555; text-align: right; white-space: nowrap; }
  .head-table .meta b { color: #16233C; }

  h2 { font-size: 12pt; margin: 0 0 1.3mm; color: #16233C; font-weight: 700; }
  .vide { color: #777; font-style: italic; margin: 0; }

  .ech-table { width: 100%; border-collapse: separate; border-spacing: 2mm; margin: 0 0 1.3mm -2mm; }
  .eb { width: 25%; border-radius: 2mm; padding: 1.5mm 3mm; vertical-align: top; }
  .eb-l { font-size: 7.3pt; color: #444; margin-bottom: 0.5mm; }
  .eb-d { font-size: 9.5pt; font-weight: 700; }

  .two-col { width: 100%; border-collapse: separate; border-spacing: 4mm 0; margin-bottom: 2.2mm; }
  .two-col td { width: 50%; vertical-align: top; padding: 1.8mm 3mm; border-radius: 2mm; }
  .two-col ul { margin: 0; padding-left: 3.8mm; }
  .two-col li { margin-bottom: 0.9mm; }

  .proc-title { margin: 0 0 2mm; }
  .proc-title .tag { font-size: 6.6pt; color: #777; font-style: italic; margin-left: 2mm; }
  .proc-table { width: 100%; border-collapse: separate; border-spacing: 3mm 1mm; margin-left: -3mm; }
  .pc { width: 50%; border: 0.6pt solid #ddd; border-radius: 2mm; padding: 1.3mm 2.8mm; background: #FAFAFA; vertical-align: top; }
  .pc-h { margin-bottom: 1mm; }
  .pc-num {
    display: inline-block; width: 5mm; height: 5mm; line-height: 5mm;
    border-radius: 50%; background: #16233C; color: #fff;
    font-size: 7.5pt; font-weight: 700; text-align: center;
  }
  .pc-txt { margin-bottom: 0.9mm; }
  .pc-fait { color: #666; font-size: 8pt; }
  .pc-fait u { text-decoration: none; border-bottom: 0.5pt solid #999; padding: 0 16mm; }
  .pc-fait-ok { color: #1F6B45; }
  .pc-note { color: #16233C; font-size: 7.8pt; font-style: italic; margin-bottom: 0.7mm; }

  .pied { margin-top: 1.2mm; padding-top: 0.6mm; border-top: 0.6pt solid #999; font-size: 6.6pt; color: #666; }
</style></head><body>

  <table class="head-table"><tr>
    <td><h1>${escapeHtml(libelleDossierAffiche(d))}</h1></td>
    <td class="meta">
      ${d.responsable ? 'Responsable : <b>' + escapeHtml(d.responsable) + '</b> · ' : ''}
      ${d.sansPret ? '<b>Achat comptant</b> · ' : ''}
      Édité le ${new Date().toLocaleDateString('fr-FR')}
    </td>
  </tr></table>

  <h2>1 · Échéances et points de vigilance</h2>
  ${echeancesHtml}

  <table class="two-col"><tr>
    <td style="background:#F0F7F4;border:0.6pt solid #BFE0D2;">
      <h2>Pièces à réclamer au vendeur</h2>
      ${docs.length ? `<ul>${docs.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<p class="vide">Aucune pièce identifiée.</p>'}
    </td>
    <td style="background:#EEF3FA;border:0.6pt solid #C6D9EE;">
      <h2>Engagements du vendeur</h2>
      ${engs.length ? `<ul>${engs.map(x => `<li>${escapeHtml(x.length > 140 ? x.slice(0, 140) + '…' : x)}</li>`).join('')}</ul>` : '<p class="vide">Aucun engagement relevé.</p>'}
    </td>
  </tr></table>

  <div class="proc-title"><h2 style="display:inline">2 · Procédure — Appels et réception des fonds</h2><span class="tag">(cochée d'après CLAIRE le ${new Date().toLocaleDateString('fr-FR')}, à compléter au fil du dossier)</span></div>
  ${procHtml}

  <div class="pied">
    Les procédures écrites sont des règlements de l'entreprise. En cas de non-respect (non validé par le notaire), des sanctions disciplinaires peuvent être prononcées.
    · Dates issues d'une lecture automatique du compromis : à vérifier avant usage.
  </div>
</body></html>`;

    // window.open()/print() est souvent bloqué (fenêtre surgissante) dans un navigateur ou un
    // aperçu en bac à sable : on télécharge directement un fichier Word, ouvert et imprimé
    // ensuite par le collaborateur comme n'importe quel document.
    const entete = '\ufeff<html xmlns:o="urn:schemas-microsoft-com:office:office" '
      + 'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">';
    const docComplet = html.replace('<html lang="fr">', entete);

    const blob = new Blob([docComplet], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = libelleDossierAffiche(d).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    a.href = url;
    a.download = `fiche-${safeName || 'dossier'}.doc`;
    document.body.appendChild(a);
    a.click();
    ouvrirApresTelechargement(a.download);
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---- dossier local (offre de prêt) : File System Access API, Chrome/Edge uniquement ----
  //
  // Limites réelles de la plateforme, non contournables :
  // - Firefox et Safari ne proposent pas cette API : le bouton est simplement masqué ailleurs.
  // - Le navigateur peut redemander l'autorisation d'accès après un certain temps ou un
  //   redémarrage ; dans ce cas un bandeau « Reconfirmer l'accès » apparaît sur le dossier.
  // - Aucune page web ne peut cliquer "Envoyer" à la place de l'utilisateur : la relance est
  //   pré-rédigée et ouverte automatiquement dans la messagerie, l'envoi final reste manuel.
  // - La vérification ne tourne que pendant que cet onglet est ouvert, pas en tâche de fond.

  // Bug corrigé : signalé par l'étude, un certificat d'urbanisme mentionne couramment dans son
  // PROPRE texte l'existence d'autres certificats ("Le certificat de numérotage est à demander à
  // l'Hôtel de Ville... Le certificat d'alignement est à demander à la même adresse...") sans être
  // lui-même l'un d'eux — ce texte suffisait pourtant à cocher ces deux pièces comme reçues à
  // partir du seul certificat d'urbanisme. La formulation exacte varie d'un document à l'autre
  // (l'étude l'a confirmé), d'où un motif générique de RENVOI plutôt qu'une phrase figée : la
  // présence de ce renvoi à proximité immédiate d'une occurrence de piece.motif empêche de
  // retenir CETTE occurrence précise (une autre occurrence plus loin dans le même texte, sans ce
  // renvoi à proximité, resterait valable).
  var RE_SIMPLE_RENVOI_PIECE = /(?:est|sont)\s+à\s+demander|(?:peut|peuvent|doit|doivent)\s+[êe]tre\s+demand[ée]s?|s['’]obtiennent?|se\s+demandent?|d[ée]livr[ée]s?\s+(?:par|sur\s+demande)|sur\s+demande\s+(?:à|aupr[èe]s)/i;

  // Les motifNom ci-dessus utilisent \s+ (espace) comme séparateur naturel du français, mais les
  // vrais noms de fichiers de l'étude remplacent couramment les espaces par des underscores/tirets
  // (ex. "Certificat_alignement_et_nume_rotage_DI_132.pdf") — sans cette normalisation, \s+ ne
  // matcherait jamais un tel nom. Testé UNIQUEMENT contre motifNom (le nom de fichier), jamais
  // contre motif (le contenu du PDF, un vrai texte qui n'a pas ce problème). Signalé par l'étude
  // sur un fichier réel qui ne remontait pas.
  // Bug corrigé : un dossier zippé/synchronisé depuis un Mac (confirmé sur un vrai dossier envoyé
  // par l'étude, "NEW_DOSSIER.zip", dossier __MACOSX + .DS_Store) nomme ses fichiers en Unicode
  // NFD (décomposé) plutôt que NFC (composé) : "foncières" y est stocké comme "e" + un caractère
  // ACCENT GRAVE COMBINANT séparé (U+0300), pas le seul caractère "è" (U+00E8) que motifNom
  // attend. Invisible à l'œil (le nom s'affiche identique dans n'importe quel explorateur de
  // fichiers/éditeur/console.log) et donc indiscernable d'un motif mal écrit — exactement ce qui
  // a fait echouer TROIS revérifications successives de `avisTaxeFonciere.motifNom` sur des noms
  // de fichiers en apparence corrects ("Avis de Taxes foncières.pdf" ne matchait jamais, alors que
  // la regex elle-même était juste). `.normalize('NFC')` recompose chaque lettre accentuée en un
  // seul caractère avant tout test de motifNom — sans effet sur un nom déjà en NFC (cas normal
  // d'un fichier nommé sous Windows, l'environnement réel de l'étude), donc aucune régression
  // possible sur les dossiers déjà correctement détectés.
  function normaliserNomPourMotif(nom) {
    return nom.normalize('NFC').replace(/[_-]+/g, ' ');
  }

  // Pour les champs de recherche de dossier (Suivi, Tableau de bord) : accents et majuscules ne
  // doivent pas empêcher de retrouver un dossier ("depont" doit trouver "Dupont", "eleonore" doit
  // trouver "Éléonore") — demandé par l'étude. Sans rapport avec normaliserNomPourMotif() ci-dessus
  // (qui RECOMPOSE un accent décomposé pour un test de nom de fichier exact, sans jamais le
  // retirer) : ici on décompose au contraire chaque lettre accentuée (NFD) puis on retire les
  // diacritiques ainsi isolés, avant de comparer en minuscules.
  function normaliserPourRecherche(texte) {
    return (texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
