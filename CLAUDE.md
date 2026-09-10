# Registre des échéances — Compromis de vente

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
- **Checklist de constitution d'un dossier, variable selon le type de vente** (idée du brainstorm
  "détection automatique de pièces manquantes" — voir plus haut) : l'étude a fourni les listes
  réelles pour deux types de vente sur trois. Pas encore implémenté — **retenu pour plus tard**,
  attendre au minimum la liste "terrain nu" avant de s'y mettre (la checklist doit couvrir les
  trois types, pas juste deux). Distinct de `DOCUMENTS_VENDEUR_CONNUS` dans `script.js` (qui
  détecte des documents à partir des clauses d'engagement *lues dans le compromis*) : cette
  checklist-ci liste ce que l'étude doit réunir pour CE TYPE de vente, indépendamment de ce que le
  compromis mentionne ou non — un point de départ fixe, pas une extraction.

  **Vente de maison :**
  - Urbanisme : certificat d'urbanisme, certificat d'alignement, certificat de numérotage, courrier
    réponse assainissement, renonciation au droit de préemption.
  - Autres pièces : diagnostics techniques, ERP (état des risques et pollution), avis de taxe
    foncière, titre de propriété.

  **Vente de lot en copropriété :**
  - Urbanisme : certificat d'urbanisme, certificat d'alignement, certificat de numérotage, courrier
    réponse assainissement, renonciation au droit de préemption (même liste que pour une maison).
  - Pièces liées à la copropriété : état daté, article 20-II, RIB de la copropriété.
  - Autres pièces : diagnostics techniques, ERP (état des risques et pollution), avis de taxe
    foncière, titre de propriété.

  **Vente de terrain nu :** liste pas encore fournie par l'étude.

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
