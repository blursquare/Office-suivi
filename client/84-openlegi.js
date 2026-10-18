  // Sources juridiques officielles par OpenLegi (étude 18/10 : « on va connecter openlegi à CLAIRE » ; Légifrance, BOFiP, registre
  // national des entreprises ; agent seulement). Le serveur est le client MCP (server/src/openlegi.js) : ce poste n'appelle que
  // POST /api/openlegi/appel quand l'agent le demande, et règle le jeton dans Réglages › IA et relecture d'actes.

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
