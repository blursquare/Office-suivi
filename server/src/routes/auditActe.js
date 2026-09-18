'use strict';

// Outil 2 — Audit intelligent des actes notariaux (voir CLAUDE.md, section "Outil 2"). Remplace
// l'ancienne "Analyse approfondie (IA)" (un seul prompt, un seul type de document) : ici, un
// sélecteur de MODE choisi explicitement à l'upload (projet de compromis/promesse, ou projet
// d'acte de vente notarié — jamais deviné), une taxonomie de documents qui route chacun vers les
// seules passes qui en ont besoin (garder chaque appel Ollama petit sur un CPU de bureau sans GPU),
// et cinq passes ciblées plutôt qu'un unique prompt fourre-tout couvrant les 19 sections du cahier
// des charges.
//
// Tout ce qui PEUT être un calcul déterministe l'est : la comparaison compromis → projet de vente
// sur les champs structurés (parties, prix, bien, dates) est un diff pur côté client
// (comparerCompromisEtProjet, script.js — jamais redemandé au modèle), et la durée de validité
// d'un diagnostic est calculée ici en JS pur (diagnostics.js) à partir de la seule date que le
// modèle a identifiée. L'IA locale n'intervient que pour ce qui reste : lire des clauses en langage
// libre à travers plusieurs documents et signaler une incohérence, toujours avec citation vérifiée.

const express = require('express');
const { creerClientOllama } = require('../llm');
const { construirePromptIdentification, construirePromptDiagnostics, construirePromptTravaux,
  construirePromptUrbanisme, construirePromptCopropriete } = require('../audit/prompts');
const { normaliserPasseIdentification, normaliserPasseDiagnostics, normaliserPasseTravaux,
  normaliserPasseUrbanisme, normaliserPasseCopropriete,
  validerPasseIdentification, validerPasseDiagnostics, validerPasseTravaux,
  validerPasseUrbanisme, validerPasseCopropriete, NATURES_DIAGNOSTIC } = require('../audit/normaliser');
const { verifierConstats, fusionnerDiagnostics, calculerResume } = require('../audit/fusion');

// Un diagnostic, une facture, un titre de propriété... tiennent largement dans cette limite ; un
// projet d'acte lui-même (toujours du type "principal") peut être plus long, d'où la limite propre
// à chaque document plutôt qu'un seul plafond global brutal.
const LIMITE_CARACTERES_PAR_DOCUMENT = 20000;
// Total toutes pièces confondues pour UNE SEULE passe : une passe qui recevrait dix diagnostics de
// 20 000 caractères chacun resterait ingérable sur un CPU de bureau — au-delà, les documents
// suivants sont simplement omis de cette passe (jamais coupés au milieu, voir preparerDocuments).
const PLAFOND_CARACTERES_PASSE = 60000;

// Type de document déclaré à l'upload (voir script.js, ajouterFichiersAnalyseIa/
// changerTypeFichierAnalyseIa) → passes qui en ont besoin. "principal" (le projet lui-même) figure
// dans toutes les passes : c'est le document que chaque section compare aux autres.
const TYPES_PAR_PASSE = {
  identification: ['principal', 'titre', 'reference_compromis'],
  diagnostics: ['principal', 'diagnostic'],
  travaux: ['principal', 'facture', 'autorisation', 'decennale', 'reference_compromis'],
  urbanisme: ['principal', 'urbanisme', 'titre', 'autorisation', 'decennale', 'reference_compromis'],
  copropriete: ['principal', 'copropriete', 'reference_compromis']
};

function documentsPourPasse(documents, passe) {
  const types = TYPES_PAR_PASSE[passe];
  return documents.filter((d) => types.includes(d.type));
}

// Tronque chaque document à LIMITE_CARACTERES_PAR_DOCUMENT, puis l'ensemble à
// PLAFOND_CARACTERES_PASSE (un document entier omis plutôt que coupé en plein milieu si le plafond
// est déjà atteint) — c'est ce texte-là qui va au modèle ; la vérification des citations, elle, se
// fait toujours contre le texte COMPLET d'origine (voir fusion.js).
function preparerDocumentsPourPasse(documents) {
  const resultat = [];
  let total = 0;
  for (const d of documents) {
    if (total >= PLAFOND_CARACTERES_PASSE) break;
    const brut = String(d.texte || '');
    const tronqueParDocument = brut.length > LIMITE_CARACTERES_PAR_DOCUMENT;
    let texte = tronqueParDocument ? brut.slice(0, LIMITE_CARACTERES_PAR_DOCUMENT) : brut;
    const disponible = PLAFOND_CARACTERES_PASSE - total;
    const tronqueParPlafond = texte.length > disponible;
    if (tronqueParPlafond) texte = texte.slice(0, disponible);
    if (!texte) continue;
    resultat.push({ nom: d.nom, texte, tronque: tronqueParDocument || tronqueParPlafond });
    total += texte.length;
  }
  return resultat;
}

