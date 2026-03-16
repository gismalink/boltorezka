#!/usr/bin/env bash
set -euo pipefail

MIN_VERSION="${1:-22.12.0}"
CURRENT_VERSION_RAW="$(node -v 2>/dev/null || true)"
CURRENT_VERSION="${CURRENT_VERSION_RAW#v}"

if [[ -z "$CURRENT_VERSION" ]]; then
  echo "[node-check] Node.js is not installed or unavailable in PATH" >&2
  echo "[node-check] required: >= ${MIN_VERSION}" >&2
  exit 1
fi

if ! node -e '
const min = process.argv[1];
const cur = process.argv[2];
const toNums = (v) => String(v).split(".").map((x) => Number.parseInt(x, 10) || 0);
const [a1, b1, c1] = toNums(cur);
const [a2, b2, c2] = toNums(min);
const ok = a1 > a2 || (a1 === a2 && (b1 > b2 || (b1 === b2 && c1 >= c2)));
process.exit(ok ? 0 : 1);
' "$MIN_VERSION" "$CURRENT_VERSION"; then
  echo "[node-check] Node.js ${CURRENT_VERSION} is too old" >&2
  echo "[node-check] required: >= ${MIN_VERSION}" >&2
  echo "[node-check] install/use Node 22 LTS, e.g. via Homebrew: brew install node@22 && brew link --overwrite --force node@22" >&2
  exit 1
fi

echo "[node-check] Node.js ${CURRENT_VERSION} (ok, >= ${MIN_VERSION})"