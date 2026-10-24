// Canaux de CLAIRE (0.328.0), suite de client/112-canaux.js : le fil (présentation façon Slack), la vue « À traiter », l'en-tête d'un canal
// (recherche, notifications, favori), la colonne de droite d'un canal (le dossier, CLAIRE sur ce dossier, épinglés), les actions sur un
// message (copier, « rappelle-moi », épingler, modifier, supprimer) et le menu des @ dans un canal. Rien ici n'envoie d'email ni n'écrit
// sur un dossier : les cartes de CLAIRE passent par les décisions de client/110-routines.js.

var LOGO_CLAIRE_AVATAR = '<svg viewBox="0 0 48 48" width="32" height="32" fill="none" aria-hidden="true"><rect x="0.5" y="0.5" width="47" height="47" rx="11.5" fill="#fff" stroke="#D5D8DD"/><path d="M33 12a15 15 0 1 0 0 24" stroke="#111418" stroke-width="2.4" stroke-linecap="round"/><path d="M27 23.5 L31.5 29 L40 17" stroke="#111418" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---- Le fil ----

function avatarCanal(m) {
  if (m.role === 'claire') return `<span class="cx-av cx-av-claire" aria-hidden="true">${LOGO_CLAIRE_AVATAR}</span>`;
  const k = Math.max(0, (canaux.collaborateurs || []).indexOf(m.auteur));
  return `<span class="cx-av cx-av-${k % 6}" aria-hidden="true">${escapeHtml(initialesAuteurCanal(m.auteur))}</span>`;
}

function nomAuteurCanal(m) {
  if (m.role === 'claire') return 'CLAIRE';
  return m.role === 'moi' ? 'Vous' : prenomCollaborateur(m.auteur);
}

function htmlCorpsMessageCanal(m) {
  const p = m.carte ? canaux.cartes[m.carte] : null;
  if (p) return `<div class="cx-carte">${carteProposition(p, { compacte: true })}</div>`;
  if (m.edition) return '';
  if (m.role === 'claire' && m.local && !m.serveur) return `<div class="asst-texte">${m.html}</div>`;
  if (m.role === 'claire') return `<div class="asst-texte">${htmlSurCanal(m.html)}</div>`;
  return `<div class="cx-texte">${htmlTexteCanal(m.texte || texteDepuisHtmlCanal(m.html), canaux.collaborateurs, utilisateurPoste)}</div>`;
}

function htmlPiecesCanal(m) {
  const pj = (m.pj || []).filter(p => p && p.nom);
  return pj.length ? `<div class="asst-pj-liste">${pj.map(p => `<span class="asst-pj">${icone(/pdf/i.test(p.type || p.nom) ? 'file-text' : 'paperclip')}<span class="asst-pj-nom">${escapeHtml(p.nom)}</span></span>`).join('')}</div>` : '';
}

function htmlActionsMessageCanal(m, i) {
  if (!m.id) return '';
  const id = escapeOnclickArg(m.id);
  const proprio = m.role === 'moi' && !m.carte;
  const bouton = (clic, icon, titre) => `<wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="${clic}" title="${escapeAttr(titre)}" aria-label="${escapeAttr(titre)}">${icone(icon)}</wa-button>`;
  return `<div class="cx-survol" role="toolbar" aria-label="Actions sur le message">
    ${bouton(`copierMessageCanal('${id}')`, 'copier', 'Copier')}
    ${bouton(`rappelMessageCanal('${id}')`, 'clock', 'Me le rappeler demain')}
    ${bouton(`epinglerMessageCanal('${id}')`, 'pin', m.epingle ? 'Désépingler' : 'Épingler au canal')}
    ${proprio ? bouton(`modifierMessageCanal('${id}')`, 'pencil', 'Modifier') + bouton(`supprimerMessageCanal('${id}')`, 'trash', 'Supprimer') : ''}</div>`;
}

