'use strict';

// Dates butoir (obtention du prêt, vente préalable) tenues dans le calendrier partagé de Sophie.
//
// Depuis le 29/09, c'est la SEULE voie : le flux .ics que CLAIRE publiait pour un abonnement
// Outlook est supprimé (demande de l'étude : « passe par la connexion de l'agenda partagé »). Le
// client pose, déplace et retire l'événement au moment où l'étude touche la date (voir
// synchroniserEcheanceAgenda dans script.js) ; ce module, appelé à chaque tour de lecture de
// l'agenda (agendaWatch.js), pose ce qui MANQUE encore : les dossiers existants jamais repris, et
// une création qui a échoué côté client.
//
// Garde-fous contre le doublon — un doublon dans l'agenda de l'office est pire qu'une date posée
// un tour plus tard :
//   - l'agenda vient d'être lu : un événement « toute la journée » portant EXACTEMENT le titre que
//     CLAIRE compose, à la même date, est ADOPTÉ (son identifiant est gardé sur le dossier) au lieu
//     d'en créer un second — c'est le cas d'un identifiant perdu, ou d'une création faite par un
//     poste pendant ce tour ;
//   - un dossier modifié il y a moins de DELAI_APRES_MODIFICATION_MS n'est pas créé : le poste qui
//     vient de saisir la date est sans doute en train de poser l'événement lui-même ;
//   - seules les dates d'aujourd'hui ou à venir, les seules que la lecture couvre (une date passée
//     ne pourrait pas être adoptée).
// Un seul essai par création, arrêt au premier échec (un refus d'identifiants ne se représente pas),
// et au plus MAX_CREATIONS_PAR_TOUR créations par tour pour étaler la reprise initiale.

const { echeanceValidee } = require('./jobs/rappels');
const { momentParisDepuisIso, formatDateFr } = require('./agendaOffice');
const { creerEcheanceExchange, supprimerEcheanceExchange } = require('./exchange/ews');

const LIBELLES_ECHEANCE_AGENDA = { pret: 'Obtention du prêt', ventebien: 'Vente préalable' };
const CORPS_ECHEANCE_AGENDA = {
  pret: 'Date butoir posée par CLAIRE. Retirée automatiquement une fois l’offre de prêt reçue.',
  ventebien: 'Date butoir posée par CLAIRE. Retirée automatiquement une fois la vente préalable signée.'
};
const DELAI_APRES_MODIFICATION_MS = 5 * 60 * 1000;
const MAX_CREATIONS_PAR_TOUR = 25;

// Même logique que extraireNomAcquereur() côté client (nom « VENDEUR(S) / ACQUÉREUR(S) »).
function extraireNomAcquereur(nomDossier) {
  const parties = String(nomDossier || '').split(' / ');
  return parties.length > 1 ? parties[1].trim() : nomDossier;
}

// Titre de l'événement — identique à celui que compose le client (synchroniserEcheanceAgenda).
// Jamais « VTE - … » : la lecture de l'agenda le prendrait pour un rendez-vous de signature.
function sujetEcheanceAgenda(d, type) {
  return `${LIBELLES_ECHEANCE_AGENDA[type]} — ${extraireNomAcquereur(d.nom)} - Dossier ${d.nom}`;
}

// La date doit figurer dans l'agenda : renseignée, pas un achat comptant, pas encore obtenue
// (offre reçue, vente préalable réalisée), dossier actif. Miroir d'echeanceAgendaSouhaitee (client).
function echeanceAgendaSouhaitee(d, type) {
  if (!d || d.archive || !LIBELLES_ECHEANCE_AGENDA[type]) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d[type] || ''))) return false;
  if (type === 'pret' && d.sansPret) return false;
  return !echeanceValidee(d, type);
}

