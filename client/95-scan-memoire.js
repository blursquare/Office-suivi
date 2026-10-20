  // ---- Claire Scan : mémoire, traitement en lot, historique cherchable, « Remettre dans Scan » (étude 20/10) ----
  // « Comment améliorer Claire Scan ? Un RAG des fichiers déjà scannés, renommés et rangés ? D'autres améliorations ? » — « Mets en
  // place toutes les nouveautés que tu as proposées. » Rien d'IA : ce que l'étude CORRIGE à la main s'apprend (type de pièce reconnu aux
  // mots du haut de la première page, dossier reconnu à un numéro déjà rangé ou à la référence d'Authentic — commun/scans-memoire.js) ;
  // le texte des scans rangés se cherche (SQLite FTS5 sur le serveur du bureau) ; un scan se range en lot ; un rangement se défait ;
  // un scan identique à un scan déjà rangé le dit ; la confiance se lit d'un coup d'œil ; les chiffres du mois sont donnés.

  var scansSelectionnes = new Set();
  var rechercheScans = { q: '', resultats: null, indexes: 0, chargement: false, erreur: '' };
  var minuterieRechercheScans = null;
  var memoireScansChargee = -1;       // révision de la mémoire déjà lue

  function memoireScansPourProposition() { return etatScans.memoire || { types: [], identifiants: [] }; }

  // Pure : les mots à ne pas retenir dans l'empreinte d'un type (noms des parties, mots de l'adresse du dossier : l'empreinte doit
  // décrire une SORTE de document, pas un client).
  function motsExclusEmpreinteScan(d) {
    const mots = [];
    personnesDossierScan(d).forEach(p => { p.mots.forEach(m => mots.push(m)); p.usage.forEach(m => mots.push(m)); });
    String((d && d.adresseBien) || '').split(/[^A-Za-zÀ-ÿ]+/).filter(m => m.length >= 4).forEach(m => mots.push(m));
    return mots;
  }

  // Pure : ce que le rangement à la main apprend — l'empreinte du haut de la première page, le type choisi, les identifiants lus.
  function apprentissageScan(lecture, d, choix) {
    if (!lecture || !choix) return null;
    return { mots: motsEmpreinteScan(lecture.page1 || lecture.texte || '', motsExclusEmpreinteScan(d)), type: choix.type || '', identifiants: identifiantsDepuisTexteScan(lecture.texte || '') };
  }

  // Pure : le rangement corrige-t-il la proposition de CLAIRE (autre type, autre dossier, ou rien de proposé) ?
  function rangementCorrigeScan(proposition, choix) {
    if (!choix) return false;
    if (!proposition) return !!(choix.type || choix.dossierId);
    return (proposition.type || '') !== (choix.type || '') || (proposition.dossierId || '') !== (choix.dossierId || '');
  }

  // Pure : le type retenu pour un scan — celui des règles de CLAIRE, ou celui que l'étude a appris : à défaut de type reconnu, le type
  // mémorisé qui ressemble (60 %) ; et un type confirmé au moins deux fois qui ressemble beaucoup (80 %) passe devant les règles.
  // → { type, viaMemoire }
  function typeScanAvecMemoire(typeRegle, mots, memoire) {
    const appris = typeDepuisMemoireScan(mots, memoire && memoire.types);
    if (appris && TYPES_SCAN.some(t => t.cle === appris.type)) {
      if (!typeRegle) return { type: TYPES_SCAN.find(t => t.cle === appris.type), viaMemoire: true };
      if (appris.n >= 2 && appris.similarite >= 0.8 && appris.type !== typeRegle.cle) return { type: TYPES_SCAN.find(t => t.cle === appris.type), viaMemoire: true };
    }
    return { type: typeRegle, viaMemoire: false };
  }

  // Lit la mémoire sur le serveur quand sa révision a changé.
  async function chargerMemoireScans() {
    const rev = etatScans.memoireRev;
    if (typeof rev !== 'number' || rev === memoireScansChargee) return;
    try {
      const r = await fetchAvecAuth('/api/scans/memoire');
      if (!r.ok) return;
      etatScans.memoire = await r.json();
      memoireScansChargee = typeof etatScans.memoire.rev === 'number' ? etatScans.memoire.rev : rev;
    } catch (e) { /* relue au prochain tour */ }
  }

  // ---- Confiance et étiquettes ----

  // Six points, autant de remplis que de points de score ; vert quand le dossier est sûr, ambre quand il reste à confirmer.
  function htmlConfianceScan(p) {
    const note = Math.max(0, Math.min(BAREME_SCORE_SCAN.noteMax, Math.round((p && p.score) || 0)));
    const classe = p && p.dossierId && p.dossierSur ? 'sur' : note > 0 ? 'moyen' : 'nul';
    const points = Array.from({ length: BAREME_SCORE_SCAN.noteMax }, (_, i) => `<i${i < note ? ' class="plein"' : ''}></i>`).join('');
    return `<span class="scan-confiance ${classe}" role="img" aria-label="Confiance du dossier : ${note} sur ${BAREME_SCORE_SCAN.noteMax}" title="${escapeAttr(explicationScoreScan(p))}">${points}</span>`;
  }

  function htmlEtiquettesScan(p, scan) {
    const sortie = [];
    if (p && p.viaMemoire) sortie.push(`<span class="scan-etiquette" title="Ce type a été appris d’un rangement fait à la main sur un scan qui lui ressemblait">Type appris</span>`);
    const dbl = (scan && scan.doublon) || (p && p.doublon);
    if (dbl) sortie.push(`<span class="scan-etiquette scan-etiquette-alerte" title="Même fichier, octet pour octet, qu’un scan déjà rangé : il n’est pas rangé seul">Déjà rangé le ${escapeHtml(new Date(dbl.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))}${dbl.dossier ? ' · ' + escapeHtml(libelleDossierParNom(dbl.dossier, '')) : ''}</span>`);
    return sortie.join('');
  }

  // ---- Traitement en lot ----

  function scansSelectionnablesLot() {
    // Jamais un doublon dans la sélection générale : il attend une décision à lui.
    return (etatScans.scans || []).filter(s => s.stable && !s.doublon && lecturesScans[cleScan(s)] && lecturesScans[cleScan(s)].statut === 'pret' && !scansEnRangement.has(s.nom));
  }

  function basculerSelectionScan(nom, coche) {
    if (coche) scansSelectionnes.add(nom); else scansSelectionnes.delete(nom);
    renderScans(true);
  }

  function basculerToutSelectionScans(coche) {
    scansSelectionnes = new Set(coche ? scansSelectionnablesLot().map(s => s.nom) : []);
    renderScans(true);
  }

  function htmlLotScans() {
    const lisibles = scansSelectionnablesLot();
    if (lisibles.length < 2) { scansSelectionnes = new Set(); return ''; }
    scansSelectionnes = new Set([...scansSelectionnes].filter(n => lisibles.some(s => s.nom === n)));
    const n = scansSelectionnes.size;
    const candidats = dossiersCandidatsScans().slice().sort((a, b) => libelleDossierAffiche(a).localeCompare(libelleDossierAffiche(b), 'fr'));
    const valeurs = valeursDossiersScan(candidats);
    return `<div class="scans-lot">
        <label class="scans-lot-tout"><input type="checkbox" ${n === lisibles.length ? 'checked' : ''} onchange="basculerToutSelectionScans(this.checked)"> ${n ? `${n} scan${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''}` : 'Tout sélectionner'}</label>
        ${n ? `<input type="search" id="scans-lot-dossier" class="scan-dossier-saisie" list="scans-lot-dossiers" placeholder="Dossier pour la sélection…" autocomplete="off" aria-label="Dossier de la sélection">
        <datalist id="scans-lot-dossiers">${[...valeurs.keys()].map(v => `<option value="${escapeAttr(v)}"></option>`).join('')}</datalist>
        <wa-button appearance="outlined" size="s" type="button" onclick="appliquerDossierLotScans()">Appliquer ce dossier</wa-button>
        <wa-button variant="brand" size="s" type="button" onclick="rangerSelectionScans()">Ranger la sélection</wa-button>` : ''}
      </div>`;
  }

  function appliquerDossierLotScans() {
    const champ = document.getElementById('scans-lot-dossier');
    if (!champ || !champ.value.trim()) { afficherToast('Tapez le nom du dossier, puis choisissez-le dans la liste.', 'OK', null); return; }
    const r = dossierScanDepuisSaisie(champ.value, dossiersCandidatsScans());
    if (!r || !r.id) { afficherToast(r && r.ambigu ? `${r.ambigu} dossiers correspondent : choisissez-le dans la liste.` : 'Aucun dossier ne correspond.', 'OK', null); return; }
    scansSelectionnes.forEach(nom => changerChoixScan(nom, 'dossierId', r.id));
    renderScans(true);
  }

  async function rangerSelectionScans() {
    const aRanger = [...scansSelectionnes].filter(nom => {
      const l = lecturesScans[cleScan(scanParNom(nom) || {})];
      const d = l && l.choix && (dossiers || []).find(x => x.id === l.choix.dossierId);
      return d && d.nasDossier;
    });
    const sansDossier = scansSelectionnes.size - aRanger.length;
    if (!aRanger.length) { afficherToast('Choisissez d’abord le dossier des scans sélectionnés (et reliez-le au NAS).', 'OK', null); return; }
    demanderConfirmation(`Ranger ${aRanger.length} scan${aRanger.length > 1 ? 's' : ''} dans leur dossier ?${sansDossier ? ` ${sansDossier} sans dossier relié restent en attente.` : ''}`, async () => {
      let faits = 0;
      for (const nom of aRanger) {
        await rangerScanChoisi(nom, false);
        // Rangé = sorti de la liste (un échec le laisse en attente, avec son message).
        if (!scanParNom(nom)) faits += 1;
        scansSelectionnes.delete(nom);
      }
      afficherToast(faits === aRanger.length ? `${faits} scan${faits > 1 ? 's rangés' : ' rangé'}.` : `${faits} scan${faits > 1 ? 's rangés' : ' rangé'} sur ${aRanger.length} : les autres attendent.`, 'OK', null);
    }, { bouton: 'Ranger', ton: 'valider' });
  }

  // ---- Historique : chiffres du mois, recherche dans le texte, « Remettre dans Scan » ----

  function libelleTypeHistoriqueScan(cle) { const t = TYPES_SCAN.find(x => x.cle === cle); return t ? t.label : (cle || 'Autre pièce'); }

  function htmlStatsScans(st) {
    if (!st || !st.ranges) return '';
    const seuls = Math.round(100 * st.automatiques / st.ranges);
    const plus = st.typesCorriges && st.typesCorriges.length ? ` · le plus corrigé : ${escapeHtml(libelleTypeHistoriqueScan(st.typesCorriges[0].type))} (${st.typesCorriges[0].n})` : '';
    return `<p class="scans-stats hint">Ces ${st.jours} derniers jours : ${st.ranges} rangé${st.ranges > 1 ? 's' : ''} · ${seuls} % rangés seuls · ${st.corriges} corrigé${st.corriges > 1 ? 's' : ''} à la main${plus}</p>`;
  }

  function ligneHistoriqueScan(j) {
    const quand = new Date(j.date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const mode = j.auto ? '<span class="dot-label dl-success"><span class="dot"></span>Automatique</span>' : '<span class="dot-label dl-neutre"><span class="dot"></span>À la main</span>';
    const defaire = j.id && j.original && !j.annule
      ? `<wa-button appearance="plain" size="s" class="bouton-discret" type="button" onclick="remettreDansScan('${escapeOnclickArg(j.id)}')" title="Remettre ce scan dans le dossier Scan">${icone('rotate-ccw')} Remettre dans Scan</wa-button>` : '';
    return `<li class="${j.annule ? 'scan-annule' : ''}"><span class="scan-date">${escapeHtml(quand)}</span>
      <span>${escapeHtml(j.nom)} → <strong>${escapeHtml(j.dossier ? libelleDossierParNom(j.dossier, j.dossierId) : '')}</strong>${j.rubrique ? ' › ' + escapeHtml(j.rubrique.replace(/[\\/]+/g, ' › ')) : ''}</span>
      <span class="scan-mode">${j.annule ? '<span class="scan-etiquette">Remis dans Scan</span>' : mode}${j.corrige && !j.annule ? ' <span class="scan-etiquette" title="L’étude a corrigé le type ou le dossier proposé">Corrigé</span>' : ''}${j.auto ? '' : ` <span class="hint">${escapeHtml(j.auteur || '')}</span>`}${j.score != null ? ` <span class="hint">score ${noteScoreScan(j.score)}</span>` : ''} ${defaire}</span></li>`;
  }

  function htmlHistoriqueScans() {
    const journal = (etatScans.journal || []).slice(0, 30);
    return `<div class="calc-card scans-journal">
        <div class="dash-section-titre">Historique ${infoBulle('Les scans déjà rangés, à la main ou automatiquement par CLAIRE. La recherche lit leur texte (premières pages) : un nom, un numéro, un mot de l’acte.')}</div>
        ${htmlStatsScans(etatScans.stats)}
        <div class="scans-recherche"><input type="search" id="scan-recherche" value="${escapeAttr(rechercheScans.q)}" placeholder="Rechercher dans les scans rangés…" autocomplete="off" aria-label="Rechercher dans les scans rangés" oninput="rechercherScans(this.value)"></div>
        <div id="scan-recherche-resultats">${htmlResultatsRechercheScans()}</div>
        <ul id="scans-historique-liste"${rechercheScans.q.trim() ? ' style="display:none"' : ''}>${journal.length ? journal.map(ligneHistoriqueScan).join('') : ''}</ul>
        ${journal.length || rechercheScans.q.trim() ? '' : '<p class="hint scans-rien">Aucun scan rangé pour l’instant.</p>'}
      </div>`;
  }

  function htmlResultatsRechercheScans() {
    if (!rechercheScans.q.trim()) return '';
    if (rechercheScans.chargement && !rechercheScans.resultats) return `<p class="hint scans-rien">${icone('spinner', null, true)} Recherche…</p>`;
    if (rechercheScans.erreur) return `<p class="hint scans-rien">${escapeHtml(rechercheScans.erreur)}</p>`;
    const r = rechercheScans.resultats || [];
    if (!r.length) return `<p class="hint scans-rien">Aucun scan rangé ne contient ces mots${rechercheScans.indexes ? ` (${rechercheScans.indexes} textes indexés)` : ' — seuls les scans rangés depuis cette version sont cherchables'}.</p>`;
    return `<ul class="scans-resultats">${r.map(x => `<li><span class="scan-date">${escapeHtml(new Date(x.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }))}</span>
      <span class="scans-resultat-corps"><strong>${escapeHtml(x.nom)}</strong> <span class="hint">${escapeHtml(x.dossier ? libelleDossierParNom(x.dossier, x.dossierId) : '')}${x.rubrique ? ' › ' + escapeHtml(String(x.rubrique).replace(/[\\/]+/g, ' › ')) : ''}</span>
      ${x.extrait ? `<span class="scans-extrait">${escapeHtml(x.extrait)}</span>` : ''}</span></li>`).join('')}</ul>`;
  }

  function majResultatsRechercheScans() {
    const zone = document.getElementById('scan-recherche-resultats');
    const liste = document.getElementById('scans-historique-liste');
    if (zone) zone.innerHTML = htmlResultatsRechercheScans();
    if (liste) liste.style.display = rechercheScans.q.trim() ? 'none' : '';
  }

  function rechercherScans(q) {
    rechercheScans.q = String(q || '');
    clearTimeout(minuterieRechercheScans);
    if (!rechercheScans.q.trim()) { rechercheScans.resultats = null; rechercheScans.erreur = ''; majResultatsRechercheScans(); return; }
    rechercheScans.chargement = true;
    majResultatsRechercheScans();
    minuterieRechercheScans = setTimeout(async () => {
      const demande = rechercheScans.q;
      try {
        const r = await fetchAvecAuth('/api/scans/recherche?q=' + encodeURIComponent(demande));
        const j = await r.json().catch(() => ({}));
        if (demande !== rechercheScans.q) return;
        if (!r.ok) { rechercheScans.erreur = j.erreur || 'Recherche impossible.'; rechercheScans.resultats = []; }
        else { rechercheScans.erreur = ''; rechercheScans.resultats = j.resultats || []; rechercheScans.indexes = j.indexes || 0; }
      } catch (e) { if (demande === rechercheScans.q) { rechercheScans.erreur = 'Serveur injoignable.'; rechercheScans.resultats = []; } }
      rechercheScans.chargement = false;
      majResultatsRechercheScans();
    }, 250);
  }

  // « Remettre dans Scan » : le scan rangé revient dans le dossier Scan (la copie quitte le dossier du client, l'original archivé est
  // gardé dans « Annulés »), et la pièce que ce rangement avait cochée sur la fiche est décochée.
  function remettreDansScan(id) {
    const j = (etatScans.journal || []).find(x => x.id === id);
    if (!j) return;
    demanderConfirmation(`Remettre « ${j.nom} » dans le dossier Scan ? La copie quittera le dossier du client et la pièce cochée sur la fiche sera décochée.`, async () => {
      let r;
      try {
        const rep = await fetchAvecAuth('/api/scans/annuler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        r = await rep.json().catch(() => ({}));
        if (!rep.ok) { afficherToast(r.erreur || 'Le scan n’a pas pu être remis dans Scan.', 'OK', null); return; }
      } catch (e) { afficherToast('Serveur injoignable.', 'OK', null); return; }
      try { await annulerPieceRangeeScan(r.entree); } catch (e) { console.warn('Pièce non décochée :', e && e.message); }
      noterVerificationPoste('scan-memoire', { detail: 'scan remis dans le dossier Scan' });
      afficherToast(`« ${j.nom} » est de retour dans le dossier Scan${r.copieRetiree === false ? ' (la copie du dossier client n’a pas pu être retirée : retirez-la à la main)' : ''}.`, 'OK', null);
      await chargerScans(true);
    }, { bouton: 'Remettre', ton: 'valider' });
  }

  // La pièce cochée par ce rangement (même fichier mémorisé) repasse manquante ; jamais une pièce validée par un autre fichier.
  async function annulerPieceRangeeScan(entree) {
    const d = entree && (dossiers || []).find(x => x.id === entree.dossierId);
    if (!d || !entree.chemin) return;
    const chemin = String(entree.chemin).replace(/\\/g, '/');
    const nomCible = chemin.split('/').pop().replace(/\.pdf$/i, '').replace(/\s\(\d+\)$/, '');
    const piece = pieceDepuisScanRange(d, entree.type, nomCible, checklistPieces(d.typeVente, d), new Date().toISOString());
    if (!piece) return;
    const cle = NAS_CLE_PIECE(piece.cle);
    if (String((d.fichiersTrouves || {})[cle] || '').replace(/\\/g, '/') !== chemin) return;
    d.pieces = d.pieces || {};
    // Une pièce AJOUTÉE par ce rangement (personnalisée, jamais demandée par l'étude) est retirée de la fiche ; une pièce de la
    // checklist (ou ajoutée avant) repasse seulement « manquante ».
    const ajoutee = (d.piecesPersonnalisees || []).some(p => p.cle === piece.cle) && /^perso-scan-/.test(piece.cle);
    if (ajoutee) { d.piecesPersonnalisees = d.piecesPersonnalisees.filter(p => p.cle !== piece.cle); delete d.pieces[piece.cle]; }
    else d.pieces[piece.cle] = 'manquante';
    memoriserFichierTrouve(d, cle, '');
    if (d.piecesTrouveesLe) delete d.piecesTrouveesLe[piece.cle];
    d.piecesValideesManuellement = (d.piecesValideesManuellement || []).filter(c => c !== piece.cle);
    ajouterHistorique(d, ajoutee ? `Scan remis dans le dossier Scan : pièce « ${piece.label} » retirée de la liste` : `Scan remis dans le dossier Scan : « ${piece.label} » de nouveau attendue`, { auto: false });
    await sauvegarder(d);
    render();
  }

  // ---- Réglages : ce que Claire Scan a appris ----

  function htmlMemoireScansReglages() {
    const m = etatScans.memoire;
    if (!m) return '';
    return `<div class="reglages-section-sous">
        <div class="reglages-option-titre">Ce que Claire Scan a appris ${infoBulle('Chaque scan rangé à la main apprend à CLAIRE : le type de pièce (aux mots du haut de la première page) et les numéros du document (contrat, prêt, avis, IBAN) qui désignent le dossier. Un numéro vu dans deux dossiers n’attribue plus rien. Rien n’est envoyé à une IA ; tout reste sur le serveur du bureau.')}</div>
        <p class="hint">${m.types.length} type${m.types.length > 1 ? 's' : ''} de pièce · ${m.identifiants.filter(e => e.dossierId).length} numéro${m.identifiants.filter(e => e.dossierId).length > 1 ? 's' : ''} rattaché${m.identifiants.filter(e => e.dossierId).length > 1 ? 's' : ''} à un dossier</p>
        ${m.types.length || m.identifiants.length ? '<wa-button appearance="outlined" size="s" type="button" onclick="oublierMemoireScans()">Tout oublier</wa-button>' : ''}
      </div>`;
  }

  function oublierMemoireScans() {
    demanderConfirmation('Faire oublier à Claire Scan tout ce qu’elle a appris des rangements à la main ? Les règles de CLAIRE restent.', async () => {
      const r = await fetchAvecAuth('/api/scans/memoire', { method: 'DELETE' });
      if (!r.ok) { afficherToast('Mémoire non effacée : réessayez.', 'OK', null); return; }
      etatScans.memoire = await r.json();
      memoireScansChargee = etatScans.memoire.rev;
      etatScans.memoireRev = etatScans.memoire.rev;
      renderReglagesScans();
    }, { bouton: 'Oublier', ton: 'danger' });
  }
