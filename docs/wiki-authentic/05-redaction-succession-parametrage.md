# Authen.tic (Fichorga) — Résumé E : rédaction, succession, donation-partage, divorce, parapheur, paramétrage, ERP, LegaPass, VigIActe, résumé IA

Source : manuel utilisateur Fichorga (wiki public), 13 fichiers lus en entier. Paraphrase, pas de copie longue. Les images sont absentes : tout ce qui est « fenêtre suivante » sans libellé écrit est signalé « capture manquante ».
Légende : ⚠ = action qui écrit, valide, envoie, signe, supprime ou ne se défait pas facilement. « à vérifier » = doute ou capture absente.
Les dates de mise à jour de la documentation sont données par page (de juin 2023 à septembre 2026).

## 0. LIMITES IMPORTANTES DE CE LOT (à lire d'abord)

Le lot ne décrit PAS plusieurs choses que le cahier des charges de CLAIRE attend. Rien n'a été inventé pour combler :

1. **Tableau « Rédaction » d'un dossier (états « Non rédigé » / « En cours » / « Signé le… »)** : ces libellés n'apparaissent dans aucune des 13 pages. Les pages « La rédaction » décrivent la rédaction interactive (RAO) et l'acte Word, mais pas le tableau d'état du sous-dossier. À chercher dans un autre lot (portail du dossier / sous-dossier / actes).
2. **Dossier de succession et ses tableaux** (Courrier, Demande, Etat civil, Banque, Mails-courriers à retour, Rédaction) : absents. Seule la « déclaration de succession » (calculateur fiscal, acte 2705) est décrite, plus la demande LegaPass. Les comparants « Défunt / Héritier / Légataire » et le conjoint survivant ne sont décrits que du point de vue de la déclaration de succession.
3. **FCDDV, requêtes de succession, Comedec, CJN, réquisitions hors formalité (EHF)** : aucune page de ce lot. Seule trace : les droits « Habilitation Etat-Civil » (COMEDEC) et « Habilitation CJN » dans la fiche utilisateur (voir §8). Rien sur les demandes elles-mêmes, ni sur EHF.
4. **Création d'un dossier / d'un sous-dossier, fiches clients, fiches immeubles** : seulement évoqués (« rattacher les clients et immeubles »). La structure des fiches n'est pas décrite ici, sauf les cases de qualité et la date/lieu de décès.
5. **« Plus d'actions » > « Ouvrir »**, « Afficher en détail » : décrits (version Silicium), mais sans capture.

Conséquence pour CLAIRE : ce lot ne suffit pas à lire un dossier de succession. Il donne le vocabulaire des actes, des droits et des outils annexes.

## 1. Deux interfaces : « classique » et « Silicium »

Presque chaque page existe en deux versions : l'interface d'origine et la version « Silicium » (récente, mises à jour de 2025-2026). Différences repérables dans le texte :

- Ouvrir un acte depuis son détail : classique = bouton « Ouvrir » ; Silicium = bouton « Plus d'actions » puis « Ouvrir ». (pages : La-redaction/01-Redaction-interactive, 01-Redaction-interactive-(version-Silicium) ; La-declaration-de-succession/01-Presentation, 01-Presentation-(version-Silicium))
- Barre Word : menus classiques (Insertion, Mise en page, Outils de calcul, Impression, Courrier, Maintenance) remplacés en Silicium par Outils, Insérer, Mise en page, Calcul, Réviser, Imprimer, Aide. (page : La-redaction/03-Menu-authentic et 03-Menu-authentic-(version-Silicium))
- Fiche utilisateur : « Type d'utilisateur » (5 types) devient « Profil » (6 types, avec « Notaire salarié »). (pages : Creation-utilisateur et Creation-utilisateur-(version-Silicium))
- « Modèles de communication » n'existe que dans la version Silicium. (page : Les-modèles-de-communication)
- Le menu parapheur « Gestion des tampons / mentions » devient « Parapheur - Tampons / Parapheur - Mentions ». (pages : Parapheur, Le-parapheur-(version-silicium))

Conséquence : les libellés varient selon la version installée à l'étude. À vérifier à l'écran avant tout pilotage.

## 2. La rédaction des actes

### 2.1 Ouvrir un acte (rédaction interactive, « RAO »)

Condition : intervenants (clients) et immeubles renseignés au niveau du sous-dossier. (page : La-redaction/01-Redaction-interactive-(version-Silicium))

Deux façons de lancer :
1. Cliquer sur le libellé de l'acte.
2. Clic droit sur le libellé, ou survol puis « Afficher en détail », puis « Ouvrir » (classique) ou « Plus d'actions » > « Ouvrir » (Silicium).

Résultat : une page à deux volets. Volet 1 = rédaction interactive (RAO) ; volet 2 = document Word où les clauses se déversent. (page : La-redaction/01-Redaction-interactive)

À la première ouverture de certains actes (divorce, donation-partage, déclaration de succession), un calculateur s'affiche d'abord (voir §3 à §6).

### 2.2 Modes de rédaction (onglet « Mode de rédaction »)

