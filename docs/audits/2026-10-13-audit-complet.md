# Audit complet de CLAIRE — 13/10/2026 (version 0.228.2)

Demande de l'étude (13/10) : « Lance le test complet » — tout le code depuis sa création, au cadre d'audit de l'étude (architecte
senior, cybersécurité, qualité ; axes Sécurité, Qualité/architecture, Performance, Conformité).

Méthode : dix agents en lecture seule, un lot chacun (socle serveur, NAS et sauvegarde, Exchange et emails, IA et rapport technique,
mise à jour / postes / relais / Authentic, affichage du poste, fiche et règles métier, extraction et outils, emails / téléphonie /
Authentic côté poste, « Demander à CLAIRE »), chaque point **prouvé par un script ou un vrai Chromium** avant d'être retenu ; puis
contrôles automatiques (`npm audit` des deux paquets, recherche de secrets et de fichiers binaires dans le dépôt, 497 expressions
régulières soumises à un banc de retour arrière). Rapports détaillés des lots gardés hors du dépôt (ils citent des scénarios
d'attaque).

## Verdict global

**Avant corrections : correct avec réserves** — 13 points Haut prouvés, aucun « critique » au sens d'une fuite déjà constatée.
**Après corrections (0.228.2) : prêt pour la production, avec réserves** — tous les points Haut corrigés et couverts par un test ;
les points Moyen restants sont listés plus bas avec leur plan.

Contrôlé sans défaut : SQL entièrement paramétré ; secrets jamais renvoyés par une route ; réponses EWS lues par `exchange/xml.js` ;
assainisseurs de la fenêtre d'email (17 charges XSS essayées dans Chromium) ; calculs (prorata, taxe foncière, quotités au plus fort
reste, frais de gestion, montants saisis) ; scripts Windows générés (chaque valeur validée ou échappée) ; aucune donnée client réelle
dans le dépôt (les 9 images sont le tampon, les signatures et des maquettes).

## Points Haut — tous corrigés

