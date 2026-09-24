'use strict';

// Écran Réglages › Agenda de l'office (voir agendaOffice.js/agendaWatch.js pour la lecture et le
// rapprochement, tous deux purs) — montée derrière l'authentification comme le reste de /api.
//
// `options` porte `{ depot, fetchFn }` : `depot` est nécessaire au seul déclenchement manuel d'un
// tour (« Tester maintenant »), optionnel comme pour /reglages/lancer-rappels — les tests qui ne
// montent que la lecture/écriture des réglages n'ont pas à fabriquer un dépôt, et la route répond
// alors 503 plutôt que de planter. `fetchFn` reste injectable pour les tests, jamais utilisé en
// production (repli sur le `fetch` global de Node dans agendaWatch.js).

const express = require('express');
const { executerEtEnregistrerTourAgenda } = require('../agendaWatch');

function creerRouteurAgenda(parametresRepo, options) {
  const routeur = express.Router();
  const { depot, fetchFn } = options || {};

  routeur.get('/agenda', (req, res) => {
    res.json({
      reglages: parametresRepo.lireReglagesAgenda(),
      dernierTour: parametresRepo.lireDernierTourAgenda()
    });
  });

  routeur.put('/agenda', (req, res) => {
    res.json({ reglages: parametresRepo.ecrireReglagesAgenda(req.body || {}) });
  });

  // Déclenche un vrai tour de lecture tout de suite — le chemin de production
  // (executerTourSurveillanceAgenda → appliquerDetectionsAgenda), pas une simulation : sans ce
  // bouton, vérifier que le lien fonctionne supposerait d'attendre le prochain tour automatique
  // (jusqu'à quinze minutes). Le compte rendu écrit est le même que celui du minuteur.
  routeur.post('/agenda/tester', async (req, res) => {
    if (!depot) {
      res.status(503).json({ erreur: 'Déclenchement manuel indisponible sur ce serveur.' });
      return;
    }
    const reglages = parametresRepo.lireReglagesAgenda();
    if (!reglages.icsUrl) {
      res.status(400).json({ erreur: "Aucune adresse d'agenda enregistrée — renseignez-la puis enregistrez avant de tester." });
      return;
    }
    try {
      const resultat = await executerEtEnregistrerTourAgenda(depot, parametresRepo, fetchFn, 'manuel');
      res.json({ ok: true, ...resultat });
    } catch (e) {
      res.status(500).json({ erreur: `La lecture de l'agenda a échoué : ${e.message}` });
    }
  });

  return routeur;
}

module.exports = { creerRouteurAgenda };
