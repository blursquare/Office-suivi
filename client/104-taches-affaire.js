// ==== Tâches du jour : étapes et factures des successions, et choix Tout / Vente / Succession (étude 22/10) ====
//
// « Étapes de la fiche (notoriété, contrôle des droits, clôture ou transfert des comptes, réception des fonds) : à mettre dans les tâches » ;
// « factures de succession à régler : oui, à mettre dans les tâches » ; « FCDDV : non, pas dans les tâches » (son inscription est dans l'en-tête
// de la fiche) ; « un interrupteur pour choisir entre les tâches succession, vente ou tous ». Les tâches de décompte, de projet et d'appel de fonds
// d'une succession existent déjà (client/24). Ces tâches se cochent comme les autres (la case ronde coche l'étape, ou règle la facture).

var CLE_TACHES_AFFAIRE = 'claire-taches-affaire';
var MODES_TACHES_AFFAIRE = ['tout', 'vente', 'succession'];
// Jours avant la date d'une étape datée (notoriété, contrôle des droits) où sa tâche apparaît.
var JOURS_AVANT_ETAPE_SUCCESSION_TACHE = 7;
var TYPES_TACHES_ETAPES_SUCCESSION = ['notoriete', 'controleDroits', 'transfertComptes', 'deblocageFonds', 'receptionFonds'];
var TITRES_TACHES_ETAPES_SUCCESSION = {
  notoriete: 'Acte de notoriété à signer',
  controleDroits: 'Contrôle des droits et inventaire',
  transfertComptes: 'Transférer les comptes au conjoint survivant',
  deblocageFonds: 'Demander le déblocage des fonds aux banques',
  receptionFonds: 'Vérifier la réception des fonds'
};

function modeTachesAffaire() {
  try { const v = localStorage.getItem(CLE_TACHES_AFFAIRE); return MODES_TACHES_AFFAIRE.includes(v) ? v : 'tout'; } catch (e) { return 'tout'; }
}

function choisirModeTachesAffaire(mode) {
  if (!MODES_TACHES_AFFAIRE.includes(mode)) return;
  ecrireLocal(CLE_TACHES_AFFAIRE, mode);
  render();
}

/** Le nom du choix en cours, '' pour « Tout » (rappelé dans le petit widget, où la bascule n'est pas montrée). */
function libelleModeTachesAffaire() {
  const m = modeTachesAffaire();
  return m === 'vente' ? 'Ventes seulement' : m === 'succession' ? 'Successions seulement' : '';
}

/** Pure : les tâches déjà traitées de ce mode (l'entrée garde `dossierId`) — la progression et la fête suivent le choix. @param {any[]} traites @param {string} mode @param {any[]} [tousDossiers] */
function filtrerTraitesParAffaire(traites, mode, tousDossiers) {
  const base = Array.isArray(tousDossiers) ? tousDossiers : dossiers;
  const liste = Array.isArray(traites) ? traites : [];
  if (mode !== 'vente' && mode !== 'succession') return liste;
  return liste.filter((t) => {
    const id = t && (t.dossierId || String(t.cle || '').split(':')[0]);
    const d = id ? base.find((x) => x && x.id === id) : null;
    if (!d) return true;
    return mode === 'succession' ? estSuccession(d) : !estSuccession(d);
  });
}

/** Pure : les tâches de ce mode — 'vente' ou 'succession' ne gardent que leurs dossiers, 'tout' (ou inconnu) rend tout. @param {any[]} actions @param {string} mode */
function filtrerActionsParAffaire(actions, mode) {
  const liste = Array.isArray(actions) ? actions : [];
  if (mode === 'succession') return liste.filter((a) => a && a.dossier && estSuccession(a.dossier));
  if (mode === 'vente') return liste.filter((a) => a && a.dossier && !estSuccession(a.dossier));
  return liste;
}

