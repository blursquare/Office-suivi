# Plan « CLAIRE vrai agent » (document de l'étude du 29/10/2026)

Source : `CLAIRE-consigne-agent.md` (22 sections). État des lieux du 29/10 et décisions de l'étude.

## Déjà fait avant ce plan
Agent d'abord (0), boucle d'agent 60 tours (4), prompt riche (2), pseudonymisation serveur (5), Authentic par navigateur sans Playwright (6, 12), outils de CLAIRE ouverts et remplis par l'agent (9, 11), discussions façon Slack (17), cartes et bouton « Ouvrir » discussion → outil (21 sens aller).

## Étape 1 — Fondations (livrée en 0.400.0)
Carte des sources + règle d'autonomie + raisonnement « clerc expérimenté » dans le prompt (0 bis, 13, 16) ; outil `memoriser` (carnet CLAIRE.md, carte « Autoriser », texte sans nom de client) ; Haiku retiré (1).
Reste de l'étape : une seule conversation avec fils automatiques, bouton « Nouvelle conversation » retiré, proposition de poster dans le canal du dossier (17.1, 17.3).

## Décisions de l'étude (29/10)
- **Envoi de mail** : l'agent peut envoyer lui-même après un « oui » dans le chat — outil `envoyer_mail`, carte « Autoriser » STRICTE à chaque fois ; modifie la règle n° 4 pour ce geste (à noter dans CLAUDE.md à la livraison).
- **CLAIRE dans la discussion d'un dossier** : répond d'elle-même si l'utilisateur est le responsable ou si personne ne répond ; sinon seulement si on l'appelle (change la règle du 26/10).
- **Reconnaissance des noms (22)** : modèle local en Node embarqué dans l'exe (GLiNER ONNX via onnxruntime-node), licence à vérifier, comparé sur des actes fictifs ; liste blanche élargie et modifiable dans Réglages.
- **Ordre** : prompt et mémoire d'abord, puis discussion.

## Points à arbitrer plus tard
22 « aucune exception » (montants, dates, adresse du bien en clair depuis le 26/10 ; pilote Authentic en clair) ; 20 lecture visuelle des scans (envoie les vrais noms : OCR local puis masquage, ou masquage sur l'image) ; accord de sous-traitance Anthropic non attesté.

## Étapes suivantes
2 Lecture : recherche libre dans les mails Exchange (`chercher_mails`), index plein texte du contenu des documents du NAS (OCR une fois, type, résumé, expéditeur, date). 3 Action : `ajouter_courrier`, `modifier_reglage`, `proposer_ajout`, `envoyer_mail`, lecture des pièces de charges par l'IA (prorata calculé par le code), orchestration offre de prêt → quotités → appel de fonds. 4 Proactivité : déclencheurs mail / pièce, « À classer », contrôles de cohérence par rendez-vous. 5 Formaliste : formalités, relances automatiques, dates butoirs.
