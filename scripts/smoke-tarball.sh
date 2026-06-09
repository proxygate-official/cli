#!/usr/bin/env bash
# Tarball smoke: install the PACKED package OUTSIDE the workspace and load
# every lazy command chunk. Catches what local gates cannot: the workspace
# symlink resolves private packages (@proxygate/api-types, the parsers) in
# every in-repo test, but the published tarball has no symlinks - 0.10.0
# shipped with proxy/listings crashing on ERR_MODULE_NOT_FOUND exactly this way.
#
# Commands may fail on auth/network (no credentials in CI); the ONLY failure
# signature here is module resolution.
set -euo pipefail

PKG_DIR=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

pnpm --dir "$PKG_DIR" pack --out "$TMP/cli.tgz" >/dev/null
cd "$TMP"
printf '{"name":"smoke","private":true}' > package.json
npm install ./cli.tgz --silent --no-audit --no-fund

BIN=./node_modules/.bin/proxygate
FAIL=0
# One command per lazy chunk in src/index.ts's dynamic-import registry.
while IFS= read -r cmd; do
  out=$($BIN $cmd 2>&1 || true)
  if grep -qE "ERR_MODULE_NOT_FOUND|Cannot find (package|module)|Dynamic require of" <<< "$out"; then
    echo "FAIL: 'proxygate $cmd' has unresolved modules:"
    echo "$out" | head -5
    FAIL=1
  else
    echo "ok: proxygate $cmd"
  fi
done << 'CMDS'
--help
proxy nonexistent-listing /
listings list
balance
apis --limit 1
usage
pricing
settlements
tunnel status
skills list
rate nonexistent-listing --stars 5
deposit --help
withdraw --help
create --help
metadata
CMDS

[ "$FAIL" = "0" ] && echo "tarball smoke passed"
exit "$FAIL"
