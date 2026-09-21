'use strict';

// Outil 2 — approfondissement OPTIONNEL par le modèle local.
//
// Refonte complète, sur retour de l'étude : « j'ai testé l'outil 2 et c'est inutilisable, c'est
// trop long, il n'a jamais réussi à me sortir quelque chose ». La version précédente enchaînait
// CINQ appels Ollama en série (identification, diagnostics, travaux, urbanisme, copropriété) avant
// d'afficher quoi que ce soit — plusieurs minutes sur le CPU d'un poste de bureau, et un échec en
// cours de route faisait tout perdre.
//
// Le rapport est désormais calculé CÔTÉ CLIENT, instantanément et sans aucun appel réseau (voir
// analyserCompromisOutil2 / analyserProjetVenteOutil2 dans script.js). Ce module ne sert plus qu'au
// bouton « Approfondir avec l'IA », lancé par l'étude APRÈS avoir lu ce rapport : UNE seule requête,
// jamais bloquante, dont l'échec ne coûte rien puisque le résultat déterministe est déjà à l'écran.
//
// Le modèle n'a plus du tout la charge de l'analyse : on lui donne ce que les règles ont DÉJÀ
// trouvé et on lui demande uniquement ce qui leur échappe. C'est le seul usage où il apporte
// quelque chose qu'une regex ne sait pas faire — lire une clause en langage libre — et le seul où
// une erreur de sa part est sans conséquence, le rapport principal ne dépendant pas de lui.

const express = require('express');
const { creerClientOllama } = require('../llm');
const { localiserExtrait } = require('../extraction/extraits');

// Un seul document, tronqué : l'appel doit rester court, c'est toute la raison de cette refonte.
const LIMITE_CARACTERES_DOCUMENT = 18000;
const MAX_CONSTATS_IA = 8;

const GRAVITES = ['CRITIQUE', 'IMPORTANT', 'A_VERIFIER', 'INFORMATION'];

function tronquer(texte, limite) {
  const t = String(texte || '');
  if (t.length <= limite) return { texte: t, tronque: false };
  return { texte: t.slice(0, limite), tronque: true };
}

// Le prompt dit explicitement ce que les règles couvrent déjà : sans ça, le modèle repasse son
// temps à redire les mêmes choses, ce qui allonge la réponse sans rien apporter.
function construirePromptApprofondissement(entree) {
  const constatsConnus = (entree.constatsDejaTrouves || [])
    .slice(0, 20)
    .map(c => `- ${c}`)
    .join('\n') || '- (aucun)';

  return `Tu es notaire et tu relis un avant-contrat avant signature.

Un contrôle AUTOMATIQUE a déjà été fait par des règles fiables. Il couvre déjà :
- les travaux déjà réalisés touchant le gros œuvre ou l'extérieur (autorisation d'urbanisme, garantie décennale) ;
- les diagnostics et entretiens périmés ;
- les documents et travaux que le vendeur doit fournir ou réaliser avant la vente.

Voici ce que ce contrôle a DÉJÀ relevé :
${constatsConnus}

Ta seule tâche : signaler ce qui ÉCHAPPE à ces règles — une clause dangereuse, une contradiction
entre deux passages, une obligation formulée d'une façon inhabituelle. Ne répète JAMAIS un constat
de la liste ci-dessus.

Règles absolues :
- n'invente rien : chaque constat doit citer un passage EXACT du document, recopié mot pour mot ;
- si tu ne peux pas citer un passage exact, n'ajoute pas le constat ;
- une absence de document n'est jamais "CRITIQUE" à elle seule ;
- ${MAX_CONSTATS_IA} constats au maximum, les plus utiles d'abord ;
- si tu ne vois rien de plus que les règles, réponds avec une liste vide.

Réponds UNIQUEMENT en JSON, sans commentaire autour :
{"constats":[{"titre":"...","description":"...","gravite":"CRITIQUE|IMPORTANT|A_VERIFIER|INFORMATION","extrait":"citation exacte"}]}

DOCUMENT :
${entree.texte}`;
}

function validerReponse(objet) {
  if (!objet || typeof objet !== 'object') return 'la réponse doit être un objet JSON';
  if (!Array.isArray(objet.constats)) return 'le champ "constats" doit être un tableau';
  return null;
}

// Même discipline que partout ailleurs dans ce projet : liste blanche stricte, énumération forcée,
// et surtout — un constat sans citation retrouvée LITTÉRALEMENT dans le document est marqué comme
// tel plutôt que présenté au même rang qu'un constat vérifiable. La « certitude » auto-déclarée
// d'un modèle 8B n'est calibrée sur rien ; la vérification de la citation, si.
function normaliserConstatsIa(objet, texteDocument) {
  const bruts = (objet && Array.isArray(objet.constats)) ? objet.constats : [];
  const constats = [];
  for (const c of bruts.slice(0, MAX_CONSTATS_IA)) {
    if (!c || typeof c !== 'object') continue;
    const titre = String(c.titre || '').trim();
    if (!titre) continue;
    const extrait = String(c.extrait || '').trim();
    // localiserExtrait renvoie -1 (et non null) quand la citation est introuvable : tester la
    // nullité laisserait passer TOUTES les citations inventées pour des citations vérifiées.
    const position = extrait ? localiserExtrait(texteDocument, extrait) : -1;
    constats.push({
      categorie: 'IA',
      source: 'ia',
      gravite: GRAVITES.includes(c.gravite) ? c.gravite : 'A_VERIFIER',
      titre,
      description: String(c.description || '').trim(),
      phrase: extrait || null,
      extraitVerifie: position >= 0
    });
  }
  return constats;
}

// `config` est la configuration du serveur (app.js la passe telle quelle) ; les tests peuvent y
// glisser un `llm` déjà fabriqué pour ne pas dépendre d'un vrai Ollama.
function creerRouteurAuditActe(config) {
  const routeur = express.Router();
  const llm = (config && config.llm) || creerClientOllama(config);

  routeur.get('/audit-acte/disponibilite', async (_req, res) => {
    const statut = await llm.verifierDisponibilite();
    res.json({ ...statut, modele: llm.modele });
  });

  routeur.post('/audit-acte/approfondir', async (req, res) => {
    const corps = req.body || {};
    const brut = String(corps.texte || '').trim();
    if (!brut) return res.status(400).json({ erreur: 'Aucun texte à analyser.' });

    const dispo = await llm.verifierDisponibilite();
    if (!dispo.disponible) {
      return res.status(503).json({ erreur: dispo.message || 'Modèle local indisponible.' });
    }

    const { texte, tronque } = tronquer(brut, LIMITE_CARACTERES_DOCUMENT);
    const prompt = construirePromptApprofondissement({
      texte,
      constatsDejaTrouves: Array.isArray(corps.constatsDejaTrouves) ? corps.constatsDejaTrouves : []
    });

    try {
      const objet = await llm.genererJson(prompt, validerReponse);
      res.json({ constats: normaliserConstatsIa(objet, texte), tronque, modele: dispo.modele || null });
    } catch (e) {
      // L'échec est sans conséquence : le rapport déterministe est déjà affiché côté client.
      res.status(502).json({ erreur: `Le modèle local n'a pas pu répondre : ${e.message}` });
    }
  });

  return routeur;
}

module.exports = {
  creerRouteurAuditActe,
  construirePromptApprofondissement,
  normaliserConstatsIa,
  validerReponse,
  tronquer,
  LIMITE_CARACTERES_DOCUMENT,
  MAX_CONSTATS_IA
};
