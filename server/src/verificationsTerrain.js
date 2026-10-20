'use strict';

// Vérifications sur le terrain (étude, 03/10 : « lors de l'envoi d'une mise à jour, te mettre une
// check-list de choses à vérifier dans CLAIRE qui se coche si c'est fait et te remonte ça lors des
// rapports »). Ce que l'environnement de développement ne peut pas éprouver (Exchange réel, Windows,
// 3CX, Ollama, NAS…) : chaque point se coche SEUL la première fois que CLAIRE observe le geste réussir
// au bureau (mode « auto », noté par le serveur ou par une fenêtre CLAIRE), ou se confirme d'un clic
// dans Réglages › Mise à jour et sauvegarde quand seul un œil peut le dire (mode « manuel » : un logo
// visible, une icône nette). Le rapport technique (12 h, 17 h) en reprend l'état.
//
// À chaque mise à jour qui apporte un geste non vérifiable ici : ajouter son point ci-dessous (`depuis`
// = VERSION_APP de la mise à jour) et l'appel `noterVerification` là où le geste réussit.
//
// Rien de personnel n'est gardé : un état, des dates, un nombre, et un `detail` réduit à un court
// texte technique (jamais un nom, une adresse, un numéro) — de toute façon repassé par
// anonymiserTexte dans le rapport.

const CLE_VERIFICATIONS = 'verifications-terrain';

