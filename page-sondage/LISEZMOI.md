# Page de réponse aux sondages de créneaux

`index.html` (+ `logo-office.png`) est la page où les clients indiquent, pour chaque créneau de
signature proposé, **Oui**, **Si nécessaire** ou **Non** (à la manière de Rallly). Elle ne garde
**aucune donnée** : tout ce qu'elle affiche est dans le lien envoyé par CLAIRE, après le `#` (que le
navigateur n'envoie jamais au serveur). Chaque destinataire a son propre lien (code personnel) ; la
page n'affiche que son rôle (« vendeur »), jamais son nom.

## 1. Publier la page (une fois)

Dépôt public **blursquare/Claire-rdv** (copie de `index.html`, `logo-office.png`, `.nojekyll`,
`README.md`) : Settings › Pages › Source « Deploy from a branch », branche `main`, dossier `/ (root)`.
Adresse : `https://blursquare.github.io/Claire-rdv/`, à coller dans CLAIRE : Réglages › Rappels et
agenda › « Page de réponse aux sondages ».

## 2. Installer le relais Google (une fois) — pour que le client n'ait qu'un clic

Sans relais, « Envoyer ma réponse » ouvre la messagerie du client avec l'email prêt. Avec le relais,
la réponse part directement.

1. Se connecter au **compte Gmail de l'étude** (celui qu'utilise CLAIRE pour les rappels).
2. Ouvrir https://script.google.com › « Nouveau projet », le nommer « CLAIRE – relais rendez-vous ».
3. Remplacer tout le contenu par celui de `relais-google-apps-script.gs`, puis remplacer
   `DESTINATAIRE` par l'adresse de la boîte que CLAIRE relit (Réglages › Rappels et agenda, adresse de
   la connexion Exchange). Enregistrer.
4. « Déployer » › « Nouveau déploiement » › type « Application Web » ; Exécuter en tant que : **Moi** ;
   Qui a accès : **Tout le monde** ; « Déployer ». Autoriser l'accès au compte (si Google affiche
   « application non validée » : « Paramètres avancés » › « Accéder à … »).
5. Copier l'adresse de l'application Web (elle finit par `/exec`) et la coller dans CLAIRE : Réglages ›
   Rappels et agenda › « Relais des réponses (Google) ».

Le script n'écrit qu'à l'adresse fixée à l'étape 3, n'accepte que des réponses de la forme
`[CLAIRE-CODE-…-CLÉ]`, plafonne à 200 envois par heure et ne conserve rien. Un compte Gmail gratuit
peut envoyer environ 100 emails par jour par ce moyen. Si le relais ne répond pas, la page se rabat
d'elle-même sur la messagerie du client.

Toute modification de la page se fait ici, puis se recopie dans Claire-rdv.
