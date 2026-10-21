// ==== Explorateur du dossier client sur le NAS (étude 20/10) ====
// « Quand on clique sur Ouvrir le NAS, un pop-up avec l'explorateur ; pouvoir renommer des pièces et les déplacer d'un sous-dossier
// à un autre. » Le serveur ne sert que le dossier relié à la fiche (server/src/explorateurNas.js) : lecture de tout le dossier,
// renommer un fichier (extension gardée) et le déplacer vers un autre sous-dossier existant ; jamais de suppression ni d'écrasement.
// Chaque geste se défait d'un clic (« Annuler » : le geste inverse).

// Arbre dépliable (étude 20/10 : « que les dossiers puissent se déplier, glisser-déposer un fichier dans un sous-dossier ») :
// `niveaux` = contenu lu de chaque dossier (clé = chemin, '' = racine), `ouverts` = dossiers dépliés, `glisse` = fichier tenu au pointeur.
function etatVideExplorateurNas(dossierId) { return { dossierId: dossierId || '', niveaux: {}, ouverts: new Set(), arbre: [], erreur: '', chargement: false, glisse: '', survol: null }; }
var explorateurNas = etatVideExplorateurNas('');

function dossierExplorateurNas() { return dossiers.find(x => x.id === explorateurNas.dossierId) || null; }

function ouvrirExplorateurNas(dossierId) {
  const d = dossiers.find(x => x.id === dossierId);
  if (!d || !d.dossierLie || !d.nasDossier) { afficherToast('Reliez d’abord un dossier du NAS.', 'OK', null); return; }
  let fond = document.getElementById('explorateur-nas-overlay');
  if (!fond) {
    fond = document.createElement('div');
    fond.id = 'explorateur-nas-overlay';
    fond.className = 'confirm-overlay explorateur-nas-overlay';
    fond.addEventListener('mousedown', (e) => { fond.dataset.appui = e.target === fond ? '1' : ''; });
    fond.addEventListener('click', (e) => { if (e.target === fond && fond.dataset.appui === '1') fermerExplorateurNas(); });
    document.body.appendChild(fond);
  }
  explorateurNas = etatVideExplorateurNas(dossierId);
  sequenceExplorateurNas = {};
  explorateurNas.chargement = true;
  fond.style.display = 'flex';
  renderExplorateurNas();
  chargerExplorateurNas('');
}

function fermerExplorateurNas() {
  const fond = document.getElementById('explorateur-nas-overlay');
  if (fond) { fond.style.display = 'none'; fond.innerHTML = ''; }
  explorateurNas = etatVideExplorateurNas('');
}
document.addEventListener('keydown', (e) => {
  const fond = document.getElementById('explorateur-nas-overlay');
  const saisie = document.getElementById('fenetre-saisie-overlay');
  if (saisie && saisie.style.display === 'flex') return;   // la petite fenêtre posée par-dessus se ferme d'abord (client/92)
  if (e.key === 'Escape' && fond && fond.style.display === 'flex') { e.stopPropagation(); fermerExplorateurNas(); }
}, true);

var sequenceExplorateurNas = {};   // dernière lecture lancée par dossier : une lecture plus ancienne n'écrase jamais la plus récente
// Lit un dossier (la racine par défaut) et le garde ; les dossiers dépliés sont relus avec la racine après un geste.
async function chargerExplorateurNas(sous) {
  const id = explorateurNas.dossierId;
  if (!id) return;
  const cle = sous || '';
  const numero = (sequenceExplorateurNas[cle] = (sequenceExplorateurNas[cle] || 0) + 1);
  explorateurNas.chargement = true;
  explorateurNas.erreur = '';
  renderExplorateurNas();
  try {
    const r = await fetchAvecAuth(`/api/nas/explorer?dossierId=${encodeURIComponent(id)}&sous=${encodeURIComponent(cle)}`);
    const corps = await r.json().catch(() => ({}));
    if (explorateurNas.dossierId !== id || numero !== sequenceExplorateurNas[cle]) return;
    if (!r.ok) throw new Error(corps.erreur || 'Le NAS n’a pas répondu.');
    explorateurNas.niveaux[cle] = corps;
    if (corps.arbre) explorateurNas.arbre = corps.arbre;
  } catch (e) {
    if (explorateurNas.dossierId !== id || numero !== sequenceExplorateurNas[cle]) return;
    if (cle) explorateurNas.ouverts.delete(cle);
    explorateurNas.erreur = e.message || 'Le NAS n’a pas répondu.';
  }
  explorateurNas.chargement = false;
  renderExplorateurNas();
}

