  // Yousign (étude 23/10 : « brancher le MCP de Yousign à CLAIRE, lecture et écriture ») — signature électronique. Le serveur est le client
  // MCP (server/src/yousign.js) : ce poste n'appelle que POST /api/yousign/appel quand l'agent le demande, et règle la clé dans
  // Réglages › IA et relecture d'actes. Tout outil qui ÉCRIT (créer, modifier, ajouter ou retirer un signataire, envoyer) passe d'abord par la
  // carte « Autoriser / Refuser » : rien ne part chez un signataire sans un clic.

  var RE_YOUSIGN_LECTURE = /^yousign__(get|search|list)[-_]/i;
  var LIBELLES_ACTIONS_YOUSIGN = [
    [/^send[-_]signature[-_]request$/, 'ENVOYER la demande de signature : les signataires reçoivent un email de Yousign'],
    [/^create[-_]signature[-_]request[-_]from[-_]template$/, 'Créer une demande de signature à partir d’un modèle (brouillon)'],
    [/^create[-_]signature[-_]request$/, 'Créer une demande de signature (brouillon)'],
    [/^add[-_]signature[-_]request[-_]signer$/, 'Ajouter un signataire à la demande'],
    [/^add[-_]signature[-_]request[-_]approver$/, 'Ajouter un valideur à la demande'],
    [/^add[-_]signature[-_]request[-_]follower$/, 'Ajouter un destinataire en copie de la demande'],
    [/^update[-_]signature[-_]request[-_]signer$/, 'Modifier un signataire de la demande'],
    [/^update[-_]signature[-_]request[-_]approver$/, 'Modifier un valideur de la demande'],
    [/^update[-_]signature[-_]request$/, 'Modifier les réglages de la demande de signature'],
    [/^remove[-_]signature[-_]request[-_]signer$/, 'RETIRER un signataire de la demande (irréversible)'],
    [/^remove[-_]signature[-_]request[-_]approver$/, 'RETIRER un valideur de la demande (irréversible)'],
    [/^remove[-_]signature[-_]request[-_]follower$/, 'RETIRER un destinataire en copie de la demande (irréversible)']
  ];

  // Pure : l'étape affichée pendant l'appel, '' pour un autre outil.
  function libelleOutilYousign(nom) {
    return /^yousign__/.test(String(nom || '')) ? (RE_YOUSIGN_LECTURE.test(nom) ? 'Je consulte Yousign…' : 'Je prépare la demande à Yousign…') : '';
  }

  // Pure : ce que dit la carte « Autoriser » d'un outil de Yousign qui écrit.
  function descriptionActionYousign(nom, entree) {
    const court = String(nom || '').replace(/^yousign__/, '');
    const trouve = LIBELLES_ACTIONS_YOUSIGN.find(([re]) => re.test(court));
    const args = entree && typeof entree === 'object' ? entree : {};
    const resume = Object.entries(args).filter(([, v]) => v !== '' && v != null && typeof v !== 'object')
      .map(([k, v]) => `${k} : ${String(v).slice(0, 80)}`).join(' · ').slice(0, 300);
    return `Yousign — ${trouve ? trouve[1] : 'Écrire dans Yousign (' + court + ')'}.${resume ? ' ' + resume : ''}`;
  }

  async function appelYousignAgent(nom, entree) {
    const ecrit = !RE_YOUSIGN_LECTURE.test(nom);
    if (ecrit && !(await demanderAutorisationAgent(descriptionActionYousign(nom, entree)))) {
      return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
    }
    try {
      const r = await fetchAvecAuth('/api/yousign/appel', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outil: nom, arguments: entree && typeof entree === 'object' ? entree : {} }) });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) return { erreur: json.erreur || `le serveur a répondu ${r.status}` };
      if (typeof json.erreur === 'string') return { erreur: json.erreur };
      // Erreur rendue par Yousign (arguments refusés…) : son texte part à l'IA pour qu'elle se corrige.
      return { resultat: json.texte || '(aucun résultat)', ...(ecrit && !json.erreur ? { statut: 'fait' } : {}), ...(json.erreur === true ? { erreur_outil: true } : {}) };
    } catch (e) { return { erreur: 'serveur injoignable' }; }
  }

  // ---- Réglages ----

  function resultatYousign(texte) {
    const el = document.getElementById('reglages-yousign-resultat');
    if (el) el.textContent = texte;
  }

  async function chargerReglagesYousign() {
    try {
      const json = await (await fetchAvecAuth('/api/yousign/reglages')).json();
      const champ = document.getElementById('reglages-yousign-cle');
      if (champ) { champ.value = ''; champ.placeholder = json.cleEnregistree ? 'Clé enregistrée (laisser vide pour la garder)' : 'Clé d’API Yousign'; }
      const url = document.getElementById('reglages-yousign-url');
      if (url) url.value = json.url || '';
      const actif = document.getElementById('reglages-yousign-actif');
      if (actif) actif.checked = json.actif !== false;
      const ecriture = document.getElementById('reglages-yousign-ecriture');
      if (ecriture) ecriture.checked = json.ecriture !== false;
      resultatYousign(json.cleEnregistree ? '' : 'Aucune clé enregistrée.');
    } catch (e) { resultatYousign('Réglages illisibles.'); }
  }

  async function envoyerReglagesYousign(corps, message) {
    try {
      const r = await fetchAvecAuth('/api/yousign/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) { resultatYousign(json.erreur || 'Non enregistré.'); return; }
      await chargerReglagesYousign();
      resultatYousign(message);
    } catch (e) { resultatYousign('Serveur injoignable.'); }
  }

  function enregistrerReglagesYousign() {
    const champ = document.getElementById('reglages-yousign-cle');
    const url = document.getElementById('reglages-yousign-url');
    const actif = document.getElementById('reglages-yousign-actif');
    const ecriture = document.getElementById('reglages-yousign-ecriture');
    const corps = { actif: !!(actif && actif.checked), ecriture: !!(ecriture && ecriture.checked), url: url ? url.value.trim() : '' };
    // Champ vide = clé gardée (jamais renvoyée par le serveur).
    if (champ && champ.value.trim()) corps.cle = champ.value.trim();
    envoyerReglagesYousign(corps, 'Enregistré. Vaut dès la prochaine conversation.');
  }

  function effacerCleYousign() {
    demanderConfirmation('Effacer la clé Yousign ? CLAIRE ne pourra plus lire ni créer de demandes de signature.', () => envoyerReglagesYousign({ cle: '' }, 'Clé effacée.'),
      { bouton: 'Effacer la clé', ton: 'danger' });
  }

  async function testerYousign() {
    resultatYousign('Test en cours…');
    try {
      const r = await fetchAvecAuth('/api/yousign/tester', { method: 'POST' });
      const json = await r.json().catch(() => ({}));
      if (json.message) { resultatYousign(json.message); return; }
      resultatYousign(json.ok ? `Connecté : ${json.outils} outils (${json.lecture} de lecture, ${json.ecriture} d’écriture).` : 'Aucune réponse.');
    } catch (e) { resultatYousign('Serveur injoignable.'); }
  }
