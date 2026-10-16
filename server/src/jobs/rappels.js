// @ts-check
'use strict';

// Rappels automatiques par email — remplace le DÉCLENCHEMENT AUTOMATIQUE des rappels
// (auparavant : rien, en pratique — voir CLAUDE.md, "Ce qui n'a volontairement pas été fait" :
// aucune relance email automatique n'a jamais été câblée, seul un mailto manuel existait). Le
// rappel générique par email ("Rappel email" sur la fiche, `ouvrirEmailRappel()` côté client) a
// depuis été retiré DÉFINITIVEMENT, à la demande explicite de l'étude — ce job, avec sa copie
// systématique (voir `reglages.copieEmail` ci-dessous), le remplace entièrement.
//
// À des seuils PROPRES À CHAQUE ÉCHÉANCE (voir SEUILS_RAPPELS_PAR_TYPE), sur toutes les échéances
// actives d'un dossier (prêt, vente préalable, appel de fonds, signature, personnalisées) — pas
// seulement le prêt comme l'export
// .ics manuel (volontairement limité par l'étude à cette seule date pour un export ponctuel d'UN
// dossier) : ce mécanisme couvre tout le portefeuille. `d.reminderDays` (propre au seul export .ics, vide sur un
// dossier sans condition de prêt) n'est donc volontairement PAS utilisé ici : un dossier sans prêt
// doit quand même être rappelé pour sa signature d'acte ou sa vente préalable.
//
// toutesEcheances()/echeanceValidee() sont une DUPLICATION volontaire de leurs équivalents dans
// script.js (navigateur) : ce projet n'a pas de mécanisme de build partagé entre les deux mondes
// (choix assumé, documenté dans CLAUDE.md) — en modifiant
// l'une des deux, vérifier si l'autre a besoin du même changement.

const { envoyerEmail, envoiConfigure, memeAdresseEmail } = require('../envoiEmail');
const { mettreCopiesEnAttente, executerNettoyageGmail } = require('../nettoyageGmail');
const { piecesRecuesEtManquantes } = require('../piecesChecklist');
// Code commun au poste et au serveur (commun/, 04/10) : le planning, la validation d'une échéance, la SAFER, le bilan des
// fonds, le format des montants et le libellé d'un dossier ne sont plus recopiés ici — une seule écriture pour les deux.
const { echeanceValidee, echeanceSaferDossier, echeancesPlanning, JOURS_RELANCE_FONDS } = require('../../../commun/planning');
const { bilanFondsRecus: bilanFonds, bilanFondsDossier, formaterMontantEuros: formaterEuros } = require('../../../commun/montants');
const { libelleDossierAffiche: libelleDossier, estSuccession } = require('../../../commun/dossier');

// Les échéances d'un dossier pour les rappels : celles du planning du poste (echeancesPlanning), une échéance
// personnalisée étant désignée par `autre-<index>` — c'est cette clé que portent les seuils (seuilsPourType) et le journal
// des rappels envoyés (reminder_log) ; ne pas la changer.
function toutesEcheances(d) {
  return echeancesPlanning(d).map((it) => (it.type === 'autre' ? { type: 'autre-' + it.index, label: it.label, iso: it.iso } : it));
}

// Seuils de rappel PAR ÉCHÉANCE, donnés un par un par l'étude — pas un seuil unique pour tout.
// Une signature d'acte se prépare de plus loin qu'un appel de fonds, et un appel de fonds doit
// partir assez tôt pour que le virement arrive : c'est la seule raison pour laquelle ces quatre
// couples diffèrent. La DATE BUTOIR (`acte`) n'y figure volontairement pas — elle ne déclenche
// aucun rappel (voir toutesEcheances ci-dessous), c'est le rendez-vous pris à l'office qui engage
// l'étude.
const SEUILS_RAPPELS_PAR_TYPE = {
  pret: [15, 7],
  ventebien: [15, 7],
  // Appel de fonds (étude 05/10 : « pour Teams il faut suivre les délais des échanges, donc appel de fonds 10 j avant,
  // pas 15 j ») : un seul rappel, le jour de son échéance — 10 jours avant le rendez-vous (echeanceAppelFonds).
  appelFonds: [0],
  rendezVousSignature: [25, 15],
  // Délai SAFER (étude, 02/10) : une date butoir du planning, sans rappel — à son terme la
  // non-préemption est acquise d'elle-même (appliquerSaferTacite côté client).
  safer: [],
  dia: [],
  // Envoi du projet d'acte (étude 06/10 : « pas de rappel d'envoi du projet d'acte 15 j avant ») : un seul rappel, à J-7 du
  // rendez-vous — le même jour que la tâche « Envoyer le projet » d'« À faire ». J-15 est déjà celui de la signature.
  projetEnvoye: [7],
  // Rédaction de l'acte (étude 07/10) : une tâche d'« À faire », sans rappel Teams.
  redaction: [],
  // Succession (étude 16/10) : décompte à faire valider et appel de fonds, le jour de leur échéance (10 jours avant le dernier rendez-vous).
  decompteSuccession: [0],
  appelFondsSuccession: [0]
};

