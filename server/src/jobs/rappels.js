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
// dossier) : ce mécanisme est plus proche du flux calendrier connecté (routes/calendrier.js), qui
// couvre déjà tout le portefeuille. `d.reminderDays` (propre au seul export .ics, vide sur un
// dossier sans condition de prêt) n'est donc volontairement PAS utilisé ici : un dossier sans prêt
// doit quand même être rappelé pour sa signature d'acte ou sa vente préalable.
//
// toutesEcheances()/echeanceValidee() sont une DUPLICATION volontaire de leurs équivalents dans
// script.js (navigateur) : ce projet n'a pas de mécanisme de build partagé entre les deux mondes
// (même choix déjà documenté pour buildEvent/icsDate dans routes/calendrier.js) — en modifiant
// l'une des deux, vérifier si l'autre a besoin du même changement.

const { envoyerEmail, envoiConfigure } = require('../envoiEmail');
const { mettreCopiesEnAttente, executerNettoyageGmail } = require('../nettoyageGmail');
const { piecesRecuesEtManquantes } = require('../piecesChecklist');

// Seuils de rappel PAR ÉCHÉANCE, donnés un par un par l'étude — pas un seuil unique pour tout.
// Une signature d'acte se prépare de plus loin qu'un appel de fonds, et un appel de fonds doit
// partir assez tôt pour que le virement arrive : c'est la seule raison pour laquelle ces quatre
// couples diffèrent. La DATE BUTOIR (`acte`) n'y figure volontairement pas — elle ne déclenche
// aucun rappel (voir toutesEcheances ci-dessous), c'est le rendez-vous pris à l'office qui engage
// l'étude.
const SEUILS_RAPPELS_PAR_TYPE = {
  pret: [15, 7],
  ventebien: [15, 7],
  appelFonds: [15, 10],
  rendezVousSignature: [25, 15]
};

// Échéance personnalisée (`autre-0`, `autre-1`…) : l'étude n'a pas de seuil à donner pour une date
// qu'elle nomme elle-même au cas par cas, ce repli reprend donc l'ancien couple unique.
const SEUILS_RAPPELS_DEFAUT = [15, 7];

function seuilsPourType(type) {
  return SEUILS_RAPPELS_PAR_TYPE[type] || SEUILS_RAPPELS_DEFAUT;
}

// Le prêt reste avant tout piloté par offrePretStatut (parcours NAS), mais la validation manuelle
// (voir echeancesValidees.pret, script.js) doit aussi être prise en compte ici — sans quoi un
// dossier marqué réalisé côté client continuerait de recevoir des rappels sur cette échéance.
// Miroir de echeanceValidee() côté client (duplication assumée : pas de build partagé entre le
// navigateur et Node dans ce projet — même choix que buildEvent/icsDate dans routes/calendrier.js).
// Deux faits du dossier closent une échéance sans décision manuelle : l'offre de prêt reçue pour
// « Obtention du prêt », et un rendez-vous de signature fixé pour la date butoir de réitération —
// relancer sur un butoir dont le rendez-vous réel est déjà pris n'aurait plus d'objet.
function echeanceValidee(d, type) {
  if (type === 'pret') return d.offrePretStatut === 'recue' || !!(d.echeancesValidees && d.echeancesValidees.pret);
  if (type === 'acte') return !!d.rendezVousSignature || !!(d.echeancesValidees && d.echeancesValidees.acte);
  return !!(d.echeancesValidees && d.echeancesValidees[type]);
}

function toutesEcheances(d) {
  const autres = (Array.isArray(d.autres) ? d.autres : [])
    .map((a, i) => ({ type: `autre-${i}`, label: a.label, iso: a.date }))
    .filter((it) => !echeanceValidee(d, it.type));
  // Miroir exact de echeancesPlanning() côté script.js — ce projet n'a pas de mécanisme de build
  // partagé entre navigateur et Node, cette duplication est un choix assumé et déjà documenté.
  // Trois règles métier données par l'étude, à garder alignées des deux côtés :
  //  • la DATE BUTOIR (`acte`) ne déclenche aucun rappel : elle vient de l'avant-contrat et n'est
  //    qu'indicative, c'est le rendez-vous pris à l'office qui engage l'étude ;
  //  • tant que l'appel de fonds n'est pas fait, c'est lui qu'on rappelle, même rendez-vous fixé,
  //    et à défaut de date propre il prend celle du rendez-vous (il doit être parti avant) ;
  //  • une fois l'appel de fonds fait, on rappelle la signature.
  const items = [];
  if (!echeanceValidee(d, 'ventebien')) items.push({ type: 'ventebien', label: 'Vente préalable', iso: d.ventebien });
  if (!echeanceValidee(d, 'pret')) items.push({ type: 'pret', label: 'Obtention du prêt', iso: d.pret });
  if (!echeanceValidee(d, 'appelFonds')) {
    items.push({ type: 'appelFonds', label: 'Appel de fonds', iso: d.appelFonds || d.rendezVousSignature });
  } else if (!echeanceValidee(d, 'rendezVousSignature')) {
    items.push({ type: 'rendezVousSignature', label: 'Signature de l’acte', iso: d.rendezVousSignature });
  }
  return items.concat(autres).filter((it) => it.iso);
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
    // Calculé une fois par dossier (pas par échéance/seuil) : ce sont les mêmes pièces quelle que
    // soit l'échéance qui déclenche le rappel.
    const pieces = piecesRecuesEtManquantes(d);
    for (const e of toutesEcheances(d)) {
      const j = joursRestants(e.iso, aujourdHui);
      for (const seuil of seuilsPourType(e.type)) {
        if (j !== seuil) continue;
        const reminderKey = `${e.type}:${seuil}`;
        if (dejaEnvoyes && dejaEnvoyes.has(`${d.id}:${reminderKey}`)) continue;
        dus.push({
          dossierId: d.id,
          nomDossier: d.nom,
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
  let texte = `📌 CLAIRE — Rappel : « ${r.libelle} » du dossier ${r.nomDossier} arrive à échéance dans ${r.seuil} ${jour} (le ${r.iso}).`;
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

  const dus = calculerRappelsDus(dossiers, jour, dejaEnvoyes);
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
    const texte = texteRappel(r);
    const envoi = await envoyer(reglages, email, texte);
    if (envoi.ok) {
      resultat.rappelsEnvoyes++;
      if (envoi.messageId) messagesEnvoyes.push(envoi.messageId);
      marquerStmt.run(r.dossierId, r.reminderKey, new Date().toISOString());
      if (reglages.copieEmail && reglages.copieEmail !== email) {
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
  SEUILS_RAPPELS_PAR_TYPE, SEUILS_RAPPELS_DEFAUT, seuilsPourType, echeanceValidee, toutesEcheances, joursRestants,
  calculerRappelsDus, texteRappel, executerTacheRappels, demarrerTacheRappels
};