function htmlMessageCanal(m, i, r, repere) {
  const claire = m.role === 'claire';
  const maintenant = Date.now();
  const jour = r.nouveauJour ? `<div class="asst-jour" role="separator"><span>${escapeHtml(libelleJourAssistant(m.quand, maintenant))}</span></div>` : '';
  const nouveau = r.nouveau ? '<div class="cx-nouveau" role="separator"><span>Nouveau</span></div>' : '';
  const boutons = (m.boutons || []).map((b, k) => {
    const cle = `${i}-${k}`;
    assistantActions[cle] = b.action;
    return `<wa-button ${b.principal ? 'variant="brand"' : 'appearance="outlined"'} size="s" type="button" onclick="actionAssistant('${cle}')">${escapeHtml(b.libelle)}</wa-button>`;
  }).join('');
  const tete = r.debutGroupe ? `<div class="cx-nom">${escapeHtml(nomAuteurCanal(m))}${claire && m.via && m.via !== utilisateurPoste ? `<span class="cx-via"> · à la demande de ${escapeHtml(prenomCollaborateur(m.via))}</span>` : ''}${claire && m.pour && m.carte ? `<span class="cx-via"> · pour ${escapeHtml(m.pour === utilisateurPoste ? 'vous' : prenomCollaborateur(m.pour))}</span>` : ''}<span class="cx-heure">${escapeHtml(heureAssistant(m.quand))}${m.modifieLe ? ' · modifié' : ''}</span>${m.epingle ? `<span class="cx-epingle" title="Épinglé">${icone('pin')}</span>` : ''}</div>` : '';
  const edition = canaux.edition === m.id ? `<div class="cx-edition"><textarea id="canal-edition" rows="2" aria-label="Modifier le message" onkeydown="if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); enregistrerEditionCanal('${escapeOnclickArg(m.id)}'); } else if (event.key === 'Escape') { annulerEditionCanal(); }">${escapeHtml(m.texte || '')}</textarea>
      <div class="cx-edition-actions"><wa-button variant="brand" size="s" type="button" onclick="enregistrerEditionCanal('${escapeOnclickArg(m.id)}')">Enregistrer</wa-button><wa-button appearance="plain" size="s" type="button" onclick="annulerEditionCanal()">Annuler</wa-button></div></div>` : '';
  const corps = canaux.edition === m.id ? edition : htmlCorpsMessageCanal(m);
  return `${jour}${nouveau}<div class="cx-m cx-${escapeAttr(m.role)}${r.debutGroupe ? '' : ' cx-suite'}${m.epingle ? ' cx-epingle-m' : ''}" data-index="${i}" data-mid="${escapeAttr(m.id || '')}">
      ${r.debutGroupe ? avatarCanal(m) : `<span class="cx-heure-marge" aria-hidden="true">${escapeHtml(heureAssistant(m.quand))}</span>`}
      <div class="cx-corps">${tete}${corps}${htmlPiecesCanal(m)}${boutons ? `<div class="asst-boutons">${boutons}</div>` : ''}${htmlActionsMessageCanal(m, i)}</div></div>`;
}

function vueATraiter() {
  const liste = propositionsClaire.liste;
  if (!liste.length) return `<div class="asst-accueil"><div class="asst-accueil-logo" aria-hidden="true">${icone('list-check')}</div><h2 class="asst-accueil-titre">Rien à décider</h2>
    <p class="asst-accueil-texte">Ce que CLAIRE prépare pour vous — brouillons, documents, tâches — arrive d’abord dans le canal du dossier, puis ici tant que vous n’avez pas décidé.</p></div>`;
  const parDossier = new Map();
  liste.forEach(p => { const k = p.dossierId || ''; parDossier.set(k, (parDossier.get(k) || []).concat([p])); });
  return `<div class="cx-traiter-vue"><p class="cx-traiter-intro">${liste.length} chose${liste.length > 1 ? 's' : ''} à décider. Rien ne part sans votre clic.</p>${[...parDossier.entries()].map(([dossierId, ps]) => {
    const d = dossierId ? dossiers.find(x => x.id === dossierId) : null;
    const canal = dossierId ? 'd:' + dossierId : 'general';
    return `<section class="cx-traiter-groupe"><header><button type="button" class="cx-traiter-canal" onclick="ouvrirCanal('${escapeOnclickArg(canal)}')">${icone(d ? 'folder' : 'diese')}${escapeHtml(d ? libelleDossierAffiche(d) : 'général')}</button></header>${ps.map(p => carteProposition(p, { compacte: true })).join('')}</section>`;
  }).join('')}</div>`;
}

