'use strict';

// Notification proactive : signale l'apparition d'un nouveau PDF dans le dossier NAS relié à un
// dossier, sans attendre qu'un collaborateur clique sur « Revérifier ». Jusqu'ici, un fichier
// déposé sur le NAS entre deux vérifications ne se signalait jamais de lui-même — la checklist se
// mettait bien à jour au prochain passage (revérifierDossiersLiesAuDemarrage côté client, toutes
// les 5 minutes pour les dossiers non complets), mais SILENCIEUSEMENT : rien n'attirait l'attention
// sur le fait qu'un document venait d'arriver.
//
// Comparaison PAR NOM DE FICHIER uniquement (pas par contenu ni par hash) : suffisant pour détecter
// un AJOUT, qui est le cas qui intéresse l'étude — un fichier modifié sur place sans changer de nom
// n'est pas ce qu'on cherche à signaler ici, et lire le contenu de chaque PDF pour comparer un hash
// coûterait bien plus cher qu'un simple listing, pour un signal qui n'en a pas besoin.
//
// Additif sur le dossier (`d.nasInventaire`, `d.nasNouveaute`) : un blob JSON de plus, aucune
// migration — même principe que tous les autres champs dérivés d'un scan du NAS.

const { listerPdfRecursif, resoudreCheminNas } = require('./nas');

// Pure et testable : compare l'ancien inventaire (une simple liste de chemins relatifs) au nouveau,
// renvoie ceux qui viennent d'apparaître. Un inventaire absent (tout premier passage sur ce
// dossier) ne produit AUCUNE nouveauté — sans ce garde-fou, TOUS les fichiers déjà présents à la
// première liaison seraient signalés comme « nouveaux », ce qu'ils ne sont pas.
function detecterNouveauxFichiers(ancienInventaire, nouvelInventaire) {
  if (!Array.isArray(ancienInventaire)) return [];
  const connus = new Set(ancienInventaire);
  return (nouvelInventaire || []).filter((chemin) => !connus.has(chemin));
}

// Même ensemble de chemins, sans considération d'ordre — sert à ne réécrire le dossier que quand
// l'inventaire a réellement changé (ajout, retrait ou renommage), pas à chaque tour pour rien.
function memeInventaire(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((valeur, i) => valeur === sb[i]);
}

// Un tour de surveillance : pour chaque dossier actif relié au NAS, relit la liste de ses PDF (nom
// seul, jamais leur contenu) et compare à l'inventaire déjà connu. `depot.remplacer` n'est appelé
// que si quelque chose a changé — pas à chaque tour sur un portefeuille inchangé, ce qui ferait
// inutilement grimper le SEQUENCE iCalendar de chaque dossier (voir routes/calendrier.js) sans
// aucune raison fonctionnelle.
function executerTourSurveillanceNas(depot, racineNas) {
  const resultat = { dossiersVerifies: 0, dossiersNotifies: 0 };
  if (!racineNas) return resultat;
  for (const d of depot.tousActifs()) {
    if (d.archive || !d.nasDossier) continue;
    const chemin = resoudreCheminNas(racineNas, d.nasDossier);
    if (!chemin) continue;
    resultat.dossiersVerifies++;
    let fichiers;
    try {
      fichiers = listerPdfRecursif(chemin).map((f) => f.chemin);
    } catch (e) {
      continue; // dossier illisible entretemps (déplacé, permissions) : jamais fatal pour les autres
    }
    const nouveaux = detecterNouveauxFichiers(d.nasInventaire, fichiers);
    if (nouveaux.length > 0) {
      resultat.dossiersNotifies++;
      depot.remplacer(d.id, { ...d, nasInventaire: fichiers, nasNouveaute: { at: Date.now(), fichiers: nouveaux } });
    } else if (!memeInventaire(d.nasInventaire, fichiers)) {
      // Rien de neuf à signaler, mais l'inventaire mémorisé a changé (fichier renommé/retiré) :
      // on le rafraîchit silencieusement pour que le prochain tour compare au bon référentiel.
      depot.remplacer(d.id, { ...d, nasInventaire: fichiers });
    }
  }
  return resultat;
}

// 10 minutes : un document qui vient d'arriver n'est jamais urgent à la minute près, et lister les
// fichiers de tous les dossiers actifs a un coût réseau/disque sur un NAS volumineux — inutile de
// le payer aussi souvent que le sondage de synchronisation du client (7 secondes).
const INTERVALLE_SURVEILLANCE_NAS_MS = 10 * 60 * 1000;

function demarrerSurveillanceNas(depot, config, intervalleMs) {
  const tour = () => {
    try {
      executerTourSurveillanceNas(depot, config.nasRacine);
    } catch (e) {
      console.warn('[CLAIRE] Surveillance du NAS (nouveaux documents) interrompue :', e.message);
    }
  };
  tour(); // un premier passage tout de suite, pas seulement dans dix minutes
  return setInterval(tour, intervalleMs || INTERVALLE_SURVEILLANCE_NAS_MS);
}

module.exports = {
  detecterNouveauxFichiers, memeInventaire, executerTourSurveillanceNas,
  demarrerSurveillanceNas, INTERVALLE_SURVEILLANCE_NAS_MS
};
