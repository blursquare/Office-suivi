# CLAIRE — Registre des échéances (étude notariale Gossart)

Outil interne de l'étude notariale (Maître Sophie GOSSART, Blois) pour suivre les dossiers de vente :
échéances d'un avant-contrat (obtention du prêt, vente préalable, date butoir, appel de fonds,
projet envoyé, rendez-vous de signature), pièces du dossier retrouvées sur le NAS, extraction
automatique des données d'un compromis/promesse, relances et rappels, relecture d'actes.
Nom affiché dans l'interface : **CLAIRE** (le dépôt garde son nom historique).

Ce fichier est un **guide court**. L'historique détaillé de chaque décision (≈ 11 000 lignes, mot
pour mot) est dans **`docs/historique.md`** : il n'est pas chargé automatiquement, le consulter par
`grep` quand un sujet le demande (historique d'une fonction, raison d'un choix, piège déjà payé).
**Les nouvelles entrées d'historique s'ajoutent à la fin de `docs/historique.md`**, section
« Entrées postérieures au 28/09/2026 » — pas ici. Ne mettre à jour ce fichier que si une règle
durable, l'architecture ou « Ce qui reste ouvert » change.

## Branches et déploiement

- **`main`** = la seule branche de travail : la **version serveur intranet** (Express +
  `node:sqlite`), distribuée à l'étude sous forme de `CLAIRE-serveur.exe` (Node SEA, Windows),
  reconstruit et publié en release par `.github/workflows/build-exe.yml` à chaque push sur `main`.
- **`sauvegarde`** = copie de `main` pour les essais de l'étude, sans développement propre.
- La version 100 % locale (sans serveur, `localStorage`) n'est plus maintenue ; son dernier état
  est le commit `c90e9d0`. Dans `docs/historique.md`, « sur `main` » dans les entrées antérieures
  au 18/09/2026 désigne cette version locale, et « `claude/serveur-intranet` » l'actuelle `main`.
- **Un correctif n'atteint le bureau que par un nouveau `.exe`** (les fichiers client sont
  embarqués dans le blob SEA) — l'étude l'installe par Réglages › Mise à jour en un clic.
  Avant de retoucher un bug « toujours présent » déjà corrigé, faire vérifier la version affichée
  dans « À propos » : c'est presque toujours un problème de déploiement, pas de code.

## Structure

```
index.html / style.css / script.js   Client (une seule page, tout le rendu est en JS sans framework)
manifest.json, sw.js, icone.svg      PWA (installabilité) et favicon
appel-de-fonds-modele.js             Modèle Word du courrier d'appel de fonds + logos (base64)
questionnaire-satisfaction-pdf.js    PDF du questionnaire de satisfaction (base64)
server/                              Serveur (son propre package.json ; le package.json racine est
                                     de l'outillage de test pur, sans dépendance)
  src/app.js, index.js, config.js    Montage Express, démarrage, configuration (.env / config.json)
  src/db.js, dossiersRepo.js,        Base SQLite (dossiers en blob JSON, table `parametres`
       parametresRepo.js             clé→JSON pour réglages et états produits par le serveur)
  src/routes/*.js                    API (dossiers, nas, reglages, notifications, agenda, exchange,
                                     relectureClaude, relectures, extractionIa, offrePret,
                                     signatureImages — images de la signature des emails, …)
  src/carnetConfreres.js             Carnet des confrères (relevé initial des offices du 41, liste blanche)
  src/annuaireNotaires.js            Notaires de France par département (data/annuaire-notaires.json, lecture seule)
  src/repertoire.js                  Répertoire hors notaires (relevé du répertoire Word de l'étude, par thème)
  src/ouvertureAuto.js               Installateur du relais « claire-ouvrir: » (ouverture auto des téléchargements)
  src/jobs/rappels.js                Rappels par email (miroir serveur du planning client)
  src/appels3cx.js, routes/appels.js Appels reçus par 3CX (sonnerie → journal, appelant reconnu, fiche ouverte)
  src/nas.js, nasWatch.js            Lecture du NAS par le serveur, surveillance périodique
  src/scans.js, routes/scans.js      Classeur des scans du copieur (dossier « Scan » → dossiers clients)
  src/agendaOffice.js, agendaWatch.js  Lecture de l'agenda de l'office (EWS, toutes les 15 min)
  src/exchange/ews.js                Écriture dans l'agenda Outlook (EWS/NTLM)
  src/relecture/{claude,mistral}.js  Relecture d'actes par API (prompt, schéma, vérification)
  src/extraction/                    Passe IA locale (Ollama) de l'extraction du wizard
  src/envoiEmail.js, imapGmail.js,   Envoi SMTP, effacement différé des copies Gmail
       nettoyageGmail.js
  src/sauvegarde.js, miseAJour.js    Sauvegarde quotidienne de la base, mise à jour en un clic
  src/journalTechnique.js,           Journal technique (console.error/warn du serveur, événements des
       rapportTechnique.js           postes) et rapport anonymisé déposé en issue GitHub (12 h, 17 h)
  scripts/build-windows-exe.mjs      Construction du .exe (esbuild + SEA + postject + icône)
extension-firefox/                   Extension Firefox « CLAIRE pour Authentic » (bouton « Envoyer à CLAIRE »,
                                     POST /api/authentic/capture, routes/authentic.js ; LISEZMOI.md)
tests/                               Tests client (node:test) ; server/test/ pour le serveur
docs/historique.md                   Historique détaillé (voir plus haut)
docs/spec-banc-essai-extraction.md   Cadrage du banc de mesure de l'extraction
```

**Tout fichier servi statiquement doit être déclaré à la fois dans `ASSETS_STATIQUES`
(`server/src/app.js`) et dans les assets embarqués de `server/scripts/build-windows-exe.mjs`** —
sans les deux, il fait un 404 silencieux dans le `.exe` (piège payé deux fois).

## Contraintes fondamentales

