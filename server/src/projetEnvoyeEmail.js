// @ts-check
'use strict';
// Projet d'acte envoyé, détecté dans les « Éléments envoyés » (étude 06/10 : « détecter dans les emails envoyés si un projet
// d'acte de vente a été envoyé et cocher automatiquement la tâche dans le dossier et dans l'agenda »).
//
// Un email envoyé vaut « projet envoyé » quand un destinataire est une adresse du dossier (client, partie, confrère) — un email
// interne « projet VTE - NOM » n'est pas un envoi au client — ET : son objet dit un projet d'acte / de vente (jamais une réponse
// « RE: », ni une relecture, un compromis ou une promesse), OU (étude 07/10 : « détecter aussi dans le corps de l'email ») il porte
// une pièce jointe et son texte, partie citée retirée, dit « projet d'acte de vente ». Le corps n'est lu que pour un email
// candidat (dossier à cocher, destinataire du dossier, pièce jointe, objet muet), le temps du test, jamais gardé.
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
const RE_CORPS_PROJET = /PROJET\s+(D.\s*|DE\s+L.\s*)ACTE\s+DE\s+VENTE/;
// Un projet annoncé ou demandé n'est pas un projet envoyé.
const RE_CORPS_FUTUR = /(VOUS\s+)?(ENVERRAI|ENVERRONS|ADRESSERAI|ADRESSERONS|TRANSMETTRAI|TRANSMETTRONS|FERAI\s+PARVENIR|FERONS\s+PARVENIR)\b[^.]{0,60}PROJET\s+(D.\s*|DE\s+L.\s*)ACTE/;

/** L'objet d'un email envoyé dit-il l'envoi d'un projet d'acte de vente ? @param {string} objet */
function objetDitProjetActe(objet) {
  if (RE_REPONSE.test(String(objet || ''))) return false;
  const n = normaliser(objet);
  return RE_OBJET_PROJET.test(n) && !RE_OBJET_EXCLU.test(n);
}

/** Le texte d'un email (partie citée déjà retirée) dit-il qu'un projet d'acte de vente est joint ? @param {string} corps */
function corpsDitProjetActe(corps) {
  const n = normaliser(corps);
  return RE_CORPS_PROJET.test(n) && !RE_CORPS_FUTUR.test(n);
}

/**
 * Le dossier et les destinataires permettent-ils une détection (objet et corps mis à part) ? Pure.
 * @param {any} d @param {{ a?: string[] }} envoye
 */
function envoiAuDossierACocher(d, envoye) {
  if (!d || d.archive || estSuccession(d)) return false;
  if (echeanceValidee(d, 'projetEnvoye')) return false;
  if (d.detectionsEmails && d.detectionsEmails.projetEnvoye) return false;
  const adresses = new Set(adressesDuDossier(d));
  return ((envoye && envoye.a) || []).some((x) => adresses.has(String(x).toLowerCase()));
}

/** Le texte de cet email mérite-t-il d'être lu (objet muet, pièce jointe, dossier à cocher) ? Pure. @param {any} d @param {any} envoye */
function corpsALirePourProjet(d, envoye) {
  return !!(envoye && envoye.pj) && !objetDitProjetActe(envoye.objet) && envoiAuDossierACocher(d, envoye);
}

/**
 * Faut-il cocher « projet envoyé » sur ce dossier d'après cet email envoyé ? Pure.
 * @param {any} d @param {{ objet: string, a?: string[], date: string, pj?: boolean, corps?: string }} envoye
 */
function projetEnvoyeADetecter(d, envoye) {
  if (!envoiAuDossierACocher(d, envoye)) return false;
  return objetDitProjetActe(envoye.objet) || (!!envoye.pj && corpsDitProjetActe(envoye.corps || ''));
}

/** Date du jour de l'envoi en heure de Paris (AAAA-MM-JJ). @param {string} iso */
function jourParis(iso) {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })
    : t.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

/**
 * Coche « projet envoyé » sur le dossier (comme `cocherEcheance` du poste) et le dit dans l'historique. Rend vrai si coché.
 * @param {any} d @param {{ objet: string, a?: string[], date: string, pj?: boolean, corps?: string }} envoye
 */
function cocherProjetEnvoye(d, envoye) {
  if (!projetEnvoyeADetecter(d, envoye)) return false;
  const jour = jourParis(envoye.date);
  d.projetEnvoye = jour;
  d.echeancesValidees = d.echeancesValidees && typeof d.echeancesValidees === 'object' ? d.echeancesValidees : {};
  d.echeancesValidees.projetEnvoye = true;
  d.detectionsEmails = Object.assign({}, d.detectionsEmails, { projetEnvoye: jour });
  d.historique = Array.isArray(d.historique) ? d.historique : [];
  const ou = objetDitProjetActe(envoye.objet) ? 'objet' : 'texte';
  d.historique.push({ date: new Date().toISOString(), texte: `Envoi projet : projet d’acte retrouvé dans les emails envoyés (${ou} de l’email du ${jour.split('-').reverse().join('/')}) — échéance cochée` });
  return true;
}

module.exports = { objetDitProjetActe, corpsDitProjetActe, corpsALirePourProjet, projetEnvoyeADetecter, cocherProjetEnvoye };