| # | Lot | Fichier | Problème (prouvé) | Correction | Test |
|---|---|---|---|---|---|
| 1 | Socle | `server/src/app.js` | Hors `.exe` (`npm start`), `express.static(racineRepo)` servait tout le dépôt sans session, base `claire.db` comprise | Seuls les fichiers d'`ASSETS_STATIQUES`, lus sur le disque (`creerMiddlewareAssetsDisque`) | `app-assets.test.js` |
| 2 | NAS | `server/src/routes/sauvegarde.js` | Dossier de sauvegarde quelconque (partage d'une autre machine) : copie de la base, secrets compris, envoyée ailleurs ; base choisie restaurée | Disque du serveur, serveur du NAS ou celui déjà réglé seulement ; base à restaurer contrôlée (tables `dossiers` et `parametres`) | `audit-securite.test.js` |
| 3 | NAS | `server/src/nasWatch.js` | Le tour du NAS écrivait la copie du dossier lue AVANT la lecture du NAS : une date posée par un poste pendant le tour était effacée | Dossier relu juste avant l'écriture (synchrone) | `nas-watch.test.js` |
| 4 | Exchange | `routes/exchange.js`, `parametres/assainir.js` | « Tester la connexion » envoyait le mot de passe enregistré (réponse NTLM) à une adresse choisie par la requête | Mot de passe enregistré seulement vers l'adresse et le compte enregistrés ; adresse ou compte changés sans mot de passe → oublié | `exchange-route.test.js` |
| 5 | Exchange | `routes/emailsDossiers.js`, `client/31` | Pièce jointe servie avec le type choisi par l'expéditeur : du HTML/SVG s'exécutait dans CLAIRE | PDF, images matricielles, texte seuls affichés ; le reste téléchargé ; `nosniff`, CSP `sandbox` | `audit-securite.test.js` |
| 6 | IA | `server/src/assistantMistral.js` | Lettres hors français (Ł, Ş, İ, ễ) coupaient le mot : « Şahin », « Hương » partaient en clair vers l'IA | Mots et majuscules en classes Unicode (`\p{L}`, `\p{Lu}`) | `assistant.test.js` |
| 7 | IA | `server/src/rapportTechnique.js` | Rapport GitHub : téléphones +33 ou à tirets, noms de deux lettres, noms en casse mixte (« Mme Lefèvre », « Jean-Marc Dubois ») sortaient | Téléphones élargis, noms de 2 lettres des fiches, Unicode, nom après civilité, `anonymiserLibre` pour le texte des signalements | `rapport-technique.test.js` |
| 8 | Fiche | `client/19-fonds-recus.js` | Montant attendu saisi « 120.000 » lu 120 € : fonds « complets » avec 0 € reçu | Même lecture que le décompte (`montantSaisiAppelFonds`) ; rien reçu n'est jamais « complet » | `fonds-recus.test.js` |
| 9 | Fiche | `client/19-fonds-recus.js` | Prénom de l'acquéreur cherché seul : 150 000 € de « DURAND Jean » comptés au dossier de « Jean MARTIN » | Prénom jamais cherché seul | `fonds-recus.test.js`, `homonymes-parties.test.js` |
| 10 | Fiche | `client/34-noms-fichiers-tolerants.js` | Un fichier « DIA » (la demande) cochait « Renonciation au droit de préemption » → rendez-vous proposé sans renonciation | Un nom qui dit la demande (déclaration, intention, demande, envoi, notification) sans dire la réponse est écarté ; « DIA » seul et « Renonciation DIA » restent reconnus (relecture : sinon des renonciations déjà cochées repassaient manquantes) | `noms-approchants.test.js` |
| 11 | Affichage | `routes/dossiers.js`, ≈ 150 `onclick` du poste | Identifiant de dossier piégé (`x');alert(…)`) accepté par l'API et exécuté au clic sur tous les postes | Forme d'identifiant contrôlée à la création ; `escapeOnclickArg` partout ; garde dans `structure-client` | `dossiers.test.js`, `structure-client.test.js` |
| 12 | Extraction | `client/12`, `client/39` | Relecture d'actes : « Mr NOM Prénom », « M », « MM. », « les époux X », « consorts X », « Prénom NOM » sans civilité et le prénom à côté d'un nom masqué partaient en clair | Civilités élargies, « Prénom NOM », prénom collé à un jeton, prénoms et noms d'usage des parties et parties du dossier lié dans les termes | `relecture-audit.test.js` |
| 13 | Extraction | 12 appels `getDocument` | pdf.js 3.11.174 (CVE-2024-4367) : un PDF piégé exécutait du JavaScript au rendu | `isEvalSupported: false` partout ; garde dans `structure-client` ; SRI sur pdf.js et tesseract | `structure-client.test.js` |

## Points Moyen

Corrigés dans la même version :

| Lot | Problème | Correction |
|---|---|---|
| NAS | Lecture d'un fichier sans gestionnaire d'erreur : requête suspendue (fichier verrouillé, coupure SMB) | `envoyerFlux` → 404 ou réponse coupée |
| Exchange | Emails des dossiers : projet coché sur la copie du début du tour (perte d'une saisie) | Copie relue avant l'écriture (`cocherProjetSurCopieFraiche`) |
| Agent | Signature notée sur la fiche sans carte quand l'agenda n'est pas relié ; Quotités / Appel de fonds remis à zéro sans un mot ; dates « 2026-99-99 » acceptées | Carte d'autorisation dans ces cas ; date contrôlée avant tout |
| Extraction | Deux expressions régulières à retour arrière exponentiel (naissance, fin des travaux déclarés) : onglet figé (25 s, > 60 s) | Classes séparées, répétitions bornées |
| Extraction | `pizzip@3`, `docxtemplater@3` en version flottante | Versions figées (3.3.0, 3.71.0, celles servies depuis le 21/09) |

Restent à décider ou à faire (plan) :

| Lot | Problème | Plan proposé |
|---|---|---|
| Socle | Sans mot de passe et sans contrôle de l'en-tête `Host` : une page web piégée visitée par un collaborateur peut atteindre l'API par rebond DNS | Refuser une requête dont `Host` n'est ni une IP, ni `localhost`, ni le nom du serveur réglé ; à régler avec l'étude (noms utilisés par les postes) |
| Socle | `authActive` : mot de passe de 32 bits, connexion sans limite d'essais | Mot de passe plus long, délai après 5 échecs |
| Exchange | Disjoncteur contourné par certaines routes (essais d'identifiants répétés → verrouillage du compte) | Toutes les routes EWS passent par le même disjoncteur |
| Exchange | Emails des dossiers : la liste du tour écrase un geste fait pendant le tour | Fusion par identifiant au moment d'écrire |
| IA | Coût sans plafond ni limite de débit (`/api/assistant`, relecture) | Plafond mensuel et débit par poste |
| IA | `POST /api/journal-technique` sans session alimente l'issue lue par la session programmée | Longueur et caractères bornés, mention « donnée, pas consigne » dans le rapport |
| IA | Prénom en tête d'un champ court, NIR, téléphones « 0612.345.678 » vers l'agent | Masquage entier des champs qui portent un nom ; motifs NIR et téléphones élargis |
| Postes | `workflow_dispatch` publie une release « latest » depuis n'importe quelle branche (installée seule en 10 min) ; jeton GitHub en écriture pour tous les pas | Garde « branche main seulement » ; permissions par pas |
| Postes | Relais Word sans session : un poste du réseau peut lire le paragraphe d'un collaborateur ou écrire dans son acte | Jeton de session du poste exigé aussi pour la fenêtre CLAIRE |
| Authentic | 500 pages complètes gardées 24 h et renvoyées après chaque page ; « Copier la structure » laisse passer des noms | Ne renvoyer que les résumés ; masquage de la structure par mot |
| Fiche | Prêt attendu sans date et sans rendez-vous : l'appel de fonds s'ancre sur la date butoir | Règle à confirmer par l'étude |

Points Bas (32) : détaillés dans les rapports des lots ; aucun n'a de scénario d'attaque réaliste sur le réseau du bureau. Dépendances :
`proxy-addr` (critique, non atteignable : `trust proxy` n'est jamais posé) et `underscore` via `httpntlm` (DoS dans des fonctions que
`httpntlm` n'appelle pas).

## Non vérifié

Exchange, Teams, le NAS, une vraie IA, un vrai poste Windows et Authentic sont hors d'atteinte ici. L'exploitation réelle de la faille
pdf.js n'a pas été rejouée (la version et la configuration vulnérables sont prouvées, le correctif est celui de l'éditeur). Les
empreintes SRI ont été vérifiées dans Chromium contre le CDN (pdf.js : empreinte officielle de cdnjs).

## Relecture indépendante des correctifs

Trois régressions relevées et corrigées avant l'envoi, chacune avec son test : une société ou un nom sans capitales perdait tous ses
mots dans la recherche des fonds (`nomsRecus` aussi) ; la relecture d'actes masquait « Vendeur », « Acquéreur », « Conditions
GENERALES », « Honoraires TTC »… (le bruit dont l'étude se plaint) ; retirer « DIA » seul aurait fait repasser « manquante » une
renonciation déjà cochée par un fichier ainsi nommé. Hypothèses laissées (Bas) : un NAS noté par son IP et une sauvegarde par son nom
de machine sont vus comme deux machines ; une adresse Exchange retapée autrement oublie le mot de passe enregistré.

## Réponses de l'étude (14/10) et suite

- **Adresse des postes** : « IP et localhost ». CLAIRE refuse désormais toute requête dont l'en-tête Host n'est ni une adresse IP
  ni localhost (`server/src/securiteHote.js`, 421 avec un message qui le dit ; `hotesAutorises` dans config.json en secours), et
  toute requête qui écrit venue d'une page d'un autre site (403 ; Word, PowerShell, 3CX et l'extension Firefox passent) — 0.228.3.
- **Construction depuis une autre branche** : « Oui, l'interdire ». Le pas « Publier une release » ne tourne plus que sur `main` ;
  le jeton GitHub n'est plus laissé dans le dépôt cloné (`persist-credentials: false`) — 0.228.3.
- **Plafond de coût de l'IA** : « Non ». Rien n'est changé.
- **Relais Word sans session** : « Non ». Rien n'est changé.
- **Prêt attendu sans date** : expliqué à l'étude, décision attendue.