function renderCanalAssistant(zone) {
  majSaisieCanal();
  renderEnteteCanal();
  const relances = document.getElementById('assistant-relances');
  if (relances) relances.innerHTML = '';
  if (canaux.actif === '@traiter') { zone.innerHTML = vueATraiter(); return; }
  const proche = zone.scrollHeight - zone.scrollTop - zone.clientHeight < 90;
  const sauve = zone.scrollTop;
  const q = canaux.recherche.trim();
  const visibles = q ? filtrerMessagesCanal(assistantMessages, q) : assistantMessages;
  const reperes = repereMessagesCanal(visibles, q ? 0 : canaux.luAvant, utilisateurPoste);
  const nom = libelleCanal(canaux.actif, canaux.liste, dossiers);
  assistantActions = {};
  const attente = assistantEnCours ? `<div class="cx-m cx-claire cx-ecrit"><span class="cx-av cx-av-claire" aria-hidden="true">${LOGO_CLAIRE_AVATAR}</span><div class="cx-corps"><div class="asst-attente" aria-label="CLAIRE écrit"><span></span><span></span><span></span>${assistantEtapeAgent ? `<em class="asst-etape">${escapeHtml(assistantEtapeAgent)}</em>` : ''}</div></div></div>` : '';
  if (!visibles.length) {
    zone.innerHTML = q
      ? `<div class="asst-accueil"><h2 class="asst-accueil-titre">Aucun message</h2><p class="asst-accueil-texte">Rien ne contient « ${escapeHtml(q)} » dans ${escapeHtml(nom)}.</p></div>`
      : `<div class="asst-accueil"><div class="asst-accueil-logo" aria-hidden="true">${icone(typeCanal(canaux.actif) === 'dossier' ? 'folder' : 'diese')}</div><h2 class="asst-accueil-titre">${escapeHtml(nom)}</h2>
          <p class="asst-accueil-texte">${typeCanal(canaux.actif) === 'dossier' ? 'Le canal de ce dossier : CLAIRE y écrit quand elle a préparé quelque chose, et vous pouvez lui parler du dossier sans le citer.' : 'Un fil partagé par toute l’étude. Écrivez ici, CLAIRE répond quand on l’appelle avec @CLAIRE.'} Un collègue : @Prénom.</p></div>${attente}`;
    return;
  }
  zone.innerHTML = (q ? `<div class="cx-resultats">${visibles.length} message${visibles.length > 1 ? 's' : ''} contenant « ${escapeHtml(q)} »</div>` : '')
    + visibles.map((m, i) => htmlMessageCanal(m, i, reperes[i])).join('') + attente;
  if (canaux.forcerBas || proche) { zone.scrollTop = zone.scrollHeight; canaux.forcerBas = false; } else zone.scrollTop = sauve;
  const edition = document.getElementById('canal-edition');
  if (edition && document.activeElement !== edition) { edition.focus(); edition.setSelectionRange(edition.value.length, edition.value.length); }
}

// ---- L'en-tête d'un canal ----

