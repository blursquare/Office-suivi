// @ts-check
// Attestation de transmission de relevé d'identité bancaire (étude 23/10 : « faire signer au client ce document et lui demander d'y ajouter son
// RIB en document obligatoire », « adapte le PDF à l'image de l'office, plus moderne », « complété à l'aide des informations des clients »).
// Les quatre engagements sont repris MOT POUR MOT du modèle de l'office ; seuls varient l'identité du signataire, son domicile et la référence
// du dossier, lus sur la fiche (fiches client d'Authentic comprises). Une donnée absente reste « [à compléter] », jamais devinée.
// Pur : poste et tests. La mise en page (polices, logos, PDF) est dans client/109-attestation-rib.js.
(function (exporter) {
  'use strict';

  const A_COMPLETER = '[à compléter]';

  const ENTETE_ATTESTATION_RIB = {
    office: 'Office notarial de Maître Sophie GOSSART',
    adresse: 'Notaire à BLOIS (41000) – 3 rue du Bout des Haies'
  };

  /** Les engagements du modèle, dans l'ordre, mot pour mot (le verbe est mis en valeur par la mise en page). */
  const ENGAGEMENTS_ATTESTATION_RIB = [
    { verbe: 'Atteste', texte: 'avoir transmis à l’Office notarial de Maître Sophie GOSSART, notaire à Blois, mon relevé d’identité bancaire (RIB), déposé en pièce jointe lors de la présente procédure de signature électronique.' },
    { verbe: 'Certifie', texte: 'que le compte bancaire désigné sur ce RIB est ouvert à mon nom et que les informations qui y figurent sont exactes et à jour.' },
    { verbe: 'Autorise', texte: 'l’Office notarial à utiliser ces coordonnées bancaires pour tout virement relatif au dossier référencé ci-dessus.' },
    { verbe: 'M’engage', texte: 'à informer l’Office sans délai de toute modification de ces coordonnées. Je reconnais que l’Office ne tiendra compte d’aucun changement de coordonnées bancaires qui ne serait pas confirmé directement par moi auprès de l’Office.' }
  ];

  const CLOTURE_ATTESTATION_RIB = 'Fait à la date de la signature électronique.';

  /** « M », « Mme »… → « Monsieur », « Madame », « Mademoiselle » ; '' si inconnue (jamais devinée). @param {unknown} civilite */
  function civiliteAttestationRib(civilite) {
    const c = String(civilite || '').trim();
    if (/^(m\.?|monsieur|mr)$/i.test(c)) return 'Monsieur';
    if (/^(mme\.?|madame)$/i.test(c)) return 'Madame';
    if (/^(mlle\.?|mademoiselle)$/i.test(c)) return 'Mademoiselle';
    return '';
  }

  /** @param {unknown} t */
  function sansAccent(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /**
   * « Monsieur Paul DUPONT » : civilité (absente : « [à compléter] »), prénom puis nom ; le prénom n'est pas répété s'il est déjà dans le nom
   * de la partie (« Paul DUPONT »). Sans nom : ''.
   * @param {{ civilite?: string, prenom?: string, nom?: string }} p
   */
  function nomCompletAttestationRib(p) {
    const nom = String((p && p.nom) || '').trim();
    const prenom = String((p && p.prenom) || '').trim();
    if (!nom) return '';
    const dejaDans = prenom && sansAccent(nom).split(' ').includes(sansAccent(prenom).split(' ')[0]);
    const corps = [dejaDans ? '' : prenom, nom].filter(Boolean).join(' ');
    return `${civiliteAttestationRib(p.civilite) || A_COMPLETER} ${corps}`;
  }

  /** « VTE - DUPONT / MARTIN », suivi de la référence d'Authentic entre parenthèses quand elle est connue. @param {string} libelleDossier @param {string} [referenceAuthentic] */
  function referenceAttestationRib(libelleDossier, referenceAuthentic) {
    const l = String(libelleDossier || '').trim();
    const r = String(referenceAuthentic || '').trim();
    if (!l) return r;
    return r ? `${l} (${r})` : l;
  }

  /**
   * Le document, prêt à composer : champs d'identité (valeur '' = « à compléter ») puis les engagements du modèle.
   * @param {{ civilite?: string, prenom?: string, nom?: string, domicile?: string }} personne
   * @param {string} reference
   */
  function documentAttestationRib(personne, reference) {
    const p = personne || {};
    return {
      entete: ENTETE_ATTESTATION_RIB,
      surtitre: 'Attestation',
      titre: ['Transmission de relevé', 'd’identité bancaire'],
      champs: [
        { libelle: 'Je soussigné(e)', valeur: nomCompletAttestationRib(p) },
        { libelle: 'Demeurant', valeur: String(p.domicile || '').trim() },
        { libelle: 'Référence du dossier', valeur: String(reference || '').trim() }
      ].map((c) => (c.valeur ? c : Object.assign(c, { valeur: A_COMPLETER, manque: true })))
        .map((c) => (/\[à compléter\]/.test(c.valeur) ? Object.assign(c, { manque: true }) : c)),
      engagements: ENGAGEMENTS_ATTESTATION_RIB,
      cloture: CLOTURE_ATTESTATION_RIB,
      signature: 'Signature'
    };
  }

  /** Nombre de champs « à compléter » du document. @param {{ champs: Array<{ manque?: boolean }> }} doc */
  function manquesAttestationRib(doc) {
    return (doc && doc.champs ? doc.champs : []).filter((c) => c.manque).length;
  }

  /**
   * Les personnes de la fiche qui peuvent attester : les personnes physiques, vendeurs d'abord, puis acquéreurs, puis les autres parties
   * (succession). `personnes` = résultat de personnesDossier(d) (fiches client d'Authentic réunies).
   * @param {any[]} personnes
   */
  function personnesAttestationRib(personnes) {
    const rang = (/** @type {any} */ p) => ({ VENDEUR: 0, ACQUEREUR: 1 }[/** @type {'VENDEUR'|'ACQUEREUR'} */ (String(p.role || '').toUpperCase())] ?? 2);
    return (Array.isArray(personnes) ? personnes : [])
      .filter((p) => p && String(p.nom || '').trim() && !p.morale)
      .map((p, i) => ({ p, i }))
      .sort((a, b) => rang(a.p) - rang(b.p) || a.i - b.i)
      .map((x) => x.p);
  }

  /** Nom du PDF : « Attestation RIB - DUPONT Paul.pdf ». @param {{ prenom?: string, nom?: string }} p */
  function nomFichierAttestationRib(p) {
    const nom = String((p && p.nom) || '').trim();
    const prenom = String((p && p.prenom) || '').trim();
    const dejaDans = prenom && sansAccent(nom).split(' ').includes(sansAccent(prenom).split(' ')[0]);
    const qui = [nom, dejaDans ? '' : prenom].filter(Boolean).join(' ');
    return `Attestation RIB${qui ? ' - ' + qui : ''}`.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
  }

  exporter({ A_COMPLETER, ENTETE_ATTESTATION_RIB, ENGAGEMENTS_ATTESTATION_RIB, CLOTURE_ATTESTATION_RIB, civiliteAttestationRib, nomCompletAttestationRib, referenceAttestationRib,
    documentAttestationRib, manquesAttestationRib, personnesAttestationRib, nomFichierAttestationRib });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
