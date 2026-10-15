'use strict';

// Tour périodique de lecture de l'agenda de l'office (voir agendaOffice.js pour le rapprochement,
// pur). Source : le calendrier partagé de Sophie, lu par EWS (exchange/ews.js,
// lireCalendrierExchange) avec la connexion Exchange des Réglages — il remplace depuis le 29/09 le
// flux .ics publié du même agenda. Même architecture que nasWatch.js/jobs/rappels.js : silencieux
// tant que la connexion n'est pas configurée, un seul tour à la fois (`enCours`), et un compte rendu
// écrit en base à chaque tour (voir parametresRepo.js) — sans lui, un agenda devenu illisible
// (mot de passe changé, partage retiré) s'arrêterait de mettre à jour les dossiers SANS QUE RIEN NE
// LE SIGNALE.
//
// Disjoncteur (CLAUDE.md, contrainte 5) : un refus d'identifiants suspend la lecture AUTOMATIQUE
// tant que les identifiants enregistrés restent les mêmes — sans lui, le tour de 2 minutes
// représenterait un mauvais mot de passe 96 fois par jour et verrouillerait le compte de messagerie.
// Elle reprend d'elle-même dès que l'adresse ou le mot de passe change dans les Réglages, ou après
// un « Tester maintenant » réussi. Seule une EMPREINTE des identifiants refusés est gardée, en
// mémoire (jamais en base, jamais renvoyée) ; un redémarrage du serveur autorise un nouvel essai.

const { synchroniserTachesAgenda } = require('./tachesAgenda');
const { noterVerification } = require('./verificationsTerrain');
const crypto = require('node:crypto');
const {
  actionsDetecteesDepuisEvenements, absencesDepuisEvenements, categoriesDistinctes, evenementsDepuisEws, formatDateFr,
  agendaDuJourDepuisEvenements, lundiSemainePrecedente, evenementsAgendaOffice, detecteProjetEnvoye, detecteAppelDeFonds
} = require('./agendaOffice');
const { lireCalendrierExchange } = require('./exchange/ews');
const { poserEcheancesManquantes } = require('./echeancesAgenda');
const { envoyerEmail, envoiConfigure } = require('./envoiEmail');
const { texteRendezVousAgenda, envoyerAuResponsable } = require('./routes/notifications');
const { libelleDossier } = require('./jobs/rappels');

const CHAMP_PAR_ACTION = { appelFonds: 'appelFonds', projetEnvoye: 'projetEnvoye' };
const LIBELLE_PAR_ACTION = { appelFonds: 'Envoi appel de fonds', projetEnvoye: 'Envoi projet' };
const ACTIONS_CONNUES = Object.keys(CHAMP_PAR_ACTION);

// Date du jour en heure de Paris (AAAA-MM-JJ) — le serveur tourne au bureau, mais `toISOString()`
// donnerait la date UTC, fausse entre minuit et 2 h.
function dateDuJourParis() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

// Ce que l'historique du dossier dit d'un envoi relevé dans l'agenda (étude 07/10 : « mettre dans l'historique comment est
// détecté l'envoi du projet ») : la mention trouvée — dans le Lieu du rendez-vous, sinon dans son titre — et le rendez-vous. Pure.
function texteHistoriqueEnvoiAgenda(action, det) {
  const lieu = String(det.lieu || '').trim();
  const detecte = action === 'projetEnvoye' ? detecteProjetEnvoye : detecteAppelDeFonds;
  const ou = lieu && detecte(lieu) ? `lieu « ${lieu} »` : `titre « ${String(det.resume || det.reference || '').trim()} »`;
  const quand = /^\d{4}-\d{2}-\d{2}$/.test(String(det.dateIso || '')) ? ` du ${det.dateIso.split('-').reverse().join('/')}` : '';
  return `${LIBELLE_PAR_ACTION[action]} relevé dans l’agenda de l’office : ${ou} du rendez-vous « ${det.reference} »${quand}`;
}