// Pure : ce qu'il faut faire pour chaque date butoir souhaitée et pas encore posée.
// `evenementsEws` : les rendez-vous tels que rendus par parseCalendrierEws (lecture du même tour).
// Rend [{ dossierId, type, date, sujet, action: 'adopter'|'creer', itemId?, changeKey? }].
function planPoseEcheances(dossiers, evenementsEws, aujourdHui, maintenantMs) {
  const plan = [];
  // Journées entières lisibles, avec leur date à Paris calculée une fois (pas à chaque dossier).
  const journees = (evenementsEws || [])
    .filter((e) => e && e.allDay && !e.cancelled && e.itemId)
    .map((e) => ({ e, date: (momentParisDepuisIso(e.start) || {}).date }))
    .filter((x) => x.date);
  for (const d of dossiers || []) {
    for (const type of Object.keys(LIBELLES_ECHEANCE_AGENDA)) {
      if (!echeanceAgendaSouhaitee(d, type)) continue;
      const pose = d.agendaEcheances && d.agendaEcheances[type];
      if (pose && pose.itemId) continue;
      const date = d[type];
      if (aujourdHui && date < aujourdHui) continue;
      const sujet = sujetEcheanceAgenda(d, type);
      const existant = journees.find((x) => x.e.subject === sujet && x.date === date);
      if (existant) {
        plan.push({ dossierId: d.id, type, date, sujet, action: 'adopter', itemId: existant.e.itemId, changeKey: existant.e.changeKey || '' });
        continue;
      }
      const majLe = Number(d.updatedAt);
      if (Number.isFinite(majLe) && maintenantMs - majLe < DELAI_APRES_MODIFICATION_MS) continue;
      plan.push({ dossierId: d.id, type, date, sujet, action: 'creer' });
    }
  }
  return plan;
}

// Applique le plan : adopte sans rien écrire dans l'agenda, crée un événement sinon. Chaque
// dossier est relu juste avant d'être écrit (un poste a pu le modifier entre-temps) et le geste
// est abandonné si la date a changé ou si un identifiant est apparu.
// Rend { posees: [{ dossierId, dossierNom, type, date, adoptee }], erreur, identifiantsRefuses }.
async function poserEcheancesManquantes(depot, reglagesExchange, evenementsEws, aujourdHui, injections, maintenantMs) {
  const r = reglagesExchange || {};
  const resultat = { posees: [], erreur: null, identifiantsRefuses: false };
  const dossiers = depot.tousActifs().filter((d) => !d.archive);
  const plan = planPoseEcheances(dossiers, evenementsEws, aujourdHui, maintenantMs == null ? Date.now() : maintenantMs);
  let creations = 0;
  for (const etape of plan) {
    if (etape.action === 'creer' && creations >= MAX_CREATIONS_PAR_TOUR) break;
    const avant = depot.trouverParId(etape.dossierId);
    if (!avant || avant.archive || avant[etape.type] !== etape.date) continue;
    if (avant.agendaEcheances && avant.agendaEcheances[etape.type] && avant.agendaEcheances[etape.type].itemId) continue;
    let itemId = etape.itemId;
    let changeKey = etape.changeKey;
    if (etape.action === 'creer') {
      creations++;
      const cree = await creerEcheanceExchange({
        url: r.url, email: r.email, motDePasse: r.motDePasse,
        echeance: { sujet: etape.sujet, dateStr: etape.date, corps: CORPS_ECHEANCE_AGENDA[etape.type], mailbox: r.calendrierPartage }
      }, injections);
      if (!cree.ok || !cree.itemId) {
        resultat.erreur = cree.message || "La date n'a pas pu être posée dans l'agenda.";
        resultat.identifiantsRefuses = cree.raison === 'auth';
        break;
      }
      itemId = cree.itemId;
      changeKey = cree.changeKey || '';
    }
    // Relu après l'appel réseau : la création a pris du temps, le dossier a pu changer.
    const d = depot.trouverParId(etape.dossierId);
    if (!d) continue;
    d.agendaEcheances = Object.assign({}, d.agendaEcheances, { [etape.type]: { itemId, changeKey, date: etape.date } });
    d.historique = Array.isArray(d.historique) ? d.historique : [];
    d.historique.push({
      date: new Date().toISOString(),
      texte: etape.action === 'adopter'
        ? `« ${LIBELLES_ECHEANCE_AGENDA[etape.type]} » retrouvée dans l’agenda Outlook (${formatDateFr(etape.date)})`
        : `« ${LIBELLES_ECHEANCE_AGENDA[etape.type]} » posée dans l’agenda Outlook (${formatDateFr(etape.date)})`
    });
    depot.remplacer(d.id, d);
    resultat.posees.push({ dossierId: d.id, dossierNom: d.nom, type: etape.type, date: etape.date, adoptee: etape.action === 'adopter' });
  }
  return resultat;
}

