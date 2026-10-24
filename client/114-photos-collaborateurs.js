// Photos de profil des collaborateurs (étude 24/10) : déposées dans Réglages › Collaborateurs, elles remplacent les initiales partout
// où un collaborateur est montré (pastilles du Suivi et des tâches, fil des canaux, activité) ; sans photo, les initiales restent.
// Le poste réduit l'image en un carré de 160 px (JPEG) avant l'envoi ; le serveur la garde (clé `photos-collaborateurs`).

var photosCollaborateurs = {}; // { 'Prénom NOM': 'data:image/jpeg;base64,…' }
var TAILLE_PHOTO_PROFIL = 160;

// Pure : le contenu d'une pastille de collaborateur — sa photo, sinon ses initiales (texte échappé).
function contenuAvatarCollaborateur(nom, photos, initiales) {
  const url = photos && photos[nom];
  if (typeof url === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(url)) {
    return `<img class="avatar-photo" src="${url}" alt="" draggable="false">`;
  }
  return escapeHtml(initiales);
}

async function chargerPhotosCollaborateurs() {
  try {
    const r = await fetchAvecAuth('/api/photos-collaborateurs');
    if (!r.ok) return;
    const propres = await r.json();
    if (JSON.stringify(propres) === JSON.stringify(photosCollaborateurs)) return;
    photosCollaborateurs = propres && typeof propres === 'object' ? propres : {};
    appliquerPhotosCollaborateurs();
  } catch (e) { /* les initiales restent */ }
}

function appliquerPhotosCollaborateurs() {
  if (typeof window.render === 'function') window.render();
  renderReglagesPhotos();
  if (typeof ecranAffiche === 'function' && ecranAffiche('assistant')) renderAssistant();
}

function renderReglagesPhotos() {
  const zone = document.getElementById('reglages-photos-liste');
  if (!zone) return;
  zone.innerHTML = RESPONSABLES.map((nom, i) => {
    const a = photosCollaborateurs[nom];
    return `<div class="reglages-champ">
      <div class="reglages-champ-libelle"><label for="photo-profil-${i}">${escapeHtml(nom)}</label></div>
      <div class="photo-profil-ligne">
        <span class="photo-profil-apercu">${contenuAvatarCollaborateur(nom, photosCollaborateurs, initialesCollaborateur(nom))}</span>
        <input type="file" id="photo-profil-${i}" accept="image/png,image/jpeg,image/webp" hidden onchange="deposerPhotoProfil('${escapeOnclickArg(nom)}', this)">
        <wa-button appearance="outlined" size="s" type="button" onclick="document.getElementById('photo-profil-${i}').click()">${a ? 'Changer la photo' : 'Ajouter une photo'}</wa-button>
        ${a ? `<wa-button appearance="plain" size="s" type="button" onclick="retirerPhotoProfil('${escapeOnclickArg(nom)}')">Retirer</wa-button>` : '<span class="hint">Initiales affichées</span>'}
      </div>
    </div>`;
  }).join('');
}

// Réduit l'image choisie en un carré centré de TAILLE_PHOTO_PROFIL px, JPEG ; rend le base64 sans en-tête.
function reduirePhotoProfil(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const cote = Math.min(image.naturalWidth, image.naturalHeight);
      if (!cote) { reject(new Error('image vide')); return; }
      const canevas = document.createElement('canvas');
      canevas.width = canevas.height = TAILLE_PHOTO_PROFIL;
      const ctx = canevas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, TAILLE_PHOTO_PROFIL, TAILLE_PHOTO_PROFIL);
      ctx.drawImage(image, (image.naturalWidth - cote) / 2, (image.naturalHeight - cote) / 2, cote, cote, 0, 0, TAILLE_PHOTO_PROFIL, TAILLE_PHOTO_PROFIL);
      resolve(canevas.toDataURL('image/jpeg', 0.85).replace(/^data:image\/jpeg;base64,/, ''));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
    image.src = url;
  });
}

async function deposerPhotoProfil(nom, input) {
  const fichier = input && input.files && input.files[0];
  if (!fichier) return;
  try {
    if (!/^image\/(png|jpeg|webp)$/.test(fichier.type)) throw new Error('choisissez une image PNG, JPEG ou WebP');
    if (fichier.size > 12 * 1024 * 1024) throw new Error('image trop lourde (12 Mo au plus)');
    const base64 = await reduirePhotoProfil(fichier);
    const r = await fetchAvecAuth('/api/photos-collaborateurs/' + encodeURIComponent(nom), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64 })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erreur || 'enregistrement refusé');
    photosCollaborateurs = j;
    appliquerPhotosCollaborateurs();
    afficherToast(`Photo de ${nom} enregistrée.`, 'OK', null);
  } catch (e) {
    afficherToast('Photo non enregistrée : ' + e.message, 'OK', null);
  } finally {
    input.value = '';
  }
}

function retirerPhotoProfil(nom) {
  demanderConfirmation(`Retirer la photo de ${nom} ? Ses initiales seront affichées à la place.`, async () => {
    try {
      const r = await fetchAvecAuth('/api/photos-collaborateurs/' + encodeURIComponent(nom), { method: 'DELETE' });
      if (!r.ok) throw new Error('statut ' + r.status);
      photosCollaborateurs = await r.json();
      appliquerPhotosCollaborateurs();
    } catch (e) { afficherToast('Retrait impossible : ' + e.message, 'OK', null); }
  });
}
