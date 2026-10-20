'use strict';

// Répertoire de l'étude (demandé le 30/09/2026 : « créer un répertoire avec les confrères et ce
// nouveau fichier, classé par thèmes »). Deux sources réunies sur une même page côté client :
//   - les offices notariaux : le carnet des confrères (carnetConfreres.js, inchangé) ;
//   - tous les autres interlocuteurs de l'étude, ici : banques, assurances, caisses de retraite,
//     tribunaux, mairies, département, impôts, agences… — relevés du répertoire Word de l'étude
//     (REPERTOIRE.doc, enregistré le 02/09/2026), un contact par service, classés par thème.
// Coordonnées professionnelles d'organismes et de leurs services, pas des données clients.
// Partagé entre les postes (table `parametres`, clé `repertoire-contacts`) ; l'étude corrige et
// complète sur place, une fiche modifiée garde sa propre valeur. Pour recharger ce relevé, effacer
// la clé : le répertoire repart de cette liste.
//
// Repris tel quel du document, sans rien deviner : les codes de fusion Genapi (« {SUCDDS:BXCG} »)
// sont retirés, les doublons du document réunis sur une seule fiche, les adresses manifestement
// incomplètes signalées dans les notes plutôt que corrigées. Les deux images du document (police
// de l'eau, Caisse d'épargne) n'ont pas pu être lues.

const SOURCE_REPERTOIRE_WORD = 'Répertoire Word de l’étude (02/09/2026)';

// Thèmes, dans l'ordre de la page. « confreres » est le carnet des confrères (offices notariaux) :
// seuls des contacts isolés d'une étude (un clerc) y sont rangés ici.
const THEMES_REPERTOIRE = [
  { cle: 'confreres', libelle: 'Confrères' },
  { cle: 'banquesPrets', libelle: 'Banques — prêts et mainlevées' },
  { cle: 'banquesSuccessions', libelle: 'Banques — successions' },
  { cle: 'assurances', libelle: 'Assurances et assurance-vie' },
  { cle: 'social', libelle: 'Retraite, santé et aide sociale' },
  { cle: 'maisonsRetraite', libelle: 'Maisons de retraite et EHPAD' },
  { cle: 'justice', libelle: 'Tribunaux et état civil' },
  { cle: 'impots', libelle: 'Impôts et enregistrement' },
  { cle: 'mairies', libelle: 'Mairies et urbanisme' },
  { cle: 'departement', libelle: 'Département et services de l’État' },
  { cle: 'immobilier', libelle: 'Agences immobilières' },
  { cle: 'syndics', libelle: 'Syndics de copropriété' },
  { cle: 'divers', libelle: 'Chambres consulaires et divers' }
];
const CLES_THEMES = new Set(THEMES_REPERTOIRE.map((t) => t.cle));