/** Pure : les tâches d'ÉTAPES d'une succession (pas le décompte, le projet ni l'appel de fonds, déjà dans client/24) → actions sans `dossier` ni `cle`. @param {any} d @param {string} aujourdhuiIso */
function tachesEtapesSuccession(d, aujourdhuiIso) {
  // Succession terminée (questionnaire de satisfaction envoyé, étape qui l'archive) : plus de tâche d'étape.
  if (!d || d.archive || !estSuccession(d) || d.questionnaireSuccessionEnvoyeLe) return [];
  const limite = addDays(aujourdhuiIso, JOURS_AVANT_ETAPE_SUCCESSION_TACHE);
  const taches = [];
  etapesSuccession(d, aujourdhuiIso).forEach((e) => {
    if (!TYPES_TACHES_ETAPES_SUCCESSION.includes(e.type) || e.fait || e.active === false) return;
    // Une étape datée n'apparaît qu'à l'approche de sa date ; une étape sans date (comptes, fonds) dès qu'elle est active.
    // Une notoriété sans rendez-vous placé n'est qu'une date butoir : l'alerte « Placer le rendez-vous » la porte déjà (pas de doublon).
    if (e.type === 'notoriete' && !e.rdvPlace) return;
    if ((e.type === 'notoriete' || e.type === 'controleDroits') && (!e.iso || e.iso > limite)) return;
    const j = e.iso && (e.type === 'notoriete' || e.type === 'controleDroits') ? ecartJours(aujourdhuiIso, e.iso) : null;
    taches.push({
      type: e.type, categorie: 'neutre', categorieLabel: e.label,
      titre: TITRES_TACHES_ETAPES_SUCCESSION[e.type],
      contexte: e.label + (e.iso && j !== null ? ` — ${j === 0 ? 'aujourd’hui' : j > 0 ? 'dans ' + j + ' jour' + (j > 1 ? 's' : '') : 'date dépassée'}.` : '.'),
      jours: j, delaiTexte: j === null ? 'à faire' : undefined, gravite: j !== null && j <= 0 ? 'critique' : 'vigilance',
      geste: { type: 'fiche' }, bouton: 'Ouvrir la fiche'
    });
  });
  return taches;
}

/** Pure : une tâche par facture de la succession encore à régler. @param {any} d */
function tachesFacturesSuccession(d) {
  if (!d || d.archive || !estSuccession(d)) return [];
  return facturesARegler(d).map((f) => ({
    type: 'factureSuccession', cle: d.id + ':facture-' + f.id, factureId: f.id, categorie: 'neutre', categorieLabel: 'Facture à régler',
    titre: `Régler la facture${f.organisme ? ' ' + f.organisme : ''}${f.montant ? ' (' + formaterPrixCentimes(f.montant) + ')' : ''}`,
    contexte: `Facture reçue${f.recueLe ? ' le ' + formatDateFr(f.recueLe) : ''}, à régler.`,
    jours: null, delaiTexte: f.recueLe ? 'reçue le ' + formatDateFr(f.recueLe) : 'à régler', gravite: 'vigilance',
    geste: { type: 'fiche' }, bouton: 'Ouvrir la fiche'
  }));
}

/** La facture de la tâche est réglée (case ronde) ; « Annuler » la remet à régler. @param {any} a @param {boolean} [silencieux] */
function reglerFactureDepuisTache(a, silencieux) {
  if (!a || !a.dossier || !a.factureId) return false;
  basculerFactureReglee(a.dossier.id, a.factureId);
  noterTraite(a, 'Facture notée réglée', { factureId: a.factureId });   // compte dans la progression ; « Annuler » la remet à régler (annulerTraiteJour)
  if (!silencieux) render();   // la ligne « traitée » et la progression suivent (le rendu de basculerFactureReglee précède la note)
  if (!silencieux) afficherToast(`Facture notée réglée — ${libelleDossierAffiche(a.dossier)}.`, 'Annuler', () => annulerTraiteJour(a.cle));
  return true;
}

/** Le choix Tout / Vente / Succession, au-dessus de la liste des tâches. */
function renderBasculeAffaireJour() {
  const mode = modeTachesAffaire();
  const bouton = (cle, libelle) => `<wa-button appearance="outlined" size="s" type="button" class="vue-bascule-btn${mode === cle ? ' actif' : ''}" aria-pressed="${mode === cle}" onclick="choisirModeTachesAffaire('${cle}')">${libelle}</wa-button>`;
  return `<div class="ja-bascule-affaire w-fixe"><wa-button-group label="Tâches des ventes, des successions ou de tous">${bouton('tout', 'Tout')}${bouton('vente', 'Ventes')}${bouton('succession', 'Successions')}</wa-button-group></div>`;
}

// ==== Classement par thème, outil lié, vue en colonnes (étude 22/10) ====
//
// « Si la tâche est liée à un outil (ex. faire l'appel de fonds), mettre l'icône de l'outil et, au clic, ouvrir l'outil prérempli » ;
// « en quatre colonnes (widget pleine largeur), passer en mode colonnes » ; « une nouvelle vue après Échéances dans le Suivi des dossiers, en
// colonnes, avec les tâches ». Les colonnes sont des THÈMES, quatre au plus (étude 23/10 : « passer à quatre colonnes, en compact aussi » ;
// choix : suivre le dossier) — à préparer (mes tâches, rendez-vous, rédaction, factures d'une succession, à décider — étude 23/10 :
// « les factures ne sont pas après la signature, c'est pendant la gestion du dossier » ; titre « À préparer » gardé, étude 24/10 : « c'était
// mieux le titre À préparer »), relances, avant la signature, après la signature.