// Déplier ou replier un dossier ; un dossier jamais lu se lit à l'ouverture.
function basculerDossierExplorateurNas(chemin) {
  const e = explorateurNas;
  if (e.ouverts.has(chemin)) { e.ouverts.delete(chemin); renderExplorateurNas(); return; }
  e.ouverts.add(chemin);
  if (e.niveaux[chemin]) renderExplorateurNas(); else chargerExplorateurNas(chemin);
}

// Après un geste : la racine et chaque dossier déplié sont relus (le fichier a changé de place).
async function relireOuvertsExplorateurNas() {
  const chemins = [''].concat([...explorateurNas.ouverts]);
  for (const c of chemins) { if (explorateurNas.dossierId) await chargerExplorateurNas(c); }
}

// Pure : le nom sans son extension (ce qu'on retouche) et l'extension.
function nomSansExtensionNas(nom) {
  const m = /^(.*?)(\.[A-Za-z0-9]{1,8})$/.exec(String(nom || ''));
  return m && m[1] ? { base: m[1], ext: m[2] } : { base: String(nom || ''), ext: '' };
}

// Pure : le dossier où un fichier glissé sur `cible` irait, ou null s'il y est déjà (déplacement sans effet).
function destinationGlisseExplorateurNas(cheminFichier, cible) {
  const f = String(cheminFichier || '');
  const dedans = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
  return dedans === String(cible || '') ? null : String(cible || '');
}

