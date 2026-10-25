// Réactions (emojis) sur les messages de « Demander à CLAIRE » (étude 25/10, 0.342.0) : comme Slack — une pastille par emoji avec le nombre de
// personnes, un clic la pose ou la retire, « + » ouvre la palette. Dans un canal partagé la réaction est écrite sur le serveur (tous la voient) ;
// dans une conversation personnelle elle reste dans la conversation du poste. Sur une réponse de CLAIRE elle est aussi gardée en mémoire sur le
// serveur (`/api/assistant/reactions`, « Ce que CLAIRE a appris ») et lue par l'agent à son tour de parole suivant (`prefixeReactionsAgent`) :
// 👍 = compris, 👎 = à corriger, ❓ = pas clair… (le sens est du code, `commun/reactions.js`).

function identifiantMessageReaction(m) {
  if (m.id) return m.id;
  if (!m.rid) m.rid = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return m.rid;
}

function messageReactionParCle(cle) {
  return assistantMessages.find(m => (m.id && m.id === cle) || (m.rid && m.rid === cle)) || null;
}

// Pastilles d'un message (vide sans réaction) ; « moi » = pose de ce poste, mise en avant.
function htmlReactionsMessage(m) {
  const liste = Array.isArray(m.reactions) ? m.reactions : [];
  if (!liste.length) return '';
  const cle = escapeOnclickArg(identifiantMessageReaction(m));
  return `<div class="asst-reactions">${liste.map(r => {
    const moi = r.par.includes(utilisateurPoste);
    const noms = r.par.map(p => prenomCollaborateur(p) || p).join(', ');
    return `<button type="button" class="asst-reaction${moi ? ' moi' : ''}" onclick="reagirMessageAssistant('${cle}', '${escapeOnclickArg(r.emoji)}')" title="${escapeAttr(noms)}" aria-pressed="${moi}" aria-label="${escapeAttr(`${r.emoji} ${r.par.length} : ${noms}`)}"><span class="asst-reaction-emoji">${escapeHtml(r.emoji)}</span><span class="asst-reaction-n">${r.par.length}</span></button>`;
  }).join('')}<button type="button" class="asst-reaction asst-reaction-ajout" onclick="ouvrirSelecteurReaction('${cle}', this)" aria-label="Ajouter une réaction" title="Ajouter une réaction">${icone('plus')}</button></div>`;
}

// Boutons de la barre qui apparaît au survol : 👍 d'un clic et la palette.
function htmlBoutonsReactionSurvol(m) {
  const cle = escapeOnclickArg(identifiantMessageReaction(m));
  return `<wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="reagirMessageAssistant('${cle}', '👍')" title="Compris (👍)" aria-label="Réagir avec 👍">👍</wa-button>
    <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="ouvrirSelecteurReaction('${cle}', this)" title="Ajouter une réaction" aria-label="Ajouter une réaction">${icone('smile')}</wa-button>`;
}

function fermerSelecteurReaction() {
  const s = document.getElementById('reaction-selecteur');
  if (s) s.remove();
  document.removeEventListener('mousedown', clicHorsSelecteurReaction, true);
  document.removeEventListener('keydown', toucheSelecteurReaction, true);
}
function clicHorsSelecteurReaction(event) { const s = document.getElementById('reaction-selecteur'); if (s && !s.contains(event.target)) fermerSelecteurReaction(); }
function toucheSelecteurReaction(event) { if (event.key === 'Escape') fermerSelecteurReaction(); }

function ouvrirSelecteurReaction(cle, ancre) {
  const deja = document.getElementById('reaction-selecteur');
  fermerSelecteurReaction();
  if (deja && deja.dataset.cle === cle) return;
  const s = document.createElement('div');
  s.id = 'reaction-selecteur';
  s.className = 'reaction-selecteur';
  s.dataset.cle = cle;
  s.setAttribute('role', 'dialog');
  s.setAttribute('aria-label', 'Choisir une réaction');
  s.innerHTML = EMOJIS_PALETTE.map(e => `<button type="button" class="reaction-choix" onclick="choisirReactionPalette('${escapeOnclickArg(e)}')" aria-label="${escapeAttr(e)}">${escapeHtml(e)}</button>`).join('');
  document.body.appendChild(s);
  const r = ancre.getBoundingClientRect();
  const l = s.offsetWidth;
  const h = s.offsetHeight;
  s.style.left = `${Math.max(8, Math.min(window.innerWidth - l - 8, r.left))}px`;
  s.style.top = `${r.top - h - 6 > 8 ? r.top - h - 6 : Math.min(window.innerHeight - h - 8, r.bottom + 6)}px`;
  document.addEventListener('mousedown', clicHorsSelecteurReaction, true);
  document.addEventListener('keydown', toucheSelecteurReaction, true);
  const premier = s.querySelector('button');
  if (premier) premier.focus();
}

