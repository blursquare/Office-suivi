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
  reconstruit et publié en release par `.github/workflows/build-exe.yml` à chaque push sur `main`.
- **`sauvegarde`** = copie de `main` pour les essais de l'étude, sans développement propre.
- La version 100 % locale (sans serveur, `localStorage`) n'est plus maintenue ; son dernier état
  est le commit `c90e9d0`. Dans `docs/historique.md`, « sur `main` » dans les entrées antérieures
  au 18/09/2026 désigne cette version locale, et « `claude/serveur-intranet` » l'actuelle `main`.
- **Un correctif n'atteint le bureau que par un nouveau `.exe`** (les fichiers client sont
  embarqués dans le blob SEA) — l'étude l'installe par Réglages › Mise à jour en un clic.
  Avant de retoucher un bug « toujours présent » déjà corrigé, faire vérifier la version affichée
  dans « À propos » : c'est presque toujours un problème de déploiement, pas de code.

## Structure

```
index.html / style.css / script.js   Client (une seule page, tout le rendu est en JS sans framework)
manifest.json, sw.js, icone.svg      PWA (installabilité) et favicon
appel-de-fonds-modele.js             Modèle Word du courrier d'appel de fonds + logos (base64)
questionnaire-satisfaction-pdf.js    PDF du questionnaire de satisfaction (base64)
server/                              Serveur (son propre package.json ; le package.json racine est
                                     de l'outillage de test pur, sans dépendance)
  src/app.js, index.js, config.js    Montage Express, démarrage, configuration (.env / config.json)
  src/db.js, dossiersRepo.js,        Base SQLite (dossiers en blob JSON, table `parametres`
       parametresRepo.js             clé→JSON pour réglages et états produits par le serveur)
  src/routes/*.js                    API (dossiers, nas, reglages, notifications, agenda, exchange,
                                     relectureClaude, relectures, extractionIa, offrePret,
                                     signatureImages — images de la signature des emails, …)
  src/carnetConfreres.js             Carnet des confrères (relevé initial des offices du 41, liste blanche)
  src/ouvertureAuto.js               Installateur du relais « claire-ouvrir: » (ouverture auto des téléchargements)
  src/jobs/rappels.js                Rappels par email (miroir serveur du planning client)
  src/nas.js, nasWatch.js            Lecture du NAS par le serveur, surveillance périodique
  src/agendaOffice.js, agendaWatch.js  Lecture de l'agenda de l'office (EWS, toutes les 15 min)
  src/exchange/ews.js                Écriture dans l'agenda Outlook (EWS/NTLM)
  src/relecture/{claude,mistral}.js  Relecture d'actes par API (prompt, schéma, vérification)
  src/extraction/                    Passe IA locale (Ollama) de l'extraction du wizard
  src/envoiEmail.js, imapGmail.js,   Envoi SMTP, effacement différé des copies Gmail
       nettoyageGmail.js
  src/sauvegarde.js, miseAJour.js    Sauvegarde quotidienne de la base, mise à jour en un clic
  scripts/build-windows-exe.mjs      Construction du .exe (esbuild + SEA + postject + icône)
tests/                               Tests client (node:test) ; server/test/ pour le serveur
docs/historique.md                   Historique détaillé (voir plus haut)
docs/spec-banc-essai-extraction.md   Cadrage du banc de mesure de l'extraction
```

**Tout fichier servi statiquement doit être déclaré à la fois dans `ASSETS_STATIQUES`
(`server/src/app.js`) et dans les assets embarqués de `server/scripts/build-windows-exe.mjs`** —
sans les deux, il fait un 404 silencieux dans le `.exe` (piège payé deux fois).

## Contraintes fondamentales

1. **Tout reste sur le réseau du bureau.** Pas d'hébergement en ligne. Exceptions voulues et
   cadrées par l'étude : l'API de relecture d'actes (Mistral par défaut, Claude en option), qui ne
   reçoit que du texte **pseudonymisé dans le navigateur** (la table de correspondance ne quitte
   jamais le poste) ; l'autocomplétion d'adresse `api-adresse.data.gouv.fr` (seul le texte tapé part) ;
   les CDN de bibliothèques (pdf.js, tesseract.js 7.0.0, docxtemplater, docx).
