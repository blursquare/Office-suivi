'use strict';

// Extraction assistée par IA locale pour le wizard "Nouveau dossier" (voir CLAUDE.md) : appelée en
// arrière-plan APRÈS l'extraction par regex existante (traiterTexte(), script.js, inchangée) pour
// ne compléter QUE ce qu'elle n'a pas trouvé — jamais pour la remplacer. Distincte de
// routes/analyseIa.js (qui compare PLUSIEURS documents entre eux pour trouver des incohérences) :
// ici un seul document, un travail d'extraction de champs.
//
// TROIS LOTS plutôt qu'un appel fourre-tout (parties / bien / dates) : un modèle 7-8B tenu de
// remplir quinze champs hétérogènes d'un coup en bâcle une partie, et surtout chaque lot reçoit un
// CONTEXTE DIFFÉRENT — les parties et les notaires sont en tête d'acte, la désignation du bien et
// le prix dans leurs sections propres, les échéances disséminées dans les conditions suspensives.
// Envoyer les 40 000 premiers caractères à chaque fois faisait payer trois fois le même contexte
// inutile sur un CPU de bureau. Le client lance les trois en parallèle et fusionne lot par lot.

const express = require('express');
const { creerClientOllama } = require('../llm');
const { construireFenetres, verifierExtraits } = require('../extraction/extraits');
const { construirePromptParties, construirePromptBien, construirePromptDates } = require('../extraction/prompts');
const {
  normaliserLotParties, normaliserLotBien, normaliserLotDates,
  validerLotParties, validerLotBien, validerLotDates
} = require('../extraction/normaliser');

// Plafond de sécurité, inchangé : au-delà, aucun modèle de cette taille ne traite l'acte en un
// temps raisonnable sur le matériel de l'étude.
const LIMITE_CARACTERES_TEXTE = 40000;

// Contexte propre à chaque lot : une tête de document (les parties et les notaires y sont
// systématiquement présentés, c'est une convention de rédaction constante) complétée par des
// fenêtres autour des mots-clés du lot. Si aucun mot-clé n'est trouvé, on retombe sur la tête du
// document plutôt que sur rien.
const LOTS = {
  parties: {
    prompt: construirePromptParties,
    valider: validerLotParties,
    normaliser: normaliserLotParties,
    tete: 10000,
    motif: /ma[îi]tre|notaire|recevra\s+l['’]acte|ci-apr[èe]s\s+d[ée]nomm/gi,
    rayon: 600,
    maxFenetres: 6000
  },
  bien: {
    prompt: construirePromptBien,
    valider: validerLotBien,
    normaliser: normaliserLotBien,
    tete: 4000,
    motif: /d[ée]signation|cadastr|sis(?:e)?\s+[àa]|situ[ée]e?\s+[àa]|prix\s+(?:de\s+vente|est|convenu)|copropri[ée]t/gi,
    rayon: 900,
    maxFenetres: 12000
  },
  dates: {
    prompt: construirePromptDates,
    valider: validerLotDates,
    normaliser: normaliserLotDates,
    tete: 3000,
    motif: /pr[êe]t|acte\s+authentique|r[ée]it[ée]r|d[ée]lai|au\s+plus\s+tard|s['’]engage|s['’]oblige/gi,
    rayon: 800,
    maxFenetres: 16000
  }
};

function construireContexte(texte, lot) {
  const config = LOTS[lot];
  const source = texte.length > LIMITE_CARACTERES_TEXTE ? texte.slice(0, LIMITE_CARACTERES_TEXTE) : texte;
  const tete = source.slice(0, config.tete);
  const fenetres = construireFenetres(source, config.motif, config.rayon, config.maxFenetres);
  if (!fenetres) return tete;
  return `${tete}\n[...]\n${fenetres}`;
}

function creerRouteurExtractionIa(config) {
  const routeur = express.Router();
  const ollama = creerClientOllama(config);

  routeur.post('/extraction-ia', async (req, res) => {
    const texte = typeof req.body.texte === 'string' ? req.body.texte.trim() : '';
    const lot = typeof req.body.lot === 'string' ? req.body.lot : '';
    if (!texte) {
      res.status(400).json({ erreur: 'Aucun texte à analyser.' });
      return;
    }
    if (!LOTS[lot]) {
      res.status(400).json({ erreur: `Lot inconnu : attendu ${Object.keys(LOTS).join(', ')}.` });
      return;
    }

    const statut = await ollama.verifierDisponibilite();
    if (!statut.disponible) {
      res.status(503).json({ erreur: statut.raison });
      return;
    }

    const config = LOTS[lot];
    const contexte = construireContexte(texte, lot);
    try {
      const brut = await ollama.genererJson(config.prompt(contexte), config.valider);
      // Les extraits sont vérifiés contre le texte COMPLET, pas contre le contexte envoyé au
      // modèle : c'est le texte du PDF qui fait foi, et le client a besoin d'un index dans CE
      // texte-là pour en déduire la page (pageDepuisIndex).
      res.json({ lot, resultat: verifierExtraits(config.normaliser(brut), texte) });
    } catch (err) {
      res.status(502).json({ erreur: `Échec de l'extraction par le modèle local : ${err.message}` });
    }
  });

  return routeur;
}

// Fonctions pures exposées pour les tests (server/test/extraction-ia.test.js).
module.exports = { creerRouteurExtractionIa, construireContexte, LOTS, LIMITE_CARACTERES_TEXTE };