// { id, theme, organisme, service, personnes[], adresse, telephones[], emails[], liens[], notes }
// Un téléphone ou un email peut porter son libellé devant « : » (« Mainlevée : 04 67 40 94 00 »).
const REPERTOIRE_INITIAL = [
  // ---- Confrères (contact isolé ; les offices sont dans le carnet) ----
  { id: 'rep-boissay-rossignol', theme: 'confreres', organisme: 'Étude de Me BOISSAY', service: '', personnes: ['Elodie ROSSIGNOL'], telephones: ['02 54 95 28 97'] },

  // ---- Banques — prêts et mainlevées ----
  { id: 'rep-cic-pret', theme: 'banquesPrets', organisme: 'CIC', service: 'Service prêt', emails: ['cicosc07@ic.fr'] },
  { id: 'rep-ca-centre-ouest-pret', theme: 'banquesPrets', organisme: 'Crédit Agricole Centre Ouest', service: 'Service prêt', emails: ['viedupret@ca-centreouest.fr'] },
  { id: 'rep-ca-touraine-poitou-pret', theme: 'banquesPrets', organisme: 'Crédit Agricole Touraine Poitou', service: 'Service prêt',
    telephones: ['09 69 39 99 19'], emails: ['relationcreditclient@ca-tourainepoitou.fr', 'Décompte de remboursement : notaires-remboursements@ca-tourainepoitou.fr'] },
  { id: 'rep-ca-val-de-france-pret', theme: 'banquesPrets', organisme: 'Crédit Agricole Val de France', service: 'Service prêt de Blois',
    telephones: ['02 54 58 38 73', '02 54 58 38 74', '02 54 58 39 63'], emails: ['Vie.credits@ca-valdefrance.fr', 'real.part.credits.vdf@ca-valdefrance.fr'] },
  { id: 'rep-ca-brie-picardie', theme: 'banquesPrets', organisme: 'Crédit Agricole Brie Picardie', service: 'Décompte de remboursement et mainlevée',
    telephones: ['01 60 25 92 66'], emails: ['evenements.gestion@ca-briepicardie.fr'] },
  { id: 'rep-caisse-epargne-notaires', theme: 'banquesPrets', organisme: 'Caisse d’Épargne', service: 'Notaires, crédits et mainlevées', personnes: ['Madame DOUCERON'],
    telephones: ['Madame DOUCERON : 02 34 06 83 32', 'Mainlevée : 04 67 40 94 00', '01 56 70 35 00'],
    emails: ['notaires@ec.caisse-epargne.fr', 'assistance-credits@celc.caisse-epargne.fr', 'bpcesc-notaires@bpce-sc.fr'] },
  { id: 'rep-banque-postale-remboursement', theme: 'banquesPrets', organisme: 'La Banque Postale', service: 'Décompte de remboursement et mainlevée',
    telephones: ['03 80 42 21 55', 'Crédit à la consommation : 01 84 90 10 62'],
    emails: ['claudine.corradi@labanquepostale.fr', 'notaire.credit.cf-dijon@labanquepostale.fr', 'notaire.credit.cf-rennes@labanquepostale.fr'] },
  { id: 'rep-monabanq', theme: 'banquesPrets', organisme: 'Monabanq', service: '', emails: ['contact@monabanq.com'] },
  { id: 'rep-sg-remboursement', theme: 'banquesPrets', organisme: 'Société Générale', service: 'Remboursement de crédit — Centre de service d’Orléans',
    personnes: ['Carla ARAUJO-PETIT — Chargée de financement'], telephones: ['02 38 42 63 56'], emails: ['carla.araujo-petit@socgen.com'] },
  { id: 'rep-lcl-pret', theme: 'banquesPrets', organisme: 'LCL — Le Crédit Lyonnais', service: 'Service clients prêts immobiliers Évry',
    telephones: ['Accueil téléphonique : 09 69 32 35 27', '01 49 60 22 47', '01 40 89 00 88'], emails: ['lcl_credits_evry1@lcl.fr'] },
  { id: 'rep-credit-mutuel-blois', theme: 'banquesPrets', organisme: 'Crédit Mutuel', service: 'Blois',
    emails: ['sarah.proenca@cmccs.fr', 'Remboursement anticipé : 37160@creditmutuel.fr', 'Décompte de remboursement (Centre Ouest) : cmlacogpat@creditmutuel.fr'] },
  { id: 'rep-bpvf-pret', theme: 'banquesPrets', organisme: 'Banque Populaire', service: 'Prêts', emails: ['bpvf_real_vie_des_prets@bpvf.banquepopulaire.fr'] },
  { id: 'rep-bpgo', theme: 'banquesPrets', organisme: 'Banque Populaire Grand Ouest', service: 'Crédits',
    telephones: ['02 41 22 44 51'], emails: ['BPGO_Credits_SAV@bpgo.fr', 'Prêts professionnels : bpgo_service_prets_pro@bpgo.fr'] },
  { id: 'rep-credit-immobilier-france', theme: 'banquesPrets', organisme: 'Crédit Immobilier de France', service: '', adresse: 'BP 285, 86007 POITIERS CEDEX',
    telephones: ['09 69 39 32 51', '01 70 91 37 00', '01 42 68 44 14', '04 72 69 27 92', '04 72 69 27 73'],
    emails: ['clientele.cco@creditimmobilierdefrance.com', 'monserviceclient@creditimmobilierdefrance.com', 'aline.mbenounngoue@creditimmobilierdefrance.com'] },
  { id: 'rep-credit-foncier', theme: 'banquesPrets', organisme: 'Crédit Foncier', service: '',
    telephones: ['01 49 77 91 17', '09 69 39 29 27'],
    emails: ['cff-b-dop-dec-ra@bpce-sc.fr', 'BAL-URGENCES-DEC-RA-TTK@creditfoncier.fr', 'services.clients@creditfoncier.fr', 'fathe.ibongo.externe@bpce-sc.fr',
      'cff-b-dop-thyp@creditfoncier.fr', 'services-clients@creditfoncier.fr', 'Mainlevée : cff-b-dop-mainlevee@bpce-sc.fr'] },
  { id: 'rep-bnp-tassigny', theme: 'banquesPrets', organisme: 'BNP Paribas', service: 'APAC Tassigny — Financement des particuliers', personnes: ['Jennifer CASSANIELLI'],
    telephones: ['01 60 95 47 42', '01 41 95 46 11'], emails: ['tassigny_bddf_apac_fp_divers_gestion@bnpparibas.com'] },
  { id: 'rep-bnp-rennes', theme: 'banquesPrets', organisme: 'BNP Paribas', service: 'APAC Rennes — Financement des particuliers',
    personnes: ['Aurélie MICHAUD — Assistante référente APAC FP Rennes, divers gestion'], telephones: ['02 23 47 08 46'],
    emails: ['rennes_bddf_apac_fp_communication_externe@bnpparibas.com'] },
  { id: 'rep-bnp-paris', theme: 'banquesPrets', organisme: 'BNP Paribas', service: 'Agences crédit de la région parisienne',
    emails: ['region_parisienne_bddf_agence_credit@bnpparibas.com', 'Rédaction : region_parisienne_bddf_agence_credit_redaction@bnpparibas.com', 'Retour : region_parisienne_bddf_agence_credit_retour@bnpparibas.com'] },
  { id: 'rep-bnp-personal-finance', theme: 'banquesPrets', organisme: 'BNP Paribas Personal Finance', service: '', adresse: '29 avenue Georges Pompidou, 92300 LEVALLOIS-PERRET',
    telephones: ['02 51 86 67 68', '09 69 37 76 32', '09 69 32 70 19'],
    emails: ['serv-dsciassu@bnpparibas-pf.com', 'sci@bnpparibas-pf.com', 'service.clients@bnpparibas-pf.com', 'serviceclientsimmo@bnpparibas-pf.com'] },
  { id: 'rep-cetelem', theme: 'banquesPrets', organisme: 'Cetelem', service: '', telephones: ['09 69 32 05 03'] },
  { id: 'rep-sofinco', theme: 'banquesPrets', organisme: 'Sofinco', service: 'Agence relation clients', adresse: 'BP 50075, 77213 AVON CEDEX' },

  // ---- Banques — successions ----
  { id: 'rep-ca-val-de-france-successions', theme: 'banquesSuccessions', organisme: 'Crédit Agricole Val de France', service: 'Service successions',
    adresse: 'CS 50069, 28088 CHARTRES CEDEX', telephones: ['02 37 27 30 66'], emails: ['SUCCESSIONS@ca-valdefrance.fr'] },
  { id: 'rep-caisse-epargne-successions', theme: 'banquesSuccessions', organisme: 'Caisse d’Épargne', service: 'Service successions — T494',
    adresse: '36 allée Ferdinand de Lesseps, CS 90657, 37206 TOURS CEDEX', emails: ['successions.celc@celc.caisse-epargne.fr'], notes: 'Uniquement par email.' },
  { id: 'rep-credit-du-nord-successions', theme: 'banquesSuccessions', organisme: 'Crédit du Nord', service: 'Successions', emails: ['dob_succession_ndf@cdn.fr'], notes: 'Par email.' },
  { id: 'rep-banque-postale-limoges', theme: 'banquesSuccessions', organisme: 'La Banque Postale', service: 'Service successions — Limoges', adresse: '5 rue de la Céramique, 87900 LIMOGES CEDEX 9' },
  { id: 'rep-banque-postale-bordeaux', theme: 'banquesSuccessions', organisme: 'La Banque Postale', service: 'Service successions — Centre financier de Bordeaux', adresse: '33900 BORDEAUX CEDEX 9' },
  { id: 'rep-banque-postale-clermont', theme: 'banquesSuccessions', organisme: 'La Banque Postale', service: 'Service successions de Clermont-Ferrand',
    adresse: '1 rue Édouard Branly, 45900 LA SOURCE CEDEX 9', telephones: ['04 91 10 26 63'], emails: ['successions.cf-clermont@labanquepostale.fr'] },
  { id: 'rep-banque-postale-rouen', theme: 'banquesSuccessions', organisme: 'La Banque Postale', service: 'Service successions de Rouen',
    adresse: 'TSA 10400, 69945 LYON CEDEX 20', telephones: ['Service successions Loir-et-Cher : 02 32 81 74 81'], emails: ['gestion-successions.rouen@labanquepostale.fr'] },
  { id: 'rep-sg-orleans-successions', theme: 'banquesSuccessions', organisme: 'Société Générale', service: 'CDS Orléans — Successions',
    adresse: 'Passage de la Râpe, Immeuble Val de Loire, 45000 ORLÉANS', telephones: ['09 69 36 72 70'], emails: ['pscorleans.successions@socgen.com'] },
  { id: 'rep-sg-toulouse-successions', theme: 'banquesSuccessions', organisme: 'Société Générale', service: 'Successions — Toulouse',
    telephones: ['09 69 32 08 04'], emails: ['successions.toulouse@socgen.com'] },
  { id: 'rep-lcl-successions-montigny', theme: 'banquesSuccessions', organisme: 'LCL — Le Crédit Lyonnais', service: 'Service successions — Gestionnaire successions',
    adresse: '15 place Georges Pompidou, CS 30759, 78180 MONTIGNY-LE-BRETONNEUX', telephones: ['09 69 36 29 53'], emails: ['service_successions@lcl.fr', 'olivier.strady@lcl.fr'] },
  { id: 'rep-lcl-successions-vincennes', theme: 'banquesSuccessions', organisme: 'LCL — Le Crédit Lyonnais', service: 'Service successions — Vincennes', adresse: '28 avenue du Petit Parc, 94300 VINCENNES' },
  { id: 'rep-credit-mutuel-successions', theme: 'banquesSuccessions', organisme: 'Crédit Mutuel', service: 'Service successions',
    adresse: '105 rue du Faubourg Madeleine, 45000 ORLÉANS', telephones: ['02 38 77 60 00'] },
  { id: 'rep-cic-successions', theme: 'banquesSuccessions', organisme: 'CIC', service: 'Service succession',
    adresse: '2 avenue Jean Bonduelle, BP 84001, 44040 NANTES CEDEX 1', emails: ['ccssuco1@cmccs.fr'] },
  { id: 'rep-bnp-successions-fontenay', theme: 'banquesSuccessions', organisme: 'BNP Paribas', service: 'Service successions — Fontenay-sous-Bois', adresse: 'TSA 60227, 94729 FONTENAY-SOUS-BOIS' },
  { id: 'rep-bnp-successions-cesson', theme: 'banquesSuccessions', organisme: 'BNP Paribas', service: 'Service successions — Cesson-Sévigné',
    adresse: 'TSA 21727, 35517 CESSON-SÉVIGNÉ CEDEX', telephones: ['+33 1 34 23 92 03'], emails: ['conseiller.succession2@bnpparibas.com'] },
  { id: 'rep-bnp-real-estate', theme: 'banquesSuccessions', organisme: 'BNP Paribas Real Estate', service: '', adresse: '50 cours de l’Île Seguin, 92650 BOULOGNE-BILLANCOURT CEDEX' },
  { id: 'rep-bnp-securities', theme: 'banquesSuccessions', organisme: 'BNP Paribas Securities Services', service: '', adresse: 'Grands Moulins de Pantin, 9 rue du Débarcadère, 93500 PANTIN' },
  { id: 'rep-bnp-epargne-retraite', theme: 'banquesSuccessions', organisme: 'BNP Paribas Épargne et Retraite Entreprises', service: '', adresse: 'TSA 80007, 93736 BOBIGNY CEDEX 09' },
  { id: 'rep-gie-ocean-bnp', theme: 'banquesSuccessions', organisme: 'GIE Océan BNP Paribas', service: '', adresse: '18 quai Duguay-Trouin, 35000 RENNES' },
  { id: 'rep-bpvf-successions', theme: 'banquesSuccessions', organisme: 'Banque Populaire', service: 'Service successions',
    adresse: '9 avenue Newton, 78180 MONTIGNY-LE-BRETONNEUX', telephones: ['09 88 98 85 05', '09 88 98 85 02', '01 30 14 66 00'], emails: ['bpvf_successions@bpvf.fr'] },
  { id: 'rep-allianz-banque', theme: 'banquesSuccessions', organisme: 'Allianz Banque', service: 'Successions', telephones: ['09 69 39 98 54'], emails: ['successions@bankingservices.fr'] },
  { id: 'rep-groupama-banque', theme: 'banquesSuccessions', organisme: 'Groupama Banque', service: '', adresse: 'TSA n° 56792, 95939 ROISSY CH DE GAULLE CEDEX' },
  { id: 'rep-casden', theme: 'banquesSuccessions', organisme: 'CASDEN Banque Populaire', service: 'Pôle successions',
    adresse: 'CS 20819 Champs-sur-Marne, 77447 MARNE-LA-VALLÉE CEDEX 2', telephones: ['01 64 80 66 48'], emails: ['polesuccessions@casden.banquepopulaire.fr'] },

  // ---- Assurances et assurance-vie ----
  { id: 'rep-ca-val-de-france-assurances', theme: 'assurances', organisme: 'Crédit Agricole Val de France', service: 'Service assurances', emails: ['agence.chartres@ca-valdefrance.fr'] },
  { id: 'rep-gan-vie', theme: 'assurances', organisme: 'GAN Vie', service: 'Vie individuelle', adresse: 'TSA 51212, 35090 RENNES CEDEX 9', emails: ['er.courrier@ggvie.fr'] },
  { id: 'rep-bnp-cardif', theme: 'assurances', organisme: 'BNP Paribas Cardif', service: 'Service succession (assurance-vie)', adresse: '8 rue du Port, 92728 NANTERRE CEDEX',
    telephones: ['01 55 94 45 55'], emails: ['cardifsuccession@bnpparibas.com', 'group_assurance_succession_bordeaux@bnpparibas.com'] },
  { id: 'rep-macif-mutavie', theme: 'assurances', organisme: 'MACIF — Mutavie', service: 'Service succession', adresse: '9 rue des Iris, CS 50000, Bessines, 79088 NIORT CEDEX 09',
    notes: 'Courrier type : Interrogation assurance-vie (C.S.N.).' },
  { id: 'rep-natixis-assurances', theme: 'assurances', organisme: 'Natixis Assurances', service: 'Assurances Banque Populaire Vie', adresse: '4 rue des Pirogues de Bercy, CS 61241, 75580 PARIS CEDEX 12' },
  { id: 'rep-allianz-vie', theme: 'assurances', organisme: 'Allianz Vie', service: 'Prestations sinistres décès — Centre de solutions clients Vie et Santé',
    adresse: 'Case courrier 819423, TSA 81003, 67018 STRASBOURG CEDEX', telephones: ['09 78 97 80 08', 'Fax : 01 30 68 74 63'], emails: ['allianzvie@allianz.fr'], liens: ['http://www.allianz.fr'] },
  { id: 'rep-axa', theme: 'assurances', organisme: 'AXA France', service: 'Épargne, retraite, prévoyance (assurance-vie)', adresse: 'TSA 60907, 92897 NANTERRE CEDEX 9' },
  { id: 'rep-generali-vie', theme: 'assurances', organisme: 'Generali Vie', service: 'Service de gestion Magritte', adresse: 'TSA 70100, 75309 PARIS CEDEX 09',
    telephones: ['01 58 38 15 35'], emails: ['successions.magritte@generali.fr'] },
  { id: 'rep-maif-vie', theme: 'assurances', organisme: 'MAIF Vie', service: '', telephones: ['05 49 04 49 04'], emails: ['maifvie@maif.fr'] },
  { id: 'rep-harmonie-mutuelle', theme: 'assurances', organisme: 'Harmonie Mutuelle', service: 'Gestion des décès', emails: ['gestion.deces@harmonie-mutuelle.fr'], notes: 'N° notaire : 41NO00095.' },
  { id: 'rep-groupama-decennales', theme: 'assurances', organisme: 'Groupama', service: 'Attestations décennales', emails: ['sandy.rozycki@groupama-pvl.com'] },

  // ---- Retraite, santé et aide sociale ----
  { id: 'rep-cd41-aide-sociale', theme: 'social', organisme: 'Conseil départemental de Loir-et-Cher', service: 'Aide sociale — successions',
    adresse: '34 avenue du Maréchal Maunoury, Place de la République, 41020 BLOIS CEDEX', emails: ['successions.aidesociale@departement41.fr'] },
  { id: 'rep-loiret-aides-sociales', theme: 'social', organisme: 'Département du Loiret', service: 'Aides sociales (personnes âgées)', emails: ['mda.personnesagees@loiret.fr'] },
  { id: 'rep-msa-berry-touraine', theme: 'social', organisme: 'MSA Berry-Touraine', service: '', adresse: '19 avenue de Vendôme, CS 72301, 41023 BLOIS CEDEX',
    telephones: ['Aide sociale : 02 54 29 45 34'], emails: ['envoidedocuments@berry-touraine.msa.fr'],
    notes: 'Ancienne adresse de relance (penin.nicolas@berry-touraine.msa.fr) : contact parti à la retraite.' },
  { id: 'rep-carsat-centre', theme: 'social', organisme: 'CARSAT Centre', service: '', adresse: '30 boulevard Jean Jaurès, 45033 ORLÉANS CEDEX',
    telephones: ['Action sociale : 3960'], emails: ['tiers@carsat-centre.fr', 'Première demande : notaires.premieredemande@carsat-centre.fr'] },
  { id: 'rep-cpam-blois', theme: 'social', organisme: 'CPAM de Loir-et-Cher', service: 'Assurance maladie', adresse: '6 rue Louis Armand, 41022 BLOIS CEDEX', emails: ['tresorerie.cpam-blois@assurance-maladie.fr'] },
  { id: 'rep-camieg', theme: 'social', organisme: 'CAMIEG', service: '', telephones: ['08 06 06 93 00'], emails: ['cad@camieg.org'] },
  { id: 'rep-cicas', theme: 'social', organisme: 'CICAS', service: 'Service commun aux caisses de retraite complémentaire', adresse: '1 rue Jeanne d’Arc, BP 17, 41000 BLOIS CEDEX' },
  { id: 'rep-ircantec', theme: 'social', organisme: 'IRCANTEC', service: '', adresse: '24 rue Louis Gain, 49939 ANGERS CEDEX 9' },
  { id: 'rep-humanis', theme: 'social', organisme: 'Humanis', service: 'Service retraite Arrco', adresse: '45954 ORLÉANS CEDEX' },
  { id: 'rep-pro-btp', theme: 'social', organisme: 'PRO BTP', service: 'Caisse de retraite', adresse: 'BP 10, 33278 FLOIRAC' },
  { id: 'rep-cipav', theme: 'social', organisme: 'CIPAV', service: 'Caisse interprofessionnelle de prévoyance et d’assurance vieillesse', adresse: '9 rue de Vienne, 75403 PARIS CEDEX 8' },
  { id: 'rep-ddfip-37-retraites', theme: 'social', organisme: 'DDFIP d’Indre-et-Loire', service: 'Centre de gestion des retraites', adresse: 'CS 33228, 37032 TOURS CEDEX 1' },

  // ---- Tribunaux et état civil ----
  { id: 'rep-tj-blois-repertoire-civil', theme: 'justice', organisme: 'Tribunal judiciaire de Blois', service: 'Répertoire civil, dépôt de testament, renonciation à succession',
    personnes: ['Sylvie ROSSIGNOL — Adjoint administratif principal'], adresse: '15 rue du Père Brottier, 41018 BLOIS CEDEX',
    telephones: ['Accueil SAUJ : 02 54 44 60 99'], emails: ['repcivil.tj-blois@justice.fr'],
    notes: 'Ancienne adresse (tribunal de grande instance) : Place de la République, 41018 BLOIS CEDEX — repcivil.tgi-blois@justice.fr.' },
  { id: 'rep-tj-blois-tutelles-mineurs', theme: 'justice', organisme: 'Tribunal judiciaire de Blois', service: 'Service des tutelles des mineurs',
    personnes: ['Catherine AMELOT — Adjoint administratif, faisant fonction de greffier'], adresse: 'Place de la République, CS 20815, 41018 BLOIS CEDEX',
    telephones: ['02 54 44 60 99'], emails: ['tutmin.tgi-blois@justice.fr'] },
  { id: 'rep-tj-evry', theme: 'justice', organisme: 'Tribunal judiciaire d’Évry', service: 'Service du répertoire civil', telephones: ['01 78 05 60 09'], emails: ['bo.civil.tj-evry@justice.fr'] },
  { id: 'rep-etat-civil-etranger', theme: 'justice', organisme: 'Service de l’état civil des Français nés à l’étranger', service: 'Nantes', telephones: ['01 41 86 42 47'] },

  // ---- Impôts et enregistrement ----
  { id: 'rep-siepf-blois', theme: 'impots', organisme: 'S.I.E.P.F. de Blois', service: 'Pôle enregistrement — envoi des déclarations de succession',
    adresse: '10 rue Louis Bodin, 41000 BLOIS', telephones: ['Enregistrement Blois : 02 54 55 71 05'] },
  { id: 'rep-cfp-lamotte', theme: 'impots', organisme: 'Centre des finances publiques de Lamotte-Beuvron', service: '', telephones: ['02 54 88 10 02'], emails: ['t041009@dgfip.finances.gouv.fr'] },

  // ---- Mairies et urbanisme ----
  { id: 'rep-romorantin-services-techniques', theme: 'mairies', organisme: 'Ville de Romorantin-Lanthenay', service: 'Services techniques', personnes: ['Christiane MEUNIER'],
    telephones: ['02 54 94 41 74', 'Fax : 02 54 76 90 16'], emails: ['assurance@romorantin.fr'] },
  { id: 'rep-romorantin-urbanisme', theme: 'mairies', organisme: 'Ville de Romorantin-Lanthenay', service: 'Urbanisme', emails: ['urbanisme@romroantin.fr'],
    notes: 'Adresse recopiée telle quelle du répertoire (« romroantin ») : orthographe à vérifier.' },
  { id: 'rep-blois-eaux', theme: 'mairies', organisme: 'Ville de Blois — Agglopolys', service: 'Service des eaux — assainissement', emails: ['assainissement@agglopolys.fr'], notes: 'Si urgent.' },
  { id: 'rep-blois-etat-civil', theme: 'mairies', organisme: 'Ville de Blois', service: 'État civil', telephones: ['02 54 44 50 47', 'Fax : 02 54 44 52 03'] },
  { id: 'rep-blois-logement', theme: 'mairies', organisme: 'Ville de Blois', service: 'Service logement', telephones: ['02 54 51 31 06'], notes: 'Mardi et jeudi : 9 h-12 h et 14 h-17 h.' },
  { id: 'rep-blois-dia', theme: 'mairies', organisme: 'Mairie de Blois', service: 'DIA — DPADD, droits des sols', adresse: '34 rue de la Villette, 41000 BLOIS' },
  { id: 'rep-mitry-mory-etat-civil', theme: 'mairies', organisme: 'Mairie de Mitry-Mory', service: 'Actes de naissance',
    notes: 'Adresse email notée dans le répertoire : « affairesgeneralesitry-mory.net » — incomplète, à vérifier.' },
  { id: 'rep-tours-numerotage', theme: 'mairies', organisme: 'Ville de Tours', service: 'Alignement et numérotage', liens: ['https://services.tours.fr/'], notes: 'Puis cliquer sur la vignette « Numérotage ».' },
  { id: 'rep-tours-urbanisme', theme: 'mairies', organisme: 'Tours Métropole', service: 'Urbanisme — guichet numérique (GNAU)', liens: ['https://gnau.tours-metropole.fr/gnau/#/'] },
  { id: 'rep-tours-dpu', theme: 'mairies', organisme: 'Tours Métropole', service: 'Zones soumises au droit de préemption urbain (carte)',
    liens: ['https://tours-metropole.maps.arcgis.com/apps/webappviewer/index.html?id=142c880381044aaaa671b080c685ff30'] },
  { id: 'rep-tours-peril', theme: 'mairies', organisme: 'Tours Métropole Val de Loire', service: 'Péril, insalubrité — procédures de mise en sécurité des immeubles',
    notes: 'Lien non repris dans le répertoire Word.' },

  // ---- Département et services de l'État ----
  { id: 'rep-cd41-routes', theme: 'departement', organisme: 'Conseil départemental de Loir-et-Cher', service: 'Direction des routes — alignement',
    adresse: 'Hôtel du Département, Place de la République, 41020 BLOIS CEDEX',
    personnes: ['M. RENARD', 'Jean-Pierre BOUQUET'],
    telephones: ['02 54 58 41 41', 'Fax : 02 54 58 42 21', 'Division routes centre : 02 54 56 34 80', 'M. RENARD : 02 54 95 53 04 — 06 78 34 00 90', 'Jean-Pierre BOUQUET : 02 54 56 34 87 — 06 80 47 36 80'],
    emails: ['Division routes sud : sec.div.routes.sud@cg41.fr', 'Division routes centre : sec.div.routes.centre@departement41.fr', 'Jean-pierre.bouquet@departement41.fr'] },
  { id: 'rep-cd41-routes-nord', theme: 'departement', organisme: 'Conseil départemental de Loir-et-Cher', service: 'Division routes nord',
    personnes: ['Sylvie MARSAC — Accueil secrétariat'], adresse: '2 rue du Cheval Blanc, BP 92, 41106 VENDÔME CEDEX',
    telephones: ['02 54 67 19 40'], emails: ['sylvie.marsac@departement41.fr'] },
  { id: 'rep-domaine-fluvial', theme: 'departement', organisme: 'Domaine fluvial', service: '', personnes: ['Thierry LACKOVIC'],
    telephones: ['02 54 55 75 42'], emails: ['Thierry.lackovic@loir-et-cher.gouv.fr'],
    notes: 'Police de l’eau (étangs) : coordonnées sous forme d’image dans le répertoire Word, non reprises.' },

  // ---- Agences immobilières ----
  { id: 'rep-bourse-immobilier-dubois', theme: 'immobilier', organisme: 'Bourse Immobilier', service: '', personnes: ['M. DUBOIS'],
    telephones: ['06 88 57 52 22', '06 42 42 00 67'], emails: ['j.dubois@bourse-immobilier.fr'] },
  { id: 'rep-orpi-girard', theme: 'immobilier', organisme: 'Orpi', service: '', personnes: ['Christophe GIRARD'], telephones: ['06 83 30 84 41'] },
  { id: 'rep-orpi-delory', theme: 'immobilier', organisme: 'Orpi', service: '', personnes: ['Alain DELORY'], telephones: ['06 07 11 14 39'] },
  { id: 'rep-41-immobilier-robert', theme: 'immobilier', organisme: '41 Immobilier', service: '', personnes: ['Monsieur ROBERT'], telephones: ['06 21 27 12 24'] },
  { id: 'rep-century21-theodon', theme: 'immobilier', organisme: 'Century 21', service: '', personnes: ['Monsieur THEODON'], telephones: ['06 80 18 67 76'] },
  { id: 'rep-century21-adnot', theme: 'immobilier', organisme: 'Century 21', service: '', personnes: ['Virginie ADNOT'], telephones: ['06 62 88 76 37'] },
  { id: 'rep-lacour-adrien', theme: 'immobilier', organisme: 'Adrien LACOUR', service: '', telephones: ['06 31 22 51 84'],
    notes: 'Noté parmi les agents immobiliers, sans agence : à préciser.' },

  // ---- Chambres consulaires et divers ----
  { id: 'rep-fichorga', theme: 'divers', organisme: 'Fichorga', service: '', telephones: ['03 20 62 08 08', 'Micen : 03 20 62 08 06'] },
  { id: 'rep-chambre-metiers', theme: 'divers', organisme: 'Chambre de métiers et de l’artisanat de Loir-et-Cher', service: 'Formalités / CFE',
    adresse: '16 rue de la Vallée Maillard, 41018 BLOIS CEDEX', personnes: ['Annaka GENERAS — Conseillère en formalités / CFE'],
    telephones: ['Ligne conseil : 02 54 44 65 83', 'Annaka GENERAS : 02 54 44 65 78', 'Fax : 02 54 44 64 78'], emails: ['ageneras@cma-41.fr'] },
  { id: 'rep-cci-formalites', theme: 'divers', organisme: 'CCI de Loir-et-Cher', service: 'Formalités / CFE', personnes: ['Marie-Claude JOPEK — Conseillère en formalités / CFE'],
    telephones: ['02 54 44 64 72'], emails: ['mcjopek@loir-et-cher.cci.fr'] },
  { id: 'rep-chambre-agriculture', theme: 'divers', organisme: 'Chambre d’agriculture', service: 'Service juridique', telephones: ['02 54 78 51 20'] },
  { id: 'rep-bouygues-telecom', theme: 'divers', organisme: 'Bouygues Telecom', service: 'Résiliation, service clients',
    emails: ['Résiliation : resiliation@bouyguestelecom.fr', 'service.clients@bouyguestelecom.fr'] }
];

