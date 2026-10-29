// @ts-check
// Demandes d'acte d'état civil PAR PAPIER à la mairie (étude 29/10 : « parfois les mairies ne sont pas dotées de COMEDEC, il faut alors faire une
// demande papier à la mairie, voici les modèles ») : l'extrait d'acte de naissance et l'extrait d'acte de mariage, repris MOT POUR MOT des deux
// modèles Word de l'étude (« Demande acte naissance », « Demande d'acte de mariage »), composés comme les autres courriers de la Constitution de
// dossier (client/73-courrier-fidele.js : Word, PDF/A, aperçu). Pur : poste, serveur et tests.
(function (exporter) {
  'use strict';

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const SALUTATION = 'Madame ou Monsieur le Secrétaire de Mairie';
  const FORMULE = `Je vous prie d'agréer, ${SALUTATION}, mes salutations distinguées.`;
  const POST_SCRIPTUM = '(P.S. ci-joint une enveloppe timbrée pour la réponse)';

  /** @typedef {{ cle: 'naissance' | 'mariage', libelle: string, extrait: string }} ModeleEtatCivil */
  /** @type {ModeleEtatCivil[]} */
  const MODELES_ETAT_CIVIL = [
    { cle: 'naissance', libelle: 'Acte de naissance', extrait: "UN EXTRAIT D'ACTE DE NAISSANCE" },
    { cle: 'mariage', libelle: 'Acte de mariage', extrait: "UN EXTRAIT D'ACTE DE MARIAGE" }
  ];

  /** « 1974-09-19 » ou « 19/09/1974 » → « 19 septembre 1974 » ; '' si la date n'existe pas. @param {string} v */
  function dateEtatCivil(v) {
    const t = String(v || '').trim();
    let a = '', mo = 0, j = 0;
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    const fr = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(t);
    if (iso) { a = iso[1]; mo = Number(iso[2]); j = Number(iso[3]); }
    else if (fr) { j = Number(fr[1]); mo = Number(fr[2]); a = fr[3]; }
    else return '';
    if (mo < 1 || mo > 12 || j < 1 || j > 31) return '';
    return `${j === 1 ? '1er' : j} ${MOIS[mo - 1]} ${a}`;
  }

  /** La commune d'un lieu écrit « Alfortville (94) », « ALFORTVILLE 94140 » ou « Alfortville » — en capitales, sans département ni code postal. @param {string} lieu */
  function communeDuLieu(lieu) {
    return String(lieu || '').replace(/\(.*?\)/g, ' ').replace(/\b\d{2,5}\b/g, ' ').replace(/\s+/g, ' ').trim().toLocaleUpperCase('fr-FR');
  }

  /**
   * Pure : le courrier, au format des courriers fidèles { adresse, adresseDebut, date, lignes, signature, blancsSignature, postScriptum }. Une donnée absente = « à compléter »
   * (jamais devinée, modifiable sur la page).
   * @param {'naissance' | 'mariage'} cle
   * @param {{ nom?: string, feminin?: boolean, naissanceDate?: string, mariageDate?: string, conjoint?: string, mairie?: { codePostal?: string, commune?: string },
   *   dateIso?: string }} [o]
   */
  function documentCourrierEtatCivil(cle, o) {
    const modele = MODELES_ETAT_CIVIL.find((m) => m.cle === cle);
    if (!modele) return null;
    const opt = o || {};
    const ou = (v) => String(v || '').trim() || 'À compléter';
    const mairie = opt.mairie || {};
    const ville = [String(mairie.codePostal || '').trim(), communeDuLieu(mairie.commune || '')].filter(Boolean).join(' ') || 'À compléter';
    const jour = String(opt.dateIso || '').trim();
    const date = dateEtatCivil(jour) || '…';
    const introNaissance = "En ma qualité de notaire, conformément aux dispositions des articles 30 et suivants du décret n° 2017-890 du 6 mai 2017 relatif à l'état civil, et agissant en qualité de mandataire de la personne ci-dessous désignée, au sens de l'article 197-5 de l'instruction générale relative à l'état civil du 11 mai 1999, et dans l'impossibilité de connaître la filiation de la personne identifiée ci-dessous, elle-même habilitée par la loi à obtenir la délivrance d'un tel document,";
    const introMariage = "En ma qualité de notaire, et conformément aux dispositions des articles 30 et suivants du Décret n° 2017-890 du 6 mai 2017 relatif à l'état civil, je vous serais très obligé de bien vouloir m'adresser, dès que possible, avec toutes mentions marginales et autres, le ou les documents suivants, nécessaires à l'accomplissement de la mission qui m'a été confiée :";
    const demande = "Je vous serais très obligé de bien vouloir m'adresser, dès que possible, avec toutes mentions marginales et autres, le ou les documents suivants, nécessaires à l'accomplissement de la mission qui m'a été confiée :";
    const corps = cle === 'naissance'
      ? [introNaissance, '', demande, '', `**${modele.extrait}**`, '', `Au nom de : ${ou(opt.nom)}`, `${opt.feminin === false ? 'Né' : opt.feminin === true ? 'Née' : 'Né(e)'} le : ${ou(dateEtatCivil(opt.naissanceDate || ''))}`]
      : [introMariage, '', `**${modele.extrait}**`, '', `Au nom de : ${ou(opt.nom)}`, `Marié(e) le : ${ou(dateEtatCivil(opt.mariageDate || ''))}`, `A : ${ou(opt.conjoint)}`];
    return {
      adresse: ['HÔTEL DE VILLE', SALUTATION, ville], adresseDebut: 1, ligneDate: 10,
      date: `Blois, le ${date}`,
      lignes: ['', '', '', `${SALUTATION},`, '', ...corps, '', 'Vous en remerciant par avance,', '', FORMULE],
      signature: 'Me  Sophie GOSSART', blancsSignature: 1, postScriptum: POST_SCRIPTUM
    };
  }

  /** Nom de fichier : « Demande acte de naissance - Alice DURAND » (sans caractère interdit). @param {'naissance' | 'mariage'} cle @param {string} nom */
  function nomFichierCourrierEtatCivil(cle, nom) {
    const base = cle === 'mariage' ? "Demande d'acte de mariage" : 'Demande acte de naissance';
    return `${base}${nom ? ' - ' + nom : ''}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  exporter({ MODELES_ETAT_CIVIL, dateEtatCivil, communeDuLieu, documentCourrierEtatCivil, nomFichierCourrierEtatCivil });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