function lignesNiveauExplorateurNas(chemin) {
  const e = explorateurNas;
  const n = e.niveaux[chemin];
  if (!n) return '';
  const rang = chemin ? chemin.split('/').length : 0;
  const sortie = [];
  n.dossiers.forEach(f => {
    const cheminF = chemin ? chemin + '/' + f.nom : f.nom;
    const ouvert = e.ouverts.has(cheminF);
    sortie.push(`<li class="exp-ligne exp-dossier" style="--niv:${rang}" data-dossier="${escapeAttr(cheminF)}" aria-expanded="${ouvert}">
      <button type="button" class="exp-nom" onclick="basculerDossierExplorateurNas('${escapeOnclickArg(cheminF)}')">${icone(ouvert ? 'chevron-down' : 'chevron-right')}${icone('folder')}<span>${escapeHtml(f.nom)}</span></button></li>`);
    if (ouvert) {
      const dedans = e.niveaux[cheminF] ? lignesNiveauExplorateurNas(cheminF) : '';
      if (dedans) sortie.push(dedans);
      else sortie.push(`<li class="exp-ligne exp-vide" style="--niv:${rang + 1}"><span class="hint">${e.niveaux[cheminF] ? 'Dossier vide' : `${icone('spinner', null, true)} Lecture…`}</span></li>`);
    }
  });
  n.fichiers.forEach(f => {
    const cheminF = chemin ? chemin + '/' + f.nom : f.nom;
    const arg = escapeOnclickArg(cheminF);
    const quand = f.modifieLe ? new Date(f.modifieLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    sortie.push(`<li class="exp-ligne exp-fichier" style="--niv:${rang}" draggable="true" data-fichier="${escapeAttr(cheminF)}">
        <button type="button" class="exp-nom" onclick="ouvrirFichierExplorateurNas('${arg}')" title="Ouvrir (ou glisser sur un dossier pour le déplacer)">${icone('file-text')}<span>${escapeHtml(f.nom)}</span></button>
        <span class="exp-info">${f.taille != null ? escapeHtml(tailleLisible(f.taille)) : ''}</span><span class="exp-info">${escapeHtml(quand)}</span>
        <span class="exp-actions">
          <wa-button appearance="plain" size="s" class="bouton-icone" onclick="renommerFichierExplorateurNas('${arg}')" aria-label="Renommer ${escapeAttr(f.nom)}" title="Renommer">${icone('pencil')}</wa-button>
          <wa-button appearance="plain" size="s" class="bouton-discret" onclick="deplacerFichierExplorateurNas('${arg}')" aria-label="Déplacer ${escapeAttr(f.nom)}" title="Déplacer vers un autre dossier">${icone('folder')} Déplacer</wa-button>
        </span></li>`);
  });
  return sortie.join('');
}

function renderExplorateurNas() {
  const fond = document.getElementById('explorateur-nas-overlay');
  const d = dossierExplorateurNas();
  if (!fond || !d) return;
  const e = explorateurNas;
  const racine = e.niveaux[''];
  let corps;
  if (e.erreur && !racine) corps = `<p class="hint exp-etat">${icone('alert-triangle')} ${escapeHtml(e.erreur)}</p>`;
  else if (!racine) corps = `<p class="hint exp-etat">${icone('spinner', null, true)} Lecture du NAS…</p>`;
  else {
    const lignes = lignesNiveauExplorateurNas('');
    corps = `${e.erreur ? `<p class="hint exp-etat exp-erreur">${icone('alert-triangle')} ${escapeHtml(e.erreur)}</p>` : ''}
      <ul class="exp-liste"><li class="exp-ligne exp-dossier exp-racine" style="--niv:0" data-dossier="" title="Déposer ici pour remettre un fichier à la racine"><span class="exp-nom">${icone('folder')}<span>Dossier du client</span></span></li>${lignes}</ul>
      ${lignes ? '' : '<p class="hint exp-etat">Ce dossier est vide.</p>'}`;
  }
  const defile = fond.querySelector('.exp-corps');
  const haut = defile ? defile.scrollTop : 0;
  fond.innerHTML = `<div class="confirm-box explorateur-nas" role="dialog" aria-modal="true" aria-labelledby="exp-titre">
      <header class="exp-tete">
        <div class="exp-titres"><h2 id="exp-titre">Dossier du NAS ${e.chargement && racine ? icone('spinner', null, true) : ''}</h2><span class="hint">${escapeHtml(libelleDossierAffiche(d))} · glisser un fichier sur un dossier pour le déplacer</span></div>
        <wa-button appearance="outlined" size="s" class="bouton-discret" onclick="copierEmplacementExplorateurNas()" title="Copier l’emplacement réseau, à coller dans l’Explorateur Windows">${icone('copier')} Copier l’emplacement</wa-button>
        <wa-button appearance="plain" size="s" class="bouton-icone icon-btn" onclick="fermerExplorateurNas()" aria-label="Fermer">${icone('x')}</wa-button>
      </header>
      <div class="exp-corps">${corps}</div>
    </div>`;
  const nouveau = fond.querySelector('.exp-corps');
  if (nouveau && haut) nouveau.scrollTop = haut;
}

// Glisser-déposer : un fichier tenu au pointeur se dépose sur un dossier (ou sur la racine). Le survol se marque sans redessiner
// la liste (un redessin en plein glissé annulerait le geste).
function marquerSurvolExplorateurNas(cible) {
  const fond = document.getElementById('explorateur-nas-overlay');
  if (!fond) return;
  explorateurNas.survol = cible;
  fond.querySelectorAll('.exp-depot').forEach(li => li.classList.remove('exp-depot'));
  if (cible !== null) { const li = [...fond.querySelectorAll('li[data-dossier]')].find(x => x.dataset.dossier === cible); if (li) li.classList.add('exp-depot'); }
}
if (typeof document !== 'undefined' && document.addEventListener) {
  const dansFenetre = (ev) => { const fond = document.getElementById('explorateur-nas-overlay'); return !!(fond && ev.target && fond.contains(ev.target)); };
  const dossierSous = (ev) => { const li = ev.target && ev.target.closest ? ev.target.closest('li[data-dossier]') : null; return li ? li.dataset.dossier : null; };
  document.addEventListener('dragstart', (ev) => {
    if (!dansFenetre(ev)) return;
    const li = ev.target && ev.target.closest ? ev.target.closest('li[data-fichier]') : null;
    if (!li) return;
    explorateurNas.glisse = li.dataset.fichier;
    ev.dataTransfer.effectAllowed = 'move';
    try { ev.dataTransfer.setData('text/plain', li.dataset.fichier); } catch (e) { /* navigateur sans données */ }
    li.classList.add('exp-glisse');
  });
  document.addEventListener('dragover', (ev) => {
    if (!dansFenetre(ev) || !explorateurNas.glisse) return;
    const cible = dossierSous(ev);
    const permis = cible !== null && destinationGlisseExplorateurNas(explorateurNas.glisse, cible) !== null;
    if (permis) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; }
    const marque = permis ? cible : null;
    if (marque !== explorateurNas.survol) marquerSurvolExplorateurNas(marque);
  });
  document.addEventListener('drop', (ev) => {
    if (!dansFenetre(ev) || !explorateurNas.glisse) return;
    ev.preventDefault();
    const cible = dossierSous(ev);
    const chemin = explorateurNas.glisse;
    const vers = cible === null ? null : destinationGlisseExplorateurNas(chemin, cible);
    explorateurNas.glisse = '';
    marquerSurvolExplorateurNas(null);
    if (vers !== null) {
      deplacerVersExplorateurNas(chemin, vers).then(erreur => { if (erreur) afficherToast(erreur, 'OK', null); });
    } else renderExplorateurNas();
  });
  document.addEventListener('dragend', () => { if (explorateurNas.glisse) { explorateurNas.glisse = ''; marquerSurvolExplorateurNas(null); renderExplorateurNas(); } });
}

