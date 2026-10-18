  // Consignes de CLAIRE — « CLAIRE.md » (étude 18/10 : « le carnet de consignes pour toute l'étude, un fichier comme Claude.md ;
  // que CLAIRE puisse tout comprendre et s'adapter »). Réglages › Consignes de CLAIRE : le carnet en Markdown, enregistré sur le
  // serveur (server/src/carnetClaire.js), lu par l'agent de « Demander à CLAIRE » avant chaque conversation. Le bouton « Corriger »
  // sous une réponse de l'agent y ajoute une consigne datée. Un texte qui cite un client ou un dossier est refusé par le serveur.

  var carnetClaireCharge = null;   // { texte, maj, auteur, initial, versions } tel que lu sur le serveur

  async function lireReponseCarnetClaire(r) {
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.erreur || `le serveur a répondu ${r.status}`);
    return json;
  }

  function etatCarnetClaire(c, modifie) {
    if (!c) return 'Chargement…';
    const quand = c.maj ? new Date(c.maj).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
    const base = c.initial ? 'Texte de départ proposé par CLAIRE (pas encore enregistré par l’étude).'
      : `Enregistré le ${quand}${c.auteur ? ` par ${c.auteur}` : ''}.`;
    return modifie ? `${base} Modifications non enregistrées.` : base;
  }

  function majEtatCarnetClaire() {
    const zone = document.getElementById('consignes-texte');
    const etat = document.getElementById('consignes-etat');
    if (!zone || !etat) return;
    etat.textContent = etatCarnetClaire(carnetClaireCharge, !!carnetClaireCharge && zone.value !== carnetClaireCharge.texte);
    const prec = document.getElementById('consignes-precedente');
    if (prec) prec.style.display = carnetClaireCharge && carnetClaireCharge.versions > 0 ? '' : 'none';
  }

  function poserCarnetClaire(c) {
    carnetClaireCharge = c;
    const zone = document.getElementById('consignes-texte');
    if (zone) zone.value = c.texte || '';
    majEtatCarnetClaire();
  }

  async function ouvrirCarnetClaire() {
    const zone = document.getElementById('consignes-texte');
    // Une saisie en cours n'est jamais effacée par la relecture.
    if (zone && carnetClaireCharge && zone.value !== carnetClaireCharge.texte) { majEtatCarnetClaire(); return; }
    try {
      poserCarnetClaire(await lireReponseCarnetClaire(await fetchAvecAuth('/api/carnet-claire')));
    } catch (e) {
      const etat = document.getElementById('consignes-etat');
      if (etat) etat.textContent = `Carnet illisible : ${e.message}`;
    }
  }

  async function enregistrerCarnetClaire() {
    const zone = document.getElementById('consignes-texte');
    if (!zone) return;
    // Carnet jamais lu (serveur en redémarrage) : rien n'est envoyé, une zone vide écraserait le carnet de l'étude.
    if (!carnetClaireCharge) { afficherToast('Carnet pas encore lu : réessayez dans un instant.'); ouvrirCarnetClaire(); return; }
    if (!zone.value.trim()) { afficherToast('Le carnet ne peut pas être vide.'); return; }
    try {
      const r = await fetchAvecAuth('/api/carnet-claire', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texte: zone.value, auteur: prenomPosteAssistant() }) });
      poserCarnetClaire(await lireReponseCarnetClaire(r));
      afficherToast('Consignes de CLAIRE enregistrées : elles valent dès la prochaine conversation.');
    } catch (e) { afficherToast(`Non enregistré : ${e.message}`); }
  }

  function telechargerCarnetClaire() {
    const zone = document.getElementById('consignes-texte');
    const texte = zone && zone.value ? zone.value : (carnetClaireCharge && carnetClaireCharge.texte) || '';
    telechargerFichier(texte, 'CLAIRE.md', 'text/markdown;charset=utf-8');
  }

  // Un fichier .md choisi remplace le texte de la zone ; rien n'est enregistré avant « Enregistrer ».
  function importerCarnetClaire(input) {
    const f = input && input.files && input.files[0];
    if (!f) return;
    if (f.size > 60000 * 4) { afficherToast('Fichier trop gros pour un carnet de consignes.'); input.value = ''; return; }
    f.text().then((texte) => {
      const zone = document.getElementById('consignes-texte');
      if (zone) zone.value = texte.replace(/\r\n?/g, '\n');
      majEtatCarnetClaire();
      afficherToast('Fichier chargé : relisez puis cliquez sur « Enregistrer ».');
    }).catch(() => afficherToast('Fichier illisible.')).finally(() => { input.value = ''; });
  }

  function revenirCarnetClairePrecedent() {
    demanderConfirmation('Revenir à la version précédente de CLAIRE.md ? La version actuelle reste gardée.', async () => {
      try {
        const r = await fetchAvecAuth('/api/carnet-claire/version-precedente', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auteur: prenomPosteAssistant() }) });
        poserCarnetClaire(await lireReponseCarnetClaire(r));
        afficherToast('Version précédente rétablie.');
      } catch (e) { afficherToast(`Impossible : ${e.message}`); }
    }, { bouton: 'Revenir à la version précédente' });
  }

  // ---- « Corriger » sous une réponse de l'agent ----

  var compteurConsigneAssistant = 0;
  var consignesAssistantEnCours = {};   // id de la case → texte en cours (la conversation est redessinée à chaque message)
  var consignesAssistantEnvoi = {};     // id → vrai pendant l'envoi (un double clic n'ajoute pas deux fois)

  // Appelée après chaque rendu de la conversation : la saisie en cours revient ; une case d'une session passée (conversation
  // relue sur ce poste, sans son bouton) devient une note.
  function restaurerConsignesAssistant(zone) {
    if (!zone) return;
    zone.querySelectorAll('textarea.asst-consigne-saisie').forEach((t) => {
      if (Object.prototype.hasOwnProperty.call(consignesAssistantEnCours, t.id)) {
        t.value = consignesAssistantEnCours[t.id];
        t.oninput = () => { consignesAssistantEnCours[t.id] = t.value; };
      } else {
        const note = document.createElement('p');
        note.className = 'asst-note';
        note.textContent = '(Consigne non envoyée.)';
        t.replaceWith(note);
      }
    });
  }

  // Les boutons d'une réponse de l'agent : « Corriger » ouvre, dans la conversation, une case pour écrire la consigne ; « Imprimer » pour un
  // compte rendu (une réponse longue : relecture d'acte, analyse ; client/50-relecture-agent.js).
  function boutonsReponseAgentAssistant(html, texte) {
    const boutons = [{ libelle: 'Corriger', action: () => ouvrirConsigneAssistant() }];
    if (html && String(texte || '').length > 700) boutons.push({ libelle: 'Imprimer', action: () => imprimerReponseAssistant(html) });
    return boutons;
  }

  function ouvrirConsigneAssistant() {
    compteurConsigneAssistant += 1;
    const id = `asst-consigne-${Date.now()}-${compteurConsigneAssistant}`;
    consignesAssistantEnCours[id] = '';
    poserMessageAssistant('claire', `<p>Dites-moi ce que je dois retenir : la consigne sera ajoutée à CLAIRE.md et vaudra pour toute l’étude, dès la prochaine conversation. Écrivez une règle générale, sans nom de client.</p>
      <textarea id="${escapeAttr(id)}" class="asst-consigne-saisie" rows="3" maxlength="600" placeholder="Ex. : Pour une notoriété, comptez un mois après le rendez-vous d’ouverture."></textarea>`,
    [{ libelle: 'Ajouter à CLAIRE.md', principal: true, action: () => enregistrerConsigneAssistant(id) }]);
    setTimeout(() => { const z = document.getElementById(id); if (z) z.focus(); }, 0);
  }

  async function enregistrerConsigneAssistant(id) {
    const zone = document.getElementById(id);
    const consigne = zone ? zone.value.trim() : '';
    if (!consigne) { afficherToast('Écrivez d’abord la consigne.'); if (zone) zone.focus(); return; }
    if (consignesAssistantEnvoi[id]) return;
    consignesAssistantEnvoi[id] = true;
    try {
      const r = await fetchAvecAuth('/api/carnet-claire/consigne', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consigne, auteur: prenomPosteAssistant() }) });
      const c = await lireReponseCarnetClaire(r);
      // La page des Réglages, si elle n'a pas de saisie en cours, montre aussitôt la consigne ajoutée.
      const zoneReglages = document.getElementById('consignes-texte');
      if (!carnetClaireCharge || !zoneReglages || zoneReglages.value === carnetClaireCharge.texte) poserCarnetClaire(c);
      // La case devient le texte de la consigne, sans bouton.
      const m = assistantMessages.find((x) => typeof x.html === 'string' && x.html.includes(`id="${id}"`));
      if (m) { m.html = `<p class="asst-note">Consigne proposée : « ${escapeHtml(consigne)} »</p>`; m.boutons = []; }
      delete consignesAssistantEnCours[id];
      // Une nouvelle conversation part avec le carnet à jour.
      assistantAgentConversation = '';
      poserMessageAssistant('claire', `<p>C’est noté dans CLAIRE.md : « ${escapeHtml(consigne)} ». J’en tiendrai compte à partir de la prochaine demande, qui ouvrira une nouvelle conversation.</p>`);
    } catch (e) { afficherToast(`Consigne non ajoutée : ${e.message}`); }
    finally { delete consignesAssistantEnvoi[id]; }
  }
