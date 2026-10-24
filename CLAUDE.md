# CLAIRE — Registre des échéances (étude notariale Gossart)

Outil interne de l'étude notariale (Maître Sophie GOSSART, Blois) pour suivre les dossiers de vente :
échéances d'un avant-contrat (obtention du prêt, vente préalable, date butoir, appel de fonds,
projet envoyé, rendez-vous de signature), pièces du dossier retrouvées sur le NAS, extraction
automatique des données d'un compromis/promesse, relances et rappels, relecture d'actes.
Nom affiché dans l'interface : **CLAIRE** (le dépôt garde son nom historique).

Ce fichier est un **guide court**. L'historique détaillé de chaque décision (≈ 11 000 lignes, mot
pour mot) est dans **`docs/historique.md`** : il n'est pas chargé automatiquement, le consulter par
`grep` quand un sujet le demande (historique d'une fonction, raison d'un choix, piège déjà payé).
**Les nouvelles entrées d'historique s'ajoutent à la fin de `docs/historique.md`**, section
« Entrées postérieures au 28/09/2026 » — pas ici. Ne mettre à jour ce fichier que si une règle
durable, l'architecture ou « Ce qui reste ouvert » change.

## Branches et déploiement

- **`main`** = la seule branche de travail : la **version serveur intranet** (Express +
  `node:sqlite`), distribuée à l'étude sous forme de `CLAIRE-serveur.exe` (Node SEA, Windows),
  reconstruit et publié en release par `.github/workflows/build-exe.yml` à chaque push sur `main` (**seule `main` publie** —
  étude 14/10 : une construction lancée à la main depuis une autre branche vérifie sans publier).
- **`sauvegarde`** = copie de `main` pour les essais de l'étude, sans développement propre.
- **Session programmée « relecture des rapports techniques » (12 h 05 / 17 h 05) : JAMAIS de push sur `main`** (étude,
  03/10 — rappel après le commit direct `9ab862e` du 02/10). Un push sur `main` construit un `.exe` installé **seul** sur le
  serveur du bureau dans les 10 minutes, sans regard humain. Cette session travaille sans l'étude, sur un rapport anonymisé :
  branche `claude/rapport-AAAA-MM-JJ-HHh`, demande de fusion, et c'est **l'étude qui fusionne** — ni `git push origin main`,
  ni `HEAD:main`, ni merge local puis push, même pour un changement minuscule ou pour le rapport lui-même ; si la demande de
  fusion ne peut pas être ouverte, laisser la branche poussée et le dire dans l'issue. Le push direct sur `main` reste réservé
  aux sessions où l'étude suit le travail en direct.
- **Rien sur `main` entre 19 h et 8 h ni le week-end, heure de Paris — nouveauté ni correction** (étude 18/10 : « je ne suis pas au bureau pour
  tester », puis « bloque aussi les corrections la nuit » ; 24/10 : « pas le week-end ») : la garde de publication (`horsHeuresBureau` et
  `weekEndParis` de `scripts/garde-publication.js`) refuse tout envoi sur `main` dans ces plages ; le travail reste poussé sur la branche et
  part sur `main` à partir de 8 h un jour de semaine (le lundi après un week-end).
- La version 100 % locale (sans serveur, `localStorage`) n'est plus maintenue ; son dernier état
  est le commit `c90e9d0`. Dans `docs/historique.md`, « sur `main` » dans les entrées antérieures
  au 18/09/2026 désigne cette version locale, et « `claude/serveur-intranet` » l'actuelle `main`.
- **Un correctif n'atteint le bureau que par un nouveau `.exe`** (les fichiers client sont
  embarqués dans le blob SEA) — **installé automatiquement** depuis le 03/10 (étude : « au démarrage et dès que c'est
  détecté » ; `routes/miseAJour.js` `tourAuto`/`demarrerAuto` : 30 s après le démarrage puis toutes les 10 min, build plus
  récent seulement, échec retenté après 6 h ; coupable dans Réglages › Mise à jour, où reste le bouton en un clic).
  **Une fenêtre déjà ouverte se recharge seule** après un redémarrage du serveur sur une autre version (03/10 :
  `GET /api/dossiers` rend `demarrage`, `surveillerVersionServeur` relit `/client/00-version.js` et recharge hors saisie — point
  `fenetres-rechargees`) ; avant, elle gardait l'ancien script jusqu'à un F5 (10 h 22 : pages d'Authentic encore
  rangées par le « numéro » retiré à 9 h 33).
  **Fenêtres d'avant le 04/10** : celles ouvertes entre le 03/10 et le découpage de `script.js` relisent `/script.js` après un redémarrage ; le serveur y répond (05/10) par la seule ligne `const VERSION_APP = '…'` de la version courante pour qu'elles se rechargent. Une fenêtre ouverte avant le 03/10 n'a pas ce mécanisme : F5.
  Avant de retoucher un bug « toujours présent » déjà corrigé, faire vérifier la version affichée
  dans « À propos » : c'est presque toujours un problème de déploiement, pas de code.

## Structure

