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

// Pure : le dossier EN COURS dont on parle sans « @ » (étude 31/10 : « quand je parle d'un dossier déjà en cours, il faut basculer
// automatiquement dedans »). Prudent (relecture 0.412.0 : « un petit point » basculait vers un dossier PETIT) :
// - seul un NOM DE FAMILLE compte : nom du dossier ou d'une partie, en ne gardant d'un nom en casse mixte que ses mots en capitales
//   (« Camille FOURNIER » → FOURNIER), jamais un prénom, une forme de société (SCI, commune…), un mot de l'adresse d'un bien ni le prénom
//   d'un collaborateur ;
// - ce nom est écrit avec une majuscule dans la phrase (« Faure », « FAURE ») : un mot courant tapé en minuscules ne fait rien basculer ;
// - un seul dossier en cours le porte, et aucun dossier archivé (« le dossier ROY signé l'an dernier ») — sinon rien, jamais deviné.
var MOTS_NON_NOMS_BASCULE = new Set(['sci', 'scp', 'sarl', 'sas', 'sasu', 'eurl', 'snc', 'societe', 'commune', 'ville', 'mairie', 'consorts', 'consort', 'indivision', 'succession', 'epoux', 'vte', 'succ']);
function nomsDeFamilleBasculeAssistant(d) {
  const mots = (txt) => {
    const brut = String(txt || '');
    const capitales = brut.match(/[A-ZÀ-Þ][A-ZÀ-Þ'’-]{2,}/g);
    return motsUtilesAssistant(capitales && /[a-zà-ÿ]/.test(brut) ? capitales.join(' ') : brut);
  };
  return [...new Set([d.nom, ...(d.parties || []).map(p => p && (p.nom || '') + ' ' + (p.nomUsage || ''))].flatMap(mots))];
}
function dossierCiteSansArobaseAssistant(texte, liste) {
  const tous = (Array.isArray(liste) ? liste : []).filter(d => d && d.id);
  const brut = String(texte || '');
  const ecritsAvecMajuscule = new Set(motsUtilesAssistant((brut.match(/[A-ZÀ-Þ][\p{L}'’-]{2,}/gu) || []).join(' ')));
  if (!ecritsAvecMajuscule.size) return '';
  const exclus = new Set([...MOTS_NON_NOMS_BASCULE,
    ...tous.flatMap(d => (d.adresses || []).flatMap(a => motsUtilesAssistant(a))),
    ...(typeof RESPONSABLES !== 'undefined' ? RESPONSABLES : []).flatMap(r => motsUtilesAssistant(String((r && (r.prenom || r.nom)) || r || '').split(/\s+/)[0]))]);
  const porteurs = new Map();
  tous.forEach(d => nomsDeFamilleBasculeAssistant(d).filter(m => !exclus.has(m) && ecritsAvecMajuscule.has(m)).forEach(m => {
    if (!porteurs.has(m)) porteurs.set(m, []);
    porteurs.get(m).push(d);
  }));
  const candidats = new Set();
  for (const ds of porteurs.values()) {
    if (ds.some(d => d.archive)) return '';
    ds.forEach(d => candidats.add(d.id));
  }
  return candidats.size === 1 ? [...candidats][0] : '';
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

// ---- Changer de sujet (étude 31/10 : « je passe souvent d'un dossier à un autre ou d'une question juridique à la lecture d'un compromis…
// ça se mélange et à droite il me laisse les analyses précédentes » ; choix : bouton « Nouveau sujet », document joint, détection par l'IA ;
// la colonne de droite ne montre que le sujet en cours). ----

// Le bouton « Nouveau sujet » de l'en-tête : la conversation reste unique, le sujet change (colonne de droite remise à zéro).
function nouveauSujetManuelAssistant() {
  if (canaux.actif || assistantEnCours) return;
  if (!assistantMessages.length) { afficherToast('C’est déjà un sujet neuf.', 'OK', null); return; }
  ouvrirNouveauSujetAssistant('');
  renderAssistant();
  const champ = document.getElementById('assistant-saisie');
  if (champ) champ.focus();
}

// Pure : un document joint ouvre-t-il un nouveau sujet ? Oui, sauf quand la demande le rattache à ce qui précède (« compare avec », « aussi »,
// « le même », « l'autre », « précédent », « ci-dessus », « celui-ci »…) ou que le sujet en cours est vide.
var RE_SUITE_DOCUMENT_ASSISTANT = /\b(?:compar\w*|aussi|m[êe]me|autre|pr[ée]c[ée]dent\w*|ci-dessus|ci-joint\w* aussi|celui-ci|celle-ci|avec (?:le|la|l['’]|ce|cette)|en plus|suite|toujours|encore|ensemble|les deux)\b/i;
function nouveauSujetParDocumentAssistant(messages, texteSaisi) {
  if (!(Array.isArray(messages) && messages.some(m => m && m.role === 'moi'))) return false;
  return !RE_SUITE_DOCUMENT_ASSISTANT.test(String(texteSaisi || ''));
}

// Pure : les dernières demandes du collaborateur dans le sujet en cours (texte seul), pour la détection par l'IA.
function demandesPrecedentesAssistant(contexte) {
  return ((contexte && contexte.echanges) || []).filter(e => e && e.role !== 'claire' && String(e.texte || '').trim()).slice(-3).map(e => String(e.texte).slice(0, 400));
}

// Détection par l'IA (serveur, noms et montants masqués) : faux seulement si l'IA répond « autre sujet » ; une IA absente, lente (4 s) ou en
// erreur garde le sujet en cours.
async function changementDeSujetParIaAssistant(texte) {
  const precedentes = demandesPrecedentesAssistant(assistantContexte);
  if (!precedentes.length || !String(texte || '').trim()) return false;
  try {
    const delai = new Promise(ok => setTimeout(() => ok(null), 4000));
    const appel = fetchAvecAuth('/api/assistant/meme-sujet', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texte, precedentes, dossiers: typeof dossiersPourAssistant === 'function' ? dossiersPourAssistant(dossiers) : [] }) })
      .then(r => (r.ok ? r.json() : null)).catch(() => null);
    const r = await Promise.race([appel, delai]);
    return !!(r && r.memeSujet === false);
  } catch (e) { return false; }
}
