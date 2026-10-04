  // ==== « Ce que CLAIRE a appris » (Réglages, étude 02/10) ====
  // Une page pour voir ce que CLAIRE a retenu des corrections de l'étude et retirer ce qui serait faux :
  // erreurs de lecture fréquentes (journal des corrections, tous postes), clauses reconnues d'après une
  // correction (dates, engagements), fichiers écartés des pièces, commentaires de relecture d'actes.

  // Pure : le journal par champ — total, corrections des `jours` derniers jours, « fréquente » au-delà
  // du seuil (même règle que le rapport technique, erreursFrequentesJournal côté serveur), 3 exemples
  // les plus récents. Du plus corrigé récemment au moins.
  var SEUIL_ERREUR_FREQUENTE = 3;
  function syntheseJournalCorrections(journal, maintenant, jours) {
    const fin = maintenant ? new Date(maintenant).getTime() : Date.now();
    const debut = fin - (jours || 30) * 86400000;
    const parChamp = {};
    for (const e of Array.isArray(journal) ? journal : []) {
      if (!e || typeof e.champ !== 'string') continue;
      const g = parChamp[e.champ] || (parChamp[e.champ] = { champ: e.champ, total: 0, recents: 0, exemples: [] });
      g.total++;
      const t = Date.parse(e.date);
      if (t >= debut && t <= fin) g.recents++;
      g.exemples.push(e);
    }
    return Object.values(parChamp).map(g => Object.assign(g, {
      frequente: g.recents >= SEUIL_ERREUR_FREQUENTE,
      exemples: g.exemples.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 3)
    })).sort((a, b) => (b.recents - a.recents) || (b.total - a.total));
  }

  var LIBELLES_CLASSIFICATION_APPRISE = {
    date: { pret: 'Obtention du prêt', acte: 'Réitération de l’acte', ventebien: 'Vente préalable', autre: 'Autre échéance' },
    engagement: { entretien: 'Entretien', travaux: 'Travaux', document: 'Document', autre: 'Autre engagement' }
  };

  // Pure : ce que dit une correction apprise, en une phrase.
  function libelleCorrectionApprise(c) {
    const cat = c && c.categorie === 'engagement' ? 'engagement' : 'date';
    const classe = (LIBELLES_CLASSIFICATION_APPRISE[cat] || {})[c && c.classification] || (c && c.classification) || '';
    const nom = c && c.libelle ? ` « ${c.libelle} »` : '';
    return cat === 'engagement' ? `Engagement classé « ${classe} »` : `Date classée « ${classe} »${nom}`;
  }

  async function ouvrirPageApprentissage() {
    await Promise.all([chargerJournalCorrections(), chargerApprentissageServeur(), chargerRetoursAudit()].map(p => Promise.resolve(p).catch(() => null)));
    renderPageApprentissage();
  }

  function renderPageApprentissage() {
    const erreurs = document.getElementById('apprentissage-erreurs');
    if (erreurs) {
      const synthese = syntheseJournalCorrections(journalCorrectionsExtraction);
      const valeur = (v, champ) => {
        if (v === null || v === undefined || v === '') return '—';
        if (['prixVente', 'prixMobilier', 'depotGarantie'].includes(champ) && Number.isFinite(Number(v))) return formaterMontantEuros(Number(v));
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return formatDateFr(String(v));
        return String(v);
      };
      erreurs.innerHTML = synthese.length ? `<ul class="appris-liste">${synthese.map(g => `
        <li class="appris-ligne">
          <details class="appris-details">
            <summary>
              <span class="appris-titre">${escapeHtml(LIBELLES_CHAMPS_CORRECTION[g.champ] || g.champ)}</span>
              ${g.frequente ? '<span class="dot-label dl-pret"><span class="dot"></span>Fréquente</span>' : ''}
              <span class="appris-meta">${g.recents} sur 30 jours · ${g.total} au total</span>
            </summary>
            <ul class="appris-exemples">${g.exemples.map(e => `<li><span class="appris-meta">${escapeHtml(e.date ? formatDateFr(String(e.date).slice(0, 10)) : '')}</span> lu « ${escapeHtml(valeur(e.valeurExtraite, g.champ))} » → gardé « ${escapeHtml(valeur(e.valeurCorrigee, g.champ))} »</li>`).join('')}</ul>
          </details>
        </li>`).join('')}</ul>
        <div class="appris-actions"><button type="button" class="lien-action" onclick="viderJournalCorrections()">Vider le journal</button></div>`
        : '<p class="hint">Aucune correction notée pour l’instant.</p>';
    }

    const clauses = document.getElementById('apprentissage-clauses');
    if (clauses) {
      const liste = (correctionsApprises || []).slice().sort((a, b) => String(b.dateMaj || '').localeCompare(String(a.dateMaj || '')));
      clauses.innerHTML = liste.length ? `<ul class="appris-liste">${liste.map(c => `
        <li class="appris-ligne appris-avec-geste">
          <div class="appris-corps">
            <span class="appris-titre">${escapeHtml(libelleCorrectionApprise(c))}</span>
            <span class="appris-extrait">« ${escapeHtml(c.contexteExemple || '')} »</span>
            <span class="appris-meta">${c.nbConfirmations > 1 ? `confirmée ${c.nbConfirmations} fois · ` : ''}${c.dateMaj ? 'le ' + escapeHtml(formatDateFr(String(c.dateMaj).slice(0, 10))) : ''}</span>
          </div>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn appris-oublier" title="Oublier : CLAIRE ne réappliquera plus ce classement" aria-label="Oublier ce classement" onclick="oublierCorrectionApprise('${escapeOnclickArg(c.id)}')">${icone('x')}</wa-button>
        </li>`).join('')}</ul>` : '<p class="hint">Aucune clause apprise pour l’instant.</p>';
    }

    renderExclusionsReglages();

    const relecture = document.getElementById('apprentissage-relecture');
    if (relecture) {
      const liste = (retoursAudit || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      relecture.innerHTML = liste.length ? `<ul class="appris-liste">${liste.map(r => {
        const v = VERDICTS_RETOUR_OUTIL2[r.verdict] || { texte: r.verdict, dl: 'dl-neutre' };
        const titre = (r.constat && r.constat.titre) || r.commentaire || '';
        return `<li class="appris-ligne appris-avec-geste">
          <div class="appris-corps">
            <span class="appris-titre"><span class="dot-label ${v.dl}"><span class="dot"></span>${escapeHtml(v.texte)}</span> ${escapeHtml(titre)}</span>
            ${r.commentaire && r.constat ? `<span class="appris-extrait">${escapeHtml(r.commentaire)}</span>` : ''}
            <span class="appris-meta">${r.portee === 'dossier' ? 'Ce dossier seulement' : 'Tous les dossiers'}${r.date ? ' · le ' + escapeHtml(formatDateFr(String(r.date).slice(0, 10))) : ''}</span>
          </div>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn appris-oublier" title="Retirer ce commentaire" aria-label="Retirer ce commentaire" onclick="oublierRetourAudit('${escapeOnclickArg(r.id)}')">${icone('x')}</wa-button>
        </li>`;
      }).join('')}</ul>` : '<p class="hint">Aucun commentaire de relecture.</p>';
    }
  }

  function oublierCorrectionApprise(id) {
    const c = (correctionsApprises || []).find(x => x.id === id);
    if (!c) return;
    demanderConfirmation(`Oublier ce classement (${libelleCorrectionApprise(c)}) ? Les prochains compromis ne le reprendront plus ; les dossiers déjà créés ne changent pas.`, async () => {
      try {
        const r = await fetchAvecAuth('/api/corrections-apprises/' + encodeURIComponent(id), { method: 'DELETE' });
        if (!r.ok && r.status !== 404) throw new Error('statut ' + r.status);
        const data = r.ok ? await r.json() : null;
        correctionsApprises = data && Array.isArray(data.corrections) ? data.corrections : correctionsApprises.filter(x => x.id !== id);
        renderPageApprentissage();
        afficherToast('Classement oublié.', 'OK', null);
      } catch (e) { afficherToast('Impossible d’oublier ce classement : ' + e.message, 'OK', null); }
    });
  }

  function oublierRetourAudit(id) {
    demanderConfirmation('Retirer ce commentaire de relecture ? Le point concerné ressortira normalement aux prochaines relectures.', async () => {
      await supprimerRetourAudit(id);
      renderPageApprentissage();
    });
  }

  // Les exclusions vivent désormais SUR LE SERVEUR (voir server/src/routes/exclusionsPieces.js) :
  // gardées dans le navigateur de chaque poste, elles faisaient rendre deux verdicts différents
  // pour la même pièce selon le poste qui parcourait le NAS, et restaient invisibles. C'est ce qui
  // expliquait « Courriel alignement et numérotage.pdf » : numérotage relié, alignement jamais —
  // une exclusion posée un jour sur ce poste pour l'alignement, jamais signalée nulle part.
  // Les exclusions déjà gardées localement sont reprises UNE fois sur le serveur, puis effacées du
  // navigateur : une décision humaine n'est pas perdue, et elle devient visible (Réglages).
  async function chargerExclusionsMotifNom() {
    try {
      const reponse = await fetchAvecAuth('/api/exclusions-pieces');
      if (reponse.ok) {
        const data = await reponse.json();
        exclusionsMotifNom = (data && data.exclusions) || {};
      }
    } catch (e) {
      console.warn('Exclusions de pièces indisponibles :', e.message);
    }
    await reprendreExclusionsLocales();
    renderExclusionsReglages();
  }

  async function reprendreExclusionsLocales() {
    let brut = null;
    try {
      const local = localStorage.getItem(CLE_EXCLUSIONS_MOTIF_NOM);
      if (local) brut = JSON.parse(local);
    } catch (e) { /* rien d'exploitable */ }
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return;
    for (const [cle, noms] of Object.entries(brut)) {
      for (const nom of (Array.isArray(noms) ? noms : [])) {
        if (!estNomExcluPourPiece(cle, nom)) await exclureNomPourPiece(cle, nom);
      }
    }
    try { localStorage.removeItem(CLE_EXCLUSIONS_MOTIF_NOM); } catch (e) { /* sans importance */ }
  }

  // Un nom de fichier déjà normalisé (voir normaliserNomPourMotif) est-il exclu pour cette pièce ?
  function estNomExcluPourPiece(cle, nomNormalise) {
    const liste = exclusionsMotifNom[cle];
    return Array.isArray(liste) && liste.includes(nomNormalise);
  }

  // Enregistre l'exclusion sur le serveur (idempotent), puis garde la version renvoyée : c'est
  // l'état de tout le bureau, y compris ce qu'un collègue a pu ajouter entre-temps.
  async function exclureNomPourPiece(cle, nomNormalise) {
    if (!nomNormalise) return;
    exclusionsMotifNom[cle] = Array.from(new Set([...(exclusionsMotifNom[cle] || []), nomNormalise]));
    try {
      const reponse = await fetchAvecAuth('/api/exclusions-pieces', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cle, nom: nomNormalise })
      });
      if (reponse.ok) exclusionsMotifNom = (await reponse.json()).exclusions || exclusionsMotifNom;
    } catch (e) {
      console.warn('Exclusion non enregistrée sur le serveur :', e.message);
    }
    renderExclusionsReglages();
  }

  // « Ne plus écarter » : le nom redevient une correspondance possible pour cette pièce. Relance
  // aussitôt le parcours du dossier d'où vient le clic, pour que la pièce soit retrouvée sans
  // attendre le tour automatique.
  async function retirerExclusionPiece(cle, nomNormalise, dossierId) {
    try {
      const reponse = await fetchAvecAuth('/api/exclusions-pieces/retirer', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cle, nom: nomNormalise })
      });
      if (!reponse.ok) throw new Error('statut ' + reponse.status);
      exclusionsMotifNom = (await reponse.json()).exclusions || {};
    } catch (e) {
      afficherToast("Impossible de rétablir ce fichier : " + e.message, 'OK', null);
      return;
    }
    renderExclusionsReglages();
    afficherToast('Fichier rétabli : il pourra de nouveau être reconnu pour cette pièce.', 'OK', null);
    if (dossierId) await verifierDossierLocal(dossierId, true);
  }

  // Libellé d'une clé de pièce, toutes checklists confondues (l'exclusion ne dit pas de quel type
  // de vente elle vient) — repli sur la clé elle-même.
  function libellePieceParCle(cle) {
    for (const type of ['maison', 'copropriete', 'terrain']) {
      const p = checklistPieces(type).find(x => x.cle === cle);
      if (p) return p.label;
    }
    const auto = PIECES_ENGAGEMENTS_AUTO.find(x => x.cle === cle);
    return auto ? auto.label : cle;
  }

  // Liste des fichiers écartés, dans les Réglages : sans elle, une exclusion posée une fois
  // n'était visible nulle part et ne pouvait être défaite qu'en vidant le navigateur.
  function renderExclusionsReglages() {
    document.querySelectorAll('#reglages-exclusions, #apprentissage-exclusions').forEach(renderExclusionsDans);
  }

  function renderExclusionsDans(zone) {
    if (!zone) return;
    const lignes = [];
    for (const [cle, noms] of Object.entries(exclusionsMotifNom || {})) {
      for (const nom of noms) lignes.push({ cle, nom });
    }
    if (!lignes.length) {
      zone.innerHTML = '<p class="hint">Aucun fichier écarté.</p>';
      return;
    }
    zone.innerHTML = `<ul class="exclusions-liste">${lignes.map(l => `
      <li><span class="exclusions-nom">${escapeHtml(l.nom)}</span>
        <span class="hint">n'est plus reconnu comme « ${escapeHtml(libellePieceParCle(l.cle))} »</span>
        <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="retirerExclusionPiece('${escapeOnclickArg(l.cle)}', '${escapeOnclickArg(l.nom)}')">Rétablir</wa-button></li>`).join('')}</ul>`;
  }
