# CLAIRE

CLAIRE est l'outil de l'étude pour gérer les dossiers notariés, en particulier les compromis de vente : lecture des actes (OCR), analyse juridique, suivi des échéances et constitution des dossiers.

> Dépôt privé. Il ne contient aucune donnée client : les actes réels ne sont jamais versionnés.

## Ce que fait CLAIRE

- Extraction du texte des actes et des compromis (OCR) et détection des noms, dates et conditions.
- Analyse juridique et suivi des échéances, avec rappels dans Teams.
- Constitution de dossier, appel de fonds et questionnaire de satisfaction.
- « Demander à CLAIRE » : assistant s'appuyant sur les sources juridiques officielles.
- Extensions navigateur (Chrome et Firefox) pour remplir les portails à partir de la fiche dossier.

## Organisation du dépôt

| Dossier | Contenu |
|---|---|
| `client/`, `commun/`, `index.html` | Application (interface et logique partagée) |
| `server/` | Serveur intranet de l'étude (voir `server/README.md`) |
| `extension-chrome/`, `extension-firefox/` | Extensions navigateur |
| `page-sondage/` | Page de sondage |
| `tests/`, `scripts/` | Tests automatiques et outils |
| `docs/` | Documentation et historique |
| `CLAUDE.md` | Règles et décisions de l'étude |

## Installation au bureau

Le serveur est livré sous forme d'un exécutable Windows, `CLAIRE-serveur.exe`, publié automatiquement dans les **Releases** du dépôt à chaque mise à jour validée.

1. Télécharger la dernière release.
2. Lancer l'exécutable (Windows peut afficher un avertissement SmartScreen, l'exécutable n'étant pas signé).
3. Suivre `server/README.md` pour la configuration.

## Qualité et sécurité

- Chaque modification est contrôlée automatiquement : règles de code, types, tests client et serveur, test de fumée dans un navigateur.
- Un exécutable n'est publié que si tous les contrôles passent.
- La branche `main` est protégée : pas de suppression, pas d'envoi forcé.
- Les alertes de sécurité sur les dépendances (Dependabot) sont activées.
- Les données clients, bases, sauvegardes et fichiers `.env` sont exclus du dépôt.

## Contribuer

1. Travailler sur une branche, jamais directement sur `main`.
2. Vérifier que « Vérifier CLAIRE » est au vert.
3. Fusionner dans `main` ; l'exécutable est alors reconstruit et publié.

## Contact

Bastien Anglument, notaire.
