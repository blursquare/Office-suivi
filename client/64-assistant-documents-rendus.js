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
  //     clic (POST /api/nas/deposer-document : racine du dossier relié à la fiche, lu par le serveur ; copie sans jamais écraser).

  var MAX_FICHIERS_DOSSIER_AGENT = 300;
  var MAX_PAGES_LECTURE_AGENT = 30;
  var MAX_CARACTERES_LECTURE_AGENT = 45000;   // le serveur coupe un résultat à 60 000 caractères (JSON compris)
  var CARACTERES_MIN_PAGE_TEXTE = 30;         // en dessous, la page est un scan : OCR
// Pages passées à l'OCR par appel : jusqu'à 30 s chacune (relecture 13/10 : 30 pages de scan = un quart d'heure sans réponse).
var MAX_PAGES_OCR_AGENT = 6;
var MAX_RENDUS_AGENT = 12;                  // documents produits gardés dans la fenêtre (les plus anciens sont oubliés)
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
    // Un fichier déjà listé garde son identifiant (relecture 0.282.0 : « Pièces du NAS » en recréait à chaque clic).
    const parChemin = new Map(Object.entries(documentsAgentConnus).filter(([, x]) => x && x.chemin).map(([cle, x]) => [x.chemin, cle]));
    const documents = fichiers.map(f => {
      let id = parChemin.get(cheminNasComplet(d, f.chemin));
      if (!id) { do { id = 'doc' + (++n); } while (documentsAgentConnus[id]); }
      const nom = String(f.nom || '').replace(/\.pdf$/i, '');
      documentsAgentConnus[id] = { sorte: 'fichier', libelle: nom, dossier: d, le: f.modifieLe || '', chemin: cheminNasComplet(d, f.chemin) };
      return { document_id: id, nom_fichier: nom.slice(0, 160), document: pieceFichierNasAssistant(d, nom), sous_dossier: sousDossierFichierAssistant(d, cheminNasComplet(d, f.chemin)), modifie_le: String(f.modifieLe || '').slice(0, 10) };
    });
    return { nombre: documents.length, ...(documents.length >= MAX_FICHIERS_DOSSIER_AGENT ? { coupe: `seuls les ${MAX_FICHIERS_DOSSIER_AGENT} plus récents sont listés` } : {}), documents };
  }

  // Les documents que l'agent veut joindre à un email (document_id de documents_du_dossier, pièces jointes au message) : le fichier lu
  // ICI, sous son vrai nom (jamais envoyé à l'IA) ; un identifiant inconnu ou un fichier illisible est compté dans `manquants`.
  async function piecesJointesEmailAgent(ids) {
    const pieces = [];
    let manquants = 0;
    for (const id of (ids || []).slice(0, 10)) {
      const doc = documentsAgentConnus[id];
      try {
        let blob = null, nom = '';
        if (doc && doc.sorte === 'joint' && doc.fichier) { blob = doc.fichier; nom = doc.fichier.name || 'document.pdf'; }
        // Tout document du dossier qui a un chemin (documents_du_dossier, documents_recents : pièce, scan rangé) ; jamais un scan pas encore
        // rangé ni un fichier de la lecture libre du NAS.
        else if (doc && doc.chemin && doc.sorte !== 'scan' && doc.sorte !== 'joint' && !doc.libre) {
          const r = await fetchAvecAuth('/api/nas/fichier?chemin=' + encodeURIComponent(doc.chemin));
          if (r.ok) { blob = await r.blob(); nom = String(doc.chemin).split(/[\\/]/).pop() || 'document.pdf'; }
        }
        if (!blob) { manquants++; continue; }
        pieces.push({ nom, type: blob.type || 'application/pdf', contenuBase64: await base64DepuisBlob(blob) });
      } catch (e) { manquants++; }
    }
    return { pieces, manquants };
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
    // Pièce jointe au message (client/66) : le fichier est dans la fenêtre, jamais sur le NAS.
    if (doc.sorte === 'joint' && doc.sortePiece === 'image') return lireImageJointeAgent(doc.fichier);
    if (doc.sorte !== 'joint' && !doc.chemin) return { erreur: 'fichier pas encore localisé sur le NAS' };
    if (typeof pdfjsLib === 'undefined') return { erreur: 'lecteur PDF du poste non chargé (bibliothèque en ligne injoignable)' };
    let pdf;
    try {
      pdf = doc.sorte === 'joint'
        ? await pdfjsLib.getDocument({ isEvalSupported: false, data: await doc.fichier.arrayBuffer(), verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise
        : doc.libre ? await ouvrirPdfNasLibre(doc.chemin) : await ouvrirPdfNas(doc.chemin);
    } catch (e) {
      noterVerificationPoste('agent-lecture-document', { ok: false, message: 'PDF illisible' });
      return { erreur: 'PDF illisible : ' + String(e && e.message || e).slice(0, 120) };
    }
    const plage = pagesLectureAgent(pdf.numPages, debut, fin);
    const horsDocument = (parseInt(debut, 10) || 1) > pdf.numPages;
    const pages = [];
    let total = 0;
    let worker = null;
    let ocr = 0;
    let suite = '';
    try {
      for (let p = plage.debut; p <= plage.fin; p++) {
        assistantEtapeAgent = `Je lis le document… page ${p} sur ${pdf.numPages}`;
        renderAssistant();
        const page = await pdf.getPage(p);
        let texte = lignesDepuisItemsPdf((await page.getTextContent()).items).join('\n').trim();
        page.cleanup();
        let parOcr = false;
        if (texte.replace(/\s+/g, '').length < CARACTERES_MIN_PAGE_TEXTE) {
          if (ocr >= MAX_PAGES_OCR_AGENT && pages.length) { suite = `pages scannées, lues par reconnaissance de caractères (lent) : relis à partir de la page ${p}`; break; }
          assistantEtapeAgent = `Je lis le document… page ${p} sur ${pdf.numPages} (scan, lecture plus lente)`;
          renderAssistant();
          if (worker === null) worker = (await creerWorkerOcr()) || false;
          if (worker) { texte = String(await ocrPage(pdf, p, worker) || '').trim(); parOcr = true; ocr++; }
        }
        if (total + texte.length > MAX_CARACTERES_LECTURE_AGENT && pages.length) { suite = `texte long : relis à partir de la page ${p}`; break; }
        total += texte.length;
        pages.push({ page: p, ...(parOcr ? { lue_par_ocr: true } : {}), texte: texte || '(page sans texte lisible)' });
      }
    } finally {
      if (worker) { try { await worker.terminate(); } catch (e) { /* déjà arrêté */ } }
      // Le PDF n'est gardé ni par pdf.js ni par la fenêtre (l'agent peut en lire plusieurs dizaines dans une conversation).
      try { pdf.destroy(); } catch (e) { /* déjà libéré */ }
    }
    noterVerificationPoste('agent-lecture-document', { detail: ocr ? 'avec OCR' : 'texte du PDF' });
    if (pages.length) noterDocumentLuAssistant(documentId, `${pages[0].page}-${pages[pages.length - 1].page}`);
    return { pages_total: pdf.numPages, ...(horsDocument ? { attention: `le document n’a que ${pdf.numPages} page(s)` } : {}),
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
  // `garderLignes` (courrier) : les lignes d'un paragraphe restent des lignes (bloc d'adresse, signature).
  function blocsDocumentAgent(contenu, garderLignes) {
    const blocs = [];
    let para = [];
    let tableau = null;
    const finPara = () => { if (para.length) { blocs.push({ type: 'para', texte: para.join(garderLignes ? '\n' : ' ') }); para = []; } };
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
      if (/^<<saut de page>>$/i.test(l)) { finPara(); blocs.push({ type: 'saut' }); return; }
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

  // Pure : un texte pour du XML Word.
  function xmlTexteWord(t) {
    return String(t || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Pure : les « runs » Word d'une ligne (gras d'après **…**, retours à la ligne gardés).
  function xmlRunsCourrierAgent(texte, gras) {
    return String(texte || '').split('\n').map((ligne, i) => (i ? '<w:r><w:br/></w:r>' : '') + morceauxGrasAgent(ligne).map(m =>
      `<w:r>${m.gras || gras ? '<w:rPr><w:b/><w:bCs/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlTexteWord(m.texte)}</w:t></w:r>`).join('')).join('');
  }

  // Pure : le corps d'un courrier en XML Word, aux réglages du modèle de l'appel de fonds (paragraphes justifiés, 10 pt après ;
  // tableau à filets). Le style Normal du modèle donne la police et la taille de l'étude.
  // Comme le modèle (relecture du rendu, 13/10) : le bloc d'adresse en tête, aligné à gauche, suivi de cinq retours (il remplit la
  // fenêtre d'enveloppe dessinée par l'en-tête) ; « Blois, le … » espacé avant et après ; un paragraphe à plusieurs lignes à gauche.
  var RE_LIEU_DATE_COURRIER = /^[A-ZÀ-Ü][A-Za-zÀ-ÿ' -]{1,40}, le \S/;
  function xmlCorpsCourrierAgent(blocs, signatureXml) {
    const para = (contenu, ppr) => `<w:p><w:pPr>${ppr || '<w:spacing w:after="200"/><w:jc w:val="both"/>'}</w:pPr>${contenu}</w:p>`;
    const morceaux = ['<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>'];
    (blocs || []).forEach((b, i) => {
      if (b.type === 'para' && i === 0 && /\n/.test(b.texte)) { morceaux.push(para(xmlRunsCourrierAgent(b.texte) + '<w:r>' + '<w:br/>'.repeat(5) + '</w:r>', '<w:spacing w:before="200" w:after="80"/>')); return; }
      if (b.type === 'para' && RE_LIEU_DATE_COURRIER.test(b.texte) && b.texte.length < 80) { morceaux.push(para(xmlRunsCourrierAgent(b.texte) + '<w:r><w:br/><w:br/></w:r>', '<w:spacing w:before="300" w:after="300"/>')); return; }
      // La signature « Me … » à droite, gardée avec la ligne d'avant, comme « Me {notaire} » du modèle.
      // (suivie du tampon et de la signature quand le courrier est pré-signé ; « Me … » peut précéder une page de questionnaire)
      if (b.type === 'para' && /^Me\s/.test(b.texte) && (i === blocs.length - 1 || (blocs[i + 1] && blocs[i + 1].type === 'saut'))) {
        morceaux.push(para(xmlRunsCourrierAgent(b.texte), '<w:keepNext/><w:spacing w:before="400"/><w:jc w:val="right"/>'));
        if (signatureXml) morceaux.push(signatureXml);
        return;
      }
      if (b.type === 'para' && /\n/.test(b.texte)) { morceaux.push(para(xmlRunsCourrierAgent(b.texte), '<w:spacing w:after="200"/>')); return; }
      // Le dernier point d'une liste garde l'espace d'un paragraphe avant le texte qui suit.
      const finListe = (b.type === 'puce' || b.type === 'numero') && !(blocs[i + 1] && blocs[i + 1].type === b.type) ? '200' : '60';
      if (b.type === 'saut') { morceaux.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); return; }
      if (b.type === 'titre1' || b.type === 'titre2') morceaux.push(para(xmlRunsCourrierAgent(b.texte, true), '<w:keepNext/><w:spacing w:before="200" w:after="120"/>'));
      else if (b.type === 'puce') morceaux.push(para(xmlRunsCourrierAgent('- ' + b.texte), `<w:spacing w:after="${finListe}"/><w:ind w:left="284"/><w:jc w:val="both"/>`));
      else if (b.type === 'numero') morceaux.push(para(xmlRunsCourrierAgent(b.numero + '. ' + b.texte), `<w:spacing w:after="${finListe}"/><w:ind w:left="284"/><w:jc w:val="both"/>`));
      else if (b.type === 'tableau') {
        const largeur = Math.max(...b.lignes.map(l => l.length));
        const pct = Math.floor(5000 / largeur);
        const bord = (n) => `<w:${n} w:val="single" w:color="auto" w:sz="4"/>`;
        morceaux.push(`<w:tbl><w:tblPr><w:tblW w:type="pct" w:w="5000"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(bord).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${'<w:gridCol/>'.repeat(largeur)}</w:tblGrid>`
          + b.lignes.map((l, i) => `<w:tr>${Array.from({ length: largeur }, (_, k) => `<w:tc><w:tcPr><w:tcW w:type="pct" w:w="${pct}"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${xmlRunsCourrierAgent(l[k] || '', i === 0)}</w:p></w:tc>`).join('')}</w:tr>`).join('')
          + '</w:tbl>');
        morceaux.push('<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>');
      } else morceaux.push(para(xmlRunsCourrierAgent(b.texte)));
    });
    return morceaux.join('');
  }

  // Pure : le document.xml du modèle avec un autre corps — en-têtes, pieds de page, marges et colonne de gauche de l'office gardés
  // (la dernière section du modèle, qui les désigne).
  function documentXmlCourrierAgent(modeleXml, corps) {
    const x = String(modeleXml || '');
    const debut = x.indexOf('<w:body>');
    const sect = x.lastIndexOf('<w:sectPr');
    const fin = x.lastIndexOf('</w:body>');
    if (debut < 0 || sect < debut || fin < sect) return '';
    return x.slice(0, debut) + '<w:body>' + corps + x.slice(sect, fin) + '</w:body></w:document>';
  }

  // Pure : le paragraphe du modèle qui porte le tampon et la signature (images ancrées, rId25 et rId26), pour pré-signer un courrier
  // (étude 15/10) ; '' si le modèle n'en a pas.
  function paragrapheSignatureModele(modeleXml) {
    const x = String(modeleXml || '');
    const i = x.indexOf('r:embed="rId25"');
    if (i < 0) return '';
    const debut = Math.max(x.lastIndexOf('<w:p>', i), x.lastIndexOf('<w:p ', i));
    const fin = x.indexOf('</w:p>', i);
    return debut >= 0 && fin > i ? x.slice(debut, fin + 6) : '';
  }

  // Courrier sur le papier à en-tête de l'office (étude 13/10 : « pour les courriers reprendre de base l'entête de l'office des
  // appels de fonds ») : le modèle Word de l'appel de fonds, corps remplacé.
  // `options.signe` : tampon de l'office et signature « p/o » sous le dernier paragraphe (comme l'appel de fonds) — « Constitution de dossier ».
  async function courrierRenduAgent(contenu, d, options) {
    await chargerModeleAppelFonds();
    const zip = new window.PizZip(afBase64VersOctets(window.APPEL_FONDS_MODELE.docxB64));
    // « Nos Réf : {ref} » de l'en-tête : la référence du dossier, comme l'appel de fonds (son nom), sinon rien.
    Object.keys(zip.files).filter(n => /^word\/(header|footer)\d*\.xml$/.test(n)).forEach(n => {
      const x = zip.file(n).asText();
      if (x.includes('{ref}')) zip.file(n, x.split('{ref}').join(xmlTexteWord(d ? d.nom : '')));
    });
    const modeleXml = zip.file('word/document.xml').asText();
    const xml = documentXmlCourrierAgent(modeleXml, xmlCorpsCourrierAgent(blocsDocumentAgent(contenu, true), options && options.signe ? paragrapheSignatureModele(modeleXml) : ''));
    if (!xml) throw new Error('modèle de l’office illisible');
    zip.file('word/document.xml', xml);
    return zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  async function docxRenduAgent(titre, contenu) {
    if (!window.docx) await afChargerScript('https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.min.js', 'sha384-7jc2SRdX+/eR9d3sDweapT3TGmIIUe3h4tlWVV1urVpUBlnPN5OsU6dM+zh9XwBz');
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
    if (!r) { afficherToast('Ce document n’est plus gardé par la fenêtre : redemandez-le à CLAIRE.', 'OK', null); return; }
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
    if (!r) { afficherToast('Ce document n’est plus gardé par la fenêtre : redemandez-le à CLAIRE.', 'OK', null); return; }
    if (!d || !d.nasDossier) { afficherToast('Ce dossier n’est pas relié au NAS.', 'OK', null); return; }
    if (r.range) { afficherToast(`Déjà rangé : ${r.range}`, 'OK', null); return; }
    if (r.enCours) return;
    r.enCours = true;
    try {
      const reponse = await fetchAvecAuth('/api/nas/deposer-document', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossierId: d.id, nom: r.nom, contenu: await base64DepuisBlob(r.blob) }) });
      const json = await reponse.json().catch(() => ({}));
      if (!reponse.ok) throw new Error(json.erreur || `le serveur a répondu ${reponse.status}`);
      r.range = String(json.chemin || '').split(/[\\/]/).pop() || r.nom + '.docx';
      ajouterHistorique(d, `Document « ${r.titre} » rangé dans le dossier du NAS (Discussions)`);
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
    const courrier = e.forme === 'courrier';
    // Un courrier s'ouvre à droite, sur le papier à en-tête de l'office, à corriger sur la page (étude 21/10, client/99) ; Word, PDF/A et
    // le rangement refont la page telle qu'elle est affichée.
    if (courrier) {
      await ouvrirCourrierArtefactAssistant(titre, contenu, d);
      poserMessageAssistant('claire', `<p>Courrier prêt : <b>${escapeHtml(titre)}</b>${d ? ` — ${escapeHtml(libelleDossierAffiche(d))}` : ''}. Il est ouvert à droite, sur le papier à en-tête de l’office : corrigez-le sur la page, puis Word, PDF/A ou « Ranger dans le dossier ».</p>`,
        [{ libelle: 'Rouvrir le courrier', action: () => choisirArtefactAssistant(artefactsAssistant.liste.filter(a => a.type === 'courrier' && a.titre === titre).pop()?.id || '') }]);
      return { fait: true, affiche_a_l_utilisateur: `courrier « ${titre} » ouvert dans le panneau de droite, sur le papier à en-tête de l’office ; l’utilisateur peut le corriger sur la page avant de le télécharger (Word, PDF/A)${d && d.nasDossier ? ' ou de le ranger dans le dossier du NAS' : ''}` };
    }
    let blob;
    try { blob = courrier ? await courrierRenduAgent(contenu, d) : await docxRenduAgent(titre, contenu); }
    catch (err) { return { erreur: 'document Word impossible à fabriquer sur ce poste (bibliothèque en ligne injoignable ?)' }; }
    const id = 'rendu' + (Object.keys(rendusAgent).length + 1) + '-' + Date.now().toString(36);
    rendusAgent[id] = { blob, nom: nomFichierRenduAgent(titre), titre, dossierId: d ? d.id : '', range: '' };
    const ids = Object.keys(rendusAgent);
    ids.slice(0, Math.max(0, ids.length - MAX_RENDUS_AGENT)).forEach(k => { delete rendusAgent[k]; });
    const boutons = [{ libelle: 'Télécharger (Word)', action: () => telechargerRenduAgent(id) }];
    if (d && d.nasDossier) boutons.push({ libelle: 'Ranger dans le dossier du NAS', action: () => rangerRenduAgent(id) });
    poserMessageAssistant('claire', `<p>${courrier ? 'Courrier prêt, sur le papier de l’office' : 'Document prêt'} : <b>${escapeHtml(titre)}</b>${d ? ` — ${escapeHtml(libelleDossierAffiche(d))}` : ''}.</p>`, boutons);
    return { fait: true, affiche_a_l_utilisateur: `document « ${titre} » prêt, avec « Télécharger »${d && d.nasDossier ? ' et « Ranger dans le dossier du NAS »' : ''}` };
  }
