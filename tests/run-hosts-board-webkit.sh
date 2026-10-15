#!/bin/sh
# Offscreen native WebKit navigation test: three primary views, two Hosts Board children.
set -eu
cd "$(dirname "$0")/.."
TEMP_HOME=$(mktemp -d /tmp/cloudhosts-hosts-board.XXXXXX)
export CLOUD_HOSTS_HOME="$TEMP_HOME"
BACKEND_PID=
cleanup(){
 if [ -n "$BACKEND_PID" ]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
 rm -rf "$TEMP_HOME"
}
trap cleanup EXIT INT TERM
node - <<'JS'
const registry=require('./src/registry.cjs');
registry.create({name:'Filtered Linux',host:'127.0.0.1',port:65000,os:'linux',defaultDirectory:'/tmp'});
registry.create({name:'Filtered Windows',host:'127.0.0.1',port:65001,os:'windows',defaultDirectory:'C:\\Lab'});
JS
node cli.cjs serve > "$TEMP_HOME/backend.log" 2>&1 & BACKEND_PID=$!
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
"$WEBKIT_BIN" "$BACKEND_URL" "$FIXTURE" > "$TEMP_HOME/results.json"
python3 - "$TEMP_HOME/results.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]));print('HOSTS_BOARD_WEBKIT',len(r['checks']),'PASS',r['passed'])
for check in r['checks']:
 if not check['passed']:print('FAILED',check['name'])
if r.get('errors'):print('ERRORS',r['errors'])
sys.exit(0 if r['passed'] else 1)
PY
