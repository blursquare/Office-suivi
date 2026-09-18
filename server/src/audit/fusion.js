'use strict';

// Vérification des citations et fusion des 5 passes d'Outil 2 (Audit des actes) en un seul objet
// au format du cahier des charges (§17). Même principe déjà établi pour l'extraction Outil 1 (voir
// server/src/extraction/extraits.js) : le signal de fiabilité d'un constat n'est jamais le score
// auto-déclaré du modèle, mais le fait que l'extrait qu'il cite existe LITTÉRALEMENT dans le texte
// du document qu'il nomme.

const { localiserExtrait } = require('../extraction/extraits');
const { calculerValiditeDiagnostic } = require('./diagnostics');

const GRAVITES_VALIDES = new Set(['CRITIQUE', 'IMPORTANT', 'A_VERIFIER', 'INFORMATION']);

function graviteOuDefaut(g) {
  return GRAVITES_VALIDES.has(g) ? g : 'A_VERIFIER';
}

// Pendant serveur de pageDepuisIndexPages() côté client (script.js) : retrouve le numéro de page
// (1-indexée) contenant un index, à partir des frontières de page d'UN document (voir
// lireTextePdfParPage côté client, qui les calcule et les envoie). Repli sur la dernière page
// connue si l'index dépasse (troncature avant envoi au modèle) plutôt qu'un numéro inventé.
function pageDepuisIndexServeur(pages, index) {
  if (!Array.isArray(pages) || pages.length === 0 || index == null || index < 0) return null;
  for (const p of pages) {
    if (index >= p.debut && index < p.fin) return p.numero;
  }
  return pages[pages.length - 1].numero;
}

// Vérifie chaque source citée contre le texte COMPLET du document qu'elle nomme (jamais le contexte
// tronqué envoyé au modèle, voir routes/auditActe.js) : cherche d'abord dans le document nommé,
// puis dans les autres si absent ou non nommé — un modèle qui confond deux documents proches (deux
// diagnostics, par exemple) reste vérifiable, avec le bon document retrouvé au passage.
function verifierSources(sourcesBrutes, documents) {
  const parNomExact = new Map(documents.map((d) => [String(d.nom || '').trim().toLowerCase(), d]));
  return (Array.isArray(sourcesBrutes) ? sourcesBrutes : []).map((s) => {
    const extrait = (s && s.extrait) || '';
    const nomCite = String((s && s.document) || '').trim().toLowerCase();
    const docNomme = parNomExact.get(nomCite);
    const ordre = docNomme ? [docNomme, ...documents.filter((d) => d !== docNomme)] : documents;
    for (const doc of ordre) {
      const index = localiserExtrait(doc.texte, extrait);
      if (index !== -1) {
        return { document: doc.nom, extrait, extraitTrouve: true, page: pageDepuisIndexServeur(doc.pages, index) };
      }
    }
    return { document: (s && s.document) || null, extrait, extraitTrouve: false, page: null };
  });
}

// Un constat générique (identification/urbanisme/travaux/copropriété) une fois ses sources
// vérifiées : `sourceVerifiee` résume tout ça en un booléen affichable (au moins une citation
// retrouvée telle quelle), jamais un chiffre de "certitude" que le modèle n'a de toute façon pas
// les moyens de calibrer.
function verifierConstats(constatsNormalises, documents) {
  return (Array.isArray(constatsNormalises) ? constatsNormalises : []).map((c) => {
    const sources = verifierSources(c.sources, documents);
    return { ...c, sources, sourceVerifiee: sources.some((s) => s.extraitTrouve) };
  });
}

// Diagnostics (passe 2) : le modèle a seulement identifié nature/date/document — le calcul de
// validité est fait ici, en JS pur (voir diagnostics.js), jamais par le modèle. La gravité en
// découle directement (jamais choisie par le modèle pour cette section) : un diagnostic expiré est
// IMPORTANT (une pièce à jour doit être produite), un diagnostic valide n'est qu'une INFORMATION,
// et tout ce qui n'a pas pu être calculé (nature inconnue, date manquante, durée non déductible
// automatiquement) reste A_VERIFIER plutôt que d'être ignoré ou présenté comme un problème.
function fusionnerDiagnostics(diagnosticsNormalises, documents, dateReference) {
  return (Array.isArray(diagnosticsNormalises) ? diagnosticsNormalises : []).map((d) => {
    const sources = verifierSources([{ document: d.document, extrait: d.extrait }], documents);
    const validite = calculerValiditeDiagnostic(d.nature, d.dateEtablissement, dateReference);
    const gravite = validite.statut === 'EXPIRE' ? 'IMPORTANT' : validite.statut === 'VALIDE' ? 'INFORMATION' : 'A_VERIFIER';
    return {
      nature: d.nature, label: validite.label || d.nature, bienConcerne: d.bienConcerne,
      dateEtablissement: d.dateEtablissement, dateExpiration: validite.dateExpiration,
      statutValidite: validite.statut, gravite, message: validite.message,
      sources, sourceVerifiee: sources.some((s) => s.extraitTrouve)
    };
  });
}

// Comptage par gravité, toutes sections confondues — calculé ici, JAMAIS demandé au modèle (une
// synthèse générée par le modèle affirmerait des chiffres qu'il n'a lui-même aucun moyen de
// garantir cohérents avec le détail).
function calculerResume(objetFinal, mode, nombreDocuments) {
  const compte = { CRITIQUE: 0, IMPORTANT: 0, A_VERIFIER: 0, INFORMATION: 0 };
  const toutes = []
    .concat(objetFinal.constats, objetFinal.travaux, objetFinal.urbanisme, objetFinal.preemptions,
      objetFinal.servitudes, objetFinal.copropriete, objetFinal.dates,
      objetFinal.diagnostics.map((d) => ({ gravite: d.gravite })));
  for (const c of toutes) compte[graviteOuDefaut(c.gravite)] += 1;
  return { mode: mode || null, nombreDocuments, dateAnalyse: new Date().toISOString(), syntheseParGravite: compte };
}

module.exports = {
  graviteOuDefaut, pageDepuisIndexServeur, verifierSources, verifierConstats,
  fusionnerDiagnostics, calculerResume
};
