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
const { envoyerEmail, envoiConfigure } = require('../envoiEmail');
const { estCompteGmail } = require('../imapGmail');
const { mettreCopiesEnAttente, DELAI_AVANT_EFFACEMENT_MS } = require('../nettoyageGmail');
const { executerTacheRappels } = require('../jobs/rappels');

// Forme d'une adresse email : un seul @, une partie locale, un domaine d'au moins deux libellés
// séparés par des points, sans espace. Volontairement simple — il ne s'agit pas de valider la RFC,
// seulement d'arrêter une faute de frappe avant qu'elle ne parte en objet vers le flux.
function adresseEmailValide(adresse) {
  if (typeof adresse !== 'string') return false;
  return /^[^\s@]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(adresse.trim());
}

const MESSAGE_TEST = "📌 CLAIRE — Message de test. Si vous recevez ceci, les rappels automatiques sont bien configurés.";

function reglagesPublics(reglages) {
  const { smtpMotDePasse, ...reste } = reglages;
  return { ...reste, smtpMotDePasseEnregistre: !!smtpMotDePasse };
}

// `options` porte `{ depot, db }`, nécessaires au seul déclenchement manuel d'un tour de rappels.
// Optionnels : les tests qui ne montent que la lecture/écriture des réglages n'ont pas à fabriquer
// un dépôt, et la route répond alors 503 au lieu de planter.
function creerRouteurReglages(parametresRepo, envoyerFn, options) {
  const routeur = express.Router();
  const envoyer = envoyerFn || envoyerEmail;
  const { depot, db } = options || {};

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
    // Contrôle de forme avant envoi : une adresse malformée partirait quand même en objet et ne
    // se révélerait qu'au bout de la chaîne, dans l'erreur du flux Power Automate.
    if (!adresseEmailValide(email)) {
      res.status(400).json({ erreur: `L'adresse enregistrée « ${email} » n'est pas une adresse email valide. Rien n'a été envoyé.` });
      return;
    }
    if (!adresseEmailValide(reglages.emailPasserelle)) {
      res.status(400).json({ erreur: `La boîte-passerelle « ${reglages.emailPasserelle} » n'est pas une adresse email valide. Rien n'a été envoyé.` });
      return;
    }
    const resultat = await envoyer(reglages, email, MESSAGE_TEST);
    if (!resultat.ok) {
      res.status(502).json({ erreur: resultat.erreur });
      return;
    }
    // La copie Gmail du message de test suit le même chemin que celle d'un rappel : mise en
    // attente, effacée plus tard. L'effacer tout de suite empêcherait justement le flux de lire le
    // message de test — c'est-à-dire de vérifier ce que ce bouton est censé vérifier.
    let copieGmail = null;
    if (estCompteGmail(reglages) && resultat.messageId) {
      if (typeof parametresRepo.lireCopiesEnAttente === 'function') {
        mettreCopiesEnAttente(parametresRepo, reglages, [resultat.messageId]);
      }
      copieGmail = { differee: true, delaiHeures: Math.round(DELAI_AVANT_EFFACEMENT_MS / 3600000) };
    }
    // L'adresse réellement utilisée est renvoyée : l'écran l'affiche pour qu'on la relise.
    const reponse = { ok: true, destinataire: email, passerelle: reglages.emailPasserelle };
    if (copieGmail) reponse.copieGmail = copieGmail;
    res.json(reponse);
  });

  // Compte rendu du dernier tour de la tâche de rappels (voir jobs/rappels.js). `null` tant que la
  // tâche n'a jamais rien tenté — l'écran Réglages le distingue d'un tour réellement vide.
  routeur.get('/reglages/dernier-tour', (req, res) => {
    res.json({ dernierTour: parametresRepo.lireDernierTour() });
  });

  // Déclenche UN vrai tour de rappels, tout de suite. C'est bien le chemin de production
  // (calculerRappelsDus → texteRappel → envoi → reminder_log), pas le message de test : sans ce
  // bouton, vérifier la chaîne complète jusqu'à Teams supposerait d'attendre le prochain tour
  // automatique, ou de fabriquer un dossier dont une échéance tombe pile à J-15 ou J-7.
  //
  // Conséquence assumée : un rappel envoyé ici est marqué dans reminder_log et ne repartira donc
  // pas au tour automatique suivant — ce n'est pas une simulation, c'est le tour lui-même, avancé
  // de quelques minutes.
  routeur.post('/reglages/lancer-rappels', async (req, res) => {
    if (!depot || !db) {
      res.status(503).json({ erreur: "Déclenchement manuel indisponible sur ce serveur." });
      return;
    }
    const reglages = parametresRepo.lireReglages();
    if (!envoiConfigure(reglages)) {
      res.status(400).json({ erreur: "L'envoi n'est pas activé, ou le serveur d'envoi et la boîte-passerelle ne sont pas renseignés." });
      return;
    }
    try {
      const resultat = await executerTacheRappels(depot, db, parametresRepo, envoyer, null, 'manuel');
      res.json({ ok: true, ...resultat, dernierTour: parametresRepo.lireDernierTour() });
    } catch (e) {
      res.status(500).json({ erreur: `Le tour de rappels a échoué : ${e.message}` });
    }
  });

  return routeur;
}

module.exports = { creerRouteurReglages, reglagesPublics, adresseEmailValide, MESSAGE_TEST };
