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
  d.historique.push({ date: new Date().toISOString(), texte: texteHistoriqueProjetEnvoye(envoye, adressesDuDossier(d)) });
  return true;
}

/**
 * Ce que l'historique du dossier dit d'une détection (étude 07/10 : « mettre dans l'historique comment est détecté l'envoi du
 * projet ») : quel email (jour et heure, boîte, destinataires du dossier, objet) et ce qui l'a fait reconnaître — l'objet, ou la
 * pièce jointe et la mention « projet d'acte de vente » du texte (le texte lui-même n'est jamais écrit). Pure.
 * @param {{ objet: string, a?: string[], date: string, pj?: boolean, collaborateur?: string, boite?: string }} envoye
 * @param {string[]} [adressesDossier]
 */
function texteHistoriqueProjetEnvoye(envoye, adressesDossier) {
  const t = new Date(envoye.date);
  const quand = Number.isNaN(t.getTime()) ? '' : ` le ${t.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} à ${t.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')}`;
  const de = envoye.collaborateur || envoye.boite || '';
  const connues = adressesDossier ? new Set(adressesDossier.map((x) => String(x).toLowerCase())) : null;
  const a = (envoye.a || []).filter((x) => !connues || connues.has(String(x).toLowerCase())).slice(0, 3);
  const objet = String(envoye.objet || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const motif = objetDitProjetActe(envoye.objet)
    ? 'son objet parle d’un projet d’acte'
    : 'il porte une pièce jointe et son texte dit « projet d’acte de vente »';
  return `Envoi projet coché seul : email envoyé${quand}${de ? ` par ${de}` : ''}${a.length ? ` à ${a.join(', ')}` : ''}${objet ? `, objet « ${objet} »` : ''} — ${motif}. À décocher si ce n’était pas le projet.`;
}

module.exports = { objetDitProjetActe, corpsDitProjetActe, corpsALirePourProjet, projetEnvoyeADetecter, cocherProjetEnvoye, texteHistoriqueProjetEnvoye };
