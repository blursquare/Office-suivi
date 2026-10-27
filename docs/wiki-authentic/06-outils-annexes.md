# Résumé F — Outils annexes d'Authen.tic (wiki Fichorga)

Sources : home, Airmail, Acteexterne, Bannette, DocSecure, FoxNot, YouSign, Authentic-Scan, NotaScan, Teletravail.
Paraphrase de la documentation Fichorga. Légende : ⚠ = action qui envoie, signe, valide, supprime ou ne se défait pas. « à vérifier » = doute.
Rappel CLAIRE : lecture seule. Presque tout ce qui suit est une action d'ÉCRITURE ou d'ENVOI : à ne jamais déclencher. Seuls les écrans de suivi (listes de statuts) se lisent sans effet.

---------------------------------------------------------------------
## 0. Page d'accueil du wiki (page : home)

- Titre « Accueil Documentation », « Bienvenue dans la documentation d'Authen.tic ».
- Hotline : 03.20.62.08.08, lundi au vendredi, 8h30 à 19h30 sans interruption.
- Assistance pendant une séance de signature électronique : 03.20.62.08.06 ; astreinte le samedi matin, 8h30 à 12h00.
- Vidéos « Authen.tic_SILICIUM » dans la « Fichorga Académie » ; vidéo d'aide à la navigation : https://academie.cloud-fichorga.fr/view?m=vGwhdcNQC
- Rubriques listées (dans l'ordre) : « Airmail », « Acte externe », « Bannette », « Formalités dématérialisées », « FoxNot », « Manuel utilisateur », « Authen.tic Scan », « YouSign », « Notes de version », « Télétravail », « Fiches juridiques », « RGPD », « DocSecure intégré à Authen.tic ».
- Navigation : rubriques de la page d'accueil, barre de recherche en haut, filtre par mots-clés (icône à droite de la barre) ; dans une notice : table des matières, partage/impression par onglet, retour accueil par l'icône à gauche de « Documentation AUTHEN.TIC ». Retour page précédente : Alt + Flèche gauche.
(page : home)

---------------------------------------------------------------------
## 1. Airmail (SMS et dématérialisation)

**Rôle** : module de gestion des SMS clients (confirmation et rappel de rendez-vous) ; option liée : signature sous seing privé Yousign. La FAQ y ajoute la « dématérialisation des courriers ». (page : Airmail/Airmail/Airmail ; Airmail/Airmail)
**Activation** : demande au service commercial ou contact@fichorga.fr ; FAQ : bon d'activation signé, activation sous 72 h. Facturation à la consommation, facture mensuelle, sans abonnement ni engagement ; SMS à 0,11 € l'unité. Questions : assistance@fichorga.fr. (page : Airmail/FAQ-Airmail/FAQ-Airmail)

**Paramétrage** (administrateur de l'étude pour les textes)
- Menu Authen.tic › « Paramètres » › « Constantes étude » › onglet « Paramétrage des courriers » › paragraphe « Paramétrage Airmail » : case de confirmation des rendez-vous par SMS, case de SMS de rappel, délai du rappel J-7, J-2 ou J-1 (la FAQ dit 1, 2 ou 7 jours).
- Modèles de SMS : « Paramètres » › « Modèles de communication » › « + » en face de « Modèles de SMS » (libellé + contenu).
(page : Airmail/Airmail/Airmail)

**Envoi de SMS** ⚠ (envoi réel au client, non défaisable)
- Depuis le sous-dossier : saisir date/heure du prochain rendez-vous dans « Informations détaillées », cliquer l'icône téléphone en face de « Type de signature » ; la fenêtre montre le SMS de confirmation, la date et le texte du rappel, et les clients destinataires ; « Valider » génère les envois ⚠.
- Depuis la fiche Client : icône « Téléphone » en haut à droite › « ajouter » (en bas à droite) › « Ajouter un SMS » › modèle ou texte libre › « Enregistrer et envoyer le SMS » ⚠.
- Rappel automatique activé : le SMS part seul, sans action supplémentaire ⚠.
(pages : Airmail/Airmail/Airmail ; FAQ-Airmail)

**Historique des SMS (lecture)** : sous-dossier › bloc de gestion de la téléphonie › rubrique « SMS » ; fiche Client › icône « Téléphone » › menus déroulants « Appels » et « SMS ».

**Envoie à l'extérieur** : SMS vers les clients (prestataire non nommé, abonnements souscrits par Fichorga) ; Yousign (voir §6). **Droits** : module activé par Fichorga ; textes/modèles = administrateur de l'étude.
**Signature via Airmail (FAQ)** : intégrée dans les « side-view » des formalités préalables et postérieures du sous-dossier ; partenaire YouSign (certifié ANSSI et CSN, données hébergées chez la Caisse des Dépôts) ; signature « avancée » seulement, ne remplace pas la signature qualifiée des actes authentiques ni la comparution (page : FAQ-Airmail).

---------------------------------------------------------------------
## 2. Acte externe (page : Acteexterne/acteexterne)

**Rôle** : intégrer dans un sous-dossier un acte Word rédigé hors Authen.tic (ou non) et le préparer pour la signature AAE / le dépôt Télé@ctes.
**Accès** : sous-dossier › onglet « Acte » › partie « Historique » › fonction « Définir un acte Word externe comme acte de référence ». Renommage possible si plusieurs versions.
**Versions** : « Définir comme version actuelle » = version ouverte par défaut en rédaction, utilisée pour la signature, le répertoire et les formalités postérieures.
**Ouverture** : fenêtre de choix « Word seul » (garde la mise en forme, perd modifications de clauses et contrôle de cohérence ; conseillé pour actes très complexes) ou moteur de Rédaction Assistée par Ordinateur d'Authen.tic.
**Préparation AAE** : balises d'entête et de clôture parfois absentes → dysfonctionnement à la préparation du Micen. Dans la rédaction, menu « Insérer » : « insertion de l'entête » et « insertion du Dont Acte ».
**Rebalisage Télé@ctes** : les copier-coller, suppressions de clauses/variables ou insertion d'un acte Word externe peuvent altérer les balises. Message de « vérification du formulaire » (erreurs = à corriger avant dépôt ; avertissements = non bloquants). Fenêtre à deux onglets : « Balisage de l'acte » (balises à refaire en rouge ; boutons « Forcer le rebalisage », « Réinitialiser », « Contrôler », « Enregistrer », « Fermer ») et onglet WORD de l'acte ; « Débuter la section » place la balise au curseur (bleu, « rebalisée »). Rebalisage « valide » = plus aucune clause à rebaliser ; « Fermer » puis « oui » ⚠ (valide le rebalisage), après quoi on peut déposer l'acte (dépôt = ⚠ hors de ce résumé).
**Extérieur** : rien n'est envoyé par ces écrans eux-mêmes ; le dépôt Télé@ctes en aval l'est. Mentions : notice « Bien utiliser Téléacte » et vidéo copie hypothécaire dématérialisée (https://academie.cloud-fichorga.fr/view?m=tc4EYlH8W). **Droits** : non précisés. Doc au 9 septembre 2026.

---------------------------------------------------------------------
## 3. Bannette (page : Bannette/Bannette)

**Rôle** : espace de transit documentaire (sas) pour recevoir et trier des fichiers (ex. scans en masse) et les redistribuer vers les dossiers des clercs et notaires. ⚠ Délai de **7 jours** pour classer ou télécharger : suppression automatique ensuite.
**Accès** : en-tête globale de l'application, nouveau bouton « dossier avec une flèche ».
**Écran** : zone de dépôt centrale (glisser-déposer) ⚠ ; sous elle, liste des documents non encore associés à un dossier. Actions par document : œil (visualiser), crayon (renommer), clé à molette (Module PDF pour remanier), dupliquer, télécharger en local, supprimer ⚠. Sélection multiple : fusion sans passer par le module PDF ⚠ (le fusionné reste dans la même Bannette, les anciens sont supprimés).
**Affectation** ⚠ : rechercher un dossier puis glisser le document dans les pièces jointes du dossier/sous-dossier (le document quitte Bannette) ; ou glisser un ou plusieurs documents dans la liste des dossiers du volet de droite ; message du nombre de documents affectés. Même geste pour envoyer vers la Bannette d'un autre collaborateur ou l'espace partagé.
**Espaces** : privés (seul le titulaire voit et gère, même si d'autres y déposent) ; zone commune/« espace Bannette partagé » appartenant à tous.
**Extérieur** : rien. **Droits** : non précisés.

---------------------------------------------------------------------
## 4. DocSecure intégré à Authen.tic (page : DocSecure-intégré-à-Authentic)

**Rôle** : échanges sécurisés avec le client depuis Authen.tic : demande de RIB sécurisée, envoi sécurisé de documents (dont RIB de l'étude), lien de téléchargement pour fichiers volumineux (pièces > 20 Mo transformées automatiquement en lien ; limite 150 Mo par téléchargement). Disponible si l'étude a un abonnement FoxNot. Vidéos : https://academie.cloud-fichorga.fr/view?m=czOuQ36U4 (envoi), https://academie.cloud-fichorga.fr/view?m=NvYWNu870 (demande de RIB).
**Règles** : pour RIB (demande ou envoi du RIB de l'étude) seul l'envoi sécurisé est possible ; « libellé échange sécurisé » obligatoire (non modifiable après envoi) ; adresse mail + mobile du destinataire obligatoires (le client s'authentifie par code SMS ; pour un notaire, l'adresse mail suffit).
**Paramétrage** : « Paramètres » › « Constantes étude » › onglet « Paramétrage application » › « Créer le compte générique » › « VALIDER » (⚠ crée un compte) ; « Paramètres » › « Références bancaires » (RIB de l'étude en PDF) ; « Préférences de l'utilisateur » › rubrique « Dossiers » › horodatage automatique des RIB reçus ; « Paramètres » › « Modèles de communication » › « Modèles de mail » › « Envoi de document sécurisé » (et autres modèles : demande de RIB sécurisé, relances).
**Demande de RIB** : sous-dossier › nouvelle formalité préalable › « Demande de RIB sécurisé » › destinataires › libellé › « Envoi sécurisé » ⚠ puis le courriel s'ouvre dans Outlook, « Envoyer » ⚠.
**Envoi de documents** : depuis dossier/sous-dossier › nouveau courriel › libellé, destinataires, modèle « Envoi de document sécurisé », documents (pièces jointes dossier/sous-dossier ou importées, actes, formalités, pièces des fiches clients/immeubles, RIB de l'étude) › « Envoyer » ⚠ › « Envoi sécurisé » ⚠ › « Envoyer » dans Outlook ⚠.
**Suivi (lecture)** : sous-dossier › tuile verte « Dématérialisation » › « Echange sécurisé » (libellé, initiales expéditeur, destinataire, statut « Envoyé » ou « Terminé », nature, date) ; détail à droite (visualiser, ouvrir, imprimer). Menu Authen.tic › « Suivi » › « Suivi Echanges sécurisés » (critères zone 1, résultats zone 2). Les RIB déposés par les clients arrivent dans les pièces jointes du sous-dossier, répertoire « Demande Document ».
**Extérieur** : courriels + SMS vers le client via la plateforme DocSecure/FoxNot. Doc au 28 juillet 2025.

---------------------------------------------------------------------
## 5. FoxNot (page : FoxNot/FoxNot ; FOXNOT-V3 ; FOXNOT-V4)

**Rôle** : plateforme de partage/demande de documents avec les clients (espace client en ligne). Licence : service commercial / contact@fichorga.fr. Deux versions : **V3 = avec questionnaire** (doc au 29/04/2024), **V4 = sans questionnaire** (doc au 16/06/2026, proposée par défaut).
**Liaison compte** (V3) : profil en haut à gauche › « Préférences de l'utilisateur » › zone « Informations personnelles » › « Se connecter à FoxNot » (mail + mot de passe FoxNot, conservés par Authen.tic ; dissociable au même endroit).

### V4 (la plus récente)
- **Accès** : depuis l'acte (sous-dossier), icône Renard → page de gestion appelée « Espace client » (Espace client FoxNot ; l'environnement du client = « Espace client utilisateur »). Onglets : « Gestion des intervenants et immeubles » (commun V3/V4), « Gestion des fichiers » (active après la 1re invitation), « Suivi de documents » (V4, après invitation).
- **Choix du type d'espace** (avec/sans questionnaire) ⚠ définitif après la première invitation.
- **Invitation** ⚠ : inviter tous ou certains intervenants (collaborateur d'une étude en participation, autre professionnel possible) ; mobile obligatoire pour tout client hors professionnels du notariat (reconnus par une adresse « @notaires.fr » ou « @x.notaires.fr », sinon traité en client lambda avec SMS) ; bouton « Créer l'espace client » = envoie un courriel d'invitation ⚠ ; « Fermer ». Remontée aux fiches personne/immeuble par icônes (utile pour l'immeuble seulement en V3).
- **Partager un document** ⚠ : sélectionner les pièces (notes/RIB, actes, formalités préalables/postérieures, fiches ; pièces jointes dossier/sous-dossier, y compris hors Authen.tic), destinataires, « Partager un document », titre obligatoire visible du client, 2FA optionnelle (non modifiable pour un RIB) ; envoie un courriel d'information ⚠. « Annuler » réinitialise la sélection. Formats : Word, Excel, PDF, images (png, jpeg, jpg) ; pas de plafond de nombre (recommandé < 50 par échange) ; 50 Mo par pièce.
- **Demander un document** ⚠ : « Demander un document » (une demande par document, titre obligatoire, 2FA, courriel au client) ; **« Demande groupée de document »** ⚠ (choix dans des modèles, « + Ajouter un document » libre, 2FA obligatoire si un RIB est demandé, « Envoyer la demande », recommandé < 20 par échange).
- **Suivi des documents (lecture)** : colonnes titre, document (type), destinataires, expéditeur, date de création, « Consulté le », statut, détail ; bouton « Actualiser ». Trois types d'échange : demandé, mis à disposition (partage), reçu du client. Statuts : partage = « En cours », « Vu par le client » ; demande = « En cours », « Vu », « Reçu », « Rejeté »/« Validé » (côté demande) ; document du client = « En cours », « Vu », « Récupéré » (grille du wiki peu lisible : **à vérifier**). « Vu » = vu par le notaire ; « Vu par le client » = vu par le client.
- **Actions sur un échange** (détail) : « Rejeter » ⚠ (texte ≤ 255 car., « Soumettre » ; supprime du répertoire « Foxnot » tous les documents de l'envoi), « Valider » ⚠ (message de prise en compte au client), « Annuler la demande » ⚠ (possible à tout statut, disparaît du suivi et de l'espace client), icône poubelle sur un document d'un partage ⚠ (supprimé aussi côté client), « Annuler le partage » ⚠.
- **Invitations** : « Relancer » ⚠ (courriel) ; « Révoquer » ⚠ (désactive le lien ou l'accès au dossier). Lien d'invitation valable **10 jours** (RGPD) ; à réinviter ensuite. Adresse mail et mobile uniques par intervenant (couple marié : adresses distinctes, sinon un seul invité ; société : inviter l'associé, pas la fiche société).
- **Récupération** : justificatifs des clients stockés dans le répertoire de pièces jointes « Foxnot » (sous-dossier). RIB déposé dans « Données personnelles » : icône « Ce RIB a été récupéré via un procédé sécurisé de double authentification ».
- **Suivi « Foxnot »** (menu, V4 seulement) : tous les échanges ; critères en plus des classiques : statut, libellé, type d'échange, expéditeur/destinataire ; défaut = dernier mois.
- **Modèles** : « Paramètres » › « Modèles de communication » › rubrique « Demande multiple de document » ; classement par type d'acte (Bail, Vente, Succession, Donation, Divorce + « Comparution ») ; stylo : ajouter/déplacer/renommer/supprimer/favori ; ⚠ modifications définitives, propres à l'étude, impossible de revenir à l'origine.
(page : FoxNot/FOXNOT/FOXNOT-V4/FoxNotV4)

### V3 (avec questionnaire)
- Logo FoxNot sur la page de l'acte → gestion du dossier FoxNot (« Export FoxNot ») ; qualité des invités obligatoire (vendeur, acquéreur, ou les deux) ; bouton « Exporter » ⚠ (crée le dossier FoxNot, option « Inviter au dossier », invités reçoivent un courriel) ; invitations ultérieures par « Gestion des intervenants et immeubles » › « Synchronisation rapide ».
- « Gestion des fichiers » : cocher dans « Pièces Jointes », « Formalités préalables », « Formalités postérieures », « Actes » puis « Synchronisation rapide » ⚠ (cadenas = double authentification ; 50 Mo max par document).
- « Pièces automatiques » (onglet de la page de l'acte ; export préalable non requis) : récupération auto de documents : personnes physiques = gels des avoirs, BODACC ; personnes morales = BODACC commerciaux, extrait INPI, avis de situation INSEE, derniers statuts, Kbis (sauf BODACC, pris sur Pappers) ; biens = rapport Géorisques, extrait de plan cadastral, ERRIAL ; l'ERP de Nota Risques Urba est payant, en commande seulement. Statuts : « A demander », « Demandé », « En cours », « Terminé », « Echec ». Résultats dans le répertoire « Demande Document » des pièces jointes. Champs de fiche nécessaires (ex. BODACC : naissance, lieu, résidence).
- « Demander un document » (titre et description obligatoires, document sécurisé = SMS, « Notifier la demande ») ⚠ ; fichier reçu récupéré par « Synchronisation rapide » dans le répertoire « FoxNot ».
- Synchronisation : « rapide » (invitation, mise à disposition, récupération) ; « Synchronisation Complète » : fiches Authen.tic → FoxNot, ou FoxNot → Authen.tic (choix donnée par donnée ; ⚠ la validation modifie toutes les fiches).
- « Ouverture de la synthèse de l'acte FoxNot » (lecture des réponses aux questionnaires) et « Ouvrir dans FoxNot » (portail).
(page : FoxNot/FOXNOT/FOXNOT-V3/_FOXNOT_AVEC_QUESTIONNAIRE)

**Extérieur** : courriels d'invitation/information et SMS vers les clients ; documents hébergés chez FoxNot ; récupérations auprès de Pappers/Géorisques/etc. **Droits** : licence FoxNot, compte FoxNot lié à l'utilisateur ; reste non précisé.

---------------------------------------------------------------------
## 6. YouSign — signature sous seing privé (page : YouSign/…)

**Rôle** : signature électronique « avancée » de documents sous seing privé (procurations, avant-contrats, tout document) ; **jamais** pour un acte authentique ni une procuration authentique (le décret du 20/11/2020 exige une signature qualifiée) ; conforme à la circulaire CSN 1577 du 4 avril 2020. Option liée au module Airmail (à activer via assistance@fichorga.fr). Le client doit avoir un mail et un mobile valides (page Silicium).
Trois variantes de notice : Authen.tic **Silicium** (doc 01/04/2026), **GDS** (doc 19/04/2024), plus FAQ (générique, Silicium, GDS).

**Paramétrage du suivi** : « Préférences de l'utilisateur » › « Informations personnelles » (adresse du notaire/clerc) ; rubrique « Dossiers » : choisir « Notaire » ou « Clerc » comme personne de suivi ; « Valider ».
**Envoi** ⚠ (engage la procédure de signature, facturée) : générer la formalité préalable/postérieure ou l'acte SSP ; clic droit ou icône « Afficher en détail » ; side-view › « Envoyer » › « Envoyer via YouSign » (GDS : directement « Envoyer via YouSign ») ; onglet : destinataires, fichiers (pièces jointes sous-dossier/dossier, formalités, « Autres éléments du dossier »), Silicium : montant de la facture et compte à débiter ; « Valider » ⚠.
**Côté client** : courriel YouSign › « Accès à vos documents » › vérification de l'identité › lecture des documents et CGU › « CONTINUER » (Silicium) ou « SIGNER » (GDS) › pièce d'identité (CNI, passeport, titre de séjour) › SMS de confirmation › saisie du code = signature.
**Suivi (lecture)** : mails YouSign (demande créée ; documents signés) ; sous-dossier › bloc « Dématérialisation » › rubrique « Signature Electronique » avec statuts « En cours », « Signée », « Refusée » ; FAQ Silicium : « gestion des dématérialisations » - « Signature électronique ».
**Retour** : automatique toutes les heures dans les pièces jointes du sous-dossier, répertoire « Retour Signature Numérique ». Original = seule version à valeur légale ; pour le MICEN utiliser une COPIE glissée dans « Annexes MICEN » (la conversion PDF/A supprime les signatures) ⚠.
**Facturation** : par signataire à la consommation (FAQ générique : seules les signatures effectuées ; versions Silicium/GDS : procurations facturées dès l'envoi). Renvoi si mail non reçu : dupliquer la procuration dans les « avant-produits » ⚠ (nouvel envoi). Message d'erreur du lecteur PDF possible (certificat non qualifié) : signature néanmoins valable.
**Extérieur** : documents, nom, mail, mobile et pièce d'identité du signataire vers YouSign (France, hébergement CDC selon FAQ Airmail). **Droits** : module Airmail/YouSign actif ; notaire/clerc de suivi paramétré.

---------------------------------------------------------------------
## 7. Authen.tic Scan / NotaScan (pages : Authentic-Scan/… ; NotaScan/…)

Les deux arborescences ont un contenu **identique** (NotaScan = ancien nom ; « Authen.tic Scan (ou NotaScan) »). Seuls les titres changent ; NotaScan ne contient pas la section « Contrôle d'IBAN » dupliquée dans l'index mais la page existe.
**Nature** : logiciel **Windows séparé** (pas une page d'Authen.tic) : scanner (USB), convertir Word/Excel/PowerPoint/Outlook en PDF, modifier les PDF, les ranger dans Authen.tic, contrôler les IBAN, signer. Assistance : Télémaintenance NotaSolutions, support en ligne, guide de l'utilisateur.
**Liaison avec Authen.tic** : Paramètres › section « Authentic » › écran « Fichorga.Authentic » : identifiant et mot de passe du compte Authen.tic, « Tester » ; changer de mot de passe Authen.tic impose de le changer ici ; puis « Général » › option « Détecter les séparateurs dans les fichiers ». (page : Liaison-NotaScan-Authentic)
**Accueil** : tuiles centrales (Authen.tic, Poste de Travail, formats Word/Excel/Powerpoint/Outlook, « Ajout Direct Dossier »), « parapheur » à gauche, fonctionnalités rapides (transfert de fichier, « Contrôle IBAN », archives Notaroom), journal des numérisations, paramètres, assistance.
**Ouvrir** : tuile « Ajout Direct Dossier » › « Ouvrir fichier(s) depuis... » › « Authen.tic » (recherche d'un dossier, volet gauche dossiers, volet droit actes/documents, « Valider ») ou « Poste de Travail » ; glisser-déposer possible. Formats : PDF, Word, Excel, Powerpoint, Outlook (convertis en PDF).
**Éditeur** : ruban (Annotations, Édition, Marques, Orientation, Pages, Reconnaissance, Signature), gestionnaire de pages/signets, visualisation, exportateur.
- Annotations : « Effacer » (gomme libre/rectangle), « Censurer (rectangle) », « Déplacer », « Rogner selon la sélection » ⚠ (supprime le reste), « Tampons » (poser, « Créer un nouveau tampon », suppression par clic droit), « Note », « Texte ».
- Pages : découper, « Ajouter » (Numériser, Depuis Poste de Travail, Depuis Authen.tic), dupliquer, effacer, effacer les pages blanches ⚠, fusionner/diviser (vertical/horizontal), réordonner.
- Orientation : pivoter, « Redresser ». Marques : flèche, « Marqueur », « Encadrer », « Couleur ».
- Reconnaissance : IBAN (contrôle manuel, détection automatique ou manuelle ; renvoie banque, BIC, adresse) et Texte (copie la page ou un paragraphe dans le presse-papier).
- Édition : « Annuler », « Réinitialiser » ⚠ (perd toutes les modifications), « Imprimer » ⚠, « Exporter » (PDF vers un dossier Windows).
- Signature ⚠ : « Stylet » (tablette WACOM ou écran tactile), « Signer », « Configurer la signature » (moyen, signataire, horodatage, image) ; signature simple ou clé REAL.
**Export vers Authen.tic** ⚠ (écrit dans le dossier) : volet droit de l'éditeur : nommer (ou intitulé présélectionné), rechercher dossier par nom ou numéro, « + » pour parcourir actes/comparants, puis « Ranger ce document » / « Ranger tous les documents » / « Ignorer ce document ».
**Paramètres** : onglets Général (parapheurs, adresses mail : adresse d'envoi des PDF et carnet), Acquisition, Authen.tic (liaison, libellés d'export), Répertoire, Photocopie, Word/Excel/Powerpoint/Outlook. Parapheurs : création par « + » ou Paramètres › Général › « Ajouter » ; suppression par clic droit › « Effacer la ligne » ⚠.
**Extérieur** : envoi de PDF par mail depuis la machine (adresse configurée) ; échanges avec Authen.tic avec les identifiants du compte.

---------------------------------------------------------------------
## 8. Télétravail (page : Teletravail/…)

**Rôle** : mise en place du télétravail à l'étude (Ballade de REAL.NOT) + interopérabilité (Fichorga).
- **Étapes** : 1) « Mon Espace REAL » (https://monespace.real.notaires.fr) : « Je souhaite modifier un compte utilisateur » › compte › « Activer » (mot de passe sous 72 h) pour créer les coffrets Ballade ; 2) appeler REAL.NOT, seul habilité à installer/paramétrer le coffre Ballade ; 3) sur support.fichorga.com, télécharger « ComplémentBallade.exe », l'exécuter en administrateur. ⚠ Le paramétrage ne peut se faire que sur des postes présents à l'étude ; ensuite VPN pour travailler sur Authen.tic et JurisWeb. (page : Teletravail/Teletravail)
- **Généalogiste** : menu « Outils » › « Import de fiches » : ajouter une archive, sélectionner des fichiers NOMCLIENT.ficho, option de suppression de l'archive après import, « Valider » ⚠ (crée des fiches Clients). Cabinet incompatible : assistance@fichorga.fr. (page : Genealogiste)
- **Interopérabilité** (format du CSN) : menu « Outils » › « Import de données » (à ne pas confondre avec « Import de fiches ») : fichier Zip choisi ou glissé ; pour chaque élément : créer, mettre à jour ⚠ ou ignorer. Partage : bouton « Partager » (dossier, fiche client, fiche immeuble ; pièces jointes incluses), bouton « Partage » dans la barre du sous-dossier (seuls les dossiers de Vente) ; génère un Zip local à envoyer par mail ⚠ ou enregistrer. (page : Teletravail/Interoperabilite/Interop/Interop)

---------------------------------------------------------------------
## 9. Points d'attention pour CLAIRE (lecture seule)

- Rien d'envoyé à éviter : SMS (Airmail), « Envoi sécurisé » (DocSecure), « Créer l'espace client », « Partager un document », « Demander un document », « Relancer », « Révoquer », « Rejeter », « Valider », « Annuler… » (FoxNot), « Envoyer via YouSign », dépôt Télé@ctes, imports, Bannette (affecter/fusionner/supprimer).
- Lisibles sans effet apparent : « Suivi Echanges sécurisés », bloc « Dématérialisation » du sous-dossier (échanges sécurisés, « Signature Electronique »), suivi FoxNot, historique SMS. L'effet d'un « Actualiser » ou d'une « Synchronisation rapide » n'est pas neutre (rapatrie/envoie) : **à vérifier**, éviter.
- Droits par rôle (notaire, clerc, administrateur) : seulement l'administrateur est cité (modèles SMS, constantes).
