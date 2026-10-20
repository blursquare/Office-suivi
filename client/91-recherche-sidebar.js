// ==== Recherche de la barre latérale (étude 20/10) ====
// « J'ai tendance à vouloir taper une recherche dans le champ de demande à Claire de la sidebar : un champ de recherche à la place,
// pour rechercher un dossier ou un outil ; Demander à CLAIRE devient un bouton à côté de Claire Scan. » Choix : dossiers + outils,
// liste sous le champ, flèches + Entrée, Ctrl+K.
// Dossiers : nom, parties, adresse du bien, référence d'Authentic, défunt. Outils : les écrans et outils de la barre elle-même, lus
// dans son HTML (un nouvel outil de la barre y est cherchable sans rien ajouter ici), sauf ceux réservés à d'autres collaborateurs.

var MAX_DOSSIERS_RECHERCHE_SIDEBAR = 8;
var MAX_OUTILS_RECHERCHE_SIDEBAR = 6;
var rechercheSidebar = { lignes: [], actif: 0 };

// Pure : les mots d'une recherche (minuscules, sans accents ni ponctuation).
function motsRechercheSidebar(requete) {
  return normaliserPourRecherche(String(requete || '')).split(/[^a-z0-9]+/).filter(Boolean);
}

// Pure : tout ce qui désigne un dossier, en un texte normalisé.
function texteRechercheDossier(d) {
  const parties = Array.isArray(d.parties) ? d.parties : [];
  const biens = Array.isArray(d.biens) ? d.biens : [];
  const defunt = d.defunt && typeof d.defunt === 'object' ? d.defunt : {};
  const morceaux = [libelleDossierAffiche(d), d.nom, d.referenceAuthentic, d.adresseBien, d.bien && d.bien.adresse, defunt.nom, defunt.prenom]
    .concat(parties.map(p => p && [p.nom, p.prenom, p.nomUsage].join(' ')), biens.map(b => b && b.adresse));
  return normaliserPourRecherche(morceaux.filter(x => typeof x === 'string' && x).join(' '));
}

// Pure : les dossiers dont chaque mot de la recherche se retrouve quelque part, ceux dont le nom porte les mots d'abord, les
// archivés en dernier.
function dossiersRechercheSidebar(requete, liste) {
  const mots = motsRechercheSidebar(requete);
  if (!mots.length) return [];
  return (Array.isArray(liste) ? liste : []).filter(d => d && typeof d === 'object' && !d.deleted).map(d => {
    const tout = texteRechercheDossier(d);
    if (!mots.every(m => tout.includes(m))) return null;
    const nom = normaliserPourRecherche(libelleDossierAffiche(d));
    return { d, score: mots.filter(m => nom.includes(m)).length * 2 - (d.archive ? 5 : 0) };
  }).filter(Boolean)
    .sort((a, b) => b.score - a.score || libelleDossierAffiche(a.d).localeCompare(libelleDossierAffiche(b.d), 'fr'))
    .slice(0, MAX_DOSSIERS_RECHERCHE_SIDEBAR).map(x => x.d);
}

// Les écrans et outils de la barre, [{ id, libelle }] — le bouton de la barre est celui qui s'ouvre (certains outils ont leur geste).
function outilsSidebarDisponibles() {
  const sortie = [];
  document.querySelectorAll('.sidebar [id^="tab-"]').forEach(b => {
    if (b.id === 'tab-outils' || b.style.display === 'none') return;
    const copie = b.cloneNode(true);
    copie.querySelectorAll('.sidebar-badge-notif, .sidebar-scan-pastille').forEach(x => x.remove());
    const libelle = String(b.getAttribute('aria-label') || copie.textContent || '').replace(/\s+/g, ' ').trim();
    if (libelle) sortie.push({ id: b.id, libelle });
  });
  return sortie;
}

// Pure : les outils dont le libellé porte tous les mots de la recherche.
function outilsRechercheSidebar(requete, outils) {
  const mots = motsRechercheSidebar(requete);
  if (!mots.length) return [];
  return (outils || []).filter(o => { const l = normaliserPourRecherche(o.libelle); return mots.every(m => l.includes(m)); })
    .slice(0, MAX_OUTILS_RECHERCHE_SIDEBAR);
}

function listeRechercheSidebar() {
  let el = document.getElementById('sidebar-recherche-liste');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sidebar-recherche-liste';
    el.className = 'sidebar-recherche-liste';
    el.setAttribute('role', 'listbox');
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
}

function fermerRechercheSidebar() {
  const el = document.getElementById('sidebar-recherche-liste');
  if (el) el.style.display = 'none';
  const champ = document.getElementById('sidebar-recherche-saisie');
  if (champ) champ.setAttribute('aria-expanded', 'false');
  rechercheSidebar = { lignes: [], actif: 0 };
}