function choisirReactionPalette(emoji) {
  const s = document.getElementById('reaction-selecteur');
  const cle = s ? s.dataset.cle : '';
  fermerSelecteurReaction();
  if (cle === '@saisie') insererEmojiSaisie(emoji);
  else if (cle) reagirMessageAssistant(cle, emoji);
}

// Le geste : un clic pose, un second clic retire.
async function reagirMessageAssistant(cle, emoji) {
  const m = messageReactionParCle(cle);
  if (!m || !emojiValide(emoji)) return;
  const avant = m.reactions;
  m.reactions = basculerReaction(m.reactions, emoji, utilisateurPoste);
  const pose = m.reactions.some(r => r.emoji === emojiValide(emoji) && r.par.includes(utilisateurPoste));
  const claire = m.role === 'claire';
  const extrait = String(m.texte || texteDepuisHtmlCanal(m.html) || '').slice(0, 220);
  renderAssistant();
  try {
    if (canaux.actif && m.id) {
      const r = await fetchAvecAuth(`/api/canaux/${encodeURIComponent(canaux.actif)}/messages/${encodeURIComponent(m.id)}/reaction`, { method: 'POST', headers: enteteJsonCanaux(), body: JSON.stringify({ auteur: utilisateurPoste, emoji, actif: pose }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (claire) noterVerificationPoste('assistant-reactions', { detail: 'réaction sur une réponse de CLAIRE' });
      chargerMessagesCanal(true);
    } else {
      memoriserConversationAssistant(false);
      if (claire) {
        const r = await fetchAvecAuth('/api/assistant/reactions', { method: 'POST', headers: enteteJsonCanaux(), body: JSON.stringify({ auteur: utilisateurPoste, emoji, messageId: identifiantMessageReaction(m), extrait, dossierId: assistantContexte.dossierId || '', pose }) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        noterVerificationPoste('assistant-reactions', { detail: 'réaction sur une réponse de CLAIRE' });
      }
    }
  } catch (e) {
    m.reactions = avant;
    renderAssistant();
    afficherToast('Réaction non enregistrée : ' + (e.message || e), 'OK', null);
  }
}

// Ce que CLAIRE lit à son tour de parole : les réactions posées sur SES réponses depuis la dernière fois (une seule fois chacune).
// Phrase du poste, masquée par le serveur comme toute phrase ; jamais affichée dans le fil.
function prefixeReactionsAgent(messages, moi) {
  messages = messages || assistantMessages;
  moi = moi || utilisateurPoste;
  const lignes = [];
  const lues = [];
  messages.filter(m => m.role === 'claire' && Array.isArray(m.reactions) && m.reactions.length).slice(-20).forEach(m => {
    const signature = m.reactions.map(r => r.emoji + r.par.join('+')).join('|');
    if (m.reactionsVues === signature) return;
    const extrait = String(m.texte || texteDepuisHtmlCanal(m.html) || '').replace(/\s+/g, ' ').slice(0, 120);
    const dites = m.reactions.map(r => `${r.par.map(p => (p === moi ? 'moi' : (prenomCollaborateur(p) || p))).join(', ')} : ${r.emoji} (${phraseSensReaction(sensReaction(r.emoji))})`).join(' ; ');
    lignes.push(`- sur ta réponse « ${extrait} » — ${dites}`);
    lues.push([m, signature]);
  });
  return { texte: lignes.length ? `(Réactions posées depuis ta dernière réponse, à prendre en compte sans les commenter longuement :\n${lignes.join('\n')})\n\n` : '', lues };
}

function marquerReactionsLuesAgent(lues) { (lues || []).forEach(([m, signature]) => { m.reactionsVues = signature; }); }
