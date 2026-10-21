  // ---- « Demander à CLAIRE » : lecture libre du NAS (étude 21/10, palier 2) ----
  // « Comment ClaireAI peut avoir autant de liberté que Claude desktop ? » — réponse : le NAS en LECTURE SEULE, hors du dossier d'un
  // client, dans les dossiers que l'étude a ouverts (Réglages › IA et relecture d'actes ; éteint par défaut, serveur/src/nasLibre.js).
  // L'agent ne voit que des identifiants opaques (element_id) et des noms que le serveur masque comme tout résultat d'outil ; un PDF
  // se lit par lire_document (pdf.js et OCR du poste, texte masqué), un Word ou un texte par le serveur.

  var elementsLibresAgent = { parChemin: {}, parId: {}, n: 0 };

  function reinitialiserNasLibreAgent() { elementsLibresAgent = { parChemin: {}, parId: {}, n: 0 }; }

  function idElementLibreAgent(chemin, type) {
    let id = elementsLibresAgent.parChemin[chemin];
    if (!id) { id = (type === 'dossier' ? 'ld' : 'lf') + (++elementsLibresAgent.n); elementsLibresAgent.parChemin[chemin] = id; }
    elementsLibresAgent.parId[id] = { chemin, type };
    return id;
  }

  // Pure : l'extension en minuscules ('' sans point).
  function extensionNasLibreAgent(nom) {
    const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(nom || ''));
    return m ? m[1].toLowerCase() : '';
  }

  // Le PDF d'un fichier permis : par la route réglée (jamais /api/nas/fichier, qui ignore les exclusions).
  async function ouvrirPdfNasLibre(chemin) {
    const reponse = await fetchAvecAuth('/api/nas-libre/pdf?chemin=' + encodeURIComponent(chemin));
    if (!reponse.ok) throw new Error(`Lecture impossible (${reponse.status})`);
    return pdfjsLib.getDocument({ isEvalSupported: false, data: await reponse.arrayBuffer(), verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
  }

  async function appelNasLibreAgent(url) {
    try {
      const r = await fetchAvecAuth(url);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { erreur: j.erreur || 'le NAS n’a pas répondu' };
      return j;
    } catch (err) { return { erreur: 'serveur injoignable' }; }
  }

  async function nasLibreAgent(e) {
    const action = e && e.action;
    let sous = '';
    if ((action === 'lister' || action === 'chercher') && e.sous) {
      const el = elementsLibresAgent.parId[e.sous];
      if (!el || el.type !== 'dossier') return { erreur: 'sous : element_id d’un dossier rendu par une liste ou une recherche précédente' };
      sous = el.chemin;
    }
    if (action === 'lister') {
      const j = await appelNasLibreAgent('/api/nas-libre/lister?sous=' + encodeURIComponent(sous));
      if (j.erreur) return j;
      noterVerificationPoste('nas-libre', { detail: 'dossier listé' });
      return {
        dossier_affiche: { intitule: j.chemin || '(racine ouverte)' },
        entrees: [].concat((j.dossiers || []).map(f => ({ element_id: idElementLibreAgent(f.chemin, 'dossier'), type: 'dossier', intitule: f.nom })),
          (j.fichiers || []).map(f => ({ element_id: idElementLibreAgent(f.chemin, 'fichier'), type: 'fichier', intitule: f.nom, taille: f.taille != null ? tailleLisible(f.taille) : '', modifie: f.modifieLe ? String(f.modifieLe).slice(0, 10) : '' }))),
        ...(j.coupe ? { coupe: 'seules les 300 premières entrées sont listées : affine avec chercher' } : {})
      };
    }
    if (action === 'chercher') {
      const texte = String(e.texte || '').trim();
      if (!texte || /\[à compléter\]/.test(texte)) return { erreur: 'texte : les mots à trouver dans le nom ou le chemin' };
      const j = await appelNasLibreAgent('/api/nas-libre/chercher?texte=' + encodeURIComponent(texte) + '&sous=' + encodeURIComponent(sous));
      if (j.erreur) return j;
      noterVerificationPoste('nas-libre', { detail: 'recherche par nom' });
      return {
        nombre: (j.resultats || []).length,
        resultats: (j.resultats || []).map(f => ({ element_id: idElementLibreAgent(f.chemin, f.type), type: f.type, intitule: f.chemin,
          taille: f.taille != null ? tailleLisible(f.taille) : '', modifie: f.modifieLe ? String(f.modifieLe).slice(0, 10) : '' })),
        ...(j.incomplet ? { incomplet: 'la recherche s’est arrêtée avant d’avoir tout parcouru : précise les mots ou limite-la à un dossier (sous)' } : {})
      };
    }
    if (action === 'lire') {
      const el = elementsLibresAgent.parId[e.element_id];
      if (!el || el.type !== 'fichier') return { erreur: 'element_id d’un FICHIER rendu par lister ou chercher attendu' };
      if (extensionNasLibreAgent(el.chemin) === 'pdf') {
        let n = Object.keys(documentsAgentConnus).length;
        let id = Object.keys(documentsAgentConnus).find(k => documentsAgentConnus[k] && documentsAgentConnus[k].libre && documentsAgentConnus[k].chemin === el.chemin);
        if (!id) {
          do { id = 'doc' + (++n); } while (documentsAgentConnus[id]);
          documentsAgentConnus[id] = { sorte: 'fichier', libre: true, libelle: el.chemin.split('/').pop().replace(/\.pdf$/i, ''), le: '', chemin: el.chemin };
        }
        return { document_id: id, note: 'PDF : lis-le avec lire_document (pages 1 à 30, puis la suite)' };
      }
      const j = await appelNasLibreAgent('/api/nas-libre/texte?chemin=' + encodeURIComponent(el.chemin) + '&debut=' + encodeURIComponent(String(parseInt(e.debut, 10) || 0)));
      if (j.erreur) return j;
      noterVerificationPoste('nas-libre', { detail: 'texte lu' });
      return j;
    }
    return { erreur: 'action : lister, chercher ou lire' };
  }

  // ---- Réglages › IA et relecture d'actes : ce que l'agent peut parcourir ----

  function lignesNasLibre(zone) { return String(zone ? zone.value : '').split(/\n+/).map(x => x.trim()).filter(Boolean); }

  async function chargerNasLibre() {
    const sortie = document.getElementById('reglages-nas-libre-resultat');
    try {
      const j = await (await fetchAvecAuth('/api/nas-libre/reglages')).json();
      const inter = document.getElementById('reglages-nas-libre-actif');
      const racines = document.getElementById('reglages-nas-libre-racines');
      const exclus = document.getElementById('reglages-nas-libre-exclus');
      if (inter) inter.checked = j.actif === true;
      if (racines) racines.value = (j.racines || []).join('\n');
      if (exclus) exclus.value = (j.exclus || []).join('\n');
      if (sortie) sortie.textContent = '';
    } catch (err) { if (sortie) sortie.textContent = 'Réglages illisibles.'; }
  }

  async function enregistrerNasLibre(toutLeNas) {
    const sortie = document.getElementById('reglages-nas-libre-resultat');
    const inter = document.getElementById('reglages-nas-libre-actif');
    const racines = document.getElementById('reglages-nas-libre-racines');
    const exclus = document.getElementById('reglages-nas-libre-exclus');
    try {
      const r = await fetchAvecAuth('/api/nas-libre/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actif: !!(inter && inter.checked), racines: lignesNasLibre(racines), exclus: lignesNasLibre(exclus), toutLeNas: toutLeNas === true }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && j.toutLeNas) { demanderConfirmation('Ouvrir TOUT le NAS à « Demander à CLAIRE » ? Aucun dossier n’est choisi : l’IA pourra chercher et lire (nom des fichiers masqué légèrement, texte masqué) dans tous les dossiers, y compris ceux des clients.', () => enregistrerNasLibre(true)); return; }
      if (!r.ok) { if (sortie) sortie.textContent = j.erreur || 'Non enregistré.'; return; }
      if (racines) racines.value = (j.racines || []).join('\n');
      if (exclus) exclus.value = (j.exclus || []).join('\n');
      if (sortie) sortie.textContent = j.actif ? 'Enregistré : la lecture libre est ouverte. Vaut dès la prochaine demande.' : 'Enregistré : la lecture libre est éteinte.';
    } catch (err) { if (sortie) sortie.textContent = 'Serveur injoignable.'; }
  }