// `source` : 'serveur' (noté par le serveur), 'poste' (noté par une fenêtre CLAIRE, POST
// /api/verifications-terrain/noter — seuls ces points-là y sont acceptés) ou 'manuel'.
const VERIFICATIONS_TERRAIN = [
  { id: 'scan-memoire', depuis: '0.301.0', source: 'poste', titre: 'Claire Scan : un rangement corrigé à la main est reconnu au scan suivant ; « Remettre dans Scan » défait un rangement',
    comment: 'Coché au premier rangement à la main qui corrige le type ou le dossier proposé. À regarder avec un vrai scan du copieur : un second scan du même genre reçoit le type appris (étiquette « Type appris ») ; la recherche de l’historique retrouve un mot du scan rangé ; « Remettre dans Scan » ramène le fichier dans le dossier Scan, retire la copie du dossier client et décoche la pièce. Un scan identique à un scan rangé porte « Déjà rangé » et n’est pas rangé seul.' },
  { id: 'agent-acte-integral', depuis: '0.300.0', source: 'poste', titre: 'Demander à CLAIRE : un acte déposé est lu en entier et analysé comme dans une conversation Claude',
    comment: 'Coché quand un PDF joint est lu en entier et son texte joint à la question. Sur un vrai acte (promesse, projet d’acte) : le compte rendu est structuré (synthèse, parties, bien, prix, conditions suspensives, points d’attention), les citations [pj1 p. N] ouvrent la bonne page, et un acte scanné est lu par OCR sans manquer de pages. Essayer aussi l’anonymisation désactivée dans la colonne de droite (noms en clair dans la réponse, sans codes).' },
  { id: 'explorateur-nas', depuis: '0.299.0', source: 'poste', titre: 'Explorateur du NAS : une pièce renommée ou déplacée vers un autre sous-dossier du dossier client',
    comment: 'Coché au premier renommage ou déplacement réussi depuis « Dossier NAS » d’une fiche. À regarder dans l’Explorateur Windows : le fichier porte le nouveau nom ou est dans le bon sous-dossier, sans doublon ; « Annuler » le remet. Les pièces de la fiche se mettent à jour au prochain parcours du NAS.' },
  { id: 'gnau-assistants-agglopolys', depuis: '0.275.0', source: 'manuel', titre: 'Extension Chrome : « Formuler » trouvé, adresse et parcelles saisies par les assistants du guichet d’Agglopolys (CU et DIA)',
    comment: 'Sur un vrai CUa puis une vraie DIA : CLAIRE ouvre la démarche depuis « Formuler » même pendant « Traitements en cours », remplit l’« Assistant de saisie d’adresse » (bonne proposition, « Je valide mon adresse ») et l’« Assistant de saisie des références cadastrales » (chaque parcelle avec sa superficie, « Valider »). Vérifier les lignes du CERFA et l’annexe au-delà de 3 parcelles.' },
  { id: 'gnau-dia-champs-verifier', depuis: '0.276.0', source: 'manuel', titre: 'Extension Chrome : DIA complétée (cases, coordonnées, office) et « Vérifier ma saisie » cliqué à la fin',
    comment: 'Sur une vraie DIA : cases DIA, DPU, pleine propriété, habitation, comptant et plan cadastral joint cochées ; emails du propriétaire, de l’acquéreur et de l’office coupés autour de « @ » dans les bonnes cases ; adresse et téléphone de l’office. Sur un CU : demandeur « personne physique » laissé vide. Adresse et parcelles jamais tapées directement. « Vérifier ma saisie » cliqué, jamais « Transmettre ».' },
  { id: 'gnau-dia-commission', depuis: '0.279.0', source: 'manuel', titre: 'Extension Chrome : commission d’agence de la DIA saisie par l’assistant du guichet',
    comment: 'Sur une vraie DIA avec agence : l’« Assistant de saisie du montant de la commission » s’ouvre, le montant TTC est posé du côté qui paie, TTC coché, « Valider le montant de la commission » cliqué ; case « 1) A recherché un acquéreur disposé… » cochée ; profession vide ; une adresse unique proposée est choisie.' },
  { id: 'gnau-lien-ouvre-extension', depuis: '0.279.0', source: 'manuel', titre: 'Lien du guichet dans CLAIRE : extension proposée avec le dossier choisi',
    comment: 'Clic sur « GNAU — déposer la DIA, le CU » dans Constitution de dossier : sur la page du guichet, bouton « Ouvrir CLAIRE — CU a) et DIA » en bas à droite ; un clic ouvre le panneau de l’extension avec le dossier déjà choisi.' },
  { id: 'gnau-vrais-clics', depuis: '0.278.0', source: 'manuel', titre: 'Extension Chrome : vrais clics et vraies frappes sur le guichet (mode débogage de Chrome)',
    comment: 'Sur un vrai CU : bandeau de Chrome « a commencé à déboguer » pendant le remplissage puis retiré ; la liste des communes se déroule et Blois est choisie ; l’adresse tapée fait apparaître les propositions du guichet ; un seul clic par bouton ; « Transmettre » jamais cliqué. Zoom de Chrome différent de 100 % : CLAIRE revient au clic simulé (à vérifier).' },
  { id: 'gnau-plan-cadastral', depuis: '0.263.0', source: 'serveur', titre: 'Extension Chrome : plan cadastral du dossier du NAS joint à la demande sur le guichet',
    comment: 'Coché la première fois que l’extension reçoit le plan cadastral d’un dossier. Vérifier sur le brouillon que la pièce « plan » est bien jointe (nom « Plan cadastral.pdf ») et lisible.' },
  { id: 'gnau-fiche-extension', depuis: '0.260.0', source: 'serveur', titre: 'Extension Chrome : fiche d’un dossier lue pour un CU ou une DIA sur le guichet unique',
    comment: 'Coché la première fois que l’extension « CLAIRE — Assistant de saisie » charge la fiche d’un dossier. Vérifier sur le guichet (brouillon) que chaque champ rempli porte la bonne donnée, et envoyer la structure de la page (« Copier la structure de la page ») pour les champs « introuvables ».' },
  { id: 'trajets-confrere-poses', depuis: '0.294.0', source: 'serveur', titre: 'Agenda : rendez-vous chez un confrère — « Trajet » d’une demi-heure posé avant et après',
    comment: 'Coché quand les deux trajets sont créés dans l’agenda partagé autour d’un rendez-vous de la couleur du confrère. Vérifier dans Outlook l’heure, la couleur et l’absence de rappel des deux trajets, puis qu’un déplacement ou une suppression depuis CLAIRE les emmène.' },
  { id: 'trajet-km-ign', depuis: '0.294.0', source: 'serveur', titre: 'Agenda : kilomètres du trajet lus sur l’itinéraire de l’IGN',
    comment: 'Coché quand la distance par la route entre l’office et celui du confrère est lue (géocodage et itinéraire de la Géoplateforme). Comparer une fois avec un site d’itinéraire : le nombre de km doit être proche.' },
  { id: 'factures-succession-nas', depuis: '0.293.0', source: 'poste', titre: 'Successions : facture déposée à la main dans « Factures à régler » relevée',
    comment: 'Coché quand une facture PDF déposée à la main dans le sous-dossier « Factures à régler » d’une succession est relevée à l’ouverture de la fiche. Vérifier l’organisme et le montant dans l’onglet « Factures », et le message Teams à Sophie.' },
  { id: 'authentic-rattachement-confirme', depuis: '0.292.0', source: 'poste', titre: 'Authentic : premier rattachement d’un dossier confirmé d’un clic',
    comment: 'Coché quand l’étude répond « Oui » (ou choisit un dossier) à « est-ce bien ce dossier ? » pour une page d’Authentic retrouvée par les noms seulement. Vérifier ensuite que les fiches client et bien ouvertes dans l’onglet de ce dossier arrivent sans nouvelle question, et que le panneau « Authentic » de la fiche dit « Rattaché par sa référence ».' },
  { id: 'authentic-fiche-bien-hors-onglet', depuis: '0.291.3', source: 'poste', titre: 'Authentic : fiche bien ouverte hors de l’onglet d’un dossier, non rangée',
    comment: 'Noté quand une fiche bien arrive alors que l’onglet actif d’Authentic n’est pas celui d’un dossier (recherche d’immeubles…) : elle n’est rangée dans aucun dossier. Depuis 0.292.1 (Authentic ouvre chaque fiche dans un onglet à elle), une fiche bien d’un onglet à elle va au dernier dossier sûr vu quand le bien est le sien : ce point ne se note plus que pour un bien d’aucun dossier sûr (recherche d’immeubles…).' },
  { id: 'redaction-acte-authentic', depuis: '0.188.0', source: 'poste', titre: 'Rédaction de l’acte : état « Non rédigé » / « En cours » lu dans Authentic',
    comment: 'Coché à la première page d’un sous-dossier de vente dont le tableau « Rédaction » dit « Non rédigé » ou « En cours ». Vérifier sur la fiche la ligne « Rédaction de l’acte » et, pièces réunies, la tâche « Rédiger l’acte » dans « À faire » ; elle doit partir quand Authentic passe à « En cours ».' },
  { id: 'option-restante-placee', depuis: '0.187.0', source: 'serveur', titre: 'Options de rendez-vous : la dernière restée dans l’agenda devient le rendez-vous',
    comment: 'Coché la première fois que le serveur transforme seul la dernière option (les autres effacées à la main dans Outlook) ; en échec si Exchange refuse la modification. Vérifier dans Outlook : titre sans « ? », occupé, couleur du rendez-vous, puis la date sur la fiche après la relecture suivante de l’agenda.' },
  { id: 'options-rendez-vous', depuis: '0.183.0', source: 'poste', titre: 'Demander à CLAIRE : options de rendez-vous posées dans l’agenda, sans email',
    comment: 'Coché aux premières options posées depuis « Demander à CLAIRE » (« Pose des options pour X mardi à 14 h et jeudi à 10 h ») ; en échec si Exchange refuse. Vérifier dans Outlook les rendez-vous provisoires « VTE - X ? — option CLAIRE », puis « Placer » sur l’un : les autres doivent partir.' },
  { id: 'agenda-copier-coller', depuis: '0.182.0', source: 'poste', titre: 'Agenda : rendez-vous copié (Ctrl+C) puis collé (Ctrl+V) dans l’agenda de l’office',
    comment: 'Coché au premier rendez-vous collé depuis la page Agenda ; en échec si Exchange refuse la création. Vérifier dans Outlook que la copie porte le titre, la durée, la couleur et les notes du rendez-vous copié.' },
  { id: 'authentic-changement-propose', depuis: '0.176.0', source: 'poste', titre: 'Authentic : une donnée déjà reprise a changé dans Authentic, la mise à jour est proposée (fiche inchangée)',
    comment: 'Coché la première fois qu’une page d’Authentic relevée porte une valeur différente de celle qu’Authentic avait déjà donnée (par exemple un email corrigé) : le message « Mettre à jour la fiche ? » s’affiche et la fiche ne bouge qu’au clic. À éprouver en corrigeant un email dans la fiche client d’Authentic.' },
  { id: 'lecture-xml-exchange', depuis: '0.144.1', source: 'serveur', titre: 'Réponses d’Exchange lues par le nouveau lecteur XML (agenda de l’office)',
    comment: 'Coché au premier tour de lecture de l’agenda qui rend des rendez-vous après le passage à fast-xml-parser ; si l’agenda reste vide alors qu’Outlook en montre, c’est la lecture à examiner.' },
  { id: 'tache-agenda-supprimee-cochee', depuis: '0.144.11', source: 'serveur', titre: 'Rendez-vous rouge « JV - … » supprimé dans Outlook : tâche cochée dans CLAIRE',
    comment: 'Coché au premier tour de lecture de l’agenda qui coche une tâche dont le rendez-vous a été supprimé ; vérifier dans « Mes rappels » du collaborateur qu’elle est bien cochée, pas retirée.' },
  { id: 'tache-agenda-retiree', depuis: '0.144.0', source: 'poste', titre: 'Tâche de l’agenda cochée : rendez-vous rouge « JV - … » retiré de l’agenda de l’office',
    comment: 'Coché quand le premier rendez-vous-tâche est retiré de l’agenda après avoir été coché dans CLAIRE ; en échec si Exchange refuse la suppression.' },
  { id: 'email-envoye-exchange', depuis: '0.140.0', source: 'serveur', titre: 'Email envoyé depuis CLAIRE par Exchange (brouillon puis envoi)',
    comment: 'Coché au premier email envoyé depuis la fenêtre d’email de CLAIRE ; en échec si Exchange refuse (code relevé, jamais le texte).' },
  { id: 'email-reponse-exchange', depuis: '0.140.0', source: 'serveur', titre: 'Réponse à un email reçu envoyée depuis CLAIRE (fil de la conversation gardé)',
    comment: 'Coché à la première réponse envoyée depuis la lecture d’un email du dossier.' },
  { id: 'email-envoye-en-tant-que', depuis: '0.140.0', source: 'serveur', titre: 'Email parti de la boîte du collaborateur (« Envoyer en tant que »)',
    comment: 'Coché quand Exchange accepte d’envoyer depuis la boîte du collaborateur ; en échec tant que le droit « Envoyer en tant que » n’est pas donné au compte relié (l’email part alors du compte relié).' },
  { id: 'compte-collaborateur-connexion', depuis: '0.149.0', source: 'serveur', titre: 'Compte Exchange d’un collaborateur : connexion testée (Réglages › Collaborateurs)',
    comment: 'Coché quand « Tester » réussit avec l’identifiant et le mot de passe d’un collaborateur ; en échec si Exchange refuse les identifiants (le compte est alors retenu, plus aucun essai avant correction).' },
  { id: 'emails-envoyes-compte-collaborateur', depuis: '0.149.0', source: 'serveur', titre: 'Emails des dossiers : « Éléments envoyés » d’un collaborateur lus avec son propre compte',
    comment: 'Coché quand la boîte d’envoi d’un collaborateur est lue avec son identifiant et son mot de passe (sans accès délégué) ; en échec si Exchange refuse ses identifiants.' },
  { id: 'email-envoye-compte-collaborateur', depuis: '0.149.0', source: 'serveur', titre: 'Email envoyé depuis la boîte du collaborateur avec son propre compte',
    comment: 'Coché au premier email parti avec l’identifiant du collaborateur (sans droit « Envoyer en tant que ») ; en échec si Exchange refuse ses identifiants (l’email part alors du compte relié).' },
  { id: 'email-proposition-ia', depuis: '0.140.0', source: 'serveur', titre: 'Premier jet de réponse proposé par l’IA locale',
    comment: 'Coché à la première proposition de réponse rendue par Ollama ; en échec si l’IA locale est indisponible.' },
  { id: 'plan-cadastre-surligne', depuis: '0.229.0', source: 'serveur', titre: 'Plan de situation : le navigateur du serveur a tiré l’extrait du plan de cadastre.gouv.fr et l’a surligné en jaune fluo',
    comment: 'Coché à la première consultation réussie (Contrôle de l’urbanisme › « Plan de situation »). Échec « Ni Chrome ni Edge trouvé » : installer Chrome (ou Edge) sur le serveur à son emplacement habituel, ou poser CLAIRE_NAVIGATEUR sur le serveur ; « le site du cadastre a changé » : le parcours est à reprendre. Regarder le PDF : plan en niveaux de gris (sinon le PDF du site porte une image : le dire), jaune dans les limites des parcelles, sans cercle, toutes les parcelles entières.' },
  { id: 'succession-cloture-comptes-email', depuis: '0.255.0', source: 'serveur', titre: 'Succession : la clôture (ou le transfert) des comptes est cochée quand le courrier d’Authentic est retrouvé envoyé à la banque dans les emails envoyés',
    comment: 'Coché à la première étape cochée par CLAIRE. Vérifier dans l’historique de la fiche : le courrier d’Authentic cité est bien celui de clôture ou de transfert, et l’email nommé est bien l’envoi à la banque (objet qui nomme la succession, envoyé le jour du courrier ou dans les 30 jours). Rien ne se coche : l’intitulé du courrier dans Authentic ne dit ni clôture ni transfert, ou l’objet de l’email ne nomme pas le défunt.' },
  { id: 'agenda-succession-relu', depuis: '0.254.0', source: 'serveur', titre: 'Agenda : un rendez-vous « SUCC - … » posé dans Outlook est relevé sur la fiche de la succession (ajouté, déplacé, retiré)',
    comment: 'Coché au premier rendez-vous de succession relevé dans l’agenda. Vérifier que le bon dossier est reconnu et que l’étape (notoriété, déclaration…) est la bonne.' },
  { id: 'echeance-agenda-retiree-serveur', depuis: '0.234.0', source: 'serveur', titre: 'Agenda : la date butoir du prêt est retirée par le serveur dès que l’offre de prêt est reçue',
    comment: 'Coché au premier retrait fait par le serveur, sans geste d’un poste (offre reçue, vente préalable réalisée, date effacée, dossier archivé). Échec « retrait de la date butoir refusé » : droit de suppression sur le calendrier partagé de Sophie (le repli SoftDelete s’applique seul). Vérifier : un dossier dont l’offre vient d’arriver n’a plus son événement « Obtention du prêt » dans Outlook (récupérable dans les éléments supprimés).' },
  { id: 'memoire-parcours', depuis: '0.233.0', source: 'serveur', titre: 'Mémoire de CLAIRE : les quatre dossiers du NAS sont parcourus et les Word lus',
    comment: 'Coché au premier parcours réussi (Réglages › Mémoire de CLAIRE). Échec « parcours en erreur » : le serveur ne lit pas les dossiers DECENNALES ENTREPRISES, FAUSSES MINUTES, MODELES - OUTILS, RAPPEL DE PROCEDURES (droits du compte du service sur le partage, nom du dossier différent — `memoireDossiers` de config.json en secours). Vérifier : chaque dossier est « trouvé » et ses fichiers comptés.' },
  { id: 'memoire-lecture-pdf', depuis: '0.233.0', source: 'poste', titre: 'Mémoire de CLAIRE : les PDF (texte et scans) sont lus par le poste',
    comment: 'Coché à la première lecture d’un PDF (Réglages › Mémoire de CLAIRE › « Lire les PDF »). Échec : bibliothèque de lecture PDF injoignable, PDF protégé, OCR indisponible pour un scan. Vérifier : un scan est « lu par OCR » et une recherche (« Demander à CLAIRE ») en retrouve un passage.' },
  { id: 'depot-dia-mairie', depuis: '0.232.0', source: 'serveur', titre: 'Où déposer la DIA : la fiche de la mairie arrive de l’annuaire du service public',
    comment: 'Coché à la première fiche de mairie lue (Contrôle de l’urbanisme › « Où déposer la DIA »). Échec « annuaire injoignable » : le serveur n’atteint pas api-lannuaire.service-public.fr (proxy, pare-feu). Vérifier une commune connue : adresse, téléphone, courriel et site de la mairie.' },
  { id: 'plan-aerien-ign', depuis: '0.231.0', source: 'serveur', titre: 'Plan aérien IGN : photographie, numéros de parcelles et pourcentage de zonage',
    comment: 'Coché à la première édition réussie (Contrôle de l’urbanisme › « Plan aérien »). Échec « IGN injoignable » : le serveur n’atteint pas data.geopf.fr ou apicarto.ign.fr (proxy, pare-feu). Regarder le PDF : numéros des parcelles voisines lisibles, jaune dans les limites des parcelles du dossier, parts de zone qui font 100 % ; comparer avec le plan de situation du cadastre.' },
  { id: 'agent-demande-collaborateur', depuis: '0.228.0', source: 'poste', titre: '« Demander à CLAIRE » : une demande à un collaborateur — message Teams reçu et tâche dans sa liste « Aujourd’hui »',
    comment: 'Coché à la première demande où la tâche est enregistrée et le message parti ; en échec sinon. Vérifier une fois que le message arrive bien dans Teams chez le collaborateur, et que celui qui demande est prévenu quand la tâche est cochée.' },
  { id: 'agent-lecture-document', depuis: '0.226.0', source: 'poste', titre: '« Demander à CLAIRE » : un PDF du dossier du NAS lu par l’agent (texte masqué, OCR des scans)',
    comment: 'Coché à la première lecture réussie d’un document par l’agent ; en échec si le PDF ne s’ouvre pas. Comparer la première fois ce que l’agent dit du document au document lui-même.' },
  { id: 'agent-recherche-web', depuis: '0.285.0', source: 'serveur', titre: '« Demander à CLAIRE » : une recherche web sur les sites officiels autorisés',
    comment: 'Coché quand des résultats de recherche web reviennent ; en échec si la requête est refusée avec la recherche web (non autorisée pour la clé Anthropic de l’étude, ou un site refusé) — l’agent répond alors sans elle.' },
  { id: 'agent-relecture', depuis: '0.284.0', source: 'poste', titre: '« Demander à CLAIRE » : un acte relu avec les contrôles de CLAIRE (outil controles_relecture)',
    comment: 'Coché à la première relecture demandée à l’agent. Comparer le compte rendu à une relecture faite par l’étude (points justes, bruit, pages citées).' },
  { id: 'agent-document-nas', depuis: '0.226.0', source: 'poste', titre: '« Demander à CLAIRE » : un document Word produit par l’agent rangé à la racine du dossier client',
    comment: 'Coché au premier document rangé (bouton « Ranger dans le dossier du NAS ») ; en échec si le serveur refuse l’écriture. Ouvrir le .docx une fois dans Word pour vérifier sa mise en page.' },
  { id: 'constitution-courriers', depuis: '0.240.0', source: 'poste', titre: 'Constitution de dossier : les courriers d’une vente ou d’une succession sont préparés d’après la fiche',
    comment: 'Coché à la première génération réussie (outil « Constitution de dossier »). Relire un courrier : parcelles, vendeurs et domiciles (vente) ou défunt, date de décès et destinataires (succession) doivent être ceux d’Authentic.' },
  { id: 'scan-succession-factures', depuis: '0.247.0', source: 'poste', titre: 'Successions : Claire Scan range les courriers dans « Courrier reçu » et les factures dans « Factures à régler »',
    comment: 'Vérifier sur le NAS, dans le dossier d’une succession, les deux sous-dossiers créés et le nom des copies ; sur la fiche (onglet Dossier), l’organisme et le montant lus sur la facture.' },
  { id: 'facture-succession-teams', depuis: '0.247.0', source: 'poste', titre: 'Successions : chaque facture rangée est annoncée à Sophie sur Teams (dossier, organisme, montant)',
    comment: 'Coché au premier message parti ; en échec si l’adresse de Sophie GOSSART manque dans Réglages › Collaborateurs. Comparer le message reçu avec la facture.' },
  { id: 'fcddv-lu', depuis: '0.246.0', source: 'poste', titre: 'Successions : la réponse du FCDDV est lue (inscriptions et notaire dépositaire, ou « aucune inscription »)',
    comment: 'Coché à la première réponse reconnue ; en échec si la réponse lue ne montre ni inscription ni « aucune ». Comparer ce qui est affiché sur la fiche avec le PDF du FCDDV, et l’email du confrère proposé.' },
  { id: 'pret-authentic-sous-dossier', depuis: '0.296.0', source: 'poste', titre: 'Hypothèque : le sous-dossier « Prêt » d’Authentic dit si l’acte de prêt est rédigé, en cours ou signé',
    comment: 'Coché à la première page de sous-dossier « Prêt » lue ; en échec si la page ne montre aucun état de rédaction (tableau « Rédaction » : Non rédigé, En cours, Signé le…). Si c’est le cas, copier la structure de la page (Authentic › « Copier la structure ») pour adapter la lecture.' },
  { id: 'dod-email', depuis: '0.296.0', source: 'poste', titre: 'Hypothèque : l’email de la DOD (déclaration d’origine des deniers) s’ouvre pour le notaire instrumentaire ou le confrère de l’acquéreur',
    comment: 'Coché au premier email préparé ; vérifier le texte (premier jet de CLAIRE), l’adresse du confrère et la pièce jointe.' },
  { id: 'prorata-avis-nas', depuis: '0.252.0', source: 'poste', titre: 'Prorata ouvert depuis une fiche : l’avis de taxe foncière du dossier du NAS est lu seul et son montant posé',
    comment: 'Coché au premier avis lu ; en échec si le montant n’a pas pu être lu. Comparer le montant retenu à celui de l’avis.' },
  { id: 'constitution-plan-cadastral', depuis: '0.251.0', source: 'poste', titre: 'Constitution de dossier : le plan cadastral surligné de chaque commune est tiré et joint aux courriers de vente',
    comment: 'Coché au premier plan prêt ; en échec si cadastre.gouv.fr refuse la demande. Vérifier sur l’impression qu’il suit chaque courrier, qu’il est joint à l’email et enregistré dans « Constitution ».' },
  { id: 'constitution-pdf', depuis: '0.240.0', source: 'poste', titre: 'Constitution de dossier : un courrier sort en PDF/A sur le papier de l’office, avec tampon et signature',
    comment: 'Coché au premier PDF créé. Ouvrir un PDF : en-tête, adresse, texte de l’étude, tampon et signature « p/o » à vérifier ; le contrôler dans Authentic si le courrier y est déposé.' },
  { id: 'constitution-commune', depuis: '0.240.0', source: 'serveur', titre: 'Constitution de dossier : la commune du bien est retrouvée (INSEE, intercommunalité, fiche de la mairie)',
    comment: 'Coché à la première commune retrouvée ; en échec si l’annuaire du service public ne répond pas (l’adresse de la mairie se saisit alors à la main).' },
  { id: 'courrier-succession-word', depuis: '0.238.0', source: 'poste', titre: 'Courriers d’interrogation d’une succession : le Word sort sur le papier à en-tête de l’office',
    comment: 'Coché au premier courrier créé ; en échec si le modèle Word ne se fabrique pas sur le poste. Ouvrir un courrier dans Word : adresse, date, bloc du défunt, texte de l’étude et signature « Me … » à vérifier.' },
  { id: 'openlegi-connexion', depuis: '0.281.0', source: 'serveur', titre: 'OpenLegi : CLAIRE lit les outils de Légifrance, du BOFiP et du registre des entreprises',
    comment: 'Coché au premier « Tester la connexion » ou à la première liste d’outils lue ; en échec si le jeton est refusé ou si mcp.openlegi.fr ne répond pas (réseau du bureau, pare-feu).' },
  { id: 'openlegi-recherche', depuis: '0.281.0', source: 'serveur', titre: 'OpenLegi : l’agent cherche un article, une décision ou une société et cite la source',
    comment: 'Coché au premier appel réussi d’un outil OpenLegi par l’agent ; en échec si la réponse est illisible ou refusée. Demander par exemple « que dit l’article 1589 du Code civil ? ».' },
  { id: 'assistant-agent', depuis: '0.213.0', source: 'serveur', titre: '« Demander à CLAIRE » en agent : Claude lit les dossiers (masqués) avec ses outils et répond',
    comment: 'Coché à la première réponse de l’agent ; en échec si la clé est refusée, si le modèle choisi n’est pas accessible avec cette clé, ou si Claude ne répond pas à temps (le poste revient alors à la compréhension d’une phrase).' },
  { id: 'assistant-conversation', depuis: '0.209.0', source: 'serveur', titre: '« Demander à CLAIRE » : un échange libre rédigé par l’IA en ligne (noms masqués, aucune donnée de dossier)',
    comment: 'Coché à la première réponse libre rédigée par Claude ou Mistral ; en échec si la clé est refusée, si l’IA ne répond pas à temps ou répond hors format (le poste répond alors lui-même).' },
  { id: 'assistant-claude', depuis: '0.196.0', source: 'serveur', titre: '« Demander à CLAIRE » : une phrase comprise par Claude (noms masqués)',
    comment: 'Coché à la première phrase comprise par l’API Claude ; en échec si la clé est refusée, si Claude ne répond pas en 20 s ou si le serveur ne joint pas internet.' },
  { id: 'assistant-mistral', depuis: '0.178.0', source: 'serveur', titre: '« Demander à CLAIRE » : une phrase comprise par Mistral (noms masqués)',
    comment: 'Coché à la première phrase ambiguë comprise par l’API Mistral ; en échec si la clé est refusée, si Mistral ne répond pas en 20 s ou si le serveur ne joint pas internet.' },
  { id: 'assistant-ia-locale', depuis: '0.167.0', source: 'serveur', titre: '« Demander à CLAIRE » : une phrase ambiguë comprise par l’IA locale',
    comment: 'Coché la première fois qu’Ollama rend une intention de la liste pour une phrase que les mots-clés ne tranchaient pas ; en échec si l’IA locale est indisponible ou répond hors format (les mots-clés prennent alors le relais).' },
  { id: 'fausses-minutes', depuis: '0.139.0', source: 'poste', titre: 'Dossier « Fausses minutes » trouvé et lu (envoi de la copie de l’acte au client)',
    comment: 'Coché la première fois que la fenêtre « Envoyer la copie de l’acte / l’attestation de vente » lit le dossier des fausses minutes ; en échec s’il est introuvable (renseigner alors « nasFaussesMinutes » dans config.json).' },
  { id: 'authentic-creer-dossier', depuis: '0.137.0', source: 'poste', titre: 'Authentic : « Créer » proposé sur une page de vente sans dossier, « Nouveau dossier » ouvert pré-rempli',
    comment: 'Coché la première fois qu’un clic sur « Créer » (message ou fenêtre « Choisir ») ouvre « Nouveau dossier » avec la page de vente lue.' },
  { id: 'complement-compromis-nas', depuis: '0.136.0', source: 'poste', titre: 'Compléter un dossier avec le compromis : compromis lu depuis le NAS et appliqué sur la fiche',
    comment: 'Coché la première fois qu’un compromis proposé depuis le NAS (fiche › « Compléter ») est lu par le poste et que le dossier est complété ; en échec si la lecture du fichier échoue.' },
  { id: 'nas-noms-parcours', depuis: '0.134.0', source: 'serveur', titre: 'Noms de fichiers du NAS : dossier commun parcouru en entier',
    comment: 'Coché quand le parcours de tous les dossiers clients du commun se termine (détail : nombre de dossiers et de PDF).' },
  { id: 'formes-noms-reconnaissance', depuis: '0.134.0', source: 'poste', titre: 'Une forme de nom validée dans l’outil a reconnu une pièce d’un dossier',
    comment: 'Coché la première fois qu’une forme validée (« oui ») fait reconnaître une pièce que les motifs fixes ne voyaient pas.' },
  { id: 'maj-auto', depuis: '0.131.0', source: 'serveur', titre: 'Mise à jour automatique installée, serveur redémarré sur la nouvelle version',
    comment: 'Coché au démarrage qui suit une installation automatique, si le build en marche est celui qui a été installé.' },
  { id: 'notification-navigateur', depuis: '0.132.2', source: 'poste', titre: 'Notification Windows/Chrome envoyée (pièce trouvée)',
    comment: 'Coché quand une fenêtre CLAIRE cachée a pu afficher une notification (permission accordée, réglage du poste actif).' },
  { id: 'notification-logo', depuis: '0.132.2', source: 'manuel', titre: 'Le logo de CLAIRE apparaît dans la notification Windows',
    comment: 'À confirmer à l’œil à la prochaine notification « Nouvelle(s) pièce(s) trouvée(s) ».' },
  { id: 'email-reponse-email-deplace', depuis: '0.144.32', source: 'serveur', titre: 'Réponse à un email déplacé dans Outlook : partie quand même, comme nouvel email',
    comment: 'Coché quand une réponse a été envoyée alors que l’email d’origine n’était plus à son emplacement (ErrorItemNotFound sur la réponse dans le fil).' },
  { id: 'telephone-3cx-lien', depuis: '0.144.27', source: 'poste', titre: 'Un numéro cliquable de CLAIRE ouvre 3CX pour appeler',
    comment: 'Coché au premier clic sur l’icône de téléphone d’un numéro (fiche, appels reçus, bandeau d’appel) ; à confirmer à l’œil : 3CX doit composer le numéro (protocole « tel: » réglé sur 3CX sur le poste).' },
  { id: 'telephone-3cx-texte', depuis: '0.146.0', source: 'manuel', titre: 'Un numéro écrit en texte dans CLAIRE (répertoire, téléphone du confrère sur la fiche) est cliquable par l’extension 3CX',
    comment: 'À confirmer à l’œil : l’extension Chrome « 3CX Click to Call » doit souligner/rendre cliquable le numéro écrit en texte (balise tcxspan posée par CLAIRE) et composer au clic.' },
  { id: 'actes-agenda-historique', depuis: '0.132.0', source: 'serveur', titre: 'Statistiques : historique de l’agenda lu sur deux années (actes à l’agenda)',
    comment: 'Coché quand tous les mois de l’année précédente et de l’année en cours ont été lus dans Exchange.' },
  { id: 'actes-agenda-chiffres', depuis: '0.132.0', source: 'manuel', titre: 'Statistiques : ventes, successions et donations conformes à l’agenda',
    comment: 'À confirmer en comparant un mois avec l’agenda d’Outlook (titres VTE, SUCC, DONATION).' },
  { id: 'fenetres-rechargees', depuis: '0.135.0', source: 'poste', titre: 'Après une mise à jour automatique, une fenêtre CLAIRE déjà ouverte s’est rechargée seule sur la nouvelle version',
    comment: 'Coché la première fois qu’une fenêtre voit le serveur redémarrer sur une autre version et se recharge.' },
  { id: '3cx-lien-reg', depuis: '0.224.0', source: 'serveur', titre: 'Appel 3CX : le lien « claire-devant » du fichier .reg a répondu (PowerShell lancé par le navigateur de 3CX)',
    comment: 'Coché au premier signal reçu (Réglages › Téléphonie 3CX › « Télécharger le fichier pour ce poste », fichier ouvert, « Toujours autoriser » au premier appel). Rien reçu : fichier pas ouvert, lien refusé dans le navigateur, ou PowerShell bloqué par l’antivirus — la fiche s’ouvre alors dans l’onglet de 3CX.' },
  { id: '3cx-lien-reg-premier-plan', depuis: '0.224.0', source: 'manuel', titre: 'Appel 3CX avec le fichier .reg : la fenêtre CLAIRE passe au premier plan sur l’appel (restaurée si réduite, ouverte si fermée)',
    comment: 'Essayer un appel d’un client d’un dossier avec la fenêtre CLAIRE derrière une autre, puis réduite, puis fermée. Une fenêtre PowerShell peut apparaître un instant.' },
  { id: '3cx-relais-premier-plan', depuis: '0.220.1', source: 'manuel', titre: 'Appel 3CX avec le relais CLAIRE du poste : appelant d’un dossier → fenêtre CLAIRE au premier plan ; appelant inconnu → la fenêtre d’avant revient (Chrome ne reste plus devant)',
    comment: 'Réglages › Téléphonie 3CX › « Installer le relais sur ce poste », sur le poste du collaborateur ; plus de lien claire-appel à autoriser. Essayer un appel d’un client d’un dossier et un appel d’un numéro inconnu.' },
  { id: '3cx-appel-fenetre-claire', depuis: '0.189.0', source: 'manuel', titre: 'Appel 3CX : l’onglet de 3CX se ferme et la fenêtre CLAIRE passe au premier plan sur l’appel (rouverte si réduite, ouverte si fermée)',
    comment: 'Réglages › Téléphonie 3CX › « Installer sur ce poste », sur le poste du collaborateur ; au premier appel, « Toujours autoriser » le lien claire-appel dans le navigateur de 3CX.' },
  { id: 'telephone-3cx-fenetre-app', depuis: '0.164.1', source: 'manuel', titre: 'Dans la fenêtre CLAIRE (raccourci du bureau), après l’ajout de l’extension 3CX à son profil, un numéro écrit est cliquable',
    comment: 'Réglages › Téléphonie 3CX › « Ajouter l’extension 3CX », depuis la fenêtre CLAIRE, puis connexion au compte 3CX.' },
  { id: 'courrier-tampon-signature', depuis: '0.205.0', source: 'manuel', titre: 'Courrier d’appel de fonds (.docx ouvert dans Word) : tampon de l’office et signature par-dessus, sans fond, sous « Me … »',
    comment: 'À regarder dans Word au bureau (ici seul LibreOffice a rendu le .docx) : position sous la signature, transparence, pas de page blanche ajoutée.' },
  { id: 'courrier-pdfa-authentic', depuis: '0.205.0', source: 'manuel', titre: 'Courrier d’appel de fonds en PDF/A-2U accepté par Authentic (« PDF/A pour Authentic »)',
    comment: 'Conforme PDF/A-2U (et donc 2B) d’après veraPDF au moment de l’écriture ; reste à le déposer dans Authentic et à voir sa « Conformité Norme » (PDF/A-2U ou 2B).' },
  { id: 'photos-aeriennes-ign', depuis: '0.201.0', source: 'serveur', titre: 'Contrôle de l’urbanisme : photos aériennes de la parcelle lues à l’IGN (data.geopf.fr)',
    comment: 'Coché à la première photo reçue par le serveur du bureau (accès Internet sortant vers data.geopf.fr).' },
  { id: 'sitadel-parcelle', depuis: '0.201.0', source: 'serveur', titre: 'Contrôle de l’urbanisme : autorisations d’urbanisme de la parcelle lues dans Sitadel',
    comment: 'Coché à la première recherche réussie depuis le serveur du bureau (accès Internet sortant vers data.statistiques.developpement-durable.gouv.fr).' },
  { id: 'travaux-compromis-nas', depuis: '0.200.0', source: 'poste', titre: 'Contrôle de l’urbanisme : travaux déclarés lus dans le compromis du NAS (autorisation, achèvement, décennale)',
    comment: 'Coché à la première lecture réussie du compromis d’un dossier relié au NAS (outil Contrôle de l’urbanisme ou ajout d’un dossier) : voir la fiche › Pièces et analyse.' },
  { id: 'preemption-auto-dossier', depuis: '0.190.0', source: 'poste', titre: 'Droits de préemption lus seuls à l’ajout d’un dossier de vente (zonage de chaque parcelle, pièces à attendre)',
    comment: 'Coché à la première analyse réussie après « Ajouter le dossier » (dossier de vente avec code postal et parcelles) : voir la fiche › Pièces et analyse › Droits de préemption.' },
  { id: 'zonage-parcelle-gpu', depuis: '0.164.0', source: 'serveur', titre: 'Droits de préemption : zonage d’une parcelle lu sur le Géoportail de l’urbanisme (API Carto de l’IGN)',
    comment: 'Coché à la première lecture réussie depuis le serveur du bureau (accès Internet sortant vers apicarto.ign.fr).' },
  { id: 'restauration-sauvegarde', depuis: '0.163.0', source: 'serveur', titre: 'Sauvegarde restaurée au démarrage (vérifiée, ancienne base gardée à côté avec son journal)',
    comment: 'Coché à la première restauration réussie (bouton « Restaurer » des Réglages, ou claire-restauration.db déposé à la main). Vérifier ensuite les dossiers dans le Suivi.' },
  { id: 'emails-rattachement-archive', depuis: '0.162.0', source: 'serveur', titre: 'Emails des dossiers : un email d’un client ou d’un confrère rattaché à un dossier archivé',
    comment: 'Coché la première fois qu’un email reçu va sur la fiche d’un dossier archivé. À contrôler sur la fiche : le bon dossier.' },
  { id: 'emails-dossier-rattrapage', depuis: '0.135.0', source: 'serveur', titre: 'Emails des dossiers : dossier tout juste créé, ses emails des 30 derniers jours retrouvés',
    comment: 'Coché la première fois qu’un email reçu avant la création d’un dossier lui est rattaché (par l’adresse ou par l’objet).' },
  { id: 'emails-adresse-rattrapage', depuis: '0.134.4', source: 'serveur', titre: 'Emails des dossiers : adresse ajoutée sur une fiche, ses emails des 30 derniers jours retrouvés',
    comment: 'Coché la première fois qu’un email reçu avant la saisie de l’adresse (client ou confrère) est rattaché au dossier.' },
  { id: '3cx-lien-sans-confirmation', depuis: '0.290.0', source: 'manuel', titre: '3CX : le navigateur ouvre le lien « claire-devant » sans demander à chaque appel (stratégie posée par le fichier .reg)',
    comment: 'À confirmer à l’œil après avoir réimporté le fichier .reg du poste et rouvert Chrome : plus de question au deuxième appel.' },
  { id: 'import-clients-biens', depuis: '0.291.0', source: 'poste', titre: 'Réglages › Authentic : export clients ou immeubles d’Authentic (.xls) lu et importé',
    comment: 'Coché au premier export lu sur un poste (SheetJS chargé, colonnes devinées) ; en échec si le fichier est illisible ou la bibliothèque injoignable.' },
  { id: 'rangement-outlook', depuis: '0.289.0', source: 'serveur', titre: 'Outlook : emails « Facture Dossier FIDJI » et quarantaine@notaires.fr déplacés dans « Traité à distance »',
    comment: 'Coché au premier déplacement réussi dans la boîte du compte relié ; en échec si Exchange refuse le déplacement.' },
  { id: 'emails-dossiers-reception', depuis: '0.127.0', source: 'serveur', titre: 'Emails des dossiers : un email reçu rattaché à un dossier et lu en entier',
    comment: 'Coché au premier tour qui lit un email de la boîte de réception rattaché à un dossier.' },
  { id: 'emails-envoyes-collaborateur', depuis: '0.127.0', source: 'serveur', titre: 'Emails des dossiers : « Éléments envoyés » d’un collaborateur lus (accès délégué)',
    comment: 'Coché quand la boîte d’envoi d’un collaborateur a pu être lue ; en échec tant que l’accès « Relecteur » n’est pas donné dans Outlook.' },
  { id: 'email-prepare-envoye', depuis: '0.127.0', source: 'serveur', titre: 'Un email préparé par CLAIRE retrouvé dans les envoyés (« envoyé le … »)',
    comment: 'Coché la première fois qu’un .eml préparé est retrouvé envoyé.' },
  { id: 'email-projet-detecte', depuis: '0.177.0', source: 'serveur', titre: 'Projet d’acte envoyé détecté dans les emails envoyés (échéance cochée, mention dans l’agenda)',
    comment: 'Coché la première fois qu’un email envoyé au client ou au confrère, dont l’objet dit « projet d’acte » (ou, pièce jointe à l’appui, dont le texte dit « projet d’acte de vente »), coche l’envoi du projet sur la fiche ; la mention « projet envoyé » du rendez-vous Outlook se vérifie dans l’agenda.' },
  { id: 'email-resume-ia', depuis: '0.127.0', source: 'serveur', titre: 'Résumé d’un email par l’IA locale (Ollama)',
    comment: 'Coché au premier résumé rendu ; en échec si l’IA est indisponible ou ne répond pas.' },
  { id: 'piece-jointe-nas', depuis: '0.128.0', source: 'serveur', titre: 'Pièce jointe d’un email rangée dans le dossier client du NAS',
    comment: 'Coché à la première copie réussie sur le NAS.' },
  { id: 'installation-poste', depuis: '0.128.0', source: 'serveur', titre: '« CLAIRE en application » installé sur un poste (script .vbs exécuté)',
    comment: 'Coché quand l’installateur d’un poste télécharge l’icône de CLAIRE : le script a bien tourné sous Windows.' },
  { id: 'installation-poste-icone', depuis: '0.128.0', source: 'manuel', titre: 'Poste installé : icône de CLAIRE nette dans la barre des tâches',
    comment: 'À confirmer à l’œil sur un poste installé.' },
  { id: '3cx-sonnerie', depuis: '0.98.0', source: 'serveur', titre: '3CX : une sonnerie reçue avec un numéro lisible',
    comment: 'Coché à la première sonnerie dont le numéro a une forme de numéro (détail : forme du numéro, jamais le numéro).' },
  { id: '3cx-appelant-reconnu', depuis: '0.98.0', source: 'serveur', titre: '3CX : un appelant reconnu (dossier, confrère ou répertoire)',
    comment: 'Coché au premier appelant reconnu.' },
  { id: 'agenda-soft-delete', depuis: '0.97.3', source: 'serveur', titre: 'Agenda : suppression rattrapée par « SoftDelete » (compte délégué)',
    comment: 'Coché la première fois que le repli a servi et réussi.' },
  { id: 'sondage-reponse', depuis: '0.82.0', source: 'serveur', titre: 'Sondage de créneaux : une réponse relevée dans la boîte',
    comment: 'Coché à la première réponse comptée.' },
  { id: 'visio-ics', depuis: '0.93.0', source: 'poste', titre: 'Visio ADNOV : lien lu dans une invitation .ics',
    comment: 'Coché quand une invitation déposée donne un lien de visio.' }
];
const PAR_ID = new Map(VERIFICATIONS_TERRAIN.map((v) => [v.id, v]));

