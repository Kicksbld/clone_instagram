#!/usr/bin/env bash
# Remet le projet iOS en phase avec le dépôt, après un `git pull` ou un changement de branche :
# branche par rapport à main, clés des .xcconfig locaux, génération du .xcodeproj (ADR-017, ADR-019).
# Relançable sans risque ; ne modifie jamais une valeur déjà renseignée.
set -euo pipefail
cd "$(dirname "$0")/.."

project="$PWD/CloneInstagram.xcodeproj"

# 1. Xcode ne doit pas avoir le projet ouvert : sinon il propose de réenregistrer l'ancienne version
#    par-dessus le projet généré (« Resave »).
if pgrep -xq Xcode; then
  open_documents="$(osascript -e 'tell application "Xcode" to get path of every workspace document' 2>/dev/null || true)"
  if [[ "$open_documents" == *"$project"* ]]; then
    echo "Fermez le projet dans Xcode (⌘⇧W ou quitter Xcode), puis relancez ios/scripts/sync.sh." >&2
    exit 1
  fi
fi

# 2. Branche : la démo tourne avec main ; une app compilée sur une branche en retard peut ne plus
#    comprendre l'API (ADR-019). Simple avertissement.
branch="$(git branch --show-current)"
if git fetch --quiet origin main 2>/dev/null; then
  behind="$(git rev-list --count HEAD..origin/main)"
  if [ "$behind" -gt 0 ]; then
    echo "Attention : la branche « $branch » a $behind commit(s) de retard sur main."
    echo "  Pour la démo : git switch main && git pull, puis relancer ce script."
  fi
else
  echo "Attention : origin injoignable, branche non comparée à main."
fi

# 3. Configurations locales : créées depuis les modèles, puis complétées des clés ajoutées depuis.
config_dir=CloneInstagram/Resources/Config
missing_values=""
for name in Local Demo; do
  example="$config_dir/$name.example.xcconfig"
  config="$config_dir/$name.xcconfig"
  if [ ! -f "$config" ]; then
    cp "$example" "$config"
    echo "Créé : $config (à compléter)"
  fi
  for key in $(sed -nE 's/^([A-Z_]+)[[:space:]]*=.*/\1/p' "$example"); do
    if ! grep -qE "^$key[[:space:]]*=" "$config"; then
      {
        echo ""
        echo "// Ajouté par ios/scripts/sync.sh depuis $name.example.xcconfig"
        grep -E "^$key[[:space:]]*=" "$example"
      } >> "$config"
      echo "Ajouté : $key dans $config"
    fi
  done
  for key in $(sed -nE 's/^([A-Z_]+)[[:space:]]*=[[:space:]]*$/\1/p' "$config"); do
    missing_values="$missing_values\n  $config : $key"
  done
done
if [ -n "$missing_values" ]; then
  echo -e "Valeurs à renseigner :$missing_values"
fi

# 4. Projet Xcode régénéré depuis project.yml.
xcodegen generate --quiet
echo "Projet à jour : open $project"
