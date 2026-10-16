---
name: relire
description: Relecture indépendante des changements en cours de CLAIRE par un second agent, avant publication — obligatoire pour TOUTE modification (étude 16/10), imposée par la garde de publication. À lancer quand le code est prêt et que npm run verifier est vert ; rend une liste de défauts vérifiés, que l'agent principal corrige ou justifie.
---

# Relecture indépendante (CLAIRE)

But : un regard qui n'a pas écrit le code. L'agent qui a fait le changement ne se relit pas lui-même. **Pour toute modification de CLAIRE, sans exception** (étude 16/10 : « les tests et la relecture indépendante automatiques pour toutes les modifications ») : un envoi sur `main` est refusé par la garde de publication (`scripts/garde-publication.js`, crochet de `.claude/settings.json`) tant que le contenu envoyé n'a pas sa marque « relu ».

## Procédure

1. Prépare ce qu'il faut montrer au relecteur : `git diff origin/main...HEAD` (ou `git diff` si rien n'est encore commité), et la demande de l'étude telle qu'elle a été dite, mot pour mot.
2. Lance UN agent de relecture (outil Agent, type `general-purpose`, en lecture seule : il ne modifie aucun fichier) avec cette consigne, en y collant le diff et la demande :

   « Relis ce changement de CLAIRE (étude notariale). Tu n'as pas écrit ce code. Cherche, dans l'ordre : (1) un bug réel : donnée inattendue (dossier abîmé, succession, participation, archivé, sans prêt, sans date), état qui se désynchronise, geste qui écrit au mauvais endroit ; (2) une règle de CLAUDE.md enfreinte (voir la liste ci-dessous) ; (3) un cas que les tests ne couvrent pas ; (4) ce qui a changé sans que la demande l'ait voulu. Pour chaque défaut : fichier:ligne, ce qui casse, un cas concret qui le montre. Vérifie chaque défaut en relisant le code avant de le citer. Pas de remarque de style. Si rien n'est cassé, dis-le. »

3. Règles à faire vérifier (extraits de CLAUDE.md) :
   - aucun email au client ne part sans clic sur « Envoyer » ; aucun écrit sur le NAS hors classeur des scans et pièces jointes ;
   - secrets jamais renvoyés par une route, jamais journalisés ;
   - rien d'une fiche (nom, adresse, montant) vers une IA en ligne sans masquage par le serveur ; tout ajout au rapport technique passe par `anonymiserTexte` ;
   - aucun appel `*Sync` dans un chemin de requête serveur ; route `async` rattrapée par `routeAsync` ;
   - un fichier servi est déclaré dans `ASSETS_STATIQUES` et dans les assets du `.exe` (les fichiers `client/` le sont par le manifeste) ;
   - un nouveau chemin qui coche une échéance passe par `cocherEcheance` / `devaliderEcheance` ; tout bilan des fonds par `bilanFondsDossier` ; tout nom de dossier affiché par `libelleDossierAffiche` ;
   - gestionnaire en ligne sur un composant Web Awesome : `window.render()`, jamais `render()` ;
   - échelle de style (tailles, arrondis, ombres, espacements, aucune couleur `#…` hors jetons), boutons `wa-button`.
4. Relis toi-même chaque défaut rapporté : un défaut non reproduit n'est pas corrigé « au cas où ». Corrige les défauts confirmés, relance `npm run verifier`, puis **`npm run relu`** (marque « relu » de ce contenu ; une modification ensuite l'efface : relire ce qui a changé et remarquer), et dis dans le compte rendu à l'étude ce que la relecture a trouvé (même si c'est « rien »).

## Ce que cette relecture ne remplace pas

Elle ne remplace ni les tests au bureau (NAS, Exchange, Authentic, 3CX, vrai Windows), ni l'avis de l'étude. Le dire dans le compte rendu.