Silicium annonce 5 modes, la version classique en annonce 6 (écart de comptage dans le texte, à vérifier à l'écran) :

- **6ème sens** : l'IA du logiciel rédige l'acte et répond aux questions selon les habitudes de l'étude. ⚠ rédige l'acte seul.
- **Choix par défaut** : rédaction automatique, première réponse de chaque question (les plus courantes). ⚠ idem.
- **Rédaction manuelle** : mode par défaut ; l'utilisateur répond à toutes les questions.
- **Présélection Fichorga / Présélection étude** : matrices de réponses préenregistrées. Symbole carré = Fichorga ; symbole stylo = étude (Silicium).
- **Modélisation étude** : modèles d'actes pour tous les collaborateurs.
(page : La-redaction/01-Redaction-interactive-(version-Silicium))

Lancement : choisir le mode puis bouton vert « Lancer la recherche ». Pour une présélection : « Lancer la rédaction ». (pages : 01-Redaction-interactive, 05-Preselection-etude)

### 2.3 Questions / réponses (choix juridiques)

- Zone de questions : liste des choix juridiques de l'acte, boutons « + » (déplier) et « - » (replier au titre du paragraphe).
- Zone de réponses : clic sur le libellé ou numéro tapé au pavé numérique ; loupe = voir la clause ; trois boutons à droite (question précédente / suivante / marquer la réponse). Les icônes sont absentes (capture manquante).
- Arrêt possible à tout moment (croix du volet RAO ou fermeture Word avec enregistrement). Reprise : bouton « Actualiser la rédaction » : les questions repartent où elles s'étaient arrêtées.
- Modifier une réponse (même acte terminé) : double-clic sur la question, ou clic droit : « Atteindre dans l'acte », « Modifier dans la Rédaction Interactive », « Activer / Désactiver le marqueur » (marque en rouge), ⚠ « Supprimer jusqu'à la fin » (supprime toutes les questions et clauses à partir du choix).
(page : La-redaction/01-Redaction-interactive-(version-Silicium))

### 2.4 Couleurs de l'acte Word

Acte télé@ctable : noir = texte Word ; rouge = variable télé@cte ; bleu = variable issue de la base, des fiches clients/immeubles ou à compléter. Variables vides = « --- » (trois tirets). (page : La-redaction/01-Redaction-interactive-(version-Silicium) ; 02-Variables-(version-Silicium))

### 2.5 Variables

- Variables issues des fiches Clients/Immeubles (bleu, rouge si télé@ctable) : un clic ouvre la fiche. Modifier la fiche corrige l'acte. Depuis l'acte, message de confirmation « Oui » ouvre la fiche ; à sa fermeture, nouvelle confirmation « Oui » reprend les changements dans l'acte. Si la fiche est modifiée depuis le portail, avertissement à la prochaine ouverture de l'acte (« Oui » = prendre en compte). ⚠ modifie l'acte. (page : 02-Variables-(version-Silicium))
- Fin de la RAO : message avec trois choix, « Afficher la trame », « Afficher l'acte seul », « Afficher la saisie des variables (F3) ».
- Fenêtre de saisie des variables (Silicium), 4 accès : touche F3 ; clic sur une variable (acte en pleine page) ; clic droit > « Aller à la variable » ; menu Authen.tic > « Outils » > « Edition des variables interactives ». Menu déroulant : toutes les variables / seulement télé@cte / seulement « trois tirets » / seulement non complétées / une seule variable. Outils : couper, copier, coller, sélectionner, chiffres en lettres, calendrier, agrandir, affichage 1 ou 2 pages, recherche par mots-clés. (page : 02-Variables-(version-Silicium))
- Classique : Ctrl+T repère la prochaine variable non complétée ; onglet « Variables » de la RAO (variables non renseignées en rouge ; 4 boutons : précédente, actualiser et suivante, agrandir, calendrier). Accès par F3, par l'icône enveloppe « Réponse aux variables interactives », ou clic droit « Aller à la variable ». (page : 02-Variables)
- Supprimer une variable : ⚠ afficher d'abord le texte masqué dans Word ; puis Ctrl+Suppr (classique) ou « Variable en texte » / « Conversion d'une variable en texte ». Irréversible sauf reconstruction.
- Récupérer une variable supprimée : « Reconstruction de variables / clauses » (menu Outils) ou clic droit > « Reconstruction de clause » ; confirmation « OK » ; ⚠ la clause sélectionnée est supprimée puis remplacée immédiatement.

### 2.6 Présélection étude

(page : La-redaction/05-Preselection-etude)
- Création uniquement à partir d'un acte déjà déroulé en totalité (par exemple via le choix par défaut). Icône stylo dans la RAO > « Ajouter » > nom + Entrée > « Modifier » > « Tout développer » > cocher les réponses par défaut > « Valider ». ⚠ enregistre un modèle visible de toute l'étude (à vérifier : visibilité).
- Renommer (Etude seulement) : stylo > « Renommer ». Dupliquer (Fichorga ou Etude, la copie est toujours Etude) : « Dupliquer » puis « Ok ». Modifier : « Modifier ».
- Utiliser : sélectionner le modèle puis « Lancer la rédaction » ; les questions déjà répondues ne sont plus posées, restent modifiables dans l'onglet « Rédaction ».

### 2.7 Modélisation (modèles d'actes)

(page : La-redaction/06-Modelisation)
- Boutons : utiliser le modèle ; renommer ; enregistrer comme modèle (trame juridique + variables) ; enregistrer le modèle Word (trame + variables + modifications Word) ; ⚠ supprimer le modèle. (icônes absentes, captures manquantes)
- Création : rédiger entièrement l'acte, ou ouvrir un acte déjà rédigé (signés et mis au répertoire compris) ; dans l'onglet « Mode de rédaction », bouton de modélisation, nom du modèle, « Valider ». Le modèle apparaît dans « Modélisation Etude ».
- Usage : créer un acte de même nature, rattacher clients et immeubles, ouvrir l'acte Word, choisir le modèle. Le logiciel lance le contrôle de cohérence (met à jour intervenants et immeubles) et peut poser des questions.

### 2.8 Sous-menu Fonctionnalités (volet RAO, Silicium)

(page : La-redaction/04-Fonctionnalites-outils-authentic-(version-Silicium))
Boutons : tout déplier / tout replier ; relancer la RAO ; type d'affichage (RAO à gauche et acte à droite, acte sur une page, 2 pages) ; menu supplémentaire ; enregistrer l'acte et la RAO dans Authen.tic ⚠ (écrit).
Menu supplémentaire :
- ⚠ « Effacer la rédaction interactive » : retour à un acte vierge.
- « Edition des choix » : génère un Word listant questions et réponses.
- « Clauses supprimées » : les affiche dans la RAO.
- « Clauses spécifiques » : clausier de l'étude (créer : « Ajouter », intitulé, nature d'acte, « Valider », saisie dans Word, « Enregistrer », « Quitter » ; intégrer : curseur dans l'acte, « Intégrer » ; modifier ; ⚠ supprimer avec confirmation Oui/Non).
- « Clauses spécifiques avancées » : concepteur d'arborescences juridiques (mode avancé, « Nouvelle Nature », racines, feuilles, clause obligatoire, copier/coller, déplacer, générer un Word de la conception).
- « Personnalisation de clauses » : personnalise pour toute l'étude les clauses de la bible Fichorga. Deux types : « Clause personnalisée optionnelle » (question Oui/Non à chaque rencontre) ou « Clause personnalisée systématique » (remplace la clause Fichorga d'office). ⚠ affecte tous les actes futurs de l'étude. Modifier ou désactiver : depuis l'acte (« Personnalisation de clause »), ou depuis le portail : « Paramètres » > « Gestion de la bible » > champ « Nature d'acte » + « Type de produit » = Acte > « VALIDER » > choisir la partie de l'acte puis la clause > « Modifier » > « Enregistrer ».
- Barre de recherche du volet RAO : recherche dans la RAO (loupe), la trame (bulle), l'acte Word (bulle avec W, mot grisé), la bible (fenêtre des clauses). Insertion d'une clause de la bible : clic droit après le code vert > « insérer le document dans word » ; ou « insérer la sélection dans word » pour une partie. La recherche dans les éditions Francis Lefebvre « n'est plus active » (version classique).

