# Visuels de texture

| Fichier | Source | Auteur | Licence |
|---|---|---|---|
| `boucle.jpg` | [Pexels 8377218](https://www.pexels.com/photo/woman-touching-her-curly-hair-8377218/) | PNW Production | [Licence Pexels](https://www.pexels.com/license/) — usage commercial autorisé, attribution non requise |
| `entretien.jpg` | [Pexels 5240709](https://www.pexels.com/photo/5240709/) | Karola G. (kaboompics.com) | [Licence Pexels](https://www.pexels.com/license/) — usage commercial autorisé, attribution non requise |

- `boucle.jpg` — recadré en 3:4 (900×1200) pour la tuile « Bouclé » de l'accueil.
- `entretien.jpg` — recadré en 16:9 (1600×900), ancré en haut de la source portrait pour
  cadrer la chevelure et non l'épaule. Sert le bloc « Préserver votre investissement »
  de `/boutique` et le fond décoratif de `/accessoires` — il remplace une URL Google qui
  renvoyait le placeholder gris « image indisponible » tout en répondant 200.

Ces fichiers sont servis en statique par Cloudflare Pages (`/images/*` est exclu
du worker dans `_routes.json`) : contrairement aux URLs `lh3.googleusercontent.com`
codées en dur ailleurs dans le site, ils n'expirent pas.
