// @ts-check
'use strict';
// Décompte d'appel de fonds : le nôtre ou celui du confrère, reconnus par le NOM du fichier (étude 05/10 et 06/10 : « il faut
// bien que tu distingues les deux décomptes » ; « ne pas rattacher dans l'appel de fonds le décompte du confrère mais bien le
// nôtre »). Code COMMUN poste + serveur : la fiche (courrier rattaché à « Envoi appel de fonds »), les fonds reçus, l'outil
// Appel de fonds et la surveillance du NAS appliquent la même règle.
/** @param {object} C */
(function (C) {
  // Le courrier produit par CLAIRE (« Convocation au rendez-vous contenant l'appel de fonds - NOM.pdf », afNomFichierDocx).
  var RE_NOM_COURRIER_CLAIRE_APPEL_FONDS = /contenant\s+l.?appel\s+de\s+fonds/i;
  // Un décompte dont le nom dit qu'il vient d'un autre office : « confrère », « consœur », « Me DURAND », « Maître … »,
  // « notaire ». Sur le nom sans accents, en minuscules ; « me » seulement comme mot entier (pas « meuble », « même »).
  var RE_NOM_DECOMPTE_CONFRERE = /(confrere|consoeur|(?<![a-z])(?:me|mtre|maitre)(?![a-z])|notaire)/;

  function nomNormaliseDecompte(nom) {
    return String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').toLowerCase().replace(/[_-]+/g, ' ');
  }
  /** Le courrier d'appel de fonds écrit par CLAIRE. @param {string} nom */
  function nomDitCourrierClaireAppelFonds(nom) { return RE_NOM_COURRIER_CLAIRE_APPEL_FONDS.test(String(nom || '')); }
  /** Un décompte du confrère : jamais rattaché comme le nôtre, jamais lu comme le courrier de l'étude. @param {string} nom */
  function nomDitDecompteConfrere(nom) {
    const n = nomNormaliseDecompte(String(nom || '').split(/[\\/]/).pop());
    return !nomDitCourrierClaireAppelFonds(n) && RE_NOM_DECOMPTE_CONFRERE.test(n);
  }

  const exportes = { RE_NOM_COURRIER_CLAIRE_APPEL_FONDS, nomDitCourrierClaireAppelFonds, nomDitDecompteConfrere };
  if (typeof module !== 'undefined' && module.exports) module.exports = exportes; else Object.assign(globalThis, exportes);
})(
  typeof module !== 'undefined' && module.exports ? {} : /** @type {any} */ (globalThis)
);
