'use strict';

// Écran « Réglages » (sidebar, script.js) : l'étude y saisit elle-même l'URL du flux Power
// Automate et l'adresse email Teams de chaque responsable — une donnée métier, pas un réglage
// d'infrastructure (voir parametresRepo.js). Montée derrière le middleware d'authentification
// comme le reste de /api (voir app.js) : ces réglages ne sont pas plus sensibles qu'un dossier,
// même mot de passe partagé pour les consulter/modifier.

const express = require('express');
const { envoyerMessageTeams } = require('../teams');

const MESSAGE_TEST = "📌 CLAIRE — Message de test. Si vous recevez ceci, les rappels automatiques sont bien configurés.";

function creerRouteurReglages(parametresRepo) {
  const routeur = express.Router();

  routeur.get('/reglages', (req, res) => {
    res.json(parametresRepo.lireReglages());
  });

  routeur.put('/reglages', (req, res) => {
    res.json(parametresRepo.ecrireReglages(req.body || {}));
  });

  // Envoie un message de test au collaborateur désigné, avec les réglages déjà ENREGISTRÉS en base
  // (jamais ceux d'un formulaire pas encore validé) : ça vérifie ce qui sera réellement utilisé par
  // le job de rappels, pas un brouillon.
  routeur.post('/reglages/tester-teams', async (req, res) => {
    const responsable = typeof req.body.responsable === 'string' ? req.body.responsable : '';
    const reglages = parametresRepo.lireReglages();
    if (!reglages.teamsWebhookUrl) {
      res.status(400).json({ erreur: "Aucune URL de flux Power Automate enregistrée — enregistrez d'abord les réglages." });
      return;
    }
    const email = reglages.emailsResponsables[responsable];
    if (!email) {
      res.status(400).json({ erreur: `Aucune adresse email enregistrée pour ${responsable || 'ce collaborateur'}.` });
      return;
    }
    const resultat = await envoyerMessageTeams(reglages.teamsWebhookUrl, email, MESSAGE_TEST);
    if (resultat.ok) res.json({ ok: true });
    else res.status(502).json({ erreur: resultat.erreur });
  });

  return routeur;
}

module.exports = { creerRouteurReglages, MESSAGE_TEST };