function texteTechnique(v, max = 80) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function dateValide(v) { return typeof v === 'string' && !isNaN(Date.parse(v)) ? v.slice(0, 40) : null; }
function entier(v) { return Number.isInteger(v) && v >= 0 ? v : 0; }

// Pure : état gardé, points inconnus retirés.
function assainirVerifications(brut) {
  const sortie = {};
  for (const [id, e] of Object.entries(brut && typeof brut === 'object' ? brut : {})) {
    if (!PAR_ID.has(id) || !e || typeof e !== 'object') continue;
    sortie[id] = {
      premiereFois: dateValide(e.premiereFois), derniereFois: dateValide(e.derniereFois), fois: entier(e.fois),
      detail: texteTechnique(e.detail), echecs: entier(e.echecs), dernierEchec: dateValide(e.dernierEchec),
      messageEchec: texteTechnique(e.messageEchec, 160), confirmeLe: dateValide(e.confirmeLe), infirmeLe: dateValide(e.infirmeLe)
    };
  }
  return sortie;
}

// Pure : nouvel état après une observation. `ok` false = le geste a été tenté et a échoué.
function appliquerObservation(etat, id, { ok = true, detail = '', message = '' } = {}, maintenant = new Date().toISOString()) {
  if (!PAR_ID.has(id)) return etat;
  const e = { ...(etat[id] || { premiereFois: null, derniereFois: null, fois: 0, detail: '', echecs: 0, dernierEchec: null, messageEchec: '', confirmeLe: null, infirmeLe: null }) };
  if (ok) {
    e.premiereFois = e.premiereFois || maintenant;
    e.derniereFois = maintenant;
    e.fois = (e.fois || 0) + 1;
    if (detail) e.detail = texteTechnique(detail);
  } else {
    e.echecs = (e.echecs || 0) + 1;
    e.dernierEchec = maintenant;
    e.messageEchec = texteTechnique(message || detail, 160);
  }
  return { ...etat, [id]: e };
}

