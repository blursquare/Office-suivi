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

**En ajoutant ou modifiant une regex d'extraction**, ajoutez le cas correspondant dans
`tests/dates.test.js` ou `tests/engagements.test.js` plutôt que de vérifier à la main : c'est ce qui
manquait jusqu'ici et qui a permis plusieurs régressions silencieuses (voir l'historique des
décisions ci-dessus).

Pour tout ce qui touche au DOM réel ou aux API navigateur (File System Access, Service Worker,
impression), le test le plus fiable reste d'ouvrir `index.html` dans un vrai Chrome — utilise les
outils de navigateur si disponibles dans cet environnement plutôt que de tout re-simuler à la main.

## Ce qui reste ouvert / pas encore fait

- Modèles d'email pré-rédigés différenciés selon le type de relance (prêt manquant, pièce à
  fournir, RIB) — discuté mais pas implémenté.
- Détection d'incohérences de dates (ex. prêt après l'acte).
- Points de vigilance juridiques génériques au-delà de ce qui existe déjà.
- Fiche imprimée : section "process d'appel de fonds" déjà intégrée : si l'étude fait évoluer sa
  procédure interne, mettre à jour `PROCEDURE_FONDS` dans `script.js` en conséquence.
- Étendre l'apprentissage des corrections (voir historique ci-dessus) à `changerCategorie()`
  (reclassification après enregistrement du dossier) : nécessiterait de conserver le texte de la
  clause d'origine sur le dossier sauvegardé, pas seulement la date choisie.
- Un panneau pour consulter/vider la mémoire des corrections apprises (`correctionsApprises`)
  serait utile si elle venait à accumuler des erreurs (ex. une correction faite par erreur) —
  aujourd'hui seul un vidage du `localStorage` du navigateur permet de la réinitialiser.
- ~~Checklist de pièces par type de vente (terrain nu)~~ — **fait** (voir l'historique des décisions
  plus haut, "Nouveau type de vente 'Terrain à bâtir'") : `PIECES_TERRAIN_AUTRES`, option
  `<option value="terrain">` dans `#f-type-vente`, branche dans `checklistPieces()`.
- **Bug non corrigé, faute d'exemple concret** : un retour de l'étude signale que "les noms de
  dossier ne vont pas" parfois, sur des compromis où l'état civil du vendeur/promettant est
  présenté avant celui de l'acquéreur/bénéficiaire — voir l'entrée correspondante dans l'historique
  des décisions ci-dessus. `detecterNomDossier()` a déjà régressé plusieurs fois sur des
  suppositions de format non vérifiées ; ne pas retoucher cette fonction sans un exemple de texte
  réel (ou un extrait anonymisé) reproduisant l'échec.

- **Arborescence réelle des dossiers de l'étude, par type d'affaire** (reçue sous forme d'un
  modèle de dossier vide "DOSSIER TYPE.rar", sans données client — noms de sous-dossiers
  génériques uniquement). **Retenu pour plus tard**, pas encore exploité : `fichiersPdfRecursifs()`
  parcourt déjà tous les sous-dossiers sans distinction de nom (voir l'historique des décisions),
  donc rien à changer côté détection tant qu'une fonctionnalité n'a pas explicitement besoin de
  cibler un sous-dossier précis par son nom (ex. une future détection par type de pièce attendue,
  liée à la checklist ci-dessus).

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

  "AAE" (présent dans MAISON, COPRO, TERRAIN, CESSION DE FONDS) désigne vraisemblablement une
  catégorie de pièce ou de document propre à l'étude — sens exact non confirmé, ne pas deviner ni
  développer de logique dessus sans demander confirmation à l'étude.
