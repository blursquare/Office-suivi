// @ts-check
'use strict';
// 🎉 de CLAIRE sur le dernier message du canal d'un dossier dès que l'acte est signé (étude 25/10, scénario « Fait les 4 »). Une seule fois
// par dossier (repère `canaux-celebrations`), jamais pour une succession (signée seulement quand tous ses actes le sont : règle du poste),
// jamais pour un dossier signé avant la mise en marche (le premier tour pose les repères sans rien célébrer). De l'affichage seulement.

const { estSuccession } = require('../../../commun/dossier');
const { lireMessages, reagirMessage, canalDuDossier } = require('./canaux');

const CLE_CELEBRATIONS = 'canaux-celebrations';

/** Pur : l'acte d'une vente est-il signé ? (Authentic, ou signature cochée sur un rendez-vous daté). @param {any} d */
function venteSignee(d) {
  if (!d || estSuccession(d)) return false;
  const a = d.authentic && d.authentic.acte;
  if (a && a.etat === 'signe') return true;
  return !!(d.echeancesValidees && d.echeancesValidees.rendezVousSignature && d.rendezVousSignature);
}

/**
 * Pose 🎉 (par CLAIRE) sur le dernier message du canal de chaque dossier nouvellement signé. Rend le nombre de dossiers fêtés.
 * @param {any} repo @param {any[]} dossiers
 */
function celebrerSignatures(repo, dossiers) {
  const brut = repo.lireJsonBrut(CLE_CELEBRATIONS, null);
  const premier = !brut || typeof brut !== 'object' || Array.isArray(brut);
  /** @type {Record<string, string>} */
  const faits = premier ? {} : brut;
  let fetes = 0;
  let change = premier;
  for (const d of dossiers || []) {
    if (!d || !d.id || faits[d.id] || !venteSignee(d)) continue;
    faits[d.id] = new Date().toISOString().slice(0, 10);
    change = true;
    if (premier) continue;
    const canal = canalDuDossier(d.id);
    const messages = lireMessages(repo, canal).filter((m) => !m.parent);
    const dernier = messages[messages.length - 1];
    if (dernier && reagirMessage(repo, canal, dernier.id, 'CLAIRE', '🎉', true)) fetes += 1;
  }
  if (change) repo.ecrireJsonBrut(CLE_CELEBRATIONS, faits);
  return fetes;
}

module.exports = { venteSignee, celebrerSignatures };