var THEMES_TACHES = [
  // Mes rappels, les tâches de l'agenda Outlook et les demandes d'un collègue en tête, puis les rendez-vous à fixer ou à placer (étude
  // 23/10 : catégorie « Agenda »), les actes à rédiger, les factures d'une succession à régler, et tout ce qui n'a pas d'autre colonne
  // (préemption, autres points).
  { cle: 'preparer', nom: 'À préparer', sous: 'mes tâches, rendez-vous, rédaction, factures', types: ['rappel', 'redaction', 'factureSuccession'], motif: /^point-.*(rendez-vous|rdv)/ },
  { cle: 'relances', nom: 'Relances', sous: 'prêt, vente préalable, fonds, confrère', types: ['pret', 'ventePrealable', 'relanceFonds', 'relanceTitreConfrere', 'relanceDecompteConfrere', 'pieces', 'fonds'] },
  { cle: 'avant', nom: 'Avant la signature', sous: 'appel de fonds, projet, RIB, étapes', types: ['appelFonds', 'projetEnvoye', 'rib', 'decompteSuccession', 'projetSuccession', 'appelFondsSuccession', 'notoriete', 'controleDroits', 'transfertComptes', 'deblocageFonds', 'receptionFonds'] },
  { cle: 'apres', nom: 'Après la signature', sous: 'copie de l’acte, questionnaire', types: ['questionnaire', 'questionnaireVendeur', 'questionnaireSuccession', 'copieActe'] }
];

/** Pure : la clé du thème d'une tâche (« preparer » pour le reste). @param {any} a */
function themeTache(a) {
  const type = String((a && a.type) || '');
  const t = THEMES_TACHES.find((x) => x.types.includes(type) || (x.motif && x.motif.test(type)));
  return t ? t.cle : 'preparer';
}

/** Pure : le rang d'une tâche dans « À préparer » — mes tâches, rendez-vous, rédaction, factures, puis le reste. @param {any} a */
function rangPreparerTache(a) {
  const type = String((a && a.type) || '');
  return type === 'rappel' ? 0 : /^point-.*(rendez-vous|rdv)/.test(type) ? 1 : type === 'redaction' ? 2 : type === 'factureSuccession' ? 3 : 4;
}

/** Pure : les tâches rangées par thème, dans l'ordre des thèmes, les thèmes vides gardés (colonne vide). @param {any[]} actions */
function regrouperTachesParTheme(actions) {
  return THEMES_TACHES.map((t) => {
    const liste = (actions || []).filter((a) => themeTache(a) === t.cle);
    if (t.cle === 'preparer') liste.sort((x, y) => rangPreparerTache(x) - rangPreparerTache(y));
    return { theme: t, actions: liste };
  });
}

/** Pure : le bouton d'outil à ajouter à une tâche — pas quand son geste ouvre déjà ce même outil prérempli (appel de fonds). @param {any} a */
function outilSupplementaireTache(a) {
  const outil = outilDeTache(a);
  return outil && !(a.geste && a.geste.type === 'appelFonds' && outil.cle === 'appel-fonds') ? outil : null;
}

/** Pure : l'outil de CLAIRE lié à une tâche, ou null — { cle, libelle, icone, onclick }. Ouvre l'outil prérempli par la fiche du dossier. @param {any} a */
function outilDeTache(a) {
  if (!a || !a.dossier) return null;
  const id = escapeOnclickArg(a.dossier.id);
  if (a.type === 'appelFonds' && !estSuccession(a.dossier)) return { cle: 'appel-fonds', libelle: 'Appel de fonds', icone: 'file-text', onclick: `preparerAppelFondsDepuisDossier('${id}')` };
  if (/pr[ée]emption/i.test(String(a.categorieLabel || '') + ' ' + String(a.type || ''))) return { cle: 'preemption', libelle: 'Contrôle de l’urbanisme', icone: 'shield', onclick: `ouvrirPreemptionDepuisFiche('${id}')` };
  return null;
}

