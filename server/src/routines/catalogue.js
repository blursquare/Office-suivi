// @ts-check
'use strict';
// Catalogue des routines de CLAIRE (étude 24/10, cadrage : docs/spec-routines-claire.md) : ce que CLAIRE sait — ou saura — préparer seule,
// avec pour chaque routine ses « gestes » (ce qu'elle peut faire) et le niveau d'autonomie maximal de chacun. Phase 0 (le socle) : seule la
// routine « essai » existe ; les autres sont décrites pour que l'étude règle d'avance leur autonomie, elles s'allument aux phases suivantes.
//
// Trois niveaux d'autonomie, réglables routine par routine et geste par geste :
//   1 — Proposer : un brouillon, un document ou une tâche arrive dans la boîte de propositions ; le collaborateur autorise ou refuse.
//   2 — Valider, puis CLAIRE agit : le collaborateur relit et autorise, CLAIRE exécute elle-même — pour un geste vers l'extérieur (`sensible` :
//       envoyer un email, écrire dans l'agenda) elle l'envoie après « Autoriser », sans second clic ; pour un geste interne (cocher, noter) elle
//       le fait et le signe « CLAIRE », avec « Annuler ». Pour un geste vers l'extérieur, décision de l'étude (étude 24/10), réservée à l'administrateur.
//   3 — Agir seule, vers l'extérieur (envoyer un email, écrire dans l'agenda) sans validation préalable : décision explicite de l'étude, geste par geste.

/** @typedef {{ cle: string, libelle: string, niveauMax: 1 | 2 | 3, sensible?: boolean }} Geste */
/** @typedef {{ id: string, nom: string, icone: string, description: string, declencheur: string, phase: number, disponible: boolean, ia: boolean, gestes: Geste[] }} Routine */

/** @type {Record<number, { niveau: number, nom: string, court: string, detail: string }>} */
const NIVEAUX = {
  1: { niveau: 1, nom: 'Proposer', court: 'Je propose, vous décidez', detail: 'Le travail arrive dans la boîte de propositions : vous autorisez ou refusez. Rien ne part sans votre clic.' },
  2: { niveau: 2, nom: 'Valider, puis j’agis', court: 'Vous validez, j’exécute', detail: 'Vous relisez le travail préparé et vous autorisez : CLAIRE l’exécute elle-même, y compris l’envoi d’un email (sans second clic). Ce qui se défait (cocher, noter dans le dossier) est signé « CLAIRE », avec « Annuler ».' },
  3: { niveau: 3, nom: 'Agir seule', court: 'Je fais et j’envoie sans validation', detail: 'CLAIRE envoie ou écrit seule vers l’extérieur (email, agenda), sans votre validation. Décision de l’étude, geste par geste ; à n’accorder qu’après une période d’essai.' }
};

/** @type {Routine[]} */
const CATALOGUE = [
  { id: 'essai', nom: 'Exemples de propositions', icone: 'sparkle', phase: 0, disponible: true, declencheur: 'À la demande', ia: false,
    description: 'Dépose quelques propositions d’exemple dans votre boîte pour voir à quoi ressemblera le travail de CLAIRE. Sans aucun dossier réel.',
    gestes: [{ cle: 'proposer', libelle: 'Déposer des exemples dans la boîte', niveauMax: 1 }] },
  { id: 'revue-matin', nom: 'Revue du matin', icone: 'clipboard', phase: 1, disponible: false, declencheur: 'Jours ouvrés, 9 h 30', ia: true,
    description: 'Repère ce qui bloque chaque dossier (prêt dépassé, pièce manquante, rendez-vous sans appel de fonds) et prépare les relances.',
    gestes: [{ cle: 'relance', libelle: 'Préparer les relances en brouillon', niveauMax: 3, sensible: true }, { cle: 'tache', libelle: 'Poser une tâche dans « À faire »', niveauMax: 2 }] },
  { id: 'veille-signature', nom: 'Veille de signature', icone: 'calendar', phase: 1, disponible: false, declencheur: '48 h avant le rendez-vous', ia: false,
    description: 'Prépare et contrôle la fiche de signature, puis prévient le responsable sur Teams.',
    gestes: [{ cle: 'fiche', libelle: 'Préparer la fiche de signature', niveauMax: 2 }, { cle: 'alerte', libelle: 'Alerter sur Teams', niveauMax: 2 }] },
  { id: 'constitution', nom: 'Constitution de dossier', icone: 'folder', phase: 2, disponible: false, declencheur: 'À la création du dossier', ia: false,
    description: 'Prépare les courriers de la Constitution (mairie, urbanisme, assainissement, succession) avec le plan cadastral. Une constitution déjà faite n’est jamais refaite.',
    gestes: [{ cle: 'courriers', libelle: 'Préparer les courriers', niveauMax: 1 }, { cle: 'envoi', libelle: 'Envoyer les emails aux services', niveauMax: 3, sensible: true }] },
  { id: 'appel-fonds', nom: 'Appel de fonds', icone: 'banknote', phase: 2, disponible: false, declencheur: '10 jours avant la signature', ia: false,
    description: 'Prépare le courrier et le décompte quand l’étude représente l’acquéreur, avec les pièces du NAS ou le décompte du confrère.',
    gestes: [{ cle: 'courrier', libelle: 'Préparer le courrier et le décompte', niveauMax: 1 }, { cle: 'email', libelle: 'Envoyer l’email à l’acquéreur', niveauMax: 3, sensible: true }] },
  { id: 'autorisations-notoriete', nom: 'Autorisations de fonds (notoriété)', icone: 'file-text', phase: 2, disponible: false, declencheur: '48 h avant une notoriété', ia: false,
    description: 'Prépare les autorisations de clôture ou de transfert de fonds des comptes du défunt.',
    gestes: [{ cle: 'pdf', libelle: 'Préparer les autorisations', niveauMax: 1 }, { cle: 'email', libelle: 'Envoyer aux banques', niveauMax: 3, sensible: true }] },
  { id: 'relance-pieces', nom: 'Relance des pièces demandées', icone: 'mail', phase: 3, disponible: false, declencheur: '48 h après un email qui réclame une pièce', ia: true,
    description: 'Lit les emails envoyés, relève les pièces demandées et prépare la relance si elles ne sont pas sur le NAS 48 h après.',
    gestes: [{ cle: 'relance', libelle: 'Préparer l’email de relance', niveauMax: 3, sensible: true }] },
  { id: 'proposition-dates', nom: 'Proposition de dates', icone: 'clock', phase: 3, disponible: false, declencheur: 'Dossier complet sans rendez-vous', ia: true,
    description: 'Quand un dossier est complet, prépare le brouillon de proposition de dates aux clients (et au confrère).',
    gestes: [{ cle: 'email', libelle: 'Préparer l’email de dates', niveauMax: 3, sensible: true }, { cle: 'options', libelle: 'Poser des options dans l’agenda', niveauMax: 3, sensible: true }] },
  { id: 'veille-juridique', nom: 'Veille juridique', icone: 'scale', phase: 3, disponible: false, declencheur: 'Chaque semaine', ia: true,
    description: 'Résume les nouveautés de Légifrance et du BOFiP utiles à l’office. Aucune donnée de client.',
    gestes: [{ cle: 'resume', libelle: 'Déposer le résumé hebdomadaire', niveauMax: 1 }] }
];

/** @param {string} id @returns {Routine | undefined} */
function routineParId(id) {
  return CATALOGUE.find((r) => r.id === id);
}

module.exports = { NIVEAUX, CATALOGUE, routineParId };
