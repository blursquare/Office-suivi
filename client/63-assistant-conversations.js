  // ---- « Demander à CLAIRE » : plusieurs conversations (étude 12/10 : « mettre une sidebar dans Demander à CLAIRE pour suivre
  // plusieurs conversations ») ----
  // Une colonne à gauche de la page liste les conversations (Aujourd'hui, Hier, 7 derniers jours, Plus anciennes) ; un clic en
  // reprend une, « Nouvelle conversation » en ouvre une autre, la croix en supprime une. Choix de l'étude : gardées SUR LE POSTE
  // (navigateur, localStorage, par collaborateur), jamais sur le serveur ni en ligne ; 30 jours, 20 au plus. Les boutons d'une
  // réponse (fonctions) ne survivent pas à un rechargement : le texte reste, les gestes se redemandent. La conversation de l'agent
  // côté serveur (30 min) est reprise si elle vit encore, sinon l'agent repart de zéro et le dit.

  var JOURS_CONVERSATIONS_ASSISTANT = 30;
  var MAX_CONVERSATIONS_ASSISTANT = 20;
  var MAX_HTML_MESSAGE_ASSISTANT = 20000;
  var assistantConversations = [];          // [{ id, titre, creeLe, majLe, messages, contexte, agent }]
  var assistantConversationId = '';
  var cleConversationsChargees = null;
  var minuterieConversationsAssistant = null;

  function cleStockageConversationsAssistant() {
    return 'claire-assistant-conversations:' + (typeof utilisateurPoste === 'string' && utilisateurPoste ? utilisateurPoste : 'poste');
  }

  // Pure : le titre d'une conversation = sa première demande, en texte, 60 caractères au plus.
  function titreConversationAssistant(messages) {
    const m = (messages || []).find(x => x && x.role === 'moi');
    if (!m) return 'Nouvelle conversation';
    const t = String(m.html || '').replace(/<div class="asst-pj-liste">[\s\S]*?<\/div>/g, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    return t.length > 60 ? t.slice(0, 59).trimEnd() + '…' : (t || 'Nouvelle conversation');
  }

  // Pure : les conversations à garder — non vides, de moins de 30 jours, les 20 plus récentes, la plus récente d'abord.
  function conversationsAGarderAssistant(liste, maintenant) {
    const limite = (maintenant || Date.now()) - JOURS_CONVERSATIONS_ASSISTANT * 86400000;
    return (Array.isArray(liste) ? liste : [])
      .filter(c => c && typeof c.id === 'string' && Array.isArray(c.messages) && c.messages.length && Number(c.majLe) >= limite)
      .sort((a, b) => b.majLe - a.majLe).slice(0, MAX_CONVERSATIONS_ASSISTANT);
  }

  // Pure : ce qui est écrit dans le navigateur — sans les boutons (des fonctions) ni l'attente d'un nom de dossier.
  function serialiserConversationsAssistant(liste, maintenant) {
    return JSON.stringify(conversationsAGarderAssistant(liste, maintenant).map(c => ({
      id: c.id, titre: c.titre || titreConversationAssistant(c.messages), creeLe: c.creeLe || c.majLe, majLe: c.majLe, agent: c.agent || '',
      messages: c.messages.slice(-60).map(m => ({ role: m.role === 'moi' ? 'moi' : 'claire', html: String(m.html || '').slice(0, MAX_HTML_MESSAGE_ASSISTANT), quand: Number(m.quand) || c.majLe })),
      contexte: { dossierId: (c.contexte && c.contexte.dossierId) || '', historique: ((c.contexte && c.contexte.historique) || []).slice(-6), echanges: ((c.contexte && c.contexte.echanges) || []).slice(-6) }
    })));
  }

  // Pure : relit le stockage ; une valeur illisible ou d'une autre forme donne une liste vide, jamais une erreur.
  function lireConversationsAssistant(texte, maintenant) {
    let brut;
    try { brut = JSON.parse(texte || '[]'); } catch (e) { return []; }
    return conversationsAGarderAssistant((Array.isArray(brut) ? brut : []).map(c => c && typeof c === 'object' ? {
      id: String(c.id || ''), titre: String(c.titre || ''), creeLe: Number(c.creeLe) || 0, majLe: Number(c.majLe) || 0, agent: typeof c.agent === 'string' ? c.agent : '',
      messages: (Array.isArray(c.messages) ? c.messages : []).filter(m => m && typeof m.html === 'string')
        .map(m => ({ role: m.role === 'moi' ? 'moi' : 'claire', html: m.html, boutons: [], quand: Number(m.quand) || 0 })),
      contexte: { dossierId: c.contexte && typeof c.contexte.dossierId === 'string' ? c.contexte.dossierId : '', attente: null,
        historique: Array.isArray(c.contexte && c.contexte.historique) ? c.contexte.historique : [],
        echanges: Array.isArray(c.contexte && c.contexte.echanges) ? c.contexte.echanges : [] }
    } : null), maintenant);
  }

  // Pure : les groupes de la colonne, dans l'ordre.
  function groupesConversationsAssistant(liste, maintenant) {
    const n = new Date(maintenant || Date.now());
    const minuit = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    const groupes = [{ titre: 'Aujourd’hui', min: minuit }, { titre: 'Hier', min: minuit - 86400000 },
      { titre: '7 derniers jours', min: minuit - 7 * 86400000 }, { titre: 'Plus anciennes', min: -Infinity }].map(g => ({ ...g, conversations: [] }));
    (liste || []).forEach(c => { const g = groupes.find(x => c.majLe >= x.min); if (g) g.conversations.push(c); });
    return groupes.filter(g => g.conversations.length);
  }

  function chargerConversationsAssistant() {
    const cle = cleStockageConversationsAssistant();
    if (cleConversationsChargees === cle) return;
    // Changement de collaborateur sur le poste : la conversation affichée n'est pas la sienne.
    if (cleConversationsChargees !== null) {
      ecrireConversationsAssistant();
      // Une carte d'autorisation en attente vaut refus (relecture 13/10 : la boucle de l'agent restait suspendue, l'assistant bloqué).
      refuserAutorisationEnAttente();
      assistantMessages = []; assistantContexte = { dossierId: '', attente: null, historique: [], echanges: [] }; assistantAgentConversation = '';
      mentionsChoisiesAssistant = []; oublierDocumentsAgent();
    }
    cleConversationsChargees = cle;
    let texte = '';
    try { texte = localStorage.getItem(cle) || ''; } catch (e) { texte = ''; }
    assistantConversations = lireConversationsAssistant(texte, Date.now());
    assistantConversationId = '';
  }

  // La conversation affichée (globaux de client/49 et 61) recopiée dans la liste, puis écrite (au plus une fois par seconde).
  // `nouveauMessage` : seule une conversation qui reçoit un message remonte en tête (relecture : la parcourir ne la date pas).
  function memoriserConversationAssistant(nouveauMessage) {
    if (canaux.actif) return;   // le fil d'un canal est celui du serveur, jamais une conversation personnelle
    if (!assistantMessages.length) return;
    if (!assistantConversationId) assistantConversationId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    let c = assistantConversations.find(x => x.id === assistantConversationId);
    if (!c) { c = { id: assistantConversationId, creeLe: Date.now(), majLe: Date.now() }; assistantConversations.unshift(c); }
    c.messages = assistantMessages;
    c.contexte = assistantContexte;
    c.agent = typeof assistantAgentConversation === 'string' ? assistantAgentConversation : '';
    if (nouveauMessage) c.majLe = Date.now();
    c.titre = titreConversationAssistant(c.messages);
    clearTimeout(minuterieConversationsAssistant);
    minuterieConversationsAssistant = setTimeout(ecrireConversationsAssistant, 1000);
  }

  var stockagePleinSignale = false;
  function ecrireConversationsAssistant() {
    clearTimeout(minuterieConversationsAssistant);
    minuterieConversationsAssistant = null;
    if (cleConversationsChargees === null) return;
    assistantConversations = conversationsAGarderAssistant(assistantConversations, Date.now());
    // Stockage du navigateur plein : on retire les plus anciennes (jamais celle affichée) jusqu'à ce que ça tienne, et on le dit une fois.
    let liste = assistantConversations;
    while (!ecrireLocal(cleConversationsChargees, serialiserConversationsAssistant(liste, Date.now()))) {
      const ancienne = liste.slice().reverse().find(c => c.id !== assistantConversationId);
      if (!ancienne) return;
      liste = liste.filter(c => c !== ancienne);
      if (!stockagePleinSignale) { stockagePleinSignale = true; afficherToast('Stockage du navigateur plein : les plus anciennes conversations ne sont plus gardées.', 'OK', null); }
    }
    assistantConversations = liste;
  }
  // Une réponse reçue juste avant un rechargement (F5, mise à jour automatique) est écrite tout de suite.
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', () => { if (minuterieConversationsAssistant) ecrireConversationsAssistant(); });
  }

  function occupeAssistant() {
    if (!assistantEnCours && !assistantTraitementEnCours) return false;
    afficherToast('CLAIRE répond encore : attendez la fin de sa réponse.', 'OK', null);
    return true;
  }

  function ouvrirConversationAssistant(id) {
    if ((id === assistantConversationId && !canaux.actif) || occupeAssistant()) { fermerFilsMobileAssistant(); return; }
    quitterCanal();
    memoriserConversationAssistant();
    const c = assistantConversations.find(x => x.id === id);
    if (!c) return;
    assistantConversationId = c.id;
    assistantMessages = c.messages;
    assistantContexte = { dossierId: '', historique: [], echanges: [], ...c.contexte, attente: null };
    assistantAgentConversation = c.agent || '';
    mentionsChoisiesAssistant = [];
    // Les document_id de l'agent ne valent que pour la conversation qui les a reçus.
    oublierDocumentsAgent();
    fermerFilsMobileAssistant();
    renderAssistant();
  }

  // Une nouvelle conversation : la précédente reste dans la liste.
  function commencerConversationAssistant() {
    if (occupeAssistant()) return false;
    quitterCanal();
    memoriserConversationAssistant();
    assistantConversationId = '';
    fermerFilsMobileAssistant();
    return true;
  }

  function supprimerConversationAssistant(id) {
    if (id === assistantConversationId && occupeAssistant()) return;
    memoriserConversationAssistant();
    const supprimee = assistantConversations.find(x => x.id === id);
    if (!supprimee) return;
    assistantConversations = assistantConversations.filter(x => x !== supprimee);
    if (id === assistantConversationId) {
      assistantConversationId = '';
      assistantMessages = [];
      assistantContexte = { dossierId: dossierOuvert || '', attente: null, historique: [], echanges: [] };
      assistantAgentConversation = '';
      oublierDocumentsAgent();
    }
    ecrireConversationsAssistant();
    renderAssistant();
    // Un toucher de travers sur téléphone (la croix y est toujours visible) se rattrape.
    afficherToast('Conversation supprimée.', 'Annuler', () => {
      assistantConversations = conversationsAGarderAssistant([supprimee, ...assistantConversations.filter(x => x.id !== supprimee.id)], Date.now());
      ecrireConversationsAssistant();
      renderAssistant();
    });
  }

  // La liste des conversations se replie pour gagner de la place (étude 21/10) ; le choix est gardé sur le poste.
  var CLE_FILS_REPLIES_ASSISTANT = 'claire-assistant-fils-replies';
  function filsRepliesAssistant() { try { return localStorage.getItem(CLE_FILS_REPLIES_ASSISTANT) === '1'; } catch (e) { return false; } }
  function appliquerFilsRepliesAssistant() {
    const page = document.querySelector('#onglet-assistant .asst-page');
    if (page) page.classList.toggle('fils-replies', filsRepliesAssistant());
    const b = document.getElementById('assistant-fils-replier');
    if (b) { const r = filsRepliesAssistant(); b.setAttribute('aria-expanded', String(!r)); b.title = r ? 'Afficher les conversations' : 'Replier les conversations'; b.setAttribute('aria-label', b.title); }
  }
  function basculerFilsRepliesAssistant() {
    ecrireLocal(CLE_FILS_REPLIES_ASSISTANT, filsRepliesAssistant() ? '0' : '1');
    appliquerFilsRepliesAssistant();
  }

  function basculerFilsMobileAssistant() {
    const page = document.querySelector('.asst-page');
    if (page) page.classList.toggle('fils-ouverts');
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerFilsMobileAssistant(); });
  }
  function fermerFilsMobileAssistant() {
    const page = document.querySelector('.asst-page');
    if (page) page.classList.remove('fils-ouverts');
  }

  // Étude 26/10 (mix B + D des maquettes) : les 3 conversations les plus récentes, la conversation ouverte toujours visible,
  // puis « Voir les N autres » — avec 12 conversations, elles ne chassent plus les canaux hors de l'écran.
  var CONVERSATIONS_VISIBLES_ASSISTANT = 3;
  var conversationsToutesVisiblesAssistant = false;
  function basculerConversationsAssistant() { conversationsToutesVisiblesAssistant = !conversationsToutesVisiblesAssistant; renderFilsAssistant(); }
  // Pure : les conversations à montrer parmi les groupes datés (ordre conservé), { groupes, cachees }.
  function groupesVisiblesConversationsAssistant(groupes, ouverte, tout, max) {
    const total = groupes.reduce((n, g) => n + g.conversations.length, 0);
    if (tout || total <= max) return { groupes, cachees: 0 };
    let reste = max;
    const visibles = [];
    for (const g of groupes) {
      const gardees = g.conversations.filter((c) => (reste > 0 ? (reste--, true) : c.id === ouverte));
      if (gardees.length) visibles.push(Object.assign({}, g, { conversations: gardees }));
    }
    const montrees = visibles.reduce((n, g) => n + g.conversations.length, 0);
    return { groupes: visibles, cachees: total - montrees };
  }

  function renderFilsAssistant() {
    const zone = document.getElementById('assistant-fils');
    if (!zone) return;
    const tousGroupes = groupesConversationsAssistant(assistantConversations, Date.now());
    const vue = groupesVisiblesConversationsAssistant(tousGroupes, assistantConversationId, conversationsToutesVisiblesAssistant, CONVERSATIONS_VISIBLES_ASSISTANT);
    const groupes = vue.groupes;
    const ligne = (c) => {
      const actif = c.id === assistantConversationId;
      return `<li class="asst-fil${actif ? ' actif' : ''}">
          <button type="button" class="asst-fil-ouvrir" onclick="ouvrirConversationAssistant('${escapeOnclickArg(c.id)}')"${actif ? ' aria-current="true"' : ''} title="${escapeAttr(c.titre || '')}">${escapeHtml(c.titre || 'Conversation')}</button>
          <wa-button appearance="plain" size="s" class="bouton-icone asst-fil-suppr" type="button" onclick="supprimerConversationAssistant('${escapeOnclickArg(c.id)}')" title="Supprimer la conversation" aria-label="Supprimer la conversation">${icone('x')}</wa-button>
        </li>`;
    };
    const total = tousGroupes.reduce((n, g) => n + g.conversations.length, 0);
    const ouverte = typeof sectionOuverte === 'function' ? sectionOuverte('claire', true) : true;
    const entete = total ? `<button type="button" class="cx-groupe-titre cx-plie cx-plie-claire" onclick="basculerSectionDiscussions('claire', true)" aria-expanded="${ouverte}">${icone(ouverte ? 'chevron-down' : 'chevron-right')}Claire <span class="cx-nb">${total}</span></button>` : '';
    if (total && !ouverte) { zone.innerHTML = entete; return; }
    zone.innerHTML = entete + (groupes.length
      ? groupes.map(g => `<div class="asst-fils-groupe"><div class="asst-fils-titre">${escapeHtml(g.titre)}</div><ul class="asst-fils-liste">${g.conversations.map(ligne).join('')}</ul></div>`).join('')
        + (vue.cachees ? `<button type="button" class="cx-voir-plus" onclick="basculerConversationsAssistant()">Voir les ${vue.cachees} autres</button>`
          : conversationsToutesVisiblesAssistant && tousGroupes.reduce((n, g) => n + g.conversations.length, 0) > CONVERSATIONS_VISIBLES_ASSISTANT ? '<button type="button" class="cx-voir-plus" onclick="basculerConversationsAssistant()">Voir moins</button>' : '')
      : '<p class="asst-fils-vide">Vos conversations apparaîtront ici.</p>');
  }