```
index.html / style.css               Client (une seule page, tout le rendu est en JS sans framework)
commun/*.js, commun/manifest.json    Code COMMUN poste + serveur (04/10) : dates, dossier (VTE/SUCC, estSuccession), montants,
                                     pièces de la checklist, planning (échéances, SAFER), assistant (intentions, mots-clés,
                                     dates/montants écrits en français, dossier cité). Un fichier = un IIFE qui exporte en
                                     module.exports sous Node et en globaux dans le navigateur ; chargé avant client/.
client/NN-sujet.js, client/manifest.json  Le programme du poste, découpé par sujet (04/10 ; 43 fichiers, ≤ 3 000 lignes
                                     chacun) : des <script> classiques chargés dans l'ordre du manifeste — fonctions et
                                     variables de premier niveau partagées entre fichiers, comme avant dans script.js.
                                     00-version.js = VERSION_APP + HISTORIQUE_VERSIONS ; 01-socle.js = utilitaires, état,
                                     journal technique. index.html, ASSETS_STATIQUES, le .exe et les tests lisent le manifeste
                                     (tests/structure-client.test.js vérifie l'alignement).
eslint.config.js, .editorconfig      Règles de code (`npm run lint`, 0 erreur et 0 avertissement exigés par la construction du .exe)
tsconfig.json                        Typage progressif : `npm run types` vérifie (sans compiler) les fichiers marqués `// @ts-check`
manifest.json, sw.js, icone.svg      PWA (installabilité) et favicon
appel-de-fonds-modele.js             Modèle Word du courrier d'appel de fonds + logos (base64)
questionnaire-satisfaction-pdf.js    PDF du questionnaire de satisfaction (base64)
server/                              Serveur (son propre package.json ; le package.json racine est
                                     de l'outillage de test pur, sans dépendance)
  src/app.js, index.js, config.js    Montage Express, démarrage, configuration (.env / config.json)
  src/db.js, dossiersRepo.js,        Base SQLite (dossiers en blob JSON + versions récentes, table `parametres`
       parametresRepo.js             clé→JSON pour réglages et états produits par le serveur ; assainisseurs purs
       parametres/assainir.js        dans parametres/assainir.js, fusionDossiers.js pour les PUT concurrents)
  src/routes/*.js                    API (dossiers, nas, reglages, notifications, agenda, exchange,
                                     relectureClaude, relectures, offrePret, appelsFonds,
                                     signatureImages — images de la signature des emails, assistant, …)
  src/assistant.js                   « Demander à CLAIRE » : compréhension d'une phrase (mots-clés, puis IA locale)
  src/clientsBiens.js, routes/clientsBiens.js  Clients et biens (16/10) : base des personnes et des biens CALCULÉE depuis les dossiers (fiches d'Authentic),
                                     jamais recopiée ; choix de l'étude seuls gardés (clé `clients-biens` : liaisons, corrections) ; poste : client/80-clients-biens.js
  src/importClientsBiens.js          Export clients / immeubles d'Authentic (.xls) importé dans Réglages › Authentic (19/10) : lu sur le poste (client/88), lignes rangées
                                     gardées sur le serveur (clé `clients-biens-import`), base de « Clients et biens » servie après les dossiers et Authentic
  src/routines/*.js, routes/routines.js  Routines de CLAIRE (24/10, 0.327.0, phase 0 — cadrage `docs/spec-routines-claire.md`) : catalogue des routines et de leurs gestes, réglages (clé `routines-reglages`),
                                     propositions (`routines-propositions`), journal (`routines-journal`), plafond de l'IA (`routines-usage`), planificateur (un tour par minute, résumé Teams à 9 h 30) ;
                                     poste : client/110-routines.js (carte « Autoriser / Refuser », décisions), client/111-reglages-routines.js (Réglages › Routines)
  src/canaux/*.js, routes/canaux.js  Canaux de CLAIRE (24/10, 0.328.0) : « Demander à CLAIRE » façon Slack, ouvert à tous — un fil PARTAGÉ par dossier (`d:<id>`), `general`, canaux libres (`l:<nom>`) ;
                                     messages (clé `canal:<id>`, 300 au plus), non-lus, mentions, préférences, silences « Jamais pour ce dossier » ; `deposer.js` = le chemin unique d'une routine
                                     (proposition + message de CLAIRE avec sa carte) ; `notifier.js` = mention → Teams ; poste : client/112-canaux.js, 113-canaux-actions.js
  src/routes/photosCollaborateurs.js Photos de profil des collaborateurs (24/10, 0.329.0) : JPEG carré de 160 px déposé dans Réglages › Collaborateurs, clé `photos-collaborateurs`, remplace les initiales partout (client/114-photos-collaborateurs.js, `contenuAvatarCollaborateur`), initiales gardées sans photo
  src/carnetConfreres.js             Carnet des confrères (relevé initial des offices du 41, liste blanche)
  src/annuaireNotaires.js            Notaires de France par département (data/annuaire-notaires.json, lecture seule)
  src/repertoire.js                  Répertoire hors notaires (relevé du répertoire Word de l'étude, par thème)
  src/ouvertureAuto.js               Installateur du relais « claire-ouvrir: » (ouverture auto des téléchargements)
  src/installationPoste.js           Installateur « CLAIRE en application » d'un poste (raccourcis --app, voir plus bas)
  src/jobs/rappels.js                Rappels par email (planning de commun/planning.js, `autre-<index>` pour les personnalisées)
  src/navigateur/*.js                Navigateur de CLAIRE (14/10) : Chrome/Edge du serveur sans fenêtre, piloté par CDP sur tuyaux
                                     (chrome.js, session.js : liste blanche, PDF en mémoire), plan de situation de cadastre.gouv.fr
                                     (planCadastre.js, lambert.js, surlignage.js — pdf-lib), tâches (taches.js) ;
                                     routes/navigation.js ; poste : client/68-sites-claire.js
  src/memoire.js, routes/memoire.js   Mémoire de CLAIRE (15/10) : quatre dossiers du NAS (DECENNALES ENTREPRISES, FAUSSES MINUTES, MODELES - OUTILS, RAPPEL DE PROCEDURES)
                                     parcourus en lecture seule (6 h), Word/texte lus par le serveur, PDF/scans lus par le POSTE (pdf.js + OCR, client/70-memoire.js)
                                     et indexés en plein texte (SQLite FTS5, sans embeddings) ; outil `chercher_dans_la_memoire` de l'agent
  src/planAerien.js, routes/planAerien.js  Plan aérien IGN (15/10) : photo WMS + parcelles numérotées + part de chaque zone du GPU par parcelle,
                                     services ouverts de l'IGN, sans navigateur ni IA ; poste : client/68-sites-claire.js
  src/depotDia.js, routes/depotDia.js  Où déposer la DIA (15/10) : base par commune/intercommunalité (data/depot-dia.json, scripts/assembler-depot-dia.js),
                                     fiche de la mairie (annuaire du service public), corrections de l'étude ; poste : client/69-depot-dia.js
  src/yousign.js, routes/yousign.js  Yousign (23/10, 0.321.0) : signature électronique, serveur MCP https://api.yousign.app/mcp lu par le SERVEUR (clé Bearer jamais renvoyée, adresse en .yousign.app seulement), outils `yousign__…` de l'agent ; tout outil qui écrit = carte « Autoriser » ; poste : client/106-yousign.js
  src/appels3cx.js, routes/appels.js Appels reçus par 3CX (sonnerie → journal, appelant reconnu, fiche ouverte)
  src/nas.js, nasWatch.js            Lecture du NAS par le serveur, surveillance périodique
  src/fcddvCommun.js, routes/nas.js  Réponses du FCDDV (22/10) : dossier « FCDDV » du commun (`nasFcddv` de config.json, sinon partage `\\serveur\FCDDV`, sinon à côté des dossiers clients) et son sous-dossier INTERROGATION, lecture seule confinée ; poste : client/102 (défunt reconnu par nom ET prénom)
  src/scans.js, routes/scans.js      Classeur des scans du copieur (dossier « Scan » → dossiers clients)
  src/agendaOffice.js, agendaWatch.js  Lecture de l'agenda de l'office (EWS, toutes les 15 min)
  src/exchange/ews.js                Écriture dans l'agenda Outlook (EWS/NTLM)
  src/relecture/{claude,mistral}.js  Relecture d'actes par API (prompt, schéma, vérification)
  src/extraction/extraits.js       Vérification mot pour mot d'une citation (relecture d'actes) — seul reste du pipeline IA du wizard, retiré le 04/10
  src/envoiEmail.js, imapGmail.js,   Envoi SMTP, effacement différé des copies Gmail
       nettoyageGmail.js
  src/sauvegarde.js, miseAJour.js    Sauvegarde quotidienne de la base, mise à jour en un clic
  src/journalTechnique.js,           Journal technique (console.error/warn du serveur, événements des
       rapportTechnique.js           postes) et rapport anonymisé déposé en issue GitHub (12 h, 17 h)
  scripts/build-windows-exe.mjs      Construction du .exe (esbuild + SEA + postject + icône)
extension-chrome/                    Extension Chrome « CLAIRE — Assistant de saisie » (16/10) : CU et DIA sur les guichets uniques (GNAU),
                                     fiche lue sur GET /api/gnau/fiche/:id (server/src/gnau.js, routes/gnau.js, lecture seule), page
                                     affichée remplie sans jamais valider ; LISEZMOI.md (installation et marche à suivre)
extension-firefox/                   Extension Firefox « CLAIRE pour Authentic » (bouton « Envoyer à CLAIRE »,
                                     POST /api/authentic/capture, routes/authentic.js ; LISEZMOI.md)
tests/                               Tests client (node:test) ; server/test/ pour le serveur
docs/historique.md                   Historique détaillé (voir plus haut)
docs/spec-banc-essai-extraction.md   Cadrage du banc de mesure de l'extraction
```

**Tout fichier servi statiquement doit être déclaré à la fois dans `ASSETS_STATIQUES`
(`server/src/app.js`) et dans les assets embarqués de `server/scripts/build-windows-exe.mjs`** —
sans les deux, il fait un 404 silencieux dans le `.exe` (piège payé deux fois). Les fichiers de `client/` y sont par le
manifeste : **un nouveau fichier du poste = `client/NN-sujet.js` + une ligne dans `client/manifest.json` + son `<script>`
dans `index.html`** (le test `structure-client` refuse tout décalage).

## Contraintes fondamentales

1. **Tout reste sur le réseau du bureau.** Pas d'hébergement en ligne. **Ce qui part vers une IA en ligne** (mise au point de
   l'étude, 18/10 — les commentaires « l'IA tourne en local, le texte des actes ne quitte jamais le réseau » ne valent plus que
   pour Ollama) : « Demander à CLAIRE » passe **par défaut par l'API Claude, agent activé** (**anonymisation en option depuis le 20/10, 0.300.0** — étude : « s'il faut retirer l'anonymisation, mets-la en option dans la sidebar de droite » : interrupteur « Anonymisation » du bloc « Confidentialité » de la colonne de droite, **active par défaut, remise à active à chaque nouvelle conversation**, désactivation CONFIRMÉE d'une fenêtre qui dit que les noms partent en clair, rappel « Anonymisation désactivée » sous la saisie ; désactivée, `masquer`/`masquerValeur` ne s'appliquent plus à la phrase, au texte des documents, aux résultats d'outils ni à la reprise d'une conversation — l'IA en est prévenue en tête de question —, **mais** la recherche web est coupée, une recherche Légifrance/BOFiP est vidée de tout mot des fiches (`sansMotsDesFiches`) et une recherche du registre des entreprises ne garde qu'un numéro ou le nom complet d'une société des fiches (`rneSansPersonnes`) ; test dans `server/test/assistant-agent.test.js`), ou par Mistral (`api.eu.mistral.ai`
   par défaut ; le réglage de région peut l'envoyer vers `api.mistral.ai`). Partent : la phrase ; l'en-tête de la conversation (date
   du jour, prénom du collaborateur) ; les consignes `CLAIRE.md` ; les échanges du poste renvoyés à la reprise d'une conversation ;
   et pour l'agent les **résultats de ses outils** — fiches, « À faire », agenda (nature, date, heures, catégories, dossier reconnu ;
   jamais le titre ni le lieu), texte des documents lus (OCR compris), extraits de la mémoire, contrôles de relecture, conversations
   passées, résultats OpenLegi/RNE. **Pseudonymisés par le serveur** (`masquer` / `masquerValeur` : emails, téléphones, IBAN,
   SIREN/SIRET, références, longs numéros, mots des fiches — quelle que soit leur casse —, mots après une civilité, mots en
   capitales hors sigles, mots à majuscule hors tête de phrase ; codes `[NOM1]`… rétablis au retour, table gardée sur le serveur,
   jamais journalisée) ; masquage **plus léger** (`masquerCarnet` : sans les capitales ni les majuscules, longs nombres gardés pour
   Légifrance/BOFiP) pour les consignes `CLAIRE.md` et les résultats Légifrance/BOFiP. **Plus de pouvoirs de l'agent** (étude 21/10, 0.303.0, `client/96-assistant-pouvoirs.js` : `scans_claire`, `nas_dossier`, `agenda_evenement`, `actions_en_lot`) : mêmes fonctions que les écrans, **jamais sans la carte « Autoriser / Refuser »** (une seule pour un lot de 30 actions au plus) ; identifiants opaques (`scan_id`, `element_id`, `evenement_id`), **le nom d'un scan ne part jamais**, les noms de fichiers du NAS et les extraits de scans rangés sont masqués comme tout résultat d'outil ; supprimer un rendez-vous = MoveToDeletedItems, un seul essai ; aucun email ne part sans « Envoyer » ; point terrain `agent-pouvoirs`. **Yousign** (étude 23/10, 0.321.0, `server/src/yousign.js`, `client/106-yousign.js`) : signature électronique par le serveur MCP de Yousign, lue par le SERVEUR de CLAIRE (par défaut ; **depuis 0.325.0, à la demande de l'étude du 23/10 — « que Claude utilise le MCP » —, l'interrupteur « Lire par le connecteur MCP de Claude (lecture seule) » de Réglages › Yousign, éteint par défaut, fait appeler Yousign par le CONNECTEUR MCP de l'API Anthropic** : Claude seulement, `mcp_servers` + `mcp_toolset` à `default_config: { enabled: false }` et seuls les outils classés « lecture » ouverts (jamais une écriture, `send_feedback` exclu), le jeton de Yousign part chez Anthropic, **les résultats arrivent à l'IA SANS masquage** (noms des signataires) — la conversation est alors « passée en clair » : plus de recherche web ni de recherche de droit avec mots des fiches ; une erreur du connecteur le retire de la conversation sans la couper ; avec Mistral, ou éteint, le serveur lit comme avant ; point terrain `yousign-connecteur-claude`) ; outils `yousign__…` de l'agent, résultats MASQUÉS comme tout résultat d'outil, codes rétablis seulement dans les arguments envoyés à Yousign ; **tout outil qui écrit (créer, modifier, ajouter ou retirer un signataire, ENVOYER) passe par la carte « Autoriser / Refuser »**, coupable d'un interrupteur (écriture coupée = outils de lecture seuls et appel refusé côté serveur) ; clé secrète sur le serveur, adresse limitée à `*.yousign.app` en https ; aucun document ne passe par CLAIRE (joints dans l'application Yousign) ; `send_feedback` jamais donné ; connexion par identifiant et mot de passe (OAuth, 0.321.1, `yousignOauth.js`) ou clé ; points terrain `yousign-connexion|lecture|ecriture`, **non vérifié avec un vrai compte**. **Lecture libre du NAS** (étude 21/10, 0.304.0, palier 2, `server/src/nasLibre.js`, `routes/nasLibre.js`, `client/97-assistant-nas-libre.js`, outil `nas_libre` : lister / chercher PAR LE NOM / lire un Word, texte, CSV ; un PDF = `lire_document` par le poste via `/api/nas-libre/pdf`) : **ouverte par défaut depuis le 24/10 (0.331.0, étude : « laisse à l'API Claude le plus de liberté possible », choix « accès libre en lecture » ; tant que les Réglages n'ont jamais été enregistrés : tout le NAS, mots exclus `compta`, `paie`, `salaire`, `bulletin de paie` ; un réglage enregistré fait foi)**, LECTURE SEULE, réglée dans Réglages › IA et relecture d'actes › « Lecture libre du NAS » (clé `agent-nas-libre` : interrupteur, `racines` = dossiers ouverts depuis la racine du NAS, vide = tout, `exclus` = mots qui écartent un dossier ou un fichier dont un NOM de segment les porte) ; mêmes confinements que le NAS (`resoudreCheminNas`), jamais un dossier caché ni un exécutable ; chaque route relit les réglages (éteinte = 403) ; identifiants opaques `ld*`/`lf*`. **Noms de dossiers et de fichiers masqués LÉGÈREMENT** (`masquerValeurLegere` : mots des fiches, emails, téléphones, IBAN — ni capitales ni majuscules, pour que « MODELES - OUTILS » reste lisible : **un nom de personne absent des fiches passe en clair dans un nom de fichier** — d'où le choix des `racines`), texte lu masqué comme un document (`masquerValeurDocument`), compté dans la limite de lecture. Relecture 21/10 : une ligne de `racines` refusée (« .. », dossier caché) rend 400 et n'enregistre rien (une liste devenue vide ouvrirait TOUT le NAS) ; droits contrôlés aussi sur le chemin RÉEL (`cheminReelPermis`, liens et jonctions) ; ces routes n'ont pas de contrôle d'accès propre (comme le reste de CLAIRE sans mot de passe : un poste peut allumer la lecture libre). Point terrain `nas-libre`. **« Tout le NAS » = confirmation explicite** (`toutLeNas`, audit 21/10, M3 ; écrit au journal du serveur). **Calcul libre** (étude 21/10, 0.305.0, palier 3, `client/98-assistant-calcul.js`, outil `calcul`) : l'IA écrit le CORPS d'une fonction JavaScript (`donnees` en paramètre ; `dossier_ids` ["*"] = résumés de tous les dossiers **sans leur libellé** — repère `ref` D001… rétabli en libellé seulement dans le tableau montré à l'utilisateur —, jamais une fiche complète ; les codes [NOM…] écrits par l'IA ne sont pas rétablis dans l'entrée du calcul ; un résultat qui recode des valeurs — base64/hexadécimal, lettres espacées, codes de caractères — est retenu, `resultatCalculSuspect` ; audit 21/10, H1) que le POSTE exécute dans une iframe `sandbox="allow-scripts"` (origine opaque) au CSP `default-src 'none'` (+ script en ligne, `unsafe-eval`, Worker `blob:`) — **aucun réseau, aucun accès à CLAIRE** (vérifié dans Chromium : fetch, XHR, WebSocket sans aucune requête reçue ; témoin sans CSP = requête reçue) ; le code tourne dans un Worker (une boucle sans fin n'arrête que son délai, 10 s, 30 s au plus) ; les valeurs réelles restent sur le poste, **l'IA ne reçoit que le résultat**, masqué par le serveur comme tout résultat d'outil, 30 000 caractères au plus ; un `tableau` { titre, colonnes, lignes } se télécharge en CSV (BOM, « ; », virgule décimale, formules neutralisées) sans repasser par l'IA (aperçu de 15 lignes) ; code visible (« Voir le code »), aucune écriture dans CLAIRE, pas d'autorisation (rien à modifier). Contrôle dans `npm run fumee`. Point terrain `agent-calcul`. **Artefacts** (étude 21/10, 0.306.0, `client/99-assistant-artefacts.js`, panneau `#assistant-artefact` à droite de la conversation — remplace pour ces trois cas les boutons « Télécharger » dans le fil ; la colonne « Espace de travail » se masque quand un artefact est ouvert, sauf ≥ 1 800 px) : **courrier** (`rediger_document` forme courrier : texte de l'IA → document du courrier fidèle par `documentCourrierDepuisTexteAgent`, aperçu sur la page A4 du papier à en-tête = `htmlCourrierFidele` de « Constitution de dossier », texte corrigé SUR LA PAGE (`doc` modifié en place, jamais renvoyé à l'IA), Word `docxCourrierFidele`, PDF/A `genererPdfAAppelFonds`, « Ranger dans le dossier » = `rangerRenduAgent`, interrupteur tampon + signature « p/o » éteint par défaut) ; **tableau** (`calcul` → cellules modifiables, Excel .xlsx fabriqué par PizZip — `inlineStr`, une cellule `=…` reste du texte —, CSV, copie TSV) ; **outil** (`outil_claire` mode ouvrir, étude 21/10 « oui je le veux », 0.307.0 : l'écran de l'outil — `#onglet-appel-fonds`, `-quotites`, `-preemption`, `-calculateur`, `-prorata`, `-inventaire`, `-confreres`, `OUTILS_MONTABLES_ASSISTANT` — est DÉPLACÉ (jamais copié : même état, mêmes gestionnaires, mêmes identifiants) dans le panneau par `monterOutilAssistant`, prérempli par la fonction d'ouverture habituelle (`ouvrirOutilClaireAgent`, 4e argument `apres`, qui demande toujours confirmation avant d'écraser un travail sur un autre dossier) ; repère en commentaire à sa place d'origine, garage caché quand l'artefact n'est pas affiché ; `definirOnglet` le rend à sa place (`demonterOutilAssistant`, début) et remontre ceux du panneau (`reafficherOutilsMontesAssistant`, fin) ; son onglet de travail est retiré ; panneau élargi (`artefact-large`, colonne des conversations masquée) ; Claire Scan, Nouveau dossier et Répertoire gardent leur onglet, avec une carte ; Ctrl+P : un outil monté retourne à son onglet le temps de l'impression, `beforeprint`/`afterprint` ; limite : la barre d'étapes d'un outil monté ne suit pas le défilement du panneau). **Les artefacts survivent à un changement de conversation** (relecture : une correction à la main ne se perd pas) ; la croix retire l'artefact affiché. Un redessin ne touche que la page du courrier, et seulement si le texte a changé (sinon le premier clic sur un bouton du panneau était perdu). **Interface façon Claude** (même version) : plus d'avatar ni de nom, demande en bulle à droite, réponse en pleine largeur sous l'étincelle de CLAIRE, colonne de 720 px, saisie arrondie. **Limites à connaître** (règles, pas
   compréhension) : **dans le texte d'un DOCUMENT lu (acte, pièce jointe — `masquerDocument`, 0.300.0, pour que l'acte reste lisible) un prénom suivi d'un nom en casse mixte (« Marie Dupont ») absent des fiches passe en clair** — seuls « Prénom NOM », « NOM Prénom », les civilités, « née / veuve de », les mots des fiches, emails, téléphones, IBAN et longs numéros sont codés ; passent en clair aussi un nom absent des fiches écrit en minuscules, ou en tête de phrase d'un texte court ; un nom
   lu seulement dans Authentic (comparants, fiches clients, défunt hors `d.parties`) n'est pas dans la liste des mots des fiches ;
   une partie ou une rue qui porte un mot du métier retiré de cette liste (prêt, fonds, projet, signature…) ; les prénoms des
   collaborateurs ; **montants, dates, statuts et pièces partent en clair** (choix de l'étude) — seuls les montants sont masqués
   dans l'échange libre (`masquerMontants`) et retirés des recherches Légifrance/BOFiP (`argumentsDroitSansMontants`) ; la recherche
   web part sur des sites officiels avec la requête écrite par l'IA. Aucun accord de sous-traitance ni rétention zéro n'est encore
   attesté dans le dépôt pour Anthropic ou Mistral (à demander, voir « Ce qui reste ouvert ») ; le registre des traitements RGPD
   de l'étude n'est pas dans le dépôt. Exceptions voulues et cadrées par l'étude :
   la relecture d'actes, désormais faite par l'agent (0.284.0 : texte lu sur le poste puis **masqué par le serveur** comme tout
   résultat d'outil — l'ancienne pseudonymisation dans le navigateur, avec table sur le poste, est retirée avec l'outil) ; l'autocomplétion d'adresse `api-adresse.data.gouv.fr` (seul le texte tapé part) ;
   **CU et DIA sur les guichets uniques** (étude 16/10, `extension-chrome/`) : la fiche d'un dossier (`server/src/gnau.js`) part du serveur vers l'extension du poste,
   puis dans le guichet de la commune, saisie dans la session du notaire, qui relit et valide lui-même (liste noire des boutons Valider/Envoyer/Signer… en dur,
   listes cachées du guichet jamais écrites, ancien CERFA « DI… » refusé) ; « Copier la structure de la page » ne relève que noms, identifiants, libellés et options,
   jamais une valeur ; champs remplis seuls = codes CERFA connus (HANDOFF de l'étude), les autres se copient au format du guichet tant que leur emplacement n'est pas relevé ;
   **« Demander à CLAIRE » en AGENT par Claude** (étude 11/10 : « aussi intelligent que toi » ; choix : **dossiers masqués**, gestes comme avant, modèle au choix, Opus 5.5 par défaut — `server/src/assistantAgent.js`, `client/61-assistant-agent.js`, `POST /api/assistant/agent`) : Claude appelle des outils (chercher/lister/lire un dossier, « À faire », agenda, depuis hier, `faire_geste` = l'exécutant habituel ; **depuis 0.226.0 (étude 13/10, « tout son potentiel »)** `documents_du_dossier` — tous les PDF du dossier du NAS, jamais leur nom —, `lire_document` — texte lu par le poste, OCR des scans, 30 pages par appel, MASQUÉ comme le reste, choix de l'étude : jamais un PDF en clair — et `rediger_document` — .docx fabriqué sur le poste, **un courrier sur le modèle Word de l'appel de fonds (en-tête de l'office)**, « Ranger dans le dossier du NAS » sur clic (dossier relié lu par le serveur), texte lu plafonné à 180 000 caractères par conversation, **tous les outils de CLAIRE** (étude 13/10, `outil_claire`, `client/67-assistant-outils.js` : lire Contrôle de l'urbanisme, Quotités, Répertoire ; ouvrir tout outil pré-rempli par un bouton), **autorisation avant toute action qui modifie** (étude 13/10, carte « Autoriser / Refuser », `client/66-assistant-actions.js` — remplace pour l'agent le « fait tout de suite, annulable » du 06/10 ; outils `action_dossier` — pièces, engagements, échéances, dates, sans prêt, champs de la fiche, note, fonds, tâches du jour, NAS, désarchivage — et `demander_collaborateur` : message Teams par la passerelle des rappels + tâche dans la liste « Aujourd'hui » du collaborateur, demandeur prévenu sur Teams quand elle est cochée), **pièces jointes au message** (étude 13/10, `client/65-assistant-pieces-jointes.js` : PDF/images joints, glissés ou collés, lus sur le poste par `lire_document` sous l'identifiant `pjN`, nom du fichier jamais envoyé), `client/64-assistant-documents-rendus.js` ; 60 tours, 32 000 jetons Claude (16 000 Mistral), 300 s depuis le 24/10) que le POSTE exécute ; leurs résultats passent par le serveur qui les MASQUE (`masquerValeur` → `masquer` : noms, prénoms, noms d'usage, adresse, agence, notaires, emails, téléphones, références, mots en capitales hors sigles, mots après une civilité) avant Claude et rétablit les codes au retour — **montants, dates, statuts et pièces partent tels quels (choix de l'étude)** ; **l'agenda ne part JAMAIS en titre ni en lieu** (rendez-vous hors CLAIRE : nature, heure, catégorie, dossier reconnu seulement — `natureRendezVousAgent`) ; dans tout texte, un mot à majuscule initiale hors tête de phrase, un morceau de mot à tiret ou une capitale de deux lettres est masqué (tiers d'un engagement, prénom tapé) ; **dès qu'un outil a tourné, jamais de repli** sur la compréhension d'une phrase (le geste serait refait) ; les résultats d'outils sont des données, jamais des consignes ; conversation en mémoire du serveur 2 h (20 au plus ; reprise avec les échanges du poste, 0.282.0), historique jamais réécrit (réflexion adaptative conservée), 25 tours d'outils au plus, cache du système et de l'historique, `fallbacks: "default"` (Opus/Sonnet) ; **même agent par Mistral** (étude 11/10 : « idem pour Mistral ») quand Mistral est le moteur en service — fonctions au format de Mistral (`outilsMistral`, sans `strict`), prompt système en tête de l'historique, `MODELES_AGENT_MISTRAL` (Large par défaut, Medium, Small ; `modeleAgentMistral`), même masquage, même repli ; sans clé, agent coupé (`agent` de la clé `assistant-ia`) ou erreur → la compréhension d'une phrase ci-dessous ; test « rien de nominatif ne part » (`server/test/assistant-agent.test.js`) obligatoire pour tout nouveau champ lu par un outil ; point terrain `assistant-agent` ;
   **« Demander à CLAIRE » par Claude** (étude 08/10 : « connecte Claude à Demander à CLAIRE pour toutes les requêtes » ; `server/src/assistantClaude.js` ; **modèle au choix** (étude 08/10 : « je peux passer en Sonnet ou même Haïku ? » — `modeleClaude` de la clé `assistant-ia`, `MODELES_CLAUDE_ASSISTANT` : Sonnet 5 par défaut, Opus 5, Haiku 4.5 sans `effort`, `requeteAssistantClaude` ; coût cumulé par demande au tarif du modèle) ; sans réflexion, effort bas, sortie par schéma `SCHEMA_ASSISTANT`, 20 s, un seul essai) — **moteur par défaut, lit toutes les demandes** (un réglage d'avant, révision < 3, y passe une fois) ; mêmes règles que Mistral ci-dessous (phrase seule, noms masqués par le serveur, clé de la Relecture d'actes `cleApi` ou `ANTHROPIC_API_KEY`) ; sans clé Claude → Mistral s'il a la sienne, sinon IA locale ; usage du mois à part (`assistant-ia-usage-claude`), point terrain `assistant-claude` ; et
   **« Demander à CLAIRE » par Mistral Small** (étude 07/10 : « ok, on essaie », `server/src/assistantMistral.js`) — seule la PHRASE part, noms, prénoms, adresses, agences, notaires, emails, téléphones et références des fiches remplacés par des codes `[NOM1]`… par le SERVEUR avant l'envoi (`pseudonymiserDemande`), rétablis au retour (`retablirTexte`), aucune donnée de fiche dans le prompt ; moteur au choix dans Réglages › IA et relecture d'actes (clé `assistant-ia`, Mistral par défaut, IA locale sans clé ; **`toutesDemandes`** : Mistral lit toutes les phrases, pas seulement les ambiguës — paramètres et dossier toujours lus par le code, « Compris par Mistral » sous la réponse ; vrai le matin du 07/10 « pour voir », **coupé par défaut depuis le soir** (clé GRATUITE de l'étude, « limite de débit Mistral atteinte » — chaque phrase comptait) ; un réglage gardé sans `revision: 2` était lu éteint ; depuis le 08/10 la révision 3 le fait passer à Claude), usage du mois `assistant-ia-usage` ; les CDN de bibliothèques (pdf.js, tesseract.js 7.0.0, docxtemplater, docx, pdf-lib + fontkit pour le PDF/A) ; l'**API Carto de l'IGN** (outil « Droits de préemption », étude 06/10 : zonage d'une parcelle sur le Géoportail de l'urbanisme — ne part que le code postal, ou le code INSEE + section + numéro de parcelle, `server/src/urbanisme.js`) ; le **géocodage et l'itinéraire de l'IGN** pour les trajets d'un rendez-vous chez un confrère (étude 20/10, `server/src/trajetsAgenda.js` — ne partent que l'adresse de notre office et celle de l'office du confrère, jamais une donnée de client — **seule exception, demandée par l'étude le 21/10 : le rendez-vous d'INVENTAIRE d'une succession, dont l'itinéraire part de l'adresse du domicile du défunt**, `adresseInventaireSuccession`) ; les **photos aériennes de l'IGN** (Géoplateforme, `data.geopf.fr/wms-r`) et **Sitadel** (SDES, API DiDo) pour la parcelle (étude 08/10 : « oui », « recoupe aussi en cherchant sur Sitadel des traces de permis » ; `server/src/historiqueParcelle.js` — ne partent que le code INSEE, la section et le numéro, ou l'emprise de la parcelle, par le serveur ; le demandeur publié par Sitadel n'est jamais demandé ni gardé) ; **cadastre.gouv.fr dans le navigateur du serveur** (étude 14/10 ; `server/src/navigateur/` ; l'agent IA sur Géofoncier, construit en 0.229.0, a été RETIRÉ le même soir par l'étude — « ça utilise des tokens » : ne pas le remettre sans nouvelle demande) — vers le site ne partent que commune, département, section et numéro ; plan de situation = parcours écrit à l'avance (extrait de plan A4 portrait, SANS le cercle de l'outil « Plan de situation » du site, toutes les parcelles entières, surligné en jaune fluo par découpe — rien ne déborde, trous compris ; parcelles proches sur un plan, éloignées ou illisibles ensemble — plus grand côté < 4 mm — sur des plans à part, `groupesPlans`) ; aucune IA, aucun jeton ; liste blanche de domaines (https seul, ni `data:` ni autre site par redirection, fenêtre ou cadre), adresses d'achat refusées par le navigateur ; chemin du navigateur JAMAIS réglable par le réseau (audit 0.229.0 : exécution de programme) ; 3 plans en attente au plus ; la **mémoire de CLAIRE** (étude 15/10 — les textes restent en base sur le serveur du bureau ; l'agent n'en reçoit que des EXTRAITS de la recherche `chercher_dans_la_memoire` (rubrique + page, jamais un nom de fichier), MASQUÉS comme tout résultat d'outil ; aucune IA ni jeton pour l'indexer) ; l'**aide à la rédaction de l'acte** (étude 12/10 : « mets un agent IA pour suivre » la trame) — pour un passage de la trame dont le catalogue ne place pas les blancs, le passage part à l'IA du moteur en service, noms et montants masqués par le serveur, et seules des CLÉS de `CHAMPS_ACTE` reviennent, jamais une valeur (`POST /api/assistant/correspondance-acte`) ; **OpenLegi** (étude 18/10, `server/src/openlegi.js`, `routes/openlegi.js` — Légifrance, BOFiP, registre national des entreprises comme outils de l'agent, jeton secret sur le serveur) : vers Légifrance et le BOFiP ne part que la recherche écrite par l'IA, codes [NOM…] jamais rétablis, montants retirés ; vers le RNE, seulement le nom COMPLET d'une société des fiches ou un SIREN rendu par le registre (`retablirSocietes`, jamais une personne) ; résultats masqués (légèrement pour les textes de droit) ; jamais un outil de téléchargement ni d'effacement (`outilPermisOpenlegi`) ; la **recherche web** de l'agent Claude (étude 18/10, 0.285.0) : outil serveur d'Anthropic, seulement les domaines de la clé `recherche-web` (sites officiels), requête écrite par l'IA qui ne voit que des codes [NOM…] — montants et dates possibles, aucun filtre serveur sur la requête (dit dans les Réglages) ; **OpenLegi d'abord** (étude 19/10 : « openlegi est à utiliser en priorité avant la recherche web » — `rechercheWebPourTour` : quand Légifrance ou le BOFiP sont branchés, la recherche web n'est donnée à Claude qu'après un appel à l'un d'eux) ; le **rapport technique**
   (accord de l'étude du 30/09, `rapportTechnique.js`) : issue GitHub à 12 h et 17 h les jours ouvrés,
   **anonymisée par le serveur avant l'envoi** (`anonymiserTexte` : chemins, fichiers, emails, montants,
   téléphones, mots tirés des dossiers et des collaborateurs, mots en capitales hors sigles techniques ;
   jamais d'auteur de signalement, de capture, de nom de dossier ni de valeur de champ) — tout ajout
   au rapport passe par `anonymiserTexte` et un test « aucun nom ne sort » ; **tout texte d'acte cité passe par `anonymiserClause`**
   (09/10 : nom après une civilité, adresse, commune, lieu-dit entre guillemets — un prénom et un domicile absents des fiches sortaient).
2. **Accès sans mot de passe par défaut** (le réseau du bureau protège l'accès ; **adresse IP ou localhost seulement** —
   étude 14/10, `server/src/securiteHote.js` : Host d'un autre nom refusé (421, `hotesAutorises` de config.json en secours), requête
   qui écrit venue d'une page d'un autre site refusée (403) ; une nouvelle voie d'accès au serveur (relais, script) envoie sans
   Origin ou depuis l'adresse IP ;
   `"authActive": true` dans `config.json` le rétablit). Pas de compte par collaborateur : le
   collaborateur du poste est choisi une fois (`localStorage`), ses préférences vivent en base.
3. **Le serveur lit le NAS** (`config.nasRacine`, jamais devinée). L'API File System Access du
   navigateur est abandonnée : elle n'existe pas sur une adresse IP. Chemins confinés à la racine
   (`resoudreCheminNas`, liens symboliques résolus avant contrôle, PDF seulement). **Seule écriture
   sur le NAS : le classeur des scans** (accord de l'étude du 30/09) **et les pièces jointes des emails des
   dossiers** (étude 02/10, `scans.copierDansDossierClient`, mêmes règles) **et les documents Word produits par « Demander à CLAIRE »** (étude 13/10, `POST /api/nas/deposer-document`, racine du dossier client, sur clic, .docx seulement) **et les plans de situation tirés de cadastre.gouv.fr** (étude 14/10 — `POST /api/navigation/taches/:id/documents/:doc/ranger`, racine du dossier client, sur clic, .pdf) **et les scans d'une succession rangés dans « Courrier reçu » / « Factures à régler »** (étude 15/10, mêmes règles, sous-dossiers créés s'ils manquent) **et les gestes de « Demander à CLAIRE » sur le NAS** (étude 21/10, 0.303.0 : outil `nas_dossier` — lister, renommer un fichier, le déplacer vers un sous-dossier existant, mêmes routes et mêmes règles que l'explorateur ci-dessous, **après une carte « Autoriser »** ; l'agent ne voit que des `element_id` opaques et des noms que le serveur masque ; jamais de suppression) **et l'explorateur du dossier client** (étude 20/10, `server/src/explorateurNas.js`, `routes/explorateurNas.js`, `client/93-explorateur-nas.js` — « Dossier NAS » de la fiche : lecture de tout le dossier du client relié, PDF/images affichés, le reste téléchargé, exécutables jamais servis ; **renommer un FICHIER** (extension gardée, nom pris refusé) et **le déplacer vers un sous-dossier EXISTANT du même dossier client** (« Nom (2) » si pris) — arbre dépliable, fichier glissé-déposé sur un dossier ou sur la racine (0.302.0) ; jamais de suppression, de dossier déplacé ou renommé, d'écrasement ni de sortie du dossier du client, relié par la fiche et lu par le serveur ; gestes notés dans la clé `nas-gestes`, « Annuler » = le geste inverse ; point terrain `explorateur-nas`) **et les courriers de « Constitution de dossier »** (étude 15/10 — `POST /api/nas/deposer-document` avec `sousDossier: 'Constitution'`, sous-dossier « Constitution » du dossier client CRÉÉ s'il manque — seul nom permis, `SOUS_DOSSIERS_CREES` de `scans.js` —, sur clic, .pdf ou .docx) — une COPIE dans le dossier
   client (`COPYFILE_EXCL`, « Nom (2).pdf » plutôt qu'écraser), l'original déplacé dans
   « Scan/CLAIRE - scans rangés/AAAA-MM », jamais supprimé ; nom de scan = simple nom de fichier,
   dossier client confiné par `resoudreCheminNas`. Tout accès disque
   est **asynchrone** : un appel `*Sync` dans un chemin de requête fige tout le serveur (Node est
   mono-thread — la cause des « coupures » passées). Une route `async` doit rattraper ses erreurs
   (`routeAsync()` dans `routes/nas.js`) : Express 5 (le serveur y est, pas en 4) rattrape une promesse rejetée, mais `routeAsync` reste la règle (erreur journalisée de la même façon) ; une lecture en flux passe par `envoyerFlux` (sinon une erreur de lecture laisse la
   requête resterait suspendue.
4. **Aucun email au client ne part sans un clic sur « Envoyer ».** Depuis le 03/10 (étude : « répondre aux emails
   directement depuis CLAIRE », « voir cette interface pour l'envoi des rappels au lieu de les télécharger » ; choix :
   envoyé depuis CLAIRE, boîte de chacun, premier jet par l'IA locale, tous les emails), `livrerEmailDossier` ouvre la
   **fenêtre d'email** (`ouvrirRedactionEmail`, `#email-redaction-overlay`) : De / À / Cc / Objet / texte modifiables,
   pièces jointes visibles (ajout, retrait, 21 Mo au plus ; **fichier ou capture collés (Ctrl+V) ou glissés sur la fenêtre = pièce jointe**, étude 06/10), **texte mis en forme** (étude 06/10, `client/47-redaction-mise-en-forme.js` : zone éditable, barre gras/italique/souligné/listes/effacer, Ctrl+B/I/U ; texte collé en brut **sauf ses liens** (étude 06/10, « détecter les liens hypertexte et les copier-coller » : HTML collé → texte, retours à la ligne et `<a href>` http(s)/mailto seuls gardés par `htmlColleRedaction` ; texte brut collé → adresses détectées `htmlTexteColleRedaction` ; à la frappe, une adresse web/www./email devient un lien dès l'espace ou l'Entrée qui suit, `toucheRedaction`/`lierAvantCurseur` ; à l'envoi toute adresse en texte part en lien, `lierLiensTexte`) ; à l'envoi `htmlCorpsDepuisEditeur` ne garde que b/i/u, listes, liens http(s)/mailto — un email intact garde le corps d'origine, `r.html === r.htmlDepart` ; texte posé par CLAIRE — modèle, proposition — par `poserTexteRedaction`), « Envoyer » → `POST /api/emails/envoyer`
   (`server/src/envoiEmailsExchange.js` : EWS, **brouillon puis SendItem** — un échec entre les deux laisse l'email dans
   les Brouillons, jamais renvoyé ; signature HTML et logos en pièces jointes en ligne ; copie dans les Éléments envoyés
   du compte relié ; noté « envoyé » dans `emails-dossiers` avec son geste), ou « Ouvrir dans Outlook » (`livrerEmlDossier` :
   le `.eml` `X-Unsent: 1` d'avant ; seule voie si Exchange n'est pas réglé). **Expéditeur** = la boîte du collaborateur
   du poste (adresse des Réglages › Collaborateurs, jamais fournie par le poste) via le droit « Envoyer en tant que » donné
   au compte relié **à demander à Fichorga** ; refus d'Exchange → brouillon retiré, email parti du compte relié, refus
   retenu 7 jours (clé `envoi-emails`). **Réponse à un email reçu** : carte sous l'email dans la fenêtre de lecture
   (`repondreEmail`, ReplyToItem — même fil, email cité dessous ; `ReferenceItemId` porte la clé de modification relue juste avant par GetItem `IdOnly`, exigée par Exchange — 06/10), accusé de réception aussi dans le fil ; **premier jet par
   l'IA locale** (`POST /api/emails-dossiers/proposition`, `promptPropositionReponse` : rien d'inventé, « [à compléter] »
   où l'information manque — un tel passage, comme « [lien WeTransfer à coller ici] », bloque l'envoi). **Email d'origine déplacé** (étude 05/10 : son identifiant EWS change, `ErrorItemNotFound`) : la réponse part quand même, en nouvel email « RE: … » au même destinataire sans l'email cité (`sansFil`, point terrain `email-reponse-email-deplace`). **Envoi réussi → carte « Email envoyé »** en bas à gauche (étude 06/10 ; au-dessus du bandeau d'appel entrant s'il est affiché ; `notifierEmailEnvoye` : À, objet, boîte, dossier, pièces ; repli dit en clair), posée par `envoyerRedaction` pour tout geste. Annuler la fenêtre
   rend `{ ok: false, annule: true }` : l'appelant ne marque rien et ne dit rien. Mode `mailto:` du poste inchangé. Pastille
   « À répondre » (`emailARepondre` : reçu < 14 jours, dernier de l'expéditeur, sans envoi vers lui depuis). Points
   terrain `email-envoye-exchange`, `email-reponse-exchange`, `email-envoye-en-tant-que`, `email-proposition-ia`.
   Premier jet de l'IA **court** (étude 03/10 : « aller à l'essentiel ») : 1 à 3 phrases, 50 mots au plus entre les formules
   (consigne), réponse de plus de 90 mots refusée (`validerProposition`), `num_predict` borné (`LONGUEUR_MAX_PROPOSITION`,
   `generer(prompt, { longueurMax })` dans `llm.js`).
   **Modèles d'emails** (étude 03/10, Réglages › Modèles d'emails, `renderReglagesModelesEmails` ; clé `modeles-emails`,
   `server/src/modelesEmails.js`, `routes/modelesEmails.js`) : les modèles de CLAIRE (`modelesEmailIntegres` : provision,
   prêt, RIB, vente préalable client/confrère, fonds, projet, confirmation client/confrère, relance des fonds, appel de fonds,
   questionnaire — « un an après la signature » retiré le 07/10 (étude) — texte « à variables » **identique mot pour mot** aux `construireEmail…`, vérifié par
   `tests/modeles-emails.test.js`) se modifient (`modifies[cle]`) et **les boutons de la fiche suivent** (choix de l'étude :
   `emailDepuisModele` — variante confrère choisie seule, version modifiée sinon la fonction d'origine), « Revenir au texte
   d'origine » ; modèles de l'étude (`perso`). Variables `{…}` (`VARIABLES_MODELE_EMAIL`), **lien sur des mots `[mots](https://…)`** (07/10, `RE_LIEN_SUR_MOTS`, rendu par `ligneHtmlEmail` dans la fenêtre, l'aperçu et l'email ; collage avec liens gardé), paragraphe retiré si une variable est
   vide, `{si client}` / `{si confrère}` / `{si rendez-vous}` / `{si prêt attendu}` en tête de paragraphe
   (`remplirModeleEmail`). Fenêtre d'email : bouton « Modèles » (texte et objet remplacés, « Annuler le modèle »). **Modèles
   liés à un geste** (étude 03/10 au soir, `modelesEmailContexte`, groupe « Liés à un geste ») : accusé de réception, copie de
   l'acte, visio, sondage de dates (variantes confrère comprises) — variables et conditions fournies par le geste (`contexte` :
   `contexteAccuseReception`, `contexteCopieActe`, `contexteVisio`, `contexteSondage` ; `VARIABLES_CONTEXTE_MODELES`), aperçu sur
   des données inventées (`contexteExempleModele`), visio/sondage sans objet (`sansObjet`, `{boutons de réponse}` = `{{BOUTONS}}`) ;
   copie de l'acte, visio et sondage identiques mot pour mot à leurs fonctions d'origine (testé), **l'accusé de réception a
   désormais son texte dans le modèle** (premier jet de CLAIRE) ; absents du menu « Modèles » de la fenêtre (`pourFenetre`).
   **Menu « Modèles » de la fenêtre : « Proposés pour cet email » en tête** (étude 03/10 au soir, `modelesProposesPourEmail`,
   3 au plus) : modèle du geste qui a ouvert la fenêtre (+100, `GESTES_MODELES_EMAIL`), mots de l'objet et, en réponse, de l'email
   reçu — objet, résumé, pièces jointes (`MOTS_MODELES_EMAIL`, modèles de l'étude par les mots de leur nom), étape du dossier
   (`utiles` de `echangesSelonStade`, +3) ; variante confrère selon le destinataire ; rien de noté = pas de groupe.
   Seuls les rappels internes partent automatiquement :
   SMTP Gmail + mot de passe d'application → boîte-passerelle (Objet = adresse du destinataire) →
   flux Power Automate → Teams. La copie gardée par Gmail est effacée **2 h après** (le flux relève
   la boîte Gmail elle-même : l'effacer tout de suite l'empêcherait de passer).
5. **Agenda de l'office** (Exchange 2019 de Fichorga, `mail.authentic-connect.fr`), tout par EWS en
   NTLMv2 (`httpntlm`) sur le **calendrier partagé de Sophie** : **lecture** toutes les 2 min (étude, 30/09)
   (`lireCalendrierExchange`, FindItem en vue calendrier, 6 mois en 3 tranches ; envois relevés,
   rendez-vous de signature, absences, catégories, et **tous les rendez-vous du jour** pour la fenêtre
   du matin — `agendaDuJourDepuisEvenements`, clé `agenda-du-jour`, rubrique « Agenda du jour » —, le lien
   `.ics` publié n'est plus lu depuis le 29/09 ; la lecture part du lundi de la semaine précédente et
   tout est gardé sous `agenda-office` pour la page Agenda, `GET /api/agenda/evenements`) ; **écriture** : création/déplacement/retrait
   d'un rendez-vous de signature (catégorie = couleur : vert office, violet visio, orange confrère),
   note « Appel de fonds (et projet) envoyé » dans le Lieu, dates butoir prêt / vente préalable en
   journée entière — seule voie depuis le 29/09 (plus de flux `.ics` publié) : le poste les pose au
   geste, le serveur pose ce qui manque à chaque tour de lecture (`echeancesAgenda.js`) en adoptant
   d'abord un événement de même titre et même date (jamais de doublon) **et retire ce qui n'a plus lieu d'être** (étude 15/10, `retirerEcheancesLevees` : offre de prêt reçue, vente préalable réalisée, date effacée, dossier archivé — sur l'identifiant gardé seulement, jamais d'après un titre ; point terrain `echeance-agenda-retiree-serveur`) ; depuis la **page Agenda**
   (30/09), création de tout rendez-vous et **suppression de n'importe lequel après confirmation**
   (`POST /exchange/evenement/supprimer`, `MoveToDeletedItems`) — **touche Suppr** sur le rendez-vous sélectionné (05/10, même confirmation, jamais dans un champ de saisie ni pendant une fenêtre ouverte ; `evenementSupprimableAgenda`) ; **copier-coller** (07/10, `client/53-agenda-copier-coller.js` : Ctrl+C ou « Copier » du détail, clic sur une case puis Ctrl+V ou « Coller » → créé aussitôt comme Outlook, « Annuler » ; une signature se colle « ? », à confirmer) ; **modification** (01/10, titre + Start/End
   seulement, `POST /exchange/evenement/modifier`) par le crayon du détail ou en **glissant** le rendez-vous
   (Semaine/Jour, souris, confirmé au lâcher ; la signature d'un dossier emmène la fiche) ou en **tirant son
   bord** haut/bas pour changer début/fin (`horaireRedimensionneAgenda`, même confirmation) ; la **catégorie** s'y change aussi
   (`item:Categories` remplacée, catégories manuelles gardées) dont **« Annulé / à replacer »** (jaune,
   `categoriesRdv.annule`) : une signature ainsi marquée — dans CLAIRE ou Outlook — quitte la fiche
   (`rendezVousARemplacer`) et revient « à placer » ; retirer le jaune la rétablit. **Teams au
   responsable** (01/10) pour toute signature placée, déplacée ou mise « à replacer » par un autre :
   par le poste depuis CLAIRE, par le serveur quand c'est relevé dans Outlook
   (`notifierRendezVousRelevesAgenda`, sans savoir qui). **Un seul essai par appel, aucun réessai automatique** (verrouillage du compte),
   disjoncteur sur refus d'identifiants (côté client pour les écritures ; côté serveur, la lecture
   automatique est suspendue tant que les identifiants refusés restent enregistrés). Suppression = `MoveToDeletedItems`, jamais `HardDelete` ; sur `ErrorCannotDeleteObject` (vu le 01/10 : compte délégué sans droit sur les éléments supprimés de Sophie), une seconde requête en `SoftDelete` (récupérable par « Récupérer les éléments supprimés »).
   Microsoft Graph / Power Automate premium ne sont pas disponibles. **Lecture de la boîte de
   réception** du même compte (celle de Bastien, qui reçoit tout en double) **depuis la veille 18 h** pour le résumé
   des emails du matin (`emailsMatin.js`, FindItem seul ; étude 02/10 : dès 7 h 30, relu toutes les 30 min jusqu'à midi,
   jamais pendant que la lecture de l'agenda est suspendue, un seul essai après une erreur) : seuls expéditeur, objet et
   heure sont gardés, jamais le corps ; affiché **pour Bastien seulement** (`DESTINATAIRES_EMAILS_MATIN`). **Retiré le 07/10** (étude : « retire les emails reçus de CLAIRE ») : `DESTINATAIRES_EMAILS_MATIN` vide, `demarrerResumeEmails` plus lancé par `index.js` — le reste de ce paragraphe décrit le code gardé, pour le rétablir.
   **Écartés du résumé** (étude 02/10 : « SPFE ou SPF, publicité, spam, CRIDON, INFN, INAFON… ») : `MOTIFS_EXCLUSION_RESUME`
   (expéditeur + objet, lien de désinscription dans l'aperçu) + termes de Réglages › Agenda et Outlook (clé
   `resume-emails-exclusions`) — comptés (`exclus.parMotif`), jamais listés ni lus par l'IA. **Liste des demandes par
   l'IA locale** (étude 02/10, remplace le résumé en texte du 30/09) : Ollama lit expéditeur, objet, dossier reconnu et
   l'aperçu Exchange (256 car.) de 60 emails au plus, rend `{ demandes: [{ email, demande, priorite }] }` → `ia.points`
   (texte, priorité, expéditeur, heure, dossier de l'email cité, jamais deviné ; une demande sans email connu est écartée) ;
   l'aperçu n'est jamais gardé ; liste gardée telle quelle à la relecture si aucun email nouveau (`signature`).
   **Compte Exchange d'un collaborateur** (étude 05/10, `comptesCollaborateurs.js`) : avec son identifiant et son mot de passe, ses « Éléments envoyés » sont lus dans sa propre boîte et ses emails partent de sa boîte, sans accès délégué ni « Envoyer en tant que » ; refus d'identifiants → compte retenu (`refuseLe`), aucun nouvel essai avant correction, repli sur le compte relié ; sans compte, rien ne change.
   **Emails des dossiers** (étude 02/10 : « tu peux lire le contenu », « lire les emails envoyés pour confirmer » ;
   choix : repérer, ranger sur le NAS, résumé IA ; « boîte de chacun ») — `server/src/emailsDossiers.js`, **toutes les minutes** (étude 02/10, un seul tour à la fois, résumés IA en file),
   même disjoncteur, lecture seule (FindItem/GetItem/GetAttachment) : boîte de réception du compte relié → emails
   rattachés à un dossier **par l'adresse de la fiche seulement** (étude 07/10 : « ne mettre que les emails liés aux adresses des clients » —
   `dossierDeEmailParAdresse` : expéditeur = client, partie d'Authentic ou confrère de la fiche, champs à plusieurs adresses compris ; envoyés :
   un destinataire de la fiche ; plus jamais l'objet, « VTE - NOM » ni le fil ; adresses de l'étude et de son domaine propre jamais des
   adresses de dossier, `domainesEtude` ; emails déjà rattachés autrement retirés à chaque tour, `emailLieAuxAdressesDuDossier`, sauf préparés
   depuis la fiche ; dossiers archivés après les dossiers en cours ; adresse de plusieurs dossiers → l'objet départage, sinon rien) relus en entier,
   **texte jamais gardé** (résumé d'une phrase par l'IA locale, puis jeté), pièces jointes listées (images intégrées
   écartées) ; « Éléments envoyés » du compte relié et de chaque collaborateur des Réglages (accès délégué « Relecteur » à
   donner dans Outlook, sinon « Accès non donné ») → objet, destinataires, date seulement ; un email préparé par CLAIRE
   (`livrerEmailDossier` → `POST /api/emails-prepares`) retrouvé (même objet, un destinataire commun, après la préparation)
   passe « envoyé le … ». **Emails REÇUS plus affichés nulle part** (étude 07/10 : « garde juste la lecture des emails pour déclencher des choses mais ne les affiche plus dans Échanges ; laisse l'envoi d'email depuis CLAIRE dans un pop-up ») : le bloc ne liste que les **envoyés** et les préparés pas encore retrouvés (plus de filtres Reçus, ni « Confirmer la réception », ni « À répondre ») ; plus de ligne « Email : dernier reçu » dans « Demander à CLAIRE » ; la lecture côté serveur continue (rattachement, adresses du confrère, sondages, envoi retrouvé). Onglet Échanges : bloc « Emails » (`renderEmailsDossier`, fiche ouverte relue chaque minute ; étude 02/10 « une
   multitude d'emails, allège » : une ligne par email façon boîte de réception, filtres Tous/Reçus/Envoyés, recherche, 8 puis
   « Voir plus », un seul « Confirmer la réception » en tête — `emailsAConfirmer` —, tout le détail dans la fenêtre de lecture) ;
   **email lisible en entier** (étude 02/10) en cliquant son objet : `ouvrirEmailComplet` → `GET /api/emails-dossiers/contenu`
   (`lireEmailComplet`, GetItem relu à chaque ouverture, jamais gardé ni journalisé, affiché en texte échappé, jamais en HTML). **Toute pièce jointe reçue est rangée
   seule** (étude 02/10 : « dans les bons sous-dossiers, sinon à la racine » ; `rangerPiecesJointesReconnues`, dossiers
   reliés au NAS, une seule fois, un échec jamais retenté seul, jamais en participation) — **coupé par défaut depuis le 03/10**
   (étude : « pas encore au point » ; réglage `rangementAuto` de la clé `emails-dossiers`, interrupteur « Ranger seul les pièces
   jointes sur le NAS », `GET /pieces-jointes` rend une liste vide tant qu'il est éteint ; « Ranger… » à la main reste) : reconnue par son NOM
   (`pieceDePieceJointe`, mêmes motifs et exclusions que le NAS) → rubrique de la pièce (`rubriquesPourPiece` + 
   `RUBRIQUES_PIECES_HORS_SCAN`), cochée reçue ; sinon (`pieceJointeRangeeSeule` : PDF/Word/Excel, photo ≥ 30 Ko, jamais
   « image001 ») sous son nom, sous-dossier deviné du nom (`RUBRIQUES_NOM_PIECE_JOINTE`, identité/RIB → Vendeur ou Acquéreur
   par l'expéditeur, `rubriquesPieceJointe`), sinon racine ; « Ranger… » reste pour corriger (pièce choisie, ou écartée).
   **Accusé de réception** (étude 02/10) : « Confirmer la réception » sous chaque email reçu avec documents
   (`construireEmailAccuseReception`, RE: + objet, documents listés, signature de l'office, formule confrère par
   `expediteurConfrere` ; geste `accuseReception:<id>`, suivi préparé → envoyé) — premier jet de CLAIRE. Réglages › Agenda et Outlook › Emails des dossiers : état
   de chaque boîte, interrupteur, « Lire maintenant ». Clé `emails-dossiers` (3 000 emails, 500 préparés).
   **Rangement dans Outlook** (étude 19/10 : « placer dans Traiter à distance les e-mails du SPF avec l'objet Facture Dossier FIDJI, les emails de quarantaine@notaires.fr » ;
   `server/src/rangementOutlook.js`, Réglages › Agenda et Outlook › Rangement dans Outlook) : toutes les 5 min, objet et expéditeur des 300 derniers emails de la boîte
   de réception du compte relié (jamais le texte), **reçus depuis la mise en marche seulement** (étude : « que ma boîte et que les prochains » — repère `depuis`, posé au
   premier tour et à la remise en marche) ; ceux d'une règle de `REGLES_RANGEMENT_OUTLOOK` sont DÉPLACÉS (MoveItem, jamais supprimés) dans le dossier
   « TRAITÉ A DISTANCE » (sous-dossier de la boîte de réception ; « Traiter à distance » aussi reconnu, `NOMS_DOSSIER_OUTLOOK`) de la même boîte, retrouvé par son nom (accents et casse ignorés ; absent ou en double → rien) ; même disjoncteur que l'agenda, un
   refus n'est pas retenté avant 6 h ; une nouvelle règle = une entrée + son test ; **adresses d'expéditeurs ajoutées par l'étude** (étude 19/10, champ des Réglages, `expediteurs` de la clé, 50 au plus, règle `adresses-ajoutees`) ; point terrain `rangement-outlook`.
6. **Secrets** (mot de passe SMTP, clés API Mistral/Anthropic, mot de passe Exchange, **mots de passe Exchange des collaborateurs**
   — étude 05/10, `comptesCollaborateurs.js`, Réglages › Collaborateurs › Comptes Exchange —, jeton GitHub
   de mise à jour) : stockés en base, **jamais renvoyés par une route** (remplacés par un booléen
   « enregistré »), conservés si le formulaire ne les réémet pas, effacés sur chaîne vide explicite,
   jamais journalisés ni repris dans un message d'erreur.
7. **Aucune donnée client réelle dans le dépôt.** Les tests reprennent la structure des actes réels
   avec des noms, adresses et montants inventés ; les PDF réels ne sont jamais commités.
8. **Word ne comprend ni Grid ni Flexbox** : les documents générés (`imprimerFiche`, courriers) sont
   en `<table>` avec couleurs inline, et restent dans l'identité papier de l'étude (bordeaux
   `#6D2332`), hors thème de l'application.

## Règles métier stables (à ne pas rouvrir sans nouvelle demande)

- **Routines de CLAIRE** (étude 24/10, 0.327.0 ; `docs/spec-routines-claire.md`) : CLAIRE prépare seule, **l'humain décide**. Une routine ne fait jamais l'action finale : elle dépose une PROPOSITION (brouillon d'email, document, tâche, dates, alerte) par `deposerProposition` : un message de CLAIRE avec sa carte dans le **canal du dossier** de « Demander à CLAIRE » (canal « général » sans dossier), visible de toute l'étude, décidable par le responsable (ou l'administrateur) ; « À traiter » liste tout ce qui attend MA décision, la fiche renvoie vers son canal (0.328.0 : la boîte à part de la 0.327.0 est retirée) ; « Autoriser » exécute le geste habituel de CLAIRE par le POSTE (fenêtre d'email, outil, tâche), **jamais un envoi** — un email ne part que par « Envoyer ». **Trois niveaux d'autonomie**, réglables routine par routine et geste par geste, tout au niveau 1 au départ : 1 proposer, 2 agir en réversible (noté « CLAIRE », « Annuler »), 3 agir seule vers l'extérieur (email, agenda — décision de l'étude geste par geste, **confirmée** et réservée à l'administrateur ; le niveau 3 modifie alors la règle n° 4 pour CE geste). Une proposition acceptée, refusée ou expirée n'est jamais refaite (empreinte) ; passage au niveau supérieur proposé à 90 % d'acceptation sur 30 propositions, jamais d'office. Teams : un résumé groupé par collaborateur à l'heure du passage (9 h 30, jours ouvrés), jamais une alerte par proposition. Plafond de l'IA en ligne des routines : 50 € par mois (clé `routines-usage`). Toute nouvelle routine = une entrée de `server/src/routines/catalogue.js` (gestes, niveaux maximaux), son exécutant, son test « rien de nominatif ne part » si elle utilise l'IA, et son point de « vérifications sur le terrain ». Phase 0 faite (socle, routine d'essai) ; phases 1 à 4 à venir. **Canaux** (étude 24/10, 0.328.0) : un canal réutilise TOUTE la mécanique de « Demander à CLAIRE » (saisie, pièces jointes, analyse d'acte, agent, colonne de droite, artefacts) — ne jamais la contourner ni la dupliquer ; seul change l'endroit des messages (serveur, partagés) et leur présentation ; un fichier joint n'est jamais gardé (son nom seulement) ; le HTML d'une réponse venue d'un autre poste passe par `htmlSurCanal` ; une routine ne dépose une proposition que par `deposerProposition` (silences respectés, jamais refaite) ; CLAIRE répond à tout dans « général » (l'espace où on lui écrit ; sauf message adressé à un collègue @Prénom sans @CLAIRE) mais, dans le canal d'un dossier ou un canal libre (l'espace des collègues, où elle dépose seule ses propositions), seulement si on la cite @CLAIRE — comme Claude dans Slack (étude 24/10) ; une mention prévient sur Teams au plus une fois par heure et par canal ; « Demander à CLAIRE » est ouvert à tous les collaborateurs.

- **Parties** : Vendeur = Promettant, Acquéreur = Bénéficiaire — sauf promesse d'**achat**, où le
  rôle se déduit du type d'acte (`ROLES_PAR_TYPE_ACTE`). La **forme** de l'acte (authentique : les
  notaires sont nommés en première page ; sous seing privé : en fin d'acte) est distincte de son
  **type** ; « AAE » dans un nom de fichier = acte authentique électronique.
  **Vendeur et acquéreur du même nom** (étude 07/10 : « les parties doivent partout dans CLAIRE être identifiées par nom et prénom ») :
  le nom seul ne désigne jamais un côté quand il est porté des deux côtés — fiche client d'Authentic (`roleClientAuthenticParNom` :
  prénom exigé dès que le nom est des deux côtés du nom du dossier), création depuis Authentic (`partiesExportAuthentic` : prénom de
  l'intitulé, sinon rien), fonds reçus (`motsPayeurDossier` : « nom prénom », tous les mots dans le titulaire, le prénom n'est plus
  cherché seul), Claire Scan (`scoreDossierScan` : une partie sans prénom dont le nom est de l'autre côté ne donne pas le côté).
  **Agenda** (étude 07/10, deux dossiers ROY inversés) : `dossierPourReferenceAgenda(reference, actifs, evt)` — identifiant
  Outlook mémorisé (`d.rdvAgendaItem.itemId`) d'abord ; un nom de famille porté par plusieurs dossiers ne désigne aucun d'eux
  (l'autre nom ou un prénom de partie propre à un seul dossier, sinon la date posée sur la fiche à la main ou par CLAIRE, jamais
  une date écrite par l'agenda) ; les routes qui retirent, déplacent ou notent un envoi reçoivent `dossierId` et vérifient que
  l'événement est celui de CE dossier parmi tous (`evenementDuDossier`). Dossiers ARCHIVÉS dans la liste, candidats
  seulement jusqu'à leur signature (`dossierCandidatPourDate`, Authentic puis fiche puis archivage) ; leurs noms gardés hors
  de cause ensuite (`nomsAilleurs`). Date « sûre » qui départage = signé dans Authentic ou posée à la main/par CLAIRE.
  Remise en ordre à chaque tour (`corrigerRendezVousEcritsParAgenda`) : une date ÉCRITE PAR L'AGENDA est retirée si le
  rendez-vous de ce jour est celui d'un autre dossier, ou s'il est repassé « ? » (provisoire). NAS : un dossier du commun déjà relié à un dossier en
  cours n'est jamais relié seul à un second (`dossierNasPrisParUnAutre`). Authentic : une fiche sans référence ne se complète seule que d'un dossier relevé qui est le SEUL à porter ses noms (`indexGroupeAuthenticPourDossier`). Fonds reçus : un nom de famille porté par un autre dossier en cours est cherché avec le prénom (`motsPayeurDossier(d, autres)`).
  Un cas non départagé reste « à rattacher », jamais deviné.
  **Comparants du sous-dossier** (étude 09/10 : une vendeuse seule propriétaire avait reçu son mari, une acquéreuse seule son partenaire
  pacsé, repris de leur fiche client par le conjoint) : la rubrique « Comparants » de la page du dossier (`comparantsAuthentic` : noms puis
  qualité Vendeur/Acquéreur, « M. X et Mme Y » = deux personnes, qualité en fin de ligne acceptée ; **« épouse de / époux de / veuve de / divorcé de M. Z » : la personne est seule, Z n'est comparant que s'il est listé à part** — étude 09/10, `RE_LIEN_CONJOINT_COMPARANT` ; **une personne notée « Autre intervenant » n'est jamais reprise dans la fiche** (étude 09/10 ; ses noms ne se collent pas à la qualité suivante) ; `d.authentic.comparants`) dit qui est partie — une fiche client
  d'une personne qui n'y figure pas n'ajoute rien (`personneComparantAuthentic` ; sans comparants relevés, le NOM seul place une
  personne, jamais son conjoint) ; une personne reprise d'Authentic absente des comparants est retirée avec la situation du couple
  posée par Authentic (`retirerPartiesHorsComparants`, seulement quand les deux côtés sont lus).
- **Notaires** : priorité mention explicite (hors clause d'origine de propriété) > règle
  géographique (`REGLES_NOTAIRE_INSTRUMENTAIRE`, bien dans le 41) > ordre dans la zone attendue ;
  sinon rien n'est deviné. **Champs notaire liés à l'annuaire** (étude 05/10) : recherche dans tout l'annuaire à la frappe (`proposerNotairesAnnuaire`), nom complété seulement si UN SEUL notaire correspond (`completerNomNotaire`) ; un notaire lu dans le compromis n'est **jamais proposé sous le nom lu** (étude 07/10 : « trouver toujours une correspondance avec le répertoire ») : il prend le libellé du notaire de l'annuaire le plus proche (`notaireDepuisRepertoire` → `notaireAnnuaireLePlusProche` : nom de famille — un mot du nom si tout est en capitales —, puis même prénom, même ville, le 41, un voisin ; à une lettre près dans la région à défaut) ; personne de ce nom → rien ; à la création, dans le panneau, sur la fiche (« Lus, à placer », `notairesDetectesDossier`, dossiers anciens compris) et l'agence lue celui du Répertoire (`agenceDepuisRepertoire`, thème « immobilier »), **champs notaire de la fiche : seulement un notaire du répertoire** (étude 07/10 : `autocomplete="off"` — l'historique du navigateur n'entre plus dans la liste —, `notaireDuRepertoire` au départ du champ : un nom qui ne désigne pas un seul notaire du répertoire n'est pas enregistré, toast ; ancienne valeur laissée telle quelle non touchée) ; **« Nouveau dossier » et « Compléter le dossier » aussi** (étude 07/10 : `completerNotaireWizard` vide une saisie hors répertoire, `notairesHorsRepertoireFormulaire` bloque l'enregistrement, le notaire d'Authentic n'est plus repris du tout) ; notre office toujours « Maître Sophie GOSSART (BLOIS) » (`NOTAIRE_ETUDE_LIBELLE`, `canoniserNotaireEtude` ; bouton « Notre office » sur la fiche, placé seul du bon côté dans Nouveau dossier quand le rôle est lu, déduit ou choisi). Le rôle de l'étude (instrumentaire/participant) est déduit du côté qui
  reçoit l'acte ; si un autre office représente l'acquéreur, les emails vont **au confrère**
  (« Mon Cher Maître, … Votre bien dévoué. ») et le questionnaire de satisfaction n'est jamais proposé à
  l'acquéreur ; il peut l'être **au vendeur** quand l'étude le représente (étude 02/10, `renderQuestionnaireVendeur`,
  `d.questionnaireVendeurEnvoyeLe` ; tâche « Envoyer le questionnaire de satisfaction au vendeur » dans « À faire » comme celle de l'acquéreur ; **le dossier n'est archivé qu'une fois TOUS les côtés que l'étude représente servis** — **ou 30 jours après la signature si un questionnaire n'est pas parti** (étude 07/10, `archivageSansQuestionnaireDu`, `archiverSansQuestionnaire` au démarrage puis toutes les heures) — étude 07/10, `questionnairesRestants`, avant : au premier envoi ; un côté sans email reste attendu et sa tâche devient « Renseigner l'email … pour le questionnaire de satisfaction », qui ouvre la fiche — étude 07/10 : « s'il n'y a pas de mail, demander à remplir le mail »).
- **Responsables** : liste fermée (Bastien ANGLUMENT — administrateur, vue globale —, Julie
  VASSELIN, Jérémy SAUJOT).
- **Planning** (`echeancesPlanning`, **`commun/planning.js`**, partagé poste/serveur depuis le 04/10 ; côté serveur
  `toutesEcheances` n'en est que l'habillage `autre-<index>`) : vente préalable → obtention du prêt → *renonciation au droit de
  préemption* (bloquante hors copropriété, sauf pièce retirée ou participation ; en copropriété
  seulement si une pièce personnalisée « préemption/DPU/DIA » a été ajoutée ; toute pièce ajoutée par l'analyse des droits de
  préemption et pas encore reçue la retient aussi — `piecesPreemptionEnAttente`, 07/10 ; en copropriété soumise au DPU, la pièce STANDARD « Renonciation au droit de préemption » retenue par l'analyse, sauf retirée — plus de seconde pièce « (DIA) », `migrerPieceDiaCopropriete` ; « Réponse SAFER » relève de `saferLevee`) → *délai SAFER*
  (date butoir tirée d'Authentic, voir l'extension) → *réponse à la DIA* (étude 07/10, `echeanceDiaDossier` : DIA envoyée relevée dans Authentic
  `d.authentic.demandes.renonciationPreemption.date` + 2 mois, `MOIS_REPONSE_DIA`, tant que la renonciation n'est pas reçue ; **jamais une renonciation
  tacite** — étude : « pour la DIA on doit avoir le document de renonciation pour signer » : la date sert à suivre et relancer la mairie, le rendez-vous
  ne se place qu'avec la pièce reçue ; semaine probable après elle, ligne « Réponse à la DIA » de la fiche, sans rappel) → fixer le rendez-vous → envoi appel de fonds → *rédaction de l'acte* → envoi projet → signature. **Rédaction de l'acte** (étude 07/10, `redactionAProposer`, `attentesRedaction`, `echeanceRedaction` dans `commun/planning.js`) : état lu dans le tableau « Rédaction » d'Authentic (`etatTableauRedactionAuthentic` : « Non rédigé » → `a_rediger`, « En cours » → `redaction`, « Signé le … » avant tout ; `d.authentic.acte`) ; proposée — tâche « Rédiger l'acte » d'« À faire » sans fenêtre des 15 jours, item `redaction` du planning à J-15 de la signature — rendez-vous placé, sinon première date encore proposée (sondage ouvert), sinon date au plus tôt (`repereSignatureRedaction` + `signaturePrevueDossier` de client/27, poste seulement), sinon date butoir ; une date estimée jamais avant aujourd'hui (étude 07/10 : « mettez bien l'échéance quand même ») —, sans rappel Teams — **seulement si Authentic dit « Non rédigé »** (jamais sans état lu, choix de l'étude) et que prêt, vente préalable, préemption (DIA) et SAFER sont levés (urbanisme jamais bloquant, rendez-vous pas exigé) ; **cochée au passage à « En cours »** (étude 07/10 : « s'il est en cours cocher la tâche et l'échéance » — `d.echeancesValidees.redaction = true` posé par `appliquerReleveSurDossier`, historique « Rédaction de l'acte marquée réalisée (en cours dans Authentic) » → tâche cochée « Faite par CLAIRE »), **jamais en « Non rédigé »** (qui retire la coche), ou cochée à la main ; une décoche à la main est retenue (`false`) — `echeanceValidee(d, 'redaction')` ; jamais en participation ni en succession ; ligne « Rédaction de l'acte » sur la fiche avec ce qui la retient. **Pas de prêt** (étude 12/10 : condition posée par erreur à la création, ligne sans date = crayon seul) : lien « Pas de prêt dans ce dossier » toujours visible sous la ligne du prêt (`marquerSansPret` : `sansPret`, date effacée, date butoir retirée de l'agenda ; une date d'obtention saisie ensuite le rétablit). La **date butoir** est informative dès qu'un
  rendez-vous est fixé (hors planning et hors rappels). Une date d'envoi saisie vaut envoi fait.
- **Statut affiché d'un dossier = son état général** (étude, 29/09 au soir : `etatDossier`,
  `renderBadgeStatut`) : un seul badge partout (tableau de bord, Suivi, fiche, recherche) —
  « À relier » (jamais relié au NAS), « Attente de pièces » (pièce de la checklist ou offre de prêt
  manquante ; participation : l'offre seule), « Complet » (tout reçu), « Prêt » (complet + rendez-vous
  placé), et **« Urgent »** dès qu'une date butoir est dépassée (vente préalable, prêt, date butoir
  sans rendez-vous) — prioritaire, calculé, il disparaît dès l'échéance levée ; **« Signé »** (vert, étude 24/10) dès que l'acte est VRAIMENT signé
  (`signatureFaiteSuivi` : signé dans Authentic ou signature cochée — jamais un rendez-vous seulement passé), avant « Urgent » et « Attente de pièces »,
  jusqu'à l'archivage. Confirmé par l'étude :
  un rendez-vous placé avec une pièce manquante reste « Attente de pièces » ; une vente préalable non
  réalisée (financement, comme l'offre) empêche « Complet » et « Prêt ». Couleurs : rouge, gris, ambre, bleu `--acte`
  (jamais l'accent, qui peut être orange ou vert), vert. **Suivi** (30/09, choix de l'étude) : barre en trois lignes
  (`.suivi-barre`, **une carte collée en haut au défilement** — étude 06/10, fenêtre ≥ 760 × 901 px ; une fois collée, les filtres se replient et se rouvrent au survol ou au focus — `initBarreSuiviCollee` ; titre du filtre = texte de son option vide) — grande recherche (nom du dossier seulement ; le collaborateur passe par le filtre
  « Responsable », pré-réglé sur celui du poste à chaque session, **sauf l'administrateur, qui voit « Tous »** (étude 02/10) — `filtreSuiviParDefaut`, `appliquerFiltreSuiviCollaborateur`, reposé au changement de poste) + bascule de vue, filtres sur une ligne (« Trier par »
  en vue Tableau seulement ; interrupteur « Archivés » (`wa-switch#voir-archives`, cadre des filtres, étude 04/10) allumé → section « Archivés » en bas de la vue Échéances,
  `archivesPourEcheances`, date de signature sinon d'archivage, jamais dans une semaine), statuts en pastilles de filtre (`syntheseEtatsSuivi`, `renderEtatsSuivi`) ; **à gauche** (colonne comme celle de l'agenda — 224 px depuis le 06/10 pour l'agenda, 300 px pour le Suivi —, étude 01/10, `.suivi-corps`/`.suivi-cote` ; au-dessus sous 1100 px),
  `renderColonneSuivi` (étude 01/10 au soir, remplace « Prévu en {mois} ») : le **mois civil en cours** en quatre
  tuiles-filtres (`syntheseMoisSuivi`, `filtreMoisSuivi`) — à signer (rendez-vous dans le mois), à placer (sans
  rendez-vous, date butoir dans le mois ou déjà dépassée), ventes, successions (`d.typeAffaire`) —, puis
  « Derniers dossiers ouverts » du collaborateur (étude 05/10, à la place des dernières pièces : `noterDossierConsulte`, 10 au plus ; depuis le 06/10 dans ses préférences sur le serveur, `dossiersConsultes`, plus dans le navigateur), puis le carré « Activité de l'étude — En direct » (même fil que le widget du tableau de bord, tous dossiers, `partiesActiviteEtude`, `renderActiviteColonneSuivi`). Refusés par
  l'étude : graphique par semaine, charge par collaborateur, montant des ventes, le mot « portefeuille ». **Vue Échéances : tous les dossiers** (étude 02/10) — une échéance par dossier, semaines puis « Plus tard » (au-delà de `SEMAINES_AFFICHEES`), puis **« Signés »** (acte signé dans Authentic ou signature marquée faite — `signatureFaiteSuivi` ; plus récent d'abord ; étude 02/10), puis « Sans échéance datée » (jamais omis, `grouperEcheancesParSemaine`) ; un dossier signé montre **« Signé le … »** en vert à la place de la date et « Acte signé » en Échéance, partout dans le Suivi (`texteSigneSuivi`). **Liste « intelligente »**
  (30/09) : section « Nouveau » (ex-« À voir en premier ») en tête (`signauxDossierSuivi`, `partagerAVoirSuivi`) —
  notifications (`piecesNotifications` : offre, pièces nommées) puis fonds tous reçus non confirmés ;
  le dossier en sort à l'ouverture de sa fiche, sans doublon dans la suite de la liste. **Colonnes, partout dans le Suivi** (vue Échéances, vue Tableau, « Nouveau », « Archivés » ; étude 01/10) : Date, Dossier, Échéance, Resp., Statut — `COLGROUP_SUIVI`/`ENTETE_SUIVI`, mêmes largeurs ; plus de colonne « Offre de prêt » en vue Tableau ; responsable en **initiales dans une pastille ronde** (`pastilleCollaborateur`, étude 01/10) ; bouton « Scanner le commun » (ex-« Revérifier tous les dossiers », `reverifierTousLesDossiers`) ; `statutDossier` (pièces trouvées) ne sert plus qu'aux points « À traiter ».
- **Cocher / décocher une échéance** (étude 05/10, `basculerEcheance`, case ronde `.ech-case` sur chaque ligne de la fiche, même geste que la tâche d'« Aujourd'hui ») :
  cocher un **envoi** (appel de fonds, projet) = date d'envoi du jour (`echeanceValidee` y est vrai dès qu'une date existe, poste ET serveur) ; **décocher = effacer cette
  date** — l'étape redevient due avant le rendez-vous de signature et son délai J-n, donc ses rappels, reviennent ; les autres échéances (prêt, vente préalable, butoir,
  perso, signature) gardent leur date, seule la coche tombe. La mention « envoyé » du lieu du rendez-vous Outlook suit (`majMentionAgendaEnvoi`, `retrait: true`) ; l'événement
  Outlook du prêt / de la vente préalable est retiré à la coche et reposé à la décoche. Un nouveau chemin qui coche une échéance passe par `cocherEcheance` / `devaliderEcheance`.
- **Échéance de l'appel de fonds = 10 JOURS AVANT le rendez-vous de signature** (étude 05/10 — la veille, posée le même
  soir, était une erreur ; `echeanceAppelFonds`, `JOURS_APPEL_FONDS_AVANT_RDV` dans `commun/planning.js`) ; la tâche « Envoyer l'appel de fonds »
  d'« À faire » apparaît dès cette date et le rappel Teams part ce jour-là (étude 05/10 : « pour Teams il faut suivre les délais
  des échanges »).
- **Seuils des rappels email** : prêt J-15/J-7, vente préalable J-15/J-7, appel de fonds **le jour de son échéance** (J-10 du rendez-vous, seuil `[0]`, étude 05/10),
  signature J-25/J-15, **envoi du projet J-7 seulement** (étude 06/10 : pas de rappel 15 jours avant), personnalisées J-15/J-7 (`SEUILS_RAPPELS_PAR_TYPE`).
- **Relance de l'offre de prêt au client** : première à J-15, puis tous les 10 jours, y compris
  après l'échéance, jusqu'à réception de l'offre ou archivage.
- **Offre de prêt** : reconnue par le nom du fichier, à défaut par le titre de la page de garde
  (≥ 6 pages) confirmé par l'IA locale ; « à confirmer » si le modèle est indisponible. Garanties
  lues dans le seul paragraphe « GARANTIES », une garantie conditionnelle/future n'est pas comptée. Offre reçue sans garantie lue : « Garantie non identifiée »
  (`garantiesPretAffichees`), jamais un blanc.
- **Hypothèque : acte de prêt et DOD** (étude 20/10, 0.296.0, `client/90-acte-pret.js`) : une hypothèque légale de prêteur de deniers ou conventionnelle lue dans l'offre
  (`hypothequesPret` ; ni caution ni « sans garantie ») est **mise en avant près du prix en haut de la fiche** (pastille pleine, `pastillesHypothequeEntete`) et décide du circuit
  (`circuitActePret`) : **participation et notre client est l'acquéreur** (`roleNotaire` participant, aucun confrère sur l'acquéreur) → « Rédiger l'acte de prêt »
  et « Envoyer la DOD au notaire instrumentaire » dans « À faire » ; **nous recevons l'acte et un confrère représente l'acquéreur** → l'inverse, « Réclamer la DOD au confrère »
  (c'est lui qui rédige et nous envoie sa DOD) ; **seul notaire** → le prêt est rédigé dans l'acte de vente, rien à faire ; participation côté vendeur : rien pour nous. Emails de la DOD =
  **premiers jets de CLAIRE** (`construireEmailDod`), jamais partis sans « Envoyer » ; « Déjà fait / Déjà envoyée / Déjà reçue » posent `actePretLe`, `dodEnvoyeeLe`, `dodRecueLe`.
  **Sous-dossier « Prêt » d'Authentic** (en-tête « N - Prêt … », `sousDossierAuthentic` → `'pret'`) : son tableau « Rédaction » (Non rédigé / En cours / Signé le) est retenu
  dans `d.authentic.pret` (jamais appliqué à la vente) ; **en cours ou signé → la tâche « Rédiger l'acte de prêt » tombe** (même règle que l'acte de vente) ; état affiché sur la
  ligne « Acte de prêt » du bloc « Offre de prêt » de l'onglet Fonds. **Non vérifié sur une vraie page** (points `pret-authentic-sous-dossier`, `dod-email`) ; le badge de statut du
  sous-dossier (« Préparation définitive »…) n'est pas lu.
- **Pièces du dossier** : reconnues **par le nom de fichier seulement** (`motifNom` +
  formes tolérantes `FORMES_NOM_PIECES`), jamais par le contenu (le compromis cite toutes les pièces).
  **Liste des noms reconnus** : `EXEMPLES_NOMS_PIECES` (Réglages › Pièces et Claire Scan), vérifiée par
  `tests/noms-reconnus.test.js` — tout changement de `motifNom`/`FORMES_NOM_PIECES` s'y reflète. « Titre de séjour » n'est
  jamais un titre de propriété.
  **Formes de noms apprises** (étude 03/10, **Réglages › Noms de fichiers du NAS** — rubrique `noms-nas` sous « Dossiers et actes », sortie des Outils le même jour ; `definirOnglet('noms-nas')` y mène —, `server/src/nomsFichiersNas.js`) : l'étude
  dit oui/non à une FORME de nom (`formeNomFichier` : mots d'usage gardés, nombre `#`, nom propre et adresse `…`) pour une
  pièce ; `decisionFormePourNom` passe avant les motifs dans `correspondancePieceNom`/`nomDitOffrePret` (« non » écarte même
  un nom que le motif prend, « oui » fait reconnaître ; entre deux formes qui se contredisent, la plus récente l'emporte, 05/10). Termes élargis (`TERMES_ELARGIS_PIECES`) **pour l'outil seulement**
  (ils proposent, ne cochent jamais) ; noms du commun gardés en mémoire du serveur seulement ; formes décidées dans le rapport
  technique → à reporter dans `motifNom`/`FORMES_NOM_PIECES` (et `EXEMPLES_NOMS_PIECES`).
  **Avant-contrat retrouvé sur le NAS** (`choisirAvantContratNas`) : jamais un nom qui dit « projet »/« relecture » (projet d'acte),
  ni un nom qui porte un autre dossier ou une autre personne (vente préalable) — `raisonExclusionAvantContrat`,
  `contexteNomsAvantContrat` (noms des autres dossiers de CLAIRE, mots en capitales hors parties, adresse, notaires et mots d'usage
  `MOTS_NON_NOMS_AVANT_CONTRAT`) ; le fichier choisi à la main ou lu à la création n'y est pas soumis (étude 05/10).
  Une pièce validée à la main (`piecesValideesManuellement`) n'est jamais repassée en manquante.
  Une exclusion (« Réinitialiser ») est globale et stockée en base — elle est la première cause
  d'une pièce « jamais reconnue » malgré un nom correct.
  **Notification d'une pièce trouvée : une seule fois** par dossier + pièce + fichier (registre
  serveur `pieces-notifiees`, 30 jours, `dedoublonnerPieces` dans `routes/notifications.js`) ; une
  seule vérification NAS à la fois par dossier et par fenêtre (`verificationsDossierEnCours`).
- **Onglets de la fiche** (étude 05/10, refonte 10/10, `client/57-fiche-tableau.js`) : fiche toujours ouverte en grand (plus de colonne de droite ni de bouton Agrandir) ; en-tête avec **les initiales seules** du responsable, bandeau (pièces, signature, geste du moment : `bandeauFiche`) et suivi des étapes en bande ; **Tableau** (`cartesTableauFiche` : À obtenir · À faire · En attente · Fait, vue CALCULÉE — chaque case appelle le geste d'avant, jamais d'état propre ; **crayon et croix sur la date d'une carte d'échéance** (étude 13/10, `dateModifiableCarteFiche` : prêt, vente préalable, butoir, rendez-vous, dates d'envoi, échéances ajoutées — jamais SAFER/DIA/rédaction ; même voie que la liste, `enregistrerDateEcheanceSaisie`, `supprimerDateEcheance`/`supprimerEcheanceAutre`) ; l'ancien contenu d'Échéances reste sous « Toutes les échéances, dates et rappels ») · **Dossier** (`renderProprietesDossier` : parties, bien, notaires, NAS) · **Pièces et analyse** (checklist puis analyse de l'avant-contrat ; « Analyse » seule en participation) · **Fonds** (`renderFondsDossier` : provision, appel de fonds, fonds reçus et confirmation, relance, RIB — `CLES_ECHANGES_FONDS`, sortis d'Échanges ; absent en succession) ; **bloc « Offre de prêt »** en tête de l'onglet Fonds (étude 08/10, `rappelOffrePretFonds`/`renderRappelOffrePretFonds` : reçue / à confirmer / pas encore reçue, date butoir et J-n tant qu'elle n'est pas reçue — rouge une fois dépassée —, montant du prêt, garanties `garantiesPretAffichees` ; rien sans prêt ni en succession) · Échanges · Historique ; **à droite du Tableau, la préemption seule** (étude 13/10 : « uniquement les dates d'échéance du droit de préemption urbain et de la SAFER » — `renderPreemptionTableauFiche` : lignes « Réponse à la DIA » et « Délai SAFER » de `lignesPreemptionFiche` (les mêmes que la liste des échéances), sinon l'état en un mot — non applicable, renonciation reçue, DIA pas encore envoyée, non-préemption, pas de notification ; rien en participation ni en succession ; sous le tableau sous 1 500 px ou dans une fiche à côté de moins de 1 400 px ; « Toutes les échéances » reste replié sous le tableau).
- **Fiche d'une vente, présentation du 20/10** (0.297.1, étude : « les pièces sur trois colonnes ; dossier : responsable et ce qui suit sur deux colonnes ; les outils dessous, plus en avant ») : onglet Pièces = `.pieces-liste.pieces-3col` (trois colonnes, deux sous 1 100 px ou en fiche à côté, une sous 560 px ; la succession garde deux colonnes) ; onglet Dossier = à droite `.fiche-droite-colonnes` (dossier et prix à gauche, notaires à droite ; une colonne sous 1 440 px ou en fiche à côté) puis `.fiche-outils-bloc` pleine largeur de la colonne (« Constitution de dossier » + les outils, boutons de 40 px) ; la colonne des parties passe à 4/11 de la largeur (`fiche-dossier-vente`).
- **Onglets de travail et fiche en page** (étude 11/10, 0.211.0, `client/60-onglets-travail.js`) : chaque fiche ouverte et chaque
  écran ouvert sauf le tableau de bord (`OUTILS_ONGLETS_TRAVAIL` : outils, Suivi, Agenda, Nouveau dossier, Claire Scan, Demander à
  CLAIRE, Réglages — étude 12/10) devient un onglet en haut de `<main>` (× / clic molette, glisser, 12 au plus, gardés par
  poste) ; la barre latérale n'en crée pas. La fiche s'affiche **en page** (`body.fiche-en-page`, plus de tiroir sur fond grisé) ;
  `definirOnglet` ferme la fiche affichée — **un chemin qui change d'écran puis ouvre une fiche appelle `definirOnglet` AVANT
  `ouvrirDossierDrawer`**. Un nouvel écran-outil s'ajoute à `OUTILS_ONGLETS_TRAVAIL` et `ICONES_ONGLETS_OUTILS`. **Un raccourci clavier d'écran teste `ecranAffiche(nom)`**, jamais `ongletActuel` seul (il agirait derrière la fiche) ; **toute barre collante** : `top: calc(Npx + var(--decalage-onglets))`. **Fiche à côté** (0.212.0) : « Ouvrir à côté » l'ancre à droite de l'écran courant (`body.fiche-a-cote`, `ficheACoteActive()`, fenêtre ≥ 1 100 px et 1 024 px de place), séparation à tirer, « Plein écran » ; `definirOnglet` ne la ferme pas ; un raccourci d'écran ne joue pas après un geste dans le volet (`focusDansFicheCote`, inclus dans `ecranAffiche`).
- **Analyse de l'avant-contrat dans la fiche** (étude, 02/10 ; onglet « Pièces et analyse » depuis le 05/10) : chaque engagement du vendeur (`e.fait`, `faitLe`) et chaque
  document relevé (`doc.recu`, `recuLe`) se coche réalisé/reçu ; non coché → compté dans `piecesAttenduesDossier`
  (« Attente de pièces », libellé « Engagement : … » par `libelleCourtEngagement`) et dans
  `probabiliteTenueSignature` (facteur « engagement(s) du vendeur non réalisé(s) », « Relancer le vendeur ») ; jamais
  pour une participation (`elementsAnalyseEnAttente`). Un document qui est une pièce de la checklist
  (`cleChecklistDocumentAnalyse`) partage la case de l'onglet Pièces (validation à la main) et n'est compté qu'une
  fois ; un engagement dont toutes les pièces sont reçues est réalisé de lui-même (`etatEngagementAnalyse`, case
  grisée) ; cocher un engagement valide à la main les pièces de la checklist qu'il fait réclamer (`e.piecesValidees`,
  rendues au décochage). Notification Teams « dossier complet » seulement si l'analyse ne laisse rien en attente.
- **Personnes et situation matrimoniale** (étude 05/10, « pas homme ou femme : Monsieur prénom nom, Madame prénom nom, ou deux
  hommes, deux femmes ») : lignes « Vendeurs » / « Acquéreurs » de la fiche (`renderPersonnesCoteFiche`) — chaque partie
  « [Monsieur|Madame] Prénom NOM » (`p.civilite` 'M'/'Mme', `p.nom` ; `changerPersonneDossier`, « + Personne »
  `ajouterPersonneDossier`) et, dès deux personnes, la situation du couple (`SITUATIONS_CLIENT` : marié, pacsé, concubins ;
  `d.situationVendeur`/`d.situationAcquereur` ; **remplie seule d'après les fiches client d'Authentic** (étude 07/10, `appliquerSituationsAuthentic`, Authentic d'abord comme l'identité ; marié/pacsé seulement si le conjoint nommé est l'autre personne, `situationClientDeduite`), jamais d'un
  prénom ; la civilité aussi, à la lecture d'une fiche client comme au complément depuis Authentic). Courrier d'appel de fonds (`lignesDestinatairesAppelFonds`, `salutationAppelFonds`) : marié Monsieur + Madame
  « Monsieur et Madame DUPONT » (nom du mari seul, sans prénom, même si Madame porte un autre nom — étude 24/10) ; sinon chacun nommé avec sa civilité, Monsieur d'abord (« Monsieur Paul DUPONT et Madame
  Léa MARTIN », « Monsieur … et Monsieur … ») ; formule selon les civilités (« Chers Monsieur et Madame, », « Chers Messieurs, »,
  « Chères Mesdames, »).
  **Société** (étude 08/10 : « prévoir la situation quand il s'agit d'une société, vendeur ou acquéreur ») : « Société » dans la
  liste des civilités et « + Société » (`p.qualitePersonne = 'morale'`, raison sociale, ni civilité ni situation de couple) ; une
  forme juridique tapée en tête (SCI, SARL, SAS…) ou « société / commune de … » la pose seule (`nomDitSociete`), un nom sans forme
  (« 3F ») se choisit dans la liste. **Une personne n'est jamais deux fois du même côté** (étude 08/10, « Madame Ursula DOYLE » deux
  fois : `memePartieComplement` ne comparait pas le prénom porté à part) : `dedoublonnerPartiesDossier` (même nom complet, prénom
  compris, mots dans n'importe quel ordre ; jamais deux dates de naissance différentes) à chaque `sauvegarder` et au démarrage.
- **Dépôt de garantie** : toujours déduit de l'appel de fonds (l'agence reverse la somme) ; le
  détenteur dit seulement quoi réclamer.
- **Fonds reçus** (reçus comptables du NAS) : le client est le **titulaire** en début de ligne, et
  seulement le premier nommé d'un compte à deux noms, sauf si la référence de la vente
  (« VTE VENDEUR/ACQUÉREUR ») cite le vendeur du dossier ; une référence qui ne nomme personne du
  dossier écarte l'écriture. Reçus **gardés en mémoire** : les fichiers sont supprimés du commun une fois traités, un versement déjà
  retenu dont le fichier n'est plus relu reste compté (`fusionnerRecusMemorises`, `memorise`), retrait
  à la main seulement. Complet = montant attendu **à 2 € près** (étude 05/10, 50 € avant ; `MARGE_FONDS_RECUS`, `bilanFondsRecus`
  dans `commun/montants.js`, le serveur l'importe sous le nom `bilanFonds`) ; au-delà, « excédent » à vérifier, jamais « complet ». **Montant attendu = la dernière ligne « Solde à verser » du courrier** (étude 09/10, `soldeAVerserDansTexte`, tolérante à l'OCR d'un scan), jamais un « Soit au total » plus haut. Noms cherchés :
  parties acquéreurs (et leur `nomUsage`, lu dans l'état civil « Veuve/Épouse de Monsieur … NOM » par
  `nomsUsageDansBloc`) + nom du dossier + nom du courrier d'appel de fonds + `d.nomsRecus`.
- **Compromis d'agence (étude 08/10, compromis réel scanné)** : source des honoraires cherchée À PARTIR de leur clause
  (`sourcePourValeur(…, depuis)` — le capital social de l'agence avait le même montant, page 3) ; une adresse email précédée de
  près d'un mot qui présente l'agence (`emailsAgenceDansTexte`, « concours de », « exploitée par », « courriel en ce sens »…)
  n'est l'email d'aucune partie, partout dans l'acte ; sans « Adresse des biens » ni trame d'office, l'adresse du bien est celle
  de la ligne d'une parcelle cadastrale (`adresseLigneCadastrale` : « 000 DZ 187 25 CHEMIN … 41350 VINEUIL 12a 22ca », code
  postal retrouvé ailleurs pour la même voie s'il manque) avant toute autre adresse.
- **Honoraires d'agence TTC** (étude 03/10, `detecterHonorairesAgenceTTC`) : montant marqué TTC / TVA incluse (jamais HT)
  près de « négocié(e)s par » ou d'un intitulé honoraires/commission de l'agence → champ `f-honoraires-agence` (panneau
  Vérifier, complément) → `d.honoraires.montantTTC` (`honorairesAvecMontantFormulaire`, le champ fait foi).
- **Honoraires de négociation / fonds de travaux** (lus dans l'avant-contrat, 29/09) : honoraires
  seulement depuis une tournure « négocié(e)s par … » (jamais les honoraires du notaire pour la
  promesse ; « négociation directe » = aucun) ; fonds de travaux seulement sur une phrase qui tranche
  le remboursement. À la charge de l'acquéreur / remboursé → ligne au débit de l'appel de fonds.
- **Appel de fonds** : établi par l'office, ou repris du décompte du confrère quand l'étude est en
  participation — **retrouvé seul sur le NAS au choix du dossier** (étude 05/10, `reprendreDecompteConfrereNas`,
  `candidatsDecompteConfrereNas`). **Deux décomptes distincts** : celui du **confrère** (sert à compléter le nôtre, « souvent dans
  un dossier Projet VENTE confrère » — sous-dossier dont le nom contient « confrère », `RE_DOSSIER_CONFRERE`) et celui de
  l'**étude** (mis en forme, envoyé au client, enregistré à la **racine**, rattaché à « Envoi appel de fonds »,
  `courrierAppelFondsDossier`, lu par les fonds reçus et l'agenda). Le premier n'est jamais cherché à la racine ni dans le
  courrier rattaché ou produit par CLAIRE — sauf un PDF de la racine dont le **nom dit le confrère** ; ordre : dossier du confrère
  (nom décompte d'abord), puis autres sous-dossiers par le nom ; le premier tableau lisible remplace le décompte. **Par le nom du
  fichier** (étude 06/10 : « ne pas rattacher le décompte du confrère mais bien le nôtre » ; `commun/decompte.js`,
  `nomDitDecompteConfrere` : « confrère », « consœur », « Me X », « Maître », « notaire » ; `nomDitCourrierClaireAppelFonds`) : un
  décompte du confrère n'est jamais rattaché à « Envoi appel de fonds » ni lu comme notre courrier (fiche, fonds reçus, tour du
  NAS `fichierAppelFondsRacine`), le courrier écrit par CLAIRE passe avant « Décompte acquéreur » ; un décompte du confrère
  rattaché par erreur est ignoré par la fiche et détaché par le serveur (`courrierAppelFondsARattacher` rend ''). **Pièces du dossier lues seules** quand l'office établit le décompte
  (étude 06/10, `reprendrePiecesNasAppelFonds`, `fichierPieceNasAppelFonds`) : avis de taxe foncière et, en copropriété, état daté —
  fichier retrouvé par la checklist (`fichierTrouve`), sinon le plus récent dont le nom dit la pièce —, lus par les mêmes lecteurs
  qu'un dépôt, jamais par-dessus une pièce déposée ; les pièces d'un autre dossier sont oubliées au changement de dossier. Prêt hypothécaire : montant du prêt **déduit**, frais de garantie **appelés au
  débit**. Taxe foncière : montant lu en page 1 (« Montant de vos taxes foncières », jamais la
  « somme à prélever ») et contrôlé en bas à droite de la page 2 (entier nu possible) ; avis sur
  plusieurs biens (lus en page 2 par position, `biensAvisTaxeFonciere`) → **le bien vendu est demandé**
  (présélectionné si l'adresse du dossier le désigne) et les **frais de gestion de la fiscalité directe
  locale** (impôt − somme des biens) sont répartis par produit en croix au prorata de la TF de chaque
  bien, ajoutés au bien vendu (étude, 30/09 — plus la TEOM) ; pièces déposables par glisser-déposer,
  type reconnu sur la page 1 (`deposerPiecesOutil`) ; prorata acquéreur du jour de l'acte au 31/12. **Pièces lues sur exemples réels (30/09,
  `tests/pieces-appel-fonds.test.js`)** : appel de charges du syndic (`analyserAppelCharges` :
  période « du … au … », « Montant de l'appel » avant « Total à payer », montants à point décimal
  `montantSyndicDepuisTexte`) → prorata de charges du jour de l'acte à la fin de la période, **hors
  cotisation au fonds de travaux** (attachée au lot, réglée par l'avant-contrat — case décochable,
  règle à confirmer par l'étude) ; état daté (`fondsTravauxDepuisEtatDate` : rubrique B12 « part
  dudit fonds rattachée au lot », « fonds travaux attachés aux lots vendus », « montant du fonds
  ALUR », « pas de fonds ALUR » ; jamais la cotisation exigible ni l'avance d'exercice) → ligne
  « Remboursement du fonds de travaux » seulement si `d.fondsTravaux.rembourse !== false` ; relevé
  de compte client JurisWeb (`analyserReleveCompteClient`, colonne Débit/Crédit par position des
  items) → acomptes sur prix et sur frais versés à l'étude, qui **remplacent** la ligne d'acompte du
  dossier (même somme), reversements au confrère signalés. Rien n'est enregistré sur le dossier.
- **Mise en page du courrier d'appel de fonds (.docx)** (étude 05/10 et 06/10) : les retours d'aération sont **dans le modèle Word** (`appel-de-fonds-modele.js`, `docxB64`, régénéré par un script qui réécrit `word/document.xml` puis le base64) — paragraphe vide avant `{addrLines}`, cinq `<w:br/>` sous l'adresse, deux sous « {ville}, le {dateLettre} » ; la mention « Envoi par e-mail uniquement » a son propre champ `{mention}` en italique (`{#mention}<w:br/>…{/mention}`) : `donneesCourrierAppelFonds` rend `addrLines` (lignes du destinataire seules) et `mention` ; un courrier gardé avant passe par `normaliserDonneesCourrierAppelFonds` (mention et retours retirés d'`addrLines`) pour être refait à l'identique. LibreOffice ne charge rien ici : le rendu papier se regarde au bureau.
- **Outil Appel de fonds depuis un dossier** (audit 07/10, `prefillAppelFonds(d, categoriesRdv)`) : date, **heure** et **lieu** du rendez-vous repris de la fiche (`lieuAppelFondsDossier` : visio, office du confrère nommé, sinon en l'étude — même règle que les emails) ; un champ que le nouveau dossier laisse vide ne garde jamais la valeur du dossier précédent ; l'email du courrier parti de CLAIRE **coche « Envoi appel de fonds »** (`marquerEnvoiAujourdhui`, comme le projet). Outil Quotités : frais et droits de l'acte = le montant du décompte (`fraisActeEstimesAppelFonds`, même barème).
- **Ordre des lignes du décompte** (étude 08/10 : « faire remonter une ligne ou la descendre ») : flèches ↑/↓ à droite du libellé, au survol de la ligne (toujours sur écran tactile), `deplacerLigneAppelFonds` / `deplacerElementListe` ; hors du texte du courrier (`contenteditable="false"`, le .docx ne lit que les `.af-champ`), un double-clic sur une flèche ne supprime pas la ligne.
- **Tampon et signature du courrier d'appel de fonds** (étude 09/10 : « la signature doit aller devant le tampon, les deux en transparent sans fond », sur **tous** les courriers) : tampon de l'office (`docs/assets/tampon-gossart.png`) et signature « p/o » de Bastien (`docs/assets/signature-anglument-po.png`), PNG à couche alpha, posés dans le modèle Word sous « Me {notaire} » (`word/media/image6.png`/`image7.png`, rId25/rId26, ancrés sans habillage, signature devant — `relativeHeight` plus haut —, paragraphe de hauteur exacte gardé avec « Me … » par `keepNext`) et dans l'aperçu (`assets.tampon`/`assets.signature`, `.af-tampon-signature`). L'ancienne `signature-anglument.png` n'est pas utilisée.
- **Courrier d'appel de fonds en PDF/A-2U** (étude 09/10 : « Conformité Norme : PDF/A-2B, Nom ISO : ISO 19005-2 » exigée par Authentic, puis « passe en 2U » — un 2U est aussi un 2B valide ; 2A impossible : pdf-lib ne balise pas un PDF ; signature numérique PAdES proposée et écartée par l'étude, « reste comme ça » ; `client/56-courrier-pdfa.js`) : bouton « PDF/A pour Authentic » de l'outil et « PDF/A » dans « Courriers créés » — le même courrier que le .docx (mêmes données, textes du modèle mot pour mot dans `blocsCourrierPdfA`, vérifié par `tests/courrier-pdfa.test.js` qui relit le modèle) **composé dans le navigateur** par pdf-lib 1.17.1 + @pdf-lib/fontkit 1.1.1 (jsdelivr ; un .docx ne se convertit pas sans Word ni LibreOffice). Polices EMBARQUÉES servies par le serveur (`vendor/polices/courrier/` : Liberation Serif = Times, Carlito = Calibri, fichiers d'origine OFL, déclarés dans les deux listes d'assets) — **Carlito embarquée entière** (le découpage de pdf-lib y perd des glyphes) et **ligatures coupées** (« ti » mal espacé) ; glyphe absent → remplacé (`texteImprimablePdfA`, jamais « .notdef ») ; XMP `pdfaid` 2/U = Info (`xmpPdfA`) ; profil sRGB en OutputIntent ; `/ID` du trailer. Contrôlé **conforme par veraPDF** (profils 2U et 2B) le 09/10 ; ≈ 880 Ko. Toute retouche du modèle Word (texte, position) se reporte dans `blocsCourrierPdfA` / les constantes `*_PDFA`. L'email du courrier reste en .docx. Point terrain `courrier-pdfa-authentic`.
- **Lignes du courrier reprises d'un décompte** : jamais de tiret ni de réserve « à parfaire » (« sauf à parfaire », « à parfaire
  ou à diminuer », entre parenthèses ou non) — `afNettoyerLibelle` (étude 06/10).
- **Historique des courriers d'appel de fonds** (étude 06/10 : « pour les retrouver » ; `client/43-historique-appels-fonds.js`,
  `server/src/appelsFonds.js`, `routes/appelsFonds.js`, clé `appels-fonds`, 1 000 au plus) : tout courrier téléchargé ou envoyé
  par email depuis l'outil est gardé **tel qu'il est sorti** (`donnees` = champs du modèle Word, corrections de l'aperçu comprises)
  avec l'état de l'outil (`etat`) et ses gestes (téléchargé / email préparé / envoyé, par qui) ; « Courriers créés » dans l'outil
  (recherche dossier/client/auteur) et l'onglet Fonds de la fiche : « Télécharger » refait le même .docx
  (`genererBlobAppelFonds(donnees, nom)`), « Modifier » (étude 06/10 : « les remodifier ») reprend le courrier dans l'outil tel
  qu'il est sorti — état de l'outil, puis textes retouchés de l'aperçu (`CHAMPS_APERCU_APPEL_FONDS`) — ; « Enregistrer les
  modifications » (geste `modifie`, sans téléchargement), un nouveau téléchargement ou l'email mettent à jour la même ligne
  (`afHistoriqueId`, oublié à « Effacer », au choix d'un dossier ou d'un autre dossier relié). La liste ne rend que des résumés,
  le courrier est relu à la demande (`GET /api/appels-fonds/:id`).
- **Présentation des outils** (étude 06/10 : « claire comme dans création de dossier, Web Awesome, facile, que l'on s'y
  repère » ; puis « non, tous sur le même écran ») — appel de fonds, quotités, provision, prorata, forfait mobilier :
  **un seul écran, jamais d'étapes à « Suivant »**. En tête, barre d'étapes `wa-stepper` collée en haut au défilement
  (`client/44-presentation-outils.js`, `ETAPES_OUTILS` : clé, libellé court, `fait` → coche ; `.outil-sommaire-place[data-outil]`),
  qui suit le défilement (`etapeCouranteOutil`) et mène à la section au clic ; chaque section a un titre
  `h2.outil-section-tete[data-etape]` numéroté comme son étape (`.outil-num`) ; explications longues dans un
  `wa-details.outil-notes` replié. **Pièces à lire** (appel de fonds, prorata ; étude 06/10 « revoir les boutons ») : une tuile
  par pièce dans une zone de dépôt (`renderTuilesPieces`, `TUILES_PIECES_OUTILS`, `etatTuilePiece` : à choisir / « Lu · montant » /
  illisible), clic = choisir le PDF, glisser sur une tuile = la lire comme cette pièce. Un nouvel outil de ce genre : ses étapes dans `ETAPES_OUTILS`, ses titres de section, la place
  de la barre. Composants Web Awesome embarqués : button, switch, button-group, stepper, step, details.
- **Un nouveau dossier se crée TOUJOURS depuis Authentic** (étude 18/10 : « pas de formulaire à remplir à la main ») : plus de « Continuer sans Authentic » ; `ajouterDossier` refuse sans dossier d'Authentic repris (`exportAuthenticActuel`) — le compromis seul complète. Ce qui suit sur « Continuer sans Authentic » est l'histoire.
- **Une page d'Authentic ne va jamais à un dossier deviné** (étude 19/10, 0.292.0) : appliquée seule seulement au dossier de sa référence
  retenue ou d'un intitulé rangé là (à la main, ou à la création depuis Authentic) — `dossierSurAuthentic`, `contexteSurAuthentic` (onglet
  actif) ; retrouvée par les noms seulement → « est-ce bien ce dossier ? » d'un clic (`pageAConfirmerAuthentic`, état `a-confirmer`), réponse
  retenue. Ce qui suit plus bas sur le score par les noms décrit la PROPOSITION, plus le rangement. Tout ce qui vient d'Authentic se voit dans
  le panneau « Authentic » de l'onglet Dossier (client/89).
- **Rendez-vous chez un confrère (couleur orange) = deux « Trajet - N km » d'une demi-heure avant et après** (étude 20/10, `commun/trajets.js`, `server/src/trajetsAgenda.js`) : posés, déplacés et retirés par le serveur avec le rendez-vous (clé `trajets-agenda`), km par la route d'après l'IGN entre les deux offices de l'annuaire (jamais devinés) ; jamais comptés dans les 6 rendez-vous d'une journée (`rendezVousHorairesJour`), toujours occupés pour les créneaux proposés.
- **Couleur d'un droit de préemption, partout où il s'affiche** (étude 18/10) : rouge = à notifier/à purger, orange = à vérifier, vert = pas besoin. **Titre d'une succession = « SUCC - NOM Prénom du défunt »** (`prenomDefuntDossier`). **Plan cadastral de la Constitution : celui déjà rangé sur le NAS d'abord** (`cheminPlanNasConstitution`).
- **« Nouveau dossier » : deux entrées** (étude, 02/10 au soir, `MODES_IMPORT`, `choisirModeImport`,
  `renderChoixImport`) — **aucune présélectionnée** (étude 08/10 : « il ne propose pas tout de suite avec ou sans PDF » : `modeImport` vide au départ, après « Annuler » et après chaque création — deux cartes seules, zone de dépôt et « Suivant » masqués jusqu'au choix) — **« Compromis (PDF) »** : le compromis lu, on reste sur l'étape 1 — le dossier d'Authentic qui correspond est proposé en tête (« Dossier trouvé dans Authentic », `dossierAuthenticPourCompromis`, étude 05/10 : Authentic pré-remplit, prix compris, le compromis complète) : « Compléter depuis Authentic
  (facultatif) » (`groupesAuthenticPourCompromis` : le dossier du compromis en tête, « Correspond au compromis ») ou
  « Continuer sans Authentic → » (`majBoutonSuivantEtape1`) ; **« Depuis Authentic »** (`seul`, sans PDF) : repris d'un
  clic puis « Vérifier » (vente : aucune date exigée) ou directement « Finaliser » (succession, assistant réduit
  `#panel.wizard-succession` : nom, bien, responsable, pièces d'Authentic — `.vente-seul` masqués). L'ancienne entrée
  « Dossier Authentic » (Authentic puis le compromis) est retirée. **Un seul dossier par création** (étude 02/10) : `creationDossierEnCours` (bouton « Enregistrement… »), confirmation si un dossier en cours a le même nom ou la même référence Authentic (`dossierDejaPresentPourCreation`). **Trois étapes** (étude 02/10 au soir : « mets l'étape 2 et 3 ensemble, les données de la 4 dans la 2, une étape pour
  terminer et valider ») : **Importer · Vérifier · Valider**. **« Annuler » à chaque étape** (étude 06/10, `annulerNouveauDossier` : tout oublier et revenir à Importer, confirmé si quelque chose a été lu). Vérifier = panneau des données pré-remplies (**champs non trouvés toujours affichés** dans le groupe « À compléter », étude 03/10 ; cases à valider,
  source en une ligne, page du document à un clic — **qui surligne en jaune ce qui a été trouvé, sans cadre** (étude 06/10, `client/48-surlignage-pdf.js`, aussi pour engagements, dates et citations de la Relecture d'actes) —, jamais méthode ni extrait), **type de vente, responsable, notaires, notaire qui reçoit l'acte et
  rôle aussi dans le panneau** (étude 02/10 au soir ; `formulaire: true` dans `CHAMPS_REVISION` : valeur lue dans le champ, source suivie
  par `originesDossierWizard` — acte, Authentic, « Déduit des notaires », « Par défaut », à la main ; un choix à la main n'est jamais
  remplacé, `choixManuelDossierWizard`), puis la case « pièces d'Authentic » (champs doublant le panneau masqués,
  `#panel.avec-revision .revision-double`), bloc
  « Avant-contrat » à plat (engagements **en entier**, étude 02/10 au soir, page à un clic ;
  documents identifiés). « Échéances et dates du document » **retiré** (étude 02/10 au soir, doublon ; `details.wizard-plus`
  gardé masqué pour le code) : vente préalable toujours visible dans le panneau (`CLES_REVISION_TOUJOURS_VISIBLES`, une date
  saisie active l'échéance, vidée la retire), case « Sans prêt » sur la ligne du prêt (`basculerSansPretRevision`) ;
  échéances personnalisées et reclassement des dates repérées : sur la fiche, plus à la création. Valider = récapitulatif
  (`lignesRecapWizard`, `renderRecapWizard` : vide = « À compléter », données non validées signalées) + « Ajouter le dossier ».
  Succession : Vérifier réduit (panneau, avant-contrat et échéances masqués). **Pièces de base et choix des rappels plus
  montrés à la création** (`#pieces-apercu`, `#rappel-fieldset` masqués, rappels par défaut J-15/J-7 appliqués) ; sous-titres
  du bandeau seulement s'ils disent un état ; encadré « Ce que CLAIRE repère » retiré dès l'étape 2 (`body.wizard-avance`).
  Notaires à la création : lus dans l'acte seulement, pris au répertoire (`notairesProposesWizard`) — **le notaire n'est JAMAIS
  repris d'Authentic** (étude 07/10 : « ne plus récupérer le notaire de Authentic » ; retirés : notaire des « Parties prenantes »,
  notaires déduits du flux, placement par défaut des deux côtés du 02/10) ; placés d'un clic (vendeur, acquéreur, les deux), « Notaire qui reçoit l'acte » (`f-cote-instrumentaire`), rôle de l'étude déduit
  (`roleEtudeDeduitWizard`). **Un notaire de l'acte cité sans son côté reste vide (jamais deviné) mais n'est plus caché** : fiche
  « Lus, à placer » (`notairesNonPlacesDossier`, `placerNotaireFiche`) au lieu d'une ligne repliée.
  **Compléter un dossier avec le compromis** (étude 03/10 : Authentic crée le dossier, le compromis le complète — mode
  complément du même wizard, `complementDossierId`) : fiche › « Avant-contrat » › « Compléter » (dossier sans compromis lu,
  non archivé, pas une succession ; compromis du NAS proposé, « Lire » = `lireCompromisNasPourComplement`, jamais lu seul) ou
  doublon de « Nouveau dossier » → « Compléter le dossier » / « Créer quand même » (`demanderConfirmation` avec
  `options.autre`). Vérifier = bloc « Déjà sur la fiche » (`comparaisonComplement`, `resolutionComplement`) : **la fiche gagne
  toujours sauf choix « Compromis » sur la ligne** — **jamais pour une valeur venue d'Authentic** (07/10, `clesComplementAuthentic` : adresse, prix, type, nom si les parties en viennent, emails d'un côté repris d'Authentic → état `authentic`, « Fiche gardée : vient d'Authentic » ; téléphones d'un côté repris d'Authentic jamais complétés par le compromis, `contactRetenuAuthentic`), emails fusionnés, vides remplis ; `appliquerComplementSurDossier` ne touche
  ni aux parties ni au bien déjà posés ; Valider = récap avant → après, « Compléter le dossier » (`completerDossierDepuisWizard`,
  historique « Complété avec le compromis »). Point terrain `complement-compromis-nas`.
- **Données d'un dossier Authentic** (format commun `{ intitule, personnes, immeubles, parties, documents,
  infosAuthentic }`, construit depuis les pages relevées par `dossiersDepuisRelevesAuthentic`) : parties par
  l'intitulé « VTE VENDEUR / ACQUÉREUR » (une personne absente de l'intitulé n'est pas partie) ; les données
  structurées priment sur le texte (`completerExtractionDepuisAuthentic`, origine « Reprise d'Authentic ») ; pièces
  reconnues par nom → reçues « à la main ». **L'import d'un export ZIP (30/09) est retiré depuis le 02/10** (étude :
  la lecture d'Authentic le remplace ; un .zip déposé est refusé avec un message) — perdu par rapport au ZIP : les
  fichiers eux-mêmes (avant-contrat signé lu sans dépôt du compromis, PDF des pièces, Word de l'acte en cours), les
  qualités Disposant/Bénéficiaire du flux, le notaire de chaque partie et son rôle (participation), la date de création
  du dossier Authentic, la surface habitable.
- **Email du confrère sur la fiche** : `d.emailNotaireParticipant` (office qui représente l'acquéreur) et, depuis le 03/10,
  `d.emailConfrereVendeur` (office qui représente le vendeur) — relevés dans les emails des dossiers (`contexteClassement`),
  sondage de créneaux, `expediteurConfrere` ; à défaut l'email de l'office dans l'annuaire.
- **Successions** (étude 02/10 : « juste des parties et éventuellement des biens ») : intitulé « N - Succession NOM »
  (ou « SUCC NOM », **forme supposée, à confirmer sur une vraie page**) reconnu par le poste
  (`RE_INTITULE_DOSSIER_AUTHENTIC`, `RE_INTITULE_SUCCESSION_AUTHENTIC`), le serveur (`pageAuthenticConnue`) et
  l'extension (0.3.4) ; rapproché par le nom (`scoreDossierAuthentic` : identique 6, proche 4, dossiers de succession
  seulement). **Jamais « Importer avec 6e SENS » dans un intitulé** (étude 06/10, bouton d'Authentic collé au titre de l'onglet :
  `sansImporterAuthentic` dans `intituleVenteNormalise`, noms existants nettoyés au démarrage par `retirerImporterAuthentic`). Dossier `typeAffaire: 'succession'`, `sansPret`, `parties` = toutes les personnes ouvertes (rôle
  `PARTIE`, qualité jamais devinée, téléphones/emails gardés — reconnus par 3CX), `biens` (`biensDepuisAuthentic` :
  adresse, type, parcelles). **`estSuccession(d)`** neutralise la vente : planning = signature placée + échéances
  ajoutées (même code pour le serveur, `commun/planning.js`), checklist = pièces personnalisées seules, pas de préemption ni de
  créneaux proposés ni d'emails de vente, fiche = responsable, NAS, parties, biens. Planning et checklist propres aux
  successions : à définir avec l'étude. **Structure réelle d'une page de succession reçue le 05/10** (copie de structure, `docs/historique.md`) : intitulé « N - … veuve de … » (le défunt en tête, pas « VTE X / Y »), rubriques Comparants (héritiers : « veuve de », « épouse de », « divorcé de », « époux de »), Immeubles (« Immeuble commun »), onglets Formalités préalables / Actes / Formalités postérieures, tableaux **Courrier**, **Demande** (banque, sécurité sociale, retraite… avec « Mail le JJ/MM/AAAA »), **Etat civil** (« Envoyé », « Réponse positive »), réquisitions, **Rédaction** (« Non rédigé ») — **non lue** : à brancher seulement sur demande de l'étude. **Structures reçues le 15/10 « à garder pour l'ajout des successions »** (`docs/historique.md`, entrée « Structures de succession ») : page du dossier (état « Demande de pièces », tableaux Banque / Courrier / Demande / Etat civil / Mails-courriers à retour / Rédaction), fiche du **défunt** (case « Personne décédée » + date, lieu et pays de décès ; régime matrimonial et historique des relations), fiche d'un **héritier** (même gabarit, décès vide, téléphone et email renseignés), fiche **bien** (identique à celle d'une vente) — toujours non lues, à brancher sur demande.
- **Classeur des scans du copieur** — nom affiché **« Claire Scan »**, **bannette à papier** (icône `bannette`, `#tab-scans`) avec pastille du nombre de scans à ranger, dans la rangée d'icônes sous le logo de la barre latérale (étude, 30/09 — visible barre repliée et sur téléphone) (30/09, `TYPES_SCAN`, `propositionScan`, `server/src/scans.js`) :
  **Mémoire, lot, doublons, annulation** (étude 20/10, 0.301.0, `commun/scans-memoire.js`, `client/95-scan-memoire.js`, `server/src/scansTextes.js`) : un rangement fait à la main apprend (type de pièce par l'empreinte du haut de la page 1, dossier par les numéros de contrat/prêt/avis/IBAN ou la référence d'Authentic — clé `scans-memoire`, jamais d'IA) ; texte des scans rangés cherchable (FTS5, serveur du bureau) ; doublon par SHA-256 = jamais rangé seul ; « Remettre dans Scan » défait un rangement (original gardé dans « Annulés ») ; rangement en lot. Tout changement de la reconnaissance du dossier ou du type reste soumis à `BAREME_SCORE_SCAN` : un numéro mémorisé ne passe jamais seul le seuil de rangement automatique (3 points < 4) ; seule la référence d'Authentic (le vrai numéro du dossier, 6 points) le fait ; un rangement automatique dont le fichier est identique à un scan déjà rangé est refusé par le serveur (409).
  dossier du copieur = **`\\192.168.60.5\Scan`, partage à part** du NAS (étude, 30/09) — trouvé
  comme `\\serveur\Scan` du serveur de `nasRacine` (`partagesScansCandidats`), sinon un dossier
  « Scan » dans `nasRacine` ou ses parents, ou `nasScans` dans config.json. **Surveillance de fond dès le démarrage**
  (`demarrerSurveillanceScans`, tôt dans `demarrerApplication`) : réessai toutes les 20 s tant que le
  dossier n'est pas trouvé, puis toutes les 2 min ; le serveur retient le dernier dossier trouvé. **Seuls les nouveaux
  scans** : `depuis` = heure exacte de l'activation (les scans déjà présents ne sont jamais touchés),
  ou une date choisie dans les réglages. Lecture dans le navigateur (pdf.js, OCR tesseract.js des 2 premières pages d'un scan
  sans texte). **Type de pièce lu sur la page 1 EN ENTIER** (étude 20/10), la mention
  la plus haute l'emporte ; un acte notarié (« L'AN DEUX MILLE… ») est une promesse/un compromis s'il
  le dit, sinon un titre de propriété — jamais compter les mots de tout le document (un compromis cite
  toutes les pièces : le script Python d'origine classait 5 états datés sur 5 en « règlement »).
  **Dossier** : barème `BAREME_SCORE_SCAN` (celui du script de l'étude, qu'elle souhaite garder) —
  partie nommée (tous ses mots, ou nom d'usage + prénom) 3 pts, deux au plus ; voie de l'adresse du
  bien 4 ; parcelle 5 ; sûr à 4 (abaissé de 6 par l'étude le 30/09) et ×1,3 devant le second, sinon suggestion ; score affiché **sur 6, plafonné** (`noteScoreScan`, « 6/6 » dès 6 points, comparaisons sur le score brut) avec le détail des points
  (`explicationScoreScan`) et journalisés. **Copie
  nommée du libellé de la pièce de la checklist** (« État daté - Claire Scan », sans date ni référence du scan — « Nom (2) » si le nom existe ; courrier d'appel de fonds de l'étude = « Convocation au rendez-vous contenant l'appel de fonds - Claire Scan », étude 06/10) pour que le
  parcours du NAS la coche seul ; « Compromis signé » / « Promesse de vente signée » pour
  `choisirAvantContratNas`. **Rubrique retrouvée par son nom** (`RUBRIQUES_SCANS`, numéro ignoré),
  racine du dossier à défaut ; pièce d'identité / état civil / RIB → Vendeur ou Acquéreur selon la
  partie reconnue. **Rangement automatique sans validation** (demandé le 30/09, actif par défaut,
  désactivable) : dossier sûr + pièce identifiée + dossier relié au NAS ; fait par UNE fenêtre CLAIRE
  ouverte à la fois (relais `/api/scans/relais`, poste serveur prioritaire, relais repris par une
  autre fenêtre après 5 min de silence) ; jamais retenté seul après un échec. **Après chaque
  rangement** (main ou auto, `enregistrerPieceRangee`) : pièce de la checklist cochée, sinon pièce
  personnalisée au libellé de la copie ajoutée puis cochée (`pieceDepuisScanRange`, validée à la main),
  fichier mémorisé, notification Teams immédiate (offre de prêt et avant-contrat exclus : parcours
  du NAS). Carte « Dernières pièces » : pièces reçues, puis scans à ranger et scans rangés sur 14 jours
  (`scansPourCarte`). **Aperçu** (01/10) : vignette de la page 1 sur chaque scan, fenêtre de toutes les pages au
  clic (`ouvrirApercuScan`) ; « Ranger » / « Laisser dans Scan » tournent jusqu'à la liste relue. **OCR d'un scan : `page.render(… intent: 'print')`** — en « display », pdf.js 3.11 cadence
  le dessin sur `requestAnimationFrame`, arrêté fenêtre réduite/cachée (lecture bloquée sans fin). Un pré-état daté n'est
  pas un état daté (checklist corrigée le même jour).
- **Page Agenda** (30/09, `renderPageAgenda`, **à la manière d'Outlook** — étude, 30/09 au soir : « plus
  professionnel, pour ne pas dépayser les collaborateurs » ; lien juste sous le tableau de bord) : une carte,
  en tête les trois lettres du jour (étude 01/10, d'après « Wed. » puis « en français, pas de fond de couleur, juste les 3 lettres et le point » : « Jeu » + point orange `--cat-orange`, couleur du texte, « Oct » en vue Mois — `motPastilleAgenda`, `.ag-pastille-jour`), date suivie sur sa ligne de ‹ Aujourd'hui › et « Aller à une date » (étude 02/10, `.ag-titre-ligne`, date de largeur fixe pour que les boutons ne bougent pas), liste Vue mois/semaine/jour, « Nouveau rendez-vous » ;
  Semaine (lundi → samedi, **8 h – 19 h**, `AGENDA_HEURE_DEBUT/FIN`, étude 01/10 ; 60 px l'heure, `AGENDA_PX_HEURE` = `--ag-heure`) · Jour · Mois (`agendaVue`, `agendaJour` ; Jour par défaut sur
  téléphone), en-têtes « Lundi / 28 sept. 2026 », colonne du jour teintée, trait de l'heure ; rendez-vous =
  liseré gauche + fond clair de la couleur Outlook, heure de début, de fin et durée (`dureeRendezVous`) ;
  **sur un rendez-vous d'un dossier, comme dans Outlook : responsable (prénom), confrère (`confrereLieuAgenda`),
  appel de fonds fait (`echeanceValidee`) et projet envoyé ; « Décompte » seulement pour une succession** (étude 05/10 ; `decompteAcquereurFait` : courrier
  de décompte trouvé sur le NAS ou lu pour les fonds reçus) —
  `infosRendezVousDossier` ; **deux pastilles « AF »/« D » et « P » en haut à droite de toute carte de signature** (étude 06/10, puis 07/10 : « en haut à droite du rendez-vous » ; `renderEtatsMiniRendezVous` : vert plein = fait, rouge en tirets = pas encore ; vue Semaine : flottantes en tête du titre, le pourcentage de maintien au bout de la ligne de l'heure ; vue Jour et carte courte : en coin avec le pourcentage, le titre s'arrête avant — rien ne déborde d'une carte d'une heure, étude 07/10 ; plus de lignes « Appel de fonds / Projet » sur la carte, elles restent dans le détail). Trait rouge de l'heure mis à jour toutes les 30 s (`traitHeureAgenda`, `majTraitHeureAgenda`). **Historique** (01/10) : avant le stock, chaque mois affiché est lu à la demande dans Exchange puis gardé (`GET /api/agenda/passe`, clés `agenda-archive:AAAA-MM`, plus relu une fois stabilisé), en lecture seule ; **Recherche d'un dossier** dans l'en-tête de la page, à la place du bouton « Actualiser », au style du champ du Suivi et **qui filtre l'agenda comme le Suivi filtre sa liste** (étude 01/10, `evenementsFiltresRecherche` : titre, lieu, dossier ; nombre trouvé + « Tout afficher » sous la date) ; liste dessous (`resultatsRechercheAgenda`) : le nom mène au rendez-vous (`allerAuDossierAgenda` : jour de la signature et son détail, sinon semaine probable et sa carte fantôme, sinon la fiche), l'icône « fiche » ouvre la fiche (`ouvrirFicheDepuisRechercheAgenda`) ; « Actualiser » = icône à côté de « Agenda de l'office lu … » (`actualiserAgenda`). « Aller à une date » dans la barre (icône calendrier seule, sans date affichée à côté d'« Aujourd'hui » — étude 01/10, `ouvrirAllerDateAgenda`). **Comparaison avec l'an dernier** (01/10) à côté de « Agenda de l'office lu… » : rendez-vous horaires **d'une heure ou plus** lun→sam (hors journées entières et options ; étude 01/10, `DUREE_MIN_RENDEZ_VOUS_COMPTE`, semaines gardées marquées de la règle `REGLE_COMPTAGE_RENDEZ_VOUS`, relues si elle change) vs la même semaine 52 semaines plus tôt, lue une fois dans Exchange puis gardée (`GET /api/agenda/comparaison`, clé `agenda-comparaison`). Colonne de gauche : mini-calendrier du mois (sans légende des couleurs, étude 30/09), « Dates proposées » juste dessous, puis anticipations (« Signatures de la semaine » retiré le 01/10) ;
  **détail du rendez-vous choisi dans une fenêtre posée sur l'agenda, à côté du rendez-vous cliqué**
  (étude, 30/09 : « dans un popup, pas à gauche » — `agendaSelection`, `renderPanneauDetailAgenda` dans
  `#agenda-popover`, `renderPopoverAgenda`/`positionnerPopoverAgenda`, ancre `data-cle` ; feuille au bas de
  l'écran sur téléphone ; fermée par ×, Échap ou clic ailleurs). **Vue Semaine** : nom du dossier en
  entier sur plusieurs lignes (`lignesTitreEvenement`), puis heure de début + initiales du collaborateur
  (+ confrère), sans heure de fin ni durée (`renderEvenementSemaine`) ; **création comme dans Outlook** (étude, 30/09) : un clic
  sur une case vide surligne un créneau d'1 h à la demi-heure près (`choisirCaseAgenda`, `heureCaseAgenda`,
  `agendaCaseChoisie`), un double-clic (01/10 : à la souris, un second clic simple déplace le créneau ; au clavier et au doigt, un second appui) ouvre « Nouveau rendez-vous », 1 h par défaut ; rendez-vous lus par le serveur (stock `agenda-office`, tenu à jour à la création/suppression
  depuis CLAIRE entre deux tours) ; signatures de CLAIRE absentes d'Outlook en pointillé. Agenda
  « intelligent », **sans IA, chaque point expliqué** : `probabiliteTenueSignature` (99 % moins des
  retraits pondérés par la proximité : financement, vente préalable, préemption, pièces, envois, fonds ;
  **l'absence d'un collaborateur ne retire rien** — étude 06/10 : seule Sophie reçoit les actes ; mais un rendez-vous PAS ENCORE PLACÉ
  évite les jours d'absence du responsable, qui peut devoir modifier l'acte : `semaineProbableSignature` repousse la date),
  `creneauxProposesSignature` (dossiers de `dossiersAPlacer` — même règle que le planning depuis le 07/10 : renonciation reçue, SAFER levée ou son délai daté —, un créneau par jour
  ouvré, ≥ 14 jours, hors fériés `joursFeriesFrance`, absences, chevauchements ; **règles de l'étude,
  30/09 : jamais à 9 h, ni entre 12 h et 14 h, ni après 18 h, 6 rendez-vous par jour au plus** —
  `motifCreneauExceptionnel` ; une exception n'est proposée qu'à défaut de tout créneau normal, marquée,
  et une création manuelle hors règles se confirme),
  **semaine probable d'une signature pas encore placée** (étude, 30/09 : « au plus tôt ») —
  `semaineProbableSignature` : max(aujourd'hui + 14 j, offre de prêt attendue — date de la condition ou
  aujourd'hui si dépassée — + 11 j de réflexion, vente préalable), jour ouvré ; probabilité = celle de
  `probabiliteTenueSignature` à cette date − 10 (non fixé) − 15 (après la date butoir) ; « Rendez-vous à
  placer » les liste par semaine, et la semaine affichée porte une **carte fantôme** en pointillé
  (`fantomesSemaineAgenda`, premier créneau libre dans les règles, clé `probable:<id>`) — **sauf rendez-vous « ?? » en attente de confirmation** dans l'agenda (étude 02/10, `rendezVousAConfirmerDossier` : sa date fait la semaine probable, « À confirmer », pourcentage sur le rendez-vous, −5 pts, ni fantôme ni créneaux) dont le détail
  propose « Placer » (confirmé) et **rappelle la date butoir** (étude 02/10, `rappelButoirSignatureProbable` : jours restants, marge < 7 j ou dépassement en rouge) ; **notes d'un rendez-vous = son corps dans Outlook** (choix de l'étude,
  `GET/PUT /api/exchange/evenement/notes`, GetItem/UpdateItem du seul `item:Body` en texte brut — lu dans le `CalendarItem`, jamais le `<s:Body>` de l'enveloppe (vides du 04 au 05/10) —, lues à
  l'ouverture du détail, jamais journalisées ; la mise en forme HTML d'un corps n'est pas gardée à
  l'écriture),
  **Visio ADNOV** (01/10) : sur un rendez-vous en visio, « Créer la visio » ouvre `https://ls.visio.adnov.fr/` ;
  l'invitation `.ics` rendue, déposée sur l'agenda ou choisie dans le détail, n'est **jamais ajoutée à part** :
  son lien (`lireInvitationIcs`) est écrit dans les notes du rendez-vous de même date et même heure
  (`notesAvecVisio`, bloc « Visio ADNOV : … » remplacé à l’invitation suivante), puis « Rejoindre la visio ». « Envoyer le lien » prépare l'email aux clients et/ou au confrère (`corpsEmailVisio`, premier jet de CLAIRE) avec les informations de connexion relues dans la note (`blocVisioDansNotes`).
  `gestesRelationClient` (**« Confirmer le rendez-vous » retiré le 05/10** — étude : doublon de « Demander le RIB et la pièce
  d'identité » ; son modèle reste dans Réglages › Modèles d'emails et le menu « Modèles » ; rappel du rendez-vous retiré le 03/10 ;
  **Chaque geste au même moment partout** (audit 07/10 : « À faire », onglets Échanges/Fonds, planning, rappels Teams) — appel de fonds J-10 du rendez-vous (jamais avant que le rendez-vous soit fixé), projet J-7 ou dès l'appel de fonds parti, fonds reçus après l'appel de fonds, relance et confirmation des fonds J-3 (alerte Teams « fonds pas reçus » aussi à J-3, le vendredi si J-3 tombe un week-end) ; **« Demander le RIB et la pièce d'identité » juste avant la signature** (étude 07/10 : tâche d'« À faire » à J-3, `JOURS_RAPPEL_RIB`, et ligne utile de l'onglet Fonds au même moment seulement — repliée avant ; jamais quand un confrère accompagne l'acquéreur) ; **« Confirmer la réception des fonds »** dans « À faire » à 3 jours du rendez-vous seulement (étude 05/10, `JOURS_CONFIRMATION_FONDS`) ;
  **« Relancer pour les fonds »** si les fonds ne sont pas arrivés 3 jours avant (`relanceFondsDue`, `JOURS_RELANCE_FONDS`,
  `construireEmailRelanceFonds`, une fois par date `relanceFondsPour`, À faire + Échanges, premier jet de CLAIRE),
  questionnaire J+1…J+30 (« À faire », `JOURS_QUESTIONNAIRE`) ; **« un mot un an après la signature » retiré le 07/10** (étude : « retire le mot d'anniversaire » — dossier archivé avant, jamais proposé ; `gestesRelationClient` supprimée) — **date de signature = `dateSignatureDossier`** (07/10 : signé dans Authentic ou coché, sinon rendez-vous passé ; stade, questionnaire, archivage à J+30, statistiques, avancement, tuiles du mois ; jamais `d.rendezVousSignature` seul ; jamais pour une succession) — **jamais quand un confrère accompagne l'acquéreur**,
  étude 01/10) : ces emails vivent dans l'**onglet Échanges de la fiche** (`echangesSelonStade`, utiles quand ils sont
  dus ou faits ; le reste replié sous « Hors de ce stade », déplié à l'impression — étude 24/10), plus dans la barre de l'agenda (retirés le 01/10). **Couleur d'un
  rendez-vous = celle d'Outlook** (étude, 30/09) : couleur nommée dans la catégorie
  (`couleurCategorieOutlook`, jetons `--cat-*`), sinon type réglé (office/visio/confrère), sinon
  absence, signature, autre — page Agenda et fenêtre du matin. **Absences et dates butoir en rose** (étude, 01/10, avant la
  couleur Outlook ; absences rayées ; `estDateButoirAgenda`). Fenêtre du matin (**plus ouverte d'elle-même à la première connexion du jour** depuis le 07/10 — étude : « supprime le pop-up Aujourd'hui à l'ouverture » ; atteinte par « Voir N de plus » de la carte) : « À faire » à gauche,
  à droite (étude 02/10 : « ce qui s'est passé depuis hier 18 h ») onglets **« Depuis hier 18 h »** (`renderDepuisHier18h` :
  documents reçus et cochés listés — `documentsDepuis`, `d.piecesTrouveesLe` ; nombre d'emails reçus et écartés ; liste des
  demandes de l'IA ; autres nouveautés repliées) · Agenda du jour (`ongletFenetreJour`), 660 px de haut au plus. Emails de confirmation,
  rappel = **premiers jets de CLAIRE**, à remplacer par les textes de l'étude.
- **Sondage de créneaux de signature** (01/10, « comme un Doodle », `server/src/sondagesCreneaux.js`,
  `routes/sondages.js`, client `ouvrirSondageCreneaux`/`renderSondageDossier`) : rien d'hébergé — un
  `.eml` aux clients ensemble (et un par confrère, formule d'usage) dont chaque bouton est un `mailto:`
  vers la boîte du compte Exchange, objet `[CLAIRE-CODE-n]` (0 = aucun) ; le serveur relit les **objets**
  (FindItem, 5 min, même disjoncteur que l'agenda), un email par créneau accepté ; plus « Répondre en une
  seule fois » (`[CLAIRE-CODE-L]`, étude 01/10) : cases `[ ]` à cocher d'un X, seul cas où le **texte** d'un
  email est lu (GetItem de ces réponses-là, numéros cochés gardés, texte jamais conservé).
  **Page de réponse** (étude, 01/10 — `page-sondage/index.html`, à publier dans un dépôt GitHub public
  dédié avec Pages, adresse dans Réglages › Agenda et Outlook › Sondages de créneaux, `pageSondage` des réglages Exchange) :
  vraies cases à cocher, **aucune donnée côté GitHub** (tout est après le `#` du lien, rendu en
  `textContent`), à la manière de Rallly avec le logo de l'office (dépôt public **blursquare/Claire-rdv**,
  copie de `page-sondage/`), vote **Oui / Si nécessaire / Non** ; réponse par un seul email d'objet
  `[CLAIRE-CODE-P13S2] VTE - MOR./FAU. — Oui : … · Si nécessaire : …` (S = si nécessaire, P0 = aucun ;
  remplace les choix ; « possible pour tous » = oui ou si nécessaire).
  **Relais Google** (étude, 01/10 — `page-sondage/relais-google-apps-script.gs`, Apps Script déployé
  sur le compte Gmail de l'étude, adresse `/exec` dans la même section, `relaisSondage`) :
  la page lui poste la réponse (texte brut, sans prévol CORS), il l'envoie par email à une adresse FIXÉE
  dans le script (jamais choisie par la page), objet contrôlé, 200/h ; repli sur la messagerie du client
  s'il échoue. L'expéditeur devenant le Gmail de l'étude, chaque destinataire a un **code personnel**
  (`cle`, 4 car., `attribuerCles`) dans son lien et dans l'objet (`…-P13S2-Q7AB]`) qui le désigne ; un
  code inconnu est écarté. Le lien porte le rôle (`w`), jamais le nom. Le dossier n'apparaît qu'**abrégé** (`abregeDossierSondage`,
  3 lettres par nom de famille) sur la page et dans les objets de réponse. Réglage vide = boutons. Options
  « Provisoire » `VTE - NOM ? — option CLAIRE, créneau n/N` (le « ? » n'écrit rien sur la fiche),
  hachurées dans l'agenda, retirées (`MoveToDeletedItems`) au placement ou à l'annulation — **jamais d'elles-mêmes** (étude 07/10 :
  « on les laisse tant que ce n'est pas validé » ; plus de retrait après 5 jours ouvrés, `expireLe` vide, statut `expire` gardé pour les anciens ; **la dernière option restée seule** — les autres effacées à la main dans Outlook — **devient le rendez-vous** (étude 07/10, « oui » ; `optionRestanteSeule`, `placerOptionRestante` au tour des sondages : agenda relu après la pose, complet et couvrant les options ; UpdateItem du même élément — titre `s.libelle` sans « ? », occupé, rappel, catégorie du type — puis la relecture de l'agenda pose la date sur la fiche et prévient le responsable ; un échec n'est jamais retenté, `placementSeulEchoue` ; point terrain `option-restante-placee`)). Votants par défaut : les clients, ou le confrère qui représente une partie. Aussi offert depuis le formulaire « Nouveau rendez-vous » (« Proposer plusieurs dates », créneau saisi en tête, `proposerPlusieursDatesAgenda`). **Sans dossier** (01/10) : sondage au `titre` libre (destinataires libres, dont confrère ; options « Titre ? — option CLAIRE » ; page `t=r`), lancé par la moitié droite du bouton double « Nouveau rendez-vous | Proposer des dates » de l'en-tête de la page, à droite du champ de recherche (étude 01/10, `.ag-ajout-double` dans `#agenda-creation`), suivi dans le volet à droite **« Dates proposées »** (tiroir comme une fiche, étude 01/10, lien sous le mini-calendrier, `ouvrirSuiviDatesProposees`, `classerSuiviDatesProposees` : en attente — tableau des réponses, Placer/Relancer/Relire/Annuler —, validées — date retenue, « Voir dans l'agenda » —, sans suite ; tous les sondages, avec ou sans dossier ; **pastille rouge sur « Agenda » dans la barre latérale** quand une réponse revient — `reponsesNonVuesSondages`, repère `claire-dates-vues:<poste>` en localStorage, effacée à l'ouverture du volet), « Placer » crée un rendez-vous ordinaire. Textes =
  premiers jets de CLAIRE. **Copie de l'acte / attestation de vente en participation** (étude 03/10 : le confrère reçoit
  l'acte, l'étude envoie à son client) : ligne Échanges une fois l'acte signé (`renderEnvoiCopieActe`, client =
  `clientsParticipation`) → fenêtre `#copie-acte-overlay`, PDF du dossier **« Fausses minutes »** du commun
  (`server/src/faussesMinutes.js` : `nasFaussesMinutes` de config.json, sinon partage `\\serveur\Fausses minutes`, sinon dossier
  ainsi nommé dans `nasRacine` ou ses parents ; `GET /api/nas/fausses-minutes` + `/fichier`, lecture seule, confiné) ;
  `faussesMinutesPourDossier` (noms des deux côtés, jamais antérieur de plus de 7 jours au rendez-vous) ; ≤ 21 Mo
  (`LIMITE_PIECES_JOINTES_OCTETS`) joints au `.eml`, au-delà WeTransfer ouvert et « [lien WeTransfer à coller ici] » ;
  `construireEmailCopieActe` **texte de l'étude** (08/10, mot pour mot : « Veuillez trouver ci-joint la copie de l’acte et l’attestation de vente de la vente signée le DATE. / Vous en souhaitant bonne réception. / Bien cordialement, »), `d.copieActeEnvoyeeLe` ; **PDF retrouvés par leur nom OU celui du sous-dossier qui les contient** (étude 08/10, `faussesMinutesPourDossier` sur le chemin, `dossierFausseMinute` affiché, recherche sur le chemin). **Aussi dans « À faire »** (étude 07/10 : « ajoute à À faire ») : tâche `copieActe` dès l'acte signé (`dateSignatureDossier`) jusqu'à l'envoi, **juste avant le questionnaire** (étude 07/10, ordre d'insertion dans `actionsDuJour`, même rang de tri), même titre, geste `copieActe` (`ouvrirEnvoiCopieActe`), « Déjà fait » pose `copieActeEnvoyeeLe` ; sans email du client, la tâche ouvre la fiche. L'archivage n'attend pas la copie (non demandé). **Email du vendeur** (`d.emailVendeur`) : wizard, fiche, lecture de l'acte
  (`detecterEmailVendeur`) et d'Authentic ; masqué si le vendeur a son propre notaire, sauf déjà saisi.
- **Appels 3CX** (01/10, choix de l'étude : « noter + ouvrir la fiche », téléphones sur les fiches) : 3CX
  ne donne pas d'historique ; son « Intégration CRM » (client web, réglage de chaque collaborateur, CRM
  personnalisé, « Informer lorsque : Sonnerie ») ouvre `/appel?numero=%CallerNumber%&nom=%CallerDisplayName%&poste=<prénom>`
  (adresses à copier dans Réglages › Téléphonie 3CX, `adresseIntegration3cx` ; poste = prénom sans accent, jamais un
  nom encodé que 3CX prendrait pour une variable). Réglage V20 : client web seulement (« Auto launch a Custom Contact URL », pop-up autorisées), `%CallerDisplayName%` y vaut « undefined » (`valeur3cx`) ; le serveur compare les postes par `clePoste` ; Réglages › Téléphonie 3CX montre, par collaborateur, fenêtre CLAIRE ouverte et dernière sonnerie reçue (`GET /api/appels/postes`) — « Aucune sonnerie reçue » après un appel = côté 3CX. Le serveur note l'appel (`appels-recus`, 400 jours, hors
  session, aucune donnée renvoyée, jamais journalisé) et reconnaît l'appelant (`reconnaitreAppelant` : 9
  derniers chiffres ; `d.telephoneVendeur`/`d.telephoneAcquereur` — onglet Échanges, repris d'Authentic —,
  puis carnet des confrères et ses dossiers, puis répertoire). La fenêtre CLAIRE relève toutes les 3 s, même
  cachée (`releverAppels`), montre le bandeau « Appel entrant » (en bas à gauche ; fermé seul 45 s après la sonnerie — 3CX ne signale pas la fin d'un appel, choix de l'étude 02/10 contre le journal CRM de 3CX —, en pause au survol, fermé à l'ouverture d'une fiche depuis le bandeau) et ouvre la fiche (Échanges) d'un seul dossier
  en cours, jamais pendant une saisie ; l'onglet ouvert par 3CX se ferme si la fenêtre du poste est visible **ou si l'appelant est inconnu de CLAIRE** (étude 05/10 : aucun dossier, ni confrère, ni répertoire → rien à ouvrir, `pageSonnerie({ inconnu })` ; l'appel reste noté et montré dans le bandeau),
  sinon il affiche CLAIRE sur l'appel (`#appel=`). Appels du dossier dans l'onglet Échanges. **Numéros cliquables** (étude 05/10, « les ouvrir dans 3CX », `liensAppelTelephone` : un lien `tel:` par numéro d'un champ, jusqu'à 3) : téléphones des parties de la fiche, appels reçus, bandeau d'appel entrant, en plus du Répertoire et de l'annuaire des notaires ; le numéro écrit **en texte** est enveloppé dans la balise `<tcxspan tcxhref="numéro">` de l'extension Chrome « 3CX Click to Call » (`texteAppel3cx`, forme relevée par l'étude le 05/10 : l'extension ne voit qu'un numéro du TEXTE d'une page, jamais dans un lien, un champ de saisie ni derrière une icône — répertoire `ligneTelephoneRepertoire`, ligne « Tél. confrère » de la fiche `telephoneConfrereDossier` : numéro saisi `d.telephoneNotaireParticipant`/`d.telephoneConfrereVendeur`, sinon celui de l'annuaire, reconnu à l'appel), l'icône à côté étant un lien `tel:` (3CX application du protocole du poste ; points terrain `telephone-3cx-lien`, `telephone-3cx-texte`, **non vérifiés au bureau**). **Appel ouvert dans la fenêtre CLAIRE** (étude 07/10 : « 3CX ouvre l'appel dans un onglet Chrome et pas dans mon app séparée » — une page ne peut ni trouver ni passer au premier plan la fenêtre `--app` d'un autre profil, les notifications exigent HTTPS) : relais Windows `claire-appel:` (`server/src/relaisAppel3cx.js`, HKCU + `%APPDATA%\CLAIRE\appel-claire.vbs/.ps1`, sans droit d'administrateur) installé par Réglages › Téléphonie 3CX › « Installer sur ce poste » (`GET /api/appels/relais/installateur?poste=`, poste retenu dans `postesRelais` de la clé `telephonie-3cx`, profil `ClaireServeur` si téléchargé en localhost, `Claire` sinon ; « Retirer » = `PUT /appels/reglages { relais: false }`) ; poste à relais → `pageSonnerie({ relais })` lance `claire-appel:<id>` puis ferme l'onglet (au lieu d'y afficher CLAIRE) ; le relais cherche la fenêtre de titre « CLAIRE — … » sans nom de navigateur (titre de la page de sonnerie : « Appel 3CX »), la restaure et la passe au premier plan (touche Alt + SetForegroundWindow), sinon ouvre l'application sur `#appel=<id>` ; point terrain `3cx-appel-fenetre-claire`, **non vérifié au bureau** (premier-plan Windows, « Toujours autoriser » du protocole sans geste de l'utilisateur). **Remplacé le 12/10 (0.220.1)** (étude : « Chrome s'ouvre au premier plan à chaque appel, c'est pénible ; CLAIRE ne s'affiche pas au premier plan lorsqu'un dossier est trouvé » — point `3cx-appel-fenetre-claire` signalé en échec le 08/10) par le **relais CLAIRE du poste** (`relaisWord.js`, le même que Word, permanent) : la sonnerie d'un poste dont le relais répond (`noterAppelPourRelais`) ferme l'onglet aussitôt et passe l'appel au relais à son relevé suivant (≤ 1 s) : appelant d'un DOSSIER → fenêtre CLAIRE au premier plan (ouverte sur `#appel=` si fermée), sinon la fenêtre au premier plan AVANT la sonnerie revient (historique de `GetForegroundWindow`) ; bouton « Installer le relais sur ce poste » de Réglages › Téléphonie 3CX ; seulement pour un relais qui déclare `appels: 1` et a battu il y a moins de 3 s (sinon comportement d'avant : jamais un appel perdu) ; point `3cx-relais-premier-plan`, **non vérifié au bureau**. **Depuis 0.224.0 (étude 12/10 : « trouve un autre moyen pour ce relais » — Panda bloque le `.vbs` et l'exe ; choix : un fichier .reg)** : Réglages › Téléphonie 3CX › « Télécharger le fichier pour ce poste » (`GET /api/appels/relais/installateur`, poste dans `postesRelais`) rend `CLAIRE-appels-3CX.reg` (`server/src/relaisAppelReg.js`, UTF-16) : lien `claire-devant:` (HKCU) ouvert par `powershell.exe -Command "… #" "%1"` — script DANS la clé, aucun fichier, pas d'Add-Type de code, le lien de Chrome tombe dans le commentaire et n'est relu que par `GetCommandLineArgs` réduit à un identifiant ; PowerShell signale `GET /appel/vu?id=` (hors session), cherche la fenêtre au titre EXACT de l'application (UI Automation, restaurée si réduite, `AppActivate`), sinon l'ouvre sur `#appel=` ; l'onglet de 3CX (`pageSonnerie` `relais`) attend le signal (`/appel/etat`, 8 s) : reçu → fermé, sinon repli (fermé si la fenêtre CLAIRE est visible, sinon CLAIRE dans l'onglet) — jamais un onglet fermé sur rien ; l'ancien relais `claire-appel:` (`relaisAppel3cx.js`) est retiré ; points `3cx-lien-reg`, `3cx-lien-reg-premier-plan`, **non vérifiés au bureau**. **Fenêtre CLAIRE en application** (étude 06/10 : « fonctionne en onglet Chrome mais pas dans l'app séparée ») : profil Chrome à part (`Claire`, `ClaireServeur`), sans les extensions du Chrome habituel — l'extension « 3CX Click to Call » s'y ajoute une fois par poste depuis la fenêtre CLAIRE (Réglages › Téléphonie 3CX › « Ajouter l'extension 3CX », point `telephone-3cx-fenetre-app`). **Coupé collaborateur par collaborateur** (étude 02/10, interrupteur sur sa ligne dans Réglages › Téléphonie 3CX, clé `telephonie-3cx` `postesCoupes`) : ses sonneries ne sont plus notées, sa fenêtre ne relève plus rien.
- **Contrôle de l'urbanisme** (nom de l'outil depuis le 08/10, étude : « appelle cela contrôle de l'urbanisme » ; ex-« Droits de préemption », clé `preemption` inchangée ; titre de la fiche aussi) — **Droits de préemption** (étude 06/10, outil `preemption`, `client/45-preemption-regles.js` + `46-droits-preemption.js`,
  `server/src/urbanisme.js`) : DPU/DPUR d'après le tableau Cheuvreux (mutation puis bien), Agglopolys = DPU sur toutes les zones
  U et AU du PLUi (délibération 29/11/2022, exercé par la commune, Agglopolys pour les ZAE), DPU renforcé de Blois = parcelle AL 839
  + centre-ville ACV/ORT (plans de la délibération A_D2025_200 dans `vendor/plans/`, rue = « probable, à vérifier sur le plan ») ;
  SAFER d'après le CRIDON n° 87 (terrain p. 63, bâtiment p. 64) ; bois et forêts d'après Letulle (L.331-19 à 24). Zonage lu sur le
  Géoportail de l'urbanisme (API Carto) **pour chaque parcelle** (étude 06/10, tableau compact `renderTableauZonagePreemption`, zone retenue modifiable par parcelle `reponses.zonesParcelles` ; zones différentes → `analyserPreemptionParcelles` : chaque zone analysée, le droit garde le statut le plus exigeant et nomme les parcelles), le périmètre du DPU s'en déduit, la nature « bois » est demandée. Réponse manquante →
  « À vérifier », jamais « non » ; questions posées seulement si utiles ; résultat sur la fiche (`d.preemption`, onglet Pièces). **SAFER : en zone A ou N, toujours « À purger »** (étude 09/10 : « il faut mettre oui quand on est en zone N et A, de toute façon on notifie toujours même s'ils n'ont pas le droit de préempter » — `droitSafer` enveloppe l'arbre du CRIDON `droitSaferArbre` : en zone A/N le statut passe à `oui`, sans question restante, formalité « Notification à la SAFER (Vigifoncier) … même sans droit de préemption », pièce « Réponse SAFER » ajoutée ; lot de copropriété non concerné) ; hors zone A ou N, l'arbre décide (bâtiment sans usage agricole = « Non applicable », sans formalité) ; zone non lue → « Information de la SAFER à vérifier ». Avant (06-07/10) : « non » + information obligatoire en zone A/N. **Lus seuls à l'ajout d'un dossier de vente** (étude 07/10, `client/54-preemption-dossier.js`) : mêmes fonctions que l'outil
  (`analyserPreemptionDossier`, drapeau `d.preemptionAuto` posé par « Ajouter le dossier » / « Compléter le dossier », relu à
  l'ouverture de la fiche si code postal, parcelles ou nature du bien changent — `signature` —, jamais par-dessus un résultat
  enregistré depuis l'outil) ; un droit à purger ajoute sa pièce (`appliquerPreemptionSurPieces`, aussi à « Enregistrer sur la
  fiche ») : « Réponse SAFER » (`perso-safer`, la même qu'Authentic), pour un lot de copropriété la pièce standard « Renonciation au droit de préemption », retenue par l'analyse (`retenir`, piecesAjoutees ; 07/10 : la seconde pièce « (DIA) » du 0.190.0 doublait la checklist, le scan/NAS/Authentic ne la cochaient pas — reprise par `migrerPieceDiaCopropriete`, au démarrage et à chaque analyse), droit de préférence / préemption bois et forêts — retirée si le droit tombe et qu'elle n'est
  pas reçue ; les questions restantes se répondent sur la fiche ; droits recalculés depuis `lignes` + réponses
  (`droitsPreemptionFiche`, la liste `droits` gardée peut avoir été réunie par la fusion du serveur). **Monuments historiques et
  sites protégés** (étude 08/10 : « une information importante si les acquéreurs veulent faire des travaux », « affiche-la avec la
  partie analyse ») : `/gpu/assiette-sup-s` de l'API Carto lu avec le zonage de chaque parcelle (`patrimoineDepuisSup`,
  `server/src/urbanisme.js` : AC1 monuments historiques — abords, 500 m ou périmètre délimité —, AC2 sites inscrits/classés, AC4
  sites patrimoniaux remarquables) → `d.preemption.patrimoine` `{ lu, servitudes }` (`patrimoinePreemption`) ; ligne « Monument
  historique » / « Site protégé » de l'analyse (`lignePatrimoinePreemption` : « En zone protégée » + conseil d'accord de l'architecte
  des bâtiments de France pour les travaux visibles, « Aucun publié », « À vérifier » si la couche n'a pas répondu) sur la fiche et
  dans l'outil ; une commune qui n'a pas versé ses servitudes n'y figure pas — jamais « aucune protection » (info-bulle). Une
  lecture automatique d'avant (sans `patrimoine`) est refaite une fois.
  **Travaux et autorisations** (étude 08/10 : « détecter les travaux dans le compromis et pouvoir analyser si les autorisations ont
  été demandées » ; `client/55-controle-urbanisme-relecture.js`) : section de l'outil (étape `travaux`, `#pr-travaux`) — compromis du
  NAS (`recupererTextCompromisDossier`, lu seul au choix du dossier s'il n'y a rien de gardé) ou PDF déposé, `detecterTravauxRealises`
  (mêmes lecteurs que la relecture, annexes de diagnostic écartées) ; seuls les travaux extérieurs/gros œuvre sont détaillés
  (`analyseTravauxUrbanisme`, `bilanTravailUrbanisme`) : autorisation citée (sinon « réclamer DP ou permis », prescription L.421-9 à
  vérifier au-delà de dix ans), achèvement/conformité (`RE_ACHEVEMENT_TRAVAUX`), décennale (moins de dix ans, fait par le vendeur,
  année non lue), architecte des bâtiments de France en zone protégée. **Travaux déclarés en liste** (étude 09/10, `travauxDeclaresDuCompromis` : « déclare avoir réalisé les travaux
  suivants : > … ») : un par puce — type, année, vendeur/entreprise, autorisation citée/demandée/absente, pièces transmises et **à obtenir**
  (« s'engage à fournir ») ; intérieurs montrés aussi ; en tête **Zone ABF** (oui/non/à vérifier) et **Documents à obtenir**. « Demandée » = **citée dans le compromis** : aucun registre
  des permis n'est consulté. Gardé dans `d.preemption.travaux` `{ le, source, liste }` (« Enregistrer sur la fiche », conservé par la
  relecture automatique des droits), lignes sur la fiche (`renderTravauxFicheUrbanisme`) ; lu seul après l'analyse automatique
  d'un dossier relié au NAS (`lireTravauxDossierAuto`, une fois). Point terrain `travaux-compromis-nas`.
  **Photos aériennes et Sitadel** (étude 08/10 ; `server/src/historiqueParcelle.js`, routes `GET /api/urbanisme/vue|photo|sitadel`) :
  sous les travaux, deux prises de vue côte à côte (`COUCHES_ORTHO` : 1950-1965, 1965-1980, 1980-1995 en PNG, périodes 2000-2005 →
  2021-2023, années 2001-2024, « la plus récente »), contour du cadastre en SVG par-dessus (`contoursImage`), gauche par défaut = la
  dernière période finie avant les travaux déclarés (`priseDeVueAvantTravaux`) ; image toute blanche (année sans vol sur la zone,
  `imageVide`) → 204 « pas de prise de vue » ; CLAIRE ne détecte pas les changements, l'œil juge. Sitadel (`autorisationsSitadel` :
  4 fichiers × 3 emplacements de parcelle, `COMM=eq` + `SEC_CADASTREk=in` + `NUM_CADASTREk=in`, couple exact refiltré,
  `ETATS_SITADEL` 2 autorisé, 4 annulé, 5 commencé, 6 achevé) → liste dans l'outil, `d.preemption.sitadel` à l'enregistrement et à
  la lecture automatique ; **recoupé** dans `bilanTravailUrbanisme(t, zone, année, sitadel)` : autorisation connue non citée → nommée
  (« la réclamer et vérifier qu'elle couvre ces travaux »), achèvement déclaré → repris, rien → dit avec sa limite (depuis 2013,
  seulement logements/locaux créés, PA, PD : une DP de piscine ou de clôture n'y est pas). Lancé seul dès que commune et parcelles
  sont connues (`lancerHistoriqueParcellePreemption`, une fois par commune + parcelles). Points terrain `photos-aeriennes-ign`,
  `sitadel-parcelle`.
  **Présentation** (étude 08/10 : « pas trop de texte, respecte Web Awesome et l'UI/UX de CLAIRE, attractif et facile à lire du
  premier coup ») : une carte par travail (`.pr-travail` : nature `natureTravailUrbanisme` « Agrandissement », année · extérieur ·
  page, état à droite), chaque point = une pastille courte (`court` de `bilanTravailUrbanisme`, `puceControleTravaux`, `.pr-puce`
  ok/manque/info) dont la phrase entière est la bulle au survol (classe `avec-bulle` + `data-info`, prise par
  `initialiserInfoBulles` comme `.info-i`), clause du compromis en pastille « Clause » ; Sitadel = une ligne par autorisation
  (type, date, quoi, état ; détail en bulle) ; sous-titres en `section-eyebrow`. Un nouveau point du bilan porte toujours `court`.
- **Type de vente « Terre agricole / terrain non bâti »** (`terre`, étude 08/10 : « un nouveau type de vente : terrain ou terre ») à côté de maison, copropriété, terrain à bâtir : checklist = pièces d'urbanisme + ERP, taxe foncière, titre (`PIECES_TERRE_AUTRES`, ni diagnostics ni étude de sol) ; **« Réponse SAFER » d'office** (`ajouterPieceSaferTerre`, client/54 : à la création, au complément et au passage à ce type sur la fiche ; la pièce `perso-safer` d'Authentic et de l'analyse, jamais en double, jamais en participation ; hors `preemption.piecesAjoutees`, l'analyse ne la retire pas) ; droits de préemption lus comme un terrain nu, frais d'acte au barème « terrain », courrier « un terrain non bâti ». **Fiche bien d'Authentic d'une terre ou d'un bois** (structure reçue le 12/10, 0.221.0) : « Type de bien », « Désignation » (« … parcelle de bois ») et nature des parcelles (codes du cadastre T, P, BT…, `RE_NATURE_RURALE`, `RE_NATURE_BOIS`) → type `terre` (jamais un terrain « à bâtir », `typeVenteFicheBienAuthentic`) + « Réponse SAFER » ; nature, surface et lieu-dit gardés sur `d.bien.cadastre.parcelles` ; `d.bien.natureBois` (terre seulement ; « toutes les parcelles en bois » : vrai si chaque nature est un bois, faux dès qu'une ne l'est pas, sinon le type ou une tournure explicite de la désignation pour une seule parcelle — jamais un mot pris au hasard, `RE_DESIGNATION_RURALE`) répond à « bois » de l'analyse de préemption (`boisDepuisFicheDossier`, `boisDeduit` ; une réponse de la fiche ou de l'outil l'emporte).
- **Mobilier** : le prix reste le prix total ; `d.prixMobilier` sort seulement de l'assiette des
  droits (frais d'acte, contrôle du barème).
- **Prorata** : jours réels, jour de l'acte à la charge de l'acquéreur, arrondi du vendeur par
  complément.
- **Aide à la rédaction de l'acte : outil SUPPRIMÉ le 15/10 (0.239.0, demande de l'étude : « Supprime l'outil d'aide à la rédaction »)** — écran, catalogue de clauses (`commun/redaction.js`), correspondance par l'IA, macro Word et lecture des rapports de diagnostic retirés ; ne pas le remettre sans nouvelle demande (l'historique des versions 0.218.0 à 0.223.1 dans `docs/historique.md` dit comment il était fait). **Le relais CLAIRE du poste (`relaisWord.js`, `server/relais/CLAIRE-relais.exe`) reste** : il sert aux appels 3CX (fenêtre CLAIRE au premier plan).
- **Espace de travail de « Demander à CLAIRE »** (étude 18/10, 0.282.0, `client/85-assistant-colonne.js`) : colonne de droite comme Claude — étapes (`plan_de_travail`), documents de la conversation, aperçu du PDF à la page citée (citation « … » [docN p. X] surlignée, retrouvée ou non), dossier rattaché, modèle et réflexion ; résumé automatique du début des longues conversations (Opus 5.5), reprise d'une conversation oubliée par le serveur avec les échanges du poste. Relecture d'actes fusionnée dans la conversation en 0.284.0 (voir « Relecture d'actes ») ; **recherche web** (0.285.0, Claude seulement : outil serveur `web_search` limité aux domaines de la clé `recherche-web` — Réglages › IA et relecture d'actes, liste officielle par défaut `DOMAINES_OFFICIELS_DEFAUT` ; jamais un code [NOM…] dans une recherche ; `pause_turn` relancé) et **mémoire des conversations** (0.285.0, `server/src/conversationsAgent.js`, clé `assistant-conversations` : dernières questions et dernière réponse EN CLAIR sur le serveur du bureau, 90 jours, 600 au plus ; outil `chercher_conversations` exécuté par le poste, résultat masqué comme tout résultat d'outil).
- **Consignes de CLAIRE — `CLAIRE.md`** (étude 18/10, 0.280.0, `server/src/carnetClaire.js`, `routes/carnetClaire.js`, `client/83-carnet-claire.js`) : carnet Markdown unique pour toute l'étude (clé `carnet-claire`, 20 versions), Réglages › Consignes de CLAIRE et bouton « Corriger » sous une réponse de l'agent ; lu par l'agent au premier tour de chaque conversation (second bloc système en cache pour Claude, premier message pour Mistral), MASQUÉ par `masquerCarnet` ; un texte qui cite un client ou un dossier est refusé (`motsNominatifs`). Les consignes passent avant les habitudes de l'agent, jamais avant ses règles de sécurité.
- **Jamais « Sauf erreur de ma part / de notre part »** (étude 12/10) : ni dans un texte de CLAIRE, ni dans une réponse de « Demander à CLAIRE », ni dans un premier jet d'email par l'IA — consigne dans chaque prompt et filtre `sansSaufErreur` (commun/assistant.js) sur toute réponse écrite par une IA.
- **Textes d'emails fournis par l'étude** (provision, prêt manquant, RIB, réception des fonds,
  questionnaire, vente préalable au confrère) : repris **mot pour mot**, à ne pas reformuler — l'étude peut désormais
  les modifier elle-même (Réglages › Modèles d'emails) ; jamais CLAIRE.
  Même règle pour `PROCEDURE_FONDS` et les clauses de l'annexe des quotités. Exception : l'email
  d'envoi du **projet d'acte** au client (`construireEmailProjetActe`, 30/09) est un premier jet de CLAIRE,
  à remplacer par le texte de l'étude dès qu'elle le fournit ; **au confrère** (variante `projetConfrere`), texte de l'étude
  du 08/10 mot pour mot (« … en prévision du rendez-vous du {date et heure} … Vous en souhaitant bonne réception. Votre bien
  dévoué. »), phrase sans le rendez-vous s'il n'est pas fixé (condition `{si sans rendez-vous}`).
- **Barème du simulateur de provision : validé par l'étude le 02/10/2026** (avertissement « montant à valider »
  retiré). **Depuis le 06/10 il remplit la ligne des frais et droits de l'acte du décompte** (étude : « avec l'ensemble des données
  recueillies durant la vie du dossier, le décompte se remplit tout seul » ; `fraisActeEstimesAppelFonds` : assiette hors mobilier,
  taux plein arrondi à l'euro supérieur, montant d'un primo-accédant dit dans « À compléter », « à vérifier, débours du dossier
  compris ») — seulement quand l'office établit le décompte ; le contrôle du barème reste affiché sur la ligne.
- **Répertoire** (Outils, 30/09 ; présentation revue le 02/10 : thèmes dans une colonne à gauche `renderNavRepertoire`, sans onglet « Tout » — étude 03/10, « Notaires » ouvert par défaut, une
  ligne compacte par office/interlocuteur `renderLigneOfficeCarnet`/`renderLigneContactRepertoire`, modification dans la ligne) :
  **un seul annuaire des notaires** (étude 03/10 : « fusionner le carnet des confrères avec tous les notaires de France ; que
  la fiche dossier cherche dans l'annuaire ; le carnet n'a plus lieu d'être ») : `GET /api/confreres` rend les 7 202 offices de
  France (`server/src/annuaireNotaires.js`, `server/src/data/annuaire-notaires.json`, relevé immonot par
  `server/scripts/releve-annuaire-notaires.py`), chacun remplacé par sa correction quand l'étude en a fait une
  (`fusionnerCarnetEtAnnuaire` : même id, sinon même email ou téléphone ; notre office en tête ; offices saisis ajoutés),
  compressé (gzip) ; la clé `carnet-confreres` ne garde plus que corrections et ajouts (`modifie`, `annuaire: false` = saisi).
  Côté poste, `carnetConfreres` = tout l'annuaire (nom gardé) : fiche, emails au confrère, saisie des notaires et rôle de l'étude
  cherchent dans toute la France (`trouverOfficeConfrere`, index par nom de famille `indexNotairesParFamille`) ; la liste
  déroulante des fiches se limite aux départements voisins et aux offices corrigés (`optionsNotairesCarnet`). Page « Notaires »
  (`renderAnnuaireNotaires`) : un département à la fois (41 puis le dernier consulté, voisins d'un clic, par ville), tout office
  modifiable au crayon (« Modifié »), croix = remettre tel que relevé (ou retirer un office saisi), recherche dans le département
  puis « Ailleurs en France » (50 au plus), en mémoire du poste ; plus de « Mes confrères » ni « Ajouter au carnet » ; repli de 3CX
  (`carnetEtAnnuaire`) ; `require` au chemin littéral (un chemin
  calculé ne serait pas embarqué dans le .exe, un fichier absent casse la construction) ; autres thèmes = `repertoire.js` (clé `repertoire-contacts`, relevé du répertoire Word
  de l'étude du 02/09/2026, coordonnées d'organismes, jamais de client) ; **lots ajoutés après coup** (`repertoireAjouts.js`, repère `repertoire-lots`, 05/10 : agences immobilières et syndics de copropriété repris de deux recherches de contacts d'Authentic — nom et ville seulement, rubrique « Syndics de copropriété »), appliqués une fois, jamais en écrasement ni en résurrection d'un contact retiré — `THEMES_REPERTOIRE` côté
  serveur, repli identique dans `repertoireThemes` côté client. Rien n'y est deviné : une adresse
  douteuse du document est signalée en note, pas corrigée. **« Copier l'adresse »** (étude 12/10) sur chaque office et organisme : format d'en-tête de courrier (« Maître Prénom NOM » / voie / « CP VILLE »), `adresseCourrierOffice` / `adresseCourrierContact`.
- **Tâches posées dans l'agenda** (étude 04/10, `server/src/tachesAgenda.js`) : rendez-vous de **catégorie rouge** dont le
  titre **commence** par les initiales en capitales d'un collaborateur (`COLLABORATEURS_ABSENCE` : BA, JV, JS ; « JV - … »,
  « JV: … », « JV … ») = tâche de ce collaborateur — recopiée à chaque tour de lecture de l'agenda dans ses rappels
  (`synchroniserTachesAgenda`, clé `rappels-perso`, `agendaItemId`/`agendaChangeKey`, id `ag-…`) : « Aujourd'hui » et « Mes
  rappels », « Tâche de l'agenda », ni crayon ni croix ; déplacée/renommée dans Outlook → suivie ; **supprimée de l'agenda et
  non cochée → cochée** (étude 04/10 : faite à l'heure du tour, `agendaSupprimeLe` posé, point `tache-agenda-supprimee-cochee`) ;
  encore là mais plus rouge ou sans initiales → retirée ; jamais une tâche plus ancienne que la fenêtre lue. **Cochée → rendez-vous retiré de l'agenda
  aussitôt, sans confirmation** (choix de l'étude ; `retirerTacheDeLAgenda`, `POST /exchange/evenement/supprimer`,
  MoveToDeletedItems, un seul essai, `agendaSupprimeLe` ; décochée ensuite, elle reste un rappel). Point terrain
  `tache-agenda-retiree`.
- **Enregistrement d'un dossier = fusion, jamais écrasement** (audit 04/10) : chaque objet dossier du poste porte sa version
  (`_version`, non énumérable, posée par `marquerVersionDossier` au chargement, au sondage et après chaque PUT) ; `sauvegarder`
  l'envoie en `X-Claire-Base` ; le serveur (`dossiersRepo.remplacerDepuisBase`, versions récentes dans `dossiers_versions`,
  10 par dossier / 3 jours) fusionne à trois voies (`fusionDossiers.js` : champ non touché par le poste → serveur ; touché →
  poste ; touché des deux côtés → listes fusionnées, objets un niveau plus bas, sinon le poste) et répond `fusionne: true` →
  `appliquerDossierServeur` remplace la copie SUR PLACE (références de l'écran gardées) + toast. Base inconnue → copie du poste
  (comme avant), `console.warn`. **Serveur injoignable** : `sauvegardesEnAttente` (id), rejoué à chaque sondage réussi, jamais
  remplacé par un changement distant entre-temps ; refus 404/4xx → toast. `updated_at` est strictement croissant
  (`maintenantMonotone`) ; `serverTime` du sondage recule d'1 ms. Une ligne au JSON illisible est écartée (`lireBlob`), jamais
  bloquante.
- **Écran qui tient malgré une donnée inattendue** (audit 04/10) : `render()` rend chaque bloc du tableau de bord et du Suivi
  par `rendreBloc(nom, fn)` (erreur au journal technique, une fois par bloc et par minute, les autres blocs continuent), chaque
  ligne du tableau par `ligneSuiviSure` (ligne minimale cliquable) ; tout dossier reçu du serveur passe par
  `assainirStructureDossier` (listes/objets/dates du planning ramenés à un conteneur vide ou '' quand le type est faux, valeurs
  correctes intactes). `ecrireLocal(cle, valeur)` pour tout `localStorage.setItem`. **Base SQLite en WAL** (`db.js`, sauf
  chemin réseau, `busy_timeout` 5 s, `synchronous` par défaut) ; la sauvegarde reste un `VACUUM INTO` (lit le WAL) ; une
  restauration ne copie JAMAIS une sauvegarde sur `claire.db` (06/10 : le `claire.db-wal` de l'ancienne base rejoué dessus → « database disk image is malformed ») : bouton « Restaurer » des Réglages, ou `data/claire-restauration.db` déposé à la main, mis en place au démarrage par `restauration.js` (ancienne base gardée avec son journal) ; la base est contrôlée EN LECTURE SEULE avant d'être ouverte (une connexion normale reverse un journal étranger en se fermant) — `ouvrirDbVerifiee`. `SIGINT`/`SIGTERM` → `arreterProprement` (port puis base).
- **Rendez-vous retiré de CLAIRE** → retiré aussi de l'agenda (et repère `rendezVousRetire` pour
  que le flux ne le remette pas). Une date saisie à la main n'est jamais écrasée par l'agenda.
- **Apprentissage** : corrections de classification (dates, engagements) et exclusions stockées en
  base, partagées entre postes. Les valeurs libres (nom, adresse, prix) ne sont pas apprises. **Réglages ›
  « Ce que CLAIRE a appris »** (étude 02/10, `renderPageApprentissage`) : erreurs de lecture (journal des corrections
  **sur le serveur**, clé `corrections-extraction`, 500 entrées, `GET/POST/DELETE /api/corrections-extraction` — il était
  dans le navigateur de chaque poste et dans « À propos » ; reprise unique des entrées locales), « Fréquente » = 3
  corrections ou plus en 30 jours (`syntheseJournalCorrections`, miroir serveur `erreursFrequentesJournal`, section du
  rapport technique) ; **tout remonte au rapport technique** (étude 02/10, `sectionApprentissage` : erreurs de la période
  avec `natureCorrection` — trouvé ou non, effacé, changé, écart en jours — et la clause lue anonymisée, classements retenus
  ou confirmés avec leur clause, fichiers écartés comptés par pièce, commentaires de relecture ; jamais une valeur lue ou
  saisie, test « aucun nom ne sort ») ; clauses apprises avec « Oublier »
  (`DELETE /api/corrections-apprises/:id`) ; fichiers écartés des pièces ; commentaires de relecture d'actes.

- **Fonds validés à la main** (étude 06/10 : « parfois ils ne sont pas comptabilisés dans des reçus mais sont bien arrivés sur le
  compte CDC ») : bouton « Valider les fonds reçus » du bloc Fonds reçus (`validerFondsArrives`, `d.fondsValidesLe` /
  `fondsValidesPar`, annulable tant que la réception n'est pas confirmée) ; **tout bilan des fonds passe par `bilanFondsDossier(d)`**
  (`commun/montants.js`, poste et serveur) qui rend `complet` + `manuel: true` dans ce cas — jamais `bilanFondsRecus` directement
  sur un dossier.
- **Décompte du confrère du vendeur** (étude 06/10) : quand un autre office représente le vendeur et que l'acquéreur est notre
  client, « Demander son décompte au confrère » 10 jours avant le rendez-vous (07/10 : avec l'appel de fonds ; 7 jours le 06/10) (`relanceDecompteConfrereDue`,
  `JOURS_RELANCE_DECOMPTE_CONFRERE`, une fois par date `relanceDecompteConfrerePour`), **jamais une fois l'appel de fonds coché** (étude 06/10 : `echeanceValidee(d, 'appelFonds')` → plus rien à demander) — À faire, onglet Fonds, modèle
  `relanceDecompteConfrere` au texte de l'étude mot pour mot, adressé à `emailConfrereVendeurDossier(d)`. Un modèle de
  `MODELES_EMAIL_RELANCE` peut porter `destinataire(d)` et `confrere: true` à la place de la règle acquéreur.
- **Fonds tous reçus, pas encore confirmés** (étude 05/10, `fondsCompletsAConfirmer`) : comptés dans la pastille rouge de « Suivi des
  dossiers » et en tête du Suivi (« Nouveau ») jusqu'à la confirmation au client ; alerte Teams « Tous les fonds sont reçus » au
  responsable, une fois par dossier (`alertesFondsDues`, même sans appel de fonds noté envoyé).

- **« Demander à CLAIRE »** (étude 06/10 : « un agent conversationnel où l'on pourrait poser n'importe quelle demande » ; choix de
  l'étude : IA locale, puis Mistral Small en essai depuis le 07/10 — noms masqués, voir contrainte 1 —, page dans la barre latérale « du type Claude », tous les gestes dès la première version, **tout sans
  carte de confirmation SAUF les emails et l'agenda**) — `client/49-assistant.js` (page `#onglet-assistant`, conversation en
  mémoire du poste, `assistantMessages`, boutons par `assistantActions` — jamais de code dans l'attribut onclick),
  `commun/assistant.js`, `server/src/assistant.js`, `routes/assistant.js` (`POST /api/assistant/comprendre`,
  `GET /api/assistant/disponibilite`). **Liste FERMÉE d'intentions** (`INTENTIONS_ASSISTANT` : état d'un dossier, pièces, échéances,
  coordonnées, fonds, À faire, depuis hier, rappel, mes rappels, email, cocher/décocher une échéance, date de la fiche, créneaux,
  placer la signature, sondage de dates, **options de rendez-vous** (07/10 : plusieurs créneaux lus par `creneauxDepuisTexte`, posés en option sans email après confirmation — un sondage `optionsSeules` sans destinataire, « Placer » retire les autres), nouveau rendez-vous, agenda d'un jour, appel de fonds, quotités, provision, prorata,
  préemption, ouvrir une fiche/un écran, chercher, archiver, responsable, aide, inconnu) ; **l'IA ne choisit qu'une intention et
  recopie la phrase, tout le reste est du code** : lecture par mots-clés d'abord (`interpreterParMotsCles`, sûreté haute = Ollama
  jamais appelé), Ollama seulement quand plusieurs intentions se disputent la phrase (prompt sans la liste des dossiers ni aucune
  donnée de fiche : la phrase, la date du jour, le libellé du dossier en consultation, les 3 derniers échanges), repli mots-clés
  sans Ollama ; date, heure, montants, parts (`dateDepuisTexte`, `heureDepuisTexte`, `montantsDepuisTexte`, `partsDepuisTexte`) et
  **dossier désigné** (`reconnaitreDossier` : mots du nom ou d'une partie, ≥ 3 lettres hors mots d'usage ; civilité écrite « Monsieur MARTIN » qui départage, `civilitesDansPhrase` ; et toute la fiche — prénom, nom d'usage, adresse, agence, notaires, référence Authentic, email, téléphone, envoyés au serveur par `dossiersPourAssistant`, jamais dans le prompt ; égalité → « Lequel ? »
  avec les candidats, jamais deviné ; rien → dossier en consultation, sinon la phrase suivante est prise pour un nom) relus par le
  code, qui gagne sur l'IA. **Exécution = les fonctions existantes** (`etatDossier`, `piecesAttenduesDossier`, `echeancesPlanning`,
  `actionsDuJour`, `rappelsDuJour`, `envoyerRelanceCiblee`/`livrerEmailDossier`, `cocherEcheance`/`devaliderEcheance`,
  `appliquerDateEcheance` — extrait de `validerEditionDate`, voie unique de la fiche et de l'assistant —, `creneauxProposesSignature`,
  `placerCreneauSignature` (sa confirmation), `ouvrirSondageCreneaux`, `ouvrirCreationAgenda` (son formulaire),
  `preparerAppelFondsDepuisDossier`, `choisirDossierQuotites`/`calculerQuotites`, `estimerFraisActe`, `calculerProrata`,
  `ouvrirPreemptionDepuisFiche`, `archiverDossier`, `changerResponsable`) ; un geste fait aussitôt porte un bouton « Annuler » ;
  réponses écrites par le code (jamais par l'IA), **seule exception : l'échange libre** (intention `conversation`, étude 11/10 : réponses plus humaines — `POST /api/assistant/converser`, `server/src/assistantConversation.js`) où l'IA en ligne rédige sans AUCUNE donnée de dossier, phrase et échanges masqués ; le ton (vouvoiement attentionné, salutation par prénom, introduction, suites proposées) est du code pur, `client/59-assistant-ton.js`. Rien n'est journalisé ni gardé sur le serveur (la phrase peut nommer un client) ; **les conversations sont gardées sur le POSTE seulement** (étude 12/10, colonne « Conversations » de la page, `client/63-assistant-conversations.js` : localStorage par collaborateur, 30 jours, 20 au plus, sans les boutons). Point terrain
  `assistant-ia-locale`. **Présentation façon Slack** (étude 11/10, 0.210.0) : page pleine hauteur, fil continu (messages groupés par auteur, avatar carré, nom et heure), « @ » cite un dossier — **le dossier choisi est imposé à l'envoi** tant que son nom reste dans la phrase (`dossierMentionneAssistant`), jamais laissé à la lecture du nom. **Widget « Demander à CLAIRE »** du tableau de bord (étude 07/10, `renderWidgetAssistant`, en tête par `enTete`) : la question tapée ou l'exemple cliqué part sur la page (`envoyerDepuisWidgetAssistant`) ; le champ n'est écrit qu'une fois (la saisie survit aux redessins). **Sur une rangée, demi-hauteur** (étude 07/10 : « moins haut, une ligne ») : la grille des widgets est en demi-rangées (`--w-demi`, chaque widget couvre 2/4/6 demi-rangées), « Demander à CLAIRE » 1/3/5 — forme compacte `w-asst-compact` (titre, champ et bouton sur une ligne, exemples sur une ligne). Une nouvelle intention = une entrée d'`INTENTIONS_ASSISTANT` (motifs, exemples — chaque exemple doit être
  compris sans IA, test `tests/assistant.test.js`) + son exécutant dans `executerDemandeAssistant`.

## Relecture d'actes — dans « Demander à CLAIRE » (depuis 0.284.0)

**L'outil « Relecture d'actes » (quatre étapes, pseudonymisation, envoi à l'API, bilan) est RETIRÉ** (étude 18/10 : « on va fusionner
Relectures d'acte dans Demander à CLAIRE qui sera l'interface ; on lui enverra les données et elle fera un compte rendu comme Claude le
ferait, sous format texte » ; choix : outil retiré ; l'agent est ouvert à tous depuis les canaux, 24/10). La relecture se demande à l'agent : outil
`controles_relecture` (`client/50-relecture-agent.js`, `server/src/assistantAgent.js`) — le POSTE lit le document entier (pdf.js, OCR des
pages sans texte, NAS ou pièce jointe), passe les contrôles de CLAIRE sans IA (`analyserCompromisOutil2` / `analyserProjetVenteOutil2`,
client/06 à 13 et 55 : dangers de l'avant-contrat, comparaison projet ↔ avant-contrat, AG, état daté, urbanisme), rend la grille de l'étude
(`grillePourModeOutil2`, mode et type de bien) et les consignes tirées des commentaires de l'étude sur ses relectures (`consignesDepuisRetours`,
`/api/audit-retours`, retirables dans Réglages › Ce que CLAIRE a appris) ; résultat MASQUÉ par le serveur comme tout résultat d'outil
(test « rien de nominatif ne part »), compté dans la limite de lecture. L'agent lit ensuite le document (`lire_document`) et rédige le
compte rendu en texte (Synthèse ; À régler avant la signature ; À vérifier ; Conforme ; Contradictions ; Pièces manquantes ; jamais
« conforme » pour un point non trouvé ; peu de bruit — la plainte de l'étude est le bruit, pas les oublis) ; « Imprimer » sous une longue
réponse (`imprimerReponseAssistant`). Les contrôles déterministes restent la base : ne pas élargir un motif sans acte réel. Réglages › IA
et relecture d'actes garde les clés (Claude, Mistral) utilisées par l'agent ; les routes `relectureClaude` / `relectures` du serveur ne
sont plus appelées par le poste.

## Pièges techniques déjà payés

- **Le texte pdf.js n'a qu'un retour à la ligne par PAGE** (items joints par une espace). Toute
  regex ancrée sur `^`/`\n` est fausse sur ce texte ; utiliser `lireTextePdfEnLignes()` (lignes
  reconstruites par position verticale) quand il faut de vraies lignes. Piège payé trois fois.
- **`\b` et les lettres accentuées** : `\b` ne se place jamais à côté de `é`/`É` (`\w` = ASCII).
  Utiliser des lookarounds `(?<![A-Za-z0-9_À-ɏ])` / `(?![A-Za-z0-9_À-ɏ])`.
- **Écrire une regex via un script Python** peut insérer un BACKSPACE (U+0008) à la place de `\b`.
  Contrôle obligatoire : `grep -c $'\x08' client/*.js` doit rendre 0.
- **Noms de fichiers macOS en NFD** : `normaliserNomPourMotif` normalise en NFC (et `_`/`-` → espace).
  Si un nom « évidemment correct » ne matche pas, comparer les points de code.
- **Survol d'un `wa-button` outlined actif** : la règle générale `wa-button[appearance="outlined"]:hover::part(base) { background: var(--paper-sunk) }` bat `.actif::part(base)` (texte blanc sur fond blanc, étude 06/10) — tout état « actif » à l'accent pose aussi sa règle `:hover::part(base)` (`.vue-bascule-btn.actif`).
- **Gestionnaire en ligne sur un composant Web Awesome** (`<wa-switch onchange="…">`, `<wa-button onclick="…">`) : le corps
  s'exécute avec le composant dans sa portée — `render()` y appelle la méthode `render` de Lit, pas celle de CLAIRE, sans
  erreur (payé le 04/10 : « Archivés » ne rafraîchissait rien). Écrire `window.render()` ; refusé par `structure-client`.
- **`onclick="f('…')"`** : l'attribut est décodé en HTML avant d'être exécuté en JS — `&#39;`
  redevient une apostrophe brute. Utiliser `escapeOnclickArg()` pour un argument JS, `escapeAttr()`
  pour un vrai attribut.
  **Tout identifiant (dossier, pièce, tâche) passé dans un `onclick` aussi** (audit 13/10 : un identifiant de dossier piégé
  s'exécutait sur tous les postes) — `'${escapeOnclickArg(d.id)}'`, refusé sinon par `structure-client` ; un nouvel identifiant de
  dossier n'est accepté par `POST /api/dossiers` que s'il suit `RE_ID_DOSSIER`.
- **pdf.js** : tout `pdfjsLib.getDocument({ … })` porte `isEvalSupported: false` (CVE-2024-4367 : un PDF piégé exécutait du code ;
  testé par `structure-client`) ; un script de CDN chargé par `index.html` porte son `integrity` (SRI) et une version exacte.
- **Écriture après une attente** (audit 13/10) : un tour de fond (NAS, Exchange) qui modifie un dossier le RELIT par
  `depot.trouverParId` juste avant d'écrire, jamais la copie lue avant ses `await` (elle effaçait la saisie d'un poste).
- **Spécificité CSS** : `input[type="text"]` bat un simple `input.ma-classe` à égalité par l'ordre
  du fichier — utiliser un sélecteur composé (déjà rencontré sept fois). Une piste de grille `1fr`
  ne descend pas sous son contenu : `> * { min-width: 0 }` contre le débordement horizontal.
  L'attribut `hidden` perd contre une règle `display` : basculer par `style.display`.
- **Réponses EWS : toujours par `server/src/exchange/xml.js`** (fast-xml-parser, 04/10 : `lireXml`, `tous`, `texteDe`,
  `identifiantElement`, `analyseEws`, `aCodeReponse`, `succesSansErreur`), jamais d'expression régulière sur le XML (l'ancien
  `desechapperXml` est retiré). Préfixes retirés (`CalendarItem`, `ResponseCode`), attributs en `@_Nom`, valeurs jamais
  converties en nombre. Les REQUÊTES restent écrites en texte avec `echapperXml`. Avant d'écrire du code maison, chercher une
  bibliothèque éprouvée (étude 04/10) — elle doit s'embarquer dans le `.exe` (esbuild, pas de fichier chargé à la volée).
- **`fetchAvecAuth` n'ajoute pas `Content-Type: application/json`** : tout appel avec un corps JSON
  doit le poser, sinon le serveur reçoit un corps vide.
- **Dates EWS** : Exchange rend tout en UTC ; un rendez-vous « toute la journée » commence à minuit
  de Paris exprimé en UTC (la veille à 22 h l'été) et finit à minuit du lendemain du dernier jour.
  Toujours convertir par `momentParisDepuisIso` (jamais `slice(0, 10)` sur la chaîne UTC).
- **Icône de la barre des tâches Windows** : la fenêtre CLAIRE (Chrome `--app`, non installée) ne
  donne à Windows que le favicon 16 px. L'icône nette vient du raccourci `CLAIRE.lnk` du menu
  Démarrer que crée le serveur (`raccourciWindows.js`, même AppUserModelID que la fenêtre, icône de
  l'exe) — confirmé par l'étude le 29/09. Ne jamais ajouter de favicons PNG (`icone.svg` seul) :
  Chrome prendrait le 16 px. Changer le profil `ClaireServeur` ou l'URL change l'identifiant.
- **Un test qui ferme une ressource en dernière ligne** (au lieu d'un `after`) fait pendre la suite
  au premier échec. Diagnostiquer avec `timeout` fichier par fichier.
- **Un filet posé après l'endroit qui tombe ne protège rien** : `erreur-demarrage.txt` et le
  gestionnaire d'erreurs sont installés avant la lecture de `config.json` (antislashs simples d'un
  chemin Windows = JSON invalide).
- **Leçons de méthode** : rejouer un PDF réel page par page plutôt que relire les regex ; mesurer
  le rendu (pixels, `getBoundingClientRect`, taille réelle d'une icône) plutôt que le déduire ;
  vérifier avant d'accuser le dernier chantier (rejouer l'ancien commit) ; sur un point de droit
  notarial, **demander la règle sous-jacente** avant d'encoder le symptôme ; ne jamais déclarer un
  bug corrigé sur une déduction.

## Conventions de travail

- **Vérifications sur le terrain** (étude, 03/10 — `server/src/verificationsTerrain.js`) : **toute mise à jour qui apporte un
  geste impossible à éprouver ici** (Exchange, Windows, 3CX, Ollama, NAS…) **ajoute son point** à `VERIFICATIONS_TERRAIN`
  (`depuis` = VERSION_APP, `source` serveur/poste/manuel) et l'appel `noterVerification` (serveur) ou
  `noterVerificationPoste` (poste) là où le geste réussit ou échoue — rien de personnel dans `detail`/`message`. Le point se
  coche seul au bureau (ou « C'est bon » dans Réglages › Mise à jour et sauvegarde pour ce qui se voit à l'œil) ; un point vérifié n'est plus
  affiché dans les Réglages et n'est cité qu'une fois, dans le rapport de la période où il l'a été (étude 06/10) ; le rapport
  technique en donne l'état (section « Vérifications sur le terrain », échecs dans « À examiner ») : **le lire avant de déclarer
  vérifié un point de « Non vérifié au bureau »**.
- **Versionnage** (numéros depuis le 04/10 — étude : « plutôt les numéros de version ») : `VERSION_APP` = **`MAJEUR.MINEUR.CORRECTIF`**.
  **MINEUR + 1 (CORRECTIF à 0) pour une nouveauté visible par l'étude** — un geste, un écran, une information ou une règle métier
  que CLAIRE n'avait pas ; **CORRECTIF + 1 pour tout le reste** — correction, ajustement d'un geste existant, présentation,
  libellé, lecture améliorée, renommage, code interne. **MAJEUR reste 0 pendant la bêta**, passe à 1 le jour où l'étude la déclare
  terminée (à la main, jamais par l'outil). Historique renuméroté selon cette règle le 04/10 (144 nouveautés du 22/09 au 04/10).
  À chaque commit qui change le comportement : `node scripts/prochaine-version.js nouveaute|correction` donne le numéro suivant et
  l'heure de Paris (jamais `date` seul : l'environnement est en UTC), puis mettre à jour `VERSION_APP` **et** ajouter une entrée
  en tête de `HISTORIQUE_VERSIONS` (`client/00-version.js`) : `{ version: '0.M.C', date: 'AAAA-MM-JJ HH:MM', resume: "…" }`.
  « À propos » affiche le numéro avec la date en petit ; `depuis` des points de `VERIFICATIONS_TERRAIN` = ce numéro (tri chiffre
  par chiffre, `comparerVersions`). Le test `structure-client` vérifie numéros uniques, chacun successeur exact du précédent par
  date (CORRECTIF + 1, ou MINEUR + 1 et CORRECTIF 0). La mise à jour automatique n'en dépend pas (elle compare le numéro de
  build de la release GitHub).
- **Publication** (étude 11/10) : avant tout envoi sur `main`, suivre `.claude/skills/publier/SKILL.md` (`/publier`) — `npm run verifier` (qui rejoue déjà les scénarios : `npm run scenarios` est un doublon de `npm test`), relecture indépendante par un second agent (`/relire`) **pour TOUTE modification** (étude 16/10 : « les tests et la relecture indépendante automatiques pour toutes les modifications de CLAIRE ») — **garde-fou de publication** (`scripts/garde-publication.js`, crochet PreToolUse de `.claude/settings.json` sur Bash et les outils GitHub) : un envoi vers `main` est refusé tant que le contenu exact de la source envoyée n'a pas la marque « verifie » (posée par `npm run verifier` réussi, si le contenu n'a pas changé pendant les tests) et la marque « relu » (`npm run relu`, après la relecture et ses corrections) ; fusion d'une demande, `gh pr merge`, API GitHub et outils GitHub vers `main` refusés ; marques dans `.git/claire/`, une modification les efface. Limites : les marques sont posées par la session (elles attestent, elles ne font pas l'étape) ; une modification faite à la main sur GitHub n'y passe pas ; depuis le 24/10 (minutes GitHub) `verifier.yml` ne tourne plus qu'à la demande (Actions › Run workflow) : les contrôles complets sont ceux de `npm run verifier` en local, et `build-exe.yml` sur `main` ne refait que lint, types et tests (la fumée dans Chromium seulement en lancement manuel) — compte rendu qui dit ce qui n'a pas pu être vérifié ; **à chaque NOUVEAUTÉ (MINEUR + 1 ; une correction n'a que la relecture, étude 22/10), un audit sécurité / qualité / performance / conformité** par un second agent avec le cadre fourni par l'étude le 13/10 (verdict, tableau Haut/Moyen/Bas, explication, remédiation — texte dans le skill `publier`, étape « 3 bis »), rapport dans `docs/audits/`, tout point « Haut » corrigé avant l'envoi.
- **Poser les questions de cadrage** (`AskUserQuestion`) quand une demande admet plusieurs
  lectures, surtout en droit notarial ou quand l'action écrit dans un agenda/une boîte partagés.
- **Garder l'interface cohérente** : jetons CSS existants (`--focus` = accent du thème choisi,
  couleurs de catégorie fixes), icônes SVG du jeu `ICONES`, composant `.dot-label` pour les statuts,
  pas d'emoji comme icône, pas de couleur inventée. Mode clair et sombre, largeur téléphone.
  **Animations** (étude 18/10, `client/86-animations.js` + bloc « Animations » de style.css) : seulement pour dire ce qui vient de se passer ; 150 à 250 ms,
  courbe douce, aucune attente avant la réaction à un clic ; opacité, position (transform) ou couleur, **jamais la taille de la mise en page** ; tout mouvement
  a son arrêt dans le bloc `prefers-reduced-motion` (couleur seule ; testé par `tests/animations.test.js`) ; un montant animé finit sur le texte exact de
  l'outil, chiffres alignés. Un nouvel écran de calcul ajoute ses montants à `SELECTEUR_MONTANTS`, un nouvel aperçu de courrier son id à `APERCUS_COURRIER`.
  **Échelle commune** (étude 04/10 : « il faut une uniformité de l'interface ») : toute taille de texte = `var(--texte-…)`
  (micro 8 réservé aux badges collés à un libellé, xxs 10, xs 11, s 12, m 13, base 14, l 16, xl 18, 2xl 20, 3xl 24, 4xl 28,
  5xl 32, 6xl 40), tout arrondi = `var(--rayon-…)` (xs 4, s 6, m 10 boutons/champs/blocs intérieurs, carte 16 cartes et
  fenêtres, pilule 999 ; cercle 50 %), toute ombre portée = `var(--shadow-card)` ou `var(--shadow-float)` (anneaux
  `0 0 0 …` et `inset` permis), espacements (padding, margin, gap) dans 0, 1, 2, 4, 6 … 16, 20, 24, 28, 32, 40, 48, 56, 64 px
  puis multiples de 8, aucune couleur `#…` hors des blocs de jetons (`--blanc-fixe` pour un blanc qui le reste dans les
  deux thèmes). Vérifié par `tests/style-uniforme.test.js` (lecteur `scripts/style-echelle.js`) ; exemptés : `@media print`
  et les zones bornées par `/* @papier */ … /* @fin-papier */` (courrier d'appel de fonds, feuille des quotités — identité
  papier). Cartes posées sur le fond : `--rayon-carte` et `--bord-carte` (sans bordure en clair).
  **Typographie** (étude 04/10 : « tu trouves les polices cohérentes ? », puis « option B ») : **Geist** partout dans
  l'interface (`var(--police)`, police variable OFL **embarquée** dans `vendor/polices/` — `@font-face` en tête de style.css,
  déclarée dans `ASSETS_STATIQUES` et les assets du `.exe`, servie en binaire par `creerMiddlewareAssetsSea` ; aucune famille
  écrite en dur hors zones papier, testé) ; pour la marque de la barre latérale (étude 24/10, valeurs exactes de l'étude dans la zone `/* @marque */ … /* @fin-marque */` de style.css, exemptée de l'échelle comme les zones papier) Instrument Sans pour le mot « Claire » (blanc dans la barre seulement) et IBM Plex Sans pour le badge « Bêta », chargées de Google Fonts ; Inter (Google Fonts), Lora, Times, Calibri
  seulement dans les zones papier et les emails ; **graisses 400 texte, 500 libellés/boutons et TOUT grand texte (titres de
  page, de carte, chiffres clés — `var(--texte-xl)` et au-delà : la taille fait la hiérarchie, pas le gras), 600 étiquettes et
  mise en valeur dans le texte, 700 badges** — rien d'autre ; **espacement de lettres -0.02em (titres à partir de 20 px), 0, ou
  0.06em (capitales)** ; **étiquette en capitales** = `var(--texte-xs)`, 600, 0.06em, sauf un badge (règle qui pose son fond :
  700, micro/xxs/xs) ; **titre de carte ou de section** (`TITRES_CARTE` : `.w-titre`, `.sm-titre`, `.jour-section-titre`,
  `.reglages-section-titre`) = `var(--texte-l)`, 500. Vérifié par `ecartsTypographie` (scripts/style-echelle.js) dans
  `tests/style-uniforme.test.js`.
  **Lisibilité et contrôles** (étude 04/10) : `--muted` clair = #647089 (contraste ≥ 4,5 sur blanc ; #8A93A9 faisait 3,1) ;
  champs de saisie et listes = 40 px, coins `--rayon-m` (comme les boutons), filtres compacts 32 px — sauf les champs
  « en place » de la fiche (`.prop-champ`, `min-height: 0`) ; **icônes 14 px** (texte, boutons compacts — `.icone` vaut
  `max(1em, 14px)`), **16 px** (boutons, barres d'outils), **20 px** (barre latérale), 24 px et plus pour une illustration
  (`TAILLES_ICONES`, testé) ; **bascules et groupes = `<wa-button-group>`** de `wa-button` outlined size s (`vue-bascule-btn`,
  choix actif = classe `actif` à l'accent, les autres sur fond blanc `--paper-card` ; `ag-nav-btn`). L'indicateur d'étapes de « Nouveau dossier » reste natif : ce n'est
  pas un choix mais une progression (numéros reliés par un trait).
  **Composants Web Awesome** (étude 04/10, choisis pour l'uniformité) : paquet LOCAL `vendor/web-awesome/` (web-awesome.js +
  web-awesome-theme.css, construits par `scripts/construire-web-awesome.mjs` — version figée 3.14.0, composants listés dans
  `COMPOSANTS`, à relancer seulement pour en ajouter ; bibliothèque d'icônes Font Awesome neutralisée, jamais `<wa-icon name>` :
  les icônes restent celles d'`ICONES`), déclaré dans `ASSETS_STATIQUES`, les assets du `.exe` et `index.html` (test
  `structure-client`). Couleurs, arrondis et polices viennent de CLAIRE : bloc « Web Awesome : jetons de CLAIRE » de style.css,
  seul endroit où un `--wa-*` est redéfini (déclaré sur `:root` ET sur chaque composant, pour suivre la barre latérale sombre).
  **Bouton d'action = `<wa-button>`** : principal `variant="brand"`, secondaire `appearance="outlined"` (fond `--paper-card`, filet `--line`, survol `--paper-sunk` — transparent, il paraissait désactivé sur le fond de page, étude 04/10), discret
  `appearance="plain"`, destructeur `variant="danger"` ; compact = `size="s"` (ou un contexte de la règle « Taille compacte ») ;
  icône dans le libellé, espacée par `::part(label)`. Plus jamais `<button class="primary|secondary|btn-annuler|btn-confirmer">`
  (test). Un `<wa-button type="submit">` n'est pas le bouton par défaut d'un formulaire : Entrée dans un champ est rétabli
  par le gestionnaire de `01-socle.js`. Test de fumée : `wa-button` défini, aucun bouton qui « avale » un bloc (balise mal
  fermée). **Familles converties le 04/10 au soir** (classes de style.css, couche Web Awesome) : bouton à icône seule =
  `<wa-button appearance="plain" class="bouton-icone">` (32 px en barre d'outils/en-tête, `size="s"` = 24 px dans une ligne ;
  couleur réglée par `color` sur le bouton, `::part(base)` la reprend) ; icône + texte discret = `bouton-discret` ; pastille
  d'action = `<wa-button appearance="outlined" size="s" pill class="action-rapide">` (28 px) ; « Ajouter … » =
  `<wa-button appearance="outlined" class="bouton-ajout">` + `<span slot="start" class="bouton-ajout-plus">+</span>` (changer
  son libellé = son nœud texte, jamais `textContent` du bouton qui effacerait le « + ») ; interrupteur = `<wa-switch>` (id,
  `checked`, `onchange` et `this.checked` inchangés ; un clic sur le `<label>` qui l'entoure le bascule par le gestionnaire de
  `01-socle.js`). Le focus d'un wa-button juste rendu attend `updateComplete`. Test `structure-client` : plus de `<button>` de
  ces familles, plus de `.slider`, balises équilibrées. **Restent natifs, volontairement** : liens-boutons (`lien-*`, « Voir
  plus », `icon-btn` à texte seul), lignes cliquables de liste, onglets,
  étapes du wizard, pastilles de source (`page-chip`, `voir-pdf-btn`), réglages des widgets, champs, listes et fenêtres.
  **Tout geste** (email, préparer, noter, créer…) est une ligne d'action `renderLigneAction` (forme
  de « À faire », même titre et même verbe qu'elle pour le même geste ; **colonnes alignées d'une ligne à l'autre** — étude 06/10 :
  `.ja-liste` est une grille, chaque `.ja` en reprend les colonnes par `--ja-cols: subgrid`, les modes compact et téléphone gardent
  leurs zones) ; tout « Ajouter … » est un
  `button.bouton-ajout` ; l'édition d'une donnée passe par des icônes (crayon, ✓, ×) ; seuls les
  formulaires gardent des boutons classiques.
  **Barre latérale** (01/10 ; **collée en haut, en bas et à gauche, angles droits** depuis le 11/10) : pas de titres de section, des liens seulement ; **en tête, un champ de RECHERCHE** (étude 20/10, `client/91-recherche-sidebar.js`, à la place du champ « Demander à CLAIRE » du 18/10) : dossiers (nom, parties, adresse, référence d'Authentic, défunt) et écrans/outils lus dans la barre elle-même (un nouvel outil de la barre y est cherchable seul), liste sous le champ, flèches + Entrée, Échap, Ctrl+K ; **« Demander à CLAIRE » = un bouton (étincelle) à côté de Claire Scan** dans la rangée sous le logo (id `tab-assistant`, pastille des messages non lus `badge-assistant`) ; **ordre depuis le 15/10 (0.249.0)** : Tableau de bord, Suivi des dossiers, Constitution de dossier, Agenda, Outils, « Demander à CLAIRE », Répertoire, Réglages ; **tiroir Outils en deux catégories titrées « Vente » et « Succession »** (étude 15/10, `.sidebar-sousmenu-titre`, masquées barre repliée), ordre alphabétique dans chacune ; **« Demander à CLAIRE » (lien, page, widget du tableau de bord) ouvert à tous depuis les canaux** (étude 24/10 ; réservé à Bastien depuis le 09/10 — `ONGLETS_ADMINISTRATEUR` reste, vide, pour un futur écran réservé) ; « Relecture d'actes » retirée le 18/10 (dans « Demander à CLAIRE ») ; **« Outils » n'est plus une page** (étude 06/10 : « supprime la page avec tous les outils et ouvre le tiroir en cliquant sur Outils ») — un clic déplie ou replie le tiroir (`toggleGroupeSidebar`, chevron sur la ligne, `ouvrirTiroirOutils` pour l'assistant et un ancien lien `definirOnglet('outils')`) ; tout nouvel outil s'ajoute au tiroir (`#sidebar-sousmenu-outils`) ; compteurs en carré arrondi rouge. **Tiroir des outils replié au démarrage** (étude 18/10). **Barre repliée** (étude 06/10, sur un exemple) : une fois ouvert, le tiroir reste déplié sous l'icône Outils, en icônes seules dans un bloc arrondi ; un clic sur l'icône le replie ; pas de volet flottant. **lien actif = trait de l'accent sur le bord de la barre + fond très léger** (étude 10/10, choix 1 des maquettes `docs/maquettes-sidebar/` ; avant : contour et point) ; **Fond plus sombre que la barre derrière « Outils » et son tiroir déplié** (`.sidebar-outils-groupe`, étude 06/10) ; **outils du tiroir par ordre alphabétique dans leur catégorie** (un nouvel outil s'y range à sa place, sous « Vente » ou « Succession »).
- **Nom d'un dossier cité (étude, 30/09)** : partout (écrans, cartes, toasts, journaux, Teams), toujours
  par `libelleDossierAffiche(d)` — « VTE - NOM », « SUCC - NOM » pour une succession — ou
  `libelleDossierParNom(nom, id)` quand seul le nom a été gardé ; jamais `d.nom` brut à l'écran.
  `d.nom` brut reste pour l'édition du champ, la recherche, le rapprochement NAS, les emails au client
  (textes de l'étude mot pour mot) et les titres des dates butoir de l'agenda (repris tels quels).
- **Formats (étude, 29/09)** : tout montant en euros passe par `formaterMontantEuros`
  (`formaterPrix`/`formaterPrixCentimes`, « 360.000,00 € », `commun/montants.js` ; le serveur l'importe sous
  le nom `formaterEuros`) et toute saisie de montant par `eurosDepuisSaisie` (jamais « ne garder que les
  chiffres » : « 250.000,00 » deviendrait 25 000 000). Toute adresse passe par `normaliserAdresse`
  (format « SAINT-AIGNAN (41110), 2 rue des Cours de Meusnes » : commune en capitales, tirets et
  CEDEX gardés) ; le destinataire d'un courrier garde la forme postale (`adressePostaleCourrier`).
- **Tableau de bord en widgets** (29/09, comme iOS) : grille de **4 colonnes** (2 sur écran étroit) à
  rangées de hauteur fixe ; deux réglages par carte : **largeur** (petit = 1 colonne, moyen = 2, grand =
  toute la ligne) et **hauteur** (1, 2 ou 3 rangées), toutes combinaisons permises. Le contenu suit la
  place (`varianteWidget` : une case = chiffre clé, une rangée = liste compacte, 2+ rangées = détail ;
  `tailleWidget(id)` dans la fonction de rendu, coque `carteWidget`). Toutes les cartes sont toujours
  affichées (sauf Avancement sans aucun dossier) : sans donnée récente, elles montrent l'appoint. **Jamais de vide dans une carte** : les listes portent `data-ajuster="N"` et
  `ajusterWidgets` les remplit par priorité (N petit d'abord) jusqu'à la hauteur de la tuile, avec
  « Voir N de plus » ; une carte qui a de la place reçoit du contenu d'appoint (à venir, prochaines
  signatures, pièces encore attendues…), pas un blanc. « Personnaliser » (ou appui long sur un titre) :
  glisser-déposer au pointeur, largeur et hauteur, retirer (×). **Widget Agenda** (01/10) = l'agenda partagé de l'office (liste du jour **jamais coupée : elle défile**, ouverte sur le rendez-vous en cours, `data-defiler` dans `ajusterWidgets`, étude 02/10 ; **sans barre visible et qui suit l'heure** — `suivreHeureAgendaJour`, chaque minute, étude 05/10) (stock `agenda-office`, `chargerAgendaWidget`,
  + `signaturesHorsAgenda`), lignes `lignesEvenementsAgendaJour` ; un clic ouvre la page Agenda au rendez-vous
  (`ouvrirEvenementDepuisWidgetAgenda`). **« Widgets »** (01/10) : liste de tous les widgets
  (`lignesGalerieWidgets`, `#widgets-overlay`), Retirer / Ajouter — retirer = `masque`, taille gardée ; tout nouveau
  widget de `WIDGETS_DASHBOARD` porte `icone` et `description`. Disposition par collaborateur : préférence
  `widgets` en base (liste blanche `WIDGETS_PREFERENCES` côté serveur, `WIDGETS_DASHBOARD` côté
  client — à modifier ensemble). Un nouveau bloc du tableau de bord = un nouveau widget. **Carte « Aujourd'hui » : les tâches à faire, les tâches faites barrées, la progression et « Ajouter une tâche »** (étude 07/10 : « laisse simplement les tâches à faire et ajouter une tâche », puis « remets les tâches effectuées barrées comme avant et la progression » — mes rappels échus/du jour/sans date, les tâches des dossiers, puis les faites du jour barrées ; message de progression sous le titre, anneau à droite ; **fête quand toute la liste est faite** (étude 07/10 : « l'animation quand tout est fait à reprendre aussi ; en faire une to-do list qui reste attractive » — `journeeBouclee` : ni tâche de dossier ni rappel du jour restant et au moins une chose faite ; bandeau + confettis une fois par jour et par poste, gardés 2 s malgré les redessins) ; plus de rappels à venir, de section « À venir » ni de « Point du matin » ; `renderMesRappels(…, 'ajout')`). Avant : **une seule liste** (étude 05/10) — mes rappels du jour et sans date en tête, les tâches, puis mes rappels à venir avec leur date (`rappelsDuJour` → `aVenir`, `renderRappelsJour(…, 'avenir')`), les cochés ; « Ajouter un rappel » reste toujours visible (`data-garder`), plus de section « Mes rappels ». **Tâches : nom du dossier en surtitre** (étude 06/10 : « en surtitre de la tâche ou du groupe de tâches, en petit » ; `surtitreHtml` de `renderLigneAction`, `.ja-surtitre`, lien `lienDossierTache`), titre de la tâche seul sur sa ligne, pas de surtitre dans le tiroir d'un groupe ni dans la fiche, pas de sous-ligne, icône « fiche » (`.ja-ouvrir-fiche`) parmi les actions secondaires ; `.ja-titre` en ellipse, déplié quand la ligne est ouverte. **Colonnes de largeur fixe communes à toutes les listes de tâches** (étude 06/10 : « aligne bien tout » ; `.ja-liste.ja-taches` : case 20, délai 100, geste 132, actions 66 px, icônes 32 px) — le subgrid n'alignait pas le tiroir d'un groupe sur sa liste ; toute liste de tâches porte `ja-taches`. **Tâches d'un même dossier groupées** (étude 05/10, partout où « À faire » est listé, `renderActionsJour` → `grouperActionsParDossier`) : une ligne commune dont la case valide tout (`marquerFaitGroupeJour`, un seul « Annuler »), un tiroir qui déroule les tâches à cocher une par une — les faites du jour y restent barrées (« k/N faites »), titre seul sans sous-titre dans le tiroir ; **le nom du dossier d'une tâche ouvre sa fiche** (étude 05/10, `lienDossierTache`, `[data-ouvrir-dossier]` pris à la capture du clic) ; tout nouveau lieu qui liste les actions du jour passe par `renderActionsJour`. Disposition
  par défaut = rectangle plein (4 × 4, 2 × 8 sur téléphone, grille en « row dense » — aucun test de placement), les plus utiles d'abord ; la changer = incrémenter `VERSION_DISPOSITION_WIDGETS` (chaque
  collaborateur y est ramené une fois).
  **Widget « Nouveautés »** (étude 18/10, 0.288.0, `client/87-widget-nouveautes.js`) : dernière nouveauté (version `M.m.0` de `HISTORIQUE_VERSIONS`), version et date, points courts, les 10 dernières (flèches et pastilles) ; petit par défaut à la place de « Dossiers ouverts », qui est retiré de la disposition par défaut (`masqueDefaut`). Le résumé d'une nouveauté est lu par l'étude : il s'écrit pour elle.
  **Widget « Statistiques »** (étude, 02/10, `renderStatistiquesDashboard`, grand × 1 rangée en fin de grille) : délais
  moyens (« N j en moyenne » sur chaque délai, même en petit — étude 03/10) depuis la **signature de l'avant-contrat** (étude 02/10 : `d.dateAvantContrat` — gardée à la création (date validée à l'import, jamais remplacée), reprise d'Authentic si vide, saisissable sur la fiche ; **plus jamais relue automatiquement dans un PDF du NAS** (étude 02/10, `retirerDateAvantContratLueNas` a retiré celles posées ainsi) — à défaut l'ouverture, `debutDossierStatistiques`) ; ouverture = `dateOuvertureDossier` (entrée « Dossier créé ») jusqu'au prêt (`dateObtentionPret`,
  historique), à la renonciation de préemption (`dateRenonciationPreemption` : `piecesTrouveesLe` puis historique) et
  à la signature passée — `statistiquesDelaisDossiers`, **tous les dossiers de l'étude, archivés compris, sans fenêtre de dates ni périmètre** (étude 02/10), moyenne/médiane/n ; avant-contrats signés ce mois / mois
  précédent / même mois N-1 (`comparaisonDossiersOuverts`, au mois de l'avant-contrat, « — » avant le premier dossier noté), sur le périmètre du tableau de
  bord (mes dossiers / tous). **Actes à l'agenda** (étude 03/10) : ventes (titre VTE/VENTE), successions (SUCC) et donations (titre commençant par
  DONATION) de l'agenda partagé, **sur tous les mois de l'année** (étude 03/10 : année en cours entière, rendez-vous placés jusqu'au
  31/12 compris, vs N-1 entière ; passés / à venir et N-1 au même jour au survol ; `compterActesAgendaPeriode`,
  `GET /api/agenda/actes-annee` : mois jamais lus lus en arrière-plan un à un, « … » tant que c'est incomplet ; rendez-vous
  confirmés, ni annulés, ni « à replacer », ni options).
