// Tâches du jour : tuiles de chiffres, liste compacte par thème, menu « ⋯ » (renommer, retirer) — étude 22/10.
//
// « Inspire-toi de ça pour le haut du widget, et quand on veut en voir plus ça envoie vers la vue Suivi des dossiers » ; « la version compacte
// en liste avec les fins titres de thème pour un widget de 2 colonnes » (elle REMPLACE la liste d'avant) ; « le regroupement de tâches
// identiques en une carte » ; « le nom du dossier avec les initiales du responsable, et la possibilité de supprimer ou renommer la tâche
// (caché dans trois petits points) ». Une tâche est CALCULÉE depuis les dossiers : « retirer » l'écarte de la liste de ce collaborateur
// (annulable), « renommer » change son titre affiché ; rien n'est écrit sur le dossier. Gardé dans le navigateur du poste, comme l'état de la journée.

var PREFIXE_REGLAGES_TACHES = 'claire-taches-reglees:';
var JOURS_GARDE_TACHE_ECARTEE = 30;
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
  // Une tâche écartée depuis plus de 30 jours est oubliée : si elle est toujours due, elle revient.
  const limite = addDays(isoAujourdhuiLocal(), -JOURS_GARDE_TACHE_ECARTEE);
  for (const k of Object.keys(r.ecartees)) if (r.ecartees[k] < limite) delete r.ecartees[k];
  return r;
}

function ecrireReglagesTaches(r) {
  return !!utilisateurPoste && ecrireLocal(PREFIXE_REGLAGES_TACHES + utilisateurPoste, JSON.stringify(r));
}

/** Pure : les tâches sans celles écartées, les autres au titre renommé (copie, l'original est gardé dans `titreOrigine`). @param {any[]} actions @param {{renommees:any, ecartees:any}} reglages */
function appliquerReglagesTaches(actions, reglages) {
  return (actions || []).filter((a) => !reglages.ecartees[a.cle])
    .map((a) => (reglages.renommees[a.cle] ? Object.assign({}, a, { titre: reglages.renommees[a.cle], titreOrigine: a.titre }) : a));
}

function fermerMenusTaches() {
  if (typeof document !== 'undefined') document.querySelectorAll('details.tache-menu[open]').forEach((m) => m.removeAttribute('open'));
}

function retirerTacheJour(cle) {
  const r = lireReglagesTaches();
  r.ecartees[cle] = isoAujourdhuiLocal();
  if (!ecrireReglagesTaches(r)) { afficherToast('Tâche non retirée : le navigateur ne garde pas ce réglage.', 'OK', null); return; }
  render();
  afficherToast('Tâche retirée de votre liste.', 'Annuler', () => { retablirTacheJour(cle); });
}

/** Remet une tâche retirée (ou, sans clé, toutes). @param {string} [cle] */
function retablirTacheJour(cle) {
  const x = lireReglagesTaches();
  if (cle) delete x.ecartees[cle]; else x.ecartees = {};
  ecrireReglagesTaches(x);
  render();
}

/** « N tâches retirées · Rétablir » sous la liste. @param {number} n */
function renderTachesRetirees(n) {
  return n > 0 ? `<p class="tc-retirees w-fixe">${n} tâche${n > 1 ? 's' : ''} retirée${n > 1 ? 's' : ''} de votre liste · <button type="button" class="lien-discret" onclick="retablirTacheJour()">Rétablir</button></p>` : '';
}