// Redessine la liste d'après le champ.
function majRechercheSidebar() {
  const champ = document.getElementById('sidebar-recherche-saisie');
  const liste = listeRechercheSidebar();
  const requete = champ ? champ.value : '';
  if (!motsRechercheSidebar(requete).length) { fermerRechercheSidebar(); return; }
  const dossiersTrouves = dossiersRechercheSidebar(requete, dossiers);
  const outils = outilsRechercheSidebar(requete, outilsSidebarDisponibles());
  rechercheSidebar.lignes = dossiersTrouves.map(d => ({ type: 'dossier', id: d.id, d })).concat(outils.map(o => ({ type: 'outil', id: o.id, libelle: o.libelle })));
  rechercheSidebar.actif = Math.min(rechercheSidebar.actif, Math.max(0, rechercheSidebar.lignes.length - 1));
  const ligne = (l, i) => {
    const actif = i === rechercheSidebar.actif ? ' actif' : '';
    const corps = l.type === 'dossier'
      ? `${renderBadgeStatut(l.d)}<span class="sidebar-recherche-nom">${escapeHtml(libelleDossierAffiche(l.d))}</span><span class="sidebar-recherche-resp">${escapeHtml(prenomCollaborateur(l.d.responsable || ''))}</span>`
      : `<span class="sidebar-recherche-nom">${escapeHtml(l.libelle)}</span>`;
    return `<button type="button" role="option" class="sidebar-recherche-ligne${actif}" aria-selected="${actif ? 'true' : 'false'}" onmousedown="event.preventDefault()" onclick="choisirRechercheSidebar(${i})">${corps}</button>`;
  };
  const nbDossiers = dossiersTrouves.length;
  liste.innerHTML = rechercheSidebar.lignes.length
    ? (nbDossiers ? `<div class="sidebar-recherche-titre">Dossiers</div>${rechercheSidebar.lignes.slice(0, nbDossiers).map((l, i) => ligne(l, i)).join('')}` : '')
      + (outils.length ? `<div class="sidebar-recherche-titre">Outils</div>${rechercheSidebar.lignes.slice(nbDossiers).map((l, i) => ligne(l, i + nbDossiers)).join('')}` : '')
    : '<div class="sidebar-recherche-vide">Aucun dossier ni outil ne correspond.</div>';
  const form = document.getElementById('sidebar-recherche');
  const r = form ? form.getBoundingClientRect() : { left: 8, bottom: 80, width: 240 };
  const largeur = Math.max(r.width, 340);
  liste.style.width = largeur + 'px';
  liste.style.left = Math.max(8, Math.min(r.left, window.innerWidth - largeur - 8)) + 'px';
  liste.style.top = (r.bottom + 4) + 'px';
  liste.style.display = 'block';
  if (champ) champ.setAttribute('aria-expanded', 'true');
}

// Ouvre un résultat : un dossier (sa fiche) ou un outil (son bouton dans la barre).
function choisirRechercheSidebar(i) {
  const l = rechercheSidebar.lignes[i];
  if (!l) return;
  const champ = document.getElementById('sidebar-recherche-saisie');
  if (champ) { champ.value = ''; champ.blur(); }
  fermerRechercheSidebar();
  if (l.type === 'dossier') { ouvrirDossierDepuisDashboard(l.id); return; }
  const bouton = document.getElementById(l.id);
  if (bouton) bouton.click();
}

// Entrée dans le champ : le résultat en surbrillance (le premier par défaut).
function ouvrirRechercheSidebar() {
  if (rechercheSidebar.lignes.length) choisirRechercheSidebar(rechercheSidebar.actif);
}

function toucheRechercheSidebar(e) {
  if (e.key === 'Escape') {
    const champ = document.getElementById('sidebar-recherche-saisie');
    if (champ) { champ.value = ''; champ.blur(); }
    fermerRechercheSidebar();
    return;
  }
  if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || !rechercheSidebar.lignes.length) return;
  e.preventDefault();
  const n = rechercheSidebar.lignes.length;
  rechercheSidebar.actif = (rechercheSidebar.actif + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
  majRechercheSidebar();
}

// L'icône du champ et Ctrl+K : le curseur dans le champ (barre repliée, la barre se déplie d'abord).
function focaliserRechercheSidebar() {
  const barre = document.querySelector('.sidebar');
  if (barre && barre.classList.contains('repliee')) toggleSidebarRepliee();
  const champ = document.getElementById('sidebar-recherche-saisie');
  if (champ) setTimeout(() => { champ.focus(); champ.select(); }, 0);
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 'k') {
    e.preventDefault();
    focaliserRechercheSidebar();
  }
});
