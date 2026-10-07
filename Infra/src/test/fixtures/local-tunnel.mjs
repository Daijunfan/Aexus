import fs from 'node:fs'
import path from 'node:path'
/** Deterministic transport fixture using the real remote filesystem protocol locally. */
export function localTunnel(directory,root){
  fs.mkdirSync(directory,{recursive:true})
  for(const name of ['workspace_files.py','remote.py'])fs.copyFileSync(path.join(root,'Infra/src/tunnel',name),path.join(directory,name))
  fs.writeFileSync(path.join(directory,'bridge.py'),`import sys,json,pathlib,base64
root=pathlib.Path(__file__).resolve().parent
if sys.argv[1]=='serve':
 CONFIG=json.loads(base64.urlsafe_b64decode(sys.argv[2]))
 exec((root/'workspace_files.py').read_text(encoding='utf-8'),globals())
 exec((root/'remote.py').read_text(encoding='utf-8'),globals())
else:
 data=json.load(sys.stdin);target=data['target'];operation=sys.argv[1]
 if operation in ['check','ping']:
  print(json.dumps({'connected':True,'info':'Local protocol fixture','environment':{'os':target['os'],'hostname':'fixture'}}))
 elif operation=='prepare':
  config=base64.urlsafe_b64encode(json.dumps(target).encode()).decode()
  print(json.dumps({'cwd':target['directory'],'args':[],'server':{'command':sys.executable,'args':[str(root/'bridge.py'),'serve',config]},'instructions':'Local filesystem protocol fixture'}))
 else: raise ValueError('Unsupported fixture operation: '+operation)
`)
  return directory
}