function renderEnteteCanal() {
  const titre = document.querySelector('#onglet-assistant .asst-titre');
  const zone = document.getElementById('canal-entete');
  if (!titre || !zone) return;
  const id = canaux.actif;
  if (!id) { titre.textContent = 'Demander à CLAIRE'; zone.innerHTML = ''; zone.style.display = 'none'; return; }
  const nom = libelleCanal(id, canaux.liste, dossiers);
  titre.textContent = id === '@traiter' ? 'À traiter' : (typeCanal(id) === 'dossier' ? nom : '# ' + nom);
  zone.style.display = '';
  if (id === '@traiter') { zone.innerHTML = ''; return; }
  const d = typeCanal(id) === 'dossier' ? dossiers.find(x => x.id === id.slice(2)) : null;
  const sig = d && d.rendezVousSignature ? `<span class="cx-pil" title="Rendez-vous de signature">signature le ${escapeHtml(String(d.rendezVousSignature).split('-').reverse().join('/'))}${d.rendezVousSignatureHeure ? ' à ' + escapeHtml(String(d.rendezVousSignatureHeure).replace(':', ' h ')) : ''}</span>` : '';
  const notif = canaux.preferences.notif;
  zone.innerHTML = `${sig}
    <span class="cx-entete-espace"></span>
    ${canaux.rechercheOuverte ? `<span class="cx-recherche"><input type="search" id="canal-recherche" value="${escapeAttr(canaux.recherche)}" placeholder="Chercher dans le canal…" aria-label="Chercher dans le canal" oninput="chercherCanal(this.value)" onkeydown="if (event.key === 'Escape') basculerRechercheCanal()"></span>` : ''}
    <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="basculerRechercheCanal()" title="Chercher dans le canal" aria-label="Chercher dans le canal">${icone('search')}</wa-button>
    <span class="cx-menu-place"><wa-button appearance="plain" size="s" class="bouton-icone${notif !== 'tous' ? ' cx-reglee' : ''}" type="button" onclick="ouvrirMenuNotifCanal()" title="Notifications de ce canal" aria-label="Notifications de ce canal" aria-haspopup="true">${icone(notif === 'muet' ? 'cloche-barree' : 'cloche')}</wa-button><div class="cx-menu" id="canal-menu-notif" style="display:none;" role="menu"></div></span>
    <wa-button appearance="plain" size="s" class="bouton-icone${canaux.preferences.favori ? ' cx-favori' : ''}" type="button" onclick="basculerFavoriCanal()" title="${canaux.preferences.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}" aria-label="Favori" aria-pressed="${canaux.preferences.favori}">${icone('etoile')}</wa-button>
    ${d ? `<wa-button appearance="outlined" size="s" type="button" onclick="ouvrirDossierDrawer('${escapeOnclickArg(d.id)}')">Ouvrir la fiche</wa-button>` : ''}`;
}

function basculerRechercheCanal() {
  canaux.rechercheOuverte = !canaux.rechercheOuverte;
  if (!canaux.rechercheOuverte) canaux.recherche = '';
  renderAssistant();
  if (canaux.rechercheOuverte) { const c = document.getElementById('canal-recherche'); if (c) c.focus(); }
}
function chercherCanal(v) {
  canaux.recherche = String(v || '');
  const zone = document.getElementById('assistant-messages');
  if (zone) renderCanalAssistantSansEntete(zone);
}
// La recherche se tape dans un champ de l'en-tête : on ne redessine que le fil, pour garder le focus.
function renderCanalAssistantSansEntete(zone) {
  const garde = document.getElementById('canal-entete').innerHTML;
  renderCanalAssistant(zone);
  const entete = document.getElementById('canal-entete');
  if (entete && garde) { entete.innerHTML = garde; }
}

function ouvrirMenuNotifCanal() {
  const m = document.getElementById('canal-menu-notif');
  if (!m) return;
  if (m.style.display !== 'none') { m.style.display = 'none'; return; }
  const n = canaux.preferences.notif;
  const opt = (v, t, d) => `<button type="button" role="menuitemradio" aria-checked="${n === v}" class="cx-menu-ligne${n === v ? ' actif' : ''}" onclick="reglerNotifCanal('${v}')"><span class="cx-menu-coche">${n === v ? icone('check') : ''}</span><span><strong>${t}</strong><small>${d}</small></span></button>`;
  m.innerHTML = `<div class="cx-menu-titre">Me prévenir</div>${opt('tous', 'Tous les messages', 'Pastille pour chaque nouveau message')}${opt('mentions', 'Mentions seulement', '@Prénom et propositions pour moi')}${opt('muet', 'Rien (muet)', 'Aucune pastille, aucun message Teams')}`;
  m.style.display = 'block';
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('mousedown', (e) => {
    const m = document.getElementById('canal-menu-notif');
    if (m && m.style.display !== 'none' && !e.target.closest('.cx-menu-place')) m.style.display = 'none';
  });
}

