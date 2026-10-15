#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
ROOT="$PWD"
TEST_HOME=$(mktemp -d /tmp/cloudhosts-role-webkit.XXXXXX)
BACKEND="${CLOUD_HOSTS_TEST_BACKEND:-$ROOT}"
NODE="${CLOUD_HOSTS_TEST_NODE:-node}"
PID=
cleanup(){ if [ -n "$PID" ]; then kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; fi; rm -rf "$TEST_HOME"; }
trap cleanup EXIT INT TERM
CLOUD_HOSTS_HOME="$TEST_HOME" "$NODE" "$BACKEND/cli.cjs" serve > "$TEST_HOME/backend.log" 2>&1 & PID=$!
count=0
while [ ! -s "$TEST_HOME/server.json" ]; do
 count=$((count+1));if [ "$count" -gt 100 ]; then cat "$TEST_HOME/backend.log";exit 1;fi
 sleep .1
done
URL=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["url"])' "$TEST_HOME/server.json")
BIN="$ROOT/artifacts/role-board-webkit"
swiftc -parse-as-library tests/workspace-mode-webkit.swift -framework AppKit -framework WebKit -o "$BIN"
# The harness exits non-zero when a check fails; let the summary below report
# which check failed instead of aborting on the exit code and printing nothing.
"$BIN" "$URL" "$ROOT/tests/role-board-webkit.js" > "$ROOT/artifacts/role-board-acceptance/native-webkit.json" || true
python3 - "$ROOT/artifacts/role-board-acceptance/native-webkit.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]));print('ROLE_BOARD_NATIVE_WEBKIT',len(r['checks']),'PASS',r['passed'])
for c in r['checks']:
 if not c['passed']:print('FAILED',c['name'])
sys.exit(0 if r['passed'] else 1)
PY
