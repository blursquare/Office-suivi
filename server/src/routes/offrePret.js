'use strict';

// Confirmation par le modèle IA local qu'un PDF trouvé dans le dossier local est bien une offre
// (ou un contrat) de prêt — troisième et dernier filtre de la reconnaissance de ce document, après
// le nombre de pages et le titre de la page de garde (voir la section « OFFRE DE PRÊT » de
// script.js pour les deux premiers et l'historique des méthodes abandonnées).
//
// Ce que le modèle voit : UNIQUEMENT le haut de la première page (le titre et ce qui l'entoure,
// quelques centaines de caractères), jamais le document entier ni le texte d'un acte. C'est
// suffisant pour trancher « est-ce la page de garde d'une offre de prêt ? » et ça garde l'appel
// court, donc rapide sur le CPU d'un poste de bureau.
//
// Montée derrière le middleware d'authentification comme le reste de /api (voir app.js).

const express = require('express');
const { creerClientOllama } = require('../llm');

// Le titre est déjà tronqué côté client (LONGUEUR_TITRE_PDF) ; ce plafond n'est qu'un garde-fou
// serveur, pour qu'un client mal réglé ne puisse pas envoyer un document entier par cette route.
const LIMITE_CARACTERES_TITRE = 2000;

function construirePrompt(titre) {
  return `Voici le haut de la PREMIÈRE PAGE d'un document PDF trouvé dans le dossier d'une vente immobilière, dans une étude notariale :

--- DÉBUT DU DOCUMENT ---
${titre}
--- FIN DE L'EXTRAIT ---

Question : ce document est-il une OFFRE DE PRÊT immobilier (ou une offre de crédit, un contrat de prêt, un contrat de crédit) adressée à l'emprunteur par un établissement prêteur ?

Réponds « oui » UNIQUEMENT s'il s'agit du document de prêt lui-même. Réponds « non » pour tout autre document, même s'il parle de prêt : un compromis ou une promesse de vente qui contient une condition suspensive de prêt, un courrier d'accompagnement, une attestation, un tableau d'amortissement seul, une demande de financement, un relevé bancaire.

N'invente rien : fonde-toi uniquement sur l'extrait ci-dessus. Dans le doute, réponds « non ».

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après, au format exact suivant :
{"estOffrePret": true|false, "raison": "une phrase courte expliquant ta réponse"}`;
}

// Sert à la fois de validateur pour genererJson (une chaîne d'erreur fait relancer le modèle une
// fois) et de normalisation du résultat : un booléen manquant ou d'un autre type est un vrai échec
// de format ici, pas quelque chose à replier en silence — c'est LA seule information demandée.
function validerReponse(objet) {
  if (!objet || typeof objet !== 'object') return "la réponse n'est pas un objet";
  if (typeof objet.estOffrePret !== 'boolean') return '"estOffrePret" doit être un booléen (true ou false)';
  return null;
}

function creerRouteurOffrePret(config) {
  const routeur = express.Router();
  const ollama = creerClientOllama(config);

  routeur.post('/offre-pret/confirmer', async (req, res) => {
    const titre = typeof req.body.titre === 'string' ? req.body.titre.trim() : '';
    if (!titre) {
      res.status(400).json({ erreur: 'Aucun titre à examiner (champ "titre" requis).' });
      return;
    }

    const statut = await ollama.verifierDisponibilite();
    if (!statut.disponible) {
      // 503 volontaire, distinct d'une réponse « non » : le client doit pouvoir faire la
      // différence entre « le modèle dit que ce n'est pas une offre » et « le modèle n'a pas pu
      // répondre », qui donne le statut « à confirmer » plutôt que « reçue » (choix de l'étude).
      res.status(503).json({ erreur: statut.raison });
      return;
    }

    try {
      const objet = await ollama.genererJson(
        construirePrompt(titre.slice(0, LIMITE_CARACTERES_TITRE)),
        validerReponse
      );
      res.json({
        estOffrePret: objet.estOffrePret,
        raison: typeof objet.raison === 'string' ? objet.raison.trim() : '',
        modele: ollama.modele
      });
    } catch (err) {
      res.status(502).json({ erreur: `Échec de la confirmation par le modèle local : ${err.message}` });
    }
  });

  return routeur;
}

module.exports = { creerRouteurOffrePret, construirePrompt, validerReponse, LIMITE_CARACTERES_TITRE };
