# Serveur intranet CLAIRE

Petit serveur (Express + SQLite) qui remplace le `localStorage`/registre partagé JSON de la
version 100% locale (branche `main`) par un vrai registre partagé en temps réel, servi sur le
réseau de l'étude. Voir `CLAUDE.md` à la racine du dépôt, section « Mode serveur intranet
(branche claude/serveur-intranet) », pour le contexte complet de ce chantier.

**État actuel : registre des dossiers partagé en temps réel (authentification par mot de passe
partagé), calendrier connecté (abonnement webcal en lecture seule) et, en option, un vrai service
Windows (NSSM) pour ne plus jamais dépendre d'une fenêtre de console restée ouverte.** Seules les
relances email automatiques n'ont pas été poursuivies (arrêtées à la demande de l'étude) — voir le
plan de ce chantier si ce point doit être repris un jour.

## Option simple : `CLAIRE-serveur.exe` (recommandé pour l'étude)

Un seul fichier à déposer sur le PC du bureau, sans installer Node.js, sans terminal, sans `.env`
à créer à la main.

1. Créer un dossier vide pour le serveur (ex. `C:\CLAIRE-serveur\`) et y déposer
   `CLAIRE-serveur.exe`.
2. Double-cliquer dessus.
3. **Windows affiche presque certainement un avertissement "Windows a protégé votre ordinateur"
   (SmartScreen) au tout premier lancement** — ce n'est pas un virus, seulement le signe que ce
   fichier n'est pas signé par un éditeur reconnu (aucun certificat de signature Windows n'a été
   acheté pour ce projet). Cliquer sur **« Informations complémentaires »** puis **« Exécuter
   quand même »**. Un antivirus peut aussi le signaler une première fois pour la même raison —
   l'ajouter en exception si besoin.
4. Une fenêtre de console noire s'ouvre : c'est le serveur qui tourne. **La fermer arrête le
   serveur pour tout le monde** — c'est la cause la plus fréquente d'un arrêt signalé comme "ça a
   marché quelques minutes puis plus rien" (on la ferme en pensant qu'elle ne sert à rien). Deux
   nouveaux fichiers apparaissent à côté de l'exécutable, dès ce premier lancement, pour ne plus
   jamais avoir à s'en soucier :
   - **`Lancer-CLAIRE-en-arriere-plan.vbs`** : à utiliser désormais au quotidien à la place d'un
     double-clic direct sur `CLAIRE-serveur.exe` — démarre le même serveur mais **sans aucune
     fenêtre visible**, donc rien à fermer par erreur.
   - **`Arreter-CLAIRE.bat`** : arrête proprement le serveur lancé ainsi (indispensable une fois
     la fenêtre masquée — sans lui, seul le Gestionnaire des tâches permettrait de l'arrêter).
   - **`Demarrer-CLAIRE-avec-Windows.vbs`** : à double-cliquer UNE fois pour que CLAIRE démarre
     tout seul à chaque ouverture de votre session Windows — le serveur repart sans fenêtre (via le
     lanceur ci-dessus) et ouvre lui-même le logiciel dans le navigateur, sans plus rien à cliquer
     le matin. Concrètement, un raccourci est posé dans le dossier « Démarrage » de votre session
     (`shell:startup`), une boîte de message confirme. Ça démarre AVEC la session (après la saisie
     du mot de passe Windows), pas avant : pour un serveur qui tourne dès l'allumage du poste sans
     personne connecté, ou qui se relance seul après un plantage, c'est le service Windows (voir
     plus bas) qu'il faut — et pas les deux à la fois.
   - **`Ne-plus-demarrer-CLAIRE-avec-Windows.vbs`** : annule le précédent (retire le raccourci).
     N'arrête pas un serveur déjà lancé — pour ça, `Arreter-CLAIRE.bat`.
   Un premier lancement direct sur l'exe (fenêtre visible) reste utile une fois, pour vérifier que
   tout démarre bien et passer l'avertissement SmartScreen ci-dessous ; ensuite, place à
   `Lancer-CLAIRE-en-arriere-plan.vbs`.
5. **Au tout premier lancement**, un mot de passe partagé est généré automatiquement et affiché
   dans la console, ET écrit dans un fichier `mot-de-passe.txt` créé à côté de l'exécutable — à
   communiquer à tous les collaborateurs (même mot de passe pour tout le monde). Pour le changer,
   éditer `config.json` (créé au même endroit) puis relancer.
6. Le navigateur s'ouvre automatiquement sur l'outil — dans une **fenêtre Chrome (ou Edge) dédiée,
   sans onglets ni barre d'adresse** si l'un des deux est installé aux emplacements habituels, sinon
   dans un onglet du navigateur par défaut. Pour que les **autres postes** du bureau s'y
   connectent, la console affiche aussi les adresses à leur donner (`http://<ip-du-poste>:3000/`)
   — également écrites dans `Adresses-du-serveur.txt` à côté de l'exécutable, pour les retrouver
   même une fois la fenêtre masquée. Ce poste doit rester allumé, avec le serveur lancé (fenêtre
   visible, en arrière-plan, ou en service Windows — voir plus bas), pour que les autres y accèdent.
   Sur les postes qui **se connectent** au serveur (pas celui qui l'héberge), ouvrir l'adresse
   donnée dans un simple onglet Chrome reste la façon normale de l'utiliser — la fenêtre applicative
   automatique ne concerne que le poste qui vient de démarrer le serveur lui-même.

## Calendrier connecté (abonnement webcal)

Un flux calendrier en lecture seule, généré à la demande à partir de TOUS les dossiers actifs du
registre. **Il ne publie que deux échéances** : l'obtention du prêt et la vente préalable, chacune
seulement si elle est activée et datée sur le dossier. L'obtention du prêt disparaît dès que
l'offre est reçue (ou l'échéance marquée réalisée), la vente préalable dès qu'elle est marquée
réalisée. Les autres dates (date butoir, appel de fonds, rendez-vous de signature, échéances
personnalisées) n'y figurent pas du tout. **Aucun événement n'est jamais publié « annulé »** : un
abonnement Internet Outlook remplace le calendrier entier à chaque resynchronisation, donc ce qui
n'est plus dans le flux disparaît de lui-même, alors qu'un événement annulé resterait affiché. Pour
forcer la mise à jour sans attendre la resynchronisation d'Outlook (qui peut prendre quelques
heures), supprimer l'abonnement puis le rajouter avec la même adresse. Ce flux est
distinct de l'export `.ics` ponctuel d'un seul dossier depuis l'outil lui-même (bouton « Rappels
(.ics) » sur une fiche, limité à la seule date de prêt) : celui-ci est un abonnement continu qui se
tient à jour tout seul, pour tout le portefeuille, sans jamais rouvrir l'outil.

1. Au démarrage du serveur (`.exe` ou `npm start`), la console affiche une ou plusieurs adresses
   du type `http://<ip>:3000/calendrier.ics?token=...` — la même liste est écrite dans
   `Adresses-du-serveur.txt` à côté de l'exécutable en mode `.exe`. Le jeton (`token=...`) est
   généré automatiquement au premier lancement (mode `.exe`, dans `config.json`) et reste ensuite
   inchangé — jamais le mot de passe de connexion à l'outil : un abonnement webcal ne peut pas
   envoyer de mot de passe, ce jeton dédié en tient lieu dans l'URL elle-même.
2. Dans Outlook : **Ajouter un calendrier → S'abonner depuis le web** (ou « À partir
   d'Internet », selon la version), coller l'URL affichée par le serveur, valider.
