// CLAIRE en fenêtre flottante (vrai agent, étude 29-30/10 : l'outil en pleine page, CLAIRE à côté dans une petite fenêtre). Sur un écran
// d'outil (Appel de fonds, Quotités, Contrôle de l'urbanisme…) ou une fiche ouverte en page, un bouton rond en bas à droite ouvre une
// petite fenêtre : les derniers échanges de la conversation avec CLAIRE et une saisie. C'est la MÊME conversation que « Demander à CLAIRE »
// (même agent, mêmes cartes « Autoriser / Refuser », mêmes outils — `outil_champs` remplit l'écran affiché) : rien n'est dupliqué. La fiche
// ouverte rattache la demande à son dossier (un nouveau sujet s'ouvre s'il en citait un autre, client/145). Un outil ouvert depuis la
// discussion d'un dossier (« Ouvrir dans un onglet ») garde CETTE discussion (étude 30/10 : « il faut qu'elle reprenne la conversation » —
// avant, la fenêtre partait sur une conversation neuve, sans le dossier) : ses derniers messages, et la demande y est écrite pour CLAIRE.

var ECRANS_CLAIRE_FLOTTANTE = ['appel-fonds', 'constitution', 'autorisations', 'decompte-vendeur', 'inventaire', 'preemption', 'prorata', 'quotites', 'calculateur', 'confreres', 'clients-biens', 'nouveau', 'agenda', 'suivi'];
var claireFlottante = { ouverte: false, minuterie: null, signature: '', reprise: null, dossierChoisi: null, mention: { ouverte: false, debut: -1, liste: [], choix: 0 } };   // dossierChoisi : { id, nom } pris par « @ »   // reprise : { canal, onglet } — la discussion d'où l'outil a été ouvert
var precisionEcranAgentEnAttente = '';   // dite à l'agent avec la demande, jamais montrée ni gardée dans le titre du sujet (audit 0.404.0, B1)

// Ce que l'agent reçoit en plus de la phrase (puis oublié) : l'écran ouvert.
function precisionEcranAgent() { const p = precisionEcranAgentEnAttente; precisionEcranAgentEnAttente = ''; return p; }

// Pure : le bouton flottant se montre-t-il ? Sur un écran d'outil ou une fiche en page, jamais sur « Demander à CLAIRE » ni sur l'ordinateur
// de CLAIRE, et seulement quand l'agent répond.
function claireFlottanteVisible(onglet, ficheEnPage, agentDisponible, posteClaire) {
  if (posteClaire || !agentDisponible || onglet === 'assistant') return false;
  return !!ficheEnPage || ECRANS_CLAIRE_FLOTTANTE.includes(onglet);
}

function zoneClaireFlottante() {
  let z = document.getElementById('claire-flottante');
  if (!z) {
    z = document.createElement('div');
    z.id = 'claire-flottante';
    z.className = 'claire-flottante';
    z.innerHTML = `<div class="cf-panneau" id="cf-panneau" role="dialog" aria-label="CLAIRE" style="display:none;">
        <div class="cf-tete"><span class="cf-titre">${icone('discussion')}CLAIRE</span><span class="cf-dossier" id="cf-dossier"></span>
          <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="ouvrirConversationDepuisFlottante()" title="Ouvrir la conversation en grand" aria-label="Ouvrir la conversation en grand">${icone('discussion')}</wa-button>
          <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="basculerClaireFlottante(false)" title="Fermer" aria-label="Fermer">${icone('x')}</wa-button></div>
        <div class="cf-messages" id="cf-messages" aria-live="polite"></div>
        <form class="cf-saisie" onsubmit="event.preventDefault(); envoyerDepuisClaireFlottante();">
          <div class="asst-mention cf-mention" id="cf-mention" role="listbox" style="display:none;"></div>
          <textarea id="cf-texte" rows="2" placeholder="Demandez à CLAIRE… @ pour un collègue ou un dossier" oninput="majMentionClaireFlottante()" onkeydown="toucheClaireFlottante(event)"></textarea>
          <wa-button variant="brand" size="s" type="submit">Envoyer</wa-button>
        </form></div>
      <button type="button" class="cf-bouton" id="cf-bouton" onclick="basculerClaireFlottante()" title="Demander à CLAIRE" aria-label="Demander à CLAIRE">${icone('discussion')}</button>`;
    document.body.appendChild(z);
  }
  return z;
}

