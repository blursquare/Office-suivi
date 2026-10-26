// « Demander à CLAIRE » : joindre un fichier du dossier NAS SANS le copier (étude 25/10 : « fais le lien vers le NAS »). Le fichier d'un
// dossier du NAS n'est pas envoyé au serveur de pièces jointes (client/65) : le message garde un lien (dossier + chemin dans le dossier du
// client), la carte et la visionneuse relisent l'original par l'explorateur confiné du NAS (`/api/nas/explorer/fichier`). Le poste lit quand même
// le fichier pour l'agent (`lire_document`, masqué comme toute pièce jointe) ; son nom ne part toujours pas. Limite dite à l'étude : un fichier
// renommé, déplacé ou supprimé sur le NAS ne s'ouvre plus depuis son ancienne carte.

var pjNas = { dossierId: '', chemin: '', niveau: null, erreur: '', chargement: false, filtre: '' };

// Pur : l'identifiant de ressource d'un lien NAS, au format de `serveurId` d'une carte (« nas:<dossier>|<chemin> », parties encodées).
function idLienNasPieceJointe(dossierId, chemin) {
  return 'nas:' + encodeURIComponent(dossierId || '') + '|' + encodeURIComponent(chemin || '');
}

// Pur : { dossierId, chemin } d'un identifiant de lien NAS, null pour un identifiant de fichier du serveur.
function lienNasPieceJointe(id) {
  const m = /^nas:([^|]*)\|(.*)$/.exec(String(id || ''));
  if (!m) return null;
  try { return { dossierId: decodeURIComponent(m[1]), chemin: decodeURIComponent(m[2]) }; } catch (e) { return null; }
}

// Pur : l'adresse qui sert le fichier d'une carte — le fichier gardé du serveur, ou l'original du NAS.
function urlServeurPieceJointeAssistant(id) {
  if (!id) return '';
  const nas = lienNasPieceJointe(id);
  if (nas) return `/api/nas/explorer/fichier?dossierId=${encodeURIComponent(nas.dossierId)}&chemin=${encodeURIComponent(nas.chemin)}`;
  return '/api/pieces-jointes/' + encodeURIComponent(id) + '/fichier';
}

function fermerSelecteurNasAssistant() {
  const o = document.getElementById('pj-nas-overlay');
  if (o) o.remove();
}

// Sans dossier rattaché (canal « général », conversation sans dossier) : la fenêtre commence par le choix du dossier (étude 26/10 :
// « l'icône pour aller chercher un document sur le NAS ne fonctionne pas » — elle ne disait qu'un toast).
function ouvrirSelecteurNasAssistant(idChoisi) {
  fermerMenuJoindreAssistant();
  const id = idChoisi || (typeof assistantContexte === 'object' && assistantContexte.dossierId) || (typeof dossierOuvert === 'string' ? dossierOuvert : '');
  pjNas = { dossierId: id || '', chemin: '', niveau: null, erreur: '', chargement: !!id, filtre: '' };
  let o = document.getElementById('pj-nas-overlay');
  if (!o) {
    o = document.createElement('div');
    o.id = 'pj-nas-overlay';
    o.className = 'scan-apercu-overlay';
    o.addEventListener('click', (e) => { if (clicSurFond(e)) fermerSelecteurNasAssistant(); });
    document.body.appendChild(o);
  }
  // La fenêtre est cachée par défaut (.scan-apercu-overlay) : sans cela, le bouton ne montrait rien (étude 26/10).
  o.style.display = 'flex';
  if (id) chargerSelecteurNasAssistant('');
  else { renderSelecteurNasAssistant(); setTimeout(() => { const c = document.getElementById('pj-nas-recherche'); if (c) c.focus(); }, 0); }
}

// Pur : les dossiers proposés au choix — reliés au NAS, en cours d'abord, filtrés par le nom (accents et casse ignorés), 30 au plus.
function dossiersChoixNasAssistant(liste, filtre) {
  const plat = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const f = plat(filtre).trim();
  return (liste || []).filter(d => d && d.nasDossier && (!f || plat(libelleDossierAffiche(d) + ' ' + (d.nom || '')).includes(f)))
    .sort((a, b) => (a.archive ? 1 : 0) - (b.archive ? 1 : 0) || libelleDossierAffiche(a).localeCompare(libelleDossierAffiche(b), 'fr'))
    .slice(0, 30);
}

