// @ts-check
'use strict';
// Montants en euros : format « 360.000,00 € » (étude, 29/09) et bilan des fonds reçus (à 2 € près).
// Code COMMUN au poste (navigateur, <script> classique chargé avant client/) et au serveur (require) — écrit une fois,
// jamais en miroir (étude, 04/10). Dans le navigateur, les noms exportés deviennent des globaux (comme les fonctions de
// client/) ; côté Node, module.exports. Pas de syntaxe réservée à l'un des deux mondes.
/** @param {object} C — les autres fichiers de commun/ dont celui-ci dépend */
(function (C) {
  // Affichage français ("250 000 €", pas de décimales : un prix notarié est toujours un compte
  // rond en euros dans ce contexte). Intl.NumberFormat plutôt qu'un formatage manuel des milliers.
  // Montants au format demandé par l'étude (29/09) : « 360.000,00 € » — point pour les milliers,
  // virgule et deux décimales, espace insécable avant l'euro. Un seul formateur pour tout CLAIRE
  // (fiche, emails, courriers, outils). Pure.
  function formaterMontantEuros(valeur, decimales) {
    const n = Number(valeur);
    if (!Number.isFinite(n)) return '';
    const d = decimales == null ? 2 : decimales;
    const [entier, dec] = Math.abs(n).toFixed(d).split('.');
    const milliers = entier.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const negatif = n < 0 && Number(Math.abs(n).toFixed(d)) !== 0;
    return (negatif ? '-' : '') + milliers + (dec ? ',' + dec : '') + '\u00a0€';
  }
  function formaterPrix(valeur) {
    return formaterMontantEuros(valeur, 2);
  }

  // Variante AVEC les centimes, pour les montants où ils comptent — une répartition de prorata est
  // une somme réclamée à un client, l'arrondir à l'euro ferait perdre le complément exact entre les
  // deux parts (voir calculerProrata). Le prix de vente et l'apport, eux, restent à l'euro près :
  // formaterPrix() est inchangée.
  function formaterPrixCentimes(valeur) {
    return formaterMontantEuros(valeur, 2);
  }

  // Pure : l'état de l'indicateur. Les fonds doivent correspondre au montant attendu à l'euro près,
  // avec une marge de 2 € au plus (arrondi, centimes ; étude 05/10 : « maximum 2 euros » — 50 € jusque-là) — dans les DEUX sens : bien au-delà du montant attendu, ce n'est pas « complet » mais un
  // écart à vérifier (des versements d'un autre dossier ont probablement été comptés).
  // `ecart` = reçu − attendu (négatif s'il manque). Miroir bilanFonds (server/src/jobs/rappels.js).
  var MARGE_FONDS_RECUS = 2;
  function bilanFondsRecus(total, attendu) {
    const t = Math.round((Number(total) || 0) * 100) / 100;
    if (!(attendu > 0)) return { etat: t > 0 ? 'inconnu' : 'aucun', total: t, attendu: null, reste: null, ecart: null };
    const ecart = Math.round((t - attendu) * 100) / 100;
    // Rien reçu n'est jamais « complet », même pour un attendu de 2 € ou moins (audit 13/10).
    const etat = Math.abs(ecart) <= MARGE_FONDS_RECUS && t > 0 ? 'complet'
      : ecart > 0 ? 'excedent'
      : (t > 0 ? 'partiel' : 'aucun');
    return { etat, total: t, attendu, reste: Math.max(0, -ecart), ecart };
  }

  /**
   * Bilan des fonds d'un dossier : les reçus comptables lus (d.fondsRecus, montant attendu saisi à la main en priorité) —
   * sauf quand le collaborateur a VALIDÉ les fonds à la main (étude 06/10 : « parfois ils ne sont pas comptabilisés dans des
   * reçus mais sont bien arrivés sur le compte CDC ») : `d.fondsValidesLe` vaut alors réception complète, `manuel: true`,
   * quel que soit le total lu. Même règle pour le poste (fiche, À faire, agenda, Suivi) et le serveur (alerte Teams).
   * @param {{ fondsRecus?: any, fondsAttendusManuel?: number, fondsValidesLe?: string } | null | undefined} d
   */
  function bilanFondsDossier(d) {
    const f = d && d.fondsRecus && typeof d.fondsRecus === 'object' ? d.fondsRecus : null;
    const attendu = (d && d.fondsAttendusManuel) || (f && f.attendu) || null;
    const bilan = bilanFondsRecus(f ? f.total : 0, attendu);
    if (d && typeof d.fondsValidesLe === 'string' && d.fondsValidesLe) {
      return { etat: 'complet', total: bilan.total, attendu: bilan.attendu, reste: 0, ecart: bilan.ecart, manuel: true };
    }
    return Object.assign(bilan, { manuel: false });
  }

  const exportes = { formaterMontantEuros, formaterPrix, formaterPrixCentimes, MARGE_FONDS_RECUS, bilanFondsRecus, bilanFondsDossier };
  // Node : module.exports ; navigateur : des globaux (noms nus, comme les fonctions de client/).
  if (typeof module !== 'undefined' && module.exports) module.exports = exportes; else Object.assign(globalThis, exportes);
})(
  // Les autres fichiers de commun/ dont celui-ci dépend : require côté Node, globaux déjà chargés côté navigateur.
  typeof module !== 'undefined' && module.exports ? {} : /** @type {any} */ (globalThis)
);
