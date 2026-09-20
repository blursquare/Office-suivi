# Spec — Banc d'essai de l'extraction automatique (CLAIRE, Outil 1)

Document de cadrage pour un chantier délégué à un data scientist. Objectif : mesurer
objectivement la qualité de l'extraction par regex (nom, adresse, prix, dates, notaires, type
d'acte) et fournir, à intervalles réguliers, une liste priorisée de champs à corriger — plutôt que
la méthode actuelle (un script Node ad hoc écrit à chaque signalement ponctuel de l'étude).

Ce n'est **pas** un chantier de machine learning : aucun modèle n'est entraîné ici. Il s'agit de
construire un **corpus de test annoté** et un **harnais de mesure**, sur le modèle classique
d'une évaluation de système d'extraction d'information (à la manière d'un jeu de test CoNLL) — un
travail de méthodologie et d'outillage, exécutable en Node.js pur, sans dépendance nouvelle.

## 1. Ce qui existe déjà (point d'entrée unique)

Toute l'extraction passe par une seule fonction pure, dans `script.js` :

```js
construireExtractionRegex(texte, dateCompromis, detectedDatesFournies, nomFichier)
```

- `texte` : le texte intégral de l'avant-contrat (string).
- `dateCompromis` : la date de signature au format `AAAA-MM-JJ`, ou `null` si elle n'est pas
  connue à l'avance (dans le doute, la laisser à `null` — la fonction la déduit elle-même du
  texte dans la plupart des cas réels).
- `detectedDatesFournies` : laisser `undefined` — la fonction recalcule elle-même les dates
  candidates si cet argument est absent.
- `nomFichier` : optionnel, laisser `null` sauf si le corpus veut aussi tester la détection de
  forme d'acte par le nom du fichier (« AAE » dans un nom de PDF, voir plus bas).

`script.js` n'est **pas** un module Node — c'est un script de navigateur classique. Le projet
charge donc `script.js` dans un `vm.Context` minimal via un harnais déjà existant :

```js
const { chargerApplication } = require('./tests/helpers/load-app.js');
const app = chargerApplication();
const extraction = app.construireExtractionRegex(texteDeLActe, null);
```

Un exemple réel et complet d'appel + assertions se trouve dans `tests/extraction.test.js` (à
lire en premier, c'est le patron à reproduire).

## 2. Règle absolue : jamais de vraie donnée client dans le corpus

Le corpus de test est un artefact qui vivra dans le dépôt Git, potentiellement partagé et relu
pendant des mois. **Aucun texte d'acte réel, aucune donnée client réelle, n'y entre — ni en clair
ni « pseudonymisé ».**

Chaque cas de test doit être un **texte synthétique**, réécrit en conservant fidèlement la
**structure et les tournures** d'un acte réel (rédaction, ponctuation, enchaînement des clauses)
mais avec des noms, adresses, montants et dates **entièrement inventés**. C'est exactement la
méthode déjà suivie pour tous les tests existants du dépôt (voir `tests/extraction.test.js`,
`tests/notaires.test.js`, etc. — noms « DUPONT », « MARTIN », communes fictives ou anonymes,
montants ronds). Si un acte réel de l'étude sert de point de départ pour capturer un cas
compliqué, il doit être **entièrement réécrit** avant d'entrer dans le corpus, jamais copié-collé
même partiellement.

## 3. Format du corpus

Un fichier JSON par cas de test, dans `tests/fixtures/banc-essai/` (nouveau dossier à créer).
Nom de fichier libre mais descriptif (`compromis-deux-vendeurs.json`,
`promesse-delai-60-jours.json`...). Schéma d'un fichier :

```json
{
  "id": "compromis-deux-vendeurs",
  "description": "Compromis à deux vendeurs, adresse avec code postal entre parenthèses",
  "typeActeReel": "COMPROMIS_DE_VENTE",
  "dateCompromis": null,
  "texte": "COMPROMIS DE VENTE\n\nEntre les soussignés :\n...",
  "attendu": {
    "typeActe": "COMPROMIS_DE_VENTE",
    "parties": [
      { "role": "vendeur", "nom": "DUPONT" },
      { "role": "vendeur", "nom": "BOUSSELET" },
      { "role": "acquereur", "nom": "MARTIN" }
    ],
    "adresseBien": {
      "codePostal": "41000",
      "commune": "BLOIS",
      "numero": "3",
      "nomVoie": "des Lilas"
    },
    "cadastre": { "section": "AB", "numero": "125" },
    "prixVente": 200000,
    "emailAcquereur": null,
    "notaires": {
      "instrumentaireNom": "GOSSART",
      "participantNom": "DURAND"
    },
    "dates": {
      "SIGNATURE_AVANT_CONTRAT": "2026-09-15",
      "BUTOIR_PRET": "2026-11-15",
      "REITERATION_ACTE": "2026-12-15",
      "BUTOIR_VENTE_PREALABLE": null
    }
  }
}
```

