// Donner une tâche qui m'est assignée à un collègue (étude 30/10 : « me permettre de donner des tâches qui me sont assignées à un autre
// collaborateur » ; choix : RÉATTRIBUER). Le rappel change de liste (même identifiant, nouveau `auteur`) ; le collègue en est prévenu par un
// message écrit sous mon nom dans notre conversation personnelle (comme « Demander à un collègue »). « Annuler » la remet dans ma liste.

// Pure : les collègues à qui je peux donner une tâche (tous sauf moi).
function colleguesPourTache(moi) {
  return Object.keys(COLLABORATEURS_AGENT).map((p) => ({ prenom: p, nom: COLLABORATEURS_AGENT[p] })).filter((c) => c.nom !== moi);
}

// Pure : le rappel tel qu'il est une fois donné — même identifiant, la liste du collègue, la mention de qui l'a donné.
function rappelDonne(r, collegue, donneur) {
  const texte = String(r.texte || '').replace(/\s*\(donné par [^)]*\)$/, '');
  return Object.assign({}, r, { auteur: collegue, texte: `${texte.slice(0, 170)} (donné par ${prenomCollaborateur(donneur)})`.slice(0, 200), donnePar: donneur });
}

function fermerMenuDonnerTache() {
  const m = document.getElementById('menu-donner-tache');
  if (m) m.remove();
  document.removeEventListener('mousedown', fermerMenuDonnerTacheSiAilleurs);
}
function fermerMenuDonnerTacheSiAilleurs(e) {
  const m = document.getElementById('menu-donner-tache');
  if (m && e && m.contains(e.target)) return;
  fermerMenuDonnerTache();
}

function ouvrirMenuDonnerTache(id, bouton) {
  if (document.getElementById('menu-donner-tache')) { fermerMenuDonnerTache(); return; }
  const m = document.createElement('div');
  m.id = 'menu-donner-tache';
  m.className = 'asst-menu-joindre';
  m.setAttribute('role', 'menu');
  m.innerHTML = colleguesPourTache(utilisateurPoste).map((c) => `<button type="button" role="menuitem" onclick="donnerRappelPerso('${escapeOnclickArg(id)}', '${escapeOnclickArg(c.nom)}')"><span>Donner à ${escapeHtml(c.prenom)}</span></button>`).join('');
  document.body.appendChild(m);
  const r = bouton.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - m.offsetHeight - 8)) + 'px';
  setTimeout(() => document.addEventListener('mousedown', fermerMenuDonnerTacheSiAilleurs), 0);
}

async function donnerRappelPerso(id, collegue, silencieux) {
  fermerMenuDonnerTache();
  const r = rappelsPerso.find((x) => x.id === id);
  if (!r || !collegue || collegue === utilisateurPoste) return { erreur: 'tâche ou collègue introuvable' };
  const donne = rappelDonne(r, collegue, utilisateurPoste);
  try {
    const rep = await fetchAvecAuth('/api/rappels-perso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rappel: donne }) });
    if (!rep.ok) throw new Error((await rep.json().catch(() => ({}))).erreur || `HTTP ${rep.status}`);
  } catch (e) {
    afficherToast(`Tâche non donnée : ${e.message}`, 'OK', null);
    return { erreur: e.message };
  }
  rappelsPerso = rappelsPerso.filter((x) => x.id !== id);
  renderAlertesDashboard(dossiersPerimetreDashboard());
  const canal = idCanalPriveEntre(utilisateurPoste, collegue);
  if (canal) {
    const d = r.dossierId ? dossiers.find((x) => x.id === r.dossierId) : null;
    const texte = `Je vous donne cette tâche : ${String(r.texte || '').replace(/\s*\(demandé par [^)]*\)$/, '')}${d ? ` — ${libelleDossierAffiche(d)}` : ''}${r.echeance ? ` (pour le ${formatDateFr(r.echeance)})` : ''}`.slice(0, 1800);
    try { await fetchAvecAuth(`/api/canaux/${encodeURIComponent(canal)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auteur: utilisateurPoste, texte }) }); } catch (e) { /* la tâche est donnée, le message sera juste absent */ }
  }
  if (!silencieux) afficherToast(`Tâche donnée à ${prenomCollaborateur(collegue)}.`, 'Annuler', async () => {
    try {
      await fetchAvecAuth('/api/rappels-perso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rappel: r }) });
    } catch (e) { /* rien */ }
    chargerRappelsPerso();
  });
  return { fait: true, a: collegue };
}

// Outil `donner_tache` de l'agent (règle du dépôt, étude 28/10 : toute fonction faisable par « Demander à CLAIRE ») : lister ses tâches
// personnelles à faire, ou en donner une à un collègue après la carte « Autoriser » — la même fonction que le bouton de la tâche.
async function donnerTacheAgent(entree) {
  const e = entree || {};
  if (e.mode === 'lister') {
    const taches = rappelsPerso.filter((r) => r && !r.fait && !r.agendaItemId).slice(0, 40).map((r) => {
      const d = r.dossierId ? dossiers.find((x) => x.id === r.dossierId) : null;
      return { tache_id: r.id, texte: String(r.texte || '').slice(0, 200), date: r.echeance || '', dossier: d ? libelleDossierAffiche(d) : '' };
    });
    return { taches, nombre: taches.length };
  }
  if (e.mode !== 'donner') return { erreur: 'mode inconnu (lister ou donner)' };
  const collegue = COLLABORATEURS_AGENT[e.collaborateur];
  if (!collegue) return { erreur: 'collaborateur : Bastien, Julie, Jérémy ou Sophie' };
  if (collegue === utilisateurPoste) return { erreur: 'c’est l’utilisateur lui-même : la tâche est déjà dans sa liste' };
  const r = rappelsPerso.find((x) => x.id === e.tache_id && !x.fait);
  if (!r) return { erreur: 'tache_id inconnu ou tâche déjà faite : appelle d’abord le mode lister' };
  if (r.agendaItemId) return { erreur: 'tâche posée dans l’agenda (rendez-vous rouge) : à changer dans Outlook' };
  if (!(await demanderAutorisationAgent(`Donner à ${prenomCollaborateur(collegue)} la tâche « ${String(r.texte || '').slice(0, 160)} » : elle quitte votre liste et passe dans la sienne ; un message le prévient dans votre conversation personnelle.`))) {
    return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
  }
  const res = await donnerRappelPerso(r.id, collegue, true);
  return res && res.fait ? { fait: true, statut: 'fait', resultat: `Tâche donnée à ${prenomCollaborateur(collegue)}.` } : { erreur: (res && res.erreur) || 'tâche non donnée', statut: 'echec' };
}
