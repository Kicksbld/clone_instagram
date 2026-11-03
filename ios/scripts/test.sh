#!/usr/bin/env bash
# Tests iOS en build incrémental : seul le code modifié est recompilé d'un run à l'autre.
#
#   ios/scripts/test.sh                                  # suite complète
#   ios/scripts/test.sh CloseFriendsViewModelTests ...   # seulement ces suites (pendant une tranche)
#
# - Un DerivedData stable par worktree, gardé d'un run à l'autre. Ne pas le partager entre worktrees :
#   les chemins des sources diffèrent, Xcode recompile alors tout, dépendances comprises (mesuré).
# - Un seul build à la fois par worktree (verrou) : deux xcodebuild sur le même DerivedData se bloquent.
# - `xcodegen generate` seulement si le projet manque ou si `project.yml` a changé.
# - Sortie résumée (erreurs, tests en échec, bilan) ; journal complet dans $DERIVED_DATA/last-test.log.
set -euo pipefail

IOS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKTREE_ID="$(printf '%s' "$IOS_DIR" | shasum | cut -c1-8)"
DERIVED_DATA="${CLONE_IOS_DERIVED_DATA:-$HOME/Library/Developer/Xcode/DerivedData/CloneInstagram-$WORKTREE_ID}"
DESTINATION="${CLONE_IOS_DESTINATION:-platform=iOS Simulator,name=iPhone 17}"
LOCK="$DERIVED_DATA.lock"
LOG="$DERIVED_DATA/last-test.log"

cd "$IOS_DIR"
mkdir -p "$DERIVED_DATA"

if [[ ! -f CloneInstagram.xcodeproj/project.pbxproj || project.yml -nt CloneInstagram.xcodeproj/project.pbxproj ]]; then
  echo "→ xcodegen generate"
  xcodegen generate --quiet
fi

# Verrou : dossier contenant le PID du propriétaire ; repris s'il appartient à un processus disparu
# (build tué par un délai dépassé, par exemple).
until mkdir "$LOCK" 2>/dev/null; do
  owner="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [[ -n "$owner" ]] && ! kill -0 "$owner" 2>/dev/null; then
    rm -rf "$LOCK"
    continue
  fi
  echo "→ un autre build iOS de ce worktree est en cours, attente…"
  sleep 10
done
echo $$ >"$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

only_testing=()
for suite in "$@"; do
  only_testing+=("-only-testing:CloneInstagramTests/$suite")
done

echo "→ xcodebuild test ${*:-(suite complète)}"
set +e
xcodebuild test \
  -project CloneInstagram.xcodeproj \
  -scheme CloneInstagram \
  -destination "$DESTINATION" \
  -derivedDataPath "$DERIVED_DATA" \
  -skipPackagePluginValidation \
  ${only_testing[@]+"${only_testing[@]}"} >"$LOG" 2>&1
status=$?
set -e

grep -E "error:|✘|recorded an issue|Test run with|\*\* TEST (SUCCEEDED|FAILED) \*\*" "$LOG" | awk '!seen[$0]++' || true
[[ $status -eq 0 ]] || echo "→ échec (code $status), journal complet : $LOG"
exit $status
