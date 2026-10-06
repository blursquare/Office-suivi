// @ts-check
'use strict';
// Projet d'acte envoyé, détecté dans les « Éléments envoyés » (étude 06/10 : « détecter dans les emails envoyés si un projet
// d'acte de vente a été envoyé et cocher automatiquement la tâche dans le dossier et dans l'agenda »).
//
// Un email envoyé vaut « projet envoyé » quand : son objet dit un projet d'acte / de vente (jamais une réponse « RE: », ni
// une relecture, un compromis ou une promesse) ET un destinataire est une adresse du dossier (client, partie, confrère) —
// un objet seul ne suffit pas, un email interne « projet VTE - NOM » n'est pas un envoi au client. Le corps n'est jamais lu.
// Le dossier est alors coché comme par un clic (date d'envoi = jour de l'envoi, `echeancesValidees.projetEnvoye`) ; la mention
// « projet envoyé » du lieu du rendez-vous d'Outlook est ensuite posée par le poste (`rattraperNotesAgenda`), comme pour tout
// envoi validé sans passer par une saisie. Une seule détection par dossier (`d.detectionsEmails.projetEnvoye`) : décoché ensuite
// à la main, il n'est jamais recoché.

const { echeanceValidee } = require('../../commun/planning');
const { estSuccession } = require('../../commun/dossier');
const { adressesDuDossier, normaliser } = require('./emailsMatin');

const RE_OBJET_PROJET = /PROJET (D.|DE L.)?(ACTE|VENTE)|PROJET D.ACTE DE VENTE|PROJET (DE )?(VENTE|ACTE)/;
const RE_OBJET_EXCLU = /RELECTURE|COMPROMIS|PROMESSE|AVANT.?CONTRAT|AVENANT|PROCURATION|DEMANDE|MODIFICATION|CORRECTION|REMARQUE/;
const RE_REPONSE = /^\s*(re|tr|fw|fwd|aw)\s*:/i;

/** L'objet d'un email envoyé dit-il l'envoi d'un projet d'acte de vente ? @param {string} objet */
function objetDitProjetActe(objet) {
  if (RE_REPONSE.test(String(objet || ''))) return false;
  const n = normaliser(objet);
  return RE_OBJET_PROJET.test(n) && !RE_OBJET_EXCLU.test(n);
}

/**
 * Faut-il cocher « projet envoyé » sur ce dossier d'après cet email envoyé ? Pure.
 * @param {any} d @param {{ objet: string, a?: string[], date: string }} envoye
 */
function projetEnvoyeADetecter(d, envoye) {
  if (!d || d.archive || estSuccession(d)) return false;
  if (echeanceValidee(d, 'projetEnvoye')) return false;
  if (d.detectionsEmails && d.detectionsEmails.projetEnvoye) return false;
  if (!objetDitProjetActe(envoye && envoye.objet)) return false;
  const adresses = new Set(adressesDuDossier(d));
  return (envoye.a || []).some((x) => adresses.has(String(x).toLowerCase()));
}

/** Date du jour de l'envoi en heure de Paris (AAAA-MM-JJ). @param {string} iso */
function jourParis(iso) {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })
    : t.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

/**
 * Coche « projet envoyé » sur le dossier (comme `cocherEcheance` du poste) et le dit dans l'historique. Rend vrai si coché.
 * @param {any} d @param {{ objet: string, a?: string[], date: string }} envoye
 */
function cocherProjetEnvoye(d, envoye) {
  if (!projetEnvoyeADetecter(d, envoye)) return false;
  const jour = jourParis(envoye.date);
  d.projetEnvoye = jour;
  d.echeancesValidees = d.echeancesValidees && typeof d.echeancesValidees === 'object' ? d.echeancesValidees : {};
  d.echeancesValidees.projetEnvoye = true;
  d.detectionsEmails = Object.assign({}, d.detectionsEmails, { projetEnvoye: jour });
  d.historique = Array.isArray(d.historique) ? d.historique : [];
  d.historique.push({ date: new Date().toISOString(), texte: `Envoi projet : projet d’acte retrouvé dans les emails envoyés (${jour.split('-').reverse().join('/')}) — échéance cochée` });
  return true;
}

module.exports = { objetDitProjetActe, projetEnvoyeADetecter, cocherProjetEnvoye };
