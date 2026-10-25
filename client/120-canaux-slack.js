// Discussions « comme Slack » (étude 25/10, suite de client/114 et 115) : fils de discussion, messages privés, recherche dans tous les canaux,
// messages enregistrés, statut et présence, résumé d'un canal par Claire. Tout est servi par `server/src/canaux/` ; rien ici n'envoie d'email.

var STATUTS_RAPIDES = [
  { emoji: '⚖️', texte: 'Au tribunal', heures: 4 }, { emoji: '🤝', texte: 'En rendez-vous', heures: 2 }, { emoji: '💻', texte: 'En visio', heures: 1 },
  { emoji: '🍽️', texte: 'Au déjeuner', heures: 1 }, { emoji: '🌴', texte: 'Absent(e)', heures: 24 }
];
var minuterieRechercheGlobale = null;

// ---- Pures ----

// Pure : une vue qui n'est pas un canal (pas de saisie, pas de messages du serveur).
function vueSpecialeCanal(id) { return id === '@traiter' || id === '@enregistres'; }

// Pure : « Julie » pour un message privé avec Julie, « Julie et Jérémy » pour un groupe (jamais soi-même).
function libellePriveCanal(id, liste) {
  const c = (liste || []).find(x => x.id === id);
  const membres = c && Array.isArray(c.membres) && c.membres.length ? c.membres : [];
  const autres = membres.filter(n => n !== utilisateurPoste).map(n => String(n).split(/\s+/)[0]);
  if (autres.length) return autres.join(' et ');
  return String(id).slice(2).split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' et ');
}

// Pure : les réponses d'un fil, dans l'ordre.
function reponsesFilCanal(messages, racineId) {
  return (messages || []).filter(m => m.parent && m.parent === racineId).sort((a, b) => (a.quand || 0) - (b.quand || 0));
}

// Pure : « 3 réponses », « 1 réponse ».
function libelleReponsesFil(n) { return `${n} réponse${n > 1 ? 's' : ''}`; }

// Pure : la requête de la liste des canaux → { q, auteur } (« de:julie contrat » cherche « contrat » chez Julie).
function requeteRechercheGlobale(saisie) {
  let auteur = '';
  const q = String(saisie || '').replace(/(^|\s)de:([^\s]+)/i, (m, av, nom) => { auteur = nom; return av; }).replace(/\s+/g, ' ').trim();
  return { q, auteur };
}

// ---- Statut et présence ----

function membreEquipeCanal(nom) { return (canaux.equipe || []).find(e => e.nom === nom) || null; }

function htmlStatutAuteurCanal(nom) {
  const e = membreEquipeCanal(nom);
  return e && e.statut && e.statut.emoji ? `<span class="cx-statut-emoji" title="${escapeAttr(e.statut.texte || '')}">${escapeHtml(e.statut.emoji)}</span>` : '';
}

function htmlPresence(nom) {
  const e = membreEquipeCanal(nom);
  return `<span class="cx-pres${e && e.enLigne ? ' en-ligne' : ''}" title="${e && e.enLigne ? 'En ligne' : 'Absent du poste'}" aria-label="${e && e.enLigne ? 'En ligne' : 'Hors ligne'}"></span>`;
}

