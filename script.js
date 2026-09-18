
  // Affichées dans l'écran "À propos" (voir ouvrirAPropos ci-dessous) — permet à l'étude de
  // vérifier en un coup d'œil qu'elle a bien la dernière copie retéléchargée depuis le dépôt avant
  // de resignaler un bug déjà corrigé : l'outil n'a pas de mise à jour automatique (pas de build,
  // pas de serveur — voir contrainte n°1 de CLAUDE.md), et plusieurs signalements de cette session
  // se sont révélés être une copie obsolète testée par erreur.
  // Format DATE + HEURE (pas seulement la date) : plusieurs versions peuvent se succéder dans la
  // même journée (plusieurs corrections l'une après l'autre) — une simple date ne permettrait pas
  // de les distinguer. À METTRE À JOUR MANUELLEMENT à chaque commit qui modifie le comportement de
  // l'outil, avec l'heure RÉELLE au moment du commit, **en heure de Paris** (celle de l'étude) —
  // demandé explicitement, l'environnement de développement tournant par défaut en UTC. Utiliser
  // `TZ='Europe/Paris' date '+%Y-%m-%d %H:%M'` en shell (jamais `date` seul, qui rendrait l'heure
  // UTC — décalée d'1h ou 2h selon l'heure d'été/hiver) — ne PAS deviner ni recopier l'heure d'un
  // commit précédent, et ne pas automatiser via un numéro de commit git : ces 3 fichiers sont
  // utilisés hors de tout dépôt une fois déposés chez l'étude, aucune information git n'est
  // disponible à l'exécution.
  const VERSION_APP = '2026-09-19 01:37';

  // Court historique des dernières versions (la plus récente en tête), affiché sous le numéro de
  // version dans l'écran "À propos" — le numéro seul dit "ce n'est pas la même version", cette
  // liste dit en plus CE QUI A CHANGÉ, ce qui permet à l'étude de vérifier qu'elle a bien reçu un
  // correctif précis sans avoir à me redemander. Garder au plus les ~8 entrées les plus récentes
  // (au-delà, l'historique complet reste dans CLAUDE.md) ; ajouter une entrée en tête à CHAQUE mise
  // à jour de VERSION_APP, jamais la remplacer seule sans laisser de trace du changement précédent.
  const HISTORIQUE_VERSIONS = [
    { version: '2026-09-19 01:37', resume: "Vous serez désormais vous-même en copie, sur Teams, de CHAQUE rappel envoyé à un collaborateur — quel que soit le dossier ou le responsable concerné (nouveau champ dans « Réglages », sous l'adresse du flux). Et le bouton « Rappel email » générique de la fiche dossier, celui qui préparait un brouillon à vous-même avec toutes les échéances, est retiré : cette copie automatique le remplace, plus rien à cliquer. Les trois boutons de relance ciblée par email (prêt manquant, pièces à fournir, RIB), eux, restent inchangés — ils s'adressent au client, pas à vous" },
    { version: '2026-09-19 01:20', resume: "Les rappels de dossier arrivent désormais sur Teams, en message privé, plutôt que par un email qu'il fallait rédiger et envoyer soi-même : à 15 puis 7 jours de chaque échéance active (prêt, acte, vente préalable, échéance personnalisée), le responsable du dossier reçoit directement un message. Ça passe par un petit flux Power Automate que vous créez vous-même (aucun service technique nécessaire, la procédure est expliquée pas à pas dans le nouvel écran « Réglages » de la sidebar), où vous collez l'adresse du flux et l'adresse Teams de chacun — avec un bouton « Tester » par personne pour vérifier avant de compter dessus. Le bouton « Envoyer un rappel par email » resté sur chaque fiche continue de fonctionner exactement comme avant, pour un envoi ponctuel à la main" },
    { version: '2026-09-19 00:04', resume: "Outil 2, trois ajouts. Les OBLIGATIONS DU VENDEUR d'abord : sur un projet d'acte de vente avec un dossier CLAIRE lié, l'audit dit désormais, sans IA, si le vendeur a tenu ce à quoi le compromis l'engageait — attestation d'entretien ou de ramonage, factures de travaux, décennale… Chaque obligation ressort « tenue » (avec la pièce qui le prouve, trouvée dans le dossier client ou déposée pour l'audit), « non tenue », ou « à vérifier » quand aucune pièce type ne correspond à la clause, qui est alors citée avec sa page. Le dossier n'est jamais modifié : une facture déposée ici ne coche rien, elle sera reconnue une fois rangée sur le NAS. Ensuite une MÉMOIRE : chaque constat porte « Écarter » et « Confirmer » ; au prochain audit d'un acte similaire, un constat déjà écarté s'affiche replié (jamais supprimé), un constat confirmé remonte en tête — et « Annuler » efface la décision. Enfin, dès que le projet est lu, les dossiers dont les parties correspondent sont PROPOSÉS sous le champ de recherche, à confirmer d'un clic, jamais liés tout seuls" },
    { version: '2026-09-18 22:58', resume: "« Analyse approfondie (IA) » devient l'Outil 2 : un audit, plus une simple relecture. Un sélecteur explicite au dépôt — projet de compromis/promesse, ou projet d'acte de vente — choisit ce qui est comparé ; en projet d'acte, un dossier CLAIRE déjà suivi peut être lié (son compromis est retrouvé tout seul sur le NAS) pour comparer parties, prix, bien et dates SANS repasser par l'IA, un simple calcul. Chaque pièce déposée (titre, diagnostic, urbanisme, facture, autorisation, décennale, copropriété…) ne va plus qu'aux vérifications qui la concernent, en cinq passes au lieu d'une seule : identification/parties/prix/dates/titre, diagnostics (dont la durée de validité est calculée par l'outil, jamais par le modèle), travaux (en priorité, le point qui manquait le plus), urbanisme/autorisations/garanties/préemption/servitudes, et copropriété si besoin. Quatre niveaux de gravité, une citation vérifiée dans le bon document pour chaque constat important — jamais une confiance auto-déclarée par le modèle, qui n'a aucun moyen de la calibrer" },
    { version: '2026-09-18 21:13', resume: "Quatre automatisations pour libérer du temps. Dans le panneau « Ce que l'outil a compris », un bouton « Redemander à l'IA » redemande UNE SEULE donnée restée floue au modèle local, avec une fenêtre de texte plus large — sans relancer les trois lectures automatiques. Un nouveau panneau « Qualité de l'extraction » (dans « À propos ») montre enfin quels champs vous corrigez le plus souvent, pour savoir où l'extraction mérite d'être resserrée. Le serveur surveille désormais le NAS toutes les dix minutes : un document qui vient d'arriver dans un dossier relié déclenche un message, au lieu d'attendre le prochain clic sur « Revérifier ». Et trois nouveaux boutons de relance par email — prêt manquant, pièces à fournir, RIB — préparent chacun le bon brouillon, adressé au client, sans avoir à le rédiger à la main à chaque fois." },
    { version: '2026-09-18 18:05', resume: "Deux corrections. Un compromis SCANNÉ est maintenant lu en entier : chaque page sans texte passe par la reconnaissance d'image, et la lecture s'arrête d'elle-même au bloc de signature des parties, sans entamer les annexes. Jusqu'ici la reconnaissance ne servait qu'à retrouver la date de signature sur trois pages, ce qui laissait un scan entièrement illisible : les deux compromis scannés que vous avez envoyés ne donnaient rien, ils donnent désormais parties, adresse, prix et dates. Comptez quelques secondes par page — le message indique la page en cours. Le calendrier connecté, ensuite : il ne se mettait pas à jour, et c'était deux manques dans le flux publié. D'abord le numéro de séquence, qu'un client calendrier exige pour accepter de remplacer un événement qu'il connaît déjà : sans lui Outlook gardait l'ancienne date butoir. Ensuite l'annulation explicite : un événement qui disparaît du flux n'est jamais supprimé par le client, il faut publier son annulation — d'où les dates de vente périmées qui restaient affichées. Les échéances effacées et les dossiers archivés sont désormais publiés comme annulés" },
    { version: '2026-09-18 17:56', resume: "Les notaires sur les sept actes lisibles du banc, contre cinq. Vous aviez raison sur les deux compromis d'agence : le notaire y est unique, Maître GOSSART seule, sans confrère en participation. L'outil en comptait trois — les deux autres étaient des notaires simplement CITÉS dans l'origine de propriété, qui avaient reçu la vente précédente ou dressé un règlement de copropriété en 1969. Un notaire cité n'intervient pas à l'acte : il est désormais retiré de la liste, et pas seulement privé de rôle, ce qui laisse enfin s'appliquer la règle du notaire unique — il représente les deux parties, et les deux champs portent son nom. Un repère générique reconnaît ces mentions : un notaire présenté avec une date est celui d'un acte antérieur, un notaire qui intervient ne l'est jamais. Et le dédoublonnage passe maintenant APRÈS ce filtre : le même notaire figure souvent d'abord dans l'origine de propriété puis, plus loin, comme rédacteur du présent acte — retenir la première mention le faisait disparaître entièrement" },
    { version: '2026-09-18 17:52', resume: "Les notaires : qui représente le vendeur, qui représente l'acquéreur, et lequel des deux rédige la vente. Cinq actes du banc d'essai sur sept le donnent maintenant, contre aucun. La règle d'attribution de la minute vient du Règlement Professionnel du Notariat que vous m'avez transmis (art. 30.4.2 : la minute revient au notaire du vendeur, sauf si seul celui de l'acquéreur exerce dans le département du bien) et du règlement de la Chambre du Val de Loire (art. 15 : entre deux notaires du ressort de la Cour d'appel d'Orléans — 41, 45, 37 — c'est toujours le notaire du vendeur). Elle remplace la règle approximative que j'avais encodée, qui portait à tort sur le département du bien. Côté lecture, quatre défauts empêchaient tout : le motif du notaire ne pouvait pas franchir la virgule d'un numéro CRPCEN, si bien que le premier nommé du préambule — celui qui détient la minute — disparaissait ; le CRPCEN, dont les deux premiers chiffres donnent le département, n'était pas lu ; l'article défini manquait à « assistant LE PROMETTANT », forme pourtant standard ; et la phrase qui introduit le second notaire faisait passer le premier pour le participant. Enfin, un notaire seul représente les deux parties, et les deux champs portent désormais son nom" },
    { version: '2026-09-18 17:36', resume: "Type de vente et prix. Trois actes sur sept étaient classés « copropriété » à tort, dont un compromis qui s'intitule pourtant « BIEN HORS COPROPRIETE » : la clause de style qui écarte le statut s'écrit le plus souvent au participe présent (« ne relevANT pas du statut de la copropriété »), forme que le garde-fou ne connaissait pas ; la négation est par ailleurs souvent séparée du mot par la référence complète de la loi de 1965, trop loin pour être vue ; et une mention conditionnelle (« au Syndicat des copropriétaires s'il y a lieu », clause de style dans une liste de pouvoirs) suffisait à faire passer une maison individuelle pour une copropriété. La portée d'une négation s'arrête maintenant à sa phrase et au « mais » qui la contredit. Côté prix, un point avant la parenthèse fermante — « (290000,00 EUR.) » — empêchait la lecture : les neuf actes du banc donnent désormais leur prix" },
    { version: '2026-09-18 17:34', resume: "Trois familles de FAUSSES échéances, qui prenaient chaque fois la place de la vraie — celle-ci restant, elle, sans catégorie. Une citation de texte légal d'abord : « l'ordonnance n° 2016-131 du 10 février 2016 » devenait la date de signature de l'acte sur un compromis de 2026 ; seules les citations de LOI étaient écartées, ordonnances, décrets et arrêtés y sont désormais joints. Une citation entre guillemets ensuite : « au plus tard un mois après la signature de l'acte authentique de vente », recopié d'un article du Code, devenait la date de signature du dossier. Le versement d'une somme enfin : l'indemnité d'immobilisation, payable sous huit ou dix jours, fixait « l'obtention du prêt » dix jours après la signature sur deux promesses. Au passage, deux tournures d'échéance n'étaient pas reconnues du tout : « la signature DUDIT acte » et, sur une promesse, « la réalisation de la présente promesse », qui est pourtant la date butoir pour signer" },
    { version: '2026-09-18 17:30', resume: "Les noms de dossier, sur les sept actes lisibles du banc d'essai : sept sur sept corrects, vérifiés un par un contre les noms de vos propres fichiers. Trois causes. Un patronyme à particule — DE SOUSA MARTINS, LE GOFF, DU PONT — était rejeté d'office, la particule figurant parmi les mots interdits : un acte n'avait ainsi qu'une seule partie, son bénéficiaire restant introuvable. L'étiquette « Dénommés ci-après le PROMETTANT » n'était pas reconnue dans cet ordre de mots, et le dossier prenait le mot qui suit (« ENSEMBLE D'UNE PART » donnait « ENSEMBLE »). Enfin la recherche du nom remontait trop loin en arrière et tombait sur la comparution des notaires, qui nomme les parties qu'ils assistent : elle s'arrête désormais là où l'acte annonce lui-même sa présentation (« à la requête de : », « Entre les soussignés : »). Au passage, une ligne d'état civil (« - Monsieur à BLOIS, le 6 mai 1979 ») ne donne plus la commune comme patronyme, et la date en toutes lettres de l'en-tête, qui se glisse à la coupure de page au milieu d'une partie, n'est plus prise pour un nom" },
    { version: '2026-09-18 17:26', resume: "La date de signature de l'acte, et avec elle les trois dates butoir du dossier. Sur les neuf actes du banc d'essai, elle manquait sur quatre — et quand elle manque, TOUTES les échéances exprimées en délai disparaissent aussi, puisqu'elles se comptent depuis elle. Deux causes. D'abord, trois actes étaient coupés en plein milieu : un simple titre de clause en haut de page (« Diagnostic de performance énergétique », « État des risques de pollution des sols ») passait pour le début des annexes, et tout ce qui suivait — bloc de signature compris — devenait invisible. Une page qui parle encore la langue de l'acte (« aux présentes », « le VENDEUR », « le PROMETTANT ») est désormais reconnue comme faisant encore partie de l'acte. Ensuite, la date en toutes lettres qui ouvre tout acte authentique (« L'AN DEUX MILLE VINGT-SIX, Le VINGT TROIS JUILLET ») n'était pas lue du tout, alors que c'est la forme la plus sûre de cette famille d'actes — deux d'entre eux y renvoient d'ailleurs explicitement, leur bloc de signature n'en portant aucune. Les six actes notariés du banc ont maintenant leur date ; les deux compromis d'agence, dont le texte ne porte aucune date, gardent la date estimée du fichier" },
    { version: '2026-09-18 17:20', resume: "L'adresse du bien est enfin lue correctement. Sur les neuf actes réels que vous avez envoyés, elle ne l'était sur AUCUN — et, plus gênant, elle était présentée comme sûre : la commune ressortait « situé à BLOIS ( » et la voie « ), 74 rue des Hautes Granges ». L'outil ne savait lire que l'ordre postal (« 12 rue Victor Hugo, 41000 BLOIS ») alors que vos actes emploient l'ordre notarial (« situé à BLOIS (41000), 74 rue des Hautes Granges », « A BLOIS (LOIR-ET-CHER) 41000 1 Rue Hannah Arendt ») : commune, puis code postal, puis voie. Trois autres causes s'y ajoutaient : le premier « DÉSIGNATION » d'un acte est souvent celui du SOMMAIRE, ou un mot au fil d'une phrase qu'un retour à la ligne place en début de ligne ; le siège social de l'agence, de son assureur et du diagnostiqueur arrivent avant le bien dans un compromis d'agence, et le premier était retenu ; une élection de domicile (« aux fins de recevoir la notification ») passait aussi pour le bien vendu. Les neuf adresses sortent maintenant justes, présentées proprement : « 8 B rue Yves Genêt, 41000 BLOIS »" },
    { version: '2026-09-18 16:33', resume: "Import d'un acte AUTHENTIQUE (promesse reçue par notaire) : cinq corrections, trouvées en rejouant le PDF que vous avez envoyé. Le document était coupé dès la page 4 — un simple renvoi « ANNEXE » en haut de page passait pour le début des annexes — et tout ce qui suit était donc invisible : ni le prix (page 9), ni la condition de prêt (page 12). Le nom du dossier prenait celui du NOTAIRE, la comparution d'ouverture se désignant elle-même par la partie qu'elle assiste ; il lit maintenant les vraies parties, même quand « né(e) » ne suit pas le patronyme, sans confondre une commune ou un ex-conjoint avec une partie. Le prix accepte « (92 000,00 EUR) » et la coupure de ligne du PDF, l'adresse n'est plus tronquée au milieu de la voie, et la date de signature de l'acte retient la clause qui la NOMME plutôt qu'une clause qui cite « l'acte » en passant. Enfin, les deux simulateurs (provision, prorata) partent d'un champ vide" },
    { version: '2026-09-18 15:45', resume: "Une condition de prêt exprimée en délai est de nouveau calculée quand la clause dit « dans un délai de 60 jours DE LA promesse » ou « du compromis » : le point de départ était perdu et l'échéance disparaissait du formulaire, alors que la panneau affichait à la fois « calculée depuis la signature » et « point de départ à déterminer » — deux phrases contradictoires. Le point de départ réel est maintenant nommé. Dans « Ce que l'outil a compris », taper une date à la main ne valide plus au premier chiffre de l'année. Les dates repérées (« Classées », « Non identifiées ») passent dans un bloc replié SOUS le panneau, qui se lit donc en premier. Vue Échéances : toutes les colonnes alignées d'une semaine à l'autre. L'origine trentenaire n'est plus comptée comme une obligation du vendeur. Alpha revient à droite de Connecté, et le bouton « Ajouter une obligation » respire enfin sous le panneau qui le précède" },
    { version: '2026-09-18 15:09', resume: "Huit points. L'adresse lue à l'étape « Vérifier » est enfin celle qui arrive à l'étape « Finaliser » : le vieux détecteur y écrivait un fragment brut que la lecture structurée n'osait plus corriger, le prenant pour votre saisie. Le dossier du NAS se relie désormais tout seul, sans clic, dès que le nom désigne un seul dossier client — à la création comme à l'ouverture de l'outil. « Rôle du notaire » et « Acte reçu par » disparaissent de la fiche : le badge « Reçoit l'acte » des deux notaires porte l'action, et le rôle de l'étude en est déduit. « Maître » précède les noms. Les échéances des 7 prochains jours ouvrent le dossier d'un clic. Les garanties ne sont plus cherchées que dans le paragraphe GARANTIES de l'offre — sans garanties, caution, hypothèque légale de prêteur de deniers, seule ou avec l'hypothèque conventionnelle — au lieu de ramasser toute mention d'hypothèque du document. Alpha passe au-dessus de Connecté. Enfin une passe d'alignement : les cinq tuiles du tableau de bord tiennent sur une seule ligne, les titres de section partagent un seul registre, les cartes un seul rayon, et les lignes d'échéance vont bien jusqu'au bord" },
    { version: '2026-09-18 13:37', resume: "Le notaire du vendeur et celui de l'acquéreur sont détectés à l'import et affichés sur la fiche, juste sous l'adresse et le prix — deux champs libres, corrigeables à tout moment. Quand l'acte ne dit pas qui représente qui (une simple comparution en tête d'acte), rien n'est deviné : les noms relevés restent proposés dans la liste déroulante du champ, à vous de les affecter. Un badge « Reçoit l'acte » marque le côté qui rédige, et une alerte s'affiche si ce côté contredit le rôle du notaire renseigné juste en dessous" },
    { version: '2026-09-18 12:59', resume: "Notaires : c'est la FORME de l'acte qui décide désormais où l'outil cherche leurs noms, plus son nom. Un acte authentique — dont la promesse synallagmatique, reçue par notaire — les nomme en première page ; un acte sous seing privé, en fin. Une promesse synallagmatique reste un compromis pour les rôles vendeur/acquéreur, ce qui est une autre question. Piège écarté : « la vente sera réitérée par acte authentique », qui remplit les compromis sous seing privé, ne les fait plus passer pour authentiques" },
    { version: '2026-09-18 12:56', resume: "Notaires : « celui qui a rédigé » est désormais reconnu comme tel — les formes du verbe rédiger (y compris « acte rédigé par », au passé) et « notaire rédacteur » désignent l'instrumentaire, « en concours » et « notaire concourant » le second. Et surtout, la clause d'ORIGINE DE PROPRIÉTÉ est enfin écartée : elle figure dans presque tous les avant-contrats, nomme le notaire de la vente PRÉCÉDENTE (« acquis suivant acte reçu par Maître X »), et désignait jusqu'ici le mauvais notaire avec la priorité la plus haute" },
    { version: '2026-09-18 12:53', resume: "Notaires : l'endroit où l'outil cherche leurs noms dépend désormais du type d'acte, comme vous l'avez précisé — première page pour une promesse de vente et ses dérivées, FIN D'ACTE pour un compromis. La version précédente appliquait la règle de la première page au compromis aussi, ce qui revenait à y lire des notaires cités à tout autre titre (origine de propriété, acte antérieur). Le premier nommé dans la bonne zone reçoit l'acte, le second participe — et si la zone attendue ne contient pas deux notaires, rien n'est tranché plutôt que de deviner" },
    { version: '2026-09-18 12:32', resume: "Onze corrections. Ouvrir un PDF du NAS ne renvoie plus « Authentification requise » (l'onglet était ouvert sans jeton de session). Le panneau de diagnostic ne se referme plus tout seul. L'offre de prêt est reconnue d'abord au NOM du fichier (offre de prêt, offre de crédit, contrat de prêt…), la lecture du contenu ne servant plus que de repli — toujours au-delà de 6 pages. Sur une promesse, les deux notaires nommés en tête de première page désignent l'instrumentaire puis le participant. Le dossier NAS proposé passe en tête de liste, avec une recherche au-dessus, et une correspondance exacte du nom relie le dossier sans rien demander. La vue « Échéances » (ex-« Semaines ») devient la vue par défaut et n'affiche plus qu'UNE ligne par dossier, sa prochaine échéance en attente ; une vente préalable peut être marquée réalisée pour passer à la suivante. Bouton d'ajout d'obligation déplacé sous l'analyse juridique, filet retiré sous « En retard », badge Alpha aligné à droite sous le logo et tagline retirée" },
    { version: '2026-09-18 12:21', resume: "Panneau « Ce que l'outil a compris » repris en entier. Chaque donnée est maintenant CORRIGEABLE SUR PLACE, sans quitter l'écran où l'erreur se voit, et porte le numéro de page d'où elle sort (nom, adresse et prix n'en avaient aucun). L'outil n'annonce plus rien comme « Confirmé » : il dit seulement d'où vient la donnée — lue dans l'acte, calculée depuis un délai, apprise d'une correction précédente, proposée par l'IA — et le vert est réservé à ce que VOUS cochez comme vérifié. Les lectures du modèle local, qui invente régulièrement des termes, sont désormais proposées avec un bouton « Utiliser » et n'écrivent plus jamais d'elles-mêmes dans un champ" },
    { version: '2026-09-18 12:04', resume: "Création de dossier depuis un PDF : quatre corrections. Le nom du dossier prenait la COMMUNE de l'adresse au lieu du patronyme (« BLOIS / TOURS » au lieu de « DUPONT / MARTIN ») sur la rédaction la plus courante, celle où la partie est présentée puis étiquetée ; un acte à deux vendeurs (« ci-après dénommés LES VENDEURS ») n'était pas reconnu du tout. L'adresse du bien avalait la désignation cadastrale en la tronquant, et n'était pas détectée quand « sis » introduit directement l'adresse sans préposition. Enfin, une date de prêt exprimée en jours était bien calculée mais jamais reportée dans le champ quand seule l'intitulé de la clause nommait le prêt" },
    { version: '2026-09-18 10:16', resume: "Le serveur ne disparaît plus en silence au démarrage : jusqu'ici, une faute de frappe dans config.json (typiquement un chemin réseau écrit avec des antislashs simples au lieu de doublés) faisait clignoter la fenêtre puis plus rien, sans la moindre explication. Le message est maintenant affiché, la fenêtre reste ouverte le temps de le lire, et il est enregistré dans erreur-demarrage.txt à côté de l'exécutable. Même traitement si le port est déjà occupé, avec le rappel qu'un serveur tourne peut-être déjà sans fenêtre visible" },
    { version: '2026-09-18 08:30', resume: "Les dossiers clients du NAS sont désormais lus par le SERVEUR, plus par le navigateur : tous les postes connectés par l'adresse IP peuvent enfin relier un dossier et ouvrir ses pièces, ce qui était impossible jusqu'ici. Plus aucune autorisation à reconfirmer au démarrage (la popup, le bandeau et le bouton groupé disparaissent avec le problème), un dossier relié depuis un poste l'est pour tout le monde, le dossier du NAS est proposé automatiquement d'après le nom du dossier, et un bouton « Revérifier tous les dossiers » relance le parcours en une fois. À configurer une fois : « nasRacine » dans config.json" },
    { version: '2026-09-18 08:15', resume: "Offre de prêt reconnue autrement : l'outil rouvre les PDF du dossier, écarte tout document de moins de 6 pages, lit le TITRE de la page de garde (et lui seul) puis fait confirmer par le modèle IA local qu'il s'agit bien d'une offre ou d'un contrat de prêt — sans ce modèle, le document trouvé passe en « À confirmer », distinct de « Reçue ». La ou les garanties du prêt (caution, hypothèque légale de prêteur de deniers, hypothèque conventionnelle) sont relevées au passage et affichées dans la carte « Obtention du prêt »" },
    { version: '2026-09-18 08:10', resume: "L'avant-contrat rouvert depuis une fiche est désormais celui réellement importé à la création du dossier — le nom du fichier est mémorisé, la recherche par les mots « compromis »/« promesse » ramenait souvent l'avant-contrat de la vente préalable rangé dans le même dossier. Et TOUS les documents identifiés dans l'analyse juridique (entretien, travaux, attestations…) sont maintenant recherchés dans le dossier local comme les pièces d'urbanisme, y compris sur les dossiers déjà créés" },
    { version: '2026-09-18 08:00', resume: "Nouvel onglet « Prorata & répartitions » : répartit entre vendeur et acquéreur une taxe foncière annuelle, des charges de copropriété au trimestre ou au mois, ou un loyer mensuel — jours réels, jour de l'acte à la charge de l'acquéreur, les deux parts totalisant toujours la somme appelée au centime près" },
    { version: '2026-09-18 07:55', resume: "Nouvelle vue « Semaines » dans le Suivi : les mêmes dossiers regroupés par semaine d'échéance, une ligne par échéance — un dossier figure donc sous chaque semaine où il a quelque chose à traiter, avec un groupe « En retard » en tête. Le tableau peut aussi être trié par statut" },
    { version: '2026-09-18 07:52', resume: "Retouches d'affichage : champs de recherche du Suivi et du Tableau de bord aux mêmes coins arrondis, espace vide supprimé au-dessus de la croix de fermeture d'une fiche, et page « Nouveau dossier » corrigée sur téléphone — la zone d'import repasse au-dessus du descriptif, les deux blocs prennent toute la largeur, et les quatre étapes du wizard ne débordent plus de l'écran" },
    { version: '2026-09-18 01:52', resume: "L'IA locale relit l'acte en trois passes ciblées (parties et notaires / bien et prix / échéances) au lieu d'une seule : chaque valeur qu'elle propose est vérifiée en retrouvant sa citation dans le PDF, jamais retenue sur sa seule affirmation ; quand elle contredit la détection automatique, c'est cette dernière qui reste, l'écart étant signalé dans le panneau plutôt que tranché en silence ; un délai qu'elle rapporte est calculé par l'outil, jamais par elle" },
    { version: '2026-09-18 01:42', resume: "La fiche d'un dossier garde désormais la trace de ce que l'outil avait compris de l'acte à l'import (type d'acte, parties et leurs rôles, notaires, cadastre, statut de chaque donnée) : nouveau panneau « Ce que l'outil avait compris de l'acte », replié, sous l'analyse juridique — conservé aussi lors d'un export/import de sauvegarde" },
    { version: '2026-09-18 01:37', resume: "Nouveau panneau « Ce que l'outil a compris » à l'étape Vérifier : type d'acte, parties et leurs rôles, adresse et cadastre du bien, notaires (dont celui qui reçoit l'acte) et chaque date avec son statut (confirmé / à vérifier / non trouvé), sa provenance et sa page ; alertes de cohérence (prêt après l'acte, date écrite contredite par un délai, adresse incomplète…) rappelées avant d'enregistrer ; le rôle de l'étude est pré-rempli quand le document le dit clairement" },
    { version: '2026-09-18 01:21', resume: "Noms de dossier corrigés : le type d'acte (compromis / promesse de vente / promesse d'achat) est désormais déterminé avant d'attribuer les rôles — dans une promesse d'achat le promettant est l'ACQUÉREUR, les deux parties étaient jusqu'ici interverties ; « L'ACQUÉREUR » ne ramène plus le nom du vendeur ; plusieurs vendeurs et les SCI (avec leur représentant) sont conservés" },
    { version: '2026-09-18 00:41', resume: "Couleurs acte/vente préalable échangées (acte en vert, vente en bleu) ; l'IA locale du wizard recopie désormais les clauses mot pour mot ; ajout/édition d'une obligation du vendeur directement sur une fiche déjà enregistrée ; colonnes du Suivi réordonnées (offre de prêt avant prochaine échéance) ; badge Alpha redescendu sous le logo, remplacé en haut à droite par l'indicateur de connexion au serveur" },
    { version: '2026-09-15 14:25', resume: "Apprentissage : une pièce mal reconnue et réinitialisée n'est plus jamais reproposée pour cette pièce (sur aucun dossier) ; une clause ajoutée manuellement comme engagement du vendeur enrichit aussi la détection automatique des prochains imports" },
    { version: '2026-09-15 14:13', resume: "Champ de recherche dans l'aperçu PDF (comme Ctrl+F d'un lecteur PDF), navigation résultat suivant/précédent" },
    { version: '2026-09-15 14:02', resume: "Retours de test du matin : indicateur de connexion serveur (sidebar), achat comptant affiché clairement (plus de \"Non renseigné\"), ajout manuel d'un engagement du vendeur sans sélection PDF, catégorie \"Autres\" pour les engagements, indicateur pendant la recherche IA" },
    { version: '2026-09-14 20:26', resume: "Le wizard « Nouveau dossier » utilise aussi l'IA locale en arrière-plan : complète nom/adresse/prix/dates non trouvés par les regex et suggère des engagements du vendeur en plus, jamais en remplacement" },
    { version: '2026-09-14 20:11', resume: "Nouvel onglet « Analyse approfondie (IA) » : dépose l'acte + ses annexes séparées, relecture croisée par un modèle IA local (Ollama, aucune donnée envoyée en ligne) — voir server/README.md" },
    { version: '2026-09-14 19:27', resume: "Vrai correctif du bug apostrophe (Certificat d'urbanisme/d'alignement) : le précédent (&#39;) ne survivait pas au décodage HTML de l'attribut onclick, toujours cassé en pratique" }
  ];

  const STORAGE_KEY = 'dossiers';
  let dossiers = [];
  let detectedDates = []; // {iso, label, contexte, suggestion}
  let autresEnCours = []; // {id, label, iso, active}
  let dateCompromisDetectee = '';
  let dateCompromisEstimee = false;
  let dernierTexteTraite = '';
  let compteurAutre = 0;
  let echeanceActive = { pret: true, acte: true, ventebien: false };
  let pdfActuel = null;
  let pdfDernierePageUtile = 1;
  // Nom EXACT du fichier PDF importé pour créer le dossier (jamais le PDF lui-même, qui n'est pas
  // conservé — voir CLAUDE.md). Enregistré sur le dossier (d.compromisNomFichier) et utilisé par
  // ouvrirCompromisTrouve() pour rouvrir le bon avant-contrat : signalé par l'étude, la recherche
  // floue "compromis"/"promesse" ramenait souvent l'avant-contrat d'une VENTE PRÉALABLE, rangé
  // dans le même dossier local et portant lui aussi ces mots dans son nom.
  let compromisNomFichierImporte = '';
  let frontieresPagesActuelles = null; // découpage du texte concaténé par page, pour retrouver la page d'une date
  let pageParType = { pret: null, acte: null, ventebien: null }; // page où chaque échéance a été repérée
  // Vrai quand la date pré-remplie a été choisie parmi plusieurs candidates de même catégorie sans
  // formulation de délai permettant de trancher (voir meilleureCandidateEcheance) — confiance
  // "incertain" plutôt que "auto" au moment d'enregistrer le dossier.
  let ambiguiteParType = { pret: false, acte: false, ventebien: false };
  // Vrai quand la date pré-remplie a été calculée à partir d'une formulation approximative
  // ("fin septembre 2026", "délai de 30 jours à compter de la signature", "J+30") plutôt que lue
  // telle quelle — confiance "estime" plutôt que "auto" (voir detecterDatesDepuisTexte).
  let approxParType = { pret: false, acte: false, ventebien: false };
  let analyseJuridiqueActuelle = { documents: [], engagements: [], conditions: [] };
  // Incrémenté à chaque nouvel import (traiterFichierPdf) et à chaque reset du formulaire
  // (reinitialiserFormulaire) — permet à lancerExtractionIa() de vérifier, une fois sa réponse
  // reçue, qu'elle porte encore sur l'import en cours plutôt que sur un import précédent déjà
  // enregistré ou abandonné (l'appel au LLM local peut prendre plusieurs dizaines de secondes).
  let generationImportActuel = 0;

  // ---- icônes ----
  // Un seul jeu d'icônes, dessiné à la main, pour toute l'application — remplace les emoji semés
  // au fil des évolutions successives (🔥 🔒 ⚠️ 📄 ✉️ 🔗 💰 📍 🧠 👁 📋 🤝 ☰ ⏳...), qui n'ont ni la
  // même épaisseur de trait ni le même style entre eux et changent de dessin d'un système
  // d'exploitation à l'autre. Grille 16x16, trait 1.4, extrémités arrondies — même recette que
  // iconeCalendrierSeuil() (déjà en place, voir plus bas) pour ne pas juxtaposer deux langages
  // graphiques. Dimensionnées en 1em (voir .icone dans style.css) : une icône suit la taille de
  // police du texte/bouton qui la contient, sans réglage au cas par cas à chaque usage.
  const ICONES = {
    layout: '<rect x="1.5" y="2" width="13" height="12" rx="1.6"/><line x1="6" y1="2" x2="6" y2="14"/>',
    plus: '<line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>',
    list: '<circle cx="2.3" cy="4" r="0.9" fill="currentColor" stroke="none"/><line x1="5.4" y1="4" x2="14" y2="4"/><circle cx="2.3" cy="8" r="0.9" fill="currentColor" stroke="none"/><line x1="5.4" y1="8" x2="14" y2="8"/><circle cx="2.3" cy="12" r="0.9" fill="currentColor" stroke="none"/><line x1="5.4" y1="12" x2="14" y2="12"/>',
    menu: '<line x1="2.4" y1="4.5" x2="13.6" y2="4.5"/><line x1="2.4" y1="8" x2="13.6" y2="8"/><line x1="2.4" y1="11.5" x2="13.6" y2="11.5"/>',
    download: '<path d="M8 2v8"/><path d="M4.5 7 8 10.5 11.5 7"/><path d="M3 13.5h10"/>',
    sun: '<circle cx="8" cy="8" r="3"/><line x1="8" y1="1.2" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="14.8"/><line x1="1.2" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="14.8" y2="8"/><line x1="3.3" y1="3.3" x2="4.5" y2="4.5"/><line x1="11.5" y1="11.5" x2="12.7" y2="12.7"/><line x1="3.3" y1="12.7" x2="4.5" y2="11.5"/><line x1="11.5" y1="4.5" x2="12.7" y2="3.3"/>',
    moon: '<path d="M13.6 9.9A5.8 5.8 0 1 1 6.1 2.4a4.6 4.6 0 0 0 7.5 7.5Z" stroke-linejoin="round"/>',
    search: '<circle cx="7" cy="7" r="4.3"/><line x1="10.2" y1="10.2" x2="14" y2="14"/>',
    'alert-triangle': '<path d="M8 2.3 14.4 13.2a0.9 0.9 0 0 1-0.8 1.3H2.4a0.9 0.9 0 0 1-0.8-1.3L8 2.3Z" stroke-linejoin="round"/><line x1="8" y1="6" x2="8" y2="9.3"/><circle cx="8" cy="11.5" r="0.8" fill="currentColor" stroke="none"/>',
    'file-text': '<path d="M4 2h5.5L12 4.5V14H4Z" stroke-linejoin="round"/><path d="M9.5 2v2.5H12"/><line x1="6" y1="8" x2="10" y2="8"/><line x1="6" y1="10.5" x2="9" y2="10.5"/>',
    mail: '<rect x="1.4" y="3.5" width="13.2" height="9" rx="1.4"/><path d="M2 4.3 8 9l6-4.7"/>',
    calendar: '<rect x="1.5" y="2.8" width="13" height="11.2" rx="1.7"/><rect x="1.5" y="2.8" width="13" height="3" rx="1" fill="currentColor" opacity="0.22" stroke="none"/><line x1="4.6" y1="1.3" x2="4.6" y2="3.6"/><line x1="11.4" y1="1.3" x2="11.4" y2="3.6"/>',
    link: '<path d="M6.6 9.4 9.4 6.6"/><path d="M7 4.2 8.3 2.9a2.6 2.6 0 0 1 3.7 3.7L9.7 8"/><path d="M9 11.8 7.7 13.1a2.6 2.6 0 0 1-3.7-3.7L6.3 8"/>',
    eye: '<path d="M1.3 8S3.8 3.3 8 3.3 14.7 8 14.7 8 12.2 12.7 8 12.7 1.3 8 1.3 8Z" stroke-linejoin="round"/><circle cx="8" cy="8" r="2.1"/>',
    folder: '<path d="M1.6 4.3a1 1 0 0 1 1-1h3.2l1.3 1.6h6.3a1 1 0 0 1 1 1v7.2a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1V4.3Z" stroke-linejoin="round"/>',
    clipboard: '<rect x="3" y="2.8" width="10" height="11.7" rx="1.4"/><rect x="5.8" y="1.5" width="4.4" height="2.3" rx="0.8" fill="currentColor" stroke="none"/><line x1="5.5" y1="7.5" x2="10.5" y2="7.5"/><line x1="5.5" y1="10" x2="10.5" y2="10"/>',
    sparkle: '<path d="M8 1.8 9 6l4.2 1-4.2 1L8 12.2 7 8 2.8 7 7 6 8 1.8Z" stroke-linejoin="round"/>',
    lock: '<rect x="3.3" y="7.2" width="9.4" height="7" rx="1.4"/><path d="M5.3 7.2V5a2.7 2.7 0 0 1 5.4 0v2.2"/>',
    upload: '<path d="M8 10.3V2.3"/><path d="M4.6 5.7 8 2.3l3.4 3.4"/><path d="M2.4 13.5h11.2"/>',
    key: '<circle cx="5.2" cy="5.2" r="2.8"/><path d="M7.2 7.2 13.5 13.5"/><path d="M11 10 12.6 8.4"/>',
    spinner: '<path d="M14 8a6 6 0 1 1-2-4.5"/>',
    banknote: '<rect x="1.3" y="4.3" width="13.4" height="7.4" rx="1.4"/><circle cx="8" cy="8" r="1.9"/>',
    'map-pin': '<path d="M8 14.3S13 9.7 13 6.2A5 5 0 0 0 3 6.2C3 9.7 8 14.3 8 14.3Z" stroke-linejoin="round"/><circle cx="8" cy="6.2" r="1.7"/>',
    pencil: '<path d="M11.1 2.3a1.5 1.5 0 0 1 2.1 2.1L5.4 12.2l-2.9.7.7-2.9 7.9-7.7Z" stroke-linejoin="round"/>',
    x: '<line x1="3.5" y1="3.5" x2="12.5" y2="12.5"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/>',
    check: '<path d="M3 8.4 6.4 11.8 13 4.6" stroke-linejoin="round"/>',
    'trend-up': '<path d="M2.5 12 6.8 7.7 9.3 10.2 13.5 6"/><path d="M9.5 6h4v4"/>',
    'trend-down': '<path d="M2.5 4 6.8 8.3 9.3 5.8 13.5 10"/><path d="M9.5 10h4v-4"/>',
    info: '<circle cx="8" cy="8" r="6.2"/><line x1="8" y1="7.2" x2="8" y2="11.3"/><circle cx="8" cy="4.9" r="0.9" fill="currentColor" stroke="none"/>',
    'chevron-down': '<path d="M3.5 6 8 10.5 12.5 6"/>',
    'chevron-up': '<path d="M3.5 10 8 5.5 12.5 10"/>',
    'rotate-ccw': '<path d="M13.3 8A5.3 5.3 0 1 1 10.8 3.4"/><path d="M13.6 2.6v3.6h-3.6"/>',
    // Prorata : un disque coupé en deux parts inégales — une somme répartie entre deux parties.
    // Même grille 16x16 et même trait que le reste du jeu.
    'part-disque': '<circle cx="8" cy="8" r="5.6"/><path d="M8 2.4V8l4 3.8"/>',
    // Réglages : un engrenage simplifié (cercle + 4 dents), même trait que le reste du jeu.
    settings: '<circle cx="8" cy="8" r="2.3"/><path d="M8 1.6v2M8 12.4v2M14.4 8h-2M3.6 8h-2M12.4 3.6l-1.4 1.4M5 9.6l-1.4 1.4M12.4 12.4l-1.4-1.4M5 6.4 3.6 5"/>'
  };
  // `cls` porte les classes de mise en page (taille via font-size hérité, marge...) ; `spin` anime
  // une rotation continue (voir @keyframes icone-spin) pour les icônes d'attente (ex. "spinner").
  function icone(nom, cls, spin) {
    const chemin = ICONES[nom];
    if (!chemin) return '';
    return `<svg class="icone${cls ? ' ' + cls : ''}${spin ? ' icone-spin' : ''}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${chemin}</svg>`;
  }

  const MOIS = {
    'janvier':0,'février':1,'fevrier':1,'mars':2,'avril':3,'mai':4,'juin':5,
    'juillet':6,'août':7,'aout':7,'septembre':8,'octobre':9,'novembre':10,
    'décembre':11,'decembre':11
  };

  function pad(n) { return String(n).padStart(2, '0'); }

  function toISO(y, mIndex, d) {
    return `${y}-${pad(mIndex+1)}-${pad(d)}`;
  }

  function extraireDateDeFragment(str) {
    let m = str.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) {
      const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return toISO(y, mo - 1, d);
    }
    const moisNoms = Object.keys(MOIS).join('|');
    // (?:er)? : le 1er jour du mois s'écrit toujours en ordinal ("le 1er janvier"), jamais "le 1
    // janvier" — sans ce groupe, cette date très fréquente en tête de compromis n'était jamais
    // reconnue.
    const re2 = new RegExp(`(\\d{1,2})(?:er)?\\s+(${moisNoms})\\s+(\\d{4})`, 'i');
    m = str.match(re2);
    if (m) {
      const d = parseInt(m[1], 10);
      const moKey = m[2].toLowerCase();
      const y = parseInt(m[3], 10);
      if (MOIS.hasOwnProperty(moKey)) return toISO(y, MOIS[moKey], d);
    }
    return null;
  }

  // ---- date écrite entièrement en lettres (en-tête d'un acte authentique) ----
  //
  // Tout acte reçu par notaire s'ouvre par sa date en toutes lettres, et par elle seule :
  //     L'AN DEUX MILLE VINGT-SIX,
  //     Le VINGT TROIS JUILLET
  // C'est le marqueur de date le plus fiable qui soit sur cette famille d'actes — il est imposé
  // par la forme authentique — et il n'était pas reconnu du tout. Sur le corpus, deux actes en
  // renvoient même explicitement à l'en-tête pour leur date (« … aux lieu, jour, mois et an
  // indiqués en en-tête du présent acte »), leur bloc de signature n'en portant aucune.
  var MOTS_NOMBRES = {
    zero: 0, un: 1, une: 1, premier: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
    huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15,
    seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
    cent: 100, cents: 100, mille: 1000
  };

  // « VINGT TROIS » = 23, « DIX-SEPT » = 17, « TRENTE ET UN » = 31, « DEUX MILLE VINGT-SIX » = 2026.
  // Renvoie null dès qu'un mot n'est pas un nombre : mieux vaut ne rien lire qu'inventer une date.
  function nombreFrancaisEnChiffres(texte) {
    const mots = String(texte || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/[\s-]+/)
      .filter(mot => mot && mot !== 'et');
    if (!mots.length) return null;
    let total = 0;
    let courant = 0;
    for (const mot of mots) {
      const valeur = MOTS_NOMBRES[mot];
      if (valeur === undefined) return null;
      if (valeur === 1000) { total += (courant || 1) * 1000; courant = 0; }
      else if (valeur === 100) { courant = (courant || 1) * 100; }
      else courant += valeur;
    }
    return total + courant;
  }

  // L'année et le jour sont lus en DEUX TEMPS, et non par un seul motif : en une seule passe, le
  // groupe de l'année (paresseux, et fait des mêmes caractères que le reste) pouvait avaler le
  // « LE » de la ligne suivante quand aucune virgule ne les séparait — l'année devenait « DEUX
  // MIL », le jour « VINGT-CINQ LE DIX-SEPT », et la date entière était perdue. L'année s'arrête
  // donc à la fin de sa ligne (ou à sa virgule), et le jour est cherché juste après.
  var RE_AN_EN_LETTRES = /l['’]an\s+([A-Za-zÀ-ÿ\s-]{5,45}?)\s*(?=[,.\n])/i;
  var RE_JOUR_MOIS_EN_LETTRES = new RegExp(
    '\\ble\\s+([A-Za-zÀ-ÿ\\s-]{3,30}?)\\s+(' + Object.keys(MOIS).join('|') + ')\\b',
    'i'
  );
  var PORTEE_JOUR_APRES_AN = 120;

  function detecterDateEnToutesLettres(texte) {
    const source = String(texte || '');
    const mAn = RE_AN_EN_LETTRES.exec(source);
    if (!mAn) return null;
    const annee = nombreFrancaisEnChiffres(mAn[1]);
    if (annee === null || annee < 1900 || annee > 2200) return null;
    const apresAn = mAn.index + mAn[0].length;
    const mJour = RE_JOUR_MOIS_EN_LETTRES.exec(source.slice(apresAn, apresAn + PORTEE_JOUR_APRES_AN));
    if (!mJour) return null;
    const jour = nombreFrancaisEnChiffres(mJour[1]);
    const mois = MOIS[mJour[2].toLowerCase()];
    if (jour === null || jour < 1 || jour > 31 || mois === undefined) return null;
    return toISO(annee, mois, jour);
  }

  // Détecte automatiquement la date de signature du compromis lui-même (qui peut être électronique,
  // avec une date par partie : on retient alors la plus récente), pour écarter ensuite tout ce qui
  // lui est antérieur (diagnostics, actes précédents…).
  function detecterDateCompromis(texte) {
    const patterns = [
      // [^,.\n] (et non [^,\n]) dans les groupes qui précèdent un "le" obligatoire : un nom de lieu
      // ou une clause courte ne contient jamais de point, alors qu'un [^,\n] permissif laisse le
      // moteur de regex backtracker À TRAVERS une phrase entière pour aller chercher un "le" plus
      // loin dans le texte (ex. « ... à compter de la signature. Le vendeur s'engage... ») — cas
      // réel rencontré : le motif "a signé" ci-dessous capturait alors "vendeur s'engage à produire
      // ce document" comme si c'était la date de signature, un bug bien pire que ne rien détecter.
      /fait\s+(?:à|a)\s+[^,.\n]{0,60},?\s*le\s+([^\n,.;]{6,40})/gi,
      /le\s+pr[ée]sent\s+(?:compromis|promesse)(?:\s+de\s+vente)?\s+(?:est\s+)?(?:sign[ée]|[ée]tabli|conclu)\s+(?:à\s+[^,.\n]{0,40},?\s*)?le\s+([^\n,.;]{6,40})/gi,
      /(?:compromis|promesse)\s+de\s+vente\s+en\s+date\s+du\s+([^\n,.;]{6,40})/gi,
      /sign[ée]\s+[ée]lectroniquement\s+le\s+([^\n,.;]{6,40})/gi,
      /date\s+de\s+signature(?:\s+[ée]lectronique)?\s*:?\s*([^\n,.;]{6,40})/gi,
      /derni[èe]re\s+signature\s+(?:le\s+)?([^\n,.;]{6,40})/gi,
      // Bloc de signature électronique par partie (Yousign/DocuSign) qui ne nomme ni "compromis" ni
      // "promesse" ni le mot "électroniquement" : "Mme X a signé à BLOIS le 22 juillet 2026",
      // répété une fois par signataire. Cas réel : sans ce motif, aucune des dates ci-dessus ne
      // matchait, et `dateCompromis` restait vide — désactivant le filtre "écarte tout ce qui est
      // antérieur à la signature" pour tout le reste de l'extraction (voir detecterDatesDepuisTexte).
      /\ba\s+sign[ée]\s+(?:[àa]\s+[^,.\n]{0,40}\s+)?le\s+([^\n,.;]{6,40})/gi
    ];
    const dates = [];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(texte)) !== null) {
        const iso = extraireDateDeFragment(m[1]);
        if (iso) dates.push(iso);
      }
    }
    // Repli : la date en toutes lettres de l'en-tête d'un acte authentique (voir
    // detecterDateEnToutesLettres). Volontairement en REPLI et non en premier : quand un bloc de
    // signature porte une date explicite, c'est lui qui fait foi — l'en-tête peut avoir été
    // préparé avant la signature effective.
    if (dates.length === 0) return detecterDateEnToutesLettres(texte);
    // Signature électronique = une date par partie : on retient la plus récente (dernière signature).
    dates.sort();
    return dates[dates.length - 1];
  }

  // Repère une éventuelle mention d'un achat sans recours à un prêt.
  // Attention : "paiement comptant" seul est un FAUX AMI — cette formule désigne presque toujours
  // le règlement du solde en une fois à la signature de l'acte, pas l'absence de prêt.
  // On ne se fie donc qu'à des marqueurs juridiques non ambigus (dont la renonciation Scrivener).
  const CASH_RE = /ne\s+recourt?\s+pas\s+[àa]\s+(?:un\s+)?(?:pr[êe]t|emprunt)|sans\s+recours\s+[àa]\s+(?:un\s+)?(?:pr[êe]t|emprunt)|sans\s+financement\s+bancaire|sans\s+condition\s+suspensive\s+d.obtention\s+de\s+pr[êe]t|renonce\s+(?:express[ée]ment\s+)?au\s+b[ée]n[ée]fice\s+(?:des\s+dispositions\s+)?de\s+l.article\s*l\.?\s*313|d[ée]clare\s+ne\s+pas\s+recourir\s+[àa]\s+(?:un\s+)?(?:pr[êe]t|emprunt)|financement\s+(?:se\s+fera|r[ée]alis[ée])\s+(?:exclusivement\s+)?(?:sur|par)\s+(?:ses\s+)?fonds\s+propres/i;

  function detecterFinancementComptant(texte) {
    return CASH_RE.test(texte);
  }

  // Marqueurs juridiques propres à une vente de lot en copropriété (statut de la loi du 10 juillet
  // 1965), plutôt qu'une simple mention isolée de "copropriété" qui pourrait apparaître pour
  // d'autres raisons (ex. un diagnostic mentionnant un immeuble voisin).
  // Bug corrigé : signalé par l'étude, une vraie vente de lot restait classée "maison" par défaut
  // — la formulation la plus courante ("soumis au régime de la copropriété", juste avant la mention
  // du lot sous le tableau parcellaire) n'était pas reconnue, seul "statut de la copropriété"
  // l'était. "régime de la copropriété" ajouté en conséquence.
  const COPROPRIETE_RE = /lot\s+(?:de\s+)?copropri[ée]t[ée]|r[èe]glement\s+de\s+copropri[ée]t[ée]|syndicat\s+des\s+copropri[ée]taires|[ée]tat\s+descriptif\s+de\s+division|(?:statut|r[ée]gime)\s+de\s+la\s+copropri[ée]t[ée]|loi\s+(?:n[°ºo]\s*)?65-557|loi\s+du\s+10\s+juillet\s+1965/i;

  // Bug corrigé : signalé par l'étude, une vraie maison individuelle (pas de division en lots)
  // ressortait classée "copropriété". La désignation d'une maison comporte très souvent une clause
  // qui écarte explicitement ce statut, précisément pour lever toute ambiguïté — ex. « Le bien
  // vendu n'est pas soumis au statut de la copropriété » — et cette négation contient elle-même le
  // motif recherché par COPROPRIETE_RE, qui se déclenchait donc à tort. À l'inverse, une vraie
  // copropriété décrit le bien par son numéro de lot ET sa quote-part de parties communes
  // (tantièmes/millièmes) — une maison n'a ni l'un ni l'autre. Vérifie donc, pour chaque occurrence
  // de COPROPRIETE_RE, qu'elle n'est pas précédée d'une formule de négation.
  // Le PARTICIPE PRÉSENT (« ne relevANT pas du statut de la copropriété ») manquait, alors que
  // c'est la forme la plus courante de cette clause de style dans les actes réels du corpus.
  const NEGATION_COPROPRIETE_RE = /(?:n['’]est|n['’]en\s+est|ne\s+sont)\s+pas\s+soumis|non\s+soumis|ne\s+rel[èe]v(?:e|ent|ant)\s+pas|ne\s+d[ée]pend(?:ent|ant)?\s+pas|hors\s+copropri[ée]t[ée]|[àa]\s+l['’]exclusion\s+du\s+statut/i;

  // Une mention CONDITIONNELLE (« … au Syndicat des copropriétaires s'il y a lieu ») ne dit rien
  // du bien vendu : c'est une clause de style qui prévoit le cas où il y en aurait un. Elle
  // faisait passer une maison individuelle pour une copropriété.
  const CONDITIONNEL_COPROPRIETE_RE = /^\s*(?:s['’]il\s+y\s+a\s+lieu|le\s+cas\s+[ée]ch[ée]ant|[ée]ventuel)/i;

  // Fenêtre élargie à 140 caractères : la négation et le motif sont souvent séparés par la
  // référence complète du texte de loi (« ne relevant pas de la loi n° 65-557 du 10 juillet 1965
  // fixant le statut de la copropriété »), qui à elle seule dépasse les 60 caractères d'origine.
  var FENETRE_NEGATION_COPROPRIETE = 140;
  var FENETRE_CONDITIONNEL_COPROPRIETE = 30;

  // Une négation cesse de porter à la fin de sa phrase, et surtout à l'adversative qui la
  // contredit : « Ce lotissement n'est pas soumis au statut de la copropriété …, MAIS le bien
  // vendu constitue le lot de copropriété numéro 3 ». Sans cette borne, élargir la fenêtre pour
  // laisser passer une référence de loi complète faisait retomber la négation sur la mention
  // positive qui la suit.
  var RE_FIN_PORTEE_NEGATION = /[.\n;]|\bmais\b|\btoutefois\b|\ben\s+revanche\b|\bcependant\b|\bn[ée]anmoins\b/gi;

  function porteeNegation(avant) {
    const re = new RegExp(RE_FIN_PORTEE_NEGATION.source, 'gi');
    let coupure = 0;
    let m;
    while ((m = re.exec(avant)) !== null) coupure = m.index + m[0].length;
    return avant.slice(coupure);
  }

  function detecterTypeVenteCopropriete(texte) {
    const re = new RegExp(COPROPRIETE_RE.source, 'gi');
    let m;
    while ((m = re.exec(texte)) !== null) {
      const avant = porteeNegation(texte.slice(Math.max(0, m.index - FENETRE_NEGATION_COPROPRIETE), m.index));
      if (NEGATION_COPROPRIETE_RE.test(avant)) continue;
      const apres = texte.slice(m.index + m[0].length, m.index + m[0].length + FENETRE_CONDITIONNEL_COPROPRIETE);
      if (CONDITIONNEL_COPROPRIETE_RE.test(apres)) continue;
      return true;
    }
    return false;
  }

  // Adresse du bien : ancrée sur un code postal français (5 chiffres, marqueur fiable et rare
  // ailleurs dans l'acte) précédé de "sis(e) à/au" ou "situé(e) à/au/dans la commune de" — les
  // tournures notariales courantes pour introduire la désignation du bien. Capture tout le
  // fragment jusqu'au code postal puis un peu après (ville), sans dépasser la phrase (borne au
  // point suivant, comme extraireContexte) : un premier jet, pas encore confronté à de vrais
  // compromis autres que ceux déjà vus pour les dates/engagements — à resserrer si un vrai dossier
  // fait remonter un faux positif ou une capture tronquée.
  // Deux formes notariales, qui demandent deux traitements OPPOSÉS de la virgule — d'où
  // l'alternance plutôt qu'un motif unique :
  //  - « sis à ORLEANS (45000), 12 rue de la République » : code postal entre PARENTHÈSES, commune
  //    d'abord, la rue vient APRÈS la virgule — il faut donc la franchir pour ne pas perdre la rue.
  //  - « sise à 14 rue du Moulin 41100 VENDOME, cadastrée section AB numéro 245 » : code postal nu,
  //    la commune termine l'adresse — tout ce qui suit la virgule appartient à la phrase, pas à
  //    l'adresse. Sans cette borne, les 40 caractères pris après le code postal avalaient la
  //    désignation cadastrale ET la tronquaient en plein numéro de parcelle (« numéro 24 »),
  //    faute de place : la fiche affichait un mélange des deux, systématiquement coupé.
  // La forme parenthésée est essayée en premier ; elle ne peut pas matcher la seconde (aucun code
  // postal entre parenthèses), donc l'ordre ne crée pas d'ambiguïté.
  // La préposition est OPTIONNELLE : « un immeuble sis 22 boulevard Gambetta 41000 BLOIS » est une
  // rédaction notariale des plus courantes, où « sis » introduit directement l'adresse sans « à ».
  // Elle était jusqu'ici exigée, et ces désignations-là n'étaient pas détectées du tout — l'adresse
  // restait vide sur la fiche. « sur la commune de » et « se trouvant à » manquaient de même.
  // Le point d'ancrage réel reste le CODE POSTAL, dans la même phrase : c'est lui qui borne la
  // capture, la préposition ne faisait que restreindre inutilement les formulations acceptées.
  const ADRESSE_BIEN_RE = /(?:sis|sise|situ[ée]e?|se\s+trouvant)\s+(?:(?:[àa]|au|sur\s+la\s+commune\s+de|dans\s+la\s+commune\s+de|commune\s+de)\s+)?((?:[^.\n]{3,120}?\(\d{5}\)[^.]{0,40})|(?:[^.\n]{3,120}?\d{5}[^.,;]{0,40}))/i;

  function detecterAdresseBien(texte) {
    const m = ADRESSE_BIEN_RE.exec(texte);
    if (!m) return null;
    return m[1].replace(/\s+/g, ' ').trim().replace(/[,\s]+$/, '');
  }

  // Prix de vente : le montant en lettres est presque toujours suivi de sa forme chiffrée entre
  // parenthèses (usage notarial constant, ex. "CENT MILLE EUROS (100 000 €)") — bien plus fiable à
  // parser que le nombre écrit en toutes lettres. Cherche "prix" puis, dans les 120 caractères
  // suivants (hors point/retour à la ligne, pour rester dans la même clause), un montant entre
  // parenthèses suivi de €/euros.
  // Deux corrections après un vrai acte où le prix n'était pas détecté du tout
  // (« … le prix de QUATRE-\nVINGT-DOUZE MILLE EUROS (92  000,00 EUR) ») :
  //  - le retour à la ligne n'est plus exclu. Il l'était pour « rester dans la même clause », mais
  //    un texte extrait d'un PDF est coupé à chaque ligne de mise en page : c'était exclure le cas
  //    normal. Le point reste exclu, et c'est lui qui borne réellement la clause.
  //  - « EUR » est accepté au même titre que « € » et « euros » : c'est la forme qu'emploient les
  //    trames notariales dans la reprise chiffrée entre parenthèses.
  const PRIX_VENTE_RE = /prix[^(.]{0,120}\(\s*([\d](?:[\d\s.]{0,14})?(?:,\d{2})?)\s*(?:€|eur(?:os?)?\b)\s*\.?\s*\)/i;

  function detecterPrixVente(texte) {
    const m = PRIX_VENTE_RE.exec(texte);
    if (!m) return null;
    const partieEntiere = m[1].split(',')[0].replace(/[\s.]/g, '');
    const valeur = parseInt(partieEntiere, 10);
    // Un prix de vente immobilier réel ne descend jamais sous 1000 € : filtre les faux positifs
    // (un numéro d'article, une référence de loi capturée par erreur près du mot "prix").
    return Number.isFinite(valeur) && valeur >= 1000 ? valeur : null;
  }

  // Affichage français ("250 000 €", pas de décimales : un prix notarié est toujours un compte
  // rond en euros dans ce contexte). Intl.NumberFormat plutôt qu'un formatage manuel des milliers.
  const FORMAT_PRIX = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  function formaterPrix(valeur) {
    return FORMAT_PRIX.format(valeur);
  }

  // Variante AVEC les centimes, pour les montants où ils comptent — une répartition de prorata est
  // une somme réclamée à un client, l'arrondir à l'euro ferait perdre le complément exact entre les
  // deux parts (voir calculerProrata). Le prix de vente et l'apport, eux, restent à l'euro près :
  // formaterPrix() est inchangée.
  const FORMAT_PRIX_CENTIMES = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function formaterPrixCentimes(valeur) {
    return FORMAT_PRIX_CENTIMES.format(valeur);
  }

  // Montant emprunté, lu dans le texte de l'offre de prêt elle-même (pas le compromis) une fois
  // celle-ci retrouvée dans le dossier local relié — voir l'appel dans verifierDossierLocal(). Même
  // heuristique que PRIX_VENTE_RE (le montant en lettres est répété en chiffres entre parenthèses,
  // usage constant des établissements prêteurs), ancrée sur le vocabulaire d'une offre de prêt
  // ("montant du prêt", "capital emprunté"...) plutôt que sur "prix", qui n'y apparaît jamais dans
  // ce sens.
  const MONTANT_PRET_RE = /(?:montant\s+(?:du\s+)?(?:pr[êe]t|financement|emprunt[ée]?)|capital\s+emprunt[ée]|somme\s+pr[êe]t[ée]e?)[^(.\n]{0,120}\(\s*([\d](?:[\d\s.]{0,14})?(?:,\d{2})?)\s*(?:€|euros?)\s*\)/i;

  function detecterMontantPret(texte) {
    const m = MONTANT_PRET_RE.exec(texte);
    if (!m) return null;
    const partieEntiere = m[1].split(',')[0].replace(/[\s.]/g, '');
    const valeur = parseInt(partieEntiere, 10);
    return Number.isFinite(valeur) && valeur >= 1000 ? valeur : null;
  }

  // Apport estimé une fois l'offre de prêt reçue : ce que le prêt ne couvre pas dans le prix total
  // (frais de notaire et autres coûts annexes non comptés — comparaison volontairement simple,
  // prix du bien contre montant emprunté). Purement informatif, aucune règle métier derrière.
  // Seuils arbitraires mais seules les couleurs déjà réservées ailleurs sont réutilisées : succès
  // (apport confortable), pret/amber (apport faible, à surveiller), urgent (prêt ≥ prix, aucun
  // apport ou financement des frais inclus).
  function calculerApport(d) {
    if (!d.prixVente || !d.montantPret) return null;
    const montant = d.prixVente - d.montantPret;
    const pourcentage = Math.round((montant / d.prixVente) * 100);
    const niveau = pourcentage < 0 ? 'urgent' : (pourcentage < 10 ? 'pret' : 'success');
    return { montant, pourcentage, niveau };
  }

  // Repère les noms de famille du VENDEUR et de l'ACQUÉREUR (un ou plusieurs de chaque côté) pour
  // préremplir le nom du dossier, au format "NOM1 / NOM2 & NOM3" (en majuscules).
  //
  // Méthode principale : dans un compromis, chaque personne est présentée sous la forme
  // "Monsieur/Madame Prénom(s) NOM né(e) le …" — on segmente le bloc de la partie par civilité
  // et on prend, pour chaque personne, le premier groupe MAJUSCULE juste avant "né"/"née"
  // (ce qui gère aussi les noms d'usage composés comme "COURTAS HUTTEAU" et ignore le nom de
  // jeune fille qui suit, ex. "DORLÉAC née PIAU née le …").
  // Repli : si aucune date de naissance n'est trouvée (autre modèle de document), on retombe sur
  // une recherche du nom en MAJUSCULES le plus proche de l'intitulé "Vendeur"/"Acquéreur".

  // Les PARTICULES d'un nom composé (« DE SOUSA MARTINS », « LE GOFF », « DU PONT ») ne
  // disqualifient un candidat que s'il n'est fait QUE d'elles. Tant qu'elles figuraient dans la
  // liste stricte ci-dessous, tout patronyme à particule était rejeté — un acte réel du corpus
  // n'avait ainsi qu'une seule partie, son bénéficiaire (« DE SOUSA MARTINS ») étant introuvable.
  // « ET » reste volontairement dans la liste STRICTE : aucun patronyme ne le contient, alors
  // qu'une capture « DUPONT ET MARTIN » en majuscules est un risque réel.
  const PARTICULES_NOM = new Set(['LE', 'LA', 'LES', 'DE', 'DU', 'DES', 'D']);

  const MOTS_EXCLUS_NOM = new Set([
    'SCI','SARL','SAS','EURL','DPE','ERP','CDC','TVA','SRU','M','MME','MLLE',
    'ET','MONSIEUR','MADAME','MADEMOISELLE','ENSEMBLE','PART','AGISSANT','SOLIDAIREMENT','AN',
    'VENDEUR','VENDEURS','ACQUEREUR','ACQUEREURS','ACHETEUR','ACHETEURS',
    'PROMETTANT','PROMETTANTS','BENEFICIAIRE','BENEFICIAIRES','PROMESSE',
    'ENTRE','SOUSSIGNES','SOUSSIGNE','COMPROMIS','VENTE','PRESENT','PRESENTS','FAIT',
    'CONDITIONS','CONDITION','SUSPENSIVES','SUSPENSIVE','DESIGNATION','ARTICLE',
    'OBJET','PRIX','GARANTIE','CLAUSE','CLAUSES','DECLARATION','DECLARATIONS',
    'ANNEXE','ANNEXES','SIGNATURE','SIGNATURES','DIAGNOSTIC','DIAGNOSTICS',
    'NOTAIRE','ETUDE','BIEN','IMMEUBLE','DESIGNE','DENOMME','DENOMMEE','PARTIES',
    'PARTIE','PRESENTES','DEPOT','GARANTIE','PRET','ACTE','AUTHENTIQUE','UNILATERALE'
  ]);

  function normaliserMaj(s) {
    return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
  }

  function estNomValide(candidat) {
    const mots = candidat.split(/[\s-]+/).map(normaliserMaj);
    if (candidat.length < 2) return false;
    if (mots.some(m => MOTS_EXCLUS_NOM.has(m))) return false;
    // Un mot-nombre n'est jamais un patronyme. La date en toutes lettres de l'en-tête d'un acte
    // authentique (« L'AN DEUX MILLE VINGT-TROIS ») se glisse entre deux paragraphes à la coupure
    // de page, en plein milieu de la présentation d'une partie — elle ressortait comme son nom.
    if (mots.some(m => MOTS_NOMBRES[m.toLowerCase()] !== undefined)) return false;
    // Un candidat fait uniquement de particules (« DE », « LE », « DES ») n'est pas un nom.
    return !mots.every(m => PARTICULES_NOM.has(m));
  }

  // Isole le bloc de texte décrivant une partie (ex. tout ce qui suit "Le vendeur" jusqu'à
  // "Ci-après dénommé…"), en cherchant l'intitulé seulement après un point de départ donné
  // (utile pour ne pas retrouver deux fois le même intitulé, ou empiéter sur l'autre partie).
  // Un acte AUTHENTIQUE s'ouvre par la comparution des notaires, qui se désignent eux-mêmes par la
  // partie qu'ils assistent : « Maître X, notaire à …, Notaire assistant le PROMETTANT », « Avec le
  // concours de Maître Y … assistant le BENEFICIAIRE ». Ces occurrences des mots-clés de rôle ne
  // désignent AUCUNE partie — la première vraie mention est le titre du bloc d'état civil, plus bas.
  // Sans ce garde-fou, le nom du dossier prenait celui du NOTAIRE : constaté sur une vraie promesse
  // reçue par notaire, qui ressortait « GOSSART / RECU » (le nom de notre propre étude, et le verbe
  // de « A RECU le présent acte ») au lieu de « BOURGUEIL / CHARPENTIER ».
  var RE_COMPARUTION_NOTAIRE = /notaire|ma[îi]tre|crpcen|office\s+notarial|soussign[ée]|avec\s+le\s+concours|assistant\s+l|assist[ée]e?\s+par/i;
  // Fenêtre VOLONTAIREMENT courte : dans une comparution, le marqueur colle au mot-clé (« Notaire
  // assistant le PROMETTANT »). Trop large, elle mordait sur la ligne précédente et faisait rejeter
  // le vrai titre du bloc d'état civil, qui suit de peu la comparution du second notaire.
  var FENETRE_COMPARUTION = 45;

  // Première mention d'un rôle qui désigne réellement une partie. Repli sur la toute première
  // occurrence si elles sont TOUTES en contexte de comparution : mieux vaut l'ancien comportement
  // qu'aucune partie du tout.
  function chercherMentionPartie(texte, motRe, apresIndex) {
    const zone = String(texte).slice(apresIndex);
    const global = new RegExp(motRe.source, motRe.flags.replace('g', '') + 'g');
    let premiere = null;
    let m;
    while ((m = global.exec(zone)) !== null) {
      if (!premiere) premiere = { index: apresIndex + m.index, longueur: m[0].length };
      const avant = zone.slice(Math.max(0, m.index - FENETRE_COMPARUTION), m.index);
      if (!RE_COMPARUTION_NOTAIRE.test(avant)) return { index: apresIndex + m.index, longueur: m[0].length };
      if (global.lastIndex === m.index) global.lastIndex++;
    }
    return premiere;
  }

  // Titre du bloc d'une AUTRE partie : en majuscules et sur sa propre ligne, comme les trames les
  // écrivent. Exiger les majuscules évite de couper sur le mot « vendeur » employé au fil d'une
  // phrase à l'intérieur du bloc lui-même.
  var RE_TITRE_PARTIE_SUIVANTE = /(?:^|\n)[^\S\n]*(?:VENDEURS?|ACQU[ÉE]REURS?|PROMETTANTS?|B[ÉE]N[ÉE]FICIAIRES?|ACHETEURS?|C[ÉE]DANTS?|CESSIONNAIRES?)[^\S\n]*(?::|\n|$)/;

  function extraireBlocPartie(texte, motRe, apresIndex) {
    const zone = texte.slice(apresIndex);
    const mention = chercherMentionPartie(texte, motRe, apresIndex);
    if (!mention) return null;
    const debut = mention.index - apresIndex + mention.longueur;
    const reste = zone.slice(debut);
    // Le bloc s'arrête à « ci-après dénommé » OU au titre de la partie suivante. Sans cette seconde
    // borne, les 1200 caractères par défaut débordaient sur le bloc voisin : sur un acte où le
    // PROMETTANT tient moins de 800 caractères, le nom du BENEFICIAIRE se retrouvait compté parmi
    // les vendeurs.
    const bornes = [reste.match(/ci-apr[èe]s\s+d[ée]nomm/i), reste.match(RE_TITRE_PARTIE_SUIVANTE)]
      .filter(Boolean).map(m => m.index);
    const longueur = bornes.length ? Math.min(...bornes) : Math.min(reste.length, 1200);
    return { texte: reste.slice(0, longueur), finAbsolue: apresIndex + debut + longueur };
  }

  // Repli quand l'ancre « né(e) » ne suit pas le patronyme. Beaucoup de trames écrivent l'état civil
  // en deux temps : « Monsieur Jean-Loup André Roger BOURGUEIL, enseignant, et Madame …, demeurant
  // ensemble à CHATEAUDUN. Monsieur est né à BUZANCAIS le 12 mai 1966. » — aucune majuscule ne
  // précède alors « né », et aucun nom n'était extrait.
  // Le patronyme est ici la première suite de MAJUSCULES qui suit la civilité et ses prénoms. Elle
  // ne doit PAS être introduite par une préposition de lieu : sans ce garde-fou, « né à BUZANCAIS »
  // et « demeurant à CHATEAUDUN » donneraient une commune pour un nom de famille — l'erreur déjà
  // rencontrée et corrigée ailleurs dans ce fichier (voir nomsAvantLabel).
  var PORTEE_NOM_APRES_CIVILITE = 90;
  var RE_SUITE_MAJUSCULES = /[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}(?:[-\s][A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,})*/g;
  var RE_PREPOSITION_LIEU = /(?:^|[\s(])(?:[àa]|au|aux|de|du|des|en|dans|sur|pr[èe]s)\s+$/i;
  // Une civilité introduite par un lien de famille ne présente pas une partie : « Divorcé de Madame
  // Ana DA SILVA MARTINHO », « veuve de Monsieur X ». Sans ce garde-fou, l'ex-conjoint cité dans
  // l'état civil devenait un acquéreur.
  var RE_LIEN_FAMILIAL = /(?:divorc[ée]e?|veuf|veuve|[ée]pou(?:x|se)|mari[ée]e?|remari[ée]e?|s[ée]par[ée]e?|pacs[ée]e?)\s+(?:de\s+|d['’]|avec\s+|[àa]\s+)?$/i;

  function nomApresCivilite(segment) {
    const s = String(segment || '');
    const civ = s.match(/(?:Monsieur|Madame|Mademoiselle)\s+/);
    if (!civ) return null;
    // Seulement la proposition qui suit immédiatement la civilité : au-delà viennent les lieux de
    // naissance, de mariage et de domicile, eux aussi en majuscules dans ces trames.
    const debut = civ.index + civ[0].length;
    // Borné à la virgule ou au point, JAMAIS au retour à la ligne : un texte extrait d'un PDF est
    // coupé au gré de la mise en page, et le patronyme se retrouve régulièrement seul sur sa ligne
    // (« et Madame Yvette Marie Annie \nFONTANEL, retraitée »).
    const apres = s.slice(debut, debut + PORTEE_NOM_APRES_CIVILITE).split(/[,.]/)[0];
    const re = new RegExp(RE_SUITE_MAJUSCULES.source, 'g');
    let m;
    while ((m = re.exec(apres)) !== null) {
      if (RE_PREPOSITION_LIEU.test(apres.slice(0, m.index))) continue;
      if (estNomValide(m[0])) return m[0];
    }
    return null;
  }

  // Dans le bloc d'une partie, extrait le(s) nom(s) de famille via l'ancre "né(e) le".
  function extraireNomsParNaissance(bloc) {
    const civiliteRe = /Monsieur|Madame|Mademoiselle/gi;
    const positions = [];
    let m;
    while ((m = civiliteRe.exec(bloc)) !== null) positions.push(m.index);
    if (positions.length === 0) return [];
    positions.push(bloc.length);
    const noms = [];
    const nomAvantNaissanceRe = /\b([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}(?:[-\s][A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,})*)\s+n[ée]e?(?=\s)/;
    for (let i = 0; i < positions.length - 1; i++) {
      if (RE_LIEN_FAMILIAL.test(bloc.slice(Math.max(0, positions[i] - 40), positions[i]))) continue;
      const segment = bloc.slice(positions[i], positions[i + 1]);
      const nm = segment.match(nomAvantNaissanceRe);
      if (nm && estNomValide(nm[1])) { noms.push(nm[1]); continue; }
      const repli = nomApresCivilite(segment);
      if (repli) noms.push(repli);
    }
    return [...new Set(noms)];
  }

  // Style « étiquette finale » : « Monsieur Jean DUPONT, né le 3 mars 1970 à BLOIS, demeurant à
  // 5 rue des Lilas 41000 BLOIS, ci-après dénommé LE VENDEUR » — le patronyme est AVANT le mot-clé
  // de rôle. Jusqu'ici on prenait « le dernier mot en capitales avant l'étiquette » : or une
  // présentation de partie se termine presque toujours par son ADRESSE, dont la commune est en
  // capitales. C'est donc la VILLE qui remontait, jamais le nom — tous les dossiers créés depuis un
  // compromis de ce style (le plus répandu) ressortaient nommés d'après des communes
  // (« BLOIS / TOURS »). Signalé par l'étude en conditions réelles ; c'est très probablement aussi
  // ce que recouvrait le « les noms de dossier ne vont pas » resté longtemps ouvert faute d'exemple,
  // et qu'un correctif précédent avait cru régler.
  // On s'ancre désormais sur la CIVILITÉ, exactement comme extraireNomsParNaissance() le fait déjà
  // pour le style « en-tête » : le patronyme suit immédiatement « Monsieur/Madame », l'adresse ne
  // vient qu'après. Plusieurs civilités dans la fenêtre = plusieurs vendeurs (un couple), tous
  // retournés, cohérent avec le style « en-tête » qui gère déjà ce cas.
  // Repères par lesquels un acte annonce lui-même le début de la présentation des parties. Tout ce
  // qui les précède (comparution des notaires, en-tête, date) n'appartient à aucune partie.
  var RE_DEBUT_PRESENTATION_PARTIES = /[àa]\s+la\s+requ[êe]te\s+de\s*:?|entre\s+les\s+soussign[ée]s\s*:?|lesquels?\s+ont\s+requis|a\s+re[çc]u\s+le\s+pr[ée]sent\s+acte/gi;

  function dernierIndexPresentationParties(fenetre) {
    const re = new RegExp(RE_DEBUT_PRESENTATION_PARTIES.source, 'gi');
    let dernier = -1;
    let m;
    while ((m = re.exec(fenetre)) !== null) dernier = m.index + m[0].length;
    return dernier;
  }

  function nomsAvantLabel(fenetre) {
    const civiliteRe = /\b(?:Mademoiselle|Monsieur|Madame|Mlle|Mme|M\.)/gi;
    const bornes = [];
    let m;
    while ((m = civiliteRe.exec(fenetre)) !== null) bornes.push({ debut: m.index, fin: m.index + m[0].length });
    if (bornes.length === 0) return [];
    const noms = [];
    for (let i = 0; i < bornes.length; i++) {
      const finSegment = i + 1 < bornes.length ? bornes[i + 1].debut : fenetre.length;
      const segment = fenetre.slice(bornes[i].fin, finSegment);
      // « NOM né(e) » d'abord : l'ancre la plus sûre quand la date de naissance est mentionnée
      // (même motif que extraireNomsParNaissance). Sinon le PREMIER mot en capitales du segment,
      // qui précède nécessairement l'adresse — c'est tout l'objet du correctif.
      const parNaissance = segment.match(/\b([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}(?:[-\s][A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,})*)\s+n[ée]e?(?=\s)/);
      if (parNaissance && estNomValide(parNaissance[1])) { noms.push(parNaissance[1]); continue; }
      const premier = trouverNomDansFenetre(segment, 'first');
      if (premier) noms.push(premier.nom);
    }
    return [...new Set(noms)];
  }

  function trouverNomDansFenetre(fenetre, direction) {
    const nomRe = /\b([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}(?:[-\s][A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,})*)\b/g;
    let resultat = null;
    let nm;
    while ((nm = nomRe.exec(fenetre)) !== null) {
      if (!estNomValide(nm[1])) continue;
      // Même garde-fou que nomApresCivilite : un groupe en capitales précédé d'une préposition de
      // lieu est une COMMUNE, pas un patronyme. Une ligne d'état civil (« - Monsieur à BLOIS
      // (41000), le 6 mai 1979 ») donnait sinon « BLOIS » comme nom de partie.
      if (RE_PREPOSITION_LIEU.test(fenetre.slice(0, nm.index))) continue;
      resultat = { nom: nm[1], idx: nm.index };
      if (direction === 'first') break;
    }
    return resultat;
  }

  // Repère le style "…ci-après dénommé(e) « le Vendeur »" — avec OU SANS guillemets, formulation
  // tout aussi fréquente ("ci-après dénommé le Vendeur" sans aucune ponctuation particulière) —
  // où le nom de la personne est à chercher AVANT le mot-clé de rôle, pas après : la personne est
  // présentée puis étiquetée, contrairement au style "en-tête" ("LE VENDEUR : M. X né le..."), où
  // le nom suit. Bug corrigé : seul le cas avec guillemets était reconnu, un « ci-après dénommé »
  // sans guillemets retombait à tort sur une recherche en avant.
  function estStyleLabelEntreGuillemets(texte, index) {
    const avant = texte.slice(Math.max(0, index - 60), index);
    // Le guillemet ne doit pas être précédé d'une LETTRE : sans cette condition, l'apostrophe
    // d'élision de « L'ACQUÉREUR » (formulation des plus courantes) passait pour un guillemet
    // ouvrant, le style était pris pour une étiquette finale, et le nom était cherché EN ARRIÈRE —
    // ramenant le nom du vendeur présenté juste avant, au lieu de celui de l'acquéreur. Bug
    // préexistant, révélé par les textes de test des trois types d'acte.
    // Le PLURIEL doit être accepté (« ci-après dénommés LES VENDEURS ») : sans le `s?`, un acte
    // avec deux vendeurs — un couple, cas courant — n'était pas reconnu comme étiquette finale et
    // retombait sur la méthode « en-tête », qui va chercher le nom APRÈS le mot-clé et ramenait
    // donc celui de la partie suivante. Trouvé en écrivant le test de non-régression du couple.
    return /(^|[^A-Za-zÀ-ÿ])["«'’]\s*(?:les?|la|l['’]|du|des)?\s*$/i.test(avant) ||
      /ci-apr[èe]s\s+d[ée]nomm[ée]e?s?\s+(?:les?|la|l['’])?\s*$/i.test(avant) ||
      // Ordre des mots inversé, tout aussi courant : « Dénommés ci-après le PROMETTANT ». Sans
      // cette variante, l'étiquette n'était pas reconnue, le nom était cherché APRÈS le mot-clé,
      // et le dossier prenait le mot structurel qui suit (« ENSEMBLE D'UNE PART » → « ENSEMBLE »).
      /d[ée]nomm[ée]e?s?\s+ci-apr[èe]s\s+(?:les?|la|l['’])?\s*$/i.test(avant);
  }

  function extraireNomsRepli(texte, motRe) {
    const m = texte.match(motRe);
    if (!m) return [];
    const finMot = m.index + m[0].length;
    if (!estStyleLabelEntreGuillemets(texte, m.index)) {
      const fenetreApres = texte.slice(finMot, Math.min(texte.length, finMot + 300));
      const rApres = trouverNomDansFenetre(fenetreApres, 'first');
      if (rApres) return [rApres.nom];
    }
    const fenetreAvant = texte.slice(Math.max(0, m.index - 250), m.index);
    const rAvant = trouverNomDansFenetre(fenetreAvant, 'last');
    return rAvant ? [rAvant.nom] : [];
  }

  // Selon le type d'acte, le vendeur est désigné VENDEUR ou PROMETTANT, et l'acquéreur ACQUÉREUR,
  // ACHETEUR ou BÉNÉFICIAIRE (promesse unilatérale de vente réitérée par acte authentique).
  const RE_ROLE_VENDEUR = /vendeu?rs?|promettants?/i;
  const RE_ROLE_ACQUEREUR = /acqu[ée]reurs?|acheteurs?|b[ée]n[ée]ficiaires?/i;

  // Cherche une adresse email au voisinage de chaque mention de l'acquéreur/bénéficiaire (utile
  // pour préremplir "Email de l'acquéreur", utilisé pour la relance automatique de l'offre de
  // prêt — voir relancerSiOffreManquante). Ancré sur le rôle plutôt qu'un simple "premier email du
  // document" : un compromis contient aussi l'email du vendeur, de l'agence ou du notaire, et rien
  // ne garantit que l'acquéreur soit cité en premier.
  const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
  // Ancré sur la qualité qui joue réellement le rôle d'ACQUÉREUR dans CE type d'acte : sur une
  // promesse d'achat, « bénéficiaire » désigne le vendeur — s'y ancrer aurait rempli le champ
  // « email de l'acquéreur » avec l'adresse du vendeur, et donc adressé les relances de prêt à la
  // mauvaise partie. Le paramètre est optionnel : sans lui, le type est détecté à la volée.
  function detecterEmailAcquereur(texte, typeActe) {
    const qualite = qualitePourRole(texte, typeActe || detecterTypeActe(texte).valeur, 'ACQUEREUR');
    const roleRe = new RegExp((qualite ? qualite.re : RE_ROLE_ACQUEREUR).source, 'gi');
    let m;
    while ((m = roleRe.exec(texte)) !== null) {
      // Recul borné à la phrase courante (s'arrête au point précédent, comme extraireContexte) :
      // sans ça, l'email du VENDEUR cité juste avant dans le document pouvait être capté à la
      // place de celui de l'ACQUEREUR sur un simple recul à distance fixe.
      // Seul un point SUIVI D'UNE ESPACE arrête le recul : un point collé appartient à l'adresse
      // email elle-même (« pierre.martin@… ») ou à une abréviation — s'y arrêter tronquait la
      // fenêtre en plein milieu de l'adresse recherchée, qui était alors manquée au profit de la
      // suivante, c'est-à-dire celle de l'autre partie.
      let debut = m.index;
      let n = 0;
      while (debut > 0 && n < 150) {
        if (texte[debut - 1] === '.' && (debut >= texte.length || /\s/.test(texte[debut]))) break;
        debut--; n++;
      }
      const fenetre = texte.slice(debut, m.index + 300);
      const em = fenetre.match(EMAIL_RE);
      if (em) return em[0];
    }
    return null;
  }

  // Pour un rôle donné, trouve le nom de la personne ET le point où s'arrête sa présentation
  // (utile pour ne pas repartir dedans en cherchant l'autre partie). Deux styles rencontrés dans
  // les vrais compromis/promesses :
  //  - "en-tête" : "LE VENDEUR : M. X né le ..." — le nom suit le mot-clé, dans un bloc borné par
  //    le prochain "ci-après dénommé" (voir extraireBlocPartie).
  //  - "étiquette finale" : "M. X né le ..., ci-après dénommé LE PROMETTANT" — le nom est AVANT
  //    le mot-clé. Bug corrigé : en appliquant malgré tout la méthode "en-tête" à ce style, le
  //    bloc borné par le PROCHAIN "ci-après dénommé" empiétait sur la présentation de l'AUTRE
  //    partie (son propre "ci-après dénommé"), ce qui remontait son nom à la place du bon —
  //    reproduit sur une promesse réelle signalée par l'étude (le résultat sortait "NOM / NOM"
  //    avec deux fois le même nom, celui du bénéficiaire). Reconnaître ce style dès ce premier
  //    mot-clé (voir estStyleLabelEntreGuillemets) et chercher directement en arrière l'évite.
  function nomsEtFinPourRole(texte, motRe, apresIndex) {
    const mention = chercherMentionPartie(texte, motRe, apresIndex);
    if (!mention) return { noms: [], finAbsolue: apresIndex };
    const indexAbsolu = mention.index;
    const finAbsolue = indexAbsolu + mention.longueur;
    if (estStyleLabelEntreGuillemets(texte, indexAbsolu)) {
      // Fenêtre élargie à 600 caractères : une présentation réelle (état civil, nationalité,
      // régime matrimonial, profession, adresse) dépasse largement 250 caractères, et la civilité
      // — seule ancre fiable du patronyme, voir nomsAvantLabel — tombait alors hors fenêtre. Bornée
      // par `apresIndex` : jamais en deçà du point où commence la recherche de CETTE partie, sans
      // quoi la fenêtre empiéterait sur la présentation de la partie précédente et ramènerait son
      // nom (le bug « NOM / NOM » déjà rencontré, que les 250 caractères fixes ne prévenaient pas).
      // La fenêtre passe à 1200 caractères : sur une trame réelle, la présentation d'un couple
      // (état civil, professions, PACS, adresse, lieux et dates de naissance, déclarations) dépasse
      // largement 600, et les civilités — seule ancre fiable du patronyme — tombaient hors fenêtre.
      // Élargir seul ne suffisait pas : la comparution des notaires, juste avant, NOMME les parties
      // qu'ils assistent (« assistant : - Monsieur X, - Monsieur Y ») et ces noms-là remontaient
      // pour la mauvaise partie. La fenêtre est donc coupée à l'endroit où l'acte annonce lui-même
      // le début de la présentation (« à la requête de : », « Entre les soussignés : »).
      let fenetreAvant = texte.slice(Math.max(apresIndex, indexAbsolu - 1200), indexAbsolu);
      const debutPresentation = dernierIndexPresentationParties(fenetreAvant);
      if (debutPresentation !== -1) fenetreAvant = fenetreAvant.slice(debutPresentation);
      const parCivilite = nomsAvantLabel(fenetreAvant);
      if (parCivilite.length) return { noms: parCivilite, finAbsolue };
      // Aucune civilité (société, « les époux X »…) : on retombe sur l'ancien comportement plutôt
      // que de ne rien renvoyer.
      const r = trouverNomDansFenetre(fenetreAvant, 'last');
      return { noms: r ? [r.nom] : [], finAbsolue };
    }
    const bloc = extraireBlocPartie(texte, motRe, apresIndex);
    const noms = bloc ? extraireNomsParNaissance(bloc.texte) : [];
    return { noms, finAbsolue: bloc ? bloc.finAbsolue : finAbsolue };
  }

  // Le nom de dossier reste au format « VENDEUR / ACQUÉREUR » (demandé par l'étude), mais les deux
  // côtés sont désormais déterminés par detecterParties() en tenant compte du type d'acte : sur une
  // promesse d'achat, le promettant est l'ACQUÉREUR, et c'est lui qui doit figurer à droite.
  function detecterNomDossier(texte) {
    const parties = detecterParties(texte, detecterTypeActe(texte).valeur);
    const partieVendeur = parties.filter(p => p.role === 'VENDEUR').map(p => p.nom).join(' & ');
    const partieAcquereur = parties.filter(p => p.role === 'ACQUEREUR').map(p => p.nom).join(' & ');
    if (partieVendeur && partieAcquereur) return `${partieVendeur} / ${partieAcquereur}`;
    return partieVendeur || partieAcquereur || null;
  }

  // Dates à écarter d'office : diagnostics, actes antérieurs, état civil, copropriété passée…
  // (dont les citations de loi, ex. « en vertu de la loi numéro 2022-270 du 28 février 2022 » —
  // une clause d'information sur l'assurance emprunteur, sans lien avec l'échéance du prêt lui-même
  // malgré le vocabulaire "prêteur"/"emprunteur" à proximité immédiate — cas réel rencontré).
  const EXCLUSION_RE = /diagnostic|dpe\b|amiante|plomb|termite|erp\b|carrez|m[ée]trage|\bn[ée]e?\s+le\b|suivant\s+acte|acte\s+(re[çc]u|d.acquisition|de\s+propri[ée]t[ée]|notari[ée]|initial)|pr[ée]c[ée]demment|[ée]tabli(e)?\s+le|dat[ée](e)?\s+du|dat[ée](e)?\s+de\s+validit[ée]|r[ée]alis[ée](e)?\s+le|dress[ée](e)?\s+le|d[ée]livr[ée](e)?\s+le|assembl[ée]e\s+g[ée]n[ée]rale|r[èe]glement\s+de\s+copropri[ée]t[ée]|contrat\s+de\s+mariage|acte\s+de\s+naissance|cadastr|co\s*m\s*m\s*ande\s+du|p[ée]riode\s+de\s+validit[ée]|num[ée]ro\s+de\s+police|r[ée]f[ée]rence\s+interne|r[ée]f\.\s*interne|attestation\s+de\s+qualification|identifiant\s+du\s+contrat|cl[ée]\s+de\s+hachage|mandat\s+(?:écrit|ecrit)|[ée]tat\s+des\s+risques|[ée]tat\s+parasitaire|assainissement|fosse\s+septique|entretien\s+et\s+vidange|vidange\s+du|contr[ôo]le\s+d[eu]|installation\s+(?:int[ée]rieure|[ée]lectrique|de\s+gaz|gaz)|catastrophe\s+(?:naturelle|technologique)|risques?\s+(?:naturels?|miniers?|technologiques?)|sinistres?\s+indemnis[ée]s?|potentiel\s+radon|mouvement\s+de\s+terrain|recul\s+du\s+trait\s+de\s+c[ôo]te|zone\s+(?:couverte|expos[ée]e)|(?:loi|ordonnance|d[ée]cret|arr[êe]t[ée]s?)\s+(?:n[°ºo]|num[ée]ro)\s*[\d\-]+|(?:loi|ordonnance|d[ée]cret|arr[êe]t[ée]s?)\s+du\s+\d/i;

  // Formulations qui indiquent une échéance à venir plutôt qu'une date déjà passée.
  var PORTEE_CITATION = 400;

  const CUE_FUTUR_RE = /au\s+plus\s+tard|avant\s+le|jusqu.au|date\s+limite|d[ée]lai\s+(?:expirant|fix[ée])|sera\s+(sign[ée]e?|r[ée]alis[ée]e?|conclu(e)?)|pr[ée]vue?\s+(le|pour|au)|fix[ée]e?\s+(au|le)|au\s+plus\s+tôt/i;

  // "à compter du/de <date>" introduit une date de PRISE D'EFFET (loyer, garantie, taux d'intérêt,
  // jouissance différée, prorata de taxe foncière...), pas une échéance à respecter — contrairement
  // à "au plus tard le"/"avant le" (CUE_FUTUR_RE), qui annoncent une vraie limite. Signalé par
  // l'étude avec un exemple réel ("à compter du 1er Janvier 2028.") : la clause se trouvait par
  // ailleurs dans le même paragraphe qu'une mention de l'acte authentique, ce qui suffisait à faire
  // classer cette date "acte" par suggererEcheance (voir sa ligne "acte authentique|réitération...",
  // qui ne regarde que la présence du mot dans tout le contexte, pas son lien réel avec la date).
  // Seule exception : si la clause parle explicitement de la RÉITÉRATION de l'acte de vente
  // lui-même (verbe "réitéré(e)" ou nom "réitération", voir \br[ée]it[ée]r au point d'appel),
  // "à compter du" peut alors désigner la date à laquelle l'acte sera effectivement réitéré —
  // cette date-là reste une vraie échéance, à ne pas écarter.
  const A_COMPTER_RE = /[àa]\s+compter\s+d[eu]\s*$/i;

  // Vocabulaire du financement, cherché à l'échelle de la CLAUSE (et non de la seule phrase) pour
  // rattacher une date issue d'un délai à l'échéance « prêt » — voir son usage dans ajouter().
  // `var` et non `const` : déclarée ainsi pour rester visible depuis le harnais de tests
  // (tests/helpers/load-app.js ne voit que les `function` et les `var` de premier niveau).
  var VOCABULAIRE_PRET_CLAUSE_RE = /\bpr[êe]ts?\b|\bemprunt|\bfinancement\b/i;

  function suggererEcheance(contexte) {
    const c = contexte.toLowerCase();
    if (/vente(?:.{0,60})?d.un\s+(?:autre\s+)?bien|condition\s+suspensive\s+de\s+vente\s+(?:d.un\s+bien|immobili[èe]re)|avant-contrat(?:.{0,150})?(?:vente|bien\s+(?:lui\s+)?appartenant)/.test(c)) return 'ventebien';
    // Ces clauses sont de vraies échéances mais ne correspondent ni à un prêt, ni à un acte, ni à
    // une vente préalable : elles sont classées "Autre" plutôt qu'ignorées.
    if (/permis\s+de\s+construire|certificat\s+d.urbanisme|autorisation\s+d.urbanisme|condition\s+suspensive\s+d.urbanisme|servitude/.test(c)) return 'autre';
    // Le VERSEMENT d'une somme (indemnité d'immobilisation, dépôt de garantie, acompte) porte sa
    // propre échéance, très courte — huit jours, dix jours — et n'a rien à voir avec la condition
    // de prêt ni avec la signature de la vente. Deux promesses réelles voyaient ainsi leur
    // « obtention du prêt » fixée dix jours après la signature. Le verbe de versement doit être
    // PROCHE de la formulation de délai : la vraie clause de prêt cite elle aussi un montant, et
    // un simple test sur « verser » quelque part dans la clause l'aurait écartée à son tour.
    if (/vers(?:er|era|ement)[^.]{0,80}au\s+plus\s+tard|au\s+plus\s+tard[^.]{0,80}vers(?:er|era|ement)|indemnit[ée]\s+d.immobilisation|d[ée]p[ôo]t\s+de\s+garantie/.test(c)) return 'autre';
    if (/pr[êe]t|financement|emprunt|offre\s+de\s+pr[êe]t/.test(c)) return 'pret';
    // « signature DUDIT acte » est aussi courant que « signature de l'acte » — sans cette variante,
    // « La signature dudit acte devra intervenir au plus tard le 15 septembre 2026 » n'était pas
    // classée du tout, et une citation d'ordonnance du même document prenait sa place.
    if (/acte\s+authentique|r[ée]it[ée]ration|signature\s+(?:de\s+l.|dudit\s+|du\s+dit\s+|de\s+cet\s+)acte/.test(c)) return 'acte';
    // Sur une promesse unilatérale, la RÉALISATION de la promesse est la signature de la vente.
    if (/r[ée]alisation\s+de\s+la\s+(?:pr[ée]sente\s+)?promesse|lev[ée]e\s+d[eu]\s*l?.?option/.test(c)) return 'acte';
    // Sur une promesse, la date d'expiration de l'option EST la date butoir pour signer la vente.
    if (/(?:promesse|option|convention)[^.]{0,80}expirant|dur[ée]e\s+expirant|rendez-vous\s+de\s+signature/.test(c)) return 'acte';
    // « notaire » TOUT SEUL ne dit rien de la nature d'une date : un acte notarié le mentionne dans
    // une clause sur deux. Associé à « au plus tard », il faisait passer pour la signature de l'acte
    // le versement de l'indemnité d'immobilisation (« … au plus tard dans les dix jours … en la
    // comptabilité du notaire rédacteur ») et la fin de la faculté de substitution — les deux
    // constatés sur une vraie promesse. Il faut désormais que la mention du notaire soit liée à la
    // SIGNATURE elle-même.
    if (/acte\s+de\s+vente|sign(?:er|ature)[^.]{0,40}notaire|notaire[^.]{0,40}sign/.test(c) && CUE_FUTUR_RE.test(c)) return 'acte';
    return null;
  }

  // Quand plusieurs dates détectées partagent la même catégorie suggérée (ex. une vraie échéance
  // de prêt et une citation de loi qui mentionne aussi "prêteur"), on ne peut pas se contenter de
  // prendre la première par ordre chronologique : cas réel rencontré où cela remontait une date de
  // loi de 2022 avant la vraie échéance de 2026. Une clause qui porte une formulation de délai
  // ("au plus tard le", "avant le"...) fait presque toujours foi sur une simple mention en passant
  // — si elle est la seule du lot à en porter une, elle est retenue sans marquer d'ambiguïté.
  // Sinon (aucune, ou plusieurs), le premier candidat est gardé par défaut mais signalé "ambigu" :
  // c'est à l'utilisateur de vérifier, pas à l'outil de deviner en silence.
  // Vocabulaire qui désigne l'échéance ELLE-MÊME, et non une clause qui la mentionne en passant.
  // Déclaré à un seul endroit, comme les autres tables de règles métier de ce fichier.
  var SIGNAUX_FORTS_ECHEANCE = {
    pret: /condition\s+suspensive[^.]{0,60}pr[êe]t|offres?\s+(?:[ée]crites?\s+)?de\s+pr[êe]t/i,
    acte: /r[ée]it[ée]ration|acte\s+authentique|dur[ée]e\s+expirant|rendez-vous\s+de\s+signature|signature\s+(?:de\s+l.|dudit\s+|du\s+dit\s+|de\s+cet\s+)acte|r[ée]alisation\s+de\s+la\s+(?:pr[ée]sente\s+)?promesse/i,
    ventebien: /condition\s+suspensive\s+de\s+vente|vente\s+(?:pr[ée]alable|d.un\s+autre\s+bien)/i
  };

  function meilleureCandidateEcheance(detectedDates, type) {
    const candidats = detectedDates.filter(d => d.suggestion === type);
    if (candidats.length === 0) return { candidat: null, ambigu: false };
    if (candidats.length === 1) return { candidat: candidats[0], ambigu: false };
    // Départage d'abord sur le SIGNAL FORT du type : une clause qui nomme l'objet même de
    // l'échéance l'emporte sur une clause qui ne fait que citer le mot au passage. Sans ça, sur une
    // vraie promesse, « la faculté de substitution ne pourra être exercée que jusqu'au 30 septembre
    // 2026 … adressée au notaire chargé de rédiger l'acte de vente » était retenue comme date de
    // signature de l'acte, devant « la promesse est consentie pour une durée expirant le 9 octobre
    // 2026 » — qui est la vraie date butoir.
    const forts = SIGNAUX_FORTS_ECHEANCE[type]
      ? candidats.filter(d => SIGNAUX_FORTS_ECHEANCE[type].test(d.contexte || ''))
      : [];
    if (forts.length === 1) return { candidat: forts[0], ambigu: false };
    const avecEcheance = candidats.filter(d => CUE_FUTUR_RE.test(d.contexte));
    if (avecEcheance.length === 1) return { candidat: avecEcheance[0], ambigu: false };
    return { candidat: candidats[0], ambigu: true };
  }

  // Propose un intitulé plus parlant qu'"Autre échéance" quand le contexte le permet.
  function libelleAutreSuggere(contexte) {
    const c = (contexte || '').toLowerCase();
    if (/permis\s+de\s+construire/.test(c)) return 'Obtention du permis de construire';
    if (/certificat\s+d.urbanisme/.test(c)) return "Certificat d'urbanisme";
    if (/autorisation\s+d.urbanisme|condition\s+suspensive\s+d.urbanisme/.test(c)) return "Autorisation d'urbanisme";
    if (/servitude/.test(c)) return 'Levée de servitude';
    return '';
  }

  // ==== EXTRACTION STRUCTURÉE : type d'acte et qualités des parties ====
  //
  // Point de départ de toute la refonte : le TYPE D'ACTE doit être déterminé AVANT d'attribuer les
  // rôles, parce que la même qualité ne désigne pas la même partie d'un acte à l'autre.
  //  - compromis de vente        : vendeur → VENDEUR,     acquéreur   → ACQUEREUR
  //  - promesse de vente         : promettant → VENDEUR,  bénéficiaire → ACQUEREUR
  //  - promesse d'ACHAT          : promettant → ACQUEREUR, bénéficiaire → VENDEUR  (inversion !)
  // Jusqu'ici RE_ROLE_VENDEUR listait « promettant » comme simple synonyme de « vendeur », sans
  // jamais regarder le type d'acte : une promesse d'achat ressortait donc avec vendeur et acquéreur
  // intervertis, silencieusement.

  var TYPES_ACTE = ['COMPROMIS_DE_VENTE', 'PROMESSE_DE_VENTE', 'PROMESSE_D_ACHAT', 'AUTRE', 'INCONNU'];

  // Chaque type d'acte donne la correspondance qualité → rôle. Les quatre qualités sont présentes
  // dans chaque table : un compromis peut employer le vocabulaire « promettant » (promesse
  // synallagmatique), et une promesse peut nommer les parties « vendeur »/« acquéreur » dans ses
  // clauses. INCONNU et AUTRE reprennent volontairement la convention historique de l'outil
  // (promettant → vendeur) : sans type d'acte établi, on ne change rien à ce qui marchait.
  var ROLES_PAR_TYPE_ACTE = {
    COMPROMIS_DE_VENTE: { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'VENDEUR', beneficiaire: 'ACQUEREUR' },
    PROMESSE_DE_VENTE:  { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'VENDEUR', beneficiaire: 'ACQUEREUR' },
    PROMESSE_D_ACHAT:   { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'ACQUEREUR', beneficiaire: 'VENDEUR' },
    AUTRE:              { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'VENDEUR', beneficiaire: 'ACQUEREUR' },
    INCONNU:            { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'VENDEUR', beneficiaire: 'ACQUEREUR' }
  };

  function roleDepuisQualite(typeActe, qualite) {
    const table = ROLES_PAR_TYPE_ACTE[typeActe] || ROLES_PAR_TYPE_ACTE.INCONNU;
    return table[qualite] || null;
  }

  // Motifs de qualité, séparés (contrairement à RE_ROLE_VENDEUR/RE_ROLE_ACQUEREUR, qui fusionnaient
  // deux qualités distinctes dans un même motif et rendaient l'inversion impossible à exprimer).
  // « propriétaire » est volontairement ABSENT malgré la spec : le mot apparaît constamment dans la
  // désignation du bien et les clauses de jouissance d'un compromis ordinaire, il ferait remonter
  // des blocs de texte sans rapport avec la présentation des parties. À réintroduire seulement si
  // un acte réel montre qu'il est le seul mot employé pour désigner le vendeur.
  var RE_QUALITE_VENDEUR = /\bvendeurs?\b|\bparties?\s+venderesses?\b|\bc[ée]dants?\b/i;
  var RE_QUALITE_PROMETTANT = /\bpromettants?\b/i;
  var RE_QUALITE_ACQUEREUR = /\bacqu[ée]reurs?\b|\bacheteurs?\b|\bparties?\s+acqu[ée]reuses?\b|\bcessionnaires?\b/i;
  var RE_QUALITE_BENEFICIAIRE = /\bb[ée]n[ée]ficiaires?\b/i;

  var QUALITES_CONNUES = [
    { qualite: 'vendeur', re: RE_QUALITE_VENDEUR },
    { qualite: 'promettant', re: RE_QUALITE_PROMETTANT },
    { qualite: 'acquereur', re: RE_QUALITE_ACQUEREUR },
    { qualite: 'beneficiaire', re: RE_QUALITE_BENEFICIAIRE }
  ];

  // Zone d'analyse du type d'acte : titre + exposé, là où l'acte se nomme lui-même. Au-delà, les
  // clauses citent couramment les autres formes (« à défaut de réitération de la présente
  // promesse », « comme il est d'usage en matière de compromis »), ce qui brouillerait le comptage.
  var ZONE_TYPE_ACTE = 6000;

  var MOTIFS_TYPE_ACTE = [
    { type: 'PROMESSE_D_ACHAT', re: /promesse\s+(?:unilat[ée]rale\s+)?d['’\s]*achat|offre\s+d['’\s]*achat\s+irr[ée]vocable/gi },
    { type: 'PROMESSE_DE_VENTE', re: /promesse\s+(?:unilat[ée]rale\s+)?de\s+vente/gi },
    { type: 'COMPROMIS_DE_VENTE', re: /compromis(?:\s+de\s+vente)?|promesse\s+synallagmatique(?:\s+de\s+vente)?/gi }
  ];

  // Classification par le contexte global plutôt que par la présence d'un mot isolé (exigence
  // explicite de la spec) : on compte les occurrences de chaque forme dans la zone de titre et on
  // ne déclare CONFIRMED qu'une dominance nette. À égalité, ou sans aucune occurrence, le type
  // reste INCONNU — et les rôles retombent alors sur la convention historique, jamais sur une
  // inversion hasardeuse.
  function detecterTypeActe(texte) {
    const zone = String(texte || '').slice(0, ZONE_TYPE_ACTE);
    const mesures = MOTIFS_TYPE_ACTE.map(m => {
      const re = new RegExp(m.re.source, 'gi');
      let occurrences = 0;
      let premier = null;
      let trouve;
      while ((trouve = re.exec(zone)) !== null) {
        occurrences++;
        if (premier === null) premier = trouve;
      }
      return { type: m.type, occurrences, premier };
    });
    const classees = mesures.filter(m => m.occurrences > 0).sort((a, b) => b.occurrences - a.occurrences);
    if (classees.length === 0) return { valeur: 'INCONNU', statut: 'NOT_FOUND', source: null };
    const gagnant = classees[0];
    const suivant = classees[1];
    const source = gagnant.premier
      ? { extrait: extraireContexte(zone, gagnant.premier.index, gagnant.premier[0].length), index: gagnant.premier.index }
      : null;
    // Dominance nette : soit la seule forme citée, soit deux fois plus citée que la suivante.
    const net = !suivant || gagnant.occurrences >= suivant.occurrences * 2;
    return { valeur: gagnant.type, statut: net ? 'CONFIRMED' : 'NEEDS_REVIEW', source };
  }

  // Pour un rôle donné (VENDEUR/ACQUEREUR) et un type d'acte, retrouve la qualité effectivement
  // employée par le document et la position de sa première mention.
  function qualitePourRole(texte, typeActe, role) {
    const candidats = QUALITES_CONNUES
      .filter(q => roleDepuisQualite(typeActe, q.qualite) === role)
      // Pas un simple `search()` : la première occurrence d'un mot-clé de rôle peut appartenir à la
      // comparution des notaires (voir chercherMentionPartie).
      .map(q => {
        const mention = chercherMentionPartie(String(texte || ''), q.re, 0);
        return { ...q, index: mention ? mention.index : -1 };
      })
      .filter(q => q.index !== -1)
      .sort((a, b) => a.index - b.index);
    return candidats[0] || null;
  }

  // Personne morale : la raison sociale suit la forme juridique, parfois entre guillemets. Premier
  // jet, comme l'ont été les motifs de pièces en leur temps — à resserrer sur de vrais actes.
  var RE_PERSONNE_MORALE = /\b(SCI|SCCV|SARL|SASU|SAS|EURL|SCP|SA|SC)\b[\s,]*(?:d[ée]nomm[ée]e?\s+)?["«'’]?\s*([A-ZÀ-Ü0-9][^,.\n«»"'’]{2,60}?)\s*["»'’]?\s*(?=,|\.|\n|$|\bau\s+capital\b|\bdont\s+le\s+si[èe]ge\b|\brepr[ée]sent)/;
  var RE_REPRESENTANT = /repr[ée]sent[ée]e?\s+par\s+(?:Monsieur|Madame|Mademoiselle|M\.|Mme)?\s*([A-ZÀ-Ü][^,.\n]{2,60}?)(?=,|\.|\n|$|\ben\s+qualit[ée]\b|\bagissant\b)/i;

  // Extrait les parties du document, chacune avec sa qualité TELLE QU'ÉCRITE dans l'acte et le rôle
  // qui en découle POUR CE TYPE D'ACTE. Gère plusieurs vendeurs et plusieurs acquéreurs (les noms
  // sont extraits un par un, voir extraireNomsParNaissance), ainsi qu'une personne morale avec son
  // représentant.
  function detecterParties(texte, typeActe) {
    const source = String(texte || '');
    if (!source) return [];
    const type = TYPES_ACTE.includes(typeActe) ? typeActe : 'INCONNU';
    const cotes = [
      qualitePourRole(source, type, 'VENDEUR'),
      qualitePourRole(source, type, 'ACQUEREUR')
    ].filter(Boolean);
    // Parcours dans l'ordre d'apparition : sur une promesse d'achat, la partie qui joue le rôle de
    // VENDEUR (le bénéficiaire) peut être présentée après l'autre.
    cotes.sort((a, b) => a.index - b.index);

    const parties = [];
    let curseur = 0;
    for (const cote of cotes) {
      const role = roleDepuisQualite(type, cote.qualite);
      const resultat = nomsEtFinPourRole(source, cote.re, curseur);
      let noms = resultat.noms;
      const bloc = source.slice(cote.index, Math.min(source.length, cote.index + 1200));

      // Personne morale : sa raison sociale remplace les noms de personnes physiques du bloc, qui
      // ne sont alors que ceux du représentant.
      const morale = bloc.match(RE_PERSONNE_MORALE);
      if (morale) {
        const mRepresentant = bloc.match(RE_REPRESENTANT);
        parties.push({
          nom: `${morale[1]} ${morale[2].trim()}`.replace(/\s+/g, ' ').trim(),
          qualiteActe: cote.qualite,
          role,
          qualitePersonne: 'morale',
          representant: mRepresentant ? mRepresentant[1].replace(/\s+/g, ' ').trim() : null,
          source: { extrait: extraireContexte(source, cote.index, cote.qualite.length), index: cote.index }
        });
        curseur = resultat.finAbsolue;
        continue;
      }

      if (noms.length === 0) noms = extraireNomsRepli(source, cote.re);
      // Un nom déjà attribué à la partie précédente ne l'est jamais une seconde fois : le bloc d'une
      // partie peut déborder sur une clause qui renomme l'autre (« QUOTITES VENDUES : Monsieur
      // BOURGUEIL et Madame BOUSSELET vendent la pleine propriété »), et l'acquéreur héritait alors
      // du nom des vendeurs.
      const dejaVus = new Set(parties.map(p => p.nom));
      noms = noms.filter(n => !dejaVus.has(n));
      for (const nom of noms) {
        parties.push({
          nom,
          qualiteActe: cote.qualite,
          role,
          qualitePersonne: 'physique',
          representant: null,
          source: { extrait: extraireContexte(source, cote.index, cote.qualite.length), index: cote.index }
        });
      }
      curseur = resultat.finAbsolue;
    }
    return parties;
  }

  // ==== EXTRACTION STRUCTURÉE : socle de calcul (dates) ====
  //
  // Refonte demandée par l'étude (voir CLAUDE.md) : une date d'échéance exprimée en délai doit
  // être calculée de façon DÉTERMINISTE, côté application — jamais par le modèle IA local, dont
  // l'arithmétique calendaire n'est pas fiable. Ces fonctions sont pures et testées
  // (tests/dates-metier.test.js) ; elles serviront ensuite à construireDatesMetier().

  // Ajoute n mois "de quantième à quantième" : le 31 janvier + 1 mois donne le 28 (ou 29) février,
  // pas le 3 mars — c'est la règle de computation usuelle d'un délai en mois (art. 641 CPC), et
  // c'est aussi ce qu'un notaire attend en lisant « dans les trois mois de la signature ».
  function ajouterMois(iso, n) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(n)) return null;
    const [annee, mois, jour] = iso.split('-').map(Number);
    const totalMois = annee * 12 + (mois - 1) + n;
    const anneeCible = Math.floor(totalMois / 12);
    const moisCible = ((totalMois % 12) + 12) % 12; // 0-11, correct aussi pour un n négatif
    // Jour 0 du mois suivant = dernier jour du mois visé (gère février et les années bissextiles).
    const dernierJour = new Date(Date.UTC(anneeCible, moisCible + 1, 0)).getUTCDate();
    return `${anneeCible}-${pad(moisCible + 1)}-${pad(Math.min(jour, dernierJour))}`;
  }

  // Calcule une date d'échéance à partir d'une date de départ et d'un délai {valeur, unite}.
  // Renvoie null si la base est inconnue — cas courant et VOULU : un délai dont le point de départ
  // n'est pas la signature ("à compter de la réalisation de la condition suspensive", "à compter
  // de la notification") ne doit pas être calculé au petit bonheur, il doit remonter en
  // NEEDS_REVIEW pour que l'étude tranche (voir la spec : ne jamais présenter comme certaine une
  // date dont la convention de computation n'est pas établie par le document).
  function calculerDateEcheance(baseIso, delai) {
    if (!baseIso || !delai) return null;
    const valeur = Number(delai.valeur);
    if (!Number.isFinite(valeur) || valeur <= 0) return null;
    if (delai.unite === 'mois') return ajouterMois(baseIso, valeur);
    if (delai.unite === 'jours') return addDays(baseIso, valeur);
    return null;
  }

  // ==== EXTRACTION STRUCTURÉE : dates métier ====
  //
  // Un compromis contient des dizaines de dates (naissance, diagnostics, titres antérieurs,
  // assemblées générales…). La spec l'énonce clairement : il est interdit de prendre « la première »
  // ou « la dernière » — chaque date doit être classée par sa FONCTION juridique, et l'outil doit
  // pouvoir dire d'où il tient celle qu'il retient.

  var TYPES_DATE = ['SIGNATURE_AVANT_CONTRAT', 'BUTOIR_PRET', 'BUTOIR_VENTE_PREALABLE', 'REITERATION_ACTE', 'AUTRE'];

  // Correspondance avec les trois champs d'échéance existants de la fiche : le vocabulaire interne
  // change, le modèle de données du dossier ne bouge pas.
  var CHAMP_PAR_TYPE_DATE = {
    BUTOIR_PRET: 'pret',
    REITERATION_ACTE: 'acte',
    BUTOIR_VENTE_PREALABLE: 'ventebien'
  };

  function uniteDelai(mot) {
    return /mois/i.test(String(mot || '')) ? 'mois' : 'jours';
  }

  // Les actes écrivent les durées courtes en toutes lettres au moins aussi souvent qu'en chiffres
  // (« dans les trois mois de la signature ») : ne reconnaître que les chiffres laissait ces
  // clauses totalement invisibles.
  var NOMBRES_EN_LETTRES = {
    un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
    dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, quarante: 40,
    cinquante: 50, soixante: 60, 'quatre-vingts': 80, 'quatre-vingt': 80, 'quatre-vingt-dix': 90, cent: 100
  };

  // Fragment réutilisé par tous les motifs de délai : un nombre en chiffres OU en lettres. Trié par
  // longueur décroissante pour que « quatre-vingt-dix » l'emporte sur « quatre ».
  var MOTIF_NOMBRE = '(\\d{1,3}|' + Object.keys(NOMBRES_EN_LETTRES).sort((a, b) => b.length - a.length).join('|') + ')';

  function valeurNombre(mot) {
    const brut = String(mot || '').trim().toLowerCase();
    if (/^\d+$/.test(brut)) return parseInt(brut, 10);
    return Object.prototype.hasOwnProperty.call(NOMBRES_EN_LETTRES, brut) ? NOMBRES_EN_LETTRES[brut] : NaN;
  }

  // Points de départ d'un délai rencontrés dans les actes. SEULE la signature a une base connue de
  // l'outil (la date du compromis) : un délai « à compter de la notification du refus » ou « de la
  // réalisation de la condition suspensive » dépend d'un événement dont la date n'est pas dans
  // l'acte — la spec interdit explicitement de supposer que tout délai part de la signature.
  var POINTS_DEPART_CONNUS = [
    // Les formes nues (« du compromis », « de signature », sans article) sont acceptées au même
    // titre que les formes complètes : le connecteur du délai consomme souvent l'article.
    { cle: 'signature', calculable: true, re: /\bsignature\b|\bpr[ée]sentes\b|ce\s+jour|l['’]acte|la\s+pr[ée]sente\b|le\s+pr[ée]sent\s+(?:compromis|acte)|\bpromesse\b|\bcompromis\b|avant[-\s]?contrat/i },
    { cle: 'notification', calculable: false, re: /notification|r[ée]ception\s+(?:de\s+la\s+lettre|du\s+courrier|de\s+l['’]avis)/i },
    { cle: 'realisation_condition', calculable: false, re: /r[ée]alisation\s+de\s+(?:la|cette|ladite)\s+condition|lev[ée]e\s+de\s+(?:la|cette|ladite)\s+condition|obtention\s+(?:du\s+pr[êe]t|des\s+offres)/i },
    { cle: 'purge_preemption', calculable: false, re: /purge|droit\s+de\s+pr[ée]emption/i }
  ];

  // Le texte examiné est la clause de délai ENTIÈRE (« … dans les 60 jours de la promesse »), pas
  // seulement ce qui suit le connecteur : celui-ci consomme justement l'article dont les motifs
  // ci-dessus ont besoin (« de la » avalait le « la » de « la promesse », « à compter des »
  // le « des » de « des présentes ») — le point de départ retombait alors sur « inconnu » et la
  // date n'était plus calculée, alors que c'est bien la signature de l'acte importé.
  // Quand plusieurs points de départ matchent (« dans les 60 jours de la réalisation de la
  // condition prévue au présent compromis »), c'est le PREMIER rencontré qui décide : c'est celui
  // que le connecteur introduit, le reste n'est qu'un complément de la même phrase.
  function pointDepartDepuisAncre(ancre) {
    const texte = String(ancre || '');
    if (!texte.trim()) return null;
    let meilleur = null;
    for (const point of POINTS_DEPART_CONNUS) {
      const m = new RegExp(point.re.source, 'i').exec(texte);
      if (m && (meilleur === null || m.index < meilleur.index)) meilleur = { index: m.index, cle: point.cle };
    }
    return meilleur ? meilleur.cle : 'inconnu';
  }

  // Libellé affiché dans le panneau de révision. Écrire « depuis la signature » quel que soit le
  // point de départ réel était contradictoire avec la raison affichée juste en dessous (« son
  // point de départ n'est pas une date figurant dans l'acte ») — signalé par l'étude.
  var LIBELLES_POINT_DEPART = {
    signature: 'depuis la signature de l’avant-contrat',
    notification: 'à compter d’une notification (date non connue de l’acte)',
    realisation_condition: 'à compter de la réalisation d’une condition (date non connue de l’acte)',
    purge_preemption: 'à compter de la purge du droit de préemption (date non connue de l’acte)',
    inconnu: 'à compter d’un point de départ non identifié'
  };

  function libellePointDepart(cle) {
    return LIBELLES_POINT_DEPART[cle] || LIBELLES_POINT_DEPART.inconnu;
  }

  function pointDepartCalculable(cle) {
    const trouve = POINTS_DEPART_CONNUS.find(p => p.cle === cle);
    return !!(trouve && trouve.calculable);
  }

  // Repère TOUS les délais du texte, y compris ceux que detecterDatesDepuisTexte ne peut pas
  // convertir en date (point de départ autre que la signature). Ne calcule rien : c'est
  // construireDatesMetier qui décide, et NEEDS_REVIEW est un résultat légitime.
  // Le connecteur qui introduit le point de départ ne se limite pas à « à compter de » : « dans les
  // deux mois DE LA réalisation de la condition » est tout aussi courant.
  var MOTIF_ANCRE_DELAI = '(?:[àa]\\s+compter\\s+d[eu]|[àa]\\s+partir\\s+d[eu]|apr[èe]s|suivant|de\\s+la|de\\s+l[\'’]|du|des)';

  var RE_DELAI_GENERIQUE = new RegExp(
    '(?:d[ée]lai\\s+de\\s+|au\\s+plus\\s+tard\\s+(?:dans\\s+(?:les?\\s+|un\\s+d[ée]lai\\s+de\\s+)?)?|dans\\s+(?:les?\\s+|un\\s+d[ée]lai\\s+de\\s+))' +
    MOTIF_NOMBRE + '\\s*(jours?|mois)(?:\\s+' + MOTIF_ANCRE_DELAI + '\\s+([^.,;\\n]{0,80}))?',
    'gi'
  );

  function detecterDelais(texte) {
    const source = String(texte || '');
    const resultats = [];
    const re = new RegExp(RE_DELAI_GENERIQUE.source, 'gi');
    let m;
    while ((m = re.exec(source)) !== null) {
      const valeur = valeurNombre(m[1]);
      if (!Number.isFinite(valeur)) continue;
      const contexte = extraireContexte(source, m.index, m[0].length);
      // Même garde-fou que dans detecterDatesDepuisTexte : le délai de notification du refus au
      // notaire n'est pas la condition suspensive elle-même (voir l'historique du 60 j / 70 j).
      const avant = source.slice(Math.max(0, m.index - 200), m.index);
      const ancre = m[3] || '';
      // Classé sur la clause entière (m[0]) et non sur `ancre` seule : voir pointDepartDepuisAncre.
      const pointDepart = ancre ? pointDepartDepuisAncre(m[0]) : 'signature';
      resultats.push({
        index: m.index,
        extrait: contexte,
        delai: { valeur, unite: uniteDelai(m[2]) },
        // Sans ancre explicite, la convention (déjà appliquée par reAuPlusTardDelai) est de compter
        // depuis la signature : « la présente convention est soumise à… au plus tard dans les 60
        // jours ». On le note pour pouvoir l'expliquer à l'étude plutôt que de le taire.
        pointDepart,
        pointDepartImplicite: !ancre,
        ancre: ancre.trim() || null,
        notification: /notifier|notification/i.test(avant),
        suggestion: suggererEcheance(contexte),
        page: pageDepuisIndex(m.index)
      });
    }
    return resultats;
  }

  function champDateVide(raison) {
    return { valeur: null, statut: 'NOT_FOUND', methode: null, origine: 'regex', source: null, candidats: [], calcul: null, raison: raison || '' };
  }

  // Construit un objet date métier par type, à partir des candidates déjà détectées et des délais
  // repérés. Règles issues de la spec :
  //  - une date écrite noir sur blanc (EXPLICIT) n'est JAMAIS remplacée par une date calculée ;
  //  - plusieurs candidates de même type sans formulation permettant de trancher → NEEDS_REVIEW,
  //    avec les deux sources conservées, plutôt qu'un choix arbitraire silencieux ;
  //  - un délai dont le point de départ n'est pas connu → NEEDS_REVIEW SANS valeur : on signale la
  //    clause et son délai, on ne fabrique pas une date depuis la signature « pour faire joli ».
  function construireDatesMetier(detectedDates, delais, dateCompromis) {
    const candidatesToutes = Array.isArray(detectedDates) ? detectedDates : [];
    const delaisTous = Array.isArray(delais) ? delais : [];
    const dates = {};

    dates.SIGNATURE_AVANT_CONTRAT = dateCompromis
      ? { valeur: dateCompromis, statut: 'CONFIRMED', methode: 'EXPLICIT', origine: 'regex', source: null, candidats: [], calcul: null, raison: 'Date de signature de l’avant-contrat détectée dans le document.' }
      : champDateVide('Aucune date de signature trouvée : les délais exprimés en jours ou en mois ne peuvent pas être calculés.');

    for (const typeDate of Object.keys(CHAMP_PAR_TYPE_DATE)) {
      const champ = CHAMP_PAR_TYPE_DATE[typeDate];
      const toutesDuType = candidatesToutes.filter(d => d.suggestion === champ);
      // Une date écrite noir sur blanc l'emporte sur une date calculée depuis un délai : l'acte
      // énonce souvent les deux dans la même phrase (« au plus tard le 15 novembre 2026, soit un
      // délai de 60 jours à compter de la signature »), et les deux diffèrent d'un jour ou deux
      // selon la convention de computation. Sans cette priorité, la date calculée l'emportait —
      // exactement ce que la spec interdit.
      const explicites = toutesDuType.filter(d => !d.calcul);
      const candidats = explicites.length > 0 ? explicites : toutesDuType;

      if (candidats.length > 0) {
        const choix = meilleureCandidateEcheance(candidats, champ);
        const retenu = choix.candidat;
        const calculee = !!(retenu && retenu.calcul);
        // Quand une date écrite a été préférée à une date calculée, on garde cette dernière de
        // côté : si les deux divergent nettement, c'est que deux clauses de l'acte se contredisent
        // (voir controlerCoherence, DATE_EXPLICITE_VS_DELAI).
        const alternative = explicites.length > 0 ? toutesDuType.find(d => d.calcul) : null;
        dates[typeDate] = {
          valeur: retenu ? retenu.iso : null,
          statut: choix.ambigu ? 'NEEDS_REVIEW' : 'CONFIRMED',
          methode: calculee ? 'CALCULATED' : 'EXPLICIT',
          origine: 'regex',
          source: retenu ? { page: retenu.page || null, extrait: retenu.contexte || null, index: typeof retenu.index === 'number' ? retenu.index : null } : null,
          // Les concurrentes ne sont conservées QUE lorsqu'il faut trancher : sinon la fiche
          // afficherait des « candidats » là où il n'y a jamais eu d'hésitation.
          candidats: choix.ambigu
            ? candidats.map(c => ({ valeur: c.iso, origine: 'regex', source: { page: c.page || null, extrait: c.contexte || null } }))
            : [],
          calcul: calculee ? retenu.calcul : null,
          calculAlternatif: alternative ? alternative.iso : null,
          // Classée d'après une correction déjà faite sur une clause très proche : l'étude tient à
          // voir cette provenance (badge « Appris »), au même titre que sur les chips.
          apprise: !!(retenu && retenu.apprise),
          raison: choix.ambigu
            ? 'Plusieurs clauses donnent une date pour cette échéance, sans formulation permettant de trancher.'
            : (calculee ? '' : 'Date lue directement dans l’acte.') // calculée : la ligne « Calculée : … » du panneau le dit déjà
        };
        continue;
      }

      // Aucune date calendaire pour ce type : reste-t-il un délai qui s'y rapporte mais qu'on n'a
      // pas pu convertir ? C'est le cas visé par la spec (« point de départ différent »).
      const delaisDuType = delaisTous.filter(d => d.suggestion === champ && !d.notification);

      // Un délai que detecterDatesDepuisTexte n'a pas su convertir (ses motifs exigent « à compter
      // de »/« au plus tard dans les », alors que detecterDelais reconnaît aussi « dans un délai de
      // 60 jours DE LA promesse ») mais dont le point de départ EST la signature : on le calcule
      // ici plutôt que de le laisser tomber. Sans ça, l'échéance disparaissait purement et
      // simplement de la fiche — signalé par l'étude.
      const delaiCalculable = dateCompromis
        ? delaisDuType.find(d => pointDepartCalculable(d.pointDepart))
        : null;
      if (delaiCalculable) {
        const iso = calculerDateEcheance(dateCompromis, delaiCalculable.delai);
        if (iso) {
          dates[typeDate] = {
            valeur: iso,
            statut: 'CONFIRMED',
            methode: 'CALCULATED',
            origine: 'regex',
            source: { page: delaiCalculable.page || null, extrait: delaiCalculable.extrait, index: delaiCalculable.index },
            candidats: [],
            calcul: { delai: delaiCalculable.delai, pointDepart: delaiCalculable.pointDepart, baseDate: dateCompromis },
            calculAlternatif: null,
            apprise: false,
            // Pas de raison : la ligne « Calculée : 60 jours depuis… » du panneau la dit déjà, mot
            // pour mot — deux phrases identiques l'une sous l'autre n'apprennent rien.
            raison: ''
          };
          continue;
        }
      }

      const delaiOrphelin = delaisDuType.find(d => !pointDepartCalculable(d.pointDepart) || !dateCompromis);
      if (delaiOrphelin) {
        const manqueBase = !dateCompromis && pointDepartCalculable(delaiOrphelin.pointDepart);
        dates[typeDate] = {
          valeur: null,
          statut: 'NEEDS_REVIEW',
          methode: 'CALCULATED',
          origine: 'regex',
          source: { page: delaiOrphelin.page || null, extrait: delaiOrphelin.extrait, index: delaiOrphelin.index },
          candidats: [],
          calcul: { delai: delaiOrphelin.delai, pointDepart: delaiOrphelin.pointDepart, baseDate: null },
          raison: manqueBase
            ? 'Délai trouvé, mais la date de signature de l’avant-contrat est inconnue : à calculer une fois celle-ci renseignée.'
            : 'Délai trouvé, mais son point de départ n’est pas une date figurant dans l’acte : à déterminer.'
        };
        continue;
      }

      dates[typeDate] = champDateVide('');
    }

    return dates;
  }

  // ==== EXTRACTION STRUCTURÉE : adresse ====
  //
  // L'ancien detecterAdresseBien() (voir ADRESSE_BIEN_RE plus haut) renvoie un fragment BRUT, non
  // découpé : impossible d'en tirer le département, qui devient pourtant une donnée pivot (règle
  // du notaire instrumentaire 41/45/37, voir REGLES_NOTAIRE_INSTRUMENTAIRE). parserAdresse()
  // découpe ce fragment en composants, dans un ordre quelconque : un acte écrit aussi bien
  // « 12 rue Victor Hugo, 41000 BLOIS » que « 41000 BLOIS, 12 rue Victor Hugo » ou
  // « Lieu-dit La Grande Maison, 41100 VENDÔME » (bien rural sans numéro ni voie).

  // Liste VOLONTAIREMENT ouverte (la spec insiste : ne pas figer une liste trop restrictive) :
  // `canonique` est la forme retenue à l'affichage, `motifs` les écritures rencontrées, y compris
  // les abréviations. L'ordre compte : les libellés les plus longs sont essayés en premier
  // (« route départementale » avant « route »), sinon le plus court gagnerait par préfixe.
  var TYPES_VOIE = [
    { canonique: 'route départementale', motifs: ['route départementale', 'route departementale', 'rd'] },
    { canonique: 'route nationale', motifs: ['route nationale', 'route nationale', 'rn'] },
    { canonique: 'rond-point', motifs: ['rond-point', 'rond point'] },
    { canonique: 'boulevard', motifs: ['boulevard', 'bd', 'bld', 'boul.'] },
    { canonique: 'avenue', motifs: ['avenue', 'av.', 'av'] },
    { canonique: 'impasse', motifs: ['impasse', 'imp.'] },
    { canonique: 'résidence', motifs: ['résidence', 'residence', 'rés.', 'res.'] },
    { canonique: 'esplanade', motifs: ['esplanade'] },
    { canonique: 'promenade', motifs: ['promenade'] },
    { canonique: 'traverse', motifs: ['traverse'] },
    { canonique: 'faubourg', motifs: ['faubourg', 'fbg'] },
    { canonique: 'passage', motifs: ['passage', 'pass.'] },
    { canonique: 'sentier', motifs: ['sentier', 'sente'] },
    { canonique: 'venelle', motifs: ['venelle'] },
    { canonique: 'domaine', motifs: ['domaine'] },
    { canonique: 'hameau', motifs: ['hameau', 'ham.'] },
    { canonique: 'montée', motifs: ['montée', 'montee'] },
    { canonique: 'square', motifs: ['square', 'sq.'] },
    { canonique: 'chemin', motifs: ['chemin', 'chem.', 'ch.'] },
    { canonique: 'allée', motifs: ['allée', 'allee', 'all.'] },
    { canonique: 'place', motifs: ['place', 'pl.'] },
    { canonique: 'route', motifs: ['route', 'rte'] },
    { canonique: 'cours', motifs: ['cours'] },
    { canonique: 'côte', motifs: ['côte', 'cote'] },
    { canonique: 'cité', motifs: ['cité', 'cite'] },
    { canonique: 'parc', motifs: ['parc'] },
    { canonique: 'quai', motifs: ['quai'] },
    { canonique: 'villa', motifs: ['villa'] },
    { canonique: 'voie', motifs: ['voie'] },
    { canonique: 'clos', motifs: ['clos'] },
    { canonique: 'rue', motifs: ['rue', 'r.'] }
  ];

  function echapperPourRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Alternation construite une fois depuis TYPES_VOIE, triée par longueur décroissante pour que
  // « route départementale » l'emporte sur « route ». Ancrée en début de fragment (^) : le type de
  // voie suit immédiatement le numéro, une fois celui-ci retiré.
  // La borne de fin est un `(?![lettre])` et non un `\b` : une abréviation se terminant par un
  // point (« imp. », « chem. ») ne peut PAS être suivie d'une limite de mot (le point est déjà un
  // caractère non-mot, et l'espace qui suit non plus) — avec `\b`, ces abréviations n'étaient
  // jamais reconnues. Le `(?![lettre])` garde par ailleurs l'effet recherché : « rue » ne doit pas
  // matcher à l'intérieur de « ruelle ».
  var SOURCE_TYPES_VOIE = TYPES_VOIE
    .flatMap(t => t.motifs)
    .sort((a, b) => b.length - a.length)
    .map(echapperPourRegex)
    .join('|');
  var RE_TYPE_VOIE = new RegExp('^(' + SOURCE_TYPES_VOIE + ')(?![a-zA-ZÀ-ÿ])[\\s.]*', 'i');

  // Le point final fait PARTIE du motif déclaré (« imp. », « chem. ») : le retirer avant la
  // comparaison ferait échouer toute abréviation qui n'a pas aussi de variante sans point.
  function typeVoieCanonique(motif) {
    const m = String(motif).toLowerCase().trim();
    const trouve = TYPES_VOIE.find(t => t.motifs.some(x => x.toLowerCase() === m));
    return trouve ? trouve.canonique : null;
  }

  // Un lieu-dit n'est PAS une voie : il ne doit jamais être transformé artificiellement en nom de
  // rue (spec explicite, cas fréquent sur les biens ruraux du secteur de l'étude).
  var RE_LIEU_DIT = /\blieu[-\s]?dit\s+(.+)$/i;

  // Le département se déduit du code postal, jamais du seul nom de commune (plusieurs communes
  // portent des noms proches d'un département à l'autre — la spec insiste sur ce point).
  function departementDepuisCodePostal(cp) {
    const chiffres = String(cp || '').replace(/\s/g, '');
    if (!/^\d{5}$/.test(chiffres)) return null;
    // Corse : le 20 se répartit entre 2A (Corse-du-Sud) et 2B (Haute-Corse).
    if (chiffres.startsWith('20')) return parseInt(chiffres.slice(2), 10) <= 199 ? '2A' : '2B';
    // Outre-mer : département sur trois chiffres (971 Guadeloupe … 976 Mayotte).
    if (chiffres.startsWith('97') || chiffres.startsWith('98')) return chiffres.slice(0, 3);
    return chiffres.slice(0, 2);
  }

  // Numéro en tête de fragment : accepte les formes complexes que la spec demande de ne pas
  // tronquer — « 12 bis », « 12 ter », « 12 A », « 12-14 », « 12/14 ».
  var RE_NUMERO_DEBUT = /^(\d{1,4}\s*[-\/]\s*\d{1,4}|\d{1,4}(?:\s*(?:bis|ter|quater)\b|\s+[A-Za-z]\b)?)\s*,?\s*/i;
  // Numéro rejeté en fin de fragment : « rue Victor Hugo n°12 ».
  var RE_NUMERO_FIN = /\bn\s*[°ºo]\s*(\d{1,4}(?:\s*(?:bis|ter|quater))?)\s*$/i;

  function nettoyerBords(s) {
    return String(s || '').replace(/^[\s,;:.\-–—]+/, '').replace(/[\s,;:.\-–—]+$/, '').trim();
  }

  // Deux ordres d'écriture coexistent, et les confondre est ce qui produisait une commune fausse
  // ANNONCÉE COMME SÛRE (« commune : situé à BLOIS ( ») sur la totalité des actes réels du corpus :
  //   - ordre POSTAL      : « 12 rue Victor Hugo, 41000 BLOIS »  (voie, puis code postal, puis commune)
  //   - ordre NOTARIAL    : « situé à BLOIS (41000), 74 rue des Hautes Granges »
  //                         « A CORMERAY (LOIR-ET-CHER) 41120 Clos des Coudres »
  //                         (commune, puis code postal, puis voie)
  // Trois signatures désignent l'ordre notarial sans ambiguïté : un code postal ENTRE PARENTHÈSES,
  // un nom de DÉPARTEMENT entre parenthèses juste avant le code postal, ou un texte qui, juste
  // après le code postal, commence par un numéro ou un type de voie. Sans l'une d'elles, on
  // retombe sur l'ordre postal, qui reste le cas par défaut.
  var RE_CP_ENTRE_PARENTHESES = /\(\s*\d{5}\s*\)/;
  var RE_DEPARTEMENT_ENTRE_PARENTHESES = /\(\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\s-]{3,28}\)\s*(?=\d{5}\b)/;
  var RE_LIEU_DIT_PREFIXE = /^lieu[-\s]?dit\b/i;
  var RE_LIEU_DIT_CHERCHE = /\blieu[-\s]?dit\s+([^,;.|\n]+)/i;

  // Un tiret n'est un séparateur que s'il est ENTOURÉ D'ESPACES (« VENDÔME – rue Victor Hugo ») :
  // un tiret collé appartient au nom de la commune, très fréquent en France
  // (Romorantin-Lanthenay, Saint-Jean-de-la-Ruelle…) — le couper produisait une commune tronquée.
  var RE_SEPARATEUR_ADRESSE = /[,;]|\s[–—-]\s|\s\/\s/;

  // Amorces qui introduisent la commune dans un acte (« sis à », « située à », « Commune de »,
  // « A BLOIS »…). On garde ce qui suit la DERNIÈRE d'entre elles : « Une maison à usage
  // d'habitation, située à MAROLLES » en contient deux, seule la seconde annonce la commune.
  // La borne de gauche est un `(?<![lettre])` et non un `\b` : en JavaScript, `\b` ne connaît que
  // les caractères ASCII, donc « à » n'y est pas une lettre et `\bà` ne matche JAMAIS un « à »
  // précédé d'une espace — c'est-à-dire le cas normal. Le piège avait déjà été rencontré ailleurs
  // dans ce fichier (voir RE_PREPOSITION_LIEU) : sans cette borne, la commune ressortait « à BLOIS ».
  var RE_AMORCE_COMMUNE = /(?<![A-Za-zÀ-ÿ])(?:sises?|sis|situ[ée]e?s?|se\s+trouvant|commune\s+de|[àa]|au|aux)\s+/gi;

  function communeAvantCodePostal(avant) {
    let texte = nettoyerBords(avant);
    if (!texte) return null;
    const re = new RegExp(RE_AMORCE_COMMUNE.source, 'gi');
    let m, apresAmorce = 0;
    while ((m = re.exec(texte)) !== null) apresAmorce = m.index + m[0].length;
    if (apresAmorce) texte = texte.slice(apresAmorce);
    const morceaux = texte.split(RE_SEPARATEUR_ADRESSE);
    texte = nettoyerBords(morceaux[morceaux.length - 1]);
    return texte && /[A-Za-zÀ-ÿ]/.test(texte) && texte.length <= 60 ? texte : null;
  }

  // La voie est CHERCHÉE dans le reste du fragment, jamais déduite de « tout ce qui n'est pas la
  // commune » : les trames notariales intercalent volontiers une description entre les deux
  // (« Commune de LANDES LE GAULOIS (41190) / Une maison d'habitation situé(e) 510 rue Pitouille »).
  var RE_VOIE_DANS_TEXTE = new RegExp(
    '(?:(\\d{1,4}\\s*[-\\/]\\s*\\d{1,4}|\\d{1,4}(?:\\s*(?:bis|ter|quater)\\b|\\s+[A-Za-z]\\b)?)\\s*,?\\s*)?' +
    '\\b(' + SOURCE_TYPES_VOIE + ')(?![a-zA-ZÀ-ÿ])[\\s.]*' +
    '([A-Za-zÀ-ÿ0-9][^,;.\\n]{1,60})',
    'i'
  );

  function chercherVoie(zone) {
    const m = RE_VOIE_DANS_TEXTE.exec(String(zone || ''));
    if (!m) return null;
    let numero = m[1] ? m[1].replace(/\s*([-\/])\s*/g, '$1').replace(/\s+/g, ' ').trim() : null;
    let nomVoie = nettoyerBords(m[3]) || null;
    // Numéro rejeté en fin de voie (« rue Victor Hugo n°12 »).
    if (nomVoie) {
      const mFin = nomVoie.match(RE_NUMERO_FIN);
      if (mFin) {
        if (!numero) numero = mFin[1].replace(/\s+/g, ' ').trim();
        nomVoie = nettoyerBords(nomVoie.slice(0, mFin.index)) || null;
      }
    }
    return { numero, typeVoie: typeVoieCanonique(m[2]), nomVoie };
  }

  // Découpe un fragment d'adresse en composants. L'ordre des éléments est libre (voir ci-dessus),
  // le numéro peut être absent, et l'adresse d'origine est TOUJOURS conservée telle quelle dans
  // `adresseComplete` — on ne perd jamais ce que dit le document.
  function parserAdresse(brut) {
    const original = String(brut || '').replace(/\s+/g, ' ').trim();
    const vide = {
      adresseComplete: original, numero: null, typeVoie: null, nomVoie: null, lieuDit: null,
      codePostal: null, commune: null, departement: null, statut: 'NOT_FOUND'
    };
    if (!original) return vide;

    // Normalisation : le code postal est ramené hors parenthèses et le nom de département entre
    // parenthèses est retiré. Ni l'un ni l'autre ne change le sens de l'adresse, mais les deux
    // empêchaient le découpage ci-dessous de retrouver la commune.
    const cpEntreParentheses = RE_CP_ENTRE_PARENTHESES.test(original);
    let travail = original.replace(/\(\s*(\d{5})\s*\)/g, '$1');
    const deptEntreParentheses = RE_DEPARTEMENT_ENTRE_PARENTHESES.test(travail);
    travail = travail.replace(new RegExp(RE_DEPARTEMENT_ENTRE_PARENTHESES.source, 'g'), ' ');

    const mCp = travail.match(/\b(\d{5})\b/);
    if (!mCp) return { ...vide, statut: 'NEEDS_REVIEW' };
    const codePostal = mCp[1];
    const avant = travail.slice(0, mCp.index);
    const apresNettoye = nettoyerBords(travail.slice(mCp.index + codePostal.length));

    const debutApres = apresNettoye.slice(0, 40);
    const apresRessembleAVoie = /^\d/.test(debutApres) || RE_TYPE_VOIE.test(debutApres) || RE_LIEU_DIT_PREFIXE.test(debutApres);
    const ordreNotarial = cpEntreParentheses || deptEntreParentheses || apresRessembleAVoie;

    let commune = null;
    let resteAvant = nettoyerBords(avant);
    let resteApres = apresNettoye;

    if (ordreNotarial) {
      commune = communeAvantCodePostal(avant);
      if (commune && resteAvant.endsWith(commune)) {
        resteAvant = nettoyerBords(resteAvant.slice(0, resteAvant.length - commune.length));
      }
    } else {
      const candidat = nettoyerBords(apresNettoye.split(RE_SEPARATEUR_ADRESSE)[0]);
      if (candidat && /[A-Za-zÀ-ÿ]/.test(candidat) && candidat.length <= 60) {
        commune = candidat;
        resteApres = nettoyerBords(apresNettoye.slice(candidat.length));
      } else {
        commune = communeAvantCodePostal(avant);
        if (commune && resteAvant.endsWith(commune)) {
          resteAvant = nettoyerBords(resteAvant.slice(0, resteAvant.length - commune.length));
        }
      }
    }

    let numero = null;
    let typeVoie = null;
    let nomVoie = null;
    let lieuDit = null;

    // La rédaction notariale place la voie APRÈS le code postal, la rédaction postale AVANT : on
    // regarde les deux, en commençant par le côté que l'ordre détecté désigne.
    const zones = ordreNotarial ? [resteApres.slice(0, 90), resteAvant] : [resteAvant, resteApres.slice(0, 90)];
    const mLieuDit = (zones[0] + ' | ' + zones[1]).match(RE_LIEU_DIT_CHERCHE);
    if (mLieuDit) {
      lieuDit = nettoyerBords(mLieuDit[1]) || null;
    } else {
      const voie = chercherVoie(zones[0]) || chercherVoie(zones[1]);
      if (voie) {
        numero = voie.numero;
        typeVoie = voie.typeVoie;
        nomVoie = voie.nomVoie;
      }
    }

    const departement = departementDepuisCodePostal(codePostal);
    // CONFIRMED demande le minimum exploitable : où (commune + code postal) et quoi (une voie ou
    // un lieu-dit). Sans ça, l'adresse est affichée mais signalée à vérifier.
    const complet = !!(codePostal && commune && (nomVoie || lieuDit));
    return {
      adresseComplete: original,
      numero, typeVoie, nomVoie, lieuDit,
      codePostal, commune, departement,
      statut: complet ? 'CONFIRMED' : 'NEEDS_REVIEW'
    };
  }

  // ==== EXTRACTION STRUCTURÉE : notaires ====
  //
  // Entièrement nouveau : jusqu'ici, le rôle de l'étude sur un dossier (instrumentaire ou
  // participant) était saisi à la main, sans aucune aide du document. L'enchaînement voulu par la
  // spec est : personne → étude → adresse → département → qualité → rôle → règle métier.

  // Identité de l'étude, pour reconnaître SON propre office parmi les notaires cités et en déduire
  // son rôle. Les deux graphies rencontrées sont tolérées (GOSSART / GOSSARD). Liste volontairement
  // isolée ici : y ajouter un confrère associé ne demande de toucher à rien d'autre.
  var IDENTITE_ETUDE = { motifs: [/goss?ar[dt]/i] };

  // Règle métier géographique, centralisée en UN SEUL endroit (exigence explicite de la spec :
  // « ne pas coder cette règle de manière dispersée »). Pour un bien situé dans le 41, si le
  // notaire du vendeur est du 41, du 45 ou du 37, c'est lui qui reçoit l'acte. Ajouter un
  // département, ou une seconde règle pour un autre département de bien, se fait ici.
  // ---- Attribution de la minute de l'acte de vente (qui rédige la vente) ----
  //
  // Source : Règlement Professionnel du Notariat, en vigueur depuis le 1er février 2024, et
  // règlement intérieur de la Chambre interdépartementale des notaires du Val de Loire.
  //
  //   Art. 30.4.2 RPN — Vente de gré à gré : « En cas d'intervention de plusieurs notaires, la
  //   minute de la vente appartient au notaire choisi par le VENDEUR. Toutefois, si SEUL le
  //   notaire choisi par l'acquéreur exerce dans le département dans lequel le bien vendu se
  //   situe, celui-ci détient la minute de l'acte. »
  //
  //   Art. 33 RPN — le règlement du conseil régional ou de la chambre interdépartementale prime
  //   sur la seconde partie du RPN. Pour la CIN du Val de Loire (ressort de la Cour d'appel
  //   d'ORLÉANS : Loir-et-Cher 41, Loiret 45, Indre-et-Loire 37), son article 15 maintient les
  //   règles antérieures : « la minute de tout acte de vente dont l'établissement est confié à
  //   des notaires exerçant au sein de la Cour d'Appel sera attribuée au NOTAIRE DU VENDEUR ».
  //   Autrement dit, entre deux notaires du ressort, l'exception départementale du RPN ne joue
  //   pas : c'est toujours le notaire du vendeur.
  //
  // C'est la règle que l'étude avait résumée par « 41/45/37 » : elle porte bien sur le
  // département des DEUX NOTAIRES, pas sur celui du bien.
  var RESSORT_CIN_VAL_DE_LOIRE = ['41', '45', '37'];

  // Renvoie 'vendeur' | 'acquereur' | null (indéterminable faute de départements connus).
  function attribuerMinute(departementNotaireVendeur, departementNotaireAcquereur, departementBien) {
    const dv = departementNotaireVendeur || null;
    const da = departementNotaireAcquereur || null;
    // Règle régionale : deux notaires du ressort de la Cour d'appel d'Orléans → notaire du vendeur.
    if (dv && da && RESSORT_CIN_VAL_DE_LOIRE.includes(dv) && RESSORT_CIN_VAL_DE_LOIRE.includes(da)) {
      return { cote: 'vendeur', source: 'Val de Loire' };
    }
    if (!departementBien || !dv || !da) return null;
    // Art. 30.4.2 : l'exception ne joue que si SEUL le notaire de l'acquéreur exerce dans le
    // département du bien.
    const vendeurDansBien = dv === departementBien;
    const acquereurDansBien = da === departementBien;
    if (acquereurDansBien && !vendeurDansBien) return { cote: 'acquereur', source: 'RPN 30.4.2' };
    return { cote: 'vendeur', source: 'RPN 30.4.2' };
  }

  // L'inverse : on connaît le notaire qui détient la minute (il est nommé en PREMIER dans le
  // préambule, art. 26.3.2 RPN) et on veut savoir de quel côté il est. Il est celui du vendeur
  // dans tous les cas SAUF celui, unique, où l'exception de l'art. 30.4.2 a pu jouer — auquel cas
  // on ne tranche pas plutôt que de deviner.
  function coteDepuisAttribution(departementInstrumentaire, departementSecond, departementBien) {
    const di = departementInstrumentaire || null;
    const ds = departementSecond || null;
    // Sans les deux départements, aucune branche de la règle n'est vérifiable : on ne déduit rien
    // plutôt que d'appliquer un défaut qu'on ne peut pas contrôler. Affecter le mauvais côté
    // ferait chercher les pièces du mauvais notaire.
    if (!di || !ds) return null;
    if (di && ds && RESSORT_CIN_VAL_DE_LOIRE.includes(di) && RESSORT_CIN_VAL_DE_LOIRE.includes(ds)) {
      return { cote: 'vendeur', raison: 'Les deux notaires exercent dans le ressort de la Cour d’appel d’Orléans : la minute revient au notaire du vendeur (règlement de la Chambre du Val de Loire, art. 15).' };
    }
    // Cas où l'exception a pu s'appliquer : l'instrumentaire est le seul dans le département du
    // bien. Il peut alors être le notaire de l'acquéreur — indécidable sans autre indice.
    if (departementBien && di === departementBien && ds && ds !== departementBien) return null;
    return { cote: 'vendeur', raison: 'À défaut de mention contraire, la minute revient au notaire du vendeur (RPN, art. 30.4.2) : le notaire nommé en premier est donc celui du vendeur.' };
  }

  // « Maître X, notaire à Y » et ses variantes (notaire associé, notaire à la résidence de…).
  // Le numéro CRPCEN est inséré entre le nom et la qualité dans beaucoup de trames (« Maître
  // Sophie GOSSART, CRPCEN 41089, notaire à BLOIS »). Le groupe du nom excluant la virgule, le
  // motif ne pouvait pas la franchir : le préambule — donc l'ordre de citation, qui désigne
  // l'instrumentaire (art. 26.3.2 RPN) — n'était tout simplement jamais reconnu sur ces actes.
  // Le NOM est repéré d'abord, son office et son département sont résolus ensuite, séparément.
  // Un motif unique exigeant « Maître X, notaire à VILLE » ne couvrait qu'une partie des trames :
  // « Maître X, CRPCEN 41089, notaire à BLOIS » (la virgule du CRPCEN bloquait le groupe du nom)
  // et « Maître X, notaire associé, membre de la SCP …, titulaire d'un office notarial aux
  // MONTILS » y échappaient tous les deux. Or ce notaire-là est le PREMIER NOMMÉ, donc celui qui
  // détient la minute (art. 26.3.2 RPN) : il disparaissait purement et simplement de la liste.
  // `Ma[îi]tre(?!s)` : le pluriel introduit la raison sociale d'une SCP (« Maîtres X et Y,
  // notaires associés »), pas une comparution.
  var RE_MENTION_NOTAIRE = /Ma[îi]tre(?!s)\s+([A-ZÀ-Ü][A-Za-zÀ-ÿ'’-]*(?:\s+[A-ZÀ-Ü'’][A-Za-zÀ-ÿ'’-]*){0,4})/g;

  // Emplacement de l'office, sous ses formes usuelles.
  var RE_OFFICE_NOTAIRE = /(?:notaires?\s+(?:associ[ée]e?s?\s+)?(?:[àa]\s+la\s+r[ée]sidence\s+d[eu]\s+)?[àa]\s+|office\s+notarial\s+(?:sis\s+)?(?:[àa]|aux?)\s+|si[èe]ge\s+(?:social\s+)?est\s+[àa]\s+)([A-ZÀ-Ü][^,;.\n()]{1,45})/i;

  // Une occurrence de « Maître » qui ne parle pas d'un notaire (un avocat, une citation) n'est pas
  // une comparution : la fenêtre doit porter la qualité ou le numéro d'office.
  var RE_QUALITE_NOTAIRE = /notaire|crpcen|office\s+notarial/i;

  // Le CRPCEN identifie l'office ; ses DEUX PREMIERS CHIFFRES sont le département. C'est une
  // source bien plus sûre que le nom de la commune, qui ne s'accompagne pas toujours d'un code
  // postal — et le département des notaires est ce qui décide de l'attribution de la minute
  // (art. 30.4.2 RPN et règle du Val de Loire, voir attribuerMinute).
  var RE_INTRODUCTION_NOTAIRE_SUIVANT = /avec\s+(?:le\s+concours|la\s+participation)[^.]*$/i;

  var PORTEE_QUALITE_NOTAIRE = 220;

  var RE_CRPCEN = /CRPCEN\s*n?[°º]?\s*:?\s*(\d{2})\d{3}\b/i;

  // La capture de la commune court jusqu'à la ponctuation suivante et ramasse au passage ce qui
  // suit (« BEAUGENCY le 23 avril 2004 », « BLOIS identifié sous le numéro CRPCEN »). On ne garde
  // que la tête du fragment : le nom d'une commune s'arrête au premier mot de liaison.
  var RE_SUITE_HORS_COMMUNE = /\s+(?:le|la|les|identifi|soussign|volume|num[ée]ro|en|au|aux|dont|titulaire|membre|exer[çc])/i;

  function nettoyerCommuneNotaire(brut) {
    let ville = String(brut || '').replace(/\s+/g, ' ').trim();
    const m = ville.match(RE_SUITE_HORS_COMMUNE);
    if (m && m.index > 0) ville = ville.slice(0, m.index);
    return ville.trim();
  }

  // Mention explicite du notaire qui reçoit l'acte : priorité absolue sur toute règle métier.
  // Définition donnée par l'étude — « le notaire instrumentaire est celui qui a RÉDIGÉ » : les
  // formes du verbe rédiger sont donc reconnues au même titre que « recevra l'acte », y compris au
  // PASSÉ (« acte rédigé par »), et « notaire rédacteur », terme notarial courant pour le désigner.
  var RE_ROLE_INSTRUMENTAIRE = /(?:recevra\s+l['’]acte|acte\s+(?:authentique\s+)?(?:sera\s+)?re[çc]u\s+par|r[ée]dig(?:era|[ée]e?)\s+(?:par|l['’]acte)|notaire\s+r[ée]dacteur|acte\s+(?:sera\s+)?dress[ée]\s+par|notaire\s+instrumentaire|en\s+l['’][ée]tude\s+de)/i;
  // « participant » et « en concours » désignent le même rôle (le second notaire), comme l'étude
  // l'a confirmé — les deux vocabulaires coexistent dans les actes.
  var RE_ROLE_PARTICIPANT = /(?:avec\s+(?:la\s+)?participation\s+de|en\s+participation|notaire\s+(?:participant|concourant)|en\s+concours(?:\s+avec)?|assist[ée]e?\s+de)/i;

  // Clause d'ORIGINE DE PROPRIÉTÉ : elle décrit l'acte PRÉCÉDENT par lequel le vendeur est devenu
  // propriétaire, et nomme donc le notaire de la vente d'AVANT — jamais celui de l'acte en cours.
  // Elle figure dans presque tous les avant-contrats, avec exactement le vocabulaire que
  // RE_ROLE_INSTRUMENTAIRE cherche (« suivant acte reçu par Maître X », « acte rédigé par… ») :
  // sans ce garde-fou, elle désignerait le mauvais notaire AVEC LA PRIORITÉ LA PLUS HAUTE, écrasant
  // la règle géographique et la règle de zone. Devenu indispensable en ajoutant les formes au passé
  // du verbe rédiger ci-dessus, qui sont précisément celles de ces clauses.
  var RE_ORIGINE_PROPRIETE = /(?:origine\s+de\s+propri[ée]t[ée]|suivant\s+acte|aux\s+termes\s+d['’]un\s+acte|pour\s+l['’]avoir\s+(?:acquis|recueilli)|ant[ée]rieurement\s+acquis|service\s+de\s+la\s+publicit[ée]\s+fonci[èe]re|titre\s+de\s+propri[ée]t[ée]|effet\s+relatif|d[ée]p[ôo]t\s+au\s+rang\s+des\s+minutes|pr[ée]c[ée]dent\s+(?:vendeur|propri[ée]taire))/i;

  // Un notaire présenté AVEC UNE DATE (« dressé par Maître X, notaire à BLOIS, LE 28 février
  // 1985 ») est celui d'un acte antérieur : un notaire qui intervient au présent acte n'est jamais
  // introduit par une date. Repère générique, qui ne dépend d'aucune formule d'origine de
  // propriété particulière.
  var RE_NOTAIRE_DATE_ANTERIEURE = /^[^.\n]{0,80}?,?\s*(?:en\s+date\s+d[ue]|le)\s+\d{1,2}(?:er)?\s+[a-zà-ÿ]{3,10}\s+\d{4}/i;

  // Distingue un notaire QUI INTERVIENT à l'acte d'un notaire simplement CITÉ (origine de
  // propriété, acte antérieur, règlement de copropriété dressé en 1969…). Sans cette distinction,
  // un compromis d'agence dont le seul notaire est le nôtre ressortait avec trois « notaires »,
  // et la règle du notaire unique — il représente alors les deux parties — ne s'appliquait jamais.
  function estNotaireCite(fenetreAvant, fenetreApres) {
    if (RE_ORIGINE_PROPRIETE.test(fenetreAvant) || RE_ORIGINE_PROPRIETE.test(fenetreApres)) return true;
    return RE_NOTAIRE_DATE_ANTERIEURE.test(fenetreApres);
  }

  // OÙ les notaires sont nommés, selon le type d'acte — précisé par l'étude : « le nom des notaires
  // est toujours situé en première page pour les promesses de vente et dérivées ; pour les
  // compromis de vente plutôt en fin d'acte ». Les deux zones sont donc distinctes, et chercher au
  // mauvais endroit revient à lire des notaires cités à tout autre titre dans le corps de l'acte
  // (origine de propriété, servitude, acte antérieur...).
  //
  // 2500 caractères en tête : de quoi couvrir un en-tête complet sans mordre sur le corps de
  // l'acte. 3000 en fin : le bloc de clôture d'un compromis (comparution des notaires, signature)
  // est un peu plus étalé qu'un en-tête.
  var ZONE_ENTETE_ACTE = 2500;
  var ZONE_FIN_ACTE = 3000;

  // Ce qui décide vraiment de l'emplacement, c'est la FORME de l'acte, pas son nom — précision de
  // l'étude : « la promesse synallagmatique est à traiter comme une promesse de vente car acte
  // authentique reçu par notaire et pas un acte sous seing privé ». Un acte AUTHENTIQUE s'ouvre
  // par la comparution des notaires (« PAR-DEVANT Maître X… »), donc en première page ; un acte
  // SOUS SEING PRIVÉ (le compromis d'agence, le cas courant) ne les nomme qu'en fin, au moment de
  // désigner qui recevra la vente.
  //
  // À ne pas confondre avec le TYPE d'acte, qui répond à une autre question (qui s'engage à quoi,
  // donc les rôles vendeur/acquéreur) : une promesse synallagmatique reste un COMPROMIS pour les
  // parties — les deux y sont engagées — tout en étant authentique pour la forme. Les deux
  // notions sont donc séparées plutôt que déduites l'une de l'autre.
  var RE_FORME_AUTHENTIQUE = /par[-\s]devant\s+(?:ma[îi]tre|nous|les?\s+notaires?)|re[çc]u\s+en\s+la\s+forme\s+authentique|demeurera?\s+en\s+minute|promesse\s+synallagmatique/i;
  var RE_FORME_SOUS_SEING_PRIVE = /sous\s+seing\s+priv[ée]|sous\s+signatures?\s+priv[ée]e?s?/i;

  // Forme de l'acte, lue dans son EN-TÊTE uniquement : « PAR-DEVANT Maître » ouvre un acte
  // authentique, et « sous seing privé » se déclare de même en tête. Chercher dans tout le
  // document confondrait cette déclaration avec les innombrables mentions de l'acte authentique À
  // VENIR (« la vente sera réitérée par acte authentique »), qui remplissent justement les
  // compromis sous seing privé — c'est le piège principal ici.
  //
  // « promesse synallagmatique » figure parmi les marqueurs d'authenticité non comme une forme,
  // mais parce que l'étude a indiqué que ce type d'acte est toujours reçu par notaire.
  function detecterFormeActe(texte) {
    const entete = String(texte || '').slice(0, ZONE_ENTETE_ACTE);
    if (RE_FORME_AUTHENTIQUE.test(entete)) return 'authentique';
    if (RE_FORME_SOUS_SEING_PRIVE.test(entete)) return 'sous-seing-prive';
    return null;
  }

  // Repli quand la forme n'est pas déclarée lisiblement : le nom de l'acte reste le meilleur
  // indice disponible (une promesse est reçue par notaire, un compromis est en général l'acte
  // d'agence sous seing privé). Une seule table, comme REGLES_NOTAIRE_INSTRUMENTAIRE.
  var ZONE_NOTAIRES_PAR_TYPE = {
    PROMESSE_DE_VENTE: 'entete',
    PROMESSE_D_ACHAT: 'entete',
    COMPROMIS_DE_VENTE: 'fin'
  };

  // Zone où chercher les notaires : la FORME d'abord (ce qui décide réellement), le type d'acte
  // seulement en repli.
  function zoneNotairesPourActe(texte, typeActe) {
    const forme = detecterFormeActe(texte);
    if (forme === 'authentique') return 'entete';
    if (forme === 'sous-seing-prive') return 'fin';
    return ZONE_NOTAIRES_PAR_TYPE[typeActe] || null;
  }

  // Rattachement d'un notaire à une partie : « notaire du vendeur », « conseil de l'acquéreur »…
  // L'article DÉFINI manquait à l'alternance : le motif acceptait « notaire du vendeur » mais pas
  // « assistant LE PROMETTANT » ni « assistant LE BENEFICIAIRE », qui sont pourtant la forme
  // standard de la comparution d'un acte authentique. C'est ce seul mot qui laissait le côté de
  // chaque notaire indéterminé sur la totalité des actes du corpus, alors que plusieurs le
  // disaient noir sur blanc.
  var RE_COTE_NOTAIRE = /(?:notaire|conseil|assistant?e?|repr[ée]sentant)\s+(?:d[eu]\s+|de\s+la\s+|de\s+l['’]|des\s+|les?\s+|la\s+|l['’])?(vendeurs?|promettants?|acqu[ée]reurs?|acheteurs?|b[ée]n[ée]ficiaires?|parties?\s+venderesses?|parties?\s+acqu[ée]reuses?)/i;

  function qualiteDepuisMot(mot) {
    const m = String(mot || '').toLowerCase();
    if (RE_QUALITE_PROMETTANT.test(m)) return 'promettant';
    if (RE_QUALITE_BENEFICIAIRE.test(m)) return 'beneficiaire';
    if (RE_QUALITE_VENDEUR.test(m)) return 'vendeur';
    if (RE_QUALITE_ACQUEREUR.test(m)) return 'acquereur';
    return null;
  }

  // Repère les notaires cités, leur étude, leur adresse (donc leur département) et le côté auquel
  // ils se rattachent. Plusieurs notaires du même côté sont possibles : on ne suppose jamais qu'il
  // n'y en a qu'un.
  // Isole le fragment d'adresse d'un texte qui en contient plus que l'adresse : on découpe en
  // groupes séparés par des virgules, on garde celui qui porte le code postal, et le précédent s'il
  // ressemble à une voie. Sans ce découpage, parserAdresse prenait la suite de la phrase
  // (« …41000 BLOIS, notaire du vendeur ») et rangeait « notaire du vendeur » en commune.
  // Le fragment va d'un cran avant le code postal à un cran après : la rédaction postale place la
  // voie AVANT, la rédaction notariale APRÈS (voir parserAdresse). Le retour à la ligne n'est
  // surtout PAS un séparateur — un PDF coupe ses lignes où sa mise en page le veut, et couper
  // dessus rendait « ORLEANS (LOIRET) 45000 11 Rue », sans le nom de la voie.
  // Bornes du fragment retenu autour du code postal. Sans elles, le repli qui cherche une adresse
  // dans TOUTE la section désignation renvoyait la section entière (tableau cadastral et
  // description des pièces compris) comme « adresse du bien ».
  var AVANT_CODE_POSTAL = 80;
  var APRES_CODE_POSTAL = 90;

  function fenetreAutourDuCodePostal(source) {
    const m = source.match(/\b\d{5}\b/);
    if (!m) return source;
    const debutBrut = Math.max(0, m.index - AVANT_CODE_POSTAL);
    const avant = source.slice(debutBrut, m.index);
    // En amont, la phrase précédente s'arrête au dernier point ou deux-points.
    const coupeAvant = Math.max(avant.lastIndexOf('. '), avant.lastIndexOf(' : '));
    const debut = coupeAvant === -1 ? debutBrut : debutBrut + coupeAvant + 1;
    const apres = source.slice(m.index + 5, m.index + 5 + APRES_CODE_POSTAL);
    // En aval, l'adresse s'arrête à la fin de la phrase ou à un deux-points (« comprenant : »).
    const coupeApres = apres.search(/[.;:]/);
    const fin = m.index + 5 + (coupeApres === -1 ? apres.length : coupeApres);
    return source.slice(debut, fin);
  }

  function extraireFragmentAdresse(texte) {
    const source = fenetreAutourDuCodePostal(String(texte || '').replace(/\s+/g, ' '));
    if (!/\b\d{5}\b/.test(source)) return null;
    const groupes = source.split(/[,;]/);
    const iCp = groupes.findIndex(g => /\b\d{5}\b/.test(g));
    if (iCp === -1) return null;
    const precedent = iCp > 0 ? groupes[iCp - 1].trim() : '';
    const suivant = iCp + 1 < groupes.length ? groupes[iCp + 1].trim() : '';
    const garderPrecedent = /\d/.test(precedent) || RE_TYPE_VOIE.test(precedent) || RE_LIEU_DIT_PREFIXE.test(precedent);
    const morceaux = [];
    if (garderPrecedent) morceaux.push(precedent);
    morceaux.push(groupes[iCp].trim());
    if (suivant) morceaux.push(suivant);
    return morceaux.join(', ').replace(/\s+/g, ' ').trim();
  }

  // Début de la phrase courante : le rattachement d'un notaire à une partie (« Le notaire du
  // vendeur, Maître X ») est toujours dans la MÊME phrase que sa mention.
  function debutPhrase(texte, index) {
    const avant = String(texte || '').slice(0, index);
    const coupure = Math.max(avant.lastIndexOf('.'), avant.lastIndexOf('\n'));
    return coupure === -1 ? 0 : coupure + 1;
  }

  function detecterNotaires(texte, typeActe) {
    const source = String(texte || '');
    if (!source) return [];
    const type = TYPES_ACTE.includes(typeActe) ? typeActe : 'INCONNU';

    // Premier passage : repérer toutes les mentions, pour pouvoir ensuite borner la fenêtre de
    // chaque notaire par son voisin. Sans cette borne, « notaire du vendeur » écrit à la fin de la
    // ligne précédente était attribué au notaire suivant, et une mention « qui recevra l'acte »
    // était comptée pour les deux à la fois.
    const mentions = [];
    const re = new RegExp(RE_MENTION_NOTAIRE.source, 'g');
    let m;
    while ((m = re.exec(source)) !== null) {
      const nom = m[1].replace(/\s+/g, ' ').trim();
      if (!estNomValide(nom)) continue;
      // La qualité doit être portée par le voisinage immédiat, sans quoi « Maître » peut désigner
      // un avocat ou apparaître dans une citation.
      if (!RE_QUALITE_NOTAIRE.test(source.slice(m.index, m.index + PORTEE_QUALITE_NOTAIRE))) continue;
      mentions.push({ index: m.index, longueur: m[0].length, nom });
    }

    const resultats = [];
    const vus = new Set();
    mentions.forEach((mention, i) => {
      const suivante = mentions[i + 1];
      const debut = debutPhrase(source, mention.index);
      const fin = Math.min(
        source.length,
        mention.index + mention.longueur + 400,
        suivante ? suivante.index : source.length
      );
      // La phrase qui introduit le notaire SUIVANT (« Avec le concours de… », « Avec la
      // participation de… ») se trouve, par construction, avant sa mention — donc dans la fenêtre
      // du précédent. Sans la retirer, le premier notaire de chaque acte était marqué
      // « participant » alors que c'est le second qui l'est.
      const fenetre = source.slice(debut, fin).replace(RE_INTRODUCTION_NOTAIRE_SUIVANT, ' ');

      // Un notaire simplement CITÉ (origine de propriété, acte antérieur, règlement de
      // copropriété dressé il y a quarante ans) n'intervient pas à l'acte : il est écarté de la
      // liste, et pas seulement privé de rôle. Sans cela, un compromis d'agence dont le seul
      // notaire est le nôtre ressortait avec trois « notaires » — et la règle du notaire unique,
      // qui représente alors LES DEUX PARTIES, ne pouvait jamais s'appliquer.
      const avantMention = source.slice(debut, mention.index);
      const apresMention = source.slice(mention.index + mention.longueur, mention.index + mention.longueur + 200);
      if (estNotaireCite(avantMention, apresMention)) return;

      // Dédoublonnage sur le PATRONYME (dernier mot) : le même notaire est cité tantôt avec son
      // prénom, tantôt sans, et chaque forme comptait pour une personne distincte. APRÈS le filtre
      // ci-dessus, et non avant : le même notaire figure souvent d'abord dans l'origine de
      // propriété (il a reçu la vente précédente) puis, plus loin, comme rédacteur du présent
      // acte — dédoublonner en premier retenait la mention citée et faisait disparaître la bonne.
      const cle = normaliserMaj(mention.nom.split(/\s+/).pop());
      if (vus.has(cle)) return;
      vus.add(cle);

      const mCote = fenetre.match(RE_COTE_NOTAIRE);
      const qualite = mCote ? qualiteDepuisMot(mCote[1]) : null;
      const cote = qualite ? (roleDepuisQualite(type, qualite) === 'VENDEUR' ? 'vendeur' : 'acquereur') : 'inconnu';

      let roleExplicite = null;
      if (RE_ROLE_INSTRUMENTAIRE.test(fenetre)) roleExplicite = 'instrumentaire';
      else if (RE_ROLE_PARTICIPANT.test(fenetre)) roleExplicite = 'participant';

      // Le département vient du CODE POSTAL, jamais du seul nom de commune : deux communes de
      // départements différents peuvent porter des noms proches (point insisté par la spec).
      const fragment = extraireFragmentAdresse(source.slice(mention.index, fin));
      const adresse = fragment ? parserAdresse(fragment) : null;
      const adresseUtile = adresse && adresse.codePostal ? adresse : null;
      // Le CRPCEN prime sur le code postal : il désigne l'OFFICE, alors qu'une adresse trouvée
      // dans la même fenêtre peut être celle du bien ou d'un bureau annexe.
      // L'office et le CRPCEN se cherchent À PARTIR DU NOM, pas depuis le début de la phrase :
      // « PAR-DEVANT Maître A, notaire à BLOIS, et Maître B, notaire à ORLEANS » donnait sinon
      // BLOIS aux deux, la fenêtre du second remontant jusqu'à l'office du premier. Le côté et le
      // rôle, eux, gardent la phrase entière : ils peuvent précéder le nom (« Le notaire du
      // vendeur, Maître X »).
      const fenetreApresNom = source.slice(mention.index, fin);
      const mCrpcen = fenetreApresNom.match(RE_CRPCEN);
      const departement = mCrpcen ? mCrpcen[1] : (adresseUtile ? adresseUtile.departement : null);
      const mOffice = fenetreApresNom.match(RE_OFFICE_NOTAIRE);
      const ville = mOffice ? nettoyerCommuneNotaire(mOffice[1]) : '';

      resultats.push({
        nom: mention.nom,
        office: ville,
        adresse: adresseUtile,
        codePostal: adresseUtile ? adresseUtile.codePostal : null,
        commune: ville || (adresseUtile ? adresseUtile.commune : null),
        departement,
        cote,
        roleExplicite,
        // Dans quelle zone de l'acte cette mention tombe : c'est l'ordre de citation À L'INTÉRIEUR
        // de la bonne zone qui désigne l'instrumentaire puis le participant (voir
        // ZONE_NOTAIRES_PAR_TYPE et determinerNotaires, dernier recours). Un acte court peut
        // porter les deux drapeaux sur la même mention — sans conséquence, le type d'acte décide
        // seul de la zone consultée.
        enTete: mention.index < ZONE_ENTETE_ACTE,
        enFin: mention.index >= source.length - ZONE_FIN_ACTE,
        source: { extrait: extraireContexte(source, mention.index, mention.longueur), index: mention.index, page: pageDepuisIndex(mention.index) }
      });
    });
    return resultats;
  }

  // Complète les côtés par ÉLIMINATION : il n'y en a que deux. Quand l'acte désigne le côté d'un
  // seul notaire — cas très fréquent, la comparution ne qualifiant souvent que le second
  // (« assistant le BENEFICIAIRE ») — celui du second s'en déduit sans rien deviner.
  function completerCotesParElimination(liste) {
    const connus = liste.filter(n => n.cote === 'vendeur' || n.cote === 'acquereur');
    const inconnus = liste.filter(n => n.cote === 'inconnu');
    if (connus.length !== 1 || inconnus.length !== 1) return;
    inconnus[0].cote = connus[0].cote === 'vendeur' ? 'acquereur' : 'vendeur';
    inconnus[0].coteDeduite = 'elimination';
  }

  // Détermine qui reçoit l'acte. Ordre de priorité :
  //   1. mention explicite dans le document (« l'acte sera reçu par Maître X ») ;
  //   2. l'ordre de citation dans le préambule : le notaire attributaire de la minute y est
  //      nommé EN PREMIER (art. 26.3.2 RPN) ;
  //   3. sinon, rien n'est tranché — NEEDS_REVIEW, jamais un choix arbitraire.
  // Les CÔTÉS (vendeur/acquéreur) se lisent d'abord dans l'acte, puis par élimination, puis se
  // déduisent de la règle d'attribution de la minute (voir coteDepuisAttribution).
  function determinerNotaires(notaires, departementBien, typeActe, zoneFournie) {
    const liste = Array.isArray(notaires) ? notaires : [];
    // L'élimination ne porte que sur les notaires de la COMPARUTION : eux seuls représentent une
    // partie. Un notaire cité ailleurs dans l'acte (origine de propriété, acte antérieur) compte
    // sinon comme un côté inconnu de plus et bloque la déduction.
    const zoneCourante = zoneFournie || ZONE_NOTAIRES_PAR_TYPE[typeActe];
    const comparution = zoneCourante
      ? liste.filter(n => (zoneCourante === 'entete' ? n.enTete : n.enFin))
      : [];
    completerCotesParElimination(comparution.length >= 2 ? comparution : liste);
    const cotesVendeur = liste.filter(n => n.cote === 'vendeur');
    const cotesAcquereur = liste.filter(n => n.cote === 'acquereur');
    const explicites = liste.filter(n => n.roleExplicite === 'instrumentaire');

    const resultat = {
      liste,
      vendeur: cotesVendeur[0] || null,
      acquereur: cotesAcquereur[0] || null,
      instrumentaire: null,
      participant: null,
      statut: 'NOT_FOUND',
      raison: '',
      roleEtude: null
    };

    if (liste.length === 0) {
      resultat.raison = 'Aucun notaire identifié dans le document.';
      return resultat;
    }

    // Deux notaires désignés instrumentaires, ou deux notaires d'un même côté : on ne tranche pas.
    if (explicites.length > 1) {
      resultat.statut = 'NEEDS_REVIEW';
      resultat.raison = 'Plusieurs notaires sont présentés comme recevant l’acte : à vérifier dans le document.';
      return resultat;
    }

    // Un seul notaire intervient : il n'y a rien à répartir — les règles d'attribution ne visent
    // que « l'intervention de plusieurs notaires » (art. 30.4.2 RPN) — et il représente LES DEUX
    // PARTIES. Cas courant signalé par l'étude : sans confrère, le notaire reçoit l'acte pour le
    // vendeur comme pour l'acquéreur, et les deux champs de la fiche portent donc son nom — en
    // laisser un vide suggérerait qu'il manque quelqu'un. Traité AVANT les autres règles et non
    // comme leur repli : une formule aussi banale que « en l'étude de Maître X » suffisait sinon à
    // partir sur la branche « mention explicite », qui ne remplit aucun côté.
    if (liste.length === 1) {
      resultat.instrumentaire = liste[0];
      resultat.participant = null;
      resultat.vendeur = liste[0];
      resultat.acquereur = liste[0];
      resultat.notaireUnique = true;
      resultat.statut = 'CONFIRMED';
      resultat.raison = 'Un seul notaire intervient : il représente les deux parties et la minute lui revient.';
    } else if (explicites.length === 1) {
      resultat.instrumentaire = explicites[0];
      resultat.statut = 'CONFIRMED';
      resultat.raison = 'Le document désigne explicitement ce notaire pour recevoir l’acte.';
    } else if (resultat.vendeur && resultat.acquereur) {
      // Les deux côtés sont connus : c'est exactement le cas que la règle d'attribution tranche.
      const attribution = attribuerMinute(resultat.vendeur.departement, resultat.acquereur.departement, departementBien);
      if (attribution) {
        resultat.instrumentaire = attribution.cote === 'vendeur' ? resultat.vendeur : resultat.acquereur;
        resultat.participantZone = attribution.cote === 'vendeur' ? resultat.acquereur : resultat.vendeur;
        resultat.statut = 'CONFIRMED';
        resultat.raison = attribution.source === 'Val de Loire'
          ? 'Les deux notaires exercent dans le ressort de la Cour d’appel d’Orléans : la minute revient au notaire du vendeur (règlement de la Chambre du Val de Loire, art. 15).'
          : (attribution.cote === 'vendeur'
            ? 'La minute de la vente revient au notaire du vendeur (RPN, art. 30.4.2).'
            : 'Seul le notaire de l’acquéreur exerce dans le département du bien : la minute lui revient (RPN, art. 30.4.2).');
      }
    }
    if (!resultat.instrumentaire && explicites.length !== 1) {
      {
        // À défaut : l'ordre de citation dans la zone où cet acte nomme ses notaires —
        // première page pour une promesse, fin d'acte pour un compromis (voir
        // ZONE_NOTAIRES_PAR_TYPE). Le premier nommé reçoit l'acte, le second participe.
        // N'intervient qu'ici, une fois les deux règles supérieures épuisées : une mention
        // explicite ou la règle géographique restent prioritaires, et ce cas ne peut donc rien
        // faire régresser de ce qui était déjà tranché.
        const zone = zoneCourante;
        const dansZone = comparution;
        if (dansZone.length >= 2) {
          resultat.instrumentaire = dansZone[0];
          resultat.participantZone = dansZone[1];
          resultat.statut = 'CONFIRMED';
          // Ordre confirmé par l'étude : « le notaire instrumentaire est celui qui a rédigé, et
          // celui en participation ou en concours est celui qui est en second ».
          resultat.raison = zone === 'entete'
            ? 'Premier notaire nommé en tête de la première page de la promesse : c’est lui qui a rédigé l’acte (le second intervient en participation).'
            : 'Premier notaire nommé en fin de compromis : c’est lui qui a rédigé l’acte (le second intervient en participation).';
        } else {
          resultat.statut = 'NEEDS_REVIEW';
          resultat.raison = dansZone.length === 1
            ? 'Un seul notaire est nommé dans cet acte : rien n’indique une intervention à deux.'
            : 'Aucune mention explicite et les notaires ne sont pas identifiables dans le préambule : à confirmer.';
        }
      }
    }

    if (resultat.instrumentaire && resultat.notaireUnique) {
      resultat.roleEtude = deduireRoleEtude(resultat);
    } else if (resultat.instrumentaire) {
      const participantExplicite = liste.find(n => n.roleExplicite === 'participant' && n !== resultat.instrumentaire);
      resultat.participant = participantExplicite
        || resultat.participantZone
        || liste.find(n => n !== resultat.instrumentaire && (n.cote === 'vendeur' || n.cote === 'acquereur'))
        || null;
      delete resultat.participantZone;

      // Les côtés ne sont toujours pas connus : les déduire de la règle d'attribution de la
      // minute. Le notaire nommé en premier détient la minute (art. 26.3.2 RPN), et la minute
      // revient au notaire du VENDEUR — toujours entre deux notaires du ressort de la Cour
      // d'appel d'Orléans, par défaut ailleurs (voir coteDepuisAttribution).
      if (!resultat.vendeur && !resultat.acquereur && resultat.instrumentaire && resultat.participant) {
        const deduction = coteDepuisAttribution(
          resultat.instrumentaire.departement,
          resultat.participant.departement,
          departementBien
        );
        if (deduction) {
          const vendeur = deduction.cote === 'vendeur' ? resultat.instrumentaire : resultat.participant;
          const acquereur = vendeur === resultat.instrumentaire ? resultat.participant : resultat.instrumentaire;
          vendeur.cote = 'vendeur';
          vendeur.coteDeduite = 'attribution';
          acquereur.cote = 'acquereur';
          acquereur.coteDeduite = 'attribution';
          resultat.vendeur = vendeur;
          resultat.acquereur = acquereur;
          resultat.raisonCotes = deduction.raison;
        }
      }

      resultat.roleEtude = deduireRoleEtude(resultat);
    }

    return resultat;
  }

  function estEtude(notaire) {
    if (!notaire) return false;
    const texte = `${notaire.nom || ''} ${notaire.office || ''}`;
    return IDENTITE_ETUDE.motifs.some(re => re.test(texte));
  }

  // Le rôle de l'étude découle de sa place parmi les notaires identifiés : si c'est elle qui reçoit
  // l'acte, elle est instrumentaire ; si elle est citée sans recevoir l'acte, elle est participante.
  // null = l'étude n'est pas reconnue dans le document, et le sélecteur n'est pas touché.
  function deduireRoleEtude(resultat) {
    if (!resultat) return null;
    if (estEtude(resultat.instrumentaire)) return 'instrumentaire';
    if ((resultat.liste || []).some(estEtude)) return 'participant';
    return null;
  }

  // Libellé d'un notaire tel qu'il sera écrit dans le champ libre de la fiche : « Sophie GOSSART
  // (BLOIS) ». Une chaîne, pas un objet — ces deux champs sont directement éditables par l'étude
  // (elle peut corriger une lecture fausse, ou saisir un notaire que le document ne nommait pas).
  // « Maître » est ajouté ici et pas dans la détection : RE_NOTAIRE s'ancre justement sur ce mot
  // pour trouver le nom, qu'elle ne capture donc jamais. Le test de présence évite de le doubler
  // sur un nom déjà saisi « Maître X » à la main par l'étude.
  function libelleNotaire(n) {
    if (!n || !n.nom) return '';
    const nom = /^ma[îi]tre\b/i.test(n.nom.trim()) ? n.nom.trim() : `Maître ${n.nom.trim()}`;
    const office = String(n.office || n.commune || '').trim();
    return office ? `${nom} (${office})` : nom;
  }

  // Ce qui est enregistré sur le dossier à la création : le notaire de chaque côté, et de quel
  // côté se trouve celui qui rédige l'acte. Quand l'acte ne dit PAS de quel côté intervient chaque
  // notaire (comparution simple en tête d'acte authentique, cas fréquent), les deux champs restent
  // VIDES plutôt que devinés — les noms détectés restent proposés dans la liste déroulante du
  // champ (`detectes`), à l'étude de les affecter. Choix explicite de l'étude.
  function cotesNotairesPourDossier(notaires) {
    const vide = { vendeur: '', acquereur: '', coteInstrumentaire: null, detectes: [] };
    if (!notaires) return vide;
    const liste = Array.isArray(notaires.liste) ? notaires.liste : [];
    const memeNotaire = (a, b) => !!(a && b && a.nom && b.nom && a.nom === b.nom);
    const detectes = liste.map(n => ({
      nom: libelleNotaire(n),
      // Le rédacteur repéré à l'import garde son rôle même sans côté : une fois que l'étude aura
      // affecté ce nom à l'un des deux champs, le badge « Reçoit l'acte » pourra enfin se poser
      // (voir affecterNotaire) sans qu'on ait à redemander quoi que ce soit.
      role: memeNotaire(n, notaires.instrumentaire) ? 'instrumentaire'
        : (memeNotaire(n, notaires.participant) ? 'participant' : null)
    })).filter(x => x.nom);

    const vendeur = libelleNotaire(notaires.vendeur);
    const acquereur = libelleNotaire(notaires.acquereur);
    let coteInstrumentaire = null;
    if (notaires.instrumentaire) {
      if (vendeur && memeNotaire(notaires.vendeur, notaires.instrumentaire)) coteInstrumentaire = 'vendeur';
      else if (acquereur && memeNotaire(notaires.acquereur, notaires.instrumentaire)) coteInstrumentaire = 'acquereur';
    }
    return { vendeur, acquereur, coteInstrumentaire, detectes };
  }

  // De quel côté intervient NOTRE étude, d'après les deux champs de la fiche (voir estEtude, qui
  // tolère les deux graphies GOSSART/GOSSARD).
  function coteEtudeDossier(d) {
    if (!d) return null;
    if (d.notaireVendeur && estEtude({ nom: d.notaireVendeur })) return 'vendeur';
    if (d.notaireAcquereur && estEtude({ nom: d.notaireAcquereur })) return 'acquereur';
    return null;
  }

  // Le rôle de l'étude n'est plus un choix à part : il DÉCOULE du côté qui reçoit l'acte. Si notre
  // étude est ce côté-là, elle est instrumentaire ; sinon elle est participante. Les deux
  // sélecteurs « Rôle du notaire » et « Acte reçu par » ont donc disparu de la grille de
  // classification (doublon signalé par l'étude) — mais `d.roleNotaire` reste écrit dans le
  // dossier, car tout le reste de l'outil s'appuie dessus (checklist des pièces masquée pour un
  // participant, relance à l'acquéreur, filtre « Rôle » du Suivi).
  // Renvoie true si la valeur a changé, pour que l'appelant sache s'il doit sauvegarder.
  function deduireRoleNotaireDossier(d) {
    if (!d) return false;
    const cote = coteEtudeDossier(d);
    // Notre étude n'est reconnue dans aucun des deux champs, ou personne ne reçoit encore l'acte :
    // il n'y a rien à déduire, et surtout rien à écraser — le rôle reste celui que l'étude a posé
    // elle-même (voir le repli `basculerRoleEtude`, affiché précisément dans ce cas).
    if (!cote || !d.coteInstrumentaire) return false;
    const attendu = cote === d.coteInstrumentaire ? 'instrumentaire' : 'participant';
    if ((d.roleNotaire === 'participant' ? 'participant' : 'instrumentaire') === attendu) return false;
    d.roleNotaire = attendu;
    return true;
  }

  // ==== EXTRACTION STRUCTURÉE : adresse du bien vendu ====
  //
  // Un compromis contient l'adresse du vendeur, celle de l'acquéreur, celle du notaire, parfois
  // celle d'un bien vendu par ailleurs… La spec est explicite : il ne faut SURTOUT PAS prendre la
  // première adresse trouvée, mais identifier celle qui correspond juridiquement au bien vendu.

  // Section « DÉSIGNATION » : c'est là que le bien est décrit. La chercher d'abord évite par
  // construction de confondre avec l'adresse personnelle d'une partie.
  var RE_SECTION_DESIGNATION = /D[ÉE]SIGNATION|IDENTIFICATION\s+DU\s+BIEN|BIEN\s+VENDU|OBJET\s+DE\s+LA\s+VENTE/i;
  var RE_SECTION_APRES_DESIGNATION = /PRIX|ORIGINE\s+DE\s+PROPRI[ÉE]T[ÉE]|CONDITIONS\s+SUSPENSIVES|PROPRI[ÉE]T[ÉE]\s+JOUISSANCE|CHARGES\s+ET\s+CONDITIONS/i;

  // Une adresse précédée de « demeurant » est celle d'une PARTIE, jamais celle du bien.
  // Un acte est plein d'adresses qui ne sont PAS celle du bien : celle d'une partie (« demeurant
  // à… »), celle d'un notaire, une simple élection de domicile (« … aux fins de recevoir les
  // notifications »), et surtout le SIÈGE SOCIAL des professionnels qui interviennent — l'agence,
  // son assureur, le diagnostiqueur. Sur un compromis d'agence réel, ces trois sièges arrivent
  // avant la désignation du bien, et c'est le premier qui était retenu comme adresse du bien.
  // « siège social » les couvre tous les trois d'une seule règle, plutôt qu'une exclusion par
  // profession. Le disqualifiant peut précéder la capture comme la suivre : c'est « aux fins de
  // recevoir la notification », placé APRÈS, qui faisait passer une élection de domicile pour le
  // bien vendu sur un autre acte du corpus.
  var RE_ADRESSE_HORS_BIEN = /demeurant|domicili[ée]|r[ée]sidant|notaires?\s+[àa]\b|office\s+notarial|\bSCP\b|[ée]lection\s+de\s+domicile|aux\s+fins\s+de\s+recevoir|si[èe]ge\s+(?:social\s+)?(?:est|se\s+trouve|sis)?/i;

  var RE_CADASTRE = /cadastr[ée]e?s?\s+(?:en\s+)?section\s+([A-Z]{1,3})\s*(?:n(?:um[ée]ro|[°ºo])?\s*)?(\d{1,4})/i;

  function detecterCadastre(texte) {
    const m = RE_CADASTRE.exec(String(texte || ''));
    return m ? { section: m[1].toUpperCase(), numero: m[2] } : null;
  }

  // Adresse du bien, découpée en composants. Cherche d'abord dans la section désignation, puis dans
  // tout le texte ; écarte toute capture introduite par « demeurant » (adresse d'une partie).
  // Ce que l'étude lit dans le champ « Adresse » : une fois l'adresse correctement découpée, la
  // recomposer vaut mieux que recopier le fragment brut du PDF, qui traîne l'amorce de la phrase
  // (« Dans un ensemble immobilier situé à… ») et la description qui suit. Le texte d'origine
  // reste consultable : c'est l'extrait, affiché avec sa page, dans le panneau de révision.
  function adresseLisible(adresse) {
    if (!adresse || adresse.statut !== 'CONFIRMED') return adresse ? adresse.adresseComplete : '';
    const voie = adresse.lieuDit
      ? 'lieu-dit ' + adresse.lieuDit
      : [adresse.numero, adresse.typeVoie, adresse.nomVoie].filter(Boolean).join(' ');
    return [voie, [adresse.codePostal, adresse.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }

  function detecterAdresseBienStructuree(texte) {
    const source = String(texte || '');
    const section = extraireSection(source, RE_SECTION_DESIGNATION, RE_SECTION_APRES_DESIGNATION);
    const zones = section ? [section, source] : [source];

    for (const zone of zones) {
      const re = new RegExp(ADRESSE_BIEN_RE.source, 'gi');
      let m;
      while ((m = re.exec(zone)) !== null) {
        const avant = zone.slice(Math.max(0, m.index - 80), m.index);
        const apres = zone.slice(m.index + m[0].length, m.index + m[0].length + 60);
        if (RE_ADRESSE_HORS_BIEN.test(avant) || RE_ADRESSE_HORS_BIEN.test(apres)) continue;
        const fragment = extraireFragmentAdresse(m[1]) || m[1];
        const adresse = parserAdresse(fragment);
        if (adresse.codePostal) {
          const index = source.indexOf(m[0]);
          adresse.adresseComplete = adresseLisible(adresse);
          return {
            adresse,
            source: {
              extrait: extraireContexte(zone, m.index, m[0].length),
              index: index === -1 ? null : index,
              page: index === -1 ? null : pageDepuisIndex(index)
            }
          };
        }
      }
    }
    // Repli : la section désignation contient bien une adresse, mais sans la tournure « sis à ».
    if (section) {
      const fragment = extraireFragmentAdresse(section);
      if (fragment) {
        const adresse = parserAdresse(fragment);
        if (adresse.codePostal) {
          const index = source.indexOf(fragment.split(',')[0].trim());
          adresse.adresseComplete = adresseLisible(adresse);
          return {
            adresse,
            source: { extrait: fragment, index: index === -1 ? null : index, page: index === -1 ? null : pageDepuisIndex(index) }
          };
        }
      }
    }
    return { adresse: parserAdresse(''), source: null };
  }

  // ==== EXTRACTION STRUCTURÉE : objet unifié et contrôle de cohérence ====

  function champExtraction(valeur, options) {
    const o = options || {};
    return {
      valeur: valeur === undefined ? null : valeur,
      statut: o.statut || (valeur ? 'CONFIRMED' : 'NOT_FOUND'),
      methode: o.methode || null,
      origine: o.origine || 'regex',
      source: o.source || null,
      candidats: o.candidats || [],
      raison: o.raison || ''
    };
  }

  // Comme champExtraction(), mais en situant au passage la valeur dans le document : sans ça
  // aucune de ces données n'avait de page, et le panneau de révision n'offrait aucun moyen d'aller
  // voir la phrase d'où elle sort — défaut signalé par l'étude.
  function champAvecSource(texte, cle, valeur) {
    return champExtraction(valeur, { source: sourcePourValeur(texte, cle, valeur) });
  }

  // Rassemble tout ce que les regex savent extraire en UN objet, avec pour chaque donnée son
  // statut, sa provenance et sa source dans le PDF. C'est ce même objet que la passe IA viendra
  // ensuite compléter (voir fusionnerExtractionIa) : les deux passes ne parlent qu'une langue.
  function construireExtractionRegex(texte, dateCompromis, detectedDatesFournies) {
    const source = String(texte || '');
    const typeActe = detecterTypeActe(source);
    const detectedDates = Array.isArray(detectedDatesFournies)
      ? detectedDatesFournies
      : detecterDatesDepuisTexte(source, dateCompromis);
    const bien = detecterAdresseBienStructuree(source);
    const notaires = determinerNotaires(detecterNotaires(source, typeActe.valeur), bien.adresse.departement, typeActe.valeur, zoneNotairesPourActe(source, typeActe.valeur));

    const extraction = {
      version: 1,
      typeActe,
      parties: detecterParties(source, typeActe.valeur),
      notaires,
      bien: {
        adresse: bien.adresse,
        source: bien.source || sourcePourValeur(source, 'adresseBien', bien.adresse && bien.adresse.adresseComplete),
        cadastre: detecterCadastre(source)
      },
      dates: construireDatesMetier(detectedDates, detecterDelais(source), dateCompromis),
      champs: {
        nom: champAvecSource(source, 'nom', detecterNomDossier(source)),
        prixVente: champAvecSource(source, 'prixVente', detecterPrixVente(source)),
        emailAcquereur: champAvecSource(source, 'emailAcquereur', detecterEmailAcquereur(source, typeActe.valeur)),
        typeVente: champExtraction(detecterTypeVenteCopropriete(source) ? 'copropriete' : null)
      },
      alertes: [],
      iaLots: { parties: 'attente', bien: 'attente', dates: 'attente' }
    };
    extraction.alertes = controlerCoherence(extraction);
    return extraction;
  }

  // Contrôle de cohérence : la spec demande de vérifier l'ensemble AVANT de créer le dossier, et de
  // signaler les contradictions plutôt que de les absorber en silence. Chaque alerte nomme les
  // champs concernés pour pouvoir être affichée en face d'eux.
  function controlerCoherence(extraction) {
    const alertes = [];
    if (!extraction) return alertes;
    const dates = extraction.dates || {};
    const valeur = (cle) => (dates[cle] && dates[cle].valeur) || null;
    const signature = valeur('SIGNATURE_AVANT_CONTRAT');
    const pret = valeur('BUTOIR_PRET');
    const acte = valeur('REITERATION_ACTE');
    const vente = valeur('BUTOIR_VENTE_PREALABLE');

    if (signature && acte && signature === acte) {
      alertes.push({
        code: 'SIGNATURE_EGALE_REITERATION', gravite: 'critique', champs: ['acte'],
        message: 'La date de réitération est identique à celle de la signature de l’avant-contrat : l’une des deux est probablement mal identifiée.'
      });
    }
    if (pret && acte && pret > acte) {
      alertes.push({
        code: 'PRET_APRES_ACTE', gravite: 'critique', champs: ['pret', 'acte'],
        message: 'L’échéance d’obtention du prêt tombe après la signature de l’acte : la condition suspensive ne pourrait pas jouer.'
      });
    }
    if (pret && vente && pret === vente) {
      alertes.push({
        code: 'PRET_EGALE_VENTE_PREALABLE', gravite: 'attention', champs: ['pret', 'ventebien'],
        message: 'La même date est retenue pour l’obtention du prêt et pour la vente préalable : à vérifier, les deux clauses sont distinctes.'
      });
    }

    // Date écrite ET délai dans l'acte, qui ne tombent pas au même endroit : l'écart d'un jour ou
    // deux vient de la convention de computation et n'a rien d'anormal ; au-delà, c'est une vraie
    // contradiction entre deux clauses du même acte.
    for (const [typeDate, champ] of Object.entries(CHAMP_PAR_TYPE_DATE)) {
      const objet = dates[typeDate];
      if (!objet || !objet.valeur || objet.methode !== 'EXPLICIT' || !objet.calculAlternatif) continue;
      const ecart = Math.abs((new Date(objet.valeur) - new Date(objet.calculAlternatif)) / 86400000);
      if (ecart > 5) {
        alertes.push({
          code: 'DATE_EXPLICITE_VS_DELAI', gravite: 'attention', champs: [champ],
          message: `La date écrite dans l’acte et le délai qu’il énonce ne concordent pas (${Math.round(ecart)} jours d’écart) : c’est la date écrite qui a été retenue.`
        });
      }
    }

    const adresse = extraction.bien && extraction.bien.adresse;
    if (!adresse || adresse.statut !== 'CONFIRMED') {
      alertes.push({
        code: 'ADRESSE_INCOMPLETE', gravite: 'attention', champs: ['adresseBien'],
        message: 'L’adresse du bien n’a pas pu être reconstituée complètement : à compléter à la main.'
      });
    }

    const notaires = extraction.notaires || {};
    if (notaires.instrumentaire && notaires.participant &&
        notaires.instrumentaire.nom === notaires.participant.nom) {
      alertes.push({
        code: 'NOTAIRES_IDENTIQUES', gravite: 'attention', champs: ['roleNotaire'],
        message: 'Le même notaire est identifié comme instrumentaire et comme participant : à vérifier.'
      });
    }
    if (notaires.statut === 'NEEDS_REVIEW') {
      alertes.push({
        code: 'NOTAIRE_INSTRUMENTAIRE_INCERTAIN', gravite: 'attention', champs: ['roleNotaire'],
        message: notaires.raison || 'Le notaire instrumentaire n’a pas pu être déterminé.'
      });
    }

    // Le vocabulaire des parties doit correspondre au type d'acte : un compromis qui nomme ses
    // parties « promettant »/« bénéficiaire » n'est pas anormal (promesse synallagmatique), mais un
    // type d'acte non tranché combiné à ce vocabulaire mérite un regard — c'est exactement la
    // situation où l'inversion vendeur/acquéreur passerait inaperçue.
    const parties = extraction.parties || [];
    const vocabulairePromesse = parties.some(p => p.qualiteActe === 'promettant' || p.qualiteActe === 'beneficiaire');
    if (vocabulairePromesse && extraction.typeActe && extraction.typeActe.valeur === 'INCONNU') {
      alertes.push({
        code: 'TYPE_ACTE_VS_QUALITES', gravite: 'critique', champs: ['nom'],
        message: 'L’acte nomme ses parties « promettant » et « bénéficiaire » sans que son type ait pu être établi : vérifiez que vendeur et acquéreur ne sont pas intervertis.'
      });
    }

    return alertes;
  }

  // ==== EXTRACTION STRUCTURÉE : enregistrement sur le dossier ====
  //
  // Ce qui est conservé SUR LE DOSSIER une fois celui-ci créé. Volontairement plus maigre que
  // `extractionActuelle` : les extraits cités et les candidats concurrents n'ont d'intérêt que
  // pendant l'import (pour vérifier une valeur PDF en main) — après coup, ce qui compte est
  // « d'où vient cette donnée, et était-elle sûre ? ». Les champs plats du dossier
  // (pret/acte/ventebien/adresseBien/prixVente/roleNotaire/confiance) continuent d'être alimentés
  // exactement comme avant : tout ce qui suit est ADDITIF, aucun affichage existant n'en dépend.
  function notairePersistable(n) {
    if (!n || !n.nom) return null;
    return {
      nom: n.nom,
      office: n.office || null,
      codePostal: n.codePostal || null,
      departement: n.departement || null,
      cote: n.cote || 'inconnu'
    };
  }

  function instantaneExtraction(extraction) {
    if (!extraction) return null;
    const notaires = extraction.notaires || {};
    const adresse = (extraction.bien && extraction.bien.adresse) || null;
    const etatChamp = (champ) => champ
      ? {
        statut: champ.statut || 'NOT_FOUND',
        methode: champ.methode || null,
        origine: champ.origine || 'regex',
        page: (champ.source && champ.source.page) || null,
        // La valeur elle-même n'est pas recopiée (elle vit déjà dans le champ plat du dossier),
        // mais ces trois drapeaux permettent à la fiche enregistrée de parler exactement la même
        // langue que le panneau d'import (voir origineRevision) — un seul vocabulaire pour la
        // même réalité, au lieu de « Confirmé » d'un côté et « Lue dans l'acte » de l'autre.
        renseigne: champ.valeur !== null && champ.valeur !== undefined && champ.valeur !== '',
        verifie: !!champ.verifie,
        apprise: !!champ.apprise
      }
      : null;

    const champs = {};
    for (const cle of Object.keys(extraction.champs || {})) {
      const etat = etatChamp(extraction.champs[cle]);
      if (etat) champs[cle] = etat;
    }
    // Les dates sont indexées sur le NOM DU CHAMP du dossier (pret/acte/ventebien) et non sur leur
    // type métier : c'est sous ce nom-là qu'on les retrouvera pour les afficher en face de la date
    // effectivement enregistrée.
    for (const typeDate of Object.keys(CHAMP_PAR_TYPE_DATE)) {
      const etat = etatChamp((extraction.dates || {})[typeDate]);
      if (etat) champs[CHAMP_PAR_TYPE_DATE[typeDate]] = etat;
    }
    if (adresse) {
      champs.adresseBien = {
        statut: adresse.statut || 'NOT_FOUND', methode: null, origine: adresse.origine || 'regex',
        page: (extraction.bien.source && extraction.bien.source.page) || null,
        renseigne: !!adresse.adresseComplete, verifie: !!adresse.verifie, apprise: false
      };
    }

    return {
      typeActe: { valeur: extraction.typeActe ? extraction.typeActe.valeur : 'INCONNU', statut: extraction.typeActe ? extraction.typeActe.statut : 'NOT_FOUND' },
      parties: (extraction.parties || []).map(p => ({
        nom: p.nom, qualiteActe: p.qualiteActe, role: p.role,
        qualitePersonne: p.qualitePersonne || 'physique',
        representant: p.representant || null
      })),
      notaires: {
        vendeur: notairePersistable(notaires.vendeur),
        acquereur: notairePersistable(notaires.acquereur),
        instrumentaire: notairePersistable(notaires.instrumentaire),
        participant: notairePersistable(notaires.participant),
        statut: notaires.statut || 'NOT_FOUND',
        raison: notaires.raison || '',
        roleEtude: notaires.roleEtude || null
      },
      bien: {
        adresse: adresse ? {
          adresseComplete: adresse.adresseComplete || '', numero: adresse.numero || null,
          typeVoie: adresse.typeVoie || null, nomVoie: adresse.nomVoie || null,
          lieuDit: adresse.lieuDit || null, codePostal: adresse.codePostal || null,
          commune: adresse.commune || null, departement: adresse.departement || null,
          statut: adresse.statut || 'NOT_FOUND'
        } : null,
        cadastre: (extraction.bien && extraction.bien.cadastre) || null
      },
      extraction: {
        version: extraction.version || 1,
        dateImport: new Date().toISOString(),
        champs,
        alertes: (extraction.alertes || []).map(a => ({ code: a.code, gravite: a.gravite, message: a.message }))
      }
    };
  }

  // ==== OUTIL 2 (AUDIT DES ACTES) : comparaison déterministe compromis/promesse → projet de vente ====
  //
  // §13 du cahier des charges (mode "projet d'acte de vente") : tout ce qui est un FAIT STRUCTURÉ
  // (parties, prix, désignation du bien, cadastre, notaire instrumentaire, dates) est comparé par
  // du code pur, jamais redemandé à l'IA locale — un diff de deux valeurs déjà extraites n'a rien à
  // gagner à repasser par un modèle dont la "certitude" auto-déclarée n'est de toute façon pas
  // calibrée (voir server/src/llm.js, genererJson). Seule la partie en langage libre (déclarations
  // des vendeurs, travaux, servitudes...) reste du ressort des passes IA côté serveur
  // (server/src/audit/), qui reçoivent alors ce même document de référence en plus du projet.
  //
  // La référence peut venir de deux sources, ramenées ici à LA MÊME FORME (celle que produit déjà
  // construireExtractionRegex()) : un dossier CLAIRE déjà suivi (referenceDepuisDossier — aucune
  // ré-extraction, ses champs ont déjà été vérifiés lors de la création du dossier), ou un
  // compromis/promesse fraîchement uploadé dans Outil 2 (construireExtractionRegex(texte, null,
  // null) appelée directement, sans date de compromis connue — les délais ne se calculent alors
  // pas, mais les dates explicites et les autres champs restent détectés comme d'habitude).

  function referenceDepuisDossier(d) {
    if (!d) return null;
    return {
      parties: Array.isArray(d.parties) ? d.parties : [],
      notaires: d.notaires || {},
      bien: d.bien || { adresse: null, cadastre: null },
      dates: {
        BUTOIR_PRET: champExtraction(d.pret || null),
        REITERATION_ACTE: champExtraction(d.acte || null),
        BUTOIR_VENTE_PREALABLE: champExtraction(d.ventebien || null)
      },
      champs: {
        prixVente: champExtraction(d.prixVente || null)
      }
    };
  }

  // Compare deux valeurs texte en ignorant accents/casse/espaces superflus — même principe que
  // normaliserPourRecherche() (recherche de dossier), appliqué ici à un nom de partie ou une adresse.
  function memeValeurTexte(a, b) {
    return normaliserPourRecherche(String(a || '').trim()) === normaliserPourRecherche(String(b || '').trim());
  }

  function partieCorrespondante(partie, liste) {
    return (liste || []).find(p => memeValeurTexte(p.nom, partie.nom));
  }

  var LIBELLES_TYPE_DATE_COMPARAISON = {
    BUTOIR_PRET: 'Obtention du prêt', REITERATION_ACTE: 'Signature de l’acte', BUTOIR_VENTE_PREALABLE: 'Vente préalable'
  };

  // Constat pur (sans IA) : {categorie: 'COMPARAISON_COMPROMIS', gravite, titre, description,
  // sources: []} — même forme que les constats produits par les passes IA côté serveur (voir
  // server/src/audit/fusion.js) pour que le rapport les affiche ensemble sans traitement
  // particulier ; `sources` reste vide, ces constats ne citent pas un extrait de texte mais deux
  // valeurs déjà extraites (rien à vérifier via localiserExtrait ici).
  function comparerCompromisEtProjet(reference, projet) {
    if (!reference || !projet) return [];
    const constats = [];

    const partiesRef = reference.parties || [];
    const partiesProjet = projet.parties || [];
    for (const p of partiesRef) {
      const trouvee = partieCorrespondante(p, partiesProjet);
      if (!trouvee) {
        constats.push({
          categorie: 'COMPARAISON_COMPROMIS', gravite: 'IMPORTANT',
          titre: `Partie absente du projet : ${p.nom}`,
          description: `${p.nom} figurait dans le compromis/la promesse de référence (${p.role}) mais n’apparaît plus dans le projet de vente.`,
          sources: []
        });
      } else if (trouvee.role !== p.role) {
        constats.push({
          categorie: 'COMPARAISON_COMPROMIS', gravite: 'CRITIQUE',
          titre: `Rôle changé pour ${p.nom}`,
          description: `${p.nom} était ${p.role} dans le compromis/la promesse, ${trouvee.role} dans le projet de vente.`,
          sources: []
        });
      }
    }
    for (const p of partiesProjet) {
      if (!partieCorrespondante(p, partiesRef)) {
        constats.push({
          categorie: 'COMPARAISON_COMPROMIS', gravite: 'IMPORTANT',
          titre: `Partie nouvelle dans le projet : ${p.nom}`,
          description: `${p.nom} (${p.role}) apparaît dans le projet de vente sans figurer dans le compromis/la promesse de référence.`,
          sources: []
        });
      }
    }

    const prixRef = reference.champs && reference.champs.prixVente && reference.champs.prixVente.valeur;
    const prixProjet = projet.champs && projet.champs.prixVente && projet.champs.prixVente.valeur;
    if (prixRef != null && prixProjet != null && Number(prixRef) !== Number(prixProjet)) {
      constats.push({
        categorie: 'COMPARAISON_COMPROMIS', gravite: 'CRITIQUE',
        titre: 'Prix de vente différent',
        description: `Prix du compromis/de la promesse : ${prixRef} € — prix du projet de vente : ${prixProjet} €.`,
        sources: []
      });
    }

    const adresseRef = reference.bien && reference.bien.adresse;
    const adresseProjet = projet.bien && projet.bien.adresse;
    if (adresseRef && adresseProjet && !memeValeurTexte(adresseLisible(adresseRef), adresseLisible(adresseProjet))) {
      constats.push({
        categorie: 'COMPARAISON_COMPROMIS', gravite: 'CRITIQUE',
        titre: 'Désignation du bien différente',
        description: `Compromis/promesse : « ${adresseLisible(adresseRef)} » — projet de vente : « ${adresseLisible(adresseProjet)} ».`,
        sources: []
      });
    }

    const cadastreRef = reference.bien && reference.bien.cadastre;
    const cadastreProjet = projet.bien && projet.bien.cadastre;
    if (cadastreRef && cadastreProjet &&
        (cadastreRef.section !== cadastreProjet.section || cadastreRef.numero !== cadastreProjet.numero)) {
      constats.push({
        categorie: 'COMPARAISON_COMPROMIS', gravite: 'CRITIQUE',
        titre: 'Référence cadastrale différente',
        description: `Compromis/promesse : section ${cadastreRef.section} n°${cadastreRef.numero} — projet de vente : section ${cadastreProjet.section} n°${cadastreProjet.numero}.`,
        sources: []
      });
    }

    const notaireRef = reference.notaires && reference.notaires.instrumentaire;
    const notaireProjet = projet.notaires && projet.notaires.instrumentaire;
    if (notaireRef && notaireProjet && notaireRef.nom && notaireProjet.nom && !memeValeurTexte(notaireRef.nom, notaireProjet.nom)) {
      constats.push({
        categorie: 'COMPARAISON_COMPROMIS', gravite: 'A_VERIFIER',
        titre: 'Notaire instrumentaire différent',
        description: `Compromis/promesse : ${notaireRef.nom} — projet de vente : ${notaireProjet.nom}.`,
        sources: []
      });
    }

    for (const type of Object.keys(LIBELLES_TYPE_DATE_COMPARAISON)) {
      const vRef = reference.dates && reference.dates[type] && reference.dates[type].valeur;
      const vProjet = projet.dates && projet.dates[type] && projet.dates[type].valeur;
      if (vRef && vProjet && vRef !== vProjet) {
        constats.push({
          categorie: 'COMPARAISON_COMPROMIS', gravite: 'A_VERIFIER',
          titre: `Date différente — ${LIBELLES_TYPE_DATE_COMPARAISON[type]}`,
          description: `Compromis/promesse : ${vRef} — projet de vente : ${vProjet}. Un report peut être légitime, à confirmer.`,
          sources: []
        });
      }
    }

    return constats;
  }

  // ==== OUTIL 2 : les obligations du vendeur ont-elles été tenues ? ====
  //
  // Demandé par l'étude pour la relecture d'un projet d'acte de vente : entre le compromis et
  // l'acte, le vendeur s'est engagé à fournir des attestations d'entretien, des factures de
  // travaux, une garantie décennale, à réaliser des travaux… Le dossier Outil 1 porte déjà tout
  // ce qu'il faut pour répondre SANS IA — un croisement de trois sources, toutes déterministes :
  //   1. les engagements lus dans le compromis à la création du dossier (d.analyseJuridique), dont
  //      les documents reconnus alimentent la checklist (PIECES_ENGAGEMENTS_AUTO, checklistPieces) ;
  //   2. le statut de chaque pièce de cette checklist sur le NAS (d.pieces, d.fichiersTrouves) ;
  //   3. les documents déposés dans Outil 2 lui-même (une facture, une attestation… déposée à
  //      l'audit compte comme fournie, même si elle n'est pas encore rangée dans le dossier NAS).
  // Le dossier n'est jamais modifié : un document déposé ici ne coche rien dans la checklist, la
  // pièce sera marquée reçue par le parcours NAS habituel une fois rangée dans le dossier client
  // (choix explicite de l'étude, Outil 2 reste un outil de lecture).
  //
  // Une obligation dont aucune pièce type ne correspond (« le vendeur fera réparer la toiture ») ne
  // peut pas être vérifiée par un document : elle ressort « à vérifier », avec la clause et sa page,
  // jamais « non tenue » — l'outil ne sait pas, il ne prétend pas savoir.

  // Un document déposé dans Outil 2 vaut pour une pièce type : par son TYPE déclaré quand il est
  // sans ambiguïté (une « facture de travaux » EST la pièce facturesTravaux), sinon par son nom de
  // fichier, avec les mêmes motifNom que le parcours NAS (normalisation identique — voir
  // normaliserNomPourMotif — pour qu'un fichier reconnu dans le dossier client le soit aussi ici).
  var TYPE_DEPOT_VERS_PIECE = { facture: 'facturesTravaux', decennale: 'garantieDecennale' };

  function documentDeposePourPiece(piece, documentsDeposes) {
    for (const doc of documentsDeposes || []) {
      if (!doc || !doc.nom) continue;
      if (TYPE_DEPOT_VERS_PIECE[doc.type] === piece.cle) return doc;
      if (piece.motifNom && piece.motifNom.test(normaliserNomPourMotif(doc.nom))) return doc;
    }
    return null;
  }

  var LIBELLES_CAT_OBLIGATION = { entretien: 'Entretien', travaux: 'Travaux', justificatif: 'Justificatif', document: 'Document', autre: 'Autre' };

  function verifierObligationsVendeur(d, documentsDeposes) {
    if (!d) return [];
    const obligations = [];
    const pieces = d.pieces || {};
    const fichiers = d.fichiersTrouves || {};
    const engagements = (d.analyseJuridique && Array.isArray(d.analyseJuridique.engagements))
      ? d.analyseJuridique.engagements : [];

    // Pour chaque pièce de la checklist issue d'un engagement, la clause d'origine quand on peut la
    // retrouver : c'est elle que l'étude veut relire, pas seulement le libellé générique.
    const clausePourCle = {};
    for (const e of engagements) {
      const phrase = typeof e === 'string' ? e : (e && e.phrase);
      if (!phrase) continue;
      for (const doc of detecterDocumentsAFournir([phrase])) {
        if (doc.cleChecklist && !clausePourCle[doc.cleChecklist]) {
          clausePourCle[doc.cleChecklist] = { phrase, page: (typeof e === 'object' && e.page) || null };
        }
      }
    }

    const attendues = checklistPieces(d.typeVente, d).filter(p => p.autoEngagement);
    for (const piece of attendues) {
      const connu = DOCUMENTS_VENDEUR_CONNUS.find(x => x.cleChecklist === piece.cle);
      const cat = connu ? connu.cat : 'document';
      const clause = clausePourCle[piece.cle] || null;
      const base = { cle: piece.cle, label: piece.label, cat, clause: clause ? clause.phrase : null, page: clause ? clause.page : null };
      if (pieces[piece.cle] === 'recue') {
        obligations.push({ ...base, statut: 'tenue', gravite: 'INFORMATION', preuve: { source: 'dossier', nom: fichiers[piece.cle] || null } });
        continue;
      }
      const depose = documentDeposePourPiece(piece, documentsDeposes);
      if (depose) {
        obligations.push({ ...base, statut: 'tenue', gravite: 'INFORMATION', preuve: { source: 'depot', nom: depose.nom } });
        continue;
      }
      // Jamais CRITIQUE sur une simple absence (§16 du cahier des charges) : IMPORTANT au plus.
      obligations.push({ ...base, statut: 'non_tenue', gravite: 'IMPORTANT', preuve: null });
    }

    // Engagements sans pièce type : rien à cocher, mais à relire — la clause le dit mieux qu'un
    // libellé, et sa page permet de la retrouver dans le compromis.
    const clesCouvertes = new Set(attendues.map(p => p.cle));
    for (const e of engagements) {
      const phrase = typeof e === 'string' ? e : (e && e.phrase);
      if (!phrase) continue;
      const docs = detecterDocumentsAFournir([phrase]);
      if (docs.some(doc => doc.cleChecklist && clesCouvertes.has(doc.cleChecklist))) continue;
      obligations.push({
        cle: null,
        label: phrase.length > 140 ? phrase.slice(0, 137) + '…' : phrase,
        cat: (typeof e === 'object' && e.type) || 'autre',
        clause: phrase,
        page: (typeof e === 'object' && e.page) || null,
        statut: 'a_verifier',
        gravite: 'A_VERIFIER',
        preuve: null
      });
    }

    // Les manquements d'abord : c'est ce qu'on vient chercher avant de signer.
    const rang = { non_tenue: 0, a_verifier: 1, tenue: 2 };
    obligations.sort((a, b) => rang[a.statut] - rang[b.statut]);
    return obligations;
  }

  // ==== OUTIL 2 : proposer le dossier Outil 1 qui correspond au projet ====
  //
  // En mode « projet d'acte de vente », les parties lues dans le projet désignent presque toujours
  // un dossier déjà suivi (le compromis a été importé dans Outil 1 des mois plus tôt). Plutôt que
  // de faire retaper un nom, on PROPOSE les dossiers dont le nom ou les parties partagent un
  // patronyme avec le projet — en tête de la liste, mais toujours un clic explicite (choix de
  // l'étude, comme pour le rapprochement NAS : auditer contre le mauvais dossier ferait comparer
  // deux ventes qui n'ont rien à voir). Jamais de liaison automatique.
  function motsDiscriminants(texte) {
    return normaliserPourRecherche(String(texte || ''))
      .split(/[^a-z0-9]+/)
      .filter(m => m.length >= 3 && !MOTS_COMMUNS_NOM_DOSSIER.has(m));
  }

  // Civilités, qualités et mots de liaison qu'un nom de dossier ou de partie peut contenir sans
  // rien dire de l'identité ("épouse", "veuve", "sci", "monsieur"…) — un dossier proposé sur le
  // seul mot « epouse » commun aux deux serait un faux rapprochement.
  var MOTS_COMMUNS_NOM_DOSSIER = new Set([
    'monsieur', 'madame', 'mademoiselle', 'mme', 'mlle', 'epouse', 'epoux', 'veuve', 'veuf', 'nee',
    'les', 'des', 'consorts', 'societe', 'sci', 'sarl', 'sas', 'eurl', 'vendeur', 'vendeurs',
    'acquereur', 'acquereurs', 'promettant', 'beneficiaire', 'dossier', 'vente', 'succession'
  ]);

  function proposerDossiersDepuisParties(parties, listeDossiers) {
    const noms = (parties || []).map(p => (p && p.nom) || '').filter(Boolean);
    if (noms.length === 0) return [];
    const motsProjet = new Set(noms.flatMap(motsDiscriminants));
    if (motsProjet.size === 0) return [];
    const scores = [];
    for (const d of listeDossiers || []) {
      if (!d || d.archive) continue;
      const motsDossier = new Set([
        ...motsDiscriminants(d.nom),
        ...((d.parties || []).flatMap(p => motsDiscriminants(p && p.nom)))
      ]);
      let score = 0;
      for (const m of motsProjet) { if (motsDossier.has(m)) score++; }
      if (score > 0) scores.push({ dossier: d, score });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.map(s => s.dossier);
  }

  // Corrections apportées À LA MAIN entre ce que l'extraction proposait et ce qui est réellement
  // enregistré. Journalisées pour pouvoir, plus tard, mesurer où l'extraction se trompe le plus
  // souvent — JAMAIS pour réentraîner quoi que ce soit automatiquement (décision explicite de la
  // spec) : le modèle local reste figé, seules les regex sont corrigées à la main après analyse.
  function diffCorrectionsExtraction(extraction, valeursFinales) {
    if (!extraction || !valeursFinales) return [];
    const finales = valeursFinales;
    const typeActe = extraction.typeActe ? extraction.typeActe.valeur : 'INCONNU';
    const adresse = (extraction.bien && extraction.bien.adresse) || null;
    const dates = extraction.dates || {};
    const champs = extraction.champs || {};
    const proposees = {
      nom: (champs.nom && champs.nom.valeur) || null,
      prixVente: (champs.prixVente && champs.prixVente.valeur) || null,
      emailAcquereur: (champs.emailAcquereur && champs.emailAcquereur.valeur) || null,
      adresseBien: adresse ? (adresse.adresseComplete || null) : null,
      roleNotaire: (extraction.notaires && extraction.notaires.roleEtude) || null
    };
    for (const typeDate of Object.keys(CHAMP_PAR_TYPE_DATE)) {
      proposees[CHAMP_PAR_TYPE_DATE[typeDate]] = (dates[typeDate] && dates[typeDate].valeur) || null;
    }

    const entrees = [];
    for (const champ of Object.keys(proposees)) {
      const extraite = proposees[champ];
      const finale = finales[champ] === undefined || finales[champ] === '' ? null : finales[champ];
      // Rien à apprendre d'un champ que l'extraction n'a pas trouvé ET que personne n'a rempli.
      if (extraite === null && finale === null) continue;
      if (String(extraite) === String(finale)) continue;
      const objetChamp = champs[champ] || dates[Object.keys(CHAMP_PAR_TYPE_DATE).find(t => CHAMP_PAR_TYPE_DATE[t] === champ)] || null;
      entrees.push({
        champ,
        valeurExtraite: extraite,
        valeurCorrigee: finale,
        origine: (objetChamp && objetChamp.origine) || 'regex',
        statutExtrait: (objetChamp && objetChamp.statut) || 'NOT_FOUND',
        typeActe,
        extrait: (objetChamp && objetChamp.source && objetChamp.source.extrait) ? String(objetChamp.source.extrait).slice(0, 200) : null,
        date: new Date().toISOString()
      });
    }
    return entrees;
  }

  // Libellés lisibles pour le panneau « Qualité de l'extraction » (voir renderQualiteExtraction),
  // mêmes clés que celles produites par diffCorrectionsExtraction() ci-dessus.
  var LIBELLES_CHAMPS_CORRECTION = {
    nom: 'Nom du dossier', adresseBien: 'Adresse du bien', prixVente: 'Prix de vente',
    emailAcquereur: 'Email de l’acquéreur', roleNotaire: 'Rôle de l’étude',
    pret: 'Obtention du prêt', acte: 'Réitération de l’acte', ventebien: 'Vente préalable'
  };

  // Agrège le journal des corrections par champ, du plus corrigé au moins corrigé — c'est ce qui
  // manquait pour EXPLOITER journalCorrectionsExtraction (voir sa déclaration plus bas) : jusqu'ici
  // il grossissait silencieusement depuis le premier dossier créé, sans que l'étude ait aucun moyen
  // de savoir quels champs l'extraction rate le plus souvent, sinon en resignalant chaque cas au
  // fil de l'eau. Fonction PURE et testable : ne fait qu'agréger un tableau, aucun effet de bord.
  function statistiquesCorrectionsExtraction(journal) {
    const liste = Array.isArray(journal) ? journal : [];
    const parChamp = {};
    for (const entree of liste) {
      if (!entree || typeof entree.champ !== 'string') continue;
      const groupe = parChamp[entree.champ] || (parChamp[entree.champ] = { champ: entree.champ, nombre: 0, dernier: null });
      groupe.nombre++;
      // Le journal est alimenté dans l'ordre chronologique (push en fin de tableau, voir
      // journaliserCorrectionsExtraction) : la dernière entrée rencontrée pour ce champ est donc la
      // plus récente, pas besoin de comparer des dates pour le savoir.
      groupe.dernier = entree;
    }
    return Object.values(parChamp).sort((a, b) => b.nombre - a.nombre);
  }

  // Assainissement à l'import d'une sauvegarde JSON : on conserve ces objets s'ils ont la bonne
  // forme, sinon on repart de rien plutôt que de propager une structure inattendue dans le rendu.
  function normaliserExtractionImportee(d) {
    const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
    const source = objet(d) || {};
    const typeActe = objet(source.typeActe);
    const notaires = objet(source.notaires);
    const bien = objet(source.bien);
    const extraction = objet(source.extraction);
    const adresse = bien ? objet(bien.adresse) : null;
    return {
      typeActe: typeActe && TYPES_ACTE.indexOf(typeActe.valeur) !== -1
        ? { valeur: typeActe.valeur, statut: typeof typeActe.statut === 'string' ? typeActe.statut : 'NOT_FOUND' }
        : null,
      parties: Array.isArray(source.parties)
        ? source.parties.filter(p => p && typeof p === 'object' && typeof p.nom === 'string' && (p.role === 'VENDEUR' || p.role === 'ACQUEREUR'))
            .map(p => ({
              nom: p.nom,
              qualiteActe: typeof p.qualiteActe === 'string' ? p.qualiteActe : '',
              role: p.role,
              qualitePersonne: p.qualitePersonne === 'morale' ? 'morale' : 'physique',
              representant: typeof p.representant === 'string' ? p.representant : null
            }))
        : [],
      notaires: notaires
        ? {
          vendeur: notairePersistable(objet(notaires.vendeur)),
          acquereur: notairePersistable(objet(notaires.acquereur)),
          instrumentaire: notairePersistable(objet(notaires.instrumentaire)),
          participant: notairePersistable(objet(notaires.participant)),
          statut: typeof notaires.statut === 'string' ? notaires.statut : 'NOT_FOUND',
          raison: typeof notaires.raison === 'string' ? notaires.raison : '',
          roleEtude: (notaires.roleEtude === 'instrumentaire' || notaires.roleEtude === 'participant') ? notaires.roleEtude : null
        }
        : null,
      bien: bien
        ? { adresse: adresse || null, cadastre: objet(bien.cadastre) }
        : null,
      extraction: extraction
        ? {
          version: Number.isInteger(extraction.version) ? extraction.version : 1,
          dateImport: typeof extraction.dateImport === 'string' ? extraction.dateImport : null,
          champs: objet(extraction.champs) || {},
          alertes: Array.isArray(extraction.alertes)
            ? extraction.alertes.filter(a => a && typeof a === 'object' && typeof a.message === 'string')
                .map(a => ({ code: String(a.code || ''), gravite: String(a.gravite || 'info'), message: a.message }))
            : []
        }
        : null
    };
  }

  // ==== EXTRACTION STRUCTURÉE : localisation d'un extrait dans le texte ====
  //
  // Pierre angulaire de la vérification des réponses du modèle IA local : plutôt que de faire
  // confiance à un score de "confidence" qu'un llama 8B produit sans calibration, on vérifie que
  // l'extrait qu'il cite existe LITTÉRALEMENT dans le texte du PDF. Trouvé → on en déduit la page
  // (pageDepuisIndex) et la donnée passe CONFIRMED ; introuvable → NEEDS_REVIEW, quel que soit
  // l'aplomb du modèle. Extraite ici (elle vivait imbriquée dans voirEngagementDansPdf) pour être
  // partagée, testable, et renforcée : accents et apostrophes typographiques sont désormais
  // neutralisés, le texte d'un PDF étant systématiquement bruité de ce côté.
  function normaliserAvecIndex(s) {
    let res = '';
    const idx = [];
    let dernierEspace = true;
    const source = String(s || '');
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (/\s/.test(c)) {
        if (!dernierEspace) { res += ' '; idx.push(i); dernierEspace = true; }
        continue;
      }
      let normalise = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (/['’‘´`]/.test(normalise)) normalise = "'";
      if (/[-–—]/.test(normalise)) normalise = '-';
      // Un caractère peut donner 0 (marque combinante isolée) ou plusieurs caractères : on pousse
      // un index par caractère PRODUIT, sinon la table de correspondance se décale.
      for (const ch of normalise) { res += ch; idx.push(i); }
      if (normalise.length > 0) dernierEspace = false;
    }
    return { texte: res, index: idx };
  }

  // Retrouve la position d'un extrait cité dans le texte d'origine, ou -1. Le préfixe testé est
  // réduit par paliers : un extrait peut différer légèrement de la mise en page réelle (césure,
  // espace insécable), sans pour autant être inventé.
  function localiserExtrait(texte, extrait) {
    if (!texte || !extrait) return -1;
    const source = normaliserAvecIndex(texte);
    const cible = normaliserAvecIndex(extrait).texte.trim();
    // Trop court pour constituer une preuve : « le 15 » se retrouverait partout.
    if (cible.length < 12) return -1;
    let longueur = Math.min(80, cible.length);
    const longueurMin = Math.max(12, Math.min(20, cible.length));
    let pos = -1;
    while (pos === -1 && longueur >= longueurMin) {
      pos = source.texte.indexOf(cible.slice(0, longueur));
      if (pos === -1) longueur -= 10;
    }
    return pos === -1 ? -1 : source.index[pos];
  }

  // ==== EXTRACTION STRUCTURÉE : situer une valeur dans le document ====

  // Retrouve où une valeur DÉJÀ extraite apparaît dans le texte, pour pouvoir en donner la page.
  // Distinct de localiserExtrait(), qui vérifie une CITATION du modèle et exige pour ça au moins
  // 12 caractères (« le 15 » se retrouverait partout) : ici la valeur vient de nos propres règles,
  // on cherche seulement à la situer — un patronyme ou un montant font souvent moins de 12
  // caractères, et les écarter reviendrait à n'afficher aucune page, ce qui était le défaut signalé.
  function localiserValeur(texte, aiguille) {
    const brut = String(aiguille === null || aiguille === undefined ? '' : aiguille).trim();
    if (!texte || brut.length < 3) return -1;
    const source = normaliserAvecIndex(texte);
    const cible = normaliserAvecIndex(brut).texte.trim();
    if (cible.length < 3) return -1;
    const pos = source.texte.indexOf(cible);
    return pos === -1 ? -1 : source.index[pos];
  }

  // Phrase entourant un index, pour montrer la valeur DANS son contexte plutôt que seule.
  function extraitAutour(texte, index, longueur) {
    const source = String(texte || '');
    const debut = Math.max(0, index - 90);
    const fin = Math.min(source.length, index + Math.max(Number(longueur) || 0, 20) + 90);
    let extrait = source.slice(debut, fin).replace(/\s+/g, ' ').trim();
    if (debut > 0) extrait = '…' + extrait;
    if (fin < source.length) extrait += '…';
    return extrait;
  }

  // Formes sous lesquelles une valeur peut réellement figurer dans l'acte. Un nom de dossier
  // « DUPONT / MARTIN » n'y apparaît jamais tel quel (c'est une composition), un prix « 250000 »
  // s'y écrit « 250 000 » : chercher la valeur telle qu'on l'affiche ne donnerait jamais rien.
  function aiguillesPourValeur(cle, valeur) {
    if (valeur === null || valeur === undefined || valeur === '') return [];
    const brut = String(valeur);
    if (cle === 'nom') {
      return brut.split('/').map(p => p.split('&')[0].trim()).filter(p => p.length >= 3);
    }
    if (cle === 'prixVente') {
      const n = Number(brut);
      if (!Number.isFinite(n)) return [brut];
      return [
        String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
        String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
        String(n)
      ];
    }
    if (cle === 'adresseBien') {
      // L'adresse complète est reconstituée à partir de composants : la voie seule, sans le code
      // postal ni la commune qui la suivent, se retrouve plus fidèlement dans le texte d'origine.
      return [brut, brut.replace(/\(?\d{5}\)?.*$/, '').trim()].filter(x => x.length >= 3);
    }
    return [brut];
  }

  // Source (page + extrait) d'une valeur extraite par nos règles.
  function sourcePourValeur(texte, cle, valeur) {
    for (const aiguille of aiguillesPourValeur(cle, valeur)) {
      const index = localiserValeur(texte, aiguille);
      if (index >= 0) {
        return { index, page: pageDepuisIndex(index), extrait: extraitAutour(texte, index, String(aiguille).length) };
      }
    }
    return null;
  }

  // ---- analyse juridique : documents que le vendeur s'engage à fournir ----

  // Chaque entrée porte sa catégorie : un notaire distingue l'entretien courant à justifier
  // (ramonage, chaudière) des travaux à faire exécuter, et des justificatifs administratifs.
  // `cleChecklist` relie cette détection à une pièce de PIECES_ENGAGEMENTS_AUTO (voir plus bas,
  // section "suivi des pièces du dossier") : un document REPÉRÉ DANS LE COMPROMIS est ajouté
  // automatiquement à la checklist du dossier, pour être ensuite recherché dans le dossier local
  // relié comme n'importe quelle autre pièce. Limité au départ à trois entrées (chaudière, PAC,
  // ramonage), étendu ensuite à TOUTES sur demande explicite de l'étude — un document qu'elle doit
  // réclamer au vendeur mérite le même suivi, quelle que soit sa nature.
  // Deux entrées pointent volontairement vers une clé DÉJÀ présente dans la checklist standard
  // (assainissement, diagnostics) : checklistPieces() dédoublonne, la pièce standard l'emporte et
  // rien n'apparaît deux fois.
  const DOCUMENTS_VENDEUR_CONNUS = [
    // Entretien courant à justifier
    { motif: /ramonage|entretien\s+(?:de\s+la\s+)?chemin[ée]e|conduits?\s+de\s+fum[ée]e/i, label: 'Justificatif de ramonage', cat: 'entretien', cleChecklist: 'ramonage' },
    { motif: /entretien\s+(?:annuel\s+)?(?:de\s+la\s+)?chaudi[èe]re|contrat\s+d.entretien\s+(?:de\s+la\s+)?chaudi[èe]re/i, label: "Justificatif d'entretien de la chaudière", cat: 'entretien', cleChecklist: 'entretienChaudiere' },
    { motif: /entretien\s+(?:du\s+|de\s+la\s+)?(?:syst[èe]me\s+de\s+)?pompe\s+[àa]\s+chaleur|entretien\s+(?:de\s+la\s+)?pac\b/i, label: "Justificatif d'entretien de la pompe à chaleur", cat: 'entretien', cleChecklist: 'entretienPac' },
    { motif: /entretien.{0,30}(?:climatisation|clim\b)/i, label: "Justificatif d'entretien de la climatisation", cat: 'entretien', cleChecklist: 'entretienClim' },
    { motif: /vidange\s+(?:de\s+la\s+)?fosse|(?:entretien|vidange).{0,30}fosse\s+septique/i, label: 'Vidange de fosse septique', cat: 'entretien', cleChecklist: 'vidangeFosse' },
    { motif: /entretien.{0,30}adoucisseur/i, label: "Entretien de l'adoucisseur d'eau", cat: 'entretien', cleChecklist: 'entretienAdoucisseur' },
    { motif: /d[ée]broussaill|[ée]lagage/i, label: 'Débroussaillage / élagage', cat: 'entretien', cleChecklist: 'debroussaillage' },

    // Travaux à réaliser
    { motif: /remettre\s+en\s+[ée]tat|remise\s+en\s+[ée]tat|r[ée]paration/i, label: 'Travaux de remise en état', cat: 'travaux', cleChecklist: 'travauxRemiseEtat' },
    { motif: /r[ée]gularisation.{0,60}travaux|travaux.{0,60}r[ée]gularis|mise\s+en\s+conformit[ée]/i, label: 'Régularisation / mise en conformité', cat: 'travaux', cleChecklist: 'miseEnConformite' },
    { motif: /cuve\s+[àa]\s+(?:fioul|mazout|gaz)|citerne|d[ée]gazage|enl[èe]vement.{0,40}citerne/i, label: 'Enlèvement / neutralisation de cuve ou citerne', cat: 'travaux', cleChecklist: 'cuveCiterne' },
    { motif: /d[ée]barras|encombrants/i, label: 'Débarras des encombrants', cat: 'travaux', cleChecklist: 'debarras' },

    // Justificatifs et attestations
    { motif: /certificat\s+de\s+conformit[ée]|attestation\s+de\s+conformit[ée]|consuel/i, label: 'Attestation de conformité', cat: 'justificatif', cleChecklist: 'attestationConformite' },
    { motif: /garantie\s+d[ée]cennale/i, label: 'Justificatif de garantie décennale', cat: 'justificatif', cleChecklist: 'garantieDecennale' },
    { motif: /dommage[- ]ouvrage/i, label: 'Assurance dommage-ouvrage', cat: 'justificatif', cleChecklist: 'dommageOuvrage' },
    { motif: /factures?\s+(?:des\s+|de\s+)?travaux|justificatifs?\s+(?:des\s+)?travaux/i, label: 'Factures des travaux réalisés', cat: 'justificatif', cleChecklist: 'facturesTravaux' },
    { motif: /assainissement\s+non\s+collectif|contr[ôo]le\s+d.assainissement|spanc\b/i, label: "Contrôle d'assainissement", cat: 'justificatif', cleChecklist: 'reponseAssainissement' },
    { motif: /[ée]tat\s+parasitaire|m[ée]rule/i, label: 'État parasitaire / mérule', cat: 'justificatif', cleChecklist: 'etatParasitaire' },
    { motif: /audit\s+[ée]nerg[ée]tique/i, label: 'Audit énergétique', cat: 'justificatif', cleChecklist: 'auditEnergetique' },
    { motif: /s[ée]curit[ée]\s+(?:de\s+la\s+)?piscine|alarme\s+piscine|barri[èe]re\s+de\s+protection/i, label: 'Conformité sécurité piscine', cat: 'justificatif', cleChecklist: 'securitePiscine' },
    { motif: /r[ée]sili(?:er|ation).{0,40}contrat/i, label: 'Justificatif de résiliation de contrat', cat: 'justificatif', cleChecklist: 'resiliationContrat' }
  ];

  // Les documents ne sont cherchés QUE dans les clauses d'engagement du vendeur et les conditions
  // suspensives : chercher dans tout le compromis remontait des faux positifs (un adoucisseur cité
  // dans la liste des immeubles par destination n'est pas une pièce à réclamer).
  function detecterDocumentsAFournir(clauses) {
    const trouves = [];
    const vus = new Set();
    const zonesPertinentes = clauses.map(c => (typeof c === 'string' ? c : c.phrase)).join('\n');
    DOCUMENTS_VENDEUR_CONNUS.forEach(doc => {
      if (doc.motif.test(zonesPertinentes) && !vus.has(doc.label)) {
        vus.add(doc.label);
        trouves.push({ label: doc.label, cat: doc.cat, cleChecklist: doc.cleChecklist || null });
      }
    });
    return trouves;
  }

  // Extrait les phrases où le VENDEUR s'engage à remettre/produire/fournir un document,
  // pour donner accès aux clauses exactes du compromis (et pas seulement à l'étiquette générique).
  // Un engagement n'est retenu que s'il porte sur une PIÈCE à fournir ou des TRAVAUX à réaliser :
  // les clauses générales (maintenir le bien en l'état, s'interdire de consentir un bail…) sont
  // des obligations de comportement, sans document ni chantier à suivre — elles sont écartées.
  const OBJET_DOCUMENT_RE = /certificat|attestation|justificatif|justifer|justifier|diagnostic|facture|devis|[ée]tat\s+parasitaire|police\s+d.assurance|contr[ôo]le|audit|document/i;
  const OBJET_ENTRETIEN_RE = /entretien|ramonage|vidange|d[ée]broussaill|[ée]lagage|curage|nettoyage/i;
  const OBJET_TRAVAUX_RE = /travaux|r[ée]paration|remettre\s+en\s+[ée]tat|remise\s+en\s+[ée]tat|mise\s+en\s+conformit[ée]|r[ée]gularis|d[ée]barras|d[ée]gazage|d[ée]molition|raccordement|remplacement|d[ée]pollution|enl[èe]vement|lib[ée]rer\s+les\s+lieux|r[ée]silier/i;

  // Une énumération d'équipements vendus avec le bien (immeubles par destination) contient beaucoup
  // de mots-clés d'équipement sans être un engagement : on l'écarte explicitement.
  const LISTE_EQUIPEMENTS_RE = /immeuble\s+par\s+destination|laisser\s+dans\s+l.immeuble|sans\s+que\s+cette\s+liste\s+soit\s+limitative|biens\s+ci-apr[èe]s\s+d[ée]sign[ée]s/i;

  // Thèmes explicitement exclus de l'analyse : ils relèvent du suivi notarial classique et non
  // des pièces ou travaux à réclamer au vendeur dans le cadre de ce suivi.
  // "demande de visite" ajoutée sur retour de l'étude : une clause standard sur l'organisation de
  // visites du bien avant la vente (accès du bien à l'acquéreur/aux diagnostiqueurs...) ne
  // constitue pas un engagement à réclamer après coup, contrairement à une clause de travaux/
  // documents/entretien — elle ne doit jamais ressortir dans les obligations du vendeur.
  // "trentenaire" ajoutée de même : « le vendeur doit justifier de l'origine trentenaire » est une
  // clause de style présente dans quasiment tous les avant-contrats, et l'établissement de cette
  // origine relève du travail du notaire sur le titre — pas d'une pièce à réclamer au vendeur.
  const EXCLUSION_ENGAGEMENT_RE = /urbanisme|permis\s+de\s+construire|d[ée]claration\s+pr[ée]alable|droit\s+de\s+pr[ée]emption|\bdia\b|bornage|servitude|cadastr|copropri[ée]t[ée]|syndic|assembl[ée]e\s+g[ée]n[ée]rale|[ée]tat\s+dat[ée]|fonds\s+de\s+travaux|charges\s+de\s+copropri[ée]t[ée]|taxe\s+fonci[èe]re|imp[ôo]t\s+foncier|quitus\s+fiscal|hypoth[ée]|mainlev[ée]e|certificat\s+de\s+radiation|privil[èe]ge\s+de\s+pr[êe]teur|demande\s+de\s+visite|trentenaire/i;

  // Clauses purement hypothétiques : « SI le bien VENAIT À se trouver en zone contaminée, le
  // vendeur s'engage à fournir un état parasitaire ». Rien n'est dû tant que l'hypothèse ne se
  // réalise pas — ce n'est pas une pièce à réclamer à l'ouverture du dossier, contrairement au
  // renouvellement d'un diagnostic ou d'un entretien, qui lui est ferme et daté.
  const CLAUSE_HYPOTHETIQUE_RE = /\bsi\s+(?:les?|la|des|le\s+bien|l[ea]s?\s+biens?)[^.]{0,120}?\b(?:venai(?:en)?t|se\s+r[ée]v[ée]lai(?:en)?t|[ée]tai(?:en)?t|devai(?:en)?t|s'av[ée]rai(?:en)?t)(?=\s)|\bdans\s+(?:le\s+cas|l.hypoth[èe]se)\s+o[ùu](?=\s)|\bau\s+cas\s+o[ùu](?=\s)|\bs'il\s+(?:venait|s'av[ée]rait|appara[îi]ssait)(?=\s)|\bviendrai(?:en)?t\s+[àa]\s+se\s+trouver|\bsi\s+d(?:es|e\s+telles?)\b[^.]{0,80}\bse\s+r[ée]v[ée]lai(?:en)?t(?=\s|,)|\b(?:appara[îi]traient|surviendrai(?:en)?t|se\s+r[ée]v[ée]lerai(?:en)?t)(?=\s|,)/i;

  // Occupation, jouissance et libération des lieux : elles relèvent des modalités de remise du
  // bien le jour de l'acte, pas des pièces ou travaux à obtenir en amont.
  const OCCUPATION_JOUISSANCE_RE = /occupation\s+du\s+bien|entr[ée]e\s+en\s+jouissance|jouissance\s+(?:du\s+bien|des\s+biens|r[ée]elle)|lib[ée]rer\s+les\s+lieux|lib[ée]ration\s+des\s+lieux|libres?\s+de\s+toute\s+occupation|[ée]tat\s+des\s+lieux|remise\s+des\s+cl[ée]s/i;

  // Un compromis structure ses clauses en sections ("Conditions suspensives", "Conditions
  // particulières") découpées en rubriques titrées (CITERNE DE GAZ :, COUVERTURE :…). Les lire
  // ainsi est bien plus fiable qu'une recherche de mots-clés au fil du texte, et garantit qu'aucune
  // rubrique n'est oubliée.
  // Une ligne de sommaire : courte, presque entièrement en majuscules, sans phrase.
  function estLigneDeTitre(ligne) {
    const l = String(ligne || '').trim();
    if (!l || l.length > 60) return false;
    const lettres = l.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (lettres.length < 3) return false;
    const majuscules = l.replace(/[^A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/g, '');
    return majuscules.length / lettres.length > 0.8;
  }

  var MIN_TITRES_POUR_SOMMAIRE = 3;

  // Le premier « DÉSIGNATION » d'un acte n'est presque jamais le titre de la section recherchée :
  // beaucoup de trames ouvrent par un SOMMAIRE qui enchaîne les titres, et le mot apparaît aussi
  // au fil d'une phrase (« … dont la désignation suit »). Retenir la première occurrence faisait
  // lire une table des matières à la place du bien — c'est ce qui privait la moitié du corpus
  // d'adresse. Un vrai titre de section ouvre sa ligne et n'est pas suivi d'autres titres.
  function estDebutDeSection(texte, index, titre) {
    // Un titre de section est écrit EN CAPITALES dans toutes les trames rencontrées. C'est le
    // test décisif : « être en début de ligne » ne suffit pas, un PDF coupant ses lignes où sa
    // mise en page le veut, une phrase courante peut parfaitement commencer une ligne par
    // « désignation suit… » — et c'est exactement ce qui faisait lire à l'outil une clause de
    // style à la place de la désignation du bien.
    const mot = String(titre || '');
    if (mot !== mot.toUpperCase()) return false;
    const debutLigne = texte.lastIndexOf('\n', index) + 1;
    if (texte.slice(debutLigne, index).trim() !== '') return false;
    const lignes = texte.slice(index).split('\n').slice(1).filter(l => l.trim()).slice(0, 5);
    return lignes.filter(estLigneDeTitre).length < MIN_TITRES_POUR_SOMMAIRE;
  }

  function extraireSection(texte, titreRe, titreSuivantRe) {
    const source = String(texte || '');
    const re = new RegExp(titreRe.source, titreRe.flags.replace('g', '') + 'g');
    let debut = -1;
    let m;
    while ((m = re.exec(source)) !== null) {
      if (estDebutDeSection(source, m.index, m[0])) { debut = m.index; break; }
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    if (debut === -1) return '';
    const reste = source.slice(debut);
    const fin = titreSuivantRe ? reste.slice(20).search(titreSuivantRe) : -1;
    return fin === -1 ? reste.slice(0, 12000) : reste.slice(0, fin + 20);
  }

  // Découpe une section en rubriques : un titre est une ligne courte en majuscules, souvent
  // terminée par « : ».
  function decouperEnRubriques(section) {
    const rubriques = [];
    const lignes = section.split('\n');
    let courante = null;
    const titreRe = /^\s*([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ'’\s,\-\/\d]{3,70})\s*:\s*$/;

    lignes.forEach(ligne => {
      const m = ligne.match(titreRe);
      if (m) {
        if (courante) rubriques.push(courante);
        courante = { titre: m[1].replace(/\s+/g, ' ').trim(), contenu: '' };
      } else if (courante) {
        courante.contenu += ' ' + ligne.trim();
      }
    });
    if (courante) rubriques.push(courante);

    return rubriques
      .map(r => ({ titre: r.titre, contenu: r.contenu.replace(/\s+/g, ' ').trim() }))
      .filter(r => r.contenu.length > 30);
  }

  function extraireConditionsParticulieres(texte) {
    const section = extraireSection(
      texte,
      /Conditions\s+particuli[èe]res/i,
      /\n\s*(?:Interdiction\s+pour\s+le\s+vendeur|Obligations\s+de\s+garde|Dispositions\s+(?:diverses|g[ée]n[ée]rales)|Signatures?|Annexes?)\b/i
    );
    if (!section) return [];
    return decouperEnRubriques(section).map(r => ({
      titre: r.titre,
      contenu: r.contenu.length > 400 ? r.contenu.slice(0, 400) + '…' : r.contenu,
      // Une rubrique est signalée comme « à suivre » si le vendeur y prend un engagement.
      engagementVendeur: /\ble\s+vendeur\s+s.(?:engage|oblige)|\ble\s+vendeur\s+(?:devra|remettra|produira|fournira|justifiera)/i.test(r.contenu)
    }));
  }

  function extraireConditionsSuspensives(texte) {
    const section = extraireSection(
      texte,
      /\nConditions\s+suspensives/i,
      /\n\s*Conditions\s+particuli[èe]res/i
    );
    const rubriques = section ? decouperEnRubriques(section) : [];

    // La condition de prêt a son propre titre de section dans la plupart des modèles.
    const cs = rubriques.map(r => ({
      titre: r.titre,
      contenu: r.contenu.length > 350 ? r.contenu.slice(0, 350) + '…' : r.contenu
    }));

    const pret = texte.match(/Condition\s+suspensive\s+de\s+l.obtention\s+d.un\s+pr[êe]t[^\n]{0,120}/i);
    if (pret && !cs.some(c => /pr[êe]t/i.test(c.titre))) {
      const dateButoir = texte.match(/DUR[ÉE]E\s+DE\s+VALIDIT[ÉE][^\n]{0,120}/i);
      cs.unshift({
        titre: "OBTENTION D'UN PRÊT IMMOBILIER",
        contenu: dateButoir ? dateButoir[0].replace(/\s+/g, ' ').trim() : pret[0].replace(/\s+/g, ' ').trim()
      });
    }
    return cs;
  }

  // Un compromis structure ses clauses par rubriques en majuscules (CITERNE DE GAZ :, COUVERTURE :…)
  // regroupées sous « Conditions particulières » / « Conditions suspensives ». On exploite cette
  // structure pour restituer les clauses telles que le notaire les lit, sans rien inventer.
  function extraireConditions(texte) {
    const resultats = [];
    const vus = new Set();

    const sections = [
      // Le titre doit être seul sur sa ligne : évite d'attraper « ...sous conditions suspensives »
      // du titre courant répété en pied de page.
      { titre: /\n\s*Conditions?\s+suspensives?\s*\n/i, type: 'suspensive' },
      { titre: /\n\s*Conditions?\s+particuli[èe]res?\s*\n/i, type: 'particuliere' }
    ];

    sections.forEach(({ titre, type }) => {
      const m = texte.match(titre);
      if (!m) return;
      const debut = m.index + m[0].length;
      // La section s'arrête au prochain grand titre de niveau équivalent.
      const reste = texte.slice(debut, debut + 12000);
      const finMatch = reste.match(/\n(?:Conditions?\s+particuli[èe]res?|Interdiction\s+pour\s+le\s+vendeur|Obligations?\s+de\s+garde|Date\s+et\s+signatures?|Dispositions?\s+g[ée]n[ée]rales?)\s*\n/i);
      const corps = finMatch ? reste.slice(0, finMatch.index) : reste;

      // Rubriques : ligne en MAJUSCULES, tolérant les mots de liaison en minuscules
      // (« CHAUFFAGE et PRODUCTION D'EAU CHAUDE : »).
      const reRubrique = /(?:^|\n)([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ'’\s\-,()°.\d]*(?:\s(?:et|de|du|des|d'|l'|la|le)\s[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ'’\s\-,()°.\d]*)*)\s*:\s*/g;
      const points = [];
      let r;
      while ((r = reRubrique.exec(corps)) !== null) {
        const t = r[1].trim().replace(/\s+/g, ' ');
        if (t.length < 4 || t.length > 70) continue;
        points.push({ titre: t, debut: r.index + r[0].length });
      }

      points.forEach((p, i) => {
        const fin = (i + 1 < points.length) ? points[i + 1].debut : corps.length;
        let contenu = corps.slice(p.debut, fin).replace(/\s+/g, ' ').trim();
        // Retire les pieds de page répétés par l'extraction PDF.
        contenu = contenu.replace(/Compromis de vente[^\n]{0,120}Page \d+ sur \d+/gi, '').trim();
        if (contenu.length < 20) return;
        const cle = p.titre.toLowerCase();
        if (vus.has(cle)) return;
        vus.add(cle);
        resultats.push({ titre: p.titre, contenu: contenu.slice(0, 600), type });
      });

      // Certaines conditions suspensives ont un titre de ligne sans « : » final
      // (« CERTIFICAT OU NOTE D'URBANISME », « DROIT DE PRÉEMPTION URBAIN (DPU) »).
      if (type === 'suspensive' && points.length === 0) {
        const reTitreSeul = /(?:^|\n)([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ'’\s\-()°\d]{6,70})\n/g;
        const titres = [];
        let t;
        while ((t = reTitreSeul.exec(corps)) !== null) {
          titres.push({ titre: t[1].trim().replace(/\s+/g, ' '), debut: t.index + t[0].length });
        }
        titres.forEach((p, i) => {
          const fin = (i + 1 < titres.length) ? titres[i + 1].debut : corps.length;
          let contenu = corps.slice(p.debut, fin).replace(/\s+/g, ' ').trim();
          contenu = contenu.replace(/Compromis de vente[^\n]{0,120}Page \d+ sur \d+/gi, '').trim();
          if (contenu.length < 40) return;
          const cle = p.titre.toLowerCase();
          if (vus.has(cle)) return;
          vus.add(cle);
          resultats.push({ titre: p.titre, contenu: contenu.slice(0, 600), type });
        });
      }
    });

    return resultats;
  }

  function extraireEngagementsVendeur(texte) {
    const engagements = [];
    const vus = new Set();
    // Uniquement les vrais engagements du vendeur (ce qu'il reste à faire ou à produire), et non
    // les diagnostics déjà fournis et annexés à l'acte, qui ne demandent plus aucune action.
    // Selon la nature de l'acte, le vendeur peut être désigné VENDEUR (compromis synallagmatique)
    // ou PROMETTANT (promesse unilatérale de vente, souvent réitérée par acte authentique) : les
    // deux rôles portent la même obligation de délivrance et sont traités de façon identique.
    const re = /\ble\s+(?:vendeur|promettant)\s+(?:s'engage(?:\s+à)?|s'oblige(?:\s+à)?|devra|remettra|produira|fournira|communiquera|justifiera|fera\s+son\s+affaire)\b/gi;
    let m;
    while ((m = re.exec(texte)) !== null) {
      let fin = m.index;
      let n = 0;
      while (fin < texte.length && n < 450) {
        if (texte[fin] === '.') { fin++; break; }
        fin++; n++;
      }
      let debut = m.index;
      n = 0;
      // Fenêtre arrière large : le conditionnel qui neutralise l'engagement se trouve souvent en
      // tête de phrase (« Si les biens venaient à se trouver…, le VENDEUR s'engage à… »), bien
      // avant la mention du vendeur. Trop court, on retiendrait à tort une clause hypothétique.
      while (debut > 0 && n < 300) {
        if (texte[debut - 1] === '.') break;
        debut--; n++;
      }
      const phrase = texte.slice(debut, fin).replace(/\s+/g, ' ').trim();
      if (phrase.length <= 25) continue;
      if (EXCLUSION_ENGAGEMENT_RE.test(phrase)) continue;
      if (LISTE_EQUIPEMENTS_RE.test(phrase)) continue;
      if (CLAUSE_HYPOTHETIQUE_RE.test(phrase)) continue;
      if (OCCUPATION_JOUISSANCE_RE.test(phrase)) continue;

      const estEntretien = OBJET_ENTRETIEN_RE.test(phrase);
      const estTravaux = OBJET_TRAVAUX_RE.test(phrase);
      const estDocument = OBJET_DOCUMENT_RE.test(phrase);
      let type = null;
      if (!estEntretien && !estTravaux && !estDocument) {
        // La phrase correspond bien à l'ancrage strict ("le vendeur/promettant s'engage...") mais
        // aucun des trois motifs d'objet ne la catégorise — jusqu'ici, systématiquement abandonnée
        // (continue), même quand un(e) collaborateur(rice) avait déjà catégorisé à la main une
        // clause très proche lors d'un import précédent (voir ajouterEngagementManuel()/
        // ajouterEngagementDepuisFormulaire() ci-dessus). Reste borné à ce périmètre déjà anchré :
        // ne s'applique jamais à une phrase qui n'aurait pas d'abord passé ce motif strict, donc ne
        // risque pas d'élargir la détection à des sentences arbitraires du document.
        const apprise = trouverCorrectionApprise(phrase, 'engagement');
        if (!apprise) continue;
        type = apprise.classification;
      } else {
        // L'entretien prime : « justifier du dernier ramonage » est un entretien à prouver, pas des
        // travaux à faire exécuter — la distinction compte pour savoir quoi réclamer au vendeur.
        type = 'document';
        if (estEntretien) type = 'entretien';
        else if (estTravaux) type = 'travaux';
      }

      const cle = phrase.slice(0, 70);
      if (!vus.has(cle)) {
        vus.add(cle);
        engagements.push({ phrase, type, page: pageDepuisIndex(m.index) });
      }
    }
    return engagements;
  }

  function renderCondition(c) {
    const libelle = c.type === 'suspensive' ? 'Suspensive' : 'Particulière';
    return `<div class="condition-ligne">
      <span class="condition-titre"><span class="condition-badge ${c.type}">${libelle}</span>${escapeHtml(c.titre)}</span>
      <span class="condition-contenu">${escapeHtml(c.contenu)}</span>
    </div>`;
  }

  // Accepte le nouveau format {label, cat} comme l'ancien (simple chaîne), pour que les dossiers
  // enregistrés avant cette évolution continuent de s'afficher.
  // `dossierId` absent (pendant l'import, voir afficherAnalyseJuridique) → la croix retire l'entrée
  // de analyseJuridiqueActuelle.documents (supprimerDocumentManuel) ; `dossierId` fourni (fiche
  // d'un dossier déjà enregistré, voir renderCarteDossier) → elle retire l'entrée de
  // d.analyseJuridique.documents avec confirmation + historique (supprimerDocumentDossier).
  // Demandé par l'étude : jusqu'ici aucun document identifié n'était retirable, dans aucun des
  // deux contextes.
  function renderDocBadge(doc, index, dossierId) {
    const label = (typeof doc === 'string') ? doc : doc.label;
    const cat = (typeof doc === 'string') ? '' : (doc.cat || '');
    const appelSuppr = dossierId
      ? `supprimerDocumentDossier('${dossierId}', ${index})`
      : `supprimerDocumentManuel(${index})`;
    const boutonSuppr = `<button type="button" class="analyse-doc-suppr" onclick="${appelSuppr}" title="Retirer ce document de la liste" aria-label="Retirer ce document">${icone('x')}</button>`;
    return `<span class="analyse-doc-badge${cat ? ' cat-' + cat : ''}">${escapeHtml(label)}${boutonSuppr}</span>`;
  }

  // Accepte aussi bien le nouveau format {phrase, type} que l'ancien (simple chaîne), pour que
  // les dossiers enregistrés avant cette évolution continuent de s'afficher correctement.
  // Bouton de suppression désormais affiché pour TOUT engagement, plus seulement ceux ajoutés à la
  // main — demandé par l'étude (jusqu'ici, un engagement détecté automatiquement ne pouvait être
  // corrigé qu'en resserrant la regex, jamais retiré au cas par cas ; revu ici explicitement à sa
  // demande). `dossierId` absent (import, voir afficherAnalyseJuridique) → retire de
  // analyseJuridiqueActuelle.engagements (supprimerEngagementManuel, sans confirmation : pré-
  // enregistrement, reversible en réimportant) ; `dossierId` fourni (fiche enregistrée, voir
  // renderCarteDossier) → retire de d.analyseJuridique.engagements avec confirmation + historique
  // (supprimerEngagementDossier).
  function renderEngagement(e, index, dossierId) {
    const phrase = (typeof e === 'string') ? e : e.phrase;
    const type = (typeof e === 'string') ? null : e.type;
    const page = (typeof e === 'string') ? null : e.page;
    const manuel = typeof e === 'object' && e.manuel === true;
    const suggereParIa = typeof e === 'object' && e.source === 'ia';
    const libelles = { entretien: 'Entretien', travaux: 'Travaux', document: 'Document', autre: 'Autres' };

    // Édition d'un engagement ajouté via l'option de surlignage (ou tout autre engagement) :
    // demandé par l'étude pour corriger une clause sans devoir la supprimer puis la ressaisir en
    // entier. `dossierId` distingue le même contexte import/fiche que la suppression ci-dessous.
    const enEdition = engagementEnEdition
      && engagementEnEdition.dossierId === (dossierId || null)
      && engagementEnEdition.index === index;
    if (enEdition) {
      const appelValider = dossierId ? `validerEditionEngagement('${dossierId}', ${index})` : `validerEditionEngagement(null, ${index})`;
      const appelAnnuler = dossierId ? `annulerEditionEngagement('${dossierId}')` : `annulerEditionEngagement(null)`;
      const typeActuel = type || 'document';
      return `<div class="analyse-engagement-ligne analyse-engagement-edition">
        <select id="engagement-edition-type">
          ${Object.entries(libelles).map(([val, label]) => `<option value="${val}"${typeActuel === val ? ' selected' : ''}>${label}</option>`).join('')}
        </select>
        <textarea id="engagement-edition-texte" rows="2">${escapeHtml(phrase)}</textarea>
        <button type="button" class="icon-valider" onclick="${appelValider}" title="Valider" aria-label="Valider la modification">✓</button>
        <button type="button" class="icon-btn" onclick="${appelAnnuler}">Annuler</button>
      </div>`;
    }

    const etiquette = type
      ? `<span class="engagement-type ${libelles[type] ? type : 'document'}">${libelles[type] || 'Document'}</span>`
      : '';
    // Le clic pour sauter à la page ET surligner la phrase (voir voirEngagementDansPdf, même
    // esprit que voirDateDansPdf pour les dates — demandé par l'étude) n'est possible que si le
    // PDF d'origine est encore chargé en mémoire — jamais le cas sur un dossier déjà enregistré
    // rouvert plus tard (le PDF lui-même n'est pas conservé). Le numéro de page reste malgré tout
    // indiqué dans ce cas, à titre indicatif : c'est justement le cas d'usage le plus courant
    // (relire une clause quelques jours après l'import du compromis).
    const boutonVoir = !page ? '' : pdfActuel
      ? `<button type="button" class="voir-pdf-btn" onclick="voirEngagementDansPdf(${page}, '${codifierPourAttribut(phrase)}')">${icone('eye')} p.${page}</button>`
      : `<span class="chip-page" title="Détecté page ${page} du compromis">p.${page}</span>`;
    // Sélectionnée à la main dans l'aperçu PDF (voir gererSelectionPdf) plutôt que trouvée par
    // extraireEngagementsVendeur() : uniquement indicatif désormais (voir plus haut, la croix de
    // suppression s'affiche pour tous les engagements, pas seulement ceux-ci).
    // Même emplacement/style que le marqueur "Ajouté manuellement" (texte simple, pas d'icône) —
    // seul le texte change selon la provenance ; jamais les deux en même temps (source mutuellement
    // exclusive : soit sélectionné à la main dans le PDF, soit suggéré par l'IA, soit détecté par
    // regex sans marqueur du tout).
    const marqueurManuel = manuel
      ? '<span class="engagement-manuel">Ajouté manuellement</span>'
      : (suggereParIa ? '<span class="engagement-manuel" title="Extrait par le modèle IA local — à vérifier comme toute suggestion automatique">Suggéré par l\'IA</span>' : '');
    const appelSuppr = dossierId
      ? `supprimerEngagementDossier('${dossierId}', ${index})`
      : `supprimerEngagementManuel(${index})`;
    const boutonSupprimer = `<button type="button" class="engagement-suppr" onclick="${appelSuppr}" title="Retirer cet engagement" aria-label="Retirer cet engagement">${icone('x')}</button>`;
    const appelEditer = dossierId ? `activerEditionEngagement('${dossierId}', ${index})` : `activerEditionEngagement(null, ${index})`;
    const boutonEditer = `<button type="button" class="icon-crayon" onclick="${appelEditer}" title="Modifier cet engagement" aria-label="Modifier cet engagement">${icone('pencil')}</button>`;
    return `<div class="analyse-engagement-ligne">${etiquette}<span>${escapeHtml(phrase)}</span>${marqueurManuel}${boutonVoir}${boutonEditer}${boutonSupprimer}</div>`;
  }

  function activerEditionEngagement(dossierId, index) {
    engagementEnEdition = { dossierId: dossierId || null, index };
    if (dossierId) render(); else afficherAnalyseJuridique();
  }

  function annulerEditionEngagement(dossierId) {
    engagementEnEdition = null;
    if (dossierId) render(); else afficherAnalyseJuridique();
  }

  // Valide l'édition d'un engagement (voir activerEditionEngagement ci-dessus) : agit sur
  // analyseJuridiqueActuelle pendant l'import (dossierId absent) ou sur d.analyseJuridique pour un
  // dossier déjà enregistré, même distinction que supprimerEngagementManuel/supprimerEngagementDossier.
  // Alimente aussi l'apprentissage (memoriserCorrection, catégorie 'engagement') : une correction
  // d'engagement est un signal aussi utile qu'un ajout pour reconnaître une clause proche au
  // prochain import (voir CLAUDE.md, "Apprentissage sur les clauses ajoutées manuellement").
  function validerEditionEngagement(dossierId, index) {
    const texteEl = document.getElementById('engagement-edition-texte');
    const typeEl = document.getElementById('engagement-edition-type');
    const phrase = texteEl ? texteEl.value.trim() : '';
    const type = typeEl ? typeEl.value : 'document';
    if (!phrase) { if (texteEl) texteEl.focus(); return; }

    if (dossierId) {
      const d = dossiers.find(x => x.id === dossierId);
      const cible = d && d.analyseJuridique && d.analyseJuridique.engagements[index];
      if (!cible) { engagementEnEdition = null; render(); return; }
      cible.phrase = phrase;
      cible.type = type;
      ajouterHistorique(d, `Engagement du vendeur modifié : « ${phrase.slice(0, 80)}${phrase.length > 80 ? '…' : ''} »`);
      memoriserCorrection(phrase, type, null, 'engagement');
      engagementEnEdition = null;
      sauvegarder(d);
      render();
    } else {
      const cible = analyseJuridiqueActuelle.engagements[index];
      if (!cible) { engagementEnEdition = null; afficherAnalyseJuridique(); return; }
      cible.phrase = phrase;
      cible.type = type;
      memoriserCorrection(phrase, type, null, 'engagement');
      engagementEnEdition = null;
      afficherAnalyseJuridique();
    }
  }

  // L'analyse juridique est sa propre étape du wizard (étape 3, voir definirEtapeWizard) — plus un
  // onglet superposé à l'aperçu PDF : aucune étape n'étant verrouillée, elle reste accessible même
  // sans rien à montrer (message d'état vide ci-dessous), pas besoin de la cacher.
  function afficherAnalyseJuridique() {
    const listeDocs = document.getElementById('analyse-documents-liste');
    const note = document.getElementById('analyse-note');
    const vide = document.getElementById('analyse-vide-etat');
    const { documents, engagements, conditions = [] } = analyseJuridiqueActuelle;

    const analyseJuridiqueDisponible = documents.length > 0 || engagements.length > 0 || conditions.length > 0;
    if (vide) vide.style.display = analyseJuridiqueDisponible ? 'none' : 'block';
    if (!analyseJuridiqueDisponible) {
      document.getElementById('analyse-section-conditions').style.display = 'none';
      document.getElementById('analyse-section-engagements').style.display = 'none';
      const sectionDocuments = document.getElementById('analyse-section-documents');
      if (sectionDocuments) sectionDocuments.style.display = 'none';
      note.style.display = 'none';
      return;
    }
    const sectionDocumentsVisible = document.getElementById('analyse-section-documents');
    if (sectionDocumentsVisible) sectionDocumentsVisible.style.display = 'block';

    // Les conditions suspensives et particulières sont reprises telles qu'elles figurent au
    // compromis, rubrique par rubrique : c'est la lecture de référence du notaire.
    const sectionConditions = document.getElementById('analyse-section-conditions');
    sectionConditions.style.display = conditions.length > 0 ? 'block' : 'none';
    document.getElementById('analyse-nb-conditions').textContent = conditions.length || '';
    document.getElementById('analyse-conditions-liste').innerHTML = conditions.map(renderCondition).join('');

    // Les engagements sont affichés directement : ce sont les actions à suivre, elles ne doivent
    // pas être cachées derrière un clic.
    const sectionEngagements = document.getElementById('analyse-section-engagements');
    sectionEngagements.style.display = engagements.length > 0 ? 'block' : 'none';
    document.getElementById('analyse-nb-engagements').textContent = engagements.length || '';
    document.getElementById('analyse-engagements-liste').innerHTML = engagements
      .map((e, i) => renderEngagement(e, i))
      .join('');

    document.getElementById('analyse-nb-documents').textContent = documents.length || '';
    listeDocs.innerHTML = documents.length > 0
      ? documents.map((doc, i) => renderDocBadge(doc, i)).join('')
      : '<span class="analyse-vide">Aucun document type reconnu automatiquement.</span>';

    // La reconnaissance des documents s'appuie sur une liste de types courants : si le compromis
    // contient plus de clauses d'engagement que de documents identifiés, c'est le signe qu'une
    // pièce sort de cette liste. On le signale plutôt que de laisser croire à une liste exhaustive.
    if (engagements.length > documents.length) {
      note.style.display = 'block';
      // Le liseré ambre de .analyse-note (voir style.css) porte déjà l'avertissement : un préfixe
      // "⚠️" en plus ne faisait que répéter ce que la couleur dit déjà.
      note.textContent = documents.length === 0
        ? `${engagements.length} clause${engagements.length > 1 ? 's' : ''} d'engagement relevée${engagements.length > 1 ? 's' : ''}, mais aucun document type reconnu : lisez les clauses ci-dessus pour identifier les pièces attendues.`
        : `Liste possiblement incomplète : ${engagements.length} clauses d'engagement relevées pour ${documents.length} document${documents.length > 1 ? 's' : ''} identifié${documents.length > 1 ? 's' : ''}. Relisez les clauses ci-dessus.`;
    } else {
      note.style.display = 'none';
    }
  }

  // Extrait la phrase contenant la date (bornée par un maximum de caractères) plutôt qu'une simple
  // fenêtre de N caractères, pour éviter qu'un mot-clé d'une phrase voisine ne s'y mélange.
  function extraireContexte(texte, index, longueur) {
    const MAX_AVANT = 260, MAX_APRES = 220;
    let debut = index;
    let n = 0;
    while (debut > 0 && n < MAX_AVANT) {
      const ch = texte[debut - 1];
      if (ch === '.') break;
      debut--; n++;
    }
    let fin = index + longueur;
    n = 0;
    while (fin < texte.length && n < MAX_APRES) {
      const ch = texte[fin];
      if (ch === '.') { fin++; break; }
      fin++; n++;
    }
    return texte.slice(debut, fin).replace(/\s+/g, ' ').trim();
  }

  function detecterDatesDepuisTexte(texte, dateCompromis) {
    const resultats = [];
    const seen = new Set();

    // Un acte cite volontiers un texte de loi mot pour mot, entre guillemets. Le délai qui s'y
    // trouve appartient au texte cité, jamais aux engagements de CE contrat : sur une promesse
    // réelle, « au plus tard un mois après la signature de l'acte authentique de vente », citation
    // de l'article 1331-11-1, devenait la date de signature de l'acte du dossier. Le test
    // « le contexte cite-t-il un article de loi ? » serait bien trop large — la vraie condition
    // suspensive de prêt cite elle aussi ses articles du Code de la consommation ; c'est bien le
    // GUILLEMET OUVRANT non refermé qui distingue une citation d'une stipulation.
    function estDansCitation(source, index) {
      const avant = source.slice(Math.max(0, index - PORTEE_CITATION), index);
      return avant.lastIndexOf('«') > avant.lastIndexOf('»');
    }

    function ajouter(iso, label, index, longueur, approx, calcul) {
      // Un délai dont le point de départ est inconnu ne produit aucune date : calculerDateEcheance
      // renvoie null plutôt que de compter depuis la signature par défaut.
      if (!iso) return;
      if (seen.has(iso)) return;
      // Écarte toute date antérieure ou égale à la signature du compromis (diagnostics, actes précédents…).
      if (dateCompromis && iso <= dateCompromis) return;
      const contexte = extraireContexte(texte, index, longueur);
      if (EXCLUSION_RE.test(contexte.toLowerCase())) return;
      if (estDansCitation(texte, index)) return;
      // Voir A_COMPTER_RE ci-dessus : une date immédiatement introduite par "à compter du/de" est
      // une prise d'effet, pas une échéance — sauf si la clause parle de la réitération de l'acte
      // de vente lui-même, seul cas où cette date-là EST la bonne échéance. \br[ée]it[ée]r couvre
      // aussi bien le verbe ("sera réitéré") que le nom ("réitération"), pas seulement ce dernier.
      if (A_COMPTER_RE.test(texte.slice(Math.max(0, index - 30), index)) && !/\br[ée]it[ée]r/i.test(contexte)) return;
      let suggestion = suggererEcheance(contexte);
      // Un délai ancré sur la signature dont la PHRASE ne nomme pas le prêt restait sans catégorie :
      // la date était correctement calculée (60 jours après la signature) puis jamais reportée dans
      // « Obtention du prêt », le champ restait vide. C'est le cas dès que la clause s'intitule
      // « CONDITION SUSPENSIVE D'OBTENTION DE PRÊT » mais que la phrase du délai, elle, dit
      // seulement « … devra obtenir son offre au plus tard dans les 60 jours » — rédaction
      // courante. Signalé par l'étude (« il ne calcule plus les dates d'obtention de prêt quand il
      // y a des jours ») ; vérifié au passage que la version d'avant la refonte de l'extraction se
      // comportait déjà ainsi — ce n'est pas une régression, mais une limite jamais levée.
      // On élargit donc à la CLAUSE (600 caractères en amont, l'échelle d'un paragraphe d'acte)
      // uniquement pour ces dates-là : `calcul` n'est renseigné que pour une date issue d'un délai.
      // Sans risque de rattraper la clause de notification du refus au notaire : celle-ci est déjà
      // écartée en amont par le garde-fou « notifier/notification » de reAuPlusTardDelai et
      // reAuPlusTardApres, avant même d'arriver ici. La date reste marquée « ≈ estimée », donc
      // signalée comme à vérifier, exactement comme les autres dates déduites d'un délai.
      if (!suggestion && calcul) {
        const clause = texte.slice(Math.max(0, index - 600), index + longueur);
        if (VOCABULAIRE_PRET_CLAUSE_RE.test(clause)) suggestion = 'pret';
      }
      // Une correction déjà faite par un(e) collaborateur(rice) sur une clause très proche
      // l'emporte sur la suggestion par mots-clés (voir la section "apprentissage" plus bas).
      const apprise = trouverCorrectionApprise(contexte);
      if (apprise) suggestion = apprise.classification;
      seen.add(iso);
      resultats.push({
        iso, label, contexte, suggestion, active: !!suggestion, page: pageDepuisIndex(index),
        apprise: !!apprise, libelleAppris: apprise ? apprise.libelle : null,
        approx: !!approx,
        // Champ additif (aucun appelant existant ne le lit) : trace de quoi la date a été déduite
        // quand elle vient d'un délai, pour que l'objet date métier puisse afficher « calculée à
        // partir de la signature + 60 jours » plutôt qu'une date qui semble lue dans le texte.
        calcul: calcul || null,
        index
      });
    }

    const reNum = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g;
    let m;
    while ((m = reNum.exec(texte)) !== null) {
      const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        ajouter(toISO(y, mo - 1, d), m[0], m.index, m[0].length);
      }
    }

    const moisNoms = Object.keys(MOIS).join('|');
    // (?:er)? : voir le commentaire équivalent dans extraireDateDeFragment — "le 1er janvier"
    // sans ce groupe n'est jamais détecté.
    const reTexte = new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${moisNoms})\\s+(\\d{4})\\b`, 'gi');
    while ((m = reTexte.exec(texte)) !== null) {
      const d = parseInt(m[1], 10);
      const moKey = m[2].toLowerCase();
      const y = parseInt(m[3], 10);
      if (MOIS.hasOwnProperty(moKey)) {
        ajouter(toISO(y, MOIS[moKey], d), m[0], m.index, m[0].length);
      }
    }

    // Date arrondie à la fin d'un mois ("avant fin septembre 2026", "d'ici fin septembre 2026") :
    // résolue au dernier jour civil de ce mois, marquée "approx" (badge "≈ estimée" côté chip/
    // confiance) plutôt que traitée comme une date lue telle quelle. L'année doit être écrite
    // explicitement dans le texte : sans elle, il faudrait deviner entre l'année du compromis et la
    // suivante selon le mois — exactement le genre de supposition qui a déjà produit une mauvaise
    // date silencieuse (voir l'historique des bugs corrigés dans CLAUDE.md). Pas trouvée → pas
    // ajoutée, l'utilisateur la saisit à la main comme pour tout ce que l'outil ne reconnaît pas.
    const reFinMois = new RegExp(`\\bfin\\s+(${moisNoms})\\s+(\\d{4})\\b`, 'gi');
    while ((m = reFinMois.exec(texte)) !== null) {
      const moKey = m[1].toLowerCase();
      const y = parseInt(m[2], 10);
      if (MOIS.hasOwnProperty(moKey)) {
        const dernierJour = new Date(y, MOIS[moKey] + 1, 0).getDate();
        ajouter(toISO(y, MOIS[moKey], dernierJour), m[0], m.index, m[0].length, true);
      }
    }

    // Délai relatif à la signature ("délai de 30 jours à compter de la signature", "J+30") :
    // seulement calculable si la date de signature du compromis a été trouvée (dateCompromis) — sans
    // ancre fiable, on ne devine pas à partir de quoi compter, on laisse l'utilisateur l'ajouter lui-même.
    if (dateCompromis) {
      // « jours » ou « mois » : un délai de réitération est très souvent exprimé en mois
      // (« dans les trois mois de la signature ») — jusqu'ici seuls les jours étaient reconnus,
      // et ces clauses passaient entièrement inaperçues. Le calcul passe par
      // calculerDateEcheance (voir le socle de calcul), de quantième à quantième pour les mois.
      const reDelai = new RegExp('d[ée]lai\\s+de\\s+' + MOTIF_NOMBRE + '\\s*(jours?|mois)\\s+(?:[àa]\\s+compter|[àa]\\s+partir)\\s+de\\s+(?:la\\s+signature|ce\\s+jour|l[\'’]acte|la\\s+pr[ée]sente|le\\s+pr[ée]sent\\s+(?:compromis|acte)|la\\s+promesse)', 'gi');
      while ((m = reDelai.exec(texte)) !== null) {
        const delai = { valeur: valeurNombre(m[1]), unite: uniteDelai(m[2]) };
        ajouter(calculerDateEcheance(dateCompromis, delai), m[0], m.index, m[0].length, true,
          { delai, pointDepart: 'signature', baseDate: dateCompromis });
      }
      const reJPlus = /\bJ\s*\+\s*(\d{1,3})\b/g;
      while ((m = reJPlus.exec(texte)) !== null) {
        const delai = { valeur: parseInt(m[1], 10), unite: 'jours' };
        ajouter(calculerDateEcheance(dateCompromis, delai), m[0], m.index, m[0].length, true,
          { delai, pointDepart: 'signature', baseDate: dateCompromis });
      }
      // "au plus tard dans les 60 jours" (ou "dans un délai de 60 jours") : formulation réelle
      // d'une condition suspensive d'obtention de prêt (voir CLAUDE.md — texte anonymisé fourni
      // par l'étude), sans date calendaire NI ancre explicite ("à compter de..." absent ici,
      // contrairement à reDelai ci-dessus). Compté à partir de la signature de la promesse elle-
      // même (« la présente convention… ») faute d'autre point de départ indiqué dans la clause —
      // même convention implicite que les ancres "la présente"/"ce jour" déjà acceptées par
      // reDelai.
      //
      // Bug corrigé : la même promesse porte presque toujours un second délai, avec la même
      // tournure, pour la notification du refus/de l'octroi au notaire (ex. "au plus tard dans les
      // 70 jours, les offres à lui faites ou le refus opposé aux demandes de prêt") — ce n'est PAS
      // la condition elle-même, seulement une formalité de communication qui la suit. Signalé par
      // l'étude : garder les deux (même en signalant une ambiguïté) polluait le champ avec un choix
      // à trancher alors que le bon candidat est déterministe ici — le délai de notification est
      // systématiquement associé à "notifier"/"notification" dans les ~200 caractères qui précèdent
      // (voir la clause réelle ci-dessus), on l'écarte donc totalement plutôt que de le détecter
      // pour ensuite le désambiguïser.
      const reAuPlusTardDelai = new RegExp('au\\s+plus\\s+tard\\s+dans\\s+(?:les?|un\\s+d[ée]lai\\s+de)\\s+' + MOTIF_NOMBRE + '\\s*(jours?|mois)', 'gi');
      while ((m = reAuPlusTardDelai.exec(texte)) !== null) {
        const avant = texte.slice(Math.max(0, m.index - 200), m.index);
        if (/notifier|notification/i.test(avant)) continue;
        const delai = { valeur: valeurNombre(m[1]), unite: uniteDelai(m[2]) };
        ajouter(calculerDateEcheance(dateCompromis, delai), m[0], m.index, m[0].length, true,
          { delai, pointDepart: 'signature', baseDate: dateCompromis });
      }
      // "au plus tard 60 jours après la signature des présentes" : autre formulation réelle de la
      // même condition suspensive de prêt exprimée en délai (fournie par l'étude), avec cette
      // fois un point de départ explicite ("après <ancre>") plutôt qu'implicite comme
      // reAuPlusTardDelai ci-dessus. Mêmes ancres que reDelai, même garde-fou contre la clause
      // de notification (le refus/l'octroi communiqué au notaire porte souvent un second délai,
      // distinct de la condition elle-même — voir reAuPlusTardDelai).
      const reAuPlusTardApres = new RegExp('au\\s+plus\\s+tard\\s+' + MOTIF_NOMBRE + '\\s*(jours?|mois)\\s+apr[èe]s\\s+(?:la\\s+signature|ce\\s+jour|l[\'’]acte|la\\s+pr[ée]sente|le\\s+pr[ée]sent\\s+(?:compromis|acte)|la\\s+promesse)', 'gi');
      while ((m = reAuPlusTardApres.exec(texte)) !== null) {
        const avant = texte.slice(Math.max(0, m.index - 200), m.index);
        if (/notifier|notification/i.test(avant)) continue;
        const delai = { valeur: valeurNombre(m[1]), unite: uniteDelai(m[2]) };
        ajouter(calculerDateEcheance(dateCompromis, delai), m[0], m.index, m[0].length, true,
          { delai, pointDepart: 'signature', baseDate: dateCompromis });
      }
    }

    resultats.sort((a, b) => a.iso.localeCompare(b.iso));
    return resultats;
  }

  function majAffichageCompromis() {
    const info = document.getElementById('compromis-info');
    const texte = document.getElementById('compromis-info-text');
    info.style.display = 'flex';
    if (dateCompromisDetectee && !dateCompromisEstimee) {
      info.classList.remove('warn');
      texte.textContent = `Date de signature détectée : ${formatDateFr(dateCompromisDetectee)}`;
      document.getElementById('f-date-compromis').style.display = 'none';
    } else if (dateCompromisDetectee && dateCompromisEstimee) {
      info.classList.add('warn');
      texte.textContent = `Date de signature estimée : ${formatDateFr(dateCompromisDetectee)} — à vérifier.`;
      document.getElementById('f-date-compromis').style.display = 'none';
    } else {
      info.classList.add('warn');
      texte.textContent = "Date de signature non trouvée — indiquez-la :";
      document.getElementById('f-date-compromis').style.display = 'inline-block';
    }
  }

  function toggleCompromisEdit() {
    const input = document.getElementById('f-date-compromis');
    input.style.display = input.style.display === 'none' ? 'inline-block' : 'none';
    if (input.style.display === 'inline-block') input.value = dateCompromisDetectee || '';
  }

  function corrigerDateCompromis(valeur) {
    if (!valeur) return; // un champ vidé en cours de frappe ne doit rien réinitialiser
    if (dateIncompleteEnCoursDeSaisie(valeur)) return; // année encore en cours de frappe (an 0002…)
    dateCompromisDetectee = valeur;
    dateCompromisEstimee = false;
    // Met à jour uniquement le texte d'information, sans jamais recacher le champ : il se
    // recache via majAffichageCompromis() au prochain import de PDF, pas pendant une saisie
    // manuelle — sinon le champ disparaissait sous les doigts dès que la date devenait valide,
    // avant même que le collaborateur ait fini de la corriger.
    const info = document.getElementById('compromis-info');
    const texte = document.getElementById('compromis-info-text');
    info.classList.remove('warn');
    texte.textContent = `Date de signature détectée : ${formatDateFr(dateCompromisDetectee)}`;
    if (dernierTexteTraite) {
      detectedDates = detecterDatesDepuisTexte(dernierTexteTraite, dateCompromisDetectee);
      renderChips();
      // La date de signature est l'ancre de tous les délais : la corriger recalcule les échéances
      // calculées ET le panneau de révision, sinon celui-ci resterait sur l'ancienne ancre.
      recalculerExtractionRegex();
    }
  }

  function toggleEcheance(type, actif) {
    echeanceActive[type] = actif;
    const bloc = document.getElementById('bloc-' + type);
    const input = document.getElementById('f-' + type);
    bloc.classList.toggle('inactive', !actif);
    input.disabled = !actif;
    if (!actif) input.value = '';
    if (type === 'pret') majVisibiliteRappels();
  }

  // Demandé par l'étude : sans condition d'obtention de prêt (achat comptant), la section rappels
  // ne concerne plus ce dossier — retirée de l'étape Finaliser plutôt que laissée visible mais
  // sans effet. `getSelectedReminderDays()` n'est de toute façon plus lue dans ce cas (voir
  // ajouterDossier), ce masquage évite seulement de laisser des cases à cocher trompeuses.
  function majVisibiliteRappels() {
    const fieldset = document.getElementById('rappel-fieldset');
    if (fieldset) fieldset.style.display = echeanceActive.pret ? '' : 'none';
  }

  function definirEcheanceActive(type, actif) {
    const checkbox = document.getElementById('toggle-' + type);
    if (checkbox) checkbox.checked = actif;
    toggleEcheance(type, actif);
  }

  // Point d'entrée unique : le texte extrait du PDF passe par toutes les détections automatiques.
  function traiterTexte(texte) {
    dernierTexteTraite = texte;

    // Repart d'une base propre à chaque import : évite qu'un chiffre resté d'un essai précédent
    // ne fausse une saisie manuelle ultérieure (ex. « je tape une date et seul le 2 reste »).
    document.getElementById('f-pret').value = '';
    document.getElementById('f-acte').value = '';
    document.getElementById('f-ventebien').value = '';
    document.getElementById('f-date-compromis').value = '';

    dateCompromisEstimee = false;
    dateCompromisDetectee = detecterDateCompromis(texte) || '';
    majAffichageCompromis();

    detectedDates = detecterDatesDepuisTexte(texte, dateCompromisDetectee);
    renderChips();

    // Remplit directement les champs Prêt / Acte / Vente quand l'outil a une classification
    // fiable, au lieu de laisser la date en attente dans l'encart : sinon, l'échéance est bien
    // repérée mais reste invisible tant qu'on n'a pas cliqué sur son bouton de catégorie.
    ['pret', 'acte', 'ventebien'].forEach(type => {
      const { candidat, ambigu } = meilleureCandidateEcheance(detectedDates, type);
      if (candidat) {
        document.getElementById('f-' + type).value = candidat.iso;
        definirEcheanceActive(type, true);
        pageParType[type] = candidat.page;
        ambiguiteParType[type] = ambigu;
        approxParType[type] = !!candidat.approx;
      }
    });

    const cashNote = document.getElementById('cash-note');
    if (detecterFinancementComptant(texte)) {
      definirEcheanceActive('pret', false);
      cashNote.style.display = 'block';
      cashNote.textContent = "Achat sans prêt détecté : l'échéance « Obtention du prêt » a été désactivée.";
    } else {
      cashNote.style.display = 'none';
    }

    // Ces quatre champs (nom, email, adresse, prix) passent par appliquerValeurChamp() et NON par
    // une écriture directe : cette fonction note dans `valeursAppliquees` ce que NOUS avons posé.
    // Sans cette trace, la couche d'extraction structurée qui tourne juste après
    // (recalculerExtractionRegex → appliquerExtractionAuFormulaire) prenait la valeur trouvée ici
    // pour une saisie de l'utilisateur et refusait d'y toucher : le panneau « Ce que l'outil a
    // compris » (étape 2) affichait l'adresse structurée, propre, pendant que l'étape 4 gardait le
    // fragment brut du vieux détecteur — exactement le décalage signalé par l'étude.
    appliquerValeurChamp('f-nom', detecterNomDossier(texte));

    // Uniquement utile s'il y a une condition d'obtention de prêt à relancer (voir le champ
    // lui-même, "pour relance prêt") — inutile de préremplir sans ça.
    if (echeanceActive.pret) appliquerValeurChamp('f-email-acquereur', detecterEmailAcquereur(texte));

    // Ne bascule que dans un sens (maison → copropriété) : l'absence de ces marqueurs ne prouve
    // pas l'inverse (une vente de maison individuelle ne les mentionne simplement jamais), donc on
    // ne force jamais "maison" par défaut ici, on ne fait que corriger vers "copropriété" quand
    // c'en est manifestement une.
    if (detecterTypeVenteCopropriete(texte)) {
      document.getElementById('f-type-vente').value = 'copropriete';
    }
    majApercuPieces();

    // Même remarque que pour le nom/l'email ci-dessus : c'est ici le fragment BRUT du vieux
    // détecteur, que la passe structurée doit pouvoir remplacer par l'adresse reconstruite.
    appliquerValeurChamp('f-adresse-bien', detecterAdresseBien(texte));
    const prixDetecte = detecterPrixVente(texte);
    if (prixDetecte) appliquerValeurChamp('f-prix-vente', String(prixDetecte));

    // Les documents sont déduits des seules clauses d'engagement du vendeur, et non de l'ensemble
    // du compromis : c'est ainsi qu'un notaire lit l'acte, et cela évite les faux positifs.
    const engagements = extraireEngagementsVendeur(texte);
    analyseJuridiqueActuelle = {
      documents: detecterDocumentsAFournir(engagements),
      engagements,
      conditions: extraireConditions(texte)
    };
    afficherAnalyseJuridique();

    // Couche d'extraction structurée : construite à partir de ce que les regex viennent de trouver,
    // elle complète les champs restés vides (rôle de l'étude notamment) et alimente le panneau de
    // révision. N'écrase jamais une saisie de l'utilisateur (voir appliquerValeurChamp).
    recalculerExtractionRegex();

    return detectedDates.length;
  }

  // ==== EXTRACTION STRUCTURÉE : application au formulaire et panneau de révision ====

  // Dernier résultat d'extraction (regex, puis complété par l'IA) et trace de ce que NOUS avons
  // écrit dans chaque champ : un champ dont la valeur ne correspond plus à ce qu'on y avait mis a
  // été modifié par l'utilisateur, et ne doit plus jamais être écrasé (y compris par une réponse
  // IA qui arrive plusieurs dizaines de secondes après l'import).
  let extractionActuelle = null;
  let valeursAppliquees = {};

  function appliquerValeurChamp(id, valeur) {
    const champ = document.getElementById(id);
    if (!champ || valeur === null || valeur === undefined || valeur === '') return false;
    const actuel = (champ.value || '').trim();
    const deriereValeur = valeursAppliquees[id] === undefined ? '' : String(valeursAppliquees[id]);
    if (actuel !== '' && actuel !== deriereValeur) return false; // saisie de l'utilisateur : intouchable
    champ.value = String(valeur);
    valeursAppliquees[id] = String(valeur);
    return true;
  }

  function appliquerExtractionAuFormulaire(extraction) {
    if (!extraction) return;
    const champs = extraction.champs || {};
    if (champs.nom) appliquerValeurChamp('f-nom', champs.nom.valeur);
    if (champs.prixVente) appliquerValeurChamp('f-prix-vente', champs.prixVente.valeur);
    if (champs.emailAcquereur) appliquerValeurChamp('f-email-acquereur', champs.emailAcquereur.valeur);
    const adresse = extraction.bien && extraction.bien.adresse;
    if (adresse && adresse.adresseComplete) appliquerValeurChamp('f-adresse-bien', adresse.adresseComplete);

    // Dates butoir : traiterTexte() remplit déjà les champs à partir des chips, mais l'objet
    // d'extraction connaît aussi les échéances qui n'ont PAS donné de chip — typiquement une date
    // calculée depuis un délai que detecterDatesDepuisTexte n'a pas su convertir (voir
    // construireDatesMetier). Sans ce report, la date s'affichait dans « Ce que l'outil a compris »
    // mais restait absente du formulaire, donc du dossier enregistré. appliquerValeurChamp()
    // n'écrit jamais par-dessus une valeur déjà posée : aucun risque d'écraser le chemin existant.
    const dates = extraction.dates || {};
    for (const typeDate of Object.keys(CHAMP_PAR_TYPE_DATE)) {
      const champ = CHAMP_PAR_TYPE_DATE[typeDate];
      const objet = dates[typeDate];
      if (!objet || !objet.valeur) continue;
      const input = document.getElementById('f-' + champ);
      if (!input || input.value) continue;
      appliquerValeurChamp('f-' + champ, objet.valeur);
      definirEcheanceActive(champ, true);
      if (objet.methode === 'CALCULATED') approxParType[champ] = true;
    }

    // Rôle de l'étude : pré-rempli UNIQUEMENT sur une déduction confirmée (mention explicite dans
    // l'acte, ou règle métier satisfaite sans contradiction). La raison est affichée dans le
    // panneau, et le sélecteur reste modifiable — mais on ne bascule jamais un dossier en
    // « participant » sur une simple supposition : ce rôle masque la checklist des pièces.
    const notaires = extraction.notaires || {};
    if (notaires.statut === 'CONFIRMED' && notaires.roleEtude && notaires.origine !== 'ia') {
      const select = document.getElementById('f-role-notaire');
      if (select && (!valeursAppliquees['f-role-notaire'] || select.value === valeursAppliquees['f-role-notaire'])) {
        select.value = notaires.roleEtude;
        valeursAppliquees['f-role-notaire'] = notaires.roleEtude;
        majApercuPieces();
      }
    }
  }

  // ==== PANNEAU « CE QUE L'OUTIL A COMPRIS » ====
  //
  // L'outil ne prétend plus « confirmer » quoi que ce soit : il dit D'OÙ VIENT chaque donnée, et
  // c'est l'étude qui coche « vérifié ». L'ancien libellé « Confirmé » était accordé du seul fait
  // qu'une regex avait renvoyé une valeur (voir champExtraction) — il promettait un contrôle qui
  // n'avait jamais eu lieu, et les propositions du modèle local, qui hallucine régulièrement des
  // termes, tombaient dans le même mot. Le vert est désormais réservé à ce qu'un humain a relu.

  var ORIGINES_REVISION = {
    manuel: { texte: 'Saisie à la main', dl: 'dl-success' },
    verifie: { texte: 'Vérifié', dl: 'dl-success' },
    absent: { texte: 'Non trouvée', dl: 'dl-neutre' },
    appris: { texte: 'Appris d’une correction précédente', dl: 'dl-neutre', icone: 'sparkle' },
    calcule: { texte: 'Calculée depuis un délai', dl: 'dl-pret' },
    arbitre: { texte: 'Plusieurs valeurs possibles', dl: 'dl-alerte' },
    concordant: { texte: 'Lue dans l’acte, même lecture par l’IA', dl: 'dl-neutre' },
    lu: { texte: 'Lue dans l’acte', dl: 'dl-neutre' }
  };

  // Pure et testable : ne dépend que de l'objet champ. L'ordre des cas EST la règle métier — le
  // vert ne s'obtient que par une relecture humaine, jamais par la seule présence d'une valeur.
  function origineRevision(champ) {
    if (!champ) return ORIGINES_REVISION.absent;
    if (champ.origine === 'manuel') return ORIGINES_REVISION.manuel;
    if (champ.verifie) return ORIGINES_REVISION.verifie;
    const vide = champ.valeur === null || champ.valeur === undefined || champ.valeur === '';
    if (vide) return ORIGINES_REVISION.absent;
    if (champ.statut === 'NEEDS_REVIEW') return ORIGINES_REVISION.arbitre;
    if (champ.apprise) return ORIGINES_REVISION.appris;
    if (champ.methode === 'CALCULATED') return ORIGINES_REVISION.calcule;
    if (champ.origine === 'regex+ia') return ORIGINES_REVISION.concordant;
    return ORIGINES_REVISION.lu;
  }

  // Les données affichées dans le panneau, dans l'ordre de lecture, avec le champ du formulaire
  // qu'elles pilotent. Corriger une ligne écrit dans les deux : une seule source de vérité, pas de
  // double saisie — et surtout plus besoin de quitter l'écran où l'erreur se voit pour la corriger.
  var CHAMPS_REVISION = [
    { cle: 'typeActe', libelle: 'Type d’acte', type: 'select', champId: null },
    { cle: 'nom', libelle: 'Nom du dossier', type: 'texte', champId: 'f-nom' },
    { cle: 'signature', libelle: 'Signature de l’avant-contrat', type: 'date', champId: null },
    { cle: 'pret', libelle: 'Obtention du prêt', type: 'date', champId: 'f-pret' },
    { cle: 'acte', libelle: 'Réitération de l’acte', type: 'date', champId: 'f-acte' },
    { cle: 'ventebien', libelle: 'Vente préalable', type: 'date', champId: 'f-ventebien' },
    { cle: 'adresseBien', libelle: 'Adresse du bien', type: 'texte', champId: 'f-adresse-bien' },
    { cle: 'prixVente', libelle: 'Prix de vente', type: 'nombre', champId: 'f-prix-vente' },
    { cle: 'emailAcquereur', libelle: 'Email de l’acquéreur', type: 'texte', champId: 'f-email-acquereur' },
    { cle: 'roleNotaire', libelle: 'Rôle de l’étude', type: 'select', champId: 'f-role-notaire' }
  ];

  var OPTIONS_REVISION = {
    typeActe: [
      { valeur: 'COMPROMIS_DE_VENTE', libelle: 'Compromis de vente' },
      { valeur: 'PROMESSE_DE_VENTE', libelle: 'Promesse de vente' },
      { valeur: 'PROMESSE_D_ACHAT', libelle: 'Promesse d’achat' },
      { valeur: 'INCONNU', libelle: 'Non déterminé' }
    ],
    roleNotaire: [
      { valeur: 'instrumentaire', libelle: 'Notaire instrumentaire' },
      { valeur: 'participant', libelle: 'Notaire participant' }
    ]
  };

  // Corrections et relectures survivent à un recalcul : corriger la date de signature reconstruit
  // tout l'objet d'extraction (voir recalculerExtractionRegex), et sans ces deux tables le travail
  // de relecture déjà fait serait effacé à chaque fois.
  let correctionsRevision = {};
  let verificationsRevision = {};

  function champRevision(extraction, cle) {
    if (!extraction) return null;
    const dates = extraction.dates || {};
    const champs = extraction.champs || {};
    if (cle === 'typeActe') return extraction.typeActe || null;
    if (cle === 'nom') return champs.nom || null;
    if (cle === 'prixVente') return champs.prixVente || null;
    if (cle === 'emailAcquereur') return champs.emailAcquereur || null;
    if (cle === 'signature') return dates.SIGNATURE_AVANT_CONTRAT || null;
    if (cle === 'pret') return dates.BUTOIR_PRET || null;
    if (cle === 'acte') return dates.REITERATION_ACTE || null;
    if (cle === 'ventebien') return dates.BUTOIR_VENTE_PREALABLE || null;
    if (cle === 'adresseBien') {
      const bien = extraction.bien || {};
      const a = bien.adresse || null;
      if (!a) return null;
      // Vue normalisée : l'adresse porte sa valeur sous « adresseComplete », tout le panneau lit
      // « valeur ». Les écritures passent par ecrireChampRevision, jamais par cette copie.
      return {
        valeur: a.adresseComplete || null, statut: a.statut || 'NOT_FOUND', methode: null,
        origine: a.origine || 'regex', source: bien.source || a.source || null,
        candidats: [], raison: a.departement ? `Département ${a.departement}, déduit du code postal.` : '',
        verifie: !!a.verifie, propositionIa: bien.propositionIa || null
      };
    }
    if (cle === 'roleNotaire') {
      const n = extraction.notaires || {};
      return {
        valeur: n.roleEtude || null, statut: n.statut || 'NOT_FOUND', methode: null,
        origine: n.origine || 'regex', source: n.instrumentaire ? n.instrumentaire.source : null,
        candidats: [], raison: n.raison || '', verifie: !!n.verifie, propositionIa: null
      };
    }
    return null;
  }

  function ecrireChampRevision(extraction, cle, valeur) {
    if (!extraction) return;
    const v = (valeur === '' || valeur === undefined) ? null : valeur;
    const marquer = (objet) => {
      if (!objet) return;
      objet.valeur = v;
      objet.statut = v ? 'CONFIRMED' : 'NOT_FOUND';
      objet.origine = 'manuel';
      objet.raison = 'Corrigée à la main.';
      objet.candidats = [];
      objet.propositionIa = null;
      objet.verifie = true;
      objet.apprise = false;
    };
    extraction.champs = extraction.champs || {};
    extraction.dates = extraction.dates || {};
    if (cle === 'typeActe') { extraction.typeActe = extraction.typeActe || champExtraction(null); marquer(extraction.typeActe); }
    else if (cle === 'nom') { extraction.champs.nom = extraction.champs.nom || champExtraction(null); marquer(extraction.champs.nom); }
    else if (cle === 'prixVente') { extraction.champs.prixVente = extraction.champs.prixVente || champExtraction(null); marquer(extraction.champs.prixVente); }
    else if (cle === 'emailAcquereur') { extraction.champs.emailAcquereur = extraction.champs.emailAcquereur || champExtraction(null); marquer(extraction.champs.emailAcquereur); }
    else if (cle === 'signature') { extraction.dates.SIGNATURE_AVANT_CONTRAT = extraction.dates.SIGNATURE_AVANT_CONTRAT || champExtraction(null); marquer(extraction.dates.SIGNATURE_AVANT_CONTRAT); }
    else if (cle === 'pret') { extraction.dates.BUTOIR_PRET = extraction.dates.BUTOIR_PRET || champExtraction(null); marquer(extraction.dates.BUTOIR_PRET); }
    else if (cle === 'acte') { extraction.dates.REITERATION_ACTE = extraction.dates.REITERATION_ACTE || champExtraction(null); marquer(extraction.dates.REITERATION_ACTE); }
    else if (cle === 'ventebien') { extraction.dates.BUTOIR_VENTE_PREALABLE = extraction.dates.BUTOIR_VENTE_PREALABLE || champExtraction(null); marquer(extraction.dates.BUTOIR_VENTE_PREALABLE); }
    else if (cle === 'adresseBien') {
      extraction.bien = extraction.bien || {};
      extraction.bien.adresse = extraction.bien.adresse || {};
      const a = extraction.bien.adresse;
      a.adresseComplete = v; a.statut = v ? 'CONFIRMED' : 'NOT_FOUND'; a.origine = 'manuel'; a.verifie = true;
      extraction.bien.propositionIa = null;
    } else if (cle === 'roleNotaire') {
      extraction.notaires = extraction.notaires || {};
      extraction.notaires.roleEtude = v;
      extraction.notaires.statut = v ? 'CONFIRMED' : 'NOT_FOUND';
      extraction.notaires.origine = 'manuel';
      extraction.notaires.verifie = true;
      extraction.notaires.raison = 'Choisi à la main.';
    }
  }

  // Rejoue sur un objet d'extraction fraîchement reconstruit les corrections et les relectures déjà
  // faites. Sans ça, corriger la date de signature (qui relance tout le calcul) effacerait le
  // travail de vérification en cours.
  function appliquerCorrectionsRevision(extraction) {
    if (!extraction) return extraction;
    for (const cle of Object.keys(correctionsRevision)) ecrireChampRevision(extraction, cle, correctionsRevision[cle]);
    for (const cle of Object.keys(verificationsRevision)) {
      if (!verificationsRevision[cle]) continue;
      const objet = champRevision(extraction, cle);
      if (!objet) continue;
      if (cle === 'adresseBien' && extraction.bien && extraction.bien.adresse) extraction.bien.adresse.verifie = true;
      else if (cle === 'roleNotaire' && extraction.notaires) extraction.notaires.verifie = true;
      else objet.verifie = true;
    }
    extraction.alertes = controlerCoherence(extraction);
    return extraction;
  }

  // Une date dont l'année n'est pas encore entièrement saisie. Un <input type="date"> émet
  // `change` dès que ses trois cases forment une date valide : en tapant l'année, « 2 » donne
  // l'an 0002, la valeur est donc considérée comme complète et le panneau se redessinait au
  // premier chiffre, faisant perdre le focus (signalé deux fois par l'étude). On ignore ces
  // valeurs intermédiaires : l'année réelle a toujours quatre chiffres et est la dernière case
  // saisie, la validation tombe donc naturellement à la fin de la frappe.
  function dateIncompleteEnCoursDeSaisie(valeur) {
    const m = /^(\d{4})-\d{2}-\d{2}$/.exec(String(valeur || ''));
    return !!m && parseInt(m[1], 10) < 1900;
  }

  function modifierDonneeRevision(cle, valeur) {
    if (!extractionActuelle) return;
    if (dateIncompleteEnCoursDeSaisie(valeur)) return;
    const propre = typeof valeur === 'string' ? valeur.trim() : valeur;
    correctionsRevision[cle] = propre;
    verificationsRevision[cle] = true; // corriger une donnée, c'est l'avoir relue
    ecrireChampRevision(extractionActuelle, cle, propre);
    synchroniserChampFormulaire(cle, propre);
    memoriserCorrectionRevision(cle, propre);
    // La date de signature est l'ancre de tous les délais : la corriger relance tout le calcul
    // (et donc le rendu du panneau), inutile de le refaire ici.
    if (cle === 'signature' && propre) { corrigerDateCompromis(propre); return; }
    extractionActuelle.alertes = controlerCoherence(extractionActuelle);
    renderPanneauRevision(extractionActuelle);
  }

  function synchroniserChampFormulaire(cle, valeur) {
    const definition = CHAMPS_REVISION.find(c => c.cle === cle);
    if (!definition || !definition.champId) return;
    const champ = document.getElementById(definition.champId);
    if (!champ) return;
    champ.value = valeur === null || valeur === undefined ? '' : String(valeur);
    valeursAppliquees[definition.champId] = champ.value;
    if (definition.champId === 'f-role-notaire') majApercuPieces();
  }

  // Une correction faite dans le panneau alimente la mémoire des corrections, au même titre qu'un
  // clic sur un chip : c'est exactement le même geste (l'outil s'est trompé, l'étude tranche), et
  // c'est ce qui fait ressortir le badge « Appris » au prochain compromis de même trame.
  function memoriserCorrectionRevision(cle, valeur) {
    if (!valeur) return;
    const champDate = { pret: 'pret', acte: 'acte', ventebien: 'ventebien' }[cle];
    if (!champDate) return;
    const objet = champRevision(extractionActuelle, cle);
    const contexte = objet && objet.source && objet.source.extrait ? objet.source.extrait : '';
    if (contexte) memoriserCorrection(contexte, champDate, null, 'date');
  }

  function basculerVerificationRevision(cle, coche) {
    if (!extractionActuelle) return;
    verificationsRevision[cle] = !!coche;
    if (cle === 'adresseBien' && extractionActuelle.bien && extractionActuelle.bien.adresse) {
      extractionActuelle.bien.adresse.verifie = !!coche;
    } else if (cle === 'roleNotaire' && extractionActuelle.notaires) {
      extractionActuelle.notaires.verifie = !!coche;
    } else {
      const objet = champRevision(extractionActuelle, cle);
      if (objet) objet.verifie = !!coche;
    }
    renderPanneauRevision(extractionActuelle);
  }

  // Adopte la valeur proposée par le modèle local. Explicite et réversible : rien de ce que le
  // modèle propose n'atteint un champ sans ce clic.
  function accepterPropositionIa(cle) {
    const objet = champRevision(extractionActuelle, cle);
    if (!objet || !objet.propositionIa) return;
    modifierDonneeRevision(cle, objet.propositionIa.valeur);
  }

  function boutonPageRevision(source) {
    if (!source || !source.page) return '';
    // Cliquable seulement tant que le PDF est chargé en mémoire (import en cours) — même principe
    // que pour les engagements du vendeur.
    return pdfActuel
      ? `<button type="button" class="voir-pdf-btn" onclick="allerALaPageDuPdf(${source.page})" title="Aller à la page ${source.page} du document">${icone('eye')} p.${source.page}</button>`
      : `<span class="chip-page">p.${source.page}</span>`;
  }

  function champSaisieRevision(definition, champ) {
    const brut = champ && champ.valeur !== null && champ.valeur !== undefined ? String(champ.valeur) : '';
    const cle = definition.cle;
    if (definition.type === 'select') {
      const options = (OPTIONS_REVISION[cle] || []).map(o =>
        `<option value="${escapeAttr(o.valeur)}"${o.valeur === brut ? ' selected' : ''}>${escapeHtml(o.libelle)}</option>`
      ).join('');
      return `<select class="revision-saisie" onchange="modifierDonneeRevision('${cle}', this.value)">
        <option value=""${brut ? '' : ' selected'}>—</option>${options}</select>`;
    }
    const type = definition.type === 'date' ? 'date' : (definition.type === 'nombre' ? 'number' : 'text');
    // onchange (et non oninput) : le panneau se redessine à chaque modification, une saisie
    // caractère par caractère perdrait le focus au premier appui sur une touche.
    return `<input type="${type}" class="revision-saisie" value="${escapeAttr(brut)}"
      placeholder="Non renseigné" onchange="modifierDonneeRevision('${cle}', this.value)">`;
  }

  function renderLigneRevision(definition, champ) {
    const cle = definition.cle;
    const origine = origineRevision(champ);
    const marque = origine.icone ? icone(origine.icone) : '<span class="dot"></span>';
    const page = boutonPageRevision(champ && champ.source);
    const verifie = !!(champ && champ.verifie);
    const methode = champ && champ.methode === 'CALCULATED' && champ.calcul
      ? `<div class="revision-raison">${champ.valeur ? 'Calculée' : 'Délai trouvé'} : ${escapeHtml(String(champ.calcul.delai ? champ.calcul.delai.valeur + ' ' + champ.calcul.delai.unite : ''))} ${escapeHtml(libellePointDepart(champ.calcul.pointDepart))}.</div>` : '';
    const raison = champ && champ.raison ? `<div class="revision-raison">${escapeHtml(champ.raison)}</div>` : '';
    const autres = champ && (champ.candidats || []).length > 1
      ? `<div class="revision-raison">Autres valeurs trouvées dans l’acte : ${champ.candidats.map(c => escapeHtml(String(c.valeur))).join(', ')}</div>`
      : '';
    const extrait = champ && champ.source && champ.source.extrait
      ? `<div class="revision-extrait">« ${escapeHtml(String(champ.source.extrait).slice(0, 240))} »</div>` : '';
    // Proposition du modèle local : affichée, jamais appliquée d'elle-même.
    const proposition = champ && champ.propositionIa
      ? `<div class="revision-proposition">
          <span class="dot-label dl-alerte"><span class="dot"></span>Proposé par l’IA</span>
          <span class="revision-proposition-valeur">${escapeHtml(String(LIBELLES_TYPE_ACTE[champ.propositionIa.valeur] || champ.propositionIa.valeur))}</span>
          <button type="button" class="action-rapide" onclick="accepterPropositionIa('${cle}')">Utiliser</button>
          ${champ.propositionIa.extraitTrouve ? '' : '<span class="revision-raison">Le modèle cite une phrase qui ne figure pas dans le document : à traiter avec prudence.</span>'}
        </div>` : '';
    // Relance ciblée à l'IA locale (voir redemanderChampIa) : proposée tant que la donnée n'a pas
    // été relue, sur les seuls champs qui correspondent à une vraie lecture du texte (voir
    // CLES_CIBLE_IA) — inutile de la proposer sur une valeur déjà saisie à la main ou déjà cochée.
    const vide = !champ || champ.valeur === null || champ.valeur === undefined || champ.valeur === '';
    const cibleEligible = CLES_CIBLE_IA.has(cle) && dernierTexteTraite && !verifie
      && (vide || (champ && champ.statut === 'NEEDS_REVIEW'));
    const boutonCible = cibleEligible
      ? `<button type="button" class="action-rapide" id="revision-cible-${cle}" onclick="redemanderChampIa('${cle}')" title="Redemander cette seule donnée au modèle local, avec une fenêtre de texte plus large">${icone('rotate-ccw')} Redemander à l’IA</button>`
      : '';
    return `<div class="revision-ligne${verifie ? ' revision-verifiee' : ''}">
      <div class="revision-tete">
        <span class="revision-libelle">${escapeHtml(definition.libelle)}</span>
        <span class="dot-label ${origine.dl}">${marque}${escapeHtml(origine.texte)}</span>
        ${page}
        <label class="revision-coche" title="Cocher une fois la donnée contrôlée dans le document">
          <input type="checkbox"${verifie ? ' checked' : ''} onchange="basculerVerificationRevision('${cle}', this.checked)"> vérifié
        </label>
      </div>
      ${champSaisieRevision(definition, champ)}
      ${methode}${raison}${autres}${proposition}${extrait}${boutonCible}
    </div>`;
  }

  function renderPanneauRevision(extraction) {
    const panneau = document.getElementById('panneau-revision');
    const rappel = document.getElementById('alertes-finalisation');
    if (!panneau) return;
    if (!extraction) {
      panneau.style.display = 'none';
      panneau.innerHTML = '';
      if (rappel) { rappel.style.display = 'none'; rappel.innerHTML = ''; }
      return;
    }

    let renseignees = 0;
    let verifiees = 0;
    const lignes = CHAMPS_REVISION.map(definition => {
      const champ = champRevision(extraction, definition.cle);
      if (champ && champ.valeur !== null && champ.valeur !== undefined && champ.valeur !== '') renseignees++;
      if (champ && champ.verifie) verifiees++;
      return renderLigneRevision(definition, champ);
    }).join('');

    const parties = (extraction.parties || []).map(p =>
      `<li>${escapeHtml(p.nom)} — <strong>${p.role === 'VENDEUR' ? 'vendeur' : 'acquéreur'}</strong> (désigné « ${escapeHtml(p.qualiteActe)} » dans l’acte${p.qualitePersonne === 'morale' ? ', personne morale' : ''})${p.representant ? `, représenté par ${escapeHtml(p.representant)}` : ''}${p.origine === 'ia' ? ' — <em>proposé par l’IA</em>' : ''}</li>`
    ).join('');

    const notaires = extraction.notaires || {};
    const ligneNotaires = notaires.instrumentaire
      ? `<div class="revision-raison">Notaire qui reçoit l’acte : ${escapeHtml(notaires.instrumentaire.nom)}${notaires.instrumentaire.office ? ` (${escapeHtml(notaires.instrumentaire.office)})` : ''}.</div>`
      : '';

    const alertes = (extraction.alertes || []).map(a =>
      `<div class="revision-alerte ${a.gravite === 'critique' ? 'critique' : ''}">${icone('alert-triangle')}<span>${escapeHtml(a.message)}</span></div>`
    ).join('');

    panneau.innerHTML = `
      <div class="revision-entete">
        <div class="section-eyebrow">Ce que l’outil a compris</div>
        <span class="revision-compteur">${verifiees} / ${renseignees} donnée${renseignees > 1 ? 's' : ''} vérifiée${renseignees > 1 ? 's' : ''}</span>
      </div>
      <p class="hint">L’outil indique seulement d’où vient chaque donnée : il ne garantit rien. Corrigez directement ci-dessous — la valeur part aussi dans le formulaire — puis cochez « vérifié » quand vous l’avez contrôlée dans le document.</p>
      ${alertes}
      ${parties ? `<div class="revision-parties"><ul>${parties}</ul></div>` : ''}
      ${ligneNotaires}
      <div class="revision-grille">${lignes}</div>
    `;
    panneau.style.display = 'block';

    // Les alertes sont rappelées à l'étape "Finaliser", au moment d'enregistrer.
    if (rappel) {
      rappel.innerHTML = alertes;
      rappel.style.display = alertes ? 'block' : 'none';
    }
  }

  // Point d'entrée UNIQUE du recalcul : appelé après un import, après une correction de la date de
  // signature, et après un repli OCR/métadonnées — les trois endroits qui refont
  // detecterDatesDepuisTexte. En oublier un laisserait le panneau désynchronisé du formulaire.
  function recalculerExtractionRegex() {
    if (!dernierTexteTraite) { renderPanneauRevision(null); return; }
    extractionActuelle = construireExtractionRegex(dernierTexteTraite, dateCompromisDetectee, detectedDates);
    appliquerCorrectionsRevision(extractionActuelle);
    appliquerExtractionAuFormulaire(extractionActuelle);
    renderPanneauRevision(extractionActuelle);
  }

  function creerChip(item) {
    const btnClass = (type) => 'mini-btn' + (type ? ' suggested ' + type : '');
    const chip = document.createElement('div');
    const couleur = item.suggestion ? ' chip-' + item.suggestion : '';
    chip.className = 'chip' + couleur + (item.active ? '' : ' inactive');
    const boutonVoir = (pdfActuel && item.page)
      ? `<button type="button" class="voir-pdf-btn" onclick="voirDateDansPdf(${item.page}, '${item.label.replace(/'/g, "\\'")}')">${icone('eye')} p.${item.page}</button>`
      : '';
    const badgeApprise = item.apprise
      ? `<span class="dot-label dl-neutre" title="Classé d'après une correction déjà faite sur une clause très proche — à vérifier comme toute suggestion automatique">${icone('sparkle')}Appris</span>`
      : '';
    // Date calculée (fin de mois arrondie, délai relatif) plutôt que lue telle quelle dans le
    // texte — voir ajouter() dans detecterDatesDepuisTexte. Visible dès l'étape "Vérifier", avant
    // même l'enregistrement (où le même statut réapparaît via LIBELLES_CONFIANCE.estime, même
    // libellé "Estimée" — un seul vocabulaire pour la même réalité, import et dossier enregistré).
    const badgeApprox = item.approx
      ? `<span class="dot-label dl-pret" title="Date calculée à partir d'une formulation approximative (fin de mois, délai relatif...) — à vérifier précisément"><span class="dot"></span>Estimée</span>`
      : '';
    chip.innerHTML = `
      <div class="chip-top">
        <label class="switch small">
          <input type="checkbox" ${item.active ? 'checked' : ''} onchange="toggleChipActive('${item.iso}', this.checked)">
          <span class="slider"></span>
        </label>
        <span class="date-text">${escapeHtml(item.label)}</span>
        ${badgeApprise}
        ${badgeApprox}
        ${boutonVoir}
      </div>
      <span class="ctx">${escapeHtml(item.contexte)}</span>
      <span class="assign-btns">
        <button type="button" class="${btnClass(item.suggestion === 'pret' ? 'pret' : null)}" onclick="assignerDate('${item.iso}','pret')">Prêt</button>
        <button type="button" class="${btnClass(item.suggestion === 'acte' ? 'acte' : null)}" onclick="assignerDate('${item.iso}','acte')">Acte</button>
        <button type="button" class="${btnClass(item.suggestion === 'ventebien' ? 'ventebien' : null)}" onclick="assignerDate('${item.iso}','ventebien')">Vente</button>
        <button type="button" class="${btnClass(item.suggestion === 'autre' ? 'autre' : null)}" onclick="ajouterAutre('${item.iso}')">Autre</button>
      </span>`;
    return chip;
  }

  function renderChips() {
    const box = document.getElementById('chips');
    box.innerHTML = '';
    if (detectedDates.length === 0) {
      box.innerHTML = '<span style="font-size:13px;color:var(--muted);">Aucune date reconnue pour l\u2019instant.</span>';
      return;
    }

    const identifiees = detectedDates.filter(d => d.suggestion);
    const nonIdentifiees = detectedDates.filter(d => !d.suggestion);

    if (identifiees.length > 0) {
      const titre = document.createElement('div');
      titre.className = 'chips-groupe-titre';
      titre.textContent = `Classées — Prêt / Acte / Vente / Autre (${identifiees.length})`;
      box.appendChild(titre);
      const groupe = document.createElement('div');
      groupe.className = 'chips-groupe';
      identifiees.forEach(item => groupe.appendChild(creerChip(item)));
      box.appendChild(groupe);
    }

    if (nonIdentifiees.length > 0) {
      const titre = document.createElement('div');
      titre.className = 'chips-groupe-titre';
      titre.textContent = `Non identifiées, désactivées par défaut (${nonIdentifiees.length})`;
      box.appendChild(titre);
      const groupe = document.createElement('div');
      groupe.className = 'chips-groupe';
      nonIdentifiees.forEach(item => groupe.appendChild(creerChip(item)));
      box.appendChild(groupe);
    }
  }

  function toggleChipActive(iso, actif) {
    const item = detectedDates.find(d => d.iso === iso);
    if (item) item.active = actif;
    renderChips();
  }

  function assignerDate(iso, type) {
    document.getElementById('f-' + type).value = iso;
    definirEcheanceActive(type, true);
    // Si l'outil s'était trompé (ou n'avait rien deviné), le clic vaut correction : le chip
    // change de catégorie et de couleur en conséquence, au lieu de garder l'ancienne suggestion.
    const item = detectedDates.find(d => d.iso === iso);
    if (item) {
      // Mémorisé seulement si le clic change réellement quelque chose : inutile de retenir un
      // clic qui ne fait que confirmer ce que l'outil avait déjà bien deviné.
      if (item.suggestion !== type) memoriserCorrection(item.contexte, type, null);
      item.suggestion = type;
      item.active = true;
      // Un clic explicite sur un chip lève l'ambiguïté : l'utilisateur vient de trancher lui-même.
      // Le caractère approximatif de la date, lui, reste (voir ajouter() dans detecterDatesDepuisTexte) :
      // choisir la catégorie ne rend pas une date calculée plus précise.
      if (type === 'pret' || type === 'acte' || type === 'ventebien') {
        pageParType[type] = item.page;
        ambiguiteParType[type] = false;
        approxParType[type] = !!item.approx;
      }
      renderChips();
    }
  }

  // Dernier recours si le texte et l'OCR échouent tous les deux : la date d'enregistrement du
  // fichier PDF (souvent mise à jour au moment de la signature électronique) donne une estimation
  // raisonnable — comme le ferait quelqu'un consultant les propriétés du fichier faute de mieux.
  async function dateDepuisMetadonnees(pdf) {
    try {
      const meta = await pdf.getMetadata();
      const brut = (meta.info && (meta.info.ModDate || meta.info.CreationDate)) || '';
      const m = brut.match(/D:(\d{4})(\d{2})(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    } catch (e) {
      console.error('Erreur lecture métadonnées PDF', e);
    }
    return null;
  }

  // Lit une page du PDF comme une image et tente d'y reconnaître du texte (OCR), pour les
  // signatures manuscrites ou intégrées en image que l'extraction de texte ne peut pas voir.
  // Le worker (voir creerWorkerOcr) est créé une seule fois par import de PDF et réutilisé pour
  // toutes les pages à analyser, plutôt que d'être recréé à chaque page — le recréer à chaque
  // appel rechargeait inutilement le modèle de langue à chaque page (API Tesseract.js v1).
  async function ocrPage(pdf, numeroPage, worker) {
    const DELAI_MAX_OCR = 30000; // 30 s : au-delà, on abandonne plutôt que de bloquer l'interface
    try {
      const page = await pdf.getPage(numeroPage);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (!worker) return '';

      // La reconnaissance d'image peut ne jamais rendre la main (bibliothèque indisponible ou
      // bloquée) : sans garde-fou, l'attente est infinie et l'indicateur de progression tourne
      // sans fin. On borne donc l'opération dans le temps.
      const resultat = await Promise.race([
        worker.recognize(canvas),
        new Promise(resolve => setTimeout(() => resolve(null), DELAI_MAX_OCR))
      ]);
      return (resultat && resultat.data && resultat.data.text) ? resultat.data.text : '';
    } catch (e) {
      console.error('Erreur OCR', e);
      return '';
    }
  }

  // Crée le worker Tesseract une seule fois par import de PDF (voir traiterFichierPdf) : le modèle
  // de langue française n'est ainsi téléchargé/initialisé qu'une fois, même si plusieurs pages
  // doivent être passées à l'OCR pour retrouver la date de signature. Le tout premier chargement
  // du modèle peut être lent (téléchargement) : on lui laisse plus de temps qu'à une page unique.
  const DELAI_MAX_INIT_OCR = 45000;
  async function creerWorkerOcr() {
    if (!window.Tesseract) return null;
    try {
      return await Promise.race([
        Tesseract.createWorker('fra'),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error('délai d’initialisation OCR dépassé')), DELAI_MAX_INIT_OCR))
      ]);
    } catch (e) {
      console.error('Initialisation OCR impossible', e);
      return null;
    }
  }

  // Un simple renvoi « Annexe n°1 » au fil d'une clause (ex. LD Notaires : « Un extrait de plan
  // cadastral est annexé. Annexe n°1 », en milieu de page, au milieu du corps de l'acte) ne marque
  // PAS le début des pages d'annexes elles-mêmes : beaucoup de trames listent ainsi, dans le corps
  // même de l'acte, les pièces qui accompagnent la vente — sans que ces pièces soient jointes au
  // même PDF (cas réel signalé : le corps allait jusqu'à la signature page 52, mais l'extraction
  // s'arrêtait dès la page 6 à cause d'un renvoi de ce type page 7 — la numérotation des annexes
  // remet même à 1 plusieurs fois dans le document, une par thème). Une page qui commence
  // réellement une pièce jointe (scan de plan, diagnostic…) porte cette mention en tout début de
  // page et contient très peu d'autre texte extractible — à l'inverse d'une clause de plusieurs
  // milliers de caractères qui la cite juste en passant.
  //
  // Décision explicite de l'étude : les dates butoir (prêt/acte/vente) ne doivent JAMAIS être
  // puisées dans les annexes, uniquement dans l'avant-contrat lui-même (compromis/promesse) — le
  // motif ci-dessus (limité à "annexe n°1", chiffre obligatoire) ratait deux cas réels fréquents :
  // une page "ANNEXES" sans numéro qui introduit la liste des pièces jointes, et une pièce jointe
  // qui n'a même pas de renvoi "annexe" et ne se reconnaît qu'à son propre titre de document
  // (diagnostic, plan cadastral...). Les deux gardent le même garde-fou position/longueur.
  const RE_DEBUT_ANNEXE = /\bannexes?\b(?:\s*n[°ºo]?\s*\d+)?|\bpi[èe]ces?\s+annexe(?:s|[ée]s)?\b/i;
  const RE_TITRE_PIECE_JOINTE = /^\s*(?:dossier\s+de\s+diagnostic\s+technique|diagnostic\s+de\s+performance\s+[ée]nerg[ée]tique|[ée]tat\s+des\s+risques(?:\s+et\s+pollutions)?|constat\s+de\s+risque\s+d.exposition\s+au\s+plomb|[ée]tat\s+relatif\s+[àa]\s+la\s+pr[ée]sence\s+de\s+termites|certificat\s+d.urbanisme|r[èe]glement\s+de\s+copropri[ée]t[ée]|extrait\s+(?:du\s+)?plan\s+cadastral|proc[èe]s-verbal\s+d.assembl[ée]e\s+g[ée]n[ée]rale|[ée]tat\s+dat[ée])/i;
  // Retire le numéro de page isolé que presque toutes les trames posent en tête (« 5 », « - 12 - ») :
  // sans ça il décale tout le reste et fausse la mesure de position ci-dessous.
  function texteSansNumeroDePage(texteBrut) {
    return String(texteBrut || '').replace(/^[\s ]*[-–—]?[\s ]*\d{1,3}[\s ]*[-–—]?[\s ]*/, '');
  }

  // Le marqueur doit OUVRIR la page, pas y être cité. L'ancienne tolérance de 120 caractères était
  // trop large : sur une vraie promesse reçue par notaire, la page 5 commence par un titre court
  // suivi d'une phrase (« Plans des lots / Une copie des plans … est annexée. ANNEXE ») — le mot
  // ANNEXE, simple renvoi de fin de clause propre à cette trame, tombait dans les 120 premiers
  // caractères et coupait tout le document dès la page 4. Conséquence en cascade : ni le prix
  // (page 9) ni la condition de prêt (page 12) n'étaient plus lisibles.
  var MAX_DEBUT_PAGE_ANNEXE = 12;

  // Une page qui parle encore LA LANGUE DE L'ACTE (« aux présentes », « le VENDEUR », « le
  // PROMETTANT », « le présent acte ») est encore l'acte, jamais la première page d'une pièce
  // jointe : un document annexé — un DPE, un état des risques — ne s'adresse pas aux parties dans
  // les termes du compromis. Sans cette règle, un simple TITRE DE CLAUSE en haut de page
  // (« Diagnostic de performance énergétique », « État des risques de pollution des sols ») coupait
  // l'acte en plein milieu : trois actes du corpus perdaient ainsi leur bloc de signature, donc la
  // date qui sert d'ancre à toutes les échéances exprimées en délai — et avec elle les trois dates
  // butoir du dossier. Le titre d'une VRAIE pièce jointe, lui, reste reconnu (voir les tests).
  var RE_LANGAGE_DE_L_ACTE = /aux\s+pr[ée]sentes|les\s+pr[ée]sentes|pr[ée]sent\s+(?:acte|compromis|avant-contrat)|pr[ée]sente\s+(?:promesse|vente|convention)|\ble\s+VENDEUR\b|\bl['’]ACQU[ÉE]REUR\b|\ble\s+PROMETTANT\b|\ble\s+B[ÉE]N[ÉE]FICIAIRE\b/i;

  function estDebutPageAnnexe(texteBrut) {
    const texte = texteSansNumeroDePage(texteBrut);
    const m = texte.match(RE_DEBUT_ANNEXE) || texte.match(RE_TITRE_PIECE_JOINTE);
    if (!m) return false;
    if (RE_LANGAGE_DE_L_ACTE.test(texte)) return false;
    return m.index < MAX_DEBUT_PAGE_ANNEXE || texte.trim().length < 300;
  }

  // Bug corrigé, signalé deux fois par l'étude : ces deux motifs (annexe/titre de pièce jointe) ne
  // couvrent pas toutes les trames réelles — sans "Page X sur Y" (voir dernierePageNumerotee dans
  // extraireTextesUtiles) NI titre d'annexe reconnu, aucune coupure ne se déclenchait et le PDF
  // entier (annexes comprises, parfois des centaines de pages) était utilisé pour la détection de
  // dates. La signature de l'acte est un repère bien plus universel qu'un titre de document : quel
  // que soit le modèle, un compromis/promesse se termine TOUJOURS par un bloc de signatures avant
  // toute pièce jointe — jamais l'inverse. Repris et élargi à partir du motif déjà utilisé par
  // ailleurs (voir plus bas, repli OCR de la date de signature) pour rester cohérent.
  const RE_SIGNATURE_ACTE = /sign[ée]\s+[ée]lectroniquement|date\s+et\s+signatures?|dont\s+acte|en\s+foi\s+de\s+quoi|lu\s+et\s+approuv[ée]|bon\s+pour\s+accord|fait\s+et\s+sign[ée]|signature\s+des\s+parties|paraph[ée]\s+et\s+sign[ée]/i;
  function detecteSignatureActe(texteBrut) {
    return RE_SIGNATURE_ACTE.test(texteBrut);
  }

  // Combine les trois repères de fin d'acte trouvés en parcourant le PDF (voir
  // extraireTextesUtiles) — chacun peut manquer selon le modèle de document, mais dès qu'un seul
  // est trouvé, il vaut mieux couper trop tôt (au pire, revérifier une date à la main) que trop
  // tard (une date d'annexe glissée dans les échéances butoir, décision explicite de l'étude). Le
  // plus tôt des repères disponibles l'emporte donc systématiquement.
  function calculerDernierePageUtile(pageAnnexe, pageSignature, dernierePageNumerotee, totalPages) {
    const TAMPON_SIGNATURE = 2; // pages de certificat/signature complémentaires après le repère
    const TAMPON_NUMEROTEE = 3; // même tampon que l'ancien comportement, inchangé
    const candidats = [];
    if (pageAnnexe != null) candidats.push(Math.max(1, pageAnnexe - 1));
    if (pageSignature != null) candidats.push(Math.min(pageSignature + TAMPON_SIGNATURE, totalPages));
    if (dernierePageNumerotee != null) candidats.push(Math.min(dernierePageNumerotee + TAMPON_NUMEROTEE, totalPages));
    return candidats.length ? Math.min(...candidats) : totalPages;
  }

  // Isole le compromis lui-même (+ sa page de signatures) et s'arrête dès la première vraie page
  // d'annexe (voir estDebutPageAnnexe ci-dessus) : un dossier signé électroniquement peut compter
  // plusieurs centaines de pages de diagnostics et autres pièces jointes qui ne nous intéressent
  // ni pour la détection, ni pour l'aperçu.
  // En dessous de ce seuil, une page ne porte pas de texte extractible : c'est une IMAGE. Un
  // compromis scanné n'en porte aucun sur toutes ses pages ; un compromis électronique peut n'en
  // avoir qu'une ou deux (une page signée à la main, insérée en image).
  var MIN_CARACTERES_PAGE_TEXTE = 40;
  // Plafond de pages passées à l'OCR pour un même import. Quelques secondes par page : sans
  // plafond, un dossier scanné de plusieurs centaines de pages bloquerait l'import très longtemps.
  // La coupure au bloc de signature (voir detecteSignatureActe) intervient presque toujours avant.
  var MAX_PAGES_OCR_IMPORT = 60;

  // `options.surPage(numero, total, mode)` permet à l'appelant d'afficher où en est la lecture —
  // indispensable pour un compromis scanné, où l'OCR prend quelques secondes PAR PAGE et où un
  // import sans le moindre signe de vie passerait pour un blocage.
  async function extraireTextesUtiles(pdf, options) {
    const surPage = (options && options.surPage) || function () {};
    const textesParPage = [];
    let dernierePageNumerotee = null;
    let pageAnnexe = null;
    let pageSignature = null;
    let workerOcr = null;
    let ocrIndisponible = false;
    let pagesOcr = 0;
    let ocrPlafonne = false;
    const PLAFOND_SECURITE = 60;
    const TAMPON_SIGNATURE = 2; // doit rester cohérent avec calculerDernierePageUtile
    const totalAffiche = Math.min(pdf.numPages, PLAFOND_SECURITE);

    try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let texteBrut = content.items.map(it => it.str).join(' ');

      // Page sans texte extractible : on la lit en OCR. La boucle s'arrête d'elle-même au bloc de
      // signature des parties (voir plus bas), donc un compromis scanné est passé à l'OCR « jusqu'à
      // la signature », sans jamais entamer les annexes qui suivent — c'est exactement ce que
      // l'étude demande, et l'OCR ne servait jusqu'ici qu'à retrouver la date de signature sur
      // trois pages, ce qui laissait un compromis scanné entièrement illisible.
      if (texteBrut.trim().length < MIN_CARACTERES_PAGE_TEXTE && !ocrIndisponible) {
        if (pagesOcr >= MAX_PAGES_OCR_IMPORT) {
          ocrPlafonne = true;
        } else {
          if (!workerOcr) {
            surPage(i, totalAffiche, 'init');
            workerOcr = await creerWorkerOcr();
            if (!workerOcr) ocrIndisponible = true;
          }
          if (workerOcr) {
            surPage(i, totalAffiche, 'ocr');
            const texteOcr = await ocrPage(pdf, i, workerOcr);
            if (texteOcr && texteOcr.trim()) {
              texteBrut = texteOcr;
              pagesOcr++;
            }
          }
        }
      } else {
        surPage(i, totalAffiche, 'texte');
      }

      textesParPage.push(texteBrut);

      if (!dernierePageNumerotee) {
        const mPage = texteBrut.match(/page\s+(\d+)\s+sur\s+(\d+)/i);
        if (mPage && mPage[1] === mPage[2]) dernierePageNumerotee = i;
      }

      // Dès qu'une vraie page d'annexe commence, inutile de lire plus loin (diagnostics, plans…
      // potentiellement des centaines de pages) : c'est déjà le repère le plus tôt possible.
      if (estDebutPageAnnexe(texteBrut)) {
        pageAnnexe = i;
        break;
      }

      if (pageSignature === null && detecteSignatureActe(texteBrut)) pageSignature = i;

      // Une fois la signature de l'acte repérée, quelques pages de plus (certificat, dernière
      // signature électronique...) peuvent encore lui appartenir — au-delà, plus la peine de
      // continuer à lire un PDF qui peut compter des centaines de pages d'annexes après coup.
      if (pageSignature !== null && i >= pageSignature + TAMPON_SIGNATURE) break;

      if (i >= PLAFOND_SECURITE * 2) break; // filet de sécurité pour un document sans repère trouvé
    }
    } finally {
      // Le worker est créé une seule fois pour tout le document et libéré ici, quoi qu'il arrive :
      // le modèle de langue française n'est donc chargé qu'une fois, même sur soixante pages.
      if (workerOcr) await workerOcr.terminate();
    }

    const dernierePageUtile = calculerDernierePageUtile(pageAnnexe, pageSignature, dernierePageNumerotee, textesParPage.length);
    return { textesParPage, dernierePageUtile, pagesOcr, ocrPlafonne, ocrIndisponible };
  }

  // ---- visualiseur PDF (aperçu du compromis à côté du formulaire, en défilement continu) ----

  // Calcule, pour chaque page, l'index de fin (exclusif) de son texte dans le texte concaténé —
  // permet ensuite de retrouver sur quelle page se trouve une date détectée.
  function calculerFrontieresPages(textesParPage, dernierePageUtile) {
    const frontieres = [];
    let cumul = 0;
    for (let i = 0; i < dernierePageUtile; i++) {
      cumul += textesParPage[i].length + 1; // +1 pour le séparateur '\n'
      frontieres.push(cumul);
    }
    return frontieres;
  }

  function pageDepuisIndex(index) {
    if (!frontieresPagesActuelles) return null;
    for (let i = 0; i < frontieresPagesActuelles.length; i++) {
      if (index < frontieresPagesActuelles[i]) return i + 1;
    }
    return frontieresPagesActuelles.length || null;
  }

  // Affiche toutes les pages utiles du compromis les unes sous les autres (défilement continu).
  async function chargerToutesLesPagesPdf() {
    if (!pdfActuel) return;
    const conteneur = document.getElementById('pdf-pages-container');
    conteneur.innerHTML = '';
    masquerBoutonAjoutEngagement();
    masquerFormAjoutEngagementManuel();
    reinitialiserRecherchePdf();
    const largeurDispo = (conteneur.clientWidth || 360) - 20;

    for (let numero = 1; numero <= pdfDernierePageUtile; numero++) {
      const page = await pdfActuel.getPage(numero);
      const viewportBase = page.getViewport({ scale: 1 });
      const echelle = largeurDispo / viewportBase.width;
      const viewport = page.getViewport({ scale: echelle });

      const bloc = document.createElement('div');
      bloc.className = 'pdf-page-bloc';
      bloc.id = 'pdf-page-bloc-' + numero;

      const canvas = document.createElement('canvas');
      canvas.id = 'pdf-page-' + numero;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const legende = document.createElement('div');
      legende.className = 'pdf-page-numero';
      legende.textContent = `Page ${numero} / ${pdfDernierePageUtile}`;

      bloc.appendChild(canvas);
      bloc.appendChild(legende);
      conteneur.appendChild(bloc);

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const content = await page.getTextContent();
      construireCoucheTexte(content, viewport, bloc, canvas);
    }
  }

  // Couche de texte invisible mais sélectionnable posée par-dessus le canvas d'une page rendue —
  // permet à l'utilisateur de sélectionner une clause à la souris (comme dans un vrai lecteur PDF)
  // pour l'ajouter manuellement comme engagement du vendeur quand la détection automatique n'a rien
  // trouvé pour elle (voir gererSelectionPdf()/ajouterEngagementManuel() ci-dessous). Repose sur la
  // même transformation de position que voirDateDansPdf()/voirEngagementDansPdf() (déjà utilisée
  // pour positionner un surlignage ponctuel), appliquée ici à CHAQUE item de la page plutôt qu'à un
  // seul passage recherché après coup — une version simplifiée du TextLayerBuilder de pdf.js,
  // réécrite ici plutôt que d'en charger le module dédié (non inclus dans le seul pdf.min.js déjà
  // chargé). L'alignement horizontal (largeur réelle du glyphe vs largeur du <span>) n'a pas besoin
  // d'être pixel-parfait : seule la SÉLECTION doit correspondre au bon texte, le texte lui-même
  // reste transparent (voir .pdf-text-layer dans style.css) et n'est jamais affiché tel quel.
  function construireCoucheTexte(content, viewport, bloc, canvas) {
    const couche = document.createElement('div');
    couche.className = 'pdf-text-layer';
    couche.style.width = canvas.width + 'px';
    couche.style.height = canvas.height + 'px';
    bloc.appendChild(couche);

    content.items.forEach(item => {
      if (!item.str) return;
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const angleRad = Math.atan2(tx[1], tx[0]);
      const hauteur = Math.hypot(tx[2], tx[3]) || 1;
      const largeurCible = (item.width || 0) * (viewport.scale || 1);

      const span = document.createElement('span');
      span.textContent = item.str;
      span.style.left = tx[4] + 'px';
      span.style.top = (tx[5] - hauteur) + 'px';
      span.style.fontSize = hauteur + 'px';
      couche.appendChild(span);

      // Ajuste après coup la largeur rendue (police de repli du navigateur, pas celle du PDF) sur
      // la largeur réelle du glyphe dans le document — sans quoi la fin d'une sélection dériverait
      // de plus en plus loin de ce qui est visuellement affiché au fil d'une ligne.
      const largeurRendue = span.getBoundingClientRect().width;
      const transforme = angleRad ? `rotate(${angleRad}rad)` : '';
      if (largeurCible > 0 && largeurRendue > 0) {
        span.style.transform = `${transforme} scaleX(${largeurCible / largeurRendue})`.trim();
      } else if (transforme) {
        span.style.transform = transforme;
      }
    });
  }

  // Sélection de texte dans l'aperçu du compromis (voir construireCoucheTexte() ci-dessus) : dès
  // qu'une sélection non vide se trouve dans #pdf-pages-container, une petite barre flottante
  // propose de l'ajouter comme engagement du vendeur, catégorisé comme n'importe quel engagement
  // détecté automatiquement (entretien/travaux/document) — utile quand une clause réelle échappe
  // aux motifs de detecterEngagementsVendeur/EXCLUSION_ENGAGEMENT_RE, plutôt que de la ressaisir à
  // la main ailleurs sans aucune trace dans l'analyse juridique.
  let selectionEngagementEnCours = null;

  function gererSelectionPdf() {
    const toolbar = document.getElementById('pdf-selection-toolbar');
    if (!toolbar) return;
    const selection = window.getSelection();
    const texte = selection && !selection.isCollapsed ? selection.toString().trim() : '';
    const conteneur = document.getElementById('pdf-pages-container');
    const ancre = selection && selection.anchorNode;
    const ancreDansPdf = ancre && conteneur && conteneur.contains(ancre);

    if (!texte || !ancreDansPdf) {
      toolbar.style.display = 'none';
      selectionEngagementEnCours = null;
      return;
    }

    const noeudElement = ancre.nodeType === 1 ? ancre : ancre.parentElement;
    const blocPage = noeudElement ? noeudElement.closest('.pdf-page-bloc') : null;
    const page = blocPage ? parseInt(blocPage.id.replace('pdf-page-bloc-', ''), 10) || null : null;

    selectionEngagementEnCours = { phrase: texte.replace(/\s+/g, ' ').trim(), page };

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    toolbar.style.display = 'flex';
    toolbar.style.left = (rect.left + rect.width / 2) + 'px';
    toolbar.style.top = (rect.top - 8) + 'px';
  }

  function ajouterEngagementManuel(type) {
    if (!selectionEngagementEnCours) return;
    analyseJuridiqueActuelle.engagements.push({
      phrase: selectionEngagementEnCours.phrase,
      type,
      page: selectionEngagementEnCours.page,
      manuel: true
    });
    // Une clause sélectionnée à la main est, par définition, une clause que la détection
    // automatique (extraireEngagementsVendeur) a manquée ou n'a pas su catégoriser — on la mémorise
    // pour qu'une clause très proche soit reconnue directement au prochain import (voir
    // trouverCorrectionApprise/memoriserCorrection, catégorie 'engagement' : même mécanisme que
    // l'apprentissage déjà en place pour les dates, un espace de classification séparé).
    memoriserCorrection(selectionEngagementEnCours.phrase, type, null, 'engagement');
    afficherAnalyseJuridique();
    masquerBoutonAjoutEngagement();
    afficherToast('Engagement ajouté à l’analyse juridique.', 'OK', null);
  }

  // Pendant du bouton flottant ci-dessus, mais sans dépendre d'une sélection de texte dans le PDF :
  // demandé par l'étude pour saisir un engagement qui n'apparaît pas littéralement dans l'acte
  // (accord oral rapporté, engagement verbal du vendeur...) ou simplement quand aucun PDF n'est
  // chargé pour l'instant. Toujours accessible depuis l'étape "Analyse juridique" du wizard, jamais
  // masqué par l'état vide (voir index.html) — un dossier sans aucune détection automatique doit
  // pouvoir malgré tout recevoir un engagement saisi à la main.
  function afficherFormAjoutEngagementManuel() {
    const btn = document.getElementById('ajout-engagement-manuel-btn');
    const form = document.getElementById('ajout-engagement-manuel-form');
    if (btn) btn.style.display = 'none';
    if (form) form.style.display = 'flex';
    const texte = document.getElementById('nouvel-engagement-texte');
    if (texte) texte.focus();
  }

  function masquerFormAjoutEngagementManuel() {
    const btn = document.getElementById('ajout-engagement-manuel-btn');
    const form = document.getElementById('ajout-engagement-manuel-form');
    if (btn) btn.style.display = '';
    if (form) form.style.display = 'none';
    const texte = document.getElementById('nouvel-engagement-texte');
    if (texte) texte.value = '';
  }

  function ajouterEngagementDepuisFormulaire() {
    const texteEl = document.getElementById('nouvel-engagement-texte');
    const typeEl = document.getElementById('nouvel-engagement-type');
    const texte = texteEl ? texteEl.value.trim() : '';
    if (!texte) { if (texteEl) texteEl.focus(); return; }
    const type = typeEl ? typeEl.value : 'document';
    analyseJuridiqueActuelle.engagements.push({
      phrase: texte,
      type,
      page: null,
      manuel: true
    });
    // Même principe que ajouterEngagementManuel() ci-dessus (voir son commentaire) : une clause
    // saisie ici échappe forcément à la détection automatique (elle n'a pas de PDF anchré à
    // relire), la mémoriser reste sans risque pour tout futur import dont une clause proche
    // passerait, elle, par le motif d'ancrage d'extraireEngagementsVendeur().
    memoriserCorrection(texte, type, null, 'engagement');
    masquerFormAjoutEngagementManuel();
    afficherAnalyseJuridique();
    afficherToast('Engagement ajouté à l’analyse juridique.', 'OK', null);
  }

  function masquerBoutonAjoutEngagement() {
    const toolbar = document.getElementById('pdf-selection-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    selectionEngagementEnCours = null;
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
  }

  // Nom conservé malgré la généralisation (voir renderEngagement) : retire désormais N'IMPORTE
  // QUEL engagement pendant l'import, pas seulement ceux ajoutés à la main — sans confirmation
  // (état pré-enregistrement, reversible en réimportant le PDF).
  function supprimerEngagementManuel(index) {
    if (!analyseJuridiqueActuelle.engagements[index]) return;
    analyseJuridiqueActuelle.engagements.splice(index, 1);
    afficherAnalyseJuridique();
  }

  // Pendant l'import (voir renderDocBadge) : retire un document identifié de l'analyse en cours,
  // sans confirmation, même logique que supprimerEngagementManuel() ci-dessus.
  function supprimerDocumentManuel(index) {
    if (!analyseJuridiqueActuelle.documents[index]) return;
    analyseJuridiqueActuelle.documents.splice(index, 1);
    afficherAnalyseJuridique();
  }

  // Fait simplement défiler l'aperçu jusqu'à la page indiquée, sans tenter de surligner un passage
  // précis — utilisé pour les engagements du vendeur (renderEngagement), dont la phrase détectée
  // fait plusieurs dizaines/centaines de caractères de texte libre : contrairement à une date
  // (voir voirDateDansPdf ci-dessous, qui cherche le dernier "mot" du texte fourni, en général
  // l'année, un ancrage fiable), il n'y a pas de mot de fin fiable à chercher dans un extrait de
  // clause tronqué à 80 caractères — le tenter produisait une recherche qui échouait presque
  // toujours silencieusement, et risquait même de mal échapper la phrase dans l'attribut onclick.
  function allerALaPageDuPdf(numeroPage) {
    if (!pdfActuel || !numeroPage) return;
    const bloc = document.getElementById('pdf-page-bloc-' + numeroPage);
    if (!bloc) return;
    bloc.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Fait défiler l'aperçu jusqu'à la page indiquée et surligne brièvement le texte de la date
  // (ex. "5 novembre 2026") pour la retrouver immédiatement dans le document original.
  async function voirDateDansPdf(numeroPage, texteDate) {
    if (!pdfActuel || !numeroPage) return;
    const bloc = document.getElementById('pdf-page-bloc-' + numeroPage);
    const canvas = document.getElementById('pdf-page-' + numeroPage);
    if (!bloc || !canvas) return;
    bloc.scrollIntoView({ behavior: 'smooth', block: 'center' });

    try {
      const page = await pdfActuel.getPage(numeroPage);
      const content = await page.getTextContent();
      const echelle = canvas.width / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale: echelle });

      // Le dernier mot de la date (souvent l'année) est en général assez unique sur la page.
      const tokens = String(texteDate).trim().split(/\s+/).filter(Boolean);
      const cible = tokens[tokens.length - 1];
      const item = content.items.find(it => it.str && it.str.includes(cible));
      if (!item) return;

      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const hauteur = Math.hypot(tx[2], tx[3]) || 14;
      const largeur = (item.width || 0) * echelle;
      const x = tx[4];
      const yBase = tx[5];

      document.querySelectorAll('.pdf-highlight').forEach(h => h.remove());
      const surlignage = document.createElement('div');
      surlignage.className = 'pdf-highlight';
      surlignage.style.left = Math.max(0, x - 4) + 'px';
      surlignage.style.top = Math.max(0, yBase - hauteur - 2) + 'px';
      surlignage.style.width = (largeur + 8) + 'px';
      surlignage.style.height = (hauteur + 6) + 'px';
      bloc.appendChild(surlignage);
      setTimeout(() => surlignage.classList.add('fondu'), 3000);
      setTimeout(() => surlignage.remove(), 3700);
    } catch (e) {
      console.error('Surlignage impossible', e);
    }
  }

  // Encode/décode un texte libre (guillemets, apostrophes, accents...) pour le faire transiter
  // sans risque à travers un attribut onclick="...('...')" — un essai précédent interpolait la
  // phrase directement en échappant ses apostrophes à la main (voir CLAUDE.md, "renderEngagement()
  // cherchait à surligner..." ) : tronquer APRÈS avoir échappé pouvait couper un \' en deux et
  // produire un attribut malformé. Le texte transite ici en base64, jamais interpolé tel quel :
  // aucun caractère de la phrase ne peut casser l'attribut ou l'appel JS, quel qu'il soit.
  function codifierPourAttribut(texte) {
    return btoa(unescape(encodeURIComponent(texte)));
  }
  function decoderAttribut(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  // Surligne un ENGAGEMENT (obligation ou document à fournir par le vendeur) dans l'aperçu PDF,
  // sur le même principe que voirDateDansPdf() mais adapté à une phrase complète plutôt qu'un seul
  // mot ancré (l'année d'une date) : la phrase peut être répartie sur plusieurs "items" pdf.js (un
  // par ligne/segment de mise en page), il faut donc retrouver TOUS les items concernés, pas un
  // seul. Demandé par l'étude après une première tentative abandonnée (voir CLAUDE.md) qui
  // cherchait le "dernier mot" de la phrase, une ancre bien trop peu fiable sur du texte libre.
  async function voirEngagementDansPdf(numeroPage, phraseB64) {
    if (!pdfActuel || !numeroPage) return;
    const bloc = document.getElementById('pdf-page-bloc-' + numeroPage);
    const canvas = document.getElementById('pdf-page-' + numeroPage);
    if (!bloc || !canvas) return;
    bloc.scrollIntoView({ behavior: 'smooth', block: 'center' });

    try {
      const phrase = decoderAttribut(phraseB64);
      const page = await pdfActuel.getPage(numeroPage);
      const content = await page.getTextContent();
      const echelle = canvas.width / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale: echelle });

      // Texte concaténé de la page, en mémorisant pour chaque caractère l'item pdf.js d'origine
      // (-1 pour les espaces insérés entre deux items, non rattachés à un item précis) — nécessaire
      // pour retrouver ensuite QUELS items surligner une fois la position du passage repérée.
      let texte = '';
      const origines = [];
      content.items.forEach((item, i) => {
        for (const ch of item.str) { texte += ch; origines.push(i); }
        texte += ' '; origines.push(-1);
      });

      // normaliserAvecIndex (définie au niveau racine, section « localisation d'un extrait »)
      // conserve, pour chaque caractère du résultat, l'index correspondant dans le texte d'origine
      // — la phrase mémorisée a déjà ses espaces multiples réduits à un seul au moment de
      // l'extraction (voir extraireEngagementsVendeur), pas forcément identique à la mise en page
      // réelle de la page ; casse, accents et apostrophes peuvent aussi différer.
      const { texte: texteNorm, index: indexOrigine } = normaliserAvecIndex(texte);
      const cibleNorm = normaliserAvecIndex(phrase).texte;
      // Un préfixe assez long pour être unique sur la page, réduit par paliers si le préfixe
      // complet ne matche pas telle quelle (la phrase peut légèrement différer de la mise en page
      // réelle, ex. un saut de ligne au milieu d'un mot) — jamais toute la phrase, qui peut
      // dépasser la fin de la page ou du texte réellement extrait.
      let longueur = Math.min(60, cibleNorm.length);
      let pos = -1;
      while (longueur >= 15 && pos === -1) {
        pos = texteNorm.indexOf(cibleNorm.slice(0, longueur));
        if (pos === -1) longueur -= 10;
      }
      if (pos === -1) return; // repérage impossible : le défilement vers la page reste fait

      // La borne de fin se cale sur la longueur de la PHRASE ENTIÈRE (cibleNorm.length), pas sur
      // le préfixe réduit ayant servi à l'ancrer (`longueur`) : sans ça, seuls les premiers items
      // couvrant ce préfixe seraient surlignés, coupant une phrase de plusieurs lignes en plein
      // milieu au lieu de la couvrir en entier.
      const debutOrig = indexOrigine[pos];
      const finOrig = indexOrigine[Math.min(pos + cibleNorm.length - 1, indexOrigine.length - 1)];
      const itemsConcernes = new Set();
      for (let i = debutOrig; i <= finOrig; i++) { if (origines[i] >= 0) itemsConcernes.add(origines[i]); }
      if (itemsConcernes.size === 0) return;

      document.querySelectorAll('.pdf-highlight').forEach(h => h.remove());
      itemsConcernes.forEach(i => {
        const item = content.items[i];
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const hauteur = Math.hypot(tx[2], tx[3]) || 14;
        const largeur = (item.width || 0) * echelle;
        const surlignage = document.createElement('div');
        surlignage.className = 'pdf-highlight';
        surlignage.style.left = Math.max(0, tx[4] - 4) + 'px';
        surlignage.style.top = Math.max(0, tx[5] - hauteur - 2) + 'px';
        surlignage.style.width = (largeur + 8) + 'px';
        surlignage.style.height = (hauteur + 6) + 'px';
        bloc.appendChild(surlignage);
      });
      setTimeout(() => document.querySelectorAll('.pdf-highlight').forEach(h => h.classList.add('fondu')), 3000);
      setTimeout(() => document.querySelectorAll('.pdf-highlight').forEach(h => h.remove()), 3700);
    } catch (e) {
      console.error('Surlignage impossible', e);
    }
  }

  // Recherche de texte dans l'aperçu du compromis, sur le modèle d'un vrai lecteur PDF (Ctrl+F).
  // Réutilise directement la couche de texte déjà posée par construireCoucheTexte() pour la
  // sélection manuelle — plutôt que de rappeler pdf.js (getTextContent()) à chaque frappe, ce qui
  // ré-parserait tout le document à chaque caractère tapé : les <span> sont déjà en place, déjà
  // positionnés pixel pour pixel sur le rendu, il suffit de les parcourir et de leur ajouter une
  // classe de surlignage. Insensible aux accents/majuscules (normaliserPourRecherche(), déjà
  // utilisée pour la recherche de dossiers) — "pret" retrouve aussi bien "prêt" que "PRÊT".
  let resultatsRecherchePdf = [];
  let indexResultatRecherchePdf = -1;

  function rechercherDansPdf(valeur) {
    document.querySelectorAll('.pdf-search-marque').forEach(el => {
      el.classList.remove('pdf-search-marque', 'pdf-search-marque-active');
    });
    resultatsRecherchePdf = [];
    indexResultatRecherchePdf = -1;
    const compteurEl = document.getElementById('pdf-recherche-compteur');
    const requeteNorm = normaliserPourRecherche(String(valeur || '').trim());
    if (!requeteNorm) {
      if (compteurEl) compteurEl.textContent = '';
      return;
    }

    document.querySelectorAll('#pdf-pages-container .pdf-page-bloc').forEach(bloc => {
      const couche = bloc.querySelector('.pdf-text-layer');
      if (!couche) return;
      const spans = Array.from(couche.children);
      // Texte normalisé concaténé de la page, un espace entre chaque item (comme
      // voirEngagementDansPdf()) — mémorise pour chaque caractère l'index du <span> d'origine,
      // -1 pour les espaces insérés entre deux items.
      let texte = '';
      const origines = [];
      spans.forEach((span, i) => {
        const norm = normaliserPourRecherche(span.textContent || '');
        for (const ch of norm) { texte += ch; origines.push(i); }
        texte += ' '; origines.push(-1);
      });

      let pos = texte.indexOf(requeteNorm);
      while (pos !== -1) {
        const spansConcernes = new Set();
        for (let i = pos; i < pos + requeteNorm.length && i < origines.length; i++) {
          if (origines[i] >= 0) spansConcernes.add(origines[i]);
        }
        if (spansConcernes.size > 0) {
          resultatsRecherchePdf.push({ spans: Array.from(spansConcernes).map(i => spans[i]) });
        }
        pos = texte.indexOf(requeteNorm, pos + 1);
      }
    });

    resultatsRecherchePdf.forEach(r => r.spans.forEach(s => s.classList.add('pdf-search-marque')));

    if (compteurEl) {
      compteurEl.textContent = resultatsRecherchePdf.length
        ? `1 / ${resultatsRecherchePdf.length}`
        : 'Aucun résultat';
    }
    if (resultatsRecherchePdf.length) allerResultatPdf(0);
  }

  function allerResultatPdf(index) {
    if (!resultatsRecherchePdf.length) return;
    if (index < 0) index = resultatsRecherchePdf.length - 1;
    if (index >= resultatsRecherchePdf.length) index = 0;
    document.querySelectorAll('.pdf-search-marque-active').forEach(el => {
      el.classList.remove('pdf-search-marque-active');
    });
    indexResultatRecherchePdf = index;
    const resultat = resultatsRecherchePdf[index];
    resultat.spans.forEach(s => s.classList.add('pdf-search-marque-active'));
    resultat.spans[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    const compteurEl = document.getElementById('pdf-recherche-compteur');
    if (compteurEl) compteurEl.textContent = `${index + 1} / ${resultatsRecherchePdf.length}`;
  }

  function allerResultatPdfSuivant(direction) {
    if (!resultatsRecherchePdf.length) return;
    allerResultatPdf(indexResultatRecherchePdf + direction);
  }

  // Remet la recherche PDF à zéro (nouveau document chargé, ou formulaire réinitialisé) : sans ça,
  // le champ garderait le texte/les résultats d'une recherche menée sur le PDF PRÉCÉDENT, alors que
  // les <span> qu'elle référence viennent d'être détruits par chargerToutesLesPagesPdf().
  function reinitialiserRecherchePdf() {
    resultatsRecherchePdf = [];
    indexResultatRecherchePdf = -1;
    const input = document.getElementById('pdf-recherche-input');
    if (input) input.value = '';
    const compteurEl = document.getElementById('pdf-recherche-compteur');
    if (compteurEl) compteurEl.textContent = '';
  }

  async function gererUploadPdf(event) {
    const file = event.target.files[0];
    if (file) await traiterFichierPdf(file);
  }

  function gererSurvolDepot(event) {
    event.preventDefault();
    document.getElementById('pdf-dropzone').classList.add('survol');
  }

  function gererQuitteDepot(event) {
    event.preventDefault();
    document.getElementById('pdf-dropzone').classList.remove('survol');
  }

  async function gererDepotPdf(event) {
    event.preventDefault();
    document.getElementById('pdf-dropzone').classList.remove('survol');
    const fichiers = event.dataTransfer && event.dataTransfer.files;
    if (!fichiers || fichiers.length === 0) return;
    const file = fichiers[0];
    const status = document.getElementById('pdf-status');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      status.className = 'pdf-status err';
      status.textContent = `« ${file.name} » n'est pas un fichier PDF.`;
      return;
    }
    // Synchronise le champ de fichier natif, pour rester cohérent si le formulaire est réinitialisé.
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      document.getElementById('f-pdf').files = dt.files;
    } catch (e) { /* DataTransfer non disponible sur certains navigateurs : sans conséquence */ }
    await traiterFichierPdf(file);
  }

  async function traiterFichierPdf(file) {
    const status = document.getElementById('pdf-status');

    if (!window.pdfjsLib) {
      status.className = 'pdf-status err';
      status.textContent = "Lecture PDF indisponible — réessayez dans un instant.";
      return;
    }

    status.className = 'pdf-status loading';
    status.textContent = `Lecture de « ${file.name} » en cours…`;
    majProgression(2);
    afficherStatutEnrichissementIa(false); // efface un éventuel résidu d'un import précédent
    compromisNomFichierImporte = file.name || '';
    // Un nouvel acte : les corrections et les relectures du précédent n'ont plus aucun sens.
    correctionsRevision = {};
    verificationsRevision = {};
    const monImport = ++generationImportActuel;

    try {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({
        data: buffer,
        verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0)
      }).promise;
      const { textesParPage, dernierePageUtile, pagesOcr, ocrPlafonne, ocrIndisponible } =
        await extraireTextesUtiles(pdf, {
          surPage(numero, total, mode) {
            if (mode === 'texte') {
              majProgression(Math.min(95, (numero / total) * 100));
              return;
            }
            // L'OCR ne donne aucune progression exploitable : barre indéterminée, et un message qui
            // dit CE QUI se passe. Sans lui, un compromis scanné de vingt-cinq pages donne une
            // minute et demie d'attente muette, qu'on prend pour un blocage.
            majProgression(null);
            status.className = 'pdf-status loading';
            status.textContent = mode === 'init'
              ? 'Document scanné : préparation de la reconnaissance de texte…'
              : `Document scanné : lecture de l’image, page ${numero} sur ${total} (quelques secondes par page)…`;
          }
        });
      const texteComplet = textesParPage.slice(0, dernierePageUtile).join('\n');
      frontieresPagesActuelles = calculerFrontieresPages(textesParPage, dernierePageUtile);
      pageParType = { pret: null, acte: null, ventebien: null };
      ambiguiteParType = { pret: false, acte: false, ventebien: false };
      approxParType = { pret: false, acte: false, ventebien: false };
      traiterTexte(texteComplet);
      // Lancée EN ARRIÈRE-PLAN (jamais attendue ici) : la détection par regex ci-dessus reste le
      // chemin principal, immédiat et déjà éprouvé — l'IA locale ne fait qu'enrichir ensuite ce
      // qu'elle n'a pas trouvé, silencieusement si Ollama n'est pas disponible. Ne doit jamais
      // retarder la suite de l'import (bascule d'étape, aperçu PDF...).
      lancerExtractionIa(texteComplet, monImport);
      // Bascule automatiquement vers l'étape "Vérifier" : les dates/chips sont déjà là, plus besoin
      // de cliquer soi-même sur "Suivant" après un import qui vient de réussir.
      definirEtapeWizard(2);

      // Ouvre le panneau d'aperçu, à côté du formulaire, limité au compromis (annexes exclues).
      pdfActuel = pdf;
      pdfDernierePageUtile = dernierePageUtile;
      document.getElementById('nouveau-intro').style.display = 'none';
      document.getElementById('pdf-viewer').style.display = 'flex';
      document.getElementById('pdf-viewer-title').textContent =
        `${file.name} — compromis (${dernierePageUtile} page${dernierePageUtile > 1 ? 's' : ''} sur ${pdf.numPages}, annexes non affichées)`;
      await chargerToutesLesPagesPdf();
      // Bug corrigé : traiterTexte() (donc afficherAnalyseJuridique()) tourne plus haut, avant que
      // pdfActuel soit renseigné — chaque bouton "👁 p.X" d'un engagement du vendeur (voir
      // renderEngagement) évaluait alors pdfActuel comme encore null et retombait sur le simple
      // numéro de page non cliquable, sans jamais se remettre à jour ensuite. Un second passage ici,
      // une fois pdfActuel connu, régénère l'analyse déjà calculée avec les bons boutons.
      afficherAnalyseJuridique();

      // Si la date de signature n'a pas été trouvée dans le texte, elle est peut-être manuscrite
      // ou intégrée en image (cas fréquent : bloc de signature électronique Yousign/DocuSign en
      // image, sur la page qui suit immédiatement la mention « Fait à … signé électroniquement »).
      if (!dateCompromisDetectee) {
        const idxSignature = textesParPage.findIndex(detecteSignatureActe);
        let pagesACiber = [];
        if (idxSignature !== -1) {
          const pageDepart = idxSignature + 1; // 1-based pour pdf.js
          pagesACiber = [pageDepart, pageDepart + 1, pageDepart + 2].filter(p => p <= dernierePageUtile);
        } else {
          pagesACiber = [dernierePageUtile];
        }

        const workerOcr = await creerWorkerOcr();
        try {
          for (const numeroPage of pagesACiber) {
            status.className = 'pdf-status loading';
            status.textContent = `Date de signature non trouvée dans le texte — lecture de l'image page ${numeroPage} (15 à 30 s)…`;
            majProgression(null);
            const texteOcr = await ocrPage(pdf, numeroPage, workerOcr);
            const isoOcr = detecterDateCompromis(texteOcr);
            if (isoOcr) {
              dateCompromisDetectee = isoOcr;
              dateCompromisEstimee = false;
              majAffichageCompromis();
              detectedDates = detecterDatesDepuisTexte(dernierTexteTraite, dateCompromisDetectee);
              renderChips();
              recalculerExtractionRegex();
              break;
            }
          }
        } finally {
          if (workerOcr) await workerOcr.terminate();
        }

        // Dernier recours : la date d'enregistrement du fichier (souvent mise à jour au moment de
        // la signature électronique) donne une estimation raisonnable, à vérifier par l'agence.
        if (!dateCompromisDetectee) {
          const isoMeta = await dateDepuisMetadonnees(pdf);
          if (isoMeta) {
            dateCompromisDetectee = isoMeta;
            dateCompromisEstimee = true;
            majAffichageCompromis();
            detectedDates = detecterDatesDepuisTexte(dernierTexteTraite, dateCompromisDetectee);
            renderChips();
            recalculerExtractionRegex();
          }
        }
      }

      majProgression(-1);
      const nbFinal = detectedDates.length;
      let suffixe = '';
      if (pagesOcr) suffixe += ` — ${pagesOcr} page${pagesOcr > 1 ? 's' : ''} lue${pagesOcr > 1 ? 's' : ''} en reconnaissance d’image`;
      if (ocrPlafonne) suffixe += ` (limite de ${MAX_PAGES_OCR_IMPORT} pages atteinte : la suite n’a pas été lue)`;
      if (ocrIndisponible) suffixe += ' — reconnaissance d’image indisponible, le document scanné n’a pas pu être lu';
      if (!dateCompromisDetectee) suffixe += ' — date de signature à renseigner';
      else if (dateCompromisEstimee) suffixe = ' — date de signature à vérifier';
      status.className = 'pdf-status ok';
      status.textContent = `✓ ${dernierePageUtile} page${dernierePageUtile > 1 ? 's' : ''} lue${dernierePageUtile > 1 ? 's' : ''} (annexes ignorées) — ${nbFinal} échéance${nbFinal > 1 ? 's' : ''} détectée${nbFinal > 1 ? 's' : ''}${suffixe}.`;
    } catch (e) {
      console.error(e);
      status.className = 'pdf-status err';
      status.textContent = `Impossible de lire « ${file.name} » (fichier scanné ou protégé).`;
    } finally {
      // Garantit l'arrêt de l'indicateur quel que soit le chemin emprunté (succès, erreur, abandon).
      majProgression(-1);
    }
  }

  // ---- Extraction assistée par IA locale (Ollama), en complément du wizard "Nouveau dossier" ----
  // Voir server/src/routes/extractionIa.js et CLAUDE.md. N'existe que sur `claude/serveur-intranet`
  // (a besoin d'un backend pour parler à Ollama) — appelée en ARRIÈRE-PLAN juste après
  // traiterTexte() (regex, inchangée, toujours le chemin principal et immédiat) pour ne compléter
  // QUE ce qu'elle n'a pas trouvé : jamais une valeur déjà détectée ou déjà saisie à la main n'est
  // écrasée, même principe que detecterAdresseBien()/detecterEmailAcquereur()/detecterMontantPret()
  // ailleurs dans ce fichier. Silencieuse si Ollama n'est pas installé/lancé sur le serveur — le
  // wizard reste utilisable exactement comme avant l'ajout de cette fonctionnalité dans ce cas,
  // jamais une condition bloquante pour créer un dossier.

  // Nettement plus permissif que SEUIL_SIMILARITE_APPRENTISSAGE (0.6, deux formulations quasi
  // identiques de LA MÊME clause) : ici on compare une phrase extraite telle quelle du texte à une
  // description reformulée par le modèle, sans aucune racinisation (tokeniserApprentissage compare
  // des mots entiers) — deux verbes de la même famille ("entretien"/"entretenir") comptent déjà
  // comme deux tokens différents, donc l'overlap réel reste modeste même pour la même clause.
  // Premier jet volontairement prudent : sous-détecter un doublon (une suggestion IA redondante
  // affichée en plus d'un engagement déjà repéré par regex) coûte un simple clic sur sa croix de
  // suppression, alors que sur-détecter risquerait de faire disparaître silencieusement un
  // engagement réellement distinct — à resserrer si l'usage réel montre trop de redites.
  const SEUIL_SIMILARITE_ENGAGEMENT_IA = 0.2;

  function engagementDejaConnu(description, engagementsExistants) {
    const tokensIa = tokeniserApprentissage(normaliserTexteApprentissage(description));
    return engagementsExistants.some(e => {
      const phrase = typeof e === 'string' ? e : e.phrase;
      const tokensExistant = tokeniserApprentissage(normaliserTexteApprentissage(phrase || ''));
      return similariteJaccard(tokensIa, tokensExistant) >= SEUIL_SIMILARITE_ENGAGEMENT_IA;
    });
  }

  // Affiche/masque l'état "Analyse par le modèle IA local en cours…" (étape "Vérifier" du wizard,
  // voir index.html) pendant l'appel à /api/extraction-ia — sans lui, rien n'indiquait qu'une
  // recherche était en cours pendant les quelques secondes à dizaines de secondes que peut prendre
  // Ollama, silencieux jusqu'au toast final. N'a jamais retardé l'import lui-même (voir l'appel
  // sans await plus bas) : seul l'affichage de CET état est synchrone avec la requête.
  function afficherStatutEnrichissementIa(visible) {
    const el = document.getElementById('ia-enrichissement-status');
    if (!el) return;
    if (visible) {
      const iconeEl = document.getElementById('icon-ia-enrichissement');
      if (iconeEl && !iconeEl.innerHTML) iconeEl.innerHTML = icone('spinner', null, true);
      el.style.display = 'flex';
    } else {
      el.style.display = 'none';
    }
  }

  // ==== EXTRACTION STRUCTURÉE : fusion des lots IA ====
  //
  // Trois règles, les mêmes pour toute donnée, quel que soit le lot :
  //   - les regex n'ont RIEN trouvé → on prend la valeur du modèle, avec le statut que lui vaut la
  //     vérification de son extrait (`extraitTrouve`, calculé côté serveur : sa citation figure-t-elle
  //     littéralement dans le PDF ?) — CONFIRMED si oui, NEEDS_REVIEW sinon ;
  //   - les deux trouvent LA MÊME chose → CONFIRMED, origine 'regex+ia' : deux méthodes
  //     indépendantes qui convergent, c'est le meilleur signal disponible ;
  //   - les deux trouvent des choses DIFFÉRENTES → on garde la valeur des regex (déterministes,
  //     testées sur de vrais actes) mais le statut passe NEEDS_REVIEW et la valeur du modèle est
  //     conservée en candidat, visible dans le panneau. Jamais de choix silencieux entre les deux.
  //
  // Le modèle ne calcule jamais une date : il rapporte un délai et son point de départ, le calcul
  // est fait ici par calculerDateEcheance() — déterministe, testé (voir tests/dates-metier.test.js).
  function fusionnerExtractionIa(extraction, lot, resultat, texte, options) {
    if (!extraction || !resultat) return extraction;
    const o = options || {};
    const page = typeof o.page === 'function' ? o.page : () => null;

    // Source (extrait + page) d'un élément renvoyé par le serveur, et statut qu'elle lui vaut.
    const sourceIa = (element) => (element && element.extrait)
      ? { extrait: element.extrait, index: element.extraitIndex === undefined ? null : element.extraitIndex, page: element.extraitTrouve ? page(element.extraitIndex) : null }
      : null;
    const statutIa = (element) => (element && element.extraitTrouve) ? 'CONFIRMED' : 'NEEDS_REVIEW';

    // Le modèle local hallucine régulièrement des termes : sa lecture n'écrit JAMAIS d'elle-même
    // dans une donnée. Elle devient une PROPOSITION, affichée dans le panneau de révision avec un
    // bouton « Utiliser » — décision explicite de l'étude après avoir vu des valeurs inventées
    // s'installer dans le formulaire sous l'étiquette « Confirmé ».
    const proposer = (element, valeurIa) => ({
      valeur: valeurIa,
      source: sourceIa(element),
      extraitTrouve: !!(element && element.extraitTrouve)
    });

    const fusionnerChamp = (champ, valeurIa, element) => {
      const existant = champ || champExtraction(null, { statut: 'NOT_FOUND' });
      if (valeurIa === null || valeurIa === undefined || valeurIa === '') return existant;
      // Une donnée corrigée à la main a déjà été tranchée par l'étude : le modèle ne la rouvre pas.
      if (existant.origine === 'manuel') return existant;
      if (existant.valeur === null || existant.valeur === undefined || existant.valeur === '') {
        return Object.assign({}, existant, {
          propositionIa: proposer(element, valeurIa),
          raison: 'Les règles de détection n’ont rien trouvé ici ; le modèle local propose une valeur, à contrôler dans l’acte avant de l’adopter.'
        });
      }
      if (String(existant.valeur) === String(valeurIa)) {
        return Object.assign({}, existant, {
          origine: 'regex+ia', propositionIa: null,
          raison: 'Les règles de détection et le modèle local lisent la même valeur.'
        });
      }
      return Object.assign({}, existant, {
        statut: 'NEEDS_REVIEW',
        propositionIa: proposer(element, valeurIa),
        raison: 'Le modèle local lit une autre valeur à cet endroit : celle des règles de détection est conservée.',
        candidats: (existant.candidats || []).concat([{ valeur: valeurIa, origine: 'ia', source: sourceIa(element) }])
      });
    };

    if (lot === 'parties') {
      if (resultat.typeActe && resultat.typeActe.valeur) {
        // Un type d'acte non tranché par les regex est le cas où l'inversion vendeur/acquéreur
        // d'une promesse d'achat passerait inaperçue : c'est exactement là que le modèle, qui lit
        // le document en contexte, apporte le plus.
        const actuel = extraction.typeActe || champExtraction(null);
        if (actuel.origine === 'manuel') {
          // déjà tranché à la main
        } else if (!actuel.valeur || actuel.valeur === 'INCONNU') {
          extraction.typeActe = Object.assign({}, actuel, {
            propositionIa: proposer(resultat.typeActe, resultat.typeActe.valeur),
            raison: 'Le type d’acte n’a pas pu être établi par les règles ; le modèle local en propose un — c’est lui qui décide du sens vendeur/acquéreur, à contrôler.'
          });
        } else if (actuel.valeur === resultat.typeActe.valeur) {
          extraction.typeActe = Object.assign({}, actuel, { origine: 'regex+ia', propositionIa: null });
        } else {
          extraction.typeActe = Object.assign({}, actuel, {
            statut: 'NEEDS_REVIEW',
            propositionIa: proposer(resultat.typeActe, resultat.typeActe.valeur),
            raison: 'Le modèle local lit un autre type d’acte : vérifiez que vendeur et acquéreur ne sont pas intervertis.'
          });
        }
      }

      if ((extraction.parties || []).length === 0 && Array.isArray(resultat.parties) && resultat.parties.length > 0) {
        extraction.parties = resultat.parties.map(p => ({
          nom: p.nom, qualiteActe: p.qualiteActe || '', role: p.role,
          qualitePersonne: p.qualitePersonne || 'physique', representant: p.representant || null,
          // Signalé comme venant du modèle : le panneau le dit en clair, ces noms n'ont été lus
          // par aucune règle déterministe.
          origine: 'ia', source: sourceIa(p)
        }));
        // Le nom du dossier est dérivé des parties : le recomposer ici plutôt que de laisser le
        // modèle proposer sa propre mise en forme, qui varierait d'un acte à l'autre.
        const vendeurs = extraction.parties.filter(p => p.role === 'VENDEUR').map(p => p.nom);
        const acquereurs = extraction.parties.filter(p => p.role === 'ACQUEREUR').map(p => p.nom);
        if (vendeurs.length > 0 && acquereurs.length > 0) {
          extraction.champs.nom = fusionnerChamp(extraction.champs.nom, `${vendeurs.join(' & ')} / ${acquereurs.join(' & ')}`, resultat.parties[0]);
        }
      }

      // Notaires : seulement si les regex n'en ont identifié aucun. La règle métier (41/45/37) est
      // ensuite rejouée telle quelle sur cette liste — jamais réimplémentée ici, elle n'est
      // déclarée qu'à un seul endroit (REGLES_NOTAIRE_INSTRUMENTAIRE).
      const notairesActuels = (extraction.notaires && extraction.notaires.liste) || [];
      if (notairesActuels.length === 0 && Array.isArray(resultat.notaires) && resultat.notaires.length > 0) {
        const liste = resultat.notaires.map(n => ({
          nom: n.nom, office: n.office || null, adresse: null,
          codePostal: null, commune: n.office || null, departement: null,
          cote: n.cote || 'inconnu', roleExplicite: n.roleExplicite || null,
          source: sourceIa(n)
        }));
        const departement = extraction.bien && extraction.bien.adresse ? extraction.bien.adresse.departement : null;
        extraction.notaires = determinerNotaires(liste, departement, extraction.typeActe && extraction.typeActe.valeur, zoneNotairesPourActe(texte, extraction.typeActe && extraction.typeActe.valeur));
        // Notaires lus par le seul modèle : l'origine est tracée pour que le rôle de l'étude ne
        // soit JAMAIS pré-rempli automatiquement à partir d'eux (voir
        // appliquerExtractionAuFormulaire) — ce sélecteur masque la checklist des pièces quand il
        // vaut « participant », le basculer sur une lecture non vérifiée serait le pire cas.
        extraction.notaires.origine = 'ia';
      }
    }

    if (lot === 'bien') {
      const adresseActuelle = (extraction.bien && extraction.bien.adresse) || null;
      if (resultat.adresse && (!adresseActuelle || adresseActuelle.origine !== 'manuel')) {
        const a = resultat.adresse;
        const morceaux = [a.numero, a.typeVoie, a.nomVoie, a.lieuDit, a.codePostal, a.commune].filter(Boolean);
        const proposee = morceaux.join(' ');
        extraction.bien = extraction.bien || {};
        const actuelle = extraction.bien.adresse && extraction.bien.adresse.adresseComplete;
        // Proposée, pas appliquée : une adresse fausse fait dériver le département, donc la
        // déduction du notaire instrumentaire, donc le rôle de l'étude sur le dossier.
        if (!actuelle) {
          extraction.bien.propositionIa = proposer(a, proposee);
        } else if (normaliserPourRecherche(actuelle) !== normaliserPourRecherche(proposee)) {
          extraction.bien.propositionIa = proposer(a, proposee);
          extraction.bien.adresse.statut = 'NEEDS_REVIEW';
        } else {
          extraction.bien.propositionIa = null;
          extraction.bien.adresse.origine = 'regex+ia';
        }
      }
      if (resultat.cadastre && !(extraction.bien && extraction.bien.cadastre)) {
        extraction.bien = extraction.bien || {};
        extraction.bien.cadastre = { section: resultat.cadastre.section, numero: resultat.cadastre.numero || null };
      }
      if (resultat.prixVente) {
        extraction.champs.prixVente = fusionnerChamp(extraction.champs.prixVente, resultat.prixVente.valeur, resultat.prixVente);
      }
      if (resultat.typeVente) {
        extraction.champs.typeVente = fusionnerChamp(extraction.champs.typeVente, resultat.typeVente.valeur, resultat.typeVente);
      }
    }

    if (lot === 'dates') {
      const signature = (extraction.dates && extraction.dates.SIGNATURE_AVANT_CONTRAT && extraction.dates.SIGNATURE_AVANT_CONTRAT.valeur) || null;
      for (const entree of (resultat.dates || [])) {
        if (!TYPES_DATE.includes(entree.type)) continue;
        const actuel = extraction.dates[entree.type];
        let valeur = entree.dateExplicite || null;
        let methode = valeur ? 'EXPLICIT' : null;
        if (!valeur && entree.delai) {
          // Le point de départ est rapporté par le modèle dans les mots de l'acte : on le
          // reconnaît avec la même table que les regex, et on ne calcule QUE depuis la signature —
          // les autres ancres (notification, purge, réalisation d'une condition) n'ont pas de date
          // connue à l'import, la date resterait une invention.
          const cle = pointDepartDepuisAncre(entree.delai.pointDepart || '');
          if (pointDepartCalculable(cle) && signature) {
            valeur = calculerDateEcheance(signature, entree.delai);
            methode = 'CALCULATED';
          }
        }
        if (!valeur) continue;
        const fusionne = fusionnerChamp(actuel, valeur, entree);
        // Une date lue telle quelle dans l'acte ne devient jamais « calculée » par l'effet de la
        // fusion : la méthode d'origine prime, c'est elle qui dit à l'étude d'où vient le chiffre.
        fusionne.methode = (actuel && actuel.methode) ? actuel.methode : methode;
        extraction.dates[entree.type] = fusionne;
      }
    }

    extraction.iaLots[lot] = 'ok';
    extraction.alertes = controlerCoherence(extraction);
    return extraction;
  }

  // Lance les trois lots EN PARALLÈLE et fusionne chaque réponse dès son arrivée : le panneau se
  // remplit lot par lot plutôt que d'attendre le plus lent des trois. Chacun passe par le même
  // garde-fou de génération (l'utilisateur a pu importer un autre PDF ou enregistrer le dossier
  // entretemps) et par appliquerExtractionAuFormulaire, qui ne touche jamais un champ saisi à la
  // main. Silencieuse si Ollama n'est pas installé/lancé : le wizard reste utilisable exactement
  // comme sans cette passe, jamais une condition bloquante pour créer un dossier.
  var LOTS_EXTRACTION_IA = ['parties', 'bien', 'dates'];

  async function lancerExtractionIa(texte, monImport) {
    if (!extractionActuelle) return;
    afficherStatutEnrichissementIa(true);
    let lotsAboutis = 0;
    let engagementsAjoutes = 0;

    const traiterLot = async (lot) => {
      let reponse;
      try {
        reponse = await fetchAvecAuth('/api/extraction-ia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texte, lot })
        });
      } catch (e) {
        return; // session expirée (gérée par fetchAvecAuth) ou réseau — passe optionnelle
      }
      if (!reponse.ok) return; // Ollama indisponible : pas d'échec bruyant
      const corps = await reponse.json().catch(() => null);
      if (!corps || !corps.resultat) return;
      if (monImport !== generationImportActuel || !extractionActuelle) return;

      fusionnerExtractionIa(extractionActuelle, lot, corps.resultat, texte, { page: pageDepuisIndex });
      lotsAboutis++;

      if (lot === 'dates') {
        for (const suggestion of (corps.resultat.engagementsVendeur || [])) {
          if (engagementDejaConnu(suggestion.extrait, analyseJuridiqueActuelle.engagements)) continue;
          analyseJuridiqueActuelle.engagements.push({ phrase: suggestion.extrait, type: suggestion.type, page: null, source: 'ia' });
          engagementsAjoutes++;
        }
        if ((corps.resultat.engagementsVendeur || []).length > 0) {
          // Recalculés à partir de TOUS les engagements (regex + IA), comme dans traiterTexte() —
          // une seule fonction pure, jamais deux logiques selon la provenance de la liste.
          analyseJuridiqueActuelle.documents = detecterDocumentsAFournir(analyseJuridiqueActuelle.engagements);
          afficherAnalyseJuridique();
        }
      }

      appliquerExtractionAuFormulaire(extractionActuelle);
      renderPanneauRevision(extractionActuelle);
    };

    await Promise.all(LOTS_EXTRACTION_IA.map(lot => traiterLot(lot).catch(() => {
      if (extractionActuelle) extractionActuelle.iaLots[lot] = 'indisponible';
    })));

    // Un import suivant a déjà remis son propre statut (masqué au départ, voir traiterFichierPdf) :
    // le masquer ici écraserait l'état du nouvel import.
    if (monImport !== generationImportActuel) return;
    afficherStatutEnrichissementIa(false);
    for (const lot of LOTS_EXTRACTION_IA) {
      if (extractionActuelle && extractionActuelle.iaLots[lot] === 'attente') extractionActuelle.iaLots[lot] = 'indisponible';
    }
    if (lotsAboutis === 0) return;

    const morceaux = [`${lotsAboutis} lecture${lotsAboutis > 1 ? 's' : ''} du modèle local`];
    if (engagementsAjoutes > 0) morceaux.push(`${engagementsAjoutes} engagement${engagementsAjoutes > 1 ? 's' : ''} du vendeur en plus`);
    afficherToast(`IA locale : ${morceaux.join(', ')} — voir « Ce que l’outil a compris », tout reste à vérifier.`, 'OK', null);
  }

  // ==== EXTRACTION STRUCTURÉE : relance ciblée à l'IA locale sur UN SEUL champ ====
  //
  // Demandé par l'étude pour automatiser un geste répétitif : jusqu'ici, un champ resté « à
  // vérifier » après les trois lots automatiques ne pouvait être redemandé qu'en relançant les
  // TROIS lots (parties/bien/dates) d'un coup — coûteux sur un CPU de bureau pour une seule donnée
  // qui pose question. `redemanderChampIa()` appelle la même route serveur avec `lot: 'cible'`,
  // qui envoie une fenêtre de texte plus large que celle d'un lot normal (voir
  // server/src/extraction/cible.js) — un geste explicite de l'étude sur un seul champ justifie ce
  // coût supplémentaire, que l'automatique des trois lots en parallèle ne pouvait pas se permettre.
  //
  // Champs éligibles à cette relance : ceux qui correspondent à une vraie lecture du texte. Le rôle
  // de l'étude (roleNotaire) en est exclu — il est DÉDUIT d'une règle métier sur les notaires
  // (voir determinerNotaires), ce n'est pas une donnée que le modèle pourrait lire directement.
  var CLES_CIBLE_IA = new Set(['typeActe', 'nom', 'signature', 'pret', 'acte', 'ventebien', 'adresseBien', 'prixVente', 'emailAcquereur']);

  // Comme fusionnerExtractionIa() : la réponse du modèle ne devient jamais elle-même une valeur du
  // formulaire, seulement une PROPOSITION affichée avec un bouton « Utiliser » (accepterPropositionIa,
  // déjà en place). Pure vis-à-vis de l'état global : ne modifie que l'objet `extraction` reçu en
  // paramètre, donc testable sans dépendre de `dossiers`/du DOM (voir tests/cible-ia.test.js).
  function fusionnerCibleIa(extraction, cle, resultat, texte) {
    if (!extraction || !resultat) return extraction;
    const sourceIa = () => (resultat.extrait)
      ? { extrait: resultat.extrait, index: resultat.extraitIndex === undefined ? null : resultat.extraitIndex, page: resultat.extraitTrouve ? pageDepuisIndex(resultat.extraitIndex) : null }
      : null;
    const proposer = (valeur) => ({ valeur, source: sourceIa(), extraitTrouve: !!resultat.extraitTrouve });
    const raisonCible = 'Relecture ciblée demandée sur ce seul champ, avec une fenêtre de texte plus large.';

    const proposerSur = (objetCible, valeur) => {
      if (!objetCible || valeur === null || valeur === undefined || valeur === '') return;
      if (objetCible.origine === 'manuel') return; // déjà tranché à la main : le modèle ne le rouvre pas
      objetCible.propositionIa = proposer(valeur);
      objetCible.raison = raisonCible;
    };

    if (cle === 'typeActe') {
      extraction.typeActe = extraction.typeActe || champExtraction(null);
      proposerSur(extraction.typeActe, resultat.valeur);
    } else if (cle === 'nom' || cle === 'prixVente' || cle === 'emailAcquereur') {
      extraction.champs = extraction.champs || {};
      extraction.champs[cle] = extraction.champs[cle] || champExtraction(null);
      proposerSur(extraction.champs[cle], resultat.valeur);
    } else if (cle === 'adresseBien') {
      extraction.bien = extraction.bien || {};
      extraction.bien.adresse = extraction.bien.adresse || champExtraction(null);
      if (extraction.bien.adresse.origine !== 'manuel' && resultat.valeur) {
        extraction.bien.propositionIa = proposer(resultat.valeur);
      }
    } else {
      // 'signature' n'a pas d'entrée dans CHAMP_PAR_TYPE_DATE (elle mappe une échéance BUTOIR/
      // REITERATION vers son champ court, pas la date de signature elle-même) — traitée à part.
      const cleDate = cle === 'signature'
        ? 'SIGNATURE_AVANT_CONTRAT'
        : Object.keys(CHAMP_PAR_TYPE_DATE).find(t => CHAMP_PAR_TYPE_DATE[t] === cle);
      if (!cleDate) return extraction;
      extraction.dates = extraction.dates || {};
      extraction.dates[cleDate] = extraction.dates[cleDate] || champExtraction(null);
      let valeur = resultat.dateExplicite || null;
      if (!valeur && resultat.delai) {
        const ptDepart = pointDepartDepuisAncre(resultat.delai.pointDepart || '');
        const signatureVal = extraction.dates.SIGNATURE_AVANT_CONTRAT && extraction.dates.SIGNATURE_AVANT_CONTRAT.valeur;
        if (pointDepartCalculable(ptDepart) && signatureVal) valeur = calculerDateEcheance(signatureVal, resultat.delai);
      }
      proposerSur(extraction.dates[cleDate], valeur);
    }
    extraction.alertes = controlerCoherence(extraction);
    return extraction;
  }

  async function redemanderChampIa(cle) {
    if (!dernierTexteTraite || !extractionActuelle) return;
    const btn = document.getElementById('revision-cible-' + cle);
    if (btn) { btn.disabled = true; btn.innerHTML = icone('spinner', null, true); }
    try {
      const reponse = await fetchAvecAuth('/api/extraction-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texte: dernierTexteTraite, lot: 'cible', champ: cle })
      });
      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => ({}));
        afficherToast(corps.erreur || "L'IA locale n'a pas pu répondre pour ce champ.", 'OK', null);
        return;
      }
      const corps = await reponse.json();
      fusionnerCibleIa(extractionActuelle, cle, corps.resultat, dernierTexteTraite);
      appliquerExtractionAuFormulaire(extractionActuelle);
      renderPanneauRevision(extractionActuelle);
    } catch (e) {
      afficherToast('IA locale injoignable : ' + e.message, 'OK', null);
    } finally {
      // renderPanneauRevision() reconstruit tout le panneau en cas de succès (le bouton d'origine
      // n'existe donc plus) ; en cas d'échec, il faut le réactiver soi-même.
      const btnEncore = document.getElementById('revision-cible-' + cle);
      if (btnEncore && btnEncore.disabled) { btnEncore.disabled = false; btnEncore.innerHTML = `${icone('rotate-ccw')} Redemander à l’IA`; }
    }
  }

  // ---- gestion des échéances "Autre" ----

  function ajouterAutre(iso) {
    compteurAutre++;
    let page = null;
    let labelSuggere = '';
    if (iso) {
      const item = detectedDates.find(d => d.iso === iso);
      if (item) {
        // Voir le commentaire équivalent dans assignerDate() : mémorisé seulement si le clic
        // change réellement la catégorie devinée.
        if (item.suggestion !== 'autre') memoriserCorrection(item.contexte, 'autre', libelleAutreSuggere(item.contexte) || null);
        item.suggestion = 'autre';
        item.active = true;
        page = item.page;
        labelSuggere = item.libelleAppris || libelleAutreSuggere(item.contexte);
      }
    }
    autresEnCours.push({ id: 'autre-' + compteurAutre, label: labelSuggere, iso: iso || '', active: true, page });
    renderAutres();
    renderChips();
  }

  function ajouterAutreVide() {
    ajouterAutre('');
  }

  function majAutreLabel(id, valeur) {
    const item = autresEnCours.find(a => a.id === id);
    if (item) item.label = valeur;
  }

  function majAutreDate(id, valeur) {
    const item = autresEnCours.find(a => a.id === id);
    if (item) item.iso = valeur;
  }

  function toggleAutreActive(id, actif) {
    const item = autresEnCours.find(a => a.id === id);
    if (item) item.active = actif;
    renderAutres();
  }

  function supprimerAutre(id) {
    autresEnCours = autresEnCours.filter(a => a.id !== id);
    renderAutres();
  }

  function renderAutres() {
    const container = document.getElementById('autres-list');
    container.innerHTML = autresEnCours.map(item => `
      <div class="date-block autre${item.active ? '' : ' inactive'}">
        <div class="autre-row">
          <label class="switch">
            <input type="checkbox" ${item.active ? 'checked' : ''} onchange="toggleAutreActive('${item.id}', this.checked)">
            <span class="slider"></span>
          </label>
          <input type="text" placeholder="Nom de l'échéance (ex. Levée de la condition suspensive travaux)" value="${escapeHtml(item.label)}" oninput="majAutreLabel('${item.id}', this.value)">
          <input type="date" value="${item.iso}" onchange="majAutreDate('${item.id}', this.value)">
          <button type="button" class="icon-btn" onclick="supprimerAutre('${item.id}')">Retirer</button>
        </div>
      </div>
    `).join('');
  }

  function reinitialiserFormulaire() {
    masquerErreurFormulaire();
    // Périme tout enrichissement IA encore en vol depuis l'import précédent (voir
    // lancerExtractionIa) : sans ça, sa réponse pourrait arriver après ce reset et remplir des
    // champs pourtant vidés pour un tout nouvel import.
    generationImportActuel++;
    compromisNomFichierImporte = '';
    document.getElementById('f-nom').value = '';
    document.getElementById('f-responsable').value = '';
    document.getElementById('f-type-vente').value = 'maison';
    document.getElementById('f-role-notaire').value = 'instrumentaire';
    majApercuPieces();
    document.getElementById('f-email-acquereur').value = '';
    document.getElementById('f-adresse-bien').value = '';
    document.getElementById('f-prix-vente').value = '';
    document.getElementById('f-pret').value = '';
    document.getElementById('f-acte').value = '';
    // Oubli corrigé au passage : ce champ n'était vidé que par toggleEcheance('ventebien', false).
    // Sans ça, valeursAppliquees le croirait modifié à la main au prochain import.
    document.getElementById('f-ventebien').value = '';
    document.getElementById('f-pdf').value = '';
    document.getElementById('pdf-status').textContent = '';
    document.getElementById('pdf-status').className = 'pdf-status';
    document.getElementById('compromis-info').style.display = 'none';
    document.getElementById('f-date-compromis').style.display = 'none';
    document.getElementById('cash-note').style.display = 'none';
    definirEcheanceActive('pret', true);
    definirEcheanceActive('acte', true);
    definirEcheanceActive('ventebien', false);
    dateCompromisDetectee = '';
    dateCompromisEstimee = false;
    dernierTexteTraite = '';
    detectedDates = [];
    autresEnCours = [];
    analyseJuridiqueActuelle = { documents: [], engagements: [], conditions: [] };
    extractionActuelle = null;
    valeursAppliquees = {};
    correctionsRevision = {};
    verificationsRevision = {};
    renderPanneauRevision(null);
    afficherAnalyseJuridique();
    masquerBoutonAjoutEngagement();
    masquerFormAjoutEngagementManuel();
    afficherStatutEnrichissementIa(false);
    // Referme entièrement le panneau d'aperçu : sans ça, le PDF du dossier qu'on vient d'enregistrer
    // restait affiché à côté d'un formulaire pourtant vide, prêt pour un nouvel import.
    document.getElementById('pdf-viewer').style.display = 'none';
    document.getElementById('pdf-viewer-title').textContent = 'Aperçu du compromis';
    document.getElementById('pdf-pages-container').innerHTML = '';
    document.getElementById('nouveau-intro').style.display = 'flex';
    reinitialiserRecherchePdf();
    pdfActuel = null;
    pdfDernierePageUtile = 1;
    frontieresPagesActuelles = null;
    reinitialiserRappelsParDefaut();
    renderChips();
    renderAutres();
    definirEtapeWizard(1);
  }

  // Les cases de rappel gardaient l'état du dossier précédent : on les remet explicitement sur
  // les valeurs par défaut (15 et 7 jours avant) à chaque nouveau dossier.
  const RAPPELS_PAR_DEFAUT = ['15', '7'];

  function reinitialiserRappelsParDefaut() {
    document.querySelectorAll('#reminder-days input[type="checkbox"]').forEach(box => {
      box.checked = RAPPELS_PAR_DEFAUT.includes(box.value);
    });
  }

  function getSelectedReminderDays() {
    const boxes = document.querySelectorAll('#reminder-days input[type="checkbox"]');
    const days = [];
    boxes.forEach(b => { if (b.checked) days.push(parseInt(b.value, 10)); });
    return days.sort((a, b) => b - a);
  }

  async function ajouterDossier() {
    const nom = document.getElementById('f-nom').value.trim();
    const typeVente = document.getElementById('f-type-vente').value;
    const roleNotaire = document.getElementById('f-role-notaire').value;
    const responsable = document.getElementById('f-responsable').value.trim();
    const emailAcquereur = document.getElementById('f-email-acquereur').value.trim();
    const adresseBien = document.getElementById('f-adresse-bien').value.trim();
    const prixVenteBrut = document.getElementById('f-prix-vente').value.trim();
    const prixVente = prixVenteBrut ? parseInt(prixVenteBrut.replace(/[^\d]/g, ''), 10) : null;
    const pret = echeanceActive.pret ? document.getElementById('f-pret').value : '';
    const acte = echeanceActive.acte ? document.getElementById('f-acte').value : '';
    const ventebien = echeanceActive.ventebien ? document.getElementById('f-ventebien').value : '';
    const autres = autresEnCours
      .filter(a => a.active && a.iso)
      .map(a => ({ label: a.label.trim() || 'Autre échéance', date: a.iso, page: a.page || null }));

    if (!nom) { afficherErreurFormulaire('Indiquez un nom de dossier.'); return; }
    if (!pret && !acte && !ventebien && autres.length === 0) { afficherErreurFormulaire('Renseignez au moins une date butoir active.'); return; }
    masquerErreurFormulaire();

    // "auto" = date reprise d'un chip détecté dans le texte ; "manuel" = saisie/correction à la
    // main ; "incertain" = choisie automatiquement parmi plusieurs candidates de même catégorie
    // sans formulation de délai pour trancher (voir meilleureCandidateEcheance) — à vérifier avant
    // les autres dates "auto" ; "estime" = calculée à partir d'une formulation approximative
    // ("fin septembre", délai relatif...) plutôt que lue telle quelle dans le texte.
    function confianceType(valeur, type) {
      if (!valeur) return null;
      if (!pageParType[type]) return 'manuel';
      if (approxParType[type]) return 'estime';
      return ambiguiteParType[type] ? 'incertain' : 'auto';
    }
    const confiance = {
      pret: confianceType(pret, 'pret'),
      acte: confianceType(acte, 'acte'),
      ventebien: confianceType(ventebien, 'ventebien')
    };

    // Engagements d'entretien détectés dans le compromis (chaudière, PAC, ramonage — voir
    // cleChecklist sur DOCUMENTS_VENDEUR_CONNUS/PIECES_ENGAGEMENTS_AUTO) : ajoutés une fois pour
    // toutes à la checklist de CE dossier, calculé ici puisque l'analyse complète du compromis
    // (analyseJuridiqueActuelle) n'existe que pendant l'import — un dossier déjà enregistré et
    // rouvert n'a plus accès au texte du compromis pour refaire cette détection après coup.
    const piecesEngagementsDetectees = analyseJuridiqueActuelle.documents
      .map(doc => doc.cleChecklist)
      .filter(Boolean);

    // Ce que l'extraction structurée a compris de l'acte (type d'acte, parties et leurs rôles,
    // notaires, adresse/cadastre du bien, statut de chaque donnée) — conservé sur le dossier à
    // titre de trace consultable, en plus des champs plats inchangés. Rien de tout ceci n'est
    // recalculable après coup : le texte du compromis n'est jamais gardé (voir CLAUDE.md).
    const instantane = instantaneExtraction(extractionActuelle);
    // Notaire de chaque côté + celui qui reçoit l'acte. Calculé ici plutôt que repris de
    // `instantane.notaires` : cotesNotairesPourDossier a besoin de la LISTE complète des notaires
    // détectés (que l'instantané ne conserve pas) pour proposer ceux dont l'acte ne dit pas de
    // quel côté ils interviennent.
    const cotesNotaires = cotesNotairesPourDossier(extractionActuelle ? extractionActuelle.notaires : null);

    const dossier = {
      id: (crypto.randomUUID ? crypto.randomUUID() : 'd-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
      nom, responsable, emailAcquereur,
      adresseBien,
      prixVente: Number.isFinite(prixVente) && prixVente > 0 ? prixVente : null,
      montantPret: null,
      typeVente,
      roleNotaire,
      // Champs libres, corrigeables à tout moment sur la fiche (voir affecterNotaire) : vides
      // quand l'acte ne dit pas qui représente qui — les noms détectés restent alors proposés
      // dans notairesDetectes, à l'étude de les affecter.
      notaireVendeur: cotesNotaires.vendeur,
      notaireAcquereur: cotesNotaires.acquereur,
      coteInstrumentaire: cotesNotaires.coteInstrumentaire,
      notairesDetectes: cotesNotaires.detectes,
      pieces: {},
      piecesEngagementsDetectees,
      dossierLie: false,
      // Dossier client sur le NAS (chemin relatif à la racine configurée côté serveur) et
      // chemins des fichiers déjà reconnus dedans : conservés SUR LE DOSSIER, donc valables depuis
      // n'importe quel poste — contrairement aux anciens handles, propres à un navigateur.
      nasDossier: null,
      fichiersTrouves: {},
      offrePretStatut: 'inconnu',
      garantiesPret: [],
      derniereRelanceAuto: null,
      pret, acte, ventebien, autres,
      pretPage: pret ? pageParType.pret : null,
      actePage: acte ? pageParType.acte : null,
      ventebienPage: ventebien ? pageParType.ventebien : null,
      pdfNumPages: pdfDernierePageUtile,
      // Nom du fichier réellement importé : la seule façon de rouvrir plus tard le BON
      // avant-contrat (voir ouvrirCompromisTrouve). Vide pour un dossier saisi entièrement à la
      // main, qui retombe alors sur l'ancienne recherche floue.
      compromisNomFichier: compromisNomFichierImporte || null,
      sansPret: !echeanceActive.pret,
      // Échéances déclarées réalisées (voir echeanceValidee/validerEcheance) : vide à la création.
      echeancesValidees: {},
      // Pas de section rappels sans condition de prêt (voir majVisibiliteRappels) : aucun rappel
      // pour ce dossier, plutôt que de lire des cases à cocher restées invisibles/non pertinentes.
      reminderDays: echeanceActive.pret ? getSelectedReminderDays() : [],
      confiance,
      archive: false,
      analyseJuridique: {
        documents: analyseJuridiqueActuelle.documents.slice(),
        engagements: analyseJuridiqueActuelle.engagements.slice(),
        conditions: (analyseJuridiqueActuelle.conditions || []).slice()
      },
      typeActe: instantane ? instantane.typeActe : null,
      parties: instantane ? instantane.parties : [],
      notaires: instantane ? instantane.notaires : null,
      bien: instantane ? instantane.bien : null,
      extraction: instantane ? instantane.extraction : null,
      historique: [{ date: new Date().toISOString(), texte: 'Dossier créé' }]
    };

    // Ce que l'étude a corrigé à la main par rapport à ce que l'extraction proposait — journalisé
    // pour mesurer plus tard où elle se trompe, jamais pour réentraîner automatiquement quoi que
    // ce soit (voir journaliserCorrectionsExtraction).
    journaliserCorrectionsExtraction(diffCorrectionsExtraction(extractionActuelle, {
      nom, adresseBien, emailAcquereur, roleNotaire,
      prixVente: Number.isFinite(prixVente) && prixVente > 0 ? prixVente : null,
      pret, acte, ventebien
    }));

    const cree = await sauvegarderNouveauDossier(dossier);
    if (!cree) {
      afficherToast("Impossible d'enregistrer le dossier — vérifiez la connexion au serveur intranet.", 'OK', null);
      return;
    }
    dossiers.push(dossier);
    reinitialiserFormulaire();
    document.getElementById('panel').open = false;
    definirOnglet('suivi');
    // Rattachement au NAS immédiat quand le nom du dossier désigne sans ambiguïté un dossier
    // client existant : c'est le moment où ça sert le plus, et ça évite le clic « Relier un
    // dossier du NAS » juste après avoir créé le dossier. Jamais attendu (la fiche s'affiche tout
    // de suite), et sans effet si aucune correspondance parfaite n'existe.
    lierDossierNasAutomatique(dossier.id);
  }

  // Modale de confirmation maison : window.confirm() est souvent bloqué dans un aperçu en
  // bac à sable (iframe), ce qui empêchait la suppression de fonctionner silencieusement.
  let actionConfirmee = null;

  function demanderConfirmation(message, onConfirm) {
    document.getElementById('confirm-message').textContent = message;
    actionConfirmee = onConfirm;
    document.getElementById('confirm-overlay').style.display = 'flex';
  }

  // Message de validation intégré à la page (remplace window.alert(), lui aussi souvent bloqué
  // dans un aperçu en bac à sable).
  function afficherErreurFormulaire(message) {
    const el = document.getElementById('form-error');
    el.textContent = message;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function masquerErreurFormulaire() {
    document.getElementById('form-error').style.display = 'none';
  }

  function annulerConfirmation() {
    actionConfirmee = null;
    document.getElementById('confirm-overlay').style.display = 'none';
  }

  // Popup d'info post-action (voir telechargerICS()/envoyerRelanceCiblee()) : confirme que
  // l'action a eu lieu et rappelle en une phrase à quoi sert le fichier/brouillon obtenu, à la
  // place de l'ancien texte fixe du footer (retiré, voir index.html) qui expliquait ça en
  // permanence sans rapport avec un geste précis de l'utilisateur.
  function afficherInfoAction(titre, message) {
    document.getElementById('info-action-titre').textContent = titre;
    document.getElementById('info-action-message').textContent = message;
    document.getElementById('info-action-overlay').style.display = 'flex';
  }

  function fermerInfoAction() {
    document.getElementById('info-action-overlay').style.display = 'none';
  }

  document.getElementById('confirm-btn-ok').addEventListener('click', () => {
    const action = actionConfirmee;
    annulerConfirmation();
    if (action) action();
  });

  let dernierSupprimeTimeout = null;

  function afficherToast(message, texteBouton, onUndo) {
    clearTimeout(dernierSupprimeTimeout);
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').textContent = message;
    const btn = document.getElementById('toast-undo-btn');
    btn.textContent = texteBouton;
    btn.onclick = () => {
      clearTimeout(dernierSupprimeTimeout);
      toast.style.display = 'none';
      if (onUndo) onUndo();
    };
    toast.style.display = 'flex';
    dernierSupprimeTimeout = setTimeout(() => { toast.style.display = 'none'; }, 6000);
  }

  async function supprimerDossier(id) {
    const d = dossiers.find(x => x.id === id);
    const nom = d ? d.nom : 'ce dossier';
    demanderConfirmation(`Supprimer « ${nom} » du registre ?`, async () => {
      const index = dossiers.findIndex(x => x.id === id);
      if (index === -1) return;
      // Suppression douce côté serveur (voir supprimerDossierServeur) : la ligne reste en base,
      // seulement marquée supprimée — "Annuler" la restaure sans avoir à la recréer de zéro.
      const supprime = await supprimerDossierServeur(id);
      if (!supprime) {
        afficherToast('Suppression impossible — vérifiez la connexion au serveur.', 'OK', null);
        return;
      }
      dossiers = dossiers.filter(x => x.id !== id);
      render();
      afficherToast(`Dossier « ${nom} » supprimé.`, 'Annuler', async () => {
        const restaure = await restaurerDossierServeur(id);
        if (restaure && d) {
          dossiers.push(d);
          render();
        }
      });
    });
  }

  function joursRestants(iso) {
    if (!iso) return null;
    const today = new Date();
    today.setHours(0,0,0,0);
    const target = new Date(iso + 'T00:00:00');
    const diffMs = target - today;
    return Math.round(diffMs / 86400000);
  }

  function formatDateFr(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function optionsCategorie(typeActuel) {
    const options = [
      ['pret', 'Obtention du prêt'],
      ['acte', "Signature de l'acte"],
      ['ventebien', 'Vente préalable']
    ];
    return options.map(([val, texte]) =>
      `<option value="${val}" ${val === typeActuel ? 'selected' : ''}>${texte}</option>`
    ).join('');
  }

  function renderTab(type, label, iso, dossierId, page, confiance, autreIndex, offrePretRecue, offreBloc, sansPret, validee) {
    // Les tabs Prêt / Acte / Vente d'un dossier enregistré sont recatégorisables au clic ;
    // les échéances "Autre" gardent leur libellé personnalisé (non concerné par ce sélecteur).
    // Redessiné sur retour de l'étude : le titre est maintenant un texte statique (coloré selon la
    // catégorie), avec juste une petite flèche à côté pour changer de catégorie — plutôt que le
    // titre entier comme <select> (ambigu : rien n'indiquait qu'il s'agissait d'un menu déroulant
    // avant d'y cliquer). Le <select> natif reste fonctionnellement identique (mêmes <option>, même
    // onchange) mais devient invisible (opacity:0), superposé pile sur la petite flèche
    // (.tab-select-icone-chevron, pointer-events:none) qui, elle, est purement décorative.
    const recategorisable = dossierId && autreIndex == null && (type === 'pret' || type === 'acte' || type === 'ventebien');
    const enTete = recategorisable
      ? `<div class="tab-titre-ligne">
          <div class="tab-name">${label}</div>
          <span class="tab-select-icone-wrap" title="Changer la catégorie de cette échéance">
            <select class="tab-select-icone" onchange="changerCategorie('${dossierId}','${type}', this.value)" aria-label="Changer la catégorie de cette échéance">${optionsCategorie(type)}</select>
            <span class="tab-select-icone-chevron">${icone('chevron-down')}</span>
          </span>
        </div>`
      : `<div class="tab-name">${label}</div>`;

    // Petite croix en haut à droite pour retirer une échéance : "autre" passe par
    // supprimerEcheanceAutre (retire l'entrée de d.autres) ; Prêt/Acte/Vente préalable, tant qu'une
    // date y est renseignée, passent par supprimerDateEcheance (vide juste la date — la tab
    // elle-même n'est jamais retirée du modèle, voir son historique). Avant ce bouton dédié, seul
    // le crayon (vider le champ date natif puis valider) permettait de l'effacer — peu visible,
    // demandé par l'étude sous forme d'un vrai bouton de suppression.
    const croixSuppression = (dossierId && autreIndex != null)
      ? `<button type="button" class="tab-suppr" onclick="supprimerEcheanceAutre('${dossierId}', ${autreIndex})" title="Supprimer cette échéance" aria-label="Supprimer cette échéance">${icone('x')}</button>`
      : (dossierId && autreIndex == null && iso && (type === 'pret' || type === 'acte' || type === 'ventebien'))
        ? `<button type="button" class="tab-suppr" onclick="supprimerDateEcheance('${dossierId}', '${type}')" title="Supprimer cette date" aria-label="Supprimer cette date">${icone('x')}</button>`
        : '';

    // Retrouve la date dans l'aperçu PDF (uniquement si le PDF encore chargé est bien celui d'origine).
    const boutonVoir = (iso && page && pdfActuel)
      ? `<button type="button" class="voir-pdf-btn" onclick="voirDateDansPdf(${page}, '${iso.split('-')[0]}')">${icone('eye')} Voir p.${page}</button>`
      : '';

    // Indique si la date a été choisie parmi plusieurs candidates sans formulation de délai pour
    // trancher (à vérifier en priorité — voir meilleureCandidateEcheance), calculée à partir d'une
    // formulation approximative, ou vient d'une saisie/correction manuelle. Le cas par défaut
    // ("auto" : repérée sans ambiguïté) n'affiche volontairement RIEN — c'est la lecture directe
    // du texte, le cas normal ; lui donner le même traitement visuel que les trois exceptions
    // ci-dessous revenait à mettre un badge sur chaque date de chaque dossier, qui finissait par
    // n'attirer l'attention sur rien de particulier.
    // "manuel" (saisie/corrigée à la main) n'a plus d'entrée du tout, comme "auto" : le bouton
    // crayon juste à côté (icon-crayon) porte déjà cette information à lui seul — signalé par
    // l'étude comme redondant à côté du crayon dans le dossier ouvert.
    const LIBELLES_CONFIANCE = {
      estime: { titre: 'Calculée à partir d’une formulation approximative ("fin septembre", délai relatif...) — à vérifier précisément', texte: 'Estimée', dl: 'dl-pret' },
      incertain: { titre: 'Choisie parmi plusieurs dates possibles dans le texte — à vérifier en priorité', texte: 'À vérifier', dl: 'dl-alerte', icone: 'alert-triangle' }
    };
    const infoConfiance = confiance && LIBELLES_CONFIANCE[confiance];
    const badgeConfiance = infoConfiance
      ? `<span class="dot-label ${infoConfiance.dl}" title="${infoConfiance.titre}">${infoConfiance.icone ? icone(infoConfiance.icone) : '<span class="dot"></span>'}${infoConfiance.texte}</span>`
      : '';

    // Une date d'un dossier déjà enregistré reste corrigeable après coup (erreur repérée plus
    // tard) : crayon → champ date natif → valider, même mécanisme que le nom du dossier. cleEdition
    // identifie la cible de validerEditionDate() : le type directement pour pret/acte/ventebien,
    // l'index dans d.autres pour une échéance personnalisée (pas d'id stable sur ces entrées).
    const editable = dossierId != null;
    const cleEdition = autreIndex != null ? 'autre-' + autreIndex : type;
    const idBase = `tabdate-${dossierId}-${cleEdition}`;
    const editionDate = editable ? `
        <span class="tab-date-edition" id="${idBase}-edit" hidden>
          <input type="date" class="tab-date-input" id="${idBase}-input" value="${iso || ''}">
          <button type="button" class="icon-valider" onclick="validerEditionDate('${dossierId}','${cleEdition}')" title="Valider" aria-label="Valider la date">✓</button>
        </span>` : '';
    const crayonDate = editable
      ? `<button type="button" class="icon-crayon" onclick="activerEditionDate('${dossierId}','${cleEdition}')" title="Corriger cette date" aria-label="Corriger cette date">${icone('pencil')}</button>`
      : '';

    if (!iso) {
      // "Achat comptant — sans prêt" plutôt que "Non renseigné" : ce dernier laissait croire à un
      // oubli sur un dossier où cette échéance ne s'applique tout simplement pas (sansPret vrai,
      // qu'il vienne de la création ou d'une suppression de date après coup — voir
      // supprimerDateEcheance). Le crayon reste affiché : si un prêt finit par exister malgré tout,
      // saisir une date ici doit rester possible (voir validerEditionDate, qui repasse alors
      // sansPret à false).
      const texteVide = (type === 'pret' && sansPret) ? 'Achat comptant — sans prêt' : 'Non renseigné';
      return `<div class="tab ${type}">
        ${croixSuppression}
        ${enTete}
        <span class="tab-date-affichage" id="${idBase}-aff"><div class="tab-date">${texteVide}</div>${crayonDate}${badgeConfiance}</span>
        ${editionDate}
        ${offreBloc || ''}
      </div>`;
    }
    // Échéance déclarée réalisée : la date reste affichée (elle fait partie du dossier) mais le
    // décompte n'a plus de sens, et la carte porte de quoi revenir en arrière. L'étude l'a demandé
    // pour la vente préalable — une fois la vente de l'acquéreur faite, c'est l'échéance suivante
    // qu'il faut voir remonter dans la vue Échéances (voir echeanceValidee/toutesEcheances).
    const boutonValidation = (dossierId && iso && type === 'ventebien')
      ? (validee
        ? `<button type="button" class="lien-dossier-local" onclick="devaliderEcheance('${dossierId}','${type}')">Annuler la validation</button>`
        : `<button type="button" class="action-rapide" onclick="validerEcheance('${dossierId}','${type}')" title="La vente préalable est réalisée : passer à l’échéance suivante">${icone('check')} Marquer réalisée</button>`)
      : '';

    const jours = joursRestants(iso);
    let countdownClass = '';
    let countdownText = '';
    // Une fois l'offre de prêt confirmée reçue, la date n'a plus lieu d'être signalée comme
    // "dépassée" (condition résolue, pas un retard) : le décompte le dit à la place. Il a été un
    // temps masqué entièrement dans ce cas, pour éviter de répéter ce que disait déjà offreBloc en
    // toutes lettres ("✓ Offre de prêt reçue") — l'étude a demandé de revenir en arrière, la carte
    // se retrouvait trop vide. Le doublon est réglé de l'autre côté : offreBloc est maintenant une
    // puce de couleur compacte, plus une phrase (voir renderCarteDossier).
    if (offrePretRecue) {
      countdownClass = 'recue';
      countdownText = '✓ Offre reçue';
    } else if (validee) {
      countdownClass = 'recue';
      countdownText = '✓ Réalisée';
    } else if (jours < 0) {
      countdownClass = 'passed';
      countdownText = 'Échéance dépassée';
    } else if (jours === 0) {
      countdownClass = 'urgent';
      countdownText = "Aujourd'hui";
    } else {
      countdownText = `J-${jours}`;
      if (jours <= 3) countdownClass = 'urgent';
    }
    return `<div class="tab ${type}">
      ${croixSuppression}
      ${enTete}
      <span class="tab-date-affichage" id="${idBase}-aff"><div class="tab-date">${formatDateFr(iso)}${boutonVoir}</div>${crayonDate}${badgeConfiance}</span>
      ${editionDate}
      <div class="tab-countdown ${countdownClass}">${countdownText}</div>
      ${boutonValidation}
      ${offreBloc || ''}
    </div>`;
  }

  // Marque une échéance comme réalisée (ou revient en arrière). La date n'est jamais effacée —
  // c'est la différence avec supprimerDateEcheance : le dossier garde la trace de la date butoir,
  // seule sa présence dans le planning change.
  function validerEcheance(id, type) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    d.echeancesValidees = d.echeancesValidees || {};
    d.echeancesValidees[type] = true;
    ajouterHistorique(d, `${LIBELLES_CATEGORIE[type] || type} marquée réalisée`);
    sauvegarder(d);
    render();
  }

  function devaliderEcheance(id, type) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !d.echeancesValidees) return;
    delete d.echeancesValidees[type];
    ajouterHistorique(d, `${LIBELLES_CATEGORIE[type] || type} : validation annulée`);
    sauvegarder(d);
    render();
  }

  // Échange le contenu de deux échéances fixes d'un dossier (aucune perte de données : si la
  // catégorie cible avait déjà une date, elle prend la place de l'ancienne).
  const LIBELLES_CATEGORIE = { pret: 'Obtention du prêt', acte: "Signature de l'acte", ventebien: 'Vente préalable' };

  function ajouterHistorique(d, texte) {
    d.historique = d.historique || [];
    d.historique.push({ date: new Date().toISOString(), texte });
  }

  function changerCategorie(dossierId, ancienType, nouveauType) {
    if (ancienType === nouveauType) return;
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const temp = d[nouveauType] || '';
    d[nouveauType] = d[ancienType] || '';
    d[ancienType] = temp;

    d.confiance = d.confiance || {};
    const tempC = d.confiance[nouveauType] || null;
    d.confiance[nouveauType] = d.confiance[ancienType] || 'manuel';
    d.confiance[ancienType] = tempC;

    ajouterHistorique(d, `« ${LIBELLES_CATEGORIE[ancienType]} » recatégorisée en « ${LIBELLES_CATEGORIE[nouveauType]} »`);
    sauvegarder(d);
    render();
  }

  // Corrections après coup du type de vente et du rôle de l'étude — utile quand l'un des deux a
  // été mal renseigné à la création, ou change en cours de dossier (ex. l'étude devient
  // instrumentaire après avoir démarré en participant). Un simple <select> suffit ici (pas besoin
  // du mécanisme crayon+validation utilisé pour le nom/les dates) : ce sont des choix fermés à deux
  // valeurs, pas du texte libre où un clic accidentel risquerait de tout effacer.
  function changerTypeVente(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || d.typeVente === valeur) return;
    const libelle = (v) => v === 'copropriete' ? 'copropriété' : v === 'terrain' ? 'terrain à bâtir' : 'maison';
    ajouterHistorique(d, `Type de vente modifié : ${libelle(d.typeVente)} → ${libelle(valeur)}`);
    // La checklist de pièces (checklistPieces) est recalculée à partir de d.typeVente à chaque
    // affichage : pas besoin de retoucher d.pieces ici. Les pièces déjà reconnues sous une clé
    // commune aux deux types (ex. titrePropriete) restent valables ; celles propres à l'ancien type
    // (ex. etatDate en quittant la copropriété) restent en mémoire mais ne s'affichent plus,
    // inoffensif si l'étude revient un jour au type précédent.
    d.typeVente = valeur;
    sauvegarder(d);
    render();
  }

  // Même motif que changerTypeVente : un dossier peut changer de main en cours
  // de suivi (absence, réaffectation) sans repasser par la création.
  function changerResponsable(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || (d.responsable || '') === valeur) return;
    ajouterHistorique(d, `Responsable modifié : ${d.responsable || '— à définir —'} → ${valeur || '— à définir —'}`);
    d.responsable = valeur;
    sauvegarder(d);
    render();
  }

  // Adresse et prix : détectés automatiquement à l'import (voir detecterAdresseBien/
  // detecterPrixVente, premier jet sur des regex pas encore éprouvées sur beaucoup de compromis
  // réels), donc corrigeables directement sur la fiche — mêmes principes que Responsable/Type de
  // vente ci-dessus, mais en champ texte libre plutôt qu'un choix fermé.
  function changerAdresseBien(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouvelle = valeur.trim();
    if (nouvelle === (d.adresseBien || '')) return;
    ajouterHistorique(d, `Adresse du bien modifiée`);
    d.adresseBien = nouvelle;
    sauvegarder(d);
    render();
  }

  function changerPrixVente(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const chiffres = valeur.replace(/[^\d]/g, '');
    const nouveau = chiffres ? parseInt(chiffres, 10) : null;
    const normalise = Number.isFinite(nouveau) && nouveau > 0 ? nouveau : null;
    if (normalise === (d.prixVente || null)) { render(); return; }
    ajouterHistorique(d, `Prix de vente modifié : ${d.prixVente ? formaterPrix(d.prixVente) : '—'} → ${normalise ? formaterPrix(normalise) : '—'}`);
    d.prixVente = normalise;
    sauvegarder(d);
    render();
  }

  // Affecte un notaire à un côté depuis la fiche. Champ libre : l'étude peut corriger une lecture
  // fausse, ou saisir un notaire que l'acte ne nommait pas du tout.
  function affecterNotaire(id, cote, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const champ = cote === 'vendeur' ? 'notaireVendeur' : 'notaireAcquereur';
    const nouveau = String(valeur || '').trim();
    if (nouveau === (d[champ] || '')) return;
    d[champ] = nouveau;
    ajouterHistorique(d, `${cote === 'vendeur' ? 'Notaire du vendeur' : 'Notaire de l’acquéreur'} : ${nouveau || '—'}`);
    // Le rédacteur repéré à l'import n'avait pas de côté tant qu'aucun des deux champs ne portait
    // son nom (acte qui nomme ses notaires sans dire qui représente qui) : dès que l'étude l'y
    // affecte, le badge « Reçoit l'acte » peut se poser — mais jamais par-dessus un côté déjà
    // choisi à la main.
    if (!d.coteInstrumentaire && nouveau
      && (d.notairesDetectes || []).some(n => n.role === 'instrumentaire' && n.nom === nouveau)) {
      d.coteInstrumentaire = cote;
    }
    deduireRoleNotaireDossier(d);
    sauvegarder(d);
    render();
  }

  // Bascule le côté qui reçoit l'acte depuis le badge de la ligne concernée (il n'y a plus de
  // sélecteur « Acte reçu par » : c'est le badge lui-même qui porte l'action, voir
  // renderNotairesDossier). Recliquer sur le côté déjà désigné le retire.
  function basculerCoteInstrumentaire(id, cote) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouveau = d.coteInstrumentaire === cote ? null : cote;
    const libelles = { vendeur: 'notaire du vendeur', acquereur: 'notaire de l’acquéreur' };
    ajouterHistorique(d, `Notaire qui reçoit l’acte : ${libelles[nouveau] || 'à déterminer'}`);
    d.coteInstrumentaire = nouveau;
    deduireRoleNotaireDossier(d);
    sauvegarder(d);
    render();
  }

  // Repli utilisé UNIQUEMENT quand le rôle ne peut pas être déduit (notre étude n'est reconnue
  // dans aucun des deux champs, ou personne ne reçoit encore l'acte) : sans lui, un dossier en
  // participation deviendrait impossible à marquer comme tel, les deux sélecteurs ayant disparu.
  function basculerRoleEtude(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    d.roleNotaire = d.roleNotaire === 'participant' ? 'instrumentaire' : 'participant';
    ajouterHistorique(d, `Rôle de l’étude : ${d.roleNotaire}`);
    sauvegarder(d);
    render();
  }

  function calculerProchaineEcheance(d) {
    const autresDates = (d.autres || []).map(a => a.date);
    // Une fois l'offre de prêt reçue, cette échéance est résolue : elle ne doit plus faire
    // considérer le dossier comme "urgent" ni ressortir en tête de tri à sa place (voir aussi
    // prochaineEcheanceDetail, même exclusion pour l'affichage).
    const datePret = echeanceValidee(d, 'pret') ? null : d.pret;
    const dates = [
      datePret,
      echeanceValidee(d, 'acte') ? null : d.acte,
      echeanceValidee(d, 'ventebien') ? null : d.ventebien,
      ...autresDates
    ].filter(Boolean).map(joursRestants);
    const upcoming = dates.filter(j => j >= 0);
    return upcoming.length ? Math.min(...upcoming) : (dates.length ? Math.min(...dates) : 999999);
  }

  function toggleHistorique(id) {
    const el = document.getElementById('historique-' + id);
    if (el) el.classList.toggle('ouvert');
  }

  function archiverDossier(id, archive) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    d.archive = archive;
    ajouterHistorique(d, archive ? 'Dossier archivé' : 'Dossier désarchivé');
    sauvegarder(d);
    render();
  }

  function renderDashboard(dossiersActifs) {
    // C'est la COLONNE entière qui se masque, pas seulement la carte : son étiquette de section
    // vit au-dessus de la carte (comme « Actions urgentes »), et resterait sinon orpheline.
    const bloc = document.getElementById('dashboard-col');
    const liste = document.getElementById('dashboard-liste');
    const echeances = [];
    dossiersActifs.forEach(d => {
      const items = [
        { type: 'pret', label: 'Obtention du prêt', iso: d.pret },
        { type: 'acte', label: "Signature de l'acte", iso: d.acte },
        { type: 'ventebien', label: 'Vente préalable', iso: d.ventebien },
        ...(d.autres || []).map(a => ({ type: 'autre', label: a.label, iso: a.date }))
      ];
      items.forEach(it => {
        if (!it.iso) return;
        const jours = joursRestants(it.iso);
        if (jours >= 0 && jours <= 7) echeances.push({ ...it, jours, nomDossier: d.nom, id: d.id });
      });
    });
    echeances.sort((a, b) => a.jours - b.jours);

    if (echeances.length === 0) {
      bloc.style.display = 'none';
      return;
    }
    bloc.style.display = 'block';
    // Chaque ligne mène au dossier concerné (demandé par l'étude) — même chemin que « Actions
    // urgentes » et que la recherche du Tableau de bord : bascule vers le Suivi et ouvre le
    // tiroir, pas une seconde implémentation.
    liste.innerHTML = echeances.map(e => `
      <button type="button" class="dashboard-ligne" onclick="ouvrirDossierDepuisDashboard('${e.id}')" title="Ouvrir le dossier ${escapeAttr(e.nomDossier)}">
        <span class="dashboard-pastille ${e.type}"></span>
        <span class="dashboard-jours">${e.jours === 0 ? "Auj." : 'J-' + e.jours}</span>
        <span class="dashboard-texte"><b>${escapeHtml(e.label)}</b> — ${escapeHtml(e.nomDossier)} (${formatDateFr(e.iso)})</span>
      </button>
    `).join('');
  }

  // Évolution du nombre de dossiers actifs dans le temps, demandée par l'étude pour le Tableau de
  // bord ("comparer avec le mois précédent... suivi par rapport au mois précédent et à l'année
  // précédente"). Calculée RÉTROACTIVEMENT à partir de l'historique déjà stocké sur chaque dossier
  // (l'entrée "Dossier créé" ajoutée par ajouterDossier(), "Dossier archivé"/"Dossier désarchivé"
  // ajoutées par archiverDossier()) plutôt que via un nouveau mécanisme de relevé périodique à
  // mettre en place : ce dernier n'aurait donné aucune profondeur historique avant plusieurs mois
  // d'usage, alors que l'historique existant permet une réponse immédiate. Un dossier supprimé
  // (plutôt qu'archivé) n'a plus aucune trace, comme partout ailleurs dans l'outil — une suppression
  // reste définitive, y compris pour ce calcul rétroactif.
  function etaitDossierActifA(d, dateRef) {
    const historique = (d.historique || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const creation = historique.find(h => h.texte === 'Dossier créé');
    // Dossier pas encore créé à la date de référence : n'existait pas, donc pas "actif".
    if (creation && new Date(creation.date) > dateRef) return false;
    let archive = false;
    for (const h of historique) {
      if (new Date(h.date) > dateRef) break;
      if (h.texte === 'Dossier archivé') archive = true;
      else if (h.texte === 'Dossier désarchivé') archive = false;
    }
    return !archive;
  }

  function compterDossiersActifsA(listeDossiers, dateRef) {
    return listeDossiers.filter(d => etaitDossierActifA(d, dateRef)).length;
  }

  // `maintenant` (optionnel, par défaut la date du jour) permet de fixer une référence stable dans
  // les tests plutôt que de dépendre de `new Date()` au moment de l'exécution.
  function calculerEvolutionPortefeuille(listeDossiers, maintenant) {
    const ref = maintenant || new Date();
    const actuel = listeDossiers.filter(d => !d.archive).length;
    const ilYAUnMois = new Date(ref);
    ilYAUnMois.setMonth(ilYAUnMois.getMonth() - 1);
    const ilYAUnAn = new Date(ref);
    ilYAUnAn.setFullYear(ilYAUnAn.getFullYear() - 1);
    const moisDernier = compterDossiersActifsA(listeDossiers, ilYAUnMois);
    const anDernier = compterDossiersActifsA(listeDossiers, ilYAUnAn);
    return { actuel, moisDernier, ecartMois: actuel - moisDernier, anDernier, ecartAn: actuel - anDernier };
  }

  // Petite flèche + chiffre signé pour un écart, réutilisée pour les deux comparaisons (mois/an) —
  // un seul rendu pour ne pas décrire deux fois la même logique. Volontairement pas de couleur
  // "succès"/"alerte" sur la hausse/la baisse : un nombre de dossiers actifs qui augmente n'est pas
  // en soi une bonne ou une mauvaise nouvelle pour l'étude (plus de dossiers = plus de charge), donc
  // aucun jugement de valeur n'est encodé dans la couleur — même principe que partout ailleurs dans
  // l'outil ("aucune couleur inventée pour l'occasion").
  function formaterTendance(ecart) {
    if (ecart > 0) return { icone: icone('trend-up', 'kpi-tendance-icone'), texte: `+${ecart}` };
    if (ecart < 0) return { icone: icone('trend-down', 'kpi-tendance-icone'), texte: `${ecart}` };
    return { icone: '', texte: '=' };
  }

  // Chiffres de synthèse du portefeuille (dossiers actifs, hors filtres/recherche de la liste) —
  // calculés une seule fois, partagés par le bandeau de l'onglet "Suivi" (renderStatsSuivi) et les
  // tuiles KPI du "Tableau de bord" (renderKpisDashboard), pour ne jamais faire diverger ces deux
  // lectures d'un même portefeuille.
  function calculerStatsPortefeuille(dossiersActifs) {
    const dansNJours = (n) => dossiersActifs.filter(d => {
      const prochaine = prochaineEcheanceDetail(d);
      return prochaine && prochaine.jours <= n;
    }).length;
    const urgents = dansNJours(7);
    const urgents15 = dansNJours(15);
    const avecPret = dossiersActifs.filter(d => !d.sansPret);
    const manquantes = avecPret.filter(d => d.offrePretStatut === 'manquante').length;
    // "À vérifier" regroupe tout ce qui n'est tranché ni dans un sens ni dans l'autre : jamais
    // cherchée ("inconnu") comme trouvée sans confirmation ("aconfirmer", voir statutOffreAffichage).
    const aVerifier = avecPret.filter(d => {
      const s = d.offrePretStatut || 'inconnu';
      return s !== 'recue' && s !== 'manquante';
    }).length;
    // Même condition que statutDossier() : uniquement une fois relié, hors rôle participant.
    const piecesIncompletes = dossiersActifs.filter(d => d.dossierLie && d.roleNotaire !== 'participant' &&
      checklistPieces(d.typeVente, d).some(p => (d.pieces || {})[p.cle] !== 'recue')).length;
    return { actifs: dossiersActifs.length, urgents, urgents15, manquantes, aVerifier, piecesIncompletes };
  }

  // Bandeau de synthèse en tête de l'onglet "Suivi des dossiers" : donne un état global du
  // portefeuille (dossiers actifs, hors filtres/recherche de la liste) avant de la parcourir.
  function renderStatsSuivi(dossiersActifs) {
    const bloc = document.getElementById('stats-suivi');
    if (!bloc) return;

    const { actifs, urgents, manquantes, piecesIncompletes } = calculerStatsPortefeuille(dossiersActifs);
    const tuiles = [
      ['c-neutre', actifs, actifs > 1 ? 'dossiers actifs' : 'dossier actif'],
      ['c-urgent', urgents, 'échéances ≤ 7 jours'],
      ['c-pret', manquantes, 'offres de prêts en attente'],
      ['c-pret', piecesIncompletes, 'dossiers avec pièces manquantes']
    ];
    bloc.innerHTML = tuiles.map(([cls, valeur, libelle]) =>
      `<div class="stat-tile"><div class="stat-label">${libelle}</div><div class="stat-num ${cls}">${valeur}</div></div>`
    ).join('');
  }

  // Tuiles KPI du "Tableau de bord" : mêmes chiffres que renderStatsSuivi (calculerStatsPortefeuille),
  // avec une 5e tuile propre au tableau de bord (pièces manquantes) — l'aperçu d'ensemble le plus
  // synthétique de l'outil, avant même d'ouvrir un dossier.
  // Icône calendrier commune aux deux tuiles d'échéances (7j/15j) avec le seuil incrusté dedans,
  // plutôt que deux emojis différents (⏱️/📅) sans lien visuel entre les deux — demandé par
  // l'étude pour rendre évident que ce sont deux variantes de la même mesure. Un vrai SVG dessiné à
  // la main, pas l'emoji 📅 : ce dernier porte déjà son propre numéro de jour selon la plateforme
  // (souvent "17"), qui se superposait de façon illisible à celui qu'on voulait y afficher.
  function iconeCalendrierSeuil(jours) {
    return `<svg class="kpi-icone kpi-icone-calendrier" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1" y="2.3" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <rect x="1" y="2.3" width="14" height="3.4" rx="1.1" fill="currentColor" opacity="0.28" stroke="none"/>
      <line x1="4.3" y1="1" x2="4.3" y2="3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <line x1="11.7" y1="1" x2="11.7" y2="3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <text x="8" y="12.3" text-anchor="middle" font-size="6.6" font-weight="800" fill="currentColor">${jours}</text>
    </svg>`;
  }

  function renderKpisDashboard(dossiersActifs) {
    const bloc = document.getElementById('kpis-dashboard');
    if (!bloc) return;
    const { actifs, urgents, urgents15, manquantes, piecesIncompletes } = calculerStatsPortefeuille(dossiersActifs);
    // Tendance du nombre de dossiers actifs vs le mois précédent (voir calculerEvolutionPortefeuille)
    // affichée directement à côté du chiffre plutôt qu'en dessous — demandé par l'étude. Sur TOUS
    // les dossiers (dossiers, pas dossiersActifs) puisqu'un dossier archivé aujourd'hui a pu être
    // actif il y a un mois — l'exclure fausserait la comparaison. La comparaison à l'année
    // précédente reste calculée (evolution.ecartAn) mais volontairement pas affichée pour
    // l'instant, sur demande explicite de l'étude ("ne pas afficher l'option pour l'année pour le
    // moment") — à réactiver ici le jour où elle le redemande, sans retoucher le calcul.
    const evolution = calculerEvolutionPortefeuille(dossiers);
    const tMois = formaterTendance(evolution.ecartMois);
    const tendanceMois = `<span class="kpi-tendance" title="${evolution.actuel} aujourd'hui contre ${evolution.moisDernier} il y a un mois">${tMois.icone}${tMois.texte} vs mois dernier</span>`;
    const tuiles = [
      ['c-neutre', actifs, actifs > 1 ? 'dossiers actifs' : 'dossier actif', icone('folder', 'kpi-icone'), tendanceMois],
      ['c-urgent', urgents, 'échéances ≤ 7 jours', iconeCalendrierSeuil(7), ''],
      ['c-urgent', urgents15, 'échéances ≤ 15 jours', iconeCalendrierSeuil(15), ''],
      ['c-pret', manquantes, 'offres de prêts en attente', icone('alert-triangle', 'kpi-icone'), ''],
      ['c-pret', piecesIncompletes, 'dossiers avec pièces manquantes', icone('clipboard', 'kpi-icone'), '']
    ];
    bloc.innerHTML = tuiles.map(([cls, valeur, libelle, iconeHtml, tendance]) =>
      `<div class="kpi-tile"><div class="kpi-label">${iconeHtml}${libelle}</div><div class="kpi-num-ligne"><span class="kpi-num ${cls}">${valeur}</span>${tendance}</div></div>`
    ).join('');
  }

  // "Actions urgentes" du tableau de bord : les dossiers qui méritent une attention immédiate, au
  // même sens que le score de calculerPriorite() (voir SEUIL_PRIORITE_ELEVEE) — un seul et même
  // critère d'urgence dans tout l'outil, pas une seconde définition inventée pour le tableau de
  // bord. Seule vue restante à s'appuyer sur ce score depuis le retrait du badge "🔥 Prioritaire"
  // de la ligne de tableau (refonte visuelle, voir CLAUDE.md) : le statut "Blocage" (rouge) et ce
  // bloc couvrent déjà ce que ce badge signalait seul.
  function renderActionsUrgentes(dossiersActifs) {
    const bloc = document.getElementById('actions-urgentes');
    if (!bloc) return;
    const urgents = dossiersActifs
      .filter(d => statutDossier(d) === 'blocage' || calculerPriorite(d) >= SEUIL_PRIORITE_ELEVEE)
      .sort((a, b) => calculerPriorite(b) - calculerPriorite(a))
      .slice(0, 6);

    if (urgents.length === 0) {
      bloc.innerHTML = '<div class="actions-urgentes-vide">✓ Aucune action urgente pour le moment.</div>';
      return;
    }
    bloc.innerHTML = urgents.map(d => {
      const prochaine = prochaineEcheanceDetail(d);
      let raison;
      if (!d.sansPret && d.offrePretStatut === 'manquante') raison = "Offre de prêt introuvable";
      else if (prochaine && prochaine.jours < 0) raison = "Échéance dépassée";
      else if (prochaine) raison = `${escapeHtml(prochaine.label)} — J-${prochaine.jours}`;
      else raison = "À vérifier";
      return `
        <button type="button" class="action-urgente-ligne" onclick="ouvrirDossierDepuisDashboard('${d.id}')">
          ${renderBadgeStatut(d)}
          <span class="action-urgente-nom">${escapeHtml(d.nom)}</span>
          <span class="action-urgente-raison">${raison}</span>
          <span class="action-urgente-fleche">→</span>
        </button>`;
    }).join('');
  }

  // Ouvre un dossier depuis le tableau de bord : bascule vers le Suivi et ouvre sa fiche dans le
  // tiroir latéral, exactement comme un clic sur sa ligne (même chemin, voir ouvrirDossierDrawer).
  function ouvrirDossierDepuisDashboard(id) {
    definirOnglet('suivi');
    ouvrirDossierDrawer(id);
  }

  // Recherche de dossier depuis le tableau de bord : contrairement au Suivi (recherche-dossiers,
  // qui filtre une liste de lignes déjà affichée), le tableau de bord ne montre jamais tous les
  // dossiers — un menu de résultats s'ouvre donc sous le champ dès qu'on tape, chaque résultat
  // menant directement au tiroir du dossier via le même chemin que "Actions urgentes".
  function renderRechercheDashboard(dossiersActifs) {
    const input = document.getElementById('recherche-dashboard');
    const bloc = document.getElementById('dash-recherche-resultats');
    if (!input || !bloc) return;
    const q = normaliserPourRecherche(input.value.trim());
    if (!q) {
      bloc.style.display = 'none';
      bloc.innerHTML = '';
      return;
    }
    const resultats = dossiersActifs
      .filter(d => normaliserPourRecherche(d.nom + ' ' + (d.responsable || '')).includes(q))
      .slice(0, 8);
    bloc.innerHTML = resultats.length === 0
      ? '<div class="dash-recherche-vide">Aucun dossier ne correspond.</div>'
      : resultats.map(d => `
        <button type="button" class="dash-recherche-ligne" onclick="ouvrirDossierDepuisDashboardRecherche('${d.id}')">
          ${renderBadgeStatut(d)}
          <span class="dash-recherche-nom">${escapeHtml(d.nom)}</span>
          <span class="dash-recherche-resp">${escapeHtml(d.responsable || '')}</span>
        </button>`).join('');
    bloc.style.display = 'block';
  }

  // Vide le champ avant d'ouvrir le tiroir : sans ça, le menu de résultats resterait affiché
  // (avec la même recherche) une fois revenu sur le Tableau de bord.
  function ouvrirDossierDepuisDashboardRecherche(id) {
    const input = document.getElementById('recherche-dashboard');
    if (input) input.value = '';
    ouvrirDossierDepuisDashboard(id);
  }

  // Bascule entre les deux espaces de travail : « Nouveau dossier » (formulaire + aperçu PDF) et
  // « Suivi des dossiers » (liste complète, en pleine largeur). Choix non persisté : l'app rouvre
  // toujours sur « Nouveau dossier », cohérent avec le panneau replié/déplié qui n'est pas non
  // plus mémorisé d'une session à l'autre.
  // Les 3 étapes du formulaire "Nouveau dossier" (Importer / Vérifier / Finaliser) sont de simples
  // panneaux affichés un par un — aucune étape n'est verrouillée tant que la précédente n'est pas
  // remplie : un dossier peut toujours être créé entièrement à la main, sans jamais importer de PDF,
  // exactement comme avant ce découpage en étapes. Seule la présentation change.
  let etapeWizardActuelle = 1;
  function definirEtapeWizard(n) {
    etapeWizardActuelle = n;
    for (let i = 1; i <= 4; i++) {
      document.getElementById('wizard-step-' + i).classList.toggle('actif', i === n);
      document.getElementById('wizard-step-btn-' + i).classList.toggle('actif', i === n);
    }
    if (n === 4) majApercuPieces();
    const wrap = document.querySelector('.wrap');
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Aperçu (lecture seule) de la checklist de pièces attendue pour le type de vente choisi à
  // l'étape "Finaliser" — avant même l'enregistrement du dossier, pour que le type de vente ne
  // soit pas un choix fait à l'aveugle. Les vraies pièces ne sont vérifiées qu'une fois le dossier
  // enregistré et relié à un dossier local (voir renderPiecesDossier/verifierPiecesDossier).
  function majApercuPieces() {
    const select = document.getElementById('f-type-vente');
    const roleSelect = document.getElementById('f-role-notaire');
    const bloc = document.getElementById('pieces-apercu');
    // Relancer l'acquéreur (email + relance automatique si l'offre tarde, voir
    // relancerSiOffreManquante) reste un geste du notaire instrumentaire, celui qui reçoit l'acte
    // et porte la relation avec lui — pas de l'étude en simple participation/concours, dont le
    // suivi se limite au prêt et aux engagements du vendeur. Demandé explicitement par l'étude.
    const champEmailAcquereur = document.getElementById('champ-email-acquereur');
    if (champEmailAcquereur) {
      const estParticipant = roleSelect && roleSelect.value === 'participant';
      champEmailAcquereur.style.display = estParticipant ? 'none' : '';
      if (estParticipant) document.getElementById('f-email-acquereur').value = '';
    }
    if (!select || !bloc) return;
    // Notaire participant/concourant : l'étude ne constitue pas le dossier complet, seuls le prêt
    // et les engagements du vendeur (analyse juridique) la concernent — la checklist de pièces ne
    // s'applique qu'au notaire instrumentaire, qui reçoit l'acte.
    if (roleSelect && roleSelect.value === 'participant') {
      bloc.innerHTML = `<div class="pieces-apercu-titre">Notaire participant : pas de checklist de pièces — seuls l'offre de prêt et les engagements du vendeur seront suivis.</div>`;
      return;
    }
    const checklist = checklistPieces(select.value);
    bloc.innerHTML = `
      <div class="pieces-apercu-titre">Pièces attendues pour ce type de vente (${checklist.length}) :</div>
      <div class="pieces-liste">
        ${checklist.map(p => `<span class="piece-item inconnu"><span class="piece-icone">?</span>${escapeHtml(p.label)}</span>`).join('')}
      </div>
    `;
  }

  // Sidebar repliée hors écran sous ~900px (voir style.css) : ce bouton/scrim la fait glisser à
  // l'écran sans changer sa structure ni dupliquer la navigation pour mobile.
  function toggleSidebarMobile(forcerOuvert) {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebar-scrim');
    const ouverte = typeof forcerOuvert === 'boolean' ? forcerOuvert : !sidebar.classList.contains('ouverte');
    sidebar.classList.toggle('ouverte', ouverte);
    scrim.classList.toggle('visible', ouverte);
  }

  function definirOnglet(nom) {
    // Sur mobile, choisir une section referme la sidebar repliable (voir toggleSidebarMobile).
    toggleSidebarMobile(false);
    document.getElementById('onglet-dashboard').style.display = nom === 'dashboard' ? '' : 'none';
    document.getElementById('onglet-nouveau').style.display = nom === 'nouveau' ? '' : 'none';
    document.getElementById('onglet-suivi').style.display = nom === 'suivi' ? '' : 'none';
    document.getElementById('onglet-calculateur').style.display = nom === 'calculateur' ? '' : 'none';
    document.getElementById('onglet-prorata').style.display = nom === 'prorata' ? '' : 'none';
    document.getElementById('onglet-analyse-ia').style.display = nom === 'analyse-ia' ? '' : 'none';
    document.getElementById('onglet-reglages').style.display = nom === 'reglages' ? '' : 'none';
    document.getElementById('tab-dashboard').setAttribute('aria-selected', String(nom === 'dashboard'));
    document.getElementById('tab-nouveau').setAttribute('aria-selected', String(nom === 'nouveau'));
    document.getElementById('tab-suivi').setAttribute('aria-selected', String(nom === 'suivi'));
    document.getElementById('tab-calculateur').setAttribute('aria-selected', String(nom === 'calculateur'));
    document.getElementById('tab-prorata').setAttribute('aria-selected', String(nom === 'prorata'));
    document.getElementById('tab-analyse-ia').setAttribute('aria-selected', String(nom === 'analyse-ia'));
    document.getElementById('tab-reglages').setAttribute('aria-selected', String(nom === 'reglages'));
    document.getElementById('tab-dashboard').classList.toggle('actif', nom === 'dashboard');
    document.getElementById('tab-nouveau').classList.toggle('actif', nom === 'nouveau');
    document.getElementById('tab-suivi').classList.toggle('actif', nom === 'suivi');
    document.getElementById('tab-calculateur').classList.toggle('actif', nom === 'calculateur');
    document.getElementById('tab-prorata').classList.toggle('actif', nom === 'prorata');
    document.getElementById('tab-analyse-ia').classList.toggle('actif', nom === 'analyse-ia');
    document.getElementById('tab-reglages').classList.toggle('actif', nom === 'reglages');
    if (nom === 'suivi' || nom === 'dashboard') render();
    // Vérifiée à chaque ouverture (appel léger) plutôt qu'une fois pour toutes : Ollama a pu être
    // installé/démarré/arrêté sur le serveur depuis la dernière visite de cet onglet.
    if (nom === 'analyse-ia') verifierDisponibiliteAnalyseIa();
    // Réglages relus à chaque ouverture (un collègue a pu les modifier depuis un autre poste,
    // même principe que la disponibilité d'Ollama ci-dessus).
    if (nom === 'reglages') chargerReglages();
    // Date du jour et bornes de période posées au premier affichage seulement (voir initProrata).
    if (nom === 'prorata') initProrata();
  }

  // ==== SUIVI : regroupement des échéances par semaine ====
  //
  // Demandé par l'étude : voir la charge de travail semaine par semaine plutôt qu'une liste plate
  // de dossiers. Une ligne = UNE ÉCHÉANCE (choix explicite de l'étude), donc un même dossier peut
  // figurer sous plusieurs semaines — son échéance de prêt en semaine 40, sa signature d'acte en
  // semaine 48. C'est la charge réelle de la semaine qu'on lit, pas un simple classement des
  // dossiers.
  //
  // Tout ce bloc est PUR et déclaré en `function`/`var` : testable depuis tests/helpers/load-app.js
  // (voir la limite du harnais rappelée dans CLAUDE.md — un `const`/`let` de premier niveau y est
  // invisible).

  // Lundi de la semaine contenant cette date, au format ISO. Semaine ISO 8601 (lundi → dimanche),
  // convention française — `getDay()` renvoyant 0 pour dimanche, on le ramène à 7 avant de reculer.
  function debutSemaine(iso) {
    if (!iso) return null;
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return null;
    const jour = d.getDay() === 0 ? 7 : d.getDay();
    d.setDate(d.getDate() - (jour - 1));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Toutes les échéances ACTIVES d'un dossier, pas seulement la plus proche. Même exclusion que
  // prochaineEcheanceDetail() pour une offre de prêt déjà reçue : la condition est résolue, la
  // faire apparaître dans le planning de la semaine donnerait du travail qui n'existe plus.
  function toutesEcheances(d) {
    return [
      ...(echeanceValidee(d, 'pret') ? [] : [{ type: 'pret', label: 'Obtention du prêt', iso: d.pret }]),
      ...(echeanceValidee(d, 'acte') ? [] : [{ type: 'acte', label: "Signature de l'acte", iso: d.acte }]),
      ...(echeanceValidee(d, 'ventebien') ? [] : [{ type: 'ventebien', label: 'Vente préalable', iso: d.ventebien }]),
      ...(d.autres || []).map((a, i) => ({ type: 'autre', label: a.label, iso: a.date, index: i }))
        .filter(it => !echeanceValidee(d, 'autre-' + it.index))
    ].filter(it => it.iso);
  }

  // Nombre de semaines affichées individuellement après la semaine courante ; au-delà, tout tombe
  // dans un unique groupe "Plus tard" — sur un portefeuille d'une soixantaine de dossiers, dérouler
  // cinquante en-têtes de semaine vides jusqu'à l'échéance la plus lointaine n'aurait aucun intérêt.
  var SEMAINES_AFFICHEES = 8;

  // Regroupe les échéances de plusieurs dossiers par semaine. `aujourdHui` est injecté (jamais lu
  // depuis l'horloge ici) pour que la fonction reste pure et testable à date fixe.
  // Renvoie les groupes dans l'ordre de lecture : retard d'abord (c'est ce qui presse), puis les
  // semaines à venir, puis le reste.
  function grouperEcheancesParSemaine(liste, aujourdHui) {
    const semaineCourante = debutSemaine(aujourdHui);
    const limite = semaineCourante ? addDays(semaineCourante, SEMAINES_AFFICHEES * 7) : null;

    const groupes = new Map();
    const ajouter = (cle, rang, libelle, item) => {
      if (!groupes.has(cle)) groupes.set(cle, { cle, rang, libelle, items: [] });
      groupes.get(cle).items.push(item);
    };

    for (const d of liste) {
      // UNE SEULE échéance par dossier : la plus proche encore en attente. Demandé par l'étude —
      // la première version listait toutes les échéances d'un dossier, qui apparaissait donc sous
      // chaque semaine où il avait quelque chose, y compris pour une signature d'acte dans trois
      // mois alors que sa condition de prêt n'était pas encore levée. On ne montre que ce qu'il y a
      // à faire maintenant ; la suivante apparaît quand celle-ci est passée ou validée (voir
      // echeanceValidee / validerEcheance).
      const echeances = toutesEcheances(d).sort((x, y) => x.iso.localeCompare(y.iso));
      const e = echeances[0];
      if (!e) continue;
      const semaine = debutSemaine(e.iso);
      const item = { dossier: d, echeance: e };
      if (!semaine) continue;
      if (semaineCourante && semaine < semaineCourante) ajouter('retard', 0, 'En retard', item);
      else if (limite && semaine >= limite) ajouter('plus-tard', 2, 'Plus tard', item);
      else ajouter('s-' + semaine, 1, semaine, item);
    }

    // Tri en deux temps : le rang place retard / semaines / plus tard, puis la clé ordonne les
    // semaines entre elles (une date ISO se trie comme une chaîne).
    const ordonnes = [...groupes.values()].sort((a, b) => (a.rang - b.rang) || a.cle.localeCompare(b.cle));
    for (const g of ordonnes) {
      g.items.sort((a, b) => a.echeance.iso.localeCompare(b.echeance.iso) || a.dossier.nom.localeCompare(b.dossier.nom, 'fr'));
    }
    return ordonnes;
  }

  // Libellé lisible d'un groupe : "Semaine du 22 septembre" (l'année n'est rappelée que si elle
  // diffère de celle de la semaine courante — sur un planning à huit semaines, la répéter partout
  // n'apporte rien et allonge chaque en-tête).
  function libelleSemaine(groupe, aujourdHui) {
    if (groupe.cle === 'retard') return 'En retard';
    if (groupe.cle === 'plus-tard') return 'Plus tard';
    const debut = new Date(groupe.libelle + 'T00:00:00');
    const memeAnnee = aujourdHui && debut.getFullYear() === new Date(aujourdHui + 'T00:00:00').getFullYear();
    const options = memeAnnee ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' };
    return 'Semaine du ' + debut.toLocaleDateString('fr-FR', options);
  }

  // Ordre de gravité des statuts pour le tri "Statut" du tableau : ce qui bloque en premier, ce
  // qui est terminé en dernier. Volontairement distinct de calculerPriorite() (un score combinant
  // l'échéance et l'accès), qui répond à une autre question.
  var ORDRE_STATUT = ['blocage', 'aconfirmer', 'arelier', 'pret', 'archive'];

  // Détermine, parmi les échéances d'un dossier, la plus proche à afficher en un coup d'œil dans
  // la vue tableau (celle déjà retenue pour le tri par calculerProchaineEcheance, mais avec son
  // type/libellé/date en plus, pas seulement le nombre de jours).
  // Une échéance peut être déclarée RÉALISÉE sans être supprimée : la vente préalable de
  // l'acquéreur s'est faite, la date reste au dossier pour mémoire, mais elle ne doit plus
  // ressortir comme la prochaine chose à surveiller — exactement le rôle que joue déjà
  // `offrePretStatut === 'recue'` pour l'obtention du prêt. Demandé par l'étude pour la vente
  // préalable ; l'état est stocké par TYPE (et non sous un booléen dédié) pour que l'étendre à une
  // autre échéance ne demande rien de plus qu'un bouton.
  function echeanceValidee(d, type) {
    if (type === 'pret') return d.offrePretStatut === 'recue';
    return !!(d.echeancesValidees && d.echeancesValidees[type]);
  }

  function prochaineEcheanceDetail(d) {
    const items = [
      // Une offre déjà reçue clôt cette échéance : la garder ici referait apparaître "Obtention du
      // prêt" comme la prochaine chose à surveiller alors qu'il n'y a plus rien à y suivre — on
      // passe directement à la suivante (acte, vente préalable...), voir calculerProchaineEcheance.
      ...(echeanceValidee(d, 'pret') ? [] : [{ type: 'pret', label: 'Obtention du prêt', iso: d.pret }]),
      ...(echeanceValidee(d, 'acte') ? [] : [{ type: 'acte', label: "Signature de l'acte", iso: d.acte }]),
      ...(echeanceValidee(d, 'ventebien') ? [] : [{ type: 'ventebien', label: 'Vente préalable', iso: d.ventebien }]),
      ...(d.autres || []).map((a, i) => ({ type: 'autre', label: a.label, iso: a.date, index: i }))
        .filter(it => !echeanceValidee(d, 'autre-' + it.index))
    ].filter(it => it.iso);
    if (!items.length) return null;
    const avecJours = items.map(it => ({ ...it, jours: joursRestants(it.iso) }));
    const upcoming = avecJours.filter(it => it.jours >= 0);
    const pool = upcoming.length ? upcoming : avecJours;
    return pool.reduce((a, b) => (a.jours <= b.jours ? a : b));
  }

  // Score de priorité (plus haut = plus urgent à traiter), combinant trois signaux qu'une simple
  // date d'échéance ne capture pas : la proximité de l'échéance elle-même, l'absence d'offre de
  // prêt (bloquant pour la suite du dossier), et un accès local perdu (empêche toute vérification
  // automatique tant que personne ne clique pour le reconfirmer). Seuil SEUIL_PRIORITE_ELEVEE
  // au-delà duquel le badge "Prioritaire" s'affiche (voir renderLigneTableau).
  const SEUIL_PRIORITE_ELEVEE = 90;
  function calculerPriorite(d) {
    let score = 0;
    const prochaine = prochaineEcheanceDetail(d);
    if (prochaine) {
      // Plafonné pour qu'une échéance très lointaine (ou très dépassée) ne domine pas ce que les
      // deux autres critères ont à dire — au-delà de 60 jours ou de 30 jours de retard, l'écart
      // supplémentaire n'ajoute plus rien au score.
      const jours = Math.max(-30, Math.min(prochaine.jours, 60));
      score += (60 - jours) * 2;
    }
    if (!d.sansPret && d.offrePretStatut === 'manquante') score += 60;
    return score;
  }

  // Statut de synthèse ("où en est ce dossier ?"), distinct du score de priorité qui sert au tri :
  // celui-ci répond d'un coup d'œil plutôt que de classer.
  // dl : modificateur de couleur du composant .dot-label commun (voir style.css) ; icone :
  // uniquement pour "archive", où un point de couleur dirait "actif" alors que le dossier ne
  // l'est plus — un cadenas marque sans ambiguïté un état "hors service", pas une couleur de plus.
  const LIBELLES_STATUT = {
    pret: { texte: 'Prêt', dl: 'dl-success' },
    arelier: { texte: 'À relier', dl: 'dl-neutre' },
    aconfirmer: { texte: 'Réception de pièces', dl: 'dl-pret' },
    blocage: { texte: 'Aucun document', dl: 'dl-urgent' },
    archive: { texte: 'Archivé', dl: 'dl-neutre', icone: 'lock' }
  };
  // Logique donnée explicitement par l'étude, fondée uniquement sur les documents effectivement
  // retrouvés (offre de prêt + checklist de pièces), pas sur les échéances ni la confiance des
  // dates détectées (ces deux derniers signaux restent visibles ailleurs — bandeau "accès à
  // reconfirmer", badge "⚠️ à vérifier"/"≈ estimée" sur la date elle-même — la synthèse ne les
  // duplique plus) :
  //   🟢 vert    : toutes les pièces attendues sont trouvées — on peut signer.
  //   ⚪ gris    : rien n'a encore pu être vérifié (dossier jamais relié, ou pièces jamais
  //                recherchées) — pas un signal d'alarme, juste "pas encore su" ("À relier").
  //   🟡 orange  : une partie a été vérifiée et trouvée, il en manque encore d'autres — état
  //                intermédiaire ("Réception de pièces").
  //   🔴 rouge   : tout ce qui a été recherché a été confirmé absent ("Aucun document").
  // Un dossier jamais relié à un dossier local n'est donc plus confondu avec un dossier dont la
  // recherche a échoué : le premier est neutre (gris), le second est un vrai signal (rouge) — même
  // principe déjà appliqué à l'offre de prêt "inconnue" ailleurs dans l'outil (voir
  // renderStatsSuivi). Un dossier sans rien à vérifier (achat comptant + rôle participant, qui ne
  // suit pas la checklist de pièces) est trivialement "prêt".
  function statutDossier(d) {
    if (d.archive) return 'archive';

    // Chaque pièce attendue porte l'un de trois états — pas un simple booléen — pour distinguer
    // "jamais cherchée" de "cherchée et confirmée absente" : seul ce second cas doit compter pour
    // le rouge, le premier ne doit pas pénaliser un dossier qu'on n'a pas encore eu l'occasion de
    // vérifier (même principe déjà appliqué à l'offre de prêt "inconnue" ailleurs dans l'outil).
    const items = [];
    if (!d.sansPret) {
      items.push(d.offrePretStatut === 'recue' ? 'recue' : (d.offrePretStatut === 'manquante' ? 'manquante' : 'inconnu'));
    }
    // La checklist de pièces compte dès que le dossier a été relié au moins une fois — sur un
    // dossier jamais relié, aucune pièce n'a pu être recherchée, ce n'est pas une absence, juste
    // une vérification qui n'a pas encore eu lieu (même traitement que l'offre "inconnue"
    // ci-dessus). Elle compte AUSSI pour un dossier "sans prêt" jamais relié (`|| d.sansPret`) :
    // sans condition de prêt, cette checklist est le seul signal qui existe pour ce dossier — le
    // laisser de côté tant qu'il n'est pas relié ferait apparaître "Prêt" par défaut alors que les
    // pièces d'urbanisme restent entièrement à vérifier. Signalé par l'étude.
    if (d.roleNotaire !== 'participant' && (d.dossierLie || d.sansPret)) {
      checklistPieces(d.typeVente, d).forEach(p => items.push((d.pieces || {})[p.cle] || 'inconnu'));
    }
    if (items.length === 0 || items.every(s => s === 'recue')) return 'pret';

    const verifies = items.filter(s => s !== 'inconnu');
    if (verifies.length === 0) return 'arelier';
    if (verifies.every(s => s === 'manquante')) return 'blocage';
    return 'aconfirmer';
  }

  // « Revérifier tous les dossiers » (barre d'outils du Suivi), à la place de l'ancien bouton du
  // registre partagé — demandé par l'étude. Remplace aussi, et rend inutiles, le bandeau
  // « reconfirmer les accès », sa popup de démarrage et le bouton groupé qui les accompagnaient :
  // le NAS étant lu par le SERVEUR, il n'y a plus la moindre permission de navigateur à
  // reconfirmer (voir la section « DOSSIERS DU NAS » plus bas).
  //
  // Les dossiers sont revérifiés l'un après l'autre plutôt qu'en parallèle : chacun peut demander
  // au modèle IA local de confirmer une offre de prêt (voir confirmerOffrePretIa), et Ollama
  // sérialise de toute façon ses réponses — les lancer tous ensemble ne ferait qu'emboliser le
  // serveur sans rien accélérer.
  async function reverifierTousLesDossiers(btn) {
    const aVerifier = dossiers.filter(d => !d.archive && d.dossierLie && d.nasDossier);
    if (aVerifier.length === 0) {
      afficherToast('Aucun dossier reli\u00e9 \u00e0 un dossier du NAS pour l\u2019instant.', 'OK', null);
      return;
    }
    const texteOriginal = btn ? btn.innerHTML : '';
    if (btn) btn.disabled = true;
    try {
      for (let i = 0; i < aVerifier.length; i++) {
        if (btn) btn.innerHTML = `${icone('spinner', null, true)} ${i + 1}/${aVerifier.length}\u2026`;
        await verifierDossierLocal(aVerifier[i].id, false);
      }
      afficherToast(`${aVerifier.length} dossier${aVerifier.length > 1 ? 's' : ''} rev\u00e9rifi\u00e9${aVerifier.length > 1 ? 's' : ''} sur le NAS.`, 'OK', null);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = texteOriginal; }
      render();
    }
  }

  // Écran "À propos" (voir VERSION_APP/HISTORIQUE_VERSIONS en tête de fichier) : peuple la version
  // et l'historique à chaque ouverture plutôt qu'une fois au chargement, au cas — improbable mais
  // sans coût à couvrir — où ces libellés seraient un jour recalculés dynamiquement plutôt que de
  // simples constantes figées.
  function ouvrirAPropos() {
    const valeur = document.getElementById('apropos-version-valeur');
    if (valeur) valeur.textContent = VERSION_APP;
    const liste = document.getElementById('apropos-historique-liste');
    if (liste) {
      liste.innerHTML = HISTORIQUE_VERSIONS.map(h =>
        `<li><span class="apropos-historique-date">${escapeHtml(h.version)}</span> — ${escapeHtml(h.resume)}</li>`
      ).join('');
    }
    renderQualiteExtraction();
    const overlay = document.getElementById('apropos-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  function fermerAPropos() {
    const overlay = document.getElementById('apropos-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function renderBadgeStatut(d) {
    const s = LIBELLES_STATUT[statutDossier(d)];
    const marqueur = s.icone ? icone(s.icone) : '<span class="dot"></span>';
    return `<span class="dot-label ${s.dl}" title="Statut du dossier : ${s.texte}">${marqueur}${s.texte}</span>`;
  }

  // Notaire du vendeur / de l'acquéreur, sous l'adresse et le prix (demande explicite de l'étude).
  // Deux champs LIBRES et une liste déroulante des notaires détectés à l'import : l'acte ne dit pas
  // toujours qui représente qui, et quand il ne le dit pas on n'affecte rien — c'est l'étude qui
  // tranche. Présentés comme la grille de classification juste en dessous (libellé au-dessus du
  // champ) : deux champs voisins qu'une icône seule ne suffirait pas à distinguer, contrairement à
  // l'adresse et au prix qui ont chacun leur propre ligne pleine largeur.
  function renderNotairesDossier(d) {
    const detectes = (Array.isArray(d.notairesDetectes) ? d.notairesDetectes : []).filter(n => n && n.nom);
    const listeId = `notaires-detectes-${d.id}`;
    // Le badge « Reçoit l'acte » EST le contrôle : les sélecteurs « Rôle du notaire » et « Acte
    // reçu par » ont été retirés de la grille de classification (doublon signalé par l'étude).
    // Présent sur les deux lignes, au même endroit, pour que désigner l'un ou l'autre soit un
    // geste symétrique et que rien ne se décale à l'écran.
    const champ = (cote, libelle, valeur) => {
      const actif = d.coteInstrumentaire === cote;
      return `
      <div class="classif-champ">
        <div class="classif-champ-entete">
          <label for="not-${cote}-${d.id}">${libelle}</label>
          <button type="button" class="dot-label ${actif ? 'dl-success' : 'dl-neutre'} notaire-redacteur${actif ? ' actif' : ''}"
            onclick="basculerCoteInstrumentaire('${d.id}', '${cote}')"
            title="${actif ? 'Ce notaire reçoit l’acte. Cliquez pour retirer.' : 'Désigner ce notaire comme celui qui reçoit l’acte.'}">${actif ? icone('check') : '<span class="dot"></span>'}Reçoit l’acte</button>
        </div>
        <input type="text" id="not-${cote}-${d.id}" class="input-classif"${detectes.length ? ` list="${listeId}"` : ''} value="${escapeAttr(valeur || '')}" placeholder="Non détecté" onblur="affecterNotaire('${d.id}', '${cote}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
      </div>`;
    };

    // Rôle de l'étude : déduit dès que notre étude est reconnue d'un côté ET qu'un côté reçoit
    // l'acte (voir deduireRoleNotaireDossier) — affiché alors en simple texte, il n'y a plus rien
    // à choisir. Sinon, et seulement sinon, il reste cliquable : c'est le seul moyen de marquer un
    // dossier en participation quand l'acte ne nomme pas notre étude.
    const role = d.roleNotaire === 'participant' ? 'Participant' : 'Instrumentaire';
    const deduit = !!(coteEtudeDossier(d) && d.coteInstrumentaire);
    const ligneRole = deduit
      ? `<span class="notaire-role" title="Déduit du côté qui reçoit l’acte.">Notre étude : <strong>${role}</strong> <span class="notaire-role-source">déduit</span></span>`
      : `<button type="button" class="notaire-role notaire-role-bouton" onclick="basculerRoleEtude('${d.id}')"
           title="L’étude n’est reconnue dans aucun des deux notaires : cliquez pour changer son rôle.">Notre étude : <strong>${role}</strong> ${icone('pencil')}</button>`;

    return `
      <div class="dossier-notaires">
        <div class="dossier-classification-grid">
          ${champ('vendeur', 'Notaire du vendeur', d.notaireVendeur)}
          ${champ('acquereur', 'Notaire de l’acquéreur', d.notaireAcquereur)}
        </div>
        ${detectes.length ? `<datalist id="${listeId}">${detectes.map(n => `<option value="${escapeAttr(n.nom)}"></option>`).join('')}</datalist>` : ''}
        ${ligneRole}
      </div>`;
  }

  function render() {
    const list = document.getElementById('dossier-list');
    const count = document.getElementById('dossier-count');
    const voirArchives = document.getElementById('voir-archives').checked;
    const tri = document.getElementById('tri-dossiers').value;
    const recherche = normaliserPourRecherche(document.getElementById('recherche-dossiers').value.trim());
    const filtreResponsable = document.getElementById('filtre-responsable').value;
    const filtreOffre = document.getElementById('filtre-offre').value;
    const filtreType = document.getElementById('filtre-type').value;
    const filtreRole = document.getElementById('filtre-role').value;

    const dossiersActifs = dossiers.filter(d => !d.archive);
    renderDashboard(dossiersActifs);
    renderStatsSuivi(dossiersActifs);
    renderKpisDashboard(dossiersActifs);
    renderActionsUrgentes(dossiersActifs);
    renderRechercheDashboard(dossiersActifs);
    // Avant les retours anticipés sur liste vide ci-dessous : le tiroir doit se rafraîchir (ou se
    // refermer, si son dossier vient d'être supprimé) dans tous les cas, pas seulement quand la
    // liste a des lignes à afficher.
    renderDrawer();

    const dossiersVisibles = voirArchives ? dossiers : dossiersActifs;

    if (dossiers.length === 0) {
      count.textContent = '';
      list.innerHTML = '<div class="empty-state">Aucun dossier suivi pour le moment. Ajoutez votre premier dossier ci-dessus.</div>';
      return;
    }
    if (dossiersVisibles.length === 0) {
      count.textContent = '';
      list.innerHTML = '<div class="empty-state">Aucun dossier actif — tous vos dossiers sont archivés. Cochez « Afficher les dossiers archivés » pour les revoir.</div>';
      return;
    }

    const dossiersAffiches = dossiersVisibles.filter(d => {
      if (recherche && !normaliserPourRecherche(d.nom + ' ' + (d.responsable || '')).includes(recherche)) return false;
      if (filtreResponsable && d.responsable !== filtreResponsable) return false;
      if (filtreOffre) {
        if (d.sansPret) return false;
        if ((d.offrePretStatut || 'inconnu') !== filtreOffre) return false;
      }
      if (filtreType) {
        const prochaine = prochaineEcheanceDetail(d);
        if (!prochaine || prochaine.type !== filtreType) return false;
      }
      if (filtreRole && (d.roleNotaire || 'instrumentaire') !== filtreRole) return false;
      return true;
    });

    count.textContent = dossiersAffiches.length ? `${dossiersAffiches.length} dossier${dossiersAffiches.length > 1 ? 's' : ''}` : '';

    if (dossiersAffiches.length === 0) {
      list.innerHTML = '<div class="empty-state">Aucun dossier ne correspond à cette recherche ou ces filtres.</div>';
      return;
    }

    const tries = dossiersAffiches.slice().sort((a, b) => {
      if (tri === 'nom') return a.nom.localeCompare(b.nom, 'fr');
      if (tri === 'responsable') return (a.responsable || '').localeCompare(b.responsable || '', 'fr');
      if (tri === 'priorite') return calculerPriorite(b) - calculerPriorite(a);
      // Par gravité du statut (ce qui bloque d'abord, ce qui est terminé en dernier), puis par
      // échéance à l'intérieur d'un même statut — sans quoi l'ordre serait arbitraire entre deux
      // dossiers également bloqués.
      if (tri === 'statut') {
        const ecart = ORDRE_STATUT.indexOf(statutDossier(a)) - ORDRE_STATUT.indexOf(statutDossier(b));
        if (ecart !== 0) return ecart;
        return calculerProchaineEcheance(a) - calculerProchaineEcheance(b);
      }
      return calculerProchaineEcheance(a) - calculerProchaineEcheance(b);
    });

    // Vue "Cartes" retirée sur demande de l'étude (préférence pour la vue tableau, plus dense sur
    // un portefeuille d'une soixantaine de dossiers) : le tableau est désormais la seule vue de la
    // LISTE. La vue "Semaines" ajoutée ensuite n'est pas une troisième liste mais un regroupement
    // des mêmes dossiers par échéance — mêmes filtres, même recherche, même tiroir au clic.
    if (vueSuivi === 'semaines') {
      list.innerHTML = renderVueSemaines(tries);
      return;
    }

    const flechesTri = { nom: '', responsable: '', echeance: '' };
    flechesTri[tri] = ' <span class="tri-actif">▾</span>';
    list.innerHTML = `
      <div class="table-scroll">
        <table class="dossiers-table">
          <thead><tr>
            <th class="th-triable" onclick="definirTri('nom')">Dossier${flechesTri.nom}</th>
            <th class="th-triable" onclick="definirTri('responsable')">Responsable${flechesTri.responsable}</th>
            <th>Offre de prêt</th>
            <th class="th-triable" onclick="definirTri('echeance')">Prochaine échéance${flechesTri.echeance}</th>
          </tr></thead>
          <tbody>${tries.map(renderLigneTableau).join('')}</tbody>
        </table>
      </div>`;
  }

  // Change le tri depuis un clic sur un en-tête de colonne : répercuté sur le menu "Trier par"
  // (source unique de vérité, pas de deuxième variable d'état à garder synchronisée).
  function definirTri(critere) {
    document.getElementById('tri-dossiers').value = critere;
    render();
  }

  // Mode d'affichage de la liste du Suivi : le tableau habituel, ou le même contenu regroupé par
  // semaine d'échéance (voir renderVueSemaines). En mémoire seulement, comme le reste de l'état
  // d'affichage de cet onglet (recherche, filtres) : c'est une façon de regarder la liste à un
  // instant donné, pas une préférence à conserver d'une session à l'autre.
  // Vue par défaut : « Échéances » (le regroupement par semaine), et non le tableau plat —
  // demandé par l'étude : ce qu'on ouvre le matin, c'est la charge de travail de la semaine.
  let vueSuivi = 'semaines';

  // Identifiant du dossier affiché dans le tiroir latéral, ou null si aucun. Un seul à la fois :
  // le tiroir est une fenêtre sur LE dossier consulté, pas une liste d'éléments dépliés (c'est
  // justement ce qui remplace l'ancien Set de lignes dépliées, dont chaque ouverture décalait
  // toute la suite du tableau). Conservé en mémoire pour que render() — déclenché par la moindre
  // action de la fiche : renommer, corriger une date, revérifier l'offre... — puisse reconstruire
  // le contenu du tiroir sans le refermer sous les doigts de l'utilisateur.
  let dossierOuvert = null;
  // Formulaire d'ajout d'une échéance personnalisée (voir renderAjoutEcheance) : un seul dossier
  // est ouvert à la fois dans le tiroir, un simple booléen suffit donc — remis à false à chaque
  // ouverture/fermeture pour ne pas laisser le formulaire ouvert sur le dossier suivant consulté.
  let ajoutEcheanceOuvert = false;

  function renderLigneTableau(d) {
    const prochaine = prochaineEcheanceDetail(d);
    const offre = !d.sansPret ? statutOffreAffichage(d) : null;
    return `
      <tr class="ligne-resume${d.archive ? ' est-archive' : ''}${dossierOuvert === d.id ? ' ligne-active' : ''}" onclick="ouvrirDossierDrawer('${d.id}')">
        <td><div class="dossier-nom-tableau">${renderBadgeStatut(d)}${escapeHtml(d.nom)}</div></td>
        <td class="dossier-responsable-tableau">${escapeHtml(d.responsable || '—')}</td>
        <td>
          ${d.sansPret ? '<span class="echeance-jours calme">Comptant — sans prêt</span>' : `<span class="dot-label ${offre.dl}"><span class="dot"></span>${offre.texte}</span>`}
          ${(!d.sansPret && d.dossierLie) ? `<button type="button" class="action-rapide" onclick="event.stopPropagation(); verifierDossierLocalDepuisBouton('${d.id}', this)">Revérifier</button>` : ''}
        </td>
        <td>
          ${prochaine
            ? `<span class="dot-label dl-${prochaine.type}"><span class="dot"></span>${escapeHtml(prochaine.label)}</span>
               <span class="echeance-jours ${prochaine.jours <= 3 ? 'urgent' : 'calme'}">${formatDateFr(prochaine.iso)} (${prochaine.jours < 0 ? 'dépassée' : prochaine.jours === 0 ? "aujourd'hui" : 'J-' + prochaine.jours})</span>`
            : '<span class="echeance-jours calme">—</span>'}
        </td>
      </tr>
    `;
  }

  // Vue "Échéances" du Suivi : les mêmes dossiers (mêmes filtres, même recherche, même tiroir au
  // clic), regroupés par semaine. UNE ligne par dossier — sa prochaine échéance en attente, pas
  // toutes ses dates — voir grouperEcheancesParSemaine().
  function renderVueSemaines(liste) {
    const aujourdHui = isoAujourdHui();
    const groupes = grouperEcheancesParSemaine(liste, aujourdHui);
    if (groupes.length === 0) {
      return '<div class="empty-state">Aucune échéance en attente sur les dossiers affichés.</div>';
    }
    return groupes.map(g => {
      const lignes = g.items.map(({ dossier: d, echeance: e }) => {
        const jours = joursRestants(e.iso);
        return `
          <tr class="ligne-resume${d.archive ? ' est-archive' : ''}${dossierOuvert === d.id ? ' ligne-active' : ''}" onclick="ouvrirDossierDrawer('${d.id}')">
            <td><span class="echeance-jours ${jours <= 3 ? 'urgent' : 'calme'}">${formatDateFr(e.iso)}</span></td>
            <td><span class="dot-label dl-${e.type}"><span class="dot"></span>${escapeHtml(e.label)}</span></td>
            <td><div class="dossier-nom-tableau">${renderBadgeStatut(d)}${escapeHtml(d.nom)}</div></td>
            <td class="dossier-responsable-tableau">${escapeHtml(d.responsable || '—')}</td>
          </tr>`;
      }).join('');
      const n = g.items.length;
      return `
        <section class="semaine-groupe${g.cle === 'retard' ? ' semaine-retard' : ''}">
          <div class="semaine-entete">
            <span class="section-eyebrow">${escapeHtml(libelleSemaine(g, aujourdHui))}</span>
            <span class="semaine-compteur">${n} échéance${n > 1 ? 's' : ''}</span>
          </div>
          <div class="table-scroll">
            <!-- Largeurs de colonnes FIXES et identiques d'un groupe à l'autre : chaque semaine est
                 un <table> distinct, et en largeur automatique chacun se calait sur son propre
                 contenu — une date ou un libellé plus long dans une semaine décalait toute la
                 colonne par rapport aux semaines voisines (signalé par l'étude). -->
            <table class="dossiers-table echeances-table">
              <colgroup>
                <col class="col-echeance-date"><col class="col-echeance-type"><col><col class="col-echeance-resp">
              </colgroup>
              <tbody>${lignes}</tbody>
            </table>
          </div>
        </section>`;
    }).join('');
  }

  // Date du jour au format ISO. Isolée ici pour que les fonctions de regroupement, elles, restent
  // pures (la date leur est passée en paramètre) et donc testables à date fixe.
  function isoAujourdHui() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function definirVueSuivi(vue) {
    vueSuivi = vue === 'semaines' ? 'semaines' : 'tableau';
    document.getElementById('vue-btn-tableau').classList.toggle('actif', vueSuivi === 'tableau');
    document.getElementById('vue-btn-semaines').classList.toggle('actif', vueSuivi === 'semaines');
    render();
  }

  // Les deux passent par render() plutôt que par renderDrawer() seul : la liste doit se redessiner
  // pour poser (ou retirer) le liseré .ligne-active sur la ligne concernée, et render() rafraîchit
  // le tiroir au passage.
  function ouvrirDossierDrawer(id) {
    dossierOuvert = id;
    ajoutEcheanceOuvert = false;
    ajoutPieceOuvert = false;
    ajoutEngagementOuvert = false;
    engagementEnEdition = null;
    diagnosticParcoursOuvert = false;
    render();
  }

  function fermerDossierDrawer() {
    if (!dossierOuvert) return;
    dossierOuvert = null;
    ajoutEcheanceOuvert = false;
    ajoutPieceOuvert = false;
    ajoutEngagementOuvert = false;
    engagementEnEdition = null;
    diagnosticParcoursOuvert = false;
    render();
  }

  // Reconstruit le contenu du tiroir depuis l'état courant. Appelée par render() (pour que toute
  // action menée DANS la fiche — renommer, corriger une date, revérifier — se répercute sans
  // refermer le tiroir) autant que par l'ouverture/fermeture elles-mêmes. Un dossier supprimé ou
  // devenu invisible pendant qu'il était ouvert referme le tiroir plutôt que d'afficher un vide.
  function renderDrawer() {
    const overlay = document.getElementById('dossier-drawer-overlay');
    const contenu = document.getElementById('dossier-drawer-contenu');
    if (!overlay || !contenu) return;

    const d = dossierOuvert ? dossiers.find(x => x.id === dossierOuvert) : null;
    if (!d) {
      dossierOuvert = null;
      overlay.style.display = 'none';
      document.body.classList.remove('drawer-ouvert');
      contenu.innerHTML = '';
      return;
    }
    contenu.innerHTML = renderCarteDossier(d);
    overlay.style.display = 'flex';
    // Empêche la page derrière le tiroir de défiler en même temps que lui (sinon la molette
    // emporte la liste dès que le contenu du tiroir arrive en bout de course).
    document.body.classList.add('drawer-ouvert');
  }

  function libellePiece(statut) {
    if (statut === 'recue') return { texte: '✓', cls: 'recue', titre: 'Pièce reçue' };
    if (statut === 'manquante') return { texte: '✕', cls: 'manquante', titre: 'Pièce manquante' };
    return { texte: '?', cls: 'inconnu', titre: "Pas encore vérifié — reliez un dossier local et cliquez sur \"Revérifier les pièces\"" };
  }

  // Formulaire d'ajout d'une pièce personnalisée à la checklist (voir renderAjoutPiece) : même
  // principe qu'ajoutEcheanceOuvert pour les échéances — un seul dossier ouvert à la fois dans le
  // tiroir, un simple booléen suffit, remis à false à chaque ouverture/fermeture.
  let ajoutPieceOuvert = false;

  // Formulaire d'ajout d'une obligation du vendeur sur une fiche déjà enregistrée (voir
  // renderAjoutEngagement) : même principe que ajoutEcheanceOuvert/ajoutPieceOuvert.
  let ajoutEngagementOuvert = false;
  let diagnosticParcoursOuvert = false;

  // Édition d'un engagement du vendeur déjà présent (import OU fiche enregistrée) : un seul
  // engagement en édition à la fois (dossierId null = pendant l'import, sur
  // analyseJuridiqueActuelle ; dossierId fourni = fiche enregistrée, sur d.analyseJuridique) —
  // demandé par l'étude pour corriger une clause ajoutée via l'option de surlignage sans devoir la
  // supprimer puis la ressaisir entièrement.
  let engagementEnEdition = null;

  // Détail du dernier parcours du dossier local par dossier (voir verifierDossierLocal), pour un
  // panneau de diagnostic repliable sur la fiche (renderDiagnosticParcours) — demandé après une
  // série de bugs invisibles à l'œil (accents en Unicode NFD, ordre de parcours en profondeur...)
  // qui ont chacun nécessité une relecture complète du code pour être compris : un même panneau,
  // visible directement dans l'outil, permettrait à l'étude de voir elle-même QUELS fichiers ont
  // été lus et POURQUOI une pièce reste "manquante" (jamais rencontrée vs. rencontrée mais aucun
  // nom ne correspond), avant de solliciter un nouveau diagnostic. Volontairement **en mémoire
  // seulement** (pas dans localStorage) : c'est une aide ponctuelle sur le tout dernier parcours,
  // pas une donnée du dossier à conserver d'une session à l'autre — perdu au rechargement de la
  // page, comme `pdfActuel` pendant un import. Clé = id du dossier, valeur = objet diagnostic
  // construit par verifierDossierLocal().
  let dernierDiagnosticParcours = {};

  // Checklist de constitution du dossier (voir CLAUDE.md) : contrairement à l'analyse juridique
  // (déduite des clauses du compromis), c'est une liste fixe déterminée par le type de vente, pas
  // une extraction — un dossier peut très bien n'avoir aucune pièce reconnue sans que ce soit une
  // anomalie tant qu'il n'a pas été relié à un dossier local (statut "inconnu", pas "manquante").
  // Personnalisable pour CE dossier (voir checklistPieces) : une pièce standard non pertinente peut
  // être retirée, une pièce propre au dossier peut être ajoutée — demandé par l'étude plutôt que de
  // subir la liste standard telle quelle dans les cas particuliers.
  function renderPiecesDossier(d) {
    const checklist = checklistPieces(d.typeVente, d);
    const pieces = d.pieces || {};
    const nbRecues = checklist.filter(p => pieces[p.cle] === 'recue').length;
    const complet = checklist.length > 0 && nbRecues === checklist.length;
    const libelleType = d.typeVente === 'copropriete' ? 'copropriété' : d.typeVente === 'terrain' ? 'terrain à bâtir' : 'maison';
    return `
      <div class="pieces-dossier">
        <div class="pieces-dossier-titre">
          <span class="section-eyebrow">Pièces du dossier (${libelleType})</span>
          <span class="pieces-compteur${complet ? ' complet' : ''}">${nbRecues}/${checklist.length}</span>
          ${d.dossierLie ? `<button type="button" class="action-rapide" onclick="verifierDossierLocalDepuisBouton('${d.id}', this)">Revérifier les pièces</button>` : ''}
        </div>
        <div class="pieces-liste">
          ${checklist.map(p => {
            const s = libellePiece(pieces[p.cle] || 'inconnu');
            const boutonSuppr = `<button type="button" class="piece-suppr" onclick="${p.personnalisee ? `supprimerPiecePersonnalisee('${d.id}', '${p.cle}')` : `retirerPieceStandard('${d.id}', '${p.cle}', '${escapeOnclickArg(p.label)}')`}" title="Retirer cette pièce de la checklist de ce dossier" aria-label="Retirer cette pièce">${icone('x')}</button>`;
            // Uniquement pour une pièce STANDARD reçue (motifNom) : permet de revenir en arrière
            // après une correspondance trouvée à tort ou un fichier renommé depuis — voir
            // reinitialiserStatutPieceStandard(). Une pièce personnalisée a déjà son propre cycle
            // de statut au clic sur l'icône, pas besoin de ce bouton supplémentaire pour elle.
            const boutonReinit = (!p.personnalisee && (pieces[p.cle] || 'inconnu') === 'recue')
              ? `<button type="button" class="piece-reinit" onclick="reinitialiserStatutPieceStandard('${d.id}', '${p.cle}', '${escapeOnclickArg(p.label)}')" title="Réinitialiser (fichier renommé, ou mauvaise correspondance)" aria-label="Réinitialiser le statut de cette pièce">${icone('rotate-ccw')}</button>`
              : '';
            let contenu;
            if (p.personnalisee) {
              // Aucun motifNom (nom libre saisi par l'étude, pas de détection fiable possible) :
              // le statut se corrige à la main, mais désormais via DEUX zones de clic distinctes
              // plutôt qu'une seule sur toute la puce (demandé par l'étude) — cliquer sur l'icône
              // change le statut (basculerStatutPiecePersonnalisee), cliquer sur le texte rouvre
              // le fichier trouvé (ouvrirPieceTrouvee) une fois la pièce reçue (une recherche
              // automatique a pu la trouver, voir ajouterPiecePersonnalisee/chercherFichierParNom,
              // ou "Revérifier les pièces" ensuite) ; tant qu'elle n'est pas reçue, il n'y a pas de
              // fichier à ouvrir, le texte reste un simple libellé non cliquable.
              const estRecue = s.cls === 'recue';
              const iconeBtn = `<button type="button" class="piece-icone-btn" title="Cliquer pour changer le statut" aria-label="Changer le statut de « ${escapeAttr(p.label)} »" onclick="basculerStatutPiecePersonnalisee('${d.id}', '${p.cle}')"><span class="piece-icone">${s.texte}</span></button>`;
              const texteRendu = estRecue
                ? `<button type="button" class="piece-texte-btn" title="Cliquer pour ouvrir le fichier trouvé" onclick="ouvrirPieceTrouvee('${d.id}', '${p.cle}')">${escapeHtml(p.label)}</button>`
                : `<span class="piece-texte">${escapeHtml(p.label)}</span>`;
              contenu = `<span class="piece-label">${iconeBtn}${texteRendu}</span>`;
            } else if (s.cls === 'recue') {
              // Cliquable pour rouvrir directement le fichier local où la pièce a été trouvée.
              contenu = `<button type="button" class="piece-label" title="Cliquer pour ouvrir le fichier trouvé" onclick="ouvrirPieceTrouvee('${d.id}', '${p.cle}')"><span class="piece-icone">${s.texte}</span>${escapeHtml(p.label)}</button>`;
            } else {
              // Pièce auto-détectée depuis un engagement du compromis (voir PIECES_ENGAGEMENTS_AUTO) :
              // infobulle dédiée tant qu'elle n'est pas reçue, pour que l'étude comprenne d'où elle
              // vient sans avoir à deviner — elle n'a rien ajouté elle-même à cette checklist.
              const titre = p.autoEngagement
                ? "Détectée automatiquement : ce document est mentionné dans les engagements du vendeur de l'avant-contrat."
                : s.titre;
              contenu = `<span class="piece-label" title="${escapeAttr(titre)}"><span class="piece-icone">${s.texte}</span>${escapeHtml(p.label)}</span>`;
            }
            return `<span class="piece-item ${s.cls}">${contenu}${boutonReinit}${boutonSuppr}</span>`;
          }).join('')}
        </div>
        ${renderAjoutPiece(d)}
      </div>
    `;
  }

  function afficherFormAjoutPiece() {
    ajoutPieceOuvert = true;
    render();
  }

  function masquerFormAjoutPiece() {
    ajoutPieceOuvert = false;
    render();
  }

  function renderAjoutPiece(d) {
    if (!ajoutPieceOuvert) {
      return `<button type="button" class="action-rapide ajout-piece-btn" onclick="afficherFormAjoutPiece()">+ Ajouter une pièce</button>`;
    }
    return `
      <div class="ajout-piece-form">
        <input type="text" id="nouvelle-piece-label" placeholder="Nom de la pièce (ex. Attestation de surface loi Carrez)">
        <button type="button" class="icon-valider" onclick="ajouterPiecePersonnalisee('${d.id}')" title="Ajouter" aria-label="Ajouter la pièce">✓</button>
        <button type="button" class="icon-btn" onclick="masquerFormAjoutPiece()">Annuler</button>
      </div>
    `;
  }

  // Panneau de diagnostic du DERNIER parcours du dossier local (voir dernierDiagnosticParcours,
  // construit par verifierDossierLocal) — répond directement à une série de bugs invisibles à l'œil
  // (accents en Unicode NFD, ordre de parcours en profondeur, pièce personnalisée jamais
  // rerecherchée...) qui ont chacun nécessité une relecture complète du code pour être compris :
  // l'étude peut désormais voir elle-même quels fichiers ont été lus et pourquoi une pièce reste
  // "manquante" (jamais rencontrée vs. rencontrée mais aucun nom ne correspond), avant de solliciter
  // un nouveau diagnostic. Repliable et FERMÉ par défaut (voir .diagnostic-parcours dans style.css) :
  // c'est un outil de dépannage ponctuel, pas un suivi actif comme les pièces/l'analyse juridique.
  // N'affiche rien tant qu'aucun parcours n'a eu lieu depuis l'ouverture de la page (état en
  // mémoire uniquement, jamais persisté — voir dernierDiagnosticParcours).
  // Trace, en lecture seule, de ce que l'extraction avait compris de l'acte au moment de l'import
  // (voir instantaneExtraction). Volontairement REPLIÉ par défaut, contrairement à l'analyse
  // juridique ou aux pièces : ce n'est pas un suivi actif mais une explication à consulter quand
  // une donnée du dossier surprend — « d'où sort cette date ? est-ce que l'outil en était sûr ? ».
  // Rien n'y est modifiable : les corrections se font dans les champs de la fiche, comme avant.
  var LIBELLES_TYPE_ACTE = {
    COMPROMIS_DE_VENTE: 'Compromis de vente',
    PROMESSE_DE_VENTE: 'Promesse de vente',
    PROMESSE_D_ACHAT: 'Promesse d’achat',
    AUTRE: 'Autre acte',
    INCONNU: 'Type non déterminé'
  };

  function renderExtractionDossier(d) {
    const extraction = d.extraction;
    const typeActe = d.typeActe;
    const parties = Array.isArray(d.parties) ? d.parties : [];
    const notaires = d.notaires;
    if (!extraction && !typeActe && parties.length === 0 && !notaires) return '';

    // Même vocabulaire que le panneau d'import (voir origineRevision) : l'outil dit d'où vient la
    // donnée, il ne prétend pas la confirmer. `renseigne` remplace la valeur, qui n'est pas
    // recopiée dans l'instantané — sans lui, tout serait affiché « Non trouvée ».
    const badgeOrigine = (etat) => {
      const o = origineRevision(etat ? Object.assign({}, etat, { valeur: etat.renseigne === false ? null : (etat.valeur || 'x') }) : null);
      return `<span class="dot-label ${o.dl}">${o.icone ? icone(o.icone) : '<span class="dot"></span>'}${escapeHtml(o.texte)}</span>`;
    };
    const blocs = [];

    if (typeActe) {
      blocs.push(`<div class="extraction-ligne"><span class="extraction-libelle">Type d’acte</span>
        <span>${escapeHtml(LIBELLES_TYPE_ACTE[typeActe.valeur] || typeActe.valeur)}</span>${badgeOrigine(typeActe)}</div>`);
    }
    if (parties.length > 0) {
      blocs.push(`<div class="extraction-ligne"><span class="extraction-libelle">Parties</span>
        <span>${parties.map(p => `${escapeHtml(p.nom)} <em>(${p.role === 'VENDEUR' ? 'vendeur' : 'acquéreur'}${p.qualiteActe ? ', désigné « ' + escapeHtml(p.qualiteActe) + ' »' : ''})</em>`).join(' · ')}</span></div>`);
    }
    if (notaires && (notaires.instrumentaire || notaires.participant)) {
      const nom = (n) => n ? `${escapeHtml(n.nom)}${n.office ? ' (' + escapeHtml(n.office) + ')' : ''}` : '—';
      blocs.push(`<div class="extraction-ligne"><span class="extraction-libelle">Notaires</span>
        <span>Reçoit l’acte : ${nom(notaires.instrumentaire)}${notaires.participant ? ` · Participant : ${nom(notaires.participant)}` : ''}</span>${badgeOrigine({ statut: notaires.statut, origine: notaires.origine, verifie: notaires.verifie, renseigne: true })}</div>`);
    }
    const cadastre = d.bien && d.bien.cadastre;
    if (cadastre && cadastre.section) {
      blocs.push(`<div class="extraction-ligne"><span class="extraction-libelle">Cadastre</span>
        <span>Section ${escapeHtml(cadastre.section)}${cadastre.numero ? ' n° ' + escapeHtml(cadastre.numero) : ''}</span></div>`);
    }

    const LIBELLES_CHAMP_EXTRACTION = {
      nom: 'Nom du dossier', prixVente: 'Prix de vente', emailAcquereur: 'Email de l’acquéreur',
      adresseBien: 'Adresse du bien', pret: 'Obtention du prêt', acte: 'Signature de l’acte',
      ventebien: 'Vente préalable', typeVente: 'Type de vente'
    };
    const champs = (extraction && extraction.champs) || {};
    const lignesChamps = Object.keys(champs)
      .filter(cle => LIBELLES_CHAMP_EXTRACTION[cle])
      .map(cle => `<div class="extraction-ligne"><span class="extraction-libelle">${LIBELLES_CHAMP_EXTRACTION[cle]}</span>
        <span>${champs[cle].page ? `p.${champs[cle].page}` : '—'}</span>${badgeOrigine(champs[cle])}</div>`)
      .join('');

    const alertes = ((extraction && extraction.alertes) || []).map(a =>
      `<div class="revision-alerte ${a.gravite === 'critique' ? 'critique' : ''}">${icone('alert-triangle')}<span>${escapeHtml(a.message)}</span></div>`
    ).join('');

    return `
      <details class="extraction-dossier">
        <summary><span class="section-eyebrow">Ce que l’outil avait compris de l’acte</span></summary>
        <div class="extraction-corps">
          ${alertes}
          ${blocs.join('')}
          ${lignesChamps}
          <p class="hint">Relevé au moment de l’import, à titre d’explication : les valeurs enregistrées restent celles des champs ci-dessus, modifiables à tout moment.</p>
        </div>
      </details>
    `;
  }

  // Bug corrigé : ce panneau se refermait tout seul. `render()` reconstruit le tiroir à chaque
  // action (revérifier une pièce, corriger une date…) et le `<details>` repartait donc fermé, en
  // plein milieu de la lecture du journal. Son état est désormais mémorisé, comme celui du tiroir
  // lui-même (`dossierOuvert`) — un seul dossier étant ouvert à la fois, un booléen suffit.
  // Remis à `false` à l'ouverture/fermeture du tiroir : le diagnostic d'un dossier ne présume pas
  // de l'intérêt qu'on porte à celui du suivant.
  function basculerDiagnosticParcours(ouvert) {
    diagnosticParcoursOuvert = !!ouvert;
  }

  function renderDiagnosticParcours(d) {
    const diag = dernierDiagnosticParcours[d.id];
    if (!diag) return '';
    const ouvert = diagnosticParcoursOuvert ? ' open' : '';
    const heure = new Date(diag.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (diag.resume.erreur) {
      return `
        <details class="diagnostic-parcours"${ouvert} ontoggle="basculerDiagnosticParcours(this.open)">
          <summary><span class="section-eyebrow">Diagnostic du dernier parcours (${heure})</span></summary>
          <div class="diagnostic-corps"><p class="diagnostic-erreur">${escapeHtml(diag.resume.erreur)}</p></div>
        </details>
      `;
    }
    const r = diag.resume;
    const lignesResume = [];
    lignesResume.push(`${r.nbFichiersRencontres} fichier${r.nbFichiersRencontres > 1 ? 's' : ''} PDF rencontré${r.nbFichiersRencontres > 1 ? 's' : ''} (sous-dossiers compris), ${r.nbAnalyses} ouvert${r.nbAnalyses > 1 ? 's' : ''} pour lire son contenu.`);
    if (r.offre) {
      lignesResume.push(`Offre de prêt : ${!r.offre.trouvee
        ? `aucun PDF d'au moins ${MIN_PAGES_OFFRE_PRET} pages dont le NOM ou le titre de la page de garde évoque une offre de prêt (ou une variante : offre de crédit, contrat de prêt…) — le détail fichier par fichier est ci-dessous.`
        : r.offre.aConfirmer
          ? `page de garde reconnue (${escapeHtml(r.offre.fichier)}), <strong>à confirmer</strong> : le modèle local n'a pas pu la vérifier.`
          : `reconnue et confirmée (${escapeHtml(r.offre.fichier)})`}`);
    }
    if (r.pieces) {
      lignesResume.push(`${r.pieces.trouvees}/${r.pieces.total} pièce(s) reconnue(s)${r.pieces.manquantes.length ? ' — manquante(s) : ' + r.pieces.manquantes.map(escapeHtml).join(', ') + '.' : '.'}`);
    }
    return `
      <details class="diagnostic-parcours"${ouvert} ontoggle="basculerDiagnosticParcours(this.open)">
        <summary><span class="section-eyebrow">Diagnostic du dernier parcours (${heure})</span></summary>
        <div class="diagnostic-corps">
          <ul class="diagnostic-resume">${lignesResume.map(l => `<li>${l}</li>`).join('')}</ul>
          ${diag.journal.length
            ? `<ul class="diagnostic-journal">${diag.journal.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
            : '<p class="diagnostic-vide">Aucune correspondance par nom, ni lecture de contenu, lors de ce parcours.</p>'}
        </div>
      </details>
    `;
  }

  // Ajoutée avec une clé unique générée ici (pas un index de tableau, contrairement à d.autres) :
  // une pièce personnalisée peut être retirée sans décaler le statut des autres, qui restent
  // repérées par leur propre clé stable plutôt que par leur position dans la liste.
  // Cherche, parmi les PDF du dossier NAS relié, le premier dont le nom contient le texte donné
  // (sous-chaîne, insensible à la casse, sur le nom normalisé — voir normaliserNomPourMotif) :
  // utilisée au moment d'ajouter une pièce personnalisée (voir ajouterPiecePersonnalisee), pour ne
  // pas obliger l'étude à écrire un motifNom qu'elle n'a de toute façon pas les moyens d'écrire —
  // le nom qu'elle tape pour la pièce sert directement de motif de recherche. Le texte cherché est
  // normalisé comme les noms auxquels il est comparé : sans ça, un nom de fichier exact contenant
  // des underscores ne matcherait jamais.
  async function chercherFichierParNom(d, texteRecherche) {
    const cible = normaliserNomPourMotif(texteRecherche).toLowerCase();
    const fichiers = await listerFichiersNas(d);
    return fichiers.find(f => normaliserNomPourMotif(f.nom).toLowerCase().includes(cible)) || null;
  }

  async function ajouterPiecePersonnalisee(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const input = document.getElementById('nouvelle-piece-label');
    const label = input ? input.value.trim() : '';
    if (!label) { if (input) input.focus(); return; }
    d.piecesPersonnalisees = d.piecesPersonnalisees || [];
    const cle = 'perso-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    d.piecesPersonnalisees.push({ cle, label });
    ajouterHistorique(d, `Pièce ajoutée à la checklist : « ${label} »`);
    ajoutPieceOuvert = false;
    sauvegarder(d);
    render();

    // Recherche automatique dans le dossier NAS déjà relié, s'il y en a un. Plus aucune permission
    // à vérifier depuis que le serveur lit le NAS : si le dossier est relié, il est lisible.
    // Silencieuse en cas d'échec — la pièce reste simplement « à vérifier », cas normal quand on
    // tape un nom avant même d'avoir le document.
    if (d.dossierLie && d.nasDossier) {
      try {
        const trouve = await chercherFichierParNom(d, label);
        if (trouve) {
          d.pieces = d.pieces || {};
          d.pieces[cle] = 'recue';
          memoriserFichierTrouve(d, NAS_CLE_PIECE(cle), cheminNasComplet(d, trouve.chemin));
          sauvegarder(d);
          render();
          afficherToast(`Pi\u00e8ce \u00ab\u00a0${label}\u00a0\u00bb trouv\u00e9e : ${trouve.nom}`, 'OK', null);
        }
      } catch (e) {
        console.error('Recherche automatique de la pièce personnalisée impossible', e);
      }
    }
  }

  function supprimerPiecePersonnalisee(dossierId, cle) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.piecesPersonnalisees) return;
    const item = d.piecesPersonnalisees.find(p => p.cle === cle);
    if (!item) return;
    demanderConfirmation(`Retirer la pièce « ${item.label} » de la checklist de ce dossier ?`, () => {
      d.piecesPersonnalisees = d.piecesPersonnalisees.filter(p => p.cle !== cle);
      if (d.pieces) delete d.pieces[cle];
      ajouterHistorique(d, `Pièce retirée de la checklist : « ${item.label} »`);
      sauvegarder(d);
      render();
    });
  }

  // Signalé par l'étude : une pièce standard reconnue automatiquement (motifNom) par erreur, ou
  // dont le fichier a ensuite été renommé (le vrai document ne correspond alors plus au nom
  // mémorisé), restait bloquée "reçue" indéfiniment — verifierDossierLocal() ne recherche que les
  // pièces PAS déjà "recue" (voir `aChercher`), donc "Revérifier" n'y touchait plus jamais. Remet
  // la pièce à "manquante" (repasse dans `aChercher` au prochain parcours) et efface le handle
  // mémorisé du fichier trouvé à tort (même mécanisme que lierDossierLocal() qui l'efface déjà à
  // chaque nouvelle liaison de dossier) — sans quoi le bouton "ouvrir le fichier trouvé"
  // continuerait de rouvrir l'ancien fichier le temps qu'une nouvelle correspondance soit trouvée.
  // Uniquement pour une pièce à motifNom (reconnue automatiquement) : une pièce personnalisée a
  // déjà son propre cycle de statut au clic (basculerStatutPiecePersonnalisee), pas besoin de ce
  // bouton pour elle.
  function reinitialiserStatutPieceStandard(dossierId, cle, label) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    demanderConfirmation(`Réinitialiser le statut de « ${label} » ? Elle repassera à "manquante" et sera recherchée à nouveau au prochain "Revérifier". Ce nom de fichier ne sera plus jamais proposé pour cette pièce, sur aucun dossier.`, async () => {
      d.pieces = d.pieces || {};
      d.pieces[cle] = 'manquante';
      // Apprentissage de l'erreur (voir exclureNomPourPiece ci-dessus) : avant d'effacer le chemin
      // mémorisé, on retrouve le nom du fichier mal reconnu pour ne plus jamais le reproposer pour
      // CETTE pièce, sur AUCUN dossier — portée choisie explicitement par l'étude, plus large
      // qu'une simple exclusion propre à ce seul dossier.
      const ancienChemin = fichierTrouve(d, NAS_CLE_PIECE(cle));
      if (ancienChemin) {
        exclureNomPourPiece(cle, normaliserNomPourMotif(ancienChemin.split('/').pop()));
      }
      memoriserFichierTrouve(d, NAS_CLE_PIECE(cle), null);
      ajouterHistorique(d, `Pièce réinitialisée (correspondance retirée) : « ${label} »`);
      sauvegarder(d);
      render();
    });
  }

  // Une pièce STANDARD ne peut pas être supprimée des listes PIECES_* (partagées par tous les
  // dossiers du même type de vente) : la "retirer" pour ce dossier précis l'ajoute simplement à
  // d.piecesRetirees, qui la masque de checklistPieces() pour ce seul dossier — voir son
  // historique dans CLAUDE.md.
  function retirerPieceStandard(dossierId, cle, label) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    demanderConfirmation(`Retirer la pièce « ${label} » de la checklist de ce dossier ?`, () => {
      d.piecesRetirees = d.piecesRetirees || [];
      if (!d.piecesRetirees.includes(cle)) d.piecesRetirees.push(cle);
      ajouterHistorique(d, `Pièce retirée de la checklist : « ${label} »`);
      sauvegarder(d);
      render();
    });
  }

  // Retire un engagement du vendeur de l'analyse juridique d'un dossier DÉJÀ ENREGISTRÉ (voir
  // renderEngagement/renderCarteDossier) — demandé par l'étude : jusqu'ici seuls les engagements
  // ajoutés à la main pendant l'import étaient retirables (supprimerEngagementManuel), et
  // seulement pendant l'import. Confirmation + entrée d'historique, comme retirerPieceStandard()
  // ci-dessus : contrairement à un retrait pendant l'import (réversible en réimportant le PDF),
  // c'est ici une modification d'un dossier déjà sauvegardé.
  function supprimerEngagementDossier(dossierId, index) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.analyseJuridique || !d.analyseJuridique.engagements[index]) return;
    const e = d.analyseJuridique.engagements[index];
    const phrase = typeof e === 'string' ? e : e.phrase;
    demanderConfirmation('Retirer cet engagement du vendeur de l’analyse juridique ?', () => {
      d.analyseJuridique.engagements.splice(index, 1);
      ajouterHistorique(d, `Engagement du vendeur retiré de l'analyse : « ${phrase.slice(0, 80)} »`);
      sauvegarder(d);
      render();
    });
  }

  // Pendant du précédent pour un document identifié (voir renderDocBadge) — nouvelle capacité,
  // rien n'était retirable de cette liste jusqu'ici, ni à l'import ni sur une fiche enregistrée.
  // Volontairement découplé de la checklist de pièces du dossier (d.piecesEngagementsDetectees) :
  // ce n'est qu'une liste d'affichage de l'analyse, pas la checklist elle-même, qui a déjà son
  // propre mécanisme de retrait (retirerPieceStandard()/croix sur .piece-item).
  function supprimerDocumentDossier(dossierId, index) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.analyseJuridique || !d.analyseJuridique.documents[index]) return;
    const doc = d.analyseJuridique.documents[index];
    const label = typeof doc === 'string' ? doc : doc.label;
    demanderConfirmation(`Retirer « ${label} » de la liste des documents identifiés ?`, () => {
      d.analyseJuridique.documents.splice(index, 1);
      ajouterHistorique(d, `Document retiré de l'analyse juridique : « ${label} »`);
      sauvegarder(d);
      render();
    });
  }

  // Cycle inconnu → manquante → reçue → inconnu, sans entrée d'historique (une simple case à
  // cocher répétée n'a pas besoin d'être journalisée, contrairement à un changement structurel du
  // dossier) — seul mécanisme de mise à jour possible pour une pièce personnalisée, qui n'a pas de
  // motifNom permettant une détection automatique dans le dossier local.
  function basculerStatutPiecePersonnalisee(dossierId, cle) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    d.pieces = d.pieces || {};
    const actuel = d.pieces[cle] || 'inconnu';
    d.pieces[cle] = actuel === 'inconnu' ? 'manquante' : actuel === 'manquante' ? 'recue' : 'inconnu';
    sauvegarder(d);
    render();
  }

  function renderCarteDossier(d) {
      const confiance = d.confiance || {};
      const historique = d.historique || [];
      const analyse = d.analyseJuridique || { documents: [], engagements: [], conditions: [] };
      const analyseConditions = analyse.conditions || [];
      // "Ouvrir le compromis" et "Changer de dossier"/"Lier un dossier local" reprennent tous les
      // deux le design de "+ Ajouter une pièce" (.action-rapide) — demandé par l'étude, cohérent
      // avec les autres actions rapides de la fiche (Revérifier...) plutôt que l'ancien style de
      // lien souligné (.lien-dossier-local, retiré). Voir ouvrirCompromisTrouve() : contrairement
      // à l'offre/aux pièces, ce document n'est cherché qu'à la demande, pas par
      // verifierDossierLocal() (le compromis n'est pas une pièce de la checklist).
      // L'infobulle nomme le fichier réellement importé à la création : c'est lui qui sera rouvert,
      // et le voir sans cliquer permet de repérer tout de suite un avant-contrat mal rattaché.
      const titreOuvrirCompromis = d.compromisNomFichier
        ? `Ouvrir « ${d.compromisNomFichier} », le fichier importé à la création du dossier`
        : "Rechercher et ouvrir l'avant-contrat dans le dossier NAS relié (aucun nom de fichier mémorisé pour ce dossier)";
      const boutonOuvrirCompromis = `<button type="button" class="action-rapide" onclick="ouvrirCompromisTrouve('${d.id}', this)" title="${escapeAttr(titreOuvrirCompromis)}">${icone('file-text')} Ouvrir le compromis</button>`;
      // Le nom du dossier NAS relié est affiché dans l'infobulle : le vérifier ne doit pas demander
      // d'ouvrir la fenêtre de choix.
      const boutonsDossierLocal = d.dossierLie
          ? `<button type="button" class="action-rapide" onclick="changerDossierLocal('${d.id}')" title="${escapeAttr('Dossier NAS relié : ' + (d.nasDossier || '—'))}">Changer de dossier</button>`
          // Même sans prêt (achat comptant), le dossier NAS reste nécessaire pour suivre
          // la checklist de pièces (urbanisme...) — voir renderPiecesDossier ci-dessous.
          : `<button type="button" class="action-rapide" onclick="lierDossierLocal('${d.id}')">${icone('link')} Relier un dossier du NAS</button>`;
      // Statut de l'offre sous la date de la carte "Obtention du prêt" (voir renderTab, paramètre
      // offreBloc). Une puce de couleur plutôt qu'une phrase : le décompte juste au-dessus dit déjà
      // "✓ Offre reçue" en toutes lettres, la puce ne fait que confirmer d'un coup d'œil sans
      // répéter — c'est ce doublon de phrases qui avait été signalé. Même texte/couleur que le
      // badge équivalent de la ligne de tableau (voir statutOffreAffichage) : les deux affichent le
      // même fait, ils le disent maintenant de la même façon.
      // Affiché même quand aucun dossier local n'est relié : c'est justement là qu'il faut proposer
      // de le relier, sans quoi la carte ne dit rien de l'offre et n'offre aucun moyen d'agir.
      const offreStatut = statutOffreAffichage(d);
      // Un fichier a été retenu (et son chemin mémorisé) aussi bien pour "reçue" que pour
      // "à confirmer" : dans les deux cas il y a quelque chose à ouvrir — c'est justement en
      // l'ouvrant que l'étude tranche le second cas.
      const offreOuvrable = d.dossierLie && (d.offrePretStatut === 'recue' || d.offrePretStatut === 'aconfirmer');
      // Garanties du prêt lues dans l'offre (caution, hypothèque légale de prêteur de deniers,
      // hypothèque conventionnelle — plusieurs possibles) : affichées ici, dans la carte
      // "Obtention du prêt", emplacement choisi par l'étude.
      const garanties = libellesGarantiesPret(d.garantiesPret);
      const garantiesBloc = garanties.length
        ? `<div class="tab-garanties" title="Garantie(s) relevée(s) dans l’offre de prêt">${icone('key')} ${garanties.map(escapeHtml).join(' · ')}</div>`
        : '';
      const offreBloc = !d.sansPret ? `
        <div class="tab-offre-pret">
          ${offreOuvrable
              ? `<button type="button" class="dot-label ${offreStatut.dl}" title="${d.offrePretStatut === 'recue' ? 'Offre de prêt reçue — cliquer pour ouvrir le fichier trouvé' : 'Document trouvé mais non confirmé — cliquer pour l’ouvrir et vérifier'}" onclick="ouvrirOffreTrouvee('${d.id}')"><span class="dot"></span>${d.offrePretStatut === 'recue' ? 'Ouvrir le fichier' : 'À confirmer — ouvrir'}</button>`
              : `<span class="dot-label ${offreStatut.dl}" title="${d.dossierLie ? escapeAttr(offreStatut.texte) : 'Aucun dossier du NAS relié : l’offre n’a pas encore pu être cherchée'}"><span class="dot"></span>${offreStatut.texte}</span>`}
          ${d.dossierLie
              ? `<button type="button" class="lien-dossier-local" onclick="verifierDossierLocalDepuisBouton('${d.id}', this)">Revérifier</button>`
              : `<button type="button" class="lien-dossier-local" onclick="lierDossierLocal('${d.id}')">${icone('link')} Relier un dossier du NAS</button>`}
        </div>${garantiesBloc}` : '';
      return `
      <div class="dossier${d.archive ? ' est-archive' : ''}">
        <div class="dossier-head">
          <!-- Badge de statut + Archiver/Supprimer regroupés sur une même ligne, en tête de fiche
               (repris d'une maquette fournie par l'étude, recolorée avec nos propres tokens — pas
               la palette indigo/violette de la maquette). Auparavant le badge vivait dans le nom
               et Archiver/Supprimer sur le côté opposé de la fiche : rassemblés ici, plus rien à
               regarder à deux endroits différents pour savoir où en est le dossier et agir dessus. -->
          <div class="dossier-head-barre">
            ${renderBadgeStatut(d)}
            <button class="icon-btn" onclick="archiverDossier('${d.id}', ${!d.archive})">${d.archive ? 'Désarchiver' : 'Archiver'}</button>
            <button class="icon-btn" onclick="supprimerDossier('${d.id}')">Supprimer</button>
          </div>
          <div class="nom-dossier">
            <span class="nom-affichage" id="nom-affichage-${d.id}">
              <span class="nom-texte">${escapeHtml(d.nom)}</span>
              <button type="button" class="icon-crayon" onclick="activerEditionNom('${d.id}')" title="Modifier le nom" aria-label="Modifier le nom">${icone('pencil')}</button>
            </span>
            <span class="nom-edition" id="nom-edition-${d.id}" hidden>
              <input type="text" class="dossier-nom-input" id="nom-input-${d.id}" value="${escapeAttr(d.nom)}" aria-label="Nom du dossier" onkeydown="if(event.key==='Enter'){event.preventDefault();validerEditionNom('${d.id}');}else if(event.key==='Escape'){annulerEditionNom('${d.id}');}">
              <button type="button" class="icon-valider" onclick="validerEditionNom('${d.id}')" title="Valider" aria-label="Valider le nom">✓</button>
            </span>
          </div>
          <!-- Sur sa propre ligne, séparée de .nom-affichage : mélangée au nom (voir historique
               de ce fichier), sa position dépendait de la longueur du nom — tantôt collée à côté,
               tantôt repoussée à la ligne suivante selon l'espace restant. Signalé par l'étude
               ("se balade"). Ici, toujours au même endroit, quel que soit le nom du dossier. -->
          ${boutonsDossierLocal ? `<div class="dossier-lien-local-ligne">${boutonOuvrirCompromis}${boutonsDossierLocal}</div>` : ''}

          <div class="dossier-head-divider"></div>

          <!-- Adresse/prix : une ligne icône + champ chacun, plutôt que mêlés à la grille de
               classification en dessous — assez de place sur leur propre ligne pour qu'une icône
               seule (sans libellé texte) reste lisible, contrairement à la ligne de classification
               ci-dessous où plusieurs champs se partagent l'espace. -->
          <div class="dossier-adresse-prix">
            <div class="dossier-info-ligne">
              ${icone('map-pin')}
              <input type="text" class="input-inline champ-adresse-bien" value="${escapeAttr(d.adresseBien || '')}" placeholder="Adresse non détectée" aria-label="Adresse du bien" onblur="changerAdresseBien('${d.id}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
            </div>
            <div class="dossier-info-ligne">
              ${icone('banknote')}
              <input type="text" class="input-inline champ-prix-vente" value="${d.prixVente ? formaterPrix(d.prixVente) : ''}" placeholder="Prix non détecté" aria-label="Prix de vente" onblur="changerPrixVente('${d.id}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
            </div>
          </div>

          <div class="dossier-head-divider"></div>

          ${renderNotairesDossier(d)}

          <div class="dossier-head-divider"></div>

          <!-- Type de vente / Rôle du notaire / Responsable : grille avec libellé au-dessus du
               champ (plutôt que libellé + <select> en ligne, ancien style .select-edit) — reprend
               la présentation de la maquette fournie, plus lisible qu'une ligne de libellés et de
               champs mélangés qui se repliait sur plusieurs lignes inégales dans la largeur du
               tiroir. -->
          <div class="dossier-classification-grid">
            <div class="classif-champ">
              <label for="tv-${d.id}">Type de vente</label>
              <select id="tv-${d.id}" class="select-classif" onchange="changerTypeVente('${d.id}', this.value)">
                <option value="maison" ${d.typeVente === 'maison' || !d.typeVente ? 'selected' : ''}>Maison</option>
                <option value="copropriete" ${d.typeVente === 'copropriete' ? 'selected' : ''}>Copropriété</option>
                <option value="terrain" ${d.typeVente === 'terrain' ? 'selected' : ''}>Terrain à bâtir</option>
              </select>
            </div>
            <!-- « Rôle du notaire » et « Acte reçu par » ont été retirés d'ici : les deux
                 faisaient doublon avec le bloc notaires juste au-dessus, où le badge « Reçoit
                 l'acte » porte désormais l'action et où le rôle de l'étude est déduit
                 (voir renderNotairesDossier/deduireRoleNotaireDossier). -->
            <div class="classif-champ">
              <label for="resp-${d.id}">Responsable</label>
              <select id="resp-${d.id}" class="select-classif" onchange="changerResponsable('${d.id}', this.value)">
                <option value="" ${d.responsable ? '' : 'selected'}>— À définir —</option>
                <option ${d.responsable === 'Bastien ANGLUMENT' ? 'selected' : ''}>Bastien ANGLUMENT</option>
                <option ${d.responsable === 'Julie VASSELIN' ? 'selected' : ''}>Julie VASSELIN</option>
                <option ${d.responsable === 'Jérémy SAUJOT' ? 'selected' : ''}>Jérémy SAUJOT</option>
              </select>
            </div>
          </div>

          ${d.sansPret ? `<span class="dot-label dl-pret badge-cash">${icone('banknote')}Achat comptant — sans prêt</span>` : ''}
          ${(!d.sansPret && d.offrePretStatut === 'recue' && calculerApport(d)) ? (() => {
            const apport = calculerApport(d);
            return `<div class="addr apport-ligne">
              <span class="apport-cercle apport-${apport.niveau}"></span>
              Apport estimé : <strong>${formaterPrix(apport.montant)}</strong> (${apport.pourcentage}% du prix de ${formaterPrix(d.prixVente)}, prêt de ${formaterPrix(d.montantPret)})
            </div>`;
          })() : ''}
        </div>
        <div class="dossier-body">
        <div class="tabs">
          ${renderTab('pret', 'Obtention du prêt', d.pret, d.id, d.pretPage, confiance.pret, null, d.offrePretStatut === 'recue', offreBloc, d.sansPret)}
          ${renderTab('acte', 'Signature de l\u2019acte', d.acte, d.id, d.actePage, confiance.acte)}
          ${d.ventebien ? renderTab('ventebien', 'Vente préalable', d.ventebien, d.id, d.ventebienPage, confiance.ventebien, null, false, '', false, echeanceValidee(d, 'ventebien')) : ''}
          ${(d.autres || []).map((a, i) => renderTab('autre', escapeHtml(a.label), a.date, d.id, a.page, null, i)).join('')}
        </div>
        ${renderAjoutEcheance(d)}
        ${d.roleNotaire !== 'participant' ? renderPiecesDossier(d) : ''}
        ${renderDiagnosticParcours(d)}
        ${(analyse.documents.length > 0 || analyse.engagements.length > 0 || analyseConditions.length > 0) ? `
          <details class="analyse-juridique analyse-repliable" style="margin-top:14px;" open>
            <summary class="analyse-titre">Analyse juridique du compromis</summary>
            ${analyseConditions.length > 0 ? `
              <div class="analyse-section">
                <div class="analyse-sous-titre">Conditions suspensives et particulières <span class="analyse-compteur">${analyseConditions.length}</span></div>
                ${analyseConditions.map(renderCondition).join('')}
              </div>
            ` : ''}
            ${analyse.engagements.length > 0 ? `
              <div class="analyse-section">
                <div class="analyse-sous-titre">Engagements du vendeur <span class="analyse-compteur">${analyse.engagements.length}</span></div>
                ${analyse.engagements.map((e, i) => renderEngagement(e, i, d.id)).join('')}
              </div>
            ` : ''}
            <div class="analyse-section">
              <div class="analyse-sous-titre">Documents et pièces identifiés <span class="analyse-compteur">${analyse.documents.length}</span></div>
              <div class="analyse-documents-liste">
                ${analyse.documents.length > 0
                  ? analyse.documents.map((doc, i) => renderDocBadge(doc, i, d.id)).join('')
                  : '<span class="analyse-vide">Aucun document type reconnu automatiquement.</span>'}
              </div>
            </div>
          </details>
        ` : ''}
        ${renderAjoutEngagement(d)}
        ${renderExtractionDossier(d)}
        ${renderRelancesCiblees(d)}
        <!-- Libellés volontairement courts (l'intitulé complet reste en infobulle) : l'étude veut
             ces actions sur une seule ligne, ce que "Télécharger les rappels (.ics)" et son voisin
             ne permettaient pas dans la largeur du tiroir. Le rappel par email générique
             ("Rappel email") a été retiré définitivement : les rappels automatiques vers Teams
             (voir jobs/rappels.js), avec copie systématique à l'étude, le remplacent. -->
        <div class="dossier-actions">
          <button onclick="telechargerICS('${d.id}')" title="Télécharger les rappels (.ics)">${icone('calendar')} Rappels (.ics)</button>
          <button onclick="imprimerFiche('${d.id}')" title="Télécharger la fiche dossier imprimable">${icone('file-text')} Imprimer</button>
        </div>
        ${historique.length > 0 ? `
          <button type="button" class="historique-toggle section-eyebrow" onclick="toggleHistorique('${d.id}')">Historique (${historique.length})</button>
          <div class="historique-liste" id="historique-${d.id}">
            ${historique.slice().reverse().map(h => `<div class="historique-ligne"><span class="h-date">${new Date(h.date).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>${escapeHtml(h.texte)}</div>`).join('')}
          </div>
        ` : ''}
      </div>
      </div>
    `;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // Échappement dédié aux attributs HTML (échappe aussi les guillemets, contrairement à
  // escapeHtml) : pour un attribut HTML ORDINAIRE (title="...", value="...", aria-label="...") —
  // pas pour un argument JS à l'intérieur d'un gestionnaire onclick="...", voir escapeOnclickArg()
  // juste en dessous et l'historique du bug qui explique pourquoi les deux ne sont PAS
  // interchangeables malgré des symptômes très proches.
  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;');
  }

  // Échappement dédié à un argument JS interpolé DANS un attribut onclick="..." délimité par des
  // apostrophes (ex. onclick="fonction('id', 'cle', '${escapeOnclickArg(p.label)}')").
  // Bug corrigé, en deux temps : un premier correctif (voir l'historique git) avait fait
  // remplacer l'apostrophe par l'entité HTML &#39; dans escapeAttr() — apparemment correct à
  // toutes les vérifications faites à l'époque (relecture du code, rendu en bac à sable, deux
  // binaires .exe publiés inspectés, et même la réponse réseau de script.js relue dans le
  // navigateur) et pourtant TOUJOURS sans effet en conditions réelles sur "Certificat
  // d'urbanisme"/"Certificat d'alignement" (aucune popup de confirmation au clic sur la croix).
  // Cause réelle, jamais identifiée par ces vérifications parce qu'aucune d'elles ne rejouait le
  // parsing du navigateur : un attribut onclick="..." est décodé EN DEUX TEMPS — d'abord comme du
  // HTML (les entités comme &#39; sont résolues en leur caractère, ici ' à nouveau), PUIS le texte
  // ainsi décodé est exécuté comme du JS. &#39; redevient donc une apostrophe BRUTE avant même que
  // le moteur JS ne voie l'attribut — elle referme le même argument JS qu'avant ce premier
  // correctif, exactement le même bug, juste masqué à la lecture du code source (qui ne montre
  // que le texte AVANT ce second décodage HTML implicite). La seule échappement qui survit aux
  // DEUX passes est l'échappement JS lui-même (\' — un antislash n'a aucun sens spécial en HTML,
  // il traverse le premier décodage intact, et forme ensuite une séquence d'échappement JS valide
  // pour le second). `escapeAttr()` reste correcte telle quelle pour un attribut HTML ORDINAIRE
  // (title, value...) qui n'est jamais réinterprété comme du JS — seul ce cas précis (un argument
  // JS DANS un gestionnaire onclick) a besoin de cette échappement différente.
  function escapeOnclickArg(s) {
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renommerDossier(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nom = valeur.trim();
    // Toujours réafficher (via render()) même si le nom est vide ou inchangé, pour refermer
    // l'édition dans tous les cas — pas seulement quand une modification a réellement eu lieu.
    if (nom && nom !== d.nom) {
      ajouterHistorique(d, `Nom modifié : « ${d.nom} » → « ${nom} »`);
      d.nom = nom;
      sauvegarder(d);
    }
    render();
  }

  // Bascule le nom d'un dossier enregistré entre affichage simple (+ crayon) et édition
  // (champ texte + validation explicite), plutôt qu'un champ toujours modifiable au clic — évite
  // de déclencher une modification par erreur en cliquant simplement sur le nom.
  function activerEditionNom(id) {
    const aff = document.getElementById('nom-affichage-' + id);
    const edit = document.getElementById('nom-edition-' + id);
    if (!aff || !edit) return;
    aff.hidden = true;
    edit.hidden = false;
    const input = document.getElementById('nom-input-' + id);
    if (input) { input.focus(); input.select(); }
  }

  function annulerEditionNom(id) {
    const d = dossiers.find(x => x.id === id);
    const input = document.getElementById('nom-input-' + id);
    if (input && d) input.value = d.nom; // remet la valeur d'origine sans repasser par render()
    const aff = document.getElementById('nom-affichage-' + id);
    const edit = document.getElementById('nom-edition-' + id);
    if (aff) aff.hidden = false;
    if (edit) edit.hidden = true;
  }

  function validerEditionNom(id) {
    const input = document.getElementById('nom-input-' + id);
    renommerDossier(id, input ? input.value : '');
  }

  // Même principe pour corriger une date après coup (erreur repérée une fois le dossier
  // enregistré) : crayon → champ date natif → valider. cleEdition vaut le type (pret/acte/
  // ventebien) ou "autre-<index>" pour une échéance personnalisée — voir renderTab().
  function activerEditionDate(dossierId, cle) {
    const idBase = `tabdate-${dossierId}-${cle}`;
    const aff = document.getElementById(idBase + '-aff');
    const edit = document.getElementById(idBase + '-edit');
    if (!aff || !edit) return;
    aff.hidden = true;
    edit.hidden = false;
    const input = document.getElementById(idBase + '-input');
    if (input) input.focus();
  }

  function annulerEditionDate(dossierId, cle) {
    const idBase = `tabdate-${dossierId}-${cle}`;
    const aff = document.getElementById(idBase + '-aff');
    const edit = document.getElementById(idBase + '-edit');
    if (aff) aff.hidden = false;
    if (edit) edit.hidden = true;
  }

  function validerEditionDate(dossierId, cle) {
    const idBase = `tabdate-${dossierId}-${cle}`;
    const input = document.getElementById(idBase + '-input');
    if (!input) return;
    const nouvelleDate = input.value || '';
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;

    if (cle.indexOf('autre-') === 0) {
      const index = parseInt(cle.slice(6), 10);
      const item = (d.autres || [])[index];
      if (!item) return;
      if (nouvelleDate !== (item.date || '')) {
        ajouterHistorique(d, `Date « ${item.label} » modifiée : ${item.date ? formatDateFr(item.date) : 'non renseignée'} → ${nouvelleDate ? formatDateFr(nouvelleDate) : 'non renseignée'}`);
        item.date = nouvelleDate || null;
        sauvegarder(d);
      }
    } else if (nouvelleDate !== (d[cle] || '')) {
      ajouterHistorique(d, `« ${LIBELLES_CATEGORIE[cle]} » modifiée : ${d[cle] ? formatDateFr(d[cle]) : 'non renseignée'} → ${nouvelleDate ? formatDateFr(nouvelleDate) : 'non renseignée'}`);
      d[cle] = nouvelleDate || '';
      d.confiance = d.confiance || {};
      d.confiance[cle] = 'manuel'; // corrigée à la main : à revérifier comme toute saisie manuelle
      // Symétrique de supprimerDateEcheance (qui passe sansPret à true en vidant cette date) : si
      // une date de prêt est saisie sur un dossier jusque-là "sans prêt", le suivi de l'offre doit
      // reprendre — sans ce basculement, d.sansPret restait bloqué à true indéfiniment, malgré une
      // vraie date désormais renseignée (verifierDossierLocal()/la checklist continuaient d'ignorer
      // le prêt).
      if (cle === 'pret') d.sansPret = !nouvelleDate;
      sauvegarder(d);
    }
    render();
  }

  // Ajouter une échéance personnalisée APRÈS l'enregistrement du dossier (pas seulement à la
  // création, via autresEnCours/renderAutres) : demandé par l'étude, un délai/une obligation
  // repérée après coup (ex. à la lecture d'un avenant) doit pouvoir être ajoutée sans repasser par
  // le wizard. Un simple bouton "+ Ajouter une échéance" bascule vers un mini-formulaire inline
  // (même structure .date-block.autre/.autre-row que le formulaire de création, réutilisée telle
  // quelle plutôt que dupliquée) — voir renderAjoutEcheance(), appelé juste sous .tabs.
  function afficherFormAjoutEcheance() {
    ajoutEcheanceOuvert = true;
    render();
  }

  function masquerFormAjoutEcheance() {
    ajoutEcheanceOuvert = false;
    render();
  }

  function ajouterEcheanceApresCoup(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const labelInput = document.getElementById('nouvelle-echeance-label');
    const dateInput = document.getElementById('nouvelle-echeance-date');
    const label = (labelInput && labelInput.value.trim()) || 'Autre échéance';
    const iso = dateInput ? dateInput.value : '';
    if (!iso) { if (dateInput) dateInput.focus(); return; } // une échéance sans date n'a pas de sens ici
    d.autres = d.autres || [];
    d.autres.push({ label, date: iso, page: null });
    ajouterHistorique(d, `Échéance « ${label} » ajoutée (${formatDateFr(iso)})`);
    ajoutEcheanceOuvert = false;
    sauvegarder(d);
    render();
  }

  // Pendant du bouton "+ Ajouter une échéance" ci-dessus : ne concerne que les échéances
  // personnalisées (croix visible uniquement sur les tabs "autre", voir renderTab) — une entrée de
  // d.autres est réellement retirée du tableau. Obtention du prêt/Signature de l'acte/Vente
  // préalable ne sont jamais retirées du modèle (voir supprimerDateEcheance juste en dessous, qui
  // vide seulement leur date).
  function supprimerEcheanceAutre(dossierId, index) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.autres || !d.autres[index]) return;
    const item = d.autres[index];
    demanderConfirmation(`Supprimer l'échéance « ${item.label || 'Autre échéance'} » ?`, () => {
      d.autres.splice(index, 1);
      ajouterHistorique(d, `Échéance « ${item.label || 'Autre échéance'} » supprimée`);
      sauvegarder(d);
      render();
    });
  }

  // Bouton de suppression dédié pour une date butoir fixe (pret/acte/ventebien), demandé par
  // l'étude en plus de la correction déjà possible via le crayon (qui permet aussi de vider le
  // champ date natif puis valider — mais rien n'indiquait que c'était possible, ni ne le
  // confirmait). Contrairement à supprimerEcheanceAutre, la tab elle-même n'est pas retirée du
  // modèle : seule sa date repart à vide (déjà le cas d'affichage pour "Non renseigné" sur un
  // dossier créé sans cette échéance active — voir renderTab).
  function supprimerDateEcheance(dossierId, type) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d[type]) return;
    demanderConfirmation(`Supprimer la date « ${LIBELLES_CATEGORIE[type]} » ?`, () => {
      d[type] = '';
      d.confiance = d.confiance || {};
      d.confiance[type] = null;
      // Supprimer la date de prêt équivaut à "sans prêt" (voir d.sansPret, déjà la seule source de
      // vérité utilisée partout ailleurs — checklist de pièces, badges, verifierDossierLocal...) :
      // sans ce basculement, une recherche locale de l'offre aurait continué pour une condition
      // qui n'est plus suivie sur ce dossier (verifierDossierLocal() teste déjà `!d.sansPret`).
      if (type === 'pret') d.sansPret = true;
      ajouterHistorique(d, `« ${LIBELLES_CATEGORIE[type]} » supprimée`);
      sauvegarder(d);
      render();
    });
  }

  function renderAjoutEcheance(d) {
    if (!ajoutEcheanceOuvert) {
      return `<button type="button" class="action-rapide ajout-echeance-btn" onclick="afficherFormAjoutEcheance()">+ Ajouter une échéance</button>`;
    }
    return `
      <div class="date-block autre ajout-echeance-form">
        <div class="autre-row">
          <input type="text" id="nouvelle-echeance-label" placeholder="Nom de l'échéance (ex. Levée de la condition suspensive travaux)">
          <input type="date" id="nouvelle-echeance-date">
          <button type="button" class="icon-valider" onclick="ajouterEcheanceApresCoup('${d.id}')" title="Ajouter" aria-label="Ajouter l'échéance">✓</button>
          <button type="button" class="icon-btn" onclick="masquerFormAjoutEcheance()">Annuler</button>
        </div>
      </div>
    `;
  }

  // Ajouter une obligation du vendeur sur une fiche DÉJÀ ENREGISTRÉE, demandé par l'étude — jusqu'ici
  // seule la sélection de texte dans le PDF (pendant l'import) ou le bouton "+ Ajouter un engagement
  // du vendeur" du wizard permettaient d'en consigner une, jamais sur un dossier rouvert plus tard
  // (un accord oral rapporté après coup, ou une clause repérée en relisant l'acte a posteriori).
  // Même principe que renderAjoutEcheance/renderAjoutPiece : un bouton toujours visible qui bascule
  // vers un mini-formulaire inline, piloté par ajoutEngagementOuvert (un seul dossier ouvert à la
  // fois dans le tiroir, un simple booléen suffit).
  function afficherFormAjoutEngagementDossier() {
    ajoutEngagementOuvert = true;
    render();
  }

  function masquerFormAjoutEngagementDossier() {
    ajoutEngagementOuvert = false;
    render();
  }

  // Alimente aussi l'apprentissage (memoriserCorrection, catégorie 'engagement') : une obligation
  // ajoutée à la main sur une fiche déjà enregistrée est, comme une clause ajoutée pendant l'import,
  // un signal utile pour reconnaître une formulation proche au prochain compromis — même principe
  // déjà appliqué à ajouterEngagementManuel()/ajouterEngagementDepuisFormulaire() et à
  // validerEditionEngagement().
  function ajouterEngagementDossierApresCoup(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    // Ids distincts du formulaire équivalent du wizard (#nouvel-engagement-type/-texte, voir
    // index.html) : ce dernier reste en permanence dans le DOM (masqué par style.display, jamais
    // retiré) — deux éléments partageant le même id auraient fait retomber getElementById() sur le
    // MAUVAIS formulaire (celui du wizard, apparaissant en premier dans le document), pas sur celui
    // réellement affiché dans le tiroir.
    const typeEl = document.getElementById('nouvelle-obligation-dossier-type');
    const texteEl = document.getElementById('nouvelle-obligation-dossier-texte');
    const type = typeEl ? typeEl.value : 'document';
    const phrase = texteEl ? texteEl.value.trim() : '';
    if (!phrase) { if (texteEl) texteEl.focus(); return; }
    d.analyseJuridique = d.analyseJuridique || { documents: [], engagements: [], conditions: [] };
    d.analyseJuridique.engagements = d.analyseJuridique.engagements || [];
    d.analyseJuridique.engagements.push({ phrase, type, page: null, manuel: true });
    ajouterHistorique(d, `Obligation du vendeur ajoutée : « ${phrase.slice(0, 80)}${phrase.length > 80 ? '…' : ''} »`);
    memoriserCorrection(phrase, type, null, 'engagement');
    ajoutEngagementOuvert = false;
    sauvegarder(d);
    render();
  }

  function renderAjoutEngagement(d) {
    if (!ajoutEngagementOuvert) {
      return `<button type="button" class="action-rapide ajout-engagement-btn" onclick="afficherFormAjoutEngagementDossier()">+ Ajouter une obligation du vendeur</button>`;
    }
    return `
      <div class="date-block autre ajout-engagement-form">
        <div class="autre-row">
          <select id="nouvelle-obligation-dossier-type">
            <option value="entretien">Entretien</option>
            <option value="travaux">Travaux</option>
            <option value="document" selected>Document</option>
            <option value="autre">Autres</option>
          </select>
          <textarea id="nouvelle-obligation-dossier-texte" rows="2" placeholder="Clause exacte, ou description de l'obligation"></textarea>
          <button type="button" class="icon-valider" onclick="ajouterEngagementDossierApresCoup('${d.id}')" title="Ajouter" aria-label="Ajouter l'obligation">✓</button>
          <button type="button" class="icon-btn" onclick="masquerFormAjoutEngagementDossier()">Annuler</button>
        </div>
      </div>
    `;
  }

  // ---- ICS export ----

  function icsDate(iso) {
    return iso.replace(/-/g, '');
  }

  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function buildEvent(uidBase, summary, iso, reminderDays) {
    if (!iso) return '';
    const dtstart = icsDate(iso);
    const dtend = icsDate(addDays(iso, 1));
    const now = new Date();
    const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    const alarms = reminderDays.map(n => {
      const trigger = n === 0 ? 'PT0S' : `-P${n}D`;
      return `BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Rappel — ${summary}\r\nTRIGGER:${trigger}\r\nEND:VALARM\r\n`;
    }).join('');
    return `BEGIN:VEVENT\r\nUID:${uidBase}@registre-echeances\r\nDTSTAMP:${dtstamp}\r\nDTSTART;VALUE=DATE:${dtstart}\r\nDTEND;VALUE=DATE:${dtend}\r\nSUMMARY:${summary}\r\n${alarms}END:VEVENT\r\n`;
  }

  // Le nom du dossier est au format "VENDEUR(S) / ACQUEREUR(S)" : on isole la partie acquéreur
  // pour la mettre en avant dans le titre du rendez-vous (repli sur le nom complet si le format
  // "VENDEUR / ACQUEREUR" n'a pas pu être établi, par ex. un seul nom détecté).
  function extraireNomAcquereur(nomDossier) {
    const parties = String(nomDossier || '').split(' / ');
    return parties.length > 1 ? parties[1].trim() : nomDossier;
  }

  // Limité à la seule date d'obtention du prêt (demandé explicitement par l'étude) : les autres
  // échéances (acte, vente préalable, personnalisées) n'y figurent plus, contrairement à la
  // première version de cet export qui générait un événement par échéance active du dossier.
  function telechargerICS(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    // Plus rien à exporter pour ce dossier (sans prêt, ou date de prêt supprimée/jamais
    // renseignée) : un .ics vide (juste l'en-tête VCALENDAR, sans VEVENT) serait un échec
    // silencieux — voir la contrainte n°5 de CLAUDE.md sur les messages invisibles.
    if (!d.pret) {
      afficherToast("Aucune date d'obtention du prêt renseignée pour ce dossier : rien à exporter.", 'OK', null);
      return;
    }
    const nomAcquereur = extraireNomAcquereur(d.nom);
    const suffixeTitre = ` — ${nomAcquereur} - Dossier ${d.nom}`;
    let body = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Registre des echeances//FR\r\nCALSCALE:GREGORIAN\r\n';
    body += buildEvent(d.id + '-pret', `Obtention du prêt${suffixeTitre}`, d.pret, d.reminderDays);
    body += 'END:VCALENDAR\r\n';

    const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = d.nom.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.href = url;
    // Format demandé par l'étude : rappel_echeance_<nom du dossier>.ics.
    a.download = `rappel_echeance_${safeName || 'dossier'}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    afficherInfoAction(
      'Fichier .ics téléchargé',
      "À importer dans Outlook (ou votre agenda) : il crée un événement pour l'obtention du prêt, avec ses rappels."
    );
  }

  // ==== Relances ciblées, différenciées par motif ====
  //
  // Le rappel générique "toutes les échéances" adressé à l'ÉTUDE elle-même (ouvrirEmailRappel(),
  // un pense-bête interne par mailto) a été retiré définitivement : les rappels automatiques vers
  // Teams (voir jobs/rappels.js), avec copie systématique à l'étude (voir teamsCopieEmail dans
  // l'écran Réglages), couvrent désormais ce besoin sans geste manuel. Ces trois modèles-ci restent
  // en revanche adressés au CLIENT (d.emailAcquereur, comme relancerSiOffreManquante() déjà en
  // place) : chacun cible un motif de relance précis, pour ne plus avoir à réécrire le même email
  // à la main selon ce qui manque réellement au dossier — un usage distinct, non couvert par Teams.
  function construireEmailRelancePret(d) {
    const echeance = d.pret ? ` L'échéance d'obtention du prêt est fixée au ${formatDateFr(d.pret)}.` : '';
    return {
      sujet: `Relance — Offre de prêt attendue (dossier ${d.nom})`,
      corps: `Bonjour,\n\nSauf erreur de notre part, nous n'avons pas encore reçu votre offre de prêt pour le dossier ${d.nom}.${echeance}\n\nMerci de nous transmettre cette offre dès réception, ou de nous indiquer où en est votre demande de financement.\n\nCordialement.`
    };
  }

  function construireEmailRelancePieces(d) {
    const checklist = checklistPieces(d.typeVente, d);
    const manquantes = checklist.filter(p => (d.pieces || {})[p.cle] !== 'recue').map(p => p.label);
    const liste = manquantes.length > 0
      ? manquantes.map(l => `- ${l}`).join('\n')
      : '- (voir avec l\'étude le détail des pièces encore attendues)';
    return {
      sujet: `Relance — Pièces à nous transmettre (dossier ${d.nom})`,
      corps: `Bonjour,\n\nPour poursuivre l'instruction de votre dossier ${d.nom}, il nous manque encore la ou les pièces suivantes :\n\n${liste}\n\nMerci de nous les transmettre dès que possible.\n\nCordialement.`
    };
  }

  function construireEmailRelanceRib(d) {
    return {
      sujet: `Relevé d'identité bancaire — dossier ${d.nom}`,
      corps: `Bonjour,\n\nAfin de préparer l'appel de fonds de votre dossier ${d.nom}, merci de nous transmettre un relevé d'identité bancaire (RIB) à votre nom.\n\nCordialement.`
    };
  }

  // Une entrée par motif de relance : le libellé du bouton, le modèle d'email, et la condition qui
  // le rend pertinent pour CE dossier (pas de relance "prêt" sur un achat comptant, pas de relance
  // "pièces" si tout est déjà reçu) — évaluée à l'affichage par renderRelancesCiblees().
  var MODELES_EMAIL_RELANCE = {
    pret: { cle: 'pret', libelle: 'Prêt manquant', construire: construireEmailRelancePret, historique: 'Relance manuelle envoyée — offre de prêt' },
    pieces: { cle: 'pieces', libelle: 'Pièce(s) à fournir', construire: construireEmailRelancePieces, historique: 'Relance manuelle envoyée — pièces manquantes' },
    rib: { cle: 'rib', libelle: 'RIB', construire: construireEmailRelanceRib, historique: 'Relance manuelle envoyée — RIB' }
  };

  function envoyerRelanceCiblee(id, type) {
    const d = dossiers.find(x => x.id === id);
    const modele = MODELES_EMAIL_RELANCE[type];
    if (!d || !modele) return;
    if (!d.emailAcquereur) {
      afficherToast("Aucun email d'acquéreur renseigné pour ce dossier — impossible de préparer cette relance.", 'OK', null);
      return;
    }
    const { sujet, corps } = modele.construire(d);
    ajouterHistorique(d, modele.historique);
    sauvegarder(d);
    const url = `mailto:${encodeURIComponent(d.emailAcquereur)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
    window.location.href = url;
    afficherInfoAction(
      "Brouillon d'email ouvert",
      "L'envoi final reste un clic manuel dans votre messagerie : rien n'est envoyé automatiquement."
    );
  }

  // Affichée sur la fiche dossier (voir renderCarteDossier), juste avant les trois actions
  // génériques (.ics/rappel/impression) : un bouton par motif de relance pertinent pour CE dossier.
  // Absente pour un notaire participant (même garde-fou que relancerSiOffreManquante/
  // verifierDossierLocal — relancer le client reste un geste de l'instrumentaire). Sans email
  // d'acquéreur renseigné, un message l'indique plutôt que des boutons qui échoueraient au clic.
  function renderRelancesCiblees(d) {
    if (d.roleNotaire === 'participant') return '';
    if (!d.emailAcquereur) {
      return `<div class="relances-ciblees">
        <span class="section-eyebrow">Relancer par email</span>
        <p class="hint">Renseignez l’email de l’acquéreur pour activer les relances ciblées (prêt, pièces, RIB).</p>
      </div>`;
    }
    const boutons = [];
    if (!d.sansPret && d.offrePretStatut !== 'recue') {
      boutons.push(MODELES_EMAIL_RELANCE.pret);
    }
    const checklist = checklistPieces(d.typeVente, d);
    if (checklist.some(p => (d.pieces || {})[p.cle] !== 'recue')) {
      boutons.push(MODELES_EMAIL_RELANCE.pieces);
    }
    boutons.push(MODELES_EMAIL_RELANCE.rib);
    return `<div class="relances-ciblees">
      <span class="section-eyebrow">Relancer par email</span>
      <div class="relances-boutons">
        ${boutons.map(m => `<button type="button" class="action-rapide" onclick="envoyerRelanceCiblee('${d.id}', '${m.cle}')">${escapeHtml(m.libelle)}</button>`).join('')}
      </div>
    </div>`;
  }

  // ---- persistence (serveur intranet) ----
  //
  // Remplace l'ancien mécanisme localStorage + registre partagé JSON (voir l'historique dans
  // CLAUDE.md) : le serveur (server/, branche claude/serveur-intranet) est désormais la SEULE
  // source de vérité, avec une authentification par mot de passe partagé unique. Plus de repli
  // local : sans serveur joignable, l'outil ne peut pas fonctionner (décision explicite, voir le
  // plan de ce chantier).

  const CLE_AUTH_TOKEN = 'claire-token';
  let authToken = null;
  // Curseur de synchro (epoch ms renvoyé par le serveur) : le polling ne redemande que ce qui a
  // changé depuis cette valeur, jamais une horloge cliente (voir GET /api/dossiers?since=).
  let curseurSynchro = 0;

  function chargerJetonStocke() {
    try { return localStorage.getItem(CLE_AUTH_TOKEN) || null; } catch (e) { return null; }
  }

  function stockerJeton(jeton) {
    authToken = jeton;
    try {
      if (jeton) localStorage.setItem(CLE_AUTH_TOKEN, jeton);
      else localStorage.removeItem(CLE_AUTH_TOKEN);
    } catch (e) { /* jeton reperdu au rechargement si le stockage échoue — sans autre conséquence */ }
  }

  // Point de passage unique pour tout appel à l'API du serveur : ajoute le jeton de session, et
  // réaffiche l'écran de connexion dès qu'une réponse 401 signale une session expirée/invalide
  // (mot de passe changé, jeton périmé après 12h — voir server/src/auth.js).
  async function fetchAvecAuth(url, options = {}) {
    const reponse = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), authorization: `Bearer ${authToken}` }
    });
    if (reponse.status === 401) {
      stockerJeton(null);
      arreterPolling();
      afficherEcranConnexion();
      throw new Error('Session expirée — reconnexion nécessaire.');
    }
    return reponse;
  }

  function afficherEcranConnexion(messageErreur) {
    const overlay = document.getElementById('connexion-overlay');
    const erreurEl = document.getElementById('connexion-erreur');
    if (erreurEl) {
      erreurEl.textContent = messageErreur || '';
      erreurEl.style.display = messageErreur ? 'block' : 'none';
    }
    if (overlay) overlay.style.display = 'flex';
    const input = document.getElementById('connexion-mot-de-passe');
    if (input) { input.value = ''; setTimeout(() => input.focus(), 0); }
  }

  function fermerEcranConnexion() {
    const overlay = document.getElementById('connexion-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async function tenterConnexion() {
    const input = document.getElementById('connexion-mot-de-passe');
    const motDePasse = input ? input.value : '';
    if (!motDePasse) return;
    const btn = document.getElementById('connexion-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Connexion…'; }
    try {
      const reponse = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ motDePasse })
      });
      if (!reponse.ok) {
        afficherEcranConnexion('Mot de passe incorrect.');
        return;
      }
      const { jeton } = await reponse.json();
      stockerJeton(jeton);
      fermerEcranConnexion();
      await demarrerApplication();
    } catch (e) {
      console.error('Connexion au serveur impossible', e);
      afficherEcranConnexion("Serveur injoignable — vérifiez la connexion au réseau de l'étude.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Se connecter'; }
    }
  }

  // Premier chargement : `since=0` renvoie tous les dossiers actifs (voir server/src/routes/
  // dossiers.js) — jamais de tombstone à ce stade puisqu'on part d'un registre vide côté client.
  async function charger() {
    const reponse = await fetchAvecAuth('/api/dossiers?since=0');
    const { dossiers: recus, serverTime } = await reponse.json();
    dossiers = recus
      .filter(d => d && typeof d === 'object' && d.id && !d.deleted)
      .map(({ updatedAt, ...d }) => d); // updatedAt est une métadonnée serveur, pas un champ du modèle
    curseurSynchro = serverTime;
    render();
  }

  // Remplacement complet d'UN dossier déjà enregistré (PUT) — chaque site d'appel a déjà `d` en
  // portée juste après l'avoir modifié, voir les ~25 call sites qui suivent dans ce fichier.
  // N'échoue jamais bruyamment côté appelant (pas de throw) : ceux-ci font juste `sauvegarder(d);
  // render();` sans awaiter ni intercepter d'erreur, comme au temps du localStorage — une panne
  // réseau se retrouvera simplement rattrapée par le prochain PUT réussi (le brouillon en mémoire
  // reste correct, seule la synchro serveur retarde).
  async function sauvegarder(d) {
    try {
      const reponse = await fetchAvecAuth(`/api/dossiers/${encodeURIComponent(d.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(d)
      });
      if (reponse.ok) {
        const sauvegarde = await reponse.json();
        curseurSynchro = Math.max(curseurSynchro, sauvegarde.updatedAt || 0);
      } else {
        console.error('Sauvegarde refusée par le serveur', reponse.status);
      }
    } catch (e) {
      console.error('Sauvegarde impossible (serveur injoignable ?)', e);
    }
  }

  // Création (POST) — seule différence avec sauvegarder() : le serveur doit savoir qu'il s'agit
  // d'un nouveau dossier, pas d'un remplacement. Renvoie true/false pour que l'appelant (
  // ajouterDossier(), importerDonnees()) sache s'il doit vraiment ajouter le dossier à `dossiers`
  // ou prévenir l'utilisateur d'un échec (id en double, serveur injoignable...).
  async function sauvegarderNouveauDossier(d) {
    try {
      const reponse = await fetchAvecAuth('/api/dossiers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(d)
      });
      if (reponse.ok) {
        const sauvegarde = await reponse.json();
        curseurSynchro = Math.max(curseurSynchro, sauvegarde.updatedAt || 0);
        return true;
      }
      console.error('Création refusée par le serveur', reponse.status);
      return false;
    } catch (e) {
      console.error('Création impossible (serveur injoignable ?)', e);
      return false;
    }
  }

  async function supprimerDossierServeur(id) {
    try {
      const reponse = await fetchAvecAuth(`/api/dossiers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return reponse.ok;
    } catch (e) {
      console.error('Suppression impossible (serveur injoignable ?)', e);
      return false;
    }
  }

  async function restaurerDossierServeur(id) {
    try {
      const reponse = await fetchAvecAuth(`/api/dossiers/${encodeURIComponent(id)}/undelete`, { method: 'POST' });
      return reponse.ok;
    } catch (e) {
      console.error('Restauration impossible (serveur injoignable ?)', e);
      return false;
    }
  }

  // ---- synchro par polling (voir le plan : WebSocket écarté, 3 utilisateurs sur un LAN ne
  // justifient pas la complexité d'une connexion persistante) ----

  const INTERVALLE_POLLING_MS = 7000;
  let intervallePolling = null;

  function demarrerPolling() {
    arreterPolling();
    intervallePolling = setInterval(sondagePeriodique, INTERVALLE_POLLING_MS);
  }

  function arreterPolling() {
    if (intervallePolling) { clearInterval(intervallePolling); intervallePolling = null; }
  }

  // Pas la peine de solliciter le serveur pendant qu'un onglet est masqué/minimisé — reprend
  // aussitôt (avec un sondage immédiat, pas d'attente du prochain tick) dès qu'il redevient visible.
  function gererVisibilitePolling() {
    if (document.hidden) {
      arreterPolling();
    } else if (authToken) {
      sondagePeriodique();
      demarrerPolling();
    }
  }
  document.addEventListener('visibilitychange', gererVisibilitePolling);

  function appliquerChangementsDistants(changements) {
    for (const item of changements) {
      const index = dossiers.findIndex(x => x.id === item.id);
      if (item.deleted) {
        if (index !== -1) dossiers.splice(index, 1);
        continue;
      }
      const { updatedAt, ...d } = item;
      // Notification proactive : un nouveau PDF vient d'être détecté par la surveillance périodique
      // du NAS (voir server/src/nasWatch.js). Le fichier était déjà repris silencieusement dans la
      // checklist au prochain "Revérifier" automatique (toutes les 5 minutes pour un dossier non
      // complet) — le vrai manque, c'est qu'on ne pouvait pas s'en rendre compte sans le remarquer
      // soi-même. Comparaison sur l'horodatage : seul un `nasNouveaute` VRAIMENT NOUVEAU (absent
      // avant, ou différent de celui déjà connu) déclenche un toast — jamais au chargement initial
      // (charger() ne passe pas par cette fonction), qui resignalerait tous les anciens en rafale.
      if (index !== -1 && d.nasNouveaute && (!dossiers[index].nasNouveaute || dossiers[index].nasNouveaute.at !== d.nasNouveaute.at)) {
        const nb = (d.nasNouveaute.fichiers || []).length;
        afficherToast(
          `${nb > 1 ? nb + ' nouveaux documents détectés' : 'Nouveau document détecté'} dans le dossier « ${d.nom} » — pensez à revérifier.`,
          'OK', null
        );
      }
      if (index !== -1) dossiers[index] = d; else dossiers.push(d);
    }
  }

  // Reflète dans la sidebar si le dernier sondage a bien atteint le serveur — sans ça, un serveur
  // arrêté/injoignable (câble débranché, poste hébergeur éteint...) ne se voyait qu'indirectement,
  // en constatant qu'un dossier créé par un collègue n'apparaissait jamais. `statutServeurConnecte`
  // évite d'écrire dans le DOM à chaque sondage (toutes les 7s) quand rien n'a changé.
  let statutServeurConnecte = true;
  function majStatutServeur(connecte) {
    if (connecte === statutServeurConnecte) return;
    statutServeurConnecte = connecte;
    const badge = document.getElementById('statut-serveur-badge');
    if (!badge) return;
    badge.className = 'dot-label ' + (connecte ? 'dl-success' : 'dl-urgent');
    badge.innerHTML = '<span class="dot"></span>' + (connecte ? 'Connecté' : 'Hors ligne');
    badge.title = connecte
      ? ''
      : 'Le serveur ne répond plus — vérifiez qu\'il tourne toujours sur le poste hébergeur. Les modifications faites ici seront synchronisées dès que la connexion revient.';
  }

  async function sondagePeriodique() {
    try {
      const reponse = await fetchAvecAuth(`/api/dossiers?since=${curseurSynchro}`);
      if (!reponse.ok) { majStatutServeur(false); return; }
      const { dossiers: changements, serverTime } = await reponse.json();
      if (changements.length > 0) {
        appliquerChangementsDistants(changements);
        render();
      }
      curseurSynchro = serverTime;
      majStatutServeur(true);
    } catch (e) {
      // Une session expirée (401) est déjà gérée par fetchAvecAuth (jeton effacé, écran de
      // connexion réaffiché, polling arrêté) — pas la peine d'afficher "Hors ligne" par-dessus,
      // ce n'est pas un problème de connexion réseau. authToken redevient null dans ce cas
      // précis : ne signaler l'indisponibilité que si ce n'est PAS la cause de cet échec.
      if (authToken) majStatutServeur(false);
    }
  }

  // Séquence complète une fois authentifié : dossiers, état du NAS (pour savoir si la
  // fonctionnalité est utilisable du tout), vérification des dossiers reliés, puis polling.
  // La popup « accès à reconfirmer » qui vivait ici a disparu avec le mécanisme de permissions du
  // navigateur : le serveur lit le NAS, il n'y a plus rien à reconfirmer.
  async function demarrerApplication() {
    await charger();
    await chargerEtatNas();
    await revérifierDossiersLiesAuDemarrage();
    demarrerPolling();
  }

  // ---- apprentissage des corrections (dates) ----
  //
  // Quand un(e) collaborateur(rice) attribue à une date détectée une catégorie différente de
  // celle suggérée (ou classe une date que l'outil n'avait pas su classer du tout), on retient
  // la clause correspondante. Au prochain compromis, si une clause très proche (mêmes mots,
  // dates/montants neutralisés) réapparaît, la correction déjà faite est réappliquée
  // automatiquement à la suggestion — qui reste malgré tout à vérifier, comme toute suggestion
  // automatique (voir le pied de page) : ce n'est pas parce qu'une clause ressemble à une clause
  // déjà vue qu'elle joue exactement le même rôle dans ce compromis-ci.
  //
  // Comparaison approximative (pas d'égalité stricte) : deux occurrences de la même clause-type
  // diffèrent presque toujours par la date, le montant ou les noms qu'elles contiennent — d'où la
  // neutralisation de ces éléments avant de comparer, puis un recouvrement de mots (indice de
  // Jaccard) plutôt qu'une comparaison caractère à caractère.
  //
  // Stocké en local uniquement (même mécanisme que le registre des dossiers, voir charger() /
  // sauvegarder() ci-dessus) : rien n'est envoyé nulle part, et rien de plus que des fragments de
  // clauses déjà affichés à l'écran n'est conservé.
  const CLE_APPRENTISSAGE = 'corrections-echeances';
  const SEUIL_SIMILARITE_APPRENTISSAGE = 0.6; // au-delà, on considère qu'il s'agit de la même clause-type
  const MAX_CORRECTIONS_MEMORISEES = 500; // filet de sécurité : évite une croissance illimitée du stockage local
  let correctionsApprises = [];

  function normaliserTexteApprentissage(texte) {
    const moisNoms = Object.keys(MOIS).join('|');
    return String(texte)
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(new RegExp(`\\b\\d{1,2}(?:er)?\\s+(?:${moisNoms})\\s+\\d{4}\\b`, 'g'), ' §date§ ')
      .replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}\b/g, ' §date§ ')
      .replace(/\d+/g, '§num§')
      .replace(/[^a-z§\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokeniserApprentissage(texteNormalise) {
    // Mots de 3 lettres ou plus seulement : les mots très courts (de, le, un…) sont trop communs
    // pour discriminer une clause-type d'une autre et gonfleraient artificiellement le score.
    return new Set(texteNormalise.split(' ').filter(t => t.length > 2));
  }

  function similariteJaccard(setA, setB) {
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const t of setA) { if (setB.has(t)) intersection++; }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  async function sauvegarderApprentissage() {
    const contenu = JSON.stringify(correctionsApprises);
    try {
      if (window.storage) { await window.storage.set(CLE_APPRENTISSAGE, contenu, false); return; }
    } catch (e) { console.warn('window.storage indisponible pour l’apprentissage, repli sur localStorage.', e); }
    try { localStorage.setItem(CLE_APPRENTISSAGE, contenu); } catch (e) { console.warn('Sauvegarde de l’apprentissage impossible.', e); }
  }

  async function chargerApprentissage() {
    let brut = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(CLE_APPRENTISSAGE, false);
        if (res && res.value) brut = JSON.parse(res.value);
      }
    } catch (e) { /* on tente le repli ci-dessous */ }
    if (brut === null) {
      try {
        const local = localStorage.getItem(CLE_APPRENTISSAGE);
        if (local) brut = JSON.parse(local);
      } catch (e) { /* rien d'exploitable non plus ici */ }
    }
    correctionsApprises = Array.isArray(brut)
      ? brut.filter(c => c && typeof c === 'object' && Array.isArray(c.tokens) && typeof c.classification === 'string')
      : [];
  }

  // Retrouve, parmi les corrections déjà apprises, la plus proche du contexte donné — ou null si
  // aucune ne dépasse le seuil de similarité. `categorie` distingue les DEUX espaces de
  // classification qui partagent ce même mécanisme (voir memoriserCorrection ci-dessous) : 'date'
  // (type d'échéance pret/acte/ventebien/autre — usage d'origine) et 'engagement' (type
  // d'obligation du vendeur entretien/travaux/document/autre — généralisation demandée par
  // l'étude, voir CLAUDE.md "Apprentissage sur les clauses ajoutées manuellement"). Sans ce filtre,
  // une clause de délai de prêt et une clause d'engagement d'entretien pourraient se confondre par
  // pur hasard de vocabulaire commun et se substituer l'une à l'autre — deux espaces disjoints,
  // jamais comparés entre eux. Une entrée mémorisée AVANT cette distinction (pas de champ
  // `categorie`) est traitée comme 'date', son seul usage jusque-là.
  function trouverCorrectionApprise(contexte, categorie) {
    categorie = categorie || 'date';
    if (correctionsApprises.length === 0) return null;
    const tokens = tokeniserApprentissage(normaliserTexteApprentissage(contexte));
    let meilleure = null;
    let meilleurScore = SEUIL_SIMILARITE_APPRENTISSAGE;
    for (const c of correctionsApprises) {
      if ((c.categorie || 'date') !== categorie) continue;
      const score = similariteJaccard(tokens, new Set(c.tokens));
      if (score >= meilleurScore) { meilleure = c; meilleurScore = score; }
    }
    return meilleure;
  }

  // Enregistre (ou renforce) la correction pour que la même clause-type soit reconnue à l'avenir.
  // classification : selon `categorie` — 'pret'|'acte'|'ventebien'|'autre' pour 'date',
  // 'entretien'|'travaux'|'document'|'autre' pour 'engagement'. libelle : uniquement pour une date
  // classée 'autre' (le nom donné à l'échéance personnalisée).
  function memoriserCorrection(contexte, classification, libelle, categorie) {
    categorie = categorie || 'date';
    if (!contexte || contexte.length < 15) return; // trop court pour donner une empreinte fiable
    const tokens = [...tokeniserApprentissage(normaliserTexteApprentissage(contexte))];
    if (tokens.length < 3) return; // pas assez de matière pour comparer de façon fiable

    const existante = trouverCorrectionApprise(contexte, categorie);
    if (existante && existante.classification === classification) {
      existante.nbConfirmations = (existante.nbConfirmations || 1) + 1;
      existante.dateMaj = new Date().toISOString();
    } else {
      correctionsApprises.push({
        id: (crypto.randomUUID ? crypto.randomUUID() : 'c-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
        tokens,
        contexteExemple: contexte.slice(0, 200),
        categorie,
        classification,
        libelle: libelle || null,
        nbConfirmations: 1,
        dateMaj: new Date().toISOString()
      });
      // Filet de sécurité : on garde les corrections les plus confirmées/récentes plutôt que de
      // laisser le stockage local croître sans fin au fil des années.
      if (correctionsApprises.length > MAX_CORRECTIONS_MEMORISEES) {
        correctionsApprises.sort((a, b) => (b.nbConfirmations - a.nbConfirmations) || b.dateMaj.localeCompare(a.dateMaj));
        correctionsApprises.length = MAX_CORRECTIONS_MEMORISEES;
      }
    }
    sauvegarderApprentissage();
  }

  // Apprentissage d'un document mal rattaché à une pièce de la checklist (voir
  // reinitialiserStatutPieceStandard() ci-dessous) : un fichier reconnu à tort par son NOM
  // (`motifNom`) pour une pièce donnée ne doit plus jamais matcher CETTE pièce, sur AUCUN dossier
  // — demandé explicitement par l'étude ("permettre au système d'apprendre de son erreur"), qui a
  // choisi la portée la plus large (une règle apprise globale) plutôt qu'une simple exclusion
  // locale à ce seul dossier. Stocké séparément de `correctionsApprises` (mécanisme par similarité
  // de texte, pas adapté ici : un nom de fichier n'est pas une clause à comparer par Jaccard, c'est
  // une correspondance exacte qu'il faut simplement empêcher de se reproduire) — un objet
  // `{ [cle]: [nomNormalisé, ...] }`, même stockage `window.storage`/`localStorage` que le reste de
  // l'apprentissage.
  const CLE_EXCLUSIONS_MOTIF_NOM = 'exclusions-motif-nom';
  let exclusionsMotifNom = {};

  // Journal des corrections apportées à la main sur ce que l'extraction avait proposé (voir
  // diffCorrectionsExtraction). Sert UNIQUEMENT à mesurer, plus tard, où l'extraction se trompe le
  // plus souvent — il n'alimente aucun réentraînement automatique du modèle local, décision
  // explicite de la spec : une regex se corrige à la main après analyse, jamais par apprentissage
  // silencieux sur des dizaines de dossiers.
  const CLE_CORRECTIONS_EXTRACTION = 'corrections-extraction';
  const MAX_CORRECTIONS_EXTRACTION = 500;
  let journalCorrectionsExtraction = [];

  async function sauvegarderJournalCorrections() {
    const contenu = JSON.stringify(journalCorrectionsExtraction);
    try {
      if (window.storage) { await window.storage.set(CLE_CORRECTIONS_EXTRACTION, contenu, false); return; }
    } catch (e) { console.warn('window.storage indisponible pour le journal des corrections, repli sur localStorage.', e); }
    try { localStorage.setItem(CLE_CORRECTIONS_EXTRACTION, contenu); } catch (e) { console.warn('Sauvegarde du journal des corrections impossible.', e); }
  }

  async function chargerJournalCorrections() {
    let brut = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(CLE_CORRECTIONS_EXTRACTION, false);
        if (res && res.value) brut = JSON.parse(res.value);
      }
    } catch (e) { /* on tente le repli ci-dessous */ }
    if (brut === null) {
      try {
        const local = localStorage.getItem(CLE_CORRECTIONS_EXTRACTION);
        if (local) brut = JSON.parse(local);
      } catch (e) { /* rien d'exploitable non plus ici */ }
    }
    journalCorrectionsExtraction = Array.isArray(brut)
      ? brut.filter(c => c && typeof c === 'object' && typeof c.champ === 'string')
      : [];
  }

  function journaliserCorrectionsExtraction(entrees) {
    if (!Array.isArray(entrees) || entrees.length === 0) return;
    journalCorrectionsExtraction.push(...entrees);
    // On garde les plus récentes : c'est l'état actuel de l'extraction qui intéresse, pas ses
    // erreurs d'il y a deux ans sur des regex depuis corrigées.
    if (journalCorrectionsExtraction.length > MAX_CORRECTIONS_EXTRACTION) {
      journalCorrectionsExtraction = journalCorrectionsExtraction.slice(-MAX_CORRECTIONS_EXTRACTION);
    }
    sauvegarderJournalCorrections();
    // Le panneau « Qualité de l'extraction » de l'écran À propos n'est peuplé qu'à l'ouverture de
    // cet écran (voir ouvrirAPropos) : rien à rafraîchir ici en direct, juste garder le journal à
    // jour pour la prochaine ouverture.
  }

  // Panneau « Qualité de l'extraction » (écran "À propos", voir ouvrirAPropos) : exploite enfin ce
  // journal, qui grossissait jusqu'ici sans que personne ne puisse voir quels champs l'extraction
  // rate le plus souvent — l'étude n'avait d'autre moyen de le savoir que de resignaler chaque cas
  // au fil de l'eau. Toujours mesuré sur CE POSTE uniquement (le journal est en localStorage, comme
  // le reste de l'apprentissage) : jamais transmis, jamais réutilisé pour réentraîner quoi que ce
  // soit (décision explicite, voir l'historique de diffCorrectionsExtraction).
  function renderQualiteExtraction() {
    const conteneur = document.getElementById('apropos-qualite-liste');
    const compteur = document.getElementById('apropos-qualite-compteur');
    if (!conteneur) return;
    if (compteur) compteur.textContent = String(journalCorrectionsExtraction.length);
    const stats = statistiquesCorrectionsExtraction(journalCorrectionsExtraction);
    if (stats.length === 0) {
      conteneur.innerHTML = '<p class="hint">Aucune correction enregistrée pour l’instant.</p>';
      return;
    }
    conteneur.innerHTML = stats.map(s => {
      const libelle = LIBELLES_CHAMPS_CORRECTION[s.champ] || s.champ;
      const d = s.dernier;
      const avant = d && d.valeurExtraite !== null && d.valeurExtraite !== undefined ? String(d.valeurExtraite) : '—';
      const apres = d && d.valeurCorrigee !== null && d.valeurCorrigee !== undefined ? String(d.valeurCorrigee) : '—';
      return `<div class="qualite-ligne">
        <span class="qualite-champ">${escapeHtml(libelle)}</span>
        <span class="qualite-nombre">${s.nombre}</span>
        <span class="qualite-exemple">« ${escapeHtml(avant)} » → « ${escapeHtml(apres)} »</span>
      </div>`;
    }).join('');
  }

  function viderJournalCorrections() {
    const nb = journalCorrectionsExtraction.length;
    if (nb === 0) return;
    demanderConfirmation(
      `Vider le journal des corrections (${nb} entrée${nb > 1 ? 's' : ''}) ? Cette mesure repart de zéro, sans effet sur les dossiers déjà enregistrés.`,
      () => {
        journalCorrectionsExtraction = [];
        sauvegarderJournalCorrections();
        renderQualiteExtraction();
        afficherToast('Journal des corrections vidé.', 'OK', null);
      }
    );
  }

  async function sauvegarderExclusionsMotifNom() {
    const contenu = JSON.stringify(exclusionsMotifNom);
    try {
      if (window.storage) { await window.storage.set(CLE_EXCLUSIONS_MOTIF_NOM, contenu, false); return; }
    } catch (e) { console.warn('window.storage indisponible pour les exclusions de pièces, repli sur localStorage.', e); }
    try { localStorage.setItem(CLE_EXCLUSIONS_MOTIF_NOM, contenu); } catch (e) { console.warn('Sauvegarde des exclusions de pièces impossible.', e); }
  }

  async function chargerExclusionsMotifNom() {
    let brut = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(CLE_EXCLUSIONS_MOTIF_NOM, false);
        if (res && res.value) brut = JSON.parse(res.value);
      }
    } catch (e) { /* on tente le repli ci-dessous */ }
    if (brut === null) {
      try {
        const local = localStorage.getItem(CLE_EXCLUSIONS_MOTIF_NOM);
        if (local) brut = JSON.parse(local);
      } catch (e) { /* rien d'exploitable non plus ici */ }
    }
    exclusionsMotifNom = (brut && typeof brut === 'object' && !Array.isArray(brut)) ? brut : {};
  }

  // Un nom de fichier déjà normalisé (voir normaliserNomPourMotif) est-il exclu pour cette pièce ?
  function estNomExcluPourPiece(cle, nomNormalise) {
    const liste = exclusionsMotifNom[cle];
    return Array.isArray(liste) && liste.includes(nomNormalise);
  }

  // Enregistre l'exclusion (idempotent : un même nom ne s'ajoute jamais deux fois pour la même
  // pièce) et persiste immédiatement.
  function exclureNomPourPiece(cle, nomNormalise) {
    if (!nomNormalise) return;
    if (!Array.isArray(exclusionsMotifNom[cle])) exclusionsMotifNom[cle] = [];
    if (!exclusionsMotifNom[cle].includes(nomNormalise)) exclusionsMotifNom[cle].push(nomNormalise);
    sauvegarderExclusionsMotifNom();
  }

  // ---- apprentissage des constats d'Outil 2 (Audit des actes) ----
  // Demandé par l'étude : « un outil d'apprentissage pour l'Outil 2 ». Ce qu'il apprend, choisi
  // avec elle : les constats qu'elle ÉCARTE (faux positifs du modèle, ou remarques sans intérêt
  // pour sa pratique) et ceux qu'elle CONFIRME comme pertinents. Au prochain audit, un constat à
  // formulation proche est affiché REPLIÉ « déjà écarté précédemment » — jamais supprimé en
  // silence : le modèle local se trompe, l'étude aussi peut s'être trompée une fois, et un constat
  // qui revient sur un autre acte n'est pas forcément le même problème — ou remonté en tête comme
  // « confirmé lors d'un audit précédent ».
  // Même mécanique de similarité que les corrections apprises d'Outil 1 (Jaccard sur les mots de
  // 3 lettres et plus, dates/nombres neutralisés), sur une empreinte titre + extrait cité : l'extrait
  // est du texte littéral de l'acte, stable d'un audit à l'autre sur une même trame, là où le titre
  // et la description sont reformulés par le modèle à chaque appel. Seuil plus bas que pour les
  // corrections de dates (0.5 contre 0.6) : l'effet d'une reconnaissance n'est qu'un repli ou un
  // badge, jamais une décision prise à la place de l'étude — on peut se permettre d'être un peu
  // plus large. Stocké à part (clé propre), jamais mélangé aux corrections de dates/engagements.
  const CLE_MEMOIRE_AUDIT = 'audit-constats-memoire';
  const SEUIL_SIMILARITE_AUDIT = 0.5;
  const MAX_CONSTATS_MEMORISES = 500;
  let memoireAuditConstats = [];

  async function sauvegarderMemoireAudit() {
    const contenu = JSON.stringify(memoireAuditConstats);
    try {
      if (window.storage) { await window.storage.set(CLE_MEMOIRE_AUDIT, contenu, false); return; }
    } catch (e) { console.warn('window.storage indisponible pour la mémoire d’audit, repli sur localStorage.', e); }
    try { localStorage.setItem(CLE_MEMOIRE_AUDIT, contenu); } catch (e) { console.warn('Sauvegarde de la mémoire d’audit impossible.', e); }
  }

  async function chargerMemoireAudit() {
    let brut = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(CLE_MEMOIRE_AUDIT, false);
        if (res && res.value) brut = JSON.parse(res.value);
      }
    } catch (e) { /* on tente le repli ci-dessous */ }
    if (brut === null) {
      try {
        const local = localStorage.getItem(CLE_MEMOIRE_AUDIT);
        if (local) brut = JSON.parse(local);
      } catch (e) { /* rien d'exploitable non plus ici */ }
    }
    memoireAuditConstats = Array.isArray(brut)
      ? brut.filter(c => c && typeof c === 'object' && Array.isArray(c.tokens) && (c.decision === 'ecarte' || c.decision === 'confirme'))
      : [];
  }

  // Empreinte d'un constat : ses mots discriminants (titre + premier extrait cité, ou description
  // à défaut d'extrait). Le titre seul serait trop court ; la description seule est réécrite par
  // le modèle à chaque audit.
  function empreinteConstat(constat) {
    if (!constat) return new Set();
    const sources = Array.isArray(constat.sources) ? constat.sources : [];
    const extrait = sources.map(s => s && s.extrait).find(Boolean) || '';
    const texte = [constat.titre || constat.label || '', extrait || constat.description || constat.message || ''].join(' ');
    return tokeniserApprentissage(normaliserTexteApprentissage(texte));
  }

  // Décision mémorisée la plus proche d'un constat, ou null. `memoire` est passée explicitement
  // (fonction pure, testable) — l'état de la page l'appelle avec memoireAuditConstats.
  function decisionPourConstat(constat, memoire) {
    const liste = Array.isArray(memoire) ? memoire : [];
    if (liste.length === 0) return null;
    const tokens = empreinteConstat(constat);
    if (tokens.size < 3) return null;
    let meilleure = null;
    let meilleurScore = SEUIL_SIMILARITE_AUDIT;
    for (const m of liste) {
      const score = similariteJaccard(tokens, new Set(m.tokens));
      if (score >= meilleurScore) { meilleure = m; meilleurScore = score; }
    }
    return meilleure;
  }

  // Enregistre (ou remplace) la décision de l'étude sur un constat, dans la mémoire passée en
  // paramètre, qu'elle renvoie mise à jour. La DERNIÈRE décision l'emporte sur un constat déjà
  // connu : écarter puis confirmer, c'est changer d'avis, pas cumuler deux avis contraires.
  function memoriserDecisionDans(memoire, constat, decision) {
    const liste = Array.isArray(memoire) ? memoire.slice() : [];
    if (decision !== 'ecarte' && decision !== 'confirme') return liste;
    const tokens = [...empreinteConstat(constat)];
    if (tokens.length < 3) return liste;
    const existante = decisionPourConstat(constat, liste);
    if (existante) {
      existante.decision = decision;
      existante.nb = (existante.nb || 1) + 1;
      existante.dateMaj = new Date().toISOString();
      return liste;
    }
    liste.push({
      id: (crypto.randomUUID ? crypto.randomUUID() : 'a-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
      tokens,
      titreExemple: String(constat.titre || constat.label || '').slice(0, 160),
      decision,
      nb: 1,
      dateMaj: new Date().toISOString()
    });
    if (liste.length > MAX_CONSTATS_MEMORISES) {
      liste.sort((a, b) => (b.nb || 1) - (a.nb || 1) || String(b.dateMaj).localeCompare(String(a.dateMaj)));
      liste.length = MAX_CONSTATS_MEMORISES;
    }
    return liste;
  }

  function memoriserDecisionConstat(constat, decision) {
    memoireAuditConstats = memoriserDecisionDans(memoireAuditConstats, constat, decision);
    sauvegarderMemoireAudit();
  }

  function oublierDecisionConstat(idMemoire) {
    memoireAuditConstats = memoireAuditConstats.filter(m => m.id !== idMemoire);
    sauvegarderMemoireAudit();
  }

  // ---- export / import (sauvegarde JSON complète du registre) ----

  function exporterDonnees() {
    if (dossiers.length === 0) {
      afficherToast('Aucun dossier à exporter pour le moment.', 'OK', null);
      return;
    }
    const contenu = JSON.stringify(dossiers, null, 2);
    const blob = new Blob([contenu], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const aujourdhui = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `registre-echeances-${aujourdhui}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Normalise un dossier venu d'un fichier externe : garantit la présence et le type de chaque
  // champ attendu, pour qu'un JSON incomplet ou bricolé à la main ne casse pas l'affichage.
  function normaliserDossierImporte(d, nomFichier) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const nom = typeof d.nom === 'string' ? d.nom.trim() : '';
    if (!nom) return null;
    const dateValide = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : '';
    const normalise = {
      id: (crypto.randomUUID ? crypto.randomUUID() : 'd-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
      nom,
      responsable: typeof d.responsable === 'string' ? d.responsable : '',
      emailAcquereur: typeof d.emailAcquereur === 'string' ? d.emailAcquereur : '',
      adresseBien: typeof d.adresseBien === 'string' ? d.adresseBien : '',
      prixVente: Number.isFinite(d.prixVente) && d.prixVente > 0 ? d.prixVente : null,
      // Comme offrePretStatut : dérivé d'un PDF local, jamais importé tel quel d'une autre machine
      // sans revérification (voir le commentaire déjà existant sur offrePretStatut ci-dessous).
      montantPret: null,
      pret: dateValide(d.pret),
      acte: dateValide(d.acte),
      ventebien: dateValide(d.ventebien),
      autres: Array.isArray(d.autres)
        ? d.autres.filter(a => a && typeof a === 'object' && dateValide(a.date))
            .map(a => ({ label: typeof a.label === 'string' && a.label.trim() ? a.label : 'Autre échéance', date: a.date, page: Number.isInteger(a.page) ? a.page : null }))
        : [],
      pretPage: Number.isInteger(d.pretPage) ? d.pretPage : null,
      actePage: Number.isInteger(d.actePage) ? d.actePage : null,
      ventebienPage: Number.isInteger(d.ventebienPage) ? d.ventebienPage : null,
      sansPret: d.sansPret === true,
      // Conservé à l'import (contrairement aux statuts dérivés des PDF du NAS, remis à zéro) :
      // « la vente préalable est faite » est une décision prise par l'étude, pas une lecture de
      // fichier — la réimporter à zéro lui redemanderait de refaire ce travail.
      echeancesValidees: (d.echeancesValidees && typeof d.echeancesValidees === 'object' && !Array.isArray(d.echeancesValidees))
        ? Object.fromEntries(Object.entries(d.echeancesValidees).filter(([, v]) => v === true))
        : {},
      typeVente: (d.typeVente === 'copropriete' || d.typeVente === 'terrain') ? d.typeVente : 'maison',
      roleNotaire: d.roleNotaire === 'participant' ? 'participant' : 'instrumentaire',
      // Notaires des deux parties : une lecture de l'acte lui-même (ou une saisie de l'étude), la
      // même sur n'importe quel poste — conservés tels quels à l'import, comme adresseBien, et
      // contrairement aux statuts dérivés d'un scan du NAS.
      notaireVendeur: typeof d.notaireVendeur === 'string' ? d.notaireVendeur : '',
      notaireAcquereur: typeof d.notaireAcquereur === 'string' ? d.notaireAcquereur : '',
      coteInstrumentaire: (d.coteInstrumentaire === 'vendeur' || d.coteInstrumentaire === 'acquereur') ? d.coteInstrumentaire : null,
      notairesDetectes: Array.isArray(d.notairesDetectes)
        ? d.notairesDetectes.filter(n => n && typeof n === 'object' && typeof n.nom === 'string' && n.nom)
            .map(n => ({ nom: n.nom, role: (n.role === 'instrumentaire' || n.role === 'participant') ? n.role : null }))
        : [],
      // Choix de l'étude sur QUELLES pièces suivre pour ce dossier précis (pas dérivé d'un scan de
      // PDF local, contrairement à `pieces` juste en dessous, qui repart bien à {}) : conservés tels
      // quels à l'import, comme `autres` ci-dessus.
      piecesRetirees: Array.isArray(d.piecesRetirees) ? d.piecesRetirees.filter(c => typeof c === 'string') : [],
      piecesPersonnalisees: Array.isArray(d.piecesPersonnalisees)
        ? d.piecesPersonnalisees.filter(p => p && typeof p === 'object' && typeof p.cle === 'string' && typeof p.label === 'string')
            .map(p => ({ cle: p.cle, label: p.label }))
        : [],
      // Comme piecesRetirees/piecesPersonnalisees ci-dessus : un choix figé pour ce dossier, pas
      // dérivé d'un scan de PDF local, conservé tel quel à l'import. Filtré sur les clés CONNUES de
      // PIECES_ENGAGEMENTS_AUTO plutôt que sur un simple typeof string, au cas où une future
      // version retirerait une clé existante — une clé obsolète resterait sinon indéfiniment dans
      // le dossier importé sans jamais correspondre à une pièce réelle affichée.
      piecesEngagementsDetectees: Array.isArray(d.piecesEngagementsDetectees)
        ? d.piecesEngagementsDetectees.filter(c => PIECES_ENGAGEMENTS_AUTO.some(p => p.cle === c))
        : [],
      archive: d.archive === true,
      reminderDays: Array.isArray(d.reminderDays) && d.reminderDays.every(Number.isInteger) ? d.reminderDays : [15, 7],
      confiance: (d.confiance && typeof d.confiance === 'object') ? d.confiance : {},
      // Nom du PDF d'avant-contrat réellement importé à la création : une simple chaîne, la même
      // sur n'importe quel poste (c'est le nom du fichier déposé par l'étude, pas un statut dérivé
      // d'un scan local) — conservée telle quelle à l'import.
      compromisNomFichier: typeof d.compromisNomFichier === 'string' && d.compromisNomFichier ? d.compromisNomFichier : null,
      analyseJuridique: {
        // Bug corrigé : ce filtre ne gardait que les chaînes, alors que detecterDocumentsAFournir()
        // produit des objets {label, cat, cleChecklist} depuis longtemps — importer une sauvegarde
        // vidait donc silencieusement la liste des documents identifiés. Les deux formes sont
        // acceptées, comme partout ailleurs dans le fichier (voir renderDocBadge).
        documents: Array.isArray(d.analyseJuridique && d.analyseJuridique.documents)
          ? d.analyseJuridique.documents.filter(x => typeof x === 'string' || (x && typeof x === 'object' && typeof x.label === 'string'))
          : [],
        engagements: Array.isArray(d.analyseJuridique && d.analyseJuridique.engagements) ? d.analyseJuridique.engagements : [],
        conditions: Array.isArray(d.analyseJuridique && d.analyseJuridique.conditions) ? d.analyseJuridique.conditions : []
      },
      // Trace de ce que l'extraction avait compris de l'acte : conservée à l'import (c'est une
      // lecture du document lui-même, la même sur n'importe quel poste — contrairement à
      // offrePretStatut/pieces, dérivés d'un dossier LOCAL propre à la machine), mais assainie :
      // une sauvegarde produite par une version différente peut porter une structure inattendue.
      ...normaliserExtractionImportee(d),
      historique: Array.isArray(d.historique) ? d.historique.filter(h => h && h.date && h.texte) : [],
      // Le lien vers le dossier NAS, lui, reste valable : c'est un chemin sur le serveur de
      // l'étude, pas une autorisation propre à un navigateur comme l'était l'ancien handle. Les
      // STATUTS qui en dérivent repartent en revanche de zéro, comme avant : la sauvegarde peut
      // venir d'une autre installation, dont le NAS n'a pas la même arborescence.
      nasDossier: typeof d.nasDossier === 'string' && d.nasDossier ? d.nasDossier : null,
      dossierLie: typeof d.nasDossier === 'string' && !!d.nasDossier,
      fichiersTrouves: {},
      offrePretStatut: 'inconnu',
      // Comme offrePretStatut/montantPret : lues dans un PDF local propre à une machine, jamais
      // importées telles quelles — à retrouver par une vérification sur ce poste.
      garantiesPret: [],
      pieces: {},
      // nasInventaire/nasNouveaute (surveillance périodique du NAS, voir server/src/nasWatch.js)
      // sont volontairement ABSENTS d'ici, comme fichiersTrouves/pieces ci-dessus : un simple
      // listing de noms propre à l'arborescence de CE serveur, sans intérêt — et potentiellement
      // trompeur — une fois importé sur une autre installation.
      derniereRelanceAuto: null
    };
    ajouterHistorique(normalise, `Importé depuis « ${nomFichier} »`);
    return normalise;
  }

  function importerDonnees(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let brut;
      try {
        brut = JSON.parse(reader.result);
        if (!Array.isArray(brut)) throw new Error('format invalide');
      } catch (e) {
        afficherToast(`Le fichier « ${file.name} » n'est pas une sauvegarde valide.`, 'OK', null);
        event.target.value = '';
        return;
      }

      const importes = brut.map(d => normaliserDossierImporte(d, file.name)).filter(Boolean);
      const ignores = brut.length - importes.length;

      if (importes.length === 0) {
        afficherToast(`Aucun dossier exploitable dans « ${file.name} ».`, 'OK', null);
        event.target.value = '';
        return;
      }

      const messageIgnores = ignores > 0 ? ` (${ignores} entrée${ignores > 1 ? 's' : ''} illisible${ignores > 1 ? 's' : ''} ignorée${ignores > 1 ? 's' : ''})` : '';
      demanderConfirmation(`Importer ${importes.length} dossier${importes.length > 1 ? 's' : ''} depuis « ${file.name} »${messageIgnores} ? Ils seront ajoutés à votre registre actuel.`, async () => {
        // Import en masse : chaque dossier est créé individuellement (POST) sur le serveur — pas
        // de route "bulk" en V1 (voir M3 pour l'import serveur dédié à la migration initiale,
        // distinct de ce bouton "Importer (JSON)" manuel). Un id déjà présent côté serveur (import
        // d'une sauvegarde déjà partiellement importée) est simplement compté comme refusé, sans
        // bloquer les autres.
        let reussis = 0;
        for (const d of importes) {
          const ok = await sauvegarderNouveauDossier(d);
          if (ok) { dossiers.push(d); reussis++; }
        }
        render();
        const echoues = importes.length - reussis;
        const messageEchoues = echoues > 0 ? ` (${echoues} refusé${echoues > 1 ? 's' : ''} par le serveur, id déjà présent ?)` : '';
        afficherToast(`${reussis} dossier${reussis > 1 ? 's' : ''} importé${reussis > 1 ? 's' : ''}${messageEchoues}.`, 'OK', null);
      });
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  // ---- fiche A4 imprimable (analyse du dossier + procédure d'appel de fonds de l'étude) ----

  // Reprise à l'identique de la procédure interne « APPELS ET RECEPTION DES FONDS ».
  // Chaque étape porte une amorce en gras/majuscules (l'action à retenir en un coup d'œil) suivie
  // du détail en texte normal — reprend la mise en forme demandée par l'étude sur la fiche imprimée.
  const PROCEDURE_FONDS = [
    { lead: "Envoi de l'appel des fonds", suite: " à l'acquéreur au plus tard 10 jours avant le rendez-vous de signature. Envoi au client par mail avec en copie le banquier et le courtier, et envoi par courrier." },
    { lead: 'Envoyer une confirmation de rendez-vous au vendeur', suite: " par mail (ou par téléphone s'il n'a pas d'adresse mail) : lui demander de se munir de son RIB et lui envoyer son décompte vendeur." },
    { lead: 'Réceptionner tous les justificatifs de la provenance des fonds', suite: " (offre de prêt, attestation de provenance selon modèle de l'Étude ou ordre de virement transmis par la banque) et les classer dans le dossier sur le commun." },
    { lead: "Enregistrer l'appel de fonds dans le dossier commun", suite: " pour qu'à la réception, la comptabilité puisse les rattacher au bon compte et vérifier la provenance." },
    { lead: "Vérifier auprès de l'agence immobilière le déblocage du séquestre.", suite: '' },
    { lead: 'Vérifier la réception de toutes les factures à régler', suite: ' par la comptabilité (agence, syndic/copropriété) et obtenir tous les RIB.' },
    { lead: "Envoyer le projet d'acte", suite: ' au plus tard 7 jours avant le rendez-vous au vendeur, à l\u2019acquéreur et à l\u2019agence.' },
    { lead: "Surveiller l'arrivée des fonds", suite: ' et, 48 h avant le rendez-vous, prévenir les clients s\u2019il en manque.' },
    { lead: 'Confirmer aux clients la bonne réception de leurs fonds', suite: ' et leur rappeler de se munir de leurs RIB et CNI pour le rendez-vous (acquéreurs et vendeurs).' }
  ];

  function imprimerFiche(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const analyse = d.analyseJuridique || { documents: [], engagements: [], conditions: [] };
    const docs = (analyse.documents || []).map(x => typeof x === 'string' ? x : x.label);
    const engs = (analyse.engagements || []).map(x => typeof x === 'string' ? x : x.phrase);

    // Mise en page à base de <table>, avec les couleurs en style *inline* sur chaque cellule :
    // Word (et le filtre HTML de LibreOffice) ignore CSS Grid/Flexbox et, plus surprenant,
    // n'applique pas toujours les couleurs de fond définies via une classe sur une cellule de
    // tableau — seul le style inline est honoré de façon fiable à l'ouverture d'un fichier .doc.
    // acte/vente : mêmes valeurs que --acte/--ventebien (style.css), échangées sur demande de
    // l'étude (acte en vert/teal, vente préalable en bleu) — voir le commentaire dans style.css.
    const TEINTES = {
      pret:  { fond: '#FBEFD9', barre: '#B07A12' },
      acte:  { fond: '#E1F4F2', barre: '#1CA39B' },
      vente: { fond: '#E3EEF7', barre: '#2472B0' },
      autre: { fond: '#EEEEEE', barre: '#8A93A9' }
    };

    const cases = [
      d.pret ? { cls: 'pret', label: 'Obtention du prêt', date: d.pret } : null,
      d.acte ? { cls: 'acte', label: "Signature de l'acte", date: d.acte } : null,
      d.ventebien ? { cls: 'vente', label: 'Vente préalable', date: d.ventebien } : null,
      ...(d.autres || []).map(a => ({ cls: 'autre', label: a.label, date: a.date }))
    ].filter(Boolean);

    function ligneParPaquets(items, parLigne, rendu) {
      let html = '';
      for (let i = 0; i < items.length; i += parLigne) {
        const paquet = items.slice(i, i + parLigne);
        html += '<tr>' + paquet.map((it, j) => rendu(it, i + j)).join('') +
          (paquet.length < parLigne ? `<td style="border:none;background:none;" colspan="${parLigne - paquet.length}"></td>` : '') +
          '</tr>';
      }
      return html;
    }

    const echeancesHtml = cases.length
      ? `<table class="ech-table">${ligneParPaquets(cases, 4, c => {
          const t = TEINTES[c.cls];
          return `<td class="eb" style="background:${t.fond};border-left:1mm solid ${t.barre};">
            <div class="eb-l">${escapeHtml(c.label)}</div><div class="eb-d">${formatDateFr(c.date)}</div></td>`;
        })}</table>`
      : '<p class="vide">Aucune échéance enregistrée.</p>';

    const procHtml = `<table class="proc-table">${ligneParPaquets(PROCEDURE_FONDS, 2, (e, idx) =>
      `<td class="pc">
        <div class="pc-h"><span class="pc-num">${idx + 1}</span></div>
        <div class="pc-txt"><b>${escapeHtml(e.lead.toUpperCase())}</b>${escapeHtml(e.suite)}</div>
        <div class="pc-fait">☐ Fait le <u>&nbsp;</u></div>
      </td>`
    )}</table>`;

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Fiche dossier — ${escapeHtml(d.nom)}</title>
<style>
  @page { size: A4 portrait; margin: 8mm 11mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8.4pt; line-height: 1.22; color: #1a1a1a; margin: 0; }

  .head-table { width: 100%; border-collapse: collapse; border-bottom: 1.5pt solid #16233C; margin-bottom: 2.2mm; }
  .head-table td { padding: 0 0 1.5mm; border: none; vertical-align: bottom; }
  .head-table h1 { font-size: 14.5pt; margin: 0; color: #16233C; }
  .head-table .meta { font-size: 8pt; color: #555; text-align: right; white-space: nowrap; }
  .head-table .meta b { color: #16233C; }

  h2 { font-size: 12pt; margin: 0 0 1.3mm; color: #16233C; font-weight: 700; }
  .vide { color: #777; font-style: italic; margin: 0; }

  .ech-table { width: 100%; border-collapse: separate; border-spacing: 2mm; margin: 0 0 1.3mm -2mm; }
  .eb { width: 25%; border-radius: 2mm; padding: 1.5mm 3mm; vertical-align: top; }
  .eb-l { font-size: 7.3pt; color: #444; margin-bottom: 0.5mm; }
  .eb-d { font-size: 9.5pt; font-weight: 700; }

  .two-col { width: 100%; border-collapse: separate; border-spacing: 4mm 0; margin-bottom: 2.2mm; }
  .two-col td { width: 50%; vertical-align: top; padding: 1.8mm 3mm; border-radius: 2mm; }
  .two-col ul { margin: 0; padding-left: 3.8mm; }
  .two-col li { margin-bottom: 0.9mm; }

  .proc-title { margin: 0 0 2mm; }
  .proc-title .tag { font-size: 6.6pt; color: #777; font-style: italic; margin-left: 2mm; }
  .proc-table { width: 100%; border-collapse: separate; border-spacing: 3mm 1mm; margin-left: -3mm; }
  .pc { width: 50%; border: 0.6pt solid #ddd; border-radius: 2mm; padding: 1.3mm 2.8mm; background: #FAFAFA; vertical-align: top; }
  .pc-h { margin-bottom: 1mm; }
  .pc-num {
    display: inline-block; width: 5mm; height: 5mm; line-height: 5mm;
    border-radius: 50%; background: #16233C; color: #fff;
    font-size: 7.5pt; font-weight: 700; text-align: center;
  }
  .pc-txt { margin-bottom: 0.9mm; }
  .pc-fait { color: #666; font-size: 8pt; }
  .pc-fait u { text-decoration: none; border-bottom: 0.5pt solid #999; padding: 0 16mm; }

  .pied { margin-top: 1.2mm; padding-top: 0.6mm; border-top: 0.6pt solid #999; font-size: 6.6pt; color: #666; }
</style></head><body>

  <table class="head-table"><tr>
    <td><h1>${escapeHtml(d.nom)}</h1></td>
    <td class="meta">
      ${d.responsable ? 'Responsable : <b>' + escapeHtml(d.responsable) + '</b> · ' : ''}
      ${d.sansPret ? '<b>Achat comptant</b> · ' : ''}
      Édité le ${new Date().toLocaleDateString('fr-FR')}
    </td>
  </tr></table>

  <h2>1 · Échéances et points de vigilance</h2>
  ${echeancesHtml}

  <table class="two-col"><tr>
    <td style="background:#F0F7F4;border:0.6pt solid #BFE0D2;">
      <h2>Pièces à réclamer au vendeur</h2>
      ${docs.length ? `<ul>${docs.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<p class="vide">Aucune pièce identifiée.</p>'}
    </td>
    <td style="background:#EEF3FA;border:0.6pt solid #C6D9EE;">
      <h2>Engagements du vendeur</h2>
      ${engs.length ? `<ul>${engs.map(x => `<li>${escapeHtml(x.length > 140 ? x.slice(0, 140) + '…' : x)}</li>`).join('')}</ul>` : '<p class="vide">Aucun engagement relevé.</p>'}
    </td>
  </tr></table>

  <div class="proc-title"><h2 style="display:inline">2 · Procédure — Appels et réception des fonds</h2><span class="tag">(à cocher au fil du dossier)</span></div>
  ${procHtml}

  <div class="pied">
    Les procédures écrites sont des règlements de l'entreprise. En cas de non-respect (non validé par le notaire), des sanctions disciplinaires peuvent être prononcées.
    · Dates issues d'une lecture automatique du compromis : à vérifier avant usage.
  </div>
</body></html>`;

    // window.open()/print() est souvent bloqué (fenêtre surgissante) dans un navigateur ou un
    // aperçu en bac à sable : on télécharge directement un fichier Word, ouvert et imprimé
    // ensuite par le collaborateur comme n'importe quel document.
    const entete = '\ufeff<html xmlns:o="urn:schemas-microsoft-com:office:office" '
      + 'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">';
    const docComplet = html.replace('<html lang="fr">', entete);

    const blob = new Blob([docComplet], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = d.nom.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.href = url;
    a.download = `fiche-${safeName || 'dossier'}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---- dossier local (offre de prêt) : File System Access API, Chrome/Edge uniquement ----
  //
  // Limites réelles de la plateforme, non contournables :
  // - Firefox et Safari ne proposent pas cette API : le bouton est simplement masqué ailleurs.
  // - Le navigateur peut redemander l'autorisation d'accès après un certain temps ou un
  //   redémarrage ; dans ce cas un bandeau « Reconfirmer l'accès » apparaît sur le dossier.
  // - Aucune page web ne peut cliquer "Envoyer" à la place de l'utilisateur : la relance est
  //   pré-rédigée et ouverte automatiquement dans la messagerie, l'envoi final reste manuel.
  // - La vérification ne tourne que pendant que cet onglet est ouvert, pas en tâche de fond.


  // ---- suivi des pièces du dossier (checklist de constitution, selon le type de vente) ----
  //
  // Listes fournies par l'étude (voir CLAUDE.md, "Checklist de constitution d'un dossier") — deux
  // types de vente sur trois pour l'instant (maison, copropriété ; pas encore "terrain nu", à
  // ajouter le jour où l'étude fournit sa liste). Les motifs de reconnaissance sont un premier jet
  // à partir du seul intitulé de chaque pièce (pas encore confronté à de vrais titres de documents,
  // contrairement à OFFRE_PRET_RE qui a déjà été affiné sur des cas réels) : à resserrer ou élargir
  // dès qu'un vrai dossier fait remonter un faux positif/négatif, comme pour toute regex du fichier.
  // var (pas const) : mêmes raisons que OFFRE_PRET_RE, pour rester testable depuis les tests.
  //
  // **Toutes les pièces sont désormais détectées UNIQUEMENT par le NOM DU FICHIER (`motifNom`),
  // plus du tout par son contenu (`motif`, retiré partout dans ces trois listes).** Décision
  // explicite de l'étude, après une série de faux positifs par contenu qui n'étaient pas tous
  // réductibles à une clause précise à exclure : `certificatUrbanisme`/`certificatAlignement`/
  // `certificatNumerotage`/`renonciationPreemption`/`titrePropriete` avaient déjà perdu leur
  // `motif` un par un (voir l'historique dans CLAUDE.md — ce sont des conditions juridiques que le
  // compromis décrit systématiquement en boilerplate, que la pièce existe ou non, sans qu'aucune
  // formulation-piège ponctuelle ne puisse suivre "chaque agence a des clauses différentes, il y
  // en a des centaines"). Le même risque existant en germe pour les pièces restantes
  // (ERP/diagnostics/taxe foncière/assainissement/pièces de copropriété), l'étude a demandé de
  // généraliser tout de suite plutôt que d'attendre un signalement pièce par pièce. Bénéfice
  // secondaire, pas la motivation initiale mais réel : `verifierDossierLocal()` n'a plus besoin
  // d'ouvrir/lire un PDF (ni d'y recourir à l'OCR) pour vérifier une pièce, seul son nom est
  // consulté — un fichier n'est ouvert que si l'offre de prêt reste à chercher, ce qui réduit
  // nettement le nombre de PDF réellement lus sur un dossier local volumineux.
  // Listes de noms de fichiers données par l'étude pour les 4 premières pièces concernées (voir
  // CLAUDE.md) : ERP → "ERP", "état des risques et pollution" ; assainissement → "rapport
  // assainissement", "courrier assainissement", "SPANC", "assainissement" ; taxe foncière → "TF",
  // "taxes foncières" (parfois suivi de l'année) ; titre de propriété → "Titre", "titre de
  // propriété", "titre vendeur". Chaque motifNom tolère les fautes de frappe/variantes les plus
  // plausibles (accent absent ou mal placé, double lettre oubliée) SANS pour autant devenir assez
  // large pour qu'un mot commun avec une AUTRE pièce la valide par erreur (ex. "certificat
  // d'urbanisme" qui mentionnerait l'alignement en passant ne doit pas valider "Certificat
  // d'alignement", d'où l'exigence de la phrase complète plutôt que le mot seul). Les motifNom des
  // pièces de copropriété (`etatDate`/`article20`/`ribCopro`) et des dernières pièces basculées
  // (`diagnosticsTechniques`/`erp`/`avisTaxeFonciere`/`reponseAssainissement`) reprennent tels
  // quels les anciens motifs de contenu, faute d'exemples réels de noms de fichiers pour l'instant
  // — à resserrer/élargir dès qu'un vrai dossier en fait remonter un.
  var PIECES_URBANISME = [
    // "réponse urbanisme"/"réponse d'urbanisme" (alias courant côté étude pour ce même document)
    // ajouté au motifNom, en plus de "certificat d'urbanisme"/"CU a)".
    { cle: 'certificatUrbanisme', label: "Certificat d'urbanisme", motifNom: /certificat\s+d?[’']?\s*urbanisme|\bCU\s*a\)|r[ée]ponse\s+(?:d[’']?\s*)?urbanisme/i },
    // Deuxième alternative ajoutée : l'alignement et le numérotage sont parfois réunis dans UN SEUL
    // document, nommé "Alignement et numérotage"/"Certificat d'alignement et numérotage" ou une
    // variante proche — sans le mot "certificat" devant "alignement" dans ce cas, ce que la
    // première alternative (déjà en place) n'accepte pas seule. Ne PAS se contenter d'un "alignement"
    // nu pour autant : ça réintroduirait le faux positif déjà corrigé une fois (un certificat
    // d'urbanisme qui mentionne "réponse alignement voirie" en passant, voir le test de
    // non-régression juste en dessous) — la seconde alternative n'accepte donc "alignement" SANS
    // "certificat" devant que s'il est à proximité immédiate (20 caractères) du mot "numérotage",
    // dans un ordre ou l'autre : c'est spécifiquement le document combiné qui est visé, pas
    // n'importe quel fichier mentionnant "alignement".
    { cle: 'certificatAlignement', label: "Certificat d'alignement", motifNom: /certificat\s+d?[’']?\s*alignement|alignement.{0,20}num[ée]\s?rotage|num[ée]\s?rotage.{0,20}alignement/i },
    // \s? après l'accent : un fichier réel de l'étude a été nommé "...nume_rotage..." (le mot
    // "numérotage" coupé en deux à l'endroit de l'accent, très probablement une frappe accidentelle
    // d'espace dans "numé rotage" avant conversion espace→underscore) — voir CLAUDE.md.
    { cle: 'certificatNumerotage', label: 'Certificat de numérotage', motifNom: /num[ée]\s?rotage/i },
    // ass?ainissement : tolère "asainissement" (un seul "s"), faute de frappe courante.
    { cle: 'reponseAssainissement', label: 'Courrier réponse assainissement', motifNom: /ass?ainissement|\bSPANC\b/i },
    // Pas de motif de contenu (voir le commentaire structurel ci-dessus) : "préemption" seul
    // apparaît quasi systématiquement dans le corps du compromis (clause sur les conséquences
    // d'un exercice du droit de préemption), sans rapport avec une vraie renonciation obtenue.
    // "DPU" (Droit de Préemption Urbain) ajouté : nom de fichier réel de l'étude ("Renonciation au
    // DPU"), sigle assez spécifique pour être accepté seul (même principe que TF/SPANC/ERP/CU —
    // voir CLAUDE.md — pas un mot susceptible d'apparaître incidemment ailleurs dans ce contexte).
    { cle: 'renonciationPreemption', label: 'Renonciation au droit de préemption', motifNom: /pr[ée]emption|\bDPU\b/i }
  ];
  var PIECES_AUTRES = [
    { cle: 'diagnosticsTechniques', label: 'Diagnostics techniques', motifNom: /diagnostics?|\bDDT\b/i },
    // "ERP" est ambigu dans le CORPS DU TEXTE (aussi "Établissement Recevant du Public"), mais pas
    // dans un NOM DE FICHIER d'un dossier de vente d'une maison, où "ERP.pdf" désigne sans
    // ambiguïté l'état des risques et pollutions (un ERP au sens accessibilité n'a pas sa place
    // dans ce type de vente) — motifNom peut donc se permettre le sigle seul.
    { cle: 'erp', label: 'ERP (état des risques et pollution)', motifNom: /\bERP\b|[ée]tat\s+des\s+risques(?:\s+et\s+pollutions?)?/i },
    // \bTF\b avant les chiffres d'une année éventuelle ("TF 2024.pdf") : pas besoin de motif
    // spécifique, \b ne consomme aucun caractère et laisse la suite du nom de fichier de côté.
    // \s? après l'accent de "foncière" : même précaution que "numérotage" ci-dessus.
    { cle: 'avisTaxeFonciere', label: 'Avis de taxe foncière', motifNom: /\bTF\b|taxes?\s+fonci[èe]\s?re/i },
    // Pas de motif de contenu (voir le commentaire structurel plus haut) : "les titres de
    // propriété ne devront révéler aucune charge..." est une clause de condition suspensive
    // quasi systématique du compromis, sans rapport avec la production réelle des titres.
    // "titre" seul valide déjà (fichier couramment nommé juste "Titre.pdf" dans les dossiers de
    // l'étude) ; le groupe optionnel ne fait qu'accepter EN PLUS "titre de propriété"/"titre
    // vendeur" sans les exiger. \s? après chaque accent de "propriété" : même précaution que
    // "numérotage"/"foncière" ci-dessus (deux positions ici, "propri[é]" et "t[é]").
    { cle: 'titrePropriete', label: 'Titre de propriété', motifNom: /titre(?:\s+de\s+propri[ée]\s?t[ée]\s?|\s+vendeur)?/i }
  ];
  var PIECES_COPROPRIETE = [
    { cle: 'etatDate', label: 'État daté', motifNom: /[ée]tat\s+dat[ée]/i },
    { cle: 'article20', label: 'Article 20-II', motifNom: /article\s*20[\s.-]*(?:ii|2)\b/i },
    { cle: 'ribCopro', label: 'RIB de la copropriété', motifNom: /\bRIB\b[^\n]{0,50}(?:copropri[ée]t[ée]|syndic)|(?:copropri[ée]t[ée]|syndic)[^\n]{0,50}\bRIB\b/i }
  ];
  // Pour un terrain à bâtir : mêmes pièces "autres" qu'une maison (ERP, taxe foncière, titre de
  // propriété — voir PIECES_AUTRES ci-dessus), à une exception près demandée par l'étude : pas de
  // diagnostics techniques (DPE, plomb...), qui n'ont pas de sens sur un terrain nu, remplacés par
  // une étude de sol. Dérivée de PIECES_AUTRES par substitution plutôt que recopiée à la main : les
  // trois autres pièces restent automatiquement synchronisées si elles sont un jour retouchées
  // là-bas, pas besoin d'y penser une seconde fois ici.
  var PIECES_TERRAIN_AUTRES = PIECES_AUTRES.map(p => p.cle === 'diagnosticsTechniques'
    ? { cle: 'etudeSol', label: 'Étude de sol', motifNom: /[ée]tude\s+de\s+sol|\bG1\b|\bG2\b/i }
    : p);

  // Pièces ajoutées automatiquement à la checklist d'UN dossier précis quand le compromis mentionne
  // le document correspondant (voir `cleChecklist` sur DOCUMENTS_VENDEUR_CONNUS). Même forme que
  // les autres pièces standard (`cle`/`label`/`motifNom`) : réutilisent sans aucun changement toute
  // la mécanique déjà en place (recherche dans le dossier local par `verifierDossierLocal()`,
  // retrait via `retirerPieceStandard()`, préremplissage à "manquante" au premier lien...) — ce ne
  // sont PAS des pièces personnalisées (`personnalisee`), qui n'ont pas de motifNom et ne sont
  // retrouvées que par sous-chaîne de leur libellé.
  // `motifNom` volontairement plus permissif que le `motif` de contenu du compromis ci-dessus : un
  // fichier réel s'appelle plus souvent "Entretien chaudière.pdf"/"Facture ramonage.pdf" que
  // "Justificatif d'entretien de la chaudière.pdf" — même principe que les autres motifNom du
  // fichier (voir normaliserNomPourMotif juste plus bas pour la normalisation appliquée avant test).
  // Étendu de 3 à toute la liste des documents connus sur demande explicite de l'étude : ces motifs
  // sont un premier jet, écrits à partir du seul intitulé de chaque pièce (comme les PIECES_* en
  // leur temps) — à resserrer/élargir dès qu'un vrai dossier fait remonter un problème. Écrits
  // assez spécifiques pour ne pas se déclencher sur le nom d'un autre document du même dossier :
  // "piscine" seul suffit (aucun autre document d'une vente ne le contient), "conformité" seul non
  // (trop courant), d'où les tournures composées.
  var PIECES_ENGAGEMENTS_AUTO = [
    { cle: 'ramonage', label: 'Ramonage (attestation ou facture)', motifNom: /ramonage/i },
    { cle: 'entretienChaudiere', label: 'Entretien de la chaudière', motifNom: /entretien.{0,20}chaudi[èe]re|chaudi[èe]re.{0,20}entretien|contrat.{0,20}chaudi[èe]re/i },
    { cle: 'entretienPac', label: 'Entretien de la pompe à chaleur (PAC)', motifNom: /entretien.{0,20}(?:pompe\s+[àa]\s+chaleur|\bpac\b)|(?:pompe\s+[àa]\s+chaleur|\bpac\b).{0,20}entretien/i },
    { cle: 'entretienClim', label: 'Entretien de la climatisation', motifNom: /climatisation|\bclim\b/i },
    { cle: 'vidangeFosse', label: 'Vidange de la fosse septique', motifNom: /fosse|vidange/i },
    { cle: 'entretienAdoucisseur', label: "Entretien de l'adoucisseur d'eau", motifNom: /adoucisseur/i },
    { cle: 'debroussaillage', label: 'Débroussaillage / élagage', motifNom: /d[ée]\s?broussaill|[ée]lagage/i },
    { cle: 'travauxRemiseEtat', label: 'Travaux de remise en état', motifNom: /remise\s*en\s*[ée]\s?tat|remise\s*en\s*etat/i },
    { cle: 'miseEnConformite', label: 'Régularisation / mise en conformité', motifNom: /mise\s*en\s*conformit[ée]|r[ée]\s?gularisation/i },
    { cle: 'cuveCiterne', label: 'Enlèvement / neutralisation de cuve ou citerne', motifNom: /citerne|cuve\s*[àa]?\s*(?:fioul|mazout|gaz)?|d[ée]\s?gazage/i },
    { cle: 'debarras', label: 'Débarras des encombrants', motifNom: /d[ée]\s?barras|encombrants/i },
    { cle: 'attestationConformite', label: 'Attestation de conformité', motifNom: /consuel|(?:attestation|certificat).{0,20}conformit[ée]/i },
    { cle: 'garantieDecennale', label: 'Garantie décennale', motifNom: /d[ée]\s?cennale/i },
    { cle: 'dommageOuvrage', label: 'Assurance dommage-ouvrage', motifNom: /dommages?[\s-]*ouvrage/i },
    { cle: 'facturesTravaux', label: 'Factures des travaux réalisés', motifNom: /factures?.{0,20}travaux|travaux.{0,20}factures?/i },
    { cle: 'etatParasitaire', label: 'État parasitaire / mérule', motifNom: /parasitaire|m[ée]\s?rule|termites?/i },
    { cle: 'auditEnergetique', label: 'Audit énergétique', motifNom: /audit\s*[ée]\s?nerg/i },
    { cle: 'securitePiscine', label: 'Conformité sécurité piscine', motifNom: /piscine/i },
    { cle: 'resiliationContrat', label: 'Justificatif de résiliation de contrat', motifNom: /r[ée]\s?siliation/i }
  ];

  // Bug corrigé : signalé par l'étude, un certificat d'urbanisme mentionne couramment dans son
  // PROPRE texte l'existence d'autres certificats ("Le certificat de numérotage est à demander à
  // l'Hôtel de Ville... Le certificat d'alignement est à demander à la même adresse...") sans être
  // lui-même l'un d'eux — ce texte suffisait pourtant à cocher ces deux pièces comme reçues à
  // partir du seul certificat d'urbanisme. La formulation exacte varie d'un document à l'autre
  // (l'étude l'a confirmé), d'où un motif générique de RENVOI plutôt qu'une phrase figée : la
  // présence de ce renvoi à proximité immédiate d'une occurrence de piece.motif empêche de
  // retenir CETTE occurrence précise (une autre occurrence plus loin dans le même texte, sans ce
  // renvoi à proximité, resterait valable).
  var RE_SIMPLE_RENVOI_PIECE = /(?:est|sont)\s+à\s+demander|(?:peut|peuvent|doit|doivent)\s+[êe]tre\s+demand[ée]s?|s['’]obtiennent?|se\s+demandent?|d[ée]livr[ée]s?\s+(?:par|sur\s+demande)|sur\s+demande\s+(?:à|aupr[èe]s)/i;

  // Fenêtre de 80 caractères avant/après l'occurrence (même ordre de grandeur que
  // extraireContexte() ailleurs dans le fichier) : assez large pour couvrir "Le certificat de
  // numérotage [...] est à demander à l'Hôtel de Ville" (le verbe de renvoi arrive après le nom du
  // document, pas juste à côté), sans déborder sur une clause sans rapport.
  function motifPieceTrouve(motif, texte) {
    const re = new RegExp(motif.source, motif.flags.includes('g') ? motif.flags : motif.flags + 'g');
    let m;
    while ((m = re.exec(texte)) !== null) {
      const debut = Math.max(0, m.index - 80);
      const fin = Math.min(texte.length, m.index + m[0].length + 80);
      if (!RE_SIMPLE_RENVOI_PIECE.test(texte.slice(debut, fin))) return true;
      if (re.lastIndex === m.index) re.lastIndex++; // motif pouvant matcher une chaîne vide : évite une boucle infinie
    }
    return false;
  }

  // Les motifNom ci-dessus utilisent \s+ (espace) comme séparateur naturel du français, mais les
  // vrais noms de fichiers de l'étude remplacent couramment les espaces par des underscores/tirets
  // (ex. "Certificat_alignement_et_nume_rotage_DI_132.pdf") — sans cette normalisation, \s+ ne
  // matcherait jamais un tel nom. Testé UNIQUEMENT contre motifNom (le nom de fichier), jamais
  // contre motif (le contenu du PDF, un vrai texte qui n'a pas ce problème). Signalé par l'étude
  // sur un fichier réel qui ne remontait pas.
  // Bug corrigé : un dossier zippé/synchronisé depuis un Mac (confirmé sur un vrai dossier envoyé
  // par l'étude, "NEW_DOSSIER.zip", dossier __MACOSX + .DS_Store) nomme ses fichiers en Unicode
  // NFD (décomposé) plutôt que NFC (composé) : "foncières" y est stocké comme "e" + un caractère
  // ACCENT GRAVE COMBINANT séparé (U+0300), pas le seul caractère "è" (U+00E8) que motifNom
  // attend. Invisible à l'œil (le nom s'affiche identique dans n'importe quel explorateur de
  // fichiers/éditeur/console.log) et donc indiscernable d'un motif mal écrit — exactement ce qui
  // a fait echouer TROIS revérifications successives de `avisTaxeFonciere.motifNom` sur des noms
  // de fichiers en apparence corrects ("Avis de Taxes foncières.pdf" ne matchait jamais, alors que
  // la regex elle-même était juste). `.normalize('NFC')` recompose chaque lettre accentuée en un
  // seul caractère avant tout test de motifNom — sans effet sur un nom déjà en NFC (cas normal
  // d'un fichier nommé sous Windows, l'environnement réel de l'étude), donc aucune régression
  // possible sur les dossiers déjà correctement détectés.
  function normaliserNomPourMotif(nom) {
    return nom.normalize('NFC').replace(/[_-]+/g, ' ');
  }

  // Pour les champs de recherche de dossier (Suivi, Tableau de bord) : accents et majuscules ne
  // doivent pas empêcher de retrouver un dossier ("depont" doit trouver "Dupont", "eleonore" doit
  // trouver "Éléonore") — demandé par l'étude. Sans rapport avec normaliserNomPourMotif() ci-dessus
  // (qui RECOMPOSE un accent décomposé pour un test de nom de fichier exact, sans jamais le
  // retirer) : ici on décompose au contraire chaque lettre accentuée (NFD) puis on retire les
  // diacritiques ainsi isolés, avant de comparer en minuscules.
  function normaliserPourRecherche(texte) {
    return (texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // Ordre d'affichage = ordre des listes fournies par l'étude : urbanisme (commun aux trois types),
  // puis les pièces propres à la copropriété si applicable, puis le reste, puis les pièces
  // auto-détectées depuis un engagement du compromis (voir PIECES_ENGAGEMENTS_AUTO ci-dessus),
  // puis enfin les pièces personnalisées ajoutées à la main.
  // `d` (optionnel, absent avant l'enregistrement du dossier — voir majApercuPieces) permet de
  // personnaliser la checklist standard pour CE dossier précis, demandé par l'étude : `d.piecesRetirees`
  // (tableau de clés) masque des pièces standard OU auto-détectées non pertinentes pour ce dossier ;
  // `d.piecesPersonnalisees` (tableau de {cle, label}) ajoute des pièces propres à ce dossier, sans
  // toucher aux listes PIECES_* partagées par tous les autres dossiers du même type de vente ;
  // Les pièces détectées depuis les documents du compromis viennent de DEUX sources réunies :
  // `d.piecesEngagementsDetectees` (calculé une fois à la création, voir ajouterDossier) et, en
  // plus, un recalcul à l'affichage depuis `d.analyseJuridique.documents`, lui bien conservé sur
  // le dossier. Ce second chemin rend la fonctionnalité RÉTROACTIVE, demandé explicitement par
  // l'étude : un dossier créé avant l'élargissement de `cleChecklist` à tous les documents (ou
  // avant l'existence même de ce champ) voit malgré tout ses documents apparaître dans la
  // checklist, sans avoir à le recréer.
  function clesChecklistDepuisDocuments(documents) {
    const cles = [];
    (documents || []).forEach(doc => {
      // Un document déjà porteur de sa clé (dossier récent) ; sinon on la retrouve par son
      // libellé, qui est la seule chose stockée sur les dossiers plus anciens.
      const cle = (doc && typeof doc === 'object' && doc.cleChecklist)
        ? doc.cleChecklist
        : (DOCUMENTS_VENDEUR_CONNUS.find(x => x.label === (typeof doc === 'string' ? doc : doc && doc.label)) || {}).cleChecklist;
      if (cle && !cles.includes(cle)) cles.push(cle);
    });
    return cles;
  }

  function checklistPieces(typeVente, d) {
    const base = typeVente === 'copropriete'
      ? [...PIECES_URBANISME, ...PIECES_COPROPRIETE, ...PIECES_AUTRES]
      : typeVente === 'terrain'
        ? [...PIECES_URBANISME, ...PIECES_TERRAIN_AUTRES]
        : [...PIECES_URBANISME, ...PIECES_AUTRES];
    if (!d) return base;
    const retirees = new Set(d.piecesRetirees || []);
    const standard = base.filter(p => !retirees.has(p.cle));
    const detectees = new Set([
      ...(d.piecesEngagementsDetectees || []),
      ...clesChecklistDepuisDocuments(d.analyseJuridique && d.analyseJuridique.documents)
    ]);
    // Une clé déjà présente dans la checklist standard (assainissement, diagnostics) ne doit pas
    // apparaître une seconde fois : la pièce standard, plus précise, l'emporte.
    const clesStandard = new Set(standard.map(p => p.cle));
    const auto = PIECES_ENGAGEMENTS_AUTO
      .filter(p => detectees.has(p.cle) && !retirees.has(p.cle) && !clesStandard.has(p.cle))
      .map(p => ({ ...p, autoEngagement: true }));
    const perso = (d.piecesPersonnalisees || []).map(p => ({ cle: p.cle, label: p.label, personnalisee: true }));
    return [...standard, ...auto, ...perso];
  }
  // "Offre de crédit (immobilier)" est une formulation bancaire tout aussi courante que "offre de
  // prêt" pour désigner le même document — à ne pas retirer sans revérifier ce cas.
  // Bug corrigé : ce motif servait jusqu'ici à reconnaître l'offre de prêt dans le CONTENU du PDF
  // (verifierDossierLocal() ouvrait et lisait chaque fichier). Signalé par l'étude : trop d'erreurs
  // en usage réel (polices embarquées mal encodées produisant un texte extrait illisible, ou à
  // l'inverse un autre document mentionnant l'offre en passant sans être l'offre elle-même) — même
  // classe de problème déjà résolue pour la checklist de pièces en abandonnant la lecture de
  // contenu au profit du seul nom de fichier (voir CLAUDE.md, "TOUTES les pièces de la checklist
  // sont désormais détectées uniquement par le NOM DU FICHIER"). Ce motif sert donc désormais
  // exclusivement à tester le NOM DU FICHIER (normalisé — voir normaliserNomPourMotif), plus jamais
  // son contenu : \s+ devient \s* pour couvrir aussi un nom concaténé sans séparateur
  // ("OffreDePret.pdf" — la casse n'a pas d'importance, le motif est insensible à la casse), en plus
  // des noms espacés ("Offre de prêt.pdf") ou à séparateurs underscore/tiret (déjà normalisés en
  // espaces avant ce test). "Accord de prêt" ajouté, autre intitulé bancaire réel pour ce document.
  // "Contrat de crédit"/"contrat de prêt" ajoutés ensuite, sur demande de l'étude : certains
  // établissements nomment le document remis à l'emprunteur "contrat" plutôt que "offre", une fois
  // signé/accepté (couvre aussi "Contrat de crédit immobilier.pdf" grâce au \s* déjà en place).
  // var (pas const) : exposée globalement comme les fonctions du fichier, pour rester testable
  // depuis tests/helpers/load-app.js sans dupliquer le motif dans les tests.
  var OFFRE_PRET_RE = /offre\s*de\s*pr[êe]t|offre\s*pr[ée]alable\s*de\s*cr[ée]dit|offre\s*de\s*cr[ée]dit|offre\s*de\s*financement|accord\s*de\s*pr[êe]t|contrat\s*de\s*cr[ée]dit|contrat\s*de\s*pr[êe]t/i;

  // ==== OFFRE DE PRÊT : reconnaissance par le titre de la page de garde ====
  // Troisième méthode de reconnaissance de ce document, après le contenu intégral (abandonné :
  // polices embarquées illisibles, autres documents mentionnant l'offre en passant) puis le seul
  // nom du fichier (abandonné à son tour, l'étude signalant « trop d'erreur » — un nom de fichier
  // est saisi à la main et ne dit rien du contenu réel). Méthode demandée explicitement par
  // l'étude, en trois filtres cumulés, du moins cher au plus cher :
  //   1. NOMBRE DE PAGES — « une offre de prêt fait au minimum 10 pages, ignorer tout document de
  //      moins de 6 pages ». Seuil volontairement placé sous les 10 pages annoncées : c'est un
  //      filtre de sécurité destiné à écarter les courriers et attestations d'une ou deux pages,
  //      pas à rejeter une offre un peu courte sur un prêt simple.
  //   2. TITRE de la page de garde — et lui seul, pas tout le document : un acte qui PARLE de
  //      l'offre de prêt n'a pas ce titre en tête de sa première page.
  //   3. CONFIRMATION par le modèle IA local (voir confirmerOffrePretIa) — un titre peut coïncider
  //      sans que le document en soit un ; le modèle tranche sur la page de garde entière.
  var MIN_PAGES_OFFRE_PRET = 6;
  var LONGUEUR_TITRE_PDF = 600; // « page de garde » retenue comme titre : le haut de la page 1

  // Le texte d'une page de PDF arrive en fragments dont l'espacement ne reflète pas la mise en
  // page : on le remet à plat avant tout test de motif, comme ailleurs dans ce fichier.
  function titrePagePdf(textePremierePage) {
    return (textePremierePage || '').replace(/\s+/g, ' ').trim().slice(0, LONGUEUR_TITRE_PDF);
  }

  // Garanties du prêt, lues dans le texte de l'offre une fois celle-ci identifiée (demandé par
  // l'étude, affiché dans la carte « Obtention du prêt »). Plusieurs peuvent s'appliquer au même
  // prêt — l'étude a explicitement dit « et/ou » : le résultat est donc une liste, jamais une
  // valeur unique.
  // « Privilège de prêteur de deniers » est l'ancien nom de l'hypothèque légale spéciale du même
  // nom (réforme des sûretés de 2021) : les deux formulations coexistent dans les offres réelles,
  // les deux sont reconnues sous la même clé puisqu'elles désignent la même garantie.
  // Les quatre réponses possibles données par l'étude sont un cumul de ces clés : aucune garantie,
  // caution, hypothèque légale de prêteur de deniers, ou cette dernière AVEC l'hypothèque
  // conventionnelle. `sansGarantie` n'a pas de motif : elle n'est jamais cherchée, elle est le
  // résultat d'un paragraphe « GARANTIES » qui n'annonce aucune des trois autres.
  var GARANTIES_PRET = [
    { cle: 'sansGarantie', label: 'Sans garanties', motif: null },
    { cle: 'caution', label: 'Caution', motif: /cautionnement|soci[ée]t[ée]\s+de\s+caution|caution\s+(?:solidaire|mutuelle|bancaire)|cr[ée]dit\s+logement|\bcaution\b/i },
    { cle: 'hypothequeLegale', label: 'Hypothèque légale de prêteur de deniers', motif: /pr[êe]teur\s+de\s+deniers|privil[èe]ge\s+de\s+pr[êe]teur|h[yi]poth[èe]que\s+l[ée]gale\s+sp[ée]ciale/i },
    { cle: 'hypothequeConventionnelle', label: 'Hypothèque conventionnelle', motif: /h[yi]poth[èe]que\s+conventionnelle/i }
  ];

  // Une offre de prêt porte un paragraphe intitulé « GARANTIES » (parfois « GARANTIE » /
  // « SÛRETÉS ») qui énumère ce que le prêteur exige. Le reste du document parle abondamment
  // d'hypothèque et de caution à d'autres titres (clauses générales, frais, informations
  // précontractuelles) : chercher dans tout le texte remontait donc des garanties qui ne sont pas
  // celles de CE prêt. On se limite désormais à ce paragraphe.
  // Tolère les numérotations réelles des offres : « GARANTIES », « 7. GARANTIES »,
  // « Article 7 - GARANTIES », « § 4 – SÛRETÉS ». Deux mises en page coexistent et sont toutes
  // deux acceptées : le titre seul sur sa ligne, ou « GARANTIES : » suivi du contenu sur la même
  // ligne. Toujours ancré en DÉBUT DE LIGNE, et le deux-points est obligatoire dans le second cas
  // — sans quoi « les garanties sont acquises au prêteur » au fil d'une phrase passerait pour un
  // titre de paragraphe.
  var RE_TITRE_GARANTIES = /^[^\S\n]*(?:(?:article|art\.?|§)[^\S\n]*)?\d{0,2}[^\S\n]*[-–—.)]?[^\S\n]*(?:garanties?|s[ûu]ret[ée]s?)(?:[^\S\n]+(?:du[^\S\n]+pr[êe]t|exig[ée]es?|r[ée]elles?))?[^\S\n]*(?::|$)/im;
  // Fin du paragraphe : le titre de section suivant (une ligne courte en capitales), ou à défaut
  // une fenêtre généreuse — une énumération de garanties tient largement dedans.
  var RE_TITRE_SECTION_SUIVANTE = /^[^\S\n]*[A-ZÀ-Ü][A-ZÀ-Ü0-9'’\s,.\-()]{4,80}[^\S\n]*$/m;
  var LONGUEUR_MAX_PARAGRAPHE_GARANTIES = 2500;

  // Extrait le paragraphe « GARANTIES » de l'offre. Renvoie '' si l'offre n'en porte pas —
  // l'appelant retombe alors sur « Sans garanties », voir detecterGarantiesPret.
  function extraireParagrapheGaranties(texte) {
    const source = String(texte || '');
    const titre = RE_TITRE_GARANTIES.exec(source);
    if (!titre) return '';
    // On repart de la FIN du titre, jamais du premier `\n` trouvé après son index de départ : ce
    // dernier pouvait retomber sur le saut de ligne PRÉCÉDANT le titre, et le paragraphe avalait
    // alors la section suivante en entier (une hypothèque citée sous « ASSURANCES » remontait
    // ainsi comme garantie du prêt).
    const reste = source.slice(titre.index + titre[0].length, titre.index + titre[0].length + LONGUEUR_MAX_PARAGRAPHE_GARANTIES);
    const suivant = reste.search(RE_TITRE_SECTION_SUIVANTE);
    return suivant > 0 ? reste.slice(0, suivant) : reste;
  }

  // Les quatre réponses possibles listées par l'étude sont un CUMUL des trois clés ci-dessus :
  // aucune (« Sans garanties »), caution, hypothèque légale de prêteur de deniers, ou cette
  // dernière AVEC l'hypothèque conventionnelle. On renvoie donc toujours une liste de clés, dont
  // libellesGarantiesPret tire la phrase affichée.
  function detecterGarantiesPret(texte) {
    const paragraphe = extraireParagrapheGaranties(texte);
    // Aucun paragraphe « GARANTIES » : on ne sait pas, et ne pas savoir n'est pas « sans
    // garantie » — la fiche n'affiche alors rien plutôt qu'une affirmation fausse.
    if (!paragraphe) return [];
    const trouvees = GARANTIES_PRET.filter(g => g.motif && g.motif.test(paragraphe)).map(g => g.cle);
    // Le paragraphe existe mais n'énonce aucune des garanties connues : c'est une vraie réponse,
    // la première des quatre listées par l'étude.
    return trouvees.length ? trouvees : ['sansGarantie'];
  }

  function libellesGarantiesPret(cles) {
    return (cles || [])
      .map(cle => (GARANTIES_PRET.find(g => g.cle === cle) || {}).label)
      .filter(Boolean);
  }

  // Demande au modèle IA local (Ollama, via le serveur — voir server/src/routes/offrePret.js) de
  // confirmer que la page de garde reconnue est bien celle d'une offre/d'un contrat de prêt.
  // `disponible: false` couvre tout ce qui empêche une réponse (modèle non installé, serveur
  // injoignable, version de l'outil sans cette route) : l'appelant en fait alors un statut « à
  // confirmer », jamais un rejet — ne pas pouvoir demander n'est pas une réponse négative.
  async function confirmerOffrePretIa(titre) {
    try {
      const reponse = await fetchAvecAuth('/api/offre-pret/confirmer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ titre })
      });
      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => ({}));
        return { disponible: false, estOffrePret: false, raison: corps.erreur || `erreur ${reponse.status}` };
      }
      const data = await reponse.json();
      return { disponible: true, estOffrePret: data.estOffrePret === true, raison: data.raison || '' };
    } catch (e) {
      return { disponible: false, estOffrePret: false, raison: e.message };
    }
  }

  // ==== DOSSIERS DU NAS : le SERVEUR lit les fichiers, plus le navigateur ====
  // Remplace entièrement l'ancien mécanisme fondé sur l'API File System Access
  // (`showDirectoryPicker()` + handles conservés en IndexedDB). Raison, tranchée avec l'étude :
  // cette API n'existe QUE dans un contexte sécurisé (localhost ou HTTPS). Les collaborateurs qui
  // rejoignent l'outil par l'adresse IP du poste serveur — le cas normal au bureau — n'avaient donc
  // tout simplement pas la fonction, et ne pouvaient ni relier un dossier ni consulter une pièce,
  // alors que les dossiers clients sont sur un NAS commun visible par tous. Le serveur, lui, voit
  // ce NAS comme un chemin de fichiers ordinaire et sert la même chose à tout le monde (voir
  // server/src/nas.js et server/src/routes/nas.js).
  //
  // Trois conséquences immédiates, toutes des simplifications :
  //   - plus AUCUNE permission à reconfirmer : Chrome redemandait l'autorisation d'accès à chaque
  //     redémarrage (limite du navigateur, jamais contournable côté code) — c'est ce qui avait
  //     imposé une popup au démarrage, un bandeau d'alerte et un bouton groupé, tous supprimés ;
  //   - le lien vers le dossier NAS (`d.nasDossier`, un chemin relatif) et les fichiers déjà
  //     trouvés (`d.fichiersTrouves`) vivent maintenant SUR LE DOSSIER, donc sur le serveur : un
  //     dossier relié depuis un poste l'est pour tous, au lieu d'un handle local à un navigateur ;
  //   - un seul parcours de fichiers pour tout le bureau.
  const NAS_CLE_OFFRE = 'offre';
  const NAS_CLE_PIECE = (cle) => `piece::${cle}`;
  const NAS_CLE_COMPROMIS = 'compromis';

  let nasEtat = null; // { configure, racine, raison } — interrogé une fois au démarrage

  async function chargerEtatNas() {
    try {
      const reponse = await fetchAvecAuth('/api/nas/etat');
      nasEtat = reponse.ok ? await reponse.json() : { configure: false, raison: 'Serveur injoignable.' };
    } catch (e) {
      nasEtat = { configure: false, raison: e.message };
    }
    return nasEtat;
  }

  function nasDisponible() {
    return !!(nasEtat && nasEtat.configure);
  }

  // Chemin d'un fichier relativement à la RACINE du NAS (ce que les routes attendent), à partir
  // d'un chemin relatif au dossier client.
  function cheminNasComplet(d, cheminDansDossier) {
    const base = (d.nasDossier || '').replace(/[\\/]+$/, '');
    return base ? `${base}/${cheminDansDossier}` : cheminDansDossier;
  }

  // Liste les PDF du dossier NAS relié, sous-dossiers compris. Le parcours en largeur et les
  // plafonds vivent désormais côté serveur (voir server/src/nas.js) — la leçon déjà payée sur le
  // parcours en profondeur y est reprise telle quelle.
  async function listerFichiersNas(d) {
    const reponse = await fetchAvecAuth('/api/nas/fichiers?dossier=' + encodeURIComponent(d.nasDossier || ''));
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => ({}));
      throw new Error(corps.erreur || `erreur ${reponse.status}`);
    }
    const data = await reponse.json();
    return data.fichiers || [];
  }

  // Ouvre un PDF du NAS dans un nouvel onglet. Le type MIME est forcé côté serveur, ce qui règle
  // par construction le bug déjà rencontré une fois (contenu binaire affiché comme du texte quand
  // le `File` local n'avait pas de type reconnu).
  //
  // Bug corrigé : cette fonction faisait un `window.open()` DIRECT sur /api/nas/fichier — une
  // navigation ordinaire du navigateur, qui ne porte aucun en-tête `Authorization`. Le serveur la
  // rejetait donc systématiquement, et l'onglet n'affichait que le JSON
  // `{"erreur":"Authentification requise ou expirée."}` : jamais le PDF. Les octets sont désormais
  // récupérés par `fetchAvecAuth` (qui, elle, porte le jeton de session) puis présentés via une URL
  // d'objet locale.
  //
  // L'onglet est ouvert AVANT l'await, tant que le clic de l'utilisateur est encore actif :
  // ouvert après, il serait bloqué comme une fenêtre surgissante (même contrainte d'activation que
  // celle déjà documentée pour requestPermission).
  async function ouvrirFichierNas(cheminComplet) {
    if (!cheminComplet) {
      afficherToast("Ce fichier n'a pas encore été localisé — cliquez sur « Revérifier ».", 'OK', null);
      return;
    }
    const onglet = window.open('', '_blank');
    try {
      const reponse = await fetchAvecAuth('/api/nas/fichier?chemin=' + encodeURIComponent(cheminComplet));
      if (!reponse.ok) throw new Error('statut ' + reponse.status);
      const octets = await reponse.blob();
      const url = URL.createObjectURL(octets.type === 'application/pdf' ? octets : new Blob([octets], { type: 'application/pdf' }));
      if (onglet) onglet.location = url;
      else window.open(url, '_blank'); // onglet bloqué : dernière chance, sans garantie
      // L'onglet a besoin de l'URL le temps de charger le document ; la révoquer trop tôt donnerait
      // une page blanche.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (onglet) onglet.close();
      afficherToast("Impossible d'ouvrir ce fichier depuis le NAS : " + e.message, 'OK', null);
    }
  }

  function fichierTrouve(d, cle) {
    return (d.fichiersTrouves || {})[cle] || null;
  }

  function memoriserFichierTrouve(d, cle, cheminComplet) {
    d.fichiersTrouves = d.fichiersTrouves || {};
    if (cheminComplet) d.fichiersTrouves[cle] = cheminComplet;
    else delete d.fichiersTrouves[cle];
  }

  // Charge un PDF du NAS dans pdf.js. Le serveur ne fait que servir les octets : toute l'analyse
  // (pages, titre de la page de garde, texte, OCR) reste côté client, exactement comme avant —
  // aucune dépendance PDF n'a été ajoutée au serveur.
  async function ouvrirPdfNas(cheminComplet) {
    const reponse = await fetchAvecAuth('/api/nas/fichier?chemin=' + encodeURIComponent(cheminComplet));
    if (!reponse.ok) throw new Error(`Lecture impossible (${reponse.status})`);
    const buffer = await reponse.arrayBuffer();
    return pdfjsLib.getDocument({ data: buffer, verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
  }

  // Relie un dossier CLAIRE à un sous-dossier du NAS. Le serveur propose un rapprochement par NOM
  // (méthode choisie par l'étude, voir `rapprocherParNom` côté serveur) ; la liste complète reste
  // affichée pour corriger à la main — une proposition, jamais une décision.
  async function lierDossierLocal(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    if (!nasDisponible()) {
      await chargerEtatNas();
      if (!nasDisponible()) {
        afficherToast((nasEtat && nasEtat.raison) || "Aucun dossier NAS configuré sur le serveur.", 'OK', null);
        return;
      }
    }
    let data;
    try {
      const reponse = await fetchAvecAuth('/api/nas/dossiers?nom=' + encodeURIComponent(d.nom || ''));
      if (!reponse.ok) throw new Error(`erreur ${reponse.status}`);
      data = await reponse.json();
    } catch (e) {
      afficherToast('Lecture du NAS impossible : ' + e.message, 'OK', null);
      return;
    }
    if (!data.dossiers || data.dossiers.length === 0) {
      afficherToast('Aucun dossier trouvé à la racine configurée du NAS.', 'OK', null);
      return;
    }
    // Correspondance PARFAITE (tous les mots du nom du dossier retrouvés dans un seul dossier NAS,
    // voir rapprochementParfait côté serveur) : on relie directement, sans ouvrir la fenêtre de
    // choix — demandé par l'étude. Le lien reste défaisable par « Changer de dossier », et il est
    // journalisé comme tout autre rattachement. Jamais sur un simple « propose », qui n'est qu'un
    // meilleur candidat : se tromper de dossier ferait chercher les pièces d'une vente dans celles
    // d'une autre.
    if (data.parfait && data.parfait !== d.nasDossier) {
      afficherToast(`Dossier NAS « ${data.parfait} » relié automatiquement (correspondance exacte du nom).`, 'OK', null);
      await definirDossierNas(id, data.parfait);
      return;
    }
    ouvrirChoixDossierNas(d, data.dossiers, data.propose);
  }

  // Dossiers pour lesquels une liaison automatique a déjà été tentée dans CETTE session : sans ce
  // garde-fou, la passe périodique (toutes les 5 min) relancerait une requête par dossier non
  // relié à chaque tour, pour un résultat qui ne change pas.
  const tentativesLiaisonNasAuto = new Set();

  // Relie le dossier au NAS sans aucun clic — demandé par l'étude (« éviter le clic pour la
  // liaison au NAS »). SILENCIEUSE et sans fenêtre de choix : elle ne relie que sur une
  // correspondance PARFAITE (tous les mots significatifs du nom retrouvés dans un seul dossier
  // NAS, voir rapprochementParfait côté serveur), et ne fait rien du tout sinon. Se tromper de
  // dossier ferait chercher les pièces d'une vente dans celles d'une autre : c'est la seule
  // certitude sur laquelle on accepte de décider à la place de l'étude. Sans correspondance
  // parfaite, le bouton « Relier un dossier du NAS » reste là, inchangé.
  async function lierDossierNasAutomatique(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d || d.nasDossier || tentativesLiaisonNasAuto.has(id)) return false;
    tentativesLiaisonNasAuto.add(id);
    if (!nasDisponible()) return false;
    try {
      const reponse = await fetchAvecAuth('/api/nas/dossiers?nom=' + encodeURIComponent(d.nom || ''));
      if (!reponse.ok) return false;
      const data = await reponse.json();
      if (!data.parfait) return false;
      await definirDossierNas(id, data.parfait);
      afficherToast(`Dossier NAS « ${data.parfait} » relié automatiquement.`, 'OK', null);
      return true;
    } catch (e) {
      return false; // NAS injoignable : on réessaiera à la prochaine ouverture de l'outil.
    }
  }

  // Applique le choix, puis relance une vérification complète — même remise à zéro qu'avant : les
  // statuts d'un dossier NAS précédent ne valent plus rien pour un autre.
  async function definirDossierNas(id, chemin) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !chemin) return;
    const etaitDejaLie = d.dossierLie;
    d.nasDossier = chemin;
    d.dossierLie = true;
      // Remis à zéro à CHAQUE lien (pas seulement le premier) : changer de dossier lié doit
      // relancer une recherche complètement fraîche, sans conserver les statuts "reçue"/
      // "manquante" de l'ancien dossier — sans quoi une pièce marquée reçue dans l'ancien
      // dossier restait affichée comme telle après avoir choisi un nouveau dossier qui ne la
      // contient peut-être pas. "Aucun document" (rouge)/"inconnu" (prêt) reflètent ce point de
      // départ pessimiste, corrigés dès que le scan ci-dessous retrouve quelque chose. Sans
      // effet sur les pièces pour un rôle participant, qui ne suit pas cette checklist (voir
      // statutDossier).
      d.offrePretStatut = 'inconnu';
      d.montantPret = null;
      d.garantiesPret = []; // lues dans l'offre de l'ancien dossier : elles ne valent plus rien ici
    // Les fichiers deja localises pointaient vers l'ANCIEN dossier : tout repart de zero, y
    // compris le compromis (jamais rescanne automatiquement — voir ouvrirCompromisTrouve()).
    d.fichiersTrouves = {};
    if (d.roleNotaire !== 'participant') {
      d.pieces = {};
      checklistPieces(d.typeVente, d).forEach(p => { d.pieces[p.cle] = 'manquante'; });
    }
    ajouterHistorique(d, etaitDejaLie
      ? `Dossier NAS relié modifié : ${chemin}`
      : `Dossier NAS relié : ${chemin}`);
    await sauvegarder(d);
    render();
    await verifierDossierLocal(id, true);
  }

  // Petite fenêtre de choix, sur le patron .confirm-overlay déjà utilisé partout ailleurs dans
  // l'outil (confirmation, À propos, info) plutôt qu'un second système de fenêtre modale. La liste
  // complète reste affichée même quand un rapprochement est proposé : c'est une proposition, pas
  // une décision — se tromper de dossier ferait chercher les pièces d'une vente dans celles d'une
  // autre.
  function ouvrirChoixDossierNas(d, nomsNas, propose) {
    const overlay = document.getElementById('nas-choix-overlay');
    const liste = document.getElementById('nas-choix-liste');
    const intro = document.getElementById('nas-choix-intro');
    if (!overlay || !liste) return;
    if (intro) {
      intro.textContent = propose
        ? `Dossier proposé pour « ${d.nom} » d'après son nom — corrigez si ce n'est pas le bon.`
        : `Aucun rapprochement évident avec « ${d.nom} » : choisissez le dossier client sur le NAS.`;
    }
    // Le dossier proposé (et celui déjà relié) passent EN TÊTE de liste — demandé par l'étude :
    // les marquer sans les remonter obligeait à les chercher au milieu de centaines d'entrées.
    const rang = (nom) => (nom === d.nasDossier ? 0 : (nom === propose ? 1 : 2));
    const ordonnes = nomsNas.slice().sort((a, b) => rang(a) - rang(b) || a.localeCompare(b, 'fr'));
    choixDossierNasEnCours = { dossierId: d.id, noms: ordonnes, propose, actuel: d.nasDossier || null };
    const recherche = document.getElementById('nas-choix-recherche');
    if (recherche) recherche.value = '';
    renderChoixDossierNas('');
    overlay.style.display = 'flex';
    if (recherche) recherche.focus();
  }

  // Liste et filtre de la fenêtre de choix du dossier NAS. L'état vit ici plutôt que dans le DOM :
  // filtrer reconstruit la liste, il faut donc garder les noms complets quelque part.
  let choixDossierNasEnCours = null;

  function renderChoixDossierNas(filtre) {
    const liste = document.getElementById('nas-choix-liste');
    if (!liste || !choixDossierNasEnCours) return;
    const { dossierId, noms, propose, actuel } = choixDossierNasEnCours;
    // Insensible aux accents et à la casse, comme la recherche de dossiers du Suivi.
    const cible = normaliserPourRecherche(filtre || '');
    const visibles = cible ? noms.filter(n => normaliserPourRecherche(n).includes(cible)) : noms;
    if (visibles.length === 0) {
      liste.innerHTML = '<p class="nas-choix-vide">Aucun dossier du NAS ne correspond à cette recherche.</p>';
      return;
    }
    liste.innerHTML = visibles.map(nom => {
      const marque = nom === actuel ? 'actuel' : (nom === propose ? 'proposé' : '');
      return `<button type="button" class="nas-choix-item${marque ? ' ' + (marque === 'actuel' ? 'actuel' : 'propose') : ''}"`
        + ` onclick="fermerChoixDossierNas(); definirDossierNas('${escapeOnclickArg(dossierId)}', '${escapeOnclickArg(nom)}')">`
        + `<span class="nas-choix-nom">${escapeHtml(nom)}</span>`
        + (marque ? `<span class="nas-choix-marque">${marque}</span>` : '')
        + `</button>`;
    }).join('');
  }

  function filtrerChoixDossierNas(valeur) {
    renderChoixDossierNas(valeur);
  }

  function fermerChoixDossierNas() {
    const overlay = document.getElementById('nas-choix-overlay');
    if (overlay) overlay.style.display = 'none';
    choixDossierNasEnCours = null;
  }

  // Changer de dossier réutilise lierDossierLocal : la même fenêtre de choix, où le dossier
  // actuellement relié est marqué comme tel.
  async function changerDossierLocal(id) {
    await lierDossierLocal(id);
  }

  // Plafond appliqué à chaque PDF individuel lors du parcours d'un dossier local relié (offre de
  // prêt, pièces) : identique à celui déjà retenu pour le compromis lui-même (PLAFOND_SECURITE dans
  // extraireTextesUtiles) plutôt qu'un chiffre arbitraire à part. Les 15 pages retenues jusqu'ici
  // ne couvraient pas certains documents réels (ex. un DDT ou un dossier d'urbanisme scanné en un
  // seul PDF de plusieurs dizaines de pages) — signalé par l'étude, pièces bien présentes non
  // détectées.
  const PLAFOND_PAGES_VERIFICATION = 60;
  // Repli OCR sur plusieurs pages (pas seulement la première) quand un PDF scanné n'a aucun texte
  // extractible : un document scanné place parfois son intitulé après une page de garde. Même
  // principe que le repli déjà utilisé pour la date de signature du compromis (traiterFichierPdf),
  // borné pour ne pas ralentir le parcours de tout un dossier local.
  const PAGES_OCR_VERIFICATION = 3;

  // Texte utile d'un PDF du dossier local relié, avec repli OCR s'il n'a aucun texte extractible
  // (scan/image) : partagé par verifierDossierLocal(), qui n'a plus qu'à tester l'offre de prêt
  // et les pièces encore manquantes contre le texte renvoyé.
  async function lireTextePdfVerification(pdf) {
    let texte = '';
    for (let p = 1; p <= Math.min(pdf.numPages, PLAFOND_PAGES_VERIFICATION); p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      texte += content.items.map(it => it.str).join(' ') + '\n';
    }
    if (texte.trim().length < 40) {
      const workerVerif = await creerWorkerOcr();
      if (workerVerif) {
        try {
          let texteOcr = '';
          for (let p = 1; p <= Math.min(pdf.numPages, PAGES_OCR_VERIFICATION); p++) {
            texteOcr += (await ocrPage(pdf, p, workerVerif)) + '\n';
          }
          texte = texteOcr;
        } finally {
          await workerVerif.terminate();
        }
      }
    }
    return texte;
  }

  // Variante page par page de lireTextePdfVerification(), pour Outil 2 (Audit des actes — voir plus
  // bas, section « Analyse approfondie (IA) ») : celui-ci doit citer une PAGE précise pour chaque
  // document envoyé au modèle, pas seulement pour le compromis en cours d'import (pageDepuisIndex
  // ne connaît que le PDF unique chargé dans le wizard). Même lecture, mêmes plafonds
  // (PLAFOND_PAGES_VERIFICATION, repli OCR sur PAGES_OCR_VERIFICATION pages), mais mémorise en plus
  // la position de chaque page dans le texte joint. lireTextePdfVerification() elle-même n'est pas
  // touchée : ses appelants existants (vérification d'un dossier local) n'ont pas besoin des
  // frontières de page et ne doivent pas changer de comportement.
  async function lireTextePdfParPage(pdf) {
    let texte = '';
    let pages = [];
    for (let p = 1; p <= Math.min(pdf.numPages, PLAFOND_PAGES_VERIFICATION); p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const debut = texte.length;
      texte += content.items.map(it => it.str).join(' ') + '\n';
      pages.push({ numero: p, debut, fin: texte.length });
    }
    if (texte.trim().length < 40) {
      const workerVerif = await creerWorkerOcr();
      if (workerVerif) {
        try {
          let texteOcr = '';
          const pagesOcr = [];
          for (let p = 1; p <= Math.min(pdf.numPages, PAGES_OCR_VERIFICATION); p++) {
            const debut = texteOcr.length;
            texteOcr += (await ocrPage(pdf, p, workerVerif)) + '\n';
            pagesOcr.push({ numero: p, debut, fin: texteOcr.length });
          }
          texte = texteOcr;
          pages = pagesOcr;
        } finally {
          await workerVerif.terminate();
        }
      }
    }
    return { texte, pages };
  }

  // Retour la page (1-indexée) contenant l'index donné dans un texte construit par
  // lireTextePdfParPage() — pendant analogue à pageDepuisIndex() (compromis en cours d'import) mais
  // pour n'importe quel document d'Outil 2. Repli sur la dernière page connue si l'index dépasse
  // (troncature du texte avant envoi au modèle, voir lancerAuditActe) plutôt qu'un numéro inventé.
  function pageDepuisIndexPages(pages, index) {
    if (!Array.isArray(pages) || pages.length === 0 || index == null || index < 0) return null;
    for (const p of pages) {
      if (index >= p.debut && index < p.fin) return p.numero;
    }
    return pages[pages.length - 1].numero;
  }

  // Retour visuel pendant le parcours du dossier local (peut prendre plusieurs secondes sur un
  // dossier volumineux/beaucoup de PDF/repli OCR) : sans ça, le bouton restait silencieux jusqu'au
  // résultat final, ce qui pouvait laisser croire à un clic sans effet — signalé par l'étude.
  // render() (appelé à la fin de verifierDossierLocal dans tous les cas) remplace de toute façon ce
  // bouton par un rendu à jour, donc pas besoin de remettre son texte d'origine ici si tout se
  // passe bien ; seul le cas où le bouton n'existe plus dans le DOM au moment du clic (rare) est à
  // ignorer sans casser l'appel.
  async function verifierDossierLocalDepuisBouton(id, btn) {
    if (btn) { btn.disabled = true; btn.innerHTML = `${icone('spinner', null, true)} Recherche…`; }
    await verifierDossierLocal(id, true);
  }

  // Fusion de deux anciennes fonctions (verifierOffrePret()/verifierPiecesDossier()) en UN SEUL
  // parcours du dossier local relié, qui teste l'offre de prêt ET les pièces encore manquantes
  // pendant le même passage — signalé par l'étude : trouver l'offre de prêt tôt dans le parcours
  // (ex. premier fichier lu) arrêtait la recherche avant d'avoir eu la moindre chance de reconnaître
  // les pièces d'urbanisme se trouvant plus loin dans l'arborescence, alors que les deux documents
  // se trouvent dans le même dossier local relié. Le parcours ne s'arrête plus tôt que si tout ce
  // qu'on cherche (offre comprise) est déjà résolu, ou si le dossier est entièrement parcouru.
  async function verifierDossierLocal(id, viaClicUtilisateur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !d.dossierLie || !d.nasDossier) return;
    // Achat comptant (sans prêt) : rien à chercher côté offre, seul le nom de la fonction reste
    // générique. Notaire participant/concourant : la checklist de pièces ne le concerne pas (voir
    // renderCarteDossier/statutDossier) — inutile de tester quoi que ce soit dessus.
    const chercherOffre = !d.sansPret;
    const chercherPieces = d.roleNotaire !== 'participant';
    if (!chercherOffre && !chercherPieces) return;

    const checklist = chercherPieces ? checklistPieces(d.typeVente, d) : [];
    d.pieces = d.pieces || {};
    // Pièces déjà trouvées lors d'une vérification précédente : inutile de les rechercher à
    // nouveau, seules celles encore manquantes/inconnues sont testées.
    const aChercher = new Set(checklist.filter(p => d.pieces[p.cle] !== 'recue').map(p => p.cle));
    const fichierParPiece = {};

    let offreTrouvee = false;
    let offreAConfirmer = false; // trouvée par son titre, mais sans confirmation du modèle local
    let fichierOffre = null;
    let nbAnalyses = 0; // fichiers réellement ouverts (lus par pdf.js) — seuls les candidats offre
    let nbFichiersRencontres = 0;
    // Journal du parcours (voir dernierDiagnosticParcours/renderDiagnosticParcours) : une ligne par
    // événement notable, jamais une par fichier rencontré — illisible sur un dossier de plusieurs
    // centaines de PDF, et sans rien ajouter au compteur global. Jamais d'extrait du TEXTE d'un PDF
    // ici : uniquement des noms de fichiers, déjà visibles par l'étude dans son explorateur.
    const diagnosticJournal = [];

    let fichiers;
    try {
      fichiers = await listerFichiersNas(d);
    } catch (e) {
      console.error('Lecture du dossier NAS impossible', e);
      if (viaClicUtilisateur) afficherToast('Lecture du dossier NAS impossible : ' + e.message, 'OK', null);
      dernierDiagnosticParcours[id] = {
        horodatage: new Date().toISOString(), journal: [],
        resume: { erreur: `Le serveur n'a pas pu lire « ${d.nasDossier} » sur le NAS : ${e.message}` }
      };
      render();
      return;
    }

    for (const fichier of fichiers) {
      if ((!chercherOffre || offreTrouvee) && aChercher.size === 0) break; // tout est déjà résolu
      nbFichiersRencontres++;
      const cheminComplet = cheminNasComplet(d, fichier.chemin);
      // Nom normalisé (underscores/tirets → espaces, accents recomposés en NFC) avant tout test de
      // motif : un vrai nom de fichier de l'étude ne s'écrit pas comme une regex française.
      const nomNormalise = normaliserNomPourMotif(fichier.nom);

      // Offre de prêt : nombre de pages, puis TITRE de la page de garde, puis confirmation par le
      // modèle IA local — voir MIN_PAGES_OFFRE_PRET pour le pourquoi de chacun des trois filtres.
      // Le PDF n'est ouvert que tant que l'offre n'a pas été trouvée.
      if (chercherOffre && !offreTrouvee) {
        try {
          nbAnalyses++;
          const pdf = await ouvrirPdfNas(cheminComplet);
          if (pdf.numPages < MIN_PAGES_OFFRE_PRET) {
            // Écarté sans rien lire d'autre : une offre de prêt fait au moins une dizaine de
            // pages, un document d'une ou deux pages n'en est jamais une. Ce filtre s'applique aux
            // DEUX voies de reconnaissance ci-dessous, y compris quand le nom du fichier est
            // parfaitement explicite — demandé ainsi par l'étude (« toujours pour ceux de plus de
            // 6 pages »).
            diagnosticJournal.push(`${fichier.nom} → écarté pour l'offre (${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}, minimum ${MIN_PAGES_OFFRE_PRET})`);
          } else {
            // Deux voies, dans cet ordre (demandé par l'étude après avoir vu les deux méthodes
            // échouer chacune de son côté — voir l'historique de OFFRE_PRET_RE dans CLAUDE.md,
            // passée du contenu seul au nom seul puis au titre seul) :
            //   1. le NOM du fichier dit « offre de prêt » / « offre de crédit » / … → validé, sans
            //      lire le contenu ni solliciter le modèle : un collaborateur qui nomme ainsi un
            //      fichier a déjà fait le travail d'identification ;
            //   2. sinon (nom muet ou ambigu) → TITRE de la page de garde, puis confirmation par
            //      le modèle IA local, comme avant.
            const nomDitOffre = OFFRE_PRET_RE.test(nomNormalise);
            let titre = '';
            let reconnu = nomDitOffre;
            let parLeNom = nomDitOffre;
            if (!reconnu) {
              const page1 = await pdf.getPage(1);
              const contenu = await page1.getTextContent();
              titre = titrePagePdf(contenu.items.map(it => it.str).join(' '));
              reconnu = OFFRE_PRET_RE.test(titre);
              if (!reconnu) diagnosticJournal.push(`${fichier.nom} → ni le nom du fichier ni le titre de la page de garde n'évoquent une offre de prêt`);
            }
            if (reconnu) {
              // Le modèle n'est sollicité que sur la voie « contenu » : quand le nom du fichier
              // l'annonce, il n'y a pas de doute à lever, et faire dépendre ce cas d'un modèle
              // absent ferait retomber en « à confirmer » un document parfaitement identifié.
              const confirmation = parLeNom
                ? { disponible: true, estOffrePret: true, raison: '' }
                : await confirmerOffrePretIa(titre);
              if (confirmation.disponible && !confirmation.estOffrePret) {
                diagnosticJournal.push(`${fichier.nom} → titre proche, mais écarté par le modèle local${confirmation.raison ? ' : ' + confirmation.raison : ''}`);
              } else {
                offreTrouvee = true;
                fichierOffre = fichier.nom;
                // Sans confirmation possible (modèle absent ou en panne), le document n'est pas
                // déclaré reçu d'office : il passe en « à confirmer », statut distinct que l'étude
                // tranche elle-même en ouvrant le fichier — choix explicite de sa part.
                offreAConfirmer = !confirmation.disponible;
                diagnosticJournal.push(parLeNom
                  ? `${fichier.nom} → offre de prêt reconnue au nom du fichier`
                  : offreAConfirmer
                    ? `${fichier.nom} → offre de prêt probable (titre de page de garde reconnu), à confirmer : ${confirmation.raison || 'modèle local indisponible'}`
                    : `${fichier.nom} → offre de prêt confirmée (titre de page de garde + modèle local)`);
                memoriserFichierTrouve(d, NAS_CLE_OFFRE, cheminComplet);
                // Le PDF est déjà ouvert : on en profite pour lire le montant emprunté (apport) et
                // les garanties du prêt. Best-effort, et jamais d'écrasement par un échec : une
                // valeur déjà connue est conservée si une revérification ne la retrouve pas.
                const texte = await lireTextePdfVerification(pdf);
                const montant = detecterMontantPret(texte);
                if (montant) d.montantPret = montant;
                const garanties = detecterGarantiesPret(texte);
                if (garanties.length) d.garantiesPret = garanties;
              }
            }
          }
        } catch (e) {
          // Un PDF illisible (chiffré, corrompu, police exotique) ne doit jamais interrompre le
          // parcours : il est simplement écarté pour l'offre, les pièces continuent d'être testées
          // par leur nom de fichier juste en dessous.
          console.error('Lecture impossible pour', fichier.nom, e);
          diagnosticJournal.push(`${fichier.nom} → lecture impossible (${e.message})`);
        }
      }

      for (const piece of checklist) {
        if (!aChercher.has(piece.cle)) continue;
        // Pièce personnalisée (voir checklistPieces/ajouterPiecePersonnalisee) : pas de motifNom
        // (nom libre saisi par l'étude), retrouvée par sous-chaîne de son libellé — même logique
        // que chercherFichierParNom, appliquée ici pour qu'un "Revérifier" ultérieur la retrouve
        // aussi, pas seulement la recherche ponctuelle faite à son ajout.
        if (piece.personnalisee) {
          if (nomNormalise.toLowerCase().includes(piece.label.toLowerCase())) {
            fichierParPiece[piece.cle] = cheminComplet;
            aChercher.delete(piece.cle);
            diagnosticJournal.push(`${fichier.nom} → pièce trouvée par nom : « ${piece.label} »`);
          }
        } else if (piece.motifNom && piece.motifNom.test(nomNormalise) && !estNomExcluPourPiece(piece.cle, nomNormalise)) {
          fichierParPiece[piece.cle] = cheminComplet;
          aChercher.delete(piece.cle);
          diagnosticJournal.push(`${fichier.nom} → pièce trouvée par nom : « ${piece.label} »`);
        }
      }
    }

    let nbPiecesTrouvees = 0;
    for (const piece of checklist) {
      if (fichierParPiece[piece.cle]) {
        d.pieces[piece.cle] = 'recue';
        nbPiecesTrouvees++;
        memoriserFichierTrouve(d, NAS_CLE_PIECE(piece.cle), fichierParPiece[piece.cle]);
      } else if (d.pieces[piece.cle] !== 'recue') {
        d.pieces[piece.cle] = 'manquante';
      } else {
        nbPiecesTrouvees++; // déjà reconnue lors d'une vérification précédente
      }
    }

    // Résultat complet du parcours, pour le panneau de diagnostic (voir renderDiagnosticParcours) —
    // construit ici, une fois d.pieces à jour, plutôt que pendant la boucle : la liste des pièces
    // "encore manquantes" doit refléter l'état final, pas un instantané pris en cours de parcours.
    dernierDiagnosticParcours[id] = {
      horodatage: new Date().toISOString(),
      journal: diagnosticJournal,
      resume: {
        nbFichiersRencontres,
        nbAnalyses,
        dossierNas: d.nasDossier,
        offre: !chercherOffre ? null : { trouvee: offreTrouvee, aConfirmer: offreAConfirmer, fichier: fichierOffre },
        pieces: !chercherPieces ? null : {
          total: checklist.length,
          trouvees: nbPiecesTrouvees,
          manquantes: checklist.filter(p => d.pieces[p.cle] !== 'recue').map(p => p.label)
        }
      }
    };

    if (viaClicUtilisateur) {
      const messages = [];
      if (chercherOffre) {
        messages.push(!offreTrouvee
          ? "Offre de prêt non reconnue."
          : offreAConfirmer
            ? `Offre de prêt probable (${fichierOffre}) — à confirmer, le modèle local n'a pas pu la vérifier.`
            : `Offre de prêt trouvée (${fichierOffre}).`);
      }
      if (chercherPieces) {
        const manquantes = checklist.length - nbPiecesTrouvees;
        messages.push(manquantes === 0
          ? `Les ${checklist.length} pièces attendues ont été reconnues.`
          : `${nbPiecesTrouvees}/${checklist.length} pièces reconnues (${manquantes} manquante${manquantes > 1 ? 's' : ''}).`);
      }
      if (nbFichiersRencontres === 0) {
        afficherToast(`Aucun PDF dans « ${d.nasDossier} » (ni ses sous-dossiers) — vérifiez le dossier relié.`, 'OK', null);
      } else {
        afficherToast(messages.join(' '), 'OK', null);
      }
    }

    let offreEtaitManquante = false;
    let offreEtaitRecue = false;
    if (chercherOffre) {
      offreEtaitManquante = d.offrePretStatut === 'manquante';
      offreEtaitRecue = d.offrePretStatut === 'recue';
      // Trois issues, pas deux : trouvée et confirmée, trouvée mais pas confirmable (modèle local
      // indisponible — statut distinct demandé par l'étude, à trancher à la main), ou introuvable.
      d.offrePretStatut = offreTrouvee ? (offreAConfirmer ? 'aconfirmer' : 'recue') : 'manquante';
    }

    // Ce parcours vient justement de relire le dossier NAS : la notification proactive d'un
    // nouveau document (voir appliquerChangementsDistants/nasWatch.js) a déjà rempli son rôle une
    // fois qu'elle a mené jusqu'ici, qu'elle vienne d'un clic explicite sur "Revérifier" ou de la
    // revérification automatique périodique — rien à laisser affiché après coup.
    if (d.nasNouveaute) d.nasNouveaute = null;

    await sauvegarder(d);
    render();

    if (chercherOffre && offreTrouvee && offreEtaitManquante) {
      ajouterHistorique(d, 'Offre de prêt retrouvée dans le dossier NAS');
      await sauvegarder(d);
    }

    // Une offre déjà confirmée reçue ne doit jamais redéclencher une relance automatique même si
    // une vérification ultérieure ne la retrouve plus (fichier déplacé/archivé/renommé une fois
    // traité) : ce n'est pas un signe que l'offre manque réellement, l'étude l'a déjà en main.
    // relancerSiOffreManquante() écarte déjà elle-même le rôle participant.
    if (chercherOffre && !offreTrouvee && !offreEtaitRecue) relancerSiOffreManquante(d);
  }

  // Rouvre directement le PDF du NAS où une pièce (ou l'offre de prêt) a été reconnue, plutôt
  // que de se contenter d'un badge « reçue » sans rien derrière — demandé par l'étude. Le chemin du
  // fichier a été mémorisé SUR LE DOSSIER au moment de la détection (voir verifierDossierLocal) :
  // il est donc connu de tous les postes, contrairement à l'ancien handle propre à un navigateur.
  function ouvrirPieceTrouvee(id, cle) {
    const d = dossiers.find(x => x.id === id);
    if (d) ouvrirFichierNas(fichierTrouve(d, NAS_CLE_PIECE(cle)));
  }

  function ouvrirOffreTrouvee(id) {
    const d = dossiers.find(x => x.id === id);
    if (d) ouvrirFichierNas(fichierTrouve(d, NAS_CLE_OFFRE));
  }

  // "Ouvrir le compromis" : contrairement à l'offre/aux pièces, ce document n'est jamais recherché
  // par verifierDossierLocal() (ce n'est pas une pièce de la checklist) — son handle n'est donc
  // rempli qu'à la demande, ici, la première fois qu'on clique sur le bouton. Une fois trouvé, il
  // est mémorisé (CLE_HANDLE_COMPROMIS) comme les autres documents : un clic suivant l'ouvre
  // directement, sans reparcourir le dossier local.
  // Bug corrigé, signalé par l'étude : la recherche se faisait par les seuls mots "compromis" puis
  // "promesse", qui ramenaient souvent le MAUVAIS avant-contrat — celui de la VENTE PRÉALABLE de
  // l'acquéreur, rangé dans le même dossier local et portant lui aussi ces mots dans son nom.
  // C'est désormais le nom EXACT du fichier importé à la création du dossier
  // (`d.compromisNomFichier`) qui est cherché en premier ; la recherche floue ne sert plus que de
  // repli pour un dossier saisi entièrement à la main (ou créé avant cette évolution), et le
  // signale alors explicitement plutôt que d'ouvrir un document au hasard sans prévenir.
  async function ouvrirCompromisTrouve(dossierId, btn) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const dejaTrouve = fichierTrouve(d, NAS_CLE_COMPROMIS);
    if (dejaTrouve) { ouvrirFichierNas(dejaTrouve); return; }
    if (!d.dossierLie || !d.nasDossier) {
      afficherToast('Reliez d\u2019abord un dossier du NAS pour retrouver le compromis.', 'OK', null);
      return;
    }
    const texteOriginal = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = `${icone('spinner', null, true)} Recherche\u2026`; }
    try {
      const fichiers = await listerFichiersNas(d);
      // Correspondance par sous-chaîne sur le nom normalisé (underscores/tirets → espaces, accents
      // recomposés) — la même que pour une pièce personnalisée.
      const parNom = (cible) => {
        const t = normaliserNomPourMotif(cible).toLowerCase();
        return fichiers.find(f => normaliserNomPourMotif(f.nom).toLowerCase().includes(t)) || null;
      };
      let trouve = null;
      let parRepli = false;
      if (d.compromisNomFichier) {
        trouve = parNom(d.compromisNomFichier);
        if (!trouve) {
          afficherToast(`\u00ab\u00a0${d.compromisNomFichier}\u00a0\u00bb introuvable dans le dossier NAS \u2014 recherche \u00e9largie.`, 'OK', null);
        }
      }
      if (!trouve) {
        parRepli = true;
        trouve = parNom('compromis') || parNom('promesse');
      }
      if (!trouve) {
        afficherToast('Aucun fichier contenant \u00ab\u00a0compromis\u00a0\u00bb ou \u00ab\u00a0promesse\u00a0\u00bb dans le dossier NAS reli\u00e9.', 'OK', null);
        return;
      }
      const chemin = cheminNasComplet(d, trouve.chemin);
      memoriserFichierTrouve(d, NAS_CLE_COMPROMIS, chemin);
      await sauvegarder(d);
      // Un repli peut tr\u00e8s bien avoir ramen\u00e9 l'avant-contrat d'une vente pr\u00e9alable : le dire,
      // plut\u00f4t que de laisser croire que c'est forc\u00e9ment le document import\u00e9 \u00e0 la cr\u00e9ation.
      if (parRepli) {
        afficherToast(`Ouverture de \u00ab\u00a0${trouve.nom}\u00a0\u00bb \u2014 v\u00e9rifiez qu'il s'agit bien du bon avant-contrat.`, 'OK', null);
      }
      ouvrirFichierNas(chemin);
    } catch (e) {
      console.error(e);
      afficherToast('Recherche du compromis impossible : ' + e.message, 'OK', null);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = texteOriginal; }
    }
  }

  // Ouvre automatiquement une relance pré-rédigée si l'échéance approche et qu'aucune offre n'a
  // été trouvée — au plus une fois par jour et par dossier, pour ne pas rouvrir un brouillon à
  // chaque vérification. L'envoi final reste un geste volontaire de l'utilisateur.
  function relancerSiOffreManquante(d) {
    // Notaire participant/concourant : suivi volontairement limité au prêt et aux engagements du
    // vendeur (voir renderCarteDossier/verifierPiecesDossier, même garde-fou) — relancer
    // l'acquéreur reste un geste du notaire instrumentaire, celui qui reçoit l'acte et porte la
    // relation avec lui, pas de l'étude en simple concours. Demandé explicitement par l'étude.
    if (d.roleNotaire === 'participant') return;
    if (!d.emailAcquereur || !d.pret) return;
    const jours = joursRestants(d.pret);
    if (jours === null || jours < 0 || jours > 15) return;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    if (d.derniereRelanceAuto === aujourdhui) return;

    d.derniereRelanceAuto = aujourdhui;
    ajouterHistorique(d, `Relance automatique ouverte (offre de prêt introuvable, échéance J-${jours})`);
    sauvegarder(d);

    const subject = `Relance — Offre de prêt attendue (dossier ${d.nom})`;
    const body = `Bonjour,\n\nSauf erreur de notre part, nous n'avons pas encore reçu votre offre de prêt pour le dossier ${d.nom}.\n\nL'échéance d'obtention du prêt est fixée au ${formatDateFr(d.pret)}. Merci de nous transmettre cette offre dès réception, ou de nous indiquer où en est votre demande de financement.\n\nCordialement.`;
    const url = `mailto:${encodeURIComponent(d.emailAcquereur)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    afficherToast(`Relance « offre de prêt » ouverte pour ${d.nom} — vérifiez puis envoyez.`, 'OK', null);
    window.location.href = url;
  }

  // Statut de l'offre de prêt à afficher, dans le même vocabulaire court partout où il apparaît
  // (ligne de tableau, carte "Obtention du prêt" du tiroir) : avant cette fonction, chaque endroit
  // formulait le même fait à sa façon ("Offre de prêt : à vérifier" en phrase complète ici,
  // "Non vérifiée" en point + mot juste à côté) — une seule source, un seul texte. La distinction
  // "jamais relié" / "relié mais introuvable" (déjà utilisée dans le tiroir) s'applique désormais
  // aussi au tableau : un dossier jamais relié n'a pas plus "à vérifier" qu'un dossier relié où
  // l'offre reste introuvable, ce sont deux réalités différentes.
  function statutOffreAffichage(d) {
    if (!d.dossierLie) return { texte: 'Non vérifiée', dl: 'dl-neutre' };
    if (d.offrePretStatut === 'recue') return { texte: 'Reçue', dl: 'dl-success' };
    // Un document a bien été trouvé, mais sans la confirmation du modèle local : distinct d'une
    // offre reçue (personne ne l'a encore validée) comme d'une offre introuvable (le document est
    // là, il suffit de l'ouvrir pour trancher). Statut demandé explicitement par l'étude.
    if (d.offrePretStatut === 'aconfirmer') return { texte: 'À confirmer', dl: 'dl-pret' };
    if (d.offrePretStatut === 'manquante') return { texte: 'Introuvable', dl: 'dl-pret' };
    return { texte: 'À vérifier', dl: 'dl-neutre' };
  }

  // Un dossier dont l'offre de prêt est déjà confirmée reçue ET toutes les pièces de la checklist
  // déjà reçues n'a plus rien à apprendre d'un nouveau parcours du dossier local — l'y soumettre
  // quand même à chaque démarrage/toutes les 5 minutes ne fait que ralentir l'outil pour rien sur
  // un portefeuille volumineux. Signalé par l'étude.
  function dossierEntierementComplet(d) {
    const offreOk = d.sansPret || d.offrePretStatut === 'recue';
    const piecesOk = d.roleNotaire === 'participant' ||
      checklistPieces(d.typeVente, d).every(p => (d.pieces || {})[p.cle] === 'recue');
    return offreOk && piecesOk;
  }

  // Revérifie les dossiers reliés à l'ouverture, sans exiger de clic (queryPermission seul, qui
  // n'affiche jamais de demande d'autorisation) : si l'accès est toujours accordé, tout se fait
  // silencieusement ; sinon un bandeau invite à cliquer pour le reconfirmer. Ne concerne que les
  // vérifications automatiques (démarrage, minuteur) — un clic explicite sur "Revérifier" doit
  // toujours fonctionner, même sur un dossier déjà complet (l'étude peut vouloir confirmer après
  // un doute, ou un document a pu être retiré du dossier local entre-temps).
  async function revérifierDossiersLiesAuDemarrage() {
    for (const d of dossiers) {
      // Un dossier actif jamais relié : on tente le rattachement au NAS tout seul, une fois par
      // session (voir lierDossierNasAutomatique). Un dossier archivé n'a plus rien à suivre.
      if (!d.nasDossier && !d.archive) await lierDossierNasAutomatique(d.id);
      if (d.dossierLie && !dossierEntierementComplet(d)) {
        await verifierDossierLocal(d.id, false);
      }
    }
  }
  setInterval(() => { revérifierDossiersLiesAuDemarrage(); }, 5 * 60 * 1000);


  // ---- thème clair / sombre ----

  const CLE_THEME = 'theme';

  async function appliquerTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('theme-btn');
    // Icône seule (sans libellé "Mode sombre"/"Mode clair" à côté) — demandé par l'étude ; le
    // libellé accessible reste porté par aria-label/title, pas visible à l'écran.
    if (btn) {
      const theTitle = theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre';
      btn.setAttribute('aria-label', theTitle);
      btn.setAttribute('title', theTitle);
      btn.innerHTML = `<span class="sidebar-link-icone" aria-hidden="true">${icone(theme === 'dark' ? 'sun' : 'moon')}</span>`;
    }
    try {
      if (window.storage) { await window.storage.set(CLE_THEME, theme, false); return; }
    } catch (e) { /* on tente le repli ci-dessous */ }
    try { localStorage.setItem(CLE_THEME, theme); } catch (e) { /* préférence non enregistrée : sans conséquence */ }
  }

  function basculerTheme() {
    const actuel = document.documentElement.getAttribute('data-theme');
    appliquerTheme(actuel === 'dark' ? 'light' : 'dark');
  }

  async function chargerTheme() {
    let theme = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(CLE_THEME, false);
        if (res && res.value) theme = res.value;
      }
    } catch (e) { /* on tente le repli ci-dessous */ }
    if (!theme) {
      try { theme = localStorage.getItem(CLE_THEME); } catch (e) { /* aucune préférence enregistrée */ }
    }
    if (!theme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
    appliquerTheme(theme === 'dark' ? 'dark' : 'light');
  }

  // ---- barre de progression ----

  function majProgression(pourcent) {
    const barre = document.getElementById('pdf-progress');
    const fill = document.getElementById('pdf-progress-fill');
    if (!barre || !fill) return;
    if (pourcent === null) {                 // progression inconnue (OCR) : animation continue
      barre.classList.add('actif', 'indetermine');
      fill.style.width = '40%';
    } else if (pourcent < 0) {               // terminé
      barre.classList.remove('actif', 'indetermine');
      fill.style.width = '0%';
    } else {
      barre.classList.add('actif');
      barre.classList.remove('indetermine');
      fill.style.width = Math.min(100, Math.round(pourcent)) + '%';
    }
  }

  // ---- raccourcis clavier ----

  // Sélection de texte dans l'aperçu du compromis (voir construireCoucheTexte()/
  // gererSelectionPdf() plus haut) : la barre flottante se met à jour à chaque relâchement du
  // clic, qu'une sélection existe (la montrer au bon endroit) ou plus (la masquer).
  document.addEventListener('mouseup', gererSelectionPdf);

  document.addEventListener('keydown', (e) => {
    // Échap ferme la popup d'info post-action (.ics/email) si elle est ouverte, sinon l'écran
    // "À propos", sinon la boîte de confirmation, sinon la barre de sélection PDF, sinon le tiroir
    // de fiche dossier — dans cet ordre de superposition visuelle (la popup d'info s'ouvre par un
    // clic depuis le tiroir, donc au-dessus de lui ; "À propos" est un simple écran d'information,
    // jamais ouvert en même temps qu'un autre panneau, mais autant le garder en tête de liste par
    // cohérence).
    if (e.key === 'Escape') {
      const infoActionOverlay = document.getElementById('info-action-overlay');
      const aproposOverlay = document.getElementById('apropos-overlay');
      const overlay = document.getElementById('confirm-overlay');
      const barreSelection = document.getElementById('pdf-selection-toolbar');
      const formEngagementManuel = document.getElementById('ajout-engagement-manuel-form');
      if (infoActionOverlay && infoActionOverlay.style.display === 'flex') {
        e.preventDefault();
        fermerInfoAction();
      } else if (aproposOverlay && aproposOverlay.style.display === 'flex') {
        e.preventDefault();
        fermerAPropos();
      } else if (overlay && overlay.style.display === 'flex') {
        e.preventDefault();
        annulerConfirmation();
      } else if (barreSelection && barreSelection.style.display !== 'none') {
        e.preventDefault();
        masquerBoutonAjoutEngagement();
      } else if (formEngagementManuel && formEngagementManuel.style.display !== 'none') {
        e.preventDefault();
        masquerFormAjoutEngagementManuel();
      } else if (dossierOuvert) {
        e.preventDefault();
        fermerDossierDrawer();
      }
      return;
    }
    // Ctrl/Cmd + S enregistre le dossier en cours de saisie.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      const panneau = document.getElementById('panel');
      if (panneau && panneau.open) {
        e.preventDefault();
        ajouterDossier();
      }
    }
  });

  // ---- installation en application (PWA) ----
  //
  // Le service worker n'est là que pour satisfaire le critère d'installation de Chrome ; l'outil
  // fonctionne à l'identique avec ou sans lui. S'il ne s'enregistre pas (fichier ouvert dans un
  // contexte restreint, navigateur différent…), l'app reste utilisable normalement — seul le
  // bouton "Installer" ne s'affichera pas, sans autre conséquence.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('Service worker non enregistré (l\u2019outil reste utilisable normalement) :', e);
    });
  }

  let evenementInstallation = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    evenementInstallation = e;
    const btn = document.getElementById('install-btn');
    if (btn) btn.style.display = 'inline-block';
  });

  async function installerApplication() {
    if (!evenementInstallation) return;
    const btn = document.getElementById('install-btn');
    evenementInstallation.prompt();
    const { outcome } = await evenementInstallation.userChoice;
    evenementInstallation = null;
    if (btn) btn.style.display = 'none';
    if (outcome === 'accepted') afficherToast('Application installée — retrouvez-la depuis son icône, sans repasser par Chrome.', 'OK', null);
  }

  // Une fois installée, Chrome ne redéclenche plus l'événement : on masque le bouton pour de bon.
  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('install-btn');
    if (btn) btn.style.display = 'none';
    evenementInstallation = null;
  });


  // ---- Calculateur de provision sur frais d'acte (onglet indépendant, pas lié à un dossier) ----
  // Demandé par l'étude pour estimer rapidement la provision à demander au client avant signature,
  // à partir du barème notarial 2026 et des taux départementaux de DMTO — indépendant du suivi des
  // échéances, accessible depuis son propre onglet de la sidebar (voir definirOnglet('calculateur')).
  // Barème/taux repris tels quels d'une maquette fournie par l'étude, pas recalculés : les données
  // fiscales/tarifaires ne sont pas du ressort de cet outil, seule la mise en forme change.
  const DEPARTEMENTS_FRAIS_ACTE = {'01':{name:'Ain',base:0.045,temp:0.05},'02':{name:'Aisne',base:0.045,temp:0.05},'03':{name:'Allier',base:0.045,temp:0.05},'04':{name:'Alpes-de-Haute-Provence',base:0.045,temp:0.05},'05':{name:'Hautes-Alpes',base:0.045,temp:0.045},'06':{name:'Alpes-Maritimes',base:0.045,temp:0.045},'07':{name:'Ardèche',base:0.045,temp:0.045},'08':{name:'Ardennes',base:0.045,temp:0.05},'09':{name:'Ariège',base:0.045,temp:0.05},'10':{name:'Aube',base:0.045,temp:0.05},'11':{name:'Aude',base:0.045,temp:0.05},'12':{name:'Aveyron',base:0.045,temp:0.05},'13':{name:'Bouches-du-Rhône',base:0.045,temp:0.05},'14':{name:'Calvados',base:0.045,temp:0.05},'15':{name:'Cantal',base:0.045,temp:0.05},'16':{name:'Charente',base:0.045,temp:0.045},'17':{name:'Charente-Maritime',base:0.045,temp:0.05},'18':{name:'Cher',base:0.045,temp:0.05},'19':{name:'Corrèze',base:0.045,temp:0.05},'20':{name:'Corse',base:0.045,temp:0.05},'21':{name:"Côte-d'Or",base:0.045,temp:0.05},'22':{name:"Côtes-d'Armor",base:0.045,temp:0.05},'23':{name:'Creuse',base:0.045,temp:0.05},'24':{name:'Dordogne',base:0.045,temp:0.05},'25':{name:'Doubs',base:0.045,temp:0.05},'26':{name:'Drôme',base:0.045,temp:0.045},'27':{name:'Eure',base:0.045,temp:0.05},'28':{name:'Eure-et-Loir',base:0.045,temp:0.05},'29':{name:'Finistère',base:0.045,temp:0.05},'30':{name:'Gard',base:0.045,temp:0.05},'31':{name:'Haute-Garonne',base:0.045,temp:0.05},'32':{name:'Gers',base:0.045,temp:0.05},'33':{name:'Gironde',base:0.045,temp:0.05},'34':{name:'Hérault',base:0.045,temp:0.05},'35':{name:'Ille-et-Vilaine',base:0.045,temp:0.05},'36':{name:'Indre',base:0.038,temp:0.038},'37':{name:'Indre-et-Loire',base:0.045,temp:0.05},'38':{name:'Isère',base:0.045,temp:0.05},'39':{name:'Jura',base:0.045,temp:0.05},'40':{name:'Landes',base:0.045,temp:0.05},'41':{name:'Loir-et-Cher',base:0.045,temp:0.05},'42':{name:'Loire',base:0.045,temp:0.05},'43':{name:'Haute-Loire',base:0.045,temp:0.05},'44':{name:'Loire-Atlantique',base:0.045,temp:0.05},'45':{name:'Loiret',base:0.045,temp:0.05},'46':{name:'Lot',base:0.045,temp:0.05},'47':{name:'Lot-et-Garonne',base:0.045,temp:0.05},'48':{name:'Lozère',base:0.045,temp:0.045},'49':{name:'Maine-et-Loire',base:0.045,temp:0.05},'50':{name:'Manche',base:0.045,temp:0.05},'51':{name:'Marne',base:0.045,temp:0.05},'52':{name:'Haute-Marne',base:0.045,temp:0.05},'53':{name:'Mayenne',base:0.045,temp:0.05},'54':{name:'Meurthe-et-Moselle',base:0.045,temp:0.05},'55':{name:'Meuse',base:0.045,temp:0.05},'56':{name:'Morbihan',base:0.045,temp:0.05},'57':{name:'Moselle',base:0.045,temp:0.05},'58':{name:'Nièvre',base:0.045,temp:0.05},'59':{name:'Nord',base:0.045,temp:0.05},'60':{name:'Oise',base:0.045,temp:0.045},'61':{name:'Orne',base:0.045,temp:0.05},'62':{name:'Pas-de-Calais',base:0.045,temp:0.05},'63':{name:'Puy-de-Dôme',base:0.045,temp:0.05},'64':{name:'Pyrénées-Atlantiques',base:0.045,temp:0.05},'65':{name:'Hautes-Pyrénées',base:0.038,temp:0.045},'66':{name:'Pyrénées-Orientales',base:0.045,temp:0.05},'67/68':{name:'Alsace',base:0.045,temp:0.05},'69A':{name:'Métropole de Lyon',base:0.045,temp:0.05},'69B':{name:'Rhône (hors Métropole de Lyon)',base:0.045,temp:0.05},'70':{name:'Haute-Saône',base:0.045,temp:0.05},'71':{name:'Saône-et-Loire',base:0.045,temp:0.05},'72':{name:'Sarthe',base:0.045,temp:0.05},'73':{name:'Savoie',base:0.045,temp:0.05},'74':{name:'Haute-Savoie',base:0.045,temp:0.05},'75':{name:'Paris',base:0.045,temp:0.05},'76':{name:'Seine-Maritime',base:0.045,temp:0.05},'77':{name:'Seine-et-Marne',base:0.045,temp:0.05},'78':{name:'Yvelines',base:0.045,temp:0.05},'79':{name:'Deux-Sèvres',base:0.045,temp:0.05},'80':{name:'Somme',base:0.045,temp:0.05},'81':{name:'Tarn',base:0.045,temp:0.05},'82':{name:'Tarn-et-Garonne',base:0.045,temp:0.05},'83':{name:'Var',base:0.045,temp:0.05},'84':{name:'Vaucluse',base:0.045,temp:0.05},'85':{name:'Vendée',base:0.045,temp:0.05},'86':{name:'Vienne',base:0.045,temp:0.05},'87':{name:'Haute-Vienne',base:0.045,temp:0.05},'88':{name:'Vosges',base:0.045,temp:0.05},'89':{name:'Yonne',base:0.045,temp:0.05},'90':{name:'Territoire-de-Belfort',base:0.045,temp:0.05},'91':{name:'Essonne',base:0.045,temp:0.05},'92':{name:'Hauts-de-Seine',base:0.045,temp:0.05},'93':{name:'Seine-Saint-Denis',base:0.045,temp:0.05},'94':{name:'Val-de-Marne',base:0.045,temp:0.05},'95':{name:"Val-d'Oise",base:0.045,temp:0.05},'971':{name:'Guadeloupe',base:0.045,temp:0.045},'972':{name:'Martinique',base:0.045,temp:0.05},'973':{name:'Guyane',base:0.045,temp:0.05},'974':{name:'La Réunion',base:0.045,temp:0.05},'976':{name:'Mayotte',base:0.038,temp:0.045}};
  // Pour chaque type de bien, un barème {palier de prix: [émoluments, trésor à 4,5 %]} — les mêmes
  // paliers que le tableau fourni par l'étude, interpolés linéairement entre deux paliers connus
  // (voir interpolerBaremeFraisActe). Trésor à un taux départemental différent de 4,5 % : voir
  // calculerFraisActe(), qui interpole entre la colonne à 4,5 % et une colonne à 5 % reconstituée.
  const BAREME_FRAIS_ACTE = {"house":{"500":[90,70],"1000":[100,100],"1500":[150,140],"2250":[230,200],"3000":[300,250],"3750":[380,310],"4500":[450,370],"5250":[530,430],"6000":[600,490],"6750":[680,550],"7500":[750,610],"8250":[830,660],"9000":[900,720],"9750":[980,780],"10500":[1050,840],"11250":[1130,900],"12000":[1200,960],"12750":[1280,1020],"13500":[1310,1060],"14250":[1320,1110],"15000":[1330,1160],"16500":[1360,1250],"18000":[1370,1340],"19500":[1390,1430],"21000":[1410,1530],"22500":[1420,1620],"24000":[1440,1710],"25500":[1450,1800],"27000":[1470,1890],"28500":[1490,1980],"30000":[1500,2080],"32000":[1520,2200],"34000":[1540,2320],"36000":[1570,2440],"38000":[1590,2570],"40000":[1610,2690],"42000":[1630,2810],"44000":[1650,2930],"46000":[1670,3060],"48000":[1690,3180],"50000":[1720,3300],"52000":[1740,3420],"54000":[1760,3550],"56000":[1780,3670],"58000":[1800,3790],"60000":[1820,3910],"62000":[1840,4030],"64000":[1850,4160],"66000":[1870,4280],"68000":[1890,4400],"70000":[1900,4520],"72000":[1920,4640],"74000":[1930,4760],"76000":[1950,4880],"78000":[1970,5000],"80000":[1980,5130],"83000":[2010,5310],"86000":[2030,5490],"89000":[2050,5670],"92000":[2080,5850],"95000":[2100,6040],"100000":[2140,6340],"105000":[2180,6640],"110000":[2220,6950],"115000":[2260,7250],"120000":[2300,7550],"125000":[2340,7860],"130000":[2380,8160],"135000":[2420,8460],"140000":[2460,8770],"150000":[2540,9370],"165000":[2660,10280],"180000":[2780,11190],"195000":[2900,12100],"210000":[3020,13010],"225000":[3140,13920],"240000":[3260,14830],"255000":[3380,15740],"270000":[3500,16650],"285000":[3620,17560],"300000":[3740,18470],"315000":[3860,19380],"330000":[3980,20290],"345000":[4100,21200],"360000":[4220,22110],"375000":[4340,23020],"390000":[4460,23930],"405000":[4580,24840],"420000":[4700,25750],"435000":[4820,26660],"450000":[4940,27570],"480000":[5180,29390],"510000":[5420,31210],"540000":[5660,33030],"570000":[5900,34850],"600000":[6140,36670],"630000":[6380,38490],"660000":[6620,40310],"690000":[6860,42130],"720000":[7100,43950],"750000":[7330,45770],"825000":[7930,50320],"900000":[8530,54870],"975000":[9130,59420],"1050000":[9730,63970],"1125000":[10330,68520],"1200000":[10930,73070],"1275000":[11530,77620],"1350000":[12130,82170],"1425000":[12730,86720],"1500000":[13330,91270],"1750000":[15320,106440],"2000000":[17320,121600]},"condo":{"500":[90,70],"1000":[100,100],"1500":[150,140],"2250":[230,200],"3000":[300,250],"3750":[380,310],"4500":[450,370],"5250":[530,430],"6000":[600,490],"6750":[680,550],"7500":[750,610],"8250":[830,660],"9000":[900,720],"9750":[980,780],"10500":[1050,840],"11250":[1130,900],"12000":[1200,960],"12750":[1280,1020],"13500":[1350,1070],"14250":[1430,1130],"15000":[1460,1180],"16500":[1480,1270],"18000":[1500,1370],"19500":[1520,1460],"21000":[1530,1550],"22500":[1550,1640],"24000":[1560,1730],"25500":[1580,1830],"27000":[1600,1920],"28500":[1610,2010],"30000":[1630,2100],"32000":[1650,2220],"34000":[1670,2350],"36000":[1690,2470],"38000":[1710,2590],"40000":[1730,2710],"42000":[1750,2840],"44000":[1780,2960],"46000":[1800,3080],"48000":[1820,3200],"50000":[1840,3330],"52000":[1860,3450],"54000":[1880,3570],"56000":[1900,3690],"58000":[1920,3810],"60000":[1950,3940],"62000":[1960,4060],"64000":[1980,4180],"66000":[1990,4300],"68000":[2010,4420],"70000":[2030,4540],"72000":[2040,4670],"74000":[2060,4790],"76000":[2070,4910],"78000":[2090,5030],"80000":[2110,5150],"83000":[2130,5330],"86000":[2150,5510],"89000":[2180,5700],"92000":[2200,5880],"95000":[2230,6060],"100000":[2270,6360],"105000":[2310,6670],"110000":[2350,6970],"115000":[2390,7270],"120000":[2430,7580],"125000":[2470,7880],"130000":[2510,8180],"135000":[2550,8490],"140000":[2590,8790],"150000":[2670,9400],"165000":[2790,10310],"180000":[2910,11220],"195000":[3020,12130],"210000":[3140,13040],"225000":[3260,13950],"240000":[3380,14860],"255000":[3500,15770],"270000":[3620,16680],"285000":[3740,17590],"300000":[3860,18500],"315000":[3980,19410],"330000":[4100,20320],"345000":[4220,21230],"360000":[4340,22140],"375000":[4460,23050],"390000":[4580,23960],"405000":[4700,24870],"420000":[4820,25780],"435000":[4940,26690],"450000":[5060,27600],"480000":[5300,29420],"510000":[5540,31240],"540000":[5780,33060],"570000":[6020,34880],"600000":[6260,36700],"630000":[6500,38520],"660000":[6740,40340],"690000":[6980,42160],"720000":[7220,43980],"750000":[7460,45800],"825000":[8060,50350],"900000":[8660,54900],"975000":[9260,59450],"1050000":[9860,64000],"1125000":[10460,68550],"1200000":[11050,73100],"1275000":[11650,77650],"1350000":[12250,82190],"1425000":[12850,86670],"1500000":[13450,91220],"1750000":[15090,106390],"2000000":[17090,121560]},"land":{"500":[90,70],"1000":[100,100],"1500":[150,140],"2250":[230,200],"3000":[300,250],"3750":[380,310],"4500":[450,370],"5250":[530,430],"6000":[600,490],"6750":[680,550],"7500":[750,610],"8250":[830,660],"9000":[900,720],"9750":[980,780],"10500":[1030,830],"11250":[1040,880],"12000":[1050,930],"12750":[1070,970],"13500":[1080,1020],"14250":[1090,1060],"15000":[1100,1110],"16500":[1130,1200],"18000":[1140,1300],"19500":[1160,1390],"21000":[1180,1480],"22500":[1190,1570],"24000":[1210,1660],"25500":[1220,1760],"27000":[1240,1850],"28500":[1260,1940],"30000":[1270,2030],"32000":[1290,2150],"34000":[1310,2280],"36000":[1340,2400],"38000":[1360,2520],"40000":[1380,2640],"42000":[1400,2760],"44000":[1420,2890],"46000":[1440,3010],"48000":[1460,3130],"50000":[1480,3250],"52000":[1510,3380],"54000":[1530,3500],"56000":[1550,3620],"58000":[1570,3740],"60000":[1590,3870],"62000":[1610,3990],"64000":[1620,4110],"66000":[1640,4230],"68000":[1660,4350],"70000":[1670,4470],"72000":[1690,4590],"74000":[1700,4720],"76000":[1720,4840],"78000":[1740,4960],"80000":[1750,5080],"83000":[1780,5260],"86000":[1800,5440],"89000":[1820,5630],"92000":[1850,5810],"95000":[1870,5990],"100000":[1910,6290],"105000":[1950,6600],"110000":[1990,6900],"115000":[2030,7200],"120000":[2070,7510],"125000":[2110,7810],"130000":[2150,8110],"135000":[2190,8420],"140000":[2230,8720],"150000":[2310,9330],"165000":[2430,10240],"180000":[2550,11150],"195000":[2670,12060],"240000":[3030,14790],"255000":[3150,15700],"270000":[3270,16610],"285000":[3390,17520],"300000":[3510,18430],"315000":[3630,19340],"330000":[3750,20250],"345000":[3870,21160],"360000":[3990,22070],"375000":[4110,22980],"390000":[4230,23890],"405000":[4350,24800],"420000":[4470,25710],"435000":[4590,26620],"450000":[4710,27530],"480000":[4950,29350],"510000":[5190,31170],"540000":[5430,32990],"570000":[5670,34810],"600000":[5910,36630],"630000":[6150,38450],"660000":[6390,40270],"690000":[6630,42090],"720000":[6860,43910],"750000":[7100,45730],"825000":[7700,50270],"900000":[8300,54820],"975000":[8900,59370],"1050000":[9500,63920],"1125000":[10100,68470],"1200000":[10700,73020],"1275000":[11300,77570],"1350000":[11900,82120],"1425000":[12500,86670],"1500000":[13100,91220],"1750000":[15090,106390],"2000000":[17090,121560]}};

  function interpolerBaremeFraisActe(table, prix) {
    const paliers = Object.keys(table).map(Number).sort((a, b) => a - b);
    if (prix <= paliers[0]) return table[paliers[0]];
    if (prix >= paliers[paliers.length - 1]) return table[paliers[paliers.length - 1]];
    for (let i = 1; i < paliers.length; i++) {
      if (prix <= paliers[i]) {
        const bas = paliers[i - 1], haut = paliers[i];
        const t = (prix - bas) / (haut - bas);
        return table[bas] + (table[haut] - table[bas]) * t;
      }
    }
  }

  function formaterPourcentageFraisActe(x) {
    return (x * 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 5 }) + ' %';
  }

  // Recalculée à chaque changement de champ (voir les attributs oninput/onchange sur
  // #onglet-calculateur dans index.html) — aucune sauvegarde, purement une estimation à la volée.
  function calculerFraisActe() {
    const prixEl = document.getElementById('calc-price');
    const deptEl = document.getElementById('calc-dept');
    const typeEl = document.getElementById('calc-type');
    if (!prixEl || !deptEl || !typeEl || !deptEl.value) return;

    // Le champ part vide (demandé par l'étude) : tant qu'aucun prix n'est saisi, on n'affiche pas
    // un résultat calculé sur une valeur de repli — il aurait l'air d'une vraie provision.
    const prixSaisi = Number(prixEl.value);
    if (!prixEl.value.trim() || !Number.isFinite(prixSaisi) || prixSaisi <= 0) {
      document.getElementById('calc-tag').textContent = '';
      document.getElementById('calc-total').textContent = '—';
      for (const id of ['calc-emol', 'calc-tre', 'calc-total2', 'calc-base-rate', 'calc-applied-rate', 'calc-dmt-rate']) {
        document.getElementById(id).textContent = '—';
      }
      document.getElementById('calc-saving').textContent = '';
      document.getElementById('calc-regime').textContent = 'Saisissez un prix pour obtenir la provision.';
      return;
    }

    const prix = Math.max(1, prixSaisi);
    const primoAccedant = document.querySelector('input[name="calc-first"]:checked').value === 'yes';
    const residencePrincipale = document.querySelector('input[name="calc-rp"]:checked').value === 'yes';
    const type = typeEl.value;
    const dept = DEPARTEMENTS_FRAIS_ACTE[deptEl.value];
    const bareme = BAREME_FRAIS_ACTE[type];

    // Hausse temporaire du taux départemental (loi de finances 2025, jusqu'à 5 %) non appliquée au
    // primo-accédant achetant sa résidence principale (art. L. 31-10-3 du CCH) — voir la note
    // affichée sous le résultat.
    const eligiblePrimoAccedant = primoAccedant && residencePrincipale;
    const tauxApplique = eligiblePrimoAccedant ? dept.base : dept.temp;

    const emoluments = interpolerBaremeFraisActe(Object.fromEntries(Object.entries(bareme).map(([k, v]) => [k, v[0]])), prix);
    const tresor45 = interpolerBaremeFraisActe(Object.fromEntries(Object.entries(bareme).map(([k, v]) => [k, v[1]])), prix);
    const tresor50 = tresor45 + prix * 0.0051185;
    const tresor = tresor45 + ((tauxApplique - 0.045) / 0.005) * (tresor50 - tresor45);
    const total = emoluments + 200 + tresor + 200;
    const dmto = tauxApplique + 0.012 + tauxApplique * 0.0237;

    const libelleType = type === 'house' ? 'Immeuble hors copropriété' : type === 'condo' ? 'Immeuble en copropriété' : 'Terrain à bâtir';
    document.getElementById('calc-tag').textContent = libelleType + ' · ' + (eligiblePrimoAccedant ? 'Primo-accédant éligible' : 'Régime sans exonération de la hausse');
    document.getElementById('calc-emol').textContent = formaterPrix(emoluments);
    document.getElementById('calc-tre').textContent = formaterPrix(tresor);
    document.getElementById('calc-total2').textContent = formaterPrix(total);
    document.getElementById('calc-total').textContent = formaterPrix(total);
    document.getElementById('calc-base-rate').textContent = formaterPourcentageFraisActe(dept.base);
    document.getElementById('calc-applied-rate').textContent = formaterPourcentageFraisActe(tauxApplique);
    document.getElementById('calc-dmt-rate').textContent = formaterPourcentageFraisActe(dmto);

    const economie = (dept.temp - dept.base) * prix * 1.0237;
    document.getElementById('calc-saving').textContent = (eligiblePrimoAccedant && dept.temp > dept.base)
      ? 'Économie liée à la non-application de la hausse départementale : environ ' + formaterPrix(economie) + '.'
      : '';
    document.getElementById('calc-regime').textContent = eligiblePrimoAccedant
      ? 'Primo-accédant : taux départemental de droit commun ' + formaterPourcentageFraisActe(dept.base) + ' ; la hausse temporaire de ' + formaterPourcentageFraisActe(dept.temp - dept.base) + ' n’est pas appliquée.'
      : 'Taux départemental appliqué : ' + formaterPourcentageFraisActe(dept.temp) + ' au 1er juin 2026.';
  }

  // ==== SIMULATEUR DE PRORATA (taxe foncière, charges de copropriété, loyer) ====
  //
  // Demandé par l'étude : répartir entre vendeur et acquéreur une somme déjà appelée pour une
  // période que la vente coupe en deux. Trois cas, une seule règle de calcul.
  //
  // CONVENTION IMPOSÉE PAR L'ÉTUDE, à ne pas changer sans nouvelle demande explicite :
  //   - jours RÉELS sur la période réelle (365 jours, 366 une année bissextile — pas de mois de
  //     30 jours ni d'année de 360) ;
  //   - le JOUR DE L'ACTE est à la charge de l'ACQUÉREUR. Il compte donc dans sa part.
  // Tout le reste en découle : la part du vendeur est le complément, jamais recalculée à part
  // (sans quoi un arrondi pourrait faire que les deux parts ne totalisent plus la somme appelée).
  //
  // Fonctions pures, déclarées en `function`/`var` : testables depuis tests/helpers/load-app.js.

  // Nombre de jours entre deux dates ISO, bornes comprises. Passe par Date.UTC plutôt que par des
  // dates locales : sur un changement d'heure (fin mars, fin octobre en France), une différence de
  // millisecondes entre deux dates locales ne fait pas un multiple exact de 86 400 000 et le
  // résultat se décalait d'un jour.
  function joursEntre(debutIso, finIso) {
    if (!debutIso || !finIso) return null;
    const a = new Date(debutIso + 'T00:00:00Z');
    const b = new Date(finIso + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / 86400000) + 1;
  }

  // Répartit `montant`, appelé pour la période [debut, fin], entre le vendeur et l'acquéreur à la
  // date de l'acte. Renvoie null si les données ne permettent pas un calcul sûr — jamais un chiffre
  // approximatif : c'est une somme qui sera réclamée à un client.
  function calculerProrata(montant, debutIso, finIso, dateActeIso) {
    const total = Number(montant);
    if (!Number.isFinite(total) || total <= 0) return null;
    const joursPeriode = joursEntre(debutIso, finIso);
    if (!joursPeriode || joursPeriode <= 0) return null;
    // L'acte doit tomber DANS la période : hors d'elle, il n'y a rien à répartir (la somme est
    // entièrement à l'un ou à l'autre), et le signaler vaut mieux que de rendre 0 % ou 100 % comme
    // si le calcul avait un sens.
    if (dateActeIso < debutIso || dateActeIso > finIso) return null;

    // Jour de l'acte inclus dans la part de l'acquéreur : sa période court de la date de l'acte à
    // la fin, bornes comprises.
    const joursAcquereur = joursEntre(dateActeIso, finIso);
    const joursVendeur = joursPeriode - joursAcquereur;
    const partAcquereur = Math.round(total * joursAcquereur / joursPeriode * 100) / 100;
    return {
      total,
      joursPeriode,
      joursVendeur,
      joursAcquereur,
      // Le complément, pas un second arrondi : les deux parts totalisent toujours exactement la
      // somme appelée, ce qu'un double arrondi ne garantirait pas (écart d'un centime).
      partVendeur: Math.round((total - partAcquereur) * 100) / 100,
      partAcquereur,
      pourcentageAcquereur: joursAcquereur / joursPeriode
    };
  }

  // Périodes proposées par l'outil. La taxe foncière est annuelle et due par le propriétaire au
  // 1er janvier (le vendeur), d'où une période calée sur l'année civile ; les charges de
  // copropriété suivent l'appel de fonds (trimestre ou mois) ; le loyer, le mois civil.
  var PERIODES_PRORATA = [
    { cle: 'annee', label: 'Année civile', aide: 'Taxe foncière : due par le propriétaire au 1er janvier, l’acquéreur rembourse sa part.' },
    { cle: 'trimestre', label: 'Trimestre civil', aide: 'Charges de copropriété appelées au trimestre.' },
    { cle: 'mois', label: 'Mois civil', aide: 'Charges mensuelles, ou loyer du mois en cours.' }
  ];

  // Bornes de la période contenant `dateIso`, pour le découpage choisi. Le dernier jour est calculé
  // en reculant d'un jour depuis le premier jour de la période suivante : la seule façon sûre de
  // tomber juste sur un 28/29 février ou un mois de 30 jours.
  function bornesPeriodeProrata(dateIso, periode) {
    if (!dateIso) return null;
    const d = new Date(dateIso + 'T00:00:00Z');
    if (isNaN(d)) return null;
    const annee = d.getUTCFullYear();
    const mois = d.getUTCMonth();
    let debutMois;
    let nbMois;
    if (periode === 'mois') { debutMois = mois; nbMois = 1; }
    else if (periode === 'trimestre') { debutMois = Math.floor(mois / 3) * 3; nbMois = 3; }
    else { debutMois = 0; nbMois = 12; }
    const debut = new Date(Date.UTC(annee, debutMois, 1));
    const finExclue = new Date(Date.UTC(annee, debutMois + nbMois, 1));
    const fin = new Date(finExclue.getTime() - 86400000);
    const iso = (x) => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
    return { debut: iso(debut), fin: iso(fin) };
  }

  function majPeriodeProrata() {
    const dateActe = document.getElementById('prorata-date').value;
    const periode = document.getElementById('prorata-periode').value;
    const bornes = bornesPeriodeProrata(dateActe, periode);
    if (bornes) {
      document.getElementById('prorata-debut').value = bornes.debut;
      document.getElementById('prorata-fin').value = bornes.fin;
    }
    calculerProrataAffichage();
  }

  function calculerProrataAffichage() {
    const montant = parseFloat(document.getElementById('prorata-montant').value);
    const debut = document.getElementById('prorata-debut').value;
    const fin = document.getElementById('prorata-fin').value;
    const dateActe = document.getElementById('prorata-date').value;
    const resultat = calculerProrata(montant, debut, fin, dateActe);
    const bloc = document.getElementById('prorata-resultat');
    const erreur = document.getElementById('prorata-erreur');

    if (!resultat) {
      bloc.style.display = 'none';
      erreur.style.display = 'block';
      erreur.textContent = (dateActe && debut && fin && (dateActe < debut || dateActe > fin))
        ? 'La date de l’acte doit tomber dans la période appelée : hors d’elle, il n’y a rien à répartir.'
        : 'Renseignez un montant, une période et une date d’acte pour obtenir la répartition.';
      return;
    }
    erreur.style.display = 'none';
    bloc.style.display = 'block';

    document.getElementById('prorata-part-acquereur').textContent = formaterPrixCentimes(resultat.partAcquereur);
    document.getElementById('prorata-part-vendeur').textContent = formaterPrixCentimes(resultat.partVendeur);
    document.getElementById('prorata-jours-acquereur').textContent =
      `${resultat.joursAcquereur} jour${resultat.joursAcquereur > 1 ? 's' : ''} sur ${resultat.joursPeriode}`;
    document.getElementById('prorata-jours-vendeur').textContent =
      `${resultat.joursVendeur} jour${resultat.joursVendeur > 1 ? 's' : ''} sur ${resultat.joursPeriode}`;
    // formaterPourcentageFraisActe() attend un RATIO (elle multiplie par 100 elle-même) et va
    // jusqu'à 5 décimales, utile pour un taux fiscal mais bruyant ici : deux décimales suffisent
    // pour une part de période.
    document.getElementById('prorata-pourcentage').textContent =
      (resultat.pourcentageAcquereur * 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      + ' % de la période à la charge de l’acquéreur';
    document.getElementById('prorata-detail').textContent =
      `${formaterPrixCentimes(resultat.total)} × ${resultat.joursAcquereur} / ${resultat.joursPeriode} jours`;
  }

  // Positionne la date du jour et la période par défaut au premier affichage, puis calcule.
  let prorataInitialise = false;
  function initProrata() {
    if (prorataInitialise) return;
    prorataInitialise = true;
    const champDate = document.getElementById('prorata-date');
    if (champDate && !champDate.value) champDate.value = isoAujourdHui();
    majPeriodeProrata();
  }

  // Peuple le <select> des départements une seule fois au démarrage (le calculateur est toujours
  // dans le DOM, comme les autres onglets — voir definirOnglet) et calcule un premier résultat par
  // défaut, visible dès le premier passage sur l'onglet. Un simple drapeau plutôt qu'une lecture de
  // `deptEl.options` : le faux document des tests (tests/helpers/load-app.js) ne modélise pas les
  // `<select>`/`<option>` du DOM réel, `.options` y est `undefined`.
  let calculateurFraisActeInitialise = false;
  function initCalculateurFraisActe() {
    if (calculateurFraisActeInitialise) return;
    const deptEl = document.getElementById('calc-dept');
    if (!deptEl) return;
    for (const [code, d] of Object.entries(DEPARTEMENTS_FRAIS_ACTE)) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = code + ' — ' + d.name;
      if (code === '41') option.selected = true;
      deptEl.appendChild(option);
    }
    calculateurFraisActeInitialise = true;
    calculerFraisActe();
  }

  // ---- Outil 2 — Audit intelligent des actes notariaux : import du projet (compromis/promesse ou
  // acte de vente) + pièces séparées, relecture croisée par le modèle local (Ollama, voir
  // server/src/llm.js, server/src/audit/ et CLAUDE.md, section "Outil 2") ----
  // Distinct du wizard "Nouveau dossier" (Outil 1, qui crée/tient la fiche de suivi à partir d'un
  // compromis SIGNÉ) : ici on compare des PROJETS de documents entre eux pour un audit, sans jamais
  // créer ni modifier un dossier de suivi — un dossier CLAIRE peut être lié en lecture seule pour
  // réutiliser ses données déjà vérifiées (voir auditDossierLie), jamais en écriture.
  // N'existe QUE sur `claude/serveur-intranet` (a besoin d'un backend pour parler à Ollama, jamais
  // appelé sans `fetchAvecAuth()`/l'écran de connexion, absents de `main`) — contrairement au reste
  // de ce fichier, cette section (et celle de l'extraction IA du wizard "Nouveau dossier", voir
  // lancerExtractionIa) n'est PAS portée sur `main`, qui n'a pas de backend pour l'exécuter.
  // Chaque fichier déposé n'existe qu'en mémoire le temps de l'audit — jamais enregistré, aucun
  // dossier créé. Seul le TEXTE déjà extrait dans le navigateur est envoyé au serveur, jamais le
  // PDF lui-même (voir lireTextePdfParPage, déjà utilisée pour vérifier un dossier local).
  let fichiersAnalyseIa = []; // { id, file, nom, type, statut, texte, pages, erreurTexte }
  let compteurFichierAnalyseIa = 0;
  let analyseIaEnCours = false;

  // Mode choisi EXPLICITEMENT à l'upload (jamais deviné, demande explicite de l'étude) : détermine
  // si la comparaison avec un compromis/une promesse de référence a lieu (§13 du cahier des
  // charges). auditTypeVente ('auto'|'maison'|'copropriete'|'terrain') pilote uniquement si la passe
  // copropriété (§12) est exécutée côté serveur. auditDossierLie (mode 'acte' seulement) évite de
  // réuploader le compromis quand le dossier est déjà suivi dans CLAIRE — jamais modifié, lu seul.
  let auditMode = 'compromis';
  let auditTypeVente = 'auto';
  let auditDossierLie = null;

  // Taxonomie des documents : chaque type route le document vers les seules passes qui en ont
  // besoin côté serveur (voir TYPES_PAR_PASSE, server/src/routes/auditActe.js) — garder le contexte
  // de chaque appel Ollama petit sur le CPU de bureau de l'étude, sans GPU.
  var TYPES_DOCUMENT_AUDIT = [
    { valeur: 'principal', libelle: 'Principal (le projet lui-même)' },
    { valeur: 'reference_compromis', libelle: 'Compromis / promesse de référence' },
    { valeur: 'titre', libelle: 'Titre de propriété' },
    { valeur: 'diagnostic', libelle: 'Diagnostic technique' },
    { valeur: 'urbanisme', libelle: "Document d'urbanisme" },
    { valeur: 'facture', libelle: 'Facture de travaux' },
    { valeur: 'autorisation', libelle: "Autorisation d'urbanisme" },
    { valeur: 'decennale', libelle: 'Garantie / assurance décennale' },
    { valeur: 'copropriete', libelle: 'Document de copropriété' },
    { valeur: 'autre', libelle: 'Autre pièce' }
  ];

  function changerAuditMode(valeur) {
    auditMode = (valeur === 'acte') ? 'acte' : 'compromis';
    const bloc = document.getElementById('audit-reference-bloc');
    if (bloc) bloc.style.display = auditMode === 'acte' ? '' : 'none';
    calculerPropositionsDossierAudit();
  }

  function changerAuditTypeVente(valeur) {
    auditTypeVente = valeur;
  }

  // Recherche d'un dossier CLAIRE à lier à l'audit (mode "projet d'acte de vente" uniquement) —
  // même patron que renderRechercheDashboard() (Tableau de bord), un menu de résultats sous le
  // champ plutôt qu'un filtre sur une liste déjà affichée, qui n'existe pas ici.
  function ligneResultatDossierAudit(d) {
    return `<button type="button" class="dash-recherche-ligne" onclick="choisirDossierAudit('${d.id}')">
          ${renderBadgeStatut(d)}
          <span class="dash-recherche-nom">${escapeHtml(d.nom)}</span>
          <span class="dash-recherche-resp">${escapeHtml(d.responsable || '')}</span>
        </button>`;
  }

  function rechercherDossierAudit(valeur) {
    const bloc = document.getElementById('audit-dossier-resultats');
    if (!bloc) return;
    const q = normaliserPourRecherche(String(valeur || '').trim());
    if (!q) { renderPropositionsDossierAudit(); return; }
    const resultats = dossiers
      .filter(d => !d.archive && normaliserPourRecherche(d.nom + ' ' + (d.responsable || '')).includes(q))
      .slice(0, 8);
    bloc.innerHTML = resultats.length === 0
      ? '<div class="dash-recherche-vide">Aucun dossier ne correspond.</div>'
      : resultats.map(ligneResultatDossierAudit).join('');
    bloc.style.display = 'block';
  }

  // Dossiers proposés d'après les parties lues dans le document principal (voir
  // proposerDossiersDepuisParties) : affichés sous le champ de recherche tant qu'il est vide et
  // qu'aucun dossier n'est lié — une proposition à confirmer d'un clic, jamais une liaison faite
  // toute seule. Recalculés dès que le principal est lu, change de type, ou que le mode passe à
  // « projet d'acte de vente » (le bloc n'existe pas dans l'autre mode).
  let auditDossiersProposes = [];

  function calculerPropositionsDossierAudit() {
    auditDossiersProposes = [];
    if (auditMode !== 'acte') { renderPropositionsDossierAudit(); return; }
    const principal = fichiersAnalyseIa.find(f => f.type === 'principal' && f.statut === 'ok');
    if (principal && principal.texte) {
      const typeActe = detecterTypeActe(principal.texte);
      const parties = detecterParties(principal.texte, typeActe && typeActe.valeur);
      auditDossiersProposes = proposerDossiersDepuisParties(parties, dossiers).slice(0, 5);
    }
    renderPropositionsDossierAudit();
  }

  function renderPropositionsDossierAudit() {
    const bloc = document.getElementById('audit-dossier-resultats');
    if (!bloc) return;
    if (auditDossierLie || auditDossiersProposes.length === 0) {
      bloc.style.display = 'none';
      bloc.innerHTML = '';
      return;
    }
    bloc.innerHTML = `<div class="dash-recherche-vide">${icone('sparkle')} Dossier(s) dont les parties correspondent au projet — cliquez pour lier :</div>`
      + auditDossiersProposes.map(ligneResultatDossierAudit).join('');
    bloc.style.display = 'block';
  }

  function renderDossierLieAudit() {
    const pill = document.getElementById('audit-dossier-pill');
    if (!pill) return;
    pill.innerHTML = auditDossierLie
      ? `<span class="dot-label dl-success">${icone('link')}${escapeHtml(auditDossierLie.nom)}<button type="button" class="piece-suppr" onclick="retirerDossierAudit()" title="Ne plus lier ce dossier" aria-label="Ne plus lier ce dossier">${icone('x')}</button></span>`
      : '';
  }

  function choisirDossierAudit(id) {
    auditDossierLie = dossiers.find(d => d.id === id) || null;
    const champ = document.getElementById('audit-dossier-recherche');
    if (champ) champ.value = '';
    renderPropositionsDossierAudit();
    renderDossierLieAudit();
  }

  function retirerDossierAudit() {
    auditDossierLie = null;
    renderDossierLieAudit();
    renderPropositionsDossierAudit();
  }

  // Va chercher le compromis/la promesse d'un dossier CLAIRE lié DIRECTEMENT SUR LE NAS déjà relié
  // (même mécanisme que le bouton "Ouvrir le compromis" — d.compromisNomFichier, chercherFichierParNom,
  // ouvrirPdfNas), plutôt que de forcer un second import manuel : le dossier est déjà suivi, son
  // compromis y est déjà. Silencieux en cas d'échec (nom introuvable, dossier non relié au NAS, PDF
  // illisible...) : la comparaison structurée (comparerCompromisEtProjet, plus bas) reste alors
  // disponible, seul le volet "clauses en langage libre" de la comparaison (passes IA) est absent.
  async function recupererTextCompromisDossier(d) {
    if (!d || !d.dossierLie || !d.nasDossier || !window.pdfjsLib) return null;
    try {
      const trouve = d.compromisNomFichier
        ? await chercherFichierParNom(d, d.compromisNomFichier)
        : (await chercherFichierParNom(d, 'compromis')) || await chercherFichierParNom(d, 'promesse');
      if (!trouve) return null;
      const pdf = await ouvrirPdfNas(cheminNasComplet(d, trouve.chemin));
      const { texte, pages } = await lireTextePdfParPage(pdf);
      if (texte.trim().length < 20) return null;
      return { nom: trouve.nom, texte, pages };
    } catch (e) {
      console.error('Audit des actes : compromis du dossier lié introuvable ou illisible', e);
      return null;
    }
  }

  function gererSurvolDepotAnalyseIa(event) {
    event.preventDefault();
    document.getElementById('analyse-ia-dropzone').classList.add('survol');
  }

  function gererQuitteDepotAnalyseIa(event) {
    event.preventDefault();
    document.getElementById('analyse-ia-dropzone').classList.remove('survol');
  }

  function gererDepotAnalyseIa(event) {
    event.preventDefault();
    document.getElementById('analyse-ia-dropzone').classList.remove('survol');
    const fichiers = event.dataTransfer && event.dataTransfer.files;
    if (fichiers && fichiers.length) ajouterFichiersAnalyseIa(fichiers);
  }

  // Devine "principal" pour le premier PDF (sauf s'il évoque un compromis/une promesse alors qu'on
  // est en mode "projet d'acte de vente", auquel cas c'est une RÉFÉRENCE, pas le principal), et
  // "reference_compromis" pour un fichier nommé compromis/promesse ensuite en mode acte — une
  // simple valeur de départ pratique, toujours modifiable ensuite via le <select> de chaque ligne
  // (voir changerTypeFichierAnalyseIa) : ce n'est jamais figé. Tout le reste part en "autre", faute
  // d'un jeu de mots-clés encore éprouvé sur de vrais noms de fichiers (voir CLAUDE.md, principe
  // déjà appliqué à PIECES_*/motifNom : premier jet, resserré sur retour réel).
  function deviserTypeAnalyseIa(nomFichier) {
    const dejaUnPrincipal = fichiersAnalyseIa.some(f => f.type === 'principal');
    const dejaUneReference = fichiersAnalyseIa.some(f => f.type === 'reference_compromis');
    const nommeCompromis = /compromis|promesse/i.test(nomFichier);
    if (!dejaUnPrincipal && (auditMode !== 'acte' || !nommeCompromis)) return 'principal';
    if (auditMode === 'acte' && nommeCompromis && !dejaUneReference) return 'reference_compromis';
    return 'autre';
  }

  function ajouterFichiersAnalyseIa(fileList) {
    const fichiers = Array.from(fileList).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (fichiers.length === 0) {
      afficherToast('Seuls les fichiers PDF sont acceptés.', 'OK', null);
      return;
    }
    const nouvelles = fichiers.map(file => ({
      id: `analyse-ia-${++compteurFichierAnalyseIa}`,
      file,
      nom: file.name,
      type: deviserTypeAnalyseIa(file.name),
      statut: 'lecture',
      texte: '',
      pages: [],
      erreurTexte: ''
    }));
    fichiersAnalyseIa = fichiersAnalyseIa.concat(nouvelles);
    renderListeFichiersAnalyseIa();
    for (const entree of nouvelles) extraireTexteFichierAnalyseIa(entree.id);
  }

  // Réutilise lireTextePdfParPage() (variante de lireTextePdfVerification, déjà en place pour
  // vérifier l'offre de prêt/les pièces d'un dossier local relié, qui mémorise en plus les
  // frontières de chaque page) : texte extractible + repli OCR sur les 3 premières pages si le PDF
  // est un scan sans texte — même logique, appliquée ici à un fichier importé via <input> plutôt
  // qu'à un FileSystemFileHandle. Les frontières de page sont indispensables à Outil 2 (Audit des
  // actes) pour citer un numéro de page précis par document, pas seulement pour le compromis en
  // cours d'import.
  async function extraireTexteFichierAnalyseIa(id) {
    const entree = fichiersAnalyseIa.find(f => f.id === id);
    if (!entree) return;
    if (!window.pdfjsLib) {
      entree.statut = 'erreur';
      entree.erreurTexte = 'Lecture PDF indisponible — réessayez dans un instant.';
      renderListeFichiersAnalyseIa();
      return;
    }
    try {
      const buffer = await entree.file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer, verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
      const { texte, pages } = await lireTextePdfParPage(pdf);
      if (texte.trim().length < 20) {
        entree.statut = 'erreur';
        entree.erreurTexte = 'Aucun texte exploitable trouvé (page vide, ou scan illisible même après OCR).';
      } else {
        entree.statut = 'ok';
        entree.texte = texte;
        entree.pages = pages;
      }
    } catch (e) {
      entree.statut = 'erreur';
      entree.erreurTexte = 'Lecture du PDF impossible.';
      console.error('Analyse IA : échec de lecture de', entree.nom, e);
    }
    renderListeFichiersAnalyseIa();
    if (entree.type === 'principal') calculerPropositionsDossierAudit();
  }

  function changerTypeFichierAnalyseIa(id, valeur) {
    const entree = fichiersAnalyseIa.find(f => f.id === id);
    if (!entree) return;
    const etaitPrincipal = entree.type === 'principal';
    entree.type = valeur;
    if (etaitPrincipal || valeur === 'principal') calculerPropositionsDossierAudit();
  }

  function retirerFichierAnalyseIa(id) {
    const retire = fichiersAnalyseIa.find(f => f.id === id);
    fichiersAnalyseIa = fichiersAnalyseIa.filter(f => f.id !== id);
    renderListeFichiersAnalyseIa();
    if (retire && retire.type === 'principal') calculerPropositionsDossierAudit();
  }

  // Pas de demanderConfirmation() ici, volontairement : rien n'est enregistré (voir en tête de
  // section), vider la liste ne perd qu'un import à refaire — un impact bien moindre qu'archiver/
  // supprimer un vrai dossier de suivi, qui garde ce garde-fou.
  function viderAnalyseIa() {
    fichiersAnalyseIa = [];
    const rapport = document.getElementById('analyse-ia-rapport');
    if (rapport) rapport.innerHTML = '<p class="hint">Aucun audit lancé pour l\'instant.</p>';
    renderListeFichiersAnalyseIa();
  }

  function statutFichierAnalyseIa(entree) {
    if (entree.statut === 'lecture') return `<span class="dot-label dl-neutre">${icone('spinner', null, true)}Lecture…</span>`;
    if (entree.statut === 'erreur') return `<span class="dot-label dl-urgent" title="${escapeAttr(entree.erreurTexte)}">${icone('alert-triangle')}Erreur</span>`;
    return `<span class="dot-label dl-success">${icone('file-text')}Lu</span>`;
  }

  function optionsTypeDocumentAudit(typeActuel) {
    return TYPES_DOCUMENT_AUDIT.map(t => `<option value="${t.valeur}" ${t.valeur === typeActuel ? 'selected' : ''}>${escapeHtml(t.libelle)}</option>`).join('');
  }

  function renderListeFichiersAnalyseIa() {
    const conteneur = document.getElementById('analyse-ia-liste-fichiers');
    if (!conteneur) return;
    conteneur.innerHTML = fichiersAnalyseIa.map(f => `
      <div class="analyse-ia-fichier">
        ${icone('file-text')}
        <span class="analyse-ia-fichier-nom" title="${escapeAttr(f.nom)}">${escapeHtml(f.nom)}</span>
        <select onchange="changerTypeFichierAnalyseIa('${f.id}', this.value)" aria-label="Type de document">${optionsTypeDocumentAudit(f.type)}</select>
        ${statutFichierAnalyseIa(f)}
        <button type="button" class="piece-suppr" onclick="retirerFichierAnalyseIa('${f.id}')" title="Retirer ce fichier" aria-label="Retirer ce fichier">${icone('x')}</button>
      </div>
    `).join('');

    const viderBtn = document.getElementById('analyse-ia-vider-btn');
    if (viderBtn) viderBtn.style.display = fichiersAnalyseIa.length ? '' : 'none';

    const lancerBtn = document.getElementById('analyse-ia-lancer-btn');
    if (lancerBtn && !analyseIaEnCours) {
      // Il faut au moins un document "principal" lu avec succès : c'est celui que toutes les
      // passes comparent aux autres (voir server/src/routes/auditActe.js, TYPES_PAR_PASSE).
      const principalPret = fichiersAnalyseIa.some(f => f.type === 'principal' && f.statut === 'ok');
      const enCoursDeLecture = fichiersAnalyseIa.some(f => f.statut === 'lecture');
      lancerBtn.disabled = !principalPret || enCoursDeLecture;
    }
  }

  // Interrogée à chaque ouverture de l'onglet (voir definirOnglet) : Ollama a pu être installé/
  // démarré/arrêté sur le serveur depuis la dernière visite. Affiche tout de suite un message
  // actionnable (modèle absent, Ollama non lancé...) plutôt que de laisser lancer un audit de
  // plusieurs minutes pour découvrir l'échec à la fin — voir server/src/routes/auditActe.js.
  async function verifierDisponibiliteAnalyseIa() {
    const zone = document.getElementById('analyse-ia-dispo');
    if (!zone) return;
    try {
      const reponse = await fetchAvecAuth('/api/audit-acte/disponibilite');
      const statut = await reponse.json();
      zone.style.display = 'flex';
      if (statut.disponible) {
        zone.className = 'analyse-ia-dispo dispo-ok';
        zone.innerHTML = `${icone('sparkle')}Modèle local « ${escapeHtml(statut.modele)} » disponible.`;
      } else {
        zone.className = 'analyse-ia-dispo dispo-off';
        zone.innerHTML = `${icone('alert-triangle')}${escapeHtml(statut.raison || 'Modèle IA local indisponible.')}`;
      }
    } catch (e) {
      // Session expirée : fetchAvecAuth a déjà réaffiché l'écran de connexion, rien d'autre à faire.
    }
  }

  // 4 niveaux de gravité (§16 du cahier des charges), sur seulement 3 couleurs déjà réservées dans
  // l'outil (pas de 5ᵉ couleur inventée pour l'occasion, voir CLAUDE.md) : IMPORTANT et A_VERIFIER
  // partagent l'ambre, distingués par leur texte et leur icône plutôt que par la couleur.
  function libelleGraviteAudit(gravite) {
    if (gravite === 'CRITIQUE') return { dl: 'dl-urgent', icone: 'alert-triangle', texte: 'Critique' };
    if (gravite === 'IMPORTANT') return { dl: 'dl-pret', icone: 'alert-triangle', texte: 'Important' };
    if (gravite === 'A_VERIFIER') return { dl: 'dl-pret', icone: 'info', texte: 'À vérifier' };
    return { dl: 'dl-neutre', icone: 'info', texte: 'Information' };
  }

  // Une source citée par le modèle, déjà vérifiée côté serveur (voir server/src/audit/fusion.js,
  // verifierSources) : la page n'est affichée que si la citation a été retrouvée telle quelle dans
  // le document — une page à côté d'une citation non vérifiée laisserait croire à une localisation
  // fiable qu'on n'a pas.
  function renderSourcesAudit(sources) {
    const liste = Array.isArray(sources) ? sources : [];
    if (liste.length === 0) return '';
    return `<div class="analyse-ia-constat-docs">${liste.map(s => {
      const extrait = escapeHtml(String(s.extrait || '').slice(0, 160));
      if (s.extraitTrouve) {
        const lieu = s.document ? `${escapeHtml(s.document)}${s.page ? ' · p.' + s.page : ''} — ` : '';
        return `${lieu}« ${extrait} »`;
      }
      return `<span class="dot-label dl-neutre">${icone('alert-triangle')}Citation non retrouvée — à vérifier en priorité</span>${s.document ? ' (' + escapeHtml(s.document) + ')' : ''}`;
    }).join('<br>')}</div>`;
  }

  // Constat générique (identification/parties/prix/dates/titre, travaux, urbanisme/autorisations/
  // garanties, préemption, servitudes, copropriété) : même gabarit pour toutes ces sections, la
  // seule chose qui change d'une section à l'autre est la liste passée à renderSectionAudit().
  // Décision de l'étude sur un constat (voir la mémoire d'audit, memoriserDecisionConstat) :
  // deux boutons sur chaque constat, « Écarter » et « Confirmer », et l'état mémorisé affiché en
  // clair — un constat déjà écarté se replie (jamais supprimé : on le voit toujours, replié), un
  // constat déjà confirmé remonte en tête de sa section. « Annuler » retire la décision mémorisée,
  // pour ne pas laisser une erreur d'un clic peser sur tous les audits suivants.
  function renderDecisionAudit(c) {
    if (!c.uid) return '';
    const m = c.memoire;
    if (m) {
      const nb = m.nb > 1 ? ` (${m.nb} fois)` : '';
      const texte = m.decision === 'ecarte' ? `Déjà écarté précédemment${nb}` : `Confirmé lors d'un audit précédent${nb}`;
      return `<div class="analyse-ia-constat-actions">
        <span class="dot-label ${m.decision === 'ecarte' ? 'dl-neutre' : 'dl-success'}">${icone(m.decision === 'ecarte' ? 'x' : 'check')}${texte}</span>
        <button type="button" class="icon-btn" onclick="annulerDecisionConstatAudit('${c.uid}')" title="Oublier cette décision">${icone('rotate-ccw')} Annuler</button>
      </div>`;
    }
    return `<div class="analyse-ia-constat-actions">
      <button type="button" class="icon-btn" onclick="decisionConstatAudit('${c.uid}', 'ecarte')" title="Ne plus signaler ce constat sur les prochains audits (il restera visible, replié)">${icone('x')} Écarter</button>
      <button type="button" class="icon-btn" onclick="decisionConstatAudit('${c.uid}', 'confirme')" title="Marquer ce constat comme pertinent : il remontera en tête sur les prochains audits">${icone('check')} Confirmer</button>
    </div>`;
  }

  function renderConstatAudit(c) {
    const g = libelleGraviteAudit(c.gravite);
    const corps = `<div class="analyse-ia-constat-titre"><span class="dot-label ${g.dl}">${icone(g.icone)}${g.texte}</span>${escapeHtml(c.titre)}</div>
      ${c.description ? `<p class="analyse-ia-constat-desc">${escapeHtml(c.description)}</p>` : ''}
      ${c.action ? `<p class="analyse-ia-constat-desc"><em>À vérifier : ${escapeHtml(c.action)}</em></p>` : ''}
      ${renderSourcesAudit(c.sources)}
      ${renderDecisionAudit(c)}`;
    if (c.memoire && c.memoire.decision === 'ecarte') {
      return `<details class="analyse-ia-constat constat-ecarte">
        <summary><span class="dot-label dl-neutre">${icone('x')}Déjà écarté</span>${escapeHtml(c.titre)}</summary>
        ${corps}
      </details>`;
    }
    return `<div class="analyse-ia-constat${c.memoire ? ' constat-confirme' : ''}">${corps}</div>`;
  }

  // Une obligation du vendeur (voir verifierObligationsVendeur) : tenue (avec la pièce qui le
  // prouve, et d'où elle vient), non tenue, ou à vérifier à la main quand aucune pièce type ne
  // correspond à la clause.
  function renderObligationAudit(o) {
    const g = libelleGraviteAudit(o.gravite);
    const etat = o.statut === 'tenue'
      ? `<span class="dot-label dl-success">${icone('check')}Tenue</span>`
      : o.statut === 'non_tenue'
        ? `<span class="dot-label ${g.dl}">${icone(g.icone)}Non tenue</span>`
        : `<span class="dot-label ${g.dl}">${icone(g.icone)}À vérifier</span>`;
    const cat = LIBELLES_CAT_OBLIGATION[o.cat] ? `<span class="engagement-type ${escapeAttr(o.cat)}">${LIBELLES_CAT_OBLIGATION[o.cat]}</span>` : '';
    let preuve = '';
    if (o.preuve && o.preuve.source === 'dossier') {
      preuve = `<p class="analyse-ia-constat-desc">Pièce trouvée dans le dossier client${o.preuve.nom ? ' : <em>' + escapeHtml(o.preuve.nom) + '</em>' : ''}.</p>`;
    } else if (o.preuve && o.preuve.source === 'depot') {
      preuve = `<p class="analyse-ia-constat-desc">Document déposé pour cet audit : <em>${escapeHtml(o.preuve.nom)}</em> (non rangé dans le dossier client, à classer).</p>`;
    } else if (o.statut === 'non_tenue') {
      preuve = '<p class="analyse-ia-constat-desc">Aucune pièce correspondante, ni dans le dossier client ni parmi les documents déposés ici.</p>';
    } else {
      preuve = '<p class="analyse-ia-constat-desc">Aucune pièce type ne correspond à cet engagement : à vérifier à la main.</p>';
    }
    const clause = o.clause && o.cle
      ? `<div class="analyse-ia-constat-docs">${o.page ? 'p.' + o.page + ' — ' : ''}« ${escapeHtml(o.clause.length > 200 ? o.clause.slice(0, 197) + '…' : o.clause)} »</div>`
      : (o.page ? `<div class="analyse-ia-constat-docs">p.${o.page} du compromis</div>` : '');
    return `<div class="analyse-ia-constat">
      <div class="analyse-ia-constat-titre">${etat}${cat}${escapeHtml(o.label)}</div>
      ${preuve}
      ${clause}
    </div>`;
  }

  // Diagnostics (forme différente : nature/dateEtablissement/dateExpiration/message, voir
  // server/src/audit/fusion.js, fusionnerDiagnostics) — la durée de validité n'est jamais calculée
  // ici ni par le modèle, seulement affichée telle que le serveur l'a établie en JS pur.
  function renderDiagnosticAudit(d) {
    const g = libelleGraviteAudit(d.gravite);
    const bien = d.bienConcerne ? ` — ${escapeHtml(d.bienConcerne)}` : '';
    return `<div class="analyse-ia-constat">
      <div class="analyse-ia-constat-titre"><span class="dot-label ${g.dl}">${icone(g.icone)}${g.texte}</span>${escapeHtml(d.label || d.nature)}${bien}</div>
      <p class="analyse-ia-constat-desc">${escapeHtml(d.message)}</p>
      ${renderSourcesAudit(d.sources)}
    </div>`;
  }

  function renderSectionAudit(titre, liste, rendreItem) {
    const items = Array.isArray(liste) ? liste.slice() : [];
    if (items.length === 0) return '';
    // Confirmés en tête, écartés en queue (repliés), le reste dans l'ordre du serveur.
    const rang = c => (c.memoire ? (c.memoire.decision === 'confirme' ? 0 : 2) : 1);
    items.sort((a, b) => rang(a) - rang(b));
    return `<div class="dash-section-titre" style="margin-top:14px;">${escapeHtml(titre)} (${items.length})</div>${items.map(rendreItem).join('')}`;
  }

  // Le dernier rapport affiché, pour le redessiner après une décision sur un constat sans
  // relancer l'audit ; chaque constat reçoit un identifiant de rendu (uid) et sa décision
  // mémorisée (memoire), posés par preparerRapportAudit().
  let dernierRapportAudit = null;
  let constatsAuditParUid = {};
  var SECTIONS_CONSTATS_AUDIT = ['constats', 'dates', 'diagnostics', 'travaux', 'urbanisme', 'preemptions', 'servitudes', 'copropriete'];

  function preparerRapportAudit(resultat) {
    constatsAuditParUid = {};
    let n = 0;
    for (const cle of SECTIONS_CONSTATS_AUDIT) {
      for (const c of (resultat[cle] || [])) {
        if (!c || typeof c !== 'object') continue;
        c.uid = `k${++n}`;
        constatsAuditParUid[c.uid] = c;
        const m = decisionPourConstat(c, memoireAuditConstats);
        c.memoire = m ? { id: m.id, decision: m.decision, nb: m.nb || 1 } : null;
      }
    }
  }

  function decisionConstatAudit(uid, decision) {
    const c = constatsAuditParUid[uid];
    if (!c || !dernierRapportAudit) return;
    memoriserDecisionConstat(c, decision);
    preparerRapportAudit(dernierRapportAudit);
    renderRapportAuditActe(dernierRapportAudit);
    afficherToast(decision === 'ecarte'
      ? 'Constat écarté : il sera replié sur les prochains audits d’un acte similaire.'
      : 'Constat confirmé : il remontera en tête sur les prochains audits d’un acte similaire.', 'OK', null);
  }

  function annulerDecisionConstatAudit(uid) {
    const c = constatsAuditParUid[uid];
    if (!c || !c.memoire || !dernierRapportAudit) return;
    oublierDecisionConstat(c.memoire.id);
    preparerRapportAudit(dernierRapportAudit);
    renderRapportAuditActe(dernierRapportAudit);
  }

  // Comptage par gravité — calculé côté serveur (voir calculerResume, fusion.js), jamais par le
  // modèle : une synthèse générée par le modèle affirmerait des chiffres qu'il n'a lui-même aucun
  // moyen de garantir cohérents avec le détail.
  // Les constats ajoutés côté client (comparaison structurée, obligations du vendeur) entrent
  // dans le même comptage que ceux du serveur — toujours un calcul, jamais le modèle.
  function incrementerResumeAudit(corps, gravite) {
    if (!corps.resume) corps.resume = { syntheseParGravite: {} };
    if (!corps.resume.syntheseParGravite) corps.resume.syntheseParGravite = {};
    const s = corps.resume.syntheseParGravite;
    s[gravite] = (s[gravite] || 0) + 1;
  }

  function renderResumeAudit(resume) {
    if (!resume) return '';
    const s = resume.syntheseParGravite || {};
    const tuile = (cle, libelle) => {
      const g = libelleGraviteAudit(cle);
      return `<span class="dot-label ${g.dl}">${icone(g.icone)}${s[cle] || 0} ${libelle}</span>`;
    };
    return `<div class="analyse-ia-resume">${tuile('CRITIQUE', 'critique(s)')}${tuile('IMPORTANT', 'important(s)')}${tuile('A_VERIFIER', 'à vérifier')}${tuile('INFORMATION', 'information(s)')}</div>`;
  }

  function renderRapportAuditActe(resultat) {
    const zone = document.getElementById('analyse-ia-rapport');
    if (!zone) return;
    let html = renderResumeAudit(resultat.resume);

    const erreurs = Array.isArray(resultat.erreursPasses) ? resultat.erreursPasses : [];
    for (const e of erreurs) {
      html += `<p class="hint">${icone('alert-triangle')} Passe « ${escapeHtml(e.passe)} » indisponible : ${escapeHtml(e.message)}</p>`;
    }

    // Obligations du vendeur (mode acte + dossier lié, voir verifierObligationsVendeur) : en
    // tête, avant les constats du modèle — c'est un résultat sûr, calculé, pas une suggestion.
    if (Array.isArray(resultat.obligationsVendeur)) {
      html += resultat.obligationsVendeur.length
        ? renderSectionAudit('Obligations du vendeur', resultat.obligationsVendeur, renderObligationAudit)
        : '<p class="hint">Aucune obligation du vendeur relevée dans le compromis du dossier lié.</p>';
    } else if (resultat.modeAudit === 'acte') {
      html += '<p class="hint">Liez un dossier CLAIRE (ci-contre) pour vérifier si le vendeur a tenu ses obligations — attestations d’entretien, factures de travaux, décennale…</p>';
    }

    const total = SECTIONS_CONSTATS_AUDIT.reduce((n, cle) => n + ((resultat[cle] || []).length), 0);
    if (total === 0) {
      html += '<p class="hint">Aucune incohérence relevée par le modèle sur les documents fournis — à vérifier malgré tout, voir la note ci-dessous.</p>';
    } else {
      html += renderSectionAudit('Identification, parties, prix, titre', resultat.constats, renderConstatAudit);
      html += renderSectionAudit('Dates', resultat.dates, renderConstatAudit);
      html += renderSectionAudit('Diagnostics', resultat.diagnostics, renderDiagnosticAudit);
      html += renderSectionAudit('Travaux', resultat.travaux, renderConstatAudit);
      html += renderSectionAudit('Urbanisme, autorisations, garanties', resultat.urbanisme, renderConstatAudit);
      html += renderSectionAudit('Préemption', resultat.preemptions, renderConstatAudit);
      html += renderSectionAudit('Servitudes', resultat.servitudes, renderConstatAudit);
      html += renderSectionAudit('Copropriété', resultat.copropriete, renderConstatAudit);
    }
    zone.innerHTML = html;
  }

  async function lancerAuditActe() {
    const fichiersOk = fichiersAnalyseIa.filter(f => f.statut === 'ok');
    const principal = fichiersOk.find(f => f.type === 'principal');
    if (!principal) {
      afficherToast('Ajoutez au moins un document « Principal » (le projet lui-même) dont le texte a bien été lu.', 'OK', null);
      return;
    }
    analyseIaEnCours = true;
    const btn = document.getElementById('analyse-ia-lancer-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = `${icone('spinner', null, true)} Audit en cours…`; }
    const rapport = document.getElementById('analyse-ia-rapport');
    if (rapport) rapport.innerHTML = '<p class="hint">Audit en cours — cela peut prendre plusieurs minutes selon le nombre de documents et la puissance du serveur (5 passes au maximum, exécutées l\'une après l\'autre).</p>';

    try {
      const referenceUploadee = fichiersOk.find(f => f.type === 'reference_compromis') || null;

      // Mode "projet d'acte de vente" + dossier lié + pas de compromis réuploadé : on va le
      // chercher automatiquement sur le NAS plutôt que d'obliger un second import manuel — voir
      // recupererTextCompromisDossier(). Silencieux en cas d'échec.
      let referenceAutoRecuperee = null;
      if (auditMode === 'acte' && auditDossierLie && !referenceUploadee) {
        referenceAutoRecuperee = await recupererTextCompromisDossier(auditDossierLie);
      }

      const documents = fichiersOk.map(f => ({ nom: f.nom, type: f.type, texte: f.texte, pages: f.pages }));
      if (referenceAutoRecuperee) {
        documents.push({ nom: referenceAutoRecuperee.nom, type: 'reference_compromis', texte: referenceAutoRecuperee.texte, pages: referenceAutoRecuperee.pages });
      }

      let typeVenteEnvoyee = auditTypeVente;
      if (typeVenteEnvoyee === 'auto') {
        typeVenteEnvoyee = detecterTypeVenteCopropriete(principal.texte) ? 'copropriete' : null;
      }

      const reponse = await fetchAvecAuth('/api/audit-acte/analyser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: auditMode, typeVente: typeVenteEnvoyee, documents })
      });
      const corps = await reponse.json();
      if (!reponse.ok) {
        if (rapport) rapport.innerHTML = `<p class="hint">${escapeHtml(corps.erreur || "Échec de l'audit.")}</p>`;
        return;
      }

      // Comparaison déterministe compromis → projet de vente (§13), sans IA — voir
      // comparerCompromisEtProjet(). Deux sources possibles pour la référence : un dossier CLAIRE
      // lié (directement, aucune ré-extraction) ou un texte de compromis (réuploadé ou récupéré du
      // NAS), passé par construireExtractionRegex() pour obtenir la même forme.
      if (auditMode === 'acte') {
        const texteReference = referenceUploadee ? referenceUploadee.texte : (referenceAutoRecuperee ? referenceAutoRecuperee.texte : null);
        const reference = auditDossierLie
          ? referenceDepuisDossier(auditDossierLie)
          : (texteReference ? construireExtractionRegex(texteReference, null, null) : null);
        if (reference) {
          const projet = construireExtractionRegex(principal.texte, null, null);
          const diff = comparerCompromisEtProjet(reference, projet);
          corps.constats = Array.isArray(corps.constats) ? corps.constats : [];
          for (const c of diff) {
            corps.constats.unshift({ gravite: c.gravite, titre: c.titre, description: c.description, action: null, sources: [] });
            incrementerResumeAudit(corps, c.gravite);
          }
        }

        // Obligations du vendeur (voir verifierObligationsVendeur) : uniquement avec un dossier
        // lié — c'est lui qui porte les engagements lus dans le compromis et l'état des pièces.
        if (auditDossierLie) {
          corps.obligationsVendeur = verifierObligationsVendeur(auditDossierLie, fichiersOk.map(f => ({ nom: f.nom, type: f.type })));
          for (const o of corps.obligationsVendeur) {
            if (o.statut !== 'tenue') incrementerResumeAudit(corps, o.gravite);
          }
        }
      }
      corps.modeAudit = auditMode;

      dernierRapportAudit = corps;
      preparerRapportAudit(corps);
      renderRapportAuditActe(corps);
    } catch (e) {
      // Session expirée : déjà géré par fetchAvecAuth (écran de connexion réaffiché).
    } finally {
      analyseIaEnCours = false;
      renderListeFichiersAnalyseIa();
      if (btn) btn.innerHTML = "Lancer l'audit";
    }
  }

  // ==== RÉGLAGES : rappels automatiques vers Teams (Power Automate) ====
  //
  // Remplace le DÉCLENCHEMENT AUTOMATIQUE des rappels (voir server/src/jobs/rappels.js) — le
  // rappel générique par email ("Rappel email" sur la fiche dossier, `ouvrirEmailRappel()`) a
  // depuis été retiré définitivement, à la demande de l'étude : les rappels Teams, avec copie
  // systématique vers `teamsCopieEmail`, couvrent désormais ce besoin sans geste manuel. L'étude a
  // explicitement demandé un écran dans la sidebar pour saisir elle-même l'URL du flux Power
  // Automate et l'adresse Teams de chaque collaborateur, plutôt qu'un tableau figé dans le code ou
  // un fichier de configuration à éditer à la main.
  //
  // `teamsCopieEmail` (adresse Teams recevant une copie de CHAQUE rappel envoyé, quel que soit le
  // responsable destinataire) a été ajouté sur la même demande : l'étude veut être tenue au
  // courant de tous les envois, pas seulement ceux qui lui sont personnellement adressés en tant
  // que responsable d'un dossier. Envoyée par `executerTacheRappels()` en plus du destinataire
  // habituel, jamais à sa place — un échec d'envoi de la copie n'empêche jamais le rappel
  // principal d'être marqué comme envoyé (voir jobs/rappels.js).
  //
  // Liste fermée des 3 responsables (voir CLAUDE.md, "Responsables du dossier : liste fermée") —
  // reprise ici telle quelle plutôt que de refactoriser les <select> existants du formulaire/de la
  // fiche dossier, qui n'ont pas besoin de cette liste sous forme de variable.
  var RESPONSABLES = ['Bastien ANGLUMENT', 'Julie VASSELIN', 'Jérémy SAUJOT'];

  async function chargerReglages() {
    try {
      const reponse = await fetchAvecAuth('/api/reglages');
      const reglages = await reponse.json();
      document.getElementById('reglages-teams-actif').checked = !!reglages.teamsActif;
      document.getElementById('reglages-webhook-url').value = reglages.teamsWebhookUrl || '';
      document.getElementById('reglages-copie-email').value = reglages.teamsCopieEmail || '';
      renderReglagesEmails(reglages.emailsResponsables || {});
      document.getElementById('reglages-etat').style.display = 'none';
    } catch (e) {
      // Session expirée : déjà géré par fetchAvecAuth (écran de connexion réaffiché).
    }
  }

  function renderReglagesEmails(emailsResponsables) {
    document.getElementById('reglages-emails-liste').innerHTML = RESPONSABLES.map((nom, i) => `
      <div class="calc-champ">
        <label for="reglages-email-${i}">${escapeHtml(nom)}</label>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="email" id="reglages-email-${i}" data-responsable="${escapeAttr(nom)}" placeholder="prenom.nom@etude.fr" value="${escapeAttr(emailsResponsables[nom] || '')}" style="flex:1;">
          <button type="button" class="secondary" onclick="testerTeamsResponsable('${escapeOnclickArg(nom)}')">Tester</button>
        </div>
        <p class="hint reglages-email-resultat" id="reglages-email-resultat-${i}"></p>
      </div>
    `).join('');
  }

  function reglagesFormulaireVersObjet() {
    const emailsResponsables = {};
    RESPONSABLES.forEach((nom, i) => {
      const champ = document.getElementById(`reglages-email-${i}`);
      const valeur = champ ? champ.value.trim() : '';
      if (valeur) emailsResponsables[nom] = valeur;
    });
    return {
      teamsActif: document.getElementById('reglages-teams-actif').checked,
      teamsWebhookUrl: document.getElementById('reglages-webhook-url').value.trim(),
      teamsCopieEmail: document.getElementById('reglages-copie-email').value.trim(),
      emailsResponsables
    };
  }

  async function enregistrerReglages() {
    const zone = document.getElementById('reglages-etat');
    try {
      const reponse = await fetchAvecAuth('/api/reglages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reglagesFormulaireVersObjet())
      });
      const reglages = await reponse.json();
      renderReglagesEmails(reglages.emailsResponsables || {});
      zone.style.display = 'flex';
      zone.className = 'analyse-ia-dispo dispo-ok';
      zone.innerHTML = `${icone('check')}Réglages enregistrés.`;
    } catch (e) {
      zone.style.display = 'flex';
      zone.className = 'analyse-ia-dispo dispo-off';
      zone.innerHTML = `${icone('alert-triangle')}Impossible d'enregistrer — vérifiez la connexion au serveur intranet.`;
    }
  }

  // Envoie un message de test à UN collaborateur, avec les réglages déjà ENREGISTRÉS côté serveur
  // (voir routes/reglages.js) — pas ceux du formulaire pas encore validés : on veut vérifier ce que
  // le job de rappels utilisera réellement. Si le formulaire contient une modification non
  // enregistrée, on le signale plutôt que de tester une valeur qui n'est pas encore la bonne.
  async function testerTeamsResponsable(nom) {
    const i = RESPONSABLES.indexOf(nom);
    const resultat = document.getElementById(`reglages-email-resultat-${i}`);
    if (resultat) { resultat.textContent = 'Envoi du message de test…'; resultat.className = 'hint reglages-email-resultat'; }
    try {
      const reponse = await fetchAvecAuth('/api/reglages/tester-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responsable: nom })
      });
      const corps = await reponse.json();
      if (!resultat) return;
      if (reponse.ok && corps.ok) {
        resultat.textContent = '✓ Message envoyé — vérifiez sur Teams.';
        resultat.className = 'hint reglages-email-resultat reglages-email-ok';
      } else {
        resultat.textContent = corps.erreur || "Échec de l'envoi.";
        resultat.className = 'hint reglages-email-resultat reglages-email-echec';
      }
    } catch (e) {
      // Session expirée : déjà géré par fetchAvecAuth (écran de connexion réaffiché).
    }
  }

  // Remplit les emplacements d'icônes du HTML statique (sidebar, burger mobile, dropzone) — le
  // reste de l'application est déjà rendu depuis script.js, ce point d'entrée unique évite de
  // dupliquer le dessin des icônes entre le HTML et ICONES.
  function initIconesStatiques() {
    const cibles = {
      'icon-burger': 'menu',
      'icon-nav-dashboard': 'layout',
      'icon-nav-nouveau': 'plus',
      'icon-nav-suivi': 'list',
      'icon-install': 'download',
      'icon-dropzone': 'upload',
      'icon-intro-dates': 'calendar',
      'icon-intro-doc': 'file-text',
      'icon-intro-pieces': 'folder',
      'icon-intro-mail': 'mail',
      'icon-intro-adresse': 'map-pin',
      'icon-nav-calculateur': 'banknote',
      'icon-nav-prorata': 'part-disque',
      'icon-apropos': 'info',
      'icon-calc-warning': 'alert-triangle',
      'icon-nav-analyse-ia': 'sparkle',
      'icon-analyse-ia-warning': 'alert-triangle',
      'icon-analyse-ia-dropzone': 'upload',
      'icon-pdf-recherche': 'search',
      'icon-pdf-recherche-prec': 'chevron-up',
      'icon-pdf-recherche-suiv': 'chevron-down',
      'icon-nav-reglages': 'settings'
    };
    for (const [id, nom] of Object.entries(cibles)) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = icone(nom);
    }
  }
  initIconesStatiques();
  initCalculateurFraisActe();

  chargerTheme();
  chargerApprentissage();
  chargerExclusionsMotifNom();
  chargerJournalCorrections();
  chargerMemoireAudit();
  // Mode serveur intranet (voir CLAUDE.md) : l'application entière est bloquée par l'écran de
  // connexion tant que le mot de passe partagé n'a pas été validé — un jeton déjà mémorisé
  // (localStorage, valable 12h côté serveur) permet de sauter cette étape au rechargement.
  // demarrerApplication() gère elle-même le cas d'un jeton devenu invalide (401 → fetchAvecAuth
  // réaffiche l'écran de connexion), pas la peine de le vérifier au préalable ici.
  authToken = chargerJetonStocke();
  if (authToken) {
    demarrerApplication().catch((e) => console.error('Démarrage impossible', e));
  } else {
    afficherEcranConnexion();
  }
  renderChips();
  // L'analyse juridique est une étape du wizard toujours visible (voir definirEtapeWizard) : sans
  // cet appel initial, ses sections restaient affichées vides (ni contenu ni message d'état) tant
  // qu'aucun PDF n'avait encore été importé dans la session.
  afficherAnalyseJuridique();
