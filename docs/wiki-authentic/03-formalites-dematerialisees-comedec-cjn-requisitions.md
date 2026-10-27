# Résumé du lot « Formalités dématérialisées » d'Authen.tic (Fichorga)

Source : lot `Formalités-Dématérialisées` du wiki Fichorga, 25 pages lues en entier, paraphrasées (la documentation appartient à Fichorga). Les captures d'écran sont absentes du texte : tout ce qui ne reposerait que sur une image est signalé « à vérifier ». Les noms de pages sont donnés sous la forme `chemin` relative au lot. Dates des notices : Comedec (non datée), CJN 20/08/2024, BRI 29/07/2025, SAFER V3 01/08/2025, AR24 11/09/2025, Réquisitions Silicium 07/07/2026, Réquisitions (ancienne version) 15/11/2023.

Légende : ⚠ = action qui écrit, valide, envoie, facture, supprime ou ne se défait pas.

---

## 0. Vue d'ensemble et vocabulaire commun

- Le lot réunit : AR24 (lettre recommandée électronique), CJN, Comedec, LRE (module externe), BRI (ex PERVAL/BIEN), SAFER V3, et la famille Télé@ctes (vente, prêts, mainlevée, attestation immobilière, servitude, réquisitions). (page : Formalités-Dématérialisées/Formalités-Dématérialisées)
- Il n'y a PAS de page « Etat-Civil » distincte : les demandes d'état civil dématérialisées sont Comedec. Il n'y a PAS de page « Micen » dans ce lot (Micen n'apparaît qu'en nom dans un autre contexte, hors lot : à vérifier ailleurs). (pages : Comedec/Comedec ; lot entier)
- Statut commun à presque toutes les formalités dématérialisées : « En préparation » → « Prêt pour envoi » → envoi → retour. Pour la plupart, « Prêt pour envoi » est une étape obligatoire avant l'envoi et se défait (on revient en préparation pour modifier).
- Beaucoup d'envois exigent une clé REAL / RealNot et son code PIN (AR24 « Prêt pour envoi », BRI et Télé@ctes envoi/signature, SAFER envoi initial par carte REAL NOTAIRE). Cela agit comme garde-fou : un robot sans clé ne peut pas envoyer, mais ne doit de toute façon jamais essayer.
- Les formalités sont créées depuis le sous-dossier, dans les « formalités préalables » ou « formalités postérieures » (menus du sous-dossier), à partir des fiches clients et des fiches immeubles du dossier.

---

## 1. Comedec (demandes d'état civil dématérialisées)

### 1.1 À quoi ça sert, éligibilité
- Comedec = « COMmunication Electronique des Données de l'Etat Civil » ; sigles cités : CGU, ANTS (Agence Nationale des Titres Sécurisés), SCEC (Service Central d'Etat Civil, Nantes). Permet de demander des actes d'état civil en dématérialisé. (page : Comedec/Comedec)
- La création est présente « depuis toutes les natures d'acte et pour les dossiers contenant des fiches clients ». (page : Comedec/Comedec)
- Les communes éligibles Comedec : un bandeau vert en haut de la demande indique qu'elle sera dématérialisée. Commune non éligible : un bandeau indique que la demande sera faite en papier ; « Générer la demande » crée alors le courrier classique en formalité préalable. (page : Comedec/Comedec)
- Obligatoire ? Le texte ne dit pas que Comedec est obligatoire : c'est une « nouvelle possibilité » offerte. (page : Comedec/Comedec)

### 1.2 Où créer, chemin
- Depuis un sous-dossier : « Ajout d'une formalité préalable » puis choix entre :
  - demandes globales pour l'ensemble des clients (d'après les éléments des fiches) ;
  - demande individuelle par client (d'après la fiche). (page : Comedec/Comedec)
- Onglet « des demandes Comedec du dossier » : cliquer la personne pour voir ses demandes, puis l'acte demandé pour le compléter/valider. (page : Comedec/Comedec)
- Types de demandes cités : « Demande ANTS acte de naissance », « Demande ANTS acte de mariage », « Demande ANTS acte de décès » ; pour communes étrangères, demandes SCEC (naissance et mariage), avec ou sans filiation, ou copie intégrale. (page : Comedec/Comedec)

### 1.3 Données reprises des fiches
- ANTS acte de naissance : les informations sont reprises de la fiche client ; modifiables/complétables : compléments d'information, titulaire et parents. (page : Comedec/Comedec)
- Les champs exacts des fiches qui alimentent chaque demande ne sont pas listés (captures absentes) : à vérifier.

### 1.4 Raccourcis dangereux
- ⚠ « Création rapide » : crée TOUTES les demandes d'état civil (dématérialisées et papier selon l'éligibilité). À la validation : les demandes dématérialisées conformes sont créées ET passées en « Prêt pour envoi » ; les papier se constituent ; les dématérialisées non conformes restent en préparation (à rouvrir pour corriger). (page : Comedec/Comedec)
- ⚠ « Envoi immédiat » : mêmes effets que la création rapide ET les demandes dématérialisées conformes sont ENVOYÉES. (page : Comedec/Comedec)
- Ne jamais activer ces deux options à la création.