// Applique les détections aux dossiers. Deux règles données par l'étude (25/09) :
//  • la date retenue est celle du JOUR DE LA DÉTECTION, pas celle du rendez-vous de l'agenda —
//    c'est le jour où l'envoi est constaté ;
//  • une action déjà relevée pour un dossier (d.detectionsAgenda[champ]) n'est PLUS JAMAIS
//    retraitée, même si la date est ensuite effacée ou corrigée à la main : sans ce repère, l'agenda
//    réécrirait la date à chaque tour avec la date du jour.
// Jamais non plus par-dessus une date DÉJÀ CONNUE (saisie manuelle) — le repère est alors posé quand
// même, pour que l'action ne soit plus reconsidérée. `depot` injecté : testable sans base réelle.
function appliquerDetectionsAgenda(depot, detections, aujourdHui, categoriesRdv) {
  const jour = aujourdHui || dateDuJourParis();
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
      // Déjà relevée lors d'un tour précédent : on ne repasse plus dessus, et on ne la compte pas
      // non plus dans le compte rendu (elle y reviendrait à chaque tour, pour rien).
      if (d.detectionsAgenda && d.detectionsAgenda[champ]) continue;
      d.detectionsAgenda = d.detectionsAgenda || {};
      d.detectionsAgenda[champ] = jour;
      if (d[champ]) {
        depot.remplacer(d.id, d);
        resultat.dejaRenseignes.push({ dossierId: d.id, dossierNom: d.nom, action });
        continue;
      }
      d[champ] = jour;
      d.echeancesValidees = d.echeancesValidees || {};
      d.echeancesValidees[champ] = true;
      d.historique = d.historique || [];
      d.historique.push({
        date: new Date().toISOString(),
        texte: texteHistoriqueEnvoiAgenda(action, det)
      });
      depot.remplacer(d.id, d);
      resultat.misAJour.push({ dossierId: d.id, dossierNom: d.nom, action, dateIso: jour });
    }
  }
  appliquerRendezVousAgenda(depot, detections, resultat, categoriesRdv);
  if (typeof depot.tousActifs === 'function') signalerRendezVousDisparus(depot, detections, jour);
  return resultat;
}

// Rendez-vous retiré de l'agenda (demandé par l'étude pour le suivi en direct du tableau de bord) :
// un rendez-vous de signature À VENIR dont la date avait été relevée dans l'agenda, et qu'aucun
// événement « VTE - … » confirmé ne porte plus, est signalé UNE fois dans l'historique du dossier.
// La date n'est JAMAIS effacée (voir plus haut : une absence ne prouve pas une annulation) ; le repère
// d.detectionsAgenda.rendezVousDisparu = la date signalée empêche de le redire à chaque tour, et il
// est retiré dès que le rendez-vous réapparaît (voir appliquerRendezVousAgenda).
function signalerRendezVousDisparus(depot, detections, jour) {
  const presents = new Set((detections || []).filter((det) => det.rendezVous && det.dossierId).map((det) => det.dossierId));
  for (const d of depot.tousActifs()) {
    if (!d || d.archive || !d.rendezVousSignature || d.rendezVousSignature < jour) continue;
    const reperes = d.detectionsAgenda || {};
    if (reperes.rendezVousSignature !== d.rendezVousSignature) continue;   // date saisie à la main
    if (presents.has(d.id) || reperes.rendezVousDisparu === d.rendezVousSignature) continue;
    d.detectionsAgenda = Object.assign({}, reperes, { rendezVousDisparu: d.rendezVousSignature });
    d.historique = d.historique || [];
    d.historique.push({
      date: new Date().toISOString(),
      texte: `Rendez-vous de signature du ${formatDateFr(d.rendezVousSignature)} retiré de l’agenda de l’office (supprimé, déplacé ou mis en attente) — date conservée sur la fiche`
    });
    depot.remplacer(d.id, d);
  }
}

