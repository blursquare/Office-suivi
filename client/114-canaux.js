// Canaux de CLAIRE (étude 24/10, 0.328.0) : « un slack » dans « Demander à CLAIRE ». Un canal par dossier, un canal « général » de l'étude et
// des canaux libres : le fil est PARTAGÉ entre les collaborateurs (serveur, `server/src/canaux/`), CLAIRE y écrit d'elle-même (une proposition
// = un message avec sa carte « Autoriser / Refuser ») et répond à qui lui parle. Les conversations personnelles de « Demander à CLAIRE »
// (client/63) restent telles quelles, au-dessus de la liste des canaux. Un canal réutilise TOUTE la mécanique de l'assistant — saisie, @, pièces
// jointes, analyse d'acte, agent et ses outils, colonne de droite, artefacts — : seul change l'endroit où les messages sont gardés (le serveur,
// pour tous) et leur présentation (avatars et noms). Ce fichier : l'état, la liste, le chargement, le fil et l'envoi ; la colonne de droite,
// la recherche, les notifications et les actions sur un message sont dans client/115-canaux-actions.js.

var canaux = {
  liste: [], badge: 0, charge: false, collaborateurs: [],
  actif: '',                 // '' = conversations personnelles ; 'general' | 'd:<id>' | 'l:<nom>' | '@enregistres' ; la conversation de CLAIRE (profil et propositions à décider) est la conversation personnelle
  messages: [], cartes: {}, signature: '', preferences: { notif: 'tous', favori: false }, luAvant: 0,
  recherche: '', rechercheOuverte: false, filtreListe: '', calmesOuverts: false, archivesOuverts: false, mesDossiersTous: false, sections: {}, listeOuverte: true,
  claireRepond: true, edition: '', publications: 0, forcerBas: false, silences: [], nouveau: false,
  equipe: [], enregistres: [], fil: '', filTexte: '', parentCourant: '', claireRepondFil: false, dernierMessageMoi: null, suivi: null, rechercheGlobale: { q: '', resultats: [], chargement: false }, enregistresVue: []
};
var INTERVALLE_CANAUX_MS = 30 * 1000;
var INTERVALLE_CANAUX_NOTIFIES_MS = 5 * 1000;
var INTERVALLE_CANAL_ACTIF_MS = 8 * 1000;
var minuterieCanalActif = null;

// ---- Pures ----

// Pure : la sorte d'un canal.
function typeCanal(id) {
  if (id === '@traiter') return 'traiter';
  if (id === '@enregistres') return 'enregistres';
  if (String(id).startsWith('p:')) return 'prive';
  if (id === 'general') return 'general';
  if (String(id).startsWith('d:')) return 'dossier';
  if (String(id).startsWith('l:')) return 'libre';
  return '';
}

// Pure : « # général », « # compta », ou le libellé du dossier.
function libelleCanal(id, liste, dossiersListe) {
  const t = typeCanal(id);
  if (t === 'general') return 'général';
  if (t === 'traiter') return 'À traiter';
  if (t === 'enregistres') return 'Enregistrés';
  if (t === 'prive') return libellePriveCanal(id, liste);
  if (t === 'libre') { const c = (liste || []).find(x => x.id === id); return (c && c.nom) || String(id).slice(2); }
  if (t === 'dossier') {
    const d = (dossiersListe || []).find(x => x && x.id === String(id).slice(2));
    return d ? libelleDossierAffiche(d) : 'Dossier';
  }
  return '';
}