async function poserStatutCanal(emoji, texte, heures) {
  try {
    const r = await fetchAvecAuth('/api/canaux/statut', { method: 'PUT', headers: enteteJsonCanaux(), body: JSON.stringify({ auteur: utilisateurPoste, emoji, texte, heures }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    canaux.statutOuvert = false;
    canaux.statutEmoji = '';
    await chargerCanaux();
    renderCanaux();
  } catch (e) { afficherToast('Statut non enregistré : ' + (e.message || e), 'OK', null); }
}

function ouvrirStatutCanal() { canaux.statutOuvert = !canaux.statutOuvert; canaux.statutEmoji = ''; renderCanaux(); }

function enregistrerStatutSaisi() {
  const champ = document.getElementById('statut-texte');
  const duree = document.getElementById('statut-duree');
  const moi = membreEquipeCanal(utilisateurPoste);
  const emoji = canaux.statutEmoji || (moi && moi.statut && moi.statut.emoji) || '💬';
  const texte = champ ? champ.value.trim() : '';
  poserStatutCanal(texte ? emoji : '', texte, duree ? Number(duree.value) || 0 : 0);
}

function htmlStatutEdition() {
  const moi = membreEquipeCanal(utilisateurPoste);
  const emoji = canaux.statutEmoji || (moi && moi.statut && moi.statut.emoji) || '💬';
  return `<div class="cx-statut-form">
      <div class="cx-statut-champs"><button type="button" class="cx-statut-choix" onclick="ouvrirSelecteurReaction('@statut', this)" aria-label="Choisir l’emoji du statut" title="Choisir l’emoji">${escapeHtml(emoji)}</button>
        <input type="text" id="statut-texte" maxlength="80" value="${escapeAttr(moi && moi.statut ? moi.statut.texte : '')}" placeholder="Que faites-vous ?" aria-label="Mon statut" autocomplete="off" onkeydown="if (event.key === 'Enter') { event.preventDefault(); enregistrerStatutSaisi(); }"></div>
      <div class="cx-statut-rapides">${STATUTS_RAPIDES.map((s, i) => `<button type="button" class="cx-statut-rapide" onclick="poserStatutCanal(STATUTS_RAPIDES[${i}].emoji, STATUTS_RAPIDES[${i}].texte, STATUTS_RAPIDES[${i}].heures)">${escapeHtml(s.emoji)} ${escapeHtml(s.texte)}</button>`).join('')}</div>
      <div class="cx-statut-actions"><select id="statut-duree" aria-label="Durée du statut"><option value="1">1 heure</option><option value="4">4 heures</option><option value="24">Aujourd’hui</option><option value="168">7 jours</option><option value="0">Jusqu’à nouvel ordre</option></select>
        <wa-button variant="brand" size="s" type="button" onclick="enregistrerStatutSaisi()">Enregistrer</wa-button>
        <wa-button appearance="plain" size="s" type="button" onclick="poserStatutCanal('', '', 0)">Effacer</wa-button></div></div>`;
}

// ---- La colonne de gauche : Enregistrés, messages privés, résultats de recherche ----

function lignePriveCanal(c) {
  const actif = c.id === canaux.actif;
  const membres = (c.membres || []).filter(n => n !== utilisateurPoste);
  const seul = membres.length === 1 ? membres[0] : '';
  const e = seul ? membreEquipeCanal(seul) : null;
  const statut = e && e.statut && (e.statut.emoji || e.statut.texte) ? `${e.statut.emoji || ''} ${e.statut.texte || ''}`.trim() : '';
  const marque = c.mentions ? `<span class="cx-n cx-n-mention">${c.mentions}</span>` : c.nonLus ? `<span class="cx-n">${c.nonLus}</span>` : '';
  const avatar = seul ? `<span class="cx-d cx-d-pres" aria-hidden="true">${htmlPresence(seul)}</span>` : `<span class="cx-d" aria-hidden="true">${icone('users')}</span>`;
  return `<li><button type="button" class="cx-c${actif ? ' actif' : ''}${c.nonLus ? ' non-lu' : ''}" onclick="ouvrirCanal('${escapeOnclickArg(c.id)}')"${actif ? ' aria-current="true"' : ''}>
      ${avatar}<span class="cx-c-texte"><span class="cx-c-nom">${escapeHtml(libellePriveCanal(c.id, canaux.liste))}</span>${statut ? `<small>${escapeHtml(statut)}</small>` : ''}</span>${marque}</button></li>`;
}

function htmlSectionsSlack(filtre) {
  if (filtre) return htmlResultatsRechercheGlobale();
  const prives = (canaux.liste || []).filter(c => c.prive).sort((a, b) => (a.membres || []).length - (b.membres || []).length || b.dernierLe - a.dernierLe);
  const n = (canaux.enregistres || []).length;
  const enreg = `<div class="cx-groupe"><ul class="cx-liste-c"><li><button type="button" class="cx-c${canaux.actif === '@enregistres' ? ' actif' : ''}" onclick="ouvrirCanal('@enregistres')"><span class="cx-d" aria-hidden="true">${icone('signet')}</span><span class="cx-c-texte"><span class="cx-c-nom">Enregistrés</span></span>${n ? `<span class="cx-n cx-n-muet">${n}</span>` : ''}</button></li></ul></div>`;
  const moi = membreEquipeCanal(utilisateurPoste);
  const monStatut = `<button type="button" class="cx-statut-moi" onclick="ouvrirStatutCanal()" aria-expanded="${!!canaux.statutOuvert}">${htmlPresence(utilisateurPoste)}<span>${moi && moi.statut && (moi.statut.emoji || moi.statut.texte) ? escapeHtml(`${moi.statut.emoji || ''} ${moi.statut.texte || ''}`.trim()) : 'Définir mon statut'}</span></button>`;
  return enreg + (prives.length ? `<div class="cx-groupe"><div class="cx-groupe-titre">Messages privés</div><ul class="cx-liste-c">${prives.map(lignePriveCanal).join('')}</ul></div>` : '')
    + `<div class="cx-groupe">${monStatut}${canaux.statutOuvert ? htmlStatutEdition() : ''}</div>`;
}

// ---- Recherche dans tous les canaux ----

function chercherMessagesGlobaux(saisie) {
  const { q, auteur } = requeteRechercheGlobale(saisie);
  clearTimeout(minuterieRechercheGlobale);
  if (q.length < 2 && !auteur) { canaux.rechercheGlobale = { q: '', resultats: [], chargement: false }; return; }
  canaux.rechercheGlobale = Object.assign({}, canaux.rechercheGlobale, { q: saisie, chargement: true });
  minuterieRechercheGlobale = setTimeout(async () => {
    try {
      const r = await fetchAvecAuth(`/api/canaux/recherche?utilisateur=${encodeURIComponent(utilisateurPoste)}&q=${encodeURIComponent(q)}&auteur=${encodeURIComponent(auteur)}`);
      const corps = r.ok ? await r.json() : { resultats: [] };
      if (canaux.rechercheGlobale.q !== saisie) return;
      canaux.rechercheGlobale = { q: saisie, resultats: corps.resultats || [], chargement: false };
    } catch (e) { canaux.rechercheGlobale = { q: saisie, resultats: [], chargement: false }; }
    renderCanaux();
  }, 300);
}

function htmlResultatsRechercheGlobale() {
  const g = canaux.rechercheGlobale;
  const { q, auteur } = requeteRechercheGlobale(canaux.saisieListe || '');
  if (q.length < 2 && !auteur) return '';
  const lignes = g.resultats.map(r => `<li><button type="button" class="cx-res" onclick="ouvrirResultatRecherche('${escapeOnclickArg(r.canal)}', '${escapeOnclickArg(r.mid)}', '${escapeOnclickArg(r.parent || '')}')">
      <span class="cx-res-lieu">${escapeHtml(libelleCanal(r.canal, canaux.liste, dossiers))} · ${escapeHtml(r.claire ? 'Claire' : prenomCollaborateur(r.auteur))} · ${escapeHtml(libelleJourAssistant(r.quand, Date.now()))}</span>
      <span class="cx-res-texte">${escapeHtml(r.extrait)}</span></button></li>`).join('');
  return `<div class="cx-groupe"><div class="cx-groupe-titre">Messages${g.chargement ? '' : ` (${g.resultats.length})`}</div>
    ${g.chargement ? `<p class="asst-fils-vide">${icone('spinner', null, true)} Recherche…</p>` : g.resultats.length ? `<ul class="cx-liste-c cx-resultats-liste">${lignes}</ul>` : '<p class="asst-fils-vide">Aucun message ne correspond (essayez « de:julie » pour un auteur).</p>'}</div>`;
}

async function ouvrirResultatRecherche(canal, mid, parent) {
  canaux.filtreListe = ''; canaux.saisieListe = ''; canaux.rechercheGlobale = { q: '', resultats: [], chargement: false };
  await ouvrirCanal(canal);
  if (canaux.actif !== canal) { renderCanaux(); return; }
  renderCanaux();
  if (parent) ouvrirFilCanal(parent);
  else setTimeout(() => allerAuMessageCanal(mid), 80);
}

// ---- Fils de discussion ----

function panneauFilCanal(creer) {
  let p = document.getElementById('assistant-fil');
  if (!p && creer) {
    const page = document.querySelector('#onglet-assistant .asst-page');
    if (!page) return null;
    p = document.createElement('aside');
    p.id = 'assistant-fil';
    p.className = 'cx-fil';
    p.setAttribute('aria-label', 'Fil de discussion');
    p.innerHTML = `<header class="cx-fil-tete"><h2 id="fil-titre">Fil de discussion</h2><wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="fermerFilCanal()" aria-label="Fermer le fil">${icone('x')}</wa-button></header>
      <div class="cx-fil-corps" id="fil-corps"></div>
      <form class="cx-fil-saisie" onsubmit="event.preventDefault(); envoyerReponseFil();">
        <textarea id="fil-saisie" rows="2" maxlength="8000" placeholder="Répondre dans le fil…" aria-label="Répondre dans le fil" onkeydown="if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); envoyerReponseFil(); }" oninput="canaux.filTexte = this.value"></textarea>
        <wa-button variant="brand" size="s" type="submit">Répondre</wa-button></form>`;
    page.appendChild(p);
  }
  return p;
}

function fermerFilCanal() {
  canaux.fil = ''; canaux.filTexte = '';
  const p = panneauFilCanal(false);
  if (p) p.remove();
}

function ouvrirFilCanal(racineId) {
  if (!racineId || !messageCanalParId(racineId)) return;
  canaux.fil = racineId;
  const p = panneauFilCanal(true);
  if (!p) return;
  renderFilCanal();
  const champ = document.getElementById('fil-saisie');
  if (champ) { champ.value = canaux.filTexte || ''; champ.focus(); }
}

function htmlMessageFil(m) {
  const claire = m.role === 'claire';
  return `<div class="cx-m cx-${escapeAttr(m.role)}" data-fil-mid="${escapeAttr(m.id || '')}">${avatarCanal(m)}
    <div class="cx-corps"><div class="cx-nom">${escapeHtml(nomAuteurCanal(m))}${htmlStatutAuteurCanal(m.auteur)}<span class="cx-heure">${escapeHtml(heureAssistant(m.quand))}</span></div>
    ${htmlCorpsMessageCanal(m)}${htmlPiecesCanal(m)}${htmlReactionsMessage(m)}${claire ? '' : ''}${htmlActionsMessageCanal(m, -1)}</div></div>`;
}

// Redessine le corps du fil (le champ de réponse n'est jamais touché : la frappe survit).
function renderFilCanal() {
  if (!canaux.fil) { const p = panneauFilCanal(false); if (p) p.remove(); return; }
  const racine = messageCanalParId(canaux.fil);
  const corps = document.getElementById('fil-corps');
  if (!racine || !corps || !canaux.actif || vueSpecialeCanal(canaux.actif)) { fermerFilCanal(); return; }
  const reps = reponsesFilCanal(assistantMessages, racine.id);
  const bas = corps.scrollHeight - corps.scrollTop - corps.clientHeight < 60;
  const titre = document.getElementById('fil-titre');
  if (titre) titre.textContent = `Fil · ${libelleCanal(canaux.actif, canaux.liste, dossiers)}`;
  corps.innerHTML = htmlMessageFil(racine) + `<div class="asst-jour" role="separator"><span>${reps.length ? libelleReponsesFil(reps.length) : 'Pas encore de réponse'}</span></div>` + reps.map(htmlMessageFil).join('');
  if (bas) corps.scrollTop = corps.scrollHeight;
  remplirVignettesPiecesJointesAssistant();
}

async function envoyerReponseFil() {
  const champ = document.getElementById('fil-saisie');
  const texte = champ ? champ.value.trim() : '';
  if (!texte || !canaux.fil || !canaux.actif) return;
  champ.disabled = true;
  try {
    const r = await fetchAvecAuth(`/api/canaux/${encodeURIComponent(canaux.actif)}/messages`, { method: 'POST', headers: enteteJsonCanaux(), body: JSON.stringify({ auteur: utilisateurPoste, texte, parent: canaux.fil }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || `HTTP ${r.status}`);
    champ.value = ''; canaux.filTexte = '';
    canaux.signature = '';
    await chargerMessagesCanal(true);
    noterVerificationPoste('canaux-fil', { detail: 'réponse dans un fil' });
  } catch (e) { afficherToast('Réponse non envoyée : ' + (e.message || e), 'OK', null); noterVerificationPoste('canaux-fil', { ok: false, message: 'réponse impossible' }); }
  champ.disabled = false;
  champ.focus();
}

// Sous un message de départ : « 3 réponses · dernière à 14:05 », qui ouvre le fil.
function htmlLienFil(m, tous) {
  if (m.parent || !m.id) return '';
  const reps = reponsesFilCanal(tous || assistantMessages, m.id);
  if (!reps.length) return '';
  const dernier = reps[reps.length - 1];
  return `<button type="button" class="cx-fil-lien" onclick="ouvrirFilCanal('${escapeOnclickArg(m.id)}')">${icone('discussion')}<b>${libelleReponsesFil(reps.length)}</b><span>dernière à ${escapeHtml(heureAssistant(dernier.quand))}</span></button>`;
}

// ---- Enregistrés ----

function messageEstEnregistre(canal, mid) { return (canaux.enregistres || []).includes(`${canal}|${mid}`); }

async function enregistrerMessageCanal(mid) {
  const canal = canaux.actif;
  if (!canal || !mid) return;
  const actif = !messageEstEnregistre(canal, mid);
  try {
    const r = await fetchAvecAuth('/api/canaux/enregistres', { method: 'POST', headers: enteteJsonCanaux(), body: JSON.stringify({ auteur: utilisateurPoste, canal, mid, actif }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || `HTTP ${r.status}`);
    canaux.enregistres = (await r.json()).enregistres || [];
    afficherToast(actif ? 'Message enregistré (retrouvez-le dans « Enregistrés »).' : 'Retiré des enregistrés.', 'OK', null);
    renderAssistant(); renderCanaux();
  } catch (e) { afficherToast('Non enregistré : ' + (e.message || e), 'OK', null); }
}

async function chargerEnregistresCanal() {
  try {
    const r = await fetchAvecAuth('/api/canaux/enregistres?utilisateur=' + encodeURIComponent(utilisateurPoste));
    canaux.enregistresVue = r.ok ? (await r.json()).messages || [] : [];
  } catch (e) { canaux.enregistresVue = []; }
  if (canaux.actif === '@enregistres') renderAssistant();
}

function vueEnregistresCanal() {
  const l = canaux.enregistresVue || [];
  if (!l.length) return `<div class="asst-accueil"><div class="asst-accueil-logo" aria-hidden="true">${icone('signet')}</div><h2 class="asst-accueil-titre">Rien d’enregistré</h2>
    <p class="asst-accueil-texte">Survolez un message et cliquez sur le signet pour le retrouver ici.</p></div>`;
  return `<div class="cx-traiter-vue"><p class="cx-traiter-intro">${l.length} message${l.length > 1 ? 's' : ''} enregistré${l.length > 1 ? 's' : ''}, à vous seul.</p>${l.map(m => `<section class="cx-traiter-groupe">
      <header><button type="button" class="cx-traiter-canal" onclick="ouvrirResultatRecherche('${escapeOnclickArg(m.canal)}', '${escapeOnclickArg(m.mid)}', '${escapeOnclickArg(m.parent || '')}')">${icone('diese')}${escapeHtml(libelleCanal(m.canal, canaux.liste, dossiers))}</button>
        <span class="cx-res-lieu">${escapeHtml(m.claire ? 'Claire' : prenomCollaborateur(m.auteur))} · ${escapeHtml(libelleJourAssistant(m.quand, Date.now()))}</span>
        <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="retirerEnregistreCanal('${escapeOnclickArg(m.canal)}', '${escapeOnclickArg(m.mid)}')" aria-label="Retirer des enregistrés" title="Retirer">${icone('x')}</wa-button></header>
      <div class="cx-texte">${htmlTexteCanal(m.texte, canaux.collaborateurs, utilisateurPoste)}</div></section>`).join('')}</div>`;
}

async function retirerEnregistreCanal(canal, mid) {
  try {
    const r = await fetchAvecAuth('/api/canaux/enregistres', { method: 'POST', headers: enteteJsonCanaux(), body: JSON.stringify({ auteur: utilisateurPoste, canal, mid, actif: false }) });
    if (r.ok) canaux.enregistres = (await r.json()).enregistres || [];
  } catch (e) { /* réessayez */ }
  await chargerEnregistresCanal();
  renderCanaux();
}

// ---- Claire : résumer un canal, lire un canal, chercher partout ----

// Le bouton « Résumer » de l'en-tête : une conversation personnelle avec Claire, qui lit le canal par l'outil canaux_claire.
function resumerCanalAvecClaire() {
  const id = canaux.actif;
  if (!id || vueSpecialeCanal(id)) return;
  const c = canaux.liste.find(x => x.id === id) || {};
  const luLe = c.luLe || 0;
  quitterCanal();
  nouvelleConversationAssistant();
  const champ = document.getElementById('assistant-saisie');
  if (!champ) return;
  champ.value = `Résume ce canal : ce qui s’est dit ${luLe ? 'depuis ma dernière visite' : 'ces derniers jours'}, les décisions et ce qui reste à faire. (canal_id : ${id}${luLe ? `, lu_le : ${luLe}` : ''})`;
  envoyerDemandeAssistant();
}

async function canauxClaireAgent(e) {
  const utilisateur = encodeURIComponent(utilisateurPoste);
  try {
    if (e && e.mode === 'chercher') {
      const r = await fetchAvecAuth(`/api/canaux/recherche?utilisateur=${utilisateur}&q=${encodeURIComponent(String(e.recherche || '').slice(0, 200))}&auteur=${encodeURIComponent(String(e.auteur || '').slice(0, 40))}`);
      if (!r.ok) return { erreur: `le serveur a répondu ${r.status}` };
      const resultats = ((await r.json()).resultats || []).map(x => ({ canal_id: x.canal, canal: libelleCanal(x.canal, canaux.liste, dossiers), auteur: x.claire ? 'Claire' : prenomCollaborateur(x.auteur), date: new Date(x.quand).toISOString().slice(0, 16).replace('T', ' '), extrait: x.extrait }));
      return resultats.length ? { resultats } : { aucun: 'aucun message ne correspond : essaie d’autres mots' };
    }
    const id = String((e && e.canal_id) || '') || (canaux.actif && !vueSpecialeCanal(canaux.actif) ? canaux.actif : 'general');
    const depuis = Date.now() - Math.max(1, Math.min(720, Number(e && e.depuis_heures) || 72)) * 3600000;
    const luLe = Number(e && e.lu_le) || 0;
    const r = await fetchAvecAuth(`/api/canaux/${encodeURIComponent(id)}/messages?utilisateur=${utilisateur}`);
    if (!r.ok) return { erreur: r.status === 404 ? 'canal inconnu ou privé' : `le serveur a répondu ${r.status}` };
    const messages = ((await r.json()).messages || []).filter(m => m.quand >= depuis || (luLe && m.quand > luLe)).slice(-60);
    return { canal: libelleCanal(id, canaux.liste, dossiers), messages: messages.map(m => ({ auteur: m.claire ? 'Claire' : prenomCollaborateur(m.auteur), quand: new Date(m.quand).toISOString().slice(0, 16).replace('T', ' '),
      texte: String(m.texte || texteDepuisHtmlCanal(m.html) || (m.carte ? '(proposition de Claire)' : '')).slice(0, 700), ...(m.parent ? { dans_un_fil: true } : {}), ...(luLe && m.quand > luLe && m.auteur !== utilisateurPoste ? { nouveau: true } : {}), ...((m.pj || []).length ? { pieces_jointes: m.pj.length } : {}) })),
      ...(messages.length ? {} : { aucun: 'aucun message sur cette période' }) };
  } catch (err) { return { erreur: 'serveur injoignable' }; }
}
