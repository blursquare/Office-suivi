# Résumé de la documentation Authen.tic (wiki Fichorga)

Lu le 27/10/2026 par CLAIRE (session de Bastien ANGLUMENT) pour préparer un **navigateur sans fenêtre en lecture seule** sur Authentic :
rechercher un dossier, naviguer dans ses sous-dossiers, ses fiches clients et ses fiches biens, détecter les structures de pages,
compléter les fiches CLAIRE, et **préparer sans valider** des demandes Comedec, casier judiciaire (CJN) et réquisitions hors formalité (EHF).
Ce fichier n'est pas chargé automatiquement : à consulter (`grep`) quand un sujet touche Authentic.

## Source et limites

- Source : https://wiki-authentic.fichorga.fr/fr/home (Wiki.js de Fichorga, pages publiques ; l'API GraphQL de lecture est refusée aux
  anonymes — ne pas s'y obstiner). 504 pages lues : manuel utilisateur (146), formalités dématérialisées (25), outils annexes, notes de
  version (120), fiches juridiques (151).
- **Paraphrasé, pas recopié** : la documentation appartient à Fichorga. Chaque point cite sa page (`page : chemin`) ; le texte d'origine se
  relit sur le wiki.
- **Les captures d'écran ne sont pas dans le texte** : les boutons à icône n'ont pas de libellé, les colonnes de plusieurs écrans de
  suivi manquent. Les résumés les signalent « à vérifier ».
- **Deux versions coexistent** (ancienne « GDS » et « Silicium », la dernière notée 4.19.3) : plusieurs libellés diffèrent. **La page réelle
  du poste fait foi**, pas la documentation ; la copie « Copier la structure » d'une page se compare aux libellés ici.
- Les pages décrivent ce que le logiciel faisait en 2023 à 2026 sans dates de publication : une vérification sur la vraie page reste nécessaire.

## Contenu

| Fichier | Sujet |
|---|---|
| `01-gestion-des-dossiers.md` | création, champs, sous-dossiers, comparants, immeubles, archivage, courriels, appels |
| `02-accueil-recherche-fiches-repertoire.md` | page d'accueil, menus, **les quatre façons de rechercher**, fiches clients / immeubles / contacts, répertoire |
| `03-formalites-dematerialisees-comedec-cjn-requisitions.md` | Comedec, CJN, réquisitions (dont hors formalité), SAFER, BRI, AR24 ; **section 9 « Pour préparer sans valider »** |
| `04-formalites-posterieures-micen.md` | registre des formalités, inscriptions, dépôts, Micen ; **section 11 liste de blocage**, section 12 repères de lecture |
| `05-redaction-succession-parametrage.md` | rédaction, déclaration de succession, donation-partage, parapheur, paramétrage et droits |
| `06-outils-annexes.md` | Airmail, Acte externe, Bannette, DocSecure, FoxNot, YouSign, Authentic Scan, télétravail |
| `07-notes-de-version-1.md`, `08-notes-de-version-2.md` | changements d'interface et de formalités par version (3.3 à 3.13 puis Silicium 4.3.1 à 4.19.3) |
| `09-juridique-index.md` | index des 151 fiches juridiques (thèmes, une ligne par page) |

## À retenir pour le navigateur d'Authentic

- **Recherche** : menu « Dossiers » › « Rechercher » (bouton « Rechercher », « Réinitialiser », « Plus de critères » / « Recherche avancée ») ;
  recherche générale en haut à droite (Entrée ou loupe : dossiers, actes, immeubles, clients, contacts) ; « Clients » › recherche personne
  physique / morale ; « Immeubles » › « Rechercher ». Critère « Comparant » pour retrouver un dossier par une personne.
- **Ouvrir** : le stylo ouvre le dossier, l'œil affiche en lecture seule. Les « Derniers dossiers ouverts » de l'accueil ouvrent sans recherche.
- **Boutons à ne JAMAIS cliquer** (liste détaillée : fichiers 03 section 9, 04 section 11, 06) : « Nouveau dossier », exports, « Réinitialiser »,
  « Création rapide », « Envoi immédiat », « Prêt pour envoi », tout « Envoyer », « Signer », « Valider » (selon l'écran il enregistre
  **ou** déclenche le virement à la comptabilité), l'onglet « Virement » et le symbole « Euros », « Intégrer les données » (écrase des fiches
  clients), les corbeilles, « Mode expert », « Visualiser les données littérales » (sur certaines pages, enregistre et déclenche un flux).
  Consulter une réponse CJN la fait passer « clôturée » : l'effet ne se défait pas.
- **Dernière étape sûre d'une demande** : « Enregistrer » (Comedec, CJN) ; « Vérification du formulaire » puis l'enregistrement de la réquisition
  hors formalité — **à confirmer sur la vraie page** avant tout usage.
- Le CJN ne concerne que les acquéreurs **personnes physiques majeures** ; pour une société, ses représentants rattachés à sa fiche.

## Lacunes de la documentation (à demander à Fichorga ou à relever sur les vraies pages)

- Le tableau « Rédaction » (Non rédigé / En cours / Signé le), le dossier de succession et ses tableaux (Courrier, Demande, Etat civil, Banque,
  Mails-courriers à retour), les FCDDV ne sont pas décrits : ils restent à relever par « Copier la structure ».
- Les 8 statuts de sous-dossier sont listés mais pas ce qui les change (sauf « Signé »). Valeurs du menu « état du dépôt », colonnes des
  suivis (Comedec, CJN, réquisitions, Micen), libellés exacts de « Habilitation CJN » : absents.
- Les pages réelles de connexion, d'accueil (alertes et derniers dossiers) et de recherche de dossiers ont été copiées par l'étude le 27/10 :
  elles complètent ce résumé (formulaire de recherche : N° de dossier, libellés de dossier / sous-dossier / acte, situation, nature d'acte,
  références, N° du répertoire, comparant ; résultats en tableau de 10 lignes).