// Échéance personnalisée (`autre-0`, `autre-1`…) : l'étude n'a pas de seuil à donner pour une date
// qu'elle nomme elle-même au cas par cas, ce repli reprend donc l'ancien couple unique.
const SEUILS_RAPPELS_DEFAUT = [15, 7];

function seuilsPourType(type) {
  return SEUILS_RAPPELS_PAR_TYPE[type] || SEUILS_RAPPELS_DEFAUT;
}

// Compté en UTC (même piège déjà documenté pour joursEntre() côté prorata — une différence entre
// dates locales n'est pas un multiple exact de 86 400 000 ms aux bascules heure d'été/hiver).
function joursRestants(iso, aujourdHui) {
  const cible = new Date(iso + 'T00:00:00Z').getTime();
  const jour = new Date(aujourdHui + 'T00:00:00Z').getTime();
  return Math.round((cible - jour) / 86400000);
}

// Fonction pure et testable : à partir des dossiers actifs et de la date du jour, renvoie les
// rappels dus — une entrée par (dossier, échéance, seuil) tombant EXACTEMENT sur ce jour.
// `dejaEnvoyes` (un Set de `${dossierId}:${type}:${seuil}`) filtre ceux déjà notifiés — le job
// tourne toutes les 30 minutes, largement plusieurs fois entre le début et la fin du jour concerné.
function calculerRappelsDus(dossiers, aujourdHui, dejaEnvoyes) {
  const dus = [];
  for (const d of dossiers || []) {
    if (!d || d.archive || !d.responsable) continue;
    // Un dossier abîmé ne bloque jamais les rappels des autres (audit 12/10 : une donnée inattendue arrêtait tout le tour).
    let pieces;
    let echeances;
    try {
      // Calculé une fois par dossier (pas par échéance/seuil) : ce sont les mêmes pièces quelle que
      // soit l'échéance qui déclenche le rappel.
      pieces = piecesRecuesEtManquantes(d);
      echeances = toutesEcheances(d);
    } catch (e) {
      console.warn('[CLAIRE] Rappels : dossier illisible ignoré', d.id, e && e.message);
      continue;
    }
    for (const e of echeances) {
      const j = joursRestants(e.iso, aujourdHui);
      for (const seuil of seuilsPourType(e.type)) {
        if (j !== seuil) continue;
        const reminderKey = `${e.type}:${seuil}${e.ancreButoir ? `@${e.iso}` : ''}`;
        if (dejaEnvoyes && dejaEnvoyes.has(`${d.id}:${reminderKey}`)) continue;
        dus.push({
          dossierId: d.id,
          nomDossier: libelleDossier(d), // même préfixe que l'affichage (libelleDossierAffiche, script.js)
          responsable: d.responsable,
          type: e.type,
          libelle: e.label || 'Échéance',
          iso: e.iso,
          seuil,
          reminderKey,
          pieces
        });
      }
    }
  }
  return dus;
}

// ---- Fonds de l'acquéreur (demandé par l'étude le 28/09) ----
// Deux messages Teams au collaborateur responsable, à partir de la dernière lecture des reçus
// comptables faite par CLAIRE (d.fondsRecus, écrit par le client : la lecture des PDF se fait dans
// le navigateur, le serveur ne fait que lire le résultat) :
//   1. « tous les fonds sont reçus » — une seule fois par dossier, dès que la lecture le montre ;
//   2. « fonds pas encore reçus en entier » — une seule fois par date de rendez-vous : à J-3, le jour de la relance au client
//      et de la confirmation des fonds (audit 07/10 ; étude 05/10 : « pour Teams il faut suivre les délais des échanges » —
//      J-2 avant), ou LE VENDREDI quand J-3 tombe un week-end (rendez-vous un mardi ou un mercredi). Jamais le samedi ni le
//      dimanche ; un jour manqué est rattrapé le premier jour ouvré suivant avant le rendez-vous.
// Rien quand la réception a déjà été confirmée au client (receptionFondsConfirmeeLe) : les fonds
// sont là, le collaborateur le sait. Rien non plus avant l'appel de fonds.

