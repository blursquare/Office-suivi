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

// ---- Appel de fonds oublié (demandé par l'étude le 29/09) ----
// Le courrier d'appel de fonds (« Convocation au rendez-vous contenant l'appel de fonds »,
// « Décompte acquéreur », tableau envoyé au confrère…) est rangé à la RACINE du dossier NAS relié.
// Quand il y est et que l'envoi n'est pas noté sur le dossier, CLAIRE le note elle-même : date
// d'envoi = jour de la détection, échéance validée (la tâche « Envoyer l'appel de fonds » disparaît).
// Même règle que les envois relevés dans l'agenda (agendaWatch.js) : un repère
// (d.detectionsNas.appelFonds) empêche de repasser dessus, même si la date est ensuite effacée ou
// corrigée à la main. Jamais par-dessus une date ou une validation déjà connues, jamais sur un
// dossier dont le rendez-vous de signature est passé (la date du jour y serait fausse).
// Nom seulement, comme pour les pièces : « décompte », « convocation », « appel de fonds », en
// écartant les décomptes qui n'en sont pas (remboursement d'un prêt, tableau d'amortissement…).
const RE_NOM_APPEL_FONDS = /(appel\s*de\s*fonds|d[ée]compte|convocation)/i;
const RE_NOM_APPEL_FONDS_EXCLU = /(rembours|pr[eê]t|amortissement|offre|cr[ée]dit|re[cç]u)/i;
// Le décompte du confrère (« Décompte Me DURAND ») n'est jamais le courrier de l'étude (étude 06/10) ; le courrier écrit par
// CLAIRE passe avant tout autre nom — règle commune au poste (commun/decompte.js).
const { nomDitDecompteConfrere, nomDitCourrierClaireAppelFonds } = require('../../commun/decompte');

function dateDuJourParis() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

// Pure : le premier PDF de la racine (chemin relatif sans séparateur) qui est un appel de fonds.
function fichierAppelFondsRacine(chemins) {
  const candidats = (chemins || []).filter((c) => {
    if (typeof c !== 'string' || /[\\/]/.test(c)) return false;
    const nom = c.normalize('NFC').replace(/[_-]+/g, ' ');
    return RE_NOM_APPEL_FONDS.test(nom) && !RE_NOM_APPEL_FONDS_EXCLU.test(nom) && !nomDitDecompteConfrere(nom);
  });
  return candidats.find((c) => nomDitCourrierClaireAppelFonds(c)) || candidats[0] || null;
}

// Pure : le fichier qui justifie de noter l'envoi sur ce dossier, ou null.
function appelFondsANoter(d, chemins, jour) {
  if (!d || d.archive || d.appelFonds) return null;
  if (d.echeancesValidees && d.echeancesValidees.appelFonds) return null;
  if (d.detectionsNas && d.detectionsNas.appelFonds) return null;
  if (d.rendezVousSignature && d.rendezVousSignature < jour) return null;
  return fichierAppelFondsRacine(chemins);
}

// Applique la détection à une copie du dossier (renvoyée), ou renvoie null si rien à faire.
function noterAppelFondsDetecte(d, chemins, jour) {
  const fichier = appelFondsANoter(d, chemins, jour);
  if (!fichier) return null;
  return {
    ...d,
    appelFonds: jour,
    appelFondsCourrier: fichier,
    echeancesValidees: { ...(d.echeancesValidees || {}), appelFonds: true },
    detectionsNas: { ...(d.detectionsNas || {}), appelFonds: jour, appelFondsFichier: fichier },
    historique: [...(d.historique || []), {
      date: new Date().toISOString(),
      texte: `Envoi de l’appel de fonds noté automatiquement : « ${fichier} » trouvé dans le dossier du NAS`
    }]
  };
}

// Le courrier d'appel de fonds rattaché au dossier (d.appelFondsCourrier, chemin relatif au dossier
// NAS), pour l'ouvrir depuis la ligne « Envoi appel de fonds » de la fiche (demandé par l'étude le
// 29/09) — que l'envoi ait été noté à la main ou par CLAIRE. Pure : le chemin à mémoriser, ou null
// si rien ne change. Un courrier déjà rattaché et toujours présent est gardé (pas de va-et-vient
// entre deux fichiers) ; renommé ou retiré, il est remplacé par celui qu'on trouve.
// Un décompte du confrère rattaché par erreur (avant le 06/10) est détaché ('' = rien à la place) ou remplacé par le nôtre.
function courrierAppelFondsARattacher(d, chemins) {
  if (!d || d.archive) return null;
  const confrereRattache = !!d.appelFondsCourrier && nomDitDecompteConfrere(d.appelFondsCourrier);
  if (d.appelFondsCourrier && !confrereRattache && (chemins || []).includes(d.appelFondsCourrier)) return null;
  const trouve = fichierAppelFondsRacine(chemins);
  if (confrereRattache) return trouve || '';
  return trouve && trouve !== d.appelFondsCourrier ? trouve : null;
}