// Pure : statut d'un point — 'verifie', 'echec' (tenté, jamais réussi, ou infirmé à la main), 'attente'.
function statutVerification(def, e) {
  if (!e) return 'attente';
  if (def.source === 'manuel') {
    if (e.infirmeLe && (!e.confirmeLe || e.infirmeLe > e.confirmeLe)) return 'echec';
    return e.confirmeLe ? 'verifie' : 'attente';
  }
  if (e.premiereFois) return 'verifie';
  return e.echecs ? 'echec' : 'attente';
}

function lireVerifications(parametresRepo) {
  return assainirVerifications(parametresRepo && parametresRepo.lireJsonBrut ? parametresRepo.lireJsonBrut(CLE_VERIFICATIONS, {}) : {});
}

// Note une observation ; jamais bloquant pour le geste lui-même. Une observation réussie déjà
// vérifiée n'est réécrite qu'au plus une fois par heure (les tours toutes les minutes ne réécrivent
// pas la base à chaque fois).
function noterVerification(parametresRepo, id, observation = {}) {
  try {
    if (!parametresRepo || !parametresRepo.ecrireJsonBrut || !PAR_ID.has(id)) return;
    const etat = lireVerifications(parametresRepo);
    const prec = etat[id];
    const ok = observation.ok !== false;
    const recent = (d) => d && Date.now() - Date.parse(d) < 3600 * 1000;
    if (ok && prec && recent(prec.derniereFois) && (!observation.detail || texteTechnique(observation.detail) === prec.detail)) return;
    if (!ok && prec && recent(prec.dernierEchec) && texteTechnique(observation.message || observation.detail, 160) === prec.messageEchec) return;
    parametresRepo.ecrireJsonBrut(CLE_VERIFICATIONS, appliquerObservation(etat, id, observation));
  } catch (_) { /* jamais bloquant */ }
}

