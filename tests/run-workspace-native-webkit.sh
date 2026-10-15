#!/bin/sh
# Offscreen WebKit end-to-end verification of Workspace → Plan → Messages.
set -eu
cd "$(dirname "$0")/.."
TEMP_HOME=$(mktemp -d /tmp/cloudhosts-workspace-ui.XXXXXX)
export CLOUD_HOSTS_HOME="$TEMP_HOME"
BACKEND_PID=
cleanup(){
 if [ -n "$BACKEND_PID" ]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM
node - <<'JS'
const fs=require('node:fs'),path=require('node:path');
const home=process.env.CLOUD_HOSTS_HOME;
const role={id:'native-fixture-one',name:'Toolbox native Codex',engine:'codex',kind:'agent',engineHostId:'local',targetHostId:'local',transport:'native',cwd:'/tmp/cloudhosts-native-project',permission:'ask',createdAt:Date.now(),threadId:'thread-fixture-only'};
fs.writeFileSync(path.join(home,'agents.json'),JSON.stringify([role]));
fs.mkdirSync(path.join(home,'session-events'));
fs.writeFileSync(path.join(home,'session-events','native-fixture-one.jsonl'),JSON.stringify({id:'ne-fixture-one',key:'assistant:thread-fixture-only:item-final',sessionId:role.id,kind:'assistant',nativeThreadId:role.threadId,turnId:'turn-fixture',itemId:'item-final',status:null,text:'Fixture native answer',time:new Date().toISOString()})+'\n');
JS
node cli.cjs serve > "$TEMP_HOME/backend.log" 2>&1 & BACKEND_PID=$!
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
"$WEBKIT_BIN" "$BACKEND_URL" tests/workspace-native-hub-webkit.js > "$TEMP_HOME/results.json"
python3 - "$TEMP_HOME/results.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]));print('WORKSPACE_MESSAGES_PLAN_WEBKIT',len(r['checks']),'PASS',r['passed'])
for check in r['checks']:
 if not check['passed']:print('FAILED',check['name'])
if r.get('diagnostics'):print('DIAGNOSTICS',json.dumps(r['diagnostics'],ensure_ascii=False)[:4000])
if r.get('errors'):print('ERRORS',r['errors'])
sys.exit(0 if r['passed'] else 1)
PY
