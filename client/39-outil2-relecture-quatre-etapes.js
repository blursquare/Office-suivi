  // ==== OUTIL 2 v3 : RELECTURE EN QUATRE ÉTAPES (Documents → Pseudonymisation → Analyse → Bilan) ====
  //
  // Demande de l'étude (24/09/2026) : reprendre le cœur du prototype « Notariat IA » (API Claude,
  // grille de relecture), l'adapter au projet d'avant-contrat ET au projet de vente, présenter la
  // relecture « sous forme d'étapes », finir sur « une carte de santé de l'acte » (validé / à
  // surveiller / critique) sans e-mail rédigé, permettre de voir le projet en cliquant sur les
  // numéros de page, donner accès à tout le dossier du NAS (pas seulement la rubrique AAE), gérer
  // deux copropriétés dans un même acte, et afficher le coût de l'analyse.
  //
  // Les contrôles AUTOMATIQUES de CLAIRE (règles déterministes, voir analyserCompromisOutil2 /
  // analyserProjetVenteOutil2) tournent toujours, en local et sans coût : ils forment une section
  // du bilan, et restent le seul résultat quand aucune clé API n'est configurée.

  let etapeRelecture = 1;
  let anonymisationRelecture = null;   // { documents, table, sources }
  let termesManuelsRelecture = [];     // [{ terme, categorie }]
  let valeursEnClairRelecture = [];    // valeurs que l'étude a choisi de ne pas masquer
  let etatClaudeRelecture = null;      // { configure, modele }
  let estimationRelecture = null;      // { jetonsEntree, coutEstime } | { erreur }
  let analyseClaudeRelecture = null;   // réponse de Claude, ré-identifiée
  let factureRelecture = null;
  let erreurClaudeRelecture = '';
  let analyseEnCoursRelecture = false;
  let minuteurAnalyseRelecture = null;
  let documentsEnvoyesRelecture = [];  // [{ numero, fichierId }]
  let citationsRelecture = [];         // registre pour les pastilles de page cliquables
  let constatsClaudeRelecture = [];    // lignes de Claude au format « constat » (commentaires)
  let journalCoutRelecture = null;
  let pageApercuRelecture = { doc: 0, page: 0 };
  let typeBienEnvoyeRelecture = '';    // type de bien pour lequel la grille a été posée
  let idRelectureEnregistree = null;   // bilan affiché, tel qu'enregistré dans la base
  let relectureArchiveeOuverte = null; // { id, createdAt } quand on relit une analyse passée
  let historiqueRelectures = null;     // liste des analyses enregistrées (métadonnées)

  var LIBELLES_ETAPES_RELECTURE = ['Documents', 'Pseudonymisation', 'Analyse', 'Bilan'];

  function initRelecture() {
    chargerHistoriqueRelectures();
    renderStepperRelecture();
    renderListeFichiersAnalyseIa();
    renderDossierLieAudit();
    changerAuditModeTexteSeul();
    chargerJournalCoutRelecture();
  }

  function changerAuditModeTexteSeul() {
    const aide = document.getElementById('audit-aide-mode');
    if (aide) aide.textContent = auditMode === 'acte'
      ? `Le projet est relu point par point (${grillePourModeOutil2('acte').length} points) et comparé à l'avant-contrat signé : parties, prix, désignation, conditions levées, engagements du vendeur tenus.`
      : `Le projet d'avant-contrat est relu point par point (${grillePourModeOutil2('compromis').length} points) : parties, bien, diagnostics, copropriété, délais et clauses, urbanisme, volet financier.`;
  }

  function definirEtapeRelecture(n) {
    const cible = Math.max(1, Math.min(4, n));
    // Quitter une analyse enregistrée pour revenir aux étapes : on retrouve la relecture en cours
    // de préparation, jamais un mélange des deux.
    if (relectureArchiveeOuverte && cible < 4) fermerRelectureArchivee();
    if (cible >= 2 && !relectureArchiveeOuverte && !fichiersAnalyseIa.some(f => f.type === 'principal' && f.statut === 'ok')) {
      afficherToast('Ajoutez d’abord le document à relire (type « Document à relire »), et attendez sa lecture.', 'OK', null);
      return;
    }
    if (cible >= 3 && !anonymisationRelecture && !relectureArchiveeOuverte) preparerAnonymisationRelecture();
    if (cible === 4 && !dernierRapportAudit && !relectureArchiveeOuverte) {
      afficherToast("Lancez d'abord l'analyse.", 'OK', null);
      return;
    }
    etapeRelecture = cible;
    for (let i = 1; i <= 4; i++) {
      const panneau = document.getElementById('relecture-etape-' + i);
      if (panneau) panneau.style.display = i === cible ? '' : 'none';
    }
    renderStepperRelecture();
    if (cible === 2) { preparerAnonymisationRelecture(); renderAnonymisationRelecture(); }
    if (cible === 3) renderEtapeAnalyseRelecture();
    if (cible === 4) renderTableauDeBordRelecture();
    const tete = document.getElementById('relecture-stepper');
    if (tete && tete.scrollIntoView && window.scrollY > 200) tete.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderStepperRelecture() {
    const el = document.getElementById('relecture-stepper');
    if (!el) return;
    el.innerHTML = LIBELLES_ETAPES_RELECTURE.map((lib, i) => {
      const n = i + 1;
      const etat = n === etapeRelecture ? 'actif' : (n < etapeRelecture ? 'fait' : '');
      return `<button type="button" class="relecture-step ${etat}" onclick="definirEtapeRelecture(${n})" ${n === etapeRelecture ? 'aria-current="step"' : ''}>
        <span class="relecture-step-num">${n < etapeRelecture ? icone('check') : n}</span>
        <span class="relecture-step-libelle">${lib}</span>
      </button>`;
    }).join('<span class="relecture-step-trait" aria-hidden="true"></span>');
  }

  // Un changement de documents (ajout, retrait, type) invalide tout ce qui suit : la table de
  // pseudonymisation et, a fortiori, l'analyse. On ne garde jamais un bilan qui ne correspond plus
  // aux pièces affichées.
  function invaliderSuiteRelecture() {
    anonymisationRelecture = null;
    estimationRelecture = null;
    analyseClaudeRelecture = null;
    factureRelecture = null;
    erreurClaudeRelecture = '';
    dernierRapportAudit = null;
    constatsClaudeRelecture = [];
    idRelectureEnregistree = null;
    if (etapeRelecture > 1) { etapeRelecture = 1; definirEtapeRelecture(1); }
  }

  // ---- Étape 1 : documents -------------------------------------------------------------------

  var ROLES_DOCUMENT_RELECTURE = {
    principal: 'Document à relire',
    reference_compromis: 'Avant-contrat de référence',
    justificatif: 'Annexe / pièce'
  };

  function renderListeFichiersAnalyseIa() {
    const conteneur = document.getElementById('analyse-ia-liste-fichiers');
    if (conteneur) {
      const groupes = [
        { titre: auditMode === 'acte' ? 'Projet d’acte de vente' : 'Projet d’avant-contrat', filtre: f => f.type === 'principal' },
        { titre: 'Avant-contrat signé (référence)', filtre: f => f.type === 'reference_compromis', seulementActe: true },
        { titre: 'Annexes et pièces', filtre: f => f.type !== 'principal' && f.type !== 'reference_compromis' }
      ];
      conteneur.innerHTML = groupes.map(g => {
        if (g.seulementActe && auditMode !== 'acte') return '';
        const liste = fichiersAnalyseIa.filter(g.filtre);
        let corps;
        if (!liste.length) {
          corps = `<p class="hint relecture-vide">${g.seulementActe ? "Aucun : liez le dossier CLAIRE (il est repris du NAS) ou déposez-le ici." : (g.titre.startsWith('Annexes') ? 'Aucune annexe : diagnostics, état daté, certificat d’urbanisme… ajoutez-les ou choisissez-les dans le dossier du NAS.' : 'Déposez le projet à relire.')}</p>`;
        } else if (g.titre.startsWith('Annexes')) {
          // Annexes regroupées par nature : c'est ce qui rend une vingtaine de pièces lisible.
          const parNature = new Map();
          for (const f of liste) {
            const n = f.nature || 'autre';
            if (!parNature.has(n)) parNature.set(n, []);
            parNature.get(n).push(f);
          }
          corps = Array.from(parNature.entries()).map(([n, fs]) => `<div class="relecture-nature">
            <span class="relecture-nature-titre">${escapeHtml(libelleNaturePieceOutil2(n))}<span class="audit-section-compte">${fs.length}</span></span>
            ${fs.map(ligneFichierRelecture).join('')}
          </div>`).join('');
        } else {
          corps = liste.map(ligneFichierRelecture).join('');
        }
        return `<div class="relecture-groupe"><span class="section-eyebrow">${escapeHtml(g.titre)}</span>${corps}</div>`;
      }).join('');
    }
    const viderBtn = document.getElementById('analyse-ia-vider-btn');
    if (viderBtn) viderBtn.style.display = fichiersAnalyseIa.length ? '' : 'none';
    const suivant = document.getElementById('relecture-suivant-1');
    if (suivant) {
      const principalPret = fichiersAnalyseIa.some(f => f.type === 'principal' && f.statut === 'ok');
      const enLecture = fichiersAnalyseIa.some(f => f.statut === 'lecture');
      suivant.disabled = !principalPret || enLecture;
      suivant.title = enLecture ? 'Lecture des documents en cours…' : (principalPret ? '' : 'Ajoutez le document à relire');
    }
  }

  function ligneFichierRelecture(f) {
    const annexes = f.annexesDepuisPage && f.pagesTotal
      ? `<span class="hint relecture-annexes-integrees">annexes jointes p.${f.annexesDepuisPage}–${f.pagesTotal}</span>` : '';
    const source = f.cheminNas ? `<span class="relecture-source" title="${escapeAttr(f.cheminNas)}">${icone('folder')}NAS</span>` : '';
    const options = Object.entries(ROLES_DOCUMENT_RELECTURE)
      .filter(([v]) => v !== 'reference_compromis' || auditMode === 'acte')
      .map(([v, lib]) => `<option value="${v}" ${v === (f.type === 'autre' ? 'justificatif' : f.type) ? 'selected' : ''}>${escapeHtml(lib)}</option>`).join('');
    return `<div class="analyse-ia-fichier">
      ${icone('file-text')}
      <span class="analyse-ia-fichier-nom" title="${escapeAttr(f.nom)}">${escapeHtml(f.nom)}${annexes}</span>
      ${source}
      <select onchange="changerTypeFichierAnalyseIa('${f.id}', this.value)" aria-label="Rôle du document">${options}</select>
      ${statutFichierAnalyseIa(f)}
      <button type="button" class="piece-suppr" onclick="retirerFichierAnalyseIa('${f.id}')" title="Retirer ce fichier" aria-label="Retirer ce fichier">${icone('x')}</button>
    </div>`;
  }

  // Le dossier du NAS en entier, rubrique par rubrique — la version précédente ne proposait que la
  // rubrique AAE. Présélection : la rubrique AAE (les pièces réunies depuis l'avant-contrat) et,
  // sur un projet de vente, l'avant-contrat retrouvé (voir choisirAvantContratNas).
  let parcoursNasRelecture = null; // { fichiers, coches:Set, avantContrat }

  async function ouvrirParcoursNasRelecture() {
    const d = auditDossierLie;
    const zone = document.getElementById('relecture-nas');
    if (!d || !zone) return;
    if (!d.nasDossier) {
      afficherToast("Ce dossier n'est pas encore relié à un dossier du NAS : reliez-le depuis sa fiche.", 'OK', null);
      return;
    }
    zone.style.display = '';
    zone.innerHTML = `<p class="hint">${icone('spinner', null, true)} Lecture du dossier du NAS…</p>`;
    try {
      const fichiers = await listerFichiersNas(d);
      const deja = new Set(fichiersAnalyseIa.map(f => f.cheminNas));
      const avantContrat = choisirAvantContratNas(fichiers, d.compromisNomFichier).fichier;
      const coches = new Set();
      for (const f of fichiers) {
        if (deja.has(cheminNasComplet(d, f.chemin))) continue;
        if (estDansRubriqueAAE(f.chemin)) coches.add(f.chemin);
        if (auditMode === 'acte' && avantContrat && f.chemin === avantContrat.chemin && !fichiersAnalyseIa.some(x => x.type === 'reference_compromis')) coches.add(f.chemin);
      }
      parcoursNasRelecture = { fichiers, coches, avantContrat: avantContrat ? avantContrat.chemin : null, deja };
      renderParcoursNasRelecture();
    } catch (e) {
      zone.innerHTML = `<p class="hint">${icone('alert-triangle')} Lecture du dossier du NAS impossible : ${escapeHtml(e.message)}</p>`;
    }
  }

  function rubriqueCheminNas(chemin) {
    const segments = String(chemin || '').split(/[\\/]/).filter(Boolean);
    return segments.length > 1 ? segments[0] : 'Racine du dossier';
  }

  function renderParcoursNasRelecture() {
    const zone = document.getElementById('relecture-nas');
    const p = parcoursNasRelecture;
    if (!zone || !p) return;
    if (!p.fichiers.length) { zone.innerHTML = '<p class="hint">Aucun PDF dans ce dossier du NAS.</p>'; return; }
    const d = auditDossierLie;
    const rubriques = new Map();
    for (const f of p.fichiers) {
      const r = rubriqueCheminNas(f.chemin);
      if (!rubriques.has(r)) rubriques.set(r, []);
      rubriques.get(r).push(f);
    }
    const noms = Array.from(rubriques.keys()).sort((a, b) => (a === 'Racine du dossier' ? -1 : b === 'Racine du dossier' ? 1 : a.localeCompare(b, 'fr', { numeric: true })));
    const blocs = noms.map((r, i) => {
      const fs = rubriques.get(r);
      const lignes = fs.map(f => {
        const deja = p.deja.has(cheminNasComplet(d, f.chemin));
        const coche = p.coches.has(f.chemin);
        const idCase = 'nas-f-' + i + '-' + fs.indexOf(f);
        const tag = f.chemin === p.avantContrat ? `<span class="dot-label dl-success">${icone('check')}Avant-contrat</span>` : '';
        return `<label class="relecture-nas-ligne${deja ? ' deja' : ''}" for="${idCase}">
          <input type="checkbox" id="${idCase}" ${coche ? 'checked' : ''} ${deja ? 'disabled' : ''} onchange="cocherFichierNasRelecture('${escapeOnclickArg(f.chemin)}', this.checked)">
          <span class="relecture-nas-nom">${escapeHtml(f.nom)}</span>
          <span class="relecture-nas-nature">${escapeHtml(libelleNaturePieceOutil2(classerNaturePieceOutil2(f.nom, '')))}</span>
          ${tag}${deja ? '<span class="hint">déjà ajouté</span>' : ''}
        </label>`;
      }).join('');
      const nbCoches = fs.filter(f => p.coches.has(f.chemin)).length;
      return `<details class="relecture-nas-rubrique" ${nbCoches || r === 'Racine du dossier' ? 'open' : ''}>
        <summary>${icone('folder')}<span>${escapeHtml(r)}</span><span class="audit-section-compte">${fs.length}</span>${nbCoches ? `<span class="hint">${nbCoches} coché(s)</span>` : ''}</summary>
        ${lignes}
      </details>`;
    }).join('');
    zone.innerHTML = `<div class="relecture-nas-tete">
        <span class="section-eyebrow">Dossier du NAS — ${escapeHtml(d.nasDossier || '')} ${infoBulle("Rubrique AAE et avant-contrat cochés d'office. Chaque PDF coché est lu dans ce navigateur (OCR si c'est un scan).")}</span>
        <div class="relecture-nas-actions">
          <button type="button" class="secondary" onclick="fermerParcoursNasRelecture()">Fermer</button>
          <button type="button" class="primary" onclick="ajouterSelectionNasRelecture()" ${p.coches.size ? '' : 'disabled'}>Ajouter la sélection (${p.coches.size})</button>
        </div>
      </div>
      ${blocs}`;
  }

  function cocherFichierNasRelecture(chemin, coche) {
    if (!parcoursNasRelecture) return;
    if (coche) parcoursNasRelecture.coches.add(chemin); else parcoursNasRelecture.coches.delete(chemin);
    renderParcoursNasRelecture();
  }

  function fermerParcoursNasRelecture() {
    parcoursNasRelecture = null;
    const zone = document.getElementById('relecture-nas');
    if (zone) { zone.style.display = 'none'; zone.innerHTML = ''; }
  }

  var MAX_PIECES_NAS_RELECTURE = 40;
  async function ajouterSelectionNasRelecture() {
    const p = parcoursNasRelecture;
    const d = auditDossierLie;
    if (!p || !d) return;
    const choisis = p.fichiers.filter(f => p.coches.has(f.chemin)).slice(0, MAX_PIECES_NAS_RELECTURE);
    const aPrincipal = fichiersAnalyseIa.some(f => f.type === 'principal');
    const nouvelles = choisis.map(f => {
      let type = 'justificatif';
      if (auditMode === 'acte' && f.chemin === p.avantContrat) type = 'reference_compromis';
      else if (!aPrincipal && auditMode === 'compromis' && f.chemin === p.avantContrat) type = 'principal';
      return {
        id: `analyse-ia-${++compteurFichierAnalyseIa}`,
        file: null, cheminNas: cheminNasComplet(d, f.chemin), nom: f.nom, type,
        nature: classerNaturePieceOutil2(f.nom, ''),
        statut: 'lecture', texte: '', pages: [], erreurTexte: '', pagesLues: null, pagesTotal: null, viaOcr: false, tronque: false
      };
    });
    fichiersAnalyseIa = fichiersAnalyseIa.concat(nouvelles);
    fermerParcoursNasRelecture();
    invaliderSuiteRelecture();
    renderListeFichiersAnalyseIa();
    // L'une après l'autre : un dossier de scans lancerait sinon une vingtaine d'OCR en parallèle.
    for (const entree of nouvelles) await extraireTexteFichierAnalyseIa(entree.id);
  }

  // Sur un projet de vente sans avant-contrat déposé, on le reprend du NAS du dossier lié avant de
  // pseudonymiser : Claude doit l'avoir sous les yeux pour comparer, pas seulement nos règles.
  async function completerAvantContratRelecture() {
    if (auditMode !== 'acte' || fichiersAnalyseIa.some(f => f.type === 'reference_compromis')) return;
    const d = auditDossierLie;
    if (!d || !d.nasDossier) return;
    try {
      const trouve = choisirAvantContratNas(await listerFichiersNas(d), d.compromisNomFichier).fichier;
      if (!trouve) return;
      const entree = {
        id: `analyse-ia-${++compteurFichierAnalyseIa}`, file: null, cheminNas: cheminNasComplet(d, trouve.chemin),
        nom: trouve.nom, type: 'reference_compromis', nature: 'avant_contrat', statut: 'lecture', texte: '', pages: [],
        erreurTexte: '', pagesLues: null, pagesTotal: null, viaOcr: false, tronque: false
      };
      fichiersAnalyseIa.push(entree);
      renderListeFichiersAnalyseIa();
      await extraireTexteFichierAnalyseIa(entree.id);
    } catch (e) {
      console.warn('Avant-contrat du dossier lié introuvable', e);
    }
  }

  async function allerEtapePseudonymisationRelecture() {
    const btn = document.getElementById('relecture-suivant-1');
    if (btn) { btn.disabled = true; btn.innerHTML = `${icone('spinner', null, true)} Préparation…`; }
    await completerAvantContratRelecture();
    if (btn) btn.innerHTML = 'Continuer';
    renderListeFichiersAnalyseIa();
    definirEtapeRelecture(2);
  }

  // ---- Étape 2 : pseudonymisation -------------------------------------------------------------

  function documentsOrdonnesRelecture() {
    const ok = fichiersAnalyseIa.filter(f => f.statut === 'ok');
    const rang = f => (f.type === 'principal' ? 0 : f.type === 'reference_compromis' ? 1 : 2);
    return ok.slice().sort((a, b) => rang(a) - rang(b));
  }

  function roleEnvoiRelecture(f) {
    return f.type === 'principal' ? 'principal' : (f.type === 'reference_compromis' ? 'avant_contrat' : 'annexe');
  }

  function preparerAnonymisationRelecture() {
    const docs = documentsOrdonnesRelecture();
    const parties = [];
    const notaires = [];
    for (const f of docs.filter(x => x.type !== 'justificatif' && x.type !== 'autre')) {
      const type = detecterTypeActe(f.texte);
      const valeurType = type && type.valeur;
      parties.push(...detecterParties(f.texte, valeurType));
      notaires.push(...detecterNotaires(f.texte, valeurType));
    }
    const termes = termesConnusAnonymisation(parties, notaires).concat(termesManuelsRelecture.map(t => ({ ...t, source: 'manuel' })));
    const r = anonymiserDocumentsOutil2(docs.map(f => ({ id: f.id, texte: f.texte, pages: f.pages })), { termes, exclus: valeursEnClairRelecture });
    anonymisationRelecture = { documents: r.documents, table: r.table, nbTermesConnus: termes.length };
    return anonymisationRelecture;
  }

  var LIBELLES_CATEGORIE_ANONYMISATION = {
    PERSONNE: 'Personnes', PERSONNE_MORALE: 'Sociétés', ADRESSE: 'Adresses', EMAIL: 'E-mails', TELEPHONE: 'Téléphones',
    NIR: 'N° de sécurité sociale', NAISSANCE: 'Naissances', CADASTRE: 'Références cadastrales',
    IDENTIFIANT_ENTREPRISE: 'SIREN / SIRET', IBAN: 'IBAN'
  };
  var LIBELLES_SOURCE_ANONYMISATION = { partie: 'partie de l’acte', notaire: 'notaire', regle: 'repéré', manuel: 'ajouté' };

  function renderAnonymisationRelecture() {
    const zone = document.getElementById('relecture-anonymisation');
    const a = anonymisationRelecture;
    if (!zone || !a) return;
    const parCat = new Map();
    for (const e of a.table) {
      if (!parCat.has(e.categorie)) parCat.set(e.categorie, []);
      parCat.get(e.categorie).push(e);
    }
    const total = a.table.reduce((s, e) => s + e.occurrences, 0);
    const blocs = Array.from(parCat.entries()).map(([cat, liste]) => `<div class="anon-bloc">
      <span class="relecture-nature-titre">${escapeHtml(LIBELLES_CATEGORIE_ANONYMISATION[cat] || cat)}<span class="audit-section-compte">${liste.length}</span></span>
      <ul class="anon-liste">${liste.map(e => `<li>
        <span class="anon-jeton">${escapeHtml(e.jeton)}</span>
        <span class="anon-valeur">${escapeHtml(e.valeur)}</span>
        <span class="hint">${e.occurrences}× · ${LIBELLES_SOURCE_ANONYMISATION[e.source] || ''}</span>
        <button type="button" class="action-rapide" onclick="laisserEnClairRelecture('${escapeOnclickArg(e.valeur)}')" title="Ne pas masquer cette valeur (par exemple le nom d'une commune utile à l'analyse)">Laisser en clair</button>
      </li>`).join('')}</ul>
    </div>`).join('');
    const enClair = valeursEnClairRelecture.length
      ? `<p class="hint">Laissé en clair : ${valeursEnClairRelecture.map(v => `<button type="button" class="anon-puce" onclick="remasquerRelecture('${escapeOnclickArg(v)}')" title="Masquer à nouveau">${escapeHtml(v)} ${icone('x')}</button>`).join(' ')}</p>` : '';
    zone.innerHTML = `<div class="anon-stats">
        <div><strong>${a.table.length}</strong><span>éléments distincts</span></div>
        <div><strong>${total}</strong><span>occurrences masquées</span></div>
        <div><strong>${a.documents.length}</strong><span>document(s)</span></div>
      </div>
      <div class="anon-ajout">
        <label for="anon-terme">Masquer aussi</label>
        <input type="text" id="anon-terme" placeholder="Un nom, une rue, un lieu-dit…" onkeydown="if(event.key==='Enter'){event.preventDefault();ajouterTermeAnonymisationRelecture();}">
        <button type="button" class="secondary" onclick="ajouterTermeAnonymisationRelecture()">Ajouter</button>
      </div>
      ${enClair}
      <div class="anon-grille">${blocs || '<p class="hint">Aucune donnée identifiante repérée — vérifiez l’aperçu.</p>'}</div>`;
    renderApercuAnonymisationRelecture();
  }

  function ajouterTermeAnonymisationRelecture() {
    const champ = document.getElementById('anon-terme');
    const t = champ ? champ.value.trim() : '';
    if (t.length < 2) return;
    termesManuelsRelecture.push({ terme: t, categorie: 'PERSONNE' });
    valeursEnClairRelecture = valeursEnClairRelecture.filter(v => normaliserPourRecherche(v) !== normaliserPourRecherche(t));
    preparerAnonymisationRelecture();
    renderAnonymisationRelecture();
    estimationRelecture = null;
  }

  function laisserEnClairRelecture(valeur) {
    valeursEnClairRelecture.push(valeur);
    termesManuelsRelecture = termesManuelsRelecture.filter(t => normaliserPourRecherche(t.terme) !== normaliserPourRecherche(valeur));
    preparerAnonymisationRelecture();
    renderAnonymisationRelecture();
    estimationRelecture = null;
  }

  function remasquerRelecture(valeur) {
    valeursEnClairRelecture = valeursEnClairRelecture.filter(v => v !== valeur);
    preparerAnonymisationRelecture();
    renderAnonymisationRelecture();
    estimationRelecture = null;
  }

  // Aperçu d'une page telle qu'elle partira : c'est ce que l'étude doit pouvoir relire avant de
  // valider — un nom resté en clair se voit ici, pas après l'envoi.
  function renderApercuAnonymisationRelecture() {
    const zone = document.getElementById('relecture-apercu-anon');
    const a = anonymisationRelecture;
    if (!zone || !a || !a.documents.length) return;
    const docs = documentsOrdonnesRelecture();
    const iDoc = Math.min(pageApercuRelecture.doc, a.documents.length - 1);
    const doc = a.documents[iDoc];
    const iPage = Math.min(pageApercuRelecture.page, doc.pages.length - 1);
    const p = doc.pages[iPage];
    const extrait = p ? doc.texte.slice(p.debut, p.fin) : doc.texte;
    const html = escapeHtml(extrait).replace(/⟦[A-Z_]+_\d+⟧/g, j => `<mark class="anon-mark">${j}</mark>`);
    const options = docs.map((f, i) => `<option value="${i}" ${i === iDoc ? 'selected' : ''}>${escapeHtml(f.nom)}</option>`).join('');
    zone.innerHTML = `<div class="anon-apercu-tete">
        <select aria-label="Document" onchange="pageApercuRelecture = { doc: Number(this.value), page: 0 }; renderApercuAnonymisationRelecture()">${options}</select>
        <div class="anon-apercu-pages">
          <button type="button" class="icon-btn" ${iPage <= 0 ? 'disabled' : ''} onclick="pageApercuRelecture.page = ${iPage - 1}; renderApercuAnonymisationRelecture()" aria-label="Page précédente">${icone('chevron-up')}</button>
          <span>p.${p ? p.numero : 1} / ${doc.pages.length || 1}</span>
          <button type="button" class="icon-btn" ${iPage >= doc.pages.length - 1 ? 'disabled' : ''} onclick="pageApercuRelecture.page = ${iPage + 1}; renderApercuAnonymisationRelecture()" aria-label="Page suivante">${icone('chevron-down')}</button>
        </div>
      </div>
      <div class="anon-apercu-texte">${html || '<span class="hint">Page vide.</span>'}</div>`;
  }

  // ---- Étape 3 : analyse ----------------------------------------------------------------------

  function consignesEtudeRelecture() {
    const cle = dernierAuditContexte ? dernierAuditContexte.dossierCle : cleDossierAudit(auditDossierLie, (documentsOrdonnesRelecture()[0] || {}).nom);
    return consignesDepuisRetours(retoursAudit, cle);
  }

  // Pure : les commentaires de l'étude transformés en consignes pour le modèle. Un avis « juste »
  // accompagné d'une remarque est transmis lui aussi (« bien vu, et vérifier aussi l'écart de 5 % »
  // est une consigne) ; un avis de gravité l'est même sans commentaire (la gravité voulue suffit) ;
  // un oubli signalé sur plusieurs lignes donne une consigne par ligne, pour qu'aucune ne soit
  // tronquée. Les 30 dernières au plus, dans la portée du dossier en cours.
  function consignesDepuisRetours(retours, cle) {
    const utiles = (retours || []).filter(r => r
      && ['faux_positif', 'mal_formule', 'gravite', 'manque', 'juste'].indexOf(r.verdict) >= 0
      && (r.commentaire || r.verdict === 'gravite')
      && (r.portee === 'tous' || (cle && r.dossierCle === cle)));
    const consignes = [];
    for (const r of utiles) {
      const titre = r.constat && r.constat.titre ? `« ${r.constat.titre} »` : '';
      const commentaire = String(r.commentaire || '').trim();
      if (r.verdict === 'faux_positif') consignes.push(`Ne signale pas comme un problème ${titre} : ${commentaire}`);
      else if (r.verdict === 'manque') {
        commentaire.split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(l => consignes.push(`Vérifie aussi : ${l}`));
      } else if (r.verdict === 'gravite') consignes.push(`${titre} : gravité attendue ${String(r.graviteSouhaitee || '').toLowerCase()}${commentaire ? ` — ${commentaire}` : ''}`);
      else if (r.verdict === 'juste') consignes.push(`Constat jugé juste par l'étude, à conserver ${titre} : ${commentaire}`);
      else consignes.push(`${titre} : ${commentaire}`);
    }
    return consignes.slice(-30).map(t => t.slice(0, 380));
  }

  function corpsRequeteRelecture() {
    const a = anonymisationRelecture || preparerAnonymisationRelecture();
    const docs = documentsOrdonnesRelecture();
    documentsEnvoyesRelecture = docs.map((f, i) => ({ numero: i + 1, fichierId: f.id, nom: f.nom, type: f.type, nature: f.nature || 'autre', cheminNas: f.cheminNas || '' }));
    const typeBien = typeBienRelectureCourante();
    return {
      mode: auditMode,
      typeBien,
      grille: grillePourModeOutil2(auditMode, typeBien),
      consignes: consignesEtudeRelecture().map(c => pseudonymiserTexteLibreOutil2(c, a.table)),
      // Le nom de fichier porte souvent le nom des clients (« VENTE DUPONT MARTIN.pdf ») : il ne
      // part jamais, remplacé par un intitulé neutre.
      libelle: `${auditMode === 'acte' ? "Projet d'acte de vente" : "Projet d'avant-contrat"} — ${docs.length} document(s)`,
      documents: a.documents.map((d, i) => {
        const f = docs[i];
        return {
          nom: `${ROLES_DOCUMENT_RELECTURE[f.type] || 'Annexe'} — ${libelleNaturePieceOutil2(f.nature || 'autre')} (${i + 1})`,
          role: roleEnvoiRelecture(f), nature: f.nature || 'autre', annexesDepuisPage: f.annexesDepuisPage || null,
          texte: d.texte, pages: d.pages
        };
      })
    };
  }

  async function renderEtapeAnalyseRelecture() {
    const zone = document.getElementById('relecture-analyse');
    if (!zone) return;
    const docs = documentsOrdonnesRelecture();
    const pages = docs.reduce((s, f) => s + (f.pagesTotal || f.pages.length || 0), 0);
    if (!etatClaudeRelecture) {
      try {
        const r = await fetchAvecAuth('/api/relecture-claude/etat');
        etatClaudeRelecture = r.ok ? await r.json() : { configure: false };
      } catch (e) { etatClaudeRelecture = { configure: false }; }
    }
    const e = etatClaudeRelecture;
    const modele = LIBELLES_MODELES_CLAUDE[e.modele] || e.modele || '';
    const fournisseur = libelleFournisseurRelecture(e);
    const typeBien = typeBienRelectureCourante();
    const grille = grillePourModeOutil2(auditMode, typeBien);
    let estimation = '';
    if (e.configure) {
      if (!estimationRelecture) {
        estimation = `<p class="hint">${icone('spinner', null, true)} Estimation du coût…</p>`;
        estimerCoutRelecture();
      } else if (estimationRelecture.erreur) {
        estimation = `<p class="hint">${icone('alert-triangle')} ${escapeHtml(estimationRelecture.erreur)}</p>`;
      } else {
        const c = estimationRelecture.coutEstime;
        estimation = `<div class="analyse-estimation"><span class="section-eyebrow">Coût estimé</span><strong>${c ? `${formaterCoutUsd(c.bas)} à ${formaterCoutUsd(c.haut)}` : '—'}</strong>
          <span class="hint">${estimationRelecture.estime ? 'environ ' : ''}${estimationRelecture.jetonsEntree.toLocaleString('fr-FR')} jetons à lire · facturé par ${escapeHtml(fournisseur.societe)} en dollars</span></div>`;
        // Aucune limite de pages : la seule borne est ce que le modèle peut lire en une fois. Dit
        // AVANT le lancement, avec le compte exact, plutôt qu'un refus de l'API après coup.
        if (estimationRelecture.depasse) {
          estimation += `<p class="analyse-erreur">${icone('alert-triangle')} Ce dossier dépasse ce que le modèle peut lire en une seule analyse (${estimationRelecture.jetonsEntree.toLocaleString('fr-FR')} jetons, maximum ${(estimationRelecture.limiteJetons || 0).toLocaleString('fr-FR')}). Retirez les pièces les moins utiles à l'étape 1.</p>`;
        }
      }
    }
    const enCours = analyseEnCoursRelecture
      ? `<div class="analyse-en-cours">${icone('spinner', null, true)}<div><strong>Analyse en cours — <span id="relecture-chrono">0 s</span> ${infoBulle(`${fournisseur.nom} relit ${docs.length} document(s) point par point. Comptez en général une à quatre minutes ; vous pouvez consulter un autre écran en attendant.`)}</strong></div></div>`
      : '';
    const erreur = erreurClaudeRelecture ? `<p class="analyse-erreur">${icone('alert-triangle')} ${escapeHtml(erreurClaudeRelecture)}</p>` : '';
    zone.innerHTML = `<div class="analyse-recap">
        <div><span class="section-eyebrow">Documents</span><strong>${docs.length}</strong><span class="hint">${pages} pages</span></div>
        <div><span class="section-eyebrow">Grille</span><strong>${grille.length} points</strong><span class="hint">${auditMode === 'acte' ? 'projet de vente' : 'avant-contrat'}</span></div>
        <div><span class="section-eyebrow">Données masquées</span><strong>${anonymisationRelecture ? anonymisationRelecture.table.length : 0}</strong><span class="hint">table gardée sur ce poste</span></div>
        <div><span class="section-eyebrow">Modèle</span><strong>${e.configure ? escapeHtml(modele) : '—'}</strong><span class="hint">${e.configure ? escapeHtml(fournisseur.detail) : 'non configuré'}</span></div>
      </div>
      ${renderTypeBienEtapeRelecture(typeBien, grille.length)}
      ${estimation}
      ${e.configure ? '' : `<div class="analyse-non-configure">${icone('key')}<div><strong>Aucune clé API ${escapeHtml(fournisseur.nom)}.</strong> <p class="hint">Renseignez-la dans Réglages → Relecture d'actes. En attendant, les contrôles automatiques de CLAIRE restent disponibles.</p></div></div>`}
      ${enCours}${erreur}
      <div class="relecture-actions">
        <button type="button" class="secondary" onclick="definirEtapeRelecture(2)" ${analyseEnCoursRelecture ? 'disabled' : ''}>Retour</button>
        ${e.configure ? '' : `<button type="button" class="secondary" onclick="lancerAuditActe(false)" ${analyseEnCoursRelecture ? 'disabled' : ''}>Contrôles CLAIRE seuls</button>`}
        <button type="button" class="primary" onclick="lancerAuditActe(true)" ${e.configure && !analyseEnCoursRelecture && !(estimationRelecture && estimationRelecture.depasse) ? '' : 'disabled'}>${icone('sparkle')} Lancer l'analyse</button>
      </div>
      ${renderJournalCoutRelecture()}`;
  }

  // Libellés des modèles de la relecture, tous fournisseurs confondus (le nom historique de la
  // table est conservé). Mistral est le fournisseur par défaut depuis le 27/09/2026.
  var LIBELLES_MODELES_CLAUDE = {
    'claude-sonnet-5': 'Claude Sonnet 5', 'claude-opus-5': 'Claude Opus 5',
    'mistral-medium-3-5': 'Mistral Medium 3.5', 'mistral-large-2512': 'Mistral Large 3'
  };

  // Nom du fournisseur, société facturante et mention du lieu de traitement, pour l'écran.
  function libelleFournisseurRelecture(etat) {
    const e = etat || {};
    if (e.fournisseur === 'claude') return { nom: 'Claude', societe: 'Anthropic', detail: 'API Claude (Anthropic)' };
    return { nom: 'Mistral', societe: 'Mistral AI', detail: e.region === 'global' ? 'API Mistral' : 'API Mistral · Union européenne' };
  }

  async function estimerCoutRelecture() {
    try {
      const r = await fetchAvecAuth('/api/relecture-claude/estimer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpsRequeteRelecture())
      });
      const data = await r.json().catch(() => ({}));
      estimationRelecture = r.ok ? data : { erreur: data.erreur || 'Estimation impossible.' };
    } catch (e) {
      estimationRelecture = { erreur: 'Estimation impossible : serveur injoignable.' };
    }
    if (etapeRelecture === 3) renderEtapeAnalyseRelecture();
  }

  function renderJournalCoutRelecture() {
    const j = journalCoutRelecture;
    if (!j || !j.totalNb) return '';
    return `<p class="hint analyse-journal">${icone('banknote')} Ce mois-ci : ${j.moisNb} analyse(s), ${formaterCoutUsd(j.moisUsd)} · depuis l'installation : ${j.totalNb} analyse(s), ${formaterCoutUsd(j.totalUsd)}.</p>`;
  }

  async function chargerJournalCoutRelecture() {
    try {
      const r = await fetchAvecAuth('/api/relecture-claude/journal');
      if (r.ok) journalCoutRelecture = await r.json();
    } catch (e) { /* sans importance : l'information est complémentaire */ }
  }

  // Les contrôles CLAIRE, calculés en local : c'est l'ancien lancerAuditActe, sans rendu.
  async function preparerControlesClaireRelecture() {
    const fichiersOk = fichiersAnalyseIa.filter(f => f.statut === 'ok');
    const principal = fichiersOk.find(f => f.type === 'principal');
    if (!principal) return false;
    const justificatifs = fichiersOk
      .filter(f => f !== principal && f.type !== 'reference_compromis')
      .map(f => ({ nom: f.nom, texte: f.texte, pages: f.pages }));
    const couverture = fichiersOk.map(f => ({ nom: f.nom, pagesLues: f.pagesLues, pagesTotal: f.pagesTotal, viaOcr: f.viaOcr, tronque: f.tronque }));
    if (auditMode === 'acte') {
      const ref = fichiersOk.find(f => f.type === 'reference_compromis') || (auditDossierLie ? await recupererTextCompromisDossier(auditDossierLie) : null);
      dernierAuditContexte = {
        mode: 'acte',
        referenceLueDansTexte: !!(ref && ref.texte),
        entree: {
          texteAvantContrat: ref ? ref.texte : '',
          pagesAvantContrat: ref ? ref.pages : [],
          texteProjet: principal.texte,
          pagesProjet: principal.pages,
          nomProjet: principal.nom,
          nomAvantContrat: ref ? (ref.nom || 'Avant-contrat') : 'Avant-contrat',
          documentsDeposes: justificatifs,
          dossierLie: auditDossierLie,
          reference: ref ? referenceAudit(ref.texte, ref.nom, auditDossierLie) : (auditDossierLie ? referenceDepuisDossier(auditDossierLie) : null),
          projet: construireExtractionRegex(principal.texte, null, null, principal.nom)
        },
        nbJustificatifs: justificatifs.length,
        couvertureDocuments: couverture
      };
    } else {
      dernierAuditContexte = {
        mode: 'compromis',
        entree: {
          texte: principal.texte, pages: principal.pages, nomTexte: principal.nom, documentsDeposes: justificatifs,
          extraction: construireExtractionRegex(principal.texte, null, null, principal.nom)
        },
        nbJustificatifs: justificatifs.length,
        couvertureDocuments: couverture
      };
    }
    dernierAuditContexte.dossierCle = cleDossierAudit(auditDossierLie, principal.nom);
    dernierAuditContexte.dossierNom = auditDossierLie ? auditDossierLie.nom : '';
    dernierAuditContexte.documentPrincipal = principal.nom;
    const resultat = auditMode === 'acte'
      ? analyserProjetVenteOutil2({ ...dernierAuditContexte.entree, typeBienForce: typeBienAuditChoisi })
      : analyserCompromisOutil2({ ...dernierAuditContexte.entree, typeBienForce: typeBienAuditChoisi });
    resultat.nbJustificatifs = dernierAuditContexte.nbJustificatifs;
    resultat.couvertureDocuments = dernierAuditContexte.couvertureDocuments;
    dernierRapportAudit = resultat;
    return true;
  }

  async function lancerAuditActe(avecClaude) {
    if (analyseEnCoursRelecture) return;
    analyseEnCoursRelecture = true;
    erreurClaudeRelecture = '';
    analyseClaudeRelecture = null;
    factureRelecture = null;
    const debut = Date.now();
    clearInterval(minuteurAnalyseRelecture);
    renderEtapeAnalyseRelecture();
    minuteurAnalyseRelecture = setInterval(() => {
      const el = document.getElementById('relecture-chrono');
      if (el) el.textContent = formaterDureeMs(Date.now() - debut);
    }, 1000);
    try {
      formCommentaireAudit = null;
      diagnosticRelectureOuverts = new Set();
      await chargerRetoursAudit();
      await preparerControlesClaireRelecture();
      typeBienEnvoyeRelecture = typeBienRelectureCourante();
      idRelectureEnregistree = null;
      if (avecClaude) {
        const corps = corpsRequeteRelecture();
        const r = await fetchAvecAuth('/api/relecture-claude/analyser', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps)
        });
        const data = await r.json().catch(() => ({}));
        factureRelecture = data.facture || null;
        if (!r.ok) {
          erreurClaudeRelecture = data.erreur || "L'analyse n'a pas abouti.";
        } else {
          analyseClaudeRelecture = desanonymiserOutil2(data.analyse, anonymisationRelecture.table);
        }
      }
      await chargerJournalCoutRelecture();
    } catch (e) {
      console.error('Relecture : échec de l’analyse', e);
      erreurClaudeRelecture = "L'analyse n'a pas pu aboutir (serveur injoignable ?).";
    } finally {
      clearInterval(minuteurAnalyseRelecture);
      analyseEnCoursRelecture = false;
    }
    if (dernierRapportAudit) preparerRapportAudit(dernierRapportAudit);
    if (erreurClaudeRelecture && avecClaude) {
      renderEtapeAnalyseRelecture();
      afficherToast(erreurClaudeRelecture + ' Les contrôles CLAIRE restent consultables dans le bilan.', 'OK', null);
      return;
    }
    definirEtapeRelecture(4);
    enregistrerRelectureCourante();
  }

  // ---- Type de bien : choisi avant l'analyse, il décide des points posés ----------------------
  function typeBienRelectureCourante() {
    if (typeBienAuditChoisi) return typeBienAuditChoisi;
    const principal = fichiersAnalyseIa.find(f => f.type === 'principal' && f.statut === 'ok');
    const ref = fichiersAnalyseIa.find(f => f.type === 'reference_compromis' && f.statut === 'ok');
    return deduireTypeBienOutil2({
      texteProjet: principal ? principal.texte : '', texteAvantContrat: ref ? ref.texte : '', dossierLie: auditDossierLie
    }).type;
  }

  function renderTypeBienEtapeRelecture(typeBien, nbPoints) {
    const options = TYPES_BIEN_AUDIT
      .map(t => `<option value="${t.valeur}" ${t.valeur === typeBien ? 'selected' : ''}>${escapeHtml(t.libelle)}</option>`).join('');
    return `<div class="relecture-type-bien">
      <label for="relecture-type-bien">Type de bien</label>
      <select id="relecture-type-bien" onchange="changerTypeBienRelecture(this.value)" ${analyseEnCoursRelecture ? 'disabled' : ''}>${options}</select>
      <span class="hint">${typeBienAuditChoisi ? 'Choisi à la main' : 'Déduit des documents'} · ${nbPoints} points ${infoBulle("La grille pose des points adaptés à ce type de bien : à corriger avant de lancer l'analyse si la déduction est fausse.")}</span>
    </div>`;
  }

  function changerTypeBienRelecture(valeur) {
    typeBienAuditChoisi = ['maison', 'copropriete', 'terrain'].indexOf(valeur) >= 0 ? valeur : null;
    estimationRelecture = null;
    renderEtapeAnalyseRelecture();
  }

  // ---- Analyses enregistrées : revenir sur une relecture passée --------------------------------
  // Chaque bilan affiché est rangé dans la base du serveur (routes/relectures.js) : on peut le
  // rouvrir plus tard sans relancer l'analyse ni la payer une seconde fois.
  function instantaneRelecture() {
    const r = dernierRapportAudit;
    if (!r) return null;
    const ctx = dernierAuditContexte || {};
    const docs = documentsEnvoyesRelecture.length ? documentsEnvoyesRelecture
      : documentsOrdonnesRelecture().map((f, i) => ({ numero: i + 1, fichierId: f.id, nom: f.nom, type: f.type, nature: f.nature || 'autre', cheminNas: f.cheminNas || '' }));
    return {
      version: 1,
      mode: auditMode,
      typeBien: typeBienEnvoyeRelecture || r.typeBien || '',
      dossierId: auditDossierLie ? auditDossierLie.id : '',
      dossierNom: auditDossierLie ? auditDossierLie.nom : '',
      dossierCle: ctx.dossierCle || '',
      libelle: ctx.documentPrincipal || '',
      sante: derniereSanteRelecture ? derniereSanteRelecture.compte : null,
      analyse: analyseClaudeRelecture,
      erreurClaude: erreurClaudeRelecture || '',
      facture: factureRelecture,
      rapport: r,
      documents: docs.map(d => ({ numero: d.numero, nom: d.nom || '', type: d.type || '', nature: d.nature || '', cheminNas: d.cheminNas || '' }))
    };
  }

  async function enregistrerRelectureCourante() {
    const corps = instantaneRelecture();
    if (!corps) return;
    try {
      const url = idRelectureEnregistree ? '/api/relectures/' + encodeURIComponent(idRelectureEnregistree) : '/api/relectures';
      const r = await fetchAvecAuth(url, {
        method: idRelectureEnregistree ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps)
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.erreur || 'statut ' + r.status);
      if (data.id) idRelectureEnregistree = data.id;
      chargerHistoriqueRelectures();
    } catch (e) {
      console.warn('Relecture : enregistrement impossible', e);
      afficherToast("Le bilan n'a pas pu être enregistré dans les analyses passées (serveur injoignable ?).", 'OK', null);
    }
  }

  async function chargerHistoriqueRelectures() {
    try {
      const r = await fetchAvecAuth('/api/relectures');
      if (!r.ok) throw new Error('statut ' + r.status);
      historiqueRelectures = (await r.json()).relectures || [];
    } catch (e) {
      historiqueRelectures = historiqueRelectures || [];
    }
    renderHistoriqueRelectures();
  }

  // Pure, testable : filtre la liste sur le dossier, le document ou le type d'acte, sans accents.
  function filtrerHistoriqueRelectures(liste, recherche) {
    const q = normaliserPourRecherche(String(recherche || '').trim());
    if (!q) return liste || [];
    return (liste || []).filter(h => normaliserPourRecherche([h.dossierNom, h.libelle, h.mode === 'acte' ? "projet d'acte de vente" : 'avant-contrat'].join(' ')).indexOf(q) >= 0);
  }

  function renderHistoriqueRelectures() {
    const zone = document.getElementById('relecture-historique-liste');
    if (!zone) return;
    if (historiqueRelectures === null) { zone.innerHTML = '<p class="hint">Chargement…</p>'; return; }
    const champ = document.getElementById('relecture-historique-recherche');
    const liste = filtrerHistoriqueRelectures(historiqueRelectures, champ ? champ.value : '');
    if (!historiqueRelectures.length) { zone.innerHTML = '<p class="hint">Aucune analyse enregistrée pour l’instant : chaque bilan affiché à l’étape 4 est gardé ici.</p>'; return; }
    if (!liste.length) { zone.innerHTML = '<p class="hint">Aucune analyse ne correspond à cette recherche.</p>'; return; }
    zone.innerHTML = `<ul class="historique-relectures">${liste.slice(0, 60).map(h => {
      const quand = new Date(h.createdAt);
      const date = isNaN(quand) ? '' : quand.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const type = (TYPES_BIEN_AUDIT.find(t => t.valeur === h.typeBien) || {}).libelle || '';
      const s = h.sante || {};
      return `<li class="historique-ligne">
        <button type="button" class="historique-ouvrir" onclick="ouvrirRelectureArchivee('${escapeOnclickArg(h.id)}')">
          <span class="historique-titre">${escapeHtml(h.dossierNom ? libelleDossierAffiche({ nom: h.dossierNom }) : (h.libelle || 'Relecture sans dossier'))}</span>
          <span class="historique-meta">${escapeHtml([date, h.mode === 'acte' ? "Projet d'acte de vente" : 'Avant-contrat', type, h.avecClaude ? '' : 'contrôles CLAIRE seuls'].filter(Boolean).join(' · '))}</span>
        </button>
        <span class="historique-compteurs">
          ${s.critique ? `<span class="dot-label dl-urgent"><span class="dot"></span>${s.critique}</span>` : ''}
          ${s.surveiller ? `<span class="dot-label dl-pret"><span class="dot"></span>${s.surveiller}</span>` : ''}
          <span class="dot-label dl-success"><span class="dot"></span>${s.valide || 0}</span>
        </span>
        <button type="button" class="icon-btn" onclick="supprimerRelectureArchivee('${escapeOnclickArg(h.id)}')" aria-label="Supprimer cette analyse" title="Supprimer cette analyse">${icone('x')}</button>
      </li>`;
    }).join('')}</ul>`;
  }

  async function ouvrirRelectureArchivee(id) {
    let data;
    try {
      const r = await fetchAvecAuth('/api/relectures/' + encodeURIComponent(id));
      data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.erreur || 'statut ' + r.status);
    } catch (e) {
      afficherToast("Impossible d'ouvrir cette analyse : " + (e.message || 'serveur injoignable'), 'OK', null);
      return;
    }
    const h = data.relecture;
    const d = h.donnees || {};
    relectureArchiveeOuverte = { id: h.id, createdAt: h.createdAt };
    idRelectureEnregistree = h.id;
    auditMode = d.mode === 'acte' ? 'acte' : 'compromis';
    typeBienEnvoyeRelecture = d.typeBien || '';
    analyseClaudeRelecture = d.analyse || null;
    erreurClaudeRelecture = d.erreurClaude || '';
    factureRelecture = d.facture || null;
    dernierRapportAudit = d.rapport || null;
    documentsEnvoyesRelecture = (d.documents || []).map(x => ({ ...x, fichierId: `hist-${h.id}-${x.numero}` }));
    dernierAuditContexte = { mode: auditMode, dossierCle: d.dossierCle || '', dossierNom: d.dossierNom || '', documentPrincipal: d.libelle || '', archive: true };
    fermerVisionneuseRelecture();
    formCommentaireAudit = null;
    await chargerRetoursAudit();
    if (dernierRapportAudit) preparerRapportAudit(dernierRapportAudit);
    definirEtapeRelecture(4);
  }

  function fermerRelectureArchivee() {
    relectureArchiveeOuverte = null;
    idRelectureEnregistree = null;
    analyseClaudeRelecture = null;
    factureRelecture = null;
    erreurClaudeRelecture = '';
    dernierRapportAudit = null;
    dernierAuditContexte = null;
    documentsEnvoyesRelecture = [];
    constatsClaudeRelecture = [];
    fermerVisionneuseRelecture();
    const select = document.getElementById('audit-mode');
    if (select) auditMode = select.value === 'acte' ? 'acte' : 'compromis';
  }

  function quitterRelectureArchivee() {
    fermerRelectureArchivee();
    definirEtapeRelecture(1);
  }

  function supprimerRelectureArchivee(id) {
    demanderConfirmation("Supprimer cette analyse enregistrée ? Elle ne pourra plus être rouverte (les commentaires donnés restent).", async () => {
      try {
        const r = await fetchAvecAuth('/api/relectures/' + encodeURIComponent(id), { method: 'DELETE' });
        if (!r.ok) throw new Error('statut ' + r.status);
      } catch (e) {
        afficherToast("Suppression impossible (serveur injoignable ?).", 'OK', null);
        return;
      }
      if (relectureArchiveeOuverte && relectureArchiveeOuverte.id === id) quitterRelectureArchivee();
      chargerHistoriqueRelectures();
    });
  }

  function renderBandeauArchiveRelecture() {
    if (!relectureArchiveeOuverte) return '';
    const quand = new Date(relectureArchiveeOuverte.createdAt);
    const date = isNaN(quand) ? '' : quand.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' à ' + quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `<div class="relecture-archive-bandeau">
      <span class="dot-label dl-neutre">${icone('clock')}Analyse enregistrée${date ? ' le ' + escapeHtml(date) : ''}</span>
      <span class="hint">Consultation : rien n'est relancé ni refacturé.</span>
      <button type="button" class="secondary" onclick="quitterRelectureArchivee()">Fermer</button>
    </div>`;
  }

  // ---- Étape 4 : bilan -------------------------------------------------------------------------

  var GRAVITE_PAR_NIVEAU_RELECTURE = { critique: 'CRITIQUE', surveiller: 'A_VERIFIER', valide: 'INFORMATION' };

  function niveauDepuisGraviteRelecture(g) {
    if (g === 'CRITIQUE' || g === 'IMPORTANT') return 'critique';
    if (g === 'A_VERIFIER') return 'surveiller';
    return 'valide';
  }

  // Les lignes de Claude qui demandent une action deviennent des « constats » : même registre, même
  // commentaires (juste / faux positif / mal formulé / gravité) que les contrôles CLAIRE. Leur
  // catégorie est propre à chaque point de la grille, pour qu'un avis ne déborde pas d'un point sur
  // l'autre (appliquerRetoursAuxConstats ne rapproche que dans la même catégorie).
  function construireConstatsClaudeRelecture(sections) {
    constatsClaudeRelecture = [];
    const a = analyseClaudeRelecture;
    if (!a) return;
    for (const s of sections) {
      for (const l of s.lignes) {
        if (l.niveau !== 'critique' && l.niveau !== 'surveiller') continue;
        const cit = l.citations.find(c => c.verifie) || l.citations[0];
        constatsClaudeRelecture.push({ uid: 'g-' + l.id, categorie: 'GRILLE_' + l.id, gravite: GRAVITE_PAR_NIVEAU_RELECTURE[l.niveau],
          titre: l.intitule, description: l.commentaire, phrase: cit ? cit.extrait : '', page: cit ? cit.page : null, ligne: l });
      }
    }
    // Clauses contradictoires : une catégorie à part, pour qu'un avis sur une contradiction ne
    // s'applique jamais à une anomalie (et inversement).
    (a.contradictions || []).forEach((x, i) => {
      const cit = [x.clause_a, x.clause_b].find(c => c && c.verifie) || x.clause_a;
      constatsClaudeRelecture.push({ uid: 'x-' + i, categorie: 'CONTRADICTION_CLAUDE', gravite: x.gravite === 'elevee' ? 'CRITIQUE' : 'A_VERIFIER',
        titre: x.sujet, description: x.explication, phrase: cit ? cit.extrait : '', page: cit ? cit.page : null, contradiction: x });
    });
    (a.anomalies || []).forEach((x, i) => {
      const cit = (x.citations || []).find(c => c.verifie) || (x.citations || [])[0];
      constatsClaudeRelecture.push({ uid: 'a-' + i, categorie: 'ANOMALIE_CLAUDE', gravite: x.gravite === 'elevee' ? 'CRITIQUE' : 'A_VERIFIER',
        titre: x.titre, description: x.description, phrase: cit ? cit.extrait : '', page: cit ? cit.page : null, anomalie: x });
    });
  }

  function pastilleCitationRelecture(c) {
    if (!c) return '';
    const idx = citationsRelecture.push(c) - 1;
    const doc = documentsEnvoyesRelecture.find(d => d.numero === c.document);
    const f = doc ? (fichiersAnalyseIa.find(x => x.id === doc.fichierId) || (doc.nom ? doc : null)) : null;
    const nomDoc = f ? f.nom : 'Document';
    const court = f ? (f.type === 'principal' ? 'Projet' : f.type === 'reference_compromis' ? 'Avant-contrat' : libelleNaturePieceOutil2(f.nature)) : `Doc ${c.document || '?'}`;
    const verif = c.verifie ? '' : ` <span class="page-chip-alerte" title="Extrait introuvable mot pour mot dans le document : à vérifier en priorité">${icone('alert-triangle')}</span>`;
    return `<button type="button" class="page-chip${c.verifie ? '' : ' non-verifiee'}" onclick="ouvrirCitationRelecture(${idx})" title="${escapeAttr(nomDoc)}${c.extrait ? ' — « ' + escapeAttr(c.extrait.slice(0, 160)) + ' »' : ''}">
      ${icone('eye')}${escapeHtml(court)}${c.page ? ` · p.${c.page}` : ''}${verif}</button>`;
  }

  function lignePointRelecture(l) {
    const c = constatsClaudeRelecture.find(x => x.uid === 'g-' + l.id);
    let niveau = l.niveau;
    let exclu = false;
    if (c) {
      if (c.retour && c.retour.verdict === 'faux_positif') exclu = true;
      else niveau = niveauDepuisGraviteRelecture(c.gravite);
    }
    const n = NIVEAUX_RELECTURE_OUTIL2[exclu ? 'na' : niveau];
    const pied = c ? (modeCommentairesAudit ? renderCommentaireConstatAudit(c) : renderRetourResumeAudit(c)) : '';
    const citations = l.citations.map(pastilleCitationRelecture).join('');
    return `<div class="point-ligne niveau-${exclu ? 'na' : niveau}"${c ? ` id="audit-constat-${c.uid}"` : ''}>
      <span class="dot-label ${n.dl}">${icone(n.icone)}${exclu ? 'Faux positif' : n.texte}</span>
      <div class="point-corps">
        <div class="point-intitule">${escapeHtml(l.intitule)}${l.base_legale ? `<span class="hint"> · ${escapeHtml(l.base_legale)}</span>` : ''}</div>
        ${l.commentaire ? `<p class="point-commentaire">${escapeHtml(l.commentaire)}</p>` : ''}
        ${citations ? `<div class="point-citations">${citations}</div>` : ''}
        ${pied}
      </div>
    </div>`;
  }

  // Niveau d'une ligne une fois les commentaires de l'étude appliqués (faux positif = sans objet).
  function niveauEffectifRelecture(l) {
    const c = constatsClaudeRelecture.find(x => x.uid === 'g-' + l.id);
    if (!c) return l.niveau;
    if (c.retour && c.retour.verdict === 'faux_positif') return 'na';
    return niveauDepuisGraviteRelecture(c.gravite);
  }

  function donutSanteRelecture(compte) {
    const segments = [['critique', 'var(--urgent)'], ['surveiller', 'var(--pret)'], ['valide', 'var(--success)']];
    const total = segments.reduce((s, [k]) => s + (compte[k] || 0), 0) || 1;
    const r = 42;
    const circ = 2 * Math.PI * r;
    let decalage = 0;
    const arcs = segments.map(([k, couleur]) => {
      const part = (compte[k] || 0) / total * circ;
      const arc = part > 0 ? `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${couleur}" stroke-width="11" stroke-dasharray="${part.toFixed(2)} ${(circ - part).toFixed(2)}" stroke-dashoffset="${(-decalage).toFixed(2)}" transform="rotate(-90 50 50)"/>` : '';
      decalage += part;
      return arc;
    }).join('');
    return `<svg class="sante-donut" viewBox="0 0 100 100" role="img" aria-label="${compte.critique || 0} critique(s), ${compte.surveiller || 0} à surveiller, ${compte.valide || 0} validé(s)">
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--line-soft)" stroke-width="11"/>${arcs}
    </svg>`;
  }

  var VERDICTS_SANTE_RELECTURE = {
    critique: { titre: 'Points critiques', phrase: 'à régler avant la signature' },
    surveiller: { titre: 'À surveiller', phrase: 'aucun point bloquant, des points restent à vérifier' },
    valide: { titre: 'Validé', phrase: 'aucun point à régler sur la grille' }
  };

  // Catégories de contrôles CLAIRE affichées dans le bilan : « Ce que dit l'acte » seulement.
  // Demande de l'étude : le reste (écarts avec l'avant-contrat, annexes) fait doublon avec la
  // grille relue par Claude, qui couvre les mêmes sujets pièce par pièce, citations à l'appui.
  function categoriesClaireBilanRelecture() {
    return new Set(SOUS_SECTIONS_RAPPORT_OUTIL2.filter(x => x.section === 'ACTE').map(x => x.cle));
  }

  // Validés d'un côté, à traiter de l'autre, pour chaque thème : on voit d'un coup d'œil ce qui est
  // acquis et ce qui reste à faire, sans déplier une liste. Pure, testable.
  function repartirLignesThemeRelecture(lignes) {
    const aTraiter = lignes.filter(l => l.niveau === 'critique' || l.niveau === 'surveiller')
      .sort((x, y) => NIVEAUX_RELECTURE_OUTIL2[x.niveau].rang - NIVEAUX_RELECTURE_OUTIL2[y.niveau].rang);
    return { aTraiter, valides: lignes.filter(l => l.niveau === 'valide'), na: lignes.filter(l => l.niveau === 'na') };
  }

  let derniereSanteRelecture = null;

  // ---- Diagnostic de la relecture ------------------------------------------------------------
  // Ce que la relecture a réellement lu, et surtout ce qu'elle a ÉCARTÉ et pourquoi : pages lues
  // par document, points que le modèle n'a pas traités, citations introuvables mot pour mot, puis,
  // thème par thème, les clauses examinées par les contrôles CLAIRE. Replié par défaut : c'est un
  // outil de dépannage, à ouvrir quand un point attendu manque au bilan.
  let diagnosticRelectureOuverts = new Set();
  let refsDiagnosticRelecture = [];
  var MAX_LIGNES_DIAGNOSTIC_RAISON = 25;

  function basculerDiagnosticRelecture(cle, ouvert) {
    if (ouvert) diagnosticRelectureOuverts.add(cle); else diagnosticRelectureOuverts.delete(cle);
  }

  function ouvrirDiagnosticRelecture(idx) {
    const ref = refsDiagnosticRelecture[idx];
    if (!ref) return;
    ouvrirVisionneuseRelecture(ref.fichierId, ref.page, ref.extrait, true);
    const v = document.getElementById('relecture-visionneuse');
    if (v && v.scrollIntoView) v.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Page cliquable quand le document est encore consultable (déposé dans cette session, ou relu
  // depuis le NAS) ; sinon simple mention de la page.
  function pageDiagnosticRelecture(e) {
    if (!e.page) return e.document ? `<span class="diag-doc">${escapeHtml(e.document)}</span>` : '';
    const f = fichiersAnalyseIa.find(x => x.nom === e.document);
    const libelle = `${e.document ? escapeHtml(e.document) + ' · ' : ''}p.${e.page}`;
    if (!f) return `<span class="diag-doc">${libelle}</span>`;
    const idx = refsDiagnosticRelecture.push({ fichierId: f.id, page: e.page, extrait: e.phrase.slice(0, 120) }) - 1;
    return `<button type="button" class="page-chip" onclick="ouvrirDiagnosticRelecture(${idx})">${icone('eye')}${libelle}</button>`;
  }

  function ligneDiagnosticRelecture(e, avecRaison) {
    return `<li>${avecRaison ? `<strong>${escapeHtml(e.raison)}</strong> ` : ''}${e.precision && !avecRaison ? `<strong>${escapeHtml(e.precision)}</strong> ` : ''}${pageDiagnosticRelecture(e)}
      ${e.phrase ? `<blockquote class="diag-clause">${escapeHtml(e.phrase)}</blockquote>` : ''}</li>`;
  }

  function detailsDiagnosticRelecture(cle, resume, corps) {
    const ouvert = diagnosticRelectureOuverts.has(cle) ? ' open' : '';
    return `<details class="diag-groupe"${ouvert} ontoggle="basculerDiagnosticRelecture('${cle}', this.open)">
      <summary>${resume}</summary>${corps}</details>`;
  }

  function listeDiagnosticRelecture(entrees, avecRaison) {
    const vus = entrees.slice(0, MAX_LIGNES_DIAGNOSTIC_RAISON);
    const reste = entrees.length - vus.length;
    return `<ul class="diag-liste">${vus.map(e => ligneDiagnosticRelecture(e, avecRaison)).join('')}</ul>
      ${reste > 0 ? `<p class="hint">… et ${reste} autre(s), non affichée(s).</p>` : ''}`;
  }

  function renderDiagnosticRelecture(r, sections) {
    refsDiagnosticRelecture = [];
    const blocs = [];

    const couverture = r.couvertureDocuments || [];
    if (couverture.length) {
      blocs.push(`<div class="diag-bloc"><span class="section-eyebrow">Documents lus</span>
        <ul class="diag-liste">${couverture.map(c => `<li><strong>${escapeHtml(c.nom || 'Document')}</strong> — ${escapeHtml(libelleCouverturePages(c) || 'lu')}</li>`).join('')}</ul></div>`);
    }

    const lignes = (sections || []).reduce((acc, s) => acc.concat(s.lignes || []), []);
    if (analyseClaudeRelecture) {
      const omis = lignes.filter(l => l.omis);
      const citations = [];
      for (const l of lignes) for (const c of (l.citations || [])) if (!c.verifie) citations.push({ l, c });
      for (const x of (analyseClaudeRelecture.anomalies || [])) for (const c of (x.citations || [])) if (!c.verifie) citations.push({ l: { intitule: x.titre }, c });
      for (const x of (analyseClaudeRelecture.contradictions || [])) for (const c of [x.clause_a, x.clause_b]) if (c && !c.verifie) citations.push({ l: { intitule: 'Contradiction — ' + x.sujet }, c });
      blocs.push(`<div class="diag-bloc"><span class="section-eyebrow">Lecture par l’IA</span>
        <ul class="diag-liste">
          <li>${lignes.length} point(s) posé(s), ${omis.length ? `<strong>${omis.length} non traité(s) par le modèle</strong> (affichés « à vérifier »)` : 'tous traités par le modèle'}.</li>
          <li>${citations.length ? `<strong>${citations.length} citation(s) introuvable(s) mot pour mot</strong> dans les documents : à relire en priorité.` : 'Toutes les citations ont été retrouvées mot pour mot dans les documents.'}</li>
        </ul>
        ${omis.length ? detailsDiagnosticRelecture('omis', `Points non traités (${omis.length})`, `<ul class="diag-liste">${omis.map(l => `<li>${escapeHtml(l.intitule)}</li>`).join('')}</ul>`) : ''}
        ${citations.length ? detailsDiagnosticRelecture('citations', `Citations introuvables (${citations.length})`,
          `<ul class="diag-liste">${citations.map(({ l, c }) => `<li><strong>${escapeHtml(l.intitule)}</strong>${c.page ? ` · p.${c.page}` : ''}<blockquote class="diag-clause">${escapeHtml(c.extrait || '')}</blockquote></li>`).join('')}</ul>`) : ''}
      </div>`);
    }

    const themes = syntheseDiagnosticOutil2(r.diagnostic || []);
    if (themes.length) {
      blocs.push(`<div class="diag-bloc"><span class="section-eyebrow">Contrôles CLAIRE : clauses examinées ${infoBulle("Pour chaque thème, les clauses retenues et celles écartées avec la raison. Un point attendu qui manque au bilan se trouve en général dans une raison d’écart.")}</span>
        ${themes.map(t => detailsDiagnosticRelecture('theme:' + t.cle,
          `<strong>${escapeHtml(t.libelle)}</strong> <span class="diag-compte">${t.retenues.length} retenue(s) · ${t.nbEcartees} écartée(s)</span>`,
          (t.retenues.length ? detailsDiagnosticRelecture(`ret:${t.cle}`, `Retenues (${t.retenues.length})`, listeDiagnosticRelecture(t.retenues, true)) : '')
          + t.ecartees.map((g, i) => detailsDiagnosticRelecture(`ec:${t.cle}:${i}`, `Écartées — ${escapeHtml(g.raison)} (${g.entrees.length})`, listeDiagnosticRelecture(g.entrees, false))).join('')
        )).join('')}
      </div>`);
    } else if (r.diagnostic) {
      blocs.push('<p class="hint">Les contrôles CLAIRE n’ont examiné aucune clause des thèmes suivis.</p>');
    }

    if (!blocs.length) return '';
    const ouvert = diagnosticRelectureOuverts.has('racine') ? ' open' : '';
    return `<details class="diagnostic-parcours diagnostic-relecture"${ouvert} ontoggle="basculerDiagnosticRelecture('racine', this.open)">
      <summary><span class="section-eyebrow">Diagnostic de la relecture</span></summary>
      <div class="diagnostic-corps">${blocs.join('')}</div>
    </details>`;
  }

  function renderTableauDeBordRelecture() {
    const zone = document.getElementById('relecture-bilan');
    if (!zone) return;
    const r = dernierRapportAudit;
    if (!r) { zone.innerHTML = '<p class="hint">Aucune analyse pour l’instant.</p>'; return; }
    citationsRelecture = [];
    const a = analyseClaudeRelecture;
    const typeBien = typeBienEnvoyeRelecture || r.typeBien || '';
    const sections = a ? sectionsTableauDeBordOutil2(a, auditMode, typeBien) : [];
    construireConstatsClaudeRelecture(sections);
    // Les commentaires de l'étude s'appliquent aux lignes de Claude comme aux contrôles CLAIRE.
    for (const c of constatsClaudeRelecture) constatsAuditParUid[c.uid] = c;
    appliquerRetoursAuxConstats(constatsClaudeRelecture, retoursAudit, dernierAuditContexte ? dernierAuditContexte.dossierCle : '');

    const anomalies = constatsClaudeRelecture.filter(c => c.anomalie);
    const contradictions = constatsClaudeRelecture.filter(c => c.contradiction);
    const extras = anomalies.concat(contradictions).filter(c => !(c.retour && c.retour.verdict === 'faux_positif')).map(c => niveauDepuisGraviteRelecture(c.gravite));
    // Les contrôles CLAIRE affichés comptent aussi : une procédure en cours relevée par nos règles
    // est un point critique, qu'une ligne de grille l'ait vue ou non.
    const catsClaire = categoriesClaireBilanRelecture();
    for (const c of (r.constats || [])) {
      if (!catsClaire.has(c.categorie) || constatExcluOutil2(c) || rubriqueMasqueeAudit(c.categorie)) continue;
      if (c.gravite === 'CRITIQUE' || c.gravite === 'IMPORTANT') extras.push('critique');
      else if (c.gravite === 'A_VERIFIER') extras.push('surveiller');
    }
    const sectionsEffectives = sections.map(s => {
      const lignes = s.lignes.map(l => ({ ...l, niveau: niveauEffectifRelecture(l), _source: l }));
      const actives = lignes.filter(l => l.niveau !== 'na');
      const niveau = actives.some(l => l.niveau === 'critique') ? 'critique' : actives.some(l => l.niveau === 'surveiller') ? 'surveiller' : (actives.length ? 'valide' : 'na');
      return { ...s, niveau, lignesEff: lignes };
    });
    const sante = santeRelectureOutil2(sectionsEffectives.map(s => ({ lignes: s.lignesEff })), extras);
    derniereSanteRelecture = sante;
    const v = VERDICTS_SANTE_RELECTURE[sante.niveau];
    const n = NIVEAUX_RELECTURE_OUTIL2[sante.niveau];

    const copros = (a && a.coproprietes) || [];
    const textesCopro = documentsOrdonnesRelecture().filter(f => f.type !== 'justificatif').map(f => f.texte).join('\n');
    const detectees = detecterCoproprietesMultiplesOutil2(textesCopro);
    const bandeauCopro = copros.length > 1 || detectees.multiples ? `<section class="copro-multiples">
        <span class="dot-label dl-pret">${icone('info')}${Math.max(copros.length, detectees.nombre)} copropriétés dans cet acte</span>
        ${copros.length ? `<ul>${copros.map(c => `<li><strong>${escapeHtml(c.designation)}</strong>${c.lots ? ` — lots ${escapeHtml(c.lots)}` : ''}${c.observations ? `<p class="hint">${escapeHtml(c.observations)}</p>` : ''}</li>`).join('')}</ul>` : '<p class="hint">Chaque point copropriété de la grille doit être vérifié pour chacune d’elles.</p>'}
      </section>` : '';

    const tuiles = sectionsEffectives.map(s => {
      const ns = NIVEAUX_RELECTURE_OUTIL2[s.niveau];
      const points = s.lignesEff.map(l => `<span class="tuile-point niveau-${l.niveau}" title="${escapeAttr(l.intitule)} — ${NIVEAUX_RELECTURE_OUTIL2[l.niveau].texte}"></span>`).join('');
      return `<button type="button" class="sante-tuile niveau-${s.niveau}" onclick="allerSectionRelecture('${s.cle}')">
        <span class="sante-tuile-titre">${escapeHtml(s.titre)}</span>
        <span class="dot-label ${ns.dl}"><span class="dot"></span>${ns.texte}</span>
        <span class="sante-tuile-points">${points}</span>
      </button>`;
    }).join('');

    const detailSections = sectionsEffectives.map(s => {
      const { aTraiter, valides, na } = repartirLignesThemeRelecture(s.lignesEff);
      const ns = NIVEAUX_RELECTURE_OUTIL2[s.niveau];
      return `<section class="grille-section niveau-${s.niveau}" id="relecture-section-${s.cle}">
        <h3 class="grille-section-titre"><span>${escapeHtml(s.titre)}</span><span class="dot-label ${ns.dl}"><span class="dot"></span>${ns.texte}</span></h3>
        <div class="grille-colonnes">
          <div class="grille-col grille-col-traiter">
            <span class="section-eyebrow">À surveiller <span class="grille-col-compte">${aTraiter.length}</span></span>
            ${aTraiter.length ? aTraiter.map(l => lignePointRelecture(l._source)).join('') : '<p class="hint grille-col-vide">Rien à surveiller sur ce thème.</p>'}
          </div>
          <div class="grille-col grille-col-valides">
            <span class="section-eyebrow">Validé <span class="grille-col-compte">${valides.length}</span></span>
            ${valides.length ? valides.map(l => lignePointRelecture(l._source)).join('') : '<p class="hint grille-col-vide">Aucun point validé.</p>'}
          </div>
        </div>
        ${na.length ? `<p class="hint grille-na">${na.length} point(s) sans objet : ${escapeHtml(na.map(l => l.intitule.split(' (')[0]).join(' · '))}</p>` : ''}
      </section>`;
    }).join('');

    // Clauses contradictoires : les deux passages côte à côte, chacun avec sa page — c'est en les
    // lisant ensemble que le notaire tranche. Affichée même vide quand l'IA a tourné : « aucune
    // contradiction relevée » est une information, pas un silence.
    const clauseContradiction = (c, lettre) => c ? `<div class="contradiction-clause">
        <span class="contradiction-lettre">${lettre}</span>
        <blockquote class="obligation-clause${c.verifie ? '' : ' non-verifiee'}">${escapeHtml(c.extrait || '')}</blockquote>
        <div class="point-citations">${pastilleCitationRelecture(c)}</div>
      </div>` : '';
    // Une analyse enregistrée avant cette rubrique n'a pas de liste : rien n'y a été cherché, on
    // n'affiche donc pas « aucune contradiction ».
    const contradictionsHtml = a && Array.isArray(a.contradictions) ? `<section class="grille-section" id="relecture-section-contradictions">
        <h3 class="grille-section-titre"><span>Clauses contradictoires</span><span class="audit-section-compte">${contradictions.length}</span></h3>
        ${contradictions.length ? contradictions.map(c => {
          const exclu = c.retour && c.retour.verdict === 'faux_positif';
          const niv = exclu ? 'na' : niveauDepuisGraviteRelecture(c.gravite);
          const nn = NIVEAUX_RELECTURE_OUTIL2[niv];
          const pied = modeCommentairesAudit ? renderCommentaireConstatAudit(c) : renderRetourResumeAudit(c);
          return `<div class="point-ligne niveau-${niv}" id="audit-constat-${c.uid}">
            <span class="dot-label ${nn.dl}">${icone(nn.icone)}${exclu ? 'Faux positif' : nn.texte}</span>
            <div class="point-corps"><div class="point-intitule">${escapeHtml(c.titre)}</div>
              ${c.description ? `<p class="point-commentaire">${escapeHtml(c.description)}</p>` : ''}
              <div class="contradiction-paire">${clauseContradiction(c.contradiction.clause_a, 'A')}${clauseContradiction(c.contradiction.clause_b, 'B')}</div>${pied}</div>
          </div>`;
        }).join('') : '<p class="hint grille-col-vide">Aucune contradiction relevée entre les clauses.</p>'}
      </section>` : '';

    const anomaliesHtml = anomalies.length ? `<section class="grille-section" id="relecture-section-anomalies">
        <h3 class="grille-section-titre"><span>Autres points relevés</span><span class="audit-section-compte">${anomalies.length}</span></h3>
        ${anomalies.map(c => {
          const exclu = c.retour && c.retour.verdict === 'faux_positif';
          const niv = exclu ? 'na' : niveauDepuisGraviteRelecture(c.gravite);
          const nn = NIVEAUX_RELECTURE_OUTIL2[niv];
          const pied = modeCommentairesAudit ? renderCommentaireConstatAudit(c) : renderRetourResumeAudit(c);
          return `<div class="point-ligne niveau-${niv}" id="audit-constat-${c.uid}">
            <span class="dot-label ${nn.dl}">${icone(nn.icone)}${exclu ? 'Faux positif' : nn.texte}</span>
            <div class="point-corps"><div class="point-intitule">${escapeHtml(c.titre)}</div>
              ${c.description ? `<p class="point-commentaire">${escapeHtml(c.description)}</p>` : ''}
              <div class="point-citations">${(c.anomalie.citations || []).map(pastilleCitationRelecture).join('')}</div>${pied}</div>
          </div>`;
        }).join('')}
      </section>` : '';

    // Contrôle automatique CLAIRE, sans IA : seulement ce que dit l'acte lui-même.
    const blocActe = SECTIONS_RAPPORT_OUTIL2.find(b => b.cle === 'ACTE');
    const claire = `<section class="claire-controles claire-acte">
        <div class="claire-acte-tete"><span class="section-eyebrow">Contrôle automatique CLAIRE</span>
          <span class="hint">Règles locales, sans IA</span></div>
        ${renderPartiesDossierAudit(r)}
        ${renderBlocAudit(blocActe, r, r.constats || [])}
      </section>`;

    const f = factureRelecture;
    const cout = f ? `<section class="relecture-cout">
        <span class="section-eyebrow">Coût de l'analyse</span>
        <div class="relecture-cout-grille">
          <div><strong>${formaterCoutUsd(f.coutUsd)}</strong><span>facturé par ${(f.fournisseur || (String(f.modele || '').startsWith('mistral') ? 'mistral' : 'claude')) === 'mistral' ? 'Mistral AI' : 'Anthropic'}</span></div>
          <div><strong>${(f.jetonsEntree || 0).toLocaleString('fr-FR')}</strong><span>jetons lus</span></div>
          <div><strong>${(f.jetonsSortie || 0).toLocaleString('fr-FR')}</strong><span>jetons produits</span></div>
          <div><strong>${formaterDureeMs(f.dureeMs)}</strong><span>${escapeHtml(LIBELLES_MODELES_CLAUDE[f.modele] || f.modele || '')}</span></div>
        </div>
        ${renderJournalCoutRelecture()}
      </section>` : '';

    const libelleType = (TYPES_BIEN_AUDIT.find(t => t.valeur === typeBien) || {}).libelle;
    const entete = `<section class="sante-carte niveau-${sante.niveau}">
        <div class="sante-visuel">${donutSanteRelecture(sante.compte)}<span class="sante-visuel-chiffre">${sante.compte.critique + sante.compte.surveiller}<small>à traiter</small></span></div>
        <div class="sante-texte">
          <span class="dot-label ${n.dl}">${icone(n.icone)}${v.titre}</span>
          <h2 class="sante-titre">${a && a.type_acte ? escapeHtml(a.type_acte) : (auditMode === 'acte' ? "Projet d'acte de vente" : "Projet d'avant-contrat")}</h2>
          ${libelleType ? `<span class="sante-type-bien">${escapeHtml(libelleType)}</span>` : ''}
          <p class="sante-phrase">${sante.compte.critique ? `${sante.compte.critique} point(s) critique(s), ` : ''}${v.phrase}.</p>
          <div class="sante-compteurs">
            <span class="sante-compteur c-critique"><strong>${sante.compte.critique}</strong>critique(s)</span>
            <span class="sante-compteur c-surveiller"><strong>${sante.compte.surveiller}</strong>à surveiller</span>
            <span class="sante-compteur c-valide"><strong>${sante.compte.valide}</strong>validé(s)</span>
            <span class="sante-compteur c-na"><strong>${sante.compte.na}</strong>sans objet</span>
          </div>
          ${a && a.synthese ? `<p class="sante-synthese">${escapeHtml(a.synthese)}</p>` : ''}
          ${a ? '' : `<p class="hint">${erreurClaudeRelecture ? escapeHtml(erreurClaudeRelecture) + ' — ' : ''}Analyse par l'IA non effectuée : ce bilan ne repose que sur les contrôles automatiques de CLAIRE.</p>`}
        </div>
        <label class="audit-bascule-commentaires" title="Donner votre avis sur chaque point : il est retenu pour les prochaines relectures (pour ce dossier ou pour tous).">
          <span class="switch small"><input type="checkbox" ${modeCommentairesAudit ? 'checked' : ''} onchange="basculerModeCommentairesAudit(this.checked)"><span class="slider"></span></span>
          Mode commentaires
        </label>
      </section>`;

    zone.innerHTML = `${renderBandeauArchiveRelecture()}
    <div class="relecture-bilan-haut">
      <div class="relecture-bilan-resume">${entete}${bandeauCopro}</div>
      ${claire}
    </div>
    ${modeCommentairesAudit ? renderPanneauCommentairesAudit() : ''}
    <div class="relecture-bilan-grille">
      <div class="relecture-bilan-principal">
        ${tuiles ? `<div class="sante-tuiles">${tuiles}</div>` : ''}
        ${detailSections}
        ${contradictionsHtml}
        ${anomaliesHtml}
        ${cout}
        ${renderDiagnosticRelecture(r, sections)}
        <p class="hint relecture-cadre">Aide à la relecture ${infoBulle("Chaque point est une proposition, citée page à l'appui, que le notaire vérifie et tranche. Les données identifiantes ont été masquées avant l'envoi et la correspondance est restée sur ce poste.")}</p>
      </div>
      <aside class="relecture-visionneuse" id="relecture-visionneuse" aria-label="Aperçu du document"></aside>
    </div>`;
    // L'aperçu reste toujours ouvert : sur la citation demandée, sinon sur le document relu.
    const v0 = visionneuseRelecture;
    if (v0.ouverte && fichierRelecture(v0.fichierId)) renderVisionneuseRelecture(true);
    else {
      const defaut = premierDocumentVisionneuseRelecture();
      if (defaut) ouvrirVisionneuseRelecture(defaut.id, 1, '', true);
      else renderVisionneuseVideRelecture();
    }
  }

  function allerSectionRelecture(cle) {
    const el = document.getElementById('relecture-section-' + cle);
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- Visionneuse : les pastilles de page ouvrent le document à la bonne page ----------------
  let visionneuseRelecture = { ouverte: false, fichierId: null, page: 1, extrait: '', verifie: true, pdf: null, rendues: new Set() };
  const cachePdfRelecture = new Map();

  async function pdfPourFichierRelecture(f) {
    if (cachePdfRelecture.has(f.id)) return cachePdfRelecture.get(f.id);
    let pdf;
    if (f.cheminNas) {
      pdf = await ouvrirPdfNas(f.cheminNas);
    } else {
      const buffer = await f.file.arrayBuffer();
      pdf = await pdfjsLib.getDocument({ data: buffer, verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
    }
    cachePdfRelecture.set(f.id, pdf);
    return pdf;
  }

  // Un document de la relecture tel qu'on peut l'afficher : le fichier déposé ou lu sur le NAS
  // pendant la session, ou — pour une analyse enregistrée rouverte plus tard — son chemin sur le
  // NAS, seul moyen de le retrouver (les PDF déposés depuis le poste ne sont pas conservés).
  function fichierRelecture(fichierId) {
    const f = fichiersAnalyseIa.find(x => x.id === fichierId);
    if (f) return f;
    const d = documentsEnvoyesRelecture.find(x => x.fichierId === fichierId);
    return d && d.cheminNas ? { id: d.fichierId, nom: d.nom, type: d.type, nature: d.nature, cheminNas: d.cheminNas } : null;
  }

  function premierDocumentVisionneuseRelecture() {
    const docs = documentsEnvoyesRelecture.length
      ? documentsEnvoyesRelecture.map(d => fichierRelecture(d.fichierId)).filter(Boolean)
      : documentsOrdonnesRelecture();
    return docs.find(f => f.type === 'principal') || docs[0] || null;
  }

  // Jamais un grand cadre blanc : sans document à montrer, l'aperçu dit pourquoi.
  function fermerVisionneuseRelecture() {
    visionneuseRelecture = { ouverte: false, fichierId: null, page: 1, extrait: '', verifie: true, pdf: null, rendues: new Set() };
  }

  function renderVisionneuseVideRelecture() {
    const aside = document.getElementById('relecture-visionneuse');
    if (!aside) return;
    aside.dataset.fichier = '';
    aside.innerHTML = `<div class="visionneuse-vide">${icone('eye')}<strong>Aucun aperçu disponible</strong>
      <p class="hint">${relectureArchiveeOuverte
        ? "Cette analyse enregistrée ne conserve pas les PDF déposés depuis le poste : seules les pièces lues sur le NAS peuvent être rouvertes."
        : "Le document relu n'est plus disponible dans cette session."}</p></div>`;
  }

  function ouvrirCitationRelecture(idx) {
    const c = citationsRelecture[idx];
    if (!c) return;
    const doc = documentsEnvoyesRelecture.find(d => d.numero === c.document);
    if (!doc || !fichierRelecture(doc.fichierId)) {
      afficherToast(doc ? "Ce document n'est pas conservé avec l'analyse enregistrée : ouvrez-le depuis le NAS." : "Document introuvable pour cette citation.", 'OK', null);
      return;
    }
    ouvrirVisionneuseRelecture(doc.fichierId, c.page || 1, c.extrait || '', c.verifie !== false);
    // Sous 1180 px l'aperçu passe sous les thèmes : on l'amène à l'écran.
    const aside = document.getElementById('relecture-visionneuse');
    if (aside && window.innerWidth <= 1180 && aside.scrollIntoView) aside.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function ouvrirVisionneuseRelecture(fichierId, page, extrait, verifie) {
    const changement = visionneuseRelecture.fichierId !== fichierId;
    visionneuseRelecture = { ...visionneuseRelecture, ouverte: true, fichierId, page, extrait, verifie };
    if (changement) { visionneuseRelecture.pdf = null; visionneuseRelecture.rendues = new Set(); }
    await renderVisionneuseRelecture(changement);
  }

  async function renderVisionneuseRelecture(reconstruire) {
    const aside = document.getElementById('relecture-visionneuse');
    const v = visionneuseRelecture;
    const f = fichierRelecture(v.fichierId);
    if (!aside) return;
    if (!f) { renderVisionneuseVideRelecture(); return; }
    const affichables = (documentsEnvoyesRelecture.length
      ? documentsEnvoyesRelecture.map(d => fichierRelecture(d.fichierId))
      : documentsOrdonnesRelecture()).filter(Boolean);
    const options = affichables.map(x => `<option value="${escapeAttr(x.id)}" ${x.id === f.id ? 'selected' : ''}>${escapeHtml(x.nom)}</option>`).join('');
    const existant = aside.querySelector('.visionneuse-pages');
    if (!existant || reconstruire || aside.dataset.fichier !== f.id) {
      aside.dataset.fichier = f.id;
      aside.innerHTML = `<div class="visionneuse-tete">
          <span class="visionneuse-titre">${icone('eye')}Aperçu</span>
          <select aria-label="Document affiché" onchange="ouvrirVisionneuseRelecture(this.value, 1, '', true)">${options}</select>
        </div>
        <div class="visionneuse-extrait" id="visionneuse-extrait"></div>
        <div class="visionneuse-pages" id="visionneuse-pages"><p class="hint">${icone('spinner', null, true)} Ouverture du document…</p></div>`;
      v.rendues = new Set();
    }
    const ex = document.getElementById('visionneuse-extrait');
    if (ex) {
      ex.innerHTML = v.extrait
        ? `<blockquote class="obligation-clause"><span class="obligation-page">p.${v.page}</span>${escapeHtml(v.extrait)}</blockquote>${v.verifie ? '' : `<p class="analyse-ia-citation-douteuse">${icone('alert-triangle')}Extrait introuvable mot pour mot : la page indiquée est celle annoncée par l'analyse, à vérifier.</p>`}`
        : '';
    }
    if (!window.pdfjsLib) {
      document.getElementById('visionneuse-pages').innerHTML = '<p class="hint">Lecture PDF indisponible.</p>';
      return;
    }
    try {
      if (!v.pdf) v.pdf = await pdfPourFichierRelecture(f);
      const conteneur = document.getElementById('visionneuse-pages');
      if (!conteneur.querySelector('.visionneuse-page')) {
        conteneur.innerHTML = '';
        // Les emplacements prennent d'emblée la taille d'une page entière (celle de la page 1) : la
        // position de défilement de chaque page est juste avant même qu'elle soit dessinée.
        const premiere = await v.pdf.getPage(1);
        const taille = tailleVisionneuseRelecture(premiere.getViewport({ scale: 1 }), conteneur);
        for (let i = 1; i <= v.pdf.numPages; i++) {
          const bloc = document.createElement('div');
          bloc.className = 'visionneuse-page';
          bloc.id = 'visionneuse-page-' + i;
          bloc.dataset.page = String(i);
          bloc.style.width = taille.largeur + 'px';
          bloc.style.height = taille.hauteur + 'px';
          bloc.innerHTML = `<span class="visionneuse-num">p.${i}</span>`;
          conteneur.appendChild(bloc);
        }
        // Rendu à la demande : un dossier de 60 pages ne se dessine pas d'un bloc.
        const observateur = new IntersectionObserver(entrees => {
          for (const e of entrees) if (e.isIntersecting) rendrePageVisionneuseRelecture(Number(e.target.dataset.page));
        }, { root: conteneur, rootMargin: '400px 0px' });
        conteneur.querySelectorAll('.visionneuse-page').forEach(b => observateur.observe(b));
      }
      const page = Math.max(1, Math.min(v.page, v.pdf.numPages));
      await rendrePageVisionneuseRelecture(page);
      const conteneurPages = document.getElementById('visionneuse-pages');
      const cible = document.getElementById('visionneuse-page-' + page);
      if (cible) {
        // Défile dans l'aperçu seul : un scrollIntoView ferait aussi bouger toute la page.
        conteneurPages.scrollTop += cible.getBoundingClientRect().top - conteneurPages.getBoundingClientRect().top - 8;
        if (v.extrait || page > 1) {
          cible.classList.remove('flash');
          void cible.offsetWidth;
          cible.classList.add('flash');
        }
      }
      if (v.extrait) surlignerExtraitVisionneuseRelecture(page, v.extrait);
    } catch (e) {
      console.error('Visionneuse : ouverture impossible', e);
      const conteneur = document.getElementById('visionneuse-pages');
      if (conteneur) conteneur.innerHTML = `<p class="hint">${icone('alert-triangle')} Ouverture du document impossible.</p>`;
    }
  }

  async function rendrePageVisionneuseRelecture(numero) {
    const v = visionneuseRelecture;
    if (!v.pdf || v.rendues.has(numero)) return;
    v.rendues.add(numero);
    const bloc = document.getElementById('visionneuse-page-' + numero);
    if (!bloc) return;
    const page = await v.pdf.getPage(numero);
    const base = page.getViewport({ scale: 1 });
    const taille = tailleVisionneuseRelecture(base, document.getElementById('visionneuse-pages'));
    bloc.style.width = taille.largeur + 'px';
    bloc.style.height = taille.hauteur + 'px';
    const viewport = page.getViewport({ scale: taille.echelle * (window.devicePixelRatio || 1) });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    bloc.appendChild(canvas);
  }

  // La page ENTIÈRE tient dans la zone visible de la visionneuse, en largeur comme en hauteur :
  // caler seulement la largeur donnait une page A4 plus haute que le panneau, dont on ne voyait
  // jamais le bas sans faire défiler (demande de l'étude au premier essai de la relecture).
  function tailleVisionneuseRelecture(base, conteneur) {
    return tailleAjusteePage(base.width, base.height,
      (conteneur && conteneur.clientWidth) || 540, (conteneur && conteneur.clientHeight) || 760);
  }

  // Pure : dimensions d'une page de largeur l × hauteur h ramenée dans une zone dispoL × dispoH
  // (marges intérieures de la zone déduites), sans jamais la déformer.
  function tailleAjusteePage(l, h, dispoL, dispoH) {
    const marge = 24;
    const largeurDispo = Math.max(160, dispoL - marge);
    const hauteurDispo = Math.max(200, dispoH - marge);
    const echelle = Math.min(largeurDispo / l, hauteurDispo / h);
    return { echelle, largeur: Math.floor(l * echelle), hauteur: Math.floor(h * echelle) };
  }

  // Même principe que voirEngagementDansPdf (Outil 1) : retrouver l'extrait dans le texte de la
  // page et poser un surlignage sur les items pdf.js concernés.
  async function surlignerExtraitVisionneuseRelecture(numero, extrait) {
    try {
      const v = visionneuseRelecture;
      const bloc = document.getElementById('visionneuse-page-' + numero);
      const canvas = bloc && bloc.querySelector('canvas');
      if (!canvas) return;
      const page = await v.pdf.getPage(numero);
      const content = await page.getTextContent();
      const echelleAffichee = canvas.clientWidth / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale: echelleAffichee });
      let texte = '';
      const origines = [];
      content.items.forEach((item, i) => { for (const ch of item.str) { texte += ch; origines.push(i); } texte += ' '; origines.push(-1); });
      const { texte: texteNorm, index } = normaliserAvecIndex(texte);
      const cible = normaliserAvecIndex(extrait).texte;
      let longueur = Math.min(60, cible.length);
      let pos = -1;
      while (longueur >= 15 && pos === -1) { pos = texteNorm.indexOf(cible.slice(0, longueur)); if (pos === -1) longueur -= 10; }
      if (pos === -1) return;
      const debut = index[pos];
      const fin = index[Math.min(pos + cible.length - 1, index.length - 1)];
      const items = new Set();
      for (let i = debut; i <= fin; i++) if (origines[i] >= 0) items.add(origines[i]);
      bloc.querySelectorAll('.pdf-highlight').forEach(h => h.remove());
      items.forEach(i => {
        const item = content.items[i];
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const hauteur = Math.hypot(tx[2], tx[3]) || 12;
        const s = document.createElement('div');
        s.className = 'pdf-highlight visionneuse-surlignage';
        s.style.left = Math.max(0, tx[4] - 3) + 'px';
        s.style.top = Math.max(0, tx[5] - hauteur - 2) + 'px';
        s.style.width = ((item.width || 0) * echelleAffichee + 6) + 'px';
        s.style.height = (hauteur + 5) + 'px';
        bloc.appendChild(s);
      });
    } catch (e) {
      console.warn('Surlignage impossible', e);
    }
  }

  // ---- Réglages : fournisseur, clés API et modèles ---------------------------------------------
  // Mistral par défaut (point d'accès de l'Union européenne), Claude en option. Un seul formulaire :
  // seuls les champs du fournisseur choisi sont affichés. Les clés ne reviennent jamais du serveur.
  let reglagesIaCharges = null;

  function afficherChampsFournisseurIa() {
    const sel = document.getElementById('reglages-ia-fournisseur');
    const f = sel ? sel.value : 'mistral';
    const m = document.getElementById('reglages-ia-mistral');
    const c = document.getElementById('reglages-ia-claude');
    // style.display et non l'attribut hidden : .calc-champs pose un display qui l'emporterait.
    if (m) m.style.display = f === 'mistral' ? '' : 'none';
    if (c) c.style.display = f === 'claude' ? '' : 'none';
  }

  async function chargerReglagesClaude() {
    try {
      const r = await fetchAvecAuth('/api/relecture-claude/reglages');
      if (!r.ok) return;
      const data = await r.json();
      reglagesIaCharges = data;
      const valeur = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
      valeur('reglages-ia-fournisseur', data.fournisseur || 'mistral');
      valeur('reglages-claude-modele', data.modele);
      valeur('reglages-mistral-modele', data.modeleMistral);
      valeur('reglages-mistral-region', data.regionMistral);
      const cleClaude = document.getElementById('reglages-claude-cle');
      if (cleClaude) {
        cleClaude.value = '';
        cleClaude.placeholder = data.cleEnregistree ? '•••••••• enregistrée — saisir pour remplacer' : (data.cleEnvironnement ? 'Clé fournie par le serveur (variable ANTHROPIC_API_KEY)' : 'sk-ant-…');
      }
      const cleMistral = document.getElementById('reglages-mistral-cle');
      if (cleMistral) {
        cleMistral.value = '';
        cleMistral.placeholder = data.cleMistralEnregistree ? '•••••••• enregistrée — saisir pour remplacer' : (data.cleMistralEnvironnement ? 'Clé fournie par le serveur (variable MISTRAL_API_KEY)' : 'Clé API Mistral');
      }
      afficherChampsFournisseurIa();
    } catch (e) { /* écran Réglages : sans connexion, rien à afficher */ }
  }

  async function enregistrerReglagesClaude() {
    const lire = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
    const corps = {
      fournisseur: lire('reglages-ia-fournisseur'),
      modele: lire('reglages-claude-modele'),
      modeleMistral: lire('reglages-mistral-modele'),
      regionMistral: lire('reglages-mistral-region')
    };
    // Une clé n'est envoyée que si quelqu'un l'a tapée : sinon celle en place est conservée.
    const cleClaude = (lire('reglages-claude-cle') || '').trim();
    const cleMistral = (lire('reglages-mistral-cle') || '').trim();
    if (cleClaude) corps.cleApi = cleClaude;
    if (cleMistral) corps.cleMistral = cleMistral;
    const res = document.getElementById('reglages-claude-resultat');
    try {
      const r = await fetchAvecAuth('/api/relecture-claude/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      if (!r.ok) throw new Error('statut ' + r.status);
      etatClaudeRelecture = null;
      estimationRelecture = null;
      await chargerReglagesClaude();
      if (res) res.innerHTML = `<span class="dot-label dl-success">${icone('check')}Enregistré</span>`;
    } catch (e) {
      if (res) res.innerHTML = `<span class="dot-label dl-urgent">${icone('alert-triangle')}Enregistrement impossible</span>`;
    }
  }

  // Efface la clé du fournisseur AFFICHÉ, pas les deux.
  async function effacerCleClaude() {
    const f = (document.getElementById('reglages-ia-fournisseur') || {}).value === 'claude' ? 'claude' : 'mistral';
    const nom = f === 'claude' ? 'Claude' : 'Mistral';
    demanderConfirmation(`Effacer la clé API ${nom} enregistrée sur le serveur ?`, async () => {
      const corps = f === 'claude' ? { cleApi: '' } : { cleMistral: '' };
      await fetchAvecAuth('/api/relecture-claude/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      etatClaudeRelecture = null;
      await chargerReglagesClaude();
    });
  }

  // Vérifie la clé du fournisseur ENREGISTRÉ (pas celui sélectionné sans avoir été enregistré).
  async function testerCleClaude() {
    const res = document.getElementById('reglages-claude-resultat');
    const choisi = (document.getElementById('reglages-ia-fournisseur') || {}).value;
    if (reglagesIaCharges && choisi && choisi !== reglagesIaCharges.fournisseur) {
      if (res) res.innerHTML = `<span class="dot-label dl-pret">${icone('alert-triangle')}Enregistrez d'abord le changement de fournisseur</span>`;
      return;
    }
    if (res) res.innerHTML = `<span class="hint">${icone('spinner', null, true)} Vérification…</span>`;
    try {
      const r = await fetchAvecAuth('/api/relecture-claude/tester', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await r.json().catch(() => ({}));
      const lieu = data.fournisseur === 'mistral' ? (data.region === 'global' ? '' : ' · Union européenne') : '';
      if (res) res.innerHTML = r.ok
        ? `<span class="dot-label dl-success">${icone('check')}Clé valide — ${escapeHtml(LIBELLES_MODELES_CLAUDE[data.modele] || data.libelle || data.modele)} accessible${lieu}</span>`
        : `<span class="dot-label dl-urgent">${icone('alert-triangle')}${escapeHtml(data.erreur || 'Échec')}</span>`;
    } catch (e) {
      if (res) res.innerHTML = `<span class="dot-label dl-urgent">${icone('alert-triangle')}Serveur injoignable</span>`;
    }
  }