### 1.5 États et passages
- Enregistrer la demande : permet d'y revenir et de la modifier. (page : Comedec/Comedec)
- « Passer en prêt pour envoi » : étape obligatoire avant l'envoi ; enregistre automatiquement. Une fois « Prêt pour envoi », on peut envoyer ou revenir en arrière pour modifier. (page : Comedec/Comedec)
- « Fermer » : referme l'écran des demandes du dossier ; ce qui n'a pas été enregistré ou passé en prêt pour envoi est perdu. (page : Comedec/Comedec)
- ⚠ Envoi : depuis le dossier (un clic sur la demande ouvre une fenêtre, envoi individuel) ou depuis le « Suivi Comedec » (sélection multiple). (page : Comedec/Comedec)
- Retours : positif, négatif, rejetée (demande rejetée, exemple ANTS) ; « Purge » (titre seul, délai non précisé : à vérifier) ; archivage automatique 2 mois après la date d'envoi. (page : Comedec/Comedec)
- Les modifications sont tracées dans « Historique de la demande ». (page : Comedec/Comedec)
- Les libellés précis des statuts du suivi (colonnes de l'écran) ne sont pas décrits en texte : à vérifier.

### 1.6 Suivi, accès, colonnes
- Menu de gauche « Formalités » puis « Suivi COMEDEC ». Actions décrites par titres seulement : accéder à une demande, accès au dossier, visualisation de l'historique, ouvrir la fiche client. Colonnes non décrites (captures) : à vérifier. (page : Comedec/Comedec)
- Retour d'une demande créée : depuis le dossier (clic sur la demande) ou par « Formalités » › « Suivi Comedec ». L'affichage du retour se fait toujours dans la fenêtre qui s'ouvre sur la droite (bouton du suivi, ou clic gauche sur la ligne/bouton depuis le dossier). (page : Comedec/Comedec)

### 1.7 Retours et intégration sur les fiches
- Retour positif : détail de la réponse (ex. ANTS), aperçu du document reçu ; le PDF est aussi stocké sur la fiche client. (page : Comedec/Comedec)
- ⚠ « Intégrer les données » : modifie ou crée (cas des parents) les fiches clients. Curseur à droite = information de la fiche conservée ; curseur à gauche = la fiche est mise à jour avec la réponse Comedec. Parent (Titulaire - Parent 1 ou 2) sans fiche : la fiche est créée avec les données du retour. (page : Comedec/Comedec)
- Retours négatifs : exemples ANTS et SCEC (contenu sur capture, à vérifier). (page : Comedec/Comedec)

### 1.8 Facturation et comptabilité
- Liaison JurisWeb : les demandes envoyées à facturer deviennent accessibles dans JurisWeb dès qu'un retour négatif ou positif est reçu ; intégration dans un onglet JurisWeb nommé « Demandes hors Télé@ctes ». (page : Comedec/Comedec)
- Le numéro de compte peut être saisi à tout moment avant l'intégration du retour : liste proposée à partir des numéros des « Informations détaillées » du sous-dossier ou des comptes clients rattachés à l'acte ; saisie dans « Informations Générales » de la demande initiale (hors demandes rapides, ou modification) ou dans le bloc « Informations comptables » de l'aperçu. (page : Comedec/Comedec)

### 1.9 Droits
- Aucune habilitation Comedec n'est décrite dans le texte (à vérifier). Comparer avec CJN, qui a une « Habilitation CJN ».

---

## 2. CJN — Casier Judiciaire National dématérialisé

### 2.1 Utilité et obligation
- Interrogation du bulletin n° 2 du casier de l'acquéreur : article L. 551-1 I du CCH, quand le notaire établit l'acte authentique de vente d'un bien à usage d'habitation ou d'un fonds de commerce d'un ERP. Concerne les personnes physiques acquéreurs et MAJEURES. (page : CJN/CJN)
- Mineurs : seul le représentant légal peut interroger leur casier (donc pas de demande CJN pour un mineur). (page : CJN/CJN)
- Prérequis BRI : l'alimentation de la BRI - Avant contrat doit avoir été faite, sinon l'interrogation CJN est bloquée (voir §2.9 pour le déblocage). (pages : CJN/CJN ; Alimentation-BRI/Alimentation-BRI)

### 2.2 Droits / habilitations
- Menu Authen.tic › « Paramètres » › « Utilisateurs » ; choisir l'utilisateur ; rubrique « Droits » ; menu déroulant « Habilitation CJN » ; choisir le statut : simple consultation, modification ou envoi ; puis « Valider ». (page : CJN/CJN) ⚠ (modifie des droits, ne pas toucher)
- Les libellés exacts des trois options ne sont pas donnés (à vérifier).
- Le déblocage manuel exige une clé Réal d'un Notaire de l'office. (page : CJN/CJN)

### 2.3 Création de la demande
- Comme Comedec : possibilité de « création rapide » sans contrôle, ou « envoi immédiat » si les droits le permettent. ⚠ (ne pas utiliser) (page : CJN/CJN)
- Cas à trois écrans :
  - a. nés en France (hors ex-TOM) : zones obligatoires (cerclées de rouge) pré-remplies d'après les fiches, le dossier et l'étude, toutes modifiables ; date de naissance : année seule, ou mois et année, possible ;
  - b. nés en Collectivités d'Outre-Mer (Polynésie, Nouvelle-Calédonie, Wallis-et-Futuna) : ajout de l'extrait d'acte de naissance en PDF obligatoire (clic sur le libellé bleu) ;
  - c. nés à l'étranger : la filiation n'est pas bloquante, mais facilite la recherche et réduit le risque de rejet ;
  - d. personnes morales : demande pour les représentants/dirigeants ; il faut rattacher la fiche du représentant à la fiche de la personne morale (zone « Associés-Représentants », « + », rôle sans influence sur la demande) ; la demande part pour toutes les personnes physiques rattachées, en choisissant l'acquéreur du dossier (la personne morale). (page : CJN/CJN)
- ⚠ Une demande peut être supprimée avec l'icône corbeille (dans l'écran de création).
- Les accents des majuscules accentuées du nom sont retirés automatiquement dans la demande (non autorisés par le système CJN). (page : CJN/CJN)
- Les champs précis de la fiche client repris (nom, prénom, naissance, parents…) ne sont pas listés en texte : à vérifier.

