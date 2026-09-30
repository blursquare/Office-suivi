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
  src/repertoire.js                  Répertoire hors notaires (relevé du répertoire Word de l'étude, par thème)
  src/ouvertureAuto.js               Installateur du relais « claire-ouvrir: » (ouverture auto des téléchargements)
  src/jobs/rappels.js                Rappels par email (miroir serveur du planning client)
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
   NTLMv2 (`httpntlm`) sur le **calendrier partagé de Sophie** : **lecture** toutes les 15 min
   (`lireCalendrierExchange`, FindItem en vue calendrier, 6 mois en 3 tranches ; envois relevés,
   rendez-vous de signature, absences, catégories — le lien `.ics` publié n'est plus lu depuis le
   29/09) ; **écriture** : création/déplacement/retrait
   d'un rendez-vous de signature (catégorie = couleur : vert office, violet visio, orange confrère),
   note « Appel de fonds (et projet) envoyé » dans le Lieu, dates butoir prêt / vente préalable en
   journée entière — seule voie depuis le 29/09 (plus de flux `.ics` publié) : le poste les pose au
   geste, le serveur pose ce qui manque à chaque tour de lecture (`echeancesAgenda.js`) en adoptant
   d'abord un événement de même titre et même date (jamais de doublon). **Un seul essai par appel, aucun réessai automatique** (verrouillage du compte),
   disjoncteur sur refus d'identifiants (côté client pour les écritures ; côté serveur, la lecture
   automatique est suspendue tant que les identifiants refusés restent enregistrés). Suppression = `MoveToDeletedItems`, jamais `HardDelete`.
   Microsoft Graph / Power Automate premium ne sont pas disponibles. **Lecture de la boîte de
   réception** du même compte (celle de Bastien, qui reçoit tout en double) à 8 h 50 pour le résumé
   des emails du matin (`emailsMatin.js`, FindItem seul, sans IA) : seuls expéditeur, objet et
   heure sont gardés, jamais le corps ; affiché **pour Bastien seulement** (`DESTINATAIRES_EMAILS_MATIN`).
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
  (« Mon Cher Maître, … Votre bien dévoué. ») et le questionnaire de satisfaction n'est jamais proposé.
- **Responsables** : liste fermée (Bastien ANGLUMENT — administrateur, vue globale —, Julie
  VASSELIN, Jérémy SAUJOT).
