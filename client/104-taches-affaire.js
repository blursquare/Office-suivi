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

/** Pure : les tâches de ce mode — 'vente' ou 'succession' ne gardent que leurs dossiers, 'tout' (ou inconnu) rend tout. @param {any[]} actions @param {string} mode */
function filtrerActionsParAffaire(actions, mode) {
  const liste = Array.isArray(actions) ? actions : [];
  if (mode === 'succession') return liste.filter((a) => a && a.dossier && estSuccession(a.dossier));
  if (mode === 'vente') return liste.filter((a) => a && a.dossier && !estSuccession(a.dossier));
  return liste;
}

/** Pure : les tâches d'ÉTAPES d'une succession (pas le décompte, le projet ni l'appel de fonds, déjà dans client/24) → actions sans `dossier` ni `cle`. @param {any} d @param {string} aujourdhuiIso */
function tachesEtapesSuccession(d, aujourdhuiIso) {
  if (!d || d.archive || !estSuccession(d)) return [];
  const limite = addDays(aujourdhuiIso, JOURS_AVANT_ETAPE_SUCCESSION_TACHE);
  const taches = [];
  etapesSuccession(d, aujourdhuiIso).forEach((e) => {
    if (!TYPES_TACHES_ETAPES_SUCCESSION.includes(e.type) || e.fait || e.active === false) return;
    // Une étape datée n'apparaît qu'à l'approche de sa date ; une étape sans date (comptes, fonds) dès qu'elle est active.
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
    type: 'factureSuccession', cle: d.id + ':facture:' + f.id, factureId: f.id, categorie: 'neutre', categorieLabel: 'Facture à régler',
    titre: `Régler la facture${f.organisme ? ' ' + f.organisme : ''}${f.montant ? ' (' + formaterPrixCentimes(f.montant) + ')' : ''}`,
    contexte: `Facture reçue${f.recueLe ? ' le ' + formatDateFr(f.recueLe) : ''}, à régler.`,
    jours: null, delaiTexte: f.recueLe ? 'reçue le ' + formatDateFr(f.recueLe) : 'à régler', gravite: 'vigilance',
    geste: { type: 'fiche' }, bouton: 'Ouvrir la fiche'
  }));
}

/** La facture de la tâche est réglée (case ronde) ; « Annuler » la remet à régler. @param {any} a */
function reglerFactureDepuisTache(a) {
  if (!a || !a.dossier || !a.factureId) return false;
  basculerFactureReglee(a.dossier.id, a.factureId);
  afficherToast(`Facture notée réglée — ${libelleDossierAffiche(a.dossier)}.`, 'Annuler', () => basculerFactureReglee(a.dossier.id, a.factureId));
  return true;
}

/** Le choix Tout / Vente / Succession, au-dessus de la liste des tâches. */
function renderBasculeAffaireJour() {
  const mode = modeTachesAffaire();
  const bouton = (cle, libelle) => `<wa-button appearance="outlined" size="s" type="button" class="vue-bascule-btn${mode === cle ? ' actif' : ''}" aria-pressed="${mode === cle}" onclick="choisirModeTachesAffaire('${cle}')">${libelle}</wa-button>`;
  return `<div class="ja-bascule-affaire w-fixe"><wa-button-group label="Tâches des ventes, des successions ou de tous">${bouton('tout', 'Tout')}${bouton('vente', 'Ventes')}${bouton('succession', 'Successions')}</wa-button-group></div>`;
}