### 2.4 États et boutons
- Écran de création multi-demandes : zone 1 = navigation entre demandes ; zone 2 = boutons de la demande sélectionnée (enregistrer, « Marquer la demande Prête pour envoi », supprimer) ; zone 3 = boutons pour l'ensemble (tout enregistrer, tout marquer « prêtes pour envoi », fermer sans enregistrer). (page : CJN/CJN)
- Demande créée : visible/modifiable tant qu'elle n'est pas envoyée (clic droit sur la demande dans le dossier, ou icône). (page : CJN/CJN)
- « Marquer la demande Prête pour envoi » : lance un contrôle de conformité des champs. (page : CJN/CJN)
- Statuts cités : prêt pour envoi, envoyée en attente de réponse, absence de condamnation, condamnation, rejet technique, rejet fonctionnel, « Attente courrier / attente édition », « Expirée », clôturée, purgée. (page : CJN/CJN)

### 2.5 Envoi (3 emplacements)
- ⚠ Pour les utilisateurs autorisés : depuis la demande, depuis le dossier, ou depuis le suivi CJN (menu « Suivis »). Les détails sont sur captures (à vérifier). (page : CJN/CJN)

### 2.6 Retours
- La récupération des réponses est automatique lors des connexions à « planete » (Télé@ctes, Comedec, Perval, CJN) ou au clic sur la flèche en haut de l'écran. (page : CJN/CJN)
- Indications de situation dans le dossier : aucune demande ; prêt pour envoi ; envoyée(s) en attente ; réponse(s) avec condamnation ; toutes sans condamnation. (page : CJN/CJN)
- Absence de condamnation : la demande apparaît dans le suivi CJN ; ⚠ une fois consultée, elle disparaît du suivi (passe en « clôturée ») mais reste accessible depuis le dossier, ou dans le suivi si on ajoute les demandes clôturées aux critères. Visualisation : clic droit sur la ligne de la demande. Le PDF de réponse est aussi ajouté aux pièces jointes du dossier et à la fiche client. (page : CJN/CJN)
- Changement d'état civil signalé par le CJN : différences en rouge ; ⚠ « Intégrer les données aux fiches clients » avec curseur (conserver la fiche ou prendre le CJN). (page : CJN/CJN)
- Condamnation : date de fin de condamnation en début de réponse. (page : CJN/CJN)
- Rejet technique (serveurs planete, satellite ou CJN) : détail dans l'historique ; non facturé. (page : CJN/CJN)
- Rejet fonctionnel : demande FACTURÉE ; cas : plus de 120 ans, personne décédée, aucune identité applicable (« personne non trouvée au RNIPP de l'INSEE »), état civil non trouvé pour une personne née à l'étranger. (page : CJN/CJN)
- « Attente courrier / attente édition » : vérification par le CJN ou l'ADSN, réponse ensuite toujours dématérialisée. (page : CJN/CJN)
- « Expirée » : sans réponse du CJN ; il faut en créer une nouvelle si besoin. (page : CJN/CJN)
- Purge automatique au bout de 3 mois : ⚠ demande supprimée du dossier, PDF supprimés des pièces jointes du dossier et de la fiche client ; sablier 7 jours avant. (page : CJN/CJN)
- Les demandes clôturées peuvent être dupliquées pour en faire de nouvelles identiques. (page : CJN/CJN)

### 2.7 Suivi
- Écran de suivi CJN via le menu « Suivis » ; colonnes non décrites (à vérifier). (page : CJN/CJN)

### 2.8 Intégration sur fiche
- PDF de réponse sur la fiche client, accès à la fiche depuis la fenêtre de visualisation. (page : CJN/CJN)

### 2.9 Lever le blocage (⚠ réservé aux notaires, clé Réal)
- Cas : ventes directes sans avant-contrat, anomalie technique avérée, ou dossier à deux notaires (le notaire en participation peut lever le blocage). (page : CJN/CJN)
- Chemin : onglet « Débloquer » ; curseur « Déblocage manuel » ; motif dans le menu déroulant ; « Valider le déblocage manuel » ; l'ensemble des demandes CJN du sous-dossier sont alors débloquées ; traçabilité auprès de la BRI. Liste via « Authen.tic » › « Suivis » › « Suivi alimentation BRI » › critères de recherche › « Liste des déblocages ». (page : CJN/CJN)
- ⚠ Ne jamais utiliser.

---

## 3. Réquisitions Télé@ctes (état hypothécaire) dont « hors formalités »

### 3.1 Principe
- Les réquisitions sont accessibles dans les formalités préalables et postérieures du sous-dossier ; on peut générer « client + immeuble », « immeuble » seul ou « vendeur » seul. Deux familles : « Réquisition hors formalités ou complémentaire » (formalités préalables) et « Réquisition sur formalités » (formalités postérieures). (page : Teleacte/Réquisitions-(version-Silicium)/Réquisitions__1_)
- Liste Actes télé@ctables : « Tout type de demandes initiales hors formalité (réelle, réelle personnalisée, personnelle) », « Complémentaire hors et sur formalité », « Initiale hors formalité comportant des références au cadastre non rénové », « Intégration de la demande de Fiche Générale (FG) ». (page : Teleacte/Actes-teleactables/Actes-teleactables)
- Une réquisition « hors formalité » peut être faite avant tout acte ; une réquisition « sur formalités » doit être postérieure au dépôt de l'acte au SPF (préparable en même temps que le dépôt, à envoyer quand le dépôt est « Dépôt pris en compte »). (page : Réquisitions-(version-Silicium))

### 3.2 Données reprises
- Vente : le ou les vendeurs et les immeubles du sous-dossier apparaissent automatiquement ; succession : le défunt et les immeubles dépendant de la succession. (page : Réquisitions-(version-Silicium))
- SPF : indiqué automatiquement d'après l'immeuble ; si plusieurs SPF, menu déroulant. (page : idem)
- Intervenants : stylo (version Silicium ; loupe dans l'ancienne version) pour ouvrir la fiche client ; ajout de personnes (anciens propriétaires pour un état trentenaire) par 3 icônes : comparant du sous-dossier, fiche Client existante, personne sans fiche ; ⚠ poubelle = retire de la réquisition seulement (pas du fichier Client). (page : idem)
- Vérification ANF (loupe en fin de ligne) : critères pré-remplis, résultats sélectionnables intégrés à la demande. (page : idem)
- Immeubles : onglets de ligne : ouvrir la fiche immeuble, ⚠ supprimer des références cadastrales sans lot, ajouter une référence, ajouter volume(s) + assise, dupliquer ; copropriété : menu EDD, « Sélectionner les lots » ; anciennes références cadastrales reprises seulement si saisies dans la fiche Immeuble ; ajout d'un immeuble : trois choix (immeuble du sous-dossier du même SPF, fiche Immeuble existante, immeuble sans fiche conservé seulement dans la réquisition). (page : idem)
- Partie basse : « Détail du coût » (calcul automatique, libre après « Mode Expert »), « Point de départ » (date de départ de l'état trentenaire), « Terme » (seulement demande personnelle, sans immeuble), « Fiche générale » (case, copropriété). (page : idem)

### 3.3 États et passages
- « Vérification du formulaire » (contrôle sans envoi) : erreurs à rectifier avant envoi. (page : idem)
- Enregistrer = cliquer « Valider » en bas de l'écran. ⚠ Attention au libellé : « Valider » ici enregistre la réquisition en situation « En préparation » (tant qu'aucune demande de virement n'a été faite) ; il ne l'envoie pas. (page : idem)
- Situation « Transmis à la comptabilité » : après la demande de virement. (page : idem)
- ⚠ « Virement » (onglet en bas de la réquisition) ou clic droit sur le libellé puis symbole « Euros » : envoie la demande de virement à la comptabilité (débit sur compte client ; champs « Affaire », « Libellé », « Mémo », « N° comptable »). (page : idem)
- ⚠ Envoi : clé USB RealNot et code PIN exigés ; individuel via le dossier, en masse via « Authen.tic » › « Suivis » › « Suivi des réquisitions Télé@actes ». (page : idem)
- ⚠ « Réaffecter un avis d'opérer » : après suppression de l'état erroné, icône « AOP disponible » (même SPF, même montant). (page : idem)
- Réquisition complémentaire (prorogation de l'état initial) : dans les « FORMALITES PREALABLES », champs remplis automatiquement, point de départ = lendemain de la « date du fichier » saisie au retour de la réquisition initiale, non modifiable ; virement et envoi comme la réquisition initiale. (page : idem)

### 3.4 Suivi, alertes, retours
- Menu Authen.tic › « Suivis » › « Suivi des réquisitions Télé@actes » : toutes les réquisitions de l'étude quelle que soit la situation ; critères : numéro de dossier, libellé de dossier, libellé acte, situation du dépôt… ; « Recherches favorites » (icône à 3 barres, nom, « Sauvegarder »). Colonnes exactes non décrites (à vérifier). (page : idem)
- Retour du SPF : clic droit sur le libellé de la réquisition dans le dossier. (page : idem)
- Alertes : réglées dans « Préférences de l'utilisateur », pavé « Télé@actes » (nombre de jours) ; exemple 30 jours : réquisitions créées depuis plus de 30 jours nécessitant une action (par ex. virement) ; icône d'alertes. (page : idem)
- « Edition des réquisitions » : menu Authen.tic › « Formalités » › « Edition des réquisitions » (notaire, clerc, situation, période, bouton « IMPRIMER »). (page : idem)

### 3.5 Habilitations
- L'envoi exige la clé RealNot ; la préparation est ouverte à tous (mention explicite pour les autres produits Télé@ctes : « accessible à tous les utilisateurs puisque la clé USB RealNot n'est pas requise », à vérifier pour la réquisition proprement dite).

---

## 4. Télé@ctes (autres produits) — repères utiles

(Ces produits sont des publications au SPF ; CLAIRE n'a pas à les préparer ; résumé court pour savoir quoi éviter.)
- Statuts d'un dépôt Télé@cte cités : « En préparation », « Prêt à signer », « Signé » (« Copie signée », « Inscription signée »), « Transmis à la comptabilité », « Dépôt envoyé », « Dépôt pris en compte », « Attente PERVAL/BIEN ». (pages : Teleacte/Vente-(version-Silicium) ; Prêts ; Perval)
- ⚠ Actions irréversibles ou engageantes : signature électronique (clé RealNot + PIN, par le notaire seul), « Signer le(s) dépôt(s) », « Envoyer », demande de virement à la comptabilité (symbole « Euros »), saisie des droits et CSI. (pages : Vente-(version-Silicium) ; Constitution-de-servitude)
- Ordre type : signature de la minute, mise au répertoire, génération de la copie hypothécaire, préparation du dépôt, signature/certification, virement et avis d'opérer, envoi. (page : Vente-(version-Silicium))
- Suivi : menu Authen.tic › « Suivis » › « Suivis des dépôts Télé@ctes » (dépôts « Prêt à signer » ou « Prêt pour envoi » regroupés ; icônes « Signer le(s) dépôt(s) » et « Envoyer »). (pages : Vente ; Attestation-immobilière)
- Contrôles sans risque : test de la copie hypothécaire (icône « T@ » du prévisualiseur, illimité, à faire avant la mise à la signature) et pastille « T@ / BRI » sur les fiches clients (verte/rouge). (pages : Bien-utiliser-téléacte-(version-Silicium))
- Fiches clients : le « T@ / BRI » vert signifie que les informations indispensables pour téléacter et envoyer une BRI sont renseignées ; rouge = infos manquantes (survol du point d'exclamation). (page : Bien-utiliser-téléacte-(version-Silicium))
- Fiches immeubles : syntaxe stricte des références de publicité foncière (types 1/2/3 selon l'année). (page : idem)
- Autres produits décrits : attestation immobilière (dont cumulative et mixte SPF+LF), constitution de servitude, mainlevée simplifiée, prêts (bordereau d'inscription, rectificatif, renouvellement), déclaration de plus-value. Liste complète des trames télé@ctables : page Actes-teleactables.
- Retours facturation : « Retour de la facture en dématérialisé » est listé comme télé@ctable. (page : Actes-teleactables)

---

## 5. SAFER V3 (DIA SAFER dématérialisées)

### 5.1 Utilité, obligation
- Depuis le 1er janvier 2023, les formulaires de notification A et C doivent être transmis de manière dématérialisée ; les formulaires B et D se remplissent en ligne sur le site de la SAFER. Les demandes V2 anciennes continuent de recevoir leurs réponses ; les nouvelles sont obligatoirement V3. (page : SaferV3/SaferV3)

### 5.2 Création
- Sous-dossier › formalités préalables › catégorie « Préemption » › « Notification SAFER dématérialisée (V3) ». Sélectionner l'immeuble (zone 1), confirmer le formulaire (zone 2) : « Formulaire A » (cessions à titre onéreux) ou « Formulaire C » (cessions à titre gratuit). Un onglet « Création SAFER » s'ouvre à côté du dossier. (page : SaferV3/SaferV3)
- Sept onglets de saisie + un onglet de contrôle : « Informations générales » (reprend l'étude et le dossier ; mode de cession à vérifier, « Echange » permet une description) ; « Désignation des parties » (intervenants du dossier ; vendeurs, acquéreurs, co-échangistes ; ajout physique/morale ; représentant obligatoire pour une personne morale ; ⚠ la poubelle retire la personne de la demande) ; « Biens Immobiliers » (références cadastrales, nature cadastrale et zone d'urbanisme obligatoires, occupation/situation locative, bâtiments, droit à paiement de base, autres éléments mobiliers) ; « Prix et modalités » (prix repris de la zone « Capital » du dossier, modifiable) ; « Préemptions et Exemptions » ; « Observations » ; « Pièces jointes » (20 Mo maximum au total). (page : idem)
- Confirmation : onglet « Confirmation » avec résumé et bloc « Erreurs et Alertes » (obligatoires en rouge, facultatives en orange). L'enregistrement est possible sans les compléter, mais les fonctions d'envoi sont alors bloquées. (page : idem)

### 5.3 Boutons et envoi
- « Enregistrer la DIA » : disponible quel que soit le statut, permet une saisie partielle (dernière étape sûre). Fermer = fonction « Fermer » (penser à sauvegarder). (page : idem)
- ⚠ L'envoi d'une notification dématérialisée à la SAFER est validé par la signature d'une carte Réal NOTAIRE ; seules les « demandes de traitement rapide » et les messages entre l'office et la SAFER peuvent se faire avec une carte Collaborateur. (page : idem)
- Envoi : depuis la saisie initiale (boutons en bas de la demande), depuis l'aperçu d'une demande enregistrée, ou depuis le suivi (« Suivi SAFER V3 », sélection puis logo d'envoi). (page : idem)
- ⚠ « Demande de traitement rapide » (DTR) : possible à tout moment, même après l'envoi initial ; options selon barèmes de chaque SAFER ; envoi multiple possible depuis le suivi ; entraîne une FACTURE (voir 5.6). (pages : SaferV3/SaferV3 ; Factures-SAFER)
- Modification : clic gauche sur la demande (liste des formalités préalables) ou bouton en bout de formalité ; « Modifier la DIA » dans l'aperçu ; depuis le suivi, logo en bout de ligne. (page : SaferV3/SaferV3)

### 5.4 Statuts d'une demande et ce qui les fait passer
- « En préparation » : enregistrée, modifiable/complétable/annulable.
- « Envoyé » : envoyée, la SAFER va l'intégrer ; message automatique à la prochaine récupération des messages → « En attente ».
- « En attente » : intégrée par la SAFER ; délai de validité récupéré depuis la plateforme SAFER (conditionné par les préempteurs prioritaires s'il y en a) ; information ajoutée à l'historique si la SAFER tarde à confirmer.
- « Confirmation à envoyer » (« A confirmer ») : renonciation de la SAFER dans les 2 mois, ou renonciation automatique au-delà ; il faut ⚠ envoyer un message de confirmation de vente avec la date de signature (fonction « Messages »), l'acte devant être signé dans Authen.tic.
- « Préemption SAFER » : dans les deux mois, trois réponses possibles : accord explicite avant 6 mois, retrait de la vente, demande de fixation judiciaire du prix ; un message automatique de réception est envoyé par le logiciel.
- « Rejeté » : motif d'exemption ou droit d'un préempteur prioritaire rejeté ; demande corrigeable, remplaçable, annulable.
- « Clôturé » : vente confirmée ou faite au profit de la SAFER ; historique seul consultable.
- « Dossier incomplet » : demande d'information de la SAFER ; modifications de plusieurs types (simple, du prix, substantielle).
- « Annulé/abandonné » : à l'initiative de l'étude.
- « Retour échange papier » : à l'initiative de l'étude ou cas particuliers ; ⚠ retour DÉFINITIF au papier, seule l'impression reste possible. (page : SaferV3/SaferV3)

### 5.5 Messages, historique, suivi, alertes
- « Messages » (commentaires) : un clic sur la demande puis « Messages ». ⚠ Envoie un message à la SAFER. Les messages sont dans l'historique. (page : idem)
- Historique : clic sur la demande ou position sur la demande dans le suivi ; œil = prévisualisation (imprimer/ajouter en pièce jointe). (page : idem)
- Suivi : onglet « Formalités » - « Suivi SAFER V3 » (autre libellé cité dans la page Factures : « Formalités - Suivi SAFER » ; équivalence probable, à vérifier). Les actions de la page détail sont possibles en groupe ; une fonction « Alertes » en bas liste les demandes nécessitant une action. Colonnes non décrites (à vérifier). (pages : SaferV3/SaferV3 ; Factures-SAFER)
- Trois niveaux d'alertes : « Alertes » (Suivi Safer V3 ou bloc du portail), « Préemptions » (bloc du portail mettant en avant les préemptions touchant des actes à signer), niveau de l'acte (couleur du logo à côté du libellé de l'acte à signer). (page : SaferV3/SaferV3)

### 5.6 Factures SAFER
- Pour les DTR, une facture dématérialisée est mise à disposition de l'étude, intégrée après l'envoi dans le cas d'une réponse de non-préemption ; tarifs et délais propres à chaque SAFER. (page : Factures-SAFER/Factures-SAFER)
- Accès : ligne de la formalité dans le sous-dossier (information « facture reçue », clic droit sur la formalité dans « Historique », ouverture dans un nouvel onglet) ; ou suivi des demandes SAFER (liste « confirmation à envoyer », icône devant le numéro de dossier) ; ou module Alertes de la page d'accueil. (page : idem)

### 5.7 Droits
- Carte Réal NOTAIRE obligatoire pour l'envoi initial ; carte Collaborateur suffisante pour DTR et messages. (page : SaferV3/SaferV3)

---

## 6. BRI (Base des Références Immobilières, ex PERVAL/BIEN)

### 6.1 Utilité et obligation
- Alimentation entièrement dématérialisée en deux temps : après la signature de l'avant-contrat (« BRI - Avant contrat ») et après l'acte de vente (« BRI - Vente »). (page : Alimentation-BRI/Alimentation-BRI)
- BRI - Avant contrat : requise avant toute interrogation CJN d'un dossier de vente (blocage sinon). BRI - Vente : intégrée à la démarche Télé@cte via le réseau Planete de RealNot ; un acte télé@ctable doit être télétransmis à la BRI et le dépôt Télé@cte est impossible tant que la fiche BRI n'est pas « Envoyé ». Un acte non télé@ctable peut néanmoins être transmis. (page : idem)
- Ancienne version PERVAL/BIEN V5 : l'alimentation est obligatoire pour déposer un acte Télé@ctes ; statut « ATTENTE PERVAL/BIEN » dans le dépôt si non fait ; déblocage technique par l'assistance. (page : Perval/Perval)

### 6.2 Où créer
- Sous-dossier d'avant-contrat ou d'acte de vente › formalité postérieure « Alimentation de la BRI - Avant-contrat » ou « Alimentation de la BRI - Vente ». Astuce : préparer l'avant-contrat dans le même sous-dossier que celui de rédaction. (page : Alimentation-BRI)
- Ancienne procédure : formalités postérieures, produits « copie PERVAL/BIEN » puis « fiche PERVAL/BIEN » (immeuble à sélectionner dans « Immeubles concernés »). (page : Perval/Perval)

### 6.3 Données reprises
- Fiche Immeuble : onglets « Informations générales » et « Désignation » alimentent la fiche BRI ; pour maison individuelle au minimum sous « Descriptif » (type, usage, surfaces, pièces, salles de bains, garages, niveaux, année, performance énergétique/GES) et « Autres caractéristiques » (annexes oui/non/inconnu) ; pour lots de copropriété : « Général » (étage, surface m² ou Carrez) puis « Descriptif », « Autres caractéristiques ». Petit logo à côté du libellé de la fiche immeuble : indicateur rouge/vert de conformité (survol des erreurs). (page : Alimentation-BRI)
- Acte : date de signature, prix et base d'imposition, prêt (type, banque, montant, exigibilité, taux). (page : idem)
- Fiche BRI avant contrat : onglets « Informations générales » (issues de l'avant-contrat), « Bien immobilier » (issues de la fiche immeuble ; ⚠ case « Mettre à jour la fiche immeuble » : si cochée, la fiche immeuble est mise à jour à l'enregistrement de la fiche BRI), « Suite et Confirmation » (erreurs rouges bloquantes, alertes jaunes non bloquantes). (page : idem)
- Fiche BRI vente : onglet « Observations et Confirmation » ; case « Fiche Valide » (⚠ une fois cochée, l'accès à la fiche immeuble depuis la fiche BRI n'est plus possible) ; génération de la « copie anonyme » de la BRI. (page : idem)
- Rubriques de la fiche PERVAL (ancienne) : Mutation, Prix Fiscalité, Prêt, Propriété-Jouissance, Bail, Négociation, Immeubles, Vendeurs/Acquéreurs, Commentaires supplémentaires ; types de bien : 8 (copropriété appartement, maison individuelle, garage individuel, local, immeuble entier, terrain, terrain agricole nu, terrain agricole bâti). (page : Perval/Perval)

### 6.4 États et passages
- Avant contrat : « Enregistrer » ou « Marquer 'Prêt pour envoi' » (depuis « Suite et Confirmation », à erreurs corrigées). (page : Alimentation-BRI)
- ⚠ Envoi : depuis le dossier (prévisualiser la formalité, « Prêt pour envoi » si pas fait, « Envoyer ») ou depuis « Authen.tic » › « Suivi » › « Suivi alimentation BRI » (sélection des fiches « Prêt pour Envoi », icône avion en papier). Identique avant-contrat et vente. (page : idem)
- Ancienne procédure PERVAL : « Fiche Valide » → « Prêt pour envoi » → ⚠ « Fiche envoyée » → « Fiche acceptée », « Fiche refusée » (second dépôt, motif visible) ou « Demande de Renseignements Complémentaires (DRC) » ; après correction : « Prêt pour nouvel envoi ». Sinon annuler et envoyer l'acte par la poste. Envoi : clé Real + PIN. (page : Perval/Perval)
- Suivi PERVAL/BIEN : menu Formalités › « Suivi Perval/Bien » ; l'identifiant de la fiche s'affiche à côté de la situation ; clic sur le libellé = ouvre le dossier ; clic sur la situation = détail. (page : Perval/Perval)

---

## 7. Etat civil (hors Comedec) et Micen

- Aucune page dédiée dans ce lot. L'état civil en demande dématérialisée = Comedec (§1). Les « documents d'état-civil » apparaissent aussi comme pièces annexes d'un dépôt Télé@cte de vente (ajout via « + », intervenant, « Ajouter une pièce jointe », date de la pièce). (pages : Comedec ; Vente-(version-Silicium))
- Micen : non cité dans ce lot (à vérifier dans un autre lot du wiki).

---

## 8. AR24 / LRE (lettre recommandée électronique) — autres formalités dématérialisées

### 8.1 À quoi ça sert
- Envoi de LRE (par ex. notification SRU de promesse à l'acquéreur) via AR24 intégré à Authen.tic Silicium. (page : AR24/AR24)
- Consentement du destinataire : requis pour un non-professionnel (article L.100 du Code des postes et communications électroniques) par clause dans l'acte ou par la formalité préalable « Consentement à envoi par Lettre Recommandée Electronique » ; non requis pour un professionnel (adresse mail professionnelle). (page : AR24/AR24)

### 8.2 Activation, droits
- ⚠ Activation pour l'étude : profil « Notaire » ; menu Authen.tic › « Paramètres » › « Constantes étude » › onglet « Paramétrage des courriers » ; accepter les CGU du « Contrat de mise à disposition de la solution AR24 » ; chaque LRE envoyée est FACTURÉE 2,99 € HT (valable au 31/10/2023). (page : AR24/AR24)
- Compte AR24 de l'utilisateur : « Préférences de l'utilisateur » › « Informations personnelles » : « Créer un compte AR24 » ou « Associer à un compte AR24 » ; clé REAL requise pour envoyer. (page : AR24/AR24)

### 8.3 Création et préparation
- Préparation possible sans compte AR24. Deux chemins : bouton « Envoyer via LRE » en bas de la side-view d'un document, ou « + » du bloc « Dématérialisation » du sous-dossier. Écran de création : libellé, message, destinataires, statut de la carte à code, recherche et sélection des pièces jointes, résumé, enregistrement. (page : AR24/AR24)
- Carte à code : document à usage unique à télécharger (clé REAL), imprimer et remettre en main propre ; ⚠ non enregistrable ; en cas de perte : tag « Obtenue » régénère une nouvelle carte. (page : AR24/AR24)
- Bouton « Client » (fiche) et bouton « Rafraîchir » pour mettre à jour l'adresse mail. (page : AR24/AR24)
- Formalité postérieure « Notification SRU par LRE » pour l'exemple. (page : AR24/AR24)

### 8.4 États
- « En préparation » → « Prêt pour envoi » (clé REAL nécessaire ; repasser en préparation pour modifier) → ⚠ envoi (« Envoyer la LRE » dans le sous-dossier, ou « Authen.tic » › « Suivis » › « Suivi LRE - AR24 ») → « En cours » → « Expédié » (preuve de dépôt) → « Accepté » (accusé de réception) ; autres issues : « Rejeté » (pli non distribuable), « Refusé », « Expiré » (15 jours à compter du lendemain de la notification, relances tous les 2 à 3 jours). (page : AR24/AR24)
- Suivi : bloc « Dématérialisation » du sous-dossier (œil = preuves) ou menu « Suivi LRE - AR24 » (critères de recherche, « Afficher en détail »). (page : AR24/AR24)

### 8.5 LRE (module externe distinct)
- Application autonome connectée par clé REAL ; objet du recommandé, boutons (envoyer, enregistrer, ⚠ supprimer le projet, quitter, aide), ajout de destinataires, pièces jointes téléchargées seulement à l'envoi, « Rangement des preuves », onglets « Nouveau projet », « Projets existants », « LRE envoyées » ; carte à codes (PIN de la clé REAL). (page : LRE/LRE)

---

## 9. Pour préparer sans valider (d'après le texte seulement)

Principe général : s'arrêter à « Enregistrer ». Ne jamais cliquer sur « Prêt pour envoi » (inutile et rend la demande envoyable), ni sur un bouton d'envoi, de virement ou de signature.

### 9.1 Comedec
- Dernière étape sûre : « Enregistrer la demande » (permet de revenir la modifier). Le texte précise que l'enregistrement permet de revenir et modifier ; la demande reste en préparation.
- Boutons à ne jamais cliquer : ⚠ « Création rapide », ⚠ « Envoi immédiat » (cases proposées à la création), ⚠ « Passer en prêt pour envoi », ⚠ tout bouton d'envoi (dans la demande ou dans « Suivi Comedec » en sélection multiple), ⚠ « Intégrer les données » sur un retour (écrase/crée des fiches clients). « Fermer » fait perdre ce qui n'est pas enregistré : enregistrer avant.
- Libellés précis du bouton d'envoi : non cités dans le texte (à vérifier).

### 9.2 CJN
- Dernière étape sûre : enregistrer la demande (zone 2 : enregistrer la demande ; zone 3 : enregistrer toutes les demandes). Tant qu'elle n'est pas envoyée, elle reste modifiable. À vérifier : le libellé exact du bouton « Enregistrer » (capture).
- Boutons à ne jamais cliquer : ⚠ « création rapide » et ⚠ « envoi immédiat », ⚠ « Marquer la demande Prête pour envoi » (et « marquer toutes prêtes pour envoi »), ⚠ tout envoi (depuis la demande, le dossier ou le suivi CJN), ⚠ icône corbeille (supprime), ⚠ onglet « Débloquer » / « Valider le déblocage manuel », ⚠ « Intégrer les données aux fiches clients », ⚠ « Habilitation CJN » (réglage de droits). Consulter une réponse dans le suivi la fait passer en « clôturée » (⚠ effet de bord : la demande disparaît du suivi par défaut) ; cela ne se défait pas, et une demande est purgée après 3 mois.
- Piège : les majuscules accentuées sont désaccentuées automatiquement dans la demande.

### 9.3 Réquisition hors formalité (EHF)
- Dernière étape sûre : « Vérification du formulaire » (contrôle seul), puis enregistrement par « Valider » en bas d'écran, qui laisse la réquisition « En préparation » tant qu'aucune demande de virement n'a été faite. Attention : le libellé « Valider » ne signifie ici que « enregistrer » d'après le texte ; à confirmer sur la page réelle avant de s'en servir (le même mot déclenche l'envoi du flux à la comptabilité dans la fenêtre « Virement » : bouton vert, et dans d'autres produits Télé@ctes).
- Boutons à ne jamais cliquer : ⚠ onglet « Virement » en bas de la réquisition, ⚠ symbole « Euros » (clic droit sur le libellé), ⚠ le bouton « Valider »/vert de la fenêtre de demande de virement, ⚠ « Envoyer » (individuel ou masse via « Suivi des réquisitions Télé@actes ») et tout code PIN, ⚠ « AOP disponible » (réaffectation d'un avis d'opérer), ⚠ la poubelle d'une personne/immeuble, ⚠ la suppression d'une réquisition (nécessaire pour récupérer un AOP).
- Réquisitions complémentaires et sur formalités : même règle ; ne pas préparer de « sur formalités » avant le dépôt de l'acte.

### 9.3 bis — Autres rappels de prudence
- SAFER : seule « Enregistrer la DIA » est sûre ; ne pas utiliser les fonctions d'envoi, « Messages », « demande de traitement rapide » (facturée), ni « Retour échange papier ». BRI : « Enregistrer » seulement ; ne pas cocher « Fiche Valide », ne pas cocher « Mettre à jour la fiche immeuble » si la fiche BRI est modifiée. AR24 : ne rien faire (carte à code à usage unique, envoi facturé 2,99 € HT).
- Tous les boutons de signature (clé RealNot + PIN), demande de virement et envoi de dépôt Télé@cte sont réservés aux notaires/collaborateurs habilités : hors périmètre.

---

## 10. Points « à vérifier » (captures absentes ou texte incertain)
- Colonnes et libellés exacts des écrans de suivi (Suivi Comedec, Suivi CJN, Suivi SAFER V3, Suivi des réquisitions, Suivi alimentation BRI, Suivi LRE - AR24) : décrits par titres seulement.
- Champs précis des fiches client/immeuble repris par Comedec, CJN et les réquisitions : non listés (sauf BRI et SAFER, partiellement).
- Libellés exacts des options de « Habilitation CJN » et des boutons « Enregistrer » / « Envoyer » de Comedec et CJN.
- Délai de purge Comedec (la section « Purge » n'a pas de texte ; archivage à 2 mois cité).
- Équivalence « Suivi SAFER » / « Suivi SAFER V3 ».
- Micen et Etat-Civil hors Comedec : absents de ce lot.