// 0 = dimanche … 6 = samedi, pour une date AAAA-MM-JJ (lue en UTC : pas de décalage de fuseau).
function jourSemaine(iso) {
  return new Date(iso + 'T00:00:00Z').getUTCDay();
}

function alertesFondsDues(dossiers, aujourdHui, dejaEnvoyes) {
  const dus = [];
  const deja = (d, cle) => !!(dejaEnvoyes && dejaEnvoyes.has(`${d.id}:${cle}`));
  const jourAuj = jourSemaine(aujourdHui);
  for (const d of dossiers || []) {
    // Succession (étude 16/10) : ni appel de fonds de vente ni fonds de l'acquéreur — rien de ces alertes.
    if (!d || d.archive || !d.responsable || d.receptionFondsConfirmeeLe || estSuccession(d)) continue;
    const j = d.rendezVousSignature ? joursRestants(d.rendezVousSignature, aujourdHui) : null;
    if (j !== null && j < 0) continue;
    const f = d.fondsRecus && typeof d.fondsRecus === 'object' ? d.fondsRecus : null;
    // Fonds validés à la main (compte CDC, étude 06/10) : réception complète même sans reçu lu.
    const bilan = f || d.fondsValidesLe ? bilanFondsDossier(d) : null;
    const base = {
      dossierId: d.id, nomDossier: libelleDossier(d), responsable: d.responsable, libelle: 'Fonds reçus',
      rdv: d.rendezVousSignature || '', heure: d.rendezVousSignatureHeure || '', bilan, verifieLe: f ? f.verifieLe || '' : ''
    };
    // Tous les fonds reçus (étude 05/10 : « recevoir une notification Teams ») : prévenu même si l'appel de fonds n'a pas été
    // noté envoyé dans CLAIRE — des fonds complets disent qu'il est parti.
    if (bilan && bilan.etat === 'complet') {
      if (!deja(d, 'fonds-complets')) dus.push(Object.assign(base, { genre: 'complets', reminderKey: 'fonds-complets' }));
      continue;
    }
    if (!(d.appelFonds || echeanceValidee(d, 'appelFonds'))) continue;
    if (j === null || jourAuj === 0 || jourAuj === 6) continue;
    const rdvMardiMercredi = [2, 3].includes(jourSemaine(d.rendezVousSignature));
    const leVendredi = jourAuj === 5 && rdvMardiMercredi && j <= 5;
    if (!leVendredi && j > JOURS_RELANCE_FONDS) continue;
    const cle = `fonds-incomplets:${d.rendezVousSignature}`;
    if (!deja(d, cle)) dus.push(Object.assign(base, { genre: 'incomplets', reminderKey: cle }));
  }
  return dus;
}

