'use strict';

// Extraction assistée par IA locale pour le wizard "Nouveau dossier" (voir CLAUDE.md) : appelée en
// arrière-plan APRÈS l'extraction par regex existante (traiterTexte(), script.js, inchangée) pour
// ne compléter QUE les champs qu'elle n'a pas trouvés — jamais pour la remplacer ni écraser une
// valeur déjà détectée/saisie, même principe que detecterAdresseBien()/detecterMontantPret() côté
// client. Distincte de routes/analyseIa.js (qui compare PLUSIEURS documents entre eux pour trouver
// des incohérences) : ici un seul document, un simple travail d'extraction de champs.

const express = require('express');
const { creerClientOllama } = require('../llm');

// Même ordre de grandeur que analyseIa.js — un compromis peut compter plusieurs dizaines de pages,
// bien au-delà de ce qu'un modèle 7-8B sur CPU peut traiter en un temps raisonnable pour une simple
// extraction de champs (contrairement à l'analyse croisée, ici on n'a pas besoin du texte en entier
// pour trouver un prix/une adresse/des dates, presque toujours dans les premières pages de l'acte).
const LIMITE_CARACTERES_TEXTE = 40000;

const REGEX_ISO = /^\d{4}-\d{2}-\d{2}$/;
const TYPES_ENGAGEMENT_VALIDES = new Set(['entretien', 'travaux', 'document']);

function construirePrompt(texte) {
  return `Tu es un clerc de notaire qui extrait les informations clés d'un compromis ou d'une promesse de vente, pour préremplir un dossier de suivi.

Depuis le texte fourni, extrait :
- Le nom du dossier au format "VENDEUR / ACQUEREUR" (noms de famille tels qu'ils apparaissent dans l'acte, en majuscules).
- L'adresse complète du bien vendu (numéro, rue, code postal, ville).
- Le prix de vente, en euros, sous forme d'un nombre entier (sans le symbole €, sans espace ni point de séparation de milliers).
- La date de la condition suspensive d'obtention de prêt, au format AAAA-MM-JJ, si elle existe.
- La date prévue de signature de l'acte authentique, au format AAAA-MM-JJ, si elle est mentionnée.
- La date d'une éventuelle vente préalable dont dépend cette vente, au format AAAA-MM-JJ, si elle existe.
- Les engagements du vendeur à justifier avant la vente : un entretien déjà réalisé à prouver, des travaux à faire exécuter, ou un document/justificatif à produire — pour chacun, son type ("entretien", "travaux" ou "document") et une courte description.

Ne réponds QUE ce qui figure explicitement dans le texte — utilise "null" pour tout ce que tu ne trouves pas, n'invente jamais une valeur absente du texte.

TEXTE :
${texte}

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après, au format exact :
{"nomDossier": "..." ou null, "adresseBien": "..." ou null, "prixVente": nombre ou null, "datePret": "AAAA-MM-JJ" ou null, "dateActe": "AAAA-MM-JJ" ou null, "dateVentePrealable": "AAAA-MM-JJ" ou null, "engagementsVendeur": [{"type": "entretien"|"travaux"|"document", "description": "..."}]}`;
}

function normaliserExtraction(brut) {
  let parse;
  try {
    parse = JSON.parse(brut);
  } catch (err) {
    return {
      nomDossier: null, adresseBien: null, prixVente: null,
      datePret: null, dateActe: null, dateVentePrealable: null,
      engagementsVendeur: [],
      erreurExtraction: "Le modèle n'a pas renvoyé un JSON exploitable."
    };
  }
  const texteOuNull = (v) => (typeof v === 'string' && v.trim()) ? v.trim() : null;
  const dateOuNull = (v) => (typeof v === 'string' && REGEX_ISO.test(v)) ? v : null;
  const prixOuNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0) ? Math.round(v) : null;
  const engagementsVendeur = Array.isArray(parse.engagementsVendeur)
    ? parse.engagementsVendeur
        .filter((e) => e && typeof e.description === 'string' && e.description.trim())
        .map((e) => ({
          type: TYPES_ENGAGEMENT_VALIDES.has(e.type) ? e.type : 'document',
          description: e.description.trim()
        }))
    : [];

  return {
    nomDossier: texteOuNull(parse.nomDossier),
    adresseBien: texteOuNull(parse.adresseBien),
    prixVente: prixOuNull(parse.prixVente),
    datePret: dateOuNull(parse.datePret),
    dateActe: dateOuNull(parse.dateActe),
    dateVentePrealable: dateOuNull(parse.dateVentePrealable),
    engagementsVendeur
  };
}

function creerRouteurExtractionIa(config) {
  const routeur = express.Router();
  const ollama = creerClientOllama(config);

  routeur.post('/extraction-ia', async (req, res) => {
    const texte = typeof req.body.texte === 'string' ? req.body.texte.trim() : '';
    if (!texte) {
      res.status(400).json({ erreur: 'Aucun texte à analyser.' });
      return;
    }

    const statut = await ollama.verifierDisponibilite();
    if (!statut.disponible) {
      res.status(503).json({ erreur: statut.raison });
      return;
    }

    const texteTronque = texte.length > LIMITE_CARACTERES_TEXTE ? texte.slice(0, LIMITE_CARACTERES_TEXTE) : texte;
    try {
      const brut = await ollama.generer(construirePrompt(texteTronque));
      res.json(normaliserExtraction(brut));
    } catch (err) {
      res.status(502).json({ erreur: `Échec de l'extraction par le modèle local : ${err.message}` });
    }
  });

  return routeur;
}

// Fonctions pures exposées pour les tests (server/test/extraction-ia.test.js).
module.exports = { creerRouteurExtractionIa, construirePrompt, normaliserExtraction, LIMITE_CARACTERES_TEXTE };
