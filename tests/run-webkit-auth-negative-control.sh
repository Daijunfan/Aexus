#!/bin/sh
# Negative control for the native WebKit authentication lifecycle harness.
#
# The same harness, the same journey, pointed at the *installed* 2.11.1
# application instead of the candidate. It must reproduce the retained-cookie
# defect (the Core refuses authenticated commands with `403 Invalid CSRF token`
# once the Role Board is re-entered), which is what makes the candidate's pass a
# real pass rather than a vacuous one.
#
# Read-only with respect to the installed application: its bundle is never
# written, and both the Core and the harness run with isolated temporary homes.
set -eu
cd "$(dirname "$0")/.."
ROOT="$PWD"
INSTALLED="${CLOUD_HOSTS_INSTALLED_APP:-/Applications/Aexus.app}"
BACKEND="$INSTALLED/Contents/Resources/backend"
NODE="$INSTALLED/Contents/Resources/node"
OUT="${CLOUD_HOSTS_NEGATIVE_OUT:-$ROOT/artifacts/full-acceptance-20261015/integration-negative-control}"
BIN="$ROOT/artifacts/webkit-auth-lifecycle"
mkdir -p "$OUT"

[ -x "$NODE" ] || { echo "installed app node missing: $NODE" >&2; exit 2; }
[ -f "$BACKEND/cli.cjs" ] || { echo "installed app backend missing: $BACKEND" >&2; exit 2; }
swiftc -parse-as-library -swift-version 5 tests/webkit-auth-lifecycle.swift -framework AppKit -framework WebKit -o "$BIN"

HOME_A=$(mktemp -d /tmp/aexus-auth-neg-a.XXXXXX)
HOME_B=$(mktemp -d /tmp/aexus-auth-neg-b.XXXXXX)
PID_A=; PID_B=; STORE=
cleanup(){
  [ -n "$PID_A" ] && kill "$PID_A" 2>/dev/null || true
  [ -n "$PID_B" ] && kill "$PID_B" 2>/dev/null || true
  sleep 1
  [ -n "$PID_A" ] && kill -9 "$PID_A" 2>/dev/null || true
  [ -n "$PID_B" ] && kill -9 "$PID_B" 2>/dev/null || true
  rm -rf "$HOME_A" "$HOME_B"
  # This fresh process has no views using the store, so WebKit can remove it.
  # The UUID was created by this run; no default or user store is ever opened.
  [ -n "$STORE" ] && "$BIN" --cleanup-store "$STORE"
}
trap cleanup EXIT INT TERM

start_instance(){
  home="$1"
  CLOUD_HOSTS_HOME="$home" AGENTS_COMPANY_PROJECTS="$home/projects" AGENTS_COMPANY_WORKSPACES="$home/work" \
    "$NODE" "$BACKEND/cli.cjs" serve > "$home/backend.log" 2>&1 &
  echo $!
}
wait_url(){
  home="$1"; count=0
  while [ ! -s "$home/server.json" ]; do
    count=$((count+1))
    if [ "$count" -gt 150 ]; then echo "backend did not start: $home" >&2; cat "$home/backend.log" >&2; exit 1; fi
    sleep .2
  done
  python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["url"])' "$home/server.json"
}

INSTALLED_VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$INSTALLED/Contents/Info.plist" 2>/dev/null || echo unknown)
INSTALLED_BUILD=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$INSTALLED/Contents/Info.plist" 2>/dev/null || echo unknown)
case "$INSTALLED_VERSION" in
  2.11.1) printf 'control target %s version %s build %s\n' "$INSTALLED" "$INSTALLED_VERSION" "$INSTALLED_BUILD" ;;
  *) echo "the installed application is $INSTALLED_VERSION build $INSTALLED_BUILD, not the released 2.11.1 the control is defined against" >&2; exit 2 ;;
esac

PID_A=$(start_instance "$HOME_A")
URL_A=$(wait_url "$HOME_A")
PID_B=$(start_instance "$HOME_B")
URL_B=$(wait_url "$HOME_B")
printf 'installed app %s\ninstance A %s pid %s\ninstance B %s pid %s\n' "$INSTALLED" "$URL_A" "$PID_A" "$URL_B" "$PID_B"

release_field(){ python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1]))[sys.argv[2]])
except Exception: print("")' "$1" "$2"; }
export AEXUS_TEST_BACKEND="$BACKEND"
export AEXUS_TEST_BUILD_ID="$(release_field "$BACKEND/release.json" buildId)"
export AEXUS_TEST_VERSION="$(release_field "$BACKEND/release.json" version)"

STORE=$(python3 -c 'import uuid;print(uuid.uuid4())')
python3 - "$OUT/native-store-owner.json" "$BIN" "$STORE" <<'PYOWNER'
import json,sys
json.dump({'binary':sys.argv[2],'storeIdentifier':sys.argv[3],'testOnly':True},open(sys.argv[1],'w'),indent=2)
PYOWNER
set +e
"$BIN" "$URL_A" "$URL_B" "$ROOT/tests/webkit-auth-lifecycle.js" "$STORE" cold "$OUT/installed-cold.json" \
  > "$OUT/installed-2.11.1-cold-native-webkit.log" 2>&1
COLD=$?
set -e

echo "installed 2.11.1 cold exit $COLD (non-zero is the expected control result)"
grep -c "Invalid CSRF token" "$OUT/installed-2.11.1-cold-native-webkit.log" | sed 's/^/csrf refusals: /'