/** Une tâche en CARTE, comme dans le Tableau d'une fiche (case ronde, titre, dossier, délai, outil, geste). @param {any} a */
function renderCarteTache(a) {
  if (a.rappel) return renderCarteRappel(a);
  const cle = escapeOnclickArg(a.cle);
  const outil = outilSupplementaireTache(a);
  const delai = a.jours == null ? (a.delaiTexte ? `<span class="tf-delai">${escapeHtml(a.delaiTexte)}</span>` : '')
    : `<span class="tf-delai ${a.jours < 0 ? 'retard' : classeDelaiCarteFiche({ jours: a.jours, fait: false })}">${icone('clock')}${escapeHtml(libelleDelaiJour(a.jours))}</span>`;
  const sansGeste = !a.geste || a.geste.type === 'fiche';
  const geste = sansGeste
    ? `<wa-button appearance="outlined" size="s" type="button" class="tf-geste" onclick="ouvrirDossierDrawer('${escapeOnclickArg(a.dossier.id)}')">${icone('folder')}Ouvrir la fiche</wa-button>`
    : `<wa-button appearance="outlined" size="s" type="button" class="tf-geste" onclick="executerActionJour('${cle}')" title="${escapeAttr(a.bouton || a.titre)}">${iconeGeste(a)}${escapeHtml(libelleCourtGeste(a))}</wa-button>`;
  const boutonOutil = outil
    ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone tf-outil" onclick="${outil.onclick}" title="${escapeAttr('Ouvrir l’outil « ' + outil.libelle + ' » prérempli')}" aria-label="${escapeAttr('Outil ' + outil.libelle)}">${icone(outil.icone)}</wa-button>`
    : '';
  return `<article class="tf-carte${a.gravite === 'critique' ? ' critique' : ''}" data-cle="${escapeAttr(a.cle)}">
    <span class="dot-label dl-${escapeAttr(a.categorie || 'neutre')} tf-categorie"><span class="dot"></span>${escapeHtml(a.categorieLabel || '')}</span>
    <div class="tf-ligne"><button type="button" class="tf-rond" onclick="marquerFaitJour('${cle}')" aria-label="${escapeAttr('Déjà fait : ' + a.titre)}" title="Déjà fait — valider à la main">${icone('check')}</button><span class="tf-titre">${escapeHtml(a.titre)}</span>${renderMenuTache(a.cle)}</div>
    <div class="tf-meta">${lienDossierTache(a.dossier)}${pastilleCollaborateur(a.dossier.responsable)}${delai}</div>
    <div class="tf-actions-tache">${geste}${boutonOutil}</div>
  </article>`;
}

// Tâches identiques (même type) à partir de ce nombre : UNE carte, une ligne par dossier (étude 22/10 : « regroupement à partir de 2 »).
var SEUIL_REGROUPEMENT_TACHES = 2;

/** Pure : les tâches d'une colonne en éléments — { groupe: [actions] } pour 2 identiques ou plus, { action } sinon ; l'ordre du premier de chaque type est gardé. @param {any[]} actions */
function elementsColonneTaches(actions) {
  const parType = new Map();
  (actions || []).forEach((a) => { const k = a.rappel ? a.cle : a.type + '|' + a.titre; if (!parType.has(k)) parType.set(k, []); parType.get(k).push(a); });
  const out = [];
  parType.forEach((liste) => { if (liste.length >= SEUIL_REGROUPEMENT_TACHES) out.push({ groupe: liste }); else out.push({ action: liste[0] }); });
  return out;
}

