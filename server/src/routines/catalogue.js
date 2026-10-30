// @ts-check
'use strict';
// Catalogue des routines de CLAIRE (étude 24/10, cadrage : docs/spec-routines-claire.md) : ce que CLAIRE sait — ou saura — préparer seule,
// avec pour chaque routine ses « gestes » (ce qu'elle peut faire) et le niveau d'autonomie maximal de chacun. Toutes les phases sont
// construites depuis le 25/10 (étude : « il me faut toutes les phases pour demain ») : exécutants dans executants.js (par le code) et ia.js
// (par l'IA en ligne, noms masqués) ; une nouvelle routine = une entrée ici, son exécutant, son test et son point de vérification sur le terrain.
//
// Trois niveaux d'autonomie, réglables routine par routine et geste par geste :
//   1 — Proposer : un brouillon, un document ou une tâche arrive dans la boîte de propositions ; le collaborateur autorise ou refuse.
//   2 — Valider, puis CLAIRE agit : le collaborateur relit et autorise, CLAIRE exécute elle-même — pour un geste vers l'extérieur (`sensible` :
//       envoyer un email, écrire dans l'agenda) elle l'envoie après « Autoriser », sans second clic ; pour un geste interne (cocher, noter) elle
//       le fait et le signe « CLAIRE », avec « Annuler ». Pour un geste vers l'extérieur, décision de l'étude (étude 24/10), réservée à l'administrateur.
//   3 — Agir seule, vers l'extérieur (envoyer un email, écrire dans l'agenda) sans validation préalable : décision explicite de l'étude, geste par geste.
//       Aucun geste ne l'accepte encore (25/10) : un email est composé sur le poste (signature, logos), le serveur ne sait pas l'envoyer seul.

/** @typedef {{ cle: string, libelle: string, niveauMax: 1 | 2 | 3, sensible?: boolean }} Geste */
/** @typedef {{ id: string, nom: string, icone: string, description: string, declencheur: string, phase: number, disponible: boolean, ia: boolean, gestes: Geste[], allumeeParDefaut?: boolean }} Routine */

/** @type {Record<number, { niveau: number, nom: string, court: string, detail: string }>} */
const NIVEAUX = {
  1: { niveau: 1, nom: 'Proposer', court: 'Je propose, vous décidez', detail: 'Le travail arrive dans la boîte de propositions : vous autorisez ou refusez. Rien ne part sans votre clic.' },
  2: { niveau: 2, nom: 'Valider, puis j’agis', court: 'Vous validez, j’exécute', detail: 'Vous relisez le travail préparé et vous autorisez : CLAIRE l’exécute elle-même, y compris l’envoi d’un email (sans second clic). Ce qui se défait (cocher, noter dans le dossier) est signé « CLAIRE », avec « Annuler ».' },
  3: { niveau: 3, nom: 'Agir seule', court: 'Je fais et j’envoie sans validation', detail: 'CLAIRE envoie ou écrit seule vers l’extérieur (email, agenda), sans votre validation. Décision de l’étude, geste par geste ; à n’accorder qu’après une période d’essai.' }
};

