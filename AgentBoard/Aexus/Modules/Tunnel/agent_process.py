"""Run one Coding Agent CLI over the existing SSH policy, with raw stdio and no PTY."""
import base64
import json
import os
import re
import shlex
import sys
import subprocess
import zlib
from pathlib import Path

# Embedded Python / isolated mode does not add the script directory to sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import transport


def command(config, engine, args):
    if engine not in ("codex", "claude"):
        raise ValueError("Unknown remote Coding Agent")
    if not isinstance(args, list) or any(not isinstance(arg, str) or "\0" in arg for arg in args):
        raise ValueError("Invalid remote CLI arguments")
    directory = config["directory"]
    cli_bin=config.get("cli_bin")
    if config["os"] == "windows":
        quote = lambda value: "'" + value.replace("'", "''") + "'"
        script = (("$env:PATH="+quote(cli_bin)+"+';'+$env:PATH;" if cli_bin else "") +
            "$ErrorActionPreference='Stop';"
            "[Console]::OutputEncoding=[Text.UTF8Encoding]::new();"
            "$OutputEncoding=[Console]::OutputEncoding;"
            "$env:PATH=$env:PATH+\";$HOME\\.local\\bin;$env:APPDATA\\npm\";"
            f"Set-Location -LiteralPath {quote(directory)};"
            f"& {engine} {' '.join(quote(arg) for arg in args)}; exit $LASTEXITCODE"
        )
        encoded = base64.b64encode(script.encode("utf-16le")).decode()
        return "powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand " + encoded
    setup = (
        'export PATH="$PATH:$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.bun/bin:'
        '$HOME/.local/node-current/bin:/opt/homebrew/bin:/usr/local/bin";'
        'if [ -f "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null 1>&2;'
        ' nvm use --silent default >/dev/null 1>&2 || true; fi;'
    )
    if cli_bin: setup += "export PATH="+shlex.quote(cli_bin)+':"$PATH";'
    script = setup + f"cd {shlex.quote(directory)} || exit 98; exec {shlex.join([engine, *args])}"
    return shlex.join(["bash", "-c", script])


DELETE_CLAUDE_SESSION = """
import json,os,pathlib,re,shutil,sys
session=sys.argv[1]
if not re.fullmatch(r'[0-9a-fA-F-]{36}',session): raise ValueError('Invalid session ID')
root=pathlib.Path(os.environ.get('CLAUDE_CONFIG_DIR') or pathlib.Path.home()/'.claude')
count=0
projects=root/'projects'
if projects.is_dir():
 for project in projects.iterdir():
  if not project.is_dir() or project.is_symlink(): continue
  file=project/(session+'.jsonl')
  if file.exists() or file.is_symlink(): file.unlink();count+=1
  children=project/session
  if children.is_dir() and not children.is_symlink(): shutil.rmtree(children);count+=1
  index=project/'sessions-index.json'
  if index.is_file() and not index.is_symlink():
   value=json.loads(index.read_text(encoding='utf-8'))
   entries=value.get('entries')
   if isinstance(entries,list):
    kept=[entry for entry in entries if entry.get('sessionId')!=session]
    if len(kept)!=len(entries):
     value['entries']=kept;temp=index.with_name(index.name+'.agents-company-tmp')
     temp.write_text(json.dumps(value,indent=2)+'\\n');os.replace(temp,index);count+=1
history=root/'history.jsonl'
if history.is_file() and not history.is_symlink():
 lines=history.read_text(encoding='utf-8').splitlines(keepends=True)
 def keep(line):
  try:return json.loads(line).get('sessionId')!=session
  except ValueError:return True
 remaining=[line for line in lines if keep(line)]
 if len(remaining)!=len(lines):
  temp=history.with_name(history.name+'.agents-company-tmp')
  temp.write_text(''.join(remaining),encoding='utf-8');os.replace(temp,history);count+=1
print(json.dumps({'deleted':count}))
"""

READ_CLAUDE_SESSION = """
import json,os,pathlib,re,sys
session=sys.argv[1]
if not re.fullmatch(r'[0-9a-fA-F-]{36}',session): raise ValueError('Invalid session ID')
root=pathlib.Path(os.environ.get('CLAUDE_CONFIG_DIR') or pathlib.Path.home()/'.claude')/'projects'
files=list(root.glob('*/'+session+'.jsonl')) if root.is_dir() else []
if len(files)!=1 or files[0].is_symlink(): raise FileNotFoundError('Claude session not found or ambiguous')
file=files[0]
if file.stat().st_size>4000000: raise ValueError('Claude session exceeds 4 MB history limit')
cwd=None;items=[]
for line in file.read_text(encoding='utf-8').splitlines():
 try: event=json.loads(line)
 except ValueError: continue
 cwd=cwd or event.get('cwd')
 role=event.get('type')
 if role not in ('user','assistant'): continue
 content=(event.get('message') or {}).get('content')
 text=content if isinstance(content,str) else '\\n'.join(part.get('text','') for part in content or [] if isinstance(part,dict) and part.get('type')=='text')
 if text:items.append({'role':role,'text':text})
print(json.dumps({'sessionId':session,'cwd':cwd,'items':items}))
"""

