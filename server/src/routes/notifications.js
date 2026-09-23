'use strict';

// Notifie par email le responsable d'un dossier qu'une ou plusieurs pièces viennent d'être
// trouvées sur le NAS — voir script.js, verifierDossierLocal()/notifierNouvellesPiecesTrouvees(),
// qui calcule le diff (avant/après un parcours) et appelle cette route UNE SEULE FOIS par dossier
// concerné, avec la liste complète des pièces nouvellement reçues lors de ce parcours : c'est ce
// qui garantit qu'un seul message est envoyé même si plusieurs pièces ont été trouvées en même
// temps (demandé explicitement par l'étude — "grouper les notifications").
//
// Réutilise telle quelle l'infrastructure déjà en place pour les rappels d'échéance (voir
// jobs/rappels.js) : même client (envoyerEmail), mêmes réglages (parametresRepo), et la même
// copie systématique à l'étude (reglages.copieEmail) — un seul mécanisme d'envoi dans tout le
// projet, pas un second à côté.

const express = require('express');
const { envoyerEmail, envoiConfigure } = require('../envoiEmail');
const { mettreCopiesEnAttente } = require('../nettoyageGmail');

// Fonction pure et testable : le corps du message, séparé de l'envoi lui-même. Pas d'objet à
// construire — celui de l'email transporte l'adresse du destinataire, lue par le flux pour router
// le message Teams (voir envoiEmail.js) ; l'ancien `sujetNotificationPieces()` a disparu avec
// l'architecture qui l'avait fait naître.
function libelleNouvellesPieces(nombre) {
  return nombre > 1 ? 'Nouvelles pièces trouvées' : 'Nouvelle pièce trouvée';
}

function texteNotificationPieces(dossierNom, pieces) {
  const liste = pieces.join(', ');
  return `📄 CLAIRE — ${libelleNouvellesPieces(pieces.length)} sur le dossier ${dossierNom} : ${liste}.`;
}

function creerRouteurNotifications(parametresRepo, envoyerFn) {
  const router = express.Router();
  const envoyer = envoyerFn || envoyerEmail;

  router.post('/notifications/pieces-recues', async (req, res) => {
    const corps = req.body || {};
    const dossierNom = typeof corps.dossierNom === 'string' ? corps.dossierNom.trim() : '';
    const responsable = typeof corps.responsable === 'string' ? corps.responsable.trim() : '';
    const pieces = Array.isArray(corps.pieces) ? corps.pieces.filter((p) => typeof p === 'string' && p) : [];
    if (!dossierNom) return res.status(400).json({ erreur: 'dossierNom manquant.' });
    if (pieces.length === 0) return res.status(400).json({ erreur: 'pieces manquantes ou vide.' });

    const reglages = parametresRepo.lireReglages();
    // Envoi par email non activé : rien à envoyer, ce n'est pas une erreur — le client n'a pas à
    // vérifier lui-même cet état avant d'appeler la route (même principe que le job de rappels).
    if (!envoiConfigure(reglages)) return res.json({ ok: true, ignore: true });

    const texte = texteNotificationPieces(dossierNom, pieces);
    const email = responsable ? reglages.emailsResponsables[responsable] : null;
    const resultat = { ok: true, envoyeResponsable: false, envoyeCopie: false, erreurs: [] };
    const messagesEnvoyes = [];

    if (email) {
      const envoi = await envoyer(reglages, email, texte);
      resultat.envoyeResponsable = envoi.ok;
      if (envoi.ok && envoi.messageId) messagesEnvoyes.push(envoi.messageId);
      if (!envoi.ok) resultat.erreurs.push(envoi.erreur);
    } else if (responsable) {
      resultat.erreurs.push(`${responsable} : aucune adresse email configurée (voir Réglages).`);
    }

    // Même schéma que executerTacheRappels() : la copie n'est envoyée qu'APRÈS le principal (ou en
    // l'absence de responsable connu, elle reste le seul message envoyé), jamais en double si elle
    // coïncide avec l'adresse déjà notifiée.
    if (reglages.copieEmail && reglages.copieEmail !== email) {
      const copie = await envoyer(reglages, reglages.copieEmail, texte);
      resultat.envoyeCopie = copie.ok;
      if (copie.ok && copie.messageId) messagesEnvoyes.push(copie.messageId);
      if (!copie.ok) resultat.erreurs.push(copie.erreur);
    }

    // Copie Gmail mise en attente, jamais effacée tout de suite : le flux doit d'abord avoir lu le
    // message. La tâche de rappels l'effacera à l'un de ses prochains tours (voir nettoyageGmail.js).
    if (typeof parametresRepo.lireCopiesEnAttente === 'function') {
      mettreCopiesEnAttente(parametresRepo, reglages, messagesEnvoyes);
    }
    res.json(resultat);
  });

  return router;
}

module.exports = { creerRouteurNotifications, texteNotificationPieces };
