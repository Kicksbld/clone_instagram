#!/usr/bin/env bash
# Prépare le projet iOS : outils, configurations locales, génération du .xcodeproj (ADR-017).
set -euo pipefail
cd "$(dirname "$0")/.."

brew bundle --file Brewfile

# Configurations locales et projet Xcode : même étape qu'après chaque `git pull`.
exec scripts/sync.sh
