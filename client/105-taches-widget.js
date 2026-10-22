// Tâches du jour : tuiles de chiffres, liste compacte par thème, menu « ⋯ » (renommer, retirer) — étude 22/10.
//
// « Inspire-toi de ça pour le haut du widget, et quand on veut en voir plus ça envoie vers la vue Suivi des dossiers » ; « la version compacte
// en liste avec les fins titres de thème pour un widget de 2 colonnes » (elle REMPLACE la liste d'avant) ; « le regroupement de tâches
// identiques en une carte » ; « le nom du dossier avec les initiales du responsable, et la possibilité de supprimer ou renommer la tâche
// (caché dans trois petits points) ». Une tâche est CALCULÉE depuis les dossiers : « retirer » l'écarte de la liste de ce collaborateur
// (annulable), « renommer » change son titre affiché ; rien n'est écrit sur le dossier. Gardé dans le navigateur du poste, comme l'état de la journée.

var PREFIXE_REGLAGES_TACHES = 'claire-taches-reglees:';
var JOURS_GARDE_TACHE_ECARTEE = 60;
var LIGNES_MAX_LISTE_COMPACTE = 8;

/** Pure : les réglages lus d'un texte JSON (renommées, écartées), jamais d'erreur. @param {string|null} brut */
function reglagesTachesDepuisTexte(brut) {
  const vide = { renommees: {}, ecartees: {} };
  try {
    const o = JSON.parse(brut || 'null');
    if (!o || typeof o !== 'object') return vide;
    const renommees = {};
    for (const [k, v] of Object.entries(o.renommees || {})) if (typeof v === 'string' && v.trim()) renommees[k] = v.trim().slice(0, 200);
    const ecartees = {};
    for (const [k, v] of Object.entries(o.ecartees || {})) if (typeof v === 'string') ecartees[k] = v;
    return { renommees, ecartees };
  } catch (e) { return vide; }
}

function lireReglagesTaches() {
  if (!utilisateurPoste) return { renommees: {}, ecartees: {} };
  let brut = null;
  try { brut = localStorage.getItem(PREFIXE_REGLAGES_TACHES + utilisateurPoste); } catch (e) { /* pas bloquant */ }
  const r = reglagesTachesDepuisTexte(brut);
  // Une tâche écartée depuis plus de 60 jours est oubliée : si elle est toujours due, elle revient.
  const limite = addDays(isoAujourdhuiLocal(), -JOURS_GARDE_TACHE_ECARTEE);
  for (const k of Object.keys(r.ecartees)) if (r.ecartees[k] < limite) delete r.ecartees[k];
  return r;
}

function ecrireReglagesTaches(r) {
  if (utilisateurPoste) ecrireLocal(PREFIXE_REGLAGES_TACHES + utilisateurPoste, JSON.stringify(r));
}

/** Pure : les tâches sans celles écartées, les autres au titre renommé (copie, l'original est gardé dans `titreOrigine`). @param {any[]} actions @param {{renommees:any, ecartees:any}} reglages */
function appliquerReglagesTaches(actions, reglages) {
  return (actions || []).filter((a) => !reglages.ecartees[a.cle])
    .map((a) => (reglages.renommees[a.cle] ? Object.assign({}, a, { titre: reglages.renommees[a.cle], titreOrigine: a.titre }) : a));
}

function retirerTacheJour(cle) {
  const r = lireReglagesTaches();
  r.ecartees[cle] = isoAujourdhuiLocal();
  ecrireReglagesTaches(r);
  render();
  afficherToast('Tâche retirée de votre liste.', 'Annuler', () => {
    const x = lireReglagesTaches();
    delete x.ecartees[cle];
    ecrireReglagesTaches(x);
    render();
  });
}

function renommerTacheJour(cle) {
  const a = trouverActionJour(cle);
  const r = lireReglagesTaches();
  const actuel = r.renommees[cle] || (a ? a.titre : '');
  const saisi = typeof prompt === 'function' ? prompt('Nouveau nom de la tâche', actuel) : null;
  if (saisi == null) return;
  const nom = saisi.trim().slice(0, 200);
  if (!nom || (a && nom === a.titre)) delete r.renommees[cle]; else r.renommees[cle] = nom;
  ecrireReglagesTaches(r);
  render();
}