2. **Accès sans mot de passe par défaut** (le réseau du bureau protège l'accès ;
   `"authActive": true` dans `config.json` le rétablit). Pas de compte par collaborateur : le
   collaborateur du poste est choisi une fois (`localStorage`), ses préférences vivent en base.
3. **Le serveur lit le NAS** (`config.nasRacine`, jamais devinée). L'API File System Access du
   navigateur est abandonnée : elle n'existe pas sur une adresse IP. Chemins confinés à la racine
   (`resoudreCheminNas`, liens symboliques résolus avant contrôle, PDF seulement). Tout accès disque
   est **asynchrone** : un appel `*Sync` dans un chemin de requête fige tout le serveur (Node est
   mono-thread — la cause des « coupures » passées). Une route `async` doit rattraper ses erreurs
   (`routeAsync()` dans `routes/nas.js`) : Express 4 ne rattrape pas une promesse rejetée, la
   requête resterait suspendue.
4. **Aucune page web n'envoie un email seule.** Les emails au client sont des `.eml` (`X-Unsent: 1`,
   HTML + signature + pièces jointes) qu'Outlook ouvre prêts à envoyer (`livrerEmailDossier`), ou un
   `mailto:` texte selon le réglage du poste. Seuls les rappels internes partent automatiquement :
   SMTP Gmail + mot de passe d'application → boîte-passerelle (Objet = adresse du destinataire) →
   flux Power Automate → Teams. La copie gardée par Gmail est effacée **2 h après** (le flux relève
   la boîte Gmail elle-même : l'effacer tout de suite l'empêcherait de passer).
5. **Agenda de l'office** (Exchange 2019 de Fichorga, `mail.authentic-connect.fr`), tout par EWS en
   NTLMv2 (`httpntlm`) sur le **calendrier partagé de Sophie** : **lecture** toutes les 15 min
   (`lireCalendrierExchange`, FindItem en vue calendrier, 6 mois en 3 tranches ; envois relevés,
   rendez-vous de signature, absences, catégories — le lien `.ics` publié n'est plus lu depuis le
   29/09) ; **écriture** : création/déplacement/retrait
   d'un rendez-vous de signature (catégorie = couleur : vert office, violet visio, orange confrère),
   note « Appel de fonds (et projet) envoyé » dans le Lieu, dates butoir prêt / vente préalable en
   journée entière — seule voie depuis le 29/09 (plus de flux `.ics` publié) : le poste les pose au
   geste, le serveur pose ce qui manque à chaque tour de lecture (`echeancesAgenda.js`) en adoptant
   d'abord un événement de même titre et même date (jamais de doublon). **Un seul essai par appel, aucun réessai automatique** (verrouillage du compte),
   disjoncteur sur refus d'identifiants (côté client pour les écritures ; côté serveur, la lecture
   automatique est suspendue tant que les identifiants refusés restent enregistrés). Suppression = `MoveToDeletedItems`, jamais `HardDelete`.
   Microsoft Graph / Power Automate premium ne sont pas disponibles. **Lecture de la boîte de
   réception** du même compte (celle de Bastien, qui reçoit tout en double) à 8 h 50 pour le résumé
   des emails du matin (`emailsMatin.js`, FindItem seul, sans IA) : seuls expéditeur, objet et
   heure sont gardés, jamais le corps ; affiché **pour Bastien seulement** (`DESTINATAIRES_EMAILS_MATIN`).
6. **Secrets** (mot de passe SMTP, clés API Mistral/Anthropic, mot de passe Exchange, jeton GitHub
   de mise à jour) : stockés en base, **jamais renvoyés par une route** (remplacés par un booléen
   « enregistré »), conservés si le formulaire ne les réémet pas, effacés sur chaîne vide explicite,
   jamais journalisés ni repris dans un message d'erreur.
7. **Aucune donnée client réelle dans le dépôt.** Les tests reprennent la structure des actes réels
   avec des noms, adresses et montants inventés ; les PDF réels ne sont jamais commités.
8. **Word ne comprend ni Grid ni Flexbox** : les documents générés (`imprimerFiche`, courriers) sont
   en `<table>` avec couleurs inline, et restent dans l'identité papier de l'étude (bordeaux
   `#6D2332`), hors thème de l'application.

## Règles métier stables (à ne pas rouvrir sans nouvelle demande)

