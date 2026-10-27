# CLAIRE — Assistant de saisie (extension Chrome) : CU et DIA sur les guichets uniques

L'extension remplit le **certificat d'urbanisme d'information (CUa)** et la **déclaration d'intention d'aliéner (DIA)** sur les
guichets uniques d'urbanisme (GNAU d'Operis : Agglopolys, Tours Métropole, Orléans Métropole, les `gnauNN.operis.fr`) à partir
d'un dossier de CLAIRE. Elle lit la fiche du dossier sur le serveur CLAIRE du bureau, saisit les champs de la page affichée avec un
curseur animé, puis **s'arrête** : vous relisez et vous validez vous-même. Elle ne clique jamais « Valider », « Envoyer »,
« Signer », « Transmettre »… (liste en dur), ne touche pas aux listes cachées du guichet et ne garde aucun identifiant.

## Installer (une fois par poste)

1. Copier le dossier `extension-chrome` sur le poste (par exemple `C:\CLAIRE\extension-chrome`).
2. Dans Chrome (ou Edge), ouvrir `chrome://extensions` (Edge : `edge://extensions`), activer **Mode développeur** (en haut à droite).
3. **Charger l'extension non empaquetée** → choisir le dossier `extension-chrome`.
4. Épingler l'icône de l'extension (pièce de puzzle → épingle à côté de « CLAIRE — Assistant de saisie »).

Chrome rappelle au démarrage qu'une extension en mode développeur est active : c'est normal. Pour une installation sans ce rappel :
publication « non répertoriée » sur le Chrome Web Store, ou stratégie d'entreprise.

## Régler (une fois)

1. Cliquer sur l'icône : le panneau CLAIRE s'ouvre à droite.
2. **Adresse de CLAIRE** : celle de la fenêtre CLAIRE (par exemple `http://192.168.60.10:3000`) → **Enregistrer et tester**.
   Chrome demande l'autorisation d'accéder à cette machine : accepter. « ● CLAIRE connecté » doit s'afficher.

## Utiliser, pour chaque demande

1. Dans CLAIRE, vérifier le dossier : **fiche du bien ouverte dans Authentic** (parcelles et surfaces), **fiche client de chaque
   vendeur** ouverte dans Authentic (naissance, domicile, profession), prix, honoraires et **à la charge de qui**.
2. Dans Chrome, se connecter au guichet unique de la commune (page d'accueil, ou un brouillon déjà commencé).
3. Dans le panneau : taper le nom du dossier, la commune ou la référence → cliquer le dossier ; choisir la **démarche** (CUa ou DIA).
   Ce qui manque dans CLAIRE s'affiche en orange (« À compléter… »).
4. **CLAIRE prend la main** : sur la page d'accueil, CLAIRE clique « Nouvelle demande / Déposer une demande », puis « Certificat
   d'urbanisme » › « d'information » ou « Déclaration d'intention d'aliéner » ; sur chaque page du formulaire elle remplit les champs
   qu'elle reconnaît (code CERFA, sinon libellé dans sa rubrique : « Nom » sous « Propriétaire »), **jamais par-dessus une valeur déjà
   là** (le demandeur pré-rempli reste), puis clique « Suivant ». Elle s'arrête quand il n'y a plus de « Suivant » — devant
   « Valider », « Déposer », « Transmettre », « Signer »…, qu'elle ne clique jamais. Échap ou « Reprendre la main » : pause.
5. Relire chaque page (bouton « Précédent » du guichet), cocher les cases du CERFA, compléter ce qui reste.
6. Les lignes **⧉ « à coller à la main »** et les champs « pas sur cette page » : bouton **Copier** → coller dans le guichet. La valeur
   est déjà au format du guichet (date `JJMMAAAA`, prix `209000`, prix en lettres, parcelles `¢EV¢10¢606¢`…).
7. Valider et transmettre **vous-même**.
8. Après la validation, la page du dossier déposé affiche son numéro (« DIA 041 018 26 00012 », « CUa 041 032 26 00007 ») : l'extension
   le relève **seul** et l'envoie à CLAIRE (extension 1.1.0, étude 27/10) — la fiche dit « DIA déposée sur le guichet le … (n° …) » et la
   réponse de la commune est attendue à 2 mois, comme pour une DIA envoyée depuis Authentic. Seulement le numéro, jamais le texte de la
   page, et seulement pendant 2 jours après une saisie faite par CLAIRE. Le numéro n'est relevé que sur la page qui dit le dépôt (« a bien
   été déposée », accusé, récépissé) et s'il est seul sur la page ; CLAIRE le range sous le dossier de la même commune, jamais en devinant.
   Mise à jour 1.1.0 : Chrome peut demander d'accepter le nouveau site (guichet de Chailles).

**Panneau en trois étapes** (17/10, logo et thème noir de CLAIRE, clair ou sombre selon Chrome ; pendant le remplissage, la liste des
étapes — commune, adresses, parcelles, signature, plan, Vérifier, Sauvegarder — montre où en est CLAIRE, comme le bandeau du guichet) : 1 Dossier, 2 Démarche (CU / DIA), 3 « Lancer CLAIRE » ; la vitesse et la copie de structure sont
sous « Options », le détail des champs est replié. « Remplir seulement la page affichée » est retiré.

