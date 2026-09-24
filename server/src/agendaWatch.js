'use strict';

// Tour périodique de lecture de l'agenda de l'office (voir agendaOffice.js pour le parsing/
// rapprochement, tous deux purs). Même architecture que nasWatch.js/jobs/rappels.js : silencieux
// tant que l'URL n'est pas renseignée dans les Réglages, un seul tour à la fois (`enCours`), et un
// compte rendu écrit en base à chaque tour (voir parametresRepo.js) — sans lui, un flux devenu
// injoignable (URL de publication révoquée par Outlook, calendrier dépublié) s'arrêterait de mettre
// à jour les dossiers SANS QUE RIEN NE LE SIGNALE, exactement le défaut déjà corrigé une fois pour
// les rappels par email (voir CLE_DERNIER_TOUR dans parametresRepo.js).

const { actionsDetecteesDepuisIcs } = require('./agendaOffice');

const CHAMP_PAR_ACTION = { appelFonds: 'appelFonds', projetEnvoye: 'projetEnvoye' };
const LIBELLE_PAR_ACTION = { appelFonds: 'Appel de fonds', projetEnvoye: "Projet d'acte envoyé" };
const ACTIONS_CONNUES = Object.keys(CHAMP_PAR_ACTION);

// Applique les détections aux dossiers — jamais par-dessus une date DÉJÀ CONNUE, qu'elle vienne
// d'une saisie manuelle ou d'un tour précédent : une valeur dérivée d'une source externe ne doit
// jamais écraser ce que l'étude a elle-même renseigné, même règle que partout ailleurs dans ce
// projet (adresseBien, prixVente, montantPret...). Pure au sens de ses dépendances : `depot` est
// injecté, donc testable sans base réelle (voir server/test/agenda-watch.test.js).
function appliquerDetectionsAgenda(depot, detections) {
  const resultat = { misAJour: [], dejaRenseignes: [], sansCorrespondance: [] };
  for (const det of detections || []) {
    if (!det.dossierId) {
      resultat.sansCorrespondance.push({ reference: det.reference, resume: det.resume });
      continue;
    }
    // Relu à chaque itération (pas mis en cache) : deux détections de suite peuvent viser le MÊME
    // dossier (deux événements séparés, un par action) — la seconde doit voir l'écriture de la
    // première pour ne jamais la recompter comme "déjà renseigné" à tort ni la perdre.
    const d = depot.trouverParId(det.dossierId);
    if (!d || d.archive) continue;
    for (const action of ACTIONS_CONNUES) {
      if (!det[action]) continue;
      const champ = CHAMP_PAR_ACTION[action];
      if (d[champ]) {
        resultat.dejaRenseignes.push({ dossierId: d.id, dossierNom: d.nom, action });
        continue;
      }
      d[champ] = det.dateIso;
      d.echeancesValidees = d.echeancesValidees || {};
      d.echeancesValidees[champ] = true;
      d.historique = d.historique || [];
      d.historique.push({
        date: new Date().toISOString(),
        texte: `${LIBELLE_PAR_ACTION[action]} détecté depuis l’agenda de l’office (« ${det.reference} »)`
      });
      depot.remplacer(d.id, d);
      resultat.misAJour.push({ dossierId: d.id, dossierNom: d.nom, action, dateIso: det.dateIso });
    }
  }
  return resultat;
}

// Un seul tour de lecture : télécharge le flux, détecte, applique. `fetchFn` injectable (tests) —
// la vraie fonction par défaut est le `fetch` global de Node.
async function executerTourSurveillanceAgenda(depot, icsUrl, fetchFn) {
  const resultat = {
    ok: false, dossiersVerifies: 0, misAJour: [], dejaRenseignes: [], sansCorrespondance: [], erreur: null
  };
  if (!icsUrl) {
    resultat.erreur = "Aucune adresse d'agenda enregistrée.";
    return resultat;
  }
  try {
    const reponse = await (fetchFn || fetch)(icsUrl);
    if (!reponse.ok) throw new Error(`Le calendrier a répondu une erreur (${reponse.status}).`);
    const texte = await reponse.text();
    const dossiersActifs = depot.tousActifs().filter((d) => !d.archive);
    resultat.dossiersVerifies = dossiersActifs.length;
    const detections = actionsDetecteesDepuisIcs(texte, dossiersActifs);
    const applique = appliquerDetectionsAgenda(depot, detections);
    resultat.ok = true;
    resultat.misAJour = applique.misAJour;
    resultat.dejaRenseignes = applique.dejaRenseignes;
    resultat.sansCorrespondance = applique.sansCorrespondance;
  } catch (e) {
    resultat.erreur = e.message;
  }
  return resultat;
}

// Un tour, ET son compte rendu persisté — factorisé pour être appelé aussi bien par le minuteur
// automatique que par le bouton « Tester maintenant » des Réglages (voir routes/agenda.js), comme
// executerTacheRappels()/le bouton « Lancer un tour maintenant » pour les rappels par email.
async function executerEtEnregistrerTourAgenda(depot, parametresRepo, fetchFn, declenche) {
  const reglages = parametresRepo.lireReglagesAgenda();
  const resultat = await executerTourSurveillanceAgenda(depot, reglages.icsUrl, fetchFn);
  parametresRepo.ecrireDernierTourAgenda({
    ...resultat,
    at: new Date().toISOString(),
    declenche: declenche === 'manuel' ? 'manuel' : 'automatique'
  });
  return resultat;
}

// 15 minutes : ni aussi rapproché que le sondage de synchronisation du client (7 s, pensé pour un
// travail collaboratif en direct), ni aussi espacé que la surveillance du NAS (10 min, un simple
// nouveau fichier n'étant jamais urgent) — un appel de fonds ou un envoi de projet notés au
// calendrier n'ont pas besoin d'être répercutés à la minute près sur la fiche du dossier.
const INTERVALLE_SURVEILLANCE_AGENDA_MS = 15 * 60 * 1000;

function demarrerSurveillanceAgenda(depot, parametresRepo, fetchFn, intervalleMs) {
  // Même garde-fou que la surveillance du NAS : un tour plus lent que l'intervalle (agenda
  // volumineux, réseau lent) ne doit jamais en voir un second démarrer par-dessus.
  let enCours = false;
  const tour = async () => {
    const reglages = parametresRepo.lireReglagesAgenda();
    if (!reglages.icsUrl || enCours) return;
    enCours = true;
    try {
      await executerEtEnregistrerTourAgenda(depot, parametresRepo, fetchFn, 'automatique');
    } catch (e) {
      console.warn('[CLAIRE] Surveillance de l’agenda de l’office interrompue :', e.message);
    } finally {
      enCours = false;
    }
  };
  tour(); // un premier passage tout de suite, pas seulement au bout de quinze minutes
  return setInterval(tour, intervalleMs || INTERVALLE_SURVEILLANCE_AGENDA_MS);
}

module.exports = {
  appliquerDetectionsAgenda, executerTourSurveillanceAgenda, executerEtEnregistrerTourAgenda,
  demarrerSurveillanceAgenda, INTERVALLE_SURVEILLANCE_AGENDA_MS
};