function renommerTacheJour(cle) {
  fermerMenusTaches();
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
    <div class="tache-menu-liste"><button type="button" onclick="reporterActionJour('${c}', 1)">Reporter d’un jour</button><button type="button" onclick="reporterActionJour('${c}', 7)">Reporter d’une semaine</button><button type="button" onclick="renommerTacheJour('${c}')">Renommer</button><button type="button" class="danger" onclick="retirerTacheJour('${c}')">Retirer de la liste</button></div></details>`;
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
    faites: (traites || []).filter((t) => !/^Reporté/.test(t.etat)).length
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
  // Le responsable (initiales) entre le délai et le menu « ⋯ » (étude 23/10).
  return `${geste}${boutonOutil}<span class="tc-resp">${pastilleCollaborateur(a.dossier.responsable)}</span>${renderMenuTache(a.cle)}`;
}

/** Une tâche : une ligne (case ronde, titre, dossier + initiales du responsable, délai, gestes, menu). @param {any} a */
function renderLigneTacheCompacte(a) {
  if (a.rappel) return renderLigneRappelCompact(a);
  const cle = escapeOnclickArg(a.cle);
  return `<li class="tc-ligne${a.gravite === 'critique' ? ' critique' : ''}"><button type="button" class="tf-rond" onclick="marquerFaitJour('${cle}')" aria-label="${escapeAttr('Déjà fait : ' + a.titre)}" title="Déjà fait — valider à la main">${icone('check')}</button>
    <span class="tc-texte"><span class="tc-titre">${escapeHtml(a.titre)}</span><span class="tc-dossier">${lienDossierTache(a.dossier)}</span></span>
    <span class="tc-delai">${delaiTacheCompact(a)}</span><span class="tc-actions">${boutonsTacheCompact(a)}</span></li>`;
}

/** Plusieurs tâches du même type : un titre, une ligne par dossier. @param {any[]} liste */
function renderGroupeTacheCompact(liste) {
  const a0 = liste[0];
  const lignes = liste.map((a) => {
    const cle = escapeOnclickArg(a.cle);
    return `<li class="tc-ligne tc-sous"><button type="button" class="tf-rond" onclick="marquerFaitJour('${cle}')" aria-label="${escapeAttr('Déjà fait : ' + a.titre + ' — ' + libelleDossierAffiche(a.dossier))}" title="Déjà fait — valider à la main">${icone('check')}</button>
      <span class="tc-texte"><span class="tc-dossier tc-dossier-seul">${lienDossierTache(a.dossier)}</span></span>
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
  // Au-delà de la limite : un bouton pleine largeur vers le Suivi, le « + » d'ajout juste à sa droite.
  const suite = total > LIGNES_MAX_LISTE_COMPACTE
    ? `<div class="tc-pied w-fixe"><wa-button appearance="outlined" type="button" class="tc-voir-tout" onclick="ouvrirTachesSuivi()">Voir toutes les tâches (${total}) dans le Suivi</wa-button>${ajoutRappelOuvert ? '' : boutonPlusTache()}</div>` : '';
  return `<div class="tc-liste-theme">${blocs.join('')}${suite}</div>`;
}

// ==== Mes rappels, tâches de l'agenda Outlook et tâches demandées par un collègue, dans la même liste (étude 22/10) ====
//
// « Prendre en charge les tâches ajoutées sur l'agenda Outlook et celles que je demande aux collaborateurs via Teams » : ce sont des rappels
// (`rappelsPerso`) ; ils entrent dans les tuiles et dans le thème « Mes tâches », avec leurs propres gestes (case, menu).

/** Pure : un rappel en « tâche » du widget (cle `rappel:<id>`). @param {any} r @param {any[]} liste @param {string} aujourdhui */
function rappelEnTache(r, liste, aujourdhui) {
  const d = r.dossierId ? (liste || []).find((x) => x && x.id === r.dossierId) || null : null;
  const echeance = /^\d{4}-\d{2}-\d{2}$/.test(String(r.echeance || '')) ? r.echeance : '';
  const jours = echeance ? Math.round((Date.parse(echeance + 'T00:00:00Z') - Date.parse(aujourdhui + 'T00:00:00Z')) / 86400000) : null;
  return { cle: 'rappel:' + r.id, type: 'rappel', rappel: true, rappelId: r.id, titre: String(r.texte || ''), dossier: d, jours,
    categorie: 'neutre', categorieLabel: r.agendaItemId ? 'Agenda' : r.demandePar ? 'Demande' : 'Rappel',
    agenda: !!r.agendaItemId, demandePar: r.demandePar || '', gravite: jours != null && jours < 0 ? 'critique' : '' };
}

/** Pure : les rappels du mode choisi — sans dossier : toujours ; avec un dossier : selon vente / succession. @param {any[]} taches @param {string} mode */
function filtrerRappelsParAffaire(taches, mode) {
  if (mode !== 'vente' && mode !== 'succession') return taches;
  return taches.filter((t) => !t.dossier || (mode === 'succession' ? estSuccession(t.dossier) : !estSuccession(t.dossier)));
}

/** Les rappels à faire (les miens, ceux de l'agenda, les demandes) en tâches du widget. */
function rappelsEnTaches(aujourdhui) {
  if (!utilisateurPoste) return [];
  return filtrerRappelsParAffaire(rappelsDuJour(rappelsPerso, aujourdhui).aFaire.map((r) => rappelEnTache(r, dossiers, aujourdhui)), modeTachesAffaire());
}

