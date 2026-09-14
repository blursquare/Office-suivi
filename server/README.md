# Serveur intranet CLAIRE

Petit serveur (Express + SQLite) qui remplace le `localStorage`/registre partagé JSON de la
version 100% locale (branche `main`) par un vrai registre partagé en temps réel, servi sur le
réseau de l'étude. Voir `CLAUDE.md` à la racine du dépôt, section « Mode serveur intranet
(branche claude/serveur-intranet) », pour le contexte complet de ce chantier.

**État actuel : registre des dossiers partagé en temps réel, avec authentification par mot de
passe partagé.** Les relances email automatiques, le flux calendrier et le packaging en service
Windows n'ont pas été poursuivis (arrêtés à la demande de l'étude) — voir le plan de ce chantier
si l'un de ces trois points doit être repris un jour.

## Démarrage

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

7 tests (`node:test`, aucune dépendance de test supplémentaire) couvrant l'authentification et le
cycle complet créer/lire/modifier/supprimer/restaurer un dossier. Indépendant de la suite de
tests à la racine du dépôt (`npm test` depuis `Office-suivi/`, 132 tests sur les fonctions pures
de `script.js`) — les deux peuvent tourner sans que l'un dépende des dépendances de l'autre.

## Ce qui n'est PAS encore prêt pour un usage réel au bureau

- **Pas de service Windows** : le serveur doit être lancé manuellement (`npm start`) et reste actif
  tant que le terminal reste ouvert — pas de redémarrage automatique en cas de plantage ou de
  redémarrage du poste. Voir le plan de ce chantier (section « Déploiement ») si ce point doit être
  traité un jour (piste retenue : NSSM pour l'installer comme un vrai service Windows).
- **Pas d'import automatique** des dossiers déjà enregistrés sur la version 100% locale (`main`) :
  il faudrait aujourd'hui recréer les dossiers à la main dans cette nouvelle version.
- **`node:sqlite` est une API expérimentale** de Node.js (avertissement affiché au démarrage,
  sans conséquence connue) — `better-sqlite3` reste une option de repli si elle posait problème
  un jour sur le poste de l'étude.
