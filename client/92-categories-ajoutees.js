// ==== Catégories ajoutées par l'étude (étude 20/10) ====
// « Il faut la possibilité de créer de nouvelles catégories de pièce. Idem pour le répertoire. »
// — Claire Scan : « + Nouvelle catégorie… » dans la liste « Pièce » d'un scan (nom, sous-dossier du dossier client où ranger, mots
//   qui la font reconnaître en tête de la première page) ; partagée par toute l'étude (clé `scans-categories`), gérée aussi dans
//   Réglages › Pièces et Claire Scan ;
// — Répertoire : « + Nouveau thème » dans la colonne de gauche (clé `repertoire-themes`), renommable, supprimable une fois vide.

// Petite fenêtre de saisie : champs [{ id, label, valeur, aide, multiligne }], « Enregistrer » appelle `onValider(valeurs)`, qui rend
// un message d'erreur (la fenêtre reste ouverte) ou rien (elle se ferme).
function ouvrirFenetreSaisie(options) {
  let fond = document.getElementById('fenetre-saisie-overlay');
  if (!fond) {
    fond = document.createElement('div');
    fond.id = 'fenetre-saisie-overlay';
    fond.className = 'confirm-overlay fenetre-saisie-overlay';
    fond.addEventListener('mousedown', (e) => { fond.dataset.appui = e.target === fond ? '1' : ''; });
    fond.addEventListener('click', (e) => { if (e.target === fond && fond.dataset.appui === '1') fermerFenetreSaisie(); });
    document.body.appendChild(fond);
  }
  const champs = (options.champs || []).map(c => `<label class="fenetre-saisie-champ" for="fs-${escapeAttr(c.id)}"><span>${escapeHtml(c.label)}${c.aide ? ' ' + infoBulle(c.aide) : ''}</span>${
    c.options
      ? `<select id="fs-${escapeAttr(c.id)}">${c.options.map(o => `<option value="${escapeAttr(o.valeur)}"${o.valeur === c.valeur ? ' selected' : ''}>${escapeHtml(o.libelle)}</option>`).join('')}</select>`
      : c.multiligne
      ? `<textarea id="fs-${escapeAttr(c.id)}" rows="3" placeholder="${escapeAttr(c.exemple || '')}">${escapeHtml(c.valeur || '')}</textarea>`
      : `<input type="text" id="fs-${escapeAttr(c.id)}" value="${escapeAttr(c.valeur || '')}" placeholder="${escapeAttr(c.exemple || '')}" autocomplete="off">`}</label>`).join('');
  fond.innerHTML = `<form class="confirm-box fenetre-saisie" role="dialog" aria-modal="true" aria-labelledby="fs-titre">
      <h2 id="fs-titre" class="fenetre-saisie-titre">${escapeHtml(options.titre || '')}</h2>
      ${champs}
      <p class="fenetre-saisie-erreur hint" id="fs-erreur" role="alert" style="display:none"></p>
      <div class="confirm-actions">
        <wa-button appearance="outlined" type="button" onclick="fermerFenetreSaisie()">Annuler</wa-button>
        <wa-button variant="brand" type="submit">${escapeHtml(options.bouton || 'Enregistrer')}</wa-button>
      </div>
    </form>`;
  const form = fond.querySelector('form');
  fenetreSaisieEnCours = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (fenetreSaisieEnCours) return;
    fenetreSaisieEnCours = true;
    const valeurs = {};
    (options.champs || []).forEach(c => { valeurs[c.id] = (document.getElementById('fs-' + c.id) || {}).value || ''; });
    let erreur = '';
    try { erreur = await options.onValider(valeurs); } catch (err) { erreur = err && err.message ? err.message : 'Enregistrement impossible.'; }
    fenetreSaisieEnCours = false;
    if (erreur) {
      const zone = document.getElementById('fs-erreur');
      if (zone) { zone.textContent = erreur; zone.style.display = ''; }
      return;
    }
    fermerFenetreSaisie();
  });
  fond.style.display = 'flex';
  const premier = fond.querySelector('input, textarea');
  if (premier) setTimeout(() => premier.focus(), 0);
}
var fenetreSaisieEnCours = false;

function fermerFenetreSaisie() {
  const fond = document.getElementById('fenetre-saisie-overlay');
  if (fond) { fond.style.display = 'none'; fond.innerHTML = ''; }
}
document.addEventListener('keydown', (e) => {
  const fond = document.getElementById('fenetre-saisie-overlay');
  if (e.key === 'Escape' && fond && fond.style.display === 'flex') { e.stopPropagation(); fermerFenetreSaisie(); }
}, true);

