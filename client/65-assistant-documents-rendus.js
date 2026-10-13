  // ---- « Demander à CLAIRE » : lire les documents du dossier et produire des rendus (étude 13/10) ----
  // « Comment lui permettre d'utiliser tout son potentiel ? Pas que lire CLAIRE mais pouvoir lire les documents, les analyser et lui
  // faire sortir des rendus, doc… comme ici ? » Choix de l'étude : texte MASQUÉ (jamais un PDF en clair), tout le dossier du NAS
  // lisible, rendus rangés sur le NAS.
  //   - documents_du_dossier : tous les PDF du dossier client (GET /api/nas/fichiers?recents=300) — le NOM du fichier ne part jamais
  //     (règle du 12/10, il peut porter un tiers en minuscules) : la pièce reconnue d'après ce nom, le sous-dossier et la date.
  //   - lire_document : le texte du PDF lu ICI (pdf.js, lignes reconstruites ; OCR tesseract pour une page sans texte), 30 pages au
  //     plus par appel ; le serveur le masque (noms, adresses, emails, téléphones → codes) avant l'IA, comme tout résultat d'outil.
  //   - rediger_document : l'IA écrit le contenu (codes rétablis par le serveur) ; le .docx est fabriqué ici (docx 9.7.1, comme
  //     l'annexe des quotités) et s'affiche avec « Télécharger » et « Ranger dans le dossier » — rien n'est écrit sur le NAS sans ce
  //     clic (POST /api/nas/deposer-document : racine du dossier client, copie sans jamais écraser).

  var MAX_FICHIERS_DOSSIER_AGENT = 300;
  var MAX_PAGES_LECTURE_AGENT = 30;
  var MAX_CARACTERES_LECTURE_AGENT = 45000;   // le serveur coupe un résultat à 60 000 caractères (JSON compris)
  var CARACTERES_MIN_PAGE_TEXTE = 30;         // en dessous, la page est un scan : OCR
  // Documents produits dans cette fenêtre : id → { blob, nom, titre, dossierId, range }.
  var rendusAgent = {};

  async function documentsDuDossierAgent(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return { erreur: 'aucun dossier avec cet id' };
    if (!d.nasDossier) return { erreur: 'dossier non relié au NAS : aucun document à lister' };
    let fichiers;
    try {
      const r = await fetchAvecAuth('/api/nas/fichiers?recents=' + MAX_FICHIERS_DOSSIER_AGENT + '&dossier=' + encodeURIComponent(d.nasDossier));
      if (!r.ok) return { erreur: 'dossier du NAS illisible pour le moment' };
      fichiers = (await r.json()).fichiers || [];
    } catch (e) { return { erreur: 'NAS injoignable depuis le serveur' }; }
    let n = Object.keys(documentsAgentConnus).length;
    const documents = fichiers.map(f => {
      const id = 'doc' + (++n);
      const nom = String(f.nom || '').replace(/\.pdf$/i, '');
      documentsAgentConnus[id] = { sorte: 'fichier', libelle: nom, dossier: d, le: f.modifieLe || '', chemin: cheminNasComplet(d, f.chemin) };
      return { document_id: id, document: pieceFichierNasAssistant(d, nom), sous_dossier: sousDossierFichierAssistant(d, cheminNasComplet(d, f.chemin)), modifie_le: String(f.modifieLe || '').slice(0, 10) };
    });
    return { nombre: documents.length, ...(documents.length >= MAX_FICHIERS_DOSSIER_AGENT ? { coupe: `seuls les ${MAX_FICHIERS_DOSSIER_AGENT} plus récents sont listés` } : {}), documents };
  }

  // Pure : les pages à lire — { debut, fin } dans [1, total], 30 pages au plus ; `fin` 0 ou absent = 30 pages après le début.
  function pagesLectureAgent(total, debut, fin) {
    const t = Math.max(0, parseInt(total, 10) || 0);
    if (!t) return { debut: 0, fin: -1 };
    const d = Math.min(t, Math.max(1, parseInt(debut, 10) || 1));
    const f = parseInt(fin, 10) || 0;
    return { debut: d, fin: Math.min(t, d + MAX_PAGES_LECTURE_AGENT - 1, f >= d ? f : t) };
  }

  async function lireDocumentAgent(documentId, debut, fin) {
    const doc = documentsAgentConnus[documentId];
    if (!doc) return { erreur: 'document inconnu : prends un document_id rendu par documents_du_dossier ou documents_recents' };
    if (doc.sorte === 'scan') return { erreur: 'scan pas encore rangé : il se lit dans Claire Scan, pas ici' };
    if (!doc.chemin) return { erreur: 'fichier pas encore localisé sur le NAS' };
    if (typeof pdfjsLib === 'undefined') return { erreur: 'lecteur PDF du poste non chargé (bibliothèque en ligne injoignable)' };
    let pdf;
    try { pdf = await ouvrirPdfNas(doc.chemin); } catch (e) {
      noterVerificationPoste('agent-lecture-document', { ok: false, message: 'PDF illisible' });
      return { erreur: 'PDF illisible : ' + String(e && e.message || e).slice(0, 120) };
    }
    const plage = pagesLectureAgent(pdf.numPages, debut, fin);
    const pages = [];
    let total = 0;
    let worker = null;
    let ocr = 0;
    let suite = '';
    try {
      for (let p = plage.debut; p <= plage.fin; p++) {
        const page = await pdf.getPage(p);
        let texte = lignesDepuisItemsPdf((await page.getTextContent()).items).join('\n').trim();
        let parOcr = false;
        if (texte.replace(/\s+/g, '').length < CARACTERES_MIN_PAGE_TEXTE) {
          if (worker === null) worker = (await creerWorkerOcr()) || false;
          if (worker) { texte = String(await ocrPage(pdf, p, worker) || '').trim(); parOcr = true; ocr++; }
        }
        if (total + texte.length > MAX_CARACTERES_LECTURE_AGENT && pages.length) { suite = `texte long : relis à partir de la page ${p}`; break; }
        total += texte.length;
        pages.push({ page: p, ...(parOcr ? { lue_par_ocr: true } : {}), texte: texte || '(page sans texte lisible)' });
      }
    } finally {
      if (worker) { try { await worker.terminate(); } catch (e) { /* déjà arrêté */ } }
    }
    noterVerificationPoste('agent-lecture-document', { detail: ocr ? 'avec OCR' : 'texte du PDF' });
    return { pages_total: pdf.numPages,
      pages_lues: pages.length ? `${pages[0].page}-${pages[pages.length - 1].page}` : '', ...(suite ? { suite } : {}),
      ...(!suite && pages.length && pages[pages.length - 1].page < pdf.numPages ? { suite: `pages ${pages[pages.length - 1].page + 1} à ${pdf.numPages} non lues` } : {}), pages };
  }

  // ---- Rendus ----

  // Pure : un texte en morceaux { texte, gras } d'après **gras**.
  function morceauxGrasAgent(ligne) {
    const morceaux = [];
    String(ligne || '').split(/(\*\*[^*]+\*\*)/).forEach(m => {
      if (!m) return;
      const g = /^\*\*([^*]+)\*\*$/.exec(m);
      morceaux.push(g ? { texte: g[1], gras: true } : { texte: m, gras: false });
    });
    return morceaux;
  }

  // Pure : le contenu écrit par l'IA en blocs — titre1, titre2, para, puce, numero, tableau ({ lignes: [[cellules]] }).
  function blocsDocumentAgent(contenu) {
    const blocs = [];
    let para = [];
    let tableau = null;
    const finPara = () => { if (para.length) { blocs.push({ type: 'para', texte: para.join(' ') }); para = []; } };
    const finTableau = () => { if (tableau) { if (tableau.lignes.length) blocs.push(tableau); tableau = null; } };
    String(contenu || '').replace(/\r/g, '').split('\n').forEach(brute => {
      const l = brute.trim();
      if (/^\|.*\|$/.test(l)) {
        finPara();
        const cellules = l.slice(1, -1).split('|').map(c => c.trim());
        if (cellules.every(c => /^:?-{2,}:?$/.test(c))) return;   // ligne de séparation « |---|---| »
        (tableau = tableau || { type: 'tableau', lignes: [] }).lignes.push(cellules);
        return;
      }
      finTableau();
      let m;
      if (!l) { finPara(); return; }
      if ((m = /^#{3,}\s+(.*)$/.exec(l)) || (m = /^##\s+(.*)$/.exec(l))) { finPara(); blocs.push({ type: 'titre2', texte: m[1] }); return; }
      if ((m = /^#\s+(.*)$/.exec(l))) { finPara(); blocs.push({ type: 'titre1', texte: m[1] }); return; }
      if ((m = /^[-•*]\s+(.*)$/.exec(l))) { finPara(); blocs.push({ type: 'puce', texte: m[1] }); return; }
      if ((m = /^(\d+)[.)]\s+(.*)$/.exec(l))) { finPara(); blocs.push({ type: 'numero', numero: m[1], texte: m[2] }); return; }
      para.push(l);
    });
    finPara();
    finTableau();
    return blocs;
  }

  // Pure : un nom de fichier sûr d'après le titre (« Synthèse du compromis » → « Synthèse du compromis »).
  function nomFichierRenduAgent(titre) {
    const n = String(titre || '').normalize('NFC').replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '').slice(0, 100).trim();
    return n || 'Document CLAIRE';
  }

  async function docxRenduAgent(titre, contenu) {
    if (!window.docx) await afChargerScript('https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.min.js');
    const D = window.docx;
    const POLICE = 'Times New Roman';
    const TAILLE = 22;
    const runs = (texte, o) => morceauxGrasAgent(texte).map(m => new D.TextRun(Object.assign({ text: m.texte, bold: m.gras, font: POLICE, size: TAILLE }, o || {})));
    const P = (o) => new D.Paragraph(Object.assign({ spacing: { after: 120, line: 259, lineRule: 'auto' } }, o));
    const bord = { style: 'single', size: 4, color: '999999' };
    const enfants = [P({ alignment: D.AlignmentType.CENTER, spacing: { after: 240 }, children: runs(titre, { bold: true, size: 28 }) })];
    blocsDocumentAgent(contenu).forEach(b => {
      if (b.type === 'titre1') enfants.push(P({ spacing: { before: 240, after: 120 }, children: runs(b.texte, { bold: true, size: 26 }) }));
      else if (b.type === 'titre2') enfants.push(P({ spacing: { before: 180, after: 100 }, children: runs(b.texte, { bold: true, size: 24 }) }));
      else if (b.type === 'puce') enfants.push(P({ indent: { left: 360, hanging: 240 }, spacing: { after: 60 }, children: [new D.TextRun({ text: '•\t', font: POLICE, size: TAILLE }), ...runs(b.texte)] }));
      else if (b.type === 'numero') enfants.push(P({ indent: { left: 360, hanging: 300 }, spacing: { after: 60 }, children: [new D.TextRun({ text: b.numero + '.\t', font: POLICE, size: TAILLE }), ...runs(b.texte)] }));
      else if (b.type === 'tableau') {
        const largeur = Math.max(...b.lignes.map(l => l.length));
        enfants.push(new D.Table({
          width: { size: 100, type: D.WidthType.PERCENTAGE },
          borders: { top: bord, bottom: bord, left: bord, right: bord, insideHorizontal: bord, insideVertical: bord },
          rows: b.lignes.map((l, i) => new D.TableRow({ tableHeader: i === 0, children: Array.from({ length: largeur }, (_, k) => new D.TableCell({
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
            children: [P({ spacing: { after: 0 }, children: runs(l[k] || '', i === 0 ? { bold: true } : undefined) })] })) }))
        }));
        enfants.push(P({ spacing: { after: 120 }, children: [] }));
      } else enfants.push(P({ alignment: D.AlignmentType.JUSTIFIED, children: runs(b.texte) }));
    });
    const docu = new D.Document({ creator: 'CLAIRE', title: titre, sections: [{ properties: {}, children: enfants }] });
    return D.Packer.toBlob(docu);
  }

  function telechargerRenduAgent(id) {
    const r = rendusAgent[id];
    if (!r) return;
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(r.blob);
    lien.download = r.nom + '.docx';
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
  }

  function base64DepuisBlob(blob) {
    return new Promise((resolve, reject) => {
      const lecteur = new FileReader();
      lecteur.onload = () => resolve(String(lecteur.result || '').replace(/^data:[^,]*,/, ''));
      lecteur.onerror = () => reject(lecteur.error || new Error('lecture impossible'));
      lecteur.readAsDataURL(blob);
    });
  }

  async function rangerRenduAgent(id) {
    const r = rendusAgent[id];
    const d = r && dossiers.find(x => x.id === r.dossierId);
    if (!r || !d || !d.nasDossier) { afficherToast('Ce dossier n’est pas relié au NAS.', 'OK', null); return; }
    if (r.range) { afficherToast(`Déjà rangé : ${r.range}`, 'OK', null); return; }
    if (r.enCours) return;
    r.enCours = true;
    try {
      const reponse = await fetchAvecAuth('/api/nas/deposer-document', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossierNas: d.nasDossier, nom: r.nom, contenu: await base64DepuisBlob(r.blob) }) });
      const json = await reponse.json().catch(() => ({}));
      if (!reponse.ok) throw new Error(json.erreur || `le serveur a répondu ${reponse.status}`);
      r.range = String(json.chemin || '').split(/[\\/]/).pop() || r.nom + '.docx';
      ajouterHistorique(d, `Document « ${r.titre} » rangé dans le dossier du NAS (Demander à CLAIRE)`);
      sauvegarder(d);
      noterVerificationPoste('agent-document-nas', { detail: 'rangé à la racine du dossier' });
      afficherToast(`Rangé dans le dossier du NAS : ${r.range}`, 'OK', null);
    } catch (e) {
      noterVerificationPoste('agent-document-nas', { ok: false, message: 'rangement refusé' });
      afficherToast('Document non rangé : ' + (e && e.message ? e.message : 'erreur'), 'OK', null);
    } finally { r.enCours = false; }
  }

  async function redigerDocumentAgent(entree) {
    const e = entree || {};
    const titre = String(e.titre || '').trim().slice(0, 140) || 'Document';
    const contenu = String(e.contenu || '');
    if (!contenu.trim()) return { erreur: 'contenu vide' };
    const d = e.dossier_id ? dossiers.find(x => x.id === e.dossier_id) : null;
    if (e.dossier_id && !d) return { erreur: 'dossier introuvable : cherche-le d’abord (chercher_dossiers)' };
    let blob;
    try { blob = await docxRenduAgent(titre, contenu); } catch (err) { return { erreur: 'document Word impossible à fabriquer sur ce poste (bibliothèque en ligne injoignable ?)' }; }
    const id = 'rendu' + (Object.keys(rendusAgent).length + 1) + '-' + Date.now().toString(36);
    rendusAgent[id] = { blob, nom: nomFichierRenduAgent(titre), titre, dossierId: d ? d.id : '', range: '' };
    const boutons = [{ libelle: 'Télécharger (Word)', action: () => telechargerRenduAgent(id) }];
    if (d && d.nasDossier) boutons.push({ libelle: 'Ranger dans le dossier du NAS', action: () => rangerRenduAgent(id) });
    poserMessageAssistant('claire', `<p>Document prêt : <b>${escapeHtml(titre)}</b>${d ? ` — ${escapeHtml(libelleDossierAffiche(d))}` : ''}.</p>`, boutons);
    return { fait: true, affiche_a_l_utilisateur: `document « ${titre} » prêt, avec « Télécharger »${d && d.nasDossier ? ' et « Ranger dans le dossier du NAS »' : ''}` };
  }