3. Outlook resynchronise cet abonnement selon **son propre calendrier interne** (typiquement
   toutes les quelques heures, pas en temps réel) — une échéance ajoutée/modifiée dans CLAIRE
   n'apparaît donc pas instantanément dans Outlook, contrairement à l'outil lui-même (synchronisé
   par sondage toutes les 7 secondes entre postes). C'est une limite d'Outlook sur ce type
   d'abonnement, pas un réglage ajustable côté serveur CLAIRE.
4. Un dossier archivé n'apparaît plus dans ce flux. Le flux est en LECTURE SEULE : modifier/supprimer un événement dans Outlook
   n'a aucun effet sur le registre CLAIRE, qui reste la seule source de vérité.
5. En mode développeur (`npm start`), ce flux reste désactivé tant que `CALENDRIER_TOKEN` n'est
   pas renseigné dans `.env` (voir `.env.example`) — sans jeton, `GET /calendrier.ics` répond 503
   plutôt que de générer un flux non protégé.

## Rappels automatiques par email

Remplace le déclenchement automatique des rappels (auparavant : rien, en pratique — seul un
brouillon `mailto:` manuel existait, voir l'ancien bouton « Envoyer un rappel par email » sur une
fiche dossier, **retiré définitivement** depuis que ce mécanisme couvre le même besoin — voir
plus bas). Sur toutes les échéances actives d'un dossier, CLAIRE envoie un **email** au
responsable du dossier — jamais deux fois pour la même échéance. **Les seuils sont propres à
chaque échéance** (`SEUILS_RAPPELS_PAR_TYPE`, `server/src/jobs/rappels.js`), donnés un par un par
l'étude :

| Échéance | Rappels |
| --- | --- |
| Obtention du prêt | J-15 et J-7 |
| Vente préalable | J-15 et J-7 |
| Appel de fonds | J-15 et J-10 |
| Signature de l'acte | J-25 et J-15 |
| Échéance personnalisée | J-15 et J-7 (repli) |

La **date butoir** de l'avant-contrat ne déclenche aucun rappel : elle est indicative, c'est le
rendez-vous pris à l'office qui engage l'étude.

> **Trois architectures d'envoi se sont succédé pour ce même besoin.** (1) Un `POST` JSON vers un
> déclencheur HTTP Power Automate, qui postait un message privé Teams ; (2) le même `POST`, l'action
> interne du flux passée à « Envoyer un e-mail (V2) » ; (3) **celle en service aujourd'hui** :
> CLAIRE **envoie elle-même un email** vers une boîte-passerelle, et c'est l'**arrivée** de cet
> email qui déclenche le flux, lequel poste ensuite le message dans Teams. Le déclencheur HTTP et
> son schéma JSON n'existent plus. Ce qui est repris d'une configuration existante : les adresses
> des collaborateurs, l'adresse de copie et l'activation (`assainirReglages()` lit encore
> `teamsActif`/`teamsCopieEmail`). Ce qui est à saisir : le serveur d'envoi SMTP et la
> boîte-passerelle.

**Convention imposée par le flux**, à ne pas changer d'un côté sans l'autre :

| Champ de l'email | Contenu |
|---|---|
| **À** | la boîte-passerelle (toujours la même, c'est elle qui déclenche le flux) |
| **Objet** | l'adresse du **vrai destinataire**, que le flux lit pour savoir à qui poster dans Teams |
| **Corps** | le message, repris tel quel dans Teams |

L'objet ne porte donc plus de texte lisible. C'est ce qui a fait disparaître `sujetRappel()` et
`sujetNotificationPieces()`, apparues avec l'architecture précédente : les corps de message étaient
déjà autonomes, ils ne faisaient que répéter cet objet.

**Copie systématique à une adresse de contrôle** (champ « Adresse recevant une copie de tous
les rappels » dans Réglages) : si renseignée, cette adresse reçoit un DOUBLE de
CHAQUE rappel envoyé, quel que soit le responsable du dossier concerné — un moyen de vérifier que
les rappels partent bien sans avoir à surveiller chaque collaborateur. Envoyée uniquement après un
envoi principal réussi (jamais à sa place), jamais dupliquée si elle coïncide avec l'adresse du
responsable lui-même, et son propre échec n'empêche jamais le marquage du rappel principal comme
envoyé — c'est ce marquage qui compte pour ne pas relancer le collaborateur concerné.

Choix technique : **SMTP direct** (`nodemailer`, déjà dans `package.json` mais jamais câblé jusqu'à
cette version) est le seul transport possible — un job de fond qui tourne toutes les 30 minutes,
sans personne devant l'écran, ne peut pas passer par un brouillon `mailto:`.

**Tout se configure depuis l'écran « Réglages » de la sidebar** — aucun fichier à éditer à la main.

### Envoi par Gmail, et seulement par Gmail

L'écran Réglages ne propose plus qu'un compte **Gmail** (décision de l'étude, 23/09/2026) : serveur
`smtp.gmail.com`, port **587** en STARTTLS, fixés par le client (`GMAIL_SMTP` dans `script.js`) ;
on ne saisit que le **compte Gmail**, son **mot de passe d'application** (16 caractères, créable
sur `myaccount.google.com/apppasswords` après activation de la validation en deux étapes), la
boîte-passerelle et l'éventuelle adresse de copie. L'adresse d'expédition reste vide : Gmail exige
que l'expéditeur soit le compte authentifié lui-même.

Pourquoi pas Microsoft 365 : l'envoi sans compte est interdit par le SPF du domaine (`-all`,
passerelle Retarus), et autoriser le SMTP authentifié sur une boîte du locataire demande des droits
d'administrateur dont l'étude ne dispose pas. Le transport côté serveur (`envoiEmail.js`) reste un
SMTP générique : si ce choix change un jour, seul le formulaire est à rouvrir.

Deux réserves à connaître : chaque rappel contient un nom de dossier et une échéance, qui
transitent donc par le compte Gmail ; et la boîte-passerelle doit accepter un message venant de
l'extérieur du domaine — si le filtrage l'écarte, le flux ne se déclenche jamais et rien ne le
signale du côté de l'envoi, qui a réussi. Le panneau « Dernier tour de rappels » ne couvre pas ce
cas-là : seul un coup d'œil dans Teams, ou l'historique du flux dans Power Automate, le dira.

