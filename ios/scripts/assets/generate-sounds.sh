#!/usr/bin/env bash
# Synthétise les repères sonores de l'onboarding (ADR-038) : sons courts, libres de droits, en .caf PCM mono.
# Usage : ios/scripts/assets/generate-sounds.sh   (ffmpeg requis)
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=CloneInstagram/Resources/Sounds
mkdir -p "$OUT"

# Attaque douce (évite le clic) puis décroissance exponentielle de constante k.
env() { echo "min(1,t*300)*exp(-t*$1)"; }
# Note de fréquence f démarrant à s, décroissance k.
note() { echo "if(gte(t,$2),sin(2*PI*$1*(t-$2))*min(1,(t-$2)*300)*exp(-(t-$2)*$3),0)"; }

render() { # nom, durée, expression
  ffmpeg -v error -y -f lavfi -i "aevalsrc=exprs='0.6*($3)':s=44100:d=$2" -ac 1 -c:a pcm_s16le -f caf "$OUT/cue-$1.caf"
  echo "✓ $1"
}
noise() { # nom, durée, filtres
  ffmpeg -v error -y -f lavfi -i "anoisesrc=d=$2:c=pink:r=44100:a=0.5" -af "$3" -ac 1 -c:a pcm_s16le -f caf "$OUT/cue-$1.caf"
  echo "✓ $1"
}

render tap     0.06 "sin(2*PI*1700*t)*$(env 90)"
render tick    0.05 "sin(2*PI*2400*t)*$(env 120)"
render blip    0.07 "0.7*(sin(2*PI*1150*t)+0.3*sin(2*PI*2300*t))*$(env 60)"
render pop     0.14 "sin(2*PI*(380*t+2600*t*t))*$(env 28)"
render like    0.32 "$(note 1046.5 0 14)+$(note 1318.5 0.06 14)+$(note 1568 0.12 10)"
render chime   0.70 "0.6*$(note 1318.5 0 6)+0.45*$(note 1975.5 0.09 7)"
render success 0.90 "$(note 523.25 0 9)+$(note 659.25 0.08 9)+$(note 783.99 0.16 8)+$(note 1046.5 0.24 4)"
render error   0.30 "0.8*$(note 330 0 14)+0.8*$(note 247 0.11 12)"
noise  swipe   0.22 "bandpass=f=2200:width_type=o:w=1.5,afade=t=in:d=0.08,afade=t=out:st=0.1:d=0.12,volume=1.6"
noise  whoosh  0.45 "bandpass=f=900:width_type=o:w=2,afade=t=in:d=0.2,afade=t=out:st=0.2:d=0.25,volume=2.2"
noise  shutter 0.16 "highpass=f=1500,volume='if(lt(t,0.03),1.6,if(between(t,0.07,0.11),1.2,0))':eval=frame,afade=t=out:st=0.11:d=0.05"

# Normalisation de crête à -3 dBFS (niveaux homogènes entre sons synthétisés et bruits filtrés).
for file in "$OUT"/*.caf; do
  peak=$(ffmpeg -i "$file" -af volumedetect -f null /dev/null 2>&1 | sed -n 's/.*max_volume: \(-\{0,1\}[0-9.]*\) dB/\1/p')
  gain=$(awk -v p="$peak" 'BEGIN { printf "%.2f", -3 - p }')
  ffmpeg -v error -y -i "$file" -af "volume=${gain}dB" -c:a pcm_s16le -f caf "$file.tmp" && mv "$file.tmp" "$file"
done
echo "✓ normalisé à -3 dBFS"
