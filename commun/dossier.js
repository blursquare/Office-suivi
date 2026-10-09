// @ts-check
'use strict';
// Dossier : type d’affaire (vente, succession) et libellé affiché « VTE - NOM » / « SUCC - NOM ».
// Code COMMUN au poste (navigateur, <script> classique chargé avant client/) et au serveur (require) — écrit une fois,
// jamais en miroir (étude, 04/10). Dans le navigateur, les noms exportés deviennent des globaux (comme les fonctions de
// client/) ; côté Node, module.exports. Pas de syntaxe réservée à l'un des deux mondes.
/** @param {object} C — les autres fichiers de commun/ dont celui-ci dépend */
(function (C) {
  // Nom du dossier tel qu'affiché à l'écran (« VTE - DUPONT / MARTIN »), demandé par l'étude —
  // la même référence que dans l'agenda de l'office. « VTE » distingue les ventes des autres
  // affaires que CLAIRE accueillera (successions) : le préfixe devra alors suivre le type d'affaire —
  // uniquement pour l'affichage (titres, lignes de tableau, résultats de recherche) : jamais dans
  // d.nom lui-même, qui reste la valeur brute utilisée pour l'édition du champ, les emails, les
  // noms de fichiers exportés, l'historique et la correspondance de recherche.
  //
  // Étude, 30/09 : « partout dans CLAIRE, si tu cites un nom de dossier, place devant le type — VTE
  // pour vente et SUCC pour succession ». Le type vient de d.typeAffaire (absent = vente, seul type
  // suivi aujourd'hui) ; un nom déjà préfixé (journal enregistré avec son libellé) n'est pas doublé.
  var PREFIXES_TYPE_AFFAIRE = { vente: 'VTE', succession: 'SUCC' };
  // Dossier de succession (créé depuis Authentic, étude 02/10) : parties et biens seulement — ni
  // planning de vente (prêt, butoir, préemption, appel de fonds), ni checklist de vente, ni emails
  // de vente, tant que l'étude n'a pas défini ce qu'il faut suivre pour une succession.
  function estSuccession(d) { return !!d && d.typeAffaire === 'succession'; }
  // Vrai quand l'analyse du contrôle de l'urbanisme gardée sur la fiche dit que le droit `cle` ne s'applique pas (statut « non ») :
  // ni zone, ni mutation, ni bien soumis. « À vérifier » n'est jamais « non » (étude 09/10 : ne rien attendre quand il n'y a rien à purger).
  /** @param {any} d @param {string} cle */
  function droitNonApplicable(d, cle) {
    const droits = d && d.preemption && Array.isArray(d.preemption.droits) ? d.preemption.droits : [];
    const dr = droits.find(x => x && x.cle === cle);
    return !!dr && dr.statut === 'non';
  }
  var RE_NOM_DEJA_PREFIXE = /^(VTE|SUCC)\s*-\s/i;
  function prefixeTypeAffaire(d) {
    return PREFIXES_TYPE_AFFAIRE[d && d.typeAffaire] || PREFIXES_TYPE_AFFAIRE.vente;
  }
  function libelleDossierAffiche(d) {
    const nom = String((d && d.nom) || '').trim();
    if (RE_NOM_DEJA_PREFIXE.test(nom)) return nom;
    return prefixeTypeAffaire(d) + ' - ' + nom;
  }

  const exportes = { PREFIXES_TYPE_AFFAIRE, estSuccession, droitNonApplicable, RE_NOM_DEJA_PREFIXE, prefixeTypeAffaire, libelleDossierAffiche };
  // Node : module.exports ; navigateur : des globaux (noms nus, comme les fonctions de client/).
  if (typeof module !== 'undefined' && module.exports) module.exports = exportes; else Object.assign(globalThis, exportes);
})(
  // Les autres fichiers de commun/ dont celui-ci dépend : require côté Node, globaux déjà chargés côté navigateur.
  typeof module !== 'undefined' && module.exports ? {} : /** @type {any} */ (globalThis)
);
