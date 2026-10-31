# Audit 0.409.0 — promesses de vente (PUV) dans « Actes à l'agenda »

Commit relu : `a54fa760` (« 0.409.0 »). Demande de l'étude (31/10) : « widget [Statistiques, actes à l'agenda] : détecter aussi le PUV (promesse de vente) ».

## Verdict

**Publiable.** Changement petit, pur, testé. Aucun point Haut. Un point Moyen à mesurer à l'œil (hauteur du widget), deux points Bas.

## Vérifié

- `natureActeAgenda` : PUV testé APRÈS DEE/DONATION et AVANT la référence de vente → « PUV VTE X / Y », « PUV - VENTE - X » = `puv` (plus compté comme vente : voulu, c'est une promesse) ; « VTE X / Y - PUV » = `vente` (PUV seulement en tête, comme PACS/DEE) ; « PUV SUCC X » = `puv`, « SUCC X PUV » = `succession`.
- Mot entier : « PUVX », « PUVÉ » → rien ; « PUV-X », « PUV:X », « puv x » → `puv` (casse ignorée ; pas de mot courant « puv »).
- `compterActesAgendaPeriode` : clé `puv` ajoutée au compte et à la table de correspondance (sans elle, `compte[undefined]++` aurait silencieusement rien compté).
- Consommateurs : seule la route `GET /api/agenda/actes-annee` (aucun cache des comptes : recalculés à chaque appel depuis le stock et les archives mensuelles, qui gardent les événements bruts) et le widget (`lignesActesAgenda`). Aucun outil de l'agent ni enum ne lit ces natures.
- Poste ancien / serveur récent : la clé `puv` est ignorée. Poste récent / serveur ancien : ligne « 0 / 0 » (`Number(undefined) || 0`). Même .exe, et les fenêtres se rechargent après redémarrage : sans effet réel.
- Rien de nominatif : aucune donnée nouvelle ne sort du serveur, aucune IA.
- Tests : `server/test/agenda-office.test.js` et `tests/statistiques-dossiers.test.js` verts.

## Points

| Gravité | Point | Explication | Remédiation |
|---|---|---|---|
| Moyen | Hauteur du widget « Statistiques » (grand × 1 rangée par défaut) | Le tableau passe à 6 lignes + en-tête ; `.w-corps` est en `overflow: hidden` et une rangée vaut 212 à 250 px. Estimation : ≈ 230 px de contenu → la ligne PUV peut être coupée sur un écran étroit (et en « moyen », où la section des actes est sous le duo). Non mesuré dans un navigateur. | Regarder le widget en grand × 1 et moyen ; au besoin, réduire le pas des lignes (`.st-actes th, td` padding) ou proposer 2 rangées. |
| Bas | « PUV - VTE X / Y » reste un rendez-vous de signature de la vente pour l'agenda | `extraireReferenceVte` trouve « VTE » au milieu du titre ; `estRendezVousSignature` ne regarde que « ? » : si l'étude écrit ses promesses ainsi, le rendez-vous de la promesse peut être posé comme signature sur la fiche de vente. Antérieur au commit, mais la statistique dit désormais « promesse » pendant que la fiche dit « signature ». | Demander à l'étude la forme réelle des titres de PUV ; si « PUV … VTE … » existe, écarter un titre commençant par PUV de la reconnaissance de signature. |
| Bas | Chiffres et `_` collés (« PUV2 », « PUV_X ») comptés | Le garde n'exclut que les lettres ; même comportement que PACS/DEE. | Aucun (cohérent). |
