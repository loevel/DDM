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

Les quatre tuiles « Choisir par texture », juste en dessous, ont le même
historique : trois montraient des visuels IA sans rapport avec la texture
annoncée — « Water Wave » affichait un à-plat de brosses.

| Fichier | Tuile | Source | Auteur | Licence |
|---|---|---|---|---|
| `textures/lisse.webp` | Lisse | [Pexels 18348405](https://www.pexels.com/photo/18348405/) | The Feligrapher | [Licence Pexels](https://www.pexels.com/license/) |
| `textures/body-wave.webp` | Body Wave | [Pexels 14472217](https://www.pexels.com/photo/14472217/) | El gringo photo | [Licence Pexels](https://www.pexels.com/license/) |
| `textures/boucle.webp` | Bouclé | [Pexels 8377218](https://www.pexels.com/photo/woman-touching-her-curly-hair-8377218/) | PNW Production | [Licence Pexels](https://www.pexels.com/license/) |
| `textures/water-wave.webp` | Water Wave | [Pexels 13664457](https://www.pexels.com/photo/13664457/) | Omotaiyewoo | [Licence Pexels](https://www.pexels.com/license/) |

Les six **produits de démonstration** (`app/lib/demo-products.ts`) affichés quand la
base ne renvoie aucun produit — une photo par produit, choisie pour correspondre à la
texture *et* à la couleur déclarées dans la fiche :

| Fichier | Produit | Texture / couleur | Source | Auteur |
|---|---|---|---|---|
| `produits/honey-glaze.webp` | Honey Glaze Wave | body-wave / naturel | [Pexels 38023947](https://www.pexels.com/photo/38023947/) | Thedollasyn |
| `produits/midnight-curl.webp` | Midnight Deep Curl | deep-wave / naturel | [Pexels 2331539](https://www.pexels.com/photo/2331539/) | Bestbe Models |
| `produits/silk-body.webp` | Silk Body Wave | body-wave / naturel | [Pexels 3597931](https://www.pexels.com/photo/3597931/) | Ogo Johnson |
| `produits/polished-straight.webp` | Polished Straight | lisse / naturel | [Pexels 36288157](https://www.pexels.com/photo/36288157/) | El gringo photo |
| `produits/obsidian-curls.webp` | Obsidian Curls | kinky-curly / naturel | [Pexels 2011414](https://www.pexels.com/photo/2011414/) | Bestbe Models |
| `produits/caramel-swirl.webp` | Caramel Swirl | body-wave / **ombré** | [Pexels 38979627](https://www.pexels.com/photo/38979627/) | Butch Carmichael |

Toutes en licence Pexels. Avant, six produits se partageaient quatre visuels IA — deux
paires en double — et aucun ne montrait la texture annoncée.

Autres visuels sourcés :

| Fichier | Source | Auteur | Licence |
|---|---|---|---|
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
### Les quatre tuiles de texture

Toutes recadrées en **3:4, 720×960, WebP q82** — la tuile s'affiche à ~330 px de
large, 720 couvre le retina 2× avec de la marge. Elles sont en `loading="lazy"`,
donc hors du chemin critique du premier affichage.

| Fichier | Poids | Cadrage |
|---|---|---|
| `textures/lisse.webp` | 25 Ko | ancré à 30 % de la hauteur, pour la chute complète des cheveux |
| `textures/body-wave.webp` | 79 Ko | ancré à 30 %, la cascade de vagues occupe toute la tuile |
| `textures/boucle.webp` | 73 Ko | inchangé — c'était déjà la bonne photo, simplement réencodée (165 Ko en JPEG) |
| `textures/water-wave.webp` | 84 Ko | ancré à 70 % et resserré ×1,25 : au cadrage large, la moitié haute n'était que du mur rose |

`lisse.webp` est bien plus légère à qualité égale : cheveux lisses sur fond uni,
peu de détail fin, là où les trois autres sont des matières ondulées ou bouclées.

### Les six visuels de produits de démonstration

Toutes en **3:4, 900×1200, WebP q82** — c'est le ratio de `ProductTile` comme de la
fiche produit, donc `object-cover` ne recadre rien. 438 Ko au total, mais ces images
ne sortent que si la base ne renvoie aucun produit : la production affiche ses vrais
produits et ne les charge jamais.

Deux cadrages ont demandé un resserrement (`zoom ×1,5`) : `polished-straight`, dont
la source laissait de larges bandes de fond blanc en haut et en bas, et `silk-body`,
cadrée trop loin du sujet.

### Fichiers supprimés

`site/cheveux-caramel.webp`, `site/perruque-brune-lisse.webp` et
`site/presentoirs-boutique.webp` — visuels IA d'origine, devenus orphelins une fois le
carrousel, les tuiles de texture et les produits de démonstration repris. Vérifié
qu'ils n'étaient plus référencés ni dans `app/`, ni dans le HTML servi en production.

`site/cheveux-ondules-blond.webp` **reste** : c'est encore le visuel de la carte
« Nouveautés » de l'accueil (`app/routes/_index.tsx`), le dernier rendu IA de la page.
- **`textures/entretien.jpg`** — recadré en 16:9 (1600×900), ancré en haut de la source
  portrait pour cadrer la chevelure et non l'épaule. Sert le bloc « Préserver votre
  investissement » de `/boutique` et le fond décoratif de `/accessoires` — il remplace
  une URL Google qui renvoyait le placeholder gris « image indisponible » tout en
  répondant 200.
