#!/bin/sh
# Native macOS WebKit authentication lifecycle acceptance.
#
# Two isolated CloudHosts Core instances are started, then the WKWebView harness
# is run twice as two separate processes sharing one disk-backed
# WKWebsiteDataStore: the second process must start from the cookies the first
# one left behind. Nothing here touches the installed application.
set -eu
cd "$(dirname "$0")/.."
ROOT="$PWD"
BACKEND="${CLOUD_HOSTS_TEST_BACKEND:-$ROOT/artifacts/Aexus.app/Contents/Resources/backend}"
NODE="${CLOUD_HOSTS_TEST_NODE:-$(dirname "$BACKEND")/node}"
OUT="${CLOUD_HOSTS_AUTH_OUT:-$ROOT/artifacts/full-acceptance-20261015/integration}"
BIN="$ROOT/artifacts/webkit-auth-lifecycle"
mkdir -p "$OUT"
[ -x "$NODE" ] || NODE=node

HOME_A=$(mktemp -d /tmp/aexus-auth-wk-a.XXXXXX)
HOME_B=$(mktemp -d /tmp/aexus-auth-wk-b.XXXXXX)
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

PID_A=$(start_instance "$HOME_A")
URL_A=$(wait_url "$HOME_A")
PID_B=$(start_instance "$HOME_B")
URL_B=$(wait_url "$HOME_B")
printf 'instance A %s pid %s\ninstance B %s pid %s\n' "$URL_A" "$PID_A" "$URL_B" "$PID_B"

swiftc -parse-as-library -swift-version 5 tests/webkit-auth-lifecycle.swift -framework AppKit -framework WebKit -o "$BIN"

# Provenance for the verdict JSON: the backend path and the buildId/version it
# ships, so a native verdict self-identifies the candidate it tested.
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
echo "native store identifier $STORE"

set +e
"$BIN" "$URL_A" "$URL_B" "$ROOT/tests/webkit-auth-lifecycle.js" "$STORE" cold "$OUT/webkit-auth-lifecycle-cold.json" > "$OUT/webkit-auth-lifecycle-cold.log" 2>&1
COLD=$?

# The browser client id the cold window used. A CloudHosts window keeps its client
# id for its whole session and the Core scopes the session cookie to it, so the
# second process re-creates that window identity to make the retained cookie apply.
# Run against the same two backend processes, so the session behind the cookie is
# the real one the cold run was granted.
CLIENT_ID=$(python3 - "$OUT/webkit-auth-lifecycle-cold.json" <<'PY'
import json,sys
try:r=json.load(open(sys.argv[1]))
except Exception:raise SystemExit
for s in r.get('shellSegments',[]):
    if s.get('segment')=='open':
        print(s.get('value',{}).get('clientId') or '');break
PY
)
if [ -z "$CLIENT_ID" ]; then echo "the cold phase reported no browser client id" >&2; exit 1; fi
echo "cold browser client $CLIENT_ID"
sleep 3
"$BIN" "$URL_A" "$URL_B" "$ROOT/tests/webkit-auth-lifecycle.js" "$STORE" retained "$OUT/webkit-auth-lifecycle-retained.json" "$CLIENT_ID" > "$OUT/webkit-auth-lifecycle-retained.log" 2>&1
RETAINED=$?
set -e

python3 - "$OUT/webkit-auth-lifecycle-cold.json" "$OUT/webkit-auth-lifecycle-retained.json" <<'PY'
import json,sys
overall=0
for phase,path in (('cold',sys.argv[1]),('retained',sys.argv[2])):
    try:r=json.load(open(path))
    except Exception as e:print('NATIVE_WEBKIT_AUTH',phase,'UNREADABLE',e);overall=1;continue
    ok=sum(1 for c in r['checks'] if c['passed'])
    print('NATIVE_WEBKIT_AUTH',phase,ok,'/',len(r['checks']),'PASS' if r['passed'] else 'FAIL','refused=',len(r['refusedRequests']),
          'apiRequests=',sum(f.get('apiRequests') or 0 for f in r.get('frameReports',[])),
          'refusalRecords=',r.get('refusedHttpRecords'),'frameDocuments=',len(r.get('frameStates',[])),'wrote=',sum(1 for f in r.get('frameReports',[]) if f.get('teamsCreated')),
          'navMismatches=',len(r.get('navigationMismatches') or []))
    for m in (r.get('navigationMismatches') or []):
        print('  NAV_MISMATCH frame left on',m.get('view'),'after host navigations',m.get('navigation'),
              'at',m.get('at'),'ms — mismatch fails the phase')
    print('  buildId',r.get('buildId') or '-','version',r.get('version') or '-','backend',r.get('backend') or '-')
    print('  bootstrapStatuses',[b.get('status') for b in r.get('bootstraps',[]) if b.get('frame')=='core'],
          'retainedClient',r.get('retainedClientId') or '-')
    print('  startupCookies',[c['name'] for c in r.get('startupCookies',[])],
          'closingCookies',[c['name'] for c in r.get('closingCookies',[])])
    for c in r['checks']:
        if not c['passed']:print('  FAILED',c['name'],'::',c['detail'])
    if r.get('error'):print('  ERROR',r['error'])
    if not r['passed']:overall=1
sys.exit(overall)
PY
[ "$COLD" = 0 ] || echo "cold exit $COLD"
[ "$RETAINED" = 0 ] || echo "retained exit $RETAINED"
