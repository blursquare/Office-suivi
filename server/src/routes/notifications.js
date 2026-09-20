'use strict';

// Notifie le responsable d'un dossier, sur Teams, qu'une ou plusieurs pièces viennent d'être
// trouvées sur le NAS — voir script.js, verifierDossierLocal()/notifierNouvellesPiecesTrouvees(),
// qui calcule le diff (avant/après un parcours) et appelle cette route UNE SEULE FOIS par dossier
// concerné, avec la liste complète des pièces nouvellement reçues lors de ce parcours : c'est ce
// qui garantit qu'un seul message est envoyé même si plusieurs pièces ont été trouvées en même
// temps (demandé explicitement par l'étude — "grouper les notifications").
//
// Réutilise telle quelle l'infrastructure Teams déjà en place pour les rappels d'échéance (voir
// jobs/rappels.js) : même client (envoyerMessageTeams), mêmes réglages (parametresRepo), et la
// même copie systématique à l'étude (reglages.teamsCopieEmail) — un seul mécanisme d'envoi Teams
// dans tout le projet, pas un second à côté.

const express = require('express');
const { envoyerMessageTeams } = require('../teams');

// Fonction pure et testable : le texte du message, séparée de l'envoi lui-même.
function texteNotificationPieces(dossierNom, pieces) {
  const n = pieces.length;
  const liste = pieces.join(', ');
  const sujet = n > 1 ? 'Nouvelles pièces trouvées' : 'Nouvelle pièce trouvée';
  return `📄 CLAIRE — ${sujet} sur le dossier ${dossierNom} : ${liste}.`;
}

function creerRouteurNotifications(parametresRepo, envoyerFn) {
  const router = express.Router();
  const envoyer = envoyerFn || envoyerMessageTeams;

  router.post('/notifications/pieces-recues', async (req, res) => {
    const corps = req.body || {};
    const dossierNom = typeof corps.dossierNom === 'string' ? corps.dossierNom.trim() : '';
    const responsable = typeof corps.responsable === 'string' ? corps.responsable.trim() : '';
    const pieces = Array.isArray(corps.pieces) ? corps.pieces.filter((p) => typeof p === 'string' && p) : [];
    if (!dossierNom) return res.status(400).json({ erreur: 'dossierNom manquant.' });
    if (pieces.length === 0) return res.status(400).json({ erreur: 'pieces manquantes ou vide.' });

    const reglages = parametresRepo.lireReglages();
    // Réglages Teams non activés : rien à envoyer, ce n'est pas une erreur — le client n'a pas à
    // vérifier lui-même cet état avant d'appeler la route (même principe que le job de rappels).
    if (!reglages.teamsActif || !reglages.teamsWebhookUrl) return res.json({ ok: true, ignore: true });

    const texte = texteNotificationPieces(dossierNom, pieces);
    const email = responsable ? reglages.emailsResponsables[responsable] : null;
    const resultat = { ok: true, envoyeResponsable: false, envoyeCopie: false, erreurs: [] };

    if (email) {
      const envoi = await envoyer(reglages.teamsWebhookUrl, email, texte);
      resultat.envoyeResponsable = envoi.ok;
      if (!envoi.ok) resultat.erreurs.push(envoi.erreur);
    } else if (responsable) {
      resultat.erreurs.push(`${responsable} : aucune adresse email Teams configurée (voir Réglages).`);
    }

    // Même schéma que executerTacheRappels() : la copie n'est envoyée qu'APRÈS le principal (ou en
    // l'absence de responsable connu, elle reste le seul message envoyé), jamais en double si elle
    // coïncide avec l'adresse déjà notifiée.
    if (reglages.teamsCopieEmail && reglages.teamsCopieEmail !== email) {
      const copie = await envoyer(reglages.teamsWebhookUrl, reglages.teamsCopieEmail, texte);
      resultat.envoyeCopie = copie.ok;
      if (!copie.ok) resultat.erreurs.push(copie.erreur);
    }

    res.json(resultat);
  });

  return router;
}

module.exports = { creerRouteurNotifications, texteNotificationPieces };
