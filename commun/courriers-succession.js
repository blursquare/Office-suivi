// @ts-check
// Courriers d'interrogation d'une succession (étude 15/10 : « les modèles de courrier d'envoi d'interrogation pour les successions »).
// Neuf modèles de l'étude, repris MOT POUR MOT de ses courriers (banque, assurance-vie, CPAM, caisse de retraite, CARSAT, MSA, mutuelle,
// EHPAD, impôts) : seuls varient le destinataire, la date, le bloc du défunt et les accords en genre. Pur : poste et tests.
// Le courrier est décrit ligne à ligne (`documentCourrierSuccession`) et composé en Word, PDF et aperçu par client/73-courrier-fidele.js.
(function (exporter) {
  'use strict';

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  /** « 2026-10-01 » → « 01 octobre 2026 » (forme des courriers de l'étude) ; '' si la date n'existe pas. @param {string} iso */
  function dateCourrierSuccession(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return '';
    const mois = Number(m[2]);
    if (mois < 1 || mois > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) return '';
    return `${m[3]} ${MOIS[mois - 1]} ${m[1]}`;
  }

  /**
   * @typedef {{ civilite?: string, prenoms?: string, nom?: string, domicile?: string, naissanceDate?: string, naissanceLieu?: string,
   *   decesDate?: string, decesLieu?: string, conjointLien?: string, conjointNom?: string }} DefuntCourrier
   * @typedef {{ f: boolean, nomUsuel: string, texteLibre: string }} VariablesCourrier
   * @typedef {{ cle: string, libelle: string, destinataire: string[], salutation: string, blancsSignature: number, lignes: (v: VariablesCourrier) => string[] }} ModeleCourrierSuccession
   */

  // Les courriers de l'étude, LIGNE À LIGNE comme ses originaux (étude 15/10 : « la même disposition, à la ligne près, l'espacement près ») :
  // chaque chaîne est un paragraphe, '' une ligne vide ; **gras** comme dans les courriers reçus le 15/10 (le bleu souligné des modèles marquait les variables
  // d'Authentic : jamais repris, étude 15/10). `lignes` va de
  // la première phrase après la formule d'appel jusqu'à la formule de politesse ; `blancsSignature` = lignes vides avant « Me … ».
  /** @type {ModeleCourrierSuccession[]} */
  const MODELES_COURRIER_SUCCESSION = [
    {
      cle: 'banque', libelle: 'Banque', destinataire: [], salutation: 'Madame la Directrice, Monsieur le Directeur,', blancsSignature: 1,
      lignes: (v) => [
        'En ma qualité de notaire chargé du règlement de la succession de la personne ci-dessus visée, je vous serais très obligé de bien vouloir, savoir :', '',
        '1°) Me faire connaître, au jour du décès et à ce jour :', '',
        '- la situation du ou des comptes, en capital et intérêts, dont le défunt et/ou son conjoint étaient titulaires en votre établissement. Si un compte était débiteur au jour du décès, veuillez joindre à votre réponse une attestation de créancier, pour justifier du passif dans la déclaration de succession que je serai appelé à dresser.',
        '- la liste et l\'évaluation des valeurs mobilières (cours moyen du jour du décès d\'une part et moyenne des trente derniers cours ayant précédé le décès conformément à l\'article 759 du Code général des impôts d\'autre part),',
        '- le cas échéant, si un coffre-fort y était ouvert.', '',
        `2°) Me communiquer les caractéristiques des **contrats d'assurance-vie** ou assimilés souscrits ${v.f ? 'par la défunte' : 'par le défunt'}, quelle que soit la date de souscription.`, '',
        '3°) M\'informer si le défunt et/ou son conjoint s\'étaient ou non portés **caution** dans un ou plusieurs prêts. A défaut de réponse de votre part sur ce point, je considérerai votre silence comme valant réponse négative.', '',
        '4°) M\'adresser les renseignements nécessaires pour établir la **déclaration des revenus** du 1er janvier au jour du décès, laquelle en vertu de l\'article 204-2° du Code général des impôts, doit être déposée dans les six mois du décès.', '',
        '5°) Et m\'indiquer également les **formalités** à respecter pour mettre les fonds à disposition des héritiers.', '',
        'Vous en remerciant vivement par avance,', '',
        'Je vous prie d\'agréer, Madame la Directrice, Monsieur le Directeur, mes salutations distinguées.'
      ]
    },
    {
      cle: 'assurance-vie', libelle: 'Assurance-vie', destinataire: [], salutation: 'Madame la Directrice, Monsieur le Directeur,', blancsSignature: 2,
      lignes: () => [
        'Dans le cadre du règlement de la succession de la personne ci-dessus visée, et en application de l\'article L.132-13 du Code des assurances,', '',
        'Je vous remercie de bien vouloir me communiquer les éléments suivants concernant le contrat souscrit par le défunt auprès de votre compagnie d\'assurance :', '',
        '- Nom du contrat', '- Numéro du contrat', '- Date de souscription', '- Montant des primes versées avant 70 ans', '- Montant des primes versées après 70 ans', '- Identité du ou des bénéficiaires', '',
        'Vous en remerciant par avance, je vous prie d\'agréer, Madame la Directrice, Monsieur le Directeur, mes salutations distinguées.'
      ]
    },
    {
      cle: 'cpam', libelle: 'CPAM', destinataire: ['C.P.A.M. DE LOIR ET CHER'], salutation: 'Madame, Monsieur,', blancsSignature: 2,
      lignes: (v) => [
        `En ma qualité de notaire chargé du règlement de la succession de la personne ci-dessus visée, je vous informe que ${v.f ? 'la défunte' : 'le défunt'} dépendait de votre caisse.`, '',
        'Il existe peut-être actuellement un ou plusieurs dossiers de remboursement de soins médicaux en cours d\'étude dans vos services.', '',
        'Je vous serais obligé de bien vouloir me faire connaître :',
        '- le montant des sommes dues par votre caisse au titre de ces prestations et réglées postérieurement au décès,',
        '- le montant des sommes dues par vous au titre de ces prestations mais non encore réglées actuellement,',
        '- les pièces à produire à votre caisse afin que je puisse entrer en possession de ces dernières sommes.', '',
        'Une prompte réponse de votre part m\'obligerait.', '',
        'Vous en remerciant par avance,', '',
        'Je vous prie d\'agréer, Madame, Monsieur, mes salutations distinguées.'
      ]
    },
    {
      cle: 'retraite', libelle: 'Caisse de retraite (AGIRC-ARRCO)', destinataire: ['Centre de réception AGIRC-ARRCO', 'TSA 36661', '92621 GENNEVILLIERS Cedex'], salutation: 'Madame, Monsieur,', blancsSignature: 1,
      lignes: () => [
        'En ma qualité de notaire chargé du règlement de la succession de la personne ci-dessus visée, il a été porté à ma connaissance que le défunt était titulaire d\'une allocation servie par votre organisme.', '',
        'Aussi, je vous serais très obligé de bien vouloir me faire connaître :',
        '- le montant des arrérages échus au décès.',
        '- **si le défunt était titulaire de l\'allocation supplémentaire du FONDS DE SOLIDARITE VIEILLESSE**, à défaut de réponse de votre part sur ce point, la succession sera liquidée sans tenir compte de cette éventuelle créance,',
        '- et pour l\'établissement de la déclaration de revenus, le montant des allocations versées depuis le premier janvier jusqu\'à la date dudit décès.', '',
        'Le cas échéant, je vous remercie également de bien vouloir m’informer sur les conditions et modalités de prise en charge des frais funéraires au titre d’un capital décès.', '',
        'Vous en remerciant par avance,', '',
        'Je vous prie d\'agréer, Madame, Monsieur, mes salutations distinguées.'
      ]
    },
    {
      cle: 'carsat', libelle: 'CARSAT', destinataire: ['CARSAT CENTRE-VAL DE LOIRE', '30 boulevard Jean Jaurès', '45033 ORLEANS CEDEX'], salutation: 'Madame la Directrice, Monsieur le Directeur,', blancsSignature: 2,
      lignes: () => [
        'En ma qualité de notaire chargé du règlement de la succession de la personne ci-dessus visée, je vous serais très obligé de bien vouloir me faire savoir si cette succession est redevable de quelque somme que ce soit auprès de votre organisme.', '',
        'Vous en remerciant par avance,', '',
        'Je vous prie d\'agréer, Madame la Directrice, Monsieur le Directeur, mes salutations distinguées.'
      ]
    },
    {
      cle: 'msa', libelle: 'MSA', destinataire: ['MSA BERRY TOURAINE', '19 avenue de Vendôme', 'CS 72301', '41023 BLOIS CEDEX'], salutation: 'Madame la Directrice, Monsieur le Directeur,', blancsSignature: 2,
      lignes: () => [
        'En ma qualité de notaire chargé du règlement de la succession de la personne ci-dessus visée, je vous serais très obligé de bien vouloir me faire savoir si cette succession est redevable de quelque somme que ce soit auprès de votre organisme.', '',
        'Vous en remerciant par avance,', '',
        'Je vous prie d\'agréer, Madame la Directrice, Monsieur le Directeur, mes salutations distinguées.'
      ]
    },
    {
      cle: 'mutuelle', libelle: 'Mutuelle', destinataire: [], salutation: 'Madame, Monsieur,', blancsSignature: 2,
      lignes: () => [
        'En ma qualité de notaire chargé du règlement de la succession de la personne ci-dessus visée, je vous remercie de bien vouloir m\'indiquer :', '',
        '- si un capital décès est dû aux ayants-droit ;', '- si une allocation spécifique est versée pour les frais d\'obsèques ;', '- le montant des arrérages qui seraient dus au défunt au jour de son décès.', '',
        'Vous en remerciant par avance,', '',
        'Je vous prie d\'agréer, Madame, Monsieur, mes salutations distinguées.'
      ]
    },
    {
      cle: 'ehpad', libelle: 'EHPAD / maison de retraite', destinataire: [], salutation: 'Madame la Directrice, Monsieur le Directeur,', blancsSignature: 1,
      lignes: (v) => [
        `En ma qualité de notaire chargé du règlement de la succession de la personne ci-dessus visée, ${v.f ? 'laquelle' : 'lequel'} séjournait dans votre établissement, je vous prie de bien vouloir m’indiquer, s’il y a lieu :`, '',
        '- les objets mobiliers que vous avez en dépôt,',
        '- le montant des sommes dues par vous au défunt, au jour du décès ou postérieurement, en précisant celles qui sont réglées depuis,',
        '- les pièces que j’aurais à vous fournir soit pour obtenir le versement à la comptabilité de l’office notarial des sommes non encore réglées, soit pour vous dessaisir entre les mains des ayants droit des objets que vous détenez,',
        '- le montant des sommes dues par le défunt, au jour du décès ou postérieurement, en précisant celles qui sont réglées depuis,',
        '- le cas échéant, une copie des états des lieux d’entrée et de sortie, conformément à l’article L.311-7-1 du Code de l’action sociale et des familles. A défaut, l’article L.314-10-2 du même Code dispose qu’aucune somme ne peut être exigée pour la remise en état des lieux.', '',
        'Je me permets, à toutes fins utiles, de vous rappeler les dispositions de l’article L.314-10-1 du Code de l’action sociale et des familles : « Au décès du résident, dès lors que ses objets personnels ont été retirés des lieux qu\'il occupait, seules les prestations d\'hébergement délivrées antérieurement au décès mais non acquittées peuvent être facturées.',
        'Les sommes perçues d\'avance correspondant à des prestations non délivrées en raison du décès sont restituées dans les trente jours suivant le décès.',
        'Toute stipulation du contrat de séjour ou du document individuel de prise en charge contraire aux deux premiers alinéas est réputée non écrite. »', '',
        'Dans cette attente,', '',
        'Je vous prie d\'agréer, Madame la Directrice, Monsieur le Directeur, mes salutations distinguées.'
      ]
    },
    {
      cle: 'impots', libelle: 'Impôts (SPFE de Blois)', destinataire: ['SPFE DE BLOIS', '10 rue Louis Bodin', '41000 BLOIS'], salutation: 'Madame la Trésorière, Monsieur le Trésorier,', blancsSignature: 2,
      lignes: (v) => [
        'En ma qualité de notaire chargé du règlement de la succession de la personne ci-dessus visée :', '',
        `1°) Je vous serais très obligé de bien vouloir me faire connaître, au moyen d'un bordereau, la situation fiscale de ${v.nomUsuel} au regard de l'impôt sur le revenu, de la C.S.G. et de la C.R.D.S., ainsi que les montants des taxes d'habitation et foncière.`, '',
        `2°) Dans le cas où ${v.f ? 'la défunte' : 'le défunt'} aurait fait mensualiser le paiement de ses impôts, je vous remercie par avance de bien vouloir me préciser :`, '',
        '- le montant des échéances prélevées au jour du décès,', '- le solde restant dû au jour du décès **et** à ce jour.', '',
        'Vous en remerciant vivement par avance,', '',
        'Je vous prie d\'agréer, Madame la Trésorière, Monsieur le Trésorier, mes salutations distinguées.'
      ]
    },
    {
      // Courrier vierge (étude 15/10 : « des courriers vierges, juste autre organisme ») : le texte se saisit dans l'outil.
      cle: 'autre', libelle: 'Autre organisme', destinataire: [], salutation: 'Madame, Monsieur,', blancsSignature: 2,
      lignes: (v) => String(v.texteLibre || '').replace(/\r/g, '').split('\n').concat(['', 'Vous en remerciant par avance,', '', 'Je vous prie d\'agréer, Madame, Monsieur, mes salutations distinguées.'])
    }
  ];

  /** Le texte proposé d'un courrier vierge, à reprendre librement. */
  const TEXTE_LIBRE_PAR_DEFAUT = 'En ma qualité de notaire chargé du règlement de la succession de la personne ci-dessus visée, je vous serais très obligé de bien vouloir me faire savoir si cette succession est redevable de quelque somme que ce soit auprès de votre organisme.';

  /** @param {string} cle */
  function modeleCourrierSuccession(cle) { return MODELES_COURRIER_SUCCESSION.find((m) => m.cle === cle) || null; }

  /** Pure : le défunt est-il une femme (« Madame ») ? @param {DefuntCourrier} [defunt] */
  function defuntEstUneFemme(defunt) { return /^(madame|mme)\b/i.test(String((defunt && defunt.civilite) || '')); }

  /** Pure : les lignes du bloc du défunt, comme dans les courriers de l'étude (la première soulignée). @param {DefuntCourrier} defunt */
  function lignesBlocDefunt(defunt) {
    const d = defunt || {};
    const civ = String(d.civilite || '').trim();
    const identite = [civ, String(d.prenoms || '').trim(), String(d.nom || '').trim()].filter(Boolean).join(' ');
    const lieuDate = (iso, lieu) => {
      const date = dateCourrierSuccession(iso);
      const l = String(lieu || '').trim();
      return date ? `le ${date}${l ? ' à ' + l : ''}` : l;
    };
    // Sans soulignement (étude 15/10 : le bleu souligné des modèles marque les variables d'Authentic, pas une mise en forme).
    const lignes = [`Succession de : ${identite}`];
    if (String(d.domicile || '').trim()) lignes.push(`Domicile : ${String(d.domicile).trim()}`);
    const naissance = lieuDate(d.naissanceDate, d.naissanceLieu);
    if (naissance) lignes.push(`Date et lieu de naissance : ${naissance}`);
    const deces = lieuDate(d.decesDate, d.decesLieu);
    if (deces) lignes.push(`Date et lieu de décès : ${deces}`);
    if (String(d.conjointLien || '').trim() && String(d.conjointNom || '').trim()) lignes.push(`${String(d.conjointLien).trim()} : ${String(d.conjointNom).trim()}`);
    return lignes;
  }

  /**
   * Pure : le courrier ligne à ligne (même forme que `documentCourrierVente`) ; null si le modèle est inconnu. La référence du dossier et
   * « Dossier suivi par » vont dans la colonne de gauche de l'en-tête (« Nos Réf »), comme dans les courriers de l'étude.
   * @param {string} cleModele
   * @param {{ destinataire?: string[], envoiParMail?: boolean, dateIso?: string, defunt?: DefuntCourrier, texteLibre?: string, salutation?: string }} o
   */
  function documentCourrierSuccession(cleModele, o) {
    const modele = modeleCourrierSuccession(cleModele);
    if (!modele) return null;
    const opt = o || {};
    const defunt = opt.defunt || {};
    const f = defuntEstUneFemme(defunt);
    const prenomUsuel = String(defunt.prenoms || '').trim().split(/\s+/)[0] || '';
    const nomUsuel = [String(defunt.civilite || '').trim(), prenomUsuel, String(defunt.nom || '').trim()].filter(Boolean).join(' ');
    const adresse = (opt.destinataire && opt.destinataire.length ? opt.destinataire : modele.destinataire).map((l) => String(l).trim()).filter(Boolean);
    if (opt.envoiParMail) adresse.push('Envoi par mail');
    if (!adresse.length) adresse.push('À compléter');
    const salutation = String(opt.salutation || '').trim() || modele.salutation;
    return {
      adresse, adresseDebut: adresse.length >= 4 ? 1 : 2,
      date: `Blois, le ${dateCourrierSuccession(opt.dateIso || '') || '…'}`,
      lignes: ['', '', '', '', ...lignesBlocDefunt(defunt), '', '', salutation, '', ...modele.lignes({ f, nomUsuel, texteLibre: String(opt.texteLibre || TEXTE_LIBRE_PAR_DEFAUT) })],
      signature: 'Me Sophie GOSSART', blancsSignature: modele.blancsSignature
    };
  }

  /** Nom de fichier du courrier : « Interrogation Banque - SUCC Alice FRA » (sans caractère interdit). @param {string} cleModele @param {string} nomDossier */
  function nomFichierCourrierSuccession(cleModele, nomDossier) {
    const m = modeleCourrierSuccession(cleModele);
    return `Interrogation ${m ? m.libelle : 'organisme'}${nomDossier ? ' - ' + nomDossier : ''}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  exporter({ MODELES_COURRIER_SUCCESSION, TEXTE_LIBRE_PAR_DEFAUT, modeleCourrierSuccession, dateCourrierSuccession, defuntEstUneFemme, lignesBlocDefunt, documentCourrierSuccession, nomFichierCourrierSuccession });
})(function (api) {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(/** @type {any} */ (globalThis), api);
});
