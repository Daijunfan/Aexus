# Run only in a disposable Windows developer directory; no persistent host data is changed.
import base64
import json
import pathlib
import queue
import subprocess
import sys
import tempfile
import threading
import time

def main():
    root=pathlib.Path(__file__).resolve().parent
    with tempfile.TemporaryDirectory(prefix='cloudhosts-conpty-') as folder:
        config=pathlib.Path(folder)/'session.json'
        config.write_text(json.dumps({'cwd':folder,'remote':None if '--local' in sys.argv else {'host':'GPU-server','os':'linux','directory':'/home/djf'},'cols':100,'rows':28}),encoding='utf-8')
        child=subprocess.Popen([str(root/'ConPtyTerminal.exe'),str(config)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
        messages=queue.Queue()
        output=[]
        error=[]
        def read_messages():
            for raw in child.stdout:
                try:messages.put(json.loads(raw))
                except Exception as exc:messages.put({'error':str(exc),'raw':raw.decode(errors='replace')})
        def read_stderr():
            for raw in child.stderr:error.append(raw.decode(errors='replace'))
        threading.Thread(target=read_messages,daemon=True).start()
        threading.Thread(target=read_stderr,daemon=True).start()
        def command(value):
            child.stdin.write((json.dumps(value,ensure_ascii=False)+'\n').encode('utf8'))
            child.stdin.flush()
        try:
            # Wait for the real remote Bash prompt before entering text.
            ready=False
            until=time.monotonic()+3
            while time.monotonic()<until:
                try:item=messages.get(timeout=.5)
                except queue.Empty:continue
                if 'data' in item:
                    output.append(base64.b64decode(item['data']))
                    if b'@' in b''.join(output) and (b'$ ' in b''.join(output) or b'# ' in b''.join(output)):
                        ready=True;break
                elif 'exitCode' in item:raise RuntimeError('Terminal ended during login: '+repr(item))
            if not ready:
                print('OUTPUT_TAIL='+repr(b''.join(output)[-2000:]))
                print('STDERR_TAIL='+repr(error[-10:]))
                print('Continue with PTY input probe without prompt')
            local='--local' in sys.argv
            command({'op':'resize','cols':115,'rows':33})
            command({'op':'input','inputId':1,'data':("Write-Output CLOUDHOSTS_PTY_OK\r" if local else "printf '\\nCLOUDHOSTS_PTY_OK\\n'; stty size\r")})
            got_ack=False
            matched=False
            until=time.monotonic()+15
            while time.monotonic()<until:
                try:item=messages.get(timeout=.4)
                except queue.Empty:continue
                if item.get('inputId')==1:got_ack=True
                if 'data' in item:
                    output.append(base64.b64decode(item['data']))
                    data=b''.join(output)
                    if b'CLOUDHOSTS_PTY_OK' in data and (local or b'33 115' in data):
                        matched=True
                        if got_ack:break
                if 'exitCode' in item:break
            if not (matched and got_ack):
                raise AssertionError('Missing ack/resize or command output. ack='+repr(got_ack)+', tail='+repr(b''.join(output)[-350:])+', errors='+repr(error[-2:]))
            print('CONPTY_SSH_TEST=PASS')
            print('INPUT_ACK=PASS')
            print('REMOTE_RESIZE=PASS')
        finally:
            try:command({'op':'close'})
            except OSError:pass
            try:child.communicate(timeout=5)
            except subprocess.TimeoutExpired:child.kill()
            if error:print('STDERR_TAIL='+str(error[-2:]),file=sys.stderr)
if __name__=='__main__':
    main()