- **Planning** (`echeancesPlanning`, miroir serveur `toutesEcheances` dans `jobs/rappels.js` — à
  modifier **toujours ensemble**) : vente préalable → obtention du prêt → *renonciation au droit de
  préemption* (bloquante hors copropriété, sauf pièce retirée ou participation ; en copropriété
  seulement si une pièce personnalisée « préemption/DPU/DIA » a été ajoutée) → fixer le rendez-vous
  → envoi appel de fonds → envoi projet → signature. La **date butoir** est informative dès qu'un
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
  « Responsable », pré-réglé sur celui du poste) + bascule de vue, filtres sur une ligne (« Trier par »
  en vue Tableau seulement ; « Archivés » cochée → section « Archivés » en bas de la vue Échéances,
  `archivesPourEcheances`, date de signature sinon d'archivage, jamais dans une semaine), statuts en pastilles de filtre (`syntheseEtatsSuivi`, `renderEtatsSuivi`) ; au-dessus, « Prévu en
  {mois} » (`prevuDuMois`, `agendaPrevuDuMois`, `renderStatsSuivi`, repliable) — angle voulu par
  l'étude : ce qui est prévu ce mois-ci, **en un seul bloc compact** : une ligne d'en-tête (mois,
  4 compteurs-filtres en pastilles, retards, délais moyens depuis l'ouverture du dossier dans CLAIRE),
  puis « À faire » (retards, envois, rendez-vous à placer) et « Au calendrier » (signatures, dates
  butoir, jour par jour) côte à côte, une ligne par échéance, défilement au-delà de 172 px. Mois suivant dans les 5 derniers jours (`moisPrevuSuivi`). Refusés par l'étude : graphique
  par semaine, charge par collaborateur, montant des ventes, le mot « portefeuille ». **Liste « intelligente »**
  (30/09) : section « Nouveau » (ex-« À voir en premier ») en tête (`signauxDossierSuivi`, `partagerAVoirSuivi`) —
  notifications (`piecesNotifications` : offre, pièces nommées) puis fonds tous reçus non confirmés ;
  le dossier en sort à l'ouverture de sa fiche, sans doublon dans la suite de la liste. L'échéance a sa propre colonne (« Prochaine
  échéance ») ; `statutDossier` (pièces trouvées) ne sert plus qu'aux points « À traiter ».
- **Seuils des rappels email** : prêt J-15/J-7, vente préalable J-15/J-7, appel de fonds J-15/J-10,
  signature J-25/J-15, personnalisées J-15/J-7 (`SEUILS_RAPPELS_PAR_TYPE`).
- **Relance de l'offre de prêt au client** : première à J-15, puis tous les 10 jours, y compris
  après l'échéance, jusqu'à réception de l'offre ou archivage.
- **Offre de prêt** : reconnue par le nom du fichier, à défaut par le titre de la page de garde
  (≥ 6 pages) confirmé par l'IA locale ; « à confirmer » si le modèle est indisponible. Garanties
  lues dans le seul paragraphe « GARANTIES », une garantie conditionnelle/future n'est pas comptée.
- **Pièces du dossier** : reconnues **par le nom de fichier seulement** (`motifNom` +
  formes tolérantes `FORMES_NOM_PIECES`), jamais par le contenu (le compromis cite toutes les pièces).
  Une pièce validée à la main (`piecesValideesManuellement`) n'est jamais repassée en manquante.
  Une exclusion (« Réinitialiser ») est globale et stockée en base — elle est la première cause
  d'une pièce « jamais reconnue » malgré un nom correct.
  **Notification d'une pièce trouvée : une seule fois** par dossier + pièce + fichier (registre
  serveur `pieces-notifiees`, 30 jours, `dedoublonnerPieces` dans `routes/notifications.js`) ; une
  seule vérification NAS à la fois par dossier et par fenêtre (`verificationsDossierEnCours`).
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
- **Import d'un export Authentic** (30/09, « Nouveau dossier », même zone de dépôt que le PDF) : ZIP
  d'un sous-dossier (`DATA.xml` au format notaires.fr + pièces + Word de l'acte en cours), lu dans le
  navigateur (`entreesZip`, `arbreXml`, `lireExportAuthentic`). Parties par les références du flux,
  sinon par l'intitulé « VTE VENDEUR / ACQUÉREUR » (une personne absente de l'intitulé — ex-conjoint —
  n'est pas partie) ; Disposant = vendeur, Bénéficiaire = acquéreur. Les données structurées priment
  sur le texte (`completerExtractionDepuisAuthentic`, origine « Reprise d'Authentic ») ; dates et prix
  viennent de l'avant-contrat (PDF signé de l'export, sinon le Word si c'est l'avant-contrat —
  jamais les dates d'un acte de vente). Pièces reconnues par nom de document → reçues « à la main »
  (`piecesValideesManuellement`, case décochable). Succession reconnue (`typeAffaireAuthentic`) mais
  refusée tant que CLAIRE ne suit que des ventes.
- **Classeur des scans du copieur** — nom affiché **« Claire Scan »** (30/09, `TYPES_SCAN`, `propositionScan`, `server/src/scans.js`) :
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
  (`scansPourCarte`). **OCR d'un scan : `page.render(… intent: 'print')`** — en « display », pdf.js 3.11 cadence
  le dessin sur `requestAnimationFrame`, arrêté fenêtre réduite/cachée (lecture bloquée sans fin). Un pré-état daté n'est
  pas un état daté (checklist corrigée le même jour).
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
- **Répertoire** (Outils, 30/09) : thème « Confrères » = le carnet des confrères (inchangé, rapproché
  des fiches) ; autres thèmes = `repertoire.js` (clé `repertoire-contacts`, relevé du répertoire Word
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
  glisser-déposer au pointeur, largeur et hauteur, masquer. Disposition par collaborateur : préférence
  `widgets` en base (liste blanche `WIDGETS_PREFERENCES` côté serveur, `WIDGETS_DASHBOARD` côté
  client — à modifier ensemble). Un nouveau bloc du tableau de bord = un nouveau widget. Disposition
  par défaut = rectangle plein (4 × 4, 2 × 8 sur téléphone, vérifié par `placementWidgets` dans les
  tests), les plus utiles d'abord ; la changer = incrémenter `VERSION_DISPOSITION_WIDGETS` (chaque
  collaborateur y est ramené une fois).
- **Texte d'aide** : ne décrit pas ce que le bouton dit déjà ; il dit ce qui manque. Une toute
  nouvelle confirmation commence par son verbe d'action (`boutonConfirmation`). **Une explication
  n'est jamais un paragraphe** (étude, 29/09 : « ça charge trop l'interface ») : elle va dans une
  pastille « i » à côté du titre ou du libellé (`infoBulle(texte)` dans un gabarit, `<span
  class="info-i" tabindex="0" data-info="…">` en HTML, `definirInfoBulle` pour la changer). Restent
  en texte visible : un état, un résultat, une erreur, une liste vide. **Réglages** : rubriques à
  gauche (`SOUS_ONGLETS_REGLAGES`), une colonne de lignes `.reglages-option` / `.reglages-champ`
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
- **Non vérifié au bureau** : le détail des écritures EWS (déplacement et suppression d'un
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
- **Dossiers de succession à venir** : aujourd'hui tous les dossiers sont des ventes, affichés
  « VTE - NOM » (`libelleDossierAffiche`, préfixe tiré de `d.typeAffaire` par `PREFIXES_TYPE_AFFAIRE` :
  vente → VTE, succession → SUCC ; miroir serveur `libelleDossier` dans `jobs/rappels.js`). À l'arrivée des successions, ce préfixe, le planning, la
  checklist et les emails devront dépendre d'un type d'affaire du dossier. L'import Authentic lit
  déjà tout export (personnes, parties et leurs qualités, documents) et reconnaît une succession :
  il restera à brancher la création d'un dossier de succession sur `lireExportAuthentic`.
- **Arborescence type des dossiers clients sur le NAS** (MAISON, COPRO, TERRAIN, SUCC, CESSION DE
  FONDS) : détaillée dans `docs/historique.md` (fin du fichier). L'avant-contrat signé est à la
  racine du dossier client ou sous « SRU » ; la rubrique « AAE » contient les pièces réunies entre
  l'avant-contrat et la vente, jamais l'avant-contrat.
