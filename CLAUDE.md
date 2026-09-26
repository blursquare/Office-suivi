# Registre des échéances — Compromis de vente

**Nom affiché dans l'interface : CLAIRE.** Le nom de fichier/dépôt et ce document restent
"Registre des échéances" (identité historique du projet, inchangée) mais l'UI (titre de la page,
`<title>`, manifest PWA, sidebar) porte désormais la marque "CLAIRE" — voir la section refonte
visuelle ci-dessous pour le contexte de ce choix.

Outil interne de l'étude notariale pour suivre les échéances d'un compromis de vente (obtention
du prêt, signature de l'acte, vente préalable), extraire automatiquement les documents et
engagements du vendeur, et générer des rappels.

Ce fichier donne à Claude Code tout le contexte nécessaire pour reprendre le développement sans
avoir à redécouvrir l'historique des décisions. Lis-le entièrement avant toute modification.

## Branches du dépôt (réorganisées le 18/09/2026, à la demande de l'étude)

Le dépôt ne compte plus que **deux branches**, toutes les autres ayant été supprimées :

- **`main`** — LA branche de travail. Elle porte désormais la **version serveur intranet**
  (Express + `node:sqlite` + Ollama + lecture du NAS, voir la section « Mode serveur intranet »
  plus bas) : c'est ce qui tourne réellement au bureau de l'étude via `CLAIRE-serveur.exe`.
  Tout développement se fait ici.
- **`sauvegarde`** — copie de `main`, destinée aux essais de l'étude. Elle ne reçoit aucun
  développement : la resynchroniser depuis `main` quand l'étude le demande.

**Piège de lecture pour tout l'historique ci-dessous** : avant cette réorganisation, le projet
vivait sur deux branches parallèles — `main` portait la version 100 % locale (sans serveur,
persistance `localStorage`) et `claude/serveur-intranet` la version serveur. Toutes les mentions
de ces deux noms dans les entrées d'historique qui suivent se lisent avec ce sens **historique** :
« sur `main` » y signifie « dans la version 100 % locale », et « sur `claude/serveur-intranet` »
signifie « dans la version serveur, c'est-à-dire l'actuelle `main` ». Les contraintes
fondamentales n°1 à 7 ci-dessous décrivent de même le mode 100 % local ; celles qui sont devenues
sans objet en mode serveur le disent explicitement (voir la n°3).

**La version 100 % locale n'est pas perdue** : son dernier état est le commit `c90e9d0`, conservé
comme ancêtre de `main` par la fusion de réorganisation. La récupérer :
`git checkout c90e9d0` (ou `git show c90e9d0:script.js` pour un seul fichier). Elle n'est plus
maintenue — aucun correctif postérieur au 14/09/2026 ne s'y trouve.

**Workflows GitHub** : `.github/workflows/build-exe.yml` (reconstruit `CLAIRE-serveur.exe` et le
publie en release) se déclenche désormais sur un push vers `main`. L'ancien workflow d'aperçu
GitHub Pages (`pages.yml`) a été **supprimé** : publier la version serveur sur Pages n'a aucun
sens (sans backend, seul l'écran de connexion s'affiche et aucune connexion ne peut aboutir), et
c'était la seule cause du check `deploy` rouge en permanence sur les PR.

## Structure du projet

```
index.html                 Structure de la page (le fichier à ouvrir dans le navigateur)
style.css                  Toute la feuille de style (thèmes clair/sombre inclus)
script.js                  Toute la logique applicative
manifest.json              Manifest PWA (installation en application)
sw.js                      Service worker minimal (requis pour l'installabilité, ne fait rien d'autre)
icone.svg                  Icône de l'application
Ouvrir-en-fenetre.bat      Optionnel (Windows) : ouvre index.html dans une fenêtre Chrome sans
                           onglets ni barre d'adresse — voir point 7 des contraintes ci-dessous.
```

**Important** : ces 6 fichiers (les 7 avec le lanceur `.bat`, optionnel) doivent toujours être
déposés ensemble, au même endroit (poste de travail ou lecteur réseau partagé de l'étude). Aucun
serveur n'est nécessaire : l'outil s'ouvre en double-cliquant sur `index.html`.

## Contraintes fondamentales à ne jamais oublier

1. **Aucun serveur, aucun backend.** Tout tourne dans le navigateur. Pas de `fetch()` vers une API
   à soi, pas de `Node.js` côté exécution (seulement côté outillage/build si un jour on en ajoute
   un).
2. **`window.storage` n'existe QUE dans l'aperçu Claude.ai.** En dehors (fichier ouvert directement
   dans Chrome, ce qui est l'usage réel), cette API n'existe pas. Le code doit TOUJOURS se rabattre
   sur `localStorage` (voir `sauvegarderLocalUniquement()` / `charger()` dans `script.js`). C'est
   un bug qui s'est déjà produit une fois (perte totale des données à chaque fermeture) : ne pas le
   réintroduire.
3. **`window.showDirectoryPicker()` et `showSaveFilePicker()` (File System Access API) ne
   fonctionnent que sur Chrome/Edge**, et **jamais dans un iframe cross-origin** (donc jamais dans
   l'aperçu d'artefact Claude.ai — seulement une fois le fichier ouvert directement). Toujours
   prévoir un message d'erreur clair (`afficherToast`, jamais `afficherErreurFormulaire` pour des
   actions hors du formulaire de création — voir point 5) plutôt qu'un plantage silencieux.
   **Confirmé sur un poste réel** : ces deux fonctions échouent aussi silencieusement (l'appel
   `showDirectoryPicker()` se comporte comme annulé — `AbortError`, volontairement ignoré sans
   message, voir le `catch` dans `lierDossierLocal()`) **quand la page elle-même est ouverte
   depuis un chemin réseau brut** (`file://serveur/partage/...`, ou `\\serveur\partage\...`) —
   peu importe le dossier ciblé par le sélecteur, local ou réseau. **Ça fonctionne en revanche
   normalement si le même partage est ouvert via une lettre de lecteur réseau mappée**
   (`Z:\...\index.html` plutôt que `\\serveur\partage\...\index.html`) : Chrome traite alors la
   page comme si elle venait d'un disque local. **Conséquence pour le déploiement de l'étude** :
   "Lier un dossier local" et "Registre partagé (réseau)" (même famille d'API) exigent que le
   dossier de l'app soit ouvert via un lecteur réseau mappé, pas un chemin `\\...` direct — à
   rappeler si l'étude signale à nouveau l'un de ces deux boutons "qui ne fait rien".
   **Sur la branche `claude/serveur-intranet`, ce point est devenu sans objet** : l'API File System
   Access y a été entièrement abandonnée au profit d'une lecture du NAS PAR LE SERVEUR (voir la
   section « Mode serveur intranet », lot 6) — non pas pour contourner les pièges ci-dessus, mais
   parce que cette API n'existe pas du tout sur une adresse IP, donc pour aucun des postes du
   bureau sauf celui qui héberge le serveur. Les pièges ci-dessus restent valables pour `main`.

4. **Aucune page web ne peut envoyer un email automatiquement.** Les "relances automatiques"
   ouvrent un brouillon `mailto:` déjà rempli ; l'envoi final reste un clic manuel de
   l'utilisateur. Ne jamais promettre plus que ça sans ajouter un vrai backend (hors scope actuel,
   décision explicitement prise de rester sans hébergement).
5. **`afficherErreurFormulaire()` écrit dans un champ situé à l'intérieur du panneau repliable
   "Nouveau dossier".** Si ce panneau est fermé (cas normal quand on agit depuis une carte de
   dossier déjà enregistré), le message est invisible. Utiliser `afficherToast(message, 'OK',
   null)` pour tout message qui doit être visible indépendamment de l'état du panneau. Ce bug s'est
   déjà produit (bouton "Lier un dossier local" qui semblait ne rien faire).
6. **Word / LibreOffice (génération de la fiche `.doc` imprimable) ne comprennent NI CSS Grid NI
   Flexbox.** Toute mise en page en colonnes dans `imprimerFiche()` doit passer par de vraies
   balises `<table>`. Les couleurs de fond sur une cellule doivent être en style **inline**
   (`style="background:...`), pas seulement via une classe CSS externe — Word les ignore sinon.
7. **Le bouton "📲 Installer l'application" (`installerApplication()`, événement
   `beforeinstallprompt`) n'apparaît PAS en `file://`** (fichier ouvert en double-clic, l'usage réel
   de l'étude) — **confirmé** en testant les deux côte à côte : le bouton apparaît sur la version
   hébergée en HTTPS (GitHub Pages) mais jamais sur le fichier local, Chrome n'y autorisant pas
   l'installation PWA. Ce n'est pas un bug à corriger côté code : c'est une restriction de Chrome
   sur les origines non sécurisées. En conséquence, au quotidien en `file://`, l'outil s'utilise
   dans un onglet Chrome normal, jamais en fenêtre d'application indépendante — ne pas promettre
   cette fenêtre indépendante pour l'usage réel sans avoir requalifié cette limite.
   Le menu Chrome "Créer un raccourci..." (qui permettrait aussi une fenêtre sans onglet, sans
   passer par la PWA) s'est également révélé absent du menu ⋮ sur un poste testé — masqué par une
   politique du poste, ou déplacé selon la version de Chrome. `Ouvrir-en-fenetre.bat` (Windows,
   optionnel, voir structure du projet ci-dessus) contourne les deux limitations en lançant
   directement `chrome --profile-directory="RegistreEcheances" --app=file://...`, **confirmé
   fonctionnel, y compris quand Chrome est déjà ouvert par ailleurs**.
   Historique des essais (utile si ça cesse de fonctionner un jour) :
   - `--app` seul : fonctionne, mais seulement si Chrome est entièrement fermé au préalable —
     sinon la demande est récupérée par la fenêtre déjà ouverte, qui affiche l'outil dans un
     nouvel onglet au lieu d'une fenêtre indépendante (comportement normal de Chrome, pas un
     défaut du `.bat`).
   - `--user-data-dir` vers un profil séparé (dossier de données totalement distinct) :
     **échoue** quand Chrome est déjà ouvert — aucune fenêtre ne s'ouvre du tout, silencieusement.
     Cohérent avec une politique de poste qui restreint ce paramètre précis (même famille de
     restriction que le menu "Créer un raccourci" absent).
   - `--profile-directory="RegistreEcheances"` (profil nommé, **dans** le dossier Chrome existant,
     mécanisme différent de `--user-data-dir`) : **fonctionne**, y compris Chrome déjà ouvert —
     confirmé sur le poste testé. C'est la solution retenue dans `Ouvrir-en-fenetre.bat`.
   - **Piège de syntaxe batch, à ne pas reproduire** : une parenthèse non échappée dans une ligne
     `echo` À L'INTÉRIEUR d'un bloc `if (...)` casse l'analyse du script par `cmd.exe` (erreur
     "... était inattendu à ce point") — y compris une parenthèse dans du texte purement affiché,
     par exemple `echo cliquez sur "Exporter (JSON)"`. Ça a d'abord fait accuser `start` à tort
     (« `start` casse `--profile-directory` ») alors que le vrai bug était ce message de première
     utilisation, qui contenait plusieurs parenthèses dans son texte : le symptôme (fenêtre qui
     clignote, rien ne s'ouvre) était identique avec et sans `start`, la vraie cause commune aux
     deux étant cette erreur de syntaxe. Corrigé en reformulant le texte sans parenthèses
     (`%ProgramFiles(x86)%` reste sans risque : c'est un nom de variable `%...%`, pas du texte
     brut). Avant d'ajouter le moindre message dans ce `.bat`, vérifier qu'aucune parenthèse ne
     s'y trouve si le message est à l'intérieur d'un bloc `if (...)`.
   - Piège de diagnostic rencontré en cours de route : le code de sortie de `chrome.exe` renvoyé
     à la ligne de commande n'indique PAS si une fenêtre s'est ouverte (souvent non-nul même en
     cas de succès, le process de lancement se détachant). Seul un contrôle visuel (une fenêtre
     apparaît-elle à l'écran ?) fait foi — ne pas se fier au code de sortie pour diagnostiquer un
     échec de lancement de Chrome.
   - `start` **est bien nécessaire** devant l'appel à `chrome.exe`/`chrome` : sans lui, la fenêtre
     de commande du `.bat` reste ouverte en arrière-plan tant que l'app est utilisée (`chrome.exe`
     ne rend pas la main tout seul dans cette configuration, contrairement à ce qui avait été
     observé lors d'un diagnostic isolé sans `--profile-directory`). Avec `start ""` devant, la
     fenêtre de commande se referme aussitôt. Voir le point ci-dessus sur les parenthèses :
     c'est bien elles, pas `start`, qui avaient cassé le lancement la première fois.
   - **Ouverture en plein écran automatique : abandonnée, échec sur toutes les méthodes essayées**
     (`--start-maximized`, `--window-position`/`--window-size` surdimensionné, `start /MAX`, avec
     et sans `start` devant l'appel à Chrome) — la fenêtre s'ouvre systématiquement à une taille
     réduite sur le poste testé. Un rapport intermédiaire disant que `--window-size` fonctionnait
     (sans `start`) s'est révélé être une erreur de l'étude, pas une confirmation réelle — ne pas
     se fier à ce rapport s'il ressort d'un historique de conversation. Cohérent avec les autres
     restrictions déjà rencontrées sur ce poste (probable politique bloquant le contrôle
     programmatique de l'état des fenêtres). Ne pas relancer cette piste sans un moyen de
     vérifier réellement le résultat (capture d'écran ou description explicite de ce qui
     s'affiche) plutôt que de déduire un succès de l'absence d'erreur. En l'état,
     `Ouvrir-en-fenetre.bat` n'essaie plus de forcer la taille de la fenêtre ; agrandir
     manuellement (double-clic sur la barre de titre, ou Windows+Flèche du haut) reste la solution.
   **Conséquence à ne pas oublier** : ce profil dédié a sa propre sauvegarde (`localStorage`),
   séparée de celle d'un Chrome classique — les dossiers déjà enregistrés via un onglet Chrome
   normal n'apparaissent pas automatiquement dans cette fenêtre dédiée. Le `.bat` affiche donc un
   message une seule fois (à la création du profil, détectée via
   `if not exist "%LocalAppData%\Google\Chrome\User Data\RegistreEcheances"`) rappelant d'exporter
   (`Exporter (JSON)`) puis réimporter (`Importer (JSON)`) les dossiers existants avant de
   continuer.
   Le `.bat` construit aussi correctement l'URL `file://` pour un chemin réseau UNC
   (`\\serveur\partage\...` → `file://serveur/partage/...`), pas seulement pour un chemin local ou
   un lecteur mappé (`C:\...` → `file:///C:/...`) — l'étude dépose ces fichiers sur un chemin réseau
   direct, pas systématiquement une lettre de lecteur mappée.

## Historique des décisions importantes

- **Nom et dates corrigeables après enregistrement, via crayon + validation explicite** : le nom du
  dossier était un champ texte modifiable au clic, sans confirmation — remplacé par un affichage
  simple + bouton crayon (`activerEditionNom()`) qui bascule vers un champ + bouton "✓" à valider
  (`validerEditionNom()` → `renommerDossier()`, inchangée). Même mécanisme ajouté pour corriger une
  date après coup (`activerEditionDate()` / `validerEditionDate()` dans `renderTab()`) — utile pour
  une erreur repérée après l'enregistrement, jusque-là seule la catégorie (prêt/acte/vente) était
  modifiable, pas la date elle-même. Une date ainsi corrigée passe automatiquement en confiance
  "manuel" (même badge que pour une saisie initiale à la main). S'applique aussi aux échéances
  personnalisées (`d.autres`), identifiées par leur index faute d'identifiant stable sur ces entrées.
  **Effet de bord corrigé au passage** : les cartes/lignes de l'onglet "Suivi" étant maintenant des
  résumés qui se déplient (voir plus bas), n'importe quelle action déclenchant `render()`
  (archiver, changer de catégorie, et donc aussi ces nouvelles corrections) reconstruisait toute la
  liste et refermait silencieusement la carte qu'on était en train de modifier. `dossiersDeplies`
  (un `Set` d'identifiants) mémorise maintenant quels dossiers sont dépliés, et `render()` les
  rouvre à chaque reconstruction — sans ce suivi, les nouvelles fonctions d'édition étaient
  quasiment inutilisables (la carte se refermait dès la validation).
- **Suivi des dossiers en deux onglets ("Nouveau dossier" / "Suivi des dossiers")** : demandé pour
  un volume réel d'une soixantaine de dossiers actifs en parallèle, où la liste de cartes
  complètes défilait trop longtemps pour retrouver un dossier précis. Deux pistes ont été
  développées en parallèle sur des branches séparées et comparées via des aperçus GitHub Pages
  (`claude/vue-dossiers-meme-page` vs `claude/vue-dossiers-onglets`) avant de choisir : la version
  onglets a été retenue car la vue tableau a besoin de la pleine largeur de l'écran pour rester
  utile, ce que la colonne étroite `.wrap` (680px, partagée avec le formulaire) ne permettait pas.
  - `definirOnglet('nouveau'|'suivi')` bascule simplement `style.display` entre `#onglet-nouveau`
    (formulaire + aperçu PDF, layout `.layout-cols` inchangé) et `#onglet-suivi` (`.wrap-suivi`,
    pleine largeur 1680px) — pas de framework de routage, cohérent avec le reste de l'outil.
    Après `ajouterDossier()`, bascule automatique vers "Suivi" pour voir le nouveau dossier.
  - Dans l'onglet "Suivi" : recherche (nom/responsable), filtres (responsable, statut de l'offre
    de prêt), et une bascule **Cartes / Tableau** (`definirVue()`). La vue tableau
    (`renderLigneTableau()`) montre une ligne résumée par dossier qui déplie au clic la carte
    complète existante (`renderCarteDossier()`, extraite de l'ancien `render()`) — aucune action
    (boutons, historique, changement de catégorie...) n'est dupliquée dans une seconde
    implémentation : la ligne tableau n'est qu'un point d'entrée vers la même carte.
  - Un bandeau de statistiques (`renderStatsSuivi()`) synthétise le portefeuille en tête de
    l'onglet : dossiers actifs, échéances ≤ 7 jours, offres de prêt introuvables, offres à
    vérifier — calculé sur tous les dossiers actifs, indépendamment de la recherche/des filtres
    appliqués à la liste en dessous. Couleur toujours réservée aux catégories existantes
    (`--urgent`, `--pret`), pas de code couleur inventé pour l'occasion.
  - `prochaineEcheanceDetail(d)` (nouvelle fonction) détermine, pour un dossier, l'échéance la
    plus proche à afficher en un coup d'œil (type + libellé + date + jours restants) — logique
    proche de `calculerProchaineEcheance()` mais qui renvoie le détail complet, pas seulement un
    nombre de jours pour le tri.
  - **Complété ensuite** (repris de la maquette initiale, pour une UX plus dense/moderne) :
    - Filtre par type d'échéance (`#filtre-type`), et tri "Responsable" ajouté au menu existant.
    - En-têtes de la vue tableau cliquables pour trier (`definirTri()`) : répercutent leur choix
      sur le `<select id="tri-dossiers">` plutôt que de maintenir un second état de tri séparé à
      synchroniser — une seule source de vérité pour le critère de tri, qu'on l'ait changé depuis
      le menu ou depuis un en-tête.
    - Vue "Cartes" transformée en grille de résumés compacts (`renderCarteCompacte()`) plutôt que
      la liste de cartes complètes toujours dépliées : chaque résumé se déplie au clic vers la même
      carte complète (`renderCarteDossier()`), en prenant toute la largeur de la grille
      (`grid-column: 1/-1`) sans décaler les autres cartes — même principe de non-duplication des
      actions que la vue tableau.
    - Bouton d'action rapide "Revérifier" directement visible sur le résumé (carte compacte et
      ligne de tableau) quand un dossier est relié, sans avoir à déplier — appelle simplement
      `verifierOffrePret()` avec `event.stopPropagation()` pour ne pas déclencher le dépliage.
- **Détection des dates** : le texte est découpé phrase par phrase avec des bornes de contexte
  (voir `EXCLUSION_RE`, `CLAUSE_HYPOTHETIQUE_RE`, `OCCUPATION_JOUISSANCE_RE`,
  `LISTE_EQUIPEMENTS_RE` dans `script.js`). Ces regex existent pour écarter des faux positifs
  précis rencontrés sur de vrais compromis (dates de diagnostics, clauses conditionnelles du type
  "si le bien venait à se trouver en zone...", énumérations d'équipements vendus avec le bien).
  Avant de resserrer ou d'élargir une regex, relire les tests correspondants pour comprendre quel
  cas réel elle corrige.
- **Vendeur = Promettant, Acquéreur = Bénéficiaire.** L'outil doit fonctionner aussi bien sur un
  compromis synallagmatique classique que sur une promesse unilatérale de vente réitérée par acte
  authentique, où les rôles portent ces noms différents. Voir `RE_ROLE_VENDEUR` /
  `RE_ROLE_ACQUEREUR`.
- **Catégories d'engagement du vendeur** : "entretien" (justifier d'un entretien déjà fait),
  "travaux" (à faire exécuter), "document" (justificatif à produire) — distinction demandée
  explicitement par l'étude, ne pas fusionner ces catégories.
- **Rappels par défaut : 15 jours et 7 jours avant l'échéance** (pas 7 et 1 — erreur corrigée une
  fois, ne pas la refaire). Voir `RAPPELS_PAR_DEFAUT`.
- **Responsables du dossier : liste fermée** (Bastien ANGLUMENT, Julie VASSELIN, Jérémy SAUJOT), pas
  un champ texte libre.
- **Palette du mode sombre : gris neutres, pas de teinte bleutée/navy.** Décision explicite pour se
  rapprocher de l'esthétique de l'interface Claude.
- **Procédure d'appel de fonds** : les 9 étapes dans `PROCEDURE_FONDS` sont reprises **à
  l'identique** du document interne de l'étude (`{lead, suite}` avec l'amorce en gras/majuscules
  telle que l'étude l'a elle-même mise en forme). Ne pas reformuler ce texte sans qu'on te
  redonne le document source.
- **Registre partagé réseau** : un fichier JSON unique sur le lecteur réseau de l'étude, relié via
  `showSaveFilePicker()`, lu/écrit par tous les collaborateurs. Pas de fusion intelligente en cas
  d'écriture simultanée (dernière sauvegarde gagne) — limite acceptée sciemment, ne pas essayer de
  la résoudre sans qu'on le demande explicitement (ça impliquerait un vrai backend).
- **Décision explicite de rester en local, sans hébergement en ligne.** Ne pas proposer de migrer
  vers un serveur/cloud sans qu'on le redemande — le sujet a été tranché.
- **Tesseract.js migré de la v1.0.17 vers la v5** (`ocrPage()` / `creerWorkerOcr()` dans
  `script.js`) : l'ancienne API `Tesseract.recognize(canvas, 'fra')` recréait un worker et
  rechargeait le modèle de langue à chaque page ; la v5 crée un seul worker
  (`Tesseract.createWorker('fra')`), réutilisé pour les 1 à 3 pages de la boucle OCR dans
  `traiterFichierPdf()`, puis terminé (`worker.terminate()`) dans un `finally`. **Validé en
  conditions réelles** (import PDF classique et OCR sur compromis scanné/signature en image,
  testés via une page GitHub Pages construite sur la branche de développement). `index.html` pointe vers
  `tesseract.js@5` (version flottante sur jsdelivr, pas un patch figé comme pour pdf.js) tant
  qu'une version précise n'a pas été confirmée fonctionnelle — la figer une fois validée.
- **Apprentissage des corrections manuelles** (`memoriserCorrection()` / `trouverCorrectionApprise()`
  dans `script.js`, section "apprentissage des corrections") : quand un(e) collaborateur(rice)
  reclasse une date détectée (clic sur Prêt/Acte/Vente/Autre différent de la suggestion, y compris
  quand l'outil n'avait rien deviné), la clause est mémorisée. Au prochain compromis, une clause
  très proche (mots communs, dates/montants neutralisés, comparée par indice de Jaccard — voir
  `SEUIL_SIMILARITE_APPRENTISSAGE`) réapplique automatiquement cette classification, marquée d'un
  badge "🧠 appris" dans les chips — elle reste à vérifier comme toute suggestion automatique, ce
  n'est pas parce que deux clauses se ressemblent qu'elles jouent le même rôle dans ce compromis.
  Stocké en local uniquement, même mécanisme que le registre des dossiers (`localStorage`, repli
  `window.storage` en aperçu Claude.ai). **Limite connue** : seules les corrections faites sur les
  chips au moment de l'import (`assignerDate()`, `ajouterAutre()`) alimentent l'apprentissage — une
  reclassification faite après coup sur un dossier déjà enregistré (`changerCategorie()`) n'est pas
  captée, faute de conserver le texte de la clause d'origine sur le dossier sauvegardé.
- **Bug corrigé : `OFFRE_PRET_RE` ne reconnaissait pas "offre de crédit (immobilier)"**, une
  formulation bancaire aussi courante que "offre de prêt" pour désigner le même document.
  Signalé par l'étude : une offre réelle ainsi intitulée restait marquée "introuvable" même après
  "Revérifier", alors que le PDF était bien du texte extractible placé dans le bon dossier relié
  (diagnostiqué en confirmant d'abord que ce n'était ni un problème d'OCR ni de parcours récursif,
  en demandant simplement le titre de la page de garde). Alternative ajoutée à la regex. À cette
  occasion, `OFFRE_PRET_RE` est passée de `const` à `var` pour rester testable depuis
  `tests/dossier-local.test.js` (les `const` de premier niveau ne deviennent pas des propriétés du
  contexte global `vm`, contrairement aux `function` et aux `var` — voir `tests/helpers/load-app.js`).
- **`verifierOffrePret()` ne donnait aucun retour visuel lors d'un clic manuel sur "Revérifier"**
  quand rien n'était trouvé (le badge ne change pas si le statut était déjà "introuvable" — même
  bug de fond que le point 5 des contraintes ci-dessus, appliqué ici à une vérification plutôt
  qu'à une erreur de formulaire). Signalé par l'étude après le correctif "offre de crédit" :
  toujours "introuvable", sans que rien n'indique si le dossier a seulement été mal parcouru (0
  PDF trouvé) ou si des PDF ont bien été lus mais sans y reconnaître l'offre. Un `afficherToast`
  résume maintenant le résultat après chaque clic sur "Revérifier" (offre trouvée avec le nom du
  fichier / aucun PDF trouvé / N PDF analysés sans correspondance), et chaque PDF analysé produit
  une trace `console.log` avec un extrait du texte lu par pdf.js — utile pour distinguer un PDF
  au parcours correct dont le texte extrait est illisible (police embarquée mal encodée, cas
  fréquent sur des PDF générés par des banques/logiciels tiers) d'un vrai problème de détection.
  Cette trace ne s'affiche qu'en console, jamais à l'écran (pas de PII exposée à l'utilisateur
  final au-delà de ce qu'il voit déjà en ouvrant lui-même le PDF).
- **Changer de dossier lié** : un bouton "Changer de dossier" (`changerDossierLocal()`, visible
  uniquement quand un dossier est déjà relié) permet de corriger un dossier local mal choisi sans
  passer par une manipulation cachée. C'est un simple alias de `lierDossierLocal()` : celle-ci
  écrase déjà le handle précédent (`put()` dans `enregistrerHandle`) et adapte maintenant son
  message d'historique ("... modifié (nouveau dossier choisi)" vs. le message de première liaison)
  selon que `d.dossierLie` était déjà vrai avant l'appel.
- **Bug corrigé : `verifierOffrePret()` ne regardait que la racine du dossier local relié**
  (`handle.entries()` n'est pas récursif). Signalé par l'étude : "je sélectionne bien le dossier
  mais il ne détecte pas l'offre" — l'offre était dans un sous-dossier ("Offres", "Pièces reçues"…),
  ce qui est le cas le plus courant, pas l'exception. `fichiersPdfRecursifs()` parcourt maintenant
  les sous-dossiers (jusqu'à `PROFONDEUR_MAX_RECHERCHE_PDF`, avec un plafond
  `MAX_FICHIERS_PARCOURUS` en garde-fou). Un repli OCR sur la première page a aussi été ajouté pour
  les PDF scannés sans texte extractible (même logique que pour la date de signature du compromis).
- **Bug corrigé : `extraireTextesUtiles()` tronquait l'import dès qu'un simple renvoi « Annexe n°1 »
  apparaissait dans une clause du corps de l'acte**, sans qu'aucune pièce jointe ne soit réellement
  annexée au même PDF. Signalé par l'étude sur une vraie promesse (trame LD Notaires, 52 pages) :
  une clause page 7 (« Un extrait de plan cadastral est annexé. Annexe n°1 ») déclenchait l'arrêt
  dès la page 6, alors que le corps de l'acte se poursuivait jusqu'à la signature page 52 — la
  numérotation des annexes repart même à 1 plusieurs fois dans le document, une fois par thème
  (plan cadastral, urbanisme...), ce n'est pas une liste unique en fin d'acte. La détection
  (extraite dans `estDebutPageAnnexe()`, testable, voir `tests/divers.test.js`) ne considère
  maintenant une page comme un vrai début de pièce jointe que si la mention arrive en tout début de
  page ou si la page est globalement courte (scan avec peu de texte extractible) — pas si elle est
  citée en milieu d'une clause de plusieurs milliers de caractères.
- **Bug corrigé : le champ "Obtention du prêt" se remplissait avec une date de citation de loi
  (28/02/2022) au lieu de la vraie échéance de l'offre de prêt (30/09/2026)**, sur la même
  promesse LD Notaires de 52 pages. Deux causes cumulées, corrigées ensemble :
  - `detecterDateCompromis()` ne reconnaissait aucun des motifs existants sur cette promesse : son
    bloc de signature électronique nomme chaque partie séparément (« Mme X a signé à BLOIS le 22
    juillet 2026 »), sans les mots "compromis", "promesse" ni "signé électroniquement" que les
    motifs cherchaient. `dateCompromisDetectee` restait donc vide, ce qui désactivait silencieusement
    le filtre "écarte toute date antérieure ou égale à la signature" pour le reste de l'extraction
    — un patron `a\s+sign[ée]\s+...\s+le` a été ajouté, et les motifs existants acceptent
    maintenant "promesse" en plus de "compromis".
  - Même une fois ce filtre actif, une clause d'information sur l'assurance emprunteur (« ... en
    vertu de la loi numéro 2022-270 du 28 février 2022 ») reste après cette date et est classée
    "pret" à cause du vocabulaire "prêteur"/"emprunteur" à proximité — `traiterTexte()` remplit le
    champ avec la PREMIÈRE date ayant cette suggestion une fois les dates triées chronologiquement,
    donc la plus ancienne, pas la bonne. `EXCLUSION_RE` écarte maintenant toute date accompagnée
    d'une citation de loi (`loi\s+(?:n[°ºo]|num[ée]ro)\s*[\d\-]+`) — motif générique, pas spécifique
    à cette loi de 2022. Voir les tests de régression dans `tests/dates.test.js` (texte réel de la
    clause, anonymisé).
- **Badge de confiance "⚠️ à vérifier" (troisième niveau, entre "auto" et "manuel")** : les deux
  bugs ci-dessus (annexe, citation de loi) ont un point commun — une échéance mal choisie parmi
  plusieurs dates candidates, sans que rien ne le signale à l'utilisateur (le champ semblait aussi
  fiable qu'une détection sans ambiguïté). Plutôt que de continuer à ne corriger qu'au cas par cas
  chaque nouveau piège de formulation (l'étude traite aussi des compromis d'agence et des promesses
  d'achat, dont les tournures varient), `meilleureCandidateEcheance()` (testable, voir
  `tests/dates.test.js`) rend le choix visible quand il est incertain : quand plusieurs dates du
  texte partagent la même catégorie suggérée (prêt/acte/vente), une formulation de délai ("au plus
  tard le", "avant le"...) tranche si elle n'appartient qu'à une seule d'entre elles ; sinon la
  première est gardée par défaut mais la confiance passe à "incertain" plutôt que "auto"
  (`ambiguiteParType`, remis à zéro par import de PDF et par tout clic explicite sur un chip dans
  `assignerDate()` — l'utilisateur vient alors de trancher lui-même). Le badge est délibérément
  coloré comme `--urgent` (déjà réservé à l'alerte, voir `.badge-prioritaire`), pas une couleur
  inventée pour l'occasion. Ne remplace pas les corrections ciblées de regex quand un cas précis et
  récurrent est identifié : les deux approches sont complémentaires.
- **Refonte visuelle demandée par l'étude (navigation, densité, statut d'un coup d'œil)** : point de
  départ, un retour détaillé jugeant l'outil "fonctionnel mais daté", proposant entre autres un
  wizard 3 étapes, un dashboard, l'analyse juridique toujours visible, des badges de statut, et une
  palette bleue. Deux points ont été signalés comme entrant en tension avec des décisions déjà
  prises avant de se lancer : un wizard linéaire ne correspond pas à un dossier suivi pendant des
  mois avec ~60 dossiers actifs en parallèle (d'où les deux onglets, pas un chantier à défaire sans
  y réfléchir) ; le bleu contredit la palette sombre "gris neutres, pas de navy". L'étude a confirmé
  vouloir tout malgré ça ("fait tout") — traité par sous-chantiers indépendants, chacun testé et
  commité séparément :
  - **Badges de statut visuels (vert/jaune/rouge/verrou)** (`statutDossier()`, testable, voir
    `tests/divers.test.js`) : synthèse "où en est ce dossier ?", distincte du score
    `calculerPriorite()` qui sert au tri (l'un classe, l'autre répond d'un coup d'œil). Le plus
    sévère l'emporte : `archive` (dossier archivé) > `blocage` (offre de prêt introuvable, accès
    local à reconfirmer, ou plus aucune échéance à venir — toutes dépassées) > `aconfirmer` (une
    échéance choisie par `meilleureCandidateEcheance` avec confiance "incertain", ou un prêt actif
    dont l'offre n'a jamais été confirmée — même périmètre que la tuile "offres à vérifier" du
    bandeau de stats) > `pret`. Remplace l'ancien badge "Archivé" ad hoc (`badge-archive`, supprimé)
    par ce même badge de statut, qui couvre déjà ce cas. Couleurs réutilisées : `--success` (vert),
    `--pret` (amber, même couleur que "offre introuvable" — pas `--urgent`, réservé au blocage),
    `--urgent` (rouge), gris neutre pour l'archive — aucune couleur inventée.
  - **Analyse juridique ancrée (onglets Aperçu / Analyse juridique)**, à la place de son ancienne
    position inline dans le formulaire "Nouveau dossier" : une analyse fournie (beaucoup de
    clauses/documents détectés) poussait le reste du formulaire loin en dessous, forçant à tout
    redéfiler pour la revoir. Le panneau `#analyse-juridique` a été déplacé dans l'aside
    `#pdf-viewer` (déjà `position: sticky`, ancré pendant que le formulaire défile), avec un petit
    switcher d'onglets (`definirVuePdfViewer('apercu'|'analyse')`) qui bascule entre l'aperçu PDF et
    l'analyse — jamais les deux affichés en même temps dans la même colonne. `analyseJuridiqueDisponible`
    contrôle l'affichage des onglets (masqués si rien à montrer) ; `vuePdfViewerActuelle` revient à
    `'apercu'` à chaque nouvel import (`traiterFichierPdf()`) pour ne pas laisser l'utilisateur
    "coincé" sur l'analyse d'un document précédent. La version affichée sur une carte de dossier déjà
    enregistré (`renderCarteDossier()`) n'est PAS concernée : elle est dans un `<details>` fermé par
    défaut, qui ne pose pas ce problème d'écrasement — seule la version "live" pendant l'import
    l'avait.
  - **Palette bleue professionnelle**, sans revenir sur les surfaces neutres du mode sombre. Tout
    l'outil utilisait déjà un unique token `--focus` pour l'ensemble des accents interactifs (boutons
    primaires, liens, focus, onglet actif, action rapide "Revérifier"...) — il suffisait donc de
    changer sa valeur pour retoucher tout l'outil de façon cohérente, sans toucher des dizaines de
    règles une par une. Bleu plus affirmé qu'avant (`#2472B0` clair / `#6FAEDB` sombre, jugés
    "datés") : `#2563EB` (hover `#1D4ED8`) en clair, `#5B9DF9` (hover `#7FB4FB`) en sombre — et un
    nouveau token `--focus-hover` remplace un hover jusque-là codé en dur (`#1B5A87`) dans
    `button.primary:hover`. Volontairement **découplé** de `--acte` (couleur réservée à la catégorie
    d'échéance "acte", qui partageait la même valeur par coïncidence, pas par conception) : `--acte`
    n'a pas changé, seul `--focus` a été retouché — les deux peuvent maintenant diverger sans que
    l'un change accidentellement l'autre. Les surfaces du mode sombre (`--paper`, `--paper-card`,
    `--ink`...) restent inchangées : gris neutres, toujours pas de navy, décision non remise en
    cause par cet ajout d'accent.
  - **Wizard 3 étapes pour "Nouveau dossier" (Importer → Vérifier → Finaliser)**, à la place de
    l'ancien formulaire à défilement unique (4 sections numérotées visibles d'un coup, ce qui le
    rendait dense). Concerne UNIQUEMENT la création : l'onglet "Suivi des dossiers" reste le
    dashboard continu, pas concerné par un parcours linéaire — voir la tension notée plus haut entre
    un wizard et un dossier suivi pendant des mois. Regroupement (avec un léger réordonnancement) :
    Étape 1 *Importer* = dropzone PDF + statut + chips (ex-« étape 1 ») ; Étape 2 *Vérifier* = les
    dates butoir prêt/acte/vente + échéances personnalisées (ex-« étape 3 », déjà appelée "VÉRIFIER
    LES ÉCHÉANCES" dans l'app) ; Étape 3 *Finaliser* = identité du dossier + rappels + enregistrement
    (fusion des ex-« étapes 2 et 4 » : nommer/assigner un dossier vient naturellement après avoir
    vérifié ses dates, pas avant). `definirEtapeWizard(n)` bascule un simple `display:block/none`
    sur 3 `.wizard-step` — **aucune étape n'est verrouillée** : on peut toujours avancer, reculer, ou
    directement cliquer "Ajouter le dossier" sans jamais avoir importé de PDF, exactement comme
    avant ce découpage (un dossier 100% saisi à la main doit rester possible). Bascule automatique
    vers l'étape 2 dès qu'un import PDF réussit (`traiterFichierPdf()`), pour éviter un clic
    "Suivant" superflu juste après avoir vu les chips apparaître. `reinitialiserFormulaire()` (appelé
    après `ajouterDossier()`) remet le wizard à l'étape 1. L'ancien bandeau `.mode-emploi` (1→2→3 en
    texte libre) et les 4 `<div class="etape">` numérotés sont supprimés, remplacés par le stepper
    cliquable lui-même — code CSS mort nettoyé en même temps (`.mode-emploi`, `.etape`, `.etape-num`).
    Dernier chantier de la refonte visuelle demandée par l'étude — les 4 sont maintenant en place.
- **Détection de dates arrondies/relatives** ("avant fin septembre 2026", "délai de 30 jours à
  compter de la signature", "J+30"), suite à un retour signalant que le détecteur ratait ces
  formulations (il ne reconnaissait que des dates calendaires explicites). Deux nouveaux motifs
  dans `detecterDatesDepuisTexte()` :
  - **Fin de mois** (`fin <mois> <année>`) résolue au dernier jour civil du mois. L'année doit être
    écrite explicitement dans le texte — sans elle, il faudrait deviner entre l'année du compromis
    et la suivante selon le mois, exactement le genre de supposition qui a déjà produit une
    mauvaise date silencieuse (voir les bugs "Annexe n°1" et citation de loi plus haut) : non
    trouvée → non ajoutée, l'utilisateur la saisit à la main comme pour tout ce que l'outil ne
    reconnaît pas.
  - **Délai relatif à la signature** (`délai de N jours à compter de/à partir de la signature/ce
    jour/l'acte/la présente/le présent compromis/la promesse`, ou son équivalent chiffré `J+N`) —
    calculé via `addDays()` (déjà utilisé pour l'export `.ics`) à partir de `dateCompromis`.
    Uniquement si cette date de signature a été trouvée : sans ancre fiable, on ne devine pas à
    partir de quoi compter.
  - Les deux sont marquées `approx: true` sur le chip détecté, propagée jusqu'à l'enregistrement du
    dossier via un nouveau niveau de confiance **"estime"** (badge `≈ estimée`, quatrième valeur à
    côté de `auto`/`incertain`/`manuel` — voir `LIBELLES_CONFIANCE` dans `renderTab()` et le badge
    équivalent sur le chip lui-même dans `creerChip()`). `statutDossier()` traite "estime" comme
    "incertain" (même mérite de vigilance : dans les deux cas la date affichée n'est pas une simple
    lecture directe du texte). Nouvel état `approxParType`, même cycle de vie que `ambiguiteParType`
    (remis à zéro par import de PDF, écrasé par un clic explicite sur un chip dans `assignerDate()`
    — le caractère approximatif de la date suit alors le chip choisi, il ne disparaît pas).
  - **Bug latent découvert en testant ce nouveau code, dans du code déjà en place** :
    `detecterDateCompromis()` backtrackait à travers une phrase entière jusqu'au "le" suivant
    quand le "le" attendu n'était pas trouvé assez vite, à cause d'un `[^,\n]{0,40}` qui n'excluait
    pas le point dans le groupe "à ..." de plusieurs motifs (`fait à ...`, `a signé à ...`, `le
    présent compromis ... à ...`). Sur un texte réel du type « Mme X a signé à BLOIS le 22 juillet
    2026. Le vendeur s'engage à produire ce document dans un délai de 30 jours à compter de la
    signature. », le motif "a signé" capturait "vendeur s'engage à produire ce document" comme si
    c'était la date de signature — pire qu'une non-détection, puisqu'une fausse date de signature
    désactive silencieusement le filtre anti-dates-antérieures pour tout le reste de l'extraction.
    Corrigé en excluant aussi le point (`[^,.\n]`) dans ces trois groupes. Voir le test de
    régression dans `tests/dates.test.js` (texte minimal reproduisant le bug).
- **Bug corrigé : après "Ajouter le dossier", l'aperçu PDF du compromis qu'on venait d'enregistrer
  restait affiché** à côté du formulaire "Nouveau dossier" pourtant vide et revenu à l'étape 1,
  prêt pour un nouvel import. Signalé par l'étude. `reinitialiserFormulaire()` remettait bien le
  wizard à l'étape 1 mais n'avait jamais fermé l'aside `#pdf-viewer` lui-même ni vidé
  `#pdf-pages-container` — seul l'ajout du wizard avait introduit le remède partiel (retour à
  l'étape 1), sans traiter la cause : le panneau d'aperçu vit dans l'aside, pas dans le wizard.
  `reinitialiserFormulaire()` masque maintenant `#pdf-viewer`, vide `#pdf-pages-container` et
  réinitialise `pdfActuel`/`pdfDernierePageUtile`/`frontieresPagesActuelles` — sans quoi un vieux
  PDF resterait aussi référencé en mémoire pour rien.
- **Suivi des pièces du dossier, sur le modèle de l'offre de prêt** : demandé par l'étude à partir
  des listes maison/copropriété qu'elle avait fournies. Un sélecteur "Type de vente" (maison /
  copropriété, `#f-type-vente`, étape "Finaliser" du wizard) détermine la checklist applicable via
  `checklistPieces(typeVente)` (voir `PIECES_URBANISME`/`PIECES_AUTRES`/`PIECES_COPROPRIETE`,
  section "suivi des pièces du dossier" dans `script.js`) ; un aperçu en lecture seule
  (`majApercuPieces()`, `#pieces-apercu`) montre la liste dès qu'on choisit le type, avant même
  d'enregistrer le dossier. Distinct de `DOCUMENTS_VENDEUR_CONNUS` (qui détecte des documents à
  partir des clauses d'engagement *lues dans le compromis*) : cette checklist-ci liste ce que
  l'étude doit réunir pour CE TYPE de vente, indépendamment de ce que le compromis mentionne.
  - `verifierPiecesDossier(id, viaClicUtilisateur)` reprend l'infrastructure de
    `verifierOffrePret()` (mêmes `fichiersPdfRecursifs()`/repli OCR/gestion des permissions) mais
    teste TOUTES les pièces encore manquantes contre chaque PDF lu, au lieu de s'arrêter au premier
    document reconnu — une checklist multi-pièces, pas un simple oui/non. S'arrête dès que toutes
    les pièces sont trouvées, inutile de lire le reste des PDF. Appelée automatiquement après
    `lierDossierLocal()` et à chaque revérification périodique
    (`revérifierDossiersLiesAuDemarrage()`), comme l'offre de prêt.
  - Les motifs de reconnaissance (`PIECES_*`) sont un premier jet à partir du seul intitulé de
    chaque pièce, pas encore confronté à de vrais titres de documents contrairement à
    `OFFRE_PRET_RE` — à resserrer/élargir dès qu'un vrai dossier fait remonter un problème. Piège
    déjà anticipé : "ERP" désigne aussi bien "état des risques et pollutions" (la pièce recherchée)
    qu'un "Établissement Recevant du Public" (sans rapport) — le motif s'appuie sur l'intitulé
    complet ("état des risques...") plutôt que sur le sigle seul.
  - `renderPiecesDossier(d)` affiche la checklist sur la fiche du dossier (toujours visible, pas
    dans un `<details>` — contrairement à l'analyse juridique, c'est un suivi actif comme les
    échéances, pas une lecture ponctuelle) : un badge par pièce (✓ reçue / ✕ manquante / ? pas
    encore vérifié — ce dernier n'est PAS une anomalie tant que le dossier n'a jamais été relié à
    un dossier local), un compteur "X/Y" (vert si complet, amber sinon), et un bouton "Revérifier
    les pièces" si un dossier local est relié. N'apparaît PAS sur les résumés compacts
    (carte/tableau) — seulement sur la fiche dépliée, pour ne pas alourdir la vue de synthèse déjà
    dense (bandeau de stats, badge de statut, badge de priorité).
  - `d.typeVente` ('maison' par défaut) et `d.pieces` (objet `{cle: 'recue'|'manquante'}`, absence
    de clé = "pas encore vérifié") ajoutés au modèle du dossier, gérés dans
    `normaliserDossierImporte()` (typeVente validé/conservé à l'import, pieces repart à `{}` — même
    logique que `offrePretStatut`, qui repart aussi à `'inconnu'` : un statut dérivé de PDF locaux
    ne doit pas être importé tel quel d'une autre machine sans revérification).
  - Volontairement **pas** branché sur `statutDossier()`/`calculerPriorite()` : une pièce jamais
    vérifiée (dossier non relié) n'est pas un signal de blocage comme l'offre de prêt introuvable
    l'est, ce serait pénaliser tous les dossiers non reliés sans raison. Reste ouvert si l'étude le
    demande explicitement, avec une règle claire à définir (ex. seulement une fois relié).
- **Rôle de l'étude sur le dossier : notaire instrumentaire ou participant/concourant.** Un même
  dossier notarial peut être suivi par deux offices : celui qui reçoit l'acte (instrumentaire, suivi
  complet) et celui qui représente l'autre partie (participant/concourant, dont les besoins de
  suivi sont volontairement plus restreints). Sélecteur `#f-role-notaire` à l'étape "Finaliser" du
  wizard (avec `instrumentaire` par défaut), stocké dans `d.roleNotaire`, validé/conservé à l'import
  dans `normaliserDossierImporte()` (repli sur `instrumentaire` si absent ou invalide — même logique
  que `typeVente`).
  - **Notaire participant** : suivi volontairement réduit à l'offre de prêt et aux engagements du
    vendeur (déjà extraits automatiquement dans l'analyse juridique, indépendamment du rôle) —
    exactement les deux points demandés par l'étude. La checklist de pièces (`renderPiecesDossier`)
    ne s'affiche pas pour ce rôle (`d.roleNotaire !== 'participant'` conditionne son rendu dans
    `renderCarteDossier()`), et `verifierPiecesDossier()` s'arrête tôt sur un dossier participant
    (retour anticipé en tête de fonction) pour ne pas scanner le dossier local pour rien. L'aperçu
    de la checklist à l'étape "Finaliser" (`majApercuPieces()`) affiche à la place une note
    expliquant que seuls le prêt et les engagements du vendeur seront suivis.
  - Volontairement **pas** de verrouillage des échéances acte/vente préalable pour un dossier
    participant : les cases à cocher existantes (`toggle-acte`/`toggle-ventebien`) restent la seule
    source de vérité sur ce qui est actif, cohérent avec "aucune étape n'est verrouillée" déjà
    appliqué au reste du wizard — le rôle ne fait que masquer la checklist de pièces, il ne force
    rien d'autre.
  - Badge "🤝 Participant" sur la fiche du dossier (uniquement pour ce rôle — l'instrumentaire, cas
    par défaut/majoritaire, n'affiche rien, comme `.badge-cash` qui ne s'affiche que pour
    l'exception "sans prêt") et filtre "Rôle" (`#filtre-role`) dans la barre d'outils de l'onglet
    "Suivi", à côté des filtres Responsable/Échéance/Offre de prêt déjà existants.
- **Type de vente et rôle du notaire corrigeables après enregistrement** : demandé juste après leur
  introduction (voir ci-dessus), pour le cas où l'un des deux a été mal renseigné à la création ou
  change en cours de dossier. `changerTypeVente(id, valeur)` / `changerRoleNotaire(id, valeur)`
  (avec entrée d'historique) via deux `<select class="select-edit">` sur la fiche du dossier
  (ligne "Type de vente : ... · Rôle : ..."). Volontairement un simple `<select>` plutôt que le
  mécanisme crayon+validation utilisé pour le nom/les dates : ce sont des choix fermés à deux
  valeurs, pas du texte libre où un clic accidentel risquerait d'effacer quelque chose — le motif
  est le même que `changerCategorie()`/`.tab-select`, déjà utilisé pour recatégoriser une échéance.
  Changer de type de vente ne retouche pas `d.pieces` : `checklistPieces()` est recalculée à
  l'affichage à partir de `d.typeVente`, donc les pièces déjà reconnues sous une clé commune aux
  deux types (ex. `titrePropriete`) restent valables, et celles propres à l'ancien type restent en
  mémoire sans s'afficher, sans risque si l'étude revient un jour au type précédent.
- **Bug corrigé : une offre de prêt déjà marquée reçue pouvait redéclencher une relance
  automatique** (`relancerSiOffreManquante()`, brouillon `mailto:` pré-rédigé ouvert seul par
  l'application). Signalé par l'étude en testant le suivi. `verifierOffrePret()` relance chaque
  dossier lié (au démarrage via `revérifierDossiersLiesAuDemarrage()`, et après tout nouveau
  lien) : si l'offre déjà confirmée reçue lors d'un scan précédent n'est plus retrouvée lors d'un
  scan ultérieur (PDF déplacé/archivé/renommé une fois le dossier traité, ou tout autre aléa de
  parcours), ce n'est pas un signe que l'offre manque réellement — l'étude l'a déjà en main. Un
  nouveau garde-fou (`etaitRecue`, capturé avant d'écraser `d.offrePretStatut`) empêche désormais
  `relancerSiOffreManquante()` de s'exécuter dans ce cas, en plus de la condition déjà existante
  `!trouve`. Le statut affiché peut malgré tout repasser à "manquante" sur la fiche (non traité
  ici, l'étude n'a signalé que la relance intempestive, pas l'affichage du badge) — à revoir si
  ce second point est aussi gênant en pratique.
- **Retours de tests en conditions réelles par l'étude, traités en une série de corrections
  indépendantes** :
  - **Responsable du dossier corrigeable après enregistrement**, même mécanisme et même
    justification que le type de vente/rôle du notaire ci-dessus : `changerResponsable(id, valeur)`
    + `<select class="select-edit">` sur la fiche, à côté des deux autres.
  - **Bug corrigé : les `<select>` "Type de vente" et "Rôle de l'étude" (étape "Finaliser" du
    wizard) n'avaient pas le même style que les autres champs.** La règle CSS qui donne largeur/
    padding/bordure cohérents aux champs du formulaire ne listait que
    `input[type="text"|"date"|"email"], textarea, #f-responsable` (ce dernier étant, à l'origine,
    le seul `<select>` du formulaire) — les deux nouveaux `<select>` en étaient absents et
    gardaient l'apparence native du navigateur. Remplacé par un sélecteur générique `select` (et
    `select:hover`/`select:focus` ajoutés aux règles voisines) : tout futur `<select>` du
    formulaire hérite maintenant du même style sans qu'on ait à penser à l'y ajouter.
  - **Une fois l'offre de prêt reçue, l'échéance "Obtention du prêt" ne doit plus être présentée
    comme la prochaine chose à surveiller.** `prochaineEcheanceDetail()` et
    `calculerProchaineEcheance()` excluent maintenant cette échéance de leurs candidats dès que
    `d.offrePretStatut === 'recue'` : le résumé (carte compacte, ligne de tableau) et le tri
    "Échéance la plus proche" passent alors directement à la suivante (acte, vente préalable...)
    au lieu de continuer à afficher "Obtention du prêt — J-X" pour une condition déjà résolue.
  - **Chips de dates détectées déplacées de l'étape "Importer" vers l'étape "Vérifier"** (juste
    au-dessus du bloc "Dates butoir"), pour permettre de comparer chaque date auto-détectée du
    compromis aux dates finalement retenues sans changer d'étape — l'auto-avance vers l'étape 2
    après un import réussi (voir plus haut) rendait de toute façon l'étape 1 immédiatement
    quittée, la présence des chips y était peu utile.
  - **`statutDossier()` tient maintenant compte de la checklist de pièces**, point volontairement
    laissé ouvert lors de l'introduction de cette checklist (voir plus haut) : un dossier relié
    (`d.dossierLie`), hors rôle participant, dont au moins une pièce de `checklistPieces()` n'est
    pas encore "recue" retombe en statut "aconfirmer" plutôt que "prêt" — l'offre de prêt seule ne
    suffit plus à afficher un dossier comme prêt si des pièces d'urbanisme manquent encore. Un
    dossier non relié n'est toujours pas pénalisé (même principe que l'offre de prêt "inconnue").
  - **Bug corrigé : un dossier "sans prêt" (achat comptant) ne pouvait pas être relié à un dossier
    local**, alors que la checklist de pièces (urbanisme...) s'applique indépendamment du mode de
    financement. Le bloc contenant les boutons "Lier un dossier local"/"Changer de dossier"/
    "Cliquer pour reconfirmer l'accès" était entièrement conditionné à `!d.sansPret` — seul le
    badge "Offre de prêt : ..." et le bouton "Revérifier" (spécifiques au prêt) le restent
    désormais ; le lien vers le dossier local est proposé dans tous les cas.
  - **Page de détection ajoutée aux engagements du vendeur**, sur le même principe que les dates
    (`pageDepuisIndex()`, déjà utilisé par `detecterDatesDepuisTexte`) : `extraireEngagementsVendeur`
    renvoie maintenant `{ phrase, type, page }`, et `renderEngagement()` affiche un bouton
    "👁 p.X" cliquable (réutilise `voirDateDansPdf()`) quand le PDF d'origine est encore chargé en
    mémoire (import en cours), ou simplement le numéro de page (`.chip-page`, non cliquable) sinon
    — cas le plus courant en pratique : relire une clause sur un dossier rouvert plusieurs jours
    après l'import, le PDF lui-même n'étant jamais conservé (voir le même principe déjà en place
    pour `renderTab()`/les dates).
  - **Bulk "Reconfirmer tous les accès"** (`reconfirmerTousLesAcces()`, bandeau `#alerte-acces`
    au-dessus de la liste du Suivi) : Chrome ne conserve l'autorisation d'accès à un dossier local
    que le temps de la session et la redemande systématiquement après un redémarrage du navigateur
    — **limitation du navigateur, pas un bug applicatif** (rien côté `localStorage`/IndexedDB ne
    permet de la contourner ; le *handle* est bien conservé, seule la *permission* associée ne
    l'est pas durablement). Sur un portefeuille d'une soixantaine de dossiers actifs, cliquer sur
    le lien "Cliquer pour reconfirmer l'accès" de chacun un par un était le vrai problème signalé
    — réglé en regroupant tous les appels `requestPermission()` à la suite dans un seul
    gestionnaire de clic (Chrome autorise plusieurs appels de ce type tant qu'ils restent proches
    du geste utilisateur d'origine, contrairement à des API à usage unique comme
    `requestFullscreen`). Si l'activation expire avant la fin (portefeuille très volumineux), les
    dossiers restants gardent leur bouton individuel en repli.
  - **Bug corrigé : des pièces d'urbanisme pourtant présentes dans le dossier local relié
    n'étaient pas détectées.** `verifierOffrePret()` et `verifierPiecesDossier()` limitaient
    chaque PDF lu à ses 15 premières pages — insuffisant pour un document réel de plusieurs
    dizaines de pages (ex. un DDT ou un dossier d'urbanisme scanné en un seul fichier). Le repli
    OCR (PDF scanné sans texte extractible) ne testait en plus que la 1ère page. Les deux
    fonctions partagent maintenant `lireTextePdfVerification(pdf)` (nouvelle fonction commune,
    testable — voir `tests/dossier-local.test.js`) : plafond relevé à 60 pages (aligné sur celui
    déjà retenu pour le compromis lui-même, `PLAFOND_SECURITE` dans `extraireTextesUtiles`, plutôt
    qu'un chiffre arbitraire à part), et repli OCR testé sur les 3 premières pages plutôt qu'une
    seule (même principe que le repli déjà utilisé pour la date de signature du compromis).
- **Condition suspensive d'obtention de prêt exprimée en délai (jours), sans date calendaire** :
  point resté ouvert plus haut faute d'exemple réel, corrigé une fois le texte fourni par l'étude
  (promesse réelle, clause "PROTECTION DE L'EMPRUNTEUR IMMOBILIER — CONDITION SUSPENSIVE
  D'OBTENTION DE PRÊT"). Formulation effective, différente de ce qui était anticipé : **« au plus
  tard dans les 60 jours »** — ni "délai de N jours", ni ancre explicite ("à compter de..." absent).
  Nouveau motif `reAuPlusTardDelai` dans `detecterDatesDepuisTexte()`
  (`au\s+plus\s+tard\s+dans\s+(?:les?|un\s+d[ée]lai\s+de)\s+(\d{1,3})\s*jours?`), compté depuis
  `dateCompromis` faute d'autre ancre dans la clause — même convention implicite que les ancres
  "la présente"/"ce jour" déjà acceptées par `reDelai` (la clause dit littéralement "la présente
  convention est soumise à la condition suspensive..."). Le mot "prêt" est bien dans la même
  phrase que le délai ici (contrairement à l'hypothèse de rédaction en deux phrases distinctes
  envisagée avant d'avoir le texte réel), donc `suggererEcheance()` classe correctement "pret" sans
  qu'il ait fallu élargir `extraireContexte()`. **Piège réel rencontré dans ce même document** : une
  seconde clause, quelques lignes plus loin, porte un délai distinct avec la même tournure ("au
  plus tard dans les 70 jours", pour notifier au notaire le refus/l'octroi du prêt) et le mot
  "prêt" est aussi à proximité — les deux sont donc détectés et suggérés "pret" à la fois.
  `meilleureCandidateEcheance()` (déjà en place) gère ce cas sans modification : ambiguïté signalée
  (badge "≈ estimée", les deux portant "au plus tard") mais le premier candidat par ordre
  chronologique reste retenu par défaut, qui est ici le bon (60 jours, pas 70). Voir le test de
  régression dans `tests/dates.test.js` (texte réel, boilerplate sans donnée personnelle).
- **Refonte visuelle "CLAIRE" (branche `claude/refonte-design-claire`, séparée de la branche
  principale de suivi des échéances)** : demande explicite de repenser tout le design ("éviter
  l'IA slop", "webdesign 2026", sidebar, logo, meilleure lecture/productivité), avec deux
  références fournies — une capture d'un dashboard de suivi de transactions (dont seul le langage
  visuel a été repris : cartes épurées, badges de statut colorés, navigation latérale — pas son
  domaine métier, sans rapport avec le notariat) et notiplus.com. `www.notiplus.com` est bloqué par
  le proxy réseau de cet environnement (`WebFetch` → `EGRESS_BLOCKED`) ; recherche web de repli
  utilisée à la place — Notiplus s'est révélé être **un concurrent direct** ("L'espace notarial
  tout-en-un") : suivi de dossier avec échéances/prochaines étapes toujours visibles, relances
  automatiques "qui savent s'arrêter d'elles-mêmes" (même principe que le correctif
  `relancerSiOffreManquante()`/`etaitRecue` ci-dessus, découvert indépendamment), portail
  multi-intervenants, collecte de pièces par questionnaires adaptatifs, gestion multi-office. Seule
  l'organisation de l'information (clarté sur "quoi faire et quand") a servi d'inspiration pour le
  nouveau tableau de bord ci-dessous — le portail client, la collecte de pièces par questionnaire
  et le multi-office n'ont pas été ajoutés : ce sont des fonctionnalités serveur/multi-utilisateur,
  hors du périmètre volontairement local et sans backend de l'outil (voir contraintes
  fondamentales n°1 et l'historique "décision explicite de rester en local" plus haut) — à
  reconsidérer seulement si l'étude le demande explicitement, pas déduit d'une inspiration
  concurrentielle.
  - **Nom "CLAIRE"** choisi pour l'UI (voir note en tête de ce document) : évoque la clarté sur
    l'état de chaque dossier, cohérent avec le tableau de bord ajouté. Nouveau logo
    (`icone.svg`) : anneau ouvert (lettre "C" stylisée / aperture) avec un marqueur plein à
    l'ouverture, une seule couleur d'accent sur une tuile graphite — délibérément plat et
    géométrique (pas de dégradé, pas d'effet glossy/3D) pour éviter l'esthétique "IA générique".
    Repris en inline dans la sidebar (`index.html`) en plus du fichier `.svg` (favicon/PWA), avec
    une version teintée pour le mode sombre (`#5B9DF9`, même token `--focus` que le reste de
    l'accent bleu) plutôt qu'une seconde couleur inventée.
  - **Navigation en sidebar** (`.sidebar`, `index.html`/`style.css`) remplace l'ancien bandeau
    `header.page` + onglets horizontaux (`.app-tabs`, code CSS mort supprimé). Un **troisième
    espace de travail "Tableau de bord"** s'ajoute aux deux existants (`definirOnglet()` accepte
    maintenant `'dashboard'` en plus de `'nouveau'`/`'suivi'`, et devient l'onglet par défaut à
    l'ouverture — un outil de suivi de dossiers doit ouvrir sur une vue d'ensemble, pas sur le
    formulaire de création). Sidebar repliable en dessous de 900px (`toggleSidebarMobile()`,
    bouton "☰" + scrim), fermée automatiquement à chaque changement d'onglet.
  - **Tableau de bord** (`onglet-dashboard`) : reprend le principe demandé ("statut d'avancement,
    actions urgentes, KPI, présentation claire et épurée") sans dupliquer de logique existante :
    - `calculerStatsPortefeuille()` (nouvelle fonction, extraite de l'ancien `renderStatsSuivi()`)
      centralise les chiffres du portefeuille ; `renderStatsSuivi()` (bandeau de l'onglet Suivi) et
      `renderKpisDashboard()` (5 tuiles du tableau de bord, avec en plus les dossiers à pièces
      manquantes) l'utilisent tous les deux — un seul calcul, deux présentations.
    - `renderActionsUrgentes()` liste les dossiers en "blocage" ou de score `calculerPriorite()`
      élevé (même seuil `SEUIL_PRIORITE_ELEVEE` que le badge "🔥 Prioritaire" déjà utilisé sur les
      résumés du Suivi — un seul critère d'urgence dans tout l'outil). Chaque ligne
      (`ouvrirDossierDepuisDashboard()`) bascule vers le Suivi et déplie directement la carte
      concernée (même mécanisme `dossiersDeplies` que le dépliage manuel).
    - Le widget "Échéances des 7 prochains jours" (`renderDashboard()`, déjà existant) est
      simplement déplacé de l'onglet Suivi vers le Tableau de bord, sans changement de logique —
      c'est un widget d'aperçu, sa place naturelle est sur la vue d'ensemble.
  - **Typographie** : Fraunces (serif éditoriale) ajoutée pour les titres (`h1`/`h2`/`h3`, marque
    "CLAIRE", nom de dossier, en-tête du panneau "Nouveau dossier") en remplacement de Poppins
    (abandonnée, plus chargée dans `index.html`) ; le reste de l'interface (boutons, tableaux,
    badges, formulaires) reste en Inter — la retouche vise un peu de caractère sur les titres, pas
    une refonte totale de la lecture dense de l'outil.
  - **Bug corrigé en cours de route** : `appliquerTheme()` écrivait l'emoji du bouton de thème via
    `textContent`, ce qui écrasait le libellé "Mode sombre"/"Mode clair" ajouté à côté de l'icône
    dans la sidebar (le bouton n'affichait plus que l'emoji seul). Remplacé par `innerHTML` avec la
    même structure icône+libellé que les autres liens de la sidebar.
  - Palette et tokens CSS (`--focus`, catégories `--pret`/`--acte`/`--ventebien`, mode sombre gris
    neutre) **non retouchés** : la refonte porte sur la structure (sidebar, tableau de bord) et la
    typographie, pas sur les couleurs déjà validées par l'étude lors de la précédente refonte
    visuelle (voir plus haut) — aucune raison de les changer, et le bleu existant se prêtait déjà
    bien au nouveau logo.
- **Nouvelle série de retours de l'étude après la refonte visuelle, traités indépendamment** :
  - **Condition de prêt à délai : le motif "au plus tard dans les 70 jours" (notification du
    prêteur au notaire) ne doit plus être détecté comme une échéance, seul le "60 jours" (condition
    suspensive elle-même) doit l'être.** Avant ce correctif, `meilleureCandidateEcheance()` gérait
    déjà l'ambiguïté entre les deux (badge "≈ estimée") mais l'étude a demandé plus simple : ne
    détecter que la bonne clause. `reAuPlusTardDelai` regarde maintenant les 200 caractères
    précédant chaque occurrence et ignore le délai si "notifier"/"notification" y apparaît — ces mots
    sont propres à la clause de notification, absents de la clause de condition suspensive
    elle-même. Test réécrit dans `tests/dates.test.js` : une seule date détectée (60 jours), plus
    d'ambiguïté à signaler pour ce cas précis.
  - **Auto-sélection du type de vente "copropriété"** : `detecterTypeVenteCopropriete(texte)`
    (nouveau `COPROPRIETE_RE`) reconnaît "lot de copropriété", "syndicat des copropriétaires",
    "règlement de copropriété", "loi du 10 juillet 1965" dans le texte importé. Si détecté,
    `traiterTexte()` force `#f-type-vente` sur "copropriete" — évite de laisser "Maison" par défaut
    (donc la mauvaise checklist de pièces, voir la checklist de pièces plus haut) sur un dossier de
    copropriété manifeste. Reste modifiable manuellement ensuite (`changerTypeVente()`), comme
    n'importe quelle détection automatique de l'outil.
  - **Section "Envoyer un rappel" masquée quand il n'y a pas de condition de prêt** : demandé par
    l'étude — relancer une échéance de prêt qui n'existe pas pour ce dossier n'a pas de sens.
    `toggleEcheance('pret', actif)` appelle maintenant `majVisibiliteRappels()`, qui bascule
    `display` sur `#rappel-fieldset` (nouvel id) selon `echeanceActive.pret`. `ajouterDossier()`
    n'enregistre `reminderDays` que si le prêt est actif (`[]` sinon) — cohérent avec le champ
    masqué à l'écran, pas de rappels fantômes programmés pour un dossier sans prêt.
  - **Détection de l'email de l'acquéreur dans le texte du compromis**, pour préremplir le champ
    "Email de l'acquéreur (pour relance prêt)" sans ressaisie manuelle. `detecterEmailAcquereur(texte)`
    (nouveau `EMAIL_RE`) cherche une adresse email dans le voisinage du rôle acquéreur/bénéficiaire
    (`RE_ROLE_ACQUEREUR`), avec un remontée arrière bornée à la phrase précédente (s'arrête au
    premier point rencontré, plafonnée à 150 caractères — même principe que `extraireContexte()`)
    pour éviter de capturer l'email du vendeur cité plus haut dans un document à deux parties.
    N'écrase jamais une valeur déjà saisie à la main dans `#f-email-acquereur`.
  - **Wizard porté de 3 à 4 étapes : Importer → Vérifier → Analyse juridique → Finaliser.**
    L'analyse juridique (conditions suspensives, engagements du vendeur, documents identifiés)
    quittait sa position "collée" au visualiseur PDF (voir plus haut, "Analyse juridique ancrée")
    pour devenir une étape à part entière du wizard, sur demande de l'étude — plus simple à situer
    qu'un onglet à bascule dans l'aside. `afficherAnalyseJuridique()` simplifiée : elle ne fait plus
    que peupler `#wizard-step-3` (montrer/masquer `#analyse-vide-etat` et les trois
    `#analyse-section-*`), sans plus jamais toucher à un système d'onglets — `vuePdfViewerActuelle`,
    `analyseJuridiqueDisponible` et `definirVuePdfViewer()` supprimés, devenus inutiles.
    `#pdf-viewer` (aside) est réduit à l'aperçu PDF seul. `definirEtapeWizard(n)` gère maintenant 4
    étapes (boucle `<= 4`, `majApercuPieces()` déclenché à `n === 4`) ; toujours **aucune étape
    verrouillée**, principe déjà établi conservé à l'identique. **Deux bugs corrigés pendant la
    vérification visuelle** (Playwright, capture d'écran après chaque étape — seule méthode fiable
    pour ce genre de restructuration DOM, voir "Comment tester" ci-dessous) : l'état vide de
    l'étape 3 ("Aucune analyse disponible") ne s'affichait pas au premier chargement, faute d'appel
    initial à `afficherAnalyseJuridique()` (ajouté dans la séquence d'init, après `renderChips()`) ;
    la section "Documents et pièces identifiés" n'avait pas d'`id` propre et restait affichée vide
    même sans analyse (ajout de `id="analyse-section-documents"`, géré comme les deux autres
    sections dans les deux branches de `afficherAnalyseJuridique()`).
- **Réorganisation de la fiche dossier (onglet Suivi)**, sur retour détaillé de l'étude (ordre des
  informations, actions mal placées, email de l'office affiché sans besoin) :
  - **Badge de statut avant le nom** (au lieu d'après, sur sa propre ligne) : `renderBadgeStatut(d)`
    déplacé à l'intérieur du `<span class="nom-affichage">`, avant `.nom-texte`, dans les trois
    endroits qui affichent un nom de dossier (`renderCarteDossier`, `renderCarteCompacte`,
    `renderLigneTableau`) — cohérence entre résumé et fiche dépliée. `.badge-statut` passe de
    `margin-left` à `margin-right` en conséquence (seul usage de cette règle dans tout l'outil).
  - **"Lier un dossier local" / "Changer de dossier" à côté du nom**, plutôt que plus bas dans
    `.offre-pret-ligne` : nouvelle variable `boutonsDossierLocal` calculée une fois en tête de
    `renderCarteDossier()`, insérée juste après le `<span class="nom-edition">`. `.offre-pret-ligne`
    ne garde que ce qui concerne spécifiquement l'offre de prêt (badge + "Revérifier") et le lien
    "reconfirmer l'accès" — cohérent avec son nom.
  - **Email de rappel de l'office retiré de l'affichage carte/tableau** (`d.email`, le champ
    "Email de rappel" du formulaire — pas l'email de l'acquéreur) : simple métadonnée technique
    utilisée comme adresse `to:` par `ouvrirEmailRappel()`, sans intérêt à afficher sur chaque
    fiche/carte/ligne de tableau. La donnée reste stockée et utilisée, seul son affichage disparaît.
  - **Responsable / Type de vente / Rôle du notaire sur une seule ligne** : déjà groupés dans un
    même `<div class="dossier-classification">`, mais chaque `<select class="select-edit">`
    héritait malgré tout de `width: 100%` depuis la règle générique `select { width: 100% }`
    (ajoutée pour les champs du formulaire, voir plus haut) — cette dernière ne fixe cette propriété
    nulle part que `.select-edit` puisse écraser, donc chaque champ prenait toute la largeur
    disponible et retombait à la ligne. Corrigé en réinitialisant explicitement `width: auto` (et
    `max-width`/`min-width`/`display`) dans `.select-edit`. Au passage, le libellé "Rôle" devient
    "Rôle du notaire" (demandé explicitement, pour éviter toute ambiguïté avec un futur "rôle" côté
    acquéreur/vendeur).
  - **Fiche dépliée en deux colonnes** (`div.dossier-body`, grid CSS `2fr / minmax(220px,1fr)`,
    empilée en une colonne sous 720px) : colonne principale = échéances (`.tabs`), pièces du
    dossier, analyse juridique ; colonne latérale = historique puis, dessous, les trois boutons
    d'action (`Télécharger les rappels`, `Envoyer un rappel par email`, `Télécharger la fiche`),
    déplacés depuis leur ancienne position juste sous les échéances. Reprend la demande "passer les
    cartes dossier ouverte en deux colonnes" en profitant de la largeur disponible (les fiches ne
    sont plus contraintes à `.wrap` 680px depuis l'introduction de l'onglet Suivi pleine largeur,
    voir plus haut). Les surcharges existantes pour le détail compact (`.ligne-detail .dossier`,
    `.mini-carte.ouverte .mini-carte-detail .dossier`) n'ont pas eu besoin d'être retouchées : elles
    ciblent des classes internes inchangées (`.tabs`, `.dossier-actions`...), pas la structure des
    colonnes elle-même. Impression (`window.print()`, pas `imprimerFiche()`) repassée en un seul
    bloc via `.dossier-body { display: block }` dans `@media print` — une mise en page à deux
    colonnes n'a pas de sens sur une feuille A4 imprimée dossier par dossier.
- **Registre partagé pris en compte par "Reconfirmer tous les accès" et popup au démarrage**,
  signalé par l'étude : le bouton groupé (voir plus haut, introduit pour éviter 60 clics
  individuels) ne couvrait que les dossiers locaux reliés, jamais le fichier réseau partagé — si sa
  permission expirait, rien ne le signalait ni ne permettait de la reconfirmer autrement qu'en
  rouvrant manuellement le sélecteur de fichier.
  - `obtenirHandlePartage()` alimente maintenant `registrePartageAccesAReconfirmer` (nouvel état,
    même rôle que `d.accesAReconfirmer` par dossier) à chaque vérification de permission, qu'elle
    soit silencieuse (relecture périodique, reconnexion au démarrage) ou déclenchée par un clic.
    `renderAlerteAcces()` et `reconfirmerTousLesAcces()` l'incluent désormais aux côtés des
    dossiers locaux (message commun factorisé dans `messageAccesAReconfirmer()`, qui ne mentionne
    que ce qui est réellement concerné — dossiers seuls, registre seul, ou les deux).
  - **Popup au démarrage** (`#popup-acces-overlay`, même structure que `#confirm-overlay` — voir
    `demanderConfirmation()`) plutôt que de compter sur le collaborateur pour remarquer le bandeau
    `#alerte-acces`, qui n'existe que dans l'onglet "Suivi des dossiers" : si l'outil s'ouvre sur le
    tableau de bord (onglet par défaut), un accès perdu pouvait rester invisible jusqu'à ce qu'on
    change d'onglet. `afficherPopupAccesSiNecessaire()` est appelée une fois que `charger()`,
    `revérifierDossiersLiesAuDemarrage()` et `tenterReconnexionPartage()` ont tous fini (désormais
    enchaînés avec `await` plutôt que lancés sans attendre) — pas de popup prématurée avant de
    savoir si un accès est réellement perdu. Bouton "Reconfirmer maintenant" (clic explicite,
    requis par le navigateur pour qu'une demande de permission fichier aboutisse) ou "Plus tard"
    (ferme la popup sans rien changer ; le bandeau reste disponible ensuite dans l'onglet Suivi).
- **Sidebar "verre" (profondeur, couleur, ombre)**, demandé explicitement pour casser l'aplat de
  la première version de la sidebar (simple `--paper-card` + bordure droite). Nouveaux tokens
  `--sidebar-bg` (dégradé diagonal légèrement teinté de bleu, pas un à-plat), `--sidebar-border`,
  `--sidebar-shadow`, `--sidebar-highlight` (liseré clair en tête de panneau), déclinés clair/sombre
  comme les autres tokens de thème.
  - `.sidebar` : `background: var(--sidebar-bg)` + `backdrop-filter: blur(20px) saturate(160%)` +
    `box-shadow: var(--sidebar-shadow)` + un `::before` en liseré de lumière horizontal en haut du
    panneau. Le flou n'a d'effet visuel réel qu'en mobile (`@media 900px`), seul contexte où la
    sidebar passe en overlay `position: fixed` par-dessus le contenu qui défile dessous — en
    desktop, en flux normal, rien ne se trouve derrière elle, mais le déclarer ne coûte rien et
    prépare le terrain si la mise en page venait à changer.
  - **Lien actif en "pilule de verre"** plutôt qu'un aplat `--focus` uni : dégradé diagonal
    `--focus` → `--focus-hover`, ombre portée teintée bleue + liseré clair interne
    (`inset 0 1px 0 rgba(255,255,255,0.3)`) pour simuler un reflet. Reste dans la même famille de
    bleu que les autres accents (`--focus`/`--focus-hover`), donc lisible dans les deux thèmes sans
    couleur inventée pour l'occasion.
  - Bouton burger (mobile) aligné sur le même traitement (`--sidebar-bg` + flou), cohérent avec le
    panneau qu'il ouvre plutôt qu'un simple bouton `--paper-card` plat comme avant.
- **Extraction de l'adresse du bien et du prix de vente** (`detecterAdresseBien`/`detecterPrixVente`,
  premier jet — comme `PIECES_*` en leur temps, pas encore confronté à beaucoup de vrais compromis
  autres que ceux déjà vus pour les dates/engagements) :
  - `ADRESSE_BIEN_RE` s'ancre sur un code postal français (5 chiffres, marqueur fiable et rare
    ailleurs dans l'acte) précédé de "sis(e) à/au" ou "situé(e) à/au/dans la commune de" — tournures
    notariales courantes pour introduire la désignation du bien. Capture le fragment jusqu'au code
    postal puis un peu après (la ville), borné à la phrase courante comme les autres détecteurs du
    fichier. N'écrase jamais une valeur déjà saisie (même logique que l'email de l'acquéreur).
  - `PRIX_VENTE_RE` s'appuie sur un usage notarial quasi systématique : le montant écrit en lettres
    est répété en chiffres entre parenthèses juste après ("CENT MILLE EUROS (100 000 €)") — bien
    plus fiable à parser que le nombre en toutes lettres. Cherche "prix" puis, dans la même clause
    (jusqu'à 120 caractères, sans dépasser un point), un montant entre parenthèses suivi de
    €/euros. Un seuil (`>= 1000`) écarte les faux positifs évidents (un numéro d'article capturé par
    erreur près du mot "prix"). Affichage via `formaterPrix()` (`Intl.NumberFormat('fr-FR', {style:
    'currency', ...})`).
  - `d.adresseBien` (texte) et `d.prixVente` (entier ou `null`) ajoutés au modèle du dossier, gérés
    dans `normaliserDossierImporte()` comme les autres champs texte/numériques. Deux nouveaux champs
    dans l'étape "Finaliser" du wizard (`#f-adresse-bien`, `#f-prix-vente`), préremplis par la
    détection mais librement modifiables — nécessaire puisque ce sont des regex non encore
    éprouvées, contrairement à des motifs déjà resserrés sur de vrais dossiers.
  - Affichés sur la fiche dossier (`renderCarteDossier`) via deux `<input class="input-inline">`
    directement éditables (`changerAdresseBien`/`changerPrixVente`, avec entrée d'historique comme
    les autres champs corrigeables) plutôt que le mécanisme crayon+validation du nom/des dates : un
    champ toujours visible en édition directe convient mieux ici, la valeur pouvant être fausse ou
    absente bien plus souvent qu'un nom de dossier saisi par l'utilisateur. **Piège de spécificité
    CSS rencontré** (même famille que celui déjà documenté pour `.select-edit`, mais inversé) : la
    règle générique `input[type="text"], ... { width: 100%; ... }` (élément + attribut) a une
    spécificité plus élevée qu'une simple classe (`.input-inline` seule perdait sur width **et**
    tout le reste — bordure, fond, padding — pas seulement la largeur comme pour `.select-edit`, où
    la règle concurrente `select { ... }` n'est qu'un sélecteur de type, plus faible qu'une classe).
    Corrigé en préfixant `input.input-inline`/`input.champ-adresse-bien`/`input.champ-prix-vente`
    (élément + classe) pour au moins égaler cette spécificité, l'ordre dans la feuille de style
    tranchant ensuite en leur faveur. À vérifier avant tout nouveau champ `<input>` stylé
    "discrètement" sur une fiche dossier : un simple sélecteur de classe ne suffit pas forcément.
- **Apport estimé une fois l'offre de prêt reçue** (montant du prêt comparé au prix de vente) :
  - `detecterMontantPret(texte)` (nouveau `MONTANT_PRET_RE`) lit le montant emprunté directement
    dans le texte de l'**offre de prêt**, pas le compromis — même heuristique que `PRIX_VENTE_RE`
    (le montant en lettres est répété en chiffres entre parenthèses, usage constant des
    établissements prêteurs), ancrée sur "montant du prêt"/"capital emprunté"/"somme prêtée" plutôt
    que "prix". Appelé dans `verifierOffrePret()` sur le même texte déjà lu pour reconnaître l'offre
    elle-même (`OFFRE_PRET_RE`) — pas de second passage de lecture/OCR pour ça. N'écrase jamais une
    valeur déjà connue par un échec de détection (`d.montantPret` conservé si `detecterMontantPret`
    ne trouve rien lors d'une revérification ultérieure).
  - `d.montantPret` (entier ou `null`) ajouté au modèle du dossier — comme `offrePretStatut`, dérivé
    d'un PDF local et jamais importé tel quel d'une autre machine (`normaliserDossierImporte()` le
    remet à `null`, à revérifier sur ce poste).
  - `calculerApport(d)` (testable, voir `tests/divers.test.js`) : `montant = prixVente -
    montantPret`, `pourcentage = montant / prixVente` — volontairement simple (ne compte pas les
    frais de notaire ni les coûts annexes), purement informatif, aucune règle métier derrière.
    Trois niveaux réutilisant des couleurs déjà réservées ailleurs (aucune couleur inventée) :
    `success` (apport ≥ 10 %), `pret`/amber (apport positif mais < 10 %, à surveiller — même amber
    que "offre introuvable"), `urgent` (apport négatif, le prêt dépasse le prix). Affiché sur la
    fiche dossier (`renderCarteDossier`) sous forme d'un petit cercle coloré (`.apport-cercle`) +
    texte, uniquement si `!d.sansPret && d.offrePretStatut === 'recue'` et que prix/montant sont
    tous les deux connus — pas affiché tant que l'offre n'a pas été confirmée reçue (cohérent avec
    la demande initiale : comparer "lors de la réception de l'offre").
- **Bouton "🔍 Comparer au prix du marché" : ajouté puis retiré.** Implémenté pour situer le prix
  du bien par rapport au marché local (recherche web généraliste sur l'adresse seule, ouverte dans
  un nouvel onglet sur clic explicite — jamais le nom du dossier ni l'identité des parties). Retiré
  entièrement (`comparerPrixMarche()` et le bouton associé supprimés) après test en conditions
  réelles par l'étude : "ça ne me plaît pas". **Ne pas réimplémenter sans nouvelle demande
  explicite.** Le calcul de l'apport (`calculerApport()`, montant du prêt comparé au prix), lui,
  reste en place — seule la comparaison au marché externe a été retirée, ce sont deux
  fonctionnalités distinctes.
- **Série de correctifs remontés par l'étude après un test approfondi en conditions réelles**
  (dossier téléchargé depuis GitHub et ouvert en local, pas seulement l'aperçu) :
  - **Bug corrigé : une vraie copropriété restait classée "maison" par défaut.** `COPROPRIETE_RE`
    ne reconnaissait pas la formulation la plus courante dans les faits — "soumis au régime de la
    copropriété", juste avant la mention du lot sous le tableau parcellaire — seul "statut de la
    copropriété" l'était. Motif "régime de la copropriété" ajouté. Voir le test de régression dans
    `tests/dates.test.js`.
  - **Bug corrigé : "Reconfirmer tous les accès" redemandait malgré tout dossier par dossier**,
    contrairement à l'intention du bouton groupé. Cause réelle : la version précédente demandait la
    permission d'UN dossier PUIS lisait aussitôt tous ses PDF (potentiellement plusieurs secondes,
    OCR compris) avant de passer au suivant — largement de quoi épuiser la fenêtre de "user
    activation" du clic d'origine (qui expire en quelques secondes), après quoi Chrome refuse
    silencieusement les `requestPermission()` suivants, chacun nécessitant alors un nouveau clic.
    `reconfirmerTousLesAcces()` sépare maintenant strictement les deux phases : (1) demander toutes
    les permissions à la suite, sans rien faire d'autre entre deux, puis (2) lire les PDF de ce qui
    a été accordé, qui peut prendre tout le temps voulu une fois la permission acquise.
  - **`statutDossier()` vérifié sur le cas "offre reçue + toutes les pièces reçues" → repasse bien
    en "prêt"** (voir le nouveau test dans `tests/divers.test.js`) : la logique était déjà correcte
    une fois isolée — le blocage observé en conditions réelles était très probablement dû à la
    mauvaise classification du type de vente ci-dessus (des pièces de copropriété jamais
    trouvables sur une vraie maison), pas à un bug de `statutDossier()` lui-même.
  - **Bug corrigé : le tab "Obtention du prêt" affichait "Échéance dépassée" même une fois l'offre
    confirmée reçue**, ce qui donnait l'impression trompeuse d'un retard sur une condition pourtant
    résolue. `renderTab()` accepte un nouveau paramètre `offrePretRecue` (passé uniquement pour le
    tab "pret") qui remplace alors l'affichage par "✓ Offre reçue" (`--success`), sans toucher au
    calcul du compteur pour les autres tabs.
  - **Un dossier entièrement complet (offre reçue + toutes les pièces) n'est plus rescanné
    automatiquement** (`dossierEntierementComplet()`) : `revérifierDossiersLiesAuDemarrage()`
    (démarrage + minuteur 5 min) saute désormais ces dossiers — inutile de relire des dizaines de
    PDF pour un dossier qui n'a plus rien à apprendre. Un clic explicite sur "Revérifier" continue
    de fonctionner sur un dossier déjà complet (l'étude peut vouloir confirmer après un doute, ou
    un fichier a pu être retiré du dossier local entre-temps).
  - **Icônes des tuiles KPI "échéances ≤ 7/15 jours" unifiées** : un même petit calendrier SVG
    dessiné à la main (`iconeCalendrierSeuil()`), avec le seuil (7 ou 15) inscrit dans le corps du
    calendrier, remplace les deux emojis différents (⏱️/📅) sans lien visuel entre eux. **Piège
    rencontré** : un premier essai superposait juste le chiffre en surimpression sur l'emoji 📅
    natif — celui-ci porte déjà son propre numéro de jour selon la plateforme (souvent "17" sur
    Chrome/Noto), ce qui produisait un rendu illisible ("177"). Un vrai SVG (rectangle + attaches +
    `<text>`) résout le problème en donnant un contrôle total sur ce qui s'affiche.
  - **Bouton mode sombre réduit à l'icône seule** (plus de texte "Mode sombre"/"Mode clair" à côté)
    — le libellé accessible reste porté par `aria-label`/`title`, pas visible à l'écran.
    `.sidebar-link-icone-seule` centre l'icône plutôt que la laisser plaquée à gauche d'une rangée
    sinon vide.
  - **Bug corrigé : taille de police incohérente sur la ligne "Responsable : ... · Type de vente :
    ... · Rôle du notaire : ..."** — le texte (`.dossier-head .addr`, 13.5px) et les `<select>`
    (`.select-edit`, 13px) différaient de 0.5px, rendant la ligne visuellement inégale. Alignés à
    13.5px (`.select-edit` et `.input-inline`, ce dernier pour l'adresse/le prix par cohérence).
  - **Badge "🔥 Prioritaire" réduit à l'emoji seul** (le texte reste en `title`, pas affiché) —
    demandé pour alléger la ligne de tableau.
  - **Vue "Cartes" retirée entièrement** du Suivi ("je préfère la vue tableau, la vue carte, ça ne
    va pas") : bouton de bascule Cartes/Tableau, `renderCarteCompacte()`/`toggleCarteCompacte()`,
    `.cartes-grid`/`.mini-carte*` supprimés. Le tableau (`renderLigneTableau()`) est désormais la
    seule vue de la liste des dossiers — les surcharges CSS du détail compact (`.ligne-detail ...`)
    ont perdu leur pendant `.mini-carte.ouverte ...` associé, simplifiées en conséquence.
  - **Clause "en cas de demande de visite" exclue des engagements du vendeur** : cette clause
    standard sur l'organisation de visites du bien avant la vente ressortait à tort comme une
    obligation à réclamer après coup. Ajoutée à `EXCLUSION_ENGAGEMENT_RE`.
  - **Cliquer sur une pièce reçue (ou l'offre de prêt reçue) rouvre directement le fichier local où
    elle a été trouvée**, plutôt que de se contenter d'un badge sans rien derrière.
    `verifierOffrePret()`/`verifierPiecesDossier()` conservent désormais le `FileSystemFileHandle`
    du fichier trouvé (même mécanisme IndexedDB que le handle du dossier local lui-même —
    `enregistrerHandle`/`recupererHandle` acceptent n'importe quelle chaîne comme clé), sous
    `${id}::offre` ou `${id}::piece::${cle}` (`CLE_HANDLE_OFFRE`/`CLE_HANDLE_PIECE`).
    `ouvrirFichierTrouve()` (via `ouvrirPieceTrouvee()`/`ouvrirOffreTrouvee()`) récupère ce handle,
    revérifie la permission et ouvre le fichier dans un nouvel onglet (`URL.createObjectURL`). Un
    fichier détecté avant l'ajout de cette fonctionnalité n'a pas de handle mémorisé : message
    clair invitant à cliquer sur "Revérifier" plutôt qu'un échec silencieux. La pastille "reçue"
    devient un vrai `<button>` (reset des styles natifs pour garder l'apparence d'un badge) ; les
    autres statuts (manquante/inconnu) restent un simple `<span>`, rien à ouvrir.
  - **Indicateur visuel pendant la recherche dans le dossier local** : les boutons "Revérifier"
    (offre) et "Revérifier les pièces" passaient jusque-là de leur état initial au résultat final
    sans aucun signe intermédiaire, ce qui pouvait laisser croire à un clic sans effet sur un
    dossier volumineux (beaucoup de PDF, repli OCR). `verifierOffrePretDepuisBouton()`/
    `verifierPiecesDossierDepuisBouton()` désactivent le bouton et changent son texte
    ("⏳ Recherche…") de façon synchrone avant l'appel asynchrone — `render()` (déjà appelé dans
    tous les chemins de retour de `verifierOffrePret`/`verifierPiecesDossier`) remplace ensuite ce
    bouton par un rendu à jour, pas besoin de restaurer son texte d'origine à la main.
  - **Investigué et volontairement non implémenté : rendre cliquable le numéro de page de l'analyse
    juridique pour un dossier déjà enregistré et rouvert.** Ça ne peut fonctionner que pendant
    l'import (PDF encore en mémoire, voir `voirDateDansPdf()`/`allerALaPageDuPdf()` ci-dessus), pas
    après enregistrement : le compromis est importé via un simple `<input type="file">` (`#f-pdf`),
    qui ne fournit qu'un `File` éphémère, pas un `FileSystemFileHandle` persistable comme pour un
    dossier local relié. Rendre ça possible demanderait de basculer l'import du compromis sur
    `showOpenFilePicker()` (avec repli sur `<input type="file">` pour les navigateurs qui ne le
    supportent pas — Firefox, Safari), de conserver le handle obtenu sous une clé dérivée de l'id
    du dossier une fois celui-ci créé (le picker s'ouvre avant que l'id existe), et d'étendre le
    mécanisme de reconfirmation d'accès déjà en place pour les dossiers locaux/le registre partagé
    à cette troisième catégorie de handle. Changement non trivial sur un chemin d'import critique et
    déjà largement testé (OCR, détection de dates, frontières de pages...) — pas engagé sans une
    demande explicite, mais la voie est balisée ici si l'étude la souhaite.
  - **Bug corrigé, en creusant le point précédent : le bouton "👁 p.X" d'un engagement du vendeur ne
    ramenait jamais dans le PDF, même pendant l'import lui-même** (l'étude a précisé viser ce cas,
    pas seulement le cas "dossier rouvert" ci-dessus). Cause réelle, sans rapport avec le
    `<input type="file">` : dans `traiterFichierPdf()`, `traiterTexte()` (qui calcule l'analyse
    juridique et appelle `afficherAnalyseJuridique()` pour l'afficher) s'exécute **avant** que
    `pdfActuel = pdf` soit renseigné plus bas dans la même fonction — chaque `renderEngagement()`
    évaluait donc `pdfActuel` comme encore `null` (ou l'ancienne valeur) et retombait sur le simple
    numéro de page non cliquable, sans jamais se remettre à jour ensuite (rien d'autre ne
    re-render l'analyse après coup). Un second appel à `afficherAnalyseJuridique()` ajouté juste
    après que `pdfActuel`/`pdfDernierePageUtile` sont connus régénère l'analyse déjà calculée avec
    les bons boutons — appel sans risque, `afficherAnalyseJuridique()` est un simple rendu piloté
    par `analyseJuridiqueActuelle`, sans effet de bord à dupliquer.
  - **Corrigé au passage : `renderEngagement()` cherchait à surligner la phrase de l'engagement
    dans le PDF en réutilisant `voirDateDansPdf()`**, conçue pour une date courte (elle cherche le
    dernier "mot" du texte fourni — l'année, un ancrage fiable). Appliqué à une clause de texte
    libre tronquée à 80 caractères, le "dernier mot" tombe au hasard (souvent un mot coupé en plein
    milieu) et ne se retrouve presque jamais tel quel sur la page — la recherche échouait
    silencieusement à chaque fois. L'échappement de la phrase pour l'attribut `onclick`
    (`phrase.replace(/'/g, "\\'").slice(0, 80)`, tronqué **après** l'échappement) risquait aussi de
    couper un `\'` en deux, produisant un attribut malformé. Nouvelle fonction dédiée
    `allerALaPageDuPdf(numeroPage)` : fait uniquement défiler jusqu'à la page, sans tenter de
    surligner un passage précis ni interpoler la phrase dans l'attribut — plus simple, plus fiable,
    et le seul besoin réel exprimé ("m'amener sur la bonne page").
  - **Non vérifié en conditions réelles dans cet environnement** : `pdf.js`/`tesseract.js`
    (cdnjs.cloudflare.com / cdn.jsdelivr.net) sont bloqués par le proxy réseau de cet environnement
    de développement (`ERR_TUNNEL_CONNECTION_FAILED`), empêchant tout import réel de PDF pendant le
    développement — d'où l'absence de test Playwright de bout en bout pour ce correctif précis
    (contrairement aux vérifications visuelles habituelles). Fondé sur une lecture attentive du
    code (ordre d'exécution confirmé ligne par ligne) et sur la suite `npm test` (101 tests, tous
    verts) plutôt que sur un import réel — à confirmer par l'étude en conditions réelles.
- **Décision explicite avant merge dans `main` : les dates butoir (prêt/acte/vente) ne doivent
  jamais être puisées dans les annexes, uniquement dans l'avant-contrat lui-même (compromis,
  promesse).** `estDebutPageAnnexe()` (voir `extraireTextesUtiles()` plus haut, qui l'utilise pour
  isoler le texte du compromis avant toute détection de dates) ne reconnaissait qu'un renvoi
  explicite « Annexe n°1 » (chiffre obligatoire) — insuffisant pour deux formulations réelles
  fréquentes : une page "ANNEXES" servant de simple intercalaire sans numéro, et une pièce jointe
  qui n'a même pas de renvoi "annexe" et ne se reconnaît qu'à son propre titre de document (DPE,
  ERP, plan cadastral, règlement de copropriété, procès-verbal d'AG, certificat d'urbanisme, état
  daté...). `RE_DEBUT_ANNEXE` reconnaît maintenant "annexe(s)" avec ou sans numéro ainsi que
  "pièce(s) annexe(s)" ; `RE_TITRE_PIECE_JOINTE` (ancrée en tout début de texte de page) reconnaît
  les titres de documents joints les plus courants. Les deux gardent le même garde-fou déjà en
  place (mention dans les 120 premiers caractères de la page, ou page globalement courte — scan
  avec peu de texte extractible) pour ne pas se déclencher sur une simple mention en passant dans
  une clause du corps de l'acte (voir le test de régression LD Notaires, toujours vert). Comme la
  détection de dates ne tourne que sur le texte jusqu'à `dernierePageUtile` (voir
  `traiterFichierPdf()`), toute page ainsi reconnue comme début d'annexe — et tout ce qui suit —
  est désormais exclue de la détection des dates butoir, pas seulement de l'aperçu PDF.
- **Série de retours de l'étude après un nouveau test réel (une vraie promesse de vente
  téléchargée, ouverte en local)**, traités indépendamment :
  - **Bug corrigé : une vraie maison individuelle ressortait classée "copropriété".**
    `COPROPRIETE_RE` se déclenchait sur une clause de négation standard, ajoutée précisément pour
    lever toute ambiguïté sur une maison — « Le bien vendu n'est pas soumis au statut de la
    copropriété » — qui contient elle-même le motif recherché (statut/régime de la copropriété).
    Renseignement pris sur la différence de désignation notariale entre les deux : une copropriété
    décrit toujours le bien par un numéro de LOT et une quote-part de parties communes (tantièmes/
    millièmes), qu'une maison individuelle n'a ni l'un ni l'autre — d'où les motifs positifs déjà
    en place (lot de copropriété, syndicat des copropriétaires, état descriptif de division...),
    qui restaient corrects en soi. `detecterTypeVenteCopropriete()` (nouveau `NEGATION_COPROPRIETE_RE`)
    vérifie maintenant, pour CHAQUE occurrence de `COPROPRIETE_RE` prise séparément (plus un simple
    `.test()` global), qu'elle n'est pas précédée d'une formule de négation (« n'est pas soumis »,
    « ne relève pas », « à l'exclusion du statut »...) dans les 60 caractères qui la précèdent —
    une seconde occurrence non niée dans le même texte reste positive (cas d'un lotissement dont
    seuls les espaces verts sont hors copropriété, mais dont un lot est bien en copropriété).
  - **Bug corrigé : le nom de dossier d'une promesse ressortait "NOM / NOM"**, avec deux fois le
    nom du bénéficiaire. Cause : `detecterNomDossier()` ne gérait bien que le style "en-tête" (« LE
    PROMETTANT : M. X né le... ») où le nom suit le mot-clé de rôle — le bloc du promettant était
    alors borné par le PROCHAIN "ci-après dénommé" rencontré dans le texte pour savoir où
    s'arrêter. Sur une vraie promesse, seul le style "étiquette finale" était utilisé (« M. X né
    le ..., ci-après dénommé le PROMETTANT » — le nom vient AVANT le mot-clé, sans bloc "en-tête"
    séparé) : le "prochain ci-après dénommé" rencontré était alors celui du BÉNÉFICIAIRE lui-même,
    et le bloc avalait donc sa présentation à la place de celle du promettant. `detecterNomDossier()`
    reconnaît maintenant ce style dès la première occurrence du mot-clé de rôle (réutilise
    `estStyleLabelEntreGuillemets`, voir juste en dessous) et va chercher le nom directement en
    arrière dans ce cas, sans passer par le découpage en bloc qui causait le problème. Format
    résultant inchangé et déjà correct par construction : `RE_ROLE_VENDEUR`/`RE_ROLE_ACQUEREUR`
    reconnaissent déjà "promettant"/"bénéficiaire" en plus de "vendeur"/"acquéreur", donc l'ordre
    obtenu est bien PROMETTANT / BÉNÉFICIAIRE pour une promesse (comme VENDEUR / ACQUÉREUR pour un
    compromis) — demandé explicitement par l'étude, sans qu'aucun changement de format n'ait été
    nécessaire, seulement ce correctif d'extraction.
  - **Bug corrigé au passage : `estStyleLabelEntreGuillemets()` ne reconnaissait que le style AVEC
    guillemets** (« ci-après dénommé « le Vendeur » »), retombant à tort sur une recherche en avant
    pour la formulation, tout aussi fréquente, sans aucune ponctuation particulière ("ci-après
    dénommé le Vendeur"). Reconnaît maintenant aussi ce cas.
  - **Taille de police du responsable dans le tableau Suivi** alignée sur celle des dates de la
    même ligne (`.echeance-jours`, 12px) — le nom du collaborateur ressortait plus gros que le
    reste de la ligne.
  - **Logique des badges de statut vert/orange/rouge redéfinie explicitement par l'étude**, plus
    simple que l'ancienne combinaison de signaux (offre manquante, accès à reconfirmer, échéance
    dépassée, confiance de la date) : 🟢 vert = toutes les pièces attendues (offre + checklist)
    sont trouvées, on peut signer ; 🟡 orange = état intermédiaire (pièces encore manquantes, ou
    rien n'a encore pu être vérifié) ; 🔴 rouge = aucun document n'a été trouvé parmi ce qui a
    réellement été cherché. `statutDossier()` réécrite en conséquence : chaque pièce attendue porte
    un statut à trois valeurs (`recue`/`manquante`/`inconnu`, pas un simple booléen) pour distinguer
    "jamais cherchée" de "cherchée et confirmée absente" — seul ce second cas compte pour le rouge,
    le premier ne pénalise pas un dossier qu'on n'a pas encore eu l'occasion de vérifier (même
    principe déjà appliqué à l'offre de prêt "inconnue" ailleurs dans l'outil). L'accès à
    reconfirmer, l'échéance dépassée et la confiance de la date n'influencent plus ce badge — ils
    restent visibles ailleurs (bandeau "accès à reconfirmer", badge "⚠️ à vérifier"/"≈ estimée" sur
    la date elle-même), la synthèse ne les duplique plus.
  - **Fiche dossier dépliée : adresse, prix, type de vente, rôle du notaire et responsable
    regroupés sur une seule ligne**, dans cet ordre précis (demandé par l'étude) — les deux `<div>`
    distincts (`.dossier-classification` et l'ancienne `.dossier-adresse-prix`, supprimée) ont été
    fusionnés en un seul `.dossier-classification` (flex-wrap repris de l'ancienne règle).
  - **Statut de l'offre de prêt + "Revérifier" déplacés dans la carte "Obtention du prêt"**, sous
    la date/le décompte, plutôt que dans l'en-tête du dossier (position jugée trop éloignée de
    l'échéance concernée). `renderTab()` accepte un nouveau paramètre `offreBloc` (HTML déjà
    construit, passé uniquement pour le tab "pret") inséré en fin de carte ; `renderCarteDossier()`
    ne garde dans son ancien emplacement (`.offre-pret-ligne`) que le lien "reconfirmer l'accès",
    qui concerne le dossier local dans son ensemble, pas spécifiquement l'offre de prêt. Le badge
    de confiance (`≈ estimée`/`⚠️ à vérifier`/...) est déplacé au même moment à côté du crayon
    d'édition de la date (dans `.tab-date-affichage`) plutôt qu'à côté du décompte J-X, sur la
    même demande.
- **Bug corrigé : des dates d'annexes continuaient à remonter dans les échéances butoir**, malgré
  le correctif précédent (voir plus haut). Cause de fond identifiée : `extraireTextesUtiles()`
  n'avait que deux garde-fous pour couper avant les annexes — un titre de pièce jointe reconnu
  (`estDebutPageAnnexe`) ou une pagination interne "Page X sur Y" (`dernierePageNumerotee`) — si
  le document n'avait NI l'un NI l'autre (beaucoup de trames réelles, notamment sans pagination
  explicite), `dernierePageUtile` retombait sur la longueur totale du PDF : aucune coupure, tout
  le dossier (annexes comprises, parfois des centaines de pages) servait à la détection de dates.
  Ajout d'un troisième repère, bien plus universel que les deux précédents : la signature de
  l'acte lui-même. Quel que soit le modèle, un compromis/promesse se termine TOUJOURS par un bloc
  de signatures avant toute pièce jointe — jamais l'inverse. `detecteSignatureActe()` (nouveau
  `RE_SIGNATURE_ACTE`, élargi à partir du motif déjà utilisé pour le repli OCR de la date de
  signature : signé électroniquement, date et signatures, dont acte, en foi de quoi, lu et
  approuvé, bon pour accord, fait et signé, signature des parties, paraphé et signé) repère la
  PREMIÈRE page portant un tel marqueur en parcourant le PDF — la signature de l'acte est
  nécessairement la première rencontrée, un mandat ou une AG annexés plus loin ayant aussi leur
  propre bloc de signature mais bien après. `calculerDernierePageUtile()` (testable, voir
  `tests/divers.test.js`) combine les trois repères disponibles (annexe, signature, pagination) en
  retenant le PLUS TÔT d'entre eux : mieux vaut couper trop tôt (une date à saisir à la main) que
  trop tard (une date d'annexe glissée dans les échéances butoir), décision déjà actée deux fois
  par l'étude. La boucle de lecture du PDF s'arrête dès que la signature est trouvée (+2 pages de
  tampon pour un éventuel certificat/dernière signature électronique), sans lire inutilement le
  reste d'un PDF qui peut compter des centaines de pages d'annexes après coup.
- **Doublon "offre reçue" dans le tab "Obtention du prêt" : corrigé, puis corrigé DANS L'AUTRE
  SENS.** Premier signalement de l'étude : une fois l'offre reçue, le décompte (`.tab-countdown`)
  affichait "✓ Offre reçue" et le bloc juste en dessous répétait "✓ Offre de prêt reçue" — le
  décompte a donc été masqué entièrement dans ce cas (`decompteMasque`). **Mauvais choix** : c'est
  la ligne qui portait aussi l'information de date/délai, et l'étude est revenue dessus ("la date ne
  s'affiche plus, je t'ai mal expliqué, remets comme avant"). Le décompte est rétabli, et c'est le
  bloc du dessous qui est raccourci — le doublon était bien réel, il fallait le régler de ce
  côté-là :
  - `.tab-countdown.recue` (rétablie) affiche "✓ Offre reçue" en vert à la place de "Échéance
    dépassée", qui laisserait croire à un retard sur une condition pourtant résolue.
  - `offreBloc` n'est plus une phrase mais une **puce de couleur + un mot** (`.offre-puce` /
    `.offre-point`) : vert "Ouvrir le fichier" (un vrai `<button>`, voir `ouvrirOffreTrouvee`),
    amber "Introuvable", gris "Non vérifiée". Le libellé du cas "reçue" nomme délibérément l'ACTION
    plutôt que le statut — sinon les deux lignes rediraient les mêmes mots, ce qui était exactement
    la remarque initiale.
  - **`offreBloc` s'affiche désormais même sans dossier local relié** (il était conditionné à
    `d.dossierLie`) : c'est justement dans ce cas qu'il faut pouvoir agir, la carte ne disait
    jusqu'ici rien de l'offre et n'offrait aucun moyen de relier un dossier. Le bouton devient
    "🔗 Lier un dossier local" au lieu de "Revérifier". Demandé explicitement par l'étude.
  - `button.badge-offre.recue` (CSS) supprimée, devenue morte : `.badge-offre` n'est plus rendu
    qu'en `<span>` dans la ligne de tableau du Suivi.
  - **Piège de banc d'essai rencontré en diagnostiquant ce point** : avec des dossiers synthétiques
    injectés dans `localStorage`, `offreBloc` semblait ne jamais s'afficher. Ce n'était pas un bug
    applicatif — `revérifierDossiersLiesAuDemarrage()` remet `d.dossierLie = false` quand aucun
    handle correspondant n'existe dans IndexedDB, ce qui est le comportement voulu et se produit
    forcément sur des données fabriquées à la main. Pour observer cet état en test, rétablir les
    drapeaux **après** la séquence de démarrage puis appeler `render()`.
- **Passe de finition typographique, inspirée d'une maquette fournie par l'étude** (un prototype
  "CLAIRE" complet : registre en tableau, calendrier, écran d'extraction, tiroir de fiche dossier,
  rapports). Seule la **facture** de la maquette a été reprise, pas son identité : la maquette pose
  un fond indigo `#161826` et un accent violet `#9184d9`, qui contredisent tous les deux des
  décisions déjà prises et validées (« mode sombre en gris neutres, pas de navy » et le bleu
  `--focus` retenu lors de la refonte précédente) — ni l'un ni l'autre n'a été adopté. Trois
  détails de fabrication en ont en revanche été repris, applicables quelle que soit la palette :
  - **Étiquettes de section en petites capitales espacées** (`.section-eyebrow` : 10px, `0.1em`,
    `--muted`), un seul registre d'étiquette pour toute l'application. Reprise à l'identique par
    `.kpi-label`/`.stat-label`, et appliquée aux intitulés « Pièces du dossier » et « Historique »
    de la fiche dossier (ce dernier perd son soulignement, devenu redondant avec l'étiquette).
  - **Tuiles de chiffres retournées** : le libellé passe AU-DESSUS du chiffre (on lit ce que c'est,
    puis combien) et le chiffre passe à 30px/`line-height: 1`. `min-height: 28px` sur le libellé
    (deux lignes) garde les chiffres alignés d'une tuile à l'autre même quand un libellé long passe
    à la ligne — sans quoi les tuiles d'une même rangée ne se lisaient plus comme un seul objet.
  - **Filets de tableau qui s'estompent aux deux extrémités** : le trait entre deux lignes n'est
    plus une `border-bottom` de cellule mais un dégradé de 1px peint par la LIGNE
    (`background-image` calé en bas, transparent sur les 44 premiers/derniers pixels). Le tableau
    se lit comme une liste aérée plutôt qu'une grille. **Conséquence à ne pas oublier** : toute
    couleur de fond posée ensuite sur une ligne doit venir en SECONDE couche de `background-image`
    (voir `.ligne-resume:hover`, qui superpose le filet puis `--paper-sunk`), sinon elle recouvre le
    filet — c'est pour ça que `.ligne-detail` garde, lui, un `background` raccourci classique : il
    n'a pas de filet à préserver.
  - Au passage : `font-variant-numeric: tabular-nums` sur les décomptes d'échéance et les dates
    d'historique (les colonnes de chiffres s'alignent), et `button.secondary:hover` passe d'un
    simple changement de couleur de bordure à un aplat discret (`--line-soft`), plus proche du
    survol « teinté » de la maquette.
  - **Volontairement non repris** : le tiroir latéral (la maquette ouvre la fiche dossier dans un
    panneau de 480px à droite plutôt qu'en dépliant la ligne du tableau). L'idée est bonne sur un
    portefeuille de 60 dossiers — la liste ne se décale plus sous le clic — mais c'est un chantier
    structurel (`renderCarteDossier` à sortir du tableau, `dossiersDeplies` à passer à un seul
    dossier ouvert, mise en page deux colonnes à repenser pour 480px, styles d'impression à
    reprendre) sur une fiche que l'étude vient justement de faire réorganiser trois fois. À ne
    lancer que sur demande explicite. Même raisonnement pour le calendrier mensuel et la vue
    « échéancier » groupée de la maquette : ce sont des fonctionnalités, pas du design.
- **Fiche dossier en tiroir latéral** (le point ci-dessus, finalement demandé par l'étude : « tu
  peux, et change la mise en page »). La fiche ne se déplie plus dans le tableau, elle s'ouvre dans
  un panneau de 520px à droite (`#dossier-drawer-overlay` dans `index.html`) : sur une soixantaine
  de dossiers, dérouler une ligne poussait toutes les suivantes plusieurs centaines de pixels plus
  bas et faisait perdre sa place dans la liste, qui reste maintenant strictement immobile.
  - `dossiersDeplies` (un `Set`) est remplacé par `dossierOuvert`, un identifiant unique ou `null` :
    le tiroir est une fenêtre sur LE dossier consulté, pas une liste d'éléments dépliés.
    `ouvrirDossierDrawer()`/`fermerDossierDrawer()` passent toutes les deux par `render()` (et non
    par `renderDrawer()` seul) — la liste doit se redessiner pour poser ou retirer le liseré
    `.ligne-active`, et `render()` rafraîchit le tiroir au passage. Oubli commis puis corrigé en
    vérification visuelle : sans ce `render()`, le tiroir s'ouvrait mais aucune ligne n'était
    marquée comme active.
  - `renderDrawer()` est appelée par `render()` **avant** ses retours anticipés sur liste vide :
    un dossier supprimé pendant qu'il était ouvert doit refermer le tiroir, pas laisser un panneau
    orphelin. Comme toute action menée dans la fiche déclenche `render()` (renommer, corriger une
    date, revérifier une pièce...), le tiroir se reconstruit à chaque fois sans se refermer — même
    problème de fond que celui qui avait motivé `dossiersDeplies` à l'époque du dépliage.
  - Fermeture : croix, clic sur le voile, ou Échap. Le gestionnaire Échap traite d'abord la boîte
    de confirmation puis le tiroir, dans cet ordre — la confirmation (Supprimer/Archiver) s'ouvre
    par-dessus le tiroir, c'est donc elle qu'on attend de voir se fermer en premier.
  - `body.drawer-ouvert { overflow: hidden }` : sans ça, arrivée en bout de course dans le tiroir,
    la molette repart sur la liste derrière et fait perdre la position qu'on cherchait justement à
    préserver.
  - **Mise en page de la fiche revue pour la colonne étroite** : les deux colonnes
    (`.dossier-col-principale`/`.dossier-col-laterale`, supprimées) n'auraient plus tenu en 520px.
    `.dossier-body` devient une simple colonne où l'ordre de lecture porte la hiérarchie :
    échéances → pièces du dossier → analyse juridique → les trois boutons d'action → historique,
    ces deux derniers repliés. (Les actions ont d'abord été placées juste sous les échéances ; sur
    retour de l'étude elles sont redescendues au-dessus de l'historique, et leurs libellés ont été
    raccourcis — « 📅 Rappels (.ics) », « ✉️ Rappel email », « 📄 Imprimer », intitulé complet
    conservé en infobulle — pour tenir sur une seule ligne comme demandé : `.dossier-actions` passe
    en `flex-wrap: nowrap` avec trois boutons à largeurs égales, ce qui les fait aussi lire comme un
    bloc plutôt que trois pastilles de longueurs disparates.) `.tabs` passe à `minmax(200px, 1fr)` dans le tiroir (deux échéances par
    rangée : à 150px il en tassait trois, alors que l'échéance « prêt » porte en plus le statut de
    l'offre et son bouton Revérifier).
  - **Ligne « adresse · prix · type · rôle · responsable » regroupée par paires** : chaque couple
    libellé + champ est désormais un `.classif-item` indivisible (`white-space: nowrap`). Dans la
    largeur du tiroir la ligne passe forcément sur plusieurs lignes, et sans ce groupage un libellé
    se retrouvait séparé de son champ (« Type de vente : » en fin de ligne, la liste déroulante à la
    suivante). Les anciens séparateurs « · » disparaissent au profit de l'espacement — ils se
    seraient retrouvés en début de ligne à chaque retour à la ligne. L'ordre demandé par l'étude est
    inchangé.
  - **Bouton de fermeture dans sa propre barre collante** (`.drawer-barre`) plutôt qu'en flottant :
    en `float: right`, la croix empiétait sur la première ligne de la fiche (nom du dossier +
    Archiver/Supprimer) — constaté en capture d'écran. La barre reste visible pendant le défilement.
  - **Impression** (`window.print()`, pas `imprimerFiche()`) : la fiche n'étant plus dans le flux de
    la page, `@media print` remet le tiroir en statique, masque `.app-shell` et n'imprime que la
    fiche ouverte. Les sélecteurs sont ancrés sur `body.drawer-ouvert` pour que le tiroir fermé
    (masqué par un style inline) n'imprime pas un panneau vide.
  - **Liseré d'accent sur la ligne ouverte** (`.ligne-resume.ligne-active`) : seul lien visuel qui
    subsiste entre le tiroir et la ligne dont il vient. Peint en `background-image` comme le filet
    de ligne (voir la passe typographique ci-dessus) et non en `border-left`, qui décalerait le
    contenu de la cellule d'un pixel à l'ouverture.
- **Refonte visuelle complète, demandée explicitement par l'étude après un avis critique honnête
  sur quatre points ("Que penses-tu de notre dernière version, côté design ?")** : trop d'emoji en
  guise d'icônes, empilement de badges à fond plein qui finissaient par ne plus rien faire
  ressortir, du vide non maîtrisé sur écran large, et une typographie de caractère (Fraunces)
  presque invisible en dehors de deux titres de page. Demande explicite : "prends tes propres
  décisions, pas d'IA slop, design propre/cohérent/aligné/moderne 2026, tu peux changer la
  disposition". Traité en un seul chantier plutôt qu'en sous-tâches séparées, les quatre points
  se recoupant (retirer un emoji est aussi souvent retirer un badge).
  - **Un seul jeu d'icônes SVG, dessiné à la main** (`ICONES`/`icone(nom, cls, spin)` dans
    `script.js`, tout en haut du fichier) remplace l'ensemble des emoji utilisés comme icônes dans
    l'interface (🔥 🔒 ⚠️ 📄 ✉️ 🔗 💰 📍 🧠 👁 📋 🤝 ☰ ⏳ ✏️ 🌙 ☀️ 📁 🔎 🔑 📲 ⇩ ＋ ◧...), qui n'ont ni la
    même épaisseur de trait ni le même dessin d'un système d'exploitation à l'autre. Grille 16x16,
    trait 1.4, extrémités arrondies — même recette que `iconeCalendrierSeuil()` (déjà en place, non
    retouchée) pour ne pas juxtaposer deux langages graphiques. `.icone` (style.css) les dimensionne
    en `1em` : une icône suit la taille de police du bouton/texte qui la contient, sans réglage au
    cas par cas à chaque usage. `.icone-spin` (rotation continue, respecte
    `prefers-reduced-motion`) remplace l'emoji ⏳ sur les boutons "Revérifier" en cours de recherche
    par un vrai indicateur de chargement.
    - Les icônes statiques du HTML (sidebar, burger mobile, dropzone, panneau d'introduction)
      passent par des emplacements vides (`<span id="icon-...">`) remplis au chargement par
      `initIconesStatiques()` — un point d'entrée unique, pour ne jamais dupliquer le dessin d'une
      icône entre le HTML et `ICONES`. Tout le reste de l'interface étant déjà rendu depuis
      `script.js` (voir la structure du projet en tête de ce document), c'est cohérent avec
      l'architecture existante plutôt qu'une exception.
    - Deux caractères conservés tels quels, volontairement : ✓/✕ (coche et croix typographiques,
      pas des pictogrammes photoréalistes, déjà cohérents entre eux et avec le reste) et € (symbole
      monétaire, pas une icône). Le "+"/"←"/"→" des boutons et libellés restent aussi du texte brut
      — ce sont des caractères ASCII/flèches ordinaires, pas le genre de pictogramme visé par la
      critique initiale.
  - **`.dot-label` : un seul langage de statut dans tout l'outil**, remplaçant l'empilement de
    composants qui disaient chacun la même chose à leur façon (`badge-statut`, `badge-offre`,
    `type-pill`, `badge-confiance`, `badge-apprise`, `badge-approx`, `badge-role`, `badge-cash`,
    chacun avec sa propre pastille à fond plein). Un point de couleur (ou une icône) + un mot, sans
    fond ni contour par défaut : sur une ligne du tableau Suivi, empiler 3-4 pastilles pleines
    finissait par ne plus rien faire ressortir, alors qu'un point de couleur + texte se lit d'un
    coup d'œil sans rivaliser avec ses voisins. Né de `.offre-puce` (déjà construit sur ce principe
    pour le statut de l'offre de prêt dans le tiroir), généralisé ici à tous les autres badges de
    l'outil plutôt que dupliqué pour chacun — `.offre-puce`/`.offre-point` disparaissent, remplacés
    partout par `.dot-label`/`.dot` (modificateurs `dl-pret`/`dl-acte`/`dl-ventebien`/
    `dl-success`/`dl-urgent`/`dl-neutre`/`dl-autre`).
    - **Un seul cas garde un fond plein** (`.dl-alerte`, amber-urgent) : la date choisie parmi
      plusieurs candidates sans formulation permettant de trancher ("incertain"/"à vérifier") doit
      rester la chose qui saute aux yeux — décolorer ce signal-là en même temps que les autres
      aurait perdu l'intention initiale du badge "⚠️ à vérifier" (voir son historique plus haut).
    - **Le badge de confiance "auto" (date repérée sans ambiguïté) est retiré entièrement**, pas
      seulement redessiné : c'était le cas par défaut, affiché sur quasiment CHAQUE date de CHAQUE
      dossier ("📄 texte" en fond vert). Lui donner le même traitement visuel que les trois
      exceptions réelles (manuel/estimée/incertaine) revenait à mettre un badge sur tout, ce qui
      n'attire l'attention sur rien de particulier — la meilleure façon de désencombrer une
      information qui ne dit rien d'anormal est de ne pas l'afficher, pas de la redessiner plus
      discrètement.
    - **Le badge de priorité (🔥, sur la ligne du tableau) est retiré, pas seulement redessiné en
      icône** : trois autres signaux couvrent déjà exactement ce que lui seul signalait — le badge
      de statut "Blocage" (rouge), le tri "Priorité (recommandé)" déjà proposé dans le menu, et le
      bloc "Actions urgentes" du tableau de bord qui liste déjà les dossiers de score élevé avec la
      raison. `calculerPriorite()`/`SEUIL_PRIORITE_ELEVEE` restent utilisés par ces deux derniers,
      seul l'affichage redondant sur la ligne disparaît.
    - **`statutOffreAffichage(d)`** (script.js, remplace `libelleOffre()`) unifie le texte affiché
      pour le statut de l'offre de prêt entre la ligne de tableau et la carte "Obtention du prêt"
      du tiroir — avant cette fonction, chacun formulait le même fait à sa façon ("Offre de prêt :
      à vérifier" en phrase complète d'un côté, "Non vérifiée" en point + mot de l'autre). Elle
      applique aussi au tableau la distinction déjà présente dans le tiroir entre "jamais relié"
      (gris, "Non vérifiée") et "relié mais introuvable" (amber, "Introuvable") — le tableau ne
      faisait pas cette différence avant, une correction de cohérence au passage.
    - `renderBadgeStatut()` garde un cas particulier pour l'archive : un point de couleur dirait
      "actif" alors que le dossier ne l'est plus, donc ce statut affiche l'icône `lock` plutôt
      qu'un point — seule exception au principe "point de couleur" du composant.
  - **Deux endroits où le vide n'était pas maîtrisé, sur un écran large** :
    - **Étape "Importer" du wizard "Nouveau dossier"** : avant tout import de PDF, la colonne de
      droite (`#pdf-viewer`, masquée tant qu'aucun document n'est chargé) restait entièrement nue.
      `#nouveau-intro` (nouveau panneau statique dans `index.html`, classe `.pdf-viewer.nouveau-intro`
      pour hériter du même gabarit sticky/carte) occupe cette place tant qu'aucun PDF n'est
      importé : une liste de ce que l'outil détecte effectivement (dates, engagements, type de
      vente, email, adresse/prix), pas un habillage décoratif. Basculé par `traiterFichierPdf()`
      (masqué dès qu'un PDF est chargé) et `reinitialiserFormulaire()` (réaffiché après
      enregistrement), aux deux mêmes points qui géraient déjà `#pdf-viewer`.
    - **Dropzone** : reconstruite en zone verticale centrée (icône `upload` dans un cercle, bouton,
      indication du glisser-déposer, padding généreux) plutôt que l'ancienne ligne compacte
      (bouton + texte côte à côte), qui laissait la carte "Nouveau dossier" visuellement à moitié
      vide dès le premier écran. `.pdf-row` (devenu inutile) supprimé.
    - **Bug corrigé au passage, trouvé en re-régénérant les captures d'écran des deux thèmes** :
      `.extract-box` (le cadre autour de la dropzone) utilisait un beige fixe `#F4F5F0` jamais
      recouvert par un override dark — en mode sombre, ce panneau restait clair, seul îlot du genre
      dans tout l'outil. Remplacé par `var(--paper-sunk)`, qui suit le thème comme les autres
      panneaux enfoncés (`.pieces-dossier`...).
  - **Le nom du dossier dans la ligne de tableau passe en Fraunces** (`.ligne-resume
    .dossier-nom-tableau`), comme il l'était déjà dans la fiche dépliée du tiroir (`.nom-texte`,
    imbriqué dans un `<h3>`) : la police de caractère de l'identité "CLAIRE" ne portait jusqu'ici
    que sur deux titres de page, quasi invisible dans l'usage réel de l'outil (consulter la liste
    des dossiers). C'est justement ce qu'on lit en premier sur l'écran le plus consulté.
  - **Volontairement non touché** : la palette (accent bleu `--focus`, couleurs de catégorie
    `--pret`/`--acte`/`--ventebien`, gris neutres du mode sombre), déjà validée par l'étude lors des
    deux refontes précédentes — la demande portait sur la facture (icônes, badges, espace,
    typographie), pas sur les couleurs. Le tiroir latéral, la mise en page de la fiche dossier et
    le wizard 4 étapes ne sont pas non plus restructurés, seulement leurs éléments visuels
    (badges, icônes) mis à jour en place.
  - **Bug corrigé, trouvé par l'étude en conditions réelles juste après cette refonte : deux
    crayons côte à côte sur une date corrigée à la main** ("Obtention du prêt — 11 novembre 2026
    ✏️ ✏️ Corrigée à la main"). Cause : le passage aux icônes SVG (voir ci-dessus) a donné à la
    confiance "manuel" (`LIBELLES_CONFIANCE.manuel`) la même icône `pencil` que le vrai bouton de
    correction (`icon-crayon`, `activerEditionDate()`) juste à côté dans `.tab-date-affichage` —
    les deux rendaient alors la même icône l'une contre l'autre. Le badge de confiance "manuel"
    n'a plus d'icône du tout (juste un point neutre, comme "estime") : le bouton de correction est
    la seule icône crayon légitime à cet endroit.
- **Condition suspensive de prêt exprimée en délai, avec un point de départ explicite** ("au plus
  tard 60 jours **après** la signature des présentes") : troisième formulation réelle rencontrée
  pour la même clause, fournie par l'étude. Distincte des deux motifs déjà en place :
  - `reDelai` : "délai de N jours à compter de/à partir de..." (ancre explicite, mot "délai").
  - `reAuPlusTardDelai` : "au plus tard dans les/un délai de N jours" (ancre implicite = signature
    de la promesse, pas de mot "après").
  - **`reAuPlusTardApres`** (nouveau) : "au plus tard N jours après \<ancre\>" — ancre explicite
    comme `reDelai`, mais sans le mot "délai" ni "à compter de/à partir de" comme `reAuPlusTardDelai`.
    Mêmes ancres acceptées que `reDelai` (la signature, ce jour, l'acte, la présente, le présent
    compromis/acte, la promesse), même garde-fou contre la clause de notification du refus/de
    l'octroi au notaire (souvent un second délai similaire quelques lignes plus loin, à ne pas
    détecter — voir l'historique de `reAuPlusTardDelai`). Classification "pret" automatique sans
    élargir `suggererEcheance()`/`extraireContexte()` : le mot "prêt" apparaît déjà dans la même
    phrase ("réception de cette ou de ces offres de prêt..."). Voir le test de régression dans
    `tests/dates.test.js` (texte réel, clause "RÉALISATION DE LA CONDITION").
- **Relance à l'acquéreur masquée pour un notaire participant/concourant** : demandé explicitement
  par l'étude, cohérent avec le périmètre déjà réduit de ce rôle (prêt + engagements du vendeur
  uniquement, voir son historique plus haut) — relancer l'acquéreur reste un geste du notaire
  instrumentaire, celui qui reçoit l'acte et porte la relation avec lui.
  - `relancerSiOffreManquante()` retourne tôt si `d.roleNotaire === 'participant'`, même garde-fou
    que `verifierPiecesDossier()` pour ce rôle — la relance automatique (offre de prêt introuvable
    à l'approche de l'échéance) ne se déclenche plus pour ces dossiers.
  - Le champ "Email de l'acquéreur (pour relance prêt)" (étape "Finaliser" du wizard) se masque
    dès que "Rôle de l'étude sur ce dossier" passe à Participant (`#champ-email-acquereur`, basculé
    dans `majApercuPieces()` — déjà le gestionnaire de changement de rôle pour l'aperçu des pièces,
    pas besoin d'un second point d'entrée) et se vide au passage, pour ne pas garder une adresse
    enregistrée sans jamais s'en servir. Réapparaît si le rôle repasse à Instrumentaire.
- **Date de signature du compromis détectée déplacée de l'étape "Importer" vers l'étape
  "Vérifier"** du wizard : demandé par l'étude. `#compromis-info` (le bandeau "Date de signature
  détectée : ... · Corriger") vivait dans `.extract-box` de l'étape 1, un écran qu'on quitte
  aussitôt l'import terminé (bascule automatique vers l'étape 2, voir plus haut) — la seule vraie
  utilité de cette date, servir d'ancre aux échéances exprimées en délai (`reDelai`,
  `reAuPlusTardDelai`, `reAuPlusTardApres`), se vérifie et se corrige naturellement à côté des
  dates butoir elles-mêmes, pas en amont sur un écran de passage. Simple déplacement dans
  `index.html` (le bloc HTML, inchangé, est maintenant le premier enfant de `#wizard-step-2`,
  au-dessus des chips) : `majAffichageCompromis()`/`toggleCompromisEdit()`/
  `corrigerDateCompromis()` ciblent déjà l'élément par son id, aucun changement côté `script.js`.
  L'étape 1 ne garde plus que la dropzone d'import, le statut et la note "sans prêt". Vérifié
  visuellement (Playwright) : absent de l'étape 1, bien affiché en tête de l'étape 2.
- **Badge de statut : ajout d'un quatrième niveau gris "À relier", et renommage de deux libellés
  existants** — demandé par l'étude pour distinguer un dossier qu'on n'a simplement pas encore pu
  vérifier (rien d'alarmant) d'un dossier où la recherche a réellement échoué (un vrai signal).
  Avant ce correctif, ces deux cas très différents partageaient le même statut `aconfirmer`.
  - `statutDossier()` (script.js) : la branche `if (verifies.length === 0) return 'aconfirmer'`
    devient `return 'arelier'` — cas où RIEN n'a encore été vérifié (dossier jamais relié à un
    dossier local, ou pièces jamais recherchées). Le cas `aconfirmer` restant ne couvre plus que
    l'état réellement intermédiaire : une partie de ce qui a été recherché est trouvée, une autre
    partie manque encore (ou reste à vérifier) — d'où son nouveau libellé.
  - `LIBELLES_STATUT` : nouvelle entrée `arelier: { texte: 'À relier', dl: 'dl-neutre' }` (même
    couleur neutre que "Archivé", distingué de lui par l'absence d'icône cadenas — un point de
    couleur pour "À relier", un cadenas pour "Archivé", même principe déjà en place). `aconfirmer`
    renommé de "À confirmer" à **"Réception de pièces"** (décrit l'action en cours plutôt qu'un état
    vague) ; `blocage` renommé de "Blocage" à **"Aucun document"** (nomme précisément ce qui a été
    constaté — aucun document trouvé parmi ce qui a été cherché — plutôt qu'un mot qui pouvait
    laisser croire à un blocage juridique). Les clés internes (`arelier`/`aconfirmer`/`blocage`)
    sont inchangées ou nouvelles mais jamais réutilisées pour un autre sens : seul le texte affiché
    change pour les deux existantes.
  - Aucun autre point de l'outil ne référence ces statuts par leur texte affiché (vérifié par
    recherche) : le bloc "Actions urgentes" du tableau de bord (`renderActionsUrgentes()`)
    continue de filtrer sur la clé `'blocage'`, inchangée, donc pas d'effet de bord.
  - Test mis à jour dans `tests/divers.test.js` : le cas "offre de prêt jamais confirmée" (rien
    vérifié du tout) attend maintenant `'arelier'` plutôt que `'aconfirmer'` ; le cas "pièce
    manquante sur dossier relié avec offre déjà reçue" (mélange trouvé/pas encore vérifié) reste
    inchangé, toujours `'aconfirmer'`.
- **Bug corrigé : cliquer sur une pièce/l'offre "reçue" pour rouvrir le fichier local affichait le
  contenu binaire brut du PDF comme du texte** ("%PDF-1.6 ... stream ... FlateDecode...") au lieu
  de l'ouvrir dans le lecteur PDF intégré de Chrome. Signalé par l'étude avec une capture du texte
  affiché. Cause : `ouvrirFichierTrouve()` passait directement le `File` obtenu via
  `handle.getFile()` à `URL.createObjectURL()` — si ce `File` a un `.type` vide ou incorrect (peut
  arriver selon la façon dont l'OS/Chrome associe l'extension `.pdf`, indépendamment du contenu
  réel du fichier), le navigateur ne sait pas qu'il doit afficher un PDF et retombe sur un rendu
  texte brut. Corrigé en reconstruisant un `Blob` avec un type MIME forcé à `application/pdf`
  quand celui du `File` ne l'est pas déjà (`new Blob([file], { type: 'application/pdf' })`) — sans
  risque, ces fichiers sont toujours des PDF par construction (seule extension retenue par
  `fichiersPdfRecursifs()`). Vérifié avec un `File` sans type MIME (cas reproduit) via Playwright :
  la popup ouverte porte bien `document.contentType === 'application/pdf'` après le correctif.
- **Fraunces retirée de partout sauf le logo "CLAIRE"** : jugée pas assez professionnelle par
  l'étude sur les titres/noms de dossier ("je n'aime pas la typo, change pour quelque chose de
  plus professionnel sans serif"). Référence fournie pour le logo lui-même : une capture d'un
  logotype "Sage" (serif éditorial à très fort contraste, esprit mode/beauté) — appliquée
  UNIQUEMENT au mot "CLAIRE" de la sidebar (clarifié explicitement avec l'étude avant de tout
  changer, la référence étant un serif alors que la demande générale portait sur du sans-serif) :
  - `h1, h2, h3, .serif` (titres de page, en-têtes de panneau) passent en **Inter** (déjà chargée
    pour le corps de texte, aucune police supplémentaire à charger) à `font-weight: 700` et
    `letter-spacing: -0.015em` — un poids plus marqué que le corps de texte (400/500) suffit à
    garder une hiérarchie visuelle sans changer de famille.
  - Tous les autres usages ponctuels de Fraunces sont remplacés à l'identique par Inter : le nom
    de dossier dans le tableau du Suivi (`.ligne-resume .dossier-nom-tableau`) et dans la fiche
    dépliée du tiroir (`.nom-texte`, `.dossier-nom-input`), l'en-tête du panneau "Nouveau dossier"
    (`.panel summary`) et le titre du panneau d'introduction (`.nouveau-intro-titre`).
  - **`.brand-word` (le mot "CLAIRE" dans la sidebar) passe à Bodoni Moda**, chargée à la place de
    Fraunces dans le lien Google Fonts (`index.html`) — un display serif à très fort contraste,
    dans le même esprit éditorial que la référence "Sage" fournie, réservé à la MARQUE pour la
    distinguer du reste de l'interface (désormais entièrement sans-serif). `font-optical-sizing:
    none` + `font-variation-settings: 'opsz' 90` : à la taille réduite du logo dans la sidebar
    (23px), le choix "auto" du navigateur retomberait sur une coupe proche du texte courant et
    perdrait le contraste marqué qui fait l'intérêt de cette police en logotype — il faut forcer
    l'axe optique vers le haut de son échelle (6..96) indépendamment de la taille de rendu réelle.
  - **Non vérifié visuellement dans cet environnement** : `fonts.googleapis.com` est bloqué par le
    proxy réseau de développement (`ERR_TUNNEL_CONNECTION_FAILED`), comme déjà documenté pour
    pdf.js/tesseract.js — Bodoni Moda et Inter retombent sur leurs polices de repli système
    (Georgia/Segoe UI) pendant le développement ici. Les règles CSS elles-mêmes sont vérifiées
    correctes (`getComputedStyle` confirme les bonnes familles de police appliquées aux bons
    éléments) et la mise en page ne casse pas avec les polices de repli (capture d'écran) — à
    confirmer par l'étude avec les vraies polices chargées (poste réel ou GitHub Pages).
- **Calculateur de provision sur frais d'acte, nouvel onglet indépendant du suivi des dossiers**
  (`#onglet-calculateur`, lien "Frais d'acte" dans la sidebar) : demandé par l'étude à partir de
  deux maquettes qu'elle avait fait produire (une version "classique" et une version "moderne"),
  la seconde retenue comme base — mais uniquement pour sa STRUCTURE (mise en page en deux colonnes
  paramètres/résultat, tuiles de taux, tableau de détail) : sa propre palette bordeaux/or et ses
  styles CSS ont été entièrement jetés au profit des tokens déjà en place dans l'outil (`--focus`,
  `--paper-card`, `--line`, `--success`...) — même principe que pour le reste de CLAIRE, un seul
  système de couleurs, pas un second par écran. Sans dossier associé : un simple outil de calcul
  à la volée, rien n'est enregistré.
  - **Barème et taux repris tels quels** de la maquette fournie (`DEPARTEMENTS_FRAIS_ACTE`,
    100 départements avec taux de droit commun/temporaire ; `BAREME_FRAIS_ACTE`, trois tableaux
    émoluments+trésor par type de bien) — données fiscales/tarifaires hors du ressort de cet
    outil, non recalculées ni vérifiées ; seule la mise en forme a changé. `interpolerBaremeFraisActe()`
    interpole linéairement entre deux paliers de prix connus du tableau, comme dans la maquette.
  - `calculerFraisActe()` recalcule à chaque changement de champ (`oninput`/`onchange` inline,
    même convention que le reste de l'outil) : prix, département, statut primo-accédant, résidence
    principale, nature du bien. Réutilise `formaterPrix()` (déjà utilisée pour `d.prixVente`) au
    lieu d'une fonction de formatage monétaire dupliquée — seul un nouvel helper
    `formaterPourcentageFraisActe()` était nécessaire (aucun équivalent existant dans l'outil).
  - `initCalculateurFraisActe()` peuple le `<select>` des départements une seule fois au démarrage
    (appelée dans la séquence d'init, comme `initIconesStatiques()`) — le calculateur est toujours
    présent dans le DOM, comme les autres onglets, pas construit à la demande.
  - **Bug corrigé avant commit, repéré par la suite de tests** : `initCalculateurFraisActe()`
    testait `deptEl.options.length` pour éviter de repeupler le `<select>` deux fois — le faux
    `document` de `tests/helpers/load-app.js` ne modélise pas les `<select>`/`<option>` du DOM réel
    (`.options` y est `undefined`), donc `.length` levait une exception à CHAQUE test (script.js
    est rechargé dans un nouveau contexte à chaque appel de `chargerApplication()`, qui exécute
    aussi la séquence d'init de bas de fichier). Remplacé par un simple drapeau
    (`calculateurFraisActeInitialise`), sans dépendre d'une structure DOM que le harnais de test ne
    reproduit pas — cohérent avec la note déjà présente dans `load-app.js` ("le faux document doit
    rester silencieusement inoffensif face à n'importe quel accès DOM plausible").
  - **`input[type="number"]` ajouté aux sélecteurs génériques de style des champs de formulaire**
    (`input[type="text"], input[type="date"], input[type="email"]...`) : absent jusqu'ici faute
    d'avoir eu besoin d'un champ numérique ailleurs dans l'outil — le champ "Prix / valeur
    d'assiette" du calculateur en est le premier usage.
  - Icône de navigation : `banknote` (déjà dans `ICONES`, utilisée ailleurs pour les montants),
    pas une nouvelle icône dessinée pour l'occasion.
  - Vérifié visuellement (Playwright, clair et sombre) et par un changement de paramètre
    (primo-accédant → non primo-accédant : le taux appliqué passe bien de 4,50 % à 5,00 % et le
    total se met à jour) — cohérent avec `fonts.googleapis.com` bloqué dans cet environnement de
    dev (voir l'entrée juste au-dessus), sans lien avec cette fonctionnalité elle-même.
- **Série de retouches demandées par l'étude sur le calculateur, le tiroir dossier et la
  détection des pièces**, traitées indépendamment :
  - **Calculateur** : "Non primo-accédant" devient l'option par défaut du groupe "Acquéreur"
    (`checked` déplacé sur ce radio, ordre des deux options inversé pour que l'option cochée reste
    la première) — repli le plus courant en pratique, l'étude préfère ne pas présumer du statut
    primo-accédant par défaut. Ajout de "LCB-FT COMPRIS" (`.calc-lcbft`, vert `--success`) juste
    sous "Total provisionnel, arrondi à l'euro près.". La ligne "Provision complémentaire ajoutée
    aux émoluments" du tableau de détail est renommée "Taxes : LCB-FT" (montant 200 € inchangé,
    seul l'intitulé change — LCB-FT = lutte contre le blanchiment de capitaux et le financement du
    terrorisme). Lien de sidebar renommé "Frais d'acte" → "Simulateur provision sur frais".
  - **Analyse juridique toujours dépliée dans le tiroir** : le `<details class="analyse-juridique
    analyse-repliable">` (voir plus haut, "Analyse juridique ancrée") porte maintenant l'attribut
    `open` en dur. Comme `render()` reconstruit le tiroir à chaque action, une fermeture manuelle
    ne "tient" pas d'un rendu à l'autre — effet recherché, l'étude veut la voir en permanence
    plutôt que d'avoir à la redéplier après chaque action sur le dossier.
  - **Bug corrigé : `statutDossier()` marquait "Prêt" un dossier "sans prêt" (achat comptant)
    jamais relié**, alors que sa checklist de pièces d'urbanisme n'avait jamais été vérifiée.
    Cause : la checklist de pièces n'était comptée que si `d.dossierLie` était vrai ; pour un
    dossier sans condition de prêt, c'est pourtant le SEUL signal qui existe (pas d'offre à
    suivre) — ne pas la compter avant tout lien revenait à dire "rien à vérifier" par défaut. La
    condition devient `d.roleNotaire !== 'participant' && (d.dossierLie || d.sansPret)` : la
    checklist compte désormais aussi pour un dossier sans prêt jamais relié (renvoie "arelier",
    pas "pret"), sans rien changer pour un dossier AVEC prêt jamais relié (toujours ignorée tant
    que non relié, cas déjà couvert par un test existant) ni pour un rôle participant (toujours
    exclue). Voir les deux tests ajoutés dans `tests/divers.test.js`.
  - **Badge de confiance "manuel" (Corrigée à la main) retiré entièrement** de
    `.tab-date-affichage` dans le tiroir — jugé redondant à côté du bouton crayon
    (`icon-crayon`), qui porte déjà cette information à lui seul. Traitement identique à "auto"
    (aucune entrée dans `LIBELLES_CONFIANCE`, donc aucun badge affiché) ; "estime" et "incertain"
    restent inchangés, ce sont de vrais signaux de vigilance.
  - **Une fois un dossier relié pour la première fois, ses pièces partent à "manquante" plutôt
    que de rester à "inconnu"** le temps que `verifierPiecesDossier()` parcoure effectivement le
    dossier local (`lierDossierLocal()`, uniquement sur le tout premier lien, `!etaitDejaLie`) :
    sans ce préremplissage, le badge de statut affichait "À relier" (gris, neutre) juste après
    avoir relié un dossier, ce qui n'a plus de sens puisqu'il vient justement d'être relié — "Aucun
    document" (rouge) reflète mieux ce point de départ pessimiste, corrigé pièce par pièce dès que
    le scan retrouve quelque chose dans les secondes qui suivent.
  - **Détection des pièces d'urbanisme et diagnostics par le NOM DU FICHIER PDF, en plus du
    contenu** : signalée par l'étude comme peu fiable par contenu seul pour ces pièces précises.
    Nouveau champ `motifNom` (regex testée sur `entree.name`, avant même d'ouvrir le PDF — voir
    `verifierPiecesDossier()`) sur les pièces `certificatUrbanisme` (reconnaît aussi le raccourci
    interne "CU a)"), `certificatAlignement`, `certificatNumerotage` et `diagnosticsTechniques`
    (reconnaît aussi "DDT"). Les deux motifs se complètent : `motifNom` est tenté en premier pour
    chaque fichier (évite même de l'ouvrir si le nom suffit), `motif` (contenu) reste le repli pour
    un fichier au nom ambigu — aucune régression pour les dossiers déjà reconnus par leur contenu.
    Voir le nouveau test dans `tests/dossier-local.test.js`.
  - **Logo "CLAIRE" retouché** (mark de la sidebar, `.brand-mark` dans `index.html`) à partir d'un
    exemple fourni par l'étude : un anneau ouvert en trait fin (`path` d'arc) avec un petit trait
    horizontal à l'ouverture (`line`), plutôt que l'ancienne tuile graphite pleine avec un point
    plein — mark plus discret, sans fond, coloré via `var(--focus)`/`var(--focus-hover)` (jamais
    les couleurs de l'exemple fourni, qui ne correspondaient pas à la charte déjà en place). Le
    favicon/icône PWA (`icone.svg`, fichier séparé sans accès aux variables CSS) reprend le même
    changement de motif (le point plein devient un trait), en gardant sa tuile graphite pleine et
    ses couleurs fixes déjà correctes — un favicon a besoin de rester lisible en très petite taille
    quel que soit le fond de la barre d'onglets, contrairement au mark inline de la sidebar.
    Typographie du mot "CLAIRE" (Bodoni Moda) non retouchée : seuls les couleurs/motif du symbole
    ont été demandés, pas la police déjà validée juste avant (voir l'entrée "Fraunces retirée..."
    ci-dessus) — à confirmer si l'étude souhaite aussi essayer une autre police pour le mot.
  - **Surlignage des engagements du vendeur dans l'aperçu PDF**, sur le même principe que les
    dates (`voirDateDansPdf`) mais pour une phrase complète : demandé par l'étude après le retrait
    précédent de cette fonctionnalité (voir plus haut, "Corrigé au passage : `renderEngagement()`
    cherchait à surligner..."), qui avait échoué car ancrée sur le "dernier mot" d'une phrase
    tronquée à 80 caractères — une ancre bien trop peu fiable sur du texte libre. Nouvelle fonction
    `voirEngagementDansPdf(numeroPage, phraseB64)`, plus robuste :
    - Reconstruit le texte concaténé de la page à partir de `content.items` (pdf.js), en mémorisant
      pour chaque caractère l'item d'origine — une phrase peut être répartie sur plusieurs items
      (typiquement un par ligne), il faut donc pouvoir surligner PLUSIEURS items, pas un seul.
    - Recherche un préfixe de la phrase (jusqu'à 60 caractères, réduit par paliers de 10 jusqu'à
      15 si le préfixe complet ne matche pas) dans une version normalisée (espaces multiples
      réduits à un seul, casse ignorée) du texte de la page — la phrase mémorisée a déjà ses
      espaces normalisés à l'extraction (voir `extraireEngagementsVendeur`), pas forcément
      identiques à la mise en page réelle. La normalisation conserve un mapping vers les index du
      texte d'origine (indispensable pour ensuite localiser les items concernés).
    - Une fois la position d'ancrage trouvée, la zone à surligner s'étend sur la longueur de LA
      PHRASE ENTIÈRE (pas seulement le préfixe ayant servi à l'ancrer) : sans ça, une phrase de
      plusieurs lignes n'aurait été surlignée que sur ses deux premières lignes. Un highlight est
      posé par item concerné (plusieurs rectangles empilés pour une phrase multi-lignes), pas un
      seul rectangle englobant — plus simple et fidèle à la mise en page réelle.
    - Phrase transmise à la fonction via `codifierPourAttribut()`/`decoderAttribut()` (base64,
      `btoa(unescape(encodeURIComponent(...)))`) plutôt qu'interpolée telle quelle dans l'attribut
      `onclick` : élimine tout risque d'échappement de guillemets/apostrophes cassant l'attribut
      HTML ou l'appel JS (cause du bug déjà rencontré et documenté sur l'ancienne implémentation).
    - **Logique de correspondance vérifiée isolément** (script Node ad hoc, sans dépendre de
      pdf.js/canvas — voir ci-dessous) sur trois cas : phrase répartie sur 3 items/lignes, phrase
      avec espacement irrégulier dans le PDF source, phrase absente de la page (ne doit pas
      planter). **Non vérifié avec un vrai rendu PDF dans cet environnement** : pdf.js est chargé
      depuis un CDN bloqué par le proxy réseau de développement ici (même limitation déjà
      documentée pour d'autres fonctionnalités liées à pdf.js/tesseract.js) — à confirmer par
      l'étude sur un compromis réel.
- **Nouvelle série de retouches sur la fiche dossier (tiroir), remontées par l'étude en testant
  les changements précédents en conditions réelles** :
  - **Champs "Adresse"/"Prix de vente" alignés sur le style des autres champs de la
    classification** : ils n'affichaient qu'une icône (`map-pin`/`banknote`) sans libellé, alors
    que "Type de vente", "Rôle du notaire" et "Responsable" affichent tous un texte ("Type de
    vente : ..."). Cette dissymétrie devenait particulièrement visible une fois la ligne repliée
    sur plusieurs lignes dans la largeur étroite du tiroir (~520px) : deux items "orphelins" (une
    icône seule) au milieu d'items étiquetés. Remplacés par "Adresse :"/"Prix de vente :", mêmes
    icônes retirées — cohérent avec le reste de la ligne, plus rien à deviner à partir d'une seule
    icône.
  - **Badge "🤝 Participant" retiré entièrement** de l'en-tête de la fiche : il ne s'affichait que
    pour ce rôle (l'instrumentaire, cas par défaut, n'affichait rien à cet endroit) — signalé par
    l'étude comme visuellement incohérent ("parfois il y a Participant avec un point gris mais pour
    instrumentaire non"). Redondant de toute façon avec le sélecteur "Rôle du notaire :
    Instrumentaire/Participant" déjà présent et toujours visible juste en dessous, qui couvre déjà
    l'information dans les deux cas sans ce trou. `.badge-role` (CSS) supprimée avec lui.
  - **Bug corrigé : la position du bouton "Changer de dossier"/"Lier un dossier local" dépendait
    de la longueur du nom du dossier** ("tout est à la suite [et] ça se balade", signalé par
    l'étude) — il vivait comme second élément inline à l'intérieur de `.nom-dossier`, à la suite du
    badge de statut + nom + crayon (`.nom-affichage`, `display: inline-flex`) : selon que le nom
    prenait une ou deux lignes, le bouton se retrouvait tantôt collé juste après le nom, tantôt
    repoussé à la ligne suivante, sans position stable. Déplacé dans son propre bloc
    (`.dossier-lien-local-ligne`) juste après `.nom-dossier`, toujours sur sa propre ligne sous le
    nom quelle que soit sa longueur. `flex-wrap: wrap` ajouté à `.nom-affichage`/`.nom-edition` au
    passage (le nom pouvait sinon rester sur une seule ligne flex et déborder au lieu de passer
    normalement à la ligne pour un nom long).
- **Logo "CLAIRE" : police du mot-symbole changée de Bodoni Moda vers Montserrat**, à la demande
  explicite de l'étude après le premier essai (voir plus haut, inspiré d'une référence "Sage").
  `index.html` charge Montserrat (600/700) à la place de Bodoni Moda dans le lien Google Fonts ;
  `.brand-word` passe à `font-family: 'Montserrat', 'Inter', ...` en gras, avec un `letter-spacing`
  légèrement négatif (Montserrat en gras/capitales a tendance à paraître large sans ce
  resserrement). Les réglages spécifiques à Bodoni Moda (`font-optical-sizing`,
  `font-variation-settings: 'opsz' 90`, propres à cette police à axes variables) sont retirés,
  sans objet pour Montserrat. Le reste de l'interface (Inter partout ailleurs) reste inchangé.
- **Refonte de l'en-tête de la fiche dossier (tiroir)**, à partir d'une maquette complète fournie
  par l'étude (fichier "Fiche_Dossier_standalone.html", un artefact "Nocturne" empaqueté — extrait
  via son manifeste JSON pour en lire le HTML/CSS source). Reprise pour sa STRUCTURE uniquement :
  la maquette utilise sa propre palette indigo/violette (`--color-bg: #161826`, `--color-accent:
  #9184d9`), explicitement écartée — même principe que pour le logo "Sage"/la finition
  typographique "Nocturne" précédentes, aucune couleur de la maquette reprise telle quelle,
  uniquement nos tokens déjà en place.
  - **Nouvel ordre, en une seule colonne verticale** (`renderCarteDossier()`) : badge de statut +
    "Archiver"/"Supprimer" d'abord regroupés sur une même ligne (`.dossier-head-barre`), puis le
    nom + crayon, puis "Changer de dossier"/"Lier un dossier local", un filet de séparation
    (`.dossier-head-divider`), l'adresse et le prix (chacun sur sa propre ligne avec une icône —
    `.dossier-info-ligne`), un second filet, puis la grille Type de vente/Rôle du
    notaire/Responsable. Remplace l'ancien découpage en deux zones côte à côte
    (`.dossier-head-principale` à gauche, `.dossier-head-actions` à droite, classes supprimées) :
    le badge de statut vivait auparavant dans le nom et Archiver/Supprimer à l'opposé de la fiche,
    loin l'un de l'autre pour deux informations qui répondent à la même question ("où en est ce
    dossier, qu'est-ce que je peux en faire").
  - **Adresse/prix reviennent à une icône sans libellé texte** (`map-pin`/`banknote`, retirés puis
    remis dans la session — voir l'entrée "Champs 'Adresse'/'Prix de vente' alignés..." plus haut) :
    contrairement à cette tentative précédente où l'icône seule posait problème en se retrouvant
    coincée au milieu d'items textuels sur une ligne qui se repliait de façon inégale, chaque champ
    a maintenant sa PROPRE ligne pleine largeur (`.dossier-adresse-prix`/`.dossier-info-ligne`) :
    assez de place pour qu'une icône reste lisible sans ambiguïté, plus besoin du texte "Adresse :"/
    "Prix de vente :" en plus.
  - **Type de vente / Rôle du notaire / Responsable passent d'un libellé-en-ligne
    (`.select-edit`, soulignement en tirets) à une grille avec libellé AU-DESSUS du champ**
    (`.dossier-classification-grid`/`.classif-champ`/`.select-classif`, `<select>` avec bordure et
    fond `--paper-sunk`, plus proche visuellement d'un vrai champ de formulaire) — repris de la
    maquette. `.select-edit`/`.classif-item`/`.dossier-classification` (classes désormais inutilisées)
    supprimées ; la règle d'impression qui masquait `.select-edit` référence maintenant
    `.select-classif`, même comportement (ces trois champs ne s'impriment pas, déjà le cas avant).
  - **Grille à `minmax(165px, 1fr)`, pas 140px** : à 140px, la grille tenait sur 3 colonnes dans la
    largeur du tiroir (~520px) mais tronquait le nom le plus long de la liste des responsables
    ("Bastien ANGLUMENT") dans son `<select>`. À 165px elle bascule à 2 colonnes, "Responsable"
    prend sa propre ligne pleine largeur et le nom n'est plus coupé — vérifié visuellement
    (Playwright, avant/après ce changement de seuil).
  - Vérifié visuellement (Playwright, clair et sombre) sur le dossier utilisé comme exemple par
    l'étude dans sa maquette (mêmes nom/adresse/prix).
- **Tiroir élargi à 620px (`.drawer-panneau`), adresse et prix remis côte à côte** : demandé juste
  après la refonte ci-dessus. `.dossier-adresse-prix` passe de `flex-direction: column` à une
  ligne (`flex-wrap: wrap`, chaque `.dossier-info-ligne` en `flex: 1 1 200px`) — les deux tiennent
  côte à côte dans la largeur désormais disponible, et repassent l'un sous l'autre seulement si la
  largeur vient à manquer (mobile). Le passage de 520px à 620px profite aussi à la grille de
  classification (Type de vente/Rôle du notaire/Responsable, voir l'entrée juste au-dessus) : plus
  de marge avant que ses 3 colonnes ne rebasculent à 2.
- **`motifNom` (détection par nom de fichier, voir plus haut) étendu à 4 pièces supplémentaires**,
  à partir de vraies conventions de nommage données par l'étude : `reponseAssainissement`
  ("rapport assainissement", "courrier assainissement", "SPANC", "assainissement" — tolère aussi
  "asainissement", faute de frappe courante sur le double "s"), `erp` ("ERP" seul ou "état des
  risques et pollution" — le sigle seul n'est autorisé QUE dans `motifNom` : dans le corps du texte
  `motif` reste sur l'intitulé complet, "ERP" y étant ambigu avec "Établissement Recevant du
  Public", ambiguïté qui ne se pose pas dans un nom de fichier d'un dossier de vente de maison),
  `avisTaxeFonciere` ("TF", éventuellement suivi de l'année — "TF 2024.pdf" — ou "taxes foncières"
  en toutes lettres) et `titrePropriete` ("Titre" seul, "titre de propriété" ou "titre vendeur").
  - **Principe explicitement demandé par l'étude, généralisé à toutes les pièces** : un document ne
    doit jamais être marqué reçu pour une pièce simplement parce qu'il partage un mot avec elle —
    ex. un certificat d'urbanisme qui mentionnerait "alignement" en passant (courrier de réponse de
    la mairie évoquant l'alignement de la voirie) ne doit pas valider "Certificat d'alignement".
    Déjà le cas pour cette pièce précise (`motifNom` exige la phrase complète "certificat
    d'alignement", jamais le mot seul) — vérifié explicitement par un nouveau test de non-régression
    (`tests/dossier-local.test.js`). Les 4 nouveaux motifs ont été écrits avec le même principe : les
    sigles courts autorisés bruts ("TF", "SPANC", "ERP", "Titre") sont ceux que l'étude a
    elle-même désignés comme des noms de fichiers complets et déjà spécifiques dans ses dossiers,
    pas des mots susceptibles d'apparaître incidemment dans le nom d'un autre document du même
    dossier.
- **Bug corrigé : le même problème de confusion entre documents existait aussi côté CONTENU
  (`motif`), pas seulement côté nom de fichier (`motifNom`) traité ci-dessus.** Signalé par
  l'étude avec un texte réel : un certificat d'urbanisme explique couramment, dans son PROPRE
  texte, où demander d'autres certificats (« Le certificat de numérotage est à demander à l'Hôtel
  de Ville... Le certificat d'alignement est à demander à la même adresse... ») sans être lui-même
  l'un d'eux — ce texte suffisait pourtant à cocher `certificatNumerotage`/`certificatAlignement`
  comme reçues à partir du seul certificat d'urbanisme. L'étude a précisé que la formulation exacte
  varie d'un document à l'autre (pas de phrase figée à exclure) — d'où un motif générique de RENVOI
  plutôt qu'une expression littérale :
  - `RE_SIMPLE_RENVOI_PIECE` reconnaît le type de tournure ("est/sont à demander", "peut/doit être
    demandé(s)", "s'obtient", "délivré par/sur demande", "sur demande à/auprès de"), pas une phrase
    précise — plus robuste face à des variations de rédaction d'un document à l'autre.
  - `motifPieceTrouve(motif, texte)` (nouvelle fonction, remplace l'appel direct à
    `piece.motif.test(texte)` dans `verifierPiecesDossier()`) parcourt TOUTES les occurrences de
    `piece.motif` dans le texte (pas seulement la première) et écarte celles précédées/suivies
    d'un renvoi de ce type dans une fenêtre de 80 caractères (même ordre de grandeur que
    `extraireContexte()` ailleurs dans le fichier) — une occurrence sans renvoi à proximité, plus
    loin dans le même texte, resterait valable si elle existait. Ne remplace que ce test précis :
    la recherche par nom de fichier (`motifNom`) et le reste de `verifierPiecesDossier()`
    (permissions, handles, progression) restent inchangés.
  - Deux tests de régression dans `tests/dossier-local.test.js` : le texte réel fourni par l'étude
    ne déclenche plus ni `certificatNumerotage` ni `certificatAlignement` ; un vrai certificat
    d'alignement (texte de délivrance, sans renvoi) reste bien détecté — la correction ne devait
    pas rendre la détection insensible aux vrais documents.
- **Changer de dossier lié remet tout à zéro, et l'offre de prêt/les pièces d'urbanisme sont
  désormais cherchées dans le MÊME parcours du dossier local**, deux bugs liés signalés par
  l'étude en une seule fois :
  - **Statuts non remis à zéro en changeant de dossier lié.** `lierDossierLocal()` ne préremplissait
    la checklist de pièces à "manquante" qu'au tout premier lien (`if (!etaitDejaLie && ...)`) —
    en choisissant ensuite un AUTRE dossier local (`changerDossierLocal()`, simple alias de
    `lierDossierLocal()`, voir son historique plus haut), les statuts "reçue"/"manquante" de
    l'ANCIEN dossier restaient affichés tels quels le temps qu'une nouvelle vérification les
    corrige un par un, ce qui pouvait laisser croire à tort qu'une pièce était déjà trouvée dans le
    nouveau dossier. Le garde-fou `!etaitDejaLie` est supprimé : `d.pieces` repart entièrement à
    `'manquante'` (plus un simple complément des clés manquantes) et `d.offrePretStatut`/
    `d.montantPret` repartent à `'inconnu'`/`null` à CHAQUE lien, premier ou non — cohérent avec le
    principe déjà appliqué à l'import d'un dossier d'une autre machine dans
    `normaliserDossierImporte()` ("un statut dérivé de PDF locaux ne doit pas être conservé sans
    revérification").
  - **Les deux recherches (offre de prêt, pièces d'urbanisme) devaient être "liées" dans un même
    parcours**, pas deux parcours indépendants du dossier local : `verifierOffrePret()`
    s'arrêtait (`break`) dès la première offre de prêt reconnue, y compris si c'était le tout
    premier PDF lu — la recherche des pièces d'urbanisme, faite ensuite par un second appel
    (`verifierPiecesDossier()`) séparé, repartait alors de zéro sur le même dossier au lieu de
    profiter du parcours déjà en cours. Les deux fonctions sont fusionnées en une seule,
    `verifierDossierLocal(id, viaClicUtilisateur)` : un seul parcours de `fichiersPdfRecursifs()`
    teste l'offre de prêt (si `!d.sansPret`) ET chaque pièce encore manquante (si
    `d.roleNotaire !== 'participant'`) sur chaque fichier lu, et ne s'arrête que quand les DEUX
    sont résolus (ou le dossier entièrement parcouru) — trouver l'offre tôt ne coupe plus court à
    la recherche des pièces restantes, et réciproquement. `lireTextePdfVerification()` (déjà
    partagée) n'est appelée qu'une fois par fichier pour les deux recherches, comme avant.
    `verifierOffrePretDepuisBouton`/`verifierPiecesDossierDepuisBouton` sont remplacées par un seul
    `verifierDossierLocalDepuisBouton(id, btn)`, branché aux trois endroits qui déclenchaient l'une
    ou l'autre (bouton rapide de la ligne de tableau, "Revérifier les pièces" dans le tiroir,
    "Revérifier" dans la carte "Obtention du prêt"), ainsi qu'à `reconfirmerAcces()`,
    `reconfirmerTousLesAcces()` et `revérifierDossiersLiesAuDemarrage()`, qui appelaient
    jusque-là les deux anciennes fonctions l'une après l'autre. Le toast de résultat combine
    maintenant les deux messages (offre + pièces) en un seul, plutôt que d'en afficher deux à la
    suite. Vérifié visuellement (Playwright, dossier synthétique relié) : les trois boutons
    rendent bien `verifierDossierLocalDepuisBouton` dans le DOM généré, `npm test` reste vert
    (115 tests).
- **Bug corrigé : un vrai fichier de l'étude ("Certificat_alignement_et_nume_rotage_DI_132.pdf")
  n'était détecté ni comme certificat d'alignement ni comme certificat de numérotage**, malgré les
  `motifNom` déjà en place pour ces deux pièces. Deux causes cumulées, corrigées ensemble et
  généralisées à TOUTE la checklist (pas seulement ces deux pièces, demandé explicitement) :
  - **Underscores/tirets au lieu d'espaces.** Les `motifNom` sont tous écrits avec `\s+` comme
    séparateur naturel du français, mais un vrai nom de fichier de l'étude remplace couramment les
    espaces par des underscores ("Certificat_alignement...") — `\s+` ne matche jamais un
    underscore. Nouvelle fonction `normaliserNomPourMotif(nom)` (remplace `[_-]+` par un espace),
    appelée sur `entree.name` dans `verifierDossierLocal()` juste avant de tester chaque
    `motifNom` — jamais sur `motif` (le contenu du PDF, un vrai texte qui n'a pas ce problème).
    S'applique automatiquement à TOUTES les pièces de la checklist, sans toucher aux regex
    elles-mêmes : underscores et tirets sont désormais transparents pour n'importe quel `motifNom`
    présent ou futur.
  - **Un mot coupé par l'outil de nommage au niveau de sa lettre accentuée.** Même une fois les
    underscores ramenés à des espaces, "numérotage" restait introuvable : le nom réel contenait
    "nume_rotage", soit le mot coupé en deux pile après la lettre accentuée transcrite (é → "e"
    puis séparateur inséré). Motif générique reconnu (vraisemblablement une conséquence du même
    outil/de la même convention de nommage que le problème d'underscore ci-dessus, pas un accident
    isolé) : chaque `motifNom` contenant une lettre accentuée EN PLEIN MILIEU d'un mot (pas en
    tête) tolère désormais un `\s?` optionnel juste après cette lettre — `certificatNumerotage`
    (`num[ée]\s?rotage`), `avisTaxeFonciere` (`fonci[èe]\s?re`), `titrePropriete`
    (`propri[ée]\s?t[ée]\s?`, deux positions). `certificatAlignement` n'avait pas cet accent mais
    exigeait strictement "d'alignement" avec l'apostrophe — assoupli en rendant "d'" optionnel
    (`certificat\s+d?['’]?\s*alignement`), même schéma que `certificatUrbanisme` qui l'était déjà,
    pour couvrir "Certificat_alignement" (sans "d'" du tout) comme ce fichier réel.
  - Quatre nouveaux tests dans `tests/dossier-local.test.js`, dont un avec le nom de fichier exact
    fourni par l'étude — `npm test` reste vert (118 tests).
- **Date introduite par "à compter du/de" écartée des échéances, sauf si la clause parle de la
  réitération de l'acte de vente lui-même** : signalé par l'étude avec un exemple réel ("à compter
  du 1er Janvier 2028."). Cause : `suggererEcheance()` classe "acte" toute date dont le contexte
  (jusqu'à ~480 caractères, borné par les points) contient "acte authentique"/"réitération"/
  "signature de l'acte" — sans regarder si CETTE date précise a un rapport réel avec l'acte. Une
  clause de prise d'effet (intérêts de retard, taux, prorata de taxe foncière, garantie...)
  partageant son paragraphe avec une simple mention de l'acte authentique se faisait donc
  classer "acte" à tort, alors que "à compter du/de" introduit une date de PRISE D'EFFET, pas une
  échéance à respecter (contrairement à "au plus tard le"/"avant le", déjà couvertes par
  `CUE_FUTUR_RE`). Nouveau garde-fou dans `detecterDatesDepuisTexte()` (fonction interne
  `ajouter()`) : une date immédiatement précédée de "à compter du/de" (`A_COMPTER_RE`, testé sur
  les ~30 caractères juste avant, pas sur tout le contexte) est écartée d'office — SAUF si le
  contexte de la clause mentionne la réitération de l'acte (`\br[ée]it[ée]r`, qui couvre aussi bien
  le verbe "sera réitéré" que le nom "réitération"), seul cas où "à compter du" désigne réellement
  la date de réitération de l'acte, une vraie échéance à garder. Ne s'applique qu'aux dates
  calendaires détectées directement dans le texte (`reNum`/`reTexte`) : les délais relatifs déjà en
  place (`reDelai`, qui exige lui-même "à compter de"/"à partir de" DANS son propre motif) ne sont
  pas concernés, la phrase "à compter du/de" y fait partie intégrante du motif recherché, pas d'un
  contexte à écarter. Deux tests de régression dans `tests/dates.test.js` (le cas à écarter, et le
  cas à garder avec réitération) — `npm test` reste vert (120 tests).
- **Bug corrigé, cette fois de façon STRUCTURELLE plutôt que clause par clause : des pièces
  d'urbanisme/préemption/titre de propriété étaient marquées "reçues" alors qu'aucun document
  distinct n'existait dans le dossier local — le système avait seulement trouvé le mot dans le
  COMPROMIS lui-même** (une copie du compromis se trouve elle-même dans le dossier local relié,
  et `verifierDossierLocal()` lit tous les PDF sans distinguer le compromis des vraies pièces
  annexées). Signalé par l'étude avec TROIS clauses réelles de compromis différents (certificat
  d'urbanisme, article L.410-1 a), droit de préemption) — l'étude a explicitement prévenu que
  fournir une clause à exclure à chaque fois n'était pas soutenable ("chaque agence a des clauses
  différentes, il y en a des centaines"). Diagnostic : ces trois clauses (et la toute première
  clause fournie plus haut sur les titres de propriété) sont toutes des clauses de CONDITION
  SUSPENSIVE qui DÉCRIVENT la pièce (ce qu'elle ne doit pas révéler, ce qui se passe si elle est
  exercée) — un boilerplate quasi systématique de N'IMPORTE QUEL compromis, que la pièce ait été
  réellement obtenue ou non. Le problème n'est donc pas une formulation précise à exclure au cas
  par cas (`RE_SIMPLE_RENVOI_PIECE`/`motifPieceTrouve`, déjà en place, corrige un piège de
  rédaction différent — un document qui renvoie vers un autre sans être lui-même annexé) : c'est
  que ce TYPE de pièce (une condition juridique générique) est structurellement toujours mentionné
  dans le compromis, quelle que soit l'étude ou sa formulation.
  - **Solution structurelle, pas une regex de plus** : `certificatUrbanisme`, `certificatAlignement`,
    `certificatNumerotage`, `renonciationPreemption` et `titrePropriete` (voir
    `PIECES_URBANISME`/`PIECES_AUTRES` dans `script.js`) n'ont plus de `motif` (recherche dans le
    CONTENU d'un PDF) DU TOUT — seul `motifNom` (le NOM du fichier) les détecte désormais. Une
    vraie pièce administrative distincte a, dans la pratique déjà observée sur des noms de
    fichiers réels de l'étude (voir les entrées précédentes de cet historique), un nom explicite
    ("Certificat d'urbanisme.pdf", "TF 2024.pdf", "Titre.pdf"...) — s'appuyer uniquement sur le nom
    est plus fiable que d'essayer de deviner, clause par clause et agence par agence, ce qui
    relève d'une condition juridique générique plutôt que d'un document réellement produit et
    joint au dossier.
  - `verifierDossierLocal()` (la boucle de test du contenu) garde désormais `if (piece.motif && ...)`
    avant d'appeler `motifPieceTrouve()` : certaines pièces de la checklist n'ont simplement plus
    de motif de contenu à tester.
  - **ERP/diagnostics/taxe foncière/assainissement gardent leur `motif`**, volontairement : l'étude
    les a explicitement jugés moins problématiques ("pourquoi pas") — leur mention dans un
    compromis est plus rarement une clause de condition suspensive répétée systématiquement,
    contrairement aux cinq pièces ci-dessus.
  - `certificatUrbanisme.motifNom` élargi pour reconnaître aussi l'alias "réponse urbanisme"/
    "réponse d'urbanisme" (terme utilisé par l'étude pour désigner le même document) ; un
    `motifNom` (`pr[ée]emption`) a été ajouté à `renonciationPreemption`, qui n'en avait pas
    jusqu'ici puisque son seul signal était le contenu, désormais retiré.
  - Tests mis à jour dans `tests/dossier-local.test.js` : un nouveau test vérifie explicitement que
    ces 5 pièces n'ont plus de `motif` (et gardent bien un `motifNom`) ; les deux anciens tests de
    `motifPieceTrouve` ciblant certificatNumerotage/certificatAlignement (devenu un cas qui ne peut
    plus se produire pour elles, par construction) sont reformulés sur `reponseAssainissement`, qui
    garde un motif de contenu — le comportement générique de `motifPieceTrouve` (écarter un renvoi,
    rester sensible à une vraie mention) reste ainsi testé. `npm test` reste vert (121 tests).
- **Généralisation demandée par l'étude : TOUTES les pièces de la checklist sont désormais
  détectées uniquement par le NOM DU FICHIER (`motifNom`), plus aucune par son contenu (`motif`).**
  Le correctif précédent (voir juste au-dessus) n'avait retiré `motif` que sur 5 pièces
  particulièrement exposées (conditions juridiques citées en boilerplate dans le compromis).
  L'étude a demandé de généraliser tout de suite à ERP, diagnostics, taxe foncière, assainissement
  et aux trois pièces de copropriété (état daté, article 20-II, RIB) plutôt que d'attendre un
  signalement pièce par pièce sur le même risque. `PIECES_URBANISME`/`PIECES_AUTRES`/
  `PIECES_COPROPRIETE` n'ont donc plus aucun champ `motif` : `etatDate`/`article20`/`ribCopro`
  (qui n'avaient jamais eu de `motifNom` jusqu'ici, seulement un `motif`) récupèrent l'ancienne
  regex de contenu telle quelle comme `motifNom` — un premier jet comme les autres, faute
  d'exemples réels de noms de fichiers pour ces trois pièces pour l'instant.
  - **Effet secondaire notable, pas la motivation initiale mais confirmé utile** : comme plus
    aucune pièce n'a besoin du contenu d'un PDF, `verifierDossierLocal()` peut sauter l'ouverture
    (et l'éventuel repli OCR) d'un fichier dès que l'offre de prêt n'a plus besoin d'être
    recherchée dans son contenu (déjà trouvée, ou non applicable — `sansPret`/rôle participant) ET
    qu'aucune pièce encore manquante n'a de `motif` (donc jamais, dans l'état actuel). Un nouveau
    garde-fou dans la boucle de `verifierDossierLocal()` (`chercherContenuOffre`/
    `piecesRestantesAvecMotif`) `continue` vers le fichier suivant sans l'ouvrir dans ce cas —
    volontairement écrit de façon générale (basé sur la présence d'un `motif` parmi les pièces
    encore à chercher, pas sur une liste figée) pour rester correct si une pièce retrouve un jour
    un motif de contenu, plutôt que de supprimer purement et simplement cette branche de code.
    Concrètement : un dossier avec l'offre déjà reçue (ou sans condition de prêt) ne lit plus AUCUN
    PDF pour vérifier ses pièces, seuls leurs noms sont consultés — un gain de vitesse net sur un
    dossier local volumineux (beaucoup de PDF, notamment ceux nécessitant un repli OCR).
  - **`nbAnalyses` (fichiers réellement ouverts) et un nouveau `nbFichiersRencontres` (tous les PDF
    croisés, ouverts ou non) sont maintenant distincts** : le toast "Aucun PDF trouvé dans le
    dossier..." se basait sur `nbAnalyses === 0`, ce qui aurait affiché ce message à tort dès que
    plus aucun fichier n'était ouvert (cas désormais courant) alors que des PDF étaient bel et bien
    présents et déjà vérifiés par leur nom. Le toast utilise maintenant `nbFichiersRencontres`.
  - Tests de `tests/dossier-local.test.js` réécrits en conséquence : le test structurel sur
    l'absence de `motif` porte maintenant sur TOUTE la checklist (pas seulement les 5 pièces du
    correctif précédent) ; le test des noms de fichiers conventionnels couvre aussi
    etatDate/article20/ribCopro ; les deux tests de `motifPieceTrouve` (devenue sans appelant réel
    dans `verifierDossierLocal()` puisqu'aucune pièce n'a plus de `motif`, mais conservée pour un
    usage futur) sont exercés sur un motif ad hoc plutôt que sur celui d'une pièce réelle, pour ne
    pas perdre la couverture de son comportement générique. `npm test` reste vert (119 tests).
- **Série de retouches demandées par l'étude sur la sidebar et le tiroir dossier** :
  - **"Nouveau dossier" déplacé en tête de la sidebar et sur fond bleu en permanence**, plutôt que
    seulement quand cet onglet est sélectionné : un raccourci de création toujours visible, sur le
    modèle d'un bouton d'action principal. Nouvelle classe `.sidebar-cta` (même dégradé/ombre que
    `.sidebar-link.actif`, factorisés dans une seule règle CSS) appliquée en dur dans `index.html`,
    indépendamment de `classList.toggle('actif', ...)` dans `definirOnglet()` (inchangée, continue
    de suivre l'onglet réellement affiché) — les deux classes cohabitent sans conflit visuel
    puisqu'elles produisent le même rendu.
  - **"Simulateur provision sur frais" renommé "Simulateur de provision"** dans la sidebar, et
    **"Offres de prêt introuvables" renommé "Offres de prêts en attente"** — d'abord sur la seule
    tuile KPI du Tableau de bord (`renderKpisDashboard()`), puis étendu sur demande explicite au
    bandeau de stats de l'onglet Suivi (`renderStatsSuivi()`) : les deux portent maintenant le
    même libellé, une seule formulation pour ce chiffre dans tout l'outil.
  - **Ajout d'une échéance personnalisée après l'enregistrement du dossier**, jusqu'ici possible
    uniquement à la création (`autresEnCours`/`renderAutres()`, étape "Vérifier" du wizard). Un
    bouton "+ Ajouter une échéance" sous la grille `.tabs` du tiroir (`renderAjoutEcheance()`)
    bascule vers un mini-formulaire inline (nom + date, réutilise `.date-block.autre`/`.autre-row`
    du formulaire de création plutôt que de dupliquer ce style) ; `ajouterEcheanceApresCoup()`
    pousse directement l'entrée dans `d.autres` du dossier déjà sauvegardé (pas dans un état
    temporaire à valider plus tard, comme `autresEnCours`) et journalise l'ajout dans l'historique.
    État d'affichage (`ajoutEcheanceOuvert`, un simple booléen puisqu'un seul dossier est ouvert à
    la fois dans le tiroir) remis à `false` à chaque ouverture/fermeture du tiroir
    (`ouvrirDossierDrawer`/`fermerDossierDrawer`), même principe que `dossierOuvert` lui-même.
  - **Petite croix en haut à droite pour supprimer une échéance personnalisée**, pendant du point
    précédent — demandé pour les mêmes raisons. Visible UNIQUEMENT sur les tabs "autre" (pas
    Obtention du prêt/Signature de l'acte/Vente préalable, qui ont déjà leur propre mécanisme de
    recatégorisation via `changerCategorie()` et ne sont pas de simples entrées de liste à retirer).
    `.tab` passe à `position: relative` pour ancrer `.tab-suppr` (`position: absolute`) sans décaler
    le contenu de la carte. `supprimerEcheanceAutre()` demande confirmation
    (`demanderConfirmation()`, même mécanisme que Archiver/Supprimer un dossier) avant de retirer
    l'entrée de `d.autres` par son index et de journaliser la suppression.
  - Les deux nouveaux éléments (`.tab-suppr`, `.ajout-echeance-btn`/`.ajout-echeance-form`) sont
    ajoutés à la liste déjà existante de sélecteurs masqués à l'impression (`@media print`), aux
    côtés de `.icon-btn`/`.icon-crayon`/`.select-classif`... — des contrôles d'édition n'ont pas
    leur place sur la fiche imprimée.
  - Vérifié visuellement et fonctionnellement (Playwright) : capture de la sidebar (CTA permanent
    en tête), ouverture du tiroir, ajout d'une échéance via le mini-formulaire (vérifié en relisant
    `d.autres` après coup) puis suppression via la croix avec confirmation (idem) — `npm test`
    reste vert (119 tests, aucune fonction pure testable modifiée par ce chantier).
  - **Recherche automatique des pièces à la liaison d'un dossier local : déjà en place, vérifié
    plutôt que redéveloppé.** Demandé par l'étude, mais `lierDossierLocal()` appelle déjà
    `verifierDossierLocal(id, true)` sans condition dès qu'un dossier est relié (voir "Changer de
    dossier lié remet tout à zéro..." plus haut, qui a fusionné offre et pièces dans un seul
    parcours) — cette fonction teste la checklist de pièces dès que `d.roleNotaire !== 'participant'`,
    indépendamment de la recherche de l'offre de prêt. Rien à changer côté code ; à confirmer par
    l'étude si le comportement observé en pratique diffère malgré tout (auquel cas fournir un cas
    précis plutôt qu'une description générale, comme pour tout bug de ce fichier).
  - **Renommage "Offres de prêt introuvables" → "Offres de prêts en attente" étendu au bandeau de
    stats de l'onglet Suivi** (`renderStatsSuivi()`), volontairement laissé de côté au premier
    passage (voir plus haut, qui ne touchait que la tuile KPI du Tableau de bord) — l'étude a
    ensuite demandé le même renommage aux deux endroits.
  - **Couleur de l'onglet actif de la sidebar : bleu → gris foncé neutre, le bleu réservé
    exclusivement à "Nouveau dossier".** Avant ce correctif, `.sidebar-link.actif` et
    `.sidebar-link.sidebar-cta` (voir juste au-dessus) partageaient la même règle CSS et donc la
    même couleur bleue — l'étude a demandé de les distinguer pour que le bleu ne signale plus QUE
    "Nouveau dossier", un onglet simplement sélectionné (Tableau de bord/Suivi/Simulateur) devenant
    gris foncé. Nouveau token `--sidebar-actif-bg` (dégradé graphite neutre, `#4B5157`→`#363A3F` en
    clair, légèrement éclairci en sombre `#5C6369`→`#454A50` pour rester visible sur le fond de
    sidebar déjà sombre) — délibérément un gris neutre sans teinte bleue, cohérent avec la décision
    de longue date "palette du mode sombre en gris neutres, pas de navy". Les deux règles
    (`.actif`/`.sidebar-cta`), jusque-là fusionnées en une seule, sont séparées ; l'ombre portée de
    `.actif` perd aussi sa teinte bleue (`rgba(37,99,235,...)` → `rgba(0,0,0,...)`), celle de
    `.sidebar-cta` reste inchangée. Vérifié visuellement (Playwright, clair et sombre) : "Nouveau
    dossier" reste bleu en permanence, l'onglet sélectionné (testé sur "Suivi des dossiers") est
    bien gris foncé dans les deux thèmes.
- **Nouvelle demande de l'étude sur les tuiles de statistiques et la recherche** :
  - **Tuile "offres à vérifier" remplacée par "dossiers avec pièces manquantes" dans le bandeau de
    l'onglet Suivi** (`renderStatsSuivi()`) : `piecesIncompletes` (déjà calculée par
    `calculerStatsPortefeuille()`, déjà utilisée par le Tableau de bord) était jusqu'ici absente de
    ce bandeau — elle y remplace directement `aVerifier`, jugée moins utile par l'étude que le
    signal déjà mis en avant côté Tableau de bord.
  - **Tuile "offres à vérifier" retirée du Tableau de bord** (`renderKpisDashboard()`) : simple
    suppression, la 5e tuile "dossiers avec pièces manquantes" (`piecesIncompletes`) existait déjà
    séparément et reste en place. `.kpis-dashboard` passe de `repeat(6, 1fr)` à `repeat(5, 1fr)`
    (nombre de tuiles réellement affichées, sans quoi la grille aurait laissé une case vide).
  - **Recherche de dossier ajoutée au Tableau de bord.** Le Suivi avait déjà `#recherche-dossiers`
    (filtre une liste déjà affichée) ; le Tableau de bord, lui, ne montre jamais tous les dossiers
    (seulement KPI + Actions urgentes + échéances à 7 jours) — un simple filtre sur place n'aurait
    donc rien eu à filtrer. Nouveau champ `#recherche-dashboard` dans `.dash-header`, avec un menu
    de résultats (`renderRechercheDashboard()`, jusqu'à 8 dossiers dont le nom/responsable
    correspond) qui s'ouvre sous le champ dès qu'on tape ; chaque résultat mène directement au
    tiroir du dossier via `ouvrirDossierDepuisDashboardRecherche()` (vide le champ puis réutilise
    `ouvrirDossierDepuisDashboard()`, déjà utilisée par "Actions urgentes" — même chemin,
    bascule vers Suivi + ouverture du tiroir, pas une seconde implémentation). Recherche
    volontairement limitée aux dossiers actifs (comme le reste du tableau de bord), pas aux
    archivés.
  - **Surlignage des obligations du vendeur depuis le PDF : déjà en place, vérifié plutôt que
    redéveloppé.** Demandé par l'étude, mais `voirEngagementDansPdf()`/`renderEngagement()`
    (bouton "👁 p.X" sur chaque engagement de l'analyse juridique) couvrent déjà exactement cette
    fonctionnalité — voir leur historique plus haut ("Surlignage des engagements du vendeur dans
    l'aperçu PDF"). Fonctionne pendant l'import en cours (`pdfActuel` chargé en mémoire) ; sur un
    dossier déjà enregistré et rouvert, seul le numéro de page (non cliquable) reste affiché, pour
    la raison déjà documentée (le compromis est importé via un `<input type="file">` éphémère, pas
    un handle persistable) — limitation connue, pas un manque de cette demande précise. Rien à
    changer côté code ; à confirmer par l'étude si son attente portait spécifiquement sur un
    dossier déjà enregistré (auquel cas voir le chantier balisé mais non engagé, plus haut).
  - Vérifié visuellement (Playwright, clair et sombre) : dossier synthétique injecté, recherche
    "dupont" sur le Tableau de bord ouvrant bien le tiroir du bon dossier, grille de 5 tuiles KPI
    sans case vide, bandeau Suivi avec la nouvelle tuile — `npm test` reste vert (119 tests, aucune
    fonction pure testable modifiée par ce chantier).
- **Sélection manuelle de texte dans l'aperçu du compromis, pour ajouter à la main un engagement du
  vendeur que la détection automatique a manqué.** Réponse directe au point resté ouvert juste
  au-dessus ("à confirmer par l'étude si son attente portait spécifiquement sur..." — l'étude a
  répondu "Oui" puis précisé le besoin réel, plus simple que le chantier `showOpenFilePicker()`
  envisagé : pouvoir sélectionner soi-même le texte d'une clause dans le compromis affiché, pendant
  l'import, plutôt que de la ressaisir ailleurs sans laisser de trace dans l'analyse juridique.
  - **Couche de texte invisible mais sélectionnable posée sur chaque page** (`construireCoucheTexte()`,
    appelée depuis `chargerToutesLesPagesPdf()` juste après le rendu du canvas de chaque page) :
    un `<span>` transparent par item `getTextContent()` de pdf.js, positionné via la même
    transformation déjà utilisée par `voirDateDansPdf()`/`voirEngagementDansPdf()` pour poser un
    surlignage ponctuel — appliquée ici à TOUS les items d'une page plutôt qu'à un seul passage
    recherché après coup. C'est une version simplifiée du `TextLayerBuilder` natif de pdf.js,
    réécrite à la main plutôt que de charger son module dédié (non inclus dans le seul `pdf.min.js`
    déjà chargé depuis cdnjs). L'alignement horizontal (largeur du glyphe du PDF vs largeur rendue
    par la police de repli du navigateur) est corrigé après coup par un `scaleX()` calculé sur la
    largeur réellement rendue de chaque `<span>` — sans ça, la fin d'une sélection dériverait de
    plus en plus loin du texte visible au fil d'une ligne. Le texte reste invisible
    (`color: transparent` dans `.pdf-text-layer`, voir style.css) : seule la sélection du
    navigateur doit être visible (`::selection`), jamais le texte lui-même par-dessus le rendu déjà
    net du canvas.
  - **Barre flottante** (`#pdf-selection-toolbar`, `gererSelectionPdf()` branchée sur un
    `mouseup` global) : dès qu'une sélection non vide se trouve dans `#pdf-pages-container` (une
    sélection ailleurs dans l'outil, ex. dans le tableau du Suivi, est ignorée — vérifié), elle
    propose directement les trois catégories déjà utilisées pour les engagements détectés
    automatiquement (Entretien / Travaux / Document, mêmes clés que `libelles` dans
    `renderEngagement()`), sans étape intermédiaire "+ Ajouter" : un clic sur une catégorie suffit.
    Positionnée en `position: fixed` au-dessus du milieu de la sélection (le rectangle de la
    sélection est déjà en coordonnées viewport, pas besoin de le recalculer). Numéro de page déduit
    du `.pdf-page-bloc-N` ancêtre du nœud de départ de la sélection.
  - `ajouterEngagementManuel(type)` pousse `{phrase, type, page, manuel: true}` dans
    `analyseJuridiqueActuelle.engagements` — même tableau, même format `{phrase, type, page}` que
    les engagements détectés automatiquement (`manuel: true` en plus), donc `ajouterDossier()` les
    enregistre sans aucun changement : ils sont indiscernables des engagements automatiques une
    fois le dossier créé, sauf ce drapeau. `afficherAnalyseJuridique()` est simplement rappelée
    pour rafraîchir la liste (elle est déjà un simple rendu piloté par l'état, sans effet de bord à
    dupliquer — même principe que documenté plus haut pour son second appel après `pdfActuel`).
  - `renderEngagement()` affiche "Ajouté manuellement" (texte simple, pas d'icône — volontairement
    différent du badge de confiance "≈ estimée"/"⚠️ à vérifier" des dates, qui reste réservé aux
    dates) à côté d'un engagement ainsi ajouté, avec un bouton ✕ (`supprimerEngagementManuel(index)`)
    pour le retirer en cas d'erreur de catégorie/sélection — SEULS les engagements manuels sont
    retirables ainsi : corriger un engagement détecté automatiquement reste l'affaire de la regex
    (`extraireEngagementsVendeur`/`EXCLUSION_ENGAGEMENT_RE`), pas d'un retrait au cas par cas qui
    masquerait un vrai problème de détection au lieu de le corriger pour tous les prochains
    compromis.
  - Toolbar masquée (`masquerBoutonAjoutEngagement()`) à l'ouverture d'un nouvel import
    (`chargerToutesLesPagesPdf()`, avant de reconstruire les pages), après enregistrement du
    dossier (`reinitialiserFormulaire()`, aux côtés de la remise à zéro déjà existante de
    `analyseJuridiqueActuelle`), et sur Échap (nouvelle branche dans le gestionnaire clavier
    existant, entre la boîte de confirmation et le tiroir de fiche dossier dans l'ordre de
    superposition visuelle).
  - **Portée : fonctionne pendant l'import en cours** (le PDF doit être chargé dans
    `pdfActuel`/rendu dans `#pdf-pages-container`), **pas sur un dossier déjà enregistré et
    rouvert** — même limitation déjà documentée pour `voirEngagementDansPdf()` (le compromis est
    importé via un `<input type="file">` éphémère, jamais conservé). C'est délibérément resté ainsi
    ici : le besoin exprimé ("sélectionner nous-même le texte... quand on détecte une clause que tu
    n'as pas trouvée") se pose naturellement au moment où l'étude regarde l'aperçu pendant l'import,
    pas plusieurs jours après sur un dossier rouvert — le chantier `showOpenFilePicker()` pour
    étendre ça aux dossiers déjà enregistrés reste balisé mais non engagé (voir plus haut) si
    l'étude le demande un jour explicitement pour CE cas précis.
  - **Non vérifié avec un vrai rendu PDF dans cet environnement** : `pdf.js` est chargé depuis un
    CDN bloqué par le proxy réseau de développement ici, comme déjà documenté pour plusieurs
    fonctionnalités liées à pdf.js/tesseract.js — impossible d'importer un vrai compromis pour
    tester la sélection en conditions réelles. Vérifié à la place (Playwright) : l'ajout/le retrait
    d'un engagement "manuel" simulé directement en mémoire s'affiche et se comporte correctement
    dans les deux thèmes (marqueur, bouton ✕, compteur mis à jour) ; sélectionner du texte AILLEURS
    dans l'outil (ex. le titre du tableau de bord) laisse bien la barre flottante masquée ; aucune
    erreur JS dans la console en dehors des échecs de chargement CDN déjà connus. `npm test` reste
    vert (119 tests, aucune fonction pure testable ajoutée par ce chantier — la logique ajoutée
    dépend entièrement du DOM/de pdf.js). À confirmer par l'étude sur un compromis réel : que la
    zone de sélection suit correctement le texte affiché ligne par ligne, en particulier sur des
    polices embarquées inhabituelles (voir l'historique des PDF aux polices mal encodées plus haut).
- **Bug corrigé : le champ de recherche du Tableau de bord ne respectait pas la charte graphique**
  (apparence native du navigateur — pas de bordure/fond/rayon cohérents avec le reste de l'outil).
  Cause : `input[type="search"]` était absent de la règle générique qui donne leur style à tous les
  champs de formulaire (`input[type="text"], input[type="date"], input[type="email"],
  input[type="number"], textarea, select`) — `.dash-recherche` ne posait de son côté que
  `width`/`box-sizing`, rien d'autre. Ajouté à cette règle (et à son pendant `:hover`), même
  principe que l'ajout de `input[type="number"]` en son temps pour le calculateur : un futur champ
  `type="search"` hérite désormais du style commun sans avoir à y penser. `#recherche-dossiers`
  (Suivi) n'est pas concerné : il garde son propre habillage via `.toolbar-recherche input`, plus
  spécifique, qui l'emportait déjà.
  - **Champ déplacé en haut, regroupé avec "+ Nouveau dossier"** (`.dash-header-actions`, nouveau
    conteneur flex dans `index.html`) plutôt que de flotter seul entre le titre et le bouton (l'un
    à l'extrême droite, l'autre au milieu, via le seul `justify-content: space-between` de
    `.dash-header`) — l'étude voulait les deux actions lisibles comme un seul bloc, en haut à
    droite de l'en-tête. `.dash-recherche` passe d'un `flex: 1 1 260px` (pensé pour occuper l'espace
    central disponible) à une largeur fixe de 260px à l'intérieur de ce nouveau groupe ; sous
    1300px, `.dash-header-actions` passe en pleine largeur et le champ s'étire à côté du bouton
    plutôt que de garder sa largeur fixe (repris de l'ancien réglage `.dash-recherche { max-width:
    none }`, adapté au nouveau conteneur).
  - Vérifié visuellement (Playwright, clair/sombre, et à 700px de large) : le champ affiche
    maintenant la même bordure/le même fond que tous les autres champs de l'outil, reste collé au
    bouton "+ Nouveau dossier" à toutes les largeurs testées, et le menu de résultats s'aligne
    toujours correctement sous le champ (dossier synthétique injecté, recherche "dup"). `npm test`
    reste vert (119 tests).
- **Nouvelle série de demandes de l'étude, traitées indépendamment** :
  - **`certificatAlignement.motifNom` élargi : l'alignement et le numérotage sont parfois réunis
    dans UN SEUL document**, nommé "Alignement et numérotage"/"Certificat d'alignement et
    numérotage" ou une variante proche, SANS le mot "certificat" devant "alignement" dans ce cas —
    l'ancien motif (`certificat\s+d?['’]?\s*alignement`) l'aurait manqué puisqu'il exigeait ce mot.
    Une seconde alternative accepte désormais "alignement" sans "certificat" devant, mais
    UNIQUEMENT à proximité immédiate (20 caractères) du mot "numérotage" (dans un ordre ou l'autre)
    — pas un "alignement" nu n'importe où, ce qui aurait réintroduit le faux positif déjà corrigé
    une fois (un certificat d'urbanisme qui mentionne "réponse alignement voirie" en passant, voir
    le test de non-régression existant, toujours vert). Nouveau test dans
    `tests/dossier-local.test.js` pour "Alignement et numérotage.pdf"/"Numérotage et
    alignement.pdf", dans les deux sens.
  - **`avisTaxeFonciere` vérifié plutôt que retouché** : le motif déjà en place
    (`\bTF\b|taxes?\s+fonci[èe]\s?re`) reconnaissait déjà "Avis de taxes foncières" et ses variantes
    (singulier/pluriel, avec/sans accent, underscores) sans modification — confirmé par un test
    Node ad hoc avant de toucher au code, pour éviter une retouche inutile d'une regex déjà
    correcte. Le cas "Avis de taxes foncières.pdf" a simplement été ajouté à la liste d'exemples
    déjà testée dans `tests/dossier-local.test.js`, pour que cette couverture reste explicite.
  - **Tendance du nombre de dossiers actifs sur le Tableau de bord**, demandé par l'étude : "vs mois
    dernier"/"vs an dernier" sous la tuile KPI "dossier(s) actif(s)" (`.kpi-tendances`, deux petites
    lignes avec une flèche haut/bas + le delta signé). Calculée RÉTROACTIVEMENT
    (`calculerEvolutionPortefeuille()`/`compterDossiersActifsA()`/`etaitDossierActifA()`, toutes
    testables — voir `tests/divers.test.js`) à partir de l'historique déjà stocké sur chaque
    dossier (l'entrée "Dossier créé" à la création, "Dossier archivé"/"Dossier désarchivé" à chaque
    archivage — voir `archiverDossier()`), plutôt que via un nouveau mécanisme de relevé
    périodique : ce dernier n'aurait donné aucune profondeur historique avant plusieurs mois
    d'usage, alors que l'historique existant permet une réponse immédiate. Calcul mené sur `dossiers`
    en entier (pas seulement les actifs) : un dossier archivé aujourd'hui a pu être actif il y a un
    mois ou un an, l'exclure fausserait la comparaison. Un dossier supprimé (pas seulement archivé)
    n'a plus aucune trace, comme partout ailleurs dans l'outil — limite acceptée, cohérente avec le
    reste de l'application. Volontairement **aucune couleur succès/alerte** sur la hausse ou la
    baisse (`formaterTendance()`) : un nombre de dossiers actifs qui augmente n'est ni bon ni
    mauvais en soi pour l'étude (plus de charge, pas un indicateur de performance) — seule une
    flèche (icônes `trend-up`/`trend-down`, nouvelles dans `ICONES`) porte le sens de la variation,
    en gris neutre. Vérifié visuellement (Playwright, dossiers synthétiques avec des dates
    d'historique différentes, clair et sombre) : "= vs mois dernier"/"+1 vs an dernier" affichés
    correctement, cohérents avec le calcul attendu à la main sur le même jeu de données.
  - **Nouveau type de vente "Terrain à bâtir"** (`PIECES_TERRAIN_AUTRES`, dérivée de `PIECES_AUTRES`
    par substitution — `diagnosticsTechniques` remplacé par `etudeSol` — plutôt que recopiée à la
    main : les trois autres pièces (ERP, taxe foncière, titre de propriété) restent automatiquement
    synchronisées si `PIECES_AUTRES` est un jour retouchée). `checklistPieces()` gagne une branche
    `typeVente === 'terrain'` ; nouvelle option dans `#f-type-vente` (wizard) et dans le `<select>`
    "Type de vente" du tiroir (dont les trois `<option>` testent maintenant chacune explicitement
    `d.typeVente === valeur`, plutôt que l'ancien "maison par défaut sinon" qui aurait affiché
    "Maison" sélectionné à tort pour un dossier "terrain"). `normaliserDossierImporte()` accepte
    "terrain" comme valeur valide au même titre que "copropriete".
  - **Pièces personnalisables par dossier** (checklist "à la carte", demandé par l'étude) :
    `checklistPieces(typeVente, d)` accepte maintenant un second paramètre optionnel — absent avant
    l'enregistrement du dossier (voir `majApercuPieces()`, qui continue d'appeler
    `checklistPieces(select.value)` sans dossier), fourni partout ailleurs où un dossier existe déjà
    (`statutDossier()`, `renderPiecesDossier()`, `lierDossierLocal()`, `verifierDossierLocal()`,
    `dossierEntierementComplet()`, `calculerStatsPortefeuille()`). Avec un dossier fourni :
    `d.piecesRetirees` (tableau de clés) masque des pièces STANDARD non pertinentes pour ce dossier
    précis (impossible de les retirer des listes `PIECES_*`, partagées par tous les dossiers du même
    type de vente) ; `d.piecesPersonnalisees` (tableau de `{cle, label}`) ajoute des pièces propres à
    ce dossier. Chaque pièce personnalisée reçoit une clé générée à la création
    (`perso-<horodatage>-<aléatoire>`) plutôt qu'un index de tableau (contrairement à `d.autres`,
    identifiées par leur position faute d'identifiant stable) : retirer une pièce personnalisée du
    milieu de la liste ne doit pas décaler le statut de celles qui suivent.
    - Une croix (`.piece-suppr`) sur CHAQUE pièce de la checklist (standard ou personnalisée)
      retire la pièce pour ce dossier (`retirerPieceStandard()`/`supprimerPiecePersonnalisee()`,
      tous deux gardés par `demanderConfirmation()` — même filet de sécurité qu'une échéance
      personnalisée supprimée). Un bouton "+ Ajouter une pièce" (`renderAjoutPiece()`, même
      mini-formulaire inline que `renderAjoutEcheance()` pour les échéances : un champ texte, pas
      de duplication du style) l'ajoute (`ajouterPiecePersonnalisee()`).
    - **Une pièce personnalisée n'a pas de `motifNom`** (nom libre saisi par l'étude, aucune
      détection fiable possible dans un dossier local) : son statut se corrige uniquement à la main,
      en cliquant sur son badge (`basculerStatutPiecePersonnalisee()`, cycle inconnu → manquante →
      reçue → inconnu, sans entrée d'historique — une case à cocher répétée n'a pas besoin d'être
      journalisée, contrairement à un changement structurel du dossier). `verifierDossierLocal()`
      n'a pas eu besoin d'être modifiée : son garde-fou déjà existant (`if (piece.motifNom && ...)`)
      ignore déjà silencieusement toute pièce sans `motifNom`.
    - **Piège HTML évité** : `.piece-item` (la puce) ne peut plus être elle-même un `<button>`
      comme avant (une pièce reçue l'était, pour ouvrir le fichier trouvé) puisqu'elle doit
      maintenant porter DEUX zones cliquables indépendantes (le badge lui-même, et la croix de
      suppression) — deux `<button>` imbriqués seraient invalides et casseraient la délimitation
      des clics. `.piece-item` reste un simple `<span>` conteneur ; `.piece-label` (le badge, un
      `<button>` seulement quand il est réellement cliquable — reçue ou personnalisée) et
      `.piece-suppr` (toujours un `<button>`) en sont désormais deux enfants distincts, côte à côte.
    - Vérifié visuellement (Playwright, clair et sombre) : dossier "terrain à bâtir" synthétique
      affichant bien "Étude de sol" à la place des diagnostics, ajout d'une pièce personnalisée
      ("Attestation loi Carrez", compteur passé de 9 à 10), puis bascule de son statut par clic
      (inconnu → manquante) — comportement conforme à chaque étape. `npm test` reste vert
      (127 tests, dont 5 nouveaux couvrant `checklistPieces('terrain')` et la personnalisation par
      dossier — les fonctions de mutation elles-mêmes, comme `basculerStatutPiecePersonnalisee()`,
      ne sont pas unitairement testables : elles lisent/écrivent le tableau `dossiers`, une
      variable `let` de premier niveau invisible depuis l'extérieur du contexte `vm` des tests,
      contrairement aux `function` — voir `tests/helpers/load-app.js`).
  - **Investigué, pas encore corrigé : un retour signalant que "les noms de dossier ne vont pas"
    parfois, sur des compromis dont l'état civil du vendeur/promettant précède celui de
    l'acquéreur/bénéficiaire** (l'ordre déjà supposé par `detecterNomDossier()`). Sans exemple de
    texte réel reproduisant l'échec, aucune correction n'a été tentée : cette fonction a déjà
    régressé plusieurs fois par le passé sur des suppositions de format non vérifiées (voir son
    historique — le bug "NOM / NOM", le style "étiquette finale" sans guillemets...). À reprendre
    dès qu'un exemple de compromis (ou un extrait anonymisé du bloc d'état civil concerné) est
    fourni.
- **Deux signalements de l'étude ("Certificat alignement et numérotage" ne coche pas les deux
  pièces ; "Avis de Taxes foncières" jamais validé) revérifiés isolément : déjà corrigés par
  l'entrée précédente, pas de nouveau correctif nécessaire.** Un script Node ad hoc chargeant
  `checklistPieces()` telle quelle a confirmé que `certificatAlignement.motifNom` ET
  `certificatNumerotage.motifNom` matchent tous les deux "Certificat alignement et numérotage.pdf"
  (et ses variantes underscore/sans accent), et que `avisTaxeFonciere.motifNom` matche "Avis de
  Taxes foncières.pdf" tel quel — les deux signalements décrivent exactement les cas déjà couverts
  par le correctif précédent. Le plus probable : l'étude testait encore une copie de l'outil
  téléchargée avant ce correctif (corriger le code sur `main` ne met pas à jour un fichier déjà
  ouvert en local — l'étude doit retélécharger `index.html`/`script.js`/`style.css` depuis le dépôt
  pour recevoir un correctif). À reconfirmer avec l'étude ; si le problème persiste malgré une
  copie à jour, redemander le nom de fichier EXACT (caractère par caractère, capture d'écran de
  l'explorateur de fichiers si besoin) plutôt que de retoucher une regex qui teste déjà juste ici.
- **Tuile "dossier actif" du Tableau de bord : tendance déplacée à côté du chiffre, comparaison à
  l'année retirée de l'affichage pour l'instant** — demandé par l'étude. `.kpi-num-ligne` (nouveau
  conteneur flex, remplace le `.kpi-num` nu) regroupe le chiffre et sa tendance sur une seule ligne
  ("2 ↗ +1 vs mois dernier") plutôt que la tendance sur sa propre ligne en dessous ; les 4 autres
  tuiles utilisent le même conteneur mais sans second enfant, sans changement visuel pour elles.
  `evolution.ecartAn` reste calculé par `calculerEvolutionPortefeuille()` (rien retiré du calcul,
  seulement de l'affichage) : à réafficher facilement le jour où l'étude le redemande, sans
  retoucher la fonction de calcul elle-même ni ses tests.
- **Recherche automatique dans le dossier local à l'ajout d'une pièce personnalisée** : demandé par
  l'étude pour éviter d'avoir à cliquer sur chaque pièce ajoutée pour confirmer manuellement son
  statut. `ajouterPiecePersonnalisee()` devient asynchrone : une fois la pièce ajoutée à la
  checklist (immédiat, comme avant), si le dossier est déjà relié à un dossier local ET que l'accès
  est déjà accordé (`queryPermission` seul — jamais `requestPermission` ici, volontairement : ce
  n'est pas le geste dédié à la reconfirmation d'accès, inutile d'en déclencher un nouveau juste
  pour l'ajout d'une pièce), une recherche silencieuse (`chercherFichierParNom()`, nouvelle
  fonction) parcourt le dossier local à la recherche d'un fichier dont le nom CONTIENT le libellé
  tapé (simple sous-chaîne insensible à la casse sur le nom normalisé — voir
  `normaliserNomPourMotif` — pas une regex : l'étude n'a pas à écrire un motif elle-même). Trouvé →
  la pièce passe directement à "reçue", son handle est mémorisé (`CLE_HANDLE_PIECE`, même mécanisme
  que les autres pièces) pour rester cliquable/ouvrable, et un toast confirme le fichier trouvé. Pas
  trouvé → la pièce reste "à vérifier" comme avant cette évolution, sans message d'échec superflu (le
  cas normal reste "je tape un nom avant même d'avoir le document").
- **Bug corrigé, cette fois un vrai bug STRUCTUREL de parcours et non une regex de détection :
  l'étude a signalé à plusieurs reprises ("toujours bugué") que "Certificat alignement et
  numérotage" et "Avis de Taxes foncières" n'étaient jamais validés, alors que trois vérifications
  indépendantes du code (y compris sur les fichiers PDF réels envoyés par l'étude, nom de fichier
  exact) confirmaient que `motifNom` les reconnaissait correctement.** Cause réelle, trouvée en
  relisant `fichiersPdfRecursifs()` en entier plutôt qu'en re-testant la regex une quatrième fois :
  la fonction parcourait le dossier local **en profondeur** (récursion `yield*` immédiate dans
  chaque sous-dossier rencontré). Sur l'arborescence réelle de l'étude (voir "Ce qui reste ouvert"
  plus bas : rubriques numérotées à la racine d'un dossier client — `0 - COMPTABILITE - PRET`
  ayant lui-même un sous-dossier `PRET`, puis `1 - Vendeur`, `2 - Acquéreur`, `3 - Titre de
  propriété`...), un parcours en profondeur descend ENTIÈREMENT dans `0 - COMPTABILITE - PRET`
  (donc dans son sous-dossier `PRET`, potentiellement des dizaines de relevés bancaires/pièces de
  prêt scannées) avant même de regarder `1 - Vendeur` ou `3 - Titre de propriété` : si cette toute
  première rubrique contient à elle seule plus de `MAX_FICHIERS_PARCOURUS` PDF, le plafond de
  sécurité coupe le parcours avant d'avoir jamais atteint les rubriques suivantes — les pièces
  qu'elles contiennent ne sont alors JAMAIS testées, quel que soit leur nom de fichier. C'est un
  problème d'ORDRE DE PARCOURS, pas de détection : aucune regex ne pouvait le corriger, d'où les
  trois vérifications précédentes toutes correctes sans que le symptôme disparaisse chez l'étude.
  - `fichiersPdfRecursifs()` réécrite en parcours **en largeur** (file FIFO de dossiers à visiter,
    plutôt que récursion immédiate) : toutes les rubriques de premier niveau d'un dossier client
    sont désormais explorées (leurs fichiers PDF directs) avant de descendre dans les sous-dossiers
    d'une seule d'entre elles. Une rubrique volumineuse peut toujours, à elle seule, épuiser le
    plafond si ses fichiers sont directement à son propre niveau (le parcours en largeur ne protège
    que contre l'effet d'engloutissement d'un SOUS-dossier plus profond) — cohérent avec
    l'arborescence réelle où le volume (relevés, historique de prêt) est presque toujours dans un
    sous-dossier dédié (`PRET`, `ETAT DATE`...), pas à la racine de la rubrique elle-même.
  - `MAX_FICHIERS_PARCOURUS` relevé de 300 à 3000 par sécurité supplémentaire, en plus du correctif
    d'ordre : le plafond ne compte que des PDF, pour UN SEUL dossier client (pas tout le lecteur
    réseau de l'étude), un dossier ancien avec beaucoup d'annexes/scans/courriers PDF individuels
    pouvait légitimement s'approcher de l'ancien plafond.
  - Signature externe de la fonction inchangée (`fichiersPdfRecursifs(handle, 0, compteur)`), les
    deux points d'appel existants (`chercherFichierParNom`, `verifierDossierLocal`) n'ont pas eu à
    être modifiés.
  - Deux tests dans `tests/dossier-local.test.js` : le plafond de sécurité (adapté à 3000), et un
    nouveau test qui reproduit précisément l'arborescence en cause (une rubrique dont le
    SOUS-dossier dépasse le plafond à lui seul) et vérifie que les rubriques suivantes sont malgré
    tout trouvées — le test échouait avec l'ancienne implémentation en profondeur, passe avec la
    nouvelle. `npm test` reste vert (128 tests).
  - **Leçon pour la suite** : face à un signalement répété du même symptôme après plusieurs
    vérifications de regex toutes correctes, le bon réflexe est de relire la fonction de parcours
    dans son ensemble (ordre, plafonds, limites) plutôt que de re-tester la même regex une fois de
    plus — la regex n'était jamais le problème ici.
- **Deuxième cause, distincte, du même symptôme "toujours bugué" sur "Certificat alignement et
  numérotage"/"Avis de Taxes foncières" : un vrai dossier envoyé par l'étude ("NEW_DOSSIER.zip",
  contenant un dossier `__MACOSX` et un `.DS_Store` — donc constitué sur un Mac) a révélé que le
  correctif de parcours ci-dessus ne suffisait pas non plus, l'arborescence de ce dossier étant en
  réalité PLATE (aucun sous-dossier).** Cause réelle, trouvée en inspectant les CODEPOINTS Unicode
  du nom de fichier réel plutôt qu'en relisant sa représentation texte (identique à l'œil dans
  n'importe quel outil) : macOS écrit couramment les noms de fichiers en **Unicode NFD** (forme
  décomposée) — "foncières" y est stocké comme "f", "o", "n", "c", "i", "e", puis un caractère
  **ACCENT GRAVE COMBINANT séparé** (U+0300), puis "r", "e", "s" — et non comme un seul caractère
  "è" (U+00E8, forme NFC) que `motifNom` (écrit avec `[èe]`) attend. Les deux formes s'affichent de
  façon RIGOUREUSEMENT IDENTIQUE partout (explorateur de fichiers, éditeur, `console.log`) —
  indiscernable d'une regex mal écrite sans aller jusqu'à comparer les points de code un par un.
  C'est ce qui a fait échouer TROIS revérifications successives du motif (toutes concluant, à
  raison, que la regex elle-même était correcte) sans que le symptôme ne disparaisse chez l'étude.
  - `normaliserNomPourMotif(nom)` appelle désormais `nom.normalize('NFC')` avant de remplacer
    underscores/tirets par des espaces — recompose toute lettre accentuée décomposée en un seul
    caractère avant le test de `motifNom`. Sans effet sur un nom déjà en NFC (cas normal d'un
    fichier nommé sous Windows, l'environnement réel de l'étude au quotidien) : aucune régression
    possible sur les dossiers déjà correctement détectés jusqu'ici.
  - Nouveau test dans `tests/dossier-local.test.js` qui construit explicitement la forme NFD du nom
    réel (`'foncières'`) et vérifie `avisTaxeFonciere.motifNom` — le test échouait avant ce
    correctif, passe après. `npm test` reste vert (129 tests).
  - **Pourquoi ce dossier de test était en NFD alors que les dossiers réels de l'étude sont sur un
    poste Windows/lecteur réseau** : le zip envoyé pour ce diagnostic a lui-même été constitué sur
    un Mac (présence de `__MACOSX`/`.DS_Store`), donc pas nécessairement représentatif du poste de
    travail quotidien de l'étude. Le correctif est néanmoins gardé tel quel : `.normalize('NFC')`
    est inoffensif sur un nom déjà en NFC, et le risque existe dès qu'un seul maillon de la chaîne
    (scanner/MFP, synchronisation cloud, transfert par un tiers utilisant un Mac) réintroduit une
    normalisation NFD avant que le fichier n'arrive dans le dossier local relié à l'outil — un
    correctif défensif à coût nul valait mieux que de supposer l'environnement Windows étanche à
    ce risque sans l'avoir vérifié.
  - **Leçon supplémentaire** : quand un nom de fichier "évidemment correct" ne matche toujours pas
    après plusieurs vérifications textuelles, comparer les CODEPOINTS Unicode un par un
    (`[...chaine].map(c => c.codePointAt(0).toString(16))`) plutôt que de continuer à relire la
    chaîne affichée — un caractère combinant invisible ne se voit jamais autrement.
- **Bug corrigé : une pièce personnalisée ajoutée via "+ Ajouter une pièce" ne pouvait plus jamais
  être retrouvée par "Revérifier"**, seulement au moment précis de son ajout. Signalé par l'étude :
  un document ("M1", un libellé personnalisé sans rapport avec la checklist standard) placé dans le
  dossier local APRÈS avoir changé de dossier lié restait "à vérifier" indéfiniment, même après
  plusieurs clics sur "Revérifier". Cause : une pièce personnalisée n'a volontairement pas de
  `motifNom` (nom libre saisi par l'étude, pas de regex à écrire — voir "Pièces personnalisables par
  dossier" plus haut) ; seule `ajouterPiecePersonnalisee()` la recherchait, une seule fois, au moment
  de la création (`chercherFichierParNom()`). `verifierDossierLocal()` (appelée par "Revérifier",
  par tout nouveau lien, et par la revérification périodique) ne testait chaque fichier que contre
  `piece.motifNom` — un garde-fou qui exclut par construction toute pièce qui n'en a pas, donc TOUTE
  pièce personnalisée, à chaque appel suivant l'ajout initial.
  - La boucle de correspondance par nom de fichier dans `verifierDossierLocal()` teste maintenant
    aussi les pièces personnalisées (`piece.personnalisee === true`) par la même logique que
    `chercherFichierParNom()` : sous-chaîne du libellé, insensible à la casse, sur le nom de fichier
    normalisé (underscores/tirets → espaces, accents NFC — voir les deux correctifs juste au-dessus).
    Une pièce personnalisée profite donc désormais du même mécanisme que les pièces standard : un
    fichier ajouté après coup, ou trouvé seulement après avoir changé de dossier lié, est repéré au
    prochain "Revérifier" — pas seulement à l'instant de la création de la pièce.
  - Pas de nouveau test unitaire : `verifierDossierLocal()` dépend de `dossiers` (variable `let` de
    premier niveau, invisible depuis les tests — voir la limite déjà documentée dans
    `tests/helpers/load-app.js`) et de l'API File System Access, comme les autres fonctions de
    mutation de ce fichier (`ajouterPiecePersonnalisee()`, `basculerStatutPiecePersonnalisee()`...).
    Logique de correspondance vérifiée par une simulation Node ad hoc (substring insensible à la
    casse sur un nom de fichier réel) avant de committer ; `npm test` reste vert (129 tests, aucun
    changement dans les fonctions pures testables).
- **Mode diagnostic du dernier parcours du dossier local**, demandé par l'étude après une série de
  bugs invisibles à l'œil (accents Unicode NFD, ordre de parcours en profondeur, pièce
  personnalisée jamais rerecherchée...) qui ont chacun nécessité une relecture complète du code
  pour être compris : plutôt que de continuer à diagnostiquer chaque nouveau cas par une session de
  travail, un panneau repliable sur la fiche dossier montre directement à l'étude quels fichiers ont
  été lus lors du dernier "Revérifier" et pourquoi une pièce reste "manquante" — avant de solliciter
  un nouveau diagnostic.
  - `verifierDossierLocal()` construit maintenant, pendant le même parcours qui met déjà à jour
    `d.pieces`/`d.offrePretStatut`, un objet diagnostic stocké dans `dernierDiagnosticParcours[id]`
    (nouvel état, un objet clé/dossier) : un `journal` (une ligne par événement notable —
    correspondance trouvée par nom, contenu lu avec son résultat, erreur de lecture — PAS une ligne
    par fichier rencontré, ce qui serait illisible sur un dossier de plusieurs centaines de PDF sans
    rien ajouter d'utile) et un `resume` (nombre de fichiers rencontrés/ouverts, statut de l'offre,
    compteur et liste des pièces encore manquantes). Les trois sorties anticipées de la fonction
    (dossier délié, permission refusée, erreur de parcours) alimentent aussi un diagnostic minimal
    (`resume.erreur`), pour que le panneau explique le blocage même quand le scan n'a pas pu aller
    au bout.
  - **Volontairement en mémoire uniquement** (pas dans `localStorage`/le modèle du dossier) : c'est
    une aide ponctuelle sur le TOUT DERNIER parcours depuis que la page est ouverte, pas une donnée
    à conserver d'une session à l'autre — perdu au rechargement, comme `pdfActuel` pendant un
    import. Écrasé à chaque nouveau parcours (bouton "Revérifier", nouveau lien, revérification
    périodique), y compris lors d'un changement de dossier lié (`lierDossierLocal()` appelle déjà
    `verifierDossierLocal()` juste après avoir relié un nouveau dossier).
  - **Jamais d'extrait du texte d'un PDF dans le journal visible** (contrairement à la trace
    `console.log` déjà existante pour l'offre de prêt, réservée à la console) : uniquement des noms
    de fichiers, déjà visibles par l'étude dans son propre explorateur de fichiers — pas de PII
    supplémentaire exposée à l'écran au-delà de ce que l'étude voit déjà en ouvrant le dossier.
  - `renderDiagnosticParcours(d)` (nouvelle fonction, script.js) affiche le panneau — repliable et
    **fermé par défaut** (`.diagnostic-parcours`, style.css), contrairement aux pièces du
    dossier/l'analyse juridique toujours visibles : c'est un outil de dépannage ponctuel, pas un
    suivi actif de la fiche. Inséré juste après "Pièces du dossier" dans le tiroir. N'affiche rien
    tant qu'aucun parcours n'a eu lieu (fonction retourne une chaîne vide) ; masqué à l'impression
    comme les autres contrôles d'édition.
  - Pas de nouveau test unitaire, pour la même raison que les correctifs précédents sur
    `verifierDossierLocal()` : dépend de `dossiers` (invisible depuis les tests) et de l'API File
    System Access. **Vérifié visuellement avec Playwright** (clair et sombre) en injectant un
    dossier synthétique et un diagnostic fabriqué à la main directement dans
    `dernierDiagnosticParcours` (contournant pdf.js/File System Access, tous deux indisponibles
    dans cet environnement de développement) : le résumé, le journal et le cas d'erreur s'affichent
    tous correctement, dans les deux thèmes. `npm test` reste vert (129 tests, aucune fonction pure
    ajoutée par ce chantier — la logique dépend entièrement de `dossiers`/du DOM).
- **Écran "À propos"**, une des trois idées proposées côté identité de marque lors d'un échange sur
  les pistes d'amélioration du service — retenue en premier (les deux autres, un favicon dynamique
  reflétant l'urgence du portefeuille et un en-tête "CLAIRE" discret sur la fiche imprimée, restent
  de simples pistes non engagées). Répond aussi à un vrai problème rencontré à plusieurs reprises
  cette session : l'étude testant, sans le savoir, une copie d'`index.html`/`script.js`/`style.css`
  obsolète (l'outil n'a pas de mise à jour automatique) et resignalant un bug déjà corrigé.
  - `VERSION_APP` (nouvelle constante, tout en haut de `script.js`) : une date `AAAA-MM-JJ` figée
    dans le code, **à mettre à jour manuellement à chaque commit qui change le comportement de
    l'outil** — impossible d'en déduire une automatiquement (numéro de commit git, date de
    modification de fichier...) puisque ces 3 fichiers sont utilisés hors de tout dépôt une fois
    déposés chez l'étude, sans aucune information git disponible à l'exécution. **Point de
    vigilance pour la suite** : penser à l'incrémenter à chaque nouvelle session de travail, sans
    quoi le panneau perd sa seule utilité (distinguer une copie à jour d'une copie obsolète).
  - Lien "À propos" tout en bas de la sidebar (`.sidebar-link-apropos`, sous le bouton de thème),
    volontairement **discret** (police plus petite, couleur `--muted`) par rapport aux autres liens
    du pied de sidebar — une aide occasionnelle, pas une action fréquente. Ouvre `#apropos-overlay`
    (`ouvrirAPropos()`/`fermerAPropos()` dans script.js), qui réutilise le patron
    `.confirm-overlay`/`.confirm-box` déjà en place (popup de confirmation, popup d'accès à
    reconfirmer) plutôt que d'inventer un second système de fenêtre modale — seul le contenu de la
    carte change (logo + mot "CLAIRE" repris de la sidebar, tagline, pastille de version, un
    paragraphe expliquant le fonctionnement 100% local, et une note qui pointe explicitement vers
    le retéléchargement des 3 fichiers en cas de bug "déjà corrigé mais toujours présent"). Fermeture
    par le bouton "Fermer" (`.btn-annuler`, neutre — `.btn-confirmer` aurait affiché un bouton rouge
    "danger" inapproprié pour une simple fermeture), par un clic sur le fond, ou par Échap (ajouté
    en tête du gestionnaire clavier existant : "À propos" n'est jamais ouvert en même temps qu'un
    autre panneau en pratique, mais autant le garder cohérent avec le reste de l'ordre de fermeture
    déjà établi).
  - Nouvelle icône `info` dans `ICONES` (cercle + point + barre, même recette 16×16 que les autres),
    posée par `initIconesStatiques()` comme les autres icônes statiques du HTML.
  - Vérifié visuellement (Playwright, clair/sombre, desktop et mobile — sidebar repliable) : version
    affichée correctement, fermeture par Échap confirmée (`display: none` après la touche), rendu
    correct dans les deux thèmes et à largeur téléphone. `npm test` reste vert (129 tests, aucune
    fonction pure ajoutée par ce chantier — uniquement de l'affichage).
- **Versionning affiné à la minute + historique récent dans "À propos"** : demandé juste après
  l'ajout de l'écran ci-dessus — une simple date (`AAAA-MM-JJ`) ne permet pas de distinguer
  plusieurs versions publiées le même jour, ce qui est le cas courant pour cet outil (plusieurs
  corrections indépendantes traitées à la suite dans une même session).
  - `VERSION_APP` passe au format `AAAA-MM-JJ HH:MM` (précision à la minute). **Procédure de mise à
    jour, à ne pas sauter à chaque commit qui change le comportement de l'outil** : lancer
    `date '+%Y-%m-%d %H:%M'` en shell pour obtenir l'heure RÉELLE du moment (ne jamais deviner ou
    recopier l'heure du commit précédent), puis reporter cette valeur dans `VERSION_APP` **et**
    ajouter une nouvelle entrée en tête de `HISTORIQUE_VERSIONS` avec un court résumé (une phrase)
    du changement — jamais l'un sans l'autre, les deux doivent toujours désigner le même instant.
  - `HISTORIQUE_VERSIONS` (nouveau tableau, juste après `VERSION_APP`) : les ~8 dernières entrées
    `{version, resume}`, la plus récente en tête (au-delà, l'historique complet reste dans ce
    fichier CLAUDE.md — pas la peine de dupliquer indéfiniment). Affiché sous le numéro de version
    dans l'écran "À propos" (`#apropos-historique-liste`, peuplé par `ouvrirAPropos()`) : le numéro
    seul dit "ce n'est pas la même copie", cette liste dit en plus CE QUI A CHANGÉ, pour que l'étude
    puisse vérifier qu'elle a bien reçu un correctif précis sans avoir à me redemander. Liste dans
    un encart défilant (`max-height` + `overflow-y`) plutôt que de pousser le reste de la fenêtre
    vers le bas si elle s'allonge.
  - Vérifié visuellement (Playwright, clair et sombre) : version et historique s'affichent
    correctement, dans l'ordre attendu, l'encart défile sans déborder de la fenêtre modale.
    `npm test` reste vert (129 tests, aucune fonction pure ajoutée — uniquement de l'affichage).
- **Un engagement d'entretien détecté dans le compromis (chaudière, PAC, ramonage) ajoute
  automatiquement la pièce correspondante à la checklist du dossier**, demandé explicitement par
  l'étude et limité à ces trois types pour l'instant (à étendre seulement sur nouvelle demande).
  Fait le pont entre deux mécanismes jusqu'ici indépendants : l'analyse juridique du compromis
  (`DOCUMENTS_VENDEUR_CONNUS`/`detecterDocumentsAFournir`, purement informative) et la checklist de
  pièces du dossier (`PIECES_*`/`checklistPieces`, recherchée dans le dossier local).
  - `DOCUMENTS_VENDEUR_CONNUS` gagne un champ `cleChecklist` sur SES TROIS SEULES entrées
    concernées (`ramonage`, `entretienChaudiere`, `entretienPac`) — les autres documents connus
    (travaux, justificatifs...) restent de simples informations affichées dans l'analyse juridique,
    sans lien avec la checklist. `detecterDocumentsAFournir()` le propage tel quel dans son résultat
    (`{label, cat, cleChecklist}`), sans changer son usage existant (`renderDocBadge()` continue
    d'ignorer ce nouveau champ).
  - Nouveau tableau `PIECES_ENGAGEMENTS_AUTO` (même forme `{cle, label, motifNom}` que les pièces
    standard `PIECES_URBANISME`/`PIECES_AUTRES`...) : volontairement PAS des pièces personnalisées
    (`d.piecesPersonnalisees`, texte libre sans `motifNom`, retrouvées seulement par sous-chaîne du
    libellé) — leur nature étant connue à l'avance, elles ont un vrai `motifNom` régulier, plus
    permissif que le `motif` de détection dans le compromis (un fichier réel s'appelle plus souvent
    "Entretien chaudière.pdf"/"Facture ramonage.pdf" que "Justificatif d'entretien de la
    chaudière.pdf" — voir les tests avec des noms de fichiers réalistes).
  - `d.piecesEngagementsDetectees` (tableau de clés) : calculé UNE SEULE FOIS à la création du
    dossier dans `ajouterDossier()`, à partir de `analyseJuridiqueActuelle.documents` (l'analyse
    juridique n'existe que pendant l'import — un dossier déjà enregistré et rouvert ne peut pas
    relancer cette détection après coup, même limitation déjà documentée pour d'autres détections
    liées à l'analyse). `checklistPieces(typeVente, d)` fusionne ces pièces (marquées
    `autoEngagement: true`) juste avant les pièces personnalisées, en respectant `d.piecesRetirees`
    comme n'importe quelle pièce standard — retirable via le même bouton ✕/`retirerPieceStandard()`,
    aucune nouvelle fonction de suppression nécessaire. `normaliserDossierImporte()` filtre le
    tableau importé sur les clés réellement connues de `PIECES_ENGAGEMENTS_AUTO` (comme
    `piecesRetirees`/`piecesPersonnalisees` juste au-dessus), pour ne pas traîner indéfiniment une
    clé devenue obsolète si cette liste change un jour.
  - **Aucun changement dans `verifierDossierLocal()`** : ces pièces portent un `motifNom` comme les
    pièces standard, donc tout le mécanisme de recherche/retrait/préremplissage déjà en place les
    gère sans un seul `if` supplémentaire — seule `checklistPieces()` change ce qu'elle retourne.
  - Tooltip dédié sur la pièce tant qu'elle n'est pas reçue (`renderPiecesDossier()`, via le nouveau
    flag `autoEngagement`) : "Détectée automatiquement : le compromis mentionne cet engagement
    d'entretien du vendeur." — sans lui, l'étude n'aurait aucun moyen de comprendre pourquoi une
    pièce qu'elle n'a pas ajoutée elle-même apparaît dans la checklist.
  - Tests dans `tests/engagements.test.js` (le nouveau champ `cleChecklist`, présent uniquement sur
    les trois entrées concernées) et `tests/dossier-local.test.js` (fusion dans `checklistPieces()`,
    retrait via `piecesRetirees`, `motifNom` contre des noms de fichiers réalistes). Vérifié
    visuellement (Playwright, dossier synthétique avec `piecesEngagementsDetectees`) : les deux
    pièces apparaissent en fin de checklist avec le bon tooltip, le compteur passe de 9 à 11, le
    retrait par la croix fonctionne. `npm test` reste vert (132 tests).
- **Avertissement "barème non audité" ajouté en tête du simulateur de frais d'acte**, à la demande
  explicite de l'étude après un avis honnête donné sur l'outil dans son ensemble : le barème/les
  taux de ce calculateur ont été repris tels quels d'une maquette fournie par l'étude (voir
  l'entrée "Calculateur de provision..." plus haut) et n'ont jamais été recalculés ni audités
  indépendamment — un chiffre annoncé à un client à partir de là engage l'étude, pas l'outil.
  L'ancienne note ("Outil indicatif de provision — vérifier les paramètres...") existait déjà mais
  reléguée tout en bas de page, dans les notes de règles/références : facile à ne jamais lire, et
  formulée comme une précaution générique ("vérifiez VOS paramètres") plutôt que comme un avertissement
  sur la fiabilité du barème lui-même.
  - `.calc-avertissement` (nouveau bandeau, `index.html`/`style.css`) inséré au départ juste sous le
    titre de l'onglet, AVANT la grille paramètres/résultat, avec un texte long expliquant l'origine
    du barème (repris tel quel d'un document fourni, sans vérification indépendante) et la
    conséquence pratique (à faire valider par un professionnel avant toute communication à un
    client). Icône `alert-triangle` (déjà dans `ICONES`, posée par `initIconesStatiques()`), teinte
    reprise de `.dl-alerte` (`color-mix(in srgb, var(--urgent) ...)`, le seul autre endroit de
    l'outil qui garde un fond plein pour un signal volontairement voyant) plutôt qu'une couleur
    inventée pour l'occasion.
  - **Repositionné et simplifié juste après, sur retour direct de l'étude** ("met un avertissement
    plus simple et au dessus de régime appliqué") : la première version, en tête d'onglet avec un
    paragraphe complet, a été jugée trop lourde. Le bandeau est déplacé juste au-dessus de la carte
    "Régime appliqué" (toujours avant tout chiffre affiché dans cette carte, mais après le résultat
    principal — ce dernier n'a pas besoin d'un avertissement à côté, seule l'explication du taux
    appliqué en avait un) et son texte réduit à une seule ligne : "Montant à valider avant envoi."
    L'explication détaillée de l'origine du barème reste disponible juste en dessous, inchangée,
    dans "Règles et références". `.calc-avertissement` (CSS) passe de `align-items: flex-start`
    (pensé pour un paragraphe sur plusieurs lignes) à `center`, avec moins de padding — un message
    court se centre verticalement avec son icône plutôt que de s'aligner en haut.
  - Vérifié visuellement (Playwright, clair et sombre) : bandeau bien positionné juste au-dessus de
    "Régime appliqué", lisible sur une seule ligne dans les deux thèmes. `npm test` reste vert
    (132 tests, aucune fonction pure ajoutée — uniquement de l'affichage).
- **Confirmé à l'étude : l'enregistrement automatique du registre et son rechargement au lancement
  existent déjà**, sur question directe après la remarque "le logiciel est stocké sur un NAS donc
  au moins c'est plus sûr" — l'étude semblait présumer une protection automatique du seul fait que
  les fichiers de l'outil sont sur un lecteur réseau, ce qui n'est vrai QUE pour le "Registre
  partagé (réseau)" (un fichier JSON explicitement lié via `showSaveFilePicker()`), jamais pour
  `localStorage` (propre à chaque poste/profil Chrome, jamais sur le NAS). Vérification du code,
  pas de nouveau développement : `sauvegarder()` écrit déjà sur le fichier partagé à chaque
  modification dès que `registrePartageLie` est vrai (`ecrireRegistrePartage()`) ;
  `tenterReconnexionPartage()`, appelée dans la séquence d'init au démarrage, relit déjà ce fichier
  silencieusement (`lireRegistrePartage(false)`, sans redemander de permission tant qu'elle est
  encore valable) ; un `setInterval` de 2 minutes relit aussi le fichier en continu pour absorber
  les modifications des collègues. Seule limite réelle, déjà documentée et déjà gérée par l'outil :
  Chrome ne conserve pas la permission d'accès à un fichier d'une session de navigateur à l'autre —
  un redémarrage de Chrome peut donc demander UN clic de reconfirmation, couvert par la popup au
  démarrage et le bouton groupé "Reconfirmer tous les accès" (voir leur historique plus haut).
  Cette protection ne s'applique que si l'étude a explicitement cliqué une fois sur "Registre
  partagé (réseau)" pour le lier à un fichier du NAS — pas automatique par le seul fait que les
  fichiers `index.html`/`script.js`/`style.css` sont eux-mêmes déposés sur un partage réseau.
- **Série de retouches sur la sidebar mobile, le Suivi et la fiche dossier** :
  - **Bouton "+ Nouveau dossier" du Suivi de la taille du champ de recherche en mode mobile.**
    `.list-heading` (titre "Dossiers suivis" + compteur) est désormais un conteneur flex à deux
    groupes (`.list-heading-titre` regroupant `<h2>`/`.count`, puis le bouton) plutôt que deux
    enfants directs — nécessaire pour ajouter le bouton comme un troisième élément sans casser
    `justify-content: space-between`. Sous 900px (même seuil que le repli de la sidebar en burger,
    voir `@media` existant) : `.list-heading` passe en colonne, le bouton `.list-heading-nouveau`
    et le champ `.toolbar-recherche input` passent tous deux en pleine largeur — même taille,
    demandé par l'étude, plutôt qu'un gros bouton à côté d'un champ resté à `max-width: 40vw`.
    **Piège de cascade CSS à ne pas reproduire** : `.toolbar-recherche input` est déjà défini plus
    haut dans la feuille (hors media query) — une media query placée AVANT cette règle dans le
    fichier perdrait face à elle à spécificité égale (le CSS départage par l'ordre du fichier, pas
    par la position visuelle du `@media`). Le nouveau bloc `@media (max-width: 900px)` a donc été
    ajouté juste APRÈS `.toolbar-recherche input:focus`, pas regroupé avec l'`@media` existant du
    repli de sidebar plus haut dans le fichier.
  - **Bouton "+ Nouveau dossier" ajouté en haut de l'onglet Suivi** (`.list-heading-nouveau`), en
    plus du CTA permanent de la sidebar et de celui déjà présent sur le Tableau de bord — demandé
    par l'étude, un raccourci de création directement visible sans changer d'onglet au préalable.
  - **Bouton de suppression dédié pour une date butoir** (Obtention du prêt / Signature de l'acte /
    Vente préalable), demandé par l'étude : avant ce correctif, seul le crayon (vider le champ date
    natif puis valider — `validerEditionDate()` accepte déjà une valeur vide) permettait d'effacer
    une date, sans qu'aucun bouton ne l'indique ni ne le confirme. `renderTab()` affiche désormais
    la même croix `.tab-suppr` que les échéances "autre" (déjà existante), mais uniquement quand une
    date est renseignée sur ces trois tabs (rien à supprimer sinon) ; `supprimerDateEcheance(id,
    type)` (nouvelle fonction, gardée par `demanderConfirmation()` comme `supprimerEcheanceAutre()`)
    vide la date et journalise l'action — la tab elle-même n'est jamais retirée du modèle
    (contrairement à une échéance "autre", qui disparaît du tableau `d.autres`) : elle repasse
    simplement à "Non renseigné", déjà l'affichage prévu pour un dossier créé sans cette échéance.
  - **Supprimer la date "Obtention du prêt" bascule automatiquement `d.sansPret` à `true`**, ce qui
    répond directement à une demande liée de l'étude ("s'il n'y a pas d'obtention d'offre de prêt,
    ne pas rechercher l'offre en local") : `verifierDossierLocal()` teste déjà exclusivement
    `!d.sansPret` pour décider de chercher l'offre (`chercherOffre`), et `d.sansPret` est déjà la
    seule source de vérité utilisée partout ailleurs dans l'outil (badge "Achat comptant", checklist
    de pièces, `relancerSiOffreManquante()`...) — sans ce basculement dans `supprimerDateEcheance()`,
    supprimer la date de prêt n'aurait rien changé à ce comportement (`d.sansPret` restait figé à sa
    valeur de création). Vérifié que le cas était déjà correctement couvert dès la CRÉATION d'un
    dossier (décocher "Obtention du prêt" dans le wizard pose déjà `sansPret: true`, voir
    `ajouterDossier()`) : le point resté ouvert ne concernait que la suppression après coup d'une
    date déjà enregistrée, pas la création elle-même.
  - Vérifié visuellement (Playwright, clair et sombre, desktop et mobile ~400px) : bouton du Suivi
    bien positionné et de même taille que le champ de recherche en mobile, croix de suppression
    visibles sur les trois tabs quand une date existe, confirmation avant suppression, badge "Achat
    comptant — sans prêt" apparaissant après suppression de la date de prêt (`d.sansPret` confirmé
    passé à `true` par script). `npm test` reste vert (132 tests, aucune fonction pure testable
    modifiée par ce chantier — `supprimerDateEcheance()` dépend de `dossiers`, invisible depuis les
    tests, même limite déjà documentée pour les autres fonctions de mutation de ce fichier).
- **Explications sur `.ics`/email déplacées du footer vers une popup post-clic**, demandé par
  l'étude : le footer expliquait en permanence, sur toutes les pages, à quoi servent les boutons
  "Rappels (.ics)" et "Rappel email" — une information rarement lue puisque affichée en dehors de
  tout geste précis, plutôt qu'au moment où elle est utile.
  - Nouvelle popup générique `#info-action-overlay` (`afficherInfoAction(titre, message)` /
    `fermerInfoAction()` dans `script.js`), réutilisant le patron `.confirm-overlay`/`.confirm-box`
    déjà en place (comme `#apropos-overlay`) plutôt qu'un second système de fenêtre modale — un
    titre en gras, un message, un seul bouton "Compris" (pas de second bouton : l'action a déjà eu
    lieu, ce n'est pas une confirmation à valider avant coup comme `demanderConfirmation()`).
  - Appelée en fin de `telechargerICS()` ("À importer dans Outlook (ou votre agenda) : il crée un
    événement par échéance, avec ses rappels.") et de `ouvrirEmailRappel()` ("L'envoi final reste
    un clic manuel dans votre messagerie : rien n'est envoyé automatiquement.") — le texte reprend
    presque mot pour mot l'ancien texte du footer, seul son emplacement change.
  - Le footer ne garde que les deux lignes sans rapport (confidentialité du PDF analysé, fiabilité
    des dates détectées) — la ligne `.ics`/Email est entièrement retirée.
  - Ajoutée en tête du gestionnaire Échap (avant même "À propos") : cette popup s'ouvre par un clic
    depuis le tiroir de fiche dossier, donc au-dessus de lui dans l'ordre de superposition visuelle.
  - Vérifié visuellement (Playwright, clair et sombre) : popup correctement positionnée et stylée
    après clic sur chacun des deux boutons, fermeture par "Compris" fonctionnelle, footer confirmé
    sans plus aucune mention `.ics`/Email (`textContent` vérifié). `npm test` reste vert (132 tests,
    aucune fonction pure ajoutée — uniquement de l'affichage).
- **Versionning en heure de Paris, export `.ics` limité au prêt, avertissement du simulateur encore
  redéplacé**, trois retouches indépendantes demandées par l'étude :
  - **`VERSION_APP`/`HISTORIQUE_VERSIONS` en heure de Paris**, pas l'heure du shell de
    développement (UTC par défaut ici, décalée d'1h ou 2h selon l'heure d'été/hiver) — voir la
    procédure mise à jour dans "Ce qui reste ouvert" plus bas (`TZ='Europe/Paris' date ...`).
  - **`telechargerICS()` n'exporte plus que la date d'obtention du prêt**, demandé explicitement —
    les événements Signature de l'acte/Vente préalable/échéances personnalisées, générés jusqu'ici
    dans le même fichier, sont retirés de `body` (seul `buildEvent(... d.pret ...)` reste). Un
    garde-fou a été ajouté en tête de la fonction : si `d.pret` est vide (sans prêt, ou date
    supprimée — voir `supprimerDateEcheance()` plus haut), un `afficherToast()` l'indique et rien ne
    se télécharge, plutôt qu'un `.ics` vide (juste l'en-tête `VCALENDAR`, sans `VEVENT`) — même
    principe que la contrainte n°5 de ce document sur les messages invisibles.
  - **Nom de fichier passé à `rappel_echeance_<nom du dossier>.ics`** (au lieu de
    `echeances-<nom du dossier>.ics`), demandé explicitement — la sanitisation du nom (minuscules,
    caractères spéciaux remplacés par des tirets) reste inchangée, seul le préfixe change.
  - **Avertissement du simulateur ("Montant à valider avant envoi.") redéplacé une troisième fois** :
    après le premier essai en tête d'onglet (texte détaillé) puis le second au-dessus de "Régime
    appliqué" (voir son historique plus haut), l'étude a demandé de le placer sous "Paramètres de
    l'acquisition" — la carte de gauche, celle du formulaire de saisie. Déplacé comme 3ᵉ enfant de
    `.dash-grid` (grille CSS 2 colonnes `1.3fr 1fr`, déjà en place), juste après la fermeture de la
    carte "Résultat de la provision" : la mise en page automatique de la grille (remplissage
    ligne par ligne, 2 colonnes déjà occupées par les deux cartes de la 1ère ligne) le fait
    naturellement retomber en 2ᵉ ligne, 1ʳᵉ colonne — sous "Paramètres de l'acquisition" et non sous
    "Résultat de la provision" — sans le moindre `grid-column` explicite à écrire. Reste donc à la
    largeur de cette colonne (pas pleine largeur), cohérent avec "sous CE module" plutôt qu'un
    bandeau general repris à l'identique.
  - Vérifié visuellement (Playwright, clair et sombre) : bandeau bien positionné sous "Paramètres de
    l'acquisition" dans les deux thèmes ; export `.ics` d'un dossier synthétique confirmé limité à un
    seul `VEVENT` (`Obtention du prêt`) avec le nom de fichier `rappel_echeance_<nom>.ics` attendu
    (téléchargement intercepté et fichier relu). `npm test` reste vert (132 tests, aucune fonction
    pure modifiée par ce chantier).
- **Bug corrigé : la croix de suppression d'une date (`.tab-suppr`, voir `supprimerDateEcheance()`
  plus haut) pouvait se superposer au sélecteur de catégorie (`.tab-select`) sur les tabs Prêt/
  Acte/Vente préalable**, signalé par l'étude juste après l'introduction de cette croix. Cause :
  `.tab-select` avait `max-width: 100%` (pleine largeur de la carte) alors que `.tab-suppr` est
  positionnée en `absolute` dans le même coin haut-droit (`top:6px; right:6px`, 20×20px) — un clic
  visant la croix pouvait retomber sur le sélecteur (ou l'inverse) selon la longueur du libellé de
  catégorie affiché ("Signature de l'acte" étant le plus long des trois). `.tab-select` réserve
  désormais 26px à droite (`max-width: calc(100% - 26px)`), appliqué en permanence plutôt que
  seulement quand une croix est réellement affichée (pas de sélecteur CSS simple pour cibler ce cas
  depuis un élément sibling) — perte de largeur négligeable pour des libellés aussi courts. Vérifié
  par mesure des rectangles réels des deux éléments (Playwright, `getBoundingClientRect`) sur les
  trois tabs : plus aucun chevauchement, dans les deux thèmes. `npm test` reste vert (132 tests,
  retouche CSS uniquement).
- **Série de 7 retouches demandées par l'étude, traitées indépendamment** :
  - **Sélecteur de catégorie d'une échéance (Prêt/Acte/Vente préalable) : titre statique + petite
    flèche à côté**, plutôt que le titre entier comme `<select>` déguisé — rien n'indiquait avant
    ce correctif qu'il s'agissait d'un menu déroulant tant qu'on n'y avait pas cliqué. `renderTab()`
    construit maintenant `.tab-titre-ligne` (le titre, coloré par catégorie comme avant, +
    `.tab-select-icone-wrap`) : le `<select>` natif reste fonctionnellement identique (mêmes
    `<option>`, même `changerCategorie()` au `onchange`) mais devient invisible (`opacity:0`),
    étiré sur toute la petite zone, avec juste une flèche `chevron-down` (nouvelle icône) décorative
    superposée (`pointer-events:none`) qui, elle, reste visible et réagit au survol/focus du
    `<select>` réel via `:focus-visible ~`. `.tab-select` (l'ancienne classe, tout le titre cliquable)
    est retirée, remplacée par `.tab-titre-ligne`/`.tab-select-icone*` — y compris dans la règle
    `@media print` qui masquait les contrôles d'édition.
  - **Bouton "Ouvrir le compromis"**, ajouté juste avant "Changer de dossier"/"Lier un dossier
    local" sur la fiche : jusqu'ici, une fois le dossier enregistré, il n'existait plus aucun moyen
    de rouvrir le PDF du compromis lui-même (contrairement à l'offre de prêt/aux pièces, qui
    gardent leur handle de fichier). `CLE_HANDLE_COMPROMIS(id)` (même famille que
    `CLE_HANDLE_OFFRE`/`CLE_HANDLE_PIECE`) + `ouvrirCompromisTrouve(dossierId, btn)` : si un handle
    est déjà mémorisé (un clic précédent l'a déjà trouvé), ouvre directement
    (`ouvrirFichierTrouve()`, réutilisé tel quel) ; sinon cherche dans le dossier local relié un
    fichier dont le nom contient "compromis", puis "promesse" en repli
    (`chercherFichierParNom()`, déjà utilisée pour les pièces personnalisées) — l'outil couvre
    aussi bien un compromis qu'une promesse unilatérale (voir RE_ROLE_VENDEUR/RE_ROLE_ACQUEREUR).
    Contrairement à l'offre/aux pièces, ce document n'est JAMAIS recherché par
    `verifierDossierLocal()` (ce n'est pas une pièce de la checklist) : la recherche n'a lieu qu'à
    la demande, au clic. Le handle est explicitement effacé (`enregistrerHandle(cle, null)`) dans
    `lierDossierLocal()` à chaque (re)liaison — sans quoi, après un changement de dossier local, le
    bouton aurait rouvert silencieusement un fichier de l'ANCIEN dossier. **Ce bouton et
    "Changer de dossier"/"Lier un dossier local" reprennent tous les deux le design de
    "+ Ajouter une pièce"** (`.action-rapide`, demandé explicitement) : l'ancienne classe
    `.lien-dossier-local` (lien souligné) reste utilisée ailleurs sur la fiche (Revérifier l'offre,
    reconfirmer l'accès), non concernée par ce changement de style.
  - **Recherche insensible aux accents/majuscules** (`#recherche-dossiers` dans le Suivi,
    `#recherche-dashboard` sur le Tableau de bord) : nouvelle fonction `normaliserPourRecherche()`
    (décompose en NFD puis retire les diacritiques isolés, avant de comparer en minuscules) —
    distincte de `normaliserNomPourMotif()` (qui RECOMPOSE en NFC pour un test de nom de fichier
    exact, sans jamais retirer un accent). Appliquée à la fois à la saisie et au texte comparé
    (nom + responsable) dans `render()` et `renderRechercheDashboard()` : "depont" retrouve
    désormais "DÉPONT" aussi bien que "Dupont".
  - **Pièce personnalisée : icône et texte cliquables indépendamment.** Avant ce correctif, toute
    la puce (`.piece-label`, un seul `<button>`) changeait le statut au clic, quel que soit
    l'endroit cliqué — aucun moyen de rouvrir un fichier déjà retrouvé (par la recherche
    automatique à l'ajout, voir son historique plus haut, ou par "Revérifier les pièces" ensuite)
    sans redescendre par un autre chemin. `renderPiecesDossier()` sépare désormais `.piece-label`
    (redevenu un simple `<span>` conteneur, comme pour les autres pièces) en deux `<button>`
    distincts : `.piece-icone-btn` (cycle le statut via `basculerStatutPiecePersonnalisee()`) et
    soit `.piece-texte-btn` (ouvre le fichier trouvé via `ouvrirPieceTrouvee()`, uniquement si le
    statut est "reçue") soit un simple `<span class="piece-texte">` sinon (rien à ouvrir tant que la
    pièce n'est pas reçue). Même principe déjà en place pour `.piece-item`/`.piece-suppr` : deux
    `<button>` côte à côte, jamais l'un imbriqué dans l'autre.
  - **Avertissement "barème non audité" du simulateur : 4e repositionnement**, cette fois en petit
    label à côté du titre plutôt qu'un bandeau pleine largeur (les trois essais précédents — tête
    d'onglet, au-dessus de "Régime appliqué", sous "Paramètres de l'acquisition" — voir leur
    historique plus haut). `.calc-avertissement` (bandeau) est retirée, remplacée par
    `.dash-titre-ligne` (nouveau conteneur flex à côté du `<h1>`) + `.calc-warning-label` (petit
    badge arrondi ambre/rouge, icône + texte court "Montant à valider avant envoi", le détail complet
    restant en `title` et dans "Régime appliqué" plus bas).
  - **Mobile (sous 900px) : recherche + "+ Nouveau dossier" en pleine largeur sur le Tableau de
    bord**, même traitement que celui déjà en place sur le Suivi (voir son historique) — nouvelle
    classe `.dash-header-nouveau` sur le bouton (pendant de `.list-heading-nouveau`) et un nouveau
    bloc `@media (max-width: 900px)` pour `.dash-header-actions`/`.dash-recherche` (colonne, pleine
    largeur), symétrique de celui du Suivi.
  - **Badge "Alpha" en haut à droite de la sidebar** (`.sidebar-alpha-badge`), demandé par l'étude
    pour signaler que l'outil reste en évolution active. Positionné en absolu directement dans
    `<aside class="sidebar">` (déjà `position: sticky`, donc déjà un conteneur de positionnement
    pour ses descendants absolus, sans avoir besoin d'un `position: relative` supplémentaire) —
    n'entre jamais dans le flux, ne pousse jamais le logo/la tagline en dessous.
  - Vérifié visuellement (Playwright, clair et sombre, desktop et mobile ~400px) : flèche de
    catégorie fonctionnelle (changement de catégorie confirmé après clic simulé), bouton "Ouvrir le
    compromis" au design `.action-rapide` bien positionné avant "Changer de dossier", recherche
    "depont"/"DEPONT" retrouvant bien un dossier nommé "DÉPONT", clic sur l'icône d'une pièce
    personnalisée confirmé changer uniquement `d.pieces[cle]` (texte inchangé), badge "Alpha"
    et bandeau mobile Suivi/Tableau de bord conformes dans les deux thèmes. `npm test` reste vert
    (132 tests, aucune fonction pure testable ajoutée — `normaliserPourRecherche()` est une fonction
    pure mais appelée uniquement depuis du code DOM non couvert par la suite actuelle, comme les
    autres fonctions de filtrage de `render()`).
- **Offre de prêt détectée uniquement par le NOM DU FICHIER, plus jamais par son contenu** :
  demande explicite de l'étude ("trop d'erreur") — `verifierDossierLocal()` ouvrait et lisait le
  contenu de chaque PDF pour y chercher `OFFRE_PRET_RE`, avec les mêmes limites déjà rencontrées et
  déjà corrigées pour la checklist de pièces (polices embarquées mal encodées produisant un texte
  extrait illisible, ou à l'inverse un autre document mentionnant l'offre en passant sans être
  l'offre elle-même). `OFFRE_PRET_RE` sert désormais exclusivement à tester le nom de fichier
  normalisé (`normaliserNomPourMotif` — NFC, underscores/tirets → espaces), exactement comme les
  `motifNom` de la checklist : `\s+` devient `\s*` pour couvrir aussi un nom concaténé sans
  séparateur ("OffreDePret.pdf"), en plus des noms espacés ou à underscores/tirets ; "accord de
  prêt" ajouté comme variante supplémentaire. Le montant emprunté (`detecterMontantPret`, utilisé
  par `calculerApport()`) est conservé : une fois le fichier identifié avec certitude par son nom,
  une seule lecture best-effort de CE fichier en extrait le montant — ce n'est plus "lire le PDF
  pour reconnaître l'offre" (ce qui a été arrêté), seulement en extraire un chiffre annexe une fois
  le bon fichier déjà connu ; un échec de lecture/extraction laisse simplement `d.montantPret` tel
  quel, sans jamais remettre en cause la détection de l'offre elle-même. Toute la logique de lecture
  de contenu (OCR compris) disparaît de `verifierDossierLocal()`, qui ne fait plus qu'un seul
  passage par nom de fichier — plus rapide sur un dossier volumineux, en plus d'être plus fiable.
  Nouveau test dans `tests/dossier-local.test.js` (variantes espacée/underscore/concaténée/tiret,
  et un nom sans rapport qui ne doit pas matcher) ; `npm test` reste vert (133 tests).
- **Réinitialiser une pièce STANDARD marquée "reçue" à tort** (mauvaise correspondance de nom, ou
  fichier renommé depuis) : signalé par l'étude — `verifierDossierLocal()` ne recherche que les
  pièces PAS déjà `'recue'` (voir `aChercher`), donc une pièce ainsi bloquée n'était plus jamais
  retestée par "Revérifier". Nouveau bouton `.piece-reinit` (icône `rotate-ccw`, nouvelle icône du
  jeu SVG maison) à côté de la croix `.piece-suppr` sur chaque pièce standard reçue (pas sur une
  pièce personnalisée, qui a déjà son propre cycle de statut au clic sur l'icône) :
  `reinitialiserStatutPieceStandard(dossierId, cle, label)` (gardée par `demanderConfirmation()`,
  comme `retirerPieceStandard()`) remet `d.pieces[cle]` à `'manquante'` (repasse dans `aChercher` au
  prochain parcours) et efface le handle mémorisé du fichier trouvé à tort
  (`enregistrerHandle(CLE_HANDLE_PIECE(...), null)`, même mécanisme que `lierDossierLocal()` qui
  l'efface déjà à chaque nouvelle liaison) — sans quoi le bouton "ouvrir le fichier trouvé"
  continuerait de rouvrir l'ancien fichier le temps qu'une nouvelle correspondance soit trouvée.
  Historique journalisé, comme un retrait de pièce. Vérifié par un script Node ad hoc (chargement de
  `script.js` en bac à sable) : le bouton et son `onclick` apparaissent bien dans le HTML généré par
  `renderPiecesDossier()` pour une pièce reçue ; la fonction de mutation elle-même n'est pas
  unit-testable pour la même raison que les autres fonctions de ce type (dépend de `dossiers`,
  invisible depuis les tests — voir `tests/helpers/load-app.js`).
- **Bug corrigé : `escapeAttr()` n'échappait pas l'apostrophe**, signalé par l'étude — le bouton
  `.piece-reinit` (voir juste au-dessus) et `.piece-suppr` restaient sans effet sur "Certificat
  d'urbanisme" ("le bouton de la première ligne de Pièces du dossier n'est plus cliquable", ce
  dernier étant le premier item de `PIECES_URBANISME`). Cause : ces boutons interpolent
  `escapeAttr(p.label)` À L'INTÉRIEUR d'un argument JS délimité par des apostrophes
  (`onclick="fonction('id', 'cle', '${escapeAttr(p.label)}')"`) — une apostrophe brute dans le
  libellé ferme prématurément cet argument, cassant la syntaxe du gestionnaire `onclick` (clic sans
  effet, erreur silencieuse en console). Touchait tout libellé de pièce avec une apostrophe, pas un
  cas isolé ("Certificat d'alignement" aussi, en théorie — l'étude n'avait probablement testé/
  remarqué que le premier item de la liste). Corrigé en ajoutant `.replace(/'/g, '&#39;')` à
  `escapeAttr()` (entité HTML numérique standard, cohérent avec `&quot;` déjà géré juste avant).
- **Suppression d'un engagement du vendeur ou d'un document identifié possible partout**, demandé
  par l'étude — jusqu'ici, seuls les engagements ajoutés À LA MAIN (sélection de texte dans le PDF)
  pouvaient être retirés, et seulement PENDANT L'IMPORT (`supprimerEngagementManuel()`, agit sur
  `analyseJuridiqueActuelle`) ; aucun document identifié n'était retirable nulle part ; et sur une
  fiche déjà enregistrée, `renderEngagement(e)` était appelé sans `index` — même un engagement
  manuel y affichait un bouton non fonctionnel. Décision explicite de revenir sur le principe
  précédent ("corriger un engagement détecté automatiquement reste l'affaire de la regex, pas d'un
  retrait au cas par cas") : l'étude a demandé cette capacité explicitement, pour les deux
  contextes.
  - `renderEngagement(e, index, dossierId)`/`renderDocBadge(doc, index, dossierId)` : la croix de
    suppression s'affiche désormais pour TOUT engagement (plus seulement `manuel === true`) et pour
    tout document. `dossierId` absent (pendant l'import, voir `afficherAnalyseJuridique()`) → agit
    sur `analyseJuridiqueActuelle` (`supprimerEngagementManuel()`, inchangée ; nouvelle
    `supprimerDocumentManuel()`, même principe), sans confirmation — état pré-enregistrement,
    réversible en réimportant le PDF. `dossierId` fourni (fiche d'un dossier déjà enregistré, voir
    `renderCarteDossier()`) → nouvelles fonctions `supprimerEngagementDossier(dossierId, index)`/
    `supprimerDocumentDossier(dossierId, index)`, gardées par `demanderConfirmation()` et
    journalisées dans l'historique (même schéma que `retirerPieceStandard()`) : c'est ici une
    modification d'un dossier déjà sauvegardé, pas un état d'import réversible.
  - `renderCarteDossier()` passe maintenant `d.id` et l'index à ces deux fonctions de rendu (les
    deux appels n'en passaient aucun jusqu'ici).
  - **Volontairement découplé de la checklist de pièces** (`d.piecesEngagementsDetectees`/
    `PIECES_ENGAGEMENTS_AUTO`) : retirer un "document" de cette liste d'analyse (purement
    informative) ne touche pas la checklist de pièces du dossier, qui garde son propre mécanisme de
    retrait (`retirerPieceStandard()`/croix sur `.piece-item`) — pas de scope creep au-delà de la
    demande.
  - Nouvelle classe CSS `.analyse-doc-suppr` (même gabarit que `.piece-suppr`/`.engagement-suppr`) ;
    `.engagement-suppr` (oubliée jusqu'ici) et `.analyse-doc-suppr` ajoutées au filtre d'impression
    existant — des contrôles d'édition n'ont pas leur place sur la fiche imprimée.
  - Vérifié par un script Node ad hoc (bac à sable) : `renderEngagement`/`renderDocBadge` avec et
    sans `dossierId` produisent bien l'`onclick` attendu dans chaque contexte. `npm test` reste vert
    (134 tests, aucune fonction pure ajoutée — ces fonctions dépendent de `dossiers`/
    `analyseJuridiqueActuelle`, même limite que pour les autres fonctions de mutation du fichier).
- **`OFFRE_PRET_RE` étendue à "contrat de crédit"/"contrat de prêt"**, demandé par l'étude : certains
  établissements nomment le document remis à l'emprunteur "contrat" plutôt que "offre" (notamment
  une fois signé/accepté). Deux alternatives ajoutées au motif (qui ne teste plus que le NOM DU
  FICHIER, voir son historique juste au-dessus) — `\s*` déjà en place couvre aussi bien "Contrat de
  crédit.pdf" que "Contrat de crédit immobilier.pdf"/"ContratDeCredit.pdf". Nouveaux cas dans
  `tests/dossier-local.test.js` ; `npm test` reste vert.
- **`renonciationPreemption.motifNom` élargi au sigle "DPU"** (Droit de Préemption Urbain), demandé
  par l'étude à partir d'un nom de fichier réel ("Renonciation au DPU.pdf") — même principe que les
  autres sigles courts déjà acceptés seuls (TF, SPANC, ERP, CU) : un sigle assez spécifique au
  contexte notarial pour ne pas risquer d'apparaître incidemment dans le nom d'un autre document du
  même dossier. Cas ajouté au test existant dans `tests/dossier-local.test.js`.
- **Champ de recherche dans l'aperçu du compromis** (comme le Ctrl+F d'un vrai lecteur PDF),
  demandé par l'étude — jusqu'ici, retrouver un mot précis dans un compromis de plusieurs dizaines
  de pages n'était possible qu'en faisant défiler visuellement l'aperçu. Fonctionnalité purement
  côté client (aucun appel serveur), donc identique sur `main` et `claude/serveur-intranet`.
  - `rechercherDansPdf(valeur)` (script.js, juste après `voirEngagementDansPdf()`) réutilise
    directement la couche de texte déjà posée par `construireCoucheTexte()` pour la sélection
    manuelle (voir son historique plus haut) — plutôt que de rappeler `pdf.js`
    (`getTextContent()`) à chaque frappe, ce qui reparserait tout le document à chaque caractère
    tapé : les `<span>` (un par item pdf.js, déjà positionnés pixel pour pixel sur le rendu) sont
    déjà en place, il suffit de les parcourir et de leur ajouter une classe de surlignage. Même
    principe de reconstruction texte+mapping d'index que `voirEngagementDansPdf()` (concaténer le
    texte de chaque page en mémorisant, pour chaque caractère, le `<span>` d'origine) — nécessaire
    pour retrouver une requête qui chevauche plusieurs items (ex. "offre de prêt" répartie sur 2-3
    fragments de ligne). Insensible aux accents/majuscules via `normaliserPourRecherche()` (déjà
    utilisée pour la recherche de dossiers dans le Suivi/le Tableau de bord) — "pret" retrouve
    aussi bien "prêt" que "PRÊT". Logique de correspondance (mono-item, insensible casse/accents,
    chevauchant plusieurs items, absence) vérifiée par une simulation Node ad hoc avant d'écrire le
    code définitif.
  - Barre de recherche (`.pdf-recherche-barre`, sous le titre "Aperçu du compromis") : un champ
    (`oninput`, recherche en direct), un compteur "N / M" (ou "Aucun résultat"), deux boutons
    précédent/suivant (icônes `chevron-up`/`chevron-down`, nouvelle icône `chevron-up` ajoutée au
    jeu SVG maison). Entrée/Maj+Entrée dans le champ équivalent aux boutons suivant/précédent,
    comme un vrai lecteur. `allerResultatPdf(index)` fait défiler jusqu'au résultat
    (`scrollIntoView`) et bascule le style `.pdf-search-marque-active` (contour + fond plus appuyé)
    sur les `<span>` concernés, les autres résultats restant marqués plus discrètement
    (`.pdf-search-marque`, fond jaune translucide directement posé sur les `<span>` transparents
    déjà en place — pas de nouvel élément à positionner).
  - `reinitialiserRecherchePdf()` (vide le champ, le compteur, les tableaux de résultats) appelée à
    chaque nouveau chargement de pages (`chargerToutesLesPagesPdf()`, qui détruit de toute façon les
    `<span>` existants via `conteneur.innerHTML = ''`) et à `reinitialiserFormulaire()` — sans ça,
    une recherche menée sur le PDF précédent resterait affichée (champ, compteur) alors que les
    `<span>` qu'elle référence ont déjà été détruits.
  - **Piège de spécificité CSS déjà documenté (voir `.select-edit`/`.input-inline` plus haut),
    rencontré une troisième fois** : la règle générique des champs de formulaire
    (`input[type="search"]`, ~ligne 1162) a la MÊME spécificité qu'un simple `input.pdf-recherche-input`
    (élément + attribut vs élément + classe) — à spécificité égale, c'est l'ordre d'apparition dans
    le fichier qui tranche, et cette règle générique arrive après. Corrigé avec un sélecteur composé
    `.pdf-recherche-barre input.pdf-recherche-input` (élément + 2 classes), qui l'emporte quel que
    soit l'ordre. Point de vigilance générique pour tout futur champ personnalisé de cet outil : un
    simple `input.ma-classe` ne suffit pas forcément face à `input[type="..."]`, il faut au moins un
    sélecteur composé (ou plus spécifique encore) pour être sûr de l'emporter indépendamment de
    l'ordre du fichier.
  - `.pdf-viewer` (l'aside tout entier) est déjà masqué à l'impression (`@media print`, règle
    existante) : rien à ajouter pour exclure la barre de recherche de la fiche imprimée.
  - Vérifié : `npm test` reste vert (134 tests, aucune fonction pure ajoutée — cette fonctionnalité
    dépend entièrement du DOM/de pdf.js, comme la sélection manuelle de texte dont elle réutilise la
    couche) ; les nouvelles fonctions confirmées exposées par un script bac à sable
    (`tests/helpers/load-app.js`) ; la logique de correspondance (recherche/mapping d'index)
    vérifiée séparément par simulation Node sur des cas représentatifs. **Non vérifié avec un vrai
    rendu PDF dans cet environnement** (pdf.js chargé depuis un CDN bloqué par le proxy réseau de
    développement ici, comme pour les autres fonctionnalités liées à la sélection/au surlignage
    dans l'aperçu) — à confirmer par l'étude sur un compromis réel.

## Mode serveur intranet (c'est désormais `main` — voir « Branches du dépôt » en tête de fichier)

> **Note de relecture (18/09/2026)** : cette section a été écrite pendant que le serveur vivait
> sur une branche séparée, `claude/serveur-intranet`, face à un `main` qui portait la version
> 100 % locale. Depuis la réorganisation des branches, **c'est ce mode serveur qui EST `main`**,
> et la version 100 % locale n'existe plus que dans l'historique (commit `c90e9d0`). Le texte
> ci-dessous est conservé tel quel pour ne pas perdre le raisonnement d'origine : partout où il
> oppose « cette branche » à « `main` », lire « la version serveur » contre « la version
> 100 % locale ».

Chantier séparé, sur sa propre branche — **`main` reste le mode 100% local décrit dans tout ce
document ci-dessus, inchangé.** Origine : l'étude a demandé, en discutant des limites du registre
partagé réseau (voir son historique plus haut — fichier JSON, "dernière sauvegarde gagne") et de
l'impossibilité d'envoyer un email ou de mettre à jour un calendrier automatiquement (contraintes
fondamentales n°1 et n°4), d'explorer un vrai serveur hébergé sur un poste du bureau de l'étude
(réseau local, pas d'hébergement en ligne — ça ne revient pas sur la décision "rester en local"
de `main`, ce serveur reste strictement interne au réseau de l'étude).

**Décisions prises pour ce chantier** (ne pas les rouvrir sans qu'on le redemande) :
authentification par un mot de passe partagé unique (pas de compte par collaborateur), remplacement
complet du registre partagé JSON/`localStorage` (pas de double mode), synchro entre postes par
sondage périodique plutôt que WebSocket (3 collaborateurs sur un LAN, pas besoin de temps réel
avec connexion persistante). L'accès Microsoft Graph envisagé un temps pour les relances
email/calendrier n'a finalement pas été disponible — sans conséquence pratique puisque ces deux
fonctionnalités n'ont pas été poursuivies (voir plus bas).

**Ce qui a été fait :**
- **`server/`** (nouveau dossier autonome, son propre `package.json`/`node_modules` — jamais le
  root `package.json`, qui reste volontairement "zéro dépendance") : un serveur Express +
  `node:sqlite` (module intégré à Node 22, pas de compilation native — évite d'installer Visual
  Studio Build Tools sur le poste de l'étude, seul Node.js est nécessaire). Sert lui-même
  `index.html`/`style.css`/`script.js` (`express.static` sur la racine du dépôt) : un seul port,
  aucune balise `<link>`/`<script src>` à changer. CRUD complet sur `/api/dossiers`
  (`server/src/routes/dossiers.js`) avec suppression douce (`deleted_at`, backe le toast "Annuler"
  existant côté client) et polling par curseur (`GET /api/dossiers?since=<ms>`, le curseur étant
  un timestamp assigné par le serveur, jamais une horloge cliente). Authentification par mot de
  passe partagé (`server/src/auth.js`) : jeton opaque en mémoire, comparaison en temps constant,
  session valable 12h. Voir `server/README.md` pour le démarrage.
- **`script.js`** : `charger()`/`sauvegarder()` réécrits pour parler à ce serveur via `fetch()`
  au lieu de `localStorage`. `sauvegarder()` prend maintenant le dossier modifié en paramètre
  (`sauvegarder(d)`, un `PUT` par dossier) — chaque site d'appel (~22, `changerCategorie`,
  `archiverDossier`, `supprimerDateEcheance`...) avait déjà `d` en portée juste après l'avoir
  modifié, retouche mécanique confirmée site par site avant d'être appliquée. `ajouterDossier()`
  appelle une nouvelle `sauvegarderNouveauDossier(d)` (`POST`) ; `supprimerDossier()`/son "Annuler"
  passent par `supprimerDossierServeur()`/`restaurerDossierServeur()` (suppression douce +
  restauration, plus besoin de garder l'objet supprimé côté client pour l'undo). Le mécanisme
  "registre partagé réseau" (`ecrireRegistrePartage`, `lireRegistrePartage`,
  `tenterReconnexionPartage`, le bouton correspondant dans la toolbar du Suivi...) est
  entièrement retiré : le serveur est toujours la source de vérité, plus de geste de liaison à un
  fichier. Nouvel écran de connexion (`#connexion-overlay`, clone du patron `.confirm-overlay`
  déjà utilisé par les autres popups de l'outil) qui bloque toute l'application tant que le mot de
  passe n'a pas été validé — jamais fermable via Échap/clic sur le fond, contrairement aux autres
  overlays. Synchro par sondage (`sondagePeriodique()`, toutes les 7 secondes, mis en pause via
  `document.visibilitychange` quand l'onglet n'est pas visible, un sondage immédiat au retour de
  focus) plutôt que les 2 minutes de l'ancien registre partagé.
- **Vérifié de bout en bout** avec un vrai serveur (Playwright, deux contextes navigateur
  simulant deux postes) : écran de connexion, mauvais mot de passe rejeté, jeton persistant après
  connexion réussie, et la synchro elle-même — un dossier créé sur le "poste A" apparaît chez le
  "poste B" au sondage suivant, une suppression puis sa restauration aussi. Les 132 tests existants
  à la racine restent verts sans modification de leur propre code (un stub `fetch` a été ajouté au
  bac à sable de `tests/helpers/load-app.js`, jamais sollicité en pratique par la suite actuelle
  puisqu'aucun test ne pré-remplit de jeton de session dans le faux `localStorage`).

**Distribution simplifiée : `CLAIRE-serveur.exe` (exécutable Windows autonome)** — après avoir
reçu les deux archives (locale/serveur), l'étude a trouvé l'installation du serveur (`npm
install`, créer un `.env`, `npm start`, terminal ouvert) trop compliquée pour un usage sans
accompagnement technique. Question posée directement à l'étude entre trois options (`.exe`
autonome, `.bat` tout-en-un, abandon du serveur) : elle a choisi le `.exe` autonome.
- **Node.js Single Executable Applications (SEA)**, pas `pkg`/`nexe` : le serveur utilise déjà
  `node:sqlite`, un module intégré à Node (pas natif externe à recompiler) — SEA embarque le vrai
  binaire `node`, donc `node:sqlite` fonctionne sans rien de spécial, contrairement à un bundler
  tiers qui gérerait moins bien un module intégré aussi récent.
- `server/src/config.js` résout maintenant le mot de passe/port/chemin de base en trois niveaux :
  `.env`/variables d'environnement (mode développement, inchangé) → sinon, si `sea.isSea()`
  (mode `.exe`), un `config.json` à côté de l'exécutable → sinon génération automatique d'un mot
  de passe aléatoire au tout premier lancement, écrit dans `config.json` **et** dans
  `mot-de-passe.txt` (facile à retrouver sans faire défiler une console). `resoudreConfigExecutable()`
  est une fonction pure (dossier + `fs` injectables), testée dans `server/test/config.test.js`
  sans construire de vrai `.exe`.
- `server/src/app.js` sert `index.html`/`style.css`/`script.js`/`manifest.json`/`sw.js`/`icone.svg`
  depuis le disque en développement (`express.static`, inchangé) ou depuis les assets embarqués du
  blob SEA en mode `.exe` (`sea.getAsset()`, via `creerMiddlewareAssetsSea()` — testé avec un faux
  module `sea` dans `server/test/app-assets.test.js`, sans blob réel).
- `server/src/index.js` affiche les adresses IP locales du poste (à donner aux autres postes du
  bureau) et ouvre automatiquement le navigateur au démarrage sur Windows (`start ""`, même
  mécanisme déjà confirmé fonctionnel dans `Ouvrir-en-fenetre.bat` — voir la contrainte n°7 de
  `main`).
- **`server/scripts/build-windows-exe.mjs`** (nouveau) construit le `.exe` **dans cet
  environnement de développement Linux**, jamais par l'étude ni sur une machine Windows : regroupe
  le serveur en un seul fichier (esbuild), génère le blob SEA (avec les 6 fichiers statiques
  embarqués), télécharge le binaire Node officiel pour Windows x64 (`nodejs.org`, confirmé
  joignable via le proxy réseau de cet environnement), retire sa signature Authenticode
  (`osslsigncode`, équivalent Linux de `signtool remove /s` — sans lui, `postject` accepte quand
  même d'injecter avec un simple avertissement "signature corrompue", pas bloquant), puis injecte
  le blob (`postject`). Construit et vérifié avec succès dans cet environnement (`file` confirme un
  exécutable PE32+ Windows valide, ~85 Mo). `server/build/` (artefacts + le `.exe` lui-même)
  gitignoré — le binaire n'est jamais commité, livré directement à l'étude.
- **Risque assumé et documenté (`server/README.md`)** : le `.exe` produit n'est **pas signé** par
  un éditeur reconnu (aucun certificat de signature de code acheté pour ce projet) — Windows
  affichera très probablement un avertissement SmartScreen "Éditeur inconnu" au premier lancement
  (un clic "Plus d'infos" → "Exécuter quand même" suffit). **Non vérifié sur un vrai poste
  Windows** : aucune machine Windows/Wine disponible dans cet environnement de développement pour
  confirmer le comportement réel du double-clic (avertissement exact affiché, ouverture du
  navigateur, accès depuis un second poste via l'IP affichée) — à confirmer par l'étude, comme de
  nombreux autres comportements Windows/Chrome déjà documentés dans ce fichier.
- **Bug corrigé : le serveur s'arrêtait après quelques minutes sans aucun message visible**,
  signalé par l'étude (`ERR_CONNECTION_REFUSED` sur `localhost`). Cause probable : la fenêtre de
  console d'un `.exe` lancé par double-clic se ferme instantanément à la fin du processus — trop
  vite pour lire une éventuelle pile d'erreur, qu'il s'agisse d'une exception non interceptée dans
  le serveur ou d'un arrêt externe (antivirus). `server/src/index.js` ajoute
  `process.on('uncaughtException'|'unhandledRejection', ...)` : journalise dans `crash.log` (à
  côté de `config.json`/`data/`) au lieu de laisser le processus planter sans trace, et **continue
  de tourner** plutôt que de s'arrêter — ce serveur n'a quasiment aucun état mutable en mémoire en
  dehors de la connexion SQLite/des sessions d'authentification, perdre ces dernières ne coûte
  qu'une reconnexion. Sans effet si la cause réelle est un antivirus qui tue le processus de
  l'extérieur (aucun code JS ne peut réagir à ça) — voir `server/README.md`, qui documente les deux
  causes à vérifier dans cet ordre (historique de protection Windows, puis `crash.log`).
- **Cause réelle trouvée ensuite, en creusant le même symptôme : l'étude fermait elle-même la
  fenêtre de console**, pensant qu'elle ne servait à rien une fois le navigateur ouvert — ni un
  crash ni l'antivirus. `server/src/index.js` génère désormais, au premier démarrage en mode `.exe`
  (`config.estSea()`, jamais en `npm start`), deux scripts à côté de l'exécutable (jamais écrasés
  s'ils existent déjà) : `Lancer-CLAIRE-en-arriere-plan.vbs` (relance le même exe sans aucune
  fenêtre visible — `WScript.Shell.Run(..., 0, False)` — à utiliser au quotidien) et
  `Arreter-CLAIRE.bat` (arrête ce processus caché via son PID, écrit dans `server.pid` à chaque
  démarrage — sans lui, plus aucun moyen d'arrêter un serveur sans fenêtre autrement que par le
  Gestionnaire des tâches). `Adresses-du-serveur.txt` (URLs pour ce poste et les autres) est aussi
  écrit à chaque démarrage, pour rester consultable même fenêtre masquée. `server/README.md` reprend
  cette fenêtre fermée comme PREMIÈRE cause à vérifier, avant antivirus et `crash.log`.
- **`.toast` (notification "Offre de prêt trouvée...", etc.) passé à `z-index: 890`**, strictement
  en retrait de `.drawer-overlay` (tiroir de fiche dossier, `z-index: 900`) — signalé par l'étude
  comme une pop-up grise gênante après une recherche lancée depuis le tiroir. Les deux partageaient
  jusqu'ici la même valeur par coïncidence (empilement fragile, pas explicite) ; le tiroir montre
  déjà le même résultat dans sa checklist, ce toast n'a plus besoin de rivaliser avec son contenu.
- **Calendrier connecté (abonnement webcal) et vrai service Windows (NSSM)**, les deux derniers
  points de la liste "pas encore fait" ci-dessous, demandés ensemble explicitement par l'étude
  après un retour honnête sur l'état de cette branche (voir la discussion "que penses-tu de notre
  version serveur ?").
  - **`GET /calendrier.ics?token=...`** (`server/src/routes/calendrier.js`, nouveau) : génère un
    flux `.ics` À LA DEMANDE à partir de `depot.tousActifs()` (pas de tâche de fond, contrairement
    aux relances email envisagées un temps — un flux calendrier se régénère naturellement à chaque
    resynchronisation du client, inutile de le précalculer). Un événement par échéance ACTIVE de
    CHAQUE dossier actif (prêt/acte/vente préalable/`d.autres`), contrairement à l'export `.ics`
    manuel côté client (`telechargerICS()`, volontairement limité à la seule date de prêt d'UN
    dossier sur demande de l'étude, voir son historique plus haut) — les deux exports ont des
    besoins différents : un export ponctuel d'un dossier précis d'un côté, un abonnement continu
    censé refléter tout le portefeuille de l'autre. `buildEvent()`/`icsDate()`/`addDays()` sont
    réécrites côté serveur plutôt que partagées avec `script.js` : les deux mondes (navigateur/
    Node) n'ont pas de mécanisme de build commun dans ce projet (contrainte n°1 de la branche
    `main`, toujours valable ici pour le code partagé), dupliquer ces quelques lignes est plus
    simple qu'introduire un outillage juste pour ça.
    - **Jeton dédié (`config.jetonCalendrier`), jamais le mot de passe de connexion** : un
      abonnement webcal (Outlook...) ne sait suivre qu'une URL, sans écran de connexion ni en-tête
      `Authorization` possible — la route est donc volontairement montée HORS du
      `middlewareAuth` par session (`app.js`), et vérifie elle-même `req.query.token ===
      config.jetonCalendrier`. Un mot de passe partagé resterait sinon visible en clair dans les
      paramètres de calendrier de n'importe quel poste abonné, et le changer casserait aussi la
      connexion de tout le monde à l'outil — deux raisons de garder les deux jetons séparés.
    - `config.js` étend `resoudreConfigExecutable()` (déjà en place pour `authPassword`) au même
      principe pour `calendrierToken` : généré au premier lancement du `.exe`, persisté dans
      `config.json` à côté du mot de passe. **Cas de mise à jour explicitement géré** : un
      `config.json` déjà existant, généré par une version antérieure à cette fonctionnalité, n'a
      pas ce champ — plutôt que d'exiger de le supprimer (ce qui régénérerait aussi le mot de passe
      partagé, sans rapport), `resoudreConfigExecutable()` détecte son absence et complète
      `config.json` avec un jeton généré à la volée, sans toucher au reste. Le jeton ne vit que
      dans `config.json`/l'URL elle-même — jamais dans `mot-de-passe.txt`, qui reste réservé au mot
      de passe de connexion.
    - Adresse(s) d'abonnement affichées au démarrage (`index.js`, aux côtés des adresses LAN déjà
      affichées) et écrites dans `Adresses-du-serveur.txt` en mode `.exe` — rien à afficher si
      `jetonCalendrier` est vide (mode développement sans `CALENDRIER_TOKEN` dans `.env` : la
      fonctionnalité reste silencieusement désactivée, `GET /calendrier.ics` répond alors 503).
    - Tests dans `server/test/calendrier.test.js` : `genererFluxIcs()` (fonction pure) vérifiée
      isolément (nombre de `VEVENT`, dossier archivé exclu, échéance sans date ignorée, `d.autres`
      inclus, repli sur le nom complet sans "/") ; la route elle-même vérifiée via un serveur réel
      (403 sans jeton/mauvais jeton, 200 avec le bon jeton **sans aucun en-tête Authorization** —
      le point central de cette route —, 503 quand aucun jeton n'est configuré). `npm test` (côté
      `server/`) passe de 15 à 25 tests.
  - **Service Windows via NSSM** (`server/scripts/Installer-service-NSSM.bat`/
    `Desinstaller-service-NSSM.bat`, nouveaux) : contrairement au simple exécutable existant
    (dépendant d'une fenêtre de console ou de `Lancer-CLAIRE-en-arrière-plan.vbs`, voir plus haut),
    un service Windows démarre seul au boot du poste ET redémarre seul après un plantage — les deux
    manques identifiés dans la section "pas encore prêt" du README. NSSM (Non-Sucking Service
    Manager) est un outil TIERS gratuit (<https://nssm.cc/>), pas développé par ce projet ni
    embarqué dans le dépôt (aucune URL binaire arbitraire téléchargée par un script à l'exécution) :
    l'étude télécharge `nssm.exe` elle-même une fois, les deux `.bat` ne font que le PILOTER
    (`nssm install`/`set`/`start`/`stop`/`remove`) avec des paramètres adaptés à `CLAIRE-serveur.exe`
    (répertoire de travail, redémarrage automatique `AppExit Default Restart`, journaux
    `AppStdout`/`AppStderr` avec rotation — remplacent la console pour diagnostiquer, puisqu'un
    service n'en a justement plus).
    - **Piège de syntaxe batch déjà documenté (voir le point ci-dessus sur `Ouvrir-en-fenetre.bat`)
      appliqué par précaution** : aucune parenthèse non échappée dans un `echo` à l'intérieur d'un
      bloc `if (...)`, et aucun caractère accentué (cohérent avec `Arreter-CLAIRE.bat`/
      `Lancer-CLAIRE-en-arriere-plan.vbs`, déjà écrits sans accents) — pas un problème rencontré
      cette fois-ci, une précaution prise en écrivant ces deux nouveaux scripts à la main plutôt
      que générés par `index.js`.
    - `ouvrirNavigateur()` (`index.js`) : un service Windows tourne en Session 0, sans bureau
      interactif — y appeler `start` ouvrirait un processus fantôme (ou rien du tout) plutôt qu'un
      navigateur visible par quelqu'un. Nouveau garde-fou : `process.env.SESSIONNAME` n'est
      renseignée QUE dans une session interactive (console locale ou bureau à distance), jamais en
      Session 0 — signal le plus simple pour sauter l'ouverture automatique sans dépendance
      supplémentaire ni détection plus complexe. Sans effet sur l'usage courant (lancement direct
      ou via le `.vbs`, tous deux dans une session interactive).
    - **Non vérifié sur un vrai poste Windows dans cet environnement de développement** (aucune
      machine Windows/NSSM disponible ici) : les deux scripts pilotent NSSM avec sa syntaxe
      documentée officiellement, mais l'installation réelle, le redémarrage automatique après un
      plantage simulé et le démarrage au boot restent à confirmer par l'étude — même limite déjà
      assumée pour `CLAIRE-serveur.exe` lui-même (non signé, jamais testé par un vrai double-clic
      avant livraison à l'étude).
  - `server/README.md` : nouvelles sections "Calendrier connecté" et "Service Windows" (procédure
    complète, liens NSSM, limites connues) ; la liste "Ce qui n'est PAS encore prêt" mise à jour en
    conséquence (les deux points sont passés de "pas fait" à "fait mais non vérifié sur un poste
    Windows réel" — les seules relances email automatiques restent non implémentées).
- **Bug corrigé, diagnostiqué depuis la console du navigateur transmise par l'étude : le correctif
  `escapeAttr()` (apostrophe, voir son historique plus haut dans la section `main`) ne fonctionnait
  toujours pas sur "Certificat d'urbanisme"/"Certificat d'alignement" malgré une vérification de
  code qui le donnait pourtant correct.** Ce qui a permis de trancher sans ambiguïté : l'étude a
  copié-collé la console DevTools, qui montrait exactement `Uncaught SyntaxError: missing ) after
  argument list` répété QUATRE fois au chargement de la fiche — soit exactement les 4 boutons
  concernés (croix "Retirer" + icône "Réinitialiser", sur les 2 pièces avec apostrophe). Cette
  signature d'erreur precise (pas une simple absence de réaction au clic) a confirmé que le
  `CLAIRE-serveur.exe` réellement en service chez l'étude embarquait encore un `script.js`
  antérieur au correctif — le code du dépôt, lui, était déjà correct (vérifié une seconde fois par
  régénération du HTML de `renderPiecesDossier()`, résultat identique aux deux vérifications
  précédentes). **Aucun changement de code cette fois** : la seule action a été de confirmer le
  diagnostic par la trace d'erreur exacte plutôt que de retoucher une fonction déjà correcte, et de
  pointer l'étude vers "À propos" (numéro de version affiché) pour vérifier sans ambiguïté si le
  remplacement du `.exe` a réellement pris effet avant de reproduire un correctif existant — leçon
  de fond identique à celle déjà tirée pour "Certificat alignement et numérotage"/"Avis de Taxes
  foncières" sur la branche `main` (voir son historique) : un signalement répété d'un bug déjà
  vérifié correct en code est presque toujours un problème de DÉPLOIEMENT (copie non remplacée,
  cache navigateur), pas une raison de retoucher le code une nouvelle fois sans preuve nouvelle.
- **Bug corrigé : le bouton "Se connecter" de l'écran de connexion venait se coller directement
  contre le bas du champ mot de passe**, signalé par l'étude ("le bouton valider mange un peu sur
  le champ de mot de passe"). Cause : contrairement aux autres champs de formulaire de l'outil (qui
  vivent dans un bloc avec son propre espacement), `#connexion-mot-de-passe` est seul dans son
  `<form>` (`display: flex; flex-direction: column`) sans aucune marge propre — la règle générique
  `input[type="password"]` (voir son historique plus haut) pose la largeur/le padding/la bordure
  mais jamais de `margin-bottom` — et le message d'erreur qui suit (`#connexion-erreur`) est masqué
  par défaut (`display:none`), donc ne comble aucun espace tant qu'aucune erreur n'est affichée : le
  bouton se retrouvait directement accolé au champ, sans le moindre espace entre les deux. Corrigé
  par `#connexion-mot-de-passe { margin-bottom: 14px; }` — cohérent avec le `margin: -10px 0 14px`
  déjà présent sur `#connexion-erreur` (ce -10px avait manifestement été pensé pour resserrer le
  message d'erreur SOUS un espacement de 14px déjà existant sur le champ, jamais posé en pratique).
- **"Mode sombre" et "À propos" placés côte à côte dans le pied de la sidebar**, demandé par
  l'étude (auparavant empilés verticalement comme l'installation PWA/le reste des liens). Les deux
  boutons sont regroupés dans un nouveau conteneur `.sidebar-footer-row` (`display:flex`) : le
  bouton de thème garde sa largeur au contenu (icône seule, déjà `.sidebar-link-icone-seule`),
  "À propos" prend le reste de la largeur disponible (`flex: 1 1 auto`). Le bouton d'installation
  PWA (`#install-btn`, visible seulement quand le navigateur le propose) reste seul sur sa propre
  ligne au-dessus — non concerné par cette demande, qui ne visait que mode sombre/À propos.
- **Vrai correctif, enfin, du bug apostrophe sur "Certificat d'urbanisme"/"Certificat
  d'alignement" — le correctif précédent (`escapeAttr()` → `&#39;`) ne réparait RIEN en pratique,
  malgré QUATRE vérifications indépendantes toutes concluantes (relecture du code, rendu en bac à
  sable, deux binaires `.exe` publiés inspectés octet par octet, et la réponse réseau de
  `script.js` relue directement dans les DevTools de l'étude, cache désactivé) et une entrée
  d'historique précédente affirmant à tort le problème réglé.** Cause racine, jamais identifiée par
  aucune de ces quatre vérifications parce qu'aucune ne rejouait le comportement réel du
  navigateur : un attribut `onclick="..."` est décodé **en deux temps** — d'abord comme du HTML
  (les entités comme `&#39;` sont résolues en leur caractère, donc `&#39;` redevient une apostrophe
  BRUTE `'`), **puis** le texte ainsi obtenu est exécuté comme du JS. `escapeAttr()` échappait bien
  l'apostrophe dans le CODE SOURCE HTML (`&#39;` au lieu de `'`) — exactement ce que montraient les
  quatre vérifications, toutes lisant le texte AVANT ce second décodage implicite — mais cette
  entité redevient une apostrophe brute avant même que le moteur JS ne voie l'attribut, recréant
  très exactement le `SyntaxError: missing ) after argument list` d'origine. Reproduit et confirmé
  par une simulation Node du décodage HTML+JS réel (script ad hoc) : le code source `'Certificat
  d&#39;urbanisme'` décode en `'Certificat d'urbanisme'` (apostrophe brute réinsérée) et lève bien
  la `SyntaxError` — la même simulation avec le nouveau correctif ne lève rien et restitue le
  libellé exact.
  - Nouvelle fonction `escapeOnclickArg(s)` (script.js, juste après `escapeAttr()`), dédiée
    exclusivement à un argument JS interpolé DANS un attribut `onclick="..."` délimité par des
    apostrophes (`onclick="fonction('id', 'cle', '${escapeOnclickArg(p.label)}')"`) : échappe
    l'apostrophe en séquence d'échappement JS (`\'`, backslash + apostrophe) plutôt qu'en entité
    HTML — un antislash n'a aucun sens spécial en HTML, il traverse le premier décodage intact, et
    forme ensuite une séquence d'échappement JS valide pour le second. Le backslash lui-même est
    échappé en premier (`\\`) pour rester correct si un libellé venait à en contenir un. Les autres
    caractères (`&`, `"`, `<`, `>`) restent échappés en entités HTML comme avant — eux ne sont
    jamais le délimiteur de la chaîne JS, donc les revoir décodés en leur caractère d'origine après
    le premier passage reste inoffensif pour le second.
  - `escapeAttr()` elle-même reste inchangée et CORRECTE : elle sert à de vrais attributs HTML
    (`title="..."`, `value="..."`, `aria-label="..."`) jamais réinterprétés comme du JS — seul le
    cas précis d'un argument JS DANS un `onclick` avait besoin d'un échappement différent. Les deux
    seuls points d'appel concernés (`.piece-suppr`/`.piece-reinit` dans `renderPiecesDossier()`,
    les mêmes que le correctif précédent) sont passés de `escapeAttr(p.label)` à
    `escapeOnclickArg(p.label)` ; tous les autres usages d'`escapeAttr()` dans le fichier (des
    attributs HTML ordinaires) restent inchangés à raison.
  - **Leçon, au-delà de celle déjà tirée sur les problèmes de déploiement** : quand un bug de
    rendu HTML/JS généré dynamiquement résiste à une relecture du code source (même vérifiée à
    plusieurs niveaux : source, sandbox, binaire, réseau), soupçonner un traitement IMPLICITE fait
    par le navigateur entre "ce que le code produit" et "ce que le moteur JS exécute réellement" —
    ici le décodage HTML d'un attribut avant son interprétation comme JS, un piège classique des
    gestionnaires d'événements inline (`onclick="..."`) qu'aucune des vérifications précédentes
    n'avait rejoué. Une simulation du décodage réel (quelques lignes de Node) aurait révélé le
    problème dès la première tentative de correctif.
  - `npm test` reste vert (134 tests, aucune fonction pure modifiée par ce chantier — vérifié en
    plus par une simulation Node ad hoc du décodage HTML+JS réel sur les deux libellés concernés et
    un libellé de contrôle sans apostrophe, voir ci-dessus).
- **Analyse juridique approfondie par IA locale (Ollama) + nouvel onglet "Analyse approfondie
  (IA)"**, demandé explicitement par l'étude ("lance l'installation du LLM local", "créer un
  nouvel outil d'import... comme si un notaire relisait l'acte pour trouver des incohérences").
  Décisions prises (l'étude ayant explicitement délégué les choix d'implémentation) :
  - **Ollama, pas une API cloud** : seule option compatible avec la confidentialité notariale déjà
    actée dans ce document (aucune donnée client vers un service extérieur) et avec la décision de
    longue date "rester en local, sans hébergement en ligne" — un LLM tournant sur le serveur de
    l'étude reste dans ce périmètre, contrairement à un appel à une API OpenAI/Anthropic/etc. Ne
    pouvait exister que sur `claude/serveur-intranet` (a besoin d'un backend pour parler à Ollama
    en HTTP) — `main`, sans backend, n'a pas cette fonctionnalité, mais partage le même
    `script.js` : les fonctions de cet onglet existent aussi dans le fichier sur `main`, simplement
    jamais appelées faute de lien/onglet correspondant dans son `index.html`.
  - **Modèle par défaut : `llama3.1:8b`**, choisi comme compromis raisonnable entre qualité
    d'analyse et vitesse sur un CPU de bureau sans GPU dédié (l'étude n'a pas précisé le matériel
    du futur serveur) — configurable sans toucher au code (`OLLAMA_MODEL`/`ollamaModel`, même
    schéma de résolution à 3 niveaux que le reste de `config.js`) si un modèle plus adapté se
    révèle nécessaire une fois testé en conditions réelles.
  - **`server/src/llm.js`** : client HTTP minimal vers l'API Ollama (`fetch` natif, aucune
    dépendance npm supplémentaire) — `verifierDisponibilite()` distingue "Ollama pas lancé" de
    "modèle pas encore téléchargé" (message actionnable différent dans les deux cas, voir
    l'interface), `generer()` utilise `format: 'json'` (contrainte de sortie propre à Ollama) et
    une température basse (0.1) — une analyse juridique doit rester factuelle et reproductible,
    pas créative. Timeout généreux (180s) : un modèle 7-8B sur CPU de bureau peut prendre du temps
    sur un acte long.
  - **`server/src/routes/analyseIa.js`** (`GET /api/analyse-ia/disponibilite`,
    `POST /api/analyse-ia`, montées derrière `middlewareAuth` comme le reste de `/api`) : le
    prompt (`construirePrompt()`) donne au modèle un rôle explicite de notaire relisant l'acte et
    ses annexes, avec une liste de points de vigilance concrets (cohérence des parties/prix/
    désignation du bien entre les documents, validité des diagnostics dans le temps, annexes
    mentionnées mais absentes, clauses contradictoires, signatures manquantes) et la consigne
    explicite de ne jamais inventer un fait absent du texte — un LLM local reste sujet aux
    hallucinations, cette consigne les réduit sans les éliminer. Chaque document est tronqué à
    `LIMITE_CARACTERES_PAR_DOCUMENT` (40 000 caractères) avant envoi — un acte de plusieurs
    dizaines de pages plus ses annexes dépasserait largement ce qu'un modèle 7-8B sur CPU peut
    traiter en un temps raisonnable ; l'interface signale la troncature plutôt que de laisser
    croire à une analyse complète. `normaliserConstats()` protège contre une sortie du modèle non
    conforme (JSON invalide → liste vide + message de diagnostic plutôt qu'un plantage ; gravité
    hors énumération → repli sur "info" ; constat sans titre → ignoré).
  - **Onglet "Analyse approfondie (IA)"** (sidebar, sous "Simulateur de provision") : dépose l'acte
    ET ses annexes séparément (plusieurs PDF distincts, comme reçus par l'étude — pas un unique PDF
    fusionné), avec un `<select>` par fichier (Acte principal / Annexe, deviné automatiquement pour
    le premier fichier dont le nom contient "compromis"/"promesse", toujours corrigible). Le texte
    de chaque PDF est extrait CÔTÉ CLIENT (réutilise `lireTextePdfVerification()`, déjà en place
    pour vérifier un dossier local — texte extractible + repli OCR sur les 3 premières pages) :
    seul ce texte est envoyé au serveur, jamais le PDF lui-même, et rien n'est enregistré (aucun
    dossier créé, cohérent avec le principe "outil de comparaison", pas "création de dossier de
    suivi" — distinct du wizard "Nouveau dossier" et de ses regex d'extraction de dates/champs).
    Bandeau de disponibilité (`verifierDisponibiliteAnalyseIa()`, interrogé à chaque ouverture de
    l'onglet) affiche tout de suite si Ollama n'est pas installé/lancé, plutôt que de laisser
    lancer une analyse de plusieurs minutes pour découvrir l'échec à la fin. Rapport
    (`renderRapportAnalyseIa()`) : un `.dot-label` par gravité (`dl-urgent`/critique,
    `dl-pret`/attention, `dl-neutre`/info — mêmes tokens de couleur que le reste de l'outil, aucune
    couleur inventée), titre, description, documents concernés.
  - **Disclaimer explicite à deux endroits** (petit badge à côté du titre, comme
    `.calc-warning-label` pour le simulateur de frais d'acte, + note complète en bas de page) :
    "Suggestions à vérifier" — un LLM peut se tromper, cette analyse est une aide à la relecture,
    jamais une validation juridique en soi. Cohérent avec le principe déjà établi pour le
    simulateur de frais d'acte (barème non audité) : ne jamais présenter un résultat automatique
    comme une certitude sans un signal visuel clair.
  - Tests : `server/test/analyse-ia.test.js` (11 tests — fonctions pures `construirePrompt`/
    `normaliserConstats`/`tronquerDocument`, et la route montée avec un FAUX serveur Ollama HTTP
    local plutôt qu'un vrai Ollama, absent de cet environnement de développement). Vérifié côté
    client par un script Node ad hoc (bac à sable, voir `tests/helpers/load-app.js`) : rendu HTML
    correctement échappé (testé avec un titre contenant `<img onerror=...>`), badges de gravité
    corrects, gestion des cas limites (aucun document exploitable, JSON invalide, document
    tronqué) — toutes les fonctions de mutation (liste de fichiers en mémoire) restent, comme
    ailleurs dans ce fichier, non unitairement testables (dépendent d'un état de premier niveau
    invisible depuis le contexte `vm` des tests). `npm test` reste vert aux deux endroits (134
    tests racine, 36 tests serveur dont les 11 nouveaux).
  - **Non vérifié en conditions réelles** : ni Ollama ni une vraie machine Windows ne sont
    disponibles dans cet environnement de développement — la qualité réelle des constats produits
    sur de vrais actes, et les temps de réponse sur le matériel du futur serveur, restent à
    confirmer par l'étude une fois Ollama installé au bureau (voir `server/README.md`, section
    "Analyse juridique par IA locale").
- **Le même modèle IA local sert aussi le wizard "Nouveau dossier"**, demandé juste après l'ajout
  de l'outil ci-dessus ("utilise aussi le LLM pour les analyses de nouveau dossier aussi") — non
  pas pour REMPLACER l'extraction par regex déjà en place (des dizaines de correctifs ciblés
  documentés dans ce fichier, ne pas jeter ce travail), mais pour la COMPLÉTER : un appel en
  arrière-plan, après `traiterTexte()` (inchangée, toujours le chemin principal et immédiat), qui
  ne remplit que les champs qu'elle n'a pas trouvés et ne propose des engagements du vendeur qu'en
  AJOUT, jamais en remplacement — même principe déjà appliqué partout ailleurs dans ce fichier
  (`detecterAdresseBien()`/`detecterEmailAcquereur()`/`detecterMontantPret()` : "n'écrase jamais
  une valeur déjà connue").
  - **`server/src/routes/extractionIa.js`** (`POST /api/extraction-ia`, même client `llm.js` que
    `analyseIa.js` mais un prompt et une forme de réponse dédiés — un seul document à faire parler,
    pas une comparaison croisée) : extrait `nomDossier`/`adresseBien`/`prixVente`/`datePret`/
    `dateActe`/`dateVentePrealable`/`engagementsVendeur`, chaque champ `null` si absent du texte
    (consigne explicite au modèle de ne jamais inventer). `normaliserExtraction()` valide chaque
    champ isolément (date au format AAAA-MM-JJ sinon rejetée, prix positif arrondi à l'entier
    sinon `null`, type d'engagement hors énumération replié sur "document") — un JSON invalide ou
    partiellement conforme du modèle ne fait jamais planter la route, juste renvoyer moins de
    champs exploitables.
  - **`enrichirImportAvecIa(texte, monImport)`** (script.js, appelée sans `await` juste après
    `traiterTexte(texteComplet)` dans `traiterFichierPdf()`, donc sans jamais retarder la suite de
    l'import — bascule d'étape du wizard, aperçu PDF...) : complète `#f-nom`/`#f-adresse-bien`/
    `#f-prix-vente`/les trois dates butoir UNIQUEMENT s'ils sont restés vides après la détection
    par regex, et ajoute les engagements suggérés par l'IA à `analyseJuridiqueActuelle.engagements`
    (marqués `source: 'ia'`, rendus avec un badge "Suggéré par l'IA" — voir `renderEngagement()`,
    déjà généralisée pour accepter n'importe quelle provenance d'engagement) après dédoublonnage
    contre les engagements déjà détectés par regex (`engagementDejaConnu()`, réutilise
    `similariteJaccard()`/`tokeniserApprentissage()`/`normaliserTexteApprentissage()` déjà en place
    pour l'apprentissage des corrections — un seuil bas et volontairement prudent, 0.2, car sans
    racinisation des mots comparés l'overlap réel entre une phrase extraite et sa reformulation par
    le modèle reste modeste même pour la même clause ; sous-détecter un doublon ne coûte qu'un
    clic sur la croix de suppression déjà existante, sur-détecter risquerait de faire disparaître
    silencieusement un engagement réellement distinct). Un toast résume ce qui a été complété
    ("IA locale : N champs et N engagement(s) du vendeur complétés... — à vérifier") — rien ne
    s'affiche si l'IA n'a rien apporté (Ollama indisponible, ou tous les champs déjà trouvés par
    les regex).
  - **`generationImportActuel`** (nouveau compteur, incrémenté à chaque nouvel import dans
    `traiterFichierPdf()` et à chaque `reinitialiserFormulaire()`) : l'appel au LLM local peut
    prendre de quelques secondes à plusieurs dizaines de secondes, largement le temps qu'un
    collaborateur importe un second PDF ou enregistre/réinitialise le formulaire avant que la
    réponse n'arrive — `enrichirImportAvecIa()` compare le numéro de génération capturé à son appel
    à sa valeur actuelle avant d'appliquer quoi que ce soit, et abandonne silencieusement si un
    autre import a eu lieu entretemps (jamais de champ rempli pour le mauvais dossier).
  - **N'existe QUE sur `claude/serveur-intranet`** (a besoin du backend pour parler à Ollama) —
    `main` garde le wizard inchangé, purement basé sur les regex, comme avant ce chantier.
  - Tests : `server/test/extraction-ia.test.js` (10 tests — fonctions pures `construirePrompt`/
    `normaliserExtraction`, et la route avec un faux serveur Ollama HTTP). Vérifié côté client par
    un script Node ad hoc (bac à sable) : remplissage correct des champs vides, non-écrasement
    d'une valeur déjà saisie, garde-fou de génération périmée confirmé en déclenchant un vrai
    `reinitialiserFormulaire()` entre deux appels, rendu de l'engagement suggéré avec son badge et
    son bouton de suppression fonctionnel, dédoublonnage vérifié sur un cas positif (même clause
    reformulée) et un cas négatif (sujets différents). `npm test` reste vert aux deux endroits
    (134 tests racine, 46 tests serveur dont les 10 nouveaux).
- **Ouverture au démarrage dans une fenêtre Chrome/Edge dédiée (sans onglets ni barre d'adresse),
  demandé par l'étude** : `ouvrirNavigateur()` (`server/src/index.js`) lançait jusqu'ici `start ""
  <url>` — le navigateur par défaut, dans un onglet normal. Même principe déjà confirmé
  fonctionnel pour la version 100% locale (`Ouvrir-en-fenetre.bat`, voir contrainte n°7 plus haut) :
  `chrome.exe --profile-directory="ClaireServeur" --app=<url>` (ou `msedge.exe` en repli).
  - **`--profile-directory` nommé, pas `--user-data-dir`** : seule combinaison déjà confirmée ouvrir
    une fenêtre autonome même quand Chrome tourne déjà par ailleurs (voir l'historique détaillé de
    ces essais, contrainte n°7) — un `--app` seul rouvrirait alors un simple onglet dans la fenêtre
    existante. Le profil dédié ("ClaireServeur", distinct de "RegistreEcheances" utilisé par la
    version locale — deux applications différentes) n'a ici **aucune conséquence sur les données** :
    contrairement à la version locale (`localStorage`, propre à chaque profil), tout est stocké
    côté serveur, donc le même registre reste visible quel que soit le profil Chrome utilisé pour
    l'ouvrir — pas de piège d'export/import à documenter comme pour `Ouvrir-en-fenetre.bat`.
  - `resoudreCheminNavigateurApp(env, existsSync)` (nouveau, `server/src/navigateurApp.js`) cherche
    Chrome puis Edge aux emplacements Windows usuels (`ProgramFiles`/`ProgramFiles(x86)`/
    `LocalAppData`) — fonction pure, extraite dans son propre module plutôt que directement dans
    `index.js` pour rester testable : `index.js` s'exécute immédiatement à l'import (appelle
    `demarrer()` en bas de fichier, comme requis pour rester le point d'entrée réel du `.exe`), donc
    l'importer depuis un test démarrerait un vrai serveur sur un vrai port. Repli sur `start ""
    <url>` (navigateur par défaut, onglet normal) si ni Chrome ni Edge n'est trouvé.
  - **Ne concerne que le poste qui héberge le serveur** (celui où `ouvrirNavigateur()` s'exécute au
    démarrage) : les autres postes du bureau continuent de rejoindre l'outil via l'adresse IP
    donnée, dans un onglet Chrome normal — comportement inchangé, aucune fenêtre applicative ne se
    lance chez eux.
  - Tests dans `server/test/navigateur-app.test.js` (6 tests — Chrome trouvé dans chaque
    emplacement, repli sur Edge, aucun des deux trouvé, priorité à Chrome si les deux existent).
    `npm test` (serveur) passe de 46 à 52 tests ; suite racine inchangée (134 tests, ce chantier ne
    touche que `server/`).
  - **Non vérifié sur un vrai poste Windows** (aucune machine Windows disponible dans cet
    environnement de développement) — même limite déjà documentée pour le reste du serveur : la
    syntaxe `--profile-directory`/`--app` est reprise à l'identique de celle déjà confirmée
    fonctionnelle pour `Ouvrir-en-fenetre.bat`, mais son comportement précis au démarrage
    automatique du serveur (pas depuis un `.bat` cliqué manuellement) reste à confirmer par l'étude.
- **Série de correctifs remontés après une matinée de test réel**, traités indépendamment :
  - **Indicateur de connexion au serveur dans la sidebar** (`.sidebar-statut-serveur`,
    `majStatutServeur()`) : `sondagePeriodique()` (sondage toutes les 7s) met à jour un badge
    `.dot-label` "Connecté"/"Hors ligne" — sans lui, un dossier créé par un collègue qui
    n'apparaissait jamais (serveur arrêté, câble débranché...) ne se voyait qu'indirectement. Ne
    change le DOM que si l'état a réellement changé (évite une écriture à chaque sondage). Le cas
    401 (session expirée, déjà géré par `fetchAvecAuth` — jeton effacé, écran de connexion
    réaffiché) n'affiche volontairement PAS "Hors ligne" par-dessus : ce n'est pas un problème
    réseau, `authToken` redevient `null` dans ce cas précis, utilisé comme signal pour distinguer
    les deux dans le `catch` de `sondagePeriodique()`.
  - **Bug corrigé : achat comptant affichait "Non renseigné" sur le tab "Obtention du prêt"**,
    comme si l'échéance avait été oubliée. `renderTab()` affiche désormais "Achat comptant — sans
    prêt" quand `d.sansPret` est vrai et qu'aucune date n'est renseignée — le crayon reste
    accessible (pas de tab masqué entièrement, contrairement à un premier essai) : si un prêt
    finit par exister malgré tout, saisir une date doit rester possible. **Bug latent corrigé au
    passage, trouvé en creusant ce point** : `validerEditionDate()` ne repassait jamais
    `d.sansPret` à `false` en saisissant une date de prêt — symétrique de `supprimerDateEcheance()`
    (qui le passe à `true` en vidant la date), cette dissymétrie aurait bloqué `sansPret` à `true`
    indéfiniment même après avoir renseigné une vraie date.
  - **Bouton "+ Ajouter un engagement du vendeur"**, indépendant de la sélection de texte dans le
    PDF (`gererSelectionPdf()`/barre flottante, déjà existante) : utile quand aucun PDF n'est
    chargé, ou pour un engagement qui n'apparaît pas littéralement dans l'acte (accord oral
    rapporté par le vendeur). Toujours visible dans l'étape "Analyse juridique" du wizard, y
    compris dans l'état vide (contrairement au reste de cette étape, masqué par
    `afficherAnalyseJuridique()` tant que rien n'est détecté) — placé en dehors du bloc que cette
    fonction masque/affiche, pour rester accessible même sans aucune détection automatique.
  - **Catégorie "Autres" ajoutée aux engagements du vendeur** (barre flottante de sélection PDF ET
    le nouveau bouton manuel ci-dessus) : les trois catégories existantes (Entretien/Travaux/
    Document, volontairement distinctes — voir leur historique plus haut) ne couvraient pas tout
    ce qu'un(e) collaborateur(rice) peut vouloir consigner en sélectionnant une clause. Couleur
    neutre (`--muted`/`--line-soft`, cohérent avec `.dl-neutre` ailleurs dans l'outil) plutôt
    qu'une couleur inventée.
  - **Indicateur "Analyse par le modèle IA local en cours…"** pendant l'appel à
    `/api/extraction-ia` (étape "Vérifier" du wizard, où l'auto-avance après import amène
    l'utilisateur pendant que l'appel tourne en arrière-plan) — jusqu'ici totalement silencieux
    jusqu'au toast final, ce qui pouvait laisser croire à un import sans effet sur un compromis
    long (Ollama peut prendre plusieurs dizaines de secondes). `afficherStatutEnrichissementIa()`
    est masqué au début de tout nouvel import et dans `reinitialiserFormulaire()` (sinon resterait
    affiché indéfiniment si l'utilisateur enregistre/réinitialise avant la fin de l'appel — le
    garde-fou `generationImportActuel` empêche déjà l'appel de modifier le MAUVAIS formulaire, mais
    ne masquait pas cet indicateur de son côté).
  - Vérifié par un script Node ad hoc (bac à sable) : `renderTab()` avec `sansPret` affiche bien
    "Achat comptant — sans prêt" (et "Non renseigné" sans ce drapeau, comportement inchangé pour
    tous les autres dossiers). `npm test` reste vert (134 tests, aucune fonction pure modifiée par
    ce lot — uniquement de l'affichage/état DOM, comme la plupart des correctifs de ce fichier).
- **Deux apprentissages supplémentaires, demandés dans la même série** : "permettre au système
  d'apprendre" quand un document mal rattaché est corrigé, et quand une clause est ajoutée
  manuellement dans "Nouveau dossier". Les deux questions posées à l'étude sur la portée exacte
  (exclusion locale à un dossier vs règle apprise généralisée ; apprentissage limité au type
  d'engagement vs "tout champ corrigé, de façon générique") ont reçu la réponse la plus large dans
  les deux cas — traité en conséquence, avec une limite explicite documentée ci-dessous plutôt que
  de prétendre couvrir plus que ce qui est réellement sûr à généraliser.
  - **Pièce mal rattachée → exclusion apprise, globale à toutes les pièces/tous les dossiers.**
    `reinitialiserStatutPieceStandard()` (bouton `.piece-reinit`, déjà en place) retrouve désormais,
    AVANT d'effacer le handle du fichier mal reconnu, son nom réel
    (`recupererHandle(CLE_HANDLE_PIECE(...))`, déjà mémorisé) et l'enregistre comme exclu pour cette
    pièce via `exclureNomPourPiece(cle, nomNormalise)` — ce nom (normalisé comme pour tout test de
    `motifNom`, voir `normaliserNomPourMotif`) ne sera alors plus jamais proposé pour CETTE pièce,
    sur AUCUN dossier, tant que l'exclusion n'est pas explicitement retirée (aucun panneau de
    gestion pour l'instant, voir "Ce qui reste ouvert"). `verifierDossierLocal()` teste
    `estNomExcluPourPiece(piece.cle, nomNormalise)` juste après `piece.motifNom.test(...)`, avant
    d'accepter une correspondance.
    - **Nouveau mécanisme de stockage, distinct de `correctionsApprises`** (le mécanisme Jaccard
      existant n'est pas adapté ici : un nom de fichier n'est pas une clause à comparer par
      similarité, c'est une correspondance exacte à empêcher de se reproduire) —
      `exclusionsMotifNom` (`{ [cle]: [nomNormalisé, ...] }`), persisté par
      `sauvegarderExclusionsMotifNom()`/`chargerExclusionsMotifNom()`, même schéma
      `window.storage`/`localStorage` de repli que le reste de l'apprentissage (nouvelle clé
      `exclusions-motif-nom`). Chargé au démarrage aux côtés de `chargerApprentissage()`.
    - Portée volontairement globale (pas seulement le dossier where l'erreur a été repérée) :
      l'étude a explicitement choisi cette option plutôt que la version plus prudente proposée par
      défaut — un même document mal nommé/mal classé par erreur (ex. un courrier de mairie qui
      mentionne l'urbanisme en passant, nommé de façon ambiguë) a de bonnes chances de se
      représenter à l'identique sur un autre dossier du même type d'affaire.
    - Vérifié par un script Node ad hoc (bac à sable) : exclusion enregistrée pour une pièce précise
      n'affecte ni un autre nom de fichier ni une autre pièce ; normalisation cohérente entre
      l'enregistrement et le test (underscores/espaces).
  - **Clause ajoutée manuellement (PDF sélectionné ou formulaire libre) → réutilise et généralise le
    mécanisme d'apprentissage déjà en place pour les dates** (`correctionsApprises`/
    `memoriserCorrection()`/`trouverCorrectionApprise()`, jusqu'ici réservé à la classification
    pret/acte/ventebien/autre d'une clause de délai). Les deux fonctions gagnent un paramètre
    `categorie` (`'date'` par défaut, valeur historique — une entrée mémorisée avant ce chantier
    n'a pas ce champ et reste traitée comme `'date'`, sans migration nécessaire ; `'engagement'`
    pour la nouvelle classification entretien/travaux/document/autre) : les deux espaces sont
    filtrés séparément (`trouverCorrectionApprise(contexte, categorie)` ignore les entrées d'une
    autre catégorie), pour qu'une clause de délai de prêt et une clause d'engagement d'entretien
    partageant par hasard du vocabulaire ne se substituent jamais l'une à l'autre.
    - `ajouterEngagementManuel(type)` (sélection de texte dans le PDF) et
      `ajouterEngagementDepuisFormulaire()` (bouton "+ Ajouter un engagement du vendeur", voir plus
      haut) appellent désormais `memoriserCorrection(phrase, type, null, 'engagement')` — une
      clause ajoutée à la main est, par construction, une clause que la détection automatique a
      manquée ou n'a pas su catégoriser.
    - `extraireEngagementsVendeur()` : la branche qui abandonnait jusqu'ici toute phrase passant
      l'ancrage strict ("le vendeur/promettant s'engage/s'oblige/devra/remettra...") mais ne
      correspondant à AUCUN des trois motifs d'objet (`OBJET_ENTRETIEN_RE`/`OBJET_TRAVAUX_RE`/
      `OBJET_DOCUMENT_RE`) consulte maintenant `trouverCorrectionApprise(phrase, 'engagement')`
      avant d'abandonner — une correction apprise fournit alors le type. **Reste borné à l'ancrage
      déjà en place** : ne s'applique jamais à une phrase qui n'aurait pas d'abord passé ce motif
      strict, donc aucun risque d'élargir la détection à des phrases arbitraires du document — la
      généralisation ne change QUE le sort d'une phrase déjà anchée mais jusque-là abandonnée faute
      de mot-clé d'objet reconnu.
    - Vérifié par un script Node ad hoc (bac à sable) : une phrase inventée (mot-clé fictif) reste
      ignorée sans apprentissage, puis correctement classée après `memoriserCorrection(...,
      'engagement')` sur une formulation proche ; une recherche en catégorie `'date'` sur le même
      contexte reste `null` (les deux espaces ne se mélangent pas).
  - **Portée explicitement PAS étendue aux champs texte libre/numériques** (nom du dossier,
    adresse, prix, montants) malgré le choix de l'étude pour l'option la plus généralisée sur la
    question posée : contrairement à une classification (un mot parmi un nombre fini de catégories,
    où "rejouer" une correction apprise a un sens sûr), corriger une valeur de ce type n'a pas de
    mécanisme de réapplication automatique sûr — deux adresses ou deux noms de compromis
    différents peuvent se ressembler par hasard sans qu'aucune inférence n'en découle. Étendre
    l'apprentissage à ces champs demanderait un exemple concret de ce que l'étude attend d'un tel
    mécanisme (une suggestion affichée ? un simple journal des corrections fréquentes ?) plutôt
    qu'une generalisation mécanique du même code — à reprendre sur demande explicite avec ce
    besoin précisé, cohérent avec la prudence déjà appliquée ailleurs dans ce fichier
    (`detecterNomDossier()`, jamais retouchée sans exemple réel reproduisant un échec).
  - `npm test` reste vert (134 tests, aucune fonction pure modifiée — `trouverCorrectionApprise`/
    `memoriserCorrection` restent des fonctions pures mais non couvertes par la suite actuelle,
    même limite déjà notée pour `normaliserPourRecherche()` ; `estNomExcluPourPiece`/
    `exclureNomPourPiece` de même, vérifiées par simulation Node ad hoc plutôt que par un test
    committé — envisager de les ajouter à `tests/divers.test.js` si le temps le permet).
- **Lot de 6 demandes indépendantes de l'étude, traitées ensemble** :
  - **Couleurs de catégorie acte/vente préalable échangées** (`--acte`/`--ventebien` et leurs
    `-bg`, clair et sombre, `style.css`) : l'acte passe au vert/teal (`#1CA39B` clair, `#4FC2B8`
    sombre — l'ancienne valeur de `--ventebien`) et la vente préalable au bleu (`#2472B0` clair,
    `#6FAEDB` sombre — l'ancienne valeur de `--acte`). Un simple échange de valeurs entre les deux
    tokens (le nom du token garde son sens, seule sa couleur change) : tout l'outil s'appuie déjà
    sur ces deux seuls tokens pour cette paire de catégories (`.dot-label.dl-acte`/`.dl-ventebien`,
    tabs, badges...), rien à retoucher ailleurs. **Trouvé et corrigé au passage** : `imprimerFiche()`
    dupliquait ces deux couleurs en dur dans son objet `TEINTES` (contrainte n°6, Word ignore les
    classes CSS externes — un `<table>` avec des couleurs inline) — sans ce correctif, la fiche
    imprimée aurait continué d'afficher l'ancien code couleur, en désaccord avec l'écran.
  - **L'extraction par IA locale du wizard doit recopier les clauses mot pour mot, jamais les
    résumer/interpréter.** Diagnostic : ni un bug de code ni un problème de `normaliserExtraction()`
    (qui transmet déjà tel quel ce que le modèle renvoie) — le prompt lui-même
    (`construirePrompt()`, `server/src/routes/extractionIa.js`) demandait "une courte description"
    d'un engagement, ce qui invite naturellement un LLM à paraphraser. Reformulé pour exiger
    explicitement une citation exacte ("recopiée mot pour mot... N'inclus jamais une phrase que tu
    as toi-même composée ou paraphrasée : si tu ne peux pas citer un passage exact du texte fourni,
    n'ajoute pas cet engagement"), et le nom du champ JSON (`"description"`) volontairement
    conservé tel quel (juste son contenu attendu change) pour ne pas devoir retoucher
    `normaliserExtraction()`/`server/test/extraction-ia.test.js` sans nécessité. Un correctif de
    formulation du prompt, pas de code de traitement — cohérent avec le principe déjà établi
    ailleurs dans ce document (consigne explicite anti-hallucination) plutôt qu'une nouvelle
    validation côté serveur, qui ne peut de toute façon pas vérifier qu'une phrase est bien un
    copier-coller du texte source.
  - **Bouton "+ Ajouter une obligation du vendeur" sur une fiche DÉJÀ ENREGISTRÉE** (tiroir), en
    plus des deux moyens déjà existants (sélection de texte dans le PDF pendant l'import, bouton
    équivalent du wizard) qui ne fonctionnaient jamais sur un dossier rouvert plus tard — un accord
    oral rapporté après coup, ou une clause repérée en relisant l'acte à tête reposée, doivent
    pouvoir être consignés sans rouvrir le compromis. `renderAjoutEngagement(d)` /
    `afficherFormAjoutEngagementDossier()` / `masquerFormAjoutEngagementDossier()` /
    `ajouterEngagementDossierApresCoup(dossierId)` reprennent exactement le patron déjà en place
    pour `renderAjoutEcheance`/`renderAjoutPiece` (bouton toujours visible en dehors du bloc
    `<details>` d'analyse juridique, basculé par un simple booléen `ajoutEngagementOuvert`, remis à
    `false` dans `ouvrirDossierDrawer()`/`fermerDossierDrawer()`). Pousse dans
    `d.analyseJuridique.engagements` (initialisé au passage si absent — un dossier créé
    manuellement, ou antérieur à ce champ, n'en a pas forcément), journalise dans l'historique, et
    alimente l'apprentissage (`memoriserCorrection(phrase, type, null, 'engagement')`) comme tout
    autre ajout manuel d'engagement. **Piège de collision d'id évité en écrivant le formulaire** :
    le formulaire équivalent du wizard (`index.html`, étape "Analyse juridique") est TOUJOURS
    présent dans le DOM (masqué par `style.display`, jamais retiré) avec les ids
    `nouvel-engagement-type`/`nouvel-engagement-texte` — réutiliser ces mêmes ids pour le
    formulaire du tiroir aurait fait retomber `getElementById()` sur le MAUVAIS formulaire (celui
    du wizard, apparaissant en premier dans le document) dès que les deux existent en même temps
    dans la page. Le formulaire du tiroir utilise des ids distincts
    (`nouvelle-obligation-dossier-type`/`nouvelle-obligation-dossier-texte`).
  - **Éditer un engagement du vendeur déjà présent (import OU fiche enregistrée), pas seulement
    le supprimer/le recréer** — demandé pour l'ajout par sélection de texte dans le PDF ("l'option
    de surligner"), et appliqué par cohérence à tout engagement (déjà en place pour la suppression
    depuis le correctif précédent, "Suppression d'un engagement/document possible partout"). Un
    seul engagement en édition à la fois (`engagementEnEdition = { dossierId, index }`, `dossierId`
    null pendant l'import) — `renderEngagement()` bascule vers un formulaire inline (`<select>`
    type + `<textarea>` texte, boutons Valider/Annuler) à la place de la ligne de lecture normale
    quand elle correspond à l'entrée en édition. `activerEditionEngagement()` /
    `annulerEditionEngagement()` / `validerEditionEngagement()` reprennent la même distinction
    import/fiche que `supprimerEngagementManuel()`/`supprimerEngagementDossier()` (agit sur
    `analyseJuridiqueActuelle.engagements` ou sur `d.analyseJuridique.engagements`, avec
    historique + `sauvegarder(d)` uniquement pour une fiche enregistrée). Alimente aussi
    l'apprentissage (`memoriserCorrection(phrase, type, null, 'engagement')`) : corriger un
    engagement est un signal aussi utile qu'un ajout pour reconnaître une formulation proche au
    prochain import.
  - **Colonnes du tableau Suivi réordonnées : "Offre de prêt" avant "Prochaine échéance"**
    (`<thead>` et `renderLigneTableau()`, un simple échange des deux `<th>`/`<td>` correspondants,
    ordre de rendu et de lecture identiques). Demande initialement formulée de façon ambiguë
    ("changer dans les colonnes... prochaine étape et offre de prêt") — clarifiée avec l'étude
    (renommer les en-têtes ? changer leur contenu ? les réordonner ? les fusionner ?) avant
    d'implémenter : elle a choisi "changer l'ordre des colonnes", plutôt que de deviner et risquer
    un aller-retour supplémentaire sur une demande à choix multiples sans réponse évidente.
  - **Badge "Alpha" redescendu sous le logo, remplacé en haut à droite de la sidebar par
    l'indicateur de connexion au serveur.** Avant ce correctif, `.sidebar-alpha-badge` occupait ce
    coin (position absolue, `.sidebar` déjà `position: sticky` sert de conteneur de positionnement
    sans `position: relative` supplémentaire) et `.sidebar-statut-serveur` (voir son historique
    plus haut) vivait plus bas dans le flux normal, sous la tagline. Les deux échangent leurs
    traitements CSS : `.sidebar-statut-serveur` passe en absolu au même emplacement (`top: 14px;
    right: 14px`, police du `.dot-label` resserrée à 11px pour rester compacte dans ce coin) ;
    `.sidebar-alpha-badge` repasse en flux normal, juste sous `.sidebar-brand` (avant la tagline),
    en plus petit (9px, padding réduit) — un simple label discret plutôt qu'un badge qui doit
    attirer le regard comme l'état de connexion. `majStatutServeur()` (script.js) n'a pas eu besoin
    d'être modifiée : elle cible déjà `#statut-serveur-badge` par id, indépendant de la position de
    son conteneur parent.
  - Vérifié : `node -c script.js`, `npm test` (134 tests racine, 52 tests serveur, tous verts —
    aucune fonction pure modifiée par ce lot). Rendu des nouvelles fonctions d'ajout confirmé par un
    script Node ad hoc (bac à sable, `tests/helpers/load-app.js`) : bouton fermé, formulaire ouvert
    avec les bons ids, absence de collision avec les ids du formulaire équivalent du wizard.
- **Refonte en profondeur de la création automatique d'un dossier à partir d'un PDF (phase 1)**,
  demandée par l'étude en deux longues specs successives (l'une sur le type d'acte/les rôles/les
  statuts par champ, l'autre — « MODULE APPROFONDI » — sur les dates, les notaires et l'adresse du
  bien). Principe directeur qu'elle a posé : « ne construis PAS un système qui cherche simplement
  des mots ». Chantier mené en 8 commits successifs, chacun testé et vert avant le suivant.
  **Principe d'architecture, à ne pas perdre de vue** : on EMPILE, on ne réécrit pas.
  `traiterTexte()` (regex → DOM) reste le chemin principal, immédiat, éprouvé sur de vrais actes et
  seul disponible sur `main` ; tout ce qui suit est une couche posée par-dessus, qui se contente
  d'un objet supplémentaire quand elle ne peut rien apporter.
  - **Type d'acte AVANT les rôles** (`detecterTypeActe`/`ROLES_PAR_TYPE_ACTE`/`detecterParties`) :
    `RE_ROLE_VENDEUR` faisait jusqu'ici l'équation `promettant = vendeur` sans condition — vrai
    pour une promesse de VENTE, faux pour une promesse d'ACHAT, où le promettant s'engage à
    acheter. L'inversion est désormais pilotée par une table indexée sur le type d'acte, et testée
    explicitement (`tests/parties.test.js`), comme la spec l'exigeait. Un type non tranché reste
    `INCONNU` et reproduit le mapping historique (aucune régression des tests `detecterNomDossier`
    existants), avec une alerte de cohérence quand le vocabulaire promettant/bénéficiaire apparaît
    sans que le type soit établi — précisément la situation où l'inversion passerait inaperçue.
    `detecterNomDossier()` devient un simple habillage de `detecterParties()`.
    - **Bug de fond corrigé au passage, très probablement le « les noms de dossier ne vont pas »
      resté ouvert faute d'exemple** : `estStyleLabelEntreGuillemets()` ne reconnaissait pas
      `L'ACQUÉREUR :` comme une étiquette (l'apostrophe précédée d'une lettre n'était pas traitée
      comme un guillemet ouvrant), la fonction retombait sur une recherche en avant et ramenait le
      nom du VENDEUR des deux côtés.
  - **Dates classées par fonction juridique** (`TYPES_DATE`, `construireDatesMetier`) plutôt que
    « la première/la dernière date trouvée », interdit par la spec. Chaque date porte sa méthode :
    `EXPLICIT` (lue telle quelle) ou `CALCULATED` (déduite d'un délai), et **une date explicite
    n'est JAMAIS remplacée par une date calculée** — la calculée est conservée à part
    (`calculAlternatif`) et une alerte signale l'écart au-delà de 5 jours. Nouveau socle de calcul
    déterministe : `ajouterMois()` (quantième à quantième, borné au dernier jour du mois, art. 641
    CPC) à côté de `addDays()`, `calculerDateEcheance()`, et `POINTS_DEPART_CONNUS` où seule la
    signature est marquée `calculable` — un délai compté depuis une notification ou la purge d'un
    droit de préemption n'a pas d'ancre connue à l'import, la date resterait une invention.
    `detecterDelais()` couvre aussi les durées en toutes lettres (« trois mois ») et en mois, que
    l'ancien détecteur ignorait entièrement.
  - **Notaires détectés, et règle métier centralisée** (`detecterNotaires`, `determinerNotaires`,
    `IDENTITE_ETUDE`, `REGLES_NOTAIRE_INSTRUMENTAIRE`) — le rôle de l'étude sur un dossier était
    jusqu'ici 100 % manuel. Ordre de priorité imposé par la spec : mention explicite dans l'acte >
    règle géographique > rien (`NEEDS_REVIEW`, jamais un choix arbitraire). La règle « bien dans le
    41 + notaire du vendeur dans le 41/45/37 → c'est lui qui reçoit l'acte » est déclarée dans UN
    SEUL tableau, modifiable sans toucher au code, et un test le vérifie explicitement (la spec
    interdisait de la disperser). L'étude est reconnue sous ses deux graphies (GOSSART/GOSSARD) ;
    `#f-role-notaire` n'est pré-rempli que sur une déduction CONFIRMED — ce sélecteur masque la
    checklist des pièces quand il vaut « participant », on ne bascule jamais dessus sur une
    supposition.
  - **Adresse du bien structurée** (`parserAdresse`, `detecterAdresseBienStructuree`,
    `TYPES_VOIE`, `departementDepuisCodePostal`) : composants séparés dans un ordre libre, lieu-dit
    jamais transformé en voie, numéro facultatif. Surtout, elle est **distinguée de celle des
    parties et de celle des notaires** — une capture précédée de « demeurant » est écartée d'office,
    la section DÉSIGNATION est cherchée en priorité. Vérifié sur un acte portant quatre adresses
    différentes (`tests/extraction.test.js`) : c'est le département de l'adresse du BIEN qui
    déclenche ensuite la règle notaire, se tromper d'adresse se propagerait jusqu'au rôle de
    l'étude. Cadastre relevé au passage.
  - **Objet d'extraction unifié** (`construireExtractionRegex`) : chaque donnée porte sa valeur,
    son statut (`CONFIRMED` / `NEEDS_REVIEW` / `NOT_FOUND`), sa méthode, son origine, sa source
    (page + extrait) et ses candidats concurrents. `controlerCoherence()` contrôle l'ensemble AVANT
    création du dossier (réitération = signature, prêt après l'acte, date écrite contredite par un
    délai, adresse incomplète, notaires identiques, instrumentaire non tranché, vocabulaire de
    promesse sans type d'acte établi).
  - **Panneau « Ce que l'outil a compris »** à l'étape « Vérifier » (`#panneau-revision`) et
    rappel des alertes à l'étape « Finaliser » (`#alertes-finalisation`) — emplacements choisis
    avec l'étude. `appliquerExtractionAuFormulaire()` n'écrit dans un champ que si sa valeur est
    encore celle que NOUS y avions mise (`valeursAppliquees`) : un champ corrigé à la main n'est
    jamais écrasé, y compris par une réponse IA qui arrive une minute plus tard.
    `recalculerExtractionRegex()` est le point d'entrée UNIQUE du recalcul, branché sur les trois
    endroits qui refont déjà la détection de dates (fin de `traiterTexte`, `corrigerDateCompromis`,
    et les deux branches de repli OCR/métadonnées) — en oublier un désynchroniserait le panneau du
    formulaire.
  - **Trace conservée sur le dossier** (`instantaneExtraction`) : `d.typeActe`, `d.parties`,
    `d.notaires`, `d.bien`, `d.extraction`, tous ADDITIFS (les champs plats sont alimentés à
    l'identique, le blob JSON côté serveur ne demande aucune migration). Volontairement maigre :
    les extraits cités et les candidats ne sont PAS recopiés (ils n'ont d'intérêt que PDF ouvert à
    côté, et le dossier est stocké en clair). Affichée dans un `<details>` replié sur la fiche.
    `normaliserExtractionImportee()` assainit tout ça à l'import d'une sauvegarde.
    `diffCorrectionsExtraction()` + journal `corrections-extraction` (localStorage, plafond 500)
    enregistrent ce que l'étude corrige à la main — **pour mesurer plus tard où l'extraction se
    trompe, jamais pour réentraîner automatiquement quoi que ce soit**, la spec l'interdit
    explicitement.
  - **Passe IA en trois lots** (`parties`/`bien`/`dates`), côté serveur
    (`server/src/extraction/{extraits,prompts,normaliser}.js`, route `POST /api/extraction-ia` avec
    un paramètre `lot` obligatoire) et côté client (`lancerExtractionIa` + `fusionnerExtractionIa`,
    qui remplacent `enrichirImportAvecIa`). Voir `server/README.md` pour le détail des contextes
    envoyés et le temps de réponse attendu. Trois décisions structurantes :
    - **La vérification des extraits remplace la « confiance » du modèle.** Un llama 8B renvoie
      volontiers `confidence: 0.95` sur une valeur qu'il vient d'inventer — ce score n'est calibré
      sur rien. Le serveur vérifie donc que la phrase citée existe LITTÉRALEMENT dans le PDF
      (`localiserExtrait`, pendant de la fonction client) : trouvée → CONFIRMED + page affichée,
      introuvable → NEEDS_REVIEW.
    - **`genererJson(prompt, valider)`** (`server/src/llm.js`) : `format: 'json'` d'Ollama garantit
      la syntaxe, jamais le schéma. Une réponse hors schéma déclenche UNE relance avec l'erreur en
      clair ajoutée au prompt, puis abandon — chaque tentative coûte des dizaines de secondes sur
      CPU et un modèle qui se trompe deux fois ne se corrigera pas à la troisième. `generer()`
      reste inchangée pour `analyseIa.js`.
    - **Trois règles de fusion**, les mêmes pour toute donnée : regex muettes → valeur du modèle
      avec le statut de son extrait ; accord → CONFIRMED (origine `regex+ia`) ; désaccord → la
      valeur des regex est GARDÉE, le statut passe NEEDS_REVIEW et celle du modèle reste en
      candidat visible. Jamais de choix silencieux entre les deux.
  - **Tests** : suite racine passée de 134 à 226 (`adresse`, `dates-metier`, `extraits`, `parties`,
    `notaires`, `extraction`, `enregistrement`, `fusion`), suite serveur de 52 à 67 — dont le faux
    Ollama factorisé (`server/test/helpers/faux-ollama.js`, avec file de réponses et compteur
    d'appels, sans lequel on ne saurait pas distinguer une relance réussie d'une première réponse
    déjà valide). **Rappel du harnais** : `tests/helpers/load-app.js` ne voit que les `function` et
    les `var` de premier niveau — toute configuration destinée à être testée doit être déclarée en
    `var`, et deux tableaux venant de deux realms `vm` différents font échouer `assert.deepEqual`
    (comparer des chaînes jointes à la place).
  - **Décisions prises avec l'étude avant de commencer** (ne pas les rouvrir sans qu'elle le
    redemande) : périmètre limité à la phase 1 ; personnes réduites aux noms + qualité + rôle +
    représentant, **pas d'état civil complet** stocké ; identité de l'étude = Sophie GOSSART/
    GOSSARD ; pré-remplissage du sélecteur de rôle uniquement sur CONFIRMED ; panneau à l'étape 2
    avec rappel des alertes à l'étape 4 ; vocabulaire des dates (`SIGNATURE_AVANT_CONTRAT` = la
    signature du compromis/de la promesse, `REITERATION_ACTE` = le champ « Signature de l'acte »).
  - **Non vérifié en conditions réelles** : ni Ollama ni pdf.js ne sont disponibles dans cet
    environnement de développement (CDN bloqués par le proxy réseau, modèle non installé) — la
    qualité réelle des lots sur de vrais actes, les temps de réponse sur le matériel du poste
    serveur et le taux de NEEDS_REVIEW restent à confirmer par l'étude. Tout le reste est couvert
    par les tests et par des scripts de bac à sable (faux `fetch`, faux Ollama).
  - **Phases 2 et 3, non engagées** : cadastre complet (plusieurs parcelles, contenances), prix
    contradictoires entre plusieurs clauses, personnes morales détaillées (SIREN, siège) ; puis
    exploitation du journal `corrections-extraction` (un écran qui montrerait où l'extraction se
    trompe le plus) et extraction ciblée itérative (re-interroger le modèle sur un seul champ resté
    NEEDS_REVIEW, avec une fenêtre plus large).

- **Série de 12 demandes remontées par l'étude après une semaine d'usage réel** (« Quelques bug
  détecter depuis lundi »), traitée par lots successifs, chacun testé et commité séparément. Deux
  consignes générales posées avec la demande : garder à chaque fois la charte graphique de l'app,
  et poser les questions de cadrage avant d'implémenter plutôt que de deviner. Les arbitrages
  obtenus ainsi sont notés au fil des lots ci-dessous.
  - **Lot 1 — retouches d'affichage** : champs de recherche du Suivi et du Tableau de bord aux
    mêmes coins arrondis (8px) ; espace vide supprimé au-dessus de la croix de fermeture du tiroir
    (`.drawer-panneau` perd son padding haut, `.drawer-barre` le porte) ; **page « Nouveau dossier »
    corrigée sur téléphone** — nouveau `@media (max-width: 900px)` qui remet l'aperçu/le descriptif
    (`.pdf-viewer`) SOUS le bloc d'import (`order: 0`, annulant le `order: -1` du `@media 1100px`
    qui le faisait passer devant) et donne à chacun toute la largeur, avec une dropzone compactée.
    Choix explicite de l'étude entre les deux ordres possibles : « import en haut, descriptif en
    dessous — mais compacté », et **uniquement sur mobile** (desktop inchangé). Trouvé en
    vérifiant la capture d'écran, sans avoir été signalé : les 4 étapes du wizard débordaient de
    l'écran — chaque libellé est encapsulé (`.wizard-step-num`/`.wizard-step-libelle`) et, sous
    640px, seul le libellé de l'étape active reste affiché.
  - **Lot 2 — vue « Semaines » du Suivi** (`definirVueSuivi('tableau'|'semaines')`, bascule
    `.vue-bascule` dans la barre d'outils) : les mêmes dossiers regroupés par semaine d'échéance,
    demandé à partir d'un artefact CRM montré par l'étude. Choix tranché avec elle : **un mode de
    l'onglet Suivi** (pas un nouvel onglet), et **une ligne par ÉCHÉANCE** (pas par dossier) — un
    dossier figure donc sous chaque semaine où il a quelque chose à traiter, ce qui est bien la
    charge de travail de la semaine qu'on cherche à lire. `debutSemaine(iso)` (lundi ISO, dimanche
    ramené à 7 — le piège classique de `getDay()` qui vaut 0), `toutesEcheances(d)` (exclut le prêt
    dès que l'offre est reçue, comme `prochaineEcheanceDetail`), `grouperEcheancesParSemaine(liste,
    aujourdHui)` (groupe « En retard » en tête, `SEMAINES_AFFICHEES` semaines nommées, puis un seul
    groupe « Plus tard »), `libelleSemaine`. La date du jour est toujours injectée en paramètre :
    les fonctions restent pures et testables (`tests/semaines.test.js`, 13 tests). Tri « Statut »
    ajouté au menu existant (`ORDRE_STATUT`, du plus bloquant au terminé).
  - **Lot 3 — onglet « Prorata & répartitions »** (`#onglet-prorata`, lien de sidebar dédié) :
    répartit entre vendeur et acquéreur une somme déjà appelée pour une période que la vente coupe
    en deux — taxe foncière annuelle, charges de copropriété au trimestre ou au mois, loyer mensuel.
    **Convention imposée par l'étude, à ne pas changer sans nouvelle demande** : jours RÉELS (365,
    366 une année bissextile — jamais de mois forfaitaire de 30 jours), et **jour de l'acte à la
    charge de l'ACQUÉREUR**. `joursEntre(debut, fin)` compte en UTC (une différence entre dates
    locales n'est pas un multiple exact de 86 400 000 ms aux bascules heure d'été/hiver, et le
    résultat perdait un jour) ; `calculerProrata()` arrondit la part de l'acquéreur puis donne au
    vendeur le **complément**, jamais un second arrondi indépendant — deux arrondis séparés peuvent
    faire perdre ou gagner un centime sur une somme réclamée à un client. Un acte hors de la période
    ne rend rien (message explicite) plutôt que 0 % ou 100 %, qui n'auraient aucun sens ici.
    `bornesPeriodeProrata()` cale automatiquement les bornes sur l'année/le trimestre/le mois de la
    date saisie, le dernier jour étant calculé en reculant d'un jour depuis le 1er du mois suivant
    (seule façon sûre de ne pas se tromper sur un 28/29 février). Nouveau `formaterPrixCentimes()`
    à côté de `formaterPrix()` (laissée intacte, sans décimale, pour le prix de vente et l'apport).
    Tests : `tests/prorata.test.js` (15 tests).
  - **Lot 4 — avant-contrat rattaché et documents identifiés rétroactifs** :
    - **Bug corrigé : « Ouvrir le compromis » ramenait parfois le mauvais avant-contrat.** Cause
      confirmée par l'étude : `ouvrirCompromisTrouve()` cherchait les seuls mots « compromis » puis
      « promesse » dans les noms de fichiers du dossier local — or l'avant-contrat de la VENTE
      PRÉALABLE de l'acquéreur est rangé dans le même dossier et porte lui aussi ces mots.
      `compromisNomFichierImporte` mémorise désormais le nom EXACT du PDF déposé dans
      `traiterFichierPdf()` (jamais le PDF lui-même — voir la décision de ne rien conserver), il est
      enregistré sur le dossier (`d.compromisNomFichier`) par `ajouterDossier()` et cherché en
      premier ; la recherche floue ne sert plus que de repli pour un dossier saisi entièrement à la
      main ou créé avant cette évolution, et **le signale alors par un toast** plutôt que d'ouvrir un
      document au hasard sans prévenir. L'infobulle du bouton nomme le fichier attendu, pour repérer
      un mauvais rattachement sans même cliquer. Choix retenu avec l'étude : mémoriser le nom du
      fichier, **pas** stocker le PDF sur le serveur. `chercherFichierParNom()` normalise maintenant
      aussi le texte cherché (`normaliserNomPourMotif`) — sans ça, un nom de fichier exact contenant
      des underscores ne matchait jamais, l'entrée du dossier ayant les siens déjà remplacés.
    - **Tous les documents de « Documents et pièces identifiés » sont désormais recherchés dans le
      dossier local**, plus seulement les trois entretiens (chaudière, PAC, ramonage) :
      `cleChecklist` est porté par TOUTES les entrées de `DOCUMENTS_VENDEUR_CONNUS`, et
      `PIECES_ENGAGEMENTS_AUTO` passe de 3 à 19 pièces avec leur `motifNom` (premier jet écrit à
      partir du seul intitulé, comme les `PIECES_*` en leur temps — à resserrer dès qu'un vrai
      dossier fait remonter un problème). Deux clés pointent volontairement vers une pièce standard
      existante (assainissement) : `checklistPieces()` dédoublonne et la pièce standard, plus
      précise, l'emporte.
    - **Rétroactif sur les dossiers déjà créés**, demandé explicitement : `checklistPieces()` ne se
      contente plus de `d.piecesEngagementsDetectees` (figé à la création) — elle recalcule aussi les
      clés depuis `d.analyseJuridique.documents`, lui bien conservé sur le dossier
      (`clesChecklistDepuisDocuments()`, qui retrouve la clé par le libellé quand le document n'en
      porte pas, cas de tous les dossiers antérieurs). Aucun dossier à recréer.
    - **Bug latent corrigé au passage** : `normaliserDossierImporte()` filtrait
      `analyseJuridique.documents` sur `typeof x === 'string'`, alors que `detecterDocumentsAFournir()`
      produit des objets `{label, cat, cleChecklist}` depuis longtemps — importer une sauvegarde JSON
      vidait donc silencieusement la liste des documents identifiés (et aurait annulé la
      rétroactivité ci-dessus). Les deux formes sont désormais acceptées, comme partout ailleurs.
  - **Lot 5 — reconnaissance de l'offre de prêt par le titre, et garanties du prêt** :
    - **Troisième méthode de reconnaissance de ce document**, après le contenu intégral (abandonné :
      polices embarquées illisibles, autres documents mentionnant l'offre en passant) puis le seul
      nom de fichier (abandonné à son tour, l'étude signalant « trop d'erreur » — un nom de fichier
      est saisi à la main et ne dit rien du contenu réel). Trois filtres cumulés, du moins cher au
      plus cher, tous demandés explicitement par l'étude : **nombre de pages**
      (`MIN_PAGES_OFFRE_PRET`, 6 — « une offre fait au minimum 10 pages », seuil placé volontairement
      sous les 10 annoncées, c'est un filtre contre les courriers d'une ou deux pages, pas un rejet
      d'une offre courte) ; **titre de la page de garde** et lui seul (`titrePagePdf()` remet le
      texte de la page 1 à plat et n'en garde que le haut — un acte qui PARLE de l'offre de prêt
      n'a pas ce titre en tête de sa première page) ; **confirmation par le modèle IA local**
      (nouvelle route `POST /api/offre-pret/confirmer`, `server/src/routes/offrePret.js` — le
      modèle ne voit QUE la page de garde, jamais le document entier, ce qui garde l'appel court
      donc rapide sur le CPU d'un poste de bureau).
    - **Nouveau statut `aconfirmer`**, distinct de `recue` et de `manquante` : choix explicite de
      l'étude pour le cas où le modèle local est indisponible (non installé, serveur injoignable).
      Un document trouvé mais non confirmé n'est ni reçu (personne ne l'a validé) ni introuvable
      (il est là, il suffit de l'ouvrir) — la fiche propose donc « À confirmer — ouvrir », qui ouvre
      directement le fichier retenu. La route répond **503** dans ce cas, jamais `false` : confondre
      « le modèle dit non » et « le modèle n'a pas pu répondre » ferait disparaître un document
      pourtant trouvé, c'est le point le plus testé de `server/test/offre-pret.test.js`. Un dossier
      resté « à confirmer » n'est jamais considéré comme complet (`dossierEntierementComplet`),
      donc il est rescanné : le statut se résout tout seul dès qu'Ollama est de nouveau là.
    - **Garanties du prêt** (`GARANTIES_PRET`/`detecterGarantiesPret`) : caution, hypothèque légale
      de prêteur de deniers, hypothèque conventionnelle — lues dans le texte de l'offre au moment
      où elle est identifiée (le PDF est déjà ouvert, aucune lecture supplémentaire), affichées
      dans la carte « Obtention du prêt » (emplacement choisi par l'étude). **Plusieurs peuvent
      s'appliquer au même prêt** (l'étude a dit « et/ou ») : le résultat est une liste, jamais une
      valeur unique. « Privilège de prêteur de deniers » (ancien nom, avant la réforme des sûretés
      de 2021) et « hypothèque légale spéciale » partagent la même clé : les deux formulations
      coexistent dans les offres réelles et désignent la même garantie. `d.garantiesPret` est
      remis à zéro comme `offrePretStatut`/`montantPret` à chaque changement de dossier lié et à
      l'import d'une sauvegarde — dérivé d'un PDF local, jamais transporté d'une machine à l'autre.
    - **Conséquence assumée sur les performances** : la recherche de l'offre ouvre maintenant les
      PDF du dossier jusqu'à la trouver, alors que la version précédente ne lisait que leurs noms.
      Le coût reste borné (le parcours s'arrête dès l'offre trouvée, et un PDF de moins de 6 pages
      est écarté avant même sa page de garde), et il disparaîtra largement quand le serveur lira
      le NAS lui-même. Les pièces de la checklist, elles, continuent d'être reconnues par leur seul
      nom de fichier — rien n'a changé de ce côté.
  - **Lot 6 — le SERVEUR lit le NAS, l'API File System Access est abandonnée** (le plus structurant
    des six, gardé pour la fin : il réécrit la source des fichiers dont dépendent les lots 4 et 5).
    - **Cause, tranchée avec l'étude** : `showDirectoryPicker()` n'existe que dans un contexte
      sécurisé (`localhost` ou HTTPS). Les collaborateurs qui rejoignent l'outil par l'ADRESSE IP du
      poste serveur — le cas normal au bureau — n'avaient donc tout simplement pas la fonction : ni
      relier un dossier, ni consulter une pièce, alors que les dossiers clients sont sur un NAS
      commun visible par tous. Option retenue parmi celles proposées : **le serveur lit le NAS
      lui-même** et sert la même chose à tout le monde.
    - **Côté serveur** : `server/src/nas.js` (parcours en largeur et plafonds repris tels quels de
      la version client — la leçon déjà payée sur le parcours en profondeur est reportée ici, avec
      son test) et `server/src/routes/nas.js` (trois routes derrière le mot de passe partagé :
      lister les dossiers clients, lister les PDF de l'un d'eux, servir les octets d'un PDF).
      **Aucune analyse de PDF côté serveur** : le client garde pdf.js, le serveur ne fait que servir
      les octets — aucune dépendance PDF ajoutée. `config.nasRacine` suit la résolution à 3 niveaux
      déjà en place (`NAS_RACINE` → `config.json` → vide), mais n'est **jamais générée
      automatiquement** contrairement au mot de passe et au jeton calendrier : seule l'étude sait où
      sont ses dossiers. Absente = fonctionnalité désactivée avec un message explicite (`/nas/etat`),
      jamais un chemin deviné ni un échec silencieux.
    - **Confinement à la racine** (`resoudreCheminNas`, la partie la plus testée du lot) : ces
      routes transforment un paramètre d'URL en chemin de fichier sur le poste serveur. Un `..`
      qui passe donnerait à quiconque sur le réseau du bureau l'accès à tout le disque. Les liens
      symboliques sont résolus AVANT la vérification (un raccourci posé dans le NAS suffirait
      sinon à la contourner), et seuls les `.pdf` sont servis.
    - **Rapprochement automatique par NOM** (`rapprocherParNom`), méthode choisie par l'étude :
      « DUPONT / MARTIN » propose « 2024-118 DUPONT MARTIN » (numéro de dossier, accents et
      ponctuation ignorés ; mots trop courants écartés). **Deux candidats à égalité ne donnent
      AUCUNE proposition** plutôt qu'un choix arbitraire — se tromper de dossier ferait chercher
      les pièces d'une vente dans celles d'une autre. Un seul mot en commun sur un nom qui en
      compte plusieurs ne suffit pas non plus. La liste complète reste affichée et le clic est
      toujours explicite : c'est une proposition, jamais une décision (`#nas-choix-overlay`, sur le
      patron `.confirm-overlay` déjà utilisé partout ailleurs).
    - **Côté client** : `d.nasDossier` (chemin relatif) et `d.fichiersTrouves` (chemin de chaque
      document reconnu) remplacent les handles IndexedDB. Ces deux champs vivant SUR LE DOSSIER,
      donc sur le serveur, **un dossier relié depuis un poste l'est pour tous** — l'ancien handle
      était propre à un navigateur. `fichiersPdfRecursifs`, `enregistrerHandle`/`recupererHandle`,
      `ouvrirBaseHandles`, `CLE_HANDLE_*` et `DOSSIER_FS_SUPPORTE` sont supprimés.
    - **Tout le mécanisme de permissions disparaît avec le problème qu'il compensait** : la popup
      de démarrage, le bandeau `#alerte-acces`, le bouton groupé « Reconfirmer tous les accès »,
      `d.accesAReconfirmer` et ses effets sur `calculerPriorite`/« Actions urgentes ». Chrome
      redemandait l'autorisation à chaque redémarrage (limite du navigateur, jamais contournable
      côté code) ; il n'y a plus rien à reconfirmer.
    - **« Revérifier tous les dossiers »** (`reverifierTousLesDossiers`) dans la barre d'outils du
      Suivi, à la place de l'ancien bouton du registre partagé — demandé par l'étude. Les dossiers
      sont traités l'un après l'autre plutôt qu'en parallèle : chacun peut demander au modèle IA
      local de confirmer une offre de prêt, et Ollama sérialise de toute façon ses réponses.
    - **À l'import d'une sauvegarde, `d.nasDossier` est CONSERVÉ** (contrairement à l'ancien
      `dossierLie`, toujours remis à `false`) : c'est un chemin sur le serveur de l'étude, pas une
      autorisation propre à un navigateur. Les statuts qui en dérivent (`offrePretStatut`,
      `pieces`, `fichiersTrouves`, `montantPret`, `garantiesPret`) repartent en revanche de zéro,
      comme avant.
    - **Tests** : `server/test/nas.test.js` (19, dont le confinement des chemins et le parcours en
      largeur, qui reprennent la couverture des 4 tests client de `fichiersPdfRecursifs` supprimés
      avec la fonction) — suite serveur 77 → 96, suite racine 268 → 264. **Vérifié de bout en bout**
      avec un vrai serveur et une arborescence NAS reproduisant celle de l'étude (rubriques
      numérotées, sous-dossiers) : état du NAS lu au démarrage, rapprochement correct proposé,
      dossier relié, parcours lançant la reconnaissance des pièces par nom, chemins mémorisés, et
      ouverture d'une pièce dans un onglet via `/api/nas/fichier`. **Non vérifié sur un vrai NAS
      Windows** : chemin UNC et droits du compte exécutant le serveur restent à confirmer au
      bureau (voir server/README.md).

- **Bug corrigé : le serveur ne démarrait plus du tout après modification de `config.json` — la
  fenêtre de console « clignotait puis rien ».** Signalé par l'étude juste après avoir renseigné
  `nasRacine` (lot 6 ci-dessus). Cause : `resoudreConfigExecutable()` appelait `JSON.parse()` sans
  aucun filet, et un chemin réseau collé depuis l'explorateur Windows s'écrit avec des antislashs
  SIMPLES — illégal en JSON (`Bad escaped character`). L'exception remontait pendant le
  `require('./config')` en tête de `index.js`, **avant** l'installation des gestionnaires
  `uncaughtException`/`crash.log` quelques lignes plus bas : rien n'était journalisé nulle part, et
  la console d'un `.exe` à double-clic se referme instantanément à la fin du processus. De
  l'extérieur, le serveur disparaissait sans un mot.
  - `config.js` : le `JSON.parse` est encadré, et l'erreur levée nomme le fichier concerné, montre
    la forme correcte ET incorrecte sur `nasRacine` (la faute la plus probable), et rappelle le
    piège des virgules. Le fichier n'est jamais réécrit quand il n'a pas pu être lu — écraser une
    configuration qu'on ne comprend pas ferait perdre le mot de passe partagé avec.
  - `index.js` : `signalerEchecDemarrage()` est défini **avant** le `require('./config')`, qui est
    lui-même encadré. Le message part vers trois canaux : la console, un fichier
    `erreur-demarrage.txt` à côté de l'exécutable (seul canal qui survive à la fermeture de la
    fenêtre — même raisonnement que `crash.log`, mais pour un échec qui survient trop tôt pour
    lui), et une attente de touche qui maintient la fenêtre ouverte. Cette attente est conditionnée
    à `process.stdout.isTTY && process.stdin.isTTY` : sans ce garde-fou, un lancement sans fenêtre
    (`Lancer-CLAIRE-en-arriere-plan.vbs`, service NSSM) resterait bloqué indéfiniment sur une
    invite que personne ne voit.
  - `demarrer()` est encadrée de la même façon, et `serveur.on('error')` traite le port déjà
    occupé — un `listen` échoue de façon ASYNCHRONE, donc hors de tout try/catch. Sans ce
    gestionnaire, l'erreur retombait dans `uncaughtException`, qui journalise puis **laisse
    tourner** un processus qui n'écoute rien : le pire des deux mondes. Le message renvoie
    explicitement vers `Arreter-CLAIRE.bat`, le cas le plus probable étant un serveur déjà lancé
    sans fenêtre visible.
  - Test dans `server/test/config.test.js` construit avec la faute EXACTE de l'étude (antislashs
    simples dans `nasRacine`) : vérifie le drapeau `configIllisible`, le chemin du fichier dans le
    message, la mention des antislashs, et surtout qu'aucune écriture n'a lieu. Suite serveur :
    96 → 97 tests. Suite racine inchangée (264).
  - **Leçon, à rapprocher de celle déjà tirée sur le décodage HTML des attributs `onclick`** : un
    filet posé APRÈS l'endroit qui peut tomber ne protège rien. `crash.log` avait été ajouté pour
    exactement ce symptôme (« le serveur s'arrête sans message ») mais s'installait trop tard pour
    couvrir la lecture de la configuration — la première chose que fait le processus, et la seule
    que l'étude modifie à la main.

- **« Contrôle le nouveau système d'ajout de dossier, rien ne va » — quatre défauts trouvés en
  rejouant un import complet dans un vrai navigateur, pas en relisant le code.** Méthode : un
  serveur réel + Playwright, `traiterTexte()` appelé directement avec le texte d'un compromis
  synthétique (pdf.js reste inaccessible ici, mais il n'est PAS nécessaire pour exercer toute la
  chaîne d'extraction — c'est ce qui a permis de reproduire, là où les tests unitaires passaient
  tous). La création 100 % manuelle, elle, fonctionnait déjà de bout en bout (dossier bien
  enregistré côté serveur, aucune erreur JS) : le problème était entièrement dans l'extraction.
  - **Le nom du dossier prenait la COMMUNE au lieu du patronyme.** Le plus visible des quatre :
    « BLOIS / TOURS » au lieu de « DUPONT / MARTIN ». Dans le style « étiquette finale »
    (« Monsieur Jean DUPONT, né le 3 mars 1970 à BLOIS, demeurant 5 rue des Lilas 41000 BLOIS,
    ci-après dénommé LE VENDEUR » — la rédaction la plus répandue), `nomsEtFinPourRole()` prenait
    « le dernier mot en capitales avant l'étiquette ». Or une présentation de partie se termine
    toujours par son ADRESSE, dont la commune est en capitales : c'était structurellement la ville
    qui remontait, jamais le nom. Nouvelle `nomsAvantLabel()` : on s'ancre sur la CIVILITÉ, comme
    `extraireNomsParNaissance()` le fait déjà pour le style « en-tête » — le patronyme suit
    immédiatement « Monsieur/Madame », l'adresse ne vient qu'après. Repli sur l'ancien comportement
    si aucune civilité (société, « les époux X »).
    - Fenêtre de recherche portée de 250 à 600 caractères — une présentation réelle (état civil,
      nationalité, régime matrimonial, profession, adresse) dépasse largement 250, et la civilité
      tombait alors hors fenêtre — mais désormais **bornée par `apresIndex`** : elle ne peut plus
      empiéter sur la partie précédente, ce que les 250 caractères fixes ne garantissaient pas
      (c'est la mécanique du vieux bug « NOM / NOM »).
    - **C'est très probablement le fond du « les noms de dossier ne vont pas » resté ouvert depuis
      des semaines**, et qu'une entrée précédente de ce fichier donnait pour « très probablement
      corrigé » par la refonte de l'extraction. Ça ne l'était pas : le correctif d'alors portait sur
      `estStyleLabelEntreGuillemets()` (reconnaître l'étiquette), pas sur la façon dont le nom est
      ensuite cherché à l'intérieur. Leçon : ne pas clore un bug sur une déduction tant qu'on ne l'a
      pas reproduit.
  - **Un acte à deux vendeurs n'était pas reconnu du tout.** Trouvé en écrivant le test de
    non-régression du couple, pas signalé : `estStyleLabelEntreGuillemets()` n'acceptait pas le
    PLURIEL (« ci-après dénomm**és** LES VENDEURS »). L'étiquette n'étant pas reconnue, la fonction
    retombait sur la méthode « en-tête », qui cherche le nom APRÈS le mot-clé et ramenait donc celui
    de la partie suivante. `d[ée]nomm[ée]e?s?` et `les?` corrigent les deux formes.
  - **L'adresse du bien avalait la désignation cadastrale, en la tronquant.** « 41100 VENDOME,
    cadastrée section AB numéro 24 » : les 40 caractères pris après le code postal débordaient sur
    la phrase et coupaient en plein numéro de parcelle. Deux formes notariales coexistent et
    demandent le traitement OPPOSÉ de la virgule — « ORLEANS (45000), 12 rue de la République »
    (code postal entre parenthèses, la rue vient après la virgule, il faut la franchir) et
    « 14 rue du Moulin 41100 VENDOME, cadastrée… » (code postal nu, la commune termine l'adresse,
    la virgule la borne). D'où une alternance dans `ADRESSE_BIEN_RE` plutôt qu'un motif unique. Les
    deux tests d'adresse existants ont d'ailleurs attrapé la première tentative, qui ne traitait que
    le second cas : ils ont fait exactement leur travail.
  - **« Il ne détecte plus les adresses »** : la préposition était EXIGÉE après sis/sise/situé.
    « Un immeuble **sis** 22 boulevard Gambetta 41000 BLOIS », rédaction notariale des plus
    courantes, n'était donc pas détecté du tout. La préposition devient optionnelle (le vrai point
    d'ancrage est le code postal dans la même phrase), et « sur la commune de » / « se trouvant à »
    sont ajoutés. Vérifié que l'adresse d'une PARTIE (« demeurant à… ») continue de ne jamais
    matcher — c'est le garde-fou que cet assouplissement ne devait pas ouvrir.
  - **« Il ne calcule plus les dates d'obtention de prêt quand il y a des jours »** : la date était
    bien calculée (signature + 60 jours) mais restait SANS CATÉGORIE, donc jamais reportée dans le
    champ. Cause : `suggererEcheance()` ne regarde que la PHRASE, et la rédaction courante met le
    mot « prêt » dans le seul titre de la clause (« CONDITION SUSPENSIVE D'OBTENTION DE PRÊT »),
    la phrase du délai disant seulement « … devra obtenir son offre au plus tard dans les
    60 jours ». La suggestion est désormais cherchée à l'échelle de la CLAUSE (600 caractères en
    amont) **uniquement pour les dates issues d'un délai** (`calcul` renseigné) et **uniquement si
    aucune catégorie n'a été trouvée** ; la date reste marquée « ≈ estimée ». Sans risque pour la
    clause de notification du refus au notaire, déjà écartée en amont par le garde-fou
    « notifier/notification ». Un test vérifie l'inverse : un délai sans vocabulaire de financement
    dans sa clause ne reçoit toujours aucune catégorie.
    - **Ce n'était PAS une régression de la refonte**, contrairement à ce que « ne … plus »
      laissait entendre : vérifié en rejouant la même clause sur `script.js` du commit `c90e9d0`
      (la version d'avant), qui donne exactement le même résultat — date calculée, jamais classée.
      Limite ancienne, simplement rencontrée maintenant. Vérifier avant de chercher un coupable
      dans le dernier chantier coûte deux minutes et évite de défaire du code correct.
  - Tests : suite racine 264 → 273 (patronyme vs commune, parties d'un couple, les deux formes
    d'adresse, « sis » sans préposition, adresse d'une partie non captée, délai de prêt classé par
    le titre de clause, et son contre-exemple).

- **Panneau « Ce que l'outil a compris » repris en entier**, sur un retour sans appel de l'étude
  (« il y a énormément de bug et la logique n'est pas bonne », « llama hallucine souvent sur des
  termes », « quand il met confirmé mais que c'est faux comment modifier ? », « il ne met pas les
  références pour aller directement à la page », « c'est très confus »). Trois défauts
  **structurels** derrière ces symptômes, pas des bugs isolés — chacun tranché avec l'étude avant
  implémentation :
  - **« Confirmé » ne confirmait rien.** `champExtraction()` faisait `statut: valeur ? 'CONFIRMED'
    : 'NOT_FOUND'` : une donnée était marquée « Confirmé » **du seul fait qu'une regex avait
    renvoyé quelque chose**. Aucun contrôle n'avait jamais eu lieu, et les propositions du modèle
    local tombaient dans le même mot. **Décision de l'étude : l'outil dit d'où vient la donnée,
    c'est elle qui coche « vérifié ».** Nouveau vocabulaire (`ORIGINES_REVISION`/`origineRevision()`,
    fonction pure testable) : « Lue dans l'acte », « Calculée depuis un délai », « Appris d'une
    correction précédente », « Plusieurs valeurs possibles », « Proposée par l'IA », « Non
    trouvée », « Saisie à la main », « Vérifié ». **Le vert (`dl-success`) n'est accordé que par
    une relecture humaine ou une saisie manuelle** — jamais par la seule présence d'une valeur.
    Un compteur « N / M données vérifiées » en tête du panneau dit où en est la relecture.
    L'ordre des cas dans `origineRevision()` EST la règle métier, et il est testé comme tel.
    **« Appris » est délibérément conservé comme origine à part entière** (l'étude : « la notion de
    appris était bien aussi avant ») : `construireDatesMetier()` propage désormais le drapeau
    `apprise` des candidates jusqu'à l'objet date, qui ne le transportait pas.
  - **Aucune référence de page, par construction.** `construireExtractionRegex()` appelait
    `champExtraction(detecterNomDossier(source))` **sans lui passer de `source`** → `source: null`
    → aucun bouton « p.X » sur le nom, le prix ni l'email ; seules les dates en avaient un.
    Nouvelles fonctions `localiserValeur()` / `extraitAutour()` / `aiguillesPourValeur()` /
    `sourcePourValeur()` : la valeur déjà extraite est retrouvée dans le texte, ce qui donne sa
    page (`pageDepuisIndex`) et la phrase qui l'entoure. **Distinct de `localiserExtrait()`**, qui
    vérifie une CITATION du modèle et exige pour ça au moins 12 caractères (« le 15 » se
    retrouverait partout) : ici la valeur vient de nos propres règles, on cherche seulement à la
    situer — et un patronyme ou un montant font souvent moins de 12 caractères, les écarter
    revenait à n'afficher aucune page. `aiguillesPourValeur()` cherche la valeur **sous la forme
    où elle figure réellement dans l'acte** : un nom de dossier « DUPONT / MARTIN » est une
    composition qui n'y apparaît jamais telle quelle (on situe le premier patronyme), un prix
    `200000` s'y écrit « 200 000 ». Vérifié en conditions réelles sur un acte de 3 pages : nom
    → p.1, adresse et prix → p.2, dates → p.3.
  - **Le panneau était en lecture seule** et affirmait « chaque donnée reste modifiable dans les
    champs du formulaire » — alors que nom, adresse et prix vivent à l'**étape 4** et le panneau à
    l'**étape 2** : corriger une valeur fausse obligeait à quitter l'écran où elle se voyait.
    **Chaque ligne est désormais un champ de saisie** (`CHAMPS_REVISION`, `champRevision()`,
    `ecrireChampRevision()`, `modifierDonneeRevision()`), qui écrit **en même temps** dans le champ
    du formulaire correspondant (`synchroniserChampFormulaire()`) — une seule source de vérité.
    **Aucun statut n'est un verrou** : une donnée « à vérifier » comme une donnée déjà relue se
    corrige de la même façon (demande explicite de l'étude, « permettre de modifier a posteriori
    même si c'est à vérifier ou confirmé »). Corriger une ligne la coche automatiquement comme
    vérifiée — c'est le même geste — et **alimente la mémoire des corrections apprises**
    (`memoriserCorrectionRevision()` → `memoriserCorrection(..., 'date')`), au même titre qu'un clic
    sur un chip : c'est ce qui fera ressortir le badge « Appris » au prochain acte de même trame.
    `onchange` et non `oninput` : le panneau se redessine à chaque modification, une saisie
    caractère par caractère perdrait le focus au premier appui sur une touche.
  - **Le modèle IA n'écrit plus jamais de lui-même** (troisième arbitrage de l'étude, face aux
    hallucinations constatées). `fusionnerExtractionIa()` ne pose plus aucune valeur : une lecture
    du modèle devient une `propositionIa {valeur, source, extraitTrouve}`, affichée dans le panneau
    sous l'étiquette « Proposé par l'IA » avec un bouton « Utiliser »
    (`accepterPropositionIa()`), et signalée explicitement quand la phrase citée ne figure pas dans
    le document. Les trois règles de fusion deviennent : regex muettes → proposition ; accord →
    `origine: 'regex+ia'` et rien de plus ; désaccord → valeur des regex conservée, statut
    « à vérifier », valeur du modèle en proposition ET en candidat. Une donnée déjà corrigée à la
    main (`origine: 'manuel'`) n'est jamais rouverte par le modèle. Les parties et les notaires
    issus du seul modèle sont marqués `origine: 'ia'` — et ce marquage **interdit désormais le
    pré-remplissage automatique de `#f-role-notaire`** (`appliquerExtractionAuFormulaire`) : ce
    sélecteur masque la checklist des pièces quand il vaut « participant », le basculer sur une
    lecture non vérifiée serait le pire cas.
  - **Corrections et relectures survivent à un recalcul** (`correctionsRevision`/
    `verificationsRevision` + `appliquerCorrectionsRevision()`, rejouées dans
    `recalculerExtractionRegex()`) : corriger la date de signature reconstruit tout l'objet
    d'extraction, sans ces deux tables le travail de relecture déjà fait était effacé à chaque
    fois. Remises à zéro à chaque nouvel import et dans `reinitialiserFormulaire()`.
  - **Même vocabulaire sur la fiche enregistrée** : `renderExtractionDossier()` (le `<details>`
    « Extraction » du tiroir) utilisait `LIBELLES_STATUT_EXTRACTION`, supprimée avec le reste — elle
    passe par `origineRevision()`, avec un drapeau `renseigne` ajouté à l'instantané
    (`instantaneExtraction()`) puisque la valeur elle-même n'y est pas recopiée. Un seul vocabulaire
    pour la même réalité, import et dossier enregistré — principe déjà appliqué ailleurs dans ce
    fichier (voir `statutOffreAffichage()`).
  - **Piège de spécificité CSS, rencontré une quatrième fois** (après `.select-edit`,
    `.input-inline`, `.pdf-recherche-input`) : les champs du panneau sont ciblés par
    `.revision-ligne input.revision-saisie` (élément + 2 classes), car la règle générique
    `input[type="text"]` de la feuille a la même spécificité qu'un simple `input.revision-saisie` et
    l'emporterait par son ordre dans le fichier.
  - Tests : `tests/revision.test.js` (13 nouveaux — vocabulaire d'origine et son ordre, le vert
    réservé à la relecture, « Appris » conservé, chaque clé de `CHAMPS_REVISION` résoluble, un
    statut qui n'est pas un verrou, les références de page) et `tests/fusion.test.js` réécrit sur
    le nouveau contrat (proposition au lieu d'écriture, donnée manuelle non rouverte, adoption
    d'une proposition). Suite racine 273 → 288, suite serveur inchangée (97). **Vérifié dans un
    vrai Chromium** (clair et sombre, `traiterTexte()` appelé directement, pdf.js étant bloqué par
    le proxy de cet environnement) : plus aucun « Confirmé » affiché, 10 lignes toutes éditables et
    toutes cochables, correction depuis le panneau répercutée dans le formulaire, compteur qui
    suit, proposition IA sans effet jusqu'au clic sur « Utiliser », aucune erreur JS.

- **Lot de onze demandes après une matinée d'usage réel**, traitées indépendamment :
  - **Bug corrigé : ouvrir un PDF du NAS affichait `{"erreur":"Authentification requise ou
    expirée."}` au lieu du document.** `ouvrirFichierNas()` faisait un `window.open()` DIRECT sur
    `/api/nas/fichier` — une navigation ordinaire du navigateur, qui ne porte aucun en-tête
    `Authorization` : le serveur la rejetait donc systématiquement, et l'onglet n'affichait que le
    JSON d'erreur. Les octets sont désormais récupérés par `fetchAvecAuth` (qui porte le jeton de
    session) puis présentés via une URL d'objet locale. **L'onglet est ouvert AVANT l'await**, tant
    que le clic est encore actif : ouvert après, il serait bloqué comme une fenêtre surgissante
    (même contrainte d'activation que celle déjà documentée pour `requestPermission`).
  - **Bug corrigé : le panneau « Diagnostic du dernier parcours » se refermait tout seul.**
    `render()` reconstruit le tiroir à chaque action (revérifier une pièce, corriger une date…) et
    le `<details>`, sans attribut `open`, repartait fermé en plein milieu de la lecture du journal.
    Son état est mémorisé dans `diagnosticParcoursOuvert` (un booléen suffit : un seul dossier est
    ouvert à la fois), posé par `ontoggle` et remis à `false` à l'ouverture/fermeture du tiroir —
    même mécanisme que `ajoutEngagementOuvert`.
  - **Offre de prêt : le NOM du fichier redevient le premier critère, la lecture du contenu n'est
    plus qu'un repli.** Troisième révision de cette reconnaissance (contenu seul → nom seul →
    titre de page de garde + IA — voir leur historique), demandée ainsi par l'étude : si le nom du
    fichier dit « offre de prêt » / « offre de crédit » / « contrat de prêt »… le document est
    validé **sans lire son contenu ni solliciter le modèle local** (un collaborateur qui nomme
    ainsi un fichier a déjà fait le travail d'identification, et faire dépendre ce cas d'un modèle
    absent ferait retomber en « à confirmer » un document parfaitement identifié) ; sinon, on
    retombe sur le titre de la page de garde puis la confirmation par le modèle, comme avant. Le
    filtre des **6 pages minimum s'applique aux deux voies** (« toujours pour ceux de plus de
    6 pages »). `OFFRE_PRET_RE` couvrait déjà « offre de crédit » : c'est son application au nom du
    fichier qui manquait, pas le motif.
  - **Sur une promesse, l'ordre des notaires en tête de première page fait foi** (convention de
    rédaction indiquée par l'étude : l'instrumentaire est nommé le premier, le participant ensuite).
    `detecterNotaires()` marque `enTete` toute mention située dans les `ZONE_ENTETE_ACTE` (2500)
    premiers caractères ; `determinerNotaires()` gagne un paramètre `typeActe` et un **troisième
    niveau de priorité**, après la mention explicite et la règle géographique 41/45/37 — il
    n'intervient donc que là où rien n'était tranché jusqu'ici (NEEDS_REVIEW) et ne peut rien faire
    régresser. Exige **deux** notaires dans l'en-tête : un seul ne dit rien d'un ordre. Les types
    concernés sont déclarés dans `ORDRE_ENTETE_PROMESSE`, à un seul endroit, comme
    `REGLES_NOTAIRE_INSTRUMENTAIRE`.
  - **Bouton « Ajouter une obligation du vendeur » déplacé SOUS l'analyse juridique** dans le
    tiroir : on ajoute une obligation après avoir lu celles qui ont été détectées, pas avant. Rendu
    hors du `<details>` pour rester accessible même quand l'analyse est vide (elle n'est alors pas
    affichée du tout).
  - **Choix du dossier NAS : proposition en tête, recherche, et connexion automatique sur
    correspondance exacte.** Le dossier proposé (et celui déjà relié) remontent en tête de liste —
    les marquer sans les remonter obligeait à les chercher au milieu de centaines d'entrées. Un
    champ de recherche (`#nas-choix-recherche`, insensible aux accents via `normaliserPourRecherche`)
    filtre la liste. Côté serveur, nouvelle fonction `rapprochementParfait()` : **tous** les mots
    significatifs du nom du dossier se retrouvent dans un **seul** dossier NAS — c'est le seul
    niveau auquel `lierDossierLocal()` relie tout seul, sans ouvrir la fenêtre. Jamais sur un simple
    `propose` (meilleur candidat, pas certitude) : se tromper de dossier ferait chercher les pièces
    d'une vente dans celles d'une autre. Le lien reste défaisable par « Changer de dossier » et est
    journalisé comme tout autre rattachement.
  - **Vue « Semaines » renommée « Échéances », devenue la vue par défaut du Suivi**, et surtout
    **une seule ligne par dossier** : sa prochaine échéance EN ATTENTE, plus toutes ses dates. La
    première version listait chaque échéance, si bien qu'un dossier figurait sous chaque semaine où
    il avait quelque chose — y compris une signature d'acte à trois mois alors que sa condition de
    prêt n'était pas levée. On ne montre que ce qu'il y a à faire maintenant.
  - **Une échéance peut être déclarée RÉALISÉE** (`echeanceValidee()` / `validerEcheance()` /
    `devaliderEcheance()`, état `d.echeancesValidees` indexé par type) : la date reste au dossier
    pour mémoire, mais elle sort du planning et la suivante remonte — exactement le rôle que jouait
    déjà `offrePretStatut === 'recue'` pour le prêt, que `echeanceValidee()` réutilise sans le
    doubler. Bouton « Marquer réalisée » affiché uniquement sur la **vente préalable** (seul cas
    demandé), mais l'état est stocké par type pour que l'étendre ne demande rien de plus qu'un
    bouton. **Conservé à l'import d'une sauvegarde**, contrairement aux statuts dérivés des PDF du
    NAS : c'est une décision prise par l'étude, pas une lecture de fichier.
  - **Filet retiré sous l'en-tête « En retard »** de la vue Échéances (la couleur du libellé suffit
    à repérer le groupe) ; **badge « Alpha » aligné à droite sous le logo** (`.sidebar-alpha-ligne`)
    et **tagline « La clarté sur chaque dossier. » retirée** avec sa règle CSS devenue morte.
  - Tests : `tests/semaines.test.js` réécrit sur « une ligne par dossier » (+ validation d'échéance,
    + équivalence avec l'offre reçue) et 3 nouveaux dans `tests/notaires.test.js` (ordre en tête,
    borne de l'en-tête, priorité de la mention explicite). Suite racine 288 → 293, serveur 97.
    **Vérifié dans un vrai Chromium** (clair et sombre, dossiers synthétiques via l'API, serveur
    réel) : vue Échéances active par défaut, aucun doublon de dossier, validation d'une vente
    préalable faisant remonter la signature de l'acte, « ✓ Réalisée » et « Annuler la validation »
    sur la carte, bouton d'ajout d'obligation bien placé après l'analyse, diagnostic resté ouvert
    après plusieurs `render()`, liste NAS triée avec le proposé en tête et filtrée par la recherche,
    aucune erreur JS.
  - **Trouvé en écrivant les tests, non corrigé (hors demande) :** `RE_ROLE_INSTRUMENTAIRE`
    reconnaît « acte reçu par Maître X » — y compris dans une clause d'ORIGINE DE PROPRIÉTÉ
    (« Le bien a été acquis suivant acte reçu par Maître X »), très fréquente, où ce notaire est
    celui de la vente PRÉCÉDENTE et non de l'acte en cours. Le motif désignerait alors le mauvais
    notaire instrumentaire, avec une priorité 1 qui écrase tout le reste. À corriger en excluant les
    mentions précédées d'un marqueur d'origine de propriété — à faire sur demande, avec un extrait
    réel pour éviter de régresser les cas légitimes.

- **Correction de la règle des notaires : la zone où l'acte les nomme dépend du TYPE d'acte.**
  L'étude a précisé, juste après la livraison de la règle « ordre en tête de première page » :
  « le nom des notaires est toujours situé en première page pour les promesses de vente et
  dérivées ; pour les compromis de vente plutôt en fin d'acte ». La version précédente rangeait
  `COMPROMIS_DE_VENTE` dans la liste des types traités par l'en-tête — **une erreur d'implémentation
  de ma part**, pas une limite du texte fourni : sur un compromis, deux noms de notaires en
  première page sont cités à un tout autre titre (origine de propriété, acte antérieur, servitude)
  et n'ont aucune raison de désigner l'instrumentaire.
  - `ZONE_NOTAIRES_PAR_TYPE` (nouvelle table, remplace `ORDRE_ENTETE_PROMESSE`) déclare la zone
    par type d'acte, à un seul endroit — même principe que `REGLES_NOTAIRE_INSTRUMENTAIRE` :
    `PROMESSE_DE_VENTE`/`PROMESSE_D_ACHAT` → `'entete'`, `COMPROMIS_DE_VENTE` → `'fin'`. Un type
    non tranché (`INCONNU`, `AUTRE`) n'a **aucune** entrée : on ne devine pas où chercher, la
    règle ne s'applique simplement pas. **Corrigé juste après** (voir l'entrée « la FORME de
    l'acte » plus bas) : cette table n'est plus le critère principal mais un simple repli, et le
    cas « promesse synallagmatique », rangé ici du côté « fin d'acte », était faux — cet acte est
    authentique, donc ses notaires sont en première page.
  - `detecterNotaires()` marque désormais les DEUX zones sur chaque mention (`enTete` comme avant,
    `enFin` pour les `ZONE_FIN_ACTE` = 3000 derniers caractères — un bloc de clôture de compromis,
    avec la comparution des notaires et les signatures, est un peu plus étalé qu'un en-tête).
    `determinerNotaires()` ne consulte que celle qui correspond au type. Sur un acte court, une
    mention peut porter les deux drapeaux : sans conséquence, le type d'acte décide seul de la
    zone lue.
  - Le reste de la règle est inchangé : toujours le **troisième** niveau de priorité (après la
    mention explicite et la règle géographique 41/45/37), toujours **deux notaires exigés** dans la
    zone attendue (un seul ne dit rien d'un ordre), toujours « premier nommé = instrumentaire,
    second = participant ». Ne peut donc rien faire régresser de ce qui était déjà tranché.
  - **Hypothèse levée depuis** : l'ordre était supposé ici (repris de la règle des promesses), il
    a été **confirmé explicitement par l'étude** dans la foulée — « le notaire instrumentaire est
    celui qui a rédigé, et celui en participation ou en concours est celui qui est en second ».
    Voir l'entrée suivante.
  - Tests : 4 nouveaux dans `tests/notaires.test.js` qui verrouillent la distinction dans les deux
    sens — un compromis tranché par ses notaires de FIN ; un compromis qui ne tranche PAS sur des
    notaires en première page (c'est précisément la correction) ; une promesse qui ne tranche PAS
    sur des notaires en fin d'acte ; et la table elle-même, y compris l'absence d'entrée pour un
    type non déterminé. Suite racine 293 → 297.
  - **Conséquence sur le faux positif déjà signalé plus haut** (`RE_ROLE_INSTRUMENTAIRE` reconnaît
    « acte reçu par Maître X » jusque dans une clause d'ORIGINE DE PROPRIÉTÉ) : il devient plus
    gênant pour les compromis, puisque ceux-ci dépendent maintenant de la fin d'acte alors que
    cette clause, en priorité 1, peut trancher depuis n'importe où dans le document. Toujours pas
    corrigé faute d'extrait réel — à traiter en priorité au prochain exemple fourni.

- **Définition des deux rôles donnée par l'étude, et faux positif de l'origine de propriété enfin
  corrigé.** Précision reçue : « le notaire instrumentaire est celui qui a RÉDIGÉ, et celui en
  participation ou en concours est celui qui est en second ». Deux conséquences, la seconde
  découlant directement de la première :
  - **`RE_ROLE_INSTRUMENTAIRE` reconnaît maintenant le verbe RÉDIGER**, qui définit le rôle :
    `rédigera l'acte` (déjà là) rejoint par `rédigé par` / `rédigée par` (**au passé**),
    `notaire rédacteur` (terme notarial courant pour le désigner) et `acte dressé par`.
    `RE_ROLE_PARTICIPANT` gagne `notaire concourant` et `en concours` sans complément — l'étude
    nomme ce rôle indifféremment « participant » ou « en concours », les deux vocabulaires
    coexistent dans les actes.
  - **`RE_ORIGINE_PROPRIETE` (nouveau) écarte la clause d'origine de propriété** — le faux positif
    signalé deux fois dans ce fichier et laissé ouvert faute d'exemple réel. Il n'était plus tenable
    de le laisser : accepter `rédigé par` AU PASSÉ, c'est accepter exactement la tournure de ces
    clauses (« Le bien a été acquis suivant acte reçu par Maître X », « Aux termes d'un acte rédigé
    par Maître Y en date du… »). Ces clauses figurent dans presque tous les avant-contrats et
    nomment le notaire de la vente **précédente** — jamais celui de l'acte en cours — et
    `roleExplicite` étant la priorité 1, elles écrasaient la règle géographique ET la règle de zone
    avec le mauvais notaire. Le motif reconnaît les amorces (`origine de propriété`,
    `suivant acte`, `aux termes d'un acte`, `pour l'avoir acquis/recueilli`,
    `antérieurement acquis`, `service de la publicité foncière`) et, quand il matche la fenêtre
    d'un notaire, **aucun rôle explicite n'est retenu pour lui** — ni instrumentaire ni
    participant, tout ce que dit cette clause portant sur la vente d'avant. On retombe alors sur
    les règles suivantes (géographique, puis ordre dans la zone du type d'acte), qui regardent le
    présent acte.
  - **Pourquoi l'asymétrie justifie d'avoir tranché sans exemple réel**, contrairement à la
    prudence habituelle de ce fichier : ne pas écarter la clause = désigner le mauvais notaire avec
    la confiance maximale ; l'écarter à tort = retomber sur la règle de zone, qui est de toute façon
    la bonne réponse dans l'immense majorité des actes. Le coût des deux erreurs n'est pas du même
    ordre. **À surveiller malgré tout** : si un acte réel désigne son notaire dans une phrase
    contenant l'une de ces amorces, la désignation serait perdue — le signalement serait « le rôle
    du notaire n'est plus détecté », et c'est ici qu'il faudrait regarder.
  - Tests : 4 nouveaux dans `tests/notaires.test.js` — les trois formulations du rédacteur, les
    deux du concours, les trois formes d'origine de propriété qui ne doivent RIEN désigner, et un
    test de bout en bout (notaire de la vente précédente cité au milieu d'un compromis, vrais
    notaires en fin d'acte : c'est bien la fin qui décide). Suite racine 297 → 301.

- **Ce qui décide de l'emplacement des notaires, c'est la FORME de l'acte, pas son nom.**
  Troisième précision de l'étude sur ce même point, et la plus structurante : « la promesse
  synallagmatique est à traiter comme une promesse de vente car acte authentique reçu par notaire
  et pas un acte sous seing privé ». Elle invalide le critère que j'avais retenu (promesse vs
  compromis) et donne la vraie raison : un acte **authentique** s'ouvre par la comparution des
  notaires (« PAR-DEVANT Maître X, notaire à… »), donc en première page ; un acte **sous seing
  privé** — le compromis d'agence, cas courant — ne les nomme qu'en fin, au moment de désigner qui
  recevra la vente. « Promesse » et « compromis » n'étaient qu'un proxy statistique de cette
  distinction-là.
  - **Deux notions désormais séparées, et à ne pas reconfondre** : le TYPE d'acte répond à « qui
    s'engage à quoi » (donc les rôles vendeur/acquéreur) ; la FORME répond à « authentique ou sous
    seing privé » (donc où les notaires sont nommés). Une promesse synallagmatique est les deux à
    la fois : un COMPROMIS pour les parties — les deux y sont engagées, `detecterTypeActe()` la
    classe donc toujours ainsi, à raison — et un acte AUTHENTIQUE pour la forme. Déduire l'une de
    l'autre était exactement l'erreur.
  - `detecterFormeActe(texte)` (nouveau) renvoie `'authentique'` / `'sous-seing-prive'` / `null`,
    et `zoneNotairesPourActe(texte, typeActe)` en tire la zone, avec `ZONE_NOTAIRES_PAR_TYPE`
    rétrogradée au rang de **repli** quand la forme n'est pas déclarée lisiblement.
    `determinerNotaires()` accepte un 4ᵉ paramètre `zoneFournie` — le texte n'est pas disponible
    dans cette fonction, et lui faire prendre le document entier pour ça aurait brouillé son rôle ;
    sans ce paramètre elle retombe sur la table par type, ce qui la garde testable seule.
  - **La forme n'est lue QUE dans l'en-tête, et c'est le point critique.** Un compromis sous seing
    privé parle constamment de l'acte authentique À VENIR (« la vente sera réitérée par acte
    authentique au plus tard le… ») : chercher « acte authentique » dans tout le document ferait
    passer pour authentique précisément les actes qui ne le sont pas. Les marqueurs retenus sont
    ceux d'une DÉCLARATION de forme en tête (`par-devant Maître/nous/les notaires`, `reçu en la
    forme authentique`, `demeurera en minute`) et non la simple mention du mot.
  - `promesse synallagmatique` figure parmi les marqueurs d'authenticité non parce que c'est une
    forme, mais parce que l'étude a indiqué que ce type d'acte est toujours reçu par notaire —
    c'est noté comme tel dans le commentaire, pour qu'on ne le prenne pas plus tard pour une
    déduction de l'outil.
  - Tests : 5 nouveaux dans `tests/notaires.test.js` — la promesse synallagmatique (type COMPROMIS
    **et** zone en-tête, les deux assertions dans le même test pour que la distinction reste
    lisible), « PAR-DEVANT Maître », un acte déclaré sous seing privé, le piège de l'acte
    authentique à venir, et le repli par type quand aucune forme n'est déclarée. Suite racine
    301 → 306.
  - **Leçon** : trois allers-retours ont été nécessaires sur ce seul point (ordre en tête →
    distinction promesse/compromis → forme authentique/SSP), chacun parce que j'avais encodé le
    SYMPTÔME donné plutôt que de demander la règle sous-jacente. Sur un point de droit notarial,
    demander « pourquoi » avant d'implémenter aurait fait gagner deux tours.

- **Notaire du vendeur et notaire de l'acquéreur sur la fiche dossier**, demandés par l'étude :
  « détecter les notaires vendeur et acquéreur ou représentant le promettant ou le bénéficiaire
  lors de l'import du PDF, à insérer dans la fiche dossier sous l'adresse et le prix. Coupler cela
  avec l'option déjà présente du rôle du notaire. À pouvoir modifier par la suite. » Toute la
  détection existait déjà (`detecterNotaires`/`determinerNotaires`, voir les quatre entrées
  ci-dessus) mais ne servait qu'à pré-remplir le sélecteur « Rôle du notaire » : les noms
  eux-mêmes n'étaient visibles nulle part, sinon dans le `<details>` « Extraction » en lecture
  seule. **Mesuré avant de promettre quoi que ce soit** (script de bac à sable sur six formes
  d'acte réalistes) : le côté de chaque notaire ne se résout que si l'acte le dit explicitement
  (« notaire du vendeur », « conseil de l'acquéreur ») — une comparution simple en tête d'acte
  authentique, pourtant fréquente, ne le dit pas. D'où les deux arbitrages demandés à l'étude
  avant d'écrire une ligne :
  - **Côté non résolu → les deux noms restent proposés, côté VIDE, à l'étude de les affecter**
    (son choix, contre « affecter dans l'ordre de citation »). `cotesNotairesPourDossier()`
    (testable) ne remplit `notaireVendeur`/`notaireAcquereur` que si l'acte a réellement rattaché
    chaque notaire à une partie ; sinon les deux champs sortent vides et les noms relevés vivent
    dans `d.notairesDetectes` (`[{nom, role}]`), servis comme `<datalist>` du champ. Affecter un
    dossier au mauvais notaire ferait chercher les pièces d'une autre vente — même raisonnement
    que le refus, déjà en place, de deviner l'instrumentaire quand rien ne le désigne.
  - **Couplage avec « Rôle du notaire » : badge « Reçoit l'acte » + alerte si contradiction**
    (son choix, contre une correction automatique du sélecteur). `coteEtudeDossier(d)` repère
    notre étude dans l'un des deux champs (via `estEtude`, qui tolère déjà GOSSART/GOSSARD) ;
    `alerteRoleNotaireDossier(d)` compare le côté qui reçoit l'acte au rôle renseigné et affiche
    une phrase quand les deux se contredisent. On SIGNALE, on ne corrige jamais tout seul : ce
    sélecteur masque la checklist des pièces quand il vaut « participant », le basculer sur une
    déduction serait le pire cas (même prudence que le pré-remplissage, réservé à CONFIRMED).
  - **Nouveaux champs du dossier** : `d.notaireVendeur`, `d.notaireAcquereur` (chaînes libres —
    l'étude peut corriger une lecture fausse ou saisir un notaire que l'acte ne nommait pas),
    `d.coteInstrumentaire` (`'vendeur'|'acquereur'|null`) et `d.notairesDetectes`. Une petite
    énumération plutôt que le nom du rédacteur, pour que le badge survive à une correction du
    texte du champ. `normaliserDossierImporte()` les CONSERVE à l'import d'une sauvegarde : c'est
    une lecture de l'acte lui-même (ou une saisie de l'étude), la même sur n'importe quel poste,
    comme `adresseBien` — contrairement aux statuts dérivés d'un scan du NAS.
  - **Affectation qui pose le badge après coup** : le rédacteur repéré à l'import garde son rôle
    dans `d.notairesDetectes` même sans côté ; dès que l'étude affecte ce nom à l'un des deux
    champs, `affecterNotaire()` pose `coteInstrumentaire` — mais jamais par-dessus un côté déjà
    choisi à la main (`changerCoteInstrumentaire()`, nouveau `<select>` « Acte reçu par », placé
    dans la grille de classification à côté de « Rôle du notaire » : c'est le même sujet vu des
    deux bouts).
  - **Présentation** : `renderNotairesDossier()` reprend le gabarit de la grille de classification
    juste en dessous (libellé au-dessus, champ encadré) plutôt que celui de l'adresse et du prix
    (icône seule, sans libellé) — deux champs voisins qu'une icône ne suffirait pas à distinguer,
    alors que l'adresse et le prix ont chacun leur ligne pleine largeur. **Piège de spécificité CSS
    rencontré une cinquième fois** (après `.select-edit`, `.input-inline`, `.pdf-recherche-input`,
    `.revision-saisie`) : `.dossier-notaires input.input-classif` (élément + 2 classes), un simple
    `input.input-classif` étant à égalité avec la règle générique `input[type="text"]`.
    `.notaire-alerte` reprend la teinte de `.dot-label.dl-alerte` — le seul signal de l'outil qui
    garde un fond plein — mais sur plusieurs lignes, ce message étant une phrase et non un mot.
  - Tests : 6 nouveaux dans `tests/notaires.test.js` (côtés remplis quand l'acte le dit, rien de
    deviné sinon avec le rédacteur conservé dans les propositions, aucun notaire détecté, le côté
    de l'étude dans les deux graphies, les deux sens de la contradiction, et les quatre cas sans
    alerte). Suite racine 306 → 312. **Vérifié dans un vrai Chromium** (serveur réel, clair et
    sombre, desktop et 400px) : alerte affichée puis disparue après correction du rôle, liste
    déroulante des notaires détectés, affectation à la main posant le badge et le sélecteur, tout
    relu depuis le serveur, aucune erreur JS, aucun débordement horizontal en mobile.

- **Lot de huit demandes après le premier test de la fiche notaires**, traitées indépendamment :
  - **Bug corrigé : l'adresse lue à l'étape « Vérifier » n'était pas celle reportée à l'étape
    « Finaliser »** (« l'adresse bien détectée en 2 mais pas bien indiquée en 4 »). Cause
    structurelle, qui touchait aussi le nom, l'email et le prix : `traiterTexte()` écrivait
    DIRECTEMENT dans `#f-adresse-bien` le fragment BRUT du vieux `detecterAdresseBien()`, sans le
    noter dans `valeursAppliquees`. La couche structurée qui tourne juste après
    (`recalculerExtractionRegex` → `appliquerExtractionAuFormulaire`) prenait donc cette valeur
    pour une saisie de l'utilisateur et refusait d'y toucher — le panneau affichait l'adresse
    reconstruite pendant que le formulaire gardait le fragment. Les quatre champs passent
    désormais par `appliquerValeurChamp()`, qui garde exactement le même garde-fou (ne jamais
    écraser une saisie) mais enregistre ce que NOUS avons posé. Vérifié dans un vrai Chromium :
    les deux valeurs coïncident, et une saisie manuelle survit toujours à un recalcul.
    **`valeursAppliquees` n'est volontairement PAS remis à zéro à chaque import** : c'est ce qui
    permet à un second PDF de remplacer les valeurs du premier sans toucher à ce que l'étude a tapé.
  - **Le dossier du NAS se relie tout seul, sans clic** (`lierDossierNasAutomatique`) : à la
    création du dossier (`ajouterDossier`) et une fois par session pour chaque dossier actif non
    relié (`revérifierDossiersLiesAuDemarrage`, avec `tentativesLiaisonNasAuto` pour ne pas
    relancer une requête par dossier à chaque tour du minuteur de 5 min). **Uniquement sur une
    correspondance PARFAITE** (`rapprochementParfait` côté serveur, inchangé) : jamais sur un
    simple `propose`, qui n'est qu'un meilleur candidat — se tromper de dossier ferait chercher les
    pièces d'une vente dans celles d'une autre. Sans correspondance parfaite, le bouton « Relier un
    dossier du NAS » reste là, inchangé.
  - **« Rôle du notaire » et « Acte reçu par » retirés de la fiche** (doublon avec le bloc notaires
    juste au-dessus, signalé par l'étude). Le badge « Reçoit l'acte » de chaque ligne DEVIENT le
    contrôle (`basculerCoteInstrumentaire`), présent sur les deux lignes au même endroit pour que
    désigner l'un ou l'autre soit un geste symétrique. **Le rôle de l'étude n'est plus un choix
    séparé : il est DÉDUIT** (`deduireRoleNotaireDossier`) — notre étude du côté qui reçoit l'acte
    → instrumentaire, sinon participante — et `d.roleNotaire` continue d'être écrit dans le
    dossier, car tout le reste s'appuie dessus (checklist masquée pour un participant, relance à
    l'acquéreur, filtre « Rôle » du Suivi). `alerteRoleNotaireDossier` disparaît avec les
    sélecteurs : il ne peut plus y avoir de contradiction à signaler. **Repli conservé**
    (`basculerRoleEtude`, une ligne cliquable) pour le seul cas où rien n'est déductible — notre
    étude n'est reconnue dans aucun des deux noms, ou personne ne reçoit encore l'acte : sans lui,
    un dossier en participation serait devenu impossible à marquer comme tel. Le sélecteur
    `#f-role-notaire` du wizard n'est PAS touché : à la création, le bloc notaires n'existe pas
    encore, il n'y a donc aucun doublon.
  - **« Maître » devant les noms de notaires** (`libelleNotaire`) : ajouté à l'affichage et non à
    la détection, `RE_NOTAIRE` s'ancrant justement sur ce mot pour trouver le nom (qu'elle ne
    capture donc jamais). Jamais doublé sur un nom déjà saisi « Maître X » à la main.
  - **Les lignes de « Échéances des 7 prochains jours » ouvrent le dossier** : chaque ligne devient
    un `<button>` qui appelle `ouvrirDossierDepuisDashboard()` — le même chemin que « Actions
    urgentes » et que la recherche du Tableau de bord, pas une seconde implémentation.
  - **Garanties du prêt : lues dans le seul paragraphe « GARANTIES » de l'offre**
    (`RE_TITRE_GARANTIES`/`extraireParagrapheGaranties`), et non plus dans tout le document —
    demandé par l'étude, qui a aussi fixé les quatre réponses possibles. Le reste d'une offre parle
    abondamment d'hypothèque et de caution à d'autres titres (conditions générales, frais,
    information précontractuelle) : les y chercher remontait des garanties qui ne sont pas celles
    de CE prêt. Les quatre réponses sont un cumul des clés existantes, plus une nouvelle
    `sansGarantie` — **qui n'est posée que si le paragraphe existe ET n'énonce aucune garantie
    connue** : ne pas trouver de paragraphe n'est pas « sans garantie », et la fiche n'affiche
    alors rien plutôt qu'une affirmation fausse. Deux mises en page acceptées (titre seul sur sa
    ligne, ou « GARANTIES : » suivi du contenu), titres numérotés tolérés (« Article 7 - GARANTIES »),
    et le deux-points est obligatoire dans le second cas — sans quoi « les garanties sont acquises
    au prêteur » au fil d'une clause ouvrirait un faux paragraphe.
    **Deux pièges rencontrés en écrivant ce code** : `source.indexOf('\n', debut)` retombait sur le
    saut de ligne PRÉCÉDANT le titre (le paragraphe avalait alors la section suivante en entier) —
    on repart désormais de la fin du match ; et les anciens tests de `detecterGarantiesPret`
    nourrissaient une phrase isolée sans paragraphe, c'est-à-dire exactement le comportement que
    l'étude demande de supprimer : ils ont été réécrits, pas contournés.
  - **Badge « Alpha » au-dessus de « Connecté »**, les deux empilés dans un seul bloc en haut à
    droite (`.sidebar-etat`). Repassé dans le FLUX et non plus en absolu : à deux lignes, le bloc
    absolu venait se poser par-dessus le mot CLAIRE — constaté en capture d'écran.
  - **Passe d'alignement**, bornée aux surfaces concernées (sidebar, Tableau de bord, fiche) et
    appuyée sur les registres déjà documentés dans ce fichier plutôt que sur des choix nouveaux :
    un seul registre d'étiquette de section (`.dash-section-titre` passe aux valeurs de
    `.section-eyebrow`, 10px/0.1em/--muted — il en formait un second, à 13px, juste à côté des
    libellés de tuiles KPI qui suivaient pourtant déjà le bon) ; un seul rayon de carte de contenu
    (10px, comme `.kpi-tile`/`.calc-card`/`.panneau-revision` — `.dashboard` était à 6px et
    `.actions-urgentes-vide` à 8px, trois rayons différents sur le même écran) ; le titre du widget
    « Échéances des 7 prochains jours » passe AU-DESSUS de sa carte comme celui d'« Actions
    urgentes » (c'est la colonne entière qui se masque désormais, pour ne pas laisser une étiquette
    orpheline) ; les cinq tuiles KPI tiennent sur une seule ligne jusqu'à 1150px au lieu de 1300px,
    où elles retombaient en 3+2 avec un trou. **Piège CSS corrigé au passage** : un `<button>` en
    `display:flex` garde une largeur au CONTENU sous Chromium (c'est un contrôle de formulaire, pas
    un bloc), et `width:100%` combiné aux marges négatives décalait la ligne sans l'élargir — le
    filet et le survol s'arrêtaient 8px avant le bord droit de la carte. Mesuré au
    `getBoundingClientRect` avant/après : la ligne est maintenant à 9px symétriques des deux bords.
  - Tests : 6 nouveaux (`tests/notaires.test.js` pour la déduction du rôle et « Maître » ;
    `tests/dossier-local.test.js` et `tests/offre-pret.test.js` pour les garanties par paragraphe).
    Suite racine 312 → 317, suite serveur inchangée (97). **Vérifié dans un vrai Chromium** (serveur
    réel, clair et sombre, desktop et 400px) : adresse identique entre les étapes 2 et 4, saisie
    manuelle préservée, deux sélecteurs bien disparus de la fiche, rôle affiché « déduit », badge
    actif d'un seul côté, garanties cumulées affichées, Alpha au-dessus de Connecté sans
    chevauchement, clic sur une échéance ouvrant le bon dossier, aucune erreur JS, aucun
    débordement horizontal en mobile.

- **Lot de sept demandes, dont un vrai bug de calcul d'échéance**, traitées indépendamment :
  - **Bug corrigé : une condition de prêt exprimée en délai n'était plus calculée, et le panneau se
    contredisait.** Signalé par l'étude avec la capture des deux lignes affichées l'une sous
    l'autre : « Calculée : 60 jours depuis la signature. » ET « Délai trouvé, mais son point de
    départ n'est pas une date figurant dans l'acte : à déterminer. » Deux causes cumulées :
    - `pointDepartDepuisAncre()` classait le délai sur l'ancre TRONQUÉE, c'est-à-dire ce qui suit
      le connecteur (`MOTIF_ANCRE_DELAI`) — or ce connecteur consomme justement l'article dont les
      motifs de `POINTS_DEPART_CONNUS` ont besoin : « de la » avale le « la » de « la promesse »,
      « à compter des » le « des » de « des présentes », « du » celui de « du compromis ». Le point
      de départ retombait donc sur `inconnu`, réputé non calculable, et l'échéance n'était jamais
      calculée alors qu'elle part bien de la signature de l'acte importé. La classification se fait
      désormais sur la clause ENTIÈRE (`m[0]`), et le motif `signature` accepte les formes nues
      (`\bcompromis\b`, `\bpromesse\b`, `\bsignature\b`, `avant-contrat`). Quand plusieurs points
      de départ matchent (« dans les deux mois de la réalisation de la condition prévue au présent
      compromis »), **le premier rencontré décide** — c'est celui que le connecteur introduit, le
      reste n'est qu'un complément de phrase ; sans cette règle, l'élargissement ci-dessus aurait
      transformé ce délai-là en délai depuis la signature.
    - Même le point de départ corrigé, `construireDatesMetier()` LAISSAIT TOMBER le délai :
      `detecterDatesDepuisTexte()` (dont les motifs exigent « à compter de » / « au plus tard dans
      les ») ne produit pas de candidate pour « dans un délai de 60 jours DE LA promesse », et la
      branche de repli ne traitait que les délais NON calculables. Elle calcule maintenant la date
      (`calculerDateEcheance` depuis `dateCompromis`) avant de se rabattre sur le cas « point de
      départ inconnu ». `appliquerExtractionAuFormulaire()` reporte en plus les dates de l'objet
      d'extraction dans `#f-pret`/`#f-acte`/`#f-ventebien` **quand le champ est vide** : sans ça,
      une date ainsi calculée s'affichait dans le panneau mais n'atteignait ni le formulaire ni le
      dossier enregistré (le chemin historique, les chips, reste inchangé et prioritaire).
    - Affichage : `libellePointDepart()` nomme le point de départ réel au lieu d'écrire « depuis la
      signature » quel que soit le cas (c'est cette phrase figée qui contredisait la raison juste
      en dessous), et la raison « Date calculée à partir d'un délai exprimé dans l'acte. » est
      supprimée — la ligne « Calculée : 60 jours depuis… » la disait déjà mot pour mot.
    - Quatre tests dans `tests/dates-metier.test.js` : les quatre tournures d'ancre qui échouaient,
      un point de départ réellement inconnu (qui doit RESTER non calculé — le correctif ne devait
      pas rendre tout délai calculable), la règle du premier point de départ, et les libellés.
  - **Bug corrigé : taper une date à la main dans « Ce que l'outil a compris » validait au premier
    chiffre de l'année.** Un `<input type="date">` émet `change` dès que ses trois cases forment une
    date valide : en tapant l'année, « 2 » donne l'an 0002, la valeur passe pour complète, le
    panneau se redessine et le focus est perdu. `dateIncompleteEnCoursDeSaisie()` écarte ces valeurs
    intermédiaires (année < 1900) dans `modifierDonneeRevision()` **et** dans
    `corrigerDateCompromis()`, qui avait le même défaut. L'année réelle a toujours quatre chiffres
    et est la dernière case saisie : la validation tombe donc naturellement en fin de frappe.
    `onchange` est conservé (voir son historique : `oninput` ferait perdre le focus à chaque touche).
  - **Les dates repérées passent dans un bloc replié SOUS le panneau de révision** : « Classées —
    Prêt / Acte / Vente / Autre » et « Non identifiées, désactivées par défaut » occupaient toute la
    hauteur au-dessus de « Ce que l'outil a compris », qui est pourtant ce qu'on vient lire en
    premier. Simple `<details class="chips-repliable">` (fermé par défaut) dans `index.html` — rien
    n'est perdu, le classement d'une date se corrige toujours là, une fois le bloc déplié.
  - **Vue « Échéances » : colonnes alignées d'une semaine à l'autre.** Chaque groupe est un
    `<table>` distinct : en largeur automatique, chacun se calait sur SON contenu et une date ou un
    libellé plus long décalait toute la colonne par rapport aux semaines voisines. `<colgroup>` +
    `table-layout: fixed` (date 160px, type 196px, nom auto, responsable 148px) — vérifié par mesure
    des `getBoundingClientRect` de la première ligne de chaque groupe : positions identiques.
  - **« Le vendeur doit justifier de l'origine trentenaire » n'est plus une obligation du vendeur**
    (`trentenaire` ajouté à `EXCLUSION_ENGAGEMENT_RE`) : clause de style de quasiment tous les
    avant-contrats, et l'établissement de cette origine relève du travail du notaire sur le titre,
    pas d'une pièce à réclamer. Test dans `tests/engagements.test.js`.
  - **Badge « Alpha » remis à DROITE de « Connecté »** (`.sidebar-etat` repasse en ligne) — l'étude
    est revenue sur l'empilement demandé au lot précédent.
  - **Espace sous le panneau qui précède le bouton « Ajouter une obligation du vendeur »**
    (`.ajout-engagement-btn { margin: 14px 0 0 }`) : sans marge propre, le bouton se collait au bloc
    précédent (« Diagnostic du dernier parcours » quand aucune analyse juridique ne s'intercale).
  - Vérifié dans un vrai Chromium (serveur réel, clair et sombre) : délai « de la promesse » calculé
    et reporté dans le champ avec la case cochée, année incomplète ignorée puis date complète
    acceptée, chips repliées sous le panneau, colonnes des deux groupes de semaines alignées au
    pixel, marge du bouton mesurée, aucune erreur JS. `npm test` : 322 tests racine, 97 serveur.

- **Import d'un acte AUTHENTIQUE : cinq défauts, tous reproduits sur le PDF réel fourni par
  l'étude** (« Copie AAE PROMESSE DE VENTE … », 41 pages, promesse reçue par notaire). L'étude
  signalait quatre symptômes — nom de dossier « GOSSART / RECU », prix de 450 000 au lieu de
  92 000, aucune date d'obtention de prêt, PDF coupé page 4. **Méthode : extraire le texte page par
  page et rejouer les fonctions de l'outil dessus**, plutôt que relire les regex. Les quatre
  symptômes sont apparus du premier coup, et trois d'entre eux n'en formaient qu'un.
  - **La coupe page 4 causait le prix ET la date de prêt.** `estDebutPageAnnexe()` tolérait le
    marqueur d'annexe dans les 120 premiers caractères d'une page. Or cette trame pose le mot
    « ANNEXE » seul après CHAQUE phrase citant une pièce jointe, et la page 5 s'ouvre par un titre
    court suivi d'une phrase : « Plans des lots / Une copie des plans … est annexée. ANNEXE » — le
    renvoi tombait dans la fenêtre et coupait tout le document dès la page 4. Le prix (page 9) et
    la condition suspensive de prêt (page 12) n'étaient donc jamais lus. Le marqueur doit désormais
    OUVRIR la page (`MAX_DEBUT_PAGE_ANNEXE`, 12 caractères), après retrait du numéro de page
    (`texteSansNumeroDePage`, qui profite aussi à `RE_TITRE_PIECE_JOINTE`, jusque-là ancrée sur un
    `^` que le numéro de page suffisait à faire échouer). La branche « page courte » est conservée.
  - **Le nom du dossier prenait celui du NOTAIRE.** Un acte authentique s'ouvre par la comparution
    des notaires, qui se désignent eux-mêmes par la partie qu'ils assistent : « Notaire assistant le
    PROMETTANT », « … assistant le BENEFICIAIRE ». C'était la PREMIÈRE occurrence des mots-clés de
    rôle, donc celle que `qualitePourRole`/`nomsEtFinPourRole`/`extraireBlocPartie` retenaient — d'où
    « GOSSART » (notre propre étude) et « RECU » (le verbe de « A RECU le présent acte »).
    `chercherMentionPartie()` (nouvelle, utilisée par les trois) ignore toute occurrence précédée
    d'un marqueur de comparution (`RE_COMPARUTION_NOTAIRE`) dans les 45 caractères qui la précèdent
    — **fenêtre volontairement courte** : dans une comparution le marqueur colle au mot-clé, alors
    qu'à 110 caractères elle mordait sur la ligne précédente et faisait rejeter le vrai titre du
    bloc d'état civil, qui suit de peu la comparution du second notaire. Repli sur la première
    occurrence si elles sont toutes en contexte de comparution.
  - **Le patronyme n'était pas lu quand « né(e) » ne le suit pas.** Cette trame écrit l'état civil
    en deux temps : « Monsieur Jean-Loup André Roger BOURGUEIL, enseignant, et Madame …, demeurant
    ensemble à CHATEAUDUN. Monsieur est né à BUZANCAIS le 12 mai 1966. » `extraireNomsParNaissance`
    exige des majuscules juste avant « né » : aucune ici. Repli `nomApresCivilite()` : la première
    suite de majuscules qui suit la civilité, bornée à la virgule ou au point — **jamais au retour
    à la ligne**, un texte extrait d'un PDF étant coupé au gré de la mise en page (« et Madame
    Yvette Marie Annie \nFONTANEL »). Deux garde-fous : une suite introduite par une préposition de
    lieu est écartée (`RE_PREPOSITION_LIEU` — sinon « né à BUZANCAIS » et « demeurant à CHATEAUDUN »
    donnent une commune pour un nom), et une civilité introduite par un lien de famille aussi
    (`RE_LIEN_FAMILIAL` — « Divorcé de Madame Ana DA SILVA MARTINHO » faisait de l'ex-conjointe une
    acquéreuse).
  - **Le bloc d'une partie débordait sur la suivante** : les 1200 caractères par défaut avalaient
    « QUOTITES VENDUES : Monsieur BOURGUEIL et Madame FONTANEL vendent la pleine propriété », et ces
    deux noms se retrouvaient côté acquéreur. Deux bornes ajoutées : le titre de la partie suivante
    (`RE_TITRE_PARTIE_SUIVANTE`, en majuscules et sur sa propre ligne) et un dédoublonnage — un nom
    déjà attribué à une partie ne l'est jamais une seconde fois.
  - **Le prix n'était pas détecté du tout** (les 450 000 affichés venaient du modèle IA, pas des
    regex) : `PRIX_VENTE_RE` excluait le retour à la ligne « pour rester dans la même clause », ce
    qui revenait à exclure le cas normal — « le prix de QUATRE-\nVINGT-DOUZE MILLE EUROS » — et
    n'acceptait pas « EUR », la forme qu'emploient ces trames dans la reprise chiffrée. Le point
    reste exclu : c'est lui qui borne réellement la clause. **Piège rencontré** : `\b` placé après
    l'alternative complète cassait le cas `€` (un `\b` après un caractère non-mot ne peut pas
    matcher) — il ne va que sur l'alternative en lettres. Attrapé par les tests existants.
  - **L'adresse était tronquée au milieu de la voie** (« ORLEANS (LOIRET) 45000 11 Rue ») : même
    cause, `ADRESSE_BIEN_RE` s'arrêtait au retour à la ligne entre « Rue » et « d'Escures ». Seule
    la fenêtre qui SUIT le code postal est assouplie, toujours bornée par le point.
  - **Trouvé en vérifiant, non signalé : la date de « Signature de l'acte » était fausse** (19/07
    puis 30/09 au lieu du 09/10). Deux causes, corrigées sans ajouter d'exclusion clause par clause
    — ce que l'étude a explicitement demandé d'éviter :
    - `suggererEcheance()` classait « acte » toute date accompagnée du mot **« notaire »** et d'une
      formulation de délai. Or un acte notarié mentionne le notaire dans une clause sur deux : le
      versement de l'indemnité d'immobilisation (« … au plus tard dans les dix jours … en la
      comptabilité du notaire rédacteur ») passait ainsi pour la signature de la vente. La mention
      du notaire doit maintenant être liée à la SIGNATURE elle-même. « durée expirant » et
      « rendez-vous de signature » sont en revanche ajoutés comme signaux d'acte : sur une promesse,
      l'expiration de l'option EST la date butoir pour signer.
    - `meilleureCandidateEcheance()` départage désormais d'abord sur le **signal fort** du type
      (`SIGNAUX_FORTS_ECHEANCE`, une table par type d'échéance) : une clause qui NOMME l'échéance
      l'emporte sur une clause qui cite le mot au passage. Sans quoi « la faculté de substitution ne
      pourra être exercée que jusqu'au 30 septembre 2026 … au notaire chargé de rédiger l'acte de
      vente » l'emportait sur « la promesse est consentie pour une durée expirant le 9 octobre
      2026 ». Règle appliquée uniquement quand plusieurs candidates existent : elle ne peut rien
      changer là où il n'y a jamais eu d'hésitation.
  - **Résultat sur l'acte réel** : nom « BOURGUEIL & BOUSSELET / CHARPENTIER & GENESTOUX », prix
    92 000 €, signature 09/07/2026, prêt 09/09/2026, acte 09/10/2026, adresse complète, plus aucune
    coupure. Tests : 11 nouveaux (`parties`, `divers`, `dates`, `adresse`), suite racine 322 → 332.
    Les textes de test reprennent la STRUCTURE exacte de la trame avec des noms inventés — aucune
    donnée client n'entre dans le dépôt.
  - **Leçon, à rapprocher de celles déjà tirées ici** : un PDF réel vaut dix relectures de regex. Le
    même quart d'heure d'extraction page par page a donné les quatre causes, dont trois n'en
    faisaient qu'une — et deux défauts supplémentaires que l'étude n'avait pas encore vus.
- **Les deux simulateurs partent d'un champ vide** (`#calc-price`, `#prorata-montant`), demandé par
  l'étude : une valeur pré-remplie se prend pour un résultat. Le prorata affichait déjà un message
  tant qu'il manque une donnée ; le simulateur de provision, lui, retombait sur un prix de 1 € et
  affichait une provision d'allure crédible — il affiche maintenant « — » et invite à saisir un prix.
- **Quatre automatisations demandées après un bilan de session** (évaluation des dernières
  améliorations, puis « des ajouts pour automatiser des tâches et libérer du temps ») :
  - **Relance ciblée à l'IA locale sur un seul champ** : jusqu'ici, un champ resté « à vérifier »
    après les trois lectures automatiques (parties/bien/dates) ne pouvait être redemandé qu'en
    relançant les TROIS d'un coup — coûteux sur un CPU de bureau pour une seule donnée qui pose
    question. Un bouton « Redemander à l'IA » apparaît sur chaque ligne éligible du panneau « Ce que
    l'outil a compris » (`renderLigneRevision`) quand elle n'est pas encore vérifiée et reste vide
    ou en désaccord (`CLES_CIBLE_IA` — le rôle de l'étude en est exclu, il est déduit d'une règle
    métier, pas lu dans le texte). `redemanderChampIa()` appelle `POST /api/extraction-ia` avec
    `lot: 'cible'` + le nom du champ ; côté serveur, `server/src/extraction/cible.js` construit un
    prompt et une fenêtre de texte volontairement PLUS LARGE que celle d'un lot normal (un geste
    explicite sur un seul champ justifie ce coût, que les trois lots en parallèle ne pouvaient pas
    se permettre) et vérifie l'extrait cité comme les lots existants. `fusionnerCibleIa()` reprend
    la même règle que `fusionnerExtractionIa()` : la réponse devient une PROPOSITION avec bouton
    « Utiliser », jamais une écriture directe — une donnée déjà corrigée à la main n'est jamais
    rouverte. Tests : `tests/cible-ia.test.js` (8) et `server/test/extraction-cible.test.js` (12).
  - **Panneau « Qualité de l'extraction »**, dans l'écran « À propos » : agrège enfin
    `journalCorrectionsExtraction` (voir `diffCorrectionsExtraction`, plus haut), qui grossissait
    depuis le premier dossier créé sans que personne ne puisse voir quels champs l'extraction rate
    le plus souvent. `statistiquesCorrectionsExtraction()` (fonction pure, testable) groupe le
    journal par champ, du plus corrigé au moins corrigé, avec le dernier exemple observé ; un bouton
    « Vider ce journal » remet ce compteur à zéro (sans effet sur les dossiers déjà enregistrés).
    Toujours mesuré sur CE POSTE uniquement (localStorage), jamais transmis ni réutilisé pour
    réentraîner quoi que ce soit — même principe déjà appliqué à `correctionsApprises`. Tests :
    `tests/journal-corrections.test.js` (4).
  - **Surveillance périodique du NAS** (`server/src/nasWatch.js`) : un document qui vient d'arriver
    dans un dossier local relié ne se signalait jusqu'ici que silencieusement, au prochain
    "Revérifier" (automatique toutes les 5 minutes côté client pour un dossier non complet, ou
    manuel). Un tour serveur, toutes les 10 minutes (`demarrerSurveillanceNas()`, démarré dans
    `index.js` — jamais dans `app.js`, pour ne pas déclencher ce minuteur dans les tests qui montent
    l'app directement), reliste les PDF de chaque dossier actif relié (même parcours en largeur que
    `listerPdfRecursif`, aucune lecture de contenu) et compare à un inventaire mémorisé sur le
    dossier (`d.nasInventaire`, additif). Un fichier apparu pose `d.nasNouveaute = {at, fichiers}` ;
    `appliquerChangementsDistants()` (script.js), qui reçoit ce changement au sondage suivant,
    déclenche alors un toast — jamais au chargement initial de la page (`charger()` ne passe pas par
    cette fonction), qui aurait resignalé en rafale tout ce qui traînait déjà. Le drapeau s'efface
    de lui-même dès que `verifierDossierLocal()` retourne sur ce dossier (clic explicite ou
    revérification automatique), qui vient justement de le prendre en compte. `nasInventaire`/
    `nasNouveaute` sont exclus de `normaliserDossierImporte()`, comme les autres champs dérivés d'un
    scan du NAS. Tests : `server/test/nas-watch.test.js` (10, dont un vrai tour contre une
    arborescence temporaire) + un test d'import dans `tests/dossier-local.test.js`.
  - **Modèles d'email différenciés par motif de relance** : jusqu'ici, seul `ouvrirEmailRappel()`
    existait (un rappel générique de toutes les échéances, adressé à l'ÉTUDE elle-même via `d.email`
    — un pense-bête interne, pas une relance au client). Trois nouveaux modèles, adressés au CLIENT
    (`d.emailAcquereur`, comme `relancerSiOffreManquante()` déjà en place) : prêt manquant, pièce(s)
    à fournir (liste les pièces de la checklist encore non reçues), RIB (demande générique pour
    l'appel de fonds). `renderRelancesCiblees(d)` affiche un bouton par motif PERTINENT pour ce
    dossier (pas de bouton « Prêt manquant » sur un achat comptant ou une offre déjà reçue, pas de
    bouton « Pièces » si tout est déjà reçu, RIB toujours proposé) juste avant les trois actions
    génériques de la fiche — absent pour un notaire participant (même garde-fou que
    `relancerSiOffreManquante`), remplacé par un message d'invite si l'email de l'acquéreur n'est
    pas renseigné. Chaque envoi est journalisé dans l'historique du dossier. Tests :
    `tests/relances-email.test.js` (6).
  - Vérifié : `node -c script.js`, `npm test` aux deux endroits (379 tests racine, 120 côté serveur,
    tous verts) et plusieurs scripts de bac à sable (rendu de `renderRelancesCiblees()` sur les cas
    limites — sans email, rôle participant, prêt/pièces déjà complets — et des fonctions du panneau
    de révision qui touchent le DOM, `renderQualiteExtraction()`/`viderJournalCorrections()`/
    `redemanderChampIa()` en chemin de repli sans import en cours).

- **Rappels automatiques : remplacement du déclenchement manuel par un message privé Teams**,
  demandé par l'étude en discutant de la connexion de CLAIRE à Teams ("Au lieu d'avoir un e-mail de
  rappel avec un message automatique envoyé au collaborateur sur teams"). Trois décisions prises
  via `AskUserQuestion` avant d'implémenter, à ne pas rouvrir sans nouvelle demande : (1) un
  **message privé via un flux Power Automate**, pas un message de canal partagé ni une inscription
  d'application Azure AD/Microsoft Graph (déjà écartée pour les mêmes raisons lors des relances
  email/calendrier — aucun consentement administrateur requis, l'étude crée le flux elle-même) ;
  (2) ce mécanisme **remplace le déclenchement automatique** des rappels (qui n'existait
  simplement pas jusqu'ici — voir l'ancien "Ce qui n'a volontairement pas été fait" ci-dessous,
  aucune relance email automatique n'a jamais été câblée), le bouton "Envoyer un rappel par email"
  sur la fiche restant, lui, un envoi ponctuel à la main, inchangé ; (3) les adresses email Teams
  des 3 responsables et l'URL du flux sont saisies par l'étude elle-même dans un **nouvel écran
  "Réglages" de la sidebar**, plutôt qu'un tableau figé dans le code ou un fichier de configuration
  à éditer à la main — demande explicite de l'étude après avoir écarté mes deux premières
  propositions.
  - **`server/src/teams.js`** : `envoyerMessageTeams(webhookUrl, destinataireEmail, texte)`, un
    simple `POST` JSON `{destinataire, message}` vers l'URL du flux (`fetch` natif, timeout 15s,
    aucune dépendance npm supplémentaire — même choix que `llm.js` pour Ollama). Tout le routage
    vers la bonne personne est fait PAR LE FLUX ("Publier un message dans un chat ou un canal", en
    tant que Flow bot, dans un chat avec Flow bot, destinataire = contenu dynamique `destinataire`
    du corps de la requête) — CLAIRE ne connaît que l'URL du déclencheur HTTP.
  - **`server/src/parametresRepo.js`** (nouveau, table `parametres` ajoutée au schéma de `db.js`) :
    un blob JSON unique sous la clé `reglages` (`{teamsWebhookUrl, teamsActif,
    emailsResponsables}`), et non une colonne par champ — rien ici n'est filtré/trié par SQL
    ailleurs, même principe que le blob `data` des dossiers. Volontairement dans la BASE (partagée
    entre tous les postes), pas dans `config.json` (réservé aux réglages d'infrastructure posés une
    fois à l'installation, par qui installe l'exécutable — mot de passe, port, racine du NAS) :
    l'URL du flux et les emails sont une donnée métier que n'importe quel collaborateur doit pouvoir
    modifier depuis l'écran Réglages, pas un réglage machine. `assainirReglages()` protège la
    lecture d'un JSON malformé en base (jamais de plantage du job de rappels qui la relit toutes
    les 30 minutes) — testé avec un JSON invalide injecté directement en base.
  - **`server/src/jobs/rappels.js`** (nouveau dossier `server/src/jobs/`) : réutilise et étend
    l'infrastructure déjà anticipée dans le tout premier schéma de la base mais jamais câblée
    jusqu'ici — la table `reminder_log` (empêche un double envoi) et `config.intervalleRappelsMs`
    (30 min) existaient déjà sans aucun appelant. `toutesEcheances()`/`echeanceValidee()` sont une
    DUPLICATION volontaire de leurs équivalents dans `script.js` (même choix déjà documenté pour
    `buildEvent`/`icsDate` dans `routes/calendrier.js` — pas de mécanisme de build partagé entre
    navigateur et Node dans ce projet). **Seuils fixes `[15, 7]`, indépendants de `d.reminderDays`**
    (propre au seul export `.ics` manuel, vide sur un dossier sans condition de prêt) : un dossier
    `sansPret` doit quand même être rappelé pour sa signature d'acte ou sa vente préalable, ce que
    `d.reminderDays` ne permettrait pas. `executerTacheRappels(depot, db, parametresRepo,
    envoyerFn, aujourdHui)` (fonction testable, `envoyerFn` injectable — voir
    `server/test/helpers/faux-ollama.js` pour le même principe côté Ollama) : silencieuse tant que
    `teamsActif`/`teamsWebhookUrl` ne sont pas renseignés, marque chaque envoi réussi dans
    `reminder_log` (un échec n'est jamais marqué — retenté au tour suivant), signale un
    collaborateur sans adresse configurée sans bloquer les autres dossiers. Démarré uniquement dans
    `index.js` (jamais `app.js`, pour ne pas déclencher ce minuteur dans les tests qui montent
    `creerApp()` directement) — même principe déjà établi pour `demarrerSurveillanceNas()`.
  - **`server/src/routes/reglages.js`** : `GET/PUT /api/reglages` (lecture/écriture du blob) et
    `POST /api/reglages/tester-teams` (envoie `MESSAGE_TEST` à un responsable nommé). **Toujours
    avec les réglages déjà ENREGISTRÉS en base, jamais un formulaire pas encore validé côté
    client** — vérifie ce que le job de rappels utilisera réellement, pas un brouillon.
  - **Écran "Réglages"** (`#onglet-reglages`, lien de sidebar avec une nouvelle icône `settings`
    dessinée à la main, même recette 16×16 que le reste du jeu `ICONES`) : reprend le même gabarit
    que les autres onglets pleine page (`.dash-header`/`.calc-card`/`.calc-champs`, comme le
    simulateur de provision) — un seul système visuel, pas un second écran par fonctionnalité.
    `chargerReglages()`/`enregistrerReglages()`/`testerTeamsResponsable(nom)` (script.js) ;
    `RESPONSABLES` (nouvelle liste, reprise telle quelle de la liste fermée existante plutôt que de
    refactoriser les `<select>` déjà en place du formulaire/de la fiche, qui n'ont pas besoin de
    cette variable). Un bouton "Tester" par collaborateur affiche le résultat de l'envoi (succès/
    échec) directement sous son champ email. Une procédure de création du flux Power Automate,
    étape par étape, est intégrée directement dans l'écran (pas seulement dans `server/README.md`,
    que l'étude au quotidien ne lit pas) : l'écran doit se suffire à lui-même pour une équipe non
    technique.
  - Tests : `server/test/parametresRepo.test.js` (5, dont la vérification explicite que l'upsert
    SQLite `INSERT ... ON CONFLICT ... DO UPDATE` fonctionne bien avec `node:sqlite` — jamais
    vérifié avant ce chantier, seul risque technique identifié à l'écriture du dépôt),
    `server/test/teams.test.js` (5, faux serveur HTTP local), `server/test/rappels.test.js` (13,
    dont les seuils J-15/J-7 exacts, la non-répétition via `reminder_log`, un envoi en échec jamais
    marqué comme réussi), `server/test/reglages.test.js` (7, dont la vérification que
    "tester-teams" utilise bien l'email enregistré en base, jamais celui d'un corps de requête).
    Suite serveur 148 → 178 tests, suite racine inchangée (413 — ce chantier est entièrement côté
    serveur/Node, aucune fonction pure de `script.js` n'a été ajoutée : `chargerReglages()` et
    consorts dépendent du DOM/`fetch`, non testables depuis `tests/helpers/load-app.js`, même limite
    déjà documentée pour `verifierDisponibiliteAnalyseIa()`).
  - **Non vérifié en conditions réelles** : aucun flux Power Automate réel, aucun compte Teams/
    Microsoft 365 disponibles dans cet environnement de développement — le contrat JSON
    `{destinataire, message}` et le comportement "Publier en tant que Flow bot" sont documentés
    d'après la documentation officielle de Power Automate, à confirmer par l'étude en créant
    réellement le flux (voir `server/README.md`, section "Rappels automatiques vers Teams").

- **Copie systématique des rappels Teams à l'étude, et suppression définitive du rappel par email
  générique** — deux demandes de l'étude reçues ensemble, juste après la livraison du chantier
  Teams ci-dessus : « Il faut que je sois en copie aussi de tous les envois de rappel dans mon
  teams » et « Supprimer l'option rappel e-mail définitivement par cela ».
  - **`teamsCopieEmail`** (nouveau champ des réglages, `server/src/parametresRepo.js`) : une
    adresse Teams qui reçoit un DOUBLE de CHAQUE rappel envoyé, quel que soit le responsable
    destinataire — pas seulement les dossiers dont l'étude est elle-même responsable. Saisie dans
    l'écran Réglages (nouveau champ juste sous l'URL du flux, dans la même carte "Flux Power
    Automate" : c'est un réglage global, pas propre à un collaborateur, il n'a pas sa place dans
    la liste "Adresse Teams de chaque collaborateur"). `executerTacheRappels()`
    (`server/src/jobs/rappels.js`) envoie la copie **après** un envoi principal réussi, jamais à sa
    place ni si le responsable n'a pas d'adresse configurée (rien n'a alors été envoyé du tout à
    personne) — et jamais deux fois si la copie coïncide avec l'adresse du responsable lui-même.
    Un échec de la copie est consigné dans les erreurs du tour mais ne remet jamais en cause le
    marquage du rappel principal comme envoyé dans `reminder_log` : c'est ce marquage qui compte
    pour ne pas relancer le collaborateur concerné, la copie est secondaire.
  - **`ouvrirEmailRappel()` (le bouton "Rappel email" générique sur la fiche dossier, un brouillon
    `mailto:` manuel adressé à l'ÉTUDE elle-même) est retiré ENTIÈREMENT** — plus de fonction, plus
    de bouton dans `.dossier-actions` (qui ne garde plus que "Rappels (.ics)"/"Imprimer"), plus de
    champ `#f-email` ("Email de rappel") à l'étape "Finaliser" du wizard, plus de champ `d.email`
    sur le modèle du dossier (retiré de `ajouterDossier()` et de `normaliserDossierImporte()`).
    Le champ "Nom du dossier", qui partageait sa ligne avec "Email de rappel", occupe désormais
    seul toute la largeur de cette ligne (`grid-column: 1 / -1`) plutôt que de laisser un vide à
    droite. **Décision cohérente avec la copie ci-dessus** : ce bouton manuel n'avait plus de
    raison d'être dès lors que l'étude reçoit maintenant automatiquement, sur Teams, un double de
    chaque rappel envoyé — le geste manuel qu'il proposait est désormais couvert sans clic. Les
    trois modèles de relance ciblée par email (`renderRelancesCiblees()` — prêt manquant, pièces à
    fournir, RIB, adressés au CLIENT via `d.emailAcquereur`) restent inchangés : c'est un usage
    différent, non couvert par les rappels Teams (adressés au CLIENT, pas à l'étude, et pour un
    motif précis plutôt qu'un récapitulatif de toutes les échéances).
  - Tests : `server/test/parametresRepo.test.js` (+2, dont l'assainissement de `teamsCopieEmail`
    absent/vide), `server/test/reglages.test.js` (assertions existantes étendues au nouveau champ),
    `server/test/rappels.test.js` (+4 : la copie envoyée pour chaque rappel dû avec le même texte,
    aucune copie sans adresse configurée, aucun doublon quand copie = adresse du responsable, un
    échec de la copie qui n'empêche pas le marquage du rappel principal). Suite serveur 178 → 183 ;
    suite racine inchangée (413 — `ajouterDossier()`/`normaliserDossierImporte()` restent des
    fonctions de mutation non testables unitairement, même limite déjà documentée pour le reste de
    ce fichier).

- **La mention « AAE » exploitée à deux endroits : indice de forme authentique à l'import, et
  rubrique regardée en premier pour retrouver l'avant-contrat sur le NAS.** Après avoir donné le
  sens du sigle (Acte Authentique Électronique — voir la note en fin de « Ce qui reste ouvert »),
  l'étude a demandé de brancher les deux usages que j'avais proposés (« C'est deux point sont à
  intégrer »). Tout côté client, aucun changement serveur.
  - **Forme de l'acte** : `detecterFormeActe(texte, nomFichier)` accepte un second paramètre. Si
    l'en-tête du texte ne déclare rien (ni « par-devant Maître », ni « sous seing privé »), un nom
    de fichier portant « AAE » (`estNomFichierAAE`, mot entier — `BAAE` ne compte pas — ou « acte
    authentique électronique » en toutes lettres, testé sur le nom normalisé par
    `normaliserNomPourMotif`, donc underscores tolérés) rend `'authentique'`. **L'en-tête reste lu
    en premier** : une déclaration de forme dans l'acte vaut plus qu'une convention de nommage, et
    un en-tête « sous seing privé » l'emporte sur un nom « AAE » (testé). Conséquence directe :
    `zoneNotairesPourActe()` renvoie `'entete'` pour un tel fichier même quand le type d'acte est
    un compromis, donc les notaires sont cherchés en première page — là où un acte reçu par notaire
    les nomme (voir « la FORME de l'acte » plus haut). Le nom du PDF importé
    (`compromisNomFichierImporte`, déjà mémorisé pour « Ouvrir le compromis ») est propagé jusqu'à
    `construireExtractionRegex(texte, dateCompromis, dates, nomFichier)` via
    `recalculerExtractionRegex()`, à la branche notaires de `fusionnerExtractionIa()` (option
    `nomFichier`), et dans Outil 2 au nom du document principal et de la référence (uploadée ou
    récupérée du dossier lié).
  - **Avant-contrat sur le NAS** : `choisirAvantContratNas(fichiers, nomAttendu)` (fonction pure,
    `tests/nas-avant-contrat.test.js`) remplace les deux appels successifs à
    `chercherFichierParNom(d, 'compromis')` puis `'promesse'` dans `ouvrirCompromisTrouve()` et
    `recupererTextCompromisDossier()` (Outil 2). **Première version, corrigée le jour même** (voir
    l'entrée « Correction : l'avant-contrat n'est pas dans la rubrique AAE » plus bas) : elle
    regardait d'abord dans la rubrique « AAE », sur une déduction fausse de ma part — l'étude a
    précisé que cette rubrique contient les pièces réunies entre le compromis et la vente, jamais
    l'avant-contrat, rangé à la racine du dossier ou sous « SRU ». L'ordre de confiance actuel est
    décrit dans cette entrée corrective. `chercherFichierParNom()` reste utilisée par
    `ajouterPiecePersonnalisee()`.
  - Tests : 2 nouveaux dans `tests/notaires.test.js` (indice de forme, priorité de l'en-tête) et
    10 dans `tests/nas-avant-contrat.test.js` (réécrits par l'entrée corrective). Suite racine
    413 → 425, suite serveur inchangée (183).

- **Démarrage automatique de CLAIRE à l'ouverture de la session Windows**, demandé par l'étude
  (« Lorsque le PC se lance, ouvrir automatiquement le serveur et le logiciel avec le fichier
  vbs »). Les deux gestes du matin — lancer le serveur caché via `Lancer-CLAIRE-en-arriere-plan.vbs`,
  puis le logiciel — existaient déjà, le second étant fait par le serveur lui-même
  (`ouvrirNavigateur()` ouvre la fenêtre Chrome/Edge dédiée au démarrage) : il ne manquait que de
  déclencher le premier à l'ouverture de session.
  - **`server/src/scriptsAssistants.js`** (nouveau module) : `assurerScriptsAssistants(dossierExe,
    fs)` sort de `index.js` pour devenir une fonction pure testable (dossier + `fs` injectables,
    même principe que `resoudreConfigExecutable()`/`resoudreCheminNavigateurApp()` — `index.js`
    démarre un vrai serveur dès son import, impossible à charger depuis un test). Les deux scripts
    existants y sont repris à l'identique, et deux nouveaux s'ajoutent, toujours créés au premier
    démarrage en mode `.exe` et jamais écrasés s'ils existent :
    - **`Demarrer-CLAIRE-avec-Windows.vbs`** : pose un raccourci `CLAIRE-serveur.lnk` dans le
      dossier « Démarrage » de la session (`WScript.Shell.SpecialFolders("Startup")`, soit
      `shell:startup`) visant `wscript.exe` avec le chemin du lanceur en argument — pas le `.vbs`
      directement, dont l'ouverture dépendrait de l'association de fichiers du poste, alors que
      `wscript.exe` (`GetSpecialFolder(1)` = System32) existe partout. Refuse d'agir si le lanceur
      est absent (l'exe n'a jamais été lancé dans ce dossier). Une `MsgBox` confirme et nomme le
      script d'annulation.
    - **`Ne-plus-demarrer-CLAIRE-avec-Windows.vbs`** : supprime ce même raccourci. Ne touche pas à
      un serveur en cours (`Arreter-CLAIRE.bat` reste le geste pour ça).
  - **Démarrage AVEC la session, pas un service** : le raccourci ne joue qu'après la saisie du mot
    de passe Windows, sur le poste qui héberge le serveur. C'est exactement ce que l'étude a demandé
    (« avec le fichier vbs »), sans outil tiers ni droits administrateur — contrairement à NSSM,
    qui reste la réponse pour un serveur actif avant toute ouverture de session ou qui se relance
    seul après un plantage. **Les deux ne doivent pas être installés ensemble** : le second à
    démarrer trouverait le port occupé et s'arrêterait (chemin déjà géré par `serveur.on('error')`,
    qui écrit `erreur-demarrage.txt` — lancé sans fenêtre, c'est la seule trace). Noté dans le
    README, section « Service Windows », désormais présentée comme l'option avancée derrière ce
    démarrage de session.
  - **Textes affichés SANS accent** dans les deux nouveaux scripts (`MsgBox`, `Description` du
    raccourci) : wscript lit un `.vbs` en ANSI, et un « é » écrit en UTF-8 par `writeFileSync`
    s'afficherait en deux caractères parasites — le lanceur existant porte des accents dans ses
    seuls commentaires, jamais affichés, ce qui n'a pas ce problème. Un test le verrouille.
  - `index.js` journalise désormais les scripts effectivement créés (`assurerScriptsAssistants`
    retourne leurs noms), pour que le premier lancement dise à l'étude ce qui vient d'apparaître à
    côté de l'exe.
  - Tests : `server/test/scripts-assistants.test.js` (6 — les quatre scripts créés, aucun script
    existant réécrit, le raccourci vise bien le lanceur dans le dossier Démarrage via `wscript.exe`,
    le retrait supprime le même raccourci sans toucher au serveur, textes sans accent, CRLF).
    Suite serveur 183 → 189, suite racine inchangée (425). **Non vérifié sur un vrai poste
    Windows** (aucune machine Windows ici, comme pour tout le reste du `.exe`) : la syntaxe
    `CreateShortcut`/`SpecialFolders("Startup")` est celle documentée par Microsoft, mais
    l'ouverture effective du navigateur à l'ouverture de session (Chrome doit être prêt quand le
    serveur appelle `start`) reste à confirmer par l'étude — si la fenêtre du logiciel ne
    s'ouvrait pas alors que le serveur tourne, le point à regarder est `ouvrirNavigateur()`, pas le
    raccourci.

- **Correction : l'avant-contrat n'est pas dans la rubrique AAE, il est à la racine du dossier ou
  sous « SRU ».** L'étude est revenue sur ce qu'elle m'avait dit le matin même (« je t'ai mal
  informé sur un point ») : « AAE » dans le NOM d'un PDF signifie bien acte authentique — d'une
  promesse comme d'un acte de vente — mais le sous-dossier « 9 - AAE » sert à ranger les pièces
  constituées ENTRE la signature de l'avant-contrat et la vente (urbanisme, entretien…), qui
  deviennent ensuite les annexes de l'acte de vente. Le compromis ou la promesse signé est « soit à
  la racine du dossier client, soit dans le sous-dossier SRU ». La version livrée deux heures plus
  tôt cherchait donc l'avant-contrat exactement là où il n'est jamais.
  - **Ce qui reste juste** : l'indice de forme à l'import (`detecterFormeActe(texte, nomFichier)`
    / `estNomFichierAAE`) ne regardait déjà que le NOM du PDF, jamais sa rubrique — inchangé, seul
    son commentaire est corrigé. `estDansRubriqueAAE()` (qui n'était utilisée que par le choix sur
    le NAS) est supprimée.
  - **Nouvel ordre de confiance de `choisirAvantContratNas()`** : (1) le nom EXACT du PDF importé —
    en double, la copie à la racine ou sous SRU l'emporte ; (2) un nom disant « compromis » puis
    « promesse », d'abord à la racine ou sous SRU (`methode: 'emplacement-nom'`), puis n'importe
    où (`'nom'`) — l'avant-contrat de la VENTE PRÉALABLE de l'acquéreur porte les mêmes mots mais
    vit dans sa rubrique « 2 - Acquéreur », c'est l'emplacement qui départage ; (3) la rubrique
    SRU ne contenant qu'UN SEUL PDF (`'sru-seul'`) — pas d'équivalent pour la racine, qui peut
    contenir n'importe quoi. Un « compromis » rangé sous AAE ne l'emporte plus jamais sur un
    autre bien placé (testé). `estEmplacementAvantContrat(chemin)` = `estALaRacineDossier` ou
    `estDansRubriqueSRU` (mot entier `SRU` dans un segment de DOSSIER du chemin, antislashs et
    barres obliques acceptés). Le toast d'échec ne mentionne plus la rubrique AAE.
  - Tests : `tests/nas-avant-contrat.test.js` réécrit (10 tests — emplacements reconnus, chaque
    niveau de l'ordre, un compromis sous AAE qui ne gagne pas, un seul PDF sous SRU, la racine
    seule qui ne suffit pas). Suite racine inchangée à 425, serveur 189.
  - **Leçon** : « AAE » vaut pour la FORME (le nom du fichier) et pas pour l'EMPLACEMENT (la
    rubrique). J'avais déduit le second du premier sans le demander — même erreur que sur la
    zone des notaires (voir « la FORME de l'acte »), déduire une règle métier d'un indice au lieu
    de la faire confirmer. **Retenu pour plus tard** : la rubrique AAE est l'endroit où chercher
    les pièces d'urbanisme/d'entretien de la checklist, une information exploitable si la
    recherche par nom de fichier venait à remonter des faux positifs depuis d'autres rubriques.

**Ce qui n'a volontairement PAS été fait** (arrêté à la demande explicite de l'étude, pas un
oubli) — à reprendre uniquement si redemandé un jour :
- **Import automatique** des dossiers déjà enregistrés sur la version 100% locale (`main`) vers ce
  serveur : aujourd'hui, il faudrait les recréer à la main. La piste envisagée (un endpoint
  `POST /api/import` portant la validation de `normaliserDossierImporte()` côté serveur) reste
  praticable si demandée.
- **Relances email automatiques par SMTP direct** (`nodemailer`, présent dans
  `server/package.json` mais jamais câblé) : le déclenchement AUTOMATIQUE des rappels passe
  désormais par Teams (voir l'entrée ci-dessus), qui répondait directement à la demande de
  l'étude — un envoi SMTP direct resterait de toute façon un simple envoi brut, pas un vrai flux
  applicatif Outlook, sans accès Microsoft Graph. Le rappel générique par email
  (`ouvrirEmailRappel()`) a depuis été retiré définitivement (voir l'entrée ci-dessus) ;
  `relancerSiOffreManquante()`/`envoyerRelanceCiblee()` restent inchangés : de simples brouillons
  `mailto:` adressés au client pour un envoi ponctuel à la main, jamais automatiques.

Le CLAUDE.md de la branche `main` (tout ce qui précède cette section) reste la référence pour le
mode 100% local, qui n'a subi aucune régression de ce chantier.

- **⚠️ ARCHITECTURE PÉRIMÉE — les trois entrées qui suivent (« devient Outil 2 », « obligations du
  vendeur, mémoire des constats, dossier proposé », « n'analysait qu'une petite partie d'un
  document scanné ») décrivent l'Outil 2 à cinq passes Ollama, refait de zéro le 21/09/2026
  après un test de l'étude (« c'est inutilisable, c'est trop long, il n'a jamais réussi à me
  sortir quelque chose »).** Voir l'entrée « Outil 2 refait de zéro » en fin de section pour
  l'architecture réellement en service. Elles sont conservées parce qu'elles portent des décisions
  toujours valables (la vérification de citation à la place d'un score de confiance auto-déclaré,
  la mémoire des constats, la proposition de dossier, la couverture de lecture page par page) et
  des pièges déjà payés. Ce qui n'existe plus : `server/src/audit/`, les cinq passes,
  `POST /api/audit-acte/analyser`, `verifierObligationsVendeur()`, la taxonomie à dix types de
  documents et le sélecteur « Type de vente » de cet écran.

- **"Analyse approfondie (IA)" devient Outil 2 — Audit intelligent des actes notariaux**, sur
  demande explicite de l'étude : « Outil 1 : lecteur de compromis signé (l'existant, suivi
  administratif) — Outil 2 : analyse approfondie de projet ». L'ancien outil (un seul prompt Ollama,
  un seul type de document acte/annexe, `server/src/routes/analyseIa.js`) était pensé pour relire un
  compromis déjà signé ; Outil 2 audite un **projet** (compromis/promesse pas encore signé, ou
  projet d'acte de vente authentique) contre toutes les pièces disponibles, pour faire ressortir des
  incohérences et des erreurs — une vraie analyse juridique, pas une relecture superficielle. La
  demande est venue avec un cahier des charges détaillé en 19 sections (conservé dans l'historique
  de session, traité comme référence permanente pour ce chantier) : identification du bien, parties,
  prix/conditions, dates, diagnostics (jamais inventer une durée de validité), travaux (marqués
  PRIORITAIRE), autorisations d'urbanisme, garanties/assurances, titre de propriété, urbanisme,
  préemption, servitudes, copropriété, un mode dédié "projet d'acte de vente" qui ajoute la
  comparaison avec le compromis/la promesse déjà signé(e), une règle absolue "ne pas inventer" (4
  statuts : constaté / déduit / non trouvé / à vérifier), des citations obligatoires page par page,
  4 niveaux de gravité, et un format de sortie JSON précis. L'étude a explicitement délégué les choix
  d'architecture ("Fait ce que tu penses être le plus efficace") en ne posant que trois contraintes
  dures : un **sélecteur de mode explicite au dépôt** (jamais deviné), une sortie qui fait
  effectivement ressortir des incohérences, et une question sur "openlegi" (voir plus bas).
  - **Principe directeur, fil rouge de tout le chantier : déterministe quand c'est possible, IA
    seulement pour lire et citer.** Reprend la leçon déjà tirée sur `localiserExtrait()`
    (l'extraction Outil 1) : la "certitude" auto-déclarée d'un llama 8B n'est calibrée sur rien. Le
    cahier des charges demandait un champ `"certitude": 0.92` par constat — **remplacé, décision
    assumée et documentée comme un renforcement du §14 du cahier ("ne pas inventer") plutôt qu'un
    simple écart de format** : chaque constat porte `sourceVerifiee` (booléen), dérivé
    mécaniquement du fait que l'extrait cité par le modèle a été retrouvé LITTÉRALEMENT dans le bon
    document (même mécanisme que `localiserExtrait`/`verifierExtraits`, dupliqué côté audit dans
    `server/src/audit/fusion.js` — deux mondes navigateur/Node sans build commun, même choix déjà
    fait pour `extraction/extraits.js`). De même, la comparaison compromis → projet de vente sur les
    champs STRUCTURÉS (parties, prix, bien, cadastre, notaire, dates) est un **diff pur côté
    client**, jamais redemandé au modèle — et la durée de validité d'un diagnostic est un **calcul
    JS pur** à partir de la seule date que le modèle a identifiée, jamais calculée ni inventée par
    lui. Le "resume" (comptage par gravité) est lui aussi calculé côté serveur, jamais par le modèle
    — une synthèse générée par lui affirmerait des chiffres qu'il n'a aucun moyen de garantir
    cohérents avec le détail.
  - **Sélecteur de mode, taxonomie de documents et routage** (`index.html`/`script.js`,
    `#onglet-analyse-ia`, id HTML conservé pour limiter la casse malgré le changement de nom
    affiché "Audit des actes (IA)" dans la sidebar) : `<select id="audit-mode">` avec deux valeurs
    ("Projet de compromis / promesse de vente" / "Projet d'acte de vente notarié") pilote `auditMode`
    et l'affichage du bloc de liaison à un dossier (visible seulement en mode "acte"). Le sélecteur
    par fichier (`changerTypeFichierAnalyseIa`), auparavant limité à acte/annexe, porte désormais 10
    valeurs (`TYPES_DOCUMENT_AUDIT`) : `principal`, `reference_compromis`, `titre`, `diagnostic`,
    `urbanisme`, `facture`, `autorisation`, `decennale`, `copropriete`, `autre` — chacune détermine
    quelles passes reçoivent le document (`TYPES_PAR_PASSE`, `server/src/routes/auditActe.js`),
    gardant le contexte de chaque appel Ollama petit sur le CPU de bureau de l'étude (Core i5, sans
    GPU — contrainte déjà établie lors du chantier d'extraction Outil 1). `deviserTypeAnalyseIa()`
    devine "principal" pour le premier fichier (sauf s'il évoque un compromis en mode "acte", auquel
    cas c'est une référence) et "reference_compromis" pour un fichier compromis/promesse nommé
    ensuite en mode acte — premier jet volontairement simple (comme `motifNom` en son temps),
    toujours corrigible via le `<select>` de chaque ligne.
  - **Dossier CLAIRE lié, sans jamais l'écrire** (mode "acte" uniquement) : un champ de recherche
    (`rechercherDossierAudit`, même patron que `renderRechercheDashboard` du Tableau de bord) permet
    de lier un dossier déjà suivi — `auditDossierLie`, jamais modifié, seulement lu. Deux bénéfices
    directs : (1) `referenceDepuisDossier(d)` fournit la comparaison structurée SANS RE-EXTRACTION,
    ses champs ayant déjà été vérifiés à la création du dossier ; (2) `recupererTextCompromisDossier(d)`
    va chercher le compromis/la promesse **directement sur le NAS déjà relié** (même mécanisme que
    le bouton "Ouvrir le compromis" : `d.compromisNomFichier`/`chercherFichierParNom`/`ouvrirPdfNas`)
    pour alimenter aussi les passes IA (travaux, urbanisme...) qui ont besoin du TEXTE, pas
    seulement des champs structurés — évite de forcer un second import manuel du même document.
    Silencieux en cas d'échec (nom introuvable, dossier non relié au NAS, PDF illisible) : la
    comparaison structurée reste alors disponible seule.
  - **Extraction page par page, nécessaire aux citations** (`lireTextePdfParPage()`, variante de
    `lireTextePdfVerification()` qui mémorise en plus les frontières de chaque page pendant la même
    lecture — celle-ci n'est pas touchée, ses appelants existants n'ont pas besoin de cette
    information). `extraireTexteFichierAnalyseIa()` l'utilise et stocke `entree.pages` ; le payload
    envoyé au serveur devient `{nom, type, texte, pages}` par document. Côté serveur,
    `pageDepuisIndexServeur(pages, index)` (dans `server/src/audit/fusion.js`, pendant de
    `pageDepuisIndexPages` côté client) convertit un index trouvé par `localiserExtrait` en numéro
    de page — le §15 du cahier ("chaque constat traçable via DOCUMENT/PAGE/EXTRAIT") s'applique
    désormais à N'IMPORTE QUEL document fourni, pas seulement au compromis en cours d'import comme
    c'était le cas pour Outil 1 (`pageDepuisIndex`, propre à un seul PDF en mémoire).
  - **Cinq passes serveur** (`server/src/audit/{prompts,normaliser,fusion,diagnostics}.js`,
    `server/src/routes/auditActe.js`), regroupant les 19 sections du cahier pour rester exécutable
    sur CPU : (1) **identification** (bien, parties, prix, dates, titre — une seule passe, toutes
    comparent les mêmes documents entre eux) ; (2) **diagnostics** (le modèle identifie SEULEMENT
    nature/document/date d'établissement/bien concerné — jamais une durée) ; (3) **travaux**,
    PRIORITAIRE comme demandé, toujours exécutée avant la 4ᵉ ; (4) **urbanisme, autorisations,
    garanties, préemption, servitudes** (regroupées : mêmes documents, reçoit en contexte les
    titres des travaux déjà détectés par la passe 3, pour orienter sa recherche d'autorisations sans
    lui faire relire les travaux eux-mêmes) ; (5) **copropriété**, SEULEMENT si le type de vente
    est "copropriete" (choisi, ou auto-détecté via `detecterTypeVenteCopropriete` sur le principal
    si laissé sur "Détection automatique") — inutile de solliciter le modèle sur une section qui ne
    concerne pas le dossier. Chaque passe est **isolée** (`executerPasse()`, try/catch) : l'échec
    d'une seule (JSON hors schéma deux fois de suite, seule relance permise par `genererJson`) ne
    prive pas l'étude des quatre autres, déjà calculées après plusieurs minutes — consigné dans
    `erreursPasses`, affiché comme tel plutôt que passé sous silence ou faisant échouer tout l'audit.
    `preparerDocumentsPourPasse()` tronque chaque document à 20 000 caractères puis l'ensemble d'une
    passe à 60 000 (un document entier omis plutôt que coupé en plein milieu si le plafond est déjà
    atteint).
  - **Format de sortie fidèle au §17 du cahier** : `{resume, constats, dates, diagnostics, travaux,
    urbanisme, preemptions, servitudes, copropriete, erreursPasses}`. Les passes 1 et 4 couvrent
    plusieurs sections chacune : le modèle classe chaque constat dans une `categorie` explicite
    (`IDENTIFICATION|PARTIES|PRIX|DATES|TITRE` pour la passe 1, `URBANISME|AUTORISATION|GARANTIE|
    PREEMPTION|SERVITUDE` pour la passe 4), et le serveur route chaque constat vers le bon tableau
    de sortie (`DATES`→`dates`, `PREEMPTION`→`preemptions`, `SERVITUDE`→`servitudes`, le reste→
    `constats`/`urbanisme`) — un seul appel Ollama, plusieurs sections de sortie, sans dupliquer de
    prompt. **`piecesManquantes` du §17 n'a PAS été implémenté dans cette première version** : sa
    version pure (diff entre documents déclarés à l'upload et engagements/documents déjà repérés
    par les regex existantes d'Outil 1, `detecterDocumentsAFournir`) est prévue mais reportée, faute
    de temps dans ce chantier — noté ci-dessous dans "Ce qui reste ouvert".
  - **4 niveaux de gravité (§16) sur seulement 3 couleurs déjà réservées** (`libelleGraviteAudit()`,
    script.js) : `CRITIQUE`→`dl-urgent` (rouge), `IMPORTANT`→`dl-pret` (ambre, icône
    `alert-triangle`), `A_VERIFIER`→`dl-pret` (même ambre, icône `info` — distingués par le texte et
    l'icône plutôt que par une 5ᵉ couleur non prévue dans la palette), `INFORMATION`→`dl-neutre`. Une
    absence de document n'est jamais transformée automatiquement en `CRITIQUE` (consigne explicite
    du prompt, `CONSIGNES_AUDIT`) — cohérent avec la mise en garde du §16.
  - **Diagnostics : calcul de validité en JS pur** (`server/src/audit/diagnostics.js`,
    `DUREES_VALIDITE_DIAGNOSTIC`) — reprend et complète les durées déjà en dur dans l'ancien prompt
    (DPE 10 ans, ERP 6 mois, termites 6 mois, électricité/gaz 3 ans) ; amiante/plomb/assainissement/
    mesurage sont volontairement laissés à "vérifier manuellement" (dépendent d'un résultat ou d'une
    décision locale, pas d'une durée fixe) plutôt que de deviner une règle non tranchée ici — même
    prudence que `PIECES_URBANISME` en son temps. `calculerValiditeDiagnostic()` ne calcule QUE si
    une date d'établissement a été identifiée ; sinon un statut dédié (`DATE_MANQUANTE`) plutôt
    qu'un silence.
  - **Comparaison compromis → projet de vente, §13, entièrement déterministe** (script.js,
    `comparerCompromisEtProjet(reference, projet)`, section "OUTIL 2 (AUDIT DES ACTES)") : reconstruit
    la référence et le projet dans la MÊME forme que `construireExtractionRegex()` produit déjà pour
    Outil 1 (aucune nouvelle fonction d'extraction), puis diffuse partie disparue/rôle changé/partie
    nouvelle (IMPORTANT/CRITIQUE), prix différent/désignation différente/cadastre différent
    (CRITIQUE — la désignation du bien ne peut pas être une coquille mineure), notaire instrumentaire
    différent/date différente (A_VERIFIER — un report peut être légitime). Ces constats sont injectés
    en tête de `corps.constats` côté client, AVANT même que la première passe IA ne réponde : résultat
    quasi instantané, sans coût Ollama. La partie en langage libre du §13 (déclarations des vendeurs,
    travaux, servitudes) reste du ressort des passes IA elles-mêmes : quand une `reference_compromis`
    est présente parmi les documents, les prompts des passes 1 et 3 reçoivent une consigne
    supplémentaire ("signale toute divergence avec le compromis fourni en référence").
  - **openlegi (connecteur Légifrance/PISTE/RNE-INPI/EUR-Lex), question posée par l'étude : pas
    construit dans ce chantier, décision expliquée à l'étude en conversation.** Utile seulement pour
    vérifier des faits STATIQUES (ex. la durée de validité réelle d'un diagnostic selon le Code en
    vigueur) via des requêtes génériques ne contenant JAMAIS de donnée client — jamais pour juger la
    validité d'une clause ou chercher de la jurisprudence, ce qui pousserait l'outil vers un avis
    juridique plutôt qu'une assistance à la relecture (contraire au §18). Introduit une dépendance
    réseau nouvelle (l'outil n'en a aucune aujourd'hui) et des identifiants PISTE à obtenir. Noté en
    "Ce qui reste ouvert", même traitement que "comparer au prix du marché" en son temps (ajouté
    puis retiré sur retour de l'étude) : à ne construire que sur demande explicite, jamais déduit
    d'une question ouverte.
  - Tests : `tests/audit-comparaison.test.js` (14, `comparerCompromisEtProjet`/`referenceDepuisDossier`/
    `pageDepuisIndexPages`), `server/test/audit-diagnostics.test.js` (10), `server/test/audit-fusion.test.js`
    (8), `server/test/audit-normaliser.test.js` (8), `server/test/audit-acte.test.js` (13, dont le
    routage par type, la troncature, et la route complète devant un faux Ollama — isolation d'une
    passe en échec, passe copropriété conditionnelle). `server/test/analyse-ia.test.js` (ancien
    outil) supprimé avec `server/src/routes/analyseIa.js` — remplacés, pas coexistants. Vérifié par
    scripts de bac à sable (rendu HTML échappé des constats/diagnostics/résumé, mapping des 4
    gravités, section vide → chaîne vide) faute de pdf.js/Ollama dans cet environnement de
    développement (même limitation déjà documentée partout ailleurs dans ce fichier). `npm test`
    vert aux deux endroits (393 tests racine, 148 côté serveur).
  - **Non vérifié en conditions réelles** : ni Ollama ni pdf.js ne sont disponibles dans cet
    environnement de développement — la qualité réelle des 5 passes sur de vrais projets d'actes, le
    temps total d'un audit sur le CPU de bureau de l'étude (jusqu'à 5 appels séquentiels), et le taux
    de citations non retrouvées restent à confirmer par l'étude avec Ollama installé.

- **Outil 2 : obligations du vendeur, mémoire des constats, dossier proposé** — trois demandes de
  l'étude après les schémas de fonctionnement des deux outils (« Il faudrait aussi un outil
  d'apprentissage pour l'outil 2 » ; « pour la relecture d'un projet d'acte de vente on vérifie si le
  vendeur a tenu ses obligations » ; « peut-être relier les dossiers rentrés dans l'outil 1 à
  l'outil 2 ? »). Quatre arbitrages demandés avant d'écrire une ligne, et obtenus : apprendre les
  constats **écartés ET confirmés** ; vérifier les obligations à partir du **dossier lié + des
  documents déposés** (pas du seul projet) ; **lecture seule** sur le dossier (un document déposé
  dans Outil 2 ne coche rien dans la checklist Outil 1) ; dossier **proposé, clic explicite** (jamais
  lié automatiquement). Trois chantiers, tous côté client, aucun changement serveur :
  - **Obligations du vendeur** (`verifierObligationsVendeur(d, documentsDeposes)`, section « OUTIL 2 »
    de script.js, testable) : croisement déterministe de trois sources déjà existantes — les
    engagements lus dans le compromis à la création du dossier (`d.analyseJuridique.engagements`,
    dont les documents reconnus alimentent la checklist via `PIECES_ENGAGEMENTS_AUTO`/
    `checklistPieces(d.typeVente, d)` filtrée sur `autoEngagement`), l'état de ces pièces sur le NAS
    (`d.pieces[cle] === 'recue'`, `d.fichiersTrouves[cle]`), et les documents déposés dans Outil 2
    (`TYPE_DEPOT_VERS_PIECE` pour un type sans ambiguïté — facture → facturesTravaux, décennale →
    garantieDecennale — sinon `motifNom` sur le nom de fichier, avec la même normalisation que le
    parcours NAS). Trois statuts : `tenue` (avec la preuve et sa provenance, dossier ou dépôt),
    `non_tenue` (IMPORTANT au plus — jamais CRITIQUE sur une simple absence, §16 du cahier),
    `a_verifier` (un engagement sans pièce type, « le vendeur fera réparer la toiture » : l'outil ne
    sait pas, il ne prétend pas savoir — la clause et sa page sont affichées pour la relire). Les
    manquements d'abord. La clause d'origine est retrouvée par `detecterDocumentsAFournir([phrase])`
    engagement par engagement. Section « Obligations du vendeur » en tête du rapport, avant les
    constats du modèle — c'est un résultat calculé, pas une suggestion ; un mode « acte » sans
    dossier lié affiche une invite à en lier un. Compte dans le résumé par gravité
    (`incrementerResumeAudit`, qui couvre aussi les constats de la comparaison structurée, jusqu'ici
    absents du comptage). Le cas sans dossier lié (dériver les obligations du seul compromis de
    référence déposé) reste ouvert — l'étude a choisi le dossier lié.
  - **Mémoire des constats** (`memoireAuditConstats`, clé `audit-constats-memoire`, section
    « apprentissage des constats d'Outil 2 » de script.js) : deux boutons sur chaque constat,
    « Écarter » et « Confirmer » (`decisionConstatAudit`), et l'état mémorisé affiché en clair au
    prochain audit — un constat déjà écarté est **replié** (`<details>`, jamais supprimé : le modèle
    se trompe, l'étude aussi peut s'être trompée une fois, et un constat qui revient sur un autre
    acte n'est pas forcément le même problème), un constat déjà confirmé remonte en tête de sa
    section avec un liseré vert. « Annuler » retire la décision (`oublierDecisionConstat`). Même
    mécanique de similarité que les corrections apprises d'Outil 1 (Jaccard sur mots ≥ 3 lettres,
    dates/nombres neutralisés), sur une empreinte **titre + premier extrait cité** (`empreinteConstat`)
    : l'extrait est du texte littéral de l'acte, stable d'un audit à l'autre sur une même trame, là où
    titre et description sont reformulés par le modèle à chaque appel. Seuil 0.5 (contre 0.6 pour
    les dates) : l'effet n'est qu'un repli ou un badge, jamais une décision prise à la place de
    l'étude. La dernière décision l'emporte (écarter puis confirmer = changer d'avis, pas cumuler).
    Fonctions pures testables (`decisionPourConstat`, `memoriserDecisionDans` prennent la mémoire en
    paramètre) ; `preparerRapportAudit` pose `uid`/`memoire` sur chaque constat et
    `dernierRapportAudit` permet de redessiner sans relancer l'audit.
  - **Dossier proposé depuis les parties du projet** (`proposerDossiersDepuisParties(parties,
    dossiers)`, testable) : dès que le document principal est lu en mode « acte », ses parties
    (`detecterTypeActe` + `detecterParties`, déjà en place) sont comparées aux noms ET aux `d.parties`
    des dossiers actifs — mots discriminants seulement (`MOTS_COMMUNS_NOM_DOSSIER` écarte civilités,
    qualités, « sci », « vendeur »…), score = nombre de patronymes en commun, les mieux classés en
    tête. Affichés sous le champ de recherche tant qu'il est vide et qu'aucun dossier n'est lié
    (`renderPropositionsDossierAudit`), recalculés à chaque lecture/retrait/changement de type du
    principal et à chaque bascule de mode. Une proposition, jamais une liaison : auditer contre le
    mauvais dossier ferait comparer deux ventes sans rapport — même prudence que le rapprochement
    NAS.
  - Tests : `tests/audit-obligations.test.js` (8), `tests/audit-memoire.test.js` (6),
    `tests/audit-proposition.test.js` (6) — suite racine 393 → 413. Rendu vérifié en bac à sable
    (constat avec/sans décision, écarté replié, confirmé, les trois statuts d'obligation avec
    échappement HTML, tri de section). **Non vérifié dans un vrai navigateur** : pdf.js et Ollama
    restent indisponibles ici, comme pour tout Outil 2.

- **Bug corrigé : Outil 2 (Audit des actes) n'analysait qu'une petite partie d'un document
  scanné.** L'étude a posé la question directement : « Comment le document peut être analysé
  après si seulement 3 pages sont lu ». `lireTextePdfParPage()` — utilisée à la fois pour les
  fichiers déposés dans Outil 2 (`extraireTexteFichierAnalyseIa`) et pour le compromis auto-
  récupéré d'un dossier lié (`recupererTextCompromisDossier`) — réutilisait telle quelle le repli
  OCR de `lireTextePdfVerification()` (`PAGES_OCR_VERIFICATION = 3`), pensé pour un usage
  totalement différent : `verifierDossierLocal()` n'a besoin que de RECONNAÎTRE un document par
  son titre (offre de prêt, pièce de la checklist), 3 pages y suffisent largement. Outil 2 doit au
  contraire ANALYSER l'intégralité d'un document pour y trouver une incohérence n'importe où dans
  le texte — un titre de propriété ou un diagnostic scanné de 20 pages n'était donc audité que sur
  ses 3 premières, en silence.
  - Nouvelle constante `PAGES_OCR_AUDIT` (alignée sur `PLAFOND_PAGES_VERIFICATION`, donc 60 pages
    comme la lecture texte) utilisée UNIQUEMENT dans `lireTextePdfParPage()` — `lireTextePdfVerification()`
    et son `PAGES_OCR_VERIFICATION` restent à 3 pages, strictement inchangés : le bon réglage pour
    son usage ne devait pas être remis en cause par un problème qui ne le concernait pas.
  - `lireTextePdfParPage()` renvoie désormais aussi `pagesLues`/`pagesTotal`/`viaOcr`/`tronque` en
    plus de `{texte, pages}` — un résumé de couverture, pas seulement la lecture elle-même. Propagé
    sur chaque entrée de `fichiersAnalyseIa` et sur le retour de `recupererTextCompromisDossier()`.
  - **Signalé à deux endroits, pour que la limite reste visible plutôt que silencieuse** :
    `libelleCouverturePages()` (fonction commune) alimente le badge de chaque fichier dans la liste
    d'upload (`statutFichierAnalyseIa()` — « Lu (p.12/12) » ou « Lu partiellement (p.60/90) » avec
    une icône d'alerte) et une nouvelle section `renderCouvertureAudit()` dans le rapport final,
    qui **n'apparaît que s'il y a quelque chose à signaler** (au moins un document tronqué) — sur
    l'immense majorité des audits, où tout est lu intégralement, cette section reste silencieuse
    plutôt que d'ajouter une ligne de bruit à chaque fois.
  - Coût assumé, documenté dans le commentaire du code : jusqu'à ~30 secondes par page
    (`DELAI_MAX_OCR`) sur un document entièrement scanné de plusieurs dizaines de pages, contre
    quelques secondes pour 3 pages — accepté explicitement par l'étude ("Oui" au plan proposé),
    cohérent avec le principe déjà établi qu'Outil 2 peut prendre plusieurs minutes par audit.
  - Vérifié par script de bac à sable (`tests/helpers/load-app.js`, pdf.js indisponible dans cet
    environnement de développement, comme documenté partout ailleurs pour Outil 2) : badge de
    fichier et section de couverture rendus correctement pour un document tronqué, section absente
    quand tout est lu intégralement, échappement HTML correct, aucun changement de comportement de
    `lireTextePdfVerification()`. `npm test` reste vert aux deux endroits (425 tests racine — le
    même nombre qu'avant, ces fonctions dépendant du DOM/de pdf.js et n'étant pas testables
    unitairement, même limite déjà documentée pour le reste d'Outil 2 ; 189 côté serveur, chantier
    entièrement côté client).
- **Lot de huit retouches d'interface, remontées pendant un test réel sur un Mac personnel** :
  - **Exemple du champ « Nom du dossier » corrigé** : le placeholder affichait « Ex. Dupont / 12
    rue de la Paix », un très vieux format mêlant nom et adresse — le champ adresse ayant depuis
    longtemps son propre champ dédié (`#f-adresse-bien`). L'exemple montre désormais le vrai format
    vendeur/acquéreur produit par `detecterNomDossier()` (« Ex. DUPONT / MARTIN (vendeur /
    acquéreur) ») — ce dernier séparait déjà correctement les deux parties par un « / », rien à
    changer côté extraction ; seul l'exemple affiché à l'écran était trompeur.
  - **Bouton de relance « Pièce(s) à fournir » retiré** de `renderRelancesCiblees()` (et
    `construireEmailRelancePieces()`/l'entrée `pieces` de `MODELES_EMAIL_RELANCE` supprimées avec
    lui) — jugé redondant par l'étude avec la checklist déjà visible sur la fiche. Restent « Prêt
    manquant » et « RIB ».
  - **Boutons de relance alignés sur la taille de « Rappels (.ics) »/« Imprimer »** :
    `.relances-boutons .action-rapide` (Prêt manquant, RIB) reprend désormais le `font-size`/
    `padding` de `.dossier-actions button` juste en dessous, au lieu de la petite pastille
    `.action-rapide` générique (11px) partagée avec « Revérifier »/« Ouvrir le compromis » ailleurs
    sur la fiche — ceux-là restent inchangés, seul le contexte des relances ciblées est concerné.
  - **Indicateur « Connecté »/« Hors ligne » déplacé de la sidebar vers l'écran « À propos »** :
    `#statut-serveur-badge` (toujours mis à jour par `majStatutServeur()`, code JS inchangé) vit
    désormais sous la tagline de la popup plutôt que dans un bloc séparé en haut de la sidebar —
    c'est un état technique de diagnostic, sa place est dans cet écran plutôt qu'affiché en
    permanence à l'écran.
  - **Badge « Alpha » réduit et déplacé à côté du logo « CLAIRE »**, dans `.sidebar-brand` — avant,
    il vivait empilé avec l'indicateur de connexion dans un bloc `.sidebar-etat` séparé (calé en
    haut à droite de la sidebar, supprimé avec ce chantier) ; désormais un simple repère discret
    (8px, contre 9px) à côté de la marque.
  - **Icône « Réglages » redessinée en vraie roue crantée** (`ICONES.settings`) : l'ancien glyphe
    (cercle central + 8 rayons, sans anneau) se lisait plus comme un soleil/astérisque qu'un
    engrenage — remplacé par un anneau + un trou central + 8 dents courtes, même grille 16×16/trait
    1.4 que le reste du jeu d'icônes.
  - **Bouton « Nouveau dossier » retiré de la sidebar** (`#tab-nouveau`/`.sidebar-cta`, ainsi que
    les règles CSS `.sidebar-cta` devenues mortes) : la création reste accessible via le bouton
    « + Nouveau dossier » déjà présent sur le Tableau de bord et sur le Suivi. `definirOnglet()`
    perd ses deux références à `tab-nouveau` (l'élément n'existe plus) ; `initIconesStatiques()`
    n'avait pas besoin d'être touchée, déjà gardée par un `if (el)`.
  - **Écran « À propos » élargi** (`.apropos-box`, 400px → 480px) : plus de place pour l'indicateur
    de connexion qui vient d'y être déplacé, et pour la liste « Historique récent »/« Qualité de
    l'extraction » déjà présentes.
  - Tests : `tests/relances-email.test.js` mis à jour (les deux tests de
    `construireEmailRelancePieces()`, fonction supprimée, retirés ; `MODELES_EMAIL_RELANCE` attendu
    sur ses deux motifs restants). Suite racine 425 → 423 tests, suite serveur inchangée (189,
    chantier entièrement côté client). Vérifié par lecture de code (aucune référence orpheline à
    `tab-nouveau`/`icon-nav-nouveau`/`sidebar-cta`/`sidebar-etat` dans script.js/index.html/
    style.css) plutôt que par capture d'écran — l'étude testait en direct sur son propre Mac
    pendant ce chantier et a pu vérifier elle-même le rendu réel.

- **Notaire de l'acquéreur en participation : relances routées vers son office, plus jamais vers
  l'acquéreur lui-même** — demandé par l'étude sur un cas de déontologie précis : quand un office
  DISTINCT du nôtre représente l'acquéreur (« en participation »/« en concours »), le notaire
  instrumentaire ne doit pas le contacter directement, les demandes doivent transiter par son
  confrère. `notaireParticipantRepresenteAcquereur(d)` (testable en théorie mais dépend de
  `estEtude()`, déjà couvert par les tests de notaires) détecte ce cas : `d.notaireAcquereur`
  renseigné et différent de notre étude — **indépendant** de `d.roleNotaire`/`d.coteInstrumentaire`
  (qui répondent à « qui reçoit l'acte », pas à « qui représente l'acquéreur ») : notre étude peut
  très bien être instrumentaire tout en ayant un confrère en face pour l'acquéreur, c'est
  exactement le scénario décrit. `emailDestinataireRelance(d)` bascule alors les trois relances
  ciblées (prêt manquant, RIB, provision — voir plus bas) et la relance automatique
  (`relancerSiOffreManquante`) vers `d.emailNotaireParticipant` (nouveau champ, texte libre, jamais
  deviné) au lieu de `d.emailAcquereur`.
  - **Nouveau champ sur la fiche** (`renderNotairesDossier`, dans la grille notaires) : « Email du
    notaire de l'acquéreur », affiché UNIQUEMENT quand `notaireParticipantRepresenteAcquereur(d)`
    est vrai — `changerEmailNotaireParticipant()` suit exactement le patron d'`affecterNotaire()`
    (historique + `sauvegarder`). `renderRelancesCiblees()` affiche un rappel explicite
    ("l'acquéreur est représenté par un office distinct...") quand ce cas s'applique, et son
    message d'invite (email manquant) distingue les deux destinataires possibles.
  - **Même règle appliquée dès l'étape "Finaliser" du wizard** (`majApercuPieces()`) : le champ
    "Email de l'acquéreur" se masque désormais aussi (en plus du cas déjà existant "notre étude est
    participante") dès que `cotesNotairesPourDossier(extractionActuelle.notaires)` montre un
    notaire de l'acquéreur distinct de notre étude — cohérent avec la demande explicite de l'étude
    ("il ne faut donc pas mettre son adresse email").
- **Nouveau bouton de relance « Provision + pièce d'identité »**, et nouveau champ « Agence
  immobilière » : demandés ensemble par l'étude. `construireEmailRelanceProvision(d)` confirme la
  réception de l'avant-contrat signé (« avec l'agence X » si `d.nomAgence` est connu, sinon
  formulation générique « avec votre agence immobilière »), demande la provision de 100,00 € et une
  copie de pièce d'identité, et ajoute une ligne sur l'offre de prêt UNIQUEMENT si la condition est
  encore active pour ce dossier (`!d.sansPret && d.offrePretStatut !== 'recue'`) — inutile de la
  réclamer sur un achat comptant ou une offre déjà reçue. Ajouté en tête de `MODELES_EMAIL_RELANCE`
  (avant « Prêt manquant »/« RIB »), toujours proposé dès qu'un destinataire est connu — c'est
  l'email de démarrage du dossier, le premier envoyé en pratique.
  - `detecterNomAgence()` (nouveau `AGENCE_RE`) : premier jet, comme `motifNom` en son temps —
    ancré sur une tournure d'intermédiation explicite (« par l'intermédiaire de l'agence... »,
    « négocié par l'agence... », « par l'entremise de... », « mandaté à l'agence... »), jamais sur
    le seul mot « agence » (trop ambigu : agence bancaire, agence France Travail...). Intégré au
    même pipeline que `emailAcquereur`/`adresseBien` (objet `champs` de
    `construireExtractionRegex()`, `appliquerExtractionAuFormulaire()`, `CHAMPS_REVISION`,
    `champRevision()`/`ecrireChampRevision()`) : apparaît donc aussi dans le panneau « Ce que
    l'outil a compris », éditable comme les autres champs. Nouveau champ `#f-nom-agence` à l'étape
    "Finaliser" du wizard, `d.nomAgence` sur le modèle du dossier (conservé à l'import, comme
    `adresseBien` — une lecture de l'acte, pas un statut dérivé d'un scan).
- **« VENTE » ajouté devant le nom de chaque dossier, à l'affichage uniquement** —
  `libelleDossierAffiche(d)` (= `'VENTE ' + d.nom`) est utilisée partout où le nom sert de TITRE
  visible (ligne de tableau du Suivi et de la vue Échéances, tiroir de fiche, résultats de
  recherche du Tableau de bord et d'Outil 2, widget "Échéances des 7 prochains jours", "Actions
  urgentes", fiche imprimée) — **jamais** `d.nom` lui-même, qui reste la valeur brute utilisée pour
  l'édition du champ (renommage), les emails, le nom de fichier exporté, l'historique et la
  correspondance de recherche (modifier ces usages-là aurait cassé la recherche/le renommage/les
  exports pour un simple ajout d'affichage).
- **Trois retouches visuelles indépendantes** :
  - **Titre "Analyse juridique du compromis" aligné sur "Pièces du dossier (...)"** : `.analyse-titre`
    (CSS) reprend exactement les propriétés de `.section-eyebrow` (10px/600/uppercase/letter-spacing
    0.1em/`--muted`) au lieu de son ancien style (14px/600/`--ink`) — un seul registre d'étiquette
    de section entre les deux blocs voisins de la fiche.
  - **"Outil 2" renommé "Lecture de projet"** : seul le petit intitulé au-dessus du titre de page
    (`.dash-eyebrow`, dans `index.html`) change — le titre `<h1>` "Audit intelligent des actes" et
    le lien de sidebar "Audit des actes (IA)" restent inchangés.
  - **Espace agrandi au-dessus et en dessous du logo CLAIRE** : `.sidebar-brand` passe de
    `padding: 6px 8px 2px` à `padding: 16px 8px 18px` — porté sur ce seul bloc (pas sur le `gap`
    général de `.sidebar`) pour ne pas espacer aussi le reste de la sidebar (nav, pied de page) sans
    raison.
- **Fiche dossier : panneau d'extraction déplacé au-dessus de l'historique, et titre "Exporter"
  ajouté au-dessus de Rappels/Imprimer** — les deux demandés ensemble. `renderExtractionDossier(d)`
  (déjà le fameux `<details>` "Ce que l'outil avait compris de l'acte", jusque-là positionné juste
  après "+ Ajouter une obligation du vendeur") est déplacé pour s'afficher juste avant le bloc
  Historique, après les boutons d'export. Un `<span class="section-eyebrow
  dossier-actions-titre">Exporter</span>` est ajouté avant `.dossier-actions` (Rappels .ics/
  Imprimer), même registre que "Relancer par email" juste au-dessus (`.dossier-actions-titre`
  reprend le schéma d'espacement 14px/6px de `.relances-ciblees`/`.relances-boutons`) — ces deux
  boutons n'avaient jusqu'ici aucune étiquette. Les deux nouveaux éléments sont ajoutés au filtre
  d'impression existant (`.dossier-actions-titre` aux côtés de `.dossier-actions`) — l'étiquette ne
  doit pas apparaître sur la fiche imprimée, cohérent avec les boutons qu'elle nomme.
  - Tests : `tests/relances-email.test.js` (+3 : le motif "provision" dans `MODELES_EMAIL_RELANCE`,
    mention de l'agence avec repli générique, ligne de rappel du prêt conditionnelle) et
    `tests/dates.test.js` (+3 : `detecterNomAgence` sur les tournures reconnues et son absence de
    faux positif). Suite racine 425 → 428 tests, suite serveur inchangée (189, chantier entièrement
    côté client). Vérifié par script de bac à sable (`tests/helpers/load-app.js`,
    `renderCarteDossier`/`renderLigneTableau`/`libelleDossierAffiche`) : champ email du notaire
    participant affiché seulement quand pertinent, bouton "Provision" présent dès qu'un email est
    connu, préfixe "VENTE" sur la ligne de tableau, ordre Exporter → extraction → historique
    confirmé par position dans le HTML généré.

- **Liste des pièces reçues/manquantes ajoutée au message de rappel Teams**, demandé par l'étude
  juste après la mise en service du job de rappels (voir son historique plus haut, section
  "Rappels automatiques vers Teams") : savoir qu'une échéance approche ne dit rien de ce qu'il reste
  à réclamer, il fallait déjà rouvrir la fiche pour ça.
  - **`server/src/piecesChecklist.js`** (nouveau) : duplication volontaire, côté serveur, d'un
    SOUS-ENSEMBLE de `checklistPieces()` (script.js) — même choix déjà documenté dans ce projet pour
    `buildEvent`/`icsDate` (`routes/calendrier.js`) et `toutesEcheances`/`echeanceValidee`
    (`jobs/rappels.js`) : pas de mécanisme de build partagé entre navigateur et Node. Ne reprend que
    les libellés (`cle`+`label`) de `PIECES_URBANISME`/`PIECES_AUTRES`/`PIECES_COPROPRIETE`/
    `PIECES_TERRAIN_AUTRES`/`PIECES_ENGAGEMENTS_AUTO` — jamais les `motifNom` (inutiles ici, la
    reconnaissance par nom de fichier reste l'affaire du parcours NAS côté client ; ce module ne
    fait que relire le statut déjà calculé sur `d.pieces`). `checklistPieces(typeVente, d)` reprend
    la même logique de composition (pièces retirées, pièces auto-détectées, pièces personnalisées)
    que son équivalent client. Volontairement **pas** de reprise de
    `clesChecklistDepuisDocuments()` (rétroactivité pour un dossier créé avant l'existence de
    `cleChecklist` sur `DOCUMENTS_VENDEUR_CONNUS`) : cas de compatibilité ascendante mineur, sans
    conséquence sur l'utilité du message pour l'immense majorité des dossiers, qui portent déjà
    `d.piecesEngagementsDetectees`.
  - `piecesRecuesEtManquantes(d)` : sépare la checklist du dossier en deux listes de libellés,
    « reçues » (`d.pieces[cle] === 'recue'`) et « manquantes » (tout le reste, y compris une pièce
    **jamais encore vérifiée** — absence de clé dans `d.pieces`, voir la convention documentée plus
    haut) — du point de vue du responsable relancé, une pièce jamais vérifiée est aussi une pièce à
    réclamer/confirmer, pas une anomalie à distinguer dans ce message. Rien pour un dossier au rôle
    « participant » (même garde-fou que `renderPiecesDossier()` côté client : la checklist ne
    s'affiche pas non plus sur la fiche pour ce rôle) ni pour un dossier/objet absent — jamais
    d'exception levée.
  - `calculerRappelsDus()` (`jobs/rappels.js`) calcule ces deux listes **une fois par dossier**
    (pas par échéance/seuil, ce sont les mêmes pièces quelle que soit l'échéance qui déclenche le
    rappel) et les attache à chaque rappel dû (`r.pieces`). `texteRappel(r)` ajoute alors deux
    lignes au message, sous l'échéance elle-même — `Pièces reçues (N) : ...` /
    `Pièces manquantes (N) : ...` — **uniquement si la checklist n'est pas vide** (jamais deux
    lignes "(0) : aucune" pour un dossier participant ou pour un `r` de test sans champ `pieces`,
    ce qui aurait ajouté du bruit sans rien dire).
  - Tests : `server/test/pieces-checklist.test.js` (8, dont chaque type de vente, le retrait/l'ajout
    de pièce, la séparation reçues/manquantes avec le cas "jamais vérifié", le rôle participant, les
    entrées vides) et `server/test/rappels.test.js` (+4 : `texteRappel` avec et sans pièces,
    `calculerRappelsDus` qui attache bien les deux listes, le message envoyé par
    `executerTacheRappels` qui les contient). Suite serveur 188 → 200 tests, suite racine inchangée
    (428, chantier entièrement côté serveur).

- **Bouton « Questionnaire de satisfaction » + archivage automatique**, demandé par l'étude :
  un clic doit à la fois préparer le brouillon d'email et clôturer le dossier, sans étape
  intermédiaire — la vente est alors terminée, plus rien à suivre.
  - `construireEmailQuestionnaireSatisfaction(d)` construit le sujet/corps. **Le texte est un
    modèle PROVISOIRE** : l'étude n'a pas encore fourni le texte définitif du questionnaire
    ("je te donnerai le modèle demain"). Le corps le signale explicitement
    (`[MODÈLE PROVISOIRE — à remplacer par le texte fourni par l'étude]`) pour qu'un envoi par
    erreur avant remplacement reste reconnaissable. **À faire dès réception du texte réel** : ne
    modifier QUE le `sujet`/`corps` de cette fonction, rien d'autre autour. Un rappel a été
    programmé pour le briefing du lendemain de cette entrée, précisément pour ce remplacement.
  - `envoyerQuestionnaireSatisfaction(id)` : construit l'email, journalise
    "Questionnaire de satisfaction envoyé" dans l'historique, passe `d.archive = true` avec une
    seconde entrée d'historique dédiée ("Dossier archivé automatiquement..." — distincte du
    message générique d'`archiverDossier()`, pour qu'on sache après coup POURQUOI ce dossier a été
    archivé), sauvegarde, redessine, puis ouvre le brouillon `mailto:` — même ordre que
    `envoyerRelanceCiblee()`, dont cette fonction reprend le squelette. **Destinataire :
    `d.emailAcquereur` directement, jamais `emailDestinataireRelance(d)`** — voir la correction
    ci-dessous, ce point a changé par rapport à la version livrée initialement.
  - `renderQuestionnaireSatisfaction(d)` (affichée juste après "Relancer par email" sur la fiche) :
    absente pour un dossier déjà archivé (l'action n'a alors plus de sens), pour un rôle
    participant (même principe que les relances ciblées — solliciter l'avis du client sur
    l'ensemble de la transaction reste un geste de l'instrumentaire), et pour un notaire de
    l'acquéreur distinct du nôtre (voir la correction ci-dessous). Sans email connu, une invite à
    le renseigner plutôt que le bouton, cohérent avec `renderRelancesCiblees()`.
  - **Décision volontaire : pas de popup de confirmation avant l'archivage**, contrairement à
    `archiverDossier()`/`supprimerDossier()` — l'étude a explicitement demandé un geste en un seul
    clic ("un clique... + archive automatiquement"), et l'archivage reste réversible en un clic
    ("Désarchiver") si déclenché par erreur.
  - Tests : `tests/relances-email.test.js` (+5 : le sujet/corps mentionnent le dossier et le
    caractère provisoire du texte, le bouton absent pour un dossier archivé ou un rôle
    participant, l'invite affichée sans email connu, le bouton affiché dès qu'un destinataire
    existe, le routage vers le notaire de l'acquéreur en participation — ce dernier cas a changé
    de sens depuis, voir la correction ci-dessous). Suite racine 428 → 433 tests, suite serveur
    inchangée (200, chantier entièrement côté client). `envoyerQuestionnaireSatisfaction()`
    elle-même n'est pas unitairement testable (dépend de `dossiers`, invisible depuis le contexte
    `vm` des tests — même limite déjà documentée pour `envoyerRelanceCiblee()`/`archiverDossier()`)
    ; vérifiée par un script Node ad hoc (bac à sable) qu'un id inconnu ne plante jamais (retour
    silencieux).
- **Correction, demandée aussitôt après : le questionnaire de satisfaction ne doit JAMAIS être
  proposé ni adressé au confrère.** ("Pas de questionnaire satisfaction pour le confrère".) Ce
  bouton avait été construit sur le même patron que les relances ciblées (`emailDestinataireRelance()`),
  qui routent volontairement vers le notaire de l'acquéreur quand il est en participation — bonne
  règle pour une relance administrative (prêt manquant, RIB, provision), mauvaise ici : ce
  questionnaire porte sur le ressenti du client envers NOTRE étude, le demander à un confrère n'a
  aucun sens.
  - `envoyerQuestionnaireSatisfaction(id)` : le destinataire est désormais **toujours
    `d.emailAcquereur` directement**, plus jamais `emailDestinataireRelance(d)`. Un garde-fou
    supplémentaire en tête de fonction (`notaireParticipantRepresenteAcquereur(d)` → retour
    silencieux) protège aussi un appel direct qui contournerait l'interface.
  - `renderQuestionnaireSatisfaction(d)` : le bouton (et son invite à renseigner un email) sont
    désormais **absents** dès que `notaireParticipantRepresenteAcquereur(d)` est vrai — avant, un
    email manquant affichait une invite à renseigner celui du confrère, ce qui n'a plus lieu
    d'être puisque l'action ne le concerne plus jamais.
  - Test mis à jour dans `tests/relances-email.test.js` : l'ancien test "route vers le notaire de
    l'acquéreur" est remplacé par "absent quand l'acquéreur est représenté par un notaire distinct
    (jamais adressé au confrère)". Suite racine toujours à 433 tests (un test réécrit, pas
    ajouté), suite serveur inchangée (200).
- **Deux nouvelles échéances (« Appel de fonds », « Rendez-vous de signature ») et validation
  manuelle généralisée à N'IMPORTE QUELLE échéance**, trois demandes traitées ensemble : « Rajouter
  une étape « Appel de fonds » juste avant signature de l'acte une fois que le dossier est complet.
  Permettre aussi de valider n'importe quelle date d'échéance et rajouter une catégorie :
  Rendez-vous de signature (indique la date du rendez-vous définitif de signature à l'office,
  parfois différent de la date butoir indiqué dans l'avant contrat qui est juste indicative) ».
  **Décision de cadrage, avant d'écrire une ligne** : les trois échéances déjà en place
  (`pret`/`acte`/`ventebien`) sont profondément couplées au pipeline d'extraction automatique
  (`suggererEcheance`, `CHAMPS_REVISION`, `construireExtractionRegex`, `controlerCoherence`, les
  chips du wizard, `optionsCategorie`/`changerCategorie`, `CLES_CIBLE_IA`) — les deux nouvelles
  échéances n'y touchent pas du tout : ce sont des dates purement manuelles, ajoutées/corrigées
  après coup sur un dossier déjà enregistré, jamais extraites d'un PDF ni recatégorisables entre
  elles ou avec les trois premières.
  - **« Appel de fonds »** : nouveau champ `d.appelFonds`, affiché juste avant « Signature de
    l'acte » dans la grille `.tabs` **uniquement quand `dossierEntierementComplet(d)` est vrai**
    (offre de prêt reçue ou achat comptant, ET checklist de pièces entièrement reçue, ou rôle
    participant) — la fonction existait déjà (elle sert à sauter le rescan périodique d'un dossier
    qui n'a plus rien à apprendre), il suffisait de la réutiliser comme condition d'affichage :
    demander une provision n'a de sens qu'une fois le dossier prêt à signer.
  - **« Rendez-vous de signature »** : nouveau champ `d.rendezVousSignature`, toujours affiché,
    juste après « Signature de l'acte » — la distinction demandée par l'étude entre la date BUTOIR
    de l'avant-contrat (indicative, lue dans le compromis, sert de garde-fou juridique) et la date
    RÉELLE du rendez-vous pris à l'office (souvent différente, décidée après coup avec le
    notaire/les parties). Les deux dates coexistent sur la fiche sans jamais se recatégoriser l'une
    vers l'autre.
  - `LIBELLES_CATEGORIE` étendu aux deux nouvelles clés ; nouvelle fonction
    `libelleEcheancePourHistorique(d, type)` (résout aussi les clés `autre-N`, absentes de
    `LIBELLES_CATEGORIE` puisqu'une échéance personnalisée porte son propre libellé) utilisée par
    `validerEcheance`/`devaliderEcheance` pour l'entrée d'historique.
  - **Validation manuelle généralisée** (`renderTab()`, bouton "Marquer réalisée"/"Annuler la
    validation") : jusqu'ici réservé à la seule vente préalable (`type === 'ventebien'`), la
    condition devient `dossierId && iso && modifiableManuellement` — n'importe quelle échéance avec
    une date renseignée peut être déclarée réalisée, y compris une échéance personnalisée
    (`cleEdition`, déjà calculée pour l'édition de date, sert aussi de clé de validation : `type`
    directement pour pret/acte/ventebien/appelFonds/rendezVousSignature, `autre-N` pour une entrée
    de `d.autres`). **Un seul garde-fou** : `modifiableManuellement = !(type === 'pret' &&
    offrePretRecue)` — une fois l'offre de prêt confirmée reçue via le parcours NAS, c'est ce
    statut qui fait foi (voir `echeanceValidee`), afficher "Annuler la validation" à cet endroit
    n'annulerait rien et laisserait croire à un bouton mort.
  - `echeanceValidee(d, type)` : la branche `'pret'` accepte désormais AUSSI le drapeau manuel
    (`d.offrePretStatut === 'recue' || d.echeancesValidees.pret`) — un dossier sans parcours NAS (ou
    dont le prêt est confirmé par un autre moyen) peut ainsi être marqué réalisé comme n'importe
    quelle autre échéance, sans que ce nouveau chemin n'entre en conflit avec le statut déjà en
    place (les deux signaux sont simplement additionnés par un `||`).
  - **Duplication serveur mise à jour à l'identique** (déjà documentée comme un choix assumé, ce
    projet n'a pas de mécanisme de build partagé navigateur/Node) : `echeanceValidee`/
    `toutesEcheances` dans `server/src/jobs/rappels.js` (rappels Teams J-15/J-7, désormais aussi sur
    l'appel de fonds et le rendez-vous de signature, et le prêt validé manuellement n'est plus
    rappelé) ; le tableau `standard` de `genererFluxIcs()` dans `server/src/routes/calendrier.js`
    (flux webcal, symétriquement étendu aux deux nouveaux types — cette route ne filtrait déjà pas
    sur `echeanceValidee` pour pret/acte/ventebien, gap pré-existant non corrigé ici, les deux
    nouveaux types suivent simplement le même comportement que leurs voisins).
  - `normaliserDossierImporte()` : `appelFonds`/`rendezVousSignature` conservés à l'import comme
    `pret`/`acte`/`ventebien` (une saisie de l'étude, pas un statut dérivé d'un scan) ;
    `echeancesValidees` était déjà générique (n'importe quelle clé à `true`), rien à changer là.
  - Fiche imprimée (`imprimerFiche()`) : `appelFonds` reprend la teinte neutre `--muted` (comme les
    échéances "autre"), `rendezVousSignature` reprend celle de `--acte` (dont il est la précision) —
    aucune couleur inventée pour l'occasion.
  - Tests : `tests/echeances-appel-fonds.test.js` (11, nouveau fichier — libellés d'historique,
    validation manuelle du prêt, visibilité pilotée par `dossierEntierementComplet`, rendu de
    `renderTab` sur les deux nouveaux types et sur une clé `autre-N`, absence du bouton mort quand
    le prêt est déjà auto-confirmé, couverture de `toutesEcheances`/`prochaineEcheanceDetail`/
    `normaliserDossierImporte`), `server/test/rappels.test.js` (+2), `server/test/calendrier.test.js`
    (2 tests existants adaptés au passage de 3 à 5 échéances fixes). Suite racine 433 → 444 tests,
    suite serveur 200 → 202. Vérifié en plus par un script Node ad hoc (bac à sable) : ordre réel
    des tabs dans le HTML généré (pret → appelFonds → acte → rendezVousSignature → ventebien →
    autres), confirmé correct.
- **Sidebar réorganisée en catégories, et système de notification "nouvelle pièce trouvée"** —
  deux demandes traitées ensemble, la seconde nettement plus structurante :
  - **Sidebar** (`index.html`) : les six liens existants sont regroupés sous trois en-têtes de
    catégorie (`.sidebar-nav-titre`, même registre que `.section-eyebrow` — 10px/0.1em/`--muted`,
    aucun style inventé) — "Tableau de bord" reste seul, sans en-tête, en tête de nav (c'est la vue
    d'ensemble, elle n'appartient à aucune catégorie) ; **DOSSIER** regroupe "Suivi des dossiers" et
    "Audit des actes (IA)" ; **OUTILS** regroupe "Simulateur de provision" et
    "Prorata & répartitions" ; **ADMIN** ne contient que "Réglages". Un simple réordonnancement +
    des `<span>` insérés entre les boutons existants : `definirOnglet()` ne dépend d'aucune
    structure/imbrication de ces boutons (uniquement des `getElementById` par id), aucun changement
    de ce côté.
  - **Notification "nouvelle pièce trouvée"** : jusqu'ici, une pièce qui passait à "reçue" pendant
    un parcours NAS (`verifierDossierLocal()`) se voyait seulement au prochain coup d'œil sur la
    fiche — rien ne le signalait activement. Distinct de la surveillance déjà en place côté serveur
    (`nasWatch.js`/`d.nasNouveaute`, voir son historique plus haut) : celle-ci ne sait détecter
    qu'un NOM DE FICHIER apparu sur le NAS (aucun test de `motifNom` côté serveur), un simple toast
    éphémère effacé dès que `verifierDossierLocal()` relit le dossier — le nouveau mécanisme sait
    PRÉCISÉMENT quelle(s) pièce(s) de la checklist (ou l'offre de prêt) viennent d'être trouvées, et
    le garde jusqu'à ce que la fiche ait été consultée.
    - `d.piecesNotifications` (nouveau champ, un tableau de clés — de checklist, ou le pseudo-cle
      `CLE_NOTIF_OFFRE_PRET` pour l'offre de prêt, qui n'est pas dans `checklistPieces`) : calculé
      par un diff AVANT/APRÈS dans `verifierDossierLocal()` (`piecesAvant`, un instantané de
      `d.pieces` pris avant le parcours, comparé à l'état final — l'offre réutilise
      `offreEtaitRecue`, déjà calculée pour le garde-fou de `relancerSiOffreManquante`). **Un seul
      diff par PARCOURS, jamais par pièce** : toutes les pièces nouvellement reçues lors d'un même
      appel sont ajoutées d'un coup à `d.piecesNotifications` — c'est ce qui garantit le groupage
      demandé explicitement par l'étude ("grouper les notifications si plusieurs pièces trouvées en
      même temps"), sans le moindre mécanisme de file d'attente à construire : le diff, fait une
      fois par parcours, produit déjà la bonne granularité. L'offre "à confirmer" n'est jamais
      comptée : rien n'est "reçu" tant que l'étude ou le modèle local n'a pas confirmé.
    - **Trois surfaces d'affichage, un seul composant visuel** (`.dot-label dl-success`, jamais un
      badge inventé — cohérent avec le principe déjà établi pour ce composant) :
      `majBadgeNotificationsSidebar()` (compteur numérique, `.sidebar-badge-notif`, pastille pleine
      verte — SEUL badge à fond plein de la sidebar, volontairement, pour rester le signal le plus
      visible) à côté de "Suivi des dossiers", mis à jour à chaque `render()` ;
      `tagNotificationsDossier(d)` ("N nouvelle(s) pièce(s)") sur la ligne du dossier concerné, dans
      le tableau (`renderLigneTableau`) comme dans la vue Échéances (`renderVueSemaines`) ; et une
      étiquette "Nouveau" sur la pièce elle-même dans `renderPiecesDossier()` (à l'intérieur de
      `.piece-item`) et sur l'offre de prêt dans le bloc `.tab-offre-pret` de `renderCarteDossier()`
      (`offreEstNouvelle`, testé sur `CLE_NOTIF_OFFRE_PRET`).
    - **Dismissal : à la FERMETURE du tiroir, pas à l'ouverture** (`fermerDossierDrawer()`, qui
      capture le dossier ouvert AVANT de remettre `dossierOuvert` à `null`) — nettoyer à l'ouverture
      aurait vidé `d.piecesNotifications` avant même le premier rendu du tiroir, empêchant le tag
      "Nouveau" de jamais s'afficher : "une fois VU" (l'étude) veut dire "après avoir eu l'occasion
      de le voir en consultant la fiche", pas "au moment d'y entrer".
    - **Teams, en réutilisant l'infrastructure des rappels d'échéance, pas un second mécanisme
      d'envoi** : `notifierNouvellesPiecesTrouvees(d, cles)` (script.js, fire-and-forget — un
      webhook Teams indisponible ne doit jamais faire échouer une vérification de dossier qui a déjà
      eu lieu et déjà mis à jour l'écran) appelle `POST /api/notifications/pieces-recues`
      (`server/src/routes/notifications.js`, nouveau routeur, monté dans `app.js` comme les autres),
      qui réutilise tel quel `envoyerMessageTeams()` (`teams.js`) et `parametresRepo.lireReglages()`
      — même client, mêmes réglages, même schéma de copie systématique à l'étude
      (`reglages.teamsCopieEmail`) que `executerTacheRappels()` dans `jobs/rappels.js`. Le serveur
      lui-même ignore la requête (`{ok:true, ignore:true}`) si les réglages Teams ne sont pas
      activés — le client n'a pas à le vérifier avant d'appeler la route, même principe déjà en
      place pour les rappels.
    - **Notification navigateur/Windows, opt-in, volontairement peu bavarde** : nouvelle case
      "Notifications sur ce poste" dans l'écran Réglages (`initReglagesNotifNavigateur()`/
      `basculerNotifNavigateur()`), stockée en **`localStorage`** (`CLE_LOCALSTORAGE_NOTIF_NAVIGATEUR`)
      et non dans `parametresRepo` côté serveur : la permission `Notification` du navigateur est
      déjà propre à ce poste/ce profil Chrome, un réglage partagé n'aurait aucun sens. La case
      reflète aussi l'état RÉEL de la permission (`Notification.permission`), qui peut avoir été
      révoquée depuis les réglages du navigateur sans passer par CLAIRE. `notifierNavigateurPieces()`
      ne déclenche une vraie `Notification` que si l'onglet **n'est pas déjà au premier plan**
      (`document.hidden`) — c'est le point central de la consigne explicite de l'étude ("un système
      complet mais pas trop redondant") : afficher une notification système par-dessus un onglet
      déjà regardé ferait doublon pur avec les trois indicateurs déjà visibles à l'écran (badge,
      ligne du Suivi, tag sur la fiche).
    - `d.piecesNotifications` initialisé à `[]` dans `ajouterDossier()` et remis à `[]` dans
      `normaliserDossierImporte()` — comme `pieces`/`fichiersTrouves`, un signal dérivé d'un scan du
      NAS de CE poste, sans intérêt (et potentiellement trompeur) une fois importé ailleurs.
  - Tests : `server/test/notifications.test.js` (8 — `texteNotificationPieces` pure, 401 sans
    jeton, 400 sur `dossierNom`/`pieces` manquants, Teams désactivé → `ignore:true` sans aucun
    envoi, responsable sans adresse → erreur listée sans envoi, un seul message groupant plusieurs
    pièces, la copie systématique dans les deux sens — envoyée, puis jamais dédoublée quand elle
    coïncide avec le destinataire principal) et `tests/notifications-pieces.test.js` (4 —
    `libelleNotificationPiece` sur le pseudo-cle de l'offre, sur une clé de checklist réelle, en
    repli sur la clé elle-même si elle a disparu de la checklist ; `tagNotificationsDossier` vide/
    singulier/pluriel). `totalNotificationsPieces()`/`majBadgeNotificationsSidebar()` ne sont pas
    unitairement testables (dépendent de `dossiers`, un `let` de premier niveau invisible du
    contexte `vm` des tests — même limite déjà documentée ailleurs dans ce fichier) ; vérifiées par
    un script Node ad hoc (bac à sable) qui appelle directement `renderPiecesDossier`/
    `renderCarteDossier`/`renderLigneTableau` sur un dossier fabriqué avec des `piecesNotifications`
    non vides — les trois tags "Nouveau" et le badge de ligne sont bien présents dans le HTML rendu,
    dans les deux occurrences attendues (une pièce + l'offre) sur la fiche complète. Suite racine
    444 → 448, suite serveur 202 → 210.
  - **Non vérifié en conditions réelles** : ni un vrai flux Power Automate ni un navigateur avec de
    vraies notifications système ne sont disponibles dans cet environnement de développement — le
    déclenchement effectif d'une notification Windows/Chrome (icône, son, centre de notifications)
    reste à confirmer par l'étude, comme pour Teams/Ollama/pdf.js déjà documentés ailleurs dans ce
    fichier.

- **Nouveau logo**, retenu par l'étude après une proposition soumise pour avis (voir plus haut,
  refontes visuelles successives) : un aperçu de trois pistes a été construit dans un artefact privé
  séparé pour comparaison, à partir d'une référence externe fournie par l'étude (une planche de
  marque "Enterline" — un monogramme en aplats géométriques anguleux façon ruban plié, dont la barre
  centrale de la lettre est entièrement remplacée par une coche, jamais de dégradé). Seule la
  **construction** de cette référence a été reprise (aplats plats, coche intégrée au monogramme,
  mot-symbole en sans-serif très gras), jamais ses couleurs (l'exemple est en noir et blanc) ni son
  identité — CLAIRE garde son bleu `--focus`/`--focus-hover` déjà validé lors des refontes
  précédentes. L'étude a choisi le concept "A" (bracket facetté, deux teintes) parmi les trois
  proposés.
  - **Nouveau motif** (`.brand-mark`, `index.html`, aux trois endroits où il apparaît — sidebar,
    écran de connexion, écran "À propos") : une échine verticale (teinte `--focus`) + deux bras qui
    s'ouvrent vers la droite, taillés en biseau (teinte `--focus-hover`) — évolution directe de
    l'ancien anneau ouvert en trait fin (même idée de forme ouverte à droite, mais en aplats épais
    plutôt qu'un tracé au trait). Une coche (même teinte `--focus-hover`) occupe exactement le creux
    central laissé par les deux bras, remplaçant ce qui aurait été la barre horizontale d'un "C" — le
    même principe que la référence fournie, appliqué à la forme déjà associée à CLAIRE plutôt qu'à
    une lettre différente.
  - **`icone.svg` (favicon/PWA)** reprend le même motif mais en aplat UNIQUE (une seule couleur
    `#2563EB`, comme l'ancien favicon) sur la tuile graphite pleine déjà en place (`#12181F`,
    inchangée) — un favicon a besoin de rester lisible en très petite taille quel que soit le fond de
    la barre d'onglets, un favicon ne peut pas dépendre des variables CSS `--focus`/`--focus-hover`
    (fichier séparé, sans accès à la feuille de style de la page) : même raisonnement déjà appliqué
    aux refontes précédentes du logo.
  - **Le mot "CLAIRE" devient "Claire"** (seule la première lettre en majuscule), aux trois mêmes
    endroits (`.brand-word`) — demandé explicitement par l'étude au moment de choisir le concept A.
    `.brand-word` n'a pas de `text-transform` en CSS (vérifié) : le texte HTML est la seule source,
    changer la casse dans `index.html` suffit, rien à toucher côté style.
  - Volontairement **pas étendu** aux autres mentions du nom "CLAIRE" dans l'outil (`<title>` de la
    page, textes descriptifs — "Ce que CLAIRE repère automatiquement", "Dossier CLAIRE déjà
    suivi"...) : la demande portait sur le logo (le mot-symbole à côté du mark), pas sur une
    campagne de renommage de toutes les mentions du produit dans l'interface — à étendre seulement
    sur demande explicite si l'étude le souhaite.
  - `npm test` reste vert (448 tests, aucune fonction pure modifiée — un changement purement visuel,
    HTML/SVG).

- **Logo : retour à la PREMIÈRE proposition (« concept A » du tout premier jeu de pistes, celui
  soumis avant que l'étude n'envoie la planche « Enterline »).** Après avoir vu le monogramme
  facetté en place, l'étude a préféré revenir en arrière : « je préfère finalement pour le logo la
  première version que tu m'as proposée (A), avant l'upload que je t'ai envoyé en exemple ».
  Confirmé par la capture de la sidebar demandée juste avant — à 30px, les aplats facettés se
  rejoignaient en un carré plein bleu, l'ouverture à droite (l'idée du « C ») avait disparu.
  - **Le motif retenu est l'ANCIEN anneau ouvert en trait fin, dont le seul petit trait horizontal
    de fermeture devient une coche** (`M27 23.5 L31.5 29 L40 17`, même `stroke-width: 1.8` et même
    `viewBox="0 0 48 48"` que le logo d'avant) : l'évolution la plus légère possible du logo déjà
    associé à CLAIRE, qui garde son anneau tout en introduisant le langage « coché = fait » déjà
    présent partout dans l'outil. Les trois `.brand-mark` d'`index.html` (sidebar, écran de
    connexion, « À propos ») reviennent à ce tracé ; l'anneau garde `--focus`, la coche
    `--focus-hover`, comme le trait qu'elle remplace.
  - **`icone.svg` (favicon/PWA) : le tracé ne pouvait PAS être repris tel quel.** Ce fichier a
    volontairement un trait bien plus épais que la version écran (18 sur un anneau de rayon 44,
    soit 0,41 du rayon, contre 1,8 sur rayon 15 = 0,12) pour rester lisible à 16px — voir son
    historique. À cette épaisseur, la coche de concept A (dont la pointe sort par l'ouverture de
    l'anneau, comme le faisait l'ancien trait droit) vient fusionner avec l'extrémité HAUTE de
    l'anneau : les deux demi-traits de 9px se recouvrent, et le tout se lit comme une flèche de
    rechargement, pas comme une coche. Constaté en rendant le favicon à 16/24/32/96px côte à côte,
    pas en relisant le SVG. Quatre variantes comparées visuellement (pointe sortante, coche
    intérieure en 18, coche intérieure en 15, sortie par le milieu du vide) : retenue la **coche
    entièrement à l'intérieur de l'anneau, en trait 15** (`M78 97 L92 112 L120 78`) — la seule qui
    se lise encore comme une coche à 16px sans toucher l'anneau. L'anneau lui-même
    (`stroke-width: 18`, couleur fixe `#2563EB`, tuile graphite `#12181F`) est inchangé.
  - **Le mot « Claire » n'est pas concerné** : la demande portait uniquement sur le symbole, la
    casse choisie la veille est conservée (confirmé explicitement par l'étude juste après —
    « laisse Claire, avec le C majuscule »).
  - **Badge « Alpha » rapetissé** dans la foulée, sur la même demande : `.sidebar-alpha-badge`
    passe de 8px/`padding: 1px 5px` à 7px/`padding: 0 4px` (letter-spacing 0.06em → 0.05em), soit
    36×13px au lieu de 42×16px à côté d'un mot-symbole de 60×35px — mesuré, pas estimé. La pilule
    (fond + bordure teintés `--focus`) est conservée : l'étude a demandé « plus petit », pas de
    retirer le repère.
  - **Le mot « ALPHA » n'était pas centré dans sa pilule, et « Claire » collait moins au logo** —
    deux retouches demandées juste après :
    - **Centrage vertical** : le texte est tout en capitales, donc la boîte du glyphe réserve sous
      la ligne de base une place pour les jambages (p, g…) qu'aucune lettre n'occupe — l'encre
      remonte d'autant dans la pilule. Corrigé par un `line-height: 8px` + un padding
      volontairement asymétrique (`3px 4px 0`), qui redescend le texte au centre optique sans
      changer la hauteur de la pilule (13px) ni sa largeur (36px).
    - **Piège de méthode, à retenir** : les métriques de la police lues via
      `TextMetrics.actualBoundingBoxAscent/Descent` en canvas annonçaient une encre DÉJÀ centrée
      (1px de marge en haut comme en bas dans la boîte de 7px) — donc « rien à corriger ». C'était
      faux. La mesure qui fait foi est celle des PIXELS RÉELS d'une capture : en agrandissant le
      badge (`deviceScaleFactor: 12`) puis en cherchant les pixels sombres du texte par rapport
      aux bords de la pilule, l'écart réel était de 3,25px au-dessus contre 6,00px en dessous. Ce
      contrôle par pixels est ramené à 4,25 / 4,00 après correction (et 6,08 / 5,92
      horizontalement, jamais touché). Pour tout problème de centrage fin de ce genre : mesurer
      les pixels du rendu, pas les métriques déclarées de la police.
    - **Rapprochement du mot et du symbole** : `.sidebar-brand` passe de `gap: 8px` à `5px`
      (écart symbole → mot mesuré à 5px au lieu de 8). Le badge reprend les 3px perdus via son
      propre `margin-left: 3px`, pour ne pas venir se coller au mot par effet de bord — le `gap`
      d'un conteneur flex s'applique entre TOUS les enfants, pas seulement les deux visés.
    - **Non vérifié avec la vraie police** : `fonts.googleapis.com` étant bloqué dans cet
      environnement de développement (limite déjà documentée plus haut), ce réglage a été mesuré
      sur la police de repli système, pas sur Inter. La cause (l'espace des jambages inutilisé par
      des capitales) est la même pour toutes les polices, mais le nombre exact de pixels peut
      différer d'une fraction de pixel avec Inter chargée — à confirmer par l'étude sur son poste,
      et à réajuster avec la même méthode (mesure des pixels) si le décalage se voit encore.
  - **Leçon, à rapprocher de celle déjà tirée sur les PDF réels** : une proposition de logo jugée
    sur un aperçu agrandi ne dit rien de son rendu à la taille réelle. Les deux fois (le facetté
    hier, la pointe de coche du favicon aujourd'hui), c'est le rendu à 16-30px qui a tranché —
    générer la capture À CETTE TAILLE fait partie de la livraison, pas d'une vérification
    optionnelle.
  - Vérifié dans un vrai Chromium (serveur réel, sidebar en clair et en sombre, favicon rendu à
    16/32/64px sur fond clair et sombre) ; `npm test` reste vert (448 tests, aucun code JS touché
    — uniquement HTML/SVG).

- **Lot de quatre demandes de l'étude (21/09 matin)**, traitées indépendamment :
  - **Les échéances de la fiche dossier sont classées par DATE**, de la plus proche à la plus
    lointaine (`echeancesOrdonneesFiche`, testable), au lieu de l'ordre fixe prêt → appel de fonds
    → acte → rendez-vous → vente préalable → personnalisées, qui ne disait rien de ce qui arrive en
    premier. Une échéance sans date n'a rien à classer : elle part en fin de liste, dans ce même
    ordre naturel (le tri de JS est stable) — les reléguer en tête ferait disparaître les vraies
    échéances sous des cartes vides. **Ne touche QUE l'affichage** : l'index passé à `renderTab()`
    pour une échéance personnalisée reste sa position réelle dans `d.autres`, c'est lui qui
    identifie l'entrée pour l'édition et la suppression (`supprimerEcheanceAutre`), pas son rang
    après tri — vérifié par un test dédié.
    - **Piège rencontré en écrivant les tests** : chercher un libellé d'échéance par `indexOf` dans
      le HTML produit retombe sur la MAUVAISE carte — les tabs recatégorisables (prêt/acte/vente
      préalable) embarquent un `<select>` qui contient les trois libellés en `<option>`. Il faut
      s'ancrer sur `<div class="tab-name">…</div>`.
  - **Champ « Email de l'acquéreur » sur la fiche**, au-dessus des boutons de relance
    (`renderEmailAcquereurDossier`/`changerEmailAcquereur`). L'adresse était déjà captée à la
    création du dossier — détectée par `detecterEmailAcquereur()` puis enregistrée par
    `ajouterDossier()` — mais elle n'était visible NULLE PART une fois le dossier créé : impossible
    de vérifier ce qui avait été retenu, de corriger une adresse fausse, ou d'en saisir une après
    coup autrement qu'en recréant le dossier ; un email manquant n'affichait qu'un message d'invite
    sans moyen d'y répondre. Jamais affiché quand l'acquéreur est représenté par un office distinct
    (c'est alors l'email du confrère qui sert, champ dédié dans le bloc notaires) — même règle
    déontologique que dans le wizard. `onblur` + Entrée qui valide, jamais `onchange` : la fiche se
    redessine à chaque modification, valider à chaque frappe ferait perdre le focus (même choix que
    le champ email du notaire de l'acquéreur). **Piège de spécificité CSS, sixième occurrence** :
    `.champ-email-relance input.input-classif` (élément + 2 classes) — un simple
    `input.input-classif` est à égalité avec la règle générique `input[type="email"]`, qui
    l'emporterait par son ordre dans le fichier.
  - **« Rendez-vous de signature » en vert, « Appel de fonds » coloré aussi.** Les deux échéances
    ajoutées après coup n'avaient aucune règle `.dot-label.dl-<type>` : leur pastille restait
    incolore dans le tableau du Suivi et la vue Échéances (rendues via `dl-${e.type}`),
    contrairement aux trois autres catégories. Le rendez-vous RÉEL passe au vert `--success`,
    distinct du teal `--acte` de la date butoir indicative — cohérent avec l'usage de `--success`
    ailleurs pour ce qui est acquis (pièce reçue, échéance réalisée). **Aucun jeton n'était libre
    pour l'appel de fonds** (`--pret` ambre, `--acte` teal, `--ventebien` bleu, `--success` vert
    tous pris, `--focus` réservé aux accents interactifs) : d'où un nouveau `--appelfonds` violet
    (`#7C5CBF` clair / `#A48BE0` sombre), seule couleur de catégorie ajoutée depuis la refonte. Les
    deux couleurs sont répercutées sur le liseré et le titre de la carte d'échéance, et sur la
    fiche imprimée (`TEINTES` dans `imprimerFiche()`, couleurs inline — Word ignore le CSS externe,
    contrainte n°6).
  - **Bug corrigé : une offre cautionnée seule affichait « Caution · Hypothèque conventionnelle ».**
    Signalé par l'étude, qui demandait si c'était l'affichage — non : celui-ci se contente de
    traduire les clés détectées (`libellesGarantiesPret`). Reproduit en bac à sable sur trois mises
    en page réalistes, deux causes cumulées, toutes deux corrigées :
    - **Le paragraphe « GARANTIES » débordait sur la section suivante.**
      `RE_TITRE_SECTION_SUIVANTE` exigeait une MAJUSCULE comme TOUT PREMIER caractère de la ligne :
      ni « 8. ASSURANCES » ni « Article 8 - Assurance emprunteur » n'étaient reconnus comme titre,
      c'est-à-dire les deux formes les plus fréquentes dans une offre réelle — le paragraphe avalait
      donc la section suivante, où l'hypothèque est citée à un tout autre titre. Remplacé par
      `estTitreDeSection()`/`indexTitreSectionSuivante()` : le numéro d'article est retiré
      (« 8. », « Article 9 — », « § 4 – ») avant de juger l'intitulé, qui est accepté soit
      entièrement en capitales, soit — mais seulement si le mot « article »/« § » était bien
      présent, marqueur non ambigu — en casse normale. Garde-fou `MIN_PARAGRAPHE_AVANT_COUPE` : on
      ne coupe pas dans les 40 premiers caractères, la première garantie étant parfois écrite en
      capitales sur sa propre ligne (« CAUTIONNEMENT SOLIDAIRE ») — la prendre pour le titre suivant
      viderait le paragraphe et ferait ressortir « Sans garanties » sur une offre cautionnée.
    - **Une garantie citée en simple ALTERNATIVE était comptée.** Le paragraphe d'une offre
      cautionnée nomme couramment une hypothèque en repli (« à défaut d'accord de la caution, le
      prêt sera garanti par une hypothèque conventionnelle ») : ce n'est pas une garantie de CE
      prêt, c'est ce qui se passerait si la caution était refusée. `garantieNonConditionnelle()`
      teste CHAQUE occurrence et écarte celles précédées d'un marqueur conditionnel
      (`RE_GARANTIE_CONDITIONNELLE` : à défaut, faute de, en cas de refus/rejet/défaillance/
      non-obtention, à titre subsidiaire, en substitution, le cas échéant, si la caution…) dans les
      160 caractères qui précèdent, bornés à la phrase courante — une occurrence non conditionnée
      ailleurs dans le même paragraphe reste valable. Même principe que
      `RE_SIMPLE_RENVOI_PIECE`/`motifPieceTrouve` pour la checklist de pièces.
    - Trois tests de régression dans `tests/offre-pret.test.js` (titre numéroté, titre « Article N -
      … » en casse normale, alternative écartée sans rendre la détection insensible à une
      hypothèque réellement exigée, première garantie en capitales non prise pour un titre).
  - Vérifié dans un vrai Chromium (serveur réel, clair et sombre) : six échéances rendues dans
    l'ordre 01/07 → 01/08 → 20/09 → 30/09 → 05/10 → 15/11 avec les bonnes couleurs de liseré et de
    titre, les six pastilles `dl-*` colorées dans les deux thèmes, champ email saisi puis relu
    depuis le serveur avec son entrée d'historique, boutons de relance apparaissant une fois
    l'adresse connue, aucune erreur JS. `npm test` : 454 tests racine (+10), 210 côté serveur
    (inchangé, ce lot est entièrement côté client).

- **Ordre métier des étapes d'un dossier, et date butoir rendue indicative par le rendez-vous** —
  l'étude a donné la séquence réelle d'un dossier, qui manquait jusqu'ici : **compromis signé →
  vente préalable d'un bien (elle finance l'acquisition) → obtention du prêt → date butoir de
  réitération de l'acte (provisoire) → appel de fonds (convocation + décompte des sommes dues par
  l'acquéreur) → rendez-vous de signature de l'acte authentique** (fixé après consultation des
  parties, souvent différent de la date butoir).
  - **Cet ordre remplace l'ordre d'insertion historique** (prêt → appel de fonds → acte →
    rendez-vous → vente préalable) partout où les échéances sont listées ensemble :
    `echeancesOrdonneesFiche` (fiche), `toutesEcheances`/`prochaineEcheanceDetail` (planning),
    `toutesEcheances` de `server/src/jobs/rappels.js` (rappels Teams) et le tableau `standard` de
    `server/src/routes/calendrier.js` (flux webcal). **Il ne départage que les ex æquo** : depuis
    le lot précédent, la fiche trie par DATE — l'ordre métier ne décide donc en pratique que du
    sort des échéances sans date renseignée, reléguées en fin de liste.
  - **« Une fois que cette date est rentrée la date butoir n'a plus lieu d'être mais est indicative
    pour savoir si on signe avant ou après »** (l'étude) : `echeanceValidee(d, 'acte')` renvoie
    désormais `true` dès que `d.rendezVousSignature` est renseignée — exactement le même mécanisme
    que l'offre de prêt reçue qui clôt « Obtention du prêt ». **Un FAIT du dossier clôt l'échéance**,
    pas une décision manuelle : c'est la seule généralisation, `d.echeancesValidees` continue de
    fonctionner à côté. Conséquences en cascade, sans une ligne de plus : le butoir sort de
    `toutesEcheances`/`prochaineEcheanceDetail` (plus annoncé comme prochaine échéance), et le job
    de rappels Teams ne relance plus dessus à J-15/J-7 — relancer sur un butoir dont le
    rendez-vous réel est déjà pris n'a plus d'objet. Le flux `.ics`, lui, continue de le publier
    (il ne filtre pas sur `echeanceValidee` — écart pré-existant, et un événement d'agenda
    indicatif ne gêne pas ; le retirer demanderait de publier son annulation).
  - **La carte reste affichée, avec l'écart plutôt qu'un décompte** : `renderTab()` gagne un 12ᵉ
    paramètre `butoirRemplacePar` (la date du rendez-vous, passée uniquement pour le tab `acte`)
    qui remplace le décompte par « Signature 5 j APRÈS ce butoir » / « 3 j avant ce butoir » /
    « Signature le jour même ». **C'est l'écart seul qui décide de la couleur** : signer après la
    date butoir est le cas qui mérite l'alerte (`passed`, rouge), signer avant ou le jour même ne
    pose aucun problème (`recue`, vert). Le bouton « Marquer réalisée »/« Annuler la validation »
    disparaît dans ce cas — même piège déjà documenté pour le prêt confirmé reçu : le bouton
    n'annulerait rien, la date butoir se rouvre en effaçant le rendez-vous, pas là.
  - `ecartJours(isoA, isoB)` (nouvelle fonction pure) : différence SIGNÉE en jours, à ne pas
    confondre avec `joursEntre()` juste à côté, qui compte les bornes comprises (`+1`) parce qu'il
    sert au prorata. Calculée en UTC, même piège de changement d'heure déjà documenté.
  - Tests : 5 nouveaux dans `tests/echeances-appel-fonds.test.js` (ordre métier en repli,
    `ecartJours` dont un passage à l'heure d'hiver, le butoir clos par le rendez-vous, sa sortie du
    planning, les trois libellés d'écart et l'absence de bouton de validation) et 3 dans
    `server/test/rappels.test.js` (miroir de `echeanceValidee`, ordre de `toutesEcheances` avec et
    sans rendez-vous, aucun rappel envoyé à J-15 d'un butoir remplacé). Suite racine 454 → 459,
    serveur 210 → 213. Vérifié dans un vrai Chromium (clair et sombre) : cinq cartes dans l'ordre
    01/08 → 01/09 → 25/09 → 01/10 → 06/10, « Signature 5 j APRÈS ce butoir » en rouge sur la carte
    du butoir, et « Appel de fonds » annoncé comme prochaine échéance à la place de l'acte.

- **Récupération de deux demandes écartées par erreur lors d'une fusion.** L'étude avait formulé
  ses demandes du matin depuis un AUTRE projet ; la session qui en est née a bien travaillé sur ce
  dépôt et poussé `claude/pensive-mccarthy-k4lbkc`, mais la fusion `9059689` l'a résolue « en
  faveur de main sur toute la ligne », en jugeant ses apports déjà réimplémentés ici. C'était vrai
  pour deux d'entre eux (notification de nouvelle pièce, réordonnancement des échéances), **faux
  pour deux autres**, restés perdus jusqu'à ce que l'étude signale la méprise.
  - **Leçon** : une fusion « résolue en faveur d'un côté sur toute la ligne » doit être précédée
    d'une lecture commit par commit de ce qu'on écarte. Ici, le message de fusion affirmait une
    équivalence qui n'a jamais été vérifiée dans le détail — et un PDF fourni par l'étude est passé
    à la trappe.
  - **Questionnaire de satisfaction : texte et PDF définitifs.** Le modèle provisoire
    (`[MODÈLE PROVISOIRE — …]`) est retiré. `construireEmailQuestionnaireSatisfaction()` porte le
    texte fourni par l'étude, avec `LIEN_AVIS_GOOGLE_OFFICE` (page d'avis de l'office) ;
    `questionnaire-satisfaction-pdf.js` (nouveau fichier, ~197 Ko, base64) porte le PDF de
    l'enquête, téléchargé par `telechargerPdfQuestionnaire()` au même clic que l'ouverture du
    brouillon — les deux actions doivent rester dans le geste utilisateur d'origine. **Une page web
    ne peut pas joindre un fichier à un `mailto:`** (contrainte fondamentale n°4) : le PDF est donc
    téléchargé à côté et l'infobulle post-clic rappelle de le joindre à la main.
    - **`questionnaire-satisfaction-pdf.js` DOIT figurer dans les deux listes de fichiers statiques
      du serveur** : `ASSETS_STATIQUES` (`server/src/app.js`) et les assets embarqués du `.exe`
      (`server/scripts/build-windows-exe.mjs`). La branche d'origine visait l'ancienne version
      `file://`, qui n'avait pas cette contrainte — sans ces deux ajouts, le `<script src>`
      d'`index.html` fait un 404 et le téléchargement échoue **silencieusement**. Vérifié par un
      `curl` sur `/questionnaire-satisfaction-pdf.js` (200) et par la taille du base64 réellement
      chargée dans la page.
    - Deux décisions de l'étude fusionnées plutôt que l'une écrasant l'autre : le bouton n'apparaît
      **qu'une fois `d.acte` renseignée** (demandé dans l'autre projet) ET **archive
      automatiquement le dossier** (demandé ici) ; il n'est toujours **jamais** proposé au confrère
      (`notaireParticipantRepresenteAcquereur`, demandé ici).
    - `d.questionnaireEnvoyeLe` (nouveau champ, date ISO) : la fiche affiche ensuite « envoyé le
      … » avec un bouton « Renvoyer ». Affiché **même sur un dossier archivé** — l'envoi archive
      justement le dossier, masquer la trace à l'instant où elle devient utile n'aurait pas de
      sens. Conservé à l'import (`normaliserDossierImporte`), contrairement aux statuts dérivés
      d'un scan du NAS : c'est un fait accompli par l'utilisateur, pas une déduction.
  - **Désynchronisation d'une pièce dont le fichier a disparu du NAS.** `verifierDossierLocal()`
    ne cherchait que les pièces PAS déjà `'recue'` (`aChercher`) : une pièce dont le fichier était
    ensuite supprimé, déplacé ou renommé restait « reçue » indéfiniment, plus aucun scan ne la
    revérifiant. `aChercher` couvre désormais TOUTE la checklist, et une pièce jusque-là reçue mais
    introuvable repasse à `'manquante'`, son chemin mémorisé est effacé
    (`memoriserFichierTrouve(..., null)` — sinon « ouvrir le fichier » rouvrirait un fichier
    disparu) et une ligne d'historique le consigne. **Ne coûte rien** : depuis que la checklist est
    reconnue par le seul NOM de fichier, re-tester une pièce déjà trouvée n'ouvre aucun PDF.
    - **Garde-fou explicite** : la remise à `'manquante'` n'a lieu que si `nbFichiersRencontres > 0`.
      Un dossier NAS temporairement vide ou injoignable (partage démonté, chemin renommé) ne doit
      jamais vider d'un coup tous les statuts déjà acquis d'un dossier.
  - **Non repris de cette branche** : le réordonnancement « Prêt → Vente préalable → Acte », rendu
    caduc par le tri chronologique et l'ordre métier complet (voir les deux entrées précédentes) ;
    et `notes-idees.html`, ajouté puis retiré dans la même branche (l'outil de notes vit en
    artefact).
  - Tests : 3 réécrits et 2 ajoutés dans `tests/relances-email.test.js` (texte définitif et lien
    Google, absence du bouton tant que `d.acte` manque, état « déjà envoyé » y compris archivé).
    Suite racine 459 → 461, serveur 213 (inchangée). **Vérifié de bout en bout** dans un vrai
    Chromium avec un vrai serveur et une arborescence NAS : les deux pièces reconnues, puis l'une
    des deux retirée du dossier → elle repasse à « manquante » avec sa ligne d'historique, l'autre
    reste reçue ; PDF du questionnaire bien chargé dans la page ; aucune erreur JS.

- **Dépôt de garantie / acompte sur le prix détecté à la création du dossier, et son séquestre**
  (« Détecter dans l'ajout d'un nouveau dossier le montant de l'acompte sur prix/Dépôt de garantie
  que l'acquéreur doit verser et à qui »). Deux données, pas une : le montant seul ne dit pas quoi
  réclamer à qui.
  - **Montant** (`detecterDepotGarantie`, `DEPOT_GARANTIE_PARENTHESES_RE`/`DEPOT_GARANTIE_CHIFFRES_RE`)
    reconnu sous ses trois noms — « dépôt de garantie », « acompte sur le prix », et
    « indemnité d'immobilisation », son équivalent sur une promesse unilatérale. Deux formes de
    montant, dans cet ordre de confiance : la reprise chiffrée entre parenthèses derrière le
    montant en lettres (même heuristique que `PRIX_VENTE_RE`/`MONTANT_PRET_RE`), puis le montant
    écrit directement en chiffres (« un dépôt de garantie de 15 000 € »), fréquent dans les trames
    d'agence — plus court, donc plus exposé à un faux positif, d'où une fenêtre volontairement
    courte entre le mot-clé et le montant. Plancher à 100 € et symbole monétaire obligatoire :
    « un dépôt de garantie de 5 % du prix » ne rend rien plutôt qu'un « 5 » fantaisiste.
  - **Séquestre** (`detecterSequestreDepot`, `SEQUESTRE_RE`) : « entre les mains de… »,
    « séquestré auprès de… », « en la comptabilité de… », « versé à… », ce qui couvre aussi bien
    l'office que l'agence ou la CARPA. **Cherché uniquement dans la fenêtre qui entoure la clause
    de dépôt** (200 caractères avant le mot-clé, 600 après) : « entre les mains du notaire » se
    rencontre aussi dans des clauses sans rapport (appel de fonds, indemnité de retard), le
    chercher dans tout l'acte ramènerait n'importe laquelle d'entre elles. Aucune clause de dépôt
    détectée = rien proposé, plutôt qu'un nom pris ailleurs au hasard. Une proposition relative qui
    suivrait (« … du notaire soussigné **qui en donnera quittance** ») est coupée.
  - **Champ libre, pas une liste fermée** (notaire / agence / CARPA) : la formulation varie trop
    d'une trame à l'autre pour qu'une énumération couvre les cas réels, et se tromper de catégorie
    coûterait plus qu'un texte à relire. Même premier jet que `AGENCE_RE`/`PIECES_*` en leur temps,
    à resserrer sur retour de l'étude.
  - **Branchés dans le pipeline d'extraction unifié**, exactement comme `emailAcquereur`/
    `nomAgence`/`adresseBien` — aucun chemin parallèle : `construireExtractionRegex` (avec leur
    page via `champAvecSource`), `appliquerExtractionAuFormulaire`, `CHAMPS_REVISION`,
    `champRevision`/`ecrireChampRevision` (donc éditables et cochables dans « Ce que l'outil a
    compris »), `diffCorrectionsExtraction`, et `instantaneExtraction`, qui itère déjà sur toutes
    les clés de `extraction.champs` et les a repris sans une ligne de plus. `aiguillesPourValeur`
    traite `depotGarantie` comme `prixVente` (un montant se retrouve dans le texte sous la forme
    « 10 000 », pas « 10000 »).
  - `d.depotGarantie` (entier ou `null`) et `d.sequestreDepot` (texte) ajoutés au modèle du
    dossier, **conservés à l'import d'une sauvegarde** comme `adresseBien`/`prixVente` : une
    lecture de l'acte (ou une saisie de l'étude), identique sur n'importe quel poste — jamais un
    statut dérivé d'un scan du NAS. Deux champs à l'étape « Finaliser » du wizard, et sur la fiche
    (`renderDepotGarantieDossier`, `changerDepotGarantie`/`changerSequestreDepot`, historique
    journalisé) juste sous l'adresse et le prix.
  - **Présentés comme la grille de classification** (libellé AU-DESSUS du champ, `.input-classif`)
    et non comme l'adresse/le prix (icône seule) : deux champs voisins qu'une icône ne suffirait
    pas à distinguer — exactement la dissymétrie déjà corrigée une fois sur l'adresse et le prix
    (voir son historique plus haut).
  - **Corrigé au passage** : `nomAgence` figurait dans les valeurs attendues par
    `diffCorrectionsExtraction` mais n'était pas passé par l'appelant — une agence détectée était
    donc journalisée à chaque création comme « vidée à la main ». Les trois champs sont maintenant
    transmis.
  - Tests : 6 nouveaux dans `tests/dates.test.js` (les deux formes de montant, les trois
    vocabulaires, le pourcentage et le prix de vente qui ne doivent rien rendre, les trois
    destinataires, et l'absence de séquestre sans clause de dépôt) ; la liste attendue des lignes
    du panneau de révision mise à jour dans `tests/revision.test.js`. Suite racine 461 → 467,
    serveur inchangée (213 — chantier entièrement côté client). **Vérifié dans un vrai Chromium**
    (serveur réel, clair et sombre, desktop et 400px) : les deux champs préremplis à l'étape
    Finaliser, les deux lignes dans « Ce que l'outil a compris » avec leur extrait, le dossier
    relu depuis le serveur avec ses deux valeurs, correction depuis la fiche avec sa ligne
    d'historique, aucune erreur JS, aucun débordement horizontal en mobile.

- **Les rappels automatiques passent de Teams à l'EMAIL**, suite à un changement fait par l'étude
  dans son flux Power Automate (« on a modifié l'envoi des notifications sur Teams par un envoi
  d'email, il va falloir modifier la configuration dans les réglages »). **Rien n'avait été poussé
  sur le dépôt** : le changement portait sur l'ACTION INTERNE du flux (« Publier un message dans un
  chat ou un canal » → « Envoyer un e-mail (V2) »), pas sur du code — vérifié en cherchant une
  branche ou un commit correspondant avant de toucher quoi que ce soit.
  - **Question de cadrage posée avant d'écrire une ligne**, les trois implémentations possibles
    n'ayant rien de commun : (a) le flux envoie l'email, CLAIRE poste le même JSON ; (b) SMTP
    direct depuis le serveur (`nodemailer`, présent dans `server/package.json` mais toujours jamais
    câblé) ; (c) autre chose. L'étude a confirmé (a). SMTP direct reste écarté pour deux raisons à
    garder en tête si le sujet revient : un mot de passe de messagerie devrait être stocké dans la
    base, et Microsoft 365 désactive SMTP AUTH par défaut.
  - `server/src/teams.js` → **`server/src/envoiEmail.js`**, `envoyerMessageTeams(url, destinataire,
    texte)` → `envoyerEmail(url, destinataire, sujet, texte)`. Le POST devient
    `{destinataire, sujet, message}`. **`sujet` est toujours présent, même vide** (jamais absent) :
    l'action « Envoyer un e-mail (V2) » recevrait sinon un Objet null et le flux échouerait côté
    Power Automate — un test le verrouille.
  - **Le champ `sujet` est la seule vraie addition fonctionnelle** : un message Teams n'a pas
    d'objet, une boîte de réception ne se lit pas sans. `sujetRappel(r)` (`jobs/rappels.js`) et
    `sujetNotificationPieces()` (`routes/notifications.js`), toutes deux pures et testées, sont
    volontairement en UNE ligne et sans emoji — c'est ce qui s'affiche dans une liste de messages,
    et un tri par objet doit y rester lisible. **Les CORPS (`texteRappel`,
    `texteNotificationPieces`) sont laissés strictement inchangés** : ils étaient déjà autonomes,
    les répéter dans l'objet n'aurait rien apporté et aurait fait bouger des tests sans raison.
  - **Clés de réglages renommées** : `teamsWebhookUrl`/`teamsActif`/`teamsCopieEmail` →
    `fluxEmailUrl`/`emailActif`/`copieEmail` (`emailsResponsables` inchangée, son nom convenait
    déjà). Garder `teamsWebhookUrl` pour un flux qui envoie des emails aurait induit en erreur la
    prochaine session.
  - **Reprise des anciennes valeurs, décision importante** : `assainirReglages()`
    (`parametresRepo.js`) lit l'ancienne clé quand la nouvelle est absente. L'URL du flux n'a PAS
    changé (seule son action interne a bougé) — faire recoller à l'étude une URL déjà saisie, et
    recocher l'activation, aurait été une régression pure. Le premier enregistrement depuis l'écran
    Réglages persiste la forme nouvelle et fait disparaître l'ancienne, `ecrireReglages()` écrivant
    l'objet assaini tel quel. **La nouvelle clé l'emporte toujours quand les deux sont présentes**,
    sinon décocher l'activation ou vider l'adresse de copie ne tiendrait pas (testé dans les deux
    sens). Même principe que la reprise d'un `config.json` antérieur au jeton de calendrier.
  - Route `POST /api/reglages/tester-teams` → **`/api/reglages/tester-email`** ; côté client
    `testerTeamsResponsable()` → `testerEnvoiResponsable()`, ids `reglages-teams-actif`/
    `reglages-webhook-url` → `reglages-envoi-actif`/`reglages-flux-url` (`reglages-copie-email`
    inchangé). `reglages-email-actif` a été écarté comme nom : trop proche des
    `reglages-email-${i}` des trois collaborateurs, qui vivent dans le même écran.
  - **Écran Réglages** : titre « Rappels automatiques vers Teams » → « par email », « Adresse Teams
    de chaque collaborateur » → « Adresse email », procédure réécrite (action Outlook au lieu de
    l'action Teams, schéma JSON du déclencheur étendu à `"sujet"`), et **un paragraphe dédié à la
    migration** — ce que l'étude doit changer dans son flux existant (remplacer l'action, ajouter
    `"sujet"` au schéma) et ce qu'elle n'a PAS à refaire (l'URL, les adresses).
  - **Piège rencontré en lançant la suite serveur** : `npm test` restait bloqué sans rien afficher,
    au lieu d'échouer. Cause : deux tests de `reglages.test.js` démarrent un faux webhook puis
    appellent `faux.serveur.close()` en DERNIÈRE ligne — la route ayant été renommée, l'assertion
    échouait avant, le serveur restait ouvert et gardait le processus en vie indéfiniment. À
    retenir : un test qui ferme une ressource à la fin de son corps (plutôt que dans un `after`)
    transforme n'importe quel échec en blocage. Diagnostiqué en relançant les fichiers un par un
    avec `timeout`, pas en attendant `npm test`.
  - Tests : `server/test/teams.test.js` → `envoi-email.test.js` (réécrit sur la nouvelle signature,
    + le cas « sujet omis → chaîne vide »), et 5 ajoutés (reprise des anciennes clés Teams dans les
    deux sens, `sujetRappel` singulier/pluriel et sans retour à la ligne, objet ET corps transmis
    au flux). Suite serveur 213 → 219 ; suite racine inchangée (467 — ce chantier ne touche aucune
    fonction pure de `script.js`, seulement du code DOM/`fetch`). **Vérifié dans un vrai Chromium**
    (serveur réel + un faux flux Power Automate en écoute) : réglages saisis, enregistrés, relus
    depuis la base sous les nouvelles clés, bouton « Tester » envoyant bien
    `{destinataire, sujet, message}` au flux, formulaire correctement repeuplé après changement
    d'onglet, clair et sombre, aucune erreur JS, aucun débordement en mobile. Reprise d'une
    configuration Teams existante vérifiée à part, en injectant l'ancien blob directement en base.
  - **Non vérifié en conditions réelles** : aucun flux Power Automate ni compte Microsoft 365 dans
    cet environnement — le rendu réel de l'email (objet, corps, adresse d'expédition utilisée par
    l'action « Envoyer un e-mail (V2) ») reste à confirmer par l'étude, comme déjà noté pour la
    version Teams.

- **Troisième et dernière architecture d'envoi des rappels : CLAIRE ENVOIE l'email elle-même, son
  ARRIVÉE déclenche le flux, qui poste dans Teams.** L'étude avait refait son flux Power Automate
  sans le dire dans le dépôt : « le design HTTP + schéma JSON + Envoyer un e-mail est obsolète, le
  flux final (déclencheur e-mail Outlook → action Teams) est déjà activé, il ne reste que le code
  d'envoi côté CLAIRE à adapter (Objet = destinataire, Corps = message, vers
  Bastien.ANGLUMENT@gossart.notaires.fr) ». **Rien n'avait été poussé** (vérifié avant de toucher
  au code : `git fetch --all`, branches inspectées, `list_sessions`) — le changement portait
  uniquement sur le flux lui-même. Récapitulatif des trois générations, pour ne réintroduire aucune
  des deux mortes :
  1. `POST` JSON vers un déclencheur HTTP Power Automate → message privé Teams ;
  2. le même `POST`, l'action interne du flux passée à « Envoyer un e-mail (V2) » ;
  3. **(en service)** email SMTP de CLAIRE vers la boîte-passerelle → déclencheur « Quand un nouvel
     e-mail arrive » → action Teams.
  - **Convention imposée par le flux, à ne pas changer d'un côté sans l'autre** : `À` = la
    boîte-passerelle (toujours la même), **`Objet` = l'adresse du vrai destinataire** (le flux la
    lit pour router le message Teams), `Corps` = le message. C'est ce détournement de l'objet qui a
    fait **disparaître `sujetRappel()`/`sujetNotificationPieces()`**, nées la veille avec
    l'architecture n°2 : la place d'un objet lisible n'existe plus, et les corps de message étaient
    déjà autonomes — ils ne faisaient que répéter cet objet. Un test verrouille explicitement le
    sens (inverser `À` et `Objet` enverrait le rappel au collaborateur sans jamais déclencher le
    flux, donc sans message Teams).
  - **SMTP direct (`nodemailer`) devient le transport**, après avoir été écarté deux fois. La
    raison qui l'écartait (des identifiants de messagerie à stocker) est traitée plutôt qu'ignorée :
    l'**envoi direct Microsoft 365** (serveur de l'enregistrement MX du domaine, port 25, aucun
    compte — autorisé d'après l'adresse IP du bureau) n'en demande aucun, et c'est le mode
    recommandé dans l'écran Réglages comme dans `server/README.md` ; un compte SMTP
    (`smtp.office365.com:587` + mot de passe d'application) n'est à renseigner que si le locataire
    bloque l'envoi direct. Aucun autre transport n'était possible : un job de fond qui tourne toutes
    les 30 minutes, sans personne devant l'écran, ne peut pas passer par un brouillon `mailto:`.
  - **Le mot de passe SMTP ne ressort jamais de la base.** `reglagesPublics()`
    (`server/src/routes/reglages.js`) le retire de toute réponse et le remplace par un booléen
    `smtpMotDePasseEnregistre` ; `assainirReglages(brut, precedent)` le reprend des réglages
    précédents quand la requête ne le porte pas (clé absente ou `null`), le remplace sur une chaîne
    non vide, et l'efface sur une chaîne vide explicite. Côté client, le champ n'est envoyé que si
    quelqu'un y a réellement tapé quelque chose — sans ce soin, un enregistrement ordinaire
    l'aurait effacé à chaque fois. Il reste stocké en clair dans le fichier de la base, sur le
    serveur de l'étude : c'est dit dans l'écran et dans le README, comme argument de plus en faveur
    de l'envoi direct.
  - **Réglages renommés** : `fluxEmailUrl` disparaît (le déclencheur HTTP n'existe plus), remplacé
    par `emailPasserelle`/`smtpHote`/`smtpPort`/`smtpSecurise`/`smtpUtilisateur`/`smtpMotDePasse`/
    `smtpExpediteur`. `emailActif`/`copieEmail`/`emailsResponsables` sont inchangés, et la reprise
    des toutes premières clés Teams (`teamsActif`/`teamsCopieEmail`) est **conservée** : ces deux
    réglages gardent exactement le même sens d'une architecture à l'autre, les faire ressaisir
    serait une régression silencieuse. Nouvelle fonction `envoiConfigure(reglages)`, source de
    vérité unique de « l'envoi est-il configuré ? », partagée par le job de rappels, la route de
    notification de pièces et la route de test — trois endroits qui doivent rester d'accord.
  - **Les tests n'ouvrent plus aucun serveur** : le transport est injectable
    (`envoyerEmail(reglages, destinataire, texte, creerTransportFn)`) et `creerApp()` accepte un
    `envoyerEmailFn`, ce qui a permis de supprimer les faux serveurs HTTP de `envoi-email`,
    `notifications` et `reglages`. **C'est aussi la correction du piège rencontré la veille** : ces
    tests appelaient `faux.serveur.close()` en DERNIÈRE ligne de leur corps, si bien qu'une
    assertion en échec laissait le serveur ouvert et faisait PENDRE `npm test` au lieu d'échouer
    (diagnostiqué en relançant les fichiers un par un avec `timeout`, pas en attendant la suite).
  - **Vérifié de bout en bout dans un vrai Chromium** (serveur réel + faux serveur SMTP maison en
    TCP brut, capturant le message réellement émis) : réglages saisis, enregistrés, relus depuis la
    base, champ mot de passe vide avec son invite correcte, bouton « Tester » produisant un vrai
    message `From: CLAIRE <claire@etude.fr>` / `To: passerelle@etude.fr` /
    `Subject: bastien@etude.fr` avec le message en corps — exactement la convention du flux. Clair
    et sombre, aucun débordement horizontal à 400px, aucune erreur JS nouvelle. `npm test` : 467
    tests racine (inchangés, chantier entièrement serveur/DOM) et 225 côté serveur (219 → 225).
  - **Non vérifié en conditions réelles** : ni flux Power Automate ni locataire Microsoft 365 dans
    cet environnement — restent à confirmer par l'étude que Microsoft 365 accepte l'envoi depuis le
    poste serveur (envoi direct autorisé, ou compte SMTP à renseigner) et que le flux se déclenche
    bien à l'arrivée de l'email.

- **L'envoi sans compte (« direct send ») n'est PAS praticable pour ce domaine — le DNS l'a
  tranché.** Recommandé une heure plus tôt (voir l'entrée précédente), il a été invalidé dès que
  l'étude a lancé le `nslookup -type=mx` demandé par la procédure. Ce que le DNS de
  `gossart.notaires.fr` dit réellement :
  - **MX = `mx-55162650.mail.eu.retarus.com`** : le courrier entrant passe par **Retarus**, une
    passerelle de filtrage, pas directement par Microsoft. La procédure disait « le MX vous donne
    `domaine-avec-tirets.mail.protection.outlook.com` » — faux dès qu'un prestataire est devant.
  - L'endpoint Microsoft **existe quand même** (`gossart-notaires-fr.mail.protection.outlook.com`
    résout vers 52.101.166.x, la plage EOP) : le locataire est bien Microsoft 365, l'endpoint n'est
    simplement plus publié dans le MX. Il se retrouve dans le centre d'administration (Paramètres →
    Domaines), pas par un `nslookup MX`.
  - **SPF = `v=SPF1 include:_spf.retarus.com -all`** : c'est ce qui condamne l'envoi direct. Seul
    Retarus est autorisé à émettre pour ce domaine, et le `-all` est un refus ferme — un message
    parti de l'adresse IP du bureau serait rejeté ou mis en quarantaine.
  - **Vérifié ici** par résolution DNS directe (`node:dns`, `resolve4`/`resolveMx`/`resolveTxt`)
    plutôt qu'en croyant sur parole la sortie collée : c'est ce qui a fait apparaître le SPF, que
    l'étude n'avait pas demandé et qui était le point décisif.
  - **Conclusion, et nouveau contenu de la doc** : le compte SMTP authentifié
    (`smtp.office365.com:587`, mot de passe d'application) n'est plus « la variante si l'envoi
    direct est refusé » mais le mode principal ; l'envoi sans compte devient le cas particulier,
    avec sa condition écrite noir sur blanc (le SPF doit autoriser l'IP du bureau). Le SPF ne gêne
    pas le mode authentifié : le message part de la boîte elle-même et le destinataire étant une
    boîte du même locataire, la remise est interne. Deux prérequis administrateur sont maintenant
    nommés dans l'écran et le README : **SMTP authentifié autorisé pour la boîte** (Utilisateurs →
    la boîte → Courrier → Gérer les applications de messagerie), et un **mot de passe
    d'application** si cette boîte porte l'authentification à deux facteurs.
  - **Bug corrigé au passage, qui se serait manifesté au premier test réel** : `envoyerEmail()`
    prenait `smtpExpediteur || emailPasserelle` comme expéditeur. Avec un compte authentifié,
    Microsoft 365 **exige** que l'expéditeur soit ce compte (sauf droit « Envoyer en tant que ») —
    tout envoi serait parti au nom de la boîte-passerelle et aurait été refusé par un
    `5.7.60 Client does not have permissions to send as this sender`, message assez opaque pour
    coûter une session de diagnostic. Le repli devient
    `smtpExpediteur || smtpUtilisateur || emailPasserelle`, et l'écran conseille désormais de
    laisser le champ vide. Deux tests le verrouillent (`server/test/envoi-email.test.js`).
  - Suite serveur 225 → 227 ; suite racine inchangée (467). Vérifié dans un vrai Chromium (écran
    Réglages relu, aucune erreur JS, aucun débordement à 400px).
  - **Leçon, à rapprocher de celle déjà tirée sur les PDF réels et les codepoints Unicode** : une
    procédure qui dit « lancez cette commande et prenez ce qu'elle renvoie » suppose une réponse
    d'une forme donnée. Ici la réponse avait une tout autre forme, et c'est une SECONDE donnée non
    demandée (le SPF) qui portait la vraie contrainte. Vérifier soi-même l'environnement réel, quand
    c'est possible à coût nul, vaut mieux qu'une procédure écrite en aveugle.

- **Calendrier connecté : le flux .ics n'était pas conforme, et Outlook s'arrêtait au deuxième
  événement.** Signalé par l'étude — « les échéances ne s'affichent toujours pas », puis, en
  précisant : « j'ai sur deux trois dates du premier fichier connecté ». Cette seconde phrase était
  le diagnostic : l'abonnement fonctionne, le flux est bien servi, mais sa LECTURE s'interrompt en
  cours de route. Un client calendrier qui rencontre une anomalie de syntaxe abandonne le fichier à
  cet endroit, sans le moindre message — tout ce qui suit disparaît silencieusement.
  **Méthode** : générer le flux avec des dossiers réalistes (noms longs, ponctués, champs récents
  non renseignés) et l'inspecter ligne par ligne, plutôt que relire `genererFluxIcs`. Les trois
  défauts sont apparus du premier coup, et le premier tombait **ligne 17**, soit au deuxième
  événement du premier dossier — exactement « deux trois dates ».
  - **`METHOD:CANCEL` à l'intérieur d'un `VEVENT`.** `METHOD` est une propriété du CALENDRIER
    (RFC 5545 §3.7.2), jamais d'un événement, et elle n'a de sens que dans un message d'invitation
    iTIP — pas dans un flux publié. Retirée : `STATUS:CANCELLED`, émis juste au-dessus, est le
    mécanisme correct et suffisant ici. **Ironie à retenir** : cette ligne avait été ajoutée par le
    correctif précédent, celui qui traitait déjà « il reste des dates de vente et pas les nouvelles
    dates butoir » — un correctif juste dans son intention (publier l'annulation) mais qui a cassé
    la validité du fichier en même temps, donc aggravé le symptôme qu'il visait.
  - **Lignes non repliées.** RFC 5545 §3.1 plafonne une ligne à 75 octets, au-delà elle se replie
    (CRLF + une espace en tête de continuation). Un titre d'échéance — libellé + acquéreur + nom
    complet du dossier — atteint couramment 110 à 120 octets. `plierLigneIcs()` replie par POINT DE
    CODE et non par octet : couper un caractère accentué en deux produirait de l'UTF-8 invalide, ce
    qu'un simple contrôle de longueur ne détecterait jamais (un test le verrouille explicitement).
  - **Virgules et points-virgules non échappés** dans `SUMMARY` (§3.3.11). Un nom de dossier en
    contient couramment (« DUPONT, Jean / MARTIN »), et une échéance personnalisée aussi
    (« Levée; option ») — le point-virgule est le plus dangereux, un lecteur peut y voir un
    séparateur de paramètre. `echapperTexteIcs()` traite antislash, point-virgule, virgule et saut
    de ligne.
  - **Rien à refaire côté étude** : l'URL d'abonnement et le jeton ne changent pas, seule une
    resynchronisation du calendrier est nécessaire. Outlook resynchronise un abonnement Internet
    selon son propre rythme (quelques heures), ce que `REFRESH-INTERVAL`/`X-PUBLISHED-TTL`
    suggèrent sans pouvoir l'imposer — un affichage qui ne bouge pas dans l'heure n'est donc pas
    forcément un nouveau bug.
  - Tests : 6 nouveaux dans `server/test/calendrier.test.js` (aucune ligne > 75 octets, aucun
    `METHOD` résiduel alors que l'annulation reste publiée, titres échappés, repli qui ne coupe pas
    un caractère accentué et se déplie à l'identique, ligne courte rendue telle quelle,
    `echapperTexteIcs` sur les quatre caractères). Suite serveur 227 → 233 ; racine inchangée (467,
    chantier entièrement côté serveur). **Vérifié de bout en bout** sur un vrai serveur : flux servi
    en HTTP 200, UTF-8 intact après repli, CRLF partout, aucune ligne hors norme, `BEGIN:VEVENT` et
    `END:VEVENT` équilibrés, titres échappés.
  - **Piège rencontré en ÉCRIVANT les tests, pas dans le code** : les valeurs attendues contiennent
    des antislashs littéraux, et un littéral JS les fait doubler (`'\\;'` pour obtenir `\;`). Deux
    assertions ont perdu un antislash au passage et ont échoué en accusant une implémentation qui
    était juste. Corrigé en construisant les chaînes attendues avec une constante
    `ANTISLASH = String.fromCharCode(92)` : plus lisible, et insensible à cette classe d'erreur.
    Même leçon que le décodage HTML des attributs `onclick` — quand plusieurs couches
    d'échappement se superposent, écrire la valeur en clair plutôt qu'en littéral échappé.

- **Notifications en rouge, « Signature de l'acte » en bleu nuit** — deux demandes de l'étude
  (« passe la couleur des notification en rouge. et la couleur du statut "Signature de l'acte" en
  Blue nuit »).
  - **Notifications** : le vert `--success` disait exactement la même chose que le statut « reçu »
    affiché juste à côté sur la même pièce — le repère « Nouveau » se fondait dans le badge qu'il
    était censé signaler. Les quatre surfaces passent au rouge `--urgent` : `.sidebar-badge-notif`
    (le compteur, seul badge à fond plein de la sidebar), et les trois `dl-success
    notif-nouveau-tag` de `tagNotificationsDossier()` / `renderPiecesDossier()` / du bloc
    `.tab-offre-pret` de `renderCarteDossier()`. Un seul remplacement a suffi côté script.js : les
    trois partagent déjà la classe `notif-nouveau-tag`. **Les autres `dl-success` de l'outil ne
    sont pas touchés** (pièce reçue, échéance réalisée, statut d'offre, dossier lié d'Outil 2…) :
    seule la famille « notification » change de registre.
  - **`--acte` passe au bleu nuit** : `#1E3A63` en clair, `--acte-bg` `#E2E7F0`. Troisième valeur
    de ce jeton (bleu moyen à l'origine, puis teal après l'échange avec `--ventebien`, voir son
    historique) — le nom garde son sens, seule la valeur change, donc tout l'outil suit sans une
    règle CSS de plus. Ce navy reste distinct des deux autres bleus de la palette (`--ventebien`
    #2472B0, `--focus` #2563EB) **par sa profondeur**, pas par sa teinte : c'est le seul des trois
    qui soit sombre.
  - **En mode sombre, la profondeur n'est plus disponible** (un navy sur fond sombre est
    illisible) : le jeton est éclairci comme les autres couleurs de catégorie, mais **décalé vers
    l'indigo** (`#8A9FD4`, fond `#232736`) plutôt que simplement éclairci — un premier essai en
    `#8FA5C8` restait trop proche de `--ventebien` (#6FAEDB) une fois les deux cartes côte à côte
    dans le tiroir, constaté en capture d'écran. C'est donc la teinte (indigo contre cyan) qui
    porte la distinction en sombre, là où c'est la profondeur en clair.
  - `imprimerFiche()` : `TEINTES.acte` mis à jour à l'identique (couleurs inline, Word ignore le
    CSS externe — contrainte n°6), sans quoi la fiche imprimée aurait gardé le teal.
  - **Corrigé au passage, deux incohérences pré-existantes que ce changement rendait visibles** :
    `.dashboard-pastille.appelFonds` utilisait `--muted` et `.dashboard-pastille.rendezVousSignature`
    utilisait `--acte`, alors que partout ailleurs (`.tab.*`, `.dot-label.dl-*`) ces deux échéances
    prennent `--appelfonds` et `--success` — une même échéance changeait donc de couleur entre le
    widget « Échéances des 7 prochains jours » et sa carte, et le rendez-vous serait devenu bleu
    nuit lui aussi, c'est-à-dire indiscernable de la date butoir que l'étude venait justement de
    demander à distinguer.
  - Vérifié dans un vrai Chromium (serveur réel, dossier synthétique portant les cinq échéances et
    deux notifications en attente, clair et sombre) : valeurs calculées des jetons, couleur réelle
    du titre de la carte « Signature de l'acte », les trois tags de notification en
    `rgb(194,65,12)` / `rgb(240,140,75)`, compteur de sidebar rouge et visible, aucune erreur JS.
    `npm test` reste vert aux deux endroits (467 tests racine, 233 côté serveur — changement
    purement visuel, aucune fonction pure modifiée).

- **Outil 2 : le rapport suit l'ordre de lecture d'un notaire — l'acte, puis l'avant-contrat, puis
  les annexes.** Demandé par l'étude après le test du rapport précédent : « l'objectif principal
  est d'abord de lire le contenu de l'acte de vente, PUIS de comparer avec l'avant contrat, PUIS
  avec les annexes. Peut-être diviser en trois les résultats trouvés ? » Ce qui manquait n'était
  pas un thème de plus mais la **première** de ces trois lectures : sur le projet de vente réel
  envoyé par l'étude, le rapport ne portait que deux constats, tous deux disant « vous ne m'avez
  pas donné le document ». Il ne disait rien de l'acte lui-même, pourtant le seul document
  toujours présent.
  - **Règle d'affectation, à garder avant d'ajouter une catégorie** : une section est définie par
    le DOCUMENT qu'il faut ouvrir pour trancher le point. Un constat qui touche deux sources
    n'apparaît **qu'une fois**, dans la section de la source la plus fragile (celle qui peut
    manquer) — le répéter recréerait la duplication que l'étude a déjà fait retirer une fois. Les
    catégories produites par les détecteurs ne changent pas : seul leur regroupement change
    (`SECTIONS_RAPPORT_OUTIL2` + `SOUS_SECTIONS_RAPPORT_OUTIL2`, en remplacement de
    `CATEGORIES_RAPPORT_OUTIL2`). Un test structurel vérifie que chaque catégorie est rattachée à
    une section existante — une catégorie oubliée disparaîtrait sinon du rapport en silence.
  - **Chaque section dit ce qu'elle n'a PAS pu faire** (`messageBlocAuditVide`) au lieu de rester
    muette : « aucune annexe déposée : les diagnostics, l'état daté, le certificat d'urbanisme et
    les procès-verbaux d'assemblée n'ont pas pu être contrôlés ». C'était précisément la confusion
    mesurée sur l'acte réel — un rapport vide se lit « rien à signaler » là où il faut lire « rien
    n'a pu être contrôlé ». L'état vide global vert (`.audit-vide`) disparaît pour la même raison :
    affirmer « aucun danger relevé » juste au-dessus d'« aucune annexe n'a pu être contrôlée » est
    une contradiction. En mode « compromis », la section 2 ne s'affiche pas du tout : le document
    analysé EST l'avant-contrat.
  - **Fiche d'identité de l'acte** (`ficheActeOutil2`, pure et testable), en tête de la section 1,
    **toujours affichée** : parties, bien, cadastre, prix, notaires — et en mode « compromis » le
    dépôt de garantie, son séquestre et les quatre dates. Une valeur absente s'affiche « non
    trouvé », jamais devinée. **Aucune extraction nouvelle** : `construireExtractionRegex` était
    déjà calculée et passée à `analyserProjetVenteOutil2`, son résultat n'était simplement jamais
    affiché ; le mode « compromis » la calcule maintenant aussi.
    - **Adaptée au mode**, et c'est une décision, pas un oubli : un acte de vente n'a ni dépôt de
      garantie ni dates butoir (elles appartiennent à l'avant-contrat), et `detecterTypeActe` ne
      connaît que les avant-contrats — quatre lignes « non trouvé » y seraient du bruit, pas une
      information. Le type d'acte, lui, est déjà donné par le sélecteur de l'écran.
  - **Deux constats lus dans le seul acte** (`constatsLectureActe`), tirés de ce que l'acte réel
    déclarait et que rien ne signalait :
    - **Procédure ou litige en cours** — IMPORTANT, et **CRITIQUE quand l'acquéreur la reprend à
      son compte** (subrogation). La clause de style « il n'existe à ce jour aucune action ou
      litige en cours » est écartée (`RE_AUCUN_LITIGE`), sans quoi chaque acte produirait l'alerte.
      **La subrogation est jugée sur la CLAUSE entière et non sur la phrase citée** : dans l'acte
      réel elle arrive deux phrases plus loin, et `phraseAutour` s'arrête au premier point — on
      cite court, on juge large, sans quoi le cas le plus grave ressortait au niveau le plus faible.
    - **Document que l'acte déclare non établi** — A_VERIFIER, **sauf quand la même clause dit
      pourquoi il en est dispensé** (`RE_DISPENSE_DOCUMENT` : « n'entre pas dans le champ
      d'application », « non soumis », « dispensé »…). L'acte a déjà répondu ; le signaler
      reviendrait à poser une question sur chaque acte qui prend la peine de se justifier — même
      discipline que `RE_AUCUN_TRAVAUX` et la négation de copropriété.
    - Même dédoublonnage par CHEVAUCHEMENT de plage que `detecterTravauxRealises`, et pour la même
      raison : la plage est retenue AVANT les garde-fous, sinon une clause écartée ne laisse
      aucune trace et un second mot déclencheur la fait rejuger sur une fenêtre décalée qui repasse
      les garde-fous.
  - **Les contrôles de cohérence de l'extraction deviennent des constats de la section 1**
    (`constatsCoherenceActe`) — prêt après l'acte, réitération = signature, date écrite contredite
    par un délai : c'est exactement une lecture de l'acte seul. **Filtrés** (`CODES_COHERENCE_ACTE`)
    sur ce qui décrit une contradiction DANS L'ACTE : « adresse non reconstituée » et « notaire
    instrumentaire indéterminé » sont des limites de notre lecture, déjà affichées « non trouvé »
    dans la fiche — en refaire un constat dirait deux fois la même chose.
  - **Trois corrections d'Outil 1 trouvées en rejouant le vrai acte**, chacune visible dans la
    fiche :
    - **Le côté d'un notaire se cherche D'ABORD APRÈS SON NOM** (`detecterNotaires`), comme
      l'office et le CRPCEN le font déjà, avec repli sur la fenêtre entière pour la rédaction
      inverse (« le notaire du vendeur, Maître X »). Sur un acte authentique les deux notaires
      comparaissent dans la même phrase, chacun suivi de sa qualité — « Maître A, notaire à …,
      Notaire assistant le VENDEUR, avec le concours de Maître B, …, assistant l'ACQUEREUR » : la
      fenêtre de B contenait les DEUX marqueurs et retenait le premier, si bien que **les deux
      notaires ressortaient du côté du vendeur**, aucun côté acquéreur, et la règle d'attribution
      de la minute ne pouvait plus s'appliquer. La fenêtre est en outre bornée des deux côtés par
      les mentions voisines, et plus seulement à droite.
    - **Le cadastre est lu dans le TABLEAU à plat de la PARTIE NORMALISÉE**
      (`RE_CADASTRE_TABLEAU`) : « Figurant ainsi au cadastre : Section N° Lieudit BH 81 … »,
      l'en-tête de colonnes suivi des valeurs, tel que pdf.js le rend. Motif distinct du premier,
      ancré sur cet en-tête précis, donc sans risque de faux positif.
    - **`ficheActeOutil2` comparait les rôles en minuscules** alors que `detecterParties` les rend
      en capitales : les deux lignes les plus attendues de la fiche (vendeurs, acquéreurs)
      sortaient vides. Trouvé au premier rejeu, pas à la relecture.
  - **Résultat mesuré sur le projet de vente réel** (30 pages, copropriété) : de 2 constats disant
    tous deux « document manquant » à une fiche d'identité complète (BOURGUEIL & BOUSSELET /
    CHARPENTIER & GENESTOUX, bien, cadastre BH 81, prix, les deux notaires) + un CRITIQUE
    « procédure en cours, reprise par l'acquéreur » + un A_VERIFIER sur le diagnostic technique
    global, la clause d'audit énergétique dispensée n'étant plus signalée.
  - Tests : `tests/outil2-lecture-acte.test.js` (13 — les deux constats et leurs garde-fous, la
    subrogation jugée sur la clause, la page depuis les frontières, le filtrage des alertes de
    cohérence, les rôles en capitales, la fiche adaptée au mode, les valeurs absentes préservées,
    le garde-fou structurel des sections, le cadastre en tableau, les deux côtés d'une
    comparution). Suite racine 642 → 655, serveur inchangée (215 — chantier entièrement côté
    client). **Vérifié dans un vrai Chromium** (serveur réel, clair et sombre, 1500px et 400px) sur
    les deux actes réels : trois blocs titrés avec leur phrase de source, fiche complète, section 2
    annonçant l'absence d'écart, aucune erreur JS, aucun débordement horizontal.


- **Outil 2 : statut des acquéreurs, carnet d'entretien, tableau des travaux, type de bien.**
  Quatre demandes de l'étude, avec la consigne explicite de poser des questions de cadrage plutôt
  que de deviner — quatre arbitrages obtenus ainsi, notés au fil des points ci-dessous.
  - **Statut des acquéreurs (marié / pacsé / concubin)** — périmètre retenu par l'étude parmi trois
    proposés : ne pas se contenter de LIRE le statut, mais signaler ce qui manque et qui a une
    conséquence sur la rédaction de l'acte (régime matrimonial non précisé, PACS dont le régime
    n'est pas dit, acquisition à deux hors mariage sans quotités). Rien de tout cela n'existait :
    `detecterParties()` ne rend que nom / qualité / rôle / personne physique ou morale.
    - **Le piège central, et la raison de tout le code d'attribution** : le même acte décrit aussi
      le statut du VENDEUR (« Monsieur X, marié avec Madame Y »). Lire « marié » dans tout le texte
      le confondrait une fois sur deux. `roleLePlusProcheAvant()` tranche : **le marqueur de rôle le
      plus proche EN AMONT décide à qui appartient la mention** — un acte présente toujours ses
      parties par sections, et le statut est écrit dans la présentation de la partie concernée. Les
      regex de rôle viennent de `qualitePourRole()`, qui tient compte du type d'acte : sur une
      promesse d'ACHAT, « promettant » désigne l'acquéreur et non le vendeur.
    - **Le régime est cherché dans la CLAUSE qui porte le statut**, jamais dans tout l'acte : celui
      du vendeur y figure aussi, et le reprendre serait pire qu'un « non précisé ».
    - Clause de style de négation écartée (`RE_NEGATION_STATUT` : « non liés par un pacte civil de
      solidarité », « ne sont pas mariés ») — sans ce garde-fou, la phrase qui écarte le statut le
      produirait. Même piège que `RE_AUCUN_TRAVAUX` et la négation de copropriété, déjà payé ici.
    - **Quotités** (`quotitesAcquisitionPresentes`) : « quotités VENDUES » emploie exactement les
      mêmes tournures que « quotités acquises », d'où l'exigence d'un mot d'acquisition à proximité
      ET l'absence de vocabulaire de cession. Premier jet, comme `PIECES_*` en leur temps.
    - Quatre constats (`constatsStatutAcquereurs`, catégorie `PARTIES`), plus une ligne « Statut des
      acquéreurs » dans la fiche d'identité, **toujours affichée y compris « non trouvé »** : c'est
      justement quand il manque qu'il faut le voir. Le cas « acquéreur marié achetant seul » est
      inclus (déclaration d'emploi ou de remploi, intervention du conjoint) : c'est le point
      classique, et il entre dans « vérifier si les acquéreurs sont mariés ».
  - **Carnet d'entretien** (`RE_CARNET_ENTRETIEN`, `analyserCarnetEntretien`) — l'étude a choisi UN
    SEUL de ses contenus : **les travaux importants déjà réalisés sur l'immeuble**, à croiser avec
    les assemblées générales et les autorisations. Les contrats d'entretien (chaufferie, ascenseur),
    les assurances de l'immeuble et la date de mise à jour du carnet n'ont **pas** été retenus : ne
    pas les ajouter sans nouvelle demande, c'est ce qui garde le rapport court. Aucun constat non
    plus pour un carnet absent, pour la même raison — le bloc « annexes » le dit déjà.
    - Cherché **uniquement en copropriété** : c'est un document du syndicat (art. 18 de la loi du
      10 juillet 1965), il n'existe pas sur une maison.
    - Ses travaux passent par `detecterTravauxRealises()`/`constatsTravauxRealises()`, qui gagne un
      paramètre de catégorie (`CARNET_ENTRETIEN`) — aucune logique dupliquée, et les garde-fous déjà
      en place (clause de style, travail futur, texte de loi cité) y jouent tels quels.
    - Garde-fou indispensable : un avant-contrat de copropriété CITE le carnet dans presque chaque
      acte, il se prendrait lui-même pour un carnet sans `RE_DOC_AVANT_CONTRAT`. Même piège que
      l'état daté.
  - **Travaux : « l'acte seul fait foi »** (arbitrage explicite de l'étude, contre « croiser avec
    les pièces déposées »). Le comportement des constats ne change donc pas — il appliquait déjà
    cette règle. Ce qui manquait, c'est le reste de la demande : **lister** les travaux, et vérifier
    **les factures**.
    - `RE_FACTURE_TRAVAUX` (facture, devis, mémoire de travaux, justificatif de paiement) ajoute
      `factureMentionnee` à chaque travail ; `resumeTravail()` en tire un libellé court, qui part du
      mot déclencheur et non du début de la phrase (celle-ci commence souvent par une incise « Le
      VENDEUR déclare que… » qui ne dit rien de la nature du travail).
    - **Un TABLEAU** (`renderTableauTravauxAudit`) : une ligne par travail — libellé, page, année,
      autorisation, facture, décennale. C'est lui qui répond à « lister » : les constats ne parlent
      que du gros œuvre et de l'extérieur, une rénovation intérieure n'apparaissait donc nulle part.
      Un tiret « — » veut dire « sans objet » (travail sans incidence sur la structure, ou décennale
      éteinte au-delà de dix ans) et un « ? » « impossible à dire » (année non précisée) : ce sont
      trois informations différentes, pas trois façons de dire « non ».
    - **Aucun constat « facture manquante » n'a été ajouté** : le constat décennale déjà en place
      réclame l'attestation « et les factures correspondantes ». En créer un second dirait deux fois
      la même chose — le tableau porte l'information, les constats restent courts.
    - **Un tableau par SOURCE**, comme la règle d'affectation des sections : les travaux de l'acte
      en section « ce que dit l'acte » (mode compromis) ou « écarts avec l'avant-contrat » (mode
      projet de vente, puisqu'ils y sont lus dans l'avant-contrat), ceux du carnet en « annexes ».
    - **Bug corrigé au passage, dans du code déjà en place** : `RE_TRAVAUX_PASSES` ne reconnaissait
      pas le participe passé au FÉMININ — « la toiture réalisée en 2021 » n'était pas détecté du
      tout, alors que « des travaux ont été réalisés » l'était. Trouvé en écrivant le test du
      carnet, pas à la relecture.
  - **Type de bien déduit, AFFICHÉ et corrigeable** (arbitrage de l'étude, contre un sélecteur
    obligatoire au dépôt et contre le silence actuel). Jusqu'ici la copropriété et le terrain à
    bâtir étaient déduits chacun de son côté, sans que rien ne le dise : un type déduit de travers
    rendait donc muette toute une partie du rapport sans explication.
    - `deduireTypeBienOutil2()` par ordre de fiabilité (dossier CLAIRE lié, puis le texte, puis
      « maison » par défaut — le cas majoritaire, et le seul qui n'ajoute aucun contrôle, donc le
      repli le moins coûteux) ; `typeBienPourAudit()` laisse la correction manuelle l'emporter sur
      tout. La copropriété est testée avant le terrain : son détecteur gère les clauses de négation,
      le motif du terrain non. `estTerrainABatir()` reste la seule définition du terrain à bâtir,
      appelée depuis la déduction plutôt que recopiée.
    - **Ce n'est pas qu'un affichage** : `estCopropriete` et `estTerrain` en découlent désormais
      dans les DEUX analyseurs, donc la correction change réellement les contrôles exécutés. Le
      rapport dit lesquels (`CONTROLES_PAR_TYPE_BIEN`), et le message du bloc « annexes » vide
      nomme les pièces attendues POUR CE TYPE — annoncer un état daté sur une maison ferait croire à
      un contrôle qui n'a pas lieu d'être.
    - `dernierAuditContexte` garde de quoi **rejouer l'analyse sans refaire le travail asynchrone**
      (lecture des PDF, récupération de l'avant-contrat sur le NAS) : la correction est instantanée,
      tout étant calculé en local. Les constats déjà obtenus du modèle local y sont conservés et
      réinjectés — les perdre obligerait à relancer plusieurs minutes de calcul pour un simple
      changement de type. Le choix manuel est remis à zéro dès que les documents ou le mode changent
      (il se rapporte à l'acte analysé, pas à la session).
  - **Piège de cascade CSS, sixième occurrence** (après `.select-edit`, `.input-inline`,
    `.pdf-recherche-input`, `.revision-saisie`, `.input-classif`) : `.audit-entete select#audit-type-bien`
    pour battre la règle générique `select { width: 100% }`. Et **piège de grille**, le même que
    celui déjà payé sur `.af-grid > *` : une piste a un minimum automatique égal à son contenu, si
    bien que la largeur minimale du tableau élargissait la page entière au lieu de faire défiler le
    seul tableau — 219 px de débordement à 400 px de large, mesurés, corrigés par
    `.audit-grid > * { min-width: 0 }`.
  - Tests : `tests/outil2-parties-carnet.test.js` (15) ; le garde-fou structurel des sections de
    `tests/outil2-lecture-acte.test.js` mis à jour avec les deux nouvelles catégories. Suite racine
    655 → 670, serveur inchangée (215 — chantier entièrement côté client). **Vérifié de bout en
    bout dans un vrai Chromium** (serveur réel, pdf.js simulé puisqu'il reste bloqué par le proxy
    de cet environnement, clair et sombre, 1500 px et 400 px) sur un projet de copropriété portant
    les quatre sujets : type déduit « copropriété » avec la liste des contrôles ajoutés, fiche
    portant « Pacsés — régime non précisé », deux constats de statut, deux tableaux de travaux (acte
    et carnet) aux bonnes colonnes, constats du carnet dans la section « annexes », et la correction
    du type en « maison » puis « terrain » qui retire ou ajoute réellement les sections
    correspondantes. Aucune erreur JS.

- **Quatre réponses de l'étude sur Outil 2, dont une qui renverse la priorité : le défaut n'est pas
  ce qu'il rate, c'est qu'il « signale trop de choses sans intérêt ».** Questions posées à sa
  demande explicite (« des questions pour améliorer et te permettre de comprendre ce que l'on fait
  en relisant les projets d'acte ? »). Les quatre réponses, à garder en tête avant tout chantier
  sur cet outil :
  1. **Le problème est le BRUIT**, pas les manques — le point resté ouvert depuis « il rate des
     choses » est donc tranché dans l'autre sens : il n'y a pas de motif à élargir, il y a du
     signal à retirer.
  2. **L'erreur la plus coûteuse est une divergence avant-contrat / acte passée inaperçue** (une
     partie, un prix, des quotités, une désignation qui changent d'un acte à l'autre).
  3. **Aucune trame de relecture écrite** : rien à calquer, c'est l'habitude.
  4. **Aucun acte réel à fournir pour l'instant** — donc, règle déjà écrite ici et appliquée à la
     lettre : **ne toucher à aucun motif**. Élargir ou resserrer une regex sans l'acte est ce qui a
     déjà provoqué plusieurs régressions dans ce fichier.
  Deux changements seulement, tous deux structurels et sans une seule regex touchée :
  - **Chaque rubrique du rapport peut être masquée une fois pour toutes**
    (`rubriquesMasqueesAudit`, clé `audit-rubriques-masquees`, `basculerRubriqueDans()` pure et
    testable). Faute d'acte réel, deviner QUELLES rubriques sont du bruit reviendrait à resserrer
    des motifs au jugé : c'est donc l'étude qui tranche, rubrique par rubrique. **Distinct de
    `memoireAuditConstats`** (« Écarter » UN constat, reconnu ensuite par similarité de clause —
    voir son historique) : ici c'est une rubrique entière qui disparaît quel que soit son contenu,
    le bon geste quand un sujet n'intéresse jamais l'étude, là où écarter un à un les constats d'un
    sujet qui revient sur chaque acte ne finirait jamais.
    - **Jamais silencieux, et c'est le garde-fou du mécanisme** : les rubriques masquées sont
      listées en pied de rapport AVEC le nombre de constats qu'elles retiennent sur l'acte en cours
      (`renderRubriquesMasqueesAudit`). Masquer ne doit pas pouvoir avaler un constat critique sans
      que rien ne le dise.
    - Une section vidée par un masquage n'écrit plus « rien à signaler » mais « N rubrique(s)
      masquée(s) » — c'est exactement la confusion que ce rapport combat déjà ailleurs (« rien à
      signaler » lu à la place de « rien n'a pu être contrôlé »).
    - `basculerRubriqueDans()` refuse toute clé absente de `SOUS_SECTIONS_RAPPORT_OUTIL2` et
      nettoie les entrées mortes au passage : sans ce garde-fou, une rubrique renommée laisserait
      une entrée que plus aucun bouton du rapport ne pourrait retirer.
    - Le bouton n'est proposé que sur les rubriques de CONSTATS, jamais sur les tableaux (travaux,
      obligations) : ceux-là portent justement la comparaison avant-contrat / projet, c'est-à-dire
      la réponse n°2 ci-dessus.
  - **L'écart avant-contrat / projet est annoncé dès l'en-tête** (`renderEcartsAudit`), au-dessus
    des sections : il vit dans la deuxième d'entre elles, parfois deux écrans plus bas, alors que
    c'est l'erreur que l'étude dit lui avoir coûté le plus cher. **Trois états bien distincts,
    jamais confondus** : *Non comparé* (aucun avant-contrat de référence), *Aucun écart* (comparé,
    rien trouvé — c'est là que se trouve la réassurance cherchée, d'où l'affichage même à zéro), et
    *N écart(s)* avec un bouton qui fait défiler jusqu'à la section.
    - **Bug corrigé au passage, trouvé en construisant ce bandeau** : `messageBlocAuditVide()`
      écrivait « Aucun écart relevé entre l'avant-contrat et le projet » **même quand aucune
      référence n'avait été fournie** — donc quand aucune comparaison n'avait eu lieu. Rassurer
      l'étude sur le point précis qu'elle vient de désigner comme le plus coûteux, sans avoir rien
      comparé, était le pire cas possible. Nouveau drapeau `comparaisonFaite` sur le résultat de
      `analyserProjetVenteOutil2()` (« une référence était-elle disponible ? », pas « un écart
      a-t-il été trouvé ? »), consulté par les deux endroits.
  - Tests : 5 nouveaux dans `tests/outil2-lecture-acte.test.js` (bascule d'une rubrique dans les
    deux sens, clé inconnue et entrée morte, les trois états du bandeau, le message de section vide
    qui n'affirme rien sans référence, `comparaisonFaite` posé d'après la seule disponibilité d'une
    référence). Suite racine 670 → 675, serveur inchangée (215 — chantier entièrement côté client).
    **Vérifié dans un vrai Chromium** (serveur réel, rapport fabriqué en mémoire, pdf.js et Ollama
    restant bloqués ici) en clair et en sombre : les trois états du bandeau, masquage d'une
    rubrique qui disparaît de la section et réapparaît en pied avec son compte, persistance en
    `localStorage`, réaffichage qui la remet à sa place, aucune erreur JS, aucun débordement
    horizontal à 400px.

- **Stress test sur TOUS les PDF réels envoyés par l'étude** (« Tu pourrais faire un stress test avec
  tous les avant-contrats et PDF que je t'ai envoyés… ? ») : 8 avant-contrats (dont 2 scans), le
  projet de vente BOURGUEIL, 3 offres de prêt, 3 convocations avec décompte, 2 certificats
  d'alignement, 2 avis de taxe foncière et le dossier NAS réel « NEW_DOSSIER » (16 PDF). **Méthode,
  à réutiliser** : banc dans le scratchpad (`stress/`), pdf.js 3.11.174 (la version de CLAIRE) pour
  extraire le texte EXACTEMENT comme l'outil le lit (items joints par une espace, un `\n` par page,
  plus les items bruts avec leur position pour `lignesDepuisItemsPdf`), tesseract pour les scans,
  puis chaque détecteur rejoué via `tests/helpers/load-app.js`. Les tests de régression reprennent la
  STRUCTURE de chaque passage fautif avec des noms, adresses et montants inventés
  (`tests/stress-actes-reels.test.js`, 19 tests — 13 des 15 premiers échouaient sur la version
  d'avant, vérifié en les rejouant contre `HEAD`). Ce qui a été corrigé :
  - **Parties / nom du dossier** : nom composé écrit par pdf.js avec des espaces autour du tiret
    (« DUPRÉ - LEBLANC », `normaliserEspacesNom`) ; « Ci - après dénommé » accepté ; un conjoint cité
    (« veuf en premières noces de Madame X », « pacte civil de solidarité avec Madame Y ») n'est plus
    pris pour une partie (`RE_LIEN_FAMILIAL`) ; le bloc de chaque partie est borné par la partie
    suivante ET par les titres qui closent la présentation (`RE_FIN_PRESENTATION_PARTIES` : QUOTITÉS
    VENDUES/ACQUISES, PRÉSENCE-REPRÉSENTATION, DÉCLARATIONS DES PARTIES…). Sur PUV FERNANDES, le nom
    passait de 5 personnes toutes « VENDEUR » à « SIMOND & FERNANDES PINTO / ROUSSELIÈRE ».
  - **Dépôt de garantie / indemnité d'immobilisation** : la somme retenue est celle VERSÉE, pas
    l'indemnité stipulée (`detecterDepotGarantieDetail` → `{montant, total, index}`) — sur une promesse
    unilatérale, 10 350 € versés sur 20 700 € stipulés ; déduire le total dans l'appel de fonds aurait
    fait réclamer trop peu au client. Une phrase de versement doit avoir un verbe de remise ET un
    détenteur (comptabilité, séquestre, notaire), et jamais parler du SOLDE (dû seulement si la vente
    échoue). Le séquestre est cherché autour du VERSEMENT, plus autour de la première mention du mot —
    qui tombait sur la clause de levée d'option. Résultats sur les actes réels : PUV 10 350,
    BOURGUEIL 4 600, MOKADEM 11 000, LAUNAY 2 000 (sur 29 000), BOUCHE 1 000, BONNIN 8 745, VERLAY 1 750.
  - **Adresse** : désignation des trames d'office (« DÉSIGNATION A BLOIS (LOIR-ET-CHER) 41000 1 Rue… »,
    « Commune de X (41000) … située … ») lue en premier (`adresseDesignationTrame`).
  - **Agence** : « négociées par l'agence "LGM IMMOBILIER" » — le pluriel et les guillemets n'étaient
    pas acceptés, l'outil retombait sur « par l'intermédiaire de Monsieur X », c'est-à-dire le
    NÉGOCIATEUR. Trouvé aussi sur BAUDRY (« BLOIS IMMO », non détecté auparavant).
  - **Dates** : « au plus tard dans les 2 mois ET DEMI » (+15 jours, `echeanceDepuisDelai`) ; une date
    ÉCRITE l'emporte sur la date calculée de la même clause dans `meilleureCandidateEcheance` (même
    règle que `construireDatesMetier`, qui ne s'appliquait pas au formulaire) ; « L. 313-41 » et
    « 20.700 » ne coupent plus le contexte d'une date (`pointNonTerminal`) ; un délai de VERSEMENT
    (indemnité, virement) n'est plus classé « prêt » par le titre de sa clause
    (`RE_DELAI_DE_VERSEMENT`) ; achat sans prêt : « ne recourir à aucun prêt », « absence de condition
    suspensive d'obtention de prêt ».
  - **Engagements du vendeur** : apostrophe typographique (« s’engage »), et la tournure « que le
    VENDEUR remette/fasse/justifie… » des conditions particulières ; « nouvelles législations » exclu.
  - **Offre de prêt — montant emprunté** : les offres réelles n'emploient PAS la reprise entre
    parenthèses mais un montant par prêt en tableau (« Montant total du crédit : 294 000,00 EUR ») —
    le montant n'était jamais lu, l'apport jamais affiché. Les prêts sont additionnés, **sauf un prêt
    relais** (il se rembourse par la vente de l'ancien bien, il ne finance pas l'achat).
    Résultats : 321 036 / 103 399 / 74 506.
  - **Appel de fonds — décompte d'un confrère** : un libellé coupé par la mise en page (« …frais et
    droits de l'acte de » / « prêt » à la ligne suivante) laissait « prêt » en libellé orphelin, et le
    libellé tronqué était renommé « …acte de vente » puis contrôlé contre le barème de la vente. Une
    ligne de un ou deux mots en minuscules sans montant est désormais rattachée à la ligne
    précédente (`AF_FIN_LIBELLE_RE`) ; « acte de prêt » est gardé tel quel par la normalisation ; « € € »
    en fin de ligne accepté (le « Soit au total » passait sinon pour une ligne). Recalcul identique au
    solde des trois confrères au centime.
  - **Outil 2 — certificat d'urbanisme, trois défauts sur le vrai CU du dossier NAS** :
    (1) la date retenue était celle du PLU cité dans les visas (« Vu le PLUi approuvé le 29 novembre
    2022 »), d'où un **faux CRITIQUE « périmé depuis mai 2024 »** sur un certificat demandé en juin
    2026. La date d'un CU est désormais celle de sa DÉLIVRANCE et d'elle seule
    (`datesCertificatUrbanisme`, jamais « la première date du document ») ; faute de date lisible, la
    date de DÉPÔT de la demande suffit à conclure qu'il est valable au moins 18 mois après elle ;
    (2) les **servitudes AC1 / avis de l'ABF**, écrites en lettres espacées par le PDF (« ( A B F ) »),
    n'étaient pas vues — le point « protection du patrimoine » manquait ; (3) un renvoi (« le
    certificat d'alignement est à demander à… »), la clause de style « droit des tiers … que le
    certificat ne vérifie pas » et les visas ne produisent plus de point de vigilance
    (`occurrenceUtileCertificat` ; les visas s'arrêtent au « CERTIFIE » du dispositif, `RE_VISA_CU`).
  - **Outil 2 — bruit** (la plainte de l'étude, voir l'entrée précédente) : le tableau des durées de
    validité et les phrases normatives (« doit être annexé ») ne comptent plus comme mention d'un
    diagnostic (`mentionDiagnosticUtile`) ; les diagnostics sans date sont regroupés en UN constat
    par famille ; une voie de droit ouverte (« pourra engager une action en justice ») n'est plus une
    « procédure en cours » (`RE_PROCEDURE_NORMATIVE`) ; le statut des acquéreurs est cherché dans leur
    seule présentation (`zonePresentationAcquereur`), le régime dans la phrase du statut, avec « non
    engagé(s) dans les liens d'un PACS » comme négation ; « annexe » seul ne vaut plus travaux
    extérieurs. Constats par acte avant → après : PUV 12 → 4, FERNANDES 13 → 2, BAUDRY 18 → 8,
    MOKADEM 12 → 5, LAUNAY 12 → 5. Projet BOURGUEIL contre sa promesse : 5 constats pertinents, aucun
    faux écart.
  - **Vérifié sans rien changer** : les 16 PDF du dossier NAS réel sont tous reconnus par leur NOM
    (certificat d'urbanisme, alignement ET numérotage sur le même fichier, préemption, diagnostics,
    taxe foncière, entretien chaudière, offre de prêt), quel que soit le type de vente.
- **Bloc « Conditions suspensives et particulières » de l'analyse juridique : supprimé.** Présent
  depuis l'import initial du projet, sans justification écrite : il reprenait les rubriques en
  majuscules des sections « Conditions suspensives » / « Conditions particulières » d'une trame
  d'agence précise (titres seuls sur leur ligne, pied de page « Compromis de vente … Page X sur Y »).
  Le texte pdf.js n'ayant qu'un retour à la ligne par page, il restait vide sur les PDF réels — et,
  le bloc étant masqué quand il est vide, l'étude ne l'avait jamais vu. À sa demande (« teste, et si
  rien d'intéressant ne ressort, supprime »), rejoué sur les 10 avant-contrats réels, y compris avec
  des lignes reconstruites depuis les positions pdf.js (`lignesDepuisItemsPdf`) : **0 résultat sur
  9 actes**, et sur le dixième (VERLAY, scanné) 13 rubriques sans rapport (servitudes, impôts,
  assurance…) étiquetées à tort « suspensives ». Relevé à la main sous les titres « conditions
  suspensives » des 10 actes, le contenu réel se réduit à la condition de prêt (déjà suivie par les
  dates et la carte « Obtention du prêt ») et, sur un seul acte, à l'obtention d'un certificat
  d'urbanisme — trop peu pour une réécriture. Retirés : `extraireConditions`,
  `extraireConditionsSuspensives`/`extraireConditionsParticulieres` et `decouperEnRubriques` (ces
  trois-là n'étaient déjà plus appelées), `renderCondition`, `#analyse-section-conditions`, le bloc
  de la fiche, les règles `.condition-*`, le champ `conditions` de l'analyse (plus écrit à la
  création, plus conservé à l'import — un dossier ancien qui le porte encore s'affiche normalement,
  le champ est ignoré) et son test. `extraireSection` est conservée : elle sert à la désignation du
  bien. **Ne pas le réintroduire sans demande explicite**, et le cas échéant en partant des titres
  de clause et des 10 actes du stress test, jamais des retours à la ligne.
- **Une obligation du vendeur de fournir un document ou de justifier d'un entretien n'apparaissait
  pas toujours dans « Documents et pièces identifiés »** (signalé par l'étude). Reproduit sur deux
  actes réels, trois causes :
  - **Catalogue trop strict** (`DOCUMENTS_VENDEUR_CONNUS`) : BONNIN écrit « un nouvel entretien de
    chaudière » — le motif exigeait « entretien DE LA chaudière ». Motifs chaudière/PAC élargis à
    « entretien … chaudière » dans une fenêtre de 30-40 caractères (ils ne sont testés que DANS une
    clause d'engagement, jamais sur tout l'acte, donc sans risque de faux positif large) ; ramonage
    étendu au verbe « ramoner » (et `OBJET_ENTRETIEN_RE` avec lui, sans quoi la clause n'était même
    pas retenue comme obligation), au poêle et à l'insert ; « facture finale du constructeur » /
    « de l'entreprise » / « de l'artisan » rattachée aux factures de travaux.
  - **Pas de repli hors catalogue** : une obligation dont la pièce n'est pas au catalogue
    (MOKADEM : « l'attestation d'acquittement de la prime définitive », « les plans des réseaux »)
    ne produisait RIEN. `documentsDepuisClause()` donne désormais un document **générique** nommé
    d'après la clause (verbe de remise → objet, destinataire et délai retirés — `libelleDocumentGenerique`),
    marqué `generique: true`, **sans clé de checklist** : il n'est pas cherché sur le NAS (aucun nom
    de fichier fiable à attendre), mais il ne disparaît plus en silence. Uniquement pour une
    obligation de type document ou entretien — des travaux ne sont pas une pièce à réclamer.
  - **Une énumération** (« les documents ci-après énumérés : - a ; - b ») est traitée élément par
    élément (`elementsEnumeresClause`) : le premier document reconnu masquait les suivants.
  - **Les ajouts et corrections à la main ne recalculaient pas la liste** : sélection dans le PDF,
    saisie libre du wizard, correction d'une obligation (import ou fiche), ajout sur une fiche
    enregistrée. Tous passent par `completerDocumentsIdentifies(documents, [nouvelle])`, qui AJOUTE
    les documents de la seule obligation touchée sans recalculer le reste — un recalcul complet
    ferait revenir un document que l'étude a retiré à la main. Même traitement pour les suggestions
    du modèle local, qui recalculaient jusqu'ici toute la liste pour cette raison-là. Sur une fiche,
    un document du catalogue ainsi ajouté rejoint aussi la checklist de pièces (via
    `clesChecklistDepuisDocuments`, déjà rétroactive), donc la recherche sur le NAS.
  - Rejoué sur les 10 avant-contrats : chaque obligation de type document ou entretien produit
    désormais au moins un document. Six tests dans `tests/engagements.test.js` (structures réelles,
    noms inventés). Vérifié dans un vrai Chromium : ajout libre dans le wizard et ajout sur une fiche
    enregistrée mettent la liste à jour immédiatement.
- **Constats du stress test laissés ouverts** (à trancher avec l'étude, pas des oublis) :
  - L'adresse de l'OFFICE notarial lit le CRPCEN (« CRPCEN 41089 ») comme un code postal —
    cosmétique, le département retombe juste par coïncidence (41).
  - Les deux scans (VERLAY, BANCQUART) : prix manuscrit illisible par l'OCR, et adresse de BANCQUART
    prise dans la procuration annexée. L'attestation d'entretien de chaudière du dossier NAS est
    manuscrite : rien d'exploitable. Limites d'OCR, pas de règle à corriger.
  - La signature électronique de BAUDRY et BONNIN n'est pas dans le texte (seulement les métadonnées
    du PDF) ; la promesse BOUCHE laisse la date d'expiration EN BLANC dans le document lui-même.
  - BOURGUEIL : « le PROMETTANT s'engage à rembourser tous appels de fonds travaux » ressort en
    engagement de travaux — mineur, non corrigé sans second exemple.

- **Réglages : mode sombre et « À propos » y passent, envoi par Gmail uniquement ; nouvel outil
  « Quotités d'acquisition »** — quatre demandes de l'étude dans le même message :
  - **Mode sombre en interrupteur** dans une carte « Sur ce poste » en tête des Réglages (`.switch`
    déjà utilisé par le wizard, coloré `--focus`), à côté de la notification Windows passée au
    même format. `appliquerTheme()` resynchronise l'interrupteur ; `basculerTheme()` reste mais n'a
    plus de bouton. **Le pied de la sidebar est vidé** (thème et « À propos » en sont retirés, avec
    `.sidebar-footer-row`/`.sidebar-link-apropos`) : il n'y reste que le bouton d'installation PWA,
    et le pied entier est masqué avec lui (`afficherBoutonInstallation`) — sinon un filet de
    séparation sans rien dessous. Interprété comme un DÉPLACEMENT ; à rétablir en une ligne si
    l'étude voulait aussi garder l'accès rapide.
  - **« À propos » dans les Réglages** : carte en pied d'écran, version affichée, bouton qui ouvre
    la même fenêtre qu'avant (`ouvrirAPropos`, inchangée).
  - **Envoi des rappels par Gmail uniquement** : le formulaire ne demande plus que le compte Gmail,
    son mot de passe d'application, la boîte-passerelle et l'adresse de copie. Serveur, port,
    chiffrement et expéditeur ne sont plus saisis : le client envoie `GMAIL_SMTP`
    (`smtp.gmail.com`, 587, STARTTLS) et un expéditeur vide. **Le serveur n'est pas touché** : son
    transport SMTP reste générique et ses tests inchangés — seul le formulaire est fermé, si l'étude
    obtient un jour des droits Microsoft 365 il suffit de le rouvrir. La procédure de l'écran et
    `server/README.md` ne décrivent plus que Gmail.
  - **« Quotités d'acquisition »** (section Outils, onglet `#onglet-quotites`), porté de l'artefact
    « Quotité des acquéreurs » de l'étude : proportions de chaque acquéreur d'après l'origine du
    financement, et annexe « Nature et quotités des droits acquis » téléchargeable en `.docx`.
    **Repris** : la structure (nature du bien, acquéreurs, montant de l'opération avec lignes
    « mémoire », sources de financement apport/prêt réparties par acquéreur) et le **texte des
    clauses mot pour mot** — modèle rédactionnel de l'étude, à ne pas reformuler sans lui (même
    règle que `PROCEDURE_FONDS`). **Abandonnés** : la palette or/crème et les polices de
    l'artefact (gabarit `.af-grid`/`.af-form`/`.calc-card` et jetons de CLAIRE), et ses montants
    d'exemple (champs vides, comme les autres simulateurs). **Deux corrections de fond** :
    `repartirPourcentages()` répartit au plus fort reste — arrondies séparément, trois parts égales
    donnaient 99,99 %, une annexe qui ne totalise pas 100 % ne se signe pas ; et un acquéreur qui
    ne finance rien est signalé (quotité nulle), plutôt qu'écrit « 0,00 % » dans l'acte. Relié à
    Outil 1 par une recherche de dossier (`prefillQuotites`) : acquéreurs, nature du bien, prix,
    et le montant du prêt **seulement s'il n'y a qu'un acquéreur** — à plusieurs, sa répartition
    ne se devine pas et le récapitulatif « À compléter » le dit. L'aperçu est une feuille (fond
    blanc, Times New Roman) dans les deux thèmes, comme le courrier d'appel de fonds. La
    bibliothèque `docx@9.7.1` (celle de l'artefact) est chargée à la demande depuis
    cdn.jsdelivr.net au premier téléchargement — aucun nouveau fichier statique à déclarer. Tests :
    `tests/quotites.test.js` (8). **Non vérifié** : la génération du `.docx` elle-même (CDN bloqué
    dans cet environnement) — mise en page et appels repris à l'identique de l'artefact, où
    l'étude les a déjà utilisés.

- **Notifications (« toasts ») : petite carte en bas de la sidebar qui s'efface d'elle-même**,
  demandé par l'étude avec une capture de l'ancienne bulle (« peuvent-elles apparaître plutôt en
  bas […] sous forme de petite carte rectangulaire qui disparaît ensuite ? »). L'ancienne bulle
  sombre centrée en bas de l'écran passait par-dessus le contenu qu'on lisait. Désormais une carte
  de 220 px (la largeur des liens de navigation) posée dans le pied de la sidebar, resté vide
  depuis que le thème et « À propos » sont passés dans les Réglages — interprétation de « la sodé
  bas » comme « la sidebar » ; si l'étude voulait le coin bas-droit, c'est `left` → `right` dans
  `.toast`. Fond de carte du thème (`--paper-card`, `--line`, `--shadow-float`) au lieu de
  couleurs en dur, bouton en `--focus`.
  - Apparition/disparition en fondu (`.toast.visible`, 180 ms), `display: none` posé 200 ms après
    le retrait de la classe (`masquerToast()`) : un `transitionend` ne se déclencherait pas quand
    `prefers-reduced-motion` coupe la transition.
  - Filet de 2 px qui se vide pendant les 6 s (`.toast-duree`, animation CSS) : dit combien de
    temps la carte reste, sans chiffre à lire. **Pause au survol** (`en-pause` +
    `animation-play-state`, minuteur suspendu puis relancé sur le temps restant) — le temps de
    lire un nom de fichier long ou de viser « Annuler » avant que la carte ne parte.
  - Un nouveau message pendant qu'une carte est affichée relance le filet (classe retirée, reflow
    forcé, classe reposée). `role="status"` + `aria-live="polite"` ajoutés.
  - Sous 900 px (sidebar repliée) : pleine largeur en bas de l'écran, gouttières de 16 px.
  - `z-index: 890` conservé, toujours sous le tiroir de fiche dossier (900) pour la raison déjà
    documentée. Vérifié dans un vrai Chromium (clair, sombre, 400 px) : position, pause au
    survol, disparition, aucun débordement, aucune erreur JS.

- **Réglages : le bouton « Tester » vérifie l'adresse AVANT d'envoyer, et affiche celle qu'il a
  utilisée.** Demandé par l'étude juste après la première chaîne complète CLAIRE → Gmail →
  boîte-passerelle → Power Automate → Teams (confirmée fonctionnelle le 23/09) : le flux avait
  d'abord échoué sur une adresse à laquelle « il manquait un s », alors que l'étude pensait l'avoir
  corrigée. Or une faute de DOMAINE (« notaire.fr » pour « notaires.fr ») passe tout contrôle de
  forme et ne se révèle qu'au bout de la chaîne, dans l'historique du flux.
  - `controlerAdresseEnvoi(adresse, adresseReference)` (pure, testable,
    `tests/controle-adresse-envoi.test.js`) : `erreur` bloquante si l'adresse est impossible (vide,
    espace, @ absent ou doublé, domaine sans point, point doublé ou final), `avertissement` si elle
    est bien formée mais sur un autre domaine que la boîte-passerelle. Un avertissement seulement —
    un locataire Microsoft 365 peut porter plusieurs domaines — avec un lien « Envoyer quand même ».
  - **Le test part vers l'adresse ENREGISTRÉE, pas vers celle du champ** (voir le commentaire de
    `testerEnvoiResponsable`). `reglagesEnregistres` mémorise la dernière lecture/écriture serveur ;
    un champ modifié mais pas enregistré bloque le test avec un message qui nomme l'adresse vers
    laquelle il partirait encore. C'était très probablement le piège du « pourtant j'ai corrigé ».
  - Côté serveur, `adresseEmailValide()` (`server/src/routes/reglages.js`) refuse une adresse ou une
    passerelle malformée avant tout envoi (400, « Rien n'a été envoyé »), et la réponse d'un envoi
    réussi porte `destinataire` et `passerelle` : l'écran affiche « boîte-passerelle X, objet
    (destinataire Teams) Y » pour qu'on relise l'adresse avant d'aller chercher le message dans Teams.
  - Tests : 5 côté client, 3 côté serveur (+ une assertion existante étendue). Suite racine 707 → 712,
    serveur 215 → 218.

- **Appel de fonds réalisé dès que sa date est saisie, et quatre retouches voisines** (23/09) :
  - **Saisir la date de l'appel de fonds sur la fiche le marque réalisé** (`marquerAppelFondsSelonDate`,
    pure et testable, appelée par `validerEditionDate` et `supprimerDateEcheance`) : l'étude ne note
    cette date qu'une fois l'appel parti. Pose `d.echeancesValidees.appelFonds` — le même drapeau que
    « Marquer réalisée », donc le planning passe aussitôt au rendez-vous de signature. **Vider ou
    supprimer la date retire la validation** : sinon un appel de fonds sans date resterait « fait ».
    « Annuler la validation » reste disponible si la date a été saisie en avance.
  - **Titre « Appel de fonds » en gras** sur sa carte (`tab-name-fort`, comme le rendez-vous).
  - **La section « Appel de fonds » du bas de fiche disparaît une fois l'appel fait**
    (`renderAppelFondsDossier` sort sur `echeanceValidee(d, 'appelFonds')`) — plus rien à préparer.
  - **« Courriel alignement et numérotage »** : déjà reconnu pour les deux pièces par les alternatives
    existantes (vérifié avant de toucher la regex) ; ajout de `courriel (d')alignement` à
    `certificatAlignement.motifNom` pour un courriel d'alignement seul. Un « alignement » nu reste
    refusé (le garde-fou « réponse alignement voirie » est retesté).
  - **Titres de colonne dans la vue Échéances** (Date / Échéance / Dossier / Responsable), posés UNE
    fois, sur le tableau du premier groupe : les largeurs étant fixes et identiques d'un groupe à
    l'autre (`table-layout: fixed`), ces titres restent alignés sur toutes les semaines en dessous.
  - Tests : +5 (`echeances-appel-fonds`, `dossier-local`, `semaines`). Suite racine 712 → 717.

- **Agenda connecté (`/calendrier.ics`) réduit à l'obtention du prêt et à la vente préalable**,
  demandé par l'étude une fois l'abonnement Outlook confirmé fonctionnel : « ne mets dans l'agenda
  que les rappels de prêt et de vente préalable si c'est activé dans le dossier ; si on a l'offre de
  prêt retire le rappel, idem si la vente préalable a été signée ; ne mets pas les autres dates ».
  - `echeancePublieeAgenda(d, type)` (`server/src/routes/calendrier.js`, pure, exportée) : publié
    seulement si le dossier n'est pas archivé, que la date existe (une vente préalable non cochée à
    la création n'a pas de date), que le prêt n'est pas `sansPret`, et que l'échéance n'est pas
    RÉALISÉE — `echeanceValidee()` est importée telle quelle de `jobs/rappels.js` (offre `recue` ou
    « Marquer réalisée » pour le prêt, « Marquer réalisée » pour la vente préalable), jamais
    recopiée. Une offre seulement « à confirmer » n'est pas reçue : l'échéance reste publiée.
  - **Les autres échéances sont publiées ANNULÉES, jamais simplement omises** (`TYPES_RETIRES_AGENDA`
    + les `d.autres`, et le prêt/la vente préalable une fois réalisés) : un Outlook déjà abonné
    garde indéfiniment un événement qui disparaît du flux, seul `STATUS:CANCELLED` sur le même UID
    le retire (voir le correctif `.ics` plus haut). Mêmes UID stables qu'avant, donc les dates
    déjà publiées (appel de fonds, rendez-vous, date butoir, échéances personnalisées) disparaissent
    d'Outlook à la prochaine resynchronisation.
  - Tests : `server/test/calendrier.test.js` réécrit sur ce contrat (seuls prêt et vente préalable
    confirmés, les quatre autres annulés ; offre reçue ou validation manuelle qui retire le prêt,
    offre « à confirmer » qui le garde ; vente préalable validée retirée ; `sansPret` sans prêt).
    Suite serveur 220.

- **Correctif : l'agenda connecté affichait encore les échéances « retirées », empilées sur un même
  jour.** Signalé par l'étude avec une capture Outlook (« Appel de fonds », « Obtention du prêt »,
  « Rendez-vous de signature », « Signature de l'acte », « Vente préalable » d'un même dossier, tous
  le même jour). Cause : l'entrée précédente publiait ces échéances en `STATUS:CANCELLED`, sur
  l'hypothèse qu'un client garde indéfiniment un événement qui disparaît du flux. **C'est faux pour un
  abonnement Internet Outlook** : il remplace le calendrier entier à chaque resynchronisation (un
  événement omis disparaît donc tout seul) et il AFFICHE les événements annulés — tous datés au même
  jour de repli (`d.pret || d.acte || d.ventebien`), d'où la pile. `buildEventAnnule` est supprimée :
  `genererFluxIcs` ne publie plus que le prêt et la vente préalable tant qu'`echeancePublieeAgenda`
  est vrai, et omet tout le reste (dossiers archivés, dates vides, échéances réalisées, date butoir,
  appel de fonds, rendez-vous, échéances personnalisées). UID et SEQUENCE inchangés. Tests réécrits
  pour vérifier l'absence (aucun `STATUS:CANCELLED` nulle part). **Leçon** : le comportement d'un
  client calendrier se vérifie sur le client, pas dans la RFC — le correctif précédent était
  conforme au texte et faux dans Outlook. Pour forcer l'affichage à jour sans attendre la
  resynchronisation d'Outlook : supprimer l'abonnement et le rajouter.

- **La copie des rappels gardée par Gmail dans « Messages envoyés » est effacée après chaque envoi**,
  demandé par l'étude (« supprimer l'e-mail une fois la notification délivrée », puis « fais ça pour
  gmail »). Chaque rappel porte un nom de dossier et une échéance, qui n'ont pas à rester stockés
  chez Google. Le SMTP ne peut pas empêcher cette copie : il faut revenir la supprimer par IMAP.
  - **`server/src/imapGmail.js`** (nouveau), client IMAP minimal écrit à la main — sept commandes
    (LOGIN, LIST, SELECT, UID SEARCH, UID MOVE, UID STORE, UID EXPUNGE). `imapflow` écarté : sa
    journalisation à base de worker threads supporte mal l'exécutable SEA, même raison que `llm.js`
    sans dépendance. `imap.gmail.com:993`, **même compte et même mot de passe d'application** que
    le SMTP : rien de plus à saisir. Ne s'applique que si `smtpHote` est un serveur Gmail
    (`estCompteGmail`).
  - **Trois décisions** : le message est retrouvé par son **Message-ID exact** (renvoyé désormais
    par `envoyerEmail()` à partir de `info.messageId` de nodemailer), jamais par destinataire ou
    objet — le compte peut servir à autre chose ; il part dans la corbeille **puis** en est
    supprimé (`UID STORE +FLAGS.SILENT (\Deleted)` + **`UID EXPUNGE` restreint à ces UID**, jamais
    un `EXPUNGE` global qui viderait d'autres messages marqués) — sinon Gmail le garde 30 jours ;
    et un échec n'annule **jamais** l'envoi, déjà fait : c'est un avertissement, pas une erreur.
  - Les dossiers « Messages envoyés »/« Corbeille » sont lus par leurs attributs `\Sent`/`\Trash`
    (RFC 6154), pas par leur nom, localisé selon la langue du compte ; repli sur les noms anglais.
    La recherche est relancée (NOOP + 3 essais espacés de 2 s) car Gmail ne range pas toujours la
    copie avant que la recherche parte ; sans `COPYUID` après le `UID MOVE`, les messages sont
    recherchés à nouveau dans la corbeille. Le mot de passe n'est jamais repris dans un message
    d'erreur (`exiger()` ne cite pas la commande).
  - **Branchements** : `executerTacheRappels()` rassemble les Message-ID du tour (rappel principal
    ET copie à l'étude) et fait **une seule** session IMAP en fin de tour ; un échec va dans le
    nouveau `resultat.avertissements`, persisté dans le compte rendu (`assainirDernierTour`) et
    rendu en orange sous « Dernier tour de rappels » — **pas** dans `erreurs`, qui fait basculer
    l'encart en rouge et signifie « un rappel n'est pas parti ». La route de notification de pièces
    nettoie en arrière-plan, après sa réponse. `tester-email` attend le nettoyage et renvoie
    `copieGmail {effacee, erreur}` (seulement pour un compte Gmail), affiché à côté du résultat :
    c'est le seul moyen pour l'étude de vérifier le comportement sur son vrai compte.
  - **La copie reçue par la boîte-passerelle Outlook n'est PAS concernée** : CLAIRE n'a aucun accès
    à cette boîte. Elle se supprime dans le flux Power Automate (« Supprimer l'e-mail (V2) » après
    l'action Teams, exécutée seulement si celle-ci a réussi) — expliqué à l'étude, à elle de le faire.
  - Tests : `server/test/imap-gmail.test.js` (10, contre un faux serveur IMAP en `net` local —
    commandes exactes, relance, repli sans COPYUID, introuvable, connexion refusée sans mot de passe
    dans l'erreur) ; +2 dans `rappels.test.js`, +1 dans `envoi-email.test.js`, +1 dans
    `parametresRepo.test.js`. **Non vérifié en conditions réelles** : `imap.gmail.com` est
    injoignable depuis cet environnement — à confirmer par l'étude avec le bouton « Tester »
    (« Copie effacée du compte Gmail »). Prérequis possible : l'accès IMAP doit être activé dans les
    paramètres Gmail du compte (il l'est par défaut sur les comptes récents).

- **Correctif du jour même : la copie Gmail n'est plus effacée juste après l'envoi, mais DEUX
  HEURES après.** J'avais affirmé à l'étude que l'effacement ne pouvait pas gêner le flux, en
  supposant qu'il se déclenchait sur la boîte-passerelle Outlook. L'étude a corrigé : **le flux
  Power Automate a été créé sur la boîte Gmail elle-même.** Or son déclencheur relève la boîte à
  intervalles de plusieurs minutes, et dans Gmail un message envoyé à soi-même n'est qu'UN message
  portant deux libellés (Envoyés + Boîte de réception) : le mettre à la corbeille depuis « Messages
  envoyés » le retire partout. L'effacement immédiat pouvait donc supprimer le message avant le
  passage du flux — rappel parti, message Teams jamais. **Rien n'avait encore été déployé** (le
  nouveau `.exe` n'était pas installé), le défaut n'a donc jamais tourné chez l'étude.
  - **`server/src/nettoyageGmail.js`** (nouveau) : `mettreCopiesEnAttente()` range chaque
    Message-ID envoyé dans une file persistée (`parametresRepo.lireCopiesEnAttente()`/
    `ecrireCopiesEnAttente()`, clé `copies-gmail-a-effacer`, plafonnée à 500) ;
    `executerNettoyageGmail()` n'efface que les copies de plus de `DELAI_AVANT_EFFACEMENT_MS`
    (2 h). Appelée par la tâche de rappels à chaque tour : une copie disparaît donc entre 2 h et
    2 h 30 après l'envoi. Les trois envois (rappels, notification de pièces, bouton « Tester »)
    passent par la file ; plus aucun n'efface directement.
  - **Une copie introuvable à l'échéance n'est plus un avertissement** : avec un délai, elle a
    normalement déjà disparu (effacée à la main, ou par le flux s'il est un jour configuré pour).
    Seul un **échec de connexion** (nouveau drapeau `echec` sur le retour de
    `effacerCopiesEnvoyees`) produit un avertissement et un nouvel essai, abandonné après
    `MAX_ESSAIS_EFFACEMENT` (5). Compte qui n'est plus Gmail : file vidée sans tentative.
  - **Le bouton « Tester » ne vérifie plus l'effacement en direct** : effacer tout de suite la copie
    du message de test l'aurait justement empêché d'atteindre Teams. Il annonce « la copie gardée par
    Gmail sera effacée dans environ 2 h, une fois le flux passé » ; un échec se lira dans l'encart
    « Dernier tour de rappels ».
  - **Leçon** : avant d'affirmer qu'une action n'interfère pas avec le flux, demander ce qui le
    DÉCLENCHE — j'avais tenu pour acquise l'architecture n°3 documentée plus haut (déclencheur sur la
    boîte Outlook), que l'étude avait changée depuis sans que le dépôt le sache.
  - Tests : `server/test/nettoyage-gmail.test.js` (7 — délai respecté, seules les copies dues
    effacées, introuvable sans avertissement, échec retenté puis abandonné, compte non Gmail,
    dédoublonnage) ; le test de `rappels.test.js` qui vérifiait l'effacement dans le même tour est
    réécrit pour vérifier l'inverse. Suite serveur 234 → 241, racine inchangée (717).

- **Outil 2 : « acquéreur passé vendeur » corrigé à la source, cinq fausses alertes de moins, et
  l'analyse par le modèle local retirée.** Signalé par l'étude sur le couple réel promesse / acte
  de vente MOKADEM (38 pages), avec trois demandes : un rapport plus synthétique, la fin de
  l'acquéreur rangé côté vendeur, et le retrait de « l'analyse llama, qui n'a aucune plus-value ».
  Les deux PDF ont été rejoués dans le banc du stress test avant toute modification.
  - **Cause du « Rôle changé » : la référence venait du DOSSIER, pas du texte.** Avec un dossier
    CLAIRE lié, `lancerAuditActe()` prenait `referenceDepuisDossier(d)` — les parties ENREGISTRÉES
    à la création du dossier. Rejouée avec la version de l'époque (20463bb), la promesse donnait
    MOKADEM et DE SOUSA MARTINS tous deux VENDEURS : le dossier portait cette erreur, corrigée
    depuis dans l'extraction (voir « Corriger le débordement du bloc d'une partie ») mais jamais
    relue. Le code actuel lit les deux actes correctement. **Nouvelle `referenceAudit(texte, nom,
    dossier)`** : dès que le texte de l'avant-contrat est disponible (déposé, ou récupéré sur le
    NAS du dossier lié), ses parties font foi ; le dossier ne sert plus qu'à compléter ce que le
    texte n'a pas donné (prix, adresse, cadastre). **Conséquence à retenir** : un dossier créé avec
    une version antérieure garde ses parties fausses sur sa fiche — l'audit ne s'y fie plus, mais
    la fiche elle-même reste à corriger à la main.
  - **Quatre fausses alertes de l'acte réel, corrigées structurellement** :
    - *Désignation du bien différente* (CRITIQUE) : l'adresse du projet n'était pas lue, et une
      adresse VIDE était comparée comme une adresse différente. Garde-fou dans
      `comparerCompromisEtProjet` (les deux adresses doivent être lisibles), et
      `RE_DESIGNATION_TRAME_OFFICE` tolère désormais plusieurs espaces dans « D   ESIGNATION ».
    - *Date différente — Obtention du prêt* : la comparaison des DATES est supprimée. Un acte de
      vente n'a plus de date butoir ; la « date de prêt » qu'on y lit est celle de l'offre (« selon
      offre du 8 août 2026 »), sans rapport avec le butoir de la promesse. Faux positif sur chaque
      vente financée. `LIBELLES_TYPE_DATE_COMPARAISON` retirée avec elle.
    - *Document déclaré non établi* (audit énergétique) : l'acte justifiait l'absence par la loi
      (« ne relevant pas du statut de la copropriété… conformément aux dispositions de l'article
      L 126-28-1 ») — `RE_DISPENSE_DOCUMENT` gagne ces deux tournures.
    - *Cadastre* : la parcelle retenue était celle de l'**historique cadastral** (« originairement
      cadastrée section ER numéro 189 »), pas la parcelle vendue (ER 208). `RE_CADASTRE_TABLEAU`
      accepte la colonne « Surface » et « c adastre » coupé par pdf.js, il passe désormais EN
      PREMIER (la partie normalisée est la désignation actuelle), et `RE_CADASTRE_ANCIEN` écarte
      toute mention précédée de originairement/anciennement/précédemment. Rejoué sur les 29 PDF du
      stress test : 5 changements, tous des corrections, dont PUV FERNANDES qui passe d'une parcelle
      fausse (XX 101, un remaniement) à « non trouvé » — mieux vaut une case vide qu'une parcelle
      d'un autre temps.
  - **Clauses d'obligation débarrassées des débris de mise en page** (`nettoyerDebutClause`) :
    « Annexe n°9bis 28 Le PROMETTANT s'engage… », « CONDITIONS PARTICULIERES Le PROMETTANT… » —
    renvoi d'annexe, numéro de page et titre de section remontés avec la clause, le texte lu n'ayant
    qu'un retour à la ligne par page (même piège que les autres, appliqué ici au début de phrase).
  - **Bouton « Approfondir avec l'IA locale » retiré entièrement** : `approfondirAuditAvecIa`,
    `renderBoutonApprofondirIa`, `verifierDisponibiliteAnalyseIa`, le bandeau de disponibilité de
    l'onglet, la section « Relecture complémentaire par le modèle local », la route serveur
    (`server/src/routes/auditActe.js`, `/api/audit-acte/*`) et son test. **Les autres usages du
    modèle local ne sont PAS touchés** (extraction du wizard, relance ciblée d'un champ,
    confirmation d'une offre de prêt) : l'étude n'a parlé que de l'audit — à retirer aussi seulement
    sur demande. Le lien de la sidebar devient « Relecture d'actes » (icône œil) : « (IA) » y était
    devenu faux.
  - **Résultat sur l'acte réel** : de 5 constats (1 CRITIQUE faux, 2 A_VERIFIER faux) à 2, les
    deux obligations du vendeur à vérifier, citées proprement. Tests :
    `tests/outil2-reference-texte.test.js` (6, structure de l'acte réel, noms inventés), deux tests
    de `audit-comparaison` réécrits sur le nouveau contrat. Suite racine 717 → 724, serveur 241 → 233
    (le test de la route retirée).
  - **Non traité, proposé à l'étude** : la présentation « plus synthétique et structurée » (une
    grille de relecture fixe conforme / écart / non trouvé, les annexes attendues par type de
    vente). Question de fond posée plutôt que devinée, comme le veut la leçon des notaires.

- **Relecture d'actes : grille visuelle, synthèse à communiquer, mode commentaires** — demande de
  l'étude du 23/09/2026 au soir : « il faut que l'audit soit lisible comme un message que l'on
  pourrait communiquer au client. Une synthèse professionnelle. Mais aussi quelque chose de visuel
  pour s'y retrouver. Peut-être un mode où je pourrais pendant un temps mettre des commentaires
  pour que tu puisses analyser les retours et ajuster pour les suivants […] Parfois les
  commentaires peuvent être liés uniquement au dossier. Je pourrais justifier pourquoi », précédée
  de « mets tout en place » sur les propositions faites juste avant (grille fixe, annexes
  attendues par type de bien, pièces AAE du NAS, fiche aux parties périmées). Trois vues du MÊME
  résultat, jamais une seconde analyse qui pourrait contredire le rapport :
  - **Grille de relecture** (`grilleRelectureOutil2`, pure) en tête du rapport : une colonne par
    section (acte / avant-contrat / annexes), une case par rubrique avec quatre états
    (`LIBELLES_ETAT_GRILLE_OUTIL2`) — **à régler** (critique ou important), **à vérifier**,
    **rien relevé**, **non contrôlé** — plus « masqué ». « Non contrôlé »
    (`rubriqueNonControleeOutil2`) est l'état d'une rubrique dont le document n'a pas été fourni :
    le confondre avec « rien relevé » serait rassurer à tort, la confusion déjà combattue ailleurs
    dans ce rapport. Une rubrique sans objet pour ce rapport (copropriété sur une maison, permis
    hors terrain, comparaison sur un compromis — `rubriqueApplicableOutil2`) n'a pas de case,
    **sauf si elle porte malgré tout des constats** : la règle ne cache jamais un constat. Une case
    pour les engagements du vendeur (« x/y justifié(s) »). Un clic sur une case bascule sur le
    rapport détaillé et fait défiler jusqu'à la rubrique (`id="audit-rub-CLE"`, posé par
    `renderSectionAudit`).
  - **Pièces attendues par type de bien** (`piecesAttenduesOutil2`, pure), dans la colonne des
    annexes : diagnostics et certificat d'urbanisme toujours ; état daté, PV d'AG et carnet
    d'entretien en copropriété ; permis, constat d'affichage et certificat de non-recours sur un
    terrain en mode projet de vente. Trois états (fournie / partielle — un pré-état daté à la place
    de l'état daté / absente), reconnus avec les détecteurs déjà en place : les deux analyseurs
    renvoient désormais `justificatifsReconnus` (clés de `rapprocherJustificatifs`), rien de
    nouveau n'est lu.
  - **Synthèse à communiquer** (`syntheseClientOutil2`, pure), vue par défaut du rapport, bascule
    « Synthèse / Rapport détaillé » (`vueRapportAudit`, même composant `.vue-bascule` que le
    Suivi) : objet, formule d'appel, une phrase d'introduction (avant-contrat et sa date, nombre de
    pièces), **une phrase de conclusion** (N points à régler / aucun point bloquant / aucune
    observation), la conformité à l'avant-contrat **dite seulement si la comparaison a eu lieu**,
    puis « Points à régler avant la signature », « Points à vérifier », le bilan des engagements du
    vendeur, les pièces non communiquées et les questions par destinataire (« Auprès du syndic »…),
    et une réserve finale. **Seuls les points retenus y figurent** : ni les constats écartés ou
    jugés faux positifs, ni les rubriques masquées, ni les simples informations. Un engagement du
    vendeur y est désigné **par sa clause citée** (240 caractères) et non par la formule interne
    « engagement sans document type », que le destinataire ne comprendrait pas. Rendue dans un
    `<textarea>` modifiable (`syntheseAuditEditee` garde la rédaction à travers les re-rendus ;
    « Régénérer » l'abandonne), bouton « Copier » avec le repli `copierParTextarea` (presse-papiers
    absent hors contexte sécurisé, voir `copierQuestionsAudit`). Une nouvelle relecture repart de la
    synthèse générée.
  - **Mode commentaires** (interrupteur dans l'en-tête du rapport, mémorisé par poste en
    `localStorage`, clé `audit-mode-commentaires`) : sous chaque constat — et sous chaque carte
    d'engagement du vendeur, reliée à son constat par `o.constatUid` posé dans
    `preparerRapportAudit` — quatre avis (`VERDICTS_RETOUR_OUTIL2` : juste, faux positif, mal
    formulé, gravité à revoir avec la gravité juste), une **portée** (« ce dossier seulement »,
    par défaut — un avis ne se généralise que si on le choisit — ou « tous les dossiers ») et une
    **justification écrite**. En mode commentaires ces avis remplacent « Écarter / Confirmer » (deux
    façons du même geste). Un panneau propre au mode permet de signaler **ce que la relecture a
    raté** (verdict `manque`, texte obligatoire) et d'**exporter tous les commentaires en JSON**.
  - **Effets immédiats, volontairement bornés** (`appliquerRetoursAuxConstats`, pure) : un avis se
    rattache à un constat par la même empreinte que la mémoire d'audit (titre + clause citée,
    Jaccard ≥ 0.5), **dans la même catégorie seulement**, l'avis propre au dossier l'emportant sur
    l'avis général. Faux positif → constat replié (« Faux positif pour ce dossier / sur tous les
    dossiers ») et exclu du résumé, de la grille, de la synthèse et des questions
    (`constatExcluOutil2`, `resumeConstatsOutil2` — le résumé et les questions sont désormais
    RECALCULÉS dans `preparerRapportAudit` sur ce qui reste retenu, écartés compris) ; gravité à
    revoir → gravité remplacée, l'origine gardée dans `graviteOrigine` et affichée (« gravité
    corrigée par l'étude ») ; juste → liseré vert comme un constat confirmé ; mal formulé →
    seulement conservé. **Rien d'autre n'est « appris » automatiquement** : corriger une règle qui
    se trompe passe par l'export, relu à la main — même principe que le journal des corrections
    d'extraction. La clé d'un dossier (`cleDossierAudit`) est le dossier CLAIRE lié, à défaut le nom
    normalisé du document relu.
  - **Stockage serveur**, pas navigateur : les commentaires doivent survivre au changement de poste
    et être partagés. `server/src/routes/auditRetours.js` (`GET/POST/DELETE /api/audit-retours`,
    derrière le mot de passe), `parametresRepo.lireRetoursAudit()/ecrireRetoursAudit()` sous la clé
    `audit-retours`, `assainirRetourAudit()` en liste blanche (champs bornés, verdict et gravité
    dans leur énumération, plafond `MAX_RETOURS_AUDIT` = 1000, un `POST` au même `id` remplace).
    L'export contient les clauses citées des actes : à transmettre comme les actes eux-mêmes.
  - **Pièces de la rubrique AAE du NAS** : bouton « Ajouter les pièces de la rubrique AAE » sous le
    dossier CLAIRE lié (mode projet de vente, dossier relié au NAS) — liste les PDF dont un
    **segment de dossier** du chemin est « AAE » (`estDansRubriqueAAE`, jamais le nom du fichier :
    « Copie AAE PROMESSE… » est l'avant-contrat), les ajoute comme justificatifs et les lit via
    `ouvrirPdfNas` (`extraireTexteFichierAnalyseIa` accepte désormais une entrée `cheminNas` sans
    `File`). Plafond `MAX_PIECES_AAE_AUDIT` = 25, lecture l'une après l'autre (OCR possible).
    Conforme à la précision de l'étude sur la rubrique AAE (voir « Correction : l'avant-contrat
    n'est pas dans la rubrique AAE »).
  - **Fiche aux parties périmées** : quand les parties lues dans l'avant-contrat
    (`referenceLueDansTexte`) diffèrent de celles du dossier lié (`partiesDivergentes`, pure,
    insensible à la casse et aux accents), l'en-tête l'annonce avec un bouton « Mettre à jour la
    fiche » (`mettreAJourPartiesDossierAudit`, confirmé, journalisé, nom du dossier inchangé).
    **Seule écriture sur le dossier lié depuis cet écran**, et seulement sur ce clic : l'exception
    au principe « dossier lié en lecture seule » est explicite, c'est la réponse au cas MOKADEM
    (fiche créée avant le correctif des blocs de parties).
  - **Défaut vu au rendu et corrigé** : la ligne d'un fichier déposé (nom + type + statut + croix)
    débordait de 16 px à largeur de téléphone — `.analyse-ia-fichier` se replie désormais.
  - Tests : `tests/outil2-synthese.test.js` (8 — grille et ses états, rubrique masquée et constat
    exclu, pièces attendues par type, synthèse et ses exclusions, conformité dite seulement si
    comparée, portée et catégorie des commentaires, gravité corrigée puis rétablie, résumé,
    clé de dossier, parties divergentes, rubrique AAE) et `server/test/audit-retours.test.js` (4).
    Suite racine 724 → 732, serveur 233 → 237. **Vérifié dans un vrai Chromium** (serveur réel,
    textes réels du couple promesse / vente MOKADEM injectés faute de pdf.js, clair et sombre,
    1500 px et 400 px) : grille à cinq cases, synthèse rédigée, un faux positif « tous les
    dossiers » enregistré sur le serveur puis appliqué à la page suivante (constat replié, résumé
    passé de 2 à 1 point à vérifier, synthèse et bilan « 0 sur 1 » mis à jour), un oubli signalé,
    aucune erreur JS, aucun débordement.

- **Relecture d'actes refaite en quatre étapes sur l'API Claude (Outil 2 v3).** Demande de l'étude
  du 24/09/2026, accompagnée du guide IEJ/CSN « Introduction à l'intelligence artificielle » et du
  code d'un prototype construit dans une autre conversation (Next.js, « LLM du notariat » sur l'API
  Claude) : « reprends le cœur du nouveau système de relecture et adapte-le à notre outil 2 […]
  meilleure gestion des annexes, accès au dossier local complet et pas qu'AAE, deux copropriétés
  dans un même acte, la check-list du nouveau cœur + ce qu'on a déjà fait, adaptée au projet de
  vente, présentation en étapes (upload, anonymisation…), une carte de santé de l'acte à la fin,
  pas d'email rédigé, voir le projet en cliquant sur les numéros de page, et le coût de l'analyse ».
  **Décision structurante : c'est la fin de la règle « pas d'appel à un service extérieur » pour
  cet écran, voulue et cadrée par l'étude** (clé API qu'elle fournit, pseudonymisation locale).
  - **Ce qui est repris du prototype** : la grille injectée dans le prompt système, la
    pseudonymisation par jetons ⟦CATEGORIE_n⟧ avant envoi, la sortie structurée
    (`output_config.format` json_schema), la ré-identification au retour. **Ce qui est adapté** :
    - la pseudonymisation se fait **dans le navigateur**, page par page, avec **une seule table
      partagée par tous les documents** (même personne = même jeton d'un acte à l'autre, ce qui
      laisse Claude repérer une incohérence entre l'avant-contrat et le projet) ; la table ne quitte
      jamais le poste, le serveur ne reçoit que du texte déjà masqué (`anonymiserDocumentsOutil2`,
      `REGLES_ANONYMISATION_OUTIL2`, `termesConnusAnonymisation`, `desanonymiserOutil2`) ;
    - la **grille vit côté client** (`GRILLE_RELECTURE_OUTIL2`, ~47 points, filtrée par mode par
      `grillePourModeOutil2`) : les 35 points du prototype + ce qui avait été bâti ici (identité et
      capacité, quotités, désignation, occupation, situation hypothécaire, engagements du vendeur,
      AG/ALUR, copropriétés multiples, prêt obtenu, honoraires, plus-value) + une section
      « Concordance avec l'avant-contrat » propre au projet de vente ; les points du seul
      avant-contrat (rétractation, condition de prêt, clause pénale, date de réitération) ne sont
      pas posés sur un projet de vente. Le serveur la valide (`validerGrille`) sans la redéfinir ;
    - le serveur **vérifie chaque citation mot pour mot** et recalcule la page d'après sa position
      réelle (`verifierCitations`) — même principe que `localiserExtrait` côté extraction ; un point
      omis par le modèle ressort « à vérifier » (`omis: true`), jamais « validé » ;
    - les **commentaires de l'étude** (mode commentaires, stockés serveur) sont renvoyés au modèle
      comme consignes (`consignesEtudeRelecture`, section « CONSIGNES DE L'ÉTUDE » du prompt) —
      **après pseudonymisation** (`pseudonymiserTexteLibreOutil2`) : un commentaire peut citer un
      nom, il ne doit pas partir en clair par ce biais ;
    - chaque requête est **archivée pseudonymisée** avec sa réponse, ses jetons et son coût (table
      `analyses_claude`) — conseil explicite du guide IEJ.
  - **Quatre étapes** (`definirEtapeRelecture`, stepper `#relecture-stepper`) : **1 Documents** —
    dépôt, ou **parcours du dossier du NAS complet, rubrique par rubrique** (AAE et avant-contrat
    précochés, 40 pièces au plus), nature de chaque pièce devinée (`classerNaturePieceOutil2`) et
    annexes jointes au PDF principal repérées (`debutAnnexesDocumentOutil2`, envoyées marquées
    « annexe jointe ») ; **2 Pseudonymisation** — table affichée, « Masquer aussi » un terme,
    « Laisser en clair » une valeur, aperçu page par page de ce qui partira ; **3 Analyse** —
    récapitulatif, coût estimé par comptage exact des jetons (gratuit), lancement ; **4 Bilan** —
    carte de santé (anneau critique/à surveiller/validé), une tuile par section avec ses pastilles,
    détail des points (validés repliés, sans-objet en une ligne), anomalies hors grille, puces de
    page qui ouvrent une **visionneuse** à droite (pdf.js, extrait surligné), contrôles
    automatiques de CLAIRE en complément, et **coût réel** de l'analyse avec le cumul du mois.
  - **Deux copropriétés dans un même acte** : point de grille dédié (`copro_multiples`), champ
    `coproprietes` dans le schéma de sortie, et détection locale
    (`detecterCoproprietesMultiplesOutil2`) qui affiche un bandeau même sans clé API.
  - **Retirés** : la synthèse email à communiquer au client (« pas d'e-mail rédigé, j'aime pas
    finalement »), la grille visuelle et le bloc « À demander » de la version précédente — le bilan
    les remplace. `questionsOutil2` reste (utilisée par les analyseurs), sans rendu.
  - **Sans clé API**, l'écran reste utilisable : « Contrôles CLAIRE seuls » lance les analyseurs
    déterministes déjà en place (dont le bilan garde la section).
  - Serveur : `server/src/relecture/claude.js`, `server/src/routes/relectureClaude.js` (voir
    server/README.md, section « Relecture d'actes par l'API Claude »), dépendance
    `@anthropic-ai/sdk` (CJS, embarquée par esbuild dans le `.exe`). Modèles : Sonnet 5 (défaut) et
    Opus 5 (avec le repli serveur `server-side-fallback-2026-07-01`) ; flux + `finalMessage`,
    `thinking: adaptive`, `effort: high`, `max_tokens` 64 000. Clé dans les réglages, jamais
    renvoyée au navigateur ; repli sur `ANTHROPIC_API_KEY`.
  - **Pièges payés en écrivant la pseudonymisation** : le drapeau `i` rendait la commune « en
    majuscules » insensible à la casse et avalait toute la suite de la phrase ; une société
    (`SCI…`) traversait le point final ; une espace doublée par pdf.js donnait deux jetons à la même
    personne (clé désormais à espaces normalisés) ; une civilité suivie de plus de quatre mots
    laissait « SOUSA MARTINS » en clair (six mots acceptés) ; « M. I MPOT » était pris pour une
    personne (premier mot d'au moins deux lettres exigé). Rejoué sur le projet de vente réel du
    stress test : aucun patronyme des parties ne subsiste dans le texte envoyé.
  - Tests : `tests/outil2-relecture-claude.test.js` (9), `server/test/relecture-claude.test.js`
    (12, faux client Anthropic). Suite racine 737, serveur 249. **Vérifié dans un vrai Chromium**
    (serveur réel + faux client Claude qui cite de vrais passages, clair/sombre, 1500 et 400 px) :
    les quatre étapes, ré-identification des commentaires, 23 puces de page, visionneuse, coût
    affiché, aucun jeton visible dans le bilan, aucun débordement. **Non vérifié en conditions
    réelles** : pas de vraie clé API ni de pdf.js ici — la qualité de l'analyse, sa durée et son
    coût réels sur un dossier complet restent à confirmer par l'étude.

- **Carnet de bord « À faire » traité en un lot, plus un bug d'alignement et la relecture sans
  limite de pages** (24/09) — l'étude a demandé de « lancer les tâches à faire uniquement » du
  carnet de bord (artefact de suivi), en signalant au passage qu'un dossier reliait le numérotage
  mais pas l'alignement avec un document unique « Courriel alignement et numérotage.pdf », puis,
  en cours de travail, de retirer toute limite de pages de la relecture d'actes.
  - **Le bug d'alignement : une exclusion mémorisée, invisible, propre à chaque poste.** Le motif
    reconnaissait bien les deux pièces sur ce nom (vérifié avant tout — même piège que les
    signalements « toujours bugué » déjà documentés). Seul mécanisme capable de faire passer l'une
    et pas l'autre dans le MÊME parcours : `estNomExcluPourPiece`, posé par un clic sur
    « Réinitialiser » de l'alignement. Cette exclusion était globale à tous les dossiers, rangée dans
    le `localStorage` du poste, et ne se voyait nulle part : sur un nom générique comme celui-ci, un
    clic unique bloquait l'alignement sur tous les dossiers suivants, et deux postes pouvaient rendre
    deux verdicts différents pour la même pièce. Reproduit de bout en bout (serveur réel + dossier
    NAS) avant correction. Trois changements :
    - les exclusions passent **en base** (`parametresRepo.lireExclusionsPieces`, clé
      `exclusions-noms-pieces`, routes `GET/POST /api/exclusions-pieces` et `POST …/retirer` —
      volontairement pas de PUT global, deux postes qui ajoutent en même temps ne s'écrasent pas) ;
      celles déjà gardées dans le navigateur sont reprises UNE fois au démarrage
      (`reprendreExclusionsLocales`) puis effacées, pour ne perdre aucune décision humaine ;
      chargées dans `demarrerApplication()` AVANT la relecture du NAS ;
    - le parcours **journalise** chaque correspondance écartée (`exclusionsRencontrees`) et le
      diagnostic du dossier l'affiche en tête, avec un bouton « Ne plus écarter »
      (`retirerExclusionPiece`, qui relance aussitôt le parcours du dossier) ;
    - une carte **« Fichiers écartés des pièces »** dans les Réglages liste tout, avec « Rétablir ».
  - **Pièce renouvelée (ramonage, entretien, taxe foncière 2025 → 2026).** `verifierDossierLocal`
    retenait le PREMIER fichier correspondant et, une fois toutes les pièces trouvées, sortait du
    parcours : la version de l'année suivante, déposée à côté, n'était jamais vue. Désormais tous
    les candidats sont collectés (plus de sortie anticipée — sans coût, les pièces ne sont
    reconnues que par le nom) et `choisirFichierPiece` retient l'année la plus récente écrite dans le
    NOM du fichier (`anneeDansNomFichier` : 2000 à l'an prochain seulement, jamais un dossier
    parent). Stabilité : le fichier déjà retenu reste tant qu'aucun candidat n'est STRICTEMENT plus
    récent. Une pièce renouvelée est notifiée comme une nouvelle pièce, avec une ligne d'historique
    « Avis de taxe foncière (2025 → 2026) ».
  - **Lien vers la pièce dans la notification Teams.** Un clic dans Teams ne porte aucune
    authentification : la route protégée `/api/nas/fichier` aurait répondu « non autorisé » (même
    piège que `ouvrirFichierNas`). D'où un **lien signé** (`server/src/liensPieces.js`) : HMAC-SHA256
    du chemin et d'une date d'expiration (90 jours), secret généré une fois en base
    (`lireSecretLiens`), servi par `GET /piece` monté HORS authentification mais avec exactement les
    garde-fous de `/api/nas/fichier` (confinement à la racine, PDF seulement). L'adresse du serveur
    est celle par laquelle le poste l'a joint, `localhost` remplacé par l'adresse du réseau local
    (`adressesLan`, sortie de `index.js` vers `server/src/reseau.js`). Le client envoie désormais
    `pieces: [{label, chemin}]` ; la route accepte encore l'ancienne forme (chaînes seules).
  - **Responsable prévenu quand un dossier est complet** (offre reçue ou sans prêt + toute la
    checklist reçue) : `signalerSiDossierDevenuComplet` → `POST /api/notifications/dossier-complet`,
    même envoi que les notifications de pièces (`envoyerAuResponsable`, factorisé, copie à l'étude
    comprise). **Une seule fois** : `d.completNotifieLe`, effacé si le dossier cesse d'être complet
    (le prochain passage sera de nouveau annoncé). Jamais pour un dossier archivé ni une
    participation. Appelé après le parcours du NAS et après chaque mutation qui peut compléter un
    dossier (validation manuelle, pièce retirée, pièce personnalisée cochée).
  - **Tableau de bord refait** (carnet : « actions urgentes par type de statut, rappel des dernières
    pièces trouvées, Gantt, retirer les échéances des 7 prochains jours ») :
    - actions urgentes **regroupées par statut** (`groupesActionsUrgentes` : Aucun document →
      Réception de pièces → À relier), quatre lignes par groupe puis « et N autres — voir le Suivi » ;
      même critère d'urgence qu'avant ;
    - **« Dernières pièces trouvées »** (`dernieresPiecesTrouvees`) remplace « Pièces reçues, pas
      encore consultées » : un rappel des 14 derniers jours qui ne disparaît plus à la consultation,
      les non vues en tête avec « Nouveau ». Date tirée de `d.piecesTrouveesLe` (nouveau, posé par le
      parcours) ; une notification antérieure à ce champ s'affiche quand même, sans date ;
    - **« Avancement des dossiers »** (`donneesAvancement`, pure) : une ligne par dossier, barre de la
      création (entrée « Dossier créé » de l'historique — la date de signature de l'avant-contrat
      n'est pas conservée sur le dossier) à la signature, jalons colorés par catégorie, pleins une
      fois réalisés. Fenêtre FIXE (−30 j / +150 j) : un acte à un an écraserait sinon tous les
      autres ; ce qui en sort est ramené au bord et atténué. 15 lignes puis « Afficher les N ».
      Défaut vu en capture et corrigé : le libellé « Aujourd'hui » chevauchait un repère de mois ;
    - le widget « Échéances des 7 prochains jours » est **supprimé** (`renderDashboard` et ses
      styles), la tuile KPI du même nom reste.
    `piecesTrouveesLe`/`completNotifieLe` repartent à zéro à l'import d'une sauvegarde, comme les
    autres statuts dérivés d'un parcours du NAS.
  - **Relecture d'actes sans limite de pages** (« ne mets pas de limite de 60 pages, aucune
    limite ») : `lireTextePdfParPage` lit toutes les pages, texte comme OCR (`PAGES_OCR_AUDIT`
    supprimée) ; la vérification des pièces du NAS garde ses plafonds, elle ne fait que reconnaître
    un document. La seule borne qui subsiste est celle du modèle (1 million de jetons, Sonnet 5 comme
    Opus 5) : l'ancienne borne serveur de 900 000 caractères bloquait à ~300 000 jetons, elle passe à
    2,5 millions (`MAX_CARACTERES_TOTAL`), et le vrai plafond (`LIMITE_JETONS_ENTREE`, contexte −
    sortie − marge) est vérifié sur le compte EXACT de `/estimer` : l'écran le signale et désactive
    « Lancer l'analyse » plutôt qu'un refus de l'API après coup. Corps JSON de la route porté à 60 Mo.
  - Tests : `tests/pieces-renouvelees.test.js` (5), `tests/tableau-de-bord.test.js` (6),
    `server/test/liens-pieces.test.js` (9 — dont un lien qui ouvre le PDF sans authentification,
    une signature fausse refusée, un chemin hors NAS refusé même bien signé),
    `server/test/exclusions-pieces.test.js` (3), deux dans `relecture-claude.test.js`. **Vérifié de
    bout en bout dans un vrai Chromium** (serveur réel, arborescence NAS, clair et sombre, 400 px) :
    alignement manquant avec l'exclusion puis reçu après « Ne plus écarter », TF 2026 retenue à la
    place de 2025 avec son historique, les trois blocs du tableau de bord, aucune erreur JS, aucun
    débordement. **Non vérifié en conditions réelles** : le lien dans un vrai message Teams (il
    faut que Teams laisse ouvrir une adresse http du réseau local).

- **Notification des pièces trouvées : le NOM de la pièce devient le lien dans Teams**, demandé par
  l'étude juste après la mise en service du lien signé (« rendre le lien cliquable en cliquant sur
  le nom de la pièce »). Le message affichait « • Titre de propriété : http://192.168.x.x:3000/piece?c=…&e=…&s=… »,
  une longue adresse illisible. `envoyerEmail(reglages, destinataire, message, …)` accepte désormais
  soit une chaîne (inchangé pour les rappels et la notification « dossier complet »), soit
  `{ texte, html }` : l'email part alors en `multipart/alternative`. `htmlNotificationPieces()`
  (pure, testée) produit `• <a href="…">Titre de propriété</a>` pour chaque pièce dont le fichier
  est connu, un simple libellé sinon, le nom du dossier en gras — tout ce qui vient du dossier est
  échappé, l'`&` de l'adresse compris. La version texte garde l'adresse en clair, pour un client
  sans HTML ou un flux qui lirait le corps en texte. **Dépend du flux Power Automate** : l'action
  Teams doit reprendre le corps HTML de l'email reçu ; si l'adresse reste affichée en clair dans
  Teams, c'est la version texte que le flux lit (noté dans server/README.md). Tests : +1 dans
  `envoi-email.test.js`, +1 et une assertion de bout en bout dans `liens-pieces.test.js`. Suite
  serveur 262 → 264 ; racine inchangée.

- **CLAIRE passe en bêta, la relecture d'actes reste en alpha, et la base est enfin sauvegardée.**
  L'étude a demandé où en était l'outil (« alpha, bêta, version finale ? »). Avis rendu : CLAIRE
  (suivi des dossiers) est prête pour la bêta — usage quotidien réel depuis des semaines, fonctions
  principales en place — à une condition bloquante, **l'absence totale de sauvegarde** : tous les
  dossiers vivaient dans un seul fichier du poste serveur, que rien ne copiait. La relecture d'actes
  (refaite la veille sur l'API Claude, un seul test réel) reste en alpha. L'étude a validé l'ordre
  proposé : sauvegarde d'abord, puis bascule en bêta.
  - **`server/src/sauvegarde.js`** : une copie par jour, vérifiée toutes les heures
    (`demarrerSauvegardeAutomatique`, démarrée dans `index.js` seulement, comme les deux autres
    minuteurs). `VACUUM INTO` vers un fichier temporaire LOCAL (copie cohérente d'une base ouverte ;
    une copie brute du fichier pendant une écriture peut être corrompue), relecture de la copie
    (`PRAGMA integrity_check` + nombre de dossiers — une sauvegarde jamais relue ne prouve rien),
    puis copie ASYNCHRONE vers la destination sous un nom `.partiel` renommé à la fin. **Jamais de
    `VACUUM INTO` directement sur le NAS** : synchrone sur un partage lent, il figerait le serveur —
    le défaut déjà corrigé sur la relecture du NAS. Rotation à 14 copies (`claire-AAAA-MM-JJ.db`,
    seuls ces noms exacts sont supprimés) ; une relance le même jour remplace la copie du jour.
    Une seule sauvegarde à la fois (`sauvegardeEnCours`, partagé par le minuteur et le bouton).
  - Destination choisie dans **Réglages → Sauvegarde de la base** (clé `sauvegarde`, séparée du blob
    `reglages` comme le compte rendu des rappels ; état sous `etat-sauvegarde` : dernière tentative
    ET dernière réussite, séparées pour qu'un échec n'efface pas la date de la dernière copie
    valable). Sans choix, les copies vont dans `data/sauvegardes` et l'écran dit que ça ne protège
    pas d'une panne du disque. Chemin absolu exigé (`validerDossierSauvegarde`, accepte `\\NAS\…`
    et `D:\…` même quand le serveur tourne sous Linux en développement).
  - **Jamais silencieux** : encart d'état dans les Réglages (`messageEtatSauvegarde`, pure et
    testée : vert / alerte / neutre), et **bandeau sur le Tableau de bord** dès que la dernière
    tentative a échoué ou qu'aucune copie n'a réussi depuis `JOURS_AVANT_ALERTE` (3) jours — même
    leçon que le compte rendu des rappels : un échec visible seulement dans les Réglages ne serait
    vu par personne. Procédure de restauration repliée sous l'encart et dans server/README.md.
  - **Bug attrapé en vérification dans le navigateur, pas par les tests** : le `PUT` du dossier
    partait sans `Content-Type: application/json`, le serveur recevait un corps vide et enregistrait
    un dossier vide — la sauvegarde partait donc en local malgré le chemin saisi. `fetchAvecAuth`
    n'ajoute pas cet en-tête : **tout appel avec un corps JSON doit le poser lui-même**.
  - **Badges** : celui du logo passe à « Bêta » ; un badge ambre « Alpha » (`.stade-badge`,
    `--pret` : un outil en test, pas une alerte) sur le lien « Relecture d'actes » et à côté du
    titre de cet écran.
  - **Critères convenus pour la suite** (à ne pas oublier) : version finale de CLAIRE après
    plusieurs semaines sans bug bloquant, une restauration de sauvegarde testée une fois, et les
    points jamais vérifiés au bureau confirmés (lien Teams, démarrage automatique, garanties) ; en
    bêta, plus de nouvelle fonction principale, seulement des corrections. Relecture d'actes en bêta
    après une dizaine d'actes relus avec le mode commentaires, un bruit réduit, aucun nom en clair
    repéré à l'étape de pseudonymisation, et un coût moyen jugé acceptable.
  - Tests : `server/test/sauvegarde.test.js` (9, dont une vraie sauvegarde relue, la rotation qui
    épargne un fichier étranger, une destination impossible sans exception ni temporaire laissé, les
    routes) et `tests/sauvegarde-affichage.test.js` (4). Suite serveur 264 → 273, racine 748 → 752.

- **Relecture d'actes : premier retour de l'étude intégré, et la visionneuse montre la page
  entière** (24/09/2026, fichier `commentaires-relecture-2026-09-24.json`, 14 avis sur un
  compromis de copropriété).
  - **Visionneuse** : chaque page était calée sur la seule LARGEUR du panneau, donc une page A4
    plus haute que la zone visible — on n'en voyait jamais le bas sans défiler.
    `tailleAjusteePage(l, h, dispoL, dispoH)` (pure, testée) la ramène à la plus petite des deux
    échelles ; les emplacements prennent d'emblée cette taille (d'après la page 1) pour que le
    défilement vers la page citée tombe juste avant même le dessin. `.relecture-visionneuse` passe
    d'une `max-height` à une `height` fixe — sinon un document d'une page rétrécit le panneau et
    la page avec. **Défaut vu en capture, pas en relisant** : l'en-tête et l'extrait cité, en
    `flex` sans `flex: 0 0 auto`, se faisaient écraser par la zone des pages.
  - **Chaque point de la grille peut porter une `consigne`** (« ce qu'on attend concrètement »),
    phrase unique ou `{compromis, acte}` quand la vérification diffère selon le stade
    (`consignePointGrille`). Transmise au serveur (`validerGrille` la garde, 600 caractères) et
    injectée sous le point dans le prompt (`Attendu : …`). C'est l'endroit où les commentaires
    « pour tous les dossiers » deviennent durables : les consignes tirées des commentaires restent
    limitées aux 30 dernières, la grille, elle, ne s'oublie pas.
  - **Ce que chaque commentaire est devenu** : quotités (sur un avant-contrat, les indiquer si
    exprimées, sinon simple rappel pour l'acte — jamais « absent ») ; désignation (écart Carrez en
    pourcentage, important au-delà de 5 %) ; DPE (dire qu'il y en a plusieurs, retenir celui visé
    par l'acte / le plus récent) ; date de l'acte authentique (ignorer les dates du mandat et de
    l'offre d'achat) ; travaux (seulement ceux du VENDEUR, qualifiés extérieur / surface / gros
    œuvre → DP ou permis) ; honoraires (compris dans le prix ? à la charge de qui ? — c'est là que
    se range l'écart 202 000 / 214 000 de l'offre d'achat) ; AG (date de la dernière et de la
    prochaine, chaque résolution qui touche le lot avec son numéro) ; pré-état daté analysé
    rubrique par rubrique (`alur_charges`) ; santé financière du syndicat (`alur_impayes`) ;
    fonds de travaux (remboursé ou non par l'acquéreur). **Quatre points nouveaux** :
    `notaire_redacteur`, `ddt_recapitulatif` (chaque diagnostic, sa date, valable / périmé /
    manquant), `alur_travaux_copro`, `usage_location_touristique` (la réglementation des meublés
    de tourisme de La Rochelle avait été manquée — la consigne interdit d'inventer une règle
    locale absente des documents).
  - **Deux règles générales dans le prompt** : une anomalie ne répète jamais un point de la grille
    (trois anomalies du test étaient des doublons : superficie, date de réitération, prix) ; le
    mandat et les pièces propres à l'agence (garantie financière, dates du mandat ou de l'offre)
    ne produisent aucune anomalie.
  - **Consignes tirées des commentaires** (`consignesDepuisRetours`, pure, testée) : un avis
    « juste » accompagné d'une remarque est désormais transmis (« bien, et vérifier l'écart de
    5 % » est une consigne — il était jeté) ; un avis de gravité l'est même sans commentaire ; un
    oubli signalé sur plusieurs lignes donne une consigne par ligne (le long commentaire « manque »
    était tronqué à 380 caractères, ses dernières demandes perdues).
  - **Non traité, faute de pouvoir le vérifier sans l'acte** : « la résolution quatorze p.6/35 »
    — sans le document on ne sait pas ce qu'elle dit ; la consigne AG demande désormais de relever
    toute résolution qui touche le lot, ce qui devrait la couvrir. Le nombre de lots discordant
    (avis « information », portée ce dossier) reste propre à ce dossier.
  - Tests : `tests/outil2-retours-relecture.test.js` (6) et un test serveur. Suite racine 752 →
    758, serveur 273 → 274. Vérifié dans un vrai Chromium (pdf.js simulé, CDN bloqué ici) : page
    entière visible, bas de page compris, clair et sombre, 1500 px et 400 px, aucune erreur JS.

- **Noms de fichiers reconnus avec une marge d'erreur** (24/09), demandé par l'étude : « détecter
  aussi le nom même si ce n'est pas le nom exact — faute de frappe, mots de référence en plus (ex :
  DECOMPTE de remboursement ECO PRET), abréviations (cu, cu a, renonciation DIA…), la casse ». La
  casse était déjà ignorée (tous les `motifNom` sont en `/i`) ; le reste manquait.
  - **Second essai, jamais à la place du premier** : `correspondancePieceNom(piece, nom)` teste
    d'abord le `motifNom` inchangé (`'exact'`), puis seulement des formes tolérantes déclarées pièce
    par pièce dans `FORMES_NOM_PIECES` (`'approche'`). Branché dans `verifierDossierLocal`
    (exclusions posées par « Réinitialiser » toujours respectées, le diagnostic écrit « nom
    approchant »), dans `chercherFichierParNom` (après la correspondance exacte) et, pour l'offre
    de prêt, via `nomDitOffrePret` (formes `FORMES_NOM_OFFRE_PRET`). Une pièce personnalisée se
    retrouve aussi par son libellé approché.
  - `correspondFormeNom` : nom de fichier découpé en mots sans accent ni article
    (`tokensNomFichier`, `MOTS_VIDES_NOM_FICHIER`), chaque mot de la forme doit retrouver un mot
    voisin (`motsVoisinsNom` : pluriel, puis distance d'édition avec transposition,
    `distanceEdition`), mots en plus autorisés, deux mots consécutifs recollables (« nume rotage »),
    forme entière collée reconnue (« EtatDate »).
  - **Trois garde-fous, à ne pas assouplir** : un mot de moins de 5 lettres doit être exact (un
    sigle — CU, DIA, TF — ne tolère aucune faute, et doit être un mot entier : « Diagramme » n'est
    pas une DIA, « Cuisine » pas un CU) ; la première lettre n'est jamais tolérée (« vitre » ≠
    « titre ») ; les mots d'une forme doivent être voisins, au plus un mot étranger entre eux —
    c'est ce qui garde « Certificat d'urbanisme - réponse alignement voirie » hors du certificat
    d'alignement. Tolérance d'une faute de 5 à 9 lettres, deux à partir de 10.
  - **« DECOMPTE de remboursement ECO PRET »** a été lu comme l'exemple d'un nom chargé de mots de
    référence, pas comme une pièce à reconnaître (aucune pièce de la checklist ne lui correspond).
    Il sert de contre-exemple : chaque forme de l'offre de prêt exige le mot qui dit le document
    (offre, contrat, accord) à côté de « prêt »/« crédit », donc un décompte d'éco-prêt n'est
    jamais pris pour une offre. À ajouter comme pièce si l'étude le demande.
  - `article20` et `ribCopro` n'ont pas de forme tolérante : leur `motifNom` est déjà une
    combinaison qu'une forme libre affaiblirait. `choisirAvantContratNas` n'est pas touché.
  - Tests : `tests/noms-approchants.test.js` (8, dont les négatifs). Suite racine 758 → 766.

- **Deux correctifs signalés sur un vrai dossier de prêt (Banque Populaire, 45 pages)** :
  - **Une pièce personnalisée cochée « reçue » à la main se décochait à chaque revérification**
    (« DECOMPTE de remboursement ECO PRET », document que le NAS n'a pas). Depuis le correctif de
    désynchronisation, `verifierDossierLocal()` repasse à « manquante » toute pièce reçue dont il ne
    retrouve pas le fichier — mais une pièce personnalisée cochée à la main n'en a jamais eu.
    `basculerStatutPiecePersonnalisee()` pose désormais la clé dans `d.piecesValideesManuellement`
    (le même drapeau que `validerPieceManuellement()` pour une pièce standard) quand elle passe à
    « reçue », et l'en retire sinon ; `supprimerPiecePersonnalisee()` l'en retire aussi. Rattrapage
    des pièces cochées AVANT ce drapeau : une pièce personnalisée « reçue » sans fichier mémorisé
    (`fichierTrouve` vide — une recherche réussie mémorise toujours son fichier) n'a pu être cochée
    qu'à la main, elle est protégée de la même façon, dans le parcours comme dans `lierDossierLocal()`
    (relevé AVANT de vider `d.fichiersTrouves`). Contrairement à une pièce standard validée à la
    main, une pièce personnalisée cochée reste CHERCHÉE (`aChercher`) : si un fichier à son nom
    apparaît, il devient ouvrable depuis la fiche. Vérifié dans un vrai Chromium (serveur réel +
    NAS de 41 PDF) : la version précédente décochait la pièce dès le démarrage, la nouvelle la garde
    reçue à travers trois revérifications, et la décocher la laisse bien repasser à « manquante ».
  - **La caution n'était pas détectée : deux défauts de `detecterGarantiesPret()`, rejoués sur le
    PDF réel.** Le vrai titre s'écrit « GARANTIE(S) », que `RE_TITRE_GARANTIES` n'acceptait pas ; et
    le PREMIER « Garanties : » de l'offre est celui de l'**assurance emprunteur** (« Garanties : se
    référer à la notice d'information de l'assurance »), qui ne nomme aucune garantie du prêt — d'où
    un faux « Sans garanties ». Le motif accepte « GARANTIE(S) »/« SÛRETÉ(S) » et devient global ;
    `paragraphesGaranties()` rend TOUS les paragraphes titrés dans l'ordre du document, et le premier
    qui énonce une garantie connue fait foi (les conditions particulières précèdent les conditions
    générales). « Sans garanties » n'est plus conclu que si l'un des paragraphes est celui du PRÊT
    (`estParagrapheGarantiesAssurance()` : assurance/assureur/notice d'information dans ses 200
    premiers caractères) — ceux de l'assurance seuls ne disent rien des garanties du prêt.
    `extraireParagrapheGaranties()` suit la même règle. Rejoué sur les cinq offres réelles du stress
    test : seule celle-ci change (« Sans garanties » → « Caution »). Deux tests dans
    `tests/offre-pret.test.js` (structure de l'offre, noms et montants inventés). **Pour l'étude** :
    un clic sur « Revérifier » suffit à corriger le dossier concerné.
- **Copie à l'étude : plus de doublon quand le responsable EST l'adresse de copie.** Signalé par
  l'étude : chaque notification adressée à bastien.anglument@gossart.notaires.fr arrivait deux fois
  (« c'est moi »). La copie systématique (`reglages.copieEmail`) était bien écartée quand elle
  coïncidait avec l'adresse du responsable — mais par une comparaison STRICTE (`!==`) : il suffisait
  que l'une des deux soit saisie « Bastien.ANGLUMENT@… » et l'autre en minuscules pour que les deux
  envois partent, donc deux messages Teams dans le même chat. `memeAdresseEmail(a, b)`
  (`server/src/envoiEmail.js`, testée) compare sans casse ni espaces, et lit l'adresse d'une forme
  « Nom <adresse> » ; utilisée aux deux seuls endroits concernés, `executerTacheRappels`
  (`jobs/rappels.js`) et `envoyerAuResponsable` (`routes/notifications.js`, qui sert à la fois la
  notification de pièces trouvées et celle de dossier complet). Tests : +1 dans `rappels.test.js`,
  un cas ajouté dans `notifications.test.js`, +1 dans `envoi-email.test.js`. Suite serveur
  274 → 276. Ne parvient à l'étude que par un nouveau `.exe`.

- **Lot du 24/09 fin d'après-midi : trois demandes, et un signalement qui n'était pas un bug de
  reconnaissance.**
  - **« Courriel (d')alignement (et) (de) numérotage » ne cochait que le numérotage.** Rejoué avant
    toute retouche : les quatre écritures (plus l'apostrophe typographique et les underscores) sont
    reconnues EXACTEMENT par les `motifNom` des DEUX pièces. Le parcours retient bien un même
    fichier pour plusieurs pièces. La cause est donc une **exclusion enregistrée** par un ancien clic
    sur « Réinitialiser » de l'alignement — même cas que celui déjà diagnostiqué pour « Courriel
    alignement et numérotage.pdf ». Elle se lève dans Réglages › Fichiers écartés des pièces, ou par
    « Ne plus écarter » dans le diagnostic du dossier. Aucune regex n'a été touchée ; un test fige
    les six écritures (`tests/dossier-local.test.js`).
  - **Écrire à l'acquéreur quand l'étude est seule ou en participation** (« permettre d'écrire à
    l'acquéreur »). La garde `d.roleNotaire === 'participant'` est retirée de
    `renderRelancesCiblees`, `renderQuestionnaireSatisfaction` et `relancerSiOffreManquante`. Le champ
    email de l'acquéreur du wizard n'est plus masqué pour ce rôle. **Seule reste la règle
    déontologique** : si un AUTRE office représente l'acquéreur (`notaireParticipantRepresenteAcquereur`),
    les relances vont à ce confrère (`emailDestinataireRelance`), le champ email du client reste
    masqué et le questionnaire n'est jamais proposé. La checklist de pièces reste, elle, réservée à
    l'instrumentaire : la demande portait sur l'écriture, pas sur le suivi des pièces. Le titre de la
    section passe de « Relancer par email » à « Écrire par email ».
  - **Bouton « Réception des fonds »** (`construireEmailReceptionFonds`, motif `fonds` de
    `MODELES_EMAIL_RELANCE`). Il confirme à l'acquéreur la bonne réception des fonds et rappelle la
    date du rendez-vous de signature. Il n'est proposé qu'une fois `d.rendezVousSignature`
    renseignée. Jamais la date butoir, qui n'est qu'indicative (voir « La date butoir devient
    informative »). Même routage que les autres relances, même journalisation dans l'historique.
    Le dossier ne porte pas l'heure du rendez-vous : seule la date est rappelée.
  - **« Vérifier que c'est bien appris pour les prochains dossiers » : trois trous, tous corrigés et
    vérifiés de bout en bout.**
    1. **Une date tapée à la main dans « Dates butoir » (étape Vérifier) n'apprenait rien.**
       `#f-pret`/`#f-acte`/`#f-ventebien` n'avaient aucun `onchange` : seul un clic sur un chip
       alimentait la mémoire. Nouvelle `apprendreDateSaisie(type, iso)` : si la date choisie figure
       parmi les dates repérées dans l'acte, sa clause est apprise pour ce type. C'est le cas quand
       l'outil l'avait classée autrement, ou quand elle était l'une de plusieurs candidates du même
       type. Une date qui n'est pas dans l'acte n'a pas de clause : rien à apprendre.
    2. **Une correction dans le panneau « Ce que l'outil a compris » apprenait la MAUVAISE clause.**
       `memoriserCorrectionRevision` mémorisait `objet.source.extrait`, c'est-à-dire l'extrait de la
       date qu'on corrigeait. Elle renforçait donc l'erreur. Elle passe maintenant par
       `apprendreDateSaisie`, sur la date retenue.
    3. **Apprendre la bonne clause ne suffisait pas à la faire retenir.** L'ancienne candidate
       restait classée du même type par ses mots-clés, et gardait la priorité.
       `meilleureCandidateEcheance` fait désormais passer en premier une candidate apprise quand
       elle est la seule de son type, avant même la règle « date écrite plutôt que calculée » :
       c'est une décision humaine. Deux candidates apprises retombent sur les règles habituelles.
    4. **La mémoire était propre à chaque poste** (`localStorage`). Une correction faite par un
       collaborateur n'était jamais apprise pour un dossier créé ailleurs. Elle vit maintenant en
       base : clé `corrections-apprises` et routes `GET/POST /api/corrections-apprises`
       (`server/src/routes/correctionsApprises.js`). Chaque correction est envoyée seule et fusionnée
       par identifiant, sans PUT global, pour que deux postes ne s'écrasent pas. Plafond de 500,
       comme côté navigateur. `chargerApprentissageServeur()` est appelée dans
       `demarrerApplication()` avant tout import. Elle reprend une fois les corrections gardées
       localement, puis vide le stockage du poste. Le `localStorage` ne sert plus que de repli
       quand le serveur est injoignable.
    - **Vérifié dans un vrai Chromium** avec deux contextes, donc deux « postes », sur un vrai
      serveur. Sur le poste A, l'outil retient le 30/04 ; l'étude tape le 15/03 à la main ; une
      correction arrive sur le serveur. Le poste B importe un acte de même trame (autres dates) et
      retient le 15/03 sans aide. Aucune erreur JS.
    - **Toujours pas appris, volontairement** (voir « Deux apprentissages supplémentaires ») : nom
      du dossier, adresse, prix, montants. Ces valeurs libres n'ont pas de mécanisme de
      réapplication sûr.
  - Tests : `tests/apprentissage-corrections.test.js` (2, dont le parcours complet premier acte →
    correction → second acte) ; `tests/relances-email.test.js` (+2 et un réécrit) ;
    `tests/dossier-local.test.js` (+1) ; `server/test/corrections-apprises.test.js` (4). Suite
    racine 768 → 773, serveur 276 → 280.

- **Courrier d'appel de fonds sans ligne vide, et coûts d'inventaire posés d'office** (24/09) :
  - **La ligne vide sous chaque ligne du décompte venait du MODÈLE Word**, pas des données. La
    cellule de libellé de `{#debitRows}` portait `{label}` puis, dans une seconde run, un
    `<w:br/>` INCONDITIONNEL suivi de `  {#formula}{formula}{/formula}` : la condition ne couvrait
    que le texte de la formule, jamais le saut de ligne. Chaque ligne sans formule (prix, frais…)
    sortait donc avec un retour à la ligne et deux espaces sous son libellé — visible sur le
    `.docx` envoyé par l'étude, dont le libellé se terminait par « Prix d'acquisition␣␣ » + saut.
    L'ouverture de la condition passe AVANT le saut (`{label}{#formula}` dans la première run,
    `<w:br/>  {formula}{/formula}` dans la seconde) : docxtemplater retire alors toute la XML
    comprise entre les deux balises, saut compris. Rendu vérifié avec docxtemplater/pizzip réels
    sur trois cas (formule absente, présente, chaîne vide) ; seule `word/document.xml` change dans
    l'archive, les 20 autres fichiers sont identiques octet pour octet, et le base64 de
    `appel-de-fonds-modele.js` est régénéré. Rappel du piège déjà noté : un placeholder doit rester
    entier dans une seule run.
  - **Arbitrage forfait mobilier : coûts habituels posés d'office** (« ils sont toujours les mêmes,
    parfois on les modifie ») — `COUTS_INVENTAIRE_DEFAUT` : acte d'inventaire 300 €, prisée 600 €,
    acte de clôture 300 €, un serment à 240 €, et un trajet prêt (trajets toujours décochés). Ce
    sont les valeurs de l'artefact d'origine, retirées au portage au nom de « un montant déjà là se
    prend pour un résultat ». **Cette règle reste vraie pour ce qui décide la réponse** : les deux
    simulations de droits et l'intitulé restent vides, donc aucun verdict n'est affiché tant
    qu'elles manquent (testé). « Réinitialiser » revient à ces coûts, pas à des champs vides.
    `initInventaire()` ne les pose qu'au PREMIER affichage de l'onglet : le quitter puis y revenir
    ne défait pas une saisie en cours (même principe que `initProrata`). Vérifié dans un vrai
    Chromium : coûts présents à l'ouverture, prisée modifiée conservée après un aller-retour
    d'onglet, retour aux coûts habituels après « Réinitialiser ». Suite racine 773 → 774.

- **Certificat d'alignement sous forme d'ARRÊTÉ, et libellé de l'écart au butoir** (24/09) :
  - `certificatAlignement.motifNom` accepte `arr[êe]t[ée]s?[\s'’][^.]{0,30}?alignement` : « Arrêté
    d'alignement », « Arrete alignement », « arrêté_d_alignement », « Arrêté individuel / portant
    alignement »… Le mot « arrêté » doit être présent : un « alignement » nu reste refusé (garde-fou
    « réponse alignement voirie » retesté). Forme tolérante `'arrete alignement'` ajoutée à
    `FORMES_NOM_PIECES`. Pas de `\b` après « arrêté » : un `\b` après une lettre accentuée ne
    matche jamais (piège déjà documenté). Test dans `tests/dossier-local.test.js`.
  - La carte « Date butoir » affiche « Signature 7 j avant la date butoir » (et « APRÈS la date
    butoir ») au lieu de « ce butoir », demandé par l'étude.

- **Fenêtres de confirmation : le bouton dit ce qui va se passer** (24/09). Le bouton était
  « Supprimer » en rouge pour TOUTES les confirmations, y compris valider une pièce, importer ou
  mettre à jour des parties. `boutonConfirmation(message)` (pure, `tests/confirmation-bouton.test.js`)
  déduit le libellé du PREMIER MOT de la question via `BOUTONS_CONFIRMATION` : Supprimer / Retirer /
  Réinitialiser / Vider / Effacer en rouge, « Marquer… » → Valider, Importer, « Remplacer… » →
  Mettre à jour en bleu (`.btn-valider`, `--focus`). Un verbe inconnu donne « Confirmer » en bleu —
  jamais un « Supprimer » par défaut. `demanderConfirmation(message, onConfirm, options)` accepte
  encore `options.bouton`/`options.ton` pour forcer. **Toute nouvelle confirmation doit commencer
  par son verbe d'action**, sinon elle affichera « Confirmer ».

- **Relecture d'actes : bilan réorganisé, grille par type de bien, analyses passées enregistrées ;
  tableau de bord : J- avant le butoir du prêt** (24/09 soir). Deuxième série de commentaires de
  l'étude (`commentaires-relecture-2026-09-24_1.json`, projet de promesse, maison), plus « créer une
  base de donnée pour pouvoir revenir sur les analyses d'acte passées ».
  - **Bilan (étape 4) : nouvelle disposition, demandée mot pour mot.** En haut, le résumé (carte de
    santé) à gauche et, juste à côté à droite, le **contrôle automatique CLAIRE réduit à « Ce que dit
    l'acte »** (fiche d'identité et constats lus dans l'acte seul) : les autres blocs CLAIRE (écarts
    avec l'avant-contrat, annexes, type de bien, couverture…) faisaient doublon avec la grille relue
    par Claude et sont retirés du bilan (`categoriesClaireBilanRelecture` : seules ces catégories
    comptent aussi dans la santé globale). En dessous, les thèmes à gauche et **l'aperçu à droite,
    toujours ouvert** — sur la citation demandée, sinon sur le document relu, page 1. Plus de bouton
    de fermeture. Dans chaque thème, **« À surveiller » et « Validé » côte à côte**
    (`repartirLignesThemeRelecture`, pure), au lieu d'une liste avec les validés repliés.
  - **Le « grand carré blanc » sous l'analyse** : `.relecture-visionneuse` pose `display: flex`, qui
    l'emportait sur l'attribut `hidden` — l'aside restait affiché, vide, 100vh de haut. Corrigé à la
    cause (`[hidden] { display: none }`) et rendu sans objet : sans document à montrer (analyse
    rouverte dont les PDF ont été déposés depuis le poste), l'aperçu affiche un état vide qui dit
    pourquoi, et le cadre se réduit à son message (`:has(.visionneuse-vide)`). Sous 1180 px l'aperçu
    n'est plus un panneau plein écran par-dessus le bilan mais un bloc sous les thèmes ; un clic sur
    une page l'amène à l'écran. Le défilement vers une page se fait dans l'aperçu seul
    (`scrollTop`), plus par `scrollIntoView`, qui faisait bouger toute la page.
  - **Maison / copropriété / terrain à bâtir vraiment différenciés.** Le type de bien se choisit
    désormais **à l'étape 3, avant de lancer l'analyse** (`renderTypeBienEtapeRelecture`,
    `typeBienRelectureCourante` : choisi à la main, sinon déduit des documents par
    `deduireTypeBienOutil2`), et il décide des points posés : champ `types` sur les points de
    `GRILLE_RELECTURE_OUTIL2`, `pointPourTypeBien()`, `grillePourModeOutil2(mode, typeBien)` et
    `sectionsTableauDeBordOutil2(analyse, mode, typeBien)`. Diagnostics du bâti (DPE, amiante,
    plomb, électricité, gaz, termites, mérule, assainissement), travaux du vendeur et
    dommages-ouvrage : maison et copropriété seulement ; points ALUR et Carrez : copropriété
    seulement (un point `copro: true` sans `types` vaut copropriété). **Six points propres au
    terrain à bâtir** : constructibilité/lotissement, bornage (C. urb. L115-4), viabilisation, étude
    géotechnique (CCH L112-21), condition suspensive de permis (avant-contrat), permis purgé (projet
    de vente). Sans type connu, tout reste posé. Le serveur reçoit `typeBien` et le dit au modèle
    (`TYPES_BIEN_PROMPT` dans `relecture/claude.js`). Le type retenu s'affiche sur la carte de santé
    (`typeBienEnvoyeRelecture`) ; il ne se corrige plus dans le bilan, puisque la grille a déjà été
    posée pour lui.
  - **Analyses plus courtes** : le commentaire d'un point tient en deux lignes au plus (≈ 250
    caractères) sauf quand le point l'exige (montants, écart chiffré, résolutions citées), la
    synthèse en 2 à 4 phrases, une anomalie en deux lignes.
  - **Retours du JSON devenus des consignes durables** (grille et règles du prompt) : termites —
    une clause « hors zone contaminée » répond au point, statut sans objet, jamais d'anomalie en plus ;
    plomb et amiante « non soumis » — contrôlés contre la date de construction (1949) ou du permis
    (1er juillet 1997) quand elle figure au dossier ; date « à définir » dans un projet →
    `a_verifier`, jamais critique ni anomalie en doublon ; anomalies électricité/gaz sur un bien
    vendu en l'état → à surveiller ; monument historique / AC1 / ABF / SPR signalés dans le point
    urbanisme **seulement s'ils figurent dans les documents**. **Limite dite à l'étude** : aucune base
    extérieure (Géoportail de l'urbanisme) n'est consultée — l'outil ne voit que les pièces
    déposées ; la protection patrimoniale manquée sur ce dossier ne sera trouvée que si un document
    (certificat d'urbanisme, ERP, acte) la mentionne. Les avis « pour ce dossier » (date butoir déjà
    vue, nombre de lots) restent des commentaires, non généralisés.
  - **Base des analyses passées** (`relectures`, `server/src/routes/relectures.js`, voir
    server/README.md) : chaque bilan affiché est enregistré (`enregistrerRelectureCourante`, POST puis
    PUT) avec l'analyse ré-identifiée, les contrôles CLAIRE, le coût, la santé et la liste des
    documents avec leur chemin NAS. Carte « Analyses enregistrées » à l'étape 1 (recherche sans
    accents, `filtrerHistoriqueRelectures`), réouverture sans requête ni coût
    (`ouvrirRelectureArchivee`, bandeau « Analyse enregistrée le… », `fichierRelecture` rouvre les
    pièces du NAS dans l'aperçu), suppression confirmée. **Décision assumée** : contrairement à
    `analyses_claude` (requête pseudonymisée), ce bilan est stocké **en clair** sur le serveur de
    l'étude, comme les dossiers — c'est ce que l'étude veut relire ; rien de cela ne part chez
    Anthropic. Mode commentaires utilisable sur une analyse rouverte.
  - **Tableau de bord** : à côté de « Offre de prêt introuvable » (Actions urgentes), le délai avant
    la date butoir d'obtention du prêt (`delaiButoirPret` : « J-12 avant le butoir », « butoir
    aujourd'hui », « butoir dépassé de 4 j »). Tuile « dossier(s) actif(s) » : chiffre en vert
    (`c-success`).
  - Tests : `tests/outil2-bilan-type-bien.test.js` (7), `server/test/relectures.test.js` (3), +1 dans
    `relecture-claude.test.js`. Suite racine 783, serveur 284. Vérifié dans un vrai Chromium
    (serveur réel, pdf.js simulé, clair/sombre, 1500 et 400 px) : CLAIRE à droite du résumé sur la
    même ligne, aperçu ouvert à droite des thèmes avec ses pages, deux colonnes par thème, analyse
    enregistrée puis rouverte depuis la liste avec son bandeau et l'aperçu vide expliqué, aucun
    débordement, aucune erreur JS.

- **« Signaler un problème » : remontée des bugs par les équipes, triée par l'étude seule**
  (24/09 soir). Après la présentation de CLAIRE aux collaborateurs, l'étude a demandé comment
  organiser la remontée des problèmes, puis tranché : « tout passe par moi ».
  - **Côté collaborateur** : un bouton « Signaler un problème » en bas de la barre latérale, sur
    tous les écrans (le pied de sidebar est donc toujours visible ; `afficherBoutonInstallation`
    ne masque plus que le bouton d'installation). Formulaire `#signalement-overlay` (patron
    `.confirm-overlay`) : gravité (bloquant / gênant / idée), qui signale (liste `RESPONSABLES` +
    « Autre », retenu par poste en `localStorage`), ce que je faisais, ce qui s'est passé à la
    place, capture d'écran facultative (fichier ou Ctrl+V, ramenée à 1600 px en JPEG par
    `dimensionsCaptureReduite`). **Joint sans rien demander, et affiché avant l'envoi**
    (`resumeContexteSignalement`) : `VERSION_APP`, l'écran (`ongletActuel`, posé par
    `definirOnglet`), le dossier ouvert dans le tiroir, le navigateur, la taille de fenêtre et les
    **dernières erreurs JavaScript** — tampon `erreursRecentes` alimenté par `window.onerror` et
    `unhandledrejection`, posé en tête de `script.js` pour attraper aussi le démarrage, gardé en
    mémoire seulement (`ajouterErreurTampon`, borné à 10, sans doublon consécutif). C'est souvent
    lui qui donne la cause qu'un collaborateur ne peut pas décrire.
  - **Côté serveur** (`server/src/routes/signalements.js`, table `signalements`) : création
    ouverte à tout poste connecté ; liste sans les captures (chargées une à une) ; `PATCH` pour le
    tri (statut `nouveau` / `transmis` / `corrige` / `doublon` / `ecarte`, note, version du
    correctif, doublon — jamais de lui-même ni d'une origine inconnue) ; export JSON captures
    comprises (`GET /api/signalements/export`, par défaut les « nouveaux ») ; suppression, qui
    remet à trier les doublons qui pointaient vers l'original. **Un bloquant prévient l'étude sur
    le moment** par la chaîne des rappels (email → passerelle → Teams), à l'adresse de COPIE de
    l'étude (`reglages.copieEmail`) — l'adresse qui reçoit déjà tout, et aucun nom écrit en dur.
    Un échec d'envoi ne perd jamais le signalement, déjà enregistré.
  - **Côté étude** : carte « Signalements des collaborateurs » dans les Réglages (filtres À trier
    / Transmis / Traités / Tous, liseré de gravité, détails techniques repliés, capture au clic,
    statut, doublon, version corrigée, note) et compteur rouge sur « Réglages » tant qu'il reste
    des signalements à trier (relu toutes les 5 min). « Exporter les signalements à trier »
    télécharge `signalements-claire-AAAA-MM-JJ.json` puis propose de les marquer « transmis »,
    pour que l'export suivant ne reprenne que les nouveaux. **Ce fichier est ce que l'étude me
    transmet** : le lire commence par le contexte (version — vérifier d'abord qu'elle n'est pas
    antérieure au correctif, piège déjà payé plusieurs fois — puis les erreurs JS).
  - **Limite assumée** : pas de compte par collaborateur (mot de passe partagé) — la séparation
    « signaler / trier » est une affaire d'écran, pas de droits. Tout poste peut ouvrir les
    Réglages ; c'est dit dans la carte elle-même.
  - Tests : `server/test/signalements.test.js` (5), `tests/signalements.test.js` (4). Suite
    racine 787, serveur 289. Vérifié dans un vrai Chromium (clair, sombre, 400 px) : envoi d'un
    bloquant avec capture puis d'un gênant, compteur à 2, capture ouverte dans les Réglages, export
    avec capture JPEG et contexte, passage en « transmis », erreur JS de test bien jointe, dossier
    ouvert repris dans le contexte, Échap qui ferme, aucun débordement, aucune erreur JS.

- **Mise à jour de CLAIRE en un clic, et dépôt GitHub passé en privé** (24/09 soir). L'étude a
  demandé si je pouvais « envoyer les nouvelles versions directement sur le PC de l'office », puis
  « en remote ? ». **Non** : cet environnement de développement n'a aucun accès au réseau du bureau.
  Réponse construite à la place, avec deux choix de l'étude : **installation seulement sur un clic**
  (jamais la nuit, jamais seule), et **dépôt passé en privé**.
  - **Serveur** (`server/src/miseAJour.js`, `server/src/routes/miseAJour.js`, voir server/README.md,
    section « Mise à jour en un clic ») : `GET /api/mise-a-jour` (build installé, jeton enregistré ou
    non — jamais le jeton), `PUT /api/mise-a-jour/jeton`, `POST …/verifier` (compare à
    `releases/latest`, rien n'est téléchargé), `POST …/installer`. L'installation enchaîne
    sauvegarde de la base (`sauvegarderEtEnregistrer` ; un échec annule tout), téléchargement en
    `.partiel` avec contrôle de taille, de taille minimale et de l'empreinte SHA-256 que GitHub publie
    avec l'asset (`digest`) — **refus si GitHub n'en publie pas** —, puis échange des fichiers.
  - **Windows permet de RENOMMER un exécutable en cours d'exécution** (pas de l'écraser) : c'est ce
    qui rend l'échange possible sans script externe. `echangerExecutables` fait actuel → `.ancien.exe`
    puis nouveau → actuel, et défait la première étape si la seconde échoue — le dossier n'est
    jamais laissé sans `CLAIRE-serveur.exe`. `CLAIRE-serveur.ancien.exe` reste sur le disque : c'est
    le retour arrière, à la main (procédure affichée dans la carte et le README).
  - **Redémarrage** (`redemarrerApresMiseAJour`, index.js, passé à `creerApp` via
    `miseAJour.redemarrer`) : fermeture du port et de la base AVANT de relancer — sinon la nouvelle
    instance tomberait sur EADDRINUSE —, puis, en session interactive, relance détachée et sans
    fenêtre de `process.execPath` (qui désigne déjà le nouveau fichier) ; en service NSSM (pas de
    `SESSIONNAME`, même signal qu'`ouvrirNavigateur`), arrêt seul, NSSM relançant le même chemin.
    Relancer dans les deux cas ferait démarrer deux instances. La nouvelle instance reçoit
    `CLAIRE_APRES_MISE_A_JOUR=1` et n'ouvre pas de nouvelle fenêtre Chrome : la page déjà ouverte
    attend que `/api/health` disparaisse puis revienne, et se recharge (`installerMiseAJour`). Les
    sessions étant en mémoire, il faut se reconnecter. Au-delà de 3 minutes sans réponse, la fenêtre
    donne la procédure de retour arrière.
  - **Numéro de build embarqué** : `build-windows-exe.mjs` écrit `build-info.json` (`build` =
    `CLAIRE_BUILD`, fourni par le workflow = `github.run_number`, le même `N` que le tag
    `serveur-exe-N` ; `commit`, `date`) et l'embarque comme asset SEA ; `lireBuildInstalle` le lit par
    `sea.getAsset`. Un exécutable antérieur n'en a pas → « version inconnue », installation quand
    même possible. **Le tout premier passage est manuel** : l'exécutable en service n'a pas encore
    cette fonction.
  - **Dépôt privé** : je n'ai pas pu changer la visibilité moi-même (aucun outil ni jeton
    d'administration du dépôt dans cet environnement) — procédure donnée à l'étude. Un dépôt privé
    répond **404** (pas 403) à qui n'y a pas accès : `messageErreurGithub` parle donc d'abord du
    jeton. Jeton *fine-grained* limité au dépôt, **Contents : Read-only**, saisi dans la carte,
    stocké en base (clé `mise-a-jour`, `assainirReglagesMiseAJour`), jamais renvoyé — même
    discipline que le mot de passe SMTP et la clé API. En privé, le workflow de build continue de
    fonctionner (`GITHUB_TOKEN` du dépôt) et consomme des minutes GitHub Actions (quota gratuit
    des dépôts privés, largement suffisant pour quelques builds par jour).
  - Tests : `server/test/mise-a-jour.test.js` (14, doublures de `fetch` et de `sea`, vrai
    échange de fichiers dans un dossier temporaire, route complète jusqu'au redémarrage),
    `tests/mise-a-jour-affichage.test.js` (4). Suite racine 791, serveur 303. Construction locale
    de l'exécutable vérifiée (`build-info.json` bien présent dans le blob). **Vérifié dans un vrai
    Chromium** avec un serveur simulant l'exécutable et GitHub : vérification, confirmation,
    fenêtre de progression, redémarrage, rechargement sur l'écran de connexion, clair et sombre,
    aucune erreur JS. **Non vérifié sur Windows** : le renommage d'un exécutable en cours et la
    relance détachée restent à confirmer par la première mise à jour réelle au bureau.

- **Agenda de l'office : appel de fonds et projet d'acte envoyé notés dans le calendrier, lus
  automatiquement.** Demandé par l'étude : « Quand un appel de fonds et fait on le note dans
  l'agenda idem si le projet est envoyé au client. L'artefact brief du matin récupère le .ics du
  calendrier de l'office pour le lire. Tu pourrais faire la même chose et mettre à jour
  automatiquement la date d'envoi de l'appel de fonds lorsqu'il est noté dans le rendez-vous sur
  l'agenda ? Et pareil pour l'envoi du projet d'acte qui pourrai être un nouveau statut juste après
  l'appel de fond. » **Convention réelle obtenue avant d'écrire une ligne** (deux questions posées,
  jamais devinée) : les rendez-vous portent une référence « VTE - NOM DU DOSSIER », « appel de
  fonds » et/ou « projet envoyé » sont notés dessus (ensemble ou séparément, dans le titre ou
  ajoutés au rendez-vous existant) ; les couleurs (vert = office, violet = visio, orange = confrère)
  indiquent le lieu du rendez-vous et **n'ont rien à voir** avec cette détection.
  - **`server/src/agendaOffice.js`** (nouveau, pur, sans dépendance réseau) : `parseIcsEvenements()`
    déplie les lignes RFC 5545 (`deplierLignesIcs` — un pli ne retire qu'UN espace, une phrase
    fendue au milieu d'un mot doit donc porter deux espaces dans le fichier de test, pas un seul :
    piège de fixture rencontré et corrigé, pas un bug de code) et décode `\n`/`\,`/`\;`/`\\`
    (`decoderTexteIcs`), en ignorant tout sous-composant imbriqué (`VALARM`…) pour ne lire que
    `SUMMARY`/`DESCRIPTION`/`DTSTART`/`STATUS` du `VEVENT` lui-même. `extraireReferenceVte()`
    reconnaît « VTE - … » (ou « VTE : »/« VTE… ») dans le titre ou la description ;
    `detecteAppelDeFonds()`/`detecteProjetEnvoye()` cherchent « appel de fonds »/« AF » et
    « projet … envoyé »/« envoi … projet » — **premier jet, comme `motifNom`/`PIECES_*` en leur
    temps**, à resserrer sur un vrai calendrier de l'étude si un faux positif/négatif remonte.
    Un événement `STATUS:CANCELLED` est ignoré.
  - **Rapprochement au dossier, jamais un pari** : `dossierPourReferenceAgenda()` réutilise
    TELLES QUELLES `normaliserNomRapprochement()`/`motsSignificatifs()` de `nas.js` (déjà écrites et
    déjà éprouvées pour le rapprochement d'un dossier NAS) — un dossier ne matche que si TOUS ses
    mots significatifs (≥ 3 lettres, hors `MOTS_IGNORES`) figurent dans la référence de l'agenda,
    et seulement si un SEUL dossier remplit cette condition. Deux dossiers qui matcheraient tous
    les deux → aucun n'est retenu (même prudence que `rapprochementParfait()` : se tromper de
    dossier ferait écrire une date au mauvais endroit, pire qu'une non-détection).
  - **`server/src/agendaWatch.js`** (nouveau) : `appliquerDetectionsAgenda()` écrit
    `d.appelFonds`/`d.projetEnvoye` **uniquement si le champ est encore vide** (jamais d'écrasement
    d'une date déjà saisie, à la main ou par un tour précédent) et pose
    `d.echeancesValidees[champ] = true` du même geste — une date lue dans l'agenda vaut une
    validation manuelle, exactement le même sens que « Marquer réalisée ». Une entrée d'historique
    nomme la référence agenda qui a déclenché l'écriture. Skip silencieux d'un dossier archivé.
    `executerTourSurveillanceAgenda()` (silencieux sans URL enregistrée, erreur réseau/HTTP jamais
    fatale — capturée et rapportée) et `demarrerSurveillanceAgenda()` (tour immédiat puis toutes les
    15 minutes, `enCours` empêche tout chevauchement — même patron que `nasWatch.js`/
    `jobs/rappels.js`, avec la même raison d'être : un flux devenu injoignable ne doit jamais
    arrêter les mises à jour EN SILENCE).
  - **Réglages persistés** (`parametresRepo.js`) : `assainirReglagesAgenda()` (une seule clé
    `icsUrl`, acceptée seulement si elle commence par `http(s)://` — un chemin de fichier collé par
    erreur ne casse rien, il est simplement refusé) et `assainirDernierTourAgenda()` (compte rendu
    du DERNIER tour — `at`, `ok`, `dossiersVerifies`, `misAJour`/`dejaRenseignes`/
    `sansCorrespondance` bornés à 50 entrées, `erreur`, `declenche` — même raison d'être que
    `dernier-tour-rappels` : un lien de calendrier révoqué ne doit jamais arrêter les mises à jour
    sans que rien ne le dise).
  - **`server/src/routes/agenda.js`** : `GET/PUT /api/agenda` (lecture/écriture de l'URL + lecture
    du dernier tour), `POST /api/agenda/tester` (déclenche un VRAI tour, comme
    « Lancer un tour maintenant » pour les rappels — pas une simulation) ; montée dans `app.js`
    derrière le mot de passe partagé, avec `depot`/`fetchFn` injectables pour les tests.
  - **Nouvelle échéance `projetEnvoye`**, insérée dans la chaîne appel de fonds → signature (voir
    son historique plus haut) qui devient donc à TROIS étapes : `echeancesPlanning()` (script.js)
    annonce l'appel de fonds tant qu'il n'est pas fait, puis le projet d'acte envoyé une fois
    l'appel de fonds validé, puis enfin « Signature de l'acte » une fois le projet envoyé validé
    aussi — repli sur la date du rendez-vous à chaque étape faute de date propre, même principe
    déjà en place pour l'appel de fonds seul. `d.projetEnvoye`/`marquerProjetEnvoyeSelonDate()`
    (saisir la date la valide, la vider ou la supprimer l'invalide) suivent exactement le patron de
    `d.appelFonds`. Répercuté partout où `appelFonds` l'était déjà : `renderTab()` (titre en gras,
    croix de suppression), `LIBELLES_CATEGORIE`, `calculerProchaineEcheance()`,
    `JALONS_AVANCEMENT` (Gantt du tableau de bord), `normaliserDossierImporte()` (conservé à
    l'import, comme une saisie de l'étude), `imprimerFiche()` (`TEINTES`/`cases`), et les styles
    `.dot-label.dl-projetEnvoye`/`.gantt-jalon.projetEnvoye` (gris neutre, comme les échéances
    personnalisées — aucune couleur de plus). **Miroir serveur** : `jobs/rappels.js` porte la même
    chaîne à trois étapes dans `toutesEcheances()` — `projetEnvoye` n'a pas de seuil de rappel
    dédié dans `SEUILS_RAPPELS_PAR_TYPE` (retombe sur `SEUILS_RAPPELS_DEFAUT`, 15/7 jours), noté
    explicitement en commentaire pour ne pas le chercher par erreur.
  - **Réglages › Agenda de l'office** (nouvelle carte, entre « Rappels automatiques par email » et
    « Relecture par Claude ») : un champ pour l'adresse `.ics` (« le même lien déjà utilisé par le
    brief du matin »), un bouton Enregistrer, un compte rendu du dernier tour (icône + date +
    origine automatique/manuelle + dossiers vérifiés/mis à jour, avec le détail par dossier et les
    références sans correspondance) et « Tester maintenant » qui déclenche un vrai tour et
    réaffiche le compte rendu persisté (`chargerReglagesAgenda()`/`enregistrerReglagesAgenda()`/
    `renderDernierTourAgenda()`/`lancerTourAgenda()`, patron identique à
    `chargerDernierTourRappels()`/`lancerTourRappels()`).
  - Tests : `server/test/agenda-office.test.js` (19 — dépliage RFC 5545, décodage, VALARM ignoré,
    référence VTE, les deux détections, rapprochement univoque/ambigu/absent, bout en bout),
    `server/test/agenda-watch.test.js` (10 — remplissage, non-écrasement, dossier archivé, aucune
    correspondance, deux détections sur le même dossier, absence d'URL, erreur HTTP, bout en bout,
    persistance du compte rendu), `server/test/agenda-route.test.js` (6),
    `server/test/parametresRepo.test.js` (+ validation URL/liste bornée). Suite serveur 342, suite
    racine 791 (deux tests existants de `tests/echeances-appel-fonds.test.js` réécrits sur la
    nouvelle chaîne à trois étapes — ils encodaient l'ancien enchaînement direct appel de fonds →
    signature, mis à jour plutôt que contournés, même discipline que pour `rappels.test.js`).
    **Vérifié dans un vrai Chromium** (serveur réel, clair/sombre/mobile 400px) : carte affichée au
    bon endroit, URL enregistrée puis relue après rechargement, « Tester maintenant » déclenchant un
    vrai tour et affichant proprement une erreur réseau (`fetch failed`, l'agenda réel étant hors de
    portée du proxy de cet environnement) sans jamais planter, aucun débordement horizontal.
  - **Non vérifié en conditions réelles** : ni un vrai calendrier Outlook publié ni son URL `.ics`
    réelle ne sont accessibles dans cet environnement de développement (même limite déjà documentée
    pour Ollama/pdf.js/Google Fonts) — la reconnaissance effective de la convention de l'étude sur
    de vrais rendez-vous (variations de rédaction, majuscules, accents) reste à confirmer une fois
    l'URL réelle renseignée dans Réglages.

- **Carte « Appel de fonds » à deux entrées, et détection agenda datée du jour** (25/09).
  - **Malentendu à ne pas reproduire** : à « écris dans l'ics et note l'appel de fonds dans le
    rendez-vous de signature », j'avais publié le rendez-vous dans le flux `.ics` de CLAIRE avec
    le statut de l'appel de fonds dans son `LOCATION` (commit `6827e5a`). L'étude voulait écrire
    dans l'**agenda officiel de l'office** — ce qui est impossible depuis CLAIRE (aucun accès en
    écriture sans une application Microsoft 365 autorisée par un administrateur, voir
    « Microsoft Graph » plus haut). Le commit a été **annulé en entier** (`git revert`) : le flux
    `.ics` de CLAIRE ne publie toujours que le prêt et la vente préalable. **Ne pas le
    réintroduire.** Leçon : « l'ics » peut désigner deux calendriers ici (celui que CLAIRE publie,
    celui de l'office qu'elle lit) — demander lequel avant de coder.
  - **Fiche** : les cartes « Appel de fonds » et « Projet d'acte envoyé » sont fusionnées en une
    seule carte « Appel de fonds » (renommée « Envoi au client » ensuite) (`renderCarteEnvoisAvantSignature`, `ENVOIS_AVANT_SIGNATURE`)
    à deux lignes, **« Envoi appel de fonds »** et **« Envoi projet »**, chacune avec sa date,
    son crayon (mêmes id `tabdate-<id>-<cle>` que les autres cartes, donc
    `activerEditionDate`/`validerEditionDate` inchangées) et sa croix. Une date saisie vaut envoi
    fait (`marquer*SelonDate`, déjà en place) : pas de bouton « Marquer réalisée » dans cette
    carte. Les dates restent `d.appelFonds`/`d.projetEnvoye` : planning, Gantt (« timeline » du
    dossier), rappels et import n'ont rien eu à changer. Visible dès qu'un des deux envois est
    daté, qu'un rendez-vous est fixé ou que le dossier est complet.
  - **Détection agenda** (`appliquerDetectionsAgenda`, `server/src/agendaWatch.js`) : la date
    écrite est désormais **celle du jour de la détection** (`dateDuJourParis()`, jamais
    `toISOString()`, faux entre minuit et 2 h), plus celle du rendez-vous. Chaque envoi relevé est
    mémorisé dans **`d.detectionsAgenda[champ]`** (date du relevé) et **n'est plus jamais
    retraité**, même si l'étude efface ou corrige la date — sans ce repère, l'agenda réécrirait la
    date du jour à chaque tour. Le repère est posé aussi quand la date était déjà saisie à la main
    (elle n'est jamais écrasée), pour que l'action ne soit plus reconsidérée. Conservé à l'import
    (`normaliserDossierImporte`). La carte affiche « Envoyé — relevé dans l'agenda ».
  - Tests : 2 ajoutés et 3 réécrits dans `server/test/agenda-watch.test.js` (date du jour, jamais
    retraité après effacement, repère posé sur une date déjà saisie), 3 ajoutés dans
    `tests/echeances-appel-fonds.test.js`. Suites : racine 794, serveur 344. Vérifié dans un vrai
    Chromium (clair et sombre) : carte à deux entrées, saisie de la date du projet par le crayon,
    aucune erreur JS.

- **Écran Réglages allégé** (25/09, « réduire le texte pour moins charger la page ») : textes
  d'aide raccourcis à une ligne ou retirés quand le libellé du champ suffisait, carte
  « Comment ça marche » des rappels repliée par défaut (`<details class="reglages-aide">`, contenu
  condensé : fonctionnement, 4 étapes, seuils, avertissement Gmail), états vides et message
  d'autorisation de notification raccourcis. Aucun champ, id ni bouton touché. Hauteur mesurée de
  l'écran : 4270 px → 3317 px à 1400 px de large. **À garder** : un texte d'aide ne répète pas le
  libellé ; une explication longue va dans un `<details>` replié, pas en permanence à l'écran.

- **Carte renommée « Envoi au client »** (25/09) : la carte de la fiche qui porte « Envoi appel de
  fonds » et « Envoi projet » (`renderCarteEnvoisAvantSignature`) ne s'appelle plus « Appel de
  fonds ». Seul le titre change : classe CSS `tab appelFonds` et couleur conservées.

- **Les deux envois, étapes de suivi à part entière** (25/09, « dans la timeline d'un dossier
  distingue bien les deux, il faut que ce soit des statuts de suivi comme obtention du prêt ou
  signature de l'acte »). La carte « Envoi au client » reste la zone de saisie ; partout où le suivi
  du dossier se lit, les deux envois sont deux étapes distinctes :
  - **mêmes libellés partout** : « Envoi appel de fonds » / « Envoi projet » (planning
    `echeancesPlanning`, colonne « Prochaine échéance » et vue Échéances, `JALONS_AVANCEMENT`,
    `LIBELLES_CATEGORIE` donc historique, fiche imprimée, rappels email côté serveur
    `jobs/rappels.js`, historique posé par `agendaWatch.js`) — ils étaient trois libellés
    différents pour la même étape ;
  - **couleur propre à l'envoi du projet** : nouveau jeton `--projet` (framboise, `#B83E78` clair /
    `#E58AB5` sombre), au lieu du gris `--muted` partagé avec les échéances personnalisées, qui le
    faisait lire comme une date quelconque. Appliqué aux pastilles `dl-projetEnvoye`, aux jalons du
    Gantt, à la fiche imprimée, et en puce devant chaque entrée de la carte « Envoi au client »
    (violet / framboise, les mêmes que dans l'avancement) ;
  - **jalons superposés décalés** (`donneesAvancement`, champ `rang`) : deux étapes à la même date
    — cas courant désormais que l'agenda inscrit la date du jour de détection — se décalent de 11 px
    (`translate`, qui ne gêne pas la rotation du losange de la date butoir) au lieu de se cacher
    l'une l'autre.

- **« Confirmer la réception des fonds », et une signature commune pour tous les emails**
  (25/09). Deux demandes de l'étude :
  - **Le bouton vit dans la carte « Envoi au client », sous « Envoi appel de fonds »**
    (`renderReceptionFonds`), et n'apparaît qu'une fois `echeanceValidee(d, 'appelFonds')` :
    date saisie, validation manuelle ou relevé dans l'agenda. Avant, il n'y a rien à confirmer.
    Il réutilise le motif `fonds` de `MODELES_EMAIL_RELANCE` (même routage vers le confrère
    quand un autre office représente l'acquéreur, même historique). Ce motif n'est **plus proposé
    parmi les relances** de la fiche, où il dépendait du rendez-vous de signature : un seul
    endroit pour ce geste. Le texte dit désormais que les fonds « ont bien été reçus en notre
    comptabilité ». Il rappelle le rendez-vous de signature s'il est fixé, jamais la date butoir.
    **`d.receptionFondsConfirmeeLe`** (nouveau champ, posé par `envoyerRelanceCiblee` via
    `modele.date`, conservé à l'import) : la carte affiche ensuite « Réception des fonds
    confirmée le … » et un bouton « Renvoyer », comme le questionnaire de satisfaction.
  - **`SIGNATURE_EMAIL_OFFICE`** termine les six emails pré-rédigés (provision, prêt, RIB,
    réception des fonds, questionnaire de satisfaction, relance automatique de l'offre de prêt) à
    la place de « Cordialement. ». Elle contient « Bien cordialement, / Office de Maître Sophie
    GOSSART », les coordonnées de l'office, puis les mentions légales **reprises mot pour mot**
    (virement obligatoire au-delà de 3 000 €, RIB signé, secret professionnel, fraude
    notaires.fr). **Les images de la signature Outlook (photo de l'office, logos, encart
    visioconférence) ne peuvent pas y figurer** : un brouillon `mailto:` ne porte que du texte.
    Leurs coordonnées sont reprises en texte.
  - **Troncature possible du brouillon** : la signature représente à elle seule plus de 2 000
    caractères une fois encodée. Certaines messageries Windows coupent un `mailto:` long.
    `ouvrirBrouillonEmail()` (utilisée par les trois chemins d'envoi) **copie aussi le corps
    complet dans le presse-papiers**, dans le même clic (`copierTexteSilencieux`, textarea +
    `execCommand`, `navigator.clipboard` étant absent hors contexte sécurisé). La fenêtre d'info le
    dit : si le brouillon paraît coupé, faire Ctrl+A puis Ctrl+V dans le corps.
  - **À confirmer par l'étude** : si Outlook ajoute déjà sa signature par défaut aux nouveaux
    messages, elle apparaîtra deux fois (sous forme d'images, puis en texte). Dans ce cas, retirer
    la partie coordonnées/mentions de `SIGNATURE_EMAIL_OFFICE` et ne garder que « Bien cordialement,
    / Office de Maître Sophie GOSSART ».
  - Tests : 5 dans `tests/relances-email.test.js` (bouton conditionné à l'appel de fonds validé,
    état « confirmée le », texte de l'email, signature en fin des six emails, import). Suite racine
    798. Vérifié dans Chromium (clair et sombre) : bouton sous l'appel de fonds, brouillon adressé à
    l'acquéreur et terminé par les mentions légales, carte passée à « confirmée le » avec la date
    qui revient à la ligne au lieu d'être coupée, aucune erreur JS.

- **Accès sans mot de passe** (25/09), demandé par l'étude juste après un « le mot de passe ne
  fonctionne pas ». La décision d'origine (« mot de passe partagé unique ») est donc levée : le
  serveur n'est joignable que depuis le réseau du bureau, c'est ce réseau qui protège l'accès.
  - `creerGestionnaireAuth(motDePasse, { desactivee })` (`server/src/auth.js`) : le middleware
    laisse tout passer et `/api/login` délivre un jeton quel que soit le mot de passe. `app.js`
    active ce mode sur `config.authActive === false` ; `config.js` le pose par défaut, sauf
    `"authActive": true` dans `config.json` ou `CLAIRE_AUTH=1` en développement. Une config de
    test qui ne précise rien garde l'authentification : les tests de 401 existants restent vrais.
  - Côté client, `connexionAutomatique()` demande un jeton avec un mot de passe vide au démarrage
    (et sur un 401) ; l'écran de connexion ne s'affiche que si le serveur le refuse. Le reste du
    client (`authToken` comme signal « connecté ») n'a pas bougé.
  - **Bug trouvé au passage, cause probable du « mot de passe ne fonctionne pas »** :
    `motDePasseValide()` bourrait les deux mots de passe à 256 CARACTÈRES avant `timingSafeEqual`,
    qui compare des OCTETS. Un caractère accentué (2 octets en UTF-8) donnait deux tampons de
    longueurs différentes, donc une exception → erreur 500, affichée « Mot de passe incorrect ».
    Tampons de 512 octets fixes désormais. Sans effet tant que l'accès reste sans mot de passe.
  - Tests : `server/test/auth.test.js` (3). Vérifié dans Chromium : aucune fenêtre de connexion,
    l'API répond. Ne parvient au bureau qu'avec le prochain `CLAIRE-serveur.exe`.

- **Agenda de l'office : erreur 503 à la lecture du .ics** (25/09). Signalé par l'étude juste
  après la mise en service de la lecture de l'agenda (« la lecture fait ressortir une erreur 503 »).
  La route elle-même n'était pas en cause (elle ne renvoie 503 que sans dépôt, jamais en
  production) : c'était le serveur du CALENDRIER qui répondait 503 au `fetch` de Node, qui ne
  s'annonce que comme « node » avec `Accept: */*` — alors que le même lien est lu sans difficulté
  par le brief du matin. `telechargerIcs()` (`server/src/agendaWatch.js`) envoie désormais des
  en-têtes de client d'agenda (`ENTETES_LECTURE_ICS` : User-Agent de navigateur,
  `Accept: text/calendar`), convertit `webcal://` en `https://` (`adresseLisibleIcs`, aussi à
  l'enregistrement dans `assainirReglagesAgenda`), relance UNE fois après 3 s sur 429/502/503/504,
  et traduit le code en phrase (`messageErreurCalendrier` : indisponible/réessai au prochain tour,
  accès refusé → republier, 404 → lien HTML au lieu du lien ICS). Une réponse 200 sans
  `BEGIN:VCALENDAR` (lien HTML de la page d'affichage) est signalée au lieu de rendre « 0 mis à
  jour ». **Non vérifié contre le vrai serveur Outlook** (injoignable depuis cet environnement) :
  si le 503 persiste, ouvrir le lien dans le navigateur du poste serveur pour savoir si c'est le
  lien ou le réseau. Tests : 3 dans `server/test/agenda-watch.test.js`. Ne parvient au bureau
  qu'avec le prochain `CLAIRE-serveur.exe`.
  - **Le 503 a persisté après ce correctif** (retour de l'étude à 10:12, le nouveau message
    s'affichait bien, donc le nouveau `.exe` tournait). Les en-têtes n'étaient donc pas la cause.
    Plutôt que de deviner une seconde fois, l'erreur porte désormais un **détail technique**
    (`diagnosticReponseIcs`) : nom de domaine appelé, en-têtes `server`/`via`, identifiant de
    requête Microsoft (`request-id`) et début du texte renvoyé, balises retirées. **Jamais le
    chemin de l'adresse**, qui porte le jeton de publication du calendrier (testé). C'est ce détail
    qui tranche : `Microsoft-HTTPAPI` ou un `request-id` → c'est Microsoft qui refuse ; un nom de
    pare-feu/proxy (Fortinet, Stormshield, Squid…) ou un `via` → c'est le réseau du bureau, que le
    `fetch` de Node traverse sans passer par le proxy système de Windows, contrairement à Chrome.
    Rappel : le brief du matin lit le même lien depuis les serveurs d'Anthropic, pas depuis le
    réseau du bureau — qu'il fonctionne ne prouve rien sur le chemin réseau du poste serveur.
  - **Verdict du diagnostic (10:25)** : `serveur « squid » ; via « 1.1 nacXwan-Proxy (squid) »`,
    hôte `mail.authentic-connect.fr` — le calendrier n'est pas Outlook mais celui d'**Authentic
    Connect** (Fichorga), et la page d'erreur vient du **proxy transparent du réseau du bureau**
    (Squid, prestataire nacXwan), pas du calendrier. Ce proxy intercepte le trafic sortant du poste
    serveur et n'arrive pas à charger l'adresse (« l'URL demandée n'a pas pu être trouvée »).
    Deux changements, sans rien deviner de plus :
    - le message nomme le proxy et **sa cause exacte** (`causeProxy`, `CAUSES_SQUID`) : en-tête
      `X-Squid-Error` d'abord (ERR_DNS_FAIL, ERR_CONNECT_FAIL, ERR_ACCESS_DENIED, délai…), sinon
      la phrase de la page Squid (FR ou EN). Ce sont trois demandes différentes au prestataire
      réseau. Le texte de la page est porté à 400 caractères — la cause était coupée à 140 — et
      **débarrassé de toute adresse complète** (`texteSansAdresses`) : une page Squid recopie
      l'URL demandée, donc le jeton de publication. Testé avec un jeton dans la page ;
    - **un lien enregistré en `http://` est relu en `https://`** quand le proxy le refuse. Chrome
      passe de lui-même en https, ce qui expliquerait qu'il ouvre le lien là où Node échoue (un
      proxy transparent sans interception TLS ne voit que le trafic http). Si la version https
      fonctionne, le lien enregistré est corrigé (`lienPasseEnHttps` dans le compte rendu, jamais
      l'adresse elle-même dans la réponse de la route).
    **Si le message nomme toujours nacXwan-Proxy après ça**, la seule issue est côté réseau :
    demander au prestataire d'autoriser `mail.authentic-connect.fr` pour le poste serveur. Ne pas
    ajouter de réglage de proxy dans CLAIRE sans savoir qu'un proxy explicite existe : celui-ci est
    transparent, il intercepte déjà tout.

- **Agenda de l'office : le déclencheur est dans le LIEU, seuls les rendez-vous à venir comptent,
  et le nom du dossier se reconnaît même partiel** (25/09), convention précisée par l'étude une fois
  la lecture du `.ics` rétablie : « VTE - NOM DU DOSSIER » en titre, pas forcément tous les noms de
  famille ; dans le lieu, les initiales du collaborateur puis « Appel de fonds envoyé » ou « Appel
  de fonds et projet envoyé ».
  - `parseIcsEvenements` lit `LOCATION` ; `detecterActionsEvenement` lit le lieu en premier, puis
    titre et description.
  - **Un ENVOI FAIT est exigé** : « appel de fonds » seul ne suffit plus (`RE_APPEL_ENVOYE` : suivi
    de « envoyé » dans les 40 caractères, ou « envoi de l'appel de fonds », ou « AF envoyé » en
    capitales). `ENVOYE` refuse « envoyer »/« envoyez » — l'ancien motif du projet acceptait
    « projet à envoyer » — et `matchNonNie` écarte « non envoyé »/« pas (encore) envoyé ».
  - **Rendez-vous à venir seulement** : `actionsDetecteesDepuisIcs(ics, dossiers, aujourdHui)`
    écarte tout événement antérieur au jour de lecture (`dateDuJourParis()`, passé par le tour).
  - **Rapprochement tolérant** (`dossierPourReferenceAgenda`), qui remplace « tous les noms du
    dossier doivent figurer dans la référence » : score = noms du dossier retrouvés dans la
    référence, exactement ou à une faute près (`motsVoisins` : 5 lettres minimum, première lettre
    identique, distance d'édition 1). Au moins un nom en commun ; le dossier en tête gagne s'il est
    seul. À score égal : si les ex æquo ont été retenus sur les mêmes noms, la plus grande part de
    noms cités départage (« DUPONT » → le dossier « DUPONT » plutôt que « DUPONT / MARTIN ») ; sur
    des noms différents (« PETIT / DUPONT » face à deux dossiers), rien. Les mots d'agenda
    (`MOTS_AGENDA_IGNORES` : RDV, SIGNATURE, APPEL, FONDS, PROJET…) ne comptent jamais.
  - **Risque assumé, à surveiller** : un seul nom en commun suffit. Si l'agenda cite une vente
    absente de CLAIRE dont un nom est aussi celui d'un dossier suivi, ce dossier recevra la date.
    L'historique nomme la référence agenda utilisée, et la date ne remplace jamais une date saisie.
  - Tests : `agenda-office.test.js` (lieu, envoi exigé et négations, tolérance, fautes, ex æquo,
    filtre de date), un tour qui ignore un rendez-vous passé dans `agenda-watch.test.js` ; fixtures
    des tours datées 2099 pour ne pas vieillir. Suite serveur 360, racine 798.

- **Rendez-vous de signature lu dans l'agenda de l'office, Réglages en sous-onglets, logo agrandi**
  (25/09 après-midi, quatre demandes : « détecter si un rendez-vous de signature a été placé sur
  l'agenda et remplir automatiquement la case, ne pas le prendre s'il a des points
  d'interrogation / repenser les réglages, on doit trop scroller / grossir le logo / la mise à jour
  en haut des réglages »).
  - **`estRendezVousSignature(evt)`** (`server/src/agendaOffice.js`) : tout événement « VTE - … »
    à venir est le rendez-vous de signature, sauf **un « ? » dans le titre ou le lieu** (adresses
    retirées avant le test — le « ? » d'un lien Teams ne dit rien) et **un événement « toute la
    journée »** (DTSTART sans heure : une note, jamais une signature — règle ajoutée par moi, à
    lever si l'étude pose ses signatures en journée entière). La description n'est pas lue pour
    ce test, elle porte couramment des liens. `actionsDetecteesDepuisIcs` rend désormais aussi les
    événements sans déclencheur d'envoi, avec `rendezVous: true`.
  - **`appliquerRendezVousAgenda()`** (`server/src/agendaWatch.js`), appelée en fin
    d'`appliquerDetectionsAgenda` : par dossier, le rendez-vous **le plus proche** ; c'est la
    **date du rendez-vous** qui est écrite (pas celle du jour, contrairement aux envois), et elle
    **suit l'agenda** — repère `d.detectionsAgenda.rendezVousSignature` = dernière date écrite par
    l'agenda : champ vide → écrit ; champ égal au repère et agenda différent → déplacé (historique
    « déplacé au … ») ; champ saisi à la main → jamais écrasé, l'écart est listé dans le compte
    rendu des Réglages (`dejaRenseignes` avec `dateFiche`) ; un événement disparu n'efface rien.
    `assainirEntreeDetectionAgenda` accepte l'action `rendezVousSignature` et les champs
    `ancienneDate`/`dateFiche`. Côté client, `normaliserDossierImporte` conserve le repère, et la
    carte « Rendez-vous de signature » affiche « Relevé dans l'agenda de l'office » tant que la
    date n'a pas été corrigée à la main. Écrire la date du rendez-vous rend la date butoir
    informative (`echeanceValidee(d, 'acte')`), comme une saisie manuelle.
  - **Réglages en quatre sous-onglets** (`.reglages-onglets`, composant `.vue-bascule` du Suivi,
    `definirSousOngletReglages()`, dernier sous-onglet retenu en `localStorage`) : **Général**
    (Mise à jour en premier, Sur ce poste, Sauvegarde, À propos), **Rappels et agenda**,
    **Relecture d'actes**, **Pièces et signalements** (compteur rouge des signalements à trier,
    en plus de celui de la barre latérale). Cartes en grille deux colonnes au-delà de 1200 px
    (`.reglages-grille`, `.reglages-pleine` pour les cartes pleine largeur). Hauteur mesurée de
    l'écran à 1500 px : ~3300 px avant, 850 à 1130 px par sous-onglet après. Les titres de section
    `.reglages-section-titre` disparaissent (le sous-onglet les remplace). Le bouton « Voir les
    Réglages » du bandeau de sauvegarde ouvre directement « Général ».
  - **Logo** de la barre latérale : symbole 30 → 40 px (trait 1,8 → 2,2), mot « Claire » 22 → 30 px.
  - Tests : 2 dans `server/test/agenda-office.test.js`, 2 dans `server/test/agenda-watch.test.js`
    (le plus proche retenu, déplacement suivi, saisie manuelle respectée, archivé intouché). Suite
    serveur 360 → 364, racine inchangée. Vérifié dans un vrai Chromium (clair, sombre, 400 px) :
    sous-onglets, grille, aucun débordement, carte du rendez-vous avec sa mention, aucune erreur JS.
    **Ne parvient au bureau qu'avec le prochain `CLAIRE-serveur.exe`** (lecture de l'agenda côté
    serveur).

- **Relance « offre de prêt » au client : texte de l'étude, lignes espacées, sans signature**
  (25/09). Le bouton « Prêt manquant » et la relance automatique (J-15 puis tous les 10 jours)
  partagent désormais un seul corps, `corpsRelanceOffreManquante()` (`construireEmailRelancePret`
  l'appelle) : le modèle fourni mot pour mot par l'étude (« Bonjour, / J’espère que vous allez
  bien. / Nous n'avons pas encore reçu votre offre de prêt dans le cadre de votre dossier. /
  L'échéance d'obtention du prêt est fixée au … / Merci de nous transmettre… »), une ligne vide
  entre chaque phrase. Seul écart : « était fixée » une fois l'échéance passée ; sans date de prêt,
  la phrase d'échéance est omise. Le nom du dossier n'est plus dans le corps (il reste dans
  l'objet). **Pas de `SIGNATURE_EMAIL_OFFICE` sur cet email**, à la demande de l'étude : un
  brouillon `mailto:` ne porte que du texte, les images de la signature ne peuvent venir que de la
  signature Outlook configurée pour les nouveaux messages. Les autres emails gardent la signature
  texte — à retirer aussi si l'étude le demande. « Police 11 » ne peut pas être imposée par un
  `mailto:` : le brouillon prend la police par défaut d'Outlook (Fichier › Options › Courrier ›
  Papier à lettres et polices). Tests réécrits dans `tests/relances-email.test.js`.

- **Emails « Provision + pièce d'identité » et « RIB » : textes de l'étude, sans signature**
  (25/09), même traitement que la relance de l'offre de prêt juste au-dessus.
  - `construireEmailRelanceProvision` : texte fourni mot pour mot, paragraphes séparés par une ligne
    vide, les deux pièces demandées sur deux lignes consécutives. Le nom du dossier sort du corps
    (il reste dans l'objet). Seul écart au texte : « auprès de l'agence » est suivi du nom de
    l'agence quand `d.nomAgence` est connu. La phrase sur l'offre de prêt reste conditionnelle
    (`!d.sansPret && d.offrePretStatut !== 'recue'`).
  - `construireEmailRelanceRib` change de SENS : il ne demande plus un RIB pour préparer l'appel de
    fonds, il invite à se munir du RIB et de la pièce d'identité au rendez-vous de signature. Il se
    termine par « Bien cordialement, » comme l'a écrit l'étude. Objet : « RIB et pièce d'identité
    pour le rendez-vous de signature — dossier … ».
  - Ni l'un ni l'autre ne porte plus `SIGNATURE_EMAIL_OFFICE`. Elle ne reste que sur « Réception des
    fonds » et le questionnaire de satisfaction (test de signature réduit à ces deux-là).
  - Tests : texte exact des deux emails dans `tests/relances-email.test.js`. Suite racine 800.

- **Email du questionnaire de satisfaction : texte de l'étude, sans signature** (25/09), même
  traitement que les emails ci-dessus. `construireEmailQuestionnaireSatisfaction` porte le texte
  fourni mot pour mot (« Madame, Monsieur, … Bien cordialement. »), paragraphes séparés par une
  ligne vide, les deux solutions numérotées sur deux lignes consécutives. Le lien « Cliquez ici
  pour laisser votre avis » est écrit en clair suivi de l'adresse (un `mailto:` ne porte que du
  texte, Outlook rend l'adresse cliquable). `LIEN_AVIS_GOOGLE_OFFICE` passe à l'adresse complète
  donnée par l'étude, qui ouvre directement les avis. Plus de `SIGNATURE_EMAIL_OFFICE` : seul
  l'email « Réception des fonds » la porte encore. Le PDF du questionnaire reste téléchargé au
  même clic, à joindre à la main. Test de texte exact dans `tests/relances-email.test.js`.

- **Agenda de l'office : erreur 500 d'Exchange** (25/09). Après le passage en https, le calendrier
  n'est plus bloqué par le proxy du bureau : c'est le serveur d'Authentic Connect lui-même (Exchange,
  `Microsoft-IIS/10.0`) qui répond 500. Vérifié depuis cet environnement, qui joint
  `mail.authentic-connect.fr` : un lien de calendrier publié inventé reçoit exactement ce 500, avec
  l'en-tête **`X-CasErrorCode: DirectoryOperationError`** et un corps vide, quel que soit le
  User-Agent (navigateur, Outlook, node). Autrement dit, Exchange **ne retrouve pas la boîte ou le
  calendrier désignés par le lien** : il a été dépublié, republié sous un nouveau lien, ou le lien
  collé est incomplet. Ce ne sont pas les en-têtes de CLAIRE.
  - Le diagnostic affiche désormais `code Exchange …` (en-tête `x-caserrorcode`), et
    `messageErreurCalendrier(statut, codeExchange)` explique ce cas en clair : recopier le lien ICS
    actuel, le même que celui du brief du matin.
  - 500 rejoint `STATUTS_A_RELANCER` : une seconde lecture après 3 s. « DirectoryOperationError »
    peut aussi être un raté passager de l'annuaire d'Exchange.
  - Test ajouté dans `server/test/agenda-watch.test.js` (une relance, message explicite, jeton du
    lien jamais affiché). Le test de route qui simulait un 500 passe à un 404, qui n'est pas relancé
    (sinon 3 s d'attente réelle et une réponse simulée manquante).

- **Agenda de l'office : « VENTE » reconnu en plus de « VTE »** (25/09). Demandé par l'étude,
  dont certains rendez-vous s'intitulent « VENTE MOKADEM / DE SOUSA MARTINS » plutôt que
  « VTE - … ». `extraireReferenceVte` (`server/src/agendaOffice.js`) accepte « VENTE » avec les mêmes
  séparateurs, **mais seulement en tête de ligne** (`RE_REFERENCE_VENTE`, drapeau `m`). La raison :
  tout événement qui porte une référence est pris pour le rendez-vous de signature
  (`estRendezVousSignature`), et « Visite de la vente DUPONT » ou « point sur la vente » dans une
  description ne doivent pas remplir cette date. « VTE » reste reconnu partout, c'est un sigle propre
  à l'étude. « VENTE » était déjà dans `MOTS_IGNORES` (`nas.js`), il ne compte donc pas comme nom
  dans le rapprochement. Deux tests dans `server/test/agenda-office.test.js`, dont le cas MOKADEM de
  bout en bout (« Me DENIS en 1er - Appel de fonds et projet envoyé » : les deux envois sont
  relevés). La lecture ne reprendra de toute façon que quand le lien du calendrier sera corrigé
  (erreur 500, voir l'entrée précédente).

- **Tableau de bord adapté au collaborateur du poste** (25/09 soir). L'étude a demandé si CLAIRE
  pouvait « détecter le PC » du collaborateur pour adapter le tableau de bord. Un navigateur ne lit
  ni le nom du PC ni la session Windows, et l'adresse IP d'un poste change sans réservation dans la
  box : solution retenue par l'étude, **choisir une fois par poste** (« Qui utilise ce poste ? »),
  choix retenu en `localStorage` (`claire-utilisateur-poste`), modifiable dans Réglages › Général ›
  Sur ce poste ou par « Pas Julie ? Changer » sur le tableau de bord. Perdu seulement si les
  données du navigateur sont effacées ou si CLAIRE est ouverte par une autre adresse (localhost et
  l'IP sont deux « sites ») : CLAIRE repose alors la question, rien d'autre n'en dépend. Les
  arbitrages ont été demandés par `AskUserQuestion` ; l'étude a tout retenu, plus deux ajouts :
  - **Bastien ANGLUMENT est administrateur** (`ADMINISTRATEURS`) : vue de toute l'étude par
    défaut, badge de la sidebar sur tous les dossiers, pas de filtre posé sur le Suivi. Les autres
    voient d'abord LEURS dossiers (`d.responsable`), avec une bascule « Mes dossiers / Tous les
    dossiers » (`vueGlobalePour`, pure). Seul le tableau de bord suit ce périmètre
    (`dossiersDuPerimetre`) : le bandeau du Suivi reste global, il a son propre filtre.
  - **Accueil** : « Bonjour Julie » à la place de « Vue d'ensemble », et une phrase
    (`resumeAccueilCollaborateur`, pure) qui ne cite que ce qui est non nul — rendez-vous à 15 jours,
    échéances de la semaine, pièces arrivées **depuis la visite précédente** (`piecesDepuisVisite`,
    sur `d.piecesTrouveesLe` ; horodatage de visite par collaborateur et par poste,
    `claire-derniere-visite:<nom>`, lu au démarrage puis remplacé).
  - **Prochains rendez-vous de signature — 15 jours** (`rendezVousProchains`, pure) : demandé en
    plus par l'étude, avec l'état « Appel de fonds envoyé / à envoyer » et « Projet envoyé / à
    envoyer » (`echeanceValidee`, donc aussi ce qui est relevé dans l'agenda). L'administrateur voit
    ceux de tous, avec le responsable sous le nom du dossier.
  - **Qui a fait quoi** : `ajouterHistorique` (et l'entrée « Dossier créé ») pose `auteur`, affiché
    « — Julie » dans l'historique de la fiche. Les entrées écrites par le serveur (agenda, NAS)
    n'en ont pas, et les anciennes non plus.
  - **Responsable pré-rempli** à la création (`reinitialiserFormulaire` et démarrage), **Suivi
    filtré** sur le collaborateur à la première ouverture de la session seulement (repasser sur
    « Tous » tient ensuite), **signalement pré-rempli** avec le collaborateur du poste.
  - Défaut vu en vérification et corrigé au passage : à 400 px, une raison longue d'« Actions
    urgentes » élargissait la page (même piège de grille que `.af-grid`) — `.dash-grid > *
    { min-width: 0 }`, et les lignes se replient sous 700 px.
  - Tests : `tests/collaborateur-poste.test.js` (6). Suite racine 800 → 806. Vérifié dans un vrai
    Chromium (serveur réel, dossiers inventés) : question au premier lancement, vue de Julie limitée
    à ses 3 rendez-vous, bascule « Tous », filtre du Suivi posé, auteur dans l'historique, vue
    globale par défaut pour Bastien, aucun débordement à 400 px.

- **Carte « Agenda » sur le tableau de bord**, à partir d'une maquette envoyée par l'étude (carte
  sombre : titre, mois, bande de la semaine avec le jour courant surligné et un point sous les jours
  occupés, puis « Prochaines réunions » avec heure, lieu et un liseré de couleur). Elle remplace le
  bloc pleine largeur « Prochains rendez-vous de signature » livré juste avant et prend la tête de
  la colonne de droite, au-dessus de « Dernières pièces trouvées ». Seule la structure est reprise,
  pas la palette (jetons de CLAIRE, clair et sombre).
  - Bande lundi → dimanche (`semaineAgenda`, pure), ‹ › sur trois semaines au plus
    (`SEMAINES_AGENDA_MAX`) ; cliquer un jour limite la liste à ce jour, « Tout voir » revient aux
    15 jours. Liseré par rendez-vous (`tonRendezVous`) : vert si appel de fonds ET projet sont
    partis, rouge s'il en manque un à J-2 ou moins, ambre sinon. En vue globale, le prénom du
    responsable suit le lieu.
  - **Heure, heure de fin et lieu viennent de l'agenda de l'office** : `heureDepuisDtstart`
    (`server/src/agendaOffice.js`, UTC converti à l'heure de Paris, forme sans zone lue telle
    quelle, `null` pour une journée entière), DTEND et LOCATION ajoutés au parse, posés sur le
    dossier (`rendezVousSignatureHeure`/`HeureFin`/`Lieu`) par `poserHoraireRendezVous`
    (`agendaWatch.js`) — **seulement quand la date vient de l'agenda ou coïncide avec lui** : une
    date saisie à la main n'a pas d'horaire connu. Un rendez-vous avancé le même jour met l'heure
    à jour. Côté client, corriger ou supprimer la date du rendez-vous efface heure et lieu
    (`effacerHoraireRendezVous`) ; les trois champs sont conservés à l'import. Un rendez-vous sans
    heure s'affiche simplement sans plage horaire, en fin de journée dans le tri.
  - Le lieu affiché est le LOCATION tel que l'étude l'écrit (souvent « initiales — Appel de fonds
    envoyé », voir l'agenda) : c'est sa note, laissée telle quelle.
  - Tests : +2 dans `tests/collaborateur-poste.test.js`, +1 dans `server/test/agenda-office.test.js`,
    +1 dans `server/test/agenda-watch.test.js`. Suites : racine 808, serveur 369. Vérifié dans un
    vrai Chromium (clair, sombre, 400 px) : jour sélectionné, semaine suivante, aucun débordement.
    Ne parvient au bureau qu'avec le prochain `CLAIRE-serveur.exe`.

- **Carte « Alertes importantes » + « Mes rappels »**, à partir d'une seconde maquette de l'étude
  (carte « Alertes importantes » avec icône et gravité Critique / Vigilance / Information, puis une
  liste « Mes rappels » à cocher). Arbitrages demandés et obtenus : la carte s'ajoute **en plus**
  d'Actions urgentes (pas à sa place), et les rappels sont **libres, saisis par chacun, éventuellement
  rattachés à un dossier**. Placée en tête de la colonne de gauche, même gabarit que la carte Agenda.
  - `alertesImportantes(dossiers, aujourdhuiIso)` (pure) ne retient que ce qui appelle un geste :
    offre de prêt non reçue à 15 jours ou moins du butoir du prêt (critique à 7 j), rendez-vous de
    signature à 7 jours ou moins avec l'appel de fonds ou le projet non envoyé (critique à 2 j),
    signature fixée après la date butoir, date butoir à 15 jours sans rendez-vous (critique à 5 j),
    vente préalable non confirmée à 7 jours, et en Information un dossier complet sans rendez-vous.
    Tri gravité puis proximité, 5 affichées, le reste renvoie au Suivi. « Traiter » ouvre la
    première. Suit le périmètre du tableau de bord (ses dossiers, ou tous). Couleurs : `--urgent`,
    `--pret`, `--focus`.
  - **Mes rappels** : texte, échéance et dossier facultatifs, case à cocher, croix au survol. Stockés
    **sur le serveur** (clé `rappels-perso`, `server/src/routes/rappelsPerso.js`, POST un rappel à la
    fois fusionné par id, DELETE par id, GET filtré par `?auteur=` — sans auteur, rien : jamais la
    liste de tout le bureau), pour les retrouver sur n'importe quel poste. Chacun ne voit que les
    siens, y compris l'administrateur. Les rappels cochés restent visibles barrés jusqu'au soir
    (`rappelsAffiches`, pure), l'échéance se lit « Aujourd'hui / Demain / Lundi / En retard de 2 j »
    (`libelleEcheanceRappel`). Sans collaborateur choisi, la carte invite à le faire. Relus au
    démarrage, au changement de collaborateur et à chaque retour sur le tableau de bord.
  - Tests : +2 dans `tests/collaborateur-poste.test.js`, `server/test/rappels-perso.test.js` (2).
    Suites : racine 810, serveur 371. Vérifié dans un vrai Chromium (clair, sombre, 400 px) : trois
    rappels ajoutés, un coché, un supprimé, tout relu après rechargement.

- **Tableau de bord : une seule carte « À traiter » à la place d'« Actions urgentes » et
  d'« Alertes importantes »** (25/09 soir, « retire les deux blocs J-7 et J-15, remonte les
  dernières pièces au-dessus de l'agenda, trouve une meilleure idée pour mélanger action urgente et
  alerte importante »). Les deux cartes listaient souvent le MÊME dossier deux fois, l'une par son
  statut (« Aucun document »), l'autre par son échéance (« Offre non reçue »).
  - **Une ligne par dossier, le GESTE en titre** (`pointsATraiter`, pure et testée) : les points
    d'`alertesImportantes` (titres devenus des verbes — « Relancer l'offre de prêt », « Envoyer
    l'appel de fonds et le projet », « Fixer le rendez-vous de signature », « Confirmer la vente
    préalable », « Vérifier le report de la date butoir ») et ceux tirés du statut
    (`pointsEtatDossier` : « Réclamer les pièces » pour un dossier relié dont une pièce est
    manquante, « Relier le dossier du NAS » pour un dossier jamais relié) sont regroupés par
    dossier. Le plus grave donne le titre ; les autres s'affichent en dessous (« + Relancer l'offre
    de prêt · J-4 »), sans doublon de titre. Groupes Critique / Vigilance / À suivre
    (`MAX_LIGNES_A_TRAITER` 8/6/4), triés par gravité puis par délai. Le sous-titre compte les
    dossiers hors « À suivre » ; le lien « Traiter » ouvre le premier. « Mes rappels » reste au
    pied de la même carte.
  - Retirés : `renderActionsUrgentes`, `groupesActionsUrgentes`, `raisonUrgence`,
    `ORDRE_GROUPES_URGENTS`, `MAX_LIGNES_GROUPE_URGENT`, `MAX_ALERTES_AFFICHEES` et le bloc HTML.
    `delaiButoirPret` reste (utilisée ailleurs et testée). `iconeCalendrierSeuil` n'a plus
    d'appelant.
  - **Tuiles « échéances ≤ 7 / 15 jours » supprimées** : le tableau de bord n'a plus que trois
    tuiles (actifs, offres en attente, pièces manquantes), `.kpis-dashboard` en `repeat(3, 1fr)`.
    L'agenda et « À traiter » disent déjà ce qui arrive, et avec le dossier.
  - **Colonne de droite : « Dernières pièces trouvées » au-dessus de l'Agenda.**
  - Tests : `tests/collaborateur-poste.test.js` (titres, regroupement `pointsATraiter`),
    `groupesActionsUrgentes` retiré de `tests/tableau-de-bord.test.js`. Suites : racine 810,
    serveur 371. Vérifié dans Chromium (clair, sombre, 400 px) : aucun dossier en double, un clic
    sur une ligne ouvre le bon tiroir, aucun débordement, aucune erreur JS.

- **Avancement des dossiers : le Gantt devient une ligne par dossier** (25/09 soir), d'après une
  maquette envoyée par l'étude (« Avancement », pourcentage, barre, pastille « Dans les délais /
  À surveiller / En retard », montant). Trois arbitrages demandés et obtenus : la liste
  **remplace** le diagramme de Gantt (et non un bloc de plus) ; le pourcentage est **pour moitié
  les étapes, pour moitié les pièces** ; le statut vient **de « À traiter »**.
  - `avancementDossier(d, aujourdhuiIso)` (pure) : étapes `ETAPES_AVANCEMENT` qui s'appliquent au
    dossier (vente préalable seulement si `d.ventebien`, prêt sauf `d.sansPret`, puis appel de fonds,
    projet, signature). Une étape est faite par `echeanceValidee` ; pour les deux envois, une date
    saisie suffit aussi (même règle que la carte « Envoi au client ») ; la signature une fois le
    rendez-vous PASSÉ. Pièces = `checklistPieces` reçues ; sans checklist (participation), les étapes
    seules font 100 %. Rend aussi la prochaine étape, affichée sous le nom.
  - `statutAvancement(gravite)` / `lignesAvancement(dossiers, auj)` : la gravité du point le plus
    urgent de `pointsATraiter` — critique → En retard, vigilance → À surveiller, sinon Dans les
    délais. **Pas de second calcul d'urgence** : les deux blocs du tableau de bord disent toujours
    la même chose d'un dossier. Tri : statut, puis le moins avancé d'abord. Suit le périmètre du
    tableau de bord (ses dossiers ou tous) ; 15 lignes puis « Afficher les N ».
  - Pastille pleine teintée (jetons `--success`/`--pret`/`--urgent`), barre de la même couleur,
    prix de vente via `formaterPrix` (« — » s'il manque). Sous 700 px la jauge passe sous le nom.
  - Retirés : `donneesAvancement`, `JALONS_AVANCEMENT`, les styles `.gantt-*` et leurs trois tests,
    remplacés par trois tests dans `tests/tableau-de-bord.test.js`. Suite racine 810. Vérifié dans
    un vrai Chromium (clair, sombre, 400 px sans débordement, clic qui ouvre la fiche).

- **Tableau de bord sur quatre colonnes** (25/09 soir, « met les blocs sur quatre colonnes, elles
  sont trop larges »). « À traiter » (+ Mes rappels), « Dernières pièces trouvées », « Agenda » et
  « Avancement des dossiers » sont désormais quatre `.dash-bloc` côte à côte dans `.dash-quatre`
  (les colonnes `.dash-col-gauche/-droite` et le bloc d'avancement pleine largeur disparaissent).
  **Flex, pas une grille à quatre pistes** : un bloc masqué quand il est vide (pièces, avancement)
  ne laisse pas de colonne vide, les autres se partagent la largeur. Deux par ligne sous 1400 px,
  un seul sous 900 px. Chaque bloc est un **conteneur** (`container-name: dashbloc`) : dans une
  colonne étroite, une ligne d'avancement passe sur deux rangées (nom + statut, puis la jauge) et
  une ligne de « Dernières pièces » laisse son libellé passer à la ligne sans la flèche — requêtes
  de conteneur et non de fenêtre, c'est la largeur du bloc qui compte. Vérifié dans Chromium
  (1600, 1280, 400 px, clair et sombre) : aucun débordement, aucune erreur JS.

- **Tableau de bord : colonne principale + rail à droite, à la place des quatre colonnes** (25/09
  soir). Les quatre blocs côte à côte de même largeur ont été refusés (« ça va pas, ajuste pour que
  ce soit harmonieux, tu peux changer le nombre de colonnes par ligne »), avec en référence une
  maquette de tableau de bord à colonne principale et rail latéral.
  - `.dash-disposition` : grille `minmax(0,1fr) 340px`. Colonne principale (`.dash-principal`) :
    en-tête (salutation, recherche, « + Nouveau dossier »), alerte de sauvegarde, trois tuiles KPI,
    puis `.dash-duo` — « À traiter » + Mes rappels (étroit, `flex: 1 1 340px`) à côté de
    « Avancement des dossiers » (large, `flex: 1.5 1 460px`). Rail (`.dash-rail`, un `<aside>`) qui
    démarre à hauteur du titre : « Dernières pièces » puis l'Agenda.
  - **Flex et non grille pour le duo** : un avancement masqué (aucun dossier) laisse À traiter
    prendre toute la largeur, et les deux passent l'un sous l'autre dès que la colonne ne tient plus
    340 + 460 px (vers 1440 px de fenêtre). Sous 1320 px le rail passe sous la colonne principale,
    pièces et agenda côte à côte, puis empilés sous ~700 px.
  - **Les quatre blocs sont des cartes au même gabarit** (`.agenda-carte` + `.agenda-entete` :
    titre 17 px + sous-titre) : « Dernières pièces » (« Trouvées sur le NAS ces 14 derniers jours »)
    et « Avancement des dossiers » avaient un petit titre en capitales au-dessus d'une liste
    encadrée, à côté de deux cartes titrées de l'intérieur — c'est ce décalage qui cassait
    l'alignement. Leurs listes perdent leur propre cadre (`.dash-liste-carte`, filets entre les
    lignes ; `.agenda-carte .avancement-dossiers` sans bordure). Les id (`#dash-nouveautes`,
    `#dash-avancement`) sont inchangés : le JS qui les masque quand ils sont vides n'a pas bougé.
  - La requête de conteneur `dashbloc` de l'avancement passe de 520 à 560 px : à ~540 px la ligne
    tenait sur un rang mais tronquait « étapes · pièces · prochaine ».
  - `.dash-quatre` supprimé. Vérifié dans Chromium (1600, 1440, 1280, 400 px, clair et sombre) :
    aucun débordement horizontal, aucune erreur JS.

- **En-tête du tableau de bord sur une ligne, avancement à 6 dossiers** (25/09 soir, « recherche et
  bouton nouveau dossier au même niveau que bonjour Julie, alignés à droite / grossir un peu le
  bonjour / avancement : 6 dossiers maximum »). Dans `index.html`, l'en-tête du tableau de bord
  (`.dash-header.dash-header-accueil`) empile désormais l'eyebrow, une ligne `.dash-accueil-ligne`
  (titre `#dash-titre` à gauche, `.dash-header-actions` poussé à droite par `margin-left: auto`), puis
  le résumé `#dash-accueil`. Titre porté à 32 px (27 px sous 900 px) sur ce seul écran ; le
  `.dash-titre` des autres onglets n'a pas bougé. **Les règles sont placées APRÈS les `@media`
  génériques** de `.dash-header-actions` (`width: 100%` dès 1300 px), sans quoi celles-ci renverraient
  la recherche sous le titre. Sous 900 px, recherche et bouton repassent en pleine largeur sous le
  titre. `MAX_LIGNES_AVANCEMENT` passe de 15 à 6, et le pied « Afficher les N dossiers » est conservé.
  Vérifié dans Chromium : même ligne à 1600, 1440 et 1280 px, aucun débordement à 400 px, clair et
  sombre, aucune erreur JS.
- **Fiche dossier (tiroir) refaite** (25/09 soir), d'après trois captures de fiches « task detail »
  envoyées par l'étude (« prends le meilleur, pas de slop IA, fais des choix pour optimiser »). Seule
  la structure est reprise, pas les palettes : jetons de CLAIRE, clair et sombre. Aucune fonction
  d'action n'a changé : mêmes ids, mêmes `onclick`/`onblur`, seule la présentation bouge.
  - **Barre d'outils collante** (`.fiche-barre`, rendue par `renderCarteDossier`, la barre statique
    d'`index.html` est retirée) : fermer et agrandir à gauche ; Rappels (.ics), Imprimer, Archiver,
    Supprimer à droite en icônes seules avec leur intitulé en infobulle. Archiver/Supprimer ne se
    mêlent plus au titre. Cinq icônes ajoutées à `ICONES` (archive, trash, printer, maximize,
    minimize) plus home et user.
  - **En-tête** : statut + prochaine échéance (« Obtention du prêt · 15 octobre 2026 · J-20 »), titre
    à 23 px, puis une barre segmentée, un segment par étape (`etapesAvancement`, extraite
    d'`avancementDossier` qui l'utilise désormais — même calcul que le tableau de bord), et
    « 1/5 étapes · 3/10 pièces · prochaine : … ».
  - **Propriétés en liste libellé → valeur** (`renderProprietesDossier`, remplace
    `renderDepotGarantieDossier` et `renderNotairesDossier`) : trois groupes séparés d'un filet — le
    dossier (responsable, type de vente, dossier du NAS avec Changer/Relier, avant-contrat avec
    Ouvrir), le bien (adresse, prix, dépôt, séquestre, financement — achat comptant, ou statut de
    l'offre, ou prêt et apport une fois l'offre reçue), les notaires (vendeur, acquéreur avec
    « Reçoit l'acte », email du confrère si un autre office représente l'acquéreur, rôle de l'étude).
    Les valeurs sont des champs « fantômes » : on lit une valeur, un clic la rend modifiable (fond au
    survol, cadre bleu au focus). Sélecteur `.fiche-proprietes input.prop-champ` : septième rencontre
    du piège de spécificité avec `input[type="text"]`. Sous 560 px, le libellé passe au-dessus.
  - **Onglets en pilules avec compteurs** (`ongletFiche`, `definirOngletFiche`) : Échéances (à venir),
    Pièces (reçues/total, en vert si complet), Analyse (obligations du vendeur, documents, ajout,
    extraction), Échanges (email client, relances, questionnaire, appel de fonds), Historique (fil
    d'activité, `renderActiviteFiche`). Pastille rouge sur l'onglet qui porte une nouveauté (même
    signal que `d.piecesNotifications`). Les panneaux sont tous dans le DOM, basculés par `hidden`
    sans `render()` : un champ en cours de saisie n'est pas perdu. L'onglet survit aux `render()` qui
    reconstruisent la fiche ; il repart sur Échéances à chaque ouverture, ou sur Pièces s'il y a des
    pièces nouvelles. Pas d'onglet Pièces pour un dossier en participation.
  - **Mode agrandi** (bouton de la barre, préférence du poste en `localStorage`
    `claire-fiche-large`) : tiroir à 1120 px, colonne de droite collante avec l'avancement pas à pas
    (`renderEtapesFiche` : coche, étape en cours, dates) et les cinq dernières activités. Désactivé
    sous 1100 px de fenêtre (le bouton disparaît).
  - **Le défilement du tiroir est conservé** d'un `render()` à l'autre (`dossierRenduDansTiroir`),
    et remis en haut seulement quand on ouvre un autre dossier.
  - Impression : barre, onglets et colonne masqués, tous les panneaux imprimés. CSS morte retirée
    (en-tête `.dossier-head*`, grille de classification, `.select-classif`, `input.input-inline`,
    `.dossier-actions`, historique repliable, `.analyse-repliable`).
  - Tests : `etapesAvancement` dans `tests/tableau-de-bord.test.js`. Suite racine 811, serveur
    inchangée. Vérifié dans un vrai Chromium (clair, sombre, 1500 px, mode agrandi, 400 px) :
    modification d'une adresse et du responsable enregistrée avec son historique, onglet conservé
    après le rendu, mode agrandi mémorisé, Échap qui ferme, aucun débordement, aucune erreur JS.
- **Fiche dossier : informations du dossier compactées sur deux colonnes** (25/09 soir, « la
  partie texte des informations du dossier prend trop de place, essaie une présentation plus
  compacte, colonne ? Le reste est bien »). `renderProprietesDossier` garde ses trois groupes, ses
  ids et ses fonctions ; seule la mise en page change : chaque groupe `.fiche-proprietes` est une
  grille de deux cases par ligne, chaque case `.prop-ligne` a son libellé à gauche dans une colonne
  fixe de 118 px (104 px sous 560 px, où la grille passe à une colonne) — les libellés de toutes les
  lignes tombent donc à la même verticale. Une valeur longue prend toute la largeur (`prop-pleine` :
  adresse, dossier du NAS, avant-contrat, notaires, dont le champ porte en plus « Reçoit l'acte »).
  Libellés et boutons raccourcis pour tenir dans la case : « Dossier NAS », « Adresse », « Prix »,
  « Séquestre » (le montant du dépôt — libellé « Dépôt » renommé à la demande de l'étude ; l'ancien « Séquestre », qui détient les fonds, devient « Versé à »), « Notaire vendeur/acquéreur », « Confrère » ; boutons « Changer », « Ouvrir »,
  « Relier » (l'intitulé complet reste en infobulle) ; financement réduit à « Offre introuvable » /
  « Comptant » / « Apport … (… %) », le montant du prêt en infobulle. Une case ne passe jamais à la
  ligne (`flex-wrap: nowrap`) : un texte trop long s'abrège plutôt que de repousser son bouton.
  **Essai écarté en chemin** : libellé au-dessus de la valeur, en grille — mesuré à −12 % seulement,
  la ligne du libellé coûtant presque autant que ce qu'on gagnait en largeur. Mesuré : 493 → 324 px
  dans le tiroir et en mode agrandi, 850 → 448 px à 400 px de large. Vérifié dans Chromium (clair,
  sombre, agrandi, 400 px) : aucun débordement, aucune erreur JS.

- **Moins de texte autour des envois d'email** (25/09 soir, « mets moins de texte pour décrire
  les fonctions, par exemple pour les envois d'e-mail »). Onglet Échanges de la fiche : la phrase
  qui décrivait chaque action est retirée quand le bouton suffit (questionnaire de satisfaction,
  appel de fonds — leur effet passe en infobulle) ; il ne reste une ligne d'aide que pour dire ce
  qui manque (« Renseignez l'email de l'acquéreur pour écrire. », « À saisir ensuite : la date du
  rendez-vous. », « Adressé au notaire de l'acquéreur. »). Fenêtres ouvertes après un envoi :
  « Brouillon ouvert — Relisez-le puis envoyez-le depuis votre messagerie. » (+ une phrase courte
  sur la copie dans le presse-papiers, `PHRASE_COPIE_BROUILLON`), idem pour le `.ics` et le
  questionnaire. **À garder** : un texte d'aide ne décrit pas ce que le bouton dit déjà ; il dit ce
  qui manque ou ce qui ne se voit pas. Mesuré : onglet Échanges 216 → 125 px sur un dossier avec
  confrère. Les autres écrans (Réglages, Relecture d'actes) ne sont pas touchés par ce lot.

- **Pièces du dossier en liste à cocher**, d'après une maquette de « sous-tâches » envoyée par
  l'étude (« présentation pour la liste de pièces à adapter à Claire »). Seule la structure est
  reprise (jetons de CLAIRE, pas l'orange de la maquette). `renderPiecesDossier` rend une carte :
  en-tête (icône `list-check`, « Pièces du dossier · maison », « Revérifier », compteur `N/M`,
  barre de progression ambre `--pret`, verte `--success` une fois complète), une `<ul>` d'une
  ligne par pièce, « Voir les N autres (reçues) », et « + Ajouter une pièce » en pied de carte.
  - **La case est le geste principal, toujours dans le même sens — cocher = reçue** : pièce
    standard en attente → `validerPieceManuellement` ; validée à la main → décocher appelle
    `retirerValidationManuellePiece` ; trouvée sur le NAS → case non cliquable (le parcours l'a
    cochée), « Réinitialiser » au survol ; pièce personnalisée → la case fait défiler son statut.
    Les anciens boutons ✓ / ↺ séparés disparaissent. Le nom d'une pièce reçue avec un fichier
    ouvre ce fichier. États : case pleine verte (reçue), bord ambre + « introuvable » (cherchée sur
    le NAS sans succès), bord pointillé (jamais vérifiée), « à la main » pour une validation
    manuelle, « Nouveau » inchangé.
  - **L'ordre de la checklist est conservé** : un premier essai faisait remonter les pièces en
    attente, mais une pièce cochée descendait alors derrière « Voir plus » et disparaissait sous le
    clic. Repliée (`MAX_PIECES_VISIBLES` = 6), la liste ne cache que des pièces DÉJÀ REÇUES et non
    nouvelles au-delà de la 6e ligne — une pièce à réclamer reste toujours visible — et un clic
    sur une case la déplie (`piecesToutesVisibles`, remis à `false` à l'ouverture/fermeture du
    tiroir comme `ajoutPieceOuvert`).
  - Retrait/réinitialisation au survol de la ligne (`.piece-actions`, toujours visibles sur écran
    tactile). L'aperçu de checklist du wizard garde ses puces (`.piece-item` dans
    `.pieces-apercu-liste`) ; les styles des anciennes puces de la fiche (`.piece-label`,
    `.piece-suppr`, `.piece-valider`…) sont supprimés.
  - Vérifié dans Chromium (clair, sombre, 400 px) : cocher une pièce en attente la valide et
    passe le compteur de 4/10 à 5/10 sans la déplacer, décocher la retire ; aucun débordement.
  - **Puis sur deux colonnes** (demande suivante de l'étude) : `column-count: 2` et non une grille,
    pour que la liste se lise de haut en bas dans l'ordre de la checklist (une grille rangerait de
    gauche à droite) ; une colonne sous 560 px. `MAX_PIECES_VISIBLES` passe à 8 (quatre lignes par
    colonne). Pour tenir dans une demi-largeur, la mention « introuvable » est retirée — le bord
    orange de la case suffit, l'explication passe dans l'infobulle — et les noms longs passent à la
    ligne au lieu d'être coupés.

- **Sidebar réductible en icônes + épingle, sous-menu « Outils » à la maquette fournie, logo/favicon
  sur tuile bleue, alignement lieu/date de l'appel de fonds** (26/09, quatre demandes indépendantes) :
  - **Repli en icônes seules + épingle** (`toggleSidebarRepliee`/`toggleSidebarEpinglee`/
    `appliquerEtatSidebar`, script.js) : deux préférences distinctes retenues par poste
    (`localStorage`, jamais transmises au serveur — un réglage d'affichage local, comme le thème).
    L'épingle l'emporte toujours sur un repli déjà mémorisé (`reduite = sidebarRepliee() &&
    !epinglee`) : épingler une sidebar réduite la rouvre et masque le bouton de repli, qui n'aurait
    plus de sens tant que l'épingle force l'état ouvert. Réduite : `flex-basis`/`width` ramenés à
    76px, libellés/titres de section/badges masqués. **Masquer le texte d'un bouton sans toucher au
    HTML de chaque lien** (aucun `<span>` séparé n'entoure le libellé, un simple texte au fil du
    bouton) : `font-size: 0` sur `.sidebar-link`/`.sidebar-groupe-titre`, qui ne fonctionne QUE parce
    que `.sidebar-link-icone` déclare son propre `font-size` (14/17px) — l'icône, dimensionnée en
    `1em` (voir `.icone`), garde donc sa taille malgré l'ancêtre à 0, sans qu'aucun des ~10 boutons
    de la nav n'ait eu besoin d'être réécrit. **Scopé à `@media (min-width: 901px)`** : la sidebar
    mobile (<900px) est déjà un panneau réductible via le burger/scrim existant, un second mécanisme
    de repli par-dessus prêterait à confusion — un `display:none` posé pour le desktop ne peut pas
    proprement se "révéler" sous 900px sans calques CSS (`revert` reviendrait au défaut du
    navigateur, pas à la règle non-repliée), d'où le choix de ne JAMAIS appliquer ces règles sous
    901px plutôt que de les défaire une par une dans le `@media` mobile.
  - **« Outils » en groupe repliable**, sur le modèle envoyé par l'étude (capture d'un menu
    "Order" avec chevron + sous-items reliés par un trait) — demandé pour ce groupe précisément,
    "Dossier"/"Admin" restent de simples titres non interactifs. `sidebar-groupe-titre` (bouton,
    icône `package` + libellé + chevron) + `sidebar-sousmenu` (les 5 liens existants inchangés,
    seulement enveloppés) ; `toggleGroupeSidebar('outils')` retient l'état ouvert/fermé par poste
    (ouvert par défaut : ces outils étaient déjà tous visibles, les masquer d'entrée aurait surpris
    un usage installé). **Toujours forcé ouvert quand la sidebar est réduite** — sans libellé de
    groupe visible en mode icônes, il n'y aurait plus aucun moyen de rouvrir ces cinq outils. Trait
    de connexion en CSS pur (`.sidebar-sousmenu::before` = le tronc vertical, `.sidebar-sousmenu-
    item::before` = une branche horizontale par item), masqué en mode réduit.
  - **Logo (`.brand-mark`, 3 endroits : sidebar, écran de connexion, « À propos ») sur tuile bleue à
    icône blanche** : un `<rect rx="12" fill="var(--focus)">` ajouté sous les deux tracés existants
    (anneau + coche), dont le stroke passe de `var(--focus)`/`var(--focus-hover)` à `#fff` — un seul
    blanc pour les deux traits, demandé ainsi ("le picto en blanc"). `icone.svg` (favicon/PWA) reçoit
    le même traitement (fond `#12181F` → `#2563EB`, tracés → blancs) avec un trait **moins épais**
    qu'avant (18/15 → 13/10, "un peu moins gras" demandé explicitement) — choisi après avoir rendu
    trois variantes à 16/24/32/64/96px via Playwright (aucun outil de rasterisation SVG disponible
    dans cet environnement, aucun n'installé non plus dans le projet) : 13/10 reste lisible comme
    anneau+coche au plus petit format tout en étant sensiblement plus fin que l'original, sur fond
    clair comme sur fond sombre.
  - **Appel de fonds : lieu/date fusionné dans le même bloc que le destinataire** (`index.html`,
    `.af-entete-droite`) — les deux étaient jusqu'ici deux éléments alignés chacun de son côté (le
    destinataire en `width:max-content`+`margin-left:auto`, la date en `text-align:right` sur toute
    la largeur du corps de lettre) : ils ne partageaient que leur bord DROIT, jamais leur bord
    gauche, qui divergeait dès que les deux textes n'avaient pas la même largeur — lu comme deux
    blocs disjoints plutôt qu'un seul en-tête de courrier. Fusionnés en un seul conteneur
    (`.af-entete-droite`, reprend l'ancien `width:max-content; max-width:55%; text-align:left` de
    `.af-adresse-bloc`, supprimée) : destinataire, mention d'envoi et ligne « Blois, le … » partagent
    désormais le même bord gauche, quelle que soit la largeur de chacun — vérifié par mesure des
    `getBoundingClientRect()` avant/après (bords gauches identiques au pixel près, avec le
    destinataire par défaut ET avec un nom/une adresse réels plus larges que la date). Aucune
    dépendance JS cassée : les deux blocs n'étaient référencés que par leurs id internes
    (`af-p-adresse`, `af-p-ville`, `af-p-datelettre`…), jamais par leur classe englobante.
  - Vérifié dans un vrai Chromium (serveur local, clair/sombre/mobile 400-650px) : repli/épingle
    testés en cycle complet (repli → agrandir → épingler → recharger la page, l'épingle persiste →
    désépingler, le bouton de repli réapparaît), groupe Outils ouvert/fermé, sidebar mobile
    inchangée (repli desktop neutralisé, burger/scrim intacts), lettre d'appel de fonds avec et sans
    destinataire rempli. `npm test` : 811 tests racine (inchangés, chantier entièrement visuel/CSS,
    aucune fonction pure ajoutée), 371 côté serveur.
- **Appel de fonds : 4 sauts de ligne entre l'adresse/la mention d'envoi et la ligne lieu/date**,
  demandé explicitement par l'étude juste après la fusion des deux blocs (voir l'entrée
  précédente) — un simple bord gauche commun ne suffisait pas, il fallait aussi un vrai espace
  vertical entre les deux avant que le courrier ne se lise comme un en-tête de lettre classique.
  Quatre `<br>` littéraux insérés dans `index.html`, entre `#af-p-mention-ligne`
  et `.af-date-ligne` — préférés à un `margin-top` calculé (ce qui avait été utilisé jusque-là,
  `6px`, retiré) : « 4 sauts de ligne » est une demande littérale, et de vrais `<br>` sont
  cohérents avec le mécanisme déjà en place pour l'adresse elle-même (`#af-p-adresse` autorise
  aussi des retours à la ligne, reconstruits par `donneesCourrierAppelFonds()` via
  `.innerHTML.split('<br>')`). **Sans effet sur cette fonction** : elle ne lit que le HTML de
  `#af-p-adresse` et le texte de chaque `#af-p-*` par id — les 4 `<br>` posés comme frères de ces
  blocs, à l'intérieur de `.af-entete-droite`, n'entrent dans aucune des deux lectures.
  `.af-date-ligne { margin-top: 6px }` devient `margin-top: 0` (les `<br>` portent maintenant tout
  l'espacement, un margin résiduel l'aurait doublé). Vérifié par une capture Playwright de
  `.af-lettre` (serveur local, destinataire/mention/date renseignés) : espace net et net à 4 lignes
  entre « Envoi par e-mail uniquement » et « Blois, le 14 novembre 2026 », bords gauches toujours
  alignés. `npm test` : 811 tests racine (inchangés, changement HTML/CSS pur), 371 côté serveur.

- **Sidebar : coin arrondi entre le tronc et la branche du sous-menu « Outils »** (« essai pour
  Outils des traits plus arrondi »). `.sidebar-sousmenu-item::before` dessinait jusqu'ici un angle
  droit (une barre verticale continue partagée par tous les items, `.sidebar-sousmenu::before`, +
  un tiret horizontal plat de 1px par item) — remplacé par un vrai coin : le pseudo-élément de
  chaque item devient un cadre `border-left` (segment vertical, du haut de l'item à son milieu) +
  `border-bottom` (segment horizontal vers le bouton) avec `border-bottom-left-radius: 8px`, posé
  exactement sur la même colonne que le tronc (`left: -12px`, comme avant) donc sans décaler le
  point d'arrivée sur le bouton. Le tronc continu (`.sidebar-sousmenu::before`) est inchangé : il
  assure toujours la continuité verticale entre deux items, seul le raccord au niveau de chaque
  branche devient une courbe plutôt qu'un angle. Vérifié par une capture macro (zoom ×4) d'un seul
  coin : courbe nette, sans décalage ni double trait, dans les deux thèmes. `npm test` : 811 tests
  racine (inchangés, retouche CSS pure), 371 côté serveur.

## Comment tester

Une suite de tests est committée dans `tests/` (Node natif, `node:test` — aucune dépendance à
installer). Lancer `npm test` ou `node --test`.

`tests/helpers/load-app.js` charge `script.js` dans un `vm.Context` avec un faux `document`/
`window` minimal (comme l'ancienne pratique ad hoc, mais versionné cette fois), pour tester les
fonctions pures d'extraction (`detecterDatesDepuisTexte`, `extraireEngagementsVendeur`,
`extraireConditions`, `detecterNomDossier`, `normaliserDossierImporte`, `escapeHtml`...) sans
navigateur réel. `package.json` est un fichier d'outillage pur (le champ `scripts.test` uniquement)
— il n'introduit aucune dépendance d'exécution et n'a aucun effet sur l'usage réel de l'outil en
`file://`, qui reste inchangé.

**Deux limites du harnais à connaître avant d'écrire un test** (toutes deux rencontrées, et chaque
fois prises pour un bug du code testé) :
- seules les `function` et les `var` de premier niveau de `script.js` deviennent des propriétés du
  contexte `vm` — un `const` ou un `let` de premier niveau y est **invisible**. Toute table de
  configuration destinée à être testée (`TYPES_ACTE`, `REGLES_NOTAIRE_INSTRUMENTAIRE`,
  `POINTS_DEPART_CONNUS`…) doit donc être déclarée en `var`. Corollaire : les fonctions qui lisent
  ou écrivent un état de premier niveau (`dossiers`, `analyseJuridiqueActuelle`,
  `extractionActuelle`, `generationImportActuel`) ne sont pas testables unitairement — les vérifier
  par un script de bac à sable, en n'observant que ce qui est observable (le DOM produit) ;
- un tableau venant du contexte `vm` n'est pas un `Array` du realm des tests : `assert.deepEqual`
  échoue sur deux tableaux pourtant identiques. Comparer des chaînes jointes
  (`a.join(',') === 'x,y'`) à la place.

**En ajoutant ou modifiant une regex d'extraction**, ajoutez le cas correspondant dans
`tests/dates.test.js` ou `tests/engagements.test.js` plutôt que de vérifier à la main : c'est ce qui
manquait jusqu'ici et qui a permis plusieurs régressions silencieuses (voir l'historique des
décisions ci-dessus). Les fichiers de la refonte de l'extraction suivent le même découpage :
`adresse`, `dates-metier`, `parties`, `notaires`, `extraits`, `extraction` (objet unifié et
cohérence), `enregistrement` (ce qui est conservé sur le dossier) et `fusion` (règles de fusion
avec la passe IA).

Pour tout ce qui touche au DOM réel ou aux API navigateur (File System Access, Service Worker,
impression), le test le plus fiable reste d'ouvrir `index.html` dans un vrai Chrome — utilise les
outils de navigateur si disponibles dans cet environnement plutôt que de tout re-simuler à la main.

- **Générateur d'appel de fonds** (`#onglet-appel-fonds`, lien « Appel de fonds » dans la section
  **Outils** de la sidebar) : produit la « Convocation au rendez-vous contenant l'appel de fonds »
  — le courrier qui annonce à l'acquéreur la date de signature et le décompte des sommes à virer —
  et la télécharge en `.docx` à l'en-tête réel de l'étude. Porté d'un artefact fourni par l'étude,
  avec la consigne « respecter la charte graphique de CLAIRE, relier à l'Outil 1, et réfléchir à
  quelque chose d'intelligent ».
  - **Deux moitiés au traitement délibérément différent, c'est le parti pris central du portage** :
    le CHROME (colonne de gauche, boutons, champs) prend les jetons de CLAIRE et le gabarit du
    simulateur de provision (`.dash-header`/`.calc-card`/`.calc-champ`/`.hint`), tandis que
    l'APERÇU DU COURRIER garde l'identité PAPIER de l'étude — bordeaux `#6D2332`, Lora, les vrais
    logos, la colonne de contact, couleurs en dur et **hors du thème**. C'est le fac-similé de ce
    qui sortira de l'imprimante : le repeindre en bleu CLAIRE, ou le faire basculer en blanc sur
    noir en mode sombre, ferait mentir l'aperçu sur le `.docx` téléchargé. Même raisonnement que
    `imprimerFiche()`, dont les couleurs inline ne suivent pas non plus le thème de l'application.
    Lora est la seule police ajoutée au lien Google Fonts ; le sans-serif de l'en-tête et du pied
    de page reprend Inter, déjà chargée, plutôt que l'IBM Plex Sans de l'artefact.
  - **Ce qui vient du dossier, et ce qui ne vient JAMAIS de l'outil**
    (`prefillAppelFonds(d)`, pure et testable) : les acquéreurs (`d.parties` filtrées sur
    `role === 'acquereur'`, une personne morale devenant une civilité « SCI »), l'adresse du bien,
    la désignation déduite du type de vente, la date du rendez-vous de signature et le prix. Deux
    déductions moins évidentes, qui sont l'essentiel de « l'intelligence » demandée :
    - **le dépôt de garantie n'est porté en déduction QUE s'il est séquestré à l'étude**
      (`depotDeductible(d)`, qui lit `d.sequestreDepot`). Séquestré à l'agence, il se règle entre
      l'agence et le vendeur : le déduire ferait réclamer au client une somme trop faible, erreur
      qui ne se voit que le jour de la signature. Trois réponses, dont une franchement
      indéterminée, plutôt qu'un pari dans les deux sens. **L'agence est testée AVANT l'étude** :
      « versé à l'agence qui en donnera quittance au notaire » contient les deux mots, et c'est
      bien l'agence qui détient les fonds (test de régression dédié) ;
    - **les frais d'acte de prêt ne sont appelés que si le prêt est garanti par une hypothèque**
      (`pretHypothecaireDossier(d)`, qui lit `d.garantiesPret` — voir `GARANTIES_PRET`). Un prêt
      cautionné (Crédit Logement…) ne donne lieu à aucun acte notarié, donc à aucun frais
      supplémentaire. La fonction distingue « pas d'hypothèque » (`false`) de « garanties pas
      encore lues » (`null`) : dans le second cas l'outil ne coche rien et le dit.
  - **Ce qu'il n'a PAS pu remplir est affiché, et c'est aussi important que le reste**
    (`p.aCompleter`, rendu dans `.af-recap`) : un champ laissé vide sur un courrier adressé à un
    client se voit, et rien dans l'outil n'en dirait la raison sans ce récapitulatif. La civilité
    et le prénom y figurent systématiquement — l'extraction du compromis ne retient que le
    patronyme (voir `detecterParties`), et se tromper de civilité produit un courrier qui appelle
    « Monsieur » une cliente.
  - **Les frais et droits de l'acte de vente ne sont VOLONTAIREMENT pas repris du simulateur de
    provision** : son barème n'a jamais été audité (avertissement explicite sur cet écran, voir son
    historique), et un chiffre annoncé à un client engage l'étude. La ligne est créée à zéro, avec
    une mention dans « à compléter ». À revoir seulement si l'étude fait auditer ce barème.
  - **Bouton « Préparer l'appel de fonds » sur la fiche dossier** (`renderAppelFondsDossier(d)`,
    après le questionnaire de satisfaction, avant « Exporter ») : ferme le tiroir, bascule vers
    l'onglet et applique le préremplissage. Proposé sur tout dossier actif, **y compris en
    participation** — c'est même là que l'outil sert le plus, le décompte venant alors du confrère
    et devant être relayé au client. Ce qui manquera au courrier (date de rendez-vous, prix,
    adresse) est annoncé AVANT le clic plutôt que découvert sur l'écran suivant.
  - **Lecture du décompte d'un confrère** (`parserDecompteConfrere`, pure et testable) : un PDF
    déposé ou du texte collé, mis à plat une ligne par ligne de tableau. Les motifs ont été écrits
    sur de vrais décomptes — les resserrer sans relire `tests/appel-de-fonds.test.js` ferait perdre
    le cas réel que chacun couvre. Quatre décisions à ne pas défaire :
    - les **sous-totaux du confrère sont des CONTRÔLES, pas des lignes** (`AF_SOUS_TOTAL_RE`) : les
      reprendre compterait deux fois les mêmes sommes. Le solde qu'ils annoncent sert à VÉRIFIER le
      recalcul, jamais à le remplacer — un écart de plus de 2 centimes signale une ligne mal lue ;
    - une ligne **sans montant chiffré** (« Offerts », « Néant », « pour mémoire ») est gardée à
      zéro, jamais masquée : elle existe sur le décompte, la faire disparaître ferait croire à un
      oubli ;
    - un **prorata écrit sous forme de formule** (« 913 € x 92 jours / 365 jours ») est recalculé
      (`verifierProrataLigne`) et le résultat affiché en pastille sur la ligne — la seule
      vérification que l'outil puisse faire sur un décompte qu'il n'a pas produit ;
    - les lignes du confrère **REMPLACENT** le tableau déduit du dossier : les mélanger ferait
      compter deux fois le prix ou les frais.
  - **`appel-de-fonds-modele.js`** (nouveau fichier racine, ~350 Ko) porte le modèle Word en base64
    et les images de l'en-tête en data-URI — même mécanisme que `questionnaire-satisfaction-pdf.js`
    (la voie `sea.getAsset(fichier, 'utf8')` du `.exe` ne sert que du texte, un PNG brut ne peut
    pas y passer). Chargé **à la demande** au premier passage sur l'onglet, jamais dans
    `index.html` : le charger au démarrage ralentirait CHAQUE ouverture de CLAIRE pour un écran
    rarement utilisé. **À NE PAS OUBLIER** : déclaré dans `ASSETS_STATIQUES` (`server/src/app.js`)
    **et** dans les assets embarqués du `.exe` (`server/scripts/build-windows-exe.mjs`) — sans les
    deux, le chargement fait un 404 et la génération échoue, exactement le piège déjà documenté
    pour le questionnaire.
  - **Les logos sont posés dès que CE fichier est là, avant les deux bibliothèques**
    (`pizzip`/`docxtemplater`, chargées depuis cdn.jsdelivr.net comme tesseract.js) : celles-ci
    viennent d'un CDN, et un poste sans accès internet afficherait sinon un aperçu sans en-tête
    alors que les images, elles, sont servies par le serveur de l'étude. Défaut trouvé en
    vérification (le CDN est bloqué dans cet environnement de développement, ce qui a rendu le
    problème visible tout de suite) ; l'ordre inverse aurait passé inaperçu ici jusqu'à ce que
    l'étude soit hors ligne.
  - **Le `.docx` est rempli depuis le courrier TEL QU'IL EST AFFICHÉ**
    (`donneesCourrierAppelFonds`), pas depuis l'état interne : l'aperçu est `contenteditable`, une
    correction faite directement dedans doit se retrouver dans le fichier. Les noms de champ du
    modèle (`ref`, `addrLines`, `ville`, `dateLettre`, `salut1`, `designation`, `adresseBien`,
    `rdvPhrase`, `debitRows`/`creditRows` avec `label`/`formula`/`amount`, `totalDebit`,
    `totalCredit`, `solde`, `salut2`, `notaire`) sont ceux du modèle Word — les changer ici sans
    changer le modèle casserait silencieusement la génération.
  - **Volontairement PAS repris de l'artefact**, deux points :
    - **l'aperçu de pagination A4** (la coupure visuelle « page 2 » quand le courrier déborde) :
      utile, mais calé sur les marges réelles du modèle Word par un ratio mesuré, donc fragile, et
      sans effet sur le fichier produit. À reprendre si l'étude le demande ;
    - **l'autocomplétion d'adresse via `api-adresse.data.gouv.fr`** : un appel réseau vers un
      service tiers depuis un outil d'intranet notarial, que le reste de CLAIRE n'a nulle part, et
      dont l'adresse vient de toute façon du dossier. À ne construire que sur demande explicite.
  - **Piège de grille CSS rencontré** : `.af-grid` passe en une seule colonne sous 1100px, mais la
    page débordait quand même en largeur sur téléphone — une piste `1fr` a un minimum automatique
    de `auto`, pas de zéro, et ne descend donc pas sous la largeur min-content de son contenu (ici
    la ligne de saisie d'un client et le tableau du courrier). Corrigé par `.af-grid > * {
    min-width: 0 }`. Mesuré avant/après (`scrollWidth` 470 → 400 à 400px de large), pas déduit.
  - Tests : `tests/appel-de-fonds.test.js` (18 — les deux sens du parseur, les sous-totaux écartés,
    la ligne « pour mémoire », le recalcul de prorata et sa tolérance, la formule d'appel selon les
    civilités, le dépôt séquestré à l'agence vs à l'étude dont le cas mixte, la distinction
    `false`/`null` sur les garanties, ce que `prefillAppelFonds` déclare à compléter). Suite racine
    467 → 485, suite serveur inchangée (233 — ce chantier est entièrement côté client, à
    l'exception des deux déclarations d'asset). **Vérifié dans un vrai Chromium** (serveur réel,
    dossier synthétique, clair et sombre, 1400px et 400px) : lien de sidebar dans la bonne section,
    bouton de la fiche menant à l'onglet prérempli, récapitulatif « repris / à compléter » conforme
    au dossier, décompte de confrère collé produisant 5 lignes avec son prorata vérifié et son
    solde recalculé, logos chargés, aucune erreur JS, aucun débordement horizontal.
  - **Non vérifié en conditions réelles** : la génération du `.docx` elle-même n'a pas pu être
    exercée ici, `cdn.jsdelivr.net` étant bloqué par le proxy réseau de cet environnement de
    développement (même limite déjà documentée pour pdf.js/tesseract.js) — le modèle, ses noms de
    champ et la mécanique docxtemplater sont repris à l'identique de l'artefact, où l'étude les a
    déjà utilisés, mais le fichier produit reste à ouvrir dans Word par l'étude pour confirmation.

- **Générateur d'appel de fonds : trois retouches après le premier essai de l'étude**, dont une qui
  REVIENT SUR une décision prise la veille — l'entrée précédente de ce fichier documentait
  soigneusement le contraire, et c'est cette documentation qui était fausse :
  - **Le dépôt de garantie est déduit même lorsqu'il est séquestré à l'AGENCE.** La version livrée
    la veille refusait de le déduire dans ce cas, sur l'idée que ce dépôt se réglait directement
    entre l'agence et le vendeur ; l'étude a corrigé : « l'agence nous reverse la somme », elle
    arrive donc bien dans la comptabilité de l'étude et l'acquéreur ne doit pas la virer une
    seconde fois. Le raisonnement était mauvais dans le sens qui coûte le plus cher — il faisait
    réclamer au client une somme trop FORTE, vue seulement le jour de la signature.
    `depotDeductible()` renvoie maintenant `deductible: true` dans tous les cas où un dépôt existe
    (y compris détenteur illisible ou absent du dossier — le dépôt revient à l'étude dans les deux
    cas connus), et `motif` continue de nommer le détenteur : il décide de ce que l'étude a à faire
    AVANT la signature. Un dépôt détenu par un tiers produit donc une ligne « à compléter » (« à
    réclamer avant la signature, il est déjà déduit du virement demandé ») plutôt qu'un simple
    « repris », et le libellé de la ligne de crédit devient « Acompte sur prix déjà versé » au lieu
    d'affirmer qu'il a été versé à l'étude. Le commentaire du code garde les deux raisonnements,
    l'ancien et pourquoi il était faux, pour qu'on ne le rétablisse pas par inadvertance.
  - **Bloc destinataire aligné à droite dans l'aperçu** (`.af-adresse-bloc`) : `margin-left: auto`
    + `width: max-content`, mais **`text-align: left`** — ses LIGNES restent alignées entre elles,
    une adresse en drapeau à droite ne se lit pas comme une adresse. Repasse pleine largeur sous
    700px, où 55 % de la colonne ne suffisent plus à tenir une ligne d'adresse sans la couper.
  - **Contrôle de la ligne « frais et droits de l'acte de vente » contre le barème du simulateur**,
    pendant du contrôle de prorata déjà en place — la SECONDE chose que l'outil peut vérifier sur un
    décompte qu'il n'a pas produit. Quatre décisions :
    - **La formule de calcul est PARTAGÉE avec le simulateur de provision** : `estimerFraisActe(prix,
      cleDepartement, typeBien, eligiblePrimoAccedant)` est extraite de `calculerFraisActe()` (qui
      lit le DOM et ne pouvait donc pas être réutilisée), et cette dernière la consomme désormais.
      Deux copies de la même arithmétique auraient fini par diverger, et le contrôle aurait alors
      signalé un écart sur un montant pourtant conforme à ce que l'écran d'à côté affiche.
      `DEPARTEMENTS_FRAIS_ACTE`/`BAREME_FRAIS_ACTE` passent de `const` à `var` pour rester
      testables (limite connue du harnais, voir « Comment tester »).
    - **Le dossier ne dit pas si l'acquéreur est primo-accédant**, et le total change selon le
      régime (hausse départementale temporaire appliquée ou non). `fourchetteFraisActe()` calcule
      donc les DEUX bornes et `verifierFraisActeLigne()` ne signale que ce qui en sort — parier sur
      un régime produirait un faux écart une fois sur deux.
    - **Le contrôle est indicatif, il ne remplit JAMAIS la ligne** : ce barème n'a jamais été
      audité (avertissement déjà affiché sur le simulateur), et un chiffre annoncé à un client
      engage l'étude. Décision déjà prise en construisant l'outil, maintenue ici.
    - **Le libellé doit désigner l'acte de VENTE** (`estLigneFraisActeVente`) : « frais d'acte de
      prêt », « frais de mainlevée », « frais de négociation » relèvent d'autres barèmes, les
      contrôler contre celui-ci signalerait un écart sur une ligne parfaitement juste.
    - Deux `<select>` (département, nature du bien) dans la section « Bien vendu », **préremplis
      seulement quand le dossier tranche** : `cleBaremeDepuisDepartement()` mappe le code postal du
      bien sur les clés du barème (Corse regroupée sous « 20 », Alsace sous « 67/68 ») et rend
      `null` pour le 69, scindé entre Métropole de Lyon et Rhône — indiscernables depuis un code
      postal. Sans département choisi, aucun contrôle n'est affiché : mieux vaut ne rien dire que
      comparer au barème du mauvais département. Tolérance de 1 % (au moins 50 €) au-delà de la
      fourchette, le barème étant interpolé entre deux paliers et ne couvrant pas les débours
      variables.
  - **Trou trouvé en VÉRIFIANT le contrôle de prorata** (l'étude demandait de le vérifier, pas de
    le supposer correct) : il fonctionne sur les trois mises en page parenthésées déjà testées,
    mais une formule écrite **sans parenthèses** à la suite du libellé (« Prorata taxe foncière
    913 € x 92 jours / 365 jours     230,13 € ») sortait `formule: null` — aucun recalcul n'était
    tenté, silencieusement. Nouveau motif `AF_FORMULE_FIN_RE`, ancré en FIN de libellé et sur le
    motif complet (montant × jours / jours) : un libellé ne se termine pas par cette suite-là par
    hasard.
    - **Faux positif de ma propre vérification, à ne pas reproduire** : un cas de test donnait
      « écart attendu 1017,22 € » sur une formule `(1829x203/365)` — le recalcul à la main donne
      1017,2164, c'est le chiffre ATTENDU que j'avais mal calculé, pas l'outil. Vérifier
      l'arithmétique du cas de test avant de conclure à un bug.
  - Tests : 7 nouveaux dans `tests/appel-de-fonds.test.js` (formule sans parenthèses,
    `estLigneFraisActeVente` sur les libellés voisins, `cleBaremeDepuisDepartement` sur les cas
    regroupés/ambigus, `estimerFraisActe` par régime, la fourchette, les trois verdicts du
    contrôle et son silence à zéro, le préremplissage) ; les trois assertions du dépôt réécrites
    sur le nouveau contrat. Suite racine 486 → 493, serveur inchangée (233 — chantier entièrement
    côté client). **Vérifié dans un vrai Chromium** (serveur réel, dossier synthétique dont le
    dépôt est chez l'agence, clair et sombre, 1500px et 400px) : acompte de 9 000 € bien déduit
    avec sa ligne « à réclamer », bloc destinataire à 0px du bord droit avec ses lignes alignées à
    gauche, badge « conforme au barème » à 15 000 €, « 3 713,33 € sous le barème » à 11 000 €,
    « 6 339,74 € au-dessus » à 22 000 €, aucun badge à 0 € ni sans département choisi, aucun badge
    sur la ligne de frais d'acte de prêt, aucune erreur JS, aucun débordement horizontal.

- **Adresse du bien de l'appel de fonds : reprise du dossier, ou suggestions de la Base Adresse
  Nationale** — demandé par l'étude (« Si l'adresse du bien vendu est récupéré de sa fiche mettre
  l'adresse. Si aucun dossier n'est rattaché ou recherché laisse le champs data.gouv »). L'autre
  moitié de la demande était déjà en place : `appliquerPrefillAppelFonds()` écrivait déjà
  `p.adresseBien` dans le champ — ce qui manquait, c'est **l'autocomplétion data.gouv**, que
  j'avais volontairement écartée en portant l'artefact (voir « Volontairement PAS repris de
  l'artefact » dans son entrée) au motif qu'elle introduisait un appel réseau vers un service
  tiers. L'étude la redemande explicitement, donc elle est construite — la réserve reste notée
  ci-dessous plutôt qu'appliquée.
  - **Un seul appel vers un service extérieur dans tout CLAIRE**, et il est borné : ce qui part est
    le texte tapé dans CE champ, rien d'autre — jamais le nom du dossier, des parties, ni aucune
    autre donnée client. L'API (`api-adresse.data.gouv.fr`, Base Adresse Nationale) est un service
    public de l'État, sans compte ni clé. **Vérifié que l'échec est inoffensif** : sans accès
    internet, l'appel tombe dans le `catch`, aucun message, le champ reste une saisie libre et le
    courrier se génère exactement comme avant. Testé en conditions réelles ici, le proxy de cet
    environnement bloquant le vrai service.
  - **Deux sources, jamais en même temps, et le champ dit laquelle** (`majSourceAdresseBien`,
    `afAdresseBienDepuisDossier`) : dossier rattaché → « Adresse reprise du dossier rattaché » et
    aucune suggestion (elle a déjà été relue et corrigée à la création du dossier, la redemander à
    un service extérieur n'apporterait rien) ; pas de dossier, ou adresse absente du dossier →
    « Tapez l'adresse : des suggestions officielles s'affichent ». **Dès la première frappe la note
    rebascule** : sans ça elle affirmerait une provenance devenue fausse. Une adresse du dossier
    retouchée à la main redonne donc les suggestions, ce qui est exactement ce qu'on veut pour
    corriger une lecture approximative.
  - Fonctions pures testables : `urlRechercheAdresseDataGouv()` (encodage, `limit=5`) et
    `adressesDepuisReponseDataGouv()` (GeoJSON → `{label, contexte}`, tout ce qui n'a pas de
    `label` exploitable écarté). Le reste dépend du DOM : anti-rebond de 250 ms, minimum de
    4 caractères, et un **compteur de génération** (même patron que `generationImportActuel`) qui
    jette une réponse arrivée après que l'étude a continué de taper — sinon le menu proposerait des
    adresses sans rapport avec le contenu réel du champ.
  - **Piège classique du `blur` avant le `click`** : masquer le menu sur `onblur` du champ le fait
    disparaître AVANT que le clic sur une suggestion ne parte. D'où les 180 ms de délai dans
    `masquerSuggestionsAdresseBien()`.
  - Le menu réutilise `.dash-recherche-resultats`/`.dash-recherche-ligne`/`.dash-recherche-nom`/
    `.dash-recherche-resp`, déjà en place pour la recherche de dossier — aucun second gabarit de
    menu déroulant. Seule nouveauté CSS : `.af-adresse-auto { position: relative }`, le conteneur
    de positionnement du menu. Il enveloppe le seul champ et non le `.calc-champ`, qui porte aussi
    le libellé et la note : le menu se serait calé sur toute la hauteur du bloc.
  - **Bug pré-existant corrigé au passage, trouvé en cherchant le gabarit à réutiliser** : le menu
    de recherche de DOSSIER de cet écran (`rechercherDossierAppelFonds`) rendait des classes
    `.dash-recherche-item`/`.dash-recherche-meta` qui **n'existent nulle part dans style.css** —
    il s'affichait donc en boutons natifs bruts, sans séparateur ni survol. Un défaut introduit en
    portant l'outil, jamais signalé parce que le menu reste fonctionnel. Corrigé vers les vraies
    classes (`cursor: pointer` et le filet de séparation mesurés après coup).
  - **Volontairement limité au champ « Adresse du bien »** : « Adresse des clients », juste
    au-dessus, n'est jamais préremplie par le dossier (une fiche ne porte pas l'adresse postale des
    acquéreurs) et gagnerait donc aussi à ces suggestions — mais l'étude a nommé l'adresse du bien,
    et étendre un appel réseau à un second champ sans qu'on le demande n'est pas à moi de le
    décider. À ajouter en une ligne si elle le souhaite.
  - Tests : 2 nouveaux dans `tests/appel-de-fonds.test.js` (encodage de l'URL et absence de toute
    autre donnée dedans, lecture du GeoJSON avec ses cas vides/malformés). Suite racine 493 → 495,
    serveur inchangée (233 — chantier entièrement côté client). **Vérifié dans un vrai Chromium**
    (serveur réel, BAN simulée par interception réseau, clair et sombre, 1400px et 400px) : menu
    calé sous le champ et aligné à gauche, clic reportant l'adresse dans le champ ET dans le
    courrier, menu refermé ensuite, adresse du dossier reprise avec sa note puis note rebasculée
    dès la retouche, menu de recherche de dossier enfin stylé, aucune erreur JS, aucun débordement
    horizontal. Service réellement injoignable : champ conservé, aucun menu, aucune erreur.

- **Mention « Envoi par e-mail uniquement » À LA PLACE de l'adresse postale du destinataire**
  (« met un texte automatique editable », puis, aussitôt après : « la phrase doit remplacer
  l'adresse postale par défaut mais on doit avoir la possibilité de taper l'adresse si besoin » —
  la première version la posait AU-DESSUS de l'adresse, c'est cette précision qui a fixé sa
  place). Le bloc destinataire affiche donc, par défaut, le nom du client puis cette mention ;
  dès qu'une adresse est saisie dans « Adresse des clients », c'est elle qui s'affiche et la
  mention disparaît — une adresse postale et « envoi par e-mail uniquement » se contrediraient
  sur le même courrier. Éditable dans l'aperçu comme le reste du texte (« Envoi recommandé avec
  AR »…), effaçable, et remise à `MENTION_ENVOI_APPEL_FONDS` par « Effacer ».
  - **Le point qui a décidé de l'implémentation : un texte qui n'existe que dans l'aperçu ne part
    pas dans le `.docx`.** Le modèle Word est stocké en base64 dans `appel-de-fonds-modele.js` et
    sa liste de placeholders est FERMÉE (voir l'entrée du générateur plus haut : « les changer ici
    sans changer le modèle casserait silencieusement la génération ») — un `{mentionEnvoi}` dédié
    aurait obligé à régénérer ce blob. `addrLines` est le seul champ qui accepte des lignes libres
    (il est reconstruit depuis `#af-p-adresse` et rendu avec `linebreaks: true`) : la mention y est
    donc ajoutée en dernière ligne par `composerAdresseCourrier(lignesAdresse, mention)` (pure,
    testable), appelée dans `donneesCourrierAppelFonds()`. Aucun changement de modèle.
  - **La mention vit dans son PROPRE élément (`#af-p-mention-ligne`), hors de `#af-p-adresse`** :
    `majApercuAppelFonds()` réécrit ce dernier en entier à chaque frappe (noms + adresse), une
    mention placée dedans serait effacée dès la saisie suivante. C'est ce même `majApercuAppelFonds()`
    qui la masque ou la réaffiche selon que le champ d'adresse est rempli ou non, et
    `donneesCourrierAppelFonds()` ne la reprend dans `addrLines` que si elle est effectivement
    affichée — le `.docx` reflète le courrier tel qu'il est à l'écran, jamais un état interne qui
    en différerait.
  - Rendue en italique dans le bloc souligné du destinataire (`.af-mention-envoi`) : elle occupe la
    place d'une ligne d'adresse, l'italique la fait lire comme une mention plutôt que comme une
    adresse. Comme tout l'aperçu, elle garde l'identité PAPIER de l'étude et ne suit pas le thème
    de l'application. Une note sous le champ « Adresse des clients » dit ce qui se passe quand il
    reste vide — sans elle, rien n'expliquerait l'apparition d'une phrase que personne n'a tapée.
  - Tests : 3 dans `tests/appel-de-fonds.test.js` (mention ajoutée après les lignes du
    destinataire, omise quand une adresse est saisie — y compris sur une mention vide/blanche/
    nulle —, destinataire absent, valeur par défaut). Suite racine 495 → 498, serveur inchangée
    (233 — chantier entièrement côté client). **Vérifié dans un vrai Chromium** (serveur réel,
    clair et sombre, 1500px et 400px) : mention affichée d'office en dernière ligne du bloc,
    remplacée par l'adresse dès sa saisie puis rétablie à son effacement, édition survivant à une
    mise à jour de l'aperçu, disparition du `.docx` une fois effacée, retour à la valeur par
    défaut après « Effacer », position et alignement mesurés, aucune erreur JS, aucun débordement
    horizontal.

- **Outil 2 refait de zéro : « Relecture d'un acte », déterministe et instantané.** L'étude a
  testé la version précédente et tranché : « c'est inutilisable, c'est trop long, il n'a jamais
  réussi à me sortir quelque chose, il faut reprendre de zéro ». Cause : cinq appels Ollama en
  SÉRIE sur le CPU d'un poste de bureau avant le moindre affichage — plusieurs minutes, et un
  échec en cours de route faisait tout perdre. Le périmètre qu'elle a redonné dans la foulée est
  beaucoup plus étroit que le cahier des charges en 19 sections d'origine, et surtout il ne
  demande pas de modèle de langage : « il faut la même chose que pour l'outil 1 mais en plus
  poussé ». C'est exactement ce que le nouvel outil fait — des règles, comme Outil 1.
  - **Trois arbitrages demandés avant d'écrire une ligne** (via `AskUserQuestion`, l'étude ayant
    posé comme consigne générale de ne pas deviner) : l'IA locale est **gardée en option, APRÈS le
    résultat** ; en mode compromis on dépose **le compromis ET les justificatifs** ; le rapport se
    limite **strictement aux quatre thèmes** demandés (préemption, servitudes et urbanisme général
    sont explicitement hors périmètre — « un rapport court se lit, un inventaire ne se lit pas »).
  - **Le rapport est calculé CÔTÉ CLIENT, synchrone, sans aucun appel réseau** (`analyserCompromisOutil2`,
    `analyserProjetVenteOutil2`, script.js, deux sections « OUTIL 2 »). C'est toute la refonte : il
    s'affiche à l'instant où les PDF sont lus. Le modèle local ne sert plus qu'au bouton
    « Approfondir avec l'IA locale », sous le rapport — **une** requête, jamais bloquante, dont
    l'échec ne coûte rien puisque le résultat est déjà à l'écran.
  - **Mode « compromis / promesse » : quatre thèmes, et seulement ceux-là.**
    1. **Travaux DÉJÀ réalisés** (`detecterTravauxRealises`) — un travail n'est retenu que s'il
       porte un marqueur de réalisation PASSÉE (`RE_TRAVAUX_PASSES`), ce qui le distingue d'un
       engagement futur (thème 4, déjà couvert par `extraireEngagementsVendeur`). Deux exclusions
       indispensables : la clause de style « aucun travaux n'a été réalisé »
       (`RE_AUCUN_TRAVAUX` — la retenir produirait un danger sur CHAQUE compromis, même piège que
       la négation de copropriété déjà documentée) et les formulations d'engagement
       (`RE_TRAVAUX_FUTURS`). Un travail intérieur sans incidence sur la structure ne produit
       **aucun** constat : seuls le gros œuvre (`RE_TRAVAUX_GROS_OEUVRE`) et l'extérieur
       (`RE_TRAVAUX_EXTERIEUR`) en produisent — autorisation d'urbanisme exigible, et garantie
       décennale encore en cours si les travaux ont moins de dix ans (année lue dans la clause).
    2. **Diagnostics périmés** — `DOCUMENTS_VALIDITE_OUTIL2` déclare la durée de chacun et
       `calculerValiditeDocumentOutil2()` la compare à la date du jour, en JS pur. Plomb, amiante
       et mesurage restent explicitement « non calculable » (leur durée dépend d'un résultat ou
       d'une décision locale) plutôt que de deviner une règle : même prudence que `PIECES_*` en
       leur temps.
    3. **Entretiens et documents à obtenir** et 4. **travaux à faire avant la vente** —
       `extraireEngagementsVendeur()` d'Outil 1, réutilisée TELLE QUELLE (c'est le « la même chose
       que l'outil 1 » de la demande) ; le « plus poussé » est le rapprochement avec les
       justificatifs déposés et le contrôle de leur date.
  - **Mode « projet de vente » : comparer, et vérifier les dates** (`verifierEngagementsTenus`).
    Une obligation n'est tenue que si une preuve existe ET que sa date est encore valable — c'est
    le cas que l'étude a nommé mot pour mot (« entretien de chaudière fourni, mais a-t-il bien
    moins d'un an ? »). Trois sources de preuve, dans cet ordre : le justificatif déposé (sa date
    est lue), le projet lui-même quand il vise le document avec sa date, puis — en dernier
    recours — la pièce déjà rangée sur le NAS du dossier CLAIRE lié. Cette dernière prouve que le
    document EXISTE, jamais qu'il est valable (son fichier n'est pas lu ici) : d'où un statut
    distinct, `tenue_non_datee` (« Au dossier, date non contrôlée »), plutôt que de la compter
    comme tenue. Les clés de `DOCUMENTS_VALIDITE_OUTIL2` sont volontairement les MÊMES que celles
    de `PIECES_ENGAGEMENTS_AUTO` : aucune table de correspondance à tenir à jour.
  - **Date d'un justificatif** (`dateDuJustificatif`) : cherchée d'abord derrière un marqueur
    explicite (« établi le », « date d'intervention »…), et seulement à défaut comme première date
    du document — la toute première date d'un PDF est souvent sa date d'impression.
  - **Dédoublonnage, trouvé en vérification visuelle et pas en relisant le code** : un document
    cité DANS une clause d'engagement était détecté deux fois — une fois par
    `detecterDocumentsDatesOutil2` (qui ne voit que la mention et sa date) et une fois par
    `constatsEngagementsVendeur` (qui sait en plus si un justificatif a été déposé). Le rapport
    affichait « entretien de la chaudière : date non trouvée » juste sous « entretien de la
    chaudière fourni mais PÉRIMÉ ». Le second dit tout ce que dit le premier, et mieux : les clés
    déjà couvertes par un engagement sont désormais retirées avant `constatsDocumentsDates`.
    Produire deux fois le même constat est exactement le contraire de ce que l'étude demandait.
  - **Ce qui disparaît** : `server/src/audit/{prompts,normaliser,fusion,diagnostics}.js` et leurs
    quatre fichiers de tests, `POST /api/audit-acte/analyser`, `verifierObligationsVendeur()` et
    `tests/audit-obligations.test.js` (la vérification part maintenant du TEXTE de l'avant-contrat,
    comme l'étude l'a demandé, plus de l'état du dossier), le sélecteur « Type de vente » de cet
    écran (il ne pilotait que la passe copropriété, supprimée) et la taxonomie à dix types de
    documents, ramenée à quatre (`principal`, `reference_compromis`, `justificatif`, `autre`) — les
    distinguer plus finement n'apporte rien, le rapprochement se faisant par le contenu et le nom
    du fichier, pas par ce sélecteur.
  - **Ce qui est conservé du chantier précédent** : la mémoire des constats (écarter/confirmer,
    `empreinteConstat` étendue à `constat.phrase`, la clause littérale des règles, plus stable
    qu'un titre reformulé), la proposition de dossier depuis les parties, la couverture de lecture
    page par page (`lireTextePdfParPage`, `renderCouvertureAudit`), la comparaison structurée
    (`comparerCompromisEtProjet`) et la vérification de citation côté serveur pour les seuls
    constats du modèle.
  - **`server/src/routes/auditActe.js` réécrit** : une seule route utile,
    `POST /api/audit-acte/approfondir`. Le prompt reçoit ce que les règles ont DÉJÀ trouvé et
    demande uniquement ce qui leur échappe — sans ça le modèle repasse son temps à redire les
    mêmes choses. Un constat dont la citation n'est pas retrouvée LITTÉRALEMENT dans le document
    est marqué comme tel (`extraitVerifie`), jamais présenté au même rang qu'une citation
    confirmée. **Piège corrigé en écrivant ce module** : `localiserExtrait` renvoie `-1` et non
    `null` quand la citation est introuvable — tester la nullité aurait marqué TOUTES les
    citations inventées comme vérifiées.
  - **Piège JavaScript rencontré, valable pour tout ce fichier** : `\b` est défini sur
    `\w = [A-Za-z0-9_]`, une lettre ACCENTUÉE n'en fait pas partie. `\bÉtat` ne matche donc
    JAMAIS (espace et É sont tous deux « non-mot », il n'y a aucune frontière entre eux) — c'est
    ce qui faisait échouer silencieusement la détection de l'ERP. Toute alternative qui COMMENCE
    par une lettre accentuée doit se passer du `\b` initial ; noté en commentaire au-dessus de
    `DOCUMENTS_VALIDITE_OUTIL2`.
  - **Corrigé au passage dans Outil 1** : `OBJET_TRAVAUX_RE` portait le nom « réparation » mais pas
    le verbe, si bien que « le vendeur fera réparer le portail » ne ressortait pas comme un
    engagement de travaux. Élargi à `\br[ée]par` (le `\b` évite de matcher « irréparable »), avec
    un test de régression — c'est une vraie amélioration d'Outil 1, pas seulement d'Outil 2.
  - Tests : `tests/outil2-dangers.test.js` (35) et `server/test/audit-approfondir.test.js` (8) ;
    `tests/audit-obligations.test.js` et les quatre fichiers de tests des passes supprimés avec le
    code qu'ils couvraient. Suite racine 526, serveur 202. **Vérifié dans un vrai Chromium**
    (serveur réel, clair et sombre, 1500px et 400px) sur un compromis synthétique portant les
    quatre thèmes : sept constats sans doublon, chacun titré par ce qu'il nomme et cité avec sa
    page, quatre sections dans l'ordre, résumé par gravité cohérent avec le détail, « Écarter »
    repliant bien le constat sans le supprimer, mode projet de vente affichant les trois statuts
    d'obligation attendus, aucune erreur JS, aucun débordement horizontal.
  - **Non vérifié en conditions réelles** : ni Ollama ni pdf.js ne sont disponibles dans cet
    environnement de développement — la lecture d'un vrai PDF et la qualité du bouton
    « Approfondir » restent à confirmer par l'étude. Le rapport déterministe, lui, a été exercé de
    bout en bout sur du texte réaliste ; ce sont les REGEX qu'il faudra resserrer sur retour réel,
    au même titre que celles d'Outil 1 (premier jet, comme `PIECES_*` en leur temps).

- **Outil 2 : rapport en trois colonnes, et tous les diagnostics du DDT.** Trois demandes de
  l'étude après avoir vu le rapport livré la veille : « revois la présentation de l'outil 2 » ;
  « pour les projets de vente, mettre côte à côte clause d'engagement de l'avant-contrat et clause
  d'engagement de la vente tenue avec le justificatif » ; « pour les durées de validité des
  diagnostics, prendre tous les diagnostics en compte » avec un article notaires.fr en référence.
  - **L'article de référence N'A PAS PU ÊTRE LU** : `notaires.fr` est bloqué par le proxy réseau de
    cet environnement de développement (`EGRESS_BLOCKED`), comme pdf.js, Ollama et Google Fonts
    déjà documentés ici ; service-public.fr et un proxy de lecture le sont aussi (vérifié, pas
    supposé). Les durées viennent donc du régime légal, **à confirmer par l'étude contre
    l'article**. Pour que cette vérification se fasse à l'œil et non en relisant du code, chaque
    entrée de la table porte sa durée en clair (`duree: '10 ans'`), et un test la verrouille : une
    correction de durée sera un changement visible, jamais une retouche silencieuse.
  - **Quatre diagnostics ajoutés** : audit énergétique réglementaire (5 ans), état des nuisances
    sonores aériennes (ENSA), information sur le risque de mérule, diagnostic technique global
    (DTG). Avec les neuf déjà présents, la table couvre le dossier de diagnostic technique.
  - **Trois régimes désormais distingués, et c'est le cœur du correctif** — le confondre était la
    seule façon d'inventer une expiration ou d'encombrer le rapport :
    - **durée fixe** (`dureeMois`) → expiration calculée depuis la seule date d'établissement ;
    - **durée dépendant du RÉSULTAT** (plomb, amiante, Carrez) → toujours `dureeMois: null`,
      signalée « à vérifier » plutôt que devinée. **Mais ce qui reste calculable depuis la date
      l'est maintenant** : nouveau champ `etabliAvant`, qui porte pour l'amiante la date butoir du
      1er janvier 2013 — un repérage antérieur est à refaire quel que soit son résultat, la
      réglementation de repérage ayant changé à cette date. C'est le seul morceau de ce régime qui
      se déduise de la date seule, et il était jusqu'ici perdu avec le reste ;
    - **aucune durée légale** (bruit, mérule, DTG) → nouveau `sansDuree: true` et nouveau statut
      `SANS_DUREE`, qui ne produit **aucun constat**. Sans cette troisième voie, ces trois
      documents seraient tombés dans « validité à vérifier » comme le plomb, c'est-à-dire un
      « à vérifier » sur chacun, à chaque acte, alors qu'il n'y a rien à contrôler : exactement le
      bruit que l'étude a demandé d'éviter en réduisant le périmètre de cet outil.
  - **Vue côte à côte** (`renderObligationAudit`, mode projet de vente) : chaque engagement du
    vendeur devient une carte à trois colonnes — *avant-contrat (engagement pris)* ‖ *projet de
    vente (ce qu'il en dit)* ‖ *justificatif*. C'est le geste de relecture lui-même : lire ce à
    quoi le vendeur s'est engagé, ce que le projet en reprend, et ce qui le prouve, sans
    aller-retour entre deux PDF. Les trois colonnes s'empilent sous 820px.
    - Ça a demandé une donnée que l'outil ne gardait pas : `preuveDansProjet()` ne renvoyait que la
      page et la date, jamais le TEXTE de la clause du projet — la colonne du milieu n'aurait dit
      que « visé p.12 », ce qui n'est pas relisable, alors que **comparer les deux rédactions est
      précisément le travail demandé**. Elle renvoie maintenant `clause`, et
      `verifierEngagementsTenus()` la calcule d'emblée pour la porter sur l'obligation
      (`clauseProjet`/`pageProjet`) **dans tous les cas**, y compris quand c'est un justificatif
      déposé qui établit l'obligation : la preuve et la lecture du projet sont deux choses
      différentes, l'une ne dispense pas de l'autre.
    - Une obligation que le projet ne reprend pas l'affiche en clair (« Le projet de vente ne
      reprend pas cet engagement ») plutôt que de laisser une colonne vide : c'est un signal, pas
      une absence de donnée.
  - **Présentation du rapport** :
    - **Liseré de gravité** sur chaque constat (rouge `--urgent`, ambre `--pret`, neutre `--line`
      — aucune couleur inventée, exactement les jetons de `libelleGraviteAudit`). C'est lui qui
      rend une longue liste scannable : la pastille dit la gravité, le liseré la fait voir sans la
      lire. **Défaut vu au rendu et corrigé** : les cartes d'obligation n'en avaient pas, si bien
      qu'un « justificatif périmé » (critique) portait le même filet gris qu'un simple « à
      vérifier à la main ».
    - **Le périmètre passe en tête**, avec le comptage, dans un bandeau `.audit-entete` : savoir
      sur quoi l'analyse a porté conditionne la lecture de ce qui suit. En pied de rapport, comme
      c'était le cas, il arrivait trop tard — un rapport vide se lisait « rien à signaler » avant
      qu'on ait appris qu'il n'y avait peut-être rien eu à lire.
    - **Citations en blockquote** (`.obligation-clause`, filet à gauche + numéro de page en
      exposant) au lieu d'italique au fil du texte : un passage d'acte se distingue maintenant de
      la description au premier coup d'œil. Un seul composant pour les constats et les colonnes.
    - **Titres de section** au registre `.section-eyebrow` (le seul de l'application) avec le
      compteur en pastille, au lieu d'un `.dash-section-titre` à margin inline et d'un nombre entre
      parenthèses dans le titre. **État vide** devenu un vrai état (`.audit-vide`, vert) plutôt
      qu'une ligne d'aide perdue. Une gravité à zéro reste affichée mais en retrait.
    - **La grille de l'onglet est inversée** (`.audit-grid`, `minmax(320px,400px) 1fr` au lieu du
      `1.3fr 1fr` générique) : c'est le RAPPORT qui a besoin de la largeur, pas le formulaire — à
      trois colonnes de citations dans l'ancienne colonne étroite, la comparaison n'était plus
      lisible. **Piège de cascade rencontré, le même que déjà documenté cinq fois ici** : le repli
      en une colonne de `.dash-grid` vit dans un `@media` placé PLUS HAUT dans la feuille ; une
      règle `.audit-grid` nue l'emportait par l'ordre du fichier et faisait déborder la page de
      155px sur téléphone (mesuré, pas supposé). D'où un `@media (min-width: 1301px)`.
  - Tests : 9 nouveaux dans `tests/outil2-dangers.test.js` (couverture du DDT, durées fixes, durée
    annoncée sur chaque entrée, un document sans durée qui ne produit aucun constat même sans date,
    l'amiante d'avant 2013, l'audit énergétique, la clause du projet rapportée, sa présence sur
    l'obligation même avec justificatif déposé, son absence quand le projet ne reprend rien). Suite
    racine 526 → 535, serveur inchangée (202 — chantier entièrement côté client). **Vérifié dans un
    vrai Chromium** (serveur réel, clair et sombre, 1500px et 400px) : trois colonnes rendues pour
    chacun des trois statuts, liserés rouge/ambre/vert conformes, ENSA détecté sans produire de
    constat, amiante de 2011 signalé périmé, sections comptées, aucune erreur JS, aucun débordement
    horizontal.

- **Outil 2 : assemblées générales de copropriété**, point de vigilance demandé par l'étude en
  deux volets : « vérifier s'il y a eu une assemblée générale des copropriétaires entre l'avant-
  contrat et la date de signature de la vente et si des travaux ont été votés dans cette
  assemblée », et « détecter aussi les travaux votés dans les trois dernières assemblées générales
  de manière générale ». Nouvelle section « Assemblées générales de copropriété » dans le rapport,
  et nouvelle catégorie `COPROPRIETE` dans `CATEGORIES_RAPPORT_OUTIL2`.
  - **Uniquement sur une copropriété** (`detecterTypeVenteCopropriete` sur le projet ou
    l'avant-contrat, ou `d.typeVente === 'copropriete'` sur le dossier lié) : `constatsAssembleesGenerales`
    retourne une liste vide sinon, sans même regarder les AG relevées. Sur une maison, une clause
    qui cite une assemblée (lotissement, ASL) ne doit rien produire.
  - **Volet 1 — l'AG dans la fenêtre** (mode « projet de vente » seulement) : la fenêtre va de la
    signature de l'avant-contrat (`detecterDateCompromis` sur son texte) à celle de la vente. Cette
    dernière n'existe pas encore — le projet n'est pas signé —, elle est donc prise sur le dossier
    lié (`rendezVousSignature || acte`) ; **sans dossier lié la fenêtre reste OUVERTE**, toute AG
    postérieure à l'avant-contrat est alors signalée, ce qui est le comportement prudent. Une AG
    tenue le jour MÊME de l'avant-contrat est hors fenêtre : elle est antérieure à l'engagement,
    elle relève du volet 2 (testé). Travaux votés → CRITIQUE, avec le rappel de l'art. 6-2 de la
    loi du 10 juillet 1965 (sauf convention contraire, c'est celui qui est copropriétaire à la date
    d'exigibilité de l'appel de fonds qui doit) ; AG sans travaux identifiés → IMPORTANT, avec
    l'invitation à relire le procès-verbal. En mode « compromis » ce volet ne s'applique pas du
    tout : ce document n'est justement pas encore signé (`dateAvantContrat` vaut `null`).
  - **Volet 2 — les trois dernières AG** (`NB_AG_A_EXAMINER`) : seules celles où des travaux ont été
    votés produisent un constat, en A_VERIFIER, et **celles déjà signalées par le volet 1 en sont
    retirées** — les redire serait le doublon que le rapport évite déjà ailleurs (voir
    `clesEngagees` dans `analyserCompromisOutil2`).
  - **Copropriété sans aucune AG datée** → A_VERIFIER : les PV des trois dernières assemblées font
    partie de ce que le vendeur doit remettre, leur absence est en soi le point à vérifier.
  - **Trois sources lues, et fusionnées** (`fusionnerAssembleesGenerales`) : la clause
    « Assemblées générales » de l'avant-contrat les DATE, le projet les reprend, et c'est le PV
    déposé en justificatif qui dit ce qui y a été VOTÉ. Une même AG citée deux fois n'apparaît donc
    qu'une, et **la version qui établit un vote l'emporte sur celle qui n'en dit rien**.
  - **Une AG n'est retenue que datée** (`RE_MENTION_AG` + `RE_CONNECTEUR_DATE_AG`) : le mot seul
    apparaît dans des clauses de style (« les décisions d'assemblée générale s'imposent à
    l'acquéreur ») qui ne désignent aucune réunion. **Le connecteur est ancré des deux bouts** —
    un simple `(?:du|le)\s*$` acceptait « l'assemblée générale statuera sur ces travaux AVANT LE
    30 juin 2026 », c'est-à-dire une échéance à venir prise pour une réunion tenue (test de
    régression dédié).
  - **Deux garde-fous sur le vote** : une résolution rejetée/ajournée ne compte pas
    (`RE_RESOLUTION_REJETEE`), et la clause de style « aucun travaux n'a été voté lors des trois
    dernières assemblées » non plus (`RE_AUCUN_TRAVAUX_VOTE`) — sans ce second, la phrase qui
    RASSURE produirait exactement l'alerte qu'elle vient d'écarter, même piège que « le bien n'est
    pas soumis au statut de la copropriété » côté Outil 1.
  - **Défaut vu au rendu, pas en relisant le code, et corrigé** : la fenêtre de lecture des travaux
    (`FENETRE_TRAVAUX_AG`, 900 caractères) débordait sur l'AG SUIVANTE. Sur « AG du 14 mai 2025 :
    travaux de ravalement votés. AG du 22 juin 2024 : aucun travaux n'a été voté. », la phrase de
    style de la SECONDE annulait le vote de la PREMIÈRE — un vrai travail voté disparaissait du
    rapport. `detecterAssembleesGenerales` fait désormais deux passes : les mentions d'abord, les
    fenêtres ensuite, chacune fermée par la mention suivante. Les tests unitaires ne l'avaient pas
    attrapé : ils ne portaient qu'une AG par texte.
  - Tests : 13 nouveaux dans `tests/outil2-dangers.test.js` (dates lues et triées, vote vs rejet,
    clause de style, date non rattachée à la réunion, fusion multi-documents, les quatre cas de
    bornes de fenêtre, les gravités des deux volets, le dédoublonnage entre volets, le silence hors
    copropriété, la copropriété sans AG, les deux modes de bout en bout, et la régression de la
    fenêtre débordante). Suite racine 535 → 549, serveur inchangée (202 — chantier entièrement côté
    client). La note « Ce que cette relecture contrôle » de l'écran est complétée dans les deux
    modes : sans ça, elle annonçait un périmètre devenu faux.
  - **Vérifié dans un vrai Chromium** (serveur réel, clair et sombre, 1500px et 400px) sur un
    avant-contrat de copropriété citant deux AG + un PV déposé : fenêtre correctement calculée
    (15/01/2026 → 30/04/2026), trois AG fusionnées sans doublon, un constat CRITIQUE pour l'AG du
    3 février 2026 et un A_VERIFIER pour celle du 14 mai 2025, section comptée à 2, aucune erreur
    JS, aucun débordement horizontal.
  - **Limite connue, non corrigée ici** : `detecterDateCompromis` ne reconnaît pas « Le présent
    compromis a été signé à BLOIS le … » (elle reconnaît « Fait à … le … », « signé
    électroniquement le … », « a signé à … le … »). Sur un avant-contrat rédigé ainsi, la fenêtre
    du volet 1 ne se calcule pas et seul le volet 2 s'applique — limite ancienne de cette fonction,
    hors du périmètre de cette demande, à traiter avec un extrait réel comme le reste de ce fichier.

- **Deux corrections signalées sur un vrai projet de vente** (« VENTE BOURGUEIL / CHARPENTIER et
  GENESTOUX », l'acte de la promesse déjà rejouée plus haut) — dans les deux cas la clause a été
  **rejouée sur le PDF réel** avant d'écrire une ligne, et la seconde a mis au jour un défaut bien
  plus large que ce que l'étude avait vu :
  - **La clause d'origine de propriété n'est plus une obligation du vendeur.** « Le PROMETTANT
    devra justifier d'une origine de propriété régulière remontant à un titre translatif d'au moins
    trente ans » : clause de style de presque tous les avant-contrats, et établir cette origine est
    le travail du notaire sur le titre, pas une pièce à réclamer. `EXCLUSION_ENGAGEMENT_RE` portait
    déjà `trentenaire` (voir son historique) mais la rédaction courante n'emploie jamais cet
    adjectif — elle écrit « trente ans » en toutes lettres. Deux motifs ajoutés,
    `origine\s+de\s+propri[ée]t[ée]` et `titre\s+translatif`, chacun suffisant à lui seul sur la
    clause réelle. Un test de contrôle vérifie que l'exclusion reste étroite : une clause qui parle
    de propriété à un autre titre (« fournir l'attestation notariée de propriété ») ressort
    toujours comme engagement documentaire.
  - **Bug structurel : le bloc d'une partie débordait sur la suivante dès que le texte n'avait pas
    de retour à la ligne.** Symptôme signalé : « GENESTOUX était ACQUEREUR dans le compromis/la
    promesse, VENDEUR dans le projet de vente » — un faux constat CRITIQUE de rôle changé sur un
    projet pourtant conforme. Cause : `RE_TITRE_PARTIE_SUIVANTE`, la borne de fin du bloc d'une
    partie, exige le titre de la partie suivante **en début de ligne** ; or pdf.js rend une page
    comme une suite d'items joints par une espace (`content.items.map(it => it.str).join(' ')`,
    dans `lireTextePdfParPage` comme dans `extraireTextesUtiles`), donc **le texte que lit l'outil
    n'a qu'un seul retour à la ligne par PAGE**. Sur un acte authentique, où l'état civil des deux
    parties tient dans la même page, la borne ne matchait donc jamais et le bloc VENDEUR avalait
    toute la section ACQUÉREUR. Reproduit exactement en simulant l'extraction pdf.js (`\n` par page
    seulement) sur le texte des deux PDF réels : CHARPENTIER et GENESTOUX ressortaient VENDEURS.
    - **Correctif : la FIN DE PHRASE est acceptée comme seconde borne de gauche**
      (`(?:^|\n|[.;]\s)`), et une espace comme borne de droite. Ce qui rend l'assouplissement sûr
      est la position : un titre de section suit toujours un point (« … pour le cas de
      l'inexécution. ACQUEREUR Monsieur… »), tandis qu'une mention au fil du texte (« Les VENDEURS
      s'engagent de manière indivisible… ») est précédée d'un MOT, jamais d'un point — elle ne
      coupe donc rien. Les majuscules restent exigées. Vérifié par trois tests : le cas aplati, le
      même acte mis en lignes (rien ne change là où les retours existent), et la mention au fil du
      texte qui ne doit pas couper.
    - **Le même correctif répare un défaut d'Outil 1 que personne n'avait signalé** : sur cet acte,
      `detecterNomDossier()` rendait « BOURGUEIL & BOUSSELET & CHARPENTIER & GENESTOUX » — les
      quatre du même côté. Il rend maintenant « BOURGUEIL & BOUSSELET / CHARPENTIER & GENESTOUX ».
      C'est probablement une part du « les noms de dossier ne vont pas » resté ouvert depuis
      longtemps, cette fois reproduite et corrigée plutôt que déduite.
    - Avant/après mesurés sur les deux PDF réels via un script de bac à sable : le rapport d'Outil 2
      passait d'un constat « Rôle changé pour GENESTOUX » + une obligation fantôme (la clause
      trentenaire) à **zéro constat de comparaison et zéro obligation** — les deux signalements de
      l'étude, corrigés ensemble et vérifiés sur leurs documents d'origine.
  - **Leçon, la même que pour le premier acte authentique rejoué ici** : le texte que l'outil lit
    n'est pas celui qu'on voit dans un lecteur PDF. Toute regex qui s'ancre sur `^` ou `\n` est
    suspecte par construction — il n'y a qu'un retour à la ligne par page. À vérifier sur les
    autres motifs qui en dépendent (`RE_TITRE_PIECE_JOINTE`, `estDebutPageAnnexe`, `estTitreDeSection`)
    au prochain signalement qui y ressemble.
  - `npm test` : 554 tests racine (+5), 202 côté serveur (inchangés, chantier entièrement côté
    client).

- **Trois retouches demandées ensemble** :
  - **Appel de fonds : le contrôle de la provision sur frais se nourrit de ce qui est déjà saisi
    au-dessus.** Ses deux menus (« Département du bien », « Nature du bien ») n'étaient remplis
    que par le préremplissage depuis un dossier lié — sur un courrier tapé à la main, il fallait
    ressaisir à dix lignes d'écart une information déjà donnée, et le contrôle restait muet tant
    qu'on ne le faisait pas. `majFraisDepuisBienAppelFonds()` les dérive désormais de l'adresse
    (code postal → `departementDepuisCodePostal` → `cleBaremeDepuisDepartement`) et de la
    désignation (`typeBienDepuisDesignation()`, nouvelle fonction pure testable).
    - **Branché dans `majApercuAppelFonds()` et nulle part ailleurs** : c'est le seul point par où
      passent TOUS les chemins qui modifient ces deux champs — la frappe, le clic sur une
      suggestion d'adresse BAN, et le préremplissage depuis un dossier. Un `oninput` ajouté sur
      chaque champ aurait manqué les deux derniers.
    - **Un choix fait à la main n'est jamais écrasé** : `marquerChoixFraisAppelFonds()` (l'`onchange`
      des deux menus) lève un drapeau qui désactive l'auto-remplissage pour ce menu jusqu'à la
      remise à zéro du formulaire. Sans ce garde-fou, corriger un département à la main serait
      annulé à la frappe suivante dans l'adresse.
    - **Ce qui ne tranche pas remet le champ à vide plutôt que de garder la valeur précédente** :
      un code postal du 69 (Métropole de Lyon / Rhône, indiscernables — voir
      `cleBaremeDepuisDepartement`) ou une désignation qui ne dit pas la nature du bien laissent le
      contrôle muet, au lieu de comparer à un barème qui n'est plus celui du bien.
    - `typeBienDepuisDesignation()` teste « lot/copropriété/appartement » AVANT « maison/immeuble » :
      « un lot de copropriété dans un immeuble » est une copropriété, pas un immeuble. Quatre tests
      dans `tests/appel-de-fonds.test.js`, dont ce cas et les désignations qui ne tranchent pas.
    - Le `renderTableAppelFonds()` n'est relancé que si un menu a réellement changé, pas à chaque
      frappe dans l'adresse.
  - **Courrier : le bloc visioconférence descend en bas de la colonne de gauche, et le logo
    Notaires de France est réduit.** L'aperçu posait « OFFICE ÉQUIPÉ DE LA VISIOCONFÉRENCE » en
    TÊTE de l'aside — or dans le modèle Word (`word/header2.xml`, zone de texte latérale) ce bloc
    est le DERNIER contenu de la colonne, donc en bas de la première page. Vérifié en dézippant le
    `.docx` embarqué dans `appel-de-fonds-modele.js` et en relisant l'ordre des paragraphes de
    cette zone : l'aperçu divergeait du fichier réellement téléchargé, il ne s'agissait donc pas
    d'un choix de mise en page nouveau mais d'un alignement sur le modèle. `.af-logo-notaires`
    passe de 420px/55 % à 360px/48 % (mesuré à 324px de large dans l'aperçu).
  - **Badge ALPHA : padding symétrique rétabli** (`2px 4px`, `line-height` retiré). Le réglage
    asymétrique posé la veille pour compenser l'espace des jambages qu'aucune capitale n'occupe
    avait été **mesuré sur la police de repli** — `fonts.googleapis.com` étant bloqué dans cet
    environnement de développement — et décalait le mot vers le bas une fois Inter réellement
    chargée sur le poste de l'étude. **Leçon** : ne pas régler un centrage au pixel près sans
    pouvoir l'observer avec la vraie police ; à couvrir par le commentaire plutôt que par une
    nouvelle tentative.
  - Vérifié dans un vrai Chromium (serveur réel, clair et sombre, 1500px et 400px) : 41100 →
    département 41 et « un lot de copropriété » → copropriété, 45000 + « une maison » → 45 et
    maison, un type choisi à la main qui résiste à un changement de désignation, un code postal du
    69 qui vide le champ, le bloc visio en 4ᵉ et dernière position de l'aside sous HORAIRES, le
    badge ALPHA à 36×17 px avec `padding: 2px 4px`, aucune erreur JS, aucun débordement
    horizontal. `npm test` : 558 tests racine (+4), 202 côté serveur.

- **Appel de fonds : l'import d'un PDF de décompte ne rendait RIEN, et le contrôle du barème ne se
  déclenchait jamais.** Signalé par l'étude avec une vraie convocation de confrère (LD Notaires,
  décompte à 7 lignes, solde 227 642,28 €). Le PDF a été rejoué à travers la chaîne réelle plutôt que
  relu — les quatre défauts sont apparus du premier coup.
  - **Deux bugs empilés empêchaient toute lecture.** D'abord `importerDecompteAppelFonds()` faisait
    `lu.texte` sur le retour de `lireTextePdfVerification()`, qui renvoie une **chaîne**, pas un
    objet : la propriété valait `undefined`, le parseur recevait `''`, et le chemin d'import PDF
    était donc mort depuis toujours, quel que soit le document. Ensuite, même corrigé, ce lecteur
    joint tous les items d'une page par une espace : le texte rendu n'a **qu'un retour à la ligne
    par PAGE**, alors qu'un décompte est un TABLEAU et que `parserDecompteConfrere()` travaille
    ligne par ligne. Même piège que celui déjà payé sur `RE_TITRE_PARTIE_SUIVANTE`, appliqué cette
    fois à un parseur entièrement ligne par ligne, donc fatal.
  - **`lireTextePdfEnLignes(pdf)` / `lignesDepuisItemsPdf(items)`** (nouvelles, pures pour la
    seconde donc testables) reconstruisent les lignes depuis la position VERTICALE de chaque item
    (`transform[5]`, la translation Y de la matrice de rendu) : deux items à la même hauteur
    appartiennent à la même ligne du tableau. La tolérance est **dérivée de la hauteur du texte**
    (`TOLERANCE_LIGNE_PDF`) et non fixée en dur — un décompte mélange couramment plusieurs corps de
    police, et un seuil absolu couperait en deux une ligne écrite plus grand. Y décroît vers le bas
    en coordonnées PDF, d'où le tri décroissant pour retrouver l'ordre de lecture. Les deux autres
    lecteurs (`lireTextePdfVerification`, `lireTextePdfParPage`) ne sont **pas touchés** : leurs
    appelants cherchent des mots-clés dans un texte continu, l'aplatissement ne les gêne pas.
    Repli sur la lecture OCR si le PDF n'a pas de texte extractible — sa sortie est naturellement
    découpée en lignes.
  - **`AF_FRAIS_ACTE_RE` étendue à « frais d'achat » / « frais d'acquisition »** : c'est le libellé
    des décomptes réels (« Frais d'achat (sauf à parfaire ou à diminuer) »), pas « frais d'acte »
    comme le modèle de l'étude — le contrôle du barème ne se déclenchait donc jamais sur un
    décompte importé, celui-là même qu'il sert à vérifier. « Frais de prêt » et « frais de
    promesse » restent hors périmètre (autres barèmes), et « Provision sur frais versée à ce
    jour » ne risque rien : le contrôle ne porte que sur la colonne débit.
  - **Le rapport d'import dit désormais pourquoi le contrôle se tait** quand le département et la
    nature du bien manquent — une convocation décrit une somme à virer, pas le bien, donc ces deux
    données n'y sont jamais. Se taire sans rien dire laissait croire que la ligne avait été
    vérifiée et jugée conforme. La note n'apparaît que s'il y a bien une ligne à contrôler.
  - **Tirets, puces et deux-points de fin retirés des libellés** (`afNettoyerLibelle`, appelée sur
    tous les chemins du parseur) : « - Frais d'achat », « • Prorata », « Prix de vente: » sont de
    la mise en page du décompte, pas des libellés — ils partaient tels quels dans le courrier. Les
    deux branches du parseur en retiraient déjà un en tête de LIGNE, mais pas celle où le libellé et
    son montant sont sur deux lignes (le tiret vit alors dans `libelleEnAttente`), ni les puces et
    tirets longs. Le nettoyage est aussi appliqué **avant** les tests de sous-total et de ligne de
    prix, tous deux ancrés en début de chaîne : un « - Ensemble » ne matchait aucun des deux.
  - **Interligne du tableau resserré** (`table.af-table td`, `line-height: 1.35`) : le corps de la
    lettre est aéré (interligne hérité d'environ 1,6), ce qui laissait une dizaine de pixels de
    blanc sous chaque cellule d'une seule ligne — « un saut de ligne sous chaque ligne du début du
    tableau ». `vertical-align: top` est CONSERVÉ : il aligne le montant sur la première ligne d'un
    libellé qui passe à la ligne, ce qu'un centrage casserait. Mesuré avant/après : hauteur de
    cellule 36 → 30 px, blanc réparti 7 px au-dessus / 6 px en dessous.
  - **Date de rendez-vous en gras souligné dans le document Word.** L'aperçu l'affichait déjà
    ainsi (`<b><u>` autour de `#af-p-rdv`), mais dans le modèle `.docx` toute la phrase était **une
    seule `<w:r>` sans mise en forme** : `{rdvPhrase}` sortait en texte plat, et « vente » comme
    `{adresseBien}` perdaient aussi leur soulignement. Le paragraphe est découpé en sept runs avec
    les `<w:rPr>` correspondants, et le base64 de `appel-de-fonds-modele.js` régénéré. **Piège à
    connaître pour toute future retouche du modèle** : un placeholder doit rester ENTIER dans une
    seule run, docxtemplater ne sait pas recoller un `{nom}` coupé en deux. Vérifié après coup que
    les 27 fichiers de l'archive sont inchangés sauf `word/document.xml`, que tous les
    placeholders (dont les boucles `{#debitRows}`/`{#creditRows}`) sont intacts, et que chaque XML
    reste bien formé.
  - Tests : 5 nouveaux dans `tests/appel-de-fonds.test.js` (reconstruction des lignes depuis des
    items en désordre, tolérance verticale, tirets/puces/deux-points retirés y compris sur deux
    lignes, « frais d'achat » contrôlé et « frais de prêt » non, et le décompte réel recalculé au
    centime près). Suite racine 558 → 563, serveur inchangée (202). **Vérifié de bout en bout** :
    le PDF réel rejoué à travers `lignesDepuisItemsPdf` (items simulés depuis les boîtes
    englobantes de `pdftotext`, pdf.js étant bloqué par le proxy de cet environnement) donne 7
    lignes et un recalcul à 227 642,28 €, identique au solde annoncé par le confrère ; puis dans un
    vrai Chromium (serveur réel) : tableau rendu sans tiret ni blanc superflu, département 41 et
    nature « maison » déduits de l'adresse saisie, badge « ✓ conforme au barème » sur les
    18 200 € du confrère, phrase de rendez-vous en gras souligné, aucune erreur JS.

- **Outil 2 : état daté, pré-état daté et certificat d'urbanisme, avec les questions à poser.**
  Demandé par l'étude à partir d'un cas réel : la lecture de l'état daté l'avait conduite à écrire au
  confrère « des travaux de ravalement sont-ils prévus pour les prochaines années, des devis
  ont-ils été réalisés ? » et « la procédure liée à l'affaissement de la cour a-t-elle évolué
  depuis la promesse ? » — « c'est le genre d'analyse dont on a besoin ». Trois arbitrages pris
  avec elle avant d'écrire une ligne, à ne pas rouvrir sans nouvelle demande : périmètre =
  **tout** le contenu de l'état daté (pas seulement les deux points de l'exemple) ; sortie = des
  constats **et** des questions prêtes à copier ; certificat d'urbanisme = points de vigilance +
  validité. Entièrement déterministe et synchrone, comme le reste d'Outil 2 : aucun appel au
  modèle local.
  - **Deux régimes de rubrique, et c'est ce qui évite l'inventaire** (`RUBRIQUES_ETAT_DATE`) : une
    rubrique de MONTANT n'intéresse que si elle porte une somme > 0 — « néant », « sans objet »
    ou 0,00 € sont des RÉPONSES du syndic, pas des absences, et ne produisent rien ; une rubrique
    de MENTION (une procédure, un devis) suffit à se signaler par sa seule présence. Sans cette
    distinction, chaque état daté produirait une dizaine de constats, c'est-à-dire exactement
    l'inventaire que l'étude a demandé d'éviter en réduisant le périmètre d'Outil 2. Une rubrique
    trouvée dont le montant est illisible est dite « à vérifier » plutôt qu'ignorée.
  - **Huit rubriques** : procédures en cours (CRITIQUE), travaux envisagés et devis, charges
    impayées du vendeur, sommes incombant à l'acquéreur, travaux votés non encore appelés,
    emprunt du syndicat, fonds de travaux, avances. Premier jet, comme `PIECES_*` en leur temps :
    à resserrer dès qu'un vrai état daté fait remonter un faux positif, jamais à élargir « au cas
    où ».
  - **Un pré-état daté ne dispense jamais de demander l'état daté** : document de courtoisie,
    établi avant l'avant-contrat, ni opposable ni à jour au moment de la vente — d'où deux types
    distincts et un constat qui lui est propre. Une copropriété sans état daté du tout produit
    elle-même un point à vérifier ; hors copropriété, rien.
  - **Certificat d'urbanisme** : validité de 18 mois (`MOIS_VALIDITE_CU`, art. R.410-17 C. urb.)
    calculée en JS pur à partir de la seule date lue — jamais demandée au modèle, même principe
    que `DUREES_VALIDITE_DIAGNOSTIC`. La prorogation d'un an existe mais suppose une demande et
    l'absence de changement des règles : elle n'est donc jamais présumée, seulement rappelée.
    **Un CU « a » (information) est distingué d'un CU « b » (opérationnel)** : se fier au premier
    pour juger un projet de construction est précisément l'erreur à signaler. Huit points de
    vigilance (`POINTS_CERTIFICAT_URBANISME`) : emplacement réservé (CRITIQUE), alignement,
    préemption, servitudes, risques, patrimoine, opération d'aménagement, taxes.
  - **Bloc « À demander » en pied de rapport** (`questionsOutil2`, `renderQuestionsAudit`) : un
    constat dit ce qui a été repéré, une question dit ce qu'il reste à demander — et c'est elle
    qui part dans le courrier. Groupées par destinataire (syndic, confrère, mairie), jamais
    répétées, avec un bouton « Copier » par bloc. **`navigator.clipboard` n'existe qu'en contexte
    sécurisé** — absent sur un poste qui rejoint le serveur par son adresse IP, même limite que
    `showDirectoryPicker` — d'où le repli `<textarea>` + `execCommand`, qui marche partout. Un
    constat sans question ne produit aucune demande : un certificat encore valable n'a rien à
    demander à personne.
  - **Piège structurel évité** : un avant-contrat CITE systématiquement l'état daté et le
    certificat d'urbanisme sans être ni l'un ni l'autre (même boilerplate qui avait déjà fait
    perdre toute détection par le CONTENU à la checklist de pièces). Reconnaissance par le NOM
    d'abord, puis par le seul TITRE (400 premiers caractères), et un garde-fou explicite qui
    écarte tout document dont le nom ou l'en-tête annonce un compromis / un projet d'acte.
  - **Piège JavaScript rencontré, le même que celui déjà documenté pour `\bÉtat`** : `\b` est
    défini sur `\w = [A-Za-z0-9_]`, une lettre ACCENTUÉE n'en fait pas partie. `/\b[ée]tat/` ne
    matche donc JAMAIS « ÉTAT DATÉ » (espace et É sont tous deux « non-mot »), et `/dat[ée]\b/`
    échoue de même sur le « É » final. Sept motifs étaient concernés (état daté, référé, étude,
    impayé, concerné, réservé, site classé) — corrigés par des lookarounds explicites
    `(?<![A-Za-z0-9_À-ɏ])` / `(?![A-Za-z0-9_À-ɏ])`. **À vérifier systématiquement dès qu'un
    motif commence ou finit par une lettre susceptible d'être accentuée.**
  - Tests : `tests/outil2-etat-date.test.js` (14). Suite racine 563 → 577, serveur inchangée.
    **Vérifié dans un vrai Chromium** (serveur réel, clair et sombre) sur un état daté et un
    certificat d'urbanisme synthétiques : 5 constats d'état daté et 5 d'urbanisme, 10 questions
    réparties entre les trois destinataires, copie dans le presse-papiers confirmée, aucun
    débordement horizontal, aucune erreur JS.

- **La date butoir devient informative, et le planning enchaîne appel de fonds → signature.**
  Quatre demandes de l'étude dans le même message, qui ne forment qu'une seule règle métier :
  ce qui engage l'étude, c'est le rendez-vous réellement pris à l'office, pas la date lue dans
  l'avant-contrat.
  - **« Signature de l'acte » (`acte`) devient « Date butoir »** partout où elle est nommée
    (`LIBELLES_CATEGORIE`, le sélecteur de recatégorisation, le tab de la fiche) **et disparaît du
    planning** — tableau du Suivi, vue Échéances, rappels par email. Elle reste visible sur la
    fiche, avec l'écart qui la sépare du rendez-vous (« signature 5 j APRÈS ce butoir », déjà en
    place).
  - **Tant que l'appel de fonds n'est pas fait, c'est lui que le planning annonce**, même si le
    rendez-vous est déjà fixé : c'est ce qu'il reste à faire. Faute de date propre — le cas
    courant, l'étude ne la saisit pas toujours — il prend celle du rendez-vous : l'appel doit de
    toute façon être parti avant, c'est sa vraie échéance, et mieux vaut ça que ne rien annoncer.
    Une fois l'appel de fonds fait, le rendez-vous prend le relais sous le nom de « Signature de
    l'acte ».
  - **Une seule définition du planning** (`echeancesPlanning`) : `toutesEcheances()` et
    `prochaineEcheanceDetail()` en portaient chacune une copie, et toute règle ajoutée à l'une
    devait être reportée à l'autre à la main. C'est ce qui a rendu ce lot sûr à appliquer.
  - **Le titre du tab « Rendez-vous de signature » passe en gras** (`.tab-name-fort`) : c'est la
    seule date de signature qui fasse foi, juste à côté d'une date butoir qui ne l'est pas.
  - **Miroir serveur mis à jour à l'identique** (`server/src/jobs/rappels.js`) : plus aucun rappel
    J-15/J-7 sur une date butoir, et le même enchaînement appel de fonds → signature. Le flux
    `.ics` n'est PAS touché : un repère indicatif dans un agenda ne gêne personne, et le retirer
    demanderait d'en publier l'annulation.
  - Tests : suite racine 577 → 579 (quinze tests réécrits sur les nouvelles règles plutôt que
    contournés — ils encodaient les anciennes), serveur 203. **Vérifié dans un vrai Chromium** :
    appel de fonds annoncé à la date du rendez-vous tant qu'il n'est pas fait, « Signature de
    l'acte » ensuite, fiche affichant « Date butoir » et le rendez-vous en gras.

- **Appel de fonds : les libellés d'un décompte de confrère sont ramenés au vocabulaire de
  l'étude** (`LIBELLES_NORMALISES_DECOMPTE`, `normaliserLibelleDecompte`). Chaque confrère nomme
  les mêmes lignes à sa façon, et ces libellés partent TELS QUELS dans le courrier de l'étude :
  « Prix de vente » → « Prix d'acquisition », « Frais d'achat » → « Montant des frais et droits
  de l'acte de vente », « Prorata taxe foncière » → « Quote-part de taxes foncières »,
  « Acompte » → « Acompte sur prix versé à l'étude », « Provision sur frais » → « Acompte sur
  frais versé à l'étude », variantes comprises.
  - **Un libellé NON reconnu n'est jamais renommé** : renommer ce qu'on n'a pas compris serait pire
    que de ne rien faire. Une taxe locale, un honoraire, une ligne propre au dossier gardent leur
    rédaction, mot pour mot.
  - **L'ordre des règles porte le sens** : « provision/acompte sur FRAIS » doit être testé avant
    « acompte » tout court, et « frais d'acte de PRÊT » / « frais de promesse » / « frais de
    mainlevée » sont explicitement écartés en premier — ils relèvent d'autres barèmes, les
    renommer « frais et droits de l'acte de vente » serait un contresens et le contrôle du barème
    les prendrait alors pour la ligne qu'il vérifie.
  - **Piège d'outillage, à ne pas reproduire** : écrire ce tableau de regex via un heredoc Python
    a inséré cinq caractères BACKSPACE (U+0008) là où `\b` était attendu — `\b` est un backspace
    dans une chaîne Python. Le fichier restait syntaxiquement valide et les regex matchaient à peu
    près, donc rien ne le signalait. Détecté par `grep -c $'\x08'`, à lancer après toute écriture
    de regex par script.
  - Tests : 4 nouveaux dans `tests/appel-de-fonds.test.js` (les cinq familles et leurs variantes,
    les lignes qui ressemblent aux frais d'acte sans en être, un libellé non reconnu, et le
    décompte réel importé dont les montants ne bougent pas). Suite racine 579 → 583.

- **Le serveur se figeait le temps de relire le NAS — corrigé en rendant tout ce chemin
  asynchrone.** Signalé par l'étude (« le serveur saute souvent en ce moment »), puis précisé sur
  question directe : « il me met un message d'erreur et il faut actualiser pour que ça revienne,
  parfois ça se fige ». **C'est cette précision qui a tranché** : si une simple actualisation de la
  page suffit à tout remettre en ordre, le processus n'est pas mort — il était seulement
  injoignable pendant un moment. Écarté d'emblée, donc, le crash du processus (les gestionnaires
  `uncaughtException`/`crash.log` journalisent et laissent tourner, et le seul `process.exit` du
  code est dans le chemin de démarrage).
  - **Cause : Node est mono-thread, et la surveillance du NAS était synchrone.**
    `executerTourSurveillanceNas()` (toutes les 10 minutes, voir son historique plus haut)
    parcourait TOUS les dossiers reliés avec `readdirSync`/`realpathSync`/`existsSync`. Pendant tout
    le tour, la boucle d'événements est occupée : le serveur n'accepte plus une seule requête HTTP.
    Sur un LAN rapide le tour passe inaperçu (moins d'une seconde mesurée ici sur un disque local),
    mais chaque aller-retour SMB coûte des dizaines de millisecondes dès que le NAS répond mal
    (disques en veille, sauvegarde en cours, reconnexion) — **14 allers-retours par dossier × 60
    dossiers = 840 par tour**. D'où un serveur qui paraît mort puis revient de lui-même, exactement
    toutes les dix minutes.
  - **Correctif** : `server/src/nas.js` passe entièrement à `node:fs/promises`
    (`listerPdfRecursif`, `listerSousDossiers`, `resoudreCheminNas`), `server/src/routes/nas.js`
    remplace chaque `fs.existsSync` par un `await existe(...)`, et `nasWatch.js` rend explicitement
    la main entre deux dossiers (`respirer()`, un `setImmediate`) pour qu'un portefeuille qui
    grandit ne puisse jamais monopoliser le serveur à nouveau. Un drapeau `enCours` empêche en plus
    deux tours de se chevaucher : un tour lent ne doit pas voir le minuteur en relancer un second
    par-dessus, ce qui doublerait la charge sur le NAS précisément quand il est déjà en difficulté.
  - **`resoudreCheminNas()` garde des garanties de confinement RIGOUREUSEMENT identiques** : seuls
    les appels disque ont changé, la logique (résolution des liens AVANT la comparaison, refus de
    tout ce qui retombe hors de la racine) est inchangée — et ses tests, eux aussi inchangés dans
    leurs assertions, ne sont devenus `async` que pour `await` les appels.
  - **Piège Express 4, à ne pas reproduire** : une route `async` dont la promesse REJETTE ne renvoie
    jamais rien — Express 4 ne rattrape pas une promesse rejetée, et la requête reste suspendue
    jusqu'au timeout du navigateur. Soit un gel remplacé par un blocage DÉFINITIF, donc pire que le
    problème traité. D'où l'enveloppe `routeAsync()` en tête de `routes/nas.js`, obligatoire sur
    chacune des quatre routes. `fs.createReadStream` est volontairement conservé : c'est déjà de
    l'E/S asynchrone.
  - **Mesuré, pas supposé** (A/B en modélisant la latence d'un NAS, le disque local de cet
    environnement étant ~1000× plus rapide que du SMB) : **AVANT, 3,6 s sans aucune réponse HTTP
    pendant le tour ; APRÈS, 1 ms.** La première mesure, faite sans modéliser la latence, ne
    montrait aucune différence — elle a été signalée comme non concluante plutôt que présentée
    comme un gain. **Piège de la sonde elle-même, rencontré au passage** : une sonde de latence de
    boucle d'événements (`setInterval` qui mesure sa propre dérive) doit laisser la boucle tourner
    une fois (`await new Promise(r => setImmediate(r))`) AVANT le `clearInterval`, sans quoi le
    rappel en retard n'est jamais exécuté et la sonde lit 0.
  - **Ne parvient à l'étude que par un nouveau `.exe`** : c'est du code serveur.

- **Bug corrigé : la carte « Appel de fonds » disparaissait de la fiche, avec sa date.** Signalé par
  l'étude (« parfois l'espace appel de fonds ne s'affiche pas alors que la date du rendez-vous est
  indiquée et remplie »). La condition d'affichage était `dossierEntierementComplet(d)` seul, alors
  que `echeancesPlanning` annonce l'appel de fonds dès qu'un rendez-vous est fixé
  (`iso: d.appelFonds || d.rendezVousSignature`, voir son historique) : **le planning réclamait un
  appel de fonds que la fiche ne donnait aucun moyen de saisir.** La condition devient
  `d.appelFonds || d.rendezVousSignature || dossierEntierementComplet(d)`.
  - **Second défaut, plus grave, trouvé en corrigeant le premier et que l'étude n'avait pas vu** :
    une date d'appel de fonds DÉJÀ SAISIE disparaissait, elle aussi, dès que le dossier cessait
    d'être complet — ce qui arrive tout seul, une pièce repassant à `manquante` quand son fichier
    disparaît du NAS (voir « Désynchronisation d'une pièce… » plus haut). La date restait dans le
    dossier, invisible ET non modifiable. Une donnée saisie par l'étude ne doit jamais dépendre
    d'un état dérivé d'un scan pour rester affichée : c'est la première des trois conditions.
  - Trois tests ajoutés dans `tests/echeances-appel-fonds.test.js` qui vérifient la carte
    RÉELLEMENT RENDUE (et non la seule fonction) : rendez-vous fixé sur un dossier incomplet, date
    déjà saisie sur un dossier incomplet, et rien qui ne la justifie. Un test existant encodait
    l'ancienne règle et a été mis à jour plutôt que contourné. Suite racine 583 → 586.

- **Outil 2, terrain à bâtir : le permis de construire de l'acquéreur, et la purge de ses deux
  délais.** Demandé par l'étude, avec la consigne explicite d'**apprendre les délais sur internet**
  plutôt que de les écrire de mémoire — consigne suivie, et c'est elle qui a fait apparaître un
  changement de loi récent qu'un délai appris par cœur aurait manqué.
  - **Deux délais, deux points de départ DIFFÉRENTS — c'est tout le sujet, et l'erreur qu'on ferait
    en les confondant** : le **retrait administratif** court **3 mois depuis la date de l'arrêté**
    (art. L.424-5 c. urb. : au-delà, la mairie ne peut plus retirer un permis illégal) ; le
    **recours des tiers** court **2 mois depuis le PREMIER JOUR d'un affichage continu de deux mois
    sur le terrain** (art. R.600-2), **jamais depuis l'arrêté**. Compter le recours depuis l'arrêté
    — le raccourci naturel — donnerait un permis « purgé » deux mois trop tôt, sur un terrain que
    l'étude s'apprête à faire vendre.
  - **Sans constat d'affichage, le délai de recours NE COURT PAS.** Ce n'est pas un délai en cours
    dont on ignorerait la fin : c'est un compteur qui n'a jamais démarré, et il peut donc encore
    courir des années plus tard. D'où un statut à part (`'non-demarre'`, distinct de `'inconnu'`)
    et une formulation de constat qui le dit en toutes lettres — un « délai en cours » laisserait
    croire qu'il suffit d'attendre. Un test vérifie qu'un affichage manquant ne devient jamais
    « purgé », même dix ans après l'arrêté.
  - **Loi n° 2025-1129 du 26 novembre 2025 (« loi Huwart »), trouvée en cherchant**, applicable aux
    décisions d'urbanisme prises **à partir du 28 novembre 2025** : le recours gracieux est ramené
    à un mois et ne prolonge plus le délai contentieux. Pour un permis antérieur, l'ancien régime
    s'applique — un recours gracieux déposé dans les deux mois rouvrait un nouveau délai de deux
    mois, qu'un simple calendrier ne peut pas connaître. `ancienRegimeRecoursGracieux` (dérivé de
    la seule comparaison de la date d'arrêté à `DATE_LOI_SIMPLIFICATION_URBANISME`) fait basculer
    le texte du constat entre les deux régimes, plutôt que d'affirmer une purge que le droit
    applicable ne garantit pas.
  - **Un calcul de dates ne prouve rien, et l'outil le dit** : quand les deux délais sont écoulés
    d'après les dates relevées, il ne conclut pas « permis purgé » mais produit un A_VERIFIER — un
    calcul ne sait pas qu'un tiers a déposé un recours le dernier jour. Seuls le **certificat de
    non-recours** du greffe du tribunal administratif (art. R.600-7) et l'**attestation de
    non-retrait** de la mairie le prouvent ; le constat les nomme et la question part dans le bloc
    « À demander ». Même principe que la réserve déjà posée sur l'état daté et le certificat
    d'urbanisme.
  - **Piège de typage des documents, évité par l'ORDRE des tests** (`typeDocumentPermis`) : un
    constat d'affichage et un certificat de non-recours CITENT tous les deux le permis, avec son
    numéro. Les tester après le permis ferait prendre la date du constat pour celle de l'arrêté —
    trois mois de retrait comptés depuis le mauvais jour. Constat et certificat sont donc reconnus
    EN PREMIER, et le code le dit en commentaire pour qu'on ne « range » pas ces tests un jour.
  - **Le plus ancien constat d'affichage est retenu**, pas le plus récent : le délai court depuis
    le premier jour. L'usage étant de faire dresser trois constats (début, milieu, fin de la
    période de deux mois), un seul constat déposé produit un rappel distinct — la continuité de
    l'affichage pendant deux mois n'est alors pas démontrée.
  - **Uniquement en mode « projet de vente », jamais sur un compromis** : au moment de signer
    l'avant-contrat, le permis n'est en général pas encore demandé — un constat « permis non
    fourni » sur CHAQUE compromis de terrain serait exactement le bruit que l'étude a demandé
    d'éviter en réduisant le périmètre d'Outil 2. Commenté comme un choix, pas comme un oubli.
  - **Terrain à bâtir reconnu d'abord par le dossier lié** (`d.typeVente === 'terrain'`), le texte
    ne servant que de repli — même précédence que `estCopropriete`. Hors terrain à bâtir, aucun
    constat de cette famille n'est produit.
  - La gravité du permis manquant suit l'acte : **IMPORTANT** quand la vente est conditionnée à
    son obtention (`RE_CONDITION_PERMIS` sur l'avant-contrat ou le projet), **A_VERIFIER** sinon —
    un terrain vendu sans condition suspensive de permis n'a pas à être bloqué par son absence.
  - Deux destinataires ajoutés au bloc « À demander » : **l'acquéreur** (le permis et les constats
    sont dans ses mains, pas dans celles du vendeur) et le **greffe du tribunal administratif**
    (le certificat de non-recours). Nouvelle catégorie de rapport `PERMIS`.
  - Tests : `tests/outil2-permis.test.js` (17 — les deux points de départ, le compteur non démarré,
    l'arrêté illisible qui ne produit aucune date inventée, les deux régimes de part et d'autre du
    28/11/2025, l'ordre de typage des documents, l'avant-contrat écarté, le plus ancien constat
    retenu, la réserve du certificat avec sa mention de R.600-7, le constat unique, la précédence
    du dossier lié, le silence hors terrain à bâtir, et le rapport de bout en bout). Suite racine
    586 → 603, serveur inchangée (203 — chantier entièrement côté client). La note « Ce que cette
    relecture contrôle » de l'écran est complétée : sans ça, elle annonçait un périmètre devenu
    faux. **Vérifié dans un vrai Chromium** (serveur réel, clair et sombre, 1500px et 400px) sur un
    projet de vente de terrain : section « Permis de construire (terrain à bâtir) » comptée à 3,
    bloc de questions avec son bouton de copie, aucune erreur JS, aucun débordement horizontal.

- **Appel de fonds : la date ET l'heure du rendez-vous lues dans la convocation du confrère.**
  Demandé par l'étude. Le champ « Heure » existait depuis le portage de l'outil mais n'était
  jamais prérempli, et pour cause : la fiche du dossier ne porte qu'une DATE
  (`d.rendezVousSignature` est un `<input type="date">`). La convocation du confrère, elle, écrit
  le jour et l'heure en toutes lettres — c'est la seule source de l'horaire dans cet écran, et
  c'est donc là que la détection se branche, sur le même chemin que le décompte (PDF déposé ou
  texte collé passent tous deux par `appliquerDecompteAppelFonds`, un seul point à couvrir).
  - **Ancrage obligatoire sur le vocabulaire du rendez-vous** (`AF_ANCRE_RDV_RE` : rendez-vous,
    convocation, signature, réitération, « vous recevoir »…), jamais « la première date du
    document ». Une convocation est pleine de dates qui n'en sont pas — la date du courrier en
    tête, les bornes d'un prorata de taxe foncière, la date du compromis : prendre la première
    donnerait le mauvais jour bien plus souvent que le bon. Même prudence que la fenêtre de
    `SEQUESTRE_RE` autour de la clause de dépôt. Un décompte sans aucun vocabulaire de rendez-vous
    ne rend donc rien du tout (testé).
  - **La date est cherchée APRÈS l'ancre en priorité**, et seulement à défaut dans les 60
    caractères qui la précèdent (« le 14 octobre 2026 à 9 h 15 se tiendra le rendez-vous »). Les
    chercher d'un bloc ferait remonter la date du courrier, qui précède presque toujours l'objet.
  - **L'heure se lit AUTOUR de la date retenue, pas dans toute la fenêtre**
    (`afZoneHeureAutourDate`) — le défaut le plus grave trouvé en écrivant les tests, et qui ne se
    voyait pas à la relecture : sur « Convocation du 12 octobre 2026. Le rendez-vous est fixé au
    14 octobre 2026 à 11 heures », la première ancre retenait le 12 octobre et lui collait
    l'heure de la phrase suivante — une date et une heure qui ne vont pas ensemble, le pire
    résultat possible ici. L'année termine la date dans les deux écritures (14/10/2026 comme
    14 octobre 2026), elle suffit donc à la situer dans la fenêtre et à borner la zone d'heure.
  - **`extraireDateDeFragment` est réutilisée telle quelle** (elle lit déjà les deux écritures) :
    aucun motif de date n'est dupliqué. Conséquence assumée, la même que pour « fin septembre » du
    côté du compromis : **l'année doit figurer dans le texte**. « Rendez-vous le mardi 14 octobre
    à 10 heures » ne rend rien plutôt qu'une année devinée.
  - Quatre écritures de l'heure acceptées (`14h30`, `14 h 30`, `14:30`, `14 heures 30`, et
    `14 heures` seul → 14:00). **Le lookahead ne porte que sur un chiffre** : y avoir mis le point
    rejetait « à 10 h. », c'est-à-dire une heure en fin de phrase, l'écriture la plus courante —
    défaut attrapé par un test, pas par la relecture. Le motif exigeant `h`/`heures`/`:`, aucun
    montant ne peut être pris pour une heure (vérifié sur « 1 430,00 € » et « 18 200,00 € »).
  - **Rien n'est jamais écrasé**, comme partout ailleurs dans cet outil : un champ déjà rempli (par
    le dossier lié ou à la main) est conservé. Une date qui diverge de celle du document est
    **signalée** dans le rapport d'import, comme le solde déclaré par le confrère — et dans ce cas
    **l'heure n'est pas reprise non plus** : elle se rapporte au jour du document, la coller sur
    un autre jour marierait une heure à une date qui n'est pas la sienne. C'est exactement le
    défaut qu'`afZoneHeureAutourDate` écarte à la lecture, et je l'avais réintroduit au niveau du
    formulaire — vu en vérification dans le navigateur, pas dans les tests.
  - **La détection tourne AVANT le retour sur décompte vide** : une convocation dont le tableau
    n'a pas été reconnu porte quand même le jour et l'heure, et c'est déjà ça de pris.
  - Tests : 10 nouveaux dans `tests/appel-de-fonds.test.js` (les deux écritures de date, les
    quatre de l'heure, la date du courrier écartée, le découpage en lignes d'un PDF, la préférence
    pour la mention qui porte l'heure, la date avant l'ancre, l'année absente, le décompte sans
    vocabulaire de rendez-vous, les montants qui ne sont pas des heures, la date seule). Suite
    racine 603 → 613, serveur inchangée (203 — chantier entièrement côté client). **Vérifié dans
    un vrai Chromium** (serveur réel) sur une convocation réaliste : les deux champs vides se
    remplissent au 14 octobre 2026 à 14:30, la phrase du courrier suit, et une date préalablement
    saisie au 20 octobre est conservée avec l'écart signalé et l'heure laissée vide. Aucune erreur
    JS, aucun débordement horizontal.
  - **Piège de convention de test rencontré** : `tests/appel-de-fonds.test.js` prend son `app` une
    seule fois en tête de fichier ; écrire `const { app } = chargerApplication()` dans un test y
    rend `app` indéfini et fait passer un code correct pour cassé. Reprendre la convention du
    fichier avant d'y ajouter des cas.
- **Tableau de bord : bloc « Pièces reçues, pas encore consultées ».** Demandé par l'étude après
  avoir constaté que cette fonction n'existait pas. Les notifications de pièces trouvées sur le
  NAS (`d.piecesNotifications`, voir son historique) avaient trois surfaces, aucune sur le Tableau
  de bord, et **aucune ne NOMMAIT ce qui venait d'arriver** : le compteur de la sidebar et le tag
  « N nouvelles pièces » de la ligne du Suivi disent seulement qu'il y a du nouveau, et le tag
  « Nouveau » posé sur la pièce elle-même n'est visible qu'une fois la fiche ouverte — donc trop
  tard pour savoir s'il valait la peine de l'ouvrir. `renderPiecesRecuesDashboard(dossiersActifs)`
  liste une ligne par dossier concerné : le nombre, le nom du dossier, et les LIBELLÉS des pièces
  (`libelleNotificationPiece`, déjà écrite pour la fiche et l'email au responsable — un seul
  endroit qui sait nommer une notification, y compris le pseudo-clé de l'offre de prêt).
  - **Aucun second mécanisme de notification** : le bloc lit exactement l'état que lisent déjà les
    trois autres surfaces. Rien n'a été ajouté au modèle du dossier, à `verifierDossierLocal()`,
    ni à la route serveur.
  - **L'effacement reste le geste déjà en place, et l'étude a explicitement demandé de le garder** :
    la fermeture du tiroir, pour CE dossier uniquement (`fermerDossierDrawer`, inchangée).
    Consulter un dossier ne fait donc jamais disparaître les nouveautés des autres — vérifié dans
    le navigateur, pas déduit : après fermeture du premier dossier, le second garde sa ligne et le
    compteur de la sidebar passe de 4 à 1.
  - **Placé entre les tuiles KPI et « Actions urgentes »**, en pleine largeur. C'est le seul bloc
    du tableau de bord dont le contenu **disparaît une fois lu**, donc le seul qu'on puisse manquer
    en ne regardant pas au bon moment ; et la liste des pièces d'un dossier est trop longue pour la
    colonne étroite d'« Actions urgentes ». Pleine largeur ne le rend pas envahissant : il n'existe
    pas le reste du temps.
  - **C'est la SECTION ENTIÈRE qui se masque quand il n'y a rien** (`#dash-nouveautes`), comme la
    colonne des échéances à 7 jours — pas d'étiquette orpheline, et le tableau de bord retrouve
    alors exactement sa mise en page habituelle. Un bloc permanent affichant « rien de nouveau »
    occuperait toute l'année la place d'un signal qui ne dure que quelques heures.
  - **Tri par nombre de pièces décroissant** : sur un portefeuille où plusieurs parcours viennent
    de tourner, c'est le dossier qui a le plus reçu qu'on veut ouvrir en premier.
  - Chaque ligne passe par `ouvrirDossierDepuisDashboard()` — le même chemin qu'« Actions
    urgentes » et que la recherche du Tableau de bord, jamais une seconde implémentation. Les
    lignes réutilisent `.action-urgente-ligne` et `.dash-liste` est ajoutée à la règle
    d'`.actions-urgentes` plutôt que recopiée : deux listes de dossiers cliquables sur le même
    écran doivent se lire comme un seul objet, pas comme deux composants aux réglages légèrement
    différents. `.dash-nouveautes` est ajoutée au filtre d'impression, comme les autres blocs du
    tableau de bord.
  - Pas de test unitaire : `renderPiecesRecuesDashboard` dépend du DOM et de `dossiers` (un `let`
    de premier niveau invisible depuis le contexte `vm` des tests — même limite déjà documentée
    pour `totalNotificationsPieces`/`majBadgeNotificationsSidebar`). **Vérifié dans un vrai
    Chromium** (serveur réel, trois dossiers synthétiques dont un sans nouveauté, clair et sombre,
    1500px et 400px) : deux lignes affichées avec les bons libellés (« Certificat d'urbanisme ·
    Avis de taxe foncière · Offre de prêt »), le dossier sans nouveauté absent, l'ordre DOM
    confirmé (kpis → nouveautés → grille), clic ouvrant le bon dossier dans le tiroir avec ses
    3 tags « Nouveau », effacement du seul dossier consulté, section masquée une fois tout vu,
    aucun débordement horizontal, aucune erreur JS hors les échecs de CDN déjà connus de cet
    environnement. `npm test` reste vert (613 tests racine, 203 côté serveur — chantier
    entièrement côté client).

- **Rappels par email : la chaîne fonctionne enfin, et un encart dit désormais quand elle casse.**
  Deux semaines de blocages successifs sur l'envoi, puis un défaut de conception trouvé APRÈS que
  l'étude a confirmé « ça a fonctionné ».
  - **Le diagnostic, dans l'ordre où les contraintes sont tombées.** L'étude a signalé
    `Invalid login: 535-5.7.8 … gsmtp` — un refus d'authentification Gmail, pas un problème de
    CLAIRE. Chaque piste s'est fermée l'une après l'autre : pas de droits d'administrateur
    Microsoft 365, donc impossible d'autoriser l'authentification SMTP sur une boîte du locataire ;
    l'envoi sans compte déjà écarté par le SPF `-all` du domaine (voir son entrée plus haut) ; et
    le déclencheur HTTP de Power Automate, que la route sans identifiants supposait, est une
    fonctionnalité **premium** dont l'étude ne dispose pas — **j'avais supposé l'inverse** parce
    que le flux existait déjà, l'étude m'a corrigé. Reste donc Gmail + un mot de passe
    d'application, créable une fois la validation en deux étapes activée : c'est ce que l'étude a
    fait, et **aucune ligne de code n'a été nécessaire** — le chemin SMTP écrit la veille était
    déjà bon.
  - **Deux réserves posées à l'étude avant qu'elle ne s'engage dans cette voie**, toutes deux
    levées en pratique mais pas par construction : chaque rappel porte un nom de dossier et une
    échéance, qui transitent donc par un compte Google ; et la boîte-passerelle doit accepter un
    message venant de l'extérieur du domaine — si Retarus/EOP l'écarte, le flux ne se déclenche
    jamais alors que l'envoi, lui, a réussi.
  - **Le vrai défaut, trouvé en relisant plutôt qu'en supposant : `resultat.erreurs` n'avait aucun
    consommateur.** `executerTacheRappels()` construisait soigneusement cette liste depuis sa
    création ; `demarrerTacheRappels()` jette le résultat, et seul un plantage de la tâche
    produisait un `console.warn` — invisible, le serveur tournant sans fenêtre
    (`Lancer-CLAIRE-en-arriere-plan.vbs`). Un mot de passe d'application révoqué, et les rappels
    s'arrêtaient **en silence** : c'est précisément l'ABSENCE de message qui aurait dû alerter.
    Rien ne pouvait le signaler.
  - **Compte rendu du dernier tour** (`dernier-tour-rappels`, `parametresRepo.lireDernierTour()`/
    `ecrireDernierTour()`) : quand, déclenché à la main ou par le minuteur, combien de rappels
    envoyés sur combien dus, et la liste des erreurs (plafonnée à 20 — un tour qui échoue sur
    soixante dossiers n'a pas à faire grossir une ligne que personne ne lira au-delà des
    premières). **Stocké sous sa PROPRE clé, jamais dans le blob `reglages`** : ce n'est pas un
    réglage saisi par l'étude mais un état produit par le serveur, et la liste blanche stricte
    d'`assainirReglages()` le jetterait à chaque enregistrement du formulaire. Un tour qui sort
    avant d'avoir rien tenté (envoi non configuré) n'écrit rien du tout, pour ne pas effacer le
    dernier compte rendu utile.
  - **Un compteur à zéro n'est JAMAIS une alerte** (`renderDernierTourRappels`) : la plupart des
    tours n'ont simplement aucun rappel dû ce jour-là. C'est la présence d'une erreur, et elle
    seule, qui fait basculer l'encart en rouge.
  - **Bouton « Lancer un tour maintenant »** (`POST /api/reglages/lancer-rappels`) : le vrai
    chemin de production (`calculerRappelsDus` → `texteRappel` → envoi → `reminder_log`), pas le
    message de test. Sans lui, vérifier la chaîne complète jusqu'à Teams supposerait d'attendre la
    prochaine demi-heure, ou de fabriquer un dossier dont une échéance tombe pile à J-15 ou J-7.
    **Conséquence assumée** : un rappel parti ainsi est marqué dans `reminder_log` et ne repartira
    pas au tour automatique suivant — ce n'est pas une simulation, c'est le tour lui-même, avancé.
    La route répond 503 plutôt que de planter quand le routeur est monté sans `{depot, db}` (les
    tests qui n'exercent que la lecture/écriture des réglages n'ont pas à fabriquer un dépôt).
  - **Message du bouton « Tester » corrigé** : il affichait un succès qui laissait croire que le
    message était arrivé. Une réponse 200 dit SEULEMENT que le serveur d'envoi a accepté le
    message — ni son arrivée dans la boîte-passerelle, ni le déclenchement du flux, ni le message
    Teams, trois étapes hors de portée de CLAIRE. D'où « ✓ Remis au serveur d'envoi — vérifiez
    maintenant dans Teams », et la même précision ajoutée dans la procédure affichée à l'écran.
    Le panneau ci-dessus couvre le maillon de l'envoi, jamais celui-là.
  - **Procédure de l'écran Réglages réécrite** en deux options (A : boîte Microsoft 365, demande
    un administrateur ; B : Gmail + mot de passe d'application, sans administrateur — le montage
    réellement en service), avec l'avertissement de confidentialité/filtrage. `server/README.md`
    suit, et ne recommande plus l'envoi direct Microsoft 365, devenu impraticable ici.
  - **Corrigé au passage** : « 2 dûs » — le circonflexe de « dû » ne sert qu'à le distinguer de
    l'article « du » au masculin singulier, il disparaît au pluriel. Sorti en fonction pure
    (`libelleRappelsTour`) parce que la phrase est écrite à deux endroits (l'encart et le bandeau
    de confirmation) : deux copies finiraient par diverger, et c'est un texte que l'étude lit.
  - Tests : +3 dans `server/test/rappels.test.js` (compte rendu écrit avec son origine automatique
    puis manuelle, un envoi en échec qui remonte avec `rappelsEnvoyes: 0`, un tour non configuré
    qui n'écrit rien et préserve le compte rendu précédent), +3 dans
    `server/test/reglages.test.js` (compte rendu `null` au départ, 400 quand l'envoi n'est pas
    activé, un vrai tour persisté avec `declenche: 'manuel'`), +2 dans
    `server/test/parametresRepo.test.js` (assainissement de valeurs exotiques, plafond des
    erreurs), +2 dans `tests/rappels-libelle.test.js`. Suite racine 613 → 615, serveur 203 → 211.
  - **Vérifié dans un vrai Chromium** (serveur réel, transport d'envoi injecté dont le second
    appel échoue, deux dossiers synthétiques, clair et sombre, 1500px et 400px) : encart vide au
    départ avec son texte propre, état rouge après un tour listant le dossier, l'échéance et
    l'erreur `535-5.7.8` exacte, « 1 rappel envoyé sur 2 dus », état vert quand tout passe,
    accords au singulier comme au pluriel, compte rendu conservé après rechargement de la page,
    `reminder_log` qui empêche bien un second envoi au tour suivant, aucun débordement horizontal,
    aucune erreur JS.
  - **Reste à confirmer par l'étude, et par elle seule** : qu'un message de test ou un tour lancé
    à la main arrive effectivement dans Teams. C'est le seul maillon que rien, côté CLAIRE, ne
    peut observer.

- **Nouvel outil « Arbitrage forfait mobilier » (succession)**, demandé par l'étude : « implémente
  l'artéfact de simulation d'intérêt d'inventaire de succession à ajouter dans Outils de la
  sidebar. Reprend UI/UX de CLAIRE, pas de slop IA. » Port d'un artefact existant
  (« Arbitrage du forfait mobilier »), pas une construction de zéro — d'où la discipline déjà
  appliquée aux maquettes précédentes (frais d'acte, fiche « Nocturne », appel de fonds) :
  **on reprend la STRUCTURE, on jette la palette.** L'artefact pose un bordeaux `#7c2e2e`, Fraunces
  / Source Sans 3 / IBM Plex Mono et un rayon de 3px ; rien de tout ça n'entre ici. L'écran est
  bâti sur `.dash-header`/`.dash-grid`/`.calc-card`/`.calc-champ`/`.calc-resultat`/`.calc-table`,
  c'est-à-dire exactement le gabarit du simulateur de provision et du prorata, et sur les jetons
  déjà validés.
  - **Ce que l'outil répond** : à défaut d'inventaire ou de prisée, les meubles meublants sont
    évalués au **forfait de 5 % de l'actif** (art. 764 du CGI). Un inventaire notarié avec prisée
    par un commissaire de justice écarte ce forfait, mais il a un coût. La question est donc
    arithmétique : l'économie de droits couvre-t-elle la dépense ? `calculerArbitrageInventaire()`
    (pure, testable) fait `économies brutes = droits sans prisée − droits avec prisée`, puis
    `net = brutes − (acte d'inventaire + prisée + acte de clôture + serments + trajets)`.
  - **Décision structurante reprise de l'artefact, à ne PAS défaire : l'outil ne calcule JAMAIS les
    droits de succession.** Le notaire saisit les deux montants qu'il a déjà simulés de son côté.
    Bâtir ici un moteur de droits (abattements, tranches, degré de parenté, assurance-vie…)
    reviendrait à présenter comme fiable un barème que personne n'a audité — exactement la réserve
    déjà posée sur le simulateur de provision, et le genre de chiffre qui engage l'étude dès qu'il
    est annoncé à un client.
  - **Trois états de verdict, pas deux.** L'artefact n'en avait que deux (favorable / défavorable),
    ce qui affichait « Non recommandé » sur un formulaire encore vierge — une réponse tranchée à
    une question que personne n'a posée. `verdictArbitrageInventaire()` rend `indetermine` tant que
    les deux simulations de droits ne sont pas saisies, et les champs partent tous **vides**, comme
    sur les deux autres simulateurs (« une valeur pré-remplie se prend pour un résultat ») : les
    valeurs d'exemple de l'artefact ne sont donc pas reprises, et « Réinitialiser » remet à vide,
    pas à l'exemple. Les trois verdicts prennent `dl-neutre`/`dl-urgent`/`dl-success`, aucune
    couleur inventée pour cet écran.
  - **Volontairement PAS de quatrième état « marginal »** (une économie nette de quelques dizaines
    d'euros, techniquement positive mais qui ne vaut pas la démarche) : le seuil à partir duquel
    l'inventaire cesse d'être intéressant est un jugement que l'étude n'a pas donné, l'inventer
    serait poser une règle métier de ma propre initiative. L'artefact avait d'ailleurs un état
    `warn` dans son CSS que sa propre logique ne posait jamais.
  - **Pas de PDF, l'impression suffit.** L'artefact embarquait jsPDF et une police Carlito en
    base64 (280 Ko de fichier pour ça), avec un repli sur `window.print()` de toute façon. CLAIRE
    a déjà son mécanisme — un bloc masqué à l'écran plus un `@media print` — et jsPDF viendrait
    d'un CDN. `construireNoteInventaire()` tient `#inv-print` à jour à chaque saisie (et non au
    clic) pour qu'un Ctrl+P direct sorte la même feuille que le bouton ; `definirOnglet()` pose
    `body.onglet-inventaire-actif`, comme pour l'appel de fonds.
  - **Deux défauts vus au rendu, pas à la relecture, et corrigés** : la dernière ligne de coût du
    décompte se retrouvait grossie et décalée au hasard de ce qui est chiffré — `.calc-table`
    met en valeur sa dernière ligne, mais `:last-child` est relatif au `<tbody>`, et ce décompte en
    a trois (celui des postes de coût est reconstruit à chaque saisie) ; et les postes non chiffrés
    s'affichaient en « − 0 € », ce qui contredisait la note de l'écran (« les postes laissés vides
    ne sont pas comptés ») — aucun poste n'apparaît plus tant qu'il n'est pas chiffré.
  - Nouvelle icône `scale` (balance à deux plateaux) dans `ICONES`, même grille 16×16 et même trait
    1.4 que le reste du jeu. Un seul ajout CSS de fond (`.calc-coche`, `.inv-*`) : presque tout est
    hérité.
  - Tests : `tests/inventaire-succession.test.js` (10 — le calcul de référence, les deux champs de
    droits qui bloquent le verdict sans le rendre, les postes vides qui valent zéro sans bloquer,
    les trajets conditionnés à la case, le décompte limité aux postes chiffrés, un coût négatif
    ramené à zéro, une économie brute négative quand le mobilier vaut plus que le forfait, la
    bascule du verdict à zéro exactement, les trois jetons de couleur, la virgule décimale). Suite
    racine 615 → 625, serveur inchangée (211 — chantier entièrement côté client, aucun fichier
    statique nouveau à déclarer). **Vérifié dans un vrai Chromium** (serveur réel, clair et sombre,
    1500px et 400px) : lien dans la bonne section de la barre de gauche, écran vide au départ avec
    « À compléter », les deux verdicts et leurs couleurs, décompte complet au centime attendu,
    trajets qui entrent et sortent du coût, « Réinitialiser » qui remet à vide, note imprimable qui
    remplace les cartes de saisie, aucun débordement horizontal, aucune erreur JS.

- **« La page se bloque puis il indique ne plus avoir accès au serveur » — la cause était côté
  CLIENT, pas côté serveur.** Signalé une deuxième fois par l'étude (« j'ai encore eu une
  coupure »), après le correctif serveur du matin (`c7078b0`, relecture du NAS asynchrone) qui
  visait le même symptôme. Ce correctif-là était juste, mais il ne traitait qu'une moitié du
  problème : le navigateur a sa propre relecture périodique, et c'est elle qui coûtait le plus
  cher. Vérifié plutôt que supposé — aucun appel `*Sync` bloquant ne subsiste dans un chemin de
  requête du serveur, et les builds `.exe` sont bien produits automatiquement (le premier
  postérieur à `c7078b0` est la release « build 93 »).
  - **Le mécanisme, mesuré en A/B dans un vrai navigateur** (serveur réel + un dossier NAS de
    41 PDF, pdf.js simulé faute de CDN ici) : `revérifierDossiersLiesAuDemarrage()` parcourt tous
    les dossiers non complets, et pour chacun `verifierDossierLocal()` **télécharge et analyse
    CHAQUE PDF du dossier NAS tant que l'offre de prêt n'a pas été trouvée**. Or un dossier
    incomplet est précisément celui où elle n'est pas là : tous les fichiers y passaient donc, à
    chaque tour. **Avant : 41 ouvertures par tour, à chaque tour, indéfiniment. Après : 25, puis
    16, puis 0.**
  - Multiplié par une soixantaine de dossiers actifs toutes les 5 minutes, ça sature à la fois le
    fil d'exécution de la page (pdf.js, mémoire) et les 6 connexions que le navigateur autorise
    par origine — le sondage de synchronisation (7 s) ne passe plus, `sondagePeriodique()` échoue,
    `majStatutServeur(false)` affiche « Hors ligne ». Le serveur, lui, répond parfaitement : c'est
    exactement ce que décrivait l'étude.
  - **Quatre correctifs, tous sur les tours AUTOMATIQUES uniquement** :
    1. **Garde d'exclusion mutuelle** (`tourVerificationEnCours`) — le minuteur tire toutes les
       5 minutes sans se demander si le tour précédent est fini ; un tour plus long que ça (NAS
       lent, gros portefeuille) en faisait démarrer un second par-dessus, puis un troisième, chacun
       rouvrant les mêmes fichiers. C'est le **pendant exact du drapeau `enCours` posé côté serveur
       dans `nasWatch.js`** par le correctif du matin : le même bug, de l'autre côté du fil.
    2. **Budget d'ouvertures par tour** (`MAX_PDF_OUVERTS_TOUR_AUTO`, 25, partagé par tout le
       tour) : un tour reste borné quoi qu'il arrive, et ce qui n'a pas été examiné l'est au tour
       suivant — progressif, jamais répété.
    3. **Mémoire des PDF déjà écartés** (`pdfEcartesPourOffre`, par dossier, en mémoire pour la
       session) : un PDF qui n'est pas l'offre de prêt ne le devient pas cinq minutes plus tard.
       Les rejets déterministes seuls sont mémorisés (trop peu de pages, titre non reconnu, écarté
       par le modèle local) — **jamais un échec de lecture**, dont la cause peut être passagère
       (NAS momentanément injoignable) et qui écarterait alors un fichier pour toute la session.
    4. **Les dossiers archivés sont sautés** : ils n'attendent plus aucune pièce, les relire
       indéfiniment était du gaspillage pur. Le tour rend aussi la main au navigateur entre deux
       dossiers (`rendreLaMain()`, pendant du `respirer()` serveur).
  - **Garde-fou indispensable qui va avec le budget** (`parcoursEcourte`) : un tour interrompu
    faute de budget n'a pas « cherché l'offre sans la trouver », il ne l'a pas cherchée jusqu'au
    bout. `d.offrePretStatut` n'est donc PAS basculé sur `manquante` dans ce cas, et
    `relancerSiOffreManquante()` n'est pas déclenchée — sans quoi le correctif aurait créé un faux
    « offre introuvable » et un brouillon de relance au client à chaque tour partiel. Vérifié dans
    le navigateur : après un tour écourté le statut reste `inconnu`, il ne passe à `manquante`
    qu'une fois tous les candidats réellement examinés.
  - **Le polling démarre AVANT la relecture, qui n'est plus attendue** : `demarrerApplication()`
    faisait `await revérifierDossiersLiesAuDemarrage()` **puis** `demarrerPolling()` — tant que le
    parcours complet du portefeuille n'était pas terminé (plusieurs minutes sur un vrai NAS),
    aucune synchronisation n'avait encore commencé. C'est une tâche de fond, pas une étape de
    démarrage.
  - **`reverifierTousLesDossiers()` (bouton « Revérifier tous les dossiers ») appelle
    `verifierDossierLocal(id, false)`** — volontairement, pour n'afficher qu'un bilan final plutôt
    qu'un toast par dossier. Ce `false` le faisait donc tomber sous le budget et la mémoire : il
    lève maintenant les deux explicitement (mémoire vidée, budget `Infinity`, remis à 0 en
    `finally`). **À ne pas perdre de vue si ce drapeau change un jour de sens** : c'est le seul
    endroit où « pas un clic utilisateur » est faux au sens du geste, vrai au sens de l'affichage.
  - **Ne parvient à l'étude que par un nouveau `.exe`** : ce sont des fichiers clients, mais en
    mode serveur ils sont servis par l'exécutable (assets embarqués du blob SEA) — un
    retéléchargement de `script.js` ne suffit pas, contrairement à la version 100 % locale.
  - `npm test` reste vert (625 tests racine, 211 serveur) : ce chantier ne touche aucune fonction
    pure (`verifierDossierLocal`/`revérifierDossiersLiesAuDemarrage` dépendent de `dossiers`, un
    `let` de premier niveau invisible depuis le contexte `vm` des tests — limite déjà documentée),
    d'où la vérification en A/B dans un vrai navigateur plutôt qu'un test unitaire.

- **Une pièce peut être marquée reçue À LA MAIN, et le contrôle automatique n'y revient plus.**
  Demandé par l'étude à partir d'un cas concret : *« si un document est validé à la main mais pas
  présent dans le dossier local — exemple SAFER, car présent dans notre logiciel métier Authentic de
  Fichorga — ne pas repasser dessus lors du contrôle et ne pas le repasser en non reçu »*. Le besoin
  est structurel, pas propre à la SAFER : une partie des pièces d'un dossier ne transite jamais par
  le NAS. Depuis le correctif de désynchronisation (voir « Désynchronisation d'une pièce… » plus
  haut), `verifierDossierLocal()` **reteste TOUTE la checklist** et remet à `'manquante'` une pièce
  reçue qu'il ne retrouve pas — comportement voulu pour un fichier supprimé du NAS, mais qui effaçait
  à chaque tour une confirmation faite à la main pour un document qui n'y a jamais été.
  - **`d.piecesValideesManuellement`** (tableau de clés) plutôt qu'une quatrième valeur de statut.
    C'est la décision structurante : `d.pieces[cle]` reste `'recue'`, donc les cinq endroits qui
    testent `=== 'recue'` — le compteur de la fiche, `statutDossier()`, `dossierEntierementComplet()`,
    `calculerStatsPortefeuille()` et, côté serveur, `piecesRecuesEtManquantes()`
    (`server/src/piecesChecklist.js`, qui alimente les rappels par email) — continuent de compter la
    pièce sans une ligne de changement. Un statut `'recue_main'` aurait obligé à retoucher les cinq,
    et le premier oublié aurait fait disparaître la pièce d'un compteur ou d'un rappel.
  - `verifierDossierLocal()` **exclut ces clés de `aChercher`** (rien n'est cherché sur le NAS pour
    elles) et les réaffirme `'recue'` en tête de la boucle de comptage, **avant** la branche de
    désynchronisation — l'ordre EST la garantie demandée : une pièce validée à la main ne peut
    atteindre le code qui la repasserait en manquante.
  - **Deux interactions non évidentes, couvertes** : `lierDossierLocal()` remet toute `d.pieces` à
    `'manquante'` à chaque (re)liaison — les clés validées à la main y sont réaffirmées `'recue'`,
    sans quoi changer de dossier NAS effacerait ces confirmations ; et `normaliserDossierImporte()`
    **conserve** le tableau (filtré sur les chaînes), contrairement à `pieces`/`offrePretStatut`/
    `fichiersTrouves`/`nasInventaire` qui repartent de zéro : ceux-là dérivent d'un scan du NAS de CE
    serveur, une validation manuelle dit qu'un document est détenu ailleurs, ce qui reste vrai sur
    n'importe quelle installation.
  - **Deux boutons sur la même position**, à droite de la pièce : une coche verte (`icone('check')`,
    `.piece-valider`) tant qu'elle n'est pas validée, remplacée par la flèche de retour
    (`icone('rotate-ccw')`, `retirerValidationManuellePiece`) une fois qu'elle l'est. Les deux passent
    par `demanderConfirmation()` et journalisent dans l'historique, comme `retirerPieceStandard()`.
    Le bouton « Réinitialiser » d'une pièce trouvée sur le NAS disparaît pendant ce temps : il efface
    un chemin de fichier mémorisé, or il n'y en a aucun derrière une validation manuelle.
  - **Le libellé d'une pièce validée à la main n'est pas cliquable** (un `<span>`, pas un `<button>`) :
    aucun fichier du NAS n'est associé, un bouton « ouvrir » ne mènerait nulle part. Un soulignement
    pointillé + `cursor: help` (`.piece-item.validee-main`) et une infobulle disent d'où vient le
    statut — sans ce repère, rien ne distinguerait à l'écran une pièce trouvée sur le NAS d'une pièce
    confirmée à la main.
  - **Volontairement pas proposé sur une pièce personnalisée** : elle a déjà son propre cycle de
    statut au clic sur son icône (inconnu → manquante → reçue), et `verifierDossierLocal()` ne la
    repasse jamais en manquante — le problème traité ici ne s'y pose pas.
  - Test dans `tests/dossier-local.test.js` (conservation à l'import, entrées non-chaînes écartées).
    `validerPieceManuellement`/`retirerValidationManuellePiece`/`verifierDossierLocal` dépendent de
    `dossiers` (invisible depuis le contexte `vm` des tests — limite déjà documentée), d'où une
    **vérification dans un vrai Chromium** (serveur réel, dossier NAS ne contenant PAS le document,
    une seule pièce suivie de bout en bout) : après validation, statut `recue`, clé présente,
    compteur 1/9 → 2/9, ligne d'historique ; **après un `verifierDossierLocal()` complet, la pièce
    est toujours `recue` et toujours dans la liste** — la demande elle-même ; après retrait,
    `manquante`, liste vidée, compteur revenu à 1/9, bouton de validation réapparu. Aucune erreur JS.
  - **Piège de vérification à ne pas reproduire** : le premier script cliquait « le premier bouton
    valider du DOM » puis affirmait sur une clé écrite en dur — deux pièces différentes, parce que la
    première pièce de la liste était déjà reçue et n'avait donc pas ce bouton. Trois assertions sur
    quatre portaient sur la mauvaise pièce, et l'étape de retrait avait en réalité cliqué le
    « Réinitialiser » d'une autre. Sur une liste où les boutons dépendent du statut, capturer la clé
    de l'élément réellement cliqué plutôt que de supposer l'ordre.

- **« Il me sort une hypothèque alors qu'il n'y a qu'une caution » — deux causes, dont une qui
  rendait tout le mécanisme des garanties inopérant depuis sa livraison.** Signalé par l'étude avec
  l'offre de prêt réelle (22 pages, prêt cautionné par la Compagnie Européenne de Garanties et
  Cautions). Le PDF a été rejoué à travers les fonctions de l'outil plutôt que relu.
  - **Cause 1, la plus grave : `extraireParagrapheGaranties()` ne trouvait JAMAIS le paragraphe.**
    `RE_TITRE_GARANTIES` est ancrée en début de ligne (`^`, drapeau `m`) — c'était tout l'objet du
    correctif du 21/09, qui restreignait la lecture des garanties au seul paragraphe « GARANTIES ».
    Or `lireTextePdfVerification()` fait `content.items.map(it => it.str).join(' ')` par page :
    **le texte lu ne porte qu'UN SEUL retour à la ligne PAR PAGE**. Sur cette offre, « GARANTIES »
    est au milieu de la page 5 → aucun match → `detecterGarantiesPret()` renvoie `[]` sur
    pratiquement toutes les offres réelles. Et comme un échec de détection ne doit pas écraser une
    valeur déjà connue (`if (garanties.length) d.garantiesPret = garanties;` — règle voulue), la
    garantie lue à tort par une version ANTÉRIEURE (celle qui cherchait dans tout le document)
    restait affichée indéfiniment, sans qu'aucun « Revérifier » ne puisse la corriger. Le symptôme
    de l'étude n'était donc pas produit par le code en place : c'était un reliquat figé.
    - **Correctif** : la lecture qui suit l'identification de l'offre passe à
      **`lireTextePdfEnLignes()`** — déjà en place, écrite pour le décompte d'appel de fonds, elle
      reconstruit de VRAIES lignes depuis la position verticale des items (`transform[5]`). Les
      ancrages de ligne redeviennent valides et tout le mécanisme du 21/09 fonctionne comme prévu.
      `detecterMontantPret()` lit le même texte : vérifié sans régression sur cette offre (elle
      n'emploie pas la forme parenthésée, donc `null` avant comme après), et `MONTANT_PRET_RE`
      exclut `\n` — un vrai saut de ligne borne désormais la clause mieux qu'un saut par page.
    - **C'est la TROISIÈME fois que ce piège est payé** (après `RE_TITRE_PARTIE_SUIVANTE` et le
      parseur de décompte). La leçon, déjà écrite deux fois ici, vaut d'être appliquée
      préventivement : **toute regex ancrée sur `^` ou `\n` est fausse par construction tant que le
      texte qu'elle reçoit ne porte pas de vraies lignes.** **Audit fait dans la foulée, rien à
      corriger** : `estDebutPageAnnexe` reçoit le texte d'UNE SEULE page à la fois (boucle de
      `extraireTextesUtiles`), son `^` désigne donc bien le début de page ; `estTitreDeSection`/
      `RE_INTITULE_CAPITALES` n'a qu'un appelant, `extraireParagrapheGaranties`, qui reçoit
      désormais du texte à vraies lignes ; `RE_TITRE_PARTIE_SUIVANTE` était déjà traité. Les regex
      d'Outil 2 sont passées au même crible : la seule ancrée (`RE_CONNECTEUR_DATE_AG`) s'applique
      à un fragment court, jamais à une ligne de document. **À refaire** dès qu'une regex ancrée
      est écrite, ou qu'un lecteur de PDF change d'appelant.
  - **Cause 2 : l'hypothèque citée est un engagement À VENIR, pas une garantie de ce prêt.** Le
    contrat de cautionnement de la société de caution est reproduit À L'INTÉRIEUR du paragraphe
    GARANTIES, et il contient : « L'Emprunteur s'engage à consentir à ses frais une hypothèque
    conventionnelle sur le bien financé […] **à première demande** de la COMPAGNIE et/ou du Prêteur
    notamment **dans les cas suivants** : — défaillance de l'Emprunteur… ». `garantieNonConditionnelle()`
    ne regardait que les 160 caractères qui PRÉCÈDENT, et ses marqueurs ne couvraient que la
    garantie de REPLI (« à défaut », « en cas de refus »…). `RE_GARANTIE_CONDITIONNELLE` gagne donc
    la seconde famille : `s'engage/s'oblige à consentir|constituer|affecter`, `à première demande`,
    `pourra/pourrait/peut exiger|demander|réclamer`, `sera tenu de consentir`. **Aucun nouveau
    mécanisme** : « s'engage à consentir » précède le mot « hypothèque » de ~40 caractères dans la
    même phrase, donc la fenêtre AVANT déjà en place suffit.
    - Sur cette offre précise, la cause 2 était masquée par le plafond
      `LONGUEUR_MAX_PARAGRAPHE_GARANTIES` (2500) : la clause est à +4731 caractères du titre. Elle
      est corrigée quand même — dépendre d'un plafond arbitraire pour ne pas afficher une fausse
      garantie n'est pas une garantie.
  - **Vérifié sur le PDF réel** (texte extrait page par page, fonctions rejouées) : `['caution']`
    après correctif, contre `[]` avec l'ancien chemin de lecture. Deux contrôles opposés passent
    aussi : la clause CEGC réécrite proprement ne rend que `caution`, et une hypothèque réellement
    exigée par le prêteur reste détectée.
  - **Pour l'étude** : un clic sur « Revérifier » suffit désormais à corriger un dossier affiché à
    tort — la détection rend maintenant une valeur non vide, qui écrase l'ancienne.
  - Tests : 2 nouveaux dans `tests/offre-pret.test.js` (la clause CEGC avec son contre-exemple, et
    un test qui verrouille explicitement la RAISON du changement de lecteur : le même texte aplati
    en une seule ligne ne doit plus rien trouver). Suite racine 626 → 628, serveur inchangée (211 —
    chantier entièrement côté client).

- **Entretien de pompe à chaleur : 1 an, et non 2** (`DOCUMENTS_VALIDITE_OUTIL2.entretienPac`,
  Outil 2) — corrigé par l'étude en relisant les 16 durées affichées en clair, ce qui est
  exactement l'usage prévu du champ `duree` (voir l'entrée « assemblées générales » et le
  commentaire de la table : l'article notaires.fr de référence n'ayant pas pu être lu depuis cet
  environnement, ces durées sont celles du régime légal, à faire confirmer une par une). La `note`
  de cette entrée, qui annonçait « tous les 2 ans entre 4 et 70 kW », est **retirée avec la
  correction** : elle aurait continué de s'afficher à côté d'une durée d'un an, et une note qui
  contredit la donnée affichée vaut moins que pas de note du tout. Les trois durées d'entretien
  (chaudière, ramonage, PAC) sont désormais verrouillées par un test, comme l'étaient déjà les
  sept diagnostics à durée fixe — les durées de la table étant des faits extérieurs au code, seul
  un test empêche une retouche ultérieure de les ramener à une supposition.
- **Relance « offre de prêt » au client : une première fois à J-15, puis tous les 10 jours** —
  demandé par l'étude en découvrant ce que faisait réellement `relancerSiOffreManquante()`. Sa
  seule garde était `d.derniereRelanceAuto === aujourdhui`, soit « pas deux fois le même jour » :
  dans une fenêtre de 0 à 15 jours avant l'échéance, ça proposait un brouillon **chaque jour
  pendant quinze jours**. Nouvelle garde `relanceOffreDue(derniereRelanceIso, aujourdhuiIso)`
  (pure, testable) + `FENETRE_RELANCE_OFFRE_JOURS` (15, inchangée) et
  `JOURS_ENTRE_RELANCES_OFFRE` (10).
  - **Comptée depuis la DERNIÈRE relance, jamais sur des seuils fixes** (J-15 puis J-5) : cette
    relance n'est déclenchée que par un parcours du NAS, qui ne tourne que si CLAIRE est ouverte
    ce jour-là — un seuil exact serait simplement manqué dès que personne n'ouvre l'outil ce
    jour-là, et la relance sautée ne reviendrait jamais. Le décompte depuis la dernière relance
    rattrape naturellement le retard.
  - Une `derniereRelanceAuto` illisible (dossier importé, valeur corrompue) **autorise** la
    relance plutôt que de la bloquer : le pire cas est un email de trop, pas une offre jamais
    réclamée.
  - Dans le cas nominal, ça donne exactement deux relances, J-15 et J-5 — **vérifié par un rejeu
    jour par jour en bac à sable** sur une fenêtre de 20 jours (la fonction elle-même dépend de
    `dossiers`/du DOM, donc non testable unitairement ; seule sa garde l'est). La fenêtre
    s'arrêtant à l'échéance (`jours < 0` sort), aucune relance ne part une fois la date passée —
    comportement inchangé, non rouvert ici.
  - **À ne pas confondre avec les rappels automatiques par email** (`server/src/jobs/rappels.js`,
    J-15/J-7, adressés au COLLABORATEUR responsable et routés vers Teams) : ce sont deux
    mécanismes distincts, sur deux destinataires distincts, et l'étude les avait elle-même
    confondus en posant la question. Le job serveur couvre toutes les échéances du planning ; la
    relance ci-dessus ne concerne que l'offre de prêt et s'adresse au client (ou au confrère
    lorsqu'un office distinct représente l'acquéreur — voir `emailDestinataireRelance`).


- **La relance « offre de prêt » ne s'arrête plus à l'échéance** — décision de l'étude, prise sur
  la question laissée ouverte par l'entrée précédente (« la fenêtre s'arrête à l'échéance,
  dites-le-moi si vous voulez qu'elle continue »). Elle continue **tous les 10 jours** tant que
  l'offre n'est pas là : c'est précisément une fois la date passée que la condition suspensive est
  en jeu, s'arrêter là laissait le dossier sans relance au pire moment. Le garde `jours < 0`
  disparaît ; la borne haute (`FENETRE_RELANCE_OFFRE_JOURS`, 15) est inchangée.
  - **Deux seuls arrêts** : l'arrivée de l'offre (`verifierDossierLocal` n'appelle plus cette
    fonction) et l'archivage du dossier — nouveau garde `if (d.archive) return`. Le tour
    automatique saute déjà les dossiers archivés, mais un clic explicite sur « Revérifier »
    continuait de passer par là.
  - **Deux textes devenaient faux une fois la date passée**, corrigés ensemble et sortis en
    fonctions pures testables : l'historique écrivait `J--5` (`libelleEcheanceRelance`, qui rend
    maintenant « échéance J-5 », « échéance aujourd'hui », « échéance dépassée de 5 jours ») et le
    corps de l'email annonçait au FUTUR une date déjà derrière nous
    (`corpsRelanceOffreManquante`, dont la phrase d'échéance bascule au passé sous zéro). Ce corps
    part à un client : c'est la raison de l'avoir extrait plutôt que laissé en ligne.
  - **Rejeu jour par jour en bac à sable** sur J-20 → J+40 : relances à J-15, J-5, J+5, J+15,
    J+25, J+35, avec le bon libellé à chaque fois, et aucune relance sur un dossier archivé.
    `npm test` : 637 tests racine (+3), 211 serveur.
  - **Piège de vérification, le même que déjà documenté deux fois ici** : le premier test a échoué
    en attendant « 1er novembre 2026 » alors que `formatDateFr` rend « 1 novembre 2026 » — c'est
    la valeur ATTENDUE que j'avais écrite de travers, pas le code. Vérifier ce qu'une fonction
    existante produit réellement avant de conclure à un bug.


- **Outil 2 : cinq fausses alertes « travaux réalisés » sur tout acte de copropriété, trouvées en
  rejouant un vrai projet de vente** (30 pages, copropriété) envoyé par l'étude pour comprendre le
  « il rate des choses ». Aucune ne parle de travaux faits sur CE bien : deux familles de
  boilerplate présentes dans presque tout acte de copropriété, donc cinq fausses alertes sur chaque
  dossier de ce type.
  - **Description de ce qu'un DOCUMENT doit mentionner** — « Ce carnet d'entretien a pour objet de
    mentionner : si des travaux importants ont été réalisés… », « une information indiquant si des
    travaux ont été prescrits et s'ils ont été réalisés ». Le verbe est au passé, mais au
    conditionnel : `RE_TRAVAUX_HYPOTHETIQUE` (« si des travaux », « s'ils ont été réalisés », « a
    pour objet de mentionner », « indiquant si », « doit mentionner »), dans l'esprit du
    `CLAUSE_HYPOTHETIQUE_RE` déjà en place pour les dates d'Outil 1.
  - **Texte de loi cité dans l'acte** — « L'article L 731-4 du Code de la construction dispose
    que : … 1° La liste des travaux nécessaires à la sauvegarde de l'immeuble… ». **Deux marqueurs
    exigés**, jamais un seul : la référence au texte (`RE_REFERENCE_TEXTE_LEGAL` : article, Code,
    loi n°, décret n°) ET un verbe d'énonciation ou une énumération légale
    (`RE_ENONCIATION_LEGALE` : « dispose/prévoit/énonce/stipule que », « aux termes de l'article »,
    « est ainsi rédigé », « 1° »). Viser un article ne suffit donc pas à écarter une vraie
    déclaration — « travaux de ravalement soumis à déclaration préalable au sens de l'article
    R 421-17 » reste détecté, et un test le verrouille. « Au sens de » avait été envisagé comme
    troisième déclencheur puis retiré pour cette raison précise.
  - **Dédoublonnage par CHEVAUCHEMENT de plage, plus par les 80 premiers caractères.** Deux mots
    « travaux » éloignés de plus de 250 caractères dans la même phrase donnaient deux fenêtres de
    lecture différentes (la marche arrière de `phraseAutour` butant sur son plafond plutôt que sur
    un point), donc deux constats pour un seul passage — et, plus grave, la seconde fenêtre
    **repassait les garde-fous** que la première avait déclenchés. La plage est donc retenue AVANT
    les garde-fous : une clause est jugée UNE fois, quel que soit le verdict.
  - Ces cinq clauses ne produisaient pas encore de constat visible sur CET acte (aucune ne porte de
    mot de gros œuvre ni d'extérieur, et `constatsTravauxRealises` sort tôt sur
    `!soumisAutorisation`) — mais la liste de l'art. L.731-1 cite « la réfection de la toiture » et
    le carnet d'entretien « les équipements communs » : il suffit d'une trame un peu différente
    pour que la fausse alerte devienne visible. Corrigé à la cause plutôt qu'attendu.
  - Cinq tests dans `tests/outil2-dangers.test.js` (les deux familles de boilerplate, la
    déclaration qui vise un article et doit rester détectée, la clause longue qui ne rend qu'un
    constat). Suite racine 628 → 642, serveur inchangée (211 — chantier entièrement côté client).

- **Seuils de rappel propres à chaque échéance**, donnés un par un par l'étude — c'est la réponse
  à la question laissée ouverte (« un seuil par échéance, je vous les donne ») :
  **prêt J-15/J-7, vente préalable J-15/J-7, appel de fonds J-15/J-10, signature de l'acte
  J-25/J-15.** `SEUILS_RAPPELS` (le couple unique `[15, 7]` de `server/src/jobs/rappels.js`) est
  remplacé par `SEUILS_RAPPELS_PAR_TYPE` + `seuilsPourType(type)` (pure, testable), consultée par
  `calculerRappelsDus` pour CHAQUE échéance plutôt qu'une fois pour toutes.
  - Une **échéance personnalisée** (`autre-0`, `autre-1`…) retombe sur `SEUILS_RAPPELS_DEFAUT`,
    l'ancien couple `[15, 7]` : l'étude n'a pas de seuil à donner pour une date qu'elle nomme
    elle-même au cas par cas.
  - La **date butoir** (`acte`) n'a volontairement AUCUNE entrée dans la table, et un test le
    verrouille : elle ne figure déjà pas dans `toutesEcheances()` (voir « La date butoir devient
    informative » plus haut), lui donner un seuil laisserait croire le contraire à la prochaine
    lecture.
  - Ces quatre couples sont des valeurs MÉTIER, pas un réglage technique : comme les durées de
    validité des diagnostics d'Outil 2, seul un test empêche une retouche ultérieure de les
    ramener à un seuil unique.
  - Tests : +4 dans `server/test/rappels.test.js` (la table elle-même, le repli d'une échéance
    personnalisée, l'absence d'entrée pour la date butoir, et deux vérifications de bout en bout
    par `calculerRappelsDus` — l'appel de fonds qui part à J-10 et plus à J-7, la signature à J-25
    et J-15). Suite serveur 211 → 215 ; racine inchangée (642 — chantier côté serveur, plus le
    texte de l'écran Réglages).
  - L'écran Réglages et `server/README.md` listaient « J-15/J-7 » comme une règle unique, et
    citaient même la date butoir parmi les échéances rappelées : les deux sont réécrits avec le
    tableau réel.

- **Palette bordeaux, sidebar toujours sombre et flottante, et trois retouches du tableau de
  bord**, après une exploration comparative demandée par l'étude (bleu jugé « trop classique » —
  pistes neumorphisme/glassmorphism, un moodboard Pantone « Blue Depths », un jeu de tokens neutres
  chauds — comparées côte à côte dans des artefacts séparés avant toute modification des fichiers
  réels, y compris une prévisualisation sur le VRAI tableau de bord via un serveur jetable seedé de
  dossiers synthétiques). L'étude a tranché : bordeaux + sidebar toujours sombre, fond principal
  inchangé (les neutres chauds, essayés en aperçu, n'ont pas été retenus).
  - **`--focus`/`--focus-hover` passent au bordeaux** (`#6D2332`/`#551A26` en clair — la couleur
    exacte du papier à en-tête déjà utilisée dans le courrier d'appel de fonds, donc aucune teinte
    inventée pour l'occasion ; `#D08A98`/`#DFA3AE` en sombre, éclaircie/désaturée comme les autres
    jetons de catégorie) — remplace le bleu `#2563EB` retenu lors de la précédente refonte.
    Volontairement **découplé de `--acte`** (bleu nuit) et de `--ventebien` (bleu moyen), comme
    `--acte` l'avait déjà été de `--focus` en son temps : les trois peuvent diverger sans qu'un
    changement de l'un n'affecte accidentellement les autres.
  - **Sidebar toujours sombre, quel que soit le thème de l'application** (contraste demandé par
    l'étude) : plutôt qu'un second jeu de classes à maintenir, `.sidebar` redéclare localement TOUS
    les jetons dont dépend son contenu (`--paper*`, `--ink*`, `--line*`, `--muted`, les quatre
    couleurs de catégorie, `--urgent`, `--notif-nouveau`, `--success*`, `--focus*`,
    `--sidebar-*`) aux valeurs déjà utilisées par `[data-theme="dark"]` — une simple redéclaration
    de variables CSS qui l'emporte sur `:root`/`[data-theme]` pour tout ce sous-arbre, sans dupliquer
    la moindre règle de rendu. Aucun changement de script.js : la sidebar reste construite par les
    mêmes fonctions, seuls les jetons qu'elle consulte changent de source.
  - **Détachée du bord, flottante, coins arrondis** : `margin: 16px 0 16px 16px` + `border-radius:
    20px` + une ombre plus marquée (`0 18px 40px rgba(0,0,0,0.45)`) remplacent l'ancien
    `border-right`/`height: 100vh` bord-à-bord — celui-ci n'a plus de sens une fois la sidebar
    séparée du contenu par un espace. **Neutralisé en mobile** (`@media max-width:900px`) : le
    tiroir plein écran reprend `margin:0; height:100vh; border-radius:0` (reste sombre, hérite des
    jetons de la règle de base) — un tiroir tactile plein écran gagne à rester bord-à-bord, la
    présentation flottante du desktop n'y apporte rien et gênerait l'atteinte au doigt.
  - **Date du jour au-dessus de « Bonjour [Prénom] »** sur le tableau de bord, à la place de
    l'étiquette statique « Tableau de bord » (demandé par l'étude) : nouvelle
    `libelleDateDuJour()` (`toLocaleDateString('fr-FR', {weekday:'long', day:'numeric',
    month:'long', year:'numeric'})`, première lettre remontée en capitale — le format
    `fr-FR` rend déjà le reste en minuscules) posée dans `renderAccueilDashboard()`, avant son
    retour anticipé pour qu'elle se mette à jour même sur la branche "qui utilise ce poste ?".
    `#dash-eyebrow` garde "Tableau de bord" comme texte HTML de repli, écrasé au premier rendu JS.
  - **Bug corrigé, trouvé en testant sur le vrai tableau de bord plutôt qu'en calculant à la main** :
    « À traiter » et « Avancement des dossiers » (voir leur historique plus haut, disposition en
    duo flex) ne tenaient côte à côte qu'à partir d'environ 1750px de fenêtre une fois la nouvelle
    marge de la sidebar déduite — en dessous, ils repassaient l'un sous l'autre alors que la grille
    à deux colonnes (rail à droite) reste active jusqu'à 1320px. Bases réduites (340→220px pour
    « À traiter », 460→350px pour l'avancement, ratio 1:1.6 conservé) : les deux tiennent désormais
    dès que la colonne principale dépasse ~620px, donc sur toute la plage où le rail est encore à
    côté. Sans risque pour la lisibilité : chaque bloc a déjà son propre repli en dessous de 560px
    via sa requête de conteneur `dashbloc` (voir l'historique de l'avancement par ligne).
  - **Pastilles « nouvelle pièce » recolorées en rouge franc**, distinct du rouge-orangé
    `--urgent` (demandé explicitement par l'étude après ce lot) : `--urgent` (`#C2410C` clair /
    `#F08C4B` sombre) sert déjà aux dates dépassées et aux boutons de suppression, un rouge-orangé
    qui ne se distinguait pas assez d'un vrai signal "à regarder maintenant". Nouveau jeton
    `--notif-nouveau` (`#DC2626` clair / `#F87171` sombre, plus la variante sombre redéclarée dans
    `.sidebar`) appliqué aux deux seuls consommateurs concernés : `.sidebar-badge-notif` (le
    compteur de pièces reçues pas encore vues) et `.dot-label.dl-urgent.notif-nouveau-tag` (les
    tags "Nouveau" sur une pièce/l'offre de prêt et la ligne "Dernières pièces trouvées" du tableau
    de bord) — un simple override par sélecteur composé, sans toucher au HTML généré par script.js
    (les trois endroits posent déjà `dl-urgent` + `notif-nouveau-tag` ensemble). `--urgent`
    lui-même reste inchangé partout ailleurs (statut "Aucun document", tabs dépassés...).
  - Vérifié dans un vrai Chromium (serveur jetable + dossiers synthétiques, clair et sombre,
    1500px) : eyebrow "Samedi 26 septembre 2026", « À traiter »/« Avancement » bien côte à côte
    (mesuré par `getBoundingClientRect`), pastilles rendues `rgb(220,38,38)` en clair et
    `rgb(248,113,113)` en sombre (sidebar comme contenu). `npm test` reste vert (811 tests,
    aucune fonction pure modifiée — `libelleDateDuJour()` dépend de `Date()`/du DOM, non testable
    unitairement).

## Ce qui reste ouvert / pas encore fait

- **Signature manuscrite de Bastien ANGLUMENT, conservée pour le courrier d'appel de fonds**
  (`docs/assets/signature-anglument.png`, 223×103 px, fond transparent) : fournie par l'étude avec
  la consigne explicite « garde cela pour plus tard » — **rien n'est branché**, ni dans l'aperçu ni
  dans le `.docx`. Sa place naturelle est sous le nom du notaire en fin de courrier
  (`{notaire}` dans le modèle Word). Trois points à ne pas redécouvrir le jour où l'étude le
  demandera :
  - **Le modèle Word n'a pas de placeholder d'image** et sa liste de champs est fermée (voir
    l'entrée du générateur) — insérer une image demande soit un `{%signature}` avec le module
    image de docxtemplater (dépendance supplémentaire, chargée d'un CDN aujourd'hui bloqué ici),
    soit de poser l'image directement dans `word/document.xml` + `word/media/` + les relations,
    et de régénérer le base64 de `appel-de-fonds-modele.js`. La seconde voie n'ajoute aucune
    dépendance et reste cohérente avec la façon dont le modèle a déjà été retouché à la main.
  - **Côté aperçu**, l'image passe par `APPEL_FONDS_MODELE.assets` comme les data-URI déjà en
    place (`logoNotaires`/`logoOffice`/`iconVisio`) — jamais un `<img src>` vers un fichier servi
    à part, qui ne survivrait pas au `.docx`.
  - **Piège de déploiement déjà payé deux fois** (`questionnaire-satisfaction-pdf.js`,
    `appel-de-fonds-modele.js`) : tout nouveau fichier servi statiquement doit être déclaré À LA
    FOIS dans `ASSETS_STATIQUES` (`server/src/app.js`) **et** dans les assets embarqués du `.exe`
    (`server/scripts/build-windows-exe.mjs`) — sans les deux, il fait un 404 silencieux.
  - **Question à trancher avec l'étude avant de construire** : la signature doit-elle figurer sur
    tous les courriers, ou seulement ceux qu'elle signe elle-même (les trois responsables n'ont
    pas la même) ? Une signature apposée automatiquement sur le courrier d'un collègue serait une
    erreur bien plus coûteuse qu'un champ vide.

- **Générateur d'appel de fonds : l'aperçu de pagination A4 de l'artefact n'est pas repris**
  (la coupure visuelle « page 2 » quand le courrier déborde) — calé sur les marges réelles du
  modèle Word par un ratio mesuré, donc fragile, et sans effet sur le fichier produit. À ne
  construire que sur demande explicite. (L'autre élément non repris à l'origine, l'autocomplétion
  d'adresse via `api-adresse.data.gouv.fr`, a depuis été demandée explicitement par l'étude et
  construite — voir son entrée d'historique.)
- **Générateur d'appel de fonds : les frais et droits de l'acte de vente restent à saisir à la
  main.** Les reprendre de `calculerFraisActe()` serait immédiat côté code, mais le barème de ce
  simulateur n'a jamais été audité (avertissement explicite sur cet écran) et le chiffre partirait
  cette fois dans un courrier au client. À rouvrir si l'étude fait auditer ce barème.
- **Banc d'essai d'extraction (mesure de qualité par corpus annoté)** : chantier délégué à un
  data scientist, cadré dans `docs/spec-banc-essai-extraction.md` (point d'entrée
  `construireExtractionRegex()`, format du corpus, règle de confidentialité — aucune vraie donnée
  client, uniquement du texte synthétique reprenant la structure d'actes réels — définition
  précise de précision/rappel par champ, séparation claire des rôles : le data scientist construit
  le corpus et le harnais de mesure, les correctifs de regex restent traités comme le reste de ce
  fichier). Pas encore engagé au moment de la rédaction de cette entrée.
- **Ne pas oublier de mettre à jour `VERSION_APP` ET `HISTORIQUE_VERSIONS`** (tout en haut de
  `script.js`, format `AAAA-MM-JJ HH:MM` — voir leur historique ci-dessus) à CHAQUE commit qui
  change le comportement de l'outil, avec l'heure réelle **en heure de Paris** (demandé
  explicitement par l'étude) : `TZ='Europe/Paris' date '+%Y-%m-%d %H:%M'` en shell, jamais `date`
  seul (l'environnement de développement tourne par défaut en UTC, décalé d'1h ou 2h selon l'heure
  d'été/hiver — utiliser `date` seul afficherait une heure fausse pour l'étude). Affichés dans
  l'écran "À propos", c'est actuellement le seul moyen pour l'étude de vérifier qu'elle a bien la
  dernière copie (et de voir CE QUI a changé) avant de resignaler un bug déjà corrigé.
- **Outil 2 : panneau de diagnostic de la relecture — idée validée par l'étude, reportée par
  elle (« plus tard mais bonne idée »).** Pendant d'Outil 1 (`renderDiagnosticParcours`, voir son
  historique) : après chaque relecture, afficher les pages réellement lues, les clauses candidates
  repérées, et surtout **celles qui ont été écartées AVEC LA RAISON** (clause de style, travail
  futur et non réalisé, aucun marqueur de réalisation passée…). Motivation : le seul retour obtenu
  jusqu'ici sur Outil 2 est « il rate des choses », ce qui ne permet aucun correctif ; ce panneau
  transformerait le signalement en « il a vu la clause page 12 mais l'a écartée comme clause de
  style », donc en correctif d'un seul tour. Sur un outil dont tous les motifs sont un premier jet
  à resserrer acte par acte, c'est l'investissement le plus rentable — à relancer dès que l'étude
  le redemande.
- **Outil 2 : la question « ce qu'il rate est-il dans ou hors des quatre thèmes ? » est
  TRANCHÉE — et dans une troisième direction.** Interrogée directement, l'étude a répondu que le
  défaut n'est ni l'un ni l'autre : l'outil **« signale trop de choses sans intérêt »**. Il n'y a
  donc pas de motif à élargir (ni, sans acte réel, à resserrer au jugé), il y a du signal à
  retirer — ce que le masquage de rubrique permet désormais de faire décider par l'étude
  elle-même (voir son entrée d'historique). Deux causes structurelles restaient écartées sans
  l'acte, et le restent : aucune regex d'Outil 2 n'est ancrée sur une ligne de document, et la
  lecture n'est pas tronquée en silence (plafond de 60 pages, signalé par la section
  « couverture » du rapport). **Ce qui reste ouvert** : quelles rubriques l'étude masque
  effectivement à l'usage — c'est la mesure la plus fiable du bruit réel, et elle dira quoi
  retirer ou resserrer POUR DE BON, sur des faits plutôt que sur une supposition. **Ne toujours
  pas élargir ni resserrer un motif avant d'avoir un acte réel** : l'étude n'a pas pu en fournir
  pour l'instant, et c'est la leçon la plus répétée de ce fichier.
- **Outil 2 : le cahier des charges en 19 sections n'est plus le périmètre.** L'étude l'a
  volontairement réduit à quatre thèmes après avoir testé la version qui le suivait (voir
  « Outil 2 refait de zéro »). Les sections abandonnées — préemption, servitudes, urbanisme
  général, copropriété, titre de propriété, identification croisée — ne sont PAS à réintroduire
  sans une demande explicite : « un rapport court se lit, un inventaire ne se lit pas ». Le
  `piecesManquantes` du §17, jamais implémenté comme tel, est couvert autrement par la section
  « Obligations du vendeur » du mode projet de vente.
- **Outil 2 : connecteur openlegi (Légifrance/PISTE/RNE-INPI/EUR-Lex)**, question posée
  explicitement par l'étude — volontairement pas construit (voir son historique détaillé plus haut,
  section "Mode serveur intranet") : utile uniquement pour vérifier des faits statiques (durées de
  validité légales, texte d'un article) via des requêtes génériques sans donnée client, jamais pour
  une recherche de jurisprudence qui pousserait l'outil vers un avis juridique. Introduit une
  dépendance réseau nouvelle et des identifiants PISTE à obtenir — à ne construire que sur demande
  explicite de l'étude, avec un périmètre précisé au moment de la demande.
- Deux autres idées côté identité de marque, proposées en même temps que l'écran "À propos" mais
  non engagées : un favicon/onglet dynamique reflétant l'urgence du portefeuille (pastille rouge/
  verte selon les dossiers en blocage), et un en-tête "CLAIRE" discret sur la fiche imprimée
  (`imprimerFiche()`) — à ne lancer que sur demande explicite.
- Modèles d'email pré-rédigés différenciés selon le type de relance (prêt manquant, pièce à
  fournir, RIB) — discuté mais pas implémenté.
- Détection d'incohérences de dates (ex. prêt après l'acte).
- Points de vigilance juridiques génériques au-delà de ce qui existe déjà.
- Fiche imprimée : section "process d'appel de fonds" déjà intégrée : si l'étude fait évoluer sa
  procédure interne, mettre à jour `PROCEDURE_FONDS` dans `script.js` en conséquence.
- Étendre l'apprentissage des corrections (voir historique ci-dessus) à `changerCategorie()`
  (reclassification après enregistrement du dossier) : nécessiterait de conserver le texte de la
  clause d'origine sur le dossier sauvegardé, pas seulement la date choisie.
- Un panneau pour consulter/vider la mémoire des corrections apprises (`correctionsApprises`,
  `exclusionsMotifNom`, et désormais `memoireAuditConstats` pour Outil 2 — voir leurs historiques
  plus haut, section "Mode serveur intranet") serait utile si l'une d'elles venait à accumuler des
  erreurs (ex. une exclusion posée par erreur sur un vrai document) — aujourd'hui seul un vidage du
  `localStorage` du navigateur permet de les réinitialiser en bloc. La mémoire d'audit fait
  exception à petite échelle : chaque constat reconnu porte un bouton « Annuler » qui retire la
  décision mémorisée, une par une.
- ~~Checklist de pièces par type de vente (terrain nu)~~ — **fait** (voir l'historique des décisions
  plus haut, "Nouveau type de vente 'Terrain à bâtir'") : `PIECES_TERRAIN_AUTRES`, option
  `<option value="terrain">` dans `#f-type-vente`, branche dans `checklistPieces()`.
- ~~**Bug non corrigé, faute d'exemple concret** : "les noms de dossier ne vont pas" parfois~~ —
  **très probablement corrigé** par la refonte de l'extraction (voir son entrée dans l'historique
  ci-dessus, section « Mode serveur intranet ») : `estStyleLabelEntreGuillemets()` ne reconnaissait
  pas `L'ACQUÉREUR :` comme une étiquette de rôle et ramenait le nom du VENDEUR des deux côtés, et
  l'inversion promettant/bénéficiaire d'une promesse d'achat est désormais pilotée par le type
  d'acte. **À confirmer par l'étude sur le compromis qui posait problème** : faute d'exemple réel,
  ce diagnostic reste une déduction, même s'il reproduit exactement le symptôme décrit. Si le
  problème persiste, redemander l'extrait anonymisé du bloc d'état civil — `detecterNomDossier()` a
  déjà régressé plusieurs fois sur des suppositions de format non vérifiées.
- **Refonte de l'extraction, phases 2 et 3 non engagées** (voir le détail en fin d'entrée dans
  l'historique de la section « Mode serveur intranet ») : cadastre multi-parcelles, prix
  contradictoires, personnes morales détaillées ; puis exploitation du journal
  `corrections-extraction` et extraction ciblée itérative sur un champ resté à vérifier.

- **Arborescence réelle des dossiers de l'étude, par type d'affaire** (reçue sous forme d'un
  modèle de dossier vide "DOSSIER TYPE.rar", sans données client — noms de sous-dossiers
  génériques uniquement). **Retenu pour plus tard**, pas encore exploité : le parcours des fichiers
  (aujourd'hui `listerPdfRecursif` côté serveur sur `claude/serveur-intranet`,
  `fichiersPdfRecursifs` côté client sur `main`) explore déjà tous les sous-dossiers sans
  distinction de nom, donc rien à changer côté détection tant qu'une fonctionnalité n'a pas
  explicitement besoin de cibler un sous-dossier précis par son nom (ex. une future détection par
  type de pièce attendue, liée à la checklist ci-dessus).

  - **MAISON** : `0 - COMPTABILITE - PRET` (avec un sous-dossier `PRET`), `1 - Vendeur`,
    `2 - Acquéreur`, `3 - Titre de propriété`, `4 - Diagnostics`, `5 - Environnement`,
    `6 - Situation hypothécaire`, `7 - Travaux`, `8 - SRU`, `9 - AAE`.
  - **COPRO** : mêmes rubriques 0 à 7 que MAISON, puis `8 - COPRO et ETAT DATE` (avec deux
    sous-dossiers `ETAT DATE` et `PRE ETAT DATE`), `9 - SRU`, `10 - AAE`.
  - **TERRAIN** : `0 - COMPTABILITE - PRET`, `1 - Vendeur`, `2 - Acquéreur`,
    `3 - Titre de propriété`, `4 - Environnement`, `5 - Construction`,
    `6 - Situation hypothécaire`, `7 - SRU`, `8 - AAE` (pas de rubrique "Diagnostics" ni
    "Travaux" distincte, contrairement à MAISON/COPRO — cohérent avec un terrain nu).
  - **SUCC** (succession) : `0- COMPTABILITE`, `1- PROCURATIONS`, `2- ETAT CIVIL`,
    `3- AUTORISATIONS DE TRANSFERT - CLOTURE`, `4- IMMEUBLES` (avec deux sous-dossiers
    `ESTIMATIONS` et `TITRES`).
  - **CESSION DE FONDS** (fonds de commerce) : `1 - COMPTABILITE`, `2 - SOCIAL`, `3 - PRENEUR`,
    `4 - CONTRAT`, `6 - BAIL`, `7 - DIAGNOSTICS`, `8 - AAE`.

  **"AAE" = Acte Authentique Électronique** (confirmé par l'étude le 19/09/2026, puis précisé
  par elle le même jour). Deux sens à ne PAS confondre :
  - dans le NOM d'un PDF (« Copie AAE PROMESSE DE VENTE … », 41 pages, déjà rejoué plus haut),
    « AAE » signifie que l'acte a été reçu par un notaire sous forme électronique — promesse
    comme acte de vente. Exploité comme indice de FORME authentique à l'import
    (`detecterFormeActe(texte, nomFichier)`, voir « La mention AAE… » dans l'historique de la
    section « Mode serveur intranet »).
  - la RUBRIQUE « 9 - AAE » (« 8 - AAE », « 10 - AAE » selon le type d'affaire) ne contient PAS
    l'acte : elle range les pièces constituées entre la signature de l'avant-contrat et la vente
    (urbanisme, entretien…), futures annexes de l'acte de vente. **L'avant-contrat signé est à la
    racine du dossier client ou dans la rubrique « SRU »** — c'est là que `choisirAvantContratNas`
    le cherche (voir l'entrée corrective du même jour). Une première version l'avait cherché sous
    AAE, à tort.
