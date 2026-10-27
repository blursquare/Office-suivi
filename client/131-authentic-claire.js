// CLAIRE dans Authentic (étude 27/10 : « construis la fonction de connexion à Authentic avec toutes les fonctions dont on a parlé ; les
// demandes d'action passeront pour le moment par les conversations de CLAIRE, individuelles ou par dossier »). Le navigateur du SERVEUR fait
// le travail (server/src/authenticClaire.js) ; ce poste règle le compte (Réglages › Authentic, administrateur), demande un geste (outil
// `authentic_claire` de « Demander à CLAIRE », proposition d'une routine autorisée dans le canal du dossier) et suit la tâche jusqu'au bout.
// Les demandes CJN et Comedec ont TOUJOURS leur carte « Autoriser » (écriture dans Authentic) ; rien n'est jamais envoyé (Envoi immédiat
// éteint, l'étude envoie elle-même).

var connexionAuthenticClaire = null;   // { actif, adresse, identifiant, motDePasseEnregistre } lu du serveur

async function chargerConnexionAuthenticClaire() {
  try {
    const r = await fetchAvecAuth('/api/authentic-claire/reglages');
    if (r.ok) connexionAuthenticClaire = await r.json();
  } catch (e) { /* serveur injoignable : relu à la prochaine demande */ }
  return connexionAuthenticClaire;
}

// Pure : la personne d'une fiche client d'Authentic retenue sur le dossier est-elle mariée ?
function marieeDansAuthentic(d, p) {
  const fiches = (d && d.authentic && d.authentic.fichesClients) || {};
  const cle = normaliserPourRecherche([p && p.prenom, p && p.nom].filter(Boolean).join(' ')).replace(/[^a-z0-9]+/g, ' ').trim();
  const f = fiches[cle] || Object.values(fiches).find(x => x && cle && normaliserPourRecherche(x.nom || '').replace(/[^a-z0-9]+/g, ' ').trim() === cle);
  return !!(f && f.situationMatrimoniale && /mari/i.test(String(f.situationMatrimoniale.situation || '')));
}

// Pure : les parties de la demande d'état civil (Comedec) — chaque vendeur et acquéreur personne physique que l'étude représente (jamais
// le côté accompagné par un confrère, qui fait ses demandes) ; mariée = situation du couple « marié » de son côté, ou fiche d'Authentic.
function partiesComedecDossier(d) {
  const parties = Array.isArray(d && d.parties) ? d.parties : [];
  const exclus = { ACQUEREUR: notaireParticipantRepresenteAcquereur(d), VENDEUR: confrereRepresenteVendeur(d) };
  return parties.filter(p => p && (p.role === 'VENDEUR' || p.role === 'ACQUEREUR') && !exclus[p.role] && p.qualitePersonne !== 'morale' && String(p.nom || '').trim())
    .map(p => {
      const cote = parties.filter(x => x && x.role === p.role).length;
      const situation = p.role === 'VENDEUR' ? d.situationVendeur : d.situationAcquereur;
      return { nom: String(p.nom || ''), prenom: String(p.prenom || ''), role: p.role, marie: (cote > 1 && situation === 'marie') || marieeDansAuthentic(d, p) };
    });
}

// Pure : pourquoi une demande CJN ne se prépare pas ici ('' = possible). Le casier est interrogé par le notaire qui reçoit l'acte, pour les
// acquéreurs personnes physiques (wiki d'Authentic, CJN § 2.1).
function raisonSansCjn(d) {
  if (!d || estSuccession(d)) return 'pas pour une succession';
  if (d.roleNotaire === 'participant') return 'le notaire qui reçoit l’acte fait la demande de casier';
  const acquereurs = (d.parties || []).filter(p => p && p.role === 'ACQUEREUR');
  if (!acquereurs.length) return 'aucun acquéreur sur la fiche';
  if (acquereurs.every(p => p.qualitePersonne === 'morale')) return 'acquéreur société : Authentic interroge ses représentants rattachés à sa fiche';
  return '';
}