1. **Tout reste sur le réseau du bureau.** Pas d'hébergement en ligne. Exceptions voulues et
   cadrées par l'étude : l'API de relecture d'actes (Mistral par défaut, Claude en option), qui ne
   reçoit que du texte **pseudonymisé dans le navigateur** (la table de correspondance ne quitte
   jamais le poste) ; l'autocomplétion d'adresse `api-adresse.data.gouv.fr` (seul le texte tapé part) ;
   les CDN de bibliothèques (pdf.js, tesseract.js 7.0.0, docxtemplater, docx) ; le **rapport technique**
   (accord de l'étude du 30/09, `rapportTechnique.js`) : issue GitHub à 12 h et 17 h les jours ouvrés,
   **anonymisée par le serveur avant l'envoi** (`anonymiserTexte` : chemins, fichiers, emails, montants,
   téléphones, mots tirés des dossiers et des collaborateurs, mots en capitales hors sigles techniques ;
   jamais d'auteur de signalement, de capture, de nom de dossier ni de valeur de champ) — tout ajout
   au rapport passe par `anonymiserTexte` et un test « aucun nom ne sort ».
2. **Accès sans mot de passe par défaut** (le réseau du bureau protège l'accès ;
   `"authActive": true` dans `config.json` le rétablit). Pas de compte par collaborateur : le
   collaborateur du poste est choisi une fois (`localStorage`), ses préférences vivent en base.
3. **Le serveur lit le NAS** (`config.nasRacine`, jamais devinée). L'API File System Access du
   navigateur est abandonnée : elle n'existe pas sur une adresse IP. Chemins confinés à la racine
   (`resoudreCheminNas`, liens symboliques résolus avant contrôle, PDF seulement). **Seule écriture
   sur le NAS : le classeur des scans** (accord de l'étude du 30/09) — une COPIE dans le dossier
   client (`COPYFILE_EXCL`, « Nom (2).pdf » plutôt qu'écraser), l'original déplacé dans
   « Scan/CLAIRE - scans rangés/AAAA-MM », jamais supprimé ; nom de scan = simple nom de fichier,
   dossier client confiné par `resoudreCheminNas`. Tout accès disque
   est **asynchrone** : un appel `*Sync` dans un chemin de requête fige tout le serveur (Node est
   mono-thread — la cause des « coupures » passées). Une route `async` doit rattraper ses erreurs
   (`routeAsync()` dans `routes/nas.js`) : Express 4 ne rattrape pas une promesse rejetée, la
   requête resterait suspendue.
4. **Aucune page web n'envoie un email seule.** Les emails au client sont des `.eml` (`X-Unsent: 1`,
   HTML + signature + pièces jointes) qu'Outlook ouvre prêts à envoyer (`livrerEmailDossier`), ou un
   `mailto:` texte selon le réglage du poste. Seuls les rappels internes partent automatiquement :
   SMTP Gmail + mot de passe d'application → boîte-passerelle (Objet = adresse du destinataire) →
   flux Power Automate → Teams. La copie gardée par Gmail est effacée **2 h après** (le flux relève
   la boîte Gmail elle-même : l'effacer tout de suite l'empêcherait de passer).
5. **Agenda de l'office** (Exchange 2019 de Fichorga, `mail.authentic-connect.fr`), tout par EWS en
   NTLMv2 (`httpntlm`) sur le **calendrier partagé de Sophie** : **lecture** toutes les 2 min (étude, 30/09)
   (`lireCalendrierExchange`, FindItem en vue calendrier, 6 mois en 3 tranches ; envois relevés,
   rendez-vous de signature, absences, catégories, et **tous les rendez-vous du jour** pour la fenêtre
   du matin — `agendaDuJourDepuisEvenements`, clé `agenda-du-jour`, rubrique « Agenda du jour » —, le lien
   `.ics` publié n'est plus lu depuis le 29/09 ; la lecture part du lundi de la semaine précédente et
   tout est gardé sous `agenda-office` pour la page Agenda, `GET /api/agenda/evenements`) ; **écriture** : création/déplacement/retrait
   d'un rendez-vous de signature (catégorie = couleur : vert office, violet visio, orange confrère),
   note « Appel de fonds (et projet) envoyé » dans le Lieu, dates butoir prêt / vente préalable en
   journée entière — seule voie depuis le 29/09 (plus de flux `.ics` publié) : le poste les pose au
   geste, le serveur pose ce qui manque à chaque tour de lecture (`echeancesAgenda.js`) en adoptant
   d'abord un événement de même titre et même date (jamais de doublon) ; depuis la **page Agenda**
   (30/09), création de tout rendez-vous et **suppression de n'importe lequel après confirmation**
   (`POST /exchange/evenement/supprimer`, `MoveToDeletedItems`) ; **modification** (01/10, titre + Start/End
   seulement, `POST /exchange/evenement/modifier`) par le crayon du détail ou en **glissant** le rendez-vous
   (Semaine/Jour, souris, confirmé au lâcher ; la signature d'un dossier emmène la fiche) ou en **tirant son
   bord** haut/bas pour changer début/fin (`horaireRedimensionneAgenda`, même confirmation) ; la **catégorie** s'y change aussi
   (`item:Categories` remplacée, catégories manuelles gardées) dont **« Annulé / à replacer »** (jaune,
   `categoriesRdv.annule`) : une signature ainsi marquée — dans CLAIRE ou Outlook — quitte la fiche
   (`rendezVousARemplacer`) et revient « à placer » ; retirer le jaune la rétablit. **Teams au
   responsable** (01/10) pour toute signature placée, déplacée ou mise « à replacer » par un autre :
   par le poste depuis CLAIRE, par le serveur quand c'est relevé dans Outlook
   (`notifierRendezVousRelevesAgenda`, sans savoir qui). **Un seul essai par appel, aucun réessai automatique** (verrouillage du compte),
   disjoncteur sur refus d'identifiants (côté client pour les écritures ; côté serveur, la lecture
   automatique est suspendue tant que les identifiants refusés restent enregistrés). Suppression = `MoveToDeletedItems`, jamais `HardDelete` ; sur `ErrorCannotDeleteObject` (vu le 01/10 : compte délégué sans droit sur les éléments supprimés de Sophie), une seconde requête en `SoftDelete` (récupérable par « Récupérer les éléments supprimés »).
   Microsoft Graph / Power Automate premium ne sont pas disponibles. **Lecture de la boîte de
   réception** du même compte (celle de Bastien, qui reçoit tout en double) à 8 h 50 pour le résumé
   des emails du matin (`emailsMatin.js`, FindItem seul, sans IA) : seuls expéditeur, objet et
   heure sont gardés, jamais le corps ; affiché **pour Bastien seulement** (`DESTINATAIRES_EMAILS_MATIN`),
   en **résumé** (`syntheseEmailsMatin` : chiffres, sujets repérés avec leurs dossiers, une ligne par
   dossier, expéditeurs hors dossiers), la liste complète dépliable. **Résumé en texte par l'IA locale**
   (étude, 30/09 : « fais lire les emails à llama ») : Ollama lit expéditeur, objet, dossier reconnu et
   l'aperçu Exchange (256 car.) de 60 emails au plus, rédige `ia.texte` + `ia.points` (rattachés au
   dossier de l'email cité, jamais deviné) ; l'aperçu n'est jamais gardé, seul le résumé l'est ; rédigé
   après l'écriture du résumé sans IA (`ia.enCours`, le poste relit toutes les 20 s).
6. **Secrets** (mot de passe SMTP, clés API Mistral/Anthropic, mot de passe Exchange, jeton GitHub
   de mise à jour) : stockés en base, **jamais renvoyés par une route** (remplacés par un booléen
   « enregistré »), conservés si le formulaire ne les réémet pas, effacés sur chaîne vide explicite,
   jamais journalisés ni repris dans un message d'erreur.
7. **Aucune donnée client réelle dans le dépôt.** Les tests reprennent la structure des actes réels
   avec des noms, adresses et montants inventés ; les PDF réels ne sont jamais commités.
8. **Word ne comprend ni Grid ni Flexbox** : les documents générés (`imprimerFiche`, courriers) sont
   en `<table>` avec couleurs inline, et restent dans l'identité papier de l'étude (bordeaux
   `#6D2332`), hors thème de l'application.

## Règles métier stables (à ne pas rouvrir sans nouvelle demande)

- **Parties** : Vendeur = Promettant, Acquéreur = Bénéficiaire — sauf promesse d'**achat**, où le
  rôle se déduit du type d'acte (`ROLES_PAR_TYPE_ACTE`). La **forme** de l'acte (authentique : les
  notaires sont nommés en première page ; sous seing privé : en fin d'acte) est distincte de son
  **type** ; « AAE » dans un nom de fichier = acte authentique électronique.
- **Notaires** : priorité mention explicite (hors clause d'origine de propriété) > règle
  géographique (`REGLES_NOTAIRE_INSTRUMENTAIRE`, bien dans le 41) > ordre dans la zone attendue ;
  sinon rien n'est deviné. Le rôle de l'étude (instrumentaire/participant) est déduit du côté qui
  reçoit l'acte ; si un autre office représente l'acquéreur, les emails vont **au confrère**
  (« Mon Cher Maître, … Votre bien dévoué. ») et le questionnaire de satisfaction n'est jamais proposé à
  l'acquéreur ; il peut l'être **au vendeur** quand l'étude le représente (étude 02/10, `renderQuestionnaireVendeur`,
  `d.questionnaireVendeurEnvoyeLe` ; chaque envoi archive le dossier, l'autre reste proposé).
- **Responsables** : liste fermée (Bastien ANGLUMENT — administrateur, vue globale —, Julie
  VASSELIN, Jérémy SAUJOT).
- **Planning** (`echeancesPlanning`, miroir serveur `toutesEcheances` dans `jobs/rappels.js` — à
  modifier **toujours ensemble**) : vente préalable → obtention du prêt → *renonciation au droit de
  préemption* (bloquante hors copropriété, sauf pièce retirée ou participation ; en copropriété
  seulement si une pièce personnalisée « préemption/DPU/DIA » a été ajoutée) → *délai SAFER*
  (date butoir tirée d'Authentic, voir l'extension) → fixer le rendez-vous → envoi appel de fonds → envoi projet → signature. La **date butoir** est informative dès qu'un
  rendez-vous est fixé (hors planning et hors rappels). Une date d'envoi saisie vaut envoi fait.
- **Statut affiché d'un dossier = son état général** (étude, 29/09 au soir : `etatDossier`,
  `renderBadgeStatut`) : un seul badge partout (tableau de bord, Suivi, fiche, recherche) —
  « À relier » (jamais relié au NAS), « Attente de pièces » (pièce de la checklist ou offre de prêt
  manquante ; participation : l'offre seule), « Complet » (tout reçu), « Prêt » (complet + rendez-vous
  placé), et **« Urgent »** dès qu'une date butoir est dépassée (vente préalable, prêt, date butoir
  sans rendez-vous) — prioritaire, calculé, il disparaît dès l'échéance levée. Confirmé par l'étude :
  un rendez-vous placé avec une pièce manquante reste « Attente de pièces » ; une vente préalable non
  réalisée (financement, comme l'offre) empêche « Complet » et « Prêt ». Couleurs : rouge, gris, ambre, bleu `--acte`
  (jamais l'accent, qui peut être orange ou vert), vert. **Suivi** (30/09, choix de l'étude) : barre en trois lignes
  (`.suivi-barre`) — grande recherche (nom du dossier seulement ; le collaborateur passe par le filtre
  « Responsable », pré-réglé sur celui du poste à chaque session, **sauf l'administrateur, qui voit « Tous »** (étude 02/10) — `filtreSuiviParDefaut`, `appliquerFiltreSuiviCollaborateur`, reposé au changement de poste) + bascule de vue, filtres sur une ligne (« Trier par »
  en vue Tableau seulement ; « Archivés » cochée → section « Archivés » en bas de la vue Échéances,
  `archivesPourEcheances`, date de signature sinon d'archivage, jamais dans une semaine), statuts en pastilles de filtre (`syntheseEtatsSuivi`, `renderEtatsSuivi`) ; **à gauche** (colonne de 300 px comme celle de l'agenda, étude 01/10, `.suivi-corps`/`.suivi-cote` ; au-dessus sous 1100 px),
  `renderColonneSuivi` (étude 01/10 au soir, remplace « Prévu en {mois} ») : le **mois civil en cours** en quatre
  tuiles-filtres (`syntheseMoisSuivi`, `filtreMoisSuivi`) — à signer (rendez-vous dans le mois), à placer (sans
  rendez-vous, date butoir dans le mois ou déjà dépassée), ventes, successions (`d.typeAffaire`) —, puis
  « Dernières pièces » rattachées sur le commun (`dernieresPiecesTrouvees`, 14 jours, 10 au plus), puis le carré « Activité de l'étude — En direct » (même fil que le widget du tableau de bord, tous dossiers, `partiesActiviteEtude`, `renderActiviteColonneSuivi`). Refusés par
  l'étude : graphique par semaine, charge par collaborateur, montant des ventes, le mot « portefeuille ». **Vue Échéances : tous les dossiers** (étude 02/10) — une échéance par dossier, semaines puis « Plus tard » (au-delà de `SEMAINES_AFFICHEES`), puis **« Signés »** (acte signé dans Authentic ou signature marquée faite — `signatureFaiteSuivi` ; plus récent d'abord ; étude 02/10), puis « Sans échéance datée » (jamais omis, `grouperEcheancesParSemaine`) ; un dossier signé montre **« Signé le … »** en vert à la place de la date et « Acte signé » en Échéance, partout dans le Suivi (`texteSigneSuivi`). **Liste « intelligente »**
  (30/09) : section « Nouveau » (ex-« À voir en premier ») en tête (`signauxDossierSuivi`, `partagerAVoirSuivi`) —
  notifications (`piecesNotifications` : offre, pièces nommées) puis fonds tous reçus non confirmés ;
  le dossier en sort à l'ouverture de sa fiche, sans doublon dans la suite de la liste. **Colonnes, partout dans le Suivi** (vue Échéances, vue Tableau, « Nouveau », « Archivés » ; étude 01/10) : Date, Dossier, Échéance, Resp., Statut — `COLGROUP_SUIVI`/`ENTETE_SUIVI`, mêmes largeurs ; plus de colonne « Offre de prêt » en vue Tableau ; responsable en **initiales dans une pastille ronde** (`pastilleCollaborateur`, étude 01/10) ; bouton « Scanner le commun » (ex-« Revérifier tous les dossiers », `reverifierTousLesDossiers`) ; `statutDossier` (pièces trouvées) ne sert plus qu'aux points « À traiter ».
- **Seuils des rappels email** : prêt J-15/J-7, vente préalable J-15/J-7, appel de fonds J-15/J-10,
  signature J-25/J-15, personnalisées J-15/J-7 (`SEUILS_RAPPELS_PAR_TYPE`).
- **Relance de l'offre de prêt au client** : première à J-15, puis tous les 10 jours, y compris
  après l'échéance, jusqu'à réception de l'offre ou archivage.
- **Offre de prêt** : reconnue par le nom du fichier, à défaut par le titre de la page de garde
  (≥ 6 pages) confirmé par l'IA locale ; « à confirmer » si le modèle est indisponible. Garanties
  lues dans le seul paragraphe « GARANTIES », une garantie conditionnelle/future n'est pas comptée. Offre reçue sans garantie lue : « Garantie non identifiée »
  (`garantiesPretAffichees`), jamais un blanc.
- **Pièces du dossier** : reconnues **par le nom de fichier seulement** (`motifNom` +
  formes tolérantes `FORMES_NOM_PIECES`), jamais par le contenu (le compromis cite toutes les pièces).
  Une pièce validée à la main (`piecesValideesManuellement`) n'est jamais repassée en manquante.
  Une exclusion (« Réinitialiser ») est globale et stockée en base — elle est la première cause
  d'une pièce « jamais reconnue » malgré un nom correct.
  **Notification d'une pièce trouvée : une seule fois** par dossier + pièce + fichier (registre
  serveur `pieces-notifiees`, 30 jours, `dedoublonnerPieces` dans `routes/notifications.js`) ; une
  seule vérification NAS à la fois par dossier et par fenêtre (`verificationsDossierEnCours`).
- **Onglet Analyse de la fiche** (étude, 02/10) : chaque engagement du vendeur (`e.fait`, `faitLe`) et chaque
  document relevé (`doc.recu`, `recuLe`) se coche réalisé/reçu ; non coché → compté dans `piecesAttenduesDossier`
  (« Attente de pièces », libellé « Engagement : … » par `libelleCourtEngagement`) et dans
  `probabiliteTenueSignature` (facteur « engagement(s) du vendeur non réalisé(s) », « Relancer le vendeur ») ; jamais
  pour une participation (`elementsAnalyseEnAttente`). Un document qui est une pièce de la checklist
  (`cleChecklistDocumentAnalyse`) partage la case de l'onglet Pièces (validation à la main) et n'est compté qu'une
  fois ; un engagement dont toutes les pièces sont reçues est réalisé de lui-même (`etatEngagementAnalyse`, case
  grisée) ; cocher un engagement valide à la main les pièces de la checklist qu'il fait réclamer (`e.piecesValidees`,
  rendues au décochage). Notification Teams « dossier complet » seulement si l'analyse ne laisse rien en attente.
