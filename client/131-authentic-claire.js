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

// Pure : les demandes d'état civil et de casier DÉJÀ faites dans Authentic, d'après les lignes vues sur la page du dossier (`d.authentic.etatsCivils`) :
// { naissance: [libellés], mariage: [libellés], casier: [libellés] } en minuscules sans accents. Une ligne « négatif » (rien délivré) peut être redemandée.
function etatsCivilsDejaDemandes(d) {
  const r = { naissance: [], mariage: [], casier: [] };
  Object.values((d && d.authentic && d.authentic.etatsCivils) || {}).forEach(e => {
    if (!e || e.etat === 'negatif') return;
    const l = normaliserPourRecherche(String(e.label || ''));
    // Un casier « non délivré / refusé / rejeté » n'a pas abouti : à redemander.
    if (e.casier && /non\s*delivr|refus|rejet|erreur/.test(normaliserPourRecherche(String(e.statut || '')))) return;
    if (e.casier) r.casier.push(l);
    else if (/naissance/.test(l)) r.naissance.push(l);
    else if (/mariage/.test(l)) r.mariage.push(l);
  });
  return r;
}

// Pure : un libellé de la liste ci-dessus porte-t-il tous les mots du nom et du prénom de la personne (nom ET prénom : le nom seul désignerait aussi le conjoint) ?
function libelleDitPersonne(libelles, p) {
  const mots = normaliserPourRecherche([p && p.prenom, p && p.nom].filter(Boolean).join(' ')).split(/[^a-z0-9]+/).filter(m => m.length > 1);
  // Mots ENTIERS du libellé (« Ann » n'est pas dans « Anne », « Roy » n'est pas dans « Royer »).
  return mots.length >= 2 && (libelles || []).some(l => { const jetons = String(l).split(/[^a-z0-9]+/); return mots.every(m => jetons.includes(m)); });
}

// Pure : restreint les parties d'une demande Comedec à un type (« vendeurs » / « acquereurs ») et/ou à UNE personne désignée par son nom (étude 29/10 :
// « les Comedec uniquement pour une personne par son nom, ou pour un type de personne »). Rend { parties } ou { erreur } (jamais un nom dans l'erreur) :
// aucune partie ne correspond, ou plusieurs personnes correspondent au nom donné (préciser le prénom).
function ciblerPartiesComedec(parties, role, personne) {
  let liste = Array.isArray(parties) ? parties : [];
  const r = normaliserPourRecherche(String(role || '')).replace(/[^a-z]/g, '');
  if (/^vendeur/.test(r)) liste = liste.filter(p => p.role === 'VENDEUR');
  else if (/^acquereur|^acheteur/.test(r)) liste = liste.filter(p => p.role === 'ACQUEREUR');
  else if (r) return { erreur: 'role inconnu : vendeurs ou acquereurs' };
  const mots = normaliserPourRecherche(String(personne || '')).split(/[^a-z0-9]+/).filter(m => m.length > 1);
  if (String(personne || '').trim() && !mots.length) return { erreur: 'nom de personne inexploitable : préciser le nom' };
  if (mots.length) {
    const trouvees = liste.filter(p => { const siens = normaliserPourRecherche([p.prenom, p.nom].filter(Boolean).join(' ')).split(/[^a-z0-9]+/); return mots.every(m => siens.includes(m)); });
    if (!trouvees.length) return { erreur: 'aucune partie de la fiche ne correspond à cette personne' };
    if (trouvees.length > 1) return { erreur: 'plusieurs personnes de la fiche correspondent à ce nom : préciser le prénom' };
    liste = trouvees;
  }
  if (!liste.length) return { erreur: 'aucune partie à demander pour ce choix' };
  return { parties: liste };
}

