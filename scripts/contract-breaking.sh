#!/usr/bin/env bash
# Ruptures de compatibilité du contrat (ADR-019) : compare packages/contract/openapi.yaml à sa version
# sur une référence git (origin/main par défaut, `git fetch` au préalable). Échoue sur toute erreur
# oasdiff, sauf celles assumées dans packages/contract/oasdiff-err-ignore.txt.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v oasdiff >/dev/null; then
  echo "oasdiff absent : brew install oasdiff (version de la CI dans .github/workflows/ci.yml)" >&2
  exit 1
fi

base_ref="${1:-origin/main}"
base="$(mktemp)"
trap 'rm -f "$base"' EXIT
git show "$base_ref:packages/contract/openapi.yaml" > "$base"

args=(breaking "$base" packages/contract/openapi.yaml --fail-on ERR)
ignore=packages/contract/oasdiff-err-ignore.txt
if [ -f "$ignore" ]; then
  args+=(--err-ignore "$ignore")
fi
oasdiff "${args[@]}"
