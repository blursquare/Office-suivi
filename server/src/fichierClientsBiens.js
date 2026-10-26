// @ts-check
'use strict';
// Fichier global des clients et des biens (étude 26/10 : « un fichier global des clients et des biens ; on crée les dossiers avec leurs données,
// si elles n'existent pas elles sont ajoutées à la base ; si on retire, c'est supprimé du dossier mais pas de la base — comme dans Authentic »).
// Chaque personne et chaque bien vus dans un dossier sont gardés ici (clé `clients-biens-fichier`, serveur du bureau) et ne sont JAMAIS retirés
// par un retrait du dossier ni par la suppression d'un dossier : la page « Clients et biens » les montre encore, avec leur ancien dossier.
// Rien n'est jamais renvoyé à Authentic.

const { lignesFichierDepuisDossier, fusionnerFichier } = require('./clientsBiens');

const CLE = 'clients-biens-fichier';

/** @param {any} parametresRepo */
function creerFichierClientsBiens(parametresRepo) {
  /** @type {any} */
  let cache = null;
  const lire = () => {
    if (!cache) {
      const brut = parametresRepo.lireJsonBrut(CLE, {});
      cache = { personnes: Array.isArray(brut && brut.personnes) ? brut.personnes : [], biens: Array.isArray(brut && brut.biens) ? brut.biens : [] };
    }
    return cache;
  };
  /** Garde ce que ces dossiers contiennent. Jamais bloquant : une erreur est journalisée, le dossier s'enregistre quand même. @param {any[]} dossiers */
  const capturer = (dossiers) => {
    try {
      let courant = lire();
      let change = false;
      const maintenant = new Date().toISOString();
      for (const d of dossiers || []) {
        if (!d) continue;
        const r = fusionnerFichier(courant, lignesFichierDepuisDossier(d, maintenant));
        if (r.change) { courant = r.fichier; change = true; }
      }
      if (change) { cache = courant; parametresRepo.ecrireJsonBrut(CLE, courant); }
      return change;
    } catch (e) {
      console.error('[clients-biens] fichier global :', e && /** @type {any} */ (e).message);
      return false;
    }
  };
  return { lire, capturer };
}

module.exports = { creerFichierClientsBiens, CLE };
