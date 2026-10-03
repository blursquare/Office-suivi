'use strict';

// Écran Réglages › Agenda : compte rendu de la lecture de l'agenda de l'office (voir
// agendaOffice.js/agendaWatch.js) — montée derrière l'authentification comme le reste de /api. La
// lecture passe par la connexion Exchange (routes/exchange.js) : aucun réglage propre ici.
//
// `options` porte `{ depot, poster }` : `depot` est nécessaire au seul déclenchement manuel d'un
// tour (« Tester maintenant ») — sans lui la route répond 503 plutôt que de planter. `poster`
// (faux transport EWS) est réservé aux tests.

const express = require('express');
const { executerEtEnregistrerTourAgenda, connexionAgendaConfiguree, lectureAgendaSuspendue, signalerIdentifiantsRefuses, dateDuJourParis } = require('../agendaWatch');
const { evenementsDepuisEws, compterRendezVousPeriode, REGLE_COMPTAGE_RENDEZ_VOUS, lundiAnneePrecedente, decalerJours, ecartRendezVous, moisDePeriode, archiveAgendaARelire, evenementsAgendaOffice, compterActesAgendaPeriode, periodesActesAnnee } = require('../agendaOffice');
const { lireCalendrierExchange } = require('../exchange/ews');
const { noterVerification } = require('../verificationsTerrain');

// Une semaine de l'an dernier relue au plus une fois tous les 7 jours (elle ne change presque plus).
const FRAICHEUR_COMPARAISON_MS = 7 * 24 * 3600 * 1000;

