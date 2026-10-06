  // ---- Mise en forme de la fenêtre d'email (étude 06/10 : « mettre des outils de gras, souligné… ; permettre de copier-coller
  // des pièces jointes ou glisser-déposer ») ----
  // La zone de saisie de la fenêtre d'email (renderCarteRedaction) est une zone éditable : gras, italique, souligné, listes,
  // effacer la mise en forme (barre d'outils et Ctrl+B / Ctrl+I / Ctrl+U). Ce qui y est écrit est relu à l'envoi par
  // htmlCorpsDepuisEditeur, qui ne garde que ces mises en forme et les liens (jamais une image, un style ou un script venus
  // d'ailleurs) ; un texte collé l'est en texte brut, ses liens gardés (voir « Liens »). Un fichier collé (Ctrl+V d'un fichier ou d'une capture) ou
  // déposé sur la fenêtre devient une pièce jointe.

  // ---- Liens (étude 06/10 : « détecter les liens hypertexte dans les emails rédigés et les copier-coller dans les emails ») ----
  // Une adresse web (https://…, www.…) ou un email écrits dans le texte deviennent un lien : au collage, à la frappe (après
  // l'espace ou l'Entrée qui suit) et de toute façon à l'envoi. Un lien collé depuis un email ou une page garde son adresse.
  var RE_LIEN_TEXTE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  // Pure : l'adresse d'un lien écrit en texte (« www.x.fr » → https, un email → mailto), '' si ce n'en est pas un.
  function hrefDepuisLienTexte(t) {
    const v = String(t || '').trim();
    if (/^https?:\/\//i.test(v)) return v;
    if (/^www\./i.test(v)) return 'https://' + v;
    if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v)) return 'mailto:' + v;
    return '';
  }
  // Pure : la ponctuation de fin de phrase ne fait pas partie du lien (« voir https://x.fr. »).
  function separerLienTexte(brut) {
    const m = /[.,;:!?)\]]+$/.exec(brut);
    const fin = m ? m[0] : '';
    return { lien: fin ? brut.slice(0, -fin.length) : brut, reste: fin };
  }
  // Pure : les liens d'un texte HTML-échappé (hors balises) enveloppés dans <a href> ; `style` = attribut de style posé sur
  // chaque lien ('' dans la zone éditable, la couleur de l'office à l'envoi).
  function lierLiensTexte(texteEchappe, style) {
    return String(texteEchappe || '').replace(RE_LIEN_TEXTE, (brut) => {
      const { lien } = separerLienTexte(brut.replace(/(?:&amp;)+$/i, ''));
      // Le texte est déjà échappé (« &amp; ») : l'adresse le reste dans l'attribut, comme un lien écrit par la zone.
      const href = hrefDepuisLienTexte(lien);
      if (!href) return brut;
      const suite = brut.slice(lien.length);
      return `<a href="${href.replace(/"/g, '&quot;')}"${style ? ` style="${style}"` : ''}>${lien}</a>${suite}`;
    });
  }
  // Pure : ce qu'on garde d'un HTML collé (email, page web, Word) : le texte, ses retours à la ligne et ses liens http(s) /
  // mailto — rien d'autre (ni image, ni style, ni script). Le texte hors lien est lui aussi passé au détecteur de liens.
  function htmlColleRedaction(html) {
    const sans = String(html || '').replace(/<(script|style|head|title|template)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    let sortie = '';
    let lienOuvert = false;
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g;
    let m;
    while ((m = re.exec(sans))) {
      if (m[4] != null) {
        const texte = m[4].replace(/[\r\n\t]+/g, ' ');
        sortie += lienOuvert ? texte : lierLiensTexte(texte, '');
        continue;
      }
      const fin = m[1] === '/';
      const nom = m[2].toLowerCase();
      if (nom === 'a') {
        if (fin) { if (lienOuvert) sortie += '</a>'; lienOuvert = false; continue; }
        const href = (/\shref\s*=\s*"([^"]*)"/i.exec(m[3]) || /\shref\s*=\s*'([^']*)'/i.exec(m[3]) || [])[1] || '';
        if (lienOuvert) sortie += '</a>';
        lienOuvert = /^(?:https?:|mailto:)/i.test(href.trim());
        if (lienOuvert) sortie += `<a href="${href.trim().replace(/"/g, '&quot;')}">`;
        continue;
      }
      if (nom === 'br' || (BALISES_BLOC_REDACTION[nom] && !/^(div|span)$/.test(nom)) || nom === 'li' || nom === 'tr') { if (!fin || nom === 'li' || nom === 'tr') sortie += '<br>'; continue; }
      if (nom === 'div' && !fin && sortie && !/<br>$/.test(sortie)) sortie += '<br>';
    }
    if (lienOuvert) sortie += '</a>';
    return sortie.replace(/^(<br>)+/, '').replace(/(<br>)+$/, '').replace(/(<br>){3,}/g, '<br><br>').replace(/ {2,}/g, ' ');
  }
  // Pure : un texte brut collé (adresse d'un lien copiée, texte avec des adresses dedans) → HTML pour la zone éditable.
  function htmlTexteColleRedaction(texte) {
    // Une espace en tête ou en fin du collage ne doit pas disparaître (le HTML l'avale) : elle devient insécable.
    return lierLiensTexte(escapeHtml(String(texte || '').replace(/\r/g, '')), '').replace(/\n/g, '<br>').replace(/^ /, '&nbsp;').replace(/ $/, '&nbsp;');
  }

  // Pure : HTML de la zone éditable pour un corps d'email en texte (une ligne par bloc, lignes vides gardées, marques de
  // mise en forme des textes de l'étude rendues en gras souligné, « {{BOUTONS}} » nommé).
  function htmlRedactionDepuisTexte(corps) {
    return String(corps == null ? '' : corps).replace(/\r/g, '').replace('{{BOUTONS}}', LIBELLE_BOUTONS_REDACTION).split('\n')
      .map(l => l === '' ? '<div><br></div>' : `<div>${marquesEnHtml(escapeHtml(l))}</div>`).join('');
  }

  // Pure : le HTML gardé de la zone éditable, avant de le remettre dans la zone (un nouveau rendu de la fenêtre) : seules
  // les balises que la zone produit, sans attribut (sauf le lien d'un <a>).
  function htmlEditeurSur(html) {
    return String(html || '').replace(/<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (t, fin, nom, attrs) => {
        const n = nom.toLowerCase();
        if (!/^(?:div|p|br|b|strong|i|em|u|ul|ol|li|a|span)$/.test(n)) return '';
        if (n === 'a' && !fin) {
          const href = (/\shref\s*=\s*"([^"]*)"/i.exec(attrs) || [])[1] || '';
          return /^(?:https?:|mailto:)/i.test(href.trim()) ? `<a href="${href.trim().replace(/"/g, '&quot;')}">` : '<a>';
        }
        return `<${fin}${n}>`;
      });
  }

  var BALISES_EN_LIGNE_REDACTION = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', a: 'a' };
  var BALISES_BLOC_REDACTION = { div: 1, p: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, blockquote: 1, pre: 1, section: 1, article: 1 };

  // Pure : texte visible d'un morceau de HTML (balises retirées, entités courantes décodées).
  function texteDeHtmlRedaction(html) {
    return String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  }

  // Pure : le HTML de la zone éditable → le corps de l'email (paragraphes, listes, boutons du sondage à leur place).
  // Seuls gras, italique, souligné, liens http(s)/mailto et listes sont gardés ; tout autre élément ne laisse que son texte
  // (le contenu d'un script ou d'un style est jeté). Une balise ouverte sur plusieurs lignes est refermée et rouverte à
  // chaque ligne pour que chaque paragraphe reste équilibré.
  function htmlCorpsDepuisEditeur(html, boutons) {
    const blocs = [];          // { type: 'ligne', html } | { type: 'vide' } | { type: 'liste', ordonnee, items: [] }
    const ouvertes = [];       // balises en ligne ouvertes : [{ nom, ouverture }]
    let ligne = '';
    let liste = null;
    let item = null;
    let ignorer = 0;
    const fermer = () => ouvertes.slice().reverse().map(o => `</${o.nom}>`).join('');
    const rouvrir = () => ouvertes.map(o => o.ouverture).join('');
    const ajouter = (morceau) => { if (item != null) item += morceau; else ligne += morceau; };
    const finirLigne = (forcer) => {
      if (item != null) return;
      const contenu = texteDeHtmlRedaction(ligne).trim();
      // « … cliquez ici : https://… » (questionnaire de satisfaction) : le lien sur les mots, comme dans htmlEmail.
      if (contenu && !ouvertes.length && !/<(?!\/?a[\s>])/.test(ligne) && /cliquez ici[^:]*?:\s*https?:\/\/\S+$/i.test(contenu)) blocs.push({ type: 'ligne', html: ligneHtmlEmail(contenu) });
      else if (contenu) blocs.push({ type: 'ligne', html: ligne + fermer() });
      else if (forcer) blocs.push({ type: 'vide' });
      ligne = rouvrir();
    };
    const finirItem = () => {
      if (item == null) return;
      if (texteDeHtmlRedaction(item).trim() && liste) liste.items.push(item + fermer());
      item = null;
    };
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g;
    let m;
    while ((m = re.exec(String(html || '')))) {
      if (m[4] != null) {
        if (ignorer) continue;
        const texte = m[4].replace(/>/g, '&gt;');
        const dansLien = ouvertes.some(o => o.nom === 'a');
        ajouter(dansLien ? texte : lierLiensTexte(texte, `color:${COULEUR_EMAIL_OFFICE};`));
        continue;
      }
      const fin = m[1] === '/';
      const nom = m[2].toLowerCase();
      if (nom === 'script' || nom === 'style' || nom === 'title' || nom === 'head') { ignorer += fin ? -1 : 1; if (ignorer < 0) ignorer = 0; continue; }
      if (ignorer) continue;
      if (nom === 'br') {
        if (item != null) item += '<br>';
        else { finirLigne(true); }
        continue;
      }
      if (nom === 'ul' || nom === 'ol') {
        if (!fin) {
          finirLigne(false);
          liste = { type: 'liste', ordonnee: nom === 'ol', items: [] };
          blocs.push(liste);
        } else { finirItem(); liste = null; ligne = rouvrir(); }
        continue;
      }
      if (nom === 'li') {
        if (!fin) { finirItem(); if (!liste) { liste = { type: 'liste', ordonnee: false, items: [] }; blocs.push(liste); } item = rouvrir(); }
        else finirItem();
        continue;
      }
      if (BALISES_BLOC_REDACTION[nom]) {
        if (item != null) { if (!fin && texteDeHtmlRedaction(item).trim()) item += '<br>'; continue; }
        finirLigne(false);
        continue;
      }
      const balise = BALISES_EN_LIGNE_REDACTION[nom];
      if (!balise) continue;
      if (fin) {
        const i = ouvertes.map(o => o.nom).lastIndexOf(balise);
        if (i === -1) continue;
        const fermees = ouvertes.splice(i);
        ajouter(fermees.slice().reverse().map(o => `</${o.nom}>`).join('') + fermees.slice(1).map(o => o.ouverture).join(''));
        ouvertes.push(...fermees.slice(1));
        continue;
      }
      let ouverture = `<${balise}>`;
      if (balise === 'a') {
        const href = (/\shref\s*=\s*"([^"]*)"/i.exec(m[3]) || /\shref\s*=\s*'([^']*)'/i.exec(m[3]) || [])[1] || '';
        if (!/^(?:https?:|mailto:)/i.test(href.trim())) continue;
        ouverture = `<a href="${href.trim().replace(/"/g, '&quot;')}" style="color:${COULEUR_EMAIL_OFFICE};">`;
      }
      ouvertes.push({ nom: balise, ouverture });
      ajouter(ouverture);
    }
    finirItem();
    finirLigne(false);

    // Paragraphes : lignes consécutives jointes, une ligne vide les sépare.
    const sortie = [];
    let paragraphe = [];
    const finirParagraphe = () => {
      if (!paragraphe.length) return;
      const seul = paragraphe.length === 1 ? texteDeHtmlRedaction(paragraphe[0]).trim() : '';
      sortie.push(seul === LIBELLE_BOUTONS_REDACTION && boutons && boutons.length
        ? boutonsEmailHtml(boutons)
        : `<p style="margin:0 0 11pt;">${paragraphe.join('<br>')}</p>`);
      paragraphe = [];
    };
    for (const b of blocs) {
      if (b.type === 'ligne') paragraphe.push(b.html);
      else if (b.type === 'vide') finirParagraphe();
      else if (b.items.length) {
        finirParagraphe();
        const tag = b.ordonnee ? 'ol' : 'ul';
        sortie.push(`<${tag} style="margin:0 0 11pt;padding-left:24pt;">${b.items.map(it => `<li style="margin:0 0 4pt;">${it}</li>`).join('')}</${tag}>`);
      }
    }
    finirParagraphe();
    return sortie.join('');
  }

  // ---- Barre d'outils ----
  var OUTILS_REDACTION = [
    { commande: 'bold', titre: 'Gras (Ctrl+B)', contenu: '<b>G</b>' },
    { commande: 'italic', titre: 'Italique (Ctrl+I)', contenu: '<i>I</i>' },
    { commande: 'underline', titre: 'Souligné (Ctrl+U)', contenu: '<u>S</u>' },
    { commande: 'insertUnorderedList', titre: 'Liste à puces', icone: 'liste-puces' },
    { commande: 'insertOrderedList', titre: 'Liste numérotée', icone: 'liste-numeros' },
    { commande: 'removeFormat', titre: 'Effacer la mise en forme', icone: 'effacer-format' }
  ];
  function renderOutilsRedaction() {
    return `<div class="redaction-outils" role="toolbar" aria-label="Mise en forme">${OUTILS_REDACTION.map(o =>
      `<wa-button appearance="plain" size="s" type="button" class="bouton-icone redaction-outil" data-commande="${o.commande}" onmousedown="event.preventDefault()" onclick="formaterRedaction('${o.commande}')" title="${escapeAttr(o.titre)}" aria-label="${escapeAttr(o.titre)}">${o.icone ? icone(o.icone) : `<span class="redaction-outil-lettre">${o.contenu}</span>`}</wa-button>`).join('')}</div>`;
  }

  // Dernière sélection dans la zone éditable : un clic sur la barre d'outils ne doit pas la perdre.
  let selectionRedaction = null;
  function zoneEditeurRedaction() { return typeof document !== 'undefined' ? document.getElementById('redaction-texte') : null; }
  function retenirSelectionRedaction() {
    const z = zoneEditeurRedaction();
    const s = window.getSelection && window.getSelection();
    if (z && s && s.rangeCount && z.contains(s.getRangeAt(0).commonAncestorContainer)) selectionRedaction = s.getRangeAt(0).cloneRange();
  }
  document.addEventListener('selectionchange', () => { if (redaction) retenirSelectionRedaction(); });

  function remettreSelectionRedaction() {
    const z = zoneEditeurRedaction();
    if (!z) return null;
    z.focus();
    const s = window.getSelection();
    if (selectionRedaction && z.contains(selectionRedaction.commonAncestorContainer)) { s.removeAllRanges(); s.addRange(selectionRedaction); }
    return z;
  }

  function formaterRedaction(commande) {
    if (!redaction || !OUTILS_REDACTION.some(o => o.commande === commande)) return;
    const z = remettreSelectionRedaction();
    if (!z) return;
    try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* navigateur sans ce réglage */ }
    document.execCommand(commande, false, null);
    saisieRedaction(z);
    majOutilsRedaction();
  }

  // Boutons actifs selon la mise en forme sous le curseur.
  function majOutilsRedaction() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.redaction-outil').forEach(b => {
      let actif = false;
      try { actif = document.queryCommandState(b.dataset.commande); } catch (e) { actif = false; }
      b.classList.toggle('actif', !!actif && b.dataset.commande !== 'removeFormat');
    });
  }
  document.addEventListener('selectionchange', () => { if (redaction) majOutilsRedaction(); });

  // Saisie : le HTML et le texte visible sont gardés (le texte sert aux contrôles avant l'envoi : message vide, « [à compléter] »).
  function saisieRedaction(el) {
    if (!redaction || !el) return;
    redaction.html = el.innerHTML;
    redaction.texte = el.innerText.replace(/\n$/, '');
    majBoutonsRedaction();
  }

  // Le texte de la zone remplacé par CLAIRE (modèle, proposition de l'IA) : le HTML suit.
  function poserTexteRedaction(r, corps) {
    r.html = htmlRedactionDepuisTexte(corps);
    r.htmlDepart = r.html;
  }

  // ---- Pièces jointes collées ou déposées ----
  // Pure : nom d'une capture collée (le presse-papiers la nomme « image.png »).
  function nomPieceCollee(nom, type, maintenant) {
    const n = String(nom || '');
    if (n && !/^image\.(?:png|jpe?g|gif|webp|bmp)$/i.test(n)) return n;
    const d = maintenant || new Date();
    const deux = (x) => String(x).padStart(2, '0');
    const ext = (/^image\/(png|jpeg|gif|webp|bmp)$/.exec(String(type || '')) || [])[1] || (n.split('.').pop() || 'png');
    return `Capture ${deux(d.getDate())}-${deux(d.getMonth() + 1)} ${deux(d.getHours())}h${deux(d.getMinutes())}${deux(d.getSeconds())}.${ext === 'jpeg' ? 'jpg' : ext}`;
  }

  async function ajouterFichiersRedaction(fichiers) {
    if (!redaction || !fichiers || !fichiers.length) return;
    const r = redaction;
    let ajoutes = 0;
    for (const f of [...fichiers]) {
      if (!f || (f.size === 0 && !f.type)) continue; // un dossier glissé n'est pas un fichier
      try {
        const contenuBase64 = await blobVersBase64(f);
        if (redaction !== r) return;
        r.pieces.push({ nom: nomPieceCollee(f.name, f.type), type: f.type || 'application/octet-stream', contenuBase64 });
        ajoutes++;
      } catch (e) { afficherToast(`« ${f.name} » n’a pas pu être lu.`, 'OK', null); }
    }
    if (ajoutes && redaction === r) renderRedaction();
  }

  function collerRedaction(e) {
    const dt = e.clipboardData;
    if (!redaction || !dt) return;
    const fichiers = dt.files && dt.files.length ? [...dt.files] : [...(dt.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
    e.preventDefault();
    if (fichiers.length) { ajouterFichiersRedaction(fichiers); return; }
    const texte = dt.getData('text/plain');
    const html = dt.getData('text/html');
    // Un lien collé depuis un email, une page ou Word garde son adresse ; une adresse écrite en texte devient un lien.
    if (html && /<a\s/i.test(html)) { document.execCommand('insertHTML', false, htmlColleRedaction(html)); saisieRedaction(zoneEditeurRedaction()); return; }
    if (texte && RE_LIEN_TEXTE.test(texte)) { RE_LIEN_TEXTE.lastIndex = 0; document.execCommand('insertHTML', false, htmlTexteColleRedaction(texte)); saisieRedaction(zoneEditeurRedaction()); return; }
    RE_LIEN_TEXTE.lastIndex = 0;
    if (texte) document.execCommand('insertText', false, texte);
  }

  // À la frappe : l'adresse qu'on vient de taper (suivie d'un espace ou d'une Entrée) devient un lien, si elle n'en est pas déjà un.
  function toucheRedaction(e) {
    majOutilsRedaction();
    if (!e || (e.key !== ' ' && e.key !== 'Enter')) return;
    const el = zoneEditeurRedaction();
    if (el && lierAvantCurseur(el)) saisieRedaction(el);
  }
  function lierAvantCurseur(el) {
    const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    let noeud = sel.focusNode;
    let offset = sel.focusOffset;
    // Après Entrée, le curseur est au début du bloc suivant : on regarde la fin du texte du bloc précédent.
    if (noeud && noeud.nodeType !== 3) {
      const bloc = noeud.childNodes[offset - 1] || noeud.previousSibling;
      const texte = (n) => { let t = n; while (t && t.nodeType !== 3) t = t.lastChild; return t; };
      noeud = texte(bloc && bloc.nodeType === 3 ? bloc : (bloc && bloc.tagName !== 'BR' ? bloc : (bloc && bloc.previousSibling)));
      offset = noeud ? noeud.nodeValue.length : 0;
    }
    if (!noeud || noeud.nodeType !== 3 || !el.contains(noeud)) return false;
    if (noeud.parentNode && noeud.parentNode.closest && noeud.parentNode.closest('a')) return false;
    const avant = noeud.nodeValue.slice(0, offset);
    const m = /(\S+)\s?$/.exec(avant);
    if (!m) return false;
    const { lien } = separerLienTexte(m[1]);
    const href = hrefDepuisLienTexte(lien);
    if (!href) return false;
    const debut = m.index;
    const a = document.createElement('a');
    a.href = href;
    const suite = noeud.splitText(debut);
    suite.splitText(lien.length);
    a.appendChild(document.createTextNode(suite.nodeValue));
    suite.parentNode.replaceChild(a, suite);
    const r = document.createRange();
    const apres = a.nextSibling;
    if (apres && apres.nodeType === 3) r.setStart(apres, Math.min(apres.nodeValue.length, offset - debut - lien.length)); else r.setStartAfter(a);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    return true;
  }

  function fichiersGlisses(e) {
    return !!(e.dataTransfer && [...(e.dataTransfer.types || [])].indexOf('Files') !== -1);
  }
  function carteRedactionVisee(e) {
    if (!redaction || !e.target || !e.target.closest) return null;
    const carte = document.querySelector('.redaction-carte');
    if (!carte) return null;
    const fenetre = carte.closest('#email-redaction-overlay, #email-lecture-overlay') || carte;
    return fenetre.contains(e.target) ? carte : null;
  }
  // Toute la fenêtre d'email reçoit les fichiers (jamais le navigateur, qui ouvrirait le fichier à la place de CLAIRE).
  document.addEventListener('dragover', (e) => {
    const carte = carteRedactionVisee(e);
    if (!carte || !fichiersGlisses(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    carte.classList.add('redaction-depot');
  });
  document.addEventListener('dragleave', (e) => {
    const carte = document.querySelector('.redaction-carte.redaction-depot');
    if (carte && (!e.relatedTarget || !carte.closest('#email-redaction-overlay, #email-lecture-overlay') || !carte.closest('#email-redaction-overlay, #email-lecture-overlay').contains(e.relatedTarget))) carte.classList.remove('redaction-depot');
  });
  document.addEventListener('drop', (e) => {
    const carte = carteRedactionVisee(e);
    if (!carte) return;
    carte.classList.remove('redaction-depot');
    if (fichiersGlisses(e)) { e.preventDefault(); ajouterFichiersRedaction(e.dataTransfer.files); return; }
    // Un texte glissé d'une autre page entre en texte brut, à l'endroit du dépôt.
    const z = zoneEditeurRedaction();
    const texte = e.dataTransfer && e.dataTransfer.getData('text/plain');
    if (!z || !z.contains(e.target)) return;
    e.preventDefault();
    if (!texte) return;
    const pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    z.focus();
    if (pos) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(pos); }
    document.execCommand('insertText', false, texte);
  });
