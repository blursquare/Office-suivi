---
name: publier
description: Procédure complète avant d'envoyer un changement de CLAIRE sur main (donc au bureau en dix minutes) : vérification, relecture indépendante, scénarios de dossiers, version et historique, envoi, contrôle de la construction. À suivre à chaque publication demandée par l'étude.
---

# Publier un changement de CLAIRE

`main` = production : un push construit un `.exe` installé seul sur le serveur du bureau dans les dix minutes. **Jamais depuis la session programmée « relecture des rapports techniques »** (voir CLAUDE.md : branche + demande de fusion, c'est l'étude qui fusionne).

**Jamais entre 19 h et 8 h ni le samedi et le dimanche, heure de Paris** (étude 18/10 et 24/10 : l'étude n'est pas au bureau pour essayer — nouveauté ni correction) : la garde refuse l'envoi sur `main`. Le soir ou le week-end, pousser la branche et publier à partir de 8 h un jour de semaine (`node scripts/prochaine-version.js` donne l'heure de Paris).

## 1. Cadrer

- Relis la demande de l'étude mot pour mot. Si elle admet plusieurs lectures et qu'elle écrit dans un agenda, une boîte ou une base partagés : pose la question avant (`AskUserQuestion`).
- Range le changement : **nouveauté visible** (geste, écran, information, règle métier → MINEUR + 1) ou **correction / ajustement / présentation** (CORRECTIF + 1).

## 2. Vérifier

1. `npm run verifier` (lint, types, les deux suites de tests, test de fumée dans Chromium) : 0 échec, 0 avertissement.
2. (`npm run scenarios` n'est plus à lancer : ses fichiers sont déjà dans `npm test`, donc dans `npm run verifier` — doublon retiré le 22/10.)
3. Un changement **visible** : le regarder dans Chromium (Playwright, bureau et largeur téléphone si l'écran s'y prête), une capture, un seul regard puis les retouches. Un changement qui touche un geste : le jouer pour de vrai (le cliquer, vérifier son effet), pas seulement le tester en pur.
4. Un nouveau geste impossible à éprouver ici (Exchange, Windows, 3CX, Ollama, NAS, IA en ligne) : ajouter son point à `VERIFICATIONS_TERRAIN` et son appel `noterVerification`.

## 3. Relecture indépendante

Lance la procédure de `/relire` (second agent, lecture seule). Corrige les défauts confirmés, relance `npm run verifier`, puis `npm run relu`. **Toujours, pour toute modification, même une ligne de libellé** (étude 16/10) : la garde de publication refuse l'envoi sur `main` sans les marques « verifie » (posée par `npm run verifier`) et « relu » du contenu exact envoyé.

## 3 bis. Audit de la version (étude 13/10 : « voici la marche à suivre à chaque nouvelle version de CLAIRE »)

**Seulement pour une nouveauté (MINEUR + 1)** — étude 22/10, « les deux » : une correction (CORRECTIF + 1) n'a que la relecture indépendante, l'audit lisant le même diff. À chaque nouveauté, après la relecture indépendante et avant l'envoi : un **second agent (lecture seule)** audite le code de la
version — tout ce qui a changé depuis la dernière version sur `main` (`git diff origin/main...HEAD`), fichiers touchés lus en entier —
avec le cadre de l'étude, mot pour mot :

> Rôle : Tu es un architecte logiciel senior et un expert en cybersécurité et en qualité de code.
> Contexte :
> • Langage / Framework : JavaScript — serveur Node.js 22 (Express 4, `node:sqlite`, exécutable Node SEA pour Windows), poste en
>   JavaScript sans framework (scripts classiques `client/`, code commun `commun/`), composants Web Awesome ; intranet de l'étude,
>   accès sans mot de passe par défaut (le réseau du bureau protège), IA en ligne (Claude, Mistral) avec données masquées.
> • Objectif du code : CLAIRE, registre des échéances et suivi des dossiers de vente de l'étude notariale (pièces sur le NAS, agenda
>   Exchange, emails, Authentic, 3CX, assistant « Demander à CLAIRE »).
> Mission : Fais un audit approfondi du code fourni ci-dessous en te basant sur les axes suivants :
> 1. Sécurité : Failles (injection SQL, XSS, CSRF, fuite de secrets/clés API, gestion des authentifications et autorisations).
> 2. Qualité et architecture : Respect des principes SOLID, DRY, lisibilité, gestion des erreurs et des exceptions.
> 3. Performance : Goulots d'étranglement potentiels, requêtes inefficaces, fuites de mémoire.
> 4. Conformité & Bonnes pratiques : Typage, validation des données d'entrée.
> Format de sortie attendu :
> • Verdict global : Niveau de préparation (prêt pour la production, correct avec réserves, ou critique).
> • Tableau priorisé des problèmes : Classé par criticité (Haut / Moyen / Bas) avec le fichier ou la ligne concernée.
> • Explication technique : Pourquoi le problème pose un risque.
> • Plan de remédiation : Le code corrigé et optimisé pour chaque point critique.