/** Reporter un de mes rappels : son échéance passe à aujourd'hui + N jours (il revient ce jour-là). @param {string} id @param {number} jours */
function reporterRappelTache(id, jours) {
  fermerMenusTaches();
  const r = rappelsPerso.find((x) => x.id === id);
  if (!r || r.agendaItemId || r.demandePar) return;
  const avant = r.echeance || '';
  r.echeance = addDays(isoAujourdhuiLocal(), jours);
  enregistrerRappelPerso(r);
  render();
  afficherToast(`Reporté ${jours === 1 ? 'à demain' : 'd’une semaine'} — ${r.texte.toLowerCase()}.`, 'Annuler', () => { r.echeance = avant; enregistrerRappelPerso(r); render(); });
}

function renommerRappelTache(id) {
  fermerMenusTaches();
  const r = rappelsPerso.find((x) => x.id === id);
  if (!r || r.agendaItemId) return;
  const saisi = typeof prompt === 'function' ? prompt('Nouveau nom de la tâche', r.texte) : null;
  const nom = saisi == null ? '' : saisi.trim().slice(0, 200);
  if (!nom || nom === r.texte) return;
  r.texte = nom;
  enregistrerRappelPerso(r);
  render();
}

/** Le menu « ⋯ » d'un rappel : Renommer, Supprimer — rien pour une tâche de l'agenda (elle suit Outlook). @param {any} a */
function renderMenuRappel(a) {
  if (a.agenda) return '';
  return `<details class="tache-menu"><summary class="tache-menu-bouton" aria-label="Autres actions" title="Autres actions">${icone('ellipsis')}</summary>
    <div class="tache-menu-liste">${a.demandePar ? '' : `<button type="button" onclick="reporterRappelTache('${escapeOnclickArg(a.rappelId)}', 1)">Reporter d’un jour</button><button type="button" onclick="reporterRappelTache('${escapeOnclickArg(a.rappelId)}', 7)">Reporter d’une semaine</button>`}<button type="button" onclick="renommerRappelTache('${escapeOnclickArg(a.rappelId)}')">Renommer</button><button type="button" class="danger" onclick="supprimerRappelPerso('${escapeOnclickArg(a.rappelId)}')">Supprimer</button></div></details>`;
}

function etiquetteRappelTache(a) {
  return a.agenda ? 'Tâche de l’agenda' : a.demandePar ? `Demandé par ${prenomCollaborateur(a.demandePar)}` : 'Mon rappel';
}

function boutonEmailRappelTache(a) {
  return rappelParleEmail(a.titre) ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" onclick="ouvrirEmailRappelPerso('${escapeOnclickArg(a.rappelId)}')" title="Préparer un email vierge avec la signature de l'office" aria-label="Préparer un email">${icone('mail')}</wa-button>` : '';
}

/** Un rappel en ligne du widget compact. @param {any} a */
function renderLigneRappelCompact(a) {
  const dossier = a.dossier ? lienDossierTache(a.dossier) : '';
  return `<li class="tc-ligne${a.gravite === 'critique' ? ' critique' : ''}"><button type="button" class="tf-rond" onclick="basculerRappelPerso('${escapeOnclickArg(a.rappelId)}')" aria-label="${escapeAttr('Fait : ' + a.titre)}" title="Fait">${icone('check')}</button>
    <span class="tc-texte"><span class="tc-titre" title="${escapeAttr(a.titre)}">${escapeHtml(a.titre)}</span><span class="tc-dossier">${escapeHtml(etiquetteRappelTache(a))}${dossier ? ' · ' + dossier : ''}</span></span>
    <span class="tc-delai">${a.jours == null ? '' : delaiTacheCompact(a)}</span><span class="tc-actions">${boutonEmailRappelTache(a)}${renderMenuRappel(a)}</span></li>`;
}

/** Un rappel en carte (colonnes). @param {any} a */
function renderCarteRappel(a) {
  const dossier = a.dossier ? lienDossierTache(a.dossier) : '';
  return `<article class="tf-carte${a.gravite === 'critique' ? ' critique' : ''}" data-cle="${escapeAttr(a.cle)}">
    <span class="dot-label dl-neutre tf-categorie"><span class="dot"></span>${escapeHtml(a.categorieLabel)}</span>
    <div class="tf-ligne"><button type="button" class="tf-rond" onclick="basculerRappelPerso('${escapeOnclickArg(a.rappelId)}')" aria-label="${escapeAttr('Fait : ' + a.titre)}" title="Fait">${icone('check')}</button><span class="tf-titre">${escapeHtml(a.titre)}</span>${renderMenuRappel(a)}</div>
    <div class="tf-meta"><span>${escapeHtml(etiquetteRappelTache(a))}</span>${dossier}${a.jours == null ? '' : delaiTacheCompact(a)}</div>
    <div class="tf-actions-tache">${boutonEmailRappelTache(a)}</div>
  </article>`;
}
