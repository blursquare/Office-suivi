# Mesure : contour de la parcelle sur les clichés aériens de l'IGN (31/10/2026)

Demande de l'étude : « Quel est le pourcentage de réussite ? » — puis « choisis-les toi-même dans le Loir-et-Cher ».

## Méthode

- 6 sites publics, choisis pour un bâtiment qui n'a pas bougé depuis 1945 (repère visible à chaque décennie) :
  Blois (cathédrale), Vendôme (abbatiale de la Trinité), Romorantin (église Saint-Aignan — en fait une parcelle de lotissement,
  repère peu lisible avant 2000), Cour-Cheverny (église), Chaumont-sur-Tharonne (église, Sologne), Lavardin (château, relief).
- Parcelle sous le point (API Carto), clichés de la Géoplateforme (couche `pva:image`), un cliché par décennie — celui que CLAIRE
  retient (le bien le plus au centre) —, contour posé par la méthode de CLAIRE (coins de l'emprise, cadre noir écarté), recadré
  autour du bien, à côté de l'orthophoto actuelle.
- Jugement à l'œil, cas par cas : **juste** (le contour est sur le bâtiment, quelques mètres), **approché** (le bien est dans le cadre,
  à quelques dizaines de mètres, jusqu'à ~150 m : « Ajuster le contour »), **faux** (au-delà, ou autre lieu).
  Petit échantillon et jugement subjectif : ordre de grandeur, pas une statistique.

## Résultats (47 clichés, 43 jugés)

| Période | Juste | Approché | Faux |
|---|---|---|---|
| 2008 et 2018 (12) | 12 | 0 | 0 |
| Avant 2000 (31 jugés) | 7 (23 %) | 11 (35 %) | 13 (42 %) |
| Ensemble (43) | 19 (44 %) | 11 (26 %) | 13 (30 %) |

4 clichés anciens de Romorantin n'ont pas pu être jugés (repère construit après la photo).

## Causes trouvées

1. **Cadre du film** : les films anciens sont numérisés avec leur cadre noir, leurs repères et une bande de texte ou d'instruments ;
   l'emprise publiée ne couvre que la photo. Avant correction, la position glissait de 5 à 10 % de la photo (plusieurs centaines de
   mètres). Corrigé : `cadreDuCliche` (client/157) détecte le cadre sur la vue d'ensemble, retenu seulement s'il a la forme de l'emprise
   (39 cadres sur 47 retenus dans la mesure). Gain net sur plusieurs cas (Vendôme 1997 : faux → juste).
2. **Emprise approximative des missions anciennes** : avant 2000, l'emprise publiée vient du plan de vol, pas d'un recalage ; même
   cadre écarté, le contour reste souvent décalé, parfois de plusieurs centaines de mètres. Pas de correction automatique sans
   recalage d'image (comparaison avec une photo récente) : « Ajuster le contour » et l'avertissement « Position approximative » sur
   les clichés d'avant 2000.
3. **Photo non redressée** (relief, inclinaison) : quelques mètres à quelques dizaines de mètres, surtout loin du centre.

## Suites possibles

- Recalage automatique sur une photo récente (repérer routes et bâtiments communs) : chantier à part, résultat non garanti sur les
  années 1950 où le paysage a beaucoup changé.
- Retenir le décalage ajusté à la main pour une mission entière (toutes les photos d'un même vol sont décalées pareil).