- **Parties** : Vendeur = Promettant, Acquéreur = Bénéficiaire — sauf promesse d'**achat**, où le
  rôle se déduit du type d'acte (`ROLES_PAR_TYPE_ACTE`). La **forme** de l'acte (authentique : les
  notaires sont nommés en première page ; sous seing privé : en fin d'acte) est distincte de son
  **type** ; « AAE » dans un nom de fichier = acte authentique électronique.
- **Notaires** : priorité mention explicite (hors clause d'origine de propriété) > règle
  géographique (`REGLES_NOTAIRE_INSTRUMENTAIRE`, bien dans le 41) > ordre dans la zone attendue ;
  sinon rien n'est deviné. Le rôle de l'étude (instrumentaire/participant) est déduit du côté qui
  reçoit l'acte ; si un autre office représente l'acquéreur, les emails vont **au confrère**
  (« Mon Cher Maître, … Votre bien dévoué. ») et le questionnaire de satisfaction n'est jamais proposé.
- **Responsables** : liste fermée (Bastien ANGLUMENT — administrateur, vue globale —, Julie
  VASSELIN, Jérémy SAUJOT).
- **Planning** (`echeancesPlanning`, miroir serveur `toutesEcheances` dans `jobs/rappels.js` — à
  modifier **toujours ensemble**) : vente préalable → obtention du prêt → *renonciation au droit de
  préemption* (bloquante hors copropriété, sauf pièce retirée ou participation ; en copropriété
  seulement si une pièce personnalisée « préemption/DPU/DIA » a été ajoutée) → fixer le rendez-vous
  → envoi appel de fonds → envoi projet → signature. La **date butoir** est informative dès qu'un
  rendez-vous est fixé (hors planning et hors rappels). Une date d'envoi saisie vaut envoi fait.
- **Seuils des rappels email** : prêt J-15/J-7, vente préalable J-15/J-7, appel de fonds J-15/J-10,
  signature J-25/J-15, personnalisées J-15/J-7 (`SEUILS_RAPPELS_PAR_TYPE`).
- **Relance de l'offre de prêt au client** : première à J-15, puis tous les 10 jours, y compris
  après l'échéance, jusqu'à réception de l'offre ou archivage.
- **Offre de prêt** : reconnue par le nom du fichier, à défaut par le titre de la page de garde
  (≥ 6 pages) confirmé par l'IA locale ; « à confirmer » si le modèle est indisponible. Garanties
  lues dans le seul paragraphe « GARANTIES », une garantie conditionnelle/future n'est pas comptée.
- **Pièces du dossier** : reconnues **par le nom de fichier seulement** (`motifNom` +
  formes tolérantes `FORMES_NOM_PIECES`), jamais par le contenu (le compromis cite toutes les pièces).
  Une pièce validée à la main (`piecesValideesManuellement`) n'est jamais repassée en manquante.
  Une exclusion (« Réinitialiser ») est globale et stockée en base — elle est la première cause
  d'une pièce « jamais reconnue » malgré un nom correct.
- **Dépôt de garantie** : toujours déduit de l'appel de fonds (l'agence reverse la somme) ; le
  détenteur dit seulement quoi réclamer.
- **Fonds reçus** (reçus comptables du NAS) : le client est le **titulaire** en début de ligne, et
  seulement le premier nommé d'un compte à deux noms, sauf si la référence de la vente
  (« VTE VENDEUR/ACQUÉREUR ») cite le vendeur du dossier ; une référence qui ne nomme personne du
  dossier écarte l'écriture. Complet = montant attendu **à 50 € près** (`MARGE_FONDS_RECUS`, miroir
  serveur `bilanFonds`) ; au-delà, « excédent » à vérifier, jamais « complet ». Noms cherchés :
  parties acquéreurs (et leur `nomUsage`, lu dans l'état civil « Veuve/Épouse de Monsieur … NOM » par
  `nomsUsageDansBloc`) + nom du dossier + nom du courrier d'appel de fonds + `d.nomsRecus`.