// Un fichier : PDF et images s'affichent dans un onglet, le reste se télécharge.
async function ouvrirFichierExplorateurNas(chemin) {
  const id = explorateurNas.dossierId;
  const nom = String(chemin).split('/').pop();
  const affichable = /\.(pdf|png|jpe?g|gif|webp)$/i.test(nom);
  const onglet = affichable ? window.open('', '_blank') : null;
  try {
    const r = await fetchAvecAuth(`/api/nas/explorer/fichier?dossierId=${encodeURIComponent(id)}&chemin=${encodeURIComponent(chemin)}`);
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).erreur) || 'Fichier introuvable.');
    const url = URL.createObjectURL(await r.blob());
    if (affichable) { if (onglet) onglet.location.href = url; else window.open(url, '_blank'); }
    else { const a = document.createElement('a'); a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    if (onglet) onglet.close();
    afficherToast(e.message || 'Impossible d’ouvrir ce fichier.', 'OK', null);
  }
}

// `dossierId` : le dossier où le geste se fait (celui de la fenêtre au moment du clic, gardé pour son « Annuler » même si la fenêtre
// a changé de dossier ou s'est fermée entre-temps).
async function gesteExplorateurNas(route, corps, dossierId) {
  const r = await fetchAvecAuth('/api/nas/explorer/' + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ dossierId: dossierId || explorateurNas.dossierId, auteur: utilisateurPoste || '' }, corps))
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { erreur: j.erreur || 'Le NAS n’a pas répondu.' };
}

// Après un geste : la liste est relue. Les pièces de la fiche ne sont PAS relancées : au prochain parcours du NAS, une pièce
// reconnue par son nom et renommée ou déplacée peut repasser « manquante » (sauf validée à la main).
function apresGesteExplorateurNas() { relireOuvertsExplorateurNas(); }

