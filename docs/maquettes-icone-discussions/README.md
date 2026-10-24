# Icône « Discussions » — CLAIRE

Piste retenue : **8a**, le robot-mochi au trait. Deux retouches viennent de la dernière revue :

- **L'étoile** reprend exactement le ✦ du bouton CLAIRE à côté de la boîte de réception. C'est le `sparkle` de Lucide, mis à l'échelle et plein. Elle mord le coin en bas à droite et coupe le trait avec un écart d'environ 0,8 px.
- **La version app** est un carré blanc arrondi avec le symbole en anthracite `#1B1E23`, comme le logo CLAIRE. Elle n'a ni fond bordeaux ni dégradé.

## Fichiers

| Fichier | Usage |
| --- | --- |
| `discussions.svg` | Symbole seul, grille de 16 px, couleur `currentColor`. Il prend la couleur du texte : clair, sombre ou sur fond bordeaux. |
| `discussions-app.svg` | Tuile app 64 × 64, fond blanc avec `rx = 16`. |
| `DiscussionsIcon.tsx` | Composants React `DiscussionsIcon` (barre latérale, avatar) et `DiscussionsAppIcon`. |
| `preview.html` | Planche de contrôle : tailles de 16 à 48 px, tuile app, barres latérales sombre, claire et bordeaux, avatar 32 px. |

## Intégration

```tsx
import { DiscussionsIcon } from "./DiscussionsIcon";

<a className="nav-item"><DiscussionsIcon size={20} />Discussions</a>
```

- **Taille** : 20 px dans la barre latérale, comme les icônes Lucide voisines. Le trait est de 1,5 px sur la grille de 16.
- **Avatar dans le fil** : un disque de 32 px en `#1B1E23`, avec l'icône en 20 px et en blanc.
- **Masque** : chaque instance React reçoit un id de masque unique via `useId`. Si vous collez le SVG à la main plusieurs fois dans une même page, renommez `claire-discussions-cut` dans chaque copie. Sinon, toutes les copies utilisent le masque de la première.
- **Badge de mention** : il se place à droite du libellé, en bordeaux `#6D2332`.
