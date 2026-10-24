# Cadrage — Les routines de CLAIRE, quatrième collaboratrice de l'office

Étude, 24/10/2026. Document de cadrage : **rien n'est construit**. Il fixe ce que l'étude a décidé, ce qui reste à confirmer, l'architecture proposée et le phasage. Une fois validé, chaque phase suit la procédure habituelle (`/publier` : vérification, relecture indépendante, audit pour une nouveauté).

## 1. Intention

> « Il faut que CLAIRE soit proactive et soit un quatrième collaborateur de l'office. À terme elle sera chargée seule de dossiers client. »

Aujourd'hui CLAIRE agit seule par du code (rappels Teams, lecture de l'agenda et des emails des dossiers, NAS, rangement des scans), et par l'IA seulement quand on lui parle (« Demander à CLAIRE »). Les routines ajoutent le travail préparé **sans qu'on le demande** : elle regarde les dossiers, prépare ce qui est prévisible, et le dépose là où le collaborateur le trouve.

## 2. Décisions de l'étude (24/10)

| Sujet | Décision |
|---|---|
| Boîte de propositions | **Chacun la sienne** (propositions de ses dossiers, comme « Mes dossiers » ; l'administrateur voit « Tous »). |
| Heure | **Jours ouvrés, 9 h 30.** Teams : **un résumé par responsable à 9 h 30**, pas une alerte par proposition. |
| IA | **IA en ligne avec masquage, allumée dès le départ** (Claude, noms et références masqués par le serveur comme l'agent actuel) ; l'accord de sous-traitance se régularise en parallèle (risque assumé par l'étude, voir §6). **Plafond : 50 € par mois.** |
| Identité | **« CLAIRE »** dans l'historique des dossiers et sur Teams ; les emails restent à l'expéditeur du responsable au moment de l'envoi. |
| Autonomie | **Les trois niveaux sont à prévoir, réglables tâche par tâche** (voir §3). Départ au niveau 1 sauf décision contraire pour une routine. |
| Promotion | CLAIRE propose le passage au niveau supérieur à **90 % de propositions acceptées sur 30** ; l'étude décide. |
| Constitution d'une vente | Quand l'étude est notaire vendeur **au sens large : nous représentons le vendeur OU nous recevons l'acte** ; dossiers **créés à compter du 24/10/2026** (aucun rattrapage). |
| Constitution d'une succession | Juste après la création du dossier. |
| Appel de fonds préparé seule | **Quand nous représentons l'acquéreur**, avec les documents trouvés sur le NAS ou avec le décompte du confrère. |
| Dossiers confiés à CLAIRE, à terme | **Petits actes** (PACS, donation entre époux…), à ajouter par la suite, puis **ventes simples** et **notoriétés seules**. |
| Démarrage | **Phase 0 : le socle.** |
| Fiche de signature (0.326.0) | Publiée sur `main` après audit et vérification verte, **en journée**. |
| Ambition | CLAIRE collaboratrice à part entière, **chargée seule de dossiers à terme**. |

## 3. Principe : préparer, proposer, puis (plus tard) agir

Quatre niveaux d'autonomie, **réglables routine par routine, et même geste par geste** (étude, 24/10 : « prévoir les trois modes d'autonomie que l'on pourra ajuster en fonction des tâches ») — par exemple une même routine peut proposer ses emails (niveau 1) et noter seule dans le dossier (niveau 2) :

0. **Observer** : alerter (Teams, pastille). Existe déjà.
1. **Proposer** : un brouillon, un document ou une tâche arrive dans la **boîte de propositions** ; le collaborateur fait « Autoriser » / « Refuser » / « Ouvrir ». **Tout démarre ici.**
2. **Valider, puis CLAIRE agit** (étude 24/10 : « je valide le travail et je l'autorise à envoyer ») : le collaborateur relit le travail préparé et clique « Autoriser » ; **CLAIRE l'exécute elle-même**. Pour un geste vers l'extérieur (envoyer un email, écrire dans l'agenda) elle **envoie après « Autoriser », sans second clic sur « Envoyer »** — décision de l'étude geste par geste, **réservée à l'administrateur** et confirmée, comme le niveau 3 ; cela modifie la règle n° 4 de `CLAUDE.md` pour ce geste. Pour un geste interne (cocher une pièce reçue, noter dans le dossier, poser une tâche) elle le fait seule, signé « CLAIRE », avec « Annuler » possible.
3. **Agir seule vers l'extérieur, sans validation** (envoyer un email, écrire dans l'agenda) : **décision explicite de l'étude, routine par routine**, après une période probatoire. Cela modifie la règle n° 4 de `CLAUDE.md` (« aucun email au client ne part sans un clic sur Envoyer ») : tant que l'étude ne l'a pas décidé, rien ne part sans clic.

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
| R3 | **Appel de fonds préparé seule** | échéance de l'appel de fonds (10 jours avant le rendez-vous) | Courrier et décompte préremplis par les données du dossier (`prefillAppelFonds`), email en brouillon ; ce qui manque est listé dans la proposition (« à compléter »). Seulement quand **nous représentons l'acquéreur** : décompte établi par l'office d'après les pièces du NAS, ou repris du décompte du confrère trouvé sur le NAS (`reprendreDecompteConfrereNas`). | Non |
| R4 | **Veille de signature** | 48 h avant le rendez-vous | La fiche de signature (déjà construite) préparée, contrôlée ; alerte Teams « fiche prête, N conditions à lever ». | Non |
| R5 | **Autorisations de clôture ou de transfert** | 48 h avant le rendez-vous d'un **acte de notoriété** | Autorisations de déblocage / de transfert de fonds (modèles de l'office, mot pour mot) préparées d'après les fiches client d'Authentic, avec l'email d'envoi en brouillon. | Non |
| R6 | **Relance des pièces demandées** | 48 h après un email envoyé qui réclame une pièce | Lit les emails **envoyés** ; relève quelles pièces l'étude a demandées ; si 48 h après elle n'est pas trouvée dans le dossier du NAS, prépare l'email de relance. | Oui (lecture de l'email envoyé, masquée) |
| R7 | **Proposition de dates** | dossier complet (pièces, prêt, préemption) sans rendez-vous | Brouillon d'email de proposition de dates aux clients (et au confrère), avec les créneaux de `creneauxProposesSignature` (règles de l'étude : jamais à 9 h, ni entre 12 h et 14 h, ni après 18 h). | Rédaction seulement |
| R8 | **Veille juridique** | chaque semaine | Nouveautés Légifrance et BOFiP utiles à l'office. Aucune donnée de client. | Oui (aucun masquage nécessaire) |

