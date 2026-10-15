#!/bin/sh
# Offscreen native WebKit navigation test: four primary views, two Hosts Board children.
#
# The backend may be pinned with CLOUD_HOSTS_TEST_BACKEND / CLOUD_HOSTS_TEST_NODE,
# the same override tests/run-role-board-webkit.sh already accepts. Use it to run
# the fixture against an already-built revision while another worker's edits keep
# this tree from serving itself (`src/release.cjs` fingerprint gate).
set -eu
cd "$(dirname "$0")/.."
ROOT="$PWD"
TEMP_HOME=$(mktemp -d /tmp/cloudhosts-hosts-board.XXXXXX)
export CLOUD_HOSTS_HOME="$TEMP_HOME"
BACKEND="${CLOUD_HOSTS_TEST_BACKEND:-$ROOT}"
NODE="${CLOUD_HOSTS_TEST_NODE:-node}"
BACKEND_PID=
cleanup(){
 if [ -n "$BACKEND_PID" ]; then kill "$BACKEND_PID" 2>/dev/null || true; wait "$BACKEND_PID" 2>/dev/null || true; fi
 rm -rf "$TEMP_HOME"
}
trap cleanup EXIT INT TERM
"$NODE" -e "
const registry=require(process.argv[1]+'/src/registry.cjs');
registry.create({name:'Filtered Linux',host:'127.0.0.1',port:65000,os:'linux',defaultDirectory:'/tmp'});
registry.create({name:'Filtered Windows',host:'127.0.0.1',port:65001,os:'windows',defaultDirectory:'C:\\\\Lab'});
" "$BACKEND"
"$NODE" "$BACKEND/cli.cjs" serve > "$TEMP_HOME/backend.log" 2>&1 & BACKEND_PID=$!
n=0
while [ ! -s "$TEMP_HOME/server.json" ]; do
 n=$((n+1)); if [ "$n" -gt 100 ]; then cat "$TEMP_HOME/backend.log"; exit 1; fi
 sleep .1
done
BACKEND_URL=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["url"])' "$TEMP_HOME/server.json")
WEBKIT_BIN=/tmp/cloudhosts-hosts-board-webkit
if [ ! -x "$WEBKIT_BIN" ]; then
 swiftc -parse-as-library tests/workspace-mode-webkit.swift -framework AppKit -framework WebKit -o "$WEBKIT_BIN"
fi
FIXTURE=${1:-tests/workspace-mode-webkit.js}
# The harness exits non-zero when a check fails; let the summary below report
# which check failed instead of aborting on the exit code and printing nothing.
"$WEBKIT_BIN" "$BACKEND_URL" "$FIXTURE" > "$TEMP_HOME/results.json" || true
python3 - "$TEMP_HOME/results.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]));print('HOSTS_BOARD_WEBKIT',len(r['checks']),'PASS',r['passed'])
for check in r['checks']:
 if not check['passed']:print('FAILED',check['name'])
if r.get('errors'):print('ERRORS',r['errors'])
sys.exit(0 if r['passed'] else 1)
PY