/** Le menu « ⋯ » d'une tâche : Renommer, Retirer de la liste. @param {string} cle */
function renderMenuTache(cle) {
  const c = escapeOnclickArg(cle);
  return `<details class="tache-menu"><summary class="tache-menu-bouton" aria-label="Autres actions" title="Autres actions">${icone('ellipsis')}</summary>
    <div class="tache-menu-liste"><button type="button" onclick="renommerTacheJour('${c}')">Renommer</button><button type="button" class="danger" onclick="retirerTacheJour('${c}')">Retirer de la liste</button></div></details>`;
}

if (typeof document !== 'undefined' && document.addEventListener) {
  // Un menu « ⋯ » se referme au clic ailleurs.
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.tache-menu[open]').forEach((m) => { if (!m.contains(e.target)) m.removeAttribute('open'); });
  });
}

/** Aller voir toutes les tâches : la vue « Tâches » du Suivi des dossiers. */
function ouvrirTachesSuivi() {
  definirOnglet('suivi');
  definirVueSuivi('taches');
}

/** Pure : les quatre chiffres du haut du widget. @param {any[]} actions @param {any[]} reportees @param {any[]} aVenir @param {any[]} traites */
function chiffresTachesJour(actions, reportees, aVenir, traites) {
  return {
    aFaire: (actions || []).length,
    enRetard: (actions || []).filter((a) => a.jours != null && a.jours < 0).length,
    plusTard: (reportees || []).length + (aVenir || []).length,
    faites: (traites || []).filter((t) => t.etat !== 'Reporté à demain').length
  };
}

/** Les quatre tuiles du haut (chiffre en grand, libellé, flèche) ; un clic mène à la vue « Tâches » du Suivi. */
function renderTuilesTaches(c) {
  const tuile = (cle, libelle, n) => `<button type="button" class="tt-tuile tt-${cle}" onclick="ouvrirTachesSuivi()" aria-label="${escapeAttr(libelle + ' : ' + n + '. Voir dans le Suivi des dossiers')}">
      <span class="tt-lib">${escapeHtml(libelle)}${icone('chevron-right')}</span><span class="tt-nb">${n}</span></button>`;
  return `<div class="tt-tuiles w-fixe">${tuile('afaire', 'À faire', c.aFaire)}${tuile('retard', 'En retard', c.enRetard)}${tuile('plustard', 'À venir', c.plusTard)}${tuile('faites', 'Faites', c.faites)}</div>`;
}

function delaiTacheCompact(a) {
  if (a.jours == null) return a.delaiTexte ? `<span class="tf-delai">${escapeHtml(a.delaiTexte)}</span>` : '';
  return `<span class="tf-delai ${a.jours < 0 ? 'retard' : classeDelaiCarteFiche({ jours: a.jours, fait: false })}">${escapeHtml(libelleDelaiJour(a.jours))}</span>`;
}

function boutonsTacheCompact(a) {
  const cle = escapeOnclickArg(a.cle);
  const outil = outilSupplementaireTache(a);
  const sansGeste = !a.geste || a.geste.type === 'fiche';
  const geste = sansGeste ? '' : `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" onclick="executerActionJour('${cle}')" title="${escapeAttr(libelleCourtGeste(a) + ' — ' + a.titre)}" aria-label="${escapeAttr(libelleCourtGeste(a))}">${iconeGeste(a)}</wa-button>`;
  const boutonOutil = outil ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" onclick="${outil.onclick}" title="${escapeAttr('Ouvrir l’outil « ' + outil.libelle + ' » prérempli')}" aria-label="${escapeAttr('Outil ' + outil.libelle)}">${icone(outil.icone)}</wa-button>` : '';
  return `${geste}${boutonOutil}${renderMenuTache(a.cle)}`;
}

