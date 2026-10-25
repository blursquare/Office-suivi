  // ---- « Demander à CLAIRE » : pièces jointes (étude 13/10 : « oui ajoute les pièces jointes ») ----
  // Un PDF ou une image joint au message — trombone, glisser-déposer sur la page, Ctrl+V d'un fichier ou d'une capture. Le fichier
  // reste sur le POSTE : l'agent reçoit seulement un identifiant (« pj1 ») et le lit par lire_document — texte du PDF, ou
  // reconnaissance de caractères pour une image ou un scan —, texte MASQUÉ par le serveur comme tout résultat d'outil. Le nom du
  // fichier ne part jamais (il peut porter un nom de client). Rien n'est gardé : les pièces sont oubliées avec la conversation.

  var MAX_PIECES_JOINTES_ASSISTANT = 5;
  var MAX_OCTETS_PIECE_JOINTE_ASSISTANT = 25 * 1024 * 1024;
  var piecesJointesAssistant = [];          // en attente d'envoi : [{ id, nom, sorte: 'pdf' | 'image', fichier }]
  var compteurPiecesJointesAssistant = 0;

  // Pure : la sorte d'un fichier joint ('pdf', 'image') ou '' s'il n'est pas lisible ici.
  function sortePieceJointeAssistant(nom, type) {
    const n = String(nom || '').toLowerCase();
    const t = String(type || '').toLowerCase();
    if (t === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
    if (/^image\/(png|jpe?g|webp|bmp|gif)$/.test(t) || /\.(png|jpe?g|webp|bmp|gif)$/.test(n)) return 'image';
    return '';
  }

  // Pure : la phrase ajoutée au message pour l'agent — les identifiants et la sorte seulement, jamais le nom du fichier.
  function mentionPiecesJointesAgent(pieces) {
    if (!pieces || !pieces.length) return '';
    return '\n\n(Pièces jointes à ce message, à lire avec lire_document : ' + pieces.map(p => `${p.id} — ${p.sorte === 'pdf' ? 'PDF' : 'image'}`).join(' ; ') + '.)';
  }

  function ajouterPiecesJointesAssistant(fichiers) {
    const refus = [];
    Array.from(fichiers || []).forEach(f => {
      const sorte = sortePieceJointeAssistant(f.name, f.type);
      if (!sorte) { refus.push(`${f.name || 'fichier'} : seuls les PDF et les images se lisent`); return; }
      if (f.size > MAX_OCTETS_PIECE_JOINTE_ASSISTANT) { refus.push(`${f.name} : plus de 25 Mo`); return; }
      if (piecesJointesAssistant.length >= MAX_PIECES_JOINTES_ASSISTANT) { refus.push(`${f.name} : ${MAX_PIECES_JOINTES_ASSISTANT} pièces au plus par message`); return; }
      compteurPiecesJointesAssistant += 1;
      piecesJointesAssistant.push({ id: 'pj' + compteurPiecesJointesAssistant, nom: f.name || (sorte === 'image' ? 'Capture' : 'Document'), sorte, fichier: f });
    });
    if (refus.length) afficherToast('Pièce non jointe — ' + refus.join(' ; '), 'OK', null);
    renderPiecesJointesAssistant();
    const champ = document.getElementById('assistant-saisie');
    if (champ) champ.focus();
  }

  function retirerPieceJointeAssistant(id) {
    piecesJointesAssistant = piecesJointesAssistant.filter(p => p.id !== id);
    renderPiecesJointesAssistant();
  }

  function htmlPuceJointeAssistant(p, retirable) {
    return `<span class="asst-pj">${icone(p.sorte === 'pdf' ? 'file-text' : 'paperclip')}<span class="asst-pj-nom">${escapeHtml(p.nom)}</span>${retirable
      ? `<wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="retirerPieceJointeAssistant('${escapeOnclickArg(p.id)}')" title="Retirer" aria-label="Retirer ${escapeAttr(p.nom)}">${icone('x')}</wa-button>` : ''}</span>`;
  }

  function renderPiecesJointesAssistant() {
    const zone = document.getElementById('assistant-pieces');
    if (!zone) return;
    zone.innerHTML = piecesJointesAssistant.map(p => htmlPuceJointeAssistant(p, true)).join('');
    zone.style.display = piecesJointesAssistant.length ? '' : 'none';
  }

  // Les pièces en attente partent avec le message : connues de l'agent (documentsAgentConnus) et vidées de la saisie.
  function prendrePiecesJointesAssistant() {
    const pieces = piecesJointesAssistant;
    piecesJointesAssistant = [];
    renderPiecesJointesAssistant();
    pieces.forEach(p => { documentsAgentConnus[p.id] = { sorte: 'joint', libelle: 'Pièce jointe', sortePiece: p.sorte, fichier: p.fichier, nom: p.nom, taille: p.fichier && p.fichier.size || 0 }; });
    return pieces;
  }

  function choisirPiecesJointesAssistant() {
    const champ = document.getElementById('assistant-fichiers');
    if (champ) { champ.value = ''; champ.click(); }
  }

  // Glisser-déposer sur la page, et Ctrl+V d'un fichier ou d'une capture dans la saisie (le texte collé reste du texte).
  function initPiecesJointesAssistant() {
    const page = document.getElementById('onglet-assistant');
    if (!page || page.dataset.piecesJointes) return;
    page.dataset.piecesJointes = '1';
    const avecFichiers = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    page.addEventListener('dragover', (e) => { if (!avecFichiers(e)) return; e.preventDefault(); page.classList.add('asst-depot'); });
    page.addEventListener('dragleave', (e) => { if (!page.contains(e.relatedTarget)) page.classList.remove('asst-depot'); });
    page.addEventListener('drop', (e) => {
      page.classList.remove('asst-depot');
      if (!avecFichiers(e)) return;
      e.preventDefault();
      ajouterPiecesJointesAssistant(e.dataTransfer.files);
    });
    const champ = document.getElementById('assistant-saisie');
    if (champ) champ.addEventListener('paste', (e) => {
      const fichiers = e.clipboardData ? Array.from(e.clipboardData.files || []) : [];
      if (!fichiers.length) return;
      e.preventDefault();
      ajouterPiecesJointesAssistant(fichiers.map((f, i) => (f.name && f.name !== 'image.png') ? f
        : new File([f], `Capture ${new Date().toLocaleTimeString('fr-FR').replace(/:/g, 'h')}${i ? ' (' + (i + 1) + ')' : ''}.png`, { type: f.type || 'image/png' })));
    });
  }

  // Une image jointe, lue par reconnaissance de caractères (même moteur que les scans).
  async function lireImageJointeAgent(fichier) {
    const worker = await creerWorkerOcr();
    if (!worker) return { erreur: 'reconnaissance de caractères indisponible sur ce poste (bibliothèque en ligne injoignable)' };
    try {
      const r = await Promise.race([worker.recognize(fichier), new Promise(resolve => setTimeout(() => resolve(null), 60000))]);
      if (!r) return { erreur: 'lecture de l’image trop longue (plus d’une minute) : texte non lu' };
      const texte = String((r && r.data && r.data.text) || '').trim().slice(0, MAX_CARACTERES_LECTURE_AGENT);
      return { pages_total: 1, pages_lues: '1-1', pages: [{ page: 1, lue_par_ocr: true, texte: texte || '(image sans texte lisible)' }] };
    } finally { try { await worker.terminate(); } catch (e) { /* déjà arrêté */ } }
  }

  // ---- Aperçu d'une pièce jointe dans la conversation, comme sur Slack (étude 25/10) ----
  // Le message porte une CARTE : vignette (l'image elle-même, ou la première page d'un PDF), nom, sorte et taille. Un clic ouvre la
  // visionneuse : l'image en grand, ou toutes les pages du PDF (30 au plus), avec « Ouvrir dans un onglet » et « Télécharger ».
  // Le fichier est GARDÉ SUR LE SERVEUR du bureau 90 jours (étude 25/10 : « je veux pouvoir revenir dessus plus tard », y compris dans un
  // canal partagé) : la carte porte son identifiant, et rouvre le fichier même après une reprise de la conversation ou sur un autre poste.
  var MAX_PAGES_APERCU_PIECE_JOINTE = 30;
  var apercuPieceJointeOuvert = null;     // { id, jeton } tant que la visionneuse est ouverte
  var vignettesServeurPiecesJointes = {};  // identifiant serveur → { url, pages } (en mémoire de la fenêtre)

  // Pure : « PDF · 2,4 Mo » / « Image · 850 Ko ».
  function legendePieceJointeAssistant(sorte, octets) {
    const n = Number(octets) || 0;
    const taille = n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : n ? `${Math.max(1, Math.round(n / 1024))} Ko` : '';
    return [sorte === 'pdf' ? 'PDF' : 'Image', taille].filter(Boolean).join(' · ');
  }

  // Dépose les pièces d'un message sur le serveur (une par une) : `serveurId` est posé sur chacune ; un échec est dit une fois, la
  // pièce reste lisible sur ce poste seulement.
  async function televerserPiecesJointesAssistant(pieces) {
    let echec = '';
    for (const p of (pieces || [])) {
      try {
        const r = await fetchAvecAuth('/api/pieces-jointes', { method: 'POST', body: p.fichier,
          headers: { 'Content-Type': 'application/octet-stream', 'X-Nom': encodeURIComponent(p.nom || ''), 'X-Auteur': encodeURIComponent(typeof utilisateurPoste === 'string' ? utilisateurPoste : '') } });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok && j.id) p.serveurId = j.id; else echec = j.erreur || `HTTP ${r.status}`;
      } catch (e) { echec = 'le serveur n’a pas répondu'; }
    }
    if (echec) afficherToast('Pièce non gardée sur le serveur (' + echec + ') : elle ne s’ouvrira que depuis ce poste.', 'OK', null);
    noterVerificationPoste('assistant-pieces-jointes-serveur', echec ? { ok: false, message: 'dépôt impossible' } : { detail: 'pièce jointe gardée sur le serveur' });
    return pieces;
  }

  // La carte d'une pièce jointe. `p` : { id (local, peut être ''), serveurId, nom, sorte, taille } — une pièce d'un canal n'a que
  // `serveurId`.
  function htmlCartePieceJointeAssistant(p) {
    const taille = p.taille || (p.fichier && p.fichier.size) || 0;
    return `<button type="button" class="asst-pj-carte" onclick="ouvrirApercuPieceJointe('${escapeOnclickArg(p.id || '')}', '${escapeOnclickArg(p.serveurId || '')}')" title="Voir ${escapeAttr(p.nom)}">
        <span class="asst-pj-vignette" data-pj="${escapeAttr(p.id || '')}" data-serveur="${escapeAttr(p.serveurId || '')}" data-sorte="${escapeAttr(p.sorte)}" aria-hidden="true">${icone(p.sorte === 'pdf' ? 'file-text' : 'paperclip')}</span>
        <span class="asst-pj-infos"><span class="asst-pj-titre">${escapeHtml(p.nom)}</span><span class="asst-pj-legende">${escapeHtml(legendePieceJointeAssistant(p.sorte, taille))}</span></span>
      </button>`;
  }

  function urlPieceJointeAssistant(doc) {
    if (!doc.urlObjet && doc.fichier && typeof URL !== 'undefined' && URL.createObjectURL) doc.urlObjet = URL.createObjectURL(doc.fichier);
    return doc.urlObjet || '';
  }

  // Ce qu'il faut pour montrer une pièce : le fichier de ce poste s'il y est encore, sinon celui du serveur. null = introuvable.
  async function ressourcePieceJointeAssistant(idLocal, idServeur) {
    const doc = idLocal ? documentsAgentConnus[idLocal] : null;
    if (doc && doc.sorte === 'joint' && doc.fichier) {
      return { sorte: doc.sortePiece, nom: doc.nom || 'Pièce jointe', taille: doc.taille || doc.fichier.size || 0, url: urlPieceJointeAssistant(doc), tampon: () => doc.fichier.arrayBuffer() };
    }
    if (!idServeur) return null;
    const rm = await fetchAvecAuth('/api/pieces-jointes/' + encodeURIComponent(idServeur));
    if (!rm.ok) return null;
    const m = await rm.json();
    const url = '/api/pieces-jointes/' + encodeURIComponent(idServeur) + '/fichier';
    return { sorte: m.sorte, nom: m.nom, taille: m.taille, url, tampon: async () => (await fetchAvecAuth(url)).arrayBuffer() };
  }

  async function lirePdfPieceJointeAssistant(tampon) {
    return pdfjsLib.getDocument({ isEvalSupported: false, data: await tampon(), verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
  }

  // Remplit les vignettes des cartes affichées (appelée à la fin de chaque dessin de la conversation) : l'image, ou la page 1 d'un PDF.
  async function remplirVignettesPiecesJointesAssistant() {
    const zone = document.getElementById('assistant-messages');
    if (!zone) return;
    for (const el of Array.from(zone.querySelectorAll('.asst-pj-vignette[data-sorte]:not(.avec-image)'))) {
      const idLocal = el.dataset.pj || '';
      const idServeur = el.dataset.serveur || '';
      if (!idLocal && !idServeur) continue;
      try {
        if (el.dataset.sorte === 'image') {
          const doc = idLocal ? documentsAgentConnus[idLocal] : null;
          const url = doc && doc.fichier ? urlPieceJointeAssistant(doc) : (idServeur ? '/api/pieces-jointes/' + encodeURIComponent(idServeur) + '/fichier' : '');
          if (url) { el.innerHTML = `<img src="${escapeAttr(url)}" alt="" loading="lazy">`; el.classList.add('avec-image'); }
        } else if (typeof pdfjsLib !== 'undefined') {
          const cle = idServeur || idLocal;
          let v = vignettesServeurPiecesJointes[cle];
          if (!v) {
            const r = await ressourcePieceJointeAssistant(idLocal, idServeur);
            if (!r) continue;
            const pdf = await lirePdfPieceJointeAssistant(r.tampon);
            v = { url: await imagePagePdf(pdf, 1, 360, 0.8), pages: pdf.numPages };
            try { pdf.destroy(); } catch (e) { /* déjà libéré */ }
            vignettesServeurPiecesJointes[cle] = v;
          }
          el.innerHTML = `<img src="${v.url}" alt="">`;
          el.classList.add('avec-image');
          const legende = el.closest('.asst-pj-carte') && el.closest('.asst-pj-carte').querySelector('.asst-pj-legende');
          if (legende && v.pages) legende.textContent = `${legende.textContent.split(' · ').slice(0, 2).join(' · ')} · ${v.pages} page${v.pages > 1 ? 's' : ''}`;
          noterVerificationPoste('assistant-apercu-piece-jointe', { detail: 'vignette de PDF' });
        }
      } catch (e) { if (el.dataset.sorte === 'pdf') noterVerificationPoste('assistant-apercu-piece-jointe', { ok: false, message: 'vignette de PDF impossible' }); }
    }
  }

  async function ouvrirApercuPieceJointe(idLocal, idServeur) {
    let overlay = document.getElementById('pj-apercu-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pj-apercu-overlay';
      overlay.className = 'scan-apercu-overlay';
      overlay.addEventListener('click', (e) => { if (clicSurFond(e)) fermerApercuPieceJointe(); });
      document.body.appendChild(overlay);
    }
    const jeton = {};
    apercuPieceJointeOuvert = { id: idLocal || idServeur, jeton };
    overlay.innerHTML = `<div class="scan-apercu" role="dialog" aria-modal="true" aria-labelledby="pj-apercu-titre">
        <header class="scan-apercu-tete">
          <div class="scan-apercu-titres"><h2 id="pj-apercu-titre">Pièce jointe</h2><div class="scan-apercu-meta"><span id="pj-apercu-meta"></span></div></div>
          <span id="pj-apercu-actions"></span>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="fermerApercuPieceJointe()" aria-label="Fermer l’aperçu">${icone('x')}</wa-button>
        </header>
        <div class="scan-apercu-corps" id="pj-apercu-corps"><p class="hint scan-etat">${icone('spinner', null, true)} Chargement…</p></div>
      </div>`;
    overlay.style.display = 'flex';
    const corps = document.getElementById('pj-apercu-corps');
    const actif = () => apercuPieceJointeOuvert && apercuPieceJointeOuvert.jeton === jeton;
    try {
      const r = await ressourcePieceJointeAssistant(idLocal, idServeur);
      if (!actif()) return;
      if (!r) throw new Error('Cette pièce jointe n’est plus disponible : les fichiers sont gardés 90 jours sur le serveur.');
      document.getElementById('pj-apercu-titre').textContent = r.nom;
      document.getElementById('pj-apercu-meta').textContent = legendePieceJointeAssistant(r.sorte, r.taille);
      document.getElementById('pj-apercu-actions').innerHTML = `<a class="bouton-icone icon-btn" href="${escapeAttr(r.url)}" target="_blank" rel="noopener" title="Ouvrir dans un onglet" aria-label="Ouvrir dans un onglet">${icone('maximize')}</a>
          <a class="bouton-icone icon-btn" href="${escapeAttr(r.url)}" download="${escapeAttr(r.nom)}" title="Télécharger" aria-label="Télécharger">${icone('download')}</a>`;
      if (r.sorte === 'image') {
        corps.innerHTML = `<figure class="scan-apercu-page"><img src="${escapeAttr(r.url)}" alt="${escapeAttr(r.nom)}"></figure>`;
        return;
      }
      if (typeof pdfjsLib === 'undefined') throw new Error('Lecteur PDF indisponible : ouvrez le fichier dans un onglet.');
      const pdf = await lirePdfPieceJointeAssistant(r.tampon);
      if (!actif()) return;
      const total = pdf.numPages;
      document.getElementById('pj-apercu-meta').textContent = `${legendePieceJointeAssistant('pdf', r.taille)} · ${total} page${total > 1 ? 's' : ''}`;
      corps.innerHTML = '';
      const largeur = Math.min(1600, Math.round(Math.max(320, corps.clientWidth - 32) * (window.devicePixelRatio || 1)));
      for (let n = 1; n <= Math.min(total, MAX_PAGES_APERCU_PIECE_JOINTE); n++) {
        const img = await imagePagePdf(pdf, n, largeur, 0.85);
        if (!actif()) return;
        const fig = document.createElement('figure');
        fig.className = 'scan-apercu-page';
        fig.innerHTML = `<img src="${img}" alt="Page ${n}"><figcaption>Page ${n} / ${total}</figcaption>`;
        corps.appendChild(fig);
      }
      if (total > MAX_PAGES_APERCU_PIECE_JOINTE) corps.insertAdjacentHTML('beforeend', `<p class="hint scan-etat">${total - MAX_PAGES_APERCU_PIECE_JOINTE} pages de plus : ouvrez le fichier dans un onglet.</p>`);
    } catch (e) {
      if (actif()) corps.innerHTML = `<p class="hint scan-etat">${icone('alert-triangle')} ${escapeHtml(e.message || 'Aperçu impossible.')}</p>`;
    }
  }

  function fermerApercuPieceJointe() {
    apercuPieceJointeOuvert = null;
    const overlay = document.getElementById('pj-apercu-overlay');
    if (overlay) { overlay.style.display = 'none'; overlay.innerHTML = ''; }
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && apercuPieceJointeOuvert) { e.stopPropagation(); fermerApercuPieceJointe(); } }, true);
  }
