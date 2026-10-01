'use strict';

// Écran Réglages › Agenda : compte rendu de la lecture de l'agenda de l'office (voir
// agendaOffice.js/agendaWatch.js) — montée derrière l'authentification comme le reste de /api. La
// lecture passe par la connexion Exchange (routes/exchange.js) : aucun réglage propre ici.
//
// `options` porte `{ depot, poster }` : `depot` est nécessaire au seul déclenchement manuel d'un
// tour (« Tester maintenant ») — sans lui la route répond 503 plutôt que de planter. `poster`
// (faux transport EWS) est réservé aux tests.

const express = require('express');
const { executerEtEnregistrerTourAgenda, connexionAgendaConfiguree, lectureAgendaSuspendue, signalerIdentifiantsRefuses } = require('../agendaWatch');
const { evenementsDepuisEws, compterRendezVousPeriode, lundiAnneePrecedente, decalerJours, ecartRendezVous, moisDePeriode, archiveAgendaARelire, evenementsAgendaOffice } = require('../agendaOffice');
const { lireCalendrierExchange } = require('../exchange/ews');

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
          archive = parametresRepo.ecrireArchiveAgenda(m, {
            lu: new Date().toISOString(),
            evenements: evenementsAgendaOffice(evenementsDepuisEws(lu.evenements), dossiersConnus).filter((e) => e.date.slice(0, 7) === m)
          });
        } else if (lu) {
          if (lu.raison === 'auth') signalerIdentifiantsRefuses(r);
          message = lu.message || "L'historique n'a pas pu être lu dans l'agenda.";
        }
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
    let anPasse = memoire[lundiAnPasse] || null;
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
        anPasse = { ...compterRendezVousPeriode(evenementsDepuisEws(lu.evenements), lundiAnPasse, samediAnPasse), lu: new Date().toISOString() };
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
