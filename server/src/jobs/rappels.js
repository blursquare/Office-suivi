'use strict';

// Rappels automatiques vers Teams — remplace le DÉCLENCHEMENT AUTOMATIQUE des rappels
// (auparavant : rien, en pratique — voir CLAUDE.md, "Ce qui n'a volontairement pas été fait" :
// aucune relance email automatique n'a jamais été câblée, seul un mailto manuel existait). Le
// bouton "Envoyer un rappel par email" sur la fiche reste disponible pour un envoi ponctuel à la
// main, inchangé — ce job ne fait qu'ajouter le déclenchement automatique qui manquait, vers Teams
// plutôt que vers un email qu'il faudrait de toute façon composer/envoyer manuellement.
//
// Aux seuils J-15/J-7 (RAPPELS_PAR_DEFAUT côté client), sur TOUTES les échéances actives d'un
// dossier (prêt, acte, vente préalable, personnalisées) — pas seulement le prêt comme l'export
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

const { envoyerMessageTeams } = require('../teams');

const SEUILS_RAPPELS = [15, 7];

function echeanceValidee(d, type) {
  if (type === 'pret') return d.offrePretStatut === 'recue';
  return !!(d.echeancesValidees && d.echeancesValidees[type]);
}

function toutesEcheances(d) {
  const autres = (Array.isArray(d.autres) ? d.autres : [])
    .map((a, i) => ({ type: `autre-${i}`, label: a.label, iso: a.date }))
    .filter((it) => !echeanceValidee(d, it.type));
  return [
    ...(echeanceValidee(d, 'pret') ? [] : [{ type: 'pret', label: 'Obtention du prêt', iso: d.pret }]),
    ...(echeanceValidee(d, 'acte') ? [] : [{ type: 'acte', label: "Signature de l'acte", iso: d.acte }]),
    ...(echeanceValidee(d, 'ventebien') ? [] : [{ type: 'ventebien', label: 'Vente préalable', iso: d.ventebien }]),
    ...autres
  ].filter((it) => it.iso);
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
    for (const e of toutesEcheances(d)) {
      const j = joursRestants(e.iso, aujourdHui);
      for (const seuil of SEUILS_RAPPELS) {
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
          reminderKey
        });
      }
    }
  }
  return dus;
}

function texteRappel(r) {
  const jour = r.seuil === 1 ? 'jour' : 'jours';
  return `📌 CLAIRE — Rappel : « ${r.libelle} » du dossier ${r.nomDossier} arrive à échéance dans ${r.seuil} ${jour} (le ${r.iso}).`;
}

// Un seul tour : lit les réglages (webhook + emails), calcule les rappels dus, envoie ceux dont le
// collaborateur a une adresse configurée, et marque chaque envoi réussi dans reminder_log pour ne
// jamais le renvoyer. `envoyerFn` injectable (voir server/test/rappels.test.js) — la vraie fonction
// par défaut est envoyerMessageTeams().
async function executerTacheRappels(depot, db, parametresRepo, envoyerFn, aujourdHui) {
  const resultat = { rappelsDus: 0, rappelsEnvoyes: 0, erreurs: [] };
  const reglages = parametresRepo.lireReglages();
  if (!reglages.teamsActif || !reglages.teamsWebhookUrl) return resultat;

  const jour = aujourdHui || new Date().toISOString().slice(0, 10);
  const dossiers = depot.tousActifs();

  const dejaEnvoyes = new Set(
    db.prepare('SELECT dossier_id, reminder_key FROM reminder_log').all()
      .map((l) => `${l.dossier_id}:${l.reminder_key}`)
  );

  const dus = calculerRappelsDus(dossiers, jour, dejaEnvoyes);
  resultat.rappelsDus = dus.length;

  const marquerStmt = db.prepare('INSERT OR IGNORE INTO reminder_log (dossier_id, reminder_key, sent_at) VALUES (?, ?, ?)');
  const envoyer = envoyerFn || envoyerMessageTeams;

  for (const r of dus) {
    const email = reglages.emailsResponsables[r.responsable];
    if (!email) {
      resultat.erreurs.push(`${r.responsable} : aucune adresse email Teams configurée (voir Réglages).`);
      continue;
    }
    const envoi = await envoyer(reglages.teamsWebhookUrl, email, texteRappel(r));
    if (envoi.ok) {
      resultat.rappelsEnvoyes++;
      marquerStmt.run(r.dossierId, r.reminderKey, new Date().toISOString());
    } else {
      resultat.erreurs.push(`${r.nomDossier} — ${r.libelle} : ${envoi.erreur}`);
    }
  }
  return resultat;
}

// 30 minutes (config.intervalleRappelsMs, déjà réservée à cet usage depuis le tout premier schéma
// de la base — voir db.js/config.js) : une échéance à J-15/J-7 n'a jamais besoin d'une précision
// à la minute, un tour toutes les demi-heures suffit largement à couvrir la journée du seuil.
function demarrerTacheRappels(depot, db, config, parametresRepo, envoyerFn) {
  const tour = () => {
    executerTacheRappels(depot, db, parametresRepo, envoyerFn).catch((e) => {
      console.warn('[CLAIRE] Tâche de rappels Teams interrompue :', e.message);
    });
  };
  tour(); // un premier passage tout de suite, pas seulement dans trente minutes
  return setInterval(tour, config.intervalleRappelsMs);
}

module.exports = {
  SEUILS_RAPPELS, echeanceValidee, toutesEcheances, joursRestants,
  calculerRappelsDus, texteRappel, executerTacheRappels, demarrerTacheRappels
};