// Pure : les parties de la demande d'état civil (Comedec) — chaque vendeur et acquéreur personne physique que l'étude représente (jamais
// le côté accompagné par un confrère, qui fait ses demandes) ; mariée = situation du couple « marié » de son côté, ou fiche d'Authentic.
function partiesComedecDossier(d, opt) {
  const parties = Array.isArray(d && d.parties) ? d.parties : [];
  const deja = etatsCivilsDejaDemandes(d);
  const exclus = { ACQUEREUR: notaireParticipantRepresenteAcquereur(d), VENDEUR: confrereRepresenteVendeur(d) };
  const liste = parties.filter(p => p && (p.role === 'VENDEUR' || p.role === 'ACQUEREUR') && !exclus[p.role] && p.qualitePersonne !== 'morale' && String(p.nom || '').trim())
    .map(p => {
      const cote = parties.filter(x => x && x.role === p.role).length;
      const situation = p.role === 'VENDEUR' ? d.situationVendeur : d.situationAcquereur;
      const base = { nom: String(p.nom || ''), prenom: String(p.prenom || '') };
      return { nom: base.nom, prenom: base.prenom, role: p.role, marie: (cote > 1 && situation === 'marie') || marieeDansAuthentic(d, p), naissance: !neALEtrangerAuthentic(d, p),
        dejaNaissance: libelleDitPersonne(deja.naissance, base), dejaMariage: libelleDitPersonne(deja.mariage, base) };
    });
  // Le mariage d'un couple de parties est UN seul acte : demandé pour un seul des deux époux (étude 29/10). Conjoint non partie : jamais listé.
  // Seulement quand le couple est AVÉRÉ : deux personnes de ce côté et situation du couple « marié » (jamais deux co-vendeurs mariés chacun à un
  // conjoint extérieur, d'après leur seule fiche — relecture 0.396.2).
  [['VENDEUR', d && d.situationVendeur], ['ACQUEREUR', d && d.situationAcquereur]].forEach(([role, situation]) => {
    const cote = liste.filter(p => p.role === role);
    if (cote.length === 2 && situation === 'marie' && cote.every(p => p.marie)) {
      if (!(opt && opt.sansDedoublonnage)) cote[1].marie = false;
      // Le mariage du couple est UN seul acte : demandé pour l'un des deux, il l'est pour les deux (même ciblé sur une seule personne).
      if (cote.some(p => p.dejaMariage)) cote.forEach(p => { p.dejaMariage = true; });
    }
  });
  return liste;
}

// Pure : la personne est-elle née à l'étranger d'après sa fiche client d'Authentic (pays de naissance renseigné et autre que la France) ET
// d'une nationalité connue qui n'est pas la française ? Comedec ne délivre pas ces actes (étude 29/10) : pas de demande de naissance pour elle.
// Née à l'étranger mais de nationalité française (acte transcrit en France) : demandée (étude 29/10) ; nationalité inconnue : demandée aussi
// (une demande qu'Authentic ne laisse pas cocher est dite, sans bloquer les autres).
function neALEtrangerAuthentic(d, p) {
  const fiches = (d && d.authentic && d.authentic.fichesClients) || {};
  const cle = normaliserPourRecherche([p && p.prenom, p && p.nom].filter(Boolean).join(' ')).replace(/[^a-z0-9]+/g, ' ').trim();
  const f = fiches[cle] || Object.values(fiches).find(x => x && cle && normaliserPourRecherche(x.nom || '').replace(/[^a-z0-9]+/g, ' ').trim() === cle);
  const pays = normaliserPourRecherche(String((f && f.paysNaissance) || '')).replace(/[^a-z]+/g, ' ').trim();
  // France et ses départements d'outre-mer : actes tenus en France, demandés comme les autres.
  const neEnFrance = !pays || /^(france.*|fr|republique francaise|la reunion|reunion|guadeloupe|martinique|guyane|guyane francaise|mayotte)$/.test(pays);
  if (neEnFrance) return false;
  const nationalite = normaliserPourRecherche(String((f && f.nationalite) || '')).replace(/[^a-z]+/g, ' ').trim();
  if (!nationalite || /francais|france/.test(nationalite)) return false;
  return true;
}

