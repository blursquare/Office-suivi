# Audit 0.408.0 — Fenêtre CLAIRE rattachée au dossier de l'outil, « @ » collègues et dossiers (31/10/2026)

Périmètre : `git show HEAD` (commit 0.408.0) — `client/146-claire-flottante.js` (`dossierEcranClaireFlottante`, `dossierLieClaireFlottante`,
`collegueCitesClaireFlottante`, menu « @ » `majMentionClaireFlottante` / `choisirMentionClaireFlottante` / `toucheClaireFlottante`, nouvelle voie
« message à un collègue » dans `envoyerDepuisClaireFlottante`), `style.css` (`.cf-saisie` en `position: relative`), `tests/assistant-conversations.test.js`.
Code voisin relu : client/49-assistant.js (mentions, `envoyerDemandeAssistant`, `mentionsChoisiesAssistant`), client/145 (sujets), client/115
(`mentionsPourCanal`), client/66 (`idCanalPriveEntre`), server/src/routes/canaux.js (POST messages), server/src/canaux/notifier.js.

## Verdict global

**Prêt pour la production avec réserves** : aucun point Haut ; un point Moyen (plusieurs collègues cités sans dossier rattaché : seul le premier reçoit
un message lisible) à corriger ou à assumer ; points Bas de cohérence.

Vérifié : `node --test tests/assistant-conversations.test.js` → 8/8 ; `node --test tests/structure-client.test.js` → 13/13 ; ESLint sur
`client/146-claire-flottante.js` → 0 erreur, 0 avertissement. Non joué dans un vrai Chromium (menu, en-tête, envoi réel au canal).

## Tableau priorisé

