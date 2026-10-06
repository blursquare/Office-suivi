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
- **Session programmée « relecture des rapports techniques » (12 h 05 / 17 h 05) : JAMAIS de push sur `main`** (étude,
  03/10 — rappel après le commit direct `9ab862e` du 02/10). Un push sur `main` construit un `.exe` installé **seul** sur le
  serveur du bureau dans les 10 minutes, sans regard humain. Cette session travaille sans l'étude, sur un rapport anonymisé :
  branche `claude/rapport-AAAA-MM-JJ-HHh`, demande de fusion, et c'est **l'étude qui fusionne** — ni `git push origin main`,
  ni `HEAD:main`, ni merge local puis push, même pour un changement minuscule ou pour le rapport lui-même ; si la demande de
  fusion ne peut pas être ouverte, laisser la branche poussée et le dire dans l'issue. Le push direct sur `main` reste réservé
  aux sessions où l'étude suit le travail en direct.
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
  src/carnetConfreres.js             Carnet des confrères (relevé initial des offices du 41, liste blanche)
  src/annuaireNotaires.js            Notaires de France par département (data/annuaire-notaires.json, lecture seule)
  src/repertoire.js                  Répertoire hors notaires (relevé du répertoire Word de l'étude, par thème)
  src/ouvertureAuto.js               Installateur du relais « claire-ouvrir: » (ouverture auto des téléchargements)
  src/installationPoste.js           Installateur « CLAIRE en application » d'un poste (raccourcis --app, voir plus bas)
  src/jobs/rappels.js                Rappels par email (planning de commun/planning.js, `autre-<index>` pour les personnalisées)
  src/appels3cx.js, routes/appels.js Appels reçus par 3CX (sonnerie → journal, appelant reconnu, fiche ouverte)
  src/nas.js, nasWatch.js            Lecture du NAS par le serveur, surveillance périodique
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

1. **Tout reste sur le réseau du bureau.** Pas d'hébergement en ligne. Exceptions voulues et
   cadrées par l'étude : l'API de relecture d'actes (Mistral par défaut, Claude en option), qui ne
   reçoit que du texte **pseudonymisé dans le navigateur** (la table de correspondance ne quitte
   jamais le poste) ; l'autocomplétion d'adresse `api-adresse.data.gouv.fr` (seul le texte tapé part) ;
   les CDN de bibliothèques (pdf.js, tesseract.js 7.0.0, docxtemplater, docx) ; l'**API Carto de l'IGN** (outil « Droits de préemption », étude 06/10 : zonage d'une parcelle sur le Géoportail de l'urbanisme — ne part que le code postal, ou le code INSEE + section + numéro de parcelle, `server/src/urbanisme.js`) ; le **rapport technique**
   (accord de l'étude du 30/09, `rapportTechnique.js`) : issue GitHub à 12 h et 17 h les jours ouvrés,
   **anonymisée par le serveur avant l'envoi** (`anonymiserTexte` : chemins, fichiers, emails, montants,
   téléphones, mots tirés des dossiers et des collaborateurs, mots en capitales hors sigles techniques ;
   jamais d'auteur de signalement, de capture, de nom de dossier ni de valeur de champ) — tout ajout
   au rapport passe par `anonymiserTexte` et un test « aucun nom ne sort ».
2. **Accès sans mot de passe par défaut** (le réseau du bureau protège l'accès ;
   `"authActive": true` dans `config.json` le rétablit). Pas de compte par collaborateur : le
   collaborateur du poste est choisi une fois (`localStorage`), ses préférences vivent en base.
3. **Le serveur lit le NAS** (`config.nasRacine`, jamais devinée). L'API File System Access du
   navigateur est abandonnée : elle n'existe pas sur une adresse IP. Chemins confinés à la racine
   (`resoudreCheminNas`, liens symboliques résolus avant contrôle, PDF seulement). **Seule écriture
   sur le NAS : le classeur des scans** (accord de l'étude du 30/09) **et les pièces jointes des emails des
   dossiers** (étude 02/10, `scans.copierDansDossierClient`, mêmes règles) — une COPIE dans le dossier
   client (`COPYFILE_EXCL`, « Nom (2).pdf » plutôt qu'écraser), l'original déplacé dans
   « Scan/CLAIRE - scans rangés/AAAA-MM », jamais supprimé ; nom de scan = simple nom de fichier,
   dossier client confiné par `resoudreCheminNas`. Tout accès disque
   est **asynchrone** : un appel `*Sync` dans un chemin de requête fige tout le serveur (Node est
   mono-thread — la cause des « coupures » passées). Une route `async` doit rattraper ses erreurs
   (`routeAsync()` dans `routes/nas.js`) : Express 4 ne rattrape pas une promesse rejetée, la
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
   questionnaire, anniversaire — texte « à variables » **identique mot pour mot** aux `construireEmail…`, vérifié par
   `tests/modeles-emails.test.js`) se modifient (`modifies[cle]`) et **les boutons de la fiche suivent** (choix de l'étude :
   `emailDepuisModele` — variante confrère choisie seule, version modifiée sinon la fonction d'origine), « Revenir au texte
   d'origine » ; modèles de l'étude (`perso`). Variables `{…}` (`VARIABLES_MODELE_EMAIL`), paragraphe retiré si une variable est
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
   d'abord un événement de même titre et même date (jamais de doublon) ; depuis la **page Agenda**
   (30/09), création de tout rendez-vous et **suppression de n'importe lequel après confirmation**
   (`POST /exchange/evenement/supprimer`, `MoveToDeletedItems`) — **touche Suppr** sur le rendez-vous sélectionné (05/10, même confirmation, jamais dans un champ de saisie ni pendant une fenêtre ouverte ; `evenementSupprimableAgenda`) ; **modification** (01/10, titre + Start/End
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
   heure sont gardés, jamais le corps ; affiché **pour Bastien seulement** (`DESTINATAIRES_EMAILS_MATIN`).
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
   rattachés à un dossier (mêmes règles que le résumé du matin, champs à plusieurs adresses compris ; étude 06/10 : adresses des
   parties d'Authentic, fils — réponse « RE: » à un échange d'un seul dossier, adresse écrite par l'étude pour un seul dossier —, dossiers
   archivés après les dossiers en cours ; adresse de plusieurs dossiers → l'objet départage, sinon rien — `contexteClassement`/`dossierDeEmail`) relus en entier,
   **texte jamais gardé** (résumé d'une phrase par l'IA locale, puis jeté), pièces jointes listées (images intégrées
   écartées) ; « Éléments envoyés » du compte relié et de chaque collaborateur des Réglages (accès délégué « Relecteur » à
   donner dans Outlook, sinon « Accès non donné ») → objet, destinataires, date seulement ; un email préparé par CLAIRE
   (`livrerEmailDossier` → `POST /api/emails-prepares`) retrouvé (même objet, un destinataire commun, après la préparation)
   passe « envoyé le … ». Onglet Échanges : bloc « Emails » (`renderEmailsDossier`, fiche ouverte relue chaque minute ; étude 02/10 « une
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

- **Parties** : Vendeur = Promettant, Acquéreur = Bénéficiaire — sauf promesse d'**achat**, où le
  rôle se déduit du type d'acte (`ROLES_PAR_TYPE_ACTE`). La **forme** de l'acte (authentique : les
  notaires sont nommés en première page ; sous seing privé : en fin d'acte) est distincte de son
  **type** ; « AAE » dans un nom de fichier = acte authentique électronique.
- **Notaires** : priorité mention explicite (hors clause d'origine de propriété) > règle
  géographique (`REGLES_NOTAIRE_INSTRUMENTAIRE`, bien dans le 41) > ordre dans la zone attendue ;
  sinon rien n'est deviné. **Champs notaire liés à l'annuaire** (étude 05/10) : recherche dans tout l'annuaire à la frappe (`proposerNotairesAnnuaire`), nom complété seulement si UN SEUL notaire correspond (`completerNomNotaire`) ; à la création, un notaire lu dans le compromis prend le libellé de l'annuaire (`notaireDepuisRepertoire`, seul de son nom en France ou dans le 41 et ses voisins), et l'agence lue celui du Répertoire (`agenceDepuisRepertoire`, thème « immobilier »), notre office toujours « Maître Sophie GOSSART (BLOIS) » (`NOTAIRE_ETUDE_LIBELLE`, `canoniserNotaireEtude` ; bouton « Notre office » sur la fiche, placé seul du bon côté dans Nouveau dossier quand le rôle est lu, déduit ou choisi). Le rôle de l'étude (instrumentaire/participant) est déduit du côté qui
  reçoit l'acte ; si un autre office représente l'acquéreur, les emails vont **au confrère**
  (« Mon Cher Maître, … Votre bien dévoué. ») et le questionnaire de satisfaction n'est jamais proposé à
  l'acquéreur ; il peut l'être **au vendeur** quand l'étude le représente (étude 02/10, `renderQuestionnaireVendeur`,
  `d.questionnaireVendeurEnvoyeLe` ; chaque envoi archive le dossier, l'autre reste proposé).
- **Responsables** : liste fermée (Bastien ANGLUMENT — administrateur, vue globale —, Julie
  VASSELIN, Jérémy SAUJOT).
- **Planning** (`echeancesPlanning`, **`commun/planning.js`**, partagé poste/serveur depuis le 04/10 ; côté serveur
  `toutesEcheances` n'en est que l'habillage `autre-<index>`) : vente préalable → obtention du prêt → *renonciation au droit de
  préemption* (bloquante hors copropriété, sauf pièce retirée ou participation ; en copropriété
  seulement si une pièce personnalisée « préemption/DPU/DIA » a été ajoutée) → *délai SAFER*
  (date butoir tirée d'Authentic, voir l'extension) → fixer le rendez-vous → envoi appel de fonds → envoi projet → signature. La **date butoir** est informative dès qu'un
  rendez-vous est fixé (hors planning et hors rappels). Une date d'envoi saisie vaut envoi fait.
- **Statut affiché d'un dossier = son état général** (étude, 29/09 au soir : `etatDossier`,
  `renderBadgeStatut`) : un seul badge partout (tableau de bord, Suivi, fiche, recherche) —
  « À relier » (jamais relié au NAS), « Attente de pièces » (pièce de la checklist ou offre de prêt
  manquante ; participation : l'offre seule), « Complet » (tout reçu), « Prêt » (complet + rendez-vous
  placé), et **« Urgent »** dès qu'une date butoir est dépassée (vente préalable, prêt, date butoir
  sans rendez-vous) — prioritaire, calculé, il disparaît dès l'échéance levée. Confirmé par l'étude :
  un rendez-vous placé avec une pièce manquante reste « Attente de pièces » ; une vente préalable non
  réalisée (financement, comme l'offre) empêche « Complet » et « Prêt ». Couleurs : rouge, gris, ambre, bleu `--acte`
  (jamais l'accent, qui peut être orange ou vert), vert. **Suivi** (30/09, choix de l'étude) : barre en trois lignes
  (`.suivi-barre`) — grande recherche (nom du dossier seulement ; le collaborateur passe par le filtre
  « Responsable », pré-réglé sur celui du poste à chaque session, **sauf l'administrateur, qui voit « Tous »** (étude 02/10) — `filtreSuiviParDefaut`, `appliquerFiltreSuiviCollaborateur`, reposé au changement de poste) + bascule de vue, filtres sur une ligne (« Trier par »
  en vue Tableau seulement ; interrupteur « Archivés » (`wa-switch#voir-archives`, cadre des filtres, étude 04/10) allumé → section « Archivés » en bas de la vue Échéances,
  `archivesPourEcheances`, date de signature sinon d'archivage, jamais dans une semaine), statuts en pastilles de filtre (`syntheseEtatsSuivi`, `renderEtatsSuivi`) ; **à gauche** (colonne de 300 px comme celle de l'agenda, étude 01/10, `.suivi-corps`/`.suivi-cote` ; au-dessus sous 1100 px),
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
  signature J-25/J-15, personnalisées J-15/J-7 (`SEUILS_RAPPELS_PAR_TYPE`).
- **Relance de l'offre de prêt au client** : première à J-15, puis tous les 10 jours, y compris
  après l'échéance, jusqu'à réception de l'offre ou archivage.
- **Offre de prêt** : reconnue par le nom du fichier, à défaut par le titre de la page de garde
  (≥ 6 pages) confirmé par l'IA locale ; « à confirmer » si le modèle est indisponible. Garanties
  lues dans le seul paragraphe « GARANTIES », une garantie conditionnelle/future n'est pas comptée. Offre reçue sans garantie lue : « Garantie non identifiée »
  (`garantiesPretAffichees`), jamais un blanc.
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
- **Onglets de la fiche** (étude 05/10) : Échéances · **Pièces et analyse** (checklist puis analyse de l'avant-contrat ; « Analyse » seule en participation) · **Fonds** (`renderFondsDossier` : provision, appel de fonds, fonds reçus et confirmation, relance, RIB — `CLES_ECHANGES_FONDS`, sortis d'Échanges ; absent en succession) · Échanges · Historique.
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
  `d.situationVendeur`/`d.situationAcquereur` ; vide → déduite de la situation matrimoniale relevée dans Authentic, jamais d'un
  prénom). Courrier d'appel de fonds (`lignesDestinatairesAppelFonds`, `salutationAppelFonds`) : marié Monsieur + Madame
  « Monsieur et Madame Paul DUPONT » ; sinon chacun nommé avec sa civilité, Monsieur d'abord (« Monsieur Paul DUPONT et Madame
  Léa MARTIN », « Monsieur … et Monsieur … ») ; formule selon les civilités (« Chers Monsieur et Madame, », « Chers Messieurs, »,
  « Chères Mesdames, »).
- **Dépôt de garantie** : toujours déduit de l'appel de fonds (l'agence reverse la somme) ; le
  détenteur dit seulement quoi réclamer.
- **Fonds reçus** (reçus comptables du NAS) : le client est le **titulaire** en début de ligne, et
  seulement le premier nommé d'un compte à deux noms, sauf si la référence de la vente
  (« VTE VENDEUR/ACQUÉREUR ») cite le vendeur du dossier ; une référence qui ne nomme personne du
  dossier écarte l'écriture. Reçus **gardés en mémoire** : les fichiers sont supprimés du commun une fois traités, un versement déjà
  retenu dont le fichier n'est plus relu reste compté (`fusionnerRecusMemorises`, `memorise`), retrait
  à la main seulement. Complet = montant attendu **à 2 € près** (étude 05/10, 50 € avant ; `MARGE_FONDS_RECUS`, `bilanFondsRecus`
  dans `commun/montants.js`, le serveur l'importe sous le nom `bilanFonds`) ; au-delà, « excédent » à vérifier, jamais « complet ». Noms cherchés :
  parties acquéreurs (et leur `nomUsage`, lu dans l'état civil « Veuve/Épouse de Monsieur … NOM » par
  `nomsUsageDansBloc`) + nom du dossier + nom du courrier d'appel de fonds + `d.nomsRecus`.
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
- **« Nouveau dossier » : deux entrées** (étude, 02/10 au soir, `MODES_IMPORT`, `choisirModeImport`,
  `renderChoixImport`) — **« Compromis (PDF) »** : le compromis lu, on reste sur l'étape 1 — le dossier d'Authentic qui correspond est proposé en tête (« Dossier trouvé dans Authentic », `dossierAuthenticPourCompromis`, étude 05/10 : Authentic pré-remplit, prix compris, le compromis complète) : « Compléter depuis Authentic
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
  Notaires à la création : lus dans l'acte et dans Authentic (`notairesProposesWizard`) ; **le notaire relevé dans Authentic
  est posé des deux côtés, notaire du vendeur recevant l'acte, quand aucun côté n'est rempli** (étude 02/10,
  `placerNotaireAuthenticParDefaut`) ; sinon placés d'un clic (vendeur, acquéreur, les deux), « Notaire qui reçoit l'acte » (`f-cote-instrumentaire`), rôle de l'étude déduit
  (`roleEtudeDeduitWizard`). **Un notaire de l'acte cité sans son côté reste vide (jamais deviné) mais n'est plus caché** : fiche
  « Lus, à placer » (`notairesNonPlacesDossier`, `placerNotaireFiche`) au lieu d'une ligne repliée.
  **Compléter un dossier avec le compromis** (étude 03/10 : Authentic crée le dossier, le compromis le complète — mode
  complément du même wizard, `complementDossierId`) : fiche › « Avant-contrat » › « Compléter » (dossier sans compromis lu,
  non archivé, pas une succession ; compromis du NAS proposé, « Lire » = `lireCompromisNasPourComplement`, jamais lu seul) ou
  doublon de « Nouveau dossier » → « Compléter le dossier » / « Créer quand même » (`demanderConfirmation` avec
  `options.autre`). Vérifier = bloc « Déjà sur la fiche » (`comparaisonComplement`, `resolutionComplement`) : **la fiche gagne
  toujours sauf choix « Compromis » sur la ligne**, emails fusionnés, vides remplis ; `appliquerComplementSurDossier` ne touche
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
  successions : à définir avec l'étude. **Structure réelle d'une page de succession reçue le 05/10** (copie de structure, `docs/historique.md`) : intitulé « N - … veuve de … » (le défunt en tête, pas « VTE X / Y »), rubriques Comparants (héritiers : « veuve de », « épouse de », « divorcé de », « époux de »), Immeubles (« Immeuble commun »), onglets Formalités préalables / Actes / Formalités postérieures, tableaux **Courrier**, **Demande** (banque, sécurité sociale, retraite… avec « Mail le JJ/MM/AAAA »), **Etat civil** (« Envoyé », « Réponse positive »), réquisitions, **Rédaction** (« Non rédigé ») — **non lue** : à brancher seulement sur demande de l'étude.
- **Classeur des scans du copieur** — nom affiché **« Claire Scan »**, **bannette à papier** (icône `bannette`, `#tab-scans`) avec pastille du nombre de scans à ranger, dans la rangée d'icônes sous le logo de la barre latérale (étude, 30/09 — visible barre repliée et sur téléphone) (30/09, `TYPES_SCAN`, `propositionScan`, `server/src/scans.js`) :
  dossier du copieur = **`\\192.168.60.5\Scan`, partage à part** du NAS (étude, 30/09) — trouvé
  comme `\\serveur\Scan` du serveur de `nasRacine` (`partagesScansCandidats`), sinon un dossier
  « Scan » dans `nasRacine` ou ses parents, ou `nasScans` dans config.json. **Surveillance de fond dès le démarrage**
  (`demarrerSurveillanceScans`, tôt dans `demarrerApplication`) : réessai toutes les 20 s tant que le
  dossier n'est pas trouvé, puis toutes les 2 min ; le serveur retient le dernier dossier trouvé. **Seuls les nouveaux
  scans** : `depuis` = heure exacte de l'activation (les scans déjà présents ne sont jamais touchés),
  ou une date choisie dans les réglages. Lecture dans le navigateur (pdf.js, OCR tesseract.js des 2 premières pages d'un scan
  sans texte). **Type de pièce lu sur le haut de la page 1 seulement** (1 500 caractères), la mention
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
  `infosRendezVousDossier`. Trait rouge de l'heure mis à jour toutes les 30 s (`traitHeureAgenda`, `majTraitHeureAgenda`). **Historique** (01/10) : avant le stock, chaque mois affiché est lu à la demande dans Exchange puis gardé (`GET /api/agenda/passe`, clés `agenda-archive:AAAA-MM`, plus relu une fois stabilisé), en lecture seule ; **Recherche d'un dossier** dans l'en-tête de la page, à la place du bouton « Actualiser », au style du champ du Suivi et **qui filtre l'agenda comme le Suivi filtre sa liste** (étude 01/10, `evenementsFiltresRecherche` : titre, lieu, dossier ; nombre trouvé + « Tout afficher » sous la date) ; liste dessous (`resultatsRechercheAgenda`) : le nom mène au rendez-vous (`allerAuDossierAgenda` : jour de la signature et son détail, sinon semaine probable et sa carte fantôme, sinon la fiche), l'icône « fiche » ouvre la fiche (`ouvrirFicheDepuisRechercheAgenda`) ; « Actualiser » = icône à côté de « Agenda de l'office lu … » (`actualiserAgenda`). « Aller à une date » dans la barre (icône calendrier seule, sans date affichée à côté d'« Aujourd'hui » — étude 01/10, `ouvrirAllerDateAgenda`). **Comparaison avec l'an dernier** (01/10) à côté de « Agenda de l'office lu… » : rendez-vous horaires **d'une heure ou plus** lun→sam (hors journées entières et options ; étude 01/10, `DUREE_MIN_RENDEZ_VOUS_COMPTE`, semaines gardées marquées de la règle `REGLE_COMPTAGE_RENDEZ_VOUS`, relues si elle change) vs la même semaine 52 semaines plus tôt, lue une fois dans Exchange puis gardée (`GET /api/agenda/comparaison`, clé `agenda-comparaison`). Colonne de gauche : mini-calendrier du mois (sans légende des couleurs, étude 30/09), « Dates proposées » juste dessous, puis anticipations (« Signatures de la semaine » retiré le 01/10) ;
  **détail du rendez-vous choisi dans une fenêtre posée sur l'agenda, à côté du rendez-vous cliqué**
  (étude, 30/09 : « dans un popup, pas à gauche » — `agendaSelection`, `renderPanneauDetailAgenda` dans
  `#agenda-popover`, `renderPopoverAgenda`/`positionnerPopoverAgenda`, ancre `data-cle` ; feuille au bas de
  l'écran sur téléphone ; fermée par ×, Échap ou clic ailleurs). **Vue Semaine** : nom du dossier en
  entier sur plusieurs lignes (`lignesTitreEvenement`), puis heure de début + initiales du collaborateur
  (+ confrère), sans heure de fin ni durée (`renderEvenementSemaine`) ; **création comme dans Outlook** (étude, 30/09) : un clic
  sur une case vide surligne un créneau d'1 h à la demi-heure près (`choisirCaseAgenda`, `heureCaseAgenda`,
  `agendaCaseChoisie`), un double-clic (01/10 : à la souris, un second clic simple déplace le créneau ; au clavier et au doigt, un second appui) ouvre « Nouveau rendez-vous », 1 h par défaut ; rendez-vous lus par le serveur (stock `agenda-office`, tenu à jour à la création/suppression
  depuis CLAIRE entre deux tours) ; signatures de CLAIRE absentes d'Outlook en pointillé. Agenda
  « intelligent », **sans IA, chaque point expliqué** : `probabiliteTenueSignature` (97 % moins des
  retraits pondérés par la proximité : financement, vente préalable, préemption, pièces, envois, fonds,
  collaborateur absent), `creneauxProposesSignature` (dossiers de `dossiersAPlacer`, un créneau par jour
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
  **« Confirmer la réception des fonds »** dans « À faire » à 3 jours du rendez-vous seulement (étude 05/10, `JOURS_CONFIRMATION_FONDS`) ;
  **« Relancer pour les fonds »** si les fonds ne sont pas arrivés 3 jours avant (`relanceFondsDue`, `JOURS_RELANCE_FONDS`,
  `construireEmailRelanceFonds`, une fois par date `relanceFondsPour`, À faire + Échanges, premier jet de CLAIRE),
  questionnaire J+1…J+14, un mot un an après — **jamais quand un confrère accompagne l'acquéreur**,
  étude 01/10) : ces emails vivent dans l'**onglet Échanges de la fiche** (`echangesSelonStade`, utiles quand ils sont
  dus ou faits), plus dans la barre de l'agenda (retirés le 01/10). **Couleur d'un
  rendez-vous = celle d'Outlook** (étude, 30/09) : couleur nommée dans la catégorie
  (`couleurCategorieOutlook`, jetons `--cat-*`), sinon type réglé (office/visio/confrère), sinon
  absence, signature, autre — page Agenda et fenêtre du matin. **Absences et dates butoir en rose** (étude, 01/10, avant la
  couleur Outlook ; absences rayées ; `estDateButoirAgenda`). Fenêtre du matin : « À faire » à gauche,
  à droite (étude 02/10 : « ce qui s'est passé depuis hier 18 h ») onglets **« Depuis hier 18 h »** (`renderDepuisHier18h` :
  documents reçus et cochés listés — `documentsDepuis`, `d.piecesTrouveesLe` ; nombre d'emails reçus et écartés ; liste des
  demandes de l'IA ; autres nouveautés repliées) · Agenda du jour (`ongletFenetreJour`), 660 px de haut au plus. Emails de confirmation,
  rappel et anniversaire = **premiers jets de CLAIRE**, à remplacer par les textes de l'étude.
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
  hachurées dans l'agenda, retirées (`MoveToDeletedItems`) au placement, à l'annulation ou après
  5 jours ouvrés. Votants par défaut : les clients, ou le confrère qui représente une partie. Aussi offert depuis le formulaire « Nouveau rendez-vous » (« Proposer plusieurs dates », créneau saisi en tête, `proposerPlusieursDatesAgenda`). **Sans dossier** (01/10) : sondage au `titre` libre (destinataires libres, dont confrère ; options « Titre ? — option CLAIRE » ; page `t=r`), lancé par la moitié droite du bouton double « Nouveau rendez-vous | Proposer des dates » de l'en-tête de la page, à droite du champ de recherche (étude 01/10, `.ag-ajout-double` dans `#agenda-creation`), suivi dans le volet à droite **« Dates proposées »** (tiroir comme une fiche, étude 01/10, lien sous le mini-calendrier, `ouvrirSuiviDatesProposees`, `classerSuiviDatesProposees` : en attente — tableau des réponses, Placer/Relancer/Relire/Annuler —, validées — date retenue, « Voir dans l'agenda » —, sans suite ; tous les sondages, avec ou sans dossier ; **pastille rouge sur « Agenda » dans la barre latérale** quand une réponse revient — `reponsesNonVuesSondages`, repère `claire-dates-vues:<poste>` en localStorage, effacée à l'ouverture du volet), « Placer » crée un rendez-vous ordinaire. Textes =
  premiers jets de CLAIRE. **Copie de l'acte / attestation de vente en participation** (étude 03/10 : le confrère reçoit
  l'acte, l'étude envoie à son client) : ligne Échanges une fois l'acte signé (`renderEnvoiCopieActe`, client =
  `clientsParticipation`) → fenêtre `#copie-acte-overlay`, PDF du dossier **« Fausses minutes »** du commun
  (`server/src/faussesMinutes.js` : `nasFaussesMinutes` de config.json, sinon partage `\\serveur\Fausses minutes`, sinon dossier
  ainsi nommé dans `nasRacine` ou ses parents ; `GET /api/nas/fausses-minutes` + `/fichier`, lecture seule, confiné) ;
  `faussesMinutesPourDossier` (noms des deux côtés, jamais antérieur de plus de 7 jours au rendez-vous) ; ≤ 21 Mo
  (`LIMITE_PIECES_JOINTES_OCTETS`) joints au `.eml`, au-delà WeTransfer ouvert et « [lien WeTransfer à coller ici] » ;
  `construireEmailCopieActe` premier jet de CLAIRE, `d.copieActeEnvoyeeLe`. **Email du vendeur** (`d.emailVendeur`) : wizard, fiche, lecture de l'acte
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
  sinon il affiche CLAIRE sur l'appel (`#appel=`). Appels du dossier dans l'onglet Échanges. **Numéros cliquables** (étude 05/10, « les ouvrir dans 3CX », `liensAppelTelephone` : un lien `tel:` par numéro d'un champ, jusqu'à 3) : téléphones des parties de la fiche, appels reçus, bandeau d'appel entrant, en plus du Répertoire et de l'annuaire des notaires ; le numéro écrit **en texte** est enveloppé dans la balise `<tcxspan tcxhref="numéro">` de l'extension Chrome « 3CX Click to Call » (`texteAppel3cx`, forme relevée par l'étude le 05/10 : l'extension ne voit qu'un numéro du TEXTE d'une page, jamais dans un lien, un champ de saisie ni derrière une icône — répertoire `ligneTelephoneRepertoire`, ligne « Tél. confrère » de la fiche `telephoneConfrereDossier` : numéro saisi `d.telephoneNotaireParticipant`/`d.telephoneConfrereVendeur`, sinon celui de l'annuaire, reconnu à l'appel), l'icône à côté étant un lien `tel:` (3CX application du protocole du poste ; points terrain `telephone-3cx-lien`, `telephone-3cx-texte`, **non vérifiés au bureau**). **Fenêtre CLAIRE en application** (étude 06/10 : « fonctionne en onglet Chrome mais pas dans l'app séparée ») : profil Chrome à part (`Claire`, `ClaireServeur`), sans les extensions du Chrome habituel — l'extension « 3CX Click to Call » s'y ajoute une fois par poste depuis la fenêtre CLAIRE (Réglages › Téléphonie 3CX › « Ajouter l'extension 3CX », point `telephone-3cx-fenetre-app`). **Coupé collaborateur par collaborateur** (étude 02/10, interrupteur sur sa ligne dans Réglages › Téléphonie 3CX, clé `telephonie-3cx` `postesCoupes`) : ses sonneries ne sont plus notées, sa fenêtre ne relève plus rien.
- **Droits de préemption** (étude 06/10, outil `preemption`, `client/45-preemption-regles.js` + `46-droits-preemption.js`,
  `server/src/urbanisme.js`) : DPU/DPUR d'après le tableau Cheuvreux (mutation puis bien), Agglopolys = DPU sur toutes les zones
  U et AU du PLUi (délibération 29/11/2022, exercé par la commune, Agglopolys pour les ZAE), DPU renforcé de Blois = parcelle AL 839
  + centre-ville ACV/ORT (plans de la délibération A_D2025_200 dans `vendor/plans/`, rue = « probable, à vérifier sur le plan ») ;
  SAFER d'après le CRIDON n° 87 (terrain p. 63, bâtiment p. 64) ; bois et forêts d'après Letulle (L.331-19 à 24). Zonage lu sur le
  Géoportail de l'urbanisme (API Carto) **pour chaque parcelle** (étude 06/10, tableau compact `renderTableauZonagePreemption`, zone retenue modifiable par parcelle `reponses.zonesParcelles` ; zones différentes → `analyserPreemptionParcelles` : chaque zone analysée, le droit garde le statut le plus exigeant et nomme les parcelles), le périmètre du DPU s'en déduit, la nature « bois » est demandée. Réponse manquante →
  « À vérifier », jamais « non » ; questions posées seulement si utiles ; résultat sur la fiche (`d.preemption`, onglet Pièces). **SAFER : une formalité même sans droit de préemption** (étude 06/10 : « information obligatoire ») — tout statut « non » de `droitSafer` porte « Information obligatoire de la SAFER (notification Vigifoncier) », lot de copropriété compris (choix par défaut, à confirmer par l'étude) ; l'outil affiche la formalité quel que soit le statut, la fiche la joint au motif.
- **Mobilier** : le prix reste le prix total ; `d.prixMobilier` sort seulement de l'assiette des
  droits (frais d'acte, contrôle du barème).
- **Prorata** : jours réels, jour de l'acte à la charge de l'acquéreur, arrondi du vendeur par
  complément.
- **Textes d'emails fournis par l'étude** (provision, prêt manquant, RIB, réception des fonds,
  questionnaire, vente préalable au confrère) : repris **mot pour mot**, à ne pas reformuler — l'étude peut désormais
  les modifier elle-même (Réglages › Modèles d'emails) ; jamais CLAIRE.
  Même règle pour `PROCEDURE_FONDS` et les clauses de l'annexe des quotités. Exception : l'email
  d'envoi du **projet d'acte** (`construireEmailProjetActe`, 30/09) est un premier jet de CLAIRE,
  à remplacer par le texte de l'étude dès qu'elle le fournit.
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
  douteuse du document est signalée en note, pas corrigée.
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
  client, « Demander son décompte au confrère » 7 jours avant le rendez-vous (`relanceDecompteConfrereDue`,
  `JOURS_RELANCE_DECOMPTE_CONFRERE`, une fois par date `relanceDecompteConfrerePour`), **jamais une fois l'appel de fonds coché** (étude 06/10 : `echeanceValidee(d, 'appelFonds')` → plus rien à demander) — À faire, onglet Fonds, modèle
  `relanceDecompteConfrere` au texte de l'étude mot pour mot, adressé à `emailConfrereVendeurDossier(d)`. Un modèle de
  `MODELES_EMAIL_RELANCE` peut porter `destinataire(d)` et `confrere: true` à la place de la règle acquéreur.
- **Fonds tous reçus, pas encore confirmés** (étude 05/10, `fondsCompletsAConfirmer`) : comptés dans la pastille rouge de « Suivi des
  dossiers » et en tête du Suivi (« Nouveau ») jusqu'à la confirmation au client ; alerte Teams « Tous les fonds sont reçus » au
  responsable, une fois par dossier (`alertesFondsDues`, même sans appel de fonds noté envoyé).

- **« Demander à CLAIRE »** (étude 06/10 : « un agent conversationnel où l'on pourrait poser n'importe quelle demande » ; choix de
  l'étude : IA locale seule, page dans la barre latérale « du type Claude », tous les gestes dès la première version, **tout sans
  carte de confirmation SAUF les emails et l'agenda**) — `client/49-assistant.js` (page `#onglet-assistant`, conversation en
  mémoire du poste, `assistantMessages`, boutons par `assistantActions` — jamais de code dans l'attribut onclick),
  `commun/assistant.js`, `server/src/assistant.js`, `routes/assistant.js` (`POST /api/assistant/comprendre`,
  `GET /api/assistant/disponibilite`). **Liste FERMÉE d'intentions** (`INTENTIONS_ASSISTANT` : état d'un dossier, pièces, échéances,
  coordonnées, fonds, À faire, depuis hier, rappel, mes rappels, email, cocher/décocher une échéance, date de la fiche, créneaux,
  placer la signature, sondage de dates, nouveau rendez-vous, agenda d'un jour, appel de fonds, quotités, provision, prorata,
  préemption, ouvrir une fiche/un écran, chercher, archiver, responsable, aide, inconnu) ; **l'IA ne choisit qu'une intention et
  recopie la phrase, tout le reste est du code** : lecture par mots-clés d'abord (`interpreterParMotsCles`, sûreté haute = Ollama
  jamais appelé), Ollama seulement quand plusieurs intentions se disputent la phrase (prompt sans la liste des dossiers ni aucune
  donnée de fiche : la phrase, la date du jour, le libellé du dossier en consultation, les 3 derniers échanges), repli mots-clés
  sans Ollama ; date, heure, montants, parts (`dateDepuisTexte`, `heureDepuisTexte`, `montantsDepuisTexte`, `partsDepuisTexte`) et
  **dossier désigné** (`reconnaitreDossier` : mots du nom ou d'une partie, ≥ 3 lettres hors mots d'usage ; égalité → « Lequel ? »
  avec les candidats, jamais deviné ; rien → dossier en consultation, sinon la phrase suivante est prise pour un nom) relus par le
  code, qui gagne sur l'IA. **Exécution = les fonctions existantes** (`etatDossier`, `piecesAttenduesDossier`, `echeancesPlanning`,
  `actionsDuJour`, `rappelsDuJour`, `envoyerRelanceCiblee`/`livrerEmailDossier`, `cocherEcheance`/`devaliderEcheance`,
  `appliquerDateEcheance` — extrait de `validerEditionDate`, voie unique de la fiche et de l'assistant —, `creneauxProposesSignature`,
  `placerCreneauSignature` (sa confirmation), `ouvrirSondageCreneaux`, `ouvrirCreationAgenda` (son formulaire),
  `preparerAppelFondsDepuisDossier`, `choisirDossierQuotites`/`calculerQuotites`, `estimerFraisActe`, `calculerProrata`,
  `ouvrirPreemptionDepuisFiche`, `archiverDossier`, `changerResponsable`) ; un geste fait aussitôt porte un bouton « Annuler » ;
  réponses écrites par le code (jamais par l'IA). Rien n'est journalisé ni gardé (la phrase peut nommer un client). Point terrain
  `assistant-ia-locale`. Une nouvelle intention = une entrée d'`INTENTIONS_ASSISTANT` (motifs, exemples — chaque exemple doit être
  compris sans IA, test `tests/assistant.test.js`) + son exécutant dans `executerDemandeAssistant`.

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
**Compte rendu succinct** (étude 06/10, `client/50-relecture-compte-rendu.js`) : carte de santé avec résumé en deux phrases,
tuiles par thème, puis **Alertes** / **À surveiller** en lignes compactes (pastille, thème, intitulé, première phrase du
commentaire, pages) et **Validé** en fin, borné à un quart de page ; au-delà de 30 lignes détaillées, intitulés seuls ; détail des
contrôles CLAIRE, synthèse complète, coût et diagnostic repliés. `planCompteRenduRelecture` (pure) sert à l'écran et au papier ;
**« Imprimer (A4) »** / Ctrl+P sortent `#relecture-cr-print` seul (une page recto verso au plus, mesuré). Une nouvelle sorte de
point du bilan passe par le plan, jamais par un bloc à part.

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
- **Poser les questions de cadrage** (`AskUserQuestion`) quand une demande admet plusieurs
  lectures, surtout en droit notarial ou quand l'action écrit dans un agenda/une boîte partagés.
- **Garder l'interface cohérente** : jetons CSS existants (`--focus` = accent du thème choisi,
  couleurs de catégorie fixes), icônes SVG du jeu `ICONES`, composant `.dot-label` pour les statuts,
  pas d'emoji comme icône, pas de couleur inventée. Mode clair et sombre, largeur téléphone.
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
  écrite en dur hors zones papier, testé) ; Montserrat pour le mot « Claire » ; Inter (Google Fonts), Lora, Times, Calibri
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
  **Barre latérale** (01/10) : pas de titres de section, des liens seulement ; « Relecture d'actes » est un outil (étude 05/10, tiroir et page Outils) ; « Outils » = page à grosses
  icônes (`OUTILS_PAGE`, `renderPageOutils`) — tout nouvel outil y est ajouté ET dans le tiroir
  (`#sidebar-sousmenu-outils`, ouvert par le + `#sidebar-groupe-outils`) ; compteurs en carré arrondi rouge.
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
  client — à modifier ensemble). Un nouveau bloc du tableau de bord = un nouveau widget. **Carte « Aujourd'hui » : une seule liste** (étude 05/10) — mes rappels du jour et sans date en tête, les tâches, puis mes rappels à venir avec leur date (`rappelsDuJour` → `aVenir`, `renderRappelsJour(…, 'avenir')`), les cochés ; « Ajouter un rappel » reste toujours visible (`data-garder`), plus de section « Mes rappels ». **Tâches : nom du dossier en surtitre** (étude 06/10 : « en surtitre de la tâche ou du groupe de tâches, en petit » ; `surtitreHtml` de `renderLigneAction`, `.ja-surtitre`, lien `lienDossierTache`), titre de la tâche seul sur sa ligne, pas de surtitre dans le tiroir d'un groupe ni dans la fiche, pas de sous-ligne, icône « fiche » (`.ja-ouvrir-fiche`) parmi les actions secondaires ; `.ja-titre` en ellipse, déplié quand la ligne est ouverte. **Colonnes de largeur fixe communes à toutes les listes de tâches** (étude 06/10 : « aligne bien tout » ; `.ja-liste.ja-taches` : case 20, délai 100, geste 132, actions 66 px, icônes 32 px) — le subgrid n'alignait pas le tiroir d'un groupe sur sa liste ; toute liste de tâches porte `ja-taches`. **Tâches d'un même dossier groupées** (étude 05/10, partout où « À faire » est listé, `renderActionsJour` → `grouperActionsParDossier`) : une ligne commune dont la case valide tout (`marquerFaitGroupeJour`, un seul « Annuler »), un tiroir qui déroule les tâches à cocher une par une — les faites du jour y restent barrées (« k/N faites »), titre seul sans sous-titre dans le tiroir ; **le nom du dossier d'une tâche ouvre sa fiche** (étude 05/10, `lienDossierTache`, `[data-ouvrir-dossier]` pris à la capture du clic) ; tout nouveau lieu qui liste les actions du jour passe par `renderActionsJour`. Disposition
  par défaut = rectangle plein (4 × 4, 2 × 8 sur téléphone, vérifié par `placementWidgets` dans les
  tests), les plus utiles d'abord ; la changer = incrémenter `VERSION_DISPOSITION_WIDGETS` (chaque
  collaborateur y est ramené une fois).
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
- **Fond grisé d'une fenêtre** (02/10) : il ne ferme que par `clicSurFond(event)` (appui ET clic sur le fond) — sinon une sélection de texte relâchée hors de la fiche la fermait.
- **Texte d'aide** : ne décrit pas ce que le bouton dit déjà ; il dit ce qui manque. Une toute
  nouvelle confirmation commence par son verbe d'action (`boutonConfirmation`). **Une explication
  n'est jamais un paragraphe** (étude, 29/09 : « ça charge trop l'interface ») : elle va dans une
  pastille « i » à côté du titre ou du libellé (`infoBulle(texte)` dans un gabarit, `<span
  class="info-i" tabindex="0" data-info="…">` en HTML, `definirInfoBulle` pour la changer). Restent
  en texte visible : un état, un résultat, une erreur, une liste vide. **Réglages** : rubriques à
  gauche (`SOUS_ONGLETS_REGLAGES`, une par sujet depuis le 01/10 : Général, Collaborateurs, Signature des
  emails, Modèles d'emails, Rappels, Agenda et Outlook, Téléphonie 3CX, Authentic, Pièces et Claire Scan, Noms de fichiers du NAS, Relecture d'actes,
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
  console**. Lancé par la construction du `.exe` après les deux suites : c'est le seul filet contre une erreur d'exécution (ordre
  de chargement, `undefined.x` au rendu). Un nouvel écran de la barre latérale s'ajoute à `ONGLETS`. `npm run verifier` l'inclut.
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

- **Signature manuscrite de Bastien ANGLUMENT** (`docs/assets/signature-anglument.png`) conservée
  pour le courrier d'appel de fonds, **non branchée**. Demander d'abord si elle doit figurer sur
  tous les courriers ou seulement les siens. Le modèle Word n'a pas de placeholder d'image : poser
  l'image dans `word/document.xml` + `word/media/` et régénérer le base64, et déclarer tout nouveau
  fichier dans les deux listes d'assets.
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
  openlegi : pas construit, seulement sur demande explicite.
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
  récents 12 h via `releves/recents`). **Fiabilité (étude 02/10, « pourquoi parfois les données ne remontent pas »)** : les dossiers sont relus (`rattraperDossiersDistants`) avant chaque page — une fenêtre cachée ne sonde plus et appliquait sur une copie ancienne ; une page va d'abord à une fenêtre du **même poste** (adresse réseau de l'extension, `origineRequete`, « local » = poste serveur), à toute fenêtre si ce poste n'en a aucune vue depuis 90 s ; une page revue est **relue** (seul un doublon < 15 s est écarté) ; une page de dossier sans dossier reconnu le dit avec son motif (`raisonDossierAuthenticIntrouvable`) et « Choisir » (`rattacherIntituleAuthentic` : choix à la main prioritaire, intitulé `d.intitulesAuthentic` et référence gardés pour les pages suivantes) ; **journal** en mémoire du serveur (12 h) dans **Réglages › Authentic** (`renderReglagesAuthentic`, résultats rapportés par la fenêtre) ; extension 0.3.6 : une page non arrivée est renvoyée 30 s plus tard. **Usage réel (étude 02/10)** : plusieurs dossiers ouverts en onglets — seul l'onglet actif désigne la page (extension 0.3.7 relève `onglets`, titres des inactifs retirés du texte : `texteSansOngletsInactifsAuthentic`, `intituleNumeroteAuthentic`) ; intitulé **variable** (« le nom n'est pas fixe ») mais **une page de dossier**, promesse et vente comprises : toute page « N - … » suivie de Importer/Comparants/Immeubles est lue par ses noms (`intituleVenteNormalise`, score sur les mots) — **jamais par le rang « N »** (étude 03/10 : le rang du sous-dossier, « 1 » presque partout : MERCIER rangé dans DORLÉAC) ; une liste de résultats (plusieurs intitulés, sans en-tête) ne désigne aucun dossier ; un **ancien dossier** des mêmes clients (acte signé avant le dossier, `ancienDossierAuthentic`) n'est jamais appliqué ; « Choisir » seulement si un dossier en cours sans numéro porte ces noms (`proposerChoixDossierAuthentic`). L'étude identifie un dossier par **« VTE VENDEURS / ACQUÉREURS »**, le numéro étant « caché dans les données du dossier » : onglet actif ou en-tête « VTE X / Y » sans numéro reconnus (`RE_INTITULE_VTE_SEUL_AUTHENTIC`, `RE_EN_TETE_VTE_AUTHENTIC`, extension 0.3.8), la référence « A 2026 00247 » relevée à part (03/10) ; fiche client dans l'onglet d'un dossier → ce dossier (`dossierOngletActifAuthentic`). **Seul le sous-dossier de VENTE est lu** (étude 03/10, BEUCHER : « 1 - Promesse VTE … », « 2 - VTE … », « 3 - Avenant ») : `sousDossierAuthentic` (en-tête « N - … ») ; promesse/avenant/autre → rien appliqué (ni « Signé le », ni pièces), dossier gardé en consultation, référence retenue. **Statuts d'un sous-dossier dans Authentic** (étude 05/10, capture du menu du badge à côté du titre, « Signé 29/09/2026 » : le badge porte le statut, la date est celle du passage à ce statut) : **Nouveau** (bleu), **Demande de pièces** (orange), **Réception des pièces** (jaune-brun), **Préparation projet** (rose), **Préparation définitive** (violet), **Signé** (vert), **En attente** (orange), **Sans suite** (rouge) — le rouge est « Sans suite » (la note du 03/10, « rouge = pas constitué », était une supposition). **Pas lus par CLAIRE** : seul « Signé le JJ/MM/AAAA » de la ligne de rédaction l'est (`etatActeAuthentic`) ; le texte de la page rend le badge « Signé » et sa date sur deux lignes séparées, sans « le ». Pistes (nouveautés, hors semaine de débogage) : statut du sous-dossier de vente sur la fiche, « Sans suite » = dossier à archiver ou à écarter, « Préparation définitive » = projet envoyé. Pages « Informations détaillées » (état « En cours », « Dossier rentré », numéro et date d'archivage, notaire, collaborateur) et « Formalités postérieures » (attestations de signature, base des références immobilières, Micen, virement) : structures reçues le 05/10, **non lues** ; page de **recherche d'un dossier** (liste « Critères de recherche (N résultats) » : n° de dossier, libellé, nombre d'actes, prévu le, signé le, situation, collaborateur, secrétaire) : reçue le 05/10, **volontairement ignorée** — ni l'extension (`pageConnue`) ni le serveur (`pageAuthenticConnue`) ne l'acceptent tant que l'onglet actif n'est pas un dossier (rejouée avec des données inventées : « autre », aucun intitulé, rien d'appliqué) ; lire « Signé le » / « Situation » de la liste serait une nouveauté. **Création depuis Authentic** (étude 03/10, choix : bandeau « Créer », jamais d'office, ventes seulement) : page de vente sans dossier (`proposerCreationDossierAuthentic` : pas une succession, pas un acte signé, sous-dossier vente) → message fixe « n'est pas dans CLAIRE » + « Créer » (`direPageACreerAuthentic`), ou ligne « Créer un nouveau dossier » dans la fenêtre « Choisir » quand un dossier proche existe ; `creerDossierDepuisPageAuthentic` → **« Nouveau dossier » › Compromis (PDF)** (étude 06/10 : « rendez-vous vers l'import avec PDF ») avec le dossier d'Authentic **retenu** (`authenticRetenuPourPdf`, son groupe `groupeAuthenticRetenu` gardé à travers les rafraîchissements) : ligne « Dossier d'Authentic retenu » sous le choix d'import, le compromis déposé → `creerDepuisAuthentic` appliqué sans clic (Authentic pré-remplit, le compromis complète, étape Vérifier) ; bouton « Sans compromis » = reprise seule comme avant ; une succession reste reprise seule ; état `a-creer` du journal (bouton « Créer le dossier ») ; **plusieurs dossiers dans la journée** (étude 03/10) : le message du bas ne montre que le dernier, le rattrapage est la section **« À créer »** en tête de « Nouveau dossier » › Depuis Authentic (`g.aCreer` de `dossiersDepuisRelevesAuthentic`, ventes en cours sans dossier, compteur rouge) — pages gardées **12 h** côté serveur (`DUREE_RECENTS_MS`, 300 au plus ; la file à traiter reste à 60 min) ; textes des badges vert/rouge à relever (non lus). Pages reconnues par leur structure réelle (`typePageAuthentic`) :
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
  **fiche client** (`clientDepuisFicheAuthentic`) et **fiche bien** (`bienDepuisFicheAuthentic`, cadastre ; lue sur un dossier existant → parcelles manquantes ajoutées à `d.bien.cadastre`, jamais remplacées, rien si autre code postal ou autre voie — `appliquerBienAuthentic`, `bienAuthenticContreditDossier`, étude 06/10 ; à la création, parcelles de tous les biens même sans adresse, `parcellesExportAuthentic` ; **copropriété** (structure reçue le 06/10) : l'onglet « Informations du bien » porte le cadastre sous « Parcelle Assise volumétrique » (mêmes colonnes), l'onglet « Lots » — sans adresse ni cadastre — donne les lots (`lotsFicheAuthentic` : tableau N°/Type/Bâtiment/Étage/Entrée/Tantièmes lot aux en-têtes « Filter by … », ligne de total, détail du lot ouvert : désignation, surfaces, étage ; `d.bien.lots`, `d.bien.tantiemesTotal`), fusionnés avec le bien de la page précédente (`fusionnerBienAuthentic`) ; sur un dossier existant `appliquerLotsAuthentic` ajoute ou complète les lots, jamais ne les retire, et passe le type de vente en copropriété (dit dans l'historique) ; ligne « Lot(s) » de la fiche `libelleLotCopropriete` ; à la création `lotsExportAuthentic`, gardés par `normaliserExtractionImportee` et `instantaneExtraction`) →
  « Nouveau dossier » › « Depuis Authentic » (`dossiersDepuisRelevesAuthentic` au format de l'export ZIP, rôles
  par l'intitulé, `creerDepuisAuthentic` ; complète un avant-contrat déjà déposé). Notaires et agence : pas encore
  relevés (page non fournie). Cellules copiées en **vocabulaire** (`vocabulaireCelluleAuthentic`). **Deuxième passe (02/10, `appliquerReleveSurDossier`)** : état de rédaction de l'acte jamais montré ni noté pour un notaire en second (participation, étude 02/10 — seul « signé » l'est) ;
  SAFER notifiée sans réponse → « Réponse SAFER » **manquante** (une fois, `saferPieceAjoutee`) avec notifiée / prise en
  compte le ; RHF envoyée / retour ; état de l'acte ; prix « Capital » (rempli s'il manque) ; collaborateur et notaire des
  « Parties prenantes » — gardés dans `d.authentic`, bloc « Dans Authentic » de l'onglet Pièces ; fiche client →
  téléphone/email manquants et situation matrimoniale, alerte si un vendeur marié/pacsé vend sans son conjoint ;
  côté de la fiche par nom de famille, nom d'usage puis **conjoint** (`roleConjointAuthenticDansDossier`), sinon
  « À rattacher » sur la fiche (`clientsAPlacer` : Vendeur / Acquéreur / ×), jamais deviné ; **emails groupés**
  « a@x.fr;b@y.fr » (`emailsDepuisTexte`) ajoutés à ceux du côté — **jamais remplacés** (étude 02/10, « garder les deux » : à la création aussi, `fusionnerEmailsTexte`/`fusionnerTelephonesTexte`, toutes les parties du côté + compromis ; email tapé dans le formulaire complété, `appliquerEmailsChamp`) — partout un champ email peut porter plusieurs
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
  non cochée avec l'état dessous (`etatAuthenticPiece`), seul **« positif »** coche ; **SAFER** : ligne « date de création · date d'envoi · état » (étude 02/10 — état « Pris en compte » / « Non préemption SAFER », sans date ; même ligne pour la RHF et les demandes, `dateEnvoiLigneAuthentic` ; `creeeLe`, `envoyeeLe`, date de décision seulement sur une ligne de réponse à une date ou en 3e date), puis **non-préemption tacite** à l'issue du délai **depuis la date d'envoi** (`envoyeeLe` ; relevés antérieurs : leur `priseEnCompteLe` était l'envoi ; miroir serveur `echeanceSaferDossier`) — 2 mois, 1 mois en réponse
  rapide, 8 jours en très rapide — **2 mois de base, les deux autres se cochent sous « Réponse SAFER »** (`delaiManuel`,
  `renderDelaiSafer`, jamais lu dans l'intitulé ; `DELAIS_SAFER`, `appliquerSaferTacite`, `verifierSaferTacites` au démarrage puis
  toutes les heures) ; **fin du délai = date butoir, comme la préemption de la mairie** (`saferLevee`,
  `echeanceSaferDossier`) : item « Délai SAFER » du planning (miroir serveur, sans rappel), ligne de la fiche, pas de
  « Fixer le rendez-vous » avant, semaine probable / créneaux au plus tôt le lendemain, retrait de probabilité ; **demandes** (alignement, numérotage, DIA…, `demandesUrbanismeAuthentic`) jamais cochées,
  « Demande envoyée le … » sous la pièce ; ce qui est acquis (positif, SAFER décidée) n'est plus touché. **Seules les
  pages de structure connue** sont envoyées (extension 0.3.3, `pageConnue`) et gardées (`pageAuthenticConnue`). **Navigation** (0.3.5, étude 02/10) : sur une page de dossier d'un autre type (« 15 - Donation SIMOND »), l'extension n'envoie que l'intitulé (`POST /api/authentic/navigation`, mis en file sans contenu ; une page connue déjà vue renvoie aussi sa navigation) → `suivreNavigationAuthentic` change le dossier en consultation (aucun s'il n'est pas suivi).
  Aperçu d'un document Comedec : pas de lien relevé. **Coordonnées** (étude 02/10) : email + téléphone de chaque
  partie sur la première page de la fiche (`fiche-coordonnees`, `champsCoordonneesPartie`) — seulement là
  (étude 04/10 : retirées de l'onglet Échanges, doublon) ; **jamais celles du vendeur quand son notaire l'accompagne** (étude 06/10, `coordonneesPartiesDossier` écarte le côté `represente` ; les valeurs restent sur le dossier). **Ligne « Authentic » de la fiche** (étude 06/10, « compléter avec les données Authentic avant ou après création » ; `renderCompleterAuthenticFiche`, client/17) : dossiers relevés dans Authentic ces 12 h (`chargerGroupesAuthenticFiche`, 60 s de cache), celui de la fiche présélectionné (`indexGroupeAuthenticPourDossier` : référence, sinon noms de famille dans l'intitulé), « Compléter » = `complementDossierDepuisAuthentic` (pure) : **seuls les vides sont remplis** — personnes d'un côté sans personne nommée, emails/téléphones fusionnés, adresse, type, parcelles et lots, prix, référence ; `memePartieComplement` reconnaît « FOURNIER » dans « Camille FOURNIER » ; historique « Complété depuis Authentic ». **Authentic est la base de la fiche** (étude 06/10, 0.173.0) : le même complément est fait **sans clic après chaque page relevée** (`completerDossierDepuisRelevesRecents` après `appliquerReleveSurDossier`, client/30) sur le dossier d'Authentic relevé ces 12 h — `groupeAuthenticPourComplementAuto` : par la référence seule quand la fiche en a une, sinon par les noms sauf référence déjà prise par une autre fiche — pages arrivées avant la création comprises ; et **une fiche client aligne l'identité de la partie** (`alignerIdentitePartieAuthentic` : « Prénom NOM » si la fiche n'avait que le nom, civilité d'Authentic qui gagne, nom d'usage, date de naissance si vide ; conjoint sous son propre nom ajouté de son côté ; deux homonymes sans prénom → rien). Jamais de remplacement d'une adresse, d'un prix, d'un type ou d'un nom complet déjà posés (à rouvrir seulement si l'étude le demande).
- **Arborescence type des dossiers clients sur le NAS** (MAISON, COPRO, TERRAIN, SUCC, CESSION DE
  FONDS) : détaillée dans `docs/historique.md` (fin du fichier). L'avant-contrat signé est à la
  racine du dossier client ou sous « SRU » ; la rubrique « AAE » contient les pièces réunies entre
  l'avant-contrat et la vente, jamais l'avant-contrat.
