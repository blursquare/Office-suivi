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

**Remplir seulement la page affichée** : même remplissage, sans ouvrir de démarche ni cliquer « Suivant ».

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

- Seul le serveur CLAIRE du bureau est interrogé (`/api/gnau/dossiers`, `/api/gnau/fiche/:id`, lecture seule), à l'adresse réglée.
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