// Confirmation (ou infirmation) à la main d'un point « manuel ».
function confirmerVerification(parametresRepo, id, confirme, maintenant = new Date().toISOString()) {
  const def = PAR_ID.get(id);
  if (!def || def.source !== 'manuel') return null;
  const etat = lireVerifications(parametresRepo);
  const e = { ...(etat[id] || {}) };
  if (confirme) { e.confirmeLe = maintenant; e.infirmeLe = null; } else { e.infirmeLe = maintenant; }
  const propre = assainirVerifications({ ...etat, [id]: e });
  parametresRepo.ecrireJsonBrut(CLE_VERIFICATIONS, propre);
  return propre[id];
}

// Pure : compare deux numéros de version chiffre par chiffre (« 0.144.10 » est après « 0.144.9 »). Autre forme
// (anciens points, tests) : ordre alphabétique, comme avant le 04/10.
function comparerVersions(a, b) {
  const ma = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(a)); const mb = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(b));
  if (ma && mb) for (let i = 1; i <= 3; i++) { const d = Number(ma[i]) - Number(mb[i]); if (d) return d; }
  else return String(a).localeCompare(String(b));
  return 0;
}

// Pure : liste pour l'écran et le rapport, la plus récente mise à jour d'abord.
function listeVerifications(etat) {
  return VERIFICATIONS_TERRAIN.map((def) => ({ ...def, etat: etat[def.id] || null, statut: statutVerification(def, etat[def.id]) }))
    .sort((a, b) => comparerVersions(b.depuis, a.depuis));
}