// Rendez-vous de signature (demandé par l'étude, 25/09) : la date du PLUS PROCHE rendez-vous
// « VTE - … » confirmé (sans « ? », voir estRendezVousSignature) remplit d.rendezVousSignature.
// Contrairement aux envois, c'est la date du RENDEZ-VOUS qui est écrite, et elle suit l'agenda :
//   - champ vide → la date de l'agenda est écrite ;
//   - champ égal à la dernière date écrite par l'agenda (d.detectionsAgenda.rendezVousSignature)
//     et l'agenda dit autre chose → le rendez-vous a été déplacé, la date suit ;
//   - champ saisi à la main (différent de ce que l'agenda avait écrit) → jamais écrasé, l'écart est
//     seulement signalé dans le compte rendu ;
//   - champ déjà à la bonne date → rien, le repère est seulement posé.
// Un rendez-vous qui disparaît de l'agenda n'efface jamais la date : l'absence d'un événement ne
// dit pas qu'il est annulé (événement déplacé au-delà de la fenêtre lue, partage retiré).
// Heure, heure de fin et lieu du rendez-vous tels que lus dans l'agenda. Ne sont posés que sur un
// rendez-vous dont la DATE vient de l'agenda (ou coïncide avec lui) : une date saisie à la main et
// différente n'a pas d'horaire connu, lui en coller un serait mentir. Rend vrai si quelque chose
// a changé.
function poserHoraireRendezVous(d, det) {
  const cle = (x) => [x.rendezVousSignatureHeure, x.rendezVousSignatureHeureFin, x.rendezVousSignatureLieu,
    (x.rendezVousSignatureCategories || []).join(',')].join('|');
  const avant = cle(d);
  d.rendezVousSignatureHeure = det.heure || '';
  d.rendezVousSignatureHeureFin = det.heureFin || '';
  d.rendezVousSignatureLieu = det.lieu || '';
  // Catégories Outlook du rendez-vous (sa couleur) : le client en déduit office / visio / confrère.
  d.rendezVousSignatureCategories = Array.isArray(det.categories) ? det.categories.slice(0, 5) : [];
  return avant !== cle(d);
}