- **Dépôt de garantie** : toujours déduit de l'appel de fonds (l'agence reverse la somme) ; le
  détenteur dit seulement quoi réclamer.
- **Fonds reçus** (reçus comptables du NAS) : le client est le **titulaire** en début de ligne, et
  seulement le premier nommé d'un compte à deux noms, sauf si la référence de la vente
  (« VTE VENDEUR/ACQUÉREUR ») cite le vendeur du dossier ; une référence qui ne nomme personne du
  dossier écarte l'écriture. Reçus **gardés en mémoire** : les fichiers sont supprimés du commun une fois traités, un versement déjà
  retenu dont le fichier n'est plus relu reste compté (`fusionnerRecusMemorises`, `memorise`), retrait
  à la main seulement. Complet = montant attendu **à 50 € près** (`MARGE_FONDS_RECUS`, miroir
  serveur `bilanFonds`) ; au-delà, « excédent » à vérifier, jamais « complet ». Noms cherchés :
  parties acquéreurs (et leur `nomUsage`, lu dans l'état civil « Veuve/Épouse de Monsieur … NOM » par
  `nomsUsageDansBloc`) + nom du dossier + nom du courrier d'appel de fonds + `d.nomsRecus`.
- **Honoraires de négociation / fonds de travaux** (lus dans l'avant-contrat, 29/09) : honoraires
  seulement depuis une tournure « négocié(e)s par … » (jamais les honoraires du notaire pour la
  promesse ; « négociation directe » = aucun) ; fonds de travaux seulement sur une phrase qui tranche
  le remboursement. À la charge de l'acquéreur / remboursé → ligne au débit de l'appel de fonds.
- **Appel de fonds** : établi par l'office, ou repris du décompte du confrère quand l'étude est en
  participation. Prêt hypothécaire : montant du prêt **déduit**, frais de garantie **appelés au
  débit**. Taxe foncière : montant lu en page 1 (« Montant de vos taxes foncières », jamais la
  « somme à prélever ») et contrôlé en bas à droite de la page 2 (entier nu possible) ; avis sur
  plusieurs biens (lus en page 2 par position, `biensAvisTaxeFonciere`) → **le bien vendu est demandé**
  (présélectionné si l'adresse du dossier le désigne) et les **frais de gestion de la fiscalité directe
  locale** (impôt − somme des biens) sont répartis par produit en croix au prorata de la TF de chaque
  bien, ajoutés au bien vendu (étude, 30/09 — plus la TEOM) ; pièces déposables par glisser-déposer,
  type reconnu sur la page 1 (`deposerPiecesOutil`) ; prorata acquéreur du jour de l'acte au 31/12. **Pièces lues sur exemples réels (30/09,
  `tests/pieces-appel-fonds.test.js`)** : appel de charges du syndic (`analyserAppelCharges` :
  période « du … au … », « Montant de l'appel » avant « Total à payer », montants à point décimal
  `montantSyndicDepuisTexte`) → prorata de charges du jour de l'acte à la fin de la période, **hors
  cotisation au fonds de travaux** (attachée au lot, réglée par l'avant-contrat — case décochable,
  règle à confirmer par l'étude) ; état daté (`fondsTravauxDepuisEtatDate` : rubrique B12 « part
  dudit fonds rattachée au lot », « fonds travaux attachés aux lots vendus », « montant du fonds
  ALUR », « pas de fonds ALUR » ; jamais la cotisation exigible ni l'avance d'exercice) → ligne
  « Remboursement du fonds de travaux » seulement si `d.fondsTravaux.rembourse !== false` ; relevé
  de compte client JurisWeb (`analyserReleveCompteClient`, colonne Débit/Crédit par position des
  items) → acomptes sur prix et sur frais versés à l'étude, qui **remplacent** la ligne d'acompte du
  dossier (même somme), reversements au confrère signalés. Rien n'est enregistré sur le dossier.
- **« Nouveau dossier » : trois façons de commencer** (étude, 02/10, `MODES_IMPORT`, `choisirModeImport`,
  `renderChoixImport`) — « Compromis (PDF) » puis « Compléter depuis Authentic » (`groupesAuthenticPourCompromis` :
  le dossier du compromis lu en tête) ; « Dossier Authentic » : un dossier relevé est
  « Repris » sans quitter l'étape 1, puis le compromis déposé dessous le complète (`exportAuthenticActuel` gardé hors
  mode PDF) ; **« Dossier Authentic seul »** (`seul`, étude 02/10, à la place de l'export ZIP retiré) : sans compromis,
  repris d'un clic puis « Vérifier » (vente : aucune date exigée) ou directement « Finaliser » (succession, assistant
  réduit `#panel.wizard-succession` : nom, bien, responsable, pièces d'Authentic — `.vente-seul` masqués). **Un seul dossier par création** (étude 02/10) : `creationDossierEnCours` (bouton « Enregistrement… »), confirmation si un dossier en cours a le même nom ou le même numéro Authentic (`dossierDejaPresentPourCreation`). Étapes Vérifier/Finaliser : `sourcesImportWizard` (ce qui vient du compromis / d'Authentic, ce qui manque).
  Notaires à la création : lus dans l'acte et dans Authentic (`notairesProposesWizard`), placés d'un clic (vendeur,
  acquéreur, les deux), « Notaire qui reçoit l'acte » (`f-cote-instrumentaire`), rôle de l'étude déduit
  (`roleEtudeDeduitWizard`). **Un notaire cité sans son côté reste vide (jamais deviné) mais n'est plus caché** : fiche
  « Lus, à placer » (`notairesNonPlacesDossier`, `placerNotaireFiche`) au lieu d'une ligne repliée.