- **Honoraires de négociation / fonds de travaux** (lus dans l'avant-contrat, 29/09) : honoraires
  seulement depuis une tournure « négocié(e)s par … » (jamais les honoraires du notaire pour la
  promesse ; « négociation directe » = aucun) ; fonds de travaux seulement sur une phrase qui tranche
  le remboursement. À la charge de l'acquéreur / remboursé → ligne au débit de l'appel de fonds.
- **Appel de fonds** : établi par l'office, ou repris du décompte du confrère quand l'étude est en
  participation. Prêt hypothécaire : montant du prêt **déduit**, frais de garantie **appelés au
  débit**. Taxe foncière : montant de l'avis lu en bas à droite de la page 2 ; avis sur plusieurs
  biens → TEOM répartie **au prorata de la taxe foncière** de chaque bien, ajoutée au bien vendu ;
  prorata acquéreur du jour de l'acte au 31/12. Relevé de compte = sommes déjà versées (à déduire).
- **Mobilier** : le prix reste le prix total ; `d.prixMobilier` sort seulement de l'assiette des
  droits (frais d'acte, contrôle du barème).
- **Prorata** : jours réels, jour de l'acte à la charge de l'acquéreur, arrondi du vendeur par
  complément.
- **Textes d'emails fournis par l'étude** (provision, prêt manquant, RIB, réception des fonds,
  questionnaire, vente préalable au confrère) : repris **mot pour mot**, à ne pas reformuler.
  Même règle pour `PROCEDURE_FONDS` et les clauses de l'annexe des quotités.
- **Barème du simulateur de provision : jamais audité.** Indicatif seulement, jamais recopié dans
  un courrier ; le contrôle du barème de l'appel de fonds est un signal, il ne remplit rien.
- **Rendez-vous retiré de CLAIRE** → retiré aussi de l'agenda (et repère `rendezVousRetire` pour
  que le flux ne le remette pas). Une date saisie à la main n'est jamais écrasée par l'agenda.
- **Apprentissage** : corrections de classification (dates, engagements) et exclusions stockées en
  base, partagées entre postes. Les valeurs libres (nom, adresse, prix) ne sont pas apprises.

## Relecture d'actes (Outil 2) — état actuel

Quatre étapes : documents (dépôt ou dossier NAS complet) → pseudonymisation (vérifiable) →
analyse par API → bilan (carte de santé, grille de points par thème, clauses contradictoires,
aperçu PDF à la page citée, coût). La grille (`GRILLE_RELECTURE_OUTIL2`) vit côté client et dépend
du mode (avant-contrat / projet de vente) et du **type de bien** (maison, copropriété, terrain),
choisi avant l'analyse. Chaque citation est **vérifiée mot pour mot** côté serveur ; un point omis
ressort « à vérifier », jamais « validé ». Les commentaires de l'étude (mode commentaires) sont
renvoyés au modèle comme consignes, après pseudonymisation. Les analyses sont enregistrées en clair
sur le serveur (table `relectures`), la requête pseudonymisée dans `analyses_claude`. Les contrôles
déterministes de CLAIRE (sans IA) complètent l'analyse et fonctionnent sans clé API.
Plainte principale de l'étude : **le bruit**, pas les oublis — ne pas élargir de motif sans acte réel.

## Pièges techniques déjà payés

- **Le texte pdf.js n'a qu'un retour à la ligne par PAGE** (items joints par une espace). Toute
  regex ancrée sur `^`/`\n` est fausse sur ce texte ; utiliser `lireTextePdfEnLignes()` (lignes
  reconstruites par position verticale) quand il faut de vraies lignes. Piège payé trois fois.
- **`\b` et les lettres accentuées** : `\b` ne se place jamais à côté de `é`/`É` (`\w` = ASCII).
  Utiliser des lookarounds `(?<![A-Za-z0-9_À-ɏ])` / `(?![A-Za-z0-9_À-ɏ])`.
- **Écrire une regex via un script Python** peut insérer un BACKSPACE (U+0008) à la place de `\b`.
  Contrôle obligatoire : `grep -c $'\x08' script.js` doit rendre 0.
- **Noms de fichiers macOS en NFD** : `normaliserNomPourMotif` normalise en NFC (et `_`/`-` → espace).
  Si un nom « évidemment correct » ne matche pas, comparer les points de code.
- **`onclick="f('…')"`** : l'attribut est décodé en HTML avant d'être exécuté en JS — `&#39;`
  redevient une apostrophe brute. Utiliser `escapeOnclickArg()` pour un argument JS, `escapeAttr()`
  pour un vrai attribut.
- **Spécificité CSS** : `input[type="text"]` bat un simple `input.ma-classe` à égalité par l'ordre
  du fichier — utiliser un sélecteur composé (déjà rencontré sept fois). Une piste de grille `1fr`
  ne descend pas sous son contenu : `> * { min-width: 0 }` contre le débordement horizontal.
  L'attribut `hidden` perd contre une règle `display` : basculer par `style.display`.
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

- **Versionnage** : à chaque commit qui change le comportement, mettre à jour `VERSION_APP` **et**
  ajouter une entrée en tête de `HISTORIQUE_VERSIONS` (haut de `script.js`), heure de Paris :
  `TZ='Europe/Paris' date '+%Y-%m-%d %H:%M'` (jamais `date` seul : l'environnement est en UTC).
  C'est ce que l'étude lit dans « À propos ».
- **Poser les questions de cadrage** (`AskUserQuestion`) quand une demande admet plusieurs
  lectures, surtout en droit notarial ou quand l'action écrit dans un agenda/une boîte partagés.
- **Garder l'interface cohérente** : jetons CSS existants (`--focus` = accent du thème choisi,
  couleurs de catégorie fixes), icônes SVG du jeu `ICONES`, composant `.dot-label` pour les statuts,
  pas d'emoji comme icône, pas de couleur inventée. Mode clair et sombre, largeur téléphone.
  **Tout geste** (email, préparer, noter, créer…) est une ligne d'action `renderLigneAction` (forme
  de « À faire », même titre et même verbe qu'elle pour le même geste) ; tout « Ajouter … » est un
  `button.bouton-ajout` ; l'édition d'une donnée passe par des icônes (crayon, ✓, ×) ; seuls les
  formulaires gardent des boutons classiques.
- **Formats (étude, 29/09)** : tout montant en euros passe par `formaterMontantEuros`
  (`formaterPrix`/`formaterPrixCentimes`, « 360.000,00 € », miroir `formaterEuros` dans
  `jobs/rappels.js`) et toute saisie de montant par `eurosDepuisSaisie` (jamais « ne garder que les
  chiffres » : « 250.000,00 » deviendrait 25 000 000). Toute adresse passe par `normaliserAdresse`
  (format « SAINT-AIGNAN (41110), 2 rue des Cours de Meusnes » : commune en capitales, tirets et
  CEDEX gardés) ; le destinataire d'un courrier garde la forme postale (`adressePostaleCourrier`).
- **Texte d'aide** : ne décrit pas ce que le bouton dit déjà ; il dit ce qui manque. Une toute
  nouvelle confirmation commence par son verbe d'action (`boutonConfirmation`). **Une explication
  n'est jamais un paragraphe** (étude, 29/09 : « ça charge trop l'interface ») : elle va dans une
  pastille « i » à côté du titre ou du libellé (`infoBulle(texte)` dans un gabarit, `<span
  class="info-i" tabindex="0" data-info="…">` en HTML, `definirInfoBulle` pour la changer). Restent
  en texte visible : un état, un résultat, une erreur, une liste vide. **Réglages** : rubriques à
  gauche (`SOUS_ONGLETS_REGLAGES`), une colonne de lignes `.reglages-option` / `.reglages-champ`
  dans des `.reglages-section` — pas de cartes en grille.
