  // ===== Plan de situation tiré de cadastre.gouv.fr (étude 14/10 : « consulter le site du cadastre et sortir un plan de situation
  // des parcelles, les surligner en fluo jaune pour les repérer comme si c'était fait à la main sans dépasser », « A4 portrait »,
  // « pas de gros rond, toutes les parcelles en entier », « si trop éloignées faire plusieurs plans »). Le SERVEUR conduit son
  // navigateur (server/src/navigateur/), SANS IA ; le poste lance, suit en direct (étapes + capture d'écran), ouvre les PDF et les
  // range dans le dossier du NAS sur clic. Section « Plan de situation » du Contrôle de l'urbanisme, outil consulter_site de
  // « Demander à CLAIRE », état du navigateur dans Réglages › Sites consultés par CLAIRE. (Géofoncier par un agent Claude : retiré
  // le 14/10 au soir par l'étude, « ça utilise des tokens ».) =====

  var ECHELLES_PLAN_SITUATION = [{ cle: 0, libelle: 'Automatique' }, { cle: 500, libelle: '1/500' }, { cle: 1000, libelle: '1/1000' },
    { cle: 2000, libelle: '1/2000' }, { cle: 5000, libelle: '1/5000' }];
  var minuteriesSites = {};       // genre ('plan') → minuterie du suivi
  var capturesSites = {};         // genre → { id: tâche, url: URL d'objet de la dernière capture (libérée à la suivante) }

  // L'état des deux consultations, rangé dans l'état de l'outil (oublié avec lui au changement de dossier).
  function etatSitesPreemption() {
    if (!prEtat) return { echelle: 0, plan: null, aerien: null };
    if (!prEtat.sites) prEtat.sites = { echelle: 0, plan: null, aerien: null };
    return prEtat.sites;
  }

  // Pure : ce qui manque pour lancer une consultation (commune et parcelles de l'outil). Rend '' si rien ne manque.
  function manqueConsultationSites(e) {
    if (!e || !e.insee) return 'Choisissez d’abord la commune (code postal) dans « Parcelle et zonage ».';
    if (!parcellesDepuisTexte(e.parcelles).length) return 'Indiquez d’abord les parcelles (section et numéro) dans « Parcelle et zonage ».';
    return '';
  }

  // Pure : les parcelles telles que l'outil les a lues (« AB 12 et 13 », « AB 12, 13 » → « AB 12, AB 13 ») — le serveur reçoit
  // toujours cette forme (relecture 0.229.0 : son lecteur ne connaît pas les formes abrégées).
  function parcellesNormaliseesSites(texte) {
    return parcellesDepuisTexte(texte).map(p => `${p.section} ${p.numero}`).join(', ');
  }

  // Pure : nom de la commune choisie dans l'outil.
  function communeOutilSites(e) {
    const c = (e && e.communes || []).find(x => x.insee === e.insee);
    return c ? c.nom : '';
  }

  function changerEchelleSites(valeur) { etatSitesPreemption().echelle = Number(valeur) || 0; }

  async function lancerPlanSituation() {
    const e = prEtat;
    const manque = manqueConsultationSites(e);
    if (manque) { afficherToast(manque); return; }
    const st = etatSitesPreemption();
    st.plan = { id: '', etat: 'envoi', etapes: [], documents: [] };
    renderSitesPreemption();
    try {
      const r = await fetchAvecAuth(`/api/navigation/plan-cadastre`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insee: e.insee, parcelles: parcellesNormaliseesSites(e.parcelles), echelle: st.echelle, dossierId: e.dossierId || '' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new Error(j.erreur || `réponse ${r.status}`);
      st.plan = { id: j.id, etat: 'attente', etapes: [], documents: [] };
      suivreTacheSite('plan');
    } catch (err) {
      st.plan = { id: '', etat: 'erreur', erreur: err.message, etapes: [], documents: [] };
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
        if (j.avecCapture && (j.etat === 'en-cours' || !capturesSites[genre] || capturesSites[genre].id !== j.id)) await chargerCaptureSite(genre, j.id);
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
      if (capturesSites[genre]) URL.revokeObjectURL(capturesSites[genre].url);
      capturesSites[genre] = { id, url };
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

  // Pure : une ligne par plan tiré (échelle, parcelles ; échelle demandée relevée dite).
  function lignesPlansSites(resultat) {
    const r = resultat || {};
    const plans = Array.isArray(r.plans) && r.plans.length ? r.plans : [{ echelle: r.echelle, echelleRelevee: r.echelleRelevee, parcelles: r.parcelles }];
    return plans.map((p, i) => `${plans.length > 1 ? `Plan ${i + 1}/${plans.length} : ` : 'Extrait '}au 1/${p.echelle || ''} — parcelles ${p.parcelles || ''}${p.echelleRelevee ? ' (échelle demandée trop fine pour tout faire tenir)' : ''}.`);
  }

  // ===== Plan aérien IGN (étude 15/10 : « mettre les numéros de parcelle sur le plan IGN pour comparer et créer le pourcentage ») :
  // la photographie aérienne de l'IGN avec les parcelles du dossier surlignées et numérotées, les parcelles voisines numérotées, et la
  // PART de chaque zone du document d'urbanisme dans chaque parcelle. Services ouverts de l'IGN, lus par le serveur : ni navigateur,
  // ni IA, ni jeton. =====

  async function lancerPlanAerien() {
    const e = prEtat;
    const manque = manqueConsultationSites(e);
    if (manque) { afficherToast(manque); return; }
    const st = etatSitesPreemption();
    st.aerien = { etat: 'envoi' };
    st.aerienCle = `${e.insee}|${parcellesNormaliseesSites(e.parcelles)}`;
    renderSitesPreemption();
    try {
      const r = await fetchAvecAuth(`/api/urbanisme/plan-aerien`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insee: e.insee, parcelles: parcellesNormaliseesSites(e.parcelles), dossierId: e.dossierId || '' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new Error(j.erreur || `réponse ${r.status}`);
      if (etatSitesPreemption() === st) st.aerien = Object.assign({ etat: 'fini' }, j);
    } catch (err) {
      if (etatSitesPreemption() === st) st.aerien = { etat: 'erreur', erreur: err.message };
    }
    renderSitesPreemption();
  }

  async function ouvrirPlanAerien(id) {
    const fenetre = window.open('', '_blank');
    try {
      const r = await fetchAvecAuth(`/api/urbanisme/plan-aerien/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || `réponse ${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      if (fenetre) fenetre.location = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60 * 60 * 1000);
    } catch (err) {
      if (fenetre) fenetre.close();
      afficherToast(`Plan indisponible : ${err.message}`);
    }
  }

  async function rangerPlanAerien(id) {
    const dossierId = prEtat && prEtat.dossierId;
    if (!dossierId) { afficherToast('Choisissez d’abord le dossier suivi.'); return; }
    try {
      const r = await fetchAvecAuth(`/api/urbanisme/plan-aerien/${encodeURIComponent(id)}/ranger`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dossierId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erreur || `réponse ${r.status}`);
      afficherToast(`Rangé dans le dossier du NAS : ${String(j.chemin || '').split(/[\\/]/).pop()}`);
    } catch (err) {
      afficherToast(`Non rangé : ${err.message}`);
    }
  }

  // Pure : « 66,6 % » (une décimale, virgule).
  function pourcentageZonage(valeur) {
    return `${String(Math.round(Number(valeur) * 10) / 10).replace('.', ',')} %`;
  }

  // Pure : les lignes du tableau des parts de zone — une par parcelle et par zone, « hors zone » seulement s'il y en a.
  function lignesZonagePlanAerien(plans) {
    const lignes = [];
    (plans || []).forEach((plan) => (plan.parcelles || []).forEach((p) => {
      const nom = `${p.section} ${p.numero}`;
      if (!p.zonageLu) { lignes.push({ parcelle: nom, zone: 'Zonage non lu (Géoportail de l’urbanisme injoignable)', part: '' }); return; }
      if (!p.zones.length) { lignes.push({ parcelle: nom, zone: p.rnu ? 'Règlement national d’urbanisme (pas de document)' : 'Aucune zone publiée sur cette parcelle', part: '' }); return; }
      p.zones.forEach((z) => lignes.push({ parcelle: nom, zone: z.libelong ? `${z.libelle} — ${z.libelong}` : z.libelle, part: pourcentageZonage(z.pourcentage) }));
      if (p.horsZone >= 0.5) lignes.push({ parcelle: nom, zone: 'Hors zone du document', part: pourcentageZonage(p.horsZone) });
    }));
    return lignes;
  }

  // Les parts de zone et les servitudes patrimoniales du plan rendu.
  function renderResultatPlanAerien(a) {
    const d = prEtat && prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
    const lignes = lignesZonagePlanAerien(a.plans);
    const servitudes = [];
    (a.plans || []).forEach((plan) => (plan.parcelles || []).forEach((p) => (p.patrimoine.servitudes || []).forEach((s) => { const t = s.nom ? `${s.libelle} — ${s.nom}` : s.libelle; if (!servitudes.includes(t)) servitudes.push(t); })));
    const lu = (a.plans || []).every((plan) => (plan.parcelles || []).every((p) => p.patrimoine.lu));
    return `<ul class="sites-docs"><li class="sites-doc">
        <span class="sites-doc-icone">${icone('file-text')}</span>
        <span class="sites-doc-texte"><span class="sites-doc-titre">${escapeHtml(a.nom || 'Plan aérien.pdf')}</span><span class="hint">PDF · ${Math.max(1, Math.round((a.taille || 0) / 1024))} Ko${(a.plans || []).length > 1 ? ` · ${(a.plans || []).length} plans` : ''}</span></span>
        <wa-button appearance="outlined" size="s" onclick="ouvrirPlanAerien('${escapeOnclickArg(a.id)}')">Ouvrir</wa-button>
        ${d && d.nasDossier ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="rangerPlanAerien('${escapeOnclickArg(a.id)}')" title="Ranger dans le dossier du NAS" aria-label="Ranger dans le dossier du NAS">${icone('folder')}</wa-button>` : ''}
      </li></ul>
      <table class="sites-zonage"><thead><tr><th>Parcelle</th><th>Zone</th><th>Part de la parcelle</th></tr></thead><tbody>${lignes.map(l => `<tr><td>${escapeHtml(l.parcelle)}</td><td>${escapeHtml(l.zone)}</td><td>${escapeHtml(l.part)}</td></tr>`).join('')}</tbody></table>
      <p class="hint">${icone(servitudes.length ? 'alert-triangle' : 'check')} ${escapeHtml(servitudes.length ? `Protection du patrimoine : ${servitudes.slice(0, 3).join(' ; ')}.` : lu ? 'Aucune servitude de protection du patrimoine publiée sur ces parcelles.' : 'Protection du patrimoine non lue : à vérifier sur le Géoportail de l’urbanisme.')}</p>`;
  }

  // Les étapes et la capture d'une consultation en cours.
  function renderSuiviTacheSite(genre, t) {
    const enCours = t.etat === 'attente' || t.etat === 'en-cours' || t.etat === 'envoi';
    const etapes = (t.etapes || []).slice(-6);
    // La capture de CETTE consultation seulement (jamais celle d'un autre dossier restée affichée).
    const capture = capturesSites[genre] && capturesSites[genre].id === t.id ? capturesSites[genre].url : '';
    return `<div class="sites-suivi">
        ${capture && enCours ? `<img class="sites-capture" src="${escapeAttr(capture)}" alt="Ce que CLAIRE voit sur le site">` : ''}
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

  // La section de l'outil.
  function renderSitesPreemption() {
    // La fiche de dépôt de la DIA suit la même commune (client/70-depot-dia.js).
    lancerDepotDia();
    renderDepotDia();
    const zone = document.getElementById('pr-sites');
    if (!zone) return;
    const e = prEtat || etatPreemptionVierge();
    const st = etatSitesPreemption();
    // Un plan aérien tiré pour d'autres parcelles ne reste pas affiché (ni rangeable) quand la commune ou les parcelles changent.
    const cleAerien = `${e.insee}|${parcellesNormaliseesSites(e.parcelles)}`;
    if (st.aerien && st.aerienCle && st.aerienCle !== cleAerien && st.aerien.etat !== 'envoi') st.aerien = null;
    const manque = manqueConsultationSites(e);
    const plan = st.plan;
    const aerien = st.aerien;
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
          : plan.etat === 'fini' ? `${lignesPlansSites(plan.resultat).map(l => `<p class="hint">${icone('check')} ${escapeHtml(l)}</p>`).join('')}
              ${renderDocumentsSite(plan)}`
          : `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(plan.erreur || 'Consultation arrêtée.')}</p>`) : ''}
      </div>
      <div class="sites-carte">
        <div class="sites-carte-tete"><span class="sites-carte-titre">${icone('map-pin')} Plan aérien IGN — numéros de parcelles et zonage</span>
          ${infoBulle('Photographie aérienne de l’IGN : les parcelles du dossier surlignées en jaune fluo avec leur numéro, les parcelles voisines numérotées pour comparer avec le plan du cadastre, et la part de chaque zone du document d’urbanisme dans chaque parcelle (calcul géométrique sur les contours publiés, à titre indicatif).')}</div>
        <div class="sites-ligne">
          <wa-button variant="brand" size="s" onclick="lancerPlanAerien()"${manque || (aerien && aerien.etat === 'envoi') ? ' disabled' : ''}${aerien && aerien.etat === 'envoi' ? ' loading' : ''}>${icone('map-pin')} Tirer le plan aérien</wa-button>
        </div>
        ${aerien ? (aerien.etat === 'envoi' ? '<p class="hint">Lecture de la photographie aérienne, du cadastre et du zonage…</p>'
          : aerien.etat === 'fini' ? renderResultatPlanAerien(aerien)
          : `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(aerien.erreur || 'Plan non tiré.')}</p>`) : ''}
      </div>`;
    if (actif) { const el = document.getElementById(actif); if (el && el.focus) el.focus(); }
  }

  // ===== « Demander à CLAIRE » : l'outil consulter_site de l'agent (plan de situation seulement) =====

  // Commune (INSEE + nom) et parcelles d'un dossier, comme l'outil les reprend de la fiche.
  async function parametresSitesDossier(d) {
    const e = prefillPreemption(d);
    if (!parcellesDepuisTexte(e.parcelles).length) return { erreur: 'aucune parcelle sur la fiche (section et numéro) : à renseigner d’abord' };
    const erreur = await lireCommunesEtatPreemption(e);
    if (erreur) return { erreur };
    if (!e.insee) return { erreur: 'commune du bien non reconnue (code postal ou adresse de la fiche) : ouvrir le Contrôle de l’urbanisme' };
    return { insee: e.insee, commune: communeOutilSites(e), parcelles: parcellesNormaliseesSites(e.parcelles) };
  }

  // Tire le plan de situation, attend qu'il soit prêt, propose les PDF dans la conversation, rend ce qui a été fait.
  async function consulterSiteAgent(e) {
    const d = e && e.dossier_id ? dossiers.find(x => x.id === e.dossier_id) : null;
    if (!d) return { erreur: 'dossier introuvable : cherche-le d’abord (chercher_dossiers)' };
    if (e.site !== 'cadastre') return { erreur: 'site inconnu : seul le plan de situation de cadastre.gouv.fr est disponible' };
    const p = await parametresSitesDossier(d);
    if (p.erreur) return { erreur: p.erreur };
    const r = await fetchAvecAuth('/api/navigation/plan-cadastre', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insee: p.insee, parcelles: p.parcelles, echelle: 0, dossierId: d.id }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) return { erreur: j.erreur || `le serveur a répondu ${r.status}` };
    // La file passe un plan après l'autre : l'attente couvre deux ou trois demandes devant.
    const fin = Date.now() + 10 * 60 * 1000;
    let t = null;
    while (Date.now() < fin) {
      await new Promise(ok => setTimeout(ok, 2000));
      try {
        const rt = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(j.id)}`);
        if (rt.status === 404) return { erreur: 'plan oublié par le serveur (redémarré ?)' };
        t = await rt.json();
      } catch (_) { continue; }
      const derniere = (t.etapes || []).slice(-1)[0];
      assistantEtapeAgent = `cadastre.gouv.fr : ${derniere ? derniere.texte : 'en attente…'}`;
      renderAssistant();
      if (t.etat !== 'attente' && t.etat !== 'en-cours') break;
    }
    if (!t || (t.etat !== 'fini' && t.etat !== 'erreur' && t.etat !== 'annule')) return { erreur: 'le plan prend trop de temps : il continue sur le serveur, voir le Contrôle de l’urbanisme' };
    if (t.etat !== 'fini') return { erreur: t.erreur || 'plan arrêté' };
    const boutons = [];
    for (const doc of t.documents || []) {
      boutons.push({ libelle: `Ouvrir « ${doc.titre} »`, action: () => ouvrirDocumentSite(t.id, doc.id) });
      if (d.nasDossier) boutons.push({ libelle: `Ranger « ${doc.titre} » dans le dossier du NAS`, action: () => rangerDocumentSite(t.id, doc.id, d.id) });
    }
    if (boutons.length) poserMessageAssistant('claire', `<p>Plan de situation tiré de cadastre.gouv.fr — ${escapeHtml(libelleDossierAffiche(d))} :</p>`, boutons);
    return { fait: true, plans: lignesPlansSites(t.resultat), documents: (t.documents || []).map(x => x.titre), affiche_a_l_utilisateur: 'boutons Ouvrir / Ranger dans la conversation' };
  }

  // ===== Réglages › Sites consultés par CLAIRE : le navigateur du serveur =====
  async function chargerReglagesSites() {
    const etat = document.getElementById('sites-navigateur-etat');
    try {
      const r = await fetchAvecAuth(`/api/navigation/reglages`);
      const j = await r.json();
      if (etat) etat.innerHTML = `<span class="dot-label ${j.navigateurTrouve ? 'dl-success' : 'dl-pret'}"><span class="dot"></span>${j.navigateurTrouve ? escapeHtml(j.navigateurNom) + ' trouvé sur le serveur' : 'Ni Chrome ni Edge trouvé sur le serveur : le plan de situation est impossible'}</span>`;
    } catch (err) {
      if (etat) etat.textContent = `État illisible : ${err.message}`;
    }
  }