function lignesChoixNasAssistant() {
  const choix = dossiersChoixNasAssistant(dossiers, pjNas.filtre);
  return choix.map(d => `<li class="exp-ligne exp-dossier"><button type="button" class="exp-nom" onclick="ouvrirSelecteurNasAssistant('${escapeOnclickArg(d.id)}')">${icone('folder')}<span>${escapeHtml(libelleDossierAffiche(d))}</span></button></li>`).join('')
    || '<li class="exp-ligne exp-vide"><span class="hint">Aucun dossier relié au NAS ne porte ce nom.</span></li>';
}

function filtrerChoixNasAssistant(valeur) {
  pjNas.filtre = String(valeur || '');
  const ul = document.getElementById('pj-nas-liste');
  if (ul) ul.innerHTML = lignesChoixNasAssistant();
}

async function chargerSelecteurNasAssistant(chemin) {
  pjNas.chemin = chemin;
  pjNas.chargement = true;
  pjNas.erreur = '';
  renderSelecteurNasAssistant();
  try {
    const r = await fetchAvecAuth(`/api/nas/explorer?dossierId=${encodeURIComponent(pjNas.dossierId)}&sous=${encodeURIComponent(chemin)}`);
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corps.erreur || 'Le NAS n’a pas répondu.');
    pjNas.niveau = corps;
  } catch (e) { pjNas.erreur = e.message || 'Le NAS n’a pas répondu.'; }
  pjNas.chargement = false;
  renderSelecteurNasAssistant();
}

function renderSelecteurNasAssistant() {
  const o = document.getElementById('pj-nas-overlay');
  if (!o) return;
  if (!pjNas.dossierId) {
    o.innerHTML = `<div class="scan-apercu pj-nas-fenetre" role="dialog" aria-modal="true" aria-labelledby="pj-nas-titre">
      <header class="scan-apercu-tete"><div class="scan-apercu-titres"><h2 id="pj-nas-titre">Joindre depuis le NAS</h2><div class="scan-apercu-meta"><span>Choisissez le dossier</span></div></div>
        <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="fermerSelecteurNasAssistant()" aria-label="Fermer">${icone('x')}</wa-button></header>
      <div style="padding:0 16px 8px;"><input type="text" id="pj-nas-recherche" autocomplete="off" placeholder="Nom du dossier…" aria-label="Chercher un dossier" oninput="filtrerChoixNasAssistant(this.value)"></div>
      <ul class="exp-liste" id="pj-nas-liste" style="overflow:auto;padding:0 16px 16px;margin:0;list-style:none;">${lignesChoixNasAssistant()}</ul></div>`;
    return;
  }
  const d = dossiers.find(x => x.id === pjNas.dossierId);
  const n = pjNas.niveau;
  const joignable = (nom) => /\.(pdf|png|jpe?g|gif|webp|bmp)$/i.test(nom);
  const haut = pjNas.chemin ? pjNas.chemin.split('/').slice(0, -1).join('/') : null;
  const lignes = pjNas.chargement ? `<li class="exp-ligne exp-vide"><span class="hint">${icone('spinner', null, true)} Lecture…</span></li>`
    : pjNas.erreur ? `<li class="exp-ligne exp-vide"><span class="hint">${escapeHtml(pjNas.erreur)}</span></li>`
      : [haut !== null ? `<li class="exp-ligne"><button type="button" class="exp-nom" onclick="chargerSelecteurNasAssistant('${escapeOnclickArg(haut)}')">${icone('chevron-left')}<span>Dossier parent</span></button></li>` : '']
        .concat((n.dossiers || []).map(f => `<li class="exp-ligne exp-dossier"><button type="button" class="exp-nom" onclick="chargerSelecteurNasAssistant('${escapeOnclickArg(pjNas.chemin ? pjNas.chemin + '/' + f.nom : f.nom)}')">${icone('folder')}<span>${escapeHtml(f.nom)}</span></button></li>`))
        .concat((n.fichiers || []).filter(f => joignable(f.nom)).map(f => `<li class="exp-ligne exp-fichier"><button type="button" class="exp-nom" onclick="joindreFichierNasAssistant('${escapeOnclickArg(pjNas.chemin ? pjNas.chemin + '/' + f.nom : f.nom)}')" title="Joindre ce fichier (un lien, pas une copie)">${icone('file-text')}<span>${escapeHtml(f.nom)}</span></button><span class="exp-info">${f.taille != null ? escapeHtml(tailleLisible(f.taille)) : ''}</span></li>`))
        .join('') || '<li class="exp-ligne exp-vide"><span class="hint">Aucun PDF ni image ici.</span></li>';
  o.innerHTML = `<div class="scan-apercu pj-nas-fenetre" role="dialog" aria-modal="true" aria-labelledby="pj-nas-titre">
      <header class="scan-apercu-tete"><div class="scan-apercu-titres"><h2 id="pj-nas-titre">Joindre depuis le dossier NAS</h2><div class="scan-apercu-meta"><span>${escapeHtml(d ? libelleDossierAffiche(d) : '')}${pjNas.chemin ? ' · ' + escapeHtml(pjNas.chemin) : ''}</span><button type="button" class="lien-discret" onclick="pjNas.dossierId = ''; pjNas.filtre = ''; renderSelecteurNasAssistant()">Autre dossier</button></div></div>
        <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="fermerSelecteurNasAssistant()" aria-label="Fermer">${icone('x')}</wa-button></header>
      <ul class="exp-liste" style="overflow:auto;padding:0 16px 16px;margin:0;list-style:none;">${Array.isArray(lignes) ? lignes.join('') : lignes}</ul></div>`;
}