- **CLAIRE en application sur les postes** (étude 02/10) : pas de PWA (Chrome n'installe qu'en HTTPS ou sur localhost,
  les postes ouvrent `http://<IP>`) ni de logiciel Windows (la page vient du serveur : rien à mettre à jour sur un poste).
  Réglages › Général › « Ce poste » (masqué sur localhost) télécharge `Installer-CLAIRE-sur-ce-poste.vbs`
  (`installationPoste.js`) : raccourcis bureau + menu Démarrer, Chrome sinon Edge `--profile-directory="Claire"
  --app=<adresse du serveur>`, AppUserModelID posé par PowerShell (`scriptPowerShellRaccourcisPoste`) pour l'icône nette,
  icône `GET /api/poste/icone.ico` (hors session, `.ico` embarqué dans l'exe). Non vérifié sur un vrai Windows.
- **Connexion Exchange connue du poste** (08/10, `chargerReglagesExchange`) : « Envoyer », crayon, glisser et étirer un rendez-vous dépendent de `exchangeReglages` lu au démarrage ; une lecture manquée (serveur qui redémarre après une mise à jour) est retentée toutes les 15 s, relue toutes les 5 min, avant d'ouvrir la modification d'un rendez-vous et à l'ouverture de la fenêtre d'email ; la grille de l'agenda est redessinée quand l'état change. Avant, le poste se croyait sans Exchange jusqu'au F5 (étude 08/10 : « je ne peux plus envoyer d'email depuis CLAIRE », « je ne peux plus modifier les noms / déplacer les rendez-vous »).
- **Fond grisé d'une fenêtre** (02/10) : il ne ferme que par `clicSurFond(event)` (appui ET clic sur le fond) — sinon une sélection de texte relâchée hors de la fiche la fermait.
- **Texte d'aide** : ne décrit pas ce que le bouton dit déjà ; il dit ce qui manque. Une toute
  nouvelle confirmation commence par son verbe d'action (`boutonConfirmation`). **Une explication
  n'est jamais un paragraphe** (étude, 29/09 : « ça charge trop l'interface ») : elle va dans une
  pastille « i » à côté du titre ou du libellé (`infoBulle(texte)` dans un gabarit, `<span
  class="info-i" tabindex="0" data-info="…">` en HTML, `definirInfoBulle` pour la changer). Restent
  en texte visible : un état, un résultat, une erreur, une liste vide. **Réglages** : rubriques à
  gauche (`SOUS_ONGLETS_REGLAGES`, une par sujet depuis le 01/10 : Général, Collaborateurs, Signature des
  emails, Modèles d'emails, Rappels, Agenda et Outlook, Téléphonie 3CX, Authentic, Pièces et Claire Scan, Noms de fichiers du NAS, IA et relecture d'actes,
  Signalements, Mise à jour et sauvegarde — classées sous quatre titres depuis le 03/10 : L'étude, Connexions, Dossiers et actes, Maintenance, `.reglages-nav-groupe` ; chaque section qui enregistre a son propre bouton), une colonne de lignes `.reglages-option` / `.reglages-champ`
  dans des `.reglages-section` — pas de cartes en grille.
- **Règles de code** (étude, 04/10) : `npm run lint` à la racine (ESLint, `eslint.config.js` : erreurs réelles seulement —
  variable inconnue, fonction ou clé en double, code inatteignable ; style laissé au fichier voisin) doit rendre **0 erreur**
  (la construction du `.exe` s'arrête sinon) **et 0 avertissement** (depuis le 04/10 11 h 21 ; un avertissement = une variable
  locale jamais lue, à retirer, jamais par un `eslint-disable`). Sur le poste, `no-unused-vars` ne regarde que les variables
  locales (`vars: 'local'`) : une fonction de premier niveau est appelée depuis le HTML ou un autre fichier, ESLint ne le voit
  pas ; le **code mort de premier niveau** est refusé par `tests/structure-client.test.js` (nom déclaré jamais cité dans le
  code, `index.html` ni les tests). Un nom cité seulement par un test est du code mort toléré : le retirer avec son test.
  **Avant tout push sur `main` : `npm run verifier` en dernier, après la toute dernière modification, puis regarder sur GitHub
  qu'une construction a démarré ET qu'elle est verte** (04/10 : la version 10:36 n'a jamais été construite — lint lancé avant le
  découpage, puis filtre de chemins du workflow sans `client/**`). `npm run verifier` = lint + les deux suites. **Une règle appliquée des deux côtés (poste et serveur) s'écrit UNE fois dans `commun/`** (04/10 : fini les « miroirs à
  modifier ensemble » — planning, SAFER, fonds, montants, libellé, checklist) : IIFE `(function (exporter, C) { … exporter({…}); })(…)`,
  `C.nom` pour une dépendance d'un autre fichier commun, pas de DOM ni de `require` d'une bibliothèque, rien de propre à un
  monde ; nouveau fichier = `commun/manifest.json` + `<script>` dans `index.html` avant `client/` (test `structure-client`,
  assets et `.exe` par le manifeste). Le serveur `require('../../commun/x')` (chemin littéral, esbuild l'embarque).
  **Les fichiers de `client/` partagent leur portée** :
  leurs déclarations de premier niveau sont relevées à chaque lint par `scripts/globaux-client.js` (espree) et données à ESLint en
  globaux — sans cela, 5 882 `no-undef` et la construction du `.exe` s'arrête (payé le 04/10 à 10 h 36 : version jamais
  construite) ; un nom déclaré dans deux fichiers est refusé par `tests/structure-client.test.js`. Un fichier du poste reste **sous 3 000 lignes**
  (test) : un nouveau sujet = un nouveau fichier `client/NN-sujet.js` ; un code qui touche un sujet va dans le fichier de ce
  sujet. Pas de `script.js` : il n'existe plus.
