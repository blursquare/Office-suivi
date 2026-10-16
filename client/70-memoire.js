  // ---- Mémoire de CLAIRE (étude 15/10) : DECENNALES ENTREPRISES, FAUSSES MINUTES, MODELES - OUTILS, RAPPEL DE PROCEDURES ----
  // Le serveur parcourt les quatre dossiers du NAS et lit les Word ; ce fichier fait lire les PDF PAR LE POSTE (pdf.js, OCR tesseract pour
  // une page sans texte — comme tout PDF dans CLAIRE) et envoie le texte au serveur, qui l'indexe. La recherche sert l'agent
  // « Demander à CLAIRE » (outil chercher_dans_la_memoire) : des extraits, jamais un nom de fichier.

  var MAX_PAGES_OCR_MEMOIRE = 40;          // au-delà, les pages scannées suivantes ne sont pas lues (lent : jusqu'à 30 s la page)
  var CARACTERES_MIN_PAGE_MEMOIRE = 30;
  var memoireLectureEnCours = false;
  var memoireEtat = null;
  var memoireMessage = '';

  async function chargerEtatMemoire() {
    try {
      const r = await fetchAvecAuth('/api/memoire/etat');
      if (!r.ok) throw new Error(String(r.status));
      memoireEtat = await r.json();
    } catch (e) { memoireEtat = null; memoireMessage = 'État de la mémoire illisible pour le moment.'; }
    renderReglagesMemoire();
  }

  async function parcourirMemoireNas() {
    memoireMessage = 'Parcours des dossiers du NAS…';
    renderReglagesMemoire();
    try {
      await fetchAvecAuth('/api/memoire/parcourir', { method: 'POST' });
      // Le parcours tourne sur le serveur : l'état est relu jusqu'à sa fin.
      for (let i = 0; i < 90; i++) {
        await new Promise(ok => setTimeout(ok, 2000));
        await chargerEtatMemoire();
        if (!memoireEtat || !memoireEtat.parcours.enCours) break;
      }
      memoireMessage = memoireEtat && memoireEtat.parcours.erreur ? 'Parcours en erreur : ' + memoireEtat.parcours.erreur : 'Parcours terminé.';
    } catch (e) { memoireMessage = 'Parcours impossible : serveur injoignable.'; }
    renderReglagesMemoire();
  }

  async function lirePdfMemoire(doc) {
    const r = await fetchAvecAuth('/api/memoire/document/' + doc.id + '/fichier');
    if (!r.ok) throw new Error('fichier illisible (' + r.status + ')');
    const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: await r.arrayBuffer(), verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
    const pages = [];
    let ocr = 0;
    let worker = null;
    try {
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        let texte = lignesDepuisItemsPdf((await page.getTextContent()).items).join('\n').trim();
        page.cleanup();
        if (texte.replace(/\s+/g, '').length < CARACTERES_MIN_PAGE_MEMOIRE && ocr < MAX_PAGES_OCR_MEMOIRE) {
          memoireMessage = `Lecture par OCR — ${doc.nom} (page ${p} sur ${pdf.numPages})`;
          renderReglagesMemoire();
          if (worker === null) worker = (await creerWorkerOcr()) || false;
          if (worker) { texte = String(await ocrPage(pdf, p, worker) || '').trim(); ocr++; }
        }
        // FAUSSES MINUTES (étude 15/10) : l'acte seulement, jusqu'au tableau de signature ; les annexes qui suivent ne sont jamais lues.
        if (doc.rubrique === 'fausses-minutes') {
          if (p > 1 && estDebutPageAnnexe(texte)) break;
          pages.push({ n: p, texte });
          if (detecteSignatureActe(texte)) break;
          continue;
        }
        pages.push({ n: p, texte });
      }
    } finally {
      if (worker) { try { await worker.terminate(); } catch (e) { /* déjà arrêté */ } }
      try { pdf.destroy(); } catch (e) { /* déjà libéré */ }
    }
    return { pages, ocr: ocr > 0 };
  }

  // Lit, un à un, les PDF que le serveur a inscrits « à lire ». Une seule boucle à la fois ; l'arrêt se fait en fermant la fenêtre.
  async function lirePdfMemoireTous() {
    if (memoireLectureEnCours) return;
    if (typeof pdfjsLib === 'undefined') { memoireMessage = 'Lecteur PDF du poste non chargé (bibliothèque en ligne injoignable).'; renderReglagesMemoire(); return; }
    memoireLectureEnCours = true;
    let lus = 0; let echecs = 0;
    try {
      for (;;) {
        const liste = await (await fetchAvecAuth('/api/memoire/a-lire?limite=5')).json();
        const docs = (liste && liste.documents) || [];
        if (!docs.length) break;
        for (const doc of docs) {
          memoireMessage = `Lecture de ${doc.nom}… (${lus} lu${lus > 1 ? 's' : ''})`;
          renderReglagesMemoire();
          try {
            const { pages, ocr } = await lirePdfMemoire(doc);
            const r = await fetchAvecAuth('/api/memoire/document/' + doc.id + '/texte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pages, ocr }) });
            if (!r.ok) throw new Error('enregistrement refusé (' + r.status + ')');
            lus++;
            noterVerificationPoste('memoire-lecture-pdf', { detail: ocr ? 'avec OCR' : 'texte du PDF' });
          } catch (e) {
            echecs++;
            noterVerificationPoste('memoire-lecture-pdf', { ok: false, message: 'PDF illisible' });
            await fetchAvecAuth('/api/memoire/document/' + doc.id + '/erreur', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: String(e && e.message || e).slice(0, 120) }) }).catch(() => {});
          }
        }
        await chargerEtatMemoire();
      }
      memoireMessage = lus || echecs ? `${lus} PDF lu${lus > 1 ? 's' : ''}${echecs ? `, ${echecs} illisible${echecs > 1 ? 's' : ''}` : ''}.` : 'Aucun PDF à lire.';
    } catch (e) { memoireMessage = 'Lecture interrompue : serveur injoignable.'; }
    memoireLectureEnCours = false;
    await chargerEtatMemoire();
  }

  async function basculerFausseMinutesMemoire(actif) {
    memoireMessage = actif ? 'Lecture des fausses minutes activée : « Parcourir les dossiers » puis « Lire les PDF ».' : 'Lecture des fausses minutes éteinte (le texte déjà lu est gardé mais n’est plus cherché).';
    try {
      const r = await fetchAvecAuth('/api/memoire/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fausseMinutes: actif === true }) });
      if (!r.ok) throw new Error(String(r.status));
    } catch (e) { memoireMessage = 'Réglage non enregistré : serveur injoignable.'; }
    await chargerEtatMemoire();
  }

  async function reessayerMemoire() {
    try { await fetchAvecAuth('/api/memoire/reessayer', { method: 'POST' }); } catch (e) { /* relu ci-dessous */ }
    await chargerEtatMemoire();
  }

  function renderReglagesMemoire() {
    const zone = document.getElementById('memoire-corps');
    if (!zone) return;
    const e = memoireEtat;
    const fmActif = !!(e && e.reglages && e.reglages.fausseMinutes);
    const lignes = e ? e.rubriques.map(r => {
      const etat = r.interne ? `<span class="hint">${r.lus ? 'à jour à chaque version de CLAIRE' : 'lu au prochain parcours'} · règles de CLAIRE et historique des décisions</span>` : r.cle === 'fausses-minutes' && !fmActif ? '<span class="hint">lecture éteinte (option ci-dessous)</span>' : !r.trouve ? '<span class="hint">dossier introuvable sur le NAS</span>'
        : `${r.lus} lu${r.lus > 1 ? 's' : ''} sur ${r.fichiers}${r.aLire ? ` · <strong>${r.aLire} à lire</strong>` : ''}${r.ocr ? ` · ${r.ocr} par OCR` : ''}${r.vides ? ` · ${r.vides} sans texte` : ''}${r.erreurs ? ` · ${r.erreurs} en erreur` : ''}${r.tropGros ? ` · ${r.tropGros} trop gros` : ''}`;
      return `<div class="reglages-option"><div><strong>${escapeHtml(r.nom)}</strong><div class="hint">${etat}</div></div></div>`;
    }).join('') : '';
    const parcours = e && e.parcours.enCours ? '<p class="hint">Parcours en cours…</p>' : '';
    const resume = e ? `<p class="hint">${e.passages} passage${e.passages > 1 ? 's' : ''} en mémoire.</p>` : '';
    const aLire = e ? e.rubriques.filter(r => r.cle !== 'fausses-minutes' || fmActif).reduce((s, r) => s + r.aLire, 0) : 0;
    const optionFm = e ? `<div class="reglages-option"><div><strong>Lire les fausses minutes</strong>${infoBulle('Option. Quand elle est allumée, les PDF du dossier FAUSSES MINUTES sont lus par le poste, uniquement jusqu’au tableau de signature de l’acte : les annexes qui suivent ne sont pas lues.')}</div>
        <wa-switch id="memoire-fausses-minutes" ${fmActif ? 'checked ' : ''}onchange="basculerFausseMinutesMemoire(this.checked)"></wa-switch></div>` : '';
    zone.innerHTML = `${optionFm}${lignes}${resume}${parcours}
      <div class="reglages-actions">
        <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="parcourirMemoireNas()">Parcourir les dossiers</wa-button>
        <wa-button ${aLire && !memoireLectureEnCours ? '' : 'disabled '}variant="brand" size="s" pill type="button" class="action-rapide" onclick="lirePdfMemoireTous()">Lire les PDF${aLire ? ` (${aLire})` : ''}</wa-button>
        <wa-button appearance="plain" size="s" pill type="button" class="action-rapide" onclick="reessayerMemoire()">Réessayer les échecs</wa-button>
      </div>
      <p class="hint" id="memoire-message">${escapeHtml(memoireMessage)}</p>`;
  }

  function ouvrirReglagesMemoire() { renderReglagesMemoire(); chargerEtatMemoire(); }

  // Outil de l'agent : des passages (rubrique, page, extrait). Aucun nom de fichier ne part ; le serveur masque le résultat avant l'IA.
  async function chercherDansLaMemoireAgent(e) {
    const recherche = typeof e.recherche === 'string' ? e.recherche.trim() : '';
    if (!recherche) return { erreur: 'recherche vide' };
    const rubrique = ['decennales', 'fausses-minutes', 'modeles-outils', 'rappel-procedures', 'regles-etude'].includes(e.rubrique) ? e.rubrique : '';
    let r;
    try { r = await fetchAvecAuth('/api/memoire/chercher?q=' + encodeURIComponent(recherche) + (rubrique ? '&rubrique=' + rubrique : '') + '&limite=8'); }
    catch (err) { return { erreur: 'mémoire injoignable depuis le poste' }; }
    if (!r.ok) return { erreur: 'recherche impossible (' + r.status + ')' };
    const json = await r.json();
    const passages = (json.passages || []).map(p => ({ rubrique: p.libelle, page: p.page || undefined, section: p.section || undefined, extrait: p.extrait }));
    return passages.length ? { nombre: passages.length, passages }
      : { nombre: 0, passages: [], remarque: 'Rien de correspondant dans la mémoire (documents pas encore tous lus, ou autres mots à essayer).' };
  }
