---
name: publier
description: Procédure complète avant d'envoyer un changement de CLAIRE sur main (donc au bureau en dix minutes) : vérification, relecture indépendante, scénarios de dossiers, version et historique, envoi, contrôle de la construction. À suivre à chaque publication demandée par l'étude.
---

# Publier un changement de CLAIRE

`main` = production : un push construit un `.exe` installé seul sur le serveur du bureau dans les dix minutes. **Jamais depuis la session programmée « relecture des rapports techniques »** (voir CLAUDE.md : branche + demande de fusion, c'est l'étude qui fusionne).

## 1. Cadrer

- Relis la demande de l'étude mot pour mot. Si elle admet plusieurs lectures et qu'elle écrit dans un agenda, une boîte ou une base partagés : pose la question avant (`AskUserQuestion`).
- Range le changement : **nouveauté visible** (geste, écran, information, règle métier → MINEUR + 1) ou **correction / ajustement / présentation** (CORRECTIF + 1).

## 2. Vérifier

1. `npm run verifier` (lint, types, les deux suites de tests, test de fumée dans Chromium) : 0 échec, 0 avertissement.
2. `npm run scenarios` : rejoue les parcours types d'un dossier (planning, statut, cocher et décocher, préemption, successions, archivés, fiche en colonnes, assistant). Tout doit passer.
3. Un changement **visible** : le regarder dans Chromium (Playwright, bureau et largeur téléphone si l'écran s'y prête), une capture, un seul regard puis les retouches. Un changement qui touche un geste : le jouer pour de vrai (le cliquer, vérifier son effet), pas seulement le tester en pur.
4. Un nouveau geste impossible à éprouver ici (Exchange, Windows, 3CX, Ollama, NAS, IA en ligne) : ajouter son point à `VERIFICATIONS_TERRAIN` et son appel `noterVerification`.

## 3. Relecture indépendante

Lance la procédure de `/relire` (second agent, lecture seule). Corrige les défauts confirmés, relance `npm run verifier`. Un changement d'une ligne de libellé peut s'en passer ; tout ce qui touche un calcul, une règle métier, un envoi d'email, l'agenda, le NAS, Authentic, les secrets ou le serveur ne s'en passe jamais.

## 4. Version et documents

- `node scripts/prochaine-version.js nouveaute|correction` (jamais `date` seul) ; mettre à jour `VERSION_APP` **et** ajouter l'entrée en tête de `HISTORIQUE_VERSIONS` (`client/00-version.js`).
- Entrée à la fin de `docs/historique.md` (la demande de l'étude entre guillemets, ce qui a été fait, ce qui n'a pas pu être vérifié).
- `CLAUDE.md` seulement si une règle durable, l'architecture ou « Ce qui reste ouvert » change.
- Un nouveau fichier du poste : `client/NN-sujet.js` + ligne dans `client/manifest.json` + `<script>` dans `index.html`.

## 5. Envoyer et contrôler

1. `npm run verifier` **en dernier**, après la toute dernière modification.
2. Commit (message clair, attribution demandée), `git fetch origin main`, fusion si besoin, `git push origin HEAD:main` ; fusionner aussi `main` dans la branche de la session et la pousser.
3. Regarder sur GitHub que la construction du `.exe` a démarré **et** qu'elle est verte (environ 4 minutes). Rouge : corriger tout de suite, jamais un push vide pour la relancer.
4. Compte rendu à l'étude, en français simple : ce qui change, ce qui a été vérifié (tests, relecture, scénarios, captures), **ce qui ne l'a pas été** (NAS, Exchange, Authentic, 3CX, vrai poste Windows, IA en ligne), et la version affichée dans « À propos » pour confirmer le déploiement.