function renommerFichierExplorateurNas(chemin) {
  const nom = String(chemin).split('/').pop();
  const { base, ext } = nomSansExtensionNas(nom);
  ouvrirFenetreSaisie({
    titre: 'Renommer la pièce',
    champs: [{ id: 'nom', label: ext ? `Nouveau nom (l’extension ${ext} reste)` : 'Nouveau nom', valeur: base }],
    bouton: 'Renommer',
    onValider: async (v) => {
      const dossierId = explorateurNas.dossierId;
      const r = await gesteExplorateurNas('renommer', { chemin, nom: v.nom }, dossierId);
      if (r.erreur) return r.erreur;
      noterVerificationPoste('explorateur-nas', { detail: 'pièce renommée' });
      apresGesteExplorateurNas();
      if (!r.inchange) afficherToast(`Renommé : « ${r.nom} ».`, 'Annuler', async () => {
        const retour = await gesteExplorateurNas('renommer', { chemin: r.chemin, nom: nomSansExtensionNas(nom).base }, dossierId);
        if (retour.erreur) afficherToast(retour.erreur, 'OK', null); else apresGesteExplorateurNas();
      });
      return '';
    }
  });
}

// Le déplacement lui-même (fenêtre « Déplacer » et glisser-déposer) ; « Annuler » remet le fichier d'où il vient.
async function deplacerVersExplorateurNas(chemin, vers, dossierIdForce) {
  const nom = String(chemin).split('/').pop();
  const dossierActuel = String(chemin).includes('/') ? String(chemin).slice(0, String(chemin).lastIndexOf('/')) : '';
  const dossierId = dossierIdForce || explorateurNas.dossierId;
  const r = await gesteExplorateurNas('deplacer', { chemin, vers }, dossierId);
  if (r.erreur) return r.erreur;
  noterVerificationPoste('explorateur-nas', { detail: 'pièce déplacée' });
  if (vers) explorateurNas.ouverts.add(vers);
  apresGesteExplorateurNas();
  afficherToast(`Déplacé dans « ${vers ? vers.replace(/\//g, ' › ') : 'la racine'} »${r.nom !== nom ? ` sous le nom « ${r.nom} »` : ''}.`, 'Annuler', async () => {
    let retour = await gesteExplorateurNas('deplacer', { chemin: r.chemin, vers: dossierActuel }, dossierId);
    // Arrivé sous « Nom (2) » : il retrouve le nom qu'il avait, si ce nom est libre.
    if (!retour.erreur && retour.nom !== nom) {
      const rendu = await gesteExplorateurNas('renommer', { chemin: retour.chemin, nom: nomSansExtensionNas(nom).base }, dossierId);
      if (!rendu.erreur) retour = rendu;
    }
    if (retour.erreur) afficherToast(retour.erreur, 'OK', null); else apresGesteExplorateurNas();
  });
  return '';
}

function deplacerFichierExplorateurNas(chemin) {
  const nom = String(chemin).split('/').pop();
  const dossierActuel = String(chemin).includes('/') ? String(chemin).slice(0, String(chemin).lastIndexOf('/')) : '';
  const options = [{ valeur: '', libelle: 'Racine du dossier du client' }].concat(explorateurNas.arbre.map(c => ({ valeur: c, libelle: c.replace(/\//g, ' › ') })))
    .filter(o => o.valeur !== dossierActuel);
  if (!options.length) { afficherToast('Aucun autre dossier où déplacer ce fichier.', 'OK', null); return; }
  ouvrirFenetreSaisie({
    titre: 'Déplacer la pièce',
    champs: [{ id: 'vers', label: `Déplacer « ${nom} » vers`, valeur: options[0].valeur, options }],
    bouton: 'Déplacer',
    onValider: (v) => deplacerVersExplorateurNas(chemin, v.vers)
  });
}

async function copierEmplacementExplorateurNas() {
  const d = dossierExplorateurNas();
  if (!d) return;
  try {
    if (!racineNasPoste) {
      const r = await fetchAvecAuth('/api/nas/etat');
      const j = r.ok ? await r.json() : {};
      racineNasPoste = j && j.configure && j.racine ? String(j.racine) : '';
    }
  } catch (e) { /* message ci-dessous */ }
  const chemin = cheminReseauDossierNas(racineNasPoste, d.nasDossier);
  if (!chemin) { afficherToast('Emplacement du NAS inconnu : le serveur ne le donne pas.', 'OK', null); return; }
  afficherToast(copierTexteSilencieux(chemin) ? 'Emplacement copié : à coller dans l’Explorateur Windows (Win + E, puis Ctrl + L).' : chemin, 'OK', null);
}