// Joint le fichier choisi : lu sur le poste pour l'agent, jamais copié sur le serveur ; le message garde le lien.
async function joindreFichierNasAssistant(chemin) {
  const dossierId = pjNas.dossierId;
  const nom = String(chemin).split('/').pop();
  try {
    const r = await fetchAvecAuth(`/api/nas/explorer/fichier?dossierId=${encodeURIComponent(dossierId)}&chemin=${encodeURIComponent(chemin)}`);
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).erreur) || 'Fichier introuvable.');
    const blob = await r.blob();
    const avant = piecesJointesAssistant.length;
    ajouterPiecesJointesAssistant([new File([blob], nom, { type: blob.type })]);
    if (piecesJointesAssistant.length > avant) {
      const p = piecesJointesAssistant[piecesJointesAssistant.length - 1];
      p.nas = { dossierId, chemin };
      p.serveurId = idLienNasPieceJointe(dossierId, chemin);
    }
    fermerSelecteurNasAssistant();
  } catch (e) { afficherToast(e.message || 'Impossible de joindre ce fichier.', 'OK', null); }
}

// « + » en tête de la barre de saisie (étude 26/10 : « mettre un + », puis « mets le + tout en premier à gauche ») : un petit menu, fichier de
// l'ordinateur ou fichier d'un dossier du NAS.
function ouvrirMenuJoindreAssistant(bouton) {
  if (document.getElementById('asst-menu-joindre')) { fermerMenuJoindreAssistant(); return; }
  const m = document.createElement('div');
  m.id = 'asst-menu-joindre';
  m.className = 'asst-menu-joindre';
  m.setAttribute('role', 'menu');
  m.innerHTML = `<button type="button" role="menuitem" onclick="fermerMenuJoindreAssistant(); choisirPiecesJointesAssistant()">${icone('paperclip')}<span>Fichier de l’ordinateur</span></button>`
    + `<button type="button" role="menuitem" onclick="ouvrirSelecteurNasAssistant()">${icone('folder')}<span>Fichier d’un dossier du NAS</span></button>`;
  document.body.appendChild(m);
  const r = bouton.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = Math.max(8, r.top - m.offsetHeight - 6) + 'px';
  setTimeout(() => { document.addEventListener('mousedown', fermerMenuJoindreSiAilleurs); document.addEventListener('keydown', toucheMenuJoindreAssistant); }, 0);
  const premier = m.querySelector('button');
  if (premier) premier.focus();
}

function fermerMenuJoindreSiAilleurs(e) {
  const m = document.getElementById('asst-menu-joindre');
  if (m && e && m.contains(e.target)) return;
  // Un clic sur « + » lui-même : laissé au bouton, qui referme le menu (sinon il le rouvrait aussitôt).
  if (e && e.target && e.target.closest && e.target.closest('.asst-joindre-plus')) return;
  fermerMenuJoindreAssistant();
}

function toucheMenuJoindreAssistant(e) {
  if (e && e.key === 'Escape') fermerMenuJoindreAssistant();
}

function fermerMenuJoindreAssistant() {
  const m = document.getElementById('asst-menu-joindre');
  if (m) m.remove();
  document.removeEventListener('mousedown', fermerMenuJoindreSiAilleurs);
  document.removeEventListener('keydown', toucheMenuJoindreAssistant);
}
