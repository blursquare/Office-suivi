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
    pieces.forEach(p => { documentsAgentConnus[p.id] = { sorte: 'joint', libelle: 'Pièce jointe', sortePiece: p.sorte, fichier: p.fichier }; });
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
