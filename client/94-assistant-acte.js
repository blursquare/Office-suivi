  // ---- « Demander à CLAIRE » : un acte déposé s'analyse comme dans une conversation Claude (étude 20/10) ----
  // « Si demain je dépose un acte dans CLAIRE, je veux la même analyse que dans une conversation Claude. S'il faut retirer
  // l'anonymisation, mets-la en option dans la colonne de droite. » — « Met le choix du modèle sous le prompt, comme sur Claude. »
  // Une pièce jointe est lue EN ENTIER sur ce poste (texte du PDF, OCR des pages scannées) avant l'envoi : son texte part avec la
  // question, une marque [pj1 p. N] par page (la citation de la réponse ouvre la page), masqué par le serveur sauf si l'anonymisation
  // est désactivée. Le modèle et la réflexion se choisissent sous la saisie ; l'anonymisation, dans la colonne de droite.

  var MAX_PAGES_ACTE_ASSISTANT = 400;
  // Texte joint au plus : celui que le serveur accepte (700 000 caractères avec Opus, qui résume le début d'une longue conversation ;
  // 180 000 avec les autres modèles). Au-delà, rien ne part : le poste ne lit pas ce qui serait jeté (OCR compris).
  var MAX_CARACTERES_ACTE_OPUS = 700000;
  var MAX_CARACTERES_ACTE_AUTRES = 180000;

  // Pure : ce que le modèle choisi peut recevoir de texte joint. `modele` : l'identifiant choisi ('' = celui des Réglages).
  function plafondCaracteresActeAssistant(modele, modeleReglage, mistral) {
    if (mistral) return MAX_CARACTERES_ACTE_AUTRES;
    return /opus/.test(String(modele || modeleReglage || '')) ? MAX_CARACTERES_ACTE_OPUS : MAX_CARACTERES_ACTE_AUTRES;
  }

  // Lit tout un document joint : les tranches de 30 pages l'une après l'autre. Rend { id, pagesTotal, pages: [{ page, texte }] } ou
  // { id, erreur }. `suivi(texte)` dit où en est la lecture.
  async function lireDocumentJointComplet(piece, suivi, budget) {
    const pages = [];
    let total = 0;
    let debut = 1;
    for (let tranche = 0; tranche < 40; tranche++) {
      const r = await lireDocumentAgent(piece.id, debut, 0);
      if (!r || r.erreur) return pages.length ? { id: piece.id, pagesTotal: total, pages } : { id: piece.id, erreur: (r && r.erreur) || 'lecture impossible' };
      total = r.pages_total || total || 1;
      (r.pages || []).forEach(p => { if (budget && budget.restant <= 0) return; pages.push({ page: p.page, texte: String(p.texte || '') }); if (budget) budget.restant -= String(p.texte || '').length; });
      if (budget && budget.restant <= 0) { budget.coupe = true; break; }
      const derniere = pages.length ? pages[pages.length - 1].page : debut - 1;
      if (suivi) suivi(`${derniere} / ${total}`);
      if (!(r.pages || []).length || derniere >= total || pages.length >= MAX_PAGES_ACTE_ASSISTANT) break;
      debut = derniere + 1;
    }
    return { id: piece.id, pagesTotal: total, pages };
  }

  // Les pièces jointes d'un message, lues en entier. Rend { documents, restantes, coupe } : `coupe` = le texte a été limité à ce que le modèle choisi peut recevoir ; `restantes` = celles qui n'ont pas pu l'être
  // (l'agent les lira lui-même avec lire_document).
  async function lireDocumentsJointsAssistant(pieces) {
    const documents = [];
    const restantes = [];
    const mistral = typeof assistantDisponibilite === 'object' && assistantDisponibilite && assistantDisponibilite.moteur === 'mistral';
    const budget = { restant: plafondCaracteresActeAssistant(colonneAssistant.modele, assistantDisponibilite && assistantDisponibilite.modele, mistral), coupe: false };
    for (const p of pieces || []) {
      if (budget.restant <= 0) { budget.coupe = true; break; }
      assistantEtapeAgent = 'Je lis le document en entier…';
      renderAssistant();
      const r = await lireDocumentJointComplet(p, (avance) => { assistantEtapeAgent = `Je lis le document en entier… page ${avance}`; renderAssistant(); }, budget);
      if (r.erreur || !r.pages.length) restantes.push(p);
      else { documents.push(r); noterVerificationPoste('agent-acte-integral', { detail: `${r.pages.length} page(s) jointes au message` }); }
    }
    return { documents, restantes, coupe: budget.coupe };
  }

  // ---- Sous la saisie : modèle, réflexion, et un rappel quand l'anonymisation est désactivée ----

  var NOMS_COURTS_MODELES_ASSISTANT = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5' };

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
    if (espaceTravailCacheAssistant()) colonneAssistant.surArtefact = true;
    colonneAssistant.ouverte = true;
    blocsOuvertsColonneAssistant.confidentialite = true;
    renderColonneAssistant();
  }

  function basculerAnonymisationAssistant(champ) {
    const veutActive = !!(champ && champ.checked);
    if (veutActive) { colonneAssistant.anonymiser = true; renderColonneAssistant(); return; }
    // Retirer l'anonymisation envoie des noms en clair : confirmé, dit en clair, jamais par erreur.
    demanderConfirmation('Désactiver l’anonymisation pour cette conversation ? Les noms, adresses, emails et téléphones des documents et des fiches partiront en clair chez le fournisseur de l’IA (Anthropic ou Mistral). Elle reste désactivée tant que vous ne la rallumez pas.', () => {
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
          <span class="asst-droite-option-texte"><b>Anonymisation</b>${infoBulle('Active : le serveur de l’étude remplace les noms et prénoms des fiches, agences, notaires, emails, téléphones, IBAN et numéros de compte par des codes avant de les envoyer à l’IA, et les rétablit dans la réponse ; une adresse, une référence ou un numéro long ne sont codés que s’ils sont dans la même phrase ou la même fiche qu’un nom de famille. Désactivée : tout part en clair pour cette conversation (analyse plus fine d’un acte, sans codes à déchiffrer) ; la recherche web est alors coupée et les recherches Légifrance ou BOFiP n’emportent jamais un nom. Aucun accord de sous-traitance avec le fournisseur n’est encore attesté.')}</span>
          <wa-switch id="assistant-anonymiser" class="switch"${actif ? ' checked' : ''} onchange="basculerAnonymisationAssistant(this)"></wa-switch>
        </label>
        <p class="asst-droite-vide">${actif ? 'Les noms sont remplacés par des codes avant l’envoi.' : 'Les noms partent en clair (réglage de départ de l’étude).'}</p>
      </details>`;
  }
