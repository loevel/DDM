#!/bin/bash

# Script to generate PNG and favicon assets from SVG logos
# Requires: ImageMagick (brew install imagemagick)

echo "🎨 Generating DDM Logo Assets..."

# Create favicon directory
mkdir -p public/images/favicons

# Colors (using the SVG colors)
GOLD="#D4AF37"
BLACK="#1a1a1a"

# 1. Generate PNG versions from main logo (color)
echo "📦 Generating colored logo PNGs..."
convert -density 150 public/images/ddm-logo.svg \
  -quality 95 \
  -background none \
  public/images/ddm-logo-400.png

convert -density 100 public/images/ddm-logo.svg \
  -quality 95 \
  -resize 250x250 \
  -background none \
  public/images/ddm-logo-250.png

convert -density 75 public/images/ddm-logo.svg \
  -quality 95 \
  -resize 150x150 \
  -background none \
  public/images/ddm-logo-150.png

# 2. Generate favicon assets from icon
echo "🔖 Generating favicon assets..."

# 16x16
convert -density 300 public/images/ddm-icon.svg \
  -quality 95 \
  -resize 16x16 \
  public/images/favicons/favicon-16x16.png

# 32x32
convert -density 300 public/images/ddm-icon.svg \
  -quality 95 \
  -resize 32x32 \
  public/images/favicons/favicon-32x32.png

# 192x192 (Android)
convert -density 300 public/images/ddm-icon.svg \
  -quality 95 \
  -resize 192x192 \
  public/images/favicons/favicon-192x192.png

# 512x512 (Android)
convert -density 300 public/images/ddm-icon.svg \
  -quality 95 \
  -resize 512x512 \
  public/images/favicons/favicon-512x512.png

# Apple Touch Icon
convert -density 300 public/images/ddm-icon.svg \
  -quality 95 \
  -resize 180x180 \
  -background '#FAFAF8' \
  -flatten \
  public/images/favicons/apple-touch-icon.png

# 3. Generate monochrome versions
echo "⚫ Generating monochrome logo PNGs..."

convert -density 150 public/images/ddm-logo-monochrome.svg \
  -quality 95 \
  -background none \
  public/images/ddm-logo-mono-400.png

convert -density 100 public/images/ddm-logo-monochrome.svg \
  -quality 95 \
  -resize 250x250 \
  -background none \
  public/images/ddm-logo-mono-250.png

# 4. Generate white versions
echo "⚪ Generating white logo PNGs..."

convert -density 150 public/images/ddm-logo-white.svg \
  -quality 95 \
  -background '#1a1a1a' \
  -flatten \
  public/images/ddm-logo-white-400.png

convert -density 100 public/images/ddm-logo-white.svg \
  -quality 95 \
  -resize 250x250 \
  -background '#1a1a1a' \
  -flatten \
  public/images/ddm-logo-white-250.png

# 5. Create multi-size ICO favicon (for older browsers)
echo "🎯 Creating favicon.ico..."

convert \
  public/images/favicons/favicon-16x16.png \
  public/images/favicons/favicon-32x32.png \
  -colors 256 \
  public/images/favicons/favicon.ico

# 6. Generate Open Graph image (1200x1200)
echo "📸 Generating Open Graph image..."

convert -density 300 public/images/ddm-logo.svg \
  -quality 95 \
  -resize 1200x1200 \
  -background '#FAFAF8' \
  -gravity center \
  -extent 1200x1200 \
  public/images/ddm-og-image.png

echo ""
echo "✅ Logo assets generated successfully!"
echo ""
echo "📂 Generated files:"
ls -lh public/images/ddm-logo*.png 2>/dev/null
ls -lh public/images/favicons/ 2>/dev/null
echo ""
echo "📝 Total files generated: $(find public/images -name 'ddm*' -o -name 'favicons/*' | wc -l)"
