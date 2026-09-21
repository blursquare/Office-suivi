'use strict';

// Écran « Réglages » (sidebar, script.js) : l'étude y saisit elle-même le serveur d'envoi SMTP, la
// boîte-passerelle qui déclenche le flux Power Automate, et l'adresse email de chaque responsable
// — une donnée métier, pas un réglage d'infrastructure (voir parametresRepo.js). Montée derrière
// le middleware d'authentification comme le reste de /api (voir app.js).
//
// Une exception au « pas plus sensible qu'un dossier » : le mot de passe SMTP, quand l'étude en
// pose un, ne ressort JAMAIS de la base. `reglagesPublics()` le retire de toute réponse et le
// remplace par un simple booléen ; l'enregistrement le conserve tel quel quand le formulaire ne le
// renvoie pas (voir assainirReglages). Un mot de passe de messagerie n'a aucune raison de
// retraverser le réseau du bureau à chaque ouverture de l'écran.

const express = require('express');
const { envoyerEmail } = require('../envoiEmail');

const MESSAGE_TEST = "📌 CLAIRE — Message de test. Si vous recevez ceci, les rappels automatiques sont bien configurés.";

function reglagesPublics(reglages) {
  const { smtpMotDePasse, ...reste } = reglages;
  return { ...reste, smtpMotDePasseEnregistre: !!smtpMotDePasse };
}

function creerRouteurReglages(parametresRepo, envoyerFn) {
  const routeur = express.Router();
  const envoyer = envoyerFn || envoyerEmail;

  routeur.get('/reglages', (req, res) => {
    res.json(reglagesPublics(parametresRepo.lireReglages()));
  });

  routeur.put('/reglages', (req, res) => {
    res.json(reglagesPublics(parametresRepo.ecrireReglages(req.body || {})));
  });

  // Envoie un message de test au collaborateur désigné, avec les réglages déjà ENREGISTRÉS en base
  // (jamais ceux d'un formulaire pas encore validé) : ça vérifie ce qui sera réellement utilisé par
  // le job de rappels, pas un brouillon.
  routeur.post('/reglages/tester-email', async (req, res) => {
    const responsable = typeof req.body.responsable === 'string' ? req.body.responsable : '';
    const reglages = parametresRepo.lireReglages();
    if (!reglages.smtpHote || !reglages.emailPasserelle) {
      res.status(400).json({ erreur: "Serveur d'envoi ou boîte-passerelle manquants — enregistrez d'abord les réglages." });
      return;
    }
    const email = reglages.emailsResponsables[responsable];
    if (!email) {
      res.status(400).json({ erreur: `Aucune adresse email enregistrée pour ${responsable || 'ce collaborateur'}.` });
      return;
    }
    const resultat = await envoyer(reglages, email, MESSAGE_TEST);
    if (resultat.ok) res.json({ ok: true });
    else res.status(502).json({ erreur: resultat.erreur });
  });

  return routeur;
}

module.exports = { creerRouteurReglages, reglagesPublics, MESSAGE_TEST };