const MAX_CONTACTS = 800;
const MAX_ELEMENTS = 12;

function texte(v, max) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}
function liste(v, max) {
  return Array.isArray(v) ? Array.from(new Set(v.map((x) => texte(x, max)).filter(Boolean))).slice(0, MAX_ELEMENTS) : [];
}

// Liste blanche stricte, comme le carnet des confrères. Un contact sans organisme ni personne
// n'a rien à faire dans le répertoire ; un thème inconnu est rangé en « divers ».
function assainirContact(brut) {
  const b = brut && typeof brut === 'object' ? brut : null;
  if (!b || typeof b.id !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(b.id)) return null;
  const organisme = texte(b.organisme, 140);
  const personnes = liste(b.personnes, 140);
  if (!organisme && !personnes.length) return null;
  return {
    id: b.id,
    theme: CLES_THEMES.has(b.theme) ? b.theme : 'divers',
    organisme,
    service: texte(b.service, 160),
    personnes,
    adresse: texte(b.adresse, 240),
    telephones: liste(b.telephones, 120),
    emails: liste(b.emails, 160),
    liens: liste(b.liens, 300).filter((l) => /^https?:\/\//i.test(l)),
    notes: texte(b.notes, 400),
    source: texte(b.source, 80),
    modifieLe: typeof b.modifieLe === 'string' ? b.modifieLe.slice(0, 40) : ''
  };
}

function assainirRepertoire(brut) {
  if (!Array.isArray(brut)) return [];
  const parId = new Map();
  for (const c of brut) {
    const propre = assainirContact(c);
    if (propre) parId.set(propre.id, propre);
  }
  return Array.from(parId.values()).slice(0, MAX_CONTACTS);
}

function repertoireInitial() {
  return assainirRepertoire(REPERTOIRE_INITIAL.map((c) => Object.assign({ source: SOURCE_REPERTOIRE_WORD }, c)));
}

module.exports = { THEMES_REPERTOIRE, REPERTOIRE_INITIAL, SOURCE_REPERTOIRE_WORD, assainirContact, assainirRepertoire, repertoireInitial, MAX_CONTACTS };
