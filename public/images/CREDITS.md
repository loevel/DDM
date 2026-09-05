# Provenance des visuels sourcés

Photos libres de droits utilisées à la place de visuels générés par IA ou d'URL
externes périssables. Toutes sont servies en statique par Cloudflare Pages
(`/images/*` est exclu du worker dans `_routes.json`), donc elles n'expirent pas.

| Fichier | Source | Auteur | Licence |
|---|---|---|---|
| `site/boucle-volume.webp` | [Pexels 31987393](https://www.pexels.com/photo/31987393/) | Ana Melo | [Licence Pexels](https://www.pexels.com/license/) — usage commercial autorisé, attribution non requise |
| `textures/boucle.jpg` | [Pexels 8377218](https://www.pexels.com/photo/woman-touching-her-curly-hair-8377218/) | PNW Production | [Licence Pexels](https://www.pexels.com/license/) — usage commercial autorisé, attribution non requise |
| `textures/entretien.jpg` | [Pexels 5240709](https://www.pexels.com/photo/5240709/) | Karola G. (kaboompics.com) | [Licence Pexels](https://www.pexels.com/license/) — usage commercial autorisé, attribution non requise |

## Retouches

- **`site/boucle-volume.webp`** — diapositive 3 du carrousel d'accueil (« Bouclé
  naturel, Volume maximal »). Source 4000×6000 recadrée sur la tête et les épaules,
  puis **étendue à gauche** pour atteindre un 2:1 : le héros fait ~1,97:1 et aucune
  bande pleine largeur de la source portrait ne contenait la tête entière. L'extension
  étire la colonne de bord, qui porte le dégradé vertical du mur de studio, plutôt
  qu'un aplat qui aurait tranché au raccord. Sortie 2048×1024, WebP q84.
  Le sujet est composé à 74 % de la largeur, d'où le `focus: "74% center"` dans
  `SLIDES` (`app/routes/_index.tsx`) — sans lui, `object-cover` centre l'image et
  le visage sort du champ sur mobile.
- **`textures/boucle.jpg`** — recadré en 3:4 (900×1200) pour la tuile « Bouclé » de l'accueil.
- **`textures/entretien.jpg`** — recadré en 16:9 (1600×900), ancré en haut de la source
  portrait pour cadrer la chevelure et non l'épaule. Sert le bloc « Préserver votre
  investissement » de `/boutique` et le fond décoratif de `/accessoires` — il remplace
  une URL Google qui renvoyait le placeholder gris « image indisponible » tout en
  répondant 200.
