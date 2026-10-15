import base64
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import tempfile
import threading
import time

# Windows ConPTY/PowerShell test. No SSH host or user data required.
exe = Path(__file__).with_name('ConPtyTerminal.exe')
if not exe.exists():
    exe = Path(__file__).resolve().parents[1] / 'backend' / 'Windows' / 'ConPtyTerminal.exe'
if not exe.is_file():
    raise FileNotFoundError('Packaged ConPTY helper not found: ' + str(exe))
with tempfile.TemporaryDirectory(prefix='cloudhosts-local-conpty-') as directory:
    config=Path(directory)/'conpty.json'
    config.write_text(json.dumps({'cwd':directory,'cols':105,'rows':30,'remote':None}),encoding='utf-8')
    p=subprocess.Popen([str(exe),str(config)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
    q=queue.Queue()
    def reader():
        for line in p.stdout:
            try:q.put(json.loads(line.decode('utf-8-sig')))
            except Exception as e:q.put({'decodeError':str(e)})
    threading.Thread(target=reader,daemon=True).start()
    data=b''; acknowledged=False; exited=False
    try:
        time.sleep(1)
        command={'op':'input','inputId':1,'data':'Write-Output CLOUDHOSTS_LOCAL_CONPTY_OK\r'}
        p.stdin.write((json.dumps(command)+'\n').encode());p.stdin.flush()
        deadline=time.monotonic()+20
        while time.monotonic()<deadline:
            try:item=q.get(timeout=.5)
            except queue.Empty:continue
            if item.get('inputId')==1:acknowledged=True
            if 'data' in item:data+=base64.b64decode(item['data'])
            if 'exitCode' in item:exited=True;break
            if acknowledged and b'CLOUDHOSTS_LOCAL_CONPTY_OK' in data:break
        print('LOCAL_CONPTY_OUTPUT='+str(b'CLOUDHOSTS_LOCAL_CONPTY_OK' in data))
        print('LOCAL_CONPTY_ACK='+str(acknowledged))
        print('LOCAL_CONPTY_EXITED='+str(exited))
        if not acknowledged or b'CLOUDHOSTS_LOCAL_CONPTY_OK' not in data:raise AssertionError('ConPTY input acknowledgement or PowerShell output missing')
    finally:
        try:p.stdin.write((json.dumps({'op':'close'})+'\n').encode());p.stdin.flush()
        except Exception:pass
        try:p.communicate(timeout=4)
        except subprocess.TimeoutExpired:p.kill()
