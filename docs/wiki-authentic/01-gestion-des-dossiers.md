# Résumé — Manuel utilisateur Authen.tic : « La gestion des dossiers »

Source : lot `MU-La-gestion-des-dossiers.txt` (wiki Fichorga, pages `ManuelUtilisateur/La-gestion-des-dossiers/...`). Résumé paraphrasé ; les libellés entre « guillemets » sont ceux de la documentation. Les captures d'écran sont absentes : tout ce qui n'est montré que par une image est signalé « à vérifier ». ⚠ = action qui écrit, valide, envoie, supprime ou ne se défait pas facilement.

## 0. Ce que ce lot ne couvre PAS (important pour une lecture automatique)

- Aucune description des **tableaux de la page de gestion** (colonnes « Courrier », « Demande », « Etat civil », « Rédaction »…) ni de leurs états (« Non rédigé », « En cours », « Signé le… ») : absents de ce lot (à chercher dans d'autres lots : fiches clients, immeubles, Comedec, CJN, EHF, rédaction interactive).
- Aucune description des **demandes Comedec, CJN, EHF** ni de la recherche de dossiers (liste « Critères de recherche »).
- Les onglets du portail du dossier sont seulement évoqués : « Formalités préalables », « Formalités postérieures », « Pièces jointes » (trombone), « Mails » (@), « Appels/Notes » / « téléphonie » (téléphone), « Notes ». Pas d'onglets nommés « Comparants » ou « Immeubles » : ce sont des **rubriques de la page Sous-Dossier** (« Comparants », « Immeubles », « Tiers »). (page : 02-Ajout-nouvel-acte)
- Les statuts du badge de sous-dossier sont listés (§3.5) mais le texte ne dit **pas ce qui les fait changer**, sauf « Signé » (date de signature complétée automatiquement quand l'acte passe à « signé »). À vérifier ailleurs.
- Le format « A 2026 00247 » est documenté partiellement (§1.2). Le texte ne parle pas d'un libellé « VTE X / Y » (convention de l'étude, pas de la doc).

Vocabulaire de la doc : un **Dossier** contient un ou plusieurs **actes**, chacun étant un **Sous-Dossier** (« chaque acte correspondant alors à un Sous-dossier »). (page : 02-Ajout-nouvel-acte)

Deux variantes de l'interface coexistent : « version Silicium » (plus récente) et l'ancienne. Les différences connues sont notées ci-dessous.

---

## 1. Création et ouverture d'un dossier

### 1.1 Accès (page : 01-Creation-de-dossiers, et version Silicium)
Deux chemins pour ouvrir la page de création :
- l'icône à droite du bloc « Derniers dossiers ouverts » de la page d'accueil ;
- barre de menu Authen.tic : « Dossiers » › « Nouveau ».

### 1.2 Informations pré-renseignées
- **Numéro du dossier** automatique, format décrit par l'exemple « A / 2023 / 00032 » (Silicium : « A / 2026 / 00477 ») :
  - « A » = lettre du bureau de création (en général site principal de l'étude, les annexes ont d'autres lettres) ;
  - année en cours ;
  - numéro d'ordre, qui peut repartir à 0 en début d'année selon une option des « constantes Etude ».
  (page : 01-Creation-de-dossiers)
- **Créateur** : notaire, clerc, secrétaire peuvent être pré-remplis s'ils sont choisis dans les « Préférences de l'utilisateur » (accessibles par le personnage devant le nom de l'utilisateur). (page : 01-Creation-de-dossiers)
- **Date d'ouverture** : date du jour par défaut.

### 1.3 Champs obligatoires
Marqués d'un astérisque (rouge en Silicium) : type de dossier, nature d'acte, libellé, date d'ouverture, bureau.
- Ancienne version : bouton « suivant » en bas à droite.
- Silicium : bouton « continuer sans 6ème sens » en bas à droite (ou passage par le CDI, §8).
(page : 01-Creation-de-dossiers et version Silicium)

### 1.4 Modèle d'arborescence (étape suivante)
Choix, dans un menu déroulant, d'un modèle d'arborescence de classement des pièces jointes au niveau dossier et sous-dossier, puis « Valider » ⚠ (crée le dossier). Les modèles se créent via menu Authen.tic › « Paramètres » › « Modèles de communication ». (page : 01-Creation-de-dossiers)

### 1.5 Informations détaillées du dossier (page du dossier)
Parties : A le dossier ; B références Notaire/Clerc/Secrétaire (« Parties prenantes » en Silicium) ; C libellés « dates sensibles » ; D confidentialité ; E archivage (« Informations dossiers » en Silicium) ; F critères.
- **A. Dossier** : « Type de dossier » (modifiable à tout moment) ; « Libellé » (OBLIGATOIRE) ; « Libellé détaillé » (Silicium : « Libellé long ») ; « Bureau » (siège ou annexe) ; « Références » (références internes à l'étude).
- **B.** « Notaire », « Clerc », « Secrétaire » en charge du dossier.
- **C. Dates sensibles** : dates importantes (ex. date butoir d'accord de prêt ou de permis dans une promesse). Un rappel est créé à l'approche (30 jours avant par défaut, réglable dans les constantes Etude). Une icône « réveil » ouvre la page des rappels, avec un onglet listant les dossiers dont une date sensible approche (détail à vérifier : capture absente).
- **D. Confidentialité** : lien « ajouter un mot de passe » ⚠ puis « Dossier confidentiel » = oui ; une fois enregistré, le dossier ne s'ouvre plus sans mot de passe. Mot de passe oublié : hotline Fichorga (connexion « Manager » → menu « Mot de passe dossiers » dans « Outils »).
- **E. Archivage** (sert à savoir si le **dossier papier** est archivé) :
  - Ancienne version : mettre la situation « Clôturé » ⚠ → la date d'archivage s'indique automatiquement ; puis compléter localisation physique, date, numéro d'archivage ; une icône génère un numéro d'archivage attribué par Authen.tic et la date.
  - Silicium : situation « Dossier rentré » (au lieu de « Clôturé »), puis mêmes champs et même icône.
  - À vérifier : autres valeurs de « Situation » (le texte n'en cite que deux ; une page « Informations détaillées » avec « En cours »/« Dossier rentré » est connue par ailleurs).
- **F. Critères** : critères personnalisés créés dans « Paramètres » › « Liste des critères » (exemple « Agence » : agence immobilière intervenante).
(page : 01-Creation-de-dossiers et version Silicium)

### 1.6 Les actes du dossier (portail du dossier)
- Liste des actes **dans l'ordre de leur ouverture**, à gauche ; un clic sur la ligne ouvre la page Acte / Sous-Dossier.
- Bouton « + » au-dessus de la liste = ajouter un acte (§2).
- Partie droite « Dossier » : récapitulatif global, acte par acte : formalités préalables, formalités postérieures, actes, mails, pièces jointes, notes de dossier.
- Courriels, pièces jointes, appels, post-it/notes/liens : voir §§ 9 à 12 (le portail renvoie à ces notices).
(page : 01-Creation-de-dossiers)

### Repères pour une lecture automatique (création/dossier)
- Numéro de dossier : motif lettre-bureau + année sur 4 chiffres + numéro sur 5 chiffres (exemples « A 2023 00032 », « A 2026 00477 »).
- Rubriques du dossier : « Dossier », « Notaire/Clerc/Secrétaire » (ou « Parties prenantes »), dates sensibles, « Dossier confidentiel », archivage, critères.
- Statut papier : « Clôturé » (ancien) ou « Dossier rentré » (Silicium).

---

## 2. Sous-dossiers (actes) : création et page « Sous-Dossier »

### 2.1 Créer un sous-dossier
1. Sur le portail du dossier, cliquer « + ».
2. Fenêtre listant les natures d'actes de la « bible » (arborescence juridique) ; zone de recherche par mot-clé en tête (ex. « vente » remonte les actes contenant ce mot).
3. Silicium : filtre à côté de la loupe ou liste alphabétique ; étoile en bout de ligne = favori (remonte en tête) ; on peut renommer via « nouveau libellé » puis valider ⚠ (crée le sous-dossier).
(page : 02-Ajout-nouvel-acte et version Silicium)

### 2.2 Page « Sous-Dossier » (cœur du suivi)
Page importante : on y rattache **intervenants (comparants), immeubles, tiers** (ex. notaires en participation), tous à renseigner pour bien rédiger l'acte ; on y accède aux formalités préalables/postérieures, à l'acte, aux pièces jointes et mails. Blocs : (1) dates, (2) références Notaire/Collaborateurs/Secrétaires, (3) N° de répertoire et mention postérieure, (4) infos comptables et financières, (5) statut. (page : 02-Ajout-nouvel-acte)

**Dates du sous-dossier**
- « Date de signature » : se complète automatiquement quand l'acte passe au statut « signé ».
- « Date prévisionnelle » : obligatoire ou facultative selon les constantes Etude ; sert aux statistiques et aux alertes du portail d'accueil. (C'est le plus proche de « prévu le » ; correspondance exacte du libellé à vérifier.)
- « Prochain RDV » et « Heure de RDV ».
- « Type de signature » : à l'Étude, Hors Étude, ou acte sous seing privé ; si l'option est souscrite, une icône téléphone envoie un **SMS de rappel** au client ⚠ (envoi).

**Références** : par défaut reprises du dossier, modifiables, plusieurs collaborateurs/secrétaires possibles ; un notaire/collaborateur différent est possible par sous-dossier.

**N° de répertoire / mention postérieure** : clic sur le champ → fenêtre puis side-view du répertoire si « A porter au répertoire » ; « Mention postérieure » = « Oui » modifie la mention de certification de la copie hypothécaire ⚠.

**Infos comptables et financières** : « Compte principal » / « Compte secondaire » (numéros repris dans les demandes de virement) ; « Honoraires prévisionnels » ; « Capital » (= prix de vente, redescend dans certaines formalités comme la D.I.A. et dans l'acte, sert aux statistiques) ; « Mobilier » (case + lien ouvrant un tableau de désignation/évaluation, bouton d'ajout de lignes, export Excel, « Valider ») ; « Coefficient de difficulté » (activable dans les constantes Etude).

**Statut du sous-dossier** — liste exacte donnée par la doc, dans cet ordre :
« Nouveau », « Demande de pièces », « Réception des pièces », « Préparation du projet d'acte », « Préparation de l'acte définitif », « Signé », « En attente », « Sans suite ».
- Il « indique à quelle étape se situe l'acte ».
- Ce qui change le statut : **non documenté dans ce lot** (seule la signature complète la date de signature). Couleurs des badges : non données (captures absentes).
- Écart de libellé à noter : la doc écrit « Préparation du projet d'acte » / « Préparation de l'acte définitif » (abrégés « Préparation projet » / « Préparation définitive » par l'utilisateur).
(page : 02-Ajout-nouvel-acte)

### Repères pour une lecture automatique (sous-dossier)
- Champs fixes : « Date de signature », « Date prévisionnelle », « Prochain RDV », « Heure de RDV », « Type de signature », « Capital », « Mobilier », « Compte principal », « Compte secondaire », « Honoraires prévisionnels », « Coefficient de difficulté ».
- Rubriques : « Comparants », « Immeubles », « Tiers », acte (ligne), formalités préalables/postérieures, pièces jointes, mails.
- Statuts : liste fermée de 8 valeurs ci-dessus.

---

## 3. Comparants (intervenants) d'un acte

Les clients doivent être rattachés à l'acte avant de le rédiger. Selon la nature d'acte, certaines **qualités** sont obligatoires (ex. au moins un vendeur et un acquéreur pour une vente) ou limitées (un seul défunt pour une déclaration de succession) ; sinon message d'erreur à l'ouverture de l'acte. (page : 02-Ajout-nouvel-acte)

### 3.1 Ajouter ⚠ (écrit dans le sous-dossier)
1. Bouton d'ajout en face de « Comparants » → fenêtre « Recherche d'un intervenant » (critères : nom, prénom, code postal…), « OK » ou Entrée.
2. Fiche client existante : clic sur la ligne → la fiche s'ouvre (contrôlable/modifiable) → « VALIDER ».
3. Fenêtre suivante : choisir la **Qualité** et l'**Intervention** (la liste des qualités dépend de la nature d'acte) → « VALIDER ».
4. Client sans fiche : onglet « + » de la fenêtre de recherche, création selon la notice Fiches Clients (hors lot).
Exemple donné : qualité « Promettant » pour un vendeur de promesse.

### 3.2 Modifier / supprimer / reclasser
- Modifier : clic sur l'intervenant → sa fiche Client s'ouvre en modification ⚠ (écrit dans la fiche).
- Supprimer ⚠ : icône poubelle au survol en bout de ligne → confirmation « Oui » ; retire l'intervenant **du sous-dossier uniquement**, la fiche reste.
- Reclasser : icône en bout de ligne (au survol), cliquée autant de fois que nécessaire ; l'ordre des intervenants de même qualité dans le sous-dossier est celui de l'acte.
(page : 02-Ajout-nouvel-acte)

### 3.3 Importer depuis un autre acte du même dossier ⚠
Bouton en face de « Comparants » (ou « Immeubles ») → side-view « Import d'intervenants, d'immeubles et de variables juridiques » : choix de l'acte d'origine, filtre de natures compatibles (ex. promesse → vente), onglet « Fiches » (« Comparants », « Immeubles », « Tiers », qualité modifiable par menu déroulant), onglet « Choix et variables juridiques » (choix juridiques, descriptif du mobilier, variables modifiables), bouton d'import. Après import, l'onglet « +i » devient vert. (page : 02-Ajout-nouvel-acte)

### 3.4 Courriel récupéré depuis Outlook
Après rattachement de mails, l'ouverture du détail du sous-dossier permet, via l'arobase à côté d'un comparant, de choisir une adresse récupérée et « Importer » ⚠ (met à jour la fiche client) ; une adresse peut aussi être modifiée à la main. (page : 07-Outlook-dans-authentic)

### Repères pour une lecture automatique (comparants)
- Qualités citées en exemple seulement : « Vendeur », « Acquéreur », « Promettant », « défunt ». Liste complète : variable selon la nature d'acte, non fournie.
- Un comparant a : Qualité + Intervention (« vend ou achète seul ou conjointement » dans le CDI).

---

## 4. Immeubles d'un acte

Les fiches Immeubles doivent être rattachées avant rédaction. (page : 02-Ajout-nouvel-acte)

### 4.1 Ajouter ⚠
- Bouton d'ajout en face de « Immeubles » → « Recherche Immeubles » (nom, références cadastrales, code postal…), « OK »/Entrée ; clic sur la fiche existante → contrôle/modification → « VALIDER » → choisir la **Qualification** (dépend de la nature d'acte, ex. « Immeuble vendu ») → « VALIDER ».
- Nouvelle fiche : onglet « + » de la recherche (notice Fiches Immeubles, hors lot).
- **Copropriété** : en plus, un bouton ouvre la page « Lots » ; cocher les lots concernés ; bouton de retour à la page Immeuble ; puis « VALIDER » et Qualification. Le sous-dossier montre l'immeuble avec le lot (ex. « lot n° 4 (appartement) »).
- Les autres types d'immeubles fonctionnent comme la maison individuelle.

### 4.2 Modifier / supprimer / reclasser / importer
- Modifier : clic sur l'immeuble → fiche en modification ⚠.
- Supprimer ⚠ : poubelle au survol, confirmation « Oui » ; seulement du sous-dossier, la fiche reste.
- Reclasser les immeubles de même qualification (« Immeuble propre », « Immeuble commun »…) : icône en bout de ligne.
- Import depuis un autre acte : voir §3.3.
(page : 02-Ajout-nouvel-acte)

### Repères pour une lecture automatique (immeubles)
- Qualifications citées : « Immeuble vendu », « Immeuble propre », « Immeuble commun » (liste complète non fournie).
- Pour une copropriété : sélection de lots (case à cocher) dans la page « Lots » de la fiche Immeuble.

---

## 5. Tiers

Ajout au niveau de la page Sous-Dossier ⚠ : bouton d'ajout → choisir le **type de contact** et le nom/dénomination → « rechercher » → choisir le contact et sa **qualité** → « VALIDER ».
- Important : un confrère en participation doit être saisi ici, sinon la rédaction interactive ne pose pas de question sur le notaire en participation.
- Signatures à distance (MICEN) : choisir le type de contact « Notaires (Référentiel des Métiers du Notariat) ». Plusieurs types de contact possibles.
(page : 02-Ajout-nouvel-acte)

---

## 6. Ouverture de l'acte (Word) et rédaction

Quand intervenants et immeubles sont renseignés : clic gauche sur la ligne de l'acte, ou onglet/clic droit › « Ouvrir » dans la side-view. Un document Word s'ouvre (début de la rédaction interactive, notice hors lot). Ouvrir l'acte avec comparants manquants déclenche un message d'erreur (§3). (page : 02-Ajout-nouvel-acte)

---

## 7. Formalités préalables et postérieures

Listes différentes selon la nature de l'acte. (pages : 03-Formalites-prealables, 04-Formalites-posterieures)

### 7.1 Accès
- Préalables : « + » au bout de la ligne « Formalités préalables », ou onglet « Formalités Préalables » › « Ajouter des formalités préalables ».
- Postérieures : « + » au bout de la ligne « Formalités postérieures », ou onglet « Formalités postérieures ».

### 7.2 Ajouter ⚠
1. Fenêtre de sélection ; filtre par mot-clé (loupe ou Entrée) ; la formalité choisie s'ouvre à droite.
2. Certaines demandent des compléments (choix de vendeur, immeuble, tiers…).
3. « Valider » ⚠ : la formalité s'ajoute et se **constitue automatiquement** si le paramètre « Constitution des produits » est actif (réglable dans les « Préférences de l'utilisateur »), sinon elle s'ajoute avec une icône d'engrenage et ne se génère pas (paramètre sur « SANS »).
- Barre d'outils : « Filtrer » ; « Favoris » (étoile en bout de ligne pour marquer ; en postérieures, « Ajouter mes favoris (N) » ajoute l'ensemble ; croix rouge ou corbeille rouge pour en retirer de la sélection) ; tri par type de produit (ex. produits télé@ctes pour un état hypothécaire) ; formalités d'une **autre nature d'acte** (bouton portant le nom de la nature → menu déroulant).
- Validation finale (« Valider ») constitue l'ensemble des formalités sélectionnées ⚠.

### 7.3 Actions sur une formalité existante
- **Constituer** : clic droit › « Constituer » (si l'icône engrenage) ; le Word s'ouvre.
- **Visualiser** : icône ou clic droit → side-view (dates d'envoi et de réception modifiables, renommage).
- **Renommer** : stylet de la side-view (intitulé et date de création modifiables) ; dates « d'envoi et de réception » à renseigner dans la side-view.
- **Dupliquer** : side-view › « Dupliquer » (préalables : « Plus d'action » › « Dupliquer »).
- **Supprimer** ⚠ : onglet ou clic droit › poubelle › « Oui ».
- **Envoyer par courriel** : voir §9.3.
- État de réception/envoi : ce sont ces dates de la side-view qui portent « envoi / réception » (rôle exact par rapport aux tableaux de la page de gestion : à vérifier).

### Repères pour une lecture automatique (formalités)
- Lignes du portail : « Formalités préalables », « Formalités postérieures » (avec « + »).
- Icône engrenage = formalité non constituée.
- Dates par formalité : envoi, réception.

---

## 8. Création de Dossier Intelligent (CDI, « 6ᵉ sens »)

(page : 01-Création-de-Dossier-Intelligent-(CDI), 2 versions identiques ; mise à jour 06/03/2026)
- Crée un dossier à partir d'une **promesse ou d'un compromis de vente importé** ; l'IA génère fiches clients, fiches immeubles, fiches contacts, pièces automatiques, acte, informations financières (prix, mobilier). Opérationnel pour les **ventes immobilières** seulement.
- **Accès** : écran de création d'un dossier de vente d'immeuble (zone de dépôt), ou, dans un sous-dossier de vente existant, bouton « Importer avec 6ᵉ sens ».
- Étapes (onglets) :
  1. « Création du dossier » : nature d'acte compatible (vente d'immeuble) ; importer le document (aperçu, ouverture dans un nouvel onglet, remplacement/suppression) ; compléter les infos à droite ; « Suivant ». Alternative : continuer sans 6ᵉ sens (choix du modèle d'arborescence seulement, puis page d'accueil du dossier).
  2. « Ajout de comparant » : comparants créés par l'IA ; « modifier la qualité » ou stylo (rôle vendeur/acquéreur/autre, intervention seul/conjointement) ; fiche modifiable ; « Ajouter un comparant » (personne physique ou morale) ; vérification depuis le document.
  3. « Ajout d'immeuble » : bien créé, diagnostics et équipements extraits (icône œil = ouvrir le document à la page ; **icônes rouges = information peu fiable à vérifier**) ; « Ajouter un immeuble ».
  4. « Ajout de tiers » : « Ajouter tiers ».
  5. « Contenu de dossier » : contrôle/suppression/validation des pièces automatiques, fiches (CBT), modèles d'arborescence et acte ; **les pièces automatiques sont envoyées dès la validation** et apparaissent dans l'heure dans le répertoire « Demande Document » des pièces jointes du sous-dossier ⚠ (envoi).
  6. Pop-up de **validation obligatoire** ⚠ : crée le sous-dossier complet (fiches, informations financières, pièces automatiques, acte).
- Le CDI détecte les fiches déjà existantes (clients, immeubles, tiers) ; en cas de conflit de données une fenêtre demande, ligne par ligne, quelle valeur garder (par défaut : la fiche, sauf si elle est vide).

### Repères pour une lecture automatique (CDI)
Ordre des onglets : « Création du dossier » › « Ajout de comparant » › « Ajout d'immeuble » › « Ajout de tiers » › « Contenu de dossier ». Boutons : « Suivant », « valider », « Ajouter un comparant », « Ajouter un immeuble », « Ajouter tiers », « Importer avec 6ᵉ sens ».

---

## 9. Courriels

(page : 10-Courriels, 07-Outlook-dans-authentic, 08-Complément-outlook)

### 9.1 Créer un courriel
- Depuis une fiche Client : onglet « Messages » › « + » ; depuis le Dossier : « + » sur la ligne « Mails » ; depuis le Sous-Dossier : « + » du bloc « Mails » (@) ; depuis une formalité : side-view › « Envoyer ».
- Side-view : « Objet » (par défaut référence + nom du dossier), « Destinataire(s) » (intervenants ayant une adresse), corps, pièces à joindre (pièces jointes du dossier via « Rechercher une pièce-jointe », « Importer une pièce-jointe », formalités préalables/postérieures, actes, pièces signées au parapheur, notes) ; curseurs « convertir en PDF » et « retirer les couleurs » (variables bleues/rouges) ; bouton de validation en bas à droite.
- Depuis le sous-dossier, seules les pièces du dossier et de ce sous-dossier sont proposables.
- **Envoi** ⚠ : Outlook s'ouvre avec destinataires/objet/pièces/corps ; l'utilisateur modifie si besoin puis « Envoyer » (l'envoi est fait dans Outlook).
- Remarque : pour les études FoxNot, les échanges sécurisés DocSecure sont intégrés (notice à part).

### 9.2 Historique et classement
- Les courriels envoyés figurent sous « Mails » ; par défaut dans « Non classé ». Aperçu au survol, option d'affichage « conversation ».
- Arborescence de classement : icône « quatre lignes » à côté de « Mails » (ou « + Ajouter arborescence » en bas), clic droit « Ajouter », libellé, « valider » ; **transfert** de « Non classé » vers un autre répertoire ⚠ (« Transférer »/« Déplacer », confirmation) ; « Supprimer » ⚠.
- Recherche par mot-clé de l'intitulé, élargissable à tous les sous-dossiers du dossier, filtre par statut (envoyé et/ou reçu).
- Détail d'un courriel : ouvrir, répondre, imprimer.

### 9.3 Extensions Outlook (lien vers Authen.tic) — rattacher un mail
- Complément Outlook (Authen.tic Cloud seulement) : onglet « Lien vers Authen.tic » › « Accéder à ma configuration » › identifiant, mot de passe Authen.tic, n° CRPCEN › « Connexion » ; volet épinglable.
- Rattachement ⚠ (écrit dans Authen.tic) : sélectionner le(s) mail(s) (Ctrl pour plusieurs), rechercher un dossier / sous-dossier / client / immeuble, puis icône « Associer le mail en consultation » ou glisser-déposer ; possibilité de renommer (stylo), de ranger dans une rubrique de l'arborescence des mails (ex. « Mail vendeur »), « Valider » ; message vert de confirmation ; doublon dans la même rubrique : message d'avertissement.
- Pièces jointes de mails : icône enveloppe+trombone (clic ou glisser), renommage, classement, « Valider » ⚠. Fiches clients/immeubles : pas d'arborescence.
- Rendez-vous Outlook : pièce jointe issue d'Authen.tic via l'icône « Lien vers Authen.tic » et le trombone.
- Ancienne fenêtre d'intégration : bouton « Attacher un mail à un dossier » ; par défaut les **5 derniers dossiers modifiés** ; recherche par « numéro » et/ou « libellé de dossier » ; cases « Tout », « Mails », « Pièces jointes » ; « Appliquer », « Appliquer et Fermer », « Quitter » ; case de conservation du mail dans Outlook (décochée = déplacé dans « Éléments supprimés »). Les initiales notaire/clerc/secrétaire figurent en bout de ligne des dossiers trouvés.
- Dans le complément Outlook, la recherche d'un dossier affiche, sous l'onglet « Général » : référence, notaire, collaborateur et **statut du dossier dans Authen.tic** ; pour un sous-dossier : comparants, immeubles, tiers ; onglets « Mails », « Pièces jointes », « documents » (formalités préalables, acte, formalités postérieures).
- Où retrouver le mail : répertoire « non classé » du dossier ou du sous-dossier.

### Repères pour une lecture automatique (courriels)
- Blocs : « Mails » (icône @), répertoire par défaut « Non classé ».
- Statuts d'un courriel : envoyé / reçu.

---

## 10. Pièces jointes

(pages : 11-Pieces-jointes, 11-Pieces-jointes_silicium)

- Endroits : fiches Clients, fiches Immeubles (onglet « Pièces jointes »), Dossier, Sous-Dossier (bloc trombone, qui regroupe pièces du dossier et du sous-dossier).
- **Arborescence** : propre à chaque type de fiche ; répertoire par défaut « Non classé » ; modèles via « Paramètres » › « Modèles de communication » (Sous-dossier ou Dossier, « + », clic droit › « Ajouter », glisser-déposer pour réordonner). Importer un modèle : « Importer un modèle » › choix › « Importer » › « OK » ⚠. Pièces d'un répertoire disparu : remises dans « Non classé ». Silicium : seuls les répertoires créés par l'utilisateur sont renommables/supprimables, un répertoire doit être vide pour être supprimé.
- Actions sur répertoires : « Nouveau dossier » / « Créer un nouveau dossier », « Renommer », « Supprimer » ⚠ (confirmation).
- **Ajouter** ⚠ : bouton d'import (explorateur Windows) ou glisser-déposer dans la zone « Glissez-déposez vos fichiers ici depuis l'explorateur Windows pour les ajouter » (Ctrl pour sélection multiple) ; depuis le portail dossier/sous-dossier, « + », les pièces tombent dans « Non classé » ; lors d'un déplacement vers le répertoire « Annexes MICEN », un message signale la conversion des pièces MICEN.
- **Déplacer ou dupliquer** ⚠ : menu « Déplacer » › « Dupliquer » ou « Transférer » vers un autre répertoire, sous-dossier (ou « Commun au dossier »), dossier, fiche client ou immeuble.
- **Actions sur une pièce** : visualiser (œil/clic/double-clic), ouvrir dans un onglet PDF, télécharger, renommer, supprimer ⚠ (confirmation), envoyer par mail ou LRE, imprimer, modifier (module « Edition du fichier PDF », §13), signer (parapheur : « Signature directe » ou « préparer signature »), « Résumer IA » (synthèse), ajouter un TAG, déverrouiller, expédier par courrier.
- **MICEN** (sous-dossier seulement) : « Ajouter au MICEN » ⚠ — un symbole de signature précède le nom ; la pièce apparaît dans les annexes MICEN à la création de l'AAE (la pièce reste dans son répertoire).
- **Recherche** : mot-clé de l'intitulé (+ Entrée), élargissement à tous les sous-dossiers, recherche par tag, tri croissant/filtre par date (Silicium).

---

## 11. Appels téléphoniques

(page : 09-Appels-telephoniques)
- Création depuis le Dossier : « + » sur la ligne « Appels/Notes » › « Appel » ; depuis le sous-dossier : « + » du bloc « téléphonie ».
- Champs : interlocuteur (recherche fichier Clients, l'appel est alors rattaché à la fiche), dossier, téléphones principal/secondaire, « Motif » (*), destinataire, **priorité** (« Faible », « Normal », « Urgent »), **état** (« A traiter », « En cours », « Clôturé »), saisi par, durée, « Description » (*), réponse apportée. « Enregistrer » ⚠.
- Le destinataire voit le nombre d'appels à traiter sur l'icône du gestionnaire d'appels ; réponse possible depuis la ligne de l'appel (met à jour l'état).
- Le bloc téléphone du sous-dossier liste appels et SMS ; recherche par mot-clé du motif ou par tag ; suppression ⚠.
- Le portail ne permet de **visualiser** que les appels saisis dans le Dossier, le Sous-Dossier et la fiche Clients des comparants (§1.6).

---

## 12. Post-it, notes et liens

(pages : 12-Postit-notes-liens, version silicium)
- **Post-it d'une fiche Client/Immeuble** : onglet « Post'it » › « + » (Silicium : « + Ajouter ») ; trois types de post-it (non détaillés ici : à vérifier) ; saisie, « VALIDER » (Silicium : « Enregistrer les modifications ») ; « - » pour supprimer ⚠ ; nombre affiché sur la fiche.
- **Note de dossier** : modèles Word importés via « Paramètres » › « Modèles de communication » › « Modèles de note de dossier » ; créer/importer une note depuis l'icône du pavé du dossier, ou « + » de « Appels/Notes » › « Note » ; types de note : « Public », « Confidentiel », « Rédacteur » ; « Enregistrer » ⚠. Icône jaune = note existante (ouvrir, envoyer par mail, imprimer, renommer, supprimer ⚠ en Silicium).
- **Sous-dossier** : bloc « Notes » (Silicium « Notes et liens ») ; « Note », « Lien Dossier Authentic » (lien vers un autre dossier Authen.tic) ou « Lien Dossier Local » (dossier en dehors d'Authen.tic) ; consultation/modification au clic sur l'intitulé, « Supprimer » ⚠ ; Silicium : une note peut être **épinglée** (info-bulle à l'ouverture du sous-dossier).

---

## 13. Module PDF (version Silicium)

(page : 13-Le-module-PDF-(version-Silicium) ; mise à jour 21/01/2026)
- Accès : pièces jointes › prévisualiser › « Modifier » → onglet « Edition du fichier PDF ».
- Fonctions : annoter (surligner, souligner, barrer, texte libre, commentaire), formes, tampons/signatures, « Fusionner », « Diviser », « Mise en forme », conversion texte (OCR, .docx), « Compresser » (faible/moyen/élevé), « Conversion PDF/A », « Supprimer pages vides », recherche, commentaires.
- **Enregistrement** ⚠ : « Enregistrer » **écrase** le document d'origine ; « Enregistrer sous » garde l'original et crée une copie. « Réinitialiser » revient à l'état initial seulement si rien n'a été enregistré.

---

## 14. Courriers libres, prototypes et correspondances hors dossier

(pages : 05-Courriers-libres, 05-Courriers-libres-(version-silicium), 06-Correspondances-hors-dossier, version Silicium)
- **Prototypes Word/Excel** : menu Authen.tic › « Paramètres » › « Prototypes » › « Nouveau » ; champs : libellé, type (« Courrier » ou Excel), nature d'acte, catégorie (formalités préalables et/ou postérieures), en-tête, origine (« Courrier type » ou « Document existant »), « + Créer » ⚠. Variables insérables par catégorie : « Etude », « Dossier », « Acte », « Client », « Immeuble » (bouton « Ajouter »). Modification via « Afficher en détail » ; suppression (poubelle) ⚠ ou désactivation (sens interdit, réactivation en décochant « Prototypes actifs »).
- **Utilisation dans un dossier** : formalités préalables/postérieures › catégorie « Modèle étude » (tag « Etude ») : prototypes, « Courrier Etude - Nouveau courrier en reprenant une correspondance » (courrier externe glissé-déposé ou « Courrier existant », avec le curseur « Rechercher dans le dossier ? »), « … en reprenant un en-tête », « Courrier Etude - Utiliser un formulaire » (tous les CERFA, quelle que soit la nature d'acte) ; sélectionner destinataires/signataire/en-tête/libellé puis « valider » ⚠ pour constituer.
- **Correspondances hors dossier** : barre Authen.tic › « Outils » › « Créer un courrier libre » ; choix de l'utilisateur, « + » › « Ajouter une correspondance » › méthode/modèle › « Valider » ; modifier (icône lunettes), renommer (« ABC » › « VALIDER »), supprimer (« - » › « OK ») ⚠. Rattachement à un sous-dossier : formalités préalables ou postérieures › « Correspondance Hors Dossier » › choisir › « VALIDER » ⚠ ; ou « Courriers Etude - Nouveau courrier en reprenant une correspondance » › onglet « Courrier externe ».

---

## 15. Références, numéros, dates : récapitulatif

| Élément | Où | Ce que dit le texte |
|---|---|---|
| Numéro de dossier | Création du dossier | lettre-bureau / année / n° sur 5 chiffres (« A 2026 00477 ») ; auto ; remise à zéro annuelle selon option |
| Références internes | Dossier › « Références » | champ libre de l'étude |
| Libellé / libellé détaillé (long) | Dossier | libellé obligatoire |
| Date d'ouverture | Création | date du jour, obligatoire |
| Dates sensibles | Dossier | rappel 30 j avant par défaut |
| Date de signature | Sous-dossier | auto au passage à « signé » |
| Date prévisionnelle | Sous-dossier | statistiques et alertes d'accueil ; obligatoire ou facultative |
| Prochain RDV / Heure de RDV | Sous-dossier | libres |
| Date et numéro d'archivage | Dossier | générés par icône après « Clôturé » / « Dossier rentré » |
| N° de répertoire | Sous-dossier | via side-view répertoire |

Non documenté dans ce lot : « Prévu le » / « Signé le » en tant que colonnes de la liste de dossiers, format du libellé de sous-dossier « N - … ». À vérifier dans d'autres lots.

---

## 16. Archivage, confidentialité, partage

- Archivage = suivi du **dossier papier** (§1.5) ⚠ : mettre « Clôturé »/« Dossier rentré » écrit la date d'archivage.
- Confidentialité : mot de passe, cache le dossier tant que non saisi.
- « Partage » au sens collaboratif : non traité dans ce lot (seulement partage d'une pièce jointe « en l'envoyant par mail »).
- Aucune notion d'archivage automatique ou de « Sans suite = archivé » dans le texte (à vérifier).

---

## 17. Boutons et actions existants (index rapide)

- Dossier : « + » (ajouter un acte), « Valider » (création), icône réveil (dates sensibles), « ajouter un mot de passe », icône numéro d'archivage.
- Sous-dossier : « + » comparants/immeubles/tiers, import (« +i »), « VALIDER », poubelle ⚠, flèches de reclassement, clic ligne d'acte / « Ouvrir ».
- Formalités : « + », « Valider », « Constituer », « Dupliquer », poubelle ⚠, étoile favoris.
- Blocs du portail : trombone (pièces jointes), @ (mails), téléphone (appels), « Notes ».
- Écritures/envois à repérer particulièrement (⚠) : validation de la création de dossier et du CDI (envoi automatique de pièces), SMS de rappel, envoi de courriel (dans Outlook), « Valider » des formalités (constitution des documents), suppression de comparant/immeuble/formalité/pièce/note, « Enregistrer » du module PDF (écrasement), rattachement de mails.

## 18. Pour CLAIRE (lecture seule) — synthèse

- Pour **lire** : numéro, libellé, statut du sous-dossier (8 valeurs), comparants (Qualité/Intervention), immeubles (Qualification, lots), tiers, date de signature, date prévisionnelle, RDV, capital/mobilier, statut papier. Rien de tout cela ne nécessite d'écrire.
- Ne jamais cliquer : « Valider », « Enregistrer », « Constituer », « Envoyer », poubelles, « Importer », « Transférer », « Appliquer ».
- Les formulaires (CERFA), Comedec, CJN, EHF, tableaux « Rédaction/Courrier/Demande/Etat civil » : à chercher dans d'autres lots.