Règles de remplissage de `attendu` :

- **Un champ dont la valeur correcte est « absent de cet acte »** (ex. pas de vente préalable) se
  note explicitement `null` — ne jamais omettre la clé, l'absence de clé sera traitée comme « pas
  encore renseigné dans le corpus », pas comme « doit être vide ».
- **`parties`** : liste de `{role, nom}` uniquement pour les personnes physiques identifiées par
  leur seul nom de famille (voir § 4 sur la normalisation) ; `role` vaut `"vendeur"` ou
  `"acquereur"` — c'est le rôle FONCTIONNEL déjà normalisé par l'outil (un promettant d'une
  promesse de vente est rangé sous `"vendeur"`), pas le mot exact employé dans l'acte.
- **`adresseBien`** : ne remplir que les sous-champs que le cas de test veut vérifier ; un
  sous-champ absent de `attendu.adresseBien` n'est pas comparé (voir § 5, matching partiel
  autorisé ici uniquement).
- **`notaires.instrumentaireNom` / `.participantNom`** : `null` si un seul notaire intervient
  n'est PAS le bon choix — dans ce cas les deux valent le nom de l'unique notaire (relire le
  commentaire de `determinerNotaires()` dans script.js, § « notaireUnique »).

Prévoir au minimum, pour un premier corpus utile :

- 5 à 10 compromis « standards » à un vendeur/un acquéreur, variant la façon dont l'adresse et le
  prix sont rédigés (les deux formes déjà connues comme piégeuses, voir `tests/adresse.test.js`
  et `tests/dates-metier.test.js`).
- 3 à 5 cas à parties multiples (deux vendeurs, ou un couple).
- 3 à 5 promesses de vente et 1 à 2 promesses d'achat (l'inversion vendeur/acquéreur est le bug le
  plus coûteux historiquement — voir l'historique de `detecterParties` dans CLAUDE.md).
- 3 à 5 cas de délai (« au plus tard dans les 60 jours », « trois mois à compter de... ») plutôt
  que de date calendaire explicite.
- 2 à 3 actes authentiques (promesse synallagmatique, ou nom de fichier contenant « AAE ») pour
  vérifier que les notaires sont bien cherchés en tête d'acte et non en fin.