- **Toute nouvelle fonction pure** : la déclarer `function` (ou `var` pour une table) pour la
  tester ; les fonctions qui touchent `dossiers`/le DOM se vérifient dans un vrai Chromium
  (Playwright, `/opt/pw-browsers/chromium`) avec un serveur réel et des dossiers inventés.
- **Environnement de développement** : les CDN (pdf.js, tesseract, docxtemplater, Google Fonts),
  Ollama, le NAS, Exchange et les services Microsoft sont injoignables ici — le dire dans le compte
  rendu plutôt que présenter comme vérifié ce qui ne l'a pas été.

## Comment tester

- `npm test` à la racine (client, `node:test`, aucune dépendance) et `cd server && npm test`.
- `tests/helpers/load-app.js` charge `script.js` dans un `vm.Context` avec un faux DOM. Deux
  limites : seules les `function` et `var` de premier niveau y sont visibles (un `const`/`let` est
  invisible) ; un tableau venu du contexte `vm` fait échouer `assert.deepEqual` — comparer des
  chaînes jointes.
- Côté serveur, les services extérieurs sont injectables (faux Ollama
  `server/test/helpers/faux-ollama.js`, transport SMTP, client Anthropic/Mistral, `poster` EWS) :
  aucun test n'ouvre de connexion réelle.
