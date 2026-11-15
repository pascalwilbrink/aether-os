#!/usr/bin/env bash
# Prints the pnpm filter arguments CI uses to select packages to check.
#
#   affected-filter.sh <base-ref>
#
# - Empty output: run every package (no usable base, or a change that can
#   affect everything: lockfile, workspace config, root package.json, CI).
# - Otherwise: --filter=...[<base>], i.e. packages with changes since <base>
#   plus every package that depends on them (a Krepis change also selects
#   Polis and Hephaestus; a contracts change selects its consumers).
#   Changes outside any package (docs/, infra/) select nothing.
#   The output is meant to be word-split into separate arguments.
set -euo pipefail

base="${1:-}"

if [[ -z "$base" || "$base" =~ ^0+$ ]] || ! git rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
  echo "No usable base ref ('$base'): checking all packages." >&2
  exit 0
fi

changed="$(git diff --name-only "$base" HEAD)"
global='^(pnpm-lock\.yaml|pnpm-workspace\.yaml|package\.json|\.npmrc|\.github/)'
if grep -Eq "$global" <<<"$changed"; then
  echo "Workspace-wide files changed: checking all packages." >&2
  grep -E "$global" <<<"$changed" | sed 's/^/  /' >&2
  exit 0
fi

# The root project is excluded: its scripts run `pnpm -r`, i.e. everything.
echo "--filter=...[$base] --filter=!aether-os"