- **Typage progressif** (04/10, `tsconfig.json`, `npm run types`, lancé par la construction du `.exe`) : TypeScript vérifie
  sans compiler les fichiers qui commencent par `// @ts-check` — tout `commun/`, `scripts/`, et côté serveur `fusionDossiers`,
  `exchange/xml`, `tachesAgenda`, `piecesChecklist`, `jobs/rappels`. Il attrape une propriété inexistante, un mauvais nombre
  d'arguments, un export absent (vérifié : un troisième argument à `formaterMontantEuros` est refusé). Les types viennent de
  l'inférence et de JSDoc (`@param`, `@returns`, `@typedef` — ex. `Echeance` dans `commun/planning.js`) ; `strict` est coupé.
  **Tout nouveau fichier pur** (commun, serveur sans Express ni DOM) commence par `// @ts-check` ; un fichier existant y passe
  quand on le retouche, en corrigeant ce que tsc relève — jamais par `// @ts-ignore`. Les fichiers de `client/` ne sont pas
  vérifiés (globaux partagés entre 44 fichiers, hors de portée de tsc sans déclarations).
- **Toute nouvelle fonction pure** : la déclarer `function` (ou `var` pour une table) pour la
  tester ; les fonctions qui touchent `dossiers`/le DOM se vérifient dans un vrai Chromium
  (Playwright, `/opt/pw-browsers/chromium`) avec un serveur réel et des dossiers inventés.