Ajouter à la consigne de l'agent les règles propres à CLAIRE qu'il doit aussi vérifier : contraintes de CLAUDE.md (rien de nominatif
vers une IA en ligne sans masquage, secrets jamais renvoyés ni journalisés, accès disque asynchrone et confiné à `nasRacine`, aucun email
au client sans clic, données réelles jamais dans le dépôt), `escapeHtml`/`escapeAttr`/`escapeOnclickArg` sur tout texte rendu, `routeAsync`
sur toute route asynchrone. Le rapport est enregistré dans `docs/audits/AAAA-MM-JJ-<version>.md` (jamais de donnée client). **Tout point
« Haut » est corrigé avant l'envoi** (puis `npm run verifier`) ; un « Moyen » est corrigé ou, s'il ne l'est pas, dit à l'étude avec sa
raison ; les « Bas » sont listés. Le verdict et les points restants vont dans le compte rendu à l'étude.

## 4. Version et documents

- `node scripts/prochaine-version.js nouveaute|correction` (jamais `date` seul) ; mettre à jour `VERSION_APP` **et** ajouter l'entrée en tête de `HISTORIQUE_VERSIONS` (`client/00-version.js`).
- Entrée à la fin de `docs/historique.md` (la demande de l'étude entre guillemets, ce qui a été fait, ce qui n'a pas pu être vérifié).
- `CLAUDE.md` seulement si une règle durable, l'architecture ou « Ce qui reste ouvert » change.
- Un nouveau fichier du poste : `client/NN-sujet.js` + ligne dans `client/manifest.json` + `<script>` dans `index.html`.

## 5. Envoyer et contrôler

1. `npm run verifier` **en dernier**, après la toute dernière modification, et `npm run relu` une fois la relecture faite (le commit qui suit ne change pas le contenu : les marques restent valables ; toute retouche les efface).
2. **Pousser d'abord la branche et attendre son contrôle « verifier » vert, PUIS `main`** (jamais les deux en une commande : `build-exe` fait confiance à ce contrôle). Commit (message clair, attribution demandée), `git fetch origin main`, fusion si besoin, `git push origin HEAD:main` ; fusionner aussi `main` dans la branche de la session et la pousser.
3. Regarder sur GitHub que la construction du `.exe` a démarré **et** qu'elle est verte (environ 4 minutes). Rouge : corriger tout de suite, jamais un push vide pour la relancer.
4. Compte rendu à l'étude, en français simple : ce qui change, ce qui a été vérifié (tests, relecture, audit et son verdict, scénarios, captures), **ce qui ne l'a pas été** (NAS, Exchange, Authentic, 3CX, vrai poste Windows, IA en ligne), et la version affichée dans « À propos » pour confirmer le déploiement.