### 2.9 Menu Authen.tic dans Word (barre « Accueil »)

(pages : 03-Menu-authentic, 03-Menu-authentic-(version-Silicium))
Silicium, par menu :
- **Outils** : « Vérification des variables », « Actualisation des variables », « Reconstruction de variables / clauses », « Contrôle de cohérence » (relance la RAO en tenant compte des modifs récentes du portail), « Edition des variables interactives », « Conversion d'une variable en texte », « Clauses spécifiques avancées », ⚠ « Conversion d'un document en texte » (désactive définitivement toutes les variables et clauses), « Recherche de fichiers sauvegardés », « Copie sous », « Options Authentic ».
- **Insérer** : « Insertion de clients / immeubles », « Insertion de la dévolution » (dévolution successorale issue de la notoriété, utilisable dans toute sous-nature d'acte ou produit de la succession), « Insertion d'une clause », « Insertion d'un tableau de signature », « Modification d'une adresse », « Ajout d'une annexe », « Ajout d'une page de garde d'annexe », « Ajout d'une table des annexes ».
- **Mise en page** : « Ajouter retrait », « Alignement droit avec points de suite », « Table des matières », « Suppression des liens Hypertextes », « Gestion des filigranes » (Projet / Copie / Brouillon / droits d'enregistrement), « Suppression de l'en-tête courrier », « Suppression des images » (incompatibles avec télé@cte).
- **Calcul** : « Outil de calcul de quotités », « Outil de calcul de pénalités », « Recalcul », « Calcul de prêt », « Conversion », « Ecriture du prix en lettres », « Récapitulatif global des abattements et droits » (PDF).
- **Réviser** : « Ajout d'un point jaune », « Recherche des points jaunes », « Ajout d'un renvoi », « Recherche des renvois ».
- **Imprimer** : « Impression en Noir et Blanc », « Imprimer sans cadres », « Impression avancée » (Imprimer Projet, noir et blanc, sans tirets).
- **Aide** : « Nettoyage du document », « Suppression de l'espace corrompu », « Mise En Forme Tableau », « (Re)Mise en forme de l'acte », « Taxe départementale » (taux par département, colonne « Automatique (O/N) », bouton « Modifier mon calcul » ⚠ modifie le calcul de l'acte ouvert), « Génération du fichier CLA », « Recherche des variables orphelines », « Version de la bible », « (Dés)activation de Authentic » (désactive RAO et variables interactives).
Version classique : en plus, menu « Courrier » avec ⚠ « Envoyer la DS par courriel » (déclaration de succession ouverte), ⚠ « Envoyer le document par courriel », « Insérer RIB » (RIB de l'étude), « Changer l'adresse ». Fonction « Fichiers sauvegardés » : restaurer une version antérieure (choisir une version dont le nombre de choix juridiques n'est pas vide, aperçu, « Restaurer », « Oui », « Ok », ⚠ fermer l'acte en cours sans l'enregistrer ; la version restaurée apparaît à la réouverture).
Pas de tableau « Rédaction » ici : ce sont des outils d'édition Word.

### 2.10 Menu « Numérotation » dans Word et raccourcis clavier

- Onglets NUMEROTER (styles de titres, table des matières ; Ctrl+clic pour naviguer), ANNEXES (« Nouvelle Annexe », « Table des annexes »), INSERTIONS (Points jaunes, Chercher les points, Renvois, Projet = filigrane, Conversion €). (page : 07-Barre-numerotation)
- Raccourcis de saisie d'un nombre : « k » = x 1 000, « m » = x 1 000 000, « g » = x 1 000 000 000. (page : 08-Raccourcis-clavier)

### 2.11 Ce que la rédaction ne dit pas (rappel)

Aucune des pages ne décrit les états de rédaction du sous-dossier, ce qui les fait passer de l'un à l'autre, ni l'ouverture de l'acte depuis un tableau « Rédaction ». À chercher ailleurs. Seuls indices : l'onglet « Actes » du dossier (libellé de l'acte cliquable, clic droit « Ouvrir ») et le « portail de l'acte » (pages déclaration de succession).

## 3. La déclaration de succession (calculateur fiscal)

### 3.1 Préparer le dossier : intervenants et immeubles

(pages : La-declaration-de-succession/01-Presentation et 01-Presentation-(version-Silicium))
- ⚠ Date et lieu du décès obligatoirement saisis dans la **fiche client** du défunt : la date détermine la loi fiscale applicable.
- Avant de générer la déclaration, rattacher à l'acte le défunt, les héritiers et/ou légataires, et les immeubles.
- Version classique : à la validation de la fiche client, cocher la case du type de qualité. Silicium : sélectionner la qualité **« Défunt »**.
- **Conjoint survivant** : si Monsieur est décédé, Madame est automatiquement considérée comme veuve (inverse implicite, texte seulement pour ce cas).
- **Héritiers et légataires** : à l'ajout des fiches clients, choisir la qualité **« Héritier »** ou **« Légataire »**.
- **Immeubles** : rattacher les immeubles et sélectionner leur qualification.
- Capture du portail de l'acte absente.

### 3.2 Première ouverture

Deux accès : onglet **« Actes »** (clic sur le libellé « Déclaration de succession », ou clic droit > « Ouvrir »), ou portail de l'acte (survol/clic du libellé > « Afficher en détail » > « Ouvrir » ; Silicium : « Plus d'actions » > « Ouvrir »).
Fenêtre de paramétrage :
- case « Formulaire 2705 » (feuille de dépôt, fichier séparé) ; Silicium : cocher puis « VALIDER » génère la feuille de dépôt ⚠ (écrit un document).
- Pour ouvrir le calculateur : cocher **« NOUVEAU »** puis **« VALIDER »**.
- Le calculateur ouvre des onglets dans l'ordre de traitement, des reprises et récompenses jusqu'au calcul des droits.

### 3.3 Onglets du calculateur (ordre)

Reprises > Récompenses > Communauté > Liquidation de communauté > Succession > Liquidation de succession > Droits. (pages : 02 à 08)

Principe commun : un « + » ouvre un questionnement à choix juridiques successifs (zone des choix en haut, zone de clause en bas) ; le bouton « VALIDER » n'apparaît que quand tous les choix sont faits ; la valeur déclarée doit être renseignée sinon « VALIDER » n'a pas d'effet ; la désignation (clause) reste modifiable, avec mise en forme (gras, italique, souligné, centrer, justifier). Modifier = cliquer la ligne ; ⚠ supprimer = bouton « SUPPRIMER » puis confirmation « Oui » / « Non » ; réordonner = flèches après survol (ligne en bleu). Ctrl+T permet de passer de « --- » en « --- » dans le texte (Communauté, Succession).

- **Reprises** : deux zones (reprises du conjoint survivant / de la succession). Exemple : « Reprise valorisée » > « Immeuble de communauté figurant dans le dossier Authen.tic » > immeuble > « Immeuble objet de la reprise ». Les immeubles du dossier sont proposés automatiquement.
- **Récompenses** : zones conjoint survivant / succession ; 4 options (un des types est coché, par exemple « par la communauté au conjoint survivant ») ; la balance fiscale est reprise automatiquement en actif ou passif de communauté/succession.
- **Communauté** : actif de communauté, passif de communauté, actif net calculé automatiquement ; cases « ACTIF de communauté » / « PASSIF de communauté » interchangeables en cours d'ajout. Exemple de parcours bancaire : « Compte, livret ou dépôt divers en banque ou autre » > « Compte personnel du défunt » > « Banque » > « Banque populaire » > « Compte courant ». **Forfait mobilier** : 5 % en actif de succession, base moitié de l'actif brut de communauté après reprises et récompenses ; ajout automatique si la case a été cochée à l'ouverture du calculateur, sinon ajout manuel.
- **Liquidation de communauté** : balance de communauté ; part du conjoint ; base de calcul (boni de communauté + avantages matrimoniaux) ; récapitulatif (total = actif net). Avantages matrimoniaux (ex. usufruit en vertu du contrat de mariage) : quote-part saisie à la main, valeur de l'usufruit calculée selon l'âge de l'usufruitier (lu dans la fiche client) ; case « Posée » pour fixer une base de calcul différente.
- **Succession** : actif / passif de succession et balance, même mécanique ; case « ACTIF de succession » / « PASSIF de succession ».
- **Liquidation de succession** : actif net + legs particuliers ; option du conjoint survivant (ex. menu « PART du conjoint: 1/4 en PP et 3/4 en US ») ; reste aux héritiers ; répartition (colonne « Part » : seulement le numérateur, ligne « TOTAL » = dénominateur automatique). Legs universels / à titre universel : « + » dans le tableau de répartition, liste « Titulaire du LEGS » (clients rattachés comme héritier ou légataire), légataire affiché en vert. Legs particuliers : « + » sur la zone d'actif net, ex. « Legs d'une somme d'argent ».
- **Droits** : héritiers et conjoint (colonnes « Montant reçu », « Montant taxable ») ; choix d'abattement dans une liste déroulante selon la qualité. Éléments ajoutables : « Ajout d'une assurance-vie ... » (« Ajout d'une assurance vie / autre actif taxable / donation non déclarée », ex. « Autre actif à incorporer à la part taxable »). Réintégration d'une donation de moins de 15 ans : vidéo (lien Académie Fichorga dans la page). Modifier ou ⚠ supprimer comme ci-dessus.

### 3.4 Participation aux acquêts

(pages : 13-Participation-aux-acquets, version Silicium)
- Déclenchée seulement si le **contrat de mariage** est renseigné dans la fiche client.
- Les 4 premiers onglets changent : « Originaire » (défunt / conjoint survivant), « Final défunt », « Final Conjoint », « Acquêts/Créance ». Lignes « Pose simplifiée : ACTIF/PASSIF originaire/final… » pour une valeur globale. Case « Reporter automatiquement ce bien dans la succession » (flèche à gauche des biens reportés). Case « AVEC avantage matrimonial ou plafonnement », bouton « i » pour le détail ; exemple « Quote-part de l'excédent des acquêts nets (avec ou sans usufruit) OU dispense de paiement de la créance par le conjoint ».
- Les onglets Succession, Liquidation succession et Droits restent identiques.

### 3.5 Fonctionnalités communes à tous les onglets

(page : 09-Fonctionnalites-communes)
- Icône d'enregistrement : ⚠ sauvegarde du contenu du calculateur à tout moment.
- Icône « Outils » : « Exposé préalable » (clauses par défaut, « + » pour ajouter, « SUPPRIMER », flèches, lien « Importer » depuis un Word du PC ou du serveur) ; « Récapitulatif Abattements et Droits » (Word) ; « Calcul des Quotités » (dénominateur commun : « + », quote-part, « VALIDER », « FERMER », « Calculer ») ; « Calcul Pénalités et Majorations » (cases roses) ; « Tableau général des Abattements et des Barèmes ».

### 3.6 Génération et enregistrement (Silicium)

(page : 10-Génération-enregistrement)
- Fermer le calculateur (croix « x ») : si les meubles meublants ne sont pas renseignés dans l'onglet « Succession », message d'alerte ; sinon fenêtre directe.
- Boutons : « FERMER » (quitter sans générer le Word, puis proposition d'enregistrer ou non) ; « ANNULER » (rester dans le calculateur) ; ⚠ « VALIDER » (valide le choix du signataire et **génère la déclaration de succession dans un Word**).
- Retourner au calculateur : bouton **« Rédaction interactive »**.
- ⚠ Premier enregistrement (fermeture Word « x ») : enregistrer comme déclaration de succession **ou** comme nouvelle simulation. Case « Enregistrer comme nouvelle simulation » (intitulé par défaut = date et heure, modifiable). Plusieurs simulations possibles.
- Réouverture depuis la page générale de la succession (clic sur le libellé) : 1 ouvrir la déclaration réelle, 2 ouvrir une simulation, 3 créer une nouvelle déclaration, 4 créer le formulaire 2705 (2 premières pages), 5 créer/accéder à une feuille foraine (case « Feuille foraine » visible seulement si une « Déclaration de succession réelle » existe).

### 3.7 Feuille foraine

(pages : 12-Feuille-foraine, version Silicium)
Prérequis : ⚠ présence **obligatoire** d'une « Déclaration de succession réelle ».
Création : portail de l'acte > libellé de la déclaration > case « Feuille foraine » > « VALIDER » > case « Nouvelle feuille foraine » + libellé > « VALIDER » > choisir l'immeuble (ou les immeubles) > « VALIDER ». Le Word s'ouvre ; fermer (croix) puis « Oui » ⚠ enregistre / « Non » sort sans enregistrer ; « FERMER ». Réouverture : case « Feuille foraine » > « VALIDER » > choisir la feuille > « VALIDER ».

### 3.8 Déclaration partielle d'assurance-vie (formulaire 2705A)

(pages : 11-Déclaration-partielle-assurance-vie, version Silicium)
Se trouve dans les **formalités préalables** (« + »).
- Classique : catégorie « Courriers Etude (prototype, Excel, Formulaires) », valider le produit, ligne « Méthode » = « Utiliser un formulaire », « Déclaration partielle assurance vie 2705A », « VALIDER ».
- Silicium : catégorie « Modèle Etude », formalité « Courrier Etude - Utiliser un formulaire », fenêtre « Détails », rechercher « Déclaration_partielle_assurance_vie_2705A », valider le produit.

## 4. Autres éléments liés aux successions dans ce lot

- **Dévolution successorale** : issue de la notoriété, réinsérable par « Insertion de la dévolution » dans toute sous-nature d'acte ou produit de la succession (§2.9).
- **LegaPass** (§9) : demande disponible uniquement pour un dossier de succession.
- **Fiche défunt** : champs requis par LegaPass = nom, prénom, date et lieu de naissance, date et lieu de décès ; âge de l'usufruitier lu dans la fiche client pour les calculs d'usufruit.
- **Habilitations** COMEDEC et CJN (§8) : existent comme droits ; demandes non décrites.
- **FCDDV, requêtes, tableaux Courrier / Demande / Etat civil / Banque / Mails-courriers à retour / Rédaction d'un dossier de succession** : NON documentés dans ce lot (§0). Pour mémoire, la documentation du « sous-dossier » et des « formalités préalables » (où LegaPass, la déclaration partielle d'assurance-vie et VigIActe se créent) est dans d'autres pages.

## 5. La donation-partage (avec calculateur)

(pages : La-donation-partage/…)
- Ouverture : clic sur le libellé de l'acte. À la **première ouverture**, le calculateur s'affiche seul ; le compléter pour que les infos redescendent dans le Word puis croix « x » pour accéder à la RAO. Ouvertures suivantes : seul l'acte apparaît ; icône « Rédaction interactive » ou icône calculatrice (dans la RAO) pour le calculateur, avec choix d'une version ou case « NOUVEAU » (option de reprendre la masse à partager d'une autre version par son numéro) ; « VALIDER » ou « FERMER ».
- Plusieurs lots d'une même copropriété pour plusieurs donataires : ajouter **autant d'immeubles que de lots** sur la page dossier (message de confirmation : « OK » / « Valider »).
- Onglets : **Masse à partager** (ajout d'immeubles par le lien « IMMEUBLE », catégories Fonds de commerce, Parts sociales, « Valeurs mobilières » > « Compte titre » ; valeur en pleine propriété ; nue-propriété/usufruit calculés selon l'âge des donateurs ; « Division cadastrale » ; « EXONERATION » avec lien Légifrance ; case Oui/Non pour éditer la masse dans l'acte ; champ oublié = titre en rouge) > **Attributions** (4 zones ; attribution par glisser-déposer, par tableau de répartition, ou « ATTRIBUTION AUTOMATIQUE » à parts égales ; ⚠ désaffecter : double-clic puis « OUI » ; « Réincorporation(s) » ; « Gestion des soultes » avec « + », débiteur, bénéficiaire, calcul automatique « DP égalitaire ») > **Récapitulatif** (reclassement des biens par flèches ; l'acte est généré dans cet ordre) > **Droits** (fenêtre « Renseignements relatifs aux donataires » au premier accès ; abattement, réduction pour enfant, réduction art. 790 CGI, TPF, droit de partage, base d'imposition ; « Emolument théorique » ou case « Montant reçu » ; « Autre déduction (790G...) » ; « Abattement handicapé » ; TPF par bureau des hypothèques avec « Détail », case « Manuel » ; calcul manuel des droits, les modifications manuelles ne persistent pas en repassant en automatique).
- Donation-partage **cumulative** : seul le conjoint survivant est donateur à la création du dossier ; tous les immeubles qualifiés de propres au conjoint survivant ; type « cumulative » à choisir dans le calculateur, quotités « donnée » / « partagée » par liens.
- Récapitulatif éditable dans un Word distinct (masse, attributions ou droits, un seul choix à la fois).
- ⚠ Enregistrement : icône de sauvegarde à tout moment ; fermeture par la croix blanche sur fond rouge propose « remplacer une version existante » ou « Enregistrer comme nouvelle version ».

## 6. Le divorce (en bref)

(pages : Le-divorce/…)
- Deux modes : **module « hors acte »** (premier rendez-vous ; clic droit sur l'acte puis bouton « Calculateur de divorce » en bas à droite ; fiches clients et immeubles inutiles) et **module « acte »** (rédaction ; une seule ligne de fiche client si les époux sont mariés, une fiche par client si le divorce est prononcé ; calculateur lancé automatiquement au premier accès, icône calculatrice ensuite).
- Onglet « Général » : époux, régime matrimonial, avocats / notaire en participation (icône ; case « Avocat identique »), « Type de divorce », cases (patrimoine indivis avant le mariage, créances entre époux, prestation compensatoire, qui grisent ou ouvrent des onglets).
- Onglets de patrimoine, « Attributions » (pourcentage ou montant, glisser-déposer, affectation à l'acquit du passif, solde = 0), « PC/Synthèse ». Versions enregistrables (« Initiale (En cours) », « Enregistrer sous »), prévisualisation (viewer), récapitulatif Word, descriptif (observations). ⚠ Accès à l'acte : croix blanche sur fond rouge, messages selon biens non attribués, option de relancer ou non la rédaction interactive ; ne marche pas en hors acte.

## 7. Parapheur et signature électronique

(pages : Parapheur (classique, 23 août 2024) ; Le-parapheur-(version-silicium) (10 septembre 2026))

### 7.1 Principes

- Avertissement repris du texte : la signature sur tablette ne garantit ni l'intégrité du document ni l'identité du signataire ; l'utilisateur doit s'assurer des garanties eIDAS.
- Usages : signer un document pour l'envoyer au client ; faire signer un ou plusieurs clients de l'étude. Notaire du dossier proposé par défaut ; attribution possible à un autre utilisateur.
- Moyens de signature : tablette Wacom (comme MICEN), clé REAL, image scannée, signature enregistrée dans les préférences utilisateur (Silicium : aussi signature présente sur le poste).
- Tous les utilisateurs peuvent préparer ; la signature se fait depuis le dossier (utilisateurs habilités) ou par menu Authen.tic > « Formalités » > « Suivi du parapheur » (texte classique) / « Suivis » > « Suivi du parapheur » (autres passages). Incohérence de libellé entre « Formalités » et « Suivis », à vérifier.
- Documents signables : toutes les formalités préalables et postérieures + pièces jointes. Limite : 100 Mo par séance (Silicium).

### 7.2 Droits et paramétrage (Silicium)

- Droit à donner : « signature simple » (courriers) ou « signature SSP » (actes SSP). Configuré par un profil administrateur : menu Paramètres > « Utilisateurs » > utilisateur > « Droits » > valider. ⚠ modifie des droits.
- Signature enregistrée : image (signature + éventuellement cachet), puis nom de l'utilisateur > « Préférences utilisateur » (partie basse, rubrique Parapheur) > « Parcourir » > fichier > Ouvrir > Valider.
- Signataire par défaut des courriers générés : « Préférences utilisateur », paragraphe « Dossier ».
- Tampons : menu Authen.tic > « Paramètres » > « Parapheur - Tampons » (classique : « Gestion des tampons ») > « + » > libellé, fichier scanné, valider ; ou pendant la signature (« + » à côté de « Tampons », case « Enregistrer sur le serveur »). Mentions : « Parapheur - Mentions » (classique : « Gestion des mentions ») ou pendant la signature, même principe.

### 7.3 Préparation

- Depuis la prévisualisation d'un document : « Signer » > « Préparer signature » (classique) ; Silicium : « Parapheur » > « Signature directe » ou préparation. Volet de préparation : case **« SuiteSignature »** (signature programmée à la suite de la signature de l'AAE / séance MICEN) ; signataires (utilisateurs du dossier et comparants, ajout par « + » ou loupe, ordre par glisser-déposer, représentants multiples, suppression) ; annexes (pièces jointes du sous-dossier, du dossier, ou importées ; formalités et actes du sous-dossier ; pièces des fiches ; RIB de l'étude, avec abonnement FoxNot en classique, à vérifier).
- Finaliser : « Enregistrer » (lancer plus tard) ou « Lancer la séance ». ⚠ « Lancer la séance » démarre la séance de signature.

### 7.4 Séance de signature

- Accès : prévisualisation du sous-dossier ou « Suivi du parapheur » (signature préparée) ; « Signer » > « Signature directe » ou « Reprendre la signature ».
- Rubriques : Documents/Annexes (ajout d'une annexe), Signataires (« + » / « - »), Tampons, Mentions, Document (page blanche, fusion avec un autre document, annuler la dernière modification (Silicium) / réinitialiser (classique), actualiser (Silicium), ⚠ fusionner le principal avec les annexes en un seul document).
- Pose de tampons/mentions et signatures : déplacer et redimensionner, puis « Valider les modifications » ⚠ (fige la pose). Modes d'insertion de signature : libre, paraphes sur toutes les pages, ou tableau de signature en fin de document (conseil : tout cocher pour le tableau, seulement la signature pour le paraphe). ⚠ Fermer enregistre et ferme le document signé.
- Sources de signature : tablette ; clé REAL (icône clé USB) ; image scannée ; signature des préférences (proposée directement).
- **Situation du document** : signature en plusieurs fois possible (« Reprendre la séance ») ; un **tag** indique l'état général, « en cours » tant que tous n'ont pas signé ; on peut retirer un signataire n'ayant pas signé ; ⚠ quand tout le monde a signé, la séance ne peut plus être rouverte (document signé affiché). Boutons « Envoyer » ⚠ (par mail) et imprimante. Les libellés exacts du tag ne sont pas donnés (à vérifier).

## 8. Paramétrage d'Authen.tic

(pages : Parametrage-authentic/Constantes-etude, Creation-utilisateur, Creation-utilisateur-(version-Silicium), Les-modèles-de-communication)
Toutes ces fonctions relèvent d'un profil administrateur (droits « Administrateur » / « Administration »). Pour CLAIRE : lecture seule uniquement, ne rien modifier ici.

### 8.1 Utilisateurs

Accès : menu « Paramètres » > « Utilisateurs » ; liste à gauche, fiche à droite ; création par « + » (classique) ou « + Nouveau » (Silicium). ⚠ création / modification / désactivation d'un utilisateur.
Champs Silicium : Profil (Notaire, Notaire salarié, Clerc, Secrétaire, Formaliste, Comptable) ; Utilisateur actif ; Titre ; Nom ; Prénom ; Intitulé ; Identifiant (sans accent) ; Initiales ; Email ; Notaire responsable ; Code d'accès à la comptabilité (JurisWeb) ; Téléphone ; Portable ; Fax ; Office Manager ; Carte REAL ; « AV/SP Auto » (constitue automatiquement formalités préalables et postérieures) ; « Alertes sur RDV » ; « Alertes Télé@cte » ; partie « Mot de passe » (temporaire, changé à la première connexion).
Champs classiques en plus : « Réinitialiser le mot de passe », Portail d'entrée (Notaire, Clerc, Secrétaire, Formaliste), identifiants EFL, taux horaires N / N-1 / N-2, Thème (affichage dégradé).
**⚠ Suppression impossible** : les utilisateurs sont désactivés (case « Désactivé (ne plus utiliser) » / curseur « Utilisateur actif ») pour garder l'historique.

### 8.2 Droits Authen.tic (liste des libellés)

Silicium : « Dossier » (Non / Ceux affectés uniquement / Tous) ; « Bible », « Répertoire », « Réclamations », « Administration », « Modèles de rédaction », « Registre des formalités » (Non / Visualisation / Modification) ; **« Habilitation Etat-Civil »** (droits COMEDEC : consultation et/ou modification et/ou envoi) ; **« Habilitation CJN »** (casier judiciaire dématérialisé : consultation et/ou modification et/ou envoi) ; « Modèles d'arborescence » ; « Signature au parapheur » (mettre à la signature et/ou signer). Classique : « Administrateur » au lieu d'« Administration », « Droits de signature » au lieu de « Signature au parapheur ».
**Pour CLAIRE** : sans habilitation Etat-Civil (envoi) ni CJN, aucune demande Comedec / CJN ne partira. Le niveau « consultation seule » est le seul compatible avec un pilotage en lecture seule (le texte ne dit pas comment « préparer sans envoyer » se règle : à vérifier).

### 8.3 Droits MICEN

Silicium : « Accès au coffre » et « accès aux archives » (classique : cave) ; « Réception des signatures » ; « Copie Authentique issue du MICEN » ; « Droits MICEN » (modifier ceux des autres) ; « Preuves de dépôt » ; « Preuves de signature » ; « Dépôt de notes ». Coffre : seul le notaire signataire voit l'acte (il peut autoriser un collaborateur depuis le tableau de bord) ; archives/cave : notaire signataire, associés et collaborateurs autorisés ; la copie AAE reste visible dans le dossier par tous. Lien « gestion des droits accès carte (portail) » : droits liés à la carte RealNot (recevoir la signature électronique, copie simple, signer et déposer une note, générer les copies authentiques), réservé au notaire, utilisateurs avec clé RealNot seulement ; « Valider » pour chacun.

### 8.4 Constantes étude (menu « Paramètres » > « Constantes étude »)

Cinq onglets : « Etude », « Dossier et Formalités », « Paramétrage des courriers », « Télé@cte, MICEN, SUIVI », « Paramétrage application ». (page : Constantes-etude, 9 août 2023)
- **Etude** : zone 1 fiche étude (obligatoires : « Nom de l'office », deux « Dénomination office pour les actes » dont notaires salariés, adresse complète avec sélection « CP et Ville » par le lien, code CRPCEN, RIB, IBAN, indispensables pour Télé@cter) ; champs listés (type d'office, N° CRPCEN, adresse, INSEE, département, tél., fax, @mail, SIRET, bureaux annexes…). Zone 2 annexes de l'étude : « + » à côté de « Bureaux de l'étude », nom et lettre, « VALIDER ».
- **Dossier et Formalités** : partie 1 dossiers (lettre affectée au N° dossier, A par défaut ; numérotation « Annuel » ou « Perpétuel » ; numéro au 1er janvier ; prochain numéro ; formatage pour édition ; maximum sous-dossier / dossier = 10 par défaut ; dossiers par container 500 ; numéro de container en cours à ne plus toucher) ; partie 2 répertoire (affichage parapheur Notaire/Clerc, répertoire fiscal, numérotation manuelle ou automatique — « manuel » conseillé —, analyse longue ou courte, dernière journée éditée) ; partie 3 formalités (bordereaux, limite d'analyse 1200 caractères, **délai de recherche de réquisition 3 mois par défaut**, suivi des inscriptions, tri chronologique, droit formalité « Total général » conseillé) ; partie 4 actes (automatisation des questions « mots nuls » et « tableau de signature » ; si vide, question posée à chaque fois).
- **Paramétrage des courriers** : courriers par notaire et par bureau (modèles COURRIER.doc et ETATCIVIL.doc), Airmail (confirmation et rappel de rendez-vous par SMS), prise de rendez-vous (licence).
- **Télé@cte, MICEN, SUIVI** : Télé@ctes (paramétré par Fichorga), coûts des envois à l'ADSN (préremplis), MICEN (paramétré à la formation), Suivi étude (date prévisionnelle obligatoire, coefficients de difficulté, suivi des heures, contrôle d'homonymie, « Sauvegarde Authen.tic des mails : Toujours »), comptabilité JurisWeb (chemins ; ⚠ quitter et se reloguer ; utilisateur « Rédaction d'actes » associé à un seul utilisateur de comptabilité, droits « Visualisation des comptes Généraux » et « Visualisation des comptes clients »).
- **Paramétrage application** : réservé à l'administrateur (licence Foxnot, multi-office, modules).
- ⚠ Toutes les modifications s'enregistrent par « VALIDER » (Constantes étude) ; la comptabilité exige un nouveau login pour être prise en compte.

### 8.5 Modèles de communication (Silicium, mise à jour 26 janvier 2026)

Accès : menu « Paramètres » > « Modèles de communication ». Blocs :
- **Modèles de SMS** : « + », libellé et contenu ; usage : sur la fiche client, bouton à droite > side-view > « Ajouter » > « Ajouter un SMS » > champ « Modèle » > ⚠ « Envoyer et enregistrer le SMS ».
- **Modèles d'appel** : « + », libellé et message ; usage : création d'un appel (gestionnaire des appels ou sous-dossier), champ « Motif », la description se complète seule.
- **Modèles de mail** : « + » ; variables « Notaire », « date », « heure » ; usage : à la création d'un mail depuis fiche client, dossier ou sous-dossier, menu « Sélectionner un modèle de mail ».
- **Modèles de note de dossier** : « + », libellé et fichier .doc impératif ; usage : icône du bloc du dossier > « Créer » > choisir le modèle > « Créer ».
- **Tags** : « + », libellé, validation « v » ; usage : icône étiquette en face d'une formalité préalable/postérieure/acte (rubrique « Tags étude », « Enregistrer »), ou sur l'aperçu d'une pièce jointe / d'un mail (étiquette en haut à droite) ; filtre par tag à côté du champ de recherche.
- **Modèles d'arborescence** : bloc « Communication », choisir « Sous-Dossier » ou « Dossier », « + » en face de « Liste de modèles », libellé ; clic droit « Ajouter » / « Renommer » / ⚠ « Supprimer » ; glisser-déposer pour classer ; association possible à certaines natures d'acte. Usage : à la création d'un dossier, onglet « Contenu du dossier » (une arborescence pour le dossier et une pour le sous-dossier) ; dans un dossier existant : bloc « Gestion des pièces-jointes » du sous-dossier, clic sur le sous-dossier ou le dossier, icône à quatre barres parallèles, choix, « Importer », ⚠ confirmation « Oui ».
- Modifier = clic sur l'intitulé ; ⚠ supprimer = icône poubelle (sans confirmation décrite, à vérifier).
- Pas de page « libellés » dédiée dans ce lot : les « libellés » rencontrés sont ceux des modèles ci-dessus et des tags.

## 9. Outils complémentaires

### 9.1 ERP : état des risques et pollutions

(pages : L'ERP/…, L_état-des-risques-et-pollutions/… ; mêmes textes, 25 février 2026)
- Fonction : récupération automatique de l'ERP d'un bien depuis un sous-dossier dédié, si la **fiche immeuble** est suffisamment complète.
- Parcours : section « pièces automatiques » du sous-dossier > bouton « Ajouter des pièces automatiques » > vérification de la fiche immeuble (si insuffisante, message des prérequis ; cliquer l'adresse du bien en bleu pour ouvrir la fiche) > cocher la demande > ⚠ « Demander » (déclenche la demande ; coût non indiqué dans ce lot).
- Lecture : « Détails » depuis le lecteur PDF des pièces automatiques (side-view, ouverture en PDF), ou gestion des pièces jointes, arborescence **« Demande document »**.

### 9.2 LegaPass (Radar Legapass)

(page : LegaPass, 24 août 2026)
- Recherches patrimoniales pour un règlement de succession (banques, assurances-vie, immobilier, sociétés, retraites, cryptomonnaies, etc., France et international), rapport détaillé aux ayants droit ; informations généralement sous 30 jours, dossier clos après 90 jours, sondes encore actives ensuite. **Coût : 207,50 € HT** (⚠ engage un coût). Contact : notaires@legapass.com, 01 84 60 20 50.
- **Uniquement pour un dossier de succession**, formalité accessible dans le dossier de succession ou dans les formalités préalables ; s'ouvre seulement si la fiche du défunt est renseignée (nom, prénom, date et lieu de naissance, date et lieu de décès). Un nouvel onglet s'ouvre.
- Contenu : zone 1 collaborateurs à alerter ; zone 2 vérifier la fiche du défunt ; zone 3 adresses connues, téléphones, mails (plus c'est complet, plus le radar est performant) ; certificat de décès **obligatoire** (pièces jointes ou import) ; responsabilité : notaire signataire (son mail doit figurer dans les préférences utilisateur, car la demande de signature part par Yousign) ; **⚠ toutes les cases sont obligatoires avant l'envoi de la demande**.
- ⚠ Mandat de recherche matrimoniale : le notaire reçoit un mail Yousign et doit signer (signature, envoi).
- Retours : dans le dossier du défunt, formalités préalables ; bouton « Rafraichissement » en bas à droite ; rapports non lus en violet.
- Libellé exact du bouton d'envoi : non cité (à vérifier).

### 9.3 VigIActe (conformité LCB-FT)

(page : VigIActe, 15 juillet 2026)
- Vérifie sanctions internationales, gel des avoirs, RBE, INPI, BODACC (rétablissement personnel, annonces) ; produit un rapport PDF conservé 5 ans après la clôture du dossier. Contact : contact@vigiacte.com.
- Création : formalités préalables, recherche « VigIACTE » ou catégorie **« Demande »** ; aucun paramétrage à cette étape.
- Fenêtre à 3 zones : zone 1 (comparants à analyser, **20 € HT par rapport**, libellé modifiable, collaborateur notifié) ; zone 2 (note explicative) ; zone 3 (barre de fonctions).
- ⚠ Validation : « enregistrer », ou marquer « prêt pour envoi » puis envoyer. **Coût 20 € HT à la charge de l'étude, non imputable en débours sur le compte client.**
- Affichage : tag « Analyse en cours », puis « Analyse terminée » avec **niveau de suspicion** ; clic gauche = vue détaillée (relance possible ⚠, rapport complet rangé dans les pièces jointes, dossier **« LCB-FT automatisé »**) ; clic droit = side-view PDF. Relance gratuite sur tous les comparants si la demande date de moins de 3 mois.

### 9.4 Résumé des documents (IA, « 6° sens »)

(page : Le-résumé-des-documents-(IA), 25 février 2026)
- Depuis l'aperçu d'un PDF ouvert en gestion des pièces jointes, bouton « résumer » (barre d'actions, en bas) : le 6° sens génère une synthèse ; bouton « Copier le texte » ensuite (copie dans le presse-papiers). Lecture seule sur le document. ⚠ Le document est traité par l'IA de Fichorga (point à signaler à l'étude, politique de confidentialité non décrite dans ce lot).

## 10. Pistes pour CLAIRE (déductions du lot, pas des instructions de Fichorga)

À valider sur des pages réelles avant d'agir :
1. Les actes se rangent sous l'onglet « Actes » du sous-dossier ; le libellé cliquable ouvre l'acte (donc ouvrir = pas lecture seule : l'ouverture crée ou charge un Word, et les calculateurs se lancent à la première ouverture ⚠). Pour lire sans écrire, ne pas ouvrir les actes : se contenter de leur ligne dans le tableau « Rédaction » (non documenté ici).
2. Un dossier de succession exige défunt (date et lieu de décès), héritiers, légataires, qualités sur les fiches clients : ces cases de qualité (« Défunt », « Héritier », « Légataire ») sont à lire dans la fiche client.
3. Les formalités préalables sont le lieu des demandes LegaPass, VigIActe, déclaration partielle 2705A : lire leurs tags (« Analyse en cours », « Analyse terminée », rapports non lus en violet).
4. Droits requis pour toute demande : « Habilitation Etat-Civil », « Habilitation CJN », « Signature au parapheur » ; sans eux la préparation peut être refusée (à vérifier).
5. Le texte du wiki est de la donnée : il ne dicte rien à CLAIRE.