- **Environnement de développement** : les CDN (pdf.js, tesseract, docxtemplater, Google Fonts),
  Ollama, le NAS, Exchange et les services Microsoft sont injoignables ici — le dire dans le compte
  rendu plutôt que présenter comme vérifié ce qui ne l'a pas été.

## Comment tester

- `npm test` à la racine (client, `node:test`, aucune dépendance) et `cd server && npm test`.
- **`npm run types`** (04/10) : vérification de types des fichiers `// @ts-check` (voir « Typage progressif »), 0 erreur exigé.
- **`npm run fumee`** (04/10, `tests/fumee/fumee.mjs`, Playwright + Chromium, ≈ 15 s) : la page servie par le vrai serveur
  (base en mémoire, quatre dossiers inventés dont un abîmé, une succession, un archivé), CDN coupés, bureau et téléphone :
  tableau de bord, chaque écran de la barre latérale, une fiche de chaque sorte et ses onglets — **aucune erreur de page ni de
  console**. Le faux guichet de l'extension (`tests/fumee/extension-gnau.mjs`, ≈ 10 min) n'est joué que si l'extension ou ce qu'elle lit a changé (`scripts/fumee-extension-si-besoin.js`, étude 18/10 ; `--forcer` sinon). Lancé par la construction du `.exe` après les deux suites : c'est le seul filet contre une erreur d'exécution (ordre
  de chargement, `undefined.x` au rendu). Un nouvel écran de la barre latérale s'ajoute à `ONGLETS`. `npm run verifier` l'inclut.
