// @ts-check
// Autorisations de déblocage ou de transfert de fonds d'une succession (étude 23/10 : trois modèles Word de l'office — « Autorisation de
// déblocage de fonds (individuelle) », « … de transfert de fonds (conjoint) », « … (héritier) » — à télécharger en PDF d'un clic).
// Textes repris MOT POUR MOT des modèles ; seuls varient l'identité du signataire, celle du défunt et les accords en genre.
// Pur : poste et tests. Un document = des paragraphes { texte, gras? } ; '' n'existe pas (une ligne vide = un espace entre paragraphes).
(function (exporter) {
  'use strict';

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const A_COMPLETER = 'à compléter';

  /**
   * @typedef {{ civilite?: string, prenoms?: string, nom?: string, profession?: string, domicile?: string, naissanceLieu?: string, naissanceDate?: string,
   *   nationalite?: string, decesLieu?: string, decesDate?: string, conjointLien?: string, conjointNom?: string, mariage?: string, pacse?: boolean }} PersonneAutorisation
   * @typedef {{ texte: string, gras?: boolean, vide?: boolean }} ParagrapheAutorisation
   */

  /** @type {Array<{ cle: string, libelle: string, court: string }>} */
  const MODELES_AUTORISATION_SUCCESSION = [
    { cle: 'deblocage', libelle: 'Déblocage de fonds (héritier, sans conjoint survivant)', court: 'Déblocage' },
    { cle: 'conjoint', libelle: 'Transfert de fonds (conjoint survivant)', court: 'Transfert conjoint' },
    { cle: 'heritier', libelle: 'Transfert de fonds (héritier, au nom du conjoint survivant)', court: 'Transfert héritier' }
  ];

  /** « 2026-10-01 » → « 01 octobre 2026 » ; '' si la date n'existe pas. @param {string | undefined} iso */
  function dateAutorisation(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return '';
    const mois = Number(m[2]);
    if (mois < 1 || mois > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) return '';
    return `${m[3]} ${MOIS[mois - 1]} ${m[1]}`;
  }

  /** @param {string | undefined} civilite */
  function estFeminin(civilite) { return /^(madame|mme|mlle|mademoiselle)/i.test(String(civilite || '').trim()); }

  /** @param {string | undefined} civilite */
  function civiliteComplete(civilite) {
    const c = String(civilite || '').trim();
    if (/^(m\.?|monsieur|mr)$/i.test(c)) return 'Monsieur';
    if (/^(mme\.?|madame)$/i.test(c)) return 'Madame';
    if (/^(mlle\.?|mademoiselle)$/i.test(c)) return 'Mademoiselle';
    return c;
  }

  /** « Madame Thi Trang HO ». @param {PersonneAutorisation} p */
  function nomCompletAutorisation(p) {
    return [civiliteComplete(p.civilite), p.prenoms, p.nom].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
  }

  /** @param {string | undefined} v */
  const ou = (v) => (String(v || '').trim() || A_COMPLETER);

  /** « Né à ORLEANS (45000), le 19 juillet 1960. » @param {PersonneAutorisation} p @param {string} [verbe] */
  function ligneNaissance(p, verbe) {
    const f = estFeminin(p.civilite);
    const lieu = String(p.naissanceLieu || '').trim();
    return `${verbe || (f ? 'Née' : 'Né')} à ${lieu || A_COMPLETER}, le ${dateAutorisation(p.naissanceDate) || A_COMPLETER}.`;
  }

  /** @param {PersonneAutorisation} p */
  function ligneNationalite(p) { return `De nationalité ${ou(p.nationalite)}.`; }

  /** « Epoux de Madame X. » (forme du modèle, sans accent) — rien si le lien n'est pas connu. @param {PersonneAutorisation} p */
  function ligneLien(p) {
    const lien = String(p.conjointLien || '').trim();
    const nom = String(p.conjointNom || '').trim();
    if (!lien || !nom) return '';
    return `${lien.replace(/^É/, 'E')} ${nom}.`;
  }

  /** @param {PersonneAutorisation} p */
  function estMarieOuPacse(p) { return /^(epou|epouse|marie)/i.test(String(p.conjointLien || '').normalize('NFD').replace(/[̀-ͯ]/g, '')) || p.pacse === true; }

  const PACS_AUCUN = 'N\'ayant pas conclu, à ce jour, de pacte civil de solidarité régi par les articles 515-1 et suivants du Code civil.';

  /**
   * Le document d'une autorisation. `conjointSurvivant` = nom complet de la personne au nom de qui les comptes sont transférés (modèle « héritier » ;
   * pour le modèle « conjoint » c'est le signataire).
   * @param {string} cle  deblocage | conjoint | heritier
   * @param {{ signataire: PersonneAutorisation, defunt: PersonneAutorisation, conjointSurvivant?: string }} v
   * @returns {ParagrapheAutorisation[]}
   */
  function documentAutorisationSuccession(cle, v) {
    const s = v.signataire || {};
    const d = v.defunt || {};
    const fs = estFeminin(s.civilite);
    const fd = estFeminin(d.civilite);
    /** @type {ParagrapheAutorisation[]} */
    const doc = [];
    const p = (texte, gras) => { doc.push(gras ? { texte, gras: true } : { texte }); };
    const vide = () => doc.push({ texte: '', vide: true });

    p(fs ? 'LA SOUSSIGNÉE :' : 'LE SOUSSIGNÉ :', true);
    p(`${nomCompletAutorisation(s) || A_COMPLETER}, ${ou(s.profession)}, demeurant à ${ou(s.domicile)}.`);
    const lien = ligneLien(s);
    if (lien) p(lien);
    p(ligneNaissance(s));
    p(ligneNationalite(s));
    if (cle === 'deblocage' && String(s.mariage || '').trim()) p(String(s.mariage).trim());
    if (cle !== 'conjoint' && !estMarieOuPacse(s)) p(PACS_AUCUN);
    p(cle === 'conjoint' ? 'Agissant en qualité de conjoint survivant de :' : 'Habile à se dire et porter héritier de :', true);

    const lienD = String(d.conjointLien || '').trim() && String(d.conjointNom || '').trim()
      ? `${String(d.conjointLien).trim().replace(/^./, (c) => c.toLowerCase())} ${String(d.conjointNom).trim()}` : '';
    const enSonVivant = `en son vivant ${ou(d.profession)}`;
    if (cle === 'conjoint') {
      p(`${nomCompletAutorisation(d) || A_COMPLETER}, ${lienD ? lienD + ', ' : ''}${enSonVivant}, demeurant à ${ou(d.domicile)},`);
    } else {
      p(`${nomCompletAutorisation(d) || A_COMPLETER}, ${enSonVivant}, ${lienD ? lienD + ' ' : ''}demeurant à ${ou(d.domicile)},`);
    }
    p(ligneNaissance(d));
    p(ligneNationalite(d));
    p(`${fd ? 'Décédée' : 'Décédé'} à ${String(d.decesLieu || '').trim() || A_COMPLETER}, le ${dateAutorisation(d.decesDate) || A_COMPLETER}.`);

    p('AUTORISE expressément par les présentes :');
    p('Maître Sophie GOSSART, notaire à BLOIS,');
    if (cle === 'deblocage') {
      p('A SOLLICITER auprès de tout établissement bancaire ou financier :');
      vide();
      p('- La clôture et le remboursement de l\'ensemble des comptes, plans et livrets ouverts au nom du défunt ;');
      p('- La vente de tout compte titres, PEA, parts sociales et autres actifs ;');
      p('- Le versement de tous les fonds correspondants entre les mains du notaire chargé du règlement de la succession,');
      vide();
    } else {
      const au = cle === 'conjoint' ? nomCompletAutorisation(s) : String(v.conjointSurvivant || '').trim();
      p(`A SOLLICITER auprès de tout établissement bancaire ou financier, le transfert au nom de ${au || A_COMPLETER} des comptes, plans et livrets ouverts au nom du défunt.`);
      vide();
    }
    p('DECHARGE ledit organisme financier et Maître Sophie GOSSART de toute responsabilité à la suite de ce remboursement.');
    vide();
    p('ET AUTORISE expressément ledit notaire, à procéder, le cas échéant, au paiement de toutes factures établies au nom du défunt.');
    vide();
    p('Fait à :');
    p('Le :');
    return doc;
  }

  /** Les données qui manquent encore (« à compléter » dans le texte). @param {ParagrapheAutorisation[]} doc */
  function manquesAutorisation(doc) {
    return doc.filter((x) => x.texte.includes(A_COMPLETER)).length;
  }

  /** Nom de fichier : « Autorisation de déblocage de fonds - NOM Prénom.pdf ». @param {string} cle @param {PersonneAutorisation} signataire */
  function nomFichierAutorisation(cle, signataire) {
    const titre = cle === 'deblocage' ? 'Autorisation de déblocage de fonds' : cle === 'conjoint' ? 'Autorisation de transfert de fonds (conjoint)' : 'Autorisation de transfert de fonds (héritier)';
    const qui = [signataire && signataire.nom, signataire && signataire.prenoms].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
    return `${titre}${qui ? ' - ' + qui : ''}`.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
  }

  /** Le modèle proposé d'office : le conjoint survivant → « conjoint » ; un héritier → « héritier » s'il y a un conjoint survivant, sinon « déblocage ».
   * @param {boolean} estConjointSurvivant @param {boolean} unConjointSurvit */
  function modeleParDefautAutorisation(estConjointSurvivant, unConjointSurvit) {
    if (estConjointSurvivant) return 'conjoint';
    return unConjointSurvit ? 'heritier' : 'deblocage';
  }

  exporter({ A_COMPLETER, nomCompletAutorisation, MODELES_AUTORISATION_SUCCESSION, dateAutorisation, documentAutorisationSuccession, manquesAutorisation, nomFichierAutorisation, modeleParDefautAutorisation });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
