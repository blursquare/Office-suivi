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
- **Checklist de pièces par type de vente (terrain nu)** : la checklist de constitution du dossier
  (voir l'historique des décisions plus haut) couvre maison et copropriété, pas encore terrain nu —
  l'étude n'a fourni que les deux premières listes. Le jour où elle fournit la troisième, ajouter un
  tableau `PIECES_TERRAIN` (même forme que `PIECES_URBANISME`/`PIECES_AUTRES`), une option
  `<option value="terrain">` dans `#f-type-vente`, et une branche dans `checklistPieces()` — pas
  besoin de restructurer le reste (voir `renderPiecesDossier()`/`verifierPiecesDossier()`, déjà
  écrits pour un nombre de pièces variable).

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