// Catégorie « annulé / à replacer » (jaune, étude 01/10) d'après le nom réglé. Pure.
function normaliserCategorie(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function rendezVousMarqueAnnule(det, categoriesRdv) {
  const nom = normaliserCategorie(categoriesRdv && categoriesRdv.annule);
  return !!nom && ((det && det.categories) || []).some((c) => normaliserCategorie(c) === nom);
}

// Signature marquée « annulé / à replacer » dans l'agenda (étude, 01/10 : le dossier revient « à
// placer ») : seulement le rendez-vous à la date de la fiche. La date quitte la fiche, gardée dans
// d.rendezVousARemplacer et l'historique ; le repère rendezVousRetire empêche l'agenda de la remettre
// tant que le rendez-vous reste jaune. Rend vrai si le dossier a changé.
function marquerSignatureAReplacer(d, det, jour) {
  if (!d || d.archive || !d.rendezVousSignature || d.rendezVousSignature !== det.dateIso) return false;
  d.rendezVousARemplacer = { date: d.rendezVousSignature, heure: d.rendezVousSignatureHeure || det.heure || '', le: jour };
  d.detectionsAgenda = d.detectionsAgenda || {};
  d.detectionsAgenda.rendezVousRetire = d.rendezVousSignature;
  delete d.detectionsAgenda.rendezVousSignature;
  d.historique = d.historique || [];
  d.historique.push({
    date: new Date().toISOString(),
    texte: `Rendez-vous de signature du ${formatDateFr(d.rendezVousSignature)} marqué « annulé / à replacer » dans l’agenda de l’office — à replacer`
  });
  d.rendezVousSignature = null;
  d.rendezVousSignatureHeure = '';
  d.rendezVousSignatureHeureFin = '';
  d.rendezVousSignatureCategories = [];
  return true;
}

// Le rendez-vous de cette date a-t-il été retiré de l'agenda Outlook par CLAIRE (note d'historique écrite au succès du retrait) il y a plus de
// 10 minutes ? Pure. @param {any} d @param {string} dateIso @param {number} [maintenant]
function retraitAgendaReussiAvant(d, dateIso, maintenant = Date.now()) {
  const attendu = `Rendez-vous de signature du ${formatDateFr(dateIso)} retiré de l'agenda Outlook de l'office.`;
  return (Array.isArray(d && d.historique) ? d.historique : []).some((h) => h && String(h.texte || '') === attendu
    && maintenant - new Date(h.date).getTime() > 10 * 60 * 1000);
}

function appliquerRendezVousAgenda(depot, detections, resultat, categoriesRdv) {
  const plusProche = new Map();
  const jour = dateDuJourParis();
  for (const det of detections || []) {
    if (!det.rendezVous || !det.dossierId || !det.dateIso) continue;
    if (rendezVousMarqueAnnule(det, categoriesRdv)) {
      const d = depot.trouverParId(det.dossierId);
      if (marquerSignatureAReplacer(d, det, jour)) {
        depot.remplacer(d.id, d);
        resultat.misAJour.push({ dossierId: d.id, dossierNom: d.nom, action: 'rendezVousARemplacer', dateIso: det.dateIso });
      }
      continue;
    }
    const actuel = plusProche.get(det.dossierId);
    if (!actuel || det.dateIso < actuel.dateIso) plusProche.set(det.dossierId, det);
  }
  for (const [dossierId, det] of plusProche) {
    const d = depot.trouverParId(dossierId);
    if (!d || d.archive) continue;
    d.detectionsAgenda = d.detectionsAgenda || {};
    const ecritParAgenda = d.detectionsAgenda.rendezVousSignature || null;
    const actuel = d.rendezVousSignature || null;
    // Rendez-vous supprimé à la main dans CLAIRE : l'agenda peut le porter encore (s'il n'a pas pu
    // être retiré d'Outlook). Il ne doit pas revenir tout seul
    // sur la fiche ; seule une AUTRE date le relève à nouveau.
    if (!actuel && d.detectionsAgenda.rendezVousRetire === det.dateIso) {
      // Sorti du jaune dans Outlook à la même date : le rendez-vous est maintenu, la fiche le reprend.
      // Retiré dans CLAIRE ET de l'agenda avec succès (historique « … retiré de l'agenda Outlook »), il y a plus de 10 minutes : un
      // rendez-vous de cette date est alors un NOUVEAU, recréé dans Outlook (étude 15/10, CHEYMOL / QUEVA & ROY : retiré le 07/10,
      // recréé le 08/10 au même jour, jamais repris) — la fiche le reprend.
      if (!(d.rendezVousARemplacer && d.rendezVousARemplacer.date === det.dateIso) && !retraitAgendaReussiAvant(d, det.dateIso)) continue;
    }
    if (actuel === det.dateIso) {
      // Même date : l'heure, l'heure de fin et le lieu suivent l'agenda (affichés dans l'agenda du
      // tableau de bord) — un rendez-vous avancé de 9 h à 11 h le même jour doit s'y voir.
      const changeHoraire = poserHoraireRendezVous(d, det);
      const revenu = Boolean(d.detectionsAgenda.rendezVousDisparu);
      if (revenu) delete d.detectionsAgenda.rendezVousDisparu;
      // Relevée dans l'agenda (repère lu par le poste : pas de seconde proposition de création, déplacements suivis), mais une
      // date posée à la main ou par CLAIRE que l'agenda CONFIRME garde `confirmeManuel` : corrigerRendezVousEcritsParAgenda ne
      // la retire jamais (audit 12/10, dossiers ROY homonymes : retirée au tour suivant puis proposée en doublon).
      const confirme = ecritParAgenda !== det.dateIso;
      if (confirme) d.detectionsAgenda.confirmeManuel = det.dateIso;
      if (ecritParAgenda !== det.dateIso || changeHoraire || revenu) {
        d.detectionsAgenda.rendezVousSignature = det.dateIso;
        depot.remplacer(d.id, d);
      }
      continue;
    }
    if (actuel && actuel !== ecritParAgenda) {
      resultat.dejaRenseignes.push({
        dossierId: d.id, dossierNom: d.nom, action: 'rendezVousSignature', dateIso: det.dateIso, dateFiche: actuel
      });
      continue;
    }
    d.rendezVousSignature = det.dateIso;
    d.detectionsAgenda.rendezVousSignature = det.dateIso;
    delete d.detectionsAgenda.confirmeManuel;
    delete d.detectionsAgenda.rendezVousDisparu;
    delete d.detectionsAgenda.rendezVousRetire;
    delete d.rendezVousARemplacer;
    poserHoraireRendezVous(d, det);
    d.historique = d.historique || [];
    d.historique.push({
      date: new Date().toISOString(),
      texte: actuel
        ? `Rendez-vous de signature déplacé au ${formatDateFr(det.dateIso)} d’après l’agenda de l’office (« ${det.reference} »)`
        : `Rendez-vous de signature du ${formatDateFr(det.dateIso)} relevé dans l’agenda de l’office (« ${det.reference} »)`
    });
    depot.remplacer(d.id, d);
    resultat.misAJour.push({
      dossierId: d.id, dossierNom: d.nom, action: 'rendezVousSignature', dateIso: det.dateIso,
      ...(actuel ? { ancienneDate: actuel } : {})
    });
  }
}

// Remet en ordre les dates de signature que l'agenda a écrites sur la MAUVAISE fiche ou trop tôt (étude
// 07/10, deux dossiers ROY) — d'après le stock de l'agenda (`evenements` d'evenementsAgendaOffice, dossiers
// archivés compris, depuis le lundi de la semaine précédente). Seule une date ÉCRITE PAR L'AGENDA
// (d.detectionsAgenda.rendezVousSignature = d.rendezVousSignature) est retirée, jamais une date posée à la
// main ou par CLAIRE :
//   - le rendez-vous de cette date est rattaché avec certitude à un AUTRE dossier (en cours ou archivé) et
//     aucun rendez-vous confirmé de ce jour ne porte ce dossier-ci → la date lui avait été donnée à tort ;
//   - le rendez-vous de ce dossier à cette date est repassé provisoire (« ? », « ??? ») → rien n'est
//     confirmé, la date quitte la fiche (elle y reviendra seule quand les « ? » seront retirés).
// Rend la liste des corrections faites.
function corrigerRendezVousEcritsParAgenda(depot, evenements, jour) {
  const corrections = [];
  const liste = Array.isArray(evenements) ? evenements : [];
  const signatures = liste.filter((e) => e && e.signature && e.dossierId && e.date && !e.option);
  for (const d of (typeof depot.tousActifs === 'function' ? depot.tousActifs() : [])) {
    if (!d || d.archive || !d.rendezVousSignature) continue;
    const date = d.rendezVousSignature;
    if (!d.detectionsAgenda || d.detectionsAgenda.rendezVousSignature !== date) continue;
    if (d.detectionsAgenda.confirmeManuel === date) continue; // posée à la main, seulement confirmée par l'agenda
    if (signatures.some((e) => e.dossierId === d.id && e.date === date)) continue;
    const autre = signatures.find((e) => e.date === date && e.dossierId !== d.id
      && String(e.heure || '') === String(d.rendezVousSignatureHeure || e.heure || ''));
    const provisoire = liste.find((e) => e && e.dossierId === d.id && e.date === date && !e.signature && !e.option
      && !e.journeeEntiere && /\?/.test(String(e.sujet || '') + ' ' + String(e.lieu || '')));
    if (!autre && !provisoire) continue;
    const texte = autre
      ? `Rendez-vous de signature du ${formatDateFr(date)} retiré de la fiche : dans l’agenda, il est celui d’un autre dossier (« ${String(autre.sujet || '').slice(0, 80)} »)`
      : `Rendez-vous du ${formatDateFr(date)} repassé provisoire dans l’agenda (« ? ») — date retirée de la fiche, elle reviendra une fois le rendez-vous confirmé`;
    d.rendezVousSignature = null;
    d.rendezVousSignatureHeure = '';
    d.rendezVousSignatureHeureFin = '';
    d.rendezVousSignatureLieu = '';
    d.rendezVousSignatureCategories = [];
    delete d.detectionsAgenda.rendezVousSignature;
    delete d.detectionsAgenda.rendezVousDisparu;
    d.historique = d.historique || [];
    d.historique.push({ date: new Date().toISOString(), texte });
    depot.remplacer(d.id, d);
    corrections.push({ dossierId: d.id, dossierNom: d.nom, dateIso: date, raison: autre ? 'autre-dossier' : 'provisoire', jour });
  }
  return corrections;
}

let empreinteRefusee = null;

function empreinteIdentifiants(reglages) {
  const r = reglages || {};
  return crypto.createHash('sha256')
    .update([r.url, r.email, r.motDePasse, r.calendrierPartage].map((v) => String(v || '')).join('\u0000'))
    .digest('hex');
}

function lectureAgendaSuspendue(reglagesExchange) {
  return empreinteRefusee !== null && empreinteRefusee === empreinteIdentifiants(reglagesExchange);
}

// Un autre lecteur du même compte (sondages de créneaux) a essuyé un refus : même disjoncteur.
function signalerIdentifiantsRefuses(reglagesExchange) {
  empreinteRefusee = empreinteIdentifiants(reglagesExchange);
}

// Tests seulement : le disjoncteur est un état du module.
function reinitialiserDisjoncteurAgenda() {
  empreinteRefusee = null;
}

function connexionAgendaConfiguree(reglagesExchange) {
  const r = reglagesExchange || {};
  return Boolean(r.actif && r.url && r.email && r.motDePasse);
}

// Un seul tour de lecture : lit le calendrier, détecte, applique. `injections.poster` : faux
// transport EWS (tests) — jamais utilisé en production.
async function executerTourSurveillanceAgenda(depot, reglagesExchange, injections) {
  const resultat = {
    ok: false, dossiersVerifies: 0, evenementsLus: 0, misAJour: [], dejaRenseignes: [], sansCorrespondance: [],
    absences: [], categories: [], agendaDuJour: null, agendaOffice: null, echeancesPosees: [], erreurEcheances: null, erreur: null, identifiantsRefuses: false
  };
  const r = reglagesExchange || {};
  if (!connexionAgendaConfiguree(r)) {
    resultat.erreur = "La connexion à l'agenda Outlook n'est pas configurée (Réglages › Agenda).";
    return resultat;
  }
  try {
    const jour = dateDuJourParis();
    const lu = await lireCalendrierExchange({
      // Depuis le lundi de la semaine précédente (page Agenda) ; les détections, elles, ne
      // retiennent que les rendez-vous d'aujourd'hui ou postérieurs.
      url: r.url, email: r.email, motDePasse: r.motDePasse, mailbox: r.calendrierPartage, aujourdHui: lundiSemainePrecedente(jour)
    }, injections);
    if (!lu.ok) {
      resultat.erreur = lu.message;
      resultat.identifiantsRefuses = lu.raison === 'auth';
      return resultat;
    }
    const evenements = evenementsDepuisEws(lu.evenements);
    resultat.evenementsLus = evenements.length;
    // Dossiers archivés compris (étude 07/10) : un rendez-vous d'un dossier archivé retrouve sa fiche au
    // lieu d'aller à un dossier en cours du même nom ; rien n'est jamais ÉCRIT sur un archivé (voir
    // appliquerDetectionsAgenda) et un archivé n'est candidat que jusqu'à sa signature (agendaOffice.js).
    const dossiersActifs = depot.tousActifs();
    resultat.dossiersVerifies = dossiersActifs.filter((d) => !d.archive).length;
    const detections = actionsDetecteesDepuisEvenements(evenements, dossiersActifs, jour);
    const applique = appliquerDetectionsAgenda(depot, detections, jour, r.categoriesRdv);
    resultat.ok = true;
    resultat.misAJour = applique.misAJour;
    resultat.dejaRenseignes = applique.dejaRenseignes;
    resultat.sansCorrespondance = applique.sansCorrespondance;
    // Absences des collaborateurs (voir absencesDepuisEvenements) : lues au même passage, persistées
    // à part par l'appelant (executerEtEnregistrerTourAgenda) — rattachées à aucun dossier.
    resultat.absences = absencesDepuisEvenements(evenements, jour);
    resultat.categories = categoriesDistinctes(evenements);
    // Les rendez-vous du jour, pour la fenêtre du matin (persistés à part, comme les absences).
    resultat.agendaDuJour = { jour, evenements: agendaDuJourDepuisEvenements(evenements, jour, dossiersActifs) };
    resultat.agendaOffice = { debut: lundiSemainePrecedente(jour), evenements: evenementsAgendaOffice(evenements, dossiersActifs) };
    resultat.corrections = corrigerRendezVousEcritsParAgenda(depot, resultat.agendaOffice.evenements, jour);
    // Dates butoir (prêt, vente préalable) pas encore dans l'agenda : posées ou retrouvées, avec
    // la lecture qu'on vient de faire pour ne jamais créer de doublon (voir echeancesAgenda.js).
    const poses = await poserEcheancesManquantes(depot, r, lu.evenements, jour, injections);
    resultat.echeancesPosees = poses.posees;
    resultat.erreurEcheances = poses.erreur;
    if (poses.identifiantsRefuses) resultat.identifiantsRefuses = true;
  } catch (e) {
    resultat.erreur = e.message;
  }
  return resultat;
}

// Un tour, ET son compte rendu persisté — appelé par le minuteur automatique comme par le bouton
// « Tester maintenant » des Réglages (voir routes/agenda.js). Un tour AUTOMATIQUE ne se lance pas
// quand le disjoncteur est ouvert pour ces identifiants (rend { suspendu: true }, rien n'est écrit) ;
// un tour MANUEL est toujours tenté — c'est un essai demandé par une personne.
async function executerEtEnregistrerTourAgenda(depot, parametresRepo, injections, declenche) {
  const reglages = parametresRepo.lireReglagesExchange();
  const manuel = declenche === 'manuel';
  if (!manuel && lectureAgendaSuspendue(reglages)) return { ok: false, suspendu: true };
  // Heure du DÉBUT de la lecture : un rendez-vous créé pendant qu'elle tourne peut manquer à la liste ; « lu » ne doit donc pas
  // dater d'après (audit 12/10 : options d'un sondage créées pendant la lecture → la dernière « restée seule » était placée).
  const debutLecture = new Date().toISOString();
  // Calendrier lu au tour précédent (null : inconnu, lecture d'avant le 12/10) — voir synchroniserTachesAgenda.
  const precedent = typeof parametresRepo.lireAgendaOffice === 'function' ? parametresRepo.lireAgendaOffice() : null;
  const calendrierAvant = precedent && precedent.calendrier ? precedent.calendrier : null;
  const resultat = await executerTourSurveillanceAgenda(depot, reglages, injections);
  if (resultat.identifiantsRefuses) empreinteRefusee = empreinteIdentifiants(reglages);
  else if (resultat.ok) empreinteRefusee = null;
  // Les absences remplacent la liste précédente à chaque tour réussi (l'agenda fait foi) ; un tour en
  // échec ne les efface pas — la dernière liste connue reste affichée.
  if (resultat.ok && resultat.evenementsLus > 0) noterVerification(parametresRepo, 'lecture-xml-exchange', { detail: resultat.evenementsLus + ' rendez-vous lus' });
  if (resultat.ok) parametresRepo.ecrireAbsencesAgenda(resultat.absences || []);
  if (resultat.ok && typeof parametresRepo.ecrireCategoriesAgenda === 'function') {
    parametresRepo.ecrireCategoriesAgenda(resultat.categories || []);
  }
  if (resultat.ok && resultat.agendaDuJour && typeof parametresRepo.ecrireAgendaDuJour === 'function') {
    parametresRepo.ecrireAgendaDuJour({ ...resultat.agendaDuJour, lu: new Date().toISOString() });
  }
  if (resultat.ok && resultat.agendaOffice && typeof parametresRepo.ecrireAgendaOffice === 'function') {
    parametresRepo.ecrireAgendaOffice({ ...resultat.agendaOffice, lu: debutLecture, calendrier: String(reglages.calendrierPartage || reglages.email || '') });
  }
  // Rendez-vous rouges « JV - … » : tâches du collaborateur dans « Mes rappels » (voir tachesAgenda.js).
  if (resultat.ok && resultat.agendaOffice && typeof parametresRepo.lireRappelsPerso === 'function') {
    try {
      const avant = parametresRepo.lireRappelsPerso();
      const apres = synchroniserTachesAgenda(avant, resultat.agendaOffice.evenements, resultat.agendaOffice.debut, undefined,
        { calendrierChange: calendrierAvant !== null && calendrierAvant !== String(reglages.calendrierPartage || reglages.email || '') });
      if (JSON.stringify(apres) !== JSON.stringify(avant)) parametresRepo.ecrireRappelsPerso(apres);
      const dejaFaites = new Set(avant.filter((r) => r && r.fait).map((r) => r.id));
      const cochees = apres.filter((r) => r && r.agendaItemId && r.fait && r.agendaSupprimeLe && !dejaFaites.has(r.id)).length;
      if (cochees) noterVerification(parametresRepo, 'tache-agenda-supprimee-cochee', { detail: cochees + ' tâche(s) cochée(s)' });
    } catch (e) {
      console.warn('Tâches de l’agenda non relevées :', e.message);
    }
  }
  if (resultat.ok) await notifierRendezVousRelevesAgenda(depot, parametresRepo, resultat.misAJour, injections);
  const { absences, categories, agendaDuJour, agendaOffice, ...compteRendu } = resultat;
  const calendrier = reglages.calendrierPartage || reglages.email || '';
  parametresRepo.ecrireDernierTourAgenda({
    ...compteRendu,
    calendrier,
    at: new Date().toISOString(),
    declenche: manuel ? 'manuel' : 'automatique'
  });
  return { ...compteRendu, calendrier };
}

// Signatures placées, déplacées ou marquées « annulé / à replacer » DANS OUTLOOK, relevées par ce
// tour (étude, 01/10 : prévenir le responsable sur Teams). Ce que CLAIRE a fait elle-même n'arrive
// jamais ici : la fiche porte déjà la date, le tour ne change rien. Un envoi impossible n'arrête
// jamais le tour. `injections.envoyer` : faux envoi (tests).
async function notifierRendezVousRelevesAgenda(depot, parametresRepo, misAJour, injections) {
  const actions = (misAJour || []).filter((m) => m && (m.action === 'rendezVousSignature' || m.action === 'rendezVousARemplacer'));
  if (!actions.length || typeof parametresRepo.lireReglages !== 'function') return;
  const reglages = parametresRepo.lireReglages();
  if (!envoiConfigure(reglages)) return;
  const envoyer = (injections && injections.envoyer) || envoyerEmail;
  for (const m of actions) {
    const d = depot.trouverParId(m.dossierId);
    if (!d || d.archive || !d.responsable) continue;
    const aReplacer = m.action === 'rendezVousARemplacer';
    const message = texteRendezVousAgenda({
      dossierNom: libelleDossier(d), action: aReplacer ? 'aReplacer' : 'place', date: m.dateIso,
      heure: aReplacer ? (d.rendezVousARemplacer && d.rendezVousARemplacer.heure) : d.rendezVousSignatureHeure,
      ancienneDate: m.ancienneDate || ''
    });
    try {
      await envoyerAuResponsable(parametresRepo, envoyer, reglages, d.responsable, message);
    } catch (e) {
      console.warn('[CLAIRE] Notification Teams du rendez-vous impossible :', e.message);
    }
  }
}

// 2 minutes (étude, 30/09 : « la récupération de l'agenda toutes les 2 minutes », pour que la page
// Agenda et la fenêtre du matin suivent Outlook de près ; 15 min auparavant). Un tour = trois
// FindItem en lecture (plus, rarement, la pose d'une date butoir manquante) ; le disjoncteur sur
// identifiants refusés reste la garde contre le verrouillage du compte : un seul refus suspend la
// lecture automatique jusqu'à la correction du mot de passe.
const INTERVALLE_SURVEILLANCE_AGENDA_MS = 2 * 60 * 1000;

function demarrerSurveillanceAgenda(depot, parametresRepo, injections, intervalleMs) {
  // Même garde-fou que la surveillance du NAS : un tour plus lent que l'intervalle (agenda
  // volumineux, réseau lent) ne doit jamais en voir un second démarrer par-dessus.
  let enCours = false;
  const tour = async () => {
    if (enCours) return;
    const reglages = parametresRepo.lireReglagesExchange();
    if (!connexionAgendaConfiguree(reglages) || lectureAgendaSuspendue(reglages)) return;
    enCours = true;
    try {
      await executerEtEnregistrerTourAgenda(depot, parametresRepo, injections, 'automatique');
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
  appliquerDetectionsAgenda, texteHistoriqueEnvoiAgenda, appliquerRendezVousAgenda, corrigerRendezVousEcritsParAgenda, rendezVousMarqueAnnule, marquerSignatureAReplacer, dateDuJourParis, executerTourSurveillanceAgenda,
  executerEtEnregistrerTourAgenda, notifierRendezVousRelevesAgenda, demarrerSurveillanceAgenda, INTERVALLE_SURVEILLANCE_AGENDA_MS,
  connexionAgendaConfiguree, lectureAgendaSuspendue, reinitialiserDisjoncteurAgenda, signalerIdentifiantsRefuses
};