// ---- Claire Scan : catégories de pièce ----

// Pure : les mots tapés (séparés par virgule, point-virgule ou retour à la ligne) → liste propre.
function motsCategorieScanDepuisSaisie(saisie) {
  return String(saisie || '').split(/[,;\n]+/).map(m => m.replace(/\s+/g, ' ').trim()).filter(m => m.length >= 3).slice(0, 12);
}

// Pure : le type de Claire Scan d'une catégorie ajoutée. Les mots (normalisés comme le texte du scan) deviennent le motif de
// reconnaissance ; sans mots, la catégorie se choisit à la main seulement.
function typeScanDepuisCategorie(c) {
  const mots = (c.mots || []).map(m => texteNormaliseScan(m).trim()).filter(m => m.length >= 3);
  const echappe = (m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    cle: 'perso-' + c.id, label: c.label, perso: true, idCategorie: c.id,
    motif: mots.length ? new RegExp(mots.map(echappe).join('|')) : /(?!)/,
    rubriques: c.rubrique ? ['perso:' + c.rubrique] : []
  };
}

// Remet dans TYPES_SCAN les catégories de l'étude (les anciennes retirées d'abord) ; un scan dont le type n'existe plus perd son choix.
function appliquerCategoriesScan() {
  for (let i = TYPES_SCAN.length - 1; i >= 0; i--) if (TYPES_SCAN[i].perso) TYPES_SCAN.splice(i, 1);
  (etatScans.categories || []).forEach(c => TYPES_SCAN.push(typeScanDepuisCategorie(c)));
  // Les scans qui avaient choisi une catégorie supprimée ou modifiée : choix remis à « Autre pièce », ou rubrique mise à jour.
  Object.keys(lecturesScans).forEach(k => {
    const choix = lecturesScans[k] && lecturesScans[k].choix;
    if (!choix || typeof choix.type !== 'string' || !choix.type.startsWith('perso-')) return;
    const type = TYPES_SCAN.find(t => t.cle === choix.type);
    choix.rubriques = type ? type.rubriques.slice() : [];
    if (!type) choix.type = '';
  });
}

async function enregistrerCategorieScan(valeurs, id) {
  const r = await fetchAvecAuth('/api/scans/categories', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id || undefined, label: valeurs.label, rubrique: valeurs.rubrique, mots: motsCategorieScanDepuisSaisie(valeurs.mots) })
  });
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) return corps.erreur || 'Enregistrement impossible.';
  etatScans.categories = corps.categories || [];
  appliquerCategoriesScan();
  return { id: corps.id };
}

// « + Nouvelle catégorie… » (ou le crayon des Réglages) : la fenêtre ; pour un scan, la catégorie créée est aussitôt choisie.
function ouvrirCategorieScan(nomScan, idExistant) {
  const c = idExistant ? (etatScans.categories || []).find(x => x.id === idExistant) : null;
  ouvrirFenetreSaisie({
    titre: c ? 'Modifier la catégorie de pièce' : 'Nouvelle catégorie de pièce',
    champs: [
      { id: 'label', label: 'Nom de la pièce', valeur: c ? c.label : '', exemple: 'Contrat de maintenance' },
      { id: 'rubrique', label: 'Où la ranger dans le dossier client', valeur: c ? c.rubrique : '', exemple: 'AAE', aide: 'Nom du sous-dossier du dossier client sur le NAS (le numéro devant est ignoré, « 9 - AAE » = « AAE »). Laissé vide, la pièce est rangée à la racine du dossier. CLAIRE ne crée jamais de sous-dossier ici : s’il n’existe pas, la racine est utilisée.' },
      { id: 'mots', label: 'Mots qui la reconnaissent (facultatif)', valeur: c ? (c.mots || []).join(', ') : '', multiligne: true, exemple: 'contrat de maintenance, contrat d’entretien', aide: 'Si l’un de ces mots figure sur la première page d’un scan, CLAIRE propose cette catégorie. Séparer par des virgules ; trois lettres au moins. Sans mots, la catégorie se choisit à la main.' }
    ],
    onValider: async (valeurs) => {
      const r = await enregistrerCategorieScan(valeurs, c && c.id);
      if (typeof r === 'string') return r;
      if (nomScan && r.id) changerChoixScan(nomScan, 'type', 'perso-' + r.id);
      else renderScans(true);
      renderReglagesScans();
      return '';
    }
  });
}

// La liste « Pièce » d'un scan : « + Nouvelle catégorie… » ouvre la fenêtre sans changer le choix.
function choisirTypeScan(nom, select) {
  if (select.value === '__nouvelle__') {
    const scan = scanParNom(nom);
    const l = scan && lecturesScans[cleScan(scan)];
    select.value = (l && l.choix && l.choix.type) || '';
    ouvrirCategorieScan(nom);
    return;
  }
  changerChoixScan(nom, 'type', select.value);
}