// Pure : les acquéreurs personnes physiques de la fiche (demande de casier : chaque intervenant coché par Authentic doit en être un).
function acquereursCjnDossier(d) {
  return (Array.isArray(d && d.parties) ? d.parties : []).filter(p => p && p.role === 'ACQUEREUR' && p.qualitePersonne !== 'morale' && String(p.nom || '').trim())
    .map(p => ({ nom: String(p.nom || ''), prenom: String(p.prenom || ''), role: p.role, marie: false }));
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
    await new Promise(ok => setTimeout(ok, 1500));
    try {
      const r = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(id)}`);
      if (!r.ok) continue;
      const t = await r.json();
      const derniere = (t.etapes || []).slice(-1)[0];
      if (derniere && typeof assistantEtapeAgent !== 'undefined') { assistantEtapeAgent = derniere.texte; }
      // Étude 29/10 : « mets-moi en direct ce qu'il se passe lors d'une demande, comme pour le cadastre » : l'aperçu s'ouvre dès la première
      // capture et se met à jour à chaque relevé (étape en cours sous l'image) ; il reste après un échec.
      if (t.avecCapture && (t.etat === 'en-cours' || t.etat === 'attente')) afficherApercuAuthentic(id, derniere ? derniere.texte : 'CLAIRE travaille dans Authentic…', { enCours: true });
      // Fin de la tâche (étude 30/10 : « à la fin de la tâche fermer la fenêtre Authentic en direct ») : l'aperçu en direct se ferme ; un échec
      // garde le sien (où CLAIRE s'est arrêtée).
      if (t.etat === 'fini' || t.etat === 'annule') fermerApercuDirectAuthentic(id);
      if (t.etat === 'fini') return { ok: true, texte: (t.resultat && t.resultat.texte) || 'Fait dans Authentic.' };
      if (t.etat === 'erreur' || t.etat === 'annule') {
        // Étude 29/10 : « mets-moi un aperçu du navigateur là où ça plante, en bas à droite, que je peux fermer » (jamais pour un arrêt voulu).
        if (t.etat === 'erreur' && t.avecCapture) afficherApercuAuthentic(id, t.erreur || 'arrêté');
        return { ok: false, texte: t.erreur || 'arrêté' };
      }
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
  // Relu à chaque demande : un réglage changé par l'administrateur sur un autre poste compte tout de suite (audit 0.376.0).
  const c = await chargerConnexionAuthenticClaire() || connexionAuthenticClaire;
  if (!c || !c.actif || !c.identifiant || !c.motDePasseEnregistre) return { erreur: 'connexion de CLAIRE à Authentic non réglée ou éteinte (Réglages › Authentic, administrateur)' };
  if (c.refuseLe) return { erreur: 'Authentic a refusé l’identifiant ou le mot de passe : à corriger dans Réglages › Authentic' };
  if (e.mode === 'lire') {
    const r = await gesteAuthenticClaire('lire', { dossierId: d.id, auteur: utilisateurPoste || '', fiches: e.fiches === 'toutes' ? 'toutes' : '' });
    return r.ok ? { fait: true, statut: 'fait', resultat: r.texte } : { erreur: r.texte, statut: 'echec' };
  }
  if (e.mode !== 'cjn' && e.mode !== 'comedec') return { erreur: 'mode inconnu (lire, cjn, comedec)' };
  // Écrire dans Authentic est éteint par défaut (plan du 27/10) : l'administrateur l'allume dans Réglages › Authentic.
  if (!c.preparerDemandes) return { erreur: 'préparer des demandes dans Authentic est éteint (Réglages › Authentic, administrateur) : CLAIRE ne fait que lire', statut: 'echec' };
  return preparerFormaliteAuthentic(d, e.mode, { agent: true, role: e.mode === 'comedec' ? e.role : '', personne: e.mode === 'comedec' ? e.personne : '', actes: e.mode === 'comedec' ? e.actes : '', refaire: e.refaire === true });
}

// Outil `authentic_pilote` de l'agent : Claude PILOTE Authentic (étude 29/10, server/src/authenticPilote.js). Il voit les écrans EN CLAIRE chez Anthropic : éteint par
// défaut (Réglages › Authentic, administrateur, avec confirmation), carte « Autoriser » stricte à chaque fois, jamais étendue à toute la demande.
async function pilotageAuthenticAgent(entree) {
  const e = entree || {};
  const consigne = String(e.consigne || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (consigne.length < 5) return { erreur: 'consigne vide' };
  const d = e.dossier_id ? dossiers.find(x => x.id === e.dossier_id) : null;
  if (e.dossier_id && !d) return { erreur: 'dossier_id inconnu' };
  const c = await chargerConnexionAuthenticClaire() || connexionAuthenticClaire;
  if (!c || !c.actif || !c.identifiant || !c.motDePasseEnregistre) return { erreur: 'connexion de CLAIRE à Authentic non réglée ou éteinte (Réglages › Authentic, administrateur)' };
  if (c.refuseLe) return { erreur: 'Authentic a refusé l’identifiant ou le mot de passe : à corriger dans Réglages › Authentic' };
  if (!c.piloteClaude) return { erreur: 'Claude ne pilote pas Authentic : éteint (Réglages › Authentic, administrateur)', statut: 'echec' };
  if (!c.preparerDemandes) return { erreur: 'écrire dans Authentic est éteint (Réglages › Authentic, administrateur) : Claude ne pourrait que regarder', statut: 'echec' };
  if (!(await demanderAutorisationAgent(`Laisser Claude piloter Authentic${d ? ' — ' + libelleDossierAffiche(d) : ''} : « ${consigne.slice(0, 300)} ». Claude verra les écrans d’Authentic EN CLAIR chez Anthropic — noms, dates de naissance, mais aussi pièces d’identité, RIB et actes du dossier — SANS l’anonymisation de CLAIRE ; il ne clique jamais envoyer, signer ni supprimer, et ne valide qu’avec « Envoi immédiat » éteint. Une à sept minutes, aperçu en direct en bas à droite.`, { strict: true }))) {
    return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
  }
  afficherToast('Claude prend la main sur Authentic (une à sept minutes)…', 'OK', null);
  const r = await gesteAuthenticClaire('pilote', { dossierId: d ? d.id : '', consigne, auteur: utilisateurPoste || '' });
  afficherToast(r.ok ? 'Claude a fini dans Authentic.' : `Pilotage arrêté : ${r.texte}`, 'OK', null);
  return r.ok ? { fait: true, statut: 'fait', resultat: r.texte } : { erreur: r.texte, statut: 'echec' };
}

// Préparer une demande CJN ou Comedec après « Autoriser » (agent : carte dans la conversation ; routine : la proposition autorisée).
async function preparerFormaliteAuthentic(d, type, o) {
  let parties = type === 'comedec' ? partiesComedecDossier(d, { sansDedoublonnage: !!(o && o.personne) }) : acquereursCjnDossier(d);
  // Comedec pour un type de personne (vendeurs / acquéreurs) ou une seule personne désignée par son nom (étude 29/10).
  if (type === 'comedec' && o && (o.role || o.personne)) {
    const c = ciblerPartiesComedec(parties, o.role, o.personne);
    if (c.erreur) return { erreur: c.erreur, statut: 'echec' };
    parties = c.parties;
  }
  // Un seul acte demandé (« l'acte de naissance », « le mariage ») : l'autre n'est jamais demandé, même si la ligne d'Authentic le laisserait croire.
  if (type === 'comedec' && o && (o.actes === 'naissance' || o.actes === 'mariage')) {
    parties = parties.map(p => Object.assign({}, p, o.actes === 'naissance' ? { pasMariage: true, marie: false } : { pasNaissance: true }));
  }
  // Refaire (étude 30/10 : « il a fait une erreur et demandé qu'un seul acte de naissance ; il faut avoir la possibilité de recommencer ») : la
  // demande déjà préparée par CLAIRE ne bloque plus (le serveur la laisse passer) ; ce qu'Authentic montre déjà demandé n'est toujours pas redemandé
  // (relecture 0.405.1 : sinon doublon de l'acte déjà demandé) — seul le manquant part.
  const refaire = !!(o && o.refaire);
  if (type === 'cjn' && raisonSansCjn(d)) return { erreur: 'pas de demande de casier ici : ' + raisonSansCjn(d) };
  if (type === 'comedec' && !parties.length) return { erreur: 'aucune partie que l’étude représente sur la fiche' };
  // Rien à redemander : chaque demande voulue figure déjà sur la page du dossier dans Authentic (étude 29/10 : « ne pas le redemander »).
  // Court-circuit seulement quand TOUT est déjà demandé (naissance ET mariage de chaque partie) : sinon le serveur décide ligne par ligne (un libellé
  // « épouse de » peut demander un mariage que la fiche ne connaît pas) et dit « déjà demandé » si rien n'est à faire (relecture 0.396.11).
  if (!refaire && type === 'comedec' && parties.every(p => (p.naissance === false || p.dejaNaissance || p.pasNaissance) && (p.dejaMariage || p.pasMariage))) return { fait: true, statut: 'fait', resultat: 'Déjà demandé dans Authentic : rien à redemander pour ces parties.' };
  if (type === 'cjn' && !refaire) { const casier = etatsCivilsDejaDemandes(d).casier; if (parties.length && parties.every(p => libelleDitPersonne(casier, p))) return { fait: true, statut: 'fait', resultat: 'Casier judiciaire déjà demandé dans Authentic pour ces acquéreurs : rien à redemander.' }; }
  const quoi = type === 'cjn' ? 'Préparer dans Authentic la demande de casier judiciaire (CJN) des acquéreurs'
    : `Préparer dans Authentic la demande d’état civil (Comedec) : ${parties.map(p => `${[p.prenom, p.nom].filter(Boolean).join(' ')} (${[p.naissance === false || p.pasNaissance ? '' : 'naissance', p.marie && !p.pasMariage ? 'mariage' : ''].filter(Boolean).join(', ') || 'rien à demander'}${p.naissance === false ? ' ; née à l’étranger : pas de naissance par Comedec' : ''})`).join(', ')}`;
  const avertRefaire = refaire ? ' Une demande a déjà été préparée : seuls les actes qui n’y figurent pas sont demandés ; la précédente reste dans Authentic.' : '';
  if (o && o.agent && !(await demanderAutorisationAgent(`${quoi} — ${libelleDossierAffiche(d)}. Création rapide allumée, Envoi immédiat éteint : rien n’est envoyé, la demande est à envoyer ensuite depuis Authentic.${avertRefaire}`, { strict: true }))) {
    return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
  }
  afficherToast(`CLAIRE prépare la demande ${type === 'cjn' ? 'de casier' : 'd’état civil'} dans Authentic (une à deux minutes)…`, 'OK', null);
  const r = await gesteAuthenticClaire('formalite', { dossierId: d.id, type, parties, auteur: utilisateurPoste || '', refaire });
  afficherToast(r.ok ? r.texte : `Demande non préparée : ${r.texte}`, 'OK', null);
  return r.ok ? { fait: true, statut: 'fait', resultat: r.texte } : { erreur: r.texte, statut: 'echec' };
}

// ---- Réglages › Authentic : le compte de l'étude (administrateur) ----

async function renderReglagesConnexionAuthentic(o) {
  const zone = document.getElementById('reglages-authentic-connexion');
  if (!zone) return;
  if (zone.dataset.rendu === '1' && !(o && o.forcer)) return;
  const c = await chargerConnexionAuthenticClaire() || { actif: false, adresse: '', identifiant: '', motDePasseEnregistre: false };
  const admin = estAdministrateur(utilisateurPoste);
  const dis = admin ? '' : ' disabled';
  // Le formulaire n'est redessiné qu'à l'ouverture (ou après un enregistrement) : un relevé d'Authentic qui rafraîchit le journal
  // n'efface plus un mot de passe en cours de saisie (relecture 0.373.0).
  if (zone.dataset.rendu === '1' && !(o && o.forcer)) return;
  zone.dataset.rendu = '1';
  zone.innerHTML = `<div class="reglages-liste">
      <label class="reglages-option" for="authentic-claire-actif">
        <span class="reglages-option-texte"><span class="reglages-option-titre">CLAIRE se connecte à Authentic</span>
          <span class="reglages-option-sous">${c.refuseLe ? `Arrêtée : Authentic a refusé l’identifiant ou le mot de passe le ${formatDateFr(String(c.refuseLe).slice(0, 10))} — corrigez-les pour reprendre` : c.actif ? (c.motDePasseEnregistre ? 'Allumée' : 'Allumée, mot de passe à enregistrer') : 'Éteinte'}</span></span>
        <wa-switch class="switch reglages-switch" id="authentic-claire-actif"${c.actif ? ' checked' : ''}${dis}></wa-switch>
      </label>
      <label class="reglages-option" for="authentic-claire-demandes">
        <span class="reglages-option-texte"><span class="reglages-option-titre">Préparer des demandes dans Authentic <span class="mot-et-info">(CJN, Comedec) ${infoBulle('Éteint, CLAIRE ne fait que LIRE Authentic. Allumé, elle peut créer une demande de casier judiciaire ou d’état civil après « Autoriser » — Création rapide, Envoi immédiat éteint : rien n’est jamais envoyé.')}</span></span>
          <span class="reglages-option-sous">${c.preparerDemandes ? 'Allumé : CLAIRE peut créer une demande, jamais l’envoyer' : 'Éteint : lecture seule'}</span></span>
        <wa-switch class="switch reglages-switch" id="authentic-claire-demandes"${c.preparerDemandes ? ' checked' : ''}${dis}></wa-switch>
      </label>
      <label class="reglages-option" for="authentic-claire-pilote">
        <span class="reglages-option-texte"><span class="reglages-option-titre">Claude peut piloter Authentic <span class="mot-et-info">(à la demande) ${infoBulle('Claude voit alors les pages d’Authentic — noms, adresses, dates de naissance, pièces d’identité, RIB, actes — EN CLAIR chez Anthropic, sans l’anonymisation de CLAIRE : une capture d’écran ne se masque pas. Il ne clique jamais un bouton qui envoie, signe, supprime ou archive, et ne valide qu’avec « Envoi immédiat » éteint. Chaque demande passe par la carte « Autoriser ». Il faut aussi que « Préparer des demandes » soit allumé.')}</span></span>
          <span class="reglages-option-sous">${c.piloteClaude ? 'Allumé' + (c.piloteClaudeLe ? ' par ' + escapeHtml(c.piloteClaudeLe) : '') + ' : les écrans d’Authentic partent en clair chez Anthropic quand Claude pilote' : 'Éteint : Claude ne voit jamais les écrans d’Authentic'}</span></span>
        <wa-switch class="switch reglages-switch" id="authentic-claire-pilote"${c.piloteClaude ? ' checked' : ''}${dis}></wa-switch>
      </label>
      <div class="reglages-champ"><label for="authentic-claire-adresse">Adresse de connexion</label><input type="text" id="authentic-claire-adresse" value="${escapeAttr(c.adresse || '')}" autocomplete="off"${dis}></div>
      <div class="reglages-champ"><label for="authentic-claire-identifiant">Identifiant</label><input type="text" id="authentic-claire-identifiant" value="${escapeAttr(c.identifiant || '')}" autocomplete="off"${dis}></div>
      <div class="reglages-champ"><label for="authentic-claire-mdp">Mot de passe</label><input type="password" id="authentic-claire-mdp" placeholder="${c.motDePasseEnregistre ? 'Enregistré — laisser vide pour le garder' : ''}" autocomplete="new-password"${dis}></div>
    </div>
    ${admin ? `<div class="reglages-actions">
      <wa-button variant="brand" onclick="enregistrerConnexionAuthentic()">Enregistrer</wa-button>
      <wa-button appearance="outlined" class="secondary" onclick="essayerConnexionAuthentic()">Essayer la connexion</wa-button>
    </div>` : '<p class="hint">Réglé par l’administrateur.</p>'}
    <p class="hint" id="authentic-claire-essai"></p>
    ${(c.refus || []).length ? `<div class="reglages-sous-titre">Clics refusés par CLAIRE ${infoBulle('Chaque clic de CLAIRE dans Authentic est contrôlé : un bouton qui envoie, signe, supprime, paraphe ou archive n’est jamais cliqué. Ces refus sont normaux ; s’ils se répètent, un parcours a buté sur un écran inattendu.')}</div>
      <ul class="authentic-refus">${c.refus.map(x => `<li>${escapeHtml(new Date(x.quand).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} — ${escapeHtml(x.motif)}${x.libelle ? ` : « ${escapeHtml(x.libelle)} »` : ''}</li>`).join('')}</ul>` : ''}`;
}

async function enregistrerConnexionAuthentic() {
  const val = (id) => (document.getElementById(id) || {}).value;
  const pilote = !!(document.getElementById('authentic-claire-pilote') || {}).checked;
  const piloteAvant = !!(connexionAuthenticClaire && connexionAuthenticClaire.piloteClaude);
  const corps = { auteur: utilisateurPoste || '', piloteClaude: pilote, actif: !!(document.getElementById('authentic-claire-actif') || {}).checked, preparerDemandes: !!(document.getElementById('authentic-claire-demandes') || {}).checked, adresse: val('authentic-claire-adresse') || '', identifiant: val('authentic-claire-identifiant') || '' };
  const mdp = val('authentic-claire-mdp');
  if (mdp) corps.motDePasse = mdp;
  // Allumer le pilotage par Claude = les écrans d'Authentic (noms, dates de naissance) partent EN CLAIRE chez Anthropic : confirmation explicite, comme
  // la désactivation de l'anonymisation (étude 29/10). Rien n'est enregistré sans elle (le serveur la refuse aussi).
  if (pilote && !piloteAvant) {
    renderReglagesConnexionAuthentic({ forcer: true });
    demanderConfirmation('Allumer le pilotage d’Authentic par Claude ? Quand Claude pilote, il voit les pages d’Authentic — noms, adresses, dates de naissance, pièces d’identité, RIB et actes des clients — EN CLAIR chez Anthropic, SANS l’anonymisation de CLAIRE : une capture d’écran ne se masque pas. Aucun accord de sous-traitance n’est encore attesté. Il ne clique jamais envoyer, signer, supprimer ni archiver, et chaque demande passe par la carte « Autoriser ».',
      () => envoyerConnexionAuthentic(Object.assign({}, corps, { piloteClaude: true, confirmePilote: true })), { bouton: 'Allumer le pilotage', ton: 'danger' });
    return;
  }
  await envoyerConnexionAuthentic(corps);
}

async function envoyerConnexionAuthentic(corps) {
  try {
    const r = await fetchAvecAuth('/api/authentic-claire/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { afficherToast(j.erreur || 'Réglage non enregistré.', 'OK', null); return; }
    connexionAuthenticClaire = j;
    afficherToast('Connexion à Authentic enregistrée.', 'OK', null);
    renderReglagesConnexionAuthentic({ forcer: true });
  } catch (e) { afficherToast('Serveur injoignable.', 'OK', null); }
}

async function essayerConnexionAuthentic() {
  const ligne = document.getElementById('authentic-claire-essai');
  if (ligne) ligne.textContent = 'CLAIRE ouvre Authentic dans le navigateur du serveur…';
  const r = await gesteAuthenticClaire('essai', { auteur: utilisateurPoste || '' });
  if (ligne) ligne.textContent = r.ok ? 'Connexion réussie.' : 'Échec : ' + r.texte;
}

// ---- Aperçu du navigateur de CLAIRE quand un geste dans Authentic échoue ----
// La dernière capture d'écran de la tâche (prise par le serveur au moment de l'échec, gardée en mémoire du serveur seulement, jamais envoyée
// à une IA ni au rapport technique) s'affiche en bas à droite, avec le message d'échec ; fermable (×), un clic sur l'image l'agrandit.
var apercuAuthenticDernier = null;   // { id, texte } : le dernier échec, pour « Demander à CLAIRE » (outil `authentic_apercu`) — jamais une tâche en direct
var apercuAuthenticUrl = '';
var apercuAuthenticFermes = {};   // tâches dont l'utilisateur a fermé l'aperçu : plus d'aperçu en direct pour elles

function fermerApercuAuthentic() {
  const carte = document.getElementById('apercu-authentic');
  if (carte) {
    carte.remove();
    const id = carte.dataset.tache || '';
    if (id) {
      apercuAuthenticFermes[id] = true;
      // La capture (pages d'Authentic) est effacée de la mémoire du serveur à la fermeture.
      fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(id)}/capture`, { method: 'DELETE' }).catch(() => {});
      if (apercuAuthenticDernier && apercuAuthenticDernier.id === id) apercuAuthenticDernier = null;
    }
  }
  if (apercuAuthenticUrl) { URL.revokeObjectURL(apercuAuthenticUrl); apercuAuthenticUrl = ''; }
}

