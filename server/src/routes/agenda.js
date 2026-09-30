'use strict';

// Écran Réglages › Agenda : compte rendu de la lecture de l'agenda de l'office (voir
// agendaOffice.js/agendaWatch.js) — montée derrière l'authentification comme le reste de /api. La
// lecture passe par la connexion Exchange (routes/exchange.js) : aucun réglage propre ici.
//
// `options` porte `{ depot, poster }` : `depot` est nécessaire au seul déclenchement manuel d'un
// tour (« Tester maintenant ») — sans lui la route répond 503 plutôt que de planter. `poster`
// (faux transport EWS) est réservé aux tests.

const express = require('express');
const { executerEtEnregistrerTourAgenda, connexionAgendaConfiguree, lectureAgendaSuspendue } = require('../agendaWatch');

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