**La copie gardée par Gmail est effacée DEUX HEURES après l'envoi.** Gmail range d'office dans
« Messages envoyés » tout message parti par `smtp.gmail.com` ; le SMTP ne permet pas de l'empêcher.
CLAIRE se reconnecte donc en IMAP (`imap.gmail.com:993`, **même compte, même mot de passe
d'application** — rien de plus à saisir), retrouve chaque message par son **Message-ID exact**
(jamais par son destinataire ou son objet : le compte peut servir à autre chose), le déplace dans
la corbeille puis l'en supprime définitivement (`server/src/imapGmail.js`).

**Pourquoi deux heures et pas tout de suite** : le flux Power Automate est déclenché par ce même
message Gmail, et relève la boîte à intervalles de plusieurs minutes. L'effacer aussitôt pourrait
le retirer avant le passage du flux — le rappel serait parti, le message Teams jamais. Chaque copie
attend donc dans une file (`server/src/nettoyageGmail.js`) et la tâche de rappels, toutes les
30 minutes, efface celles qui ont plus de deux heures. Une copie déjà disparue entre-temps sort
simplement de la file ; un échec de connexion est retenté jusqu'à cinq fois et apparaît en
**avertissement orange** dans « Dernier tour de rappels », sans jamais annuler un envoi.

Côté Outlook, la copie reçue par la boîte-passerelle se supprime dans le flux Power Automate lui-même
(action « Supprimer l'e-mail (V2) » ou « Déplacer l'e-mail (V2) » après l'action Teams, exécutée
seulement si celle-ci a réussi) — CLAIRE n'a aucun accès à cette boîte.

### Puis

1. Renseigner la **boîte-passerelle** (celle sur laquelle le flux est déclenché), l'adresse email
   de chaque collaborateur, optionnellement une adresse de copie, cocher **« Activer l'envoi
   automatique de rappels »**, puis **Enregistrer**.
2. Utiliser le bouton **« Tester »** à côté de chaque collaborateur : un message de test doit
   arriver dans son Teams. S'il n'arrive pas, l'historique du flux dans Power Automate départage —
   email arrivé mais pas de message Teams : le problème est dans le flux ; aucune trace : le
   problème est côté envoi, et le message d'erreur affiché sous le bouton le précise.

### Surveiller que les rappels partent bien

La tâche tourne toutes les 30 minutes dans un serveur lancé **sans fenêtre** — personne ne voit
donc ses messages. Jusqu'à cette version, `executerTacheRappels()` construisait soigneusement sa
liste d'erreurs et **personne ne la lisait** : un mot de passe d'application révoqué, un compte
bloqué, et les rappels s'arrêtaient en silence. C'est précisément l'ABSENCE de message qui aurait
dû alerter, et rien ne la signalait.

Deux ajouts dans l'écran « Réglages », sous l'encart **« Dernier tour de rappels »** :
- le **compte rendu du dernier tour** — quand, déclenché à la main ou par le minuteur, combien de
  rappels envoyés sur combien dus, et la liste des erreurs. Vert tant qu'aucune erreur n'est
  remontée, rouge dès qu'il y en a une. **Un compteur à zéro n'est jamais une alerte** : la plupart
  des tours n'ont simplement aucun rappel dû ce jour-là ;
- le bouton **« Lancer un tour maintenant »**, qui exécute le vrai tour (même chemin de production
  que le minuteur), sans attendre la prochaine demi-heure. Conséquence assumée : un rappel envoyé
  ainsi est marqué dans `reminder_log` et ne repartira donc pas au tour automatique suivant — ce
  n'est pas une simulation, c'est le tour lui-même, avancé de quelques minutes.

Le compte rendu est stocké sous sa propre clé (`dernier-tour-rappels`) et non dans le blob
`reglages` : ce n'est pas un réglage saisi par l'étude mais un état produit par le serveur, et la
liste blanche stricte d'`assainirReglages()` le jetterait à chaque enregistrement du formulaire.

**Ce que le bouton « Tester » prouve, et ce qu'il ne prouve pas.** Une réponse en succès dit
seulement que le **serveur d'envoi a accepté le message**. Elle ne dit rien de son arrivée dans la
boîte-passerelle, du déclenchement du flux, ni du message Teams — trois étapes qui se passent
ensuite, hors de portée de CLAIRE. D'où le libellé « Remis au serveur d'envoi — vérifiez maintenant
dans Teams » plutôt qu'un « message reçu » qui affirmerait plus que ce qui a été vérifié.

**Le mot de passe SMTP ne ressort jamais de la base** : `GET /api/reglages` le retire de la réponse
et le remplace par un booléen `smtpMotDePasseEnregistre`. Le champ reste donc vide à l'ouverture de
l'écran, et un enregistrement qui ne le renvoie pas **conserve** celui déjà en place (une chaîne
vide explicite l'efface). Il reste stocké en clair dans le fichier de la base, sur le serveur de
l'étude : un mot de passe d'application dédié, révocable d'un clic sans toucher au mot de passe du
compte lui-même, est donc préférable à un mot de passe de messagerie ordinaire.

Détails d'implémentation, pour qui retouche ce code :
- `src/envoiEmail.js` : envoi SMTP (`nodemailer`, timeout 20s), `envoiConfigure()` — la condition
  « l'envoi est-il configuré ? » partagée par le job de rappels, la route de notification de pièces
  et la route de test, qui doivent rester d'accord. Le transport est injectable, pour que les tests
  n'aient jamais besoin d'un vrai serveur SMTP.
- `src/parametresRepo.js` : réglages persistés dans la table `parametres` (blob JSON sous la clé
  `reglages`), partagés entre tous les postes puisqu'ils vivent dans la même base que les dossiers
  — pas dans `config.json`, réservé aux réglages d'infrastructure posés une fois à l'installation.
- `src/jobs/rappels.js` : un tour toutes les 30 minutes (`config.intervalleRappelsMs`), silencieux
  tant que l'envoi n'est pas configuré. `reminder_log` (même table que le
  schéma initial de la base) empêche un double envoi le même jour, y compris entre deux tours du
  minuteur. Un dossier sans condition de prêt (`sansPret`) est quand même rappelé pour ses autres
  échéances — ce mécanisme ne dépend pas de `d.reminderDays` (propre au seul export `.ics` manuel).
- `src/routes/reglages.js` : `GET/PUT /api/reglages` + `POST /api/reglages/tester-email` (envoie
  toujours avec les réglages déjà **enregistrés** en base, jamais un formulaire non validé),
  `GET /api/reglages/dernier-tour` (compte rendu, `null` tant que la tâche n'a rien tenté) et
  `POST /api/reglages/lancer-rappels` (un vrai tour, tout de suite).
- `creerApp({ db, config, envoyerEmailFn })` : la couche d'envoi est injectable, pour que les tests
  de routes n'ouvrent ni serveur SMTP ni serveur HTTP.

## Analyse juridique par IA locale (Ollama)

Le même modèle local sert plusieurs fonctionnalités distinctes :
- L'onglet « Relecture d'actes » (Outil 2) **n'utilise plus du tout le modèle**. Son rapport est
  calculé entièrement dans le navigateur par des règles (voir CLAUDE.md, « Outil 2 refait de
  zéro »), et le bouton facultatif « Approfondir avec l'IA locale » a été retiré le 23/09/2026 à la
  demande de l'étude, qui n'y voyait aucun apport. Les routes `/api/audit-acte/*` n'existent plus.
- Le wizard « Nouveau dossier » lui-même appelle aussi le modèle en arrière-plan, juste après
  l'extraction habituelle par regex (inchangée, toujours le chemin principal et immédiat) : il ne
  complète QUE ce que les regex n'ont pas trouvé et ne propose de nouveaux engagements du vendeur
  qu'en ajout, jamais en remplacement — aucune valeur déjà détectée ou déjà saisie n'est jamais
  écrasée (`POST /api/extraction-ia`). Entièrement silencieux si Ollama n'est pas installé/lancé :
  le wizard reste alors utilisable exactement comme avant l'ajout de cette fonctionnalité.

  Cette seconde fonctionnalité procède en **trois appels ciblés**, lancés en parallèle par le
  client (paramètre `lot` de la requête) plutôt qu'en un seul appel fourre-tout :

  | Lot | Ce qu'il lit | Contexte envoyé au modèle |
  |---|---|---|
  | `parties` | type d'acte, parties et leurs rôles, notaires | 10 000 premiers caractères + fenêtres autour de « Maître », « notaire », « ci-après dénommé » |
  | `bien` | adresse du bien, cadastre, prix, type de vente | tête du document + fenêtres autour de « désignation », « cadastr », « sis à », « prix » |
  | `dates` | échéances par fonction juridique, engagements du vendeur | tête du document + fenêtres autour de « prêt », « acte authentique », « réitér », « délai », « au plus tard » |

  Un modèle 7-8B tenu de remplir quinze champs hétérogènes d'un coup en bâcle une partie ; surtout,
  chaque lot reçoit ainsi le passage de l'acte qui le concerne au lieu des mêmes 40 000 caractères
  payés trois fois. **Conséquence sur le temps de réponse** : Ollama traite les requêtes les unes
  après les autres, donc compter environ le triple du temps d'un appel unique — mais sur un
  contexte bien plus court à chaque fois, l'écart réel est plus faible. Le formulaire se remplit
  lot par lot, sans attendre le plus lent des trois, et l'import lui-même n'est jamais retardé.

  Deux garde-fous, côté serveur puis côté client :
  - **chaque valeur doit être accompagnée de la phrase de l'acte qui la justifie**, et le serveur
    vérifie que cette citation figure LITTÉRALEMENT dans le PDF. C'est le seul signal fiable : le
    score de « confiance » que renvoie un modèle de cette taille n'est calibré sur rien, une
    citation vérifiable l'est. Citation retrouvée → la donnée est marquée confirmée et sa page est
    affichée ; introuvable → « à vérifier », quel que soit l'aplomb du modèle ;
  - **le modèle ne calcule jamais une date à partir d'un délai** : il rapporte le délai (« 60
    jours ») et son point de départ tel que l'acte le nomme, et le calcul est fait par l'outil,
    déterministe et testé — et uniquement quand le point de départ est la signature, seule date
    connue à l'import.

  Quand le modèle contredit les regex, c'est la détection par regex qui est retenue (déterministe,
  testée sur de vrais actes) : l'écart est signalé dans le panneau « Ce que l'outil a compris » à
  l'étape « Vérifier », jamais tranché en silence.

  **Un quatrième mode, ciblé** (`lot: 'cible'` + `champ`, voir `src/extraction/cible.js`) : un
  bouton « Redemander à l'IA » sur une ligne encore floue du panneau de révision relance le modèle
  sur CETTE SEULE donnée, avec une fenêtre de texte plus large que celle d'un lot normal (un geste
  explicite de l'étude sur un seul champ justifie ce coût). Même garde-fous que les trois lots
  automatiques ci-dessus (extrait vérifié, aucun calcul de date côté serveur), et même principe côté
  client : la réponse devient une proposition avec bouton « Utiliser », jamais une écriture directe.