// Ferme l'aperçu EN DIRECT de cette tâche (jamais celui d'un échec, ni celui d'une autre tâche).
function fermerApercuDirectAuthentic(idTache) {
  // Marquée d'abord : une capture en direct encore en route (demandée avant la fin) ne rouvrira pas la carte (relecture 0.407.6).
  apercuAuthenticFermes[String(idTache)] = true;
  const carte = document.getElementById('apercu-authentic');
  if (carte && carte.dataset.tache === String(idTache) && carte.dataset.mode === 'direct') fermerApercuAuthentic();
}

// Bouton « Arrêter » de l'aperçu en direct (étude 30/10 : « un bouton stop de secours pendant le déroulé de la tâche ») : le serveur arrête la
// tâche à l'étape suivante du parcours (`annuler` des tâches du navigateur) ; rien d'autre n'est cliqué dans Authentic après l'arrêt.
async function arreterTacheAuthentic(idTache, bouton) {
  if (bouton) { bouton.loading = true; bouton.disabled = true; }
  try {
    const r = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(idTache)}/annuler`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    const t = document.querySelector('#apercu-authentic .apercu-authentic-texte');
    if (t) t.textContent = j.ok ? 'Arrêt demandé : CLAIRE s’arrête à l’étape suivante.' : 'La tâche est déjà terminée.';
    if (typeof noterVerificationPoste === 'function') noterVerificationPoste('authentic-arret', { detail: j.ok ? 'arrêt demandé' : 'déjà terminée' });
  } catch (e) {
    if (bouton) { bouton.loading = false; bouton.disabled = false; }
    afficherToast('Serveur injoignable : arrêt non demandé.', 'OK', null);
  }
}

// Pure : le texte court sous l'aperçu (le message d'échec ne cite jamais un nom : libellés génériques du parcours).
function texteApercuAuthentic(texte) {
  return String(texte || 'échec dans Authentic').replace(/\s+/g, ' ').trim().slice(0, 300);
}

async function afficherApercuAuthentic(idTache, texte, o = {}) {
  if (o.enCours && apercuAuthenticFermes[String(idTache)]) return false;
  const info = { id: String(idTache), texte: texteApercuAuthentic(texte) };
  if (!o.enCours) apercuAuthenticDernier = info;
  try {
    const r = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(idTache)}/capture`);
    if (!r.ok) return false;
    const blob = await r.blob();
    // Relu APRÈS l'attente (relecture 0.407.5) : une capture en direct arrivée après la fin de la tâche ne rouvre rien, et ne remplace jamais
    // l'aperçu d'un échec de la même tâche.
    const deja = document.getElementById('apercu-authentic');
    if (o.enCours && (apercuAuthenticFermes[String(idTache)] || (deja && deja.dataset.tache === String(idTache) && deja.dataset.mode === 'echec'))) return false;
    const url = URL.createObjectURL(blob);
    const titre = o.enCours ? 'Authentic — en direct' : 'Authentic — où CLAIRE s’est arrêtée';
    const existante = document.getElementById('apercu-authentic');
    // En direct : la même carte, seule l'image et le texte changent (pas de clignotement, l'agrandissement est gardé).
    const mode = o.enCours ? 'direct' : 'echec';
    if (existante && existante.dataset.tache === String(idTache) && existante.dataset.mode === mode) {
      const img = existante.querySelector('img');
      const ancienneUrl = apercuAuthenticUrl;
      if (img) img.src = url;
      apercuAuthenticUrl = url;
      if (ancienneUrl) URL.revokeObjectURL(ancienneUrl);
      const t = existante.querySelector('.apercu-authentic-texte'); if (t) t.textContent = info.texte;
      const h = existante.querySelector('.apercu-authentic-tete span'); if (h) h.textContent = titre;
      return true;
    }
    // L'ancienne carte part SANS effacer la capture du serveur de cette tâche (c'est la même qui s'affiche).
    if (existante) existante.remove();
    if (apercuAuthenticUrl) URL.revokeObjectURL(apercuAuthenticUrl);
    apercuAuthenticUrl = url;
    const carte = document.createElement('div');
    carte.id = 'apercu-authentic';
    carte.dataset.tache = String(idTache);
    carte.dataset.mode = mode;
    carte.className = 'apercu-authentic';
    carte.setAttribute('role', 'status');
    carte.innerHTML = `<div class="apercu-authentic-tete"><span>${titre}</span>`
      + `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" onclick="fermerApercuAuthentic()" title="Fermer l’aperçu" aria-label="Fermer l’aperçu">${icone('x')}</wa-button></div>`
      + `<img alt="Page du navigateur de CLAIRE dans Authentic" src="${url}" tabindex="0" role="button" title="Agrandir ou réduire" onclick="this.classList.toggle('agrandie')" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.classList.toggle('agrandie'); }">`
      + `<p class="apercu-authentic-texte">${escapeHtml(info.texte)}</p>`
      + (o.enCours ? `<wa-button variant="danger" size="s" type="button" class="apercu-authentic-arret" onclick="arreterTacheAuthentic('${escapeOnclickArg(String(idTache))}', this)" title="Arrête la tâche de CLAIRE dans Authentic à l’étape suivante">${icone('x')} Arrêter</wa-button>`
        : `<wa-button appearance="outlined" size="s" type="button" onclick="copierStructureApercuAuthentic()" title="Copie la structure de la page (boutons, listes, positions), sans aucune valeur ni nom, à coller dans la conversation pour réparer le parcours">Copier la structure de la page</wa-button>`);
    document.body.appendChild(carte);
    requestAnimationFrame(() => carte.classList.add('visible'));
    if (typeof noterVerificationPoste === 'function') noterVerificationPoste('apercu-authentic', { detail: 'aperçu affiché' });
    return true;
  } catch (e) { return false; }
}

