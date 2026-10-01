# CLAIRE pour Authentic (extension Firefox)

Un bouton dans la barre de Firefox : sur une page de dossier d'Authentic, **« Envoyer à CLAIRE »**
relève ce que la page affiche (champs et leur libellé, rubriques, tableaux, texte visible) et
l'envoie au serveur CLAIRE du bureau, puis ouvre CLAIRE sur la page reçue.

- Rien ne part ailleurs que vers l'adresse de CLAIRE réglée dans les options (réseau du bureau).
- Jamais un mot de passe ni un champ caché de la page.
- Le serveur garde la page **30 minutes en mémoire** seulement (ni base, ni journal).

## État (01/10/2026)

Première version : le transport fonctionne (Authentic → CLAIRE) et CLAIRE affiche la page reçue.
**La reprise dans une fiche n'est pas encore branchée** : il faut d'abord connaître la structure
des pages d'Authentic. Dans CLAIRE, « Copier la structure (sans données) » copie les libellés et le
type de chaque valeur (date, montant, texte…), jamais une valeur : la relire, puis la coller dans la
conversation avec Claude pour brancher la reprise.

## Installer

### Pour essayer (jusqu'à la fermeture de Firefox)

1. Ouvrir `about:debugging#/runtime/this-firefox` dans Firefox.
2. « Charger un module complémentaire temporaire… » → choisir `manifest.json` de ce dossier
   (ou le fichier `.zip` de l'extension).
3. Le bouton CLAIRE apparaît dans la barre (sinon : menu des extensions, épingler).

### Pour de bon

Firefox (version normale) n'installe durablement qu'une extension **signée par Mozilla**.
Signature privée, sans publication sur le catalogue :

1. Créer un compte sur addons.mozilla.org, puis une clé d'API (Outils › Gérer les clés d'API).
2. `npx web-ext sign --channel=unlisted --api-key=… --api-secret=…` dans ce dossier.
3. Installer le `.xpi` signé obtenu sur chaque poste (glisser le fichier dans Firefox).

Autre voie : une stratégie Firefox d'entreprise (`policies.json`, `ExtensionSettings`) peut
l'installer sur tous les postes.

## Régler

Au premier clic, la page d'options s'ouvre : saisir l'adresse de CLAIRE (celle de la fenêtre
CLAIRE, par exemple `http://192.168.60.10:3000`), « Enregistrer et tester ». Firefox demande
l'autorisation d'envoyer des données à cette machine : accepter.

Limite : si l'authentification par mot de passe est activée dans CLAIRE (`"authActive": true`),
l'envoi est refusé (non géré par l'extension).

## Fichiers

- `manifest.json` : déclaration (Manifest V2, Firefox 109 et plus).
- `fond.js` : le bouton — relève, envoi à `POST /api/authentic/capture`, ouverture de CLAIRE.
- `capture.js` : le relevé de la page, injecté au clic dans chacun de ses cadres.
- `options.html`, `options.js` : l'adresse de CLAIRE.
