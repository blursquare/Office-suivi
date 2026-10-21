  // ---- « Demander à CLAIRE » : la colonne de droite, comme Claude (étude 18/10 : « crée à droite de Demander à CLAIRE une sidebar
  // pour voir les documents uploadés et un aperçu du PDF pour retrouver les pages citées ; construis ça comme un Claude avec ses
  // options à droite » ; options choisies : dossier rattaché, modèle et réflexion, étapes du travail) ----
  // Rien ne part d'ici : la colonne montre ce que le poste sait déjà (pièces jointes, documents lus par l'agent, documents produits,
  // dossiers) ; l'aperçu lit le PDF sur ce poste (pdf.js), comme la lecture de l'agent, et surligne la citation (client/48).

  var MODELES_COLONNE_ASSISTANT = [
    { valeur: '', libelle: 'Celui des Réglages' },
    { valeur: 'claude-opus-5-5', libelle: 'Claude Opus 5.5 — le plus fin' },
    { valeur: 'claude-sonnet-5-5', libelle: 'Claude Sonnet 5.5 — équilibré' },
    { valeur: 'claude-haiku-5-5', libelle: 'Claude Haiku 5.5 — rapide, économique' }
  ];
  var EFFORTS_COLONNE_ASSISTANT = [
    { valeur: 'low', libelle: 'Rapide' },
    { valeur: 'medium', libelle: 'Normale' },
    { valeur: 'high', libelle: 'Approfondie' }
  ];
  var CLE_COLONNE_ASSISTANT = 'claire-assistant-colonne';
  var blocsOuvertsColonneAssistant = { etapes: true, documents: true, dossier: true, confidentialite: true };
  var colonneAssistant = { ouverte: colonneAssistantOuverte(), etapes: [], journal: [], lus: {}, modele: '', effort: 'medium', anonymiser: true, apercu: null, docsDossier: null };
  var pdfApercuAssistant = null;          // { docId, pdf } : le PDF de l'aperçu, gardé pour feuilleter
  var blocApercuAssistant = null;         // la page dessinée et son surlignage : un élément gardé, replacé à chaque rendu de la colonne

  function blocApercu() {
    if (!blocApercuAssistant) { blocApercuAssistant = document.createElement('div'); blocApercuAssistant.className = 'asst-apercu-page'; }
    return blocApercuAssistant;
  }

  // Ouverte par défaut sur un grand écran ; sous 1 280 px, elle couvrirait la conversation : fermée au départ.
  function colonneAssistantOuverte() {
    if (typeof window !== 'undefined' && window.innerWidth && window.innerWidth <= 1280) return false;
    try { const v = localStorage.getItem(CLE_COLONNE_ASSISTANT); return v === null ? true : v === '1'; } catch (e) { return true; }
  }

  function basculerColonneAssistant() {
    colonneAssistant.ouverte = !document.querySelector('.asst-page.colonne-ouverte');
    ecrireLocal(CLE_COLONNE_ASSISTANT, colonneAssistant.ouverte ? '1' : '0');
    renderColonneAssistant();
  }

  // Une nouvelle conversation repart sans étapes ni aperçu ; le modèle et la réflexion choisis restent ceux du poste.
  function reinitialiserColonneAssistant() {
    // L'anonymisation désactivée ne dure que le temps d'une conversation.
    colonneAssistant.anonymiser = true;
    colonneAssistant.etapes = [];
    colonneAssistant.journal = [];
    colonneAssistant.lus = {};
    colonneAssistant.apercu = null;
    colonneAssistant.docsDossier = null;
    reinitialiserArtefactsAssistant();
    if (pdfApercuAssistant) pdfApercuAssistant.promesse.then(pdf => { try { pdf.destroy(); } catch (e) { /* déjà libéré */ } }).catch(() => {});
    pdfApercuAssistant = null;
    if (blocApercuAssistant) blocApercuAssistant.innerHTML = '';
    renderColonneAssistant();
  }

  // Ce que l'appel à l'agent emporte de la colonne : modèle et réflexion, et les échanges gardés ici pour une reprise.
  function reglagesColonneAgent() {
    return {
      ...(colonneAssistant.modele ? { modele: colonneAssistant.modele } : {}),
      effort: colonneAssistant.effort || 'medium',
      anonymiser: colonneAssistant.anonymiser !== false,
      historique: (assistantContexte.echanges || []).map(e => ({ role: e.role === 'claire' ? 'claire' : 'moi', texte: e.texte || '' }))
    };
  }

  // ---- Étapes ----

  // Outil plan_de_travail : le plan que l'agent annonce, mis à jour au fil du travail. Pure sur l'entrée, puis affichage.
  function etapesPlanDepuisEntree(entree) {
    return (entree && Array.isArray(entree.etapes) ? entree.etapes : []).slice(0, 8)
      .map(e => ({ texte: String((e && e.texte) || '').replace(/\[(?:NOM|EMAIL|TEL|REF|NUM|MONTANT)\d+\]/g, '…').slice(0, 140),
        etat: ['a_faire', 'en_cours', 'fait'].includes(e && e.etat) ? e.etat : 'a_faire' }))
      .filter(e => e.texte);
  }

  function planTravailAgent(entree) {
    colonneAssistant.etapes = etapesPlanDepuisEntree(entree);
    renderColonneAssistant();
    return { ok: true, affiche: colonneAssistant.etapes.length };
  }

  // Chaque outil lancé par l'agent : une ligne du journal (« Je lis le document… »), cochée une fois fini.
  function noterOutilColonneAssistant(id, libelle, fini) {
    const l = colonneAssistant.journal.find(x => x.id === id);
    if (l) l.fini = !!fini;
    else colonneAssistant.journal.push({ id, libelle: String(libelle || 'Je réfléchis…').replace(/…$/, ''), fini: !!fini });
    if (colonneAssistant.journal.length > 40) colonneAssistant.journal = colonneAssistant.journal.slice(-40);
    renderColonneAssistant();
  }

  function noterDocumentLuAssistant(documentId, pages) {
    if (!documentId) return;
    colonneAssistant.lus[documentId] = pages || colonneAssistant.lus[documentId] || '';
    renderColonneAssistant();
  }

  // ---- Documents ----

  // Pure : les documents de la conversation — pièces jointes, documents lus par l'agent, du plus récent au plus ancien.
  function documentsColonneAssistant(connus, lus) {
    return Object.keys(connus || {}).filter(id => connus[id] && (connus[id].sorte === 'joint' || Object.prototype.hasOwnProperty.call(lus || {}, id)))
      .map(id => ({ id, libelle: String(connus[id].libelle || connus[id].nom || id), joint: connus[id].sorte === 'joint', pages: (lus || {})[id] || '',
        image: connus[id].sorte === 'joint' && connus[id].sortePiece === 'image' }))
      .reverse();
  }

  // Pure : les citations d'une réponse de l'agent — « extrait » [doc3 p. 12] ou [pj1 p. 2] seul — rendues cliquables. Le texte est
  // déjà échappé : les guillemets « » et les crochets y sont tels quels.
  function citationsCliquablesAssistant(htmlEchappe) {
    const bouton = (doc, page, extrait) => `<button type="button" class="asst-cite" data-doc="${escapeAttr(doc)}" data-page="${escapeAttr(page)}" data-extrait="${extrait ? escapeAttr(extrait) : ''}" onclick="ouvrirCitationAssistant(this)" title="Voir la page${extrait ? ' et le passage surligné' : ''}">${escapeHtml(doc)} · p. ${escapeHtml(page)}</button>`;
    // Un seul passage (relecture 0.282.0 : un second remplacement repassait dans l'attribut d'un bouton déjà posé) ; un passage cité
    // ne contient jamais de crochet.
    return String(htmlEchappe || '').replace(/«\s?([^«»[\]]{3,600}?)\s?»\s*\[((?:doc|pj)\d{1,4})\s*[,·]?\s*p\.?\s*(\d{1,4})\]|\[((?:doc|pj)\d{1,4})\s*[,·]?\s*p\.?\s*(\d{1,4})\]/g,
      (m, extrait, doc, page, docSeul, pageSeule) => (extrait ? `«&nbsp;${extrait}&nbsp;» ${bouton(doc, page, extrait.replace(/<[^>]*>/g, ''))}` : bouton(docSeul, pageSeule, '')));
  }

  function ouvrirCitationAssistant(bouton) {
    if (!bouton || !bouton.dataset) return;
    const tmp = document.createElement('textarea');
    tmp.innerHTML = bouton.dataset.extrait || '';
    afficherApercuAssistant(bouton.dataset.doc, parseInt(bouton.dataset.page, 10) || 1, tmp.value);
  }

  // Le PDF d'un document, ouvert une fois : la PROMESSE est gardée par document (seconde relecture 0.282.0 : deux clics rapides
  // ouvraient deux fois le fichier et le second détruisait le premier pendant son dessin).
  function pdfPourApercuAssistant(docId) {
    if (pdfApercuAssistant && pdfApercuAssistant.docId === docId) return pdfApercuAssistant.promesse;
    const doc = documentsAgentConnus[docId];
    if (!doc) return Promise.reject(new Error('document inconnu de cette fenêtre (conversation d’une autre session)'));
    if (typeof pdfjsLib === 'undefined') return Promise.reject(new Error('lecteur PDF non chargé'));
    if (doc.sorte === 'joint' && doc.sortePiece === 'image') return Promise.reject(new Error('image : pas de pages'));
    if (doc.sorte !== 'joint' && !doc.chemin) return Promise.reject(new Error('fichier pas encore localisé sur le NAS'));
    const ancien = pdfApercuAssistant;
    const promesse = (doc.sorte === 'joint'
      ? doc.fichier.arrayBuffer().then(data => pdfjsLib.getDocument({ isEvalSupported: false, data, verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise)
      : (doc.libre ? ouvrirPdfNasLibre(doc.chemin) : ouvrirPdfNas(doc.chemin)));
    pdfApercuAssistant = { docId, promesse };
    // L'ancien PDF n'est libéré qu'une fois le nouveau demandé (un dessin en cours de l'ancien s'arrête alors sans dommage).
    if (ancien) ancien.promesse.then(pdf => { try { pdf.destroy(); } catch (e) { /* déjà libéré */ } }).catch(() => {});
    promesse.catch(() => { if (pdfApercuAssistant && pdfApercuAssistant.promesse === promesse) pdfApercuAssistant = null; });
    return promesse;
  }

  // L'aperçu : la page dessinée ici, la citation surlignée et dite « retrouvée » ou non (vérification mot pour mot, accents,
  // casse et espaces ignorés). Chaque demande est un objet : une demande remplacée entre-temps n'écrit plus rien.
  async function afficherApercuAssistant(docId, page, extrait) {
    colonneAssistant.ouverte = true;
    const ap = { docId, page: page || 1, extrait: extrait || '', etat: 'chargement', total: 0 };
    colonneAssistant.apercu = ap;
    renderColonneAssistant();
    const bloc = blocApercu();
    bloc.innerHTML = '';
    const courant = () => colonneAssistant.apercu === ap;
    try {
      const pdf = await pdfPourApercuAssistant(docId);
      if (!courant()) return;
      const n = Math.min(Math.max(1, page || 1), pdf.numPages);
      ap.page = n;
      ap.total = pdf.numPages;
      const p = await pdf.getPage(n);
      const place = document.getElementById('assistant-apercu-place');
      const largeur = Math.max(240, ((place && place.clientWidth) || 320) - 2);
      const echelle = largeur / p.getViewport({ scale: 1 }).width;
      const vue = p.getViewport({ scale: echelle * (window.devicePixelRatio || 1) });
      const canvas = document.createElement('canvas');
      canvas.width = vue.width; canvas.height = vue.height;
      canvas.style.width = largeur + 'px';
      await p.render({ canvasContext: canvas.getContext('2d'), viewport: vue, intent: 'print' }).promise;
      if (!courant()) return;
      bloc.innerHTML = '';
      bloc.appendChild(canvas);
      let trouve = null;
      if (extrait) trouve = await surlignerDansPagePdf(pdf, n, bloc, echelle, [extrait]);
      if (!courant()) return;
      ap.etat = !extrait ? 'page' : trouve ? 'retrouvee' : 'absente';
      majEnteteApercuAssistant();
      if (trouve) trouve.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      if (!courant()) return;
      ap.etat = 'erreur:' + String(e && e.message || e).slice(0, 120);
      majEnteteApercuAssistant();
    }
  }

  function feuilleterApercuAssistant(delta) {
    const a = colonneAssistant.apercu;
    if (!a || !a.total) return;
    const n = Math.min(a.total, Math.max(1, a.page + delta));
    if (n !== a.page) afficherApercuAssistant(a.docId, n, '');
  }

  function fermerApercuAssistant() {
    colonneAssistant.apercu = null;
    if (blocApercuAssistant) blocApercuAssistant.innerHTML = '';
    renderColonneAssistant();
  }

  // Pure : la ligne d'état de l'aperçu.
  function etatApercuAssistant(a) {
    if (!a) return '';
    if (a.etat === 'chargement') return 'Ouverture…';
    if (a.etat === 'retrouvee') return 'Citation retrouvée mot pour mot';
    if (a.etat === 'absente') return 'Citation non retrouvée telle quelle sur cette page : vérifiez le texte';
    if (/^erreur:/.test(a.etat || '')) return a.etat.slice(7);
    return '';
  }

  function majEnteteApercuAssistant() {
    const a = colonneAssistant.apercu;
    const etat = document.getElementById('assistant-apercu-etat');
    const pages = document.getElementById('assistant-apercu-pages');
    if (etat) { etat.textContent = etatApercuAssistant(a); etat.className = 'asst-apercu-etat ' + (a && a.etat === 'retrouvee' ? 'ok' : a && a.etat === 'absente' ? 'alerte' : ''); }
    if (pages && a) pages.textContent = a.total ? `p. ${a.page} / ${a.total}` : '';
  }

  // ---- Dossier rattaché ----

  function choisirDossierColonneAssistant(id) {
    assistantContexte.dossierId = id || '';
    colonneAssistant.docsDossier = null;
    renderColonneAssistant();
  }

  async function chargerDocumentsDossierColonne() {
    const id = assistantContexte.dossierId;
    if (!id) return;
    colonneAssistant.docsDossier = { chargement: true, liste: [] };
    renderColonneAssistant();
    const r = await documentsDuDossierAgent(id);
    colonneAssistant.docsDossier = r && r.erreur ? { erreur: r.erreur, liste: [] }
      : { liste: (r.documents || []).map(x => ({ id: x.document_id, libelle: (documentsAgentConnus[x.document_id] || {}).libelle || x.document, piece: x.document, date: x.modifie_le })) };
    renderColonneAssistant();
  }

  // Demander à CLAIRE de lire un document du dossier : l'identifiant est mis dans la saisie, jamais le nom du fichier.
  function demanderLectureDocumentAssistant(docId) {
    const champ = document.getElementById('assistant-saisie');
    if (!champ) return;
    champ.value = `Lis le document ${docId} et dis-moi ce qu’il contient d’important.`;
    champ.focus();
  }

  // ---- Rendu ----

  function renderColonneAssistant() {
    renderBarreOptionsAssistant();
    const page = document.querySelector('#onglet-assistant .asst-page');
    const zone = document.getElementById('assistant-droite');
    if (!page || !zone) return;
    page.classList.toggle('colonne-ouverte', !!colonneAssistant.ouverte);
    const bouton = document.getElementById('assistant-colonne-bouton');
    if (bouton) bouton.setAttribute('aria-expanded', String(!!colonneAssistant.ouverte));
    // Rien à redessiner si la colonne est fermée ; une liste en cours de choix n'est pas refaite (le focus serait perdu).
    if (!colonneAssistant.ouverte) return;
    const actif = document.activeElement;
    // Le rendu reporté attend la fin du clic qui a fait perdre le focus (sinon ce clic tomberait sur un élément refait).
    if (actif && zone.contains(actif) && actif.tagName === 'SELECT') { actif.onblur = () => { actif.onblur = null; setTimeout(renderColonneAssistant, 250); }; return; }
    const docs = documentsColonneAssistant(typeof documentsAgentConnus === 'object' ? documentsAgentConnus : {}, colonneAssistant.lus);
    const a = colonneAssistant.apercu;
    const dossiersTries = (dossiers || []).filter(d => d && !d.archive).map(d => ({ id: d.id, libelle: libelleDossierAffiche(d) }))
      .sort((x, y) => x.libelle.localeCompare(y.libelle, 'fr'));
    const dossierId = assistantContexte.dossierId || '';
    const dd = colonneAssistant.docsDossier;
    const etapes = colonneAssistant.etapes;
    const journal = colonneAssistant.journal.slice(-12);
    zone.innerHTML = `
      <div class="asst-droite-tete">
        <span class="asst-droite-titre">Espace de travail</span>
        <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="basculerColonneAssistant()" title="Masquer la colonne" aria-label="Masquer la colonne">${icone('x')}</wa-button>
      </div>
      ${a ? `<section class="asst-droite-bloc asst-apercu" aria-label="Aperçu du document">
        <div class="asst-apercu-tete">
          <span class="asst-apercu-nom">${escapeHtml(((documentsAgentConnus[a.docId] || {}).libelle) || a.docId)}</span>
          <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="fermerApercuAssistant()" title="Fermer l’aperçu" aria-label="Fermer l’aperçu">${icone('x')}</wa-button>
        </div>
        <div class="asst-apercu-nav">
          <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="feuilleterApercuAssistant(-1)" aria-label="Page précédente">${icone('chevron-left')}</wa-button>
          <span id="assistant-apercu-pages" class="asst-apercu-pages"></span>
          <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="feuilleterApercuAssistant(1)" aria-label="Page suivante">${icone('chevron-right')}</wa-button>
        </div>
        <p id="assistant-apercu-etat" class="asst-apercu-etat"></p>
        <div id="assistant-apercu-place" class="asst-apercu-place"></div>
      </section>` : ''}
      <details class="asst-droite-bloc" data-bloc="etapes"${blocsOuvertsColonneAssistant.etapes ? ' open' : ''} ontoggle="blocsOuvertsColonneAssistant['etapes'] = this.open">
        <summary>${icone('list-check')} Étapes du travail</summary>
        ${etapes.length ? `<ol class="asst-etapes">${etapes.map(e => `<li class="asst-etape-${e.etat}"><span class="asst-etape-marque" aria-hidden="true">${e.etat === 'fait' ? icone('check') : ''}</span>${escapeHtml(e.texte)}</li>`).join('')}</ol>` : ''}
        ${journal.length ? `<ul class="asst-journal">${journal.map(j => `<li class="${j.fini ? 'fini' : 'encours'}">${j.fini ? icone('check') : '<span class="asst-journal-point" aria-hidden="true"></span>'}${escapeHtml(j.libelle)}</li>`).join('')}</ul>` : ''}
        ${!etapes.length && !journal.length ? '<p class="asst-droite-vide">Le plan et les lectures de CLAIRE s’affichent ici pendant qu’elle travaille.</p>' : ''}
      </details>
      <details class="asst-droite-bloc" data-bloc="documents"${blocsOuvertsColonneAssistant.documents ? ' open' : ''} ontoggle="blocsOuvertsColonneAssistant['documents'] = this.open">
        <summary>${icone('file-text')} Documents <span class="asst-droite-nb">${docs.length || ''}</span></summary>
        ${docs.length ? `<ul class="asst-docs">${docs.map(d => `<li><button type="button" class="asst-doc" onclick="afficherApercuAssistant('${escapeOnclickArg(d.id)}', 1, '')" ${d.image ? 'disabled' : ''}>
            <span class="asst-doc-nom">${escapeHtml(d.libelle)}</span>
            <span class="asst-doc-note">${escapeHtml(d.id)}${d.joint ? ' · joint' : ''}${d.pages ? ' · lu p. ' + escapeHtml(d.pages) : ''}</span></button></li>`).join('')}</ul>`
          : '<p class="asst-droite-vide">Joignez un PDF au message (trombone ou glisser-déposer) ou demandez à CLAIRE de lire un document du dossier.</p>'}
      </details>
      <details class="asst-droite-bloc" data-bloc="dossier"${blocsOuvertsColonneAssistant.dossier ? ' open' : ''} ontoggle="blocsOuvertsColonneAssistant['dossier'] = this.open">
        <summary>${icone('folder')} Dossier rattaché</summary>
        <select id="assistant-colonne-dossier" class="asst-droite-select" onchange="this.blur(); choisirDossierColonneAssistant(this.value)" aria-label="Dossier rattaché à la conversation">
          <option value="">Aucun dossier</option>
          ${dossiersTries.map(d => `<option value="${escapeAttr(d.id)}"${d.id === dossierId ? ' selected' : ''}>${escapeHtml(d.libelle)}</option>`).join('')}
        </select>
        ${dossierId ? `<div class="asst-droite-actions"><wa-button appearance="outlined" size="s" type="button" onclick="chargerDocumentsDossierColonne()">Pièces du NAS</wa-button>
          <wa-button appearance="plain" size="s" type="button" onclick="ouvrirDossierDepuisColonneAssistant()">Ouvrir la fiche</wa-button></div>` : ''}
        ${dd && dd.chargement ? '<p class="asst-droite-vide">Lecture du dossier du NAS…</p>' : ''}
        ${dd && dd.erreur ? `<p class="asst-droite-vide">${escapeHtml(dd.erreur)}</p>` : ''}
        ${dd && dd.liste && dd.liste.length ? `<ul class="asst-docs asst-docs-dossier">${dd.liste.slice(0, 60).map(d => `<li><button type="button" class="asst-doc" onclick="afficherApercuAssistant('${escapeOnclickArg(d.id)}', 1, '')">
            <span class="asst-doc-nom">${escapeHtml(d.libelle)}</span><span class="asst-doc-note">${escapeHtml(d.piece || '')}${d.date ? ' · ' + escapeHtml(String(d.date).split('-').reverse().join('/')) : ''}</span></button>
            <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="demanderLectureDocumentAssistant('${escapeOnclickArg(d.id)}')" title="Demander à CLAIRE de le lire" aria-label="Demander à CLAIRE de le lire">${icone('sparkle')}</wa-button></li>`).join('')}</ul>` : ''}
      </details>
      ${htmlBlocConfidentialiteAssistant()}`;
    // La page déjà dessinée est replacée telle quelle (le HTML de la colonne est refait à chaque étape de CLAIRE).
    const place = document.getElementById('assistant-apercu-place');
    if (place && a) place.appendChild(blocApercu());
    majEnteteApercuAssistant();
  }

  function ouvrirDossierDepuisColonneAssistant() {
    const id = assistantContexte.dossierId;
    if (id) ouvrirDossierDrawer(id);
  }

  // Sous 1 280 px la colonne passe par-dessus la conversation : Échap la ferme et rend le focus au bouton qui l'ouvre.
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || ev.defaultPrevented || !colonneAssistant.ouverte || window.innerWidth > 1280) return;
    // Une fenêtre posée par-dessus (email, autorisation, confirmation) se ferme d'abord.
    if ([...document.querySelectorAll('.confirm-overlay, .jour-overlay, .drawer-overlay')].some(o => o.style.display && o.style.display !== 'none')) return;
    const zone = document.getElementById('assistant-droite');
    if (!zone || !zone.offsetParent) return;
    colonneAssistant.ouverte = false;
    renderColonneAssistant();
    const bouton = document.getElementById('assistant-colonne-bouton');
    if (bouton) bouton.focus();
  });
