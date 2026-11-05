#!/usr/bin/env bash
# Découpe les 3 poses de la mascotte dans la vidéo source (ADR-038) :
# boucle vidéo muette en aller-retour (sans saut) + image fixe (Reduce Motion), bords fondus au noir.
# Usage : ios/scripts/assets/cut-mascots.sh   (ffmpeg requis)
set -euo pipefail
cd "$(dirname "$0")/../.."

SOURCE=design/mascot/mascot-source.mp4
VIDEOS=CloneInstagram/Resources/Mascot
ASSETS=CloneInstagram/Resources/Assets.xcassets
SIZE=420       # côté du carré découpé dans la source 1280×720
OUT=360        # côté de sortie (pair, H.264)
START=0.5
LENGTH=2.2     # secondes avant que les effets ne débordent sur la pose voisine
STILL=1.5      # instant de l'image fixe

# Pose : nom de fichier, nom d'asset, x et y du coin du carré dans la source.
POSES=(
  "mascot-bravo MascotBravo 45 120"
  "mascot-guide MascotGuide 440 120"
  "mascot-heart MascotHeart 840 120"
)

# Fondu radial vers le noir : masque les débris des poses voisines et le bord du découpage.
FADE="geq=r='r(X,Y)*FADE(X,Y)':g='g(X,Y)*FADE(X,Y)':b='b(X,Y)*FADE(X,Y)'"
FADE=${FADE//FADE(X,Y)/clip((1-hypot(X-W/2,Y-H/2)/(W/2))*3.2,0,1)}

mkdir -p "$VIDEOS"
for pose in "${POSES[@]}"; do
  read -r file asset x y <<<"$pose"
  crop="crop=$SIZE:$SIZE:$x:$y,scale=$OUT:$OUT:flags=lanczos,format=gbrp,$FADE"

  ffmpeg -v error -y -ss "$START" -t "$LENGTH" -i "$SOURCE" -an \
    -filter_complex "[0:v]$crop,split[f][b];[b]reverse[r];[f][r]concat=n=2:v=1,format=yuv420p[v]" \
    -map "[v]" -c:v libx264 -profile:v high -crf 20 -preset slow -movflags +faststart \
    "$VIDEOS/$file.mp4"

  set_dir="$ASSETS/$asset.imageset"
  mkdir -p "$set_dir"
  ffmpeg -v error -y -ss "$STILL" -i "$SOURCE" -frames:v 1 -vf "$crop" "$set_dir/$file.png"
  cat >"$set_dir/Contents.json" <<JSON
{
  "images" : [
    {
      "filename" : "$file.png",
      "idiom" : "universal"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
JSON
  echo "✓ $file"
done