Le modèle tourne **entièrement en local sur ce serveur** via [Ollama](https://ollama.com) (gratuit,
open-source) — le texte des documents ne quitte JAMAIS le réseau de l'étude, cohérent avec la
décision déjà prise de rester sans hébergement externe (voir CLAUDE.md) et avec le secret
professionnel notarial (identité des parties, données financières).

**Installation (une seule fois, sur le poste qui héberge `CLAIRE-serveur.exe`)** :
1. Télécharger et installer Ollama pour Windows depuis <https://ollama.com/download> (installateur
   classique, pas de configuration particulière requise).
2. Ouvrir une invite de commandes et lancer :
   ```
   ollama pull llama3.1:8b
   ```
   Télécharge le modèle par défaut (~4-5 Go) — à faire une seule fois ; Ollama le garde ensuite
   sur disque. Ollama démarre automatiquement en arrière-plan après l'installation (icône dans la
   zone de notification) et écoute sur `http://localhost:11434`, jamais accessible depuis
   l'extérieur du poste par défaut.
3. Rien d'autre à configurer côté CLAIRE : le serveur détecte automatiquement Ollama à chaque
   ouverture de l'onglet (bandeau vert « Modèle local disponible » ou rouge avec la cause précise
   si Ollama n'est pas lancé/le modèle pas encore téléchargé).

**Choix du modèle** : `llama3.1:8b` par défaut — un bon compromis entre qualité d'analyse et
vitesse sur un CPU de bureau sans carte graphique dédiée (quelques dizaines de secondes à quelques
minutes selon la longueur des documents). Pour changer de modèle (ex. un modèle plus grand si le
poste a plus de puissance, ou plus petit s'il est modeste) : `ollama pull <autre-modele>`, puis
définir `OLLAMA_MODEL=<autre-modele>` dans `.env` (mode développeur) ou `"ollamaModel":
"<autre-modele>"` dans `config.json` à côté de l'exécutable (mode `.exe` — clé à ajouter à la main
dans ce fichier JSON, jamais générée automatiquement pour ce réglage-là). `OLLAMA_URL`/`ollamaUrl`
permet de même de pointer vers une autre adresse qu'un Ollama tournant sur ce même poste, si
l'étude préfère l'installer sur une machine dédiée du réseau plutôt que sur le poste serveur.

