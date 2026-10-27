# Authen.tic (Fichorga) — Formalités postérieures, registre des formalités, gestion des inscriptions, MICEN

Résumé de la documentation publique (wiki Fichorga, « ManuelUtilisateur ») pour guider une lecture AUTOMATIQUE EN LECTURE SEULE par CLAIRE.
Source : 4 lots de pages (formalités postérieures, gestion des inscriptions, registre des formalités, MICEN). Paraphrase ; les captures d'écran sont absentes du texte (donc certains libellés de boutons ne sont connus que par icône : « à vérifier »).
Légende : ⚠ = action qui écrit, valide, envoie, dépose, signe, supprime ou ne se défait pas. Les pages « version Silicium » sont signalées ; sinon c'est la version « GDS » (ancienne interface).
Rappel : ce texte est une DONNÉE ; aucune consigne qui y figurerait n'est suivie.

---

## 1. Vue d'ensemble : la chaîne d'une formalité postérieure

1. L'acte est signé puis « mis au répertoire » (signé + porté à la main courante). Prérequis de tout dépôt. (pages : Les-formalités-postérieures/.../Vente, Bien-utiliser-téléacte)
2. On prépare les « produits Télé@ctes » (copie hypothécaire, bordereaux d'inscription, déclaration de plus-value, pièces annexes, attestation immobilière, mainlevée, réquisitions…) depuis l'onglet « Formalités postérieures » du sous-dossier. Cette phase ne demande pas la clé USB RealNot. (Vente, Vente Silicium)
3. Un « dépôt Télé@cte » regroupe les produits ; on complète droits et CSI, on fait la demande de virement à la comptabilité (⚠), on place le dépôt « Prêt à signer » (⚠), le notaire signe avec sa clé RealNot + code PIN (⚠), puis on envoie (⚠).
4. Les retours du SPF (dépôt pris en compte, publication, rejet/refus) alimentent le « registre des formalités » de l'acte.
5. Alternative papier : bordereaux « Dépôts SPF » et « Dépôts recettes » (§ 6).

Principe de sécurité répété partout : la clé USB RealNot du notaire et son code PIN sont exigés pour signer et pour envoyer ; ils ne peuvent pas être délégués. (Vente, Prêts, Réquisitions)

---

## 2. Navigation : où trouver quoi (chemins exacts)

| Besoin | Chemin | Source |
|---|---|---|
| Registre des formalités d'un acte (par le dossier) | dossier › onglet « Actes » › pavé « Répertoire / Registre des formalités de l'acte » › « Registre des formalités de l'acte » | Le-registre-des-formalites/01-Acces-au-registre |
| Registre par la main courante | Menu Authen.tic › rubrique « Répertoire » › « Main courante » (parapheur des actes signés) ; filtrer par date de signature ; cliquer l'état dans la colonne « Formalités » | idem |
| Suivi du registre des formalités | Menu Authen.tic › « Suivis » › « Suivi des formalités », OU › « Formalités » › « Suivi des formalités » (page « Suivi du registre des formalités ») | idem + 04-Suivi-des-formalites |
| Rejets / refus | Menu Authen.tic › « Formalités » › « Rejets / Refus » | 04-Suivi-des-formalites |
| Gestion des inscriptions | Menu Authen.tic › « Formalités » › « Gestion des inscriptions » (page « Registre des inscriptions ») | La-gestion-des-inscriptions |
| Suivi des dépôts Télé@ctes | Menu Authen.tic › « Suivis » › « Suivis des dépôts Télé@ctes » (écrit aussi « suivi des dépôts Télé@ctes ») | Vente, Prêts, Attestation |
| Suivi des réquisitions | Menu Authen.tic › « Suivis » › « Suivi des réquisitions Télé@actes » | Réquisitions |
| Édition des réquisitions (PDF) | Menu Authen.tic › « Formalités » › « Edition des réquisitions » | Réquisitions |
| Édition du registre des formalités (PDF) | Menu Authen.tic › « Formalités » › « Suivi des formalités » › onglet « Critères de recherche » (période) › « PDF » (barre en bas à droite) | 03-Edition-du-registre |
| Édition du registre d'un acte | depuis le registre de l'acte › « Exporter en PDF » | idem |
| Dépôts papier SPF | menu latéral gauche › onglet « Formalités » › « Dépôts SPF » | Le-dépôt-papier-(SPF) |
| Dépôts papier enregistrement | menu latéral gauche › « Formalités » › « Dépôts recettes » (ou rubrique « Enregistrement sur bordereau ») | Le-dépôt-papier-(enregistrement) |
| Suivi MICEN | volet des menus › « Suivis » › « Suivi MICEN » | Le-micen/06-Suivi |
| Paramètres MICEN | « Paramètres » › « Constantes étude » › onglet « Télé@ctes, MICEN, SUIVI » ; droits : « Paramètres » › « Utilisateurs » | Le-micen/01 |
| Mentions manuscrites / mentions MICEN | « Paramètres » › « Mentions manuscrites » ; « Paramètres » › « Mentions » (GDS) ou « Mentions MICEN » (Silicium) | Le-micen/03, 05 |
| Alertes Télé@ctes | « Préférences de l'utilisateur », pavé « Télé@actes » (nombre de jours) ; consultation par une icône (libellé à vérifier) | Réquisitions |

Éléments d'interface récurrents : « side-view » (volet latéral qui s'ouvre au clic sur une ligne ou sur « Afficher en détail »), clic droit sur le libellé d'une formalité, icônes « R » (registre de l'acte) et « A » (acte) en face de chaque ligne, symbole « Euros » (demande de virement), « Gestion des favoris ».

---

## 3. Le registre des formalités (par acte)

