# Provenance des visuels sourcés

Photos libres de droits utilisées à la place de visuels générés par IA ou d'URL
externes périssables. Toutes sont servies en statique par Cloudflare Pages
(`/images/*` est exclu du worker dans `_routes.json`), donc elles n'expirent pas.

Les quatre visuels du carrousel d'accueil viennent de là : ils remplacent des
images générées par IA dont aucune ne montrait une femme portant une perruque.

| Fichier | Diapo | Source | Auteur | Licence |
|---|---|---|---|---|
| `site/elegance-afro.webp` | 1 — L'Élégance Redéfinie | [Pexels 4355347](https://www.pexels.com/photo/4355347/) | murat esibatir | [Licence Pexels](https://www.pexels.com/license/) |
| `site/hd-lace-lisse.webp` | 2 — Jusqu'à -30 % | [Pexels 12560398](https://www.pexels.com/photo/12560398/) | LATIFAH SHEÏL'A | [Licence Pexels](https://www.pexels.com/license/) |
| `site/boucle-volume.webp` | 3 — Bouclé naturel | [Pexels 31987393](https://www.pexels.com/photo/31987393/) | Ana Melo | [Licence Pexels](https://www.pexels.com/license/) |
| `site/glueless-sourire.webp` | 4 — Posée en 5 min | [Pexels 19763292](https://www.pexels.com/photo/19763292/) | kehinde solomon o ogunsanya | [Licence Pexels](https://www.pexels.com/license/) |

Autres visuels sourcés :

| Fichier | Source | Auteur | Licence |
|---|---|---|---|
| `textures/boucle.jpg` | [Pexels 8377218](https://www.pexels.com/photo/woman-touching-her-curly-hair-8377218/) | PNW Production | [Licence Pexels](https://www.pexels.com/license/) |
| `textures/entretien.jpg` | [Pexels 5240709](https://www.pexels.com/photo/5240709/) | Karola G. (kaboompics.com) | [Licence Pexels](https://www.pexels.com/license/) |

La licence Pexels autorise l'usage commercial et n'exige pas d'attribution ;
ce tableau existe pour qu'on sache d'où viennent les fichiers, pas par obligation.

## Retouches

### Les quatre visuels du carrousel

Toutes suivent le même traitement. Le héros fait `h-[90vh]`, soit **~1,97:1** sur un
écran 1080p, et les sources sont des portraits ou des cadrages serrés : aucune bande
pleine largeur n'y contient la tête entière. Chaque image est donc recadrée à droite
pour fixer la position du visage, puis **étendue à gauche** jusqu'au ratio du héros.

L'extension étire la colonne de bord plutôt que de remplir d'un aplat : les fonds
portent un dégradé vertical qu'un aplat trancherait visiblement au raccord.

À ratio et hauteur fixés, la largeur finale est imposée — la position relative du
visage ne dépend donc que de **sa distance au bord droit**. C'est le seul levier, et
c'est ce que règle le recadrage à droite.

Toutes sont sorties en **2048 px de large, WebP q84**. À q80 les mèches fines
s'empâtent ; à 2560 le poids double sans gain visible, et les quatre diapos se
chargent au premier affichage.

| Fichier | Sortie | Poids | `focus` |
|---|---|---|---|
| `site/elegance-afro.webp` | 2048×1040 | 65 Ko | `74% center` |
| `site/hd-lace-lisse.webp` | 2048×1040 | 42 Ko | `77% center` |
| `site/boucle-volume.webp` | 2048×1024 | 166 Ko | `74% center` |
| `site/glueless-sourire.webp` | 2048×1040 | 80 Ko | `74% center` |

`elegance-afro.webp` sert aussi d'`OG_IMAGE` : c'est l'aperçu de chaque partage du
site. Les deux sont volontairement liés — la diapo 1 est la vitrine du site.

`boucle-volume.webp` est plus lourde que les autres à qualité égale : la photo est
un plan rapproché de boucles, donc riche en détail fin sur toute la surface, là où
les trois autres ont de larges aplats de fond.
- **`textures/boucle.jpg`** — recadré en 3:4 (900×1200) pour la tuile « Bouclé » de l'accueil.
- **`textures/entretien.jpg`** — recadré en 16:9 (1600×900), ancré en haut de la source
  portrait pour cadrer la chevelure et non l'épaule. Sert le bloc « Préserver votre
  investissement » de `/boutique` et le fond décoratif de `/accessoires` — il remplace
  une URL Google qui renvoyait le placeholder gris « image indisponible » tout en
  répondant 200.
