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

  // ---- Étape 1 : documents -------------------------------------------------------------------

  // ---- Étape 2 : pseudonymisation -------------------------------------------------------------

  // ---- Étape 3 : analyse ----------------------------------------------------------------------

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

  // Libellés des modèles de la relecture, tous fournisseurs confondus (le nom historique de la
  // table est conservé). Mistral est le fournisseur par défaut depuis le 27/09/2026.
  var LIBELLES_MODELES_CLAUDE = {
    'claude-sonnet-5': 'Claude Sonnet 5', 'claude-opus-5': 'Claude Opus 5',
    'mistral-medium-3-5': 'Mistral Medium 3.5', 'mistral-large-2512': 'Mistral Large 3'
  };

  // Pure, testable : filtre la liste sur le dossier, le document ou le type d'acte, sans accents.
  function filtrerHistoriqueRelectures(liste, recherche) {
    const q = normaliserPourRecherche(String(recherche || '').trim());
    if (!q) return liste || [];
    return (liste || []).filter(h => normaliserPourRecherche([h.dossierNom, h.libelle, h.mode === 'acte' ? "projet d'acte de vente" : 'avant-contrat'].join(' ')).indexOf(q) >= 0);
  }

  // ---- Étape 4 : bilan -------------------------------------------------------------------------

  // Catégories de contrôles CLAIRE affichées dans le bilan : « Ce que dit l'acte » seulement.
  // Demande de l'étude : le reste (écarts avec l'avant-contrat, annexes) fait doublon avec la
  // grille relue par Claude, qui couvre les mêmes sujets pièce par pièce, citations à l'appui.
  function categoriesClaireBilanRelecture() {
    return new Set(SOUS_SECTIONS_RAPPORT_OUTIL2.filter(x => x.section === 'ACTE').map(x => x.cle));
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
    // La clé Claude sert aussi à « Demander à CLAIRE » (étude 08/10) : champ montré dès que l'assistant utilise Claude.
    const assistant = document.getElementById('reglages-assistant-moteur');
    if (c) c.style.display = f === 'claude' || (assistant && assistant.value === 'claude') ? '' : 'none';
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