function creerRouteurAgenda(parametresRepo, options) {
  const routeur = express.Router();
  const { depot, poster } = options || {};
  const injections = poster ? { poster } : undefined;

  // État de la source, sans aucun identifiant : le calendrier lu (adresse de boîte, pas un secret)
  // et si la lecture automatique est suspendue après un refus d'identifiants.
  function source() {
    const r = typeof parametresRepo.lireReglagesExchange === 'function' ? parametresRepo.lireReglagesExchange() : {};
    return {
      configuree: connexionAgendaConfiguree(r),
      calendrier: r.calendrierPartage || r.email || '',
      suspendue: connexionAgendaConfiguree(r) && lectureAgendaSuspendue(r)
    };
  }

  routeur.get('/agenda', (req, res) => {
    res.json({
      source: source(),
      dernierTour: parametresRepo.lireDernierTourAgenda(),
      // Absences des collaborateurs lues dans l'agenda (voir absencesDepuisEvenements) : l'agenda du
      // tableau de bord les affiche et signale les rendez-vous d'un collaborateur absent ce jour-là.
      absences: parametresRepo.lireAbsencesAgenda(),
      // Catégories Outlook vues dans l'agenda : suggestions pour régler les couleurs des rendez-vous.
      categories: typeof parametresRepo.lireCategoriesAgenda === 'function' ? parametresRepo.lireCategoriesAgenda() : [],
      // Rendez-vous du jour (fenêtre du matin) : { jour, lu, evenements }, null avant le premier tour.
      agendaDuJour: typeof parametresRepo.lireAgendaDuJour === 'function' ? parametresRepo.lireAgendaDuJour() : null
    });
  });

  // Page Agenda : les rendez-vous gardés du dernier tour de lecture entre `debut` et `fin` (AAAA-MM-JJ,
  // bornes comprises ; un événement de plusieurs jours qui chevauche la période est rendu).
  routeur.get('/agenda/evenements', (req, res) => {
    const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
    const debut = date(req.query.debut);
    const fin = date(req.query.fin);
    if (!debut || !fin || fin < debut) return res.status(400).json({ erreur: 'Période invalide (debut et fin au format AAAA-MM-JJ).' });
    const agenda = typeof parametresRepo.lireAgendaOffice === 'function' ? parametresRepo.lireAgendaOffice() : null;
    const evenements = ((agenda && agenda.evenements) || []).filter((e) => e.date <= fin && (e.dateFin || e.date) >= debut);
    res.json({ lu: (agenda && agenda.lu) || '', debutLu: (agenda && agenda.debut) || '', source: source(), evenements });
  });

  // Historique de l'agenda (étude, 01/10 : « remonter jusqu'au 1er janvier de l'année, si possible tous
  // les rendez-vous de toutes les années si ce n'est pas trop lourd »). Le stock du tour de lecture part
  // du lundi de la semaine dernière ; avant, chaque MOIS affiché est lu à la demande dans Exchange (une
  // tranche, un seul essai, jamais pendant la suspension après un refus d'identifiants), puis gardé en
  // base sous sa propre clé — un mois passé n'est plus relu une fois stabilisé (archiveAgendaARelire).
  // On ne lit donc que ce qu'on regarde : aucune lecture massive de toutes les années. 3 mois au plus
  // par appel (la vue Mois en couvre au plus 2).
  const lecturesArchive = new Map();
  // Un mois lu dans Exchange (une tranche, un seul essai) puis gardé : { archive } ou { message }.
  // Deux demandes du même mois en même temps partagent la même lecture.
  async function lireMoisArchive(m, r) {
    if (!lecturesArchive.has(m)) {
      const [a, n] = m.split('-').map(Number);
      const jours = new Date(Date.UTC(a, n, 0)).getUTCDate();
      lecturesArchive.set(m, lireCalendrierExchange({
        url: r.url, email: r.email, motDePasse: r.motDePasse, mailbox: r.calendrierPartage,
        aujourdHui: `${m}-01`, tranches: 1, jours
      }, injections).finally(() => lecturesArchive.delete(m)));
    }
    const lu = await lecturesArchive.get(m);
    if (lu && lu.ok) {
      const dossiersConnus = depot ? depot.tousActifs() : [];
      return {
        archive: parametresRepo.ecrireArchiveAgenda(m, {
          lu: new Date().toISOString(),
          evenements: evenementsAgendaOffice(evenementsDepuisEws(lu.evenements), dossiersConnus).filter((e) => e.date.slice(0, 7) === m)
        })
      };
    }
    if (lu && lu.raison === 'auth') signalerIdentifiantsRefuses(r);
    return { message: (lu && lu.message) || "L'historique n'a pas pu être lu dans l'agenda." };
  }
  routeur.get('/agenda/passe', async (req, res) => {
    const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
    const debut = date(req.query.debut);
    let fin = date(req.query.fin);
    if (!debut || !fin || fin < debut || debut < '2000-01-01') return res.status(400).json({ erreur: 'Période invalide.' });
    const agenda = typeof parametresRepo.lireAgendaOffice === 'function' ? parametresRepo.lireAgendaOffice() : null;
    const limite = agenda && agenda.debut;
    if (!limite) return res.json({ evenements: [], limite: '', message: "L'agenda n'a pas encore été lu par le serveur." });
    const veilleLimite = decalerJours(limite, -1);
    if (fin > veilleLimite) fin = veilleLimite;
    if (debut > fin) return res.json({ evenements: [], limite, message: '' });
    const mois = moisDePeriode(debut, fin);
    if (mois.length > 3) return res.status(400).json({ erreur: 'Trois mois au plus à la fois.' });
    const r = typeof parametresRepo.lireReglagesExchange === 'function' ? parametresRepo.lireReglagesExchange() : {};
    const lisible = connexionAgendaConfiguree(r) && !lectureAgendaSuspendue(r);
    let message = '';
    const evenements = [];
    for (const m of mois) {
      let archive = parametresRepo.lireArchiveAgenda(m);
      if (archiveAgendaARelire(archive, m, Date.now()) && lisible && !message) {
        const lu = await lireMoisArchive(m, r);
        if (lu.archive) archive = lu.archive;
        else message = lu.message;
      }
      if (!archive && !lisible && !message) {
        message = !connexionAgendaConfiguree(r) ? "Connexion à l'agenda Outlook à configurer." : "Lecture de l'agenda suspendue après un refus des identifiants.";
      }
      for (const e of (archive && archive.evenements) || []) {
        if (e.date <= fin && (e.dateFin || e.date) >= debut) evenements.push(e);
      }
    }
    res.json({ evenements, limite, message });
  });

  // Comparaison avec la même semaine l'an dernier (étude, 01/10). `lundi` = la semaine affichée.
  // Cette semaine : le stock du dernier tour de lecture. L'an dernier : lu UNE fois dans Exchange
  // (une tranche de 6 jours, un seul essai, jamais pendant que la lecture est suspendue après un
  // refus d'identifiants), puis gardé en base. Rend { actuel, anPasse, lundiAnPasse, ecart, pourcent }
  // — un compte inconnu vaut null, jamais 0.
  const lecturesEnCours = new Map();
  routeur.get('/agenda/comparaison', async (req, res) => {
    const lundi = String((req.query || {}).lundi || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lundi) || new Date(lundi + 'T12:00:00Z').getUTCDay() !== 1) {
      return res.status(400).json({ erreur: 'Semaine invalide (le lundi, au format AAAA-MM-JJ).' });
    }
    const samedi = decalerJours(lundi, 5);
    const agenda = typeof parametresRepo.lireAgendaOffice === 'function' ? parametresRepo.lireAgendaOffice() : null;
    const couvert = agenda && agenda.debut && agenda.debut <= lundi;
    const actuel = couvert ? compterRendezVousPeriode(agenda.evenements, lundi, samedi) : null;
    const lundiAnPasse = lundiAnneePrecedente(lundi);
    const samediAnPasse = decalerJours(lundiAnPasse, 5);
    const memoire = parametresRepo.lireComparaisonAgenda();
    // Une semaine comptée sous une autre règle (avant la durée d'une heure) n'est pas montrée : elle
    // est relue une fois (jamais deux règles comparées entre elles).
    let anPasse = memoire[lundiAnPasse] && memoire[lundiAnPasse].regle === REGLE_COMPTAGE_RENDEZ_VOUS ? memoire[lundiAnPasse] : null;
    let message = '';
    const frais = anPasse && Date.now() - Date.parse(anPasse.lu || 0) < FRAICHEUR_COMPARAISON_MS;
    const r = typeof parametresRepo.lireReglagesExchange === 'function' ? parametresRepo.lireReglagesExchange() : {};
    if (!frais && connexionAgendaConfiguree(r) && !lectureAgendaSuspendue(r)) {
      if (!lecturesEnCours.has(lundiAnPasse)) {
        lecturesEnCours.set(lundiAnPasse, lireCalendrierExchange({
          url: r.url, email: r.email, motDePasse: r.motDePasse, mailbox: r.calendrierPartage,
          aujourdHui: lundiAnPasse, tranches: 1, jours: 6
        }, injections).finally(() => lecturesEnCours.delete(lundiAnPasse)));
      }
      const lu = await lecturesEnCours.get(lundiAnPasse);
      if (lu && lu.ok) {
        anPasse = { ...compterRendezVousPeriode(evenementsDepuisEws(lu.evenements), lundiAnPasse, samediAnPasse), lu: new Date().toISOString(), regle: REGLE_COMPTAGE_RENDEZ_VOUS };
        parametresRepo.ecrireComparaisonAgenda({ ...parametresRepo.lireComparaisonAgenda(), [lundiAnPasse]: anPasse });
      } else if (lu) {
        if (lu.raison === 'auth') signalerIdentifiantsRefuses(r);
        message = lu.message || '';
      }
    }
    if (!anPasse && !message) {
      message = !connexionAgendaConfiguree(r) ? "Connexion à l'agenda Outlook à configurer."
        : lectureAgendaSuspendue(r) ? "Lecture de l'agenda suspendue après un refus des identifiants." : '';
    }
    const ecart = actuel && anPasse ? ecartRendezVous(actuel.rendezVous, anPasse.rendezVous) : null;
    res.json({
      lundi, lundiAnPasse, actuel, anPasse: anPasse ? { rendezVous: anPasse.rendezVous, signatures: anPasse.signatures } : null,
      ecart: ecart ? ecart.ecart : null, pourcent: ecart ? ecart.pourcent : null, message
    });
  });

  // Actes de l'année d'après l'agenda partagé (étude, 03/10) : ventes, successions et donations de
  // l'année en cours jusqu'à aujourd'hui, de la même période l'an dernier et de toute l'année
  // précédente (voir compterActesAgendaPeriode). Avant le stock du tour de lecture, les mois viennent
  // de l'historique gardé (mêmes clés que la page Agenda). Un mois jamais lu est lu EN ARRIÈRE-PLAN,
  // un à la fois, un seul essai chacun (arrêt au premier échec, jamais pendant la suspension après un
  // refus d'identifiants) : la réponse part tout de suite avec `complet: false` et le nombre de mois
  // qui manquent — le poste redemande un peu plus tard. Un compte incomplet n'est jamais présenté
  // comme définitif.
  let remplissageActes = null;
  let messageRemplissageActes = '';
  function remplirMoisManquants(mois, r) {
    if (remplissageActes) return;
    remplissageActes = (async () => {
      messageRemplissageActes = '';
      for (const m of mois) {
        const lu = await lireMoisArchive(m, r);
        if (!lu.archive) { messageRemplissageActes = lu.message; break; }
        await new Promise((ok) => setTimeout(ok, options && options.pauseMs !== undefined ? options.pauseMs : 1500));
      }
    })().catch(() => {}).finally(() => { remplissageActes = null; });
  }
  routeur.get('/agenda/actes-annee', (req, res) => {
    const jour = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.jour || '')) ? String(req.query.jour) : dateDuJourParis();
    const p = periodesActesAnnee(jour);
    const agenda = typeof parametresRepo.lireAgendaOffice === 'function' ? parametresRepo.lireAgendaOffice() : null;
    const limite = (agenda && agenda.debut) || '';
    const r = typeof parametresRepo.lireReglagesExchange === 'function' ? parametresRepo.lireReglagesExchange() : {};
    const categorieAnnule = r.categoriesRdv && r.categoriesRdv.annule;
    const evenements = limite ? (agenda.evenements || []).filter((e) => e.date >= limite) : [];
    const manquants = [];
    const aRelire = [];
    if (limite) {
      for (const m of moisDePeriode(p.anneePrecedente.debut, decalerJours(limite, -1))) {
        const archive = parametresRepo.lireArchiveAgenda(m);
        if (!archive) { manquants.push(m); continue; }
        if (archiveAgendaARelire(archive, m, Date.now())) aRelire.push(m);
        for (const e of archive.evenements || []) if (e.date < limite) evenements.push(e);
      }
    }
    const lisible = connexionAgendaConfiguree(r) && !lectureAgendaSuspendue(r);
    if (lisible && (manquants.length || aRelire.length)) remplirMoisManquants(manquants.concat(aRelire), r);
    const message = !limite ? "L'agenda n'a pas encore été lu par le serveur."
      : !manquants.length ? ''
        : !connexionAgendaConfiguree(r) ? "Connexion à l'agenda Outlook à configurer."
          : lectureAgendaSuspendue(r) ? "Lecture de l'agenda suspendue après un refus des identifiants."
            : messageRemplissageActes;
    const compter = (periode) => compterActesAgendaPeriode(evenements, periode.debut, periode.fin, categorieAnnule);
    if (limite && !manquants.length) noterVerification(parametresRepo, 'actes-agenda-historique');
    res.json({
      jour, annee: p.annee, precedente: p.precedente, memeJour: p.memePeriode.fin,
      anneeEnCours: compter(p.anneeEnCours), actuel: compter(p.actuel), aVenir: compter(p.aVenir),
      memePeriode: compter(p.memePeriode), anneePrecedente: compter(p.anneePrecedente),
      complet: !!limite && !manquants.length, moisManquants: manquants.length,
      enCours: !!remplissageActes, message
    });
  });

  // Déclenche un vrai tour de lecture tout de suite — le chemin de production, pas une simulation.
  // Un seul essai, même quand la lecture automatique est suspendue : c'est une personne qui le
  // demande (et un succès lève la suspension).
  routeur.post('/agenda/tester', async (req, res) => {
    if (!depot) {
      res.status(503).json({ erreur: 'Déclenchement manuel indisponible sur ce serveur.' });
      return;
    }
    if (!source().configuree) {
      res.status(400).json({ erreur: "La connexion à l'agenda Outlook n'est pas configurée : renseignez-la et activez-la ci-dessous avant de tester." });
      return;
    }
    try {
      const resultat = await executerEtEnregistrerTourAgenda(depot, parametresRepo, injections, 'manuel');
      res.json({ ...resultat, source: source() });
    } catch (e) {
      res.status(500).json({ erreur: `La lecture de l'agenda a échoué : ${e.message}` });
    }
  });

  return routeur;
}

module.exports = { creerRouteurAgenda };
