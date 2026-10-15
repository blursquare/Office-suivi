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

  /** Pure : une contenance d'Authentic (nombre seul = m²) écrite « 5 a 12 ca ». @param {string} [surface] */
  function contenanceEcrite(surface) {
    const s = String(surface == null ? '' : surface).trim();
    return /^\d+$/.test(s) ? contenanceDepuisCentiares(Number(s)) : s;
  }

  // Le tableau des références cadastrales des courriers de l'étude, tel que dans ses modèles Word : cinq colonnes (en twips),
  // en-tête grisé (E6E6E6), « Contenance » centrée, contenances à droite, ligne « Contenance totale » sur les quatre premières colonnes.
  const GRILLE_PARCELLES = [862, 924, 909, 3808, 1769];

  /**
   * @typedef {{ texte: string, fond?: string, jc?: 'left'|'center'|'right', span?: number }} CelluleCourrier
   * @typedef {{ type: 'tableau', grille: number[], ind: number, lignes: Array<{ cellules: CelluleCourrier[] }> }} TableauCourrier
   * @typedef {{ adresse: string[], adresseDebut: number, date: string, lignes: Array<string|TableauCourrier>, signature: string, blancsSignature: number,
   *   questionnaire?: { references: string, adresseImmeuble: string } }} DocumentCourrier
   */

  /** Pure : le tableau des parcelles d'un courrier. @param {ParcelleCourrier[]} parcelles @returns {TableauCourrier} */
  function tableauParcellesCourrier(parcelles) {
    const gris = 'E6E6E6';
    /** @type {CelluleCourrier[]} */
    const entete = ['Préfixe', 'Section', 'N°', 'Adresse ou lieudit'].map((t) => ({ texte: t, fond: gris }));
    entete.push({ texte: 'Contenance', fond: gris, jc: 'center' });
    /** @type {Array<{ cellules: CelluleCourrier[] }>} */
    const lignes = [{ cellules: entete }];
    (parcelles || []).forEach((p) => lignes.push({ cellules: [
      { texte: String(p.prefixe || '').trim() }, { texte: String(p.section || '').trim() }, { texte: String(p.numero || '').trim() },
      { texte: String(p.lieuDit || '').trim() }, { texte: contenanceEcrite(p.surface), jc: 'right' }] }));
    const total = contenanceTotale(parcelles);
    if (total) lignes.push({ cellules: [{ texte: 'Contenance totale', span: 4, jc: 'right' }, { texte: total, jc: 'right' }] });
    return { type: 'tableau', grille: GRILLE_PARCELLES.slice(), ind: 113, lignes };
  }

  const FORMULE_FINALE = 'Je vous prie d\'agréer, Madame, Monsieur, mes salutations distinguées.';

  /**
   * Pure : un courrier de vente LIGNE À LIGNE comme le modèle Word de l'étude (étude 15/10 : « exactement la même disposition, à la ligne
   * près ») — chaque chaîne est un paragraphe, '' une ligne vide ; **gras**, __souligné__. null si le courrier est inconnu.
   * @param {string} cle
   * @param {{ destinataire: string[], adresseImmeuble: string, parcelles: ParcelleCourrier[], proprietaires: ProprietaireCourrier[],
   *   reference?: string, nomDossier?: string, dateLettre?: string, texteLibre?: string }} o
   * @returns {DocumentCourrier|null}
   */
  function documentCourrierVente(cle, o) {
    if (!COURRIERS_VENTE.some((c) => c.cle === cle) && cle !== 'autre') return null;
    const adresse = (o.destinataire || []).map((l) => String(l).trim()).filter(Boolean);
    if (!adresse.length) adresse.push('À compléter');
    const immeuble = String(o.adresseImmeuble || '').trim();
    const tableau = tableauParcellesCourrier(o.parcelles);
    const appartenant = ['Ledit immeuble appartenant à :'].concat((o.proprietaires || []).map(lignePersonneProprietaire));
    /** @type {Array<string|TableauCourrier>} */
    let lignes;
    if (cle === 'assainissement') {
      lignes = ['', '', '', '**Objet : Contrôle et conformité assainissement**', '', 'Madame, Monsieur,', '',
        `Je vous remercie de me préciser la situation au regard de l’assainissement de l’immeuble situé à ${immeuble}, et cadastré :`,
        tableau, ...appartenant, 'Vous en remerciant par avance,', '', FORMULE_FINALE];
    } else if (cle === 'alignement') {
      lignes = ['', '', '', 'Madame, Monsieur,', '',
        `Je vous serais très obligé de bien vouloir me faire parvenir dans les meilleurs délais possibles, concernant un immeuble situé à ${immeuble} :`, '',
        '- **Un certificat de numérotage,**', '**- Un certificat d\'alignement.**', '',
        'A toutes fins utiles, voici les références cadastrales de cet immeuble :', tableau, ...appartenant,
        'Dans l\'attente de vous lire, et avec mes remerciements anticipés,', '', FORMULE_FINALE];
    } else if (cle === 'peril') {
      lignes = ['', '', '', 'Madame, Monsieur,', '',
        `Je vous serais très obligé de bien vouloir me préciser dans les meilleurs délais possibles, concernant un immeuble situé à ${immeuble}, si :`, '',
        '- L\'immeuble est frappé d\'un **arrêté de péril,**', '- L\'immeuble est frappé d\'un **arrêté de mise en sécurité,**', '- L\'immeuble est frappé d\'un **arrêté d\'insalubrité.**', '',
        'A toutes fins utiles, voici les références cadastrales de cet immeuble :', tableau, ...appartenant,
        'Dans l\'attente de vous lire, et avec mes remerciements anticipés,', '', FORMULE_FINALE];
    } else {
      // Courrier vierge (étude 15/10 : « autre organisme ») : le texte saisi, puis les références et les propriétaires comme les autres.
      const libre = String(o.texteLibre || '').replace(/\r/g, '').split('\n');
      lignes = ['', '', '', 'Madame, Monsieur,', '', ...libre, '', 'A toutes fins utiles, voici les références cadastrales de cet immeuble :', tableau, ...appartenant,
        'Dans l\'attente de vous lire, et avec mes remerciements anticipés,', '', FORMULE_FINALE];
    }
    /** @type {DocumentCourrier} */
    // « Me  Sophie » : deux espaces, comme dans les modèles de vente de l'étude (la signature à droite tombe au même endroit).
    const doc = { adresse, adresseDebut: 1, date: `Blois, le ${o.dateLettre || '…'}`, lignes, signature: 'Me  Sophie GOSSART', blancsSignature: 0 };
    if (cle === 'assainissement') {
      doc.questionnaire = { references: [String(o.reference || '').trim(), String(o.nomDossier || '').trim()].filter(Boolean).join(' - '), adresseImmeuble: immeuble };
    }
    return doc;
  }

  /** Pure : le texte brut d'un courrier (une ligne par paragraphe ; tableau en lignes « AB — 123 — … »), sans destinataire ni date ni signature. @param {DocumentCourrier} doc */
  function texteCorpsDocument(doc) {
    const sortie = [];
    (doc && doc.lignes || []).forEach((l) => {
      if (typeof l === 'string') { sortie.push(l.replace(/\*\*|__/g, '')); return; }
      l.lignes.slice(1).forEach((r) => sortie.push(r.cellules.map((c) => c.texte).filter(Boolean).join(' — ')));
    });
    return sortie.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
   * @returns {{ fiche: any, autres: any[], comparant: any }}
   */
  function defuntDepuisFiches(d) {
    const reg = (d && d.authentic && d.authentic.fichesClients) || {};
    const fiches = Object.values(reg).filter(Boolean);
    const decedes = fiches.filter((f) => f.deces && f.deces.date);
    // Étude 15/10 : la rubrique « Comparants » d'Authentic dit qui est le défunt (qualité « Défunt ») — elle passe avant la date de
    // décès d'une fiche : la fiche qui porte son nom est celle du défunt, même lue avant que la date de décès n'y soit.
    const comparant = comparantsSuccession(d).find((c) => c.role === 'DEFUNT') || null;
    if (comparant) {
      const fiche = fiches.find((f) => [f.nom, [f.prenom, f.nomUsage].filter(Boolean).join(' ')].some((n) => memePersonneNommee(n, comparant.nom))) || null;
      return { fiche, autres: fiche ? decedes.filter((f) => f !== fiche) : decedes, comparant };
    }
    return { fiche: decedes[0] || null, autres: decedes.slice(1), comparant: null };
  }

  /**
   * Pure : les comparants d'une succession relevés dans Authentic (`d.authentic.comparants`, rôle DEFUNT ou HERITIER).
   * @param {any} d
   * @returns {any[]}
   */
  function comparantsSuccession(d) {
    const c = d && d.authentic && Array.isArray(d.authentic.comparants) ? d.authentic.comparants : [];
    return c.filter((x) => x && x.nom && (x.role === 'DEFUNT' || x.role === 'HERITIER'));
  }

  /** @param {string} t */
  function motsPersonne(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
      .filter((m) => m.length >= 2 && !/^(m|mme|mlle|monsieur|madame|mademoiselle|mr)$/.test(m));
  }

  /**
   * Pure : vrai si deux libellés désignent la même personne, mots dans n'importe quel ordre (« DUPONT Marie » = « Marie DUPONT ») :
   * tous les mots du plus court se retrouvent dans l'autre, deux mots au moins (un nom de famille seul ne suffit pas, sauf seul des deux côtés).
   * @param {string} a
   * @param {string} b
   */
  function memePersonneNommee(a, b) {
    const ma = motsPersonne(a), mb = motsPersonne(b);
    if (!ma.length || !mb.length) return false;
    const [court, long] = ma.length <= mb.length ? [ma, mb] : [mb, ma];
    if (court.length < 2 && long.length >= 2) return false;
    if (!court.every((m) => long.includes(m))) return false;
    // Prénom composé (relecture 15/10) : « Jean-Pierre DUPONT » n'est pas « Jean DUPONT » (le fils pris pour le père défunt) ;
    // « Jean-Pierre » = « Jean Pierre » reste vrai.
    const composes = (/** @type {string} */ t) => (String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) || []);
    const ca = composes(a), cb = composes(b);
    const couvre = (/** @type {string[]} */ comp, /** @type {string[]} */ mots, /** @type {string[]} */ compAutre) =>
      comp.every((c) => compAutre.includes(c) || c.split('-').filter((m) => m.length >= 2).every((m) => mots.includes(m)));
    return couvre(ca, mb, cb) && couvre(cb, ma, ca);
  }

  /**
   * Pure : « DUPONT Marie Jeanne » (forme des comparants : nom en capitales, puis prénoms) → { nom, prenoms }.
   * @param {string} libelle
   */
  function nomPrenomsComparant(libelle) {
    const mots = String(libelle || '').trim().split(/\s+/).filter(Boolean);
    const maj = mots.filter((m) => m.length >= 2 && m === m.toUpperCase() && /[A-ZÀ-Þ]/.test(m));
    if (!maj.length) return { nom: '', prenoms: mots.join(' ') };
    return { nom: maj.join(' '), prenoms: mots.filter((m) => !maj.includes(m)).join(' ') };
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

  exporter({ URL_GNAU_CHAILLES, INSEE_BLOIS, EPCI_AGGLOPOLYS, EPCI_GRAND_CHAMBORD, INSEE_CHAILLES, COURRIEL_GEOMETRE_BLOIS, COURRIERS_VENTE, DESTINATAIRES_CONNUS, ORDRE_SUCCESSION_PAR_DEFAUT, GRILLE_PARCELLES,
    circuitCourrierVente, noteGuichetCommune, centiaresDepuisContenance, contenanceDepuisCentiares, contenanceTotale, contenanceEcrite, lignePersonneProprietaire,
    tableauParcellesCourrier, documentCourrierVente, texteCorpsDocument, nomFichierCourrierVente, defuntDepuisFiches, conjointDefunt, comparantsSuccession, memePersonneNommee, nomPrenomsComparant });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
