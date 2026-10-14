  // ===== Sites consultés par CLAIRE (étude 14/10 : « Claire doit pouvoir naviguer sur le site, remplir les champs et apporter des
  // réponses » ; plan de situation de cadastre.gouv.fr surligné en jaune fluo, « A4 portrait », « pas de gros rond, toutes les
  // parcelles en entier » ; Géofoncier avec le compte de l'étude : zonage en %, monuments historiques, bornages, plan aérien).
  // Le SERVEUR conduit son navigateur (server/src/navigateur/) ; le poste lance, suit en direct (étapes + capture d'écran), affiche
  // le résultat, ouvre les PDF, les range dans le dossier du NAS sur clic et garde le compte rendu Géofoncier sur la fiche
  // (d.geofoncier). Section « Plan de situation et Géofoncier » du Contrôle de l'urbanisme, et Réglages › Sites consultés par CLAIRE. =====

  var ECHELLES_PLAN_SITUATION = [{ cle: 0, libelle: 'Automatique' }, { cle: 500, libelle: '1/500' }, { cle: 1000, libelle: '1/1000' },
    { cle: 2000, libelle: '1/2000' }, { cle: 5000, libelle: '1/5000' }];
  var STATUTS_MONUMENTS_GEOFONCIER = { oui: 'En zone protégée', non: 'Hors zone protégée', non_lu: 'Non lu' };
  var minuteriesSites = {};       // genre ('plan' | 'geofoncier') → minuterie du suivi
  var capturesSites = {};         // genre → URL d'objet de la dernière capture (libérée à la suivante)

  // L'état des deux consultations, rangé dans l'état de l'outil (oublié avec lui au changement de dossier).
  function etatSitesPreemption() {
    if (!prEtat) return { echelle: 0, precision: '', plan: null, geofoncier: null };
    if (!prEtat.sites) prEtat.sites = { echelle: 0, precision: '', plan: null, geofoncier: null };
    return prEtat.sites;
  }

  // Pure : ce qui manque pour lancer une consultation (commune et parcelles de l'outil). Rend '' si rien ne manque.
  function manqueConsultationSites(e) {
    if (!e || !e.insee) return 'Choisissez d’abord la commune (code postal) dans « Parcelle et zonage ».';
    if (!parcellesDepuisTexte(e.parcelles).length) return 'Indiquez d’abord les parcelles (section et numéro) dans « Parcelle et zonage ».';
    return '';
  }

  // Pure : nom de la commune choisie dans l'outil.
  function communeOutilSites(e) {
    const c = (e && e.communes || []).find(x => x.insee === e.insee);
    return c ? c.nom : '';
  }

  function changerEchelleSites(valeur) { etatSitesPreemption().echelle = Number(valeur) || 0; }
  function changerPrecisionSites(valeur) { etatSitesPreemption().precision = String(valeur || '').slice(0, 500); }

  async function lancerPlanSituation() {
    const e = prEtat;
    const manque = manqueConsultationSites(e);
    if (manque) { afficherToast(manque); return; }
    const st = etatSitesPreemption();
    st.plan = { id: '', etat: 'envoi', etapes: [], documents: [] };
    renderSitesPreemption();
    try {
      const r = await fetchAvecAuth(`/api/navigation/plan-cadastre`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insee: e.insee, parcelles: e.parcelles, echelle: st.echelle, dossierId: e.dossierId || '' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new Error(j.erreur || `réponse ${r.status}`);
      st.plan = { id: j.id, etat: 'attente', etapes: [], documents: [] };
      suivreTacheSite('plan');
    } catch (err) {
      st.plan = { id: '', etat: 'erreur', erreur: err.message, etapes: [], documents: [] };
      renderSitesPreemption();
    }
  }

  async function lancerGeofoncier() {
    const e = prEtat;
    const manque = manqueConsultationSites(e);
    if (manque) { afficherToast(manque); return; }
    const st = etatSitesPreemption();
    st.geofoncier = { id: '', etat: 'envoi', etapes: [], documents: [] };
    renderSitesPreemption();
    try {
      const r = await fetchAvecAuth(`/api/navigation/consultation`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: 'geofoncier', insee: e.insee, commune: communeOutilSites(e), parcelles: e.parcelles, demande: st.precision || '', dossierId: e.dossierId || '' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new Error(j.erreur || `réponse ${r.status}`);
      st.geofoncier = { id: j.id, etat: 'attente', etapes: [], documents: [] };
      suivreTacheSite('geofoncier');
    } catch (err) {
      st.geofoncier = { id: '', etat: 'erreur', erreur: err.message, etapes: [], documents: [] };
      renderSitesPreemption();
    }
  }

  // Relit la tâche toutes les 1,5 s tant qu'elle tourne (étapes, capture), puis une dernière fois.
  function suivreTacheSite(genre) {
    clearTimeout(minuteriesSites[genre]);
    const tour = async () => {
      const st = etatSitesPreemption();
      const t = st[genre];
      if (!t || !t.id) return;
      try {
        const r = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(t.id)}`);
        if (r.status === 404) { st[genre] = Object.assign({}, t, { etat: 'erreur', erreur: 'Consultation oubliée par le serveur (redémarré ?) : relancez-la.' }); renderSitesPreemption(); return; }
        const j = await r.json();
        if (etatSitesPreemption()[genre] !== t) return;      // relancée ou outil changé entre-temps
        st[genre] = j;
        if (j.avecCapture && (j.etat === 'en-cours' || !capturesSites[genre])) await chargerCaptureSite(genre, j.id);
      } catch (_) { /* une relecture manquée : la suivante */ }
      renderSitesPreemption();
      const etat = (etatSitesPreemption()[genre] || {}).etat;
      if (etat === 'attente' || etat === 'en-cours') minuteriesSites[genre] = setTimeout(tour, 1500);
    };
    minuteriesSites[genre] = setTimeout(tour, 600);
  }

  async function chargerCaptureSite(genre, id) {
    try {
      const r = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(id)}/capture`);
      if (!r.ok) return;
      const url = URL.createObjectURL(await r.blob());
      if (capturesSites[genre]) URL.revokeObjectURL(capturesSites[genre]);
      capturesSites[genre] = url;
    } catch (_) { /* pas de capture cette fois */ }
  }

  async function arreterTacheSite(genre) {
    const t = etatSitesPreemption()[genre];
    if (!t || !t.id) return;
    await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(t.id)}/annuler`, { method: 'POST' }).catch(() => {});
    afficherToast('Arrêt demandé : CLAIRE s’arrête après le geste en cours.');
  }

  // Ouvre un PDF rendu par une consultation (onglet ouvert tout de suite : le navigateur bloquerait une fenêtre ouverte après l'attente).
  async function ouvrirDocumentSite(tacheId, docId) {
    const fenetre = window.open('', '_blank');
    try {
      const r = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(tacheId)}/documents/${encodeURIComponent(docId)}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || `réponse ${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      if (fenetre) fenetre.location = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    } catch (err) {
      if (fenetre) fenetre.close();
      afficherToast(`Document indisponible : ${err.message}`);
    }
  }

  async function rangerDocumentSite(tacheId, docId, dossierImpose) {
    const dossierId = dossierImpose || (prEtat && prEtat.dossierId);
    if (!dossierId) { afficherToast('Choisissez d’abord le dossier suivi.'); return; }
    try {
      const r = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(tacheId)}/documents/${encodeURIComponent(docId)}/ranger`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dossierId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erreur || `réponse ${r.status}`);
      afficherToast(`Rangé dans le dossier du NAS : ${String(j.chemin || '').split(/[\\/]/).pop()}`);
    } catch (err) {
      afficherToast(`Non rangé : ${err.message}`);
    }
  }

  // Pure : le compte rendu Géofoncier tel qu'il est gardé sur la fiche (rien d'autre que ce que l'agent a lu).
  function geofoncierPourFiche(resultat, maintenant) {
    const r = resultat || {};
    const texte = (x, n) => String(x || '').slice(0, n);
    return {
      le: (maintenant || new Date()).toISOString(),
      compteRendu: texte(r.compte_rendu, 3000),
      zonages: (Array.isArray(r.zonages) ? r.zonages : []).slice(0, 40).map(z => ({ parcelle: texte(z.parcelle, 20), zone: texte(z.zone, 20),
        libelle: texte(z.libelle, 120), pourcentage: typeof z.pourcentage === 'number' && z.pourcentage >= 0 ? Math.round(z.pourcentage * 10) / 10 : null })),
      monuments: { statut: ['oui', 'non', 'non_lu'].includes(r.monuments_historiques && r.monuments_historiques.statut) ? r.monuments_historiques.statut : 'non_lu',
        detail: texte(r.monuments_historiques && r.monuments_historiques.detail, 400) },
      bornages: (Array.isArray(r.bornages) ? r.bornages : []).slice(0, 30).map(b => ({ parcelle: texte(b.parcelle, 20), nature: texte(b.nature, 80),
        date: texte(b.date, 30), geometre: texte(b.geometre, 120), reference: texte(b.reference, 60) })),
      aSignaler: texte(r.a_signaler, 600),
      complet: r.complet !== false
    };
  }

  function enregistrerGeofoncierFiche() {
    const d = prEtat && prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
    const t = etatSitesPreemption().geofoncier;
    if (!d || !t || !t.resultat) return;
    d.geofoncier = geofoncierPourFiche(t.resultat);
    const z = d.geofoncier.zonages.map(x => `${x.parcelle} ${x.zone}${x.pourcentage !== null ? ' ' + x.pourcentage + ' %' : ''}`).join(', ');
    ajouterHistorique(d, `Géofoncier consulté par CLAIRE${z ? ' : ' + z : ''}${d.geofoncier.monuments.statut === 'oui' ? ' — monument historique' : ''}${d.geofoncier.bornages.length ? ` — ${d.geofoncier.bornages.length} opération(s) de géomètre` : ''}`);
    sauvegarder(d);
    afficherToast('Compte rendu Géofoncier enregistré sur la fiche.');
    renderSitesPreemption();
  }

  // Les étapes et la capture d'une consultation en cours.
  function renderSuiviTacheSite(genre, t) {
    const enCours = t.etat === 'attente' || t.etat === 'en-cours' || t.etat === 'envoi';
    const etapes = (t.etapes || []).slice(-6);
    const capture = capturesSites[genre];
    return `<div class="sites-suivi">
        ${capture && (enCours || genre === 'geofoncier') ? `<img class="sites-capture" src="${escapeAttr(capture)}" alt="Ce que CLAIRE voit sur le site">` : ''}
        <ol class="sites-etapes">${etapes.map((x, i) => `<li class="${i === etapes.length - 1 && enCours ? 'sites-etape-courante' : ''}">${escapeHtml(x.texte)}</li>`).join('')
          || `<li class="sites-etape-courante">${t.etat === 'envoi' ? 'Envoi de la demande…' : 'En attente de la consultation précédente…'}</li>`}</ol>
        ${enCours && t.id ? `<wa-button appearance="outlined" size="s" onclick="arreterTacheSite('${genre}')">Arrêter</wa-button>` : ''}
      </div>`;
  }

  function renderDocumentsSite(t) {
    const d = prEtat && prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
    const lignes = (t.documents || []).map(doc => `<li class="sites-doc">
        <span class="sites-doc-icone">${icone('file-text')}</span>
        <span class="sites-doc-texte"><span class="sites-doc-titre">${escapeHtml(doc.titre)}</span><span class="hint">PDF · ${Math.max(1, Math.round(doc.taille / 1024))} Ko</span></span>
        <wa-button appearance="outlined" size="s" onclick="ouvrirDocumentSite('${escapeOnclickArg(t.id)}', '${escapeOnclickArg(doc.id)}')">Ouvrir</wa-button>
        ${d && d.nasDossier ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="rangerDocumentSite('${escapeOnclickArg(t.id)}', '${escapeOnclickArg(doc.id)}')" title="Ranger dans le dossier du NAS" aria-label="Ranger dans le dossier du NAS">${icone('folder')}</wa-button>` : ''}
      </li>`).join('');
    return lignes ? `<ul class="sites-docs">${lignes}</ul>` : '';
  }

  function renderResultatGeofoncier(t) {
    const r = geofoncierPourFiche(t.resultat);
    const d = prEtat && prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
    return `${r.compteRendu ? `<p class="sites-compte-rendu">${escapeHtml(r.compteRendu)}</p>` : ''}
      ${renderTableauxGeofoncier(r)}
      ${r.aSignaler ? `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(r.aSignaler)}</p>` : ''}
      ${t.coutUsd ? `<p class="hint">Coût de la consultation : ${escapeHtml(String(t.coutUsd).replace('.', ','))} $</p>` : ''}
      ${d ? `<div class="reglages-actions"><wa-button variant="brand" size="s" onclick="enregistrerGeofoncierFiche()">${icone('check')} Enregistrer sur la fiche</wa-button>
        ${d.geofoncier && d.geofoncier.le ? `<span class="hint">Enregistré le ${escapeHtml(formatDateFr(d.geofoncier.le.slice(0, 10)))}</span>` : ''}</div>` : ''}`;
  }

  // Zonages, monuments historiques, bornages : même présentation dans l'outil et sur la fiche.
  function renderTableauxGeofoncier(r) {
    const zonages = r.zonages.length ? `<table class="sites-table"><thead><tr><th>Parcelle</th><th>Zone</th><th>Part</th></tr></thead><tbody>
        ${r.zonages.map(z => `<tr><td>${escapeHtml(z.parcelle)}</td><td>${escapeHtml(z.zone)}${z.libelle ? ` <span class="hint">${escapeHtml(z.libelle)}</span>` : ''}</td>
          <td class="sites-nombre">${z.pourcentage !== null ? escapeHtml(String(z.pourcentage).replace('.', ',')) + ' %' : '—'}</td></tr>`).join('')}</tbody></table>`
      : '<p class="hint">Zonage : non lu sur Géofoncier.</p>';
    const mh = r.monuments;
    const classe = mh.statut === 'oui' ? 'dl-pret' : mh.statut === 'non' ? 'dl-success' : 'dl-neutre';
    const bornages = r.bornages.length ? `<ul class="sites-bornages">${r.bornages.map(b => `<li><span class="pr-fiche-titre">${escapeHtml([b.parcelle, b.nature].filter(Boolean).join(' · '))}</span>
        <span class="hint">${escapeHtml([b.date, b.geometre, b.reference ? 'réf. ' + b.reference : ''].filter(Boolean).join(' — '))}</span></li>`).join('')}</ul>`
      : '<p class="hint">Aucune opération de géomètre relevée.</p>';
    return `<div class="section-eyebrow">Zonage d’urbanisme</div>${zonages}
      <div class="section-eyebrow">Monuments historiques</div>
      <div class="pr-fiche-ligne"><span class="dot-label ${classe}"><span class="dot"></span>${escapeHtml(STATUTS_MONUMENTS_GEOFONCIER[mh.statut])}</span>
        <span class="hint">${escapeHtml(mh.detail)}</span></div>
      <div class="section-eyebrow">Bornages et opérations de géomètres</div>${bornages}`;
  }

  // La section de l'outil.
  function renderSitesPreemption() {
    const zone = document.getElementById('pr-sites');
    if (!zone) return;
    const e = prEtat || etatPreemptionVierge();
    const st = etatSitesPreemption();
    const manque = manqueConsultationSites(e);
    const plan = st.plan;
    const geo = st.geofoncier;
    const enCours = (t) => !!t && (t.etat === 'attente' || t.etat === 'en-cours' || t.etat === 'envoi');
    const actif = document.activeElement && document.activeElement.id;
    zone.innerHTML = `${manque ? `<p class="hint">${escapeHtml(manque)}</p>` : ''}
      <div class="sites-carte">
        <div class="sites-carte-tete"><span class="sites-carte-titre">${icone('map-pin')} Plan de situation — cadastre.gouv.fr</span>
          ${infoBulle('Extrait officiel du plan cadastral (DGFiP) en A4 portrait, toutes les parcelles en entier, puis surligné en jaune fluo dans leurs limites. L’échelle automatique est la plus grande où elles tiennent avec leurs abords.')}</div>
        <div class="sites-ligne">
          <div class="calc-champ"><label for="sites-echelle">Échelle</label>
            <select id="sites-echelle" onchange="changerEchelleSites(this.value)">${ECHELLES_PLAN_SITUATION.map(x => `<option value="${x.cle}"${x.cle === st.echelle ? ' selected' : ''}>${x.libelle}</option>`).join('')}</select></div>
          <wa-button variant="brand" size="s" onclick="lancerPlanSituation()"${manque || enCours(plan) ? ' disabled' : ''}${enCours(plan) ? ' loading' : ''}>${icone('map-pin')} Tirer le plan de situation</wa-button>
        </div>
        ${plan ? (enCours(plan) ? renderSuiviTacheSite('plan', plan)
          : plan.etat === 'fini' ? `<p class="hint">${icone('check')} Extrait au 1/${escapeHtml(String((plan.resultat || {}).echelle || ''))}${(plan.resultat || {}).echelleRelevee ? ' (échelle demandée trop grande pour tout faire tenir)' : ''} — parcelles ${escapeHtml((plan.resultat || {}).parcelles || '')}.</p>
              ${renderDocumentsSite(plan)}`
          : `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(plan.erreur || 'Consultation arrêtée.')}</p>`) : ''}
      </div>
      <div class="sites-carte">
        <div class="sites-carte-tete"><span class="sites-carte-titre">${icone('search')} Géofoncier — compte de l’étude</span>
          ${infoBulle('CLAIRE se connecte avec le compte enregistré dans les Réglages, cherche chaque parcelle et relève le zonage (part de chaque zone), les monuments historiques, les bornages, puis garde un plan aérien avec les numéros de parcelles. L’IA (Claude) conduit la consultation ; elle ne voit jamais le mot de passe et ne commande rien.')}</div>
        <div class="sites-ligne">
          <div class="calc-champ sites-precision"><label for="sites-precision">Précision (facultatif)</label>
            <input type="text" id="sites-precision" value="${escapeAttr(st.precision || '')}" placeholder="ex. vérifier aussi l’emplacement réservé" onchange="changerPrecisionSites(this.value)" autocomplete="off"></div>
          <wa-button variant="brand" size="s" onclick="lancerGeofoncier()"${manque || enCours(geo) ? ' disabled' : ''}${enCours(geo) ? ' loading' : ''}>${icone('search')} Consulter Géofoncier</wa-button>
        </div>
        ${geo ? (enCours(geo) ? renderSuiviTacheSite('geofoncier', geo)
          : geo.etat === 'fini' ? `${renderResultatGeofoncier(geo)}${renderDocumentsSite(geo)}`
          : `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(geo.erreur || 'Consultation arrêtée.')}</p>${renderSuiviTacheSite('geofoncier', geo)}`) : ''}
      </div>`;
    if (actif) { const el = document.getElementById(actif); if (el && el.focus) el.focus(); }
  }

  // Sur la fiche, sous le Contrôle de l'urbanisme : le dernier compte rendu Géofoncier enregistré.
  function renderGeofoncierFicheUrbanisme(d) {
    const g = d && d.geofoncier;
    if (!g || !g.le) return '';
    const r = Object.assign({ zonages: [], bornages: [], monuments: { statut: 'non_lu', detail: '' } }, g);
    return `<div class="pr-fiche-geofoncier"><div class="section-eyebrow">Géofoncier — lu par CLAIRE le ${escapeHtml(formatDateFr(String(g.le).slice(0, 10)))}${g.compteRendu ? infoBulle(g.compteRendu) : ''}</div>
      ${renderTableauxGeofoncier(r)}${g.aSignaler ? `<p class="hint">${escapeHtml(g.aSignaler)}</p>` : ''}</div>`;
  }

  // ===== « Demander à CLAIRE » : l'outil consulter_site de l'agent (étude 14/10 : « vrai agent IA autonome ») =====

  // Commune (INSEE + nom) et parcelles d'un dossier, comme l'outil les reprend de la fiche.
  async function parametresSitesDossier(d) {
    const e = prefillPreemption(d);
    if (!parcellesDepuisTexte(e.parcelles).length) return { erreur: 'aucune parcelle sur la fiche (section et numéro) : à renseigner d’abord' };
    const erreur = await lireCommunesEtatPreemption(e);
    if (erreur) return { erreur };
    if (!e.insee) return { erreur: 'commune du bien non reconnue (code postal ou adresse de la fiche) : ouvrir le Contrôle de l’urbanisme' };
    return { insee: e.insee, commune: communeOutilSites(e), parcelles: e.parcelles };
  }

  // Lance la consultation, attend qu'elle finisse (12 minutes au plus), propose les PDF dans la conversation, rend le compte rendu.
  async function consulterSiteAgent(e) {
    const d = e && e.dossier_id ? dossiers.find(x => x.id === e.dossier_id) : null;
    if (!d) return { erreur: 'dossier introuvable : cherche-le d’abord (chercher_dossiers)' };
    if (e.site !== 'cadastre' && e.site !== 'geofoncier') return { erreur: 'site inconnu' };
    const p = await parametresSitesDossier(d);
    if (p.erreur) return { erreur: p.erreur };
    const corps = e.site === 'cadastre'
      ? { url: '/api/navigation/plan-cadastre', body: { insee: p.insee, parcelles: p.parcelles, echelle: 0, dossierId: d.id } }
      : { url: '/api/navigation/consultation', body: { site: 'geofoncier', insee: p.insee, commune: p.commune, parcelles: p.parcelles, demande: String(e.precision || '').slice(0, 500), dossierId: d.id } };
    const r = await fetchAvecAuth(corps.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps.body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) return { erreur: j.erreur || `le serveur a répondu ${r.status}` };
    const fin = Date.now() + 12 * 60 * 1000;
    let t = null;
    while (Date.now() < fin) {
      await new Promise(ok => setTimeout(ok, 2000));
      try {
        const rt = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(j.id)}`);
        if (rt.status === 404) return { erreur: 'consultation oubliée par le serveur (redémarré ?)' };
        t = await rt.json();
      } catch (_) { continue; }
      const derniere = (t.etapes || []).slice(-1)[0];
      assistantEtapeAgent = `${e.site === 'cadastre' ? 'cadastre.gouv.fr' : 'Géofoncier'} : ${derniere ? derniere.texte : 'en attente…'}`;
      renderAssistant();
      if (t.etat !== 'attente' && t.etat !== 'en-cours') break;
    }
    if (!t || (t.etat !== 'fini' && t.etat !== 'erreur' && t.etat !== 'annule')) return { erreur: 'la consultation dure trop : elle continue sur le serveur, voir le Contrôle de l’urbanisme' };
    if (t.etat !== 'fini') return { erreur: t.erreur || 'consultation arrêtée' };
    const boutons = [];
    for (const doc of t.documents || []) {
      boutons.push({ libelle: `Ouvrir « ${doc.titre} »`, action: () => ouvrirDocumentSite(t.id, doc.id) });
      if (d.nasDossier) boutons.push({ libelle: `Ranger « ${doc.titre} » dans le dossier du NAS`, action: () => rangerDocumentSite(t.id, doc.id, d.id) });
    }
    if (boutons.length) poserMessageAssistant('claire', `<p>${e.site === 'cadastre' ? 'Plan de situation tiré de cadastre.gouv.fr' : 'Documents rapportés de Géofoncier'} — ${escapeHtml(libelleDossierAffiche(d))} :</p>`, boutons);
    if (e.site === 'cadastre') {
      return { fait: true, echelle: `1/${(t.resultat || {}).echelle || ''}`, parcelles: (t.resultat || {}).parcelles || '',
        documents: (t.documents || []).map(x => x.titre), affiche_a_l_utilisateur: 'boutons Ouvrir / Ranger dans la conversation' };
    }
    const g = geofoncierPourFiche(t.resultat);
    return { fait: true, compte_rendu: g.compteRendu, zonages: g.zonages, monuments_historiques: g.monuments, bornages: g.bornages, a_signaler: g.aSignaler,
      complet: g.complet, documents: (t.documents || []).map(x => x.titre), cout_usd: t.coutUsd };
  }

  // ===== Réglages › Sites consultés par CLAIRE =====
  async function chargerReglagesSites() {
    const etat = document.getElementById('sites-navigateur-etat');
    try {
      const r = await fetchAvecAuth(`/api/navigation/reglages`);
      const j = await r.json();
      const g = j.geofoncier || {};
      const champ = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
      champ('sites-geo-identifiant', g.identifiant);
      champ('sites-geo-adresse', g.adresse);
      champ('sites-navigateur', j.navigateur);
      champ('sites-geo-motdepasse', '');
      const mdp = document.getElementById('sites-geo-motdepasse');
      if (mdp) mdp.placeholder = g.motDePasseEnregistre ? 'Enregistré — laisser vide pour le garder' : 'Aucun mot de passe enregistré';
      if (etat) etat.innerHTML = `<span class="dot-label ${j.navigateurTrouve ? 'dl-success' : 'dl-pret'}"><span class="dot"></span>${j.navigateurTrouve ? escapeHtml(j.navigateurNom) + ' trouvé sur le serveur' : 'Ni Chrome ni Edge trouvé sur le serveur'}</span>
        <span class="dot-label ${j.cleClaude ? 'dl-success' : 'dl-neutre'}"><span class="dot"></span>${j.cleClaude ? 'Clé Claude enregistrée (Géofoncier possible)' : 'Pas de clé Claude : Géofoncier impossible, le plan de situation reste possible'}</span>`;
    } catch (err) {
      if (etat) etat.textContent = `Réglages illisibles : ${err.message}`;
    }
  }

  async function ecrireReglagesSites(corps) {
    const note = document.getElementById('sites-reglages-etat');
    try {
      const r = await fetchAvecAuth(`/api/navigation/reglages`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      if (!r.ok) throw new Error(`réponse ${r.status}`);
      if (note) note.textContent = 'Enregistré.';
      await chargerReglagesSites();
    } catch (err) {
      if (note) note.textContent = `Non enregistré : ${err.message}`;
    }
  }

  function enregistrerReglagesSites() {
    const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const geofoncier = { identifiant: val('sites-geo-identifiant').trim(), adresse: val('sites-geo-adresse').trim() };
    // Mot de passe vide = garder celui enregistré (jamais renvoyé par le serveur) ; « Effacer » l'efface explicitement.
    if (val('sites-geo-motdepasse')) geofoncier.motDePasse = val('sites-geo-motdepasse');
    ecrireReglagesSites({ geofoncier, navigateur: val('sites-navigateur').trim() });
  }

  function effacerMotDePasseGeofoncier() {
    ecrireReglagesSites({ geofoncier: { motDePasse: '' } });
  }