- En ajoutant ou modifiant une regex d'extraction, ajouter le cas dans le fichier de test du
  thème (`dates`, `engagements`, `parties`, `notaires`, `adresse`, `offre-pret`…), texte reprenant
  la structure réelle avec des noms inventés.

## Ce qui reste ouvert

- **Signature manuscrite de Bastien ANGLUMENT** (`docs/assets/signature-anglument.png`) conservée
  pour le courrier d'appel de fonds, **non branchée**. Demander d'abord si elle doit figurer sur
  tous les courriers ou seulement les siens. Le modèle Word n'a pas de placeholder d'image : poser
  l'image dans `word/document.xml` + `word/media/` et régénérer le base64, et déclarer tout nouveau
  fichier dans les deux listes d'assets.
- **Appel de fonds** : aperçu de pagination A4 non repris ; frais et droits de l'acte de vente à
  saisir à la main (barème non audité). **Pièces à lire, en attente d'exemples réels** : relevé de
  compte (versements à déduire), dernier appel de charges (prorata de charges), état daté (montant du
  fonds de travaux), montant des frais de garantie dans l'offre de prêt, détection automatique d'un
  avis de taxe foncière portant sur plusieurs biens (aujourd'hui saisie assistée).
- **Banc d'essai d'extraction** : cadré dans `docs/spec-banc-essai-extraction.md`, délégué, pas
  encore engagé.
- **Relecture d'actes** : non vérifiée avec une vraie clé API (qualité, durée, coût, contradictions)
  — à juger par l'étude sur des actes déjà relus, avec le mode commentaires. Avant l'usage réel,
  demander à Mistral : rétention zéro, absence d'entraînement, accord de sous-traitance. Connecteur
  openlegi : pas construit, seulement sur demande explicite.
- **Non vérifié au bureau** : écritures EWS réelles (création, déplacement, suppression de
  rendez-vous, note du Lieu, dates butoir, noms exacts des catégories de couleur, droits sur le
  calendrier de Sophie) ; démarrage automatique et service NSSM ; mise à jour en un clic (renommage
  de l'exe en cours) ; lien signé d'une pièce ouvert depuis Teams ; ouverture des `.eml` dans
  Outlook ; lecture EWS du calendrier de Sophie (droits de lecture, forme réelle des journées
  entières, volume par tranche) et reprise des dates butoir existantes au premier tour (une seule
  fois chacune) ; icône de l'exe ; reçus comptables (« Fonds reçus ») au-delà des deux PDF fournis.
- **Critères de sortie de bêta** (convenus) : quelques semaines sans bug bloquant, une restauration
  de sauvegarde testée, les points ci-dessus confirmés ; en bêta, seulement des corrections. Relecture
  d'actes en bêta après une dizaine d'actes relus avec commentaires et un coût jugé acceptable.
- **Pistes non engagées** : favicon reflétant l'urgence du portefeuille ; en-tête CLAIRE sur la
  fiche imprimée ; apprentissage des recatégorisations faites après enregistrement
  (`changerCategorie`) ; panneau de gestion des mémoires apprises ; mémoriser le compte client
  (`compte : N`) des reçus comptables ; exploiter le journal `corrections-extraction` pour resserrer
  les motifs (phase 3 de l'extraction).
- **Dossiers de succession à venir** : aujourd'hui tous les dossiers sont des ventes, affichés
  « VTE - NOM » (`libelleDossierAffiche`). À l'arrivée des successions, ce préfixe, le planning, la
  checklist et les emails devront dépendre d'un type d'affaire du dossier.
- **Arborescence type des dossiers clients sur le NAS** (MAISON, COPRO, TERRAIN, SUCC, CESSION DE
  FONDS) : détaillée dans `docs/historique.md` (fin du fichier). L'avant-contrat signé est à la
  racine du dossier client ou sous « SRU » ; la rubrique « AAE » contient les pièces réunies entre
  l'avant-contrat et la vente, jamais l'avant-contrat.
