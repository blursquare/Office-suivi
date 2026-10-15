// @ts-check
// Constitution de dossier (étude 15/10) — vente et succession : les courriers d'interrogation d'un dossier, préparés d'après la fiche
// (données d'Authentic d'abord), le répertoire et l'annuaire. Pur : poste et tests ; rien ici ne lit une fiche ni le réseau.
// Les textes viennent des modèles Word de l'étude (« Demande d'alignement et numérotage », « Demande non péril non insalubrité »,
// « Demande courrier de réponse assainissement ») : repris MOT POUR MOT, jamais reformulés. Les courriers de succession sont ceux de
// commun/courriers-succession.js.
(function (exporter) {
  'use strict';

  const INSEE_BLOIS = '41018';
  const EPCI_AGGLOPOLYS = '200030385';
  const EPCI_GRAND_CHAMBORD = '244100798';
  const INSEE_CHAILLES = '41032';
  const URL_GNAU_CHAILLES = 'https://portail-usager.sirap.com/041032/connexion';
  /** Courriel du service qui reçoit, pour les notaires, les demandes de numérotage et d'alignement à Blois (dicté par l'étude, à confirmer). */
  const COURRIEL_GEOMETRE_BLOIS = 'geometres.notaires@blois.fr';

  /** Les trois courriers papier d'une vente (le CU et la DIA passent par les guichets uniques, GNAU : jamais un courrier). */
  const COURRIERS_VENTE = [
    { cle: 'alignement', libelle: 'Alignement et numérotage', court: 'Alignement / numérotage' },
    { cle: 'peril', libelle: 'Péril, mise en sécurité, insalubrité', court: 'Non-péril' },
    { cle: 'assainissement', libelle: 'Assainissement', court: 'Assainissement' }
  ];

  /** Adresses des destinataires connus de l'étude (celles du modèle Word) ; le reste se saisit et se retient (clé `constitution-adresses`). */
  const DESTINATAIRES_CONNUS = {
    agglopolys: { libelle: 'Agglopolys — Service de l’Assainissement', lignes: ['AGGLOPOLYS', 'Service de l’Assainissement', '1 rue Honoré de Balzac', '41000 BLOIS'] },
    'grand-chambord': { libelle: 'Communauté de communes du Grand Chambord', lignes: ['COMMUNAUTÉ DE COMMUNES DU GRAND CHAMBORD', 'Service Eau et Assainissement', '22 avenue de la Sablière', '41250 BRACIEUX'] }
  };

  /**
   * Pure : comment part chaque courrier d'une vente selon la commune du bien. `commune` = { insee, epci (code SIREN de l'intercommunalité) }.
   * Blois : pas de courrier de péril (site de la Ville réservé aux notaires), numérotage et alignement par courriel à un service dédié.
   * Assainissement : à Agglopolys pour ses communes (Blois comprise), à la communauté de communes pour Grand Chambord, sinon à la
   * mairie ; toujours en papier. Autres communes : papier à la mairie.
   * @param {string} cle @param {{ insee?: string, epci?: string }} commune
   * @returns {{ mode: 'papier' | 'courriel' | 'en-ligne', destinataire: string, courriel: string, note: string }}
   */
  function circuitCourrierVente(cle, commune) {
    const insee = String((commune && commune.insee) || '');
    const epci = String((commune && commune.epci) || '');
    if (cle === 'peril' && insee === INSEE_BLOIS) {
      return { mode: 'en-ligne', destinataire: 'blois-en-ligne', courriel: '', note: 'À Blois, la demande se fait sur le site de la Ville dédié aux notaires : pas de courrier.' };
    }
    if (cle === 'alignement' && insee === INSEE_BLOIS) {
      return { mode: 'courriel', destinataire: 'blois-geometre', courriel: COURRIEL_GEOMETRE_BLOIS, note: 'À Blois, par courriel au service des géomètres dédié aux notaires.' };
    }
    if (cle === 'assainissement') {
      if (epci === EPCI_AGGLOPOLYS) return { mode: 'papier', destinataire: 'agglopolys', courriel: '', note: 'Commune d’Agglopolys : le courrier d’assainissement part à Agglopolys.' };
      if (epci === EPCI_GRAND_CHAMBORD) return { mode: 'papier', destinataire: 'grand-chambord', courriel: '', note: 'Commune du Grand Chambord : le courrier part à la communauté de communes.' };
    }
    return { mode: 'papier', destinataire: 'mairie', courriel: '', note: '' };
  }

  /** Pure : la particularité d'une commune pour le CU et la DIA (guichets uniques), ou ''. @param {string} insee */
  function noteGuichetCommune(insee) {
    if (String(insee || '') === INSEE_CHAILLES) return 'Chailles a son propre guichet unique (GNAU), différent de celui d’Agglopolys (portail SIRAP de la commune).';
    return '';
  }

  /** Pure : « 18 a 22 ca » / « 1 ha 05 a 10 ca » → centiares, ou null. @param {string} t */
  function centiaresDepuisContenance(t) {
    const s = String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
    // Colonne « surface » du cadastre d'Authentic : un nombre seul, en m² (= centiares).
    if (/^\d+$/.test(s)) return Number(s);
    const m = /^(?:(\d+)\s*ha)?\s*(?:(\d+)\s*a)?\s*(?:(\d+)\s*ca)?$/.exec(s);
    if (!m || (!m[1] && !m[2] && !m[3])) return null;
    return (Number(m[1] || 0) * 10000) + (Number(m[2] || 0) * 100) + Number(m[3] || 0);
  }

  /** Pure : centiares → « 1 ha 05 a 10 ca » (ha et a omis quand ils valent 0 en tête). @param {number} ca */
  function contenanceDepuisCentiares(ca) {
    const ha = Math.floor(ca / 10000);
    const a = Math.floor((ca % 10000) / 100);
    const c = ca % 100;
    return [ha ? `${ha} ha` : '', ha || a ? `${String(a).padStart(ha ? 2 : 1, '0')} a` : '', `${String(c).padStart(2, '0')} ca`].filter(Boolean).join(' ');
  }

  /** Pure : la contenance totale de parcelles dont toutes les contenances se lisent, sinon ''. @param {Array<{ surface?: string }>} parcelles */
  function contenanceTotale(parcelles) {
    const liste = (parcelles || []).map((p) => centiaresDepuisContenance(String((p && p.surface) || '')));
    if (!liste.length || liste.some((x) => x === null)) return '';
    return contenanceDepuisCentiares(/** @type {number[]} */ (liste).reduce((s, x) => s + x, 0));
  }

  /**
   * @typedef {{ prefixe?: string, section: string, numero: string, lieuDit?: string, surface?: string, commune?: string }} ParcelleCourrier
   * @typedef {{ civilite?: string, nom: string, domicile?: string, morale?: boolean }} ProprietaireCourrier
   */

  /** Pure : la ligne « Madame Monique BOUZY demeurant à VILLEBAROU (41000), 25 rue de la Gare. » d'un propriétaire. @param {ProprietaireCourrier} p */
  function lignePersonneProprietaire(p) {
    const identite = [String(p.civilite || '').trim(), String(p.nom || '').trim()].filter(Boolean).join(' ');
    const domicile = String(p.domicile || '').trim();
    if (p.morale) return `${identite}${domicile ? ' dont le siège est à ' + domicile : ''}.`;
    return `${identite} demeurant à ${domicile || '[adresse à compléter]'}.`;
  }

  /** Pure : le tableau des références cadastrales (format de courrierRenduAgent). @param {ParcelleCourrier[]} parcelles */
  function tableauParcelles(parcelles) {
    const cellule = (t) => String(t == null ? '' : t).replace(/\|/g, '/').trim();
    const lignes = ['| Préfixe | Section | N° | Adresse ou lieudit | Contenance |'];
    (parcelles || []).forEach((p) => lignes.push(`| ${cellule(p.prefixe)} | ${cellule(p.section)} | ${cellule(p.numero)} | ${cellule(p.lieuDit)} | ${cellule(/^\s*\d+\s*$/.test(String(p.surface || '')) ? contenanceDepuisCentiares(Number(p.surface)) : p.surface)} |`));
    const total = contenanceTotale(parcelles);
    if (total) lignes.push(`| | | | Contenance totale | ${total} |`);
    return lignes.join('\n');
  }

  /** Pure : la page du questionnaire d'assainissement que la mairie complète (reprise du modèle de l'étude). */
  function questionnaireAssainissement(o) {
    const ref = [String(o.reference || '').trim(), String(o.nomDossier || '').trim()].filter(Boolean).join(' - ');
    const oui = (q) => `| ${q} | [  ] | [  ] |`;
    return [
      '<<saut de page>>',
      '**A retourner à :**',
      'Maître Sophie GOSSART\n3 rue du Bout des Haies\n41000 BLOIS',
      `**Références dossier :** ${ref}\n**Adresse de l'immeuble :** ${String(o.adresseImmeuble || '').trim()}`,
      '**Contrôle et conformité de l\'immeuble en application de la loi n° 92-3 du 3 janvier 1992**',
      '**Nature du dispositif de traitement des eaux usées**\nIndividuel [  ]     Collectif [  ]',
      '**Service chargé du contrôle d\'assainissement**\nLa commune [  ]     Autre [  ] ______________________',
      '**En cas de traitement collectif**',
      ['| | OUI | NON |', '| --- | --- | --- |',
        oui('L\'immeuble est-il bien raccordé au réseau collectif ?'),
        oui('Si OUI, le contrôle de ce raccordement a-t-il été effectué ?'),
        '| - à quelle date ? ______________ | | |',
        oui('- est-il conforme à la législation ?'),
        '| Si NON, quelles sont les sources de dysfonctionnement ou obligations de remise en état ? ______________ | | |',
        oui('Le délai de 2 ans de l\'article L.1331-1 Code de la santé publique est-il expiré ?')].join('\n'),
      '**En cas de traitement individuel**',
      ['| | OUI | NON |', '| --- | --- | --- |',
        oui('La commune a-t-elle mis en place un dispositif de contrôle anticipé ?'),
        oui('Si OUI, le contrôle de l\'installation a-t-il été effectué ?'),
        '| - à quelle date ? ______________ | | |',
        oui('- est-il conforme à la législation ?'),
        '| Nature du dispositif autonome : ______________ | | |',
        '| Si NON, quelles sont les sources de dysfonctionnement ou obligations de remise en état ? ______________ | | |'].join('\n'),
      'Le ______________\n(signature et cachet de la Mairie)'
    ].join('\n\n');
  }

  const SALUT = 'Madame, Monsieur,';
  const FORMULE_FINALE = 'Je vous prie d\'agréer, Madame, Monsieur, mes salutations distinguées.';

  /**
   * Pure : le contenu d'un courrier de vente (format de courrierRenduAgent) ; '' si le courrier est inconnu.
   * @param {string} cle
   * @param {{ destinataire: string[], dateIso: string, adresseImmeuble: string, parcelles: ParcelleCourrier[], proprietaires: ProprietaireCourrier[],
   *   reference?: string, nomDossier?: string, dateLettre?: string }} o  `dateLettre` : « 12 octobre 2026 », déjà écrite par l'appelant.
   */
  function contenuCourrierVente(cle, o) {
    if (!COURRIERS_VENTE.some((c) => c.cle === cle)) return '';
    const adresse = (o.destinataire || []).map((l) => String(l).trim()).filter(Boolean);
    if (adresse.length < 2) adresse.push(...(adresse.length ? [' '] : ['À compléter', ' ']));
    const immeuble = String(o.adresseImmeuble || '').trim();
    const proprietaires = (o.proprietaires || []).map(lignePersonneProprietaire);
    const appartenant = ['Ledit immeuble appartenant à :'].concat(proprietaires).join('\n');
    const blocs = [adresse.join('\n'), `Blois, le ${o.dateLettre || '…'}`];
    if (cle === 'assainissement') {
      blocs.push('Objet : Contrôle et conformité assainissement', SALUT,
        `Je vous remercie de me préciser la situation au regard de l'assainissement de l'immeuble situé à ${immeuble}, et cadastré :`,
        tableauParcelles(o.parcelles), appartenant, 'Vous en remerciant par avance,', FORMULE_FINALE, 'Me Sophie GOSSART', questionnaireAssainissement(o));
    } else if (cle === 'alignement') {
      blocs.push(SALUT,
        `Je vous serais très obligé de bien vouloir me faire parvenir dans les meilleurs délais possibles, concernant un immeuble situé à ${immeuble} :`,
        '- Un certificat de numérotage,\n- Un certificat d\'alignement.',
        'A toutes fins utiles, voici les références cadastrales de cet immeuble :', tableauParcelles(o.parcelles), appartenant,
        'Dans l\'attente de vous lire, et avec mes remerciements anticipés,', FORMULE_FINALE, 'Me Sophie GOSSART');
    } else {
      blocs.push(SALUT,
        `Je vous serais très obligé de bien vouloir me préciser dans les meilleurs délais possibles, concernant un immeuble situé à ${immeuble}, si :`,
        '- L\'immeuble est frappé d\'un arrêté de péril,\n- L\'immeuble est frappé d\'un arrêté de mise en sécurité,\n- L\'immeuble est frappé d\'un arrêté d\'insalubrité.',
        'A toutes fins utiles, voici les références cadastrales de cet immeuble :', tableauParcelles(o.parcelles), appartenant,
        'Dans l\'attente de vous lire, et avec mes remerciements anticipés,', FORMULE_FINALE, 'Me Sophie GOSSART');
    }
    return blocs.join('\n\n');
  }

  /** Pure : le nom de fichier d'un courrier de vente : « Alignement et numérotage - SAINT SULPICE DE POMMERAY - VTE X ». @param {string} cle @param {string} commune @param {string} nomDossier */
  function nomFichierCourrierVente(cle, commune, nomDossier) {
    const c = COURRIERS_VENTE.find((x) => x.cle === cle);
    return [c ? c.libelle : 'Courrier', commune, nomDossier].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  /** La liste de départ des courriers d'une succession : tous ceux de l'étude SAUF la mutuelle (qui reste à ajouter à la demande). */
  const ORDRE_SUCCESSION_PAR_DEFAUT = ['impots', 'banque', 'assurance-vie', 'cpam', 'retraite', 'carsat', 'msa', 'ehpad'];

  /**
   * Pure : le défunt d'un dossier d'après les fiches client retenues d'Authentic (`d.authentic.fichesClients`) : la personne dont la fiche
   * porte une date de décès. Aucune fiche n'est devinée : sans date de décès, personne. `autres` = d'autres fiches avec décès (à signaler).
   * @param {any} d
   * @returns {{ fiche: any, autres: any[] }}
   */
  function defuntDepuisFiches(d) {
    const reg = (d && d.authentic && d.authentic.fichesClients) || {};
    const decedes = Object.values(reg).filter((f) => f && f.deces && f.deces.date);
    return { fiche: decedes[0] || null, autres: decedes.slice(1) };
  }

  /**
   * Pure : les lignes du conjoint du défunt d'après la situation matrimoniale d'Authentic. Rend { lien, nom } ; vide si Authentic ne donne rien.
   * La situation lue est affichée telle quelle : on ne devine pas « veuve de » d'après le sexe.
   * @param {any} sm situationMatrimoniale d'une fiche client
   * @param {string} civilite 'Madame' | 'Monsieur'
   */
  function conjointDefunt(sm, civilite) {
    const s = sm || {};
    const sit = String(s.situation || '').trim();
    const conjoint = String(s.conjoint || '').trim();
    if (!sit && !conjoint) return { lien: '', nom: '' };
    const femme = /^(madame|mme)/i.test(String(civilite || ''));
    const t = sit.toLowerCase();
    let lien = '';
    if (/veu/.test(t)) lien = femme ? 'Veuve de' : 'Veuf de';
    else if (/divorc/.test(t)) lien = femme ? 'Divorcée de' : 'Divorcé de';
    else if (/mari/.test(t)) lien = femme ? 'Épouse de' : 'Époux de';
    return { lien, nom: conjoint };
  }

  exporter({ URL_GNAU_CHAILLES, INSEE_BLOIS, EPCI_AGGLOPOLYS, EPCI_GRAND_CHAMBORD, INSEE_CHAILLES, COURRIEL_GEOMETRE_BLOIS, COURRIERS_VENTE, DESTINATAIRES_CONNUS, ORDRE_SUCCESSION_PAR_DEFAUT,
    circuitCourrierVente, noteGuichetCommune, centiaresDepuisContenance, contenanceDepuisCentiares, contenanceTotale, lignePersonneProprietaire, tableauParcelles,
    questionnaireAssainissement, contenuCourrierVente, nomFichierCourrierVente, defuntDepuisFiches, conjointDefunt });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
