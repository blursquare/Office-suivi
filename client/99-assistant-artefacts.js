  // ---- « Demander à CLAIRE » : les artefacts, comme dans Claude (étude 21/10) ----
  // « Crée comme les artefacts : Claire l'ouvre sur sidebar avec l'outil utilisé et pré-rempli : outils de Claire, ou un tableau xls, ou
  // un courrier avec en-tête éditable. » Ce que l'agent produit s'ouvre dans un panneau à droite de la conversation, à modifier :
  //   - courrier : la page A4 du papier à en-tête de l'office (même aperçu que « Constitution de dossier », client/73), le texte se corrige
  //     sur la page ; Word, PDF/A (pour Authentic) et « Ranger dans le dossier du NAS » refont le courrier tel qu'il est affiché ;
  //   - tableau : cellules modifiables, Excel (.xlsx), CSV, copie vers un tableur ;
  //   - outil : la carte de l'outil avec les données de la fiche reprises, et le bouton qui l'ouvre pré-rempli.
  // Rien ne part vers une IA d'ici : l'agent n'en voit que ce qu'il a lui-même écrit (jamais les corrections faites sur la page).

  var MAX_ARTEFACTS_ASSISTANT = 12;
  var artefactsAssistant = { liste: [], courant: '', version: 0, rendu: -1, n: 0 };

  // Un courrier ou un tableau corrigé à la main n'est jamais perdu par un changement de conversation (étude 21/10, relecture) : les
  // artefacts restent dans le panneau, le temps de la fenêtre, jusqu'à ce qu'on les ferme (×) — fermer le dernier vide le panneau.
  function reinitialiserArtefactsAssistant() { artefactsAssistant.version++; renderArtefactAssistant(); }

  function artefactCourantAssistant() { return artefactsAssistant.liste.find(a => a.id === artefactsAssistant.courant) || null; }

  // Un artefact entre dans le panneau et devient le courant (les plus anciens sont oubliés au-delà de douze).
  function ouvrirArtefactAssistant(a) {
    // Un outil demandé de nouveau remplace sa carte (jamais douze cartes du même outil).
    if (a.type === 'outil' && a.onglet) artefactsAssistant.liste = artefactsAssistant.liste.filter(x => !(x.type === 'outil' && x.onglet === a.onglet));
    a.id = 'art' + (++artefactsAssistant.n);
    artefactsAssistant.liste.push(a);
    if (artefactsAssistant.liste.length > MAX_ARTEFACTS_ASSISTANT) artefactsAssistant.liste.shift();
    artefactsAssistant.courant = a.id;
    artefactsAssistant.version++;
    renderArtefactAssistant();
    return a.id;
  }

  function choisirArtefactAssistant(id) {
    if (!artefactsAssistant.liste.some(a => a.id === id)) return;
    artefactsAssistant.courant = id;
    artefactsAssistant.version++;
    renderArtefactAssistant();
  }

  // La croix retire l'artefact affiché (un outil monté retourne à sa place d'origine, intact) ; l'onglet voisin prend le relais.
  function fermerArtefactAssistant() {
    const a = artefactCourantAssistant();
    if (a) {
      if (a.type === 'outil' && a.onglet && outilsMontesAssistant[a.onglet] && outilsMontesAssistant[a.onglet].artefactId === a.id) demonterOutilAssistant(a.onglet);
      const k = artefactsAssistant.liste.indexOf(a);
      artefactsAssistant.liste.splice(k, 1);
      const voisin = artefactsAssistant.liste[Math.min(k, artefactsAssistant.liste.length - 1)];
      artefactsAssistant.courant = voisin ? voisin.id : '';
    }
    artefactsAssistant.version++;
    renderArtefactAssistant();
  }

  // ---- Courrier ----

  var RE_DATE_COURRIER_ARTEFACT = /^[A-ZÀ-Ü][A-Za-zÀ-ÿ' -]{1,40}, le \S/;

  // Pure : le texte écrit par l'IA (destinataire, « Blois, le … », objet, corps, « Me Sophie GOSSART ») en document du courrier fidèle.
  function documentCourrierDepuisTexteAgent(contenu, dateDuJour) {
    const lignes = String(contenu || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, ''));
    while (lignes.length && !lignes[0].trim()) lignes.shift();
    while (lignes.length && !lignes[lignes.length - 1].trim()) lignes.pop();
    // Le destinataire : les lignes avant la première ligne vide (ou avant la date), s'il y en a.
    let i = 0;
    const adresse = [];
    while (i < lignes.length && lignes[i].trim() && !RE_DATE_COURRIER_ARTEFACT.test(lignes[i]) && adresse.length < 7) { adresse.push(lignes[i].trim()); i++; }
    // Une formule d'appel seule en tête (« Madame, Monsieur, ») n'est pas un destinataire : le courrier n'en a pas.
    if (adresse.length === 1 && /^(Madame|Monsieur|Mesdames|Messieurs|Ma[iî]tre|Cher|Chère|Chers|Chères)\b.*,$/.test(adresse[0])) { adresse.length = 0; i = 0; }
    while (i < lignes.length && !lignes[i].trim()) i++;
    let date = '';
    if (i < lignes.length && RE_DATE_COURRIER_ARTEFACT.test(lignes[i]) && lignes[i].length < 80) { date = lignes[i].trim(); i++; }
    let reste = lignes.slice(i);
    while (reste.length && !reste[0].trim()) reste.shift();
    // La signature : « Me … » en dernière ligne.
    let signature = 'Me  Sophie GOSSART';
    while (reste.length && !reste[reste.length - 1].trim()) reste.pop();
    if (reste.length && /^(Me|Maître)\s/.test(reste[reste.length - 1].trim())) { signature = reste.pop().trim().replace(/^(Me|Maître)\s+/, 'Me  '); }
    while (reste.length && !reste[reste.length - 1].trim()) reste.pop();
    // Un tableau en « | a | b | » devient des lignes de texte (le courrier fidèle porte ses propres tableaux, pas ceux de l'IA).
    // Un titre « # … » de l'IA n'a pas de sens sur un courrier : il devient une ligne en gras.
    reste = reste.map(l => l.replace(/^\s*#{1,4}\s+(.+?)\s*$/, '**$1**')).map(l => (/^\s*\|.*\|\s*$/.test(l) ? (/^\s*\|[\s:|-]+\|\s*$/.test(l) ? null : l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()).join(' — ')) : l)).filter(l => l !== null);
    return { adresse: adresse.length ? adresse : ['À compléter'], adresseDebut: 1, ligneDate: 10, date: date || `Blois, le ${dateDuJour || '…'}`,
      lignes: ['', '', ''].concat(reste.map(l => l.replace(/^(\s*)[-•]\s+/, '$1- '))), signature, blancsSignature: 0 };
  }

  // L'ouverture d'un courrier dans le panneau ; le modèle de l'office (logos) est chargé avant l'affichage.
  async function ouvrirCourrierArtefactAssistant(titre, contenu, d) {
    try { await chargerModeleAppelFonds(); } catch (e) { /* l'aperçu s'affiche sans les images si le modèle manque */ }
    const maintenant = new Date();
    const auj = `${maintenant.getDate() === 1 ? '1er' : maintenant.getDate()} ${maintenant.toLocaleDateString('fr-FR', { month: 'long' })} ${maintenant.getFullYear()}`;
    return ouvrirArtefactAssistant({ type: 'courrier', titre, dossierId: d ? d.id : '', signe: false, doc: documentCourrierDepuisTexteAgent(contenu, auj) });
  }

  function nomFichierArtefactAssistant(a) { return nomFichierRenduAgent(a.titre); }

  async function blobCourrierArtefactAssistant(a, format) {
    const d = a.dossierId ? dossiers.find(x => x.id === a.dossierId) : null;
    await chargerModeleAppelFonds();
    if (format === 'pdf') {
      const { blob } = await genererPdfAAppelFonds(null, nomFichierArtefactAssistant(a) + '.docx', { fidele: a.doc, refLignes: refLignesCourrier(d), ref: d ? d.nom || '' : '', signe: !!a.signe });
      return blob;
    }
    return docxCourrierFidele(a.doc, d, { signe: !!a.signe });
  }

  async function telechargerArtefactAssistant(id, format) {
    const a = artefactsAssistant.liste.find(x => x.id === id);
    if (!a) return;
    try {
      if (a.type === 'courrier') telechargerFichier(await blobCourrierArtefactAssistant(a, format), nomFichierArtefactAssistant(a) + (format === 'pdf' ? '.pdf' : '.docx'), format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      else if (a.type === 'tableau') {
        if (format === 'xlsx') telechargerFichier(await blobXlsxArtefactAssistant(a), nomFichierArtefactAssistant(a) + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        else telechargerFichier(new Blob([csvDepuisTableauCalcul({ colonnes: a.colonnes, lignes: a.lignes.map(l => l.map(valeurCelluleArtefact)) })], { type: 'text/csv;charset=utf-8' }), nomFichierArtefactAssistant(a) + '.csv', 'text/csv');
      }
    } catch (e) { afficherToast('Fichier impossible à fabriquer sur ce poste (bibliothèque en ligne injoignable ?)', 'OK', null); }
  }

  async function rangerArtefactAssistant(id) {
    const a = artefactsAssistant.liste.find(x => x.id === id);
    if (!a || a.type !== 'courrier') return;
    const d = a.dossierId ? dossiers.find(x => x.id === a.dossierId) : null;
    if (!d || !d.nasDossier) { afficherToast('Ce dossier n’est pas relié au NAS.', 'OK', null); return; }
    try {
      const blob = await blobCourrierArtefactAssistant(a, 'docx');
      const rid = 'rendu-art-' + a.id + '-' + Date.now().toString(36);
      rendusAgent[rid] = { blob, nom: nomFichierArtefactAssistant(a), titre: a.titre, dossierId: d.id, range: '' };
      await rangerRenduAgent(rid);
      delete rendusAgent[rid];
    } catch (e) { afficherToast('Courrier non rangé : ' + (e && e.message ? e.message : 'erreur'), 'OK', null); }
  }

  function basculerSigneArtefactAssistant(id, signe) {
    const a = artefactsAssistant.liste.find(x => x.id === id);
    if (!a) return;
    a.signe = !!signe;
    artefactsAssistant.version++;
    renderArtefactAssistant();
  }

  // La page A4 seule (le HTML du courrier fidèle), coupée en pages et réduite à la largeur du panneau.
  function htmlFeuilleCourrierArtefact(a) {
    const d = a.dossierId ? dossiers.find(x => x.id === a.dossierId) : null;
    const assets = (window.APPEL_FONDS_MODELE && window.APPEL_FONDS_MODELE.assets) || {};
    return htmlCourrierFidele(a.doc, refLignesCourrier(d), assets, !!a.signe, { editable: true });
  }

  function ajusterFeuilleCourrierArtefact(conteneur) {
    const feuille = conteneur && conteneur.querySelector('.cstp');
    if (!feuille) return;
    paginerApercuCourrier(feuille);
    const pageA4 = feuille.querySelector('.cstp-page');
    const r = pageA4 && pageA4.offsetWidth ? (conteneur.clientWidth - 2) / pageA4.offsetWidth : 1;
    if (r > 0 && r < 1) feuille.style.zoom = String(Math.floor(r * 100) / 100);
  }

  // Un paragraphe ou une ligne du destinataire corrigé sur la page : retenu sur le courrier (Word, PDF/A, NAS), jamais renvoyé à l'IA.
  // Seule la page est redessinée, et seulement si le texte a changé : les boutons du panneau ne bougent pas sous le pointeur.
  function retoucheCourrierArtefactAssistant(ev) {
    const el = ev.target;
    const a = artefactCourantAssistant();
    if (!a || a.type !== 'courrier' || !el || !el.isContentEditable) return;
    const texte = texteBaliseDepuisElement(el);
    let change = false;
    if (el.dataset.dest !== undefined) {
      const i = Number(el.dataset.dest);
      const avant = a.doc.adresse.slice();
      const lignes = a.doc.adresse.filter(l => l !== 'À compléter');
      if (i < lignes.length) { if (texte) lignes[i] = texte; else lignes.splice(i, 1); } else if (texte) lignes.push(texte);
      a.doc.adresse = lignes.length ? lignes : ['À compléter'];
      change = a.doc.adresse.join('\n') !== avant.join('\n');
    } else if (el.dataset.ligne !== undefined) {
      const i = Number(el.dataset.ligne);
      if (typeof a.doc.lignes[i] !== 'string') return;
      // Comparé à la forme que la page aurait relue (l'ordre gras/souligné et les espaces ne font pas une correction).
      const relu = document.createElement('div');
      relu.innerHTML = htmlRunsCourrier(a.doc.lignes[i]);
      if (texte === texteBaliseDepuisElement(relu)) return;
      a.doc.lignes[i] = texte;
      change = true;
    } else return;
    if (!change) return;
    // Redessinée après le changement de focus : le paragraphe cliqué ensuite garde le curseur.
    setTimeout(() => {
      const conteneur = document.getElementById('assistant-art-feuille');
      if (!conteneur || artefactCourantAssistant() !== a) return;
      const actif = document.activeElement;
      const cible = actif && actif.isContentEditable && conteneur.contains(actif) ? (actif.dataset.dest !== undefined ? `[data-dest="${actif.dataset.dest}"]` : `[data-ligne="${actif.dataset.ligne}"]`) : '';
      conteneur.innerHTML = htmlFeuilleCourrierArtefact(a);
      ajusterFeuilleCourrierArtefact(conteneur);
      const n = cible ? conteneur.querySelector(cible) : null;
      if (n) n.focus();
    }, 0);
  }

  // ---- Tableau ----

  function lettreColonneArtefact(i) { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; }

  // Pure : une cellule saisie → un nombre quand elle en est un (virgule ou point décimal, jamais un code à zéro initial), sinon le texte.
  function valeurCelluleArtefact(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : '';
    const t = String(v == null ? '' : v).trim();
    if (/^-?(0|[1-9]\d{0,14})([.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'));
    return t;
  }

  function xmlEchapperArtefact(t) { return String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }

  // Pure : le contenu des fichiers d'un classeur Excel d'une feuille (en-tête en gras, largeurs de colonnes). Une cellule qui commence par
  // = + - @ reste du TEXTE (inlineStr) : jamais une formule.
  function fichiersXlsxArtefact(t) {
    const largeur = t.colonnes.map((c, i) => Math.min(60, Math.max(10, String(c).length + 2, ...t.lignes.slice(0, 200).map(l => String(l[i] == null ? '' : l[i]).length + 2))));
    const cellule = (v, r, c, entete) => {
      const ref = lettreColonneArtefact(c) + (r + 1);
      const x = entete ? v : valeurCelluleArtefact(v);
      if (typeof x === 'number') return `<c r="${ref}"><v>${x}</v></c>`;
      return x === '' ? '' : `<c r="${ref}" t="inlineStr"${entete ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlEchapperArtefact(x)}</t></is></c>`;
    };
    const lignes = [t.colonnes].concat(t.lignes).map((l, r) => `<row r="${r + 1}">${t.colonnes.map((_, c) => cellule(l[c] == null ? '' : l[c], r, c, r === 0)).join('')}</row>`).join('');
    return {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEchapperArtefact(String(t.titre || 'Tableau').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Tableau')}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>',
      'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${largeur.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${lignes}</sheetData></worksheet>`
    };
  }

  async function blobXlsxArtefactAssistant(a) {
    await chargerModeleAppelFonds();
    const zip = new window.PizZip();
    const f = fichiersXlsxArtefact(a);
    Object.keys(f).forEach(nom => zip.file(nom, f[nom]));
    return zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  }

  function copierTableauArtefactAssistant(id) {
    const a = artefactsAssistant.liste.find(x => x.id === id);
    if (!a) return;
    const tsv = [a.colonnes].concat(a.lignes).map(l => a.colonnes.map((_, i) => String(l[i] == null ? '' : l[i]).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
    (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(tsv) : Promise.reject()).then(
      () => afficherToast('Tableau copié : collez-le dans Excel.', 'OK', null), () => afficherToast('Copie impossible depuis ce navigateur.', 'OK', null));
  }

  function retoucheTableauArtefactAssistant(ev) {
    const el = ev.target;
    const a = artefactCourantAssistant();
    if (!a || a.type !== 'tableau' || !el || !el.isContentEditable || el.dataset.l === undefined) return;
    const l = Number(el.dataset.l);
    const c = Number(el.dataset.c);
    const texte = el.textContent.replace(/\s+/g, ' ').trim();
    if (l === -1) a.colonnes[c] = texte; else if (a.lignes[l]) a.lignes[l][c] = texte;
  }

  // ---- Outil ----

  // Ouvre une carte d'outil (client/67) : ce que la fiche apporte, puis le bouton qui l'ouvre pré-rempli.
  function ouvrirOutilArtefactAssistant(libelle, d, ouvrir, options) {
    const sur = (fn, defaut) => { try { return fn(); } catch (e) { return defaut; } };
    const lignes = [];
    if (d) {
      lignes.push(['Dossier', libelleDossierAffiche(d)]);
      if (d.adresseBien) lignes.push(['Bien', d.adresseBien]);
      if (d.prixVente) lignes.push(['Prix', sur(() => formaterPrix(d.prixVente), String(d.prixVente))]);
      const parties = (d.parties || []).filter(Boolean).map(p => [p.prenom, p.nom].filter(Boolean).join(' ')).filter(Boolean);
      if (parties.length) lignes.push(['Parties', parties.slice(0, 6).join(', ')]);
      if (d.rendezVousSignature) lignes.push(['Signature', String(d.rendezVousSignature).split('-').reverse().join('/') + (d.rendezVousSignatureHeure ? ' à ' + d.rendezVousSignatureHeure : '')]);
    }
    return ouvrirArtefactAssistant({ type: 'outil', titre: libelle, lignes, ouvrir, dossierId: d ? d.id : '', onglet: options && options.onglet || '', outil: options && options.outil || '', monte: false });
  }


  // ---- Un outil de CLAIRE monté dans le panneau (étude 21/10 : « l'outil lui-même s'ouvre dans le panneau — oui, je le veux ») ----
  // L'écran de l'outil (`#onglet-…`, ses champs, ses boutons, tous ses identifiants) est DÉPLACÉ dans le panneau, jamais copié : il garde
  // son état, ses gestionnaires et sa lecture du dossier. Un repère (commentaire) marque sa place d'origine ; il y retourne quand
  // l'outil est ouvert depuis la barre latérale ou une nouvelle conversation commence. Claire Scan et Nouveau dossier (écrans trop larges,
  // état propre) gardent leur onglet.
  var OUTILS_MONTABLES_ASSISTANT = ['preemption', 'quotites', 'appel-fonds', 'calculateur', 'prorata', 'inventaire', 'constitution'];
  var outilsMontesAssistant = {};   // onglet → { repere, artefactId }

  function outilMontableAssistant(onglet) { return OUTILS_MONTABLES_ASSISTANT.includes(onglet) && !!document.getElementById('onglet-' + onglet); }

  // Un garage caché pour les écrans montés dont l'artefact n'est pas affiché (panneau redessiné, autre onglet du panneau).
  function garageOutilsAssistant() {
    let g = document.getElementById('assistant-art-garage');
    if (!g) { g = document.createElement('div'); g.id = 'assistant-art-garage'; g.style.display = 'none'; document.body.appendChild(g); }
    return g;
  }

  // Ouvre l'outil prérempli (la fonction habituelle), puis déplace son écran dans le panneau et rend l'écran à la conversation.
  function monterOutilAssistant(artefactId) {
    const a = artefactsAssistant.liste.find(x => x.id === artefactId);
    if (!a || a.type !== 'outil' || !outilMontableAssistant(a.onglet)) return;
    const d = a.dossierId ? dossiers.find(x => x.id === a.dossierId) : null;
    ouvrirOutilClaireAgent(a.outil, d, false, () => {
      const noeud = document.getElementById('onglet-' + a.onglet);
      if (!noeud) return;
      // Un outil déjà monté pour un autre artefact : ce dernier reprend la carte.
      const deja = outilsMontesAssistant[a.onglet];
      if (!deja) {
        const repere = document.createComment('outil-monte:' + a.onglet);
        noeud.parentNode.insertBefore(repere, noeud);
        outilsMontesAssistant[a.onglet] = { repere, artefactId: a.id };
      } else {
        const autre = artefactsAssistant.liste.find(x => x.id === deja.artefactId);
        if (autre && autre !== a) autre.monte = false;
        deja.artefactId = a.id;
      }
      garageOutilsAssistant().appendChild(noeud);
      a.monte = true;
      // L'outil ne reste pas un onglet de travail : il est dans le panneau.
      const k = ongletsTravail.findIndex(o => o.type === 'outil' && o.nom === a.onglet);
      if (k >= 0) { ongletsTravail.splice(k, 1); enregistrerOngletsTravail(); }
      artefactsAssistant.courant = a.id;
      artefactsAssistant.version++;
      definirOnglet('assistant');
      renderArtefactAssistant();
    });
  }

  // Rend l'écran d'un outil à sa place d'origine (ouvert depuis la barre latérale, ou nouvelle conversation). Appelée au début de definirOnglet.
  function demonterOutilAssistant(onglet) {
    const m = outilsMontesAssistant[onglet];
    if (!m) return;
    const noeud = document.getElementById('onglet-' + onglet);
    if (noeud && m.repere.parentNode) { m.repere.parentNode.insertBefore(noeud, m.repere); noeud.style.display = 'none'; }
    if (m.repere.parentNode) m.repere.parentNode.removeChild(m.repere);
    const a = artefactsAssistant.liste.find(x => x.id === m.artefactId);
    if (a) { a.monte = false; artefactsAssistant.version++; }
    delete outilsMontesAssistant[onglet];
  }

  // definirOnglet cache tous les écrans d'outils : ceux du panneau restent affichés.
  // Arrivé sur l'écran « Demander à CLAIRE » : le panneau est redessiné (rendu dans un écran caché, la page n'avait ni mesure ni zoom).
  function reafficherOutilsMontesAssistant(nom) {
    Object.keys(outilsMontesAssistant).forEach(onglet => { const n = document.getElementById('onglet-' + onglet); if (n) n.style.display = ''; });
    if (nom === 'assistant') { artefactsAssistant.rendu = -1; renderArtefactAssistant(); }
  }

  // Ctrl+P : les règles d'impression de l'appel de fonds et du forfait mobilier isolent l'écran de l'outil (classes posées par
  // definirOnglet) — un outil monté retourne donc à son onglet le temps de l'impression, puis revient dans le panneau.
  var outilsRemontesApresImpression = [];
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('beforeprint', () => {
      outilsRemontesApresImpression = [];
      ['appel-fonds', 'inventaire'].forEach(onglet => {
        const m = outilsMontesAssistant[onglet];
        const noeud = document.getElementById('onglet-' + onglet);
        if (!m || !noeud || !noeud.offsetParent) return;
        outilsRemontesApresImpression.push({ onglet, artefactId: m.artefactId });
        demonterOutilAssistant(onglet);
        definirOnglet(onglet);
      });
    });
    window.addEventListener('afterprint', () => {
      const a = outilsRemontesApresImpression;
      outilsRemontesApresImpression = [];
      a.forEach(({ onglet, artefactId }) => {
        const art = artefactsAssistant.liste.find(x => x.id === artefactId);
        const noeud = document.getElementById('onglet-' + onglet);
        if (!art || !noeud || outilsMontesAssistant[onglet]) return;
        const repere = document.createComment('outil-monte:' + onglet);
        noeud.parentNode.insertBefore(repere, noeud);
        outilsMontesAssistant[onglet] = { repere, artefactId };
        garageOutilsAssistant().appendChild(noeud);
        art.monte = true;
        artefactsAssistant.courant = art.id;
        artefactsAssistant.version++;
        definirOnglet('assistant');
        renderArtefactAssistant();
      });
    });
  }

  function ouvrirOutilEnOngletAssistant(id) {
    const a = artefactsAssistant.liste.find(x => x.id === id);
    if (!a || !a.onglet) return;
    demonterOutilAssistant(a.onglet);
    definirOnglet(a.onglet);
    renderArtefactAssistant();
  }

  function ouvrirOutilDepuisArtefactAssistant(id) {
    const a = artefactsAssistant.liste.find(x => x.id === id);
    if (a && typeof a.ouvrir === 'function') a.ouvrir();
  }

  // ---- Rendu du panneau ----

  function iconeTypeArtefactAssistant(type) { return icone(type === 'courrier' ? 'file-text' : type === 'tableau' ? 'list-check' : 'sparkle'); }

  function renderArtefactAssistant() {
    const zone = document.getElementById('assistant-artefact');
    const page = document.querySelector('#onglet-assistant .asst-page');
    if (!zone || !page) return;
    const a = artefactCourantAssistant();
    page.classList.toggle('artefact-ouvert', !!a);
    // Un outil monté a besoin de largeur : le panneau s'élargit.
    page.classList.toggle('artefact-large', !!(a && a.type === 'outil' && a.monte));
    if (!a) { if (artefactsAssistant.rendu !== artefactsAssistant.version) { Object.keys(outilsMontesAssistant).forEach(o => { const n = document.getElementById('onglet-' + o); if (n && zone.contains(n)) garageOutilsAssistant().appendChild(n); }); zone.innerHTML = ''; artefactsAssistant.rendu = artefactsAssistant.version; } return; }
    // Redessiné seulement quand il a changé : une correction en cours sur la page n'est jamais effacée par l'avancement de la conversation.
    if (artefactsAssistant.rendu === artefactsAssistant.version) return;
    artefactsAssistant.rendu = artefactsAssistant.version;
    Object.keys(outilsMontesAssistant).forEach(o => { const n = document.getElementById('onglet-' + o); if (n && zone.contains(n)) garageOutilsAssistant().appendChild(n); });
    const d = a.dossierId ? dossiers.find(x => x.id === a.dossierId) : null;
    const onglets = artefactsAssistant.liste.length > 1 ? `<div class="asst-art-onglets" role="tablist">${artefactsAssistant.liste.map(x => `<button type="button" role="tab" aria-selected="${x.id === a.id}" class="asst-art-onglet${x.id === a.id ? ' actif' : ''}" onclick="choisirArtefactAssistant('${escapeOnclickArg(x.id)}')">${iconeTypeArtefactAssistant(x.type)}<span>${escapeHtml(x.titre)}</span></button>`).join('')}</div>` : '';
    const idj = escapeOnclickArg(a.id);
    let actions = '';
    let corps = '';
    if (a.type === 'courrier') {
      actions = `<label class="asst-art-signe"><wa-switch ${a.signe ? 'checked' : ''} onchange="basculerSigneArtefactAssistant('${idj}', this.checked)"></wa-switch><span>Tampon et signature</span></label>
        <wa-button variant="brand" size="s" type="button" onclick="telechargerArtefactAssistant('${idj}', 'docx')">Word</wa-button>
        <wa-button appearance="outlined" size="s" type="button" onclick="telechargerArtefactAssistant('${idj}', 'pdf')">PDF/A</wa-button>
        ${d && d.nasDossier ? `<wa-button appearance="outlined" size="s" type="button" onclick="rangerArtefactAssistant('${idj}')">Ranger dans le dossier</wa-button>` : ''}`;
      corps = `<p class="asst-art-aide">Cliquez dans le texte pour le corriger : Word, PDF/A et le rangement reprennent la page telle qu’elle est affichée.</p><div class="asst-art-feuille" id="assistant-art-feuille">${htmlFeuilleCourrierArtefact(a)}</div>`;
    } else if (a.type === 'tableau') {
      actions = `<wa-button variant="brand" size="s" type="button" onclick="telechargerArtefactAssistant('${idj}', 'xlsx')">Excel</wa-button>
        <wa-button appearance="outlined" size="s" type="button" onclick="telechargerArtefactAssistant('${idj}', 'csv')">CSV</wa-button>
        <wa-button appearance="outlined" size="s" type="button" onclick="copierTableauArtefactAssistant('${idj}')">Copier</wa-button>`;
      corps = `<p class="asst-art-aide">${a.lignes.length} ligne${a.lignes.length > 1 ? 's' : ''} · cliquez dans une cellule pour la corriger avant de télécharger.</p>
        <div class="asst-art-tableau"><table><thead><tr><th class="asst-art-coin"></th>${a.colonnes.map((c, i) => `<th contenteditable="true" spellcheck="false" data-l="-1" data-c="${i}">${escapeHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>${a.lignes.slice(0, 500).map((l, r) => `<tr><th class="asst-art-num">${r + 1}</th>${a.colonnes.map((_, c) => `<td contenteditable="true" spellcheck="false" data-l="${r}" data-c="${c}"${typeof valeurCelluleArtefact(l[c]) === 'number' ? ' class="num"' : ''}>${escapeHtml(l[c] == null ? '' : l[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        ${a.lignes.length > 500 ? `<p class="asst-art-aide">Les 500 premières lignes sont montrées ici ; le fichier téléchargé les contient toutes.</p>` : ''}`;
    } else if (a.monte) {
      actions = `<wa-button appearance="outlined" size="s" type="button" onclick="ouvrirOutilEnOngletAssistant('${idj}')">Ouvrir dans un onglet</wa-button>`;
      corps = '<div class="asst-art-outil-place" id="assistant-art-outil-place"></div>';
    } else {
      corps = `<div class="asst-art-outil"><h3>${escapeHtml(a.titre)}</h3>
        ${a.lignes.length ? `<dl class="asst-art-donnees">${a.lignes.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>` : ''}
        <p class="asst-art-aide">${a.onglet && outilMontableAssistant(a.onglet) ? 'L’outil s’ouvre ici, à droite,' : 'L’outil s’ouvre dans un onglet de travail,'} déjà rempli avec ces données de la fiche.</p></div>`;
      actions = a.onglet && outilMontableAssistant(a.onglet)
        ? `<wa-button variant="brand" size="s" type="button" onclick="monterOutilAssistant('${idj}')">Ouvrir ${escapeHtml(a.titre)} ici</wa-button>`
        : `<wa-button variant="brand" size="s" type="button" onclick="ouvrirOutilDepuisArtefactAssistant('${idj}')">Ouvrir ${escapeHtml(a.titre)}</wa-button>`;
    }
    zone.innerHTML = `<div class="asst-art-tete"><span class="asst-art-type" aria-hidden="true">${iconeTypeArtefactAssistant(a.type)}</span><h2 class="asst-art-titre">${escapeHtml(a.titre)}</h2>
        <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="fermerArtefactAssistant()" title="Fermer" aria-label="Fermer">${icone('x')}</wa-button></div>
      ${onglets}<div class="asst-art-actions">${actions}</div><div class="asst-art-corps">${corps}</div>`;
    ajusterFeuilleCourrierArtefact(zone.querySelector('.asst-art-feuille'));
    // L'écran d'un outil monté : tiré du garage pour être posé dans le panneau.
    const place = document.getElementById('assistant-art-outil-place');
    if (place && a.monte && a.onglet) { const n = document.getElementById('onglet-' + a.onglet); if (n) { place.appendChild(n); n.style.display = ''; } }
    if (!zone.dataset.edition) {
      zone.dataset.edition = '1';
      zone.addEventListener('focusout', (ev) => { retoucheCourrierArtefactAssistant(ev); retoucheTableauArtefactAssistant(ev); });
      zone.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target && ev.target.isContentEditable && ev.target.closest('.cstp')) { ev.preventDefault(); ev.target.blur(); } });
    }
  }
