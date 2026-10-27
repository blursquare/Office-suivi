// @ts-check
'use strict';
// Dates au format AAAA-MM-JJ : utilitaires de calcul de délais.
// Code COMMUN au poste (navigateur, <script> classique chargé avant client/) et au serveur (require) — écrit une fois,
// jamais en miroir (étude, 04/10). Dans le navigateur, les noms exportés deviennent des globaux (comme les fonctions de
// client/) ; côté Node, module.exports. Pas de syntaxe réservée à l'un des deux mondes.
/** @param {object} C — les autres fichiers de commun/ dont celui-ci dépend */
(function (C) {
  function pad(n) { return String(n).padStart(2, '0'); }

  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  // Ajoute n mois "de quantième à quantième" : le 31 janvier + 1 mois donne le 28 (ou 29) février,
  // pas le 3 mars — c'est la règle de computation usuelle d'un délai en mois (art. 641 CPC), et
  // c'est aussi ce qu'un notaire attend en lisant « dans les trois mois de la signature ».
  function ajouterMois(iso, n) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(n)) return null;
    const [annee, mois, jour] = iso.split('-').map(Number);
    const totalMois = annee * 12 + (mois - 1) + n;
    const anneeCible = Math.floor(totalMois / 12);
    const moisCible = ((totalMois % 12) + 12) % 12; // 0-11, correct aussi pour un n négatif
    // Jour 0 du mois suivant = dernier jour du mois visé (gère février et les années bissextiles).
    const dernierJour = new Date(Date.UTC(anneeCible, moisCible + 1, 0)).getUTCDate();
    return `${anneeCible}-${pad(moisCible + 1)}-${pad(Math.min(jour, dernierJour))}`;
  }

  // Jours fériés de France métropolitaine d'une année (fixes, et lundi de Pâques, Ascension, lundi de Pentecôte d'après Pâques —
  // calcul de Meeus/Jones/Butcher), en AAAA-MM-JJ triés. Commun au poste (créneaux de signature) et au serveur (routines, 25/10).
  /** @param {number} annee @returns {string[]} */
  function joursFeriesFrance(annee) {
    const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
    const paques = `${annee}-${pad(mois)}-${pad(jour)}`;
    return ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'].map(md => `${annee}-${md}`)
      .concat([addDays(paques, 1), addDays(paques, 39), addDays(paques, 50)]).sort();
  }
  /** @param {string} iso AAAA-MM-JJ */
  function estJourFerie(iso) {
    return joursFeriesFrance(Number(String(iso).slice(0, 4))).indexOf(String(iso).slice(0, 10)) !== -1;
  }

  /**
   * Le moment de la journée à Paris (étude 26/10 : « elle doit savoir à quel moment de la journée nous sommes pour échanger avec les
   * collègues ») : l'heure, le jour, et si l'étude est ouverte — matin dès 8 h, pause de midi à 14 h, fin de journée à 18 h, fermée
   * à partir de 19 h, le week-end et les jours fériés.
   * @param {Date} [date]
   */
  function momentDeLaJournee(date) {
    const d = Object.prototype.toString.call(date) === '[object Date]' && !isNaN(date.getTime()) ? date : new Date();
    const f = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    /** @type {Record<string, string>} */
    const p = {};
    f.formatToParts(d).forEach(x => { p[x.type] = x.value; });
    const heure = Number(p.hour) || 0;
    const minute = Number(p.minute) || 0;
    const iso = `${p.year}-${p.month}-${p.day}`;
    const jour = String(p.weekday || '').toLowerCase();
    const weekend = jour === 'samedi' || jour === 'dimanche';
    const ferie = estJourFerie(iso);
    const t = heure * 60 + minute;
    const moment = weekend ? 'week-end' : ferie ? 'jour férié' : t < 8 * 60 ? 'avant l’ouverture' : t < 12 * 60 ? 'matin' : t < 14 * 60 ? 'pause de midi' : t < 18 * 60 ? 'après-midi' : t < 19 * 60 ? 'fin de journée' : 'soir';
    const ouvre = !weekend && !ferie && t >= 8 * 60 && t < 19 * 60;
    return { iso, jour, heure, minute, moment, ouvre, weekend, ferie };
  }

  const exportes = { pad, addDays, ajouterMois, joursFeriesFrance, estJourFerie, momentDeLaJournee };
  // Node : module.exports ; navigateur : des globaux (noms nus, comme les fonctions de client/).
  if (typeof module !== 'undefined' && module.exports) module.exports = exportes; else Object.assign(globalThis, exportes);
})(
  // Les autres fichiers de commun/ dont celui-ci dépend : require côté Node, globaux déjà chargés côté navigateur.
  typeof module !== 'undefined' && module.exports ? {} : /** @type {any} */ (globalThis)
);