**Constitution — historique** : clé `constitutions-faites` (dossier, courrier, date, empreinte des données). Une constitution déjà faite n'est **jamais refaite** ; si les données du courrier ont changé depuis (adresse, parcelles, défunt), CLAIRE propose une **mise à jour**, jamais un second courrier.

## 6. Garde-fous

- **Le bruit** (la plainte connue de l'étude) : une routine qui n'a rien de vérifié à dire ne dit rien ; une proposition par objet et par échéance ; expirée seule quand elle n'a plus lieu d'être.
- **RGPD** : l'étude a décidé d'allumer l'IA en ligne dès le départ. Plus de données partent donc chez le fournisseur, sans qu'on l'ait demandé sur le moment. L'accord de sous-traitance (DPA), la rétention zéro d'Anthropic et le registre des traitements **restent à faire par l'étude, en parallèle** (voir « Ce qui reste ouvert » de `CLAUDE.md`) ; le masquage actuel s'applique (limites connues : un prénom suivi d'un nom en casse mixte absent des fiches passe en clair dans le texte d'un document). Un interrupteur par routine permet de couper l'IA sans couper la routine.
- **Déontologie** : jamais d'email directement au client d'un confrère (les demandes passent par son office, règle déjà codée) ; rien de plus que ce que le collaborateur ferait.
- **Heures** : alertes Teams en heures de bureau seulement ; les routines de production peuvent tourner à 9 h 30 comme décidé.
- **Coût** : plafond mensuel, arrêt au plafond, coût visible.
- **Reprise sur panne** : le serveur redémarre à chaque mise à jour automatique ; une routine commencée est reprise, jamais dupliquée.
- **Preuves** : chaque routine a son test (cas inventés), son point de « vérifications sur le terrain », et le test « rien de nominatif ne part ».

## 7. Phasage proposé

- **Phase 0 — le socle (démarrage décidé le 24/10)** : identité « CLAIRE », planificateur, boîte de propositions (clé, routes, widget, pastille, bloc de la fiche), journal, Réglages › Routines avec les **trois niveaux d'autonomie réglables par routine**, plafond de 50 € par mois, résumé Teams de 9 h 30. Aucune routine encore ; une routine d'essai pour vérifier la chaîne. **Réalisée en 0.327.0** (voir `docs/historique.md`) à une exception près : le widget du tableau de bord n'est pas fait (la boîte est dans la barre latérale et en tête de la fiche).
- **Phase 1 — par le code seul** : R1 (blocages et relances, sans rédaction par l'IA) et R4 (veille de signature, Teams).
- **Phase 2 — le poste CLAIRE** : fenêtre sans écran, puis R2 (constitution), R3 (appel de fonds), R5 (autorisations de notoriété).
- **Phase 3 — l'IA** : agent « mode routine », plafond de jetons, puis R6 (relance des pièces), R7 (proposition de dates), rédaction des brouillons de R1, R8 (veille juridique).
- **Phase 4 — l'autonomie** : statistiques d'acceptation, propositions de passage au niveau 2 puis 3, et réflexion de l'étude sur des dossiers confiés à CLAIRE.

Chaque phase est un envoi à part, testé au bureau avant la suivante.

## 8. Hypothèses restantes

1. 9 h 30 est l'heure de la revue et des préparations ; les événements (création de dossier, rendez-vous relevé, email envoyé relevé) déclenchent leur routine dans la minute.
2. Pour une succession, la constitution part juste après la création du dossier, avec les neuf modèles actuels (la mutuelle décochée, comme aujourd'hui).
3. Le niveau de départ de chaque routine est le **niveau 1** ; passer une routine au niveau 2 ou 3 est une décision de l'étude, jamais d'office (la règle n° 4 de `CLAUDE.md` est modifiée routine par routine, à ce moment-là).
4. Les petits actes (PACS, donation entre époux…) confiés à CLAIRE à terme sont à définir avec l'étude un par un : pièces, étapes, courriers, ce que le notaire valide.

## 9. Points ouverts

- Le notaire référent le jour où CLAIRE est « responsable » d'un dossier (probablement Sophie GOSSART).
- La date de l'accord de sous-traitance avec Anthropic et le registre RGPD (hors du code).
- Les petits actes à ajouter en premier.
