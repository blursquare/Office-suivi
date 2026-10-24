# Cadrage — Les routines de CLAIRE, quatrième collaboratrice de l'office

Étude, 24/10/2026. Document de cadrage : **rien n'est construit**. Il fixe ce que l'étude a décidé, ce qui reste à confirmer, l'architecture proposée et le phasage. Une fois validé, chaque phase suit la procédure habituelle (`/publier` : vérification, relecture indépendante, audit pour une nouveauté).

## 1. Intention

> « Il faut que CLAIRE soit proactive et soit un quatrième collaborateur de l'office. À terme elle sera chargée seule de dossiers client. »

Aujourd'hui CLAIRE agit seule par du code (rappels Teams, lecture de l'agenda et des emails des dossiers, NAS, rangement des scans), et par l'IA seulement quand on lui parle (« Demander à CLAIRE »). Les routines ajoutent le travail préparé **sans qu'on le demande** : elle regarde les dossiers, prépare ce qui est prévisible, et le dépose là où le collaborateur le trouve.

## 2. Décisions de l'étude (24/10)

| Sujet | Décision |
|---|---|
| Qui voit la boîte de propositions | **Chacun la sienne** (propositions de ses dossiers, comme « Mes dossiers » ; l'administrateur voit « Tous »). |
| Heure | **Jours ouvrés, 9 h 30.** |
| IA | **IA en ligne avec masquage** (Claude, noms et références masqués par le serveur comme l'agent actuel). |
| Premières routines | Revue du matin, constitution de dossier, veille de signature, veille juridique hebdomadaire — et les ajouts ci-dessous. |
| Ajouts | Appels de fonds préparés seule ; constitution selon la règle du §5 ; autorisations de clôture/transfert 48 h avant une notoriété ; relance des pièces demandées dans les emails envoyés ; brouillon de proposition de dates quand un dossier est complet. |
| Ambition | CLAIRE collaboratrice à part entière, **chargée seule de dossiers à terme**. |

## 3. Principe : préparer, proposer, puis (plus tard) agir

Quatre niveaux d'autonomie, **réglés routine par routine** :

0. **Observer** : alerter (Teams, pastille). Existe déjà.
1. **Proposer** : un brouillon, un document ou une tâche arrive dans la **boîte de propositions** ; le collaborateur fait « Autoriser » / « Refuser » / « Ouvrir ». **Tout démarre ici.**
2. **Agir de façon réversible** : faire, noter dans le dossier signé « CLAIRE », « Annuler » possible (cocher une pièce reçue le fait déjà).
3. **Agir seule vers l'extérieur** (envoyer un email, écrire dans l'agenda) : **décision explicite de l'étude, routine par routine**, après une période probatoire. Cela modifie la règle n° 4 de `CLAUDE.md` (« aucun email au client ne part sans un clic sur Envoyer ») : tant que l'étude ne l'a pas décidé, rien ne part sans clic.

**Promotion progressive** : la boîte compte, par routine, les propositions acceptées, modifiées puis acceptées, refusées. Une routine dont le taux d'acceptation est élevé sur la durée peut être proposée à l'étude pour passer au niveau supérieur — jamais d'office. C'est le chemin vers « chargée seule de dossiers » : d'abord les dossiers simples (vente sans prêt, sans confrère), avec validation du notaire aux points d'engagement. Ce qui engage le notaire (conseil, signature, authentification de l'acte) reste hors de portée de l'automatisme.

## 4. Architecture proposée

### 4.1 Une identité : « CLAIRE »
Un auteur à part (historique des dossiers « CLAIRE — routine X », journal, Teams), qui n'est pas dans la liste fermée des responsables tant que l'étude ne lui confie pas de dossiers.

### 4.2 Un « poste CLAIRE » sur le serveur
Les générateurs de documents (courrier d'appel de fonds, courriers de la Constitution, autorisations, PDF/A) et les outils de l'agent **s'exécutent dans le navigateur** (pdf-lib, docxtemplater, pdf.js). Plutôt que de les réécrire côté serveur, les routines qui produisent des documents s'exécutent dans une **fenêtre CLAIRE sans écran** (le serveur sait déjà piloter un Chrome sans fenêtre, `server/src/navigateur/`, et le classeur des scans s'appuie déjà sur « le poste serveur ») connectée comme collaboratrice « CLAIRE ». Les routines qui n'ont besoin que de données (revue du matin par le code, veille juridique) s'exécutent directement dans le serveur.

### 4.3 Un planificateur
`server/src/routines/` : un registre (identifiant, déclencheur, entrées, sortie), un tour toutes les minutes. Déclencheurs : un horaire (9 h 30 les jours ouvrés, hebdomadaire) ou un événement (dossier créé, rendez-vous relevé dans l'agenda, email envoyé relevé). Une routine ne tourne qu'une fois par objet et par échéance (empreinte de dédoublonnage), reprend après un redémarrage et n'est jamais relancée d'elle-même après un échec.

### 4.4 La boîte de propositions
Clé `propositions` : id, routine, dossier, destinataire (le responsable), type (brouillon d'email, document, tâche, dates proposées, alerte), titre et résumé en une phrase, pièces jointes (référencées, jamais recopiées), état (proposée, vue, acceptée, refusée, expirée), empreinte. Côté poste : widget « Propositions de CLAIRE » au tableau de bord, pastille dans la barre latérale, et un bloc dans la fiche du dossier. Un brouillon d'email s'ouvre dans la fenêtre d'email habituelle ; un document s'ouvre dans son outil (Constitution, appel de fonds, autorisations). **Rien ne part sans clic.**

### 4.5 Le journal « Ce que CLAIRE a fait seule »
Chaque tour de routine écrit ce qu'il a lu, produit ou écarté (sans valeur de champ ni nom), visible dans les Réglages et dans l'historique du dossier concerné.

### 4.6 L'IA en ligne, avec les mêmes règles que l'agent
Agent « mode routine » côté serveur : outils de **lecture seule** + un outil `proposer(...)` qui écrit dans la boîte ; jamais `faire_geste`. Résultats d'outils **masqués** par le serveur (`masquerValeur`), codes rétablis seulement à l'arrivée du brouillon, montants et dates en clair (choix déjà fait par l'étude). Plafond mensuel de jetons, coût cumulé affiché, arrêt de la routine au plafond. Test « rien de nominatif ne part » obligatoire pour chaque routine.

### 4.7 Réglages › Routines
Un interrupteur par routine (**éteint par défaut**), l'heure, la date repère, le niveau d'autonomie, le plafond de jetons, le taux d'acceptation constaté, « Lancer maintenant » pour essayer.

## 5. Les routines

| N° | Routine | Déclencheur | Ce qu'elle prépare | IA |
|---|---|---|---|---|
| R1 | **Revue du matin** | jours ouvrés 9 h 30 | Pour chaque dossier : ce qui bloque (prêt dépassé, pièce manquante, rendez-vous sans appel de fonds…) et les relances prêtes en brouillon, dans la boîte du responsable ; un résumé Teams. | Rédaction des brouillons seulement |
| R2 | **Constitution de dossier** | création d'un dossier | **Vente** : seulement quand l'étude est **notaire du vendeur** et pour les dossiers entrés **à compter du 24/10/2026** ; **succession** : juste après la création. Courriers de la Constitution (mairie, urbanisme, assainissement, succession…) avec le plan cadastral, prêts à valider. | Non |
| R3 | **Appel de fonds préparé seule** | échéance de l'appel de fonds (10 jours avant le rendez-vous) | Courrier et décompte préremplis par les données du dossier (`prefillAppelFonds`), email en brouillon ; ce qui manque est listé dans la proposition (« à compléter »). Seulement quand l'office établit le décompte. | Non |
| R4 | **Veille de signature** | 48 h avant le rendez-vous | La fiche de signature (déjà construite) préparée, contrôlée ; alerte Teams « fiche prête, N conditions à lever ». | Non |
| R5 | **Autorisations de clôture ou de transfert** | 48 h avant le rendez-vous d'un **acte de notoriété** | Autorisations de déblocage / de transfert de fonds (modèles de l'office, mot pour mot) préparées d'après les fiches client d'Authentic, avec l'email d'envoi en brouillon. | Non |
| R6 | **Relance des pièces demandées** | 48 h après un email envoyé qui réclame une pièce | Lit les emails **envoyés** ; relève quelles pièces l'étude a demandées ; si 48 h après elle n'est pas trouvée dans le dossier du NAS, prépare l'email de relance. | Oui (lecture de l'email envoyé, masquée) |
| R7 | **Proposition de dates** | dossier complet (pièces, prêt, préemption) sans rendez-vous | Brouillon d'email de proposition de dates aux clients (et au confrère), avec les créneaux de `creneauxProposesSignature` (règles de l'étude : jamais à 9 h, ni entre 12 h et 14 h, ni après 18 h). | Rédaction seulement |
| R8 | **Veille juridique** | chaque semaine | Nouveautés Légifrance et BOFiP utiles à l'office. Aucune donnée de client. | Oui (aucun masquage nécessaire) |

**Constitution — historique** : clé `constitutions-faites` (dossier, courrier, date, empreinte des données). Une constitution déjà faite n'est **jamais refaite** ; si les données du courrier ont changé depuis (adresse, parcelles, défunt), CLAIRE propose une **mise à jour**, jamais un second courrier.

## 6. Garde-fous

- **Le bruit** (la plainte connue de l'étude) : une routine qui n'a rien de vérifié à dire ne dit rien ; une proposition par objet et par échéance ; expirée seule quand elle n'a plus lieu d'être.
- **RGPD** : plus de données partent chez le fournisseur, et surtout sans que quelqu'un l'ait demandé. L'accord de sous-traitance (DPA) et la rétention zéro d'Anthropic, ainsi que le registre des traitements, **restent à faire par l'étude** (voir « Ce qui reste ouvert ») ; ils devraient précéder l'allumage de toute routine qui envoie du texte à l'IA.
- **Déontologie** : jamais d'email directement au client d'un confrère (les demandes passent par son office, règle déjà codée) ; rien de plus que ce que le collaborateur ferait.
- **Heures** : alertes Teams en heures de bureau seulement ; les routines de production peuvent tourner à 9 h 30 comme décidé.
- **Coût** : plafond mensuel, arrêt au plafond, coût visible.
- **Reprise sur panne** : le serveur redémarre à chaque mise à jour automatique ; une routine commencée est reprise, jamais dupliquée.
- **Preuves** : chaque routine a son test (cas inventés), son point de « vérifications sur le terrain », et le test « rien de nominatif ne part ».

## 7. Phasage proposé

- **Phase 0 — le socle** : identité « CLAIRE », planificateur, boîte de propositions (clé, routes, widget, pastille, bloc de la fiche), journal, Réglages › Routines. Aucune routine encore ; une routine d'essai « bonjour » pour vérifier la chaîne.
- **Phase 1 — par le code seul** : R1 (blocages et relances, sans rédaction par l'IA) et R4 (veille de signature, Teams).
- **Phase 2 — le poste CLAIRE** : fenêtre sans écran, puis R2 (constitution), R3 (appel de fonds), R5 (autorisations de notoriété).
- **Phase 3 — l'IA** : agent « mode routine », plafond de jetons, puis R6 (relance des pièces), R7 (proposition de dates), rédaction des brouillons de R1, R8 (veille juridique).
- **Phase 4 — l'autonomie** : statistiques d'acceptation, propositions de passage au niveau 2 puis 3, et réflexion de l'étude sur des dossiers confiés à CLAIRE.

Chaque phase est un envoi à part, testé au bureau avant la suivante.

## 8. Hypothèses prises (à confirmer par l'étude)

1. « L'étude est notaire vendeur » (R2) = **l'étude représente le vendeur** (notre client est le vendeur et aucun confrère ne le représente). Les dossiers où l'étude ne représente que l'acquéreur, ou est en participation, sont écartés.
2. « À compter d'aujourd'hui » = dossiers **créés à partir du 24/10/2026** ; aucun rattrapage des dossiers existants.
3. Pour une succession, la constitution part **juste après la création** du dossier, avec les neuf modèles de la Constitution (la mutuelle décochée, comme aujourd'hui).
4. L'appel de fonds (R3) n'est préparé que quand **l'office établit le décompte** (pas en participation avec le décompte du confrère).
5. 9 h 30 est l'heure de la revue et des préparations ; les événements (création de dossier, rendez-vous relevé) déclenchent leur routine dans la minute.
6. Le niveau de départ de toutes les routines est le **niveau 1** (proposer) ; aucun envoi automatique.

## 9. Points ouverts

- Plafond mensuel de jetons.
- Faut-il une adresse Teams ou une boîte propre à CLAIRE pour signer ses messages ?
- À partir de quel taux d'acceptation, sur quelle durée, l'étude accepterait-elle de passer une routine au niveau 2 ?
- Le jour où CLAIRE est « responsable » d'un dossier : qui est son notaire référent, et sur quels types de dossiers commencer ?
