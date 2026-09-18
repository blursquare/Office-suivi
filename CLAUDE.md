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

## Mode serveur intranet (branche `claude/serveur-intranet`, distincte de `main`)

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

**Ce qui n'a volontairement PAS été fait** (arrêté à la demande explicite de l'étude, pas un
oubli) — à reprendre uniquement si redemandé un jour :
- **Import automatique** des dossiers déjà enregistrés sur la version 100% locale (`main`) vers ce
  serveur : aujourd'hui, il faudrait les recréer à la main. La piste envisagée (un endpoint
  `POST /api/import` portant la validation de `normaliserDossierImporte()` côté serveur) reste
  praticable si demandée.
- **Relances email automatiques** (un vrai envoi SMTP programmé, remplaçant le `mailto:` manuel
  actuel — `ouvrirEmailRappel()`/`relancerSiOffreManquante()`, tous deux inchangés et toujours en
  place) — sans accès Microsoft Graph, cette fonctionnalité resterait de toute façon fondée sur un
  simple envoi SMTP direct (`nodemailer`, déjà présent dans `server/package.json` mais jamais
  câblé), pas un vrai flux applicatif Outlook — jamais mise en œuvre en pratique, non redemandée
  depuis.

Le CLAUDE.md de la branche `main` (tout ce qui précède cette section) reste la référence pour le
mode 100% local, qui n'a subi aucune régression de ce chantier.

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

## Ce qui reste ouvert / pas encore fait

- **Ne pas oublier de mettre à jour `VERSION_APP` ET `HISTORIQUE_VERSIONS`** (tout en haut de
  `script.js`, format `AAAA-MM-JJ HH:MM` — voir leur historique ci-dessus) à CHAQUE commit qui
  change le comportement de l'outil, avec l'heure réelle **en heure de Paris** (demandé
  explicitement par l'étude) : `TZ='Europe/Paris' date '+%Y-%m-%d %H:%M'` en shell, jamais `date`
  seul (l'environnement de développement tourne par défaut en UTC, décalé d'1h ou 2h selon l'heure
  d'été/hiver — utiliser `date` seul afficherait une heure fausse pour l'étude). Affichés dans
  l'écran "À propos", c'est actuellement le seul moyen pour l'étude de vérifier qu'elle a bien la
  dernière copie (et de voir CE QUI a changé) avant de resignaler un bug déjà corrigé.
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
- Un panneau pour consulter/vider la mémoire des corrections apprises (`correctionsApprises`, et
  désormais aussi `exclusionsMotifNom` — voir son historique plus haut, section "Mode serveur
  intranet") serait utile si l'une des deux venait à accumuler des erreurs (ex. une exclusion
  posée par erreur sur un vrai document) — aujourd'hui seul un vidage du `localStorage` du
  navigateur permet de les réinitialiser.
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
