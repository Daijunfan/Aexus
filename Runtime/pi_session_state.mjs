// Original Pi lifecycle metadata only. No model messages, tools or settings.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const file=path.join(path.dirname(fileURLToPath(import.meta.url)),'state.json');
export default function(pi){
 pi.on('session_start',(_event,context)=>{
  const state={sessionId:context.sessionManager.getSessionId()};
  fs.writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});
  fs.renameSync(file+'.tmp',file);
 });
}
