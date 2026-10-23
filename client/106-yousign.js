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

  // Pure : tous les arguments d'un outil, à plat (« chemin : valeur »), imbriqués compris — un email ou un nom de signataire n'échappe pas à la carte.
  function aplatirArgumentsYousign(entree, prefixe, sortie) {
    const liste = sortie || [];
    if (liste.length >= 14) return liste;
    if (Array.isArray(entree)) entree.forEach((v, i) => aplatirArgumentsYousign(v, `${prefixe || ''}[${i + 1}]`, liste));
    else if (entree && typeof entree === 'object') Object.entries(entree).forEach(([k, v]) => aplatirArgumentsYousign(v, prefixe ? `${prefixe}.${k}` : k, liste));
    else if (entree !== '' && entree != null && prefixe) liste.push(`${prefixe} : ${String(entree).slice(0, /mail|phone|tel/i.test(prefixe) ? 200 : 120)}`);
    return liste;
  }

  // Pure : ce que la demande de signature relue dit à l'utilisateur — son nom, son état, ses signataires (nom, email) ; à défaut, les emails du texte.
  function resumeDemandeYousign(texte) {
    let j = null;
    try { j = JSON.parse(String(texte || '')); } catch (e) { j = null; }
    const signataires = [];
    const parcourir = (v, profondeur) => {
      if (!v || typeof v !== 'object' || profondeur > 5) return;
      if (Array.isArray(v)) { v.forEach((x) => parcourir(x, profondeur + 1)); return; }
      const info = v.info && typeof v.info === 'object' ? v.info : v;
      const nom = [info.first_name, info.last_name].filter(Boolean).join(' ') || (typeof info.name === 'string' && info.email ? info.name : '');
      if (info.email && typeof info.email === 'string') signataires.push(`${nom ? nom + ' ' : ''}<${info.email}>`);
      else Object.values(v).forEach((x) => parcourir(x, profondeur + 1));
    };
    if (j) parcourir(j.signers || j, 0);
    const emails = signataires.length ? [] : [...new Set(String(texte || '').match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || [])].slice(0, 6);
    const nom = j && typeof j.name === 'string' ? `« ${j.name.slice(0, 100)} »` : '';
    const etat = j && typeof j.status === 'string' ? ` (${j.status})` : '';
    const dest = (signataires.length ? signataires : emails).slice(0, 8).join(', ');
    return [nom + etat, dest ? `signataires : ${dest}` : ''].filter(Boolean).join(' — ');
  }

  // Pure : ce que dit la carte « Autoriser » d'un outil de Yousign qui écrit (audit 0.321.0, H2 : tous les arguments, la demande relue).
  function descriptionActionYousign(nom, entree, demande) {
    const court = String(nom || '').replace(/^yousign__/, '');
    const trouve = LIBELLES_ACTIONS_YOUSIGN.find(([re]) => re.test(court.toLowerCase()));
    const args = aplatirArgumentsYousign(entree && typeof entree === 'object' ? entree : {}).join(' · ').slice(0, 700);
    return `Yousign — ${trouve ? trouve[1] : 'Écrire dans Yousign (' + court + ')'}.${demande ? ' Demande : ' + demande + '.' : ''}${args ? ' ' + args : ''}`;
  }

  async function lireDemandeYousign(entree) {
    const cle = entree && typeof entree === 'object' ? (['signature_request_id', 'id'].find((k) => typeof entree[k] === 'string' && entree[k]) || '') : '';
    if (!cle) return '';
    try {
      const r = await fetchAvecAuth('/api/yousign/appel', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outil: 'yousign__get-signature-request', arguments: { [cle]: entree[cle] } }) });
      const json = await r.json().catch(() => ({}));
      return r.ok && !json.erreur && json.texte ? resumeDemandeYousign(json.texte) : '';
    } catch (e) { return ''; }
  }

  async function appelYousignAgent(nom, entree) {
    const ecrit = !RE_YOUSIGN_LECTURE.test(nom);
    if (ecrit) {
      // Un outil qui ne porte qu'un identifiant (envoyer, retirer, modifier) : la demande est relue pour que la carte dise laquelle.
      const demande = /create/i.test(nom) ? '' : await lireDemandeYousign(entree);
      if (!(await demanderAutorisationAgent(descriptionActionYousign(nom, entree, demande)))) {
        return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
      }
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
      resultatYousign(json.connecte ? 'Connecté par identifiant et mot de passe.' : json.cleEnregistree ? 'Clé enregistrée.' : 'Pas connecté.');
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

  // Connexion par identifiant et mot de passe (OAuth) : la page de connexion de Yousign s'ouvre, CLAIRE ne voit jamais le mot de passe.
  async function connecterYousign() {
    resultatYousign('Ouverture de la page de connexion de Yousign…');
    try {
      const r = await fetchAvecAuth('/api/yousign/oauth/demarrer', { method: 'POST' });
      const json = await r.json().catch(() => ({}));
      if (!json.ok || !json.url) { resultatYousign(json.message || 'Connexion impossible.'); return; }
      if (typeof ouvrirLienExterne === 'function') ouvrirLienExterne(json.url); else window.open(json.url, '_blank', 'noopener');
      const zone = document.getElementById('reglages-yousign-retour');
      if (zone) zone.style.display = json.manuel ? '' : 'none';
      resultatYousign(json.manuel
        ? 'Connectez-vous sur la page de Yousign. Ensuite la page affichera une erreur (normal) : copiez l’adresse de cette page dans la barre du navigateur, collez-la ci-dessous et cliquez sur « Terminer la connexion ».'
        : 'Connectez-vous sur la page de Yousign, puis revenez ici et cliquez sur « Tester la connexion ».');
    } catch (e) { resultatYousign('Serveur injoignable.'); }
  }

  // Retour collé à la main (navigateur d'un autre poste que le serveur) : l'adresse de la page d'erreur porte le code de Yousign.
  async function terminerConnexionYousign() {
    const champ = document.getElementById('reglages-yousign-adresse');
    const adresse = champ ? champ.value.trim() : '';
    if (!adresse) { resultatYousign('Collez d’abord l’adresse de la page.'); return; }
    resultatYousign('Connexion en cours…');
    try {
      const r = await fetchAvecAuth('/api/yousign/oauth/terminer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adresse }) });
      const json = await r.json().catch(() => ({}));
      if (!json.ok) { resultatYousign(json.message || 'Connexion impossible.'); return; }
      if (champ) champ.value = '';
      await chargerReglagesYousign();
      resultatYousign('Connecté. Vous pouvez « Tester la connexion ».');
    } catch (e) { resultatYousign('Serveur injoignable.'); }
  }

  async function deconnecterYousign() {
    try {
      await fetchAvecAuth('/api/yousign/oauth/deconnecter', { method: 'POST' });
      await chargerReglagesYousign();
      resultatYousign('Déconnecté.');
    } catch (e) { resultatYousign('Serveur injoignable.'); }
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
