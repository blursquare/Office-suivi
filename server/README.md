# Serveur intranet CLAIRE

Petit serveur (Express + SQLite) qui remplace le `localStorage`/registre partagé JSON de la
version 100% locale (branche `main`) par un vrai registre partagé en temps réel, servi sur le
réseau de l'étude. Voir `CLAUDE.md` à la racine du dépôt, section « Mode serveur intranet
(branche claude/serveur-intranet) », pour le contexte complet de ce chantier.

**État actuel : registre des dossiers partagé en temps réel, avec authentification par mot de
passe partagé.** Les relances email automatiques et le flux calendrier n'ont pas été poursuivis
(arrêtés à la demande de l'étude) — voir le plan de ce chantier si l'un de ces deux points doit
être repris un jour.

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
4. Une fenêtre de console noire s'ouvre et reste ouverte : c'est normal, c'est le serveur qui
   tourne. La fermer arrête le serveur pour tout le monde — la laisser ouverte tant que l'étude
   travaille dans l'outil (comme aujourd'hui avec le fichier local, mais un seul double-clic au
   lieu de plusieurs commandes).
5. **Au tout premier lancement**, un mot de passe partagé est généré automatiquement et affiché
   dans la console, ET écrit dans un fichier `mot-de-passe.txt` créé à côté de l'exécutable — à
   communiquer à tous les collaborateurs (même mot de passe pour tout le monde). Pour le changer,
   éditer `config.json` (créé au même endroit) puis relancer.
6. Le navigateur s'ouvre automatiquement sur l'outil. Pour que les **autres postes** du bureau s'y
   connectent, la console affiche aussi les adresses à leur donner (`http://<ip-du-poste>:3000/`)
   — ce poste doit rester allumé, avec l'exe lancé, pour que les autres y accèdent.

**Si le serveur s'arrête tout seul après quelques minutes** (le navigateur affiche
`ERR_CONNECTION_REFUSED` sur `localhost` alors que ça fonctionnait juste avant) : deux causes
possibles, à vérifier dans cet ordre.
1. **Un antivirus/Windows Defender a discrètement mis fin au processus** après un contrôle de
   réputation en ligne (l'exécutable n'étant pas signé, voir plus haut — un délai de quelques
   minutes avant ce verdict est courant). Vérifier Windows Sécurité → Protection contre les virus
   et menaces → Historique de protection, à l'heure de l'arrêt. Si c'est le cas, ajouter
   `CLAIRE-serveur.exe` en exception dans l'antivirus (ou demander ce réglage à l'informatique de
   l'étude) — aucun correctif côté code n'y change rien, la décision appartient à l'antivirus.
2. **Une erreur inattendue dans le serveur lui-même** : un fichier `crash.log` est écrit à côté de
   `config.json`/`mot-de-passe.txt` dès qu'une telle erreur survient, avec la date et le détail
   technique — l'envoyer si l'arrêt se reproduit, pour un vrai diagnostic plutôt qu'une supposition.
   Le serveur essaie de continuer à tourner malgré une telle erreur plutôt que de s'arrêter, mais
   ne peut évidemment rien faire si c'est l'antivirus qui coupe le processus de l'extérieur (cas 1).

Ce dossier (`CLAIRE-serveur.exe` + `config.json` + `mot-de-passe.txt` + le sous-dossier `data/`
qui apparaît après le premier lancement) forme un tout déplaçable : le copier ailleurs (autre
disque, autre poste) conserve le registre et le mot de passe.

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

15 tests (`node:test`, aucune dépendance de test supplémentaire) couvrant l'authentification, le
cycle complet créer/lire/modifier/supprimer/restaurer un dossier, la résolution de configuration
du mode `.exe` et le service des fichiers statiques embarqués. Indépendant de la suite de tests à
la racine du dépôt (`npm test` depuis `Office-suivi/`, 132 tests sur les fonctions pures de
`script.js`) — les deux peuvent tourner sans que l'un dépende des dépendances de l'autre.

## Ce qui n'est PAS encore prêt pour un usage réel au bureau

- **`CLAIRE-serveur.exe` n'est pas signé** (pas de certificat de signature de code Windows pour ce
  projet) : avertissement SmartScreen/antivirus au premier lancement, voir plus haut — vérifié
  uniquement par construction du binaire dans cet environnement de développement (`file` confirme
  un exécutable Windows valide), **pas encore testé par un vrai double-clic sur un poste Windows
  réel** — à confirmer par l'étude (ce qui s'affiche exactement, si le navigateur s'ouvre bien).
- **Pas de service Windows**, y compris pour `CLAIRE-serveur.exe` : reste actif tant que sa fenêtre
  de console reste ouverte, pas de redémarrage automatique en cas de plantage ou de redémarrage du
  poste. Voir le plan de ce chantier (section « Déploiement ») si ce point doit être traité un jour
  (piste retenue : NSSM pour l'installer comme un vrai service Windows).
- **Pas d'import automatique** des dossiers déjà enregistrés sur la version 100% locale (`main`) :
  il faudrait aujourd'hui recréer les dossiers à la main dans cette nouvelle version.
- **`node:sqlite` est une API expérimentale** de Node.js (avertissement affiché au démarrage,
  sans conséquence connue) — `better-sqlite3` reste une option de repli si elle posait problème
  un jour sur le poste de l'étude.
