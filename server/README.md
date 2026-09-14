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
   Un premier lancement direct sur l'exe (fenêtre visible) reste utile une fois, pour vérifier que
   tout démarre bien et passer l'avertissement SmartScreen ci-dessous ; ensuite, place à
   `Lancer-CLAIRE-en-arriere-plan.vbs`.
5. **Au tout premier lancement**, un mot de passe partagé est généré automatiquement et affiché
   dans la console, ET écrit dans un fichier `mot-de-passe.txt` créé à côté de l'exécutable — à
   communiquer à tous les collaborateurs (même mot de passe pour tout le monde). Pour le changer,
   éditer `config.json` (créé au même endroit) puis relancer.
6. Le navigateur s'ouvre automatiquement sur l'outil. Pour que les **autres postes** du bureau s'y
   connectent, la console affiche aussi les adresses à leur donner (`http://<ip-du-poste>:3000/`)
   — également écrites dans `Adresses-du-serveur.txt` à côté de l'exécutable, pour les retrouver
   même une fois la fenêtre masquée. Ce poste doit rester allumé, avec le serveur lancé (fenêtre
   visible, en arrière-plan, ou en service Windows — voir plus bas), pour que les autres y accèdent.

## Calendrier connecté (abonnement webcal)

Un flux calendrier en lecture seule, généré à la demande à partir de TOUS les dossiers actifs du
registre (obtention du prêt, signature de l'acte, vente préalable, échéances personnalisées) —
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
4. Un dossier archivé n'apparaît plus dans ce flux (mêmes échéances qu'un dossier actif tant
   qu'il ne l'est pas). Le flux est en LECTURE SEULE : modifier/supprimer un événement dans Outlook
   n'a aucun effet sur le registre CLAIRE, qui reste la seule source de vérité.
5. En mode développeur (`npm start`), ce flux reste désactivé tant que `CALENDRIER_TOKEN` n'est
   pas renseigné dans `.env` (voir `.env.example`) — sans jeton, `GET /calendrier.ics` répond 503
   plutôt que de générer un flux non protégé.

## Analyse juridique par IA locale (Ollama)

Un onglet « Analyse approfondie (IA) » (sidebar de l'outil) permet de déposer l'acte principal
(compromis/promesse) et ses annexes séparément — chacune dans son propre PDF, comme reçues — pour
une relecture croisée façon « un notaire relit l'acte » : cohérence du prix/de l'adresse/des dates
entre l'acte et ses annexes, pièces mentionnées mais absentes, clauses contradictoires. Le modèle
tourne **entièrement en local sur ce serveur** via [Ollama](https://ollama.com) (gratuit,
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
- Un document très long (plusieurs dizaines de pages) est tronqué au-delà d'un certain nombre de
  caractères avant d'être envoyé au modèle (voir `LIMITE_CARACTERES_PAR_DOCUMENT` dans
  `src/routes/analyseIa.js`) — l'interface le signale quand c'est le cas, l'analyse reste alors
  partielle plutôt que d'attendre indéfiniment ou d'échouer.
- Rien n'est jamais enregistré par cet outil : les PDF déposés et le texte qui en est extrait ne
  vivent qu'en mémoire le temps de l'analyse, aucun dossier n'est créé.
- **Non vérifié en conditions réelles dans cet environnement de développement** (pas de machine
  Windows ni d'Ollama installable ici) : le client HTTP (`src/llm.js`) et la route
  (`src/routes/analyseIa.js`) sont testés avec un faux serveur Ollama (voir
  `test/analyse-ia.test.js`), mais la qualité réelle des constats produits par `llama3.1:8b` sur de
  vrais actes reste à confirmer par l'étude.

## Service Windows (démarrage automatique, redémarrage seul en cas de plantage)

Par défaut, `CLAIRE-serveur.exe` reste un simple exécutable : il tourne tant que sa fenêtre de
console (ou `Lancer-CLAIRE-en-arrière-plan.vbs`, voir plus haut) reste active, mais rien ne le
relance automatiquement après un plantage ou un redémarrage du poste. Pour un vrai service
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

Ce dossier (`CLAIRE-serveur.exe` + `config.json` + `mot-de-passe.txt` + les deux scripts assistants
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

36 tests (`node:test`, aucune dépendance de test supplémentaire) couvrant l'authentification, le
cycle complet créer/lire/modifier/supprimer/restaurer un dossier, la résolution de configuration
du mode `.exe` (mot de passe ET jeton calendrier), le service des fichiers statiques embarqués, le
flux calendrier connecté (`/calendrier.ics`) et l'analyse juridique par IA locale (`/api/analyse-ia`,
avec un faux serveur Ollama HTTP — voir `test/analyse-ia.test.js`). Indépendant de la suite de
tests à la racine du dépôt (`npm test` depuis `Office-suivi/`, 134 tests sur les fonctions pures de
`script.js`) — les deux peuvent tourner sans que l'un dépende des dépendances de l'autre.

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
- **`node:sqlite` est une API expérimentale** de Node.js (avertissement affiché au démarrage,
  sans conséquence connue) — `better-sqlite3` reste une option de repli si elle posait problème
  un jour sur le poste de l'étude.
- **Analyse juridique par IA locale (Ollama) disponible mais non vérifiée sur de vrais actes** —
  voir la section « Analyse juridique par IA locale » plus haut : le client HTTP et la route sont
  testés avec un faux serveur Ollama, mais la qualité réelle des constats produits par le modèle
  par défaut (`llama3.1:8b`) sur de vrais compromis/promesses reste à confirmer par l'étude, tout
  comme les temps de réponse sur le matériel réel du poste serveur (aucun GPU dédié à prévoir dans
  ce budget — la vitesse dépendra donc largement du CPU disponible).