/** Une tâche : une ligne (case ronde, titre, dossier + initiales du responsable, délai, gestes, menu). @param {any} a */
function renderLigneTacheCompacte(a) {
  const cle = escapeOnclickArg(a.cle);
  return `<li class="tc-ligne${a.gravite === 'critique' ? ' critique' : ''}"><button type="button" class="tf-rond" onclick="marquerFaitJour('${cle}')" aria-label="${escapeAttr('Déjà fait : ' + a.titre)}" title="Déjà fait — valider à la main">${icone('check')}</button>
    <span class="tc-texte"><span class="tc-titre">${escapeHtml(a.titre)}</span><span class="tc-dossier">${lienDossierTache(a.dossier)}${pastilleCollaborateur(a.dossier.responsable)}</span></span>
    <span class="tc-delai">${delaiTacheCompact(a)}</span><span class="tc-actions">${boutonsTacheCompact(a)}</span></li>`;
}

/** Plusieurs tâches du même type : un titre, une ligne par dossier. @param {any[]} liste */
function renderGroupeTacheCompact(liste) {
  const a0 = liste[0];
  const lignes = liste.map((a) => {
    const cle = escapeOnclickArg(a.cle);
    return `<li class="tc-ligne tc-sous"><button type="button" class="tf-rond" onclick="marquerFaitJour('${cle}')" aria-label="${escapeAttr('Déjà fait : ' + a.titre + ' — ' + libelleDossierAffiche(a.dossier))}" title="Déjà fait — valider à la main">${icone('check')}</button>
      <span class="tc-texte"><span class="tc-dossier tc-dossier-seul">${lienDossierTache(a.dossier)}${pastilleCollaborateur(a.dossier.responsable)}</span></span>
      <span class="tc-delai">${delaiTacheCompact(a)}</span><span class="tc-actions">${boutonsTacheCompact(a)}</span></li>`;
  }).join('');
  return `<li class="tc-groupe"><div class="tc-groupe-tete"><span class="tc-titre">${escapeHtml(a0.titre)}</span><span class="tf-sous">· ${liste.length} dossiers</span></div><ul class="tc-liste">${lignes}</ul></li>`;
}

/** Pure : le nombre de lignes que montre la liste compacte pour ces tâches (un groupe compte pour toutes ses lignes). @param {any[]} actions */
function lignesListeCompacte(actions) {
  return regrouperTachesParTheme(actions).reduce((n, g) => n + elementsColonneTaches(g.actions).reduce((m, e) => m + (e.groupe ? e.groupe.length : 1), 0), 0);
}

/** La liste compacte du widget de 2 colonnes : un fin titre par thème, une ligne par tâche, les identiques regroupées ; au-delà de
 *  LIGNES_MAX_LISTE_COMPACTE lignes, « Voir toutes les tâches » mène au Suivi. @param {any[]} actions */
function renderTachesCompactes(actions) {
  let reste = LIGNES_MAX_LISTE_COMPACTE;
  const blocs = [];
  for (const g of regrouperTachesParTheme(actions)) {
    if (!g.actions.length || reste <= 0) continue;
    const lignes = [];
    for (const e of elementsColonneTaches(g.actions)) {
      const poids = e.groupe ? e.groupe.length : 1;
      if (reste <= 0) break;
      lignes.push(e.groupe ? renderGroupeTacheCompact(e.groupe) : renderLigneTacheCompacte(e.action));
      reste -= poids;
    }
    blocs.push(`<section class="tc-theme"><h3 class="tc-theme-titre">${escapeHtml(g.theme.nom)}<span class="tc-theme-nb">${g.actions.length}</span></h3><ul class="tc-liste">${lignes.join('')}</ul></section>`);
  }
  const total = lignesListeCompacte(actions);
  const suite = total > LIGNES_MAX_LISTE_COMPACTE
    ? `<button type="button" class="lien-discret w-fixe tc-voir-tout" onclick="ouvrirTachesSuivi()">Voir toutes les tâches (${total}) dans le Suivi</button>` : '';
  return `<div class="tc-liste-theme">${blocs.join('')}${suite}</div>`;
}