// Pure : section du rapport technique. `anonymiser` = anonymiserTexte déjà lié aux mots sensibles.
// Un point vérifié n'est cité qu'une fois, dans le rapport de la période où il l'a été (étude 06/10) ; ensuite il est
// seulement compté. Les points en attente et en échec sont toujours listés.
function sectionVerificationsTerrain(etat, depuis, jusqua, anonymiser = (t) => t, dateHeure = (d) => d) {
  const liste = listeVerifications(etat);
  const dans = (d) => d && d > depuis && d <= jusqua;
  const verifies = liste.filter((v) => v.statut === 'verifie');
  const nouveauVerifie = (v) => v.statut === 'verifie' && dans(v.source === 'manuel' ? (v.etat || {}).confirmeLe : (v.etat || {}).premiereFois);
  const anciens = verifies.filter((v) => !nouveauVerifie(v)).length;
  const L = ['', `## Vérifications sur le terrain (${verifies.length}/${liste.length} vérifiées)`];
  if (anciens) L.push(`${anciens} point(s) vérifié(s) lors d'un rapport précédent, plus repris ici.`);
  const icone = { verifie: '✅', echec: '⚠️', attente: '⬜' };
  for (const v of liste) {
    if (v.statut === 'verifie' && !nouveauVerifie(v)) continue;
    const e = v.etat || {};
    let etatTexte;
    if (v.statut === 'verifie') {
      etatTexte = v.source === 'manuel' ? `confirmé le ${dateHeure(e.confirmeLe)}`
        : `vérifié le ${dateHeure(e.premiereFois)}${e.fois > 1 ? ` · ${e.fois} fois` : ''}${dans(e.premiereFois) ? ' · **nouveau**' : ''}`;
    } else if (v.statut === 'echec') {
      etatTexte = v.source === 'manuel' ? `signalé comme ne fonctionnant pas le ${dateHeure(e.infirmeLe)}`
        : `${e.echecs} échec(s), dernier le ${dateHeure(e.dernierEchec)}`;
    } else etatTexte = v.source === 'manuel' ? 'à confirmer à la main (Réglages › Mise à jour et sauvegarde)' : 'pas encore observé';
    const detail = e.detail && v.statut === 'verifie' ? ` · ${anonymiser(e.detail)}` : '';
    const message = e.messageEchec && (v.statut === 'echec' || dans(e.dernierEchec)) ? ` · dernier échec : \`${anonymiser(e.messageEchec).replace(/`/g, 'ˋ')}\`` : '';
    L.push(`- ${icone[v.statut]} ${v.titre} (depuis ${v.depuis}) — ${etatTexte}${detail}${message}`);
  }
  return L;
}