- 2 à 3 cas volontairement dégradés (donnée absente de l'acte, adresse incomplète) pour vérifier
  que l'outil dit correctement « non trouvé » plutôt que d'inventer une valeur.

## 4. Normalisation avant comparaison

Pour ne pas faire échouer un cas sur un détail sans intérêt (accents, casse, espaces) :

- **Chaînes de caractères** (noms, communes, voies) : comparer après `.toUpperCase()`, accents
  retirés (`normalize('NFD').replace(/[̀-ͯ]/g, '')`), espaces multiples réduits à un
  seul.
- **Dates** : comparaison stricte de la chaîne ISO `AAAA-MM-JJ`.
- **Nombres** (`prixVente`) : égalité stricte après conversion en nombre.
- **`parties`** : comparaison en ENSEMBLE (peu importe l'ordre), sur les couples `(role, nom
  normalisé)` — ne jamais comparer la chaîne `champs.nom.valeur` telle quelle (elle concatène
  plusieurs noms avec des séparateurs de mise en forme, ce n'est pas fait pour être comparé mot à
  mot).

## 5. Ce que veut dire « précision » et « rappel » ici

Ce n'est pas une tâche de classification multi-classe classique — c'est, pour CHAQUE champ,
CHAQUE cas du corpus donnant lieu à l'un de ces quatre verdicts :

| Attendu \ Obtenu | Valeur produite (non nulle) | Rien produit (`null`/`NOT_FOUND`) |
|---|---|---|
| **Valeur attendue non nulle** | Vrai positif si ça correspond (§4), sinon **Faux négatif** (erreur silencieuse — la pire catégorie) | Faux négatif (l'outil dit honnêtement qu'il ne sait pas) |
| **Valeur attendue = `null`** | **Faux positif** (l'outil invente une valeur) | Vrai négatif |

Distinguer explicitement dans le rapport les deux sous-cas de faux négatif ci-dessus (« valeur
fausse produite » vs « rien produit ») — un champ qui reste vide est marqué "à vérifier" par
l'outil et un humain le corrige ; un champ qui contient discrètement une **mauvaise** valeur est
le cas dangereux qu'on cherche en priorité à éliminer.

Pour chaque champ, calculer :
- **rappel** = VP / (VP + FN) — parmi les cas où une valeur existait réellement, combien ont été
  trouvés (juste ou faux, peu importe ici) ;
- **précision** = VP / (VP + FP + FN-valeur-fausse) — parmi tout ce que l'outil a produit comme
  valeur non nulle, combien sont réellement justes ;
- **taux de faux positifs dangereux** = FP / (FP + VN) — à surveiller en particulier sur
  `prixVente` et les dates, où une fausse valeur non signalée peut passer inaperçue jusqu'à la
  signature.

Champs à mesurer séparément (une ligne de rapport par champ, pas un score global agrégé qui
masquerait un champ en particulier) :

`typeActe`, `parties` (VP/FP/FN par personne, pas par acte), `adresseBien.codePostal`,
`adresseBien.commune`, `adresseBien.nomVoie`, `cadastre`, `prixVente`, `emailAcquereur`,
`notaires.instrumentaireNom`, `notaires.participantNom`,
`dates.SIGNATURE_AVANT_CONTRAT`, `dates.BUTOIR_PRET`, `dates.REITERATION_ACTE`,
`dates.BUTOIR_VENTE_PREALABLE`.

## 6. Script d'évaluation attendu

Un script Node natif (`node:test` comme le reste du dépôt — pas de framework externe type Jest,
pour rester cohérent avec `package.json`, volontairement sans dépendance), par exemple
`tests/banc-essai/executer.js`, qui :

1. Charge tous les fichiers `tests/fixtures/banc-essai/*.json`.
2. Pour chacun, appelle `construireExtractionRegex(cas.texte, cas.dateCompromis)`.
3. Compare chaque champ de `attendu` à la valeur réellement produite (§ 3-4-5).
4. Écrit un rapport dans deux formats :
   - `tests/banc-essai/rapport.json` (données brutes, une entrée par `(cas, champ)` avec le
     verdict VP/FN/FP/VN, la valeur attendue et la valeur obtenue — c'est ce qui permet de
     retrouver précisément quel cas a échoué) ;
   - un résumé lisible sur la sortie standard (tableau texte : champ, rappel, précision, nombre de
     faux positifs).

Ce script doit pouvoir être lancé avec `node tests/banc-essai/executer.js` (ou intégré à
`npm test` si le reste de l'équipe le préfère — à en discuter, pas une contrainte figée).

## 7. Ce qui alimente mon travail ensuite

Le livrable qui m'intéresse directement, après chaque exécution : une **liste triée** des champs
dont le rappel ou la précision est le plus bas, avec pour chacun les `id` des cas en échec et
l'écart observé (valeur attendue vs obtenue) — pas juste un pourcentage global. C'est ce qui me
permet de retourner directement à la regex ou au motif en cause dans `script.js`, comme documenté
dans l'historique de CLAUDE.md à chaque correctif déjà fait sur ce fichier.

Répartition du travail proposée :
- **Le data scientist** : construit et enrichit le corpus, maintient le harnais de mesure, publie
  le rapport après chaque changement de version de `script.js` (ou à intervalle régulier), et
  propose la liste priorisée ci-dessus.
- **Moi** : je corrige les regex/fonctions d'extraction visées, ajoute les tests de non-régression
  correspondants dans `tests/` (le corpus du banc d'essai est un complément, pas un remplacement
  des tests unitaires existants par fonction), et documente chaque correctif dans CLAUDE.md comme
  pour tout le reste du projet.

## 8. Contraintes techniques à respecter

- **Aucune nouvelle dépendance npm** sans en discuter d'abord — le dépôt racine reste
  volontairement "zéro dépendance" (voir CLAUDE.md, "Comment tester").
- **Node.js natif** (`node:test`, `node:assert/strict`, `fs`, pas de TypeScript ni de bundler).
- Le corpus (`tests/fixtures/banc-essai/`) et le script d'évaluation font partie du dépôt Git,
  commités normalement — ce n'est pas un outil à part tournant ailleurs.
- Toujours passer par `chargerApplication()` (`tests/helpers/load-app.js`) pour charger
  `script.js` — jamais de copier-coller de fonctions extraites du fichier dans un module séparé,
  ça décrocherait immédiatement du code réellement utilisé par l'outil.
