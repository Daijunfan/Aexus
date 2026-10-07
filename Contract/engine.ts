import {CONTRACT_VERSION,contractError} from './protocol'
export type EngineManifest={id:string;name:string;version:string;contractVersion:typeof CONTRACT_VERSION;description:string;ui:'Page.tsx';cli:'cli.mjs';runtime?:'runtime.mjs';requiredCommands:string[];inputSchema:Record<string,unknown>;outputSchema:Record<string,unknown>}
export type EngineEntry=EngineManifest&{directory:string}
export function validateEngineManifest(value:unknown,directory?:string):EngineManifest{
 const v=value as EngineManifest
 const fields=['id','name','version','contractVersion','description','ui','cli','runtime','requiredCommands','inputSchema','outputSchema']
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.includes(key)))throw contractError('ENGINE_MANIFEST_INVALID','Engine manifest has unsupported fields')
 if(!v||typeof v!=='object'||typeof v.id!=='string'||!/^([A-Za-z][A-Za-z0-9]*)(-[A-Za-z0-9]+)*$/.test(v.id)||directory&&v.id!==directory)throw contractError('ENGINE_MANIFEST_INVALID','Engine id must match its directory and use a safe alphanumeric slug')
 if(v.contractVersion!==CONTRACT_VERSION)throw contractError('CONTRACT_VERSION_UNSUPPORTED','Engine requires an unsupported Contract version')
 if(!v.name||typeof v.name!=='string'||!v.description||typeof v.description!=='string'||!/^\d+\.\d+\.\d+$/.test(v.version))throw contractError('ENGINE_MANIFEST_INVALID','Engine requires a name, description and semantic version')
 if(v.ui!=='Page.tsx'||v.cli!=='cli.mjs'||v.runtime!==undefined&&v.runtime!=='runtime.mjs')throw contractError('ENGINE_MANIFEST_INVALID','Engine entrypoints must be Page.tsx and cli.mjs')
 if(!Array.isArray(v.requiredCommands)||v.requiredCommands.some(c=>typeof c!=='string'||!c)||new Set(v.requiredCommands).size!==v.requiredCommands.length||!v.inputSchema||typeof v.inputSchema!=='object'||Array.isArray(v.inputSchema)||!v.outputSchema||typeof v.outputSchema!=='object'||Array.isArray(v.outputSchema))throw contractError('ENGINE_MANIFEST_INVALID','Engine requires declared commands, inputSchema and outputSchema')
 return v
}