function majClaireFlottante() {
  // Disponibilité de l'agent lue ici aussi : après un rechargement, Discussions n'a pas forcément été ouverte (audit 0.404.0, M1).
  if (!assistantDisponibilite.quand && !POSTE_CLAIRE && Date.now() - (claireFlottante.essaiDispo || 0) > 30000) { claireFlottante.essaiDispo = Date.now(); chargerDisponibiliteAssistant(); }
  const visible = claireFlottanteVisible(typeof ongletActuel === 'string' ? ongletActuel : '', document.body.classList.contains('fiche-en-page'),
    !!(assistantDisponibilite && assistantDisponibilite.agent), POSTE_CLAIRE);
  const existante = document.getElementById('claire-flottante');
  if (!visible) { if (existante) existante.style.display = 'none'; return; }
  const z = zoneClaireFlottante();
  z.style.display = '';
  const p = document.getElementById('cf-panneau');
  if (p) p.style.display = claireFlottante.ouverte ? '' : 'none';
  if (claireFlottante.ouverte) renderClaireFlottante();
}

function basculerClaireFlottante(force) {
  claireFlottante.ouverte = typeof force === 'boolean' ? force : !claireFlottante.ouverte;
  majClaireFlottante();
  claireFlottante.signature = '';
  if (claireFlottante.ouverte) { renderClaireFlottante(); const z = document.getElementById('cf-messages'); if (z) z.scrollTop = z.scrollHeight; const t = document.getElementById('cf-texte'); if (t) t.focus(); }
}

// Les huit derniers messages de la conversation personnelle (jamais d'un canal), avec leurs boutons (« Autoriser / Refuser »).
function renderClaireFlottante() {
  const zone = document.getElementById('cf-messages');
  if (!zone) return;
  chargerConversationsAssistant();   // collaborateur du poste changé : sa conversation à lui (audit 0.404.0, M2)
  // Redessinée seulement quand quelque chose a changé : on peut remonter dans une réponse, un clic sur « Autoriser » n'est pas perdu (M3).
  const dernier = assistantMessages[assistantMessages.length - 1];
  const signature = [canaux.actif, assistantMessages.length, dernier ? String(dernier.html || '').length + ':' + (dernier.boutons || []).length : '', assistantEnCours, assistantEtapeAgent, dossierOuvert, dossierLieClaireFlottante()].join('|');
  if (signature === claireFlottante.signature) return;
  claireFlottante.signature = signature;
  const enBas = zone.scrollHeight - zone.scrollTop - zone.clientHeight < 60;
  const idLie = dossierLieClaireFlottante();
  const d = idLie ? dossiers.find(x => x.id === idLie) : null;
  const tete = document.getElementById('cf-dossier');
  if (tete) tete.textContent = d ? libelleDossierAffiche(d) : '';
  const canal = canalPourClaireFlottante();
  if (canaux.actif && !canal) { zone.innerHTML = '<p class="cf-vide">Posez votre question : CLAIRE répond ici.</p>'; return; }
  if (canal && tete) tete.textContent = libelleCanal(canal, canaux.liste, dossiers);
  const debut = Math.max(0, assistantMessages.length - 8);
  const html = assistantMessages.slice(debut).map((m, k) => {
    const i = debut + k;
    const boutons = (m.boutons || []).map((b, j) => {
      const cle = `${i}-${j}`;
      assistantActions[cle] = b.action;
      return `<wa-button ${b.principal ? 'variant="brand"' : 'appearance="outlined"'} size="s" type="button" onclick="actionAssistant('${cle}'); renderClaireFlottante();">${escapeHtml(b.libelle)}</wa-button>`;
    }).join('');
    // Dans une discussion partagée, un collègue est nommé au-dessus de son message (le HTML d'un message relu du serveur est passé par htmlSurCanal).
    const auteur = canal && m.role === 'autre' && m.auteur ? `<div class="cf-auteur">${escapeHtml(prenomCollaborateur(m.auteur))}</div>` : '';
    // Un message de la discussion : le même rendu que l'écran Discussions (htmlSurCanal pour ce qui vient du serveur, cartes de proposition).
    const corps = canal ? htmlCorpsMessageCanal(m) : `<div class="asst-texte">${m.html}</div>`;
    return `<div class="cf-m cf-${m.role === 'moi' ? 'moi' : 'claire'}">${auteur}${corps}${boutons ? `<div class="asst-boutons">${boutons}</div>` : ''}</div>`;
  }).join('');
  zone.innerHTML = (html || '<p class="cf-vide">Posez votre question : CLAIRE voit l’écran ouvert et la fiche.</p>')
    + (assistantEnCours ? `<div class="cf-m cf-claire"><div class="asst-attente" aria-label="CLAIRE écrit"><span></span><span></span><span></span>${assistantEtapeAgent ? `<em class="asst-etape">${escapeHtml(assistantEtapeAgent)}</em>` : ''}</div></div>` : '');
  if (enBas) zone.scrollTop = zone.scrollHeight;
}

