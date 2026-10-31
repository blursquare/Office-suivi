  // ===== Où déposer la DIA (étude 15/10 : « rechercher les guichets uniques (GNAU) des communes pour savoir où faire les demandes de
  // déclaration d'intention d'aliéner » — Loir-et-Cher, Loiret, Indre-et-Loire, Indre, Cher). Section « Où déposer la DIA » de la Constitution
  // de dossier d'une vente (étude 31/10 : « la partie où demander la DIA, retire-la du Contrôle et mets-la dans Constitution de vente ») : guichet numérique, courriel ou courrier d'après les pages officielles lues (base livrée par le serveur,
  // server/src/depotDia.js), fiche de la mairie (annuaire du service public) et correction par l'étude. Rien n'est déduit :
  // sans page lue, « à vérifier ». =====

  var MODES_DEPOT_DIA = [
    { cle: 'guichet', libelle: 'Guichet numérique' },
    { cle: 'courriel', libelle: 'Par courriel' },
    { cle: 'courrier', libelle: 'Courrier ou dépôt à la mairie' },
    { cle: 'inconnu', libelle: 'À vérifier' }
  ];

  // L'état de la section, rangé dans l'état de la Constitution (oublié avec lui) : { insee, etat: 'chargement'|'ok'|'erreur', donnees, edition }.
  function porteurDepotDia() { return typeof cstEtat !== 'undefined' && cstEtat ? cstEtat : null; }
  // La commune : celle choisie parmi les communes du dossier (cstEtat.diaCommune), sinon la première dont le code INSEE est connu.
  function communeDepotDia() {
    const e = porteurDepotDia();
    const groupes = e && Array.isArray(e.groupes) ? e.groupes.filter(g => g.info && g.info.etat === 'ok' && g.info.insee) : [];
    return groupes.find(g => g.cle === e.diaCommune) || groupes[0] || null;
  }
  function inseeDepotDia() { const g = communeDepotDia(); return g ? g.info.insee : ''; }
  function etatDepotDia() {
    const e = porteurDepotDia();
    if (!e) return { insee: '', etat: 'vide' };
    if (!e.depotDia) e.depotDia = { insee: '', etat: 'vide' };
    return e.depotDia;
  }
  function poserDepotDia(v) { const e = porteurDepotDia(); if (e) e.depotDia = v; }

  // Pure : une adresse web sûre pour un lien (http/https seulement), sinon ''.
  function lienDepotDiaSur(url) {
    return /^https?:\/\/[^\s"'<>]+$/i.test(String(url || '')) ? String(url) : '';
  }

  // Pure : le libellé du mode.
  function libelleModeDepotDia(mode) {
    const m = MODES_DEPOT_DIA.find(x => x.cle === mode);
    return m ? m.libelle : 'À vérifier';
  }

  // Pure : les lignes lisibles du dépôt d'une commune — ce qu'il faut faire, d'après la base ou la correction de l'étude.
  function lignesDepotDia(donnees) {
    const d = (donnees && donnees.depot) || {};
    const lignes = [];
    if (d.mode === 'guichet') lignes.push(`Dépôt sur le guichet numérique${d.plateforme ? ` (${d.plateforme})` : ''}.`);
    else if (d.mode === 'courriel') lignes.push(`Dépôt par courriel${d.courriel ? ` à ${d.courriel}` : ''}.`);
    else if (d.mode === 'courrier') lignes.push('Dépôt par courrier ou à la mairie.');
    else lignes.push('Procédure de dépôt non relevée : à vérifier auprès de la mairie.');
    if (d.notairesSeulement) lignes.push('Réservé aux notaires.');
    if (d.perimetre) lignes.push(`Périmètre : ${d.perimetre}`);
    if (d.note) lignes.push(d.note);
    return lignes;
  }

  // Charge (une fois par commune) la fiche de dépôt ; le rendu suit.
  function lancerDepotDia() {
    const insee = inseeDepotDia();
    if (!insee) return;
    const st = etatDepotDia();
    if (st.insee === insee && st.etat !== 'vide') return;
    poserDepotDia({ insee, etat: 'chargement' });
    const porteur = porteurDepotDia();
    const encore = () => porteurDepotDia() === porteur && inseeDepotDia() === insee;
    fetchAvecAuth(`/api/urbanisme/depot-dia?insee=${encodeURIComponent(insee)}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!encore()) return;
        poserDepotDia(r.ok ? { insee, etat: 'ok', donnees: j } : { insee, etat: 'erreur', erreur: j.erreur || `réponse ${r.status}` });
        renderDepotDia();
      })
      .catch(() => { if (encore()) { poserDepotDia({ insee, etat: 'erreur', erreur: 'Serveur injoignable.' }); renderDepotDia(); } });
  }

  // Le bouton du guichet au-dessus (renderGnauConstitution) lit le dépôt chargé avec la commune : après une correction de l'étude, une
  // adresse nouvelle n'y est pas encore — elle reste alors dans la carte (relecture 0.416.0).
  function guichetDejaMontreDepotDia(url) {
    const g = communeDepotDia();
    const d = g && g.info && g.info.depot;
    return !!(d && lienDepotDiaSur(d.url) === url);
  }

  // Plusieurs communes dans le dossier : le choix de celle dont on montre le dépôt.
  function choisirCommuneDepotDia(cle) {
    const e = porteurDepotDia();
    if (!e) return;
    e.diaCommune = cle;
    if (typeof renderConstitution === 'function') renderConstitution(); else { lancerDepotDia(); renderDepotDia(); }
  }

  function ouvrirCorrectionDepotDia() {
    const st = etatDepotDia();
    if (st.etat !== 'ok') return;
    const d = st.donnees.depot || {};
    st.edition = { mode: d.mode || 'guichet', plateforme: d.plateforme || '', url: d.url || '', courriel: d.courriel || '', note: d.note || '' };
    renderDepotDia();
  }

  function fermerCorrectionDepotDia() {
    const st = etatDepotDia();
    st.edition = null;
    renderDepotDia();
  }

  async function enregistrerCorrectionDepotDia() {
    const st = etatDepotDia();
    if (st.etat !== 'ok' || !st.edition || st.enregistrement) return;
    st.enregistrement = true;
    const val = (id) => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    const corps = { mode: val('depot-dia-mode') || 'inconnu', plateforme: val('depot-dia-plateforme'), url: val('depot-dia-url'), courriel: val('depot-dia-courriel'), note: val('depot-dia-note'), par: typeof utilisateurPoste === 'string' ? utilisateurPoste : '' };
    try {
      const r = await fetchAvecAuth(`/api/urbanisme/depot-dia/${encodeURIComponent(st.insee)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erreur || `réponse ${r.status}`);
      poserDepotDia({ insee: st.insee, etat: 'vide' });
      afficherToast('Dépôt de la DIA corrigé pour cette commune.');
      lancerDepotDia();
    } catch (err) {
      afficherToast(`Non enregistré : ${err.message}`);
    } finally { st.enregistrement = false; }
  }

  async function oublierCorrectionDepotDia() {
    const st = etatDepotDia();
    if (st.etat !== 'ok') return;
    try {
      const r = await fetchAvecAuth(`/api/urbanisme/depot-dia/${encodeURIComponent(st.insee)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`réponse ${r.status}`);
      poserDepotDia({ insee: st.insee, etat: 'vide' });
      lancerDepotDia();
    } catch (err) {
      afficherToast(`Non retiré : ${err.message}`);
    }
  }

  function copierCourrielDepotDia(courriel) {
    if (navigator.clipboard) navigator.clipboard.writeText(courriel).then(() => afficherToast('Adresse copiée.')).catch(() => {});
  }

  function renderFormulaireDepotDia(ed) {
    return `<div class="depot-dia-form">
        <div class="calc-champ"><label for="depot-dia-mode">Comment la déposer</label>
          <select id="depot-dia-mode">${MODES_DEPOT_DIA.map(m => `<option value="${m.cle}"${m.cle === ed.mode ? ' selected' : ''}>${escapeHtml(m.libelle)}</option>`).join('')}</select></div>
        <div class="calc-champ"><label for="depot-dia-plateforme">Plateforme</label><input type="text" id="depot-dia-plateforme" value="${escapeAttr(ed.plateforme)}" placeholder="Cart@DS, GNAU…"></div>
        <div class="calc-champ"><label for="depot-dia-url">Adresse du guichet ou de la page</label><input type="text" id="depot-dia-url" value="${escapeAttr(ed.url)}" placeholder="https://…"></div>
        <div class="calc-champ"><label for="depot-dia-courriel">Courriel de dépôt</label><input type="text" id="depot-dia-courriel" value="${escapeAttr(ed.courriel)}"></div>
        <div class="calc-champ"><label for="depot-dia-note">Remarque</label><input type="text" id="depot-dia-note" value="${escapeAttr(ed.note)}"></div>
        <div class="sites-ligne">
          <wa-button variant="brand" size="s" onclick="enregistrerCorrectionDepotDia()">Enregistrer</wa-button>
          <wa-button appearance="outlined" size="s" onclick="fermerCorrectionDepotDia()">Annuler</wa-button>
        </div>
      </div>`;
  }

  // Le cadre de la section dans l'étape « DIA et SAFER » de la Constitution d'une vente ; le contenu suit (renderDepotDia).
  function renderBlocDepotDiaConstitution() {
    const e = porteurDepotDia();
    if (!e || e.type !== 'vente') return '';
    const groupes = (e.groupes || []).filter(g => g.info && g.info.etat === 'ok' && g.info.insee);
    const choisie = communeDepotDia();
    const choix = groupes.length > 1 ? `<wa-button-group label="Commune">${groupes.map(g => `<wa-button appearance="outlined" size="s" class="vue-bascule-btn${choisie && choisie.cle === g.cle ? ' actif' : ''}" type="button" onclick="choisirCommuneDepotDia('${escapeOnclickArg(g.cle)}')">${escapeHtml(g.commune)}</wa-button>`).join('')}</wa-button-group>` : '';
    return `<div class="cst-bloc-titre">Où déposer la DIA ${infoBulle('Guichet numérique, courriel ou courrier d’après les pages officielles lues par CLAIRE (Loir-et-Cher, Loiret, Indre-et-Loire, Indre, Cher), fiche de la mairie de l’annuaire du service public. Corrigeable par l’étude ; rien n’est déduit : sans page lue, « à vérifier ».')}</div>
      ${renderGnauConstitution()}${choix}<div id="cst-depot-dia" class="cst-depot-dia"></div>`;
  }

  // La section : ce qu'il faut faire pour la commune, sa mairie et la correction de l'étude. Le bouton du guichet est juste au-dessus
  // (renderGnauConstitution) : il n'est pas répété ici.
  function renderDepotDia() {
    const zone = document.getElementById('cst-depot-dia');
    if (!zone) return;
    if (!inseeDepotDia()) { zone.innerHTML = '<p class="hint">Commune du bien pas encore retrouvée.</p>'; return; }
    lancerDepotDia();
    const st = etatDepotDia();
    // Un formulaire de correction ouvert n'est pas redessiné (la saisie en cours serait perdue).
    if (st.edition && document.getElementById('depot-dia-mode')) return;
    if (st.etat === 'chargement' || st.etat === 'vide') { zone.innerHTML = '<p class="hint">Lecture du dépôt de la DIA…</p>'; return; }
    if (st.etat === 'erreur') { zone.innerHTML = `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(st.erreur || 'Dépôt de la DIA indisponible.')}</p>`; return; }
    const j = st.donnees;
    const d = j.depot || {};
    if (!j.connue) {
      zone.innerHTML = '<p class="hint">Cette commune n’est pas encore dans la base (Loir-et-Cher, Loiret, Indre-et-Loire, Indre et Cher seulement) : voir la mairie ou son intercommunalité.</p>';
      return;
    }
    const url = lienDepotDiaSur(d.url);
    const source = lienDepotDiaSur(d.source);
    const m = j.mairie;
    const origine = j.origine === 'etude' ? `Corrigé par l’étude${j.modifieLe ? ` le ${formatDateFr(String(j.modifieLe).slice(0, 10))}` : ''}`
      : j.origine === 'commune' ? 'Procédure propre à la commune' : j.origine === 'epci-partiel' ? `Intercommunalité${j.epci ? ` (${j.epci.nom})` : ''} : guichet pour certaines communes seulement` : j.origine === 'epci' ? `Procédure de l’intercommunalité${j.epci ? ` (${j.epci.nom})` : ''}` : 'Rien de relevé';
    const verifie = d.verifieLe && j.origine !== 'etude' ? `${d.indiquePar ? `Indiqué par ${d.indiquePar}` : 'Page lue'} le ${formatDateFr(d.verifieLe)}` : '';
    zone.innerHTML = `<div class="sites-carte">
        <div class="sites-carte-tete"><span class="dot-label ${d.mode === 'inconnu' ? 'dl-neutre' : 'dl-success'}"><span class="dot"></span>${escapeHtml(libelleModeDepotDia(d.mode))}</span></div>
        <ul class="depot-dia-lignes">${lignesDepotDia(j).map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
        ${(url && (d.mode !== 'guichet' || !guichetDejaMontreDepotDia(url))) || d.courriel ? `<div class="sites-ligne">
          ${url && (d.mode !== 'guichet' || !guichetDejaMontreDepotDia(url)) ? `<a class="lien-action" href="${escapeAttr(url)}" target="_blank" rel="noopener">${icone('link')} ${d.mode === 'guichet' ? 'Ouvrir le guichet' : 'Ouvrir la page'}</a>` : ''}
          ${d.courriel ? `<wa-button appearance="outlined" size="s" onclick="copierCourrielDepotDia('${escapeOnclickArg(d.courriel)}')">${icone('mail')} Copier ${escapeHtml(d.courriel)}</wa-button>` : ''}
        </div>` : ''}
        <p class="hint">${escapeHtml([origine, verifie].filter(Boolean).join(' · '))}${source && !d.indiquePar ? ` · <a href="${escapeAttr(source)}" target="_blank" rel="noopener">page lue</a>` : ''}</p>
        ${m ? `<div class="depot-dia-mairie"><span class="pieces-titre">${icone('home')}<span class="pieces-titre-texte">Mairie</span></span>
            <span>${escapeHtml(m.nom)}${m.adresse ? ` — ${escapeHtml(m.adresse)}` : ''}</span>
            <span>${m.telephone ? `Tél. ${escapeHtml(m.telephone)}` : ''}${m.courriel ? ` ${icone('mail')} <a href="mailto:${escapeAttr(m.courriel)}">${escapeHtml(m.courriel)}</a>` : ''}${lienDepotDiaSur(m.site) ? ` <a href="${escapeAttr(lienDepotDiaSur(m.site))}" target="_blank" rel="noopener">${icone('link')} site</a>` : ''}</span></div>`
          : (j.mairieLue ? '' : '<p class="hint">Fiche de la mairie indisponible (annuaire du service public injoignable).</p>')}
        ${st.edition ? renderFormulaireDepotDia(st.edition) : `<div class="sites-ligne">
          <wa-button appearance="outlined" size="s" onclick="ouvrirCorrectionDepotDia()">Corriger</wa-button>
          ${j.origine === 'etude' ? '<wa-button appearance="plain" size="s" onclick="oublierCorrectionDepotDia()">Revenir à la base</wa-button>' : ''}
        </div>`}
      </div>`;
  }