// Lance un geste dans Authentic et suit la tâche du navigateur du serveur jusqu'à la fin (10 minutes au plus). Rend { ok, texte }.
async function gesteAuthenticClaire(chemin, corps) {
  let id = '';
  try {
    const r = await fetchAvecAuth('/api/authentic-claire/' + chemin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, texte: j.erreur || 'refusé par le serveur' };
    id = j.id;
  } catch (e) { return { ok: false, texte: 'serveur injoignable' }; }
  const fin = Date.now() + 10 * 60 * 1000;
  while (Date.now() < fin) {
    await new Promise(ok => setTimeout(ok, 2500));
    try {
      const r = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(id)}`);
      if (!r.ok) continue;
      const t = await r.json();
      const derniere = (t.etapes || []).slice(-1)[0];
      if (derniere && typeof assistantEtapeAgent !== 'undefined') { assistantEtapeAgent = derniere.texte; }
      if (t.etat === 'fini') return { ok: true, texte: (t.resultat && t.resultat.texte) || 'Fait dans Authentic.' };
      if (t.etat === 'erreur' || t.etat === 'annule') return { ok: false, texte: t.erreur || 'arrêté' };
    } catch (e) { /* le serveur redémarre peut-être */ }
  }
  return { ok: false, texte: 'toujours en cours au bout de 10 minutes : le résultat sera dit dans le canal du dossier' };
}

// Outil `authentic_claire` de l'agent : lire un dossier (sans carte : rien n'est écrit dans Authentic), préparer une demande CJN ou
// Comedec (carte « Autoriser » à chaque fois, jamais étendue par « Autoriser pour toute cette demande »).
async function demandeAuthenticAgent(entree) {
  const e = entree || {};
  const d = dossiers.find(x => x.id === e.dossier_id);
  if (!d) return { erreur: 'dossier_id inconnu' };
  const c = connexionAuthenticClaire || await chargerConnexionAuthenticClaire();
  if (!c || !c.actif || !c.identifiant || !c.motDePasseEnregistre) return { erreur: 'connexion de CLAIRE à Authentic non réglée ou éteinte (Réglages › Authentic, administrateur)' };
  if (e.mode === 'lire') {
    const r = await gesteAuthenticClaire('lire', { dossierId: d.id });
    return r.ok ? { fait: true, statut: 'fait', resultat: r.texte } : { erreur: r.texte, statut: 'echec' };
  }
  if (e.mode !== 'cjn' && e.mode !== 'comedec') return { erreur: 'mode inconnu (lire, cjn, comedec)' };
  return preparerFormaliteAuthentic(d, e.mode, { agent: true });
}

// Préparer une demande CJN ou Comedec après « Autoriser » (agent : carte dans la conversation ; routine : la proposition autorisée).
async function preparerFormaliteAuthentic(d, type, o) {
  const parties = type === 'comedec' ? partiesComedecDossier(d) : [];
  if (type === 'cjn' && raisonSansCjn(d)) return { erreur: 'pas de demande de casier ici : ' + raisonSansCjn(d) };
  if (type === 'comedec' && !parties.length) return { erreur: 'aucune partie que l’étude représente sur la fiche' };
  const quoi = type === 'cjn' ? 'Préparer dans Authentic la demande de casier judiciaire (CJN) des acquéreurs'
    : `Préparer dans Authentic la demande d’état civil (Comedec) : ${parties.map(p => `${[p.prenom, p.nom].filter(Boolean).join(' ')} (naissance${p.marie ? ', mariage' : ''})`).join(', ')}`;
  if (o && o.agent && !(await demanderAutorisationAgent(`${quoi} — ${libelleDossierAffiche(d)}. Création rapide allumée, Envoi immédiat éteint : rien n’est envoyé, la demande est à envoyer ensuite depuis Authentic.`, { strict: true }))) {
    return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
  }
  afficherToast(`CLAIRE prépare la demande ${type === 'cjn' ? 'de casier' : 'd’état civil'} dans Authentic (une à deux minutes)…`, 'OK', null);
  const r = await gesteAuthenticClaire('formalite', { dossierId: d.id, type, parties, auteur: utilisateurPoste || '' });
  afficherToast(r.ok ? r.texte : `Demande non préparée : ${r.texte}`, 'OK', null);
  return r.ok ? { fait: true, statut: 'fait', resultat: r.texte } : { erreur: r.texte, statut: 'echec' };
}

// ---- Réglages › Authentic : le compte de l'étude (administrateur) ----

async function renderReglagesConnexionAuthentic() {
  const zone = document.getElementById('reglages-authentic-connexion');
  if (!zone) return;
  const c = await chargerConnexionAuthenticClaire() || { actif: false, adresse: '', identifiant: '', motDePasseEnregistre: false };
  const admin = estAdministrateur(utilisateurPoste);
  const dis = admin ? '' : ' disabled';
  zone.innerHTML = `<div class="reglages-liste">
      <label class="reglages-option" for="authentic-claire-actif">
        <span class="reglages-option-texte"><span class="reglages-option-titre">CLAIRE se connecte à Authentic</span>
          <span class="reglages-option-sous">${c.actif ? (c.motDePasseEnregistre ? 'Allumée' : 'Allumée, mot de passe à enregistrer') : 'Éteinte'}</span></span>
        <wa-switch class="switch reglages-switch" id="authentic-claire-actif"${c.actif ? ' checked' : ''}${dis}></wa-switch>
      </label>
      <div class="reglages-champ"><label for="authentic-claire-adresse">Adresse de connexion</label><input type="text" id="authentic-claire-adresse" value="${escapeAttr(c.adresse || '')}" autocomplete="off"${dis}></div>
      <div class="reglages-champ"><label for="authentic-claire-identifiant">Identifiant</label><input type="text" id="authentic-claire-identifiant" value="${escapeAttr(c.identifiant || '')}" autocomplete="off"${dis}></div>
      <div class="reglages-champ"><label for="authentic-claire-mdp">Mot de passe</label><input type="password" id="authentic-claire-mdp" placeholder="${c.motDePasseEnregistre ? 'Enregistré — laisser vide pour le garder' : ''}" autocomplete="new-password"${dis}></div>
    </div>
    ${admin ? `<div class="reglages-actions">
      <wa-button variant="brand" onclick="enregistrerConnexionAuthentic()">Enregistrer</wa-button>
      <wa-button appearance="outlined" class="secondary" onclick="essayerConnexionAuthentic()">Essayer la connexion</wa-button>
    </div>` : '<p class="hint">Réglé par l’administrateur.</p>'}
    <p class="hint" id="authentic-claire-essai"></p>`;
}

async function enregistrerConnexionAuthentic() {
  const val = (id) => (document.getElementById(id) || {}).value;
  const corps = { auteur: utilisateurPoste || '', actif: !!(document.getElementById('authentic-claire-actif') || {}).checked, adresse: val('authentic-claire-adresse') || '', identifiant: val('authentic-claire-identifiant') || '' };
  const mdp = val('authentic-claire-mdp');
  if (mdp) corps.motDePasse = mdp;
  try {
    const r = await fetchAvecAuth('/api/authentic-claire/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { afficherToast(j.erreur || 'Réglage non enregistré.', 'OK', null); return; }
    connexionAuthenticClaire = j;
    afficherToast('Connexion à Authentic enregistrée.', 'OK', null);
    renderReglagesConnexionAuthentic();
  } catch (e) { afficherToast('Serveur injoignable.', 'OK', null); }
}

async function essayerConnexionAuthentic() {
  const ligne = document.getElementById('authentic-claire-essai');
  if (ligne) ligne.textContent = 'CLAIRE ouvre Authentic dans le navigateur du serveur…';
  const r = await gesteAuthenticClaire('essai', {});
  if (ligne) ligne.textContent = r.ok ? 'Connexion réussie.' : 'Échec : ' + r.texte;
}
