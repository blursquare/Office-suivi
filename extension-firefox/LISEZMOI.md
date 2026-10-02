# CLAIRE pour Authentic (extension Firefox)

Un bouton dans la barre de Firefox : sur une page de dossier d'Authentic, **« Envoyer à CLAIRE »**
relève ce que la page affiche (champs et leur libellé, rubriques, tableaux, texte visible) et
l'envoie au serveur CLAIRE du bureau, puis ouvre CLAIRE sur la page reçue.

- Rien ne part ailleurs que vers l'adresse de CLAIRE réglée dans les options (réseau du bureau).
- Jamais un mot de passe ni un champ caché de la page.
- Le serveur garde la page **30 minutes en mémoire** seulement (ni base, ni journal).

## État (02/10/2026) — version 0.3.4

- **Relevé automatique** (étude, 02/10) : sur Authentic (`www.cloud-fichorga.fr`), chaque page affichée est
  relevée dès qu'elle est stable (2,5 s) et envoyée à CLAIRE — seulement si son contenu a changé.
  Désactivable dans les options (« Relever automatiquement les pages d'Authentic »).
  - **Page de gestion du dossier** : CLAIRE retrouve le dossier par l'intitulé « Vente VENDEUR/ACQUÉREUR »
    (ou « Succession NOM » depuis la 0.3.4)
    et coche les pièces reçues (« dans Authentic », décochables) ; un acte d'état civil ou une réponse SAFER
    de non-préemption est ajouté aux pièces du dossier. Une demande, un envoi ou une pièce « en attente »
    n'est jamais compté.
  - **Fiches client et fiches bien** : gardées une heure ; dans CLAIRE, « Nouveau dossier » › « Depuis
    Authentic » crée le dossier pré-rempli (parties, bien, cadastre, téléphones, emails, pièces présentes).
- **Bouton** : « Envoyer à CLAIRE » ouvre CLAIRE sur la page relevée et permet d'en copier la structure
  sans données (vocabulaire seul), pour régler la lecture d'une nouvelle page.

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

Firefox 128 au moins (postes du bureau en Firefox 128, étude 02/10 — 0.3.1 exigeait 140 et refusait de
s'installer). La déclaration de données `data_collection_permissions` exigée par Mozilla n'est comprise qu'à
partir de Firefox 140 : avant, elle est simplement ignorée. La validation de Mozilla le signale par deux
avertissements sur la version minimale, **qui ne bloquent pas la signature**.

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
- `releve.js` : le relevé de la page (`window.__claireRelever`), commun au bouton et au relevé automatique.
- `capture.js` : appelle le relevé au clic sur le bouton (injecté après `releve.js`).
- `auto.js` : relevé automatique sur Authentic (observe la page, envoie quand elle a changé).
- `options.html`, `options.js` : l'adresse de CLAIRE.
