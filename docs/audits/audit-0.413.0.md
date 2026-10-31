# Audit 0.413.0 — Contrôle de l'urbanisme en étapes, premier écran « Quel dossier ? » des outils

Commit audité : `7aa72dd` (client/152-urbanisme-etapes.js, client/153-accueil-outils.js, client/22, client/46, client/61,
server/src/urbanisme.js, server/src/assistantAgent.js, index.html, style.css, tests). Audit en lecture seule, cadre de l'étude
du 13/10 (skill `publier`, étape 3 bis). Tests ciblés rejoués : `tests/urbanisme-etapes.test.js`, `server/test/urbanisme.test.js`,
`server/test/assistant-agent.test.js` — tous verts. Aucune donnée client dans ce rapport.

Note : la convention du skill est `docs/audits/AAAA-MM-JJ-<version>.md` ; ce fichier porte le nom demandé par l'agent principal.

## Verdict global

**Correct avec réserves.** Aucune faille de sécurité (tout texte rendu est échappé, identifiants passés par `escapeOnclickArg`,
enregistrement de l'agent derrière la carte « Autoriser », rien de nominatif dans le résultat de `controle_urbanisme`). Pas de point
« Haut ». Deux défauts fonctionnels « Moyen » à corriger avant l'envoi de préférence : l'écran « Quel dossier ? » recouvre un outil
déjà rempli dans plusieurs chemins (contredit le commentaire de client/153), et le DPU déduit du Géoportail passe devant la règle
d'Agglopolys par zone.

## Tableau priorisé

| # | Criticité | Fichier / ligne | Problème |
|---|-----------|-----------------|----------|
| 1 | Moyen | client/153-accueil-outils.js:94-103 (`majAccueilOutil`), client/22:202 | L'écran « Quel dossier ? » se pose par-dessus un outil déjà rempli sans dossier : « Modifier » d'un courrier d'appel de fonds sans dossier (client/43:279-281, `afDossierLie = null`), « Ouvrir le simulateur » / « Ouvrir l'outil Prorata » / Quotités sans dossier de « Demander à CLAIRE » (client/49:1013-1014, 1039, 1065), `outil_claire` mode ouvrir pour provision, prorata, forfait mobilier (client/67:62 — `definirOnglet` seul, aucun dossier rattaché) puis monté dans le panneau artefacts (client/99:338) : le panneau entier, accueil compris, est déplacé et l'utilisateur voit « Pour quel dossier ? » au lieu du résultat annoncé ; `outil_champs` remplit alors des champs masqués. |
| 2 | Moyen | client/46-droits-preemption.js:101-104 (`reponsesPreemption`) + client/45:64 (`perimetreDpu`) | `gpu.perimetre` (une information « préemption » qui touche UNE des parcelles, `info-surf` à l'intersection, filets de bordure compris) pose `dpuInstitue = 'oui'` pour toutes les parcelles ; `perimetreDpu` le lit AVANT la règle Agglopolys (U/AU oui, A/N non). Une parcelle d'Agglopolys en zone A ou N, vendue avec une parcelle en U (ou frôlant un périmètre), devient « DPU à purger » → pièce « Renonciation au droit de préemption » exigée, signature retenue. |
| 3 | Bas | client/152-urbanisme-etapes.js:121 | `URL.createObjectURL` jamais révoqué : chaque plan tiré (nouvelle tâche, nouveau dossier, « Changer de dossier ») garde son PDF en mémoire jusqu'au rechargement de la page. |
| 4 | Bas | client/77-vente-outils-fiche.js:140-151 | `prorataDossierTf` n'est jamais remis à '' : après une ouverture depuis une fiche, le Prorata ouvert depuis la barre latérale ne montre plus jamais l'accueil (et garde le dossier précédent comme « lié »). |
| 5 | Bas | client/152-urbanisme-etapes.js:293-295 | Action `ouvrir` de l'agent : `prEtat = copie` partage l'objet d'état de l'agent avec l'écran — ce que l'utilisateur change à l'écran modifie l'état gardé par l'agent pour ce dossier (et inversement au tour suivant). `enregistrer` réutilise un état lu plus tôt sans le relire. |
| 6 | Bas | client/152-urbanisme-etapes.js:45 | Libellé : `info-surf` ne rend que les informations qui touchent la parcelle ; « la commune n'a publié aucun périmètre » est trop fort (« aucun périmètre publié sur ces parcelles »). |
| 7 | Bas | server/src/urbanisme.js:121 | `renforce` = `/renforc/` : un libellé « DPU non renforcé » serait lu « renforcé ». Rare. |
| 8 | Bas | client/152-urbanisme-etapes.js:253 (motif de `dpurBlois`) | À Blois, le motif rendu à l'agent cite le nom de la rue du bien (liste fermée du périmètre, en minuscules). Admis par la politique « couplé à un nom » (adresse du bien en clair sans nom), mais le commentaire « sans nom ni adresse » de `resultatAgentUrbanisme` est inexact. |
| 9 | Bas | client/46-droits-preemption.js:420-424 | Code mort : rendu de `#pr-dossier-pill`, élément retiré d'index.html. |
| 10 | Bas | client/112-routines.js:240 | Proposition de routine `quotites` / `preemption` : `definirOnglet` sans dossier (comportement d'avant) — l'accueil s'affiche alors que la proposition porte un dossier. Pas une régression, mais facile : `ouvrirQuotitesDepuisFiche` / `ouvrirPreemptionDepuisFiche`. |

## Explication technique

1. **Accueil par-dessus un outil rempli.** `majAccueilOutil` décide sur `c.lie()` seul, appelé 0 ms après `definirOnglet`. Les
   chemins qui préparent l'outil SANS rattacher de dossier (simulation chiffrée par l'assistant, courrier repris de l'historique sans
   dossier, ouverture par l'agent pour provision/prorata/forfait mobilier) laissent `lie()` faux et `accueilOutilsSansDossier` vide :
   le travail est masqué (`display: none !important` sur tout sauf l'en-tête). Rien n'est perdu (« Continuer sans dossier » le
   rend), mais le geste annoncé ne se voit pas, et dans le panneau artefacts c'est le panneau déplacé tout entier qui porte l'accueil.
2. **DPU déduit qui écrase la règle par zone.** `analyserPreemptionParcelles` analyse chaque groupe de zone avec le MÊME `rep` ;
   `dpuInstitue` déduit d'une parcelle s'applique donc aux autres. Et `perimetreDpu` traite `dpuInstitue` comme une réponse de
   l'utilisateur, prioritaire sur la délibération Agglopolys. Le sens est « trop prudent », mais il ajoute une pièce bloquante et une
   DIA inutile. Hors Agglopolys, même effet sur une parcelle en A/N jointe à une parcelle en U couverte.
3. Blob : quelques centaines de Ko par plan ; négligeable sur une session courte, cumulatif sur une fenêtre ouverte toute la journée.
5. État partagé : un objet modifié des deux côtés rend l'analyse de l'agent non reproductible ; sans conséquence sur la fiche tant que
   l'enregistrement passe par la carte.

Points vérifiés sans défaut : échappement de tous les gabarits (152, 153, barre, tuiles, carte DPU, message de l'agent) ; `src` de
l'iframe en `escapeAttr` (URL `blob:` du même site, PDF du navigateur du serveur) ; `allerPagePreemption('${cle}')` sur des constantes ;
réponses de l'agent filtrées sur les clés et valeurs connues (`reponsesAgentUrbanisme`, testé) ; état de l'agent rangé par dossier ;
`enregistrer` derrière `demanderAutorisationAgent` (devient une validation de Bastien sur le poste de CLAIRE ; écriture par
`sauvegarder` → route des dossiers déjà permise) ; résultat de l'outil sans nom ni partie (test « rien de nominatif » côté serveur) ;
une réponse donnée `dpur: 'non'` n'est jamais écrasée (testé) ; aucune référence restante à `pr-dossier-recherche` /
`pr-dossier-resultats` ni à `majSommaireOutil('preemption')` ; `lie` posé de façon synchrone (avant le `setTimeout`) par
`preparerAppelFondsDepuisDossier`, `choisirDossierQuotites`, `ouvrirProvisionDepuisFiche`, `ouvrirProrataDepuisFiche`,
`ouvrirArbitrageDepuisFiche` ; CLAIRE flottante (client/146) n'ouvre pas ces outils.

## Plan de remédiation

1. Ne montrer l'accueil qu'à une arrivée « à vide » : retenir l'outil comme « sans dossier » dès qu'un chemin le prépare sans dossier.

```js
// client/153 — appelé par les chemins qui remplissent un outil sans dossier
function outilPrepareSansDossier(outil) { accueilOutilsSansDossier.add(outil); majAccueilOutil(outil); }
```

   À appeler dans `ouvrirProvisionSansDossier` quand des valeurs sont posées (client/49 `reponseProvisionAssistant`), dans l'`ouvrir`
   de `reponseProrataAssistant`, dans `gesteQuotitesAssistant` sans dossier, dans `modifierAppelFondsHistorique` quand
   `afDossierLie` est null, et dans `ouvrirOutilClaireAgent` (client/67) : avec `d`, appeler `ouvrirProvisionDepuisFiche`,
   `ouvrirProrataDepuisFiche`, `ouvrirArbitrageDepuisFiche` (comme appel de fonds et quotités) ; sans `d`, `outilPrepareSansDossier`.
   La barre latérale (`ouvrirProvisionSansDossier` sans saisie, `ouvrirArbitrageSansDossier`) garde l'accueil : y retirer l'outil de
   `accueilOutilsSansDossier` pour qu'un nouvel accès propose de nouveau le choix.

2. Ne déduire `dpuInstitue` que si TOUTES les parcelles lues portent l'information, et ne pas la laisser passer devant Agglopolys :

```js
// client/46 reponsesPreemption
const gpu = dpuGeoportailPreemption(lus);
const toutes = lus.length && lus.every(z => z.dpu && z.dpu.perimetre);
if (!r.dpur && gpu.renforce && lus.every(z => z.dpu && z.dpu.renforce)) r.dpur = 'oui';
if (!r.dpuInstitue && toutes && !r.agglopolys) r.dpuInstitue = 'oui';
```

   (ou mieux : porter l'information par parcelle dans `lignesZonageParcelles` et la passer à chaque groupe), avec un test
   « Agglopolys, une parcelle U avec DPU publié + une parcelle A → DPU non applicable sur la parcelle A ».

3. Révoquer l'ancien aperçu :

```js
if (st.apercu && st.apercu.url) URL.revokeObjectURL(st.apercu.url);
st.apercu = { tache: plan.id, url: '', etat: 'lecture' };
```

   et révoquer aussi dans `reinitialiserPreemption` / au changement de dossier.

4. `prorataDossierTf = ''` dans l'ouverture du Prorata depuis la barre latérale (ou au « Changer de dossier »).
5. `ouvrir` : `prEtat = Object.assign({}, copie, { reponses: Object.assign({}, copie.reponses) })` ; `enregistrer` : relire le zonage
   si l'état a plus de quelques minutes, ou le dire dans la carte.
6-10. Libellé « sur ces parcelles », `renforc` sans `non\s+renforc`, commentaire de `resultatAgentUrbanisme` corrigé, rendu du pill
   retiré, routines `quotites`/`preemption` ouvertes par leur fonction « depuis la fiche ».