// Copie la structure (sans valeurs) de la page où la tâche s'est arrêtée : le serveur la garde avec la capture. Étude 29/10 : « Claude en secours ».
async function copierStructureApercuAuthentic() {
  if (!apercuAuthenticDernier) return;
  try {
    const r = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(apercuAuthenticDernier.id)}/structure`);
    if (!r.ok) { afficherToast('Structure de la page indisponible (relancez le geste).', 'OK', null); return; }
    const texte = await r.text();
    let ok = false;
    try { await navigator.clipboard.writeText(texte); ok = true; } catch (_) { /* adresse IP sans HTTPS : repli ci-dessous */ }
    if (!ok) {
      const z = document.createElement('textarea'); z.value = texte; z.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(z); z.select();
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      z.remove();
    }
    if (ok && typeof noterVerificationPoste === 'function') noterVerificationPoste('structure-page-authentic', { detail: 'structure copiée' });
    afficherToast(ok ? 'Structure de la page copiée : collez-la dans la conversation.' : 'Copie impossible depuis ce navigateur.', 'OK', null);
  } catch (e) { afficherToast('Structure de la page indisponible.', 'OK', null); }
}

// « Demander à CLAIRE » (outil `authentic_apercu`) : rouvre l'aperçu du dernier échec dans Authentic sur ce poste. L'IA ne reçoit jamais l'image :
// seulement « affiché » ou « aucun échec récent ».
async function apercuAuthenticAgent() {
  if (!apercuAuthenticDernier) return { fait: false, message: 'aucun échec récent dans Authentic sur ce poste' };
  const ok = await afficherApercuAuthentic(apercuAuthenticDernier.id, apercuAuthenticDernier.texte);
  return ok ? { fait: true, message: 'aperçu affiché en bas à droite de l’écran de l’utilisateur (fermable)' } : { fait: false, message: 'la capture n’est plus disponible (le serveur la garde peu de temps) : relancer le geste' };
}