// Pure : pourquoi l'événement d'une date butoir n'a plus lieu d'être, dit dans l'historique ('' : il doit rester).
function raisonRetraitEcheance(d, type) {
  if (!d) return '';
  if (d.archive) return 'dossier archivé';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d[type] || ''))) return 'date effacée';
  if (type === 'pret' && d.sansPret) return 'pas de prêt';
  if (type === 'pret' && d.offrePretStatut === 'recue') return 'offre de prêt reçue';
  if (echeanceValidee(d, type)) return type === 'pret' ? 'offre de prêt reçue' : 'vente préalable réalisée';
  return '';
}

// L'événement posé par CLAIRE (identifiant gardé sur le dossier) est RETIRÉ de l'agenda dès que la condition est levée — offre de prêt
// reçue (relevée par le NAS, un email, Authentic… sans geste d'un poste), vente préalable réalisée, date effacée, dossier archivé
// (étude 15/10 : « si prêt reçu : retirer le rappel sur l'agenda »). Avant, seul un poste en marche le retirait, à son démarrage ou à son
// geste. Jamais d'événement deviné d'après son titre ; MoveToDeletedItems (SoftDelete en repli), un événement déjà effacé à la main vaut
// retrait fait ; un dossier modifié depuis moins de 5 minutes est laissé au poste qui vient d'agir ; arrêt au premier échec.
// Rend { retirees: [{ dossierId, dossierNom, type, raison }], erreur, identifiantsRefuses }.
async function retirerEcheancesLevees(depot, reglagesExchange, injections, maintenantMs) {
  const r = reglagesExchange || {};
  const maintenant = maintenantMs == null ? Date.now() : maintenantMs;
  const resultat = { retirees: [], erreur: null, identifiantsRefuses: false };
  let essais = 0;
  for (const d0 of depot.tousActifs()) {
    for (const type of Object.keys(LIBELLES_ECHEANCE_AGENDA)) {
      const pose = d0.agendaEcheances && d0.agendaEcheances[type];
      if (!pose || !pose.itemId || !raisonRetraitEcheance(d0, type)) continue;
      const majLe = Number(d0.updatedAt);
      if (Number.isFinite(majLe) && maintenant - majLe < DELAI_APRES_MODIFICATION_MS) continue;
      if (essais >= MAX_CREATIONS_PAR_TOUR) return resultat;
      essais++;
      const sup = await supprimerEcheanceExchange({ url: r.url, email: r.email, motDePasse: r.motDePasse, itemId: pose.itemId, changeKey: pose.changeKey || '' }, injections);
      if (!sup.ok) {
        resultat.erreur = sup.message || "L'événement n'a pas pu être retiré de l'agenda.";
        resultat.identifiantsRefuses = sup.raison === 'auth';
        return resultat;
      }
      // Relu après l'appel réseau : un poste a pu changer le dossier entre-temps.
      const d = depot.trouverParId(d0.id);
      if (!d || !d.agendaEcheances || !d.agendaEcheances[type] || d.agendaEcheances[type].itemId !== pose.itemId) continue;
      const raison = raisonRetraitEcheance(d, type) || raisonRetraitEcheance(d0, type);
      delete d.agendaEcheances[type];
      d.historique = Array.isArray(d.historique) ? d.historique : [];
      d.historique.push({ date: new Date().toISOString(), texte: `« ${LIBELLES_ECHEANCE_AGENDA[type]} » retirée de l’agenda Outlook (${raison})` });
      depot.remplacer(d.id, d);
      resultat.retirees.push({ dossierId: d.id, dossierNom: d.nom, type, raison });
    }
  }
  return resultat;
}

module.exports = {
  LIBELLES_ECHEANCE_AGENDA, CORPS_ECHEANCE_AGENDA, DELAI_APRES_MODIFICATION_MS, MAX_CREATIONS_PAR_TOUR,
  extraireNomAcquereur, sujetEcheanceAgenda, echeanceAgendaSouhaitee, planPoseEcheances, poserEcheancesManquantes, retirerEcheancesLevees, raisonRetraitEcheance
};
