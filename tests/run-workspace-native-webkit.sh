#!/bin/sh
# Offscreen WebKit end-to-end verification of the Agent/Role split:
# native Agent sessions on the Agent Board, Company/Messages/Plan on the Role Board.
#
# The backend may be pinned with CLOUD_HOSTS_TEST_BACKEND / CLOUD_HOSTS_TEST_NODE,
# the same override tests/run-role-board-webkit.sh already accepts.
set -eu
cd "$(dirname "$0")/.."
ROOT="$PWD"
TEMP_HOME=$(mktemp -d /tmp/cloudhosts-workspace-ui.XXXXXX)
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
const fs=require('node:fs'),path=require('node:path');
const home=process.env.CLOUD_HOSTS_HOME;
const role={id:'native-fixture-one',name:'Toolbox native Codex',engine:'codex',kind:'agent',engineHostId:'local',targetHostId:'local',transport:'native',cwd:'/tmp/cloudhosts-native-project',permission:'ask',createdAt:Date.now(),threadId:'thread-fixture-only'};
fs.writeFileSync(path.join(home,'agents.json'),JSON.stringify([role]));
fs.mkdirSync(path.join(home,'session-events'),{recursive:true});
fs.writeFileSync(path.join(home,'session-events','native-fixture-one.jsonl'),JSON.stringify({id:'ne-fixture-one',key:'assistant:thread-fixture-only:item-final',sessionId:role.id,kind:'assistant',nativeThreadId:role.threadId,turnId:'turn-fixture',itemId:'item-final',status:null,text:'Fixture native answer',time:new Date().toISOString()})+'\n');
"
"$NODE" "$BACKEND/cli.cjs" serve > "$TEMP_HOME/backend.log" 2>&1 & BACKEND_PID=$!
n=0
while [ ! -s "$TEMP_HOME/server.json" ]; do
 n=$((n+1));if [ "$n" -ge 100 ]; then cat "$TEMP_HOME/backend.log"; exit 1; fi
 sleep .1
done
BACKEND_URL=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["url"])' "$TEMP_HOME/server.json")
WEBKIT_BIN=/tmp/cloudhosts-aexus-hub-webkit
if [ ! -x "$WEBKIT_BIN" ]; then
 swiftc -parse-as-library tests/workspace-mode-webkit.swift -framework AppKit -framework WebKit -o "$WEBKIT_BIN"
fi
# The harness exits non-zero when a check fails; let the summary below report
# which check failed instead of aborting on the exit code and printing nothing.
"$WEBKIT_BIN" "$BACKEND_URL" tests/workspace-native-hub-webkit.js > "$TEMP_HOME/results.json" || true
python3 - "$TEMP_HOME/results.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]));print('WORKSPACE_MESSAGES_PLAN_WEBKIT',len(r['checks']),'PASS',r['passed'])
for check in r['checks']:
 if not check['passed']:print('FAILED',check['name'])
if r.get('diagnostics'):print('DIAGNOSTICS',json.dumps(r['diagnostics'],ensure_ascii=False)[:4000])
if r.get('errors'):print('ERRORS',r['errors'])
sys.exit(0 if r['passed'] else 1)
PY
