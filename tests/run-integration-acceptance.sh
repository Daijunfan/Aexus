#!/bin/sh
# Candidate acceptance orchestration for the packaged Aexus.app.
#
# Package suites use the candidate backend and bundled Node. The global Node
# suite executes the source tree and is explicitly labeled in its verdict. Suites run in order and each one's
# output is kept, so a failure does not hide the suites behind it. Nothing is
# suppressed: a refused request, a skipped feature or an isolated fixture stays
# visible in the per-suite logs.
#
#   CLOUD_HOSTS_TEST_BACKEND=... CLOUD_HOSTS_TEST_NODE=... sh tests/run-integration-acceptance.sh
set -eu
cd "$(dirname "$0")/.."
ROOT="$PWD"
APP="${CLOUD_HOSTS_ACCEPT_APP:-$ROOT/artifacts/Aexus.app}"
export CLOUD_HOSTS_TEST_BACKEND="${CLOUD_HOSTS_TEST_BACKEND:-$APP/Contents/Resources/backend}"
export CLOUD_HOSTS_TEST_NODE="${CLOUD_HOSTS_TEST_NODE:-$APP/Contents/Resources/node}"
OUT="${CLOUD_HOSTS_ACCEPT_OUT:-$ROOT/artifacts/full-acceptance-20261015/integration}"
mkdir -p "$OUT"
export CLOUD_HOSTS_AUTH_OUT="$OUT"
export CLOUD_HOSTS_PROBE_OUT="$OUT"
export CLOUD_HOSTS_ACCEPT_APP="$APP"
[ -x "$CLOUD_HOSTS_TEST_NODE" ] || { echo "bundled node missing: $CLOUD_HOSTS_TEST_NODE" >&2; exit 2; }
[ -f "$CLOUD_HOSTS_TEST_BACKEND/cli.cjs" ] || { echo "candidate backend missing: $CLOUD_HOSTS_TEST_BACKEND" >&2; exit 2; }

printf 'candidate backend %s\ncandidate node    %s\n' "$CLOUD_HOSTS_TEST_BACKEND" "$CLOUD_HOSTS_TEST_NODE"
# Pin and verify the exact packaged backend before any verdict is accepted.
node - "$CLOUD_HOSTS_TEST_BACKEND" "$APP" "$OUT/candidate-pin.json" <<'PYPIN'
const fs=require('node:fs'),path=require('node:path');
const [backend,app,out]=process.argv.slice(2);
const release=require(path.join(backend,'src/release.cjs')).verify(backend);
fs.writeFileSync(out,JSON.stringify({backend:fs.realpathSync(backend),app:fs.realpathSync(app),...release},null,2));
console.log('candidate',release.version,release.buildId);
PYPIN
SUMMARY="$OUT/suite-summary.txt"
: > "$SUMMARY"

run(){
  name="$1"; shift
  log="$OUT/$name.log"
  printf '%s\n' "=== $name : $* ==="
  if "$@" > "$log" 2>&1; then
    status=PASS
  else
    status=FAIL
  fi
  printf '%-34s %s\n' "$name" "$status" | tee -a "$SUMMARY"
  node - "$OUT/candidate-pin.json" "$OUT/$name-verdict.json" "$name" "$status" "$log" <<'PYVERDICT'
const fs=require('node:fs');
const [pin,out,suite,status,log]=process.argv.slice(2);
const evidenceKind=suite==='global-node-suite'?'source-tree':suite==='icon-packaging-metadata'?'source-and-candidate':'pinned-candidate';
fs.writeFileSync(out,JSON.stringify({...JSON.parse(fs.readFileSync(pin)),suite,status,log,evidenceKind,sourceRoot:process.cwd()},null,2));
PYVERDICT
  tail -4 "$log" | sed 's/^/    /'
}

run icon-packaging-metadata        node tests/icon-packaging-metadata.cjs
run native-webkit-auth-lifecycle   sh tests/run-webkit-auth-lifecycle.sh
run native-webkit-role-board       sh tests/run-role-board-webkit.sh
run role-auth-lifecycle-live       node tests/role-auth-lifecycle-live.cjs
run cross-window-cookie-probe      node tests/integration-cross-window-cookie-probe.cjs
run role-board-live-ui-deep        env CLOUD_HOSTS_ROLE_DEEP=1 node tests/role-board-live-ui.cjs
run role-team-and-agent-columns-ui node tests/role-team-and-agent-columns-ui.cjs
run global-node-suite              npm test
run release-fingerprint            node -e "const root=process.env.CLOUD_HOSTS_TEST_BACKEND;console.log(JSON.stringify(require(root+'/src/release.cjs').verify(root)))"
run codesign-verify                codesign --verify --deep --strict --verbose=2 "$APP"

printf '\n--- suite summary ---\n'
cat "$SUMMARY"
if grep -q FAIL "$SUMMARY"; then exit 1; fi
node - "$OUT/candidate-pin.json" <<'PYVERIFY'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pin=JSON.parse(fs.readFileSync(process.argv[2]));
assert.equal(require(path.join(pin.backend,'src/release.cjs')).verify(pin.backend).buildId,pin.buildId,'candidate changed during acceptance');
PYVERIFY
printf 'CANDIDATE_ACCEPTANCE all suites passed\n' 