// Un tour de surveillance : pour chaque dossier actif relié au NAS, relit la liste de ses PDF (nom
// seul, jamais leur contenu) et compare à l'inventaire déjà connu. `depot.remplacer` n'est appelé
// que si quelque chose a changé — pas à chaque tour sur un portefeuille inchangé, ce qui ferait
// inutilement grimper la date de modification de chaque dossier (qui retarde aussi la pose de ses
// dates butoir dans l'agenda, voir echeancesAgenda.js).
// ASYNCHRONE depuis que ce balayage a été identifié comme la cause des gels du serveur signalés
// par l'étude (« le serveur saute souvent »). Le parcours était synchrone et bouclait sur TOUS les
// dossiers reliés : pendant tout le tour, Node — mono-thread — ne répondait plus à une seule
// requête HTTP. Sur un LAN rapide le tour passe inaperçu (moins d'une seconde mesurée), mais dès
// que le NAS répond lentement (disques en veille, sauvegarde en cours, reconnexion SMB) le coût
// est multiplié par chaque aller-retour et par chaque dossier du portefeuille : le serveur
// paraissait mort, puis revenait de lui-même — exactement le symptôme décrit.
//
// Deux garde-fous, et il faut les deux :
//   1. chaque lecture disque est `await` (voir nas.js), donc le serveur répond PENDANT le parcours ;
//   2. `respirer()` entre deux dossiers rend explicitement la main à la boucle d'événements, pour
//      qu'un portefeuille qui grandit ne puisse jamais monopoliser le serveur à nouveau.
const respirer = () => new Promise((resolve) => setImmediate(resolve));

async function executerTourSurveillanceNas(depot, racineNas, aujourdHui) {
  const resultat = { dossiersVerifies: 0, dossiersNotifies: 0, appelsFondsNotes: 0 };
  if (!racineNas) return resultat;
  const jour = aujourdHui || dateDuJourParis();
  for (const d of depot.tousActifs()) {
    if (d.archive || !d.nasDossier) continue;
    const chemin = await resoudreCheminNas(racineNas, d.nasDossier);
    if (!chemin) continue;
    resultat.dossiersVerifies++;
    await respirer();
    let fichiers;
    try {
      fichiers = (await listerPdfRecursif(chemin)).map((f) => f.chemin);
    } catch (e) {
      continue; // dossier illisible entretemps (déplacé, permissions) : jamais fatal pour les autres
    }
    const nouveaux = detecterNouveauxFichiers(d.nasInventaire, fichiers);
    const avecAppelFonds = noterAppelFondsDetecte(d, fichiers, jour);
    let base = avecAppelFonds || d;
    if (avecAppelFonds) resultat.appelsFondsNotes++;
    const courrier = courrierAppelFondsARattacher(base, fichiers);
    if (courrier !== null) base = { ...base, appelFondsCourrier: courrier };
    if (nouveaux.length > 0) {
      resultat.dossiersNotifies++;
      depot.remplacer(d.id, { ...base, nasInventaire: fichiers, nasNouveaute: { at: Date.now(), fichiers: nouveaux } });
    } else if (base !== d || !memeInventaire(d.nasInventaire, fichiers)) {
      // Rien de neuf à signaler, mais l'inventaire mémorisé a changé (fichier renommé/retiré) :
      // on le rafraîchit silencieusement pour que le prochain tour compare au bon référentiel.
      depot.remplacer(d.id, { ...base, nasInventaire: fichiers });
    }
  }
  return resultat;
}

// 10 minutes : un document qui vient d'arriver n'est jamais urgent à la minute près, et lister les
// fichiers de tous les dossiers actifs a un coût réseau/disque sur un NAS volumineux — inutile de
// le payer aussi souvent que le sondage de synchronisation du client (7 secondes).
const INTERVALLE_SURVEILLANCE_NAS_MS = 10 * 60 * 1000;

function demarrerSurveillanceNas(depot, config, intervalleMs) {
  // `enCours` empêche deux tours de se chevaucher : un tour lent (NAS qui répond mal) ne doit pas
  // voir le minuteur en relancer un deuxième par-dessus, ce qui doublerait la charge sur le NAS
  // au pire moment — précisément quand il est déjà en difficulté.
  let enCours = false;
  const tour = async () => {
    if (enCours) return;
    enCours = true;
    try {
      await executerTourSurveillanceNas(depot, config.nasRacine);
    } catch (e) {
      console.warn('[CLAIRE] Surveillance du NAS (nouveaux documents) interrompue :', e.message);
    } finally {
      enCours = false;
    }
  };
  tour(); // un premier passage tout de suite, pas seulement dans dix minutes
  return setInterval(tour, intervalleMs || INTERVALLE_SURVEILLANCE_NAS_MS);
}

module.exports = {
  detecterNouveauxFichiers, memeInventaire, executerTourSurveillanceNas,
  fichierAppelFondsRacine, appelFondsANoter, noterAppelFondsDetecte, courrierAppelFondsARattacher,
  demarrerSurveillanceNas, INTERVALLE_SURVEILLANCE_NAS_MS
};
