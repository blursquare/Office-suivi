// @ts-check
'use strict';
// Trajets d'un rendez-vous chez un confrère (étude 20/10 : « lors de la création d'un rdv chez un confrère (orange) crée un rdv d'une
// demi-heure avant et après nommé trajet avec le nombre de km entre notre office et celle du confrère ; ne pas prendre en compte ces
// deux créneaux dans le nombre de rendez-vous d'une journée »).
// Code COMMUN : le serveur les écrit dans l'agenda (routes/exchange.js), le poste les reconnaît pour ne pas les compter (règle des
// 6 rendez-vous par jour, client/25). Écrit une fois, jamais en miroir.
/** @param {object} C — les autres fichiers de commun/ dont celui-ci dépend */
(function (C) {
  var DUREE_TRAJET_MINUTES = 30;

  // Pure : titre d'un trajet — « Trajet - 42 km », « Trajet » quand la distance n'a pas pu être lue (jamais une distance devinée).
  /** @param {number|null|undefined} km */
  function titreTrajet(km) {
    const n = Number(km);
    return Number.isFinite(n) && n > 0 ? `Trajet - ${Math.round(n)} km` : 'Trajet';
  }

  // Pure : ce titre est-il celui d'un trajet ? (« Trajet », « Trajet - 42 km », « TRAJET … » posé à la main.)
  /** @param {unknown} sujet */
  function estTitreTrajet(sujet) {
    return /^\s*trajet(?![A-Za-z0-9_À-ɏ])/i.test(String(sujet || ''));
  }

  /** @param {string} h */
  function minutes(h) {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(h || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  /** @param {number} n */
  function heure(n) {
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  }

  // Pure : les deux créneaux d'une demi-heure, juste avant et juste après le rendez-vous (« HH:MM » du jour, heure de Paris) —
  // null si l'un sortirait de la journée.
  /** @param {string} heureDebut @param {number} dureeMinutes */
  function creneauxTrajet(heureDebut, dureeMinutes) {
    const a = minutes(heureDebut);
    const duree = Number(dureeMinutes) > 0 ? Number(dureeMinutes) : 60;
    if (a === null) return null;
    const b = a + duree;
    if (a - DUREE_TRAJET_MINUTES < 0 || b + DUREE_TRAJET_MINUTES > 23 * 60 + 59) return null;
    return {
      aller: { heure: heure(a - DUREE_TRAJET_MINUTES), heureFin: heure(a) },
      retour: { heure: heure(b), heureFin: heure(b + DUREE_TRAJET_MINUTES) }
    };
  }

  const exportes = { DUREE_TRAJET_MINUTES, titreTrajet, estTitreTrajet, creneauxTrajet };
  // Node : module.exports ; navigateur : des globaux (noms nus, comme les fonctions de client/).
  if (typeof module !== 'undefined' && module.exports) module.exports = exportes; else Object.assign(globalThis, exportes);
})(
  // Les autres fichiers de commun/ dont celui-ci dépend : require côté Node, globaux déjà chargés côté navigateur.
  typeof module !== 'undefined' && module.exports ? {} : /** @type {any} */ (globalThis)
);
