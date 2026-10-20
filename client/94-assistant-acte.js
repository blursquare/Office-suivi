  // ---- « Demander à CLAIRE » : un acte déposé s'analyse comme dans une conversation Claude (étude 20/10) ----
  // « Si demain je dépose un acte dans CLAIRE, je veux la même analyse que dans une conversation Claude. S'il faut retirer
  // l'anonymisation, mets-la en option dans la colonne de droite. » — « Met le choix du modèle sous le prompt, comme sur Claude. »
  // Une pièce jointe est lue EN ENTIER sur ce poste (texte du PDF, OCR des pages scannées) avant l'envoi : son texte part avec la
  // question, une marque [pj1 p. N] par page (la citation de la réponse ouvre la page), masqué par le serveur sauf si l'anonymisation
  // est désactivée. Le modèle et la réflexion se choisissent sous la saisie ; l'anonymisation, dans la colonne de droite.

  var MAX_PAGES_ACTE_ASSISTANT = 400;

  // Lit tout un document joint : les tranches de 30 pages l'une après l'autre. Rend { id, pagesTotal, pages: [{ page, texte }] } ou
  // { id, erreur }. `suivi(texte)` dit où en est la lecture.
  async function lireDocumentJointComplet(piece, suivi) {
    const pages = [];
    let total = 0;
    let debut = 1;
    for (let tranche = 0; tranche < 40; tranche++) {
      const r = await lireDocumentAgent(piece.id, debut, 0);
      if (!r || r.erreur) return pages.length ? { id: piece.id, pagesTotal: total, pages } : { id: piece.id, erreur: (r && r.erreur) || 'lecture impossible' };
      total = r.pages_total || total || 1;
      (r.pages || []).forEach(p => pages.push({ page: p.page, texte: String(p.texte || '') }));
      const derniere = pages.length ? pages[pages.length - 1].page : debut - 1;
      if (suivi) suivi(`${derniere} / ${total}`);
      if (!(r.pages || []).length || derniere >= total || pages.length >= MAX_PAGES_ACTE_ASSISTANT) break;
      debut = derniere + 1;
    }
    return { id: piece.id, pagesTotal: total, pages };
  }

  // Les pièces jointes d'un message, lues en entier. Rend { documents, restantes } : `restantes` = celles qui n'ont pas pu l'être
  // (l'agent les lira lui-même avec lire_document).
  async function lireDocumentsJointsAssistant(pieces) {
    const documents = [];
    const restantes = [];
    for (const p of pieces || []) {
      assistantEtapeAgent = 'Je lis le document en entier…';
      renderAssistant();
      const r = await lireDocumentJointComplet(p, (avance) => { assistantEtapeAgent = `Je lis le document en entier… page ${avance}`; renderAssistant(); });
      if (r.erreur || !r.pages.length) restantes.push(p);
      else { documents.push(r); noterVerificationPoste('agent-acte-integral', { detail: `${r.pages.length} page(s) jointes au message` }); }
    }
    return { documents, restantes };
  }

  // ---- Sous la saisie : modèle, réflexion, et un rappel quand l'anonymisation est désactivée ----

  var NOMS_COURTS_MODELES_ASSISTANT = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5' };

  function choisirModeleAssistant(valeur) { colonneAssistant.modele = valeur || ''; renderBarreOptionsAssistant(); }
  function choisirReflexionAssistant(valeur) { colonneAssistant.effort = valeur || 'medium'; renderBarreOptionsAssistant(); }

  function renderBarreOptionsAssistant() {
    const zone = document.getElementById('assistant-options-saisie');
    if (!zone) return;
    const actif = document.activeElement;
    // Une liste ouverte n'est pas refaite sous le doigt.
    if (actif && zone.contains(actif) && actif.tagName === 'SELECT' && document.hasFocus()) return;
    const mistral = typeof assistantDisponibilite === 'object' && assistantDisponibilite && assistantDisponibilite.moteur === 'mistral';
    const modeles = MODELES_COLONNE_ASSISTANT.filter(m => m.valeur);
    const reglage = (typeof assistantDisponibilite === 'object' && assistantDisponibilite && assistantDisponibilite.modele) || '';
    const choisi = colonneAssistant.modele || (modeles.some(m => m.valeur === reglage) ? reglage : modeles[0].valeur);
    const libelleModele = (m) => NOMS_COURTS_MODELES_ASSISTANT[m.valeur] || m.libelle;
    zone.innerHTML = (mistral
      ? `<span class="asst-option-fixe" title="Le modèle Mistral se règle dans Réglages › IA et relecture d’actes">Mistral</span>`
      : `<label class="asst-option"><span class="sr-only">Modèle</span><select id="assistant-modele-saisie" class="asst-option-select" onchange="choisirModeleAssistant(this.value)" aria-label="Modèle de CLAIRE" title="Modèle : un autre modèle ouvre une nouvelle conversation qui reprend le fil des échanges">
          ${modeles.map(m => `<option value="${escapeAttr(m.valeur)}"${m.valeur === choisi ? ' selected' : ''}>${escapeHtml(libelleModele(m))}</option>`).join('')}
        </select></label>`)
      + `<label class="asst-option"><span class="sr-only">Réflexion</span><select id="assistant-reflexion-saisie" class="asst-option-select" onchange="choisirReflexionAssistant(this.value)" aria-label="Réflexion de CLAIRE" title="Réflexion : plus elle est approfondie, plus la réponse est fine et longue à venir">
          ${EFFORTS_COLONNE_ASSISTANT.map(m => `<option value="${escapeAttr(m.valeur)}"${m.valeur === colonneAssistant.effort ? ' selected' : ''}>${escapeHtml(m.libelle)}</option>`).join('')}
        </select></label>`
      + (colonneAssistant.anonymiser === false ? `<button type="button" class="asst-alerte-anonymat" onclick="ouvrirColonneConfidentialiteAssistant()" title="Les noms partent en clair : cliquer pour la réactiver">${icone('alert-triangle')} Anonymisation désactivée</button>` : '');
  }

  // ---- Anonymisation (colonne de droite) ----

  function ouvrirColonneConfidentialiteAssistant() {
    colonneAssistant.ouverte = true;
    blocsOuvertsColonneAssistant.confidentialite = true;
    renderColonneAssistant();
  }

  function basculerAnonymisationAssistant(champ) {
    const veutActive = !!(champ && champ.checked);
    if (veutActive) { colonneAssistant.anonymiser = true; renderColonneAssistant(); return; }
    // Retirer l'anonymisation envoie des noms en clair : confirmé, dit en clair, jamais par erreur.
    demanderConfirmation('Désactiver l’anonymisation pour cette conversation ? Les noms, adresses, emails et téléphones des documents et des fiches partiront en clair chez le fournisseur de l’IA (Anthropic ou Mistral). Elle se réactive d’elle-même à la prochaine conversation.', () => {
      colonneAssistant.anonymiser = false;
      renderColonneAssistant();
    }, { bouton: 'Désactiver', ton: 'danger' });
    // Annulé : l'interrupteur revient.
    if (champ) champ.checked = true;
  }

  function htmlBlocConfidentialiteAssistant() {
    const actif = colonneAssistant.anonymiser !== false;
    return `<details class="asst-droite-bloc" data-bloc="confidentialite"${blocsOuvertsColonneAssistant.confidentialite ? ' open' : ''} ontoggle="blocsOuvertsColonneAssistant['confidentialite'] = this.open">
        <summary>${icone('shield')} Confidentialité</summary>
        <label class="asst-droite-option" for="assistant-anonymiser">
          <span class="asst-droite-option-texte"><b>Anonymisation</b>${infoBulle('Active : le serveur de l’étude remplace les noms, adresses, emails, téléphones et références par des codes avant de les envoyer à l’IA, et les rétablit dans la réponse. Désactivée : tout part en clair pour cette conversation (analyse plus fine d’un acte, sans codes à déchiffrer) ; la recherche web est alors coupée et les recherches Légifrance ou BOFiP n’emportent jamais un nom. Aucun accord de sous-traitance avec le fournisseur n’est encore attesté.')}</span>
          <wa-switch id="assistant-anonymiser" class="switch"${actif ? ' checked' : ''} onchange="basculerAnonymisationAssistant(this)"></wa-switch>
        </label>
        <p class="asst-droite-vide">${actif ? 'Les noms sont remplacés par des codes avant l’envoi.' : 'Les noms partent en clair pour cette conversation.'}</p>
      </details>`;
  }