async function envoyerDepuisClaireFlottante() {
  const champ = document.getElementById('cf-texte');
  const texte = champ ? champ.value.trim() : '';
  if (!texte || (typeof occupeAssistant === 'function' && occupeAssistant())) return;
  const canal = canalPourClaireFlottante();
  fermerMentionClaireFlottante();
  // Un collègue cité (@julie) hors d'une discussion reprise : le message va à l'équipe, pas à CLAIRE (étude 31/10 : « des @ pour interpeller
  // quelqu'un ») — dans le canal du dossier rattaché (il y est prévenu), sinon en message privé avec lui.
  if (!canal) {
    const cites = collegueCitesClaireFlottante(texte);
    if (cites.length && !/(^|[^a-z0-9])@claire(?![a-z0-9])/i.test(texte)) {
      const idLie = dossierLieClaireFlottante(texte);
      const cible = idLie ? 'd:' + idLie : idCanalPriveEntre(utilisateurPoste, cites[0]);
      if (!cible || !utilisateurPoste) { afficherToast('Choisissez d’abord votre nom (collaborateur du poste) pour écrire à un collègue.', 'OK', null); return; }
      try {
        const r = await fetchAvecAuth(`/api/canaux/${encodeURIComponent(cible)}/messages`, { method: 'POST', headers: enteteJsonCanaux(), body: JSON.stringify({ auteur: utilisateurPoste, claire: false, texte, html: '', pj: [], parent: '' }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || `HTTP ${r.status}`);
        champ.value = '';
        claireFlottante.dossierChoisi = null;
        const d = idLie ? dossiers.find(x => x.id === idLie) : null;
        afficherToast(`Message envoyé à ${cites.map(c => prenomCollaborateur(c)).join(', ')}${d ? ` dans la discussion de ${libelleDossierAffiche(d)}` : ' en message privé'}.`, 'OK', null);
        noterVerificationPoste('claire-flottante', { detail: 'collègue interpellé depuis la fenêtre flottante' });
      } catch (e) { afficherToast('Message non envoyé : ' + (e.message || e), 'OK', null); }
      return;
    }
  }
  let demande = texte;
  if (canal) {
    // Dans la discussion du dossier : la demande s'adresse à CLAIRE, sauf si elle cite un collègue (@julie…).
    const prenoms = (canaux.collaborateurs || []).map(c => normaliserPourRecherche(String(c && (c.prenom || c.nom || c) || '').split(/\s+/)[0])).filter(Boolean);
    const aUnCollegue = prenoms.some(p => new RegExp('(^|[^a-z0-9])@' + p + '(?![a-z0-9])').test(normaliserPourRecherche(texte)));
    if (!/(^|[^a-z0-9])@claire(?![a-z0-9])/i.test(texte) && !aUnCollegue) demande = '@CLAIRE ' + texte;
  } else {
    chargerConversationsAssistant();
    // Hors d'un canal ; le sujet de moins de trois heures revient (audit 0.404.0, B2).
    if (canaux.actif) { quitterCanal(); reprendreSujetRecentAssistant(); }
  }
  // Le dossier de la fiche ou celui choisi sur l'écran de l'outil (étude 31/10 : « quand un dossier est sélectionné sur la page, la discussion
  // est rattachée au dossier »), ou celui pris par « @ », rattache la demande ; un autre dossier dans le sujet en cours ouvre un nouveau sujet (client/145).
  const idLie = canal ? '' : dossierLieClaireFlottante(texte);
  if (idLie) {
    if (nouveauSujetAssistant(assistantMessages, assistantContexte.dossierId, idLie, Date.now())) ouvrirNouveauSujetAssistant(idLie);
    else assistantContexte.dossierId = idLie;
    // Le dossier pris par « @ » est imposé à l'agent comme sur la page Discussions (mentionsChoisiesAssistant, client/49).
    if (claireFlottante.dossierChoisi && claireFlottante.dossierChoisi.id === idLie) mentionsChoisiesAssistant.push({ nom: claireFlottante.dossierChoisi.nom, id: idLie });
  }
  claireFlottante.dossierChoisi = null;
  champ.value = '';
  clearInterval(claireFlottante.minuterie);
  claireFlottante.minuterie = setInterval(() => { if (claireFlottante.ouverte) renderClaireFlottante(); }, 700);
  // L'agent sait quel écran est affiché (un nom d'écran de CLAIRE, jamais une donnée) : outil_champs y remplit les champs visibles.
  precisionEcranAgentEnAttente = !document.body.classList.contains('fiche-en-page') && LIBELLES_ONGLETS[ongletActuel] ? `\n(écran ouvert : ${LIBELLES_ONGLETS[ongletActuel]} ; ses champs se remplissent par outil_champs)` : '';
  const avant = assistantMessages.filter(m => m.role === 'claire').length;
  try { await envoyerDemandeAssistant(demande); } finally {
    precisionEcranAgentEnAttente = '';
    clearInterval(claireFlottante.minuterie);
    claireFlottante.minuterie = null;
    renderClaireFlottante();
    if (assistantMessages.filter(m => m.role === 'claire').length > avant) noterVerificationPoste('claire-flottante', { detail: 'demande depuis la fenêtre flottante' });
  }
}

// La discussion partagée que la fenêtre reprend : celle d'un dossier ou un canal libre ouvert dans Discussions, jamais une vue « Enregistrés »
// ni « général » (où CLAIRE ne répond qu'appelée, et qui n'est pas un travail sur un dossier). '' = la conversation personnelle.
// Seulement sur l'écran de l'outil ouvert DEPUIS cette discussion (« Ouvrir dans un onglet », `noterRepriseClaireFlottante`) : une discussion
// restée ouverte ailleurs n'est jamais reprise sur un autre écran ni sur une fiche (relecture 0.407.4 : la question serait partie dans le fil
// partagé d'un autre dossier).
function canalPourClaireFlottante() {
  const r = claireFlottante.reprise;
  const id = canaux.actif;
  if (!r || !id || r.canal !== id || vueSpecialeCanal(id) || id === 'general') return '';
  if (ongletActuel !== r.onglet || document.body.classList.contains('fiche-en-page')) return '';
  const sorte = typeCanal(id);
  return sorte === 'dossier' || sorte === 'libre' ? id : '';
}

// Appelée quand un outil quitte le panneau de la discussion pour son onglet.
function noterRepriseClaireFlottante(onglet) {
  claireFlottante.reprise = canaux.actif ? { canal: canaux.actif, onglet } : null;
  claireFlottante.signature = '';
}

function ouvrirConversationDepuisFlottante() {
  basculerClaireFlottante(false);
  definirOnglet('assistant');
}

function demarrerClaireFlottante() {
  setInterval(majClaireFlottante, 1000);
  // La discussion reprise hors de l'écran Discussions : ses messages sont relus comme sur l'écran (toutes les 8 s), fenêtre ouverte seulement.
  setInterval(() => {
    if (document.hidden || !claireFlottante.ouverte || !canalPourClaireFlottante() || ecranAffiche('assistant') || assistantEnCours) return;
    chargerMessagesCanal(false).then(() => { if (claireFlottante.ouverte) renderClaireFlottante(); });
  }, INTERVALLE_CANAL_ACTIF_MS);
}

// ---- Dossier rattaché et « @ » de la fenêtre flottante (étude 31/10) ----

// Le dossier choisi sur l'écran de l'outil affiché (Appel de fonds, Quotités, Contrôle de l'urbanisme, Constitution, Autorisations, Décompte
// vendeur, Provision), '' sinon. Jamais deviné : la valeur que l'outil garde lui-même.
function dossierEcranClaireFlottante() {
  if (document.body.classList.contains('fiche-en-page')) return '';
  const o = typeof ongletActuel === 'string' ? ongletActuel : '';
  const v = (f) => { try { return String(f() || ''); } catch (e) { return ''; } };
  const id = o === 'appel-fonds' ? v(() => afDossierLie)
    : o === 'quotites' ? v(() => qtDossierLie)
    : o === 'preemption' ? v(() => prEtat && prEtat.dossierId)
    : o === 'constitution' ? v(() => cstEtat && cstEtat.dossierId)
    : o === 'autorisations' ? v(() => autEtat && autEtat.dossierId)
    : o === 'decompte-vendeur' ? v(() => dvEtat && dvEtat.dossierId)
    : o === 'calculateur' ? v(() => provisionDossierId) : '';
  return id && dossiers.some(x => x.id === id) ? id : '';
}

// Le dossier de la demande : celui pris par « @ » (s'il est encore écrit dans la phrase), sinon la fiche ouverte en page, sinon le dossier de
// l'écran de l'outil, sinon la fiche ouverte ailleurs.
function dossierLieClaireFlottante(texte) {
  const c = claireFlottante.dossierChoisi;
  if (c && (texte === undefined || String(texte).includes(c.nom))) return c.id;
  if (document.body.classList.contains('fiche-en-page') && dossierOuvert) return dossierOuvert;
  return dossierEcranClaireFlottante() || dossierOuvert || '';
}

// Les collègues cités dans le texte (« @julie », sans accent ni casse) : leur nom complet. Jamais soi-même ni CLAIRE.
function collegueCitesClaireFlottante(texte) {
  const t = normaliserPourRecherche(String(texte || ''));
  const liste = (canaux && Array.isArray(canaux.collaborateurs) && canaux.collaborateurs.length ? canaux.collaborateurs : RESPONSABLES).map(c => String(c && (c.nom || c) || ''));
  return liste.filter(c => c && c !== utilisateurPoste && new RegExp('(^|[^a-z0-9])@' + normaliserPourRecherche(c.split(/\s+/)[0]) + '(?![a-z0-9])').test(t));
}

function majMentionClaireFlottante() {
  const champ = document.getElementById('cf-texte');
  const menu = document.getElementById('cf-mention');
  if (!champ || !menu) return;
  const avant = champ.value.slice(0, champ.selectionStart || 0);
  const m = avant.match(/(^|\s)@([^\s@]{0,30})$/);
  if (!m) { fermerMentionClaireFlottante(); return; }
  const collabs = (canaux && Array.isArray(canaux.collaborateurs) && canaux.collaborateurs.length ? canaux.collaborateurs : RESPONSABLES).map(c => String(c && (c.nom || c) || ''));
  const liste = mentionsPourCanal(m[2], collabs, dossiers, true, utilisateurPoste);
  if (!liste.length) { fermerMentionClaireFlottante(); return; }
  const prec = claireFlottante.mention;
  claireFlottante.mention = { ouverte: true, debut: avant.length - m[2].length - 1, liste, choix: Math.min(prec.ouverte ? prec.choix : 0, liste.length - 1) };
  menu.innerHTML = liste.map((x, k) => `<button type="button" class="asst-mention-ligne${k === claireFlottante.mention.choix ? ' actif' : ''}" role="option" aria-selected="${k === claireFlottante.mention.choix}" onmousedown="event.preventDefault(); choisirMentionClaireFlottante(${k})">
      <span class="asst-mention-nom">${escapeHtml(x.libelle || x.nom)}</span>${x.note ? `<span class="asst-mention-note">${escapeHtml(x.note)}</span>` : (x.type === 'dossier' ? '<span class="asst-mention-note">rattacher</span>' : '')}</button>`).join('');
  menu.style.display = 'block';
}

function fermerMentionClaireFlottante() {
  claireFlottante.mention = { ouverte: false, debut: -1, liste: [], choix: 0 };
  const menu = document.getElementById('cf-mention');
  if (menu) { menu.style.display = 'none'; menu.innerHTML = ''; }
}

function choisirMentionClaireFlottante(k) {
  const champ = document.getElementById('cf-texte');
  const x = claireFlottante.mention.liste[k];
  if (!champ || !x) return;
  const fin = champ.selectionStart || 0;
  const insere = (x.type === 'dossier' ? x.nom : x.insere) + ' ';
  champ.value = champ.value.slice(0, claireFlottante.mention.debut) + insere + champ.value.slice(fin);
  const pos = claireFlottante.mention.debut + insere.length;
  // Un dossier choisi rattache la demande (en-tête de la fenêtre mis à jour).
  if (x.type === 'dossier' && x.id) { claireFlottante.dossierChoisi = { id: x.id, nom: x.nom }; claireFlottante.signature = ''; renderClaireFlottante(); }
  fermerMentionClaireFlottante();
  champ.focus();
  champ.setSelectionRange(pos, pos);
}

function toucheClaireFlottante(e) {
  const mt = claireFlottante.mention;
  if (mt.ouverte && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    mt.choix = (mt.choix + (e.key === 'ArrowDown' ? 1 : mt.liste.length - 1)) % mt.liste.length;
    majMentionClaireFlottante();
    return;
  }
  if (mt.ouverte && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); choisirMentionClaireFlottante(mt.choix); return; }
  if (mt.ouverte && e.key === 'Escape') { e.preventDefault(); fermerMentionClaireFlottante(); return; }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyerDepuisClaireFlottante(); }
}