/** @type {Routine[]} */
const CATALOGUE = [
  { id: 'essai', nom: 'Exemples de propositions', icone: 'sparkle', phase: 0, disponible: true, declencheur: 'À la demande', ia: false,
    description: 'Quelques propositions d’exemple, sans dossier réel.',
    gestes: [{ cle: 'proposer', libelle: 'Déposer des exemples dans la boîte', niveauMax: 1 }] },
  { id: 'revue-matin', nom: 'Revue du matin', icone: 'clipboard', phase: 1, disponible: true, declencheur: 'Jours ouvrés, 9 h 15', ia: true,
    description: 'Repère ce qui bloque chaque dossier et prépare la relance de l’offre de prêt.',
    gestes: [{ cle: 'relance', libelle: 'Préparer la relance de l’offre de prêt', niveauMax: 2, sensible: true }, { cle: 'tache', libelle: 'Poser une tâche dans « À faire »', niveauMax: 1 }] },
  { id: 'veille-signature', nom: 'Veille de signature', icone: 'calendar', phase: 1, disponible: true, declencheur: '48 h avant le rendez-vous', ia: false,
    description: 'Prépare la fiche de signature deux jours avant le rendez-vous.',
    gestes: [{ cle: 'fiche', libelle: 'Préparer la fiche de signature', niveauMax: 1 }] },
  { id: 'constitution', nom: 'Constitution de dossier', icone: 'folder', phase: 2, disponible: true, declencheur: 'À la création du dossier', ia: false,
    description: 'Prépare les courriers de la Constitution avec le plan cadastral.',
    gestes: [{ cle: 'courriers', libelle: 'Préparer les courriers', niveauMax: 1 }] },
  { id: 'appel-fonds', nom: 'Appel de fonds', icone: 'banknote', phase: 2, disponible: true, declencheur: '10 jours avant la signature', ia: false,
    description: 'Prépare le courrier et le décompte quand l’étude représente l’acquéreur.',
    gestes: [{ cle: 'courrier', libelle: 'Préparer le courrier et le décompte', niveauMax: 1 }] },
  { id: 'autorisations-notoriete', nom: 'Autorisations de fonds (notoriété)', icone: 'file-text', phase: 2, disponible: true, declencheur: '48 h avant une notoriété', ia: false,
    description: 'Prépare les autorisations de fonds des comptes du défunt.',
    gestes: [{ cle: 'pdf', libelle: 'Préparer les autorisations', niveauMax: 1 }] },
  { id: 'relance-pieces', nom: 'Relance des pièces demandées', icone: 'mail', phase: 3, disponible: true, declencheur: '48 h après un email qui réclame une pièce', ia: true,
    description: 'Prépare la relance des pièces demandées et pas encore reçues.',
    gestes: [{ cle: 'relance', libelle: 'Préparer l’email de relance', niveauMax: 2, sensible: true }] },
  { id: 'proposition-dates', nom: 'Proposition de dates', icone: 'clock', phase: 3, disponible: true, declencheur: 'Dossier complet sans rendez-vous', ia: true,
    description: 'Prépare le sondage de dates d’un dossier complet sans rendez-vous.',
    gestes: [{ cle: 'email', libelle: 'Préparer le sondage de dates', niveauMax: 1 }] },
  { id: 'reponses-emails', nom: 'Réponses aux emails du soir', icone: 'mail', phase: 3, disponible: true, declencheur: 'Chaque matin ouvré, pour les emails reçus depuis la veille ouvrée 18 h (week-end et jours fériés compris)', ia: true,
    description: 'Un brouillon de réponse pour chaque email reçu après 18 h.',
    gestes: [{ cle: 'reponse', libelle: 'Préparer le brouillon de réponse', niveauMax: 2, sensible: true }] },
  { id: 'formalites-authentic', nom: 'Demandes Comedec et casier dans Authentic', icone: 'file-text', phase: 2, disponible: true, allumeeParDefaut: true,
    declencheur: 'Dossier de vente relié à Authentic : état civil à l’ouverture (dossiers créés depuis le 27/10), casier à 30 jours de la signature', ia: false,
    description: 'Prépare dans Authentic l’état civil (Comedec) et le casier judiciaire (CJN), sans envoi.',
    gestes: [{ cle: 'comedec', libelle: 'Préparer la demande d’état civil (Comedec)', niveauMax: 1 }, { cle: 'cjn', libelle: 'Préparer la demande de casier judiciaire (CJN)', niveauMax: 1 }] },
  { id: 'controle-rendez-vous', nom: 'Contrôle du rendez-vous de signature', icone: 'calendar', phase: 4, disponible: true, allumeeParDefaut: true, declencheur: 'Chaque matin, pour toute signature à venir (une alerte par date et par liste de points)', ia: false,
    description: 'Vérifie que la date tient : délai de réflexion de l’offre, vente préalable, DIA et SAFER, pièces, diagnostics encore valables.',
    gestes: [{ cle: 'alerte', libelle: 'Prévenir dans le canal du dossier', niveauMax: 1 }] },
  { id: 'dossiers-bloques', nom: 'Dossiers qui n’avancent plus', icone: 'clock', phase: 4, disponible: true, allumeeParDefaut: false, declencheur: 'Rien de neuf depuis trois semaines', ia: false,
    description: 'Signale au responsable un dossier sans activité depuis trois semaines et ce qui le retient.',
    gestes: [{ cle: 'alerte', libelle: 'Prévenir dans le canal du dossier', niveauMax: 1 }] },
  { id: 'emails-recus', nom: 'Emails reçus dans un dossier', icone: 'mail', phase: 4, disponible: true, allumeeParDefaut: false, declencheur: 'Un email d’une adresse de la fiche, avec pièce jointe ou sujet reconnu (offre, fonds, RIB, rendez-vous…)', ia: false,
    description: 'Dit dans le canal du dossier ce qui est arrivé et ce que CLAIRE peut en faire (ranger, cocher, préparer la suite).',
    gestes: [{ cle: 'alerte', libelle: 'Prévenir dans le canal du dossier', niveauMax: 1 }] },
  { id: 'relances-formalites', nom: 'Relance des organismes', icone: 'mail', phase: 5, disponible: true, allumeeParDefaut: true, declencheur: 'Demande d’Authentic sans réponse après son délai (15 jours, DIA 45 jours)', ia: false,
    description: 'Rappelle de relancer la mairie ou l’organisme quand une pièce demandée par Authentic n’est pas revenue.',
    gestes: [{ cle: 'tache', libelle: 'Poser la relance dans « À faire »', niveauMax: 1 }] },
  { id: 'veille-juridique', nom: 'Veille juridique', icone: 'scale', phase: 3, disponible: true, declencheur: 'Chaque semaine, le premier jour ouvré', ia: true,
    description: 'Résume l’actualité notariale de la semaine (CNAF, CRIDON).',
    gestes: [{ cle: 'resume', libelle: 'Déposer le résumé hebdomadaire', niveauMax: 1 }] }
];

/** @param {string} id @returns {Routine | undefined} */
function routineParId(id) {
  return CATALOGUE.find((r) => r.id === id);
}

module.exports = { NIVEAUX, CATALOGUE, routineParId };
