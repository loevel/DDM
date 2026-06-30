# 🚀 DDM Logo - Guide de Démarrage Rapide

## Qu'est-ce qui a été créé ?

✅ **4 fichiers SVG vectoriels** :
1. `ddm-logo.svg` - Version couleur principale (or & noir)
2. `ddm-logo-monochrome.svg` - Version noir et blanc
3. `ddm-logo-white.svg` - Version blanche (pour fonds sombres)
4. `ddm-icon.svg` - Icône simplifiée pour favicon

---

## 🎯 Utilisation Immédiate (Sans Conversion)

Les fichiers SVG sont **prêts à utiliser** directement dans votre HTML !

### 1️⃣ Ajouter le logo au header
```html
<header>
  <img src="/images/ddm-logo.svg" alt="DDM Wigs and More" width="200">
</header>
```

### 2️⃣ Favicon (tout navigateur moderne)
```html
<link rel="icon" href="/images/ddm-icon.svg" type="image/svg+xml">
```

### 3️⃣ Logo blanc pour dark mode
```html
<!-- Dans votre CSS ou composant -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/images/ddm-logo-white.svg">
  <img src="/images/ddm-logo.svg" alt="DDM Wigs and More" width="200">
</picture>
```

---

## 🔄 Conversion en PNG (Optionnel)

Si vous avez besoin de fichiers PNG (images raster), choisissez une méthode :

### ⚡ Option 1 : Online (Aucune installation requise)
1. Allez sur https://cloudconvert.com/svg-to-png
2. Uploadez `ddm-logo.svg`
3. Téléchargez en PNG (1200x1200px recommandé)
4. Sauvegardez dans `public/images/`

### 🖥️ Option 2 : Script Automatisé (Recommandé)

**Prérequis** : ImageMagick
```bash
# Installation (une seule fois)
brew install imagemagick

# Génération de tous les assets
cd /Users/loevel/Projets/Cherie/DDM
bash scripts/generate-logo-assets.sh
```

Cela créera automatiquement :
- ✅ PNGs colorés (400px, 250px, 150px)
- ✅ PNGs monochrome
- ✅ PNGs blancs
- ✅ Favicons (16x16, 32x32, 192x192, 512x512)
- ✅ Apple Touch Icon
- ✅ Open Graph image (1200x1200)
- ✅ favicon.ico (multi-résolution)

### 📱 Option 3 : Conversion Manuelle via Inkscape
1. Ouvrir `ddm-logo.svg` dans Inkscape
2. File → Export As
3. Sélectionner PNG et la résolution
4. Sauvegarder

---

## 📝 Intégration HTML Recommandée

Copier ce code dans votre `<head>` :

```html
<!-- Favicons -->
<link rel="icon" type="image/svg+xml" href="/images/ddm-icon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/images/favicons/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/images/favicons/favicon-16x16.png">
<link rel="apple-touch-icon" href="/images/favicons/apple-touch-icon.png">

<!-- Open Graph (Réseaux Sociaux) -->
<meta property="og:image" content="https://ddmwigs.com/images/ddm-logo.svg">
<meta property="og:image:type" content="image/svg+xml">
<meta property="og:image:width" content="400">
<meta property="og:image:height" content="400">
```

---

## 🎨 Utilisation par Contexte

### Header/Navigation
```html
<img src="/images/ddm-logo.svg" alt="DDM Wigs and More" width="180">
```

### Footer
```html
<img src="/images/ddm-logo.svg" alt="DDM Wigs and More" width="120">
```

### Dark Mode / Overlay
```html
<img src="/images/ddm-logo-white.svg" alt="DDM Wigs and More" width="180">
```

### Impression / PDF
```html
<img src="/images/ddm-logo-monochrome.svg" alt="DDM Wigs and More" width="200">
```

---

## 📊 Fichiers Disponibles

| Fichier | Type | Usage | Taille |
|---------|------|-------|--------|
| ddm-logo.svg | SVG | Logo principal | ~8KB |
| ddm-logo-monochrome.svg | SVG | B&W, impressions | ~7KB |
| ddm-logo-white.svg | SVG | Fonds sombres | ~8KB |
| ddm-icon.svg | SVG | Favicon, icônes | ~4KB |

---

## ✨ Avantages des Fichiers SVG

✅ **Scalable** - Affichage parfait à toute résolution  
✅ **Léger** - Plus petits que les PNGs  
✅ **Responsive** - Adaptatif sur tous les appareils  
✅ **Accessible** - Support du alt text  
✅ **Moderne** - Support 100% des navigateurs récents  
✅ **Modifiable** - Éditables avec n'importe quel éditeur de texte  

---

## 🔍 Points de Vérification

- [ ] Logo visible dans le header
- [ ] Favicon s'affiche dans l'onglet du navigateur
- [ ] Logo responsive (zoom sans pixelisation)
- [ ] Logo blanc visible sur fond sombre
- [ ] Alt text présent sur toutes les images
- [ ] Fichiers optimisés (moins de 10KB par fichier SVG)

---

## 📚 Documentation Complète

Pour plus de détails, voir : [`LOGO-GUIDE.md`](LOGO-GUIDE.md)

---

**Prêt à utiliser ! 🎉**  
Intégrez simplement les fichiers SVG dans votre HTML et c'est fini.