function creerRouteurAuditActe(config) {
  const routeur = express.Router();
  const ollama = creerClientOllama(config);

  routeur.get('/audit-acte/disponibilite', async (req, res) => {
    const statut = await ollama.verifierDisponibilite();
    res.json({ ...statut, modele: ollama.modele });
  });

  routeur.post('/audit-acte/analyser', async (req, res) => {
    const documentsBruts = Array.isArray(req.body.documents) ? req.body.documents : [];
    const documents = documentsBruts.filter(
      (d) => d && typeof d.nom === 'string' && typeof d.type === 'string' && typeof d.texte === 'string' && d.texte.trim()
    ).map((d) => ({ nom: d.nom, type: d.type, texte: d.texte, pages: Array.isArray(d.pages) ? d.pages : [] }));

    if (!documents.some((d) => d.type === 'principal')) {
      res.status(400).json({ erreur: 'Aucun document "principal" (le projet lui-même) fourni.' });
      return;
    }

    const statut = await ollama.verifierDisponibilite();
    if (!statut.disponible) {
      res.status(503).json({ erreur: statut.raison });
      return;
    }

    const mode = typeof req.body.mode === 'string' ? req.body.mode : null;
    const typeVente = typeof req.body.typeVente === 'string' ? req.body.typeVente : null;
    const avecReference = documents.some((d) => d.type === 'reference_compromis');

    const objetFinal = {
      constats: [], diagnostics: [], travaux: [], urbanisme: [], preemptions: [], servitudes: [],
      copropriete: [], dates: [], erreursPasses: []
    };

    // Chaque passe est isolée : l'échec d'une seule (timeout Ollama, réponse hors schéma deux fois
    // de suite) ne doit pas priver l'étude des quatre autres, plusieurs minutes de calcul déjà
    // englouties. L'échec est consigné en clair (erreursPasses) plutôt que passé sous silence.
    async function executerPasse(nom, fn) {
      try {
        return await fn();
      } catch (err) {
        objetFinal.erreursPasses.push({ passe: nom, message: err.message });
        return null;
      }
    }

    // Passe 1 — identification (bien, parties, prix, dates, titre) : toujours exécutée.
    const resultatIdentification = await executerPasse('identification', async () => {
      const docs = preparerDocumentsPourPasse(documentsPourPasse(documents, 'identification'));
      const brut = await ollama.genererJson(construirePromptIdentification(docs, avecReference), validerPasseIdentification);
      return normaliserPasseIdentification(brut).constats;
    });
    if (resultatIdentification) {
      const verifies = verifierConstats(resultatIdentification, documents);
      for (const c of verifies) (c.categorie === 'DATES' ? objetFinal.dates : objetFinal.constats).push(c);
    }

    // Passe 2 — diagnostics : le modèle identifie, le calcul de validité est fait en JS pur.
    const resultatDiagnostics = await executerPasse('diagnostics', async () => {
      const docs = preparerDocumentsPourPasse(documentsPourPasse(documents, 'diagnostics'));
      const brut = await ollama.genererJson(construirePromptDiagnostics(docs, [...NATURES_DIAGNOSTIC]), validerPasseDiagnostics);
      return normaliserPasseDiagnostics(brut).diagnostics;
    });
    if (resultatDiagnostics) {
      objetFinal.diagnostics = fusionnerDiagnostics(resultatDiagnostics, documents, new Date().toISOString().slice(0, 10));
    }

    // Passe 3 — travaux (PRIORITAIRE, §5) : toujours exécutée, avant la passe 4 qui s'appuie sur
    // ses constats les plus significatifs pour orienter sa recherche d'autorisations/garanties.
    const resultatTravaux = await executerPasse('travaux', async () => {
      const docs = preparerDocumentsPourPasse(documentsPourPasse(documents, 'travaux'));
      const brut = await ollama.genererJson(construirePromptTravaux(docs, avecReference), validerPasseTravaux);
      return normaliserPasseTravaux(brut).travaux;
    });
    if (resultatTravaux) objetFinal.travaux = verifierConstats(resultatTravaux, documents);

    const titresTravaux = objetFinal.travaux
      .filter((t) => t.gravite === 'CRITIQUE' || t.gravite === 'IMPORTANT')
      .map((t) => t.titre)
      .slice(0, 8);

    // Passe 4 — urbanisme, autorisations, garanties, préemption, servitudes (§6, §7, §9, §10, §11).
    const resultatUrbanisme = await executerPasse('urbanisme', async () => {
      const docs = preparerDocumentsPourPasse(documentsPourPasse(documents, 'urbanisme'));
      const brut = await ollama.genererJson(construirePromptUrbanisme(docs, titresTravaux), validerPasseUrbanisme);
      return normaliserPasseUrbanisme(brut).constats;
    });
    if (resultatUrbanisme) {
      const verifies = verifierConstats(resultatUrbanisme, documents);
      for (const c of verifies) {
        if (c.categorie === 'PREEMPTION') objetFinal.preemptions.push(c);
        else if (c.categorie === 'SERVITUDE') objetFinal.servitudes.push(c);
        else objetFinal.urbanisme.push(c); // URBANISME, AUTORISATION, GARANTIE
      }
    }

    // Passe 5 — copropriété (§12), seulement si le bien vendu en est une : inutile de solliciter le
    // modèle sur une section qui ne concerne pas ce dossier.
    if (typeVente === 'copropriete') {
      const resultatCopropriete = await executerPasse('copropriete', async () => {
        const docs = preparerDocumentsPourPasse(documentsPourPasse(documents, 'copropriete'));
        const brut = await ollama.genererJson(construirePromptCopropriete(docs), validerPasseCopropriete);
        return normaliserPasseCopropriete(brut).copropriete;
      });
      if (resultatCopropriete) objetFinal.copropriete = verifierConstats(resultatCopropriete, documents);
    }

    objetFinal.resume = calculerResume(objetFinal, mode, documents.length);
    res.json({ ...objetFinal, modele: ollama.modele });
  });

  return routeur;
}

// Fonctions pures exposées pour les tests (server/test/audit-acte.test.js).
module.exports = { creerRouteurAuditActe, documentsPourPasse, preparerDocumentsPourPasse, TYPES_PAR_PASSE, LIMITE_CARACTERES_PAR_DOCUMENT, PLAFOND_CARACTERES_PASSE };
