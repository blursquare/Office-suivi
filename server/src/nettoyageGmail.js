'use strict';

// Effacement DIFFÉRÉ des copies que Gmail garde dans « Messages envoyés » (voir imapGmail.js).
//
// Pourquoi différé, et c'est tout le sujet : le flux Power Automate de l'étude est déclenché par
// ce MÊME message Gmail. Effacer la copie aussitôt l'envoi fait — ce que faisait la première
// version — pouvait donc le retirer avant que le flux ne soit passé le lire : le déclencheur Gmail
// de Power Automate relève la boîte à intervalles de plusieurs minutes, et dans Gmail un message
// envoyé à soi-même n'est qu'UN seul message portant deux libellés, si bien que le mettre à la
// corbeille depuis « Messages envoyés » le retire aussi de la boîte de réception. Le rappel serait
// parti, et le message Teams jamais.
//
// Chaque copie attend donc DELAI_AVANT_EFFACEMENT_MS avant d'être effacée — largement plus que
// l'intervalle de relève du flux. L'effacement lui-même est fait par la tâche de rappels, à chacun
// de ses tours (toutes les 30 minutes) : une copie disparaît donc entre 2 h et 2 h 30 après
// l'envoi. Une copie introuvable à ce moment-là a déjà disparu (effacée à la main, ou par le flux
// lui-même) : ce n'est pas une erreur, elle sort simplement de la file.

const { effacerCopiesEnvoyees, estCompteGmail } = require('./imapGmail');

const DELAI_AVANT_EFFACEMENT_MS = 2 * 60 * 60 * 1000;
// Au-delà, une copie qu'on n'arrive toujours pas à effacer (mot de passe révoqué, IMAP désactivé)
// sort de la file : la retenter indéfiniment n'apprendrait plus rien, l'avertissement a été donné.
const MAX_ESSAIS_EFFACEMENT = 5;

function mettreCopiesEnAttente(parametresRepo, reglages, messageIds, maintenant) {
  if (!estCompteGmail(reglages)) return 0;
  const ids = (messageIds || []).filter((x) => typeof x === 'string' && x.trim());
  if (!ids.length) return 0;
  const t = Number.isFinite(maintenant) ? maintenant : Date.now();
  const file = parametresRepo.lireCopiesEnAttente();
  const connus = new Set(file.map((c) => c.messageId));
  for (const id of ids) {
    if (!connus.has(id)) file.push({ messageId: id, envoyeLe: t, essais: 0 });
  }
  parametresRepo.ecrireCopiesEnAttente(file);
  return ids.length;
}

// Renvoie { effaces, avertissement } — avertissement non nul seulement quand la connexion à Gmail
// a échoué : c'est la seule situation qui mérite d'être signalée à l'étude.
async function executerNettoyageGmail(parametresRepo, reglages, effacerFn, maintenant) {
  const resultat = { effaces: 0, avertissement: null };
  const file = parametresRepo.lireCopiesEnAttente();
  if (!file.length) return resultat;
  // Plus un compte Gmail (réglages changés depuis) : ces copies ne sont plus à notre portée.
  if (!estCompteGmail(reglages)) {
    parametresRepo.ecrireCopiesEnAttente([]);
    return resultat;
  }
  const t = Number.isFinite(maintenant) ? maintenant : Date.now();
  const dues = file.filter((c) => t - c.envoyeLe >= DELAI_AVANT_EFFACEMENT_MS);
  if (!dues.length) return resultat;
  const restantes = file.filter((c) => t - c.envoyeLe < DELAI_AVANT_EFFACEMENT_MS);

  const effacer = effacerFn || effacerCopiesEnvoyees;
  const n = await effacer(reglages, dues.map((c) => c.messageId));
  if (n && n.echec) {
    const aRetenter = dues
      .map((c) => ({ ...c, essais: c.essais + 1 }))
      .filter((c) => c.essais < MAX_ESSAIS_EFFACEMENT);
    const abandonnees = dues.length - aRetenter.length;
    parametresRepo.ecrireCopiesEnAttente(restantes.concat(aRetenter));
    resultat.avertissement = `${n.erreur || 'Copie Gmail non effacée.'}`
      + (abandonnees
        ? ` ${abandonnees} copie(s) abandonnée(s) après ${MAX_ESSAIS_EFFACEMENT} essais : à effacer à la main dans Gmail.`
        : ' Nouvel essai au prochain tour.');
    return resultat;
  }
  resultat.effaces = (n && n.effaces) || 0;
  parametresRepo.ecrireCopiesEnAttente(restantes);
  return resultat;
}

module.exports = {
  DELAI_AVANT_EFFACEMENT_MS, MAX_ESSAIS_EFFACEMENT, mettreCopiesEnAttente, executerNettoyageGmail
};
