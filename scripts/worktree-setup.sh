#!/usr/bin/env bash
# Prépare un nouveau worktree puis lance le projet, depuis la racine du worktree :
#
#   scripts/worktree-setup.sh            # préparation, puis pnpm dev
#   scripts/worktree-setup.sh --no-dev   # préparation seulement
#
# 1. Copie depuis le dépôt principal les fichiers non versionnés (configuration iOS, .env, clés de
#    signature Supabase) ; dépôt principal : $CLONE_MAIN_CHECKOUT, ~/Desktop/Code/Clone-Instagram par défaut.
# 2. Installe les dépendances et génère le projet Xcode.
# 3. Arrête tout `pnpm dev` encore lancé (API, worker, backoffice), quel que soit le worktree.
# 4. Démarre Supabase et Redis s'ils sont arrêtés, applique les migrations de cette branche, lance pnpm dev.
set -euo pipefail

SRC="${CLONE_MAIN_CHECKOUT:-$HOME/Desktop/Code/Clone-Instagram}"
ROOT="$(git rev-parse --show-toplevel)"
RUN_DEV=true
[[ "${1:-}" == "--no-dev" ]] && RUN_DEV=false

cd "$ROOT"
if [[ "$(cd "$SRC" && pwd -P)" == "$(pwd -P)" ]]; then
  echo "Ce script se lance depuis un worktree, pas depuis le dépôt principal ($SRC)." >&2
  exit 1
fi

echo "→ copie des fichiers non versionnés depuis $SRC"
CONFIG=ios/CloneInstagram/Resources/Config
for file in "$CONFIG/Local.xcconfig" "$CONFIG/Demo.xcconfig" "$CONFIG/CloneInstagram.entitlements" \
  .env .env.demo supabase/signing_keys.json; do
  if [[ -f "$SRC/$file" ]]; then
    cp "$SRC/$file" "$file"
  else
    echo "  absent dans le dépôt principal, ignoré : $file"
  fi
done

echo "→ pnpm install"
pnpm install --frozen-lockfile --reporter=silent

echo "→ xcodegen generate"
(cd ios && xcodegen generate --quiet)

if ! $RUN_DEV; then
  echo "→ worktree prêt (pnpm dev non lancé)"
  exit 0
fi

echo "→ arrêt des pnpm dev encore lancés"
pids="$(lsof -ti tcp:3000 -ti tcp:3001 2>/dev/null || true)"
[[ -n "$pids" ]] && kill $pids 2>/dev/null || true
pkill -f "tsx watch --env-file-if-exists" 2>/dev/null || true

echo "→ Supabase et Redis"
supabase status >/dev/null 2>&1 || supabase start
docker compose up -d

echo "→ migrations de cette branche"
pnpm db:migrate

echo "→ pnpm dev"
exec pnpm dev
