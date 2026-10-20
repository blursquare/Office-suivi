// ==== Explorateur du dossier client sur le NAS (étude 20/10) ====
// « Quand on clique sur Ouvrir le NAS, un pop-up avec l'explorateur ; pouvoir renommer des pièces et les déplacer d'un sous-dossier
// à un autre. » Le serveur ne sert que le dossier relié à la fiche (server/src/explorateurNas.js) : lecture de tout le dossier,
// renommer un fichier (extension gardée) et le déplacer vers un autre sous-dossier existant ; jamais de suppression ni d'écrasement.
// Chaque geste se défait d'un clic (« Annuler » : le geste inverse).

var explorateurNas = { dossierId: '', sous: '', niveau: null, arbre: [], erreur: '', chargement: false };

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
  explorateurNas = { dossierId, sous: '', niveau: null, arbre: [], erreur: '', chargement: true };
  fond.style.display = 'flex';
  renderExplorateurNas();
  chargerExplorateurNas('');
}

function fermerExplorateurNas() {
  const fond = document.getElementById('explorateur-nas-overlay');
  if (fond) { fond.style.display = 'none'; fond.innerHTML = ''; }
  explorateurNas = { dossierId: '', sous: '', niveau: null, arbre: [], erreur: '', chargement: false };
}
document.addEventListener('keydown', (e) => {
  const fond = document.getElementById('explorateur-nas-overlay');
  const saisie = document.getElementById('fenetre-saisie-overlay');
  if (saisie && saisie.style.display === 'flex') return;   // la petite fenêtre posée par-dessus se ferme d'abord (client/92)
  if (e.key === 'Escape' && fond && fond.style.display === 'flex') { e.stopPropagation(); fermerExplorateurNas(); }
}, true);

var sequenceExplorateurNas = 0;
async function chargerExplorateurNas(sous) {
  const id = explorateurNas.dossierId;
  if (!id) return;
  const numero = ++sequenceExplorateurNas;
  explorateurNas.chargement = true;
  explorateurNas.erreur = '';
  renderExplorateurNas();
  try {
    const r = await fetchAvecAuth(`/api/nas/explorer?dossierId=${encodeURIComponent(id)}&sous=${encodeURIComponent(sous || '')}`);
    const corps = await r.json().catch(() => ({}));
    if (explorateurNas.dossierId !== id || numero !== sequenceExplorateurNas) return;
    if (!r.ok) throw new Error(corps.erreur || 'Le NAS n’a pas répondu.');
    explorateurNas.niveau = corps;
    explorateurNas.arbre = corps.arbre || [];
    explorateurNas.sous = corps.chemin || '';
  } catch (e) {
    if (explorateurNas.dossierId !== id || numero !== sequenceExplorateurNas) return;
    explorateurNas.erreur = e.message || 'Le NAS n’a pas répondu.';
  }
  explorateurNas.chargement = false;
  renderExplorateurNas();
}

function allerExplorateurNas(sous) { chargerExplorateurNas(sous); }

// Pure : les morceaux du chemin affiché [{ libelle, chemin }], la racine du dossier du client en tête.
function filExplorateurNas(sous, libelleRacine) {
  const morceaux = String(sous || '').split('/').filter(Boolean);
  return [{ libelle: libelleRacine || 'Dossier du client', chemin: '' }].concat(morceaux.map((m, i) => ({ libelle: m, chemin: morceaux.slice(0, i + 1).join('/') })));
}

// Pure : le nom sans son extension (ce qu'on retouche) et l'extension.
function nomSansExtensionNas(nom) {
  const m = /^(.*?)(\.[A-Za-z0-9]{1,8})$/.exec(String(nom || ''));
  return m && m[1] ? { base: m[1], ext: m[2] } : { base: String(nom || ''), ext: '' };
}

function cheminFichierExplorateurNas(nom) { return explorateurNas.sous ? explorateurNas.sous + '/' + nom : nom; }

