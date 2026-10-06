  // ---- Surlignage dans un PDF (étude 06/10 : « surligner dans les documents PDF au clic sur une page, dans une analyse ou
  // nouveau dossier ; pas d'encadrement, juste un surlignage de ce qui a été trouvé ») ----
  // Un clic sur « p. N » (Nouveau dossier : données lues, engagements, dates ; Relecture d'actes : citations, diagnostics)
  // mène à la page et pose un trait de surligneur sur les seuls caractères trouvés — plus le cadre orange posé sur toute la
  // ligne pdf.js d'avant. Le surlignage reste jusqu'au clic suivant.

  // Pure : parties des items pdf.js d'une page à surligner pour le premier texte de `cibles` retrouvé sur la page
  // (accents, casse, espaces et apostrophes ignorés, `normaliserAvecIndex`). Un passage long qui ne se retrouve pas tel quel
  // (coupure de ligne, mise en page) est ancré sur son début, puis couvert sur toute sa longueur.
  // Rend [{ item, debut, fin }] (indices de caractères dans `items[item].str`), [] si rien n'est retrouvé.
  function plagesSurlignagePdf(items, cibles) {
    let texte = '';
    const origines = [];
    (items || []).forEach((it, i) => {
      const s = String((it && it.str) || '');
      for (let k = 0; k < s.length; k++) { texte += s[k]; origines.push([i, k]); }
      texte += ' ';
      origines.push(null);
    });
    const exact = normaliserAvecIndex(texte);
    const sansPonctuation = sansPonctuationSurlignage(exact);
    const chercher = (page, cible) => {
      let pos = page.texte.indexOf(cible);
      if (pos === -1 && cible.length > 30) {
        let l = Math.min(60, cible.length);
        while (l >= 15 && pos === -1) { pos = page.texte.indexOf(cible.slice(0, l)); if (pos === -1) l -= 10; }
      }
      return pos === -1 ? null : { debut: page.index[pos], fin: page.index[Math.min(pos + cible.length - 1, page.index.length - 1)] };
    };
    for (const brute of cibles || []) {
      const cible = normaliserAvecIndex(String(brute || '').replace(/^\s*…|…\s*$/g, ''));
      if (cible.texte.trim().length < 2) continue;
      // Tel quel, puis sans ponctuation (une citation qui oublie une parenthèse ou une virgule de l'acte).
      const trouve = chercher(exact, cible.texte.trim()) || chercher(sansPonctuation, sansPonctuationSurlignage(cible).texte.trim());
      if (!trouve) continue;
      const { debut, fin } = trouve;
      const parItem = new Map();
      for (let i = debut; i <= fin; i++) {
        const o = origines[i];
        if (!o) continue;
        const p = parItem.get(o[0]);
        if (p) p.fin = o[1] + 1;
        else parItem.set(o[0], { item: o[0], debut: o[1], fin: o[1] + 1 });
      }
      const plages = [...parItem.values()].filter(p => String(items[p.item].str).slice(p.debut, p.fin).trim());
      if (plages.length) return plages;
    }
    return [];
  }

  // Pure : texte normalisé (`normaliserAvecIndex`) sans sa ponctuation, la correspondance avec le texte d'origine gardée.
  function sansPonctuationSurlignage(norm) {
    let texte = '';
    const index = [];
    for (let i = 0; i < norm.texte.length; i++) {
      const c = norm.texte[i];
      if (/[a-z0-9€%@]/.test(c)) { texte += c; index.push(norm.index[i]); }
      else if (c === ' ' && texte && texte[texte.length - 1] !== ' ') { texte += ' '; index.push(norm.index[i]); }
    }
    return { texte, index };
  }

  var MOIS_SURLIGNAGE = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  // Pure : formes sous lesquelles une date ISO s'écrit dans un acte (« 5 novembre 2026 », « 1er mars 2027 », « 05/11/2026 »).
  function formesDateSurlignage(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return [];
    const j = Number(m[3]);
    const mois = MOIS_SURLIGNAGE[Number(m[2]) - 1];
    return [`${j === 1 ? '1er' : j} ${mois} ${m[1]}`, `${j} ${mois} ${m[1]}`, `${m[3]}/${m[2]}/${m[1]}`];
  }

  // Pure : ce qu'on cherche sur la page pour une donnée du panneau Vérifier, du plus précis au plus large — le texte trouvé
  // par la lecture, la valeur telle qu'elle s'écrit dans l'acte, puis l'extrait qui l'entoure.
  function ciblesSurlignageRevision(cle, champ) {
    const source = (champ && champ.source) || {};
    const valeur = champ ? champ.valeur : null;
    const cibles = [];
    if (source.trouve) cibles.push(source.trouve);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(valeur || ''))) cibles.push(...formesDateSurlignage(valeur));
    else if (valeur !== null && valeur !== undefined && valeur !== '' && typeof valeur !== 'object') cibles.push(...aiguillesPourValeur(cle, valeur));
    if (source.extrait) cibles.push(source.extrait);
    return cibles.filter(c => String(c).trim().length >= 2);
  }

  // Pose le surlignage sur une page déjà dessinée : `bloc` (position relative) porte le canvas, `echelle` = pixels affichés
  // par point PDF. La largeur d'une partie de ligne est mesurée dans la police de l'item (proportion de la largeur pdf.js).
  // Rend le premier trait posé (pour le faire défiler en vue), ou null.
  async function surlignerDansPagePdf(pdf, numero, bloc, echelle, cibles) {
    if (!pdf || !bloc) return null;
    bloc.querySelectorAll('.pdf-highlight').forEach(h => h.remove());
    const page = await pdf.getPage(numero);
    const contenu = await page.getTextContent();
    const plages = plagesSurlignagePdf(contenu.items, cibles);
    if (!plages.length) return null;
    const viewport = page.getViewport({ scale: echelle });
    const mesure = document.createElement('canvas').getContext('2d');
    let premier = null;
    plages.forEach(p => {
      const item = contenu.items[p.item];
      const str = String(item.str);
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const hauteur = Math.hypot(tx[2], tx[3]) || 12;
      const largeurItem = (item.width || 0) * echelle;
      const style = contenu.styles && contenu.styles[item.fontName];
      mesure.font = `${hauteur}px ${(style && style.fontFamily) || 'serif'}`;
      const total = mesure.measureText(str).width || 1;
      const x0 = largeurItem * mesure.measureText(str.slice(0, p.debut)).width / total;
      const x1 = largeurItem * mesure.measureText(str.slice(0, p.fin)).width / total;
      const s = document.createElement('div');
      s.className = 'pdf-highlight';
      s.style.left = Math.max(0, tx[4] + x0 - 1) + 'px';
      s.style.top = Math.max(0, tx[5] - hauteur * 0.92) + 'px';
      s.style.width = Math.max(4, x1 - x0 + 2) + 'px';
      s.style.height = (hauteur * 1.18) + 'px';
      bloc.appendChild(s);
      if (!premier) premier = s;
    });
    return premier;
  }

  // Aperçu de « Nouveau dossier » : va à la page et surligne le premier texte retrouvé (sinon la page seule).
  async function surlignerApercuImport(numeroPage, cibles) {
    if (!pdfActuel || !numeroPage) return;
    const bloc = document.getElementById('pdf-page-bloc-' + numeroPage);
    const canvas = document.getElementById('pdf-page-' + numeroPage);
    if (!bloc || !canvas) return;
    document.querySelectorAll('.pdf-highlight').forEach(h => h.remove());
    bloc.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try {
      const page = await pdfActuel.getPage(numeroPage);
      const echelle = canvas.width / page.getViewport({ scale: 1 }).width;
      const premier = await surlignerDansPagePdf(pdfActuel, numeroPage, bloc, echelle, cibles);
      if (premier) premier.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      console.error('Surlignage impossible', e);
    }
  }

  // Panneau Vérifier : la donnée d'une ligne, retrouvée et surlignée sur sa page.
  function voirDonneeRevisionDansPdf(cle) {
    const champ = champRevision(extractionActuelle, cle);
    if (!champ || !champ.source || !champ.source.page) return;
    surlignerApercuImport(champ.source.page, ciblesSurlignageRevision(cle, champ));
  }
