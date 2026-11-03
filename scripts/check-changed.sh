#!/usr/bin/env bash
# Lint, typecheck, tests et build des seuls paquets modifiés par rapport à une base (origin/main par
# défaut), plus les paquets qui en dépendent. Changements non commités compris. La CI vérifie tout.
#
#   pnpm check:changed                 # base origin/main (penser à `git fetch`)
#   pnpm check:changed origin/main~1   # autre base
set -euo pipefail

BASE="${1:-origin/main}"
FILTER=(--filter "...[$BASE]" --filter '!clone-instagram')

selected="$(pnpm "${FILTER[@]}" exec pwd 2>/dev/null || true)"
if [[ -z "$selected" || "$selected" == No\ projects* ]]; then
  echo "→ aucun paquet TypeScript modifié depuis $BASE"
else
  echo "→ paquets vérifiés :"
  sed "s|^$PWD/|  |" <<<"$selected"
  pnpm "${FILTER[@]}" run --if-present lint
  pnpm "${FILTER[@]}" run --if-present typecheck
  pnpm "${FILTER[@]}" --workspace-concurrency=1 run --if-present test
  pnpm "${FILTER[@]}" run --if-present build
fi
pnpm exec prettier --check .
