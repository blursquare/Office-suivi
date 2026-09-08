# Registre des échéances — Compromis de vente

Outil interne de l'étude notariale pour suivre les échéances d'un compromis de vente (obtention
du prêt, signature de l'acte, vente préalable), extraire automatiquement les documents et
engagements du vendeur, et générer des rappels.

Ce fichier donne à Claude Code tout le contexte nécessaire pour reprendre le développement sans
avoir à redécouvrir l'historique des décisions. Lis-le entièrement avant toute modification.

## Structure du projet

```
index.html      Structure de la page (le fichier à ouvrir dans le navigateur)
style.css       Toute la feuille de style (thèmes clair/sombre inclus)
script.js       Toute la logique applicative
manifest.json   Manifest PWA (installation en application)
sw.js           Service worker minimal (requis pour l'installabilité, ne fait rien d'autre)
icone.svg       Icône de l'application
```

**Important** : ces 6 fichiers doivent toujours être déposés ensemble, au même endroit (poste de
travail ou lecteur réseau partagé de l'étude). Aucun serveur n'est nécessaire : l'outil s'ouvre en
double-cliquant sur `index.html`.

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

## Historique des décisions importantes

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
