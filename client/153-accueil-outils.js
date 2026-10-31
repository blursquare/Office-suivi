// Premier écran « Quel dossier ? » des outils (étude 31/10 : « pour tous les outils, il faut prévoir un premier écran pour sélectionner le
// dossier, comme ça, ça va alléger l'interface par la suite »). Même page que la Constitution de dossier et le Décompte vendeur (qui l'ont
// déjà) : au centre la recherche, puis les derniers dossiers ouverts par le collaborateur ; un clic ouvre l'outil prérempli par la fonction
// habituelle d'ouverture depuis la fiche. « Continuer sans dossier » garde la simulation libre. Un outil ouvert depuis une fiche ou par
// « Demander à CLAIRE » a déjà son dossier : l'écran ne s'affiche pas.
//
// Pour un nouvel outil : une entrée ici (titre, filtre vente / succession, fonction de choix, dossier déjà rattaché) ; l'écran se pose seul
// par-dessus le contenu du panneau `#onglet-<outil>` (règle .outil-en-accueil de style.css). Le Contrôle de l'urbanisme montre la même page
// dans sa propre première étape (client/152).

var ACCUEIL_OUTILS = {
  'appel-fonds': { titre: 'Quel dossier ?', sous: 'Le courrier d’appel de fonds se prépare d’après la fiche.', icone: 'file-text', filtre: 'vente',
    choisir: (id) => preparerAppelFondsDepuisDossier(id), lie: () => typeof afDossierLie !== 'undefined' && !!afDossierLie },
  quotites: { titre: 'Quel dossier ?', sous: 'Acquéreurs et prix repris de la fiche.', icone: 'users', filtre: 'vente',
    choisir: (id) => { definirOnglet('quotites'); choisirDossierQuotites(id); }, lie: () => typeof qtDossierLie !== 'undefined' && !!qtDossierLie },
  calculateur: { titre: 'Pour quel dossier ?', sous: 'Prix, mobilier, nature du bien et département repris de la fiche.', icone: 'scale', filtre: 'vente',
    choisir: (id) => ouvrirProvisionDepuisFiche(id), lie: () => typeof provisionDossierId !== 'undefined' && !!provisionDossierId },
  prorata: { titre: 'Pour quel dossier ?', sous: 'Date de l’acte et avis de taxe foncière du NAS repris du dossier.', icone: 'calendar', filtre: 'vente',
    choisir: (id) => ouvrirProrataDepuisFiche(id), lie: () => typeof prorataDossierTf !== 'undefined' && !!prorataDossierTf },
  inventaire: { titre: 'Quelle succession ?', sous: 'La dernière simulation de la succession est reprise.', icone: 'users', filtre: 'succession',
    choisir: (id) => ouvrirArbitrageDepuisFiche(id), lie: () => typeof arbitrageDossierId !== 'undefined' && !!arbitrageDossierId },
  preemption: { titre: 'Quel dossier contrôler ?', sous: 'Commune, parcelles et nature du bien repris de la fiche ; le zonage est lu aussitôt.', icone: 'map-pin', filtre: 'vente',
    pages: true, choisir: (id) => choisirDossierPreemption(id), sansDossier: () => continuerSansDossierPreemption(), lie: () => !!(prEtat && (prEtat.dossierId || prEtat.sansDossier)) }
};

// Outils pour lesquels l'utilisateur a choisi « Continuer sans dossier » (le temps de la session de la page).
var accueilOutilsSansDossier = new Set();
var accueilOutilsRecherche = {};

// Pure : les dossiers proposés — en cours, du bon genre ; pour une recherche, ceux dont le libellé, le responsable ou la référence la
// contiennent (12 au plus) ; sinon les derniers consultés puis les autres (6).
function dossiersAccueilOutil(liste, filtre, q, consultes) {
  const genre = (d) => (typeof estSuccession === 'function' && estSuccession(d)) ? 'succession' : 'vente';
  const actifs = (liste || []).filter(d => d && !d.deleted && !d.archive && (!filtre || genre(d) === filtre));
  const r = normaliserPourRecherche(String(q || '').trim());
  if (r) return actifs.filter(d => normaliserPourRecherche([libelleDossierAffiche(d), d.responsable, d.referenceAuthentic].filter(Boolean).join(' ')).includes(r)).slice(0, 12);
  const recents = (consultes || []).map(id => actifs.find(d => d.id === id)).filter(Boolean);
  return recents.concat(actifs.filter(d => !recents.includes(d))).slice(0, 6);
}

function idsConsultesAccueilOutil() {
  try { return dossiersConsultesRecents(lireDossiersConsultes(), dossiers || []).map(x => x.dossier && x.dossier.id).filter(Boolean); } catch (e) { return []; }
}