function formaterJourRdv(iso, heure) {
  const jour = new Date(iso + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return jour + (heure ? ` à ${heure.replace(':', ' h ')}` : '');
}

function texteAlerteFonds(a) {
  const rdv = a.rdv ? ` Rendez-vous de signature le ${formaterJourRdv(a.rdv, a.heure)}.` : '';
  if (a.genre === 'complets') {
    const combien = a.bilan && a.bilan.manuel ? 'validés à la main, arrivés sur le compte de l’étude' : formaterEuros(a.bilan.total);
    return `💶 CLAIRE — Tous les fonds sont reçus pour le dossier ${a.nomDossier} (${combien}).${rdv}
Vous pouvez confirmer la réception des fonds au client depuis la fiche (onglet Fonds).`;
  }
  const b = a.bilan;
  const quand = a.verifieLe ? ` (reçus lus le ${new Date(a.verifieLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })})` : '';
  const etat = !b ? 'les reçus comptables n’ont pas encore été vérifiés dans CLAIRE'
    : b.etat === 'partiel' ? `${formaterEuros(b.total)} reçus sur ${formaterEuros(b.attendu)}, il manque ${formaterEuros(b.reste)}${quand}`
    : b.etat === 'inconnu' ? `${formaterEuros(b.total)} reçus, montant attendu inconnu${quand}`
    : b.etat === 'excedent' ? `${formaterEuros(b.total)} reçus pour ${formaterEuros(b.attendu)} attendus : l'écart est à vérifier dans CLAIRE${quand}`
    : `aucun versement de l’acquéreur trouvé dans les reçus${quand}`;
  return `⚠️ CLAIRE — Fonds pas encore reçus en entier pour le dossier ${a.nomDossier} :${rdv}
À ce jour, ${etat}.`;
}

// Les pièces reçues/manquantes (voir piecesChecklist.js) sont ajoutées au message SEULEMENT si le
// dossier a une checklist applicable (jamais pour un rôle "participant", voir la fonction) — sans
// quoi le message afficherait deux lignes vides "(0) : aucune" sur chaque rappel de ce type de
// dossier, du bruit plutôt qu'une information.
// Un seul texte par rappel, sans objet séparé : l'objet de l'email transporte désormais l'adresse
// du destinataire, lue par le flux pour router le message Teams (voir envoiEmail.js). L'ancien
// `sujetRappel()` a disparu avec l'architecture qui l'avait fait naître — il ne faisait de toute
// façon que répéter la première phrase de ce corps, déjà autonome.
function texteRappel(r) {
  const jour = r.seuil === 1 ? 'jour' : 'jours';
  let texte = r.seuil === 0
    ? `📌 CLAIRE — Rappel : « ${r.libelle} » du dossier ${r.nomDossier} est à faire aujourd'hui (le ${r.iso}).`
    : `📌 CLAIRE — Rappel : « ${r.libelle} » du dossier ${r.nomDossier} arrive à échéance dans ${r.seuil} ${jour} (le ${r.iso}).`;
  const { recues, manquantes } = r.pieces || { recues: [], manquantes: [] };
  if (recues.length || manquantes.length) {
    texte += `\n\nPièces reçues (${recues.length}) : ${recues.length ? recues.join(', ') : 'aucune'}`;
    texte += `\nPièces manquantes (${manquantes.length}) : ${manquantes.length ? manquantes.join(', ') : 'aucune'}`;
  }
  return texte;
}

// Un seul tour : lit les réglages (SMTP + passerelle + emails), calcule les rappels dus, envoie ceux dont le
// collaborateur a une adresse configurée, et marque chaque envoi réussi dans reminder_log pour ne
// jamais le renvoyer. `envoyerFn` injectable (voir server/test/rappels.test.js) — la vraie fonction
// par défaut est envoyerEmail().
//
// `reglages.copieEmail` (voir parametresRepo.js) reçoit un DOUBLE de chaque message
// effectivement envoyé au responsable — demandé explicitement par l'étude, pour être tenue au
// courant de tous les envois sans dépendre du fait qu'elle soit elle-même responsable du dossier
// concerné. Envoyée uniquement APRÈS un envoi principal réussi (jamais à sa place, jamais si le
// responsable n'a pas d'adresse configurée — rien n'a alors été envoyé du tout), et jamais en
// double si la copie coïncide avec l'adresse du responsable lui-même. Un échec de la copie est
// consigné dans `erreurs` mais ne remet jamais en cause le marquage du rappel principal comme
// envoyé : c'est lui qui compte pour ne pas relancer le collaborateur concerné.
//
// Avec un compte Gmail, les copies rangées par Gmail dans « Messages envoyés » sont effacées en UNE
// seule connexion IMAP par tour, et seulement DEUX HEURES après leur envoi (voir nettoyageGmail.js :
// le flux Power Automate lit ce même message, il ne faut pas l'effacer avant). Un échec d'effacement
// est un AVERTISSEMENT, jamais une erreur : les rappels, eux, sont bien partis — l'encart de
// l'écran Réglages ne doit pas passer au rouge pour une copie restée chez Google.
// `options.effacerFn` injectable pour les tests.
async function executerTacheRappels(depot, db, parametresRepo, envoyerFn, aujourdHui, declenche, options) {
  const resultat = { rappelsDus: 0, rappelsEnvoyes: 0, erreurs: [], avertissements: [] };
  const reglages = parametresRepo.lireReglages();
  // Envoi non configuré : on sort SANS rien consigner. Écrire un compte rendu vide écraserait le
  // dernier vrai tour par une ligne qui ne dit rien — et l'écran Réglages affiche déjà, à sa
  // place, que l'envoi n'est pas activé.
  if (!envoiConfigure(reglages)) return resultat;

  const jour = aujourdHui || new Date().toISOString().slice(0, 10);
  const dossiers = depot.tousActifs();

  const dejaEnvoyes = new Set(
    db.prepare('SELECT dossier_id, reminder_key FROM reminder_log').all()
      .map((l) => `${l.dossier_id}:${l.reminder_key}`)
  );

  /** @type {Array<Record<string, any>>} */
  const dus = [].concat(calculerRappelsDus(dossiers, jour, dejaEnvoyes),
    alertesFondsDues(dossiers, jour, dejaEnvoyes).map((a) => Object.assign(a, { texte: texteAlerteFonds(a) })));
  resultat.rappelsDus = dus.length;

  const marquerStmt = db.prepare('INSERT OR IGNORE INTO reminder_log (dossier_id, reminder_key, sent_at) VALUES (?, ?, ?)');
  const envoyer = envoyerFn || envoyerEmail;
  const messagesEnvoyes = [];

  for (const r of dus) {
    const email = reglages.emailsResponsables[r.responsable];
    if (!email) {
      resultat.erreurs.push(`${r.responsable} : aucune adresse email configurée (voir Réglages).`);
      continue;
    }
    const texte = r.texte || texteRappel(r);
    const envoi = await envoyer(reglages, email, texte);
    if (envoi.ok) {
      resultat.rappelsEnvoyes++;
      if (envoi.messageId) messagesEnvoyes.push(envoi.messageId);
      marquerStmt.run(r.dossierId, r.reminderKey, new Date().toISOString());
      if (reglages.copieEmail && !memeAdresseEmail(reglages.copieEmail, email)) {
        const copie = await envoyer(reglages, reglages.copieEmail, texte);
        if (copie.ok && copie.messageId) messagesEnvoyes.push(copie.messageId);
        if (!copie.ok) {
          resultat.erreurs.push(`Copie (${reglages.copieEmail}) pour ${r.nomDossier} — ${r.libelle} : ${copie.erreur}`);
        }
      }
    } else {
      resultat.erreurs.push(`${r.nomDossier} — ${r.libelle} : ${envoi.erreur}`);
    }
  }

  // Les copies de CE tour sont seulement mises en attente : le flux doit d'abord avoir lu le
  // message (voir nettoyageGmail.js). Ce tour efface en revanche celles des tours précédents dont
  // le délai est écoulé. Le garde-fou `typeof` couvre les tests qui passent un faux dépôt réduit.
  if (typeof parametresRepo.lireCopiesEnAttente === 'function') {
    mettreCopiesEnAttente(parametresRepo, reglages, messagesEnvoyes);
    const nettoyage = await executerNettoyageGmail(parametresRepo, reglages, options && options.effacerFn);
    if (nettoyage.avertissement) resultat.avertissements.push(nettoyage.avertissement);
  }

  // Le compte rendu est consigné ICI plutôt que chez l'appelant : les deux appelants (le minuteur
  // et le bouton « Lancer un tour maintenant ») doivent le faire, et l'oubli de l'un des deux
  // rouvrirait exactement le trou qu'on vient de boucher. Le garde-fou `typeof` couvre les tests
  // qui passent un faux dépôt réduit à `lireReglages`.
  if (typeof parametresRepo.ecrireDernierTour === 'function') {
    parametresRepo.ecrireDernierTour({
      at: new Date().toISOString(),
      rappelsDus: resultat.rappelsDus,
      rappelsEnvoyes: resultat.rappelsEnvoyes,
      erreurs: resultat.erreurs,
      avertissements: resultat.avertissements,
      declenche: declenche === 'manuel' ? 'manuel' : 'automatique'
    });
  }
  return resultat;
}

// 30 minutes (config.intervalleRappelsMs, déjà réservée à cet usage depuis le tout premier schéma
// de la base — voir db.js/config.js) : une échéance à J-15/J-7 n'a jamais besoin d'une précision
// à la minute, un tour toutes les demi-heures suffit largement à couvrir la journée du seuil.
function demarrerTacheRappels(depot, db, config, parametresRepo, envoyerFn) {
  const tour = () => {
    executerTacheRappels(depot, db, parametresRepo, envoyerFn).catch((e) => {
      console.warn('[CLAIRE] Tâche de rappels par email interrompue :', e.message);
    });
  };
  tour(); // un premier passage tout de suite, pas seulement dans trente minutes
  return setInterval(tour, config.intervalleRappelsMs);
}

module.exports = {
  libelleDossier,
  SEUILS_RAPPELS_PAR_TYPE, SEUILS_RAPPELS_DEFAUT, seuilsPourType, echeanceValidee, toutesEcheances, joursRestants, echeanceSaferDossier,
  calculerRappelsDus, texteRappel, executerTacheRappels, demarrerTacheRappels,
  bilanFonds, jourSemaine, alertesFondsDues, texteAlerteFonds
};
