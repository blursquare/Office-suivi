'use strict';

// Analyse juridique approfondie par IA locale (voir CLAUDE.md, "Outil d'import et d'analyse
// juridique approfondie") : reçoit le texte déjà extrait (côté client, pdf.js + repli OCR — voir
// script.js) de l'acte principal (compromis/promesse) et de ses annexes séparées, et demande au
// modèle local (Ollama, voir ../llm.js) de relever les incohérences entre eux, comme le ferait un
// notaire relisant l'acte. Montée derrière le middleware d'authentification comme le reste de
// /api (voir app.js) : ce n'est pas un abonnement webcal, pas besoin d'un jeton dédié ici.

const express = require('express');
const { creerClientOllama } = require('../llm');

// Plafond de caractères par document envoyé au modèle : un compromis de plusieurs dizaines de
// pages plus ses annexes peut largement dépasser ce qu'un modèle 7-8B tournant sur un CPU de
// bureau peut traiter en un temps raisonnable. Tronquer plutôt que refuser — l'étude est prévenue
// (`tronque: true` dans la réponse, affiché côté interface) plutôt qu'un échec silencieux ou un
// temps d'attente démesuré.
const LIMITE_CARACTERES_PAR_DOCUMENT = 40000;

const GRAVITES_VALIDES = new Set(['critique', 'attention', 'info']);

function tronquerDocument(doc) {
  const texte = String(doc.texte || '');
  if (texte.length <= LIMITE_CARACTERES_PAR_DOCUMENT) {
    return { ...doc, texte, tronque: false };
  }
  return { ...doc, texte: texte.slice(0, LIMITE_CARACTERES_PAR_DOCUMENT), tronque: true };
}

// Prompt en français, rôle explicite de notaire relisant l'acte — voir CLAUDE.md pour le contexte
// métier (compromis/promesse vs annexes, incohérences fréquentes déjà rencontrées par l'étude :
// dates de diagnostics, désignation du bien, identité des parties...). Demande explicitement de ne
// jamais inventer un fait absent du texte : un LLM local reste sujet aux hallucinations, la
// consigne ne les élimine pas mais les réduit — le disclaimer affiché côté interface (voir
// script.js) rappelle dans tous les cas que ça reste à vérifier par un professionnel, jamais une
// validation juridique en soi.
function construirePrompt(documents) {
  const blocs = documents
    .map((d, i) => {
      const nature = d.type === 'acte' ? "l'acte principal (compromis ou promesse de vente)" : 'une annexe';
      const suffixeTronque = d.tronque ? ' [DOCUMENT TRONQUÉ ICI, la suite existe mais n\'est pas montrée]' : '';
      return `--- DOCUMENT ${i + 1} : ${d.nom} (${nature})${suffixeTronque} ---\n${d.texte}`;
    })
    .join('\n\n');

  return `Tu es un notaire expérimenté chargé de relire un compromis ou une promesse de vente ainsi que ses annexes, avant signature, pour repérer toute incohérence ou tout problème juridique — exactement comme le ferait un clerc de notaire lors d'une relecture attentive.

Vérifie en particulier :
- La cohérence de l'identité des parties (noms, adresses) entre l'acte principal et les annexes.
- La cohérence du prix de vente, de la désignation du bien (adresse, superficie, référence cadastrale) entre tous les documents.
- La cohérence des dates (signature, validité des diagnostics — un DPE est valable 10 ans, un ERP 6 mois, un diagnostic termites 6 mois, un diagnostic électricité/gaz 3 ans, etc.).
- Les annexes mentionnées dans le texte de l'acte principal mais absentes des documents fournis.
- Toute clause contradictoire ou ambiguë entre l'acte et une annexe.
- Toute signature ou pièce visiblement manquante.

Ne signale QUE ce qui ressort effectivement du texte fourni — n'invente jamais un fait qui n'y figure pas. Si tu n'es pas certain d'un point, formule-le comme une simple vérification à faire plutôt que comme une certitude.

${blocs}

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après, au format exact suivant :
{"constats": [{"gravite": "critique"|"attention"|"info", "titre": "résumé court", "description": "explication détaillée", "documents": ["nom du ou des documents concernés"]}]}

Si tu ne trouves aucune incohérence, réponds {"constats": []}.`;
}

function normaliserConstats(brut) {
  let parse;
  try {
    parse = JSON.parse(brut);
  } catch (err) {
    return {
      constats: [],
      erreurAnalyse: "Le modèle n'a pas renvoyé un JSON exploitable — réponse brute conservée pour diagnostic.",
      brut: String(brut).slice(0, 2000)
    };
  }
  const constatsBruts = Array.isArray(parse.constats) ? parse.constats : [];
  const constats = constatsBruts
    .filter((c) => c && typeof c.titre === 'string' && c.titre.trim())
    .map((c) => ({
      gravite: GRAVITES_VALIDES.has(c.gravite) ? c.gravite : 'info',
      titre: String(c.titre).trim(),
      description: typeof c.description === 'string' ? c.description.trim() : '',
      documents: Array.isArray(c.documents) ? c.documents.filter((d) => typeof d === 'string') : []
    }));
  return { constats };
}

function creerRouteurAnalyseIa(config) {
  const routeur = express.Router();
  const ollama = creerClientOllama(config);

  // Interrogée par l'interface au chargement de l'onglet (voir script.js) pour afficher tout de
  // suite un message clair si Ollama n'est pas installé/lancé/le modèle absent, plutôt que de
  // laisser l'étude lancer une analyse de plusieurs minutes pour découvrir l'échec à la fin.
  routeur.get('/analyse-ia/disponibilite', async (req, res) => {
    const statut = await ollama.verifierDisponibilite();
    res.json({ ...statut, modele: ollama.modele });
  });

  routeur.post('/analyse-ia', async (req, res) => {
    const documentsBruts = Array.isArray(req.body.documents) ? req.body.documents : [];
    const documentsValides = documentsBruts.filter(
      (d) => d && typeof d.nom === 'string' && typeof d.texte === 'string' && d.texte.trim().length > 0
    );
    if (documentsValides.length === 0) {
      res.status(400).json({ erreur: 'Aucun document exploitable (nom + texte extrait requis pour chacun).' });
      return;
    }

    const statut = await ollama.verifierDisponibilite();
    if (!statut.disponible) {
      res.status(503).json({ erreur: statut.raison });
      return;
    }

    const documents = documentsValides.map(tronquerDocument);
    const uneTronque = documents.some((d) => d.tronque);

    try {
      const brut = await ollama.generer(construirePrompt(documents));
      const resultat = normaliserConstats(brut);
      res.json({ ...resultat, tronque: uneTronque, modele: ollama.modele });
    } catch (err) {
      res.status(502).json({ erreur: `Échec de l'analyse par le modèle local : ${err.message}` });
    }
  });

  return routeur;
}

// Fonctions pures exposées pour les tests (server/test/analyse-ia.test.js) — creerRouteurAnalyseIa
// reste le seul point d'entrée réel.
module.exports = { creerRouteurAnalyseIa, construirePrompt, normaliserConstats, tronquerDocument, LIMITE_CARACTERES_PAR_DOCUMENT };
