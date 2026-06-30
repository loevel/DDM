# DDM Wigs and More - Logo Guide

## 📋 Fichiers de Logo Disponibles

### 1. **ddm-logo.svg** (Version Principale - Couleur Or)
- Utilisation : Logo principal pour le site web, en-têtes, footer
- Couleurs : Or (#D4AF37) et noir (#1a1a1a)
- Format : SVG vectoriel (scalable à n'importe quelle taille)
- Idéal pour : Fonds blancs/clairs
- Responsive : ✅ Oui

### 2. **ddm-logo-monochrome.svg** (Version Noir et Blanc)
- Utilisation : Documents, PDFs, impressions, noir et blanc
- Couleurs : Noir (#1a1a1a) uniquement
- Format : SVG vectoriel
- Idéal pour : Tous les fonds sauf très sombres
- Responsive : ✅ Oui

### 3. **ddm-logo-white.svg** (Version Blanche)
- Utilisation : Fonds sombres, headers noirs, overlays
- Couleurs : Blanc (#FFFFFF)
- Format : SVG vectoriel
- Idéal pour : Fonds noirs, gris foncé, images
- Responsive : ✅ Oui

### 4. **ddm-icon.svg** (Icône Simplifiée)
- Utilisation : Favicon, onglets navigateur, petites icônes
- Couleurs : Or et noir
- Format : SVG vectoriel
- Taille de base : 200x200px
- Idéal pour : Favicon, app icons, petites dimensions
- Responsive : ✅ Oui

---

## 🎨 Palette de Couleurs

```
Or Principal:      #D4AF37 (Élégance, Luxe)
Noir Profond:      #1a1a1a (Textes, détails)
Blanc Pur:         #FFFFFF (Contraste)
Gris Neutre:       #666666 (Textes secondaires)
Fond Clair:        #FAFAF8 (Arrière-plan)
```

---

## 📱 Recommandations d'Utilisation

### Header/Navigation
```html
<img src="/images/ddm-logo.svg" alt="DDM Wigs and More" width="200">
```

### Fond Sombre (Dark Mode / Header Noir)
```html
<img src="/images/ddm-logo-white.svg" alt="DDM Wigs and More" width="200">
```

### Favicon
```html
<link rel="icon" href="/images/ddm-icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/images/ddm-icon.svg">
```

### Documents/Impressions
```html
<!-- Utiliser la version monochrome -->
<img src="/images/ddm-logo-monochrome.svg" alt="DDM Wigs and More">
```

---

## 🔧 Conversion en PNG/Formats Raster

Pour convertir en PNG/JPG, utilisez l'une de ces méthodes :

### Option 1 : Online (Rapide, sans installation)
- Visitez : https://cloudconvert.com/svg-to-png
- Uploadez le fichier SVG
- Téléchargez en PNG à la résolution désirée

### Option 2 : CLI (ImageMagick)
```bash
# Installer ImageMagick si nécessaire
brew install imagemagick

# Convertir SVG en PNG (couleur)
convert -density 150 public/images/ddm-logo.svg -quality 90 public/images/ddm-logo.png

# Convertir en différentes résolutions
convert -density 300 public/images/ddm-icon.svg -quality 90 public/images/ddm-icon-192.png
convert -density 300 public/images/ddm-icon.svg -quality 90 -resize 256x256 public/images/ddm-icon-256.png
```

### Option 3 : Inkscape (Desktop App)
- Ouvrir le fichier SVG dans Inkscape
- File → Export As → PNG

---

## 📏 Tailles Recommandées

| Usage | Largeur | Hauteur | Format |
|-------|---------|---------|--------|
| Logo Principal (Desktop) | 280px | 280px | SVG ou PNG |
| Logo (Mobile) | 150px | 150px | SVG ou PNG |
| Favicon | 32px | 32px | SVG ou ICO |
| Apple Touch Icon | 180px | 180px | PNG |
| Og Image (Social) | 1200px | 1200px | PNG ou JPG |
| Footer Logo | 120px | 120px | SVG |

---

## ✅ Checklist d'Implémentation

- [ ] Ajouter logo principal au header
- [ ] Ajouter favicons
- [ ] Créer version PNG (400x400px) pour réseaux sociaux
- [ ] Ajouter logo blanc pour fonds sombres
- [ ] Tester responsivité sur mobile
- [ ] Vérifier contrastes d'accessibilité
- [ ] Ajouter logo dans footer
- [ ] Optimiser fichiers SVG

---

## 🌐 Intégration Web Recommandée

### Structure des images
```
public/
  images/
    ddm-logo.svg           (250KB)
    ddm-logo-monochrome.svg
    ddm-logo-white.svg
    ddm-icon.svg
    ddm-logo.png           (si raster nécessaire)
    favicons/
      favicon.ico
      favicon-16x16.png
      favicon-32x32.png
      favicon-192x192.png
      apple-touch-icon.png
```

### Meta Tags (Head)
```html
<link rel="icon" type="image/svg+xml" href="/images/ddm-icon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/images/favicons/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/images/favicons/favicon-16x16.png">
<link rel="apple-touch-icon" href="/images/favicons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">

<!-- Open Graph (Social Media) -->
<meta property="og:image" content="https://ddmwigs.com/images/ddm-logo.png">
<meta property="og:image:width" content="400">
<meta property="og:image:height" content="400">
```

---

## 💡 Notes de Design

✨ Le logo combine élégance et modernité avec :
- Cercle doré classique (symbole de luxe)
- Profil féminin stylisé (produit principal : perruques)
- Couronne de fleurs (beauté, nature)
- Typographie Georgia (élégance intemporelle)
- Respiration visuelle et proportions équilibrées

---

**Version** : 1.0  
**Date** : 2026-06-30  
**Pour** : DDM Wigs and More (ddmwigs.com)
