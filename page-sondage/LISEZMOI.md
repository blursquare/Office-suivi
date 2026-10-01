# Page de réponse aux sondages de créneaux

`index.html` (+ `logo-office.png`) est la page où les clients indiquent, pour chaque créneau de
signature proposé, **Oui**, **Si nécessaire** ou **Non** (à la manière de Rallly). Elle ne garde
**aucune donnée** : tout ce qu'elle affiche est dans le lien envoyé par CLAIRE, après le `#` (que le
navigateur n'envoie jamais au serveur). La réponse repart par email vers l'étude.

## Publication

Publiée dans le dépôt public **blursquare/Claire-rdv** (copie de `index.html`, `logo-office.png`,
plus `.nojekyll` et un `README.md`). Une seule fois : Settings › Pages › Source « Deploy from a
branch », branche `main`, dossier `/ (root)`. Adresse : `https://blursquare.github.io/Claire-rdv/`,
à coller dans CLAIRE : Réglages › Rappels et agenda › « Page de réponse aux sondages ».

Tant que ce réglage est vide, les emails du sondage gardent un bouton par créneau.
Toute modification de la page se fait ici, puis se recopie dans Claire-rdv.