| Priorité | Fichier / ligne | Problème |
|---|---|---|
| Moyen | client/146-claire-flottante.js:115 | Sans dossier rattaché, « @julie @jérémy … » part dans `p:` entre l'utilisateur et le PREMIER cité seulement ; le serveur met quand même Jérémy dans `mentions` (canaux.js:177) et `notifierMentions` le prévient avec un extrait de 100 caractères d'un canal privé qu'il ne peut pas ouvrir (`canalDe` → 404 pour un non-membre). Le toast annonce « Message envoyé à Julie, Jérémy … en message privé ». |
| Bas | client/146-claire-flottante.js:219-223 | `dossierLieClaireFlottante()` sans texte (en-tête, signature) rend le dossier pris par « @ » même si son nom a été effacé de la saisie ; à l'envoi (avec texte) il est ignoré → l'en-tête annonce un dossier, la demande est rattachée à un autre (celui de l'outil). Le choix survit aussi à un changement d'écran tant qu'on n'a pas envoyé. |
| Bas | client/146-claire-flottante.js:223 | Le dossier de l'outil passe AVANT une fiche ouverte « à côté » (avant 0.408.0, la fiche à côté rattachait) : outil sur A, fiche B ouverte à côté → demande rattachée à A. Choix défendable, à dire à l'étude ou à inverser. |
| Bas | client/146-claire-flottante.js:203-217 + client/67-assistant-outils.js:62, client/49-assistant.js:1023 | `provisionDossierId` n'est remis à '' que par la barre latérale (`ouvrirProvisionSansDossier`) : le simulateur ouvert par l'agent (`outil_claire` sans dossier) ou par « Ouvrir le simulateur » garde le dossier d'avant, qui rattache alors la fenêtre. Visible dans l'en-tête, donc peu trompeur. |
| Bas | client/146-claire-flottante.js:106 | `occupeAssistant()` est testé avant la voie « collègue » : pendant que CLAIRE répond, on ne peut pas écrire à un collègue (rien ne part, sans message). |
| Bas | client/146-claire-flottante.js:241 | Dans une discussion reprise (`canalPourClaireFlottante()` non vide), le menu propose aussi les dossiers ; le choix est ignoré (pas de `mentionsChoisiesAssistant`, `dossierChoisi` remis à null) alors que la page Discussions ne les propose pas dans un canal de dossier (client/115:367). |
| Bas | client/146-claire-flottante.js:36 | Accessibilité : la zone de saisie n'a ni `aria-expanded`, ni `aria-controls`, ni `aria-activedescendant` ; les lignes du menu ont `aria-selected` mais pas d'identifiant. Même limite que la page Discussions ; clavier OK (flèches, Entrée/Tab, Échap). |
| Bas | tests/assistant-conversations.test.js:102-109 | Seul `collegueCitesClaireFlottante` est testé ; ni l'ordre de `dossierLieClaireFlottante` (choix @ > fiche en page > outil > fiche), ni l'aiguillage CLAIRE / collègue / canal. Prorata et Inventaire ne rattachent pas (aucune variable de dossier lue), à dire si l'étude s'y attend. |

## Explication technique

**Sécurité**
- Aiguillage CLAIRE ↔ collègue vérifié sur les cas demandés : `julie@exemple.fr` (lettre avant « @ ») et `@julien` (lettre après le prénom) ne
  citent personne ; « @CLAIRE » présent → toujours l'agent ; un dossier choisi par « @ » est inséré SANS « @ » (son nom seul), donc un dossier
  « JULIEN… » ne déclenche jamais l'envoi à Julie. Inversement, « @Julie » sans « @CLAIRE » ne va plus à l'agent (plus de carte `demander_collaborateur`) :
  c'est la demande de l'étude, mais à dire — avec un dossier rattaché, le message part dans le canal PARTAGÉ du dossier (lisible par toute l'étude),
  pas en privé ; le toast le dit.
- Canal ciblé : `d:<id>` n'est formé qu'avec un id présent dans `dossiers` (`dossierEcranClaireFlottante` filtre par `dossiers.some`) et le serveur
  refuse un dossier inexistant (`canalDe`, canaux.js:54) ; `p:` est formé par `idCanalPriveEntre` (lettres seules), refusé à un non-membre par
  `X.accessible`. Auteur = `utilisateurPoste`, `claire: false`, `html: ''` : rien d'injecté côté serveur. Pas de message vers un canal inattendu.
- Échappement : lignes du menu par `escapeHtml` (libellé, note) ; toasts posés en `textContent` (client/18:1112) ; indices du menu numériques dans
  `onmousedown`. Aucune XSS relevée.
- IA : rien de nominatif nouveau. Le dossier de l'outil devient `assistantContexte.dossierId` (même voie, même masquage que la fiche ouverte) ;
  `mentionsChoisiesAssistant` reste sur le poste ; la précision d'écran est inchangée. La voie « collègue » n'appelle aucune IA.
- Moyen (plusieurs collègues) : un non-membre d'un `p:` est prévenu avec un extrait du message. L'auteur l'a lui-même cité, ce n'est donc pas une fuite
  vers un tiers, mais le collègue ne peut ni lire ni répondre, et l'utilisateur croit le message remis.

**Qualité et architecture**
- Réutilise `mentionsPourCanal`, `dossiersMentionAssistant`, `idCanalPriveEntre`, `mentionsChoisiesAssistant`, `nouveauSujetAssistant` : rien de dupliqué
  hors du menu (la logique de `majMentionCanal` est recopiée, ≈ 10 lignes).
- Sujet de conversation : `dossierChoisi` est remis à null sur les deux voies après envoi ; en erreur d'envoi au collègue, il est gardé avec le texte
  (voulu). Avec `texteForce`, `envoyerDemandeAssistant` ne rouvre pas de sujet ; 146 le fait avant, puis `impose` = même id → pas de double sujet.
- Outils remis à zéro : `afDossierLie` (40:1435, 2939), `qtDossierLie` (38:528), `prEtat` (46:180), `cstEtat` (72:1218), `autEtat.dossierId` (108:358),
  `dvEtat` (148:271) sont bien remis à vide par « Effacer » ; seul `provisionDossierId` reste (voir tableau).
- Course : l'id rattaché est lu au moment de l'envoi ; un changement d'outil pendant la réponse ne touche pas la demande en cours.

**Performance**
- `dossierLieClaireFlottante()` est appelé à chaque tour de `majClaireFlottante` (1 s) : un `dossiers.some` — négligeable.

**Conformité / RGPD**
- Aucune donnée nouvelle vers un service extérieur ; le message au collègue reste sur le serveur du bureau (Teams/messages de CLAIRE comme toute mention).

## Remédiation

1. (Moyen) Sans dossier rattaché : former le canal privé de TOUS les cités (`p:` à 3 prénoms, déjà accepté par le serveur) quand il y en a deux,
   refuser au-delà (« écrivez dans le canal du dossier ») ; ou envoyer un message privé par collègue. Toast d'après ce qui est réellement parti.
2. (Bas) `dossierLieClaireFlottante()` : ne rendre `dossierChoisi` que si son nom est encore dans `#cf-texte` (lire le champ quand `texte` est absent),
   et l'oublier au changement d'écran.
3. (Bas) Remettre `provisionDossierId = ''` dans `definirOnglet('calculateur')` hors `ouvrirProvisionDepuisFiche`, ou lire le dossier depuis l'agent.
4. (Bas) Laisser passer la voie « collègue » pendant une réponse de CLAIRE (tester `occupeAssistant()` après l'aiguillage).
5. (Bas) `avecDossiers = !canalPourClaireFlottante()` dans `majMentionClaireFlottante`.
6. (Bas) Attributs ARIA du combobox ; test de `dossierLieClaireFlottante` et de l'aiguillage.
