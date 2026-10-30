// CLAIRE en fenêtre flottante (vrai agent, étude 29-30/10 : l'outil en pleine page, CLAIRE à côté dans une petite fenêtre). Sur un écran
// d'outil (Appel de fonds, Quotités, Contrôle de l'urbanisme…) ou une fiche ouverte en page, un bouton rond en bas à droite ouvre une
// petite fenêtre : les derniers échanges de la conversation avec CLAIRE et une saisie. C'est la MÊME conversation que « Demander à CLAIRE »
// (même agent, mêmes cartes « Autoriser / Refuser », mêmes outils — `outil_champs` remplit l'écran affiché) : rien n'est dupliqué. La fiche
// ouverte rattache la demande à son dossier (un nouveau sujet s'ouvre s'il en citait un autre, client/145). Jamais dans un canal.

var ECRANS_CLAIRE_FLOTTANTE = ['appel-fonds', 'constitution', 'autorisations', 'decompte-vendeur', 'inventaire', 'preemption', 'prorata', 'quotites', 'calculateur', 'confreres', 'clients-biens', 'nouveau', 'agenda', 'suivi'];
var claireFlottante = { ouverte: false, minuterie: null, signature: '' };
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
        <div class="cf-tete"><span class="cf-titre">${icone('sparkle')}CLAIRE</span><span class="cf-dossier" id="cf-dossier"></span>
          <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="ouvrirConversationDepuisFlottante()" title="Ouvrir la conversation en grand" aria-label="Ouvrir la conversation en grand">${icone('discussion')}</wa-button>
          <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="basculerClaireFlottante(false)" title="Fermer" aria-label="Fermer">${icone('x')}</wa-button></div>
        <div class="cf-messages" id="cf-messages" aria-live="polite"></div>
        <form class="cf-saisie" onsubmit="event.preventDefault(); envoyerDepuisClaireFlottante();">
          <textarea id="cf-texte" rows="2" placeholder="Demandez à CLAIRE… (elle voit cet écran)" onkeydown="if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); envoyerDepuisClaireFlottante(); }"></textarea>
          <wa-button variant="brand" size="s" type="submit">Envoyer</wa-button>
        </form></div>
      <button type="button" class="cf-bouton" id="cf-bouton" onclick="basculerClaireFlottante()" title="Demander à CLAIRE" aria-label="Demander à CLAIRE">${icone('sparkle')}</button>`;
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
  const signature = [canaux.actif, assistantMessages.length, dernier ? String(dernier.html || '').length + ':' + (dernier.boutons || []).length : '', assistantEnCours, assistantEtapeAgent, dossierOuvert].join('|');
  if (signature === claireFlottante.signature) return;
  claireFlottante.signature = signature;
  const enBas = zone.scrollHeight - zone.scrollTop - zone.clientHeight < 60;
  const d = dossierOuvert ? dossiers.find(x => x.id === dossierOuvert) : null;
  const tete = document.getElementById('cf-dossier');
  if (tete) tete.textContent = d ? libelleDossierAffiche(d) : '';
  if (canaux.actif) { zone.innerHTML = '<p class="cf-vide">Posez votre question : CLAIRE répond ici.</p>'; return; }
  const debut = Math.max(0, assistantMessages.length - 8);
  const html = assistantMessages.slice(debut).map((m, k) => {
    const i = debut + k;
    const boutons = (m.boutons || []).map((b, j) => {
      const cle = `${i}-${j}`;
      assistantActions[cle] = b.action;
      return `<wa-button ${b.principal ? 'variant="brand"' : 'appearance="outlined"'} size="s" type="button" onclick="actionAssistant('${cle}'); renderClaireFlottante();">${escapeHtml(b.libelle)}</wa-button>`;
    }).join('');
    return `<div class="cf-m cf-${m.role === 'moi' ? 'moi' : 'claire'}"><div class="asst-texte">${m.html}</div>${boutons ? `<div class="asst-boutons">${boutons}</div>` : ''}</div>`;
  }).join('');
  zone.innerHTML = (html || '<p class="cf-vide">Posez votre question : CLAIRE voit l’écran ouvert et la fiche.</p>')
    + (assistantEnCours ? `<div class="cf-m cf-claire"><div class="asst-attente" aria-label="CLAIRE écrit"><span></span><span></span><span></span>${assistantEtapeAgent ? `<em class="asst-etape">${escapeHtml(assistantEtapeAgent)}</em>` : ''}</div></div>` : '');
  if (enBas) zone.scrollTop = zone.scrollHeight;
}

async function envoyerDepuisClaireFlottante() {
  const champ = document.getElementById('cf-texte');
  const texte = champ ? champ.value.trim() : '';
  if (!texte || (typeof occupeAssistant === 'function' && occupeAssistant())) return;
  chargerConversationsAssistant();
  // Hors d'un canal ; le sujet de moins de trois heures revient (audit 0.404.0, B2).
  if (canaux.actif) { quitterCanal(); reprendreSujetRecentAssistant(); }
  // La fiche ouverte rattache la demande à son dossier ; un autre dossier dans le sujet en cours ouvre un nouveau sujet (client/145).
  if (dossierOuvert) {
    if (nouveauSujetAssistant(assistantMessages, assistantContexte.dossierId, dossierOuvert, Date.now())) ouvrirNouveauSujetAssistant(dossierOuvert);
    else assistantContexte.dossierId = dossierOuvert;
  }
  champ.value = '';
  clearInterval(claireFlottante.minuterie);
  claireFlottante.minuterie = setInterval(() => { if (claireFlottante.ouverte) renderClaireFlottante(); }, 700);
  // L'agent sait quel écran est affiché (un nom d'écran de CLAIRE, jamais une donnée) : outil_champs y remplit les champs visibles.
  precisionEcranAgentEnAttente = !document.body.classList.contains('fiche-en-page') && LIBELLES_ONGLETS[ongletActuel] ? `\n(écran ouvert : ${LIBELLES_ONGLETS[ongletActuel]} ; ses champs se remplissent par outil_champs)` : '';
  const avant = assistantMessages.filter(m => m.role === 'claire').length;
  try { await envoyerDemandeAssistant(texte); } finally {
    precisionEcranAgentEnAttente = '';
    clearInterval(claireFlottante.minuterie);
    claireFlottante.minuterie = null;
    renderClaireFlottante();
    if (assistantMessages.filter(m => m.role === 'claire').length > avant) noterVerificationPoste('claire-flottante', { detail: 'demande depuis la fenêtre flottante' });
  }
}

function ouvrirConversationDepuisFlottante() {
  basculerClaireFlottante(false);
  definirOnglet('assistant');
}

function demarrerClaireFlottante() {
  setInterval(majClaireFlottante, 1000);
}