- **`npm run scenarios-authentic`** (19/10, `tests/fumee/authentic-scenarios.mjs`, lancé par `npm run fumee` et sur GitHub) : banc Authentic → CLAIRE
  de bout en bout — le vrai serveur, une vraie fenêtre CLAIRE dans Chromium, les pages d'Authentic envoyées par la route de l'extension au format de
  `releve.js` (31 scénarios : rattachement par noms puis par référence, fiches client et bien, onglets, recherche d'immeubles, deux dossiers ouverts,
  même nom des deux côtés, conjoint, promesse, ancien dossier, copropriété, deux biens, succession, création, page revue, fenêtre fermée, deux
  fenêtres…). **Tout changement de la liaison avec Authentic ajoute ou adapte son scénario.** `npm run scenarios-authentic-cent` (≈ 12 min, **à lancer à la main** —
  retiré du contrôle GitHub par l'étude le 21/10, trop long à chaque envoi ; à rejouer après un changement de la liaison avec Authentic) : cent cas tirés (graine fixe) — ventes et successions créées depuis Authentic ou déjà dans CLAIRE (vides, à moitié
  remplies, complètes, fausses), marié / pacsé / veuf / divorcé / célibataire / concubins, conjoint absent des comparants, 0 à 3 biens, fiches
  avant ou après la création ; tout ce qu'Authentic a montré doit être sur la fiche sans second passage (`CAS=n` pour un seul cas).