**Limites à connaître** :
- Un modèle de langage peut se tromper, inventer un détail ou passer à côté d'un vrai problème —
  chaque constat proposé est à vérifier, jamais une validation juridique en soi (rappelé dans
  l'interface elle-même). Voir CLAUDE.md pour le choix explicite de ne jamais utiliser un service
  IA en ligne pour cette fonctionnalité, précisément à cause de la confidentialité des actes.
- Rien n'est jamais enregistré par cet outil : les PDF déposés et le texte qui en est extrait ne
  vivent qu'en mémoire le temps de l'analyse, aucun dossier n'est créé (le dossier CLAIRE
  éventuellement lié n'est jamais modifié, seulement lu).
- **Non vérifié en conditions réelles dans cet environnement de développement** (pas de machine
  Windows ni d'Ollama installable ici) : le client HTTP (`src/llm.js`) et les routes qui l'utilisent
  sont testés avec un faux serveur Ollama, mais la qualité réelle des réponses de `llama3.1:8b`
  reste à confirmer par l'étude.

### Troisième usage du modèle : confirmer une offre de prêt

En plus de l'analyse approfondie et de l'extraction du wizard, le modèle local sert à **confirmer
qu'un PDF trouvé dans le dossier d'un client est bien une offre (ou un contrat) de prêt** — route
`POST /api/offre-pret/confirmer` (`src/routes/offrePret.js`).

L'outil ne lui envoie que **le haut de la première page** du document (quelques centaines de
caractères : le titre et ce qui l'entoure), jamais le document entier. C'est le dernier des trois
filtres de reconnaissance, après le nombre de pages et le titre lui-même — voir la section
« OFFRE DE PRÊT » de `script.js`. L'appel est donc court, de l'ordre de quelques secondes même sur
un CPU modeste, contrairement aux deux autres usages.

**Si Ollama n'est pas disponible**, la route répond `503` et l'offre trouvée passe au statut
« À confirmer » côté interface, distinct de « Reçue » : le document est retenu et ouvrable en un
clic, mais rien n'est validé tant que personne ne l'a regardé. Le dossier reste rescanné
automatiquement, donc le statut se résout tout seul dès qu'Ollama est de nouveau joignable —
aucune action n'est nécessaire de la part de l'étude.

## Dossiers clients sur le NAS

L'outil retrouve automatiquement l'offre de prêt et les pièces d'un dossier (urbanisme,
diagnostics, titre de propriété…) dans le dossier client correspondant sur le NAS de l'étude.
**C'est le SERVEUR qui lit ces fichiers**, plus le navigateur.

### Pourquoi ce changement

Jusqu'ici, c'est le navigateur qui ouvrait le dossier, via l'API File System Access
(`showDirectoryPicker`). Cette API n'existe que dans un contexte sécurisé : `localhost` ou HTTPS.
Les collaborateurs qui rejoignent l'outil par l'adresse IP du poste serveur
(`http://192.168.x.x:3000`, le cas normal au bureau) ne l'avaient donc tout simplement pas, et ne
pouvaient ni relier un dossier ni consulter une pièce — alors que les dossiers sont sur un NAS
commun, visible par tout le monde.

Deux bénéfices au passage :

- **Plus aucune autorisation à reconfirmer.** Chrome redemandait l'accès à chaque redémarrage,
  dossier par dossier. La popup de démarrage, le bandeau d'alerte et le bouton « Reconfirmer tous
  les accès » ont disparu avec le problème.
- **Un dossier relié depuis un poste l'est pour tous** : le lien est enregistré sur le dossier,
  c'est-à-dire sur le serveur, au lieu d'être un « handle » propre à un navigateur.

### Configuration

Une seule chose à indiquer : le dossier qui CONTIENT les dossiers clients.

- **Mode `.exe`** : ouvrir `config.json` (à côté de `CLAIRE-serveur.exe`) et renseigner
  `"nasRacine"`, puis redémarrer le serveur. La clé y est déjà présente, vide :

  ```json
  { "authPassword": "…", "port": 3000, "calendrierToken": "…", "nasRacine": "\\\\serveur\\partage\\DOSSIERS CLIENTS" }
  ```

  Un chemin réseau s'écrit avec des antislashs DOUBLÉS dans un fichier JSON, comme ci-dessus
  (`\\\\serveur\\partage`), sinon le fichier devient illisible. Une lettre de lecteur mappée
  (`"Z:\\DOSSIERS CLIENTS"`) fonctionne aussi, à condition que le compte qui exécute le serveur
  voie ce lecteur — ce qui n'est pas garanti pour un service Windows (voir la section suivante) :
  préférer le chemin réseau complet dans ce cas.
- **Mode développeur** : `NAS_RACINE=/chemin/vers/les/dossiers` dans `.env`.

Sans cette valeur, la fonctionnalité est simplement désactivée et l'interface le dit en toutes
lettres au moment de relier un dossier — elle n'échoue jamais en silence.

**Si la fenêtre du serveur clignote puis se referme après avoir modifié `config.json`**, c'est ce
fichier qui est en cause : une virgule manquante, une virgule en trop après la dernière ligne, ou
des antislashs simples. Le serveur affiche désormais un message expliquant précisément quoi
corriger, garde la fenêtre ouverte le temps de le lire, et l'écrit dans `erreur-demarrage.txt` à
côté de l'exécutable — c'est le premier fichier à ouvrir en cas de démarrage impossible. Pour voir
le message vous-même : ouvrir une invite de commandes dans le dossier de l'exécutable et lancer
`CLAIRE-serveur.exe` depuis là, la fenêtre ne se fermera pas.

### Comment un dossier est relié

« Relier un dossier du NAS » sur une fiche affiche la liste des dossiers clients, avec une
**proposition fondée sur le nom** (le dossier CLAIRE « DUPONT / MARTIN » propose
« 2024-118 DUPONT MARTIN » : numéro de dossier, accents et ponctuation sont ignorés). La liste
complète reste affichée et le clic est toujours explicite : c'est une proposition, pas une
décision. Quand deux dossiers correspondent aussi bien l'un que l'autre, rien n'est proposé —
mieux vaut choisir soi-même que chercher les pièces d'une vente dans celles d'une autre.

« Revérifier tous les dossiers », dans la barre d'outils du Suivi, relance ce parcours pour tous
les dossiers reliés en une fois.

**Surveillance périodique** (`src/nasWatch.js`, démarrée par `index.js`) : toutes les 10 minutes, le
serveur reliste les PDF de chaque dossier actif relié (noms de fichiers seulement, aucune lecture de
contenu) et compare au dernier inventaire connu. Un fichier apparu depuis le tour précédent déclenche
un toast au prochain sondage du client — plus besoin d'attendre un clic sur « Revérifier » pour s'en
apercevoir. Silencieuse comme le reste des fonctionnalités NAS quand `nasRacine` n'est pas configurée.

### Ce que le serveur expose, et ses limites

Trois routes seulement (`server/src/routes/nas.js`), toutes derrière le mot de passe partagé :
lister les dossiers clients, lister les PDF de l'un d'eux, servir les octets d'un PDF. Le serveur
n'analyse aucun PDF : c'est le navigateur qui continue de le faire (pdf.js), comme avant.

**Tout est borné à la racine configurée.** Un chemin arrivant d'une requête est vérifié avant
tout accès disque, liens symboliques résolus (`resoudreCheminNas`), et seuls les fichiers `.pdf`
sont servis — c'est la partie la plus testée de `server/test/nas.test.js`. Rien d'autre du poste
serveur n'est accessible par ces routes.

**Non vérifié sur un vrai NAS Windows** dans l'environnement de développement : la chaîne
complète (liste, rapprochement par nom, lecture, ouverture d'un PDF) a été vérifiée de bout en
bout avec un vrai serveur et une arborescence reproduisant celle de l'étude, mais sur un système
de fichiers Linux — le comportement d'un chemin UNC (`\\\\serveur\\partage`) et les droits du
compte exécutant le serveur restent à confirmer au bureau.


### Lien vers une pièce dans la notification Teams

Quand une pièce est trouvée sur le NAS, le message envoyé au responsable contient un lien qui ouvre
directement le PDF, sans passer par CLAIRE. Ce lien est **signé** par le serveur (HMAC, valable
90 jours) : il n'ouvre que CE fichier, et reste confiné au dossier NAS configuré. Il pointe vers
l'adresse du serveur sur le réseau du bureau — il ne s'ouvre donc que depuis un poste du bureau.
Si le fichier a été déplacé ou renommé depuis, le lien affiche un message et invite à ouvrir le
dossier dans CLAIRE.

Dans Teams, c'est le **nom de la pièce** qui est cliquable : l'email part en deux versions, texte
brut (l'adresse en clair après le nom) et HTML (le nom porte le lien). Pour que Teams affiche la
version HTML, l'action « Publier un message » du flux doit reprendre le **Corps** (le corps HTML)
de l'email reçu — pas un « corps en texte brut », s'il en propose un. Si le message Teams montre
encore l'adresse en clair après le nom de la pièce, c'est que le flux lit la version texte.

### Sauvegarde automatique de la base

Tous les dossiers vivent dans un seul fichier, `data/claire.db`, à côté de l'exécutable. CLAIRE en
fait **une copie par jour** (vérifiée toutes les heures, donc rattrapée si le poste a été éteint) et
garde les **14 dernières**, nommées `claire-AAAA-MM-JJ.db`. Le dossier de destination se choisit
dans **Réglages → Sauvegarde de la base** : indiquez un dossier **du NAS**, en chemin complet vu
depuis le poste serveur (`\\NAS\Sauvegardes\CLAIRE`) — sans choix, les copies restent dans
`data/sauvegardes`, sur le même disque que la base, donc sans protection contre une panne de ce
disque. Évitez le dossier qui contient les dossiers clients (`nasRacine`) : le dossier de
sauvegardes apparaîtrait dans la liste des dossiers à relier.

Chaque copie est obtenue par `VACUUM INTO` (copie cohérente d'une base ouverte), relue
(`PRAGMA integrity_check` + nombre de dossiers), puis copiée de façon asynchrone vers le NAS sous un
nom provisoire renommé à la fin. Le compte rendu s'affiche dans les Réglages, et un bandeau apparaît
sur le Tableau de bord si la dernière tentative a échoué ou si aucune sauvegarde n'a réussi depuis
3 jours.

**Restaurer** : arrêter le serveur (`Arreter-CLAIRE.bat`), renommer `data/claire.db` en
`claire-avant-restauration.db`, copier la sauvegarde voulue dans `data/` sous le nom `claire.db`,
relancer. Tout ce qui a été saisi après la date de la sauvegarde est perdu. **Tester une
restauration une fois** (sur un poste de test, ou en gardant la base d'origine à côté) avant de
compter dessus.

### Fichiers écartés

Un clic sur « Réinitialiser » d'une pièce mal reconnue écarte ce nom de fichier pour cette pièce,
sur tous les dossiers. Ces exclusions sont enregistrées sur le serveur (partagées par tous les
postes) et listées dans **Réglages › Fichiers écartés des pièces**, avec un bouton « Rétablir ». Le
diagnostic du dernier parcours d'un dossier signale aussi tout fichier écarté, avec « Ne plus
écarter ». Une pièce présente sur le NAS qui reste « manquante » sans raison apparente : regarder
d'abord là.

## Relecture d'actes par l'API Claude

L'écran **Relecture d'actes** fait relire un projet d'avant-contrat ou un projet d'acte de vente
point par point par Claude (Anthropic), sur une grille d'environ 45 points (parties, bien,
diagnostics, copropriété — y compris plusieurs copropriétés dans un même acte —, délais et clauses,
urbanisme, volet financier ; en projet de vente, concordance avec l'avant-contrat signé).

**Ce qui part chez Anthropic, et ce qui n'y part jamais.** Les noms, adresses, dates et lieux de
naissance, emails, téléphones, IBAN, numéros de sécurité sociale, références cadastrales et
sociétés sont remplacés par des jetons (`⟦PERSONNE_1⟧`…) **dans le navigateur**, avant tout envoi.
La correspondance jeton → valeur reste sur le poste ; le serveur ne la reçoit jamais. L'étape 2 de
l'écran montre exactement le texte qui sera envoyé, et permet de masquer un terme oublié ou de
laisser en clair une valeur masquée à tort. Les noms de fichiers ne sont pas envoyés non plus
(« Document 1 », « Annexe 2 »…). Cadre retenu : guide IEJ/CSN sur l'intelligence artificielle
(secret professionnel, vérification humaine de chaque sortie, archivage des requêtes).

**Clé API.** Réglages → *Relecture par Claude* : la clé est stockée dans la base du serveur et ne
ressort jamais vers un navigateur (seul un « clé enregistrée » est renvoyé). À défaut, la variable
d'environnement `ANTHROPIC_API_KEY` est utilisée. Le bouton *Tester* vérifie la clé sans rien
facturer. Modèles proposés : Claude Sonnet 5 (défaut) et Claude Opus 5. Le poste serveur doit
pouvoir joindre `api.anthropic.com` en HTTPS. Sans clé, l'écran reste utilisable avec les seuls
contrôles automatiques de CLAIRE (règles locales, sans IA).

**Coût.** Avant de lancer, l'écran affiche une fourchette calculée à partir du nombre exact de
jetons à lire (comptage gratuit chez Anthropic). Après l'analyse, le coût réel facturé, les jetons
lus et produits et la durée sont affichés en bas du bilan, avec le cumul du mois et depuis
l'installation. Tarifs utilisés (dollars par million de jetons) : Sonnet 5 — 2 en entrée, 10 en
sortie ; Opus 5 — 5 et 25. Un dossier complet (acte + avant-contrat + quelques annexes) représente
en général quelques dizaines de centimes.

**Archivage.** Chaque requête est conservée telle qu'envoyée — donc pseudonymisée — avec la
réponse, les jetons et le coût, dans la table `analyses_claude` de la base. Seules les
métadonnées (date, modèle, coût) sont exposées par `GET /api/relecture-claude/journal`.

**Vérification des citations.** Chaque point cité doit renvoyer à un extrait du texte ; le serveur
cherche l'extrait mot pour mot dans le document et recalcule la page d'après sa position réelle.
Un extrait introuvable est signalé comme non vérifié plutôt qu'affiché comme une preuve. Un point
de la grille que le modèle aurait omis est affiché « à surveiller », jamais « validé ».

Routes (toutes derrière le mot de passe partagé) : `GET /api/relecture-claude/etat`,
`POST /api/relecture-claude/estimer`, `POST /api/relecture-claude/analyser`,
`GET /api/relecture-claude/journal`, `GET|PUT /api/relecture-claude/reglages`,
`POST /api/relecture-claude/tester`.

## Analyses d'actes enregistrées

Chaque bilan affiché à l'étape 4 de la relecture d'actes est rangé dans la base (table `relectures`,
`routes/relectures.js`) : il se rouvre depuis la carte « Analyses enregistrées » de l'étape 1, sans
nouvelle requête à Anthropic ni nouvelle lecture des PDF.

- `GET /api/relectures` (liste, `?dossierId=` pour un dossier), `GET /api/relectures/:id` (bilan
  complet), `POST` (enregistrer), `PUT /:id` (remplacer), `DELETE /:id`. Derrière le mot de passe.
- On y garde le bilan **tel que l'étude l'a lu, ré-identifié** (noms rétablis) : c'est une donnée de
  l'étude, sur son serveur, au même titre que les dossiers — rien de cela n'est envoyé à Anthropic.
  Le journal `analyses_claude`, lui, garde la requête pseudonymisée envoyée, comme avant.
- Les PDF ne sont pas stockés : une pièce lue sur le NAS se rouvre dans l'aperçu, une pièce déposée
  depuis le poste non.
- La table fait partie de la base : la sauvegarde quotidienne la copie avec le reste.

## Commentaires sur la relecture d'actes

Le « mode commentaires » de l'écran **Relecture d'actes** enregistre l'avis de l'étude sur chaque
point relevé (juste, faux positif, mal formulé, gravité à revoir — pour ce dossier seulement ou
pour tous) et les oublis signalés. Ils sont stockés **dans la base du serveur** (table
`parametres`, clé `audit-retours`, 1 000 commentaires au plus), donc partagés entre les postes.

- `GET /api/audit-retours` — la liste ;
- `POST /api/audit-retours` — ajoute ou remplace (même `id`) un commentaire ;
- `DELETE /api/audit-retours/:id` — le supprime.

Les commentaires portés sur un point de la grille sont aussi **renvoyés à Claude** lors des
relectures suivantes, sous forme de consignes (« ne signale pas… », « considère comme critique… ») :
c'est ainsi que l'outil s'ajuste aux usages de l'étude, sans réentraînement. Seuls les 30 derniers
sont transmis : ce qui doit durer passe dans la **grille** elle-même (champ `consigne` de chaque
point, côté client), relu après chaque export de commentaires — la grille est injectée à chaque
analyse, avec pour chaque point la ligne « Attendu : … ».

Ces routes sont protégées par le mot de passe partagé, comme le reste de `/api`. Le bouton
« Exporter les commentaires » télécharge un JSON à transmettre pour corriger les règles de la
relecture : **il contient les clauses citées des actes**, à traiter avec la même discrétion que les
actes eux-mêmes.

## Signalements des collaborateurs

Bouton « Signaler un problème » en bas de la barre latérale : chaque collaborateur décrit ce qu'il
faisait et ce qui s'est passé, avec une capture d'écran s'il le souhaite. CLAIRE y joint la
version, l'écran, le dossier ouvert, le navigateur et les dernières erreurs techniques.

- Stockés dans la table `signalements` (capture comprise, réduite à 1600 px).
- Un signalement **bloquant** part aussitôt vers l'adresse de copie de l'étude (réglage « Copie de
  tous les rappels »), par la même chaîne que les rappels : il faut donc que l'envoi par email soit
  configuré et cette adresse renseignée.
- Tri, doublons, version du correctif et export dans **Réglages › Signalements des
  collaborateurs**. L'export (`signalements-claire-AAAA-MM-JJ.json`) est le fichier à transmettre
  pour correction.
- Routes (authentifiées) : `POST /api/signalements`, `GET /api/signalements`,
  `GET /api/signalements/:id`, `PATCH /api/signalements/:id`, `DELETE /api/signalements/:id`,
  `GET /api/signalements/export?statut=nouveau|transmis|corrige|doublon|ecarte|tous`.

## Mise à jour en un clic

Réglages › **Mise à jour de CLAIRE**. Chaque push sur `main` publie un nouveau
`CLAIRE-serveur.exe` en release GitHub (`serveur-exe-N`, voir
`.github/workflows/build-exe.yml`) ; le numéro `N` est embarqué dans l'exécutable
(`build-info.json`, écrit par `scripts/build-windows-exe.mjs`), c'est ainsi que le serveur sait
quelle version il fait tourner.

- **Vérifier** : lit la dernière release et la compare au build installé. Rien n'est téléchargé.
- **Mettre à jour maintenant** (après confirmation) : sauvegarde de la base → téléchargement de
  l'exécutable à côté de l'actuel → contrôle de sa taille et de son empreinte SHA-256 (publiée par
  GitHub) → l'actuel est renommé `CLAIRE-serveur.ancien.exe`, le nouveau prend sa place →
  redémarrage. Une sauvegarde impossible ou une empreinte différente annule tout sans rien
  changer. La page se recharge d'elle-même quand le serveur revient ; il faut se reconnecter (les
  sessions sont en mémoire).
- **Redémarrage** : lancé à la main ou par `Lancer-CLAIRE-en-arriere-plan.vbs`, le serveur relance
  lui-même le nouvel exécutable (sans fenêtre) avant de s'arrêter ; en service NSSM, il s'arrête et
  NSSM le relance.
- **Dépôt privé** : l'accès aux releases demande un jeton GitHub *fine-grained* limité au dépôt
  Office-suivi, permission **Contents : Read-only** — la procédure est affichée dans la carte. Il
  est gardé en base (`parametres`, clé `mise-a-jour`) et ne ressort par aucune route.
- **Retour arrière** : `Arreter-CLAIRE.bat`, supprimer `CLAIRE-serveur.exe`, renommer
  `CLAIRE-serveur.ancien.exe` en `CLAIRE-serveur.exe`, relancer.
- **La toute première fois**, l'exécutable en place n'a pas encore cette fonction : il faut
  installer à la main une version qui la contient. Il affiche ensuite « version inconnue » s'il
  est antérieur à l'embarquement du numéro de build — l'installation reste possible.

## Service Windows (démarrage automatique, redémarrage seul en cas de plantage)

Par défaut, `CLAIRE-serveur.exe` reste un simple exécutable : il tourne tant que sa fenêtre de
console (ou `Lancer-CLAIRE-en-arriere-plan.vbs`, voir plus haut) reste active, mais rien ne le
relance automatiquement après un plantage. **Pour le seul démarrage automatique à l'ouverture de
session, `Demarrer-CLAIRE-avec-Windows.vbs` (voir plus haut) suffit et n'exige aucun outil
tiers** — c'est le réglage recommandé pour le poste du bureau où quelqu'un ouvre une session
chaque matin. Le service ci-dessous ne vaut que pour un serveur qui doit tourner AVANT toute
ouverture de session ou se relancer seul après un plantage ; ne pas installer les deux en même
temps (le second à démarrer trouverait le port déjà pris et s'arrêterait). Pour un vrai service
Windows, ce dossier fournit deux scripts qui pilotent
[NSSM](https://nssm.cc/) (Non-Sucking Service Manager, outil gratuit tiers — pas développé par ce
projet, seul le pilotage via ces deux scripts l'est) :

1. Télécharger NSSM depuis <https://nssm.cc/download>, extraire `nssm.exe` (le binaire 64 bits,
   dossier `win64\` de l'archive) et le placer **dans le même dossier** que
   `CLAIRE-serveur.exe`.
2. Copier `server/scripts/Installer-service-NSSM.bat` dans ce même dossier, puis l'exécuter **en
   tant qu'administrateur** (clic droit → Exécuter en tant qu'administrateur — l'installation d'un
   service Windows l'exige).
3. Le service démarre immédiatement et démarre désormais tout seul à chaque redémarrage du poste,
   sans fenêtre de console ni script `.vbs` à lancer. En cas de plantage, il redémarre seul après
   quelques secondes. Deux journaux (`service-stdout.log`/`service-stderr.log`, à côté de l'exe)
   remplacent la console pour diagnostiquer un problème.
4. Pour vérifier l'état du service, l'arrêter ou le redémarrer manuellement : ouvrir `services.msc`
   et chercher « CLAIRE - Registre des échéances (serveur intranet) ».
5. Pour retirer complètement le service (retour à un exécutable simple) :
   `server/scripts/Desinstaller-service-NSSM.bat`, également en administrateur — `config.json`,
   le dossier `data\` et l'exécutable lui-même ne sont pas touchés, seul le service Windows est
   supprimé.

**Mettre à jour `CLAIRE-serveur.exe` une fois le service installé : PAS besoin de réinstaller le
service.** NSSM ne retient qu'un CHEMIN de fichier (`CLAIRE-serveur.exe` à cet endroit précis), pas
son contenu — remplacer le fichier suffit :
1. Arrêter le service (`services.msc` → clic droit sur le service → **Arrêter**).
2. Remplacer `CLAIRE-serveur.exe` par la nouvelle version, **au même endroit, sous le même nom**.
3. Redémarrer le service (`services.msc` → **Démarrer**).

`config.json` (mot de passe, jeton calendrier), le dossier `data\` (le registre des dossiers) et
les journaux ne sont pas touchés par ces trois étapes — ils vivent à côté de l'exécutable, jamais
dedans. Relancer `Installer-service-NSSM.bat` sur un service déjà installé ne sert à rien pour une
simple mise à jour (le script refuse même de continuer si le service existe déjà, précisément pour
éviter cette confusion) — il ne serait utile que pour changer les RÉGLAGES du service lui-même
(nom, description, emplacement des journaux), jamais pour un nouveau binaire.

**Non vérifié sur un vrai poste Windows dans cet environnement de développement** (aucune machine
Windows/NSSM disponible ici pour un test réel) — les deux scripts pilotent NSSM avec sa syntaxe en
ligne de commande documentée officiellement, mais à confirmer par l'étude : l'installation
elle-même, le redémarrage automatique après un `taskkill` du processus (simulant un plantage), et
le démarrage au boot du poste.

**Si le serveur s'arrête tout seul après quelques minutes** (le navigateur affiche
`ERR_CONNECTION_REFUSED` sur `localhost` alors que ça fonctionnait juste avant) : trois causes
possibles, à vérifier dans cet ordre.
1. **La fenêtre de console a été fermée** (la cause la plus fréquente, voir le point 4 ci-dessus)
   — passer à `Lancer-CLAIRE-en-arriere-plan.vbs` supprime le risque en supprimant la fenêtre
   elle-même.
2. **Un antivirus/Windows Defender a discrètement mis fin au processus** après un contrôle de
   réputation en ligne (l'exécutable n'étant pas signé, voir plus haut — un délai de quelques
   minutes avant ce verdict est courant). Vérifier Windows Sécurité → Protection contre les virus
   et menaces → Historique de protection, à l'heure de l'arrêt. Si c'est le cas, ajouter
   `CLAIRE-serveur.exe` en exception dans l'antivirus (ou demander ce réglage à l'informatique de
   l'étude) — aucun correctif côté code n'y change rien, la décision appartient à l'antivirus.
3. **Une erreur inattendue dans le serveur lui-même** : un fichier `crash.log` est écrit à côté de
   `config.json`/`mot-de-passe.txt` dès qu'une telle erreur survient, avec la date et le détail
   technique — l'envoyer si l'arrêt se reproduit, pour un vrai diagnostic plutôt qu'une supposition.
   Le serveur essaie de continuer à tourner malgré une telle erreur plutôt que de s'arrêter, mais
   ne peut évidemment rien faire si la fenêtre a été fermée ou si l'antivirus coupe le processus de
   l'extérieur (cas 1 et 2).

Ce dossier (`CLAIRE-serveur.exe` + `config.json` + `mot-de-passe.txt` + les quatre scripts assistants
+ le sous-dossier `data/` qui apparaît après le premier lancement) forme un tout déplaçable : le
copier ailleurs (autre disque, autre poste) conserve le registre et le mot de passe.

**Reconstruire ce `.exe`** (après une modification du serveur) : `npm run build:exe` depuis
`server/` — voir `scripts/build-windows-exe.mjs`. Nécessite `osslsigncode` installé sur la machine
qui construit (`apt-get install osslsigncode` sous Linux) pour un résultat propre ; sans lui, la
construction fonctionne quand même (avertissement de signature ignoré par `postject`).

## Option développeur : `npm start` (avec un `.env`)

Pour développer, ou pour qui préfère gérer soi-même Node.js/le `.env` :

```bash
cd server
npm install
cp .env.example .env
```

Éditer `.env` et renseigner au minimum `AUTH_PASSWORD` (le mot de passe partagé entre tous les
collaborateurs de l'étude — sans lui, le serveur démarre mais personne ne peut se connecter).
`CALENDRIER_TOKEN`/`SMTP_*` peuvent rester vides, ils ne servent à aucune fonctionnalité active
pour l'instant.

```bash
npm start
```

Le serveur écoute par défaut sur `http://localhost:3000/` (`PORT` dans `.env` pour changer) et
sert lui-même `index.html`/`style.css`/`script.js` — pas besoin d'ouvrir ces fichiers séparément,
il suffit d'ouvrir cette URL dans Chrome/Edge. Le premier écran demande le mot de passe partagé ;
une fois connecté, le jeton de session reste en mémoire du navigateur (12h) sans avoir à se
reconnecter à chaque page.

Pour que les autres postes du bureau y accèdent, remplacer `localhost` par l'adresse IP locale du
poste qui héberge le serveur (`http://<ip-du-poste>:3000/`) — ce poste doit rester allumé et le
serveur en cours d'exécution pour que le registre reste accessible aux autres.

## Tests

```bash
npm test
```

178 tests (`node:test`, aucune dépendance de test supplémentaire) couvrant l'authentification, le
cycle complet créer/lire/modifier/supprimer/restaurer un dossier, la résolution de configuration
du mode `.exe` (mot de passe ET jeton calendrier), le service des fichiers statiques embarqués, le
flux calendrier connecté (`/calendrier.ics`), l'extraction IA pour le wizard (`/api/extraction-ia`) et les rappels par email
(réglages, client Power Automate, job de rappels avec un envoi injecté) — les trois premières avec
un faux serveur Ollama HTTP, la dernière avec un faux webhook HTTP local (voir
`test/extraction-ia.test.js`, `test/parametresRepo.test.js`,
`test/envoi-email.test.js`, `test/rappels.test.js`, `test/reglages.test.js`).
Indépendant de la suite de tests à la racine du dépôt (`npm test` depuis `Office-suivi/`, 526 tests
sur les fonctions pures de `script.js`) — les deux peuvent tourner sans que l'un dépende des
dépendances de l'autre.

## Ce qui n'est PAS encore prêt pour un usage réel au bureau

- **`CLAIRE-serveur.exe` n'est pas signé** (pas de certificat de signature de code Windows pour ce
  projet) : avertissement SmartScreen/antivirus au premier lancement, voir plus haut — vérifié
  uniquement par construction du binaire dans cet environnement de développement (`file` confirme
  un exécutable Windows valide), **pas encore testé par un vrai double-clic sur un poste Windows
  réel** — à confirmer par l'étude (ce qui s'affiche exactement, si le navigateur s'ouvre bien).
- **Service Windows (NSSM) disponible mais non vérifié sur un vrai poste Windows** — voir la
  section « Service Windows » plus haut : les scripts `Installer-service-NSSM.bat`/
  `Desinstaller-service-NSSM.bat` pilotent NSSM avec sa syntaxe documentée, mais aucune machine
  Windows n'était disponible dans cet environnement de développement pour un test réel de bout en
  bout (installation, redémarrage automatique après plantage simulé, démarrage au boot).
- **Calendrier connecté (webcal) disponible mais non vérifié dans un vrai Outlook** — voir la
  section « Calendrier connecté » plus haut : le flux `.ics` généré est vérifié par des tests
  automatisés (format, jeton, filtrage des dossiers archivés), mais son abonnement réel depuis
  Outlook (affichage des événements, comportement de resynchronisation) reste à confirmer par
  l'étude.
- **Pas d'import automatique** des dossiers déjà enregistrés sur la version 100% locale (`main`) :
  il faudrait aujourd'hui recréer les dossiers à la main dans cette nouvelle version.
- **Rappels automatiques par email disponibles mais non vérifiés sur la messagerie réelle de
  l'étude** — voir la section « Rappels automatiques par email » plus haut : la couche d'envoi, le
  job de rappels et les routes sont testés avec un transport injecté, et le chemin complet
  (navigateur → serveur → SMTP) a été vérifié contre un faux serveur SMTP local, qui a bien reçu
  `To: <passerelle>`, `Subject: <destinataire>` et le message en corps. **L'envoi lui-même est
  désormais confirmé en production** (montage Gmail + mot de passe d'application, voir « Quel mode
  d'envoi ? »). Reste hors de portée de CLAIRE, et donc à confirmer d'un coup d'œil dans Teams :
  que le flux se déclenche bien à l'arrivée de l'email et poste le message à la bonne personne —
  un envoi réussi ne le prouve pas. Le panneau « Dernier tour de rappels » couvre le maillon
  d'avant (l'envoi), pas celui-là.
- **`node:sqlite` est une API expérimentale** de Node.js (avertissement affiché au démarrage,
  sans conséquence connue) — `better-sqlite3` reste une option de repli si elle posait problème
  un jour sur le poste de l'étude.
- **Analyse et extraction par IA locale (Ollama) disponibles mais non vérifiées sur de vrais actes**
  — voir la section « Analyse juridique par IA locale » plus haut : le client HTTP et les routes
  (`/api/extraction-ia`, `/api/offre-pret/confirmer`) sont testées avec un faux serveur Ollama, mais la
  qualité réelle des constats/champs produits par le modèle par défaut (`llama3.1:8b`) sur de vrais
  compromis/promesses/projets d'actes reste à confirmer par l'étude, tout comme les temps de réponse
  sur le matériel réel du poste serveur (aucun GPU dédié à prévoir dans ce budget — la vitesse dépendra
  donc largement du CPU disponible). Pour l'extraction dans le wizard "Nouveau dossier" en
  particulier, le dédoublonnage des engagements du vendeur suggérés par l'IA (éviter de répéter un
  engagement déjà repéré par regex, voir `engagementDejaConnu()` dans `script.js`) est un premier
  jet volontairement prudent — sans racinisation des mots comparés, il peut laisser passer plus de
  répétitions qu'un algorithme plus sophistiqué ne le ferait ; chaque suggestion reste de toute
  façon retirable d'un clic.