function platCanal(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Pure : les canaux, rangés pour la colonne. Favoris d'abord ; puis « général » et les canaux libres ; les dossiers en cours qui ont de
// l'activité (non lus d'abord, puis le plus récent) ; les dossiers calmes (par nom) ; les archivés. Le filtre cherche dans les noms.
function sectionsCanaux(serveur, dossiersListe, filtre, moi) {
  const parId = new Map((serveur || []).map(c => [c.id, c]));
  const f = platCanal(filtre).trim();
  const entree = (id, libelle, extra) => {
    const c = parId.get(id) || {};
    return Object.assign({ id, libelle, nonLus: c.nonLus || 0, mentions: c.mentions || 0, notif: c.notif || 'tous', favori: !!c.favori,
      extrait: c.extrait || '', dernierLe: c.dernierLe || 0, dernierAuteur: c.dernierAuteur || '' }, extra || {});
  };
  const garde = (e) => !f || platCanal(e.libelle).includes(f);
  const tous = [entree('general', 'général')];
  (serveur || []).filter(c => c.libre).forEach(c => tous.push(entree(c.id, c.nom || c.id.slice(2), { libre: true })));
  (dossiersListe || []).filter(d => d && d.id).forEach(d => tous.push(entree('d:' + d.id, libelleDossierAffiche(d), { dossier: true, archive: !!d.archive, responsable: d.responsable || '' })));
  const retenus = tous.filter(garde);
  const parActivite = (a, b) => (b.nonLus > 0) - (a.nonLus > 0) || b.dernierLe - a.dernierLe || a.libelle.localeCompare(b.libelle, 'fr');
  const favoris = retenus.filter(e => e.favori).sort(parActivite);
  const reste = retenus.filter(e => !e.favori);
  const actifs = reste.filter(e => e.dossier && !e.archive && (e.dernierLe || e.nonLus)).sort(parActivite);
  return {
    favoris,
    equipe: reste.filter(e => !e.dossier),
    actifs,
    // Mes dossiers d'abord (étude 26/10) : ceux dont je suis le responsable ; les autres vont dans un bloc replié.
    mesActifs: actifs.filter(e => moi && e.responsable === moi),
    autresActifs: actifs.filter(e => !(moi && e.responsable === moi)),
    calmes: reste.filter(e => e.dossier && !e.archive && !(e.dernierLe || e.nonLus)).sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr')),
    archives: reste.filter(e => e.dossier && e.archive).sort(parActivite)
  };
}

// Pure : CLAIRE répond-elle à ce message ? Partout — « général » compris depuis 0.363.0 (étude 26/10 : « dans le canal général elle ne
// peut interagir que si on l'appelle ») — seulement si on la cite (@CLAIRE) ; jamais en « note à l'équipe » (interrupteur coupé).
function claireDoitRepondreCanal(texte, claireRepond) {
  if (!claireRepond) return false;
  return /(^|[^a-z0-9])@claire(?![a-z0-9])/.test(platCanal(texte));
}

// Pure : le texte d'un message HTML, sans balises (pour le serveur et la recherche).
function texteDepuisHtmlCanal(html) {
  return String(html || '').replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// htmlSurCanal et BALISES_CANAL vivent dans commun/html-canal.js (appliqués aussi par le serveur au dépôt, audit 25/10).

// Pure : le texte d'un message d'une personne, en HTML : échappé, retours à la ligne, @mentions en évidence.
function htmlTexteCanal(texte, collaborateurs, moi) {
  const prenoms = (collaborateurs || []).map(c => String(c).split(/\s+/)[0]);
  return htmlMiseEnFormeCanal(texte, (echappe) => echappe.replace(/(^|[\s>])@([A-Za-zÀ-ÿ]+)/g, (tout, avant, nom) => {
    const p = platCanal(nom);
    if (p === 'claire') return `${avant}<span class="cx-mention cx-mention-claire">@${nom}</span>`;
    const c = prenoms.find(x => platCanal(x) === p);
    if (!c) return tout;
    return `${avant}<span class="cx-mention${platCanal(c) === platCanal(String(moi || '').split(/\s+/)[0]) ? ' cx-mention-moi' : ''}">@${nom}</span>`;
  }));
}

// Pure : repères d'affichage — séparateur de jour, début de groupe (même auteur à moins de 5 minutes), séparateur « Nouveau ».
function repereMessagesCanal(messages, luAvant, moi) {
  let prec = null;
  let nouveauMarque = false;
  return (messages || []).map(m => {
    const jour = new Date(m.quand || 0).toDateString();
    const nouveauJour = !prec || new Date(prec.quand || 0).toDateString() !== jour;
    const debutGroupe = nouveauJour || !prec || prec.auteur !== m.auteur || m.carte || prec.carte || (m.quand || 0) - (prec.quand || 0) > 5 * 60000;
    const nouveau = !nouveauMarque && luAvant > 0 && (m.quand || 0) > luAvant && m.auteur !== moi;
    if (nouveau) nouveauMarque = true;
    prec = m;
    return { nouveauJour, debutGroupe: debutGroupe || nouveau, nouveau };
  });
}

// Pure : les messages qui contiennent la recherche (texte, sans accent ni casse).
function filtrerMessagesCanal(messages, requete) {
  const q = platCanal(requete).trim();
  if (!q) return messages;
  return (messages || []).filter(m => platCanal((m.texte || '') + ' ' + texteDepuisHtmlCanal(m.html || '')).includes(q));
}

// Pure : un message du serveur vu comme un message de l'assistant (boutons gardés si le même message existe déjà ici).
function messageCanalVersVue(sm, moi, ancien) {
  const claire = !!sm.claire;
  const base = {
    id: sm.id, role: claire ? 'claire' : (sm.auteur === moi ? 'moi' : 'autre'), auteur: sm.auteur, via: sm.via || '', quand: sm.quand,
    html: sm.html || escapeHtml(sm.texte || ''), texte: sm.texte || '', carte: sm.carte || '', pj: sm.pj || [], mentions: sm.mentions || [],
    parent: sm.parent || '', reactions: Array.isArray(sm.reactions) ? sm.reactions : [], epingle: !!sm.epingle, clos: !!sm.clos, modifieLe: sm.modifieLe || 0, pour: sm.pour || '', claireMessage: claire
  };
  if (ancien && ancien.local) { delete base.html; delete base.texte; }
  return ancien ? Object.assign(ancien, base) : Object.assign(base, { boutons: [] });
}

// ---- Chargement ----

async function chargerCanaux() {
  if (!utilisateurPoste) { canaux.liste = []; canaux.badge = 0; majPastilleCanaux(); return; }
  try {
    const r = await fetchAvecAuth('/api/canaux?utilisateur=' + encodeURIComponent(utilisateurPoste));
    if (!r.ok) return;
    const corps = await r.json();
    canaux.liste = corps.canaux || [];
    canaux.collaborateurs = corps.collaborateurs || canaux.collaborateurs;
    canaux.badge = corps.badge || 0;
    canaux.equipe = corps.equipe || canaux.equipe;
    canaux.enregistres = corps.enregistres || canaux.enregistres;
    canaux.charge = true;
    majPastilleCanaux();
    if (typeof ecranAffiche === 'function' && ecranAffiche('assistant')) renderCanaux();
    if (typeof rafraichirPropositionsFiche === 'function') rafraichirPropositionsFiche();
  } catch (e) { /* serveur injoignable : la pastille garde son dernier état */ }
}

// La pastille de l'étincelle : messages non lus (hors canaux muets) + mentions.
function majPastilleCanaux() {
  const badge = document.getElementById('badge-assistant');
  const n = canaux.badge;
  if (badge) { badge.textContent = n > 99 ? '99+' : String(n); badge.style.display = n ? '' : 'none'; }
  const bouton = document.getElementById('tab-assistant');
  if (bouton) {
    const titre = n ? `Discussions : ${n} message${n > 1 ? 's' : ''} non lu${n > 1 ? 's' : ''}` : 'Discussions';
    bouton.title = titre; bouton.setAttribute('aria-label', titre);
  }
  majAccesRapideCanaux();
}

// Lancé une fois par demarrerApplication : la liste toutes les 30 s ; le canal ouvert toutes les 8 s tant que la page est affichée.
function demarrerCanaux() {
  chargerCanaux();
  chargerPhotosCollaborateurs();
  setInterval(() => { if (!document.hidden) chargerPhotosCollaborateurs(); }, 5 * 60 * 1000);
  // Toutes les 30 s ; toutes les 5 s quand la fenêtre n'est pas regardée et que le relais du poste notifie (étude 26/10 : « combien de
  // temps pour que s'affiche la notification ? » — 15 à 35 s avant). Fenêtre cachée sans relais : rien.
  let dernierTourCanaux = Date.now();
  setInterval(() => {
    const relais = pastilleActiveHorsEcran();
    if (document.hidden && !relais) return;
    const pas = relais && !fenetreClaireRegardee() ? INTERVALLE_CANAUX_NOTIFIES_MS : INTERVALLE_CANAUX_MS;
    if (Date.now() - dernierTourCanaux < pas - 500) return;
    dernierTourCanaux = Date.now();
    chargerCanaux();
  }, INTERVALLE_CANAUX_NOTIFIES_MS);
  window.addEventListener('focus', () => { if (canaux.actif && ecranAffiche('assistant')) marquerCanalLu(true); });
  minuterieCanalActif = setInterval(() => {
    if (!document.hidden && canaux.actif && !vueSpecialeCanal(canaux.actif) && ecranAffiche('assistant')) chargerMessagesCanal(false);
  }, INTERVALLE_CANAL_ACTIF_MS);
}

function enteteJsonCanaux() { return { 'Content-Type': 'application/json' }; }

// `force` : relit même si la signature n'a pas changé (après une décision, une modification).
async function chargerMessagesCanal(force) {
  const id = canaux.actif;
  if (!id || vueSpecialeCanal(id) || canaux.publications > 0) return;
  try {
    const q = `utilisateur=${encodeURIComponent(utilisateurPoste)}${!force && canaux.signature ? '&signature=' + encodeURIComponent(canaux.signature) : ''}`;
    const r = await fetchAvecAuth(`/api/canaux/${encodeURIComponent(id)}/messages?${q}`);
    if (id !== canaux.actif || canaux.publications > 0) return;
    if (!r.ok) return;
    const corps = await r.json();
    if (corps.inchange) { marquerCanalLu(); return; }
    canaux.signature = corps.signature || '';
    canaux.cartes = corps.cartes || {};
    if (corps.preferences) canaux.preferences = corps.preferences;
    fusionnerMessagesCanal(corps.messages || []);
    marquerCanalLu();
    const enEdition = document.activeElement && document.activeElement.id === 'canal-edition' && !force;
    if (!enEdition && typeof ecranAffiche === 'function' && ecranAffiche('assistant')) renderAssistant();
  } catch (e) { /* le prochain tour réessaie */ }
}

// Les messages du serveur font foi ; un message qui vient d'être écrit ici et pas encore confirmé reste en fin de liste.
function fusionnerMessagesCanal(serveur) {
  const parId = new Map(assistantMessages.filter(m => m.id).map(m => [m.id, m]));
  const enAttente = assistantMessages.filter(m => !m.id && m.local);
  assistantMessages = serveur.map(sm => messageCanalVersVue(sm, utilisateurPoste, parId.get(sm.id))).concat(enAttente);
}

var derniereLectureCanal = 0;
function marquerCanalLu(retour) {
  const id = canaux.actif;
  // Lu seulement fenêtre CLAIRE AU PREMIER PLAN (étude 26/10 : « si j'écris à Claire, j'aurai une notification à sa réponse ? ») :
  // une fenêtre restée visible derrière Word marquait la réponse lue à son arrivée, sans notification. Lue au retour (focus).
  if (!id || vueSpecialeCanal(id) || !utilisateurPoste || document.hidden || !document.hasFocus()) return;
  const c = canaux.liste.find(x => x.id === id);
  if (!retour && c && !c.nonLus && Date.now() - derniereLectureCanal < 20000) return;
  derniereLectureCanal = Date.now();
  if (c) { canaux.badge = Math.max(0, canaux.badge - (c.notif === 'muet' ? 0 : c.notif === 'mentions' ? c.mentions : c.nonLus)); c.nonLus = 0; c.mentions = 0; majPastilleCanaux(); renderCanaux(); }
  fetchAvecAuth(`/api/canaux/${encodeURIComponent(id)}/lu`, { method: 'POST', headers: enteteJsonCanaux(), body: JSON.stringify({ utilisateur: utilisateurPoste }) }).catch(() => {});
}

// ---- Ouvrir, quitter ----

function canalAuDossierOuvert() { return typeCanal(canaux.actif) === 'dossier' ? canaux.actif.slice(2) : ''; }

function brouillonCanalCle(id) { return `claire-canal-brouillon:${utilisateurPoste || 'poste'}:${id}`; }
function garderBrouillonCanal() {
  const champ = document.getElementById('assistant-saisie');
  if (!champ || !canaux.actif || vueSpecialeCanal(canaux.actif)) return;
  try { if (champ.value.trim()) localStorage.setItem(brouillonCanalCle(canaux.actif), champ.value); else localStorage.removeItem(brouillonCanalCle(canaux.actif)); } catch (e) { /* stockage indisponible */ }
}
function rendreBrouillonCanal(id) {
  const champ = document.getElementById('assistant-saisie');
  if (!champ) return;
  let v = '';
  try { v = localStorage.getItem(brouillonCanalCle(id)) || ''; } catch (e) { v = ''; }
  champ.value = v;
  champ.style.height = '';
  if (v) champ.style.height = Math.min(160, champ.scrollHeight) + 'px';
}

// Repart sur les conversations personnelles (appelé avant d'ouvrir ou de commencer une conversation).
function quitterCanal() {
  if (!canaux.actif) return;
  garderBrouillonCanal();
  canaux.actif = '';
  majAccesRapideCanaux();
  fermerFilCanal();
  canaux.messages = []; canaux.cartes = {}; canaux.signature = ''; canaux.recherche = ''; canaux.rechercheOuverte = false; canaux.edition = '';
  assistantMessages = [];
  assistantContexte = { dossierId: dossierOuvert || '', attente: null, historique: [], echanges: [] };
  oublierConversationAgent();
  mentionsChoisiesAssistant = [];
  const champ = document.getElementById('assistant-saisie');
  if (champ) { champ.value = ''; champ.style.height = ''; }
  majSaisieCanal();
}

async function ouvrirCanal(id) {
  if (id === '@traiter') { ouvrirProfilClaire(); return; }   // l'ancienne vue « À traiter » : c'est maintenant la conversation de CLAIRE
  if (!id || id === canaux.actif || occupeAssistant()) return;
  if (typeCanal(id) === '') return;
  garderBrouillonCanal();
  memoriserConversationAssistant();
  fermerFilCanal();
  canaux.actif = id;
  majAccesRapideCanaux();
  assistantConversationId = '';
  const c = canaux.liste.find(x => x.id === id) || {};
  Object.assign(canaux, { messages: [], cartes: {}, signature: '', luAvant: c.luLe || 0, recherche: '', rechercheOuverte: false, edition: '', forcerBas: true, silences: [],
    preferences: { notif: c.notif || 'tous', favori: !!c.favori } });
  assistantMessages = [];
  const dossierId = typeCanal(id) === 'dossier' ? id.slice(2) : '';
  assistantContexte = { dossierId, attente: null, historique: [], echanges: [] };
  oublierConversationAgent();
  mentionsChoisiesAssistant = [];
  reinitialiserColonneAssistant();
  fermerFilsMobileAssistant();
  rendreBrouillonCanal(id);
  majSaisieCanal();
  renderAssistant();
  if (!vueSpecialeCanal(id)) {
    await chargerMessagesCanal(true);
    // Le contexte de la première demande à CLAIRE : les derniers échanges du canal (l'agent, neuf, sait de quoi on parle).
    assistantContexte.echanges = assistantMessages.filter(m => m.texte || m.html).slice(-6).map(m => ({ role: m.role === 'claire' ? 'claire' : 'moi', texte: String(m.texte || texteDepuisHtmlCanal(m.html)).slice(0, 400) }));
    if (dossierId) chargerSilencesCanal();
    const champ = document.getElementById('assistant-saisie');
    if (champ) champ.focus({ preventScroll: true });
  } else if (id === '@enregistres') {
    chargerEnregistresCanal();
  } else {
    chargerPropositionsClaire('a-traiter');
  }
}

// Depuis la fiche d'un dossier : « Ouvrir » le canal.
function ouvrirCanalDepuisFiche(dossierId) {
  definirOnglet('assistant');
  setTimeout(() => ouvrirCanal('d:' + dossierId), 0);
}

// Au clavier : Alt + Maj + ↓ / ↑ vont au canal non lu suivant / précédent (comme dans Slack).
function canalNonLuVoisin(sens) {
  const nonLus = canaux.liste.filter(c => c.nonLus && c.notif !== 'muet').sort((a, b) => b.dernierLe - a.dernierLe);
  if (!nonLus.length) return '';
  const k = nonLus.findIndex(c => c.id === canaux.actif);
  if (k < 0) return nonLus[sens > 0 ? 0 : nonLus.length - 1].id;
  return nonLus[(k + sens + nonLus.length) % nonLus.length].id;
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || !ecranAffiche('assistant')) return;
    const id = canalNonLuVoisin(e.key === 'ArrowDown' ? 1 : -1);
    if (id) { e.preventDefault(); ouvrirCanal(id); }
  });
}

