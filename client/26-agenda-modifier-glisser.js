  // ==== MODIFIER ET GLISSER-DÉPOSER UN RENDEZ-VOUS (étude, 01/10 : « permettre de pouvoir modifier un
  // rendez-vous, titre, date horaire et glisser déposé les rendez-vous ») ====
  // Titre, date et heures par « Modifier » dans le détail ; date et heure en glissant le rendez-vous
  // dans les vues Semaine et Jour (souris ou stylet — au doigt, la grille défile : « Modifier »).
  // Un glisser se confirme avant d'écrire dans l'agenda partagé (choix de l'étude). Le rendez-vous de
  // signature d'un dossier emmène la date et l'heure de la fiche (choix de l'étude).

  // Pure : un rendez-vous que CLAIRE sait modifier — lu dans l'agenda de l'office (identifiant
  // Exchange), ni signature encore absente d'Outlook, ni carte fantôme, ni option d'un sondage (ses
  // créneaux sont ceux proposés aux parties).
  function evenementModifiableAgenda(e) {
    return !!(e && e.itemId && !e.horsAgenda && !e.fantome && !e.option && !e.archive);
  }

  // Pure : minutes depuis minuit → « HH:MM ».
  function heureDepuisMinutesAgenda(m) {
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  // Pure : horaire d'un rendez-vous glissé de `deltaMinutes` — décalage au quart d'heure, même durée,
  // dans la journée. null si l'heure de départ est illisible.
  function horaireGlisseAgenda(heure, heureFin, deltaMinutes) {
    const debut = minutesHeure(heure);
    if (debut == null) return null;
    const finLue = minutesHeure(heureFin);
    const duree = finLue != null && finLue > debut ? finLue - debut : 60;
    const nouveau = Math.max(0, Math.min(debut + Math.round((Number(deltaMinutes) || 0) / 15) * 15, 24 * 60 - duree));
    return { heure: heureDepuisMinutesAgenda(nouveau), heureFin: heureDepuisMinutesAgenda(Math.min(nouveau + duree, 23 * 60 + 59)) };
  }

  // Pure : horaire d'un rendez-vous dont on tire le bord du haut (le début) ou du bas (la fin)
  // (étude, 01/10 : « réduire ou agrandir un rendez-vous en chopant le bas ou le haut ») — au quart
  // d'heure, 15 min au moins, dans la journée. null si l'heure de départ est illisible.
  function horaireRedimensionneAgenda(heure, heureFin, bord, deltaMinutes) {
    const debut = minutesHeure(heure);
    if (debut == null) return null;
    const finLue = minutesHeure(heureFin);
    const fin = finLue != null && finLue > debut ? finLue : Math.min(debut + 60, 23 * 60 + 59);
    const pas = Math.round((Number(deltaMinutes) || 0) / 15) * 15;
    if (bord === 'bas') {
      return { heure: heureDepuisMinutesAgenda(debut), heureFin: heureDepuisMinutesAgenda(Math.max(debut + 15, Math.min(fin + pas, 23 * 60 + 59))) };
    }
    if (bord === 'haut') {
      return { heure: heureDepuisMinutesAgenda(Math.min(fin - 15, Math.max(0, debut + pas))), heureFin: heureDepuisMinutesAgenda(fin) };
    }
    return null;
  }

  // Pure : le rendez-vous est la signature fixée sur la fiche du dossier — elle suivra la modification.
  function signatureSuitAgenda(d, e) {
    return !!(d && e && e.signature && !d.archive && d.rendezVousSignature === e.date);
  }

  function ouvrirModificationAgenda(cle) {
    const e = agendaEvenements.find(x => cleEvenementAgenda(x) === cle);
    if (!evenementModifiableAgenda(e)) return;
    if (!exchangeAgendaPret()) { afficherToast('Connexion à l’agenda Outlook à activer dans les Réglages pour modifier un rendez-vous.', 'OK', null); return; }
    agendaModale = { type: 'modification', cle };
    // Le détail se ferme : sur téléphone, sa feuille passerait au-dessus du voile de la fenêtre.
    agendaSelection = null;
    renderPopoverAgenda();
    const contenu = document.getElementById('agenda-modale-contenu');
    if (contenu) contenu.innerHTML = '';
    renderModaleAgenda();
    const champ = document.getElementById('agenda-modif-titre');
    if (champ) champ.focus({ preventScroll: true });
  }

  function renderModificationAgenda(m) {
    const e = agendaEvenements.find(x => cleEvenementAgenda(x) === m.cle);
    if (!e) return '';
    const suit = signatureSuitAgenda(dossierDeEvenement(e), e);
    const typeActuel = typeEvenementAgenda(e, categoriesRdvReglees());
    const quand = e.journeeEntiere || !e.heure
      ? `<div class="ag-champs-ligne ag-champs-deux">
          <label class="ag-champ">Du <input type="date" id="agenda-modif-date" value="${escapeAttr(e.date)}" required></label>
          <label class="ag-champ">Au <input type="date" id="agenda-modif-date-fin" value="${escapeAttr(e.dateFin || e.date)}" required></label>
        </div>`
      : `<div class="ag-champs-ligne">
          <label class="ag-champ">Date <input type="date" id="agenda-modif-date" value="${escapeAttr(e.date)}" required></label>
          <label class="ag-champ">Début <input type="time" id="agenda-modif-heure" value="${escapeAttr(e.heure)}" step="900" required></label>
          <label class="ag-champ">Fin <input type="time" id="agenda-modif-heure-fin" value="${escapeAttr(e.heureFin || heureDepuisMinutesAgenda(Math.min(minutesHeure(e.heure) + 60, 23 * 60 + 59)))}" step="900" required></label>
        </div>`;
    return `<header class="ag-modale-tete">
        <div><h2 class="ag-modale-titre" id="agenda-modale-titre">Modifier le rendez-vous</h2>
        <div class="ag-modale-quand">Dans l’agenda partagé de l’office${suit ? ' · la date de signature de la fiche suivra' : ''}</div></div>
        <button type="button" class="icon-btn ag-modale-x" onclick="fermerModaleAgenda()" aria-label="Fermer">${icone('x')}</button>
      </header>
      <form class="ag-modale-corps ag-form" onsubmit="event.preventDefault(); enregistrerModificationAgenda();">
        <label class="ag-champ">Titre <input type="text" id="agenda-modif-titre" required maxlength="200" value="${escapeAttr(e.sujet || '')}"></label>
        ${quand}
        <div class="rdv-type-choix" role="radiogroup" aria-label="Catégorie du rendez-vous">
          <label class="rdv-type-option"><input type="radio" name="agenda-modif-type" value=""${typeActuel ? '' : ' checked'}><span class="rdv-type-pastille"></span>Sans catégorie</label>
          ${Object.entries(CATEGORIES_AGENDA).map(([cle, t]) => `<label class="rdv-type-option"><input type="radio" name="agenda-modif-type" value="${cle}"${typeActuel === cle ? ' checked' : ''}><span class="rdv-type-pastille rdv-type-${cle}"></span>${t.libelle}</label>`).join('')}
        </div>
        <footer class="ag-modale-pied ag-modale-pied-form">
          <span class="jour-espace"></span>
          <wa-button appearance="outlined" class="secondary" onclick="fermerModaleAgenda()">Annuler</wa-button>
          <wa-button variant="brand" type="submit" class="primary" id="agenda-modif-ok">${icone('check')} Enregistrer</wa-button>
        </footer>
      </form>`;
  }

  function enregistrerModificationAgenda() {
    const e = agendaModale && agendaModale.type === 'modification' ? agendaEvenements.find(x => cleEvenementAgenda(x) === agendaModale.cle) : null;
    if (!e) return;
    const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const sujet = val('agenda-modif-titre');
    const date = val('agenda-modif-date');
    const journee = e.journeeEntiere || !e.heure;
    const nouveau = journee
      ? { sujet, date, dateFin: val('agenda-modif-date-fin') || date, journeeEntiere: true }
      : { sujet, date, heure: val('agenda-modif-heure'), heureFin: val('agenda-modif-heure-fin') };
    if (!sujet) { afficherToast('Le titre ne peut pas être vide.', 'OK', null); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { afficherToast('Date invalide.', 'OK', null); return; }
    if (journee && nouveau.dateFin < date) { afficherToast('Le dernier jour doit suivre le premier.', 'OK', null); return; }
    if (!journee && (!/^\d{2}:\d{2}$/.test(nouveau.heure) || !/^\d{2}:\d{2}$/.test(nouveau.heureFin) || nouveau.heureFin <= nouveau.heure)) {
      afficherToast('L’heure de fin doit suivre l’heure de début.', 'OK', null); return;
    }
    const choixType = document.querySelector('input[name="agenda-modif-type"]:checked');
    const typeAvant = typeEvenementAgenda(e, categoriesRdvReglees());
    const typeApres = choixType && CATEGORIES_AGENDA[choixType.value] ? choixType.value : '';
    if (typeApres !== typeAvant) {
      if (typeApres && !categoriesRdvReglees()[typeApres]) { afficherToast('Nom de la catégorie Outlook à régler d’abord (Réglages › Agenda et Outlook).', 'OK', null); return; }
      nouveau.categories = categoriesApresChangement(e.categories, categoriesRdvReglees(), typeApres);
      nouveau.typeRdv = typeApres;
    }
    const inchange = sujet === (e.sujet || '') && date === e.date && typeApres === typeAvant
      && (journee ? nouveau.dateFin === (e.dateFin || e.date) : nouveau.heure === e.heure && nouveau.heureFin === (e.heureFin || ''));
    if (inchange) { fermerModaleAgenda(); return; }
    const ecrire = async () => {
      const bouton = document.getElementById('agenda-modif-ok');
      if (bouton) bouton.disabled = true;
      const ok = await modifierEvenementAgenda(e, nouveau);
      if (bouton) bouton.disabled = false;
      if (ok) { agendaModale = null; renderModaleAgenda(); }
    };
    // Mêmes règles de l'étude qu'à la création : une exception se confirme.
    const motif = journee ? '' : motifCreneauExceptionnel(nouveau.heure, minutesHeure(nouveau.heureFin) - minutesHeure(nouveau.heure),
      rendezVousHorairesJour(agendaEvenements.filter(x => x !== e), date).length);
    const d = dossierDeEvenement(e);
    if (typeApres === 'annule' && typeAvant !== 'annule' && signatureSuitAgenda(d, e)) {
      demanderConfirmation(`Marquer la signature de ${libelleDossierAffiche(d)} du ${dateAvecJourFr(e.date)} « annulée / à replacer » ? La date quitte la fiche et le dossier revient dans « Rendez-vous à placer ». Le rendez-vous reste dans Outlook, en jaune.`, ecrire, { bouton: 'Marquer à replacer', ton: 'valider' });
    } else if (motif) demanderConfirmation(`Enregistrer ce rendez-vous malgré tout ? Il est exceptionnel : ${motif}.`, ecrire, { bouton: 'Enregistrer quand même', ton: 'valider' });
    else ecrire();
  }

  // Écrit la modification dans l'agenda de l'office (un seul essai), met la page et, pour la
  // signature d'un dossier, la fiche à jour. `nouveau` : { sujet?, date, heure, heureFin } ou
  // { sujet?, date, dateFin, journeeEntiere: true }.
  async function modifierEvenementAgenda(e, nouveau) {
    const avant = { sujet: e.sujet, date: e.date, heure: e.heure, heureFin: e.heureFin };
    const d = dossierDeEvenement(e);
    const suit = signatureSuitAgenda(d, e);
    try {
      const reponse = await fetchAvecAuth('/api/exchange/evenement/modifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify((({ typeRdv, ...envoi }) => envoi)({ itemId: e.itemId, changeKey: e.changeKey || '', ...nouveau }))
      });
      const corps = await reponse.json();
      if (!corps.ok) {
        afficherToast(corps.message || 'La modification du rendez-vous a échoué.', 'OK', null);
        if (corps.introuvable || corps.raison === 'conflit') chargerAgendaSemaine();
        return false;
      }
      const ancienneCle = cleEvenementAgenda(e);
      if (nouveau.sujet !== undefined) e.sujet = nouveau.sujet;
      e.date = nouveau.date;
      if (nouveau.journeeEntiere) e.dateFin = nouveau.dateFin || nouveau.date;
      else { e.dateFin = nouveau.date; e.heure = nouveau.heure; e.heureFin = nouveau.heureFin; }
      if (Array.isArray(nouveau.categories)) e.categories = nouveau.categories.slice();
      if (corps.itemId) e.itemId = corps.itemId;
      if (corps.changeKey) e.changeKey = corps.changeKey;
      // La note relue garde son ChangeKey : il a changé avec l'écriture.
      if (notesAgenda[e.itemId] && corps.changeKey) notesAgenda[e.itemId].changeKey = corps.changeKey;
      if (agendaSelection === ancienneCle) agendaSelection = cleEvenementAgenda(e);
      const quand = (x) => `${formatDateFr(x.date)}${x.heure ? ' à ' + x.heure : ''}`;
      const typeRdv = nouveau.typeRdv;
      if (suit && typeRdv === 'annule') {
        // Signature « annulée / à replacer » (étude, 01/10) : la date quitte la fiche, le dossier
        // revient « à placer » ; même effet que la lecture de l'agenda côté serveur.
        marquerSignatureAReplacerClient(d, e.date, e.heure || '');
        notifierSignatureAReplacer(d, d.rendezVousARemplacer.date, d.rendezVousARemplacer.heure);
        sauvegarder(d);
        render();
        afficherToast(`Signature à replacer : ${libelleDossierAffiche(d)} revient dans « Rendez-vous à placer ».`, 'OK', null);
        renderPageAgenda();
        return true;
      }
      if (!suit && d && e.signature && typeRdv !== undefined && typeRdv !== 'annule' && !d.rendezVousSignature && d.rendezVousARemplacer) {
        // Sorti du jaune : la signature est maintenue (ou replacée à la nouvelle date).
        d.rendezVousSignature = e.date;
        if (e.heure) d.rendezVousSignatureHeure = e.heure;
        if (TYPES_RDV[typeRdv]) d.rendezVousType = typeRdv;
        d.rdvAgendaItem = { itemId: e.itemId, changeKey: e.changeKey || '', date: e.date };
        d.detectionsAgenda = Object.assign({}, d.detectionsAgenda || {}, { rendezVousSignature: e.date });
        delete d.detectionsAgenda.rendezVousRetire;
        delete d.rendezVousARemplacer;
        d.confiance = d.confiance || {};
        d.confiance.rendezVousSignature = 'manuel';
        ajouterHistorique(d, `Rendez-vous de signature replacé depuis l’agenda : ${quand(e)}.`);
        notifierDateAjoutee(d, LIBELLES_CATEGORIE.rendezVousSignature || 'Rendez-vous de signature', e.date, '', { heure: e.heure || '' });
        sauvegarder(d);
        render();
        afficherToast(`Signature de ${libelleDossierAffiche(d)} replacée le ${dateAvecJourFr(e.date)}.`, 'OK', null);
        renderPageAgenda();
        return true;
      }
      if (suit && TYPES_RDV[typeRdv]) d.rendezVousType = typeRdv;
      if (suit) {
        d.rendezVousSignature = e.date;
        if (e.heure && !nouveau.journeeEntiere) { d.rendezVousSignatureHeure = e.heure; d.rendezVousSignatureHeureFin = e.heureFin || ''; }
        d.rdvAgendaItem = { itemId: e.itemId, changeKey: e.changeKey || '', date: e.date };
        d.confiance = d.confiance || {};
        d.confiance.rendezVousSignature = 'manuel';
        ajouterHistorique(d, `Rendez-vous de signature modifié depuis l’agenda : ${quand(avant)} → ${quand(e)}.`);
        // Le responsable est prévenu comme pour une date changée sur la fiche (étude, 01/10).
        notifierDateAjoutee(d, LIBELLES_CATEGORIE.rendezVousSignature || 'Rendez-vous de signature', e.date, avant.date,
          { heure: e.heure || '', ancienneHeure: avant.heure || '' });
        sauvegarder(d);
        render();
      } else if (d) {
        ajouterHistorique(d, `Rendez-vous « ${e.sujet} » modifié dans l’agenda de l’office : ${quand(avant)} → ${quand(e)}.`);
        sauvegarder(d);
      }
      afficherToast(suit ? 'Rendez-vous modifié — la fiche du dossier suit.' : 'Rendez-vous modifié dans l’agenda de l’office.', 'OK', null);
      renderPageAgenda();
      return true;
    } catch (err) {
      afficherToast('Serveur injoignable — rendez-vous non modifié.', 'OK', null);
      return false;
    }
  }

  // Signature marquée « annulé / à replacer » (miroir de marquerSignatureAReplacer, agendaWatch.js).
  function marquerSignatureAReplacerClient(d, date, heure) {
    d.rendezVousARemplacer = { date, heure: d.rendezVousSignatureHeure || heure || '', le: isoAujourdhuiLocal() };
    d.detectionsAgenda = Object.assign({}, d.detectionsAgenda || {}, { rendezVousRetire: date });
    delete d.detectionsAgenda.rendezVousSignature;
    ajouterHistorique(d, `Rendez-vous de signature du ${formatDateFr(date)} marqué « annulé / à replacer » depuis l’agenda — à replacer.`);
    d.rendezVousSignature = null;
    d.rendezVousSignatureHeure = '';
    d.rendezVousSignatureHeureFin = '';
    d.rendezVousSignatureCategories = [];
  }

  // ---- Glisser-déposer dans la grille (vues Semaine et Jour) ----
  let agendaGlisse = null;     // { e, el, x0, y0, actif, mode: 'deplacer'|'haut'|'bas', colonnes, minutesParPx, fantome, cible }
  let agendaClicIgnore = false;

  function attributGlisseAgenda(e) {
    return evenementModifiableAgenda(e) && e.heure && !e.journeeEntiere && exchangeAgendaPret() ? ' data-glissable="1"' : '';
  }

  // Poignées du haut et du bas d'une carte glissable : on les tire pour changer le début ou la fin.
  function poigneesAgenda(e) {
    return attributGlisseAgenda(e)
      ? '<span class="ag-poignee ag-poignee-haut" data-poignee="haut" aria-hidden="true"></span><span class="ag-poignee ag-poignee-bas" data-poignee="bas" aria-hidden="true"></span>'
      : '';
  }

  function finirGlisseAgenda(annule) {
    const g = agendaGlisse;
    agendaGlisse = null;
    if (!g || !g.actif) return;
    if (g.fantome && g.fantome.parentNode) g.fantome.parentNode.removeChild(g.fantome);
    if (g.el) g.el.classList.remove('ag-glisse-origine');
    document.body.classList.remove('ag-glisse-en-cours');
    // Le clic qui suit le lâcher n'ouvre pas le détail.
    agendaClicIgnore = true;
    setTimeout(() => { agendaClicIgnore = false; }, 60);
    const c = g.cible;
    document.body.classList.remove('ag-redim-en-cours');
    if (g.mode !== 'deplacer') {
      if (annule || !c || (c.heure === g.e.heure && c.heureFin === g.e.heureFin)) return;
      const e = g.e;
      const suitR = signatureSuitAgenda(dossierDeEvenement(e), e);
      const duree = minutesHeure(c.heureFin) - minutesHeure(c.heure);
      const motifR = motifCreneauExceptionnel(c.heure, duree, rendezVousHorairesJour(agendaEvenements.filter(x => x !== e), e.date).length);
      demanderConfirmation(`Changer l’horaire de « ${e.sujet || 'sans titre'} » le ${dateAvecJourFr(e.date)} : ${c.heure.replace(':', ' h ')} – ${c.heureFin.replace(':', ' h ')} (${dureeRendezVous(c.heure, c.heureFin)}) ?`
        + `${suitR && c.heure !== e.heure ? ' L’heure de signature de la fiche suivra.' : ''}${motifR ? ` Créneau exceptionnel : ${motifR}.` : ''}`,
        () => modifierEvenementAgenda(e, { date: e.date, heure: c.heure, heureFin: c.heureFin }), { bouton: 'Modifier', ton: 'valider' });
      return;
    }
    if (annule || !c || (c.date === g.e.date && c.heure === g.e.heure)) return;
    const e = g.e;
    const suit = signatureSuitAgenda(dossierDeEvenement(e), e);
    const motif = motifCreneauExceptionnel(c.heure, minutesHeure(c.heureFin) - minutesHeure(c.heure),
      rendezVousHorairesJour(agendaEvenements.filter(x => x !== e), c.date).length);
    demanderConfirmation(`Déplacer « ${e.sujet || 'sans titre'} » au ${dateAvecJourFr(c.date)} à ${c.heure.replace(':', ' h ')} ?`
      + `${suit ? ' La date de signature de la fiche suivra.' : ''}${motif ? ` Créneau exceptionnel : ${motif}.` : ''}`,
      () => modifierEvenementAgenda(e, { date: c.date, heure: c.heure, heureFin: c.heureFin }), { bouton: 'Déplacer', ton: 'valider' });
  }

  function suivreGlisseAgenda(evt) {
    const g = agendaGlisse;
    if (!g) return;
    if (!g.actif) {
      if (Math.abs(evt.clientX - g.x0) + Math.abs(evt.clientY - g.y0) < 6) return;
      const colonne = g.el.closest('.ag-colonne');
      if (!colonne || !document.body.contains(g.el)) { agendaGlisse = null; return; }
      g.actif = true;
      g.colonnes = Array.from(document.querySelectorAll('#agenda-contenu .ag-colonne[data-jour]'))
        .map(el => ({ iso: el.dataset.jour, el, rect: el.getBoundingClientRect() }));
      g.minutesParPx = (AGENDA_HEURE_FIN - AGENDA_HEURE_DEBUT) * 60 / Math.max(1, colonne.getBoundingClientRect().height);
      g.fantome = g.el.cloneNode(true);
      ['onclick', 'data-cle', 'data-glissable', 'title', 'id'].forEach(a => g.fantome.removeAttribute(a));
      g.fantome.classList.add('ag-glisse-fantome');
      g.fantome.classList.remove('selection');
      g.fantome.setAttribute('aria-hidden', 'true');
      g.fantome.tabIndex = -1;
      const etiquette = document.createElement('span');
      etiquette.className = 'ag-glisse-heure';
      g.fantome.appendChild(etiquette);
      g.el.classList.add('ag-glisse-origine');
      document.body.classList.add(g.mode === 'deplacer' ? 'ag-glisse-en-cours' : 'ag-redim-en-cours');
      g.colonneDepart = colonne;
      if (agendaSelection) { agendaSelection = null; renderPopoverAgenda(); }
    }
    if (!document.body.contains(g.el)) { finirGlisseAgenda(true); return; }
    evt.preventDefault();
    const total = (AGENDA_HEURE_FIN - AGENDA_HEURE_DEBUT) * 60;
    if (g.mode !== 'deplacer') {
      // Bord du haut ou du bas : même jour, même colonne, seule la durée change.
      const r = horaireRedimensionneAgenda(g.e.heure, g.e.heureFin, g.mode, (evt.clientY - g.y0) * g.minutesParPx);
      if (!r) return;
      g.cible = { date: g.e.date, heure: r.heure, heureFin: r.heureFin };
      if (g.fantome.parentNode !== g.colonneDepart) g.colonneDepart.appendChild(g.fantome);
      const haut = Math.max(0, minutesHeure(r.heure) - AGENDA_HEURE_DEBUT * 60);
      const bas = Math.min(total, minutesHeure(r.heureFin) - AGENDA_HEURE_DEBUT * 60);
      g.fantome.style.top = `${(haut / total * 100).toFixed(2)}%`;
      g.fantome.style.height = `${(Math.max(15, bas - haut) / total * 100).toFixed(2)}%`;
      g.fantome.querySelector('.ag-glisse-heure').textContent = `${r.heure} – ${r.heureFin}`;
      const debutR = g.fantome.querySelector('.ag-evt-debut, .ag-evt-heure > span:first-child');
      if (debutR) debutR.textContent = r.heure;
      return;
    }
    const x = evt.clientX;
    const col = g.colonnes.find(c => x >= c.rect.left && x < c.rect.right)
      || g.colonnes.reduce((a, c) => (Math.abs(x - (c.rect.left + c.rect.right) / 2) < Math.abs(x - (a.rect.left + a.rect.right) / 2) ? c : a));
    const h = horaireGlisseAgenda(g.e.heure, g.e.heureFin, (evt.clientY - g.y0) * g.minutesParPx);
    if (!h) return;
    g.cible = { date: col.iso, heure: h.heure, heureFin: h.heureFin };
    if (g.fantome.parentNode !== col.el) col.el.appendChild(g.fantome);
    g.fantome.style.top = `${((minutesHeure(h.heure) - AGENDA_HEURE_DEBUT * 60) / total * 100).toFixed(2)}%`;
    g.fantome.style.left = '2px';
    g.fantome.style.width = 'calc(100% - 4px)';
    g.fantome.querySelector('.ag-glisse-heure').textContent = `${h.heure} – ${h.heureFin}`;
    const debutAffiche = g.fantome.querySelector('.ag-evt-debut, .ag-evt-heure > span:first-child');
    if (debutAffiche) debutAffiche.textContent = h.heure;
  }

  function installerGlisseAgenda() {
    document.addEventListener('pointerdown', (evt) => {
      if (evt.button !== 0 || evt.pointerType === 'touch' || ongletActuel !== 'agenda' || agendaVue === 'mois') return;
      const el = evt.target && evt.target.closest ? evt.target.closest('#agenda-contenu .ag-corps .ag-evt[data-glissable]') : null;
      if (!el) return;
      const e = agendaEvenements.find(x => cleEvenementAgenda(x) === el.dataset.cle);
      if (!e) return;
      const poignee = evt.target.closest('[data-poignee]');
      agendaGlisse = { e, el, x0: evt.clientX, y0: evt.clientY, actif: false, mode: poignee ? poignee.dataset.poignee : 'deplacer' };
    });
    window.addEventListener('pointermove', suivreGlisseAgenda, { passive: false });
    window.addEventListener('pointerup', () => { if (agendaGlisse) finirGlisseAgenda(false); });
    window.addEventListener('pointercancel', () => { if (agendaGlisse) finirGlisseAgenda(true); });
    window.addEventListener('keydown', (evt) => { if (evt.key === 'Escape' && agendaGlisse && agendaGlisse.actif) { evt.stopPropagation(); finirGlisseAgenda(true); } }, true);
    document.addEventListener('click', (evt) => {
      if (!agendaClicIgnore) return;
      agendaClicIgnore = false;
      evt.stopPropagation();
      evt.preventDefault();
    }, true);
  }
  if (typeof document !== 'undefined' && document.addEventListener) installerGlisseAgenda();
