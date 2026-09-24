#!/usr/bin/env bash
# Prépare le projet iOS : outils, configurations locales, génération du .xcodeproj (ADR-017).
set -euo pipefail
cd "$(dirname "$0")/.."

brew bundle --file Brewfile

config_dir=CloneInstagram/Resources/Config
for name in Local Demo; do
  if [ ! -f "$config_dir/$name.xcconfig" ]; then
    cp "$config_dir/$name.example.xcconfig" "$config_dir/$name.xcconfig"
    echo "Créé : $config_dir/$name.xcconfig (à compléter)"
  fi
done

xcodegen generate
