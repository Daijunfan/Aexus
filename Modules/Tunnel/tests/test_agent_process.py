import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import agent_process


class AgentProcessTest(unittest.TestCase):
    def test_ssh_stdio_stays_clean_and_runs_in_remote_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            remote = base / "remote folder"
            remote.mkdir()
            (base / "ssh").write_text('#!/bin/sh\nfor arg in "$@"; do last="$arg"; done\nexec sh -c "$last"\n')
            (base / "codex").write_text('#!/bin/sh\nprintf "{\\"cwd\\":\\"%s\\",\\"input\\":\\"" "$(pwd)"\nread value\nprintf "%s\\"}\\n" "$value"\n')
            for name in ("ssh", "codex"):
                (base / name).chmod(0o755)
            config = {"host": "fixture", "directory": str(remote), "os": "linux"}
            encoded = base64.urlsafe_b64encode(json.dumps({"target": config, "engine": "codex", "args": ["app-server", "--listen", "stdio://"]}).encode()).decode().rstrip("=")
            env = {**os.environ, "HOME": str(base), "PATH": str(base) + os.pathsep + os.environ["PATH"]}
            result = subprocess.run([sys.executable, str(ROOT / "agent_process.py"), encoded], input="hello\n", text=True, capture_output=True, env=env, timeout=8)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(result.stdout,repr((result.stdout,result.stderr,result.returncode)))
            self.assertEqual(json.loads(result.stdout), {"cwd": str(remote), "input": "hello"})
            self.assertEqual(result.stderr, "")

    def test_command_rejects_unknown_engine_and_quotes_paths(self):
        config = {"host": "fixture", "directory": "/home/djf/a folder", "os": "linux"}
        self.assertIn("a folder", agent_process.command(config, "codex", ["app-server"]))
        with self.assertRaisesRegex(ValueError, "Unknown"):
            agent_process.command(config, "bash", ["-c", "echo local"])

    def test_remote_claude_delete_targets_only_one_session(self):
        with tempfile.TemporaryDirectory() as temporary:
            base=Path(temporary);project=base/'.claude/projects/fixture';project.mkdir(parents=True)
            session='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
            (project/(session+'.jsonl')).write_text(json.dumps({'type':'user','cwd':str(base),'message':{'content':'请看一下目录'}})+'\n'+json.dumps({'type':'assistant','cwd':str(base),'message':{'content':[{'type':'text','text':'目录已确认'}]}})+'\n');(project/(other+'.jsonl')).write_text('keep\n')
            (project/'sessions-index.json').write_text(json.dumps({'entries':[{'sessionId':session},{'sessionId':other}]}))
            (base/'.claude/history.jsonl').write_text(json.dumps({'sessionId':session})+'\n'+json.dumps({'sessionId':other})+'\n')
            (base/'ssh').write_text('#!/bin/sh\nfor arg in "$@"; do last="$arg"; done\nexec sh -c "$last"\n');(base/'ssh').chmod(0o755)
            payload=base64.urlsafe_b64encode(json.dumps({'target':{'host':'fixture','os':'linux','directory':str(base)},'sessionId':session}).encode()).decode().rstrip('=')
            env={**os.environ,'HOME':str(base),'PATH':str(base)+os.pathsep+os.environ['PATH']}
            listing=base64.urlsafe_b64encode(json.dumps({'target':{'host':'fixture','os':'linux','directory':str(base)}}).encode()).decode().rstrip('=')
            listed=subprocess.run([sys.executable,str(ROOT/'agent_process.py'),'list',listing],text=True,capture_output=True,env=env,timeout=8)
            self.assertEqual(listed.returncode,0,listed.stderr)
            self.assertTrue(any(item['id']==session and item['cwd']==str(base) for item in json.loads(listed.stdout)['sessions']))
            read=subprocess.run([sys.executable,str(ROOT/'agent_process.py'),'read',payload],text=True,capture_output=True,env=env,timeout=8)
            self.assertEqual(read.returncode,0,read.stderr)
            self.assertEqual(json.loads(read.stdout)['items'],[{'role':'user','text':'请看一下目录'},{'role':'assistant','text':'目录已确认'}])
            result=subprocess.run([sys.executable,str(ROOT/'agent_process.py'),'delete',payload],text=True,capture_output=True,env=env,timeout=8)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertGreater(json.loads(result.stdout)['deleted'],0)
            self.assertFalse((project/(session+'.jsonl')).exists());self.assertTrue((project/(other+'.jsonl')).exists())
            self.assertEqual(json.loads((project/'sessions-index.json').read_text())['entries'],[{'sessionId':other}])


if __name__ == "__main__":
    unittest.main()
