  // Sources juridiques officielles par OpenLegi (étude 18/10 : « on va connecter openlegi à CLAIRE » ; Légifrance, BOFiP, registre
  // national des entreprises ; agent seulement). Le serveur est le client MCP (server/src/openlegi.js) : ce poste n'appelle que
  // POST /api/openlegi/appel quand l'agent le demande, et règle le jeton dans Réglages › IA et relecture d'actes. Aussi : la recherche web
  // de l'agent (sites officiels) et la mémoire des conversations passées (server/src/conversationsAgent.js).

  var LIBELLES_SOURCES_OPENLEGI_POSTE = { legifrance: 'Légifrance', bofip: 'le BOFiP', rne: 'le registre des entreprises' };

  // Pure : l'étape affichée pendant l'appel (« Je consulte Légifrance… »), '' pour un autre outil.
  function libelleOutilOpenlegi(nom) {
    const m = /^(legifrance|bofip|rne)__/.exec(String(nom || ''));
    return m ? `Je consulte ${LIBELLES_SOURCES_OPENLEGI_POSTE[m[1]]}…` : '';
  }

  async function appelOpenlegiAgent(nom, entree) {
    try {
      const r = await fetchAvecAuth('/api/openlegi/appel', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outil: nom, arguments: entree && typeof entree === 'object' ? entree : {} }) });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) return { erreur: json.erreur || `le serveur a répondu ${r.status}` };
      if (typeof json.erreur === 'string') return { erreur: json.erreur };
      // Erreur rendue par OpenLegi (arguments refusés…) : son texte part à l'IA pour qu'elle se corrige.
      return { source: json.source, resultat: json.texte || '(aucun résultat)', ...(json.erreur === true ? { erreur_outil: true } : {}) };
    } catch (e) { return { erreur: 'serveur injoignable' }; }
  }

  // ---- Réglages ----

  function resultatOpenlegi(texte) {
    const el = document.getElementById('reglages-openlegi-resultat');
    if (el) el.textContent = texte;
  }

  async function chargerReglagesOpenlegi() {
    try {
      const r = await fetchAvecAuth('/api/openlegi/reglages');
      const json = await r.json();
      const champ = document.getElementById('reglages-openlegi-jeton');
      if (champ) { champ.value = ''; champ.placeholder = json.jetonEnregistre ? 'Jeton enregistré (laisser vide pour le garder)' : 'Jeton personnel'; }
      const inter = document.getElementById('reglages-openlegi-actif');
      if (inter) inter.checked = json.actif !== false;
      resultatOpenlegi(json.jetonEnregistre ? '' : 'Aucun jeton enregistré.');
    } catch (e) { resultatOpenlegi('Réglages illisibles.'); }
  }

  async function envoyerReglagesOpenlegi(corps, message) {
    try {
      const r = await fetchAvecAuth('/api/openlegi/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) { resultatOpenlegi(json.erreur || 'Non enregistré.'); return; }
      await chargerReglagesOpenlegi();
      resultatOpenlegi(message);
    } catch (e) { resultatOpenlegi('Serveur injoignable.'); }
  }

  function enregistrerReglagesOpenlegi() {
    const champ = document.getElementById('reglages-openlegi-jeton');
    const inter = document.getElementById('reglages-openlegi-actif');
    const corps = { actif: !!(inter && inter.checked) };
    // Champ vide = jeton gardé (jamais renvoyé par le serveur).
    if (champ && champ.value.trim()) corps.jeton = champ.value.trim();
    envoyerReglagesOpenlegi(corps, 'Enregistré.');
  }

  function effacerJetonOpenlegi() {
    demanderConfirmation('Effacer le jeton OpenLegi ? CLAIRE ne consultera plus les sources juridiques.', () => envoyerReglagesOpenlegi({ jeton: '' }, 'Jeton effacé.'),
      { bouton: 'Effacer le jeton', ton: 'danger' });
  }

  async function testerOpenlegi() {
    resultatOpenlegi('Test en cours…');
    try {
      const r = await fetchAvecAuth('/api/openlegi/tester', { method: 'POST' });
      const json = await r.json().catch(() => ({}));
      if (json.message) { resultatOpenlegi(json.message); return; }
      resultatOpenlegi((json.sources || []).map(s => `${s.libelle} : ${s.erreur ? s.erreur : `${s.outils} outil${s.outils > 1 ? 's' : ''}`}`).join(' · ') || 'Aucune réponse.');
    } catch (e) { resultatOpenlegi('Serveur injoignable.'); }
  }

  // ---- Recherche web de l'agent, sites officiels seulement (étude 18/10) ----

  async function chargerRechercheWeb() {
    const sortie = document.getElementById('reglages-web-resultat');
    try {
      const json = await (await fetchAvecAuth('/api/assistant/recherche-web')).json();
      const inter = document.getElementById('reglages-web-actif');
      const zone = document.getElementById('reglages-web-domaines');
      if (inter) inter.checked = json.actif !== false;
      if (zone) zone.value = (json.domaines || []).join('\n');
      if (sortie) sortie.textContent = '';
    } catch (e) { if (sortie) sortie.textContent = 'Réglages illisibles.'; }
  }

  async function enregistrerRechercheWeb() {
    const sortie = document.getElementById('reglages-web-resultat');
    const inter = document.getElementById('reglages-web-actif');
    const zone = document.getElementById('reglages-web-domaines');
    const domaines = String(zone ? zone.value : '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
    try {
      const r = await fetchAvecAuth('/api/assistant/recherche-web', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actif: !!(inter && inter.checked), domaines }) });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) { if (sortie) sortie.textContent = json.erreur || 'Non enregistré.'; return; }
      if (zone) zone.value = (json.domaines || []).join('\n');
      const ecartes = domaines.length - (json.domaines || []).length;
      if (sortie) sortie.textContent = `Enregistré${ecartes > 0 ? ` (${ecartes} ligne${ecartes > 1 ? 's' : ''} écartée${ecartes > 1 ? 's' : ''} : pas un nom de site)` : ''}. Vaut dès la prochaine conversation.`;
    } catch (e) { if (sortie) sortie.textContent = 'Serveur injoignable.'; }
  }

  // Outil de l'agent : les conversations passées (mémoire gardée sur le serveur de l'étude, 90 jours).
  async function chercherConversationsAgent(e) {
    const q = String((e && e.recherche) || '').slice(0, 200);
    const dossier = String((e && e.dossier_id) || '').slice(0, 80);
    try {
      const r = await fetchAvecAuth(`/api/assistant/conversations/recherche?q=${encodeURIComponent(q)}&dossier=${encodeURIComponent(dossier)}`);
      if (!r.ok) return { erreur: `le serveur a répondu ${r.status}` };
      const json = await r.json();
      return { conversations: json.resultats || [], ...(json.resultats && json.resultats.length ? {} : { aucune: 'aucune conversation passée ne correspond : essaie d’autres mots' }) };
    } catch (err) { return { erreur: 'serveur injoignable' }; }
  }