### Guichet d'Agglopolys (https://demande-urbanisme.agglopolys.fr)

**Vrais clics** (0.10.0) : CLAIRE clique et tape comme une personne par le mode débogage de Chrome — Chrome affiche « CLAIRE a commencé à
déboguer ce navigateur » pendant le remplissage (normal, retiré à la fin). Le brouillon n'est jamais rechargé ni ouvert par son adresse :
CLAIRE revient à l'accueil puis rouvre la demande (sinon le guichet n'affiche que des {{TITLE}}).

Sur ce guichet, CLAIRE suit le parcours relevé par l'étude (16/10) :
1. accueil `#/` : bouton CUa ou DIA de la zone « Formuler » (bandeau « FORMULER », boutons ronds) — CLAIRE attend la fin de « Traitements en cours » (20 s au plus) avant de le chercher ;
2. fenêtre « Sélectionner une commune de dépôt » : la commune du bien (fiche CLAIRE) choisie dans la liste, puis « Valider la commune de
   dépôt » — commune absente ou ambiguë : CLAIRE s'arrête et vous la choisissez ;
3. « Récupérer les données non sauvegardées ? » ou fenêtre de déconnexion : toujours **NON** ;
4. **adresse du bien et parcelles par les assistants du guichet** (vidéo de l'étude, 17/10) : un clic sur l'adresse du terrain ouvre
   l'« Assistant de saisie d'adresse » — CLAIRE tape l'adresse de la fiche, choisit la proposition qui porte le même numéro, la même voie et le
   même code postal (une seule, jamais « la première »), puis « Je valide mon adresse » ; aucune proposition conforme ou plusieurs : l'assistant
   est refermé et l'adresse vous est laissée. Un clic sur les parcelles ouvre l'« Assistant de saisie des références cadastrales » — chaque
   parcelle de la fiche (préfixe, section, numéro, superficie) puis « Ajouter la parcelle », jamais deux fois la même, puis « Valider » (au-delà
   de 3 parcelles en CUa, le guichet les met lui-même en annexe). Une parcelle sans superficie connue n'est pas ajoutée : elle est nommée dans
   le panneau. Adresse ou parcelles déjà saisies dans le guichet : laissées telles quelles. **Jamais tapées directement dans les cases** (étude 17/10) :
   si l'assistant ne s'ouvre pas, les cases restent vides et le panneau dit « à saisir par l'assistant du guichet ». CU et DIA ;
5. brouillon `#/saisie/<n°>` (CUa 7 pages, DIA 10) : chaque champ par son code CERFA (`#AI1NP1`, `#T2L_localite`…), valeur posée d'un
   coup (le guichet applique lui-même majuscules et masques), puis « page suivante » (`vm.nextPage()`) ;
6. dernière page : CLAIRE clique **« Vérifier ma saisie »** puis **« Sauvegarder »** (ordre demandé par l'étude) (le contrôle du guichet, qui ne transmet rien) et s'arrête. Corriger ce que le
   guichet signale, relire, joindre les autres pièces, puis « Transmettre ma demande » **vous-même**.

**Commune de dépôt** : la liste est dépliée à l'écran et parcourue jusqu'à la commune du dossier (attendue jusqu'à 15 s le temps que le
guichet la remplisse) ; un seul clic sur la démarche — valider la commune crée la demande, un second clic créerait un brouillon vide.

**Toutes les adresses par l'assistant** (relevé de l'étude, 17/10 : chaque champ d'adresse ouvre l'assistant dès qu'il a le curseur) :
bien (T2 / BI1), propriétaire (AI3), acquéreur (GI4AA…), office (HI2). Un champ relié à l'assistant n'est jamais tapé directement.

**Signature** : « P/O Prénom NOM » du collaborateur chargé du dossier (E1S, GI7S) ; sans responsable sur la fiche, laissée vide.

**CU** : le demandeur « personne physique » n'est jamais rempli — le guichet pré-remplit l'office en personne morale (étude 17/10).

**DIA** (champs relevés sur une DIA remplie par l'étude, 17/10) : cases « déclaration d'intention d'aliéner » (PI1A), « droit de préemption
urbain » (PI1AA1, cochée d'office), « pleine propriété » (CI2NA1), « usage d'habitation » (DI1UA1 : maison,
ou copropriété dont un lot est un logement), « prix comptant » (FI2MA1) et « vente non indissociable » (FI1VA2) — ces trois-là par défaut pour une vente, à vérifier —, « plan cadastral joint » (BI3IA1, le plan lui-même joint à la fin comme pour le CU), « bâtiment vendu en totalité » (CI4BA1, maison),
« locaux dans un bâtiment en copropriété » (CI6CA1) et les lots ;
profession en catégorie de l'INSEE (AI1MP, GI2PA3 : seulement quand la profession de la fiche client la dit sans ambiguïté) ;
téléphone et email du propriétaire (AI3T, AI3EM1/AI3EM2) et email de l'acquéreur (GI4AM1/GI4AM2) d'après leur fiche client d'Authentic ;
email, adresse et téléphone de l'office pour le mandataire (HI1EM1/HI1EM2, HI2N, HI2V, HI2C, HI2L, HI2T). Occupation du bien, droits réels,
vente amiable/adjudication et modalités autres que le comptant : à remplir vous-même (pas encore sur la fiche).

Jamais : « Transmettre ma demande » (texte ou `transmettreSaisie`), un identifiant (fenêtre « Me connecter à mon compte » = arrêt, vous vous
reconnectez puis relancez : le brouillon est rouvert par son adresse), les listes recalculées par le site (`OPLSTPARCELLE`, `OPLSTCOPRO`,
`COMMISSION`), le prix en lettres `FI1C` (écrit par le site depuis `FI1B`), les cases de déclaration `GI5AA1`, `GI6AA1` (la case `GI1DA1`, « 1) A (ont) recherché un acquéreur disposé… », est toujours cochée — étude 17/10). Cases
cochées par un vrai clic seulement quand la fiche le dit : nature du bien (non bâti / bâti sur terrain propre, d'après le type de vente),
copropriété, commission TTC et à la charge de qui.

**Parcelles** : toutes celles de la fiche, chacune avec sa superficie (fiche bien d'Authentic : « 606 », « 1 206 », « 00ha 06a 06ca »…).
Les lignes du formulaire sont lues dans le modèle du guichet (page puis ordre de saisie) : CUa 3 lignes, DIA 14 (A1, B5, B6 en page 2,
puis A2…B3 en page 8). Au-delà, la ligne dit « annexe à saisir » et « Toutes les parcelles » se copie au format de l'annexe.

**Plan cadastral** : sur la page des pièces, le champ dont la ligne parle du plan (« plan cadastral », « plan de situation », CU1) reçoit
le plan trouvé dans le dossier du NAS (plan de situation tiré par CLAIRE d'abord, sinon « plan cadastral » / « extrait cadastral » — jamais un
courrier ni une matrice), sous le nom « Plan cadastral.pdf ». Dossier non relié au NAS ou aucun plan : à joindre vous-même. Les autres
pièces restent à joindre à la main. À vérifier sur un vrai brouillon : suffixes des parcelles 2 et 3 du CUa, codes des lignes
de parcelles de la DIA (`BI3S` + `A1`, `B5`…), annexes au-delà de 3 (CUa) et 14 parcelles (DIA).

## Faire progresser l'extension

Les champs sont trouvés par leur code CERFA quand il est connu (vendeur `AI1NP1`/`AI1PP1`, 2ᵉ propriétaire `AI1NP2`/`AI1PP2`, superficie
`D5T`, signature `E1L`/`E1D`/`E1S`, terrain du CUa `T2Q`/`T2V`/`T2L`/`T2C`), sinon par leur libellé et leur rubrique — à éprouver sur le
vrai guichet, qui n'a pas encore été vu. Si un champ n'est pas trouvé ou si une étape ne se clique pas, sur la page concernée :
**Copier la structure de la page (sans données)** (lien sous le bouton) et coller le résultat dans la conversation avec Claude : il
contient les noms, identifiants, libellés et options des champs, **jamais une valeur saisie**. Les scénarios
(`scenarios/cua-gnau.json`, `scenarios/dia-gnau.json`) reçoivent alors les vrais emplacements.

À confirmer sur un brouillon (relevé de l'étude, HANDOFF §10) : ordre du préfixe cadastral en DIA, séparateur entre parcelles en DIA,
surface entière (`98` ou `98,00`), liste exacte des professions, format de la quote-part, ordre des champs de la commission.

## Données

- Seul le serveur CLAIRE du bureau est interrogé (`/api/gnau/dossiers`, `/api/gnau/fiche/:id`, lecture seule ; `/api/gnau/depot`, le
  numéro du dépôt après validation), à l'adresse réglée.
- La fiche ne quitte le bureau que dans le guichet de la commune, saisie dans votre session.
- Rien n'est gardé par l'extension en dehors de l'adresse de CLAIRE (et du suivi de la saisie en cours, effacé à la fermeture de Chrome).
- Si l'authentification par mot de passe est activée dans CLAIRE (`"authActive": true`), l'extension n'est pas acceptée.

## Fichiers

```
manifest.json         MV3 : panneau latéral, guichets GNAU autorisés, CLAIRE sur autorisation
background.js         Suivi de la saisie (chrome.storage.session), relevé de la structure d'une page
content/content.js    Saisie dans la page : curseur, frappe, cases, liste noire des boutons, ancien CERFA refusé
lib/fiche.js          Formats du guichet (dates, prix en lettres, parcelles, lots, commission)
panel/                Panneau : adresse de CLAIRE, dossier, démarche, suivi champ par champ, Copier
scenarios/            CUa et DIA (champs et codes CERFA)
```