// ---- Envoi ----

// Appelée par poserMessageAssistant dans un canal : le message est écrit sur le serveur, pour tous. Une réponse de CLAIRE porte le nom de
// celui qui l'a demandée (`via`) ; son texte reste ici avec ses boutons (des fonctions, jamais envoyées).
async function publierMessageCanal(message, meta) {
  const id = canaux.actif;
  if (!id || vueSpecialeCanal(id) || message.id) return;
  message.local = true; message.auteur = message.role === 'claire' ? 'CLAIRE' : utilisateurPoste;
  const m = meta || {};
  if (Array.isArray(m.pj) && m.pj.length) message.pj = m.pj;   // les cartes des pièces jointes s'affichent tout de suite
  const claire = message.role === 'claire';
  const texte = claire ? texteDepuisHtmlCanal(message.html) : (typeof m.texte === 'string' ? m.texte : texteDepuisHtmlCanal(message.html));
  if (!texte && !message.html) return;
  // Un message qui porte un champ de saisie ou un bouton de l'assistant (« Corriger », consigne) n'a de sens que sur ce poste : jamais partagé.
  if (claire && /<(textarea|input|select)\b/i.test(message.html || '')) return;
  canaux.publications += 1;
  try {
    const r = await fetchAvecAuth(`/api/canaux/${encodeURIComponent(id)}/messages`, { method: 'POST', headers: enteteJsonCanaux(),
      body: JSON.stringify({ auteur: utilisateurPoste, claire, texte, html: claire ? message.html : '', pj: m.pj || [], parent: message.parent || '' }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || `HTTP ${r.status}`);
    const corps = await r.json();
    if (id === canaux.actif) { message.id = corps.message.id; message.quand = corps.message.quand; message.mentions = corps.message.mentions || []; }
    noterVerificationPoste('canaux-poste', { detail: 'message écrit dans un canal' });
  } catch (e) {
    afficherToast('Message non partagé : ' + (e.message || e) + '. Il reste visible ici seulement.', 'OK', null);
  } finally {
    canaux.publications -= 1;
  }
  if (canaux.publications === 0) { canaux.signature = ''; chargerCanaux(); if (id === canaux.actif || canaux.actif) chargerMessagesCanal(true); }
}

function basculerClaireRepond() {
  canaux.claireRepond = !canaux.claireRepond;
  majSaisieCanal();
}

// La saisie suit le canal : texte d'invite, interrupteur « CLAIRE répond », pied de page. Hors canal, tout est comme avant.
function majSaisieCanal() {
  const champ = document.getElementById('assistant-saisie');
  const bascule = document.getElementById('canal-bascule');
  const saisie = document.querySelector('#onglet-assistant .asst-saisie');
  const page = document.querySelector('#onglet-assistant .asst-page');
  const reel = canaux.actif && !vueSpecialeCanal(canaux.actif);
  if (page) { page.classList.toggle('mode-canal', !!canaux.actif); page.classList.toggle('mode-traiter', vueSpecialeCanal(canaux.actif)); }
  if (champ) champ.placeholder = reel
    ? (typeCanal(canaux.actif) === 'prive' ? `Envoyer un message à ${libelleCanal(canaux.actif, canaux.liste, dossiers)}` : `Écrire dans ${typeCanal(canaux.actif) === 'dossier' ? '' : '# '}${libelleCanal(canaux.actif, canaux.liste, dossiers)} — @CLAIRE pour lui demander, @Julie pour prévenir`)
    : 'Message à CLAIRE… tapez @ pour citer un dossier';
  if (bascule) {
    bascule.style.display = 'none';   // « Claire répond » / « Note à l'équipe » n'a plus d'objet : elle ne répond jamais sans être citée
    bascule.classList.toggle('actif', canaux.claireRepond);
    bascule.setAttribute('aria-pressed', String(canaux.claireRepond));
    bascule.innerHTML = canaux.claireRepond ? `${icone('discussion')}Claire répond` : `${icone('users')}Note à l’équipe`;
    bascule.title = canaux.claireRepond ? 'Claire répond à votre message (sauf s’il s’adresse à un collègue avec @). Cliquez pour écrire seulement à l’équipe.' : 'Seule l’équipe lit ce message. Cliquez pour que CLAIRE réponde.';
  }
  const confier = document.getElementById('assistant-confier');
  if (confier) confier.style.display = !canaux.actif && !POSTE_CLAIRE && estAdministrateur(utilisateurPoste) ? '' : 'none';
  if (saisie) saisie.classList.toggle('canal-note', reel && canaux.actif === 'general' && !canaux.claireRepond);
}

// ---- La liste des canaux (colonne de gauche) ----

function ligneCanal(e) {
  const actif = e.id === canaux.actif;
  const muet = e.notif === 'muet';
  const nbMentions = Number(e.mentions) || 0;
  const nbNonLus = Number(e.nonLus) || 0;
  const marque = nbMentions ? `<span class="cx-n cx-n-mention" title="${nbMentions} mention${nbMentions > 1 ? 's' : ''} ou à décider">${nbMentions}</span>`
    : nbNonLus ? `<span class="cx-n${muet ? ' cx-n-muet' : ''}">${nbNonLus}</span>` : '';
  const sous = e.nonLus && e.extrait ? `<small>${escapeHtml(e.dernierAuteur === 'CLAIRE' ? 'CLAIRE' : prenomCollaborateur(e.dernierAuteur))} : ${escapeHtml(e.extrait)}</small>` : '';
  return `<li><button type="button" class="cx-c${actif ? ' actif' : ''}${e.nonLus && !muet ? ' non-lu' : ''}${muet ? ' muet' : ''}" onclick="ouvrirCanal('${escapeOnclickArg(e.id)}')"${actif ? ' aria-current="true"' : ''} title="${escapeAttr(e.libelle)}">
      <span class="cx-d" aria-hidden="true">${e.favori || e.dossier ? icone(e.favori ? 'etoile' : 'folder') : '<span class="sb-canal-avatar sb-canal-diese">#</span>'}</span>
      <span class="cx-c-texte"><span class="cx-c-nom">${escapeHtml(e.libelle)}</span>${sous}</span>${muet ? `<span class="cx-muet" aria-label="Muet">${icone('cloche-barree')}</span>` : ''}${marque}</button></li>`;
}

// CLAIRE dans la liste, comme une collègue (étude 26/10 : « mets-la dans la liste des collaborateurs, pas à l'écart ») : sa ligne est celle des
// messages privés, avec son avatar, son point « en ligne » et son statut ; la pastille = ce qu'elle a anticipé et qui attend ma décision.
function ligneClaireCanal() {
  const aTraiter = propositionsClaire.liste.length;
  const statutClaire = statutProfilClaire(aTraiter, assistantEnCours);
  return `<li><button type="button" class="cx-c cx-claire-ligne${!canaux.actif ? ' actif' : ''}" onclick="ouvrirProfilClaire()"${!canaux.actif ? ' aria-current="true"' : ''} title="Conversation avec CLAIRE"><span class="cx-d" aria-hidden="true">${htmlAvatarProfilClaire(false)}</span><span class="cx-c-texte"><span class="cx-c-nom">CLAIRE</span><small>${escapeHtml(statutClaire.texte)}</small></span>${aTraiter ? `<span class="cx-n cx-n-mention" title="${aTraiter} à décider">${aTraiter}</span>` : ''}</button></li>`;
}

function renderCanaux() {
  const zone = document.getElementById('assistant-canaux');
  if (!zone) return;
  const champFiltre = zone.querySelector('.cx-filtre input');
  const enSaisie = champFiltre && document.activeElement === champFiltre;
  const s = sectionsCanaux(canaux.liste, dossiers, canaux.filtreListe, utilisateurPoste);
  const filtre = !!(canaux.saisieListe || canaux.filtreListe).trim();
  const bloc = (titre, lignes, ouvrable) => lignes.length ? `<div class="cx-groupe"><div class="cx-groupe-titre">${titre}</div><ul class="cx-liste-c">${lignes.map(ligneCanal).join('')}</ul></div>` : '';
  const pliable = (titre, lignes, ouvert, bascule) => lignes.length ? `<div class="cx-groupe"><button type="button" class="cx-groupe-titre cx-plie" onclick="${bascule}" aria-expanded="${ouvert}">${icone(ouvert ? 'chevron-down' : 'chevron-right')}${titre} <span class="cx-nb">${lignes.length}</span></button>${ouvert || filtre ? `<ul class="cx-liste-c">${lignes.map(ligneCanal).join('')}</ul>` : ''}</div>` : '';
  zone.innerHTML = `
    <div class="cx-entete"><span class="cx-entete-titre">Canaux</span>
      <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="nouveauCanalLibre()" title="Nouveau canal" aria-label="Nouveau canal">${icone('plus')}</wa-button>
      <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="toutMarquerLuCanaux()" title="Tout marquer comme lu" aria-label="Tout marquer comme lu">${icone('check')}</wa-button></div>
    ${canaux.nouveau ? `<div class="cx-nouveau-canal"><input type="text" id="canal-nouveau-nom" maxlength="60" placeholder="Nom du canal (ex. compta)" aria-label="Nom du nouveau canal" autocomplete="off" onkeydown="if (event.key === 'Enter') { event.preventDefault(); creerCanalLibreDepuisSaisie(); } else if (event.key === 'Escape') { nouveauCanalLibre(); }">
      <wa-button variant="brand" size="s" type="button" onclick="creerCanalLibreDepuisSaisie()">Créer</wa-button></div>` : ''}
    <div class="cx-filtre"><input type="search" value="${escapeAttr(canaux.saisieListe || canaux.filtreListe)}" placeholder="Canaux, messages… (de:julie)" aria-label="Chercher un canal ou un message" autocomplete="off" oninput="filtrerCanaux(this.value)"></div>
    ${htmlSectionsSlack(filtre)}
    ${bloc('Favoris', s.favoris)}
    ${s.equipe.length ? htmlGroupePliable('equipe', 'Équipe', s.equipe.length, nonLusLignes(s.equipe), true, `<ul class="cx-liste-c">${s.equipe.map(ligneCanal).join('')}</ul>`, filtre) : ''}
    ${blocMesDossiers(s)}
    ${blocAutresDossiers(s, filtre)}
    ${pliable('Dossiers calmes', s.calmes, canaux.calmesOuverts, 'basculerSectionCanaux(\'calmes\')')}
    ${pliable('Archivés', s.archives, canaux.archivesOuverts, 'basculerSectionCanaux(\'archives\')')}
    ${!s.favoris.length && !s.equipe.length && !s.actifs.length && !s.calmes.length && !s.archives.length ? '<p class="asst-fils-vide">Aucun canal ne correspond.</p>' : ''}`;
  if (enSaisie) { const n = zone.querySelector('.cx-filtre input'); if (n) { n.focus(); const l = n.value.length; n.setSelectionRange(l, l); } }
}

// Blocs pliables de la colonne (mix B + D, étude 26/10) : chevron, nombre et, replié, la pastille des non-lus. `sections` garde le choix
// de l'utilisateur ; sans choix, `ouvertDefaut` (ouvert si le bloc a du non-lu, sinon celui que la présentation décide).
function sectionOuverte(cle, ouvertDefaut) { return Object.prototype.hasOwnProperty.call(canaux.sections, cle) ? !!canaux.sections[cle] : !!ouvertDefaut; }
function basculerSectionDiscussions(cle, ouvertDefaut) { canaux.sections[cle] = !sectionOuverte(cle, ouvertDefaut); renderCanaux(); if (cle === 'claire' && typeof renderFilsAssistant === 'function') renderFilsAssistant(); }
function htmlGroupePliable(cle, titre, nb, nonLus, ouvertDefaut, contenu, forceOuvert) {
  const ouvert = forceOuvert || sectionOuverte(cle, ouvertDefaut);
  const pastille = !ouvert && nonLus ? `<span class="cx-n cx-n-groupe" title="${nonLus} non lu${nonLus > 1 ? 's' : ''}">${nonLus > 99 ? '99+' : nonLus}</span>` : '';
  return `<div class="cx-groupe"><button type="button" class="cx-groupe-titre cx-plie" onclick="basculerSectionDiscussions('${cle}', ${!!ouvertDefaut})" aria-expanded="${ouvert}">${icone(ouvert ? 'chevron-down' : 'chevron-right')}${titre}${nb !== '' ? ` <span class="cx-nb">${nb}</span>` : ''}${pastille}</button>${ouvert ? contenu : ''}</div>`;
}
function nonLusLignes(lignes) { return lignes.reduce((n, e) => n + (e.notif === 'muet' ? 0 : (Number(e.mentions) || Number(e.nonLus) || 0)), 0); }

// « Mes dossiers » : les 6 premiers, puis « Voir les N autres » (étude 26/10, mix B + D des maquettes).
var MES_DOSSIERS_VISIBLES = 6;
function blocMesDossiers(s) {
  if (!s.mesActifs.length) return '';
  const tout = canaux.mesDossiersTous;
  const lignes = tout ? s.mesActifs : s.mesActifs.slice(0, MES_DOSSIERS_VISIBLES);
  const cachees = s.mesActifs.length - lignes.length;
  const plus = cachees ? `<button type="button" class="cx-voir-plus" onclick="basculerMesDossiersCanaux()">Voir les ${cachees} autres</button>`
    : tout && s.mesActifs.length > MES_DOSSIERS_VISIBLES ? '<button type="button" class="cx-voir-plus" onclick="basculerMesDossiersCanaux()">Voir moins</button>' : '';
  return htmlGroupePliable('mes', 'Mes dossiers', s.mesActifs.length, nonLusLignes(s.mesActifs), true, `<ul class="cx-liste-c">${lignes.map(ligneCanal).join('')}</ul>${plus}`);
}
// « Autres dossiers » : replié, avec le nombre de non-lus des dossiers des collègues ; s'ouvre seul pendant une recherche.
function blocAutresDossiers(s, filtre) {
  if (!s.autresActifs.length) return '';
  return htmlGroupePliable('autres', s.mesActifs.length ? 'Autres dossiers' : 'Dossiers', s.autresActifs.length, nonLusLignes(s.autresActifs), !s.mesActifs.length, `<ul class="cx-liste-c">${s.autresActifs.map(ligneCanal).join('')}</ul>`, !!filtre);
}
function basculerMesDossiersCanaux() { canaux.mesDossiersTous = !canaux.mesDossiersTous; renderCanaux(); }

function filtrerCanaux(valeur) {
  canaux.saisieListe = String(valeur || '');
  // « de:julie » vise un auteur : il ne filtre pas les noms de canaux.
  canaux.filtreListe = requeteRechercheGlobale(canaux.saisieListe).q;
  chercherMessagesGlobaux(canaux.saisieListe);
  renderCanaux();
}
function basculerSectionCanaux(nom) { if (nom === 'calmes') canaux.calmesOuverts = !canaux.calmesOuverts; else canaux.archivesOuverts = !canaux.archivesOuverts; renderCanaux(); }

async function toutMarquerLuCanaux() {
  try { await fetchAvecAuth('/api/canaux/tout-lu', { method: 'POST', headers: enteteJsonCanaux(), body: JSON.stringify({ utilisateur: utilisateurPoste }) }); } catch (e) { /* réessayez */ }
  canaux.liste.forEach(c => { c.nonLus = 0; c.mentions = 0; });
  canaux.badge = 0; majPastilleCanaux(); renderCanaux();
}

// « + » ouvre une ligne de saisie sous le titre « Canaux » : un nom, Entrée, le canal est créé et ouvert.
function nouveauCanalLibre() {
  canaux.nouveau = !canaux.nouveau;
  renderCanaux();
  if (canaux.nouveau) { const c = document.getElementById('canal-nouveau-nom'); if (c) c.focus(); }
}

function creerCanalLibreDepuisSaisie() {
  const champ = document.getElementById('canal-nouveau-nom');
  const nom = champ ? champ.value.trim() : '';
  if (!nom) return;
  fetchAvecAuth('/api/canaux', { method: 'POST', headers: enteteJsonCanaux(), body: JSON.stringify({ auteur: utilisateurPoste, nom }) })
    .then(async (r) => {
      const c = await r.json().catch(() => ({}));
      if (!r.ok && !c.id) { afficherToast(c.erreur || 'Canal non créé.', 'OK', null); return; }
      canaux.nouveau = false;
      await chargerCanaux();
      ouvrirCanal(c.id);
    })
    .catch(() => afficherToast('Canal non créé : serveur injoignable.', 'OK', null));
}