LIST_CLAUDE_SESSIONS = """
import json,os,pathlib,re
root=pathlib.Path(os.environ.get('CLAUDE_CONFIG_DIR') or pathlib.Path.home()/'.claude')/'projects'
sessions=[]
for file in root.glob('*/*.jsonl') if root.is_dir() else []:
 if not re.fullmatch(r'[0-9a-fA-F-]{36}',file.stem) or file.is_symlink():continue
 cwd=None;preview=''
 try:
  with file.open() as source:
   for line in source:
    event=json.loads(line);cwd=cwd or event.get('cwd')
    if event.get('type')=='user':
     content=(event.get('message') or {}).get('content')
     if isinstance(content,str):preview=content[:120]
     elif isinstance(content,list):preview=' '.join(part.get('text','') for part in content if isinstance(part,dict) and part.get('type')=='text')[:120]
     break
 except (ValueError,OSError):continue
 sessions.append({'id':file.stem,'cwd':cwd,'preview':preview,'updatedAt':file.stat().st_mtime})
sessions.sort(key=lambda item:item['updatedAt'],reverse=True)
print(json.dumps({'sessions':sessions[:100]}))
"""


def session_command(config, session, operation):
    if operation != "list" and not re.fullmatch(r"[0-9a-fA-F-]{36}", session):
        raise ValueError("Invalid session ID")
    source = base64.b64encode((DELETE_CLAUDE_SESSION if operation == "delete" else READ_CLAUDE_SESSION if operation == "read" else LIST_CLAUDE_SESSIONS).encode()).decode()
    code = f"import base64;exec(base64.b64decode({source!r}))"
    args = [code] + ([] if operation == "list" else [session])
    if config["os"] == "windows":
        quote = lambda value: "'" + value.replace("'", "''") + "'"
        script = "& python -c " + " ".join(quote(value) for value in args) + "; exit $LASTEXITCODE"
        return "powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand " + base64.b64encode(script.encode("utf-16le")).decode()
    return shlex.join(["python3", "-c", *args])


ACCESS_BOOTSTRAP = r"""
import json,pathlib,os
request=json.load(sys.stdin)
root=pathlib.Path(request['target']['directory']).resolve()
for item in request['files']:
 file=pathlib.Path(item['path']); file.resolve().relative_to(root)
 if file.is_symlink():raise ValueError('Documentation symlinks cannot be replaced')
 file.parent.mkdir(parents=True,exist_ok=True)
 file.write_text(item['content'],encoding='utf-8');file.chmod(item['mode'])
# Only remove previously generated root-level sections; handbooks now live in the hidden employee folder.
for name in ('AGENTS.md','CLAUDE.md'):
 file=root/name;file.resolve().relative_to(root)
 if not file.exists():continue
 if file.is_symlink():raise ValueError('Documentation symlinks cannot be replaced')
 content=file.read_text(encoding='utf-8')
 begin='<!-- agents-control:'+request['employeeId']+' -->';end='<!-- /agents-control:'+request['employeeId']+' -->'
 a,b=content.find(begin),content.find(end)
 if a>=0 and b>=a:
  content=content[:a]+content[b+len(end):]
  if content.strip():file.write_text(content,encoding='utf-8')
  else:file.unlink()
print(json.dumps({'ready':True}))
"""

def main():
    if sys.argv[1] == 'access-bootstrap':
        payload=json.load(sys.stdin); config=payload['target']
        source=base64.b64encode(zlib.compress(ACCESS_BOOTSTRAP.encode())).decode()+'\n'+json.dumps(payload)
        result=subprocess.run(transport.server_command(config),input=source,text=True,capture_output=True,timeout=18,env=transport.ssh_env(config))
        if result.returncode:sys.stderr.write(result.stderr)
        sys.exit(result.returncode)
    if sys.argv[1] == 'gateway':
        payload=json.loads(base64.urlsafe_b64decode(sys.argv[2]+'=='));config=payload['target'];args=transport.ssh_args(config)
        argv=args[:-1]+['-N','-o','ExitOnForwardFailure=yes','-R','0:127.0.0.1:'+str(payload['port']),args[-1]]
        os.execvpe('ssh',argv,transport.ssh_env(config))
    operation = sys.argv[1] if sys.argv[1] in ("delete", "read", "list") else "run"
    payload = json.loads(base64.urlsafe_b64decode(sys.argv[2 if operation != "run" else 1] + "=="))
    config = payload["target"]
    remote = session_command(config, payload.get("sessionId"), operation) if operation != "run" else command(config, payload["engine"], payload["args"])
    argv = transport.ssh_args(config) + [remote]
    os.execvpe("ssh", argv, transport.ssh_env(config))


if __name__ == "__main__":
    main()