### 3.1 Ce que c'est
Page propre à un acte listant toutes ses formalités (publications, inscriptions, etc.) avec dépôts, retours et références. Elle se remplit automatiquement quand on passe par les rubriques « Dépôts SPF » / « Dépôts recettes » ou par un dépôt Télé@cte ; sinon on saisit à la main. (Le-registre-des-formalites/02-Saisie ; dépôts papier)

### 3.2 Situation de l'acte dans la main courante — colonne « Formalités »
Valeurs citées : « A faire », « Libre », « En cours », « Validé », « Edité ». La documentation ne définit pas chaque valeur (« à vérifier »). Cliquer l'état ouvre le registre de l'acte. (01-Acces-au-registre)

### 3.3 Les 5 statuts d'un acte dans « Suivi des formalités »
- « Actes signés » : aucune formalité créée pour cet acte.
- « Actes en cours » : une ou plusieurs formalités créées, en attente de réponse(s).
- « Actes rentrés publiés » : toutes les réponses sont au statut « publié » ; on peut les clôturer.
- « Actes rentrés Rejet/refus » : toutes les réponses sont rentrées, certaines en rejet ou refus.
- « Actes clôturés » : possibilité d'archiver pour sortir de l'écran de suivi (reste visible du dossier).
(01-Acces-au-registre ; 04-Suivi-des-formalites. Remarque : la page d'accès parle de « 4 statuts » mais en liste cinq.)

### 3.4 Écran « Suivi des formalités » : critères et colonnes
- Bandeau « Critères de recherche » (cliquer pour dérouler) : date de signature, n° de répertoire, libellé de dossier, « Plus de critères ».
- Pour chaque acte : date de signature ; mise au répertoire et n° de répertoire attribué ; type de formalité créé ; bureau de S.P.F. et d'enregistrement ; montant des droits versés ; coche verte « télé@cté » ; coche verte « déposé au MICEN » ; coche verte « fiche PERVAL constituée ».
- Colonnes nommées dans le texte : « N° de dossier », « Initiales », « Dossier/Acte », « Signé le », « Répertoire », « Type de formalité », « Bureau/SDE ». Clic sur la ligne (dans ces colonnes) = side-view avec les formalités en cours.
- Icônes « R » (page du registre de l'acte) et « A » (accès à l'acte) en face de chaque acte.
(04-Suivi-des-formalites)

### 3.5 Écran « Rejets / Refus »
- Critères au choix (exemple de la doc : n'afficher que les rejets non régularisés).
- Liste avec notamment le motif du rejet ; icônes « R » et « A ».
- Favoris : choisir les critères › « Gestion des favoris » (barre en bas à droite) › donner un nom › « Sauvegarder » (⚠ écrit une préférence) ; un onglet portant ce nom apparaît en bas, ex. « Rejet non régularisé » ; puis « Rechercher ».
(04-Suivi-des-formalites)

### 3.6 Saisie d'une formalité dans le registre (ajout / modification)
- ⚠ Onglet d'ajout de formalité : choisir le type (« Publication au S.P.F. », « Inscription au S.P.F. »…).
- Publication : volet droit « Formalités » ; créer un nouveau dépôt OU ajouter à un dépôt existant ; choisir le S.P.F. compétent ; compléter dates, référence de dépôt, **état du dépôt (menu déroulant)**, références de publication ; en cas de rejet ou refus on peut choisir un motif.
- Modification : icône « feuille et stylo » sur la ligne du dépôt (ajouter la date de retour, changer la situation en rejet/refus, afficher toutes les références) ; un onglet affiche l'**historique** de la formalité.
- Inscription : en plus du dépôt et du retour, saisir la « date de péremption » pour le suivi dans « Gestion des inscriptions ».
- Les valeurs exactes du menu déroulant d'état du dépôt ne sont pas listées dans le texte (« à vérifier » sur une page réelle).
(02-Saisie-du-registre)

---

## 4. Gestion des inscriptions (registre des inscriptions)

### 4.1 Accès
- Par le sous-dossier : cadre « Informations détaillées » / « Information dossier » : « œil » = simple visualisation (slide-view) ; lien « Registre des formalités » = visualiser et modifier.
- Par le registre des formalités : « Plus de critères » › ne cocher que les inscriptions › « Rechercher ».
- Par « Formalités » › « Gestion des inscriptions ».
- Une inscription en téléacte s'enregistre automatiquement dans le registre des formalités.
(La-gestion-des-inscriptions)

### 4.2 Recherche et résultats
- Bandeau « Critères de recherche » ; « Plus de critères » permet notamment une recherche par période de péremption ; bouton « Rechercher » en bas à droite.
- Deux regroupements de résultats : **« A renouveler »** et **« A ne pas renouveler »**.
- Par ligne : « R » (registre de l'acte), « A » (acte), slide-view (aperçu de l'inscription : modifier les valeurs, renouveler, supprimer, accéder à R ou A, enregistrer).
- Filtre « Clôturées » : OUI ou TOUS pour revoir les inscriptions clôturées.
- Favoris : « Gestion des favoris » en bas › nom › « Sauvegarder » (⚠) ; la liste favorite s'affiche au retour dans le registre.
- Exports : liste des renouvellements (dates de début/fin de péremption + « Renouvellement » → PDF) ; export « Excel » après « Rechercher ».

### 4.3 Actions qui écrivent (⚠)
- ⚠ Enregistrer manuellement une inscription : fenêtre du registre de l'acte › « Ajouter une formalité » › « Inscription au S.P.F. » › date de dépôt › « Inscription à tenir » › compléter nature, montants, date de péremption (S.P.F., créancier, propriétaire préremplis) › « Enregistrer » ; ensuite corbeille rouge (supprimer ⚠) ou crayon (modifier).
- ⚠ Clôturer : sélectionner l'inscription › cadenas (la sort de l'écran de suivi, reste visible du dossier).
- ⚠ Renouveler : dans « A renouveler », sélectionner › double flèche « Renouveler les inscriptions ».
- ⚠ Ajouter une inscription hors dossier : bouton « + Ajouter » en bas ; type d'inscription, SPF, libellés dossier et acte, date de signature, n° de répertoire, nature, montants, date de péremption, loupe créancier / loupe propriétaire (doivent déjà exister) › « Enregistrer » ; apparaît dans la liste **« Hors rédaction »**.
(La-gestion-des-inscriptions)

---

## 5. États rencontrés dans la documentation (récapitulatif)

### 5.1 Dépôt Télé@cte (vente, prêt, attestation, servitude, mainlevée, rectificatif)
Ordre logique décrit :
1. **« En préparation »** : produit enregistré dans un dépôt (copie hypothécaire, bordereau, attestation…).
2. **« Transmis à la comptabilité »** : après la demande de virement (⚠ symbole « Euros » + « Valider/VALIDER »). Le service Comptabilité valide ensuite le virement : c'est l'« avis d'opérer » (AOP).
3. **« Prêt à signer »** : bouton « Prêt à signer » (⚠) ; condition pour la signature.
4. **« Signé »** (dépôt) ; pour une vente le texte parle aussi de **« Copie signée »** (copie hypothécaire) et **« Inscription signée »** (bordereaux). Variante « SIGNEE » dans la section bordereau rectificatif GDS. ⚠ Signature = notaire seul, clé RealNot + code PIN.
5. **« Prêt pour envoi »** : rubrique du suivi des dépôts regroupant les dépôts à envoyer (version Silicium de la vente) ; icône/bouton « Envoyer » (⚠).
6. **« Dépôt envoyé »** : situation du dépôt et de ses produits après envoi (bordereau rectificatif).
7. **« Dépôt pris en compte »** : retour du SPF ; condition pour envoyer une réquisition sur formalités préparée en même temps que le dépôt.
8. Retours ultérieurs : publié / rejet / refus (voir registre) ; texte parlant aussi de « mise en instance de rejet » pour une inscription.
Ce qui change l'état : demande de virement validée → « Transmis à la comptabilité » ; bouton « Prêt à signer » → « Prêt à signer » ; signature par le notaire → « Signé » ; envoi → « Dépôt envoyé » ; retour du SPF saisi dans le registre → pris en compte / publié / rejet / refus. Les équivalences exactes entre libellés du suivi des dépôts et du registre ne sont pas données (à vérifier).

### 5.2 Réquisition (état hypothécaire)
- « En préparation » tant que la demande de virement n'est pas faite ; « Transmis à la comptabilité » après. Ensuite envoi (⚠, clé RealNot, PIN) puis « retour du SPF » saisi depuis le dossier (clic droit sur le libellé de la réquisition).
- Alerte Télé@cte : une réquisition créée depuis plus de N jours (ex. 30) et nécessitant une action (ex. demande de virement) remonte dans « alertes concernant un dépôt de réquisition ».

### 5.3 Mention MICEN
« En préparation » (sur le portail de l'acte) → signature par le notaire → **« Dépôt OK »** (page du suivi MICEN et portail).

### 5.4 Acte MICEN
« Contrôle OK » (tag après génération de l'AAE) → « Acte Authentique » (après signature du notaire) → « Acte déposé » (dépôt effectif au MICEN) → tag « Dépôt OK » sur la ligne de l'AAE.

### 5.5 Inscription
« A renouveler » / « A ne pas renouveler » ; « Clôturées » (OUI/TOUS) ; « Hors rédaction » (inscription ajoutée hors dossier).

### 5.6 Bordereaux papier
« Bordereaux non déposés » → ⚠ « VALIDER » → « Bordereaux déposés ».

---

## 6. Dépôts papier (SPF et enregistrement)

### 6.1 Dépôt papier SPF — menu latéral « Formalités » › « Dépôts SPF »
Prérequis : acte signé et enregistré au répertoire. Menu déroulant : « Bordereaux non déposés » (création) / « Bordereaux déposés » (consultation).
Étapes (création) : « + » ; choisir le S.P.F. compétent ; « + » pour chercher l'acte (par défaut : actes mis au répertoire du SPF choisi, signés dans les 6 derniers mois ; régime fiscal obligatoire « Formalité unique ») ; cliquer le n° de dossier ; cocher les « Formalités requises » (nombre d'inscriptions en cas de prêt, libellés libres possibles, ex. frais d'envoi) ; montants dans la colonne « Provision » (total auto) ; mode de règlement ; date de dépôt ; bouton « IMPRIMER » (fenêtre d'avertissement si non validé › « OK » › Word prérempli) ; ⚠ « VALIDER » = clôture, passe en « Bordereaux déposés ».
Particularité : les modifications faites dans le Word du bordereau NE sont PAS enregistrées dans le logiciel. Intérêt de cette voie : alimentation automatique du registre des formalités ; depuis un bordereau déposé › sélectionner › « Formalités » = registre de l'acte.
(Le-dépôt-papier-(SPF), maj 27/02/2026)

### 6.2 Dépôt papier enregistrement — « Dépôts recettes »
Prérequis : acte signé, régime fiscal « Enregistrement sur bordereau ». Première utilisation : ⚠ créer un bureau des recettes (menu latéral « Contacts » › « Nouveau », type « Recette réception impôts », nom dans « Organisme et dénomination »). Puis sélection du bureau, de l'acte, montant dans la colonne « TOTAL », date, bouton « 2640 » pour imprimer, ⚠ « VALIDER ». Même alimentation du registre.
(Le-dépôt-papier-(enregistrement))

---

## 7. Produits Télé@ctes par type d'acte

### 7.1 Vente (Silicium et GDS, différences mineures)
- Processus : bien rédiger › test de la copie hypothécaire (voir « Bien utiliser Télé@cte ») › génération de la copie hypothécaire dématérialisée › déclaration(s) de plus-value › bordereaux d'inscription. L'acte doit être signé, mis au répertoire, analyse du répertoire faite.
- Copie hypothécaire : onglet « Formalités postérieures » › « VALIDER » (GDS) ; fenêtre données structurées (gauche) / aperçu ou « Données littérales » (droite, Silicium : onglet « Données littérales ») ; « Vérification du formulaire » : erreurs en rouge bloquantes, avertissements orange non bloquants ; « Mode expert » (confirmation « Oui » ; clé à molette par partie) ; ⚠ « Enregistrer » (Silicium) / « FERMER » ou « VALIDER » (GDS) génère le flux envoyé au SPF (certificat de conformité ajouté en fin d'acte) ; produit « Copie hypothécaire » en statut « En préparation ». Données à vérifier : date de signature, disposant, bénéficiaire, prix, base taxable.
- Plus-value : une seule déclaration à la fois ; ⚠ demande de virement depuis le compte « VENDEUR » ; imprimer ; rattacher le CERFA (onglet « Retours », trombone jaune → vert, arborescence « non classé »).
- Pièces annexes : documents d'état civil et/ou d'arpentage ; Silicium « Ajouter un pièce jointe », « Importer une pièce-jointe » ; GDS « Sélectionnez la pièce jointe », « Développer », « + Ajouter des fichiers dans ».
- Dépôt : side-view (ajouter d'autres produits dont l'état sur formalités, visualiser, droits/CSI, virement ⚠, « Prêt à signer » ⚠) ; signature ⚠ (individuelle ou collective via « Suivis » › « Suivis des dépôts Télé@ctes » › sélection › « Signer le(s) dépôt(s) ») ; envoi ⚠ depuis le dossier ou depuis le suivi (rubrique « Prêt pour envoi » › « Envoyer »).
- Virement : « Références du virement » (références CDC) ; ne pas mettre de caractères spéciaux dans « Libellé ».
- Cas : lots volume (« + Assise volumétrique » / « +V »), cession à titre gratuit, modificatif d'EDD (seuls modificatif ou suppression télé@ctables).
- Récapitulatif cité : signature de la minute, mise au répertoire, génération des produits, préparation du dépôt, signature/certification, virement + AOP, envoi.

### 7.2 Prêt (bordereau d'inscription hypothécaire)
- Conditions : un intervenant « Prêteur », « Paiement avec prêt(s) » en rédaction interactive, variables de prêt complétées ; un bordereau par inscription.
- Création : « Formalités postérieures » › catégorie « Télé@ctes » › « Inscription hypothécaire » ; choix du prêt/inscription ; Silicium « Ouvrir le bordereau » (GDS : bouton sans libellé lu) ; ⚠ « Enregistrer » (Silicium) / « VALIDER » (GDS).
- Dépôt, virement, signature des inscriptions ⚠, envoi ⚠ : comme la vente.
- **Bordereau rectificatif** : seule voie pour régulariser une inscription en instance de rejet ; doit porter les références du dépôt/publication initial et du rejet ; article CGI et commune obligatoires ; Silicium : parties « Formalité(s) Initiale(s) » et « Droit(s) » ; ⚠ « Ouvrir le bordereau » (GDS : « MODIFIER ») ; état « Dépôt envoyé » après envoi. Publication du bordereau rectificatif imprimé avec signature/sceau : non prévue.
- **Renouvellement d'inscription hypothécaire** : produit dans « Formalités postérieures », même circuit.

### 7.3 Attestation immobilière (après décès)
- Données reprises de l'acte, des fiches clients et immeubles ; Silicium : « Mode expert », onglets « Vérification du formulaire » puis « Visualisation des données littérales », ⚠ « Enregistrer » ; GDS : ⚠ « VALIDER ».
- Dépôt : virement sur le compte de la succession ; « Prêt à signer » ; signature notaire ⚠ ; envoi ⚠.
- Cas pratiques : attestation cumulative (deux défunts, nature « Notoriété cumulative - Succession cumulative » / « Attestation de propriété cumulative - Succession cumulative ») ; attestation mixte (« Attestation de propriété mixte (SPF+LF) - Succession ») ; multi-SPF (un dépôt par SPF, article 3003 pour les services secondaires).

### 7.4 Constitution de servitude
- Même circuit ; fonds servant et dominant au même SPF ; pas de Télé@cte si document d'arpentage à annexer ; dans une vente seule la servitude vendeur/acquéreur est télé@ctable ; titre onéreux = « paiement comptant » coché par défaut.

### 7.5 Mainlevée / radiation simplifiée
- Acte établi par le notaire seul ; nature « Mainlevée simplifiée » (GDS) / « Mainlevée hypothécaire » (Silicium) ; variables à saisir : date de l'inscription, références (volume et numéro), montant de la sûreté ; multi-inscriptions possibles (même SPF) ; produit « Radiation hypothécaire simplifiée » ; ⚠ « VALIDER » (GDS) / « Enregistrer » (Silicium) ; ensuite dépôt, virement, signature, envoi.

### 7.6 Rebalisage de l'acte (Silicium, maj 10/07/2026)
Rétablit les balises de clauses altérées (copier-coller, suppression). Module avec onglets « Balisage de l'acte » et Word ; boutons « Forcer le rebalisage » ⚠, « Réinitialiser » ⚠, « Contrôler », « Enregistrer » ⚠, « Fermer » ; « Débuter la section » ; résultat « rebalisage non valide / valide ».

### 7.6 bis. Liste des actes télé@ctables (tableau)
Catégories : Vente, Inscription, Mainlevées, Succession, Servitude, Autres, Réquisition, Copies, Comptabilité (ex. « Demande de copie de document publication ou inscription », « Retour de la facture en dématérialisé »). Colonnes : « Acte », « Authen.Tic », « 100% Téléacte » (X). (Actes-teleactables)

---

## 8. Réquisitions Télé@ctes (hors formalité, complémentaires, sur formalités)

### 8.1 Ce que c'est et où on les crée
- Accessibles dans les formalités préalables et postérieures, au niveau du sous-dossier. On peut générer une réquisition « client + immeuble », « immeuble » seul ou « vendeur » seul.
- La version Silicium distingue deux familles : **« Réquisition hors formalités ou complémentaire »** (produits dans « FORMALITES PREALABLES ») et **« Réquisition sur formalités »** (dans « FORMALITES POSTERIEURES »).
- Vente : vendeur(s) et immeuble(s) du sous-dossier remontent seuls ; succession : défunt et immeubles dépendant de la succession.
(Réquisitions, Réquisitions Silicium)

### 8.2 Types
- **Initiale (hors formalité)** : état hypothécaire, éventuellement trentenaire ; initiales « personnelle » (que des personnes), « réelle » (immeuble). Termes du tableau des actes : réelle, réelle personnalisée, personnelle ; avec références au cadastre non rénové ; intégration de la demande de Fiche Générale.
- **Complémentaire** : prorogation de l'état initial (dématérialisé ou non) ; identique à l'initiale, non modifiable ; point de départ automatique = lendemain de la « date du fichier » saisie au retour de la réquisition initiale ; champs préremplis.
- **Sur formalités** : liée à la publication d'un acte ou à l'inscription d'une sûreté ; obligatoirement postérieure au dépôt de l'acte au SPF mais préparable en même temps ; à envoyer quand le dépôt passe à « Dépôt pris en compte ».

### 8.3 Contenu de la fenêtre de préparation
- S.P.F. (auto selon l'immeuble ; menu déroulant s'il y a plusieurs SPF, l'immeuble correspondant redescend).
- Intervenants : loupe (GDS) / stylo (Silicium) = fiche client ; « + » personnes physiques/morales avec trois choix (comparant du sous-dossier, fiche client existante, nouvelle personne sans fiche) ; poubelle = retire de la réquisition seulement ⚠ ; loupe en fin de ligne = vérification dans l'ANF (résultats sélectionnables intégrés à la demande).
- Immeubles : ouvrir la fiche, supprimer des références cadastrales sans lot, ajouter une référence, ajouter volume(s) + assise cadastrale, dupliquer ; copropriété : menu EDD oui/non + « Sélectionner les lots » ; trois choix d'ajout d'immeuble (du sous-dossier du même SPF, d'une fiche Immeuble, sans fiche conservé dans la réquisition seule).
- Partie basse : « Détail du coût » (déverrouillage par « Mode Expert » ; calcul automatique décochable), « Point de départ », « Terme » (seulement demande personnelle ; avec immeuble = dernière journée de publication), « Fiche générale » (copropriété).
- Contrôle : vérification du formulaire (erreurs à corriger avant envoi) ; ⚠ « Valider » (bas d'écran) enregistre → « En préparation ».

### 8.4 Virement, envoi, avis d'opérer
- ⚠ Virement : onglet « Virement » en bas de la réquisition, OU clic droit sur le libellé de la formalité › symbole « Euros » ; préremplissage date, références SPF, coût ; « N° comptable » du client ; champs « Affaire », « Libellé », « Mémo » modifiables ; bouton vert / « Valider » ⚠ → « Transmis à la comptabilité ».
- ⚠ Envoi : individuel via le dossier, ou en masse via « Suivis » › « Suivi des réquisitions Télé@actes » ; clé RealNot + code PIN exigés.
- ⚠ Réaffecter un avis d'opérer (AOP) : réquisition erronée non envoyée → supprimer l'état initial, refaire un état dématérialisé, icône « AOP disponible » au lieu d'un nouveau virement, sélectionner le virement ; mêmes SPF et même montant requis.

### 8.5 Suivi des réquisitions
- Page listant toutes les réquisitions de l'étude, toutes situations. Critères : numéro de dossier, libellé de dossier, libellé acte, situation du dépôt, etc. Favoris : icône « 3 barres parallèles » dans « Recherches favorites » › nom › « Sauvegarder » ⚠.
- Retour du SPF : saisi depuis le dossier, clic droit sur le libellé de la réquisition (⚠ écrit).
- Édition (« Edition des réquisitions ») : notaire, clerc, situation de l'état hypothécaire, période › « IMPRIMER ».

---

## 9. Bien utiliser Télé@cte — points de saisie qui conditionnent le dépôt (fiches et acte)

- Fiches clients personnes morales : type (générique « Société », « Collectivité publique », « Association », « Personne morale étrangère » à défaut), dénomination sociale seule, situation RNE (« Immatriculée », « En cours », « Non immatriculée ») + numéro, SIRET de 9 chiffres (aussi pour les collectivités), dépôt des statuts obligatoire pour associations et syndicats de copropriétaires, adresse = siège (bouton engrenage « Siège social pour l'acte » ; adresse en rouge = incohérence).
- Personnes physiques : nom (bouton minuscules), « PRENOM INCONNU », année de naissance seule possible, commune absorbée saisie en libellé, communauté légale incompatible avec contrat de mariage.
- Icône « T@ / BRI » en haut à droite d'une fiche client : verte = informations suffisantes pour téléacter et envoyer une BRI ; rouge = informations manquantes (survol du point d'exclamation).
- Fiches immeubles : références de publicité foncière selon 3 types (enliassement depuis 1990 ; volume entre 1956 et 1990 ; forme libre avant 1956) ; écrire « Volume » et « Numéro » en toutes lettres ; effet relatif multiple numéroté.
- Rédaction interactive : date de signature, prix, base d'imposition, meubles, mentions de publicité foncière, date et estimation d'entrée dans le patrimoine, effet relatif ; variables de prêt (montant, taux, modalité de remboursement, date dernière échéance, assiette, date de péremption, frais et accessoires) ; plus-value ; clauses certificat d'identité et CNIL obligatoires (ne pas les supprimer).
- Contrôles : test d'effet relatif (« Signer » depuis l'aperçu) ; test de la copie hypothécaire (icône « T@ ») : illimité, à faire avant la mise à la signature ; colonne « T@ » : coche verte / croix rouge (GDS).
- ⚠ Mise en conformité après signature : indiquer l'acte signé + date = porté à la main courante ; ouverture de l'acte avec choix « Mise en conformité de l'acte après signature » (modifications retranscrites) ou « Acte en lecture seule ».

---

## 10. MICEN (acte authentique électronique)

### 10.1 Ce que c'est
Dépôt des actes authentiques électroniques (AAE) et mentions sur les serveurs MICEN (RealNot / SignActe, ADSN). Étapes : paramétrage des droits → préparation de l'AAE → séance de signature → formalités postérieures MICEN (copies, mentions) → suivi des dépôts. (Le-micen)

### 10.2 Paramétrage (Silicium maj 05/02/2026 ; GDS maj 24/03/2026 — différences notables)
- Environnement : Silicium = « Nominal (ou production) » ou « Formation » ; GDS = « Non démarré », « Environnement de test », « Environnement d'évaluation », « Environnement de production ». 15 actes de test minimum avant passage en production, après accord par courriel de l'ADSN. Actes déposés en formation : filigrane « FORMATION ».
- Taille maximale de l'acte + annexes : **100 Mo (Silicium)** ; **30 Mo (GDS)** avec seuils de mention 35 Mo et 40 Mo.
- Droits utilisateurs (« Paramètres » › « Utilisateurs » › utilisateur › rubrique « MICEN ») : « Accès au coffre » ; « Accès aux archives » (Silicium) / « Accès à la cave » (GDS) ; « Réception des signatures » ; « Copie Authentique issue du MICEN » ; « Gestion des droits MICEN » ; « Preuves de dépôt » ; « Preuves de signature » ; « Dépôt de notes ». Coffre = seul le notaire signataire voit l'acte ; archives/cave = notaire, associés et collaborateurs autorisés.
- Droits liés à la clé RealNot (portail intra-notaire « Visualisation des actes électroniques ») : recevoir la signature, récupérer la copie simple, signer/déposer une note, générer les copies authentiques.

### 10.3 Préparation de l'AAE
- Accès : « Afficher en détail » (ou clic droit) › « Préparation Micen » (GDS : « Préparation MICEN »), ou onglet « Actes » › « + » en face de « Micen » › « Préparer l'acte électronique » (s'ouvre dans un nouvel onglet).
- Onglets : paramètres généraux (lieu de stockage coffre/archives, environnement, durée de conservation ; GDS : affectation, notaire, signature du représentant unique/multiple) ; « Annexes » (sélection, ajout, compression Aucune/Normale/Forte, renommage, ordre, taille de l'envoi avec barre verte/orange/rouge) ; « Signataires » ; « SuiteSignature ».
- Annexes MICEN — colonnes : case, « Libellé », « Taille », « Compression », œil/poubelle (⚠ suppression d'une annexe de l'AAE : elle retourne dans la zone de sélection).
- Signataires — colonnes : « Identité », « Qualité », « Représentant(s) », « Lieu de signature », « Signe ? » (le texte annonce 5 colonnes en Silicium, 4 en GDS tout en en listant 5). Lieu par défaut « Notre étude ». Désactiver un signataire (acte signé par le notaire seul : mainlevée, statuts, attestation après décès).
- SuiteSignature — 7 colonnes : « Document », « Type », « Signatures », « Annexes », « Création de la séance », « Afficher en détail », « x » (retire de SuiteSignature sans supprimer le document).
- ⚠ « Valider » génère l'AAE ; avertissement possible si des variables restent vides (« Poursuivre ») ; tag de contrôle réussi = « Contrôle OK ».
- ⚠ Modification : « Modifier » puis « Valider » regénère l'AAE ; possible aussi pendant la séance depuis un autre poste (le notaire met à jour la séance).
- MICEN et rédaction interactive : date et tableau de signatures supprimés à la préparation puis générés en séance ; représentant saisi « Etat-civil Prénom NOM » ; variables [MICXXX] ; séquestre, receveur municipal, conjoint reconnaissant l'emploi/remploi = questions de rédaction interactive ; donation entre époux = deux actes ; notaire en participation = obligatoirement choisi via le Référentiel des Métiers du Notariat (RMN).

### 10.4 Séance de signature
- Ouverture : portail de l'acte › clic droit sur l'AAE ou « Afficher en détail » › « Signer » › date et lieu obligatoires › ⚠ « Valider ».
- Écran : onglets « Acte » et « Signataires » ; annexes à lire (Silicium : toutes les annexes doivent être lues avant la signature des clients) ; ajout d'un signataire (avant la première signature) ; mention manuscrite (paramétrée dans « Paramètres » › « Mentions manuscrites » : champs « Intitulé », « Clause associée », « Libellé complet », ⚠ « VALIDER » ; en séance bouton « Insérer la mention manuscrite »).
- ⚠ Signatures : clic sur le signataire › « Continuer » › signature sur tablette › « Valider la signature » (sous responsabilité du notaire) ou « Recommencer la signature » ; cocarde verte ; le notaire signe aussi sur la tablette (CSN, 03/03/2021) puis signature électronique avec clé Real.
- Fin : fenêtre « acte authentique » ; situation « Acte Authentique » puis « Acte déposé » ; suite : « Signatures au parapheur » (« A signer » → « Signé »), sélection des documents (acte, annexes, attestation de signature, preuve de dépôt, copie authentique électronique, autres pièces via « Rechercher une pièce jointe »), actions : (Silicium) imprimer, « Copier sur le disque » (clé USB), lien DocSecure, mail. Tag « Dépôt OK » sur la ligne de l'AAE.
- Signature à distance avec notaire en participation : recueil de signature envoyé à l'étude du confrère (« Démarrer la séance », identifiant de séance de type « S_… », « Signer à distance », « Authentification du notaire », « Importer les recueils » repassant au vert) ; notaire en participation ajouté dans « Tiers » avec type de contact « Notaires (Référentiel des Métiers du Notariat) » ; « Actualisation RMN » (menu « Contacts » › « Rechercher », clé REAL requise). Comparution à distance (décret 2020/1422) : signature qualifiée DocuSign, visio, attestation de consentement.

### 10.5 Formalités postérieures MICEN (maj 28/08/2026)
- Toute fonction postérieure MICEN exige une **copie simple** (générée automatiquement à l'issue de la séance). Demande : « + » dans les formalités postérieures › saisir « copie simple » › choisir celui portant le tag Micen › valider ; ou AAE › « Afficher en détail »/clic droit › « Créer une copie » › « copie simple » › « Récupérer la copie ». Si l'acte n'est pas en base : clic droit sur un bouton en bas à droite › « Portail de production » › « Consulter mes actes archivés » › recherche par n° de chrono ou date de signature › « Télécharger une copie simple » › « Télécharger la copie ».
- ⚠ Copie authentique (papier ou dématérialisée), copie exécutoire, dépôt de mention : écrans similaires (annexes, mentions) ; case « Fiche valide » = dépôt dans SignActe ; « Enregistrer » ou « Signer la copie » / « Signer la mention » (notaire seul). GDS écrit « Signer la mention » pour la copie exécutoire ; Silicium « Signer la copie ».
- Mentions : natures « LEGALES MARGINALES » et « PUBLICATION » ; « + Mention » ; case « Ignorer les tirets restants » ; statut « En préparation » ; ⚠ signature (notaire avec clé Real) de trois façons : portail de l'acte (« Signer la mention »), rappel « Mentions et notes à signer » (portail « ACCUEIL »), ou « Suivis » › « Suivi MICEN » › type de recherche « Mentions et notes » › détail › « Signer la mention » ; code PIN demandé deux fois ; résultat « Dépôt OK ».

### 10.6 Suivi des dépôts MICEN (Silicium maj 03/09/2026 ; GDS maj 29/04/2024)
- Écran en blocs : critères de recherche, enregistrement des favoris, résultat.
- « Type de recherche » : actes (par défaut) ; « Mentions et notes » (GDS) ou « Copies, Mentions et notes » (Silicium).
- Actions depuis un résultat d'acte : aller au sous-dossier ; visualiser/ouvrir/modifier/signer les mentions postérieures (⚠ signer) ; télécharger attestation de signature et/ou preuve de dépôt ; visualiser l'AAE et accéder aux fonctions post-signature (SuiteSignature, mention, note) ; export Excel du résultat.
- Colonnes du tableau : non listées dans le texte (« à vérifier »).

---

## 11. Actions ⚠ à ne jamais déclencher par une lecture automatique (liste de blocage)

Boutons/gestes qui écrivent, valident, envoient, signent ou suppriment : « Valider » / « VALIDER » (réquisition, copie hypothécaire, bordereau, plus-value, mainlevée, bordereaux papier) ; « Enregistrer » (produits Télé@ctes, inscriptions) ; symbole « Euros » + « Valider » (virement) ; « Prêt à signer » ; « Signer » / « Signer le(s) dépôt(s) » / « Signer la mention » / « Signer la copie » / « Valider la signature » ; « Envoyer » ; « Démarrer la séance » ; « Importer les recueils » ; « Renouveler les inscriptions » ; cadenas (clôture) ; corbeille/poubelle ; « Ajouter une formalité » ; « + Ajouter » (inscription hors dossier) ; « Actualisation RMN » ; « Gestion des favoris » › « Sauvegarder » ; « Forcer le rebalisage », « Réinitialiser » ; « Récupérer la copie » (dépôt de demande) ; « Mode expert » (déverrouille des champs) ; icône « AOP disponible » ; « Poursuivre » (génération de l'AAE). Lectures sans effet décrites : œil / slide-view, « R », « A », « Rechercher », « Excel » (export), « PDF » (édition), « Exporter en PDF », « Vérification du formulaire », « Visualiser les données littérales » (⚠ sur certaines pages ce clic « enregistre la saisie et déclenche la génération du flux » : à NE PAS cliquer, cf. constitution de servitude GDS).

---

## 12. Repères pour une lecture automatique

### 12.1 Libellés fixes de navigation (texte exact)
- Menu Authen.tic : « Formalités » › « Suivi des formalités » ; « Formalités » › « Gestion des inscriptions » ; « Formalités » › « Rejets / Refus » ; « Formalités » › « Edition des réquisitions » ; « Suivis » › « Suivi des formalités » ; « Suivis » › « Suivis des dépôts Télé@ctes » ; « Suivis » › « Suivi des réquisitions Télé@actes » ; « Suivis » › « Suivi MICEN » ; « Répertoire » › « Main courante » ; « Paramètres » › « Constantes étude » (onglet « Télé@ctes, MICEN, SUIVI ») ; « Paramètres » › « Utilisateurs » ; « Paramètres » › « Mentions manuscrites ».
- Menu latéral : « Formalités » › « Dépôts SPF » ; « Formalités » › « Dépôts recettes » ; « Contacts » › « Nouveau » / « Rechercher ».
- Titres de pages : « Suivi du registre des formalités », « Registre des inscriptions », « Suivi des formalités », « Rejets / Refus », « Suivi des réquisitions Télé@actes », page « Mentions Manuscrites ».
- Dans le sous-dossier : onglets « Actes », « Formalités postérieures », « Formalités préalables » ; pavé « Répertoire / Registre des formalités de l'acte » ; lien « Registre des formalités de l'acte » ; cadre « Informations détaillées » / « Information dossier » ; onglet « Retours » (plus-value) ; rubrique des pièces « non classé ».
- Boutons de recherche : bandeau « Critères de recherche », « Plus de critères », « Rechercher », « Gestion des favoris », « Sauvegarder », « Excel », « PDF », « IMPRIMER ».
- Icônes lues par le texte : « R » (registre), « A » (acte), « œil » (aperçu), « feuille et stylo » (modifier une formalité), « Euros » (virement), « trombone jaune/vert », « T@ / BRI » vert/rouge.

### 12.2 États (valeurs textuelles à reconnaître)
- Acte, colonne « Formalités » de la main courante : « A faire », « Libre », « En cours », « Validé », « Edité ».
- Groupes du suivi des formalités : « Actes signés », « Actes en cours », « Actes rentrés publiés », « Actes rentrés Rejet/refus », « Actes clôturés ».
- Inscriptions : « A renouveler », « A ne pas renouveler », « Clôturées » (OUI/TOUS), « Hors rédaction », bouton/état « Inscription à tenir ».
- Dépôt/produit Télé@cte : « En préparation », « Transmis à la comptabilité », « Prêt à signer », « Signé » (« SIGNEE », « Copie signée », « Inscription signée »), « Prêt pour envoi », « Dépôt envoyé », « Dépôt pris en compte ».
- Réquisition : « En préparation », « Transmis à la comptabilité » (+ retour du SPF saisi à la main).
- Bordereaux papier : « Bordereaux non déposés », « Bordereaux déposés ».
- MICEN : « Contrôle OK », « Acte Authentique », « Acte déposé », « Dépôt OK », mention « En préparation ».
- Motif de rejet : champ affiché dans « Rejets / Refus » (valeurs non listées).

### 12.3 Colonnes de tableaux de suivi (d'après le texte)
- Suivi des formalités : « N° de dossier », « Initiales », « Dossier/Acte », « Signé le », « Répertoire », « Type de formalité », « Bureau/SDE » + indicateurs (télé@cté, déposé au MICEN, PERVAL) + montant des droits.
- Annexes MICEN : case, « Libellé », « Taille », « Compression », œil/poubelle. Sélection des pièces : case, « Libellé », « Taille », œil.
- Signataires : « Identité », « Qualité », « Représentant(s) », « Lieu de signature », « Signe ? ».
- SuiteSignature : « Document », « Type », « Signatures », « Annexes », « Création de la séance », « Afficher en détail », « x ».
- Bordereau papier SPF : « Formalités requises », « Provision », mode de règlement, date de dépôt. Enregistrement : colonne « TOTAL ».
- Suivi des réquisitions : critères « Numéro de dossier », « libellé de dossier », « libellé acte », « situation du dépôt » (colonnes de résultats non listées : à vérifier).
- Suivi MICEN et Registre des inscriptions : colonnes non détaillées par le texte (à vérifier sur une vraie page).

### 12.4 Dates de mise à jour des pages (indicateur de fraîcheur)
Gestion des inscriptions 10/09/2026 ; Registre (accès, saisie) 17/12/2025 (suivi 23/06/2023) ; Dépôts papier 27/02/2026 ; Vente Silicium 09/12/2025 (GDS 05/07/2023) ; Prêts Silicium 11/12/2025 (GDS 07/07/2023) ; Attestation Silicium 12/12/2025 (GDS 11/08/2023) ; Servitude Silicium 12/12/2025 (GDS 08/08/2023) ; Mainlevée Silicium 15/06/2026 (GDS 07/08/2023) ; Réquisitions Silicium 07/07/2026 (GDS 15/11/2023) ; Rebalisage 10/07/2026 ; Bien utiliser Silicium 19/12/2025 ; MICEN droits 05/02/2026 (Silicium) et 24/03/2026 (GDS) ; AAE Silicium 23/03/2026 ; séance Silicium 30/03/2026 ; formalités postérieures MICEN 28/08/2026 ; suivi MICEN Silicium 03/09/2026 ; signature à distance Silicium 07/09/2026.

### 12.5 Points « à vérifier » / lacunes de la documentation
- Liste complète des valeurs du menu déroulant « état du dépôt » du registre ; définition de « A faire », « Libre », « Validé », « Edité ».
- Colonnes exactes de « Registre des inscriptions », « Suivi MICEN », « Suivi des réquisitions » (captures absentes).
- Libellés d'icônes sans texte (ex. alertes Télé@ctes, boutons « Mode expert » en clé, enveloppe d'envoi) : repérer par structure réelle.
- Les pages GDS et Silicium coexistent : les libellés varient (« cave »/« archives », « VALIDER »/« Enregistrer », « Ouvrir le bordereau »/bouton sans libellé) ; confirmer sur l'instance réelle laquelle est en service.
- Aucune page de ce lot ne décrit les demandes Comedec, casier judiciaire (CJN) ou réquisition hors formalité de type « EHF » par ce nom ; la « réquisition hors formalité » (état hypothécaire, § 8) est la seule décrite ici (le sigle « EHF » n'apparaît pas dans ces pages).