function supprimerCategorieScan(id) {
  const c = (etatScans.categories || []).find(x => x.id === id);
  if (!c) return;
  demanderConfirmation(`Supprimer la catégorie « ${c.label} » ? Les pièces déjà rangées ne bougent pas.`, async () => {
    const r = await fetchAvecAuth('/api/scans/categories/' + encodeURIComponent(id), { method: 'DELETE' });
    if (!r.ok) { afficherToast('Suppression impossible.', 'OK', null); return; }
    etatScans.categories = (await r.json()).categories || [];
    appliquerCategoriesScan();
    renderReglagesScans();
    if (ongletActuel === 'scans') renderScans(true);
  }, { bouton: 'Supprimer', ton: 'danger' });
}

// Bloc des Réglages › Pièces et Claire Scan.
function htmlCategoriesScan() {
  const liste = etatScans.categories || [];
  return `<div class="reglages-section-sous">
      <div class="reglages-option-titre">Catégories de pièce ajoutées ${infoBulle('Elles s’ajoutent à celles de CLAIRE dans la liste « Pièce » de Claire Scan et servent à toute l’étude.')}</div>
      ${liste.length ? `<ul class="categories-ajoutees">${liste.map(c => `<li><span class="categories-nom">${escapeHtml(c.label)}</span><span class="hint">${c.rubrique ? escapeHtml(c.rubrique) : 'racine du dossier'}${(c.mots || []).length ? ' · ' + escapeHtml(c.mots.join(', ')) : ' · à choisir à la main'}</span>
          <wa-button appearance="plain" size="s" class="bouton-icone" onclick="ouvrirCategorieScan('', '${escapeOnclickArg(c.id)}')" aria-label="Modifier ${escapeAttr(c.label)}">${icone('pencil')}</wa-button>
          <wa-button appearance="plain" size="s" class="bouton-icone" onclick="supprimerCategorieScan('${escapeOnclickArg(c.id)}')" aria-label="Supprimer ${escapeAttr(c.label)}">${icone('x')}</wa-button></li>`).join('')}</ul>` : '<p class="hint">Aucune catégorie ajoutée.</p>'}
      <wa-button appearance="outlined" class="bouton-ajout" onclick="ouvrirCategorieScan('')"><span slot="start" class="bouton-ajout-plus">+</span>Ajouter une catégorie de pièce</wa-button>
    </div>`;
}

// ---- Répertoire : thèmes ajoutés ----

function themeRepertoirePerso(cle) { return repertoireThemes.find(t => t.cle === cle && t.perso) || null; }

async function appelThemeRepertoire(methode, cle, libelle) {
  const r = await fetchAvecAuth('/api/repertoire/themes' + (cle ? '/' + encodeURIComponent(cle) : ''), {
    method: methode, headers: { 'Content-Type': 'application/json' }, body: methode === 'DELETE' ? undefined : JSON.stringify({ libelle })
  });
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) return { erreur: corps.erreur || 'Enregistrement impossible.' };
  if (Array.isArray(corps.themes) && corps.themes.length) repertoireThemes = corps.themes;
  return corps;
}

function ouvrirThemeRepertoire(cle) {
  const t = cle ? themeRepertoirePerso(cle) : null;
  ouvrirFenetreSaisie({
    titre: t ? 'Renommer le thème' : 'Nouveau thème du répertoire',
    champs: [{ id: 'libelle', label: 'Nom du thème', valeur: t ? t.libelle : '', exemple: 'Experts-comptables' }],
    onValider: async (v) => {
      const r = await appelThemeRepertoire(t ? 'PUT' : 'POST', t ? t.cle : '', v.libelle);
      if (r.erreur) return r.erreur;
      if (!t && r.cle) repertoireTheme = r.cle;
      if (ongletActuel === 'confreres') renderCarnetConfreres();
      return '';
    }
  });
}

function supprimerThemeRepertoire(cle) {
  const t = themeRepertoirePerso(cle);
  if (!t) return;
  demanderConfirmation(`Supprimer le thème « ${t.libelle} » ?`, async () => {
    const r = await appelThemeRepertoire('DELETE', cle);
    if (r.erreur) { afficherToast(r.erreur, 'OK', null); return; }
    if (repertoireTheme === cle) repertoireTheme = 'annuaire';
    if (ongletActuel === 'confreres') renderCarnetConfreres();
  }, { bouton: 'Supprimer', ton: 'danger' });
}
