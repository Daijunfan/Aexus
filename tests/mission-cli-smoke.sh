#!/usr/bin/env bash
# CLI-only, isolated end-to-end Messages + Plan scenario. No cloud or model access.
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=$(mktemp -d /tmp/cloudhosts-mission-cli.XXXXXX)
export CLOUD_HOSTS_HOME="$DIR"
cleanup(){ node cli.cjs stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
printf '%s\n' '{"name":"Shared Native Group","description":"No extra system prompt","memberIds":[]}' > "$DIR/group.json"
node cli.cjs messages create --data "@$DIR/group.json" > "$DIR/group-result.json"
GROUP_ID=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["id"])' "$DIR/group-result.json")
node cli.cjs messages post "$GROUP_ID" --text 'Send only what I explicitly request' --client-message-id cli-001 > "$DIR/message.json"
node cli.cjs messages history "$GROUP_ID" > "$DIR/history.json"
python3 - "$DIR" "$GROUP_ID" <<'PY'
import json,sys,datetime,pathlib
path=pathlib.Path(sys.argv[1]);g=sys.argv[2]
h=json.loads((path/'history.json').read_text());assert len(h['messages'])==1
assert h['messages'][0]['text']=='Send only what I explicitly request'
at=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=3)).isoformat()
(path/'plan.json').write_text(json.dumps({'name':'Periodic report reminder','action':{'type':'notice','groupId':g,'text':'Open the report'},'rule':{'kind':'once','at':at},'enabled':False}))
PY
node cli.cjs plan create --data "@$DIR/plan.json" > "$DIR/plan-result.json"
PLAN_ID=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["id"])' "$DIR/plan-result.json")
node cli.cjs plan list > "$DIR/plans-list.json"
node cli.cjs plan run "$PLAN_ID" > "$DIR/run.json"
node cli.cjs plan history "$PLAN_ID" > "$DIR/runs.json"
node cli.cjs messages history "$GROUP_ID" > "$DIR/after.json"
python3 - "$DIR" <<'PY'
import json,sys,pathlib,stat
p=pathlib.Path(sys.argv[1]);run=json.loads((p/'run.json').read_text());records=json.loads((p/'runs.json').read_text());history=json.loads((p/'after.json').read_text())
assert run['status']=='notified' and len(records)==1 and len(history['messages'])==2
assert history['messages'][1]['author']['kind']=='core'
assert json.loads((p/'plans-list.json').read_text())[0]['enabled'] is False
assert stat.S_IMODE((p/'plans.json').stat().st_mode)==0o600
print('CLI_MESSAGES_GROUP_CREATE_POST_HISTORY=PASS')
print('CLI_PLAN_CREATE_LIST_RUN_HISTORY=PASS')
print('CLI_PLAN_GROUP_PUBLICATION=PASS')
print('CLI_NO_MODEL_MESSAGES=PASS')
print('CLI_SAVED_SCHEDULE_FILE_PERMISSIONS=0600')
PY
