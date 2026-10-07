import fs from 'node:fs'
import path from 'node:path'

export type TunnelTool={name:string;description:string;inputSchema:Record<string,unknown>}
export type TunnelToolCall={toolName:string;toolCallId:string;input:Record<string,unknown>}

/** Pi's documented extension-UI RPC carries tool results back from Core.
 * The existing permission hook runs first; the extension has no local I/O tools. */
export function preparePiTunnel(directory:string,tools:TunnelTool[],additionalTools:string[]=[]){
  const file=path.join(directory,'company-tunnel.mjs')
  fs.writeFileSync(file,`
export default function(pi){
  const tools=${JSON.stringify(tools)},additional=${JSON.stringify(additionalTools)};
  for(const tool of tools){
    pi.registerTool({name:'tunnel__'+tool.name,label:'Tunnel '+tool.name,description:tool.description,parameters:tool.inputSchema,
      async execute(toolCallId,input,signal,_onUpdate,ctx){
        if(signal?.aborted)throw Error('Interrupted');
        const value=await ctx.ui.input('Aexus Tunnel',JSON.stringify({toolName:'tunnel__'+tool.name,toolCallId,input}));
        if(signal?.aborted||value===undefined)throw Error('Tunnel request cancelled');
        const result=JSON.parse(value);
        if(result.isError)throw Error(result.content.map(part=>part.text??'').join('\\n'));
        return {content:result.content,details:undefined};
      }
    });
  }
  pi.on('session_start',()=>pi.setActiveTools([...tools.map(tool=>'tunnel__'+tool.name),...additional]));
  pi.on('tool_call',event=>{if(!additional.includes(event.toolName)&&!tools.some(tool=>event.toolName==='tunnel__'+tool.name))return {block:true,reason:'Cloud employees must use Tunnel tools'}});
}
`,{mode:0o600})
  return file
}