function htmlCartesAccueilOutil(outil) {
  const c = ACCUEIL_OUTILS[outil];
  const q = accueilOutilsRecherche[outil] || '';
  const liste = dossiersAccueilOutil(dossiers, c.filtre, q, idsConsultesAccueilOutil());
  if (!liste.length) return `<div class="dash-recherche-vide">${q ? 'Aucun dossier ne correspond.' : 'Aucun dossier en cours.'}</div>`;
  return `<div class="cst-accueil-liste-titre"><span class="pieces-titre">${icone(q ? 'search' : 'clock')}<span class="pieces-titre-texte">${q ? 'Résultats' : 'Derniers dossiers'}</span></span></div>
    <div class="cst-accueil-grille">${liste.map(d => {
    const succ = typeof estSuccession === 'function' && estSuccession(d);
    return `<button type="button" class="cst-accueil-carte" onclick="choisirDossierAccueilOutil('${escapeOnclickArg(outil)}', '${escapeOnclickArg(d.id)}')">
        <span class="cst-accueil-carte-icone ${succ ? 'succ' : 'vente'}" aria-hidden="true">${icone(succ ? 'users' : 'home')}</span>
        <span class="cst-accueil-carte-texte"><span class="cst-accueil-carte-titre">${escapeHtml(libelleDossierAffiche(d))}</span>
        <span class="cst-accueil-carte-sous">${escapeHtml([succ ? 'Succession' : 'Vente', d.referenceAuthentic, d.responsable].filter(Boolean).join(' · '))}</span></span>
      </button>`;
  }).join('')}</div>`;
}

function htmlAccueilDossierOutil(outil) {
  const c = ACCUEIL_OUTILS[outil];
  if (!c) return '';
  const q = accueilOutilsRecherche[outil] || '';
  return `<div class="cst-accueil outil-accueil-page">
      <span class="cst-accueil-icone" aria-hidden="true">${icone(c.icone || 'file-text')}</span>
      <h2 class="cst-accueil-titre">${escapeHtml(c.titre)}</h2>
      <p class="cst-accueil-sous">${escapeHtml(c.sous)}</p>
      <div class="pr-dossier-recherche-bloc cst-recherche cst-accueil-recherche"><input type="search" id="acc-recherche-${escapeAttr(outil)}" class="nas-choix-recherche" autocomplete="off"
        placeholder="Rechercher un dossier par nom, responsable ou référence…" value="${escapeAttr(q)}" oninput="rechercherAccueilOutil('${escapeOnclickArg(outil)}', this.value)" aria-label="Rechercher un dossier"></div>
      <div id="acc-cartes-${escapeAttr(outil)}" class="outil-accueil-cartes">${htmlCartesAccueilOutil(outil)}</div>
      <wa-button appearance="plain" class="bouton-discret outil-accueil-sans" type="button" onclick="continuerSansDossierAccueilOutil('${escapeOnclickArg(outil)}')">Continuer sans dossier →</wa-button>
    </div>`;
}

function rechercherAccueilOutil(outil, valeur) {
  accueilOutilsRecherche[outil] = String(valeur || '');
  const zone = document.getElementById('acc-cartes-' + outil);
  if (zone) zone.innerHTML = htmlCartesAccueilOutil(outil);
}

function choisirDossierAccueilOutil(outil, id) {
  const c = ACCUEIL_OUTILS[outil];
  if (!c || !(dossiers || []).some(d => d.id === id)) return;
  accueilOutilsRecherche[outil] = '';
  c.choisir(id);
  majAccueilOutil(outil);
}

function continuerSansDossierAccueilOutil(outil) {
  const c = ACCUEIL_OUTILS[outil];
  if (!c) return;
  if (c.sansDossier) c.sansDossier();
  else accueilOutilsSansDossier.add(outil);
  majAccueilOutil(outil);
}

// Revenir au premier écran (bouton « Changer de dossier » d'un outil).
function revenirAccueilOutil(outil) {
  accueilOutilsSansDossier.delete(outil);
  majAccueilOutil(outil, true);
}

// Pose ou retire l'écran d'accueil sur le panneau de l'outil (appelée à chaque affichage d'un écran, client/22). `forcer` : même si un
// dossier est rattaché (l'utilisateur veut en changer).
function majAccueilOutil(outil, forcer) {
  const c = ACCUEIL_OUTILS[outil];
  if (!c || c.pages) return;
  const panneau = document.getElementById('onglet-' + outil);
  if (!panneau) return;
  const montrer = forcer || (!c.lie() && !accueilOutilsSansDossier.has(outil));
  let zone = panneau.querySelector(':scope > .outil-accueil');
  if (!montrer) {
    panneau.classList.remove('outil-en-accueil');
    if (zone) zone.innerHTML = '';
    poserBoutonChangerDossierOutil(outil, panneau);
    return;
  }
  if (!zone) {
    zone = document.createElement('div');
    zone.className = 'outil-accueil';
    const tete = panneau.querySelector(':scope > .dash-header');
    if (tete && tete.nextSibling) panneau.insertBefore(zone, tete.nextSibling); else panneau.appendChild(zone);
  }
  zone.innerHTML = htmlAccueilDossierOutil(outil);
  panneau.classList.add('outil-en-accueil');
}

// « Changer de dossier » dans l'en-tête de l'outil, pour revenir au premier écran.
function poserBoutonChangerDossierOutil(outil, panneau) {
  const tete = panneau.querySelector(':scope > .dash-header');
  if (!tete || tete.querySelector('.outil-changer-dossier')) return;
  let actions = tete.querySelector(':scope > .dash-header-actions');
  if (!actions) { actions = document.createElement('div'); actions.className = 'dash-header-actions'; tete.appendChild(actions); }
  const b = document.createElement('wa-button');
  b.setAttribute('appearance', 'outlined');
  b.className = 'outil-changer-dossier';
  b.setAttribute('type', 'button');
  b.addEventListener('click', () => revenirAccueilOutil(outil));
  b.innerHTML = `${icone('folder')} Changer de dossier`;
  actions.insertBefore(b, actions.firstChild);
}
