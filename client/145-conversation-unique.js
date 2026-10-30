// Une seule conversation avec CLAIRE, des fils par sujet (vrai agent, étude 30/10 : « une seule, fils par sujet ») — plus de bouton
// « Nouvelle conversation ». La page montre un fil continu : les sujets des sept derniers jours au-dessus (leurs derniers échanges, en
// lecture), puis le sujet en cours. Un nouveau sujet s'ouvre de lui-même quand la demande cite un AUTRE dossier (@) que celui du sujet en
// cours, ou après trois heures sans échange : l'agent repart alors d'une conversation neuve (moins de texte renvoyé, pas de mélange de
// dossiers), le sujet précédent reste dans la colonne de gauche et au-dessus du fil. Rien ne change pour les canaux.

var HEURES_NOUVEAU_SUJET_ASSISTANT = 3;
var SUJETS_PRECEDENTS_ASSISTANT = 3;
var MESSAGES_PAR_SUJET_PRECEDENT = 4;
var JOURS_SUJETS_PRECEDENTS = 7;

// Pure : la demande ouvre-t-elle un nouveau sujet ? Rien quand le sujet en cours est vide.
function nouveauSujetAssistant(messages, dossierDuSujet, dossierImpose, maintenant) {
  const liste = Array.isArray(messages) ? messages.filter(Boolean) : [];
  if (!liste.length) return false;
  const dernier = Math.max(...liste.map(m => Number(m.quand) || 0));
  if (dernier && maintenant - dernier > HEURES_NOUVEAU_SUJET_ASSISTANT * 3600 * 1000) return true;
  return !!(dossierImpose && dossierDuSujet && dossierImpose !== dossierDuSujet);
}

// Pure : les sujets montrés au-dessus du sujet en cours — de moins de 7 jours, les plus anciens d'abord, 3 au plus.
function sujetsPrecedentsAssistant(conversations, idCourant, maintenant) {
  return (Array.isArray(conversations) ? conversations : [])
    .filter(c => c && c.id !== idCourant && Array.isArray(c.messages) && c.messages.length && maintenant - Number(c.majLe || 0) <= JOURS_SUJETS_PRECEDENTS * 86400000)
    .sort((a, b) => b.majLe - a.majLe).slice(0, SUJETS_PRECEDENTS_ASSISTANT).reverse();
}

// Pure : le sujet le plus récent à reprendre à l'ouverture de la page (moins de trois heures), sinon null.
function sujetAReprendreAssistant(conversations, maintenant) {
  const c = (Array.isArray(conversations) ? conversations : []).slice().sort((a, b) => b.majLe - a.majLe)[0];
  return c && maintenant - Number(c.majLe || 0) <= HEURES_NOUVEAU_SUJET_ASSISTANT * 3600 * 1000 ? c : null;
}

// Après un canal quitté sans geste de l'utilisateur (relance en arrière-plan, fenêtre flottante) : le sujet de moins de trois heures revient.
function reprendreSujetRecentAssistant() {
  if (canaux.actif || assistantMessages.length) return;
  const c = sujetAReprendreAssistant(assistantConversations, Date.now());
  if (!c) return;
  assistantConversationId = c.id; assistantMessages = c.messages;
  assistantContexte = { dossierId: '', historique: [], echanges: [], ...c.contexte, attente: null };
  assistantAgentConversation = c.agent || '';
}

// Pure : le HTML d'un ancien message en lecture — sans ses boutons ni ses champs (ils agiraient sur le sujet en cours ; audit 0.404.0, B9).
function htmlAncienMessageAssistant(html) {
  return String(html || '').replace(/<(wa-button|button|textarea|select|wa-switch|wa-select|wa-input|wa-checkbox)\b[\s\S]*?<\/\1>/gi, '').replace(/<(input|wa-input|wa-switch)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+=("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/\sid=("[^"]*"|'[^']*')/gi, '');
}

// Ouvre un sujet neuf au début d'une demande (sans le contrôle « CLAIRE répond encore » : c'est la demande en cours).
function ouvrirNouveauSujetAssistant(dossierId) {
  memoriserConversationAssistant();
  assistantConversationId = '';
  assistantMessages = [];
  oublierConversationAgent();
  oublierDocumentsAgent();
  assistantContexte = { dossierId: dossierId || '', attente: null, historique: [], echanges: [] };
  reinitialiserColonneAssistant();
}

// Les sujets précédents, en lecture : un séparateur « titre · jour » (un clic rouvre le sujet), puis ses derniers échanges.
function htmlSujetsPrecedentsAssistant() {
  if (canaux.actif) return '';
  const maintenant = Date.now();
  const sujets = sujetsPrecedentsAssistant(assistantConversations, assistantConversationId, maintenant);
  if (!sujets.length) return '';
  return sujets.map(c => {
    const msgs = c.messages.slice(-MESSAGES_PAR_SUJET_PRECEDENT);
    return `<div class="asst-jour asst-sujet" role="separator"><button type="button" class="asst-sujet-ouvrir" onclick="ouvrirConversationAssistant('${escapeOnclickArg(c.id)}')" title="Reprendre ce sujet">${escapeHtml(c.titre || 'Sujet')} · ${escapeHtml(libelleJourAssistant(c.majLe, maintenant))}</button></div>`
      + (c.messages.length > msgs.length ? '<div class="asst-sujet-plus">…</div>' : '')
      + msgs.map(m => `<div class="asst-message asst-slack asst-${m.role === 'moi' ? 'moi' : 'claire'} asst-ancien"><div class="asst-corps"><div class="asst-texte">${htmlAncienMessageAssistant(m.html)}</div></div></div>`).join('');
  }).join('') + `<div class="asst-jour asst-sujet asst-sujet-courant" role="separator"><span>${assistantMessages.length ? 'Sujet en cours' : 'Nouveau sujet'}</span></div>`;
}