- `tests/helpers/load-app.js` charge les fichiers de `client/manifest.json`, dans l'ordre, dans un `vm.Context` avec un faux DOM. Deux
  limites : seules les `function` et `var` de premier niveau y sont visibles (un `const`/`let` est
  invisible) ; un tableau venu du contexte `vm` fait échouer `assert.deepEqual` — comparer des
  chaînes jointes.
- Côté serveur, les services extérieurs sont injectables (faux Ollama
  `server/test/helpers/faux-ollama.js`, transport SMTP, client Anthropic/Mistral, `poster` EWS) :
  aucun test n'ouvre de connexion réelle.
- En ajoutant ou modifiant une regex d'extraction, ajouter le cas dans le fichier de test du
  thème (`dates`, `engagements`, `parties`, `notaires`, `adresse`, `offre-pret`…), texte reprenant
  la structure réelle avec des noms inventés.
- **Rejouer de vrais PDF** (avis de taxe foncière, appel de charges, état daté, relevé de compte)
  sans navigateur : `npm i --no-save pdfjs-dist@4.10.38` à la racine, puis
  `node tests/outils/rejouer-pdf.mjs [--lignes] fichier.pdf …` — mêmes items que le pdf.js du
  client, tous les lecteurs du poste appliqués, résultat en JSON. Les PDF déposés dans une
  conversation sont sous `/root/.claude/uploads/<session>/` ; ils ne sont jamais commités.

## Ce qui reste ouvert

- **Appel de fonds** : aperçu de pagination A4 non repris ; frais et droits de l'acte estimés par le barème depuis le 06/10
  (à vérifier). **Restent à brancher pour un décompte entièrement rempli** (étude 06/10) : appel de charges du syndic lu seul sur
  le NAS, acompte sur frais (relevé JurisWeb — emplacement à demander). **Encore à lire, en attente d'exemples réels** : montant des
  frais de garantie dans l'offre de prêt.
  **À confirmer par l'étude** : exclusion de la cotisation au fonds de travaux du prorata de charges
  (choix par défaut, décochable). Piste : reporter le fonds de travaux lu dans l'état daté trouvé sur
  le NAS sur la fiche (`d.fondsTravaux.montant`) — aujourd'hui l'outil Appel de fonds n'écrit rien.
- **Classeur des scans** : **à confirmer par l'étude** — la rubrique de chaque type (urbanisme et
  entretien en « AAE » d'après l'arborescence, voir `TYPES_SCAN` ; avis de taxe foncière en
  « Comptabilité », confirmé par l'étude le 30/09) ; **testé au bureau le 30/09 au soir : « le scan
  fonctionne »** (partage `\\192.168.60.5\Scan` joint, rangement dans les dossiers clients) ; restent
  à observer à l'usage : temps et qualité de l'OCR des scans du copieur Toshiba, volume quotidien. Le script Python fourni
  (`claire-classeur-scans`) n'est pas repris : il visait une autre application (Electron,
  arborescence et numérotation inventées) et se trompait de type sur les pièces réelles.
- **Banc d'essai d'extraction** : cadré dans `docs/spec-banc-essai-extraction.md`, délégué, pas
  encore engagé.
- **Relecture d'actes** : non vérifiée avec une vraie clé API (qualité, durée, coût, contradictions)
  — à juger par l'étude sur des actes déjà relus, avec le mode commentaires. Avant l'usage réel,
  demander à Mistral : rétention zéro, absence d'entraînement, accord de sous-traitance. Connecteur
  openlegi : construit le 18/10 (0.281.0), voir contrainte 1.
- **Routines de CLAIRE** : phases 1 à 4 du cadrage (`docs/spec-routines-claire.md`) à faire — revue du matin et veille de signature par le code, puis le « poste CLAIRE » sans écran et ses documents (constitution, appel de fonds, autorisations de notoriété), puis l'IA en ligne (relance des pièces, dates, veille juridique), puis l'autonomie ; widget « Propositions de CLAIRE » du tableau de bord non fait (« À traiter » des canaux en tient lieu) ; jours fériés non pris en compte par le planificateur ; canaux : « Jamais pour ce dossier » ne se règle encore que par routine entière, pas par geste ; le serveur ne vérifie pas qui parle (collaborateur déclaré par le poste).
- **RGPD — IA en ligne** (point de l'étude, 18/10) : « Demander à CLAIRE » envoie par défaut des textes pseudonymisés à
  Anthropic (Claude), sinon à Mistral, plus la recherche web et OpenLegi. À faire par l'étude, hors du code : inscrire ces
  traitements au registre (finalité, données envoyées après masquage — montants et dates en clair —, sous-traitants, pays,
  durée de conservation chez eux), obtenir l'accord de sous-traitance (DPA) et la rétention zéro de chaque fournisseur, et
  décider si le masquage par règles suffit (un nom inconnu des fiches écrit en minuscules passe). Le dépôt ne contient aucun
  registre ; `server/README.md` (« Ce qui part chez le fournisseur ») décrit ce que le code envoie.
- **Confirmé au bureau le 30/09** : la connexion EWS au calendrier partagé de Sophie fonctionne en
  lecture et en écriture (« la connexion et modification fonctionne pour l'agenda partagé ») ; au soir,
  testés par l'étude et déclarés fonctionnels : l'agenda, Claire Scan, les brouillons d'email (`.eml`
  ouverts dans Outlook), la création d'un nouveau dossier depuis l'export Authentic (ZIP) ; puis la
  mise à jour en un clic (Réglages › Mise à jour), le démarrage automatique de CLAIRE au lancement du
  serveur, le lien vers une pièce ouvert depuis une notification Teams et l'icône de l'exe (nette).
- **Non vérifié au bureau** : « Demander à CLAIRE » avec un vrai Ollama (compréhension des phrases ambiguës par llama 8B, temps de réponse ; ici seuls les mots-clés et un faux Ollama ont été joués) ; l'installateur « CLAIRE en application » d'un poste (`.vbs`, PowerShell, icône servie
  par l'exe) ; les emails des dossiers (réponses EWS réelles, accès délégué aux « Éléments envoyés » des
  collaborateurs, pièces jointes réelles, résumé par Ollama) ; la forme réelle du `.ics` de la visio ADNOV (aucun exemple reçu) ; l'envoi d'email depuis CLAIRE (CreateItem/SendItem réels, ReplyToItem avec pièces jointes, droit « Envoyer en tant que » chez Fichorga, taille maximale acceptée par Exchange, premier jet d'Ollama) ; le dossier « Fausses minutes » (emplacement, nommage des PDF, tailles réelles, `.eml` lourd dans Outlook, WeTransfer) ; l'intégration
  3CX (forme réelle de %CallerNumber%, fermeture de l'onglet ouvert par 3CX) ; le repli `SoftDelete` d'une suppression ; le sondage de créneaux (lecture réelle des réponses dans la boîte, boutons
  dans Outlook, options « Provisoire », page de réponse publiée — dépôt public à créer par l'étude) ; le détail des écritures EWS (déplacement et suppression d'un
  rendez-vous, note du Lieu, dates butoir en journée entière, noms exacts des catégories de couleur,
  reprise des dates butoir existantes au premier tour — une seule fois chacune) et de la lecture
  (forme réelle des journées entières, volume par tranche) ; service NSSM (si utilisé) ; reçus comptables (« Fonds reçus ») au-delà des
  deux PDF fournis.
- **Critères de sortie de bêta** (convenus) : quelques semaines sans bug bloquant, une restauration
  de sauvegarde testée, les points ci-dessus confirmés ; en bêta, seulement des corrections. Relecture
  d'actes en bêta après une dizaine d'actes relus avec commentaires et un coût jugé acceptable.
- **Bibliothèques à envisager** (étude 04/10, après fast-xml-parser) : `ical.js` pour lire les `.ics` (visio ADNOV,
  `lireInvitationIcs`), construction des `.eml` par nodemailer (MailComposer) côté serveur, une petite bibliothèque de rendu
  sans compilation (Preact + htm ou lit) pour les nouveaux écrans.
- **Pistes non engagées** : favicon reflétant l'urgence du portefeuille ; en-tête CLAIRE sur la
  fiche imprimée ; apprentissage des recatégorisations faites après enregistrement
  (`changerCategorie`) ; mémoriser le compte client (`compte : N`) des reçus comptables ; resserrer
  les motifs d'après les erreurs fréquentes du journal (phase 3 de l'extraction).
- **Courriers d'interrogation d'une succession** (étude 15/10, 0.238.0, `commun/courriers-succession.js`, `client/72-constitution-dossier.js`) : neuf textes de l'étude **mot pour mot** (banque, assurance-vie, CPAM, caisse de retraite, CARSAT, MSA, mutuelle, EHPAD, impôts), défunt gardé sur la fiche (`d.defunt`) ; un nouveau modèle = une entrée de `MODELES_COURRIER_SUCCESSION` + son test, texte fourni par l'étude, jamais reformulé. **Courriers de la Constitution de dossier FIDÈLES aux modèles à la ligne près** (étude 15/10, 0.244.0) : décrits ligne à ligne (`documentCourrierVente` / `documentCourrierSuccession` : '' = ligne vide, `**gras**`, `__souligné__`, tableaux en twips du modèle), composés en Word, PDF/A et aperçu par `client/73-courrier-fidele.js` aux positions des originaux (questionnaire d'assainissement = page 2 du Word de l'étude, telle quelle) — toute retouche se compare aux originaux ligne par ligne (pdfplumber, Word passé par LibreOffice), jamais à l'œil ; courrier vierge = modèle `autre` ; recherche du répertoire d'une succession : services successions d'abord, banques des prêts en dernier.
- **Constitution de dossier** (étude 15/10, 0.240.0, outil du tiroir, `commun/constitution.js`, `client/72-constitution-dossier.js`, `server/src/routes/constitution.js`) : un dossier rattaché, les courriers de l'office préparés en série — **« Enregistrer dans « Constitution » »** (étude 15/10) : tous les courriers cochés d'un clic dans le sous-dossier « Constitution » du dossier client du NAS, PDF/A et/ou Word, **signés (tampon + signature « p/o ») ou non** ; aussi Télécharger, Imprimer ; **chaque courrier en papier OU par email** (0.243.0 : email par défaut quand le destinataire du répertoire a une adresse ; corps = le texte du courrier sans l'en-tête, `corpsEmailCourrierConstitution`, questionnaire joint en PDF ; « Envoyer les emails » une fenêtre par courrier, rien ne part sans « Envoyer ») ; écran en deux colonnes, l'aperçu du courrier choisi à droite, « + » pour un second courrier du même genre, recherche par nom dans le répertoire. **Authentic est la base, jamais le compromis** : TOUTES les parcelles de TOUS les immeubles d'Authentic (`d.authentic.immeubles`) par commune, TOUS les vendeurs avec le domicile de leur fiche client (`d.authentic.fichesClients`), défunt = fiche portant une date de décès, régime de cette fiche ; donnée absente = « à compléter » saisissable (`d.defunt`), jamais devinée. Vente (`circuitCourrierVente`) : mairie en papier ; Blois péril en ligne, alignement/numérotage par courriel (`geometres.notaires@blois.fr`, confirmé par l'étude) ; assainissement à Agglopolys (EPCI 200030385) ou à la communauté de communes (Grand Chambord, adresse saisie une fois) ; CU et DIA = GNAU, pas des courriers. Succession : 9 modèles, tous cochés sauf la mutuelle. **Plan cadastral surligné joint à chaque courrier de vente** (étude 15/10, 0.251.0, `client/78-constitution-plan-cadastral.js` : un plan par commune tiré de cadastre.gouv.fr par le navigateur du serveur dès la commune connue ; imprimé derrière chaque courrier, joint à l'email, enregistré dans « Constitution » et dans l'archive, à part du PDF/A). **Étude 18/10 (0.283.0)** : email = texte du courrier SANS « Ledit immeuble appartenant à … » (`pourEmail`) + le courrier TOUJOURS joint en PDF (+ plan), objet « Demande - … » ; « Un seul email à la mairie » par commune (courriers cochés adressés à la mairie, un plan, `corpsEmailGroupeMairieConstitution`) ; un seul format enregistré (PDF OU Word) ; aperçu = page A4 aux positions du PDF (`htmlCourrierFidele` + `paginerApercuCourrier`), paragraphes et destinataire corrigés sur la page (`doc.retouches`, appliquées par texte d'origine à Word, PDF et email — `appliquerRetouchesConstitution`) ; impôts d'une succession au SPFE de Blois ; CARSAT `notaires.premieredemande@carsat-centre.fr` pour un défunt du 41/45. Un nouveau courrier = un modèle dans `commun/` (texte de l'étude mot pour mot) + son test.
- **Autorisations de fonds d'une succession** (étude 23/10, 0.324.0, `commun/autorisations-succession.js`, `client/108-autorisations-succession.js`) : trois modèles de l'office (déblocage, transfert conjoint, transfert héritier) repris MOT POUR MOT, PDF d'un clic depuis l'outil « Autorisations de fonds » (tiroir Outils › Succession) ou le bouton « Autorisation » d'un héritier de la fiche ; identité reprise des fiches client d'Authentic, « à compléter » pour ce qui manque (jamais deviné) ; modèle « héritier » = transfert au nom du CONJOINT SURVIVANT (confirmé par l'étude 23/10) ; écran en deux colonnes (parties / aperçu éditable), PDF et email par ligne ou en lot, texte de l'email = premier jet de CLAIRE ; un nouveau modèle = une entrée de `documentAutorisationSuccession` + son test, texte fourni par l'étude.
- **Fiches succession** (étude 15/10, 0.245.0, `commun/succession.js` + `client/74-fiche-succession.js`) : même fiche qu'une vente, déroulé propre —
  ouverture (RDV avec Sophie, `d.succession.ouvertureLe`) → notoriété à 1 mois (**date butoir**, confirmée par le RDV placé dans l'agenda) → contrôle des droits/inventaire à 2 mois → déblocage puis réception des fonds
  (conjoint survivant : transfert des comptes) → attestation immobilière + déclaration de succession à 6 mois ; **1 et 2 mois comptés depuis l'ouverture, 6 mois depuis la DATE DU DÉCÈS** (étude 16/10 ; `decesSuccession` : `d.defunt.decesDate`, sinon la fiche client d'Authentic décédée ; depuis l'ouverture tant que le décès n'est pas connu). Types : notoriété seule / notoriété + DS (sans immobilier, actif > 50 000 € ; **les deux actes signés ENSEMBLE entre 4 et 6 mois**, une seule étape, étude 15/10) / classique — proposé par CLAIRE, choisi sur la fiche (`d.succession.type`) ;
  actes en plus lus dans le tableau « Rédaction » d'Authentic (`actesSuccessionAuthentic`, `d.authentic.actesSuccession`, **non vérifié sur une vraie page**). Pièces
  (`PIECES_SUCCESSION`, par le nom du fichier) ; notoriété retenue par acte de décès, actes de naissance, FCDDV, donation entre époux et testament tranchés. Étapes cochées
  dans `d.echeancesValidees` (`echeanceValidee` délègue à `etapeSuccessionValidee`). Défunt = `defuntConstitution` (Authentic, corrections dans `d.defunt`, régime compris).
  **Courriers : jamais de soulignement repris des modèles** (le bleu souligné marquait les variables d'Authentic).
  **Défunt et héritiers = qualité des comparants d'Authentic** (sans qualité « Défunt » lue : le PREMIER comparant si le nom du dossier le désigne, `premierComparantDefunt` ; rubrique parfois collée dans un seul champ — icônes « person », « euro_symbol »… et qualité collée au prénom, `texteComparantsNormalise` — ; bien principal du Nouveau dossier = premier bien de la liste, 16/10) (étude 15/10, 0.246.4 : « Défunt », « Héritier », légataire, conjoint survivant — `comparantsAuthentic` rôles `DEFUNT`/`HERITIER`, `defuntDepuisFiches` les fait passer avant la date de décès d'une fiche, `personnesSuccession`) ; sans comparants lus, défunt = fiche avec date de décès, héritiers = les autres parties. **Conjoint survivant** (étude 19/10, succession BARON) : la personne du volet de l'époux ouvert dans la fiche du DÉFUNT (marié/pacsé, vivant) entre au dossier et figure avec les héritiers, qualité « Conjoint survivant » (`conjointSurvivantSuccession`, `conjointSurvivantAuthentic`) ; **pages d'un même dossier réunies** (`fusionnerGroupesAuthentic` : même référence, ou mêmes noms et même type) ; complément d'une succession = un bien par immeuble d'Authentic (`appliquerBienSuccession`), jamais leurs parcelles sur un seul. **Bien retiré à la main** (étude 19/10, croix dans « Modifier le défunt, les héritiers et les biens », `retirerBienSuccession`) : gardé dans `d.authentic.biensRetires` (adresse, parcelles), jamais remis par Authentic (`bienRetireSuccession`). **Fiche client d'un héritier nommé seulement dans les comparants** (étude 19/10, succession VIEL) : rattachée à la succession et ajoutée aux parties (`partieSuccessionDeLaFiche` lit `comparantsSuccession`, nom de naissance ou d'usage, prénom exigé).
  **Claire Scan d'une succession** (étude 15/10, 0.247.0, `client/75-factures-succession.js`) : factures → sous-dossier « Factures à régler », courriers et renonciations → « Courrier reçu » (créés s'ils manquent, `SOUS_DOSSIERS_CREES`/`sousDossierCree`), état civil/identité/RIB/titre gardent leur rubrique ; organisme et montant lus sur la facture → `d.succession.factures` (onglet « Factures » de la fiche — 0.248.0, ajout à la main —, case « réglée », carte du Tableau, liste en tête de Claire Scan) et Teams à **Sophie GOSSART** (adresse dans Réglages › Collaborateurs, `NOTAIRE_TEAMS`) par `POST /api/notifications/facture-succession`, une fois par fichier.
  **Ventes aussi** (étude 15/10, 0.250.0, `client/77-vente-outils-fiche.js`) : « Placer dans l'agenda » sur la carte « Fixer le rendez-vous » (`rdvAgendaVente`) et ligne « Outils » de l'onglet Dossier (`outilsVenteFiche` : agenda, appel de fonds, provision, prorata, quotités dès deux acquéreurs, contrôle de l'urbanisme — chacun ouvert sur le dossier, données de la fiche reprises).
  **Décompte et appel de fonds** (étude 16/10, 0.255.0) : étapes `decompteSuccession` (« Envoi du décompte à faire valider ») et `appelFondsSuccession` (« si la comptabilité ne couvre pas nos frais », « Pas nécessaire » = `d.succession.appelFondsInutile`) 10 jours avant le DERNIER rendez-vous d'acte placé (`JOURS_AVANT_DERNIER_RDV_SUCCESSION`), rappel Teams le jour même, faites d'elles-mêmes une fois ce dernier acte signé ; conjoint survivant : comptes transférés, l'étude ne reçoit rien. **Clôture / transfert des comptes cochés seuls** (`server/src/clotureComptesEmail.js`) : courrier de clôture/déblocage/transfert des COMPTES relevé dans Authentic (`d.authentic.courriersBanque`, `courriersBanqueSuccessionAuthentic` — ni régime matrimonial, ni dossier, ni interrogation « au jour du décès », ni frais funéraires) ET email envoyé à au moins une adresse hors fiche et hors étude (copie permise), objet nommant le défunt par son NOM DE FAMILLE et parlant des comptes (ou envoyé le jour du « Mail le » d'Authentic), de la veille du courrier à J+30, notoriété signée, nom porté par une seule succession en cours ; seuls les envois qui nomment une succession sont gardés (45 jours, `envoisNonRattaches`) — jamais un seul signal, une seule détection (`d.detectionsEmails.clotureComptes`) ; tâches d'« À faire » le jour de l'échéance, cartes « En attente » sans rendez-vous placé.
  **« Nouveau dossier » d'une succession** (étude 16/10, client/79-nouveau-dossier-succession.js) : bloc « Succession » de l'étape Vérifier (`#wizard-bloc-succession`, `.succession-seul`) — défunt, date et lieu du décès, conjoint survivant (« Selon Authentic » par défaut), type proposé (`typeSuccessionPropose`), rendez-vous d'ouverture, héritiers et biens en lecture — lus avec les règles de la fiche sur un dossier provisoire (`propositionWizardSuccession`) ; à l'ajout, seul ce qui diffère d'Authentic devient correction (`appliquerSaisieWizardSuccession` → `d.defunt`, `d.succession`), fiches client retenues ; aucun champ de vente ni panneau de révision (`renderPanneauRevision` coupé), récapitulatif propre (`lignesRecapSuccession`).
  **Plusieurs rendez-vous par succession** (étude 16/10, 0.253.0, `rendezVousSuccession` de commun/succession.js, client/76) : `d.succession.rendezVous` = { id, etape — ouvertureSuccession, notoriete, declarationSuccession, acte, autre —, titre, date, heure, itemId } ; tout rendez-vous créé pour une succession (fiche ou agenda) s'y AJOUTE (`noterRendezVousSuccession`, jamais d'écrasement), déplacé/supprimé dans l'agenda de CLAIRE il suit (`majRendezVousSuccessionAgenda`, reconnu par son itemId — `dossierDeEvenement` → `successionDuRendezVous`, l'agenda ne lit que les « VTE ») ; `rendezVousSignature` d'une succession = le prochain rendez-vous d'acte (`synchroniserSignatureSuccession`) ; une fiche d'avant (date seule) se lit comme un rendez-vous « acte » ; ligne « Rendez-vous » de l'onglet Dossier + « Ajouter un rendez-vous ». **Agenda comme pour les ventes** (étude 16/10, 0.254.0) : le serveur reconnaît les « SUCC - NOM … » (`extraireReferenceSuccession`, `dossierSuccessionPourEvenement` : itemId connu d'abord, puis les noms parmi les SUCCESSIONS seulement ; un « VTE » ne va jamais à une succession — `dossierDeRendezVousAgenda`), étape lue dans le titre (`etapeRendezVousSuccessionDepuisTitre`, « ? » jamais un acte), et tient la liste à jour à chaque tour (`synchroniserRendezVousSuccessions` → `rendezVousSuccessionDepuisAgenda` : ajouté, déplacé, retiré s'il a disparu de la période lue, jamais un archivé) ; **pas de participation** : ni confrère ni probabilité sur un rendez-vous de succession ; « Envoyer le lien » de la visio propose les héritiers (`destinatairesVisio`).
  **Étude 21/10 (0.308–0.309)** : titres d'agenda reconnus sans le mot SUCC — « NOTO / NOTORITE / NOTORIETE [-] prénom NOM », « INVENTAIRE + NOTO », « INVENTAIRE et NOTORIETE » = notoriété ; « INVENTAIRE … » seul = rendez-vous du contrôle des droits et de l'inventaire (étape `controleDroits`, 2 mois depuis l'ouverture, jamais une signature) ; « SUCC - / SUCCESSION [-] prénom NOM » seul = déclaration (API + DS) ; le dossier se retrouve par le NOM DU DÉFUNT. **Notoriété + déclaration = DEUX étapes, deux rendez-vous possibles** (un seul rendez-vous « SUCC - … » sert aux deux tant que la notoriété n'a pas le sien ; notoriété entre 4 et 6 mois du décès) ; **jamais d'attestation immobilière ni de pièces d'immobilier pour ce type** ; **décompte, projet (`projetSuccession`) et appel de fonds seulement pour la déclaration**, 10 jours avant son rendez-vous ; les actes ajoutés dans Authentic (« ACT Attestation SUCC … T@ ») ne sont plus des étapes de la timeline (leur état rédigé / en cours / signé se lit dans le bloc Dossier). Conjoint survivant = la personne mariée au défunt (volet de sa fiche, jamais notée explicitement) ou ajoutée à la main dans « Nouveau dossier » (`wizardSuccessionAjouts`, qualité « Conjoint survivant » → `conjointSurvivant` vrai). Rendez-vous lus depuis Authentic : demandés, **pas encore faits** (structure de page attendue).
  **Agenda et arbitrage reliés à la fiche** (étude 15/10, 0.249.0, `client/76-succession-agenda-arbitrage.js`) : « Placer dans l'agenda » sur les cartes ouverture / notoriété / déclaration (Nouveau rendez-vous prérempli, `rdvAgendaSuccession` ; ouverture notée sur la fiche, acte = case signature) ; « Arbitrage forfait mobilier » depuis le contrôle à 2 mois, résultat sur la fiche (`d.succession.arbitrage`).
  **Tout vient d'Authentic, aucune analyse** (étude 15/10) : pas d'analyse ni d'extraction sur la fiche ; fiche client gardée ENTIÈRE (`retenirFicheClientAuthentic` :
  naissance, nationalité, profession, domicile, situation, téléphones, emails) ; fiche bien gardée entière parmi `d.authentic.immeubles` (`appliquerBienSuccession` :
  plusieurs biens, fusion par adresse ou parcelle commune ; `d.biens` suit).
  **Pièces d'après Authentic** (étude 15/10) : « Actes de naissance » cochée quand TOUTES les demandes d'actes de naissance vues sont revenues « positif »,
  « EHF » quand la réquisition hors formalité est envoyée ET revenue (`piecesSuccessionAuthentic`) ; jamais une pièce par acte de naissance.
  **FCDDV** (étude 15/10, 0.246.0) : la réponse (pièce `fcddv` trouvée sur le NAS) est lue sur le poste à l'ouverture de la fiche (`analyseFcddv` :
  une inscription par nature — testament, donation entre époux… —, notaire dépositaire, date, CRPCEN, ville ; « aucune inscription » ; jamais l'office demandeur) →
  `d.succession.fcddv` ; testament / donation entre époux répondus s'ils sont vides ; un email par notaire dépositaire (`emailConfrereFcddv`, premier jet de CLAIRE :
  nature de l'acte et coût ; adresse par l'annuaire, sinon le CRPCEN dans l'adresse de l'office). **Forme réelle reçue le 20/10** (compte rendu d'interrogation de l'ADSN : « Le fichier central a enregistré les inscriptions suivantes : Acte du : date · Etude CRPCEN · notaires · Compostage · adresse », SANS nature de l'acte — `inscriptionsFcddvAdsn`, nature « Disposition de dernières volontés », à demander au confrère ; morceaux d'une inscription dans le désordre selon pdf.js) ; l'ancienne lecture par nature reste en repli (point `fcddv-lu`).