function renderExplorateurNas() {
  const fond = document.getElementById('explorateur-nas-overlay');
  const d = dossierExplorateurNas();
  if (!fond || !d) return;
  const e = explorateurNas;
  const fil = filExplorateurNas(e.sous, 'Dossier du client').map((m, i, tous) => i === tous.length - 1
    ? `<span class="exp-fil-courant">${escapeHtml(m.libelle)}</span>`
    : `<button type="button" class="lien-action" onclick="allerExplorateurNas('${escapeOnclickArg(m.chemin)}')">${escapeHtml(m.libelle)}</button><span class="exp-fil-sep">›</span>`).join('');
  const n = e.niveau;
  let corps;
  if (e.erreur) corps = `<p class="hint exp-etat">${icone('alert-triangle')} ${escapeHtml(e.erreur)}</p>`;
  else if (!n) corps = `<p class="hint exp-etat">${icone('spinner', null, true)} Lecture du NAS…</p>`;
  else {
    const lignesDossiers = n.dossiers.map(f => `<li class="exp-ligne exp-dossier"><button type="button" class="exp-nom" onclick="allerExplorateurNas('${escapeOnclickArg(e.sous ? e.sous + '/' + f.nom : f.nom)}')">${icone('folder')}<span>${escapeHtml(f.nom)}</span></button></li>`);
    const lignesFichiers = n.fichiers.map(f => {
      const chemin = cheminFichierExplorateurNas(f.nom);
      const quand = f.modifieLe ? new Date(f.modifieLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return `<li class="exp-ligne">
        <button type="button" class="exp-nom" onclick="ouvrirFichierExplorateurNas('${escapeOnclickArg(chemin)}')" title="Ouvrir">${icone('file-text')}<span>${escapeHtml(f.nom)}</span></button>
        <span class="exp-info">${f.taille != null ? escapeHtml(tailleLisible(f.taille)) : ''}</span><span class="exp-info">${escapeHtml(quand)}</span>
        <span class="exp-actions">
          <wa-button appearance="plain" size="s" class="bouton-icone" onclick="renommerFichierExplorateurNas('${escapeOnclickArg(chemin)}')" aria-label="Renommer ${escapeAttr(f.nom)}" title="Renommer">${icone('pencil')}</wa-button>
          <wa-button appearance="plain" size="s" class="bouton-discret" onclick="deplacerFichierExplorateurNas('${escapeOnclickArg(chemin)}')" aria-label="Déplacer ${escapeAttr(f.nom)}" title="Déplacer vers un autre dossier">${icone('folder')} Déplacer</wa-button>
        </span></li>`;
    });
    const tout = lignesDossiers.concat(lignesFichiers);
    corps = tout.length ? `<ul class="exp-liste">${tout.join('')}</ul>` : '<p class="hint exp-etat">Ce dossier est vide.</p>';
  }
  const defile = fond.querySelector('.exp-corps');
  const haut = defile ? defile.scrollTop : 0;
  fond.innerHTML = `<div class="confirm-box explorateur-nas" role="dialog" aria-modal="true" aria-labelledby="exp-titre">
      <header class="exp-tete">
        <div class="exp-titres"><h2 id="exp-titre">Dossier du NAS ${e.chargement && n ? icone('spinner', null, true) : ''}</h2><span class="hint">${escapeHtml(libelleDossierAffiche(d))}</span></div>
        <wa-button appearance="outlined" size="s" class="bouton-discret" onclick="copierEmplacementExplorateurNas()" title="Copier l’emplacement réseau, à coller dans l’Explorateur Windows">${icone('copier')} Copier l’emplacement</wa-button>
        <wa-button appearance="plain" size="s" class="bouton-icone icon-btn" onclick="fermerExplorateurNas()" aria-label="Fermer">${icone('x')}</wa-button>
      </header>
      <nav class="exp-fil" aria-label="Chemin">${fil}</nav>
      <div class="exp-corps">${corps}</div>
    </div>`;
  const nouveau = fond.querySelector('.exp-corps');
  if (nouveau && haut && explorateurNas.niveau && explorateurNas.niveau.chemin === explorateurNas.sous) nouveau.scrollTop = haut;
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
function apresGesteExplorateurNas() { chargerExplorateurNas(explorateurNas.sous); }

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
    onValider: async (v) => {
      const dossierId = explorateurNas.dossierId;
      const r = await gesteExplorateurNas('deplacer', { chemin, vers: v.vers }, dossierId);
      if (r.erreur) return r.erreur;
      noterVerificationPoste('explorateur-nas', { detail: 'pièce déplacée' });
      apresGesteExplorateurNas();
      afficherToast(`Déplacé dans « ${v.vers ? v.vers.replace(/\//g, ' › ') : 'la racine'} »${r.nom !== nom ? ` sous le nom « ${r.nom} »` : ''}.`, 'Annuler', async () => {
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