async function enregistrerPreferencesCanal(changement) {
  const id = canaux.actif;
  try {
    const r = await fetchAvecAuth(`/api/canaux/${encodeURIComponent(id)}/preferences`, { method: 'PUT', headers: enteteJsonCanaux(), body: JSON.stringify(Object.assign({ utilisateur: utilisateurPoste }, changement)) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const corps = await r.json();
    canaux.preferences = corps.preferences;
    const c = canaux.liste.find(x => x.id === id);
    if (c) { c.notif = corps.preferences.notif; c.favori = corps.preferences.favori; }
    chargerCanaux();
    renderAssistant();
  } catch (e) { afficherToast('Réglage non enregistré : ' + (e.message || e), 'OK', null); }
}
function reglerNotifCanal(valeur) { const m = document.getElementById('canal-menu-notif'); if (m) m.style.display = 'none'; enregistrerPreferencesCanal({ notif: valeur }); }
function basculerFavoriCanal() { enregistrerPreferencesCanal({ favori: !canaux.preferences.favori }); }

// ---- Actions sur un message ----

function messageCanalParId(id) { return assistantMessages.find(m => m.id === id) || null; }

function copierMessageCanal(id) {
  const m = messageCanalParId(id);
  if (!m) return;
  const texte = m.texte || texteDepuisHtmlCanal(m.html);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texte).then(() => afficherToast('Message copié.', 'OK', null), () => afficherToast('Copie impossible.', 'OK', null));
}

// « Me le rappeler » : une tâche de MA liste « À faire », demain, qui cite le message — comme « Ajouter une tâche ».
function rappelMessageCanal(id) {
  const m = messageCanalParId(id);
  if (!m) return;
  const demain = new Date(); demain.setDate(demain.getDate() + 1);
  const iso = `${demain.getFullYear()}-${String(demain.getMonth() + 1).padStart(2, '0')}-${String(demain.getDate()).padStart(2, '0')}`;
  const extrait = (m.texte || texteDepuisHtmlCanal(m.html)).replace(/\s+/g, ' ').slice(0, 120);
  const rappel = { id: 'rp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7), auteur: utilisateurPoste,
    texte: `Revoir le message de ${nomAuteurCanal(m) === 'Vous' ? 'moi' : nomAuteurCanal(m)} : « ${extrait} »`.slice(0, 200),
    echeance: iso, dossierId: canalAuDossierOuvert(), fait: false, faitLe: '', creeLe: new Date().toISOString() };
  rappelsPerso.push(rappel);
  renderAlertesDashboard(dossiersPerimetreDashboard());
  enregistrerRappelPerso(rappel);
  afficherToast('Rappel posé pour demain dans votre liste « À faire ».', 'OK', null);
}

async function epinglerMessageCanal(id) {
  const m = messageCanalParId(id);
  if (!m) return;
  try {
    const r = await fetchAvecAuth(`/api/canaux/${encodeURIComponent(canaux.actif)}/messages/${encodeURIComponent(id)}`, { method: 'PATCH', headers: enteteJsonCanaux(), body: JSON.stringify({ auteur: utilisateurPoste, epingle: !m.epingle }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    chargerMessagesCanal(true);
  } catch (e) { afficherToast('Non épinglé : ' + (e.message || e), 'OK', null); }
}

function modifierMessageCanal(id) { canaux.edition = id; renderAssistant(); }
function annulerEditionCanal() { canaux.edition = ''; renderAssistant(); }
async function enregistrerEditionCanal(id) {
  const champ = document.getElementById('canal-edition');
  const texte = champ ? champ.value.trim() : '';
  if (!texte) return;
  canaux.edition = '';
  try {
    const r = await fetchAvecAuth(`/api/canaux/${encodeURIComponent(canaux.actif)}/messages/${encodeURIComponent(id)}`, { method: 'PATCH', headers: enteteJsonCanaux(), body: JSON.stringify({ auteur: utilisateurPoste, texte }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || `HTTP ${r.status}`);
  } catch (e) { afficherToast('Non modifié : ' + (e.message || e), 'OK', null); }
  chargerMessagesCanal(true);
}
function supprimerMessageCanal(id) {
  demanderConfirmation('Supprimer ce message pour toute l’équipe ?', async () => {
    try {
      const r = await fetchAvecAuth(`/api/canaux/${encodeURIComponent(canaux.actif)}/messages/${encodeURIComponent(id)}?auteur=${encodeURIComponent(utilisateurPoste)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (e) { afficherToast('Non supprimé : ' + (e.message || e), 'OK', null); }
    chargerMessagesCanal(true);
  }, { bouton: 'Supprimer' });
}

// ---- Silences « Jamais pour ce dossier » ----

async function chargerSilencesCanal() {
  const d = canalAuDossierOuvert();
  if (!d) { canaux.silences = []; return; }
  try {
    const r = await fetchAvecAuth(`/api/canaux/silences/${encodeURIComponent(d)}`);
    if (r.ok) canaux.silences = (await r.json()).silences || [];
  } catch (e) { /* la colonne reste comme elle est */ }
  renderColonneAssistant();
}
async function retablirSilenceCanal(routine) {
  const d = canalAuDossierOuvert();
  if (!d) return;
  try {
    const r = await fetchAvecAuth(`/api/canaux/silences/${encodeURIComponent(d)}`, { method: 'POST', headers: enteteJsonCanaux(), body: JSON.stringify({ auteur: utilisateurPoste, routine, lever: true }) });
    if (r.ok) canaux.silences = (await r.json()).silences || [];
  } catch (e) { afficherToast('Non rétabli.', 'OK', null); }
  renderColonneAssistant();
}

// ---- La colonne de droite d'un canal (au-dessus de l'espace de travail de l'assistant, qui reste en dessous) ----

function htmlColonneCanal() {
  const id = canaux.actif;
  if (!id || id === '@traiter') return '';
  const d = typeCanal(id) === 'dossier' ? dossiers.find(x => x.id === id.slice(2)) : null;
  const ligne = (a, b) => `<div class="cx-li"><span>${a}</span><span>${b}</span></div>`;
  const date = (iso) => iso ? escapeHtml(String(iso).split('-').reverse().join('/')) : '—';
  let blocs = '';
  if (d) {
    const manquantes = typeof piecesAttenduesDossier === 'function' ? piecesAttenduesDossier(d).length : 0;
    blocs += `<details class="asst-droite-bloc" open><summary>${icone('folder')} Ce dossier</summary>
      <div class="cx-bloc">${ligne('Statut', renderBadgeStatut(d))}${ligne('Pièces attendues', manquantes ? `<span class="cx-ko">${manquantes}</span>` : '<span class="cx-ok">aucune</span>')}${d.pret ? ligne('Prêt', date(d.pret)) : ''}${ligne('Signature', date(d.rendezVousSignature))}
      <div class="asst-droite-actions"><wa-button appearance="outlined" size="s" type="button" onclick="ouvrirDossierDrawer('${escapeOnclickArg(d.id)}')">Ouvrir la fiche</wa-button></div></div></details>`;
    const cartes = Object.values(canaux.cartes).filter(p => p.dossierId === d.id).sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)));
    const silences = canaux.silences || [];
    blocs += `<details class="asst-droite-bloc" open><summary>${icone('sparkle')} CLAIRE sur ce dossier <span class="asst-droite-nb">${cartes.length || ''}</span></summary>
      <div class="cx-bloc">${cartes.length ? `<ul class="cx-activite">${cartes.slice(0, 8).map(p => `<li class="cx-act-${escapeAttr(p.etat)}"><span class="cx-act-point" aria-hidden="true"></span><span class="cx-act-texte">${escapeHtml(p.titre)}<small>${escapeHtml(p.etat === 'proposee' || p.etat === 'vue' ? 'À décider' : etatTexteProposition(p))}</small></span></li>`).join('')}</ul>` : '<p class="asst-droite-vide">Rien de préparé pour l’instant.</p>'}
      ${silences.length ? `<div class="cx-silences">${silences.map(s => `<div class="cx-silence"><span>${s.routine ? 'Routine coupée' : 'CLAIRE coupée'} sur ce dossier</span><button type="button" class="cx-lien" onclick="retablirSilenceCanal('${escapeOnclickArg(s.routine)}')">Rétablir</button></div>`).join('')}</div>` : ''}</div></details>`;
  }
  const epingles = assistantMessages.filter(m => m.epingle && m.id);
  blocs += `<details class="asst-droite-bloc"${epingles.length ? ' open' : ''}><summary>${icone('pin')} Épinglés <span class="asst-droite-nb">${epingles.length || ''}</span></summary>
    <div class="cx-bloc">${epingles.length ? `<ul class="cx-epingles">${epingles.map(m => `<li><button type="button" class="cx-epingle-lien" onclick="allerAuMessageCanal('${escapeOnclickArg(m.id)}')"><strong>${escapeHtml(nomAuteurCanal(m) === 'Vous' ? 'Vous' : nomAuteurCanal(m))}</strong> ${escapeHtml((m.texte || texteDepuisHtmlCanal(m.html)).replace(/\s+/g, ' ').slice(0, 90))}</button></li>`).join('')}</ul>` : '<p class="asst-droite-vide">Épinglez un message (le punaise au survol) pour le retrouver ici.</p>'}</div></details>`;
  const n = canaux.preferences.notif;
  blocs += `<details class="asst-droite-bloc"><summary>${icone('cloche')} Notifications du canal</summary>
    <div class="cx-bloc"><div class="cx-radios" role="radiogroup" aria-label="Notifications de ce canal">${[['tous', 'Tous les messages'], ['mentions', 'Mentions seulement'], ['muet', 'Muet']].map(([v, t]) => `<button type="button" role="radio" aria-checked="${n === v}" class="cx-radio${n === v ? ' actif' : ''}" onclick="reglerNotifCanal('${v}')">${t}</button>`).join('')}</div>
    <p class="asst-droite-vide">Une mention « @Prénom » prévient aussi la personne sur Teams (au plus une fois par heure).</p></div></details>`;
  return blocs;
}

function allerAuMessageCanal(id) {
  const el = document.querySelector(`#assistant-messages [data-mid="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`);
  if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('anim-surligne'); setTimeout(() => el.classList.remove('anim-surligne'), 2600); }
}

// ---- Les @ dans un canal : CLAIRE, les collègues, puis les dossiers (hors canal de dossier) ----

// Pure : les propositions de la liste « @ » d'un canal pour une requête (sans accent ni casse).
function mentionsPourCanal(requete, collaborateurs, dossiersListe, avecDossiers, moi) {
  const q = platCanal(requete).trim();
  const items = [{ type: 'claire', nom: 'CLAIRE', insere: '@CLAIRE', note: 'lui demander' }]
    .concat((collaborateurs || []).filter(c => c !== moi).map(c => ({ type: 'collab', nom: String(c).split(/\s+/)[0], insere: '@' + String(c).split(/\s+/)[0], note: 'prévenir' })))
    .filter(x => !q || platCanal(x.nom).startsWith(q));
  const ds = avecDossiers ? dossiersMentionAssistant(dossiersListe, requete).map(d => ({ type: 'dossier', nom: d.nom, id: d.id, libelle: libelleDossierAffiche(d), note: d.archive ? 'archivé' : '' })) : [];
  return items.concat(ds).slice(0, 8);
}

function majMentionCanal() {
  const champ = document.getElementById('assistant-saisie');
  const menu = document.getElementById('assistant-mention');
  if (!champ || !menu) return;
  const avant = champ.value.slice(0, champ.selectionStart || 0);
  const m = avant.match(/(^|\s)@([^\s@]{0,30})$/);
  if (!m) { fermerMentionAssistant(); return; }
  const liste = mentionsPourCanal(m[2], canaux.collaborateurs, dossiers, typeCanal(canaux.actif) !== 'dossier', utilisateurPoste);
  if (!liste.length) { fermerMentionAssistant(); return; }
  mentionAssistant = { ouverte: true, debut: avant.length - m[2].length - 1, liste, choix: Math.min(mentionAssistant.ouverte ? mentionAssistant.choix : 0, liste.length - 1) };
  menu.innerHTML = liste.map((x, k) => `<button type="button" class="asst-mention-ligne${k === mentionAssistant.choix ? ' actif' : ''}" role="option" aria-selected="${k === mentionAssistant.choix}" onmousedown="event.preventDefault(); choisirMentionAssistant(${k})">
      <span class="asst-mention-nom">${escapeHtml(x.libelle || x.nom)}</span>${x.note ? `<span class="asst-mention-note">${escapeHtml(x.note)}</span>` : ''}</button>`).join('');
  menu.style.display = 'block';
}