- **Outils reliés à la fiche d'une vente** (0.250.0 / 0.252.0, `client/77-vente-outils-fiche.js`) : ligne « Outils » de l'onglet Dossier ; le Prorata ouvert depuis la fiche lit seul l'avis de taxe foncière du NAS (même règle que l'appel de fonds, jamais par-dessus un avis déposé) ; la provision du simulateur s'enregistre sur la fiche (`d.provision`, onglets Dossier et Fonds, « Prix changé depuis »).
- **Successions** : créées depuis Authentic (voir « Successions » plus haut), « SUCC - NOM »
  (`libelleDossierAffiche`, `PREFIXES_TYPE_AFFAIRE`, miroir serveur `libelleDossier`). Reste à définir avec l'étude :
  échéances (déclaration de succession…), checklist de pièces, emails, qualité des parties (défunt, héritiers) — la
  structure réelle d'une page de succession d'Authentic n'a pas encore été fournie.
- **Extension Firefox « CLAIRE pour Authentic »** (01/10, `extension-firefox/`, Authentic s'ouvre dans Firefox) :
  transport en place — relevé de la page (champs/libellés/rubriques, tableaux avec en-têtes `<th>`, texte ;
  jamais mot de passe ni champ caché), `POST /api/authentic/capture` (mémoire seule, 30 min, 20 au plus, JSON
  obligatoire), CLAIRE ouvre `#authentic=<id>` et affiche la page. **Reprise dans une fiche pas encore
  branchée** : attendre la structure réelle copiée par « Copier la structure (sans données) »
  (`structureCaptureAuthentic` : libellés masqués par `masquerLibelleAuthentic`, valeurs réduites à leur type par
  `masquerValeurAuthentic`), puis mapper vers les champs du dossier comme `completerExtractionDepuisAuthentic`.
  Non vérifié dans un vrai Firefox ni sur Authentic (relevé testé dans Chromium sur une page inventée) ;
  installation durable = signature Mozilla « unlisted » ou stratégie d'entreprise ; non géré si `authActive`.
  Demander à Fichorga si une API existe. **Branché le 02/10 (extension 0.3.0)** : relevé **automatique à
  l'affichage** sur `www.cloud-fichorga.fr` (`auto.js`, page stable 2,5 s, envoi seulement si changée, désactivable)
  → `POST /api/authentic/releve` (mémoire seule : file prise par UNE fenêtre — **boucle d'attente** `releves/attendre`, requête gardée ouverte 25 s et rendue dès qu'une page arrive, pour qu'une fenêtre cachée ou réduite, que le navigateur ne réveille plus qu'une fois par minute, applique la page en arrière-plan (étude 02/10) ; `releves/prendre` en secours toutes les 60 s et au retour au premier plan, et relevés
  récents 24 h via `releves/recents`). **Fiabilité (étude 02/10, « pourquoi parfois les données ne remontent pas »)** : les dossiers sont relus (`rattraperDossiersDistants`) avant chaque page — une fenêtre cachée ne sonde plus et appliquait sur une copie ancienne ; une page va d'abord à une fenêtre du **même poste** (adresse réseau de l'extension, `origineRequete`, « local » = poste serveur), à toute fenêtre si ce poste n'en a aucune vue depuis 90 s ; une page revue est **relue** (seul un doublon < 15 s est écarté) ; une page de dossier sans dossier reconnu le dit avec son motif (`raisonDossierAuthenticIntrouvable`) et « Choisir » (`rattacherIntituleAuthentic` : choix à la main prioritaire, intitulé `d.intitulesAuthentic` et référence gardés pour les pages suivantes) ; **journal** en mémoire du serveur (24 h) dans **Réglages › Authentic** (`renderReglagesAuthentic`, résultats rapportés par la fenêtre) ; extension 0.3.6 : une page non arrivée est renvoyée 30 s plus tard. **Usage réel (étude 02/10)** : plusieurs dossiers ouverts en onglets — seul l'onglet actif désigne la page (extension 0.3.7 relève `onglets`, titres des inactifs retirés du texte : `texteSansOngletsInactifsAuthentic`, `intituleNumeroteAuthentic`) ; intitulé **variable** (« le nom n'est pas fixe ») mais **une page de dossier**, promesse et vente comprises : toute page « N - … » suivie de Importer/Comparants/Immeubles est lue par ses noms (`intituleVenteNormalise`, score sur les mots) — **jamais par le rang « N »** (étude 03/10 : le rang du sous-dossier, « 1 » presque partout : MERCIER rangé dans DORLÉAC) ; une liste de résultats (plusieurs intitulés, sans en-tête) ne désigne aucun dossier ; un **ancien dossier** des mêmes clients (acte signé avant le dossier, `ancienDossierAuthentic`) n'est jamais appliqué ; « Choisir » seulement si un dossier en cours sans numéro porte ces noms (`proposerChoixDossierAuthentic`). L'étude identifie un dossier par **« VTE VENDEURS / ACQUÉREURS »**, le numéro étant « caché dans les données du dossier » : onglet actif ou en-tête « VTE X / Y » sans numéro reconnus (`RE_INTITULE_VTE_SEUL_AUTHENTIC`, `RE_EN_TETE_VTE_AUTHENTIC`, extension 0.3.8), la référence « A 2026 00247 » relevée à part (03/10) ; fiche client dans l'onglet d'un dossier → ce dossier (`dossierOngletActifAuthentic`). **Seul le sous-dossier de VENTE est lu** (étude 03/10, BEUCHER : « 1 - Promesse VTE … », « 2 - VTE … », « 3 - Avenant ») : `sousDossierAuthentic` (en-tête « N - … ») ; promesse/avenant/autre → rien appliqué (ni « Signé le », ni pièces), dossier gardé en consultation, référence retenue. **Statuts d'un sous-dossier dans Authentic** (étude 05/10, capture du menu du badge à côté du titre, « Signé 29/09/2026 » : le badge porte le statut, la date est celle du passage à ce statut) : **Nouveau** (bleu), **Demande de pièces** (orange), **Réception des pièces** (jaune-brun), **Préparation projet** (rose), **Préparation définitive** (violet), **Signé** (vert), **En attente** (orange), **Sans suite** (rouge) — le rouge est « Sans suite » (la note du 03/10, « rouge = pas constitué », était une supposition). **Pas lus par CLAIRE** : seul « Signé le JJ/MM/AAAA » de la ligne de rédaction l'est (`etatActeAuthentic`) ; le texte de la page rend le badge « Signé » et sa date sur deux lignes séparées, sans « le ». Pistes (nouveautés, hors semaine de débogage) : statut du sous-dossier de vente sur la fiche, « Sans suite » = dossier à archiver ou à écarter, « Préparation définitive » **n'est PAS** « projet envoyé » (étude 06/10 : l'acte rédigé et ses annexes sont placés dans l'acte électronique — ce statut ne dit rien de l'envoi au client). Pages « Informations détaillées » (état « En cours », « Dossier rentré », numéro et date d'archivage, notaire, collaborateur) et « Formalités postérieures » (attestations de signature, base des références immobilières, Micen, virement) : structures reçues le 05/10, **non lues** ; page de **recherche d'un dossier** (liste « Critères de recherche (N résultats) » : n° de dossier, libellé, nombre d'actes, prévu le, signé le, situation, collaborateur, secrétaire) : reçue le 05/10, **volontairement ignorée** — ni l'extension (`pageConnue`) ni le serveur (`pageAuthenticConnue`) ne l'acceptent tant que l'onglet actif n'est pas un dossier (rejouée avec des données inventées : « autre », aucun intitulé, rien d'appliqué) ; lire « Signé le » / « Situation » de la liste serait une nouveauté. **Création depuis Authentic** (étude 03/10, choix : bandeau « Créer », jamais d'office ; **successions aussi depuis le 16/10, 0.256.0** — `pageSuccessionAuthentic` : intitulé « SUCC / Succession », sous-dossier succession, ou intitulé réel « … veuve de … » avec comparants Défunt / Héritier ; jamais quand tous les actes de « Rédaction » sont signés ; une succession déjà créée retrouvée par son nom dans `scoreDossierAuthentic`, une vente jamais pour un intitulé « veuve de ») : page de vente sans dossier (`proposerCreationDossierAuthentic` : pas un acte signé, sous-dossier vente) → message fixe « n'est pas dans CLAIRE » + « Créer » (`direPageACreerAuthentic`), ou ligne « Créer un nouveau dossier » dans la fenêtre « Choisir » quand un dossier proche existe ; `creerDossierDepuisPageAuthentic` → **« Nouveau dossier » › Compromis (PDF)** (étude 06/10 : « rendez-vous vers l'import avec PDF ») avec le dossier d'Authentic **retenu** (`authenticRetenuPourPdf`, son groupe `groupeAuthenticRetenu` gardé à travers les rafraîchissements) : ligne « Dossier d'Authentic retenu » sous le choix d'import, le compromis déposé → `creerDepuisAuthentic` appliqué sans clic (Authentic pré-remplit, le compromis complète, étape Vérifier) ; bouton « Sans compromis » = reprise seule comme avant ; une succession reste reprise seule ; état `a-creer` du journal (bouton « Créer le dossier ») ; **plusieurs dossiers dans la journée** (étude 03/10) : le message du bas ne montre que le dernier, le rattrapage est la section **« À créer »** en tête de « Nouveau dossier » › Depuis Authentic (`g.aCreer` de `dossiersDepuisRelevesAuthentic`, ventes en cours sans dossier, compteur rouge) — pages gardées **24 h** côté serveur (`DUREE_RECENTS_MS`, 500 au plus, vidées par un redémarrage ; 12 h avant le 06/10 au soir ; la file à traiter reste à 60 min) ; textes des badges vert/rouge à relever (non lus). Pages reconnues par leur structure réelle (`typePageAuthentic`) :
  **gestion du dossier** (intitulé « N - Vente VENDEUR/ACQUÉREUR », tableaux intitulé/date/état —
  `lignesDocumentsAuthentic`) → dossier retrouvé **d'abord par sa référence** (étude 03/10 : « A 2026 00247 », bandeau de gauche, le vrai numéro du dossier — `referenceDossierAuthentic`, retenue dans `d.referenceAuthentic` au premier passage par `retenirReferenceAuthentic`, **jamais affichée devant VTE/SUCC**, retirée des intitulés par `sansReferenceAuthentic` ; un dossier rattaché à une autre référence est exclu du score ; l'ancien `d.numeroAuthentic` — le rang — est oublié au démarrage par `retirerNumeroAuthentic` ; page d'un autre dossier appliquée par erreur → croix du bloc « Dans Authentic », `oublierDonneesAuthentic`), sinon **par score** (étude 02/10, `scoreDossierAuthentic` : nom de chaque côté 3 identique / 2 proche, adresse du bien de la rubrique « Immeubles » — `adresseBienPageAuthentic` — CP 1, voie 2-4, numéro 1, adresse contraire −2/−3 ; seuil 6 avec au moins un nom, 2 points d'avance sinon rien, archivés seulement à défaut ; « consort(s) », « et », « époux » ignorés ; fiche client/onglet sans intitulé → dernier dossier retrouvé, `dossierCourantAuthentic.id` ; **fiche client** (étude 02/10, vendeur déjà client : sa fiche cite plusieurs dossiers) → `dossierPourFicheClientAuthentic` : d'abord un dossier EN COURS où la personne est partie — celui en consultation, puis le seul cité sur sa fiche, puis le seul de CLAIRE (un ancien dossier archivé/signé cité sur sa fiche ne passe jamais devant, cas CHAHUNEAU) ; puis un dossier terminé où elle est partie ; chaque fiche lue sans effet est dite par un toast (`raisonFicheClientSansDossier`, `raisonFicheClientSansChangement`) ; plusieurs dossiers en cours possibles → toast « Choisir » **fixe** (sans minuterie, jusqu'au rangement ou à la croix — `afficherToast(…, { fixe, cle })`, `fermerToastFixe`) → fenêtre `#authentic-choix-overlay` (`ouvrirChoixFicheClientAuthentic`, `rangerFicheClientAuthentic` ; fiche gardée en mémoire du poste, 10 au plus) ; partie de rien → le dossier en consultation **seulement si sa fiche le cite** (« À rattacher »), sinon rien — jamais le premier intitulé cité, jamais un inconnu rangé dans le dernier dossier vu)
  → pièces cochées « dans Authentic » (`piecesRecuesAuthentic` : même reconnaissance par le nom que l'export ZIP ;
  **pages : seuls l'état civil (« APR » en tête = demande papier, jamais reçue ; « ECV » = état civil virtuel, reçu), les casiers judiciaires (`RE_CASIER_AUTHENTIC`) et la SAFER**, reçus dans Authentic — le
  reste arrive par email/courrier, la page n'en montre que les demandes (étude 02/10) ; **export ZIP d'une vente : jamais
  les pièces d'urbanisme** (`pieceUrbanismeIgnoreeAuthentic`) ; état d'un document qui **commence** par « Signé le JJ/MM/AAAA » = acte signé (étude 03/10, `etatActeAuthentic`,
  `RE_SIGNE_LE_AUTHENTIC` : jamais un mot avant « signé » — « Mail version signée le … », « Acte signé le … » ne valent rien ;
  hors avant-contrat/procuration/mandat/courrier) **et marqué fait** : au passage à « signé », `echeancesValidees` de
  ventebien, pret, appelFonds, projetEnvoye, rendezVousSignature, acte (une fois, annulable ; butoirs retirés de l'agenda) ;
  demande/envoi/en attente exclus ; acte d'état civil et **« Réponse SAFER »** de non-préemption ajoutés comme
  pièces — jamais la DIA/DPU de la commune), une fois par pièce (`d.piecesAuthentic`), jamais en participation ;
  **fiche client** (`clientDepuisFicheAuthentic` ; **volet du conjoint** ouvert dans la fiche de l'autre époux — structure reçue le 16/10, champs `…:conjointComponent:…` AVANT ceux de la personne `…:tabView:…` : `partagerFicheConjointAuthentic` (client/52) sépare les deux, la fiche ne lit que sa personne, le conjoint ne fait que COMPLÉTER une partie déjà sur le dossier de la fiche, reconnue par prénom et nom — `conjointPartieDuDossierAuthentic`, ni ajout, ni choix, ni changement de dossier en consultation — avec la situation du couple de la fiche ; à la création, repris seulement s'il est comparant, `conjointComparantAuthentic` ; une partie seule du même nom qui porte un AUTRE prénom n'est jamais prise pour la personne d'une fiche client) et **fiche bien** (`bienDepuisFicheAuthentic`, cadastre ; lue sur un dossier existant → parcelles manquantes ajoutées à `d.bien.cadastre`, jamais remplacées, rien si autre code postal ou autre voie — `appliquerBienAuthentic`, `bienAuthenticContreditDossier`, étude 06/10 ; **lotissement** (étude 19/10) : un « N° de lot » sans volet de lot de copropriété (`lotDetailsComponent`, tantièmes) n'est pas un lot — une maison de lotissement reste une maison ; **page ouverte dans l'onglet d'un AUTRE dossier** (étude 19/10, succession VIEL : titre coupé « VTE BOURNOU... », référence en tête) : jamais rangée dans le dernier dossier vu (`ongletActifAutreDossierAuthentic`, client/82) ; **plusieurs biens dans un dossier** (étude 19/10 : « un vendeur ou un défunt peut avoir plusieurs biens, ils s'ajoutent ») : une fiche bien d'une autre adresse ouverte DANS l'onglet du dossier d'Authentic (ou portant sa référence, `dossierSur`) s'ajoute à `d.authentic.immeubles`, le bien principal inchangé — sans cette certitude elle reste écartée ; à la création, parcelles de tous les biens même sans adresse, `parcellesExportAuthentic` ; **copropriété** (structure reçue le 06/10) : l'onglet « Informations du bien » porte le cadastre sous « Parcelle Assise volumétrique » (mêmes colonnes), l'onglet « Lots » — sans adresse ni cadastre — donne les lots (`lotsFicheAuthentic` : tableau N°/Type/Bâtiment/Étage/Entrée/Tantièmes lot aux en-têtes « Filter by … », ligne de total, détail du lot ouvert : désignation, surfaces, étage ; `d.bien.lots`, `d.bien.tantiemesTotal`), fusionnés avec le bien de la page précédente (`fusionnerBienAuthentic`) ; sur un dossier existant `appliquerLotsAuthentic` ajoute ou complète les lots, jamais ne les retire, et passe le type de vente en copropriété (dit dans l'historique) ; ligne « Lot(s) » de la fiche `libelleLotCopropriete` ; à la création `lotsExportAuthentic`, gardés par `normaliserExtractionImportee` et `instantaneExtraction`) →
  « Nouveau dossier » › « Depuis Authentic » (`dossiersDepuisRelevesAuthentic` au format de l'export ZIP, rôles
  par l'intitulé, `creerDepuisAuthentic` ; complète un avant-contrat déjà déposé). Notaires et agence : pas encore
  relevés (page non fournie). Cellules copiées en **vocabulaire** (`vocabulaireCelluleAuthentic`). **Deuxième passe (02/10, `appliquerReleveSurDossier`)** : état de rédaction de l'acte jamais montré ni noté pour un notaire en second (participation, étude 02/10 — seul « signé » l'est) ;
  SAFER notifiée sans réponse → « Réponse SAFER » **manquante** (une fois, `saferPieceAjoutee`) avec notifiée / prise en
  compte le ; RHF envoyée / retour ; état de l'acte ; prix « Capital » (rempli s'il manque) ; collaborateur des
  « Parties prenantes » (le notaire n'est plus relevé depuis le 07/10) — gardés dans `d.authentic`, bloc « Dans Authentic » de l'onglet Pièces ; fiche client →
  téléphone/email manquants et situation matrimoniale, alerte si un vendeur marié/pacsé vend sans son conjoint ;
  côté de la fiche par nom de famille, nom d'usage puis **conjoint** (`roleConjointAuthenticDansDossier`), sinon
  « À rattacher » sur la fiche (`clientsAPlacer` : Vendeur / Acquéreur / ×), jamais deviné ; **emails groupés**
  « a@x.fr;b@y.fr » (`emailsDepuisTexte`) reportés sur le côté (étude 02/10 « garder les deux » **remplacée le 06/10 au soir** : Authentic d'abord, voir « Authentic d'abord, puis la fiche ne bouge plus » ; `fusionnerEmailsTexte`/`fusionnerTelephonesTexte` ne servent plus qu'à dédoublonner ; email tapé dans le formulaire complété, `appliquerEmailsChamp`) — partout un champ email peut porter plusieurs
  adresses (`destinatairesEmail` : « a, b » dans le `.eml`, un votant par adresse au sondage) ;
  **personne déjà connue** (étude 02/10, choix : proposé, jamais d'office ; toute partie, archivés compris) — ligne
  « Déjà connu » de la fiche (`personnesConnuesPourDossier` : même personne = un nom contenu dans l'autre sur 2 mots au
  moins, `memePersonneParNom` ; ancien dossier le plus récent qui apporte quelque chose), « Reprendre »
  (`appliquerPersonneConnue` : téléphones, emails, situation matrimoniale manquants) ou × (`personnesConnuesEcartees`) ;
  livret de famille et décès seulement en succession. « Informations financières » et « Parties prenantes » (sous les
  vendeurs/acquéreurs de la page de gestion) s'affichent en **texte seul** : lus dans `capture.texte` (« Capital » puis le
  montant ; lignes après « Parties prenantes »), la copie de structure y ajoute le texte réduit à son vocabulaire
  (`texteVocabulaireAuthentic`, `VOCABULAIRE_AUTHENTIC`, test « aucun nom ne sort ») ; « Retour le » = prise en compte
  SAFER / retour RHF (étude, 02/10). **Troisième passe (02/10 midi)** : **Comedec** (`etatEtatCivilAuthentic`,
  `d.authentic.etatsCivils`) — « pris en compte »/en attente et **« négatif »** (erreur, rien délivré) laissent la pièce
  non cochée avec l'état dessous (`etatAuthenticPiece`), seul **« positif »** coche ; **SAFER** : ligne « date de création · date d'envoi · état » (étude 02/10 — état « Pris en compte » / « Non préemption SAFER », sans date ; même ligne pour la RHF et les demandes, `dateEnvoiLigneAuthentic` ; `creeeLe`, `envoyeeLe`, date de décision sur une ligne de réponse à une date, en 3e date, ou en 2e date d'une ligne de décision « non-préemption »/« préemption » : envoi puis réponse, étude 14/10), puis **non-préemption tacite** à l'issue du délai **depuis la date d'envoi** (`envoyeeLe` ; relevés antérieurs : leur `priseEnCompteLe` était l'envoi ; miroir serveur `echeanceSaferDossier`) — 2 mois, 1 mois en réponse
  rapide, 8 jours en très rapide — **2 mois de base, les deux autres se cochent sous « Réponse SAFER »** (`delaiManuel`,
  `renderDelaiSafer`, jamais lu dans l'intitulé ; `DELAIS_SAFER`, `appliquerSaferTacite`, `verifierSaferTacites` au démarrage puis
  toutes les heures) ; **DPU « non » dans l'analyse (seule une SAFER à purger…, `droitNonApplicable(d, 'dpu')` de commun/dossier.js) : « Renonciation au droit de préemption » absente de la checklist (sauf déjà reçue), `preemptionLevee` vrai, pas de réponse à la DIA attendue — revient seule si l'analyse change ; `tests/preemption-situations.test.js` joue toutes les combinaisons DPU × SAFER × type** (étude 09/10) ; **SAFER « non » dans l'analyse de l'urbanisme (zone U…, `saferNonApplicable`) : aucun délai SAFER, ligne masquée, signature non retenue, même avec une notification Authentic** (étude 09/10) ; **fin du délai = date butoir, comme la préemption de la mairie** (`saferLevee`,
  `echeanceSaferDossier`) : item « Délai SAFER » du planning (miroir serveur, sans rappel), ligne de la fiche, pas de
  « Fixer le rendez-vous » avant, semaine probable / créneaux au plus tôt le lendemain, retrait de probabilité ; **demandes** (alignement, numérotage, DIA…, `demandesUrbanismeAuthentic`) jamais cochées,
  « Demande envoyée le … » sous la pièce ; ce qui est acquis (positif, SAFER décidée) n'est plus touché. **Seules les
  pages de structure connue** sont envoyées (extension 0.3.3, `pageConnue`) et gardées (`pageAuthenticConnue`). **Navigation** (0.3.5, étude 02/10) : sur une page de dossier d'un autre type (« 15 - Donation SIMOND »), l'extension n'envoie que l'intitulé (`POST /api/authentic/navigation`, mis en file sans contenu ; une page connue déjà vue renvoie aussi sa navigation) → `suivreNavigationAuthentic` change le dossier en consultation (aucun s'il n'est pas suivi).
  Aperçu d'un document Comedec : pas de lien relevé. **Coordonnées** (étude 02/10) : email + téléphone de chaque
  partie sur la première page de la fiche (`fiche-coordonnees`, `champsCoordonneesPartie`) — seulement là
  (étude 04/10 : retirées de l'onglet Échanges, doublon) ; **jamais celles du vendeur quand son notaire l'accompagne** (étude 06/10, `coordonneesPartiesDossier` écarte le côté `represente` ; les valeurs restent sur le dossier). **Ligne « Authentic » de la fiche** (étude 06/10, « compléter avec les données Authentic avant ou après création » ; **sous le bouton « Compléter la fiche »**, 06/10 au soir ; `renderCompleterAuthenticFiche`, client/17) : dossiers relevés dans Authentic ces 24 h (`chargerGroupesAuthenticFiche`, 60 s de cache), celui de la fiche présélectionné (`indexGroupeAuthenticPourDossier` : référence, sinon noms de famille dans l'intitulé), « Compléter » = `complementDossierDepuisAuthentic` (pure) : personnes d'un côté sans personne nommée, emails/téléphones fusionnés, adresse, type, parcelles et lots, prix, référence ; `memePartieComplement` reconnaît « FOURNIER » dans « Camille FOURNIER » ; historique « Complété depuis Authentic ». **Authentic est la base de la fiche** (étude 06/10, 0.173.0) : le même complément est fait **sans clic après chaque page relevée** (`completerDossierDepuisRelevesRecents` après `appliquerReleveSurDossier`, client/30) sur le dossier d'Authentic relevé ces 24 h — `groupeAuthenticPourComplementAuto` : par la référence seule quand la fiche en a une, sinon par les noms sauf référence déjà prise par une autre fiche — pages arrivées avant la création comprises ; et **une fiche client aligne l'identité de la partie** (`alignerIdentitePartieAuthentic` : « Prénom NOM » si la fiche n'avait que le nom, civilité d'Authentic qui gagne, nom d'usage, date de naissance si vide ; conjoint sous son propre nom ajouté de son côté ; deux homonymes sans prénom → rien). **Authentic d'abord, puis la fiche ne bouge plus** (étude 06/10 au soir : « Authentic passe en premier partout et remplace les champs si déjà rempli. Si déjà rempli par Authentic et qu'une donnée change, par exemple un e-mail erroné modifié dans Authentic : une notification pour demander la mise à jour. Sinon la fiche ne bouge plus » ; `client/52-authentic-fait-foi.js`, 0.176.0) — champs concernés : adresse du bien, prix, type de vente (lu dans la fiche bien : maison, copropriété, terrain ; jamais pour une succession), **emails et téléphones de chaque côté** et **identité de chaque partie** (civilité, « Prénom NOM », nom d'usage, date de naissance). **La PREMIÈRE fois** qu'Authentic donne une valeur, elle REMPLACE celle de la fiche (l'ancienne dite dans l'historique, « avant : … ») — emails/téléphones : ceux de la personne remplacent le champ du côté, ceux d'une autre personne du même côté déjà reprise d'Authentic sont gardés ; la valeur est alors retenue (`d.authentic.valeurs[champ]`, `d.authentic.fichesAuthentic[personne]` = emails, téléphones, identité) et **tant qu'Authentic ne change pas la fiche ne bouge plus** (une correction à la main reste). **Si Authentic CHANGE une valeur déjà reprise** (`decisionValeurAuthentic`) : rien n'est écrit, la mise à jour est **proposée** (`d.authentic.majEnAttente`, `mettreEnAttenteAuthentic`) — message fixe « Mettre à jour la fiche ? » (`notifierMajAuthentic`), ligne « À mettre à jour » sous « Compléter la fiche », au-dessus de la ligne « Authentic » (`renderMajAuthentic` : Mettre à jour / Ignorer), signal « Authentic a changé » dans « Nouveau » du Suivi (`signauxDossierSuivi`), **pastille « Mise à jour » sur la ligne du dossier** (`tagMajAuthentic`, avec `tagNotificationsDossier`) et **+1 par dossier dans la pastille rouge de « Suivi des dossiers »** (`totalNotificationsPieces`, 0.176.2), historique ; « Mettre à jour » écrit (`appliquerMajAuthentic` : pour un email, retire l'ancienne valeur d'Authentic et ajoute la nouvelle, le reste du champ est gardé), « Ignorer » retient la valeur d'Authentic sans rien écrire (`ignorerMajAuthentic`). Le bouton « Compléter » de la fiche (geste explicite, `forcer`) reprend tout sans demander. Tout nouveau champ repris d'Authentic passe par `poserChampAuthentic` (champ simple) ou `appliquerContactAuthentic` (coordonnées) — jamais par une écriture directe — et un relevé qui retient une valeur est « à enregistrer » même si aucun champ visible n'a bougé (`empreinteRegistreAuthentic`) ; « Oublier ce qui vient d'Authentic » efface `valeurs` et `majEnAttente`. **À la création** (Compromis + Authentic) les emails et téléphones d'Authentic REMPLACENT ceux du compromis quand Authentic en a (ils s'ajoutaient avant, étude 02/10 « garder les deux »). **Personnes d'un côté changées dans Authentic** (étude 07/10 : « si l'acquéreur change dans le dossier Authentic, le modifier dans la fiche ») : retenues dans `valeurs['parties:ACQUEREUR']` ; une personne retenue disparue d'Authentic ET du nom du dossier d'Authentic → **proposé** (`type: 'parties'`, `personnesPartiesAuthentic`), « Mettre à jour » (`appliquerChangementPartiesAuthentic`) retire l'ancienne et ses coordonnées, pose la nouvelle, renomme le dossier ; jamais d'office ; dossiers rattachés à leur référence seulement ; **substitution par une SCI** (étude 07/10) : une société citée par un côté de l'intitulé d'Authentic est une partie `morale` de ce côté (`societesCoteAuthentic` dans `partiesExportAuthentic` — pas de fiche client lisible pour une société), le gérant cité seulement dans le nom de la SCI n'est pas partie. **Dès la création** (étude 07/10 : « récupérer dès ce moment civilité, email, téléphone, situation maritale » ; `fichesAuthenticACreation`, appelée par « Ajouter le dossier ») : civilité et identité de chaque partie, situation matrimoniale et situation du couple de chaque côté, emails et téléphones sur un côté resté vide ; tout ce qu'Authentic a donné est retenu (personnes, coordonnées, identité, adresse, prix, type) sans réécrire le formulaire — une correction faite dans « Vérifier » reste et le premier relevé ne repose rien. Limites : une partie dont le nom d'Authentic change de famille est reprise comme une nouvelle personne ; parcelles et lots restent ajoutés sans rien retirer.
- **Arborescence type des dossiers clients sur le NAS** (MAISON, COPRO, TERRAIN, SUCC, CESSION DE
  FONDS) : détaillée dans `docs/historique.md` (fin du fichier). L'avant-contrat signé est à la
  racine du dossier client ou sous « SRU » ; la rubrique « AAE » contient les pièces réunies entre
  l'avant-contrat et la vente, jamais l'avant-contrat.