/** Une carte pour plusieurs tâches du même type : une ligne par dossier (case ronde, dossier, délai, geste). @param {any[]} liste */
function renderCarteGroupeTaches(liste) {
  const a0 = liste[0];
  const lignes = liste.map((a) => {
    const cle = escapeOnclickArg(a.cle);
    const sansGeste = !a.geste || a.geste.type === 'fiche';
    const delai = a.jours == null ? (a.delaiTexte ? `<span class="tf-delai">${escapeHtml(a.delaiTexte)}</span>` : '')
      : `<span class="tf-delai ${a.jours < 0 ? 'retard' : classeDelaiCarteFiche({ jours: a.jours, fait: false })}">${escapeHtml(libelleDelaiJour(a.jours))}</span>`;
    const outil = outilSupplementaireTache(a);
    const boutonOutil = outil ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" onclick="${outil.onclick}" title="${escapeAttr('Ouvrir l’outil « ' + outil.libelle + ' » prérempli')}" aria-label="${escapeAttr('Outil ' + outil.libelle)}">${icone(outil.icone)}</wa-button>` : '';
    const geste = sansGeste ? '' : `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" onclick="executerActionJour('${cle}')" title="${escapeAttr(libelleCourtGeste(a) + ' — ' + a.titre)}" aria-label="${escapeAttr(libelleCourtGeste(a))}">${iconeGeste(a)}</wa-button>`;
    return `<li class="tf-groupe-ligne"><button type="button" class="tf-rond" onclick="marquerFaitJour('${cle}')" aria-label="${escapeAttr('Déjà fait : ' + a.titre + ' — ' + libelleDossierAffiche(a.dossier))}" title="Déjà fait — valider à la main">${icone('check')}</button>
      <span class="tf-groupe-dossier">${lienDossierTache(a.dossier)}${pastilleCollaborateur(a.dossier.responsable)}</span><span class="tf-groupe-actions">${geste}${boutonOutil}${renderMenuTache(a.cle)}</span>${delai ? `<span class="tf-groupe-delai">${delai}</span>` : ''}</li>`;
  }).join('');
  return `<article class="tf-carte${liste.some((a) => a.gravite === 'critique') ? ' critique' : ''}">
    <span class="dot-label dl-${escapeAttr(a0.categorie || 'neutre')} tf-categorie"><span class="dot"></span>${escapeHtml(a0.categorieLabel || '')}</span>
    <div class="tf-ligne"><span class="tf-rond tf-rond-auto" aria-hidden="true">${icone('clock')}</span><span class="tf-titre">${escapeHtml(a0.titre)} <span class="tf-sous">· ${liste.length} dossiers</span></span></div>
    <ul class="tf-groupe">${lignes}</ul>
  </article>`;
}

/** Les tâches en COLONNES par thème (widget pleine largeur, vue « Tâches » du Suivi). @param {any[]} actions */
function renderTachesColonnes(actions) {
  const groupes = regrouperTachesParTheme(actions);
  return `<div class="tf-tableau tf-taches-colonnes" role="list" aria-label="Les tâches par thème">${groupes.map((g) => `<section class="tf-colonne" role="listitem" aria-label="${escapeAttr(g.theme.nom)}">
      <header class="tf-colonne-tete"><div><h3>${escapeHtml(g.theme.nom)}</h3><div class="hint">${escapeHtml(g.theme.sous)}</div></div><span class="tf-nb">${g.actions.length}</span></header>
      <div class="tf-cartes">${g.actions.length ? elementsColonneTaches(g.actions).map((e) => (e.groupe ? renderCarteGroupeTaches(e.groupe) : renderCarteTache(e.action))).join('') : '<p class="tf-vide">Rien pour l’instant</p>'}</div>
    </section>`).join('')}</div>`;
}

/** Les tâches des dossiers donnés (hors reportées et déjà faites aujourd'hui), selon le choix Tout / Ventes / Successions. @param {any[]} liste */
function tachesDesDossiers(liste) {
  const actifs = (liste || []).filter((d) => d && !d.archive);
  const etat = lireEtatJour();
  const faites = new Set(((etat.traites && etat.traites.liste) || []).map((t) => t.cle));
  return appliquerReglagesTaches(filtrerActionsParAffaire(actionsDuJour(actifs, isoAujourdhuiLocal()).actions, modeTachesAffaire()), lireReglagesTaches())
    .filter((a) => !(etat.reports && etat.reports[a.cle]) && !faites.has(a.cle));
}

/** La vue « Tâches » du Suivi des dossiers : les mêmes dossiers filtrés, leurs tâches en colonnes. @param {any[]} liste */
function renderVueTachesSuivi(liste) {
  const actions = rappelsEnTaches(isoAujourdhuiLocal()).concat(tachesDesDossiers(liste));
  const ecartees = lireReglagesTaches().ecartees;
  const retirees = filtrerActionsParAffaire(actionsDuJour((liste || []).filter((d) => d && !d.archive), isoAujourdhuiLocal()).actions, modeTachesAffaire()).filter((a) => ecartees[a.cle]).length;
  const vide = modeTachesAffaire() !== 'tout' ? '✓ Aucune tâche de ce type pour ces dossiers (choix « ' + (modeTachesAffaire() === 'vente' ? 'Ventes' : 'Successions') + ' » ci-dessus).' : '✓ Aucune tâche pour ces dossiers.';
  return `<div class="suivi-taches">${renderBasculeAffaireJour()}${actions.length ? renderTachesColonnes(actions) : `<p class="jour-vide jour-vide-ok">${escapeHtml(vide)}</p>`}${renderTachesRetirees(retirees)}</div>`;
}
