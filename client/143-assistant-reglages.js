  // ---- Réglages modifiables par « Demander à CLAIRE » (vrai agent, étape 3 ; étude 29/10 : « liste blanche courte ») ----
  // Seuls : allumer ou éteindre une routine (jamais changer un niveau d'autonomie), ajouter ou retirer un site des sources de la recherche
  // web, allumer ou éteindre l'index des documents du NAS. Jamais un secret, une connexion, Exchange, la mise à jour ni un niveau 2/3 :
  // ces réglages restent dans l'écran. Chaque changement passe par la carte « Autoriser » et par la MÊME route que l'écran (le serveur
  // garde ses propres contrôles : routines réservées à l'administrateur). Les modèles d'emails (modele_email) et les consignes (memoriser)
  // ont leurs outils.

  var REGLAGES_AGENT = ['routine', 'source_web', 'index_nas'];

  async function lireJsonAgent(chemin, options) {
    const r = await fetchAvecAuth(chemin, options);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.erreur || `le serveur a répondu ${r.status}`);
    return json;
  }

  async function reglagesLisiblesAgent() {
    const [routines, web, index] = await Promise.all([
      lireJsonAgent('/api/routines').catch(() => null), lireJsonAgent('/api/assistant/recherche-web').catch(() => null), lireJsonAgent('/api/index-nas/etat').catch(() => null)]);
    const reg = routines && routines.reglages ? routines.reglages : {};
    return {
      routines: routines ? (routines.catalogue || []).map(r => ({ cle: r.id, nom: r.nom || r.id, allumee: !!(reg.actif !== false && reg.routines && reg.routines[r.id] && reg.routines[r.id].actif) })) : 'illisibles',
      routines_toutes_allumees: routines ? reg.actif !== false : undefined,
      sources_web: web ? { recherche_allumee: web.actif !== false, sites: web.domaines || [] } : 'illisibles',
      index_nas: index ? { allume: !!(index.reglages && index.reglages.actif), lus: index.lus, fichiers: index.fichiers } : 'illisible'
    };
  }

  async function modifierReglageAgent(e) {
    const mode = e && e.mode;
    if (POSTE_CLAIRE) return { erreur: 'jamais de réglage depuis l’ordinateur de CLAIRE' };
    if (mode === 'lire') return reglagesLisiblesAgent();
    if (mode !== 'modifier') return { erreur: 'mode inconnu (lire ou modifier)' };
    const reglage = String(e.reglage || '');
    const cle = String(e.cle || '').trim();
    const valeur = String(e.valeur || '').trim();
    if (!REGLAGES_AGENT.includes(reglage)) return { erreur: 'réglage hors de la liste permise (routine, source_web, index_nas) : les autres se changent dans Réglages' };
    if (reglage !== 'source_web' && !ADMINISTRATEURS.includes(utilisateurPoste)) return { erreur: 'réservé à un administrateur (Bastien ou Sophie)' };
    try {
      if (reglage === 'routine') {
        const etat = await lireJsonAgent('/api/routines');
        const r = (etat.catalogue || []).find(x => x.id === cle);
        if (!r) return { erreur: 'routine inconnue : lis d’abord les réglages (mode lire) pour sa clé' };
        if (!['allumee', 'eteinte'].includes(valeur)) return { erreur: 'valeur : allumee ou eteinte' };
        const ok = await demanderAutorisationAgent(`${valeur === 'allumee' ? 'Allumer' : 'Éteindre'} la routine « ${r.nom || r.id} » (Réglages › Routines, pour toute l’étude)`, { strict: valeur === 'allumee' });
        if (!ok) return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
        await lireJsonAgent('/api/routines/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routines: { [cle]: { actif: valeur === 'allumee' } }, auteur: utilisateurPoste }) });
        return { fait: true, routine: r.nom || r.id, allumee: valeur === 'allumee' };
      }
      if (reglage === 'source_web') {
        const site = valeur.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(site)) return { erreur: 'valeur : un nom de site (« legifrance.gouv.fr »)' };
        if (!['ajouter', 'retirer'].includes(cle)) return { erreur: 'cle : ajouter ou retirer' };
        const web = await lireJsonAgent('/api/assistant/recherche-web');
        const sites = (web.domaines || []).slice();
        const present = sites.includes(site);
        if ((cle === 'ajouter') === present) return { deja: true, message: `le site ${site} est ${present ? 'déjà dans' : 'déjà absent de'} la liste` };
        const ok = await demanderAutorisationAgent(`${cle === 'ajouter' ? 'Ajouter' : 'Retirer'} le site ${site} ${cle === 'ajouter' ? 'aux' : 'des'} sources de la recherche web (Réglages › IA et relecture d’actes, pour toute l’étude)`, { strict: cle === 'ajouter' });
        if (!ok) return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
        const nouveaux = cle === 'ajouter' ? sites.concat(site) : sites.filter(x => x !== site);
        const rep = await lireJsonAgent('/api/assistant/recherche-web', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actif: web.actif !== false, domaines: nouveaux }) });
        return { fait: true, sites: rep.domaines || nouveaux };
      }
      if (!['allume', 'eteint'].includes(valeur)) return { erreur: 'valeur : allume ou eteint' };
      const ok = await demanderAutorisationAgent(`${valeur === 'allume' ? 'Allumer' : 'Éteindre'} la lecture en fond des documents du NAS des dossiers en cours (Réglages › Mémoire de CLAIRE)`, { strict: valeur === 'allume' });
      if (!ok) return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
      await lireJsonAgent('/api/index-nas/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actif: valeur === 'allume' }) });
      return { fait: true, index_nas_allume: valeur === 'allume' };
    } catch (err) {
      return { erreur: 'réglage non enregistré : ' + String(err && err.message || err).slice(0, 160) };
    }
  }
