'use strict';
// Dates au format AAAA-MM-JJ : utilitaires de calcul de délais.
// Code COMMUN au poste (navigateur, <script> classique chargé avant client/) et au serveur (require) — écrit une fois,
// jamais en miroir (étude, 04/10). Dans le navigateur, les noms exportés deviennent des globaux (comme les fonctions de
// client/) ; côté Node, module.exports. Pas de syntaxe réservée à l'un des deux mondes.
(function (exporter, C) {
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

  exporter({ pad, addDays, ajouterMois });
})(
  typeof module !== 'undefined' && module.exports ? (e) => Object.assign(module.exports, e) : (e) => Object.assign(globalThis, e),
  // Les autres fichiers de commun/ dont celui-ci dépend : require côté Node, globaux déjà chargés côté navigateur.
  typeof module !== 'undefined' && module.exports ? {} : globalThis
);
