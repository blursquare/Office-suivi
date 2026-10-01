# Page de réponse aux sondages de créneaux

`index.html` est la page où les clients cochent les créneaux de signature qui leur conviennent.
Elle ne garde **aucune donnée** : tout ce qu'elle affiche est dans le lien envoyé par CLAIRE, après
le `#` (que le navigateur n'envoie jamais au serveur). La réponse repart par email vers l'étude.

## Publier sur GitHub Pages (une seule fois)

1. Créer sur GitHub un dépôt **public**, par exemple `claire-rdv`, qui ne contiendra que ce fichier.
2. Y déposer `index.html` (copie de ce fichier, sans le renommer).
3. Dans le dépôt : Settings › Pages › Source « Deploy from a branch », branche `main`, dossier `/ (root)`.
4. Après une minute, la page est en ligne, par exemple `https://blursquare.github.io/claire-rdv/`.
5. Dans CLAIRE : Réglages › Rappels et agenda › « Page de réponse aux sondages » : coller cette adresse.

Tant que ce réglage est vide, les emails du sondage gardent un bouton par créneau.
Toute modification de la page se fait ici, puis se recopie dans le dépôt public.