// Pure : échecs survenus sur la période (pour « À examiner »).
function echecsVerificationsPeriode(etat, depuis, jusqua) {
  return listeVerifications(etat).filter((v) => {
    const e = v.etat || {};
    const d = v.source === 'manuel' ? (v.statut === 'echec' ? e.infirmeLe : null) : e.dernierEchec;
    return d && d > depuis && d <= jusqua;
  });
}

// Forme d'un numéro de téléphone, sans le numéro : « +33 et 9 chiffres », « 10 chiffres (0…) ».
function formeNumero(numero) {
  const brut = String(numero || '').trim();
  const chiffres = brut.replace(/\D/g, '');
  if (!chiffres) return 'sans chiffre';
  if (brut.startsWith('+')) return `+${chiffres.slice(0, 2)} et ${chiffres.length - 2} chiffres`;
  if (chiffres.startsWith('00')) return `00${chiffres.slice(2, 4)} et ${chiffres.length - 4} chiffres`;
  return `${chiffres.length} chiffres${chiffres.startsWith('0') ? ' (0…)' : ''}`;
}

module.exports = { comparerVersions,
  VERIFICATIONS_TERRAIN, CLE_VERIFICATIONS, assainirVerifications, appliquerObservation, statutVerification,
  lireVerifications, noterVerification, confirmerVerification, listeVerifications, sectionVerificationsTerrain,
  echecsVerificationsPeriode, formeNumero
};
