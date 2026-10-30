// GIF des discussions (étude 30/10 : « à côté des emoji, l'accès à une bibliothèque de GIF pour en envoyer » ; choix : Tenor). Le serveur
// interroge Tenor et sert les images (server/src/gif.js) : la page n'appelle aucun site extérieur, seul le mot tapé part chez Tenor. Le GIF
// choisi devient une pièce jointe du message (même chemin qu'une image collée : gardé 90 jours sur le serveur du bureau), envoyé par Entrée.

var gifEtat = { minuterie: null, requete: 0 };

function fermerSelecteurGif() {
  const m = document.getElementById('selecteur-gif');
  if (m) m.remove();
  document.removeEventListener('mousedown', fermerSelecteurGifSiAilleurs);
  document.removeEventListener('keydown', toucheSelecteurGif);
}
function fermerSelecteurGifSiAilleurs(e) {
  const m = document.getElementById('selecteur-gif');
  if (m && e && m.contains(e.target)) return;
  if (e && e.target && e.target.closest && e.target.closest('.asst-gif')) return;
  fermerSelecteurGif();
}
function toucheSelecteurGif(e) { if (e && e.key === 'Escape') fermerSelecteurGif(); }

function ouvrirSelecteurGif(bouton) {
  if (document.getElementById('selecteur-gif')) { fermerSelecteurGif(); return; }
  const m = document.createElement('div');
  m.id = 'selecteur-gif';
  m.className = 'selecteur-gif';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-label', 'Choisir un GIF');
  m.innerHTML = `<input type="search" id="selecteur-gif-recherche" placeholder="Chercher un GIF (Tenor)" aria-label="Chercher un GIF" oninput="rechercherGifDiffere(this.value)">
    <div class="selecteur-gif-grille" id="selecteur-gif-grille"><p class="hint">Chargement…</p></div>
    <span class="selecteur-gif-source">Via Tenor</span>`;
  document.body.appendChild(m);
  const r = bouton.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = Math.max(8, r.top - m.offsetHeight - 6) + 'px';
  setTimeout(() => { document.addEventListener('mousedown', fermerSelecteurGifSiAilleurs); document.addEventListener('keydown', toucheSelecteurGif); }, 0);
  const champ = document.getElementById('selecteur-gif-recherche');
  if (champ) champ.focus();
  rechercherGif('');
}

function rechercherGifDiffere(q) {
  clearTimeout(gifEtat.minuterie);
  gifEtat.minuterie = setTimeout(() => rechercherGif(q), 350);
}

// Pure : l'adresse de l'image servie par CLAIRE pour une image de Tenor.
function urlImageGif(url) {
  return '/api/gif/image?url=' + encodeURIComponent(String(url || ''));
}

async function rechercherGif(q) {
  const n = ++gifEtat.requete;
  const grille = document.getElementById('selecteur-gif-grille');
  if (!grille) return;
  try {
    const r = await fetchAvecAuth('/api/gif/recherche?q=' + encodeURIComponent(String(q || '').slice(0, 60)));
    const j = await r.json().catch(() => ({}));
    if (n !== gifEtat.requete || !document.getElementById('selecteur-gif-grille')) return;
    if (!r.ok) { grille.innerHTML = `<p class="hint">${escapeHtml(j.erreur || 'Tenor ne répond pas.')}</p>`; return; }
    if (!j.disponible) { grille.innerHTML = '<p class="hint">Bibliothèque de GIF pas encore réglée : clé Tenor à saisir dans Réglages › Général (administrateur).</p>'; return; }
    grille.innerHTML = (j.resultats || []).map(g => `<button type="button" class="selecteur-gif-case" onclick="choisirGif('${escapeOnclickArg(g.gif)}')" title="Joindre ce GIF"><img src="${escapeAttr(urlImageGif(g.apercu))}" alt="" loading="lazy"></button>`).join('')
      || '<p class="hint">Aucun GIF pour ce mot.</p>';
  } catch (e) {
    if (grille) grille.innerHTML = '<p class="hint">Recherche impossible pour le moment.</p>';
  }
}

async function choisirGif(url) {
  fermerSelecteurGif();
  try {
    const r = await fetchAvecAuth(urlImageGif(url));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    ajouterPiecesJointesAssistant([new File([blob], 'GIF.gif', { type: 'image/gif' })]);
  } catch (e) {
    afficherToast('GIF non joint : ' + e.message, 'OK', null);
  }
}

// Réglages › Général : la clé de l'API Tenor (administrateur), jamais relue en clair.
async function renderReglagesGif() {
  const zone = document.getElementById('reglages-gif');
  if (!zone) return;
  let cleEnregistree = false;
  try { cleEnregistree = !!(await (await fetchAvecAuth('/api/gif/reglages')).json()).cleEnregistree; } catch (e) { /* serveur indisponible */ }
  const admin = typeof estAdministrateur === 'function' && estAdministrateur(utilisateurPoste);
  zone.innerHTML = `<h3 class="reglages-section-titre">GIF des discussions ${infoBulle('Le bouton « GIF » à côté des emoji cherche dans Tenor (Google) : seul le mot tapé part chez Tenor, les images passent par le serveur du bureau. Clé gratuite à créer dans la console Google Cloud (« Tenor API »).')}</h3>
    <div class="reglages-liste"><label class="reglages-champ" for="reglages-gif-cle"><span class="reglages-option-titre">Clé de l’API Tenor</span>
      <input type="password" id="reglages-gif-cle" autocomplete="off" placeholder="${cleEnregistree ? 'Enregistrée — laisser vide pour la garder' : 'Coller la clé'}"${admin ? '' : ' disabled'}></label>
      ${admin ? '<wa-button appearance="outlined" size="s" type="button" onclick="enregistrerReglagesGif()">Enregistrer</wa-button>' : '<p class="hint">Réservé à l’administrateur.</p>'}</div>`;
}

async function enregistrerReglagesGif() {
  const champ = document.getElementById('reglages-gif-cle');
  const cle = champ ? champ.value.trim() : '';
  if (!cle) { afficherToast('Clé inchangée.', 'OK', null); return; }
  try {
    const r = await fetchAvecAuth('/api/gif/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auteur: utilisateurPoste, cle }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || `HTTP ${r.status}`);
    afficherToast('Clé Tenor enregistrée.', 'OK', null);
    renderReglagesGif();
  } catch (e) { afficherToast('Clé non enregistrée : ' + e.message, 'OK', null); }
}