- **Données d'un dossier Authentic** (format commun `{ intitule, personnes, immeubles, parties, documents,
  infosAuthentic }`, construit depuis les pages relevées par `dossiersDepuisRelevesAuthentic`) : parties par
  l'intitulé « VTE VENDEUR / ACQUÉREUR » (une personne absente de l'intitulé n'est pas partie) ; les données
  structurées priment sur le texte (`completerExtractionDepuisAuthentic`, origine « Reprise d'Authentic ») ; pièces
  reconnues par nom → reçues « à la main ». **L'import d'un export ZIP (30/09) est retiré depuis le 02/10** (étude :
  la lecture d'Authentic le remplace ; un .zip déposé est refusé avec un message) — perdu par rapport au ZIP : les
  fichiers eux-mêmes (avant-contrat signé lu sans dépôt du compromis, PDF des pièces, Word de l'acte en cours), les
  qualités Disposant/Bénéficiaire du flux, le notaire de chaque partie et son rôle (participation), la date de création
  du dossier Authentic, la surface habitable.
- **Successions** (étude 02/10 : « juste des parties et éventuellement des biens ») : intitulé « N - Succession NOM »
  (ou « SUCC NOM », **forme supposée, à confirmer sur une vraie page**) reconnu par le poste
  (`RE_INTITULE_DOSSIER_AUTHENTIC`, `RE_INTITULE_SUCCESSION_AUTHENTIC`), le serveur (`pageAuthenticConnue`) et
  l'extension (0.3.4) ; rapproché par le nom (`scoreDossierAuthentic` : identique 6, proche 4, dossiers de succession
  seulement). Dossier `typeAffaire: 'succession'`, `sansPret`, `parties` = toutes les personnes ouvertes (rôle
  `PARTIE`, qualité jamais devinée, téléphones/emails gardés — reconnus par 3CX), `biens` (`biensDepuisAuthentic` :
  adresse, type, parcelles). **`estSuccession(d)`** neutralise la vente : planning = signature placée + échéances
  ajoutées (miroir serveur `toutesEcheances`), checklist = pièces personnalisées seules, pas de préemption ni de
  créneaux proposés ni d'emails de vente, fiche = responsable, NAS, parties, biens. Planning et checklist propres aux
  successions : à définir avec l'étude.
- **Classeur des scans du copieur** — nom affiché **« Claire Scan »**, **bannette à papier** (icône `bannette`, `#tab-scans`) avec pastille du nombre de scans à ranger, dans la rangée d'icônes sous le logo de la barre latérale (étude, 30/09 — visible barre repliée et sur téléphone) (30/09, `TYPES_SCAN`, `propositionScan`, `server/src/scans.js`) :
  dossier du copieur = **`\\192.168.60.5\Scan`, partage à part** du NAS (étude, 30/09) — trouvé
  comme `\\serveur\Scan` du serveur de `nasRacine` (`partagesScansCandidats`), sinon un dossier
  « Scan » dans `nasRacine` ou ses parents, ou `nasScans` dans config.json. **Surveillance de fond dès le démarrage**
  (`demarrerSurveillanceScans`, tôt dans `demarrerApplication`) : réessai toutes les 20 s tant que le
  dossier n'est pas trouvé, puis toutes les 2 min ; le serveur retient le dernier dossier trouvé. **Seuls les nouveaux
  scans** : `depuis` = heure exacte de l'activation (les scans déjà présents ne sont jamais touchés),
  ou une date choisie dans les réglages. Lecture dans le navigateur (pdf.js, OCR tesseract.js des 2 premières pages d'un scan
  sans texte). **Type de pièce lu sur le haut de la page 1 seulement** (1 500 caractères), la mention
  la plus haute l'emporte ; un acte notarié (« L'AN DEUX MILLE… ») est une promesse/un compromis s'il
  le dit, sinon un titre de propriété — jamais compter les mots de tout le document (un compromis cite
  toutes les pièces : le script Python d'origine classait 5 états datés sur 5 en « règlement »).
  **Dossier** : barème `BAREME_SCORE_SCAN` (celui du script de l'étude, qu'elle souhaite garder) —
  partie nommée (tous ses mots, ou nom d'usage + prénom) 3 pts, deux au plus ; voie de l'adresse du
  bien 4 ; parcelle 5 ; sûr à 4 (abaissé de 6 par l'étude le 30/09) et ×1,3 devant le second, sinon suggestion ; score affiché **sur 6, plafonné** (`noteScoreScan`, « 6/6 » dès 6 points, comparaisons sur le score brut) avec le détail des points
  (`explicationScoreScan`) et journalisés. **Copie
  nommée du libellé de la pièce de la checklist** (« État daté - Claire Scan », sans date ni référence du scan — « Nom (2) » si le nom existe) pour que le
  parcours du NAS la coche seul ; « Compromis signé » / « Promesse de vente signée » pour
  `choisirAvantContratNas`. **Rubrique retrouvée par son nom** (`RUBRIQUES_SCANS`, numéro ignoré),
  racine du dossier à défaut ; pièce d'identité / état civil / RIB → Vendeur ou Acquéreur selon la
  partie reconnue. **Rangement automatique sans validation** (demandé le 30/09, actif par défaut,
  désactivable) : dossier sûr + pièce identifiée + dossier relié au NAS ; fait par UNE fenêtre CLAIRE
  ouverte à la fois (relais `/api/scans/relais`, poste serveur prioritaire, relais repris par une
  autre fenêtre après 5 min de silence) ; jamais retenté seul après un échec. **Après chaque
  rangement** (main ou auto, `enregistrerPieceRangee`) : pièce de la checklist cochée, sinon pièce
  personnalisée au libellé de la copie ajoutée puis cochée (`pieceDepuisScanRange`, validée à la main),
  fichier mémorisé, notification Teams immédiate (offre de prêt et avant-contrat exclus : parcours
  du NAS). Carte « Dernières pièces » : pièces reçues, puis scans à ranger et scans rangés sur 14 jours
  (`scansPourCarte`). **Aperçu** (01/10) : vignette de la page 1 sur chaque scan, fenêtre de toutes les pages au
  clic (`ouvrirApercuScan`) ; « Ranger » / « Laisser dans Scan » tournent jusqu'à la liste relue. **OCR d'un scan : `page.render(… intent: 'print')`** — en « display », pdf.js 3.11 cadence
  le dessin sur `requestAnimationFrame`, arrêté fenêtre réduite/cachée (lecture bloquée sans fin). Un pré-état daté n'est
  pas un état daté (checklist corrigée le même jour).
- **Page Agenda** (30/09, `renderPageAgenda`, **à la manière d'Outlook** — étude, 30/09 au soir : « plus
  professionnel, pour ne pas dépayser les collaborateurs » ; lien juste sous le tableau de bord) : une carte,
  en tête les trois lettres du jour (étude 01/10, d'après « Wed. » puis « en français, pas de fond de couleur, juste les 3 lettres et le point » : « Jeu » + point orange `--cat-orange`, couleur du texte, « Oct » en vue Mois — `motPastilleAgenda`, `.ag-pastille-jour`), date suivie sur sa ligne de ‹ Aujourd'hui › et « Aller à une date » (étude 02/10, `.ag-titre-ligne`, date de largeur fixe pour que les boutons ne bougent pas), liste Vue mois/semaine/jour, « Nouveau rendez-vous » ;
  Semaine (lundi → samedi, **8 h – 19 h**, `AGENDA_HEURE_DEBUT/FIN`, étude 01/10 ; 60 px l'heure, `AGENDA_PX_HEURE` = `--ag-heure`) · Jour · Mois (`agendaVue`, `agendaJour` ; Jour par défaut sur
  téléphone), en-têtes « Lundi / 28 sept. 2026 », colonne du jour teintée, trait de l'heure ; rendez-vous =
  liseré gauche + fond clair de la couleur Outlook, heure de début, de fin et durée (`dureeRendezVous`) ;
  **sur un rendez-vous d'un dossier, comme dans Outlook : responsable (prénom), confrère (`confrereLieuAgenda`),
  appel de fonds fait (`echeanceValidee`), décompte acquéreur fait et projet envoyé** (`decompteAcquereurFait` : courrier
  d'appel de fonds/décompte trouvé sur le NAS ou lu pour les fonds reçus — choix de l'étude) —
  `infosRendezVousDossier`. Trait rouge de l'heure mis à jour toutes les 30 s (`traitHeureAgenda`, `majTraitHeureAgenda`). **Historique** (01/10) : avant le stock, chaque mois affiché est lu à la demande dans Exchange puis gardé (`GET /api/agenda/passe`, clés `agenda-archive:AAAA-MM`, plus relu une fois stabilisé), en lecture seule ; **Recherche d'un dossier** dans l'en-tête de la page, à la place du bouton « Actualiser », au style du champ du Suivi et **qui filtre l'agenda comme le Suivi filtre sa liste** (étude 01/10, `evenementsFiltresRecherche` : titre, lieu, dossier ; nombre trouvé + « Tout afficher » sous la date) ; liste dessous (`resultatsRechercheAgenda`) : le nom mène au rendez-vous (`allerAuDossierAgenda` : jour de la signature et son détail, sinon semaine probable et sa carte fantôme, sinon la fiche), l'icône « fiche » ouvre la fiche (`ouvrirFicheDepuisRechercheAgenda`) ; « Actualiser » = icône à côté de « Agenda de l'office lu … » (`actualiserAgenda`). « Aller à une date » dans la barre (icône calendrier seule, sans date affichée à côté d'« Aujourd'hui » — étude 01/10, `ouvrirAllerDateAgenda`). **Comparaison avec l'an dernier** (01/10) à côté de « Agenda de l'office lu… » : rendez-vous horaires **d'une heure ou plus** lun→sam (hors journées entières et options ; étude 01/10, `DUREE_MIN_RENDEZ_VOUS_COMPTE`, semaines gardées marquées de la règle `REGLE_COMPTAGE_RENDEZ_VOUS`, relues si elle change) vs la même semaine 52 semaines plus tôt, lue une fois dans Exchange puis gardée (`GET /api/agenda/comparaison`, clé `agenda-comparaison`). Colonne de gauche : mini-calendrier du mois (sans légende des couleurs, étude 30/09), « Dates proposées » juste dessous, puis anticipations (« Signatures de la semaine » retiré le 01/10) ;
  **détail du rendez-vous choisi dans une fenêtre posée sur l'agenda, à côté du rendez-vous cliqué**
  (étude, 30/09 : « dans un popup, pas à gauche » — `agendaSelection`, `renderPanneauDetailAgenda` dans
  `#agenda-popover`, `renderPopoverAgenda`/`positionnerPopoverAgenda`, ancre `data-cle` ; feuille au bas de
  l'écran sur téléphone ; fermée par ×, Échap ou clic ailleurs). **Vue Semaine** : nom du dossier en
  entier sur plusieurs lignes (`lignesTitreEvenement`), puis heure de début + initiales du collaborateur
  (+ confrère), sans heure de fin ni durée (`renderEvenementSemaine`) ; **création comme dans Outlook** (étude, 30/09) : un clic
  sur une case vide surligne un créneau d'1 h à la demi-heure près (`choisirCaseAgenda`, `heureCaseAgenda`,
  `agendaCaseChoisie`), un double-clic (01/10 : à la souris, un second clic simple déplace le créneau ; au clavier et au doigt, un second appui) ouvre « Nouveau rendez-vous », 1 h par défaut ; rendez-vous lus par le serveur (stock `agenda-office`, tenu à jour à la création/suppression
  depuis CLAIRE entre deux tours) ; signatures de CLAIRE absentes d'Outlook en pointillé. Agenda
  « intelligent », **sans IA, chaque point expliqué** : `probabiliteTenueSignature` (97 % moins des
  retraits pondérés par la proximité : financement, vente préalable, préemption, pièces, envois, fonds,
  collaborateur absent), `creneauxProposesSignature` (dossiers de `dossiersAPlacer`, un créneau par jour
  ouvré, ≥ 14 jours, hors fériés `joursFeriesFrance`, absences, chevauchements ; **règles de l'étude,
  30/09 : jamais à 9 h, ni entre 12 h et 14 h, ni après 18 h, 6 rendez-vous par jour au plus** —
  `motifCreneauExceptionnel` ; une exception n'est proposée qu'à défaut de tout créneau normal, marquée,
  et une création manuelle hors règles se confirme),
  **semaine probable d'une signature pas encore placée** (étude, 30/09 : « au plus tôt ») —
  `semaineProbableSignature` : max(aujourd'hui + 14 j, offre de prêt attendue — date de la condition ou
  aujourd'hui si dépassée — + 11 j de réflexion, vente préalable), jour ouvré ; probabilité = celle de
  `probabiliteTenueSignature` à cette date − 10 (non fixé) − 15 (après la date butoir) ; « Rendez-vous à
  placer » les liste par semaine, et la semaine affichée porte une **carte fantôme** en pointillé
  (`fantomesSemaineAgenda`, premier créneau libre dans les règles, clé `probable:<id>`) — **sauf rendez-vous « ?? » en attente de confirmation** dans l'agenda (étude 02/10, `rendezVousAConfirmerDossier` : sa date fait la semaine probable, « À confirmer », pourcentage sur le rendez-vous, −5 pts, ni fantôme ni créneaux) dont le détail
  propose « Placer » (confirmé) et **rappelle la date butoir** (étude 02/10, `rappelButoirSignatureProbable` : jours restants, marge < 7 j ou dépassement en rouge) ; **notes d'un rendez-vous = son corps dans Outlook** (choix de l'étude,
  `GET/PUT /api/exchange/evenement/notes`, GetItem/UpdateItem du seul `item:Body` en texte brut, lues à
  l'ouverture du détail, jamais journalisées ; la mise en forme HTML d'un corps n'est pas gardée à
  l'écriture),
  **Visio ADNOV** (01/10) : sur un rendez-vous en visio, « Créer la visio » ouvre `https://ls.visio.adnov.fr/` ;
  l'invitation `.ics` rendue, déposée sur l'agenda ou choisie dans le détail, n'est **jamais ajoutée à part** :
  son lien (`lireInvitationIcs`) est écrit dans les notes du rendez-vous de même date et même heure
  (`notesAvecVisio`, bloc « Visio ADNOV : … » remplacé à l’invitation suivante), puis « Rejoindre la visio ». « Envoyer le lien » prépare l'email aux clients et/ou au confrère (`corpsEmailVisio`, premier jet de CLAIRE) avec les informations de connexion relues dans la note (`blocVisioDansNotes`).
  `gestesRelationClient` (rappel J-3…J-1, confirmation J-45…J-3 une fois par date `confirmationRdvPour`,
  questionnaire J+1…J+14, un mot un an après — **jamais quand un confrère accompagne l'acquéreur**,
  étude 01/10) : ces emails vivent dans l'**onglet Échanges de la fiche** (`echangesSelonStade`, utiles quand ils sont
  dus ou faits), plus dans la barre de l'agenda (retirés le 01/10). **Couleur d'un
  rendez-vous = celle d'Outlook** (étude, 30/09) : couleur nommée dans la catégorie
  (`couleurCategorieOutlook`, jetons `--cat-*`), sinon type réglé (office/visio/confrère), sinon
  absence, signature, autre — page Agenda et fenêtre du matin. **Absences et dates butoir en rose** (étude, 01/10, avant la
  couleur Outlook ; absences rayées ; `estDateButoirAgenda`). Fenêtre du matin : « À faire » à gauche,
  onglets Agenda du jour · Emails · Nouveautés à droite (`ongletFenetreJour`), 660 px de haut au plus. Emails de confirmation,
  rappel et anniversaire = **premiers jets de CLAIRE**, à remplacer par les textes de l'étude.
- **Sondage de créneaux de signature** (01/10, « comme un Doodle », `server/src/sondagesCreneaux.js`,
  `routes/sondages.js`, client `ouvrirSondageCreneaux`/`renderSondageDossier`) : rien d'hébergé — un
  `.eml` aux clients ensemble (et un par confrère, formule d'usage) dont chaque bouton est un `mailto:`
  vers la boîte du compte Exchange, objet `[CLAIRE-CODE-n]` (0 = aucun) ; le serveur relit les **objets**
  (FindItem, 5 min, même disjoncteur que l'agenda), un email par créneau accepté ; plus « Répondre en une
  seule fois » (`[CLAIRE-CODE-L]`, étude 01/10) : cases `[ ]` à cocher d'un X, seul cas où le **texte** d'un
  email est lu (GetItem de ces réponses-là, numéros cochés gardés, texte jamais conservé).
  **Page de réponse** (étude, 01/10 — `page-sondage/index.html`, à publier dans un dépôt GitHub public
  dédié avec Pages, adresse dans Réglages › Agenda et Outlook › Sondages de créneaux, `pageSondage` des réglages Exchange) :
  vraies cases à cocher, **aucune donnée côté GitHub** (tout est après le `#` du lien, rendu en
  `textContent`), à la manière de Rallly avec le logo de l'office (dépôt public **blursquare/Claire-rdv**,
  copie de `page-sondage/`), vote **Oui / Si nécessaire / Non** ; réponse par un seul email d'objet
  `[CLAIRE-CODE-P13S2] VTE - MOR./FAU. — Oui : … · Si nécessaire : …` (S = si nécessaire, P0 = aucun ;
  remplace les choix ; « possible pour tous » = oui ou si nécessaire).
  **Relais Google** (étude, 01/10 — `page-sondage/relais-google-apps-script.gs`, Apps Script déployé
  sur le compte Gmail de l'étude, adresse `/exec` dans la même section, `relaisSondage`) :
  la page lui poste la réponse (texte brut, sans prévol CORS), il l'envoie par email à une adresse FIXÉE
  dans le script (jamais choisie par la page), objet contrôlé, 200/h ; repli sur la messagerie du client
  s'il échoue. L'expéditeur devenant le Gmail de l'étude, chaque destinataire a un **code personnel**
  (`cle`, 4 car., `attribuerCles`) dans son lien et dans l'objet (`…-P13S2-Q7AB]`) qui le désigne ; un
  code inconnu est écarté. Le lien porte le rôle (`w`), jamais le nom. Le dossier n'apparaît qu'**abrégé** (`abregeDossierSondage`,
  3 lettres par nom de famille) sur la page et dans les objets de réponse. Réglage vide = boutons. Options
  « Provisoire » `VTE - NOM ? — option CLAIRE, créneau n/N` (le « ? » n'écrit rien sur la fiche),
  hachurées dans l'agenda, retirées (`MoveToDeletedItems`) au placement, à l'annulation ou après
  5 jours ouvrés. Votants par défaut : les clients, ou le confrère qui représente une partie. Aussi offert depuis le formulaire « Nouveau rendez-vous » (« Proposer plusieurs dates », créneau saisi en tête, `proposerPlusieursDatesAgenda`). **Sans dossier** (01/10) : sondage au `titre` libre (destinataires libres, dont confrère ; options « Titre ? — option CLAIRE » ; page `t=r`), lancé par la moitié droite du bouton double « Nouveau rendez-vous | Proposer des dates » de l'en-tête de la page, à droite du champ de recherche (étude 01/10, `.ag-ajout-double` dans `#agenda-creation`), suivi dans le volet à droite **« Dates proposées »** (tiroir comme une fiche, étude 01/10, lien sous le mini-calendrier, `ouvrirSuiviDatesProposees`, `classerSuiviDatesProposees` : en attente — tableau des réponses, Placer/Relancer/Relire/Annuler —, validées — date retenue, « Voir dans l'agenda » —, sans suite ; tous les sondages, avec ou sans dossier ; **pastille rouge sur « Agenda » dans la barre latérale** quand une réponse revient — `reponsesNonVuesSondages`, repère `claire-dates-vues:<poste>` en localStorage, effacée à l'ouverture du volet), « Placer » crée un rendez-vous ordinaire. Textes =
  premiers jets de CLAIRE. **Email du vendeur** (`d.emailVendeur`) : wizard, fiche, lecture de l'acte
  (`detecterEmailVendeur`) et d'Authentic ; masqué si le vendeur a son propre notaire, sauf déjà saisi.
- **Appels 3CX** (01/10, choix de l'étude : « noter + ouvrir la fiche », téléphones sur les fiches) : 3CX
  ne donne pas d'historique ; son « Intégration CRM » (client web, réglage de chaque collaborateur, CRM
  personnalisé, « Informer lorsque : Sonnerie ») ouvre `/appel?numero=%CallerNumber%&nom=%CallerDisplayName%&poste=<prénom>`
  (adresses à copier dans Réglages › Téléphonie 3CX, `adresseIntegration3cx` ; poste = prénom sans accent, jamais un
  nom encodé que 3CX prendrait pour une variable). Réglage V20 : client web seulement (« Auto launch a Custom Contact URL », pop-up autorisées), `%CallerDisplayName%` y vaut « undefined » (`valeur3cx`) ; le serveur compare les postes par `clePoste` ; Réglages › Téléphonie 3CX montre, par collaborateur, fenêtre CLAIRE ouverte et dernière sonnerie reçue (`GET /api/appels/postes`) — « Aucune sonnerie reçue » après un appel = côté 3CX. Le serveur note l'appel (`appels-recus`, 400 jours, hors
  session, aucune donnée renvoyée, jamais journalisé) et reconnaît l'appelant (`reconnaitreAppelant` : 9
  derniers chiffres ; `d.telephoneVendeur`/`d.telephoneAcquereur` — onglet Échanges, repris d'Authentic —,
  puis carnet des confrères et ses dossiers, puis répertoire). La fenêtre CLAIRE relève toutes les 3 s, même
  cachée (`releverAppels`), montre le bandeau « Appel entrant » (en bas à gauche ; fermé seul 45 s après la sonnerie — 3CX ne signale pas la fin d'un appel, choix de l'étude 02/10 contre le journal CRM de 3CX —, en pause au survol, fermé à l'ouverture d'une fiche depuis le bandeau) et ouvre la fiche (Échanges) d'un seul dossier
  en cours, jamais pendant une saisie ; l'onglet ouvert par 3CX se ferme si la fenêtre du poste est visible,
  sinon il affiche CLAIRE sur l'appel (`#appel=`). Appels du dossier dans l'onglet Échanges. **Coupé collaborateur par collaborateur** (étude 02/10, interrupteur sur sa ligne dans Réglages › Téléphonie 3CX, clé `telephonie-3cx` `postesCoupes`) : ses sonneries ne sont plus notées, sa fenêtre ne relève plus rien.
- **Mobilier** : le prix reste le prix total ; `d.prixMobilier` sort seulement de l'assiette des
  droits (frais d'acte, contrôle du barème).
- **Prorata** : jours réels, jour de l'acte à la charge de l'acquéreur, arrondi du vendeur par
  complément.
- **Textes d'emails fournis par l'étude** (provision, prêt manquant, RIB, réception des fonds,
  questionnaire, vente préalable au confrère) : repris **mot pour mot**, à ne pas reformuler.
  Même règle pour `PROCEDURE_FONDS` et les clauses de l'annexe des quotités. Exception : l'email
  d'envoi du **projet d'acte** (`construireEmailProjetActe`, 30/09) est un premier jet de CLAIRE,
  à remplacer par le texte de l'étude dès qu'elle le fournit.
- **Barème du simulateur de provision : jamais audité.** Indicatif seulement, jamais recopié dans
  un courrier ; le contrôle du barème de l'appel de fonds est un signal, il ne remplit rien.
- **Répertoire** (Outils, 30/09 ; présentation revue le 02/10 : thèmes dans une colonne à gauche `renderNavRepertoire`, une
  ligne compacte par office/interlocuteur `renderLigneOfficeCarnet`/`renderLigneContactRepertoire`, modification dans la ligne) :
  **une seule entrée « Notaires »** (étude 02/10, carnet et annuaire faisaient doublon) : par département, chaque office du
  carnet remplace sa ligne de l'annuaire (`officesNotairesDepartement`, modifiable), « Mes confrères seulement » = tout le carnet ;
  le carnet reste la donnée de travail (rapproché des fiches, 3CX en premier) ; **« Notaires de France »** (02/10, `server/src/annuaireNotaires.js`, données
  `server/src/data/annuaire-notaires.json`, relevé immonot de 7 202 offices par `server/scripts/releve-annuaire-notaires.py`) :
  référence en lecture seule par département (un à la fois : 41 puis le dernier consulté, voisins d'un clic, lignes compactes par ville, recherche qui filtre le département puis « Ailleurs en France » — `renderAnnuaireNotaires`), jamais versée d'office dans le carnet (homonymes ; déjà au carnet = même id, email ou téléphone, `officeCarnetPourAnnuaire`) — « Ajouter au carnet » office
  par office ; recherche nationale (50 au plus) ; repli de 3CX (`carnetEtAnnuaire`) ; `require` au chemin littéral (un chemin
  calculé ne serait pas embarqué dans le .exe, un fichier absent casse la construction) ; autres thèmes = `repertoire.js` (clé `repertoire-contacts`, relevé du répertoire Word
  de l'étude du 02/09/2026, coordonnées d'organismes, jamais de client) — `THEMES_REPERTOIRE` côté
  serveur, repli identique dans `repertoireThemes` côté client. Rien n'y est deviné : une adresse
  douteuse du document est signalée en note, pas corrigée.
- **Rendez-vous retiré de CLAIRE** → retiré aussi de l'agenda (et repère `rendezVousRetire` pour
  que le flux ne le remette pas). Une date saisie à la main n'est jamais écrasée par l'agenda.
- **Apprentissage** : corrections de classification (dates, engagements) et exclusions stockées en
  base, partagées entre postes. Les valeurs libres (nom, adresse, prix) ne sont pas apprises.

## Relecture d'actes (Outil 2) — état actuel

Quatre étapes : documents (dépôt ou dossier NAS complet) → pseudonymisation (vérifiable) →
analyse par API → bilan (carte de santé, grille de points par thème, clauses contradictoires,
aperçu PDF à la page citée, coût). La grille (`GRILLE_RELECTURE_OUTIL2`) vit côté client et dépend
du mode (avant-contrat / projet de vente) et du **type de bien** (maison, copropriété, terrain),
choisi avant l'analyse. Chaque citation est **vérifiée mot pour mot** côté serveur ; un point omis
ressort « à vérifier », jamais « validé ». Les commentaires de l'étude (mode commentaires) sont
renvoyés au modèle comme consignes, après pseudonymisation. Les analyses sont enregistrées en clair
sur le serveur (table `relectures`), la requête pseudonymisée dans `analyses_claude`. Les contrôles
déterministes de CLAIRE (sans IA) complètent l'analyse et fonctionnent sans clé API.
Plainte principale de l'étude : **le bruit**, pas les oublis — ne pas élargir de motif sans acte réel.

## Pièges techniques déjà payés

- **Le texte pdf.js n'a qu'un retour à la ligne par PAGE** (items joints par une espace). Toute
  regex ancrée sur `^`/`\n` est fausse sur ce texte ; utiliser `lireTextePdfEnLignes()` (lignes
  reconstruites par position verticale) quand il faut de vraies lignes. Piège payé trois fois.
- **`\b` et les lettres accentuées** : `\b` ne se place jamais à côté de `é`/`É` (`\w` = ASCII).
  Utiliser des lookarounds `(?<![A-Za-z0-9_À-ɏ])` / `(?![A-Za-z0-9_À-ɏ])`.
- **Écrire une regex via un script Python** peut insérer un BACKSPACE (U+0008) à la place de `\b`.
  Contrôle obligatoire : `grep -c $'\x08' script.js` doit rendre 0.
- **Noms de fichiers macOS en NFD** : `normaliserNomPourMotif` normalise en NFC (et `_`/`-` → espace).
  Si un nom « évidemment correct » ne matche pas, comparer les points de code.
- **`onclick="f('…')"`** : l'attribut est décodé en HTML avant d'être exécuté en JS — `&#39;`
  redevient une apostrophe brute. Utiliser `escapeOnclickArg()` pour un argument JS, `escapeAttr()`
  pour un vrai attribut.
- **Spécificité CSS** : `input[type="text"]` bat un simple `input.ma-classe` à égalité par l'ordre
  du fichier — utiliser un sélecteur composé (déjà rencontré sept fois). Une piste de grille `1fr`
  ne descend pas sous son contenu : `> * { min-width: 0 }` contre le débordement horizontal.
  L'attribut `hidden` perd contre une règle `display` : basculer par `style.display`.
- **`fetchAvecAuth` n'ajoute pas `Content-Type: application/json`** : tout appel avec un corps JSON
  doit le poser, sinon le serveur reçoit un corps vide.
- **Dates EWS** : Exchange rend tout en UTC ; un rendez-vous « toute la journée » commence à minuit
  de Paris exprimé en UTC (la veille à 22 h l'été) et finit à minuit du lendemain du dernier jour.
  Toujours convertir par `momentParisDepuisIso` (jamais `slice(0, 10)` sur la chaîne UTC).
- **Icône de la barre des tâches Windows** : la fenêtre CLAIRE (Chrome `--app`, non installée) ne
  donne à Windows que le favicon 16 px. L'icône nette vient du raccourci `CLAIRE.lnk` du menu
  Démarrer que crée le serveur (`raccourciWindows.js`, même AppUserModelID que la fenêtre, icône de
  l'exe) — confirmé par l'étude le 29/09. Ne jamais ajouter de favicons PNG (`icone.svg` seul) :
  Chrome prendrait le 16 px. Changer le profil `ClaireServeur` ou l'URL change l'identifiant.
- **Un test qui ferme une ressource en dernière ligne** (au lieu d'un `after`) fait pendre la suite
  au premier échec. Diagnostiquer avec `timeout` fichier par fichier.
- **Un filet posé après l'endroit qui tombe ne protège rien** : `erreur-demarrage.txt` et le
  gestionnaire d'erreurs sont installés avant la lecture de `config.json` (antislashs simples d'un
  chemin Windows = JSON invalide).
- **Leçons de méthode** : rejouer un PDF réel page par page plutôt que relire les regex ; mesurer
  le rendu (pixels, `getBoundingClientRect`, taille réelle d'une icône) plutôt que le déduire ;
  vérifier avant d'accuser le dernier chantier (rejouer l'ancien commit) ; sur un point de droit
  notarial, **demander la règle sous-jacente** avant d'encoder le symptôme ; ne jamais déclarer un
  bug corrigé sur une déduction.

## Conventions de travail

- **Versionnage** : à chaque commit qui change le comportement, mettre à jour `VERSION_APP` **et**
  ajouter une entrée en tête de `HISTORIQUE_VERSIONS` (haut de `script.js`), heure de Paris :
  `TZ='Europe/Paris' date '+%Y-%m-%d %H:%M'` (jamais `date` seul : l'environnement est en UTC).
  C'est ce que l'étude lit dans « À propos ».
- **Poser les questions de cadrage** (`AskUserQuestion`) quand une demande admet plusieurs
  lectures, surtout en droit notarial ou quand l'action écrit dans un agenda/une boîte partagés.
- **Garder l'interface cohérente** : jetons CSS existants (`--focus` = accent du thème choisi,
  couleurs de catégorie fixes), icônes SVG du jeu `ICONES`, composant `.dot-label` pour les statuts,
  pas d'emoji comme icône, pas de couleur inventée. Mode clair et sombre, largeur téléphone.
  **Tout geste** (email, préparer, noter, créer…) est une ligne d'action `renderLigneAction` (forme
  de « À faire », même titre et même verbe qu'elle pour le même geste) ; tout « Ajouter … » est un
  `button.bouton-ajout` ; l'édition d'une donnée passe par des icônes (crayon, ✓, ×) ; seuls les
  formulaires gardent des boutons classiques.
  **Barre latérale** (01/10) : pas de titres de section, des liens seulement ; « Outils » = page à grosses
  icônes (`OUTILS_PAGE`, `renderPageOutils`) — tout nouvel outil y est ajouté ET dans le tiroir
  (`#sidebar-sousmenu-outils`, ouvert par le + `#sidebar-groupe-outils`) ; compteurs en carré arrondi rouge.
- **Nom d'un dossier cité (étude, 30/09)** : partout (écrans, cartes, toasts, journaux, Teams), toujours
  par `libelleDossierAffiche(d)` — « VTE - NOM », « SUCC - NOM » pour une succession — ou
  `libelleDossierParNom(nom, id)` quand seul le nom a été gardé ; jamais `d.nom` brut à l'écran.
  `d.nom` brut reste pour l'édition du champ, la recherche, le rapprochement NAS, les emails au client
  (textes de l'étude mot pour mot) et les titres des dates butoir de l'agenda (repris tels quels).
- **Formats (étude, 29/09)** : tout montant en euros passe par `formaterMontantEuros`
  (`formaterPrix`/`formaterPrixCentimes`, « 360.000,00 € », miroir `formaterEuros` dans
  `jobs/rappels.js`) et toute saisie de montant par `eurosDepuisSaisie` (jamais « ne garder que les
  chiffres » : « 250.000,00 » deviendrait 25 000 000). Toute adresse passe par `normaliserAdresse`
  (format « SAINT-AIGNAN (41110), 2 rue des Cours de Meusnes » : commune en capitales, tirets et
  CEDEX gardés) ; le destinataire d'un courrier garde la forme postale (`adressePostaleCourrier`).
- **Tableau de bord en widgets** (29/09, comme iOS) : grille de **4 colonnes** (2 sur écran étroit) à
  rangées de hauteur fixe ; deux réglages par carte : **largeur** (petit = 1 colonne, moyen = 2, grand =
  toute la ligne) et **hauteur** (1, 2 ou 3 rangées), toutes combinaisons permises. Le contenu suit la
  place (`varianteWidget` : une case = chiffre clé, une rangée = liste compacte, 2+ rangées = détail ;
  `tailleWidget(id)` dans la fonction de rendu, coque `carteWidget`). Toutes les cartes sont toujours
  affichées (sauf Avancement sans aucun dossier) : sans donnée récente, elles montrent l'appoint. **Jamais de vide dans une carte** : les listes portent `data-ajuster="N"` et
  `ajusterWidgets` les remplit par priorité (N petit d'abord) jusqu'à la hauteur de la tuile, avec
  « Voir N de plus » ; une carte qui a de la place reçoit du contenu d'appoint (à venir, prochaines
  signatures, pièces encore attendues…), pas un blanc. « Personnaliser » (ou appui long sur un titre) :
  glisser-déposer au pointeur, largeur et hauteur, retirer (×). **Widget Agenda** (01/10) = l'agenda partagé de l'office (liste du jour **jamais coupée : elle défile**, ouverte sur le rendez-vous en cours, `data-defiler` dans `ajusterWidgets`, étude 02/10) (stock `agenda-office`, `chargerAgendaWidget`,
  + `signaturesHorsAgenda`), lignes `lignesEvenementsAgendaJour` ; un clic ouvre la page Agenda au rendez-vous
  (`ouvrirEvenementDepuisWidgetAgenda`). **« Widgets »** (01/10) : liste de tous les widgets
  (`lignesGalerieWidgets`, `#widgets-overlay`), Retirer / Ajouter — retirer = `masque`, taille gardée ; tout nouveau
  widget de `WIDGETS_DASHBOARD` porte `icone` et `description`. Disposition par collaborateur : préférence
  `widgets` en base (liste blanche `WIDGETS_PREFERENCES` côté serveur, `WIDGETS_DASHBOARD` côté
  client — à modifier ensemble). Un nouveau bloc du tableau de bord = un nouveau widget. Disposition
  par défaut = rectangle plein (4 × 4, 2 × 8 sur téléphone, vérifié par `placementWidgets` dans les
  tests), les plus utiles d'abord ; la changer = incrémenter `VERSION_DISPOSITION_WIDGETS` (chaque
  collaborateur y est ramené une fois).
  **Widget « Statistiques »** (étude, 02/10, `renderStatistiquesDashboard`, grand × 1 rangée en fin de grille) : délais
  moyens depuis la **signature de l'avant-contrat** (étude 02/10 : `d.dateAvantContrat` — gardée à la création (date validée à l'import, jamais remplacée), reprise d'Authentic si vide, saisissable sur la fiche ; **plus jamais relue automatiquement dans un PDF du NAS** (étude 02/10, `retirerDateAvantContratLueNas` a retiré celles posées ainsi) — à défaut l'ouverture, `debutDossierStatistiques`) ; ouverture = `dateOuvertureDossier` (entrée « Dossier créé ») jusqu'au prêt (`dateObtentionPret`,
  historique), à la renonciation de préemption (`dateRenonciationPreemption` : `piecesTrouveesLe` puis historique) et
  à la signature passée — `statistiquesDelaisDossiers`, **tous les dossiers de l'étude, archivés compris, sans fenêtre de dates ni périmètre** (étude 02/10), moyenne/médiane/n ; avant-contrats signés ce mois / mois
  précédent / même mois N-1 (`comparaisonDossiersOuverts`, au mois de l'avant-contrat, « — » avant le premier dossier noté), sur le périmètre du tableau de
  bord (mes dossiers / tous).
- **Fond grisé d'une fenêtre** (02/10) : il ne ferme que par `clicSurFond(event)` (appui ET clic sur le fond) — sinon une sélection de texte relâchée hors de la fiche la fermait.
- **Texte d'aide** : ne décrit pas ce que le bouton dit déjà ; il dit ce qui manque. Une toute
  nouvelle confirmation commence par son verbe d'action (`boutonConfirmation`). **Une explication
  n'est jamais un paragraphe** (étude, 29/09 : « ça charge trop l'interface ») : elle va dans une
  pastille « i » à côté du titre ou du libellé (`infoBulle(texte)` dans un gabarit, `<span
  class="info-i" tabindex="0" data-info="…">` en HTML, `definirInfoBulle` pour la changer). Restent
  en texte visible : un état, un résultat, une erreur, une liste vide. **Réglages** : rubriques à
  gauche (`SOUS_ONGLETS_REGLAGES`, une par sujet depuis le 01/10 : Général, Collaborateurs, Signature des
  emails, Rappels Teams, Agenda et Outlook, Téléphonie 3CX, Authentic, Pièces et Claire Scan, Relecture d'actes,
  Signalements, Mise à jour et sauvegarde ; chaque section qui enregistre a son propre bouton), une colonne de lignes `.reglages-option` / `.reglages-champ`
  dans des `.reglages-section` — pas de cartes en grille.
- **Toute nouvelle fonction pure** : la déclarer `function` (ou `var` pour une table) pour la
  tester ; les fonctions qui touchent `dossiers`/le DOM se vérifient dans un vrai Chromium
  (Playwright, `/opt/pw-browsers/chromium`) avec un serveur réel et des dossiers inventés.
- **Environnement de développement** : les CDN (pdf.js, tesseract, docxtemplater, Google Fonts),
  Ollama, le NAS, Exchange et les services Microsoft sont injoignables ici — le dire dans le compte
  rendu plutôt que présenter comme vérifié ce qui ne l'a pas été.

## Comment tester

- `npm test` à la racine (client, `node:test`, aucune dépendance) et `cd server && npm test`.
- `tests/helpers/load-app.js` charge `script.js` dans un `vm.Context` avec un faux DOM. Deux
  limites : seules les `function` et `var` de premier niveau y sont visibles (un `const`/`let` est
  invisible) ; un tableau venu du contexte `vm` fait échouer `assert.deepEqual` — comparer des
  chaînes jointes.
- Côté serveur, les services extérieurs sont injectables (faux Ollama
  `server/test/helpers/faux-ollama.js`, transport SMTP, client Anthropic/Mistral, `poster` EWS) :
  aucun test n'ouvre de connexion réelle.
- En ajoutant ou modifiant une regex d'extraction, ajouter le cas dans le fichier de test du
  thème (`dates`, `engagements`, `parties`, `notaires`, `adresse`, `offre-pret`…), texte reprenant
  la structure réelle avec des noms inventés.
- **Rejouer de vrais PDF** (avis de taxe foncière, appel de charges, état daté, relevé de compte)
  sans navigateur : `npm i --no-save pdfjs-dist@4.10.38` à la racine, puis
  `node tests/outils/rejouer-pdf.mjs [--lignes] fichier.pdf …` — mêmes items que le pdf.js du
  client, tous les lecteurs de `script.js` appliqués, résultat en JSON. Les PDF déposés dans une
  conversation sont sous `/root/.claude/uploads/<session>/` ; ils ne sont jamais commités.

## Ce qui reste ouvert

- **Signature manuscrite de Bastien ANGLUMENT** (`docs/assets/signature-anglument.png`) conservée
  pour le courrier d'appel de fonds, **non branchée**. Demander d'abord si elle doit figurer sur
  tous les courriers ou seulement les siens. Le modèle Word n'a pas de placeholder d'image : poser
  l'image dans `word/document.xml` + `word/media/` et régénérer le base64, et déclarer tout nouveau
  fichier dans les deux listes d'assets.
- **Appel de fonds** : aperçu de pagination A4 non repris ; frais et droits de l'acte de vente à
  saisir à la main (barème non audité). **Encore à lire, en attente d'exemples réels** : montant des
  frais de garantie dans l'offre de prêt.
  **À confirmer par l'étude** : exclusion de la cotisation au fonds de travaux du prorata de charges
  (choix par défaut, décochable). Piste : reporter le fonds de travaux lu dans l'état daté trouvé sur
  le NAS sur la fiche (`d.fondsTravaux.montant`) — aujourd'hui l'outil Appel de fonds n'écrit rien.
- **Classeur des scans** : **à confirmer par l'étude** — la rubrique de chaque type (urbanisme et
  entretien en « AAE » d'après l'arborescence, voir `TYPES_SCAN` ; avis de taxe foncière en
  « Comptabilité », confirmé par l'étude le 30/09) ; **testé au bureau le 30/09 au soir : « le scan
  fonctionne »** (partage `\\192.168.60.5\Scan` joint, rangement dans les dossiers clients) ; restent
  à observer à l'usage : temps et qualité de l'OCR des scans du copieur Toshiba, volume quotidien. Le script Python fourni
  (`claire-classeur-scans`) n'est pas repris : il visait une autre application (Electron,
  arborescence et numérotation inventées) et se trompait de type sur les pièces réelles.
- **Banc d'essai d'extraction** : cadré dans `docs/spec-banc-essai-extraction.md`, délégué, pas
  encore engagé.
- **Relecture d'actes** : non vérifiée avec une vraie clé API (qualité, durée, coût, contradictions)
  — à juger par l'étude sur des actes déjà relus, avec le mode commentaires. Avant l'usage réel,
  demander à Mistral : rétention zéro, absence d'entraînement, accord de sous-traitance. Connecteur
  openlegi : pas construit, seulement sur demande explicite.
- **Confirmé au bureau le 30/09** : la connexion EWS au calendrier partagé de Sophie fonctionne en
  lecture et en écriture (« la connexion et modification fonctionne pour l'agenda partagé ») ; au soir,
  testés par l'étude et déclarés fonctionnels : l'agenda, Claire Scan, les brouillons d'email (`.eml`
  ouverts dans Outlook), la création d'un nouveau dossier depuis l'export Authentic (ZIP) ; puis la
  mise à jour en un clic (Réglages › Mise à jour), le démarrage automatique de CLAIRE au lancement du
  serveur, le lien vers une pièce ouvert depuis une notification Teams et l'icône de l'exe (nette).
- **Non vérifié au bureau** : la forme réelle du `.ics` de la visio ADNOV (aucun exemple reçu) ; l'intégration
  3CX (forme réelle de %CallerNumber%, fermeture de l'onglet ouvert par 3CX) ; le repli `SoftDelete` d'une suppression ; le sondage de créneaux (lecture réelle des réponses dans la boîte, boutons
  dans Outlook, options « Provisoire », page de réponse publiée — dépôt public à créer par l'étude) ; le détail des écritures EWS (déplacement et suppression d'un
  rendez-vous, note du Lieu, dates butoir en journée entière, noms exacts des catégories de couleur,
  reprise des dates butoir existantes au premier tour — une seule fois chacune) et de la lecture
  (forme réelle des journées entières, volume par tranche) ; service NSSM (si utilisé) ; reçus comptables (« Fonds reçus ») au-delà des
  deux PDF fournis.
- **Critères de sortie de bêta** (convenus) : quelques semaines sans bug bloquant, une restauration
  de sauvegarde testée, les points ci-dessus confirmés ; en bêta, seulement des corrections. Relecture
  d'actes en bêta après une dizaine d'actes relus avec commentaires et un coût jugé acceptable.
- **Pistes non engagées** : favicon reflétant l'urgence du portefeuille ; en-tête CLAIRE sur la
  fiche imprimée ; apprentissage des recatégorisations faites après enregistrement
  (`changerCategorie`) ; panneau de gestion des mémoires apprises ; mémoriser le compte client
  (`compte : N`) des reçus comptables ; exploiter le journal `corrections-extraction` pour resserrer
  les motifs (phase 3 de l'extraction).
- **Successions** : créées depuis Authentic (voir « Successions » plus haut), « SUCC - NOM »
  (`libelleDossierAffiche`, `PREFIXES_TYPE_AFFAIRE`, miroir serveur `libelleDossier`). Reste à définir avec l'étude :
  échéances (déclaration de succession…), checklist de pièces, emails, qualité des parties (défunt, héritiers) — la
  structure réelle d'une page de succession d'Authentic n'a pas encore été fournie.
- **Extension Firefox « CLAIRE pour Authentic »** (01/10, `extension-firefox/`, Authentic s'ouvre dans Firefox) :
  transport en place — relevé de la page (champs/libellés/rubriques, tableaux avec en-têtes `<th>`, texte ;
  jamais mot de passe ni champ caché), `POST /api/authentic/capture` (mémoire seule, 30 min, 20 au plus, JSON
  obligatoire), CLAIRE ouvre `#authentic=<id>` et affiche la page. **Reprise dans une fiche pas encore
  branchée** : attendre la structure réelle copiée par « Copier la structure (sans données) »
  (`structureCaptureAuthentic` : libellés masqués par `masquerLibelleAuthentic`, valeurs réduites à leur type par
  `masquerValeurAuthentic`), puis mapper vers les champs du dossier comme `completerExtractionDepuisAuthentic`.
  Non vérifié dans un vrai Firefox ni sur Authentic (relevé testé dans Chromium sur une page inventée) ;
  installation durable = signature Mozilla « unlisted » ou stratégie d'entreprise ; non géré si `authActive`.
  Demander à Fichorga si une API existe. **Branché le 02/10 (extension 0.3.0)** : relevé **automatique à
  l'affichage** sur `www.cloud-fichorga.fr` (`auto.js`, page stable 2,5 s, envoi seulement si changée, désactivable)
  → `POST /api/authentic/releve` (mémoire seule : file prise par UNE fenêtre — **boucle d'attente** `releves/attendre`, requête gardée ouverte 25 s et rendue dès qu'une page arrive, pour qu'une fenêtre cachée ou réduite, que le navigateur ne réveille plus qu'une fois par minute, applique la page en arrière-plan (étude 02/10) ; `releves/prendre` en secours toutes les 60 s et au retour au premier plan, et relevés
  récents 60 min via `releves/recents`). **Fiabilité (étude 02/10, « pourquoi parfois les données ne remontent pas »)** : les dossiers sont relus (`rattraperDossiersDistants`) avant chaque page — une fenêtre cachée ne sonde plus et appliquait sur une copie ancienne ; une page va d'abord à une fenêtre du **même poste** (adresse réseau de l'extension, `origineRequete`, « local » = poste serveur), à toute fenêtre si ce poste n'en a aucune vue depuis 90 s ; une page revue est **relue** (seul un doublon < 15 s est écarté) ; une page de dossier sans dossier reconnu le dit avec son motif (`raisonDossierAuthenticIntrouvable`) et « Choisir » (`rattacherNumeroAuthentic` : choix à la main prioritaire, numéro retenu) ; **journal** en mémoire du serveur (12 h) dans **Réglages › Authentic** (`renderReglagesAuthentic`, résultats rapportés par la fenêtre) ; extension 0.3.6 : une page non arrivée est renvoyée 30 s plus tard. **Usage réel (étude 02/10)** : plusieurs dossiers ouverts en onglets — seul l'onglet actif désigne la page (extension 0.3.7 relève `onglets`, titres des inactifs retirés du texte : `texteSansOngletsInactifsAuthentic`, `intituleNumeroteAuthentic`) ; intitulé **variable** (« le nom n'est pas fixe ») mais **un seul numéro par affaire**, promesse et vente comprises : toute page « N - … » suivie de Importer/Comparants/Immeubles est lue, numéro d'abord, noms ensuite (`intituleVenteNormalise`, score sur les mots) ; une liste de résultats (plusieurs intitulés, sans en-tête) ne désigne aucun dossier ; un **ancien dossier** des mêmes clients (acte signé avant le dossier, `ancienDossierAuthentic`) n'est jamais appliqué ni ne prend le numéro ; « Choisir » seulement si un dossier en cours sans numéro porte ces noms (`proposerChoixDossierAuthentic`). L'étude identifie un dossier par **« VTE VENDEURS / ACQUÉREURS »**, le numéro étant « caché dans les données du dossier » : onglet actif ou en-tête « VTE X / Y » sans numéro reconnus (`RE_INTITULE_VTE_SEUL_AUTHENTIC`, `RE_EN_TETE_VTE_AUTHENTIC`, extension 0.3.8), numéro pris devant l'en-tête ou dans un champ « N° de dossier » (`numeroChampDossierAuthentic`, libellé supposé) ; fiche client dans l'onglet d'un dossier → ce dossier (`dossierOngletActifAuthentic`). Pages reconnues par leur structure réelle (`typePageAuthentic`) :
  **gestion du dossier** (intitulé « N - Vente VENDEUR/ACQUÉREUR », tableaux intitulé/date/état —
  `lignesDocumentsAuthentic`) → dossier retrouvé **d'abord par son numéro Authentic** (« 1836 » de « 1836 - Vente … », = n° de sous-dossier ; `numeroDossierAuthentic`, retenu dans `d.numeroAuthentic` à la première reconnaissance ou à la création — `retenirNumeroAuthentic`, jamais deux dossiers au même numéro, non affiché ; un dossier rattaché à un autre numéro est exclu du score), sinon **par score** (étude 02/10, `scoreDossierAuthentic` : nom de chaque côté 3 identique / 2 proche, adresse du bien de la rubrique « Immeubles » — `adresseBienPageAuthentic` — CP 1, voie 2-4, numéro 1, adresse contraire −2/−3 ; seuil 6 avec au moins un nom, 2 points d'avance sinon rien, archivés seulement à défaut ; « consort(s) », « et », « époux » ignorés ; fiche client/onglet sans intitulé → dernier dossier retrouvé, `dossierCourantAuthentic.id` ; **fiche client** (étude 02/10, vendeur déjà client : sa fiche cite plusieurs dossiers) → `dossierPourFicheClientAuthentic` : d'abord un dossier EN COURS où la personne est partie — celui en consultation, puis le seul cité sur sa fiche, puis le seul de CLAIRE (un ancien dossier archivé/signé cité sur sa fiche ne passe jamais devant, cas CHAHUNEAU) ; puis un dossier terminé où elle est partie ; chaque fiche lue sans effet est dite par un toast (`raisonFicheClientSansDossier`, `raisonFicheClientSansChangement`) ; plusieurs dossiers en cours possibles → toast « Choisir » **fixe** (sans minuterie, jusqu'au rangement ou à la croix — `afficherToast(…, { fixe, cle })`, `fermerToastFixe`) → fenêtre `#authentic-choix-overlay` (`ouvrirChoixFicheClientAuthentic`, `rangerFicheClientAuthentic` ; fiche gardée en mémoire du poste, 10 au plus) ; partie de rien → le dossier en consultation **seulement si sa fiche le cite** (« À rattacher »), sinon rien — jamais le premier intitulé cité, jamais un inconnu rangé dans le dernier dossier vu)
  → pièces cochées « dans Authentic » (`piecesRecuesAuthentic` : même reconnaissance par le nom que l'export ZIP ;
  **pages : seuls l'état civil (« APR » en tête = demande papier, jamais reçue ; « ECV » = état civil virtuel, reçu), les casiers judiciaires (`RE_CASIER_AUTHENTIC`) et la SAFER**, reçus dans Authentic — le
  reste arrive par email/courrier, la page n'en montre que les demandes (étude 02/10) ; **export ZIP d'une vente : jamais
  les pièces d'urbanisme** (`pieceUrbanismeIgnoreeAuthentic`) ; « signé le … » sur la page = acte signé (`etatActeAuthentic`,
  hors avant-contrat/procuration/mandat/courrier) **et marqué fait** : au passage à « signé », `echeancesValidees` de
  ventebien, pret, appelFonds, projetEnvoye, rendezVousSignature, acte (une fois, annulable ; butoirs retirés de l'agenda) ;
  demande/envoi/en attente exclus ; acte d'état civil et **« Réponse SAFER »** de non-préemption ajoutés comme
  pièces — jamais la DIA/DPU de la commune), une fois par pièce (`d.piecesAuthentic`), jamais en participation ;
  **fiche client** (`clientDepuisFicheAuthentic`) et **fiche bien** (`bienDepuisFicheAuthentic`, cadastre) →
  « Nouveau dossier » › « Depuis Authentic » (`dossiersDepuisRelevesAuthentic` au format de l'export ZIP, rôles
  par l'intitulé, `creerDepuisAuthentic` ; complète un avant-contrat déjà déposé). Notaires et agence : pas encore
  relevés (page non fournie). Cellules copiées en **vocabulaire** (`vocabulaireCelluleAuthentic`). **Deuxième passe (02/10, `appliquerReleveSurDossier`)** : état de rédaction de l'acte jamais montré ni noté pour un notaire en second (participation, étude 02/10 — seul « signé » l'est) ;
  SAFER notifiée sans réponse → « Réponse SAFER » **manquante** (une fois, `saferPieceAjoutee`) avec notifiée / prise en
  compte le ; RHF envoyée / retour ; état de l'acte ; prix « Capital » (rempli s'il manque) ; collaborateur et notaire des
  « Parties prenantes » — gardés dans `d.authentic`, bloc « Dans Authentic » de l'onglet Pièces ; fiche client →
  téléphone/email manquants et situation matrimoniale, alerte si un vendeur marié/pacsé vend sans son conjoint ;
  côté de la fiche par nom de famille, nom d'usage puis **conjoint** (`roleConjointAuthenticDansDossier`), sinon
  « À rattacher » sur la fiche (`clientsAPlacer` : Vendeur / Acquéreur / ×), jamais deviné ; **emails groupés**
  « a@x.fr;b@y.fr » (`emailsDepuisTexte`) ajoutés à ceux du côté — **jamais remplacés** (étude 02/10, « garder les deux » : à la création aussi, `fusionnerEmailsTexte`/`fusionnerTelephonesTexte`, toutes les parties du côté + compromis ; email tapé dans le formulaire complété, `appliquerEmailsChamp`) — partout un champ email peut porter plusieurs
  adresses (`destinatairesEmail` : « a, b » dans le `.eml`, un votant par adresse au sondage) ;
  **personne déjà connue** (étude 02/10, choix : proposé, jamais d'office ; toute partie, archivés compris) — ligne
  « Déjà connu » de la fiche (`personnesConnuesPourDossier` : même personne = un nom contenu dans l'autre sur 2 mots au
  moins, `memePersonneParNom` ; ancien dossier le plus récent qui apporte quelque chose), « Reprendre »
  (`appliquerPersonneConnue` : téléphones, emails, situation matrimoniale manquants) ou × (`personnesConnuesEcartees`) ;
  livret de famille et décès seulement en succession. « Informations financières » et « Parties prenantes » (sous les
  vendeurs/acquéreurs de la page de gestion) s'affichent en **texte seul** : lus dans `capture.texte` (« Capital » puis le
  montant ; lignes après « Parties prenantes »), la copie de structure y ajoute le texte réduit à son vocabulaire
  (`texteVocabulaireAuthentic`, `VOCABULAIRE_AUTHENTIC`, test « aucun nom ne sort ») ; « Retour le » = prise en compte
  SAFER / retour RHF (étude, 02/10). **Troisième passe (02/10 midi)** : **Comedec** (`etatEtatCivilAuthentic`,
  `d.authentic.etatsCivils`) — « pris en compte »/en attente et **« négatif »** (erreur, rien délivré) laissent la pièce
  non cochée avec l'état dessous (`etatAuthenticPiece`), seul **« positif »** coche ; **SAFER** : ligne « date de création · date d'envoi · état » (étude 02/10 — état « Pris en compte » / « Non préemption SAFER », sans date ; même ligne pour la RHF et les demandes, `dateEnvoiLigneAuthentic` ; `creeeLe`, `envoyeeLe`, date de décision seulement sur une ligne de réponse à une date ou en 3e date), puis **non-préemption tacite** à l'issue du délai **depuis la date d'envoi** (`envoyeeLe` ; relevés antérieurs : leur `priseEnCompteLe` était l'envoi ; miroir serveur `echeanceSaferDossier`) — 2 mois, 1 mois en réponse
  rapide, 8 jours en très rapide — **2 mois de base, les deux autres se cochent sous « Réponse SAFER »** (`delaiManuel`,
  `renderDelaiSafer`, jamais lu dans l'intitulé ; `DELAIS_SAFER`, `appliquerSaferTacite`, `verifierSaferTacites` au démarrage puis
  toutes les heures) ; **fin du délai = date butoir, comme la préemption de la mairie** (`saferLevee`,
  `echeanceSaferDossier`) : item « Délai SAFER » du planning (miroir serveur, sans rappel), ligne de la fiche, pas de
  « Fixer le rendez-vous » avant, semaine probable / créneaux au plus tôt le lendemain, retrait de probabilité ; **demandes** (alignement, numérotage, DIA…, `demandesUrbanismeAuthentic`) jamais cochées,
  « Demande envoyée le … » sous la pièce ; ce qui est acquis (positif, SAFER décidée) n'est plus touché. **Seules les
  pages de structure connue** sont envoyées (extension 0.3.3, `pageConnue`) et gardées (`pageAuthenticConnue`). **Navigation** (0.3.5, étude 02/10) : sur une page de dossier d'un autre type (« 15 - Donation SIMOND »), l'extension n'envoie que l'intitulé (`POST /api/authentic/navigation`, mis en file sans contenu ; une page connue déjà vue renvoie aussi sa navigation) → `suivreNavigationAuthentic` change le dossier en consultation (aucun s'il n'est pas suivi).
  Aperçu d'un document Comedec : pas de lien relevé. **Coordonnées** (étude 02/10) : email + téléphone de chaque
  partie sur la première page de la fiche (`fiche-coordonnees`, `champsCoordonneesPartie`) et en une ligne par partie
  dans Échanges (`renderCoordonneesEchanges`).
- **Arborescence type des dossiers clients sur le NAS** (MAISON, COPRO, TERRAIN, SUCC, CESSION DE
  FONDS) : détaillée dans `docs/historique.md` (fin du fichier). L'avant-contrat signé est à la
  racine du dossier client ou sous « SRU » ; la rubrique « AAE » contient les pièces réunies entre
  l'avant-contrat et la vente, jamais l'avant-contrat.
